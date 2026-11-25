// 以繁體中文介面啟動 Antigravity（不修改 App 本身的檔案）。
// 原理：用本機除錯埠（只綁 127.0.0.1）啟動 Antigravity，再把 antigravity-zh 的
// DOM 翻譯引擎與 zh-TW 字典注入每個視窗。App 關閉後本程式自動結束。
// 用法：node launch-zh-tw.js
const { spawn } = require('child_process');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { createOwnerGuard } = require('../shared/cdp-owner');
const { PYTHON, appArgs } = require('../shared/app-launch');
const { loadLocale, buildPreloadFragment } = require('./src/locale');

const CANDIDATE_PORTS = [9339, 9341, 9342, 9343, 9344, 9345];
const OWNER_TTL_MS = 300000;
let PORT = CANDIDATE_PORTS[0];
let ensureOwner = createOwnerGuard('antigravity', PORT, undefined, undefined, OWNER_TTL_MS);
const LANG = process.argv.includes('--lang=en') || process.env.AGENT_TOOL_LANG === 'en' ? 'en' : 'zh-TW';
const EXE = process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA, 'Programs', 'antigravity', 'Antigravity.exe')
  : process.env.AGENT_TOOL_ANTIGRAVITY_EXE || 'antigravity';
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
    require('child_process').execFile(PYTHON, ['-I', path.join(CACHE_DIR, 'agy_cache.py'), '--json'],
      { timeout: 20000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, out) => resolve(err ? null : out.trim()));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets(port = PORT, guard = ensureOwner) {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) { const e = new Error('Unrecognized CDP HTTP endpoint'); e.code = 'UNTRUSTED_CDP'; throw e; }
  guard();
  const list = await res.json();
  if (!Array.isArray(list)) { const e = new Error('Invalid CDP target list'); e.code = 'UNTRUSTED_CDP'; throw e; }
  return list;
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.once('error', () => resolve(false));
    srv.listen(port, '127.0.0.1', () => srv.close(() => resolve(true)));
  });
}

async function pickPort() {
  for (const p of CANDIDATE_PORTS) {
    const g = createOwnerGuard('antigravity', p, undefined, undefined, OWNER_TTL_MS);
    try {
      await targets(p, g);
      PORT = p;
      ensureOwner = g;
      return { up: true };
    } catch {}
  }
  for (const p of CANDIDATE_PORTS) {
    if (await isPortFree(p)) {
      PORT = p;
      ensureOwner = createOwnerGuard('antigravity', p, undefined, undefined, OWNER_TTL_MS);
      return { up: false };
    }
  }
  return { up: false };
}

function isLocalDebugSocket(wsUrl) {
  try {
    const u = new URL(wsUrl);
    return u.protocol === 'ws:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost') &&
      u.port === String(PORT) && !u.username && !u.password && /^\/devtools\/page\/[A-Za-z0-9-]+$/.test(u.pathname);
  } catch { return false; }
}

function isAntigravityPage(t) {
  if (t.type !== 'page' || !isLocalDebugSocket(t.webSocketDebuggerUrl)) return false;
  try {
    const u = new URL(t.url || '');
    if (u.protocol === 'antigravity:' || u.protocol === 'agy:') return true;
    if (u.protocol === 'app:') return !u.hostname || u.hostname === 'antigravity';
    if (u.protocol === 'file:') return /\/antigravity\//i.test(u.pathname);
    return (u.protocol === 'http:' || u.protocol === 'https:') &&
      (u.hostname === 'localhost' || u.hostname === '127.0.0.1');
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
  const { up } = await pickPort();
  if (!up) {
    log(`starting Antigravity with debug port ${PORT}`);
    try {
      const child = spawn(EXE, [`--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1', ...appArgs()], { detached: true, stdio: 'ignore' });
      child.on('error', (e) => { log('Antigravity launch failed: ' + String(e.code || 'unknown')); process.exit(1); });
      child.unref();
    } catch (e) {
      log('Antigravity launch failed: ' + String(e.code || 'unknown'));
      process.exit(1);
    }
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
        ensureOwner();
        if (await inject(t)) { done.add(t.id); log('injected approved app target'); }
      }
      // 每 30 秒（第一次立即）更新快取命中面板。
      if (hud && tick++ % 15 === 0) {
        const json = await cacheData();
        if (json) {
          ensureOwner();
          for (const t of list) if (done.has(t.id) && isAntigravityPage(t)) await evaluate(t, `window.__agyCacheHud && window.__agyCacheHud(${json})`);
        }
      }
    } catch (e) {
      if (e.code === 'UNTRUSTED_CDP') { log('refused untrusted CDP listener'); process.exit(1); }
      if (e.code === 'CDP_CHECK_TIMEOUT') { log('CDP owner check timed out; retrying'); await sleep(2000); continue; }
      misses += 1;
      // 還沒啟動完成時最多等 3 分鐘；啟動過後連續 20 秒連不上就視為 App 已關閉。
      if ((seen && misses > 10) || (!seen && misses > 90)) { log('exit'); process.exit(0); }
    }
    await sleep(2000);
  }
})();
