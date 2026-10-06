# 神馬三國 後端 API 規格白皮書 (Google Apps Script API Spec)
## Exhaustive API Specification & Data Contract

> **版本**：2.0.0 (對齊 `gameApi.ts`, `staticConfigStore.ts`, `playerStore.ts` 與 GAS 後端契約)  
> **狀態**：極致確認完畢（Verified & Finalized）  
> **目標**：規範所有純前端 JS 渲染版與 Google Apps Script (GAS) 之後端資料交換標準，確保存檔、結算、地圖與靜態配置零差錯。

---

## 1. 通訊基礎協議 (Transport Protocol)

- **通訊方式**：HTTP `POST`
- **CORS 規避處理**：
  Google Apps Script (GAS) 部署之 Web App 不支援 CORS preflight（OPTIONS 請求）。  
  因此前端發送請求時，**嚴禁設定 `Content-Type: application/json`**，必須發送純字串 body：
  ```ts
  fetch(GAS_URL, {
    method: "POST",
    body: JSON.stringify({ action, key, payload }),
  });
  ```
- **Base URL**：
  優先讀取環境變數 `NEXT_PUBLIC_SHENMA_GAS_URL`，預設為正式發布之 GAS exec 網址。
- **請求基本包裝**：
  ```json
  {
    "action": "action_name",
    "key": "player_key (可選)",
    "payload": { ... }
  }
  ```
- **統一回應規格**：
  - 成功：`{ "status": 200, ... }`
  - 業務失敗：`{ "status": 400 | 500, "error": "ERROR_CODE", ... }`

### 1.1 唯讀請求自動重試機制 (`READ_ONLY_ACTIONS`)
- **唯讀 Action 清單**：
  `get_settings`、`get_heroes_config`、`get_enemies_config`、`get_all_maps`、`get_map_config`、`get_profile`。
- **超時與重試參數**：
  - 單次超時限制：`READ_TIMEOUT_MS = 30,000ms`（30 秒）。
  - 自動重試間隔：最多重試 2 次（`[1000ms, 2000ms]`，單次操作最多 3 次請求）。
  - 慢速提示觸發：請求超過 `8,000ms`（8 秒）未收到回應，向 UI 發出「回應較慢」提示通知。
  - 暫時性錯誤判定：`BUSY`、`SERVER_ERROR`，以及網路連線中斷、超時等傳輸錯誤允許重試。
- **寫入請求絕不重試**：
  `create_profile`、`save_profile`、`save_result`、`upgrade_hero`、`save_enemies_config`、`save_heroes_config` 嚴禁自動重試，防止重複寫入、扣款或重複領取獎勵！

---

## 2. 地圖相關 API 規格 (Map APIs)

### 2.1 `get_all_maps` (批次載入所有地圖與波次)
- **Action**：`"get_all_maps"`
- **請求參數**：無（不需 `key`，不需 `payload`）
- **快取機制**：由 `staticConfigStore` 快取於 `localStorage`，TTL 為 60 秒。
- **回傳範例**：
  ```json
  {
    "status": 200,
    "maps": [
      {
        "map_id": "chapter1_1",
        "chapter": 1,
        "name": "黃巾起義",
        "unlock_stage": "chapter1_1",
        "path_json": { ... },
        "waves": [
          {
            "wave": 1,
            "enemies": [
              {
                "enemy_id": "grunt_lv1",
                "count": 5,
                "interval": 1.0,
                "path": "path_a"
              }
            ]
          }
        ]
      }
    ]
  }
  ```

### 2.2 `path_json` 資料格式詳細結構
`path_json` 可以是 JSON 物件或 JSON 字串，需支援雙相容解析：
```json
{
  "cols": 14,
  "rows": 11,
  "paths": {
    "path_a": [[0, 8], [1, 8], [2, 8], [5, 8], [5, 7], ...],
    "path_b": [[0, 2], [1, 2], [6, 2], [6, 9], ...]
  },
  "waypoints": [[0, 8], ...],
  "spawn": [0, 8],
  "base": [13, 5],
  "build_zones": [
    [4, 0], [5, 0], [6, 0], [4, 1], [11, 1], ...
  ],
  "obstacles": [
    [0, 0], [1, 0], [2, 0], [12, 0], [13, 0], ...
  ],
  "background_texture": "maps/bg_forest.webp",
  "cell_textures": {
    "0,0": "tiles/tile_dirt4.webp",
    "4,0": "tiles/tile_grass1.webp",
    "5,1": "tiles/tile_stone.webp",
    "13,5": "tiles/tile_fortress.webp"
  }
}
```
- **相容性檢查**：
  1. `paths` 若為 Array，自動當作單一路徑 `"path_a"`。
  2. 若無 `paths` 但有 `waypoints`，自動封裝為 `"path_a"`。
  3. `cell_textures` 鍵值為 `"col,row"` 字串，支援個別網格獨立貼圖。

### 2.3 `get_map_config` (單一地圖查詢)
- **Action**：`"get_map_config"`
- **請求 Payload**：`{ "map_id": "chapter1_1" }`
- **回傳**：`{ "status": 200, "map": { ...MapConfig } }`

---

## 3. 靜態設定 API 規格 (Static Config APIs)

