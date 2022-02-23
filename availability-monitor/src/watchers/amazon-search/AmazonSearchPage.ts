import { Page } from "puppeteer";
import { getPageUsage, maxHeapUsage } from "../../browser-management/page-management";
import { retryOnTimeout, swallowErrorsOnShutdown } from "../../browser-management/error-management";
import { hasAmazonSelector } from "../../utils/amazon/selector";
import { sleep } from "../../utils/basics";
import { parseSyncPrice } from "../../utils/exchangerate";
import { Logger } from "../../utils/logger";
import { AbstractWatcher } from "../AbstractWatcher";
import { pauseCheck } from "../../utils/pauser";
import { getAmazonDomainTLD } from "../../utils/amazon/simple-url-operations";

interface AmazonPageParams {
  page: Page;
  domain: string;
  searchFor: string;
}

interface RawItem {
  title: string;
  link: string;
  price: string | null;
}

function targetContainsString(target: string, comparisons: string[]) {
  let count = 0;
  comparisons.forEach(c => target.indexOf(c) >=0 && count++);
  return count;
}

function titleHasOnlyOneCard(item: ParsedItem): boolean {
  const _cards = [ "3060", "3070", "3080", "3090", "6700", "6800", "6900" ];
  let count = targetContainsString(item.title, _cards);
  return count === 1;
}

function isRelevant(item: ParsedItem) {
  const _bad_strings = [ "ssd", "printer", "nvme", "dell", "i7", "i5", "i9", "i3", "windows" ];
  if (targetContainsString(item.title.toLowerCase(), _bad_strings) > 0) {
    return false;
  }
  // Just filter for the ones that are actually realistic purchases
  return item.parsedPrice > 340 && item.parsedPrice < 900;
}

export class AmazonSearchPage extends AbstractWatcher {

  private readonly id: string;
  private readonly page: Page;
  private readonly domain: string;
  private readonly searchFor: string;
  private readonly seenItems: Map<string, Set<number>>;

  constructor(params: AmazonPageParams) {

    super();
    this.page = params.page;
    this.domain = params.domain;
    this.searchFor = params.searchFor;
    this.seenItems = new Map<string, Set<number>>();

    const tld = getAmazonDomainTLD(this.domain);
    this.id = `amazon-search/${tld}/${this.searchFor}`;

  }

  @retryOnTimeout
  async prepare() {

    const logger = new Logger(this.id);

    // Step 1: go to the search page, and wait for the networ to finish loading
    await this.page.goto(`${this.domain}/s?k=${this.searchFor}`);

    await pauseCheck();

    // Step 2: only be interested in the stuff with free shipping
    const hasPrimeRefinements = await hasAmazonSelector({ id: this.id, page: this.page, selector: "#primeRefinements", withCookiesCheck: true });

    if (hasPrimeRefinements) {

      // When there are no results, there is no refinement available
      const primeRefinementResult = await this.page.evaluate(async () => {
        const primeFilter = document.querySelector<HTMLElement>("#primeRefinements");
        if (primeFilter === null) {
          return null;
        } else {
          const filterByFreeShipping = primeFilter.querySelector<HTMLElement>(".a-checkbox.a-checkbox-fancy.s-navigation-checkbox.aok-float-left");
          filterByFreeShipping.click();
          return "ok";
        }
      });
  
      if (primeRefinementResult === "ok") {
        // logger.info("   Refined by prime delivery only.")
      } else {
        logger.info("   [!!!] I was not able to refine by prime delivery only.")
      }

    } else {
      logger.warn("   No prime refinements available in the page.")
    }

    await pauseCheck();

    // Step 3: let's filter down the noise by filtering only on graphic cards

    const hasDepartmentsList = await hasAmazonSelector({ id: this.id, page: this.page, selector: "#departments > ul > li", withCookiesCheck: true });

    if (hasDepartmentsList) {

      const gpuOnlyResult = await this.page.evaluate(async () => {
  
        const suggestedDepartments = document.querySelectorAll<HTMLElement>("#departments > ul > li")
  
        if (suggestedDepartments === null) {
          return "No suggested departments list found."
        }
  
        let graphicCardsDeparment: HTMLElement = null;
  
        for (let item of suggestedDepartments) {
          const text = item.innerText.toLowerCase();
          if (
            text.indexOf("graphics card") >= 0     || 
            text.indexOf("schede grafiche") >= 0   || 
            text.indexOf("cartes graphiques") >= 0 || 
            text.indexOf("tarjetas gráficas") >= 0 ||
            text.indexOf("grafikkarten") >= 0
          ) {
            graphicCardsDeparment = item;
            break;
          }
        }
  
        if(graphicCardsDeparment) {
          graphicCardsDeparment.querySelector("a").click();
          return "ok"
        } else {
          console.warn("No graphics card department found.");
          return "No graphics card department to click found.";
        }
  
      });
  
      if (gpuOnlyResult !== "ok") {
        logger.warn(`  While trying to boot the search term ${this.searchFor} on ${this.domain}, I had the following error: ${gpuOnlyResult}.`);
      } else {
        // logger.info("   Refined for graphics card only.")
      }

    } else {
      logger.warn("   [!!!] No departments list available in the page.")
    }

  }

