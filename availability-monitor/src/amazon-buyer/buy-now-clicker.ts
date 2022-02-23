import { Page } from "puppeteer";
import { hasAmazonSelector, whichAmazonSelector } from "../utils/amazon/selector";
import { waitForUrlChange } from "../utils/amazon/redirect-catcher";
import { sleep } from "../utils/basics";
import { Logger } from "../utils/logger";
import { playErrorSound, playTaDaSound } from "../utils/sound-player";
import { fetchProductInfo, WhenToFetch } from "../utils/amazon/parser-for-product";
import { isGoodPurchase } from "./is-good-purchase";
import { productToOffer } from "./product-to-offer";
import { clickOpenTray, isTrayOpen, TrayClosing } from "../utils/amazon/parser-for-other-sellers";
import { inSeconds } from "../utils/time";
import { pauseCheck } from "../utils/pauser";
import { hasUnusualRequestsAlert } from "../utils/amazon/has-unusual-request-alert";

const primeAdPageUrl   = "/buy/primeinterstitial/";
const amazonBasketUrl  = "/gp/cart/view.html";
const checkoutUrl      = "/gp/buy/spc/handlers/display.html";
const itemBoughtUrl    = "/gp/buy/thankyou/handlers/display.html";
// At the checkout, if failure occurs :(. NOTE, (&&) is special syntax, quick & dirty job
const itemVanishedPart1 = "/gp/buy/itemselect/handlers/display.html"; 
const itemVanishedPart2 = "useCase=outOfStock"; 
const itemVanishedUrl  = `${itemVanishedPart1}(&&)${itemVanishedPart2}`;

const redirectUrls = [ primeAdPageUrl, amazonBasketUrl, checkoutUrl, itemBoughtUrl, itemVanishedUrl ];

const skipPrimeButtonId1 = "#prime-declineCTA";
const skipPrimeButtonId2 = "#prime-no-thanks";
const cartItemsContainerId = "#sc-active-cart";
const cartProceedLinkId = "#hlb-ptc-btn-native";
// Warranty pane is always in the page, just not visible, it's interesting only if the aok-hidden is removed
// When it appears, the button to avoid it is document.querySelector("#attachSiNoCoverage-announce").click()
const visibleWarrantyPane = "#attach-warranty-pane:not(.aok-hidden)"
const quickBuyDialogBtnId = "#turbo-checkout-pyo-button";
// Amazon option 1 at checkout
const checkoutPageSubmitId = "#submitOrderButtonId";
// Amazon option 2 at checkout, annoying
const checkoutPagePlaceId = "#placeYourOrder";
const purchaseConfirmedId = "#widget-purchaseConfirmationStatus";
// This happens after the checkout page, when there is an error instead
const changeQuantityId = "#changeQuantityFormId";

const possibleSelectors = [ quickBuyDialogBtnId, skipPrimeButtonId1, skipPrimeButtonId2, cartItemsContainerId, cartProceedLinkId, visibleWarrantyPane, checkoutPageSubmitId, checkoutPagePlaceId, purchaseConfirmedId, changeQuantityId ]

// Useful for debugging the race
function passThrough(promise: Promise<string>, description: string): Promise<string> {
  return new Promise((resolve, reject) => {
    promise.then(value => {
              // logger.info(`Promise for ${description} result found: ${value}.`);
              resolve(value);
            })
           .catch(err => reject(err));
  });
}

interface PageState {
  info: {
      winner: string;
      isRedirect: boolean;
      isSelector: boolean;
      urls: string[];
      selectors: string[];
  };
  state: {
      isPrimeAdPage: boolean;
      isBasketPage: boolean;
      isCheckoutPage: boolean;
      isAskingCoverage: boolean;
      isQuickBuy: boolean;
      isThankYouPage: boolean;
      isVanishedPage: boolean;
  };
}

/**
 * 
 * @param page the page to monitor for changes
 * @param urls the list of urls that should trigger the redirect monitor
 * @param selectors the list of selectors that should trigger the page change
 * @param triggerPromise the promise that triggers the events (e.g. mouse click on a button)
 */
