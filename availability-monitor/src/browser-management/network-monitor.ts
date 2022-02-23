import { NetworkManager, Page, Protocol } from "puppeteer";
import { sleep } from "../utils/basics";
import { logger } from "../utils/logger";
import { isPageClosed } from "./error-management";
const util = require('util')

// type CDPRequest = Protocol.Network.RequestWillBeSentEvent | 
//                   Protocol.Network.RequestWillBeSentExtraInfoEvent | 
//                   Protocol.Network.ResponseReceivedEvent | 
//                   Protocol.Network.ResponseReceivedExtraInfoEvent;

// type EventName =  'Network.requestWillBeSent' | 
//                   'Network.requestWillBeSentExtraInfo' | 
//                   'Network.responseReceived' | 
//                   'Network.responseReceivedExtraInfo';

export async function getRequestHeaders(page: Page, url: string): Promise<Protocol.Network.Headers> {

  return new Promise(async (resolve, reject) => {

    // Start the Chrome DevTools Protocol session
    const cdpSession = await page.target().createCDPSession();

    // Enable listening to networking
    await cdpSession.send('Network.enable');

    let response;
  
    // Listen to network event
    cdpSession.on('Network.responseReceived', async (data: Protocol.Network.ResponseReceivedEvent) => {
  
      const mainFrameID = page.mainFrame()._id;
  
      if (data.type === "Document" && data.frameId === mainFrameID) {
        await cdpSession.send('Network.disable');
        const requestHeaders = data.response.requestHeaders;
        // Remove :method, :authority, :scheme and :path headers
        Object.keys(requestHeaders)
              .filter(h => h[0] === ":")
              .forEach(h => {
                delete requestHeaders[h];
              });
        response = data.response.requestHeaders;
        // Quick resolve doesn't seem the proper way, it's too fast
        // resolve(data.response.requestHeaders);
      }

    });

    try {
      // Now go to the url to see which headers are sent
      await page.goto(url);
      // // Make a reload to properly confuse amazon
      // await page.reload();
      // Now resolve
      resolve(response);
    } catch(err) {
      const isError = err instanceof Error && err.message !== undefined;
      if (isError) {
        logger.error(`Troubles opening page ${url}, error (${err.name}) is: `, err.message);
      } else {
        logger.error(`Unkown error in opening ${url}: `, err)
      }
      reject(`Troubles opening page: ${url}`);
    }

  });


}

export async function lastRequestHeadersCollector(page: Page) {

  let requestHeaders: Protocol.Network.Headers;

  // Start the Chrome DevTools Protocol session
  const cdpSession = await page.target().createCDPSession();

  // Enable listening to networking
  await cdpSession.send('Network.enable');

  // Listen to network event
  cdpSession.on('Network.responseReceived', async (data: Protocol.Network.ResponseReceivedEvent) => {

    const mainFrameID = page.mainFrame()._id;

    if (data.type === "Document" && data.frameId === mainFrameID) {
      requestHeaders = data.response.requestHeaders;
      // Remove :method, :authority, :scheme and :path headers
      Object.keys(requestHeaders)
            .filter(h => h[0] === ":")
            .forEach(h => {
              delete requestHeaders[h];
            });
    }

  });

  return {
    getRequestHeaders: () => requestHeaders,
    close: async() => {
      await cdpSession.send('Network.disable');
    }
  }

}

export async function debugRequestHeaders(page: Page) {

  let requestHeaders: Protocol.Network.Headers;

  // Start the Chrome DevTools Protocol session
  const cdpSession = await page.target().createCDPSession();

  // Enable listening to networking
  await cdpSession.send('Network.enable');

  // Listen to network event
  cdpSession.on('Network.responseReceived', async (data: Protocol.Network.ResponseReceivedEvent) => {

    const mainFrameID = page.mainFrame()._id;

    if ((data.type === "Document" || data.type === "XHR") && data.frameId === mainFrameID) {
      requestHeaders = data.response.requestHeaders;
      logger.info("New request headers: ", requestHeaders);
      // Remove :method, :authority, :scheme and :path headers
      Object.keys(requestHeaders)
            .filter(h => h[0] === ":")
            .forEach(h => {
              delete requestHeaders[h];
            });
    }

  });

  return {
    close: async() => {
      await cdpSession.send('Network.disable');
    }
  }

}

function printDataInfo(data: Protocol.Network.ResponseReceivedEvent) {

  const requestHeaders = data.response.requestHeaders;
  const responseHeaders = data.response.headers;
  const url = data.response.url;
  const requestId = data.requestId;

  console.log("************************************************");

  console.log(url);

  const cookie = requestHeaders.cookie;
  const cookiesMap: { [key: string]: string } = { };

  if (cookie) {
    cookie.split("; ").forEach(c => {
      const pos = c.indexOf("=");
      const key = c.substring(0, pos);
      const value = c.substring(pos+1);
      cookiesMap[key] = value;
    })
  }

  console.log("Request headers", requestHeaders);
  // console.log("Cookies in request: ", cookiesMap);
  console.log();

  const setCookie = responseHeaders["set-cookie"];
  const setCookiesMap: { [key: string]: string } = { };

  if (setCookie) {
    setCookie .split("\n")
              .map(s => s.substring(0, s.indexOf(";")))
              .forEach(c => {
                const pos = c.indexOf("=");
                const key = c.substring(0, pos);
                const value = c.substring(pos+1);
                setCookiesMap[key] = value;
              })
  }

  console.log("Response headers", responseHeaders);
  // console.log("Set-Cookies in response: ", setCookiesMap);
  console.log("************************************************");
  // console.log("***** RequestID: ", data.requestId);
  // while(true) {
  //   try {
  //     // console.log("Body: ", await cdpSession.send('Network.getResponseBody', { requestId }));
  //     await cdpSession.send('Network.getResponseBody', { requestId });
  //     console.log("Yes body.");
  //     break;
  //   } catch(err) {
  //     console.log("No body.");
  //     await sleep(1000);
  //   }
  // }

}

// /** Actually ended up not using it, but seemingly this function is a plan B to monitor the network. */
// async function monitorAllRequests(page: Page) {

//   const cdpRequestDataRaw = await setupLoggingOfAllNetworkData(page)

//   // Make requests.
//   await page.goto('https://www.amazon.it/')

//   // Log captured request data.
//   // console.log(JSON.stringify(cdpRequestDataRaw, null, 2))
//   // console.log(cdpRequestDataRaw);
//   // console.log(util.inspect(cdpRequestDataRaw, false, null, true /* enable colors */))

// }

