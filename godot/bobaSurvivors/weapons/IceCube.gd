extends Area2D

# --- [BobaSurvivors：冰晶核心子彈] ---

@export var speed: float = 600.0  # 比珍珠快一些
@export var ice_zone_scene: PackedScene # 爆裂後的區域場景

var direction: Vector2 = Vector2.ZERO
var lifetime: float = 0.0

func _ready() -> void:
	# 核心本體縮小為 1/3 (0.33 倍)，呈現精悍的彈頭感
	scale = Vector2(0.33, 0.33)
	area_entered.connect(_on_area_entered)

func _process(delta: float) -> void:
	# 直線飛行
	global_position += direction * speed * delta
	
	# 自爆保護：如果飛太遠沒撞到東西，3 秒後消失
	lifetime += delta
	if lifetime > 3.0:
		queue_free()

func _on_area_entered(area: Area2D) -> void:
	if area.is_in_group("enemy"):
		explode()

func explode():
	if ice_zone_scene:
		var zone = ice_zone_scene.instantiate()
		get_parent().add_child(zone) # 加到 Main場景
		zone.global_position = global_position
	
	queue_free()
