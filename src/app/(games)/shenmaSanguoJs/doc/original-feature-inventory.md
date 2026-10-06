# 原版「神馬三國」完整功能盤點與規格紀錄

> 建立日期：2026-10-06  
> 目的：全面盤點本專案現有神馬三國（Web + Godot 4.x 戰鬥）之所有功能、玩法機制、數值規則、UI 模組、存檔協議與後端介面，作為「純前端 JS 渲染版」重構的核心依據與對齊標準。

---

## 1. 系統架構與通訊概覽

### 1.1 技術棧與模組分工
- **Web 前端**：Next.js 16 (App Router) + React 19 + Bootstrap 5.3 (`react-bootstrap`) + Zustand。
- **原版戰鬥引擎**：Godot 4.6.2 (Web 匯出產物位於 `public/games/shenmaSanguo/`)，以 `<iframe>` 嵌入。
- **通訊方式**：雙向 `window.postMessage`，定義於 `godot/shenmaSanguo/bridge/WebBridge.gd` 與 Web `utils/gameEngine.ts`。
- **協定版本**：**Protocol 7**（握手時檢查 `protocol` 版本，版本不符顯示更新提示）。
- **後端服務**：Google Apps Script (GAS) + Google Sheets 試算表（唯讀靜態表 + 玩家 JSON 存檔）。

### 1.2 通訊訊息清單 (Web ↔ Godot)
| 方向 | 訊息 `type` | 內容 / 參數 | 目的 |
| --- | --- | --- | --- |
| Godot → Web | `game_ready` | `{ protocol: 7 }` | 告知引擎就緒與協定版本 |
| Web → Godot | `request_ready` | `{}` | 若 Web 晚掛載，請求重新發送 `game_ready` |
| Web → Godot | (出征 payload) | `{ stage_id, battle_id, player, team_list, heroes_config, enemies_config, map, sound_settings }` | 送入關卡與武將出征完整資料 |
| Godot → Web | `update_stats` | `{ battle_id, gold, base_hp, wave, total_waves, speed, time_scale, paused, ... }` | 即時戰場數據同步至 Web HUD |
| Godot → Web | `click_cell` | `{ battle_id, menu_id, cell_x, cell_y, tile_type, screen_pos, ... }` | 點擊地圖空格，觸發 Web 部署選單 |
| Godot → Web | `show_upgrade_panel` | `{ battle_id, unit_type, unit_id, level, cost, target_modes, anti_air, ... }` | 選取單位，觸發升級/目標/拆除面板 |
| Godot → Web | `hide_upgrade_panel` | `{}` | 關閉單位面板 |
| Godot → Web | `battle_ended` | `{ battle_id, result: "WIN"/"LOSE", stage_id, stars_earned, kills, time_seconds, loots }` | 戰鬥結束結算報告 |
| Godot → Web | `wave_rejected` | `{ battle_id, wave, missing, skipped: [{ index, enemy_id, path, reason }] }` | 波次設定無效，拒絕開戰並告知原因 |
| Web → Godot | `start_battle` | `{}` | 備戰完畢，手動開戰 |
| Web → Godot | `toggle_auto` | `{}` | 切換自動開下一波模式 |
| Web → Godot | `set_game_speed` | `{ battle_id, speed: 1 / 2 }` | 切換 1x / 2x 倍速 |
| Web → Godot | `set_paused` | `{ battle_id, paused: true / false }` | 手動暫停 / 繼續 |
| Web → Godot | `set_tower_target` | `{ battle_id, tower_uid, target_mode }` | 切換防禦塔目標優先策略 |
| Web → Godot | `sell_tower` | `{ battle_id, tower_uid }` | 備戰期拆除防禦塔 |
| Web → Godot | `update_team` | `{ team_list }` | 戰鬥中動態更新隊伍屬性 |
| Web → Godot | `update_sound_settings`| `{ sfx_enabled, sfx_polyphony }` | 更新音效設定 |

---

## 2. 戰場核心與戰鬥機制 (Combat Engine)

