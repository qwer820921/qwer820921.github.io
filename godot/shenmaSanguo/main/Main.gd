## Main.gd
## 神馬三國塔防遊戲主控器
## 負責：接收 Web payload → 初始化各系統 → 協調遊戲流程 → 回傳結算

extends Node2D

# ── 子節點引用 ────────────────────────────────────────────────
@onready var web_bridge:     Node         = $WebBridge
@onready var game_map:       Node2D       = $GameMap
@onready var units_layer:    Node2D       = $UnitsLayer
@onready var wave_manager:   Node         = $WaveManager
@onready var battle_manager: Node         = $BattleManager
@onready var battle_hud:     CanvasLayer  = $BattleHUD
@onready var drag_ghost:     Node2D       = $DragLayer/DragGhost

# ── 預載場景 ──────────────────────────────────────────────────
const ENEMY_SCENE: PackedScene = preload("res://entities/enemy/Enemy.tscn")
const HERO_SCENE: PackedScene  = preload("res://entities/hero/Hero.tscn")
const TOWER_SCENE: PackedScene = preload("res://entities/tower/Tower.tscn")

# ── 遊戲資料（從 payload 取得）────────────────────────────────
var _payload: Dictionary     = {}
var _team_list: Array        = []
var _heroes_config: Array    = []
var _enemies_config: Array   = []
var _waves: Array            = []

# ── 拖曳狀態 ─────────────────────────────────────────────────
enum DragType { NONE, HERO, TOWER }
var _drag_type: int          = DragType.NONE
var _drag_hero_data: Dictionary = {}
var _drag_tower_type: String = ""
var _is_dragging: bool       = false
var _pressed_unit: Node      = null   # 等待拖曳閾值判斷（PREP 點擊）
var _press_pos: Vector2      = Vector2.ZERO
const DRAG_THRESHOLD: float  = 8.0

# ── 已放置的武將（避免同一英雄放多次）────────────────────────
var _tile_size: int            = 48    # 從 GameMap 取得，傳給 Entity
var _placed_heroes: Dictionary = {}   # hero_id → Hero node
var _selected_unit: Node       = null  # 選中的塔/武將
## 防禦塔識別碼的流水號（只增不減、不重用）：Web 的目標優先命令用它確認是同一座塔
var _tower_seq: int             = 0
var _moving_unit: Node         = null  # 正在重新佈置的單位
var _game_time: float          = 0.0   # 累計遊戲時間（受 time_scale 影響、手動暫停時不前進），供測試快照比對計時器

# ═══════════════════════════════════════════
#  _ready
# ═══════════════════════════════════════════
func _ready() -> void:
	# WebBridge signals
	web_bridge.payload_received.connect(_on_payload_received)
	web_bridge.start_battle_requested.connect(_on_start_btn_pressed)
	web_bridge.auto_toggle_requested.connect(_on_auto_btn_pressed)
	web_bridge.move_unit_requested.connect(_on_web_move_unit)
	web_bridge.deselect_unit_requested.connect(_deselect_unit)
	web_bridge.upgrade_unit_requested.connect(_on_web_upgrade_unit)
	web_bridge.debug_snapshot_requested.connect(_on_debug_snapshot_requested)


	# BattleHUD signals
	battle_hud.start_btn_pressed.connect(_on_start_btn_pressed)
	battle_hud.auto_btn_pressed.connect(_on_auto_btn_pressed)
	battle_hud.drag_hero_started.connect(_on_drag_hero_started)
	battle_hud.drag_tower_started.connect(_on_drag_tower_started)
	battle_hud.upgrade_panel_closed.connect(_on_upgrade_panel_closed)
	battle_hud.unit_move_requested.connect(_on_unit_move_requested)

	# BattleManager signals
	battle_manager.state_changed.connect(_on_state_changed)
	battle_manager.base_hp_changed.connect(_on_base_hp_changed)
	battle_manager.battle_gold_changed.connect(_on_battle_gold_changed)
	battle_manager.wave_changed.connect(_on_wave_changed)
	battle_manager.battle_ended.connect(_on_battle_ended)
	battle_manager.pause_changed.connect(_on_pause_changed)
	battle_manager.wave_start_rejected.connect(_on_wave_start_rejected)

	# WaveManager signals（只會收到目前關卡世代的敵人事件）
	wave_manager.enemy_killed.connect(_on_enemy_killed)
	wave_manager.enemy_leaked.connect(_on_enemy_leaked)
	wave_manager.wave_cleared.connect(_on_wave_cleared) # 使用新信號

	# 告訴網頁端：Godot 已準備就緒
	web_bridge.send_ready()

	# 非 Web 平台：提供測試用假 payload
	if OS.get_name() != "Web":
		_inject_test_payload()

# ═══════════════════════════════════════════
#  Payload 處理
# ═══════════════════════════════════════════
func _on_payload_received(payload: Dictionary) -> void:
	var type = payload.get("type", "")
	if type == "place_hero":
		_on_web_place_hero(payload)
	elif type == "place_tower":
		_on_web_place_tower(payload)
	elif type == "update_team":
		_team_list = payload.get("team_list", _team_list)
		print("[Main] 隊伍已更新，武將數：", _team_list.size())
		_sync_placed_heroes_stats(_team_list)
		_remove_heroes_not_in_team(_team_list)
	elif type == "set_tower_target":
		_on_web_set_tower_target(payload)
	elif type == "sell_tower":
		_on_web_sell_tower(payload)
	elif type == "resume_game":
		_on_web_close_deploy_menu(payload)
	elif type == "set_game_speed":
		_on_web_set_game_speed(payload)
	elif type == "set_paused":
		_on_web_set_paused(payload)
	elif type == "load_stage" or payload.has("stage_id"):
		# 初始初始化 或 切換關卡
		_do_initial_setup(payload)

func _cleanup_current_stage() -> void:
	print("[Main] 清除當前關卡狀態...")
	# 1. 刪除所有單位節點（先移出場景樹，避免本幀結束前舊敵人繼續移動或發出信號）
	for child in units_layer.get_children():
		units_layer.remove_child(child)
		child.queue_free()
	
	# 2. 清除追蹤狀態
	_placed_heroes.clear()
	_selected_unit = null
	_moving_unit = null
	_is_dragging = false
	_pressed_unit = null
	
	# 3. 停止所有計時器或波次
	wave_manager.stop_all()

func _do_initial_setup(payload: Dictionary) -> void:
	_cleanup_current_stage()
	
	_payload        = payload
	_team_list      = payload.get("team_list", [])
	_heroes_config  = payload.get("heroes_config", [])

	var raw_map: Variant = payload.get("map", {})
	var map_data: Dictionary  = raw_map if raw_map is Dictionary else {}
	var path_json = map_data.get("path_json", {})
	if path_json is String:
		print("[Main] path_json is String, parsing...")
		# 無法解析時當作沒有路線（開戰時每一組都會因為路線沒有路點被略過、拒絕開戰）；用 JSON 物件解析，不另外印引擎錯誤
		var parser := JSON.new()
		path_json = parser.data if parser.parse(path_json) == OK else null

	if not path_json is Dictionary:
		print("[Main] Warning: path_json is not a Dictionary! value:", path_json)
		path_json = {}

	# 關卡資料的波次照原樣使用：沒有波次（空的、不是陣列）時不補任何波次，開戰時 BattleManager 會拒絕第 1 波（wave_rejected），
	# 不會自動勝利，也不會改用內建的測試波次。開發用的內建關卡只在非 Web 平台由 _inject_test_payload 明確送出
	var raw_waves: Variant = map_data.get("waves", [])
	_waves = raw_waves if raw_waves is Array else []
	if _waves.is_empty():
		print("[Main] 關卡資料沒有波次：開戰時會拒絕第 1 波")

	# 取得 enemies_config（若 payload 中有）
	_enemies_config = payload.get("enemies_config", _build_default_enemies())

	var stage_id: String = str(payload.get("stage_id", "chapter1_1"))
	# 這一場的識別碼：update_stats 與結算都會帶回給 Web（不含玩家金鑰）
	var battle_id: String = str(payload.get("battle_id", ""))

	# 初始化地圖
	print("[Main] Setting up game_map with stage_id:", stage_id)
	game_map.setup(path_json)
	_tile_size = game_map.get_tile_size()

	# 初始化 WaveManager
	# 攤平 waves 結構（Wave[] → 直接傳陣列）
	wave_manager.setup(_waves, _enemies_config, game_map, units_layer, ENEMY_SCENE, _tile_size)

	# 初始化 BattleManager
	var total_waves: int = _count_waves(_waves)
	battle_manager.initialize(total_waves, stage_id, wave_manager, web_bridge, battle_id)

	# 音效設定（從 payload 的 sound_settings 欄位讀取）
	var snd: Dictionary = payload.get("sound_settings", {})
	if get_tree() and get_tree().root.has_node("SFXManager"):
		var sfx_mgr = get_tree().root.get_node("SFXManager")
		sfx_mgr.configure(
			bool(snd.get("sfx_enabled", true)),
			str(snd.get("sfx_polyphony", "single"))
		)

	# 初始化 HUD
	battle_hud.setup_heroes(_team_list, _heroes_config)
	battle_hud.update_wave(0, total_waves)
	battle_hud.update_base_hp(20, 20)
	battle_hud.update_gold(500)

	# 顯示進入戰場 splash（用戶點擊後解鎖 AudioContext 並開始 PREP）
	var map_name: String = str(map_data.get("name", "出征"))
	if not battle_hud.splash_dismissed.is_connected(_on_splash_dismissed):
		battle_hud.splash_dismissed.connect(_on_splash_dismissed)
	battle_hud.show_enter_splash(map_name)


