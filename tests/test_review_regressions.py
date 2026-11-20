"""Regression tests for security boundaries, date filtering, and English output.

Synthetic data only; never read a real user's conversations.
"""
import contextlib
import importlib.util
import io
import sqlite3
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, ROOT / path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


ag = load("agy-cache-watch/agy_cache.py", "agy_cache_review")
cd = load("codex-cache-watch/codex_cache.py", "codex_cache_review")


class ReviewRegressions(unittest.TestCase):
    def test_protobuf_rejects_truncated_fixed_width_fields(self):
        for wire in (b"\x09\x01", b"\x0d\x01"):
            with self.subTest(wire=wire):
                with self.assertRaises(ValueError):
                    list(ag.fields(wire))

    def test_codex_days_filter_never_expands_to_older_threads(self):
        with tempfile.TemporaryDirectory() as temp:
            db = Path(temp) / "state_5.sqlite"
            with contextlib.closing(sqlite3.connect(db)) as con:
                con.execute("""CREATE TABLE threads (
                    id TEXT, title TEXT, model TEXT, tokens_used INTEGER,
                    updated_at_ms INTEGER, rollout_path TEXT,
                    agent_nickname TEXT, agent_role TEXT,
                    attached_thread_parent_id TEXT, source TEXT
                )""")
                older = int((time.time() - 10 * 86400) * 1000)
                con.execute("INSERT INTO threads VALUES (?,?,?,?,?,?,?,?,?,?)",
                            ("old", "old thread", "gpt-test", 2000, older, "",
                             "", "", "", ""))
                con.commit()
            with patch.object(cd, "CODEX_DIR", temp), \
                 patch.object(cd, "STATE_DB", str(db)), \
                 patch.object(cd, "HIST_DB", str(Path(temp) / "missing.sqlite")), \
                 patch.object(cd, "SESS_DIRS", [str(Path(temp) / "missing-sessions")]):
                models, recent, quota = cd.collect(days=1)
            self.assertEqual(recent, [])
            self.assertEqual(dict(models), {})
            self.assertIsNone(quota)

    def test_english_terminal_outputs(self):
        models = {"unsafe<script>": [1, 60, 40, 10, 0]}
        with patch.object(ag, "collect", return_value=(models, [])):
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                ag.summary_en(days=7)
            self.assertIn("Cache hit rate by model", buf.getvalue())
            self.assertIn("unsafe<script>", buf.getvalue())
        demo = {
            "quota": [], "hit": 40.0, "cache": 40, "uncached": 60, "output": 10,
            "models": [{"name": "unsafe<script>", "calls": 1, "hit": 40.0,
                        "zero": 0, "subs": []}], "recent": [], "updated": "12:00"
        }
        with patch.object(cd, "build_json", return_value=demo):
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                cd.summary_en(days=7)
            self.assertIn("Cache hit rate by model", buf.getvalue())

    def test_english_html_escapes_user_fields(self):
        models = {"unsafe<script>": [1, 60, 40, 10, 0]}
        with tempfile.TemporaryDirectory() as temp:
            with patch.object(ag, "collect", return_value=(models, [])), \
                 patch.object(ag, "__file__", str(Path(temp) / "ag.py")):
                report = Path(ag.html_report_en(days=7, refresh=0))
                self.assertIn('<html lang="en">', report.read_text(encoding="utf-8"))
                self.assertIn("unsafe&lt;script&gt;", report.read_text(encoding="utf-8"))
            demo = {
                "quota": [], "hit": 40.0, "cache": 40, "uncached": 60, "output": 10,
                "models": [{"name": "unsafe<script>", "calls": 1, "hit": 40.0,
                            "zero": 0, "subs": []}],
                "recent": [{"title": "a <bad> title", "calls": [], "estimated": True,
                            "hit": 0.0}], "updated": "12:00"
            }
            with patch.object(cd, "build_json", return_value=demo), \
                 patch.object(cd, "__file__", str(Path(temp) / "cd.py")):
                report = Path(cd.html_report_en(days=7, refresh=0))
                body = report.read_text(encoding="utf-8")
                self.assertIn('<html lang="en">', body)
                self.assertIn("unsafe&lt;script&gt;", body)
                self.assertIn("a &lt;bad&gt; title", body)


if __name__ == "__main__":
    unittest.main()
