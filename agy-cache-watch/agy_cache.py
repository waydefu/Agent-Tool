"""Antigravity 快取命中與上下文結構觀察工具（唯讀，只用 Python 標準函式庫）。

讀取 ~/.gemini/antigravity*/conversations/*.db 的 gen_metadata，每列是一次模型呼叫。
欄位對照（官方未公開，參考 zerodoxxx/ai-usage-dashboard PR #13 的逆向結果，並加上 Field 9.10 上下文結構逆向）：
  1.4.2 未命中輸入 token、1.4.5 快取讀取 token、1.4.3 輸出 token、1.19 模型名稱
  1.9.10.1 總上下文 token、1.9.10.4 上下文上限（如 512000）、1.9.10.3.1 各分類精確 token 與子項目明細：
    Chat Messages（訊息）、Tools（系統工具）、Mcp Tools（MCP 工具）、System Prompt（系統提示）、
    Skills（技能）、Plugins（推薦外掛）、Rules（使用者規則）、Subagents（子代理）
命中率 = 快取讀取 / (未命中輸入 + 快取讀取)。只回傳數字與結構名稱，不讀對話文字內容。

用法：
  python -I agy_cache.py              各模型與最近 10 個對話的命中率與最新上下文明細
  python -I agy_cache.py --days 1     只算最近 1 天有更新的對話
  python -I agy_cache.py --watch 30   每 30 秒列出最新對話的新呼叫（Ctrl+C 結束）
  python -I agy_cache.py --selftest
"""
import argparse, glob, os, sqlite3, sys, time
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HOME = os.path.expanduser("~")
DIRS = [os.path.join(HOME, ".gemini", d, "conversations") for d in ("antigravity", "antigravity-cli")]

CAT_META = {
    "Chat Messages": ("訊息", "#2f81f7", 1),
    "Tools": ("系統工具", "#f0883e", 2),
    "Mcp Tools": ("MCP 工具", "#2ea39b", 3),
    "System Prompt": ("系統提示", "#8b8b94", 4),
    "Skills": ("Skills", "#7d7d86", 5),
    "Plugins": ("外掛目錄 (Plugins)", "#6e6e77", 6),
    "Rules": ("使用者規則 (Rules)", "#5f5f68", 7),
    "Subagents": ("子代理定義 (Subagents)", "#505059", 8),
}


def fields(buf):
    """Yield (field, wiretype, value) of one protobuf message; raises ValueError on bad data."""
    i, n = 0, len(buf)
    while i < n:
        key, i = _varint(buf, i)
        f, wt = key >> 3, key & 7
        if wt == 0:
            v, i = _varint(buf, i)
        elif wt == 2:
            ln, i = _varint(buf, i)
            if i + ln > n:
                raise ValueError("truncated")
            v, i = buf[i:i + ln], i + ln
        elif wt in (1, 5):
            width = 8 if wt == 1 else 4
            if i + width > n:
                raise ValueError("truncated fixed-width field")
            i += width
            v = None
        else:
            raise ValueError("wire type %d" % wt)
        yield f, wt, v


def _varint(b, i):
    r = s = 0
    for _ in range(10):
        if i >= len(b):
            raise ValueError("truncated varint")
        x = b[i]; i += 1; r |= (x & 0x7F) << s; s += 7
        if x < 0x80:
            return r, i
    raise ValueError("varint too long")


def last(buf, num, wt):
    out = None
    for f, w, v in fields(buf):
        if f == num and w == wt:
            out = v
    return out


def decode_call(blob):
    """-> (model, uncached, cache_read, output) or None."""
    try:
        m = last(blob, 1, 2)
        if m is None:
            return None
        u = last(m, 4, 2)
        if u is None:
            return None
        usage = {f: v for f, w, v in fields(u) if w == 0}
        model = last(m, 19, 2)
        model = model.decode("utf-8", "replace") if model else "?"
        un, cr, out = usage.get(2, 0), usage.get(5, 0), usage.get(3, 0)
        return (model, un, cr, out) if un + cr + out else None
    except ValueError:
        return None


