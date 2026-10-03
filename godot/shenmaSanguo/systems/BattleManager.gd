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
signal pause_changed(paused: bool)  # 手動暫停：Main 依此停掉／恢復模擬用的節點

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
## 這一場的識別碼（Web 送來的 battle_id，每次載入關卡都不同，同一關重來也不同）。
## update_stats 與結算都帶上它，Web 只採用目前這一場的訊息；Web 沒有提供時是空字串（Web 不會採用）
var battle_id: String = ""

# ── 延遲自動下一波的失效化 ────────────────────────────────────
# _lifecycle：每次 initialize（切關／同關重開）遞增，只增不減。
# _auto_wave_token：每次排程或取消都遞增；計時器回呼只認建立當下的 token。
# 舊關卡或已取消的計時器即使稍後觸發，也因為號碼對不上而不做任何事。
var _lifecycle: int = 0
var _auto_wave_token: int = 0
var _auto_wave_pending: bool = false

# ── 武將技能：首擊加倍（first_strike，馬超「衝鋒」）──────────────
## 這一場已用過首擊加倍的武將：hero_id → 那一擊的傷害。記在這裡而不是武將節點：
## 跨波次、移位、更新隊伍、同場移除再放回都不會重新取得；initialize（新的一場、新的 battle_id）才清空
var _first_strike_used: Dictionary = {}

# ── 武將技能：戰神（berserk，呂布）──────────────────────────
## 這一場每位武將自己普通攻擊打倒敵人累積的層數：hero_id → {"stacks": 層數, "kills": 擊殺次數, "log": 最近 BERSERK_LOG_MAX 次擊殺}。
## 和首擊加倍一樣記在這裡：跨波次、移位、升級、同場移除再放回都保留；initialize（新的一場、新的 battle_id）才清空，不寫存檔
var _berserk: Dictionary = {}
const BERSERK_LOG_MAX: int = 40

# ── 武將技能：補給（supply，魯肅）──────────────────────────
## 有補給技能的武將（instance id → WeakRef）：武將讀到補給時登記、換成其他技能時取消；initialize（新的一場）清空。
## 只是候選名單：每次擊殺結算的當下才逐一確認（supply_source），失效、正要被移除、陣亡、不在場上、技能已經不是補給的都不算，
## 不靠下一幀才更新的快取。只影響有效擊殺的戰鬥金幣（on_enemy_killed），不經過 earn_gold
var _supply_sources: Dictionary = {}
## 最近 KILL_GOLD_LOG_MAX 次有效擊殺的戰鬥金幣結算（測試用唯讀紀錄，新的一場清空）
var _kill_gold_log: Array = []
const KILL_GOLD_LOG_MAX: int = 40
## 補給的倍率乘上每次擊殺的金幣後向下取整：加上很小的容許誤差，避免小數乘法差一點點時少算 1（5 × 1.2 是 6）
const SUPPLY_EPS: float = 1e-6

# ── 武將技能：怪力（knockback，許褚）────────────────────────
## 這一場每位武將的擊退冷卻與紀錄：hero_id → {"ready_at": 下次可以推的戰鬥時間（battle_time）, "count": 成功次數, "log": 最近 KNOCKBACK_LOG_MAX 次}。
## 冷卻用 battle_time（只在戰鬥中、照時間倍率前進，手動暫停與備戰不前進）。和首擊加倍、戰神一樣記在這裡：
## 跨波次、移位、升級、同場移除再放回、重新讀技能都保留；initialize（新的一場、新的 battle_id）才清空，不寫存檔
var _knockback: Dictionary = {}
const KNOCKBACK_LOG_MAX: int = 40

