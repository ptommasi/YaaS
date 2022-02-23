import { Page } from "puppeteer";
import { inMinutes } from "../../utils/time";
import { isPageClosed } from "../../browser-management/error-management";
import { bootBrowser, createPage } from "../../browser-management/puppeteer-launcher";
import { Logger } from "../../utils/logger";
import { SearchWatcher } from "../AbstractWatcher";
import { AmazonSearchPage } from "./AmazonSearchPage";
import { getConfig } from "../../utils/config-manager";

// const _DOMAINS = [ "https://www.amazon.es" ];
// const _DOMAINS = [ "it", "co.uk", "fr", "es", "de" ].map(tld => `https://www.amazon.${tld}`);
// const _DOMAINS = [ "it", "co.uk", "fr", "de" ].map(tld => `https://www.amazon.${tld}`);
// const _SEARCHES = [ "3060+Ti"];
// const _SEARCHES = [ "3060+Ti", "3070", "3080" ];
// const _SEARCHES = [ "3060+Ti", "3070", "3080", "3090" ];
// const _SEARCHES = [ "nvidia+3060+Ti", "nvidia+3070", "nvidia+3080", "3060+Ti+rtx", "3070+rtx", "3080+rtx", "rtx+3060+Ti", "rtx+3070", "rtx+3080", "rtx+3060+Ti", "rtx+3070", "rtx+3080" ];

const _CONFIG   = getConfig().watchers.amazonSearch;
const _DOMAINS  = _CONFIG.domains.map(tld => `https://www.amazon.${tld}`);
const _SEARCHES = _CONFIG.searches;

const logger = new Logger();

export class AmazonSearchWatcher extends SearchWatcher {

  private readonly searches: Map<string, Map<string, AmazonSearchPage>>;
  // _links_sent: [];

  constructor() {
    super();
    this.searches = new Map<string, Map<string, AmazonSearchPage>>();
    _DOMAINS.forEach(domain => this.searches.set(domain, new Map()));
  }

  async prepare() {

    await bootBrowser(_CONFIG.chromeInstanceID, "AmazonSearchWatcher");

    for (let domain of _DOMAINS) {
      for (let searchFor of _SEARCHES) {
        logger.info(`Preparing search page for domain ${domain} and search term ${searchFor}.`);
        await this.prepareSearchPage(domain, searchFor);
      }
    }

    logger.info("All search pages booted.");

  }

  private async prepareSearchPage(domain: string, searchFor: string) {

    try {
      const page: Page = await createPage(_CONFIG.chromeInstanceID);
      // No javascript, better performances
      await page.setJavaScriptEnabled(false);
      // I suspect search results could get cached
      await page.setCacheEnabled(false);
      // page.setDefaultNavigationTimeout(0); 
      const searchPage = new AmazonSearchPage({ domain, searchFor, page });
      this.searches.get(domain).set(searchFor, searchPage);
      searchPage.Heartbeat.on(hb => {
        this._onHeartbeat.trigger({...hb});
      });
      searchPage.ItemFound.on(fi => this._onItemFound.trigger(fi));

      await searchPage.prepare();
    } catch(err) {
      if (isPageClosed(err)) {
        console.error(`Search has been closed during startup of ${domain}/${searchFor}.`);
      } else {
        console.error(`Drama preparing the AmazonSearchPage monitoring of ${domain}/${searchFor}.`);
        throw err;
      }

    }

  }

  getSearches(): ObservedSearches {
    return {
      domains: _DOMAINS,
      terms: _SEARCHES
    };
  }

  async start() {
    for (let domain of _DOMAINS) {
      for (let searchFor of _SEARCHES) {
        this.startSingle(domain, searchFor);
      }
    }
  }

  private async clearSearchPage(domain: string, searchFor: string) {
      let oldSearchPage = this.searches.get(domain).get(searchFor);
      this.searches.get(domain).delete(searchFor);
      await oldSearchPage.destroy();
      oldSearchPage = null;
  }

  private async startSingle(domain: string, searchFor: string) {
    try {
      const startTime = Date.now();
      let   restarts = 0;
      while (true) {
        // Function returns when heap is too big
        await this.searches.get(domain).get(searchFor).start();
        // When heap is too big, clean the references, allocate again
        restarts++;
        const rate = inMinutes(Math.floor((Date.now() - startTime) / restarts));
        logger.info(`Heap reached the limit for ${domain}/${searchFor}, re-initialiting (${restarts} restarts in ${inMinutes(Date.now() - startTime)}, a restart every ${rate}).`);
        await this.clearSearchPage(domain, searchFor);
        await this.prepareSearchPage(domain, searchFor);
      }
    } catch(err) {
      if (isPageClosed(err)) {
        logger.error(`Search has been closed for ${domain}/${searchFor}.`);
      } else {
        logger.error(`Drama in the AmazonSearchPage monitoring of ${domain} for ${searchFor}, throwing above.`);
        throw err;
      }
    }

  }

}
