// Get User Tweet timeline by user ID
// https://developer.twitter.com/en/docs/twitter-api/tweets/timelines/quick-start

import { extractTweet } from "./extractors";
import { extractASIN, getAmazonDomainTLD } from "../amazon/simple-url-operations";
import { splitInChunks } from "../basics";
import { exchangeSyncGBP } from "../exchangerate";
import { logger } from "../logger";
import { getConfig } from "../config-manager";

const needle = require('needle');
const fs = require('fs');

const bearerToken = getConfig().externalServices.twitterV2.bearerToken;

export async function getAllUserTweets(userId: number | string) {

  // this is the ID for @TwitterDev
  // const userId = 2244994945;
  const url = `https://api.twitter.com/2/users/${userId}/tweets`;

  let userTweets: any = [];

  // we request the author_id expansion so that we can print out the user name later
  let params = {
    "max_results": 100,
    "tweet.fields": "created_at",
    "expansions": "author_id"
  }

  const options = {
    headers: {
      "User-Agent": "v2UserTweetsJS",
      "authorization": `Bearer ${bearerToken}`
    }
  }

  let hasNextPage = true;
  let nextToken = null;
  let userName;
  logger.info("Retrieving Tweets...");

  while (hasNextPage) {
    let resp: any = await getPage(url, params, options, nextToken);
    if (resp && resp.meta && resp.meta.result_count && resp.meta.result_count > 0) {
      userName = resp.includes.users[0].username;
      if (resp.data) {
        userTweets.push.apply(userTweets, resp.data);
      }
      if (resp.meta.next_token) {
        nextToken = resp.meta.next_token;
      } else {
        hasNextPage = false;
      }
    } else {
      hasNextPage = false;
    }
  }

  logger.info(`Got ${userTweets.length} Tweets from ${userName} (user ID ${userId})!`);

  return userTweets;

}

const getPage = async (url: string, params: any, options: any, nextToken: any) => {

  if (nextToken) {
    params.pagination_token = nextToken;
  }

  try {
    const resp = await needle('get', url, params, options);

    if (resp.statusCode != 200) {
      logger.info(`${resp.statusCode} ${resp.statusMessage}: `, resp.body);
      return;
    }
    return resp.body;
  } catch (err) {
    throw new Error(`Request failed: ${err}`);
  }
}

export async function getLastUserTweets(userId: string | number, amount: number) {

  // this is the ID for @TwitterDev
  // const userId = 2244994945;
  const url = `https://api.twitter.com/2/users/${userId}/tweets`;

  let userTweets: Tweet[] = [];

  // we request the author_id expansion so that we can print out the user name later
  let params = {
    "max_results": amount,
    "tweet.fields": "created_at",
    "expansions": "author_id"
  }

  const options = {
    headers: {
      "User-Agent": "v2UserTweetsJS",
      "authorization": `Bearer ${bearerToken}`
    }
  }

  let userName;
  logger.info("Retrieving Tweets...");

    let resp: any = await getPage(url, params, options, null);
    if (resp && resp.meta && resp.meta.result_count && resp.meta.result_count > 0) {
      userName = resp.includes.users[0].username;
      if (resp.data) {
        userTweets.push.apply(userTweets, resp.data);
      }
    }

  logger.info(`Got ${userTweets.length} Tweets from ${userName} (user ID ${userId})!`);

  return userTweets;

}

export async function storeAllPartAlertTweets(fileName: string) {

  // Example text
  //  const text = 'https://t.co/NxVwCMUWBi: Gigabyte GeForce RTX 3070 VISION OC - Scheda grafica da 8 GB\n' +
  //       'https://t.co/WXybc83XYZ\n' +
  //       'Price: €838.19 as of 0:58:47 UTC\n' +
  //       '#ad #partalert #pa_rtx3070';

  const allTweets = await getAllUserTweets("1314575666130694144");
  // const tweets = await getLastUserTweets("1314575666130694144", 5);

  // 3250 tweets to extract, more or less
  let data = JSON.stringify(allTweets, null, "\t");
  fs.writeFileSync(fileName, data);

}

export async function exportPartAlertTweets(sourceFileName: string, targetFileName: string) {

  const tweets: Tweet[] = JSON.parse(fs.readFileSync(sourceFileName));

  let extractedTweets: ExtractedTweet[] = [];
  
  
  // 100 at the time not to bomb twitter server for url extraction (and not to treat him with velvet gloves either)
  const clusters = splitInChunks(tweets, 100);

  logger.info(`Exporting ${tweets.length} tweets, split in ${clusters.length} chunks.`);

  for(let i = 0; i < clusters.length; i++) {
    logger.info(`   ... working on chunk ${i + 1}.`);
    const extractedChunk = await Promise.all( clusters[i].map( extractTweet ));
    extractedTweets = extractedTweets.concat(extractedChunk);
  }

  // Cut out missing links and fake prices (e.g. 1€)
  const goodTweets = extractedTweets.filter(t => t !== null && t.link && t.price && t.price.length > 2);

  logger.info(`Found ${goodTweets.length} useful tweets.`);

  let data = JSON.stringify(goodTweets, null, "\t");
  fs.writeFileSync(targetFileName, data);

  logger.info(`Finished extraction.`);

}

function getEurPrice(price: string) {
  const isEur = price.indexOf("€") >= 0;
  const isGbp = price.indexOf("£") >= 0;
  if (!isEur && !isGbp) {
    logger.error("Neither gbp or eur? ", price);
  }
  const digits = price.replace("£", "").replace("€", "").replace(",", "");
  const parsedPrice = parseInt(digits);
  if (isGbp) {
    return Math.round(exchangeSyncGBP(parsedPrice));
  } else {
    return parsedPrice;
  }
}

export async function organisePartAlertTweets(sourceFileName: string, targetFileName: string) {

  const tweets: ExtractedTweet[] = JSON.parse(fs.readFileSync(sourceFileName));

  const organisedTweets = tweets.filter(t => t.link.indexOf("www.amazon.") >= 0)
                                .map(t => ({
                                  ...t, 
                                  eurPrice: getEurPrice(t.price),
                                  asin: extractASIN(t.link),
                                  tld: getAmazonDomainTLD(t.link),
                                }));

  let data = JSON.stringify(organisedTweets, null, "\t");
  fs.writeFileSync(targetFileName, data);

  logger.info(`Finished extraction.`);

}