// 注入 ChatGPT / Codex Desktop 視窗的快取命中、模型額度與上下文結構面板。
// 資料由 launch-codex-hud.js 呼叫 window.__codexCacheHud(data) 推入。
(() => {
  if (window.__codexCacheHud) return;
  const GEN = String(Date.now());
  window.__codexHudGen = GEN;

  const css = `
#codex-cache-hud{position:fixed;top:8px;right:148px;z-index:2147483000;font:12px/1.45 system-ui,"Microsoft JhengHei",sans-serif;color:#e6e6e6;-webkit-app-region:no-drag;display:flex;align-items:center;gap:8px;user-select:none}
#codex-cache-hud .quota{font-size:11px;color:#9a9aa3;white-space:nowrap;cursor:default;display:flex;align-items:center;gap:4px}
#codex-cache-hud .quota b{font-weight:600}
#codex-cache-hud .quota svg{display:block}
#codex-cache-hud .quota .sep{margin:0 4px;color:#55555c}
#codex-cache-hud .pill{cursor:pointer;padding:2px 9px;border-radius:11px;background:#2a2a30;border:1px solid #3a3a42;white-space:nowrap;transition:background .15s}
#codex-cache-hud .pill:hover{background:#34343c}
#codex-cache-hud .pill b{font-weight:600}
#codex-cache-hud .box{display:none;position:absolute;right:0;top:28px;width:380px;max-height:80vh;overflow:auto;padding:13px 15px;background:#1e1e24;border:1px solid #3a3a42;border-radius:11px;box-shadow:0 10px 28px #000a}
#codex-cache-hud.open .box{display:block}
#codex-cache-hud .tabs{display:flex;gap:6px;margin-bottom:10px;background:#16161b;padding:3px;border-radius:8px;border:1px solid #2d2d35}
#codex-cache-hud .tab{flex:1;text-align:center;padding:4px 0;border-radius:6px;cursor:pointer;color:#9a9aa3;font-size:12px;font-weight:500}
#codex-cache-hud .tab.active{background:#2c2c35;color:#fff}
#codex-cache-hud h4{margin:12px 0 4px;font-size:12px;color:#9a9aa3;font-weight:500}
#codex-cache-hud .bar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:#2f2f37;margin:6px 0 8px}
#codex-cache-hud .bar span{display:block;height:100%}
#codex-cache-hud .row{display:grid;grid-template-columns:10px 1fr auto 54px;gap:7px;align-items:center;padding:2.5px 0}
#codex-cache-hud .row i{width:9px;height:9px;border-radius:2px;display:inline-block}
#codex-cache-hud .row span.dotted{text-decoration:underline dotted #777;text-underline-offset:3px}
#codex-cache-hud .row em{font-style:normal;text-align:right;color:#c9c9cf}
#codex-cache-hud .conv{cursor:pointer;grid-template-columns:1fr auto 52px;border-radius:4px;padding:3px 5px}
#codex-cache-hud .conv:hover{background:#2c2c33}
#codex-cache-hud .conv span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#codex-cache-hud .cur{background:#26262e;border:1px solid #34343e;border-radius:8px;padding:8px 10px}
#codex-cache-hud .spark{display:flex;align-items:flex-end;gap:1px;height:26px;background:#1b1b21;border-radius:3px;padding:2px;margin:4px 0 6px}
#codex-cache-hud .spark span{flex:1;min-width:2px;border-radius:1px}
#codex-cache-hud .muted{color:#8b8b94}
#codex-cache-hud .ctx-head{display:flex;justify-content:space-between;align-items:baseline;font-size:13px;font-weight:600;margin-bottom:4px}
#codex-cache-hud .ctx-head small{font-weight:400;color:#9a9aa3;font-size:12px}
#codex-cache-hud .thresh{display:flex;justify-content:space-between;align-items:center;margin:8px 0 4px;font-size:12px}
#codex-cache-hud .fold{border-top:1px solid #2d2d35;margin-top:6px;padding-top:4px}
#codex-cache-hud .fold-hd{display:flex;justify-content:space-between;align-items:center;padding:4px 2px;cursor:pointer;color:#c9c9cf}
#codex-cache-hud .fold-hd:hover{color:#fff}
#codex-cache-hud .fold-bd{padding:3px 0 4px 14px;max-height:140px;overflow:auto;font-size:11px;color:#9a9aa3}
#codex-cache-hud .fold-bd div{padding:1.5px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
`;

  const color = (h) => (h >= 70 ? '#2f81f7' : h >= 40 ? '#d29922' : '#f85149');
  const qcolor = (p) => (p >= 50 ? '#5a9a4a' : p >= 20 ? '#d29922' : '#f85149');
  const wan = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + '萬' : Number(n || 0).toLocaleString());
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // 自動偵測目前開著的對話 ID（支援網址 /threads/<id>、/c/<id>、側欄選取列、或依標題比對）
  function selectedId() {
    const href = location.href + ' ' + location.pathname + ' ' + location.search;
    const m = href.match(/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (m) return m[1].toLowerCase();
    const el = document.querySelector('[data-thread-id][data-selected="true"], [data-thread-id][aria-current="page"], [aria-selected="true"][data-thread-id], a[aria-current="page"][href*="-"]');
    if (el) {
      const tid = el.getAttribute('data-thread-id') || (el.getAttribute('href') || '').match(/([0-9a-f-]{36})/i)?.[1];
      if (tid) return tid.toLowerCase();
    }
    return '';
  }

  let root, data = null, shown = '', activeTab = 'cache', expanded = new Set(), openFolds = new Set();

  function mount() {
    if (root && document.body && document.body.contains(root)) return root;
    if (!document.body || !document.head) return null;
    document.getElementById('codex-cache-hud-style')?.remove();
    const st = document.createElement('style');
    st.id = 'codex-cache-hud-style';
    st.textContent = css + `#codex-cache-hud:not([data-gen="${GEN}"]){display:none!important}`;
    document.head.appendChild(st);

    root = document.createElement('div');
    root.id = 'codex-cache-hud';
    root.dataset.gen = GEN;
    root.innerHTML = '<span class="quota"></span><div class="pill">快取 <b>…</b></div><div class="box">讀取中…</div>';
    root.querySelector('.pill').onclick = () => root.classList.toggle('open');
    root.querySelector('.box').onclick = (e) => {
      const tabEl = e.target.closest('[data-tab]');
      if (tabEl) {
        activeTab = tabEl.getAttribute('data-tab');
        render();
        return;
      }
      const foldEl = e.target.closest('[data-fold]');
      if (foldEl) {
        const fk = foldEl.getAttribute('data-fold');
        openFolds.has(fk) ? openFolds.delete(fk) : openFolds.add(fk);
        render();
        return;
      }
      const convEl = e.target.closest('[data-conv]');
      if (convEl) {
        const cid = convEl.getAttribute('data-conv');
        expanded.has(cid) ? expanded.delete(cid) : expanded.add(cid);
        render();
      }
    };
    document.body.appendChild(root);
    return root;
  }

  const ring = (p, tip) => {
    const c = 2 * Math.PI * 8;
    return `<svg width="21" height="21" viewBox="0 0 21 21"><title>${esc(tip)}</title>` +
      `<circle cx="10.5" cy="10.5" r="8" fill="none" stroke="#3a3a42" stroke-width="2"/>` +
      `<circle cx="10.5" cy="10.5" r="8" fill="none" stroke="${qcolor(p)}" stroke-width="2" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 10.5 10.5)"/>` +
      `<text x="10.5" y="13.2" text-anchor="middle" font-size="${p >= 100 ? 6.5 : 8}" fill="#e6e6e6">${p}</text></svg>`;
  };

  function renderQuota() {
    const r = mount();
    if (!r) return;
    const q = r.querySelector('.quota');
    const groups = data?.quota || [];
    if (!groups.length) {
      q.textContent = 'Codex';
      return;
    }
    q.innerHTML = groups.map((g) => {
      return `<span>${esc(g.name)}</span>` + (g.buckets || []).map((b) => {
        const p = b.remaining ?? 0;
        return ring(p, `${g.name} ${b.label}限額剩餘 ${p}%（已用 ${b.used}%），${b.reset}`);
      }).join('');
    }).join('<span class="sep">｜</span>');
  }

  const rate = (u, c) => (u + c ? Math.round(1000 * c / (u + c)) / 10 : 0);
  const name = (c) => esc(c.agent ? '子代理 ' + c.agent + (c.title ? '・' + c.title : '') : c.title || c.id.slice(0, 8));
  const detail = (c) => `<div class="muted">上下文 ${wan(c.context)} token・${c.calls.length} 次呼叫・命中 0% 有 ${c.zero} 次・快取讀取 ${wan(c.cache)}・未命中 ${wan(c.uncached)}</div><div class="spark">` +
    c.calls.map(([hit, m, u, cr, o]) => `<span title="${esc(m)}｜命中 ${hit}%｜快取 ${wan(cr)}・未命中 ${wan(u)}・輸出 ${wan(o)}" style="height:${Math.max(hit, 4)}%;background:${hit === 0 ? '#f85149' : color(hit)}"></span>`).join('') + '</div>';

  function renderContextBreakdown(c) {
    const b = c?.breakdown;
    if (!b) return `<div class="cur muted">尚無此對話的上下文結構紀錄。</div>`;
    const lim = b.limit || 475000;
    const pct = (v) => ((100 * (v || 0)) / lim).toFixed(1) + '%';
    const dottedSet = new Set(['MCP 工具', 'Skills', 'MCP 伺服器指示', '記憶檔案', '自訂代理']);
    const barSegs = b.cats.map((x) => `<span style="width:${((100 * x.tokens) / lim).toFixed(2)}%;background:${x.color}" title="${esc(x.name)} ${wan(x.tokens)}"></span>`).join('') +
      `<span style="width:${((100 * b.buffer) / lim).toFixed(2)}%;background:#4a4a55" title="自動壓縮緩衝區 ${wan(b.buffer)}"></span>`;

    let h = `<div class="ctx-head"><span>已使用 ${b.used_pct}%</span><small>${wan(b.used)} / ${wan(lim)}</small></div>`;
    h += `<div class="bar" style="height:7px">${barSegs}</div>`;
    h += `<div class="thresh"><span>自動壓縮門檻</span><span>${wan(b.threshold || lim)} ▾</span></div>`;
    h += `<div class="muted" style="margin-bottom:8px;font-size:11.5px">數值越低，耗用的使用量限制越少。Codex 會更早摘要較舊的訊息。${b.exact ? '' : '（依本機資料庫推算）'}</div>`;

    h += b.cats.map((x) => {
      const cls = dottedSet.has(x.name) ? ' class="dotted"' : '';
      return `<div class="row"><i style="background:${x.color}"></i><span${cls}>${esc(x.name)}</span><span>${wan(x.tokens)}</span><em>${pct(x.tokens)}</em></div>`;
    }).join('');

    h += `<div class="row" style="margin-top:4px"><i style="background:#7a7a85"></i><span>自上次更新以來</span><span>${wan(b.since_last)}</span><em>${pct(b.since_last)}</em></div>`;
    h += `<div class="row"><i style="background:#55555f"></i><span>自動壓縮緩衝區</span><span>${wan(b.buffer)}</span><em>${pct(b.buffer)}</em></div>`;
    h += `<div class="row"><i style="background:#2b2b33"></i><span>可用空間</span><span>${wan(b.available)}</span><em>${pct(b.available)}</em></div>`;

    h += `<div class="row" style="margin-top:8px"><i style="background:#55555f"></i><span>MCP 工具（延遲載入）</span><span>${wan(b.deferred_mcp)}</span><em>—</em></div>`;
    h += `<div class="row"><i style="background:#55555f"></i><span>系統工具（延遲載入）</span><span>${wan(b.deferred_sys)}</span><em>—</em></div>`;

    const folds = [
      ['MCP 工具', b.lists?.['MCP 工具'] || []],
      ['Skills', b.lists?.['Skills'] || []],
      ['記憶檔案', b.lists?.['記憶檔案'] || []],
      ['自訂代理', b.lists?.['自訂代理'] || []],
    ];
    h += `<div class="fold">` + folds.map(([k, arr]) => {
      const isOpen = openFolds.has(k);
      return `<div class="fold-hd" data-fold="${esc(k)}"><span>${isOpen ? '▾' : '▸'} ${esc(k)}</span><span class="muted">${arr.length}</span></div>` +
        (isOpen ? `<div class="fold-bd">${arr.length ? arr.map((item) => `<div>・${esc(item)}</div>`).join('') : '<div>（無）</div>'}</div>` : '');
    }).join('') + `</div>`;
    return h;
  }

  function render() {
    const r = mount();
    if (!r) return;
    renderQuota();
    const d = data, pill = r.querySelector('.pill b'), box = r.querySelector('.box');
    if (!d || !d.models || !d.models.length) {
      pill.textContent = '無資料';
      box.innerHTML = '<span class="muted">目前沒有對話用量紀錄。</span>';
      return;
    }
    const sel = selectedId();
    shown = sel;
    const cur = d.recent.find((c) => c.id === sel) || d.recent[0];
    const isDetected = d.recent.some((c) => c.id === sel);
    const kids = (id) => d.recent.filter((c) => c.parent === id);
    const ks = cur ? kids(cur.id) : [];
    const all = cur ? [cur, ...ks] : [];
    const sum = (k) => all.reduce((n, c) => n + c[k], 0);
    const pillHit = cur ? rate(sum('uncached'), sum('cache')) : d.hit;
    pill.textContent = pillHit + '%';
    pill.style.color = color(pillHit);
    r.querySelector('.pill').title = cur
      ? `${isDetected ? '目前對話' : '最新對話'}（${cur.title}）快取命中率 ${pillHit}%｜上下文已用 ${cur.breakdown?.used_pct ?? 0}%`
      : '全部對話快取命中率';

    let h = `<div class="tabs">` +
      `<div class="tab ${activeTab === 'cache' ? 'active' : ''}" data-tab="cache">快取與各模型統計</div>` +
      `<div class="tab ${activeTab === 'context' ? 'active' : ''}" data-tab="context">上下文結構 (${cur?.breakdown?.used_pct ?? 0}%)</div>` +
      `</div>`;

    if (activeTab === 'context') {
      h += `<div class="muted" style="margin-bottom:6px">對話：<b style="color:#e6e6e6">${name(cur)}</b></div>`;
      h += renderContextBreakdown(cur);
      h += `<div class="muted" style="margin-top:8px">更新 ${esc(d.updated)}，每 30 秒自動更新</div>`;
      box.innerHTML = h;
      return;
    }

    h += `<h4 style="margin-top:2px">${isDetected ? '目前對話' : '最新對話'}</h4>`;
    const head = (c) => `<div class="row" style="grid-template-columns:1fr 52px"><b>${name(c)}</b><em style="color:${color(c.hit)}">${c.hit}%</em></div>${detail(c)}`;
    h += cur
      ? `<div class="cur">` +
        (ks.length ? `<div class="row" style="grid-template-columns:1fr 52px"><span>合計（主對話＋${ks.length} 個子代理）</span><em style="color:${color(pillHit)}"><b>${pillHit}%</b></em></div>` : '') +
        head(cur) +
        ks.map(head).join('') +
        (cur.breakdown ? `<div class="muted" style="margin-top:4px;cursor:pointer;color:#79b8ff" data-tab="context">▸ 查看此對話的上下文結構明細（已使用 ${cur.breakdown.used_pct}%・${wan(cur.breakdown.used)} / ${wan(cur.breakdown.limit)}）</div>` : '') +
        `</div>`
      : `<div class="cur muted">沒有偵測到對話。</div>`;

    const tot = d.cache + d.uncached + d.output || 1;
    const segs = [['快取讀取', d.cache, '#2f81f7'], ['未命中輸入', d.uncached, '#f0883e'], ['輸出', d.output, '#2ea39b']];
    h += `<h4>近期全部：命中 ${d.hit}%（${wan(tot)} token）</h4>`;
    h += '<div class="bar">' + segs.map(([, v, c]) => `<span style="width:${(100 * v / tot).toFixed(2)}%;background:${c}"></span>`).join('') + '</div>';
    h += segs.map(([k, v, c]) => `<div class="row"><i style="background:${c}"></i><span>${k}</span><span>${wan(v)}</span><em>${(100 * v / tot).toFixed(1)}%</em></div>`).join('');

    h += '<h4>各模型</h4>' + d.models.map((m) =>
      `<div class="row"><i style="background:${color(m.hit)}"></i><span>${esc(m.name)}</span><span class="muted">${m.calls} 次・0% ${m.zero} 次</span><em>${m.hit}%</em></div>` +
      (m.subs || []).map((x) => `<div class="row" style="padding-left:16px"><i style="background:${color(x.hit)};border-radius:50%"></i><span class="muted">其中子代理 ${esc(x.agent)}</span><span class="muted">${x.calls} 次・0% ${x.zero} 次</span><em>${x.hit}%</em></div>`).join('')
    ).join('');

    const order = d.recent.filter((c) => !c.parent || !d.recent.some((p) => p.id === c.parent)).flatMap((c) => [c, ...kids(c.id)]);
    h += '<h4>各對話（點一下展開，縮排＝子代理）</h4>' + order.map((c) =>
      `<div class="row conv" data-conv="${esc(c.id)}"${c.parent ? ' style="padding-left:18px"' : ''}><span>${c.id === cur?.id ? '▶ ' : ''}${name(c)}</span><span class="muted">${esc(c.time)}</span><em style="color:${color(c.hit)}">${c.hit}%</em></div>` +
      (expanded.has(c.id) ? detail(c) : '')
    ).join('');

    h += `<div class="muted" style="margin-top:8px">更新 ${esc(d.updated)}，每 30 秒自動更新</div>`;
    box.innerHTML = h;
  }

  window.__codexCacheHud = (d) => {
    data = d;
    render();
  };
  const timer = setInterval(() => {
    if (window.__codexHudGen !== GEN) return clearInterval(timer);
    if (data && selectedId() !== shown) render();
  }, 1000);
})();
