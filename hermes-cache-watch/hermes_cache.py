"""Hermes 快取命中率與 GPT/Codex 額度觀察工具（唯讀，只用 Python 標準函式庫）。

讀取 ~/.hermes/state.db 的 sessions 表（api_call_count、input_tokens、
cache_read_tokens、output_tokens），並沿用 codex_cache.py 讀取 ~/.codex 的
GPT 每週 / 五小時額度。只輸出統計數字、模型名稱與工作階段標題，不讀取或輸出
對話內容與憑證。

依 Hermes agent/usage_pricing.py::normalize_usage 定義，sessions.input_tokens
為「未命中快取的輸入 token」，cache_read_tokens 為「快取讀取 token」，
因此命中率 = cache_read_tokens / (input_tokens + cache_read_tokens)。

用法：
  python -I hermes_cache.py              各模型與最近 10 個對話的快取命中率
  python -I hermes_cache.py --days 7     只算最近 7 天有活動的對話
  python -I hermes_cache.py --json       輸出供 HUD 使用的 JSON
  python -I hermes_cache.py --selftest
"""
import argparse
import contextlib
import importlib.util
import json
import os
import sqlite3
import sys
import tempfile
import time
from collections import defaultdict
from pathlib import Path
from urllib.parse import quote

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HOME = os.path.expanduser("~")
HERMES_DIR = os.path.join(HOME, ".hermes")
HERMES_DB = os.path.join(HERMES_DIR, "state.db")

_CODEX_PATH = Path(__file__).resolve().parents[1] / "codex-cache-watch" / "codex_cache.py"


