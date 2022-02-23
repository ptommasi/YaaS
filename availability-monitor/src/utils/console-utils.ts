import { AmazonBuyerManager } from "../amazon-buyer/AmazonBuyerManager";
import { extractASIN, isAmazonProductUrl } from "./amazon/simple-url-operations";
import { sleep } from "./basics";
import { LiteEvent } from "./EventHandler";
import { logger } from "./logger";
import { pauseRefreshers, resumeRefreshers } from "./pauser";
import { mute, unmute } from "./sound-player";
const readline = require('readline');

const Shutdown = new LiteEvent<Promise<void>>();

const NewLine  = new LiteEvent<string>();

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

let isShuttingDown = false;

// https://nodejs.org/api/readline.html
rl.on('SIGINT', async () => {
  if (isShuttingDown) {
    logger.info("Forcing shutdown, bye.");
    process.exit();
  } else {
    if (Shutdown.handlersCount === 0) {
      logger.info("No cleanup necessary, bye.");
      process.exit();
    } else {
      logger.info("Closing all opened pages in three seconds (press Ctrl+C again to quit immediately and keep the pages opened) ...");
      isShuttingDown = true;
      await sleep(3000);
      await Shutdown.atrigger();
      logger.info("All pages closed, bye.");
      process.exit();
    }
  }
});

rl.on('line', (input: string) => {
  input && NewLine.trigger(input.trim());
});

export const onShutdown = (handler: () => Promise<void>) =>    { Shutdown.on(handler) };

export const onNewLine  = (handler: (line: string) => void) => { NewLine.on(handler) };

async function sendToAmazonBuyer(line: string, buyerManager?: AmazonBuyerManager) {

  if (buyerManager) {
    const asin = extractASIN(line);
    logger.info(`Amazon product detected (${asin}), attempting purchase.`);
    await buyerManager.attemptPurchase({
      time: Date.now(),
      url: line,
      title: `<console link ${asin}>`,
      price: null,
      parsedPrice: null,
      origin: "console",
      valid: true
    });
  } else {
    logger.info("No buyer manager found, can't attempt purchase.");
  }

}

// Small util to trigger a purchase directly, or to test a link
export function readConsoleForInput(buyerManager?: AmazonBuyerManager) {

  const buyerInstructions = buyerManager ? "paste an amazon link to attempt a purchase, or " : "";

  logger.info(`Note: ${buyerInstructions}write 'pause' / 'resume' to change all pollers (page refreshers) status, or mute / unmute for sound.`);
  onNewLine(async (line) => {
    if(isAmazonProductUrl(line)) {
      await sendToAmazonBuyer(line, buyerManager);
    } else if(line.toLowerCase() === "pause") {
      pauseRefreshers();
    } else if(line.toLowerCase() === "resume") {
      resumeRefreshers();
    } else if(line.toLowerCase() === "mute") {
      mute();
    } else if(line.toLowerCase() === "unmute") {
      unmute();
    } else {
      logger.info(`'${line}' not recognized as amazon link, ignoring.`)
    }
  });

}