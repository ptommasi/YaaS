import { Page } from "puppeteer";
import { Logger, loggerWithId } from "../logger";
import { solveSimpleImageUrl } from "../captcha-solver";
import { playErrorSound } from "../sound-player";
import { pauseCheck } from "../pauser";
import { sleep } from "../basics";

// Image address: document.querySelector("form").querySelector("img").src
// It's like: "https://images-na.ssl-images-amazon.com/captcha/tinytuux/Captcha_rydiczuhdz.jpg"

// To get the input element: [...document.querySelector("form").querySelectorAll("input")].filter(a => a.type === "text")[0]
// It's three input, but only one is text, it returns the input element

// To get the button to click: document.querySelector("form").querySelector("button"), then call .click() on it

interface CaptchaCheck {
  url?: string;
  isCaptcha: boolean;
  hasError: boolean;
  error?: string;
}

export async function fetchCaptchaUrl(page: Page): Promise<CaptchaCheck> {
  return await page.evaluate(async () => {
    const form = document.querySelector<HTMLFormElement>('form');
    if (form === null) {
      return { isCaptcha: false, hasError: false };
    } else {
      const action = form.action.toLowerCase();
      if (action.indexOf("captcha") >= 0) {
        try {
          const url = document.querySelector("form").querySelector("img").src;
          return {
            url: url,
            isCaptcha: true,
            hasError: false,
          }
        } catch (err) {
          return {
            isCaptcha: true,
            hasError: true,
            error: `Error while getting the captcha url: ${err.message}`
          }
        }
      } else {
        return { isCaptcha: false, hasError: true, error: `I expected a captcha form, but that's what I got: ${action}` };
      }
    }
  });

}

export async function solveCaptcha(id: string, page: Page, captchaCheck: CaptchaCheck) {

  const logger = new Logger(id);

  logger.info(`Solving captcha at ${page.url()}.`);
  await pauseCheck();

  const solvedCaptcha = await solveSimpleImageUrl(id, captchaCheck.url);

  const prevValue = await page.evaluate( () => { 
    const captchaNode = document.querySelector<HTMLInputElement>("#captchacharacters");
    const prevValue = captchaNode.value;
    captchaNode.value = "";
    return prevValue;
  })

  if (prevValue) {
    logger.warn(`Captcha already had data typed in: ${prevValue}`);
  }

  // logger.info(`Captcha at ${captchaCheck.url} solved as ${solvedCaptcha}, I will type it in.`);

  await page.type('#captchacharacters', solvedCaptcha, { delay: 20 });

  try {
    // await page.click('form button');
    await page.evaluate(async () => {
      document.querySelector<HTMLElement>('form[action="/errors/validateCaptcha"] button[type="submit"]').click();
    });
    // TODO Come with something better ... url doesn't change, but page changes, so it would break navigation if I do evaluate of something
    await page.waitForFunction(() => !document.querySelector("#captchacharacters"), { timeout: 30000 });
  } catch(err) {
    logger.error(`I tried to solve a captcha at ${page.url()}, but I had troubles in clicking it. Here the captcha info: `, err.message);
  }

  // await Promise.all([
  //   page.click('form button'),
  //   // No need to await, let's leave the task for the one calling
  //   // page.waitForNavigation({ waitUntil: 'networkidle0' }),
  // ]);

}

export async function solveAmazonCaptcha(id: string, page: Page) {

  const logger = new Logger(id);

  await pauseCheck();
  const captchaCheck = await fetchCaptchaUrl(page);

  await pauseCheck();

  if (captchaCheck.isCaptcha && !captchaCheck.hasError) {
    await pauseCheck();
    // await page.bringToFront();
    await solveCaptcha(id, page, captchaCheck);
    loggerWithId.info(id, `Captcha found & solved at page ${page.url()}.`);
  } else if (captchaCheck.isCaptcha && captchaCheck.hasError) {
    await pauseCheck();
    loggerWithId.error(id, `Something wrong happened while getting the captcha: ${captchaCheck.error}.`);
    // await page.bringToFront();
  } else {
    await pauseCheck();
    loggerWithId.error(id, `Expecting captcha at ${page.url()}, but didn't find it!`);
  }

}