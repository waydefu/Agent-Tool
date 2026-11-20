"""以合成資料測試核心契約，不讀取任何真實工作階段。"""
import importlib.util
import json
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


if __name__ == "__main__":
    unittest.main()
