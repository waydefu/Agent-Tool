"""ChatGPT / Codex Desktop 快取命中、模型額度與上下文結構觀察工具（唯讀，只用 Python 標準函式庫）。

讀取 ~/.codex/state_5.sqlite、thread_history_1.sqlite 與 ~/.codex/sessions/**/rollout-*.jsonl。
- 每次模型呼叫（token_usage_record）：
  input_tokens（總輸入）、cached_input_tokens（快取讀取）、output_tokens（輸出）
  未命中輸入 = input_tokens - cached_input_tokens
  命中率 = 快取讀取 / 總輸入
- 模型額度（event_msg.token_count.rate_limits）：
  primary（5 小時限額）、secondary（每週限額）
- 上下文結構細分（Context Breakdown）：
  訊息、系統工具、MCP 工具、系統提示、Skills、MCP 伺服器指示、記憶檔案、自訂代理、
  自上次更新以來、自動壓縮緩衝區、可用空間、延遲載入工具與可展開清單。

用法：
  python -I codex_cache.py              各模型與最近對話的快取命中率與上下文明細
  python -I codex_cache.py --days 30    只算最近 N 天有更新的對話（預設 30 天）
  python -I codex_cache.py --json       輸出 JSON（給 App 內的 HUD 面板用）
  python -I codex_cache.py --html       產生視覺化 report.html 並開啟
  python -I codex_cache.py --selftest   自我測試
"""
import argparse, glob, json, os, re, sqlite3, sys, time
from collections import defaultdict

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HOME = os.path.expanduser("~")
CODEX_DIR = os.path.join(HOME, ".codex")
STATE_DB = os.path.join(CODEX_DIR, "state_5.sqlite")
HIST_DB = os.path.join(CODEX_DIR, "thread_history_1.sqlite")
SESS_DIRS = [os.path.join(CODEX_DIR, "sessions"), os.path.join(CODEX_DIR, "archived_sessions")]


def rate(un, cr):
    return 100.0 * cr / (un + cr) if un + cr else 0.0


def bar(p, w=10):
    k = round(p / 100 * w)
    return "█" * k + "░" * (w - k)


def wan(n):
    return "%.1f萬" % (n / 10000) if n >= 10000 else "{:,}".format(int(n))


def clean_path(p):
    if not p:
        return ""
    return p[4:] if p.startswith("\\\\?\\") else p


def clean_title(t):
    if not t:
        return ""
    t = re.sub(r"&#x20;|&nbsp;", " ", t).strip()
    first = next((line.strip() for line in t.splitlines() if line.strip()), "")
    first = re.sub(r"^#+\s*", "", first)
    return first[:48]


def default_host_lists():
    """從本機 ~/.codex 掃描預設的 Skills、記憶檔案與自訂代理清單（當 rollout 已被清理時作備援）。"""
    skills = []
    for pat in (os.path.join(CODEX_DIR, "skills", "**", "SKILL.md"),
                os.path.join(CODEX_DIR, "plugins", "**", "SKILL.md")):
        for p in glob.glob(pat, recursive=True):
            name = os.path.basename(os.path.dirname(p))
            if name and name not in skills:
                skills.append(name)
    mems = []
    mem_md = os.path.join(CODEX_DIR, "memories", "MEMORY.md")
    if os.path.exists(mem_md):
        try:
            with open(mem_md, "r", encoding="utf-8", errors="replace") as f:
                for h in re.findall(r"^#+\s+([^\r\n]+)", f.read(), re.M):
                    if h not in mems:
                        mems.append(h)
        except OSError:
            pass
    return skills, mems


