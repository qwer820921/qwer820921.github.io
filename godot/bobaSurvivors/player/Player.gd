extends CharacterBody2D

# 變數宣告 (@export 讓這個數值可以在右側屬性面板直接調整)
@export var movement_speed: float = 220.0
@export var max_health: float = 10.0 # [HARDCORE] 初始血量下修至 10
@export var camera_zoom: float = 0.5 
var current_health: float = 10.0

# 武器與射擊相關
@export var bullet_scene: PackedScene
@export var orbit_scene: PackedScene  
var shoot_timer: float = 0.0
var shoot_interval: float = 1.0 

# UI 相關
@export var game_over_ui_scene: PackedScene 
# 經驗值與等級相關
var current_level: int = 1
var current_xp: int = 0
var xp_to_next_level: int = 5 # [NEW] 初始經驗值為 5

# 玩家屬性
@export var attack_damage: float = 10.0
@export var extra_bullet_speed: float = 0.0
var bullet_count: int = 1         # 每次發射幾顆
var bounce_count: int = 0         # 子彈彈跳次數
var pierce_count: int = 0         # 子彈穿透次數
@export var orbit_count: int = 0          # 旋轉珍珠數量
@export var brown_sugar_puddle_scene: PackedScene
@export var ice_cube_scene: PackedScene

var puddled_timer_current: float = 0.0
var ice_cube_timer_current: float = 0.0
var ice_cube_interval: float = 3.0 # 每 3 秒射一次

var orbit_rotation: float = 0.0 # [NEW] 用於同步所有旋轉珍珠的相位
var brown_sugar_puddle_count: int = 0
var ice_cube_count: int = 0

func _ready() -> void:
	# 加入群組，方便其他 UI 找我
	add_to_group("player")
	
	# 確保相機縮放正確
	var cam = find_child("Camera2D", true, false)
	if cam:
		cam.zoom = Vector2(camera_zoom, camera_zoom)
		
	# 視界強化：人物放大 2.25 倍 (1.5 * 1.5)，讓手機屏幕更有張力
	scale = Vector2(2.25, 2.25)
	
	# --- [NEW] 開局福利：初始獲得一顆旋轉護身珍珠 ---
	# 我們在物理更新開始前先生成它
	call_deferred("add_orbit_pearl")

func _physics_process(_delta: float) -> void:
	# 隨機在玩家周圍「超遠」範圍生成（適配 0.5 的超廣角視野）
	var random_angle = randf() * PI * 2
	var random_distance = randf_range(1200, 1500)
	var spawn_offset = Vector2(cos(random_angle), sin(random_angle)) * random_distance

	# 這裡我們換個寫法：直接偵測實體鍵盤的 W, A, S, D 以及 方向鍵
	# 這樣就算不設定專案也可以 100% 成功移動！
	# --- [移動輸入偵測] ---
	var move_input = Vector2.ZERO
	
	# 1. 強化版通用輸入 (支援鍵盤 WASD/方向鍵 與 手機 D-Pad)
	# 我們在 Project Settings 中雖然沒定義，但可以用 Input.get_action_strength 或手動累加狀態
	# 這裡我保留原本的物理按鍵偵測，並疊加虛擬按鈕的狀態
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT) or Input.is_action_pressed("ui_right"):
		move_input.x += 1
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT) or Input.is_action_pressed("ui_left"):
		move_input.x -= 1
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN) or Input.is_action_pressed("ui_down"):
		move_input.y += 1
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP) or Input.is_action_pressed("ui_up"):
		move_input.y -= 1
		
	# 2. 虛擬搖桿輸入 (如果存在於畫面上)
	var joystick = get_tree().get_first_node_in_group("joystick")
	if joystick and joystick.has_method("get_velocity"):
		var joystick_vec = joystick.get_velocity()
		if joystick_vec.length() > 0:
			move_input = joystick_vec 
		
	# 將向量正規化，確保斜走不會比較快
	move_input = move_input.normalized()
	
	# 設定速度
	velocity = move_input * movement_speed
	
	# 呼叫內建函式進行移動與碰撞處理
	move_and_slide()
	
	# ----- 自動射擊邏輯 -----
	shoot_timer -= _delta
	
	# [NEW] 更新同步旋轉相位 (2.7秒一圈：2*PI / 2.7 ≈ 2.327)
	orbit_rotation += 2.327 * _delta 
	
	if shoot_timer <= 0:
		shoot_timer = shoot_interval
		shoot_closest_enemy()
		
	# --- [NEW] 黑糖陷阱生成邏輯 ---
	if brown_sugar_puddle_count > 0:
		puddled_timer_current -= _delta
		if puddled_timer_current <= 0:
			puddled_timer_current = 2.0 # 每 2 秒灑一灘
			spawn_brown_sugar()
			
	# --- [NEW] 冰晶爆裂發射邏輯 ---
	if ice_cube_count > 0:
		ice_cube_timer_current -= _delta
		if ice_cube_timer_current <= 0:
			ice_cube_timer_current = ice_cube_interval
			shoot_ice_cube()

