# 新增 JSON 格式化工具 (JSON Format) - Final Implementation

本計畫基於 `/create-new-page` 標準流程，新增一個獨立的「JSON 格式化工具」頁面。開發目標為打造一個極度輕量、流暢、並具有現代化操作體驗的開發輔助工具。此文件記錄最終的實作架構與設計決策。

## 💡 最終設計決策 (Design Decisions)

1. **輕量化優先 (Lightweight Native approach)**：
   為了維持平台「秒開」的特性，決定不引入諸如 `Monaco Editor` 這種巨大的第三方編輯器套件。左側維持使用原生的 `<textarea>` 負責高負載的純文字輸入，而右側則自行打造無依賴的 `<JsonViewer>` 來負責互動式的渲染與著色。
2. **狀態驅動與防抖 (State & Debounce)**：
   有別於傳統「貼上內容後點擊 Format 按鈕」的使用流程，本工具採用「Continuous Active Mode (持續啟動模式)」並加入 400ms 的防抖 (Debounce) 機制。只要貼上或修改字串，結果能即刻顯示，不卡頓且不需額外點擊。
3. **現代 UI/UX**：
   引入更現代的「膠囊切換組件 (Segmented Control)」、「懸浮清空按鈕 (玻璃特效)」與「暗色現代滾動條」，搭配極簡的 `Popover` 使用語法說明，降低介面雜訊。針對手機小螢幕，自動將獨立高度縮減，確保「上下堆疊」時可以同時瀏覽一塊完整的輸入與半塊輸出區。

---

## 🚀 核心功能與模式 (Core Features)

系統依據當前啟動的 `activeMode` 狀態（支援防抖即時切換）包含五種強大功能：

1. **格式化 (Format)**：
   - 包含自動修正常見非標準寫法（如：尾部多餘逗號、跳脫問題）。
   - **實作支援互動式折疊檢視 (`JsonViewer`)**。
2. **轉 TypeScript (JSON to TS)**：
   - 使用專業級遞迴抽取演算法，支援嵌套陣列與嵌套物件的獨立 Interface 抽取命名（例如從 `contactPersons` 陣列解構出 `ContactPerson` Interface）。
   - 完全遵循 JSON 原始欄位排序，不會強制以 A-Z 重排，還原最真實的後端資料結構。
3. **屬性排序 A-Z (Sort Keys)**：
   - 能夠將深深層次的整個物件，依照其屬性 (Key) 的字母排序，以便比對相同結構不同順位的 JSON 資料。
   - **實作支援互動式折疊檢視 (`JsonViewer`)**。
4. **轉義 (Escape)**：
   - 將標準 JSON 轉換為含有斜線跳脫字元 (`\"`) 的純字串。
5. **壓縮 (Minify)**：
   - 剔除所有空白、換行與多餘字元，提供最小的傳輸 Payload String。

---

## 🏗️ 模組架構設計 (Architecture)

### 1. 核心邏輯層 Store (`useJsonFormatStore.ts`)

整合 Zustand 作為唯一的 Truth of Source，並負責：

- 透過 `persist` 實踐自動暫存 (`localStorage`)。
- 在 `useEffect` 當中利用 400ms 的計時器 (Timeout) 負責推動物件解析與自動防抖切換。
- 保護解析失敗的操作：當解析發生錯誤（`try-catch` JSON.parse failure）時，只會顯示警告 `Alert`，保留先前最後成功的結果，以此提升編寫中的寬容度。

### 2. 資料處理演算法 (`jsonUtils.ts`)

包含：

- 自訂強制的 `escape / unescape` 正則運算防呆。
- `generateTypeScript` 抽取與轉換邏輯：判斷物件或陣列、防碰撞、合併基礎屬性。

### 3. 客製化視覺檢視器 (`JsonViewer.tsx`)

- 一個**無任何外部套件依賴**的遞迴 React Component。
- 將標準物件渲染為類似 VSCode 風格的 `<div>/<span>`。
- 賦予 Key / String / Number / Boolean 不同的色彩辨識。
- 利用 `useState(true)` 實作物件的 `[ + ] / [ - ]` 展開與縮合功能，且支援預覽折疊狀態（例：`[ 8 items ]`）。

### 4. 主畫面呈現 (`jsonFormatPage.tsx`)

- **左方 (輸入區)**：綁定隱藏的 `<input type="file" />` 負責載盤 JSON 檔案，以及提供一鍵清除輸入的互動。
- **右方 (輸出區)**：包含下載、一鍵複製 (Copy API)，並**動態判斷**若是純文字/轉義狀態渲染 `<textarea>`，若是符合結構狀態渲染 `<JsonViewer>`。
- **統一由 Grid Bootstrap** 提供橫框 `12-col` 切分與響應式跳轉。
