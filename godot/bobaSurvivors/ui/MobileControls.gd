extends CanvasLayer

func _ready():
	# 延遲一點點執行，確保節點都已經加載完畢
	call_deferred("_setup_controls")

func _setup_controls():
	if has_node("Control"):
		$Control.modulate.a = 0.5
		# 為所有直屬按鈕開啟「滑入觸發」，這對八向操控極其重要
		for child in $Control.get_children():
			if child is TouchScreenButton:
				child.passby_press = true
	print("--- 手機控制台：八向優化已就緒 (支援滑入觸發) ---")

# --- [斜向訊號連動] ---
# 當點擊斜角按鈕時，同時觸發兩個方向的 Action

func _on_top_left_pressed():
	Input.action_press("ui_up")
	Input.action_press("ui_left")

func _on_top_left_released():
	Input.action_release("ui_up")
	Input.action_release("ui_left")

func _on_top_right_pressed():
	Input.action_press("ui_up")
	Input.action_press("ui_right")

func _on_top_right_released():
	Input.action_release("ui_up")
	Input.action_release("ui_right")

func _on_bottom_left_pressed():
	Input.action_press("ui_down")
	Input.action_press("ui_left")

func _on_bottom_left_released():
	Input.action_release("ui_down")
	Input.action_release("ui_left")

func _on_bottom_right_pressed():
	Input.action_press("ui_down")
	Input.action_press("ui_right")

func _on_bottom_right_released():
	Input.action_release("ui_down")
	Input.action_release("ui_right")
