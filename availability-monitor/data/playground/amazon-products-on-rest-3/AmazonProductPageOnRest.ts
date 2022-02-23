import { Logger } from "../../utils/logger";
import { sleep } from "../../utils/basics";
import { swallowErrorsOnShutdown } from "../../browser-management/error-management";
import { AbstractWatcher } from "../AbstractWatcher";
import { getBody, postFormData, getUrl, BodyResponse } from "./rest-utils";
import { getHeadersSet } from "./rest-utils";
import { CookiesManager } from "./CookiesManager";
import { extractAllElements, extractAttribute, extractHtmlSnippet } from "../../utils/html-work";
import { isAmazonMerchant } from "./amazon-parser";
import { solveSimpleImageUrl } from "../../utils/captcha-solver";
import { inMinutes } from "../../utils/time";
import CookieParser from 'set-cookie-parser';
import { getCache, setCache } from "../../utils/caching";
import { playBipSound } from "../../utils/sound-player";
import { AxiosResponse } from "axios";
import chalk from "chalk";
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const open = require('open');

interface AmazonPageOnRestParams {
  tld: string;
  groupName: string;
  product: { asin: string; title: string; };
}

interface CacheData {
  logId: string;
  lastCheck: string;
  asin: string;
  title: string;
  tld: string;
  url: string;
  cookies: Record<string, CookieParser.Cookie>;
  requestHeaders: any;
}

export class AmazonProductPageOnRest extends AbstractWatcher {

  private readonly tld: string;
  private readonly product: { asin: string; title: string; };
  private readonly logId: string;
  private readonly groupName: string;
  private readonly withProxy = true;

  private readonly url: string;
  private readonly otherUrl: string;
  
  private readonly logger: Logger;
  private readonly cookiesManager: CookiesManager;
  
  private requestHeaders;
  private stop = false;
  private captchaCount = 0;
  private hitCount = 0;
  private errorsCount = 0;
  private botsDectionCount = 0;
  private startTime = Date.now();

  constructor(params: AmazonPageOnRestParams) {
    super();
    this.tld = params.tld;
    this.product = params.product;
    this.groupName = params.groupName;
    this.logId       = `rest-poller/${this.tld === "co.uk" ? "uk" : this.tld}/${this.product.asin}`;
    this.url      = `https://www.amazon.${this.tld}/_itm/dp/${this.product.asin}/`;
    this.otherUrl = `https://www.amazon.${this.tld}/gp/aod/ajax/ref=dp_aod_NEW_mbc?asin=${this.product.asin}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp`;
    this.logger = new Logger(this.logId);
    this.requestHeaders = getHeadersSet(0);

    const cache = getCache<CacheData>(this.logId);

    if (cache !== null) {
      this.logger.info("Cache found, session will resume from there.");
    }

    this.cookiesManager = new CookiesManager(cache !== null ? cache.cookies : undefined);

  }

