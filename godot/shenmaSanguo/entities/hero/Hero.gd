## Hero.gd
## 武將：放置於 ROAD 或 BUILD，自動攻擊範圍內敵人
## ROAD 上：攻擊最近敵人並施加緩速（模擬阻擋；飛行敵人不受阻擋，不施加）。打過的地面敵人留在射程內就持續減速，
## 離開射程、倒下，或武將離開道路／被移除時只撤除這位武將自己的減速（見 _update_slows）
## BUILD 上：攻擊最近敵人（不阻擋）
## 對空：弓兵（archer）、法師（mage）可以攻擊地面與飛行敵人；步兵、騎兵、砲兵與不認得的職業只打地面

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

# ── 對空 ──────────────────────────────────────────────────────
## 可以攻擊飛行敵人的職業（heroes_config 的 job）；其他職業（包括沒有設定、不認得的值）只打地面
const AIR_JOBS: Array     = ["archer", "mage"]
var job: String           = ""
var can_hit_air: bool     = false

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
## 這位武將施加減速時用的來源（每個武將節點各自不同：同一位武將移除後重新放置也是新的來源）。
## 道路阻擋與減速光環是兩個來源：光環範圍內的敵人離開道路阻擋後，光環的減速照常生效
var slow_source: String   = ""
var aura_source: String   = ""
## 目前被這位武將的道路阻擋減速的敵人（instance id → 敵人）：每一幀檢查、刷新或撤除，不留已經無效的引用
var _road_slowed: Dictionary = {}

# ── 技能（出征資料 team_list 的 skill，定義在 Web 的 utils/heroSkills）────
## 首擊加倍（first_strike，馬超「衝鋒」）：每場戰鬥首次有效普通攻擊的傷害倍率；1.0 代表沒有這個技能
var first_strike_multiplier: float = 1.0
## 百步穿楊（long_range）：有效射程倍率；1.0 代表沒有這個技能。射程每次都從設定重新計算（_compute_range），不會疊乘
var range_multiplier: float = 1.0
## 火攻（burn）：每次有效普通攻擊命中後，對目標附加灼燒（每跳＝命中時攻擊力 × burn_ratio，共 burn_ticks 跳，間隔 burn_interval 秒）。
## burn_ratio 0 代表沒有這個技能；灼燒本身記在敵人身上（Enemy.apply_burn），跳傷不會再觸發火攻
var burn_ratio: float = 0.0
var burn_ticks: int = 0
var burn_interval: float = 1.0
## 橫掃（sweep）：每次有效普通攻擊命中後，以主目標被打中時的位置為中心、半徑 sweep_radius 格（含邊界）內，
## 對最多 sweep_max_targets 名其他仍存活的敵人各造成這一擊傷害 × sweep_ratio（由近到遠，距離相同時生成序號小的優先）。
## sweep_ratio 0 代表沒有這個技能；橫掃的傷害走敵人一般的受傷／死亡流程，不再觸發橫掃或其他普通攻擊技能，也不增加攻擊次數。
## 目前沒有綁定任何正式武將（網頁的技能定義不送 sweep）：保留作技能原型，出征資料帶 sweep 時才啟用
var sweep_ratio: float = 0.0
var sweep_radius: float = 0.0
var sweep_max_targets: int = 0
## 測試用唯讀統計（debug_snapshot）：這位武將的橫掃次數（有打到副目標的普通攻擊）與打到的副目標總數
var sweep_count: int = 0
var sweep_hits: int = 0
## 橫掃範圍效果顯示的時間（秒，遊戲時間）
const SWEEP_FX_TIME: float = 0.3
## 範圍邊界的容許誤差（像素）：距離正好是半徑的敵人算在範圍內
const SWEEP_EDGE_EPS: float = 0.001
## 閃避（dodge）：每次受到敵人的直接攻擊（有效的正傷害）各自判定一次：抽一個 [0,1) 的亂數 u，u < dodge_chance 就閃避，
## 這一擊不扣血、上方出現「MISS」；否則照原本的防禦公式扣血。沒有冷卻、不疊加；升級、移位、跨波次都不改變機率。
## 閃避不取消攻擊：攻擊方照樣用掉這次攻擊的冷卻（由攻擊方處理），也不影響這位武將自己的普通攻擊。
## dodge_chance 0 代表沒有這個技能；機率不是 0～1 的有限數字時不啟用（不閃避）
var dodge_chance: float = 0.0
## 閃避用的亂數：每位武將各自一份，建立時隨機取種子（正式遊戲不固定種子，也沒有訊息或設定欄位可以控制它）
var _dodge_rng: RandomNumberGenerator = RandomNumberGenerator.new()
## 測試替身：有設定時用它回傳的值取代亂數。只有 Godot 測試直接設定這個屬性
var dodge_roll_override: Callable = Callable()
## 測試用唯讀統計（debug_snapshot）：判定次數（＝受到的有效攻擊次數）、閃避次數、最近 DODGE_LOG_MAX 次的抽樣值與結果
var dodge_rolls: int = 0
var dodge_count: int = 0
var dodge_log: Array = []
const DODGE_LOG_MAX: int = 40
## 閃避提示的顏色（藍白色，和金色的技能倍率、紅色的受傷數字區分）
const DODGE_COLOR: Color = Color(0.6, 0.92, 1.0)
## 減速光環（slow_aura，關羽）：戰鬥中（BATTLE）、這位武將活著且在場上時，以武將為中心、目前有效射程內（含邊界，比中心距離）
## 的所有地面敵人移動速度 × slow_aura_mult（0.9 ＝ 降低 10%）。不需要普通攻擊的目標、不看攻擊冷卻，也不改變普通攻擊；
## 飛行敵人（步兵本來就不能對空）與免疫減速的敵人不受影響。每一幀重新判斷：離開範圍、武將移位／升級改變範圍、倒下、被移除、
## 戰鬥結束時撤除自己的來源（最遲下一幀）。和其他倍率減速同時作用時由敵人取最強的一個（Enemy.speed_mult），不疊加。
## slow_aura_mult 1.0 代表沒有這個技能
var slow_aura_mult: float = 1.0
## 目前被光環減速的敵人（instance id → 敵人）
var _aura_slowed: Dictionary = {}
## 範圍邊界的容許誤差（像素）：距離正好是半徑的敵人算在範圍內
const AURA_EDGE_EPS: float = 0.001
## 光環範圍的顯示（戰鬥中畫出淺藍色的範圍圈）
const AURA_COLOR: Color = Color(0.45, 0.85, 1.0, 1.0)
var _aura_shown: bool = false
## BattleManager：記錄這一場哪些武將已用過首擊加倍（記在這裡而不是武將節點，移位、重新放置都不會重置）
var _battle_mgr: Node     = null

