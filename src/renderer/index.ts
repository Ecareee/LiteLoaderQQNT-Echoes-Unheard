import {logger, setLoggerDebug} from '../util/logger';
import type {PluginConfig} from '../util/config';

const uidCache = new Map<string, string>();
let CONFIG: PluginConfig = {debug: false, rules: []};
let offRecvMsg: null | (() => void) = null;
let offCfgChanged: null | (() => void) = null;

void init();

function applyConfig(cfg: PluginConfig) {
  CONFIG = cfg;
  setLoggerDebug(CONFIG.debug);
  logger.info('config applied:', CONFIG);
}


function readMapLike(mapLike: any, key: string): any {
  if (!mapLike) return undefined;
  if (typeof mapLike.get === 'function') return mapLike.get(key);
  if (Array.isArray(mapLike)) {
    for (const [k, v] of mapLike) if (String(k) === String(key)) return v;
  }
  return mapLike[key];
}

async function getCurrentUin(): Promise<string | null> {
  const uid = await Echoes_Unheard.getUid();
  return uid ? await getUinByUid(uid) : null;
}


async function getUidByUin(uin: string): Promise<string | null> {
  if (uidCache.has(uin)) return uidCache.get(uin)!;

  // 方案 A：nodeIKernelUixConvertService
  try {
    // const res = await Echoes_Unheard.invokeNative(
    //   "ntApi",
    //   "nodeIKernelUixConvertService/getUid",
    //   false,
    //   [uin]
    // );
    const res = await Echoes_Unheard.invokeNative(
      'ntApi',
      'nodeIKernelUixConvertService/getUid',
      false,
      {uins: [uin]} // 必须是 object
    );

    logger.info('getUidByUin nodeIKernelUixConvertService result =', res);
    const uid = readMapLike(res?.uidInfo, uin);

    if (uid) {
      uidCache.set(uin, String(uid));
      return String(uid);
    }
  } catch (e) {
    logger.warn('getUidByUin nodeIKernelUixConvertService error =', e);
  }

  // 方案 B：nodeIKernelProfileService
  try {
    // const res2 = await Echoes_Unheard.invokeNative(
    //   'ntApi',
    //   'nodeIKernelProfileService/getUidByUin',
    //   false,
    //   'FriendsServiceImpl',
    //   [uin]
    // );
    const res2 = await Echoes_Unheard.invokeNative(
      'ntApi',
      'nodeIKernelProfileService/getUidByUin',
      false,
      {callFrom: 'FriendsServiceImpl', uin: [uin]} // 必须是 object
    );

    logger.info('getUidByUin nodeIKernelProfileService result =', res2);
    const uid2 = readMapLike(res2, uin);

    if (uid2) {
      uidCache.set(uin, String(uid2));
      return String(uid2);
    }
  } catch (e) {
    logger.warn('getUidByUin nodeIKernelProfileService error =', e);
  }

  return null;
}

async function getUinByUid(uid: string): Promise<string | null> {
  try {
    const res = await Echoes_Unheard.invokeNative(
      'ntApi',
      'nodeIKernelUixConvertService/getUin',
      false,
      {uids: [uid]} // 必须是 object
    );

    logger.info('getUinByUid result =', res);
    const uin = readMapLike(res?.uinInfo, uid);
    return uin ? String(uin) : null;
  } catch (e) {
    logger.warn('getUinByUid error =', e);
    return null;
  }
}

function makePlainTextElement(text: string) {
  return {
    elementId: '',
    elementType: 1,
    textElement: {content: text}
  };
}

async function sendMessage(friendUin: string, text: string) {
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

  const res = await Echoes_Unheard.invokeNative(
    'ntApi',
    'nodeIKernelMsgService/sendMsg',
    false,
    payload
  );

  logger.info('sendMessage result =', res);
  return res;
}

