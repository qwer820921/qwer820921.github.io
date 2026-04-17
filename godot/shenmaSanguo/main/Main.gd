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

# ── 已放置的武將（避免同一英雄放多次）────────────────────────
var _placed_heroes: Dictionary = {}   # hero_id → Hero node
var _selected_unit: Node       = null  # 選中的塔/武將
var _moving_unit: Node         = null  # 正在重新佈置的單位

# ═══════════════════════════════════════════
#  _ready
# ═══════════════════════════════════════════
func _ready() -> void:
	# WebBridge signal
	web_bridge.payload_received.connect(_on_payload_received)

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
	battle_manager.auto_mode_changed.connect(_on_auto_mode_changed)
	battle_manager.battle_ended.connect(_on_battle_ended)

	# WaveManager signals
	wave_manager.enemy_spawned.connect(_on_enemy_spawned)
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
	_payload        = payload
	_team_list      = payload.get("team_list", [])
	_heroes_config  = payload.get("heroes_config", [])

	var map_data: Dictionary  = payload.get("map", {})
	var path_json: Dictionary = map_data.get("path_json", {})
	_waves = map_data.get("waves", [])
	if _waves.is_empty():
		_waves = _build_default_waves()
		print("[Main] Payload 缺失 waves 資料，已自動載入預設波次供測試。")

	# 取得 enemies_config（若 payload 中有）
	_enemies_config = payload.get("enemies_config", _build_default_enemies())

	var stage_id: String = str(payload.get("stage_id", "chapter1_1"))

	# 初始化地圖
	game_map.setup(path_json)

	# 初始化 WaveManager
	# 攤平 waves 結構（Wave[] → 直接傳陣列）
	wave_manager.setup(_waves, _enemies_config, game_map, units_layer, ENEMY_SCENE)

	# 初始化 BattleManager
	var total_waves: int = _count_waves(_waves)
	battle_manager.initialize(total_waves, stage_id, wave_manager, web_bridge)

	# 初始化 HUD
	battle_hud.setup_heroes(_team_list, _heroes_config)
	battle_hud.update_wave(0, total_waves)
	battle_hud.update_base_hp(20, 20)
	battle_hud.update_gold(500)

func _count_waves(waves: Array) -> int:
	var max_wave: int = 0
	for w in waves:
		var wn: int = int(w.get("wave", 0))
		if wn > max_wave:
			max_wave = wn
	return max_wave

func _build_default_waves() -> Array:
	return [
		{ "wave": 1, "enemies": [{ "enemy_id": "soldier",  "count": 3, "interval": 1.2, "path": "path_a" }] },
		{ "wave": 2, "enemies": [{ "enemy_id": "cavalry",  "count": 4, "interval": 1.5, "path": "path_a" }] },
		{ "wave": 3, "enemies": [{ "enemy_id": "general",  "count": 1, "interval": 0.5, "path": "path_a" }] },
	]

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

func _on_auto_mode_changed(enabled: bool) -> void:
	battle_hud.set_auto_active(enabled)

func _on_battle_ended(result: Dictionary) -> void:
	battle_hud.show_battle_result(result)

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
func _on_enemy_spawned(enemy: Node) -> void:
	enemy.died.connect(_on_enemy_died)
	enemy.reached_base.connect(_on_enemy_reached_base)

func _on_enemy_died(_enemy: Node) -> void:
	battle_manager.on_enemy_killed()

func _on_enemy_reached_base(_enemy: Node) -> void:
	battle_manager.on_enemy_reached_base()

func _on_wave_cleared(_wave_num: int) -> void:
	battle_manager.on_wave_all_enemies_dead()

# ═══════════════════════════════════════════
#  拖曳放置
# ═══════════════════════════════════════════
func _on_drag_hero_started(hero_data: Dictionary) -> void:
	_moving_unit     = null
	_drag_type       = DragType.HERO
	_drag_hero_data = hero_data
	_is_dragging    = true
	drag_ghost.start_drag("hero", hero_data.get("hero_id", "?"), Color(0.20, 0.40, 0.80, 0.75))

func _on_drag_tower_started(tower_type: String) -> void:
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
	if battle_manager.game_state != BattleManager.GameState.PREP:
		return  # 安全檢查：非備戰期間不可移動
		
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

func _input(event: InputEvent) -> void:
	# --- 新增：偵測「點擊」地圖上的單位或空地 ---
	if not _is_dragging and event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		var cell: Vector2i = game_map.world_to_grid(event.position)
		if game_map.is_valid_cell(cell):
			var unit: Node = game_map.get_occupant(cell)
			if unit != null:
				# 點擊既有單位
				if battle_manager.game_state == BattleManager.GameState.PREP:
					_deselect_unit() 
					_on_unit_move_requested(unit)
				else:
					# 戰鬥期間只做選取
					if unit is Hero: _on_hero_clicked(unit)
					elif unit is Tower: _on_tower_clicked(unit)
				get_viewport().set_input_as_handled()
				return
			else:
				# 點擊草地 -> 取消選取並收起面板
				_deselect_unit()
				battle_hud.hide_upgrade_panel()

	if not _is_dragging:
		return

	if event is InputEventMouseMotion:
		drag_ghost.update_pos(event.position)
		var cell: Vector2i = game_map.world_to_grid(event.position)
		if game_map.is_valid_cell(cell):
			var valid: bool = _is_valid_placement(cell)
			game_map.highlight_cell(cell, valid)
		else:
			game_map.clear_highlight()

	elif event is InputEventMouseButton and not event.pressed:
		# 放開滑鼠 → 嘗試放置
		var cell: Vector2i = game_map.world_to_grid(event.position)
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

	var on_road: bool = game_map.get_tile_type(cell) == game_map.TileType.ROAD
	hero.setup(_drag_hero_data, _heroes_config, cell, on_road, wave_manager)
	hero.hero_clicked.connect(_on_hero_clicked.bind(hero))

	game_map.set_occupied(cell, hero)
	_placed_heroes[str(_drag_hero_data.get("hero_id", ""))] = hero

