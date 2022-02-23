import axios from "axios";
import { Solver } from "2captcha";
import { loggerWithId } from "./logger";
import { sleep } from "./basics";
import { getConfig } from "./config-manager";

const _2captchaKey = getConfig().externalServices["2captcha"].token;

const _naiveAddress = getConfig().externalServices.naiveSolver.address;

// const solver = new Captcha.Solver(_2captchaKey);
const solver = new Solver(_2captchaKey);

interface SolvedCaptcha {
  data: string; // e.g. 'JBKAMB'
  id:   string; // e.g. '66462949884'
}

async function getBase64(url: string) {
  // const response = await (withProxy ? proxiedAxios : axios).get(url, { responseType: 'arraybuffer' });
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  return Buffer.from(response.data, 'binary').toString('base64');
}

const solvedCaptchas = new Set<string>();

export async function solveSimpleImage(logId: string, base64: string) {
  const result:SolvedCaptcha = await solver.imageCaptcha(base64);
  if (solvedCaptchas.has(result.data)) {
    loggerWithId.warn(logId, `I already solved ${result.data} in the past, something is fishy.`);
  } else {
    solvedCaptchas.add(result.data);
  }
  return result.data;
}

/** It will use 2captcha service to solve the captcha (paid) */
export async function solveSimpleImageUrl(logId: string, url: string) {
  // loggerWithId.info(id, `Solving captcha at image ${url}`);
  const data = await getBase64(url);
  return await solveSimpleImage(logId, data);
}

/** It will use a naive solver to solve the captcha (free) */
export async function naiveSolveSimpleImageUrl(logId: string, url: string, withSleep: boolean) {
  // loggerWithId.info(id, `Solving captcha at image ${url}`);
  const data = await getBase64(url);
  // Sleep a bit before and after to simulate user trying to figure captcha out. I do twice 
  // to kind of distribute the captcha requests on the service.
  withSleep && await sleep(1000 + Math.random() * 1500);
  const response = await axios.post<{ solution: string }>(`${_naiveAddress}/solve`, { data });
  withSleep && await sleep(1000 + Math.random() * 1500);
  // Strip away any special character
  const solution = response.data.solution.replace(/[^0-9a-z]/gi, '');
  // loggerWithId.debug(logId, `Naive solution found: ${solution}`);
  return solution;
}
