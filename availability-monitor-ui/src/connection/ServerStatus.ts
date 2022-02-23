interface MetaedHeartbeat<T> {
  meta: { 
    sums: number;
    count: number;
    lastN: number[];
  },
  heartbeat: T
}

export const N = 10;

export class ServerStatus {

  // link -> Heartbeat
  private linkHeartbeatsMap: Map<string, MetaedHeartbeat<LinkHeartbeat>>;
  // domain -> term -> update
  private searchHeartbeatsMap: Map<string, Map<string, MetaedHeartbeat<SearchHeartbeat>>>;
  // list of items found
  private foundItems: FoundItem[];

  constructor(params: { searches: ObservedSearches }) {
    this.linkHeartbeatsMap = new Map();
    this.searchHeartbeatsMap = new Map();
    params.searches.domains.forEach(d => this.searchHeartbeatsMap.set(d, new Map()));
    this.foundItems = [ ];
  }

  pushFoundItem(item: FoundItem) {
    this.foundItems.push(item);
  }

  getFoundItems() {
    return this.foundItems;
  }

  addHeartbeat(hb: Heartbeat) {

    const now = Date.now();

    switch (hb.type) {

      case "link":
        if (this.linkHeartbeatsMap.has(hb.link.url)) {
          const metaedHB = (this.linkHeartbeatsMap.get(hb.link.url) as MetaedHeartbeat<LinkHeartbeat>);
          const delta = now - metaedHB.heartbeat.time;
          metaedHB.meta.sums += delta;
          metaedHB.meta.count++;
          metaedHB.meta.lastN.push(delta);
          metaedHB.meta.lastN.length > 10 && metaedHB.meta.lastN.shift()
        } else {
          // Empty heartbeat, is going to be overridden next
          this.linkHeartbeatsMap.set(hb.link.url, { meta: { sums: 0, count: 0, lastN: [ ] }, heartbeat: (null as any) });
        }
        (this.linkHeartbeatsMap.get(hb.link.url) as MetaedHeartbeat<LinkHeartbeat>).heartbeat = hb;
        break;

      case "search":
        if (this.searchHeartbeatsMap.get(hb.search.domain)?.has(hb.search.term)) {
          const metaedHB = (this.searchHeartbeatsMap.get(hb.search.domain)?.get(hb.search.term) as MetaedHeartbeat<PollHeartbeat>);
          const delta = now - metaedHB.heartbeat.time;
          metaedHB.meta.sums += delta;
          metaedHB.meta.count++;
          metaedHB.meta.lastN.push(delta);
          metaedHB.meta.lastN.length > 10 && metaedHB.meta.lastN.shift()
        } else {
          // Empty heartbeat, is going to be overridden next
          this.searchHeartbeatsMap.get(hb.search.domain)?.set(hb.search.term, { meta: { sums: 0, count: 0, lastN: [ ] }, heartbeat: (null as any) });
        }
        const metaedHeartbeat = this.searchHeartbeatsMap.get(hb.search.domain)?.get(hb.search.term) as MetaedHeartbeat<PollHeartbeat>;
        if (metaedHeartbeat) {
          // console.info("ALL GOOD for: ", hb.search);
          metaedHeartbeat.heartbeat = hb;
        } else {
          // what happens is that the buyer serve will broadcast heartbeat, but won't show the searches from another node.
          // console.error("ERROR for: ", hb.search);
        }
        break;

      case "stream":
        break;

    }
  }

  getLinkHeartbeat(link: string): LinkHeartbeat | undefined {
    return this.linkHeartbeatsMap.get(link)?.heartbeat;
  }

  getLinkHeartbeatAvg(link: string) {
    const sums = this.linkHeartbeatsMap.get(link)?.meta.sums as number / 1000;
    const count = this.linkHeartbeatsMap.get(link)?.meta.count as number;
    return (sums / count)
  }

  getLinkHeartbeatAvgN(link: string) {
    const lastN = this.linkHeartbeatsMap.get(link)?.meta.lastN as number[];
    return lastN ? lastN.reduce((a, b) => a + b, 0) / 1000 / lastN.length : NaN;
  }

  getPollHeartbeat(domain: string, term: string): Heartbeat | undefined {
    return this.searchHeartbeatsMap.get(domain)?.get(term)?.heartbeat;
  }

  getPollHeartbeatAvg(domain: string, term: string) {
    const sums = this.searchHeartbeatsMap.get(domain)?.get(term)?.meta.sums as number / 1000;
    const count = this.searchHeartbeatsMap.get(domain)?.get(term)?.meta.count as number;
    return (sums / count)
  }

  getPollHeartbeatAvgN(domain: string, term: string) {
    const lastN = this.searchHeartbeatsMap.get(domain)?.get(term)?.meta.lastN;
    return lastN ? lastN.reduce((a, b) => a + b, 0) / 1000 / lastN.length : NaN;
  }

}