## 總波數＝最大的波次編號（不是物件的項目、編號無效的項目不算；見 WaveManager.wave_number）。沒有任何有效波次時是 0
func _count_waves(waves: Array) -> int:
	var max_wave: int = 0
	for w in waves:
		if not (w is Dictionary):
			continue
		var wn: int = WaveManager.wave_number(w)
		if wn > max_wave:
			max_wave = wn
	return max_wave

# ═══════════════════════════════════════════
#  BattleManager signals
# ═══════════════════════════════════════════
func _on_state_changed(state: int) -> void:
	battle_hud.set_game_state(state)

func _on_base_hp_changed(hp: int, max_hp: int) -> void:
	battle_hud.update_base_hp(hp, max_hp)

func _on_battle_gold_changed(gold: int) -> void:
	battle_hud.update_gold(gold)

func _on_wave_changed(current: int, total: int) -> void:
	battle_hud.update_wave(current, total)

func _on_battle_ended(result: Dictionary) -> void:
	battle_hud.show_battle_result(result)

## 拒絕開戰（這一波沒有任何可生成的敵人組）：把這一場的 battle_id 與逐組的原因交給 Web 顯示。
## 原因只有關卡設定（第幾組、enemy_id、路線、原因代碼），沒有玩家資料
func _on_wave_start_rejected(wave_num: int, _reason: String) -> void:
	var report: Dictionary = wave_manager.get_last_plan_report()
	web_bridge.send_wave_rejected({
		"battle_id": battle_manager.battle_id,
		"wave": wave_num,
		"missing": bool(report.get("missing", false)) if int(report.get("wave", -1)) == wave_num else false,
		"skipped": report.get("skipped", []) if int(report.get("wave", -1)) == wave_num else [],
	})

# ═══════════════════════════════════════════
#  按鈕事件
# ═══════════════════════════════════════════
func _on_start_btn_pressed() -> void:
	battle_manager.player_start_battle()

func _on_auto_btn_pressed() -> void:
	battle_manager.toggle_auto_mode()

# ═══════════════════════════════════════════
#  敵人事件：WaveManager → BattleManager
# ═══════════════════════════════════════════
func _on_enemy_killed(_enemy: Node) -> void:
	battle_manager.on_enemy_killed()

func _on_enemy_leaked(_enemy: Node) -> void:
	battle_manager.on_enemy_reached_base()

func _on_wave_cleared(_wave_num: int) -> void:
	battle_manager.on_wave_all_enemies_dead()

# ═══════════════════════════════════════════
#  拖曳放置
# ═══════════════════════════════════════════
func _on_drag_hero_started(hero_data: Dictionary) -> void:
	if _actions_paused():
		return
	_moving_unit     = null
	_drag_type       = DragType.HERO
	_drag_hero_data = hero_data
	_is_dragging    = true
	drag_ghost.start_drag("hero", hero_data.get("hero_id", "?"), Color(0.20, 0.40, 0.80, 0.75))

func _on_drag_tower_started(tower_type: String) -> void:
	if _actions_paused():
		return
	var cfg = Tower.TOWER_CONFIGS.get(tower_type, {})
	var cost: int = int(cfg.get("cost", 50))
	if not battle_manager.can_spend_gold(cost):
		return  # 金幣不足，不允許拖拉

	_moving_unit     = null
	_drag_type       = DragType.TOWER
	_drag_tower_type = tower_type
	_is_dragging     = true
	var colors: Dictionary = { "archer": Color(0.2, 0.65, 0.2, 0.75),
		"infantry": Color(0.6, 0.2, 0.2, 0.75),
		"artillery": Color(0.6, 0.45, 0.1, 0.75) }
	drag_ghost.start_drag("tower", tower_type, colors.get(tower_type, Color.GREEN))
	game_map.highlight_valid_cells(_drag_type)

func _on_unit_move_requested(unit: Node) -> void:
	if battle_manager.game_state != BattleManager.GameState.PREP or _actions_paused():
		return  # 安全檢查：非備戰期間、手動暫停中不可移動

	_moving_unit = unit
	_is_dragging = true
	
	if unit is Hero:
		_drag_type = DragType.HERO
		_drag_hero_data = { "hero_id": unit.hero_id } # 為了 _can_place 檢查
		drag_ghost.start_drag("hero", unit.hero_id, unit.body_color)
	elif unit is Tower:
		_drag_type = DragType.TOWER
		_drag_tower_type = unit.tower_type_key
		drag_ghost.start_drag("tower", unit.tower_type_key, unit.body_color)
		
	game_map.highlight_valid_cells(_drag_type)
	
	# 強制觸發選取狀態與資訊顯示
	_selected_unit = unit
	if unit.has_method("set_selected"):
		unit.set_selected(true)
	
	if unit is Hero:
		battle_hud.show_hero_panel(unit, unit.get_global_transform_with_canvas().origin)
	elif unit is Tower:
		battle_hud.show_upgrade_panel(unit, unit.get_global_transform_with_canvas().origin, battle_manager.can_spend_gold(unit.get_upgrade_cost()))
	
	# 強制更新虛影位置到滑鼠處，並稍微延遲允許放置，避免「秒放」
	drag_ghost.global_position = get_global_mouse_position()
	get_tree().create_timer(0.1).timeout.connect(func(): pass) 

func _on_upgrade_panel_closed() -> void:
	_deselect_unit()

func _unhandled_input(event: InputEvent) -> void:
	# --- 偵測「點擊」地圖上的單位或空地 ---
	# 只有在事件未被 UI 攔截時才會進入這裡
	if not _is_dragging and event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var mouse_pos: Vector2 = get_global_mouse_position()
		var cell: Vector2i = game_map.world_to_grid(mouse_pos)
		if game_map.is_valid_cell(cell):
			var unit: Node = game_map.get_occupant(cell)
			if unit != null:
				if battle_manager.game_state == BattleManager.GameState.PREP:
					# 備戰期：先記錄按下，等移動距離超過閾值再開始拖曳
					_pressed_unit = unit
					_press_pos    = event.position
				else:
					# 戰鬥中：顯示升級面板
					if unit is Hero: _on_hero_clicked(unit)
					elif unit is Tower: _on_tower_clicked(unit)
				get_viewport().set_input_as_handled()
				return
			else:
				# 點擊空地 -> 觸發 Web 彈窗
				var tile_type = game_map.get_tile_type(cell)
				var can_place: bool = false
				var type_name: String = ""
				
				if tile_type == game_map.TileType.ROAD:
					can_place = true
					type_name = "road"
				elif tile_type == game_map.TileType.BUILD:
					can_place = true
					type_name = "build"
				
				if can_place:
					_deselect_unit()
					battle_hud.hide_upgrade_panel()
					# 進入部署選單的暫時慢速，並把螢幕位置傳給 Web 彈出選單
					_open_deploy_menu(cell, type_name, get_viewport().get_mouse_position())
				else:
					# 點擊其他（裝飾、障礙物）-> 僅取消選取
					_deselect_unit()
					battle_hud.hide_upgrade_panel()


