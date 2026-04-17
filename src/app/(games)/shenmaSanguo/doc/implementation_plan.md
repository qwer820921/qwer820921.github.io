# 《神馬三國》塔防遊戲 - 實作計畫

> 最後更新：2026-04-16

---

## 核心架構

**靜態 / 動態分離式**

| 層     | 技術                               | 負責內容                                         | 狀態            |
| ------ | ---------------------------------- | ------------------------------------------------ | --------------- |
| Web 層 | Next.js                            | 武將管理、隊伍編排、容量驗證、存讀檔、英雄升級   | 🔲 進行中       |
| 後端   | Google Apps Script + Google Sheets | 玩家存檔（NoSQL JSON）、武將資料 CRUD            | ✅ 基礎建置完成 |
| 戰場   | Godot (iframe 嵌入)                | 敵人路徑、塔防射擊、碰撞、拖拽、戰中塔升級、結算 | 🔲 待開發       |

---

## 後端 (GAS + Sheets)

### GAS 部署資訊

- **部署 URL**：已設定於 `.env.local` 的 `NEXT_PUBLIC_SHENMA_SANGUO_GAS_URL`
- **識別機制**：`key` 由玩家自行輸入（任意字串），存於 `localStorage`，無需登入
- **Key 流程**：玩家輸入 key → 呼叫 `get_profile`；若不存在則呼叫 `create_profile` → 自動建檔

### Sheet 結構

| 分頁             | 類型 | 狀態                                          |
| ---------------- | ---- | --------------------------------------------- |
| `players`        | 動態 | ⚠️ 需改造：`data` 欄位改為 JSON（NoSQL 方式） |
| `player_heroes`  | 動態 | ⚠️ 廢棄：武將資料移入 `players.data` JSON     |
| `battle_logs`    | 動態 | ✅ 表頭建立，GAS 自動寫入                     |
| `heroes_config`  | 靜態 | ✅ 已填入初始武將資料                         |
| `enemies_config` | 靜態 | ✅ 已填入初始敵人資料                         |
| `maps_config`    | 靜態 | ✅ chapter1_1、chapter1_2 已建立              |
| `waves_config`   | 靜態 | ✅ chapter1_1、chapter1_2 波次已建立          |

### players 表結構（改造後）

`key` | `created_at` | `updated_at` | `data`（JSON 字串）

**`data` JSON 結構：**

```json
{
  "nickname": "旅行者",
  "level": 1,
  "exp": 0,
  "gold": 500,
  "capacity": 12,
  "max_stage": "chapter1_1",
  "heroes": [
    {
      "hero_id": "guan_yu",
      "level": 1,
      "star": 0,
      "atk": 120,
      "def": 100,
      "hp": 1200
    },
    {
      "hero_id": "zhou_cang",
      "level": 1,
      "star": 0,
      "atk": 80,
      "def": 60,
      "hp": 600
    }
  ],
  "team": [
    { "hero_id": "guan_yu", "slot": 1 },
    { "hero_id": "zhou_cang", "slot": 2 }
  ]
}
```

> ⚠️ `data` 欄位必須先將 cell 格式設為「純文字」再貼入，否則 Sheets 會截斷 JSON。

### maps_config 欄位

`map_id` | `chapter` | `name` | `unlock_stage` | `path_json` | `wave_json` | `notes`

**`path_json` 結構（Godot 解析）：**

```json
{
  "paths": [
    {
      "id": "path_a",
      "waypoints": [
        [2, 0],
        [2, 3],
        [5, 3],
        [5, 8],
        [8, 8]
      ]
    }
  ],
  "spawn": [{ "path": "path_a", "pos": [2, 0] }],
  "base": [8, 8],
  "build_zones": [
    [0, 0],
    [1, 0],
    [3, 0],
    [4, 0],
    [3, 4],
    [4, 4],
    [6, 4],
    [7, 4]
  ]
}
```

