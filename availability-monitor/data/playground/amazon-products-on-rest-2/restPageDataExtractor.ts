import axios from "axios";
import { sleep } from "../../utils/basics";
import { logger, loggerWithId } from "../../utils/logger";
const HttpsProxyAgent = require("https-proxy-agent");

export type MerchantResult = "FromAmazon" | "NotFromAmazon" | "MaybeOtherOffers" | "NoMerchantElement" | "CaptchaActive" | "RestFailed" | "BotDetected";

function _isAmazonMerchant(html: string): MerchantResult {

  const start = html.indexOf("<div id=\"merchant-info\"");

  if (start < 0) {
    if (html.indexOf('"captchacharacters"') >= 0) {
      return "CaptchaActive";
    } else {
      return "NoMerchantElement";
    }
  }

  let end = start;
  for (; end < html.length; end++) {
    if (html[end] === ">") {
      // I want to point the character after the closing tag
      end++;
      break;
    }
  }

  const hasOtherSellers = html.indexOf(`/gp/offer-listing/`) >= 0;

  const nextDiv =  html.indexOf("<div ", end);
  const nextClose = html.indexOf("</div>", end);

  // There is a div in the div
  if (nextDiv < nextClose) {
    return hasOtherSellers ? "MaybeOtherOffers" : "NotFromAmazon";
  }

  // Just to simplify debug, remove too many blank spaces
  // const content = html.substring(end, nextClose).trim().replace(/\s+/g, ' ');
  const content = html.substring(end, nextClose);

  // If there are links, it's because it's not sold and dispatched by Amazon
  if (content.indexOf("</a>") >= 0) {
    return hasOtherSellers ? "MaybeOtherOffers" : "NotFromAmazon";
  }

  // There is Amazon and there are no links, further it's not US import
  if (content.indexOf("Amazon") >= 0 && content.indexOf("US") < 0) {
    return hasOtherSellers ? "MaybeOtherOffers" : "NotFromAmazon";
  }

  return "NotFromAmazon";

}

const soldByIdentifier = '<div id="aod-offer-soldBy" ';

function _isAmazonOtherMerchant(html: string, documentStart=0): MerchantResult {

  const soldByStart = html.indexOf(soldByIdentifier, documentStart);

  if (soldByStart < 0) {
    if (html.indexOf('"captchacharacters"') >= 0) {
      return "CaptchaActive";
    } else {
      return "NotFromAmazon";
    }
  }

  const isSubstring = (pos: number, substring: string) => {
    for(let i = 0; i < substring.length; i++) {
      if (html[pos + i] !== substring[i]) {
        return false;
      }
    }
    return true;
  }

  let openingDivs = 1;
  let closingDivs = 0;

  let soldByEnd = soldByStart + soldByIdentifier.length;

  for(; soldByEnd < html.length; soldByEnd++) {
    if (isSubstring(soldByEnd, "<div ")) {
      openingDivs++;
    } else if (isSubstring(soldByEnd, "</div>")) {
      closingDivs++;
    }

    if (openingDivs === closingDivs) {
      soldByEnd += "</div>".length;
      break;
    }

  }
  
  // Just to simplify debug, remove too many blank spaces
  // const content = html.substring(soldByStart, soldByEnd).trim().replace(/\s+/g, ' ');
  const content = html.substring(soldByStart, soldByEnd);

  if (content.indexOf("<a ") >= 0) {
    // console.log("This is not from Amazon", content);
    // there is a link, it's not from Amazon
    return _isAmazonOtherMerchant(html, documentStart=soldByEnd);
  }

  // There is Amazon and there are no links, further it's not US import
  if (content.indexOf("Amazon") >= 0 && content.indexOf("US") < 0) {
    // console.log("this is from amazon", content);
    return "FromAmazon";
  }
  
  return _isAmazonOtherMerchant(html, documentStart=soldByEnd);

}

const httpsAgent = new HttpsProxyAgent({
  host: process.env.PROXY_HOST,
  port: process.env.PROXY_PORT
});

const proxiedAxios = axios.create({ httpsAgent });

interface BodyResponse {
  body?: string;
  url: string;
  status: "ok" | "bot_detected" | "ignore_error" | "unknown" | "connection_refused";
}

