## WaveManager.gd
## 波次生成器：讀取 waves 陣列，在正確時機從正確路線生成敵人

class_name WaveManager
extends Node

signal enemy_spawned(enemy: Node)
signal wave_all_spawned(wave_num: int)
signal wave_cleared(wave_num: int) # 新增：當波次所有敵人都死亡或進入基地時觸發
signal enemy_killed(enemy: Node)   # 目前關卡的敵人被擊殺（先於清波判定發出）
signal enemy_leaked(enemy: Node)   # 目前關卡的敵人抵達基地（先於清波判定發出）

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
var _cleared_wave_num: int = 0     # 已發出 wave_cleared 的波次，避免同一波重複通知
var _active_spawning_groups: int = 0

# ── 生命週期世代 ──────────────────────────────────────────────
# 每次 setup / stop_all 都換新世代（只增不減、不重用）。
# 出兵 coroutine 與敵人都記住自己建立時的世代；世代不符代表屬於已結束的關卡，
# 不得再生成敵人、修改計數或發出信號。
var _generation: int = 0
## 這一場已生成的敵人數：新敵人的生成序號（Enemy.spawn_seq），每次 setup／stop_all 從 0 重新計算
var _spawn_count: int = 0

# ── 初始化 ────────────────────────────────────────────────────
func setup(waves: Array, enemies_config: Array, game_map: Node, units_layer: Node, enemy_scene: PackedScene, tile_size: int = 48) -> void:
	_begin_new_generation()
	_waves_data     = waves
	_enemies_config = enemies_config
	_game_map       = game_map
	_units_layer    = units_layer
	_enemy_scene    = enemy_scene
	_tile_size      = tile_size

func stop_all() -> void:
	_begin_new_generation()

func _begin_new_generation() -> void:
	_generation += 1
	_spawn_count = 0
	_active_enemies.clear()
	_active_spawning_groups = 0
	_current_wave_num = 0
	_cleared_wave_num = 0
	_last_plan_report = {}

## 敵人是否屬於目前關卡（舊關卡殘留的敵人一律回傳 false）
func owns_enemy(enemy: Node) -> bool:
	return is_instance_valid(enemy) and int(enemy.get_meta("wave_gen", -1)) == _generation

func get_generation() -> int:
	return _generation

func get_spawning_group_count() -> int:
	return _active_spawning_groups

# ── 規劃與啟動波次 ────────────────────────────────────────────
## 飛行路線的最短長度（像素）：起點到終點的直線距離不超過這個值，就視為同一個位置（飛行敵人一出現就在終點）。
## 只用來擋掉「起點和終點是同一格」這類設定；相鄰兩格這種短但非零的路線照常出兵
const FLIGHT_MIN_LEN: float = 0.001

## 最近一次 plan_wave 的結果說明：{wave, missing（沒有這一波的資料）, skipped: [{index, enemy_id, path, reason}]}。
## index 是這一組在波次清單裡的位置（從 1 開始，包含空白列）；reason：
## enemy_not_found（找不到敵人設定）、path_empty（路線沒有路點）、flight_single_point（飛行路線只有一個路點）、
## flight_same_endpoints（飛行路線的起點和終點相同）、count_invalid（數量 ≤ 0）。
## 拒絕開戰時交給 Web 顯示原因；只有關卡設定，沒有玩家資料
var _last_plan_report: Dictionary = {}

func get_last_plan_report() -> Dictionary:
	return _last_plan_report.duplicate(true)

## 回傳此波「確定能生成敵人」的組：敵人設定、路徑、飛行路線、數量都在生成前先驗證完。
## 無效的組輸出警告後略過；回傳空陣列代表這一波沒有任何敵人可生成，呼叫端必須拒絕開戰。
func plan_wave(wave_num: int) -> Array:
	_last_plan_report = {"wave": wave_num, "missing": false, "skipped": []}
	var wave_obj: Dictionary = {}
	for w in _waves_data:
		if int(w.get("wave", 0)) == wave_num:
			wave_obj = w
			break
	if wave_obj.is_empty():
		push_warning("[WaveManager] 找不到波次 %d 資料" % wave_num)
		_last_plan_report["missing"] = true
		return []
	if not _enemy_scene or not _units_layer or not _game_map:
		push_warning("[WaveManager] 尚未完成 setup，無法生成波次 %d" % wave_num)
		return []

	var plans: Array = []
	var index: int = 0
	for g in wave_obj.get("enemies", []):
		index += 1
		var enemy_id: String = str(g.get("enemy_id", "")).strip_edges()
		if enemy_id.is_empty():
			print("[WaveManager] 跳過空白敵人組: ", g)  # GAS 空白列
			continue
		var enemy_cfg: Dictionary = _find_enemy_config(enemy_id)
		var path_id: String = str(g.get("path", "path_a"))
		if enemy_cfg.is_empty():
			push_warning("[WaveManager] 找不到敵人設定 ID: '%s'，跳過此組" % enemy_id)
			_skip(index, enemy_id, path_id, "enemy_not_found")
			continue
		var waypoints: Array = _game_map.get_waypoints_world(path_id)
		if waypoints.is_empty():
			push_warning("[WaveManager] 路徑 %s 無路點，跳過此組" % path_id)
			_skip(index, enemy_id, path_id, "path_empty")
			continue
		# 飛行敵人從路線的起點直線飛到終點：只有一個路點、或起點和終點相同時，一出現就在終點（立刻扣城血），所以不出兵
		var flight_problem: String = _flight_route_problem(enemy_cfg, waypoints)
		if flight_problem != "":
			push_warning("[WaveManager] 飛行敵人組 '%s' 的路線 %s 無效（%s），跳過此組" % [enemy_id, path_id, flight_problem])
			_skip(index, enemy_id, path_id, flight_problem)
			continue
		var count: int = int(g.get("count", 1))
		if count <= 0:
			push_warning("[WaveManager] 敵人組 '%s' 數量為 %d，跳過此組" % [enemy_id, count])
			_skip(index, enemy_id, path_id, "count_invalid")
			continue
		plans.append({
			"cfg": enemy_cfg, "waypoints": waypoints, "count": count,
			"interval": maxf(0.0, float(g.get("interval", 1.0))),
		})
	return plans

