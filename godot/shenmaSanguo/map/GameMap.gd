## GameMap.gd
## 解析 path_json→ 管理格子狀態、渲染地圖、提供座標轉換

class_name GameMap
extends Node2D

# ── 格子類型 ──────────────────────────────────────────────────
enum TileType { EMPTY, ROAD, BUILD, OBSTACLE, BASE, SPAWN }

# ── 尺寸設定 ──────────────────────────────────────────────────
const TILE_SIZE: int    = 64
const BOTTOM_UI_H: int  = 130   # 底部 UI 高度（留空給 BattleHUD）
const MAP_PADDING: int  = 1     # 地圖四周格子邊距

# ── 顏色 ──────────────────────────────────────────────────────
const COLOR_BG: Color       = Color(0.12, 0.22, 0.08, 1)   # 深綠草地（背景）
const COLOR_EMPTY: Color    = Color(0.12, 0.20, 0.10, 1)   # 暗綠色（背景草地）
const COLOR_ROAD: Color     = Color(0.40, 0.38, 0.35, 1)   # 淺灰色（水泥路）
const COLOR_BUILD: Color    = Color(0.35, 0.60, 0.30, 1)   # 亮綠色（建築區，極其顯眼）
const COLOR_OBSTACLE: Color = Color(0.15, 0.12, 0.08, 1)   # 深棕障礙物
const COLOR_BASE: Color     = Color(0.60, 0.10, 0.10, 1)   # 深紅基地
const COLOR_SPAWN: Color    = Color(0.50, 0.32, 0.05, 1)   # 橘棕生成點
const COLOR_GRID: Color     = Color(0.0, 0.0, 0.0, 0.12)   # 格線
const COLOR_HL_OK: Color    = Color(0.2, 0.8, 0.3, 0.45)   # 可放置高亮
const COLOR_HL_NO: Color    = Color(0.9, 0.2, 0.2, 0.45)   # 不可放置高亮

# ── 地圖資料 ──────────────────────────────────────────────────
var _grid: Dictionary       = {}   # Vector2i → TileType
var _occupied: Dictionary   = {}   # Vector2i → Node（佔用者）
var _paths: Dictionary      = {}   # path_id → Array[Vector2i] waypoints
var _spawn_points: Dictionary = {} # path_id → Vector2i
var _base_pos: Vector2i     = Vector2i.ZERO
var _map_cols: int          = 0
var _map_rows: int          = 0
var _map_offset: Vector2    = Vector2.ZERO

# ── 高亮 ──────────────────────────────────────────────────────
var _hl_cell: Vector2i = Vector2i(-99, -99)
var _hl_valid: bool    = false

signal map_ready()

# ═══════════════════════════════════════════
#  初始化
# ═══════════════════════════════════════════
func setup(path_json: Dictionary) -> void:
	_parse_path_json(path_json)
	_compute_map_size()
	_center_map()
	queue_redraw()
	map_ready.emit()

func _parse_path_json(pj: Dictionary) -> void:
	# --- paths ---
	for path_data in pj.get("paths", []):
		var pid: String = str(path_data.get("id", "path_a"))
		var wps: Array[Vector2i] = []
		for wp in path_data.get("waypoints", []):
			wps.append(Vector2i(int(wp[0]), int(wp[1])))
		_paths[pid] = wps
		# 將路徑每一段插值為格子
		for i in range(wps.size() - 1):
			_fill_segment(wps[i], wps[i + 1], TileType.ROAD)
		if not wps.is_empty():
			_grid[wps[-1]] = TileType.ROAD

	# --- spawn ---
	for sp in pj.get("spawn", []):
		var pid: String = str(sp.get("path", "path_a"))
		var pos_arr: Array = sp.get("pos", [0, 0])
		var pos: Vector2i = Vector2i(int(pos_arr[0]), int(pos_arr[1]))
		_spawn_points[pid] = pos
		_grid[pos] = TileType.SPAWN

	# --- base ---
	var base_arr: Array = pj.get("base", [0, 0])
	_base_pos    = Vector2i(int(base_arr[0]), int(base_arr[1]))
	_grid[_base_pos] = TileType.BASE

	# --- build_zones ---
	for bz in pj.get("build_zones", []):
		var bpos: Vector2i = Vector2i(int(bz[0]), int(bz[1]))
		if not _grid.has(bpos):   # 不覆蓋 ROAD / BASE / SPAWN
			_grid[bpos] = TileType.BUILD

func _fill_segment(from: Vector2i, to: Vector2i, type: TileType) -> void:
	var dc: int = sign(to.x - from.x)
	var dr: int = sign(to.y - from.y)
	var cur: Vector2i = from
	while cur != to:
		_grid[cur] = type
		cur += Vector2i(dc, dr)

func _compute_map_size() -> void:
	var max_c: int = 0
	var max_r: int = 0
	for pos: Vector2i in _grid:
		if pos.x > max_c: max_c = pos.x
		if pos.y > max_r: max_r = pos.y
	_map_cols = max_c + MAP_PADDING + 2
	_map_rows = max_r + MAP_PADDING + 2

func _center_map() -> void:
	var vp: Vector2     = get_viewport_rect().size
	var avail_h: float = vp.y - float(BOTTOM_UI_H)
	var map_w: float   = _map_cols * TILE_SIZE
	var map_h: float   = _map_rows * TILE_SIZE
	_map_offset = Vector2(
		(vp.x - map_w) * 0.5,
		(avail_h - map_h) * 0.5
	)

