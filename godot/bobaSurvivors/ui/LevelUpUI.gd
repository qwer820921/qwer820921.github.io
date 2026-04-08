extends CanvasLayer

# 定義所有可能的技能 (豐富的珍珠奶茶風味)
var all_skills = [
	{"id": "damage", "name": "渾圓珍珠", "desc": "珍珠傷害 +2", "type": "damage", "value": 2.0},
	{"id": "speed", "name": "極速布丁", "desc": "移動速度 +50", "type": "speed", "value": 50.0},
	{"id": "fire_rate", "name": "全糖發射", "desc": "發射間隔縮短 0.15 秒", "type": "fire_rate", "value": 0.15},
	{"id": "bullet_count", "name": "雙倍加料", "desc": "每次噴出的珍珠數量 +1", "type": "bullet_count", "value": 1},
	{"id": "orbit", "name": "旋轉焦糖圓環", "desc": "召喚波霸形成絕對防禦圈", "type": "orbit", "value": 1},
	{"id": "bounce", "name": "彈跳椰果", "desc": "珍珠將在怪群中瘋狂彈跳", "type": "bounce", "value": 1},
	{"id": "pierce", "name": "穿透大珍珠", "desc": "珍珠將會貫穿整排敵人", "type": "pierce", "value": 1}
]

var current_options = []

func _ready() -> void:
	# 加入群組，確保玩家能量身找到
	add_to_group("level_up_ui")
	# 自己身為 CanvasLayer，直接控制自己的顯示
	self.visible = false
	if get_parent() is CanvasLayer:
		get_parent().visible = false
	print("--- UI 系統啟動：我現在是長官 (CanvasLayer) 了 ---")

func show_ui() -> void:
	all_skills.shuffle()
	current_options = all_skills.slice(0, 3)
	
	# 更新三顆按鈕
	update_button(1, current_options[0])
	update_button(2, current_options[1])
	update_button(3, current_options[2])
	
	self.visible = true
	if get_parent() is CanvasLayer:
		get_parent().visible = true
	print("--- UI 系統：已顯示升級選單 ---")

func update_button(index: int, skill_data: Dictionary) -> void:
	var btn_name = "SkillButton" + str(index)
	# 使用 find_child 直接搜尋全場
	var btn = find_child(btn_name, true, false)
	
	if btn:
		btn.text = skill_data["name"] + "\n(" + skill_data["desc"] + ")"
		btn.custom_minimum_size = Vector2(200, 100) # 給個保險的大小
		print("成功設定按鈕：" + btn_name)
	else:
		print("重大錯誤：在 LevelUpUI 內部完全找不到 " + btn_name + "，請檢查按鈕名字！")

# 按鈕訊號連接 (請確保訊號有連到這裡)
func _on_skill_button_1_pressed(): apply_skill(current_options[0])
func _on_skill_button_2_pressed(): apply_skill(current_options[1])
func _on_skill_button_3_pressed(): apply_skill(current_options[2])

func apply_skill(skill_data: Dictionary) -> void:
	# 直接在全場搜尋名字叫 Player 的人，防呆且精準
	var player = get_tree().root.find_child("Player", true, false)
	
	if player:
		print("✅ 成功對準玩家套用技能：" + skill_data["name"])
		match skill_data["type"]:
			"damage": player.add_damage(skill_data["value"])
			"speed": player.add_speed(skill_data["value"])
			"fire_rate": player.add_fire_rate(skill_data["value"])
			"bullet_count": player.add_bullet_count(skill_data["value"])
			"orbit": player.add_orbit_pearl()
			"bounce": player.add_bounce(skill_data["value"])
			"pierce": player.add_pierce(skill_data["value"])
	else:
		print("❌ 錯誤：在大地圖內找不到名字為 Player 的節點！")
	
	get_tree().paused = false
	self.visible = false
	if get_parent() is CanvasLayer:
		get_parent().visible = false