  @swallowErrorsOnShutdown
  async start() {

    const logger = new Logger(this.id);

    // let refreshes = 0;
    // const startTime = Date.now();

    while(true) {

      await pauseCheck();

      const usage = await getPageUsage(this.page);

      if (usage.total > maxHeapUsage) {
        // const refreshDuration = (Math.floor((Date.now() - startTime) / 1000) / refreshes).toFixed(2);
        // logger.info(
        //   `Search page: total heap limit of ${maxHeapUsage}MB surpassed (${usage.used}MB used of ${usage.total}MB) ` + 
        //   `after ${refreshes} refreshes (each refresh took ~${refreshDuration} seconds).`
        // );
        return;
      }

      const items = await this.fetchSearchResults();
      // refreshes++;

      this._onHeartbeat.trigger({
        time: Date.now(),
        type: "search",
        origin: "amazon-search",
        search: { domain: this.domain, term: this.searchFor }
      });

      const filteredItems = items .filter(isRelevant)
                                  .filter(titleHasOnlyOneCard);

      // For every new item, check if I notified already about it for that price (do not bomb)
      filteredItems.forEach(item => {

        const result: FoundItem = {
          url: item.link,
          title: item.title,
          price: item.price,
          parsedPrice: item.parsedPrice,
          origin: "amazon-search",
          priceLimit: null,
          time: Date.now(),
          valid: true
        };

        if (this.seenItems.has(item.link)) {
          const prevPrices = this.seenItems.get(item.link);
          if (!prevPrices.has(item.parsedPrice)) {
            logger.info(`I found a new price for an item while searching: `, item)
            prevPrices.add(item.parsedPrice);
            this._onItemFound.trigger(result);
          }
        } else {
          logger.info(`I found a new item while searching: `, item)
          this.seenItems.set(item.link, new Set([ item.parsedPrice ]));
          this._onItemFound.trigger(result);
        }

      });

      // Wait between 1 and 8 seconds
      await sleep(1000 + Math.random() * 7000);

    }

  }

  @retryOnTimeout
  @swallowErrorsOnShutdown
  private async fetchSearchResults(): Promise<ParsedItem[]> {

    const logger = new Logger(this.id);

    // TODO: investigate using unsafeReload without await
    await this.page.reload();

    const hasResultsRows = await hasAmazonSelector({ id: this.id, page: this.page, selector: '.s-main-slot.s-result-list.s-search-results.sg-row' });

    if (!hasResultsRows) {
      logger.error(`The table with the search results is missing at ${this.page.url()} (searching for ${this.searchFor} on ${this.domain}).`);
      return [];
    }

    const items = await this.page.evaluate(async () => {

      const rows = document.querySelectorAll<HTMLElement>(".s-main-slot.s-result-list.s-search-results.sg-row .s-result-item.s-asin")

      const items: RawItem[] = []

      for(let row of rows) {

        if (row.classList.contains("AdHolder")) {
          continue;
        }

        const titleNode = row.querySelector<HTMLElement>(".a-link-normal .a-text-normal");

        // Sometimes there is no title, I didn't fully get when it happens
        if (!titleNode) {
          continue;
        }

        const title = titleNode.innerText;
        const priceDiv = row.querySelector<HTMLElement>(".a-price .a-offscreen");
        const price = priceDiv ? priceDiv.innerText : null;
        const fullLink = row.querySelector<HTMLAnchorElement>("a.a-link-normal.a-text-normal").href;
        const link = fullLink.substr(0, fullLink.indexOf("ref="));

        items.push({ title, link, price });

      }

      return items;
  
    }); // end of page evaluate

    const parsedItems = items .filter(item => item.price !== null)
                              .map   (item => ({
                                ...item,
                                parsedPrice: Math.round(parseSyncPrice(item.price))
                              }))

    // if (parsedItems.length === 0) {
    //   logger.warn(`No items returned at all searching ${this._searchFor} on ${this._domain}.`);
    // }

    return parsedItems;

  }

  @swallowErrorsOnShutdown
  async shutdown() {
    // logger.info(`Closing search page for domain ${this._domain} and search term ${this._searchFor}.`);
    await this.page.close();
  }

}
