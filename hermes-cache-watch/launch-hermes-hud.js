// 以本機除錯埠（只綁 127.0.0.1:9346）啟動 Hermes Desktop，並注入 GPT 額度圓環與 Hermes 快取面板（hud.js）。
// 不修改 App 本身的檔案。App 關閉後本程式自動結束。
// 用法：node launch-hermes-hud.js
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const { createOwnerGuard, procArgvs } = require('../shared/cdp-owner');
const { PYTHON, appArgs } = require('../shared/app-launch');
const { queryQuota, createQuotaPoller } = require('./live-quota');

const PORT = 9346;
const OWNER_TTL_MS = 300000;
const ensureOwner = createOwnerGuard('hermes', PORT, undefined, undefined, OWNER_TTL_MS);
const LANG = process.argv.includes('--lang=en') || process.env.AGENT_TOOL_LANG === 'en' ? 'en' : 'zh-TW';
const IS_WIN = process.platform === 'win32';
const LOG = path.join(__dirname, 'launch-hermes-hud.log');
const log = (m) => { try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch {} };

const HUD = path.join(__dirname, 'hud.js');
const PY = path.join(__dirname, 'hermes_cache.py');
const hud = `window.__agentToolLang = ${JSON.stringify(LANG)};\n` + (fs.existsSync(HUD) ? fs.readFileSync(HUD, 'utf8') : '');

function resolveExe() {
  if (!IS_WIN) {
    return process.env.AGENT_TOOL_HERMES_EXE || '/usr/local/lib/hermes-agent/apps/desktop/release/linux-arm64-unpacked/Hermes';
  }
  return process.env.AGENT_TOOL_HERMES_EXE || path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Hermes', 'Hermes.exe');
}

function isHermesRunning() {
  if (!IS_WIN) {
    return procArgvs().some((a) => path.basename(a[0] || '') === 'Hermes' && !a.some((x) => x.startsWith('--type=')));
  }
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq Hermes.exe', '/NH'], { encoding: 'utf8', windowsHide: true });
    return /Hermes\.exe/i.test(out);
  } catch {
    return false;
  }
}

function warnAlreadyRunning() {
  const msg = LANG === 'en'
    ? `Hermes is already running without debugging port ${PORT}, so the usage HUD cannot attach. Close Hermes, then start it again from this launcher.`
    : `Hermes 已經在執行，但沒有開啟除錯埠 ${PORT}，額度與快取面板無法掛上。請先關閉 Hermes，再從這個捷徑重新開啟。`;
  if (!IS_WIN) {
    try { execFileSync('zenity', ['--info', '--no-wrap', '--title=Hermes HUD', `--text=${msg}`]); } catch {}
  } else {
    log(msg);
  }
}

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
    require('child_process').execFile(PYTHON, ['-I', PY, '--json', '--no-codex-quota'],
      { timeout: 20000, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, out) => resolve(err ? null : out.trim()));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) { const e = new Error('Unrecognized CDP HTTP endpoint'); e.code = 'UNTRUSTED_CDP'; throw e; }
  ensureOwner();
  const list = await res.json();
  if (!Array.isArray(list)) { const e = new Error('Invalid CDP target list'); e.code = 'UNTRUSTED_CDP'; throw e; }
  return list;
}

const done = new Set();
function inject(target) {
  return new Promise((resolve) => {
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;
    const send = (method, params) => ws.send(JSON.stringify({ id: ++id, method, params }));
    ws.onopen = () => {
      send('Page.addScriptToEvaluateOnNewDocument', { source: hud });
      send('Runtime.evaluate', { expression: hud });
      setTimeout(() => resolve(true), 800);
    };
    ws.onclose = () => done.delete(target.id);
    ws.onerror = () => resolve(false);
  });
}

