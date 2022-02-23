import { Logger } from "../../utils/logger";
import { getBody, postFormData, getUrl } from "./rest-utils";
import { getHeadersSet } from "./rest-utils";
import { CookiesManager } from "./CookiesManager";
import { extractAllElements, extractAttribute, extractHtmlSnippet } from "../../utils/html-work";
import { naiveSolveSimpleImageUrl, solveSimpleImageUrl } from "../../utils/captcha-solver";
import { inMinutes } from "../../utils/time";
import CookieParser from 'set-cookie-parser';
import { getCache, setCache } from "../../utils/caching";
import { AxiosResponse } from "axios";
import { JSDOM } from "jsdom";
import { sleep } from "../../utils/basics";

interface AmazonRestPageParams {
  tld: string;
  logId: string;
  withCache: boolean;
  cacheId: string;
  withProxy: boolean;
}

interface CacheData {
  logId: string;
  lastCheck: string;
  tld: string;
  rootUrl: string;
  cookies: Record<string, CookieParser.Cookie>;
  requestHeaders: any;
}

const captchaFormId = '<form method="get" action="/errors/validateCaptcha"';

// Used to fetch the body of an Amazon page using REST APIs. It will take care of 
// headers / cookies management and captchas transparently.
export class AmazonRestPage {

  private readonly tld: string;
  private readonly logId: string;
  private readonly cacheId: string;

  private readonly rootUrl: string;

  private realCaptchaCount = 0;
  private naiveCaptchaCount = 0;
  private hitsCount = 0;
  private errorsCount = 0;
  private botsDectionCount = 0;

  private readonly logger: Logger;
  private cookiesManager: CookiesManager;
  private readonly withCache: boolean;
  private readonly withProxy: boolean;
  
  private requestHeaders;
  private startTime = Date.now();

  constructor(params: AmazonRestPageParams) {

    this.tld = params.tld;
    this.logId     = params.logId;
    this.logger    = new Logger(this.logId);
    this.requestHeaders = getHeadersSet(0);
    this.rootUrl   = `https://www.amazon.${this.tld}/`;
    this.withCache = params.withCache;
    this.withProxy = params.withProxy;
    this.cacheId = params.cacheId;

    if (this.withCache) {

      const cache = getCache<CacheData>(this.cacheId);
  
      if (cache !== null) {
        this.logger.info("Cache found, session will resume from there.");
      }
  
      this.cookiesManager = new CookiesManager(cache !== null ? cache.cookies : undefined);
      
    } else {
      this.cookiesManager = new CookiesManager();
    }

  }

  /** Not tested, missing captcha logic */
  // TODO: this is called with link https://www.amazon.it/cookieprefs?ref_=portal_banner_all, which might returns a redirect
  async openPostUrl(url: string, formData: { name: string, value: string}[], retry = 0): Promise<string> {

    const result = await postFormData(this.logId, url, this.makeHeaders(), formData, this.withProxy, true);
    this.updateHeadersAndCache(result.response);

    // If it's a 302, there is not data.
    // TODO: Redirect link might be followed just to make the cookies happier
    return result.response?.data;

  }

  async openUrl(url: string, retry = 0): Promise<string> {

      if (retry > 4) {
        this.logger.error("Too many retries, stopping (sleeping 5 hours).");
        await sleep(1000 * 60 * 60 * 5);
      }

      // Note, with the last flag (retryOnSoftError) the ignore_error status will not be returned,
      // getBody will retry automatically.
      const result = await getBody(this.logId, url, this.makeHeaders(), this.withProxy, true);
      this.updateHeadersAndCache(result.response);

      if (result.status !== "ok") {

        this.errorsCount++;

        // These if are only to display debug information, logic is ahead
        if (result.response?.status) {
          this.logger.warn(`Error '${result.response?.status}' returned (${this.status()}.`);
        } else {
          if (result.status !== "ignore_error") {
            this.logger.warn(`Error in the rest (no response available, inner status is ${result.status}, ${this.status()}).`);
          }
        }

        if (result.status === "bot_detected") {

          this.botsDectionCount++;
          this.logger.error(`Bot has been detected, doing another attempt.`);

          await sleep(1000 * 6);

          // To confuse Amazon, just open the root url, doesn't matter the result
          const result = await getBody(this.logId, this.rootUrl, this.makeHeaders(), this.withProxy, true);
          this.updateHeadersAndCache(result.response);

          await sleep(1000 * 6);

          return this.openUrl(url, retry + 1);
          // this.logger.error(`Bot has been detected, I'll reload www.amazon.${this.tld} root page first.`);

        } else if (result.status === "ignore_error") {
        } else if (result.status === "unknown") {
          this.logger.error("Unkown error.");
        }

        // await sleep(2000);
        return this.openUrl(url, retry + 1);

      }

      if ([301, 302, 307, 308 ].some(c => c === result.response.status)) {
        // It's a redirect, check "Location" header
        this.logger.info("REDIRECT LOGIC IS MISSING: ", result.response.headers["location"], "...", result.response);
      }

      if (this.isCaptha(result.response.data)) {
        // If Amazon is not messing, for the first attempt I'll use a naive solver
        await this.solveCaptcha(result.response.data, retry === 0);
        return this.openUrl(url, retry + 1);
      }

      this.hitsCount++;

      if (this.hitsCount % 100 === 0) {
        this.logger.info(`${this.hitsCount} checks completed so far (${this.status()}).`);
      }

      return result.response.data;

  }

  private makeHeaders() {
    if (this.cookiesManager.hasCookies) {
      return { ...this.requestHeaders, cookie: this.cookiesManager.getCookieString() }
    } else {
      return this.requestHeaders;
    }
  }

  private status() {
    return `status: ${this.hitsCount} checks, ` + 
            `${this.naiveCaptchaCount} naive + ${this.realCaptchaCount} real = ${this.naiveCaptchaCount + this.realCaptchaCount} captchas, ` + 
            `${this.botsDectionCount} bot detections, ` + 
            `${this.errorsCount} errors / warnings, ` + 
            `running time is ${inMinutes(Date.now() - this.startTime)}`;
  }

  private isCaptha(body: string) {
    return body.indexOf(captchaFormId) >= 0;
  }

  private async solveCaptcha(body: string, naive: boolean) {

    if (naive) { this.naiveCaptchaCount++; }
    else       { this.realCaptchaCount++;  }

    this.logger.info(`Captcha asked, using ${naive ? 'naive' : '2captcha'} solver (${this.status()}).`);

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

    const solution = await (naive ? naiveSolveSimpleImageUrl(this.logId, captchaUrl, true) : solveSimpleImageUrl(this.logId, captchaUrl));

    targetLink = targetLink + "field-keywords=" + solution;

    // TODO: investigate if it is worth to keep getUrl
    const response = await getUrl(this.logId, targetLink, this.makeHeaders(), this.withProxy);
    this.updateHeadersAndCache(response);

    this.logger.debug(`Response status for ${naive ? 'naive' : 'real'} captcha is `, response.status);

  }

  private updateHeadersAndCache(response?: AxiosResponse) {
    if (response?.headers) {
      this.cookiesManager.setCookies(response.headers['set-cookie']);
      this.updateCache();
    }
  }

  private updateCache() {

    if (!this.withCache) {
      return;
    }

    const data: CacheData = {
      logId: this.logId,
      lastCheck: new Date().toLocaleString(),
      tld: this.tld,
      rootUrl: this.rootUrl,
      cookies: this.cookiesManager.getCookies(),
      requestHeaders: this.requestHeaders
    }

    setCache<CacheData>(this.cacheId, data);

  }

}
