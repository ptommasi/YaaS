import { Logger } from "../../utils/logger";
import { sleep } from "../../utils/basics";
import { retryOnTimeout, swallowErrorsOnShutdown } from "../../browser-management/error-management";
import { AbstractWatcher } from "../AbstractWatcher";
import { getBody, isAmazonDirectMerchant, isAmazonOtherMerchant } from "./restPageDataExtractor";
import { HeadersManager } from "./HeadersManager";

interface AmazonPageOnRestParams {
  tld: string;
  groupName: string;
  product: { asin: string; title: string; };
}

export class AmazonProductPageOnRest extends AbstractWatcher {

  private readonly tld: string;
  private readonly product: { asin: string; title: string; };
  private readonly id: string;
  private readonly groupName: string;
  private readonly withProxy = true;

  private readonly url: string;
  private readonly otherUrl: string;

  private readonly logger: Logger;

  private stop = false;

  private headersManager: HeadersManager;

  constructor(params: AmazonPageOnRestParams) {
    super();
    this.tld = params.tld;
    this.product = params.product;
    this.groupName = params.groupName;
    this.id       = `amazon-product-on-rest/${this.tld === "co.uk" ? "uk" : this.tld}/${this.groupName}/${this.product.asin}`;
    this.url      = `https://www.amazon.${this.tld}/_itm/dp/${this.product.asin}/`;
    this.otherUrl = `https://www.amazon.${this.tld}/gp/aod/ajax/ref=dp_aod_NEW_mbc?asin=${this.product.asin}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp`;
    this.logger = new Logger(this.id);
    this.headersManager = new HeadersManager({ id: this.id, url: this.url });
  }
  
  async prepare() {
    await this.headersManager.boot();
  }

  // @retryOnTimeout
  @swallowErrorsOnShutdown
  async start() {

    const url = this.url;
    const title = this.product.title;
    let consecutiveReloads = 0;

    let requestHeaders = await this.headersManager.reload();

    while (true && !this.stop) {

      const merchantResult = await isAmazonDirectMerchant(this.id, url, requestHeaders, this.withProxy);

      // This needs further logic, because page needs to be re-started, there is no recover by just refreshing 
      // the headers (Amazon keeps noticing) :(
      // if (merchantResult === "MaybeOtherOffers") {
      //   !this.stop && await sleep(1000 + Math.floor(Math.random() * 2000));
      //   const otherMerchant = await isAmazonOtherMerchant(this.id, this.otherUrl, this.headersManager.headers, this.withProxy);
      // }

      if (merchantResult === "RestFailed") {
        // Skip the heartbeat and wait the maximum, just to have amazon breathe a bit
        await sleep(6000);
        continue;
      }

      if (merchantResult === "BotDetected" || merchantResult === "CaptchaActive") {

        this.logger.info(
          merchantResult === "BotDetected"
            ? `Bot has been detected at bulk ASIN observer in domain ${this.tld} at link ${url}.`
            : `Captcha returned to the REST in domain ${this.tld} at link ${url}.`
        );

        consecutiveReloads++;

        if (consecutiveReloads > 2) {
          this.logger.error(`Amazon caught the bot three times in a row, creating new session.`);
          const newRequestHeaders = await this.headersManager.restart();
          if(newRequestHeaders.cookies === requestHeaders.cookies) {
            this.logger.error("We have a bigger problem, after restart cookies didn't change.");
          }
          requestHeaders = newRequestHeaders;
          continue;
        } else
        
        if (consecutiveReloads > 1) {
          this.logger.error(`Amazon caught the bot twice in a row (or more, count is ${consecutiveReloads}). Not good, I'll restart the page at next attempt.`);
        }

        // if (await this.headersManager.didHeadersChange(requestHeaders)) {
        //   this.logger.info(`Headers changed already, no action needed.`);
        // } else {
          // await this.headersManager.reload(url);
        // }

        requestHeaders = await this.headersManager.reload();
        continue;

      }

      const time = Date.now();

      this.logger.debug("Rest had results.");
      this._onHeartbeat.trigger({ time, type: "link", origin: "amazon-product-v2", link: { url, title } });

      if (merchantResult === "FromAmazon") {
        this._onItemFound.trigger({ time, url, title, price: "", parsedPrice: null, origin: "amazon-product-v2", priceLimit: null });
      }

      if (merchantResult === "NoMerchantElement") {
        this.logger.error(`No idea what's going at link ${this.url}, no merchant element (#merchant-info). Probably not available.`);
        // this.logger.info(`Content of ${this.url} is (fetched indipendently again): `, await getBody(this.id, this.url, requestHeaders, true));
        // throw new Error("No idea what's going on.");
      }

      if ([ "NotFromAmazon", "MaybeOtherOffers", "FromAmazon", "NoMerchantElement" ].indexOf(merchantResult)) {
        // Reset the captcha count
        consecutiveReloads = 0;
      }

      !this.stop && await sleep(2000 + Math.floor(Math.random() * 3000));

    }
  }

  @swallowErrorsOnShutdown
  async shutdown() {
    this.stop = true;
  }

}
