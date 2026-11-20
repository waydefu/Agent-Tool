"""Repository contracts for lean, GitHub-hosted agent development."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class DevEnvironmentContractTests(unittest.TestCase):
    def test_codespaces_config(self):
        config = json.loads((ROOT / ".devcontainer/devcontainer.json").read_text(encoding="utf-8"))
        self.assertEqual(config["postCreateCommand"], "bash .devcontainer/setup-tools.sh")
        self.assertTrue(any("python" in key for key in config["features"]))
        self.assertTrue(any("node" in key for key in config["features"]))
        installer = (ROOT / ".devcontainer/setup-tools.sh").read_text(encoding="utf-8")
        self.assertIn("ripgrep", installer)
        self.assertIn("fd-find", installer)

    def test_agents_have_one_source_of_truth(self):
        self.assertTrue((ROOT / "AGENTS.md").exists())
        for name in ("CLAUDE.md", "GEMINI.md"):
            self.assertIn("AGENTS.md", (ROOT / name).read_text(encoding="utf-8"))

    def test_actions_use_immutable_refs(self):
        for name in ("ci.yml", "release.yml"):
            with self.subTest(name=name):
                content = (ROOT / ".github/workflows" / name).read_text(encoding="utf-8")
                refs = re.findall(r"^\s*- uses:\s+(\S+)", content, re.M)
                self.assertGreaterEqual(len(refs), 3)
                for ref in refs:
                    self.assertRegex(ref, r"^[^@]+@[a-f0-9]{40}$")

    def test_sensitive_local_data_ignored(self):
        content = (ROOT / ".gitignore").read_text(encoding="utf-8")
        for pattern in ("*.db", "*.sqlite", "*.jsonl", ".env", ".codex/", ".gemini/"):
            with self.subTest(pattern=pattern):
                self.assertIn(pattern, content)
