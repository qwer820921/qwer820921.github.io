extends Control

# --- [戰鬥資訊看板腳本] ---

@onready var timer_label = $Panel/VBox/TimeBox/TimerLabel
@onready var stage_label = $Panel/VBox/StageBox/StageLabel
@onready var atk_label = $Panel/VBox/AtkBox/AtkLabel
@onready var hp_label = $Panel/VBox/HpBox/HpLabel
@onready var xp_label = $Panel/VBox/XpBox/XpLabel

func _ready() -> void:
	add_to_group("dashboard")
	# 設定初始樣式（如果需要可以用程式碼微調）
	$Panel.self_modulate = Color(0, 0, 0, 0.7) # 半透明黑色

func _process(_delta: float) -> void:
	# 1. 更新時間與階段 (從 Main 抓取)
	var main = get_tree().get_first_node_in_group("main")
	if main and "game_time" in main:
		var total_seconds = int(main.game_time)
		var minutes = total_seconds / 60
		var seconds = total_seconds % 60
		timer_label.text = "時間: %02d:%02d" % [minutes, seconds]
		
		var total_stage = int(main.game_time / 60.0) + 1
		var visual_stage = ((total_stage - 1) % 10) + 1
		
		if total_stage <= 20:
			stage_label.text = "階段: %d / 20 (S%d)" % [total_stage, visual_stage]
		else:
			stage_label.text = "無限大亂鬥 (S:%d)" % total_stage
			stage_label.add_theme_color_override("font_color", Color(1, 0.4, 0.4)) # 變紅警示

	# 2. 更新玩家數值 (從 Player 抓取)
	var player = get_tree().get_first_node_in_group("player")
	if player:
		atk_label.text = "傷害: %d" % int(player.attack_damage)
		hp_label.text = "生命: %d / %d" % [int(player.current_health), int(player.max_health)]
		xp_label.text = "經驗: %d / %d (Lv %d)" % [player.current_xp, player.xp_to_next_level, player.current_level]
