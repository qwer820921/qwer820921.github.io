extends Node2D

@export var enemy_scene: PackedScene
@export var spawn_interval: float = 1.0

var spawn_timer: float = 0.0
var game_time: float = 0.0
var difficulty_multiplier: float = 1.0

func _process(delta: float) -> void:
	game_time += delta
	
	# --- [動態難度系統] ---
	# 1. 怪物血量：每 30 秒增加 10%
	difficulty_multiplier = 1.0 + (int(game_time / 30.0) * 0.1)
	
	# 2. 生成間隔：每過 1 分鐘變快 20%，最快 0.2 秒一隻
	var current_spawn_interval = max(0.2, spawn_interval * pow(0.8, int(game_time / 60.0)))
	
	# 3. 生成數量：每 2 分鐘，一次生成的怪物數量 +1
	var spawn_count = 1 + int(game_time / 120.0)
	
	if enemy_scene == null:
		return
		
	spawn_timer -= delta
	if spawn_timer <= 0:
		spawn_timer = current_spawn_interval
		# 根據當前難度，一次生成多隻怪物
		for i in range(spawn_count):
			spawn_enemy()

func spawn_enemy() -> void:
	# 先找玩家目前在哪裡
	var player = get_node_or_null("Player")
	if player == null:
		return
		
	# 創造一隻怪物
	var enemy = enemy_scene.instantiate()
	add_child(enemy)
	
	# 將難度倍數傳給怪物 (如果怪物有這個變數)
	if "difficulty_multiplier" in enemy:
		enemy.difficulty_multiplier = difficulty_multiplier
	
	# 隨機在玩家周圍 600~800 像素的圓圈上生成（在螢幕外面）
	var random_angle = randf() * PI * 2
	var random_distance = randf_range(600, 800)
	var spawn_offset = Vector2(cos(random_angle), sin(random_angle)) * random_distance
	
	enemy.global_position = player.global_position + spawn_offset