  async prepare() {

    // this.logger.info(`Headers for chrome loaded for page ${this.url} (domain is ${this.tld}, gpu is ${this.product.title}).`);

    let result = await getBody(this.logId, `https://www.amazon.${this.tld}/`, this.makeHeaders(), this.withProxy);
    this.updateHeadersAndCache(result.response);
    let localBotDetections = 0;

    if (result.status === "bot_detected") {

      this.botsDectionCount++;
      localBotDetections++;
      this.logger.error(`Can't load root page www.amazon.${this.tld}, bot recognised, resetting cookies and trying again.`);
      this.cookiesManager.reset();

      await sleep(6000);

      result = await getBody(this.logId, `https://www.amazon.${this.tld}/`, this.makeHeaders(), this.withProxy, true);
      this.updateHeadersAndCache(result.response);

      if (result.status === "bot_detected") {
        this.botsDectionCount++;
        this.logger.error(`Bot caught twice in a row refreshing the root domain www.amazon.${this.tld}, sleeping for a day.`);
        this.logger.error(chalk.bold.red(`Bot detected too many times at ${this.url} (${this.product.title} in ${this.tld}), stopping attempts.`));
        this.stop = true;
        return;
      }
  
    }

    if (result.response.data.indexOf('"captchacharacters"') >= 0) {
      this.logger.info("During prepare, needs to solve captcha first.");
      await this.solveCaptcha(result.response.data);
      result = await getBody(this.logId, `https://www.amazon.${this.tld}/`, this.requestHeaders, this.withProxy);
      const explanation = ((status: number) => {
        if (status === 302) return `(302 usually means success, it's redirect because captcha was correct)`;
        if (status === 200) return `(200 usually means failure, captcha was wrong and the same page is kept)`;
        if (status === 503) return `(503 usually means bot detected)`;
        return `(no explanation for status ${status})`;
      })(result.response.status);
      this.logger.info(`Response status after captcha is ${result.response.status} ${explanation}`);
    }

    const cookieBanner = extractHtmlSnippet(result.response.data, '<form id="sp-cc"', "form");

    if (cookieBanner !== null) {

      const inputs = extractAllElements(cookieBanner, "<input");

      const formData = inputs.map(inputTag => ({
        name:  extractAttribute(inputTag, "name" ),
        value: extractAttribute(inputTag, "value")
      }));

      await sleep(6000);

      const response = await postFormData(this.logId, `https://www.amazon.${this.tld}/cookieprefs?ref_=portal_banner_all`, this.makeHeaders(), formData, this.withProxy);
      this.updateHeadersAndCache(response);

      // if (response.status === 302) {
      //   this.logger.info("Need to go to ", response.headers.location);
      // }

      this.logger.info(`Cookies accepted and page ready for ${this.url} (${this.product.title} in ${this.tld}).`);

    } else {
      this.logger.info(`No need to accept cookies (no banner found), page ready for ${this.url} (${this.product.title} in ${this.tld}).`);
    }

    if (this.botsDectionCount > 0) {

      await sleep(6000);
      result = await getBody(this.logId, `https://www.amazon.${this.tld}/`, this.makeHeaders(), this.withProxy);
      this.updateHeadersAndCache(result.response);
  
      if (result.status === "bot_detected") {
        this.botsDectionCount++;
        localBotDetections++;
        if (localBotDetections)
        this.logger.error(`Bot caught twice in a row refreshing the root domain www.amazon.${this.tld}, sleeping for a day.`);
        this.logger.error(chalk.bold.red(`Bot detected too many times at ${this.url} (${this.product.title} in ${this.tld}), stopping attempts.`));
        this.stop = true;
        return;
      } else {
        this.logger.error(`Domain www.amazon.${this.tld} recognised the bot and gave a captcha, but it's all fine now.`);
      }

    }

  }

  // @retryOnTimeout
  @swallowErrorsOnShutdown
  async start() {

    const url = this.url;
    const title = this.product.title;
    // let consecutiveReloads = 0;

    while (true && !this.stop) {

      const result = await getBody(this.logId, this.url, this.makeHeaders(), true);
      this.updateHeadersAndCache(result.response);

      if (result.status !== "ok") {
        this.errorsCount++;
        if (result.response?.status) {
          this.logger.warn(`Error '${result.response?.status}' returned (${this.status()}.`);
        } else {
          this.logger.warn(`Error in the rest (no response available, inner status is ${result.status}, ${this.status()}).`);
        }
        if (result.status === "bot_detected") {
          this.botsDectionCount++;
          this.logger.error(`Bot has been detected, I'll reload www.amazon.${this.tld} root page first.`);
          await sleep(6000);
          await this.prepare();
          await sleep(6000);
          continue;
        } else if (result.status === "ignore_error") {
          await sleep(6000);
          continue;
        } else if (result.status === "unknown") {
          this.logger.error("Unkown error.");
          await sleep(6000);
          continue;
        }
      }

      const merchantResult = isAmazonMerchant(result.response.data);

      if (merchantResult === "CaptchaActive") {
        // this.logger.info("Need to solve captcha first.");
        await this.solveCaptcha(result.response.data);
        continue;
      }
      
      const time = Date.now();

      this.hitCount++;
      // this.logger.info("One round of REST.");

      if (this.hitCount % 100 === 0) {
        this.logger.info(`${this.hitCount} checks completed so far (${this.status()}).`);
      }

      this._onHeartbeat.trigger({ time, type: "link", origin: "amazon-product-v3", link: { url, title } });

      if (merchantResult === "FromAmazon") {
        playBipSound();
        await open(this.url);
        this._onItemFound.trigger({ time, url, title, price: "", parsedPrice: null, origin: "amazon-product-v2", priceLimit: null });
      }

      if (merchantResult === "NoMerchantElement") {
        this.logger.error(`No idea what's going at link ${this.url}, no merchant element (#merchant-info). Probably not available.`);
        // this.logger.info(`Content of ${this.url} is (fetched indipendently again): `, await getBody(this.id, this.url, requestHeaders, true));
        // throw new Error("No idea what's going on.");
      }

      if ([ "NotFromAmazon", "MaybeOtherOffers", "FromAmazon", "NoMerchantElement" ].indexOf(merchantResult)) {
        // Reset the captcha count
        // consecutiveReloads = 0;
      }

      !this.stop && await sleep(2000 + Math.floor(Math.random() * 3000));

    }
  }

