import { Page } from "puppeteer";

export async function hasUnusualRequestsAlert(page: Page): Promise<boolean> {
  return await page.evaluate(() => {
    const allLinks = [...document.querySelectorAll<HTMLAnchorElement>(".a-alert-content a")];
    const unusualRequestLinks = allLinks.filter(a => a.href.indexOf("help/contact-us/account-assistance.html/ref=ord_cart_std") >= 0);
    return unusualRequestLinks.length > 0;
  });
}