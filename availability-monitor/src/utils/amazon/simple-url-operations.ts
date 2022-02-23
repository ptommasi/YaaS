import { Logger } from "../logger";

const logger = new Logger();

export function getAmazonDomain(url: string) {
  const expression = /(amazon.[a-z\.]+)/g
  const match = url.match(expression);
  if (match === null) {
    logger.error(`${url} is not an amazon domain.`);
    return null;
  }
  return match[0];
}

// e.g. "fr", or "co.uk"
export function getAmazonDomainTLD(url: string) {
  const start = "amazon.".length;
  const domain = getAmazonDomain(url);
  if (domain === null) {
    return null;
  }
  return domain.substr(start);
}

// credits to: https://stackoverflow.com/questions/1764605/scrape-asin-from-amazon-url-using-javascript
const __asin_regex__ = RegExp("^http[s]?://www.amazon.[a-z.]+/([\\w-]+/)?(dp|gp/product)/(\\w+/)?(\\w{10})");

export function extractASIN(url: string) {
  const m = url.match(__asin_regex__);
  return m ? m[4] : "<unknown-asin>";
}

export function isAmazonProductUrl(url: string) {
  return __asin_regex__.test(url);
}

export function getParameterByName(name: string, url: string) {
  name = name.replace(/[\[\]]/g, '\\$&');
  var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
      results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}