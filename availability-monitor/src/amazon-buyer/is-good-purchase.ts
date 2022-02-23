import { Logger } from "../utils/logger";

// Note, avoid XT and Ti because it could end up being counted twice (e.g. "AMD 6800XT" both contains 6800 and 6800XT)
const gpus = ["3060", "3070", "3080", "3090", "6700", "6800", "6900" ];

export function isGoodTitle(id: string, title: string) {

  const logger = new Logger(id);

  if (title.startsWith("<") && title.endsWith(">")) {
    logger.info(`Link has no extracted title (${title}), flagging it as valid.`);
    return true;
  }

  const is3060 = title.indexOf("3060") >= 0;
  const is3070 = title.indexOf("3070") >= 0;
  const is3080 = title.indexOf("3080") >= 0;

  let count = 0;
  is3060 && count++;
  is3070 && count++;
  is3080 && count++;

  return count === 1;

}

export function isGoodPurchase(id: string, offer: OfferFound) {

  const logger = new Logger(id);

  if (!offer.eurPrice) {
    console.warn(`This product has no price, thus it will be rejected: `, offer);
    return false;
  }

  let graphicCardTitles = 0;
  const title = offer.title.toLowerCase();

  gpus.forEach(gpu => {
    if (~title.indexOf(gpu)) {
      graphicCardTitles++;
    }
  })

  if (graphicCardTitles > 1) {
    logger.info(`Purchase ${offer.title} has too many cards in the title, avoiding.`);
    return false;
  }

  if (~title.indexOf("pny") || ~title.indexOf("palit")) {
    logger.info(`Not interested into Palit / PNY.`);
    return false;
  }

  if (offer.eurPrice < 100) {
    logger.info(`Price suspiciously low, do not buy.`);
    return false;
  }

  // For the night

  // if (~title.indexOf("3060ti") || ~title.indexOf("3060 ti")) {
  //   if (~title.indexOf("zotac") && offer.eurPrice < 750) {
  //     logger.info(`${offer.eurPrice}€ is a good price for a Zotac 3060 Ti (${title}).`);
  //     return true;
  //   }
  // }

  // if (~title.indexOf("3070")) {
  //   if (~title.indexOf("zotac") && offer.eurPrice < 800) {
  //     logger.info(`${offer.eurPrice}€ is a good price for a Zotac 3070 (${title}).`);
  //     return true;
  //   }
  // }

  // logger.info("Returning false, only searching for 3060 Ti or 3070 from Zotac.")
  // return false;

  // End

  if (~title.indexOf("3060ti") || ~title.indexOf("3060 ti")) {
    if (offer.eurPrice < 800) {
      logger.info(`${offer.eurPrice}€ is a good price for a 3060 Ti (${title}).`);
      return true;
    } else {
      logger.info(`${offer.eurPrice}€ is NOT a good price for a 3060 Ti (${title}).`);
      return false;
    }
  }

  if (~title.indexOf("3060")) {
    if (offer.eurPrice < 700) {
      logger.info(`${offer.eurPrice}€ is a good price for a 3060 (${title}).`);
      return true;
    } else {
      logger.info(`${offer.eurPrice}€ is NOT a good price for a 3060 (${title}).`);
      return false;
    }
  }

  if (~title.indexOf("3070")) {
    // if (~title.indexOf("FTW")) {
    //   logger.info(`Not interested into 3070 FTW cards (${title}).`);
    //   return false;
    // }
    if (offer.eurPrice < 850) {
      logger.info(`${offer.eurPrice}€ is a good price for a 3070 (${title}).`);
      return true;
    } else {
      logger.info(`${offer.eurPrice}€ is NOT a good price for a 3070 (${title}).`);
      return false;
    }
  }

  if (~title.indexOf("3080ti") || ~title.indexOf("3080 ti")) {
    // if (~title.indexOf("FTW")) {
    //   logger.info(`Not interested into 3080 FTW cards (${title}).`);
    //   return false;
    // }
    if (offer.eurPrice < 1500) {
      logger.info(`${offer.eurPrice}€ is a good price for a 3080 (${title}).`);
      return true;
    } else {
      logger.info(`${offer.eurPrice}€ is NOT a good price for a 3080 (${title}).`);
      return false;
    }
  }

  if (~title.indexOf("3080")) {
    // if (~title.indexOf("FTW")) {
    //   logger.info(`Not interested into 3080 FTW cards (${title}).`);
    //   return false;
    // }
    if (offer.eurPrice < 1200) {
      logger.info(`${offer.eurPrice}€ is a good price for a 3080 (${title}).`);
      return true;
    } else {
      logger.info(`${offer.eurPrice}€ is NOT a good price for a 3080 (${title}).`);
      return false;
    }
  }

  logger.info(`Not interested into ${title}.`);
  return false;

}