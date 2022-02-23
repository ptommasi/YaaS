import { lastRequestHeadersCollector } from "../../browser-management/network-monitor";
import { solveAmazonCaptcha } from "../../utils/amazon/captcha-detector";
import { Logger, logger, loggerWithId } from "../../utils/logger";
import { getCache, setCache } from "../../utils/caching";
import { BrowserContext, Page } from "puppeteer";
import { sleep } from "../../utils/basics";
import { getAmazonDomain } from "../../utils/amazon/simple-url-operations";
import { createIncognitoBrowserContext } from "../../browser-management/puppeteer-launcher";

interface HeadersManagerProps {
  id:  string;
  url: string;
}

interface ReloadResult {
  withCaptcha: boolean;
  with503: boolean;
}

export class HeadersManager {

  private readonly id:      string;
  private readonly url:     string;

  private browser: BrowserContext;

  constructor(opt: HeadersManagerProps) {
    this.id        = opt.id;
    this.url       = opt.url;
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

  async reload(): Promise<Record<string, string>> {

    try {

      const logger = new Logger(this.id);

      const page = await this.browser.newPage();

      const collector = await lastRequestHeadersCollector(page);
      await page.goto(this.url, { waitUntil: "networkidle2" });
  
      if (await this.isCaptchaPage(page)) {

        logger.debug(`[Headers] During reload, captcha found at ${this.url}, solving it first.`);
        await solveAmazonCaptcha(this.id, page);

      } else if (await this.is503Page(page)) {

        logger.debug(`[Headers] During reload, I received a 503 at ${this.url}, I'll see if going to the root page will solve.`);
        const rootPage = `https://${getAmazonDomain(this.url)}/`;
        await page.goto(rootPage, { waitUntil: "networkidle2" });

        if (await this.is503Page(page)) {
          logger.error(`[Headers] After reload in the root page, still 503 at ${rootPage}. Can't do much.`);
          process.exit();
        } else if (await this.isCaptchaPage(page)) {
          logger.debug(`[Headers] During reload in the root page, after the 503, I now have captcha.`);
          await solveAmazonCaptcha(this.id, page);
        }

      } else {

        logger.debug(`[Headers] During reload, no captcha or 503 at ${this.url}.`);
        // Another reload to further refresh the headers
        await page.goto(this.url, { waitUntil: "networkidle2" });

      }
  
      const headers = collector.getRequestHeaders();
  
      await collector.close();
      await page.close();

      return headers as Record<string, string>;
    } catch (err) {
      logger.error("Error during reload.");
      throw err;
    }

  }

  async boot() {
    this.browser = await createIncognitoBrowserContext();
    this.createPlaceholder();
  }

  private async createPlaceholder() {

    const page = await this.browser.newPage();

    page.removeAllListeners("request");

    await page.setRequestInterception(true);
  
    page.on('request', r => {
      r.respond({ status: 200, contentType: 'text/plain', body: `Placeholder page for url ${this.url} (id ${this.id}).` });
    });

    // Note that the page should be reachable, the DNS must not fail
    await page.goto("https://placeholder.com/");

    return this;

  }

  async restart() {
    await this.browser.close();
    this.browser = await createIncognitoBrowserContext();
    this.createPlaceholder();
    return this.reload();
  }

}