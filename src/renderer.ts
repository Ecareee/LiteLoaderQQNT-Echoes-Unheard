import {logger, setLoggerDebug} from './util/logger';
import type {PluginConfig} from './config/config';
import {getRuntimeConfig, setRuntimeConfig, setUin} from './config/runtime';
import {checkStrike, handlePrivateReply, syncRepliesFromHistory} from './util/strike';

let uin: string | null = null;

let offRecvMsg: null | (() => void) = null;
let offCfgChanged: null | (() => void) = null;
let offDebugChanged: null | (() => void) = null;

void init();

async function init() {
  uin = await Echoes_Unheard.getCurrentUin();
  if (!uin) {
    logger.error('无法获取当前登录账号 uin');
    return;
  }

  setUin(uin);

  if (!offDebugChanged) {
    offDebugChanged = Echoes_Unheard.onDebugChanged(({uin: changedUin, debug}) => {
      if (String(changedUin) !== String(uin)) return;
      setLoggerDebug(debug);
      logger.info('debug 同步:', debug);
    });
  }

  const cfg = (await Echoes_Unheard.getConfig(uin)) as PluginConfig;
  applyConfig(cfg);

  logger.info('当前账号：', uin);
  logger.info('加载配置：', getRuntimeConfig());

  if (!offCfgChanged) {
    offCfgChanged = Echoes_Unheard.onConfigChanged(({uin: changedUin, config}) => {
      if (String(changedUin) !== String(uin)) return;
      applyConfig(config as PluginConfig);
    });
  }
}

// ui 专用
function uiDebounce<T extends (...args: any[]) => void>(fn: T, wait = 300) {
  let t: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => {
      fn(...args);
      t = null;
    }, wait);
  };
}

function handleIncomingPayload(payload: any) {
  const CONFIG = getRuntimeConfig();
  if (!CONFIG.enabled) return;

  logger.info('收到消息：', payload);

  const msg = payload?.msgList?.[0];
  if (!msg) return;

  const chatType = msg?.chatType;

  if (chatType === 1) {
    handlePrivateReply(msg, CONFIG);
    return;
  }

  if (chatType === 2) {
    matchRulesAndHandle(msg);
  }
}

function matchRulesAndHandle(msg: any) {
  const CONFIG = getRuntimeConfig();

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

    if (!checkStrike(r, CONFIG)) continue;

    void Echoes_Unheard.sendMessage(r.targetFriendUin, r.replyText);
  }
}

function setSwitchActive(el: HTMLElement, active: boolean) {
  if (active) el.setAttribute('is-active', '');
  else el.removeAttribute('is-active');
}

function getSwitchActive(el: HTMLElement) {
  return el.hasAttribute('is-active');
}

function bindSwitch(el: HTMLElement, getValue: () => boolean, setValue: (v: boolean) => void, afterToggle?: () => void) {
  setSwitchActive(el, getValue());
  el.addEventListener('click', () => {
    const next = !getSwitchActive(el);
    setSwitchActive(el, next);
    setValue(next);
    afterToggle?.();
  });
}