function matchRulesAndHandle(msg: any) {
  const chatType = msg?.chatType;
  if (chatType !== 2) return; // 只处理群消息

  const groupCode = msg?.peerUid;
  if (!groupCode) return;

  const senderUin = msg?.senderUin;
  if (!senderUin) return;

  for (const r of CONFIG.rules) {
    if (!r.enabled) continue;
    if (!r.groupCode || !r.recvFriendUin || !r.watchFriendUin) continue;
    if (r.groupCode !== groupCode) continue;
    if (r.watchFriendUin !== senderUin) continue;

    logger.info('命中规则：', {groupCode, senderUin, rule: r});

    void sendMessage(r.recvFriendUin, r.replyText);
  }
}

function handleIncomingPayload(payload: any) {
  logger.info('收到消息：', payload);

  const msg = payload?.msgList?.[0];
  if (!msg) return;

  matchRulesAndHandle(msg);
}

async function init() {
  const uin = await getCurrentUin();
  if (!uin) {
    logger.error('无法获取当前登录账号 uin');
    return;
  }

  const cfg = (await Echoes_Unheard.getConfig(uin)) as PluginConfig;
  applyConfig(cfg);

  logger.info('当前账号：', uin);
  logger.info('加载配置：', CONFIG);

  if (!offRecvMsg) {
    offRecvMsg = Echoes_Unheard.subscribeEvent('nodeIKernelMsgListener/onRecvMsg', handleIncomingPayload);
  }

  if (!offCfgChanged) {
    offCfgChanged = Echoes_Unheard.onConfigChanged(({uin: changedUin, config}) => {
      if (String(changedUin) !== String(uin)) return;
      applyConfig(config as PluginConfig);
    });
  }
}

