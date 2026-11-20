# 貢獻指南

[English](CONTRIBUTING.en.md)

歡迎協助修正錯誤、改善繁體中文翻譯與支援新版本桌面 App。討論與文件以繁體中文優先；程式中的協定名稱、API 與產品名稱保留原文。

## 開發流程

1. 先用 Issue 範本描述使用情境、受影響版本與重現方式。小型拼字修正可直接送 PR。
2. 從 `main` 建立功能分支，盡量讓 PR 只聚焦一個問題。
3. 執行 `python -I agy-cache-watch/agy_cache.py --selftest`、`python -I codex-cache-watch/codex_cache.py --selftest`、`python -m unittest discover -s tests -p "test_*.py"`，以及 `node --test tests/launcher-targets.test.cjs`。
4. 透過 PR 範本的 Why / What / How tested / What could break / Who reviewed 五段說明變更。沒有實機測試就如實標示，不能以語法測試取代。
5. 請勿降低安全檢查、移除測試，或在未說明理由下改用遠端除錯介面。

## 隱私與安全

不得提交 `.codex`、`.gemini` 的原始資料庫、對話、Session JSONL、工作階段紀錄、密鑰、Cookie、CSRF token、個人路徑或完整產生報表。測試一律使用合成資料。涉及漏洞的問題請依 [安全政策](SECURITY.md) 私下回報，勿開公開 Issue。

## 目前限制

本專案不是 Google 或 OpenAI 官方產品。桌面 App 內部 API、資料結構和 CDP 行為可能隨更新改變；原則上優先使用唯讀本機資料，保留來源與估算的不確定性。
