# 開源前安全與品質審查（2026-11-20）

審查範圍：`antigravity-zh-tw`、`agy-cache-watch`、`codex-cache-watch` 和公開文件。主要依靜態程式碼與合成資料測試；沒有取得使用者的 Windows 桌面環境。

| 事項 | 風險 | 處置 |
|---|---|---|
| 使用視窗標題辨認 CDP 注入頁面，可被不相關頁面混淆 | 高 | 以 URL scheme／完整 hostname 與本機 WebSocket 連線限制目標；新增負面測試 |
| SafeClose 以名稱認定部分根行程，可能擴及無關程式 | 高 | 移除泛用名稱，要求 OpenAI Codex／.codex 正向路徑比對；仍需真機 DryRun |
| 缺少 rollout 時以 SQLite 猜測每次呼叫與快取命中率 | 中 | 從模型與全域量測排除，個別歷史對話標為推估 |
| 有 rollout 但上下文分類由字元換算 | 中 | 明確標示分類估算，不再用 `exact=true` |
| localhost CDP 無認證，同機程式可能存取 | 中至高 | 在 SECURITY／README 揭露，仍為架構上殘餘風險；不能視為已消除 |
| 依賴非公開桌面格式與 RPC | 中 | 記錄相容性限制，維持版本化驗收要求 |

## 驗收邊界

自動化測試覆蓋輸入解析、推估與實測分離、注入目標拒絕條件、繁中字典有效性及 PowerShell 語法；**不**涵蓋執行中的 Electron/App UI、Windows 真實行程樹、實際登入狀態或額度 API 穩定性。故本文件不是第三方資安證書，也不是所有版本均安全／正常運作的聲明。
