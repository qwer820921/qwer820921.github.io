# 《神馬三國 (JS版)》專案目標與開發原則規範

> 文件版本：1.0.0  
> 建立日期：2026-10-06  
> 適用範圍：`src/app/(games)/shenmaSanguoJs/` 及其所有子模組

---

## 一、核心目標 (Core Objectives)

1. **擺脫 Godot WebAssembly 依賴**：
   - 原版神馬三國使用 Godot 4.x 匯出之 WebAssembly (.wasm) 與資源包 (.pck)，初始包體超過 30MB 且需 iframe 橋接。
   - 本專案定案採用 **原生 HTML5 Canvas 2D** 作為首選實作（0 依賴、不更動 `package.json`、秒開輕量）；並以解耦架構將 **PixiJS v8** 保留為未來視覺特效升級之備用方案。
2. **完整對齊原版規則與數值**：
   - 遊戲規則、數值體系、波次邏輯、13 位武將技能（馬超衝鋒、趙雲閃避、黃忠百步穿楊、周瑜火攻等）以及關卡地圖規格，**100% 嚴格對齊原版神馬三國**。
   - 詳細規格依據請參閱：[`original-feature-inventory.md`](./original-feature-inventory.md)。

---

## 二、資料與資源來源 (Data & Asset Sources)

本專案採「輕量化、不重複發明輪子」原則，所有資產與服務皆唯讀沿用既有專案成果：

1. **圖檔資源 (Assets)**：
   - 完全使用 `public/images/shenmaSanguo/` 下現有圖檔：
     - 地圖瓦片：`public/images/shenmaSanguo/tiles/` (`tile_grass1.webp` ~ `tile_grass9.webp`, `tile_stone.webp` 等)。
     - 單位立繪與攻擊影格：`public/images/shenmaSanguo/units/`（包含所有武將、敵軍、防禦塔之常態與 `_atk` 圖檔）。
   - **禁止新增未授權之重複圖檔或擅自修改原版圖片路徑**。
2. **API 與狀態存檔 (Backend & Storage)**：
   - 唯讀引用現有模組：
     - API 服務層：`@/app/(games)/shenmaSanguo/api/gameApi`（包含 GAS 通訊、唯讀請求自動重試、結算契約）。
     - 玩家狀態管理：`@/app/(games)/shenmaSanguo/store/playerStore`（`SessionPlayerState`, 版本號 `serverRev` / `base_rev` 樂觀鎖保護）。
     - 靜態資料快取：`@/app/(games)/shenmaSanguo/store/staticConfigStore`（Google Sheets 設定表）。
     - 技能定義：`@/app/(games)/shenmaSanguo/utils/heroSkills`。

---

## 三、⛔ 嚴格邊界限制 (Strict Boundary Constraints)

本專案設有最嚴格的檔案變更邊界限制，所有 AI 助手與開發者皆必須嚴格遵守：

```
+-------------------------------------------------------------+
|                許可變更範圍 (Allowed Scope)                 |
|            src/app/(games)/shenmaSanguoJs/**                |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                禁止變更範圍 (Forbidden Scope)               |
|            除上述目錄以外之所有專案檔案與設定               |
+-------------------------------------------------------------+
```

1. **目錄限制**：
   - **所有新增程式碼、重構模組、樣式檔與文件，僅限於 `src/app/(games)/shenmaSanguoJs/` 目錄內**。
2. **外部檔案凍結**：
   - **絕對不得修改 `src/app/(games)/shenmaSanguoJs` 之外的任何檔案**（包含但不限於原版 `shenmaSanguo`、`public/`、全域設定、`package.json` 等）。
3. **例外處理程序（事前確認機制）**：
   - 若在開發過程中遇到技術架構阻礙（例如需安裝額外 npm 套件因而需變動 `package.json`，或原版共用型別有致命阻斷非改不可），**必須先向專案負責人（User）提出詳細說明與影響評估，取得確認授權後，方可進行外部修改**。未獲許可前嚴禁擅自改動。

---

## 四、架構設計準則

在 `src/app/(games)/shenmaSanguoJs/` 內部實作時，遵循以下分層結構：

```
src/app/(games)/shenmaSanguoJs/
├── components/               # React UI 層（HUD、操作面板、彈窗）
├── doc/                      # 開發文件、規範與實作計畫
│   ├── project-guidelines.md          # 本規範文件
│   ├── original-feature-inventory.md  # 原版完整功能盤點
│   └── implementation_plan.md         # 實作開發計畫
├── engine/                   # 純 JS 戰鬥邏輯與渲染引擎核心
│   ├── GameLoop.ts           # 固定時間步長主迴圈、倍速與暫停
│   ├── CanvasRenderer.ts     # Canvas 2D 表現繪製層
│   ├── AssetLoader.ts        # 圖片快取載入器
│   ├── MapEngine.ts          # 地圖網格與航點解析
│   ├── WaveController.ts     # 波次排程與出怪邏輯
│   ├── UnitController.ts     # 武將與防禦塔邏輯
│   └── SkillTrigger.ts       # 武將技能狀態機
├── store/                    # 本頁面專屬之戰鬥狀態（若需要）
├── styles/                   # CSS Modules 樣式
├── types/                    # 本模組專屬型別定義
└── page.tsx                  # 路由進入點
```