def parse_rollout(path, default_model="unknown"):
    """解析單一 rollout-*.jsonl，回傳 (calls, breakdown, rate_limits, rate_ts)。
    calls: [(idx, (model, uncached, cache_read, output, total_input))]
    """
    cats = {
        "訊息": 0,
        "系統工具": 0,
        "MCP 工具": 0,
        "系統提示": 0,
        "Skills": 0,
        "MCP 伺服器指示": 0,
        "記憶檔案": 0,
        "自訂代理": 0,
    }
    sys_tools, mcp_tools, deferred_mcp = [], [], []
    deferred_mcp_chars = 0
    skills_list, mem_list, agents_list = [], [], []
    ctx_window = 475000
    calls = []
    cur_model = default_model or "unknown"
    last_input = 0
    prev_turn_end_input = 0
    cur_turn_id = None
    cur_turn_last_input = 0
    rate_limits = None
    rate_ts = 0

    try:
        fh = open(path, "r", encoding="utf-8", errors="replace")
    except OSError:
        return [], None, None, 0

    with fh:
        for idx, line in enumerate(fh, 1):
            try:
                d = json.loads(line)
            except ValueError:
                continue
            t = d.get("type")
            p = d.get("payload")
            if not isinstance(p, dict):
                continue

            if t == "turn_context":
                if p.get("model"):
                    cur_model = p["model"]
            elif t == "event_msg":
                pt = p.get("type")
                if pt == "thread_settings_applied":
                    m = (p.get("thread_settings") or {}).get("model")
                    if m:
                        cur_model = m
                elif pt == "task_started" and p.get("model_context_window"):
                    ctx_window = p["model_context_window"]
                elif pt == "token_count":
                    w = (p.get("info") or {}).get("model_context_window")
                    if w:
                        ctx_window = w
                    if p.get("rate_limits"):
                        rate_limits = p["rate_limits"]
                        rate_ts = os.path.getmtime(path)
            elif t == "token_usage_record":
                u = p.get("usage") or {}
                inp = int(u.get("input_tokens") or 0)
                cr = int(u.get("cached_input_tokens") or 0)
                out = int(u.get("output_tokens") or 0)
                un = max(0, inp - cr)
                if inp + out > 0:
                    tid = p.get("turn_id")
                    if tid != cur_turn_id:
                        if cur_turn_last_input > 0:
                            prev_turn_end_input = cur_turn_last_input
                        cur_turn_id = tid
                    cur_turn_last_input = inp
                    last_input = inp
                    calls.append((len(calls) + 1, (cur_model, un, cr, out, inp)))
            elif t == "world_state":
                ws = p.get("state") or {}
                if isinstance(ws.get("tools"), dict):
                    for k, desc in ws["tools"].items():
                        if k not in deferred_mcp:
                            deferred_mcp.append(k)
                        deferred_mcp_chars += len(k) + len(str(desc)) * 12
                hs = (ws.get("host_skills") or {}).get("entries")
                if isinstance(hs, dict):
                    for k in hs.keys():
                        try:
                            sp = json.loads(k)[-1] if k.startswith("[") else k
                        except ValueError:
                            sp = k
                        name = os.path.basename(os.path.dirname(sp)) if sp.endswith(".md") else os.path.basename(sp)
                        if name and name not in skills_list:
                            skills_list.append(name)
                ag = ws.get("agents_md")
                if isinstance(ag, dict):
                    for k in ag.keys():
                        if k and k not in agents_list:
                            agents_list.append(k)
            elif t == "response_item":
                pt = p.get("type")
                role = p.get("role")
                if pt == "additional_tools":
                    for ns in p.get("tools") or []:
                        raw = json.dumps(ns, ensure_ascii=False)
                        ns_name = str(ns.get("name") or "")
                        sub = [f"{ns_name}.{st.get('name', '')}" for st in (ns.get("tools") or []) if isinstance(st, dict)]
                        if ns_name.startswith("mcp__"):
                            cats["MCP 工具"] += len(raw)
                            for s in sub or [ns_name]:
                                if s not in mcp_tools:
                                    mcp_tools.append(s)
                        else:
                            cats["系統工具"] += len(raw)
                            for s in sub or [ns_name]:
                                if s not in sys_tools:
                                    sys_tools.append(s)
                elif pt == "message" and role == "developer":
                    txt = "".join(c.get("text", "") for c in (p.get("content") or []) if isinstance(c, dict))
                    if "<app-context>" in txt or "<skills_instructions>" in txt:
                        m_sk = re.search(r"<skills_instructions>(.*?)</skills_instructions>", txt, re.S)
                        m_tl = re.search(r"<tools>(.*?)</tools>", txt, re.S)
                        m_mem = re.search(r"# Memory\b(.*?)(?=# Skills\b|<skills_instructions>|<collaboration_mode>|\Z)", txt, re.S)
                        sk_c = len(m_sk.group(0)) if m_sk else 0
                        tl_c = len(m_tl.group(0)) if m_tl else 0
                        mem_c = len(m_mem.group(0)) if m_mem else 0
                        if m_mem:
                            for h in re.findall(r"^#+\s+([^\r\n]+)", m_mem.group(1), re.M):
                                h = h.strip()
                                if h and h not in mem_list:
                                    mem_list.append(h)
                        cats["Skills"] += sk_c
                        cats["MCP 伺服器指示"] += tl_c
                        cats["記憶檔案"] += mem_c
                        cats["系統提示"] += max(0, len(txt) - sk_c - tl_c - mem_c)
                    elif "<multi_agent" in txt or "AGENTS.md" in txt:
                        cats["自訂代理"] += len(txt)
                        if "`/root`" in txt and "/root (主控代理)" not in agents_list:
                            agents_list.append("/root (主控代理)")
                    else:
                        cats["系統提示"] += len(txt)
                else:
                    cats["訊息"] += len(json.dumps(p, ensure_ascii=False))

    if not calls:
        return [], None, rate_limits, rate_ts

    # 將固定系統提示/工具以實際約 3.8 字元/token 換算，剩餘歸入對話訊息（含推理與工具輸出），確保總和精確等於最後一次呼叫的 input_tokens
    non_msg_keys = ["系統工具", "MCP 工具", "系統提示", "Skills", "MCP 伺服器指示", "記憶檔案", "自訂代理"]
    tok_cats = {}
    non_msg_sum = 0
    for k in non_msg_keys:
        v = round(cats[k] / 3.8)
        tok_cats[k] = v
        non_msg_sum += v
    if non_msg_sum > last_input * 0.85 and non_msg_sum > 0:
        scale = (last_input * 0.85) / non_msg_sum
        non_msg_sum = 0
        for k in non_msg_keys:
            tok_cats[k] = round(tok_cats[k] * scale)
            non_msg_sum += tok_cats[k]
    tok_cats["訊息"] = max(0, last_input - non_msg_sum)

    since_last = max(0, last_input - prev_turn_end_input) if prev_turn_end_input else last_input
    buffer_tok = round(ctx_window * 0.08)
    avail_tok = max(0, ctx_window - last_input - buffer_tok)

    all_mcp = [f"{k}（延遲載入）" for k in deferred_mcp] + mcp_tools
    breakdown = {
        "used": last_input,
        "limit": ctx_window,
        "used_pct": round(100.0 * last_input / ctx_window, 1) if ctx_window else 0.0,
        "threshold": ctx_window,
        "cats": [
            {"name": "訊息", "tokens": tok_cats["訊息"], "color": "#2f81f7"},
            {"name": "系統工具", "tokens": tok_cats["系統工具"], "color": "#f0883e"},
            {"name": "MCP 工具", "tokens": tok_cats["MCP 工具"], "color": "#2ea39b"},
            {"name": "系統提示", "tokens": tok_cats["系統提示"], "color": "#8b8b94"},
            {"name": "Skills", "tokens": tok_cats["Skills"], "color": "#7d7d86"},
            {"name": "MCP 伺服器指示", "tokens": tok_cats["MCP 伺服器指示"], "color": "#6e6e77"},
            {"name": "記憶檔案", "tokens": tok_cats["記憶檔案"], "color": "#5f5f68"},
            {"name": "自訂代理", "tokens": tok_cats["自訂代理"], "color": "#505059"},
        ],
        "since_last": since_last,
        "buffer": buffer_tok,
        "available": avail_tok,
        "deferred_mcp": round(deferred_mcp_chars / 3.8) or (len(deferred_mcp) * 950),
        "deferred_sys": len(sys_tools) * 420,
        "lists": {
            "MCP 工具": all_mcp,
            "系統工具": sys_tools,
            "Skills": skills_list,
            "記憶檔案": mem_list,
            "自訂代理": agents_list or ["/root (主控代理)"],
        },
        "exact": False,
        "source": "rollout",
    }
    return calls, breakdown, rate_limits, rate_ts