def _load_codex_module():
    spec = importlib.util.spec_from_file_location("codex_cache", _CODEX_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def rate(uncached, cached):
    tot = uncached + cached
    return (100.0 * cached / tot) if tot else 0.0


def _bar(hit):
    filled = round(hit / 10)
    return "█" * filled + "░" * (10 - filled)


def _ro_sqlite_uri(path):
    return f"file:{quote(os.path.abspath(path), safe='/:')}?mode=ro"


def read_codex_quota(days=30):
    """Read latest GPT/Codex weekly & 5h quota via codex_cache without duplicating logic."""
    try:
        cd = _load_codex_module()
        _, _, rl = cd.collect(days)
        return cd.format_quota(rl)
    except Exception:
        return []


def collect(days=30, db_path=None):
    """Collect read-only per-model and recent session cache stats from Hermes state.db."""
    path = db_path or HERMES_DB
    per_model = defaultdict(lambda: [0, 0, 0, 0])  # calls, uncached, cache, output
    convs = []
    if not os.path.isfile(path):
        return per_model, convs

    cutoff = time.time() - days * 86400 if days else 0.0
    try:
        con = sqlite3.connect(_ro_sqlite_uri(path), uri=True, timeout=1.0)
    except sqlite3.Error:
        return per_model, convs

    try:
        rows = con.execute(
            """
            SELECT id, title, model, parent_session_id, started_at, last_activity_at,
                   api_call_count, input_tokens, output_tokens, cache_read_tokens
            FROM sessions
            WHERE COALESCE(hidden, 0) = 0
              AND COALESCE(last_activity_at, started_at, 0) >= ?
              AND (COALESCE(input_tokens, 0) + COALESCE(cache_read_tokens, 0) + COALESCE(output_tokens, 0)) > 0
            ORDER BY COALESCE(last_activity_at, started_at, 0) DESC
            """,
            (cutoff,),
        ).fetchall()
    except sqlite3.Error:
        rows = []
    finally:
        con.close()

    for sid, title, model, parent_id, started_at, last_at, api_calls, in_tok, out_tok, cr_tok in rows:
        un = max(0, int(in_tok or 0))
        cr = max(0, int(cr_tok or 0))
        out = max(0, int(out_tok or 0))
        calls = max(0, int(api_calls or 0))
        if un + cr + out == 0:
            continue
        m_name = (model or "").strip() or "?"
        ts = last_at or started_at or 0
        t_str = time.strftime("%m-%d %H:%M", time.localtime(float(ts))) if ts else ""
        clean_title = " ".join(str(title or "").split())[:80] or str(sid)[:8]
        convs.append({
            "id": str(sid),
            "title": clean_title,
            "parent": str(parent_id or ""),
            "agent": "subagent" if parent_id else "",
            "time": t_str,
            "calls": calls,
            "hit": round(rate(un, cr), 1),
            "uncached": un,
            "cache": cr,
            "output": out,
        })
        s = per_model[m_name]
        s[0] += calls
        s[1] += un
        s[2] += cr
        s[3] += out

    return per_model, convs


def build_json(days=30, db_path=None, quota=None):
    pm, convs = collect(days=days, db_path=db_path)
    subs = defaultdict(lambda: [0, 0, 0])  # calls, uncached, cache
    for c in convs:
        if c["parent"]:
            v = subs[c["id"]]
            v[0] += c["calls"]
            v[1] += c["uncached"]
            v[2] += c["cache"]

    un = sum(s[1] for s in pm.values())
    cr = sum(s[2] for s in pm.values())
    out = sum(s[3] for s in pm.values())
    q_groups = read_codex_quota(days) if quota is None else quota
    return {
        "hit": round(rate(un, cr), 1),
        "cache": cr,
        "uncached": un,
        "output": out,
        "quota": q_groups,
        "models": [
            {
                "name": m,
                "calls": s[0],
                "hit": round(rate(s[1], s[2]), 1),
                "uncached": s[1],
                "cache": s[2],
                "output": s[3],
                "subs": [],
            }
            for m, s in sorted(pm.items(), key=lambda x: -(x[1][1] + x[1][2] + x[1][3]))
        ],
        "recent": convs[:40],
        "updated": time.strftime("%H:%M:%S"),
    }


def summary(days=30, en=False):
    d = build_json(days or 30)
    if d["quota"]:
        for g in d["quota"]:
            if en:
                b_str = " | ".join(f"{b['window']} remaining {b['remaining']}%" for b in g["buckets"])
                print(f"== Weekly / 5h quota ({g['plan']}): {b_str}\n")
            else:
                b_str = " ｜ ".join(f"{b['label']}剩餘 {b['remaining']}%（{b['reset']}）" for b in g["buckets"])
                print(f"== {g['name']} 額度 ({g['plan']})：{b_str}\n")
    if not d["models"]:
        print("No Hermes usage records found." if en else "找不到 Hermes 用量紀錄。")
        return
    hdr = "== Hermes cache hit rate by model" if en else "== Hermes 各模型快取命中率（快取讀取 ÷ 全部輸入）"
    print(hdr)
    for m in d["models"]:
        print("%-28s %6d %6.1f%%  %s" % (m["name"][:28], m["calls"], m["hit"], _bar(m["hit"])))
    print("\n== Recent sessions" if en else "\n== 最近 Hermes 對話")
    for c in d["recent"][:10]:
        print("%s  %s  %-26s %4d %5.1f%%  %s" % (
            c["time"], c["id"][:8], c["title"][:26], c["calls"], c["hit"], _bar(c["hit"])))


def selftest():
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / "hermes #test.db"
        now = time.time()
        with contextlib.closing(sqlite3.connect(db)) as con:
            con.execute(
                """CREATE TABLE sessions (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    model TEXT,
                    parent_session_id TEXT,
                    started_at REAL NOT NULL,
                    last_activity_at REAL,
                    api_call_count INTEGER DEFAULT 0,
                    input_tokens INTEGER DEFAULT 0,
                    output_tokens INTEGER DEFAULT 0,
                    cache_read_tokens INTEGER DEFAULT 0,
                    hidden INTEGER DEFAULT 0
                )"""
            )
            con.execute(
                "INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                ("s-main", "Main #1", "gpt-5.4", "", now - 60, now, 4, 200, 50, 800, 0),
            )
            con.execute(
                "INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                ("s-sub", "Sub #1", "gpt-5.4", "s-main", now - 30, now, 2, 100, 25, 100, 0),
            )
            con.execute(
                "INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                ("s-hidden", "Hidden", "gpt-5.4", "", now, now, 5, 500, 10, 0, 1),
            )
            con.commit()
        d = build_json(days=30, db_path=str(db), quota=[])
        assert d["uncached"] == 300, d
        assert d["cache"] == 900, d
        assert d["hit"] == 75.0, d
        assert len(d["recent"]) == 2, d
        assert d["models"][0]["calls"] == 6, d
    print("selftest OK")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--days", type=int, default=30)
    p.add_argument("--json", action="store_true")
    p.add_argument("--en", action="store_true")
    p.add_argument("--selftest", action="store_true")
    p.add_argument("--no-codex-quota", action="store_true")
    a = p.parse_args()
    if a.selftest:
        selftest()
    elif a.json:
        print(json.dumps(build_json(a.days, quota=[] if a.no_codex_quota else None), ensure_ascii=False))
    else:
        summary(a.days, en=a.en)
