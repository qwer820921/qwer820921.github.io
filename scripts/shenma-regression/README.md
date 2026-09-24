# 神馬三國回歸測試

三層測試，外加一組工具自我測試：

1. **Godot headless 測試**（`godot-check.sh`）：在暫存目錄匯入 → debug 匯出 → 與交付產物核對 → 執行 `godot/lifecycle_test.gd`。任何一步失敗都以非零結束。
2. **瀏覽器回歸**（Playwright MCP 的 `browser_run_code_unsafe`，`filename` 參數）：跑本機 `next dev` 與 `public/games/shenmaSanguo/` 的實際產物，後端全部 mock。
3. **工具自我測試**（`tools/selftest.mjs`）：用刻意製造的 fixture 確認產物核對與 log 檢查「該失敗時一定失敗」。
4. **玩家存檔 store 測試**（`web/player-store.test.mjs`）：在 Node 內執行 `playerStore.ts`，每個 GAS 請求的成功／失敗與回應順序、以及計時器都由測試控制，驗證登入、切換帳號與同步的非同步規則。

所有寫入都不會送到正式 GAS／Sheets。截圖與結果 JSON 的證據放在 `.handoff/evidence/`（已 gitignore）。

## 需要的工具

| 工具           | 版本／位置                                                                                                        |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Node.js／npm   | 20.x／10.x（`npm ci`）                                                                                            |
| Godot 編輯器   | **4.6.2-stable**（`Godot_v4.6.2-stable_win64_console.exe`），可攜版，不改 PATH                                    |
| Web 匯出模板   | 放在編輯器同層的 `editor_data/export_templates/4.6.2.stable/`（編輯器旁需有 `_sc_` 檔，使用 self-contained 模式） |
| Git Bash       | 需要 `realpath`、`mktemp`、`timeout`、`cygpath`（Git for Windows 內建）                                           |
| Playwright MCP | 只有瀏覽器回歸需要                                                                                                |

取得模板：官方 tpz 有 1.25 GB，`tools/extract-web-templates.mjs` 會用 HTTP Range 只取出 `web_nothreads_release.zip`、`web_nothreads_debug.zip`、`version.txt`，並以 zip 內記錄的 CRC32 驗證（這是 zip 內部完整性，不等於官方 tpz 的 SHA512 校驗）：

```bash
node scripts/shenma-regression/tools/extract-web-templates.mjs "<編輯器目錄>/editor_data/export_templates/4.6.2.stable"
```

## 1. Godot 端（`godot-check.sh`）

```bash
GODOT="<編輯器目錄>/Godot_v4.6.2-stable_win64_console.exe" \
  bash scripts/shenma-regression/godot-check.sh [工作目錄]
```

**工作目錄**：省略時用 `mktemp -d` 建立唯一的新目錄。指定時必須「不存在」或「是空目錄」，而且不能是倉庫本身、倉庫的上層或倉庫內的目錄（Windows 上 `C:/…`、`/c/…` 與大小寫差異都會正規化後再比對），否則直接拒絕、結束碼 2。腳本**不刪除任何檔案或目錄**，跑完的 log 與產物都留在工作目錄。

**流程與判定**（任一項失敗 → 最後結束碼 1，並列出失敗項目）：

| 步驟     | 內容                                                                                                                     | 失敗條件                                                                                                                                                      |
| -------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 版本     | `--version`                                                                                                              | 不是 `4.6.2.stable.*`                                                                                                                                         |
| 複製     | 只複製 `godot/shenmaSanguo/` 中**版本控制內**的檔案（取工作區內容）；有未追蹤檔會提示                                    | 複製失敗                                                                                                                                                      |
| 匯入     | `--import`                                                                                                               | 結束碼非 0、逾時，或 log 有任何 `ERROR`／`SCRIPT ERROR`／`Parse Error`                                                                                        |
| 匯出     | `--export-debug "Web"`（與目前正式產物相同的 `web_nothreads_debug` 模板）                                                | 同上                                                                                                                                                          |
| 產物核對 | `tools/verify-export.mjs`：本次匯出 vs 交付產物（預設工作區 `public/games/shenmaSanguo`）                                | 有任何不允許的差異（見下方）                                                                                                                                  |
| 測試     | 把 `godot/` 整個複製到另一份暫存專案的 `res://__regression__/`，執行 `TEST_SCRIPT`，再用 `tools/check-log.mjs test` 檢查 | 結束碼非 0、逾時、`SCRIPT ERROR`／`Parse Error`、不在允許清單的 `ERROR`、沒有剛好一行 `RESULT_JSON`、`failed≠0`、`total=0`、`PASS` 行數≠`total`、有 `FAIL` 行 |