def decode_breakdown(blob, prev_total=0):
    """從 gen_metadata 最後一筆 blob 的 1.9.10 解碼官方精確的上下文結構明細。"""
    try:
        m = last(blob, 1, 2)
        if not m:
            return None
        f9 = last(m, 9, 2)
        if not f9:
            return None
        f10 = last(f9, 10, 2)
        if not f10:
            return None
        used = last(f10, 1, 0) or 0
        limit = last(f10, 4, 0) or 512000
        f3 = last(f10, 3, 2)
        if not f3:
            return None
        cats = []
        lists = {}
        chat_last_step = 0
        for ssf, ssw, ssv in fields(f3):
            if ssf == 1 and ssw == 2:
                raw_name = last(ssv, 1, 2)
                raw_name = raw_name.decode("utf-8", "replace") if raw_name else "Other"
                tok = last(ssv, 4, 0) or 0
                zh_name, color, order = CAT_META.get(raw_name, (raw_name, "#666670", 99))
                subs = []
                for k, kw, kv in fields(ssv):
                    if k == 5 and kw == 2:
                        sn = last(kv, 1, 2)
                        sn = sn.decode("utf-8", "replace") if sn else ""
                        st = last(kv, 3, 0) or 0
                        if sn:
                            subs.append((sn, st))
                cats.append({"order": order, "name": zh_name, "raw": raw_name, "tokens": tok, "color": color})
                if raw_name == "Chat Messages" and subs:
                    # 計算最後一輪 USER_INPUT 至今新增的訊息 token
                    acc = 0
                    for sn, st in reversed(subs):
                        acc += st
                        if "USER_INPUT" in sn:
                            break
                    chat_last_step = acc
                elif raw_name != "Chat Messages" and subs:
                    lists[zh_name] = [f"{sn} ({st:,} tok)" for sn, st in sorted(subs, key=lambda x: -x[1])]
        cats.sort(key=lambda x: x["order"])
        for c in cats:
            c.pop("order", None)
        if not used:
            used = sum(c["tokens"] for c in cats)
        since_last = max(0, used - prev_total) if prev_total else 0
        if since_last == 0 and chat_last_step:
            since_last = chat_last_step
        avail = max(0, limit - used)
        return {
            "used": used,
            "limit": limit,
            "used_pct": round(100.0 * used / limit, 1) if limit else 0.0,
            "cats": cats,
            "since_last": since_last,
            "available": avail,
            "lists": lists,
        }
    except ValueError:
        return None


def read_db(path, with_breakdown=False):
    con = sqlite3.connect("file:%s?mode=ro" % path.replace("\\", "/"), uri=True, timeout=0.5)
    try:
        rows = con.execute("select idx, data from gen_metadata order by idx").fetchall()
    finally:
        con.close()
    calls = []
    valid_blobs = []
    for idx, d in rows:
        if d and (c := decode_call(d)):
            calls.append((idx, c))
            valid_blobs.append((d, c[1] + c[2]))
    if not with_breakdown:
        return calls
    bd = None
    prev_tot = valid_blobs[-2][1] if len(valid_blobs) >= 2 else (valid_blobs[-1][1] if valid_blobs else 0)
    for idx, d in reversed(rows):
        if d and (bd := decode_breakdown(d, prev_tot)):
            break
    return calls, bd


def rate(un, cr):
    return 100.0 * cr / (un + cr) if un + cr else 0.0


def bar(p, w=10):
    k = round(p / 100 * w)
    return "█" * k + "░" * (w - k)


def conversations(days=None):
    files = [f for d in DIRS for f in glob.glob(os.path.join(d, "*.db"))]
    if days:
        cut = time.time() - days * 86400
        files = [f for f in files if max(os.path.getmtime(f), os.path.getmtime(f + "-wal") if os.path.exists(f + "-wal") else 0) >= cut]
    return sorted(files, key=os.path.getmtime, reverse=True)


def summary(days):
    per_model, convs = collect(days)
    if not per_model:
        print("找不到有用量紀錄的對話（新版 App 的對話用過才會產生）。"); return
    print("== 各模型快取命中率（命中率 = 快取讀取 ÷ 全部輸入）")
    print("%-28s %6s %8s %12s %12s %8s" % ("模型", "呼叫", "命中率", "未命中輸入", "快取讀取", "0%次數"))
    for model, (n, u, c, o, z) in sorted(per_model.items(), key=lambda x: -x[1][0]):
        print("%-28s %6d %6.1f%% %12d %12d %8d  %s" % (model[:28], n, rate(u, c), u, c, z, bar(rate(u, c))))
    if convs and convs[0][3]:
        b = convs[0][3]
        print("\n== 最新對話上下文結構 (%s)：已使用 %.1f%%（%s / %s）" % (convs[0][0][:8], b["used_pct"], wan(b["used"]), wan(b["limit"])))
        for c in b["cats"]:
            print("  %-22s %10s  %5.1f%%" % (c["name"], wan(c["tokens"]), 100.0 * c["tokens"] / (b["limit"] or 1)))
        print("  %-22s %10s  %5.1f%%" % ("自上次呼叫新增", wan(b["since_last"]), 100.0 * b["since_last"] / (b["limit"] or 1)))
        print("  %-22s %10s  %5.1f%%" % ("可用空間", wan(b["available"]), 100.0 * b["available"] / (b["limit"] or 1)))
    print("\n== 最近對話")
    for cid, t, calls, _ in convs[:10]:
        un = sum(c[1] for _, c in calls); cr = sum(c[2] for _, c in calls); r = rate(un, cr)
        print("%s  %s  %4d 次呼叫  %5.1f%%  %s" % (t, cid[:8], len(calls), r, bar(r)))