def estimate_from_sqlite(cid, model, tokens_used, hist_con, host_skills, host_mems, child_agents):
    """當舊對話的 rollout-*.jsonl 已不在磁碟時，從 state_5.sqlite 的 tokens_used 與 thread_history_1.sqlite 推算。"""
    if not tokens_used or tokens_used <= 0:
        return [], None
    turns = 1
    item_bytes = 0
    mcp_calls = 0
    if hist_con:
        try:
            t_cnt = hist_con.execute("select count(*) from thread_turns where thread_id=?", (cid,)).fetchone()[0]
            if t_cnt > 0:
                turns = t_cnt
            rows = hist_con.execute(
                "select item_type, count(*), sum(length(item_json)) from thread_items where thread_id=? group by item_type",
                (cid,),
            ).fetchall()
            for itype, cnt, b in rows:
                item_bytes += (b or 0)
                if itype == "mcpToolCall":
                    mcp_calls += cnt
        except sqlite3.Error:
            pass

    # 依呼叫步數還原每次呼叫的快取讀取與未命中輸入（首輪未命中約 2.2 萬基礎提示，後續快取命中約 88%~96%）
    n_calls = max(turns * 3, min(120, max(1, round(tokens_used / 45000))))
    base_prompt = min(24000, max(4000, round(tokens_used / n_calls * 0.45)))
    calls = []
    rem = tokens_used
    avg_step = tokens_used / n_calls
    for i in range(n_calls):
        inp = round(avg_step * (0.65 + 0.7 * (i / max(1, n_calls - 1))))
        out = max(120, round(inp * 0.015))
        if i == 0:
            cr = round(inp * 0.42)
        else:
            cr = round(inp * min(0.96, 0.84 + 0.11 * (i / n_calls)))
        un = max(0, inp - cr)
        calls.append((i + 1, (model or "unknown", un, cr, out, inp)))

    ctx_window = 475000
    last_input = min(ctx_window - 20000, max(base_prompt + round(item_bytes / 4.2), calls[-1][1][4]))
    sys_tool_tok = min(9000, round(last_input * 0.04))
    mcp_tool_tok = min(4500, round(last_input * (0.02 if mcp_calls else 0.006)))
    sys_prompt_tok = min(6500, round(last_input * 0.03))
    skill_tok = min(10000, round(last_input * 0.035))
    mcp_inst_tok = min(1500, round(last_input * 0.004))
    mem_tok = min(4200, round(last_input * 0.015))
    agent_tok = min(3500, round(last_input * 0.01))
    fixed_sum = sys_tool_tok + mcp_tool_tok + sys_prompt_tok + skill_tok + mcp_inst_tok + mem_tok + agent_tok
    msg_tok = max(0, last_input - fixed_sum)
    since_last = round(last_input / max(1, turns))
    buffer_tok = round(ctx_window * 0.08)
    avail_tok = max(0, ctx_window - last_input - buffer_tok)

    breakdown = {
        "used": last_input,
        "limit": ctx_window,
        "used_pct": round(100.0 * last_input / ctx_window, 1),
        "threshold": ctx_window,
        "cats": [
            {"name": "訊息", "tokens": msg_tok, "color": "#2f81f7"},
            {"name": "系統工具", "tokens": sys_tool_tok, "color": "#f0883e"},
            {"name": "MCP 工具", "tokens": mcp_tool_tok, "color": "#2ea39b"},
            {"name": "系統提示", "tokens": sys_prompt_tok, "color": "#8b8b94"},
            {"name": "Skills", "tokens": skill_tok, "color": "#7d7d86"},
            {"name": "MCP 伺服器指示", "tokens": mcp_inst_tok, "color": "#6e6e77"},
            {"name": "記憶檔案", "tokens": mem_tok, "color": "#5f5f68"},
            {"name": "自訂代理", "tokens": agent_tok, "color": "#505059"},
        ],
        "since_last": since_last,
        "buffer": buffer_tok,
        "available": avail_tok,
        "deferred_mcp": 26500,
        "deferred_sys": 5040,
        "lists": {
            "MCP 工具": ["mcp__codex_app（延遲載入）", "mcp__cua_repl.js"],
            "系統工具": ["functions.exec", "functions.wait", "collaboration.spawn_agent", "collaboration.send_message"],
            "Skills": host_skills[:50],
            "記憶檔案": host_mems,
            "自訂代理": child_agents or ["/root (主控代理)"],
        },
        "exact": False,
        "source": "sqlite_estimate",
    }
    return calls, breakdown


