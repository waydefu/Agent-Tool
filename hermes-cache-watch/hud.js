// 注入 Hermes Desktop 視窗的 GPT/Codex 額度圓環與 Hermes 快取命中率面板。
// 資料由 launch-hermes-hud.js 呼叫 window.__hermesCacheHud(data) 推入。
(() => {
  const GEN = String(Date.now());
  window.__hermesHudGen = GEN;

  const css = `
#hermes-cache-hud{position:fixed;top:calc(var(--titlebar-height,34px) + 4px);right:12px;z-index:2147483000;font:12px/1.45 system-ui,"Microsoft JhengHei",sans-serif;font-variant-numeric:tabular-nums;color:#e6e6e6;-webkit-app-region:no-drag;display:flex;align-items:center;gap:8px;user-select:none;padding:2px 8px;border-radius:13px;background:rgba(30,30,36,.88);border:1px solid #2d2d35}
#hermes-cache-hud .quota{font-size:11px;color:#9a9aa3;white-space:nowrap;cursor:default;display:flex;align-items:center;gap:4px}
#hermes-cache-hud .quota b{font-weight:600}
#hermes-cache-hud .quota svg{display:block}
#hermes-cache-hud .quota .sep{margin:0 4px;color:#55555c}
#hermes-cache-hud .pill{cursor:pointer;padding:2px 9px;border-radius:11px;background:#2a2a30;border:1px solid #3a3a42;white-space:nowrap;transition:background .15s}
#hermes-cache-hud .pill:hover{background:#34343c}
#hermes-cache-hud .pill b{font-weight:600}
#hermes-cache-hud .box{display:none;position:absolute;right:0;top:28px;width:368px;max-height:80vh;overflow:auto;padding:13px 15px;background:#1e1e24;border:1px solid #3a3a42;border-radius:11px;box-shadow:0 10px 28px #000a}
#hermes-cache-hud.open .box{display:block}
#hermes-cache-hud h4{margin:12px 0 4px;font-size:12px;color:#9a9aa3;font-weight:500}
#hermes-cache-hud .bar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:#2f2f37;margin:6px 0 8px}
#hermes-cache-hud .bar span{display:block;height:100%}
#hermes-cache-hud .row{display:grid;grid-template-columns:10px 1fr auto 54px;gap:7px;align-items:center;padding:2.5px 0}
#hermes-cache-hud .row i{width:9px;height:9px;border-radius:2px;display:inline-block}
#hermes-cache-hud .row em{font-style:normal;text-align:right;color:#c9c9cf}
#hermes-cache-hud .badge{display:inline-block;margin-left:5px;padding:0 5px;border-radius:8px;background:#2b2b34;border:1px solid #40404c;color:#a8b3cf;font-size:10.5px;line-height:1.5;cursor:pointer;vertical-align:middle}
#hermes-cache-hud .badge:hover{background:#373743;color:#fff}
#hermes-cache-hud .conv{cursor:pointer;grid-template-columns:1fr auto 52px;border-radius:4px;padding:3px 5px}
#hermes-cache-hud .conv:hover{background:#2c2c33}
#hermes-cache-hud .conv span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#hermes-cache-hud .cur{background:#26262e;border:1px solid #34343e;border-radius:8px;padding:8px 10px}
#hermes-cache-hud .muted{color:#8b8b94}
#hermes-cache-hud .link{color:#79b8ff;cursor:pointer;font-size:11.5px;padding:2px 7px;background:#1c2536;border:1px solid #2e4369;border-radius:5px;display:inline-block}
#hermes-cache-hud .link:hover{background:#25334a}
#hermes-cache-hud .foot{display:flex;justify-content:space-between;align-items:center;margin-top:8px}
#hermes-cache-hud .box::-webkit-scrollbar{width:5px;height:5px}
#hermes-cache-hud .box::-webkit-scrollbar-thumb{background:#43434f;border-radius:3px}
#hermes-cache-hud .box::-webkit-scrollbar-track{background:transparent}
`;

  const LANG = window.__agentToolLang === 'en' ? 'en' : 'zh-TW';
  const t = (zh, en) => (LANG === 'en' ? en : zh);
  const color = (h) => (h >= 70 ? '#2f81f7' : h >= 40 ? '#d29922' : '#f85149');
  const qcolor = (p) => (p >= 50 ? '#5a9a4a' : p >= 20 ? '#d29922' : '#f85149');
  const rate = (u, c) => (u + c ? Math.round(1000 * c / (u + c)) / 10 : 0);
  const wan = (n) => {
    const v = Number(n || 0);
    if (LANG === 'en') return Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(v);
    if (v >= 100000000) return (v / 100000000).toFixed(2) + '億';
    return v >= 10000 ? (v / 10000).toFixed(1) + '萬' : v.toLocaleString();
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const ring = (p, tip) => {
    const c = 2 * Math.PI * 8;
    return `<svg width="21" height="21" viewBox="0 0 21 21"><title>${esc(tip)}</title>` +
      `<circle cx="10.5" cy="10.5" r="8" fill="none" stroke="#3a3a42" stroke-width="2"/>` +
      `<circle cx="10.5" cy="10.5" r="8" fill="none" stroke="${qcolor(p)}" stroke-width="2" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 10.5 10.5)"/>` +
      `<text x="10.5" y="13.2" text-anchor="middle" font-size="${p >= 100 ? 6.5 : 8}" fill="#e6e6e6">${p}</text></svg>`;
  };

  function selectedId() {
    const href = location.href + ' ' + location.pathname + ' ' + location.search + ' ' + (location.hash || '');
    const m = href.match(/(?:sessions?|threads?|c)\/([A-Za-z0-9_-]{6,64})/i) || href.match(/sessionId=([A-Za-z0-9_-]{6,64})/i);
    if (m) return m[1];
    const winTitle = (document.title || '').split(' - ')[0].trim();
    if (winTitle && data?.recent) {
      const hit = data.recent.find((c) => c.title && (c.title === winTitle || winTitle.startsWith(c.title)));
      if (hit) return hit.id;
    }
    return '';
  }

  let root, data = null, shown = '', expanded = new Set(), openKids = new Set(), openCurKids = false;

  function mount() {
    if (root && document.body && document.body.contains(root)) return root;
    if (!document.body || !document.head) return null;
    document.querySelectorAll('#hermes-cache-hud, #hermes-cache-hud-style').forEach((el) => el.remove());
    const st = document.createElement('style');
    st.id = 'hermes-cache-hud-style';
    st.textContent = css + `#hermes-cache-hud:not([data-gen="${GEN}"]){display:none!important}`;
    document.head.appendChild(st);

    root = document.createElement('div');
    root.id = 'hermes-cache-hud';
    root.dataset.gen = GEN;
    root.innerHTML = `<span class="quota"></span><div class="pill">${t('快取', 'Cache')} <b>…</b></div><div class="box">${t('讀取中…', 'Loading…')}</div>`;
    root.onclick = (e) => e.stopPropagation();
    root.querySelector('.pill').onclick = () => root.classList.toggle('open');
    root.querySelector('.box').onclick = (e) => {
      if (e.target.closest('[data-collapse-all]')) {
        expanded.clear();
        openKids.clear();
        openCurKids = false;
        render();
        return;
      }
      if (e.target.closest('[data-cur-kids]')) {
        openCurKids = !openCurKids;
        render();
        return;
      }
      const kidsEl = e.target.closest('[data-kids]');
      if (kidsEl) {
        e.stopPropagation();
        const kidId = kidsEl.getAttribute('data-kids');
        openKids.has(kidId) ? openKids.delete(kidId) : openKids.add(kidId);
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
    if (typeof document.addEventListener === 'function') {
      const closeOut = (e) => {
        if (window.__hermesHudGen !== GEN) return document.removeEventListener('click', closeOut);
        if (root && !root.contains(e.target)) root.classList.remove('open');
      };
      const closeEsc = (e) => {
        if (window.__hermesHudGen !== GEN) return document.removeEventListener('keydown', closeEsc);
        if (e.key === 'Escape' && root) root.classList.remove('open');
      };
      document.addEventListener('click', closeOut);
      document.addEventListener('keydown', closeEsc);
    }
    document.body.appendChild(root);
    return root;
  }

  function renderQuota() {
    const r = mount();
    if (!r) return;
    const q = r.querySelector('.quota');
    const groups = data?.quota || [];
    if (!groups.length) {
      q.textContent = data?.quotaStatus === 'unavailable' ? t('GPT 額度不可用', 'GPT quota unavailable') : t('GPT 週 / 五小額度', 'GPT Weekly / 5h');
      return;
    }
    q.innerHTML = groups.map((g) => {
      const label = (!g.name || g.name === '週額度 / 五小額度' || g.name === 'Weekly / 5h')
        ? t('GPT 額度', 'GPT Quota')
        : g.name;
      const ordered = [...(g.buckets || [])].sort((a, b) => (a.window === 'week' ? -1 : 1) - (b.window === 'week' ? -1 : 1));
      return `<span>${esc(label)}</span>` + ordered.map((b) => {
        const p = b.remaining ?? 0;
        const rstText = LANG === 'en'
          ? String(b.reset || '').replace(' 已重置', ' already reset').replace(' 重置', ' reset')
          : String(b.reset || '');
        const winLabel = b.window === '5h' ? t('五小額度（5 小時）', '5-hour') : b.window === 'week' ? t('週額度（每週）', 'Weekly') : t(b.label, b.label);
        return ring(p, `${winLabel} ${t('限額剩餘', 'remaining')} ${p}% (${t('已用', 'used')} ${b.used}%)${rstText ? ', ' + rstText : ''}`);
      }).join('');
    }).join('<span class="sep">｜</span>') + (data?.quotaStatus === 'stale' ? `<span title="${esc(t('上次成功更新：', 'Last successful update: ') + (data.quotaUpdated || ''))}">${t('過期', 'Stale')}</span>` : '');
  }

  const convName = (c) => esc(c.parent ? t('子代理 ', 'Subagent ') + (c.title || c.id.slice(0, 8)) : c.title || c.id.slice(0, 8));
  const detail = (c) => `<div class="muted">${c.calls} ${t('次呼叫', 'calls')} · ${t('快取讀取', 'Cached input')} ${wan(c.cache)} · ${t('未命中', 'Uncached')} ${wan(c.uncached)} · ${t('輸出', 'Output')} ${wan(c.output)}</div>`;

  function render() {
    const r = mount();
    if (!r) return;
    renderQuota();
    const d = data, pill = r.querySelector('.pill b'), box = r.querySelector('.box');
    if (!d || ((!d.models || !d.models.length) && (!d.recent || !d.recent.length))) {
      pill.textContent = t('無資料', 'No data');
      box.innerHTML = `<span class="muted">${t('目前沒有 Hermes 對話用量紀錄。', 'No Hermes conversation usage records available.')}</span>`;
      return;
    }
    const sel = selectedId();
    if (sel !== shown) shown = sel;
    const isDetected = d.recent.some((c) => c.id === sel);
    const cur = d.recent.find((c) => c.id === sel) || d.recent[0];
    const kids = (id) => d.recent.filter((c) => c.parent === id);
    const ks = cur ? kids(cur.id) : [];
    const all = cur ? [cur, ...ks] : [];
    const sum = (k) => all.reduce((n, c) => n + (c[k] || 0), 0);
    const pillHit = cur ? rate(sum('uncached'), sum('cache')) : d.hit;
    pill.textContent = pillHit + '%';
    pill.style.color = color(pillHit);
    r.querySelector('.pill').title = cur
      ? `${isDetected ? t('目前對話', 'Current conversation') : t('最新對話', 'Latest conversation')} (${cur.title}) ${t('快取命中率', 'cache hit rate')} ${pillHit}%`
      : t('Hermes 快取命中率', 'Hermes cache hit rate');

    let h = `<h4 style="margin-top:2px">${isDetected ? t('目前對話', 'Current conversation') : t('最新對話', 'Latest conversation')}</h4>`;
    const head = (c) => `<div class="row" style="grid-template-columns:1fr 52px"><b>${convName(c)}</b><em style="color:${color(c.hit)}">${c.hit}%</em></div>${detail(c)}`;
    h += cur
      ? `<div class="cur">` +
        (ks.length ? `<div class="row" style="grid-template-columns:1fr 52px"><span>${t('合計（主對話＋', 'Total (main + ')}${ks.length} ${t('個子代理）', 'subagents)')}<span class="badge" data-cur-kids="1">${openCurKids ? '▾ ' + t('收合子代理', 'Hide subagents') : '▸ ' + t('展開子代理', 'Show subagents')}</span></span><em style="color:${color(pillHit)}"><b>${pillHit}%</b></em></div>` : '') +
        head(cur) +
        (openCurKids ? ks.map(head).join('') : '') +
        `</div>`
      : `<div class="cur muted">${t('沒有偵測到對話。', 'No conversation detected.')}</div>`;

    const tot = d.cache + d.uncached + d.output || 1;
    const segs = [[t('快取讀取', 'Cached input'), d.cache, '#2f81f7'], [t('未命中輸入', 'Uncached input'), d.uncached, '#f0883e'], [t('輸出', 'Output'), d.output, '#2ea39b']];
    h += `<h4>${t('近 30 天 Hermes 對話：命中', 'Hermes 30-day cache hit')} ${d.hit}% (${wan(tot)} token)</h4>`;
    h += '<div class="bar">' + segs.map(([, v, c]) => `<span style="width:${(100 * v / tot).toFixed(2)}%;background:${c}"></span>`).join('') + '</div>';
    h += segs.map(([k, v, c]) => `<div class="row"><i style="background:${c}"></i><span>${k}</span><span>${wan(v)}</span><em>${(100 * v / tot).toFixed(1)}%</em></div>`).join('');

    h += `<h4>${t('各模型', 'By model')}</h4>` + d.models.map((m) =>
      `<div class="row"><i style="background:${color(m.hit)}"></i><span>${esc(m.name)}</span><span class="muted">${m.calls} ${t('次', 'calls')}</span><em>${m.hit}%</em></div>`
    ).join('');

    const roots = d.recent.filter((c) => !c.parent || !d.recent.some((p) => p.id === c.parent));
    h += `<h4>${t('最近對話（點一下展開明細）', 'Recent conversations (click to expand)')}</h4>` + roots.map((c) => {
      const cKids = kids(c.id);
      const kidsOpen = openKids.has(c.id);
      const badge = cKids.length ? `<span class="badge" data-kids="${esc(c.id)}">${kidsOpen ? '▾' : '+'}${cKids.length} ${t('子代理', 'sub')}</span>` : '';
      return `<div class="row conv" data-conv="${esc(c.id)}"><span>${c.id === cur?.id ? '▶ ' : ''}${convName(c)}${badge}</span><span class="muted">${esc(c.time)}</span><em style="color:${color(c.hit)}">${c.hit}%</em></div>` +
        (expanded.has(c.id) ? detail(c) : '') +
        (kidsOpen ? cKids.map((k) => `<div class="row conv" data-conv="${esc(k.id)}" style="padding-left:16px"><span class="muted">└ ${k.id === cur?.id ? '▶ ' : ''}${convName(k)}</span><span class="muted">${esc(k.time)}</span><em style="color:${color(k.hit)}">${k.hit}%</em></div>` + (expanded.has(k.id) ? detail(k) : '')).join('') : '');
    }).join('');

    const hasExpanded = expanded.size > 0 || openKids.size > 0 || openCurKids;
    h += `<div class="foot muted"><span>${t('更新', 'Updated')} ${esc(d.updated)} · ${t('每 30 秒自動更新', 'refreshes every 30 seconds')}</span>` +
      (hasExpanded ? `<span class="link" data-collapse-all="1">${t('收合全部', 'Collapse all')}</span>` : '') + `</div>`;
    box.innerHTML = h;
  }

  window.__hermesCacheHud = (d) => {
    data = d;
    render();
  };

  let tick = 0;
  const timer = setInterval(() => {
    if (window.__hermesHudGen !== GEN) return clearInterval(timer);
    tick = (tick + 1) % 15;
    if (data && selectedId() !== shown) render();
    else if (tick === 0) renderQuota();
  }, 1000);
})();
