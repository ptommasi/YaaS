// import http2 from 'http2'

// const HttpsProxyAgent = require("https-proxy-agent");

// const httpsAgent = new HttpsProxyAgent({
//   host: process.env.PROXY_HOST,
//   port: process.env.PROXY_PORT
// });

// export async function get(rootUrl: string, path: string) {

//   return new Promise((resolve, reject) => {

//     const client = http2.connect(rootUrl, {  });

//     const req = client.request({
//      ":path": path
//     });

//     let data = "";

//     const responseHeaders: Record<string, string> = { };

//     // Flag is a byte integer, not useful (I really don't know what it is)
//     req.on("response", (headers: Record<string, string>, flags: number) => {
//       for (const name in headers) {
//         responseHeaders[name] = headers[name];
//       }
//     });

//     req.on("data", (chunk) => {
//       data += chunk;
//     });

//     req.on("end", () => {
//       //  console.log(data);
//       resolve({ responseHeaders, statusCode: responseHeaders[":status"], data });
//       // console.log("Response size: ", data.length);
//       client.close();
//     });

//     req.end(); // send it

//   });

// }

// const http2 = require('http2-wrapper');

// const HttpsProxyAgent = require("https-proxy-agent");

// const httpsAgent = new HttpsProxyAgent({
//   host: process.env.PROXY_HOST,
//   port: process.env.PROXY_PORT
// });

// export async function get(rootUrl: string, path: string) {

//   http2.get({
//     hostname: rootUrl + path,
//     agent: httpsAgent
//   }, response => {
//     response.on('data', chunk => console.log(`Received chunk of ${chunk.length} bytes`));
//   });
//   return "";
// }

// const http = require('http');
// const http2 = require('http2');

import http from 'http'
import http2 from 'http2'
import tls from 'tls';
import { sleep } from './basics';

export async function get(rootUrl: string, path: string) {

  // Build a HTTP/1.1 CONNECT request for a tunnel:
  const proxyReq = http.request({
    method: 'CONNECT',
    host: process.env.PROXY_HOST,
    port: parseInt(process.env.PROXY_PORT),
    path: "https://www.amazon.it",
    // headers: {
    //   Host: 'api.myip.com:443',
    //   'Proxy-Connection': 'Keep-Alive',
    //   'Connection': 'Keep-Alive',
    // }
  });
  proxyReq.end(); // Send it

  proxyReq.on('connect', (res, socket) => {

    // When you get a successful response, use the tunnelled socket
    // to make your new request.
    const client = http2.connect("https://www.amazon.it", {
      // Use your existing socket, wrapped with TLS for HTTPS:
      // createConnection: () => tls.connect({
      //   host: "api.myip.com",
      //   port: 443,
      //   path: "/",
      //   socket: socket,
      //   ALPNProtocols: ['h2']
      // }),
      // protocol: "https:"
      createConnection: () => socket
    });

    client.on('connect', () => console.log('http2 client connect success'));
    client.on('error', (err) => console.error(`http2 client connect error: `, err));

    const req = client.request({
      ":path": "/"
    });

    let data = "";

    const responseHeaders: Record<string, string> = { };

    // Flag is a byte integer, not useful (I really don't know what it is)
    req.on("response", (headers: Record<string, string>, flags: number) => {
      console.log("Req Response");
      for (const name in headers) {
        responseHeaders[name] = headers[name];
      }
    });

    req.on("data", (chunk) => {
      console.log("Req Data");
      data += chunk;
    });

    req.on("end", () => {
      console.log("Req End");
       console.log(data);
      // resolve({ responseHeaders, statusCode: responseHeaders[":status"], data });
      // console.log("Response size: ", data.length);
      client.close();
    });

    req.end(); // send it

    // const req = client.request({
    //   ':path': '/',
    // });
    // req.setEncoding('utf8');

    // const realReq = client.request({
    //  ":path": path
    // });

    // let data = "";

    // const responseHeaders: Record<string, string> = { };

    // // Flag is a byte integer, not useful (I really don't know what it is)
    // realReq.on("response", (headers: Record<string, string>, flags: number) => {
    //   for (const name in headers) {
    //     responseHeaders[name] = headers[name];
    //   }
    // });

    // realReq.on("data", (chunk) => {
    //   data += chunk;
    // });

    // realReq.on("end", () => {
    //   //  console.log(data);
    //   console.log({ responseHeaders, statusCode: responseHeaders[":status"], data });
    //   // console.log("Response size: ", data.length);
    //   client.close();
    // });

    // realReq.end(); // send it


    // From here, use 'client' to do HTTP/2 as normal through the tunnel

  });
  await sleep(10000);

  return "computing...";


}