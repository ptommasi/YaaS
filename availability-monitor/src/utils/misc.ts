import { extractASIN, getAmazonDomainTLD } from "./amazon/simple-url-operations";
import { logger } from "./logger";
// import { playTaDaSound } from "./sound-player";

const open = require('open');

const activeItems = new Set<string>();

export function isRecentDuplicate(item: FoundItem) {

  const id = `[${getAmazonDomainTLD(item.url)}/${extractASIN(item.url)}]`;

  // For the next minute, ignore any same item that is received
  if (activeItems.has(id)) {
    return true;
  } else {
    activeItems.add(id);
    setTimeout(() => activeItems.delete(id), 60000);
    return false;
  }

}

export async function openItemIfRelevant(item: FoundItem) {

  if (item.url.indexOf("www.amazon.") < 0) {
    return;
  }

  if (!(~item.title.indexOf("3060") || ~item.title.indexOf("3070") || ~item.title.indexOf("3080"))) {
    return;
  }

  if (item.parsedPrice > 850) {
    return;
  }

  // It's an RTX card on Amazon
  // logger.info("Card of interest found on amazon (opening it in a tab): ", item);
  // playTaDaSound();
  // logger.info("Item is of high interest, should be opening it in the browser: ", item);
  await open(item.url);

}