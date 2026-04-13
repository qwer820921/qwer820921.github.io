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

# 狀態異常
var speed_multiplier: float = 1.0
var freeze_timer: float = 0.0
var puddles_inside: int = 0 # 踩在地上的陷阱數量
var player_in_contact: Node2D = null # 目前正在接觸的玩家
var contact_damage_timer: float = 0.0 # 接觸傷害計時器

func _ready() -> void:
	# 基礎數值套用難度
	current_hp = max_hp * difficulty_multiplier
	
	# 如果是 Boss，血量與傷害再大幅強化
	if is_boss:
		current_hp *= 30.0 # Boss 血量強化至雜魚 30 倍
		damage = 5.0      # Boss 傷害下修至 5 點 (兩下致命)
		scale = Vector2(3.0, 3.0) # 3 倍大
		modulate = Color(1.2, 1.2, 1.2) # 稍微發光
		
	max_hp = current_hp
	
	# 在原有基礎上再放大 1.5 倍 (小兵 1.5x, Boss 4.5x)
	scale *= 1.5
	
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
	if not body_exited.is_connected(_on_body_exited):
		body_exited.connect(_on_body_exited)

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
	# 1. 處理凍結計時
	if freeze_timer > 0:
		freeze_timer -= delta
		modulate = Color(0.5, 0.8, 1.0) # 變為冰藍色
		return # 凍結中無法移動
	else:
		# 解凍後恢復顏色
		if puddles_inside > 0:
			modulate = Color(0.7, 0.5, 0.3) # 踩在黑糖裡的顏色
		elif is_boss:
			modulate = Color(1.2, 1.2, 1.2)
		else:
			modulate = Color.WHITE

	# 2. 尋找玩家 (用於追蹤移動)
	if player_node == null:
		player_node = get_tree().get_first_node_in_group("player")
		if player_node == null: return
			
	# 3. 計算速度並移動
	if player_node != null:
		# 緩速邏輯：踩在黑糖裡則速度減半
		var current_speed_mult = 0.5 if puddles_inside > 0 else 1.0
		var direction = global_position.direction_to(player_node.global_position)
		global_position += direction * movement_speed * current_speed_mult * delta

	# --- [NEW] 持續碰撞傷害邏輯 ---
	if player_in_contact != null:
		contact_damage_timer -= delta
		if contact_damage_timer <= 0:
			contact_damage_timer = 1.0 # 每秒觸發一次持續傷害
			if player_in_contact.has_method("take_damage"):
				print("🔥 [持續傷害]：玩家處於 ", name, " 接觸區，再次造成傷害：", damage)
				player_in_contact.take_damage(damage)

# 由黑糖陷阱呼叫
func set_puddle_status(inside: bool):
	if inside:
		puddles_inside += 1
	else:
		puddles_inside = max(0, puddles_inside - 1)

# 由冰塊呼叫
func freeze(duration: float):
	freeze_timer = duration

func take_damage(damage_amount: float) -> void:
	current_hp -= damage_amount
	
	# --- [NEW] 彈出傷害數字 ---
	var dmg_node = preload("res://ui/DamageNumber.tscn").instantiate()
	get_parent().add_child(dmg_node)
	dmg_node.global_position = global_position + Vector2(0, -50) # 在怪頭頂彈出
	dmg_node.set_values(damage_amount, Color(1, 0.9, 0.2)) # 怪物受傷用黃色
	
	var hp_bar = get_node_or_null("ProgressBar")
	if hp_bar:
		hp_bar.visible = true
		hp_bar.max_value = max_hp
		hp_bar.value = current_hp
		
	if current_hp <= 0:
		die()

func _on_body_entered(body: Node2D) -> void:
	if body.is_in_group("player") and body.has_method("take_damage"):
		print("💥 [碰撞回報]：玩家進入了 ", name, " 核心區！造成即時傷害：", damage)
		body.take_damage(damage)
		
		# 記錄接觸狀態並重置計時器
		player_in_contact = body
		contact_damage_timer = 1.0 # 下一次傷害在 1 秒後

func _on_body_exited(body: Node2D) -> void:
	if body == player_in_contact:
		print("🚶 [脫離回報]：玩家離開了 ", name, " 的接觸範圍")
		player_in_contact = null

func die() -> void:
	# 只有「抹茶系 (MATCHA)」且「非分裂版」死亡時會分裂
	if current_type == EnemyType.MATCHA and not is_split_version:
		spawn_splits()
		
	if gem_scene != null:
		var gem = gem_scene.instantiate()
		
		# [NEW] Boss 遺產通知 (恢復為 10 經驗)
		if is_boss:
			gem.xp_amount = 10
			print("🚨 [DEBUG] BOSS 已倒下！掉落 100 經驗大珍珠！")
			# 建立一個臨時標籤顯示在掉落位置
			var label = Label.new()
			label.text = "👑 LEGENDARY BOBA GEM 👑"
			label.modulate = Color(1, 1, 0)
			label.z_index = 250
			get_parent().add_child(label)
			label.global_position = global_position + Vector2(-100, -150)
			var t = label.create_tween()
			t.tween_property(label, "scale", Vector2(2, 2), 0.5)
			t.tween_property(label, "global_position", label.global_position + Vector2(0, -200), 2.0)
			t.parallel().tween_property(label, "modulate:a", 0, 2.0)
			t.tween_callback(label.queue_free)
			
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