func _input(event: InputEvent) -> void:
	# ── PREP 拖曳閾值判斷 ──────────────────────────────────────
	if _pressed_unit != null and not _is_dragging:
		if event is InputEventMouseMotion:
			if event.position.distance_to(_press_pos) > DRAG_THRESHOLD:
				_deselect_unit()
				_on_unit_move_requested(_pressed_unit)
				_pressed_unit = null
			return
		elif event is InputEventMouseButton and not event.pressed:
			# 放開前未超過閾值 → 視為點擊，顯示升級面板
			if _pressed_unit is Hero:
				_on_hero_clicked(_pressed_unit)
			elif _pressed_unit is Tower:
				_on_tower_clicked(_pressed_unit)
			_pressed_unit = null
			get_viewport().set_input_as_handled()
			return

	if not _is_dragging:
		return

	if event is InputEventMouseMotion:
		drag_ghost.update_pos(event.position)
		# world_to_grid 需要世界座標，不可使用螢幕空間的 event.position
		var cell: Vector2i = game_map.world_to_grid(get_global_mouse_position())
		if game_map.is_valid_cell(cell):
			var valid: bool = _is_valid_placement(cell)
			game_map.highlight_cell(cell, valid)
		else:
			game_map.clear_highlight()

	elif event is InputEventMouseButton and not event.pressed:
		# 放開滑鼠 → 嘗試放置
		var cell: Vector2i = game_map.world_to_grid(get_global_mouse_position())
		if game_map.is_valid_cell(cell) and _is_valid_placement(cell):
			_place_unit(cell)
		_end_drag()

func _is_valid_placement(cell: Vector2i) -> bool:
	match _drag_type:
		DragType.HERO:
			# 同一英雄只能放一次 (除非是正在移動該英雄)
			var hid: String = str(_drag_hero_data.get("hero_id", ""))
			if _placed_heroes.has(hid) and _moving_unit == null:
				return false
			return game_map.can_place_hero(cell)
		DragType.TOWER:
			return game_map.can_place_tower(cell)
	return false

func _place_unit(cell: Vector2i) -> void:
	if _actions_paused():
		return  # 暫停時開始的拖曳已被取消；這裡再擋一次，不放置也不移位
	var world_pos: Vector2 = game_map.grid_to_world(cell)
	
	if _moving_unit != null:
		# --- 重新佈置邏輯 ---
		var old_cell: Vector2i = _moving_unit.get_cell()
		game_map.clear_occupied(old_cell) # 釋放舊格子
		
		if _moving_unit is Hero:
			_moving_unit.reposition(cell, world_pos, game_map)
		else:
			_moving_unit.reposition(cell, world_pos)
			
		game_map.set_occupied(cell, _moving_unit) # 佔用新格子
		_moving_unit = null
		return

	match _drag_type:
		DragType.HERO:
			_place_hero(cell, world_pos)
		DragType.TOWER:
			_place_tower(cell, world_pos)

func _place_hero(cell: Vector2i, world_pos: Vector2) -> void:
	var hero: Node = HERO_SCENE.instantiate()
	units_layer.add_child(hero)
	hero.position = world_pos
	hero.tile_size = _tile_size

	var on_road: bool = game_map.get_tile_type(cell) == game_map.TileType.ROAD
	hero.setup(_drag_hero_data, _heroes_config, cell, on_road, wave_manager, battle_manager)
	hero.hero_clicked.connect(_on_hero_clicked)
	hero.hero_died.connect(_on_hero_died)

	game_map.set_occupied(cell, hero)
	_placed_heroes[str(_drag_hero_data.get("hero_id", ""))] = hero
	_sfx("hero_place")

func _place_tower(cell: Vector2i, world_pos: Vector2) -> void:
	# 檢查金幣
	var cfg = Tower.TOWER_CONFIGS.get(_drag_tower_type, {})
	var cost: int = int(cfg.get("cost", 50))
	if not battle_manager.spend_gold(cost):
		return  # 金幣不足

	var tower: Node = TOWER_SCENE.instantiate()
	units_layer.add_child(tower)
	tower.position = world_pos
	tower.tile_size = _tile_size
	tower.setup(_drag_tower_type, cell, wave_manager)
	# 建造費已扣款成功：計入這座塔的投入（拆除時依此返還）
	tower.add_investment(cost)
	_tower_seq += 1
	tower.tower_uid = "tower-%d" % _tower_seq
	tower.tower_clicked.connect(_on_tower_clicked)
	tower.upgrade_requested.connect(_on_upgrade_requested)

	game_map.set_occupied(cell, tower)
	_sfx("tower_place")

func _end_drag() -> void:
	_is_dragging    = false
	_moving_unit    = null
	_pressed_unit   = null
	drag_ghost.end_drag()
	game_map.clear_highlight()

# ═══════════════════════════════════════════
#  選取 & 升級
# ═══════════════════════════════════════════
func _on_hero_died(hero: Node) -> void:
	var hid: String = hero.hero_id
	if _placed_heroes.has(hid):
		_placed_heroes.erase(hid)
	
	var cell: Vector2i = hero.get_cell()
	game_map.clear_occupied(cell)
	
	if _selected_unit == hero:
		_deselect_unit()

func _on_hero_clicked(hero: Node) -> void:
	_deselect_unit()
	_selected_unit = hero
	hero.set_selected(true)
	
	# 取得螢幕位置傳給 Web
	var pos_screen: Vector2 = hero.get_global_transform_with_canvas().origin
	var info: Dictionary = {
		"unit_type": "hero",
		"hero_id": hero.hero_id,
		"name": hero.hero_name,
		"level": hero.hero_level,
		"atk": hero.atk,
		"atk_spd": 1.0 / hero.attack_speed,
		# 攻速光環（曹操「指揮」）的加成：選取當下的有效每秒攻擊次數（1 ÷ 有效攻擊間隔；沒有加成時和 atk_spd 相同，只在戰場，不改存檔）
		"atk_spd_effective": 1.0 / hero.effective_attack_interval(),
		"range": hero.attack_range,
		"hp": hero.current_hp,
		# 防禦：隊伍資料的防禦（def）與受傷時用的有效防禦（def_effective，含防禦光環的加成；只在戰場，不改存檔）
		"def": hero.def_stat,
		"def_effective": hero.effective_def(),
		# 對空：這位武將能不能攻擊飛行敵人（依職業，見 Hero.AIR_JOBS）
		"anti_air": hero.can_hit_air,
		"screen_pos": {"x": pos_screen.x, "y": pos_screen.y},
	}
	# 堅韌（廖化）：選取當下是不是生效（生命比例不高於門檻）與 Godot 實際讀到的門檻、倍率；沒有啟用這個技能的武將不帶這個欄位
	if hero.tenacity_hp_ratio > 0.0:
		info["tenacity"] = {"active": hero.tenacity_on(), "low_hp_ratio": hero.tenacity_hp_ratio, "damage_mult": hero.tenacity_damage_mult,
			"max_hp": hero.max_hp}
	web_bridge.send_show_upgrade_panel(info)

func _on_tower_clicked(tower: Node) -> void:
	_deselect_unit()
	_selected_unit = tower
	tower.set_selected(true)
	
	var pos_screen: Vector2 = tower.get_global_transform_with_canvas().origin
	var cost: int = tower.get_upgrade_cost()
	var can_afford: bool = battle_manager.can_spend_gold(cost)
	
	web_bridge.send_show_upgrade_panel({
		"unit_type": "tower",
		"tower_type": tower.tower_type_key,
		"name": tower.tower_name,
		"level": tower.tower_level,
		"atk": tower.atk,
		"atk_spd": 1.0 / tower.atk_spd,
		"range": tower.range_tiles,
		"upgrade_cost": cost,
		"max_level": (tower.tower_level >= 5),
		"can_afford": can_afford,
		# 目標優先（Round 17）：面板顯示的是這裡的實際狀態；Web 的命令要帶回同一場的 battle_id 與這座塔的識別碼
		"tower_uid": tower.tower_uid,
		"battle_id": battle_manager.battle_id,
		"target_mode": tower.target_mode,
		# 這座塔可以選的目標優先（能對空的塔多了 air_first）：Web 只顯示這裡列出的選項
		"target_modes": tower.get_target_modes(),
		# 備戰拆除（Round 18）：這座塔已實際支付的戰鬥金幣、拆除時返還的金額、目前能不能拆（只有備戰中可以）。
		# Web 的拆除命令要帶回確認時看到的返還金額，和這裡不同（例如確認期間升級了）就不拆
		"invested_gold": tower.invested_gold,
		"sell_refund": tower.get_sell_refund(),
		"can_sell": battle_manager.game_state == BattleManager.GameState.PREP,
		# 對空：這座塔能不能攻擊（文士塔是減速）飛行敵人
		"anti_air": tower.can_hit_air,
		"screen_pos": {"x": pos_screen.x, "y": pos_screen.y},
	})

func _on_upgrade_requested(tower: Node, cost: int) -> void:
	if _actions_paused():
		return
	if battle_manager.spend_gold(cost):
		tower.add_investment(cost)
		tower.apply_upgrade()
		# 重新發送更新後的資訊給 Web
		_on_tower_clicked(tower)

