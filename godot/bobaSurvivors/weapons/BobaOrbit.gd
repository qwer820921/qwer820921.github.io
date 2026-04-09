extends Area2D

@export var rotation_speed: float = 2.0
@export var radius: float = 180.0 # 調遠一點
@export var damage: float = 7.0   # 增強傷害

var angle: float = 0.0
var center_node: Node2D = null

func _ready() -> void:
	# 自動連接碰撞
	area_entered.connect(_on_area_entered)

func _process(delta: float) -> void:
	if center_node == null:
		center_node = get_parent() 
		
	if center_node:
		angle += rotation_speed * delta
		var offset = Vector2(cos(angle), sin(angle)) * radius
		position = offset

func _on_area_entered(area: Area2D) -> void:
	# 使用群組判斷更穩定
	if area.is_in_group("enemy"):
		if area.has_method("take_damage"):
			area.take_damage(damage)
			# print("[Orbit] Hit enemy!") # 若需偵錯可開啟
