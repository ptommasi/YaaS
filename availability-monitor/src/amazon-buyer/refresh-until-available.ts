import { Page } from "puppeteer";
import { Logger } from "../utils/logger";
import { fetchProductInfo, WhenToFetch } from "../utils/amazon/parser-for-product";
import { TrayClosing } from "../utils/amazon/parser-for-other-sellers";
import { playErrorSound } from "../utils/sound-player";
import { sleep } from "../utils/basics";
import { unsafeGotoUrl } from "../browser-management/url-management";
import { isPageClosed } from "../browser-management/error-management";
import { inMinutes } from "../utils/time";
import { pauseCheck } from "../utils/pauser";
import { Availability, isPurchaseAvailable } from "./is-purchase-available";
import { getConfig } from "../utils/config-manager";


function getRate(startTime: number, attemptCount: number) {
  const secondsElapsed =  Math.round((Date.now() - startTime) / 1000);
  const rate = (attemptCount / secondsElapsed).toFixed(2);
  return rate;
}

interface Options {
  page:              Page;
  url:               string;
  item:              FoundItem;
  id:                string;
  fetchOtherSellers: WhenToFetch;
  delay:             number;
  sharedObject:      SharedPurchaseStatus;
  pollingDuration:   number;
}

export function refreshUntilAvailable(opt: Options) {

  const logger = new Logger(opt.id);

  // Stop condition received from outside
  let stop = false;

  const startTime         = Date.now();
  const pollingExpiration = Date.now() + opt.pollingDuration;

  const refreshType = (() => {
    switch(opt.fetchOtherSellers) {
      case WhenToFetch.Always:            return "[only from other sellers]";
      case WhenToFetch.Never:             return "[only buy now button    ]";
      case WhenToFetch.WhenNotAvailable:  return "[other sellers when no buy now]";
      case WhenToFetch.Both:              return "[both direct and other buy]";
    }
  })();

  const refreshForProductInfo = async () => {

    await sleep(opt.delay);
    await pauseCheck();

    const fetchOpt = { fetchOtherSellers: opt.fetchOtherSellers, trayClosing: TrayClosing.KeepOpen }

    // Can't do it in the while, it would generate a no-op (goto url without await followed
    // by a refresh without await).
    let productInfo: ProductInfo = await fetchProductInfo(opt.id, opt.page, fetchOpt);

    let attemptCount = 0;

    const isNotAvailable = () => isPurchaseAvailable(productInfo, opt.item) === Availability.NotAvailable;

    // Bomb for ~10 minutes until the product is from amazon
    while (isNotAvailable() && Date.now() < pollingExpiration && !stop) {

      if (opt.sharedObject.soldFromAmazon === false) {
        logger.info("While refreshing, someone else noticed that the seller is not amazon, so I'm stopping.");
        return null;
      }

      attemptCount++;
      unsafeGotoUrl(opt.page, opt.url); // as per unsafeGoto, don't await
      await sleep(140);
      await pauseCheck();
      productInfo = await fetchProductInfo(opt.id, opt.page, fetchOpt);
      await pauseCheck();
      if (productInfo === null) {
        logger.error(`${refreshType} No product found (null returned).`)
      }
      if(attemptCount % 25 === 0) {
        logger.debug(`${refreshType} ${attemptCount} refreshes with ${inMinutes(pollingExpiration - Date.now())} minutes left (at ${getRate(startTime, attemptCount)} refreshes per second) ...`);
      }
    }

    if (stop) {
      logger.debug(`${refreshType} Stop received.`)
      return null;
      // throw "Stop received.";
    }
  
    logger.debug(`${refreshType} Finished refreshing the page at a rate of ${getRate(startTime, attemptCount)} refreshes per second.`)
  
    const availability = isPurchaseAvailable(productInfo, opt.item);

    if (availability === Availability.NotAvailable) {
      playErrorSound();
      const minutes = Math.round(opt.pollingDuration / 1000 / 60);
      logger.info(
        `${refreshType} Tried polling for ${minutes} minutes the page with no success, item never available by Amazon after ${attemptCount} refreshes.`
      );
      throw "Timeout, polling expiration reached.";
    }

    // From others means that the price on the tweet was found from other seller
    if (availability === Availability.FromOthers) {
      playErrorSound();
      const minutes = Math.round(opt.pollingDuration / 1000 / 60);
      logger.info(`${refreshType} Tried polling for ${minutes} minutes, but product was coming from other sellers than Amazon, so I gave up.`);
      logger.info(`Product parsed from the page: `, productInfo.source);
      logger.info(`Computed data from the page: `, productInfo.computed);
      opt.sharedObject.soldFromAmazon = false;
      return productInfo;
      // throw "Product from other sellers.";
    }
  
    logger.info(`${refreshType} Product found after ${attemptCount} refreshes.`);

    return productInfo;

  }

  const promise = new Promise<{ page: Page, productInfo: ProductInfo }>(async (resolve, reject) => {

    try {
      const productInfo = await refreshForProductInfo();
      // resolving with null will stop other pages
      resolve({ page: opt.page, productInfo });
      // if (productInfo === null) {
      //  reject(`No product info fetched`);
      // } else {
      //  resolve({ page: opt.page, productInfo });
      // }
    } catch (err) {
      // Rejecting won't stop the other pages
      if (isPageClosed(err)) {
        logger.info(`${refreshType} Page has been closed, no more tries.`);
        reject(`Page closed.`);
      } else {
        logger.info(`${refreshType} Error not recognised (typeof ${(typeof err)}), message: `, err.message);
        reject(err);
      }
    }

  });

  const clear = () => stop = true;

  return { promise, clear };

}