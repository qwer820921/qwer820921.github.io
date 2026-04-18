## Tower.gd
## 防禦塔：弓兵 / 步兵 / 砲兵
## 可用戰鬥金幣升級（最高 5 級），不持久化

class_name Tower
extends Node2D

# ── Signals ───────────────────────────────────────────────────
signal tower_clicked(tower: Node)
signal upgrade_requested(tower: Node, cost: int)

# ── 職業常數 ──────────────────────────────────────────────────
enum TowerType { ARCHER, INFANTRY, ARTILLERY }

const TOWER_CONFIGS: Dictionary = {
	"archer": {
		"type":        TowerType.ARCHER,
		"name":        "弓兵塔",
		"atk":         30.0,
		"atk_spd":     0.80,
		"range":       2.5,
		"cost":        50,
		"upgrade_base": 50,
		"color":       Color(0.20, 0.65, 0.20, 1),
		"aoe":         false,
		"image":       "tower_archer.webp",
	},
	"infantry": {
		"type":        TowerType.INFANTRY,
		"name":        "步兵塔",
		"atk":         20.0,
		"atk_spd":     1.50,
		"range":       1.5,
		"cost":        70,
		"upgrade_base": 60,
		"color":       Color(0.60, 0.20, 0.20, 1),
		"aoe":         false,
		"slow_mult":   0.55,
		"image":       "tower_infantry.webp",
	},
	"artillery": {
		"type":        TowerType.ARTILLERY,
		"name":        "砲兵塔",
		"atk":         80.0,
		"atk_spd":     3.00,
		"range":       2.0,
		"cost":        100,
		"upgrade_base": 80,
		"color":       Color(0.60, 0.45, 0.10, 1),
		"aoe":         true,
		"aoe_radius":  80.0,
		"image":       "tower_artillery.webp",
	},
}

# ── 實例屬性 ──────────────────────────────────────────────────
var tower_type_key: String = "archer"
var tower_level: int       = 1
var atk: float             = 30.0
var atk_spd: float         = 0.80
var range_tiles: float     = 2.5
var upgrade_cost_base: int = 50
var is_aoe: bool           = false
var aoe_radius: float      = 0.0
var slow_mult: float       = 1.0       # < 1.0 表示有緩速
var body_color: Color      = Color.GREEN
var tower_name: String     = "弓兵塔"

var grid_cell: Vector2i    = Vector2i.ZERO
var tile_size: int         = 48
var _texture: Texture2D    = null
var tower_w: int           = 34
var tower_h: int           = 34

# ── 內部狀態 ──────────────────────────────────────────────────
var _atk_timer: float      = 0.0
var _wave_mgr: Node        = null
var _is_selected: bool     = false
var _is_attacking: bool    = false  # 用於攻擊動畫閃光

# ═══════════════════════════════════════════
#  初始化
# ═══════════════════════════════════════════
func setup(type_key: String, cell: Vector2i, wave_mgr: Node) -> void:
	tower_type_key = type_key
	grid_cell      = cell
	_wave_mgr      = wave_mgr

	var cfg: Dictionary = TOWER_CONFIGS.get(type_key, TOWER_CONFIGS["archer"])
	atk              = float(cfg["atk"])
	atk_spd          = float(cfg["atk_spd"])
	range_tiles      = float(cfg["range"])
	upgrade_cost_base = int(cfg["upgrade_base"])
	is_aoe           = bool(cfg.get("aoe", false))
	aoe_radius       = float(cfg.get("aoe_radius", 0.0))
	slow_mult        = float(cfg.get("slow_mult", 1.0))
	body_color       = cfg["color"]
	tower_name       = str(cfg["name"])
	tower_w = max(20, int(tile_size * 0.75))
	tower_h = tower_w
	var img_name: String = str(cfg.get("image", ""))
	if img_name != "":
		var path: String = "res://assets/" + img_name
		if ResourceLoader.exists(path):
			_texture = load(path) as Texture2D
	queue_redraw()

# ═══════════════════════════════════════════
#  _process — 自動攻擊
# ═══════════════════════════════════════════
func _process(delta: float) -> void:
	_atk_timer -= delta
	if _is_attacking:
		_is_attacking = false
		queue_redraw()

	if _atk_timer > 0.0 or not _wave_mgr:
		return

	# 步兵塔：對範圍內所有敵人施加緩速（每幀）
	if slow_mult < 1.0 and tower_type_key == "infantry":
		_apply_slow_aura()

	var range_px: float = range_tiles * tile_size
	var enemies: Array = _wave_mgr.get_active_enemies()
	var target: Node = _find_target(enemies, range_px)
	if target == null:
		return

	if is_aoe:
		_attack_aoe(target, enemies)
	else:
		target.take_damage(atk)

	_is_attacking = true
	_atk_timer    = atk_spd
	queue_redraw()

