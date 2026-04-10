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
	
func _process(delta: float) -> void:
	# [NEW] 每幀確認：一旦發現自己是 Boss 珍珠 (或是經驗值大於 10)
	if xp_amount >= 10 and scale.x < 3.0:
		apply_boss_visuals()

	# 如果還沒被吸，就持續找玩家
	if not is_attracted:
		var player = get_tree().get_first_node_in_group("player")
		if player:
			var dist = global_position.distance_to(player.global_position)
			if dist < attract_distance:
				is_attracted = true
				target_player = player
	
	# 如果正在被吸，就飛向玩家
	if is_attracted and is_instance_valid(target_player):
		var direction = global_position.direction_to(target_player.global_position)
		global_position += direction * move_speed * delta
		move_speed += 30.0 # 吸取加速度提高

func apply_boss_visuals():
	z_index = 200
	scale = Vector2(4.0, 4.0) # 變超大，不信看不見
	modulate = Color(5.0, 4.0, 1.0) # 極致發光
	attract_distance = 6000.0 # 全地圖
	move_speed = 1500.0 # 衝刺速度
	
	# 加入閃爍動畫
	var tween = create_tween().set_loops()
	tween.tween_property(self, "modulate", Color(10, 10, 1), 0.1)
	tween.tween_property(self, "modulate", Color(5, 4, 1), 0.1)

func _on_body_entered(body: Node2D) -> void:
	if body.has_method("gain_xp"):
		body.gain_xp(xp_amount)
		queue_free()