- 座標格式：`[col, row]`（格子座標，非像素）
- `build_zones`：允許放置防禦塔的格子清單（Sheets 中需顯式填入）
- Sheets 貼入時 cell 格式需設為「純文字」，或在 JSON 前加單引號 `'`

### waves_config 欄位

`map_id` | `wave` | `enemy_id` | `count` | `interval` | `path` | `notes`

### GAS 端點 (action)

| action               | 說明                                                             | 狀態            |
| -------------------- | ---------------------------------------------------------------- | --------------- |
| `create_profile`     | 建立新玩家（初始 `data` JSON）                                   | ✅              |
| `get_profile`        | 讀取玩家完整 `data` JSON                                         | ✅ 需調整回傳   |
| `save_profile`       | 覆寫玩家 `data` JSON（隊伍變更、一般存檔）                       | 🔲 新增         |
| `save_result`        | 戰鬥結算：更新 `data.gold`、`data.max_stage`、寫入 `battle_logs` | ✅              |
| `upgrade_hero`       | 武將升級：扣除金幣、提升 atk/def/hp、更新 `data`                 | 🔲 Phase 1 新增 |
| `get_heroes_config`  | 取得所有武將設定（靜態）                                         | ✅              |
| `get_enemies_config` | 取得所有敵人設定（靜態）                                         | ✅              |
| `get_all_maps`       | 取得地圖清單                                                     | ✅              |
| `get_map_config`     | 取得單一地圖完整設定（含波次）                                   | ✅              |
| `upgrade_star`       | 武將升星（碎片消耗）                                             | 🔲 Phase 3      |
| ~~`get_heroes`~~     | ~~讀取玩家武將列表~~（由 `get_profile` 取代）                    | 廢棄            |
| ~~`save_manual`~~    | ~~手動存檔~~（由 `save_profile` 取代）                           | 廢棄            |

---

## Web 端路由結構

```
/shenmaSanguo                → 主選單（顯示玩家金幣、暱稱、導覽入口）
/shenmaSanguo/settings       → 設定（Key 輸入 → 查詢/新建存檔、顯示目前 key）
/shenmaSanguo/heroes         → 武將列表（點擊頭像 → 升級 modal，花費金幣升級）
/shenmaSanguo/team           → 隊伍編排（選擇武將、容量驗證、儲存隊伍）
/shenmaSanguo/stages         → 關卡選擇（地圖列表，依 max_stage 鎖關）
/shenmaSanguo/battle         → 戰場（Godot iframe + 結算流程）
```

### 頁面導覽邏輯

```
設定頁（首次 or 換裝置）
    ↓ key 確認完成
主選單
    ├─ 武將列表 → [升級 modal]
    ├─ 隊伍編排
    ├─ 關卡選擇 → 出征
    │       ↓
    │    戰場（iframe）
    │       ↓ Godot postMessage 結算
    │    結算畫面（in-page overlay）
    │       ↓ 確認
    └─ 回主選單
```

### 設定頁流程

```
玩家輸入 key
    ↓
呼叫 get_profile(key)
    ├─ 找到 → 載入玩家資料 → 存入 localStorage → 跳主選單
    └─ 找不到 → 呼叫 create_profile(key) → 建立新存檔 → 跳主選單
```

---

## Web 端狀態管理（sessionStorage 同步機制）

### 設計原則

玩家的即時狀態（gold、heroes、team、max_stage）以 `sessionStorage` 為主要讀寫層，非同步同步至 GAS，降低 API 呼叫頻率並支援離線修改。

### sessionStorage 資料結構

