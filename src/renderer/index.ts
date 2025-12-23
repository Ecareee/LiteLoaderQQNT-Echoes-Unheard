import {logger, setLoggerDebug} from '../util/logger';
import type {PluginConfig} from '../util/config';

let CONFIG: PluginConfig = {enabled: true, debug: false, rules: []};
let uin: string | null = null;

let offRecvMsg: null | (() => void) = null;
let offCfgChanged: null | (() => void) = null;
let offDebugChanged: null | (() => void) = null;

void init();

function reconcileSubscription() {
  if (CONFIG.enabled) {
    if (!offRecvMsg) {
      offRecvMsg = Echoes_Unheard.subscribeEvent(
        'nodeIKernelMsgListener/onRecvMsg',
        handleIncomingPayload
      );
      logger.info('已订阅 onRecvMsg');
    }
  } else {
    if (offRecvMsg) {
      offRecvMsg();
      offRecvMsg = null;
      logger.info('已退订 onRecvMsg');
    }
  }
}

function applyConfig(cfg: PluginConfig) {
  CONFIG = cfg;
  logger.info('config applied:', CONFIG);
  reconcileSubscription();
}

function matchRulesAndHandle(msg: any) {
  const chatType = msg?.chatType;
  if (chatType !== 2) return; // 只处理群消息

  const groupCode = String(msg?.peerUid ?? '');
  const senderUin = String(msg?.senderUin ?? '');
  if (!groupCode || !senderUin) return;

  for (const r of CONFIG.rules) {
    if (!r.enabled) continue;
    if (!r.groupCode || !r.triggerFriendUin || !r.targetFriendUin) continue;
    if (r.groupCode !== groupCode) continue;
    if (r.triggerFriendUin !== senderUin) continue;

    logger.info('命中规则：', {groupCode, senderUin, rule: r});

    void Echoes_Unheard.sendMessage(r.targetFriendUin, r.replyText);
  }
}

function handleIncomingPayload(payload: any) {
  if (!CONFIG.enabled) return;

  logger.info('收到消息：', payload);

  const msg = payload?.msgList?.[0];
  if (!msg) return;

  matchRulesAndHandle(msg);
}

async function init() {
  uin = await Echoes_Unheard.getCurrentUin();
  if (!uin) {
    logger.error('无法获取当前登录账号 uin');
    return;
  }

  if (!offDebugChanged) {
    offDebugChanged = Echoes_Unheard.onDebugChanged(({ uin: changedUin, debug }) => {
      if (String(changedUin) !== String(uin)) return;
      setLoggerDebug(debug);
      logger.info('debug 同步:', debug);
    });
  }

  const cfg = (await Echoes_Unheard.getConfig(uin)) as PluginConfig;
  applyConfig(cfg);

  logger.info('当前账号：', uin);
  logger.info('加载配置：', CONFIG);

  if (!offCfgChanged) {
    offCfgChanged = Echoes_Unheard.onConfigChanged(({uin: changedUin, config}) => {
      if (String(changedUin) !== String(uin)) return;
      applyConfig(config as PluginConfig);
    });
  }
}

