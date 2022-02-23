import { Page } from "puppeteer";
import { parseSyncPrice } from "../../utils/exchangerate";
import { createPage } from "../../browser-management/puppeteer-launcher";
import { getData } from "./cloudflare-fetcher";
import { sleep } from "../../utils/basics";
import { retryOnTimeout, swallowErrorsOnShutdown } from "../../browser-management/error-management";
import { logger } from "../../utils/logger";
import { AbstractWatcher } from "../AbstractWatcher";
import { pauseCheck } from "../../utils/pauser";
import { getConfig } from "../../utils/config-manager";

export const __PART_ALERT_DOMAIN__ = "partalert.net";

const browserInstanceID = getConfig().watchers.partAlert.chromeInstanceID;

interface Props {
  url: string;
  term: string;
}

export class PartAlertSinglePoller extends AbstractWatcher {

  private readonly id: string;
  private readonly url: string;
  private readonly term: string;
  private readonly seenItems: Map<string, Set<number>>;

  private page: Page;

  constructor(params: Props) {
    super();
    this.url = params.url;
    this.term = params.term;
    this.seenItems = new Map<string, Set<number>>();
    this.id = `part-alert/${this.term}`;
  }

  @retryOnTimeout
  @swallowErrorsOnShutdown
  async prepare() {
    logger.info(`Preparing part-alert poller for ${this.url}.`);
    this.page = await createPage(browserInstanceID);
    // simple test run to warm up cloudflare
    await getData(this.page, this.url)
  }

  @retryOnTimeout
  @swallowErrorsOnShutdown
  async start() {

    while(true) {

      await pauseCheck();

      const items = await getData(this.page, this.url);

      if (!items) {
        logger.warn(`Received ${items} data from part alert REST APIs, waiting a bit and then retrying.`);
        await sleep(5000);
      }

      const searchUpdate: SearchHeartbeat = {
        time: Date.now(),
        type: "search",
        origin: "part-alert",
        search: { domain: __PART_ALERT_DOMAIN__, term: this.term }
      };

      this._onHeartbeat.trigger(searchUpdate);

      const filteredItems = items .filter(i => i.availability === 'in_stock')
                                  .filter(i => {
                                    const price = parseSyncPrice(i.price);
                                    return price > 350 && price < 850;
                                  });

      // For every new item, check if I notified already about it for that price (do not bomb)
      filteredItems.forEach(item => {

        // TODO: forget after a while
        // const link = item.url.substr(0, item.url.indexOf("tag="));

        const amazonRegex = RegExp("Amazon([a-z.]+)-(\\w{10})");
        const idMatch = item.id.match(amazonRegex);
        const tld = idMatch[1];
        const asin = idMatch[2];
        const link = `https://www.amazon${tld}/_itm/dp/${asin}`
        // const link = item.url.match(__asin_regex__);
        
        const parsedPrice = parseSyncPrice(item.price);

        const result: FoundItem = { 
          time: Date.now(),
          url: link,
          title: item.name,
          price: item.price,
          parsedPrice: parsedPrice,
          origin: "part-alert",
          valid: true
        };

        if (this.seenItems.has(link)) {
          const prevPrices = this.seenItems.get(link);
          if (!prevPrices.has(parsedPrice)) {
            prevPrices.add(parsedPrice);
            this._onItemFound.trigger(result);
          }
        } else {
          this.seenItems.set(link, new Set([ parsedPrice ]));
          this._onItemFound.trigger(result);
        }

      })

      await sleep(1000 + Math.random() * 2000);

    }

  }

  getTerm() {
    return this.term;
  }

  @swallowErrorsOnShutdown
  async shutdown() {
    logger.info(`Closing part allert poller for ${this.url}.`);
    await this.page.close();
  }

}
