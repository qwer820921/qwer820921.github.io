extends Area2D

@export var speed: float = 400.0
@export var damage: float = 5.0
@export var max_lifetime: float = 3.0 # 子彈最多存活3秒

var pierce_count: int = 0  # 剩餘穿透次數
var bounce_count: int = 0  # 剩餘彈跳次數

var direction: Vector2 = Vector2.ZERO
var lifetime: float = 0.0

func _ready() -> void:
	# 珍珠子彈放大 2 倍
	scale = Vector2(2.0, 2.0)
	# 用程式碼自動連接碰撞訊號，省去手動拉線的麻煩
	area_entered.connect(_on_area_entered)

func _process(delta: float) -> void:
	# 依照方向往前飛
	global_position += direction * speed * delta
	
	# 生命週期計算，超過就自動銷毀
	lifetime += delta
	if lifetime >= max_lifetime:
		queue_free()

# 當子彈碰觸到其他 Area2D (例如敵人) 時觸發
func _on_area_entered(area: Area2D) -> void:
	# 防呆檢查：不管有沒有標籤，只要名字有 Enemy 就打
	if area.is_in_group("enemy") or "Enemy" in area.name:
		if area.has_method("take_damage"):
			area.take_damage(damage)
			
			# --- 處理彈跳與穿透 ---
			if bounce_count > 0:
				bounce_count -= 1
				find_next_target(area) # 找下一個彈跳目標
				return # 彈跳時不銷毀
				
			if pierce_count > 0:
				pierce_count -= 1
				# 穿透時繼續直走，不銷毀
				return
				
			# 如果沒有彈跳也沒有穿透，就銷毀
			queue_free()

func find_next_target(current_enemy: Area2D) -> void:
	var enemies = []
	var parent = get_parent()
	if parent == null: return
	
	for child in parent.get_children():
		if "Enemy" in child.name and child != current_enemy:
			# 限制彈跳距離，不要跳太遠
			if global_position.distance_to(child.global_position) < 300:
				enemies.append(child)
				
	if enemies.size() > 0:
		# 隨機挑一個敵人彈跳 (或者挑最近的)
		var next_enemy = enemies[randi() % enemies.size()]
		direction = global_position.direction_to(next_enemy.global_position)
	else:
		# 找不到下一個就直接消失
		queue_free()
