# 神馬三國 — Boss (魔王) 系統實作計畫

> 建立日期：2026-04-29

## 功能目標

目前的系統中所有的敵人都共用同一套 `Enemy.gd` 的腳本。本計畫的目標是透過 Google Sheet 中的特定標記，讓前端與遊戲引擎能夠識別出「Boss (魔王)」類型的敵人，並給予視覺與機制上的特殊處理，同時在 React 網頁端顯示全域的大型 Boss 血條。

---

## 核心設計原則

- **Data-Driven (資料驅動)**：不寫死特定的敵人 ID 為 Boss，而是透過 Google Sheet 的 `type` 欄位決定。
- **分離渲染 (Decoupled Rendering)**：Godot 專心處理實體邏輯、碰撞、扣血，而「Boss 的大血條」交由最外層的 React HUD 繪製，確保 RWD 響應式與視覺華麗度。
- **WebBridge 通訊**：Godot 在 Boss 受傷或死亡時，透過 `postMessage` 將狀態推播給 React。

---

## 實作範圍與步驟

### 1. 資料層 (Google Sheets & Types)

- **Sheet (`enemies_config`)**：新增一個名為 `type` 的欄位。對於想設定為 Boss 的敵人，填入字串 `boss`。
- **React 傳遞**：React 取出該筆資料後，現有的 `ExpeditionPayload` 已經將整行敵人資料打包送進 Godot，因此 `types/index.ts` 與傳遞邏輯不需大幅修改，Godot 可直接從 Dictionary 取值。

### 2. Godot 遊戲邏輯 (`godot/shenmaSanguo/`)

#### 2-a. `Enemy.gd` (敵人實體)

- 新增變數：`var is_boss: bool = false`
- 新增訊號：`signal boss_hp_changed(current_hp, max_hp, enemy_name)`
- **初始化 (`setup`)**：
  ```gdscript
  var enemy_type = str(cfg.get("type", "normal"))
  if enemy_type == "boss":
      is_boss = true
      # 視覺強化：體型放大、顏色變深
      enemy_radius = int(tile_size * 0.6)
      body_color = Color(0.8, 0.1, 0.1, 1) # 深紅
  ```
- **扣血邏輯 (`take_damage`)**：
  若 `is_boss == true`，在扣血計算完畢後發射訊號：
  `boss_hp_changed.emit(current_hp, max_hp, label_text)`
- **死亡邏輯 (`_die`)**：
  發射死亡訊號：`boss_hp_changed.emit(0, max_hp, label_text)` 以通知 UI 隱藏血條。

#### 2-b. `WaveManager.gd` (波次生成)

- 在 `_create_enemy` 實例化敵人後，若其為 Boss，則將 `boss_hp_changed` 訊號往外傳遞，或透過設定讓 `BattleManager` 統一接聽。

#### 2-c. `BattleManager.gd` (戰鬥管理)

- 攔截到 Boss 扣血訊號後，透過 WebBridge 發送至 React 端：
  ```gdscript
  web_bridge.send_message("boss_hp_update", {
      "hp": hp,
      "max_hp": max_hp,
      "name": enemy_name
  })
  ```

### 3. React UI 層 (`src/app/(games)/shenmaSanguo/`)

#### 3-a. `BattlePageContent.tsx` (主戰鬥畫面)

- **狀態管理**：
  ```typescript
  const [bossInfo, setBossInfo] = useState<{
    name: string;
    hp: number;
    max_hp: number;
  } | null>(null);
  ```
- **WebBridge 監聽**：
  在 `handleMessage` 中攔截事件：
  ```typescript
  if (event.data.type === "boss_hp_update") {
    setBossInfo({
      hp: event.data.hp,
      max_hp: event.data.max_hp,
      name: event.data.name,
    });
  }
  ```
- **血條渲染 (HUD)**：
  當 `bossInfo` 不為 null 且 `hp > 0` 時，在 `battleTopBar` 下方疊加渲染一個極具壓迫感的紅色 Boss 血條。
  血條需具備過渡動畫 (CSS `transition`)，呈現絲滑的扣血效果。

---

## 預期結果與驗證

1. 玩家在關卡中遭遇 Boss 波次時，該敵人體積明顯大於小兵。
2. 畫面上方出現醒目的 Boss 血條（包含名字與 HP 比例）。
3. 任何塔防攻擊命中 Boss，血條都會即時且平滑地減少。
4. Boss 死亡（HP 歸零）後，畫面上方的血條自動消失。
