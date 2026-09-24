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
signal wave_start_rejected(wave_num: int, reason: String)  # 波次沒有可生成的敵人，拒絕開戰

# ── 常數 ──────────────────────────────────────────────────────
const INITIAL_GOLD: int        = 5000
const GOLD_PER_KILL: int       = 5
const AUTO_NEXT_WAVE_DELAY: float = 1.5  # 自動模式清波後到下一波的等待時間
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

# ── 延遲自動下一波的失效化 ────────────────────────────────────
# _lifecycle：每次 initialize（切關／同關重開）遞增，只增不減。
# _auto_wave_token：每次排程或取消都遞增；計時器回呼只認建立當下的 token。
# 舊關卡或已取消的計時器即使稍後觸發，也因為號碼對不上而不做任何事。
var _lifecycle: int = 0
var _auto_wave_token: int = 0
var _auto_wave_pending: bool = false

# ── 外部引用（由 Main.gd 初始化後傳入）──────────────────────
var _wave_manager: Node = null
var _web_bridge: Node = null

# ── 初始化 ────────────────────────────────────────────────────
func initialize(p_total_waves: int, p_stage_id: String, wave_mgr: Node, bridge: Node) -> void:
	_lifecycle += 1
	_cancel_auto_wave()
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
	_sync_stats_to_web()

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
		# 立即切換到戰鬥並開始第一波（_spawn_next_wave 會同步給 Web）
		_spawn_next_wave()
		return
	if not auto_mode and _auto_wave_pending:
		# 清波後等待自動下一波時關閉自動：取消排程並回到備戰，改由玩家手動迎戰
		_cancel_auto_wave()
		_set_state(GameState.PREP)
		return
	_sync_stats_to_web()

# ── 金幣操作 ─────────────────────────────────────────────────
func can_spend_gold(amount: int) -> bool:
	return battle_gold >= amount

func spend_gold(amount: int) -> bool:
	if not can_spend_gold(amount):
		return false
	battle_gold -= amount
	battle_gold_changed.emit(battle_gold)
	_sync_stats_to_web()
	return true

func earn_gold(amount: int) -> void:
	battle_gold += amount
	battle_gold_changed.emit(battle_gold)
	_sync_stats_to_web()

# ── 敵人事件（由 Main.gd 轉接）────────────────────────────────
func on_enemy_reached_base() -> void:
	if game_state == GameState.RESULT:
		return
	base_hp -= 1
	base_hp_changed.emit(base_hp, MAX_BASE_HP)
	_sync_stats_to_web()
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
	elif auto_mode:
		# 自動模式：短暫停頓後自動進入下一波
		_schedule_auto_wave()
	else:
		# 手動模式：秒回準備階段
		_set_state(GameState.PREP)

# ── 內部 ─────────────────────────────────────────────────────
func _set_state(new_state: int) -> void:
	game_state = new_state
	state_changed.emit(game_state)
	_sync_stats_to_web()

func _schedule_auto_wave() -> void:
	if _auto_wave_pending:
		return  # 同一波的清波通知只排程一次
	_auto_wave_pending = true
	_auto_wave_token += 1
	var token: int     = _auto_wave_token
	var life: int      = _lifecycle
	var from_wave: int = current_wave
	_sync_stats_to_web()
	get_tree().create_timer(AUTO_NEXT_WAVE_DELAY).timeout.connect(func():
		# 只接受「同一個關卡生命週期、同一次排程」的計時器
		if token != _auto_wave_token or life != _lifecycle:
			return
		_auto_wave_pending = false
		if not auto_mode or game_state != GameState.BATTLE or current_wave != from_wave:
			_sync_stats_to_web()
			return
		_spawn_next_wave()
	)

func _cancel_auto_wave() -> void:
	_auto_wave_token += 1
	_auto_wave_pending = false

func _spawn_next_wave() -> void:
	var next_wave: int = current_wave + 1
	if next_wave > total_waves:
		return
	# 先確認這一波至少有一組敵人能生成，才進入戰鬥
	var plans: Array = _wave_manager.plan_wave(next_wave) if _wave_manager else []
	if plans.is_empty():
		_reject_wave(next_wave, "沒有可生成的敵人（缺少波次資料，或敵人組的設定、路徑、數量全部無效）")
		return
	current_wave = next_wave
	game_state = GameState.BATTLE
	state_changed.emit(game_state)
	wave_changed.emit(current_wave, total_waves)
	_sync_stats_to_web()
	auto_timer = 0.0
	_wave_manager.start_wave(current_wave, plans)

## 波次無法生成任何敵人時拒絕開戰：波次不前進、不結算，關閉自動並回到備戰。
## 避免無效設定被當成「清波」而直接給勝利獎勵；切換到有效關卡即可恢復。
func _reject_wave(wave_num: int, reason: String) -> void:
	push_error("[BattleManager] 拒絕開始第 %d 波：%s（關卡 %s）" % [wave_num, reason, stage_id])
	_cancel_auto_wave()
	if auto_mode:
		auto_mode = false
		auto_mode_changed.emit(auto_mode)
	wave_start_rejected.emit(wave_num, reason)
	_set_state(GameState.PREP)

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
	_cancel_auto_wave()
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
	_sfx_stop_bgm()
	_sfx("battle_win" if is_win else "battle_lose")

func _sync_stats_to_web() -> void:
	if _web_bridge == null:
		return
	var stats = {
		"gold": battle_gold,
		"wave": current_wave,
		"total_waves": total_waves,
		"hp": base_hp,
		"max_hp": MAX_BASE_HP,
		"game_state": game_state,
		"auto_mode": auto_mode,
		"auto_next_wave_pending": _auto_wave_pending
	}
	_web_bridge.send_stats(stats)

## 測試用唯讀狀態（debug_snapshot）
func get_debug_state() -> Dictionary:
	return {
		"lifecycle": _lifecycle,
		"auto_wave_token": _auto_wave_token,
		"auto_next_wave_pending": _auto_wave_pending,
	}

# ═══════════════════════════════════════════
#  內部：安全音效呼叫
# ═══════════════════════════════════════════
func _sfx(key: String) -> void:
	if get_tree() and get_tree().root.has_node("SFXManager"):
		get_tree().root.get_node("SFXManager").play(key)

func _sfx_stop_bgm() -> void:
	if get_tree() and get_tree().root.has_node("SFXManager"):
		get_tree().root.get_node("SFXManager").stop_bgm()
