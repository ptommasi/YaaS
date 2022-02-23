import { BrowserContext, Page, Protocol, CDPSession } from "puppeteer";
import { solveAmazonCaptcha } from "../../utils/amazon/captcha-detector";
import { logger, loggerWithId } from "../../utils/logger";
import { lastRequestHeadersCollector } from "../../browser-management/network-monitor";
import { createIncognitoBrowserContext } from "../../browser-management/puppeteer-launcher";
import { sleep } from "../../utils/basics";
import { getAmazonDomain } from "../../utils/amazon/simple-url-operations";
import { retryOnTimeout } from "../../browser-management/error-management";

export type Task = CreateTask | RestoreTask;

interface AbstractTask {
  logId: string;
  url: string;
  userAgent: string;
}

export interface CreateTask extends AbstractTask {
  type: "create";
  activity: (state: PageState) => Promise<void>;
}

export type RestoreActivity = (page: Page, getState: () => Promise<PageState>, close: () => Promise<void>) => Promise<void>;

export interface RestoreTask extends AbstractTask{
  type: "restore";
  state: PageState;
  activity: RestoreActivity;
}

export async function extractCookies(page: Page) {
  const cdp = (page as any)._client as CDPSession;
  const response = await cdp.send('Network.getAllCookies');
  const domain = getAmazonDomain(page.url());
  return response.cookies.filter(c => c.domain.indexOf(domain) >= 0);
}

export async function cleanCookies(page: Page) {

  const cdp = (page as any)._client as CDPSession;
  const response = await cdp.send('Network.getAllCookies');

  const amazonDomain = getAmazonDomain(page.url());

  for(let c of response.cookies) {
    if (c.domain.indexOf(amazonDomain) >= 0) {
      await cdp.send('Network.deleteCookies', { name: c.name, domain: c.domain });
    }
  }

}

export async function setCookies(page: Page, cookies: Protocol.Network.Cookie[]) {
  const cdp = (page as any)._client as CDPSession;
  await cdp.send('Network.setCookies', { cookies });
}

async function cleanState(browser: BrowserContext, url: string) {

  const page = await browser.newPage();

  page.removeAllListeners("request");

  await page.setRequestInterception(true);

  page.on('request', r => {
    r.respond({ status: 200, contentType: 'text/plain', body: 'Cleaning content...' });
  });

  await page.goto(url, { waitUntil: 'networkidle2' });

  await page.evaluate(() => { localStorage.clear();   });
  await page.evaluate(() => { sessionStorage.clear(); });

  await cleanCookies(page);
  await page.close();

}

async function extractApplicationState(browser: BrowserContext, page: Page) {

  const cookies         = await extractCookies(page);
  const localStorage    = await page.evaluate(() =>  Object.assign({}, window.localStorage));
  const sessionStorage  = await page.evaluate(() =>  Object.assign({}, window.sessionStorage));
  return { cookies, localStorage, sessionStorage };

}

async function isCaptchaPage(page: Page) {
  return await page.evaluate(() => { 
    const captchaNode = document.querySelector("#captchacharacters");
    return captchaNode !== null;
  });
}

async function isAskingForCookies(page: Page) {
  return await page.evaluate(async () => {
    const cookieQuestion = document.querySelector<HTMLFormElement>('#sp-cc-accept');
    return (cookieQuestion !== null);
  });
}

async function createEmptyState(id: string, browser: BrowserContext, url: string, userAgent: string) {

  await cleanState(browser, url);

  const page            = await browser.newPage();
  await page.setUserAgent(userAgent);
  await page.setJavaScriptEnabled(false);
  const collector       = await lastRequestHeadersCollector(page);
  await page.goto(url, { waitUntil: 'networkidle2' });

  if (await isCaptchaPage(page)) {
    loggerWithId.info(id, `[BrowserLocker] Captcha found when initializing ${url}, solving it first.`);
    await sleep(1000 * 60 * 60 * 24);
    await solveAmazonCaptcha(id, page);
  }

  if (await isAskingForCookies(page)) {
    await Promise.all([
      page.evaluate(async () => { document.querySelector<HTMLElement>('#sp-cc-accept').click() }),
      page.waitForNavigation({ waitUntil: "networkidle2" })
    ]);
    loggerWithId.info(id, `[BrowserLocker] Cookies found and accepted when initializing ${url}.`);
  }

  await page.reload({waitUntil: 'domcontentloaded'});

  const headers          = collector.getRequestHeaders();
  const applicationState = await extractApplicationState(browser, page);
  const state: PageState = { url, headers, ...applicationState };
  
  // loggerWithId.info(id, "Empty state headers step 2", collector.getRequestHeaders());

  await collector.close();
  await page.close();

  return state;

}