**產物核對只允許兩種已知的隨機差異**，其他內容（包含所有 `.gdc`、`uid_cache.bin`、引擎檔、`index.html`）都必須逐位元組相同：

1. `index.pck` 內 `*.scn` 的 `node_ids` 陣列內容：專案的 `.tscn` 沒有 `unique_id`，每次匯出隨機產生。工具會在二進位資源中找到 `node_ids` 這個 PackedInt32Array，只把它的元素清零後再比對，其餘位元組必須相同。
2. `index.service.worker.js` 的 `const CACHE_VERSION = '…';` 那一行（匯出時間戳）。

文字檔（前 8000 bytes 沒有 NUL，與 git 的判定相同）比較時把 CRLF 視為 LF：本機 `core.autocrlf=true` 會讓未修改的檔案在工作區是 CRLF，提交時再轉回 LF。

**測試 log 允許的 ERROR**（定義在 `tools/check-log.mjs` 的 `ALLOWED_TEST_ERRORS`）：

- `Resource file not found: res://assets/tiles/tile_(dirt|grass).webp`：`Main.gd` 在非 Web 平台會自動注入內建測試 payload，其中的貼圖名稱不存在（實際檔名帶編號）；正式 Web 產物不會走到。
- `[BattleManager] 拒絕開始第 N 波：…`：R3-E 系列測試刻意載入無效波次，驗證拒絕開戰時輸出的錯誤。

**選用環境變數**：

| 變數           | 說明                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `PUBLIC_DIR`   | 要核對的交付產物目錄（預設工作區的 `public/games/shenmaSanguo`）                                 |
| `TEST_SCRIPT`  | 要執行的測試（預設 `res://__regression__/lifecycle_test.gd`）                                    |
| `COMPARE_HEAD` | 設為 `1` 時另外用 `tools/pck-diff.mjs` 列出與 HEAD 版 `index.pck` 的差異（僅供診斷，不影響結果） |

**更新 `public/`**：runner 不會寫入倉庫。確認「測試通過、只有產物核對失敗（原始碼改了、產物還是舊的）」之後，把工作目錄 `export/` 內的 `index.pck`、`index.html`、`index.service.worker.js` 複製到 `public/games/shenmaSanguo/`（其餘檔案屬於引擎模板，版本不變時完全相同），**再用新的工作目錄完整重跑一次**，全部通過才算完成。

目前正式產物使用的是 **debug** 模板（`public/index.wasm` 與官方 `web_nothreads_debug` 的 wasm 逐位元組相同），所以這裡用 `--export-debug`。

### lifecycle_test.gd 涵蓋範圍

- I2：出兵間隔中切關、A→B→A、同關重開、自動下一波等待窗口內切關／關閉自動／同關重開、重複清波通知。
- N：自動三波、最後一隻漏怪判負、手動兩波蓋塔的擊殺與漏怪計數。
- R3：混合敵人組（缺設定組在第一／中間／最後、無路徑組、`count=0`、空白列、正常多組、自動模式）在清波當下必須「有效敵人全部生成且處理完」，且每波只發一次 `wave_all_spawned`／`wave_cleared`；整波無效（全部組無效、空波、波次缺號、自動模式中途遇到無效波）必須拒絕開戰、不結算，並能切到有效關卡恢復。
- 大部分案例只用公開行為判定，可以拿同一支測試對照修正前後；R3-E 的「拒絕信號」檢查需要新版的 `wave_start_rejected` 信號。

### 失敗 fixture

`godot/fixtures/` 內的腳本用來確認 runner 不會誤報通過，每一支都必須讓 `godot-check.sh` 以結束碼 1 結束：

