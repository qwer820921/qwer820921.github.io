## Hero.gd
## 武將：放置於 ROAD 或 BUILD，自動攻擊範圍內敵人
## ROAD 上：攻擊最近敵人並施加緩速（模擬阻擋）
## BUILD 上：攻擊最近敵人（不阻擋）

class_name Hero
extends Node2D

# ── Signals ───────────────────────────────────────────────────
signal hero_clicked(hero: Node)
signal hero_died(hero: Node)

# ── 武將屬性（由外部 setup 傳入） ────────────────────────────
var hero_id: String       = ""
var hero_name: String     = "武將"
var hero_level: int       = 1
var atk: float            = 100.0
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
var _texture: Texture2D   = null
var _texture_atk: Texture2D = null
var _is_attacking: bool   = false
var _anim_timer: float    = 0.0
var tile_size: int        = 48
var hero_half: int        = 16
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
	hero_half  = max(10, int(tile_size * 0.46))  # 不超過格子邊界（< tile_size/2）

	# 取得當前等級 (用於計算成長)
	hero_level = int(state.get("level", 1))

	# 從 heroes_config 取得靜態屬性
	for cfg in heroes_config:
		if cfg.get("hero_id", "") == hero_id:
			hero_name    = str(cfg.get("name", hero_id))
			
			# 基礎屬性
			var base_range: float = float(cfg.get("attack_range", 2.0))
			var base_spd: float   = float(cfg.get("attack_speed", 1.0))
			
			# 成長係數
			var range_growth: float = float(cfg.get("range_growth", 0.0))
			var spd_growth: float   = float(cfg.get("atk_spd_growth", 0.0))
			
			# 計算最終屬性：屬性 = 基礎 + (等級-1) * 成長
			attack_range = base_range + (hero_level - 1) * range_growth
			
			# 攻速計算：縮短攻擊間隔 (間隔 = 基礎 * (1 - (等級-1) * 成長))，最快不超過 0.1s
			attack_speed = max(0.1, base_spd * (1.0 - (hero_level - 1) * spd_growth))
			
			match str(cfg.get("job", "")):
				"infantry":
					body_color = Color(0.65, 0.20, 0.20, 1)
				"archer":
					body_color = Color(0.20, 0.65, 0.20, 1)
				"artillery":
					body_color = Color(0.65, 0.50, 0.10, 1)
				_:
					body_color = Color(0.20, 0.40, 0.80, 1)
			var img_name: String = str(cfg.get("image", ""))
			if img_name != "":
				var path: String = "res://assets/units/" + img_name
				if ResourceLoader.exists(path):
					_texture = load(path) as Texture2D

				# 優先從 config 讀取 attack_image，或動態搜尋 _atk.webp / _attack.webp
				var atk_img_name: String = str(cfg.get("attack_image", ""))
				if atk_img_name != "":
					var atk_path: String = "res://assets/units/" + atk_img_name
					if ResourceLoader.exists(atk_path):
						_texture_atk = load(atk_path) as Texture2D
				
				if _texture_atk == null:
					# 嘗試尋找 _atk.webp
					var atk_path: String = path.replace(".webp", "_atk.webp")
					if ResourceLoader.exists(atk_path):
						_texture_atk = load(atk_path) as Texture2D
					else:
						# 嘗試尋找 _attack.webp
						atk_path = path.replace(".webp", "_attack.webp")
						if ResourceLoader.exists(atk_path):
							_texture_atk = load(atk_path) as Texture2D
			break

	queue_redraw()

var def_stat: float = 50.0

