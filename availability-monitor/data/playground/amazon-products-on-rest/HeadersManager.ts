import { lastRequestHeadersCollector } from "../../browser-management/network-monitor";
import { solveAmazonCaptcha } from "../../utils/amazon/captcha-detector";
import { Logger, logger, loggerWithId } from "../../utils/logger";
import { BrowserLocker } from "./BrowserLocker";
import { getCache, setCache } from "../../utils/caching";
import { Page } from "puppeteer";
import { sleep } from "../../utils/basics";
import { getAmazonDomain } from "../../utils/amazon/simple-url-operations";

interface HeadersManagerProps {
  id:             string;
  fixedMeta:      FixedMeta;
  browserLocker:  BrowserLocker;
}

interface ReloadResult {
  withCaptcha: boolean;
  with503: boolean;
}

export class HeadersManager {

  private readonly id:            string;
  private readonly rootUrl:       string;
  private readonly fixedMeta:     FixedMeta;
  private readonly browserLocker: BrowserLocker;

  private state:        PageState;
  private isReloading:  boolean;
  private isRestarting: boolean;

  constructor(opt: HeadersManagerProps) {
    this.id            = opt.id;
    this.fixedMeta     = opt.fixedMeta;
    this.browserLocker = opt.browserLocker;
    this.isReloading   = false;
    this.isRestarting  = false;
    this.rootUrl       = `https://www.amazon.${this.fixedMeta.tld}/`;
  }

  async boot() {

    const cacheState = await getCache<PageCachedState>(this.fixedMeta.cacheId);

    if(cacheState === null) {
      await this.browserLocker.lockDomain(this.id, this.fixedMeta.tld);
      this.state = await this.browserLocker.createEmptyState(this.id, this.rootUrl, this.fixedMeta.userAgent);
      await this.browserLocker.unlockDomain(this.fixedMeta.tld);
      await this.updateCache();
    } else {
      this.state = cacheState;
    }

    return this;

  }

  async updateCache() {
    await setCache<PageCachedState>(this.fixedMeta.cacheId, {
      url: this.rootUrl,
      meta: this.meta,
      headers: this.state.headers,
      cookies: this.state.cookies,
      localStorage: this.state.localStorage,
      sessionStorage: this.state.localStorage
    });
  }

  async isCaptchaPage(page: Page) {
    return await page.evaluate(() => { 
      const captchaNode = document.querySelector("#captchacharacters");
      return captchaNode !== null;
    })  
  }

  async is503Page(page: Page) {
    return await page.evaluate(() => { 
      const _503_links = [ ... document.querySelectorAll("a") ].filter(a => a.href.indexOf("ref=cs_503_") >= 0);
      return _503_links.length > 0;
    })  
  }

  private async waitAnyPendingReload() {
    while(this.isReloading) {
      await sleep(100);
    }
  }

  private async waitUrl(page: Page, url: string) {
    // Wait for the page to load, and stay at least for three seconds (if page loads too fast)
    await Promise.all([
      page.goto(url),
      page.waitForNavigation({ waitUntil: "domcontentloaded" }),
      sleep(3000),
    ]);
  }

  async reload(url: string) {

    await this.waitAnyPendingReload();

    try {

      this.isReloading = true;
      await this.browserLocker.lockDomain(this.id, this.fixedMeta.tld);

      const logger = new Logger(this.id);

      const result: ReloadResult = { withCaptcha: false, with503: false };


      await this.browserLocker.pushStateIntoBrowser(url, this.state, this.fixedMeta.userAgent);
  
      const page = await this.browserLocker.newPage(this.fixedMeta.userAgent);
      const collector = await lastRequestHeadersCollector(page);
      await this.waitUrl(page, url);
  
      if (await this.isCaptchaPage(page)) {
        logger.debug(`[Headers] During reload, captcha found at ${url}, solving it first.`);
        await solveAmazonCaptcha(this.id, page);
        result.withCaptcha = true;
      } else if (await this.is503Page(page)) {
        logger.debug(`[Headers] During reload, I received a 503 at ${url}.`);
        result.with503 = true;
        const rootPage = `https://${getAmazonDomain(url)}/`;
        await this.waitUrl(page, rootPage);
        if (await this.is503Page(page)) {
          logger.error(`[Headers] During reload, still 503 at ${rootPage}.`);
          // logger.error(`[Headers] Sleeping 1 hour because of two 503, just to enable debug.`);
          // await sleep(1000 * 60 * 60);
        } else if (await this.isCaptchaPage(page)) {
          logger.debug(`[Headers] During reload, first 503 found at ${url}, then captcha.`);
          await solveAmazonCaptcha(this.id, page);
          result.withCaptcha = true;  
        }
      } else {
        logger.debug(`[Headers] During reload, no captcha or 503 at ${url}.`);
        // Another reload to further refresh the headers
        await this.waitUrl(page, url);
      }
  
      const headers = collector.getRequestHeaders();
      const applicationState = await this.browserLocker.extractApplicationState(page);
      this.state = { ...this.state, headers, ...applicationState };
  
      await collector.close();
      await page.close();
      await this.updateCache();

      return result;

    } catch(err) {
      logger.error(`Error occurred during reload.`, err);
    } finally {
      await this.browserLocker.unlockDomain(this.fixedMeta.tld);
      this.isReloading = false;
    }


  }

  private async waitAnyPendingRestart() {
    while(this.isRestarting) {
      await sleep(100);
    }
  }

  async restart() {

    await this.waitAnyPendingRestart();

    try {

      this.isRestarting = true
  
      await this.browserLocker.lockDomain(this.id, this.fixedMeta.tld);
      this.state = await this.browserLocker.createEmptyState(this.id, this.rootUrl, this.fixedMeta.userAgent);
      await this.updateCache();

    } catch(err) {
      logger.error(`Error occurred during restart.`, err);
    } finally {
      await this.browserLocker.unlockDomain(this.fixedMeta.tld);
      this.isRestarting = false;
    }
    

  }

  public get headers() {
    return this.state.headers;
  }

  private get meta() {
    const now = Date.now();
    return {
      ...this.fixedMeta,
      timestamp: now,
      date: new Date(now).toLocaleString(),
    }
  }

  async didHeadersChange(oldHeaders: HeadersMap) {

    await this.waitAnyPendingReload();

    const newHeaders = this.headers;

    const oldKeys = Object.keys(oldHeaders);
    const newKeys = Object.keys(newHeaders);

    if (oldKeys.length !== newKeys.length) {
      return true;
    }

    return oldKeys.some(key => oldHeaders[key] !== newHeaders[key]);

  }


}