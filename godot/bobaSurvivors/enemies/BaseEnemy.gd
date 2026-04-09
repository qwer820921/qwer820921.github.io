extends Area2D

# --- [珍珠怪獸：基礎與變體腳本] ---

# 變數宣告
@export var movement_speed: float = 100.0
@export var max_hp: float = 10.0
@export var damage: float = 1.0
@export var gem_scene: PackedScene 

# 動態屬性
var current_hp: float
var player_node: Node2D = null
var difficulty_multiplier: float = 1.0

# 類型定義
enum EnemyType { PUDDING, TARO, MATCHA }
var current_type = EnemyType.PUDDING
var is_split_version: bool = false # 標記是否為分裂後的小怪
var is_boss: bool = false # [NEW] 是否為首領怪

func _ready() -> void:
	# 基礎數值套用難度
	current_hp = max_hp * difficulty_multiplier
	
	# 如果是 Boss，血量與傷害再大幅強化
	if is_boss:
		current_hp *= 15.0 # Boss 血量是雜魚 15 倍
		damage = 5.0      # Boss 傷害下修至 5 點 (兩下致命)
		scale = Vector2(3.0, 3.0) # 3 倍大
		modulate = Color(1.2, 1.2, 1.2) # 稍微發光
		
	max_hp = current_hp
	
	# 重設視覺：移除原本可能存在的色偏，確保新素材顏色正確
	var sprite = get_node_or_null("Sprite2D")
	if sprite:
		sprite.modulate = Color.WHITE
	
	# 初始化生命條：先隱藏，等到受傷再顯示
	var hp_bar = get_node_or_null("ProgressBar")
	if hp_bar:
		hp_bar.visible = false
	
	# 如果是分裂後的，體積縮小且血量減半
	if is_split_version:
		scale = Vector2(0.5, 0.5)
		current_hp *= 0.5
		max_hp = current_hp
	
	# 連接對玩家的碰撞事件
	if not body_entered.is_connected(_on_body_entered):
		body_entered.connect(_on_body_entered)

# 外部呼叫：設定怪獸的視覺與屬性
func setup_variant(type: EnemyType, texture_path: String, speed_mult: float, hp_mult: float):
	current_type = type
	movement_speed *= speed_mult
	max_hp *= hp_mult
	current_hp = max_hp
	
	# 載入貼圖 (使用 ResourceLoader 比較安全)
	var tex = ResourceLoader.load(texture_path)
	if tex:
		var sprite = get_node_or_null("Sprite2D")
		if sprite:
			sprite.texture = tex
	else:
		print("❌ 警告：找不到素材路徑: ", texture_path)

func _process(delta: float) -> void:
	if player_node == null:
		# 使用最穩定可靠的群組尋找法
		player_node = get_tree().get_first_node_in_group("player")
		if player_node == null: return
			
	if player_node != null:
		var direction = global_position.direction_to(player_node.global_position)
		global_position += direction * movement_speed * delta

func take_damage(damage_amount: float) -> void:
	current_hp -= damage_amount
	
	var hp_bar = get_node_or_null("ProgressBar")
	if hp_bar:
		hp_bar.visible = true
		hp_bar.max_value = max_hp
		hp_bar.value = current_hp
		
	if current_hp <= 0:
		die()

func _on_body_entered(body: Node2D) -> void:
	if body.has_method("take_damage") and "Player" in body.name:
		body.take_damage(damage)

func die() -> void:
	# 只有「抹茶系 (MATCHA)」且「非分裂版」死亡時會分裂
	if current_type == EnemyType.MATCHA and not is_split_version:
		spawn_splits()
		
	if gem_scene != null:
		var gem = gem_scene.instantiate()
		
		# [NEW] Boss 遺產：掉落 10 點經驗
		if is_boss:
			gem.xp_amount = 10
			
		get_parent().call_deferred("add_child", gem)
		gem.global_position = global_position
		
	queue_free()

func spawn_splits():
	# 產生兩隻小怪
	for i in range(2):
		var split_enemy = self.duplicate() # 複製一份自己
		split_enemy.is_split_version = true
		# 稍微給一點偏移
		var offset = Vector2(randf_range(-20, 20), randf_range(-20, 20))
		get_parent().call_deferred("add_child", split_enemy)
		split_enemy.global_position = global_position + offset
