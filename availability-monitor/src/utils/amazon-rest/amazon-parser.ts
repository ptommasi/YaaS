import { extractHtmlSnippet } from "../html-work";

// Note: NotFromAmazon could also mean not available! I make no difference.
export type MerchantResult = "FromAmazon" | "NotFromAmazon" | "MaybeOtherOffers" | "NoMerchantElement" | "CaptchaActive";

export function isAmazonMerchant(html: string): MerchantResult {

  const start = html.indexOf('<div id="merchant-info"');

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
    // Sometimes there is a link to "Return policy", that is part of amazon
    if(content.indexOf("/-/en/gp/help/customer/display.html") < 0) {
      return hasOtherSellers ? "MaybeOtherOffers" : "NotFromAmazon";
    }
  }

  // There is Amazon and there are no links, further it's not US import
  if (content.indexOf("Amazon") >= 0 && content.indexOf("US") < 0) {
    return "FromAmazon";
  }

  return "NotFromAmazon";

}

const soldByIdentifier = '<div id="aod-offer-soldBy" ';

export function isAmazonOtherMerchant(html: string, documentStart=0): MerchantResult {

  const soldByStart = html.indexOf(soldByIdentifier, documentStart);

  if (soldByStart < 0) {
    if (html.indexOf('"captchacharacters"') >= 0) {
      return "CaptchaActive";
    } else {
      return "NotFromAmazon";
    }
  }

  // Just to simplify debug, remove too many blank spaces
  // const content = html.substring(soldByStart, soldByEnd).trim().replace(/\s+/g, ' ');
  // const content = html.substring(soldByStart, soldByEnd);

  const content = extractHtmlSnippet(html, soldByIdentifier, "div", documentStart);
  const soldByEnd = documentStart + content.length;

  if (content.indexOf("<a ") >= 0) {
    // console.log("This is not from Amazon", content);
    // there is a link, it's not from Amazon
    return isAmazonOtherMerchant(html, documentStart=soldByEnd);
  }

  // There is Amazon and there are no links, further it's not US import
  if (content.indexOf("Amazon") >= 0 && content.indexOf("US") < 0) {
    // console.log("this is from amazon", content);
    return "FromAmazon";
  }
  
  return isAmazonOtherMerchant(html, documentStart=soldByEnd);

}

