import { Page } from "puppeteer";

/** I need to wrap the reload to be able to ignore timeouts or exception bombing */
export async function unsafeGotoUrl(page: Page, url: string) {
  try {
    await page.goto( url );
  } catch (err) { }
}