  @swallowErrorsOnShutdown
  async shutdown() {
    this.stop = true;
  }

  private makeHeaders() {
    if (this.cookiesManager.hasCookies) {
      return { ...this.requestHeaders, cookie: this.cookiesManager.getCookieString() }
    } else {
      return this.requestHeaders;
    }
  }

  private status() {
    return `status: ${this.hitCount} checks, ${this.captchaCount} captchas, ${this.botsDectionCount} bot detections, ${this.errorsCount} errors / warnings, running time is ${inMinutes(Date.now() - this.startTime)}`;
  }

  private async solveCaptcha(body: string) {

    this.captchaCount++;

    this.logger.info(`Captcha asked (status: ${this.status()}).`);

    const captchaFormId = '<form method="get" action="/errors/validateCaptcha"';
    const captchaContent = extractHtmlSnippet(body, captchaFormId, "form");
    if (captchaContent === null) {
      this.logger.error("I should have extracted the captcha form, but I didn't: ", body);
      throw Error("Failed to extract captcha form.");
    }

    let targetLink = `https://www.amazon.${this.tld}/errors/validateCaptcha?`;
    const inputs = extractAllElements(captchaContent, "<input");

    inputs.forEach(inputTag => {
      const name =  extractAttribute(inputTag, "name" );
      const value = extractAttribute(inputTag, "value");
      if (name !== null && value !== null) {
        targetLink = targetLink + `${name}=${encodeURIComponent(JSDOM.fragment(value).textContent)}&`;
      }
    });

    const captchaUrlBase = "https://images-na.ssl-images-amazon.com";
    const captchaUrlStart = captchaContent.indexOf(captchaUrlBase);
    const captchaUrlEnd = captchaContent.indexOf('"', captchaUrlStart);
    const captchaUrl = captchaContent.substring(captchaUrlStart, captchaUrlEnd);

    const solution = await solveSimpleImageUrl(this.logId, captchaUrl);

    targetLink = targetLink + "field-keywords=" + solution;

    // this.logger.debug("The link with the solution: ", targetLink);

    const response = await getUrl(this.logId, targetLink, this.makeHeaders(), this.withProxy);
    this.updateHeadersAndCache(response);

    // this.logger.info("Captcha solved.");

  }

  updateHeadersAndCache(response?: AxiosResponse) {
    if (response?.headers) {
      this.cookiesManager.setCookies(response.headers['set-cookie']);
      this.updateCache();
    }
  }

  updateCache() {

    const data: CacheData = {
      logId: this.logId,
      lastCheck: new Date().toLocaleString(),
      asin: this.product.asin,
      title: this.product.title,
      tld: this.tld,
      url: this.url,
      cookies: this.cookiesManager.getCookies(),
      requestHeaders: this.requestHeaders
    }

    setCache<CacheData>(this.logId, data);

  }

}
