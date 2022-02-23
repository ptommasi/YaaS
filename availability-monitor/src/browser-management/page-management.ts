import { Page } from "puppeteer";

/** Return usage in MB */
export async function getPageUsage(page: Page) {
  const { JSHeapUsedSize, JSHeapTotalSize } = await page.metrics();
  const used = Math.round(JSHeapUsedSize / (1024 * 1024));
  const total = Math.round(JSHeapTotalSize / (1024 * 1024));
  return { used, total };
}

export const maxHeapUsage = 64;