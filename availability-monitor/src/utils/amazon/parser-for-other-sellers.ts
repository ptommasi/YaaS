import { Page } from "puppeteer";
import { hasAmazonSelector } from "./selector";
import { parseSyncPrice } from "../exchangerate";
import { Logger } from "../logger";
import { parseCondition } from "./parser-for-condition";

export enum TrayClosing {
  KeepOpen,
  CloseAndWait,
  CloseWithoutWaiting
}

export async function isTrayOpen(page: Page) {
  // The close button is only visible when the tray is open
  return await page.evaluate(async () => {
    return document.querySelector<HTMLElement>("#aod-close") !== null;
  })
}

async function waitForTray(id: string, page: Page) {

  const logger = new Logger(id);

  // The drawer with content ready is an annoying one, that's why so many selectors.

  // This spinner is a bit unreliable, it also appears in two different formats (as "Let's have a look" with
  // three dots when there are no other sellers at all, but tray is open, or as a rotating span when there
  // are other sellers).
  // const hasInvisibleSpinner = await hasAmazonSelector(page, "#all-offers-display-spinner.aok-hidden");

  const otherOffersCount = await hasAmazonSelector({ id, page, selector: '#aod-filter-offer-count-string' });

  if(!otherOffersCount) {
    logger.error("I expected other offers count, didn't find it in the side bar.");
    return false;
  }

  return true;

  // const hasSellersTray = await hasAmazonSelector(page, '#aod-container');
  // const hasCloseTray   = await hasAmazonSelector(page, '.aod-close-button');

  // if(!hasSellersTray) {
  //   logger.error("I expected other sellers, didn't find the side bar after click.");
  // }

  // if(!hasCloseTray) {
  //   logger.error("I expected to find the closing icon, didn't find it.");
  // }

}

export async function clickOpenTray(id: string, page: Page) {

  // Click to see the other sellers
  await page.evaluate(async () => {
    const links = [...document.querySelectorAll<HTMLAnchorElement>("#ppd a")];
    const otherSellerLinks = links.filter(a => a.href.indexOf("/gp/offer-listing/") >= 0);
    otherSellerLinks[0].click();
  });

  return await waitForTray(id, page);

}

/**
  * Getting the other sellers cannot be done on the same page, because it would throw an exception
  * (clicking on the "other sellers" link within evaluate would trigger a change of url, because
  * the side tray is pushed in the history I believe, and the change of url would trigger the
  * change of context error).
  * To avoid "Protocol error (Runtime.callFunctionOn): Execution context was destroyed." exception
  * within evaluate, I need to:
  *  - click the "other sellers" (or "new and used", or whatever is the name or location)
  *  - wait for the tray to appear (and the close button, out of simplicity)
  *  - parse the date
  *  - close the tray again to return the page to the previous view
  */