# 顏色（依職業差異）
var body_color: Color     = Color(0.20, 0.40, 0.80, 1)  # 預設藍

# ═══════════════════════════════════════════
#  初始化
# ═══════════════════════════════════════════
func _init() -> void:
	_dodge_rng.randomize()
	slow_source = "hero_road#%d" % get_instance_id()
	aura_source = "hero_aura#%d" % get_instance_id()

func setup(state: Dictionary, heroes_config: Array, cell: Vector2i, on_road: bool, wave_mgr: Node, battle_mgr: Node = null) -> void:
	hero_id    = str(state.get("hero_id", ""))
	_battle_mgr = battle_mgr
	_read_skill(state)
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
			
			# 基礎屬性與成長係數
			var base_spd: float   = float(cfg.get("attack_speed", 1.0))
			var spd_growth: float = float(cfg.get("atk_spd_growth", 0.0))

			# 計算最終屬性：屬性 = 基礎 + (等級-1) * 成長；射程另外乘上技能倍率
			attack_range = _compute_range(cfg)
			
			# 攻速計算：縮短攻擊間隔 (間隔 = 基礎 * (1 - (等級-1) * 成長))，最快不超過 0.1s
			attack_speed = max(0.1, base_spd * (1.0 - (hero_level - 1) * spd_growth))

			job = str(cfg.get("job", ""))
			can_hit_air = AIR_JOBS.has(job)
			match job:
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

