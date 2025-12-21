import fs from 'fs';
import path from 'path';
import {logger} from './logger';

export interface Rule {
  enabled: boolean;
  groupCode: string;
  recvFriendUin: string;
  watchFriendUin: string;
  replyText: string;
}

export interface PluginConfig {
  debug: boolean;
  rules: Rule[];
}

const DEFAULT_CONFIG: PluginConfig = {
  debug: false,
  rules: []
};

function ensureDir(p: string) {
  fs.mkdirSync(p, {recursive: true});
}

function getDataDir(): string {
  return globalThis.LiteLoader.plugins.echoes_unheard.path.data;
}

function safeParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

function normalizeConfig(cfg: any): PluginConfig {
  return {
    debug: !!cfg?.debug,
    rules: Array.isArray(cfg?.rules)
      ? cfg.rules.map((r: any) => ({
        enabled: r?.enabled !== false, // 默认 true
        groupCode: String(r?.groupCode ?? '').trim(),
        recvFriendUin: String(r?.recvFriendUin ?? '').trim(),
        watchFriendUin: String(r?.watchFriendUin ?? '').trim(),
        replyText: String(r?.replyText ?? '')
      }))
      : []
  };
}

export function readConfig(uin: string): PluginConfig {
  logger.info('readConfig dataDir=', getDataDir());
  const dataDir = getDataDir();
  ensureDir(dataDir);

  const file = path.join(dataDir, `${uin}.json`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(DEFAULT_CONFIG, null, 2), 'utf-8');
    return DEFAULT_CONFIG;
  }

  const text = fs.readFileSync(file, 'utf-8');
  const parsed = safeParse<PluginConfig>(text, DEFAULT_CONFIG);
  const normalized = normalizeConfig(parsed);
  if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
    fs.writeFileSync(file, JSON.stringify(normalized, null, 2), 'utf-8');
  }
  return normalized;
}

export function writeConfig(uin: string, cfg: PluginConfig): PluginConfig {
  const dataDir = getDataDir();
  ensureDir(dataDir);

  const file = path.join(dataDir, `${uin}.json`);
  const normalized = normalizeConfig(cfg);
  fs.writeFileSync(file, JSON.stringify(normalized, null, 2), 'utf-8');
  return normalized;
}