# ── 武將技能：守護（base_guard，孫權）────────────────────────
## 有守護技能的武將（instance id → WeakRef）：武將讀到守護時登記、換成其他技能時取消；initialize（新的一場）清空。
## 只是候選名單：每次敵人抵達城池的當下才逐一確認（base_guard_source）：失效、正要被移除、陣亡、不在場上、技能已經不是守護的都不算
var _base_guard_sources: Dictionary = {}
## 這一場累計的漏城傷害 T（每次有效抵達加上當下生效的倍率，沒有守護時 1）與已經扣掉的城防 A（整數）。
## 這一次扣「ceil(T − LEAK_EPS) − A」：城防仍是整數，倍率 0.8 時連續 5 次扣 1、1、1、1、0（共 4），不會每次無條件捨去成 0。
## T 與 A 跨波次、移位、升級、守護陣亡或移出隊伍、重新部署都保留（不回補、不追扣先前的折扣），新的一場（initialize）才歸零
var _leak_total: float = 0.0
var _leak_lost: int = 0
## 最近 LEAK_LOG_MAX 次有效抵達（測試用唯讀紀錄，新的一場清空）：敵人的生成序號、倍率與來源、累計前後的 T、這一次扣的城防、扣完的城防
var _leak_log: Array = []
const LEAK_LOG_MAX: int = 40
## 進位用的容許誤差：0.8 累加 5 次的浮點誤差不會讓 4 變成 5
const LEAK_EPS: float = 1e-6
var _base_guard_sync_pending: bool = false

# ── 武將技能：奇襲（assassinate，甘寧）────────────────────────
## 這一場已用過奇襲的武將：hero_id → 那一次的紀錄（見 Hero._assassinate）。和首擊加倍一樣記在這裡：跨波次、移位、升級、
## 同場移除再放回、重新讀技能或換成其他技能再換回都不恢復；initialize（新的一場、新的 battle_id）才清空，不寫存檔
var _assassinate_used: Dictionary = {}
## 這一場最近 ASSASSINATE_LOG_MAX 次奇襲（所有武將，測試用唯讀紀錄）
var _assassinate_log: Array = []
const ASSASSINATE_LOG_MAX: int = 40

# ── 武將技能：魅惑（charm，貂蟬）────────────────────────────
## 這一場每位武將的魅惑冷卻與紀錄：hero_id → {"ready_at": 下次可以控制的戰鬥時間（battle_time）, "count": 成功次數, "log": 最近 CHARM_LOG_MAX 次}。
## 和怪力一樣用 battle_time（只在戰鬥中、照時間倍率前進，手動暫停與備戰不前進），跨波次、移位、升級、同場移除再放回、重新讀技能都保留；
## initialize（新的一場）才清空。受控的時間也用 battle_time（見 Enemy.apply_charm），新的一場的敵人都是新的節點
var _charm: Dictionary = {}
const CHARM_LOG_MAX: int = 40

# ── 戰鬥速度 ──────────────────────────────────────────────
# Engine.time_scale 只由 _apply_time_scale 寫入：實際倍率＝部署選單開著時固定 DEPLOY_TIME_SCALE，否則是玩家選的速度。
# 敵人移動、攻擊冷卻、灼燒、減速、出兵間隔、自動下一波都照這個倍率推進；傷害、費用、獎勵不受影響
const DEPLOY_TIME_SCALE: float = 0.1
## 玩家選的速度（1 或 2 倍）：新的一場（initialize）與結算時回到 1；同一場跨波、更新隊伍、升級都保留
var speed_pref: int = 1
## 目前開著的部署選單編號（0＝沒有開著）：只有帶著這一場的 battle_id 與這個編號的關閉命令能解除慢速
var deploy_menu_id: int = 0
## 部署選單編號的流水號：只增不減，換場次也不重用
var _deploy_menu_seq: int = 0

# ── 手動暫停 ──────────────────────────────────────────────
# 和玩家選的速度、部署慢速分開記錄：暫停不改 Engine.time_scale（也不靠倍率 0 假裝暫停），不動 SceneTree.paused。
# 暫停時 Main 停掉模擬用的節點（UnitsLayer、WaveManager、BattleManager 本身的處理與計時器），繼續後從同一個進度接著跑。
# 只存在這一場的記憶體（不寫存檔、不送後端）；新的一場（initialize）與結算時解除
var manual_paused: bool = false

# ── 外部引用（由 Main.gd 初始化後傳入）──────────────────────
var _wave_manager: Node = null
var _web_bridge: Node = null

