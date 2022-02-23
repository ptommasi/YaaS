import fs from "fs";
import { logger } from "./logger";

interface InMemoryBrowser extends AbstractBrowser {
  type: "inMemory";
  userDataDir?: string;
  userAgent?: string;
  headless: boolean;
  proxyId?: string;
}

interface RealBrowser extends AbstractBrowser {
  type: "real";
  port: string;
}

type PluginName = "stealth" | "resource-blocker-low" | "resource-blocker-high";

interface AbstractBrowser {
  id: string;
  type: "inMemory" | "real";
  plugins?: PluginName[];
}

type BrowserInstance = InMemoryBrowser | RealBrowser;

interface ProxyDefinition {
  id: string;
  host: string;
  port: number;
  default?: boolean;
}

export interface BuyerConfig {
  chromeInstanceID: string;
  checkType: "checkDirectAndOthersConcurrently" | "checkDirectThenOther" | "checkDirectOnly";
}

interface Config {

  externalServices: {
    twitterV1: {
      apiKey: string;
      apiSecret: string;
      accessToken: string;
      tokenSecret: string;
    },
    twitterV2:    { bearerToken: string; },
    '2captcha':   { token: string; },
    naiveSolver:  { address: string; }
  },

  proxies: ProxyDefinition[],

  chromeInstances: BrowserInstance[];

  watchers: {
    currysWatcher: { 
      chromeInstanceID: string;
    };
    partAlert: {
      chromeInstanceID: string
    };
    amazonSearch: {
      chromeInstanceID: string;
      domains: string[];
      searches: string[];
    },
    amazonProductsInBrowser: {
      chromeInstanceID: string;
      productsFile: string;
    },
    amazonProductsOnRest: {
      productsFile: string;
      proxied: boolean;
      cacheSessions: boolean;
    },
    amazonProductsRoundRobinOnRest: {
      productsFile: string;
      proxied: boolean;
      cacheSessions: boolean;
    }

  },

  buyers: BuyerConfig[];

  attemptDuration: {
    refreshes: number; // polling minutes
    purchase: number;  // back and forth minutes
  }

}

const configString = fs.readFileSync("./config.json");

const config: Config = JSON.parse(configString.toString());

export function getConfig() {
  return config;
}

export function getDefaultProxy() {

  if (config.proxies.length === 0) {
    logger.error("No proxies available.");
    return null;
  }

  // Either the proxy with the "default" flag either the first proxy
  const proxy = config.proxies.find(p => p.default) || config.proxies[0];

  return {
    host: proxy.host,
    port: proxy.port
  }

}