def collect(days=30):
    per_model = defaultdict(lambda: [0, 0, 0, 0, 0])  # calls, uncached, cache, output, zero-hit
    convs = []
    latest_quota = None
    latest_quota_ts = -1
    host_skills, host_mems = default_host_lists()

    if not os.path.exists(STATE_DB):
        return per_model, convs, None

    con = sqlite3.connect("file:%s?mode=ro" % STATE_DB.replace("\\", "/"), uri=True, timeout=1.0)
    hist_con = None
    if os.path.exists(HIST_DB):
        try:
            hist_con = sqlite3.connect("file:%s?mode=ro" % HIST_DB.replace("\\", "/"), uri=True, timeout=1.0)
        except sqlite3.Error:
            hist_con = None

    try:
        edges = {}
        children_map = defaultdict(list)
        try:
            for p_id, c_id in con.execute("select parent_thread_id, child_thread_id from thread_spawn_edges"):
                edges[c_id] = p_id
        except sqlite3.Error:
            pass

        cut_ms = (time.time() - days * 86400) * 1000 if days else 0
        rows = con.execute(
            """
            select id, title, model, tokens_used, updated_at_ms, rollout_path,
                   agent_nickname, agent_role, attached_thread_parent_id, source
            from threads
            where updated_at_ms >= ?
            order by updated_at_ms desc
            limit 40
            """,
            (cut_ms,),
        ).fetchall()
        for r in rows:
            cid, _, _, _, _, _, nick, role, att_p, src = r
            p_id = att_p or edges.get(cid) or ""
            if not p_id and src and "parent_thread_id" in src:
                try:
                    p_id = json.loads(src).get("subagent", {}).get("thread_spawn", {}).get("parent_thread_id", "")
                except ValueError:
                    pass
            if p_id and (nick or role):
                children_map[p_id].append(f"{nick or ''} ({role or 'subagent'})".strip())

        for r in rows:
            cid, title, model, tok_used, upd_ms, rp, nick, role, att_p, src = r
            parent = att_p or edges.get(cid) or ""
            agent = nick or role or ""
            if src and "thread_spawn" in src:
                try:
                    sp = json.loads(src).get("subagent", {}).get("thread_spawn", {})
                    parent = parent or sp.get("parent_thread_id") or ""
                    agent = agent or sp.get("agent_nickname") or sp.get("agent_role") or ""
                    if not title and sp.get("agent_path"):
                        title = sp.get("agent_path")
                except ValueError:
                    pass

            rp_clean = clean_path(rp)
            calls, breakdown = [], None
            estimated = False
            if rp_clean and os.path.exists(rp_clean):
                calls, breakdown, rl, rts = parse_rollout(rp_clean, model)
                if rl and rts > latest_quota_ts:
                    latest_quota = rl
                    latest_quota_ts = rts
            if not calls and tok_used:
                calls, breakdown = estimate_from_sqlite(
                    cid, model, tok_used, hist_con, host_skills, host_mems, children_map.get(cid)
                )
                estimated = bool(calls)
            if not calls:
                continue

            if breakdown and children_map.get(cid):
                for ca in children_map[cid]:
                    if ca not in breakdown["lists"]["自訂代理"]:
                        breakdown["lists"]["自訂代理"].append(ca)

            t_str = time.strftime("%m-%d %H:%M", time.localtime((upd_ms or 0) / 1000)) if upd_ms else ""
            convs.append({
                "id": cid,
                "title": clean_title(title) or cid[:8],
                "parent": parent,
                "agent": agent,
                "time": t_str,
                "calls": calls,
                "breakdown": breakdown,
                "estimated": estimated,
            })
            # 推估的呼叫與快取命中不得混入真實量測的全域與模型統計。
            if estimated:
                continue
            for _, (m, u, c, o, _) in calls:
                s = per_model[m]
                s[0] += 1
                s[1] += u
                s[2] += c
                s[3] += o
                s[4] += (c == 0)
    finally:
        con.close()
        if hist_con:
            hist_con.close()

    # 若最近的 rollout 還沒掃到 rate_limits，再掃描 sessions 目錄下的 jsonl
    if not latest_quota:
        for sd in SESS_DIRS:
            for jf in glob.glob(os.path.join(sd, "**", "rollout-*.jsonl"), recursive=True):
                _, _, rl, rts = parse_rollout(jf)
                if rl and rts > latest_quota_ts:
                    latest_quota = rl
                    latest_quota_ts = rts

    return per_model, convs, latest_quota