### 3.1 `get_heroes_config` (武將基礎屬性表)
- **Action**：`"get_heroes_config"`
- **回傳範例**：
  ```json
  {
    "status": 200,
    "heroes": [
      {
        "hero_id": "guan_yu",
        "name": "關羽",
        "rarity": "orange",
        "cost": 8,
        "job": "infantry",
        "base_atk": 150,
        "base_def": 120,
        "base_hp": 1500,
        "attack_range": 1.5,
        "attack_speed": 1.2,
        "upgrade_cost_base": 100,
        "atk_growth": 0.08,
        "def_growth": 0.06,
        "hp_growth": 0.10,
        "range_growth": 0.0,
        "atk_spd_growth": 0.0,
        "speed_growth": 0.0,
        "image": "hero_guan_yu.webp",
        "attack_image": "hero_guan_yu_atk.webp"
      }
    ]
  }
  ```
- **攻速成長標準化 (Normalization)**：
  前端讀取時執行 `normalizeHeroConfig`：若缺少 `atk_spd_growth`，自動取 `speed_growth` 補齊。

### 3.2 `get_enemies_config` (敵人屬性表)
- **Action**：`"get_enemies_config"`
- **回傳範例**：
  ```json
  {
    "status": 200,
    "enemies": [
      {
        "enemy_id": "grunt_lv1",
        "name": "步兵LV1",
        "hp": 150.0,
        "speed": 80.0,
        "image": "enemy_grunt1.webp",
        "movement_type": "ground",
        "atk": 20.0,
        "trait": "immune_slow"
      }
    ]
  }
  ```

---

## 4. 玩家資料與存檔協議 (Player State & Save APIs)

### 4.1 `get_profile` (讀取玩家資料)
- **Action**：`"get_profile"`
- **請求**：`{ "action": "get_profile", "key": "player_key" }`
- **回傳範例**：
  ```json
  {
    "status": 200,
    "data": {
      "nickname": "子yee",
      "level": 5,
      "exp": 320,
      "gold": 2500,
      "capacity": 15,
      "max_stage": "chapter1_3",
      "heroes": [
        { "hero_id": "guan_yu", "level": 10, "star": 1, "atk": 200, "def": 150, "hp": 2000 }
      ],
      "team": [
        { "hero_id": "guan_yu", "slot": 1 }
      ]
    },
    "rev": 42
  }
  ```

### 4.2 `save_profile` (覆寫資料與樂觀鎖版本控制)
- **Action**：`"save_profile"`
- **請求 Payload**：
  ```json
  {
    "action": "save_profile",
    "key": "player_key",
    "payload": {
      "data": { ...PlayerState },
      "base_rev": 42
    }
  }
  ```
- **成功回傳**：`{ "status": 200, "success": true, "rev": 43, "prev_rev": 42 }`
- **版本衝突錯誤 (400 REV_CONFLICT)**：
  當雲端版本大於 `base_rev` 時拒絕寫入，並回傳雲端目前資料供使用者進行差異比對：
  ```json
  {
    "status": 400,
    "error": "REV_CONFLICT",
    "cloud_rev": 44,
    "cloud_data": { ... }
  }
  ```

### 4.3 `upgrade_hero` (伺服器端升級計算)
- **Action**：`"upgrade_hero"`
- **請求 Payload**：
  ```json
  {
    "action": "upgrade_hero",
    "key": "player_key",
    "payload": {
      "hero_id": "guan_yu",
      "base_rev": 42
    }
  }
  ```
- **成功回傳**：
  ```json
  {
    "status": 200,
    "hero": {
      "hero_id": "guan_yu",
      "level": 11,
      "atk": 208,
      "def": 155,
      "hp": 2100
    },
    "gold_remaining": 2300,
    "cost": 200,
    "rev": 43
  }
  ```
- **錯誤代碼**：`GOLD_NOT_ENOUGH`（金幣不足）、`HERO_NOT_FOUND`（查無武將）。

### 4.4 `save_result` (戰鬥結算寫入，Contract v2)
- **Action**：`"save_result"`
- **契約版本號**：`SETTLE_CONTRACT = 2`
- **請求 Payload**：
  ```json
  {
    "action": "save_result",
    "key": "player_key",
    "payload": {
      "result": "WIN",
      "stage_id": "chapter1_2",
      "stars_earned": 3,
      "kills": 18,
      "time_seconds": 52,
      "loots": [
        { "item": "battle_points", "count": 600 }
      ],
      "request_id": "c7a8b9f0-1234-5678-90ab-cdef12345678",
      "base_rev": 42,
      "settle_contract": 2
    }
  }
  ```
- **成功回傳範例 (完整獎勵保存)**：
  ```json
  {
    "status": 200,
    "success": true,
    "log_id": "battle_log_98765",
    "settle_contract": 2,
    "request_id": "c7a8b9f0-1234-5678-90ab-cdef12345678",
    "reward": {
      "points": 600,
      "exp": 110
    },
    "after": {
      "gold": 3100,
      "exp": 430,
      "level": 5,
      "capacity": 15,
      "max_stage": "chapter1_3"
    },
    "rev": 43
  }
  ```
- **冪等重送保護**：同一場戰鬥之 `request_id` 若已寫入過，後端回傳相同結果與 `duplicate: true`，不會二次扣加獎勵！