async function pushStateIntoBrowser(browser: BrowserContext, url: string, state: PageState, userAgent: string) {

  await cleanState(browser, url);

  const page = await browser.newPage();
  await page.setUserAgent(userAgent);
  
  page.removeAllListeners("request");

  await page.setRequestInterception(true);

  page.on('request', r => {
    r.respond({ status: 200, contentType: 'text/plain', body: 'Setting content...' });
  });

  await page.goto(url, {waitUntil: 'networkidle2'});

  await page.evaluate(values => {
    localStorage.clear();
    for (const key in values) { localStorage.setItem(key, values[key]); }
  }, state.localStorage);

  await page.evaluate(values => {
    sessionStorage.clear();
    for (const key in values) { sessionStorage.setItem(key, values[key]); }
  }, state.sessionStorage);

  await cleanCookies(page);
  await setCookies(page, state.cookies);

  await page.close();

}

/**
 * A browser locker is made to switch among different domains with their own cookies,
 * local storage and session storage without the need to create multiple browser.
 * When a calelr wants to use a domain, he must first lock it (call is blocking,
 * until it's not free it will be "queued"), and then it must unlock when finished.
 * Note that BrowserLocker provides facilities to extract or push the state (a 
 * state is the sum of a url, cookies, local and session storage), but the caller
 * must handle that logic.
 * Note that headers are included because they allow rest libraries to be used 
 * instead of puppeteer, enabling rest calls and saving tons of resources.
 */
export class BrowserLocker {

  private browser: BrowserContext;
  private lockedDomains = new Set<string>();
  private tasks: Task[] = [];

  async boot(groupLetter: string) {

    this.browser = await createIncognitoBrowserContext();
    const page = await this.browser.newPage();

    page.removeAllListeners("request");

    await page.setRequestInterception(true);
  
    page.on('request', r => {
      r.respond({ status: 200, contentType: 'text/plain', body: `Placeholder page for incognito group ${groupLetter}.` });
    });
  
    // Note that the page should be reachable, the DNS must not fail
    await page.goto("https://placeholder.com/");
  
    this.startPolling();

  }

  private async startPolling() {
    while (true) {
      const task = this.tasks.pop();
      task && await this.solveTask(task);
      await sleep(100);
    }
  }

  // async lockDomain(id: string, tld: string) {
  //   if (this.lockedDomains.has(tld)) {
  //     // loggerWithId.debug(id, `There is someone else using the browser in domain ${tld}, waiting...`);
  //     while(this.lockedDomains.has(tld)) {
  //       await sleep(50 + Math.random() * 100);
  //     }
  //     // loggerWithId.debug(id, `Waiting for domain ${tld} finished.`);
  //   }
  //   this.lockedDomains.add(tld);
  // }

  // async unlockDomain(tld: string) {
  //   this.lockedDomains.delete(tld);
  // }

  queueTask(task: Task) {
    this.tasks.push(task);
  }

  private async solveTask(task: Task) {

    if (task.type === "create") {
      const state = await this.createEmptyState(task.logId, task.url, task.userAgent);
      await task.activity(state);
    }

    if (task.type === "restore") {
      await this.pushStateIntoBrowser(task.url, task.state, task.userAgent);
      const page = await this.newPage(task.userAgent);
      const collector = await lastRequestHeadersCollector(page);
      await task.activity(
        page, 
        async () => {
          const applicationState = await this.extractApplicationState(page);
          const headers = collector.getRequestHeaders();
          const state = { url: task.url, headers, ...applicationState };
          return state;
        },
        async () => {
          await collector.close();
          await page.close();
        }
      );
    }

  }

  // @retryOnTimeout
  // private async cleanState(url: string) {
  //   return await cleanState(this.browser, url);
  // }

  // @retryOnTimeout
  private async createEmptyState(id: string, url: string, userAgent: string) {
    return await createEmptyState(id, this.browser, url, userAgent);
  }

  // @retryOnTimeout
  private async pushStateIntoBrowser(url: string, state: PageState, userAgent: string) {
    await pushStateIntoBrowser(this.browser, url, state, userAgent);
  }

  // @retryOnTimeout
  private async extractApplicationState(page: Page) {
    return await extractApplicationState(this.browser, page);
  }

  // @retryOnTimeout
  private async newPage(userAgent: string) {
    const page = await this.browser.newPage();
    await page.setUserAgent(userAgent);
    await page.setJavaScriptEnabled(false);
    return page;
  }

}