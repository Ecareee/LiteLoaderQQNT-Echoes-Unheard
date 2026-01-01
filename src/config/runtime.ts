import type { PluginConfig } from './config';
import { DEFAULT_CONFIG } from './config';
import { logger } from '../util/logger';

// 运行态配置
let CONFIG: PluginConfig = DEFAULT_CONFIG;

let UIN: string | null = null;

export function getRuntimeConfig(): PluginConfig {
  return CONFIG;
}

export function setRuntimeConfig(cfg: PluginConfig) {
  CONFIG = cfg ?? DEFAULT_CONFIG;
}

export function getUin(): string | null {
  if (!UIN) {
    logger.error('无法找到 uin');
  }
  return UIN;
}

export function setUin(uin: string) {
  UIN = uin;
}

// 简单防抖，避免 UI 输入/状态变化触发高频 setConfig
function debounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {
  let t: ReturnType<typeof globalThis.setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (t) globalThis.clearTimeout(t);
    t = globalThis.setTimeout(() => {
      fn(...args);
      t = null;
    }, wait);
  };
}

// 运行态变更写回配置
export const persistConfigDebounced = debounce(async () => {
  if (!UIN) {
    logger.warn('persistConfigDebounced skipped: UIN not set');
    return;
  }
  try {
    CONFIG = (await Echoes_Unheard.setConfig(UIN, CONFIG)) as PluginConfig;
  } catch (e) {
    logger.error('persistConfigDebounced failed:', e);
  }
}, 200);