function isMainPage(t) {
  if (t.type !== 'page' || !t.webSocketDebuggerUrl) return false;
  try {
    const ws = new URL(t.webSocketDebuggerUrl);
    if (ws.protocol !== 'ws:' || !['127.0.0.1', 'localhost'].includes(ws.hostname) || ws.port !== String(PORT) ||
        ws.username || ws.password || !/^\/devtools\/page\/[A-Za-z0-9-]+$/.test(ws.pathname)) return false;
    const u = new URL(t.url || '');
    if (u.protocol === 'hermes:') return true;
    if (u.protocol === 'file:') return /\/(?:hermes-agent\/apps\/desktop|Hermes)\//i.test(u.pathname) && /\/index\.html$/i.test(u.pathname);
    return (u.protocol === 'http:' || u.protocol === 'https:') && ['localhost', '127.0.0.1'].includes(u.hostname);
  } catch { return false; }
}

(async () => {
  let up = false;
  let initialList = [];
  try { initialList = await targets(); up = true; } catch (e) {
    if (e.code === 'UNTRUSTED_CDP') { log('refused untrusted CDP listener'); process.exit(1); }
  }
  if (!up) {
    if (isHermesRunning()) {
      log(`Hermes is already running without debug port ${PORT}`);
      warnAlreadyRunning();
      process.exit(0);
    }
    const exe = resolveExe();
    log(`starting Hermes with local debug port ${PORT}`);
    try {
      const child = spawn(exe, [`--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1', ...appArgs()], { detached: true, stdio: 'ignore', windowsHide: false });
      child.on('error', (err) => log(`spawn error: ${err.message}`));
      child.unref();
    } catch (err) {
      log(`spawn throw: ${err.message}`);
      process.exit(1);
    }
  } else {
    const main = initialList.find((t) => isMainPage(t) && t.id);
    if (main) {
      try {
        ensureOwner();
        await fetch(`http://127.0.0.1:${PORT}/json/activate/${encodeURIComponent(main.id)}`, { signal: AbortSignal.timeout(2500) });
      } catch {}
    }
  }

  let misses = 0;
  let seen = false;
  let tick = 0;
  let lastCache = null, lastQuota = null;
  const codex = !IS_WIN && fs.existsSync('/usr/lib/chatgpt/resources/codex') ? '/usr/lib/chatgpt/resources/codex' : (IS_WIN ? 'codex.exe' : 'codex');
  const quotaPoller = createQuotaPoller(() => queryQuota(codex));
  for (;;) {
    try {
      const list = await targets();
      seen = true;
      misses = 0;
      let newlyInjected = false;
      for (const t of list) {
        if (!isMainPage(t) || done.has(t.id)) continue;
        ensureOwner();
        if (await inject(t)) {
          done.add(t.id);
          newlyInjected = true;
          log('injected approved Hermes target');
        }
      }
      const quota = await quotaPoller.refresh();
      const quotaChanged = quota !== lastQuota;
      if (quotaChanged && quota.quotaStatus !== 'fresh') log('Codex quota unavailable; check Codex installation and sign-in; retry scheduled');
      lastQuota = quota;
      let cacheUpdated = false;
      if (hud && (newlyInjected || tick++ % 15 === 0)) {
        const json = await cacheData();
        if (json) {
          try { lastCache = JSON.parse(json); cacheUpdated = true; } catch { log('invalid Hermes cache data'); }
        } else log('Hermes cache data unavailable');
      }
      if (lastCache && (quotaChanged || newlyInjected || cacheUpdated)) {
        ensureOwner();
        const json = JSON.stringify({ ...lastCache, ...quota });
        for (const t of list) {
          if (done.has(t.id) && isMainPage(t)) {
            await evaluate(t, `window.__hermesCacheHud && window.__hermesCacheHud(${json})`);
          }
        }
      }
    } catch (e) {
      if (e.code === 'UNTRUSTED_CDP') { log('refused untrusted CDP listener'); process.exit(1); }
      if (e.code === 'CDP_CHECK_TIMEOUT') { log('CDP owner check timed out; retrying'); await sleep(2000); continue; }
      misses += 1;
      if ((seen && misses > 10) || (!seen && misses > 90)) {
        log('exit');
        process.exit(0);
      }
    }
    await sleep(2000);
  }
})();