```bash
TEST_SCRIPT=res://__regression__/fixtures/exit0_with_fail.gd GODOT=… bash scripts/shenma-regression/godot-check.sh
```

| fixture               | 情境                                              |
| --------------------- | ------------------------------------------------- |
| `fail_assert.gd`      | 有 FAIL、結束碼 1                                 |
| `exit0_with_fail.gd`  | 有 FAIL，但結束碼 0                               |
| `script_error.gd`     | 執行期 SCRIPT ERROR，但檢查全通過、結束碼 0       |
| `unexpected_error.gd` | 不在允許清單的 `push_error`，檢查全通過、結束碼 0 |
| `no_result.gd`        | 沒有輸出結果就以結束碼 0 結束                     |

產物核對的失敗情境可用 `PUBLIC_DIR` 指向舊產物（例如從 `git show HEAD:…` 取出的目錄）驗證。

## 2. 工具自我測試（不需要 Godot）

```bash
node scripts/shenma-regression/tools/selftest.mjs public/games/shenmaSanguo
```

複製交付產物到系統暫存目錄後逐一製造差異，確認 `verify-export.mjs` 只放行「node_ids、CACHE_VERSION、換行」三種差異，`.gdc`、`.scn` 其他位元組、`uid_cache.bin`、SW 其他內容、`index.html`、多出檔案都會失敗；並用合成 log 確認 `check-log.mjs` 對 ERROR／SCRIPT ERROR／Parse Error／FAIL／缺 RESULT_JSON／total=0 都會失敗。每個 fixture 也會檢查「確實改到了檔案」，避免允許差異的案例空過。不會修改傳入的目錄。

## 3. 玩家存檔 store 測試（不需要瀏覽器）

```bash
node scripts/shenma-regression/web/player-store.test.mjs
```

- 用專案內的 `typescript` 即時轉譯 `playerStore.ts` 與相依模組（不需要額外套件），並提供假的 `localStorage`／`sessionStorage`、`fetch` 與計時器。
- mock 後端的每個請求都可以停在「待回應」，由測試決定何時成功、回傳後端錯誤或網路錯誤；30 秒 debounce 等計時器只在測試推進時間時才會觸發，不靠固定等待。
- 涵蓋 Round 4 驗收案例 1～8：登入失敗不建檔、建檔失敗不報成功、連按不重複建檔、A 慢 B 快不互相覆蓋、切換前先保存、重新整理後補送（Pending／Syncing／舊版 session）、Idle 不補送、session key 不符不跨帳號寫入、在途保存與背景讀取不覆蓋新修改、手動同步失敗保留資料、升級與戰鬥結算的相容修正。
- 輸出 PASS／FAIL 各行與一行 `RESULT_JSON`；有任何失敗時結束碼為 1。

## 4. 瀏覽器回歸

前置：`npm run dev`（`http://localhost:3000`）。**同一時間不要跑 `npm run build` 或 `tsc`**，避免 `.next` 被同時寫入。

依序在 Playwright MCP 執行（`browser_run_code_unsafe`，`filename` 為倉庫相對路徑）：