def format_quota(rl):
    if not rl:
        return []
    buckets = []
    for key, label, win in (("primary", "5h", "五小時"), ("secondary", "week", "每週")):
        b = rl.get(key)
        if not isinstance(b, dict):
            continue
        if b.get("used_percent") is None:
            continue  # Unknown is not the same as 0% used.
        try:
            used = float(b["used_percent"])
        except (TypeError, ValueError):
            continue
        if not (0 <= used <= 100):
            continue
        rem = max(0, min(100, round(100.0 - used)))
        rst = b.get("resets_at")
        rst_str = time.strftime("%m/%d %H:%M", time.localtime(rst)) + " 重置" if rst else ""
        buckets.append({
            "window": label,
            "label": win,
            "remaining": rem,
            "used": round(used, 1),
            "reset": rst_str,
        })
    return [{"name": "Codex / GPT", "plan": rl.get("plan_type") or "unknown", "buckets": buckets}]


def build_json(days=30):
    pm, convs, rl = collect(days)
    subs = defaultdict(lambda: [0, 0, 0, 0])
    for c in convs:
        if c.get("estimated"):
            continue
        if c["parent"] or c["agent"]:
            ag = c["agent"] or "子代理"
            for _, (m, u, cr, o, _) in c["calls"]:
                v = subs[(m, ag)]
                v[0] += 1
                v[1] += u
                v[2] += cr
                v[3] += (cr == 0)

    un = sum(s[1] for s in pm.values())
    cr = sum(s[2] for s in pm.values())
    out = sum(s[3] for s in pm.values())
    return {
        "hit": round(rate(un, cr), 1),
        "cache": cr,
        "uncached": un,
        "output": out,
        "quota": format_quota(rl),
        "models": [
            {
                "name": m,
                "calls": s[0],
                "hit": round(rate(s[1], s[2]), 1),
                "zero": s[4],
                "subs": [
                    {"agent": ag, "calls": v[0], "hit": round(rate(v[1], v[2]), 1), "zero": v[3]}
                    for (mm, ag), v in sorted(subs.items(), key=lambda x: -x[1][0])
                    if mm == m
                ],
            }
            for m, s in sorted(pm.items(), key=lambda x: -x[1][0])
        ],
        "recent": [
            {
                "id": c["id"],
                "title": c["title"],
                "estimated": c.get("estimated", False),
                "parent": c["parent"],
                "agent": c["agent"],
                "time": c["time"],
                "context": c["calls"][-1][1][4],
                "hit": round(rate(sum(x[1][1] for x in c["calls"]), sum(x[1][2] for x in c["calls"])), 1),
                "uncached": sum(x[1][1] for x in c["calls"]),
                "cache": sum(x[1][2] for x in c["calls"]),
                "zero": sum(1 for x in c["calls"] if x[1][2] == 0),
                "calls": [[round(rate(u, cr_i), 1), m, u, cr_i, o] for _, (m, u, cr_i, o, _) in c["calls"][-150:]],
                "breakdown": c["breakdown"],
            }
            for c in convs[:40]
        ],
        "updated": time.strftime("%H:%M:%S"),
    }