### 2.1 地圖與瓦片系統 (Tile Grid)
- **畫面比例與適配**：540:720 固定長寬比，依視窗最大化並留邊，座標自動轉換（`utils/stageAnchor.ts`）。
- **瓦片尺寸**：標準網格（48×48 像素）。
- **瓦片類型（TileType）**：
  - `ROAD`（道路）：敵人行經路線。武將放置於此可阻擋地面敵人，並施加緩速。
  - `BUILD`（建築高台）：可放置遠程武將或防禦塔（不阻擋敵人）。
  - `OBSTACLE`（障礙物）：不可放置任何單位，不可通行。
  - `SPAWN`（起點）：敵人生成出生點。
  - `BASE`（基地/城池）：終點，敵人漏怪抵達扣除城防 HP。
- **多路線支援**：支援 `path_a`、`path_b`、`path_c` 等多條折線路徑航點（Waypoint Array）。
- **地圖貼圖**：支援自訂地圖瓦片貼圖（如 `tile_grass1.webp`, `tile_lava.webp` 等）。

### 2.2 波次與出兵系統 (Wave Manager)
- **波次結構**：每關包含複數波次（Waves），每波可包含多個敵人組（Enemy Groups），各自定義數量、出兵間隔、路徑路線。
- **混合敵人組**：同一波次可同時混合地面敵人與飛行敵人。
- **波次安全性驗證（拒絕開戰機制）**：
  - 飛行組路徑少於 2 個點，或起終點同格：判定無效並在出兵前略過。
  - 地面組總路程為 0（起終點相同且無中間路程）：出兵前略過。
  - 整波皆無有效敵人或關卡完全無波次：直接拒絕第 1 波開戰（`send_wave_rejected`），顯示原因並不扣城防、不結算。
- **自動開波（Auto Next Wave）**：當前波次清空後，等待 1.5 秒（`AUTO_NEXT_WAVE_DELAY`）自動觸發下一波。

### 2.3 敵人物理與移動行為 (Enemy Entity)
- **移動類型**：
  - `ground`（地面）：嚴格沿著折線航點移動；撞上道路阻擋武將會被攔截停下。
  - `flying`（飛行）：從起點直接直線飛往終點，不受道路武將阻擋、不攻擊武將。
- **敵人屬性**：
  - `hp` / `max_hp`：生命值與受傷閃爍。
  - `speed`：基礎移動速度。
  - `atk`：對阻路武將的直接攻擊力（未設定時預設 20.0）。
  - `trait`：特性標記，若為 `immune_slow` 則免疫所有倍率減速（但仍會被武將阻擋）。
- **受控狀態**：
  - **倍率減速 (`speed_mult`)**：取多個減速來源（光環、道路阻擋）中最強者（MIN），最慢保留基礎速度 15%。
  - **疊加減速**：文士塔專用減速效果。
  - **暈眩 (`stun`)**：張飛技能；停止移動與阻擋攻擊，冷卻暫停但不清空，照常受傷。
  - **灼燒 (`burn`)**：周瑜技能；每秒造成跳傷 DOT（橘色跳字）。
- **路程計算 (`remaining_distance`)**：
  - 地面敵人：目前位置到下個路點 + 剩餘航點折線總長。
  - 飛行敵人：目前位置到終點之直線歐式距離。
  - 此值用於防禦塔的「優先前方（first）」索敵比對。
- **阻路戰鬥**：
  - 地面敵人被阻擋時，每 1.0 秒（`BLOCKER_ATK_SPD`）攻擊阻擋武將一次。
  - 攻擊冷卻計時器保留溢出零頭，換阻擋武將不重置，無阻擋時不囤積攻擊次數。
  - 抵達基地時扣除城池 HP 1 點並消失。
  - 死亡時給予玩家戰鬥金幣 +5（`GOLD_PER_KILL`）。