function reconcileSubscription() {
  const CONFIG = getRuntimeConfig();

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
  const prevStrike = getRuntimeConfig().strikeOutMode;

  setRuntimeConfig(cfg);
  const CONFIG = getRuntimeConfig();

  setLoggerDebug(CONFIG.debug);
  logger.info('config applied:', CONFIG);

  reconcileSubscription();

  if (!prevStrike && !!CONFIG.strikeOutMode) {
    void syncRepliesFromHistory(CONFIG);
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
              <setting-text>三振出局模式</setting-text>
              <setting-text data-type="secondary">
                接收者连续 3 次没有回复时，下次将自动关闭命中规则
              </setting-text>
            </div>
            <setting-switch id="strike-switch"></setting-switch>
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

  // 设置页使用用本地配置，而不是全局 CONFIG，避免直接影响运行态 CONFIG
  let uiConfig = (await Echoes_Unheard.getConfig(uin)) as PluginConfig;
  const saveConfig = async () => {
    const latest = (await Echoes_Unheard.getConfig(uin)) as PluginConfig;

    // 只把 UI 可编辑的字段覆盖到 latest 上，保留持久化字段
    latest.enabled = uiConfig.enabled;
    latest.debug = uiConfig.debug;
    latest.strikeOutMode = uiConfig.strikeOutMode;

    // 持久化字段（awaitingReply/noReplyStreak/lastSentAt/lastReplyAt）以 latest 为准保留
    latest.rules = uiConfig.rules.map((r, idx) => {
      const base = latest.rules?.[idx] ?? {};
      return {
        ...base,
        enabled: r.enabled,
        groupCode: r.groupCode,
        triggerFriendUin: r.triggerFriendUin,
        targetFriendUin: r.targetFriendUin,
        replyText: r.replyText
      };
    });

    uiConfig = (await Echoes_Unheard.setConfig(uin, latest)) as PluginConfig;
  };
  const scheduleSave = uiDebounce(() => {
    void saveConfig();
    logger.info('scheduleSave 当前 config', uiConfig);
  }, 300);

  const enabledSwitch = view.querySelector('#enabled-switch') as HTMLElement;
  const rulesContainer = view.querySelector('#rules-container') as HTMLDivElement;
  const addRuleBtn = view.querySelector('#add-rule-btn') as HTMLElement;
  const strikeSwitch = view.querySelector('#strike-switch') as HTMLElement;
  const debugSwitch = view.querySelector('#debug-switch') as HTMLElement;

  bindSwitch(enabledSwitch, () => uiConfig.enabled, (v) => (uiConfig.enabled = v), scheduleSave);
  bindSwitch(strikeSwitch, () => !!uiConfig.strikeOutMode, (v) => (uiConfig.strikeOutMode = v), scheduleSave);
  bindSwitch(debugSwitch, () => uiConfig.debug, (v) => (uiConfig.debug = v), scheduleSave);

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
      <div>触发者 QQ 号</div>
      <div>接收者 QQ 号</div>
      <div>回复文本</div>
      <div></div>
    `;
    rulesContainer.appendChild(header);

    uiConfig.rules.forEach((r, i) => {
      const row = makeGridRow('rule-row');
      row.dataset.index = String(i);

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

  addRuleBtn.addEventListener('click', () => {
    uiConfig.rules.push({
      enabled: true,
      groupCode: '',
      triggerFriendUin: '',
      targetFriendUin: '',
      replyText: '',

      awaitingReply: false,
      noReplyStreak: 0,
      lastSentAt: 0,
      lastReplyAt: 0
    } as any);

    renderRules();
    scheduleSave();
  });

  // 初始化
  uiConfig = (await Echoes_Unheard.getConfig(uin)) as PluginConfig;
  setSwitchActive(enabledSwitch, uiConfig.enabled);
  setSwitchActive(strikeSwitch, !!uiConfig.strikeOutMode);
  setSwitchActive(debugSwitch, uiConfig.debug);
  renderRules();

  /**
   * 尝试解决「主窗口后台修改规则的 enabled 时，设置页开关不自动刷新」的问题
   * - onConfigChanged 会收到最新 config
   * - 若用户正在规则区域输入：避免 renderRules() 全量重绘
   *   只 patch 各行 enabled 开关，保证 UI 状态实时一致
   * - 若未编辑：允许全量 renderRules()，保持设置页完整同步
   */
  let offUiCfgChanged: null | (() => void) = null;

  function patchEnabledSwitchesOnly() {
    const rows = rulesContainer.querySelectorAll('.rule-row');
    rows.forEach((row) => {
      const idx = Number((row as HTMLElement).dataset.index ?? -1);
      if (idx < 0) return;
      const r = uiConfig.rules[idx];
      if (!r) return;
      const sw = row.querySelector('.enable-switch') as HTMLElement | null;
      if (sw) setSwitchActive(sw, r.enabled);
    });
  }

  function isEditingInRules(): boolean {
    const ae = document.activeElement as HTMLElement | null;
    return !!ae && ae.tagName === 'INPUT' && rulesContainer.contains(ae);
  }

  offUiCfgChanged = Echoes_Unheard.onConfigChanged(({uin: changedUin, config}) => {
    if (String(changedUin) !== String(uin)) return;

    uiConfig = config as PluginConfig;

    setSwitchActive(enabledSwitch, uiConfig.enabled);
    setSwitchActive(strikeSwitch, !!uiConfig.strikeOutMode);
    setSwitchActive(debugSwitch, uiConfig.debug);

    if (isEditingInRules()) {
      patchEnabledSwitchesOnly();
    } else {
      renderRules();
    }
  });

  window.addEventListener('unload', () => offUiCfgChanged?.());
};