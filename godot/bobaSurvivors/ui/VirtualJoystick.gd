extends Control

# --- [BobaSurvivors：Image 2 極簡珍珠導航] ---

var joystick_vector: Vector2 = Vector2.ZERO
var is_dragging: bool = false
var touch_index: int = -1 

# 核心中心點 (動態計算)
func get_center() -> Vector2:
	return size / 2.0

func get_max_radius() -> float:
	return (size.x / 2.0) * 0.8 # 留一點邊際感

@onready var base = $Base
@onready var knob = $Knob

func _ready() -> void:
	add_to_group("joystick")
	# [Image 2 對齊]：保持半透明預覽
	modulate.a = 0.5
	
	# 初始化對齊
	_update_visuals_to_center()
	
	mouse_filter = Control.MOUSE_FILTER_STOP

func _update_visuals_to_center():
	base.position = get_center()
	knob.position = get_center()

func _process(_delta: float) -> void:
	# [動態同步]：隨人物尺寸調整整體大小
	var player = get_tree().get_first_node_in_group("player")
	if player:
		var target_scale = player.scale.x / 2.25
		scale = scale.lerp(Vector2(target_scale, target_scale), 0.1)
	
	# 由於 main 裡可能有 offset 變動，每幀確認一下位置對齊 (尤其是初始化後)
	if not is_dragging:
		_update_visuals_to_center()

func _notification(what: int) -> void:
	if what == NOTIFICATION_PAUSED or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		force_reset_state()

func _gui_input(event: InputEvent) -> void:
	var is_touch = event is InputEventScreenTouch or event is InputEventScreenDrag
	var is_mouse = event is InputEventMouseButton or event is InputEventMouseMotion
	
	if not is_touch and not is_mouse: return

	var center = get_center()

	# 1. 處理按下 (圓圈內感應)
	if (event is InputEventScreenTouch and event.pressed) or (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT):
		# 基於當前尺寸的圓圈內感應 (全尺寸偵測)
		if event.position.distance_to(center) > (size.x / 2.0):
			return
			
		if not is_dragging:
			is_dragging = true
			if event is InputEventScreenTouch:
				touch_index = event.index
			
			modulate.a = 1.0
			update_joystick_logic(event.position)
				
	# 2. 處理放開
	elif (event is InputEventScreenTouch and not event.pressed and event.index == touch_index) or (event is InputEventMouseButton and not event.pressed and event.button_index == MOUSE_BUTTON_LEFT):
		force_reset_state()
			
	# 3. 處理滑動
	elif event is InputEventScreenDrag or (event is InputEventMouseMotion and is_dragging):
		if event is InputEventScreenDrag and event.index != touch_index:
			return
		update_joystick_logic(event.position)

func update_joystick_logic(local_touch_pos: Vector2) -> void:
	var center = get_center()
	var diff = local_touch_pos - center
	var max_r = get_max_radius()
	
	# 限制珍珠不能跑出圓圈
	if diff.length() > max_r:
		diff = diff.normalized() * max_r
		
	# 更新視覺
	knob.position = center + diff
	
	# 輸出向量 (0.0 ~ 1.0)
	joystick_vector = diff / max_r

func force_reset_state() -> void:
	is_dragging = false
	touch_index = -1
	joystick_vector = Vector2.ZERO
	modulate.a = 0.5
	
	# 珍珠歸位動畫 (修正：使用 get_center())
	var tween = create_tween()
	tween.tween_property(knob, "position", get_center(), 0.15).set_trans(Tween.TRANS_SINE)

func get_velocity() -> Vector2:
	return joystick_vector