### 2.4 防禦塔系統 (Tower System)
- **5 種防禦塔類型**：
  | 塔種 | 名稱 | 攻擊方式 | 攻速 | 射程 | 造價 / 升級基數 | 特殊機制 | 對空能力 |
  | --- | --- | --- | --- | --- | --- | --- | --- |
  | `archer` | 弓兵塔 | 單體遠程 | 0.8s | 2.5格 | 50 / 50 | 穩定單體輸出 | **可對空** |
  | `infantry` | 步兵塔 | 近戰光環 | 1.5s | 1.5格 | 70 / 60 | 範圍減速光環 (55%) | 僅地面 |
  | `artillery` | 砲兵塔 | 範圍拋射 | 3.0s | 2.0格 | 100 / 80 | 範圍爆炸傷害 (半徑 80px) | 僅地面 |
  | `cavalry` | 騎兵塔 | 近戰高速 | 1.2s | 1.8格 | 120 / 70 | 爆發近戰穿刺 | 僅地面 |
  | `scholar` | 文士塔 | 輔助減速 | 1.2s | 2.5格 | 80 / 75 | 普攻不扣血，疊加減速 | **可對空減速** |

- **等級與升級**：最高 5 級，消耗戰鬥金幣升級（費用隨等級遞增）。
- **拆除退費（Sell Tower）**：僅限備戰期（PREP），返還該塔歷史累計投入建造與升級金幣之 50%（向下取整）。
- **目標優先策略（Target Modes）**：
  1. `first`（優先前方）：距離終點剩餘路程最短者。
  2. `strongest`（血量最多）：當前 HP 數值最高者。
  3. `weakest`（血量最少）：當前 HP 數值最低者。
  4. `air_first`（優先飛行）：僅弓兵塔、文士塔可選；射程內有飛行敵人先打飛行，無飛行則打地面。

### 2.5 武將放置與戰鬥行為 (Hero Entity)
- **部署位置**：
  - 放置於 `ROAD`：攻擊最近敵人，對其施加阻擋與 30% 減速（`SLOW_RATIO = 0.30`）。受地面敵人近戰攻擊。
  - 放置於 `BUILD`：高台遠程攻擊，不阻擋、不受攻擊。
- **對空職業限制**：
  - 弓兵（`archer`）、法師（`mage`）：可攻擊地面與飛行。
  - 步兵（`infantry`）、騎兵（`cavalry`）、砲兵（`artillery`）：只打地面敵人。
- **拖曳移位（Reposition）**：僅限備戰期，可將場上武將拖曳移至其他合法格子。
- **生命與防禦計算**：
  - 受傷計算公式：依武將防禦力減傷。
  - 陣亡判定：HP 歸零陣亡，移除阻擋判定。

---

## 3. 武將技能系統 (Hero Skills)

現有程式中已完整實作並經過回歸測試的 **13 位武將技能**（唯一規則來源為 Web `utils/heroSkills.ts`）：

