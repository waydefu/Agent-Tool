# 變更紀錄

遵循主要版本／次要版本／修補版本的語意化版本精神；尚未驗證完整功能之前不宣稱穩定。

## Unreleased

- Hermes HUD 新增上下文結構分頁，搭配獨立桌面外掛按需讀取 Hermes 的估算分類與上下文用量；回覆中不查詢，連線歸屬不明時不顯示可能屬於其他對話的數字。

- Hermes HUD 額度改為使用 Codex `app-server` 的 `account/rateLimits/read` 查詢，約每 60 秒啟動一次短暫查詢；需已安裝且登入 Codex。Linux 優先使用 `/usr/lib/chatgpt/resources/codex`，其他情況使用 PATH 中的 `codex`（Windows 為 `codex.exe`）。查詢程序明確停用名為 `hybrid2` 的 MCP 伺服器；查詢失敗保留上次結果並標示過期，退避後重試，不推測重置後額度。Windows 尚未實機驗證。

- 新增 `hermes-cache-watch`：以本機回環除錯埠（`127.0.0.1:9346`）啟動 Hermes Desktop 並注入右上角 HUD，顯示 GPT／Codex 每週與五小時額度圓環及 Hermes（`~/.hermes/state.db`）對話快取命中率與各模型統計；`shared/cdp-owner.js` 與 `shared/Verify-CdpOwner.ps1` 同步支援 `hermes`。
- 新增 Linux 桌面版（實驗性）：兩個啟動器依平台選擇 App 路徑（`AGENT_TOOL_ANTIGRAVITY_EXE`／`AGENT_TOOL_CHATGPT_EXE`）、`python3`、root 時的 `--no-sandbox` 與 `--` 之後的 App 參數；`shared/cdp-owner.js` 新增 Linux 主行程參數比對（可讀取 Chromium 改寫過的行程標題）。Linux 不提供 SafeClose。
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
