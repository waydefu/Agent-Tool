# GitHub development and agent discovery

[繁體中文](DEVELOPMENT.md) · [AGENTS.md](../AGENTS.md)

Open **Code → Codespaces → Create codespace** in this GitHub repository. After this PR is merged, the devcontainer provisions Ubuntu 24.04, Python 3.12, Node.js 22, ripgrep (`rg`) and fd (`fd`). Rebuild existing containers to apply the config. GitHub Codespaces usage and billing depend on your plan.

These tools are installed **in the cloud container only**, not on your Windows PC or in official desktop apps.

```bash
git ls-files '*cache*'
fd -t f 'hud|locale' .
rg -n -F 'cached_input_tokens' codex-cache-watch tests
rg -n -C 3 -F 'SafeClose' codex-cache-watch
```
Locate matching files and line numbers before reading code ranges. Do not load all repository files or permanent MCP servers by default. Use ast-grep, Serena or Repomix only when a specific large task justifies their extra setup and context; always exclude sensitive data.

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 -I agy-cache-watch/agy_cache.py --selftest
python3 -I codex-cache-watch/codex_cache.py --selftest
node --test
bash -n .devcontainer/setup-tools.sh
```
Linux Codespaces and Windows CI synthetic tests do **not** prove real Windows VBS/CDP/HUD/SafeClose desktop integration. Follow [testing](TESTING.en.md) and the [release checklist](RELEASE_CHECKLIST.md).

Never commit local sessions, SQLite, JSONL, environment files, credentials or raw usage exports. `.gitignore` is not a security boundary. CI Actions are pinned to complete commit SHAs; Dependabot proposes updates weekly. A release-tag ancestry check does not replace a repository-owner-managed GitHub **Tag Ruleset**.
