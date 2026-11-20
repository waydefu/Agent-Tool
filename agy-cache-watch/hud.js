// 注入 Antigravity 視窗的快取命中、模型額度與上下文結構面板。資料由 launch-zh-tw.js 呼叫 window.__agyCacheHud(data) 推入。
// 標籤顯示「目前開著的對話」的命中率（或最新對話），點開可切換「快取與各模型統計」與「上下文結構」，並支援切換查看任一歷史對話的上下文明細。
(() => {
  const GEN = String(Date.now()); window.__agyHudGen = GEN;
  const css = `
#agy-cache-hud{position:fixed;top:8px;right:150px;z-index:2147483000;font:12px/1.45 system-ui,"Microsoft JhengHei",sans-serif;color:#e6e6e6;-webkit-app-region:no-drag;display:flex;align-items:center;gap:8px;user-select:none}
#agy-cache-hud .quota{font-size:11px;color:#9a9aa3;white-space:nowrap;cursor:default;display:flex;align-items:center;gap:3px}
#agy-cache-hud .quota b{font-weight:600}#agy-cache-hud .quota svg{display:block}#agy-cache-hud .quota .sep{margin:0 4px;color:#55555c}
#agy-cache-hud .pill{cursor:pointer;padding:2px 9px;border-radius:11px;background:#2a2a30;border:1px solid #3a3a42;white-space:nowrap}
#agy-cache-hud .pill:hover{background:#34343c}#agy-cache-hud .pill b{font-weight:600}
#agy-cache-hud .box{display:none;position:absolute;right:0;top:26px;width:378px;max-height:80vh;overflow:auto;padding:12px 14px;background:#232328;border:1px solid #3a3a42;border-radius:10px;box-shadow:0 8px 24px #000a}
#agy-cache-hud.open .box{display:block}
#agy-cache-hud .tabs{display:flex;gap:6px;margin-bottom:10px;background:#19191d;padding:3px;border-radius:8px;border:1px solid #32323a}
#agy-cache-hud .tab{flex:1;text-align:center;padding:4px 0;border-radius:6px;cursor:pointer;color:#9a9aa3;font-size:12px;font-weight:500}
#agy-cache-hud .tab.active{background:#2e2e37;color:#fff}
#agy-cache-hud h4{margin:12px 0 4px;font-size:12px;color:#9a9aa3;font-weight:500}
#agy-cache-hud .bar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:#333;margin:6px 0 8px}
#agy-cache-hud .bar span{display:block;height:100%}
#agy-cache-hud .row{display:grid;grid-template-columns:10px 1fr auto 52px;gap:6px;align-items:center;padding:2.5px 0}
#agy-cache-hud .row i{width:9px;height:9px;border-radius:2px}#agy-cache-hud .row em{font-style:normal;text-align:right;color:#c9c9cf}
#agy-cache-hud .row span.dotted{text-decoration:underline dotted #777;text-underline-offset:3px}
#agy-cache-hud .conv{cursor:pointer;grid-template-columns:1fr auto 52px;border-radius:4px;padding:3px 4px}
#agy-cache-hud .conv:hover{background:#2c2c33}#agy-cache-hud .conv span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#agy-cache-hud .cur{background:#2a2a31;border:1px solid #34343c;border-radius:8px;padding:8px 10px}
#agy-cache-hud .spark{display:flex;align-items:flex-end;gap:1px;height:26px;background:#2b2b31;border-radius:3px;padding:2px;margin:4px 0 6px;overflow:hidden}
#agy-cache-hud .spark span{flex:1 1 0;min-width:0;border-radius:1px}
#agy-cache-hud .muted{color:#8b8b94}
#agy-cache-hud .link{color:#79b8ff;cursor:pointer;font-size:11.5px;margin:2px 0 6px;display:inline-block}
#agy-cache-hud .link:hover{text-decoration:underline}
#agy-cache-hud .picker{width:100%;margin-bottom:8px;padding:4px 6px;background:#19191d;color:#e6e6e6;border:1px solid #3a3a42;border-radius:6px;font:12px/1.4 system-ui,"Microsoft JhengHei",sans-serif}
#agy-cache-hud .ctx-head{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;font-weight:600;margin-bottom:4px}
#agy-cache-hud .ctx-head small{font-weight:400;color:#9a9aa3;font-size:12px}
#agy-cache-hud .fold{border-top:1px solid #32323a;margin-top:6px;padding-top:4px}
#agy-cache-hud .fold-hd{display:flex;justify-content:space-between;align-items:center;padding:4px 2px;cursor:pointer;color:#c9c9cf}
#agy-cache-hud .fold-hd:hover{color:#fff}
#agy-cache-hud .fold-bd{padding:3px 0 4px 14px;max-height:140px;overflow:auto;font-size:11px;color:#9a9aa3}
#agy-cache-hud .fold-bd div{padding:1.5px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;
  const LANG = window.__agentToolLang === 'en' ? 'en' : 'zh-TW';
  const t = (zh, en) => LANG === 'en' ? en : zh;
  const categories = { '訊息': 'Chat messages', '系統工具': 'Built-in tools', 'MCP 工具': 'MCP tools',
    '系統提示': 'System prompt', 'Skills': 'Skills', '外掛目錄 (Plugins)': 'Plugin catalog',
    '使用者規則 (Rules)': 'User rules', '子代理定義 (Subagents)': 'Subagent definitions' };
  const cat = (name) => LANG === 'en' ? (categories[name] || name) : name;
  const color = (h) => (h >= 70 ? '#2f81f7' : h >= 40 ? '#d29922' : '#f85149');
  const wan = (n) => LANG === 'en' ? Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n || 0)) : (n >= 10000 ? (n / 10000).toFixed(1) + '萬' : Number(n || 0).toLocaleString());
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 目前對話：對話主畫面的 data-cascade-id → 網址 /c/<id> → 側欄選取列 → 視窗標題開頭的對話名稱比對。
  const selectedId = () => {
    const id = document.querySelector('[data-testid="conversation-view"][data-cascade-id]')?.getAttribute('data-cascade-id')
      || (location.pathname.match(/\/c\/([0-9a-f-]{36})/) || [])[1]
      || document.querySelector('[data-testid="conversation-row-sidebar"][data-selected="true"]')?.getAttribute('data-cascade-id')
      || document.querySelector('main [data-cascade-id], [data-cascade-id]:not([data-testid="conversation-row-sidebar"])')?.getAttribute('data-cascade-id') || '';
    if (id) return id;
    const winTitle = (document.title || '').split(' - ')[0].trim();
    if (winTitle && data?.recent) {
      const m = data.recent.find((c) => c.title && (c.title === winTitle || winTitle.startsWith(c.title)));
      if (m) return m.id;
    }
    return '';
  };
  let root, data = null, shown = '', activeTab = 'cache', inspectId = '', expanded = new Set(), openFolds = new Set();

  function mount() {
    if (root && document.body.contains(root)) return root;
    if (!document.body || !document.head) return null;
    document.getElementById('agy-cache-hud-style')?.remove();
    const st = document.createElement('style'); st.id = 'agy-cache-hud-style';
    st.textContent = css + `#agy-cache-hud:not([data-gen="${GEN}"]){display:none!important}`; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'agy-cache-hud'; root.dataset.gen = GEN;
    root.innerHTML = `<span class="quota"></span><div class="pill">${t('快取', 'Cache')} <b>…</b></div><div class="box">${t('讀取中…', 'Loading…')}</div>`;
    root.querySelector('.pill').onclick = () => root.classList.toggle('open');
    root.querySelector('.box').onclick = (e) => {
      const ctxEl = e.target.closest('[data-ctx-id]');
      if (ctxEl) { inspectId = ctxEl.getAttribute('data-ctx-id'); activeTab = 'context'; render(); return; }
      const tabEl = e.target.closest('[data-tab]');
      if (tabEl) { activeTab = tabEl.getAttribute('data-tab'); render(); return; }
      const foldEl = e.target.closest('[data-fold]');
      if (foldEl) { const fk = foldEl.getAttribute('data-fold'); openFolds.has(fk) ? openFolds.delete(fk) : openFolds.add(fk); render(); return; }
      const el = e.target.closest('[data-conv]'); if (!el) return;
      const id = el.getAttribute('data-conv'); expanded.has(id) ? expanded.delete(id) : expanded.add(id); render();
    };
    root.querySelector('.box').onchange = (e) => {
      if (e.target.matches('[data-ctx-picker]')) { inspectId = e.target.value; render(); }
    };
    document.body.appendChild(root);
    return root;
  }

  const rate = (u, c) => (u + c ? Math.round(1000 * c / (u + c)) / 10 : 0);
  const name = (c) => esc(c.agent ? t('子代理 ', 'Subagent ') + c.agent + (c.title ? '・' + c.title : '') : c.title || c.id.slice(0, 8));
  const detail = (c, showCtxLink = false) => `<div class="muted">${t('上下文', 'Context')} ${wan(c.context)} token · ${c.calls.length} ${t('次呼叫', 'calls')} · 0% ${t('命中', 'hits')}: ${c.zero} · ${t('快取讀取', 'Cached input')} ${wan(c.cache)} · ${t('未命中', 'Uncached')} ${wan(c.uncached)}</div><div class="spark">` +
    c.calls.slice(-80).map(([hit, m, u, cr, o]) => `<span title="${esc(m)} · ${t('命中', 'Hit')} ${hit}% · ${t('快取', 'Cache')} ${wan(cr)} · ${t('未命中', 'Uncached')} ${wan(u)} · ${t('輸出', 'Output')} ${wan(o)}" style="height:${Math.max(hit, 4)}%;background:${hit === 0 ? '#f85149' : color(hit)}"></span>`).join('') + '</div>' +
    (showCtxLink && c.breakdown ? `<div class="link" data-ctx-id="${esc(c.id)}">▸ ${t('查看此對話的上下文結構明細', 'View context breakdown')} (${c.breakdown.used_pct}% · ${wan(c.breakdown.used)} / ${wan(c.breakdown.limit)})</div>` : '');

  function renderContextBreakdown(c) {
    const b = c?.breakdown;
    if (!b) return `<div class="cur muted">${t('此對話尚無上下文結構紀錄。', 'No context breakdown is available for this conversation.')}</div>`;
    const lim = b.limit || 512000;
    const pct = (v) => ((100 * (v || 0)) / lim).toFixed(1) + '%';
    const barSegs = b.cats.map((x) => `<span style="width:${((100 * x.tokens) / lim).toFixed(2)}%;background:${x.color}" title="${esc(cat(x.name))} ${wan(x.tokens)}"></span>`).join('');

    let h = `<div class="ctx-head"><span>${t('已使用', 'Used')} ${b.used_pct}%</span><small>${wan(b.used)} / ${wan(lim)}</small></div>`;
    h += `<div class="bar" style="height:7px">${barSegs}</div>`;
    h += `<div class="muted" style="margin-bottom:8px;font-size:11.5px">${t('資料解碼自 Antigravity 本機 gen_metadata (Field 1.9.10)，內部格式未公開，更新後可能變更。', 'Decoded from Antigravity local gen_metadata (Field 1.9.10); internal format is undocumented and may change.')}</div>`;

    h += b.cats.map((x) => {
      const hasList = b.lists && b.lists[x.name];
      const cls = hasList ? ' class="dotted"' : '';
      return `<div class="row"><i style="background:${x.color}"></i><span${cls}>${esc(cat(x.name))}</span><span>${wan(x.tokens)}</span><em>${pct(x.tokens)}</em></div>`;
    }).join('');

    h += `<div class="row" style="margin-top:4px"><i style="background:#7a7a85"></i><span>${t('自上次更新以來', 'Since last update')}</span><span>${wan(b.since_last)}</span><em>${pct(b.since_last)}</em></div>`;
    h += `<div class="row"><i style="background:#2b2b33"></i><span>${t('可用空間', 'Available')}</span><span>${wan(b.available)}</span><em>${pct(b.available)}</em></div>`;

    const folds = Object.entries(b.lists || {});
    if (folds.length) {
      h += `<div class="fold">` + folds.map(([k, arr]) => {
        const isOpen = openFolds.has(k);
        return `<div class="fold-hd" data-fold="${esc(k)}"><span>${isOpen ? '▾' : '▸'} ${esc(cat(k))}</span><span class="muted">${arr.length}</span></div>` +
          (isOpen ? `<div class="fold-bd">${arr.map((item) => `<div>・${esc(item)}</div>`).join('')}</div>` : '');
      }).join('') + `</div>`;
    }
    return h;
  }

  function render() {
    const r = mount(); if (!r) return; const d = data, pill = r.querySelector('.pill b'), box = r.querySelector('.box');
    if (!d || !d.models || !d.models.length) { pill.textContent = t('無資料', 'No data'); box.innerHTML = `<span class="muted">${t('最近 7 天沒有用量紀錄。', 'No usage records for the last 7 days.')}</span>`; return; }
    const sel = selectedId();
    if (sel !== shown) { shown = sel; inspectId = sel; }
    const detected = d.recent.find((c) => c.id === sel);
    const cur = detected || d.recent[0];
    const targetCtx = d.recent.find((c) => c.id === inspectId) || cur;
    const kids = (id) => d.recent.filter((c) => c.parent === id);
    const ks = cur ? kids(cur.id) : [];
    const all = cur ? [cur, ...ks] : [];
    const sum = (k) => all.reduce((n, c) => n + c[k], 0);
    const pillHit = cur ? rate(sum('uncached'), sum('cache')) : d.hit;
    pill.textContent = pillHit + '%'; pill.style.color = color(pillHit);
    r.querySelector('.pill').title = cur
      ? `${detected ? t('目前對話', 'Current conversation') : t('最新對話', 'Latest conversation')}${ks.length ? ` + ${ks.length} ${t('個子代理', 'subagents')}` : ''} ${t('快取命中率', 'cache hit rate')} ${pillHit}% · ${t('上下文已用', 'context used')} ${cur.breakdown?.used_pct ?? 0}%`
      : t('最近 7 天全部對話的快取命中率', 'Cache hit rate for all conversations in the last 7 days');

    const order = d.recent.filter((c) => !c.parent || !d.recent.some((p) => p.id === c.parent)).flatMap((c) => [c, ...kids(c.id)]);

    let h = `<div class="tabs">` +
      `<div class="tab ${activeTab === 'cache' ? 'active' : ''}" data-tab="cache">${t('快取與各模型統計', 'Cache & models')}</div>` +
      `<div class="tab ${activeTab === 'context' ? 'active' : ''}" data-tab="context">${t('上下文結構', 'Context breakdown')} (${targetCtx?.breakdown?.used_pct ?? 0}%)</div>` +
      `</div>`;

    if (activeTab === 'context') {
      h += `<select class="picker" data-ctx-picker>` + order.map((c) => {
        const prefix = c.parent ? '　└ ' : (c.id === cur?.id ? '▶ ' : '');
        const pctStr = c.breakdown ? ` (${c.breakdown.used_pct}%・${wan(c.breakdown.used)})` : '';
        return `<option value="${esc(c.id)}"${c.id === targetCtx?.id ? ' selected' : ''}>${prefix}${name(c)}${pctStr}</option>`;
      }).join('') + `</select>`;
      h += renderContextBreakdown(targetCtx);
      h += `<div class="muted" style="margin-top:8px">${t('更新', 'Updated')} ${esc(d.updated)} · ${t('每 30 秒自動更新', 'refreshes every 30 seconds')}</div>`;
      box.innerHTML = h;
      return;
    }

    h += `<h4 style="margin-top:0">${detected ? t('目前對話', 'Current conversation') : t('最新對話（自動跟隨最後活躍對話）', 'Latest conversation (auto-follow)')}</h4>`;
    const head = (c) => `<div class="row" style="grid-template-columns:1fr 52px"><b>${name(c)}</b><em style="color:${color(c.hit)}">${c.hit}%</em></div>${detail(c, true)}`;
    h += cur ? `<div class="cur">` + (ks.length ? `<div class="row" style="grid-template-columns:1fr 52px"><span>${t('合計（主對話＋', 'Total (main + ')}${ks.length} ${t('個子代理）', 'subagents)')}</span><em style="color:${color(pillHit)}"><b>${pillHit}%</b></em></div>` : '') +
      head(cur) + ks.map(head).join('') +
      (cur.parent ? `<div class="muted">${t('這是子代理，上層對話：', 'Subagent · parent conversation: ')}${name(d.recent.find((c) => c.id === cur.parent) || { id: cur.parent, title: '' })}</div>` : '') +
      '</div>'
      : `<div class="cur muted">${t('沒有偵測到對話紀錄。', 'No conversation records detected.')}</div>`;

    const tot = d.cache + d.uncached + d.output || 1;
    const segs = [[t('快取讀取', 'Cached input'), d.cache, '#2f81f7'], [t('未命中輸入', 'Uncached input'), d.uncached, '#f0883e'], [t('輸出', 'Output'), d.output, '#2ea39b']];
    h += `<h4>${t('最近 7 天全部：命中', 'Last 7 days · cache hit')} ${d.hit}% (${wan(tot)} token)</h4>`;
    h += '<div class="bar">' + segs.map(([, v, c]) => `<span style="width:${(100 * v / tot).toFixed(2)}%;background:${c}"></span>`).join('') + '</div>';
    h += segs.map(([k, v, c]) => `<div class="row"><i style="background:${c}"></i><span>${k}</span><span>${wan(v)}</span><em>${(100 * v / tot).toFixed(1)}%</em></div>`).join('');
    h += `<h4>${t('各模型', 'By model')}</h4>` + d.models.map((m) => `<div class="row"><i style="background:${color(m.hit)}"></i><span>${esc(m.name)}</span><span class="muted">${m.calls} ${t('次', 'calls')} · 0% ${m.zero}</span><em>${m.hit}%</em></div>` +
      (m.subs || []).map((x) => `<div class="row" style="padding-left:16px"><i style="background:${color(x.hit)};border-radius:50%"></i><span class="muted">${t('其中子代理', 'Subagent')} ${esc(x.agent)}</span><span class="muted">${x.calls} ${t('次', 'calls')} · 0% ${x.zero}</span><em>${x.hit}%</em></div>`).join('')).join('');
    h += `<h4>${t('各對話（點一下展開，縮排＝子代理）', 'Conversations (select to expand; indented = subagents)')}</h4>` + order.map((c) => `<div class="row conv" data-conv="${esc(c.id)}"${c.parent ? ' style="padding-left:18px"' : ''}><span>${c.id === cur?.id ? '▶ ' : ''}${name(c)}</span><span class="muted">${esc(c.time)}</span><em style="color:${color(c.hit)}">${c.hit}%</em></div>` +
      (expanded.has(c.id) ? detail(c, true) : '')).join('');
    h += `<div class="muted" style="margin-top:8px">${t('更新', 'Updated')} ${esc(d.updated)} · ${t('每 30 秒自動更新', 'refreshes every 30 seconds')}</div>`;
    box.innerHTML = h;
  }

  // 模型額度：呼叫 App 自己的本機 RPC（設定 → 模型與用量 用的同一個），CSRF token 取自 App 自己存的 __APP_CONFIG__，只在記憶體使用。
  const GROUP = { 'Gemini Models': 'Gemini', 'Claude and GPT models': 'Claude/GPT' };
  const qcolor = (p) => (p >= 50 ? '#5a9a4a' : p >= 20 ? '#d29922' : '#f85149');
  const ring = (p, tip) => { const c = 2 * Math.PI * 8; return `<svg width="21" height="21" viewBox="0 0 21 21"><title>${esc(tip)}</title>` +
    `<circle cx="10.5" cy="10.5" r="8" fill="none" stroke="#3a3a42" stroke-width="2"/>` +
    `<circle cx="10.5" cy="10.5" r="8" fill="none" stroke="${qcolor(p)}" stroke-width="2" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 10.5 10.5)"/>` +
    `<text x="10.5" y="13.2" text-anchor="middle" font-size="${p >= 100 ? 6.5 : 8}" fill="#e6e6e6">${p}</text></svg>`; };
  const when = (timestamp) => { const d = new Date(timestamp); return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} ${t('重置', 'reset')}`; };
  async function quota() {
    const r = mount(); if (!r) return; const q = r.querySelector('.quota');
    try {
      const res = await fetch('/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary', { method: 'POST', body: '{}',
        headers: { 'content-type': 'application/json', 'connect-protocol-version': '1', 'x-codeium-csrf-token': window.__APP_CONFIG__?.csrfToken || '' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const groups = (await res.json()).response?.groups || [];
      q.innerHTML = groups.map((g) => {
        const displayName = String(g.displayName || 'Models');
        const name = GROUP[displayName] || displayName.replace(/^Gemini 4 /, '');
        return `<span>${esc(name)}</span>` + (g.buckets || []).filter((b) => b.remainingFraction != null && Number.isFinite(Number(b.remainingFraction))).map((b) => {
          const p = Math.max(0, Math.min(100, Math.round(Number(b.remainingFraction) * 100)));
          return ring(p, `${name} ${b.window === '5h' ? t('五小時', '5-hour') : t('每週', 'weekly')} ${t('限額剩餘', 'quota remaining')} ${p}% · ${when(b.resetTime)}`);
        }).join('');
      }).join('<span class="sep">｜</span>');
      q.title = '';
    } catch (e) {
      q.textContent = t('額度讀取中…', 'Loading quota…'); q.title = String(e && e.message || e);
      if (window.__agyHudGen === GEN) setTimeout(quota, 3000);
    }
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', quota, { once: true }); else quota();
  const qtimer = setInterval(() => { if (window.__agyHudGen !== GEN) return clearInterval(qtimer); if (!document.hidden) quota(); }, 20000);

  window.__agyCacheHud = (d) => { data = d; render(); quota(); };
  const timer = setInterval(() => { if (window.__agyHudGen !== GEN) return clearInterval(timer); if (data && selectedId() !== shown) render(); }, 1000);
})();