```typescript
// key: "shenma_player_state" — 動態玩家資料（同步至 GAS）
interface SessionPlayerState {
  key: string; // 玩家自訂 key
  nickname: string;
  level: number;
  exp: number;
  gold: number;
  capacity: number;
  max_stage: string;
  heroes: HeroState[];
  team: TeamSlot[];
  syncStatus: SyncStatus; // 'idle' | 'pending' | 'syncing'
}

// key: "shenma_static_config" — 靜態設定（初始化時一次快取，不同步）
interface StaticConfig {
  heroesConfig: HeroConfig[];
  enemiesConfig: EnemyConfig[];
  maps: MapConfig[]; // 含 path_json + waves 的完整設定
}
```

### 同步觸發規則

| 觸發事件         | 同步時機                     | GAS action     | 說明                                                        |
| ---------------- | ---------------------------- | -------------- | ----------------------------------------------------------- |
| 戰鬥結算完成     | 立即觸發                     | `save_result`  | 結算資料存入 session → 馬上呼叫，不走 debounce              |
| 武將升級（首次） | pendingSync=false 時立即觸發 | `upgrade_hero` | 本 session 第一次升級，直接打 GAS 取得驗證後的屬性          |
| 武將升級（後續） | 30 秒 debounce 後同步        | `save_profile` | 30s 內再升級只更新 session，debounce 結束後一次送出最終狀態 |
| 隊伍變更         | 30 秒 debounce 後同步        | `save_profile` | 同上                                                        |

### Debounce 同步邏輯

```
state 異動
    ↓
pendingSync = false？
    ├─ YES（window 內首次）→ 立即呼叫對應 GAS action
    │                          → 回傳成功後 更新 session
    │                          → pendingSync = true，啟動 30s timer
    │
    └─ NO（debounce 進行中）→ 只更新 session，重置 30s timer

                                         ↓ 30s 後 timer 觸發
                                   呼叫 save_profile（帶最終 session 狀態）
                                         ↓
                              ┌── 成功 → pendingSync = false
                              └── 同步中又有異動 → 更新 session，再等 30s
```

> **重要**：同步在飛行中（in-flight）時若有新異動，不中斷當前請求，而是更新 session 並重新啟動 debounce，等當前請求完成後由下一輪 debounce 補同步。

### 初始化載入

```
進入任何頁面
    ↓
sessionStorage 有 shenma_player_state？
    ├─ 有 → 直接使用（不重打 GAS）
    └─ 沒有 → 呼叫 get_profile(localStorage.key) → 寫入 sessionStorage
```

---

## Web 端 API Wrapper

**檔案**：`src/app/(games)/shenmaSanguo/api/gameApi.ts`

- ✅ 所有 GAS action 封裝完成（含 `saveProfile`、`upgradeHero`）
- ✅ `getPlayerKey()` / `setPlayerKey()` — 玩家自訂 key 的 localStorage 管理
- ⚠️ GAS 不支援 CORS preflight，呼叫時**不可設定 `Content-Type` header**，body 直接傳 JSON 字串

---

## 通訊協議（已驗證）

### Web → Godot（出征 payload）

```json
{
  "stage_id": "chapter1_1",
  "player": {
    "key": "my_custom_key",
    "nickname": "旅行者",
    "level": 1,
    "gold": 500
  },
  "team_list": [
    {
      "hero_id": "guan_yu",
      "level": 1,
      "star": 0,
      "slot": 1,
      "atk": 120,
      "def": 100,
      "hp": 1200
    },
    {
      "hero_id": "zhou_cang",
      "level": 1,
      "star": 0,
      "slot": 2,
      "atk": 80,
      "def": 60,
      "hp": 600
    }
  ],
  "heroes_config": ["..."],
  "map": {
    "map_id": "chapter1_1",
    "name": "虎牢關",
    "path_json": {
      "paths": [
        {
          "id": "path_a",
          "waypoints": [
            [2, 0],
            [2, 3],
            [5, 3],
            [5, 8],
            [8, 8]
          ]
        }
      ],
      "spawn": [{ "path": "path_a", "pos": [2, 0] }],
      "base": [8, 8],
      "build_zones": [
        [0, 0],
        [1, 0],
        [3, 0],
        [4, 0]
      ]
    },
    "waves": ["..."]
  }
}
```

