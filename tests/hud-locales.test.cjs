'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function runHud(file, lang) {
  const box = { innerHTML: '', onclick: null, onchange: null };
  const pill = { textContent: '', style: {}, title: '', onclick: null };
  const pillCount = { textContent: '', style: {} };
  const quota = { innerHTML: '', textContent: '', title: '' };
  const root = {
    dataset: {}, id: '', innerHTML: '',
    classList: { toggle() {} },
    querySelector(selector) {
      if (selector === '.box') return box;
      if (selector === '.pill') return pill;
      if (selector === '.pill b') return pillCount;
      if (selector === '.quota') return quota;
      throw new Error('unexpected selector: ' + selector);
    },
  };
  const document = {
    readyState: 'loading', title: '', body: { contains: () => true, appendChild() {} },
    head: { appendChild() {} },
    createElement: (tag) => tag === 'div' ? root : { textContent: '', id: '' },
    getElementById: () => null, querySelector: () => null,
  };
  const window = { __agentToolLang: lang, __APP_CONFIG__: { csrfToken: '' } };
  const context = {
    document, window, URL, Date, Intl, Set, String, Number, Math,
    location: { href: 'app://main/', pathname: '/', search: '' },
    setInterval: () => 0, clearInterval: () => {},
    setTimeout: () => 0, addEventListener: () => {},
    fetch: async () => ({ ok: true, json: async () => ({ response: { groups: [] } }) }),
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file, timeout: 1000 });
  const data = {
    hit: 40, cache: 40, uncached: 60, output: 10, updated: '12:00:00', quota: [{
      name: 'Codex', plan: 'plus', buckets: [{ label: '五小時', window: '5h', remaining: 80, used: 20, reset: 'tomorrow' }],
    }],
    models: [{ name: 'model-a', calls: 1, hit: 40, zero: 0, subs: [] }],
    recent: [{
      id: 'thread-a', title: 'User 系統工具 title', parent: '', agent: '', time: '11-20',
      context: 100, hit: 40, uncached: 60, cache: 40, zero: 0,
      calls: [[40, 'model-a', 60, 40, 10]], estimated: false,
      breakdown: {
        used: 100, limit: 200, used_pct: 50, threshold: 200, since_last: 20, available: 80,
        buffer: 20, deferred_mcp: 4, deferred_sys: 2, source: 'rollout', exact: false,
        cats: [{ name: '系統工具', tokens: 40, color: '#eeeeee' },
               { name: '訊息', tokens: 60, color: '#cccccc' }],
        lists: { '系統工具': ['run_command (40 tok)'], 'MCP 工具': [], Skills: [],
                 '記憶檔案': [], '自訂代理': [] },
      },
    }],
  };
  if (file.includes('codex')) window.__codexCacheHud(data);
  else window.__agyCacheHud(data);
  return {
    box, pill, quota, root,
    openContext() {
      box.onclick({
        target: { closest: (selector) => selector === '[data-tab]'
          ? { getAttribute: () => 'context' } : null },
      });
    },
  };
}

for (const [file, product] of [
  ['agy-cache-watch/hud.js', 'Antigravity'],
  ['codex-cache-watch/hud.js', 'Codex'],
]) {
  test(product + ' HUD English interface', () => {
    const hud = runHud(file, 'en');
    assert.match(hud.box.innerHTML, /Cache &amp; models|Cache & models/);
    assert.match(hud.box.innerHTML, /By model/);
    assert.match(hud.box.innerHTML, /Cached input/);
    assert.match(hud.box.innerHTML, /User 系統工具 title/, 'conversation titles must not be translated');
    hud.openContext();
    assert.match(hud.box.innerHTML, /Context breakdown|Used/);
    assert.match(hud.box.innerHTML, /Built-in tools/);
    assert.match(hud.box.innerHTML, /Since last update/);
    assert.doesNotMatch(hud.box.innerHTML, />系統工具</);
  });

  test(product + ' HUD Traditional Chinese remains the default', () => {
    const hud = runHud(file, 'zh-TW');
    assert.match(hud.box.innerHTML, /快取與各模型統計/);
    hud.openContext();
    assert.match(hud.box.innerHTML, /系統工具/);
  });
}

test('English VBS launchers select the explicit language flag', () => {
  const ag = fs.readFileSync('antigravity-zh-tw/launch-en.vbs', 'utf8');
  const cd = fs.readFileSync('codex-cache-watch/launch-codex-hud-en.vbs', 'utf8');
  assert.match(ag, /--lang=en/);
  assert.match(cd, /--lang=en/);
});