func _skip(index: int, enemy_id: String, path_id: String, reason: String) -> void:
	_last_plan_report["skipped"].append({"index": index, "enemy_id": enemy_id, "path": path_id, "reason": reason})

## 飛行組的路線問題（地面組一律回傳空字串，地面的環狀路線照常走）：
## 路點少於 2 個 → flight_single_point；起點到終點的距離 ≤ FLIGHT_MIN_LEN → flight_same_endpoints
func _flight_route_problem(cfg: Dictionary, waypoints: Array) -> String:
	if str(cfg.get("movement_type", "")).strip_edges() != Enemy.MOVE_FLYING:
		return ""
	if waypoints.size() < 2:
		return "flight_single_point"
	if (waypoints[0] as Vector2).distance_to(waypoints[waypoints.size() - 1]) <= FLIGHT_MIN_LEN:
		return "flight_same_endpoints"
	return ""

## 開始一波。plans 必須是 plan_wave() 的結果且不可為空。
## 生成任何敵人之前就先登記所有組，任何一組同步完成都不會讓計數提前歸零；
## 每組恰好完成一次，整波只清一次。
func start_wave(wave_num: int, plans: Array) -> void:
	if plans.is_empty():
		push_error("[WaveManager] 第 %d 波沒有可生成的敵人組，呼叫端應先拒絕開戰" % wave_num)
		return
	var gen: int = _generation
	_current_wave_num = wave_num
	_active_spawning_groups = plans.size()
	for plan in plans:
		# 同步信號回呼可能已經切關（世代改變）：剩下的組屬於舊關卡，不得再生成或改動新世代的計數
		if gen != _generation:
			return
		_spawn_group(plan, gen)

func _find_enemy_config(enemy_id: String) -> Dictionary:
	for cfg in _enemies_config:
		if str(cfg.get("enemy_id", "")) == enemy_id:
			return cfg
	return {}

# ── 生成單個敵人組（coroutine）────────────────────────────────
func _spawn_group(plan: Dictionary, gen: int) -> void:
	var count: int = plan.count
	for i in range(count):
		# await 之後關卡可能已切換／重開：舊世代直接結束，不碰新關卡的任何狀態
		if gen != _generation:
			return
		var enemy: Node = _create_enemy(plan.cfg, plan.waypoints, gen)
		if enemy:
			_active_enemies.append(enemy)
			enemy_spawned.emit(enemy)
		if i < count - 1:
			# 出兵間隔用遊戲計時器：掛在 WaveManager 底下，手動暫停時跟著停住，繼續後只等剩下的時間、不立刻補出
			await BattleManager.create_game_timer(self, plan.interval).timeout

	_finish_group(gen)

func _finish_group(gen: int) -> void:
	if gen != _generation:
		return
	_active_spawning_groups -= 1
	if _active_spawning_groups < 0:
		# 每組只會完成一次；走到這裡代表計數有漏洞，不能當成清波
		push_error("[WaveManager] 第 %d 波的出兵組計數小於 0" % _current_wave_num)
		_active_spawning_groups = 0
		return
	if _active_spawning_groups == 0:
		wave_all_spawned.emit(_current_wave_num)
		_check_wave_finished()

# ── 建立敵人實例 ──────────────────────────────────────────────
func _create_enemy(cfg: Dictionary, waypoints: Array, gen: int) -> Node:
	if not _enemy_scene:
		push_error("[WaveManager] enemy_scene 未設定")
		return null
	if not _units_layer:
		push_error("[WaveManager] units_layer 未設定")
		return null

	var enemy: Node = _enemy_scene.instantiate()
	enemy.set_meta("wave_gen", gen)
	enemy.spawn_seq = _spawn_count
	_spawn_count += 1
	_units_layer.add_child(enemy)
	enemy.tile_size = _tile_size
	enemy._game_map = _game_map
	enemy.setup(cfg, waypoints)
	enemy.died.connect(_on_enemy_died)
	enemy.reached_base.connect(_on_enemy_reached_base)
	return enemy

# ── 事件處理 ──────────────────────────────────────────────────
# 先通知擊殺／漏怪（讓 BattleManager 更新擊殺數與城池血量），再做清波判定，
# 否則最後一隻敵人的擊殺或扣血會在結算之後才到而被忽略
func _on_enemy_died(enemy: Node) -> void:
	if not owns_enemy(enemy):
		return
	enemy_killed.emit(enemy)
	_remove_enemy(enemy)

func _on_enemy_reached_base(enemy: Node) -> void:
	if not owns_enemy(enemy):
		return
	enemy_leaked.emit(enemy)
	_remove_enemy(enemy)

func _remove_enemy(enemy: Node) -> void:
	_active_enemies.erase(enemy)
	_check_wave_finished()

func _check_wave_finished() -> void:
	if _current_wave_num <= 0 or _cleared_wave_num == _current_wave_num:
		return
	if is_wave_clear():
		_cleared_wave_num = _current_wave_num
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
