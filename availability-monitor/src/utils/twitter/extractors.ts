const expression = /(https?:\/\/(?:www\.|(?!www))[^\s\.]+\.[^\s\:]{2,}|www\.[^\s\:]+\.[^\s\:]{2,})/gi;
import axios from "axios";
import { logger } from "../logger";
import { sleep } from "../basics";
import { parseSyncPrice } from "../exchangerate";
import { getParameterByName, isAmazonProductUrl } from "../amazon/simple-url-operations";

// Twitter does a redirection, first link is in the twitter domain, 
// which when fetched will give a redirect to the real link (browser
// page hides this logic).
async function getFinalLink(link: string): Promise<string> {

  try {
    const response = await axios.get(link, { maxRedirects: 0 });
    console.warn("I don't expect to be here, direct link was not expected.")
    return link;
  } catch (err: any) {

    if (err.response?.status === 301) {
      return err.response.headers.location;
    } else if (err.code === "ECONNRESET") {
      logger.warn(`Connection reset on ${link}, waiting and retrying.`);
      await sleep(4000 * Math.random());
      // Retry in 2 seconds
      return getFinalLink(link);
    }

  }

}

export async function extractLink(text: string): Promise<string> {

  const links = text.match(expression);

  if (links === null || links.length === 0) {
    // console.error("I didn't find any link: ", text);
  } else if (links.length > 2) { 
    console.error("I didn't find the expected number of links, too many: ", text);
  } else if (links.length === 2 || links.length === 1) {
    // In the old format, the second link was the good one
    // const link = links.length === 2 ? links[1] : links[0];

    // Now the first link is the good one, try it first
    const link0 = await getFinalLink( links[0] );
    if (isAmazonProductUrl(link0)) {
      return link0;
    }

    // Check the second link
    const link1 = await getFinalLink( links[1] );
    if (isAmazonProductUrl(link1)) {
      return link1;
    }

    // Neither is amazon, maybe the first link is the good one
    return link0;

  } else if (links.length === 1) {
    return await getFinalLink(links[0]);
  } else {
    console.error([ "Unexpected number of links, double check." ].concat( links.map(l => l) ));
  }

}

const priceExpression = /([€£][\d,]+\.?[\d]{0,2})/g;

export function extractPrice(text: string) {

  const prices = text.match(priceExpression);

  if (prices === null || prices.length !== 1) {
    console.error("I didn't find an exact price on this text: ", text);
  } else{
    return prices[0];
  }

}

export function extractTitle(text: string, screen_name?: string) {
  try {
    const firstLine = text.split("\n")[0];
    return firstLine.substr( firstLine.indexOf(": ") + 2);
  } catch(err) {
    logger.info(`Cannot extract title from: `, text);
    return "<unknown>";
  }
}

export function extractModel(title: string) {

  if (title.indexOf("3090") >= 0)     return "3090";
  if (title.indexOf("3080") >= 0)     return "3080";
  if (title.indexOf("3070") >= 0)     return "3070";
  if (title.indexOf("3060 Ti") >= 0)  return "3060Ti";
  if (title.indexOf("3060Ti") >= 0)   return "3060Ti";
  if (title.indexOf("3060") >= 0)     return "3060";

  if (title.indexOf("6900 XT") >= 0)  return "6900XT";
  if (title.indexOf("6900XT") >= 0)   return "6900XT";
  if (title.indexOf("6900") >= 0)     return "6900";
  if (title.indexOf("6800 XT") >= 0)  return "6800XT";
  if (title.indexOf("6800XT") >= 0)   return "6800XT";
  if (title.indexOf("6800") >= 0)     return "6800";
  if (title.indexOf("6700 XT") >= 0)  return "6700XT";
  if (title.indexOf("6700XT") >= 0)   return "6700XT";
  if (title.indexOf("6700") >= 0)     return "6700";

  return "Unknown"

}

export async function extractItemFromTweet(text: string, screen_name?: string): Promise<FoundItem> {
  const extractedText = await extractText(text, screen_name);
  const foundItem     = await extractItem(extractedText);
  return foundItem;
}

