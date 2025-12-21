import {BrowserWindow, ipcMain} from 'electron';
import {PluginConfig, readConfig, writeConfig} from '../util/config';

let UID: string | null = null;

ipcMain.handle('Echoes-Unheard.getConfig', (_e, uin: string) => {
  return readConfig(String(uin));
});

ipcMain.handle('Echoes-Unheard.setConfig', (_e, uin: string, cfg: PluginConfig) => {
  const saved = writeConfig(uin, cfg);

  // 广播给所有窗口
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('Echoes-Unheard.configChanged', {uin: uin, config: saved});
  }

  return saved;
});

/**
 * onLogin 函数是 LiteLoaderQQNT 框架提供的 hook，可用于获取当前 uid
 * 受 https://github.com/adproqwq/LiteLoaderQQNT-AutoSendMessages/blob/main/src/main/index.ts 启发
 */
export const onLogin = (uid: string) => {
  UID = String(uid);
  console.log('onLogin uid=', uid);
};

ipcMain.handle('Echoes-Unheard.getUid', () => UID);

// export const onBrowserWindowCreated = (window: BrowserWindow) => {
//   console.log('A window has just been created');
//   console.log(window);
// };