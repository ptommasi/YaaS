import { LinkWatcher } from "../AbstractWatcher";
import { AmazonProductPageRoundRobinOnRest } from "./AmazonProductPageRoundRobinOnRest";
import { extractASIN, getAmazonDomainTLD } from "../../utils/amazon/simple-url-operations";
import { Logger } from "../../utils/logger";
import { inMinutes } from "../../utils/time";
import { getConfig } from "../../utils/config-manager";
import fs from "fs";

interface Config {
  TLDs:       string[];
  products:   Product[];
  userAgents: string[];
}

export class AmazonProductsWatcherRoundRobinOnRest extends LinkWatcher {

  private readonly config:      Config;
  // One page per domain
  private readonly allPages:    AmazonProductPageRoundRobinOnRest[] = [];
  private readonly activeItems: Set<string>               = new Set();
  private readonly countsMap:   Record<string, number>    = { };
  private          overallCount: number                   = 0;
  private readonly logger                                 = new Logger("rest-rr-poller-watcher");
  private readonly startTime                              = Date.now();

  constructor() {
    super();
    const data = fs.readFileSync(getConfig().watchers.amazonProductsRoundRobinOnRest.productsFile);
    this.config = (JSON.parse(data.toString()) as Config);
    this.config.TLDs.forEach(tld => this.countsMap[tld] = 0);
  }

  async prepare() {

    const TLDs = this.config.TLDs;

    // Just a way to load all of them in parallel
    const allTLDs = TLDs.map(async (tld) => {

      // const headersManager = headersManagerMap.get(tld);
      const bp = new AmazonProductPageRoundRobinOnRest({ tld, products: this.config.products });

      await bp.prepare();

      bp.Heartbeat.on(hb => this._onHeartbeat.trigger(hb));
      bp.ItemFound.on(fi => !this.isRecentDuplicate(fi) && this._onItemFound.trigger(fi));

      this.allPages.push(bp);

    });

    await Promise.all(allTLDs);


    this.logger.info(`Finished to prepare the Amazon product round robin watcher based on REST in ${inMinutes(Date.now() - this.startTime)}.`);

  }

  async start() {
    // Note: this is not blocking (forEach won't respect await)
    this.allPages.forEach(async (bp) => {
      await bp.start()
    });
  }

  isRecentDuplicate(item: FoundItem) {

    const id = `[${getAmazonDomainTLD(item.url)}/${extractASIN(item.url)}]`;
  
    // For the next 10 minutes, ignore any same item that is received
    if (this.activeItems.has(id)) {
      return true;
    } else {
      this.activeItems.add(id);
      setTimeout(() => this.activeItems.delete(id), 1000 * 60 * 10);
      return false;
    }
  
  }

  getLinks(): ObservedLink[] { 
    const ol: ObservedLink[] = [];
    this.config.products.forEach(p => {
      this.config.TLDs.forEach(tld => {
        ol.push({
          url: `https://www.amazon.${tld}/_itm/dp/${p.asin}/`,
          title: `${p.title} (${p.asin} at ${tld})`,
          category: "",
          origin: "amazon-rr-rest",
          buyPrice: null,
        })
      })
    })
    return ol;
  }

}
