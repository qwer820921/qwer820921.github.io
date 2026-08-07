# 下班倒數（clockOut）炫耀分享功能 — 設計文件

> 狀態：已與使用者確認，待轉入實作計畫。

## 一、目標

在 `clockOut` 頁面新增「複製圖片」「複製文案」兩個分享動作，讓使用者可以把當下的下班倒數畫面（或文字版摘要）貼到聊天室/社群炫耀進度或戰績。**不做下載功能**（複製圖片在瀏覽器不支援時才自動退回下載，屬備援而非主要行為）。

## 二、UI 佈局

### 桌面（>640px）

- 左上角：既有「🕘 上班設定」按鈕（`SettingsControl`），維持原行為（點擊展開設定彈窗）。
- 右上角：新增兩顆堆疊按鈕（`ShareControls`）：
  - `📷 複製圖片`
  - `📝 複製文案`
- 兩者都用 `position: absolute`，相對於 `.container`（已是 `position: relative`），比照現有 `.clockInCorner` 的視覺風格（像素風邊框、陰影）。
- 點擊後直接觸發對應動作（無彈窗），按鈕旁以既有 `copied` state 慣例（參考 `jsonFormat`、`mapEditor` 的 `handleCopy` 模式）顯示「✓ 已複製」等提示文字，1.8~2 秒後恢復。

### 手機（≤640px）

- 「上班設定」「複製圖片」「複製文案」三顆按鈕改由共用的頂部 flex 容器管理（`flex-wrap: wrap; justify-content: center; gap`），置中並排、視窗更窄時自動換行。
- 需調整 `SettingsControl.tsx`：移除元件自帶的 `.clockInCorner` 絕對定位包裹層，改由外層共用容器統一控制左右/置中定位（桌面 vs 手機兩種模式）。

### 慶祝畫面互動

- 「已下班」100% 觸發的全螢幕慶祝動畫（`.celebrate`，`z-index: 1080`）會蓋住分享按鈕（`z-index: 30`），維持現況：使用者需先點掉慶祝畫面才能操作分享按鈕，不特別處理。

## 三、複製圖片 — 內容與範圍

- 擷取對象：`.screen` 這個 div 當下渲染出的畫面 —— 現在時間、狀態 pill（上班中/已下班/尚未開工）、倒數大字、EXP 進度條、鼓勵語文字；若當下為「已下班」狀態，畫面內的水豚圖 + 提示文字（`.doneInline`）也一併包含在內（因為它就在 `.screen` 節點內）。
- **不含**：左上角設定按鈕、右上角分享按鈕本身、底部圖例文字、頁面背景。
- 技術方案：使用 `html-to-image` 套件（新增 npm 依賴），對 `.screen` 節點呼叫 `toBlob()` 產生 PNG blob。
- 複製方式：優先呼叫 `navigator.clipboard.write([new ClipboardItem({ "image/png": blob })])` 寫入剪貼簿；若瀏覽器不支援 `ClipboardItem`/`clipboard.write`，或呼叫失敗，**自動退回觸發瀏覽器下載該 PNG**（作為備援，不視為錯誤，UI 提示文字相應改為「已下載圖片」）。下載檔名格式：`clockout-YYYYMMDD-HHmm.png`（依複製當下時間，例如 `clockout-20260807-1710.png`）。

## 四、複製文案 — 內容與範圍

用 `navigator.clipboard.writeText()` 複製一段純文字，依三種狀態（`ClockState.status`）分別產生內容：EXP 進度條用 20 格 `▓`/`░` 依百分比換算（`Math.round(pct / 100 * 20)` 個 `▓`），最後一行帶上目前進度對應的鼓勵語（`cheerFor(pct)` 或 `BEFORE_CHEER`，與畫面顯示的鼓勵語同步）。**不含**宣傳連結（先不加，未來可考慮）。

### 上班中（work）

```
現在時間是 17:10。

距離您 17:50 下班，還有 40 分鐘。

下班倒數進度
EXP [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░] 92.45%
進度過半，摸魚更心安 🐟
```

剩餘時間格式比照畫面主倒數數字：有小時時顯示「N 小時 M 分鐘」，不足一小時只顯示「M 分鐘」。

