// 注入 Antigravity 視窗的快取命中小面板。資料由 launch-zh-tw.js 呼叫 window.__agyCacheHud(data) 推入。
// 標籤顯示「目前開著的對話」的命中率（側欄 data-selected=true 那列的 data-cascade-id），沒有就顯示 7 天總計。
(() => {
  if (window.__agyCacheHud) return;
  // 每次注入一個世代編號：舊版留下的面板一律隱藏、舊計時器自行停止（熱更新時不會疊兩個）。
  const GEN = String(Date.now()); window.__agyHudGen = GEN;
  const css = `
#agy-cache-hud{position:fixed;top:8px;right:150px;z-index:2147483000;font:12px/1.4 system-ui,"Microsoft JhengHei",sans-serif;color:#e6e6e6;-webkit-app-region:no-drag;display:flex;align-items:center;gap:8px}
#agy-cache-hud .quota{font-size:11px;color:#9a9aa3;white-space:nowrap;cursor:default}#agy-cache-hud .quota b{font-weight:600}
#agy-cache-hud .quota{display:flex;align-items:center;gap:3px}#agy-cache-hud .quota svg{display:block}#agy-cache-hud .quota .sep{margin:0 4px;color:#55555c}
#agy-cache-hud .pill{cursor:pointer;padding:2px 9px;border-radius:11px;background:#2a2a30;border:1px solid #3a3a42;white-space:nowrap}
#agy-cache-hud .pill b{font-weight:600}
#agy-cache-hud .box{display:none;position:absolute;right:0;top:26px;width:360px;max-height:75vh;overflow:auto;padding:12px 14px;background:#232328;border:1px solid #3a3a42;border-radius:10px;box-shadow:0 8px 24px #0008}
#agy-cache-hud.open .box{display:block}
#agy-cache-hud h4{margin:12px 0 4px;font-size:12px;color:#9a9aa3;font-weight:500}
#agy-cache-hud .bar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:#333;margin:6px 0 8px}
#agy-cache-hud .row{display:grid;grid-template-columns:10px 1fr auto 52px;gap:6px;align-items:center;padding:2px 0}
#agy-cache-hud .row i{width:9px;height:9px;border-radius:2px}#agy-cache-hud .row em{font-style:normal;text-align:right}
#agy-cache-hud .conv{cursor:pointer;grid-template-columns:1fr auto 52px;border-radius:4px;padding:3px 4px}
#agy-cache-hud .conv:hover{background:#2c2c33}#agy-cache-hud .conv span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#agy-cache-hud .cur{background:#2a2a31;border:1px solid #34343c;border-radius:8px;padding:8px 10px}
#agy-cache-hud .spark{display:flex;align-items:flex-end;gap:1px;height:26px;background:#2b2b31;border-radius:3px;padding:2px;margin:4px 0 6px}
#agy-cache-hud .spark span{flex:1;min-width:2px;border-radius:1px}
#agy-cache-hud .muted{color:#8b8b94}`;
  const color = (h) => (h >= 70 ? '#2f81f7' : h >= 40 ? '#d29922' : '#f85149');
  const wan = (n) => (n >= 10000 ? (n / 10000).toFixed(1) + '萬' : n.toLocaleString());
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // 目前對話：對話主畫面的 data-cascade-id → 網址 /c/<id> → 側欄選取列（專案內的對話不在側欄）。
  const selectedId = () => document.querySelector('[data-testid="conversation-view"][data-cascade-id]')?.getAttribute('data-cascade-id')
    || (location.pathname.match(/\/c\/([0-9a-f-]{36})/) || [])[1]
    || document.querySelector('[data-testid="conversation-row-sidebar"][data-selected="true"]')?.getAttribute('data-cascade-id') || '';
  let root, data = null, shown = '', expanded = new Set();

  function mount() {
    if (root && document.body.contains(root)) return root;
    if (!document.body || !document.head) return null;
    document.getElementById('agy-cache-hud-style')?.remove();
    const st = document.createElement('style'); st.id = 'agy-cache-hud-style';
    st.textContent = css + `#agy-cache-hud:not([data-gen="${GEN}"]){display:none!important}`; document.head.appendChild(st);
    root = document.createElement('div'); root.id = 'agy-cache-hud'; root.dataset.gen = GEN;
    root.innerHTML = '<span class="quota"></span><div class="pill">快取 <b>…</b></div><div class="box">讀取中…</div>';
    root.querySelector('.pill').onclick = () => root.classList.toggle('open');
    root.querySelector('.box').onclick = (e) => {
      const el = e.target.closest('[data-conv]'); if (!el) return;
      const id = el.getAttribute('data-conv'); expanded.has(id) ? expanded.delete(id) : expanded.add(id); render();
    };
    document.body.appendChild(root);
    return root;
  }

  // 單一對話的細節：統計＋每次呼叫的長條（紅＝命中 0%）。
  const rate = (u, c) => (u + c ? Math.round(1000 * c / (u + c)) / 10 : 0);
  const name = (c) => esc(c.agent ? '子代理 ' + c.agent + (c.title ? '・' + c.title : '') : c.title || c.id.slice(0, 8));
  const detail = (c) => `<div class="muted">上下文 ${wan(c.context)} token・${c.calls.length} 次呼叫・命中 0% 有 ${c.zero} 次・快取讀取 ${wan(c.cache)}・未命中 ${wan(c.uncached)}</div><div class="spark">` +
    c.calls.map(([hit, m, u, cr, o]) => `<span title="${esc(m)}｜命中 ${hit}%｜快取 ${wan(cr)}・未命中 ${wan(u)}・輸出 ${wan(o)}" style="height:${Math.max(hit, 4)}%;background:${hit === 0 ? '#f85149' : color(hit)}"></span>`).join('') + '</div>';

  function render() {
    const r = mount(); if (!r) return; const d = data, pill = r.querySelector('.pill b'), box = r.querySelector('.box');
    if (!d || !d.models || !d.models.length) { pill.textContent = '無資料'; box.innerHTML = '<span class="muted">最近 7 天沒有用量紀錄。</span>'; return; }
    const sel = selectedId(); shown = sel;
    const cur = d.recent.find((c) => c.id === sel);
    const kids = (id) => d.recent.filter((c) => c.parent === id);
    const ks = cur ? kids(cur.id) : [];
    const all = cur ? [cur, ...ks] : [];
    const sum = (k) => all.reduce((n, c) => n + c[k], 0);
    const pillHit = cur ? rate(sum('uncached'), sum('cache')) : d.hit;
    pill.textContent = pillHit + '%'; pill.style.color = color(pillHit);
    r.querySelector('.pill').title = cur ? (ks.length ? `目前對話＋${ks.length} 個子代理合計的快取命中率` : '目前對話的快取命中率') : '最近 7 天全部對話的快取命中率';

    let h = '<h4 style="margin-top:0">目前對話</h4>';
    const head = (c) => `<div class="row" style="grid-template-columns:1fr 52px"><b>${name(c)}</b><em style="color:${color(c.hit)}">${c.hit}%</em></div>${detail(c)}`;
    h += cur ? `<div class="cur">` + (ks.length ? `<div class="row" style="grid-template-columns:1fr 52px"><span>合計（主對話＋${ks.length} 個子代理）</span><em style="color:${color(pillHit)}"><b>${pillHit}%</b></em></div>` : '') +
      head(cur) + ks.map(head).join('') + (cur.parent ? `<div class="muted">這是子代理，上層對話：${name(d.recent.find((c) => c.id === cur.parent) || { id: cur.parent, title: '' })}</div>` : '') + '</div>'
      : `<div class="cur muted">${sel ? '這個對話最近 7 天沒有用量紀錄（或還在寫入）。' : '沒有偵測到開著的對話。'}</div>`;

    const tot = d.cache + d.uncached + d.output || 1;
    const segs = [['快取讀取', d.cache, '#2f81f7'], ['未命中輸入', d.uncached, '#f0883e'], ['輸出', d.output, '#2ea39b']];
    h += `<h4>最近 7 天全部：命中 ${d.hit}%（${wan(tot)} token）</h4>`;
    h += '<div class="bar">' + segs.map(([, v, c]) => `<span style="width:${(100 * v / tot).toFixed(2)}%;background:${c}"></span>`).join('') + '</div>';
    h += segs.map(([k, v, c]) => `<div class="row"><i style="background:${c}"></i><span>${k}</span><span>${wan(v)}</span><em>${(100 * v / tot).toFixed(1)}%</em></div>`).join('');
    h += '<h4>各模型</h4>' + d.models.map((m) => `<div class="row"><i style="background:${color(m.hit)}"></i><span>${esc(m.name)}</span><span class="muted">${m.calls} 次・0% ${m.zero} 次</span><em>${m.hit}%</em></div>` +
      (m.subs || []).map((x) => `<div class="row" style="padding-left:16px"><i style="background:${color(x.hit)};border-radius:50%"></i><span class="muted">其中子代理 ${esc(x.agent)}</span><span class="muted">${x.calls} 次・0% ${x.zero} 次</span><em>${x.hit}%</em></div>`).join('')).join('');
    const order = d.recent.filter((c) => !c.parent || !d.recent.some((p) => p.id === c.parent)).flatMap((c) => [c, ...kids(c.id)]);
    h += '<h4>各對話（點一下展開，縮排＝子代理）</h4>' + order.map((c) => `<div class="row conv" data-conv="${esc(c.id)}"${c.parent ? ' style="padding-left:18px"' : ''}><span>${c.id === sel ? '▶ ' : ''}${name(c)}</span><span class="muted">${esc(c.time)}</span><em style="color:${color(c.hit)}">${c.hit}%</em></div>` +
      (expanded.has(c.id) ? detail(c) : '')).join('');
    h += `<div class="muted" style="margin-top:8px">更新 ${esc(d.updated)}，每 30 秒自動更新</div>`;
    box.innerHTML = h;
  }

  // 模型額度：呼叫 App 自己的本機 RPC（設定 → 模型與用量 用的同一個），CSRF token 取自 App 自己存的 __APP_CONFIG__，只在記憶體使用。
  const GROUP = { 'Gemini Models': 'Gemini', 'Claude and GPT models': 'Claude/GPT' };
    const qcolor = (p) => (p >= 50 ? '#5a9a4a' : p >= 20 ? '#d29922' : '#f85149');
  // 小圓環：外圈比例＝剩餘％，中間寫數字（同設定頁的綠色圓圈）。
  const ring = (p, tip) => { const c = 2 * Math.PI * 8; return `<svg width="21" height="21" viewBox="0 0 21 21"><title>${esc(tip)}</title>` +
    `<circle cx="10.5" cy="10.5" r="8" fill="none" stroke="#3a3a42" stroke-width="2"/>` +
    `<circle cx="10.5" cy="10.5" r="8" fill="none" stroke="${qcolor(p)}" stroke-width="2" stroke-dasharray="${(c * p / 100).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 10.5 10.5)"/>` +
    `<text x="10.5" y="13.2" text-anchor="middle" font-size="${p >= 100 ? 6.5 : 8}" fill="#e6e6e6">${p}</text></svg>`; };
  const when = (t) => { const d = new Date(t); return isNaN(d) ? '' : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 重置`; };
  async function quota() {
    const r = mount(); if (!r) return; const q = r.querySelector('.quota');
    try {
      const res = await fetch('/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary', { method: 'POST', body: '{}',
        headers: { 'content-type': 'application/json', 'connect-protocol-version': '1', 'x-codeium-csrf-token': window.__APP_CONFIG__?.csrfToken || '' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const groups = (await res.json()).response?.groups || [];
      q.innerHTML = groups.map((g) => {
        const name = GROUP[g.displayName] || g.displayName.replace(/^Gemini 4 /, '');
        return `<span>${esc(name)}</span>` + (g.buckets || []).map((b) => {
          const p = Math.round((b.remainingFraction ?? 0) * 100);
          return ring(p, `${name} ${b.window === '5h' ? '五小時' : '每週'}限額剩餘 ${p}%，${when(b.resetTime)}`);
        }).join('');
      }).join('<span class="sep">｜</span>');
      q.title = '';
    } catch (e) {
      q.textContent = '額度讀取中…'; q.title = String(e && e.message || e);
      // 冷啟動時 App 可能還沒拿到 token：3 秒後再試，不用等 20 秒。
      if (window.__agyHudGen === GEN) setTimeout(quota, 3000);
    }
  }
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', quota, { once: true }); else quota();
  const qtimer = setInterval(() => { if (window.__agyHudGen !== GEN) return clearInterval(qtimer); if (!document.hidden) quota(); }, 20000);

  window.__agyCacheHud = (d) => { data = d; render(); quota(); };
  // 切換對話時立即重畫（只比對選取的 id，便宜）。
  const timer = setInterval(() => { if (window.__agyHudGen !== GEN) return clearInterval(timer); if (data && selectedId() !== shown) render(); }, 1000);
})();