# ═══════════════════════════════════════════
#  _process — 自動攻擊
# ═══════════════════════════════════════════
func _process(delta: float) -> void:
	_atk_timer -= delta
	
	if _anim_timer > 0.0:
		_anim_timer -= delta
		if _anim_timer <= 0.0:
			_is_attacking = false
			queue_redraw()

	if _atk_timer > 0.0:
		return
	if not _wave_mgr:
		return

	var range_px: float = attack_range * tile_size
	var enemies: Array = _wave_mgr.get_active_enemies()
	var target: Node = _find_target(enemies, range_px)
	if target == null:
		# 清除所有減速
		_clear_all_slows(enemies)
		return

	# 攻擊
	target.take_damage(atk)
	_is_attacking = true
	_anim_timer   = 0.22
	_atk_timer    = attack_speed
	queue_redraw()

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
	if current_hp <= 0.0:
		return

	var actual_dmg: float = amount * (1.0 - def_stat / (def_stat + 100.0))
	current_hp -= actual_dmg
	
	# 顯示傷害數字 (深紅色代表英雄受傷)
	var ft = load("res://ui/FloatingText.gd").new()
	get_parent().add_child(ft)
	ft.setup("%.0f" % actual_dmg, Color(1.0, 0.2, 0.2), global_position)
	
	if current_hp <= 0.0:
		current_hp = 0.0
		hero_died.emit(self)
		queue_free()
	else:
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
	var rect: Rect2 = Rect2(Vector2(-hero_half, -hero_half),
					  Vector2(hero_half * 2, hero_half * 2))

	# 射程圈（選中時顯示）
	if _is_selected:
		draw_circle(Vector2.ZERO, attack_range * tile_size, Color(1.0, 0.0, 0.0, 0.3))
		draw_arc(Vector2.ZERO, attack_range * tile_size, 0, TAU, 48, Color(1.0, 0.2, 0.2, 0.7), 2.5)

	# 身體
	var current_tex = _texture_atk if (_is_attacking and _texture_atk) else _texture
	if current_tex != null:
		draw_texture_rect(current_tex, rect, false)
		if _is_attacking and not _texture_atk:
			# 如果沒有攻擊貼圖，則使用原本的白光閃爍效果
			draw_rect(rect, Color(1.0, 1.0, 1.0, 0.45))
		# ROAD 標記疊加在貼圖上
		if is_on_road:
			draw_rect(Rect2(Vector2(hero_half - 12, -hero_half), Vector2(12, 12)),
				Color(0.0, 0.0, 0.0, 0.55))
			draw_string(ThemeDB.fallback_font,
				Vector2(hero_half - 11, -hero_half + 10), "R",
				HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 0.5, 1.0))
	else:
		draw_rect(rect, Color(0, 0, 0, 0.35))
		draw_rect(rect.grow(-2), body_color)
		if is_on_road:
			draw_string(ThemeDB.fallback_font,
				Vector2(hero_half - 10, -hero_half + 12), "R",
				HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color(1, 1, 0.5, 0.9))
		var short_name: String = hero_name.left(2) if hero_name.length() > 0 else "?"
		draw_string(ThemeDB.fallback_font,
			Vector2(-10, 7), short_name,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color.WHITE)

	# HP 條（貼圖與純色共用）
	var bar_w: float = float(hero_half * 2)
	var bar_x: float = float(-hero_half)
	var bar_y: float = float(-hero_half - 8)
	var ratio: float = current_hp / max_hp
	draw_rect(Rect2(bar_x, bar_y, bar_w, 5), Color(0.2, 0.2, 0.2, 0.8))
	draw_rect(Rect2(bar_x, bar_y, bar_w * ratio, 5), Color(0.2, 0.9, 0.2, 1))

	# 選取邊框（貼圖與純色共用）
	if _is_selected:
		draw_rect(rect, Color(1.0, 0.9, 0.2, 1.0), false, 2.5)

# ═══════════════════════════════════════════
#  查詢
# ═══════════════════════════════════════════
func get_cell() -> Vector2i:
	return grid_cell

func get_attack_range_px() -> float:
	return attack_range * tile_size

func reposition(new_cell: Vector2i, world_pos: Vector2, game_map: Node) -> void:
	grid_cell = new_cell
	position = world_pos
	is_on_road = (game_map.get_tile_type(new_cell) == game_map.TileType.ROAD)
	queue_redraw()
