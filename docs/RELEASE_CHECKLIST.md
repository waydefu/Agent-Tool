# 版本發布檢查表

正式標示 Stable 前，維護者須完成：

- [ ] GitHub Actions `validate-linux` 與 `validate-windows` 全部通過
- [ ] 在實際 Windows 10/11 與指定桌面版本完成功能／負面測試（參照 [TESTING](TESTING.md)）
- [ ] 確認 CDP 綁定僅本機且注入目標正確，關閉流程不誤殺其他行程
- [ ] 確認程式碼與 ZIP 無金鑰、Session、SQLite、個人路徑或原始用量輸出
- [ ] 核對第三方授權、來源連結、繁中 README 與安裝步驟
- [ ] 更新 CHANGELOG，記錄支援版本、已知限制與最低執行環境

## 發布程序

1. 將通過 CI 和審閱的 PR 合併到 `main`。
2. 完成實機驗收後，從已驗收的 `main` commit 建立 `vX.Y.Z` 標籤並推送；`release.yml` 將在 Windows Runner 執行基礎測試、以 `git archive` 打包原始碼 ZIP、產生 SHA256，並建立 **Prerelease**。
3. 再次核對 ZIP、雜湊、測試證據與下載說明後，維護者才可於 GitHub Releases 頁面把預發布轉為 Stable。
4. **這份 ZIP 是原始碼與腳本包，不是安裝程式，也沒有附 Node.js、Python 或官方 App。** 不應宣稱一鍵安裝。

若 Windows 真機驗收尚未完成，維持預發布或不建立標籤，不能以 CI 全綠當作穩定版證據。