export async function getBody(id: string, url: string, headers: any, withProxy: boolean): Promise<BodyResponse> {
  try {
    const body = (await (withProxy ? proxiedAxios : axios).get<string>(url, { headers, timeout: 10000 })).data;
    return { url, body, status: "ok" };
  } catch(err) {
    // api-services-support@amazon.com also appears on captcha
    if (err.response?.status === 503) {
      // loggerWithId.error(id, `Amazon caught the bot at ${url} (error code 503).`, err.response.data);
      loggerWithId.error(id, `Amazon caught the bot at ${url} (error code 503).`);
      return { url, status: "bot_detected" };
      // logger.error(`Response is: `, err.response.data);
    } else if (err.response?.status === 404) {
      loggerWithId.error(id, `Wrong ${url}, product doesn't exist (status code 404).`);
      throw new Error("Product doesnt' exist");
      // logger.error(`Response is: `, err.response.data);
    } else if (err.code === 'ERR_SOCKET_CLOSED') {
      loggerWithId.warn(id, `Amazon closed the socket at ${url}, no big deal, just ignoring.`);
      return { url, status: "ignore_error" };
    } else if (err.code === 'ENOTFOUND') {
      loggerWithId.warn(id, `Address not found at ${url} (error on ${err.hostname}), no big deal, just ignoring.`);
      return { url, status: "ignore_error" };
    } else if (err.code === 'ECONNREFUSED'){
      loggerWithId.error(id, `Error to fetch the page ${url}, connection refused: `, err.message);
      // Not sure it's the proxy or amazon
      return { url, status: "connection_refused" }
    } else if (err.code === "ECONNABORTED") {
      loggerWithId.warn(id, `Error to fetch the page ${url}, connection aborted (timeout): `, err.message);
      return { url, status: "ignore_error" };
    } else if (err.code === "ECONNRESET") {
      loggerWithId.warn(id, `Connection reset at page ${url} (probably browser closed): `, err.message);
      return { url, status: "ignore_error" };
    }  else {
      loggerWithId.error(id, `Error to fetch the page ${url} with a GET request: `, err);
      // loggerWithId.error(id, `Error to fetch the page ${url} with a GET request.`);
      return { url, status: "unknown" };
    }

  }
}

export async function isAmazonDirectMerchant(id: string, url: string, headers: any, withProxy=true): Promise<MerchantResult> {
  const r = await getBody(id, url, headers, withProxy);
  if (r.status !== "ok") {
    if (r.status === "bot_detected") {
      return "BotDetected";
    }
    // if (r.status === "connection_refused") {
    //   return "ConnectionRefused";
    // }
    return "RestFailed";

  }
  const result = _isAmazonMerchant(r.body);
  // loggerWithId.info(id, `The searched url ${url} is ${result}`);
  return result;
}

// `https://www.amazon.${tld}/gp/aod/ajax/ref=dp_aod_NEW_mbc?asin=${asin}&m=&qid=&smid=&sourcecustomerorglistid=&sourcecustomerorglistitemid=&sr=&pc=dp`

export async function isAmazonOtherMerchant(id: string, url: string, headers: any, withProxy=true): Promise<MerchantResult> {
  const r = await getBody(id, url, headers, withProxy);
  if (r.status !== "ok") {
    return r.status === "bot_detected" ? "BotDetected" : "RestFailed";
  }
  return _isAmazonOtherMerchant(r.body);
}

// export async function isAmazonMerchantOrOtherMerchant(id: string, url: string, otherUrl: string, headers: any, withProxy=true) {

//   const r = await getBody(id, url, headers, withProxy);

//   if (r.status !== "ok") {
//     return r.status === "bot_detected" ? "BotDetected" : "RestFailed";
//   }

//   const direct = _isAmazonMerchant(r.body);

//   if (direct === "CaptchaActive" || direct === "NoMerchantElement" || direct === "FromAmazon") {
//     return direct;
//   }

//   // At this point the only option is NotFromAmazon or NoMerchantElement

//   const hasOtherSellers = r.body.indexOf(`/gp/offer-listing/`) >= 0;

//   if (!hasOtherSellers) {
//     return direct;
//   }

//   await sleep(2000);

//   const otherR = await getBody(id, otherUrl, headers, withProxy);

//   if (otherR.status !== "ok") {
//     return otherR.status === "bot_detected" ? "BotDetected" : "RestFailed";
//   }

//   const other = _isAmazonOtherMerchant(otherR.body);

//   return other;

// }

// Some handy ready headers

const commonHeaders = {
  'pragma':                     'no-cache',
  'cache-control':              'no-cache',
  'sec-ch-ua-mobile':           '?0',
  'upgrade-insecure-requests':  '1',
  'accept':                     'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9',
  'sec-fetch-site':             'none',
  'sec-fetch-mode':             'navigate',
  'sec-fetch-user':             '?1',
  'sec-fetch-dest':             'document',
  'accept-encoding':            'gzip, deflate, br',
  'accept-language':            'en-US,en;q=0.9'
}

const browserHeaders = [
  // In Memory
  {
    'sec-ch-ua':  '"Google Chrome";v="65", "Chromium";v="65", ";Not A Brand";v="99"',
    'user-agent': '"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36"',
  },
  // Real Chrome
  {
    'sec-ch-ua':  '" Not A;Brand";v="99", "Chromium";v="90", "Google Chrome";v="90"',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.85 Safari/537.36',
  },
  // Canary Chrome
  {
    'sec-ch-ua':  '"Chromium";v="92", " Not A;Brand";v="99", "Google Chrome";v="92"',
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4492.0 Safari/537.36',
  }
]

// Without starting the whole HeadersManager, this is a ready example of bootstrap headers that I sniffed in the past
export const debugHeaders = { ...commonHeaders, ...browserHeaders[0] };