### 尚未開工（before）

```
現在時間是 08:30。

距離 09:00 上班，還有 30 分鐘。

下班倒數進度
EXP [░░░░░░░░░░░░░░░░░░░░] 0.00%
還沒開工，享受最後的自由 😌
```

### 已下班（done）

```
現在時間是 18:05。

18:00 已下班，自由了！🕊️

下班倒數進度
EXP [▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓] 100.00%
下班啦！你自由了 🕊️
```

## 五、技術架構

### 新增檔案

```
src/app/(tools)/clockOut/
├── components/
│   └── ShareControls.tsx        # 複製圖片 / 複製文案 按鈕
├── utils/
│   ├── shareImage.ts            # html-to-image 擷取 + 剪貼簿/下載
│   └── shareText.ts             # 三種狀態文案組字 + ASCII EXP 條
```

### 修改檔案

- `clockOutPage.tsx` — 新增 `screenRef`（`useRef<HTMLDivElement>`，掛在 `.screen` div 上）；用 `buildShareText()` 算出當下文案字串，傳給 `ShareControls`；把 `SettingsControl` 與新的 `ShareControls` 一起包進共用頂部 flex 容器。
- `SettingsControl.tsx` — 移除自帶 `.clockInCorner` 絕對定位包裹層（定位權交給外層共用容器）。
- `styles/clockOut.module.css` — 新增分享按鈕樣式（比照 `.clockInBtn`）、共用頂部容器的桌面/手機版型（含既有 `@media (max-width: 640px)` 區塊調整）。
- `package.json` — 新增依賴 `html-to-image`。

### 資料流

- `shareText.ts` 匯出純函式 `buildShareText(state: ClockState, nowMin: number, clockInTime: string, effectiveEnd: string): string`，不吃 DOM；`clockOutPage.tsx` 每次 render 都重新算好傳入 `ShareControls`，複製的即是使用者按下當下那一刻的文案。
- `shareImage.ts` 匯出 `copyScreenAsImage(node: HTMLElement): Promise<"clipboard" | "download">`，內部用 `html-to-image` 的 `toBlob()` 產生 PNG blob，依序嘗試「寫入剪貼簿」「退回下載」，回傳實際發生的結果供 UI 顯示對應提示文字。
- `ShareControls` 是純展示型元件，不接觸 Zustand store、不算時間，只吃 `screenRef` + `shareText` 兩個 prop，呼叫上述兩個 util 並管理按鈕的 `copied`/提示文字 local state（與 `SettingsControl` 同樣「笨元件」分工原則）。

## 六、錯誤處理

- `copyScreenAsImage` 中 `toBlob()` 理論上不會丟例外（畫面內素材皆同源、無外部圖片，不會 taint canvas）；若真的失敗則顯示「截圖失敗」提示。
- `clipboard.write` 不支援或被使用者拒絕權限 → 視為預期情境，靜默改走下載，不當錯誤處理。
- `writeText`（複製文案）失敗（少數瀏覽器要求使用者手勢或未取得剪貼簿權限）→ `catch` 後顯示「複製失敗，請手動選取」提示 3 秒。

## 七、測試方式

專案 `clockOut` 目前沒有任何自動化測試，也未安裝單元測試框架，本次不額外引入。改用手動驗證：

1. `npm run build` 確認型別/建置正常。
2. `npm run dev` 手動用 `SettingsControl` 調整上/下班時間，涵蓋三種狀態（上班中／尚未開工／已下班）分別測試複製圖片與複製文案。
3. 桌面寬度與手機（≤640px）寬度分別確認按鈕排版。
4. Chrome 等支援 `ClipboardItem` 的瀏覽器驗證貼上結果與畫面一致。
5. 模擬不支援情境（或用不支援的瀏覽器/裝置）驗證自動退回下載且檔案可正常開啟。

## 八、範圍外（Out of Scope）

- 下載功能作為主要功能（僅作為圖片複製失敗時的備援）。
- 文案內建宣傳連結（先不加，未來可考慮再加一行 `https://qwer820921.github.io/clockOut`）。
- 自動化測試框架導入。
- 分享到特定社群平台（如直接呼叫 LINE/Twitter 分享 API）。
