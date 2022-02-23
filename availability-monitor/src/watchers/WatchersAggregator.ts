import { logger } from "../utils/logger";
import { AbstractWatcher, ConcreteWatcher, LinkWatcher, SearchWatcher, StreamWatcher } from "./AbstractWatcher";
import { AmazonProductsWatcher } from "./amazon-products-in-browser/AmazonProductsWatcher";
import { AmazonSearchWatcher } from "./amazon-search/AmazonSearchWatcher";
import { CurrysWatcher } from "./curry-product/CurryWatcher";
import { PartAlertWatcher } from "./part-alert/PartAlertWatcher";
import { TwitterV2Watcher } from "./twitter-api-v2/TwitterV2Watcher";

class WatchersAggregatorClass extends AbstractWatcher {

  private watchers: ConcreteWatcher[] = [];
  private bootstrapped = false;

  addWatcher(watcher: ConcreteWatcher) {
    if (this.bootstrapped) {
      throw new Error("Cannot add watcher after boostrap.");
    }
    switch(watcher.type) {
      case "link":
        this.watchers.push(watcher);
        break;
      case "search":
        this.watchers.push(watcher);
        break;
      case "stream":
        this.watchers.push(watcher);
        break;
      default:
        throw new Error(`Cannot add watcher with unrecognised type ${(watcher as any).type}.`);
    }
    watcher.Heartbeat.on(hb => this._onHeartbeat.trigger(hb));
    watcher.ItemFound.on(fi => this._onItemFound.trigger(fi));
  }

  addWatchers(watchers: ConcreteWatcher[]) {
    watchers.forEach(w => this.addWatcher(w));
  }

  async prepare() {
    if (this.bootstrapped) {
      throw new Error("Alread prepared, cannot prepare twice.");
    }
    this.bootstrapped = true;
    for (let watcher of this.watchers) {
      await watcher.prepare();
    }
  }

  async start() {
    if (!this.bootstrapped) {
      throw new Error("Cannot start monitoring without preparing first.");
    }
    for (let watcher of this.watchers) {
      watcher.start();
    }
  }

  getSearches(): ObservedSearches {

    const terms   = new Set<string>();
    const domains = new Set<string>();

    const searchWatchers: SearchWatcher[] = (this.watchers.filter(w => w.type === "search") as SearchWatcher[]);

    searchWatchers.forEach(w =>{
      w.getSearches().terms  .forEach(t => terms  .add(t));
      w.getSearches().domains.forEach(d => domains.add(d));
    })

    return {
      terms:   [...terms  ].sort(),
      domains: [...domains].sort()
    };
    
  }

  getLinks(): ObservedLink[] {
    let result: ObservedLink[] = [];
    const linkWatchers: LinkWatcher[] = (this.watchers.filter(w => w.type === "link") as LinkWatcher[]);
    linkWatchers.forEach(w => {
      result = result.concat(w.getLinks())
    })
    return result;
  }

}

export default new WatchersAggregatorClass();

