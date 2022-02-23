import { LinkWatcher } from "../AbstractWatcher";
import { AmazonProductPageOnRest } from "./AmazonProductPageOnRest";
import { extractASIN, getAmazonDomainTLD } from "../../utils/amazon/simple-url-operations";
import { splitInChunks } from "../../utils/basics";
// import { BrowserLocker } from "./BrowserLocker";
// import { HeadersManager } from "./HeadersManager";
import { Logger } from "../../utils/logger";
import { inMinutes } from "../../utils/time";
import { getConfig } from "../../utils/config-manager";
import fs from "fs";

interface Config {
  TLDs:       string[];
  products:   Product[];
  userAgents: string[];
  groupSize:  number;
}

export class AmazonProductsWatcherOnRest extends LinkWatcher {

  private readonly config:      Config;
  private readonly allPages:    AmazonProductPageOnRest[] = [];
  private readonly activeItems: Set<string>               = new Set();
  private readonly countsMap:   Record<string, number>    = { };
  private          overallCount: number                   = 0;
  private readonly logger                                 = new Logger("rest-poller-watcher");
  private readonly startTime                              = Date.now();

  constructor() {
    super();
    const data = fs.readFileSync(getConfig().watchers.amazonProductsOnRest.productsFile);
    this.config = (JSON.parse(data.toString()) as Config);
    this.config.TLDs.forEach(tld => this.countsMap[tld] = 0);
  }

  async prepareChunk(chunk: Product[], iteration: number) {

    const TLDs = this.config.TLDs;

    // const headersManagerMap = new Map<string, HeadersManager>();

    const groupName = `Group ${String.fromCharCode('A'.charCodeAt(0) + iteration)}`;
    const groupId   = `_${String.fromCharCode('a'.charCodeAt(0) + iteration)}`;
    // const browserLocker = new BrowserLocker();
    // await browserLocker.boot(String.fromCharCode('A'.charCodeAt(0) + iteration));

    // // First part, create a headers manager for each domain
    // const headersManagersForAllDomains = TLDs.map(async(tld) => {

    //   // const asins = chunk.map(p => p.asin).sort().join("-");

    //   const id = `headers-manager/${tld === "co.uk" ? "uk" : tld}/${groupName}`;
    //   const cacheId = `page-state.${tld === "co.uk" ? "uk" : tld}.${groupId}`;

    //   const userAgent = this.config.userAgents[iteration % this.config.userAgents.length];

    //   const fixedMeta: FixedMeta = {
    //     tld, groupName, temporaryId: id, cacheId, products: chunk, userAgent
    //   }

    //   const headersManager = new HeadersManager({ id, fixedMeta, browserLocker });

    //   await headersManager.boot();

    //   headersManagerMap.set(tld, headersManager);

    // });

    // await Promise.all(headersManagersForAllDomains)

    // Second part, share the headers manager across the different products
    for (let product of chunk) {

      // Set them up in domain batches too
      const allTLDs = TLDs.map(async (tld) => {

        // const headersManager = headersManagerMap.get(tld);
        const bp = new AmazonProductPageOnRest({ tld, groupName, product });

        await bp.prepare();
        bp.Heartbeat.on(hb => {
          const tldCount = ++this.countsMap[tld];
          if (tldCount > 0 && tldCount % 500 === 0){
            const elapsedMs = Date.now() - this.startTime;
            const elapsedMinutes = elapsedMs / 1000 / 60;
            const rate = Math.round(tldCount / elapsedMinutes);
            this.logger.info(`${tldCount} total checks done on www.amazon.${tld} (running time: ${inMinutes(elapsedMs)}, ${rate} checks per minute).`);
          }
          const overall = ++this.overallCount;
          if (overall > 0 && overall % 1000 === 0){
            const elapsedMs = Date.now() - this.startTime;
            const elapsedMinutes = elapsedMs / 1000 / 60;
            const rate = Math.round(overall / elapsedMinutes);
            this.logger.info(`${overall} total checks done among all amazon domains (running time: ${inMinutes(Date.now() - this.startTime)}, ${rate} checks per minute).`);
          }
          this._onHeartbeat.trigger(hb)
        });
        bp.ItemFound.on(fi => !this.isRecentDuplicate(fi) && this._onItemFound.trigger(fi));

        this.allPages.push(bp);

      });

      await Promise.all(allTLDs);

    }


  }

  async prepare() {

    // const productsChunk = splitInChunks(this.config.products, 1); // debugging
    const productsChunk = splitInChunks(this.config.products, this.config.groupSize);

    for (let i=0; i<productsChunk.length; i++) {
      const chunk = productsChunk[i];
      await this.prepareChunk(chunk, i);
    }

    this.logger.info(`Finished to prepare the Amazon product watcher based on REST in ${inMinutes(Date.now() - this.startTime)}.`);

  }

  async start() {
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
          origin: "amazon-rest",
          buyPrice: null,
        })
      })
    })
    return ol;
  }

}
