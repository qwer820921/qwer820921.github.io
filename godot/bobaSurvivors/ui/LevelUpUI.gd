extends CanvasLayer

# 定義所有可能的技能 (豐富的珍珠奶茶風味)
var all_skills = [
	{"id": "damage", "name": "渾圓珍珠", "desc": "珍珠傷害 +2", "type": "damage", "value": 2.0},
	{"id": "speed", "name": "極速布丁", "desc": "移動速度 +50", "type": "speed", "value": 50.0},
	{"id": "fire_rate", "name": "全糖發射", "desc": "發射間隔縮短 0.15 秒", "type": "fire_rate", "value": 0.15},
	{"id": "bullet_count", "name": "雙倍加料", "desc": "每次噴出的珍珠數量 +1", "type": "bullet_count", "value": 1},
	{"id": "orbit", "name": "旋轉焦糖圓環", "desc": "召喚波霸形成絕對防禦圈", "type": "orbit", "value": 1},
	{"id": "bounce", "name": "彈跳椰果", "desc": "珍珠將在怪群中瘋狂彈跳", "type": "bounce", "value": 1},
	{"id": "pierce", "name": "穿透大珍珠", "desc": "珍珠將會貫穿整排敵人", "type": "pierce", "value": 1},
	{"id": "brown_sugar", "name": "黑糖黏人陷阱", "desc": "在移動路徑留下緩速黑糖漿", "type": "brown_sugar", "value": 1},
	{"id": "ice_cube", "name": "冰晶之盾", "desc": "外圈旋轉冰晶，可強烈凍結敵軍", "type": "ice_cube", "value": 1}
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
	# --- [修正標題亂碼] ---
	var title_label = find_child("Label", true, false)
	if title_label:
		title_label.text = "恭喜升級！選一個材料讓珍珠變強吧！"
	
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
	var btn = find_child(btn_name, true, false)
	
	if btn:
		var player = get_tree().get_first_node_in_group("player")
		var display_desc = skill_data["desc"]
		
		# 動態修正傷害描述
		if skill_data["id"] == "damage" and player:
			var current_bonus = player.get_attack_growth_base() * 2.0
			display_desc = "珍珠傷害 +" + str(current_bonus)
		
		# --- [NEW] 卡片式渲染邏輯 ---
		var icon_node = btn.find_child("IconDisplay", true, false)
		var name_node = btn.find_child("NameLabel", true, false)
		var desc_node = btn.find_child("DescLabel", true, false)
		var level_node = btn.find_child("LevelLabel", true, false)
		
		# 取得當前等級並計算目標等級
		var current_lv = player.skill_levels.get(skill_data["id"], 0)
		var target_lv = current_lv + 1
		
		# 1. 處理圖標
		if icon_node:
			var icon_path = "res://gfx/skills/" + skill_data["id"] + ".webp"
			# [修正]：打包後必須使用 ResourceLoader 才能偵測到 .pck 內的資源
			if ResourceLoader.exists(icon_path):
				icon_node.texture = load(icon_path)
			else:
				print("❌ 找不到圖標資源: ", icon_path)
		
		# 2. 處理等級標籤 (顯示即將達到的等級)
		if level_node:
			level_node.text = "Lv." + str(target_lv)
				
		# 3. 處理名稱
		if name_node:
			name_node.text = skill_data["name"]
			
		# 4. 處理描述 (針對傷害進行動態數值提示)
		if desc_node:
			var final_desc = display_desc
			if skill_data["id"] == "damage":
				# 套用新公式計算本次能加多少：4 + (target_lv - 1) * 2
				var next_bonus = 4.0 + (target_lv - 1) * 2.0
				final_desc = "珍珠傷害 +" + str(next_bonus)
			
			desc_node.text = final_desc
			
		print("成功設定智慧卡片：" + skill_data["name"] + " (目標 Lv." + str(target_lv) + ")")
	else:
		print("重大錯誤：在 LevelUpUI 內部完全找不到 " + btn_name)

# 按鈕訊號連接 (請確保訊號有連到這裡)
func _on_skill_button_1_pressed(): apply_skill(current_options[0])
func _on_skill_button_2_pressed(): apply_skill(current_options[1])
func _on_skill_button_3_pressed(): apply_skill(current_options[2])

func apply_skill(skill_data: Dictionary) -> void:
	var player = get_tree().get_first_node_in_group("player")
	
	if player:
		# [NEW] 紀錄技能等級
		player.increment_skill_level(skill_data["id"])
		
		# --- [暴力注入邏輯] ---
		# 使用 ID 直接判定，最笨但最穩
		if skill_data["id"] == "damage":
			player.add_damage(2.0)
		elif skill_data["id"] == "speed":
			player.add_speed(50.0)
		elif skill_data["id"] == "fire_rate":
			player.add_fire_rate(0.15)
		elif skill_data["id"] == "bullet_count":
			player.add_bullet_count(1)
		elif skill_data["id"] == "orbit":
			player.add_orbit_pearl()
		elif skill_data["id"] == "brown_sugar":
			player.add_brown_sugar()
		elif skill_data["id"] == "ice_cube":
			player.add_ice_cube()
		elif skill_data.has("type"):
			# 備用方案
			match skill_data["type"]:
				"bounce": player.add_bounce(1)
				"pierce": player.add_pierce(1)
		
		print("✅ [Debug] 已套用技能: ", skill_data["name"])
	else:
		print("❌ [Debug] 找不到 Player 節點！")
	
	get_tree().paused = false
	self.visible = false
	if get_parent() is CanvasLayer:
		get_parent().visible = false
		
	# --- [NEW] 恢復遊戲後的輸入大清掃 ---
	# 1. 重置所有虛擬搖桿
	var joysticks = get_tree().get_nodes_in_group("joystick")
	for js in joysticks:
		if js.has_method("force_reset_state"):
			js.force_reset_state()
	
	# 2. 強制釋放所有方向鍵 Action，防止 ghosting
	Input.action_release("ui_up")
	Input.action_release("ui_down")
	Input.action_release("ui_left")
	Input.action_release("ui_right")
	
	print("✅ [Debug] 遊戲恢復，輸入狀態已強制清空")
