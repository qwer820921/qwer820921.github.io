extends Area2D

@export var rotation_speed: float = 2.0
@export var radius: float = 180.0 # 調遠一點
@export var damage: float = 7.0   # 增強傷害

var angle_offset: float = 0.0 # [NEW] 由 Player 分配的角度偏移
var center_node: Node2D = null

func _ready() -> void:
	# 旋轉珍珠放大 2 倍
	scale = Vector2(2.0, 2.0)
	# 加入群組方便數量統計與重分配
	add_to_group("orbit_pearls")
	# 自動連接碰撞
	area_entered.connect(_on_area_entered)

var hit_cooldowns: Dictionary = {} # 紀錄怪獸的受傷冷卻 {enemy_id: timestamp}

func _physics_process(delta: float) -> void:
	# ... (保留原本的旋轉邏輯) ...
	if center_node == null: center_node = get_parent() 
	if center_node and "orbit_rotation" in center_node:
		var current_angle = center_node.orbit_rotation + angle_offset
		var offset = Vector2(cos(current_angle), sin(current_angle)) * radius
		position = offset
	
	# --- [NEW] 清理過期的受傷冷卻 ---
	var now = Time.get_ticks_msec()
	for enemy_id in hit_cooldowns.keys():
		if now - hit_cooldowns[enemy_id] > 300: # 0.3 秒可再次受傷
			hit_cooldowns.erase(enemy_id)

func _on_area_entered(area: Area2D) -> void:
	if area.is_in_group("enemy"):
		var enemy_id = area.get_instance_id()
		if hit_cooldowns.has(enemy_id): return # 還在冷卻中
		
		var player = get_parent()
		var final_damage = damage # 基礎保底
		if player and "attack_damage" in player:
			# [核心同步] 珍珠傷害 = 玩家當前攻擊力 (100%)
			final_damage = player.attack_damage
			
		if area.has_method("take_damage"):
			area.take_damage(final_damage)
			hit_cooldowns[enemy_id] = Time.get_ticks_msec()
