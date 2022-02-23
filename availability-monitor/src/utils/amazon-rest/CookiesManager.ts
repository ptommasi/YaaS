import CookieParser from 'set-cookie-parser';
import { logger } from '../../utils/logger';

export class CookiesManager {

  private cookieMap: Record<string, CookieParser.Cookie>;

  constructor(initialCookieMap?: Record<string, CookieParser.Cookie>) {
    if(initialCookieMap) {
      this.cookieMap = initialCookieMap;
    } else {
      this.cookieMap = {};
    }
  }

  setCookies(setCookieValue?: string[]) {
    if (!setCookieValue) {
      // logger.debug("No cookies found, doing nothing.");
      return;
    }
    const cookies = CookieParser.parse(setCookieValue);
    cookies.forEach(c => {
      if (c.maxAge !== undefined){
        logger.info("Cannot deal with max age, no logic for that.");
      }
      if (c.domain?.startsWith(".www")) {
        // It's the empty cookie, content is "-"
        // logger.info(`Ignoring cookies under .www (${c.name}=${c.value}).`);
        return;
      }
      this.cookieMap[c.name] = c;
    });
  }

  private deleteOldCookies() {
    const now = new Date();
    Object.values(this.cookieMap)
          .forEach(cookie => {
            if (cookie.expires && cookie.expires < now) {
              delete this.cookieMap[cookie.name];
            }
          });
  }

  getCookies() {
    return this.cookieMap;
  }

  hasCookies() {
    return Object.keys(this.cookieMap).length > 0;
  }

  getCookieString() {
    this.deleteOldCookies();
    return Object .values(this.cookieMap)
                  .map(cookie => `${cookie.name}=${cookie.value}`)
                  .join("; ");
  }

  reset() {
    this.cookieMap = { };
  }

}