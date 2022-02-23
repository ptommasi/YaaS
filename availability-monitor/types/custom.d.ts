interface RawProductInfo {

  /** Name of the item */
  title: string;
  /** asin of the produc, often used as ID on amazon */
  asin: string;

  /** Full price string, e.g. "7,99 €" or "£23.99" */
  price: string | null;
  /** The full string of availability (it could be like "available on ..." or "available from these sellers" too) */
  /** Note: real availability will be decided on price */
  availability: string;
  /** The string describing the merchant (the dispatch and sold by ... part) */
  merchantInfo: string;
  /** When multiple parties are involved, then amazon put the links, here the texts (names of the companies) */
  merchantInfoParties: string[];
  /** Buy now is not always available, sometime you have to go through other sellers first */
  hasBuyNowButton: boolean;
  /** If there is an error in the delivery message */
  hasDeliveryTroubles: boolean;
  /** Here to check what the delivery message is */
  deliveryInfo: string;

  /** Sometimes, you could have other sellers with or without a buy now */
  hasOtherSellers: boolean;

  /** If there is a a quick offer small div  */
  hasQuickOtherOffer: boolean;
  /** If there is a a quick offer small div, here the price  */
  quickOtherOfferPrice: string | null;
  /** If there is a a quick offer small div, here the seller  */
  quickOtherOfferSeller: string | null;

}

interface RawOtherSellers {
  sellers: string[];
  couriers: string[];
  prices: string[];
  conditions: string[];
}

type ParsedCondition = "New" | "LikeNew" | "VeryGood" | "Good" | "Acceptable" | "Renewed" | "Unknown";

interface OtherSeller {
  seller: string;
  price: string;
  eurPrice:  number;
  courier: string;
  condition: string;
  parsedCondition: ParsedCondition;
  isFromAmazon: boolean;
}

interface ComputedProductInfo {

  eurPrice:                   number;
  isAvailable:                boolean;
  isFromAmazon:               boolean;
  isAvailableFromAmazon:      boolean;

  hasOfferings:               boolean;
  otherSellers:               OtherSeller[];
  isAmazonAmongOtherSellers:  boolean;

  isAmazonInQuickOtherOffer:  boolean;
  quickOtherOfferEurPrice:    number | null;

}

interface ProductInfo {
  source:   RawProductInfo;
  computed: ComputedProductInfo;
}

type OfferLocation = "directbuy" | "othersellers" | "othersellersquickoffer";

interface OfferFound {
  title: string;
  eurPrice: number;
  location: OfferLocation;
}

/** Used from the extracted tweets which are dumpeded in json, DEPRECATED */
interface BuyLink {
  title: string;
  model: "3060" | "3060Ti" | "3070" | "3080" | "3090" | "6700" | "6700XT" | "6800" | "6800XT" | "6900" | "6900XT" | "Unknwown";
  link: string;
  prices: { price: number; at: string; } []
  buyPrice: number;
  skip: boolean;
}

interface MonitoredUrl {
  title: string;
  url: string;
}

interface Product {
  title: string;
  asin: string;
}

interface ExtractedTweet extends ExtractedText {
  timestamp: string;
  valid: boolean;
}

interface ExtractedText {
  title: string;
  model: string;
  link?: string;
  price: string;
}

/** This is the result of the search */
interface ParsedItem {
  title: string;
  link: string;
  price: string;
  parsedPrice: number;
}

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

interface Log {
  groupId: string;
  time: number;
  level: LogLevel;
  messages: any[];
}

interface HeadersMap { 
  [key: string]: string;
}

interface PageState {
  url: string;
  headers: HeadersMap,
  cookies: any;
  localStorage: any;
  sessionStorage: any;
}

interface FixedMeta {
  tld: string;
  groupName: string;
  temporaryId: string;
  cacheId: string;
  products: Product[];
  userAgent: string;
}

interface VariableMeta {
  timestamp: number;
  date: string;
}

interface PageCachedState extends PageState {
  meta: FixedMeta & VariableMeta;
}

// DIRTY STUFF, a shared object to quickly know if the item is not available
// from amazon
interface SharedPurchaseStatus {
  soldFromAmazon: null | boolean;
}