func _find_target(enemies: Array, range_px: float) -> Node:
	# 選進度最靠近基地的敵人
	var best: Node         = null
	var best_prog: float   = -1.0
	for e in enemies:
		if not is_instance_valid(e) or e.is_dead():
			continue
		var dist: float = global_position.distance_to(e.global_position)
		if dist <= range_px and e.get_progress_ratio() > best_prog:
			best_prog = e.get_progress_ratio()
			best = e
	return best

func _attack_aoe(primary: Node, all_enemies: Array) -> void:
	for e in all_enemies:
		if not is_instance_valid(e) or e.is_dead():
			continue
		if primary.global_position.distance_to(e.global_position) <= aoe_radius:
			e.take_damage(atk)

func _apply_slow_aura() -> void:
	if not _wave_mgr:
		return
	var range_px: float = range_tiles * tile_size
	for e in _wave_mgr.get_active_enemies():
		if is_instance_valid(e) and not e.is_dead():
			var dist: float = global_position.distance_to(e.global_position)
			if dist <= range_px:
				e.apply_slow(slow_mult, 0.2)

# ═══════════════════════════════════════════
#  升級
# ═══════════════════════════════════════════
func get_upgrade_cost() -> int:
	if tower_level >= 5:
		return 0   # 最高級
	return upgrade_cost_base * tower_level

func can_upgrade() -> bool:
	return tower_level < 5

func apply_upgrade() -> void:
	tower_level   += 1
	atk           *= 1.20       # 攻擊力 +20%
	atk_spd       *= 0.92       # 攻速提升（間隔縮短 8%）
	range_tiles   += 0.20       # 射程 +0.2 格
	queue_redraw()

func request_upgrade() -> void:
	var cost: int = get_upgrade_cost()
	if cost > 0:
		upgrade_requested.emit(self, cost)

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
	var half_w: float = tower_w / 2.0
	var half_h: float = tower_h / 2.0
	var body_rect: Rect2 = Rect2(Vector2(-half_w, -half_h), Vector2(tower_w, tower_h))
	var flash: bool = _is_attacking

	# 射程圈（選中時顯示）
	if _is_selected:
		draw_circle(Vector2.ZERO, range_tiles * tile_size, Color(1.0, 0.0, 0.0, 0.3))
		draw_arc(Vector2.ZERO, range_tiles * tile_size, 0, TAU, 48, Color(1.0, 0.2, 0.2, 0.7), 2.5)

	# 塔身
	if _texture != null:
		draw_texture_rect(_texture, body_rect, false)
		if flash:
			draw_rect(body_rect, Color(1.0, 1.0, 1.0, 0.5))
	else:
		draw_rect(Rect2(Vector2(-half_w, -half_h) + Vector2(2, 2),
					Vector2(tower_w, tower_h)), Color(0, 0, 0, 0.35))
		draw_rect(body_rect, Color.WHITE if flash else body_color)
		draw_rect(Rect2(Vector2(-half_w, -half_h), Vector2(tower_w, 8)),
			(body_color if flash else body_color.darkened(0.3)))
		var short: String = tower_name.left(2)
		draw_string(ThemeDB.fallback_font,
			Vector2(-10, 8), short,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 13,
			Color(0, 0, 0, 1) if flash else Color.WHITE)

	# 等級圓點（貼圖與純色共用）
	for i in range(tower_level):
		draw_circle(Vector2(-half_w + 6 + i * 8, half_h - 7), 3, Color.WHITE)

	# 選取邊框（貼圖與純色共用）
	if _is_selected:
		draw_rect(body_rect, Color(1.0, 0.9, 0.2, 1.0), false, 2.5)

# ═══════════════════════════════════════════
#  查詢
# ═══════════════════════════════════════════
func get_cell() -> Vector2i:
	return grid_cell

func get_level() -> int:
	return tower_level

func reposition(new_cell: Vector2i, world_pos: Vector2) -> void:
	grid_cell = new_cell
	position = world_pos
	queue_redraw()
