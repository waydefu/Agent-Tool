# Agent-Tool

[繁體中文](README.md) · **English**

[![CI](https://github.com/waydefu/Agent-Tool/actions/workflows/ci.yml/badge.svg)](https://github.com/waydefu/Agent-Tool/actions/workflows/ci.yml)

**Agent-Tool** is a collection of community-maintained Windows utilities for Google Antigravity and the ChatGPT / Codex desktop app. It adds a Traditional Chinese interface option for Antigravity and provides on-screen cache, usage-limit and context breakdown dashboards.

| Utility | What it does |
|---|---|
| [Antigravity Traditional Chinese launcher](antigravity-zh-tw/) | Applies a zh-TW translation at launch, without modifying the installed app |
| [Antigravity usage HUD](agy-cache-watch/) | Shows model quota, input-cache hit rate, recent model activity and context categories |
| [ChatGPT / Codex usage HUD](codex-cache-watch/) | Shows 5-hour and weekly limits, cache statistics, conversations and estimated context categories |
| [Hermes usage HUD](hermes-cache-watch/) | Shows Hermes cache statistics and Codex 5-hour / weekly limits |

**Not an official product of Google or OpenAI.** These are **source scripts**, not an installer. Desktop-app internals can change without notice. Compatibility has not been certified on a real Windows desktop: CI validates source code and synthetic tests, not end-to-end operation.

## GitHub cloud development

Use **Code → Codespaces** for a Linux environment with Python, Node.js, `rg`, and `fd`. See the [development guide](docs/DEVELOPMENT.en.md) and [AGENTS.md](AGENTS.md). No Windows desktop software is modified.

## Requirements

- Windows 10/11, Node.js **22+** and Python **3** (CI uses Python 3.12).
- A separately installed Antigravity or ChatGPT / Codex desktop app for the corresponding HUD.
- Download this repository via **Code → Download ZIP**, then extract it. Keep the tool directories together; the Antigravity launcher looks for the HUD next to its own directory.

No third-party Python packages are required by the usage parsers. Do not run these launchers on an untrusted shared machine: the debugging connection can be accessed by other local processes.

## Linux desktop (experimental)

Both launchers also run on Linux (tested on Ubuntu 24.04 arm64 under PRoot) and inject the same UI and HUDs. Requires Node.js 22+ and `python3`.

```bash
# Antigravity (point at wherever the official tar.gz was unpacked); arguments after `--` go to the app
AGENT_TOOL_ANTIGRAVITY_EXE=/opt/antigravity-hub/antigravity node antigravity-zh-tw/launch-zh-tw.js -- --user-data-dir="$HOME/.config/antigravity-hub-data"
# ChatGPT / Codex (the official .deb installs /usr/bin/chatgpt)
node codex-cache-watch/launch-codex-hud.js
```

- Running as root adds `--no-sandbox` automatically (Electron requires it).
- CDP owner check: on Linux it matches the app main process's own arguments (`--remote-debugging-port` and `--remote-debugging-address=127.0.0.1`). This is weaker than the Windows socket-owner check; the limit is documented in `shared/cdp-owner.js`.
- If ChatGPT is already running without the debug port, the launcher only asks you to close it and start again; there is no Linux equivalent of `SafeClose-Codex.ps1`.

## Choose your language

| Experience | Traditional Chinese | English |
|---|---|---|
| Antigravity app + HUD | `antigravity-zh-tw/launch-zh-tw.vbs` | `antigravity-zh-tw/launch-en.vbs` |
| ChatGPT / Codex HUD | `codex-cache-watch/launch-codex-hud.vbs` | `codex-cache-watch/launch-codex-hud-en.vbs` |

The English Antigravity launcher **does not inject the zh-TW translation**; it leaves the native app UI unchanged and displays its companion HUD in English. For the HUD only, launch scripts also accept `--lang=en` or the `AGENT_TOOL_LANG=en` environment variable. Default behavior remains Traditional Chinese.

The included `.vbs` shortcuts assume that Node.js is installed at `C:\Program Files\nodejs\node.exe`. If your Node installation uses another location, adjust the corresponding `.vbs` launcher.

**English desktop shortcuts** (replace `<folder>` with the extracted repository location):

```text
C:\Windows\System32\wscript.exe "<folder>\antigravity-zh-tw\launch-en.vbs"
C:\Windows\System32\wscript.exe "<folder>\codex-cache-watch\launch-codex-hud-en.vbs"
```

Or, from an appropriate tool directory:

```powershell
node launch-zh-tw.js --lang=en
node launch-codex-hud.js --lang=en
```

Run the command from the corresponding directory, **not both in the same directory**. If the desktop app is already open without a debugging port, close it completely first (the Codex launcher may offer an explicit restart choice).

## What the dashboards measure

**Cache hit rate** = cached input tokens / (cached + uncached input tokens). Output tokens are not part of the denominator. A zero percent bar means no cached input was recorded for that call. The dashboards are for local diagnostics, **not billing or contractual quota guarantees**.

**Antigravity dashboard:** data is read from `~/.gemini/antigravity*/conversations/*.db`, with conversation titles and agent relationships from local summaries. Its model-quota rings query the desktop app's local `RetrieveUserQuotaSummary` RPC. Context breakdown data is decoded from `gen_metadata` field `1.9.10`, an **undocumented internal protobuf format**. Versions other than the documented Antigravity App 2.33 may differ. The HUD refreshes quota approximately every 20 seconds and usage statistics approximately every 30 seconds.

**ChatGPT / Codex dashboard:** token records come from `~/.codex/sessions/**/rollout-*.jsonl`; thread metadata comes from `state_5.sqlite` and `thread_history_1.sqlite`. Five-hour and weekly remaining limits are taken from the latest locally observed `rate_limits` data; they may be stale if the app has not refreshed them. Only the **40 most recently updated threads** in the selected period are scanned for on-screen statistics, so aggregated totals are not necessarily complete across a busy account. For conversations with rollout logs, call-level input, cached input and output are measured. **Context category totals still use approximate character-to-token conversion.** When only historical SQLite information exists, call counts and cache metrics are estimates, marked as such and excluded from overall/model measured totals.

**Hermes dashboard:** run `node hermes-cache-watch/launch-hermes-hud.js`. Hermes cache statistics refresh about every 30 seconds. Codex limits are fetched using `codex app-server` and `account/rateLimits/read` approximately every 60 seconds; the query process exits after each request. Codex must be installed and signed in. Linux prefers `/usr/lib/chatgpt/resources/codex`, otherwise the launcher uses `codex` on PATH (`codex.exe` on Windows). The query disables the MCP server named `hybrid2`. Failure marks the last result stale or unavailable and retries with backoff; it does not infer 100% from an expired reset. Windows has not been tested on a real desktop.

For the context breakdown tab, install `hermes-cache-watch/desktop-plugin/plugin.js` as `desktop-plugins/hermes-hud-context/plugin.js` under the active Hermes home. It uses Hermes `session.context_breakdown` only when the tab is open and the focused conversation is idle; it refreshes on session changes or turn completion. Categories are estimates and `~` marks estimated totals. It does not expose prompt text, file paths, or a per-call chart; ambiguous session routing fails closed.

### Terminal mode

From `agy-cache-watch/`:

```powershell
python agy_cache.py --lang en
python agy_cache.py --lang en --watch 10
python agy_cache.py --lang en --html
python agy_cache.py --selftest
```

From `codex-cache-watch/`:

```powershell
python codex_cache.py --lang en
python codex_cache.py --lang en --html
python codex_cache.py --selftest
```

`--json` retains its original, language-neutral field names and internal category keys for HUD compatibility.

## CDP security and privacy

The launchers enable Chrome DevTools Protocol (CDP) on **127.0.0.1:9339** (Antigravity) and **127.0.0.1:9340** (Codex). Binding to loopback **does not authenticate other processes on the same machine**. Never expose these ports through tunneling, port forwarding or proxies. Shut down the app when not in use. Scripts analyze local records, and generated HTML reports or screenshots may reveal conversation metadata: redact them before sharing.

Do not post your account credentials, API keys, cookies, CSRF tokens, raw `.codex` / `.gemini` sessions, SQLite files, personal filesystem paths or unredacted usage reports in GitHub Issues.

## Documentation and community contributions

- [Contributing (English)](CONTRIBUTING.en.md) · [繁體中文](CONTRIBUTING.md)
- [Security policy (English)](SECURITY.en.md) · [繁體中文](SECURITY.md)
- [Test scope (English)](docs/TESTING.en.md) · [繁體中文](docs/TESTING.md)
- [Release checklist](docs/RELEASE_CHECKLIST.md) · [Security audit](docs/SECURITY_AUDIT.md)
- [Report a bug or request a feature](https://github.com/waydefu/Agent-Tool/issues)
- [Releases](https://github.com/waydefu/Agent-Tool/releases) — absence of a release means no verified stable build has been published.

## Attribution and license

Original project code and documentation are distributed under [MIT](LICENSE). Parts of the Antigravity translation engine and dictionary originate from [antigravity-zh](https://github.com/wade19990814-hue/antigravity-zh) under its own MIT copyright notice, preserved in [antigravity-zh-tw/LICENSE](antigravity-zh-tw/LICENSE). Third-party rights and notices remain with their respective holders. This project does not patch or redistribute an app's `app.asar`.
