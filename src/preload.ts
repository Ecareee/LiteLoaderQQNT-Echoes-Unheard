import { contextBridge, ipcRenderer } from 'electron';
import { setLoggerDebug } from './util/logger';
import {
  getCurrentUid,
  getCurrentUin,
  getUidByUin,
  getUinByUid,
  invokeNative,
  sendMessage,
  subscribeEvent
} from './util/ntApi';

ipcRenderer.on('Echoes-Unheard.debugChanged', (_e, payload: { uin: string; debug: boolean }) => {
  setLoggerDebug(payload.debug);
});


const Exports = {
  onDebugChanged(handler: (payload: { uin: string; debug: boolean }) => void) {
    const ch = 'Echoes-Unheard.debugChanged';
    const listener = (_e: any, payload: any) => handler(payload);
    ipcRenderer.on(ch, listener);
    return () => ipcRenderer.off(ch, listener);
  },
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
  invokeNative,
  subscribeEvent,
  getUidByUin,
  getUinByUid,
  getCurrentUid,
  getCurrentUin,
  sendMessage
};
contextBridge.exposeInMainWorld('Echoes_Unheard', Exports);
export type IPCExports = typeof Exports;