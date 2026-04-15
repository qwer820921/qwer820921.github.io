# 《神馬三國》塔防遊戲 - 實作計畫

> 最後更新：2026-04-16

---

## 核心架構

**靜態 / 動態分離式**

| 層     | 技術                               | 負責內容                             | 狀態            |
| ------ | ---------------------------------- | ------------------------------------ | --------------- |
| Web 層 | Next.js                            | 武將管理、隊伍編排、容量驗證、存讀檔 | 🔲 進行中       |
| 後端   | Google Apps Script + Google Sheets | 玩家存檔、武將資料 CRUD              | ✅ 基礎建置完成 |
| 戰場   | Godot (iframe 嵌入)                | 敵人路徑、塔防射擊、碰撞、拖拽、結算 | 🔲 待開發       |

---

## 後端 (GAS + Sheets)

### GAS 部署資訊

- **部署 URL**：已設定於 `.env.local` 的 `NEXT_PUBLIC_SHENMA_SANGUO_GAS_URL`
- **識別機制**：`key` 由 Web 端產生並存於 `localStorage`（格式：`player_xxxxx`），無需登入

### Sheet 結構（已建立）

| 分頁             | 類型 | 狀態                                 |
| ---------------- | ---- | ------------------------------------ |
| `players`        | 動態 | ✅ 表頭建立，GAS 自動寫入            |
| `player_heroes`  | 動態 | ✅ 表頭建立，GAS 自動寫入            |
| `battle_logs`    | 動態 | ✅ 表頭建立，GAS 自動寫入            |
| `heroes_config`  | 靜態 | ✅ 已填入初始武將資料                |
| `enemies_config` | 靜態 | ✅ 已填入初始敵人資料                |
| `maps_config`    | 靜態 | ✅ chapter1_1、chapter1_2 已建立     |
| `waves_config`   | 靜態 | ✅ chapter1_1、chapter1_2 波次已建立 |

### maps_config 欄位

`map_id` | `chapter` | `name` | `unlock_stage` | `path_json` | `wave_json` | `notes`

> ⚠️ `path_json` 欄位必須先將 cell 格式設為「純文字」再貼入，否則 Sheets 會截斷 JSON。

### waves_config 欄位

`map_id` | `wave` | `enemy_id` | `count` | `interval` | `path` | `notes`

### GAS 端點 (action)

| action               | 說明                                 | 狀態        |
| -------------------- | ------------------------------------ | ----------- |
| `create_profile`     | 建立新玩家                           | ✅          |
| `get_profile`        | 讀取玩家資料                         | ✅          |
| `get_heroes`         | 讀取玩家武將列表                     | ✅          |
| `save_result`        | 儲存戰鬥結算 + 解鎖下一關 + 發放金幣 | ✅          |
| `save_manual`        | 手動存檔                             | ✅          |
| `get_heroes_config`  | 取得所有武將設定                     | ✅          |
| `get_enemies_config` | 取得所有敵人設定                     | ✅          |
| `get_all_maps`       | 取得地圖清單                         | ✅          |
| `get_map_config`     | 取得單一地圖完整設定（含波次）       | ✅          |
| `upgrade_star`       | 武將升星                             | 🔲 後期加入 |

---

## Web 端 API Wrapper

**檔案**：`src/app/(games)/shenmaSanguo/api/gameApi.ts`

- ✅ 所有 GAS action 封裝完成
- ✅ `getOrCreatePlayerKey()` — localStorage key 管理
- ⚠️ GAS 不支援 CORS preflight，呼叫時**不可設定 `Content-Type` header**，body 直接傳 JSON 字串

---

## 通訊協議（已驗證）

### Web → Godot（出征 payload）

```json
{
  "stage_id": "chapter1_1",
  "player": { "key": "player_xxx", "nickname": "旅行者", "level": 1, "gold": 500 },
  "team_list": [
    { "hero_id": "guan_yu", "level": 1, "star": 0, "slot": 1 },
    { "hero_id": "zhou_cang", "level": 1, "star": 0, "slot": 2 }
  ],
  "heroes_config": [ ... ],
  "map": {
    "map_id": "chapter1_1",
    "name": "虎牢關",
    "path_json": { "paths": [...], "spawn": [...], "base": [...] },
    "waves": [ ... ]
  }
}
```

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

| 標籤       | 放置   | 說明                            |
| ---------- | ------ | ------------------------------- |
| `ROAD`     | 武將   | 攔截者，可拖拽重定位（CD 8 秒） |
| `BUILD`    | 防禦塔 | 戰鬥開始後鎖定                  |
| `OBSTACLE` | 禁止   | —                               |

### 武將形態

- ROAD 上 → **英雄形態**（近戰 + 阻擋敵人，可拖拽）
- BUILD 上 → **塔形態**（固定遠程輸出）

### 職業

- **弓兵**：單體高頻率，優先飛行單位
- **步兵**：高阻擋數，塔形態提供緩速光環
- **砲兵**：AOE 群傷爆發

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

#### Web 端

- [ ] 玩家初始化流程（首次進入自動 `create_profile`）
- [ ] 武將列表頁（從 `get_heroes_config` 讀取並顯示）
- [ ] 隊伍編排頁（選擇武將、容量驗證、儲存隊伍）
- [ ] 關卡選擇頁（從 `get_all_maps` 讀取，依 `max_stage` 鎖定）
- [ ] 出征流程（組裝完整 payload → postMessage → 等待結算）
- [ ] 結算頁面（接收 Godot 結算 → 顯示結果 → `save_result`）

#### Godot 端

- [ ] TileMap 地形建立（ROAD / BUILD / OBSTACLE 標籤）
- [ ] 讀取 `path_json` 產生敵人行進路線
- [ ] 讀取 `waves` 資料產生波次生成器
- [ ] 基礎敵人場景（移動、血量、死亡掉落）
- [ ] 武將放置邏輯（ROAD 上攔截、可拖拽）
- [ ] 防禦塔放置邏輯（BUILD 上固定）
- [ ] 基礎攻擊系統（自動鎖定最近敵人）
- [ ] 基地血量與失敗判定
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
| Sheets path_json 截斷 | Sheets 將 `{` 開頭的 cell 視為公式                            | 先設定 cell 格式為「純文字」，或在 JSON 前加 `'`   |
| GAS CORS              | GAS 不支援 preflight，`Content-Type: application/json` 會失敗 | fetch 時不設定 Content-Type                        |
| GAS 冷啟動            | 首次呼叫約 1-3 秒延遲                                         | Web 端顯示 loading 狀態                            |
| Godot UID 手寫無效    | 手寫 UID 格式不符 Godot 規範會導致 Invalid UID 錯誤           | `project.godot` 用路徑引用，讓 Editor 自動產生 UID |
