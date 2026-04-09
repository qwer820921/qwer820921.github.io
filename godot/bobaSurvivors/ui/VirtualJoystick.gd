extends Control

# --- [BobaSurvivors 動態搖桿系統] ---

@export var max_distance: float = 120.0
@export var deadzone: float = 10.0
@export var lerp_speed: float = 15.0

var joystick_vector: Vector2 = Vector2.ZERO
var input_vector: Vector2 = Vector2.ZERO # 原始輸入向量

var is_dragging: bool = false
var touch_index: int = -1 
var rest_position: Vector2 # 預設休息位置

@onready var base = $Base
@onready var knob = $Knob

func _ready() -> void:
	add_to_group("joystick")
	# 搖桿平時設為半透明，觸摸時變亮
	modulate.a = 0.5
	
	# 初始化：我們將 Control 設為螢幕左側一大區塊
	# 這樣玩家點擊左邊任何地方都能觸發
	rest_position = base.position
	
	# 確保處理輸入
	mouse_filter = Control.MOUSE_FILTER_STOP

func _process(delta: float) -> void:
	# 這裡實作向量平滑化，讓手感不生硬
	joystick_vector = joystick_vector.lerp(input_vector, delta * lerp_speed)
	
	if not is_dragging and joystick_vector.length() < 0.05:
		joystick_vector = Vector2.ZERO

func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch or (event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT):
		var is_pressed = event.pressed
		var pos = event.position
		
		if is_pressed:
			if not is_dragging:
				is_dragging = true
				if event is InputEventScreenTouch:
					touch_index = event.index
				
				# [Dynamic Centering] 當點擊時，底座移動到指尖位置
				base.position = pos
				knob.position = Vector2.ZERO
				modulate.a = 1.0 # 觸摸時變亮
				update_input(pos)
		elif not is_pressed:
			if (event is InputEventScreenTouch and event.index == touch_index) or event is InputEventMouseButton:
				is_dragging = false
				touch_index = -1
				modulate.a = 0.5 # 放開時變淡
				reset_joystick()
				
	elif event is InputEventScreenDrag or event is InputEventMouseMotion:
		if is_dragging:
			if event is InputEventScreenDrag and event.index != touch_index:
				return
			update_input(event.position)

func update_input(touch_pos: Vector2) -> void:
	# 計算相對於底座中心點的向量
	var offset = touch_pos - base.position
	
	# 死區 (Deadzone) 判定
	if offset.length() < deadzone:
		input_vector = Vector2.ZERO
		knob.position = Vector2.ZERO
		return
		
	# 限制長度
	if offset.length() > max_distance:
		offset = offset.normalized() * max_distance
		
	knob.position = offset
	
	# 輸出歸一化向量 (-1.0 ~ 1.0)
	input_vector = offset / max_distance

func reset_joystick() -> void:
	input_vector = Vector2.ZERO
	# 回到原本的底座位置 (或者您可以選擇讓它留在原地)
	var tween = create_tween()
	tween.set_parallel(true)
	tween.tween_property(base, "position", rest_position, 0.2).set_trans(Tween.TRANS_SINE)
	tween.tween_property(knob, "position", Vector2.ZERO, 0.2).set_trans(Tween.TRANS_SINE)

# 給 Player 讀取的最終向量
func get_velocity() -> Vector2:
	return joystick_vector
