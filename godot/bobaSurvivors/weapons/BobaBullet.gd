extends Area2D

@export var speed: float = 400.0
@export var damage: float = 5.0
@export var max_lifetime: float = 3.0 

var pierce_count: int = 0
var bounce_count: int = 0

var direction: Vector2 = Vector2.ZERO
var lifetime: float = 0.0

@onready var sprite = $Sprite2D

func _ready() -> void:
	# 珍珠子彈放大
	scale = Vector2(2.0, 2.0)
	area_entered.connect(_on_area_entered)

func _process(delta: float) -> void:
	# 依照方向往前飛
	global_position += direction * speed * delta
	
	# 生命週期
	lifetime += delta
	if lifetime >= max_lifetime:
		cleanup_and_free()

# 確保銷毀時的清理
func cleanup_and_free():
	queue_free()

func _on_area_entered(area: Area2D) -> void:
	if area.is_in_group("enemy") or "Enemy" in area.name:
		if area.has_method("take_damage"):
			area.take_damage(damage)
			
			# 擊中瞬間微閃
			var tween = create_tween()
			tween.tween_property(sprite, "scale", Vector2(0.045, 0.045), 0.05)
			tween.tween_property(sprite, "scale", Vector2(0.032, 0.03), 0.1)
			
			# --- 處理彈跳 ---
			if bounce_count > 0:
				bounce_count -= 1
				find_next_target(area)
				return
				
			if pierce_count > 0:
				pierce_count -= 1
				return
				
			cleanup_and_free()

func find_next_target(current_enemy: Area2D) -> void:
	# [效能優化]：不再搜索全場群組與排序，改用物理偵測區域
	var ricochet_area = find_child("RicochetArea")
	if ricochet_area == null:
		cleanup_and_free()
		return
		
	var targets = ricochet_area.get_overlapping_areas()
	
	# 尋找與目前不同的有效敵人
	var next_target = null
	for target in targets:
		if is_instance_valid(target) and target != current_enemy:
			next_target = target
			break # 找到第一個就走，追求極致性能
			
	if next_target:
		# 獲取新方向
		direction = global_position.direction_to(next_target.global_position)
		# print("🎯 [珍珠彈跳]：找到下一個目標 " + next_target.name)
	else:
		# print("❌ [珍珠彈跳]：範圍內找不到適合的下一個敵人，消失")
		cleanup_and_free()
