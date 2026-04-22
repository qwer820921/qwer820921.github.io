## Enemy.gd
## 敵人：沿路點移動、受傷、死亡、抵達基地

class_name Enemy
extends Node2D

# ── Signals ───────────────────────────────────────────────────
signal died(enemy: Node)
signal reached_base(enemy: Node)

# ── 屬性 ──────────────────────────────────────────────────────
var enemy_id: String  = "soldier"
var max_hp: float     = 100.0
var current_hp: float = 100.0
var base_speed: float = 1.5        # 格子/秒
var speed_mult: float = 1.0        # 速度乘數（被減速時 < 1.0，通常為光環）
var _stack_slow_amount: float = 0.0 # 疊加的減速量（來自文士塔）
var _stack_slow_timer: float = 0.0  # 疊加減速持續時間

# ── 路徑 ──────────────────────────────────────────────────────
var _waypoints: Array   = []       # Array[Vector2] 像素座標
var _wp_index: int      = 0

# ── 視覺常數 ──────────────────────────────────────────────────
var tile_size: int      = 48
var enemy_radius: int   = 17
const HP_BAR_W: int     = 36
const HP_BAR_H: int     = 5
const FLASH_TIME: float = 0.12

# ── 閃爍效果 ──────────────────────────────────────────────────
var _flash_timer: float = 0.0
var _is_dead: bool      = false
var _texture: Texture2D = null
var _texture_atk: Texture2D = null

# ── 顏色（依 enemy_id 可設不同顏色，預設灰） ──────────────
var body_color: Color   = Color(0.55, 0.20, 0.20, 1)  # 深紅兵
var label_text: String  = "兵"

# ═══════════════════════════════════════════
#  初始化
# ═══════════════════════════════════════════
func setup(cfg: Dictionary, waypoints: Array) -> void:
	_waypoints   = waypoints
	_wp_index    = 1
	max_hp       = float(cfg.get("hp", 100))
	current_hp   = max_hp
	base_speed   = float(cfg.get("speed", 1.5))
	enemy_id     = str(cfg.get("enemy_id", "soldier"))
	label_text   = str(cfg.get("name", "兵")).left(1)
	enemy_radius = max(8, int(tile_size * 0.35))
	var img_name: String = str(cfg.get("image", ""))
	if img_name != "":
		var path: String = "res://assets/units/" + img_name
		if ResourceLoader.exists(path):
			_texture = load(path) as Texture2D
			
			# 嘗試讀取攻擊圖片
			var atk_path: String = path.replace(".webp", "_atk.webp")
			if ResourceLoader.exists(atk_path):
				_texture_atk = load(atk_path) as Texture2D
			else:
				atk_path = path.replace(".webp", "_attack.webp")
				if ResourceLoader.exists(atk_path):
					_texture_atk = load(atk_path) as Texture2D

	# 依 enemy_id 設定顏色
	match enemy_id:
		"cavalry":  body_color = Color(0.20, 0.20, 0.65, 1); label_text = "騎"
		"archer":   body_color = Color(0.20, 0.55, 0.20, 1); label_text = "弓"
		"general":  body_color = Color(0.65, 0.50, 0.10, 1); label_text = "將"
		_:          body_color = Color(0.55, 0.20, 0.20, 1)

	if not waypoints.is_empty():
		position = waypoints[0]
	queue_redraw()

# ═══════════════════════════════════════════
#  _physics_process — 移動（Web 端使用物理時鐘較穩定）
# ═══════════════════════════════════════════
func _physics_process(delta: float) -> void:
	if _is_dead or _waypoints.is_empty():
		return

	# 防止 Web 端 delta 異常導致的「瞬移」
	delta = min(delta, 0.1)

	# 閃爍與狀態計時
	if _flash_timer > 0.0:
		_flash_timer -= delta
		if _flash_timer <= 0.0:
			queue_redraw()

	if _stack_slow_timer > 0.0:
		_stack_slow_timer -= delta
		if _stack_slow_timer <= 0.0:
			_stack_slow_amount = 0.0 # 疊加效果結束
			queue_redraw()

	# 抵達終點
	if _wp_index >= _waypoints.size():
		_on_reached_base()
		return

	# 移動
	var target: Vector2        = _waypoints[_wp_index]
	var effective_speed: float = base_speed * speed_mult * (1.0 - _stack_slow_amount)
	effective_speed = max(base_speed * 0.15, effective_speed) # 限制最少保留 15% 基礎跑速
	
	# 偵錯記錄：這會在瀏覽器控制台 (F12) 顯示
	if _wp_index == 1 and Engine.get_process_frames() % 60 == 0:
		print("[Enemy Debug] ID: %s, BaseSpeed: %f, FINAL SPEED (px/s): %f" % [enemy_id, base_speed, effective_speed])
	
	var direction: Vector2     = (target - position).normalized()
	var move_dist: float       = effective_speed * delta

	if position.distance_to(target) <= move_dist:
		position = target
		_wp_index += 1
	else:
		position += direction * move_dist
		queue_redraw()

