import { Logger } from "../../utils/logger";
import { StreamWatcher } from "../AbstractWatcher";
import { extractItemFromTweet } from "../../utils/twitter/extractors";
import { getAllRules, resetRules } from "./twitter-rules";
import { TwitterStream } from "./TwitterStream";

const rules: Rule[] = [
  { 'value': 'from:PartAlert'  },
  { 'value': 'from:DropSentry' },
];

export class TwitterV2Watcher extends StreamWatcher {

  private started = false;
  private resetRulesOnStartup: boolean;

  private logger = new Logger("twitter-v2")

  constructor(options?: { resetRules?: boolean }) {
    super();
    this.resetRulesOnStartup = options?.resetRules === true;
  }

  async prepare() {

    if(this.resetRulesOnStartup) {
      await this.resetRules();
    }
  
    if (this.started) {
      throw new Error("Cannot start twice, especially with twitter APIs!");
    }

    this.started = true;
  
    new TwitterStream({
      onTweet: async (text) => {
        try {          
          const foundItem = await extractItemFromTweet(text);
          if (foundItem.valid) {
            this.logger.info(`Found item: ${foundItem.title} (at ${foundItem.url}).`);
            foundItem && this._onItemFound.trigger({ ...foundItem, origin: "twitter-v2" });
          } else {
            this.logger.info(`Invalid item tweeted by: ${foundItem.title} (at ${foundItem.url}).`);
          }
        } catch (err) {
          this.logger.error("Impossible to extract the tweet (v2):", text);
          this.logger.error("Impossible to extract the tweet on twitter v2:", err);
        }
      },
      onHeartbeat: () => this._onHeartbeat.trigger({ time: Date.now(), type: "stream", origin: "twitter" })
    })

  }

  async start() { }

  /** Can be called once, when configuring the system. */
  async resetRules() {
    this.logger.info("Resetting Twitter rules.");
    await resetRules(rules);
  }

  async getCurrentRules() {
    return await getAllRules();
  }

}