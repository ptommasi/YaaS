import { Logger } from "../utils/logger";

// Given the full product info, return a simplified view (title, price, if it comes from
// other sellers). If it's not from amazon anymore, return null.
export function productToOffer(id: string, productInfo: ProductInfo): OfferFound {

  const logger = new Logger(id);

  const title = productInfo.source.title;

  if (productInfo.computed.isAvailableFromAmazon) {
    return { title, eurPrice: productInfo.computed.eurPrice, location: "directbuy" };
  }

  if (productInfo.computed.isAmazonInQuickOtherOffer) {
    return { title, eurPrice: productInfo.computed.quickOtherOfferEurPrice, location: "othersellersquickoffer" };
  }

  if (productInfo.computed.otherSellers.length > 0) {

    const amazonSeller = productInfo.computed.otherSellers.find(os => os.isFromAmazon);

    if(amazonSeller) {
      return { title, eurPrice: amazonSeller.eurPrice, location: "othersellers" };
    } else {
      logger.error("Other sellers found, but without an amazon offer.");
      return null;
    }

  } 
  
  logger.error("Neither direct buy or other sellers purchase found.");
  return null;

}