# ── 初始化 ────────────────────────────────────────────────────
func initialize(p_total_waves: int, p_stage_id: String, wave_mgr: Node, bridge: Node, p_battle_id: String = "") -> void:
	_lifecycle += 1
	_cancel_auto_wave()
	total_waves    = p_total_waves
	stage_id       = p_stage_id
	battle_id      = p_battle_id
	_first_strike_used.clear()
	_berserk.clear()
	_supply_sources.clear()
	_kill_gold_log.clear()
	_knockback.clear()
	_base_guard_sources.clear()
	_leak_total = 0.0
	_leak_lost = 0
	_leak_log.clear()
	# 奇襲：新的一場每位武將恢復一次
	_assassinate_used.clear()
	_assassinate_log.clear()
	# 魅惑：新的一場冷卻清空
	_charm.clear()
	# 新的一場：清掉上一場的部署慢速與手動暫停，速度回到 1 倍
	_reset_speed()
	_reset_pause()
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
	# 手動暫停時 Main 已停掉這個節點的處理；這裡再擋一次，戰鬥時間（結算的 time_seconds）不前進
	if game_state != GameState.BATTLE or manual_paused:
		return
	battle_time += delta
	# 波次切換已全面改用信號驅動，不再使用強制間隔計時。

# ── 玩家操作 ─────────────────────────────────────────────────
## 暫停中不能開戰（Web 的按鈕也停用；這裡是最後一道檢查）
func player_start_battle() -> void:
	if game_state != GameState.PREP or manual_paused:
		return
	_spawn_next_wave()

## 暫停中不能切換自動：不改狀態，只把目前的狀態再同步給 Web
func toggle_auto_mode() -> void:
	if manual_paused:
		_sync_stats_to_web()
		return
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

## 拆除防禦塔的返還（Round 18）：只增加這一場的戰鬥金幣；不是擊殺收益，不改 kills、星數、戰場點數，也不寫存檔
func refund_gold(amount: int) -> void:
	if amount <= 0:
		return
	battle_gold += amount
	battle_gold_changed.emit(battle_gold)
	_sync_stats_to_web()

# ── 敵人事件（由 Main.gd 轉接）────────────────────────────────
## 敵人抵達城池（漏城）：累計的漏城傷害 T 加上當下生效的倍率（守護，見 base_guard_source；沒有時 1），城防扣「ceil(T − LEAK_EPS) − 已經扣掉的」。
## 回傳這一次扣掉的城防（守護保住時是 0）；結算後的抵達不處理，回傳 -1。enemy 只用來在紀錄裡寫生成序號。
## 城防一律是整數：base_hp_changed 與 update_stats 送出實際的城防，星數與戰場點數照實際的城防計算
func on_enemy_reached_base(enemy: Node = null) -> int:
	if game_state == GameState.RESULT:
		return -1
	var src: Dictionary = base_guard_source()
	var before: float = _leak_total
	_leak_total += float(src.mult)
	var target: int = int(ceil(_leak_total - LEAK_EPS))
	var loss: int = maxi(0, target - _leak_lost)
	_leak_lost += loss
	base_hp -= loss
	var seq: Variant = enemy.get("spawn_seq") if enemy != null and is_instance_valid(enemy) else null
	_leak_log.append({"seq": int(seq) if seq != null else -1, "mult": float(src.mult), "source": str(src.hero_id),
		"t_before": before, "t_after": _leak_total, "loss": loss, "lost": _leak_lost, "hp": base_hp})
	if _leak_log.size() > LEAK_LOG_MAX:
		_leak_log.pop_front()
	base_hp_changed.emit(base_hp, MAX_BASE_HP)
	_sync_stats_to_web()
	if base_hp <= 0:
		_end_battle(false)
	return loss

