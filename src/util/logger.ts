const PREFIX = '\x1b[33m[Echoes-Unheard]\x1b[0m';

let DEBUG = false;

export function setLoggerDebug(v: boolean) {
  DEBUG = v;
}

export const logger = {
  info: (...args: any[]) => {
    if (!DEBUG) return;
    console.log(PREFIX, ...args);
  },
  warn: (...args: any[]) => console.warn(PREFIX, ...args),
  error: (...args: any) => console.error(PREFIX, ...args)
};