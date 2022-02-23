import { onShutdown } from "../utils/console-utils";
import { LiteEvent } from "../utils/EventHandler";

type WatcherType = "link" | "search" | "stream";

/** This dirty trick (interface and class with the same name) serves 
 *  to have the shutdown method optional. */
interface Shutdownable { shutdown?(): Promise<void>; }
abstract class Shutdownable { }

// The abstract class defining a watcher. When the system is shutting down, if there
// is a shutdown() method, it will be called and awaited till finished.
export abstract class AbstractWatcher extends Shutdownable {

  protected readonly _onHeartbeat = new LiteEvent<Heartbeat>();
  protected readonly _onItemFound = new LiteEvent<FoundItem>();

  private _isShuttingDown: boolean = false;

  constructor() {
    super();
    if (this.shutdown) {
      onShutdown(async () => { 
        this._isShuttingDown = true;
        await this.shutdown();
      });
    }
  }

  public get Heartbeat() { return this._onHeartbeat.expose(); }
  public get ItemFound() { return this._onItemFound.expose(); }

  public get isShuttingDown() { return this._isShuttingDown; }

  abstract prepare(): Promise<void>;

  abstract start(): Promise<void>;

  async destroy() {
    this._isShuttingDown = true;
    this._onHeartbeat.wipe();
    this._onItemFound.wipe();
    this.shutdown && await this.shutdown();
  }

  // abstract shutdown?(): Promise<void>; <- Shutdownable class / interface courtesy, basically

}

// A watcher for links only
export abstract class LinkWatcher extends AbstractWatcher {
  readonly type = "link";
  abstract getLinks(): ObservedLink[];
}

// A watcher for searches only
export abstract class SearchWatcher extends AbstractWatcher {
  readonly type = "search";
  abstract getSearches(): ObservedSearches;
}

// Out of coherence, the last type of watcher (it has nothing)
export abstract class StreamWatcher extends AbstractWatcher {
  readonly type = "stream";
}

export type ConcreteWatcher = LinkWatcher | SearchWatcher | StreamWatcher;