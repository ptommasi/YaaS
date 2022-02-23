import axios, { AxiosError, AxiosResponse } from "axios";
import { response } from "express";
import { getDefaultProxy } from "../../utils/config-manager";
import { sleep } from "../../utils/basics";
import { logger, loggerWithId } from "../../utils/logger";
const HttpsProxyAgent = require("https-proxy-agent");
const FormData = require('form-data');


const httpsAgent = new HttpsProxyAgent(getDefaultProxy());

const proxiedAxios = axios.create({ httpsAgent });

type FormData ={ name: string; value: string; }[];

export async function postFormDataOld(logId: string, url: string, requestHeaders: any, formData: FormData, withProxy: boolean): Promise<AxiosResponse<string>> {

  const bodyFormData = new FormData();
  formData.forEach(f => bodyFormData.append(f.name, f.value));

  const headers = { ...requestHeaders, "Content-Type": "application/x-www-form-urlencoded" }

  try {
    const response = await (withProxy ? proxiedAxios : axios).post<string>(url, bodyFormData, { headers, timeout: 10000, maxRedirects: 0 });
    // Probably it won't be returned (if redirect)
    return response;
  } catch(err) {
    if (axios.isAxiosError(err)) {
      if (err.response?.status !== 302) {
        logger.info(`Error on post data (status ${err.response.status}): `, err.response.headers);
      } else {
        logger.info(`Error on post data, no response available: `, err);
      }
      // logger.info(`Error on post data (status ${err.response.status}): `, err.response);
      return err.response as AxiosResponse<string>;
    } else {
      throw new Error("Unexpected response.");
    }
  }

}

// Almost a copy and past of getBody, need to refactor to avoid that
export async function postFormData(logId: string, url: string, requestHeaders: any, formData: FormData, withProxy: boolean, retryOnSoftError = false): Promise<BodyResponse> {

  const bodyFormData = new FormData();
  formData.forEach(f => bodyFormData.append(f.name, f.value));

  const headers = { ...requestHeaders, "Content-Type": "application/x-www-form-urlencoded" }

  try {
    const response = await (withProxy ? proxiedAxios : axios).post<string>(url, bodyFormData, { headers, timeout: 10000, maxRedirects: 0 });
    return { url, response, status: "ok" };
  } catch(err) {

    if (axios.isAxiosError(err)) {
      if (err.response?.status === 503) {
        return { url, response: err.response, status: "bot_detected" };
      }
      if (err.response?.status === 404) {
        loggerWithId.error(logId, `Wrong ${url}, product doesn't exist (status code 404).`);
        throw new Error("Product doesnt' exist");  
      }
      if (err.response?.status === 302) {
        logger.info(`Redirect received in post request for ${url} (status ${err.response.status}), location is '${err.response.headers.location}`);
        return { url, response: err.response, status: "ignore_error" };
      }
    }

    if ([ 'ERR_SOCKET_CLOSED', 'ENOTFOUND', 'ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT' ].some(c => c === err.code)) {
      loggerWithId.debug(logId, `Ignoring socket error ${err.code} at ${url} (hostname is ${err.hostname}, useful if ENOTFOUND, isAxiosError: ${axios.isAxiosError(err)}, retyOnError=${retryOnSoftError}). Message is `, err.message);
      if (retryOnSoftError) {
        loggerWithId.info(logId, "Not returning error, retrying instead.");
        await sleep(3000);
        return getBody(logId, url, headers, withProxy, retryOnSoftError);
      }
      return { url, status: "ignore_error" };
    }

    loggerWithId.error(logId, `Error to fetch the page ${url} with a GET request, message: `, err.message);
    loggerWithId.error(logId, `Full error while fetching the page ${url} message: `, err);
    return { url, status: "unknown" };

  }
}

export async function getUrl(logId: string, url: string, headers: any, withProxy: boolean) {

  try {
    const response = await (withProxy ? proxiedAxios : axios).get<string>(url, { headers, timeout: 10000, maxRedirects: 0 });
    // Probably it won't be returned, if it's 302
    return response;
  } catch(err) {
    if (axios.isAxiosError(err)) {
      return err.response as AxiosResponse<string>;
    } else {
      loggerWithId.error(logId, "Unexpected error: ", err);
      throw new Error("Unexpected error.");
    }
  }

}

export interface BodyResponse {
  url: string;
  response?: AxiosResponse<string>;
  status: "ok" | "bot_detected" | "ignore_error" | "unknown";
  err?: any;
}

export async function getBody(logId: string, url: string, headers: any, withProxy: boolean, retryOnSoftError = false): Promise<BodyResponse> {
  try {
    const response = await (withProxy ? proxiedAxios : axios).get<string>(url, { headers, timeout: 10000, maxRedirects: 0 });
    return { url, response, status: "ok" };
  } catch(err) {

    if (axios.isAxiosError(err)) {
      if (err.response?.status === 503) {
        return { url, response: err.response, status: "bot_detected" };
      }
      if (err.response?.status === 404) {
        loggerWithId.error(logId, `Wrong ${url}, product doesn't exist (status code 404).`);
        throw new Error("Product doesnt' exist");  
      }
    }

    if ([ 'ERR_SOCKET_CLOSED', 'ENOTFOUND', 'ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT' ].some(c => c === err.code)) {
      loggerWithId.debug(logId, `Ignoring socket error ${err.code} at ${url} (hostname is ${err.hostname}, useful if ENOTFOUND, isAxiosError: ${axios.isAxiosError(err)}, retyOnError=${retryOnSoftError}). Message is `, err.message);
      if (retryOnSoftError) {
        loggerWithId.info(logId, "Not returning error, retrying instead.");
        await sleep(3000);
        return getBody(logId, url, headers, withProxy, retryOnSoftError);
      }
      return { url, status: "ignore_error" };
    }

    loggerWithId.error(logId, `Error to fetch the page ${url} with a GET request, message: `, err.message);
    loggerWithId.error(logId, `Full error while fetching the page ${url} message: `, err);
    return { url, status: "unknown" };

  }
}

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
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36',
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

export const getHeadersSet = (index: number) => ({ ...commonHeaders, ...browserHeaders[index % browserHeaders.length] });
