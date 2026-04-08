extends Area2D

# 變數宣告
@export var movement_speed: float = 100.0
@export var max_hp: float = 10.0
@export var damage: float = 10.0 # 怪物對玩家的傷害
@export var gem_scene: PackedScene # 死亡掉落的經驗珍珠

var current_hp: float
var player_node: Node2D = null
var difficulty_multiplier: float = 1.0 # 由 Main 傳入

func _ready() -> void:
	# 根據難度提升血量
	current_hp = max_hp * difficulty_multiplier
	max_hp = current_hp # 更新最大血量，如果有血條的話可以用到
	
	# 連接對玩家的碰撞事件
	body_entered.connect(_on_body_entered)

func _process(delta: float) -> void:
	# 防呆裝置：直接透過資料夾結構去抓隔壁的 Player，完全不依賴標籤！
	if player_node == null:
		var parent = get_parent()
		if parent != null and parent.has_node("Player"):
			player_node = parent.get_node("Player")
		
		if player_node == null:
			return
			
	# 如果有找到玩家，就移動
	if player_node != null:
		# 計算朝向玩家的方向
		var direction = global_position.direction_to(player_node.global_position)
		
		# 手動更新位置
		global_position += direction * movement_speed * delta

# 這是拿來承受傷害的函式
func take_damage(damage_amount: float) -> void:
	current_hp -= damage_amount
	
	# 更新怪物腳下的血條 ProgressBar（如果有的話）
	var hp_bar = get_node_or_null("ProgressBar")
	if hp_bar:
		hp_bar.visible = true # 受傷時才顯示
		hp_bar.max_value = max_hp
		hp_bar.value = current_hp
		
	if current_hp <= 0:
		die()

# 當怪物碰到玩家時（玩家是 CharacterBody2D，屬於 Body）
func _on_body_entered(body: Node2D) -> void:
	if body.has_method("take_damage") and "Player" in body.name:
		body.take_damage(damage)
		# 選配：碰完之後彈開或是直接原地消失（這裡我們先讓它碰完玩家就自爆，增加生存壓力）
		# die() 


func die() -> void:
	if gem_scene != null:
		var gem = gem_scene.instantiate()
		get_parent().call_deferred("add_child", gem) # 使用 call_deferred 確保在物理更新時生成不會出錯
		gem.global_position = global_position
		
	# 從畫面上刪除自己
	queue_free()
