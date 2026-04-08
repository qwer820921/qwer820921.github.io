extends CanvasLayer

func _ready() -> void:
	# 確保這個 UI 在暫停時也能運作
	process_mode = Node.PROCESS_MODE_ALWAYS
	
	# 如果有按鈕，連接它們
	var restart_btn = find_child("RestartButton", true, false)
	if restart_btn:
		restart_btn.pressed.connect(_on_restart_pressed)
		
	var home_btn = find_child("HomeButton", true, false)
	if home_btn:
		home_btn.pressed.connect(_on_home_pressed)

func _on_restart_pressed() -> void:
	print("🔄 重新開始遊戲！")
	get_tree().paused = false
	get_tree().reload_current_scene()

func _on_home_pressed() -> void:
	print("🏠 回到主選單！")
	get_tree().paused = false
	# 這裡可以根據您的主選單路徑修改
	# get_tree().change_scene_to_file("res://main_menu.tscn")
	get_tree().reload_current_scene() # 暫時先用重開代替
