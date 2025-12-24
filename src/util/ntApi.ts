import {logger} from './logger';
import {ipcRenderer} from 'electron';

let UIN: string | null = null;
const webContentsId = Number(new URLSearchParams(location.search).get('webcontentsid'));
// 新版 RM_IPC 通道名
const IPC_UP_CHANNEL = `RM_IPCTO_MAIN${webContentsId}`;       // 渲染 -> 主进程（发送请求）
const IPC_DOWN_CHANNEL = `RM_IPCFROM_MAIN${webContentsId}`;   // 主进程 -> 渲染（接收响应）
const IPC_DOWN_MAIN2 = 'RM_IPCFROM_MAIN2';                    // 兜底通道
const IPC_FROM_RENDERER = `RM_IPCFROM_RENDERER${webContentsId}`; //  invokeNative的时候用

/**
 * 基于 https://github.com/WJZ-P/LiteLoaderQQNT-Grab-RedBag/blob/main/src/preload.js
 *
 * 【V2 版本】调用 QQ 底层 NTAPI 函数（新版 RM_IPC 格式）
 *
 * @param { String } eventName 函数事件名，例如 "ns-ntApi"。
 * @param { String } cmdName 函数名，例如 "nodeIKernelMsgService/grabRedBag"。
 * @param { Boolean } registered 函数是否为一个注册事件函数（本版本暂未使用）。
 * @param  { ...any } args 函数参数。
 * @returns { Promise<any> } 函数返回值。
 */
export function invokeNative(eventName: string, cmdName: string, registered: boolean, ...args: any[]): Promise<any> {
  logger.info(`准备发送 IPC 消息:
    - UP Channel: ${IPC_UP_CHANNEL}
    - DOWN Channel: ${IPC_DOWN_CHANNEL}
    - Event: ${eventName}
    - Command: ${cmdName}
    - Args:`, ...args);

  return new Promise((resolve, reject) => {
    const callbackId = crypto.randomUUID?.() || `${Date.now()}_${Math.random().toString(16).slice(2)}`;

    const callback = (_event, ...resultArgs) => {
      // 新版回调结构：resultArgs[0] 包含 callbackId，resultArgs[1] 是结果
      if (resultArgs?.[0]?.callbackId === callbackId) {
        logger.info('收到回调:', resultArgs[1]);
        try {
          ipcRenderer.off(IPC_DOWN_CHANNEL, callback);
        } catch {
        }
        try {
          ipcRenderer.off(IPC_DOWN_MAIN2, callback);
        } catch {
        }
        resolve(resultArgs[1]);
      }
    };

    // 监听回调通道 + 兜底通道
    try {
      ipcRenderer.on(IPC_DOWN_CHANNEL, callback);
    } catch {
    }
    try {
      ipcRenderer.on(IPC_DOWN_MAIN2, callback);
    } catch {
    }

    // 构建新版载荷
    const requestMetadata = {
      type: 'request',
      callbackId: callbackId,
      eventName: eventName,
      peerId: webContentsId
    };

    const commandPayload = {
      cmdName: cmdName,
      cmdType: 'invoke',
      payload: args
    };

    // 发送 IPC 消息
    try {
      logger.info('[invokeNative] commandPayload =', JSON.stringify(commandPayload, (_k, v) => {
        if (v instanceof Map) return {__type: 'Map', entries: Array.from(v.entries())};
        return v;
      }, 2));

      ipcRenderer.send(IPC_FROM_RENDERER, requestMetadata, commandPayload);
      logger.info('IPC 消息已发送。');
    } catch (error) {
      logger.error('IPC 消息发送失败:', error);
      try {
        ipcRenderer.off(IPC_DOWN_CHANNEL, callback);
      } catch {
      }
      try {
        ipcRenderer.off(IPC_DOWN_MAIN2, callback);
      } catch {
      }
      reject(error);
    }
  });
}

export function subscribeEvent(eventName: string, handler: (payload: any) => void) {
  const down = IPC_DOWN_CHANNEL;
  logger.info(`subscribeEvent: eventName=${eventName}, DOWN=${down}`);

  const onDown = (_event: any, _meta: any, body: any) => {
    const cmdName = body?.cmdName;

    if (cmdName === eventName) {
      // logger.info(`subscribeEvent 收到 IPC 消息: meta=${JSON.stringify(meta)}, body=${JSON.stringify(body)}`);
      const payload = body?.payload;
      handler(payload);
    }
  };

  ipcRenderer.on(down, onDown);

  return () => ipcRenderer.off(down, onDown);
}

