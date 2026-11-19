# Agent-Tool

給 Google Antigravity 桌面版（App 2.33，Windows）用的兩個小工具：

| 資料夾 | 用途 |
|---|---|
| `antigravity-zh-tw/` | 不修改 App 檔案，以**繁體中文介面**啟動 Antigravity |
| `agy-cache-watch/` | 在 App 右上角顯示**快取命中率**與**模型額度**，也可在終端機或網頁看 |

兩個資料夾要放在**同一層**（例如都放在 `%USERPROFILE%\.gemini\` 底下），啟動器會自動找到旁邊的 `agy-cache-watch`。

需求：Windows、Node.js 22 以上（內建 `fetch` 與 `WebSocket`）、Python 3（只用標準函式庫）。

---

## 一、繁中啟動器 `antigravity-zh-tw/`

### 原理
- 直接修改 `app.asar` 在 App 2.33 會壞掉（只剩 Electron 預設頁），所以改用**注入**：
  啟動器用 `--remote-debugging-port=9339`（只綁 `127.0.0.1`）開啟 Antigravity，再透過 Chrome DevTools Protocol（CDP，瀏覽器除錯用的通訊協定）把翻譯引擎與字典注入每個視窗。
- 啟動器會一直連著視窗，所以 App 重新載入後會自動再注入；App 關閉後啟動器自己結束。

### 使用
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
- App 開著時，除錯埠可讓**本機其他程式**操作 Antigravity（只綁 127.0.0.1，外部連不進來）。
- 翻譯引擎（`src/locale.js`、`src/patches/*.jsfrag`）與原始字典來自 [antigravity-zh](https://github.com/wade19990814-hue/antigravity-zh)，MIT 授權，見 `antigravity-zh-tw/LICENSE`。本 repo 不包含它修改 `app.asar` 的指令。

---

## 二、快取與額度觀察 `agy-cache-watch/`

### App 內面板（隨繁中啟動器一起注入）
右上角一排：

```
Gemini ◯87 ◯55 ｜ Claude/GPT ◯100 ◯100 ｜ Argon ◯100   快取 94.9%
```

- **綠色圓環＝模型額度剩餘％**：每組第一個是每週、第二個是五小時。滑鼠停上去看重置時間。50% 以上綠、20–50% 黃、20% 以下紅。每 20 秒自動更新。
- **「快取 xx%」＝目前對話的快取命中率**（含它的子代理合計），點開看：
  - 目前對話：每個子代理一列，各自的上下文大小（最後一次呼叫的輸入量）、呼叫次數、命中 0% 的次數，以及每次呼叫的長條圖（紅＝完全沒命中）。
  - 最近 7 天全部：快取讀取／未命中輸入／輸出比例。
  - 各模型：每個模型的命中率，底下列出其中子代理的部分。
  - 各對話：點一下展開，子代理縮排在上層對話底下。
- 快取資料由啟動器每 30 秒呼叫 `agy_cache.py --json` 推入。

### 終端機與網頁
```
python agy_cache.py              # 最近 7 天各模型命中率
python agy_cache.py --watch 10   # 每 10 秒更新
python agy_cache.py --html       # 產生 report.html 並開啟
python agy_cache.py --selftest   # 自我檢查
```

### 資料來源（全部唯讀）
- 用量：`~/.gemini/antigravity/conversations/<id>.db` 的 `gen_metadata`。這是沒有公開格式的 protobuf，欄位對照：`1.4.2` 未命中輸入、`1.4.5` 快取讀取、`1.4.3` 輸出、`1.19` 模型名稱（參考 zerodoxxx/ai-usage-dashboard PR #13，並以本機資料核對）。
- 標題與子代理關係：`~/.gemini/antigravity/conversation_summaries.db`（標題在 `preview` 欄；上層對話在 `parent_conversation_id`，子代理名稱在 `agent_name`）。
- 額度：App 本機的 `RetrieveUserQuotaSummary` 介面（設定 →「模型與用量」用的同一個）。需要的 CSRF token（防偽造請求的驗證碼）取自 App 自己存在頁面上的 `window.__APP_CONFIG__.csrfToken`，只在記憶體使用，不印出也不存檔。
- 命中率 ＝ 快取讀取 ÷（快取讀取 ＋ 未命中輸入）。

### 限制
- 舊版 App 的對話（`.pb` 檔）沒有用量欄位，不會出現在統計裡。
- Antigravity 沒有記錄「訊息／工具／系統提示各佔多少」，所以只能顯示上下文總量，無法分類。
- 視窗很窄時，右上角那排可能蓋到標題列的按鈕。
