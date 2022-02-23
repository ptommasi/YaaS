import io from "socket.io-client";
import { logger } from "../../utils/logger";
import { onlyMinutes } from "../../utils/time";
import { StreamWatcher } from "../AbstractWatcher";

// 1000(ms) * 60(s) * 10 => 10 minutes
const __DISCONNECT_ALERT_TIMEOUT__ = 1000 * 60 * 10;
// Do the check every minute
const __CHECK_FREQUENCY__ = 1000 * 60;

export class RemoteWatcher extends StreamWatcher {

  private address: string;
  /** Last timestamp heartbeat was received. */
  private lastCheck: number;
  private isDisconnected: boolean;
  private socket: SocketIOClient.Socket;

  constructor(params: { address: string }) {
    super();
    this.address = params.address;
    this.lastCheck = Date.now();
    this.isDisconnected = false;
  }

  async prepare() {
    this.socket = io(`http://${this.address}/`, { reconnectionDelay: 30000, timeout: 10000, reconnectionAttempts: Infinity });
    // await new Promise<void>(resolve => {
      this.socket.on("connect", () => {
        logger.info(`Connected to remote watcher at ${this.address}.`);
        // resolve();
      });
    // });
  }

  async start() {

    this.socket.on("onItemFound", async (item: FoundItem) => {
      this._onItemFound.trigger(item);
    });

    this.socket.on("onHeartbeat", async (hb: Heartbeat) => {
      this.lastCheck = Date.now();
      this._onHeartbeat.trigger(hb);
    });

    setInterval(() => {
      const gap = Date.now() - this.lastCheck;
      if (gap > __DISCONNECT_ALERT_TIMEOUT__) {
        const minutes = onlyMinutes(gap);
        this.isDisconnected = true;
        // Notify every five minutes
        minutes % 5 === 0 && logger.warn(`${minutes} minute(s) passed without news from the master server.`);
      } else {
        if (this.isDisconnected) {
          this.isDisconnected = false;
          logger.info(`Connectivity from the server ${this.address} is back.`);
        }
      }
    }, __CHECK_FREQUENCY__);

  }

}