const uinToUidCache = new Map<string, string>();
const uidToUinCache = new Map<string, string>();

export function readMapLike(mapLike: any, key: string): any {
  if (!mapLike) return undefined;
  if (typeof mapLike.get === 'function') return mapLike.get(key);
  if (Array.isArray(mapLike)) {
    for (const [k, v] of mapLike) if (String(k) === String(key)) return v;
  }
  return mapLike[key];
}

export async function getUidByUin(uin: string): Promise<string | null> {
  const key = String(uin);
  if (!key) return null;
  if (uinToUidCache.has(uin)) return uinToUidCache.get(uin)!;

  // 方案 A：nodeIKernelUixConvertService/getUid
  try {
    // const res = await invokeNative(
    //   "ntApi",
    //   "nodeIKernelUixConvertService/getUid",
    //   false,
    //   [key]
    // );
    const res = await invokeNative(
      'ntApi',
      'nodeIKernelUixConvertService/getUid',
      false,
      {uins: [key]} // 必须是对象
    );

    logger.info('getUidByUin nodeIKernelUixConvertService/getUid result =', res);
    const uid = readMapLike(res?.uidInfo, key);

    if (uid) {
      uinToUidCache.set(key, String(uid));
      uidToUinCache.set(String(uid), key);
      return String(uid);
    }
  } catch (e) {
    logger.warn('getUidByUin nodeIKernelUixConvertService/getUid error =', e);
  }

  // 方案 B：nodeIKernelProfileService/getUidByUin
  try {
    // const res2 = await invokeNative(
    //   'ntApi',
    //   'nodeIKernelProfileService/getUidByUin',
    //   false,
    //   'FriendsServiceImpl',
    //   [key]
    // );
    const res2 = await invokeNative(
      'ntApi',
      'nodeIKernelProfileService/getUidByUin',
      false,
      {callFrom: 'FriendsServiceImpl', uin: [key]} // 必须是对象
    );

    logger.info('getUidByUin nodeIKernelProfileService/getUidByUin result =', res2);
    const uid2 = readMapLike(res2, key);

    if (uid2) {
      uinToUidCache.set(key, String(uid2));
      uidToUinCache.set(String(uid2), key);
      return String(uid2);
    }
  } catch (e) {
    logger.warn('getUidByUin nodeIKernelProfileService/getUidByUin error =', e);
  }

  return null;
}

export async function getUinByUid(uid: string): Promise<string | null> {
  const key = String(uid);
  if (!key) return null;
  if (uidToUinCache.has(key)) return uidToUinCache.get(key)!;

  try {
    const res = await invokeNative(
      'ntApi',
      'nodeIKernelUixConvertService/getUin',
      false,
      {uids: [key]} // 必须是对象
    );

    logger.info('getUinByUid result =', res);
    const uin = readMapLike(res?.uinInfo, key);
    if (uin) {
      uidToUinCache.set(key, String(uin));
      uinToUidCache.set(String(uin), key);
      return String(uin);
    }
  } catch (e) {
    logger.warn('getUinByUid error =', e);
    return null;
  }

  return null;
}

// 获取当前登录账号 uid
export async function getCurrentUid(): Promise<string | null> {
  const uid = await ipcRenderer.invoke('Echoes-Unheard.getUid');
  return uid ? String(uid) : null;
}

// 获取当前登录账号 uin（QQ 号），用于配置文件的名称
export async function getCurrentUin(): Promise<string | null> {
  const uid = await getCurrentUid();
  if (!uid) return null;
  const uin = await getUinByUid(uid);
  UIN = uin ? String(uin) : null;
  return UIN;
}

function makePlainTextElement(text: string) {
  return {
    elementId: '',
    elementType: 1,
    textElement: {content: text}
  };
}

export async function sendMessage(friendUin: string, text: string) {
  const uid = await getUidByUin(friendUin);
  logger.info(`发送信息：uid=${uid}`);
  if (!uid) {
    logger.warn('找不到该好友的 uid');
    return;
  }

  const payload = {
    msgId: '0',
    peer: {chatType: 1, peerUid: uid, guildId: ''},
    msgElements: [makePlainTextElement(text)],
    msgAttributeInfos: new Map()
  };

  const res = await invokeNative(
    'ntApi',
    'nodeIKernelMsgService/sendMsg',
    false,
    payload
  );

  logger.info('sendMessage result =', res);
  return res;
}