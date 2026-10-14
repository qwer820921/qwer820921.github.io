## bridge_recorder.gd
## 測試用（不進正式產物）：記錄 BattleManager 交給 WebBridge 的 update_stats 與結算，以及防禦塔面板與目標優先的回覆、拆除的回覆與隱藏面板、部署選單的 click_cell 與戰鬥速度的回覆、手動暫停的回覆、戰況觀測。
## 非 Web 平台上 WebBridge 不會真的送出訊息，所以繼承正式的 WebBridge，
## 只在呼叫原本的方法之前多記一份副本，其他行為完全不變。
## 由 lifecycle_test.gd 暫時換掉 Main.web_bridge 使用（Main 每次載入關卡都會把它交給 BattleManager）。

extends "res://bridge/WebBridge.gd"

var sent_stats: Array = []
var sent_results: Array = []
var sent_ready: int = 0
var sent_panels: Array = []
var sent_tower_targets: Array = []
## Round 18：拆除防禦塔的回覆、隱藏面板的次數
var sent_sells: Array = []
var sent_hides: int = 0
## 部署選單的 click_cell（帶 battle_id 與選單編號）、戰鬥速度的回覆
var sent_clicks: Array = []
var sent_speeds: Array = []
## 手動暫停的回覆
var sent_pauses: Array = []
## 測試用唯讀快照（debug_snapshot）
var sent_snapshots: Array = []
## 拒絕開戰的原因（wave_rejected）
var sent_wave_rejects: Array = []
## 戰況觀測（battle_observation）
var sent_observations: Array = []

func send_ready() -> void:
	sent_ready += 1
	super.send_ready()

func send_stats(stats: Dictionary) -> void:
	sent_stats.append(stats.duplicate(true))
	super.send_stats(stats)

func send_result(result: Dictionary) -> void:
	sent_results.append(result.duplicate(true))
	super.send_result(result)

func send_show_upgrade_panel(data: Dictionary) -> void:
	sent_panels.append(data.duplicate(true))
	super.send_show_upgrade_panel(data)

func send_tower_target_changed(data: Dictionary) -> void:
	sent_tower_targets.append(data.duplicate(true))
	super.send_tower_target_changed(data)

func send_tower_sell_result(data: Dictionary) -> void:
	sent_sells.append(data.duplicate(true))
	super.send_tower_sell_result(data)

func send_hide_upgrade_panel() -> void:
	sent_hides += 1
	super.send_hide_upgrade_panel()

func send_click_cell(data: Dictionary) -> void:
	sent_clicks.append(data.duplicate(true))
	super.send_click_cell(data)

func send_game_speed_result(data: Dictionary) -> void:
	sent_speeds.append(data.duplicate(true))
	super.send_game_speed_result(data)

func send_game_pause_result(data: Dictionary) -> void:
	sent_pauses.append(data.duplicate(true))
	super.send_game_pause_result(data)

func send_debug_snapshot(data: Dictionary) -> void:
	sent_snapshots.append(data.duplicate(true))
	super.send_debug_snapshot(data)

func send_wave_rejected(data: Dictionary) -> void:
	sent_wave_rejects.append(data.duplicate(true))
	super.send_wave_rejected(data)

## 觀測多記一個送出時的牆鐘毫秒（__ms），測試用來檢查送出的間隔
func send_battle_observation(data: Dictionary) -> void:
	var copy: Dictionary = data.duplicate(true)
	copy["__ms"] = Time.get_ticks_msec()
	sent_observations.append(copy)
	super.send_battle_observation(data)
