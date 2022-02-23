import axios from "axios";
import { getDefaultProxy } from "./config-manager";
import { logger } from "./logger";
const HttpsProxyAgent = require("https-proxy-agent");

interface WhatsMyIP {
  ip: string;
  country: string;
  cc: string;
}

const httpsAgent = new HttpsProxyAgent(getDefaultProxy());

const proxiedAxios = axios.create({ httpsAgent });

export async function getGeoInfo(withProxy: boolean) {
  try {
    const result = await (withProxy ? proxiedAxios : axios).get<WhatsMyIP>("https://api.myip.com/");
    return result.data;
  } catch (err) {
    logger.error("Impossible to fetch geo information");
    return {
      ip: "unknown",
      country: "unknown",
      cc: "unknown"
    }
  }
}

export async function getGeoFolderName(withProxy: boolean) {
  const geoData = await getGeoInfo(withProxy);
  return `${geoData.country}-${geoData.ip}-${geoData.cc}`;
}