## 讀取技能參數；沒有或不認得的技能一律當作普通攻擊。每種技能只讀自己的欄位
func _read_skill(state: Dictionary) -> void:
	first_strike_multiplier = 1.0
	range_multiplier = 1.0
	burn_ratio = 0.0
	burn_ticks = 0
	burn_interval = 1.0
	sweep_ratio = 0.0
	sweep_radius = 0.0
	sweep_max_targets = 0
	dodge_chance = 0.0
	slow_aura_mult = 1.0
	var skill = state.get("skill", null)
	if not (skill is Dictionary):
		return
	match str(skill.get("id", "")):
		"first_strike":
			first_strike_multiplier = max(1.0, float(skill.get("first_attack_multiplier", 1.0)))
		"long_range":
			range_multiplier = max(1.0, float(skill.get("range_multiplier", 1.0)))
		"burn":
			var interval: float = float(skill.get("burn_interval", 1.0))
			var ticks: int = int(skill.get("burn_ticks", 0))
			# 參數不合理（非正數）時不啟用，當作普通攻擊
			if interval > 0.0 and ticks > 0:
				burn_ratio = max(0.0, float(skill.get("burn_ratio", 0.0)))
				burn_ticks = ticks
				burn_interval = interval
		"sweep":
			var radius: float = float(skill.get("sweep_radius", 0.0))
			var max_targets: int = int(skill.get("sweep_max_targets", 0))
			var ratio: float = float(skill.get("sweep_ratio", 0.0))
			# 參數不合理（半徑、人數或比例非正數）時不啟用，當作普通攻擊
			if radius > 0.0 and max_targets > 0 and ratio > 0.0:
				sweep_radius = radius
				sweep_max_targets = max_targets
				sweep_ratio = ratio
		"dodge":
			# 機率要是 0～1 的有限數字（JSON 的數字在 Godot 是 float）；字串、布林、null、NaN、無限大、負數、超過 1 都不啟用
			var c: Variant = skill.get("dodge_chance")
			if (c is float or c is int) and is_finite(float(c)) and float(c) > 0.0 and float(c) <= 1.0:
				dodge_chance = float(c)
		"slow_aura":
			# 倍率要是 0～1 之間（不含兩端）的有限數字；字串、布林、null、NaN、無限大、0 以下、1 以上都不啟用
			var m: Variant = skill.get("slow_mult")
			if (m is float or m is int) and is_finite(float(m)) and float(m) > 0.0 and float(m) < 1.0:
				slow_aura_mult = float(m)

## 有效射程（格）＝（基礎射程 + (等級-1) × 射程成長）× 技能倍率。
## 每次都從設定重新計算，不在目前的值上再乘：更新隊伍、升級、移位、重新放置都不會疊乘
func _compute_range(cfg: Dictionary) -> float:
	var base_range: float   = float(cfg.get("attack_range", 2.0))
	var range_growth: float = float(cfg.get("range_growth", 0.0))
	return (base_range + (hero_level - 1) * range_growth) * range_multiplier

# ═══════════════════════════════════════════
#  _process — 自動攻擊
# ═══════════════════════════════════════════
## _atk_timer 是距離下一擊的遊戲時間：
## - 持續有目標時，下一擊排在「上一擊的預定時間＋攻擊間隔」，越過零點的零頭保留到下一次，不因幀長逐擊落後（1 倍與 2 倍的擊數相同）
## - 冷卻好了但沒有目標時停在 0（待命），不累積欠下的攻擊；取得目標的那一幀打一擊，之後照攻擊間隔
## - 一幀最多打一擊：單幀長過攻擊間隔時其餘的攻擊作廢（受幀率限制），下一擊從這一擊起算一個完整的攻擊間隔，不補發
## 切換速度、部署慢速、手動暫停、升級、重選目標都不重設這個計時器
func _process(delta: float) -> void:
	# 減速（道路阻擋、光環）每一幀更新，不看攻擊冷卻
	_update_slows()
	var was_ready: bool = _atk_timer <= 0.0
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
		# 待命停在 0，不囤積攻擊（射程內沒有目標時，道路阻擋的減速已由 _update_slows 撤除；其他來源的減速不受影響）
		_atk_timer = 0.0
		return

	# 攻擊。首擊加倍（衝鋒）：這一場第一次真的攻擊到有效目標時傷害加倍（沒有目標時不會走到這裡，也就不會用掉）
	var damage: float = atk
	if first_strike_multiplier > 1.0 and _battle_mgr != null:
		var boosted: float = atk * first_strike_multiplier
		if _battle_mgr.consume_first_strike(hero_id, boosted):
			damage = boosted
			# Godot 專案沒有中文字型（中文會顯示成方框），用一定顯示得出來的倍率標記（例如「x2!」）；技能說明裡寫明這個標記
			var m: float = first_strike_multiplier
			_show_skill_text("x%s!" % (str(int(m)) if is_equal_approx(m, roundf(m)) else String.num(m, 2)))
	# 橫掃以主目標被打中時的位置為中心：先記下位置，主目標被這一擊打倒也照樣生效
	var hit_pos: Vector2 = target.global_position
	target.take_damage(damage)
	# 火攻：這一擊命中後附加灼燒（快照是這次命中時的攻擊力）；目標被這一擊打倒時不附加
	if burn_ratio > 0.0 and is_instance_valid(target) and not target.is_dead():
		target.apply_burn(atk * burn_ratio, burn_ticks, burn_interval)
	if sweep_ratio > 0.0:
		_sweep(hit_pos, target, damage * sweep_ratio)
	_is_attacking = true
	_anim_timer   = 0.22
	# 保留這一幀越過零點的時間（零頭）；待命後的第一擊、或零頭長過一個間隔（極長的一幀）時從這一擊起算完整的間隔
	var late: float = 0.0 if was_ready else -_atk_timer
	_atk_timer    = attack_speed - (late if late < attack_speed else 0.0)
	queue_redraw()

	# ROAD 武將：在攻擊的回合對目標施加緩速（模擬阻擋；飛行敵人不被武將擋住，不施加）。之後每一幀在射程內就刷新（_update_slows）。
	# 目標可能被這一擊打倒並釋放，先確認還在
	if is_on_road and _enemy_alive(target) and not target.is_flying():
		target.apply_slow_from(slow_source, SLOW_RATIO, Enemy.SLOW_REFRESH_TTL)
		if target.has_slow_from(slow_source):
			_road_slowed[target.get_instance_id()] = target

