extends Area2D

@export var rotation_speed: float = 2.0
@export var radius: float = 100.0
@export var damage: float = 3.0

var angle: float = 0.0
var center_node: Node2D = null

func _ready() -> void:
	# 自動連接碰撞
	area_entered.connect(_on_area_entered)
	# 旋轉珠環不需要 Process Mode Always，因為它是遊戲的一部分

func _process(delta: float) -> void:
	if center_node == null:
		# 嘗試找玩家
		center_node = get_parent() # 改為當作 Player 的子節點
		
	if center_node:
		angle += rotation_speed * delta
		var offset = Vector2(cos(angle), sin(angle)) * radius
		position = offset

func _on_area_entered(area: Area2D) -> void:
	if "Enemy" in area.name:
		if area.has_method("take_damage"):
			area.take_damage(damage)
			# 旋轉環打到敵人在原地不會消失，可以穿透傷害
