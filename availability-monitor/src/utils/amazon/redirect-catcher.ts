import { Frame, Page } from "puppeteer";
import { Logger } from "../logger";

const unboundResolve = (url: string) => console.error("Resolved too early, error.");
const unboundReject  = ()            => console.error("Rejected too early, error.");

export function waitForUrlChange(id: string, page: Page, urls: string[], timeout=60000) {

  const logger = new Logger(id);

  if (urls.length === 0) {
    throw Error("Cannot have 0 lenght array of urls.");
  }

  const deferred = {
    resolve: unboundResolve,
    reject:  unboundReject
  };

  const promise: Promise<string> = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject  = reject;
  });

  let promiseDone = false;

  const checkForUrl = (frame: Frame) => {

    // console.log(`Frame ${frame._id} (main frame? ${frame.parentFrame() === null}) navigated to: ${url}, page being ${page.url()}`); 
    const isRoot = frame.parentFrame() === null;

    if (isRoot) {

      // Frame and page are independent, and frame might change, but page doesn't always change.
      // Regardless, in this way I can detect url changes which occurs without redirect.
      const currentUrl = page.url(); 

      for(let u of urls) {

        let matchFound = false;

        // There are multiple part in the url
        if(~u.indexOf("(&&)")) {
          const innerUrls = u.split("(&&)");
          matchFound = innerUrls.every(iu => currentUrl.indexOf(iu) >= 0);
        } else {
          matchFound = currentUrl.indexOf(u) >= 0;
        }

        if (matchFound) {
          // Resolve only once
          if(!promiseDone) {
            promiseDone = true;
            deferred.resolve(currentUrl);
          } else {
            logger.warn(`Found another redirect of interest ${u}, but it's too late now.`);
          }
          clear();
          break;
        }

      }

    }

  };

  const clear = () => {
    if (!promiseDone) {
      deferred.reject();
      promiseDone = true;
    }
    // Calling it multiple times doesn't make a difference
    page.off("framenavigated", checkForUrl);
  }

  // If url doesn't change in one minute, call it a day
  setTimeout(clear, timeout);

  page.on("framenavigated", checkForUrl);

  // Provide a way to turn off
  return { clear, promise };

}