func spawn_brown_sugar():
	if brown_sugar_puddle_scene == null: return
	var puddle = brown_sugar_puddle_scene.instantiate()
	get_parent().add_child(puddle)
	puddle.global_position = global_position

func shoot_closest_enemy() -> void:
	if bullet_scene == null:
		return
		
	# --- [更精準的瞄準系統] ---
	# 直接抓取所有在 "enemy" 群組裡的節點
	var enemies = get_tree().get_nodes_in_group("enemy")
				
	if enemies.size() == 0:
		return
		
	# 找最近的敵人
	var closest_enemy = null
	var min_dist = 999999.0 # 設定一個超遠初始距離
	
	for enemy in enemies:
		if is_instance_valid(enemy): # 確保怪物還活著
			var dist = global_position.distance_to(enemy.global_position)
			if dist < min_dist:
				min_dist = dist
				closest_enemy = enemy
			
	if closest_enemy == null:
		return
			
	# ！！！多重發射邏輯！！！
	for i in range(bullet_count):
		var bullet = bullet_scene.instantiate()
		get_parent().add_child(bullet)
		bullet.global_position = global_position
		
		# 計算基準方向
		var base_direction = global_position.direction_to(closest_enemy.global_position)
		
		# 如果射超過一顆，就加入扇形偏移
		if bullet_count > 1:
			var angle_offset = (i - (bullet_count - 1) / 2.0) * 0.2 # 0.2 弧度約為 11 度
			base_direction = base_direction.rotated(angle_offset)
			
		bullet.direction = base_direction
		
		# 傳遞所有屬性給子彈
		if "damage" in bullet:
			bullet.damage = attack_damage
		if "pierce_count" in bullet:
			bullet.pierce_count = pierce_count
		if "bounce_count" in bullet:
			bullet.bounce_count = bounce_count

func gain_xp(amount: int) -> void:
	current_xp += amount
	print("獲得經驗值！目前: ", current_xp, "/", xp_to_next_level)
	
	if current_xp >= xp_to_next_level:
		level_up()
		
	# 嘗試更新經驗值條 (使用 find_child 更精準)
	var xp_bar = find_child("XpBar", true, false)
	if xp_bar != null:
		xp_bar.max_value = xp_to_next_level
		xp_bar.value = current_xp

func level_up() -> void:
	current_level += 1
	current_xp -= xp_to_next_level
	
	# --- [NEW] 階梯式 XP 系統 ---
	# 邏輯：每 10 等一個區間，區間內 +2, +3...，每逢 11, 21.. 翻倍
	var decade = int((current_level - 1) / 10) # 0, 1, 2...
	var increment = 2 + decade
	
	# 如果剛好是 11, 21, 31... (也就是 (current_level-1) 是 10 的倍數)
	if (current_level - 1) % 10 == 0:
		xp_to_next_level *= 2
	else:
		xp_to_next_level += increment
	
	# --- [NEW] 動態基礎體質成長 ---
	# 攻擊力根據等級換算的基數成長 (1-5等+2, 6-10等+3...)
	var dynamic_damage_gain = get_attack_growth_base()
	max_health += 2.0
	attack_damage += dynamic_damage_gain
	
	# 升級回血：回復 20% 最大血量
	var heal_amount = max_health * 0.2
	current_health = min(max_health, current_health + heal_amount)
	
	print("🎉 升級到 Lv ", current_level, " ! HP上限: ", max_health, " 攻擊成長: +", dynamic_damage_gain, " 總攻擊力: ", attack_damage)
	
	# --- 更新 UI 顯示 (血條與經驗條) ---
	var hp_bar = find_child("HealthBar", true, false)
	if hp_bar:
		hp_bar.max_value = max_health
		hp_bar.value = current_health
		
	var xp_bar = find_child("XpBar", true, false)
	if xp_bar:
		xp_bar.max_value = xp_to_next_level
		xp_bar.value = current_xp
	
	# --- 嘗試尋找三選一 UI ---
	var ui = get_tree().get_first_node_in_group("level_up_ui")
	if ui:
		if ui.has_method("show_ui"):
			get_tree().paused = true
			ui.show_ui()
		else:
			# 給予保險獎勵
			add_damage(2.0)
	else:
		# 給予攻速補償
		add_fire_rate(0.1)

