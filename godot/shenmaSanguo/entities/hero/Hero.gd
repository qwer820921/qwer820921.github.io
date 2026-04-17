## Hero.gd
## 武將：放置於 ROAD 或 BUILD，自動攻擊範圍內敵人
## ROAD 上：攻擊最近敵人並施加緩速（模擬阻擋）
## BUILD 上：攻擊最近敵人（不阻擋）

class_name Hero
extends Node2D

# ── Signals ───────────────────────────────────────────────────
signal hero_clicked(hero: Node)

# ── 武將屬性（由外部 setup 傳入） ────────────────────────────
var hero_id: String       = ""
var hero_name: String     = "武將"
var atk: float            = 100.0
var def: float            = 50.0
var max_hp: float         = 1000.0
var current_hp: float     = 1000.0
var attack_range: float   = 2.0    # 格子數
var attack_speed: float   = 1.0    # 攻擊間隔（秒）

# ── 放置資訊 ──────────────────────────────────────────────────
var grid_cell: Vector2i   = Vector2i.ZERO
var is_on_road: bool      = false   # 若在 ROAD 上，施加緩速效果

# ── 內部狀態 ──────────────────────────────────────────────────
var _atk_timer: float     = 0.0
var _wave_mgr: Node       = null    # WaveManager 引用
var _is_selected: bool    = false
const TILE_SIZE: int      = 64
const HERO_HALF: int      = 22
const SLOW_RATIO: float   = 0.30   # ROAD 英雄對敵人施加的速度倍率

# 顏色（依職業差異）
var body_color: Color     = Color(0.20, 0.40, 0.80, 1)  # 預設藍

# ═══════════════════════════════════════════
#  初始化
# ═══════════════════════════════════════════
func setup(state: Dictionary, heroes_config: Array, cell: Vector2i, on_road: bool, wave_mgr: Node) -> void:
	hero_id    = str(state.get("hero_id", ""))
	current_hp = float(state.get("hp", 1000))
	max_hp     = current_hp
	atk        = float(state.get("atk", 100))
	def_stat   = float(state.get("def", 50))
	grid_cell  = cell
	is_on_road = on_road
	_wave_mgr  = wave_mgr

	# 從 heroes_config 取得靜態屬性
	for cfg in heroes_config:
		if cfg.get("hero_id", "") == hero_id:
			hero_name    = str(cfg.get("name", hero_id))
			attack_range = float(cfg.get("attack_range", 2.0))
			attack_speed = float(cfg.get("attack_speed", 1.0))
			match str(cfg.get("job", "")):
				"infantry":
					body_color = Color(0.65, 0.20, 0.20, 1)
				"archer":
					body_color = Color(0.20, 0.65, 0.20, 1)
				"artillery":
					body_color = Color(0.65, 0.50, 0.10, 1)
				_:
					body_color = Color(0.20, 0.40, 0.80, 1)
			break

	queue_redraw()

# 修正 def 命名（def 是 GDScript 保留字型）
var def_stat: float = 50.0

# ═══════════════════════════════════════════
#  _process — 自動攻擊
# ═══════════════════════════════════════════
func _process(delta: float) -> void:
	_atk_timer -= delta
	if _atk_timer > 0.0:
		return
	if not _wave_mgr:
		return

	var range_px: float = attack_range * TILE_SIZE
	var enemies: Array = _wave_mgr.get_active_enemies()
	var target: Node = _find_target(enemies, range_px)
	if target == null:
		# 清除所有減速
		_clear_all_slows(enemies)
		return

	# 攻擊
	target.take_damage(atk)
	_atk_timer = attack_speed

	# ROAD 武將：在攻擊的回合對目標施加緩速
	if is_on_road:
		target.apply_slow(SLOW_RATIO, attack_speed)

func _find_target(enemies: Array, range_px: float) -> Node:
	# 優先選「進度最靠近基地」且在範圍內的敵人
	var best: Node       = null
	var best_progress: float = -1.0
	for e in enemies:
		if not is_instance_valid(e) or e.is_dead():
			continue
		var dist: float = global_position.distance_to(e.global_position)
		if dist <= range_px and e.get_progress_ratio() > best_progress:
			best_progress = e.get_progress_ratio()
			best = e
	return best

func _clear_all_slows(enemies: Array) -> void:
	if not is_on_road:
		return
	for e in enemies:
		if is_instance_valid(e) and not e.is_dead():
			e.clear_slow()

# ═══════════════════════════════════════════
#  受傷（目前武將無法被敵人傷害——保留介面）
# ═══════════════════════════════════════════
func take_damage(amount: float) -> void:
	current_hp -= amount * (1.0 - def_stat / (def_stat + 100.0))
	if current_hp <= 0.0:
		current_hp = 0.0
	queue_redraw()

# ═══════════════════════════════════════════
#  選取狀態
# ═══════════════════════════════════════════

func set_selected(sel: bool) -> void:
	_is_selected = sel
	queue_redraw()

# ═══════════════════════════════════════════
#  繪製
# ═══════════════════════════════════════════
func _draw() -> void:
	# 射程圈（選中時顯示）
	if _is_selected:
		# 半透明紅色圓形 (Alpha 0.3)
		draw_circle(Vector2.ZERO, attack_range * TILE_SIZE, Color(1.0, 0.0, 0.0, 0.3))
		# 外圈線條 (加粗並提高亮度)
		draw_arc(Vector2.ZERO, attack_range * TILE_SIZE, 0, TAU, 48, Color(1.0, 0.2, 0.2, 0.7), 2.5)

	# 底盤（圓角方形近似）
	var rect: Rect2 = Rect2(Vector2(-HERO_HALF, -HERO_HALF),
					  Vector2(HERO_HALF * 2, HERO_HALF * 2))
	draw_rect(rect, Color(0, 0, 0, 0.35))
	draw_rect(rect.grow(-2), body_color)

	# ROAD 武將：顯示 "R" 標記
	if is_on_road:
		draw_string(ThemeDB.fallback_font,
			Vector2(HERO_HALF - 10, -HERO_HALF + 12), "R",
			HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 0.5, 0.9))

	# 名字（取前兩字）
	var short_name: String = hero_name.left(2) if hero_name.length() > 0 else "?"
	draw_string(ThemeDB.fallback_font,
		Vector2(-10, 7), short_name,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color.WHITE)

	# HP 條
	var bar_w: float = float(HERO_HALF * 2)
	var bar_x: float = float(-HERO_HALF)
	var bar_y: float = float(-HERO_HALF - 8)
	var ratio: float = current_hp / max_hp
	draw_rect(Rect2(bar_x, bar_y, bar_w, 5), Color(0.2, 0.2, 0.2, 0.8))
	draw_rect(Rect2(bar_x, bar_y, bar_w * ratio, 5), Color(0.2, 0.9, 0.2, 1))

	# 選取邊框
	if _is_selected:
		draw_rect(rect, Color(1.0, 0.9, 0.2, 1.0), false, 2.5)

# ═══════════════════════════════════════════
#  查詢
# ═══════════════════════════════════════════
func get_cell() -> Vector2i:
	return grid_cell

func get_attack_range_px() -> float:
	return attack_range * TILE_SIZE

func reposition(new_cell: Vector2i, world_pos: Vector2, game_map: Node) -> void:
	grid_cell = new_cell
	position = world_pos
	is_on_road = (game_map.get_tile_type(new_cell) == game_map.TileType.ROAD)
	queue_redraw()
