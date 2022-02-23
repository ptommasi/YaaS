import { logger, loggerWithId } from "../utils/logger";
import { attemptPurchase } from "./buy-attempter";
import { isPageClosed } from "../browser-management/error-management";
import { extractASIN, getAmazonDomainTLD } from "../utils/amazon/simple-url-operations";
import { inMinutes } from "../utils/time";
import { bootBrowser } from "../browser-management/puppeteer-launcher";
import { BuyerConfig, getConfig } from "../utils/config-manager";
import { isGoodPurchase, isGoodTitle } from "./is-good-purchase";

// Bomb polling for 10 minutes
// const __POLLING_DURATION__ = 1000 * 60 * 10;

// First polling duration (the refreshes)
const durations = getConfig().attemptDuration;
const __POLLING_DURATION__ = 1000 * 60 * durations.refreshes;

export class AmazonBuyerManager {

  _activePurchases = new Set<string>();
  // private readonly chromeInstanceID = getConfig().buyers.chromeInstanceID;

  private readonly buyers = getConfig().buyers;

  async prepare() {
    for (let buyer of this.buyers) {
      await bootBrowser(buyer.chromeInstanceID, "AmazonBuyerManager");
    }
  }

  async attemptPurchase(item: FoundItem) {

    const asin = extractASIN(item.url);
    const tld = getAmazonDomainTLD(item.url);
    const activePurchase = `${asin}-${tld}`;

    const logId = `pre-buyer/${tld}/${asin}`;

    const goodTitle = isGoodTitle(logId, item.title);

    if (!goodTitle) {
      logger.info(`Bad title, I'm not interested into ${item.title}.`);
      return;
    }
  
    if (item.parsedPrice) {
      const worthThePrice = isGoodPurchase(logId, { title: item.title, eurPrice: item.parsedPrice, location: "directbuy" });
      if (!worthThePrice) {
        logger.info("Even if Amazon was selling the article directly, it wouldn't be a good price. Not even trying.");
        return;
      }
    }
  
    // dirty trick
    const sharedObject: SharedPurchaseStatus = {
      soldFromAmazon: null
    }

    if (this._activePurchases.has(activePurchase)) {
      logger.info(`Already working on gpu '${item.title}' in ${tld} (asin ${asin}), ignoring the same one with origin ${item.origin}.`);
      return;
    }

    logger.info("Card of interest found on amazon: ", item);

    this._activePurchases.add(activePurchase);

    // TODO: it cannot be stopped if one succeed!!!
    await Promise.all( this.buyers.map(buyer => { 
      const logId = `${buyer.chromeInstanceID}/${tld}/${asin}`;
      this.singleAttemptPurchase(logId, item, buyer, sharedObject, __POLLING_DURATION__, true);
    }));

    this._activePurchases.delete(activePurchase);

  }

  private async singleAttemptPurchase(logId: string, item: FoundItem, buyer: BuyerConfig, sharedObject: SharedPurchaseStatus, refreshDuration: number, retry: boolean) {

    let pageKeptOpen = true;
    let stillTrying = true;

    try {
      setTimeout(() => {
        if(retry && pageKeptOpen && !stillTrying) {
          logger.info("9 minutes passed, doing a quick check again.");
          // Only retry after 9 minutes if the page has been kept open
          this.singleAttemptPurchase(logId, item, buyer, sharedObject, 1000 * 60 * 2.2, false);
        }
      }, 1000 * 60 * 9);
      const before = Date.now();
      await attemptPurchase(logId, item, buyer, sharedObject, refreshDuration);
      stillTrying = false;
      loggerWithId.info(logId, `Attempt of '${item.title}' finished in ${inMinutes(Date.now() - before)}.`);
    } catch(err) {
      if (isPageClosed(err)) {
        pageKeptOpen = false;
        loggerWithId.warn(logId, `User closed the page, stopping to attempt purchase for ${item.title} (at ${item.url}).`);
      } else {
        loggerWithId.error(logId, `Unexpected error during purchase at ${item.url}:`, err);
        loggerWithId.error(logId, "Note: Error swallowed from amazon buyer manager to avoid further explosions.");
      }
    }

    loggerWithId.info(logId, `Finished to look for item from ${item.origin}: ${item.title}.`);

  }

}