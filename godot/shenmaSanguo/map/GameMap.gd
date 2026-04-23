## GameMap.gd
## 解析 path_json→ 管理格子狀態、渲染地圖、提供座標轉換

class_name GameMap
extends Node2D

# ── 格子類型 ──────────────────────────────────────────────────
enum TileType { EMPTY, ROAD, BUILD, OBSTACLE, BASE, SPAWN }

# ── 尺寸設定 ──────────────────────────────────────────────────
var tile_size: int      = 48   # min(_tile_w, _tile_h)，供 entity 大小使用
var _tile_w: int        = 48   # 每格寬度（填滿 viewport 寬）
var _tile_h: int        = 48   # 每格高度（填滿 viewport 高）
const TOP_UI_H: int  = 0     # 頂部 UI 高度（已移除留白，地圖置頂）
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
var _json_cols: int         = 0    # 從 path_json 讀取的精確欄數
var _json_rows: int         = 0    # 從 path_json 讀取的精確列數

# ── 高亮 ──────────────────────────────────────────────────────
var _hl_cell: Vector2i = Vector2i(-99, -99)
var _hl_valid: bool    = false

# ── 格子貼圖（cell_textures from path_json）─────────────────
var _cell_textures: Dictionary = {}   # Vector2i → Texture2D
var _bg_texture: Texture2D = null     # viewport 外圍背景貼圖

signal map_ready()

# ═══════════════════════════════════════════
#  初始化
# ═══════════════════════════════════════════
func setup(path_json: Dictionary) -> void:
	_parse_path_json(path_json)
	_compute_map_size()
	_compute_tile_size()
	_center_map()
	_load_textures(path_json)
	queue_redraw()
	map_ready.emit()

func _parse_path_json(pj: Dictionary) -> void:
	_json_cols = int(pj.get("cols", 0))
	_json_rows = int(pj.get("rows", 0))
	
	_paths.clear()
	_spawn_points.clear()

	# 1. 優先處理新版多路徑格式 (paths: { "path_a": [...], "path_b": [...] })
	if pj.has("paths"):
		var pths: Dictionary = pj["paths"]
		for pid in pths:
			var raw_pts: Array = pths[pid]
			var wps: Array[Vector2i] = []
			for wp in raw_pts:
				wps.append(Vector2i(int(wp[0]), int(wp[1])))
			
			_paths[pid] = wps
			
			# 標記格子為 ROAD 並填充路徑
			for i in range(wps.size() - 1):
				_fill_segment(wps[i], wps[i + 1], TileType.ROAD)
			if not wps.is_empty():
				_grid[wps[-1]] = TileType.ROAD
				
			# 設定生成點 (該路徑的第一個點)
			if not wps.is_empty():
				_spawn_points[pid] = wps[0]
				# 標記為 SPAWN (如果還沒被標記)
				if not _grid.has(wps[0]) or _grid[wps[0]] == TileType.ROAD:
					_grid[wps[0]] = TileType.SPAWN

	# 2. 如果沒有 paths 但有 waypoints (舊版相容)
	elif pj.has("waypoints"):
		var pid: String = "path_a"
		var raw_pts: Array = pj["waypoints"]
		var wps: Array[Vector2i] = []
		for wp in raw_pts:
			wps.append(Vector2i(int(wp[0]), int(wp[1])))
		
		_paths[pid] = wps
		for i in range(wps.size() - 1):
			_fill_segment(wps[i], wps[i + 1], TileType.ROAD)
		if not wps.is_empty():
			_grid[wps[-1]] = TileType.ROAD
			_spawn_points[pid] = wps[0]
			_grid[wps[0]] = TileType.SPAWN

	# 3. 基地 (由 JSON 明確指定)
	var base_arr: Array = pj.get("base", [0, 0])
	_base_pos = Vector2i(int(base_arr[0]), int(base_arr[1]))
	_grid[_base_pos] = TileType.BASE

	# 4. 建築區 (不覆蓋 ROAD / BASE / SPAWN)
	for bz in pj.get("build_zones", []):
		var bpos: Vector2i = Vector2i(int(bz[0]), int(bz[1]))
		if not _grid.has(bpos):
			_grid[bpos] = TileType.BUILD

	# 5. 障礙物 (不覆蓋 ROAD / BASE / SPAWN)
	for ob in pj.get("obstacles", []):
		var opos: Vector2i = Vector2i(int(ob[0]), int(ob[1]))
		if not _grid.has(opos):
			_grid[opos] = TileType.OBSTACLE

func _fill_segment(from: Vector2i, to: Vector2i, type: TileType) -> void:
	var dc: int = sign(to.x - from.x)
	var dr: int = sign(to.y - from.y)
	var cur: Vector2i = from
	while cur != to:
		_grid[cur] = type
		cur += Vector2i(dc, dr)

