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
    getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  };
  const window = { __agentToolLang: lang, __APP_CONFIG__: { csrfToken: '' } };
  const context = {
    document, window, URL, Date, Intl, Set, String, Number, Math,
    location: { href: 'app://main/', pathname: '/', search: '' },
    setInterval: () => 0, clearInterval: () => {},
    setTimeout: () => 0, addEventListener: () => {},
    fetch: async () => ({ ok: true, json: async () => ({ response: { groups: [{
      displayName: 'Gemini Models',
      buckets: [
        { window: '5h', remainingFraction: 0.75, resetTime: '2026-11-21T08:00:00+08:00' },
        { window: 'week', remainingFraction: null, resetTime: '2026-11-22T08:00:00+08:00' },
      ],
    }] } }) }),
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file, timeout: 1000 });
  const data = {
    hit: 40, cache: 40, uncached: 60, output: 10, updated: '12:00:00', quota: [{
      name: '週額度 / 五小額度', plan: 'plus', buckets: [{ label: '五小時', window: '5h', remaining: 80, used: 20, reset: 'tomorrow' }],
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
    if (product === 'Codex') {
      assert.match(hud.quota.innerHTML, /<span>Weekly \/ 5h<\/span>/);
    }
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

test('Antigravity English quota tooltip renders a valid reset and ignores missing values', async () => {
  const hud = runHud('agy-cache-watch/hud.js', 'en');
  await new Promise((resolve) => setImmediate(resolve));
  assert.match(hud.quota.innerHTML, /quota remaining 75%/);
  assert.match(hud.quota.innerHTML, /reset/);
  assert.equal((hud.quota.innerHTML.match(/<svg/g) || []).length, 1,
    'an absent remainingFraction must not appear as exhausted quota');
});

test('Codex HUD reads live in-app React Fiber quota when available', () => {
  const file = 'codex-cache-watch/hud.js';
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
  const future5h = Math.floor(Date.now() / 1000) + 3600;
  const futureWk = Math.floor(Date.now() / 1000) + 500000;
  const liveBtn = {
    getAttribute: (k) => k === 'aria-description' ? '5 小時用量：剩餘 9%。每週用量：剩餘 86%' : null,
    __reactFiber$mock: {
      return: {
        memoizedState: {
          memoizedState: {
            usage: {
              plan_type: 'plus',
              rate_limit: {
                primary_window: { used_percent: 91, limit_window_seconds: 18000, reset_at: future5h },
                secondary_window: { used_percent: 14, limit_window_seconds: 604800, reset_at: futureWk },
              },
            },
            data: {
              menu: {
                rows: [
                  { hover: { text: '1 小時 7 分鐘後重設' } },
                  { hover: { text: '6 天 20 小時後重設' } },
                ],
              },
            },
          },
          next: null,
        },
      },
    },
  };
  const document = {
    readyState: 'loading', title: '', body: { contains: () => true, appendChild() {} },
    head: { appendChild() {} },
    createElement: (tag) => tag === 'div' ? root : { textContent: '', id: '' },
    getElementById: () => null,
    querySelectorAll: () => [],
    querySelector: (sel) => sel.includes('aria-description') ? liveBtn : null,
  };
  const window = { __agentToolLang: 'zh-TW' };
  const context = {
    document, window, URL, Date, Intl, Set, String, Number, Math, Object, Array,
    location: { href: 'app://-/index.html', pathname: '/index.html', search: '' },
    setInterval: () => 0, clearInterval: () => {},
    setTimeout: () => 0, addEventListener: () => {},
  };
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), context, { filename: file, timeout: 1000 });
  window.__codexCacheHud({
    hit: 50, cache: 50, uncached: 50, output: 10, updated: '12:00:00',
    quota: [{ name: 'Codex', plan: 'plus', buckets: [{ label: '五小時', window: '5h', remaining: 84, used: 16, reset: 'stale' }] }],
    models: [], recent: [],
  });
  assert.match(quota.innerHTML, /<span>週額度 \/ 五小額度<\/span>/);
  assert.match(quota.innerHTML, /週額度（每週） 限額剩餘 86% \(已用 14%\).*五小額度（5 小時） 限額剩餘 9% \(已用 91%\)/);
});
