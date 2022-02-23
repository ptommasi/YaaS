import { Page } from "puppeteer";
import { logger } from "../../utils/logger";
import { isPageClosed } from "../../browser-management/error-management";
import { bootBrowser, createPage } from "../../browser-management/puppeteer-launcher";
import { LinkWatcher } from "../AbstractWatcher";
import { AmazonProductPage } from "./AmazonProductPage";
import { inMinutes } from "../../utils/time";
import { getConfig } from "../../utils/config-manager";
import fs from "fs";

interface ProductsFile {
  items: MonitoredUrl[]
}

const _CONFIG = getConfig().watchers.amazonProductsInBrowser;

export class AmazonProductsWatcher extends LinkWatcher {

  private buyLinks: MonitoredUrl[];
  private amazonPages: { [link: string]: AmazonProductPage };

  constructor() {
    super();
    const data = fs.readFileSync('data/watchers/amazon-products-in-browser.json');
    this.buyLinks = (JSON.parse(data.toString()) as ProductsFile).items;
    logger.info(`${this.buyLinks.length} amazon links of interest found.`);
    this.amazonPages = {};
  }

  async prepare() {

    await bootBrowser(_CONFIG.chromeInstanceID, "AmazonProductsWatcher");

    for(let i = 0; i < this.buyLinks.length; i++) {
      logger.info(`Preparing product page for ${this.buyLinks[i].url} (${this.buyLinks[i].title}).`);
      await this.prepareProductPage(this.buyLinks[i]);
    }

  }

  private async prepareProductPage(buyLink: MonitoredUrl) {

    try {

      const page: Page = await createPage(_CONFIG.chromeInstanceID);
      await page.setJavaScriptEnabled(false);
      await page.setCacheEnabled(false);

      this.amazonPages[buyLink.url] = new AmazonProductPage({ page, buyLink });

      this.amazonPages[buyLink.url].Heartbeat.on(hb => this._onHeartbeat.trigger(hb));
      this.amazonPages[buyLink.url].ItemFound.on(fi => this._onItemFound.trigger(fi));

      await this.amazonPages[buyLink.url].prepare();

    } catch(err) {
      if (isPageClosed(err)) {
        console.error(`Page has been closed during startup of ${buyLink.title} (at ${buyLink.url}).`);
      } else {
        console.error(`Drama preparting the AmazonPage monitoring for ${buyLink.title} (at ${buyLink.url}), throwing above.`);
        throw err;
      }
    }

  }

  async start() {
    for (let bl of this.buyLinks) {
      this.startSingle(bl);
    }
  }

  private async clearProductPage(buyLink: MonitoredUrl) {
    let oldProductPage = this.amazonPages[buyLink.url];
    this.amazonPages[buyLink.url] = null;
    await oldProductPage.destroy();
    oldProductPage = null;
  }

  private async startSingle(buyLink: MonitoredUrl) {
    try {
      const startTime = Date.now();
      let   restarts = 0;
      while (true) {
        // Function returns when heap is too big
        await this.amazonPages[buyLink.url].start()
        // When heap is too big, clean the references, allocate again
        restarts++;
        const rate = inMinutes(Math.floor((Date.now() - startTime) / restarts));
        logger.info(`Heap reached the limit for product ${buyLink.url} (${buyLink.title}), re-initialiting (${restarts} restarts in ${inMinutes(Date.now() - startTime)}, a restart every ${rate}).`);
        await this.clearProductPage(buyLink);
        await this.prepareProductPage(buyLink);
      }

    } catch(err) {
      if (isPageClosed(err)) {
        logger.error(`Page has been closed, no more updates on ${buyLink.title} (at ${buyLink.url}).`);
      } else {
        logger.error(`Drama in the AmazonPage monitoring for ${buyLink.title} (at ${buyLink.url}), throwing above.`);
        throw err;
      }
    }
  }

  getLinks() { 
    return this.buyLinks.map(bl => {
      const ol: ObservedLink = {
        url:      bl.url,
        title:    bl.title,
        category: "amazon",
        origin:   "amazon-link",
        buyPrice: null
      };
      return ol;
    })
  };

}