## 這位武將能不能攻擊這個敵人：地面一律可以；飛行只有能對空的職業可以。選目標與橫掃都先經過這一關
func can_target(e: Node) -> bool:
	return can_hit_air or not e.is_flying()

func _find_target(enemies: Array, range_px: float) -> Node:
	# 先排除打不到的（飛行敵人只有能對空的職業打得到），再選「進度最靠近基地」且在範圍內的敵人
	var best: Node       = null
	var best_progress: float = -1.0
	for e in enemies:
		if not is_instance_valid(e) or e.is_dead() or not can_target(e):
			continue
		var dist: float = global_position.distance_to(e.global_position)
		if dist <= range_px and e.get_progress_ratio() > best_progress:
			best_progress = e.get_progress_ratio()
			best = e
	return best

## 橫掃：先選好副目標再造成傷害（受傷可能讓敵人死亡並從 WaveManager 的清單移除，不能邊走訪邊打）。
## 候選是目前關卡仍存活、這位武將打得到的其他敵人（不能對空的武將不會掃到飛行敵人），距離中心不超過半徑（含邊界）；
## 由近到遠，距離相同時生成序號小的優先，每個敵人最多一次
func _sweep(center: Vector2, primary: Node, sweep_damage: float) -> void:
	if not _wave_mgr or sweep_damage <= 0.0:
		return
	var radius_px: float = sweep_radius * tile_size
	var picks: Array = []
	for e in _wave_mgr.get_active_enemies():
		if e == primary or not is_instance_valid(e) or e.is_queued_for_deletion() or e.is_dead() or not can_target(e):
			continue
		var d: float = center.distance_to(e.global_position)
		if d <= radius_px + SWEEP_EDGE_EPS:
			# 距離取到 0.001 像素再比較：浮點誤差造成的極小差距視為等距，交給生成序號決定
			picks.append({"e": e, "d": snappedf(d, 0.001), "seq": int(e.spawn_seq)})
	picks.sort_custom(func(a, b): return a.d < b.d or (a.d == b.d and a.seq < b.seq))
	picks = picks.slice(0, sweep_max_targets)
	# 附近沒有其他敵人：就是一般的普通攻擊（不顯示效果、不計次）
	if picks.is_empty():
		return
	sweep_count += 1
	_show_sweep_fx(center, radius_px)
	for p in picks:
		var e: Node = p.e
		if is_instance_valid(e) and not e.is_dead():
			e.take_damage(sweep_damage)
			sweep_hits += 1

## 橫掃的範圍效果：以主目標位置為中心的金色弧光，SWEEP_FX_TIME 秒（遊戲時間）後消失。
## 掛在武將底下（不跟著武將移動）：手動暫停時跟著停住，武將被移除或切換關卡時一起清除
func _show_sweep_fx(center: Vector2, radius_px: float) -> void:
	var fx := SweepFx.new()
	fx.radius = radius_px
	fx.duration = SWEEP_FX_TIME
	fx.top_level = true
	add_child(fx)
	fx.global_position = center