def summary(days):
    d = build_json(days or 30)
    if d["quota"]:
        for g in d["quota"]:
            b_str = " ｜ ".join(f"{b['label']}剩餘 {b['remaining']}%（{b['reset']}）" for b in g["buckets"])
            print(f"== {g['name']} 額度 ({g['plan']})：{b_str}\n")
    if not d["models"]:
        print("找不到可驗證的真實用量紀錄；歷史推估資料不計入命中率統計。")
        return
    print("== 各模型快取命中率（命中率 = 快取讀取 ÷ 全部輸入）")
    print("%-24s %6s %8s %10s" % ("模型", "呼叫", "命中率", "0%次數"))
    for m in d["models"]:
        print("%-24s %6d %6.1f%% %8d  %s" % (m["name"][:24], m["calls"], m["hit"], m["zero"], bar(m["hit"])))
        for s in m["subs"]:
            print("  └ 子代理 %-14s %6d %6.1f%% %8d" % (s["agent"][:14], s["calls"], s["hit"], s["zero"]))
    if d["recent"] and d["recent"][0].get("breakdown"):
        b = d["recent"][0]["breakdown"]
        print(f"\n== 最新對話上下文結構：{d['recent'][0]['title']}（已使用 {b['used_pct']}%｜{wan(b['used'])} / {wan(b['limit'])}）")
        for c in b["cats"]:
            pct = 100.0 * c["tokens"] / b["limit"] if b["limit"] else 0
            print("  %-14s %10s  %5.1f%%" % (c["name"], wan(c["tokens"]), pct))
        print("  %-14s %10s  %5.1f%%" % ("自上次更新以來", wan(b["since_last"]), 100.0 * b["since_last"] / b["limit"]))
        print("  %-14s %10s  %5.1f%%" % ("自動壓縮緩衝區", wan(b["buffer"]), 100.0 * b["buffer"] / b["limit"]))
        print("  %-14s %10s  %5.1f%%" % ("可用空間", wan(b["available"]), 100.0 * b["available"] / b["limit"]))
    print("\n== 最近對話")
    for c in d["recent"][:10]:
        print("%s  %s  %-26s %4d 次呼叫  %5.1f%%  %s" % (
            c["time"], c["id"][:8], c["title"][:26], len(c["calls"]), c["hit"], bar(c["hit"])))


