import { Page } from "puppeteer";
import { pauseCheck } from "../../utils/pauser";
import { retryOnTimeout, swallowErrorsOnShutdown } from "../../browser-management/error-management";
import { createPage, bootBrowser } from "../../browser-management/puppeteer-launcher";
import { sleep } from "../../utils/basics";
import { Logger } from "../../utils/logger";
import { LinkWatcher } from "../AbstractWatcher";
import { getConfig } from "../../utils/config-manager";

const _buyLink = "https://www.currys.ie/ieen/computing-accessories/components-upgrades/graphics-cards/msi-geforce-rtx-3060-ti-8-gb-ventus-3x-oc-graphics-card-10219341-pdt.html";

const logger = new Logger();

const browserInstanceID = getConfig().watchers.currysWatcher.chromeInstanceID;

export class CurrysWatcher extends LinkWatcher {

  private page: Page;

  getLinks() { 
    const ol: ObservedLink = {
      url:      _buyLink,
      title:    "MSI GeForce RTX 3060 Ti 8 GB VENTUS 3X OC Graphics Card",
      category: "amazon",
      origin:   "amazon-link",
      buyPrice: 700
    };
    return [ ol ];
  };

  @retryOnTimeout
  @swallowErrorsOnShutdown
  async prepare(){

    await bootBrowser(browserInstanceID, "CurrysWatcher");

    logger.info("Preparing the Currys page.");
    this.page = await createPage(browserInstanceID);
    await this.page.goto( _buyLink, { waitUntil: "domcontentloaded" } );

    await sleep(2000);

    const isAskingForCookies = await this.page.evaluate(async () => {
      const cookieQuestion = document.querySelector<HTMLFormElement>('#onetrust-accept-btn-handler');
      return (cookieQuestion !== null);
    });

    if (isAskingForCookies) {
      await this.page.evaluate(async () => {
        document.querySelector<HTMLElement>('#onetrust-accept-btn-handler').click();
      });
      logger.info(`Cookies accepted for Currys.`);
      // Give a bit of time for the page to eventually refresh after accepting the cookies
      await sleep(1000);
    } else {
    }

  }

  @retryOnTimeout
  @swallowErrorsOnShutdown
  async start() {

    while (true) {

      await pauseCheck();

      await this.page.reload();
      await this.page.waitForSelector("body");

      const result = await this.page.evaluate(async () => {
      let nodes = document.body.querySelectorAll<HTMLElement>("[data-component='add-to-basket-button-wrapper']");
      if (nodes.length > 0) {
        try {
          return "ok"
        } catch (err) { }
      } else {
        return null;
      }
      });

      if (result !== null) {
        logger.info(`Found Curry item ${_buyLink}.`);
        this._onItemFound.trigger({
          url: _buyLink,
          title: "MSI GeForce RTX 3060 Ti 8 GB VENTUS 3X OC Graphics Card",
          price: "unknown",
          parsedPrice: -1,
          origin: "currys",
          time: Date.now(),
          valid: true
        })
        break;
      }

      this._onHeartbeat.trigger({
        time: Date.now(),
        type: "link",
        origin: "currys",
        link: {
          url: _buyLink,
          title: "MSI GeForce RTX 3060 Ti 8 GB VENTUS 3X OC Graphics Card",
        }
      });

      await sleep(2500 + Math.random() * 2500);

    }

  }

  async shutdown() {
    logger.info(`Closing Currys watcher.`);
    await this.page.close();
  }

}
