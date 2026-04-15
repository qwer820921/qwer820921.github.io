## Main.gd
## 神馬三國 主場景
## Phase 0 Demo：接收 Web payload → 模擬戰鬥 → 回傳結算結果

extends Node2D

# ── UI 節點 ──
@onready var status_label: Label       = %StatusLabel
@onready var payload_label: RichTextLabel = %PayloadLabel
@onready var battle_btn: Button        = %BattleBtn
@onready var web_bridge: Node          = $WebBridge

# 暫存收到的 payload
var _current_payload: Dictionary = {}

# ──────────────────────────────────
func _ready() -> void:
	web_bridge.payload_received.connect(_on_payload_received)
	battle_btn.pressed.connect(_on_battle_btn_pressed)

	_set_status("等待 Web 傳入 payload...", Color.YELLOW)
	battle_btn.disabled = true

	# 非 Web 環境下提供手動測試按鈕
	if OS.get_name() != "Web":
		_set_status("非 Web 環境 — 可點擊按鈕模擬接收", Color.CYAN)
		battle_btn.text = "模擬收到 Payload"
		battle_btn.disabled = false

# ──────────────────────────────────
#  接收 Web 傳來的出征資料
# ──────────────────────────────────
func _on_payload_received(payload: Dictionary) -> void:
	_current_payload = payload

	var stage_id: String = payload.get("stage_id", "N/A")
	var team: Array      = payload.get("team_list", [])
	var map_name: String = payload.get("map", {}).get("name", "N/A")

	_set_status("已收到出征指令 ✓", Color.GREEN)
	_set_payload_info("""[b]Stage:[/b] %s
[b]地圖:[/b] %s
[b]隊伍:[/b] %d 名武將
  %s""" % [
		stage_id,
		map_name,
		team.size(),
		"\n  ".join(team.map(func(h): return "%s Lv.%d" % [h.get("hero_id","?"), h.get("level",1)]))
	])

	# 啟用出戰按鈕
	battle_btn.text = "開始模擬戰鬥"
	battle_btn.disabled = false

# ──────────────────────────────────
#  按鈕：模擬戰鬥
# ──────────────────────────────────
func _on_battle_btn_pressed() -> void:
	if OS.get_name() != "Web" and _current_payload.is_empty():
		# 非 Web 環境手動測試：填入假 payload
		_on_payload_received({
			"stage_id": "chapter1_1",
			"team_list": [
				{ "hero_id": "guan_yu",   "level": 10, "star": 1 },
				{ "hero_id": "zhou_cang", "level":  8, "star": 0 },
			],
			"map": { "name": "虎牢關" }
		})
		return

	battle_btn.disabled = true
	_set_status("戰鬥中...", Color.ORANGE)

	# 模擬 2 秒戰鬥
	await get_tree().create_timer(2.0).timeout
	_finish_battle()

# ──────────────────────────────────
#  戰鬥結束：回傳結算結果給 Web
# ──────────────────────────────────
func _finish_battle() -> void:
	var stage_id: String = _current_payload.get("stage_id", "chapter1_1")

	var result: Dictionary = {
		"result":        "WIN",
		"stage_id":      stage_id,
		"stars_earned":  3,
		"kills":         42,
		"time_seconds":  87,
		"loots": [
			{ "item": "gold", "count": 300 }
		]
	}

	_set_status("戰鬥結束！結果已傳回 Web ✓", Color.GREEN)
	_set_payload_info("[b]回傳結算：[/b]\n" + JSON.stringify(result, "\t"))

	web_bridge.send_result(result)

	# 重置狀態
	await get_tree().create_timer(3.0).timeout
	battle_btn.text = "再來一場"
	battle_btn.disabled = false
	_current_payload = {}

# ──────────────────────────────────
#  UI 更新輔助
# ──────────────────────────────────
func _set_status(text: String, color: Color = Color.WHITE) -> void:
	status_label.text = text
	status_label.modulate = color

func _set_payload_info(bbcode: String) -> void:
	payload_label.text = bbcode
