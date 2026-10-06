# 神馬三國 (JS版) 重構實作計畫

> 專案名稱：重構神馬三國js渲染版  
> 分支：`refactor/shenma-sanguo-web-render`  
> 建立日期：2026-10-06  
> 核心目標：**強調純前端渲染**，擺脫 Godot WebAssembly 龐大引擎資源包與載入等待，打造極速載入且相容既有數值、技能與關卡規格的 Web 渲染戰鬥核心。  
> 📌 **開發原則與邊界限制規範**：請嚴格遵守 [`project-guidelines.md`](./project-guidelines.md)（嚴禁改動本模組外之檔案）  
> 📖 **完整功能清單與數值規格**：請參閱 [`original-feature-inventory.md`](./original-feature-inventory.md)

---

## 1. 背景與重構動機

1. **引擎包體過大**：
   - 目前 Godot 4.x 匯出之 WebAssembly (.wasm) 與資源包 (.pck) 合計超過 30MB。
   - 在弱網環境或手機瀏覽器中初次載入耗時較長。
2. **純前端生態整合度高**：
   - 藉由純 JavaScript / TypeScript 與 HTML5 Canvas (或 PixiJS / WebGL) 渲染，可直接在 Next.js / React 應用內深度整合，無需透過 iframe postMessage 橋接協定通訊。
   - 除錯工具直接使用 Chrome DevTools，提高維護性與響應速度。
3. **保留既有資產與數值系統**：
   - 完全沿用 Google Sheets 的 `heroes_config`、`stages`、`enemies`、地圖網格等設定。
   - 沿用已通過測試的結算合約、存檔版本保護（`serverRev`、`base_rev`）與武將技能規格。

---

## 2. 架構設計

```mermaid
flowchart TD
    A[React UI 層 (Next.js / react-bootstrap)] --> B[Zustand 狀態層 (playerStore / battleStore)]
    B --> C[戰鬥引擎控制器 (BattleEngine)]
    C --> D[戰鬥邏輯層 (Ticker, WaveManager, UnitManager, Collision, Skills)]
    C --> E[純前端渲染層 (CanvasRenderer / PixiRenderer)]
    D --> E
    B --> F[API 服務層 (GAS / Sheets 同步與存檔)]
```

### 2.1 渲染引擎選型決策（2026-10-06 定案）

- **定案方案**：**原生 HTML5 Canvas 2D（首選實作）**
  - **核心優勢**：0 外部依賴、完全不更動 `package.json`（遵守邊界約束）、極致輕量秒開，同屏數十個單位穩定 60 FPS。
- **備用升級路徑**：**PixiJS v8（預留未來升級）**
  - **升級策略**：戰鬥核心（邏輯層）與渲染器（表現層）透過 `IBattleRenderer` 介面嚴格解耦。未來若需要華麗 WebGL 著色器濾鏡或粒子光效，可隨時撰寫 `PixiRenderer.ts` 無痛熱插拔替換，完全不影響核心邏輯與數值測試。

### 2.2 核心介面契約 (Decoupled Renderer Interface)

```ts
export interface IBattleRenderer {
  init(canvas: HTMLCanvasElement, mapWidth: number, mapHeight: number): void;
  render(state: BattleRenderSnapshot): void;
  resize(width: number, height: number): void;
  destroy(): void;
}
```

### 2.3 核心模組職責拆分

1. **`core/engine/`**：
   - `GameLoop.ts`：以 `requestAnimationFrame` 驅動固定時間步長（Fixed Timestep）的戰鬥邏輯，確保 1x / 2x 倍速與暫停時的數值確定性。
2. **`core/logic/`**：
   - `MapGrid.ts`：地圖瓦片格解析（ROAD, BUILD, OBSTACLE, BASE, SPAWN）。
   - `WaveManager.ts`：波次產怪、混合敵人組、路徑導航。
   - `HeroManager.ts` & `TowerManager.ts`：防禦塔與武將放置、攻擊範圍判定、目標優先權。
   - `SkillSystem.ts`：武將被動與技能（衝鋒、閃避、百步穿楊、火攻、減速光環等）。
3. **`core/renderer/`**：
   - `CanvasRenderer.ts`：地圖瓦片繪製、單位繪製、血量條、浮動傷害文字、攻擊特效。
4. **`bridge/`**：
   - 轉接既有 `playerStore` 的 `battle_id`、結算合約與掉落獎勵。

---

## 3. 開發階段劃分

### 階段一：地圖與基礎迴圈建置
- [ ] 讀取 Google Sheets 地圖資料並在 Canvas 上正確繪製格子（ROAD, BUILD, OBSTACLE）與路線。
- [ ] 支援固定比例縮放適配（540:720 戰場比例保持）。
- [ ] 建立固定幀率與 delta 計算之遊戲主迴圈。

### 階段二：出兵與路徑移動
- [ ] 依照關卡波次設定生成敵人。
- [ ] 敵人沿多路線路徑（path_a, path_b）點位平滑移動。
- [ ] 地面 vs 飛行敵人不同路徑移動邏輯。

### 階段三：防禦塔與武將部署及戰鬥
- [ ] 點選/拖曳部署武將與防禦塔。
- [ ] 攻擊範圍偵測、攻擊間隔與普攻彈道/特效。
- [ ] 目標優先策略（優先前方、最高血量、最低血量、優先飛行）。
- [ ] 阻擋、近戰受傷與擊殺獲取戰鬥金幣。

### 階段四：技能系統移植
- [ ] 馬超「衝鋒」（首擊加倍）。
- [ ] 趙雲「閃避」（15% 機率閃避）。
- [ ] 黃忠「百步穿楊」（射程 ×1.5）。
- [ ] 周瑜「火攻」（灼燒 DOT）。
- [ ] 關羽「減速光環」、劉備「防禦光環」、張飛「暈眩」等其餘技能。

### 階段五：結算與存檔整合
- [ ] 基地血量扣除與勝敗判斷。
- [ ] 產出合約相容之戰鬥結算資料送交 `playerStore`。
- [ ] 回歸測試與驗證。
