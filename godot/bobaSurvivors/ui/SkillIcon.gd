extends Control

func set_skill(skill_id: String, level: int):
	var icon_rect = get_node_or_null("Icon")
	var level_label = get_node_or_null("LevelLabel")
	
	if icon_rect:
		var tex_path = "res://gfx/skills/" + skill_id + ".webp"
		# 如果找不到圖標，至少給個預設值以免報錯
		# [修正]：打包後必須使用 ResourceLoader 才能偵測到虛擬路徑中的資源
		if ResourceLoader.exists(tex_path):
			icon_rect.texture = load(tex_path)
		else:
			print("❌ [警告]：找不到技能圖標：", tex_path)
			
	if level_label:
		level_label.text = "Lv." + str(level)
