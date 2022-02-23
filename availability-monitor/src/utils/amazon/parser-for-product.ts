import { Page } from "puppeteer";
import { hasAmazonSelector } from "./selector";
import { parseSyncPrice } from "../exchangerate";
import { Logger } from "../logger";
import { fetchOtherSellers, TrayClosing } from "./parser-for-other-sellers";

export enum WhenToFetch {
  Always,
  Never,
  WhenNotAvailable,
  // Both at the same time
  Both
}

interface FetchOptions {
  /** When to fetch for other sellers (if there are any) */
  fetchOtherSellers: WhenToFetch;
  /** When fetching for other sellers, if the tray
   *  should be closed after finishing with it. */
  trayClosing: TrayClosing;
}

const defaultOptions = {
  fetchOtherSellers: WhenToFetch.WhenNotAvailable,
  trayClosing:       TrayClosing.CloseAndWait,
}

async function extractRawProductInfo(page: Page) {

  const source: RawProductInfo = await page.evaluate(async () => {

    /** Item title, always available */
    const productTitleNode = document.querySelector<HTMLElement> ('#productTitle');

    if (productTitleNode === null) {
      return null;
    }

    const title = productTitleNode.innerText;

    /** Availability is a bit random, it could say the date, if in stock or a 
     *  "available from these sellers" with links.        */
    const availabilityNode  = document.querySelector<HTMLElement>     ('#availability');
    
    /** Item ASIN, always available. Often used as part of the links, since it's the item id. */
    const asin              = document.querySelector<HTMLInputElement>('#ASIN').value;

    /** When there is a price, it's here. */
    const priceNodeA        = document.querySelector<HTMLElement>     ('#price_inside_buybox');
    /** But sometimes, it's in this "Buy New", when there are used offers too */
    const priceNodeB        = document.querySelector<HTMLElement>     ('#newBuyBoxPrice');

    /** Bit of randomess here, simple case is "sold and dispatched by Amazon", with no links, but there are the other
     *  cases where another seller is involved, and in that case there are links (that's how I distinguish). Another
     *  exception is when dispatched from Amazon US, there are no link and it's said dispatched by Amazon US. */
    const merchantInfoNode  = document.querySelector<HTMLElement>     ("#merchant-info");

    /** It doesn't always exist. When it does, it's actually to check for errors (if the delivery at your address). */
    const deliveryNode      = document.querySelector<HTMLElement>     ("#deliveryBlockMessage");

    /** The simplest use case, the buy now button. */
    const hasBuyNowButton   = document.querySelector("#buy-now-button") !== null;

    /** When other sellers are available, there are a couple of links directed to /gp/offer-listing/{asin}/...
      * Note that there are \~500 links in an amazon page, #ppd is to reduce the search to the top area (\~30 links) 
      * Note that you can both have a buy button and other sellers (e.g. New & Used link). */
    //  document.querySelector("#buybox-see-all-buying-choices") <- this only works if there is a button instead of "buy now"
    const otherSellersNodes = [...document.querySelectorAll<HTMLAnchorElement>("#ppd a")].filter(a => a.href.indexOf("/gp/offer-listing/") >= 0);
    const hasOtherSellers = otherSellersNodes.length > 0;

    const hasDeliveryTroubles = deliveryNode ? [...deliveryNode.querySelectorAll(".a-color-error")].length > 0 : false;
    const deliveryInfo        = deliveryNode ? deliveryNode.innerText : null; 

    const quickOfferNode = document.querySelector("#mbc-action-panel-wrapper #mbc");
    const hasQuickOtherOffer = quickOfferNode !== null;

    let quickOtherOfferPrice  = null;
    let quickOtherOfferSeller = null;

    if (hasQuickOtherOffer) {
      quickOtherOfferPrice  = quickOfferNode.querySelector<HTMLElement>("#mbc-price-1").innerText.trim();
      quickOtherOfferSeller = quickOfferNode.querySelector<HTMLElement>(".mbcMerchantName").innerText.trim();
    }

    let price               = priceNodeA ? priceNodeA.innerText : ( priceNodeB ? priceNodeB.innerText : null );
    const availability        = availabilityNode ? availabilityNode.innerText : null;
    let merchantInfo        = merchantInfoNode ? merchantInfoNode.innerText : null;
    const merchantInfoParties = merchantInfoNode ? [...merchantInfoNode.querySelectorAll("a")].map(a => a.innerText) : [];

    // Price could be null when the container is the used box
    if (price === null) {
      const priceNodeC = document.querySelector<HTMLElement>('#buyNew_noncbb');
      if(priceNodeC !== null) {
        price = priceNodeC.innerText;
        merchantInfo = "Used stuff - not worth scraping"
      }
    }

    return {
      title,
      asin,
      price, availability, merchantInfo, merchantInfoParties, hasBuyNowButton, hasDeliveryTroubles, deliveryInfo,
      hasOtherSellers,
      hasQuickOtherOffer, quickOtherOfferPrice, quickOtherOfferSeller
    };

  });

  return source;

}

export async function fetchProductInfo(id: string, page: Page, options?: Partial<FetchOptions>): Promise<ProductInfo> {

  const logger = new Logger(id);

  // Note: It waits either for #productTitle or the captcha check. If the latter is found,
  // it solves it first and then wait again.
  const hasProductTitle = await hasAmazonSelector({ id, page, selector: '#productTitle' });

  if(!hasProductTitle) {
    logger.error(`Product not found on page ${page.url()}`);
    return null;
  }

  const _options: FetchOptions = Object.assign(defaultOptions, options);

  let source = await extractRawProductInfo(page);

  // Note about is FromAmazon, being from amazon means that in the merchant infos it must be written Amazon, 
  // and there must no be any links (if there are other sellers, there are links).
  
  const eurPrice              = parseSyncPrice(source.price);
  const isAvailable           = eurPrice !== null;
  const isFromAmazon          = source.merchantInfo && source.merchantInfo.indexOf("Amazon") >= 0 && source.merchantInfo.indexOf("US") < 0 && source.merchantInfoParties.length === 0;
  const isAvailableFromAmazon = isAvailable && isFromAmazon;

  const shouldFetch = (() => { 
    switch(_options.fetchOtherSellers) {
      case WhenToFetch.Always:
        return true;
      case WhenToFetch.Both:
        return true;
      case WhenToFetch.Never:
      return false;
      case WhenToFetch.WhenNotAvailable:
        return !isAvailable;
    }
  })();

  // That is what happen when the page is flashing with the spinning icon for a very brief moment
  // if (shouldFetch && !source.hasOtherSellers) {
  //   logger.info("I should fetch other sellers, but there are none.");
  // }

  const otherSellers = shouldFetch && source.hasOtherSellers ? await fetchOtherSellers(id, page, _options.trayClosing) : [];

  const isAmazonAmongOtherSellers = otherSellers.some(s => s.seller === "Amazon");

  const isAmazonInQuickOtherOffer = source.hasQuickOtherOffer && source.quickOtherOfferSeller === "Amazon";
  const quickOtherOfferEurPrice = parseSyncPrice(source.quickOtherOfferPrice);

  const hasOfferings = isAvailableFromAmazon || (source.hasOtherSellers && otherSellers.length > 0);

  const computed: ComputedProductInfo = { 
    eurPrice, isAvailable, isFromAmazon, isAvailableFromAmazon, 
    hasOfferings, otherSellers, isAmazonAmongOtherSellers,
    isAmazonInQuickOtherOffer, quickOtherOfferEurPrice
  }

  return { source, computed };

}