> `team_list` 的 atk/def/hp 為玩家實際升級後的數值（從 sessionStorage 取，非靜態 config）

### Godot → Web（結算）

```json
{
  "result": "WIN",
  "stage_id": "chapter1_1",
  "stars_earned": 3,
  "kills": 42,
  "time_seconds": 87,
  "loots": [{ "item": "gold", "count": 300 }],
  "__godot_bridge": true
}
```

> `__godot_bridge: true` 為識別旗標，Web 端用來過濾非 Godot 來源的訊息

---

## Godot 專案

**路徑**：`godot/shenmaSanguo/`

**匯出設定**：`export_presets.cfg` → `public/games/shenmaSanguo/index.html`

### 檔案結構

```
godot/shenmaSanguo/
├── project.godot        （1280×720 橫版，GL Compatibility）
├── export_presets.cfg
├── fonts/font.ttf       （繁中字體，解決 Web 端亂碼）
├── bridge/
│   └── WebBridge.gd     ✅ postMessage 雙向橋接（已驗證）
└── main/
    ├── Main.tscn
    └── Main.gd          （Demo：收 payload → 模擬戰鬥 → 回傳結算）
```

### WebBridge.gd 關鍵實作

- `JavaScriptBridge.get_interface("window")["__godot_receive"] = _msg_callback` 將 GDScript callback 掛到 window
- JS 端用 `window.__godot_receive(JSON.stringify(data))` 呼叫
- 回傳用 `JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)`

---

## 數據模型

### 玩家容量

- 公式：`Capacity = 10 + (Level * 2)`

### 武將稀有度與 Cost

| 稀有度 | Cost |
| ------ | ---- |
| 橘     | 8    |
| 紫     | 6    |
| 藍     | 3    |
| 綠     | 1    |

### 武將升級（Web 端花費金幣）

- 升級由玩家在武將列表頁點擊頭像，於 modal 中操作
- 每次升級扣除金幣，atk/def/hp 依比例提升（具體數值待平衡）
- 升級後即時更新 sessionStorage → 30 秒 debounce 同步至 GAS
- 升級後的屬性在出征時帶入 `team_list`

### 防禦塔升級（Godot 戰中花費）

- 使用戰場內獨立的「戰鬥金幣」（非玩家存檔 gold）
- 升級效果只在本場戰鬥有效，不持久化
- 完全由 Godot 端管理，不需要 Web / GAS 介入

### 升星（後期加入，目前預設武將無法取得碎片）

| 升至 | 碎片 | 效果        |
| ---- | ---- | ----------- |
| ★1   | 10   | ATK +5%     |
| ★2   | 20   | DEF +5%     |
| ★3   | 50   | HP +10%     |
| ★4   | 100  | 解鎖被動    |
| ★5   | 200  | 全屬性 +15% |

---

## 戰場機制（待實作）

### 地形 (TileMap)

| 標籤       | 武將 | 防禦塔 | 說明               |
| ---------- | ---- | ------ | ------------------ |
| `ROAD`     | ✅   | ❌     | 敵人行走路線       |
| `BUILD`    | ✅   | ✅     | 非路徑可建設區     |
| `OBSTACLE` | ❌   | ❌     | 障礙物（未來補充） |

> `build_zones` 需在 `path_json` 中顯式定義，Godot 依此標記可建設格子。

### 武將放置規則（已調整）

- **武將可放置於所有非障礙物格子**（ROAD 與 BUILD 皆可）
- ROAD 上 → **阻擋形態**：物理攔截敵人通過 + 近戰攻擊
- BUILD 上 → **砲台形態**：在攻擊範圍內遠程攻擊，敵人不受阻擋
- 武將屬性完全由 Web 端 `team_list` 傳入，戰場內**不可升級**

### 防禦塔職業

