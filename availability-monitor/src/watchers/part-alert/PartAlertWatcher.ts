import { bootBrowser } from "../../browser-management/puppeteer-launcher";
import { getConfig } from "../../utils/config-manager";
import { isPageClosed } from "../../browser-management/error-management";
import { SearchWatcher } from "../AbstractWatcher";
import { PartAlertSinglePoller, __PART_ALERT_DOMAIN__ } from "./PartAlertSinglePoller";

const browserInstanceID = getConfig().watchers.partAlert.chromeInstanceID;

const partAlertAPIs = [
  { term: "3060+Ti", url: "https://api.partalert.net/stock-cache/rtx3060ti" },
  { term: "3070",    url: "https://api.partalert.net/stock-cache/rtx3070"   },
  { term: "3080",    url: "https://api.partalert.net/stock-cache/rtx3080"   },
]

export class PartAlertWatcher extends SearchWatcher {

  private readonly pollers: PartAlertSinglePoller[];

  constructor() {

    super();

    this.pollers = partAlertAPIs.map(api => new PartAlertSinglePoller(api));

    this.pollers.forEach(w => {
      w.Heartbeat.on(hb => this._onHeartbeat.trigger(hb));
      w.ItemFound.on(fi => this._onItemFound.trigger(fi));
    })

  }

  async prepare() {
    await bootBrowser(browserInstanceID, "PartAlertWatcher");
    for (let poller of this.pollers) {
      await poller.prepare()
    }
  }

  async start() {
    for (let poller of this.pollers) {
      this._startSingle(poller);
    }
  }

  async _startSingle(poller: PartAlertSinglePoller) {
    try {
      await poller.start();
    } catch(err) {
      if (isPageClosed(err)) {
        console.error(`Part alert page has been closed, no more updates on ${poller.getTerm()}.`);
      } else {
        console.error(`Drama in the part alert page monitoring for ${poller.getTerm()}, throwing above.`);
        throw err;
      }
    }
  }

  getSearches() {
    const os: ObservedSearches = {
      domains: [ __PART_ALERT_DOMAIN__ ],
      terms:   partAlertAPIs.map(i => i.term)
    };
    return os;
  }

}