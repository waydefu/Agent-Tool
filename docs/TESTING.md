# 驗收方式

## 不需要真實帳號資料的測試

使用 Python 3.12、Node.js 22+：

```powershell
python -m unittest discover -s tests -p "test_*.py" -v
python -I agy-cache-watch/agy_cache.py --selftest
python -I codex-cache-watch/codex_cache.py --selftest
node --test tests/launcher-targets.test.cjs
node -e "require('./antigravity-zh-tw/src/locale').loadLocale('zh-TW')"
```

GitHub Actions 的 `CI` 工作流程在 Linux 與 Windows Runner 執行檢查；Windows Runner 會額外**解析** PowerShell 腳本，**不執行**關閉應用程式。

## 尚需 Windows 實際桌面環境驗證

- Antigravity 2.33：正常啟動、繁中注入、重載後恢復、額度 RPC、子代理分層、關閉 App 後啟動器退出。
- ChatGPT／Codex：啟動與舊視窗重啟流程、HUD 顯示、五小時與每週額度、真實與推估資料標籤、重載、背景行程關閉。
- 安全負面測試：除錯埠不可由非本機存取；不注入陌生網頁；`SafeClose-Codex.ps1 -DryRun` 不列出其他 AI 工具及無關行程。
- Windows 10/11、不同 Node 22+ / Python 3.x 和不同桌面版本的相容性紀錄。

CI 通過只代表程式契約與基礎語法通過，不代表實機驗收通過。

## 資料精度

- `token_usage_record`：模型每次呼叫的輸入、快取讀取與輸出可作為量測值。
- Codex 上下文各分類：即使有 rollout，也包含按字元長度估算；不能宣稱各分類皆為精確 Token。
- 只有 SQLite 而缺少 rollout 的歷史對話：每次呼叫與命中率是推算示意，不列入全域和模型量測統計。
- Antigravity 的解析依賴未公開 protobuf 欄位；不同版本需重新比對。