async function extractText(text: string, screen_name?: string): Promise<ExtractedText> {

  const title = extractTitle(text, screen_name);
  const link = await extractLink(text);

  if (!link) {
    return null;
  }

  return {
    title: title,
    link: link,
    model: extractModel(title),
    price: extractPrice(text),
  };

}

async function extractItem(extractText: ExtractedText): Promise<FoundItem> {

  // logger.info("Tweet received: ", extractText);

  // Examples of links:
  // https://partalert.net/product.js?asin=B08WM28PVH&price=&smid=A3JWKAKR8XB7XF&tag=partalertde-21&timestamp=17%3A01+UTC+%2819.4.2021%29&title=EVGA+GeForce+RTX+3060+XC+Gaming%2C+12G-P5-3657-KR%2C+12GB+GDDR6%2C+Dual-L%C3%BCfter%2C+Metallr%C3%BCckplatte&tld=.de
  // https://alert.partalert.net/product?asin=B08LNWPYRS&smid=A1AT7YVPFBWXBL&tag=partalertes-21&timestamp=08%3A50+UTC+%2829.5.2021%29&title=Gigabyte+GeForce+RTX+3070+Vision+OC+-+Tarjeta+gr%C3%A1fica+%288+GB%29&tld=.es&token=0B9E1C5393F41EEB67C3B06F4F4C6E67.
  // https://www.amazon.co.uk/_itm/dp/B08KWN2LZG?tag=partalert-21&linkCode=ogi&th=1&psc=1&smid=A3P5ROKL5A1OLE
  // https://twitter.com/PartAlert/status/1384173991552638989/photo/1
  // https://www.ebuyer.com/1136701-evga-geforce-rtx-3070-8gb-xc3-ultra-gaming-graphics-card-08g-p5-3755-kr?ref=/
  // https://www.ebuyer.com/1128652-gigabyte-geforce-rtx-3070-8gb-vision-oc-ampere-graphics-card-gv-n3070vision-oc-8gd?ref=/

  // Change the link now, so the next triggering logic is the same
  if (extractText?.link?.indexOf("partalert.net/product") > 0) {

    const asin = getParameterByName("asin", extractText.link);
    const tld  = getParameterByName("tld", extractText.link);
    const smid  = getParameterByName("smid", extractText.link);
    const tag  = getParameterByName("tag", extractText.link);

    if (asin !== null && tld !== null) {
      const oldLink = extractText.link;
      extractText.link = `https://www.amazon${tld}/_itm/dp/${asin}/?tag=${tag}&smid=${smid}`;
      logger.info(`Found part alert redirect, link changed from ${oldLink} to ${extractText.link}.`);
    }

  }

  if (extractText === null) {
    console.error("Null extractText: ", extractText);
    logger.error("Extraxted text is null, error above for stacktrace!");
    return null;
  }
  
  if (extractText?.link?.indexOf("amazon") < 0) {
    logger.info(`Flagging tweet as invalid since it's not on Amazon, not interested in the link: ${extractText.link}.`);
  }

  return {
    time: Date.now(),
    url: extractText.link,
    title: extractText.title,
    price: extractText.price,
    parsedPrice: parseSyncPrice(extractText.price),
    origin: "twitter",
    valid: extractText?.link?.indexOf("amazon") > 0,
  };

}

export async function extractTweet(tweet: Tweet): Promise<ExtractedTweet> {

  const title = extractTitle(tweet.text);
  const link = await extractLink(tweet.text);

  // if (!link) {
  //   return null;
  // }

  return {
    title: title,
    link,
    model: extractModel(title),
    price: extractPrice(tweet.text),
    timestamp: tweet.created_at,
    // link is null or string, !! converts to boolean twice
    valid: !!link
  };

}


// This is an example of an old tweet from part alert (format since changed):
//   {
//     id: '1371989356337106944',
//     text: 'https://t.co/NxVwCMUWBi: Gigabyte GeForce RTX 3070 VISION OC - Scheda grafica da 8 GB\n' +
//       'https://t.co/WXybc83XYZ\n' +
//       'Price: €838.19 as of 0:58:47 UTC\n' +
//       '#ad #partalert #pa_rtx3070',
//     created_at: '2021-03-17T00:58:47.000Z',
//     author_id: '1314575666130694144'
//   },