export const onSettingWindowCreated = async (view: HTMLElement) => {
  const uin = await Echoes_Unheard.getCurrentUin();

  const configTip = uin ? `当前配置文件：${uin}.json` : '无法获取当前账号';

  if (!uin) {
    view.innerHTML = `<setting-text>${configTip}</setting-text>`;
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
            <setting-text>${configTip}</setting-text>
          </setting-item>

          <setting-item data-direction="row">
            <div>
              <setting-text>全局启用</setting-text>
              <setting-text data-type="secondary">关闭后将停止监听消息</setting-text>
            </div>
            <setting-switch id="enabled-switch"></setting-switch>
          </setting-item>
          
          <!--setting-item 组件并不是真正的自由 flex 容器-->
          <setting-item data-direction="column">
            <div style="display:flex; justify-content:flex-start; flex-direction:column; width:100%; gap:12px;">
              <setting-text style="display:block;">规则</setting-text>
              <div id="rules-container" style="width:100%;"></div>
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

  const enabledSwitch = view.querySelector('#enabled-switch') as HTMLElement;
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

  const setSwitchActive = (el: HTMLElement, active: boolean) => {
    if (active) el.setAttribute('is-active', '');
    else el.removeAttribute('is-active');
  };
  const getSwitchActive = (el: HTMLElement) => el.hasAttribute('is-active');

  // 启用开关为 40px，四个元素平均分配宽度，删除按钮为 60px
  const cols = '40px repeat(4, minmax(0, 1fr)) 60px';

  function makeGridRow(className: string) {
    const row = document.createElement('div');
    row.className = `rule-grid ${className}`;
    row.style.cssText = `
      display:grid;
      grid-template-columns: ${cols};
      gap:8px;
      width:100%;
      align-items:center;
    `;
    return row;
  }

  function makeInput(value: string, onInput: (v: string) => void) {
    const input = document.createElement('input');
    input.className = 'q-input';
    input.value = value ?? '';
    input.addEventListener('input', (e) => {
      onInput((e.target as HTMLInputElement).value);
      scheduleSave();
    });
    return input;
  }

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

    const header = makeGridRow('rule-header');
    header.style.fontSize = '12px';
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
      const row = makeGridRow('rule-row');

      const enableSwitch = document.createElement('setting-switch');
      enableSwitch.className = 'enable-switch';
      setSwitchActive(enableSwitch, r.enabled);
      enableSwitch.addEventListener('click', () => {
        const next = !getSwitchActive(enableSwitch);
        setSwitchActive(enableSwitch, next);
        uiConfig.rules[i].enabled = next;
        scheduleSave();
      });

      const groupInput = makeInput(r.groupCode, (v) => (uiConfig.rules[i].groupCode = v));
      const triggerInput = makeInput(r.triggerFriendUin, (v) => (uiConfig.rules[i].triggerFriendUin = v));
      const targetInput = makeInput(r.targetFriendUin, (v) => (uiConfig.rules[i].targetFriendUin = v));
      const replyInput = makeInput(r.replyText, (v) => (uiConfig.rules[i].replyText = v));

      const delBtn = document.createElement('setting-button');
      delBtn.className = 'del-btn';
      delBtn.setAttribute('data-type', 'secondary');
      delBtn.textContent = '删除';
      delBtn.addEventListener('click', () => {
        uiConfig.rules.splice(i, 1);
        renderRules();
        void saveConfig();
      });

      row.appendChild(enableSwitch);
      row.appendChild(groupInput);
      row.appendChild(triggerInput);
      row.appendChild(targetInput);
      row.appendChild(replyInput);
      row.appendChild(delBtn);

      rulesContainer.appendChild(row);
    });
  };

  enabledSwitch.addEventListener('click', async () => {
    const next = !getSwitchActive(enabledSwitch);
    setSwitchActive(enabledSwitch, next);
    uiConfig.enabled = next;
    await saveConfig();
  });

  addRuleBtn.addEventListener('click', async () => {
    uiConfig.rules.push({
      enabled: true,
      groupCode: '',
      triggerFriendUin: '',
      targetFriendUin: '',
      replyText: ''
    });
    renderRules();
    await saveConfig();
  });

  debugSwitch.addEventListener('click', async () => {
    const next = !getSwitchActive(debugSwitch);
    setSwitchActive(debugSwitch, next);
    uiConfig.debug = next;
    await saveConfig();
  });

  // 初始化
  uiConfig = (await Echoes_Unheard.getConfig(uin)) as PluginConfig;
  setSwitchActive(enabledSwitch, uiConfig.enabled);
  setSwitchActive(debugSwitch, uiConfig.debug);
  renderRules();
};