| 職業 | 攻擊模式   | 特殊效果     | 放置區 |
| ---- | ---------- | ------------ | ------ |
| 弓兵 | 單體高頻率 | 優先飛行單位 | BUILD  |
| 步兵 | 單體高阻擋 | 緩速光環     | BUILD  |
| 砲兵 | AOE 群傷   | 爆發傷害     | BUILD  |

各職業塔有等級、攻擊力、攻擊頻率、攻擊範圍屬性，可用**戰鬥金幣**升級（不持久化）。

### 遊戲狀態機

```
進入關卡
    ↓
【戰前準備】─── 玩家拖曳武將、防禦塔至格子
    │            可使用初始戰鬥金幣（500）升塔
    ├─ 點「迎戰」→ 進入【戰鬥狀態】（敵人開始生成）
    └─ 點「自動」→ 開啟自動模式

【戰鬥狀態】
    │  敵人沿路線移動，武將/塔自動攻擊
    │  戰鬥金幣可繼續使用（升塔）
    ├─ 本波敵人全滅 → 回【戰前準備】（手動模式）
    │               → 或 30 秒後自動放下一波（自動模式）
    │                   ⚠️ 自動模式兩波重疊，壓力更大
    └─ 所有波次完成 → 計算勝負 → 結算
```

### 放置 UI 設計

- 底部面板顯示：可用武將（來自 `team_list`）+ 三種防禦塔類型
- 從底部面板**拖曳**至有效格子放置
- 武將 → 只可拖至 ROAD 或 BUILD
- 防禦塔 → 只可拖至 BUILD
- 戰鬥中仍可放新的塔／升塔（只要有戰鬥金幣）

### 初始戰鬥金幣

- 每場戰鬥開始時給予 **500 戰鬥金幣**
- 擊殺敵人可額外獲得金幣（kills × 5）
- 戰鬥金幣不持久化，不傳回 Web

---

## 開發進度

### ✅ Phase 0 — 技術驗證（已完成）

- [x] GAS Web App 建置與部署（含 `getActiveSpreadsheet()` 容器繫結修正）
- [x] Google Sheets 靜態設定表初始資料建立
- [x] Next.js `gameApi.ts` API wrapper 完成
- [x] Web → Godot postMessage 發送驗證
- [x] Godot → Web postMessage 回傳驗證
- [x] Web → GAS `save_result` 寫入驗證
- [x] 繁中字體掛載（解決 Web 匯出亂碼）
- [x] 完整三步驟 Demo 頁面（`/shenmaSanguo`）

---

### 🔲 Phase 1 — MVP（待開發）

#### 後端 / GAS 調整

- [ ] `players` 表改造：`data` 欄位改為 JSON，廢棄 `player_heroes` 表
- [ ] `get_profile` 回傳格式更新（回傳完整 `data` JSON）
- [ ] 新增 `save_profile` action（覆寫玩家 `data`）
- [ ] 新增 `upgrade_hero` action（扣金幣 + 提升武將屬性）

#### Web 端

- [ ] 設定頁（`/shenmaSanguo/settings`）
  - 玩家輸入 key → `get_profile` → 有則讀取 / 無則 `create_profile`
  - 顯示目前 key（方便玩家記錄）
  - 存入 localStorage
- [ ] sessionStorage 狀態管理模組
  - 初始化載入（`get_profile` → 寫入 session）
  - 30 秒 debounce 同步（`save_profile`）
  - 戰鬥結算立即同步（`save_result`）
- [ ] 主選單（`/shenmaSanguo`）
  - 顯示玩家暱稱、金幣、等級
  - 導覽至各子頁面
- [ ] 武將列表頁（`/shenmaSanguo/heroes`）
  - 顯示玩家已擁有武將（從 session `heroes` 讀取）
  - 點擊頭像 → 升級 modal（顯示升級費用、升級後屬性預覽）
  - 升級後更新 session → 觸發 debounce 同步
