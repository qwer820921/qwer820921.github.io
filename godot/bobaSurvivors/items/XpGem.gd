extends Area2D

# --- [磁吸式經驗珍珠] ---

@export var xp_amount: int = 1
@export var attract_distance: float = 200.0 # 磁吸半徑
@export var move_speed: float = 400.0       # 飛向玩家的速度

var target_player: Node2D = null
var is_attracted: bool = false

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	# 基礎發光
	modulate = Color(1.2, 1.2, 1.2)
	
	# [優化] 初始即確認是否為大珠珍珠，避免每幀檢查
	if xp_amount >= 10:
		apply_boss_visuals()

func _physics_process(delta: float) -> void:
	# 如果正在被吸，就飛向玩家 (僅在啟動磁吸時啟動物理運算)
	if is_attracted:
		if is_instance_valid(target_player):
			var direction = global_position.direction_to(target_player.global_position)
			global_position += direction * move_speed * delta
			move_speed += 40.0 # 加速度
		else:
			is_attracted = false # 目標消失(切換場景等)時停止

func start_attraction(player: Node2D):
	if is_attracted: return
	is_attracted = true
	target_player = player
	# 稍微調高基礎速度，感官更流暢
	move_speed = max(move_speed, 500.0) 

func apply_boss_visuals():
	z_index = 200
	scale = Vector2(4.0, 4.0) # 變超大
	modulate = Color(5.0, 4.0, 1.0) # 極致發光
	
	# 加入閃爍動畫
	var tween = create_tween().set_loops()
	tween.tween_property(self, "modulate", Color(10, 10, 1), 0.1)
	tween.tween_property(self, "modulate", Color(5, 4, 1), 0.1)
	
	# [BOSS珍珠特權]：一旦生成，自動尋找全地圖玩家進行吸附
	call_deferred("_auto_attract_boss_gem")

func _auto_attract_boss_gem():
	var player = get_tree().get_first_node_in_group("player")
	if player:
		start_attraction(player)

func _on_body_entered(body: Node2D) -> void:
	if body.has_method("gain_xp"):
		body.gain_xp(xp_amount)
		queue_free()