func _place_tower(cell: Vector2i, world_pos: Vector2) -> void:
	# 檢查金幣
	var cfg = Tower.TOWER_CONFIGS.get(_drag_tower_type, {})
	var cost: int = int(cfg.get("cost", 50))
	if not battle_manager.spend_gold(cost):
		return  # 金幣不足

	var tower: Node = TOWER_SCENE.instantiate()
	units_layer.add_child(tower)
	tower.position = world_pos
	tower.setup(_drag_tower_type, cell, wave_manager)
	tower.tower_clicked.connect(_on_tower_clicked.bind(tower))
	tower.upgrade_requested.connect(_on_upgrade_requested)

	game_map.set_occupied(cell, tower)

func _end_drag() -> void:
	_is_dragging    = false
	_moving_unit    = null
	drag_ghost.end_drag()
	game_map.clear_highlight()

# ═══════════════════════════════════════════
#  選取 & 升級
# ═══════════════════════════════════════════
func _on_hero_clicked(hero: Node) -> void:
	_deselect_unit()
	_selected_unit = hero
	hero.set_selected(true)
	battle_hud.show_hero_panel(hero, hero.get_global_transform_with_canvas().origin)
	
	# 直接進入移動模式（僅限備戰期間）
	if battle_manager.game_state == BattleManager.GameState.PREP:
		_on_unit_move_requested(hero)

func _on_tower_clicked(tower: Node) -> void:
	_deselect_unit()
	_selected_unit = tower
	tower.set_selected(true)
	var cam: Camera2D = get_viewport().get_camera_2d()
	var screen_pos: Vector2 = cam.get_screen_center_position() if cam else tower.global_position
	battle_hud.show_upgrade_panel(tower, tower.global_position, battle_manager.spend_gold(0)) # 傳入 0 只是為了檢查金幣，實際檢查邏輯在 HUD
	
	# 直接進入移動模式（僅限備戰期間）
	if battle_manager.game_state == BattleManager.GameState.PREP:
		_on_unit_move_requested(tower)

func _on_upgrade_requested(tower: Node, cost: int) -> void:
	if battle_manager.spend_gold(cost):
		tower.apply_upgrade()
		# 更新升級面板顯示
		battle_hud.show_upgrade_panel(tower, tower.get_global_transform_with_canvas().origin, battle_manager.can_spend_gold(tower.get_upgrade_cost()))

func _deselect_unit() -> void:
	if _selected_unit and is_instance_valid(_selected_unit):
		_selected_unit.set_selected(false)
	_selected_unit = null

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
			  "atk_growth": 0.08, "def_growth": 0.06, "hp_growth": 0.10 },
			{ "hero_id": "zhou_cang", "name": "周倉", "job": "infantry",
			  "attack_range": 1.2, "attack_speed": 1.5,
			  "base_atk": 100, "base_def":  70, "base_hp": 900,
			  "rarity": "purple", "cost": 6, "upgrade_cost_base": 70,
			  "atk_growth": 0.07, "def_growth": 0.05, "hp_growth": 0.09 },
		],
		"enemies_config": [
			{ "enemy_id": "soldier",  "name": "步兵", "hp": 150.0, "speed": 80.0 },
			{ "enemy_id": "cavalry",  "name": "騎兵", "hp": 200.0, "speed": 160.0 },
			{ "enemy_id": "archer",   "name": "弓兵", "hp": 100.0, "speed": 100.0 },
		],
		"map": {
			"map_id": "chapter1_1",
			"name": "虎牢關",
			"path_json": {
				"paths": [
					{ "id": "path_a", "waypoints": [[2,0],[2,3],[5,3],[5,8],[8,8]] }
				],
				"spawn": [
					{ "path": "path_a", "pos": [2,0] }
				],
				"base": [8,8],
				"build_zones": [
					[0,0],[1,0],[3,0],[4,0],
					[0,1],[1,1],[3,1],[4,1],
					[0,2],[1,2],[3,2],[4,2],
					[0,3],[1,3],
					[3,4],[4,4],[6,4],[7,4],
					[3,5],[4,5],[6,5],[7,5],
					[3,6],[4,6],[6,6],[7,6],
					[3,7],[4,7],[6,7],[7,7],
					[6,9],[7,9],[8,9]
				]
			},
			"waves": [
				{ "wave": 1, "enemies": [
					{ "enemy_id": "soldier", "count": 5, "interval": 1.0, "path": "path_a" }
				]},
				{ "wave": 2, "enemies": [
					{ "enemy_id": "soldier",  "count": 5, "interval": 0.8, "path": "path_a" },
					{ "enemy_id": "cavalry",  "count": 2, "interval": 2.0, "path": "path_a" }
				]},
				{ "wave": 3, "enemies": [
					{ "enemy_id": "cavalry",  "count": 4, "interval": 1.5, "path": "path_a" },
					{ "enemy_id": "archer",   "count": 6, "interval": 0.7, "path": "path_a" }
				]},
			]
		}
	}
	# 延遲 0.5 秒模擬網路延遲後注入
	await get_tree().create_timer(0.5).timeout
	_on_payload_received(test_payload)

# ═══════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════
func _build_default_enemies() -> Array:
	return [
		{ "enemy_id": "soldier", "name": "步兵", "hp": 100.0, "speed": 1.2 },
		{ "enemy_id": "cavalry", "name": "騎兵", "hp": 200.0, "speed": 2.5 },
	]
