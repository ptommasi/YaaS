// From: https://stackoverflow.com/questions/12881212/does-typescript-support-events-on-classes

interface ILiteEvent<T> {
  on (handler: { (data?: T): void }): void;
  off(handler: { (data?: T): void }): void;
}

export class LiteEvent<T> implements ILiteEvent<T> {

  private handlers: { (data?: T): void; }[] = [];

  public on(handler: { (data?: T): void }) : void {
      this.handlers.push(handler);
  }

  public off(handler: { (data?: T): void }) : void {
      this.handlers = this.handlers.filter(h => h !== handler);
  }

  public wipe() : void {
    this.handlers = [];
  }


  public trigger(data?: T) {
      this.handlers.slice(0).forEach(h => h(data));
  }

  /** It's same as trigger, but when there are promises it waits for them to complete. */
  public async atrigger(data?: T) {
     for (let h of this.handlers) {
      await h(data);
    }
  }

  public expose() : ILiteEvent<T> {
    return this;
  }

  public get handlersCount() {
    return this.handlers.length;
  }

}
