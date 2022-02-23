import { LinkWatcher } from "../AbstractWatcher";
import { AmazonProductPageOnRest } from "./AmazonProductPageOnRest";
import { extractASIN, getAmazonDomainTLD } from "../../utils/amazon/simple-url-operations";
import { splitInChunks } from "../../utils/basics";
import { logger } from "../../utils/logger";
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
  private readonly activeItems: Set<String>               = new Set();

  constructor() {
    super();
    const data = fs.readFileSync('data/watchers/amazon-products-on-rest.json');
    this.config = (JSON.parse(data.toString()) as Config);
  }

  async prepareChunk(chunk: Product[], iteration: number) {

    const TLDs = this.config.TLDs;

    const groupName = `Group ${String.fromCharCode('A'.charCodeAt(0) + iteration)}`;
    const groupId   = `_${String.fromCharCode('a'.charCodeAt(0) + iteration)}`;

    // First part, create a headers manager for each domain
    const headersManagersForAllDomains = TLDs.map(async(tld) => {

      // const asins = chunk.map(p => p.asin).sort().join("-");

      const id = `headers-manager/${tld === "co.uk" ? "uk" : tld}/${groupName}`;
      const cacheId = `page-state.${tld === "co.uk" ? "uk" : tld}.${groupId}`;

      const userAgent = this.config.userAgents[iteration % this.config.userAgents.length];

      const fixedMeta: FixedMeta = {
        tld, groupName, temporaryId: id, cacheId, products: chunk, userAgent
      }

    });

    await Promise.all(headersManagersForAllDomains)

    // Second part, share the headers manager across the different products
    for (let product of chunk) {

      // Set them up in domain batches too
      const allTLDs = TLDs.map(async (tld) => {

        const bp = new AmazonProductPageOnRest({ tld, groupName, product });

        await bp.prepare();
        bp.Heartbeat.on(hb => this._onHeartbeat.trigger(hb));
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

    logger.info("Finished to prepare the Amazon product watcher based on REST.");

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
