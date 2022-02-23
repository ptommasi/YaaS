import { Logger } from "../utils/logger";
import { createPage } from "../browser-management/puppeteer-launcher";
import { isGoodPurchase, isGoodTitle } from "./is-good-purchase";
import { WhenToFetch } from "../utils/amazon/parser-for-product";
import { playErrorSound, playTaDaSound, playTweetSound } from "../utils/sound-player";
import { extractASIN, getAmazonDomainTLD } from "../utils/amazon/simple-url-operations";
import { buyNow } from "./buy-now-clicker";
import { refreshUntilAvailable } from "./refresh-until-available";
import { productToOffer } from "./product-to-offer";
import { unsafeGotoUrl } from "../browser-management/url-management"
import { firstSuccess } from "../utils/basics";
import { isFromAmazon } from "./is-purchase-available";
import { BuyerConfig, getConfig } from "../utils/config-manager";


const durations = getConfig().attemptDuration;

// Bomb polling for 10 minutes
// const __POLLING_DURATION__ = 1000 * 60 * durations.refreshes;
const __BUY_DURATION__ = 1000 * 60 * durations.purchase;

export async function attemptPurchase(logId: string, item: FoundItem, buyer: BuyerConfig, sharedObject: SharedPurchaseStatus, pollingDuration: number) {

  // const tld = getAmazonDomainTLD(item.url);
  const asin = extractASIN(item.url);
  // const logId = `${item.origin}/${tld}/${asin}`;
  const logger = new Logger(logId);

  playTweetSound();
  logger.info(`Received a potentially available item at ${item.url} (${item.title}, courtesy of ${item.origin}).`);

  // Note: when refreshing two pages at the same time, Amazon will remember the settings for the tray, what
  //       will happen is that the page without the tray will start to have a double refresh to show the tray, 
  //       and the page with the tray is going to end up in a strange double refresh where the code is clicking
  //       for the tray, and then amazon is refreshing for it by itself. This double refresh causes the node with
  //       all the info to be contained in the first refresh, thus obsolete (belonging to a different document),
  //       causing errors. It's safer to just create the link (aod=1 is the drawer for the other sellers).
  const pagesToRefresh = (() => {
    if (buyer.checkType === "checkDirectAndOthersConcurrently") {
      return [
        // With delay, I give a small headstart to the page with the direct offer. If they both contains an offer from amazon, and the latter wins, it's a bit slower to refresh
        { url: `${item.url}&aod=0`, fetchOtherSellers: WhenToFetch.Never, delay: 0 },
        { url: `${item.url}&aod=1`, fetchOtherSellers: WhenToFetch.Always, delay: 1400 },
        // { url: `https://www.amazon.${tld}/_itm/dp/${asin}/?aod=0&tag=laciberneti0f-21`, fetchOtherSellers: WhenToFetch.Never, delay: 0 },
        // { url: `https://www.amazon.${tld}/_itm/dp/${asin}/ref=olp_aod_early_redir?aod=1&tag=laciberneti0f-21`, fetchOtherSellers: WhenToFetch.Always, delay: 1400 },
      ]
    }
    if (buyer.checkType === "checkDirectThenOther") {
      // return [{ url: `https://www.amazon.${tld}/_itm/dp/${asin}/?tag=laciberneti0f-21`, fetchOtherSellers: WhenToFetch.WhenNotAvailable, delay: 0 }];
      return [{ url: item.url, fetchOtherSellers: WhenToFetch.WhenNotAvailable, delay: 0 }];
    }
    if (buyer.checkType === "checkDirectOnly") {
      return [{ url: item.url, fetchOtherSellers: WhenToFetch.Never, delay: 0 }];
      // return [{ url: `https://www.amazon.${tld}/_itm/dp/${asin}/?aod=0&tag=laciberneti0f-21`, fetchOtherSellers: WhenToFetch.Never, delay: 0 }];
    }
    if (buyer.checkType === "checkDirectAndOthersTogether") {
      return [ { url: `${item.url}&aod=1`, fetchOtherSellers: WhenToFetch.Both, delay: 0 } ];
      // return [{ url: `https://www.amazon.${tld}/_itm/dp/${asin}/?aod=1&tag=laciberneti0f-21`, fetchOtherSellers: WhenToFetch.Never, delay: 0 }];
    }
    logger.error(`Configuration type not recognised: ${buyer.checkType} (for browser ${buyer.chromeInstanceID}).`);
    throw Error("Wrong configuration on purchaser.");
  })();


  // Create one dedicated browser page for all the ones I want to create to monitor
  const pages = await Promise.all(pagesToRefresh.map(async () => {
    // const page = await createPage(PageUsers.AmazonBuyer)
    // await page.setJavaScriptEnabled(false);
    // return page;
    return createPage(buyer.chromeInstanceID);
  }));

  // If I want the console output
  // page.on('console', consoleObj => logger.info(consoleObj.text()));

  // DON'T AWAIT, it's not an error, it's three times faster because fetchProductInfo will
  // await for #productInfo anyway, we are not interested in the full page to be loaded.
  pagesToRefresh.forEach((p2r, i) => unsafeGotoUrl(pages[i], p2r.url));

  logger.info(`Refreshing info (seller, price) until sold by Amazon before attempting purchase.\n\n`);

  const refreshers = pagesToRefresh.map((p2r, i) => refreshUntilAvailable({ id: logId, item, ...p2r, page: pages[i], sharedObject, pollingDuration }));

  const { page, productInfo } = await (async () => {
    try {
      return await firstSuccess(refreshers.map(r => r.promise));
    } catch (err) {
      logger.info("I didn't manage to have a lock on the product: ", err);
      return { page: null, productInfo: null };
    }
  })();

  refreshers.forEach(r => r.clear());

  if (productInfo === null) {
    logger.info(`Didn't manage to find the product sold by Amazon (or a seller, if a reference price was provided).`)
    // Page could have been closed, so I cannot close it twice
    await Promise.all(pages.map(async (p) => { try { await p.close() } catch(err){ }}));
    return;
  }

  if (!isFromAmazon(productInfo)) {
    logger.info(`Product found, but not from Amazon, so I stopped.`);
    await Promise.all(pages.map(p => p.close()));
    return;
  }

  if (productInfo.computed.isAvailableFromAmazon && productInfo.source.hasDeliveryTroubles) {
    logger.warn(`Product found from Amazon, but doesn't deliver to the address (maybe an error on their server).`);
    await Promise.all(pages.map(p => p.close()));
    return;
  }

  // This is the offer found (title, price, if from a direct "buy now" or rather from the tray)
  const offer = productToOffer(logId, productInfo);

  const shouldBuy = isGoodTitle(logId, item.title) && isGoodPurchase(logId, offer);

  if (!shouldBuy) {
    logger.info(`Automatic purchaser rejected the link.\n\n`);
    playErrorSound();
    return // <- uncomment to avoid the test run
  } else {
    logger.info(`Got green light from automatic purchase, situation getting heated.\n\n`);
    playTaDaSound();
  }

  logger.info(`Going ahead with product: `, productInfo);

  let success = await buyNow({ logId, page, asin, location: offer.location, stopTime: Date.now() + __BUY_DURATION__, testRun: !shouldBuy, recheckContent: false });

  if (success) {
    playTaDaSound();
    logger.info(`I managed to buy it!!!`);
  } else {
    logger.error(`No success in buying it.`);
  }

}
