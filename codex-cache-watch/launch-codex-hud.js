// 以本機除錯埠（只綁 127.0.0.1:9340）啟動 ChatGPT / Codex 桌面版，並注入快取命中、模型額度與上下文結構面板（hud.js）。
// 不修改 App 本身的檔案。App 關閉後本程式自動結束。
// 用法：node launch-codex-hud.js
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 9340;
const ALIAS = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'chatgpt-desktop.exe');
const LOG = path.join(__dirname, 'launch-codex-hud.log');
const log = (m) => { try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch {} };

const HUD = path.join(__dirname, 'hud.js');
const PY = path.join(__dirname, 'codex_cache.py');
const hud = fs.existsSync(HUD) ? fs.readFileSync(HUD, 'utf8') : '';

function resolveExe() {
  if (fs.existsSync(ALIAS)) return ALIAS;
  try {
    const base = 'C:\\Program Files\\WindowsApps';
    const dirs = fs.readdirSync(base).filter((d) => d.startsWith('OpenAI.Codex_') && d.includes('_x64__')).sort().reverse();
    if (dirs.length) return path.join(base, dirs[0], 'app', 'ChatGPT.exe');
  } catch {}
  return ALIAS;
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
    require('child_process').execFile('python', ['-I', PY, '--json'],
      { timeout: 20000, windowsHide: true }, (err, out) => resolve(err ? null : out.trim()));
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function targets() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return res.json();
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
  const u = t.url || '';
  if (u.includes('avatar-overlay') || u.startsWith('devtools://')) return false;
  return /^(app|file|https?:\/\/(localhost|127\.0\.0\.1|chatgpt\.com))/i.test(u) || /Codex|ChatGPT/i.test(t.title || '');
}

(async () => {
  let up = false;
  try { await targets(); up = true; } catch {}
  if (!up) {
    const exe = resolveExe();
    log(`starting ChatGPT/Codex with debug port ${PORT}: ${exe}`);
    spawn(exe, [`--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1'], { detached: true, stdio: 'ignore' }).unref();
  }
  let misses = 0;
  let seen = false;
  let tick = 0;
  for (;;) {
    try {
      const list = await targets();
      seen = true;
      misses = 0;
      let newlyInjected = false;
      for (const t of list) {
        if (!isMainPage(t) || done.has(t.id)) continue;
        if (await inject(t)) {
          done.add(t.id);
          newlyInjected = true;
          log(`injected: ${t.title} ${t.url}`);
        }
      }
      if (hud && (newlyInjected || tick++ % 15 === 0)) {
        const json = await cacheData();
        if (json) {
          for (const t of list) {
            if (done.has(t.id) && isMainPage(t)) {
              await evaluate(t, `window.__codexCacheHud && window.__codexCacheHud(${json})`);
            }
          }
        }
      }
    } catch {
      misses += 1;
      if ((seen && misses > 10) || (!seen && misses > 90)) {
        log('exit');
        process.exit(0);
      }
    }
    await sleep(2000);
  }
})();
