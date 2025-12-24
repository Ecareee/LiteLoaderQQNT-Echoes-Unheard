import {logger} from './logger';
import type {PluginConfig} from '../config/config';
import {persistConfigDebounced} from '../config/runtime';
import {toMs} from './time';

const MAX_NO_REPLY = 3;

export function handlePrivateReply(msg: any, CONFIG: PluginConfig) {
  if (!CONFIG.strikeOutMode) return;

  const senderUin = String(msg?.senderUin ?? '');
  if (!senderUin) return;

  const msgAt = toMs(msg?.msgTime) || Date.now();

  let changed = false;
  for (const r of CONFIG.rules) {
    if (String(r.targetFriendUin) !== senderUin) continue;
    if (!r.awaitingReply) continue;

    const lastSentAt = Number(r.lastSentAt || 0);
    // 只要对方发言时间在 lastSentAt 之后，就算回复
    if (!lastSentAt || msgAt >= lastSentAt) {
      r.awaitingReply = false;
      r.noReplyStreak = 0;
      r.lastReplyAt = msgAt;
      changed = true;
    }
  }

  if (changed) {
    logger.info('对方已回复，清空 noReplyStreak:', senderUin);
    persistConfigDebounced();
  }
}

// 接收者连续 3 次没有回复，第 4 次命中时自动关闭规则启用并阻止发送
export function checkStrike(rule: any, CONFIG: PluginConfig): boolean {
  if (!CONFIG.strikeOutMode) return true;
  if (!rule.enabled) return false;

  const streak = Number(rule.noReplyStreak || 0);
  if (rule.awaitingReply && streak >= MAX_NO_REPLY) {
    rule.enabled = false;
    logger.info('三振出局模式：规则自动关闭', rule);
    persistConfigDebounced();
    return false; // 不再发送
  }

  rule.noReplyStreak = rule.awaitingReply ? streak + 1 : 1;
  rule.awaitingReply = true;
  rule.lastSentAt = Date.now();
  persistConfigDebounced();
  return true;
}

export async function syncRepliesFromHistory(CONFIG: PluginConfig) {
  if (!CONFIG.strikeOutMode) return;

  // 只同步正在等回复的目标
  const targets = Array.from(new Set(
    CONFIG.rules
      .filter(r => r.awaitingReply && r.targetFriendUin)
      .map(r => String(r.targetFriendUin))
  ));

  if (!targets.length) return;

  for (const targetUin of targets) {
    try {
      const uid = await Echoes_Unheard.getUidByUin(targetUin);
      if (!uid) continue;

      const peer = {chatType: 1, peerUid: uid};

      const res = await Echoes_Unheard.invokeNative(
        'ntApi',
        'nodeIKernelMsgService/getAioFirstViewLatestMsgs',
        false,
        {peer, cnt: 100} // 必须是对象，仅拉取最近 100 条
      );
      logger.info('getAioFirstViewLatestMsgs result =', res);

      const msgList = res?.msgList || [];
      let newestIncomingAt = 0;

      for (const m of msgList) {
        if (String(m?.senderUin ?? '') !== targetUin) continue;
        newestIncomingAt = Math.max(newestIncomingAt, toMs(m?.msgTime) || 0);
      }

      if (!newestIncomingAt) continue;

      let changed = false;
      for (const r of CONFIG.rules) {
        if (String(r.targetFriendUin) !== targetUin) continue;
        if (!r.awaitingReply) continue;

        const lastSentAt = Number(r.lastSentAt || 0);
        if (!lastSentAt || newestIncomingAt >= lastSentAt) {
          r.awaitingReply = false;
          r.noReplyStreak = 0;
          r.lastReplyAt = newestIncomingAt;
          changed = true;
        }
      }
      if (changed) persistConfigDebounced();
    } catch (e) {
      logger.error('syncRepliesFromHistory error:', e);
    }
  }
}