import { addZ, addZZ } from "./time";
import chalk from 'chalk';

const __MAX_LOGS__ = 1000;
const pastLogs: Log[] = [];

// If I want a spring style log, that's how I could get the base directory:
// var path = require('path');
// var appDir = path.dirname(require.main.filename);
// And that's how I could get where the execution is:
// new Error().stack

function time(now: Date) {
  // const now = new Date();
  const hour    = addZ ( now.getHours()        );
  const minutes = addZ ( now.getMinutes()      );
  const seconds = addZ ( now.getSeconds()      );
  const millis  = addZZ( now.getMilliseconds() );
  return `${hour}:${minutes}:${seconds}.${millis}`;
  // alternative: (new Date()).toISOString()
}

function storeLog(groupId: string | null, time: number, level: LogLevel, messages: any[]) {
  pastLogs.push({ groupId, time, level, messages });
  if (pastLogs.length > __MAX_LOGS__) {
    pastLogs.shift();
  }
}

export function getAllLogs() {
  return pastLogs;
}

export const logger = {
  debug: (...arg: any[]) => {
    const now = new Date();
    console.log(chalk.bold(time(now), 'DEBUG'), ...arg);
    storeLog(null, now.getTime(), "DEBUG", arg)
  },
  info: (...arg: any[]) => {
    const now = new Date();
    console.info(chalk.bold.blue(time(now), 'INFO '), ...arg);
    storeLog(null, now.getTime(), "INFO", arg)
  },
  warn: (...arg: any[]) => {
    const now = new Date();
    console.warn(chalk.bold.yellow(time(now), 'WARN '), ...arg);
    storeLog(null, now.getTime(), "WARN", arg)
  },
  error: (...arg: any[]) => {
    const now = new Date();
    console.log(chalk.bold.red(time(now), 'ERROR'), ...arg);
    storeLog(null, now.getTime(), "ERROR", arg)
  },
};

export const loggerWithId = {
  debug: (id: string, ...arg: any[]) => {
    const now = new Date();
    console.log(chalk.bold(time(now), 'DEBUG', `[${id}]`), ...arg);
    storeLog(id, now.getTime(), "DEBUG", arg)
  },
  info: (id: string, ...arg: any[]) => {
    const now = new Date();
    console.info(chalk.bold.blue(time(now), 'INFO ', `[${id}]`), ...arg);
    storeLog(id, now.getTime(), "INFO", arg)
  },
  warn: (id: string, ...arg: any[]) => {
    const now = new Date();
    console.warn(chalk.bold.yellow(time(now), 'WARN ', `[${id}]`), ...arg);
    storeLog(id, now.getTime(), "WARN", arg)
  },
  error: (id: string, ...arg: any[]) => {
    const now = new Date();
    console.log(chalk.bold.red(time(now), 'ERROR', `[${id}]`), ...arg);
    storeLog(id, now.getTime(), "ERROR", arg)
  },
};

// Simple way to have one logger keeping the ID
export class Logger {

  private id: string;

  constructor(groupId?: string) {
    this.id = groupId;
  }

  debug(...arg: any[]) {
    if (this.id)  loggerWithId.debug(this.id, ...arg);
    else          logger      .debug(...arg);
  }

  info(...arg: any[]) {
    if (this.id)  loggerWithId.info(this.id, ...arg);
    else          logger      .info(...arg);
  }

  warn(...arg: any[]) {
    if (this.id)  loggerWithId.warn(this.id, ...arg);
    else          logger      .warn(...arg);
  }

  error(...arg: any[]) {
    if (this.id)  loggerWithId.error(this.id, ...arg);
    else          logger      .error(...arg);
  }

}