func _deselect_unit() -> void:
	if _selected_unit and is_instance_valid(_selected_unit):
		_selected_unit.set_selected(false)
	_selected_unit = null
	web_bridge.send_hide_upgrade_panel()

# ═══════════════════════════════════════════
#  部署選單的暫時慢速與戰鬥速度
#  倍率一律由 BattleManager 管理（Engine.time_scale 只在那裡寫入），這裡只轉接 Web 的命令
# ═══════════════════════════════════════════
## 玩家點了可部署的空格：進入暫時慢速，通知 Web 彈出選單。click_cell 帶這一場的 battle_id 與選單編號，
## Web 關閉選單時帶回（resume_game），只有同一場、同一個選單的關閉命令能恢復速度。不在備戰或戰鬥中時不開選單
func _open_deploy_menu(cell: Vector2i, type_name: String, pos_screen: Vector2) -> void:
	var menu_id: int = battle_manager.open_deploy_menu()
	if menu_id == 0:
		return
	web_bridge.send_click_cell({
		"cell_x": cell.x,
		"cell_y": cell.y,
		"tile_type": type_name,
		"screen_pos": {"x": pos_screen.x, "y": pos_screen.y},
		"battle_id": battle_manager.battle_id,
		"menu_id": menu_id,
	})

## Web 關閉部署選單（取消、點選單外或戰場留邊、部署完成）：resume_game {battle_id, menu_id}。
## 過期的命令（別場、較早的選單、已經關閉、沒有帶識別）不改倍率
func _on_web_close_deploy_menu(data: Dictionary) -> void:
	var raw: Variant = data.get("menu_id")
	var menu_id: int = 0
	if raw is int or (raw is float and is_equal_approx(raw, floor(raw))):
		menu_id = int(raw)
	battle_manager.close_deploy_menu(str(data.get("battle_id", "")), menu_id)

## Web 選擇戰鬥速度：set_game_speed {battle_id, speed}。只接受這一場、備戰或戰鬥中、數字 1 或 2（見 BattleManager.set_speed）。
## 每個命令都回覆 game_speed_result（成功或原因），帶目前已確認的速度與實際倍率；battle_id 是命令帶來的值，Web 只採用目前這一場的
func _on_web_set_game_speed(data: Dictionary) -> void:
	var bid: String = str(data.get("battle_id", ""))
	var reason: String = battle_manager.set_speed(bid, data.get("speed"))
	var reply: Dictionary = {"battle_id": bid, "ok": reason == "", "speed": battle_manager.speed_pref, "time_scale": battle_manager.effective_time_scale()}
	if reason != "":
		reply["reason"] = reason
	web_bridge.send_game_speed_result(reply)

# ═══════════════════════════════════════════
#  手動暫停／繼續
#  狀態由 BattleManager 記錄（和速度、部署慢速分開），這裡轉接 Web 的命令，並依狀態停掉／恢復模擬用的節點
# ═══════════════════════════════════════════
## 模擬用的節點：敵人／武將／防禦塔／傷害數字（UnitsLayer 底下全部）、出兵計時（WaveManager 底下的遊戲計時器）、
## 自動下一波的計時與戰鬥時間（BattleManager）。暫停時停掉它們的處理，Engine.time_scale 與 SceneTree.paused 都不動：
## 橋接（WebBridge）、Main 的輸入與命令處理、HUD、測試快照照常運作
func _on_pause_changed(paused: bool) -> void:
	var mode: int = Node.PROCESS_MODE_DISABLED if paused else Node.PROCESS_MODE_INHERIT
	for n in [units_layer, wave_manager, battle_manager]:
		n.process_mode = mode
	if paused and (_is_dragging or _pressed_unit != null):
		# 進行中的拖曳（放置、移位）一律取消：暫停時不能部署或移位
		_end_drag()

## 手動暫停中：不能開戰、切自動、部署、移位、升級、拆塔、改目標（Web 也會停用按鈕；這裡是最後一道檢查）
func _actions_paused() -> bool:
	return battle_manager.manual_paused

## Web 暫停或繼續：set_paused {battle_id, paused}。paused 是目標狀態（true 暫停、false 繼續），重送同一個值不改變；
## 只接受這一場、備戰或戰鬥中、布林（見 BattleManager.set_paused）。每個命令都回覆 game_pause_result（成功或原因），
## 帶目前已確認的暫停狀態、玩家選的速度與實際倍率；battle_id 是命令帶來的值，Web 只採用目前這一場的
func _on_web_set_paused(data: Dictionary) -> void:
	var bid: String = str(data.get("battle_id", ""))
	var reason: String = battle_manager.set_paused(bid, data.get("paused"))
	var reply: Dictionary = {"battle_id": bid, "ok": reason == "", "paused": battle_manager.manual_paused, "speed": battle_manager.speed_pref, "time_scale": battle_manager.effective_time_scale()}
	if reason != "":
		reply["reason"] = reason
	web_bridge.send_game_pause_result(reply)

func _on_web_move_unit() -> void:
	if _selected_unit == null or not is_instance_valid(_selected_unit):
		return
	_on_unit_move_requested(_selected_unit)

func _on_web_upgrade_unit() -> void:
	if _selected_unit == null or not is_instance_valid(_selected_unit):
		return
	if not (_selected_unit is Tower) or _actions_paused():
		return
	var tower: Tower = _selected_unit as Tower
	# 已達最高等級：升級費是 0，不能用 0 元再升一級（Round 18 前這裡沒有檢查，會免費升到 Lv6）
	if not tower.can_upgrade():
		return
	var cost: int = tower.get_upgrade_cost()
	if battle_manager.spend_gold(cost):
		# 扣款成功才計入投入；金幣不足（扣款失敗）時不升級、不計入
		tower.add_investment(cost)
		tower.apply_upgrade()
		_on_tower_clicked(tower)  # 重新發送更新後的資訊給 Web

## Web 的目標優先命令：只套用在「這一場、目前選取中的同一座有效防禦塔」。
## 過期的面板（別場、已換選別的單位、塔已移除）、結束後、不認得的模式、武將都不套用，也不拿當下的任意選取物代替。
## 確認套用後把塔的實際模式回傳給面板（tower_target_changed）
func _on_web_set_tower_target(data: Dictionary) -> void:
	var bid: String = str(data.get("battle_id", ""))
	var uid: String = str(data.get("tower_uid", ""))
	var mode: String = str(data.get("mode", ""))
	if bid == "" or bid != battle_manager.battle_id:
		return
	if battle_manager.game_state != BattleManager.GameState.PREP and battle_manager.game_state != BattleManager.GameState.BATTLE:
		return
	if _actions_paused():
		return  # 暫停中不改目標（不回覆，面板維持 Godot 目前的模式）
	if _selected_unit == null or not is_instance_valid(_selected_unit) or not (_selected_unit is Tower):
		return
	var tower: Tower = _selected_unit as Tower
	if uid == "" or tower.tower_uid != uid:
		return
	if not tower.set_target_mode(mode):
		return
	web_bridge.send_tower_target_changed({"battle_id": bid, "tower_uid": uid, "target_mode": tower.target_mode})

