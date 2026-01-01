import fs from 'fs';
import path from 'path';
import { logger } from '../util/logger';

export interface Rule {
  enabled: boolean;
  groupCode: string;
  triggerFriendUin: string;
  targetFriendUin: string;
  replyText: string;

  // 三振出局模式判断参数，将其持久化从而解决 QQ 莫名奇妙消失且再次登录需要扫码验证的问题（疑似被检测）
  awaitingReply?: boolean;    // 是否在等对方回复
  noReplyStreak?: number;     // 连续未回复次数
  lastSentAt?: number;        // 上次发送时间
  lastReplyAt?: number;       // 上次收到对方消息时间
}

export interface PluginConfig {
  enabled: boolean;
  strikeOutMode?: boolean;
  debug: boolean;
  rules: Rule[];
}

export const DEFAULT_CONFIG: PluginConfig = {
  enabled: true,
  strikeOutMode: false,
  debug: false,
  rules: []
};

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function getDataDir(): string {
  return LiteLoader.plugins.echoes_unheard.path.data;
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
    enabled: cfg?.enabled !== false, // 默认 true
    strikeOutMode: !!cfg?.strikeOutMode,
    debug: cfg?.debug,
    rules: Array.isArray(cfg?.rules)
      ? cfg.rules.map((r: any) => ({
        enabled: r?.enabled !== false, // 默认 true
        groupCode: String(r?.groupCode ?? '').trim(),
        triggerFriendUin: String(r?.triggerFriendUin ?? '').trim(),
        targetFriendUin: String(r?.targetFriendUin ?? '').trim(),
        replyText: String(r?.replyText ?? ''),

        awaitingReply: !!r?.awaitingReply,
        noReplyStreak: Math.max(0, Number(r?.noReplyStreak ?? 0) || 0),
        lastSentAt: Math.max(0, Number(r?.lastSentAt ?? 0) || 0),
        lastReplyAt: Math.max(0, Number(r?.lastReplyAt ?? 0) || 0)
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