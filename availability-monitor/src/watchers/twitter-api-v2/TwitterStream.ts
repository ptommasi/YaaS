import { ReadableStream } from "needle";
import { getConfig } from "../../utils/config-manager";
import { sleep } from "../../utils/basics";
import { Logger } from "../../utils/logger";

const needle = require('needle');

const token = getConfig().externalServices.twitterV2.bearerToken;

const streamURL = 'https://api.twitter.com/2/tweets/search/stream';

type TweetCallback = (tweet: string) => void;
type HeartbeatCallback = () => void;

export class TwitterStream {

  private          stream:      ReadableStream;
  private readonly onTweet:     TweetCallback;
  private readonly onHeartbeat: HeartbeatCallback;

  private logger = new Logger("twitter-v2");

  constructor(params: { onTweet: TweetCallback, onHeartbeat: HeartbeatCallback }) {
    this.onTweet = params.onTweet;
    this.onHeartbeat = params.onHeartbeat;
    this._createStream();
  }

  _createStream() {

    this.stream = needle.get(streamURL, {
      headers: { "User-Agent": "v2FilterStreamJS", "Authorization": `Bearer ${token}` },
      timeout: 20000
    });

    this.stream.on('header', this._processsHeader.bind(this))
                .on('data',  this._processData   .bind(this))
                .on('err',   this._processError  .bind(this))
                .on('done',  this._processDone   .bind(this));

  }

  _processsHeader(statusCode: number, headers: any) {

    // x-rate-limit-limit indicates the number of allotted requests your client is allowed to make during the 15-minute window.
    // x-rate-limit-remaining indicates the number of requests made so far in the 15-minute window.
    // x-rate-limit-reset is a UNIX timestamp indicating when the 15-minute window will restart, resetting x-rate-limit-remaining to 0.

    const xRateLimit = headers["x-rate-limit-limit"];
    const xRateLimitRemaining =headers["x-rate-limit-remaining"];
    const xRateLimitReset = new Date(headers["x-rate-limit-reset"] * 1000).toLocaleString();

    const summary = `${xRateLimitRemaining} attempts left out of ${xRateLimit}, resetting at ${xRateLimitReset}`;

    if (statusCode === 429) {
      this.logger.info(`Can't start yet, too many connection active (${summary}).`);
    } else if (statusCode === 200) {
      this.logger.info(`Connected to twitter stream (${summary}).`);
    } else {
      this.logger.warn(`Strange status code: ${streamURL} (${summary}).`);
    }

  }

  _processData(data: any) {
    if (data instanceof Buffer) {
      this.onHeartbeat()
      // Do nothing, it's probably an empty buffer <Buffer [13, 10]> (CR LF)
      const buffer = data as Buffer;
      if (buffer.length > 2) {
        const json: MatchingTweet = JSON.parse(buffer.toString());
        // There is also an "id" field, which is not useful, nothing more
        if (json?.data?.text) {
          this.onTweet(json.data.text);
        } else {
          this.logger.debug("Received strange tweet data (no text to be parsed): ", json);
          if((json as any).errors) {
            this.logger.debug("There were errors in the twitter stream, trying to reconnect.");
            this._retryConnect();
          }
        }
      } else {
        // Needle heartbeat of ~20 seconds, regardless of the timeout in the get constructor
        // console.log(`Nothing at ${new Date().toLocaleString()}`);
      }
    } else if(data.connection_issue) {
      if (data.title === "ConnectionException" && data.connection_issue === "TooManyConnections") {
        this.logger.warn("Cannot connect at the moment, twitter is not accepting new connections (too many connections active).");
        this._retryConnect();
      } else {
        this.logger.error(`Had a connection issue: `, data);
      }
    }
  }

  _processError (error: any) {
    if (error.code !== 'ECONNRESET') {
      this.logger.error(`Error code on twitter stream: ${error.code}. Exiting.`);
    } else {
      this.logger.error("ECONNRESET received from twitter feed, retrying connection.");
      this._retryConnect();
    }
  }

  _processDone() {
    // logger.info("Twitter current stream processing closed.");
  }

  async _retryConnect() {

    this.logger.info("Removing handles from previous streams.")
    // Not sure if this is needed, but anyway better than having hanging unclosed resources
    this.stream.off('header', this._processsHeader)
                .off('data',   this._processData   )
                .off('err',    this._processError  )
                .off('done',   this._processDone   );

    // I don't really know how to close a readable stream, apparently you can't. That's shtupid.
    // Why can't Twitter just use websocket, like normal people do.
    this.stream.unpipe();
    this.stream.pause();
    try {
      (this.stream as any).destroy();
    } catch (err) {
      // https://stackoverflow.com/questions/19277094/how-to-close-a-readable-stream-before-end
      this.logger.warn("Well, I tried to destroy the stream, but destroy() doesn't exist.");
    }

    this.logger.info("Creating a new stream in 15 seconds...")
    await sleep(15000);

    this._createStream();

  }

}
