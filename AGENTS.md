# Agent-Tool：Agent 工作規範（精簡上下文）

適用於 Codex 及其他程式 Agent。預設繁體中文；API／程式名稱維持英文。**只完成被授權的範圍，不擴大需求。**

## 找檔流程
1. 先讀此文件與目標任務描述，不要每回合讀取全部 README 或整個倉庫。
2. 檔名用 `git ls-files` / `fd`，內容用 `rg -n -F`；再用 `rg -n -C 3` 定位，最後只讀相關行數。
3. 若無本機 CLI，優先 GitHub code search 後精準讀檔；不要輸出大量無關搜尋結果。
4. 跨檔修改需確認呼叫端與測試；無必要不啟動整倉索引、不預先載入大型 Skill／MCP。
5. 同一任務記錄已確認的路徑與結論，避免子 Agent 重複掃描；修改後先做定向測試再跑完整 CI。

## 目錄索引
| 路徑 | 內容 |
| --- | --- |
| `antigravity-zh-tw/launch-zh-tw.js`、`src/locale.js`、`src/patches/` | 啟動、CDP 注入、翻譯引擎 |
| `antigravity-zh-tw/src/locales/` | 翻譯字典與擴充 |
| `agy-cache-watch/agy_cache.py`、`hud.js` | Antigravity 統計與 HUD |
| `codex-cache-watch/codex_cache.py`、`hud.js` | Codex 統計與 HUD |
| `codex-cache-watch/SafeClose-Codex.ps1` | **高風險** Windows 行程關閉 |
| `tests/` | 合成資料與回歸測試 |
| `.github/workflows/` | CI 與 prerelease |
| `.devcontainer/`、`docs/DEVELOPMENT.md` | Codespaces 與開發流程 |

```bash
git ls-files '*hud*'
fd -t f 'cache|locale' .
rg -n -F 'cached_input_tokens' codex-cache-watch tests
rg -n -C 3 -F 'RetrieveUserQuotaSummary' agy-cache-watch antigravity-zh-tw
```

## 變更與驗證規則
- 不讀入、提交或記錄私密 .codex/.gemini 工作階段、SQLite、JSONL、.env、權杖、Cookie、個人路徑或原始用量報表。忽略規則不是防洩漏保證，提交前必須確認 `git diff --cached`。
- 不暴露本機 CDP 埠、不降低負面測試、不將推估統計偽裝成實測、不任意更改 JSON 契約。
- PR 描述包含 **Why / What / How tested / What could break / Who reviewed**；如實標示未實測與作者自審。
- `python3 -m unittest discover -s tests -p 'test_*.py' -v`
- `python3 -I agy-cache-watch/agy_cache.py --selftest`
- `python3 -I codex-cache-watch/codex_cache.py --selftest`
- `node --test`
- Codespaces 是 Linux，**不能**替代 Windows 的 VBS、CDP、SafeClose 真機驗收；Stable 必須遵守 `docs/RELEASE_CHECKLIST.md`。
