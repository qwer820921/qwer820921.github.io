## WaveManager.gd
## 波次生成器：讀取 waves 陣列，在正確時機從正確路線生成敵人

class_name WaveManager
extends Node

signal enemy_spawned(enemy: Node)
signal wave_all_spawned(wave_num: int)
signal wave_cleared(wave_num: int) # 新增：當波次所有敵人都死亡或進入基地時觸發

# ── 外部引用 ──────────────────────────────────────────────────
var _game_map: Node = null
var _units_layer: Node = null
var _enemies_config: Array = []
var _enemy_scene: PackedScene = null

# ── 波次資料 ──────────────────────────────────────────────────
# waves: Array of { wave: int, enemies: [{ enemy_id, count, interval, path }] }
var _waves_data: Array = []
var _tile_size: int = 48
var _active_enemies: Array = []
var _current_wave_num: int = 0
var _is_stopping: bool = false
var _active_spawning_groups: int = 0

# ── 初始化 ────────────────────────────────────────────────────
func setup(waves: Array, enemies_config: Array, game_map: Node, units_layer: Node, enemy_scene: PackedScene, tile_size: int = 48) -> void:
	_waves_data     = waves
	_enemies_config = enemies_config
	_game_map       = game_map
	_units_layer    = units_layer
	_enemy_scene    = enemy_scene
	_tile_size      = tile_size
	_is_stopping    = false

func stop_all() -> void:
	_is_stopping = true
	_active_enemies.clear()
	_active_spawning_groups = 0

# ── 啟動指定波次 ──────────────────────────────────────────────
func start_wave(wave_num: int) -> void:
	_is_stopping = false
	_current_wave_num = wave_num
	_active_spawning_groups = 0

	# 找到符合此波次的所有敵人組
	var wave_obj: Dictionary = {}
	for w in _waves_data:
		if int(w.get("wave", 0)) == wave_num:
			wave_obj = w
			break

	if wave_obj.is_empty():
		push_warning("[WaveManager] 找不到波次 %d 資料" % wave_num)
		return

	var enemy_groups: Array = wave_obj.get("enemies", [])
	if enemy_groups.is_empty():
		push_warning("[WaveManager] 波次 %d 無敵人組" % wave_num)
		return

	# 每組敵人用獨立 coroutine 生成（並行）
	for group in enemy_groups:
		_active_spawning_groups += 1
		_spawn_group(group)

# ── 生成單個敵人組（coroutine）────────────────────────────────
func _spawn_group(group: Dictionary) -> void:
	var enemy_id: String = group.get("enemy_id", "")
	var count: int       = int(group.get("count", 1))
	var interval: float  = float(group.get("interval", 1.0))
	var path_id: String  = group.get("path", "path_a")

	# 找到敵人設定資料
	var enemy_cfg: Dictionary = {}
	for cfg in _enemies_config:
		if cfg.get("enemy_id", "") == enemy_id:
			enemy_cfg = cfg
			break
	
	if enemy_cfg.is_empty():
		push_error("[WaveManager] 找不到敵人設定 ID: %s。請檢查 Google Sheet 設定。" % enemy_id)
		_active_spawning_groups -= 1
		if _active_spawning_groups <= 0:
			wave_all_spawned.emit(_current_wave_num)
			_check_wave_finished()
		return

	# 取得路徑
	var waypoints: Array = _game_map.get_waypoints_world(path_id) if _game_map else []
	if waypoints.is_empty():
		push_warning("[WaveManager] 路徑 %s 無路點" % path_id)
		_active_spawning_groups -= 1
		if _active_spawning_groups <= 0:
			wave_all_spawned.emit(_current_wave_num)
			_check_wave_finished()
		return

	for i in range(count):
		var enemy: Node = _create_enemy(enemy_cfg, waypoints)
		if enemy:
			_active_enemies.append(enemy)
			enemy_spawned.emit(enemy)
		if i < count - 1:
			await get_tree().create_timer(interval).timeout
			if _is_stopping:
				return

	_active_spawning_groups -= 1
	if _active_spawning_groups <= 0:
		wave_all_spawned.emit(_current_wave_num)
		_check_wave_finished()

# ── 建立敵人實例 ──────────────────────────────────────────────
func _create_enemy(cfg: Dictionary, waypoints: Array) -> Node:
	if not _enemy_scene:
		push_error("[WaveManager] enemy_scene 未設定")
		return null
	if not _units_layer:
		push_error("[WaveManager] units_layer 未設定")
		return null

	var enemy: Node = _enemy_scene.instantiate()
	_units_layer.add_child(enemy)
	enemy.tile_size = _tile_size
	enemy._game_map = _game_map
	enemy.setup(cfg, waypoints)
	enemy.died.connect(_on_enemy_died)
	enemy.reached_base.connect(_on_enemy_reached_base)
	return enemy

# ── 事件處理 ──────────────────────────────────────────────────
func _on_enemy_died(enemy: Node) -> void:
	_remove_enemy(enemy)

func _on_enemy_reached_base(enemy: Node) -> void:
	_remove_enemy(enemy)

func _remove_enemy(enemy: Node) -> void:
	_active_enemies.erase(enemy)
	_check_wave_finished()

func _check_wave_finished() -> void:
	if is_wave_clear():
		wave_cleared.emit(_current_wave_num)

# ── 查詢 ──────────────────────────────────────────────────────
func get_active_enemies() -> Array:
	return _active_enemies

func get_active_enemy_count() -> int:
	return _active_enemies.size()

func is_wave_clear() -> bool:
	# 先清理陣列中的無效節點（預防幽靈敵人）
	var i = _active_enemies.size() - 1
	while i >= 0:
		if not is_instance_valid(_active_enemies[i]):
			_active_enemies.remove_at(i)
		i -= 1
	
	return _active_enemies.is_empty() and _active_spawning_groups <= 0
