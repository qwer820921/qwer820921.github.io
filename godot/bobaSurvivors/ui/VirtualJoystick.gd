extends Control

# --- [虛擬搖桿腳本] ---
# 結構建議：
# VirtualJoystick (Control)
#   -> Base (Sprite2D)
#   -> Knob (Sprite2D)

@export var max_distance: float = 100.0 # 搖桿可以拉多遠
var joystick_vector: Vector2 = Vector2.ZERO # 最終輸出的方向 (0,0) ~ (1,1)
var is_dragging: bool = false

@onready var base = $Base
@onready var knob = $Knob

func _ready() -> void:
	# 建立群組，讓玩家腳本能找到這個搖桿
	add_to_group("joystick")
	
	# 重要：攔截所有滑鼠/觸控事件，避免傳給下層
	mouse_filter = Control.MOUSE_FILTER_STOP
	
	# 確保搖桿即使在暫停時也能工作
	process_mode = Node.PROCESS_MODE_INHERIT
	print("--- 霓虹珍珠搖桿已就位，等待滑動！ ---")
	
	# 初始化位置
	if knob: knob.position = Vector2.ZERO

func _gui_input(event: InputEvent) -> void:
	# 處理點擊與觸碰開始
	if event is InputEventMouseButton or event is InputEventScreenTouch:
		if event.pressed:
			is_dragging = true
			update_joystick(event.global_position)
		else:
			is_dragging = false
			reset_joystick()
			
	# 處理拖移 (滑鼠與手勢)
	if event is InputEventMouseMotion or event is InputEventScreenDrag:
		if is_dragging:
			update_joystick(event.global_position)

func update_joystick(global_touch_pos: Vector2) -> void:
	# 改用「全域座標」計算，避免被 iframe 縮放或 Control 座標搞混
	var center = global_position + (size / 2)
	var offset = global_touch_pos - center
	
	# 限制長度
	if offset.length() > max_distance:
		offset = offset.normalized() * max_distance
		
	# 更新搖桿頭位置 (Knob 是 Sprite2D，其 position 是相對於父節點 Control 的中心)
	if knob:
		knob.position = offset
		
	# 計算方向向量
	joystick_vector = offset / max_distance

func reset_joystick() -> void:
	joystick_vector = Vector2.ZERO
	if knob:
		# 這裡可以加一點 Tween 動畫讓它彈回去更好看
		var tween = create_tween()
		tween.tween_property(knob, "position", Vector2.ZERO, 0.1).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)

# 讓 Player 讀取方向
func get_velocity() -> Vector2:
	return joystick_vector
