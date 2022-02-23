import { Browser, BrowserContext, Page, Puppeteer } from "puppeteer";

import axios  from "axios";
import { Logger } from "../utils/logger";
import vanillaPuppeteer from "puppeteer";
import Stealth from "puppeteer-extra-plugin-stealth";
import { onShutdown } from "../utils/console-utils";
import { getConfig } from "../utils/config-manager";

const { addExtra }    = require("puppeteer-extra");
// const Adblocker    = require('puppeteer-extra-plugin-adblocker');
const ResourceBlocker = require("puppeteer-extra-plugin-block-resources");

const logger = new Logger("browser-manager");

const inMemoryDefaultArgs = [

  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--window-size=1920,1080',

  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
  '--disable-translate',
  '--disable-background-networking',
  '--disable-domain-reliability',
  '--disable-extensions',
  '--metrics-recording-only',

  // '--disable-http2',
  // '--auto-open-devtools-for-tabs',

];

const browsersMap = new Map<string, Browser>();

function getProxyAddress(proxyId: string) {

  if (!proxyId) {
    return "direct://";
  }

  const proxy = getConfig().proxies.find(p => p.id === proxyId);

  if (!proxy) {
    logger.debug(`Proxy ${proxyId} not found for in memory browser.`)
    return "direct://";
  }

  return `http://${proxy.host}:${proxy.port}`;

}

export async function openAllInMemory() {
  logger.info("Opening all the in memory browser available, for the sake of debug.");
  const configs = getConfig().chromeInstances.filter(ci => ci.type === "inMemory");
  for(let c of configs) {
    await bootBrowser(c.id, "LauncherDebug", true);
  }
}

export async function bootBrowser(instanceId: string, requestor: string, disablePlugin=false) {

  const instance = getConfig().chromeInstances.find(ci => ci.id === instanceId);

  if (!instance) {
    logger.error(`Instance ${instanceId} not found among the instances.`);
    throw new Error("Instance not found.");
  }

  if (browsersMap.has(instance.id)) {
    if (browsersMap.get(instance.id) === null) {
      // Initialization is sequential, this is useful to detect misbehaviour
      logger.warn(`Instance ${instanceId} has been requested by ${requestor}, but it's being still computed. That shouldn't happen.`);
    } else {
      logger.info(`No need to Create browser instance ${instanceId} for requestor ${requestor}, it already exists.`);
    }
    return;
  }

  // Placehold during computation, useful to detect overlapping initializations
  browsersMap.set(instance.id, null);

  logger.info(`Creating browser instance ${instanceId} for requestor ${requestor}.`);

  // Bootstrap of puppeteer extra with plugins is shared
  const extraPuppeteer = addExtra(vanillaPuppeteer);

  !disablePlugin && instance.plugins && instance.plugins.forEach(p => {
    switch (p) {
      case "stealth":
        extraPuppeteer.use(Stealth());
        break;
      case "resource-blocker-low":
        extraPuppeteer.use(ResourceBlocker({ "blockedTypes": new Set(["stylesheet", "font", "texttrack", "other"]) }));
        break;
      case "resource-blocker-high":
        extraPuppeteer.use(ResourceBlocker({ "blockedTypes": new Set(["stylesheet", "font", "texttrack", "other", "image", "xhr", "media", "script", "svg+xml", "ping", "fetch" ]) }));
        break;  
      default:
        logger.warn("Plugin name not recognised: ", p);
    }
  });

  // In memory has it's own logic
  if (instance.type === "inMemory") {

    const proxyAddress = getProxyAddress(instance.proxyId);

    const args = [ ...inMemoryDefaultArgs ];
    instance.userDataDir && args.push(`--user-data-dir=${instance.userDataDir}`);
    instance.userAgent   && args.push(`--user-agent=${instance.userAgent}`);
    instance.proxyId     && args.push(`--proxy-server=${proxyAddress}`);

    const options: any = { headless: instance.headless, args };

    if (instance.userDataDir) {
      options["userDataDir"] = instance.userDataDir
    }

    logger.info(`In memory chrome started, ` + 
                `${instance.userDataDir ? `data will be stored under '${instance.userDataDir}'` : `no data folder specified`}, ` + 
                `${instance.proxyId ? `proxy available at ${proxyAddress}` : "no proxy specified"}.`);
    const inMemoryChrome: Browser = await extraPuppeteer.launch(options);
    onShutdown(async () => { 
      await inMemoryChrome.close();
    });

    browsersMap.set(instanceId, inMemoryChrome);

  }

  if (instance.type === "real") {

    try {
      const devResponse = await axios.get<ChromeDeveloperResponse>(`http://127.0.0.1:${instance.port}/json/version`);
      const wsChromeEndpointUrl = devResponse.data.webSocketDebuggerUrl;
      // e.g. "ws://127.0.0.1:9222/devtools/browser/b1b5ce75-638b-4546-96ac-7738ddb1db50"
      const realChrome = await extraPuppeteer.connect({ browserWSEndpoint: wsChromeEndpointUrl, defaultViewport: null });
      browsersMap.set(instanceId, realChrome);
      logger.info(`Connected to real chrome instance ${instanceId}.`);
    } catch(err) {
      logger.error(`Impossible to connect to the Chrome instance ${instance.id} at port ${instance.port}.`);
      process.exit(1);
    }

  }

}

export async function createPage(instanceId: string): Promise<Page> {
  if (!browsersMap.has(instanceId)) {
    logger.error(`Browser instance ${instanceId} doesn't exist.`);
    throw Error("A wrong instance id has been provided.");
  }
  return await browsersMap.get(instanceId).newPage();
}
