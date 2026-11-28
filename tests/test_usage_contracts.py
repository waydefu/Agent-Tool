"""以合成資料測試核心契約，不讀取任何真實工作階段。"""
import importlib.util
import json
import os
import subprocess
import sys
import sqlite3
from contextlib import closing
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def module_from(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ag = module_from("agy-cache-watch/agy_cache.py", "agy_cache")
cd = module_from("codex-cache-watch/codex_cache.py", "codex_cache")
hm = module_from("hermes-cache-watch/hermes_cache.py", "hermes_cache")


class UsageContractTests(unittest.TestCase):
    def test_rates(self):
        self.assertAlmostEqual(ag.rate(60, 40), 40)
        self.assertAlmostEqual(cd.rate(60, 40), 40)
        self.assertEqual(cd.rate(0, 0), 0)

    def test_rollout_is_measured_but_breakdown_is_estimated(self):
        with tempfile.TemporaryDirectory() as tmp:
            rollout = Path(tmp, "rollout-fixture.jsonl")
            rollout.write_text(json.dumps({
                "type": "token_usage_record",
                "payload": {
                    "turn_id": "turn-1",
                    "usage": {"input_tokens": 100, "cached_input_tokens": 40, "output_tokens": 10}
                }
            }) + "\n", encoding="utf-8")
            calls, breakdown, _, _ = cd.parse_rollout(str(rollout))
            self.assertEqual(calls[0][1][1:4], (60, 40, 10))
            self.assertEqual(breakdown["used"], 100)
            self.assertFalse(breakdown["exact"])
            self.assertEqual(breakdown["source"], "rollout")

    def test_sqlite_fallback_stays_out_of_measured_totals(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            state = tmp_path / "state_5.sqlite"
            rollout = tmp_path / "rollout-real.jsonl"
            rollout.write_text(json.dumps({
                "type": "token_usage_record",
                "payload": {"turn_id": "turn-1", "usage": {
                    "input_tokens": 100, "cached_input_tokens": 40, "output_tokens": 10}}
            }) + "\n", encoding="utf-8")
            with closing(sqlite3.connect(state)) as con:
                con.execute("""CREATE TABLE threads (
                    id TEXT, title TEXT, model TEXT, tokens_used INTEGER,
                    updated_at_ms INTEGER, rollout_path TEXT,
                    agent_nickname TEXT, agent_role TEXT,
                    attached_thread_parent_id TEXT, source TEXT
                )""")
                now = int(time.time() * 1000)
                con.execute("INSERT INTO threads VALUES (?,?,?,?,?,?,?,?,?,?)",
                            ("real", "測試真實紀錄", "gpt-test", 100, now, str(rollout),
                             "", "", "", ""))
                con.execute("INSERT INTO threads VALUES (?,?,?,?,?,?,?,?,?,?)",
                            ("estimated", "歷史推估", "gpt-test", 250000, now, "",
                             "", "", "", ""))
                con.commit()
            original = (cd.CODEX_DIR, cd.STATE_DB, cd.HIST_DB, cd.SESS_DIRS)
            try:
                cd.CODEX_DIR = tmp
                cd.STATE_DB = str(state)
                cd.HIST_DB = str(tmp_path / "missing.sqlite")
                cd.SESS_DIRS = [str(tmp_path / "missing-sessions")]
                per_model, convs, _ = cd.collect()
                self.assertEqual(per_model["gpt-test"][0], 1)
                self.assertEqual(per_model["gpt-test"][1:4], [60, 40, 10])
                self.assertEqual(len(convs), 2)
                by_id = {x["id"]: x for x in convs}
                self.assertFalse(by_id["real"]["estimated"])
                self.assertTrue(by_id["estimated"]["estimated"])
                self.assertEqual(by_id["estimated"]["breakdown"]["source"], "sqlite_estimate")
            finally:
                cd.CODEX_DIR, cd.STATE_DB, cd.HIST_DB, cd.SESS_DIRS = original


    def test_hermes_json_can_skip_codex_session_scan(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            hermes = root / 'hermes-cache-watch'
            codex = root / 'codex-cache-watch'
            hermes.mkdir()
            codex.mkdir()
            (hermes / 'hermes_cache.py').write_text((ROOT / 'hermes-cache-watch/hermes_cache.py').read_text(encoding='utf-8'), encoding='utf-8')
            marker = root / 'codex-imported'
            (codex / 'codex_cache.py').write_text('from pathlib import Path\nPath(' + repr(str(marker)) + ').touch()\n', encoding='utf-8')
            env = dict(os.environ, HOME=tmp, USERPROFILE=tmp)
            cmd = [sys.executable, '-I', str(hermes / 'hermes_cache.py'), '--json']
            result = subprocess.run(cmd + ['--no-codex-quota'], env=env, capture_output=True, text=True, check=True)
            self.assertEqual(json.loads(result.stdout)['quota'], [])
            self.assertFalse(marker.exists())
            subprocess.run(cmd, env=env, capture_output=True, text=True, check=True)
            self.assertTrue(marker.exists())

    def test_hermes_cache_reads_sessions_excludes_hidden_and_filters_days(self):
        with tempfile.TemporaryDirectory() as tmp:
            db = Path(tmp) / "hermes #1.db"
            now = time.time()
            old = now - 20 * 86400
            with closing(sqlite3.connect(db)) as con:
                con.execute("""CREATE TABLE sessions (
                    id TEXT PRIMARY KEY, title TEXT, model TEXT, parent_session_id TEXT,
                    started_at REAL NOT NULL, last_activity_at REAL,
                    api_call_count INTEGER DEFAULT 0, input_tokens INTEGER DEFAULT 0,
                    output_tokens INTEGER DEFAULT 0, cache_read_tokens INTEGER DEFAULT 0,
                    hidden INTEGER DEFAULT 0
                )""")
                con.execute("INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                            ("h1", "Active", "gpt-5.4", "", now - 60, now, 4, 200, 50, 800, 0))
                con.execute("INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                            ("h2", "Old", "gpt-5.4", "", old, old, 2, 100, 10, 0, 0))
                con.execute("INSERT INTO sessions VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                            ("h3", "Hidden", "gpt-5.4", "", now, now, 3, 500, 10, 0, 1))
                con.commit()
            d = hm.build_json(days=7, db_path=str(db), quota=[{"name": "GPT", "buckets": []}])
            self.assertEqual(d["uncached"], 200)
            self.assertEqual(d["cache"], 800)
            self.assertEqual(d["hit"], 80.0)
            self.assertEqual([c["id"] for c in d["recent"]], ["h1"])
            self.assertEqual(d["quota"][0]["name"], "GPT")


if __name__ == "__main__":
    unittest.main()