| 順序 | 檔案                          | 內容                                                                                                                                                                       |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0    | （先 `browser_close`）        | 確保是全新的 browser context                                                                                                                                               |
| 1    | `harness.js`                  | **導覽前**安裝網路防線（GAS 寫入一律 abort、GA／AdSense 一律 abort）、頁面內 mock、Godot 訊息紀錄；清掉 Service Worker、Cache Storage 與 storage                           |
| 2    | `i1-init.js`                  | I1：全新玩家、後端已有金鑰但本機無快取、已有 session、設定失敗後重試（全程不重新整理）                                                                                     |
| 3    | `i2-lifecycle.js`             | I2：出兵間隔中切關、A→B→A、同關重開                                                                                                                                        |
| 4    | `auto-timer.js`               | 自動下一波 1.5 秒窗口內切關／關閉自動／同關重開、多次切換自動的 React 同步                                                                                                 |
| 5    | `normal-flows.js`             | 手動兩波勝利（蓋塔）、自動勝利、落敗；每場只結算一次、擊殺＋漏怪計數一致、結算寫回 mock                                                                                    |
| 6    | `r3-mixed.js`                 | R3：混合組不提前結算、無效波拒絕開戰（迎戰與自動）且不給獎勵、拒絕後切到有效關卡恢復                                                                                       |
| 7    | `artifacts-and-network.js`    | 瀏覽器實際取得的產物 SHA-256、iframe 載入的大小、SW 快取版本，以及整段期間的 GAS／SCRIPT ERROR／pageerror 統計                                                             |
| 7b   | `r4-web.js`                   | R4：登入失敗顯示原因並可重試／更換金鑰、建檔失敗不報成功、切換帳號前先保存（失敗就擋下）、Pending 與 Syncing 重新整理後補送、Idle 不補送、手動同步失敗保留資料、升級 smoke |
| 8    | `fixtures/deliberate-fail.js` | 刻意失敗的 fixture（見下方）；會汙染錯誤紀錄，所以放在最後或另開 context                                                                                                   |

**判定方式**：每支情境腳本都用 `H.begin()` 建立判定、`run.check()` 累積斷言，最後 `run.finish()` 回傳：

- `allPass`：所有斷言都通過才是 `true`；`failures` 列出失敗的斷言名稱，`assertions` 有每一項的細節。
- `finish()` 會自動加上共通防線：**SCRIPT ERROR**、**非預期的 console error**（腳本可用 `expectedConsole` 宣告預期內的錯誤，例如 `r3-mixed.js` 的拒絕開戰）、**pageerror**、**GAS 放行（外洩）**，以及 mock 模式下 **GAS 出現在網路層**（代表 mock 被繞過），任何一項都會讓 `allPass=false`。
- 執行者必須檢查每支腳本回傳的 `allPass`，不能只看腳本有沒有跑完。

**刻意失敗的 fixture**：`fixtures/deliberate-fail.js` 會製造一個不成立的斷言、一行 SCRIPT ERROR、一個非預期 console error、一個 pageerror，並從 iframe 對 GAS 網址（不存在的部署 ID）發出請求。預期回傳 `fixtureWorks: true`（`allPass=false` 且上述 5 項都列在 `failures`）；`probe` 會記錄這個請求是否被網路防線看到、是否經由 Service Worker 轉發。

**控制 mock 回應**（`r4-web.js` 使用）：

- `localStorage.__shenma_mock_fail` = `{ action: 次數 }`：接下來幾次回應 `status 500`。
- `localStorage.__shenma_mock_netfail` = `{ action: 次數 }`：接下來幾次模擬網路錯誤（`fetch` 拋出 `TypeError`）。
- `window.__shenmaMock.hold(action)`：之後的請求停在待回應，直到 `window.__shenmaMock.release(action, "ok" | "fail" | "network")`；只存在記憶體，重新整理後自動清除。用它讓 beforeunload 的 keepalive 請求卡住並隨頁面消失，就能確定後端資料來自重新整理後的補送。
- mock 紀錄會附上 `save_profile` 實際收到的暱稱、隊伍與點數，測試據此斷言後端資料，而不只看 UI。

注意事項：

- MCP 的執行環境沒有 `URL`、`setTimeout` 等非 ECMAScript 全域物件，腳本內一律改用 `page.waitForTimeout` 與正規表示式。
- 腳本檔是一個函式運算式，不是模組：ESLint 與 Prettier 只排除 `scripts/shenma-regression/*.js` 與 `scripts/shenma-regression/fixtures/*.js`（Prettier 會補上結尾分號，破壞 MCP 的包裝）；`tools/*.mjs` 照常檢查與格式化。
- Godot 狀態透過唯讀的 `debug_snapshot` 訊息讀取（`Main.gd` 的 `_on_debug_snapshot_requested`）。回應不含玩家金鑰或存檔，也不接受修改遊戲狀態；刻意不含 `stage_id`／`result` 欄位，避免 React 誤判為結算訊息。
- Playwright MCP 會在倉庫根目錄產生 `.playwright-mcp/`（已 gitignore）。
