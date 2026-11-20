# 安全政策

此專案涉及桌面程式的本機除錯介面，以及工作階段的唯讀用量分析。使用前請詳讀安全注意事項。

## 私下回報漏洞

若倉庫的 [Private vulnerability reporting](https://github.com/waydefu/Agent-Tool/security/advisories) 已啟用，請透過 GitHub 私下提交安全性通報。若尚未啟用，請先透過 [維護者的 GitHub 個人頁面](https://github.com/waydefu) 尋求非公開聯繫方式；**不要**公開任何有效權杖、真實 Session、資料庫或可直接利用的漏洞細節。一般非安全性錯誤請使用 Issues。

## 威脅模型與注意事項

- 繁中啟動器與 Codex HUD 分別使用 `127.0.0.1:9339` 與 `127.0.0.1:9340` 的 Chrome DevTools Protocol (CDP)。限制在本機並不代表有驗證機制；同一台電腦的其他行程可能操作已開啟除錯的應用程式。避免在不信任的電腦上啟動，使用完畢務必完全退出 App。
- 不對外公開這兩個除錯埠，也不要以代理、轉發、容器網路映射等方式暴露它們。
- HUD 會分析本機 `.codex` 或 `.gemini/antigravity` 的 Session 和 SQLite 資料。請勿上傳原始輸出；截圖前遮蔽可識別資訊。
- 本專案不應要求你輸入帳號密碼或 API Key。若遇到此類要求，應停止操作並通報。
- `SafeClose-Codex.ps1` 可能結束 Codex 附屬行程；對尚未完成的任務，請先保存工作。優先使用 `-DryRun` 檢查，不要輕易使用 `-Force`。

## 支援與驗證界線

安全更新以 `main` 中已合併的修正為準；Release 需另行公告。自動化 CI 只能檢查部分程式邏輯，無法替代 Windows 真機對桌面版本和安全行為的驗證。

## 除錯埠擁有者驗證

啟動器會透過 Windows `Get-NetTCPConnection` 查詢監聽埠的 PID，並核對 `Win32_Process.ExecutablePath` 與預期的 Antigravity 或 ChatGPT/Codex 安裝路徑。若無法識別、埠由其他程式佔用或綁定非本機位址，會拒絕注入，避免誤連接其他應用程式。此措施**不會替 CDP 增加密碼或驗證**；相容性與安全性仍須進行 Windows 真機驗收。非預設安裝路徑可能被保守拒絕，請先回報並核對實際路徑，不要直接放寬白名單。
