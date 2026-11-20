# GitHub 開發環境與 Agent 搜尋指南

[English](DEVELOPMENT.en.md) · [AGENTS.md](../AGENTS.md)

## 不用電腦也能開發
在 GitHub 倉庫點 **Code → Codespaces → Create codespace**。合併本 PR 後，新 Codespace 會自動建立 Ubuntu 24.04、Python 3.12、Node.js 22、`rg` 與 `fd`。原有 Codespace 需 **Rebuild Container**。Codespaces 仍有依帳號方案而定的配額與費用。

工具只安裝於 GitHub 雲端容器，**不會自動裝到 Windows 本機，也不會改官方桌面應用程式**。

## 節省 Token 的程式探索順序
```bash
git ls-files '*cache*'                      # 追蹤檔案的路徑
fd -t f 'hud|locale' .                       # 快速找檔名
rg -n -F 'cached_input_tokens' codex-cache-watch tests
rg -n -C 3 -F 'SafeClose' codex-cache-watch   # 精準查看附近幾行
```
先找命中行，再讀需要的函式。預設不預裝 Serena 等常駐 MCP：小型專案索引的工具成本不一定划算。遇到大型跨檔重構時，可按需選用 [ast-grep](https://ast-grep.github.io/) 或 [Serena](https://github.com/oraios/serena)；整倉交接可按需選用 Repomix，必須先排除敏感資料。

## 驗證
```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v
python3 -I agy-cache-watch/agy_cache.py --selftest
python3 -I codex-cache-watch/codex_cache.py --selftest
node --test
bash -n .devcontainer/setup-tools.sh
```
GitHub Actions 會另外跑 Windows 合成測試，但不能驗證實際桌面 App 啟動、VBS、CDP 注入、行程關閉、非公開 RPC。真機驗收請見 [TESTING.md](TESTING.md) 和 [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)。

## 治理與安全
`.gitignore` 防止意外加入新檔，不能阻止強制加入或已追蹤檔案；提交前確認 `git diff --cached`。CI Action 固定完整 SHA，以 Dependabot 每週提出更新 PR。Release 加入 `main` 祖先檢查；但**仍需於 GitHub Settings → Rules → Rulesets 建立 Tag Ruleset** 控制誰能建立、更改及刪除 `v*` 標籤。