## 技能觸發時在武將上方顯示的文字（金色、放大，和一般的傷害數字區分）
func _show_skill_text(text: String) -> void:
	var ft = load("res://ui/FloatingText.gd").new()
	get_parent().add_child(ft)
	ft.scale = Vector2(1.5, 1.5)
	ft.setup(text, Color(1.0, 0.85, 0.2), global_position + Vector2(0, -hero_half - 12))

## 每一幀更新這位武將自己的兩個減速來源（只動自己的來源，其他武將、防禦塔的減速不受影響）：
## - 道路阻擋：打過的地面敵人還在射程內（和選目標相同的距離判斷）就刷新；離開射程、倒下、武將不在道路上或正要被移除時撤除
## - 減速光環：見 slow_aura_mult
func _update_slows() -> void:
	var leaving: bool = is_queued_for_deletion() or current_hp <= 0.0
	var range_px: float = attack_range * tile_size
	for id in _road_slowed.keys():
		var e: Variant = _road_slowed[id]
		if leaving or not is_on_road or not _enemy_alive(e) or global_position.distance_to(e.global_position) > range_px:
			if is_instance_valid(e):
				e.remove_slow_from(slow_source)
			_road_slowed.erase(id)
		else:
			e.apply_slow_from(slow_source, SLOW_RATIO, Enemy.SLOW_REFRESH_TTL)

	var active: bool = slow_aura_mult < 1.0 and not leaving and _wave_mgr != null and _in_battle()
	var keep: Dictionary = {}
	if active:
		var radius_px: float = range_px + AURA_EDGE_EPS
		for e in _wave_mgr.get_active_enemies():
			if _enemy_alive(e) and not e.is_flying() and global_position.distance_to(e.global_position) <= radius_px:
				e.apply_slow_from(aura_source, slow_aura_mult, Enemy.SLOW_REFRESH_TTL)
				# 免疫減速的敵人不會套用，也就不列入
				if e.has_slow_from(aura_source):
					keep[e.get_instance_id()] = e
	for id in _aura_slowed:
		if not keep.has(id) and is_instance_valid(_aura_slowed[id]):
			_aura_slowed[id].remove_slow_from(aura_source)
	_aura_slowed = keep
	if active != _aura_shown:
		_aura_shown = active
		queue_redraw()

## 撤除這位武將施加的所有減速（被移除、倒下、切換關卡時離開場景樹）
func _release_slows() -> void:
	for id in _road_slowed:
		if is_instance_valid(_road_slowed[id]):
			_road_slowed[id].remove_slow_from(slow_source)
	for id in _aura_slowed:
		if is_instance_valid(_aura_slowed[id]):
			_aura_slowed[id].remove_slow_from(aura_source)
	_road_slowed.clear()
	_aura_slowed.clear()

func _exit_tree() -> void:
	_release_slows()

## 戰鬥中（BATTLE）才有光環；沒有 BattleManager（單獨建立的武將）時視為戰鬥中
func _in_battle() -> bool:
	return _battle_mgr == null or _battle_mgr.game_state == BattleManager.GameState.BATTLE

func _enemy_alive(e: Variant) -> bool:
	return e != null and is_instance_valid(e) and not e.is_queued_for_deletion() and not e.is_dead()

## 測試用唯讀資訊（debug_snapshot）：光環的倍率、半徑（格）與目前影響的敵人；道路阻擋目前減速的敵人
func slow_state() -> Dictionary:
	return {"aura_mult": slow_aura_mult, "radius": attack_range, "aura_active": _aura_shown,
		"aura": _aura_slowed.keys().map(func(k): return str(k)), "road": _road_slowed.keys().map(func(k): return str(k)),
		"aura_source": aura_source, "road_source": slow_source}

# ═══════════════════════════════════════════
#  受傷（被擋住的敵人攻擊阻路武將；閃避見 dodge_chance）
# ═══════════════════════════════════════════
func take_damage(amount: float) -> void:
	if current_hp <= 0.0:
		return
	# 無效的傷害（0、負數、NaN、無限大）不處理：不扣血、不判定閃避（不抽亂數），血量不會變成 NaN
	if not (amount > 0.0 and is_finite(amount)):
		return
	# 閃避：仍在場上（沒有被移除）的武將每受到一擊判定一次；閃避的這一擊不扣血
	if dodge_chance > 0.0 and not is_queued_for_deletion():
		var u: float = _dodge_roll()
		var dodged: bool = u < dodge_chance
		dodge_rolls += 1
		dodge_log.append({"u": u, "dodged": dodged})
		if dodge_log.size() > DODGE_LOG_MAX:
			dodge_log.pop_front()
		if dodged:
			dodge_count += 1
			_show_dodge()
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