- [ ] 隊伍編排頁（`/shenmaSanguo/team`）
  - 選擇武將、容量驗證（`Capacity = 10 + Level * 2`）
  - 儲存後更新 session → 觸發 debounce 同步
- [ ] 關卡選擇頁（`/shenmaSanguo/stages`）
  - 從 `get_all_maps` 讀取，依 session `max_stage` 鎖關
- [ ] 出征流程（`/shenmaSanguo/battle`）
  - 組裝出征 payload（team_list 使用 session 中升級後的屬性）
  - postMessage → Godot iframe
  - 等待 `__godot_bridge` 結算訊息
- [ ] 結算 overlay（戰場頁內）
  - 接收 Godot 結算 → 存入 session → 立即呼叫 `save_result`
  - 顯示結算資訊（勝/敗、星數、擊殺、金幣獎勵）
  - 確認後跳回主選單

#### Godot 端

- [ ] TileMap 地形建立（解析 `path_json`，標記 ROAD / BUILD / OBSTACLE 格子）
- [ ] 讀取 `path_json.paths` 產生敵人行進路線（waypoint Tween 移動）
- [ ] 讀取 `waves` 資料產生波次生成器
- [ ] 基礎敵人場景（沿路線移動、血量、死亡掉落金幣）
- [ ] 武將放置邏輯（ROAD / BUILD 皆可放；ROAD=阻擋+近戰，BUILD=遠程砲台）
- [ ] 防禦塔放置邏輯（BUILD 格子拖曳放置，三職業差異化）
- [ ] 底部拖曳放置 UI（武將面板 + 塔面板）
- [ ] 遊戲狀態機（戰前準備 ↔ 戰鬥，手動迎戰 / 自動模式）
- [ ] 自動模式：30 秒後強制放下一波（可兩波重疊）
- [ ] 基礎攻擊系統（自動鎖定最近敵人）
- [ ] 基地血量與失敗判定
- [ ] 戰鬥金幣系統（初始 500，殺敵 +5，用於升塔，不持久化）
- [ ] 塔升級（點擊塔升級，提升攻擊力/頻率/範圍）
- [ ] 真實結算邏輯（kills、stars、time 計算）
- [ ] 傳入 `team_list` 後動態載入武將屬性

---

### 🔲 Phase 2 — 核心完整（待開發）

- [ ] 全 3 職業武將差異化（弓兵 / 步兵 / 砲兵）
- [ ] 飛行單位（無視地面路徑）
- [ ] 武將拖拽重定位（含冷卻時間）
- [ ] 多路線地圖支援（`path_b` 等）
- [ ] 10 個完整關卡資料填入 Sheets

---

### 🔲 Phase 3 — 經濟 & 留存（後期）

- [ ] 碎片與升星系統（`upgrade_star` action）
- [ ] 每日任務、成就系統
- [ ] 平衡性調整

---

## 已知問題 & 注意事項

| 問題                  | 說明                                                          | 解法                                               |
| --------------------- | ------------------------------------------------------------- | -------------------------------------------------- |
| Sheets data 欄截斷    | Sheets 將 `{` 開頭的 cell 視為公式                            | 先設定 cell 格式為「純文字」，或在 JSON 前加 `'`   |
| GAS CORS              | GAS 不支援 preflight，`Content-Type: application/json` 會失敗 | fetch 時不設定 Content-Type                        |
| GAS 冷啟動            | 首次呼叫約 1-3 秒延遲                                         | Web 端顯示 loading 狀態                            |
| Godot UID 手寫無效    | 手寫 UID 格式不符 Godot 規範會導致 Invalid UID 錯誤           | `project.godot` 用路徑引用，讓 Editor 自動產生 UID |
| session 與 GAS 不同步 | 使用者在 debounce 期間關閉頁面導致資料遺失                    | `beforeunload` 事件觸發立即同步（best effort）     |