| 武將 | 技能名稱 | 類型 | 數值與規則 | 畫面效果 / 標記 |
| --- | --- | --- | --- | --- |
| **馬超** | 衝鋒 (`first_strike`) | 觸發 (首擊) | 每場戰鬥第一次命中敵人的普攻造成 **2 倍傷害**。之後恢復常態。更換關卡或同關重開才重置。 | 頭頂金色放大「x2!」，敵人跳雙倍傷害 |
| **趙雲** | 閃避 (`dodge`) | 被動 (受擊) | 每次受到直接攻擊時抽檢，**15% 機率閃避**，該次攻擊完全不扣血，敵方正常消耗攻擊冷卻。 | 頭頂藍白色「MISS」淡出 |
| **黃忠** | 百步穿楊 (`long_range`) | 被動 (射程) | 戰場有效射程提升為原本的 **1.5 倍**（計算基礎射程與等級成長後乘 1.5，不疊乘）。 | 射程光圈與屬性面板顯示加成射程 |
| **周瑜** | 火攻 (`burn`) | 普攻附加 (DOT) | 命中附加灼燒，每秒 1 次、共 3 跳，每跳為命中當下攻擊力的 **20%**。再次命中刷新跳數與傷害。 | 敵人橘色外圈，跳傷文字為橘色 |
| **關羽** | 減速光環 (`slow_aura`) | 光環 (範圍) | 射程內所有地面敵人移動速度 **× 0.9**（減速 10%）。與其他減速取最強者。飛行與免疫者無效。 | 腳下淺藍色範圍圈，敵人淺藍虛線外圈 |
| **劉備** | 防禦光環 (`def_aura`) | 光環 (友軍) | 射程內其他友軍武將防禦 **× 1.2**（提升 20%）。不含自己、防禦塔與城池。多個光環取最強不疊加。 | 腳下淺綠色範圍圈，受加成友軍淺綠外框 |
| **張飛** | 暈眩 (`stun`) | 普攻附加 (CC) | 命中後目標**暈眩 0.5 秒**（停止移動與攻擊）。再次命中取剩餘較長者。免疫減速之敵人仍會暈眩。 | 敵人血條上方 3 顆旋轉黃色星星 |
| **魏延** | 吸血 (`lifesteal`) | 普攻附加 (回復) | 普攻命中後恢復實扣敵人生命之 **15%**（不含溢出溢傷）。不超過最大 HP，不復活。 | 頭頂綠色「+回復量」浮動文字 |
| **曹操** | 指揮 (`atk_speed_aura`) | 光環 (友軍) | 射程內其他友軍武將攻速 **× 1.15**（攻擊間隔 ÷ 1.15）。加成套用於新開冷卻。多個光環取最強。 | 腳下淡紫色範圍圈，受加成友軍淡紫框 |
| **夏侯惇** | 反擊 (`counter`) | 受擊觸發 (反傷) | 受直接攻擊實扣 HP 後若存活，將實扣生命之 **20%** 反彈給攻擊者。不引發吸血/暈眩/二次反擊。 | 反彈傷害為洋紅色浮動數字 |
| **廖化** | 堅韌 (`tenacity`) | 被動 (減傷) | 受傷前生命比例 **≤ 30%** 時，防禦計算後傷害再 **× 0.8**（少扣 20%）。生命回升後取消。 | 血條古銅色外框與小盾牌標記 |
| **顏良** | 威壓 (`atk_down_aura`) | 光環 (敵方) | 射程內所有敵人對武將之攻擊力 **× 0.9**（降低 10%）。地面/飛行/免疫皆生效。漏怪扣城池不降。 | 腳下暗紅色範圍圈，敵人血條旁暗紅下箭頭 |
| **孫尚香** | 連射 (`double_shot`) | 普攻附加 (連擊) | 普攻命中若敵方存活，**20% 機率追加一擊**（原攻擊力 100%）。追加擊不重複觸發連射與技能。 | 武將頭頂金色「+1」浮動標記 |
| *(原型)* | 橫掃 (`sweep`) | 普攻附加 (範圍) | 普攻命中後主目標 1 格內最多 2 名存活敵人各受 50% 傷害。目前無正式武將綁定，保留原型。 | 範圍濺射傷害數字 |

---

## 4. 戰鬥操作與 HUD 佈局 (UI & Interaction)

### 4.1 頂欄與狀態 HUD
- **基地城防生命（Base HP）**：初始 20 點，歸零失敗。
- **戰鬥金幣（Battle Gold）**：初始 5000（擊殺 +5），用於蓋塔與升級，每場獨立。
- **世界點數（Coins）/ 金幣（Gold）**：玩家長效帳戶資產（顯示於頂欄）。
- **倍速切換按鈕（SpeedToggle）**：1x / 2x 倍速切換。
- **暫停切換按鈕（PauseToggle）**：手動暫停 / 繼續（凍結所有單位移動、出怪與冷卻時間）。
- **下一波預覽按鈕（NextWaveEntry）**：查看即將到來的下一波敵軍名單、路線與防空預警。
- **迎戰按鈕**：備戰完畢點擊開始波次。
- **自動模式開關**：自動連續開波切換。

