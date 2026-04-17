## BattleManager.gd
## 遊戲狀態機、戰鬥金幣、勝敗判定、結算

class_name BattleManager
extends Node

# ── 遊戲狀態 ──────────────────────────────────────────────────
enum GameState { WAITING_PAYLOAD, PREP, BATTLE, RESULT }

signal state_changed(new_state: int)
signal base_hp_changed(hp: int, max_hp: int)
signal battle_gold_changed(gold: int)
signal wave_changed(current: int, total: int)
signal battle_ended(result: Dictionary)
signal auto_mode_changed(enabled: bool)

# ── 常數 ──────────────────────────────────────────────────────
const INITIAL_GOLD: int        = 500
const GOLD_PER_KILL: int       = 5
const AUTO_WAVE_INTERVAL: float  = 30.0
const MAX_BASE_HP: int         = 20

# ── 狀態變數 ─────────────────────────────────────────────────
var game_state: int = GameState.WAITING_PAYLOAD
var base_hp: int = MAX_BASE_HP
var kills: int = 0
var battle_time: float = 0.0
var battle_gold: int = INITIAL_GOLD
var auto_mode: bool = false
var auto_timer: float = 0.0
var total_waves: int = 0
var current_wave: int = 0
var stage_id: String = ""

# ── 外部引用（由 Main.gd 初始化後傳入）──────────────────────
var _wave_manager: Node = null
var _web_bridge: Node = null

# ── 初始化 ────────────────────────────────────────────────────
func initialize(p_total_waves: int, p_stage_id: String, wave_mgr: Node, bridge: Node) -> void:
	total_waves    = p_total_waves
	stage_id       = p_stage_id
	_wave_manager  = wave_mgr
	_web_bridge    = bridge
	battle_gold    = INITIAL_GOLD
	base_hp        = MAX_BASE_HP
	kills          = 0
	battle_time    = 0.0
	current_wave   = 0
	auto_mode      = false
	game_state     = GameState.PREP
	state_changed.emit(game_state)
	base_hp_changed.emit(base_hp, MAX_BASE_HP)
	battle_gold_changed.emit(battle_gold)
	wave_changed.emit(current_wave, total_waves)

# ── _process ─────────────────────────────────────────────────
func _process(delta: float) -> void:
	if game_state != GameState.BATTLE:
		return
	battle_time += delta
	# 波次切換已全面改用信號驅動，不再使用強制間隔計時。

# ── 玩家操作 ─────────────────────────────────────────────────
func player_start_battle() -> void:
	if game_state != GameState.PREP:
		return
	_spawn_next_wave()

func toggle_auto_mode() -> void:
	auto_mode = !auto_mode
	auto_mode_changed.emit(auto_mode)
	if auto_mode and game_state == GameState.PREP:
		# 立即切換到戰鬥並開始第一波
		_spawn_next_wave()

# ── 金幣操作 ─────────────────────────────────────────────────
func can_spend_gold(amount: int) -> bool:
	return battle_gold >= amount

func spend_gold(amount: int) -> bool:
	if not can_spend_gold(amount):
		return false
	battle_gold -= amount
	battle_gold_changed.emit(battle_gold)
	return true

func earn_gold(amount: int) -> void:
	battle_gold += amount
	battle_gold_changed.emit(battle_gold)

# ── 敵人事件（由 Main.gd 轉接）────────────────────────────────
func on_enemy_reached_base() -> void:
	if game_state == GameState.RESULT:
		return
	base_hp -= 1
	base_hp_changed.emit(base_hp, MAX_BASE_HP)
	if base_hp <= 0:
		_end_battle(false)

func on_enemy_killed() -> void:
	if game_state == GameState.RESULT:
		return
	kills += 1
	earn_gold(GOLD_PER_KILL)

# ── 波次完成（由 WaveManager 通知）────────────────────────────
func on_wave_all_enemies_dead() -> void:
	if game_state != GameState.BATTLE:
		return
	
	if current_wave >= total_waves:
		_end_battle(true)
	else:
		if auto_mode:
			# 自動模式：短暫停頓後自動進入下一波
			get_tree().create_timer(1.5).timeout.connect(func():
				if game_state == GameState.BATTLE or game_state == GameState.PREP:
					_spawn_next_wave()
			)
		else:
			# 手動模式：秒回準備階段
			game_state = GameState.PREP
			state_changed.emit(game_state)

# ── 內部 ─────────────────────────────────────────────────────
func _spawn_next_wave() -> void:
	current_wave += 1
	if current_wave > total_waves:
		return
	game_state = GameState.BATTLE
	state_changed.emit(game_state)
	wave_changed.emit(current_wave, total_waves)
	auto_timer = 0.0
	if _wave_manager:
		_wave_manager.start_wave(current_wave)

func _calc_stars() -> int:
	if base_hp <= 0:
		return 0
	var lost: int = MAX_BASE_HP - base_hp
	if lost <= 2:
		return 3
	elif lost <= 10:
		return 2
	else:
		return 1

func _calc_battle_points() -> int:
	var kp: int = kills * 10
	var hp_p: int = base_hp * 20
	var star_p: int = 0
	var stars: int = _calc_stars()
	
	if stars == 1: star_p = 100
	elif stars == 2: star_p = 300
	elif stars == 3: star_p = 600
	
	return kp + hp_p + star_p

func _end_battle(is_win: bool) -> void:
	if game_state == GameState.RESULT:
		return
	game_state = GameState.RESULT
	state_changed.emit(game_state)
	var result: Dictionary = {
		"result":       "WIN" if is_win else "LOSE",
		"stage_id":     stage_id,
		"stars_earned": _calc_stars() if is_win else 0,
		"kills":        kills,
		"time_seconds": int(battle_time),
		"loots":        [{ "item": "battle_points", "count": _calc_battle_points() if is_win else 10 }]
	}
	battle_ended.emit(result)
	if _web_bridge:
		_web_bridge.send_result(result)
