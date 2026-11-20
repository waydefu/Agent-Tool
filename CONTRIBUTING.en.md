# Contributing to Agent-Tool

[繁體中文](CONTRIBUTING.md) · **English**

Pull requests for bug fixes, English/Traditional Chinese localization, compatibility updates and safe diagnostics are welcome.

## Before opening a pull request

1. Open a bug report or feature request using the English or zh-TW [issue templates](https://github.com/waydefu/Agent-Tool/issues/new/choose). Small typo fixes can go directly to a PR.
2. Create a focused branch from `main`; prefer small, independently reviewable changes.
3. Run both parsers' `--selftest`, Python unit tests, JavaScript tests and locale validation, as described in [TESTING.en.md](docs/TESTING.en.md).
4. Fill all five PR sections: **Why / What / How tested / What could break / Who reviewed**. State honestly if Windows desktop testing was not performed.
5. Do not weaken security checks, remove assertions or bind CDP to non-local addresses without a documented security review.

## Security and privacy

Test with synthetic data. Never submit raw conversation sessions, private SQLite databases, API keys, cookies, CSRF tokens, personal filesystem paths or unredacted screenshots. See [SECURITY.en.md](SECURITY.en.md) for confidential vulnerability reporting.

## Localization

The existing Traditional Chinese UI is the default. Both HUD launchers support `--lang=en`. Keep internal JSON keys stable across locales; translate **display labels** only. Native Antigravity English needs no forced translation. Updates should include tests for both languages and avoid user-generated text rewriting.

This is an independent community project, not an official Google or OpenAI integration. Internal desktop APIs and data formats can change at any time.
