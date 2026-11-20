# Testing and verification

[繁體中文](TESTING.md) · **English**

Use Python 3.12 and Node.js 22+ in the repository root to run the automated tests:

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
python -I agy-cache-watch/agy_cache.py --selftest
python -I codex-cache-watch/codex_cache.py --selftest
node --test tests/*.test.cjs
node -e "require('./antigravity-zh-tw/src/locale').loadLocale('zh-TW')"
```

GitHub Actions runs tests on Linux and Windows. On Windows, the PowerShell shutdown script is **parsed only**, not executed. These tests do not use any real user sessions. English and Traditional Chinese HUD rendering should both be tested with synthetic data.

## Manual Windows desktop acceptance (still required)

- Antigravity App 2.33: Traditional Chinese launch, native-English launch, both HUD languages, restart/reload, model quota, agent grouping, and shutdown.
- ChatGPT / Codex: both HUD languages, login-independent startup, proper cache/source labels, five-hour and weekly quota, reload, and restart confirmation.
- Run `SafeClose-Codex.ps1 -DryRun` to check that unrelated applications (Claude, Hermes, Antigravity, etc.) are not included.
- Confirm ports 9339/9340 bind only to loopback, are never forwarded, and that no raw private records are transmitted.
- Test Windows 10/11 and the actual app versions you intend to support.

Passing CI is **not** equivalent to real desktop acceptance. Do not mark a build stable solely because automated tests pass.

## Measurement caveats

- `token_usage_record` yields measured per-call input, cached input and output when the corresponding rollout log exists.
- Codex context categories are estimates even with measured calls.
- SQLite-only historical Codex threads contain modeled call details; their metrics are excluded from global measured totals.
- Antigravity `gen_metadata` parsing targets an undocumented protobuf layout and requires revalidation on app updates.
- Data retention windows and per-thread row limits can omit older usage; don't use either dashboard for invoicing.
