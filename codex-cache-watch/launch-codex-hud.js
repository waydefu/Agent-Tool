// 以本機除錯埠（只綁 127.0.0.1:9340）啟動 ChatGPT / Codex 桌面版，並注入快取命中、模型額度與上下文結構面板（hud.js）。
// 不修改 App 本身的檔案。App 關閉後本程式自動結束。
// 用法：node launch-codex-hud.js
const { spawn, execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const PORT = 9340;
const LANG = process.argv.includes('--lang=en') || process.env.AGENT_TOOL_LANG === 'en' ? 'en' : 'zh-TW';
const ALIAS = path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'chatgpt-desktop.exe');
const LOG = path.join(__dirname, 'launch-codex-hud.log');
const log = (m) => { try { fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${m}\n`); } catch {} };

const HUD = path.join(__dirname, 'hud.js');
const PY = path.join(__dirname, 'codex_cache.py');
const hud = `window.__agentToolLang = ${JSON.stringify(LANG)};\n` + (fs.existsSync(HUD) ? fs.readFileSync(HUD, 'utf8') : '');

function resolveExe() {
  // Windows Store AppExecutionAlias (chatgpt-desktop.exe) 是特殊的 reparse point：
  // fs.existsSync 會回傳 false，必須用 fs.lstatSync 檢查，且不能直接 spawn WindowsApps 內的 ChatGPT.exe（會被 Windows 拒絕存取 EACCES）。
  try { fs.lstatSync(ALIAS); return ALIAS; } catch {}
  try {
    const base = 'C:\\Program Files\\WindowsApps';
    const dirs = fs.readdirSync(base).filter((d) => d.startsWith('OpenAI.Codex_') && d.includes('_x64__')).sort().reverse();
    if (dirs.length) return path.join(base, dirs[0], 'app', 'ChatGPT.exe');
  } catch {}
  return ALIAS;
}

function isChatGptRunning() {
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq ChatGPT.exe', '/NH'], { encoding: 'utf8', windowsHide: true });
    return /ChatGPT\.exe/i.test(out);
  } catch {
    return false;
  }
}

function bringExistingToFrontAndWarn() {
  // 若舊的 ChatGPT 已經在沒有除錯埠（9340）的狀態下執行，先把視窗喚醒到最前面，並彈出提示詢問是否自動安全重啟以掛載面板。
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
$ans = [System.Windows.Forms.MessageBox]::Show(
  "偵測到 ChatGPT / Codex 已經在背景執行（舊視窗未開啟除錯埠 9340，無法直接掛載右上角快取與額度面板）。" + [Environment]::NewLine + [Environment]::NewLine +
  "・按「是 (Yes)」：自動執行安全檢查並重啟 ChatGPT（掛載額度圓環與快取面板）" + [Environment]::NewLine +
  "・按「否 (No)」：只喚醒目前已經開著的 ChatGPT 視窗",
  "ChatGPT / Codex 快取與額度面板啟動器",
  [System.Windows.Forms.MessageBoxButtons]::YesNo,
  [System.Windows.Forms.MessageBoxIcon]::Information
)
if ($ans -eq [System.Windows.Forms.DialogResult]::Yes) {
  Write-Output "RESTART"
} else {
  Start-Process explorer.exe "shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App"
  Write-Output "ACTIVATE"
}
`;
  try {
    const res = execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', windowsHide: true }).trim();
    return res === 'RESTART';
  } catch {
    return false;
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
  try {
    const ws = new URL(t.webSocketDebuggerUrl);
    if (ws.protocol !== 'ws:' || !['127.0.0.1', 'localhost'].includes(ws.hostname) || ws.port !== String(PORT)) return false;
    const u = new URL(t.url || '');
    if (u.pathname.includes('avatar-overlay')) return false;
    if (['app:', 'file:', 'vscode-file:', 'vscode-webview:'].includes(u.protocol)) return true;
    if (u.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(u.hostname)) return true;
    return u.protocol === 'https:' && (u.hostname === 'chatgpt.com' || u.hostname.endsWith('.chatgpt.com'));
  } catch { return false; }
}

(async () => {
  let up = false;
  try { await targets(); up = true; } catch {}
  if (!up) {
    if (isChatGptRunning()) {
      log('ChatGPT is already running without debug port 9340');
      const shouldRestart = bringExistingToFrontAndWarn();
      if (!shouldRestart) {
        log('user chose to activate existing window');
        process.exit(0);
      }
      const safeClose = path.join(__dirname, 'SafeClose-Codex.ps1');
      if (fs.existsSync(safeClose)) {
        try {
          execFileSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', safeClose], { windowsHide: false });
        } catch (e) {
          log('SafeClose failed: ' + e.message);
        }
      }
      if (isChatGptRunning()) {
        log('ChatGPT still running (busy), aborting restart');
        process.exit(0);
      }
    }
    const exe = resolveExe();
    log(`starting ChatGPT/Codex with debug port ${PORT}: ${exe}`);
    try {
      const child = spawn(exe, [`--remote-debugging-port=${PORT}`, '--remote-debugging-address=127.0.0.1'], { detached: true, stdio: 'ignore', windowsHide: false });
      child.on('error', (err) => log(`spawn error: ${err.message}`));
      child.unref();
    } catch (err) {
      log(`spawn throw: ${err.message}`);
      process.exit(1);
    }
  } else {
    // 已經以 9340 除錯埠在執行：使用者再點桌面捷徑時，把現有視窗喚醒到最前面
    try {
      spawn('explorer.exe', ['shell:AppsFolder\\OpenAI.Codex_2p2nqsd0c76g0!App'], { detached: true, stdio: 'ignore' }).unref();
    } catch {}
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
          log('injected approved app target');
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
