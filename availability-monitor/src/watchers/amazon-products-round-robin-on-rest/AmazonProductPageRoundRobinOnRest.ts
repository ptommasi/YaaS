import { Logger } from "../../utils/logger";
import { sleep } from "../../utils/basics";
import { swallowErrorsOnShutdown } from "../../browser-management/error-management";
import { AbstractWatcher } from "../AbstractWatcher";
import { extractAllElements, extractAttribute, extractHtmlSnippet } from "../../utils/html-work";
import { isAmazonMerchant } from "../../utils/amazon-rest/amazon-parser";
import { playBipSound } from "../../utils/sound-player";
import { getGeoFolderName } from "../../utils/geo-utils";
import { AmazonRestPage } from "../../utils/amazon-rest/AmazonRestPage";
import { getConfig } from "../../utils/config-manager";

interface AmazonPageOnRestParams {
  tld: string;
  products: { asin: string; title: string; }[];
}

export class AmazonProductPageRoundRobinOnRest extends AbstractWatcher {

  private readonly tld: string;
  private readonly products: { asin: string; title: string; }[];
  private currentIndex = 0;
  private readonly logId: string;
  private readonly withProxy = getConfig().watchers.amazonProductsRoundRobinOnRest.proxied;
  private readonly withCache = getConfig().watchers.amazonProductsRoundRobinOnRest.cacheSessions;

  private readonly url: string;
  
  private readonly logger: Logger;
  
  // private requestHeaders;
  private stop = false;

  private amazonRestPage: AmazonRestPage;

  constructor(params: AmazonPageOnRestParams) {
    super();
    this.tld = params.tld;
    this.products = params.products;
    this.logId       = `rest-rr-poller/${this.tld === "co.uk" ? "uk" : this.tld}`;
    // this.url      = `https://www.amazon.${this.tld}/_itm/dp/${this.product.asin}/`;
    // This link will be immediately detected as bot from Amazon, I don't know why
    // this.otherUrl = `https://www.amazon.${this.tld}/gp/aod/ajax/ref=dp_aod_NEW_mbc?asin=${this.product.asin}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp`;
    this.logger = new Logger(this.logId);

    if(!this.withProxy) {
      this.logger.warn("The proxy is disable, double check that's what you want, Amazon is very keen in banning bots.");
    }
  }
  
  async prepare() {
    
    const geoFolder = await getGeoFolderName(this.withProxy);

    const cacheId = `${geoFolder}/rest-rr-poller/round-robin.${this.tld === "co.uk" ? "uk" : this.tld}`;

    this.amazonRestPage = new AmazonRestPage({ logId: this.logId, tld: this.tld, withCache: this.withCache, withProxy: this.withProxy, cacheId });

    let body = await this.amazonRestPage.openUrl(`https://www.amazon.${this.tld}/`);

    const cookieBanner = extractHtmlSnippet(body, '<form id="sp-cc"', "form");

    if (cookieBanner !== null) {

      const inputs = extractAllElements(cookieBanner, "<input");

      const formData = inputs.map(inputTag => ({
        name:  extractAttribute(inputTag, "name" ),
        value: extractAttribute(inputTag, "value")
      }));

      await sleep(3000);

      this.amazonRestPage.openPostUrl(`https://www.amazon.${this.tld}/cookieprefs?ref_=portal_banner_all`, formData);

      this.logger.info(`Cookies accepted and page ready to do round robin for domain ${this.tld}.`);

    } else {
      this.logger.info(`No need to accept cookies (no banner found), round robin page ready for domain ${this.tld}.`);
    }

  }

  private get currentProduct() {
    const product = this.products[this.currentIndex % this.products.length];
    return {
      ...product,
      url: `https://www.amazon.${this.tld}/_itm/dp/${product.asin}/`
    }
  }

  // @retryOnTimeout
  @swallowErrorsOnShutdown
  async start() {

    while (true && !this.stop) {

      const startTime = Date.now();

      const { url, title } = this.currentProduct;

      let body = await this.amazonRestPage.openUrl(url);

      const merchantResult = isAmazonMerchant(body);

      if (merchantResult === "CaptchaActive") {
        this.logger.error("Inconsistent error, captcha should be solved already.");
        throw new Error("Captcha found where it shouldn't be.")
      }

      const time = Date.now();

      this._onHeartbeat.trigger({ time, type: "link", origin: "amazon-product-round-robin", link: { url, title } });

      if (merchantResult === "FromAmazon") {
        playBipSound();
        // await open(this.url);
        this._onItemFound.trigger({ time, url, title, price: "", parsedPrice: null, origin: "amazon-product-round-robin", priceLimit: null, valid: true });
        // Sleep for five minutes once there is a hit (do not bomb)
        // await sleep(1000 * 60 * 5);
      }

      if (merchantResult === "NoMerchantElement") {
        this.logger.error(`No idea what's going at link ${this.url}, no merchant element (#merchant-info). Probably not available.`, body);
        // this.logger.info(`Content of ${this.url} is (fetched indipendently again): `, await getBody(this.id, this.url, requestHeaders, true));
        // throw new Error("No idea what's going on.");
      }

      if ([ "NotFromAmazon", "MaybeOtherOffers", "FromAmazon", "NoMerchantElement" ].indexOf(merchantResult)) {
        // Reset the captcha count
        // consecutiveReloads = 0;
      }

      // this.logger.info("now checking", this.currentProduct);
      this.currentIndex++;

      // Amazon will be bother by more than 1 request per second, to my understanding (1200 milliseconds to be defensive)
      const elapsed = Date.now() - startTime;
      if (elapsed < 1200) {
        // Sleep for the time left till 1.2 seconds
        await sleep(1200 - elapsed);
        // this.logger.info(`${elapsed} milliseconds passed, waiting a bit.`);
      } else {
        // this.logger.info(`${elapsed} milliseconds passed, no need to wait a bit.`);
      }

      // !this.stop && await sleep(2000 + Math.floor(Math.random() * 3000));

    }
  }

  @swallowErrorsOnShutdown
  async shutdown() {
    this.stop = true;
  }

}