## 備戰拆除（Round 18）：Web 送 sell_tower {battle_id, tower_uid, expected_refund}。Godot 是唯一的結算方：
## 只在「這一場、備戰中（PREP）、目前選取中的同一座有效防禦塔、還沒拆、Web 確認時看到的返還金額等於現在的返還金額」時拆除。
## 返還金額一律由這裡依實際投入計算，Web 帶來的金額只用來確認玩家看到的是最新的數字，不拿來付款。
## 拆除在同一個處理裡完成：標記已拆 → 取消選取與拖曳 → 釋放格子 → 移除節點（立即停止攻擊與光環）→ 返還一次。
## 每個命令都回覆 tower_sell_result（成功或原因）；不成功時回覆帶這座塔現在的返還金額與能不能拆，讓 Web 更新面板
func _on_web_sell_tower(data: Dictionary) -> void:
	var bid: String = str(data.get("battle_id", ""))
	var uid: String = str(data.get("tower_uid", ""))
	# JSON 的數字在 Godot 是 float；沒有帶、不是數字或不是整數時當成 -1（一定和現在的返還金額不同，不會拆）
	var raw: Variant = data.get("expected_refund")
	var expected: int = -1
	if raw is int or (raw is float and is_equal_approx(raw, floor(raw))):
		expected = int(raw)
	var tower: Tower = null
	if _selected_unit != null and is_instance_valid(_selected_unit) and _selected_unit is Tower and not _selected_unit.is_queued_for_deletion():
		tower = _selected_unit as Tower
	var same: bool = tower != null and uid != "" and tower.tower_uid == uid
	var reason: String = ""
	if bid == "" or bid != battle_manager.battle_id:
		reason = "stale_battle"
	elif not same:
		reason = "not_selected"
	elif tower.sold:
		reason = "already_sold"
	elif _actions_paused():
		reason = "paused"
	elif battle_manager.game_state != BattleManager.GameState.PREP:
		reason = "not_prep"
	elif expected != tower.get_sell_refund():
		reason = "refund_changed"
	if reason != "":
		# 回覆帶這座塔現在的返還金額與能不能拆（不是這座塔時 refund 是 -1），Web 用它更新面板
		var current: int = tower.get_sell_refund() if same else -1
		web_bridge.send_tower_sell_result({"battle_id": bid, "tower_uid": uid, "ok": false, "reason": reason, "refund": current, "can_sell": battle_manager.game_state == BattleManager.GameState.PREP, "gold": battle_manager.battle_gold})
		return

	var refund: int = tower.get_sell_refund()
	var cell: Vector2i = tower.get_cell()
	tower.sold = true
	if _moving_unit == tower or _pressed_unit == tower:
		_end_drag()
	_deselect_unit()
	game_map.clear_occupied(cell)
	units_layer.remove_child(tower)
	tower.queue_free()
	battle_manager.refund_gold(refund)
	web_bridge.send_tower_sell_result({"battle_id": bid, "tower_uid": uid, "ok": true, "refund": refund, "gold": battle_manager.battle_gold, "cell_x": cell.x, "cell_y": cell.y})

# ── Web 遠端放置處理 ──────────────────────────────────────────
func _on_web_place_hero(data: Dictionary) -> void:
	if _actions_paused():
		print("[Main] Web 部署失敗：手動暫停中")
		return
	var hid: String = str(data.get("hero_id", ""))
	var cell: Vector2i = Vector2i(int(data.get("cell_x", 0)), int(data.get("cell_y", 0)))
	
	# 尋找武將資料
	var hdata: Dictionary = {}
	for h in _team_list:
		if str(h.get("hero_id", "")) == hid:
			hdata = h
			break
	
	if hdata.is_empty():
		print("[Main] Web 放置失敗：找不到武將資料 ", hid)
		return
		
	# 模擬拖曳狀態以復用放置邏輯
	_drag_type = DragType.HERO
	_drag_hero_data = hdata
	
	if _is_valid_placement(cell):
		var world_pos = game_map.grid_to_world(cell)
		_place_hero(cell, world_pos)
		print("[Main] Web 成功部署武將：", hid, " 於 ", cell)
	else:
		print("[Main] Web 部署失敗：位置無效或已重複部署")

func _on_web_place_tower(data: Dictionary) -> void:
	if _actions_paused():
		print("[Main] Web 建造失敗：手動暫停中")
		return
	var type_key: String = str(data.get("tower_type", ""))
	var cell: Vector2i = Vector2i(int(data.get("cell_x", 0)), int(data.get("cell_y", 0)))
	
	# 模擬拖曳狀態以復用放置邏輯
	_drag_type = DragType.TOWER
	_drag_tower_type = type_key
	
	if _is_valid_placement(cell):
		var world_pos = game_map.grid_to_world(cell)
		_place_tower(cell, world_pos)
		print("[Main] Web 成功建造防禦塔：", type_key, " 於 ", cell)
	else:
		print("[Main] Web 建造失敗：位置無效或金幣不足")


