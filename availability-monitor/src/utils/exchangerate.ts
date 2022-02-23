import axios from "axios";
import { sleep } from "./basics";

const EXCHANGE_ADDRESS = "https://api.exchangeratesapi.io/latest";
// const EUR_TO_GBP_EXCHANGE_ADDRESS = `${EXCHANGE_ADDRESS}?base=EUR&symbols=USD,GBP`;
const GBP_TO_EUR_EXCHANGE_ADDRESS = `${EXCHANGE_ADDRESS}?base=GBP&symbols=EUR`;

// 6 hours in milliseconds
const _6_HOURS_ = 1000 * 60 * 60 * 6;

interface CachedExchange { rate: number; time: number; }

let last_request: CachedExchange = null;

// Sadly it doesn't work anymore
async function fetchGbpExchange() {

  // const response = await axios.get<ExchangeRatesResponse>(GBP_TO_EUR_EXCHANGE_ADDRESS);

  // return {
  //   rate: response.data.rates.EUR,
  //   time: Date.now()
  // }

  return {
    rate: 1.17,
    time: Date.now()
  }

}

export async function getGbpExchange() {
  if (last_request === null || Date.now() - last_request.time > _6_HOURS_ ) {
    last_request = await fetchGbpExchange();
  }
  return last_request;
}

let _polledRate = 1.17;

(async () => {
  while (true) {
    _polledRate = (await getGbpExchange()).rate;
    await sleep(1000 * 60 * 60); // sleep an hour before next polling
  }
})()

export const exchangeSyncGBP = (eur: number) => eur * _polledRate;

export const exchangeAsyncGBP = async (eur: number) => eur * (await getGbpExchange()).rate;

// Get either a £ or € price and returns its eur value, it's async because it fetches
// the gbp current value if needed (it's cached for 6 hours).
export async function parseAsyncPrice(rawPrice: string) {

  if (rawPrice === null) {
    return null;
  }

  // I'd expect the € to be in last position (italy, spain, france), it's like 1.9241,54€
  if (rawPrice.indexOf("€") === rawPrice.length - 1) {
    // Delete all characters that are not a number or a comma:
    const numbersAndCommaOnly = rawPrice.replace(/[^\d,]/g, '');
    // Change the comma with a dot (U.S. format)
    const usNumber = numbersAndCommaOnly.replace(/,/g, '.');
    return parseFloat(usNumber);
    // console.log(`${price} value is ${(price)}.`);
  }

  // Euro in first position for germany (€1,925.89)
  else if(rawPrice.indexOf("€") === 0) {
    // Delete all characters that are not a number or a dot:
    const numbersAndDotOnly = rawPrice.replace(/[^\d.]/g, '');
    const usNumber = parseFloat(numbersAndDotOnly);
    return usNumber;
  }

  // I'd expect the pound to be in first position
  else if (rawPrice.indexOf("£") === 0) {
    // Delete all characters that are not a number or a dot:
    const numbersAndDotOnly = rawPrice.replace(/[^\d.]/g, '');
    const gbpPrice = parseFloat(numbersAndDotOnly);
    return await exchangeAsyncGBP(gbpPrice);
  }

  // Play safe with money, quit.
  else {
    console.error(`Price not recognised: ${rawPrice}`);
    throw new Error(`Price not recognised.`);
  }

}

// Get either a £ or € price and returns its eur value, it's async because it fetches
// the gbp current value if needed (it's cached for 6 hours).
export function parseSyncPrice(rawPrice: string) {

  if (rawPrice === null) {
    return null;
  }

  // I'd expect the € to be in last position (italy, spain, france), it's like 1.9241,54€
  if (rawPrice.indexOf("€") === rawPrice.length - 1) {
    // Delete all characters that are not a number or a comma:
    const numbersAndCommaOnly = rawPrice.replace(/[^\d,]/g, '');
    // Change the comma with a dot (U.S. format)
    const usNumber = numbersAndCommaOnly.replace(/,/g, '.');
    return parseFloat(usNumber);
    // console.log(`${price} value is ${(price)}.`);
  }

  // Euro in first position for germany (€1,925.89)
  else if(rawPrice.indexOf("€") === 0) {
    // Delete all characters that are not a number or a dot:
    const numbersAndDotOnly = rawPrice.replace(/[^\d.]/g, '');
    const usNumber = parseFloat(numbersAndDotOnly);
    return usNumber;
  }

  // I'd expect the pound to be in first position
  else if (rawPrice.indexOf("£") === 0) {
    // Delete all characters that are not a number or a dot:
    const numbersAndDotOnly = rawPrice.replace(/[^\d.]/g, '');
    const gbpPrice = parseFloat(numbersAndDotOnly);
    return exchangeSyncGBP(gbpPrice);
  }

  // Play safe with money, quit.
  else {
    console.error(`Price not recognised: ${rawPrice}`);
    throw new Error(`Price not recognised.`);
  }

}

// async function quickTestPrice(price: string) {
//   const eurPrice = await parsePrice(price);
//   console.log(`${price} in euro is ${eurPrice}`);
// }

// (async () => {
//   console.log(await quickTestPrice("7,99 €"));
//   console.log(await quickTestPrice("£84.69"));
//   console.log(await quickTestPrice("22,99 €"));
// })();