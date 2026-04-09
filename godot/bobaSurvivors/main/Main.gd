extends Node2D

# --- [大珍珠更新：生產系統與階段管理] ---

@export var enemy_scene: PackedScene
@export var spawn_interval: float = 1.0

var spawn_timer: float = 0.0
var game_time: float = 0.0
var difficulty_multiplier: float = 1.0

# 素材與階段對照表
# 格式: { StageIndex: { Type: Path } }
var monster_registry = {
	1: {
		"pudding": "res://gfx/slime_green.webp",
		"taro": "res://gfx/mushroom.webp",
		"matcha": "res://gfx/caterpillar_green.webp"
	},
	2: {
		"pudding": "res://gfx/slime_king.webp",
		"taro": "res://gfx/slime_metal.webp",
		"matcha": "res://gfx/slime_gold.webp"
	},
	3: {
		"pudding": "res://gfx/rat_treasure.webp",
		"taro": "res://gfx/rabbit_horn.webp",
		"matcha": "res://gfx/rabbit_golden.webp"
	},
	4: {
		"pudding": "res://gfx/wind_monster.webp",
		"taro": "res://gfx/whirlpool.webp",
		"matcha": "res://gfx/wind_runner.webp"
	},
	5: {
		"pudding": "res://gfx/tsunami_spirit.webp",
		"taro": "res://gfx/tiger_white.webp",
		"matcha": "res://gfx/tiger_flame.webp"
	},
	6: {
		"pudding": "res://gfx/snake_white.webp",
		"taro": "res://gfx/snake_brown.webp",
		"matcha": "res://gfx/snake.webp"
	},
	7: {
		"pudding": "res://gfx/pill_spirit.webp",
		"taro": "res://gfx/pebble_spirit.webp",
		"matcha": "res://gfx/phoenix_chick.webp"
	},
	8: {
		"pudding": "res://gfx/hell_hound.webp",
		"taro": "res://gfx/headless_knight.webp",
		"matcha": "res://gfx/hell_cerberus.webp"
	},
	9: {
		"pudding": "res://gfx/frost_wolf.webp",
		"taro": "res://gfx/fox_three_tail.webp",
		"matcha": "res://gfx/fox_spirit.webp"
	},
	10: {
		"pudding": "res://gfx/crane_blue.webp",
		"taro": "res://gfx/crane_rainbow.webp",
		"matcha": "res://gfx/crane_immortal.webp"
	}
}

# [NEW] 十大首領圖鑑
var boss_registry = {
	1: "res://gfx/hell_coin.webp",
	2: "res://gfx/bone_general.webp",
	3: "res://gfx/death_lich.webp",
	4: "res://gfx/gate_guardian.webp",
	5: "res://gfx/kong.webp",
	6: "res://gfx/magma_lord.webp",
	7: "res://gfx/oni_king.webp",
	8: "res://gfx/oni_emperor.webp",
	9: "res://gfx/frost_monarch.webp",
	10: "res://gfx/glitch_pixel.webp"
}

var last_boss_minute: int = -1 # 紀錄上一次在哪一分鐘生過 Boss

func _ready() -> void:
	# 初始生成計時
	spawn_timer = spawn_interval
	add_to_group("main")

func _process(delta: float) -> void:
	game_time += delta
	
	# --- [階段與難度計算] ---
	var total_stage = int(game_time / 60.0) + 1
	var visual_stage: int
	
	if total_stage <= 20:
		visual_stage = ((total_stage - 1) % 10) + 1
	else:
		visual_stage = (randi() % 10) + 1
	
	difficulty_multiplier = pow(total_stage, 2.3)
	
	# --- [首領生成邏輯] ---
	# 在每分鐘的第 50 秒出現一次 Boss
	var current_minute = int(game_time / 60.0)
	var seconds = int(game_time) % 60
	
	if seconds == 50 and last_boss_minute < current_minute:
		spawn_boss(visual_stage)
		last_boss_minute = current_minute
	
	# 生成速率：隨時間變快
	var current_spawn_interval = max(0.15, spawn_interval * pow(0.85, total_stage - 1))
	var spawn_count = 1 + int(total_stage / 4.0)
	
	if enemy_scene == null: return
		
	spawn_timer -= delta
	if spawn_timer <= 0:
		spawn_timer = current_spawn_interval
		for i in range(spawn_count):
			spawn_enemy(visual_stage)

func spawn_enemy(v_stage: int) -> void:
	var player = get_tree().get_first_node_in_group("player")
	if player == null: return
		
	var enemy = enemy_scene.instantiate()
	
	# [FIX] 關鍵修正：必須在 add_child 之前注入屬性，否則 _ready 會抓不到難度
	enemy.difficulty_multiplier = difficulty_multiplier
	
	# --- 隨機決定怪獸類型與素材 ---
	var types = ["pudding", "taro", "matcha"]
	var chosen_type_name = types[randi() % types.size()]
	var texture_path = monster_registry[v_stage][chosen_type_name]
	
	var speed_m = 1.0
	var hp_m = 1.0
	var e_type = 0 # PUDDING
	
	match chosen_type_name:
		"pudding":
			e_type = 0 # PUDDING
			speed_m = 0.6
			hp_m = 2.5
		"taro":
			e_type = 1 # TARO
			speed_m = 1.6
			hp_m = 0.6
		"matcha":
			e_type = 2 # MATCHA
			speed_m = 1.0
			hp_m = 1.2
	
	# 初始化怪物
	if enemy.has_method("setup_variant"):
		enemy.setup_variant(e_type, texture_path, speed_m, hp_m)
	
	# 加入場景
	get_parent().add_child(enemy)
	
	# 隨機生成位置
	var random_angle = randf() * PI * 2
	var random_distance = randf_range(1200, 1500)
	var spawn_offset = Vector2(cos(random_angle), sin(random_angle)) * random_distance
	enemy.global_position = player.global_position + spawn_offset

func spawn_boss(v_stage: int) -> void:
	var player = get_tree().get_first_node_in_group("player")
	if player == null or enemy_scene == null: return
		
	var enemy = enemy_scene.instantiate()
	
	# [FIX] 關鍵修正：屬性注入必須在 add_child 之前
	enemy.is_boss = true
	enemy.difficulty_multiplier = difficulty_multiplier
	
	var texture_path = boss_registry[v_stage]
	
	if enemy.has_method("setup_variant"):
		enemy.setup_variant(0, texture_path, 0.8, 1.0) 
	
	# 加入場景 (觸發 _ready)
	get_parent().add_child(enemy)
	
	# 隨機生成位置
	var random_angle = randf() * PI * 2
	var random_distance = 1500
	enemy.global_position = player.global_position + Vector2(cos(random_angle), sin(random_angle)) * random_distance
	
	print("🚨 BOSS 降臨：", texture_path, " (難度係數: ", difficulty_multiplier, ")")
