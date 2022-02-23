import { sleep } from "./basics";
import { logger } from "./logger";

let paused = false;

export async function pauseRefreshers() {
  logger.info("Pausing all refreshers.");
  paused = true;
}

export async function resumeRefreshers() {
  logger.info("Resuming all refreshers.");
  paused = false;
}

export async function pauseCheck() {
  while (paused === true) {
    await sleep(500);
  }
}