# ═══════════════════════════════════════════
#  繪製
# ═══════════════════════════════════════════
func _draw() -> void:
	var vp: Vector2 = get_viewport_rect().size
	# 背景
	draw_rect(Rect2(Vector2.ZERO, vp), COLOR_BG)

	# 繪製每個格子
	for col in range(_map_cols):
		for row in range(_map_rows):
			var cell: Vector2i = Vector2i(col, row)
			var color: Color = _tile_color(cell)
			var rect: Rect2  = Rect2(
				_map_offset + Vector2(col * TILE_SIZE, row * TILE_SIZE),
				Vector2(TILE_SIZE - 1, TILE_SIZE - 1)
			)
			draw_rect(rect, color)
			# 路標文字
			_draw_tile_icon(rect, cell)

	# 格線
	for col in range(_map_cols + 1):
		var x: float = _map_offset.x + col * TILE_SIZE
		draw_line(Vector2(x, _map_offset.y),
				  Vector2(x, _map_offset.y + _map_rows * TILE_SIZE),
				  COLOR_GRID, 1.0)
	for row in range(_map_rows + 1):
		var y: float = _map_offset.y + row * TILE_SIZE
		draw_line(Vector2(_map_offset.x, y),
				  Vector2(_map_offset.x + _map_cols * TILE_SIZE, y),
				  COLOR_GRID, 1.0)

	# 高亮
	if _hl_cell.x >= 0:
		var hl_rect: Rect2 = Rect2(
			_map_offset + Vector2(_hl_cell.x * TILE_SIZE, _hl_cell.y * TILE_SIZE),
			Vector2(TILE_SIZE, TILE_SIZE)
		)
		draw_rect(hl_rect, COLOR_HL_OK if _hl_valid else COLOR_HL_NO)

func _tile_color(cell: Vector2i) -> Color:
	match _grid.get(cell, TileType.EMPTY):
		TileType.ROAD:     return COLOR_ROAD
		TileType.BUILD:    return COLOR_BUILD
		TileType.OBSTACLE: return COLOR_OBSTACLE
		TileType.BASE:     return COLOR_BASE
		TileType.SPAWN:    return COLOR_SPAWN
		_:                 return COLOR_EMPTY

func _draw_tile_icon(rect: Rect2, cell: Vector2i) -> void:
	match _grid.get(cell, TileType.EMPTY):
		TileType.BASE:
			draw_string(ThemeDB.fallback_font,
				rect.position + Vector2(6, TILE_SIZE - 8),
				"⚔", HORIZONTAL_ALIGNMENT_LEFT, -1, 20, Color.WHITE)
		TileType.SPAWN:
			draw_string(ThemeDB.fallback_font,
				rect.position + Vector2(6, TILE_SIZE - 8),
				"▶", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color.WHITE)

# ═══════════════════════════════════════════
#  座標轉換
# ═══════════════════════════════════════════
func grid_to_world(cell: Vector2i) -> Vector2:
	return _map_offset + Vector2(
		cell.x * TILE_SIZE + TILE_SIZE * 0.5,
		cell.y * TILE_SIZE + TILE_SIZE * 0.5
	)

func world_to_grid(world_pos: Vector2) -> Vector2i:
	var local: Vector2 = world_pos - _map_offset
	return Vector2i(int(local.x / TILE_SIZE), int(local.y / TILE_SIZE))

func is_valid_cell(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < _map_cols and cell.y < _map_rows

func get_tile_type(cell: Vector2i) -> TileType:
	return _grid.get(cell, TileType.EMPTY)

func get_tile_size() -> int:
	return TILE_SIZE

func get_map_offset() -> Vector2:
	return _map_offset

# ═══════════════════════════════════════════
#  放置邏輯
# ═══════════════════════════════════════════
func can_place_hero(cell: Vector2i) -> bool:
	var t: GameMap.TileType = get_tile_type(cell)
	return (t == TileType.ROAD or t == TileType.BUILD) and not _occupied.has(cell)

func can_place_tower(cell: Vector2i) -> bool:
	return get_tile_type(cell) == TileType.BUILD and not _occupied.has(cell)

func set_occupied(cell: Vector2i, node: Node) -> void:
	_occupied[cell] = node

func clear_occupied(cell: Vector2i) -> void:
	_occupied.erase(cell)

func get_occupant(cell: Vector2i) -> Node:
	return _occupied.get(cell, null)

func is_occupied(cell: Vector2i) -> bool:
	return _occupied.has(cell)

# ═══════════════════════════════════════════
#  路徑查詢
# ═══════════════════════════════════════════
func get_waypoints_world(path_id: String) -> Array:
	var result: Array = []
	for wp: Vector2i in _paths.get(path_id, []):
		result.append(grid_to_world(wp))
	return result

func get_path_ids() -> Array:
	return _paths.keys()

func get_spawn_world(path_id: String) -> Vector2:
	if _spawn_points.has(path_id):
		return grid_to_world(_spawn_points[path_id])
	return Vector2.ZERO

func get_base_world() -> Vector2:
	return grid_to_world(_base_pos)

# ═══════════════════════════════════════════
#  高亮
# ═══════════════════════════════════════════
func highlight_cell(cell: Vector2i, valid: bool) -> void:
	_hl_cell  = cell
	_hl_valid = valid
	queue_redraw()

func clear_highlight() -> void:
	_hl_cell = Vector2i(-99, -99)
	queue_redraw()

func highlight_valid_cells(_drag_type: int) -> void:
	# 暫時留空以防止 Crash
	pass
