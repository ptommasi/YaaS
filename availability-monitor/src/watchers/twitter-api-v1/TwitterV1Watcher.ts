import { Logger } from "../../utils/logger";
import { StreamWatcher } from "../AbstractWatcher";
import Twit = require('twit');
import { extractItemFromTweet } from "../../utils/twitter/extractors";
import { getConfig } from "../../utils/config-manager";

const partAlertID = '1314575666130694144';
const dropSentryID = '1343689985447354369';

const accounts = [ partAlertID, dropSentryID ];

export class TwitterV1Watcher extends StreamWatcher {

  private twit: Twit;
  private logger = new Logger("twitter-v1");

  constructor() {

    super();

    const keys = getConfig().externalServices.twitterV1;

    this.twit = new Twit({
      consumer_key:        keys.apiKey,
      consumer_secret:     keys.apiSecret,
      access_token:        keys.accessToken,
      access_token_secret: keys.tokenSecret,
    });

  }

  async getUserData(screenName: string) {
    const result = await this.twit.get("users/show", { screen_name: screenName });
    // {
    // id: 1343689985447354400,
    // id_str: '1343689985447354369', <- this is the one
    // name: 'DropSentry 🔊',
    // screen_name: 'DropSentry',
    // .... }
    return result.data;
  }

  async prepare() {

    const stream = this.twit.stream('statuses/filter', { follow: accounts });

    stream.on("tweet", async (data: any) => {
      // I don't care if someone is tweeting *to them
      if (accounts.some(a => a === data?.user?.id_str)) {
        const full_text: string = data?.extended_tweet?.full_text;
        const plan_b: string = data?.text;
        const tweet_text = full_text || plan_b;
        try {
          const foundItem = await extractItemFromTweet(tweet_text, data?.user?.screen_name);
          if (foundItem.valid) {
            this.logger.info(`Found item from user ${data?.user?.name} (${data?.user?.screen_name}): ${foundItem.title} (at ${foundItem.url}).`);
            foundItem && this._onItemFound.trigger({ ...foundItem, origin: "twitter-v1" });
          } else {
            this.logger.info(`Invalid item tweeted by ${data?.user?.screen_name}: ${foundItem.title} (at ${foundItem.url}).`);
          }
        } catch (err) {
          this.logger.error(`Impossible to extract the tweet from ${data?.user?.screen_name} (api v1): `, tweet_text);
          this.logger.error("Impossible to extract the tweet on twitter v1, error:", err);
        }
      } else {
        const text = data?.extended_tweet?.full_text || data?.text;
        this.logger.info(`Tweet received, but ignoring since it's not from a monitored account (${data?.user?.screen_name}, "${text}").`);
      }
    })

    this.logger.info("Connected to twitter stream v1.");

  }

  async start() { }


}