import { logger } from "../../utils/logger";

const fs = require('fs');

interface ExtractedTweet {
  title: string;
  model: "3060" | "3060Ti" | "3070" | "3080" | "3090" | "6700" | "6700XT" | "6800" | "6800XT" | "6900" | "6900XT" | "Unknwown";
  link: string;
  price: string;
  timestamp: string;
}

const order = ["3060", "3060Ti", "3070", "3080", "3090", "6700", "6700XT", "6800", "6800XT", "6900", "6900XT", "Unknwown"];

export function createUrlPool(){

  const rawdata = fs.readFileSync('extracted-tweets-v2.json');
  const extractedTweets: ExtractedTweet[] = JSON.parse(rawdata);

  interface LinksMap {
    [key: string]: {
      title: string;
      model: "3060" | "3060Ti" | "3070" | "3080" | "3090" | "6700" | "6700XT" | "6800" | "6800XT" | "6900" | "6900XT" | "Unknwown";
      link: string;
      prices: any[]
    };
  }

  const linksMap = extractedTweets.reduce((map: LinksMap, t) => {

    if (!map[t.link]) {
      map[t.link] = {
        title: t.title,
        model: t.model,
        link: t.link,
        prices: []
      }
    }

    let price;

    if (t.price.startsWith("€")) {
      price = parseFloat(t.price.substring(1));
    } else if (t.price.startsWith("£")) {
      // This price is very pessimistic
      price = (parseFloat(t.price.substring(1)) * 1.15).toFixed(2);
    } else {
      console.error("No price found", t);
      throw Error("There is no price");
    }

    // map[t.link].prices.push({ price: price, at: new Date(t.timestamp).toLocaleString() });
    map[t.link].prices.push({ price, at: t.timestamp.substr(0, "2021-03-20".length) });
    return map;

  }, { });

                            // Take only the values, no need for the accumulator
  const sortedItems = Object.values(linksMap)
                            // Sort by model and price
                            .sort((a, b) => {
                              // First order by model
                              const modelDiff = order.indexOf(a.model) - order.indexOf(b.model);
                              // If it's the same model, order by price
                              return modelDiff || a.prices[0].price - b.prices[0].price;
                            })
                            // Filter only purchases from Amazon
                            .filter(item => item.link.indexOf("amazon") > 0)
                            // Filter for the model I'm interested in
                            .filter(item => [ "3060Ti", "3070", "3080" ].indexOf(item.model) >= 0)
                            // Now filter to remove the stuff which has been always too expensive
                            .filter(item => item.model === "3060Ti" ? item.prices[0].price < 450 : true)
                            .filter(item => item.model === "3070"   ? item.prices[0].price < 650 : true)
                            .filter(item => item.model === "3080"   ? item.prices[0].price < 750 : true)
                            // Add an acceptable price, to be edited in json
                            .map(item => Object.assign(item, { buyPrice: item.prices[0].price * 1.1, skip: true }))
                            .filter(item => item.prices.length > 2);

  console.dir(sortedItems, { maxArrayLength: null, depth: null });

  fs.writeFileSync('gpus-selection-v2.json', JSON.stringify(sortedItems, null, "\t"));

  logger.info(`${sortedItems.length} amazon links of interest found.`);

  return sortedItems;

}

// export function getBuyLinks() {
//   const data = fs.readFileSync('data/gpus-selection-v3.json');
//   const buyLinks = (JSON.parse(data) as BuyLink[]).filter(bl => !bl.skip);
//   logger.info(`${buyLinks.length} amazon links of interest found.`);
//   return buyLinks;
// }

// export function getBuyLinks() {
//   const data = fs.readFileSync('data/gpu-selection-19.04.2021.json');
//   const buyLinks = (JSON.parse(data) as { title: string; url: string; }[]);
//   logger.info(`${buyLinks.length} amazon links of interest found.`);
//   return buyLinks;
// }