func _load_textures(pj: Dictionary) -> void:
	_cell_textures.clear()
	_bg_texture = null
	var bg_name: String = str(pj.get("background_texture", ""))
	if bg_name != "":
		var bg_path: String = "res://assets/" + bg_name
		var tex = load(bg_path) as Texture2D
		if tex:
			_bg_texture = tex
	var raw: Dictionary = pj.get("cell_textures", {})
	for key: String in raw:
		var parts: PackedStringArray = key.split(",")
		if parts.size() != 2:
			continue
		var cell: Vector2i = Vector2i(int(parts[0]), int(parts[1]))
		var img_name: String = str(raw[key])
		var path: String = "res://assets/" + img_name
		if not img_name.contains("/"):
			path = "res://assets/tiles/" + img_name
		
		var tex = load(path) as Texture2D
		if tex:
			_cell_textures[cell] = tex

func _compute_tile_size() -> void:
	var vp: Vector2    = get_viewport_rect().size
	var avail_h: float = vp.y - float(TOP_UI_H)
	# 正方形格子：取寬/高方向能放下的最小格子尺寸
	tile_size = max(16, min(
		int(vp.x    / max(1, _map_cols)),
		int(avail_h / max(1, _map_rows))
	))
	_tile_w = tile_size
	_tile_h = tile_size

func _compute_map_size() -> void:
	if _json_cols > 0 and _json_rows > 0:
		_map_cols = _json_cols
		_map_rows = _json_rows
		return
	# fallback：從格子座標推算
	var max_c: int = 0
	var max_r: int = 0
	for pos: Vector2i in _grid:
		if pos.x > max_c: max_c = pos.x
		if pos.y > max_r: max_r = pos.y
	_map_cols = max_c + MAP_PADDING + 2
	_map_rows = max_r + MAP_PADDING + 2

func _center_map() -> void:
	var vp: Vector2  = get_viewport_rect().size
	var map_w: float = _map_cols * _tile_w
	_map_offset = Vector2(
		(vp.x - map_w) * 0.5,
		float(TOP_UI_H)
	)

# ═══════════════════════════════════════════
#  繪製
# ═══════════════════════════════════════════
func _draw() -> void:
	var vp: Vector2 = get_viewport_rect().size
	# 背景：依據視窗寬度等比例縮放，若下方有空隙則向下平鋪
	if _bg_texture != null:
		var tex_size: Vector2 = _bg_texture.get_size()
		if tex_size.x > 0 and tex_size.y > 0:
			var scale_factor: float = vp.x / tex_size.x
			var scaled_w: float = vp.x
			var scaled_h: float = tex_size.y * scale_factor
			
			var draw_y: float = 0.0
			while draw_y < vp.y:
				draw_texture_rect(_bg_texture, Rect2(0, draw_y, scaled_w, scaled_h), false)
				draw_y += scaled_h
	else:
		draw_rect(Rect2(Vector2.ZERO, vp), COLOR_BG)

	# 繪製每個格子（用 _tile_w/_tile_h 確保與座標轉換函式一致）
	for col in range(_map_cols):
		for row in range(_map_rows):
			var cell: Vector2i = Vector2i(col, row)
			var rect: Rect2 = Rect2(
				_map_offset + Vector2(col * _tile_w, row * _tile_h),
				Vector2(_tile_w, _tile_h)
			)
			var cell_tex: Texture2D = _cell_textures.get(cell, null)
			if cell_tex != null:
				draw_texture_rect(cell_tex, rect, false)
			else:
				draw_rect(rect, _tile_color(cell))
			_draw_tile_icon(rect, cell)

	# 高亮
	if _hl_cell.x >= 0:
		var hl_rect: Rect2 = Rect2(
			_map_offset + Vector2(_hl_cell.x * _tile_w, _hl_cell.y * _tile_h),
			Vector2(_tile_w, _tile_h)
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
	var fs: int = max(10, int(rect.size.y) - 30)
	match _grid.get(cell, TileType.EMPTY):
		TileType.BASE:
			draw_string(ThemeDB.fallback_font,
				rect.position + Vector2(4, rect.size.y - 4),
				"⚔", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.WHITE)
		TileType.SPAWN:
			draw_string(ThemeDB.fallback_font,
				rect.position + Vector2(4, rect.size.y - 4),
				"▶", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.WHITE)

# ═══════════════════════════════════════════
#  座標轉換
# ═══════════════════════════════════════════
func grid_to_world(cell: Vector2i) -> Vector2:
	return _map_offset + Vector2(
		cell.x * _tile_w + _tile_w * 0.5,
		cell.y * _tile_h + _tile_h * 0.5
	)

func world_to_grid(world_pos: Vector2) -> Vector2i:
	var local: Vector2 = world_pos - _map_offset
	return Vector2i(int(local.x / _tile_w), int(local.y / _tile_h))

func is_valid_cell(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < _map_cols and cell.y < _map_rows

func get_tile_type(cell: Vector2i) -> TileType:
	return _grid.get(cell, TileType.EMPTY)

func get_tile_size() -> int:
	return tile_size

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
