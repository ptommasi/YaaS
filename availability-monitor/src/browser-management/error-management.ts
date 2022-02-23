import { AbstractWatcher } from "../watchers/AbstractWatcher";
import { Logger, loggerWithId } from "../utils/logger";

const __MAX_ATTEMPTS__ = 5;

export const isTimeout = (err: any) => err instanceof Error && err.name === "TimeoutError";

export const isPageClosed = (err: any) => {
  const isError = err instanceof Error && err.message !== undefined;
  if (!isError) {
    return false;
  }
  const isDisconnected = err.message.startsWith("Navigation failed because browser has disconnected!");
  const isClosed1 = err.message.indexOf("Session closed. Most likely the page has been closed.") >= 0;
  const isClosed2 = err.message.indexOf("Protocol error") >= 0 && err.message.indexOf("Target closed") >= 0;
  // const isClosed2 = err.message.indexOf("Protocol error (DOM.describeNode): Target closed.") >= 0;
  // const isClosed3 = err.message.indexOf("Protocol error (DOM.resolveNode): Target closed.") >= 0;
  // const isClosed4 = err.message.indexOf("Protocol error (Runtime.callFunctionOn): Target closed.") >= 0;
  return isError && (isDisconnected || isClosed1 || isClosed2);
}

export const isContextDestroyed = (err: any) => {
  return err instanceof Error && err.message && err.message.startsWith("Protocol error (Runtime.callFunctionOn): Execution context was destroyed.");
}

// Protocol error (DOM.describeNode): Cannot find context with specified id
export const isContextLost = (err: any) => {
  const isError = err instanceof Error;
  if (isError && err.message) {
    const message: string = err.message;
    return message.startsWith("Protocol error") && message.indexOf("Cannot find context with specified id") >= 0;
  }
  return false;
}

// Protocol error (DOM.resolveNode): Node with given id does not belong to the document


export const retryOnTimeout = (target: AbstractWatcher, propertyKey: string, descriptor: PropertyDescriptor) => {

  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any) {

    // If there is a this._id it's gonna use it, otherwise it's the default logger
    const logger = new Logger(this._id);

    // For some reason, attempt doesn't go up.... fucking hell
    let attempt = 0;
    // Cycle over attempt numbers, the break condition is in the logic
    while(attempt < __MAX_ATTEMPTS__) {

      // I like to start count attempts from 1
      attempt++;

      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } catch (err: any) {
        let url = "(no url available)"
        if (this.page) {
          url = `(at ${this.page.url()})`;
        }
        if (isTimeout(err)) {
          const message = `Ignoring timeout error at attempt #${attempt} for ${target.constructor.name}.${propertyKey} ${url}: ${err.message}.`
          if (this.id) { loggerWithId.warn(this.id, message);  }
          else {         logger.warn(message);                 }
        } else {
          const message = `Impossible to ignore the exception for ${target.constructor.name}.${propertyKey} ${url}, more drama will follow.`;
          if (this.id) { loggerWithId.warn(this.id, message);  }
          else {         logger.warn(message);                 }
          throw err;
        }
      }

    }

  };

}

export const swallowErrorsOnShutdown = (target: AbstractWatcher, propertyKey: string, descriptor: PropertyDescriptor) => {

  const originalMethod = descriptor.value;

  descriptor.value = async function (...args: any) {

    try {
      const result = await originalMethod.apply(this, args);
      return result;
    } catch (err: any) {
      if (!(this as AbstractWatcher).isShuttingDown) {
        throw err;
      }
    }

  }

}