def html_report(days, refresh):
    import html as H
    d = build_json(days or 30)
    tot = d["cache"] + d["uncached"] + d["output"] or 1
    cur = d["recent"][0] if d["recent"] else None
    bd_html = ""
    if cur and cur.get("breakdown"):
        b = cur["breakdown"]
        lim = b["limit"] or 1
        b_segs = "".join(
            '<span style="width:%.2f%%;background:%s"></span>' % (100.0 * c["tokens"] / lim, c["color"])
            for c in b["cats"]
        ) + '<span style="width:%.2f%%;background:#444"></span>' % (100.0 * b["buffer"] / lim)
        b_rows = "".join(
            '<div class="row"><i style="background:%s"></i><span>%s</span><b>%s</b><em>%.1f%%</em></div>'
            % (c["color"], H.escape(c["name"]), wan(c["tokens"]), 100.0 * c["tokens"] / lim)
            for c in b["cats"]
        )
        b_rows += (
            '<div class="row"><i style="background:#6e6e77"></i><span>自上次更新以來</span><b>%s</b><em>%.1f%%</em></div>'
            '<div class="row"><i style="background:#55555e"></i><span>自動壓縮緩衝區</span><b>%s</b><em>%.1f%%</em></div>'
            '<div class="row"><i style="background:#2d2d35"></i><span>可用空間</span><b>%s</b><em>%.1f%%</em></div>'
            '<div class="row" style="margin-top:6px"><i style="background:#55555e"></i><span>MCP 工具（延遲載入）</span><b>%s</b><em>—</em></div>'
            '<div class="row"><i style="background:#55555e"></i><span>系統工具（延遲載入）</span><b>%s</b><em>—</em></div>'
        ) % (
            wan(b["since_last"]), 100.0 * b["since_last"] / lim,
            wan(b["buffer"]), 100.0 * b["buffer"] / lim,
            wan(b["available"]), 100.0 * b["available"] / lim,
            wan(b["deferred_mcp"]), wan(b["deferred_sys"]),
        )
        bd_html = f"""
        <h2>目前對話上下文：已使用 {b['used_pct']}%（{wan(b['used'])} / {wan(b['limit'])}）</h2>
        <div class="bar">{b_segs}</div>{b_rows}
        """

    page = f"""<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><title>ChatGPT / Codex 快取與上下文明細</title>
    {'<meta http-equiv="refresh" content="%d">' % refresh if refresh else ''}
    <style>
    body{{margin:0;background:#16161a;color:#e6e6e6;font:14px/1.5 system-ui,"Microsoft JhengHei",sans-serif}}
    .panel{{max-width:480px;margin:24px auto;padding:18px 20px;background:#202026;border:1px solid #32323c;border-radius:12px}}
    h1{{font-size:15px;margin:0 0 8px;display:flex;justify-content:space-between}}h1 small{{color:#9a9aa3;font-weight:400}}
    h2{{font-size:13px;color:#9a9aa3;font-weight:500;margin:18px 0 6px}}
    .bar{{display:flex;height:6px;border-radius:3px;overflow:hidden;background:#2d2d35;margin-bottom:10px}}.bar span{{display:block}}
    .row{{display:grid;grid-template-columns:14px 1fr auto 60px;gap:8px;align-items:center;padding:3px 0}}
    .row i{{width:10px;height:10px;border-radius:2px}}.row b{{font-weight:400}}.row em{{font-style:normal;text-align:right;color:#c9c9cf}}
    .note{{color:#8b8b94;font-size:12px;margin-top:14px}}
    </style></head><body><div class="panel">
    <h1>Codex 快取命中 {d['hit']}%<small>{wan(tot)} token</small></h1>
    {bd_html}
    <div class="note">更新時間 {d['updated']}。資料來自本機 ~/.codex，唯讀。</div>
    </div></body></html>"""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report.html")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(page)
    return path



def category_en(name):
    return {
        "訊息": "Messages", "系統工具": "Built-in tools", "MCP 工具": "MCP tools",
        "系統提示": "System prompt", "Skills": "Skills",
        "MCP 伺服器指示": "MCP server instructions",
        "記憶檔案": "Memory files", "自訂代理": "Custom agents",
    }.get(name, name)


def summary_en(days):
    """Print English statistics without mixing SQLite estimates into measured totals."""
    d = build_json(days or 30)
    for group in d["quota"]:
        buckets = " | ".join(
            "%s remaining %s%% (%s)" %
            ("5-hour" if b["window"] == "5h" else "weekly", b["remaining"], b["reset"])
            for b in group["buckets"]
        )
        print("== %s quota (%s): %s" % (group["name"], group["plan"], buckets))
    if not d["models"]:
        print("No measured usage data found. Historical SQLite-only estimates are excluded from measured totals.")
    else:
        print("== Cache hit rate by model (cached input / total input)")
        print("%-24s %6s %10s %12s" % ("Model", "Calls", "Hit rate", "0% calls"))
        for m in d["models"]:
            print("%-24s %6d %9.1f%% %12d %s" %
                  (m["name"][:24], m["calls"], m["hit"], m["zero"], bar(m["hit"])))
            for sub in m["subs"]:
                print("  └ Subagent %-14s %6d %9.1f%%" %
                      (sub["agent"][:14], sub["calls"], sub["hit"]))
    if d["recent"] and d["recent"][0].get("breakdown"):
        current = d["recent"][0]
        bd = current["breakdown"]
        source = "measured input, estimated categories" if bd.get("source") == "rollout" else "historical estimate only"
        print("\n== Latest context: %s (%.1f%% used, %s / %s; %s)" % (
            current["title"], bd["used_pct"], "{:,}".format(bd["used"]),
            "{:,}".format(bd["limit"]), source))
        for c in bd["cats"]:
            print("  %-25s %12s" % (category_en(c["name"]), "{:,}".format(c["tokens"])))
        print("  %-25s %12s" % ("Available", "{:,}".format(bd["available"])))
    print("\n== Recent conversations")
    for c in d["recent"][:10]:
        marker = " [estimated]" if c.get("estimated") else ""
        print("%s %s %s%s | %d calls | %.1f%%" %
              (c["time"], c["id"][:8], c["title"][:45], marker,
               len(c["calls"]), c["hit"]))


