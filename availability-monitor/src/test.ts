"use stricy"
import { openAllInMemory } from "./browser-management/puppeteer-launcher";
import { Logger } from "./utils/logger";
import { TwitterV2Watcher } from "./watchers/twitter-api-v2/TwitterV2Watcher";
import { TwitterV1Watcher } from "./watchers/twitter-api-v1/TwitterV1Watcher";
import { AmazonProductsWatcherRoundRobinOnRest } from "./watchers/amazon-products-round-robin-on-rest/AmazonProductsRoundRobinWatcherOnRest";
import { extractItemFromTweet } from "./utils/twitter/extractors";

const testLinks = [
  "https://www.amazon.it/Soundcore-sovrauricolari-ripiegabili-certificato-riproduzione/dp/B07SHG4H92/?_encoding=UTF8&pd_rd_w=jg158&pf_rd_p=be446cb8-cc74-4283-9194-5e953aa35ef5&pf_rd_r=7MWDTCAZGX459PVM22R3&pd_rd_r=ec03e2ff-211a-471a-8bb8-17a9581fbb38&pd_rd_wg=ciQXf&ref_=pd_gw_crs_wish",
  "https://www.amazon.co.uk/Corsair-Responsive-Programmable-Slipstream-Technology/dp/B07VYMG9H7/",
  "https://www.amazon.de/-/en/NVIDIA-GeForce-Silent-graphics-cooling/dp/B07489XSJP/?_encoding=UTF8&pd_rd_w=j2jxW&pf_rd_p=5f3f2a19-4a06-4293-9961-38f7ec0f1bc7&pf_rd_r=HRKMZXQ8PFADYX9YEWFZ&pd_rd_r=99fc17fd-997b-4d28-8cb1-dde7da6eba38&pd_rd_wg=Xy7Fo&ref_=pd_gw_ci_mcx_mr_hp_d",
  "https://www.amazon.co.uk/Trust-Optical-Computer-Laptop-Buttons/dp/B0028YR53Q/",
  "https://www.amazon.it/FNATIC-STREAK65-Mechanical-Keyboard-Switches/dp/B08NTRJ2NV/",
  "https://www.amazon.co.uk/TiooDre-Wireless-Keyboard-Ergonomic-Desktops-Green/dp/B07YTX28D6/",
  // This keyboard has three other sellers in total
  "https://www.amazon.co.uk/Trust-Taro-Wired-Keyboard-Spill-Resistant/dp/B017KDQ0LC/",
  // Italian asus, very expensive from one other seller
  "https://www.amazon.it/_itm/dp/B08KHFZN9P",
  // Plenty of sellers here
  "https://www.amazon.co.uk/Trust-Taro-Wired-Keyboard-Spill-Resistant/dp/B08D9PZDGW/ref=sr_1_5?dchild=1&keywords=keyboard&qid=1617642801&s=computers&sr=1-5",
  // A few very expensive sellers
  "https://www.amazon.it/ASUS-DisplayPort-cuscinetti-certificazione-militare/dp/B08LLG9KQT/",
  // Doesn't deliver to ireland (battery)
  "https://www.amazon.co.uk/Battery-061384-SoundLink-Bluetooth-Speaker/dp/B07BQLM3QZ/",
  "https://www.amazon.de/_itm/dp/B08YKH7VMN",
  // Gigabyte aorus only available from othe sellers
  "https://www.amazon.it/_itm/dp/B08LNY8P5L/",
  "https://www.amazon.co.uk/Trust-Wireless-Computer-Optical-1000-1800/dp/B0746NSPQ5/"
];

const logger = new Logger("test");

(async () => {

  // logger.info("Starting");

  // const product = { "asin": "B017KDQ0LC", "title": "Trust Classicline Wired Full Size Keyboard" };
  // const product = { "asin": "B08PDP837W", "title": "EVGA GeForce RTX 3060 Ti XC Gaming" };
  // const appor = new AmazonProductPageOnRest({ tld: "co.uk", groupName: "TEST", product });
  // await appor.prepare();
  // await appor.start();

  // await openAllInMemory();

  // const tv2 = new TwitterV2Watcher();

  // console.log(await tv2.getCurrentRules());

  // const tv1 = new TwitterV1Watcher();
  // const data = await tv1.getUserData("DropSentry");;
  // console.log(data);

  // const apwrror = new AmazonProductsWatcherRoundRobinOnRest();
  // await apwrror.prepare();
  // await apwrror.start();

  const text = 'Ebuyer​.com: EXDISPLAY Gigabyte Radeon RX 6700 XT 12GB AORUS ELITE Graphics Card\n' +
  '🔗 https://t.co/rd3haCV1NY\n' +
  '💸 £730.1… https://t.co/pXbHnIvNyL';

  console.log(await extractItemFromTweet(text))

})();