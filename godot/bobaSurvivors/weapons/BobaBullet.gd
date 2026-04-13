extends Area2D

@export var speed: float = 400.0
@export var damage: float = 5.0
@export var max_lifetime: float = 3.0 

var pierce_count: int = 0
var bounce_count: int = 0

var direction: Vector2 = Vector2.ZERO
var lifetime: float = 0.0

@onready var sprite = $Sprite2D
var trail: Line2D

func _ready() -> void:
	# 珍珠子彈放大
	scale = Vector2(2.0, 2.0)
	area_entered.connect(_on_area_entered)
	
	# --- [NEW] 初始化黑糖拖尾 ---
	trail = Line2D.new()
	trail.width = 15.0 # 適中的寬度
	trail.default_color = Color(0.3, 0.15, 0.0, 0.4) # 深棕色半透明 (黑糖感)
	trail.begin_cap_mode = Line2D.LINE_CAP_ROUND
	trail.end_cap_mode = Line2D.LINE_CAP_ROUND
	# 設定為 Top Level，這樣拖尾座標才不會隨子彈位移
	trail.top_level = true
	add_child(trail)

func _process(delta: float) -> void:
	# 依照方向往前飛
	global_position += direction * speed * delta
	
	# 更新拖尾
	if trail:
		trail.add_point(global_position)
		if trail.get_point_count() > 8: # 保持 8 個點的長度
			trail.remove_point(0)
	
	# 生命週期
	lifetime += delta
	if lifetime >= max_lifetime:
		cleanup_and_free()

# 確保銷毀時拖尾不會突然消失 (優雅淡出)
func cleanup_and_free():
	if trail:
		var tween = create_tween()
		tween.tween_property(trail, "modulate:a", 0.0, 0.2)
		tween.finished.connect(func(): trail.queue_free())
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
	# [重大修復]：不再依賴父節點，改用全場群組搜尋，確保 100% 抓到敵人
	var all_enemies = get_tree().get_nodes_in_group("enemy")
	var target_candidates = []
	
	for enemy in all_enemies:
		if is_instance_valid(enemy) and enemy != current_enemy:
			var dist = global_position.distance_to(enemy.global_position)
			# [範圍擴大]：放寬至 800 像素，適配超廣角視野
			if dist < 800:
				target_candidates.append({"node": enemy, "dist": dist})
				
	if target_candidates.size() > 0:
		# 選取最近的敵人
		target_candidates.sort_custom(func(a, b): return a["dist"] < b["dist"])
		var next_target = target_candidates[0]["node"]
		
		# 獲取新方向
		direction = global_position.direction_to(next_target.global_position)
		print("🎯 [珍珠彈跳]：找到下一個目標 " + next_target.name + "，距離：" + str(target_candidates[0]["dist"]))
	else:
		print("❌ [珍珠彈跳]：範圍內找不到適合的下一個敵人，消失")
		cleanup_and_free()
