export enum Availability {
  NotAvailable,
  FromAmazon,
  FromOthers
}

export function isFromAmazon(productInfo: ProductInfo) {

  if (productInfo === null) {
    return false;
  }

  const cpi = productInfo.computed;

  // Regardless of the price, only check for amazon
  if (   cpi.isAvailableFromAmazon 
      || cpi.isAmazonInQuickOtherOffer 
      || cpi.otherSellers.some(os => os.isFromAmazon && os.parsedCondition === "New"))
  {
    return true;
  }

  return false;

}

export function isPurchaseAvailable(productInfo: ProductInfo, item: FoundItem) {

  if (productInfo === null) {
    return false;
  }

  const cpi = productInfo.computed;

  // Regardless of the price, only check for amazon
  if (isFromAmazon(productInfo)) {
    return Availability.FromAmazon;
  }

  // 5% error margin, you never know with float and conversion rates
  const sameReportedPrice = (price: number) => price > item.parsedPrice * 0.95 && price < item.parsedPrice * 1.05

  if (   sameReportedPrice(cpi.eurPrice)
      || sameReportedPrice(cpi.quickOtherOfferEurPrice)
      || cpi.otherSellers.some(os => sameReportedPrice(os.eurPrice))) {
    return Availability.FromOthers;
  }

  return Availability.NotAvailable;

}
