# 變更紀錄

遵循主要版本／次要版本／修補版本的語意化版本精神；尚未驗證完整功能之前不宣稱穩定。

## Unreleased

- 修正 Codex／ChatGPT 桌面版額度顯示不準確的問題：
  - `codex-cache-watch/hud.js` 優先從 ChatGPT 視窗的即时 React Fiber／使用額度按鈕讀取伺服器最新推送的 5 小時與每週剩餘額度（並每 15 秒自動同步），排除 `avatar-overlay` 浮動視窗。
  - `codex-cache-watch/codex_cache.py` 改用事件本身的 ISO 時間戳（或 `resets_at`）而非檔案 `mtime` 挑選最新額度紀錄，並將已過重置時間（`resets_at <= now`）的舊視窗標為 `100%（已重置）`。
- 修正 Windows `.vbs` 啟動器在 CP950 下的編碼相容性與 Windows Store `AppExecutionAlias`（`chatgpt-desktop.exe`）零位元組重解析點偵測，並允許 `https://127.0.0.1`／`https://localhost` 本機回環頁面通過 CDP 注入檢查。
- 新增完整英文文件與 Issue 範本，以及雙語 HUD、英文 Windows 捷徑、CLI／HTML 英文版（`--lang en`）。
- 修正 Codex 天數篩選、未知額度與預設模型／方案、隱私日誌、SQLite URI、Antigravity protobuf 截斷與額度重試。
- 修正預設語言與字典合併流程，新增雙語及負面回歸測試。
- 公開說明 Codex 40 筆對話掃描上限與 Windows 真機驗收未完成。


- 建立繁體中文社群協作範本、貢獻指南、安全政策與 CI。
- 強化 CDP 注入頁面與 WebSocket 端點比對，避免僅依視窗標題辨認。
- 限縮 Codex 安全關閉腳本可認定為根行程的條件。
- 區分實際用量紀錄與 SQLite 歷史推估；後者不混入全域快取命中統計。
- 建立 Windows 來源 ZIP 的候選版（Prerelease）發布工作流程，保留實機驗收門檻。

此處為待合併的變更，並不代表已發布正式版本。