def watch(interval):
    seen = {}
    print("監看中（每 %d 秒），只列新呼叫。Ctrl+C 結束。" % interval)
    while True:
        for f in conversations(days=1)[:3]:
            try:
                calls = read_db(f)
            except sqlite3.Error:
                continue
            start = seen.get(f, len(calls) if f not in seen else 0)
            for idx, (model, u, c, o) in calls[start:]:
                print("%s %s #%d %-24s 命中 %5.1f%%  未命中 %7d 快取 %7d 輸出 %6d" % (
                    time.strftime("%H:%M:%S"), os.path.basename(f)[:8], idx, model[:24], rate(u, c), u, c, o))
            seen[f] = len(calls)
        time.sleep(interval)


def titles():
    """conversation_id -> (標題, 上層對話 id, 子代理名稱)。（只讀 conversation_summaries 的 id、title、preview；title 常是空的，標題在 preview）。"""
    out = {}
    for d in DIRS:
        p = os.path.join(os.path.dirname(d), "conversation_summaries.db")
        if not os.path.exists(p):
            continue
        try:
            con = sqlite3.connect("file:%s?mode=ro" % p.replace("\\", "/"), uri=True, timeout=0.5)
            out.update({r[0]: r[1:] for r in con.execute("select conversation_id, coalesce(nullif(title, ''), preview), parent_conversation_id, agent_name from conversation_summaries")})
            con.close()
        except sqlite3.Error:
            pass
    return out


def wan(n):
    return "%.1f萬" % (n / 10000) if n >= 10000 else "{:,}".format(n)


def collect(days):
    per_model = defaultdict(lambda: [0, 0, 0, 0, 0])
    convs = []
    for f in conversations(days):
        try:
            calls, bd = read_db(f, with_breakdown=True)
        except sqlite3.Error:
            continue
        if not calls:
            continue
        convs.append((os.path.basename(f)[:-3], time.strftime("%m-%d %H:%M", time.localtime(os.path.getmtime(f))), calls, bd))
        for _, (model, u, c, o) in calls:
            s = per_model[model]; s[0] += 1; s[1] += u; s[2] += c; s[3] += o; s[4] += (c == 0)
    return per_model, convs


