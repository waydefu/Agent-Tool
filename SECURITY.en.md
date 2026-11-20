# Security policy

[繁體中文](SECURITY.md) · **English**

## Reporting vulnerabilities

If GitHub [Private vulnerability reporting](https://github.com/waydefu/Agent-Tool/security/advisories) is enabled, submit security reports privately through that feature. Otherwise, contact the maintainer privately via their [GitHub profile](https://github.com/waydefu). **Do not open a public issue containing an exploitable proof of concept, credentials, sessions or raw personal data.** Non-security bugs belong in the normal issue tracker.

## Threat model

- The Antigravity and Codex launchers expose Chrome DevTools Protocol on `127.0.0.1:9339` and `127.0.0.1:9340`, respectively. **Loopback is not authentication.** Other local processes may be able to control those applications while the debugging ports are open. Never forward or expose those ports outside the machine.
- The HUDs inspect private local sessions and SQLite records. The scripts should not require passwords or API keys; avoid sharing raw records, logs, reports or unredacted screenshots.
- `codex-cache-watch/SafeClose-Codex.ps1` can terminate app-related processes. Save your work first. Prefer `-DryRun` and avoid `-Force` unless you know which processes will be affected.
- Both dashboards rely on undocumented internal app interfaces. Data fidelity and compatibility may change without notice; estimates must remain visibly separate from measured counts.

## Support status

CI verifies syntax and selected behaviors with synthetic fixtures. It does **not** prove compatibility with every Windows build, installed app version or user environment. A release should only be marked stable once the [manual verification checklist](docs/TESTING.en.md) has been completed.

## Debug-port owner verification

Before injecting a page, launchers use Windows `Get-NetTCPConnection` to identify the listening PID and `Win32_Process.ExecutablePath` to check the expected Antigravity or ChatGPT/Codex installation path. If ownership cannot be verified, another process owns the port, or the port binds outside loopback, injection is refused. **This does not add CDP authentication.** Real Windows desktop validation remains required. Nonstandard installation locations may be conservatively rejected; report the installation path for review rather than disabling this check.