# ═══════════════════════════════════════════
#  測試用假 payload（非 Web 環境）
# ═══════════════════════════════════════════
func _inject_test_payload() -> void:
	var test_payload: Dictionary = {
		"stage_id": "chapter1_1",
		"player": { "key": "test", "nickname": "測試者", "level": 1, "gold": 500 },
		"team_list": [
			{ "hero_id": "guan_yu",   "level": 10, "star": 1,
			  "atk": 200.0, "def": 150.0, "hp": 2000.0, "slot": 1 },
			{ "hero_id": "zhou_cang", "level":  8, "star": 0,
			  "atk": 120.0, "def":  80.0, "hp": 1200.0, "slot": 2 },
		],
		"heroes_config": [
			{ "hero_id": "guan_yu",   "name": "關羽", "job": "infantry",
			  "attack_range": 1.5, "attack_speed": 1.2,
			  "base_atk": 150, "base_def": 120, "base_hp": 1500,
			  "rarity": "orange", "cost": 8, "upgrade_cost_base": 100,
			  "atk_growth": 0.08, "def_growth": 0.06, "hp_growth": 0.10,
			  "image": "hero_guan_yu.webp" },
			{ "hero_id": "zhou_cang", "name": "周倉", "job": "infantry",
			  "attack_range": 1.2, "attack_speed": 1.5,
			  "base_atk": 100, "base_def":  70, "base_hp": 900,
			  "rarity": "purple", "cost": 6, "upgrade_cost_base": 70,
			  "atk_growth": 0.07, "def_growth": 0.05, "hp_growth": 0.09,
			  "image": "hero_zhou_cang.webp" },
		],
		"enemies_config": [
			{ "enemy_id": "grunt_lv1",   "name": "步兵LV1", "hp": 150.0, "speed": 80.0,  "image": "enemy_grunt1.webp" },
			{ "enemy_id": "cavalry_lv1", "name": "騎兵LV1", "hp": 200.0, "speed": 160.0, "image": "enemy_cavalry1.webp" },
			{ "enemy_id": "siege_lv1",   "name": "攻城車LV1","hp": 400.0, "speed": 40.0,  "image": "enemy_siege1.webp" },
		],
		"map": {
			"map_id": "chapter1_1",
			"name": "汜水關（雙路）",
			# ─────────────────────────────────────────────────────
			# 地圖 14×11（cols 0-13, rows 0-10）
			#
			# path_a（上路，橘色出生點 [0,2]）：
			#   [0,2] → [6,2] → [6,9] → [13,9]
			#
			# path_b（下路，橘色出生點 [0,7]）：
			#   [0,7] → [4,7] → [4,4] → [10,4] → [10,9] → [13,9]
			#
			# base 終點：[13,9]
			# ─────────────────────────────────────────────────────
			"path_json": JSON.parse_string(r'{"map_id":"chapter1_1","name":"黃巾起義","chapter":1,"unlock_stage":"chapter1_1","cols":14,"rows":11,"paths":{"path_a":[[0,8],[0,8],[1,8],[1,8],[2,8],[2,8],[3,8],[3,8],[4,8],[4,8],[5,8],[5,8],[5,7],[5,7],[5,6],[5,6],[5,5],[5,5],[5,4],[5,4],[5,3],[5,3],[5,2],[5,2],[5,1],[5,1],[6,1],[6,1],[7,1],[7,1],[8,1],[8,1],[9,1],[9,1],[10,1],[10,1],[10,2],[10,2],[10,3],[10,3],[10,4],[10,4],[10,5],[10,5],[11,5],[11,5],[12,5],[12,5],[13,5],[13,5]]},"waypoints":[[0,8],[0,8],[1,8],[1,8],[2,8],[2,8],[3,8],[3,8],[4,8],[4,8],[5,8],[5,8],[5,7],[5,7],[5,6],[5,6],[5,5],[5,5],[5,4],[5,4],[5,3],[5,3],[5,2],[5,2],[5,1],[5,1],[6,1],[6,1],[7,1],[7,1],[8,1],[8,1],[9,1],[9,1],[10,1],[10,1],[10,2],[10,2],[10,3],[10,3],[10,4],[10,4],[10,5],[10,5],[11,5],[11,5],[12,5],[12,5],[13,5],[13,5]],"spawn":[0,8],"base":[13,5],"build_zones":[[4,0],[5,0],[6,0],[7,0],[8,0],[9,0],[10,0],[11,0],[4,1],[11,1],[4,2],[6,2],[7,2],[8,2],[9,2],[11,2],[4,3],[6,3],[9,3],[11,3],[4,4],[6,4],[9,4],[11,4],[4,5],[6,5],[9,5],[4,6],[6,6],[9,6],[10,6],[11,6],[2,7],[3,7],[4,7],[6,7],[6,8],[2,9],[3,9],[4,9],[5,9],[6,9]],"obstacles":[[0,0],[1,0],[2,0],[3,0],[12,0],[13,0],[0,1],[1,1],[2,1],[3,1],[12,1],[13,1],[0,2],[1,2],[2,2],[3,2],[12,2],[13,2],[0,3],[1,3],[2,3],[3,3],[7,3],[8,3],[12,3],[13,3],[0,4],[1,4],[2,4],[3,4],[7,4],[8,4],[12,4],[13,4],[0,5],[1,5],[2,5],[3,5],[7,5],[8,5],[0,6],[1,6],[2,6],[3,6],[7,6],[8,6],[12,6],[13,6],[0,7],[1,7],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],[13,7],[7,8],[8,8],[9,8],[10,8],[11,8],[12,8],[13,8],[0,9],[1,9],[7,9],[8,9],[9,9],[10,9],[11,9],[12,9],[13,9],[0,10],[1,10],[2,10],[3,10],[4,10],[5,10],[6,10],[7,10],[8,10],[9,10],[10,10],[11,10],[12,10],[13,10]],"background_texture":"maps/bg_forest.webp","cell_textures":{"0,0":"tiles/tile_dirt4.webp","1,0":"tiles/tile_dirt1.webp","2,0":"tiles/tile_dirt1.webp","3,0":"tiles/tile_dirt2.webp","4,0":"tiles/tile_grass1.webp","5,0":"tiles/tile_grass1.webp","6,0":"tiles/tile_grass1.webp","7,0":"tiles/tile_grass1.webp","8,0":"tiles/tile_grass1.webp","9,0":"tiles/tile_grass1.webp","10,0":"tiles/tile_grass1.webp","11,0":"tiles/tile_grass1.webp","12,0":"tiles/tile_dirt1.webp","13,0":"tiles/tile_dirt1.webp","0,1":"tiles/tile_dirt4.webp","1,1":"tiles/tile_dirt1.webp","2,1":"tiles/tile_dirt1.webp","3,1":"tiles/tile_dirt2.webp","4,1":"tiles/tile_grass1.webp","5,1":"tiles/tile_stone.webp","6,1":"tiles/tile_stone.webp","7,1":"tiles/tile_stone.webp","8,1":"tiles/tile_stone.webp","9,1":"tiles/tile_stone.webp","10,1":"tiles/tile_stone.webp","11,1":"tiles/tile_grass1.webp","12,1":"tiles/tile_dirt1.webp","13,1":"tiles/tile_dirt1.webp","0,2":"tiles/tile_dirt4.webp","1,2":"tiles/tile_dirt1.webp","2,2":"tiles/tile_dirt1.webp","3,2":"tiles/tile_dirt6.webp","4,2":"tiles/tile_grass1.webp","5,2":"tiles/tile_stone.webp","6,2":"tiles/tile_grass1.webp","7,2":"tiles/tile_grass1.webp","8,2":"tiles/tile_grass1.webp","9,2":"tiles/tile_grass1.webp","10,2":"tiles/tile_stone.webp","11,2":"tiles/tile_grass1.webp","12,2":"tiles/tile_dirt1.webp","13,2":"tiles/tile_dirt1.webp","0,3":"tiles/tile_dirt4.webp","1,3":"tiles/tile_dirt1.webp","2,3":"tiles/tile_dirt1.webp","3,3":"tiles/tile_dirt2.webp","4,3":"tiles/tile_grass1.webp","5,3":"tiles/tile_stone.webp","6,3":"tiles/tile_grass1.webp","7,3":"tiles/tile_dirt3.webp","8,3":"tiles/tile_dirt3.webp","9,3":"tiles/tile_grass1.webp","10,3":"tiles/tile_stone.webp","11,3":"tiles/tile_grass1.webp","12,3":"tiles/tile_dirt1.webp","13,3":"tiles/tile_dirt1.webp","0,4":"tiles/tile_dirt4.webp","1,4":"tiles/tile_dirt1.webp","2,4":"tiles/tile_dirt1.webp","3,4":"tiles/tile_dirt2.webp","4,4":"tiles/tile_grass1.webp","5,4":"tiles/tile_stone.webp","6,4":"tiles/tile_grass1.webp","7,4":"tiles/tile_dirt1.webp","8,4":"tiles/tile_dirt1.webp","9,4":"tiles/tile_grass1.webp","10,4":"tiles/tile_stone.webp","11,4":"tiles/tile_grass1.webp","12,4":"tiles/tile_dirt3.webp","13,4":"tiles/tile_dirt1.webp","0,5":"tiles/tile_dirt4.webp","1,5":"tiles/tile_dirt1.webp","2,5":"tiles/tile_dirt1.webp","3,5":"tiles/tile_dirt6.webp","4,5":"tiles/tile_grass1.webp","5,5":"tiles/tile_stone.webp","6,5":"tiles/tile_grass1.webp","7,5":"tiles/tile_dirt1.webp","8,5":"tiles/tile_dirt3.webp","9,5":"tiles/tile_grass1.webp","10,5":"tiles/tile_stone.webp","11,5":"tiles/tile_stone.webp","12,5":"tiles/tile_stone.webp","13,5":"tiles/tile_fortress.webp","0,6":"tiles/tile_dirt4.webp","1,6":"tiles/tile_dirt1.webp","2,6":"tiles/tile_dirt1.webp","3,6":"tiles/tile_dirt6.webp","4,6":"tiles/tile_grass1.webp","5,6":"tiles/tile_stone.webp","6,6":"tiles/tile_grass1.webp","7,6":"tiles/tile_dirt1.webp","8,6":"tiles/tile_dirt3.webp","9,6":"tiles/tile_grass1.webp","10,6":"tiles/tile_grass1.webp","11,6":"tiles/tile_grass1.webp","12,6":"tiles/tile_dirt3.webp","13,6":"tiles/tile_dirt1.webp","0,7":"tiles/tile_dirt4.webp","1,7":"tiles/tile_dirt3.webp","2,7":"tiles/tile_grass1.webp","3,7":"tiles/tile_grass1.webp","4,7":"tiles/tile_grass1.webp","5,7":"tiles/tile_stone.webp","6,7":"tiles/tile_grass1.webp","7,7":"tiles/tile_dirt1.webp","8,7":"tiles/tile_dirt1.webp","9,7":"tiles/tile_dirt1.webp","10,7":"tiles/tile_dirt6.webp","11,7":"tiles/tile_dirt6.webp","12,7":"tiles/tile_dirt1.webp","13,7":"tiles/tile_dirt1.webp","0,8":"tiles/tile_stone.webp","1,8":"tiles/tile_stone.webp","2,8":"tiles/tile_stone.webp","3,8":"tiles/tile_stone.webp","4,8":"tiles/tile_stone.webp","5,8":"tiles/tile_stone.webp","6,8":"tiles/tile_grass1.webp","7,8":"tiles/tile_dirt1.webp","8,8":"tiles/tile_dirt1.webp","9,8":"tiles/tile_dirt1.webp","10,8":"tiles/tile_dirt1.webp","11,8":"tiles/tile_dirt1.webp","12,8":"tiles/tile_dirt1.webp","13,8":"tiles/tile_dirt1.webp","0,9":"tiles/tile_dirt1.webp","1,9":"tiles/tile_dirt3.webp","2,9":"tiles/tile_grass1.webp","3,9":"tiles/tile_grass1.webp","4,9":"tiles/tile_grass1.webp","5,9":"tiles/tile_grass1.webp","6,9":"tiles/tile_grass1.webp","7,9":"tiles/tile_dirt1.webp","8,9":"tiles/tile_dirt1.webp","9,9":"tiles/tile_dirt1.webp","10,9":"tiles/tile_dirt1.webp","11,9":"tiles/tile_dirt1.webp","12,9":"tiles/tile_dirt1.webp","13,9":"tiles/tile_dirt1.webp","0,10":"tiles/tile_dirt1.webp","1,10":"tiles/tile_dirt1.webp","2,10":"tiles/tile_dirt1.webp","3,10":"tiles/tile_dirt1.webp","4,10":"tiles/tile_dirt1.webp","5,10":"tiles/tile_dirt1.webp","6,10":"tiles/tile_dirt1.webp","7,10":"tiles/tile_dirt1.webp","8,10":"tiles/tile_dirt1.webp","9,10":"tiles/tile_dirt1.webp","10,10":"tiles/tile_dirt1.webp","11,10":"tiles/tile_dirt1.webp","12,10":"tiles/tile_dirt1.webp","13,10":"tiles/tile_dirt1.webp"}}'),
			
			"waves": [
				# 波次 1 ── path_a 步兵、path_b 騎兵（同時衝鋒）
				{ "wave": 1, "enemies": [
					{ "enemy_id": "grunt_lv1",   "count": 5, "interval": 1.0, "path": "path_a" },
					{ "enemy_id": "cavalry_lv1", "count": 3, "interval": 1.5, "path": "path_b" }
				]},
				# 波次 2 ── 兩條路都有步兵
				{ "wave": 2, "enemies": [
					{ "enemy_id": "grunt_lv1",   "count": 6, "interval": 0.8, "path": "path_a" },
					{ "enemy_id": "grunt_lv1",   "count": 6, "interval": 0.8, "path": "path_b" }
				]},
				# 波次 3 ── path_a 攻城車、path_b 騎兵急速衝
				{ "wave": 3, "enemies": [
					{ "enemy_id": "siege_lv1",   "count": 2, "interval": 3.0, "path": "path_a" },
					{ "enemy_id": "cavalry_lv1", "count": 5, "interval": 1.0, "path": "path_b" }
				]},
			]
		}
	}
	# 延遲 0.5 秒模擬網路延遲後注入
	await get_tree().create_timer(0.5).timeout
	_on_payload_received(test_payload)