def html_report(days, refresh):
    import html as H
    per_model, convs = collect(days)
    un = sum(s[1] for s in per_model.values()); cr = sum(s[2] for s in per_model.values()); out = sum(s[3] for s in per_model.values())
    total = un + cr + out or 1
    colors = {"快取讀取": "#2f81f7", "未命中輸入": "#f0883e", "輸出": "#2ea39b"}
    segs = [("快取讀取", cr), ("未命中輸入", un), ("輸出", out)]
    bar_html = "".join('<span style="width:%.2f%%;background:%s"></span>' % (100 * v / total, colors[k]) for k, v in segs)
    rows = "".join('<div class="row"><i style="background:%s"></i><span>%s</span><b>%s</b><em>%.1f%%</em></div>' % (colors[k], k, wan(v), 100 * v / total) for k, v in segs)

    def model_block(model, s):
        n, u, c, o, z = s; r = rate(u, c)
        return ('<div class="row"><i style="background:%s"></i><span>%s</span><b>%d 次・0%% %d 次</b><em>%.1f%%</em></div>'
                '<div class="mini"><span style="width:%.1f%%"></span></div>') % (
            "#2f81f7" if r >= 70 else "#d29922" if r >= 40 else "#f85149", H.escape(model), n, z, r, r)
    models = "".join(model_block(m, s) for m, s in sorted(per_model.items(), key=lambda x: -x[1][0]))

    def spark(calls):
        return "".join('<span title="#%d %s 命中 %.0f%%" style="height:%.0f%%;background:%s"></span>' % (
            idx, H.escape(m), rate(u, c), max(rate(u, c), 3), "#f85149" if c == 0 else "#2f81f7") for idx, (m, u, c, o) in calls[-120:])
    conv_html = "".join('<div class="conv"><div class="row"><span>%s ・ %s</span><b>%d 次</b><em>%.1f%%</em></div><div class="spark">%s</div></div>' % (
        t, cid[:8], len(calls), rate(sum(x[1][1] for x in calls), sum(x[1][2] for x in calls)), spark(calls)) for cid, t, calls, _ in convs[:8])
    hit = rate(un, cr)
    page = """<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>Antigravity 快取命中</title>%s
<style>
body{margin:0;background:#1b1b1f;color:#e6e6e6;font:14px/1.5 system-ui,"Microsoft JhengHei",sans-serif}
.panel{max-width:460px;margin:24px auto;padding:16px 18px;background:#232328;border-radius:10px}
h1{font-size:15px;margin:0 0 6px;display:flex;justify-content:space-between}h1 small{color:#9a9aa3;font-weight:400}
h2{font-size:13px;color:#9a9aa3;font-weight:500;margin:18px 0 6px}
.bar{display:flex;height:6px;border-radius:3px;overflow:hidden;background:#333;margin-bottom:12px}.bar span{display:block}
.row{display:grid;grid-template-columns:14px 1fr auto 60px;gap:8px;align-items:center;padding:3px 0}
.row i{width:10px;height:10px;border-radius:2px}.row b{font-weight:400}.row em{font-style:normal;text-align:right;color:#c9c9cf}
.conv .row{grid-template-columns:1fr auto 60px}
.mini{height:4px;background:#333;border-radius:2px;margin:0 0 6px 22px}.mini span{display:block;height:100%%;background:#2f81f7;border-radius:2px}
.spark{display:flex;align-items:flex-end;gap:1px;height:34px;margin:2px 0 10px;background:#2b2b31;border-radius:3px;padding:2px}
.spark span{flex:1;min-width:2px;border-radius:1px}
.note{color:#8b8b94;font-size:12px;margin-top:12px}
</style></head><body><div class="panel">
<h1>快取命中 %.1f%%<small>%s 輸入＋輸出</small></h1><div class="bar">%s</div>%s
<h2>各模型（藍 ≥70%%、黃 40–70%%、紅 &lt;40%%）</h2>%s
<h2>最近對話・每次呼叫（紅＝命中 0%%，滑鼠移上去看數字）</h2>%s
<div class="note">更新時間 %s。命中率 = 快取讀取 ÷（快取讀取＋未命中輸入）。資料來自本機 conversations/*.db，唯讀。</div>
</div></body></html>""" % ('<meta http-equiv="refresh" content="%d">' % refresh if refresh else "", hit, wan(total), bar_html, rows,
                            models or "<p>尚無資料</p>", conv_html or "<p>尚無資料</p>", time.strftime("%Y-%m-%d %H:%M:%S"))
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report.html")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(page)
    return path



def summary_en(days):
    """English terminal summary; data and cache calculations remain language-independent."""
    per_model, convs = collect(days)
    if not per_model:
        print("No conversation usage records found (the app must have generated new-format logs).")
        return
    print("== Cache hit rate by model (cached input / total input)")
    print("%-28s %6s %8s %12s %12s %8s" % ("Model", "Calls", "Hit rate", "Uncached", "Cached", "0% calls"))
    for model, (n, u, c, o, z) in sorted(per_model.items(), key=lambda x: -x[1][0]):
        print("%-28s %6d %6.1f%% %12d %12d %8d  %s" % (model[:28], n, rate(u, c), u, c, z, bar(rate(u, c))))
    if convs and convs[0][3]:
        bd = convs[0][3]
        print("\n== Latest context breakdown (%s): %.1f%% used (%s / %s)" %
              (convs[0][0][:8], bd["used_pct"], "{:,}".format(bd["used"]), "{:,}".format(bd["limit"])))
        for item in bd["cats"]:
            print("  %-22s %10s %5.1f%%" % (
                item.get("raw") or item["name"], "{:,}".format(item["tokens"]),
                100.0 * item["tokens"] / (bd["limit"] or 1)))
        print("  %-22s %10s" % ("Since last update", "{:,}".format(bd["since_last"])))
        print("  %-22s %10s" % ("Available", "{:,}".format(bd["available"])))
    print("\n== Recent conversations")
    for cid, timestamp, calls, _ in convs[:10]:
        un = sum(x[1][1] for x in calls)
        cr = sum(x[1][2] for x in calls)
        print("%s  %s  %4d calls  %5.1f%%  %s" %
              (timestamp, cid[:8], len(calls), rate(un, cr), bar(rate(un, cr))))