async function waitForWinner(id: string, page: Page, urls: string[], selectors: string[], triggerPromise: Promise<any>): Promise<PageState> {

  const logger = new Logger(id);

  const urlChangeMonitor = waitForUrlChange(id, page, urls);
  // const selectorsPromise = whichAmazonSelector({ page, selectors, ignoreFailure: true });

  // whichAmazonSelector returns null on failure, so I wrap it for the race
  const selectorChangePromise = new Promise<string>(async (resolve, reject) => {
    const selector = await whichAmazonSelector({ id, page, selectors, ignoreFailure: true });
    if (selector === null) {
      reject();
    } else {
      resolve(selector);
    }
  });

  const results = await Promise.all([
    triggerPromise,
    Promise.race([
      passThrough(urlChangeMonitor.promise, "url monitor"),
      passThrough(selectorChangePromise,    "selector"   )
    ])
  ]);

  urlChangeMonitor.clear();

  const winner = results[1];

  if (winner === null) {
    logger.error("The winner is null, going recursive to attempt again...")
    return waitForWinner(id, page, urls, selectors, triggerPromise);
  }

  const isRedirect = !winner.startsWith("#");
  const isSelector =  winner.startsWith("#");

  if (isRedirect) {
    logger.info(`When waiting for something to happen, I recognised a redirect to ${winner}.`);
  } else if (isSelector) {
    logger.info(`When waiting for something to happen, I recognised the new selector ${winner}.`);
  } else {
    logger.error("When waiting for something to happen, nothing happened!")
    throw Error("No change recognised.");
  }

  const isQuickBuy       = winner === quickBuyDialogBtnId;
  const isAskingCoverage = winner === visibleWarrantyPane;
  const isPrimeAdPage    = (isRedirect && winner.indexOf(primeAdPageUrl ) >= 0) || (winner === skipPrimeButtonId1 ) || (winner === skipPrimeButtonId2);
  const isBasketPage     = (isRedirect && winner.indexOf(amazonBasketUrl) >= 0) || (winner === cartItemsContainerId) || (winner === cartProceedLinkId);
  const isCheckoutPage   = (isRedirect && winner.indexOf(checkoutUrl)     >= 0) || (winner === checkoutPageSubmitId || winner === checkoutPagePlaceId);
  const isThankYouPage   = (isRedirect && winner.indexOf(itemBoughtUrl)   >= 0) || (winner === purchaseConfirmedId  );
  const isVanishedPage   = (isRedirect && winner.indexOf(itemVanishedPart1) >= 0 && winner.indexOf(itemVanishedPart2) >= 0) || (winner === changeQuantityId);

  const result = {
    info:  { winner, isRedirect, isSelector, urls, selectors },
    state: { isPrimeAdPage, isBasketPage, isCheckoutPage, isAskingCoverage, isQuickBuy, isThankYouPage, isVanishedPage }
  }

  let count = 0;

  isPrimeAdPage    && count++;
  isBasketPage     && count++;
  isCheckoutPage   && count++;
  isAskingCoverage && count++;
  isQuickBuy       && count++;
  isThankYouPage   && count++;
  isVanishedPage   && count++;

  if (count !== 1) {
    logger.error("It is not clear in which state the page is (only one state should be true): ", result);
    throw Error("Page state unclear");
  }

  // This id is sus'
  if (winner === changeQuantityId) {
    logger.info("***** I found changeQuantityId, make sure I'm at the proper page (I expect to be at isVanishedPage) ", result);
  }

  const whichState = Object.keys(result.state).filter(isX => (result.state as any)[isX] === true).map(is => is.substr(2)).join();
  logger.info(` * Current page is ${whichState}, because winner was ${winner}.`);

  return result;

}

function shortenUrl(fullUrl: string) {
  const paramStart = fullUrl.indexOf("?");
  const url = paramStart > 0 ? fullUrl.substr(0, paramStart) : fullUrl;
  return url;
}