export async function fetchOtherSellers(id: string, page: Page, trayClosing: TrayClosing) {

  const logger = new Logger(id);

  let rawOtherSellers: RawOtherSellers = undefined;

  let hasTray;

  // When in the link there is aod=1, Amazon will open the tray by itself
  if (~page.url().indexOf("aod=1")) {
    // logger.info("No need to click the tray, it's gonna open by itself");
    hasTray = await waitForTray(id, page);
  } else {
    // Rarely, the url is lost (amazon change the aod with its own redirects), so the tray need to be clicked again
    // logger.info("I have to click the tray: ", page.url());
    hasTray = await clickOpenTray(id, page);
  }

  const hasContainer = await page.evaluate(async() => document.querySelector<HTMLElement>("#aod-container") !== null);
  
  if (!hasTray &&  hasContainer) {
    logger.warn(`[!!!] Other sellers tray not available at ${page.url()}, but container found. Execution will continue, but it is suspicious.`);
  }

  if ( hasTray && !hasContainer) {
    logger.error(`[!!!] Tray found, but other sellers container not available at ${page.url()}, an empty array will be returned.`);
    return [];
  }

  if (!hasTray && !hasContainer) {
    logger.warn(`No tray and no other sellers container available at ${page.url()}, an empty array will be returned.`);
    return [];
  }

  rawOtherSellers = await page.evaluate(async() => {

    // NOTE: I could have queried for querySelectorAll("#aod-offer") and then query the sub nodes (noticed after), 
    //       but the code below works, so ...

    const container = document.querySelector<HTMLElement>("#aod-container")

    // Note, "Amazon Warehouse" is a seller too
    const sellers = [...container.querySelectorAll<HTMLElement>("#aod-container>:not(#aod-recommendations) #aod-offer-soldBy")]
                      .map(node => node.querySelector<HTMLElement>(".a-col-right"))
                      .map(s => {
                        const link = s.querySelector<HTMLAnchorElement>("a");

                        // Return policy is part of the Amazon seller, remove the link
                        if (link && link.href.indexOf("/-/en/gp/help/customer/display.html") >= 0) {
                          return s.innerText.replace(link.innerText, "").trim();
                        } else {
                          return link ? link.innerText.trim() : s.innerText.trim();
                        }

                      })

    // For "Amazon Warehouse", "Amazon" is the courier too
    const couriers = [ ... container.querySelectorAll<HTMLElement>("#aod-container>:not(#aod-recommendations) #aod-offer-shipsFrom") ]
                        .map(node => node.querySelector<HTMLElement>(".a-col-right").innerText.replace("\\n", " ").trim())

    // For some reason, an array of empty string of prices is returned (it was for B08WH4RK2C in it, sold by BoraComputer)
    const prices = [ ...container.querySelectorAll<HTMLElement>("#aod-container>:not(#aod-recommendations) .a-price .a-offscreen")].map(p => p.innerText);

    // "Used - Like New" is a chance, beside "New" or "Used"
    const conditions = [ ...container.querySelectorAll<HTMLElement>("#aod-container>:not(#aod-recommendations) #aod-offer-heading h5") ].map(c => c.innerText);

    return { sellers, couriers, prices, conditions }

  })

  // Closing the tray, if asked
  if (trayClosing !== TrayClosing.KeepOpen) {
    if (trayClosing === TrayClosing.CloseAndWait) {
      await page.evaluate(async() => { 
        const closeButton = document.querySelector<HTMLElement>(".aod-close-button");
        closeButton && closeButton.click()
      });
      // await page.click(".aod-close-button");
    }
    else if (trayClosing === TrayClosing.CloseWithoutWaiting) {
      page.evaluate(async() => {
        const closeButton = document.querySelector<HTMLElement>(".aod-close-button");
        closeButton && closeButton.click()
      });
    } else {
      logger.error("Unrecognised closing tray option: ", trayClosing);
    }

  }

  let otherSellers: OtherSeller[] = [];

  if (!rawOtherSellers) {
    logger.error(`During parsing, other sellers link has been found, but an empty object has been returned from the parsing.`);
  }

  // Start of the check for other seller
  if (rawOtherSellers) {

    // shortcut
    const os = rawOtherSellers;

    const sameLength =  os.sellers.length === os.couriers.length  && 
                        os.sellers.length === os.prices.length    && 
                        os.sellers.length === os.conditions.length;

    if (!sameLength) {
      logger.error(`Sellers / couriers / prices / conditions length must be the same: `, os);
    } else {

      let i = 0;
      // If I'm not wrong, the first (hidden) item is the selected one, so it's a repetition
      const isRepetition =  os.sellers[0]    === os.sellers[1]    &&
                            os.prices[0]     === os.prices[1]     &&
                            os.couriers[0]   === os.couriers[1]   &&
                            os.conditions[0] === os.conditions[1] ;

      if (isRepetition) {
        // logger.debug(`The first and second sellers are the same, collapsing.`)
        i++;
      }

      while (i < os.sellers.length) {

        otherSellers.push({ 
          seller:          os.sellers[i], 
          price:           os.prices[i], 
          courier:         os.couriers[i], 
          condition:       os.conditions[i],
          eurPrice:        parseSyncPrice(os.prices[i]),
          parsedCondition: parseCondition(id, os.conditions[i]),
          isFromAmazon:    os.couriers[i] === "Amazon" && os.sellers[i] === "Amazon"
        });

        i++;

      }
    }

  } // End of check for other sellers

  return otherSellers;

}