# ═══════════════════════════════════════════
#  測試用唯讀快照（Web 送 debug_snapshot → 回傳目前狀態，不改變任何遊戲狀態）
# ═══════════════════════════════════════════
func _process(delta: float) -> void:
	# 手動暫停時遊戲時間不前進（Main 本身不停：它要處理輸入與命令）
	if not battle_manager.manual_paused:
		_game_time += delta

func _on_debug_snapshot_requested(request_id: String) -> void:
	# 依 enemy_id 統計仍在場上的敵人節點；另外列出每個敵人目前的血量（測試用來算每一擊的實際傷害）
	var enemy_nodes: Dictionary = {}
	var enemy_hp: Dictionary = {}
	# 灼燒中的敵人（周瑜「火攻」）：剩餘跳數與每跳傷害
	var enemy_burn: Dictionary = {}
	# 每個敵人的種類（測試用來對照防禦塔實際打中的是哪一種敵人）；每座防禦塔目前的目標優先
	var enemy_kind: Dictionary = {}
	var tower_targets: Dictionary = {}
	var enemy_pos: Dictionary = {}
	var enemy_seq: Dictionary = {}
	# 飛行敵人：每個敵人的移動方式、到終點的剩餘路程（格；地面沿路線、飛行直線）
	var enemy_move: Dictionary = {}
	var enemy_remaining: Dictionary = {}
	# 文士塔的疊加減速：每個敵人目前的減速量（0 表示沒有）；測試用來看文士塔減速的是哪一個敵人
	var enemy_slow: Dictionary = {}
	# 每個敵人攻擊阻路武將的次數（包括被閃避的）；場上還在顯示的「MISS」數（閃避提示）
	var enemy_blocker_attacks: Dictionary = {}
	var dodge_texts: int = 0
	# 場上還在顯示的吸血恢復提示（綠色的「+恢復量」）
	var heal_texts: Array = []
	# 場上還在顯示的反擊反彈傷害數字（洋紅色）
	var counter_texts: Array = []
	# 每個敵人 Godot 實際套用的對武將攻擊力（enemies_config 的 atk 或預設 20）、是否免疫減速、目前的減速倍率（1 表示沒有被武將或步兵塔減速）
	var enemy_atk: Dictionary = {}
	var enemy_immune: Dictionary = {}
	var enemy_speed_mult: Dictionary = {}
	# 每個敵人的倍率減速來源（來源 → {mult, left}）、實際移動速度（像素／秒，不含時間倍率）、是不是正在攻擊阻路的武將（攻擊圖片）
	var enemy_slow_src: Dictionary = {}
	var enemy_speed: Dictionary = {}
	var enemy_fighting: Dictionary = {}
	# 暈眩（張飛）：每個敵人的剩餘時間、生效次數、自己的時間與暈眩區間、攻擊阻路武將的時間
	var enemy_stun: Dictionary = {}
	for child in units_layer.get_children():
		if child is Enemy and not child.is_queued_for_deletion():
			enemy_stun[str(child.get_instance_id())] = child.stun_state()
			enemy_slow_src[str(child.get_instance_id())] = child.slow_sources_state()
			enemy_speed[str(child.get_instance_id())] = child.get_effective_speed()
			enemy_fighting[str(child.get_instance_id())] = child.is_fighting_blocker()
			enemy_atk[str(child.get_instance_id())] = child.blocker_atk
			enemy_immune[str(child.get_instance_id())] = child.immune_slow
			enemy_speed_mult[str(child.get_instance_id())] = child.speed_mult
			var eid: String = child.enemy_id
			enemy_nodes[eid] = int(enemy_nodes.get(eid, 0)) + 1
			enemy_hp[str(child.get_instance_id())] = child.current_hp
			if child.is_burning():
				enemy_burn[str(child.get_instance_id())] = child.burn_state()
			enemy_kind[str(child.get_instance_id())] = eid
			enemy_pos[str(child.get_instance_id())] = [child.position.x, child.position.y]
			enemy_seq[str(child.get_instance_id())] = child.spawn_seq
			enemy_move[str(child.get_instance_id())] = child.movement_type
			enemy_remaining[str(child.get_instance_id())] = child.get_remaining_distance() / float(child.tile_size)
			enemy_slow[str(child.get_instance_id())] = child._stack_slow_amount
			enemy_blocker_attacks[str(child.get_instance_id())] = child.blocker_attacks
		elif child is FloatingText and not child.is_queued_for_deletion() and child._label != null and child._label.text == "MISS":
			dodge_texts += 1
		elif child is FloatingText and not child.is_queued_for_deletion() and child._label != null and child._label.text.begins_with("+"):
			heal_texts.append(child._label.text)
		elif child is FloatingText and not child.is_queued_for_deletion() and child._label != null and child._label.get_theme_color("font_color").is_equal_approx(Enemy.COUNTER_COLOR):
			counter_texts.append(child._label.text)
		elif child is Tower and not child.is_queued_for_deletion():
			# screen：塔在畫面上的位置（和升級面板定位用的是同一套座標），測試用來點選塔
			var sp: Vector2 = child.get_global_transform_with_canvas().origin
			# cell、invested、refund（Round 18）：塔所在的格子、已實際支付的戰鬥金幣、拆除時的返還金額
			tower_targets[child.tower_uid] = {"type": child.tower_type_key, "mode": child.target_mode, "modes": child.get_target_modes(), "level": child.tower_level, "screen": {"x": sp.x, "y": sp.y}, "cell": [child.grid_cell.x, child.grid_cell.y], "invested": child.invested_gold, "refund": child.get_sell_refund(), "air": child.can_hit_air, "slow_source": child.slow_source}
	# 每位武將目前的有效射程（格），以及到每個敵人的距離（格）：測試用來量射程技能（百步穿楊）
	var hero_ranges: Dictionary = {}
	var hero_enemy_dist: Dictionary = {}
	# 橫掃（未綁定任何正式武將的技能原型，出征資料帶 sweep 時才啟用）：Godot 實際讀到的參數（沒有啟用時不列出）、橫掃次數與打到的副目標數、目前還在顯示的範圍效果數
	var hero_sweep: Dictionary = {}
	# 對空：每位武將能不能攻擊飛行敵人
	var hero_air: Dictionary = {}
	# 閃避（趙雲）：Godot 實際讀到的機率（沒有啟用時不列出）、判定次數（＝受到的有效攻擊）、閃避次數、最近幾次的抽樣值與結果、目前血量
	var hero_dodge: Dictionary = {}
	# 每位武將目前的血量（測試用來核對敵人攻擊阻路武將的實際傷害）
	var hero_hp: Dictionary = {}
	# 每位武將的減速：光環的倍率與半徑、目前影響的敵人、道路阻擋目前減速的敵人與兩個來源的識別字串
	var hero_slow: Dictionary = {}
	# 每位武將的防禦：原本與受傷時用的防禦、受到的防禦光環加成與來源；自己的防禦光環（倍率、半徑、是否作用、目前加成的武將）
	var hero_def: Dictionary = {}
	# 暈眩（張飛）：Godot 實際讀到的暈眩時間（沒有啟用時不列出）與讓敵人暈眩的次數
	var hero_stun: Dictionary = {}
	# 吸血（魏延）：Godot 實際讀到的比例（沒有啟用時不列出）、實際恢復的次數與總量、目前與最大生命、最近幾次命中的實際傷害與恢復量
	var hero_lifesteal: Dictionary = {}
	# 每位武將的攻擊間隔：目前等級的間隔、受到的攻速加成與來源、有效間隔、攻擊次數與最近的攻擊紀錄；自己的攻速光環（曹操）
	var hero_atk_speed: Dictionary = {}
	# 反擊（夏侯惇）：Godot 實際讀到的比例（沒有啟用時不列出）、反彈的次數、反彈的總量、攻擊者實際被扣掉的總量、目前與最大生命、
	# 最近幾次的實扣生命與反彈量
	var hero_counter: Dictionary = {}
	# 堅韌（廖化）：Godot 實際讀到的門檻與倍率（沒有啟用時不列出）、現在是不是生效、減傷的次數與少扣的總量、目前與最大生命、
	# 最近幾次有效受傷的受傷前生命、防禦計算後的傷害與實際扣掉的生命
	var hero_tenacity: Dictionary = {}
	for hid in _placed_heroes:
		var hero: Node = _placed_heroes[hid]
		if not is_instance_valid(hero):
			continue
		if hero.stun_duration > 0.0:
			hero_stun[hid] = {"sec": hero.stun_duration, "count": hero.stun_count}
		if hero.lifesteal_ratio > 0.0:
			hero_lifesteal[hid] = {"ratio": hero.lifesteal_ratio, "count": hero.lifesteal_count, "total": hero.lifesteal_total,
				"hp": hero.current_hp, "max_hp": hero.max_hp, "log": hero.lifesteal_log.duplicate(true)}
		if hero.counter_ratio > 0.0:
			hero_counter[hid] = {"ratio": hero.counter_ratio, "count": hero.counter_count, "total": hero.counter_total, "dealt": hero.counter_dealt,
				"hp": hero.current_hp, "max_hp": hero.max_hp, "log": hero.counter_log.duplicate(true)}
		if hero.tenacity_hp_ratio > 0.0:
			hero_tenacity[hid] = {"low_hp_ratio": hero.tenacity_hp_ratio, "damage_mult": hero.tenacity_damage_mult, "active": hero.tenacity_on(),
				"count": hero.tenacity_count, "saved": hero.tenacity_saved, "hp": hero.current_hp, "max_hp": hero.max_hp,
				"log": hero.tenacity_log.duplicate(true)}
		hero_ranges[hid] = hero.attack_range
		hero_hp[hid] = hero.current_hp
		hero_slow[hid] = hero.slow_state()
		hero_def[hid] = hero.def_state()
		hero_atk_speed[hid] = hero.atk_speed_state()
		hero_air[hid] = hero.can_hit_air
		if hero.dodge_chance > 0.0:
			hero_dodge[hid] = {"chance": hero.dodge_chance, "rolls": hero.dodge_rolls, "dodges": hero.dodge_count,
				"log": hero.dodge_log.duplicate(true), "hp": hero.current_hp, "max_hp": hero.max_hp}
		if hero.sweep_ratio > 0.0:
			var fx_n: int = 0
			for c in hero.get_children():
				if c is Hero.SweepFx and not c.is_queued_for_deletion():
					fx_n += 1
			hero_sweep[hid] = {"radius": hero.sweep_radius, "max_targets": hero.sweep_max_targets, "ratio": hero.sweep_ratio,
				"count": hero.sweep_count, "hits": hero.sweep_hits, "fx": fx_n}
		var dists: Dictionary = {}
		for child in units_layer.get_children():
			if child is Enemy and not child.is_queued_for_deletion():
				dists[str(child.get_instance_id())] = hero.global_position.distance_to(child.global_position) / float(hero.tile_size)
		hero_enemy_dist[hid] = dists
	var snapshot: Dictionary = {
		"request_id":        request_id,
		# 刻意不用 stage_id / result 欄位名稱，避免 Web 端誤判為結算訊息
		"stage":             battle_manager.stage_id,
		"battle_id":         battle_manager.battle_id,
		"game_state":        battle_manager.game_state,
		"wave":              battle_manager.current_wave,
		"total_waves":       battle_manager.total_waves,
		"hp":                battle_manager.base_hp,
		"kills":             battle_manager.kills,
		"auto_mode":         battle_manager.auto_mode,
		"wave_generation":   wave_manager.get_generation(),
		"active_enemies":    wave_manager.get_active_enemy_count(),
		"spawning_groups":   wave_manager.get_spawning_group_count(),
		"enemy_nodes":       enemy_nodes,
		"enemy_hp":          enemy_hp,
		"enemy_burn":        enemy_burn,
		"enemy_kind":        enemy_kind,
		"tower_targets":     tower_targets,
		"hero_ranges":       hero_ranges,
		"hero_enemy_dist":   hero_enemy_dist,
		"game_time":         _game_time,
		"time_scale":        Engine.time_scale,
		# 手動暫停：模擬用的節點是否已停掉、SceneTree 本身是否暫停（這個功能不用它）；每個敵人的位置（測試比對暫停前後）
		"world_frozen":      units_layer.process_mode == Node.PROCESS_MODE_DISABLED,
		"tree_paused":       get_tree().paused,
		"enemy_pos":         enemy_pos,
		# 橫掃（技能原型）：每個敵人的生成序號（副目標等距時的順序）、每位啟用橫掃的武將的參數與統計
		"enemy_seq":         enemy_seq,
		"hero_sweep":        hero_sweep,
		# 飛行敵人與對空
		"enemy_move":        enemy_move,
		"enemy_remaining":   enemy_remaining,
		"enemy_slow":        enemy_slow,
		"hero_air":          hero_air,
		# 閃避（趙雲）與敵人攻擊阻路武將的次數
		"hero_dodge":        hero_dodge,
		"enemy_blocker_attacks": enemy_blocker_attacks,
		"dodge_texts":       dodge_texts,
		# 敵人設定的攻擊力與免疫減速
		"enemy_atk":         enemy_atk,
		"enemy_immune":      enemy_immune,
		"enemy_speed_mult":  enemy_speed_mult,
		"hero_hp":           hero_hp,
		# 倍率減速的來源、實際移動速度、攻擊圖片的狀態；武將的減速光環與道路阻擋
		"enemy_slow_src":    enemy_slow_src,
		"enemy_speed":       enemy_speed,
		"enemy_fighting":    enemy_fighting,
		"hero_slow":         hero_slow,
		# 防禦光環（劉備）
		"hero_def":          hero_def,
		# 暈眩（張飛）
		"hero_stun":         hero_stun,
		"enemy_stun":        enemy_stun,
		# 吸血（魏延）
		"hero_lifesteal":    hero_lifesteal,
		"heal_texts":        heal_texts,
		# 攻速光環（曹操）與每位武將的攻擊間隔
		"hero_atk_speed":    hero_atk_speed,
		# 反擊（夏侯惇）
		"hero_counter":      hero_counter,
		"counter_texts":     counter_texts,
		# 堅韌（廖化）
		"hero_tenacity":     hero_tenacity,
	}
	snapshot.merge(battle_manager.get_debug_state())
	web_bridge.send_debug_snapshot(snapshot)

