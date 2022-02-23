import { Page } from "puppeteer";
import { hasAmazonSelector } from "../../utils/amazon/selector";
import { Logger } from "../../utils/logger";
import { sleep } from "../../utils/basics";
import { retryOnTimeout, swallowErrorsOnShutdown } from "../../browser-management/error-management";
import { AbstractWatcher } from "../AbstractWatcher";
import { fetchProductInfo, WhenToFetch } from "../../utils/amazon/parser-for-product";
import { getPageUsage, maxHeapUsage } from "../../browser-management/page-management";
import { pauseCheck } from "../../utils/pauser";
import { extractASIN, getAmazonDomainTLD } from "../../utils/amazon/simple-url-operations";

interface AmazonPageParams {
  page: Page;
  buyLink: MonitoredUrl;
}

export class AmazonProductPage extends AbstractWatcher {

  /** There is no "protected" */
  private readonly id: string;
  private readonly page: Page;
  private readonly buyLink: MonitoredUrl;

  constructor(params: AmazonPageParams) {
    super();
    this.page = params.page;
    this.buyLink = params.buyLink;
    const asin = extractASIN(params.buyLink.url);
    const tld = getAmazonDomainTLD(params.buyLink.url);
    this.id = `amazon-page/${tld}/${asin}`;
  }

  @retryOnTimeout
  @swallowErrorsOnShutdown
  async prepare() {
    await this.page.goto( this.buyLink.url, { waitUntil: "networkidle2" } );
    await pauseCheck();
    await hasAmazonSelector({ id: this.id, page: this.page, selector: '#productTitle', withCookiesCheck: true });
  }

  @retryOnTimeout
  @swallowErrorsOnShutdown
  async start() {

    let refreshes = 0;
    const startTime = Date.now();

    const logger = new Logger(this.id);

    while(true) {

      await pauseCheck();

      const usage = await getPageUsage(this.page);

      if (usage.total > maxHeapUsage) {
        // const refreshDuration = (Math.floor((Date.now() - startTime) / 1000) / refreshes).toFixed(2);
        // logger.info(
        //   `Product page: total heap limit of ${maxHeapUsage}MB surpassed (${usage.used}MB used of ${usage.total}MB) ` + 
        //   `after ${refreshes} refreshes (each refresh took ~${refreshDuration} seconds).`
        // );
        return;
      }

      // TODO: investigate using unsafeReload without await
      await this.page.reload({ waitUntil: "networkidle2" });
      refreshes++;

      const productInfo = await fetchProductInfo(this.id, this.page, { fetchOtherSellers: WhenToFetch.Never });

      if (productInfo === null) {
        logger.error(`Product info not found at ${this.page.url()} (starting from ${this.buyLink.url}), sleeping and retrying.`);
        await sleep(5000);
        continue;
      }

      this._onHeartbeat.trigger({
        time: Date.now(),
        type: "link",
        origin: "amazon-link",
        link: {
          url: this.buyLink.url,
          title: this.buyLink.title
        }
      });

      if (productInfo.computed.isAvailableFromAmazon || productInfo.computed.isAmazonInQuickOtherOffer) {
        logger.info("Something found, stopping this instance: ", productInfo);
        this._onItemFound.trigger({
          time: Date.now(),
          url: this.buyLink.url,
          title: productInfo.source.title,
          price: productInfo.source.price,
          parsedPrice: productInfo.computed.eurPrice,
          origin: "amazon-link",
          priceLimit: null,
          valid: true
        })
        break;
      } else {
        // Wait between 1 and 8 seconds
        await sleep(1000 + Math.random() * 7000);
      }
    }

  }

  @swallowErrorsOnShutdown
  async shutdown() {
    // logger.info(`Closing product page for url ${this._buyLink.url} (${this._buyLink.title}).`);
    this.page.close();
  }

}


