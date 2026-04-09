extends Area2D

# --- [磁吸式經驗珍珠] ---

@export var xp_amount: int = 1
@export var attract_distance: float = 200.0 # 磁吸半徑
@export var move_speed: float = 400.0       # 飛向玩家的速度

var target_player: Node2D = null
var is_attracted: bool = false

func _ready() -> void:
	body_entered.connect(_on_body_entered)
	
	# [NEW] 珍珠自發光特效 (即使在暗處也清晰)
	modulate = Color(1.2, 1.2, 1.2) # 輕微過曝發光
	
	# 如果是高價值珍珠 (Boss 掉落)，強化視覺表現
	if xp_amount >= 10:
		modulate = Color(2.5, 2.0, 0.5) # 超亮金黃色
		scale = Vector2(2.5, 2.5)
		attract_distance = 600.0 # 超強大磁吸範圍
		move_speed = 600.0

func _process(delta: float) -> void:
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
		move_speed += 20.0 # 高速吸取

func _on_body_entered(body: Node2D) -> void:
	if body.has_method("gain_xp"):
		body.gain_xp(xp_amount)
		queue_free()
