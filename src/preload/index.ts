import {contextBridge, ipcRenderer} from 'electron';
import {logger} from '../util/logger';

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
function invokeNative(eventName: string, cmdName: string, registered: boolean, ...args: any[]): Promise<any> {
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

function subscribeEvent(eventName: string, handler: (payload: any) => void) {
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

const Exports = {
  invokeNative,
  subscribeEvent,
  getConfig(uin: string) {
    return ipcRenderer.invoke('Echoes-Unheard.getConfig', uin);
  },
  setConfig(uin: string, cfg: any) {
    return ipcRenderer.invoke('Echoes-Unheard.setConfig', uin, cfg);
  },
  onConfigChanged(handler: (payload: { uin: string; config: any }) => void) {
    const ch = 'Echoes-Unheard.configChanged';
    const listener = (_e: any, payload: any) => handler(payload);
    ipcRenderer.on(ch, listener);
    return () => ipcRenderer.off(ch, listener);
  },
  getUid() {
    return ipcRenderer.invoke('Echoes-Unheard.getUid');
  }
};
contextBridge.exposeInMainWorld('Echoes_Unheard', Exports);
export type IPCExports = typeof Exports;