# 獲取當前等級階段的攻擊力成長基數 (每 5 等 +1)
func get_attack_growth_base() -> float:
	return 2.0 + int((current_level - 1) / 5.0)

# 提供給三選一 UI 呼叫的強化函式
func add_damage(amount: float):
	# [NEW] 強化倍增：獲得當前成長基數的 2 倍
	var bonus = get_attack_growth_base() * 2.0
	attack_damage += bonus
	print("🔥 傳奇覺醒！獲得雙倍強化: +", bonus, " 總攻擊力: ", attack_damage)

func add_speed(amount: float):
	movement_speed += amount
	print("速度提升！目前速度: ", movement_speed)

func add_max_health(amount: float):
	max_health += amount
	current_health += amount # 提升上限時也補滿這部分的血量
	print("血量上限提升！目前最大血量: ", max_health)
	
	# 更新血條顯示
	var hp_bar = find_child("HealthBar", true, false)
	if hp_bar:
		hp_bar.max_value = max_health
		hp_bar.value = current_health

func add_fire_rate(amount: float):
	shoot_interval = max(0.1, shoot_interval - amount)
	print("攻速提升！目前間隔: ", shoot_interval)

# --- [NEW] 進階技能強化函式 ---

func add_bullet_count(amount: int):
	bullet_count += amount
	print("雙倍加料！每次發射: ", bullet_count, " 顆")

func add_pierce(amount: int):
	pierce_count += amount
	print("大顆珍珠 (穿透)！穿透次數: ", pierce_count)

func add_bounce(amount: int):
	bounce_count += amount
	print("彈跳椰果！彈跳次數: ", bounce_count)

func add_orbit_pearl():
	if orbit_scene == null: return
	
	orbit_count += 1
	var new_orbit = orbit_scene.instantiate()
	add_child(new_orbit)
	
	# [NEW] 均勻分配全體角度 (2*PI / N)
	var orbits = get_tree().get_nodes_in_group("orbit_pearls")
	var count = orbits.size()
	if count > 0:
		var step = (PI * 2) / count
		for i in range(count):
			if is_instance_valid(orbits[i]):
				orbits[i].angle_offset = i * step
		print("旋轉焦糖圓環強化！目前數量: ", orbit_count, " 均勻分佈每顆間距: ", rad_to_deg(step), "度")

func add_brown_sugar():
	brown_sugar_puddle_count += 1
	print("濃稠黑糖陷阱解鎖/強化！目前等級: ", brown_sugar_puddle_count)

func shoot_ice_cube():
	if ice_cube_scene == null: return
	
	# 尋找最近的敵人進行發射
	var enemies = get_tree().get_nodes_in_group("enemy")
	var closest_enemy = null
	var min_dist = 999999.0
	
	for enemy in enemies:
		if is_instance_valid(enemy):
			var dist = global_position.distance_to(enemy.global_position)
			if dist < min_dist:
				min_dist = dist
				closest_enemy = enemy
				
	if closest_enemy == null: return
	
	var ice = ice_cube_scene.instantiate()
	get_parent().add_child(ice) # 加到 Main
	ice.global_position = global_position
	ice.direction = global_position.direction_to(closest_enemy.global_position)

func add_ice_cube():
	ice_cube_count += 1
	# 強化時縮短冷卻時間
	ice_cube_interval = max(0.8, ice_cube_interval - 0.2)
	print("冰晶爆裂解鎖/強化！冷卻時間縮短為: ", ice_cube_interval)

# --- [NEW] 生命與受傷邏輯 ---

func take_damage(amount: float):
	current_health -= amount
	print("玩家受傷！剩餘血量: ", current_health)
	
	# 更新玩家血條 (使用 find_child 更強大)
	var hp_bar = find_child("HealthBar", true, false)
	if hp_bar:
		hp_bar.max_value = max_health
		hp_bar.value = current_health
		
	if current_health <= 0:
		game_over()

func game_over():
	print("💀 遊戲結束！您被怪物淹沒了...")
	get_tree().paused = true
	
	if game_over_ui_scene:
		var ui = game_over_ui_scene.instantiate()
		# 這裡改為加到父節點，隨場景重啟而銷毀
		get_parent().add_child(ui)
	else:
		# 如果沒設定 UI，簡單的 2 秒後重開
		await get_tree().create_timer(2.0).timeout
		get_tree().paused = false
		get_tree().reload_current_scene()
