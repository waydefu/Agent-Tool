# Agent-Tool

**語言：** [繁體中文](README.md) · [English](README.en.md)

[![CI](https://github.com/waydefu/Agent-Tool/actions/workflows/ci.yml/badge.svg)](https://github.com/waydefu/Agent-Tool/actions/workflows/ci.yml)

給 Windows 上的 Google Antigravity、ChatGPT 與 Codex 桌面使用者的社群工具，提供繁體中文介面、模型額度與 Token 用量觀察。

| 工具 | 功能 |
|---|---|
| [Antigravity 繁中啟動器](./antigravity-zh-tw/) | 啟動 Antigravity 時套用繁體中文介面 |
| [Antigravity 用量面板](./agy-cache-watch/) | 查看快取命中率、模型額度與上下文結構 |
| [ChatGPT／Codex 用量面板](./codex-cache-watch/) | 查看快取命中率、五小時與每週額度，以及上下文結構 |

## 快速開始

1. 用 GitHub 的 **Code → Download ZIP** 下載並解壓縮。三個工具資料夾請保持在同一層，方便繁中啟動器找到 Antigravity 面板。
2. 準備 Windows、Node.js 22 以上與 Python 3。只看終端機用量時，直接在對應工具資料夾執行 `python agy_cache.py` 或 `python codex_cache.py`。
3. 需要桌面介面時，依下方各工具的「使用」段落建立捷徑。設定前先完全關閉已經開啟的桌面程式。

這是獨立社群專案，**不是 Google 或 OpenAI 官方工具**。目前提供的是需要 Node.js 與 Python 的原始碼／腳本，**不是一鍵安裝程式**。桌面程式更新後，介面或本機資料格式可能改變。Antigravity 的繁中啟動器依 App 2.33 說明，其他版本的相容性需另行確認。

**驗證狀態：** 自動化測試和 Windows 桌面實機驗收是不同層級。請先參閱 [測試範圍](docs/TESTING.md) 與 [安全稽核](docs/SECURITY_AUDIT.md)；在完成實機驗收之前，不宣稱全面相容或正式穩定。

## 社群協作與安全

英文使用者請參閱 [English README](README.en.md)、[English Security](SECURITY.en.md) 與 [English Contributing](CONTRIBUTING.en.md)。

- [貢獻指南](CONTRIBUTING.md)：如何回報、測試並提交修正。
- [安全政策](SECURITY.md)：CDP、本機資料與私下回報方式。
- [變更紀錄](CHANGELOG.md)：尚未發布與已發布的變更。
- [測試說明](docs/TESTING.md) 與 [發布檢查表](docs/RELEASE_CHECKLIST.md)：CI 與實機測試界線。
- [程式審查報告](docs/REVIEW_2026-11-20.md)／[English review](docs/REVIEW_2026-11-20.en.md)：修正紀錄與殘餘風險。

## 問題回報

請在 [GitHub Issues](https://github.com/waydefu/Agent-Tool/issues) 附上工具名稱、桌面程式與 Windows 版本、重現步驟和預期結果。分享截圖或錯誤訊息前，請遮蔽帳號、對話內容、權杖及個人路徑。請勿上傳原始工作階段紀錄、資料庫或完整用量報表。

## 授權與來源

繁中啟動器中的上游翻譯引擎與字典源自 [antigravity-zh](https://github.com/wade19990814-hue/antigravity-zh)，相關 MIT 授權與著作權聲明見 [子目錄 LICENSE](./antigravity-zh-tw/LICENSE)。本專案的自有程式與文件採用 [MIT 授權](./LICENSE)，第三方內容沿用各自的授權與著作權聲明。

---

## 一、繁中啟動器 `antigravity-zh-tw/`

### 原理
- 直接修改 `app.asar` 在 App 2.33 會壞掉（只剩 Electron 預設頁），所以改用**注入**：
  啟動器用 `--remote-debugging-port=9339`（只綁 `127.0.0.1`）開啟 Antigravity，再透過 Chrome DevTools Protocol（CDP，瀏覽器除錯用的通訊協定）把翻譯引擎與字典注入每個視窗。
- 啟動器會一直連著視窗，所以 App 重新載入後會自動再注入；App 關閉後啟動器自己結束。

### 使用
英文介面與英文 HUD 可使用 `antigravity-zh-tw/launch-en.vbs`；此模式保留 Antigravity 原生英文，不注入繁中字典。亦可執行 `node launch-zh-tw.js --lang=en`。

1. 建一個桌面捷徑，目標填：
   ```
   C:\Windows\System32\wscript.exe "<放置路徑>\antigravity-zh-tw\launch-zh-tw.vbs"
   ```
   （`.vbs` 只是用隱藏視窗執行 `launch-zh-tw.js`；也可以直接 `node launch-zh-tw.js`。）
2. **一定要從這個捷徑開 App。** 如果 App 已經從開始功能表或工作列開著（沒有除錯埠），要先完全關掉再用捷徑開。

### 字典
- `src/locales/zh-TW.json`：由 antigravity-zh 的簡體字典經 OpenCC（`cn → twp`，轉成台灣用語）轉換後再人工修正。
- `src/locales/zh-TW.extra.json`：針對 App 2.33 補的字串與規則。改完執行 `node merge-extra.js` 合併，下次啟動生效。
- 刻意保留英文：模型名稱、技能名稱、品牌與方案名稱、按鍵名稱、使用者自己的內容。

### 注意
- App 開著時，除錯埠可能讓**本機其他程式**操作 Antigravity；只綁 `127.0.0.1` **不等於有存取驗證**，不要轉發或對外開放。詳見 [安全政策](SECURITY.md)。
- 翻譯引擎（`src/locale.js`、`src/patches/*.jsfrag`）與原始字典來自 [antigravity-zh](https://github.com/wade19990814-hue/antigravity-zh)，MIT 授權，見 `antigravity-zh-tw/LICENSE`。本 repo 不包含它修改 `app.asar` 的指令。

---

## 二、Antigravity 快取與額度觀察 `agy-cache-watch/`

### App 內面板（隨繁中啟動器一起注入）
右上角一排：

```
Gemini ◯87 ◯55 ｜ Claude/GPT ◯100 ◯100 ｜ Argon ◯100   快取 94.9%
```

- **綠色圓環＝模型額度剩餘％**：每組第一個是每週、第二個是五小時。滑鼠停上去看重置時間。50% 以上綠、20–50% 黃、20% 以下紅。每 20 秒自動更新。
- **「快取 xx%」＝目前對話的快取命中率**（含它的子代理合計），點開有**兩個分頁**：
  1. **快取與各模型統計**：
     - 目前對話：支援視窗標題比對與自動跟隨最新對話；每個子代理一列，各自的上下文大小（最後一次呼叫的輸入量）、呼叫次數、命中 0% 的次數，以及每次呼叫的長條圖（紅＝完全沒命中）。
     - 最近 7 天全部：快取讀取／未命中輸入／輸出比例。
     - 各模型：每個模型的命中率，底下列出其中子代理的部分。
     - 各對話：點一下展開，子代理縮排在上層對話底下。
  2. **上下文結構 (Context Breakdown)**：
     - 解碼 `gen_metadata` 的 `1.9.10` 內部分類計數（非公開格式，版本相容性仍須驗證）：**訊息 (Chat Messages)**、**系統工具 (Tools)**、**MCP 工具 (Mcp Tools)**、**系統提示 (System Prompt)**、**Skills**、**外掛目錄 (Plugins)**、**使用者規則 (Rules)**、**子代理定義 (Subagents)**，以及**自上次更新以來**與**可用空間**。
     - 點開底部摺疊清單，可查看每一個工具（例如 `run_command (510 tok)`、`read_file (254 tok)`）與系統提示段落各自的精確 Token 數。
- 快取資料由啟動器每 30 秒呼叫 `agy_cache.py --json` 推入。

### 終端機與網頁
```
python agy_cache.py              # 最近 7 天各模型命中率
python agy_cache.py --watch 10   # 每 10 秒更新
python agy_cache.py --html       # 產生 report.html 並開啟
python agy_cache.py --selftest   # 自我檢查
python agy_cache.py --lang en    # 英文終端機輸出，--html 可產生英文報表
```

### 資料來源（全部唯讀）
- 用量：`~/.gemini/antigravity/conversations/<id>.db` 的 `gen_metadata`。這是沒有公開格式的 protobuf，欄位對照：`1.4.2` 未命中輸入、`1.4.5` 快取讀取、`1.4.3` 輸出、`1.19` 模型名稱（參考 zerodoxxx/ai-usage-dashboard PR #13，並以本機資料核對）。
- 標題與子代理關係：`~/.gemini/antigravity/conversation_summaries.db`（標題在 `preview` 欄；上層對話在 `parent_conversation_id`，子代理名稱在 `agent_name`）。
- 額度：App 本機的 `RetrieveUserQuotaSummary` 介面（設定 →「模型與用量」用的同一個）。需要的 CSRF token（防偽造請求的驗證碼）取自 App 自己存在頁面上的 `window.__APP_CONFIG__.csrfToken`，只在記憶體使用，不印出也不存檔。
- 命中率 ＝ 快取讀取 ÷（快取讀取 ＋ 未命中輸入）。

### 限制
- 舊版 App 的對話（`.pb` 檔）沒有用量欄位，不會出現在統計裡。
- 視窗很窄時，右上角那排可能蓋到標題列的按鈕。

---

## 三、ChatGPT / Codex 快取、額度與上下文結構面板 `codex-cache-watch/`

### App 內面板（透過 `launch-codex-hud.vbs` 啟動注入）
右上角一排：

```
Codex / GPT ◯71 ◯70   快取 97.7%
```

- **額度圓環**：第一個是**五小時限額**剩餘％、第二個是**每週限額**剩餘％，滑鼠停上去看重置時間。
- **點開「快取 xx%」有兩個分頁**：
  1. **快取與各模型統計**：
     - 目前對話（含子代理合計）、每次呼叫命中率長條圖（Sparkline）。
     - 近期全部對話的快取讀取／未命中輸入／輸出比例。
     - 各模型與旗下各子代理（如 Einstein、Kepler、Curie 等）的呼叫次數、0% 次數與快取命中率。
     - 各對話展開明細（子代理自動縮排於母對話下方）。
  2. **上下文結構 (Context Breakdown)**：
     - 顯示 `已使用 XX% (XX.X萬 / 47.5萬)` 與彩色分段長條圖、自動壓縮門檻。
     - 細分 8 大項 Token 佔比：**訊息**、**系統工具**、**MCP 工具**、**系統提示**、**Skills**、**MCP 伺服器指示**、**記憶檔案**、**自訂代理**。
     - 顯示 **自上次更新以來**、**自動壓縮緩衝區**、**可用空間**，以及 **MCP 工具（延遲載入）**、**系統工具（延遲載入）**。
     - 底部可點開展開清單：`▸ MCP 工具`、`▸ Skills`、`▸ 記憶檔案`、`▸ 自訂代理`。

### 使用
英文 HUD 可使用 `codex-cache-watch/launch-codex-hud-en.vbs`，或執行 `node launch-codex-hud.js --lang=en`。原本的 `.vbs` 仍使用繁中。

1. 桌面捷徑 `ChatGPT.lnk` 目標填：
   ```
   C:\Windows\System32\wscript.exe "<放置路徑>\codex-cache-watch\launch-codex-hud.vbs"
   ```
   （啟動器透過 `%LOCALAPPDATA%\Microsoft\WindowsApps\chatgpt-desktop.exe --remote-debugging-port=9340 --remote-debugging-address=127.0.0.1` 啟動官方 Codex 桌面版並自動注入 `hud.js`。）
2. 終端機與網頁模式：
   ```
   python codex_cache.py              # 顯示額度、各模型與子代理命中率、最新對話上下文結構
   python codex_cache.py --html       # 產生 report.html 並開啟
   python codex_cache.py --selftest   # 自我檢查
python codex_cache.py --lang en  # 英文終端機輸出，--html 可產生英文報表
   ```

### 資料來源（全部唯讀）
- `~/.codex/sessions/**/rollout-*.jsonl`：`token_usage_record`（每次呼叫的 `input_tokens`、`cached_input_tokens`、`output_tokens`）、`event_msg.token_count.rate_limits`（五小時與每週額度）、`world_state` 與 `response_item`（系統提示、工具、Skills、記憶與自訂代理結構）。
- `~/.codex/state_5.sqlite` 與 `thread_history_1.sqlite`：對話標題、模型名稱、母子代理關係（`thread_spawn_edges`）與歷史對話步數。


### 統計精度與已知限制

- 有 `token_usage_record` 的對話：快取讀取、未命中輸入、輸出量使用真實紀錄；但 **Codex 上下文分類仍有按字元換算的估算部分**。
- 若只有 SQLite 歷史資料且找不到 rollout：每次呼叫與命中率均為**推估**，HUD 會標明，且不混入模型與全域實測命中率。
- Codex 對話統計目前只掃描指定期間內**最近更新的最多 40 筆對話**，不代表完整帳號歷史用量；若要完整分析大量對話，仍須擴充掃描策略。
- 自動壓縮緩衝區、延遲載入項目及某些 Context 欄位為估算或預設值，非官方保證。請勿用於精密計費。
- 桌面 App 注入方式依賴非公開內部實作；除錯埠開啟期間請避免在不信任的電腦使用。
