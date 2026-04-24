# 神馬三國 — 單頁架構規劃

## 背景與動機

Godot Web Export 載入 `index.pck`（~70MB）需要相當時間，  
若每次換頁都重新載入，體驗極差。  
因此改為「**Godot 永遠不卸載**」，所有功能以 Modal 疊加在 Godot 畫布上，  
互動結果透過 WebBridge 即時推送給 Godot 刷新場景。

---

## 頁面結構（單一路由）

```
/shenmaSanguo          ← 唯一路由，不再有子頁面
```

進入後依序執行：

1. **GameInitializer** — 從 Google Sheets 載入靜態設定（武將/敵人/地圖）
2. **Godot 載入** — 掛載 `<iframe>` 並等待 `godot_ready` 事件
3. **主畫面** — Godot 畫布 + HUD 疊加層常駐顯示

---

## 畫面佈局

### 核心原則：Godot 畫布為直式長方形（540:600），所有 HUD 以絕對定位疊加其上

- 畫布比例維持 **540:600（直式，高 > 寬）**，與現有 Godot 專案一致
- 所有 HUD 元素 `position: absolute`，不佔用任何佈局空間

```
        ┌─────────────────────────┐
        │[🧑] 南皮 1/10  🪙0 💰0 🏰HP│  ← 頂欄（半透明，極薄）
        │                         │
        │                         │
        │                         │
        │      Godot 畫布         │
        │    （直式 540 × 600）    │
        │                         │
        │                         │
        │                   [ 將 ]│
        │                   [ 隊 ]│  ← 右側兩顆按鈕（靠右貼邊）
        │                         │
        │     [迎戰] [自動] [關卡]│  ← 右下角
        └─────────────────────────┘
```

> 所有 HUD 元素皆為 `position: absolute` 疊加在畫布上，不佔用佈局空間。

---

### 頂欄 HUD

| 區域 | 元素                       | 點擊行為                           |
| ---- | -------------------------- | ---------------------------------- |
| 左   | 玩家頭像                   | → 「玩家資訊 Modal」（含設定入口） |
| 中   | 關卡名稱 + 防守等級 / 波次 | 純顯示                             |
| 右   | 🪙世界點 / 💰戰場金幣      | 純顯示                             |
| 右端 | 🏰 基地 HP                 | 純顯示                             |

### 右側按鈕

兩顆垂直排列的小按鈕，靠右貼邊：

| 按鈕 | 點擊行為                             |
| ---- | ------------------------------------ |
| 將   | → 「武將列表 Modal」（瀏覽全部武將） |
| 隊   | → 「隊伍編輯 Modal」（調整上場武將） |

### 右下角按鈕群

| 按鈕 | 說明                      |
| ---- | ------------------------- |
| 迎戰 | 傳 `start_wave` 給 Godot  |
| 自動 | 傳 `toggle_auto` 給 Godot |
| 關卡 | → 「關卡選擇 Modal」      |

防禦塔選擇整合在 Godot 畫布內（點擊 BUILD 格子 → pop-up 選塔），底欄不重複顯示。

---

## Modal 清單

| Modal    | 觸發點                          | 功能                                  | 傳給 Godot                     |
| -------- | ------------------------------- | ------------------------------------- | ------------------------------ |
| 玩家資訊 | 頂欄頭像                        | 查看等級、經驗、戰場點數；設定入口    | 無                             |
| 設定     | 玩家資訊 Modal 內               | 音效、畫質、語言                      | `update_settings`              |
| 關卡選擇 | 右下角「關卡」按鈕              | 瀏覽地圖、難度、波次預覽；選擇後載入  | `load_stage` → 刷新地圖與波次  |
| 武將列表 | 右側「將」按鈕                  | 瀏覽全部武將；點擊單一武將 → 武將詳情 | 無                             |
| 武將詳情 | 武將列表 Modal 內               | 查看屬性、裝備、技能                  | 無（唯讀）                     |
| 隊伍編輯 | 右側「隊」按鈕                  | 調整上場武將順序 / 替換               | `update_team` → 刷新備戰武將池 |
| 升級面板 | Godot 發出 `show_upgrade_panel` | 升級已放置的塔或武將（已實作不異動）  | `request_upgrade`              |
| 關卡結算 | Godot 發出 `battle_result`      | 顯示勝敗、獎勵、經驗                  | 無（結果顯示）                 |

---

## 資料流向

### Modal → Godot（推送）

```
使用者在 Modal 操作
  → playerStore / staticConfigStore 更新
  → WebBridge.send({ type: "xxx", payload: { ... } })
  → Godot Main.gd 接收，刷新對應系統
```

### Godot → Modal（通知）

```
Godot 事件（金幣變化、波次推進、武將死亡、戰鬥結束）
  → WebBridge postMessage → React 接收
  → playerStore 更新 → UI 重新渲染
```

### 關卡切換流程（最重要）

```
1. 使用者開啟「關卡選擇 Modal」
2. 選定關卡 → 取得該關卡的 path_json / waves / enemies
3. WebBridge.send({ type: "load_stage", payload: { path_json, waves, enemies } })
4. Godot Main.gd:
   - 清除所有敵人、武將、防禦塔
   - 重新呼叫 game_map.setup(path_json)
   - 重設 wave_manager
   - 切換到 PREP 狀態
5. React HUD 同步更新關卡名稱與波次顯示
```

---

## 現有頁面的對應關係

| 原本路由                 | 改為                             |
| ------------------------ | -------------------------------- |
| `/shenmaSanguo`          | 主頁面（保留，合併所有功能）     |
| `/shenmaSanguo/heroes`   | → 武將詳情 Modal                 |
| `/shenmaSanguo/team`     | → 隊伍編輯 Modal                 |
| `/shenmaSanguo/stages`   | → 關卡選擇 Modal                 |
| `/shenmaSanguo/settings` | → 設定 Modal                     |
| `/shenmaSanguo/battle`   | → 合併至主頁面（Godot 畫布常駐） |

---

## 需要新增 / 修改的 WebBridge 訊息

| 方向        | type              | payload                                | 說明                     |
| ----------- | ----------------- | -------------------------------------- | ------------------------ |
| React→Godot | `load_stage`      | `{ path_json, waves, enemies_config }` | 切換關卡                 |
| React→Godot | `update_team`     | `{ team: HeroState[] }`                | 刷新備戰武將池           |
| React→Godot | `update_settings` | `{ sfx_volume, speed }`                | 更新遊戲設定             |
| Godot→React | `stage_loaded`    | `{ stage_id }`                         | 關卡載入完成             |
| Godot→React | `hero_died`       | `{ hero_id }`                          | 武將陣亡（通知右側面板） |

（現有的 `gold_changed`、`base_hp_changed`、`battle_result`、`show_upgrade_panel` 等保留）

---

## 實作順序建議

1. **合併路由** — 將 `/battle` 內容移至 `/shenmaSanguo`，移除其他子路由
2. **佈局重構** — 建立 Top Bar、Right Panel、Bottom Bar 的 layout 元件
3. **Modal 基礎架構** — 建立通用 Modal 容器（動畫、backdrop、關閉邏輯）
4. **關卡選擇 Modal** — 最高優先（切換關卡是核心功能）
5. **隊伍編輯 Modal**
6. **Godot load_stage 處理** — Main.gd 加入清場 + 重新 setup 邏輯
7. **玩家資訊 / 設定 Modal**
8. **關卡結算 Modal**
