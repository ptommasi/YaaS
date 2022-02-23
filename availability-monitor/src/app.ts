'use strict';
import { Logger } from "./utils/logger";
import watchers from "./watchers/WatchersAggregator";
import { PartAlertWatcher } from "./watchers/part-alert/PartAlertWatcher";
import { TwitterV2Watcher } from "./watchers/twitter-api-v2/TwitterV2Watcher";
import { AmazonBuyerManager } from "./amazon-buyer/AmazonBuyerManager";
import { isRecentDuplicate, openItemIfRelevant } from "./utils/misc";
import { readConsoleForInput } from "./utils/console-utils";
import { buildServer } from "./utils/server";
import { AmazonProductsWatcher } from "./watchers/amazon-products-in-browser/AmazonProductsWatcher";
import { AmazonSearchWatcher } from "./watchers/amazon-search/AmazonSearchWatcher";
import { RemoteWatcher } from "./watchers/remote-watcher.ts/RemoteWatcher";
import { ConcreteWatcher } from "./watchers/AbstractWatcher";
import { TwitterV1Watcher } from "./watchers/twitter-api-v1/TwitterV1Watcher";
import { AmazonProductsWatcherOnRest } from "./watchers/amazon-products-on-rest/AmazonProductsWatcherOnRest";
import { Command, Option } from 'commander';
import { AmazonProductsWatcherRoundRobinOnRest } from "./watchers/amazon-products-round-robin-on-rest/AmazonProductsRoundRobinWatcherOnRest";

// to avoid MaxListenersExceededWarning, Infinity value is too much (I still want to detect memory leaks)
// https://github.com/puppeteer/puppeteer/issues/594
process.setMaxListeners(120);

const __WATCHER_ADDRESS__ = "192.168.42.128:8080" 
const __WATCHER_ADDRESS_LOCAL__ = "127.0.0.1:8086" 

interface Configurations {
  [configName: string]: {
    shouldBuy: boolean;
    getWatchers(): ConcreteWatcher[];
  }
}

const configurationMap: Configurations = {
  searcher: {
    shouldBuy: false,
    getWatchers: () => [ new AmazonSearchWatcher() ]
  },  
  productV3: {
    shouldBuy: false,
    getWatchers: () => [ new AmazonProductsWatcherOnRest() ]
  },
  productV1: {
    shouldBuy: false,
    getWatchers: () => [ new AmazonProductsWatcher() ]
  },
  browserWatchers: {
    shouldBuy: false,
    getWatchers: () => [ new AmazonProductsWatcher(), new AmazonSearchWatcher() ]
  },
  localbuyerside: {
    shouldBuy: false,
    getWatchers: () => [ new AmazonProductsWatcherRoundRobinOnRest() ]
  },
  localbuyermain: {
    shouldBuy: true,
    getWatchers: () => [ new RemoteWatcher({ address: __WATCHER_ADDRESS_LOCAL__ }), new TwitterV1Watcher(), new TwitterV2Watcher() ]
  },
  buyer: {
    shouldBuy: true,
    getWatchers: () => [ new RemoteWatcher({ address: __WATCHER_ADDRESS__ }), new TwitterV1Watcher(), new TwitterV2Watcher() ]
  },
  minimal: {
    shouldBuy: true,
    getWatchers: () => [ new TwitterV2Watcher(), new PartAlertWatcher() ]
  },
  standalone: {
    shouldBuy: true,
    getWatchers: () => [ new TwitterV2Watcher(), new TwitterV1Watcher(), new AmazonProductsWatcherOnRest() ]
  },
  default: {
    shouldBuy: true,
    getWatchers: () => [ new TwitterV2Watcher(), new TwitterV1Watcher() ]
  },
}


const logger = new Logger();

// Usage: npm start -- -p 8081 -b default

(async () => {

  const program = new Command();

  program .addOption(new Option('-p, --port <port>', 'port tu use').default(8080, 'Port 8080'))
          .addOption(new Option('-b, --bundle <bundle>', 'bundle to use').choices(Object.keys(configurationMap)).default("default"));

  program.parse(process.argv);

  const options = program.opts();

  logger.info(`Running with options: `, options);

  const configuration = configurationMap[options.bundle];

  watchers.addWatchers(configuration.getWatchers());

  buildServer({ port: options.port, configuration: options.bundle });

  let buyerManager: AmazonBuyerManager = undefined;

  if (configuration.shouldBuy) {

    buyerManager = new AmazonBuyerManager();
    await buyerManager.prepare();

    watchers.ItemFound.on(async (item) => {
      if (!isRecentDuplicate(item)) {
        openItemIfRelevant(item);
        await buyerManager.attemptPurchase(item);
      } else {
        logger.info(`Received duplicate item from ${item.origin}, ignoring.`);
      }
    });

  }

  await watchers.prepare();
  watchers.start();

  readConsoleForInput(buyerManager);

})();
