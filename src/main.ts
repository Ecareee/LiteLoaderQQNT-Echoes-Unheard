import {BrowserWindow, ipcMain} from 'electron';
import {PluginConfig, readConfig, writeConfig} from './config/config';

let UID: string | null = null;

ipcMain.handle('Echoes-Unheard.getConfig', (e, uin: string) => {
  const cfg = readConfig(String(uin));

  // 调试开关在 main 统一管理，renderer/preload 自动同步
  e.sender.send('Echoes-Unheard.debugChanged', {uin: String(uin), debug: cfg.debug});

  return cfg;
});

ipcMain.handle('Echoes-Unheard.setConfig', (_e, uin: string, cfg: PluginConfig) => {
  const saved = writeConfig(uin, cfg);

  // 广播给所有窗口
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('Echoes-Unheard.configChanged', {uin: uin, config: saved});
    w.webContents.send('Echoes-Unheard.debugChanged', {uin: String(uin), debug: saved.debug});
  }

  return saved;
});

/**
 * onLogin 函数是 LiteLoaderQQNT 框架提供的 hook，可用于获取当前 uid
 * 受 https://github.com/adproqwq/LiteLoaderQQNT-AutoSendMessages/blob/main/src/main/index.ts 启发
 * 为什么这个插件模版没有 onLogin 函数？罪大恶极
 * 或者使用 authData 直接获取 uin？
 * 参考 https://github.com/WJZ-P/LiteLoaderQQNT-Grab-RedBag/blob/main/src/utils/grabRedBag.js
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