# ═══════════════════════════════════════════
#  受傷 / 死亡
# ═══════════════════════════════════════════
func take_damage(amount: float) -> void:
	if _is_dead:
		return
	current_hp -= amount
	_flash_timer = FLASH_TIME
	
	# 顯示傷害數字
	var ft = load("res://ui/FloatingText.gd").new()
	get_parent().add_child(ft)
	ft.setup("%.0f" % amount, Color(1.0, 0.4, 0.2), global_position)

	if current_hp <= 0.0:
		current_hp = 0.0
		_die()
	queue_redraw()

## 減速光環（speed_mult < 1.0）
func apply_slow(mult: float, _duration: float) -> void:
	speed_mult = mult

func clear_slow() -> void:
	speed_mult = 1.0

## 疊加減速（文士塔用）
func apply_stackable_slow(amount: float, duration: float) -> void:
	_stack_slow_amount += amount
	if _stack_slow_amount > 0.85:
		_stack_slow_amount = 0.85  # 最多減少 85%
	_stack_slow_timer = duration   # 每次被打中都會刷新持續時間
	
	# 顯示「減速」提示字
	var ft = load("res://ui/FloatingText.gd").new()
	get_parent().add_child(ft)
	ft.setup("緩", Color(0.2, 0.6, 0.9), global_position + Vector2(0, -10))
	
	queue_redraw()

func _die() -> void:
	_is_dead = true
	died.emit(self)
	queue_free()

func _on_reached_base() -> void:
	_is_dead = true
	reached_base.emit(self)
	queue_free()

# ═══════════════════════════════════════════
#  繪製
# ═══════════════════════════════════════════
func _draw() -> void:
	var r: float = float(enemy_radius)
	var sprite_rect: Rect2 = Rect2(Vector2(-r, -r), Vector2(r * 2.0, r * 2.0))

	# 如果被武將大幅減速（speed_mult <= 0.5），視為正在交戰，顯示攻擊圖片
	var is_fighting: bool = (speed_mult <= 0.5)
	var current_tex: Texture2D = _texture_atk if (is_fighting and _texture_atk != null) else _texture

	if current_tex != null:
		draw_texture_rect(current_tex, sprite_rect, false)
		if _flash_timer > 0.0:
			draw_rect(sprite_rect, Color(1.0, 0.2, 0.2, 0.45))
	else:
		var color: Color = Color.WHITE if _flash_timer > 0.0 else body_color
		draw_circle(Vector2.ZERO, r, color)
		draw_arc(Vector2.ZERO, r, 0, TAU, 24, Color(0, 0, 0, 0.5), 1.5)
		draw_string(ThemeDB.fallback_font,
			Vector2(-6, 6), label_text,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color.WHITE)

	# HP 條（貼圖與純色模式共用）
	var bar_x: float = -HP_BAR_W / 2.0
	var bar_y: float = -(r + HP_BAR_H + 3)
	var hp_ratio: float = current_hp / max_hp
	draw_rect(Rect2(bar_x, bar_y, HP_BAR_W, HP_BAR_H), Color(0.2, 0.2, 0.2, 0.8))
	draw_rect(Rect2(bar_x, bar_y, HP_BAR_W * hp_ratio, HP_BAR_H),
		Color(0.2, 0.85, 0.2, 1) if hp_ratio > 0.5
		else (Color(0.9, 0.7, 0.1, 1) if hp_ratio > 0.25
		else Color(0.9, 0.15, 0.15, 1))
	)

# ═══════════════════════════════════════════
#  查詢
# ═══════════════════════════════════════════
func get_progress_ratio() -> float:
	## 回傳在路徑上的進度（0~1），越接近基地越大，方便塔選目標
	return float(_wp_index) / max(1, _waypoints.size())

func is_dead() -> bool:
	return _is_dead
