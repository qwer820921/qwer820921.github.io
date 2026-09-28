## bridge_recorder.gd
## 測試用（不進正式產物）：記錄 BattleManager 交給 WebBridge 的 update_stats 與結算，以及防禦塔面板與目標優先的回覆（Round 17）、拆除的回覆與隱藏面板（Round 18）。
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