def html_report_en(days, refresh):
    """Generate a standalone English HTML report; escape user-controlled conversation titles."""
    import html as H
    d = build_json(days or 30)
    total = d["cache"] + d["uncached"] + d["output"] or 1
    vals = (("Cached input", d["cache"], "#2f81f7"),
            ("Uncached input", d["uncached"], "#f0883e"),
            ("Output", d["output"], "#2ea39b"))
    fmt = lambda n: "{:,}".format(n)
    rows = "".join(
        '<div class="row"><span>%s</span><b>%s</b><em>%.1f%%</em></div>' %
        (label, fmt(value), 100 * value / total) for label, value, _ in vals
    )
    bars = "".join('<span style="width:%.2f%%;background:%s"></span>' %
                   (100 * value / total, color) for _, value, color in vals)
    models = "".join(
        '<div class="row"><span>%s</span><b>%d calls</b><em>%.1f%%</em></div>' %
        (H.escape(m["name"]), m["calls"], m["hit"]) for m in d["models"]
    )
    convs = "".join(
        '<div class="row"><span>%s%s</span><b>%d calls</b><em>%.1f%%</em></div>' %
        (H.escape(c["title"]), " (estimated)" if c.get("estimated") else "",
         len(c["calls"]), c["hit"]) for c in d["recent"][:10]
    )
    meta_refresh = '<meta http-equiv="refresh" content="%d">' % refresh if refresh else ''
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">{meta_refresh}
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>Codex usage report</title>
    <style>body{{background:#19191f;color:#e6e6ea;font:14px/1.5 system-ui;margin:24px}}
    main{{max-width:650px;margin:auto}}section{{background:#262630;padding:16px;border-radius:10px;margin:14px 0}}
    .row{{display:grid;grid-template-columns:1fr auto 80px;gap:12px;padding:4px 0;overflow-wrap:anywhere}}
    .row em{{text-align:right;font-style:normal}}.bar{{display:flex;height:7px;background:#333;border-radius:4px;overflow:hidden}}
    .bar span{{height:100%}}small{{color:#aaa}}h2{{font-size:16px}}</style></head>
    <body><main><h1>Codex usage report</h1>
    <p>Measured cache hit: {d['hit']:.1f}% · {fmt(total)} tokens (input + output)</p>
    <section><h2>Measured token breakdown</h2><div class="bar">{bars}</div>{rows}</section>
    <section><h2>By model</h2>{models or '<p>No measured model data</p>'}</section>
    <section><h2>Recent conversations</h2>{convs or '<p>No conversation data</p>'}</section>
    <small>Updated {H.escape(d['updated'])}. Local usage data only.
    Historical SQLite-only rows are estimated and excluded from measured model totals.
    Even with rollout logs, context category allocation is an approximation; not for billing.</small>
    </main></body></html>"""
    file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "report.en.html")
    with open(file, "w", encoding="utf-8") as out:
        out.write(page)
    return file


def selftest():
    assert abs(rate(3237, 16228) - 83.37) < 0.01
    assert wan(205680) == "20.6萬"
    assert clean_title("&#x20;RTK 1.2.0 OSS本機適合裝嗎\n") == "RTK 1.2.0 OSS本機適合裝嗎"
    d = build_json(30)
    assert "hit" in d and "models" in d and "recent" in d and "quota" in d
    if d["recent"]:
        assert "breakdown" in d["recent"][0]
    print("selftest ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=float, default=30)
    ap.add_argument("--lang", choices=("zh-TW", "en"), default="zh-TW", help="輸出語言 / output language")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--html", action="store_true")
    ap.add_argument("--every", type=int, default=0)
    a = ap.parse_args()
    if a.selftest:
        selftest()
    elif a.json:
        print(json.dumps(build_json(a.days), ensure_ascii=False))
    elif a.html:
        p = html_report_en(a.days, a.every) if a.lang == "en" else html_report(a.days, a.every)
        os.startfile(p)
        print("已開啟", p)
    else:
        (summary_en if a.lang == "en" else summary)(a.days)
