// 以繁體中文介面啟動 Antigravity（不修改 App 本身的檔案）。
// 原理：用本機除錯埠（只綁 127.0.0.1）啟動 Antigravity，再把 antigravity-zh 的
// DOM 翻譯引擎與 zh-TW 字典注入每個視窗。App 關閉後本程式自動結束。
// 用法：node launch-zh-tw.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { loadLocale, buildPreloadFragment } = require('./src/locale');

const PORT = 9339;
const LANG = process.argv.includes('--lang=en') || process.env.AGENT_TOOL_LANG === 'en' ? 'en' : 'zh-TW';
const EXE = path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity', 'Antigravity.exe');
const LOG = path.join(__dirname, 'launch-zh-tw.log');
const log = (m) => { try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch {} };

// 包成 IIFE，支援重複注入熱更新字典與規則（透過 engine 內的 window.__agObserver?.disconnect() 避免疊兩個 MutationObserver）。
const payloadZh = LANG === 'en' ? '' : `(() => {\n${buildPreloadFragment(loadLocale('zh-TW'))}\n})();`;

// 快取命中小面板（agy-cache-watch）。檔案不存在就只做繁中。
// 與本資料夾同層的 agy-cache-watch（本機在 ~/.gemini 下，repo 裡也是同層）。
const CACHE_DIR = path.join(__dirname, '..', 'agy-cache-watch');
const HUD = path.join(CACHE_DIR, 'hud.js');
const hud = fs.existsSync(HUD) ? fs.readFileSync(HUD, 'utf8') : '';
const payload = `window.__agentToolLang = ${JSON.stringify(LANG)};\n` + payloadZh + '\n' + hud;

function evaluate(target, expression) {
  return new Promise((resolve) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    ws.onopen = () => ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression } }));
    ws.onmessage = () => { try { ws.close(); } catch {} resolve(true); };
    ws.onerror = () => resolve(false);
  });
}

function cacheData() {
  return new Promise((resolve) => {
    require('child_process').execFile('python', ['-I', path.join(CACHE_DIR, 'agy_cache.py'), '--json'],
      { timeout: 20000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, out) => resolve(err ? null : out.trim()));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
}

function isLocalDebugSocket(wsUrl) {
  try {
    const u = new URL(wsUrl);
    return u.protocol === 'ws:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost') && u.port === String(PORT);
  } catch { return false; }
}

function isAntigravityPage(t) {
  if (t.type !== 'page' || !isLocalDebugSocket(t.webSocketDebuggerUrl)) return false;
  try {
    const u = new URL(t.url || '');
    const appSchemes = new Set(['file:', 'app:', 'antigravity:', 'agy:', 'vscode-file:', 'vscode-webview:']);
    return appSchemes.has(u.protocol) ||
      (u.protocol === 'http:' && (u.hostname === 'localhost' || u.hostname === '127.0.0.1'));
  } catch { return false; }
}

const done = new Set();
function inject(target) {
  return new Promise((resolve) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;
    const send = (method, params) => ws.send(JSON.stringify({ id: ++id, method, params }));
    // 連線保持開著：addScriptToEvaluateOnNewDocument 只在連線存在時有效，視窗重新載入後才會自動再注入。
    ws.onopen = () => {
      send('Page.addScriptToEvaluateOnNewDocument', { source: payload });
      send('Runtime.evaluate', { expression: payload });
      setTimeout(() => resolve(true), 800);
    };
    ws.onclose = () => done.delete(target.id);
    ws.onerror = () => resolve(false);
  });
}

(async () => {
  let up = false;
  try { await targets(); up = true; } catch {}
  if (!up) {
    log('starting Antigravity with debug port');
    spawn(EXE, [`--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1'], { detached: true, stdio: 'ignore' }).unref();
  }
  let misses = 0;
  let seen = false;
  let tick = 0;
  for (;;) {
    try {
      const list = await targets();
      seen = true;
      misses = 0;
      for (const t of list) {
        if (done.has(t.id) || !isAntigravityPage(t)) continue;
        if (await inject(t)) { done.add(t.id); log('injected approved app target'); }
      }
      // 每 30 秒（第一次立即）更新快取命中面板。
      if (hud && tick++ % 15 === 0) {
        const json = await cacheData();
        if (json) for (const t of list) if (done.has(t.id) && /Antigravity/i.test(t.title || '')) await evaluate(t, `window.__agyCacheHud && window.__agyCacheHud(${json})`);
      }
    } catch {
      misses += 1;
      // 還沒啟動完成時最多等 3 分鐘；啟動過後連續 20 秒連不上就視為 App 已關閉。
      if ((seen && misses > 10) || (!seen && misses > 90)) { log('exit'); process.exit(0); }
    }
    await sleep(2000);
  }
})();