async function goBackToProductPage(id: string, page: Page, asin: string) {

  const logger = new Logger(id);

  logger.info(`Going back to the product page.`);

  while(shortenUrl(page.url()).indexOf("/" + asin) < 0) {
    logger.info(`Currently at page ${shortenUrl(page.url())}, going back.`);
    await page.goBack();
    logger.info(`Went back to page ${shortenUrl(page.url())}.`);
    return;
  }
}

interface BuyNowOptions {
  logId: string;
  page: Page;
  asin: string;
  location: OfferLocation;
  stopTime: number;
  testRun: boolean;
  recheckContent: boolean;
}

export async function buyNow(opt: BuyNowOptions): Promise<boolean> {

  const logger = new Logger(opt.logId);

  logger.info(`***** Attempting to buy an item from ${opt.page.url()} (located in ${opt.location}).`);
  await pauseCheck();

  if(Date.now() > opt.stopTime) {
    logger.error(`I surpassed the given time for buying, not trying anymore.`);
    return false;
  }

  if (opt.recheckContent) {

    const fetchOptions = {
      fetchOtherSellers: opt.location === "othersellers" ? WhenToFetch.Always : WhenToFetch.Never,
      trayClosing:       TrayClosing.KeepOpen,
    }

    const productInfo = await fetchProductInfo(opt.logId, opt.page, fetchOptions);
    const offer = productToOffer(opt.logId, productInfo);

    if (!offer) {
      logger.info("I double checked the product, and it's not available from Amazon anymore.");
      return false;
    }

    // If it's not a test run, re-check price is still good
    if (!opt.testRun && !isGoodPurchase(opt.logId, offer)) {
      logger.info(`This time, automatic purchaser rejected the link.`)
      return false;
    }

  }

  await pauseCheck();

  if (opt.location === "othersellers") {
    logger.info(`Attempting ${opt.testRun ? "FAKE" : ""} purchase at ${opt.page.url()}, with the product being sold through other sellers.`);
  } else if (opt.location === "directbuy") {
    logger.info(`Attempting ${opt.testRun ? "FAKE" : ""} purchase at ${opt.page.url()}, with the product being directly sold by Amazon.`);
  } else if (opt.location === "othersellersquickoffer") {
    logger.info(`Attempting ${opt.testRun ? "FAKE" : ""} purchase at ${opt.page.url()}, with the product being directly sold by Amazon through a quick offer.`);
  } else {
    logger.error(`Dunno how I ended up here, location not recognised: ${opt.location}`);
  }

  // await page.bringToFront();

  let urls = redirectUrls;
  let selectors = possibleSelectors;

  let clickPromise;

  if (opt.location === "directbuy") {

    const hasBuyNowButton = await hasAmazonSelector({ id: opt.logId, page: opt.page, selector: '#buy-now-button' });
  
    if (!hasBuyNowButton) {
      logger.error("No buy now button, cannot attempt buy.");
      return false;
    }

    // Click to buy now button
    clickPromise = opt.page.evaluate(async () => { document.querySelector<HTMLElement>('#buy-now-button').click() });

  } else if (opt.location === "othersellers") {

    if (!(await isTrayOpen(opt.page))) {
      await clickOpenTray(opt.logId, opt.page);
    }

    // Click to add to basket from the other offers tray
    clickPromise = opt.page.evaluate(async () => {

      // #aod-offer is only the other options of other sellers (e.g. the not amazon ones)
      // const nodes = [ ... document.querySelectorAll("#aod-offer") ];

      // const parsedNodes = nodes.map(node => {

      //   let sellerNode = node .querySelector<HTMLElement>("#aod-offer-soldBy")
      //                         .querySelector<HTMLElement>(".a-col-right");
      //   let link = sellerNode.querySelector<HTMLElement>("a");
      //   const seller = link ? link.innerText.trim() : sellerNode.innerText.trim();

      //   const courier = node.querySelector<HTMLElement>("#aod-offer-shipsFrom")
      //                       .querySelector<HTMLElement>(".a-col-right")
      //                       .innerText
      //                       .replace("\\n", " ")
      //                       .trim();

      //   const price = node.querySelector<HTMLElement>(".a-price .a-offscreen")
      //                     .innerText;

      //   const conditions = node .querySelector<HTMLElement>("#aod-offer-heading h5")
      //                           .innerText;

      //   return { node, seller, courier, price, conditions }

      // });

      const container = document.querySelector<HTMLElement>("#aod-container");

      // Note, "Amazon Warehouse" is a seller too
      const sellers = [...container.querySelectorAll<HTMLElement>("#aod-container>:not(#aod-recommendations) #aod-offer-soldBy")]
                        .map(node => node.querySelector<HTMLElement>(".a-col-right"))
                        .map(s => {
                          const link = s.querySelector<HTMLAnchorElement>("a");
                          if (link && link.href.indexOf("/-/en/gp/help/customer/display.html") >= 0) {
                            return s.innerText.replace(link.innerText, "").trim();
                          } else {
                            return link ? link.innerText.trim() : s.innerText.trim();
                          }
                        })
  
      // For "Amazon Warehouse", "Amazon" is the courier too
      const couriers = [ ... container.querySelectorAll<HTMLElement>("#aod-container>:not(#aod-recommendations) #aod-offer-shipsFrom") ]
                          .map(node => node.querySelector<HTMLElement>(".a-col-right").innerText.replace("\\n", " ").trim())
  
      // TODO: I assume the previous check are still valid
      // const prices = [ ...container.querySelectorAll<HTMLElement>("#aod-container>:not(#aod-recommendations) .a-price .a-offscreen")].map(p => p.innerText);

      // "Used - Like New" is a chance, beside "New" or "Used"
      // const conditions = [ ...container.querySelectorAll<HTMLElement>("#aod-offer-heading h5") ].map(c => c.innerText);

      const inputNodes = [ ...container.querySelectorAll<HTMLElement>("#aod-container>:not(#aod-recommendations) input[name='submit.addToCart']") ];
      // TODO: Optimistic here, I assume all lengths are the same

      // The first element is the hidden one
      for(let i = 1; i < sellers.length; i++) {
        if (sellers[i] === "Amazon" && couriers[i] === "Amazon") {
          inputNodes[i].click();
          return;
        }
      }

      // In case the first element is not the hidden one, dunno
      if (sellers[0] === "Amazon" && couriers[0] === "Amazon") {
        inputNodes[0].click();
        return;
      }

      // const match = parsedNodes.find(pn => pn.seller === "Amazon" && pn.courier === "Amazon");

      // //alternative: match.node.querySelector("input[type=submit]");
      // match && match.node.querySelector<HTMLElement>("input[name='submit.addToCart']").click();

    });

  } else if (opt.location === "othersellersquickoffer") {

    const hasAddToBasketButton = await hasAmazonSelector({ id: opt.logId, page: opt.page, selector: '#mbc-buybutton-addtocart-1-announce' });
  
    if (!hasAddToBasketButton) {
      logger.error("No add to basket button for quick other seller, cannot attempt buy.");
      return false;
    }

    // Click to buy now button
    clickPromise = opt.page.evaluate(async () => { document.querySelector<HTMLElement>('#mbc-buybutton-addtocart-1-announce').click() });

  }

  await pauseCheck();

  let meta = await waitForWinner(opt.logId, opt.page, urls, selectors, clickPromise);

  await pauseCheck();

  // Big time, dialog straigh open?
  if (meta.state.isQuickBuy) {

    const hasFinalyBuyButton = await hasAmazonSelector({ id: opt.logId, page: opt.page, selector: quickBuyDialogBtnId });

    if (!hasFinalyBuyButton) {
      logger.error(`I was expecting the turbo checkout button, but didn't find it.`)
      return false;
    }

    if (opt.testRun) {
      playTaDaSound();
      logger.info(`This was a test run, but purchase would have been made throught quick checkout button!`);
      return true;
    } else {
      await opt.page.evaluate(async (id) => { document.body.querySelector<HTMLElement>(id).click() }, quickBuyDialogBtnId);
      playTaDaSound();
      logger.info(`Made purchase throught quick checkout button!`);
      return true;
    }

  }

  await pauseCheck();

  // Is asking for coverage?
  if (meta.state.isAskingCoverage) {
    logger.info(`Declining coverage for item.`)
    const noCoverageButtonId = "#attachSiNoCoverage-announce";
    const hasDeclineButton = await hasAmazonSelector({ id: opt.logId, page: opt.page, selector: noCoverageButtonId});
    if (!hasDeclineButton) {
      logger.error(`Asking for coverage, yet I didn't find the refuse button.`);
    } else {
      const avoidCovergePromise = opt.page.evaluate(async (id) => { document.querySelector<HTMLElement>(id).click() }, noCoverageButtonId);
      // Page is showing the panel now, don't wait for it
      selectors = selectors.filter(s => s !== visibleWarrantyPane);
      meta = await waitForWinner(opt.logId, opt.page, urls, selectors, avoidCovergePromise);
    }
  }

  await pauseCheck();

  // Am I at the amazon prime ad page?
  if (meta.state.isPrimeAdPage) {

    logger.info(`Declining amazon prime.`)

    const skipButtonId = await whichAmazonSelector({ id: opt.logId, page: opt.page, selectors: [ skipPrimeButtonId1, skipPrimeButtonId1 ] });
    logger.info(`The id to skip is '${skipButtonId}'.`)

    const hasDeclineButton = await hasAmazonSelector({ id: opt.logId, page: opt.page, selector: skipButtonId });
    if (!hasDeclineButton) {
      logger.error(`In the amazon page refusal page, yet I didn't find the refuse button.`);
    } else {
      const refusePrimePromise = opt.page.evaluate(async (id) => { document.querySelector<HTMLElement>(id).click() }, skipButtonId);
      // Page is on the ad page now, don't wait for it
      selectors = selectors.filter(s => s !== skipButtonId);
      urls = urls.filter(u => u !== primeAdPageUrl);
      meta = await waitForWinner(opt.logId, opt.page, urls, selectors, refusePrimePromise);
    }
  }

  await pauseCheck();

  // Basket page handler
  if (meta.state.isBasketPage) {

    logger.info(`At the basket checkout page.`)

    const basketSelector = await whichAmazonSelector({ id: opt.logId, page: opt.page, selectors: [ cartItemsContainerId, cartProceedLinkId ] });

    if (basketSelector === null) {
      logger.warn(`I'd expect the basket at the cart summary page (either ${cartItemsContainerId} or ${cartProceedLinkId}), but I didn't find any.`);
      await goBackToProductPage(opt.logId, opt.page, opt.asin);
      logger.info(`Looping...\n\n`);
      return buyNow({ ...opt, recheckContent: true });
    }

    if (await hasUnusualRequestsAlert(opt.page)) {
      // Full message is:
      //   Important messages for items in your Basket:
      //   We're sorry, unusual request activity on your account is preventing you from adding items to your Shopping 
      //   Basket. To learn more, please contact Customer Service.
      logger.warn(`Amazon showed the "unusual request activity" warning message at the basket page. Finger crossed now.`)
    }

    // Here it's showing the price summary
    if (basketSelector === cartItemsContainerId) {

      const cartPrice = await opt.page.evaluate(async () => {
        const basketPriceNode = document.querySelector<HTMLElement>('#sc-subtotal-amount-activecart');
        return basketPriceNode === null ? null : basketPriceNode.innerText;
      });
  
      if (cartPrice === null) {
        logger.warn(`Empty basket page returned, bad luck.`);
        await goBackToProductPage(opt.logId, opt.page, opt.asin);
        logger.info(`Looping...\n\n`);
        return buyNow({ ...opt, recheckContent: true });
      } else {
        logger.info(`Basket with ${cartPrice} value found, going further with purchase.`);
        const checkoutClick = opt.page.evaluate(async () => { document.querySelector<HTMLElement>('#sc-buy-box-ptc-button-announce').click() });
        meta = await waitForWinner(opt.logId, opt.page, urls, selectors, checkoutClick);
        if (!meta.state.isCheckoutPage) {
          logger.info(`At the basket recap, I lost.`);
          await goBackToProductPage(opt.logId, opt.page, opt.asin);
          logger.info(`Looping...\n\n`);
          return buyNow({ ...opt, recheckContent: true });
        }
      }

    } // Price summary finish

    else if (basketSelector === cartProceedLinkId) {

      logger.info(`Basket with quick overview found, going further with purchase.`);
      const checkoutClick = opt.page.evaluate(async (id) => { document.querySelector<HTMLElement>(id).click() }, cartProceedLinkId);
      meta = await waitForWinner(opt.logId, opt.page, urls, selectors, checkoutClick);
      if (!meta.state.isCheckoutPage) {
        logger.info(`At the basket recap, I lost.`);
        await goBackToProductPage(opt.logId, opt.page, opt.asin);
        logger.info(`Looping...\n\n`);
        return buyNow({ ...opt, recheckContent: true });
      }

    }


  } // End - Basket page handler

  await pauseCheck();

  // Quick checkout page (I didn't go through all the "select address, card, etc...")
  if (meta.state.isCheckoutPage) {

    const buyButtonId = await whichAmazonSelector({ id: opt.logId, page: opt.page, selectors: [ checkoutPageSubmitId, checkoutPagePlaceId ] });

    if (!buyButtonId) {
      logger.error(`I'd expect the buy button at the checkout page, but I didn't find it.`);
      return false;
    }

    // Self contained, it's just a wait
    await (async () => {

      const startTime = Date.now();

      const iterations = await opt.page.evaluate(async () => {
        let iterations = 0;
        const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
        let waiter = document.querySelector("#first-pipeline-load-page-spinner-blocker");
        // Wait for 5 seconds at most
        while(waiter !== null && iterations < 5000 / 20) {
          iterations++;
          await sleep(20);
          waiter = document.querySelector("#first-pipeline-load-page-spinner-blocker");
        }
        return iterations;
      });
  
      const endTime = Date.now();

      logger.info(`I did ${iterations} iterations (and ${inSeconds(endTime - startTime)} seconds) to wait for the checkout loading spinner to disappear.`);

    })()

    // Tiny safety wait after the spinner
    await sleep(50);

    const converted = await opt.page.evaluate(async () => {
      const gbpPayment = document.querySelector<HTMLElement>("#marketplaceRadio");
      if (gbpPayment) {
        gbpPayment.click();
        return true;
      } else {
        return false;
      }
    });

    // I changed currency (I want to pay in GBP directly, cheaper with Revolut), 
    converted && await sleep(50);

    if (opt.testRun) {

      logger.info(`In a test run, but purchase would have been made at quick checkout page.`);
      playTaDaSound();
      return true;

    } else {
      const buyClick = opt.page.evaluate(async (id) => { document.querySelector<HTMLElement>(id).click() }, buyButtonId)
      meta = await waitForWinner(opt.logId, opt.page, urls, selectors, buyClick);
    }

  } // End - quick checkout page

  await pauseCheck();

  if (meta.state.isVanishedPage) {
    logger.info(`Purchase failed :(, that's the meta: `, meta);
    logger.info(`Going back and trying again.`);
    playErrorSound();
    await goBackToProductPage(opt.logId, opt.page, opt.asin);
    logger.info(`Looping...\n\n`);
    return buyNow({ ...opt, recheckContent: true });
  }

  if(meta.state.isThankYouPage) {
    playTaDaSound();
    logger.info(`Purchase made at quick checkout page!`);
    return true;
  }

  logger.error(`URL ${opt.page.url()} did not succeed, the final meta is `, meta);
  return false;

} 