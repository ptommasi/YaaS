import { lastRequestHeadersCollector } from "../../browser-management/network-monitor";
import { solveAmazonCaptcha } from "../../utils/amazon/captcha-detector";
import { Logger, logger, loggerWithId } from "../../utils/logger";
import { BrowserLocker, RestoreActivity } from "./BrowserLocker";
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
  private readonly withCache:     boolean;

  private state:        PageState;
  

  constructor(opt: HeadersManagerProps) {
    this.id            = opt.id;
    this.fixedMeta     = opt.fixedMeta;
    this.browserLocker = opt.browserLocker;
    this.withCache     = false;
    this.rootUrl       = `https://www.amazon.${this.fixedMeta.tld}/`;
  }

  async boot(): Promise<void> {

    return new Promise(async (resolve, reject) => {

      const cacheState = await getCache<PageCachedState>(this.fixedMeta.cacheId);
  
      if(cacheState === null) {
        this.browserLocker.queueTask({ 
          type: "create",
          logId: this.id,
          url: this.rootUrl,
          userAgent: this.fixedMeta.userAgent,
          activity: async (state: PageState) => {
            this.state = state;
            await this.updateCache();
            resolve();
          }
        });
      } else {
        this.state = cacheState;
        resolve();
      }

    })

  }

  async updateCache() {
    if (this.withCache) {
      await setCache<PageCachedState>(this.fixedMeta.cacheId, {
        url: this.rootUrl,
        meta: this.meta,
        headers: this.state.headers,
        cookies: this.state.cookies,
        localStorage: this.state.localStorage,
        sessionStorage: this.state.localStorage
      });
    }
  }

  private async isCaptchaPage(page: Page) {
    return await page.evaluate(() => { 
      const captchaNode = document.querySelector("#captchacharacters");
      return captchaNode !== null;
    })  
  }

  private async is503Page(page: Page) {
    return await page.evaluate(() => { 
      const _503_links = [ ... document.querySelectorAll("a") ].filter(a => a.href.indexOf("ref=cs_503_") >= 0);
      return _503_links.length > 0;
    })  
  }

  async reload(url: string): Promise<void> {

    const logger = new Logger(this.id);

    return new Promise(async (resolve, reject) => {

      const activity: RestoreActivity = async (page, getState, close) => {
        await page.goto(url, { waitUntil: "networkidle2" });
        if (await this.isCaptchaPage(page)) {
          logger.debug(`[Headers] During reload, captcha found at ${url}, solving it first.`);
          await solveAmazonCaptcha(this.id, page);
        } else if (await this.is503Page(page)) {
          logger.debug(`[Headers] During reload, I received a 503 at ${url}.`);
          const rootPage = `https://${getAmazonDomain(url)}/`;
          await page.goto(rootPage, { waitUntil: "networkidle2" });
          if (await this.is503Page(page)) {
            logger.error(`[Headers] During reload, still 503 at ${rootPage}.`);
            // logger.error(`[Headers] Sleeping 1 hour because of two 503, just to enable debug.`);
            // await sleep(1000 * 60 * 60);
          } else if (await this.isCaptchaPage(page)) {
            logger.debug(`[Headers] During reload, first 503 found at ${url}, then captcha.`);
            await solveAmazonCaptcha(this.id, page);
          }
        } else {
          logger.debug(`[Headers] During reload, no captcha or 503 at ${url}.`);
          // Another reload to further refresh the headers
          await page.goto(url, { waitUntil: "networkidle2" });
        }
  
        this.state = await getState();

        await this.updateCache();

        await close();

        resolve();

      };
  
      this.browserLocker.queueTask({
        type: "restore",
        state: this.state,
        logId: this.id,
        url: this.rootUrl,
        userAgent: this.fixedMeta.userAgent,
        activity: activity
      })

    });

  }

  async restart(): Promise<void> {

    return new Promise((resolve, reject) => {

      this.browserLocker.queueTask({ 
        type: "create",
        logId: this.id,
        url: this.rootUrl,
        userAgent: this.fixedMeta.userAgent,
        activity: async (state: PageState) => {
          this.state = state;
          await this.updateCache();
          resolve();
        }

      });

    });

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

}