## 閃避判定用的亂數 u（0 ≤ u < 1）：randi 是 32 位元整數，除以 2^32 不會得到 1（randf 可能剛好回傳 1.0）。
## 有測試替身時改用替身的值（測試用來驗證 0、0.149999、0.15、接近 1 這些邊界）
func _dodge_roll() -> float:
	if dodge_roll_override.is_valid():
		return float(dodge_roll_override.call())
	return float(_dodge_rng.randi()) / 4294967296.0

## 閃避提示：武將上方出現藍白色的「MISS」（Godot 專案沒有中文字型，不用「閃避」兩個字；技能說明裡寫明這個標記）。
## FloatingText 照遊戲時間移動、淡出：受時間倍率影響，手動暫停時跟著停住
func _show_dodge() -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var ft = load("res://ui/FloatingText.gd").new()
	parent.add_child(ft)
	ft.setup("MISS", DODGE_COLOR, global_position + Vector2(0, -hero_half - 4))

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

	# 減速光環的範圍（戰鬥中）：淺藍色的淡圈，半徑是目前的有效射程
	if _aura_shown:
		var ar: float = attack_range * tile_size
		draw_circle(Vector2.ZERO, ar, Color(AURA_COLOR, 0.07))
		draw_arc(Vector2.ZERO, ar, 0, TAU, 48, Color(AURA_COLOR, 0.45), 1.5)

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
func apply_stat_update(new_state: Dictionary, heroes_config: Array) -> void:
	var new_max_hp: float = float(new_state.get("hp", max_hp))
	var hp_ratio: float   = current_hp / max_hp if max_hp > 0.0 else 1.0

	hero_level = int(new_state.get("level", hero_level))
	atk        = float(new_state.get("atk", atk))
	# 技能參數跟著隊伍資料更新；這一場是否已用過首擊加倍記在 BattleManager，不會因此重置
	if new_state.has("skill"):
		_read_skill(new_state)
	def_stat   = float(new_state.get("def", def_stat))
	max_hp     = new_max_hp
	current_hp = new_max_hp * hp_ratio

	for cfg in heroes_config:
		if cfg.get("hero_id", "") == hero_id:
			var base_spd: float     = float(cfg.get("attack_speed", 1.0))
			var spd_growth: float   = float(cfg.get("atk_spd_growth", 0.0))
			attack_range = _compute_range(cfg)
			attack_speed = max(0.1, base_spd * (1.0 - (hero_level - 1) * spd_growth))
			break

	queue_redraw()

func get_cell() -> Vector2i:
	return grid_cell

func get_attack_range_px() -> float:
	return attack_range * tile_size

## 移位：之後的減速照新的位置與格子判斷（下一幀撤除離開範圍的敵人；移到非道路格時撤除道路阻擋的減速）
func reposition(new_cell: Vector2i, world_pos: Vector2, game_map: Node) -> void:
	grid_cell = new_cell
	position = world_pos
	is_on_road = (game_map.get_tile_type(new_cell) == game_map.TileType.ROAD)
	queue_redraw()

## 橫掃的範圍效果（不用文字，Godot 專案沒有中文字型）
class SweepFx extends Node2D:
	var radius: float = 48.0
	var duration: float = 0.3
	## 已經過的遊戲時間（秒）：_process 的 delta，受時間倍率影響、手動暫停時不前進
	var elapsed: float = 0.0

	func _ready() -> void:
		z_index = 50

	func _process(delta: float) -> void:
		elapsed += delta
		if elapsed >= duration:
			queue_free()
			return
		queue_redraw()

	func _draw() -> void:
		var k: float = clampf(1.0 - elapsed / duration, 0.0, 1.0)
		draw_circle(Vector2.ZERO, radius, Color(1.0, 0.85, 0.2, 0.18 * k))
		draw_arc(Vector2.ZERO, radius, -PI * 0.85, PI * 0.35, 24, Color(1.0, 0.9, 0.3, 0.95 * k), 4.0)
