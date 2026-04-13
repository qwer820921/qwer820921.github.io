extends Control

# --- [戰鬥資訊看板腳本] ---

@onready var timer_label = $Panel/MainHBox/VBox/TimeBox/TimerLabel
@onready var stage_label = $Panel/MainHBox/VBox/StageBox/StageLabel
@onready var atk_label = $Panel/MainHBox/VBox/AtkBox/AtkLabel
@onready var hp_label = $Panel/MainHBox/VBox/HpBox/Header/HpLabel
@onready var hp_bar = %HpBar
@onready var xp_label = $Panel/MainHBox/VBox/XpBox/Header/XpLabel
@onready var xp_bar = %XpBar

func _ready() -> void:
	add_to_group("dashboard")
	# 設定初始樣式
	$Panel.self_modulate = Color(0, 0, 0, 0.7) 

func _process(_delta: float) -> void:
	# 1. 更新時間與階段 (從 Main 抓取)
	var main = get_tree().get_first_node_in_group("main")
	if main and "game_time" in main:
		var total_seconds = int(main.game_time)
		var minutes = total_seconds / 60
		var seconds = total_seconds % 60
		timer_label.text = "時間: %02d:%02d" % [minutes, seconds]
		
		var total_stage = int(main.game_time / 40.0) + 1
		var visual_stage = ((total_stage - 1) % 10) + 1
		
		if total_stage <= 20:
			stage_label.text = "階段: %d / 20 (S%d)" % [total_stage, visual_stage]
		else:
			stage_label.text = "無限大亂鬥 (S:%d)" % total_stage
			stage_label.add_theme_color_override("font_color", Color(1, 0.4, 0.4)) 

	# 2. 更新玩家數值 (從 Player 抓取)
	var player = get_tree().get_first_node_in_group("player")
	if player:
		atk_label.text = "傷害: %d" % int(player.attack_damage)
		hp_label.text = "%d / %d" % [int(player.current_health), int(player.max_health)]
		
		# --- [NEW] 紅色血條連動 ---
		if hp_bar:
			hp_bar.max_value = player.max_health
			hp_bar.value = player.current_health
			
		xp_label.text = "%d / %d (Lv %d)" % [player.current_xp, player.xp_to_next_level, player.current_level]
		
		# --- [NEW] 綠色經驗條連動 ---
		if xp_bar:
			xp_bar.max_value = player.xp_to_next_level
			xp_bar.value = player.current_xp
		
		# --- [NEW] 同步技能圖標清單 ---
		update_skill_icons(player.skill_levels)

var _last_skill_levels_str = ""
func update_skill_icons(skill_levels: Dictionary):
	# 簡單的版本校驗：如果資料沒變就不要重繪，節省效能
	var current_str = str(skill_levels)
	if current_str == _last_skill_levels_str:
		return
	
	_last_skill_levels_str = current_str
	
	# 清空舊圖標
	var skill_box = get_node_or_null("%SkillBox")
	if not skill_box: return
	
	for child in skill_box.get_children():
		child.queue_free()
		
	# 重新生成所有已獲得技能
	var skill_icon_scene = preload("res://ui/SkillIcon.tscn")
	for skill_id in skill_levels.keys():
		var icon = skill_icon_scene.instantiate()
		skill_box.add_child(icon)
		icon.set_skill(skill_id, skill_levels[skill_id])
