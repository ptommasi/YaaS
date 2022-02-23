const ProxyChain = require('proxy-chain');
const HttpsProxyAgent = require("https-proxy-agent");
const HttpProxyAgent = require("http-proxy-agent");
import axios, { AxiosResponse } from "axios";

const urlRegex = RegExp("http://([0-9a-z.]+):([0-9]+)");

function extractConfig(url: string) {
  const m = url.match(urlRegex);
  return { url, address: m[1], port: parseInt(m[2]) }; 
}

interface ProxyOptions {
  username: string;
  password: string;
  address:  string;
  port:     number | string;
}

export class Proxy {

  private oldProxyUrl: string;
  private newProxyUrl: string;
  private localAddress: string;
  private localPort: number;

  constructor(o: ProxyOptions) {
    // const oldProxyUrl = 'http://fnquoqkh-dest:cj073pkzg6b9@193.8.56.119:9183';
    this.oldProxyUrl = `http://${o.username}:${o.password}@${o.address}:${o.port}`;
  };

  async boot() {
    if (this.localAddress) {
      throw new Error("Already booted!");
    }
    this.newProxyUrl = await ProxyChain.anonymizeProxy(this.oldProxyUrl);
    const newConfig = extractConfig(this.newProxyUrl);
    this.localAddress = newConfig.address;
    this.localPort    = newConfig.port;
  }

  public get port() {
    return this.localPort;
  }

  public get address() {
    return this.localAddress;
  }

  async close() {
    await ProxyChain.closeAnonymizedProxy(this.newProxyUrl, true);
  }

}

export async function prepareProxy() {

  // const proxy = new Proxy({ 
  //   username: 'fnquoqkh-dest',
  //   password: 'cj073pkzg6b9',
  //   address:  '193.8.56.119',
  //   port:     '9183'
  // });

  // await proxy.boot();

  // console.log(proxy.address, proxy.port);

  // const httpsAgent = new HttpsProxyAgent({
  //   host: process.env.PROXY_HOST,
  //   port: process.env.PROXY_PORT
  // });

  
  // const httpsAgent = new HttpsProxyAgent({
  //   host: proxy.address,
  //   port: proxy.port
  // });

  // const httpsAgent = new HttpsProxyAgent({
  //   host: '45.136.228.154',
  //   port: 6209,
  //   // auth: 'fnquoqkh-dest:cj073pkzg6b9'
  // });

  const httpAgent = new HttpProxyAgent({
    host: 'p.webshare.io',
    port: 9999,
    // auth: 'fnquoqkh-dest:cj073pkzg6b9'
  });

  // const inst = axios.create({
  //   proxy: {
  //     host: '193.8.56.119',
  //     port: 9183,
  //     auth: {
  //       username: 'fnquoqkh-dest',
  //       password: 'cj073pkzg6b9'
  //     }
  //   }
  // });

  // const inst = axios.create({
  //   proxy: {
  //     host: process.env.PROXY_HOST,
  //     port: parseInt(process.env.PROXY_PORT)
  //   }
  // });

  // const response = await inst.get('https://pro.ip-api.com/json/?key=JZp9UvIhtRsjwE7');

  const proxiedAxios = axios.create({ httpAgent });

  // const response = await proxiedAxios.get("https://pro.ip-api.com/json/?key=JZp9UvIhtRsjwE7");
  const response = await proxiedAxios.get("http://api.myip.com");

  console.log(response.data);

  // await proxy.close();

}
