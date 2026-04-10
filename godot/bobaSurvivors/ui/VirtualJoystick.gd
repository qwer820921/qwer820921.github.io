extends Control

# --- [BobaSurvivors：極致精準 & 動態滑動搖桿] ---

@export var max_distance: float = 120.0
@export var deadzone: float = 5.0 # 極精細死區

var joystick_vector: Vector2 = Vector2.ZERO

var is_dragging: bool = false
var touch_index: int = -1 
var rest_local_pos: Vector2 # 紀錄初始本地位置

@onready var base = $Base
@onready var knob = $Knob

func _ready() -> void:
	add_to_group("joystick")
	modulate.a = 0.5
	
	# 紀錄初始的本地中心點 (用於閒置歸位)
	rest_local_pos = base.position
	
	mouse_filter = Control.MOUSE_FILTER_STOP

func _gui_input(event: InputEvent) -> void:
	# [絕對精準邏輯]：直接使用 event.position，這是相對於本 Control 的空間
	# 這樣可以完全無視螢幕縮放、DPI 或是 Canvas 位移造成的 Global 座標偏差。
	
	var is_touch = event is InputEventScreenTouch or event is InputEventScreenDrag
	var is_mouse = event is InputEventMouseButton or event is InputEventMouseMotion
	
	if not is_touch and not is_mouse: return

	# 1. 處理按下
	if (event is InputEventScreenTouch and event.pressed) or (event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT):
		if not is_dragging:
			is_dragging = true
			if event is InputEventScreenTouch:
				touch_index = event.index
			
			# 底座瞬間移動到本地點擊點
			base.position = event.position
			knob.position = Vector2.ZERO
			modulate.a = 1.0
			update_joystick_logic(event.position)
				
	# 2. 處理放開
	elif (event is InputEventScreenTouch and not event.pressed and event.index == touch_index) or (event is InputEventMouseButton and not event.pressed and event.button_index == MOUSE_BUTTON_LEFT):
		is_dragging = false
		touch_index = -1
		modulate.a = 0.5
		reset_joystick()
			
	# 3. 處理滑動
	elif event is InputEventScreenDrag or (event is InputEventMouseMotion and is_dragging):
		if event is InputEventScreenDrag and event.index != touch_index:
			return
		update_joystick_logic(event.position)

func update_joystick_logic(local_touch_pos: Vector2) -> void:
	# 計算本地偏移向量
	var diff = local_touch_pos - base.position
	
	# [動態滑動邏輯 (Dynamic Sliding)]：
	# 如果手指拉動超過最大半徑，我們移動底座來跟隨手指。
	# 這能確保轉向回饋始終是 100% 精準且貼手的。
	if diff.length() > max_distance:
		var sliding_dist = diff.length() - max_distance
		# 讓中心底座往手指方向滑動，保持最大半徑
		base.position += diff.normalized() * sliding_dist
		# 重新計算 diff 確保它剛好在邊界上
		diff = diff.normalized() * max_distance
		
	# 處理死區
	if diff.length() < deadzone:
		joystick_vector = Vector2.ZERO
		knob.position = Vector2.ZERO
		return
		
	# 更新視覺
	knob.position = diff
	
	# 輸出精確方向
	joystick_vector = diff / max_distance

func reset_joystick() -> void:
	joystick_vector = Vector2.ZERO
	var tween = create_tween()
	tween.set_parallel(true)
	# 平滑回到預設休息點 (本地)
	tween.tween_property(base, "position", rest_local_pos, 0.15).set_trans(Tween.TRANS_SINE)
	tween.tween_property(knob, "position", Vector2.ZERO, 0.15).set_trans(Tween.TRANS_SINE)

func get_velocity() -> Vector2:
	return joystick_vector