# ═══════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════
func _sync_placed_heroes_stats(new_team: Array) -> void:
	for hero_id in _placed_heroes:
		var hero: Node = _placed_heroes[hero_id]
		if not is_instance_valid(hero):
			continue
		for h in new_team:
			if str(h.get("hero_id", "")) == hero_id:
				hero.apply_stat_update(h, _heroes_config)
				print("[Main] 同步武將數值：", hero_id, " Lv.", h.get("level", 1))
				break

func _remove_heroes_not_in_team(new_team: Array) -> void:
	var valid_ids: Array = new_team.map(func(h): return str(h.get("hero_id", "")))
	var to_remove: Array = []
	for hero_id in _placed_heroes:
		if hero_id not in valid_ids:
			to_remove.append(hero_id)
	for hero_id in to_remove:
		var hero: Node = _placed_heroes[hero_id]
		if is_instance_valid(hero):
			if _selected_unit == hero:
				_deselect_unit()
			if _moving_unit == hero:
				_end_drag()
			var cell: Vector2i = hero.get_cell()
			game_map.clear_occupied(cell)
			hero.queue_free()
		_placed_heroes.erase(hero_id)
	if not to_remove.is_empty():
		print("[Main] 移除不在隊伍中的武將：", to_remove)

func _on_splash_dismissed() -> void:
	# 用戶點擊 splash → AudioContext 已解鎖，BGM 此時可正常播放
	SFXManager.play_bgm()

func _build_default_enemies() -> Array:
	return [
		{ "enemy_id": "soldier", "name": "步兵", "hp": 100.0, "speed": 1.2 },
		{ "enemy_id": "cavalry", "name": "騎兵", "hp": 200.0, "speed": 2.5 },
	]

# ═══════════════════════════════════════════
#  內部：安全音效呼叫
# ═══════════════════════════════════════════
func _sfx(key: String) -> void:
	if get_tree() and get_tree().root.has_node("SFXManager"):
		get_tree().root.get_node("SFXManager").play(key)
