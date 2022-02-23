import { Page } from "puppeteer";
import { sleep } from "../../utils/basics";

function toWrappedJSON(data: string): PartAlertItem[] | null {
  const preamble = `<html><head></head><body><pre style="word-wrap: break-word; white-space: pre-wrap;">`
  const ending   = `</pre></body></html>`
  if (data.startsWith(preamble) && data.endsWith(ending)) {      
    try {
      const core = data.substring(preamble.length, data.length - ending.length);
      return JSON.parse(core);
    } catch(err) { }
  }
  return null;
}

async function queryForData(page: Page, url: string): Promise<PartAlertItem[]> {

  await page.goto(url);

  const data = await page.content();
  const json = toWrappedJSON(data);
  if (json !== null) {
    return json;
  }

  await page.waitForNavigation();

  // logger.error(`I didn't manage to bypass url ${url}, I'll retry later.`);
  return null;

}

export async function getData(page: Page, url: string): Promise<PartAlertItem[]> {

  // Make three attempts, it returns as soon as it succeeds
  for (let i=0; i<3; i++) {

      const data = await queryForData(page, url);

      if (data === null) {
        await sleep(5000);
        continue;
      } else {
        return data;
      }

  }

}
