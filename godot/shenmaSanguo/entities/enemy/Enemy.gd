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
var speed_mult: float = 1.0        # 速度乘數（被減速時 < 1.0）

# ── 路徑 ──────────────────────────────────────────────────────
var _waypoints: Array   = []       # Array[Vector2] 像素座標
var _wp_index: int      = 0

# ── 視覺常數 ──────────────────────────────────────────────────
const TILE_SIZE: int    = 64
const ENEMY_RADIUS: int = 18
const HP_BAR_W: int     = 36
const HP_BAR_H: int     = 5
const FLASH_TIME: float = 0.12

# ── 閃爍效果 ──────────────────────────────────────────────────
var _flash_timer: float = 0.0
var _is_dead: bool      = false

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

	# 閃爍計時
	if _flash_timer > 0.0:
		_flash_timer -= delta
		if _flash_timer <= 0.0:
			queue_redraw()

	# 抵達終點
	if _wp_index >= _waypoints.size():
		_on_reached_base()
		return

	# 移動
	var target: Vector2        = _waypoints[_wp_index]
	var effective_speed: float = base_speed * speed_mult  # 直接使用像素/秒（對齊試算表數值）
	
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
	if current_hp <= 0.0:
		current_hp = 0.0
		_die()
	queue_redraw()

## 減速（speed_mult < 1.0）；持續時間結束後還原
func apply_slow(mult: float, _duration: float) -> void:
	speed_mult = mult

func clear_slow() -> void:
	speed_mult = 1.0

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
	var color: Color = Color.WHITE if _flash_timer > 0.0 else body_color

	# 身體（圓形）
	draw_circle(Vector2.ZERO, ENEMY_RADIUS, color)
	draw_arc(Vector2.ZERO, ENEMY_RADIUS, 0, TAU, 24, Color(0, 0, 0, 0.5), 1.5)

	# 標籤文字
	draw_string(ThemeDB.fallback_font,
		Vector2(-6, 6), label_text,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color.WHITE)

	# HP 條
	var bar_x: float = -HP_BAR_W / 2.0
	var bar_y: float = -(ENEMY_RADIUS + HP_BAR_H + 3)
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
