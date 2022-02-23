import { Page } from "puppeteer";
import { Logger } from "../logger";
import { sleep } from "../basics";
import { solveAmazonCaptcha } from "./captcha-detector";
import { isContextDestroyed, isContextLost, isTimeout } from "../../browser-management/error-management";

// Image address: document.querySelector("form").querySelector("img").src
// It's like: "https://images-na.ssl-images-amazon.com/captcha/tinytuux/Captcha_rydiczuhdz.jpg"

// To get the input element: [...document.querySelector("form").querySelectorAll("input")].filter(a => a.type === "text")[0]
// It's three input, but only one is text, it returns the input element

// To get the button to click: document.querySelector("form").querySelector("button"), then call .click() on it

const captchaSelector = "#captchacharacters";

/** Return true if cookies have been accepted, false if there was no question for cookies at all. */
async function checkForCookies(id: string, page: Page) {

  const logger = new Logger(id);

  const isAskingForCookies = await page.evaluate(async () => {
    const cookieQuestion = document.querySelector<HTMLFormElement>('#sp-cc-accept');
    return (cookieQuestion !== null);
  });

  if (isAskingForCookies) {
    
    const prevUrl = page.url();

    // Accept cookies might or might not redirect to the first page ...
    await page.evaluate(async () => { document.querySelector<HTMLElement>('#sp-cc-accept').click() }),
    await sleep(2000)

    logger.info(`Cookies accepted for ${page.url()}.`);
    const nextUrl = page.url();

    if (nextUrl !== prevUrl) {
      logger.info(`Accepting cookies caused the page to go from ${prevUrl} to ${nextUrl}, setting back the previous url.`);
      await page.goto(prevUrl);
    }

    // Give a bit of time for the page to eventually refresh after accepting the cookies
    return true;
  } else {
    return false;
  }
}

// Since hasSelector is called in parallel for performance, throwing exception twice might cause issue
// (promises should call reject once), thus the option to avoid exceptions.
async function hasSelector(id: string, page: Page, selector: string, timeout=30000, swallowException=false) {

  const logger = new Logger(id);

  try {
    await page.waitForSelector(selector, { timeout });
    return { selector, found: true };
  } catch(err) {
    if (isContextLost(err)) {
      // This happen when I don't await for the reload, because I'm too fast
      await sleep(200);
      logger.warn(`The selector ${selector} had his context destroyed, retrying.`);
      await page.waitForSelector(selector, { timeout });
      return { selector, found: true};
    }
    if (!isTimeout(err) && !isContextDestroyed(err)) {
      if (!swallowException) {
        logger.warn(`Waiting for selector ${selector} to exist, but I had unexpected error: `, err.message);
        throw err;
      } else {
        // logger.warn(`Exception for selector ${selector} has been swallowed.`);
      }
    }
    return { selector, found: false };
  }
}

interface SelectorSearch {
  id: string;
  page: Page;
  selector: string;
  withCookiesCheck?: boolean; // = false;
}

// Wait for a selector on amazon, and if there is a captcha solve it first.
// Optionally also accept cookies on the way (useful during preparation of pages).
export async function hasAmazonSelector(options: SelectorSearch): Promise<boolean> {

  const logger = new Logger(options.id);

  const page              = options.page
  const selector          = options.selector;
  const withCookiesCheck  = options.withCookiesCheck !== undefined ? options.withCookiesCheck : false;

  // return await hasAmazonSelectors(page, [ selector ], withCookiesCheck) === selector;

  // Do a race searching for the captcha selector and the one the user wants. The captcha expires after on purpose.
  const pageType = await Promise.race([
    hasSelector(options.id, page, selector,        30000, false),
    hasSelector(options.id, page, captchaSelector, 40000, true)
  ]);

  // NOTE: now there are four scenarios: two possible selectors (the original one and the captcha) 
  //       multiplied by two possibilities (found or not).

  // If it's captcha, solve it before doing anything else
  if (pageType.selector === captchaSelector && pageType.found) {
    logger.info("Captcha found, solving it first.");
    await solveAmazonCaptcha(options.id, page);
    // await page.goBack();
    // Recursive is the easiest, now the pageType is captcha, thus next checks will fail
    return await hasAmazonSelector(options);
  }

  if (pageType.selector === captchaSelector && !pageType.found ){
    logger.error("The captcha selector was the one that won, but it wasn't found!");
    return false;
  }

  if (pageType.selector === selector && !pageType.found ){
    logger.error(`Selector ${selector} not found!`);
    return false;
  } 

  if (pageType.selector  === selector && pageType.found) {

    if (withCookiesCheck) {

      const itConfirmedForCookies = await checkForCookies(options.id, page);

      if (itConfirmedForCookies) {
      //   // Wait again for the page to refresh
        await page.waitForSelector(selector);
      }

    }

    return true;

  }

  throw Error("Unreachable code.");

}

interface SelectorsSearch {
  id: string;
  page: Page;
  selectors: string[];
  withCookiesCheck?: boolean; // = false;
  ignoreFailure?: boolean; // ;false;
}

// Wait for a selector on amazon, and if there is a captcha solve it first.
// Optionally also accept cookies on the way (useful during preparation of pages).
export async function whichAmazonSelector(options: SelectorsSearch): Promise<string | null> {

  const logger = new Logger(options.id);

  const page              = options.page
  const selectors         = options.selectors;
  const withCookiesCheck  = options.withCookiesCheck !== undefined ? options.withCookiesCheck : false;
  const ignoreFailure     = options.ignoreFailure !== undefined ? options.ignoreFailure : false;

  // Swallow errors when there are multiple selectors
  const promises = selectors.map(s => hasSelector(options.id, page, s, 30000, selectors.length !== 1));

  // Do a race searching for the captcha selector and the one the user wants. The captcha expires after on purpose.
  const pageType = await Promise.race([
    ...promises,
    hasSelector(options.id, page, captchaSelector, 40000, true)
  ]);

  // logger.info("Page type found: ", pageType);

  // If it's captcha, solve it before doing anything else
  if (pageType.selector === captchaSelector && pageType.found) {
    await solveAmazonCaptcha(options.id, page);
    // Recursive is the easiest, now the pageType is captcha, thus next checks will fail
    return await whichAmazonSelector(options);
  }
  
  if (pageType.selector === captchaSelector && !pageType.found ){
    logger.error(`The captcha selector ${pageType.selector} was the one that won, but it wasn't found!`);
    return null;
  }

  if (!pageType.found ){
    if (!ignoreFailure) {
      logger.debug(`Selectors [${selectors.join()}] not found (${pageType.selector} was the first to fail)!`);
    }
    return null;
  } 

  if (pageType.found) {

    if (withCookiesCheck) {
      const itConfirmedForCookies = await checkForCookies(options.id, page);
      if (itConfirmedForCookies) {
        // Wait again for the page to refresh
        await page.waitForSelector(pageType.selector);
      }
    }

    return pageType.selector;

  }

  throw Error("Unreachable code.");

}