### 4.2 部署選單（PlacementMenu）
- 點選地圖空格子時觸發，伴隨 **0.1x 子彈時間慢速**（避免部署時被敵人偷襲）。
- 依格子類型（ROAD / BUILD）過濾可放置單位：
  - ROAD 格：顯示隊伍中的步兵/近戰武將。
  - BUILD 格：顯示遠程武將，以及 5 種防禦塔（含建造費用）。

### 4.3 單位面板（Unit Panel）
- 選取場上武將：顯示目前等級、屬性、實際射程、技能說明、撤退/移位按鈕。
- 選取場上防禦塔：顯示當前等級、升級費用按鈕、目標優先下拉選單（first/strongest/weakest/air_first）、備戰拆除按鈕（顯示 50% 返還金幣）。

---

## 5. 養成、隊伍與關卡模組 (Web Modules)

### 5.1 武將列表與升級 (Heroes Modal / Page)
- **搜尋與篩選**：支援依名稱/ID 關鍵字搜尋；依職業（步兵、弓兵、砲兵、騎兵、法師、其他）篩選。
- **多維度排序**：預設順序、等級高→低、攻擊力高→低、升級費用低→高。
- **武將詳情卡片**：展示基礎屬性、成長率、被動技能規則解說、戰場換算數值。
- **升級系統（`upgrade_hero`）**：
  - 消耗世界金幣，升級後提升攻、防、HP、射程、攻速。
  - 升級在途保護：升級請求發出時鎖定操作，防止重複點擊。
  - 回應遺失待確認機制（`pendingUpgrade`）：若網路斷線或重新整理，進入「結果待確認」狀態，重新與後端核對版本，不覆蓋存檔。

### 5.2 隊伍編排 (Team Edit Modal / Page)
- **5 個出征槽位**：玩家自選 5 位武將出征。
- **隊伍清單操作**：支援點擊入隊/移出隊伍，支援無障礙鍵盤操作。
- **專屬排序**：在武將篩選基礎上，額外支援「出陣費用（Cost）」排序。

### 5.3 關卡選擇與敵軍預覽 (Stages Modal / Page)
- **章節地圖進度**：顯示各關卡通關狀態、星數（1~3 星）、解鎖條件。
- **未開放關卡標記**：若 Google Sheets 資料缺路線或缺波次，標記為「尚未開放」並明確列出缺漏原因，禁止開戰。
- **防空準備提醒（`StageAirReadinessNote`）**：自動比對隊伍武將防空能力與關卡飛行波次，若關卡有飛行怪但隊伍無對空武將，顯示警示提醒。
- **關卡敵軍預覽（`EnemyPreviewModal`）**：出征前查看關卡所有波次的敵人陣容、怪物 HP、速度、攻擊力、免疫特性。

### 5.4 系統設定與存檔管理 (Settings Modal / Page)
- **音效設定**：BGM 與 SFX 開關及音量控制。
- **金鑰管理**：輸入自訂玩家金鑰（Key）切換帳戶，切換前自動保存目前存檔。
- **離線備份與比較（`BackupPreviewModal`）**：
  - 匯出本機 JSON 備份檔。
  - 支援上傳備份檔進行唯讀差異比對（`SaveCompareTable`），呈現本機 vs 備份檔之武將等級、進度與資產 diff。

---

## 6. 存檔架構、版本合約與網路同步 (Storage & API)

### 6.1 存檔資料結構 (`PlayerState`)
```ts
{
  nickname: string;      // 玩家暱稱
  level: number;         // 主公等級
  exp: number;           // 主公經驗值
  gold: number;          // 世界點數 / 金幣
  capacity: number;      // 隊伍容量上限
  max_stage: string;     // 最高通關關卡 ID
  heroes: HeroState[];   // 各武將等級、星數、數值
  team: TeamSlot[];      // 出征 5 人槽位設定
}
```