def watch_en(interval):
    """Show only new calls after startup, without echoing private conversation titles."""
    seen = {}
    print("Monitoring every %d seconds; new calls only. Ctrl+C to stop." % interval)
    while True:
        for file in conversations(days=1)[:3]:
            try:
                calls = read_db(file)
            except sqlite3.Error:
                continue
            start = seen.get(file, len(calls))
            for idx, (model, u, c, o) in calls[start:]:
                print("%s %s #%d %-24s hit %5.1f%% uncached %7d cached %7d output %6d" % (
                    time.strftime("%H:%M:%S"), os.path.basename(file)[:8], idx,
                    model[:24], rate(u, c), u, c, o))
            seen[file] = len(calls)
        time.sleep(interval)


def html_report_en(days, refresh):
    """Create a self-contained English HTML report with escaped source-controlled labels."""
    from html import escape
    per_model, convs = collect(days)
    uncached = sum(s[1] for s in per_model.values())
    cached = sum(s[2] for s in per_model.values())
    output = sum(s[3] for s in per_model.values())
    total = cached + uncached + output or 1
    fmt = lambda n: "{:,}".format(n)
    categories = [("Cached input", cached, "#2f81f7"),
                  ("Uncached input", uncached, "#f0883e"), ("Output", output, "#2ea39b")]
    legend = "".join(
        '<div class="row"><span>%s</span><b>%s</b><em>%.1f%%</em></div>' %
        (name, fmt(value), 100.0 * value / total) for name, value, _ in categories
    )
    bars = "".join('<span style="width:%.2f%%;background:%s"></span>' %
                   (100.0 * value / total, color) for _, value, color in categories)
    models = "".join('<div class="row"><span>%s</span><b>%d calls</b><em>%.1f%%</em></div>' %
                     (escape(model), s[0], rate(s[1], s[2]))
                     for model, s in sorted(per_model.items(), key=lambda x: -x[1][0]))
    recent = "".join('<div class="row"><span>%s · %s</span><b>%d calls</b><em>%.1f%%</em></div>' %
                     (escape(timestamp), escape(cid[:8]), len(calls),
                      rate(sum(x[1][1] for x in calls), sum(x[1][2] for x in calls)))
                     for cid, timestamp, calls, _ in convs[:8])
    meta_refresh = '<meta http-equiv="refresh" content="%d">' % refresh if refresh else ''
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">{meta_refresh}
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Antigravity usage report</title>
    <style>body{{background:#19191f;color:#e6e6ea;font:14px/1.5 system-ui;margin:24px}}
    main{{max-width:650px;margin:auto}}section{{background:#262630;padding:16px;border-radius:10px;margin:14px 0}}
    .row{{display:grid;grid-template-columns:1fr auto 80px;gap:12px;padding:4px 0}}
    .row em{{text-align:right;font-style:normal}}.bar{{display:flex;height:7px;background:#333;border-radius:4px;overflow:hidden}}
    .bar span{{height:100%}}small{{color:#aaa}}h2{{font-size:16px}}</style></head>
    <body><main><h1>Antigravity usage report</h1>
    <p>Cache hit: {rate(uncached, cached):.1f}% · {fmt(total)} tokens (input + output)</p>
    <section><h2>Token breakdown</h2><div class="bar">{bars}</div>{legend}</section>
    <section><h2>By model</h2>{models or '<p>No model data</p>'}</section>
    <section><h2>Recent conversations</h2>{recent or '<p>No conversation data</p>'}</section>
    <small>Updated {time.strftime("%Y-%m-%d %H:%M:%S")}. Sources: local conversation databases.
    Internal formats are undocumented; not for billing or official quota verification.</small>
    </main></body></html>"""
    file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report.en.html")
    with open(file, "w", encoding="utf-8") as out:
        out.write(page)
    return file


def selftest():
    def v(n):
        out = b""
        while True:
            b = n & 0x7F; n >>= 7
            if n: out += bytes([b | 0x80])
            else: return out + bytes([b])
    def fv(f, n): return v(f << 3) + v(n)
    def fb(f, b): return v(f << 3 | 2) + v(len(b)) + b
    usage = fv(2, 3237) + fv(3, 391) + fv(5, 16228) + fv(9, 315)
    cat1 = fb(1, b"Tools") + fv(2, 2) + fv(3, 1) + fv(4, 510) + fb(5, fb(1, b"run_command") + fv(3, 510))
    f10 = fv(1, 19465) + fb(3, fb(1, cat1) + fv(2, 19465)) + fv(4, 512000)
    blob = fb(1, fb(4, usage) + fb(9, fb(10, f10)) + fb(19, b"gemini-4-neon")) + fv(2, 7)
    assert decode_call(blob) == ("gemini-4-neon", 3237, 16228, 391), decode_call(blob)
    bd = decode_breakdown(blob, 15000)
    assert bd and bd["used"] == 19465 and bd["limit"] == 512000 and bd["cats"][0]["tokens"] == 510, bd
    assert abs(rate(3237, 16228) - 83.37) < 0.01
    assert decode_call(b"\x0b") is None  # bad wire type degrades to no data
    print("selftest ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=float)
    ap.add_argument("--lang", choices=("zh-TW", "en"), default="zh-TW", help="輸出語言 / output language")
    ap.add_argument("--watch", type=int)
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--json", action="store_true", help="輸出 JSON（給 App 內的面板用，預設最近 7 天）")
    ap.add_argument("--html", action="store_true", help="產生視覺化 report.html 並開啟")
    ap.add_argument("--every", type=int, default=0, help="搭配 --html：每 N 秒更新一次（網頁自動重新整理）")
    a = ap.parse_args()
    if a.selftest:
        selftest()
    elif a.json:
        import json
        pm, convs = collect(a.days or 7)
        names = titles()
        # 子代理（有上層對話者）依「模型＋子代理名稱」分開統計：次數、未命中、快取讀取、0% 次數。
        subs = defaultdict(lambda: [0, 0, 0, 0])
        for cid, _, calls, _ in convs:
            meta = names.get(cid) or ("", "", "")
            if meta[1]:
                for _, (m, u, c, o) in calls:
                    v = subs[(m, meta[2] or "未命名")]; v[0] += 1; v[1] += u; v[2] += c; v[3] += (c == 0)
        un = sum(s[1] for s in pm.values()); cr = sum(s[2] for s in pm.values()); out = sum(s[3] for s in pm.values())
        print(json.dumps({
            "hit": round(rate(un, cr), 1), "cache": cr, "uncached": un, "output": out,
            "models": [{"name": m, "calls": s[0], "hit": round(rate(s[1], s[2]), 1), "zero": s[4],
                        "subs": [{"agent": ag, "calls": v[0], "hit": round(rate(v[1], v[2]), 1), "zero": v[3]}
                                 for (mm, ag), v in sorted(subs.items(), key=lambda x: -x[1][0]) if mm == m]}
                       for m, s in sorted(pm.items(), key=lambda x: -x[1][0])],
            "recent": [{"id": cid, "title": names.get(cid, ("",))[0], "parent": (names.get(cid) or ("", "", ""))[1],
                        "agent": (names.get(cid) or ("", "", ""))[2], "time": t,
                        "context": calls[-1][1][1] + calls[-1][1][2],
                        "hit": round(rate(sum(c[1][1] for c in calls), sum(c[1][2] for c in calls)), 1),
                        "uncached": sum(c[1][1] for c in calls), "cache": sum(c[1][2] for c in calls),
                        "zero": sum(1 for c in calls if c[1][2] == 0),
                        "calls": [[round(rate(u, c), 1), m, u, c, o] for _, (m, u, c, o) in calls[-150:]],
                        "breakdown": bd} for cid, t, calls, bd in convs[:40]],
            "updated": time.strftime("%H:%M:%S")}, ensure_ascii=False))
    elif a.html:
        path = html_report_en(a.days, a.every) if a.lang == "en" else html_report(a.days, a.every)
        os.startfile(path)
        print("已開啟", path)
        try:
            while a.every:
                time.sleep(a.every)
                (html_report_en if a.lang == "en" else html_report)(a.days, a.every)
        except KeyboardInterrupt:
            pass
    elif a.watch:
        try:
            (watch_en if a.lang == "en" else watch)(a.watch)
        except KeyboardInterrupt:
            pass
    else:
        (summary_en if a.lang == "en" else summary)(a.days)