## 有效擊殺：擊殺 +1、戰鬥金幣 + 每次擊殺的金幣。補給在結算這一次擊殺的當下確認來源（只改這個入口）；
## enemy 是被打倒的敵人（只用來在紀錄裡寫生成序號，沒有傳入時是 -1）
func on_enemy_killed(enemy: Node = null) -> void:
	if game_state == GameState.RESULT:
		return
	kills += 1
	var src: Dictionary = supply_source()
	var gold: int = kill_gold(float(src.mult))
	var seq: Variant = enemy.get("spawn_seq") if enemy != null and is_instance_valid(enemy) else null
	_kill_gold_log.append({"seq": int(seq) if seq != null else -1, "kills": kills, "base": GOLD_PER_KILL, "gold": gold,
		"mult": float(src.mult), "source": str(src.hero_id)})
	if _kill_gold_log.size() > KILL_GOLD_LOG_MAX:
		_kill_gold_log.pop_front()
	earn_gold(gold)

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
	# 遊戲計時器：掛在這個節點底下，手動暫停時跟著停住、繼續後只等剩下的時間
	create_game_timer(self, AUTO_NEXT_WAVE_DELAY).timeout.connect(func():
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

## 遊戲時間的單次計時器：Timer 節點掛在 parent 底下，照 Engine.time_scale 倒數；parent 的處理被停掉（手動暫停）
## 或 SceneTree 暫停時一起停住，恢復後只跑剩下的時間（不重新計滿）。觸發後自行釋放。
## 取代 SceneTree.create_timer：它預設在暫停時照走，也不跟著節點停住。sec ≤ 0 時在下一個有處理的幀觸發
static func create_game_timer(parent: Node, sec: float) -> Timer:
	var t := Timer.new()
	t.one_shot = true
	t.wait_time = maxf(sec, 0.0001)
	t.timeout.connect(t.queue_free)
	parent.add_child(t)
	t.start()
	return t

func _spawn_next_wave() -> void:
	var next_wave: int = current_wave + 1
	# 關卡沒有任何波次（total_waves 是 0）時不能直接 return：那樣會一直停在備戰、按了迎戰沒有反應。
	# 照一般的拒絕流程處理第 1 波（WaveManager 回報缺少這一波的資料），不結算、不當成清波勝利
	if next_wave > total_waves and total_waves > 0:
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
## 避免無效設定被當成「清波」而直接給勝利獎勵；切換到有效關卡即可恢復。關卡完全沒有波次時同樣拒絕第 1 波。
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
	# 先建立結算，再發出任何信號：之後的信號處理即使載入了新關卡，
	# 這筆結算仍是產生它的那一場的內容與 battle_id，不會改套新場次的識別碼
	var result: Dictionary = {
		"result":       "WIN" if is_win else "LOSE",
		"stage_id":     stage_id,
		"battle_id":    battle_id,
		"stars_earned": _calc_stars() if is_win else 0,
		"kills":        kills,
		"time_seconds": int(battle_time),
		"loots":        [{ "item": "battle_points", "count": _calc_battle_points() if is_win else 10 }]
	}
	_cancel_auto_wave()
	# 結算後不再有部署慢速、加速或手動暫停：結算畫面與之後的新場次都從 1 倍、未暫停開始（結算內容已在上面先建立）
	_reset_speed()
	_reset_pause()
	game_state = GameState.RESULT
	state_changed.emit(game_state)
	battle_ended.emit(result)
	if _web_bridge:
		_web_bridge.send_result(result)
	_sfx_stop_bgm()
	_sfx("battle_win" if is_win else "battle_lose")

func _sync_stats_to_web() -> void:
	if _web_bridge == null:
		return
	var stats = {
		"battle_id": battle_id,
		"gold": battle_gold,
		"wave": current_wave,
		"total_waves": total_waves,
		"hp": base_hp,
		"max_hp": MAX_BASE_HP,
		"game_state": game_state,
		"auto_mode": auto_mode,
		"auto_next_wave_pending": _auto_wave_pending,
		# 戰鬥速度：已確認的玩家選擇、實際倍率、是否在部署選單的暫時慢速中
		"speed": speed_pref,
		"time_scale": effective_time_scale(),
		"deploy_slow": deploy_menu_id != 0,
		# 手動暫停：已確認的狀態。暫停中 time_scale 仍是繼續後會用的倍率
		"paused": manual_paused,
		# 守護（孫權）：此刻生效的漏城傷害倍率（沒有生效的守護時是 1）；只是顯示用，城防由 Godot 計算
		"base_guard_mult": float(base_guard_source().mult),
	}
	_web_bridge.send_stats(stats)

# ── 戰鬥速度 ──────────────────────────────────────────────
## 實際的時間倍率：部署選單開著時固定 0.1（不乘上玩家選的速度），否則是玩家選的速度
func effective_time_scale() -> float:
	return DEPLOY_TIME_SCALE if deploy_menu_id != 0 else float(speed_pref)

func _apply_time_scale() -> void:
	Engine.time_scale = effective_time_scale()

func _reset_speed() -> void:
	speed_pref = 1
	deploy_menu_id = 0
	_apply_time_scale()

## 打開部署選單（玩家點了可部署的空格）：進入暫時慢速，回傳這個選單的編號（Web 關閉選單時帶回）。
## 只有備戰與戰鬥中、沒有手動暫停時可以打開，其他狀態回傳 0（不開選單、不改倍率）
func open_deploy_menu() -> int:
	if game_state != GameState.PREP and game_state != GameState.BATTLE:
		return 0
	if manual_paused:
		return 0
	_deploy_menu_seq += 1
	deploy_menu_id = _deploy_menu_seq
	_apply_time_scale()
	_sync_stats_to_web()
	return deploy_menu_id

## 關閉部署選單（取消或部署完成）：只接受這一場、目前開著的那個選單，恢復玩家選的速度。
## 別場、較早的選單、已經關閉的命令都不改倍率，回傳 false
func close_deploy_menu(p_battle_id: String, menu_id: int) -> bool:
	if p_battle_id == "" or p_battle_id != battle_id or menu_id <= 0 or menu_id != deploy_menu_id:
		return false
	deploy_menu_id = 0
	_apply_time_scale()
	_sync_stats_to_web()
	return true

## 玩家選擇戰鬥速度：只接受這一場、備戰或戰鬥中、數字 1 或 2（JSON 的數字是 float）；字串、布林、其他數值都不接受。
## 成功回傳空字串，否則回傳原因且不改任何狀態。部署選單開著時只更新選擇，實際倍率仍是慢速，關閉選單後才套用。
## 只改倍率：不動 SceneTree.paused 與手動暫停（暫停中選速度只記下，繼續後才套用），不重設任何計時器
func set_speed(p_battle_id: String, raw: Variant) -> String:
	if p_battle_id == "" or p_battle_id != battle_id:
		return "stale_battle"
	if game_state != GameState.PREP and game_state != GameState.BATTLE:
		return "not_active"
	var v: int = 0
	if raw is int:
		v = raw
	elif raw is float and (raw == 1.0 or raw == 2.0):
		v = int(raw)
	if v != 1 and v != 2:
		return "invalid_speed"
	speed_pref = v
	_apply_time_scale()
	_sync_stats_to_web()
	return ""

## 手動暫停／繼續：只接受這一場、備戰或戰鬥中、paused 是布林（true 暫停、false 繼續）。
## 命令帶的是目標狀態、不是切換：重送同一個值回傳成功但不改任何東西。字串、數字、null、沒有帶都不接受。
## 成功回傳空字串，否則回傳原因且不改任何狀態。不改玩家選的速度與部署慢速，也不動 Engine.time_scale 與 SceneTree.paused
func set_paused(p_battle_id: String, raw: Variant) -> String:
	if p_battle_id == "" or p_battle_id != battle_id:
		return "stale_battle"
	if game_state != GameState.PREP and game_state != GameState.BATTLE:
		return "not_active"
	if not (raw is bool):
		return "invalid_paused"
	if raw != manual_paused:
		manual_paused = raw
		pause_changed.emit(manual_paused)
		_sync_stats_to_web()
	return ""

## 解除手動暫停（新的一場、結算）：一律發出信號，讓 Main 把模擬用的節點恢復處理
func _reset_pause() -> void:
	manual_paused = false
	pause_changed.emit(false)

## 首擊加倍：這位武將在這一場還沒用過就記下並回傳 true（武將真的攻擊到有效目標時才呼叫）
func consume_first_strike(hero_id: String, damage: float) -> bool:
	if hero_id == "" or _first_strike_used.has(hero_id):
		return false
	_first_strike_used[hero_id] = damage
	return true

## 戰神：這位武將在這一場目前的層數（沒有紀錄時是 0）
func berserk_stacks(hero_id: String) -> int:
	return int(_berserk.get(hero_id, {}).get("stacks", 0))

## 戰神：記下這位武將自己打倒的一名敵人（seq 是敵人的生成序號、damage 是這一擊的傷害、dealt 是實扣），層數加一但不超過 max_stacks。
## 回傳加層前後的層數（已經是上限時相同）
func add_berserk_kill(hero_id: String, max_stacks: int, seq: int, damage: float, dealt: float) -> Dictionary:
	if hero_id == "":
		return {"before": 0, "after": 0}
	var rec: Dictionary = _berserk.get(hero_id, {"stacks": 0, "kills": 0, "log": []})
	var before: int = int(rec.stacks)
	var after: int = before + 1 if before < max_stacks else before
	rec.stacks = after
	rec.kills = int(rec.kills) + 1
	rec.log.append({"seq": seq, "damage": damage, "dealt": dealt, "before": before, "after": after})
	if rec.log.size() > BERSERK_LOG_MAX:
		rec.log.pop_front()
	_berserk[hero_id] = rec
	return {"before": before, "after": after}

## 戰神：清掉這位武將在這一場的層數與紀錄（換成其他技能時）
func clear_berserk(hero_id: String) -> void:
	_berserk.erase(hero_id)

## 戰神：這位武將在這一場的紀錄（唯讀的複本；沒有時是空字典）
func berserk_record(hero_id: String) -> Dictionary:
	return _berserk.get(hero_id, {}).duplicate(true)

## 補給：每次有效擊殺的戰鬥金幣＝基礎 × 倍率（向下取整）；倍率不大於 1（沒有補給）時就是基礎
static func kill_gold(mult: float) -> int:
	if not (mult > 1.0 and is_finite(mult)):
		return GOLD_PER_KILL
	return int(floor(float(GOLD_PER_KILL) * mult + SUPPLY_EPS))

## 補給：登記／取消有補給技能的武將（Hero 讀完技能時呼叫）
func register_supply(hero: Node) -> void:
	if hero != null:
		_supply_sources[hero.get_instance_id()] = weakref(hero)

func unregister_supply(hero: Node) -> void:
	if hero != null:
		_supply_sources.erase(hero.get_instance_id())

## 補給：此刻有效的來源 [{hero_id, mult}]（登記的順序）。逐一確認：節點仍有效、在場景樹裡、沒有正要被移除、生命大於 0、
## 技能仍是補給且倍率合理（Hero.supply_active）。只讀，不改登記
func supply_active_sources() -> Array:
	var out: Array = []
	for key in _supply_sources:
		var h: Variant = _supply_sources[key].get_ref()
		if h == null or not is_instance_valid(h) or not h.supply_active():
			continue
		out.append({"hero_id": str(h.hero_id), "mult": float(h.supply_gold_multiplier)})
	return out

## 補給：此刻最強的來源 {hero_id, mult}：多個來源只取最高的倍率（不相乘、不相加），倍率相同時取先登記的；沒有時 hero_id 是空字串、mult 是 1
func supply_source() -> Dictionary:
	var best: Dictionary = {"hero_id": "", "mult": 1.0}
	for s in supply_active_sources():
		if float(s.mult) > float(best.mult):
			best = s
	return best

## 補給（測試用唯讀資訊）：此刻有效的來源與最強的一個、基礎與有效的每次擊殺金幣、最近幾次擊殺的金幣結算
## （生成序號、結算後的擊殺數、基礎、實得、倍率、來源）
func supply_debug() -> Dictionary:
	var src: Dictionary = supply_source()
	return {"hero_id": src.hero_id, "mult": src.mult, "base_gold": GOLD_PER_KILL, "kill_gold": kill_gold(float(src.mult)),
		"sources": supply_active_sources(), "log": _kill_gold_log.duplicate(true)}

## 戰鬥中而且沒有手動暫停（只在這時候生效的技能用它判斷；單獨建立的 BattleManager 由測試設定狀態）
func combat_active() -> bool:
	return game_state == GameState.BATTLE and not manual_paused

## 奇襲：這位武將在這一場還沒用過
func assassinate_ready(hero_id: String) -> bool:
	return hero_id != "" and not _assassinate_used.has(hero_id)

## 奇襲：記下這位武將在這一場用掉了（entry 是那一次的紀錄）；已經用過時不改
func record_assassinate(hero_id: String, entry: Dictionary) -> void:
	if hero_id == "" or _assassinate_used.has(hero_id):
		return
	var e: Dictionary = entry.duplicate(true)
	e["hero_id"] = hero_id
	e["t"] = battle_time
	_assassinate_used[hero_id] = e
	_assassinate_log.append(e.duplicate(true))
	if _assassinate_log.size() > ASSASSINATE_LOG_MAX:
		_assassinate_log.pop_front()

## 奇襲：這位武將在這一場用掉的那一次（唯讀的複本；還沒用過時是空字典）
func assassinate_record(hero_id: String) -> Dictionary:
	return _assassinate_used.get(hero_id, {}).duplicate(true)

## 奇襲（測試用唯讀資訊）：這一場用過的武將與最近幾次的紀錄
func assassinate_debug() -> Dictionary:
	var used: Array = _assassinate_used.keys()
	used.sort()
	return {"used": used, "log": _assassinate_log.duplicate(true)}

## 這一場的生命週期編號（每次 initialize 加一）：受控的敵人用它確認來源仍屬於同一場
func lifecycle() -> int:
	return _lifecycle

## 魅惑：這位武將此刻能不能控制（這一場還沒控制過，或冷卻已經結束）
func charm_ready(hero_id: String) -> bool:
	return hero_id != "" and battle_time >= float(_charm.get(hero_id, {}).get("ready_at", 0.0))

## 魅惑：這位武將此刻剩下的冷卻（秒，戰鬥時間；沒有在冷卻時是 0）
func charm_remaining(hero_id: String) -> float:
	return maxf(0.0, float(_charm.get(hero_id, {}).get("ready_at", 0.0)) - battle_time)

## 魅惑：記下這位武將成功控制一次（entry 是紀錄），冷卻 cooldown 秒（從此刻的戰鬥時間起算，不累積）
func record_charm(hero_id: String, cooldown: float, entry: Dictionary) -> void:
	if hero_id == "":
		return
	var rec: Dictionary = _charm.get(hero_id, {"ready_at": 0.0, "count": 0, "log": []})
	rec["ready_at"] = battle_time + cooldown
	rec["count"] = int(rec.count) + 1
	var e: Dictionary = entry.duplicate(true)
	e["t"] = battle_time
	rec.log.append(e)
	if rec.log.size() > CHARM_LOG_MAX:
		rec.log.pop_front()
	_charm[hero_id] = rec

## 魅惑：這位武將在這一場的紀錄（唯讀的複本；沒有時是空字典）
func charm_record(hero_id: String) -> Dictionary:
	return _charm.get(hero_id, {}).duplicate(true)

func _charm_summary() -> Dictionary:
	var out: Dictionary = {}
	for hid in _charm:
		out[hid] = {"count": int(_charm[hid].count), "remaining": charm_remaining(hid)}
	return out

## 怪力：這位武將此刻能不能推（這一場還沒推過，或冷卻已經結束）
func knockback_ready(hero_id: String) -> bool:
	return hero_id != "" and battle_time >= float(_knockback.get(hero_id, {}).get("ready_at", 0.0))

## 怪力：這位武將此刻剩下的冷卻（秒，戰鬥時間；沒有在冷卻時是 0）
func knockback_remaining(hero_id: String) -> float:
	return maxf(0.0, float(_knockback.get(hero_id, {}).get("ready_at", 0.0)) - battle_time)

## 怪力：記下這位武將成功推動一次（entry 是推動的紀錄），冷卻 cooldown 秒（從此刻的戰鬥時間起算，不累積）
func record_knockback(hero_id: String, cooldown: float, entry: Dictionary) -> void:
	if hero_id == "":
		return
	var rec: Dictionary = _knockback.get(hero_id, {"ready_at": 0.0, "count": 0, "log": []})
	rec.ready_at = battle_time + cooldown
	rec.count = int(rec.count) + 1
	var e: Dictionary = entry.duplicate(true)
	e["t"] = battle_time
	rec.log.append(e)
	if rec.log.size() > KNOCKBACK_LOG_MAX:
		rec.log.pop_front()
	_knockback[hero_id] = rec

## 怪力：這位武將在這一場的紀錄（唯讀的複本；沒有時是空字典）
func knockback_record(hero_id: String) -> Dictionary:
	return _knockback.get(hero_id, {}).duplicate(true)

## 守護：登記／取消有守護技能的武將（Hero 讀完技能時呼叫）；之後把目前生效的倍率重新送給網頁（戰場上方的城防旁）
func register_base_guard(hero: Node) -> void:
	if hero != null:
		_base_guard_sources[hero.get_instance_id()] = weakref(hero)
		notify_base_guard_changed()

func unregister_base_guard(hero: Node) -> void:
	if hero != null and _base_guard_sources.erase(hero.get_instance_id()):
		notify_base_guard_changed()

## 守護的來源可能改變了（登記、取消、來源離開場上）：在這一幀的最後把狀態重新送給網頁一次（同一幀多次只送一次；
## 延後是為了讓陣亡或被移除的武將先離開場上，送出的倍率才是之後生效的數值）
func notify_base_guard_changed() -> void:
	if _base_guard_sync_pending:
		return
	_base_guard_sync_pending = true
	call_deferred("_flush_base_guard_sync")

func _flush_base_guard_sync() -> void:
	_base_guard_sync_pending = false
	_sync_stats_to_web()

## 守護：此刻有效的來源 [{hero_id, mult}]（登記的順序）。逐一確認：節點仍有效、在場景樹裡、沒有正要被移除、生命大於 0、
## 技能仍是守護且倍率合理（Hero.base_guard_active）。只讀，不改登記
func base_guard_active_sources() -> Array:
	var out: Array = []
	for key in _base_guard_sources:
		var h: Variant = _base_guard_sources[key].get_ref()
		if h == null or not is_instance_valid(h) or not h.base_guard_active():
			continue
		out.append({"hero_id": str(h.hero_id), "mult": float(h.base_guard_mult)})
	return out

## 守護：此刻最強的來源 {hero_id, mult}：多個來源只取倍率最小的一個（不相乘、不相加），倍率相同時取先登記的；沒有時 hero_id 是空字串、mult 是 1
func base_guard_source() -> Dictionary:
	var best: Dictionary = {"hero_id": "", "mult": 1.0}
	for s in base_guard_active_sources():
		if float(s.mult) < float(best.mult):
			best = s
	return best

## 守護（測試用唯讀資訊）：此刻有效的來源與最強的一個、這一場累計的漏城傷害 T 與已經扣掉的城防 A、目前的城防、最近幾次抵達的紀錄
func base_guard_debug() -> Dictionary:
	var src: Dictionary = base_guard_source()
	return {"hero_id": src.hero_id, "mult": src.mult, "sources": base_guard_active_sources(), "total": _leak_total, "lost": _leak_lost,
		"base_hp": base_hp, "log": _leak_log.duplicate(true)}

func _knockback_summary() -> Dictionary:
	var out: Dictionary = {}
	for hid in _knockback:
		out[hid] = {"count": int(_knockback[hid].count), "remaining": knockback_remaining(hid)}
	return out

func _berserk_summary() -> Dictionary:
	var out: Dictionary = {}
	for hid in _berserk:
		out[hid] = {"stacks": int(_berserk[hid].stacks), "kills": int(_berserk[hid].kills)}
	return out

## 測試用唯讀狀態（debug_snapshot）
func get_debug_state() -> Dictionary:
	return {
		"first_strike_used": _first_strike_used.duplicate(),
		# 戰神：這一場每位武將的層數與擊殺次數（不含紀錄；武將移出隊伍時也看得到保留的層數）
		"berserk_stacks": _berserk_summary(),
		# 補給：此刻有效的來源、每次擊殺的金幣與最近幾次擊殺的金幣結算
		"supply": supply_debug(),
		# 怪力：這一場每位武將成功推動的次數與此刻剩下的冷卻（武將移出隊伍時也看得到保留的冷卻）、戰鬥時間
		"knockback": _knockback_summary(),
		# 守護：此刻有效的來源、這一場累計的漏城傷害與已經扣掉的城防、最近幾次抵達
		"base_guard": base_guard_debug(),
		# 奇襲：這一場用過的武將與最近幾次的紀錄
		"assassinate": assassinate_debug(),
		# 魅惑：這一場每位武將成功控制的次數與此刻剩下的冷卻
		"charm": _charm_summary(),
		"battle_time": battle_time,
		"lifecycle": _lifecycle,
		"auto_wave_token": _auto_wave_token,
		"auto_next_wave_pending": _auto_wave_pending,
		"speed_pref": speed_pref,
		"deploy_menu_id": deploy_menu_id,
		"manual_paused": manual_paused,
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