### 6.2 本機快取與防護機制 (`playerStore`)
- **雙層儲存**：`localStorage`（儲存玩家 Key） + `sessionStorage`（儲存完整玩家快照）。
- **30 秒 Debounce 同步**：本機數值異動後延遲 30 秒批次送出 `save_profile`，避免頻繁請求。
- **版本契約保護（`serverRev` / `base_rev`）**：
  - 本機記下伺服器版本號 `serverRev`。
  - 保存與升級時帶上 `base_rev`，若後端發現版本已被其他裝置推進，回報 `VERSION_CONFLICT`，彈出衝突比對視窗，絕不盲目覆蓋。
- **結算契約合約（`settle_contract: 2`）**：
  - 戰鬥結束後由後端在同一次交易中原子性發放金幣、經驗、等級與進度，防止單獨保存遺失獎勵。
  - 帶有 `request_id`（`battle_id`），若網路超時重送，後端辨識相同 ID 則返回已發放結果，絕不重複發獎。
- **戰鬥票券綁定（`BattleTicket`）**：
  - 開戰時生成唯一 `battle_id` 並鎖定目前帳號世代。
  - 結算時比對 `battle_id`，若戰鬥中切換過帳號或逾期，舊結算自動作廢。
- **跨來源隔離防護（`MigrationHold`）**：
  - 若自跨來源隔離遷移失敗導致資料遺失疑慮，啟用唯讀鎖定，禁止向雲端覆蓋舊存檔。

### 6.3 唯讀請求重試與等待提示
- 針對 `get_settings`, `get_heroes_config`, `get_enemies_config`, `get_all_maps`, `get_profile`：
  - 30 秒超時機制。
  - 失敗後指數退避自動重試（1s, 2s，最多重試 2 次）。
  - 超過 8 秒未回時，介面提示「伺服器回應較慢，請稍候」。

---

## 7. 「純前端 JS 渲染版」重構承接指引

在進行「純前端 JS 渲染版」開發時，各模組之共用與重構邊界如下：

### 7.1 可直接完整沿用之模組（零修改或微調）
1. **靜態資料與 API**：`api/gameApi.ts`, `store/staticConfigStore.ts`, Google Sheets 資料結構。
2. **玩家存檔與版本控制**：`store/playerStore.ts`, 結算合約契約（`settle_contract: 2`）, 衝突保護。
3. **武將技能規格庫**：`utils/heroSkills.ts`（已是單一真實來源，直接供 JS 引擎判定）。
4. **武將過濾與排序演算法**：`utils/heroFilter.ts`, `utils/heroStats.ts`, `utils/heroCategories.ts`。
5. **關卡安全與防空檢查**：`utils/stageAirReadiness.ts`, `utils/stagePlayability.ts`, `utils/stagePreview.ts`。
6. **UI 視窗元件**：所有 React-Bootstrap Modals（武將、隊伍、關卡、設定、預覽）。

### 7.2 需以純前端技術重新實現之核心（替代 Godot）
1. **主戰場循環 (Game Loop)**：以 `requestAnimationFrame` + 固定物理時間步長（如 1/60s），支援 1x / 2x 倍速、暫停、部署 0.1x 慢速。
2. **戰場渲染層 (Renderer)**：HTML5 Canvas 2D 或 PixiJS，繪製地圖網格、道路貼圖、武將/防禦塔動畫或立繪、敵人移動、血條、浮動傷害文字。
3. **戰鬥邏輯狀態機 (Battle Logic)**：
   - 波次管理器（WaveManager）：產怪計時、航點推進、波次切換、全清自動開波。
   - 碰撞與阻擋（Block System）：地面敵人間隔攻擊道路武將、武將道路緩速。
   - 尋路與移動（Path Navigation）：地面折線航點、飛行直線航點、剩餘路程比對。
   - 索敵與目標管理（Targeting）：4 種防禦塔索敵、射程內檢測、對空判定。
   - 13 大武將技能觸發器：首擊、閃避、火攻 DOT、光環、暈眩、吸血、反傷、連射等狀態機。
4. **移除 WebBridge iframe 通訊**：改為純 JavaScript 內部事件或 Zustand Store 直接驅動，大幅提升響應速度與架構簡潔度。
