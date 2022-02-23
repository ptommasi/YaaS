// Note: it returns only the ones queried for!!!
interface ExchangeRatesResponse {
  rates: {
    // USD: number;
    // GBP: number;
    // EUR: number;
    [key: string]: number;
  },
  base: string; // "EUR"
  date: string; // "2021-03-19"
}