export const onSettingWindowCreated = async (view: HTMLElement) => {
  const uin = await getCurrentUin();
  if (!uin) {
    view.innerHTML = '<setting-text>无法获取当前账号</setting-text>';
    return;
  }

  view.innerHTML = `
    <style>
      #rules-container{
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
  
      .rule-header{
        margin-bottom: 2px;
        opacity: .7;
      }
  
      .rule-row{
        padding: 2px 0;
      }
  
      /* 解决文字被圆角挤压 */
      .rule-grid .q-input{
        min-width: 0;
        height: 34px;
        line-height: 34px;
        padding: 0 12px;
        box-sizing: border-box;
        font-size: 12px;
      }
    </style>

    <setting-section data-title="配置">
      <setting-panel>
        <setting-list data-direction="column">
          <setting-item data-direction="column">
            <div id="rules-container"></div>
          </setting-item>

          <setting-item>
            <div style="display:flex; justify-content:flex-start;">
              <setting-button id="add-rule-btn" data-type="primary">+ 添加规则</setting-button>
            </div>
          </setting-item>

          <setting-item data-direction="row">
            <div>
              <setting-text>调试模式</setting-text>
              <setting-text data-type="secondary">
                开启后在控制台输出详细日志
              </setting-text>
            </div>
            <setting-switch id="debug-switch"></setting-switch>
          </setting-item>
        </setting-list>
      </setting-panel>
    </setting-section>
  `;

  const rulesContainer = view.querySelector('#rules-container') as HTMLDivElement;
  const addRuleBtn = view.querySelector('#add-rule-btn') as HTMLElement;
  const debugSwitch = view.querySelector('#debug-switch') as HTMLElement;

  // 设置页使用用本地配置，而不是全局 CONFIG
  let uiConfig = (await Echoes_Unheard.getConfig(uin)) as PluginConfig;
  const saveConfig = async () => {
    uiConfig = await Echoes_Unheard.setConfig(uin, uiConfig);
  };

  let saveTimer: number | null = null;

  const scheduleSave = () => {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      saveConfig().catch(console.error);
      logger.info('scheduleSave 当前 config', uiConfig);
      saveTimer = null;
    }, 300);
  };

  const setSwitchActive = (active: boolean) => {
    if (active) debugSwitch.setAttribute('is-active', '');
    else debugSwitch.removeAttribute('is-active');
  };

  const getSwitchActive = () => debugSwitch.hasAttribute('is-active');

  const renderRules = () => {
    rulesContainer.innerHTML = '';

    if (!uiConfig.rules.length) {
      rulesContainer.innerHTML = `
      <setting-text data-type="secondary" style="opacity:.7;">
        暂无规则，点击下方 “+ 添加规则”
      </setting-text>
    `;
      return;
    }

    // 启用开关为 40px，四个元素平均分配宽度，删除按钮为 60px
    const cols = '40px repeat(4, minmax(0, 1fr)) 60px';

    const header = document.createElement('div');
    header.className = 'rule-grid rule-header';
    header.style.cssText = `
      display:grid;
      grid-template-columns: ${cols};
      gap:8px;
      font-size:12px;
      width:100%;
      align-items:center;
    `;
    header.innerHTML = `
      <div>启用</div>
      <div>群号</div>
      <div>触发者QQ</div>
      <div>接收者QQ</div>
      <div>回复文本</div>
      <div></div>
    `;
    rulesContainer.appendChild(header);

    uiConfig.rules.forEach((r, i) => {
      const row = document.createElement('div');
      row.className = 'rule-grid rule-row';
      row.style.cssText = `
        display:grid;
        grid-template-columns: ${cols};
        gap:8px;
        width:100%;
        align-items:center;
      `;
      row.innerHTML = `
        <setting-switch class="enable-switch" ${r.enabled ? 'is-active' : ''}></setting-switch>
        <input class="q-input" value="${r.groupCode}">
        <input class="q-input" value="${r.watchFriendUin}">
        <input class="q-input" value="${r.recvFriendUin}">
        <input class="q-input" value="${r.replyText}">
        <setting-button class="del-btn" data-type="secondary">删除</setting-button>
      `;

      const inputs = row.querySelectorAll('input');
      inputs[0].oninput = e => {
        uiConfig.rules[i].groupCode = (e.target as HTMLInputElement).value;
        scheduleSave();
      };
      inputs[1].oninput = e => {
        uiConfig.rules[i].watchFriendUin = (e.target as HTMLInputElement).value;
        scheduleSave();
      };
      inputs[2].oninput = e => {
        uiConfig.rules[i].recvFriendUin = (e.target as HTMLInputElement).value;
        scheduleSave();
      };
      inputs[3].oninput = e => {
        uiConfig.rules[i].replyText = (e.target as HTMLInputElement).value;
        scheduleSave();
      };

      const delBtn = row.querySelector('.del-btn') as HTMLElement;
      delBtn.addEventListener('click', () => {
        uiConfig.rules.splice(i, 1);
        renderRules();
        saveConfig();
      });

      const enableSwitch = row.querySelector('.enable-switch') as HTMLElement;

      const setEnableSwitchActive = (active: boolean) => {
        if (active) enableSwitch.setAttribute('is-active', '');
        else enableSwitch.removeAttribute('is-active');
      };
      const getEnableSwitchActive = () => enableSwitch.hasAttribute('is-active');

      enableSwitch.addEventListener('click', () => {
        const next = !getEnableSwitchActive();
        setEnableSwitchActive(next);
        uiConfig.rules[i].enabled = next;
        scheduleSave();
      });

      rulesContainer.appendChild(row);
    });
  };

  addRuleBtn.addEventListener('click', async () => {
    uiConfig.rules.push({
      enabled: true,
      groupCode: '',
      watchFriendUin: '',
      recvFriendUin: '',
      replyText: ''
    });
    renderRules();
    await saveConfig();
  });

  debugSwitch.addEventListener('click', async () => {
    const next = !getSwitchActive();
    setSwitchActive(next);
    uiConfig.debug = next;
    await saveConfig();
  });

  // 初始化
  await (async () => {
    uiConfig = await Echoes_Unheard.getConfig(uin);
    setSwitchActive(uiConfig.debug);
    renderRules();
  })();
};