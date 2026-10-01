## Hero.gd
## 武將：放置於 ROAD 或 BUILD，自動攻擊範圍內敵人
## ROAD 上：攻擊最近敵人並施加緩速（模擬阻擋；飛行敵人不受阻擋，不施加）。打過的地面敵人留在射程內就持續減速，
## 離開射程、倒下，或武將離開道路／被移除時只撤除這位武將自己的減速（見 _update_slows）
## BUILD 上：攻擊最近敵人（不阻擋）
## 對空：弓兵（archer）、法師（mage）可以攻擊地面與飛行敵人；步兵、騎兵、砲兵與不認得的職業只打地面
## 防禦光環（劉備）：範圍內其他武將受傷時用提高後的防禦計算（見 def_aura_mult、effective_def），不改 def_stat
## 暈眩（張飛）：普通攻擊命中後目標還活著時讓它暈眩（見 stun_duration；暈眩的狀態記在敵人身上，Enemy.apply_stun）
## 吸血（魏延）：普通攻擊命中後恢復這一擊實際扣掉敵人生命的一定比例（見 lifesteal_ratio；扣掉多少由 Enemy.take_damage 回傳）
## 攻速光環（曹操「指揮」）：範圍內其他武將之後開始的攻擊冷卻用加成後的攻擊間隔（見 atk_speed_aura_mult、effective_attack_interval），不改 attack_speed
## 反擊（夏侯惇）：受到敵人的直接攻擊、實際扣血後仍然活著時，把實扣生命的一定比例反彈給這個敵人（見 counter_ratio；攻擊者由 Enemy 傳入 take_damage）
## 堅韌（廖化）：受傷前的生命比例不高於門檻時，防禦計算後的傷害再乘上倍率（見 tenacity_hp_ratio、tenacity_damage_mult），不改防禦與最大生命

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
## 防禦光環（def_aura，劉備）：戰鬥中（BATTLE）、這位武將活著且在場上時，以武將為中心、目前有效射程內（含邊界，比中心距離）的
## 其他存活武將防禦力 × def_aura_mult（1.2 ＝ 提高 20%）；不含自己，防禦塔與城池不受影響，友軍的職業不限。
## 不需要普通攻擊的目標、不看攻擊冷卻，也不改變自己的普通攻擊。每一幀重新判斷：離開範圍、移位／升級改變範圍、倒下、被移除、
## 戰鬥結束時撤除自己的來源（最遲下一幀）。一位武將同時在幾個防禦光環裡時取最強的一個（def_bonus_mult），不相乘、不累加。
## def_aura_mult 1.0 代表沒有這個技能
var def_aura_mult: float = 1.0
## 這位武將施加防禦光環時用的來源（每個武將節點各自不同：移除後重新放置也是新的來源）
var def_aura_source: String = ""
## 目前被這位武將的防禦光環加成的武將（instance id → 武將）
var _def_buffed: Dictionary = {}
## 防禦光環的顯示：範圍圈（戰鬥中）與受到加成的武將外框都是淺綠色，和減速光環的淺藍色區分
const DEF_AURA_COLOR: Color = Color(0.55, 0.95, 0.55, 1.0)
var _def_aura_shown: bool = false
## 受到的防禦加成（其他武將的防禦光環）：每個來源各自保存 {倍率, 剩餘有效期}；生效的倍率 def_bonus_mult ＝ 所有來源中最大的，
## 沒有來源時是 1。同一個來源再次套用只刷新倍率與有效期；有效期用 _process 的 delta 倒數（遊戲時間，手動暫停時不前進）。
## 受傷時用 effective_def 計算；def_stat（隊伍資料的防禦）不會被改動，升級、更新隊伍後照新的防禦重新相乘
var def_bonus_mult: float = 1.0
var _def_sources: Dictionary = {}
## 每一幀重新套用的防禦加成的有效期：施加者每一幀都會刷新；施加者停止處理又沒有撤除時，最多再維持這麼久
const DEF_REFRESH_TTL: float = 0.5
## 暈眩（stun，張飛）：每次普通攻擊命中、而且目標被這一擊打過後還活著時，目標暈眩 stun_duration 秒（Enemy.apply_stun：取較長的剩餘時間，不累加）。
## 普通攻擊的傷害、攻擊間隔與選目標都不變（打不到的敵人照樣打不到）；打倒目標的那一擊、沒有目標時都不觸發；灼燒等其他傷害不觸發。
## stun_duration 0 代表沒有這個技能；時間不是正的有限數字時不啟用
var stun_duration: float = 0.0
## 測試用唯讀統計（debug_snapshot）：這位武將讓敵人暈眩（包括刷新）的次數
var stun_count: int = 0
## 吸血（lifesteal，魏延）：每次普通攻擊命中後，恢復這一擊實際扣掉敵人的生命 × lifesteal_ratio（Enemy.take_damage 的回傳值）：
## 只算實際扣掉的部分（敵人剩 30、這一擊 100 時用 30），打倒敵人的那一擊也算；沒有目標、目標已經倒下、0 或無效的傷害都不恢復。
## 只算自己這一擊的直接傷害：灼燒、橫掃原型的副目標、其他武將與防禦塔的傷害都不算。恢復後不超過最大生命（只改戰場上的 current_hp），
## 已經倒下或正要被移除時不恢復（不會復活）；不另外計時，恢復的次數就是普通攻擊命中的次數。
## lifesteal_ratio 0 代表沒有這個技能；比例不是 0～1（不含 0、含 1）的有限數字時不啟用（當作普通攻擊）
var lifesteal_ratio: float = 0.0
## 測試用唯讀統計（debug_snapshot）：實際恢復（大於 0）的次數、恢復的總量，以及最近 LIFESTEAL_LOG_MAX 次命中的
## 實際傷害、恢復量與恢復前後的生命（包括恢復 0 的命中，例如滿血時）
var lifesteal_count: int = 0
var lifesteal_total: float = 0.0
var lifesteal_log: Array = []
const LIFESTEAL_LOG_MAX: int = 40
## 恢復提示的顏色（綠色，和紅色的受傷數字、金色的技能倍率、藍白色的「MISS」區分）
const LIFESTEAL_COLOR: Color = Color(0.4, 1.0, 0.45)
## 攻速光環（atk_speed_aura，曹操「指揮」）：戰鬥中（BATTLE）、這位武將活著且在場上時，以武將為中心、目前有效射程內（含邊界，比中心距離）的
## 其他存活武將每秒攻擊次數 × atk_speed_aura_mult（1.15 ＝ 提高 15%：攻擊間隔 ÷ 1.15，不是把間隔減少 15%）；不含自己，防禦塔與城池不受影響，
## 友軍的職業不限。不需要普通攻擊的目標、不看攻擊冷卻，也不改變自己的普通攻擊；攻擊力、射程、attack_speed（目前等級的攻擊間隔）都不變。
## 每一幀重新判斷：離開範圍、移位／升級改變範圍、倒下、被移除、戰鬥結束時撤除自己的來源（最遲下一幀）。
## 一位武將同時在幾個攻速光環裡時取最強的一個（atk_speed_bonus_mult），不相乘、不累加。atk_speed_aura_mult 1.0 代表沒有這個技能
var atk_speed_aura_mult: float = 1.0
## 這位武將施加攻速光環時用的來源（每個武將節點各自不同：移除後重新放置也是新的來源）
var atk_speed_aura_source: String = ""
## 目前被這位武將的攻速光環加成的武將（instance id → 武將）
var _atk_speed_buffed: Dictionary = {}
## 攻速光環的顯示：範圍圈（戰鬥中）與受到加成的武將外框都是淡紫色，和減速光環的淺藍色、防禦光環的淺綠色區分
const ATK_SPEED_AURA_COLOR: Color = Color(0.82, 0.6, 1.0, 1.0)
var _atk_speed_aura_shown: bool = false
## 受到的攻速加成（其他武將的攻速光環）：每個來源各自保存 {倍率, 剩餘有效期}；生效的倍率 atk_speed_bonus_mult ＝ 所有來源中最大的，
## 沒有來源時是 1。同一個來源再次套用只刷新倍率與有效期；有效期用 _process 的 delta 倒數（遊戲時間，手動暫停時不前進）。
## 倍率只用在之後新開始的攻擊冷卻（effective_attack_interval）：正在倒數的冷卻不重設、不縮短、不延長，也不會因此立刻補打
var atk_speed_bonus_mult: float = 1.0
var _atk_speed_sources: Dictionary = {}
## 每一幀重新套用的攻速加成的有效期：施加者每一幀都會刷新；施加者停止處理又沒有撤除時，最多再維持這麼久
const ATK_SPEED_REFRESH_TTL: float = 0.5
## 反擊（counter，夏侯惇）：受到敵人對阻路武將的直接攻擊、實際扣血後自己仍然活著時，對這次攻擊自己的敵人造成
## 「這一擊實際扣掉自己的生命 × counter_ratio」的傷害：實扣是防禦公式（含防禦光環的加成）之後的數字，不是敵人的攻擊力 × 比例，也不替自己減傷。
## 不反彈：閃避、0 或無效的傷害、打倒自己的那一擊、沒有攻擊者（測試或其他沒有攻擊者的扣血）、攻擊者不是敵人或已經倒下／正要被移除；
## 這些情況自己的扣血照常。反彈的傷害走敵人一般的受傷／死亡流程（可能打倒攻擊者，擊殺與金幣只算一次），
## 不會再引發吸血、暈眩、灼燒、首擊或另一次反彈，也不改變任何敵人的攻擊冷卻；不另外計時，反彈的次數就是實際被打到（扣血）的次數。
## 免疫減速的敵人照樣受到反彈。counter_ratio 0 代表沒有這個技能；比例不是 0～1（不含 0、含 1）的有限數字時不啟用（當作普通武將）
var counter_ratio: float = 0.0
## 測試用唯讀統計（debug_snapshot）：反彈的次數、反彈的傷害總量與攻擊者實際被扣掉的總量，以及最近 COUNTER_LOG_MAX 次的
## 自己實際被扣掉的生命、反彈的傷害、攻擊者實際被扣掉的生命與攻擊者被打倒了沒有
var counter_count: int = 0
var counter_total: float = 0.0
var counter_dealt: float = 0.0
var counter_log: Array = []
const COUNTER_LOG_MAX: int = 40
## 堅韌（tenacity，廖化）：每次有效的受傷（沒有閃避、傷害是正的有限數字）都用「受傷前」的生命比例 current_hp ÷ max_hp 判斷，
## 不高於 tenacity_hp_ratio（含剛好等於）時，先照原本的防禦公式（含防禦光環的加成）算出傷害，再乘上 tenacity_damage_mult（0.8 ＝ 少扣 20%）。
## 倍率乘在傷害上，不是加在防禦上，也只乘一次；不看受傷後的生命（這一擊讓生命跨過門檻時，下一擊才減傷），恢復到門檻以上就不再減傷。
## 每次都用當下的最大生命計算（升級、更新隊伍後照新的最大生命），不用部署時的數值。沒有攻擊者的扣血（舊的呼叫方式）同樣減傷；
## 打倒自己的那一擊也照常計算（減傷後仍然不夠就倒下，不保底、不復活）。反擊用的是減傷後真正扣掉的生命。
## tenacity_hp_ratio 0 代表沒有這個技能；門檻與倍率都要是 0～1 之間（不含兩端）的有限數字，任何一個不合理就整個不啟用（當作普通武將）
var tenacity_hp_ratio: float = 0.0
var tenacity_damage_mult: float = 1.0
## 測試用唯讀統計（debug_snapshot）：減傷的次數、少扣的生命總量，以及最近 TENACITY_LOG_MAX 次有效受傷的受傷前生命、最大生命、
## 防禦計算後的傷害、實際扣掉的生命與這一擊有沒有減傷（包括沒有減傷的受傷）
var tenacity_count: int = 0
var tenacity_saved: float = 0.0
var tenacity_log: Array = []
const TENACITY_LOG_MAX: int = 40
## 堅韌生效時的提示顏色（古銅色：血條外框與小盾牌；和淺綠色的防禦光環、淡紫色的攻速光環區分）
const TENACITY_COLOR: Color = Color(0.85, 0.6, 0.25, 1.0)
## 測試用唯讀統計（debug_snapshot）：這位武將的遊戲時間（_process 的 delta 累加，受時間倍率影響、手動暫停時不前進）、
## 普通攻擊的次數，以及最近 ATTACK_LOG_MAX 次攻擊的時間、這次冷卻用的攻擊間隔與當時的攻速加成
var _age: float = 0.0
var attack_count: int = 0
var attack_log: Array = []
const ATTACK_LOG_MAX: int = 40
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
	def_aura_source = "hero_def_aura#%d" % get_instance_id()
	atk_speed_aura_source = "hero_atk_speed_aura#%d" % get_instance_id()

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
	def_aura_mult = 1.0
	stun_duration = 0.0
	lifesteal_ratio = 0.0
	atk_speed_aura_mult = 1.0
	counter_ratio = 0.0
	tenacity_hp_ratio = 0.0
	tenacity_damage_mult = 1.0
	var skill = state.get("skill", null)
	if not (skill is Dictionary):
		return
	match str(skill.get("id", "")):
		"first_strike":
			first_strike_multiplier = max(1.0, float(skill.get("first_attack_multiplier", 1.0)))
		"long_range":
			range_multiplier = max(1.0, float(skill.get("range_multiplier", 1.0)))
		"burn":
			# 比例與間隔要是正的有限數字、跳數要是正整數（JSON 的 3.0 也算）；三個欄位都合理才啟用，任何一個不合理就當作普通攻擊。
			# 字串、布林、null、NaN、無限大、0 以下、小數的跳數、沒有欄位都不合理（沒有間隔時不會自動當作 1 秒）
			var br: Variant = skill.get("burn_ratio")
			var bi: Variant = skill.get("burn_interval")
			var bt: Variant = skill.get("burn_ticks")
			if _positive_finite(br) and _positive_finite(bi) and _positive_whole(bt):
				burn_ratio = float(br)
				burn_ticks = int(bt)
				burn_interval = float(bi)
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
		"def_aura":
			# 倍率要是大於 1 的有限數字；字串、布林、null、NaN、無限大、1 以下都不啟用
			var d: Variant = skill.get("def_mult")
			if (d is float or d is int) and is_finite(float(d)) and float(d) > 1.0:
				def_aura_mult = float(d)
		"stun":
			# 時間要是正的有限數字；字串、布林、null、NaN、無限大、0 以下都不啟用（當作普通攻擊）
			var s: Variant = skill.get("stun_sec")
			if (s is float or s is int) and is_finite(float(s)) and float(s) > 0.0:
				stun_duration = float(s)
		"lifesteal":
			# 比例要是大於 0、不超過 1 的有限數字；字串、布林、null、NaN、無限大、0 以下、超過 1 都不啟用（當作普通攻擊）
			var r: Variant = skill.get("lifesteal_ratio")
			if (r is float or r is int) and is_finite(float(r)) and float(r) > 0.0 and float(r) <= 1.0:
				lifesteal_ratio = float(r)
		"atk_speed_aura":
			# 倍率要是大於 1 的有限數字；字串、布林、null、NaN、無限大、1 以下都不啟用（當作普通攻擊）
			var a: Variant = skill.get("atk_speed_mult")
			if (a is float or a is int) and is_finite(float(a)) and float(a) > 1.0:
				atk_speed_aura_mult = float(a)
		"counter":
			# 比例要是大於 0、不超過 1 的有限數字；字串、布林、null、NaN、無限大、0 以下、超過 1 都不啟用（當作普通武將）
			var k: Variant = skill.get("counter_ratio")
			if (k is float or k is int) and is_finite(float(k)) and float(k) > 0.0 and float(k) <= 1.0:
				counter_ratio = float(k)
		"tenacity":
			# 門檻與倍率都要是 0～1 之間（不含兩端）的有限數字；兩個都合理才啟用，任何一個缺少或不合理就當作普通武將（不補預設值）
			var lr: Variant = skill.get("low_hp_ratio")
			var lm: Variant = skill.get("damage_mult")
			if _open_unit(lr) and _open_unit(lm):
				tenacity_hp_ratio = float(lr)
				tenacity_damage_mult = float(lm)

## 技能參數是正的有限數字（JSON 的數字在 Godot 是 float；字串、布林、null、NaN、無限大、0 以下都不是）
static func _positive_finite(v: Variant) -> bool:
	return (v is float or v is int) and is_finite(float(v)) and float(v) > 0.0

## 技能參數是 0～1 之間（不含兩端）的有限數字（字串、布林、null、NaN、無限大、0 以下、1 以上都不是）
static func _open_unit(v: Variant) -> bool:
	return (v is float or v is int) and is_finite(float(v)) and float(v) > 0.0 and float(v) < 1.0

## 技能參數是正整數的數值（JSON 的 3.0 也算；小數、超過 2^53 − 1 這種無法精確表示的整數都不是）
static func _positive_whole(v: Variant) -> bool:
	return _positive_finite(v) and float(v) == floorf(float(v)) and float(v) <= 9007199254740991.0

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
## 切換速度、部署慢速、手動暫停、升級、重選目標、攻速光環的加成改變都不重設這個計時器
## - 攻擊間隔是攻擊當下的有效攻擊間隔（effective_attack_interval）：加成只影響這一擊之後新開始的冷卻
func _process(delta: float) -> void:
	_age += delta
	# 減速（道路阻擋、光環）、防禦光環與攻速光環每一幀更新，不看攻擊冷卻；受到的防禦與攻速加成照遊戲時間倒數有效期
	_update_slows()
	_tick_def_sources(delta)
	_update_def_aura()
	_tick_atk_speed_sources(delta)
	_update_atk_speed_aura()
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
	# 實際扣掉敵人的生命（不含溢出的部分，打倒目標的這一擊也照算；無效的傷害回傳 0、不改變敵人）
	var dealt: Variant = target.take_damage(damage)
	# 吸血：用這一擊實際扣掉的生命計算，不讀之後可能已經無效的目標；回傳的不是數字時（沒有回傳值的目標）當作沒有扣血，攻擊照常完成
	if lifesteal_ratio > 0.0:
		_lifesteal(float(dealt) if (dealt is float or dealt is int) else 0.0)
	# 火攻：這一擊命中後附加灼燒（快照是這次命中時的攻擊力）；目標被這一擊打倒時不附加
	if burn_ratio > 0.0 and is_instance_valid(target) and not target.is_dead():
		target.apply_burn(atk * burn_ratio, burn_ticks, burn_interval)
	# 暈眩：這一擊命中後目標還活著才附加（被這一擊打倒、正要被移除的不附加）
	if stun_duration > 0.0 and _enemy_alive(target) and target.apply_stun(stun_duration):
		stun_count += 1
	if sweep_ratio > 0.0:
		_sweep(hit_pos, target, damage * sweep_ratio)
	_is_attacking = true
	_anim_timer   = 0.22
	# 保留這一幀越過零點的時間（零頭）；待命後的第一擊、或零頭長過一個間隔（極長的一幀）時從這一擊起算完整的間隔。
	# 間隔用這一擊當下的有效攻擊間隔（攻速光環的加成在這裡才生效，已在倒數的冷卻不受影響）
	var interval: float = effective_attack_interval()
	var late: float = 0.0 if was_ready else -_atk_timer
	_atk_timer    = interval - (late if late < interval else 0.0)
	attack_count += 1
	attack_log.append({"t": _age, "late": late, "interval": interval, "bonus": atk_speed_bonus_mult})
	if attack_log.size() > ATTACK_LOG_MAX:
		attack_log.pop_front()
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

## 吸血：恢復 dealt × lifesteal_ratio，不超過最大生命；這位武將已經倒下或正要被移除、dealt 不是正的有限數字時不恢復
func _lifesteal(dealt: float) -> void:
	if not (dealt > 0.0 and is_finite(dealt)) or not _hero_alive(self):
		return
	var before: float = current_hp
	var gain: float = minf(dealt * lifesteal_ratio, max_hp - current_hp)
	if not (gain > 0.0):
		gain = 0.0
	lifesteal_log.append({"dealt": dealt, "heal": gain, "before": before, "after": before + gain})
	if lifesteal_log.size() > LIFESTEAL_LOG_MAX:
		lifesteal_log.pop_front()
	if gain <= 0.0:
		return
	current_hp = before + gain
	lifesteal_count += 1
	lifesteal_total += gain
	_show_heal(gain)
	queue_redraw()  # 血條

## 吸血的恢復提示：武將上方出現綠色的「+恢復量」（整數不帶小數，其餘到小數一位，不到 0.1 時兩位）；顯示成 0 的極少量不顯示，生命照樣恢復。
## FloatingText 照遊戲時間移動、淡出：受時間倍率影響，手動暫停時跟著停住
func _show_heal(gain: float) -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var shown: String = ("%.1f" if gain >= 0.1 else "%.2f") % gain
	if is_zero_approx(shown.to_float()):
		return
	shown = shown.rstrip("0").rstrip(".")
	var ft = load("res://ui/FloatingText.gd").new()
	parent.add_child(ft)
	ft.setup("+" + shown, LIFESTEAL_COLOR, global_position + Vector2(0, -hero_half - 16))

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

## 每一幀更新這位武將的防禦光環（只動自己的來源，其他防禦光環不受影響）：範圍內（和選目標相同的中心距離，含邊界）
## 其他存活的武將刷新加成，離開範圍、倒下或被移除的撤除；這位武將正要被移除、倒下，或不在戰鬥中時全部撤除。
## 友軍是同一層（UnitsLayer）裡的其他武將：防禦塔、敵人、城池都不是武將
func _update_def_aura() -> void:
	var leaving: bool = is_queued_for_deletion() or current_hp <= 0.0
	var active: bool = def_aura_mult > 1.0 and not leaving and _in_battle() and get_parent() != null
	var keep: Dictionary = {}
	if active:
		var radius_px: float = attack_range * tile_size + AURA_EDGE_EPS
		for h in get_parent().get_children():
			if h == self or not (h is Hero) or not _hero_alive(h):
				continue
			if global_position.distance_to(h.global_position) <= radius_px:
				h.apply_def_from(def_aura_source, def_aura_mult, DEF_REFRESH_TTL)
				if h.has_def_from(def_aura_source):
					keep[h.get_instance_id()] = h
	for id in _def_buffed:
		if not keep.has(id) and is_instance_valid(_def_buffed[id]):
			_def_buffed[id].remove_def_from(def_aura_source)
	_def_buffed = keep
	if active != _def_aura_shown:
		_def_aura_shown = active
		queue_redraw()

## 撤除這位武將的防禦光環給其他武將的加成（被移除、倒下、切換關卡時離開場景樹）
func _release_def_aura() -> void:
	for id in _def_buffed:
		if is_instance_valid(_def_buffed[id]):
			_def_buffed[id].remove_def_from(def_aura_source)
	_def_buffed.clear()

func _hero_alive(h: Variant) -> bool:
	return h != null and is_instance_valid(h) and not h.is_queued_for_deletion() and h.current_hp > 0.0

## 套用（或刷新）source 這個來源的防禦加成：mult 是防禦的倍率（1.2 ＝ 提高 20%），duration 是有效期（秒，遊戲時間）。
## 不套用：已經倒下或正要被移除、來源是空字串、倍率不是大於 1 的有限數字、有效期不是正的有限數字
func apply_def_from(source: String, mult: float, duration: float) -> void:
	if source == "" or current_hp <= 0.0 or is_queued_for_deletion():
		return
	if not (is_finite(mult) and mult > 1.0 and is_finite(duration) and duration > 0.0):
		return
	_def_sources[source] = {"mult": mult, "left": duration}
	_refresh_def_bonus()

## 撤除 source 這個來源的防禦加成；其他來源不受影響（沒有這個來源時什麼都不做）
func remove_def_from(source: String) -> void:
	if _def_sources.erase(source):
		_refresh_def_bonus()

func has_def_from(source: String) -> bool:
	return _def_sources.has(source)

func _refresh_def_bonus() -> void:
	var m: float = 1.0
	for s in _def_sources:
		m = maxf(m, float(_def_sources[s].mult))
	if m != def_bonus_mult:
		def_bonus_mult = m
		queue_redraw()  # 受到加成的外框

## 倒數每個防禦加成來源的有效期（遊戲時間）；到期的來源移除
func _tick_def_sources(delta: float) -> void:
	if _def_sources.is_empty():
		return
	var expired: Array = []
	for s in _def_sources:
		var e: Dictionary = _def_sources[s]
		e.left = float(e.left) - delta
		if e.left <= 0.0:
			expired.append(s)
	for s in expired:
		_def_sources.erase(s)
	if not expired.is_empty():
		_refresh_def_bonus()

## 受傷時用的防禦：def_stat × def_bonus_mult。防禦不是正數時不乘（加成不會讓 0 或負的防禦變得更不耐打）
func effective_def() -> float:
	return def_stat * def_bonus_mult if def_stat > 0.0 else def_stat

## 測試用唯讀資訊（debug_snapshot）：原本與受傷時用的防禦、受到的加成與來源；自己的防禦光環（倍率、半徑、是否作用、目前加成的武將）
func def_state() -> Dictionary:
	var src: Dictionary = {}
	for s in _def_sources:
		src[s] = {"mult": _def_sources[s].mult, "left": _def_sources[s].left}
	var buffed: Array = []
	for id in _def_buffed:
		if is_instance_valid(_def_buffed[id]):
			buffed.append(_def_buffed[id].hero_id)
	buffed.sort()
	return {"def": def_stat, "effective": effective_def(), "bonus": def_bonus_mult, "sources": src,
		"aura_mult": def_aura_mult, "aura_active": _def_aura_shown, "radius": attack_range, "buffed": buffed,
		"aura_source": def_aura_source}

## 每一幀更新這位武將的攻速光環（只動自己的來源，其他攻速光環不受影響）：範圍內（和選目標相同的中心距離，含邊界）
## 其他存活的武將刷新加成，離開範圍、倒下或被移除的撤除；這位武將正要被移除、倒下，或不在戰鬥中時全部撤除。
## 友軍是同一層（UnitsLayer）裡的其他武將：防禦塔、敵人、城池都不是武將
func _update_atk_speed_aura() -> void:
	var leaving: bool = is_queued_for_deletion() or current_hp <= 0.0
	var active: bool = atk_speed_aura_mult > 1.0 and not leaving and _in_battle() and get_parent() != null
	var keep: Dictionary = {}
	if active:
		var radius_px: float = attack_range * tile_size + AURA_EDGE_EPS
		for h in get_parent().get_children():
			if h == self or not (h is Hero) or not _hero_alive(h):
				continue
			if global_position.distance_to(h.global_position) <= radius_px:
				h.apply_atk_speed_from(atk_speed_aura_source, atk_speed_aura_mult, ATK_SPEED_REFRESH_TTL)
				if h.has_atk_speed_from(atk_speed_aura_source):
					keep[h.get_instance_id()] = h
	for id in _atk_speed_buffed:
		if not keep.has(id) and is_instance_valid(_atk_speed_buffed[id]):
			_atk_speed_buffed[id].remove_atk_speed_from(atk_speed_aura_source)
	_atk_speed_buffed = keep
	if active != _atk_speed_aura_shown:
		_atk_speed_aura_shown = active
		queue_redraw()

## 撤除這位武將的攻速光環給其他武將的加成（被移除、倒下、切換關卡時離開場景樹）
func _release_atk_speed_aura() -> void:
	for id in _atk_speed_buffed:
		if is_instance_valid(_atk_speed_buffed[id]):
			_atk_speed_buffed[id].remove_atk_speed_from(atk_speed_aura_source)
	_atk_speed_buffed.clear()

## 套用（或刷新）source 這個來源的攻速加成：mult 是每秒攻擊次數的倍率（1.15 ＝ 提高 15%），duration 是有效期（秒，遊戲時間）。
## 不套用：已經倒下或正要被移除、來源是空字串、倍率不是大於 1 的有限數字、有效期不是正的有限數字
func apply_atk_speed_from(source: String, mult: float, duration: float) -> void:
	if source == "" or current_hp <= 0.0 or is_queued_for_deletion():
		return
	if not (is_finite(mult) and mult > 1.0 and is_finite(duration) and duration > 0.0):
		return
	_atk_speed_sources[source] = {"mult": mult, "left": duration}
	_refresh_atk_speed_bonus()

## 撤除 source 這個來源的攻速加成；其他來源不受影響（沒有這個來源時什麼都不做）。正在倒數的攻擊冷卻不變
func remove_atk_speed_from(source: String) -> void:
	if _atk_speed_sources.erase(source):
		_refresh_atk_speed_bonus()

func has_atk_speed_from(source: String) -> bool:
	return _atk_speed_sources.has(source)

func _refresh_atk_speed_bonus() -> void:
	var m: float = 1.0
	for s in _atk_speed_sources:
		m = maxf(m, float(_atk_speed_sources[s].mult))
	if m != atk_speed_bonus_mult:
		atk_speed_bonus_mult = m
		queue_redraw()  # 受到加成的外框

## 倒數每個攻速加成來源的有效期（遊戲時間）；到期的來源移除
func _tick_atk_speed_sources(delta: float) -> void:
	if _atk_speed_sources.is_empty():
		return
	var expired: Array = []
	for s in _atk_speed_sources:
		var e: Dictionary = _atk_speed_sources[s]
		e.left = float(e.left) - delta
		if e.left <= 0.0:
			expired.append(s)
	for s in expired:
		_atk_speed_sources.erase(s)
	if not expired.is_empty():
		_refresh_atk_speed_bonus()

## 有效攻擊間隔（秒）：目前等級的攻擊間隔 ÷ 攻速加成（1.15 時 1 秒變成約 0.8696 秒）。attack_speed 本身不變，升級後照新的間隔重新相除
func effective_attack_interval() -> float:
	return attack_speed / atk_speed_bonus_mult

## 測試用唯讀資訊（debug_snapshot）：目前等級的攻擊間隔、受到的加成與來源、有效攻擊間隔、攻擊次數與最近的攻擊紀錄；
## 自己的攻速光環（倍率、半徑、是否作用、目前加成的武將）
func atk_speed_state() -> Dictionary:
	var src: Dictionary = {}
	for s in _atk_speed_sources:
		src[s] = {"mult": _atk_speed_sources[s].mult, "left": _atk_speed_sources[s].left}
	var buffed: Array = []
	for id in _atk_speed_buffed:
		if is_instance_valid(_atk_speed_buffed[id]):
			buffed.append(_atk_speed_buffed[id].hero_id)
	buffed.sort()
	return {"interval": attack_speed, "bonus": atk_speed_bonus_mult, "effective": effective_attack_interval(), "sources": src,
		"age": _age, "attacks": attack_count, "log": attack_log.duplicate(true), "cooldown": _atk_timer,
		"aura_mult": atk_speed_aura_mult, "aura_active": _atk_speed_aura_shown, "radius": attack_range, "buffed": buffed,
		"aura_source": atk_speed_aura_source}

func _exit_tree() -> void:
	_release_slows()
	_release_def_aura()
	_release_atk_speed_aura()

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
#  受傷（被擋住的敵人攻擊阻路武將；閃避見 dodge_chance；防禦光環見 effective_def；反擊見 counter_ratio；堅韌見 tenacity_hp_ratio）
# ═══════════════════════════════════════════
## source：這一擊的攻擊者（敵人攻擊阻路武將時傳入自己）；沒有攻擊者的扣血不傳（舊的呼叫方式照常可用），反擊只反彈給有效的攻擊者
func take_damage(amount: float, source: Variant = null) -> void:
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

	# 防禦公式不變，只是防禦換成受傷當下的有效防禦（防禦光環的加成乘在防禦上，不是直接少扣一定比例的傷害）
	var d: float = effective_def()
	var raw_dmg: float = amount * (1.0 - d / (d + 100.0))
	var actual_dmg: float = raw_dmg
	# 堅韌：用受傷前的生命判斷，防禦計算後的傷害再乘上倍率
	if tenacity_hp_ratio > 0.0:
		var before: float = current_hp
		var reduced: bool = tenacity_on()
		if reduced:
			actual_dmg = raw_dmg * tenacity_damage_mult
			tenacity_count += 1
			tenacity_saved += raw_dmg - actual_dmg
		tenacity_log.append({"before": before, "max_hp": max_hp, "raw": raw_dmg, "taken": actual_dmg, "reduced": reduced})
		if tenacity_log.size() > TENACITY_LOG_MAX:
			tenacity_log.pop_front()
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
		# 反擊：打倒自己的那一擊不會走到這裡（不反彈）
		if counter_ratio > 0.0:
			_counter(actual_dmg, source)

## 反擊：對攻擊者 source 造成 taken × counter_ratio 的傷害（taken 是這一擊實際扣掉自己的生命）。
## 這位武將已經倒下或正要被移除、taken 不是正的有限數字、source 不是仍然有效且活著的敵人時不反彈。
## 只呼叫敵人的受傷（Enemy.take_damage），不經過自己的普通攻擊：不會引發吸血、暈眩、灼燒、首擊；敵人受傷時不會反彈回來
func _counter(taken: float, source: Variant) -> void:
	if not (taken > 0.0 and is_finite(taken)) or not _hero_alive(self):
		return
	if not (is_instance_valid(source) and source is Enemy) or not _enemy_alive(source):
		return
	var reflect: float = taken * counter_ratio
	if not (reflect > 0.0 and is_finite(reflect)):
		return
	var dealt: float = source.take_damage(reflect, false, true)
	counter_count += 1
	counter_total += reflect
	counter_dealt += dealt
	counter_log.append({"taken": taken, "reflect": reflect, "dealt": dealt, "killed": source.is_dead()})
	if counter_log.size() > COUNTER_LOG_MAX:
		counter_log.pop_front()

## 堅韌現在是不是生效：有這個技能、還活著，而且目前的生命比例（current_hp ÷ 目前的 max_hp）不高於門檻。
## 最大生命不是正的有限數字、生命不是有限數字時不生效。受傷時在扣血之前判斷，血條的提示也用它
func tenacity_on() -> bool:
	if not (tenacity_hp_ratio > 0.0) or not (current_hp > 0.0 and is_finite(current_hp)):
		return false
	if not (max_hp > 0.0 and is_finite(max_hp)):
		return false
	return current_hp / max_hp <= tenacity_hp_ratio

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
	# 防禦光環的範圍（戰鬥中）：淺綠色的淡圈，半徑是目前的有效射程
	if _def_aura_shown:
		var dr: float = attack_range * tile_size
		draw_circle(Vector2.ZERO, dr, Color(DEF_AURA_COLOR, 0.06))
		draw_arc(Vector2.ZERO, dr, 0, TAU, 48, Color(DEF_AURA_COLOR, 0.45), 1.5)
	# 攻速光環的範圍（戰鬥中）：淡紫色的淡圈，半徑是目前的有效射程
	if _atk_speed_aura_shown:
		var sr: float = attack_range * tile_size
		draw_circle(Vector2.ZERO, sr, Color(ATK_SPEED_AURA_COLOR, 0.06))
		draw_arc(Vector2.ZERO, sr, 0, TAU, 48, Color(ATK_SPEED_AURA_COLOR, 0.45), 1.5)

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

	# 受到防禦光環加成：淺綠色的外框（貼圖與純色共用；選取時的金色邊框畫在它上面）
	if def_bonus_mult > 1.0:
		draw_rect(rect.grow(2), Color(DEF_AURA_COLOR, 0.9), false, 2.0)
	# 受到攻速光環加成：淡紫色的外框，畫在防禦光環外框的外面（兩種加成同時都看得到）
	if atk_speed_bonus_mult > 1.0:
		draw_rect(rect.grow(4.5), Color(ATK_SPEED_AURA_COLOR, 0.9), false, 2.0)

	# HP 條（貼圖與純色共用）
	var bar_w: float = float(hero_half * 2)
	var bar_x: float = float(-hero_half)
	var bar_y: float = float(-hero_half - 8)
	var ratio: float = current_hp / max_hp
	draw_rect(Rect2(bar_x, bar_y, bar_w, 5), Color(0.2, 0.2, 0.2, 0.8))
	draw_rect(Rect2(bar_x, bar_y, bar_w * ratio, 5), Color(0.2, 0.9, 0.2, 1))
	# 堅韌生效中（廖化的生命不高於門檻）：血條加上古銅色的外框，左邊一個小盾牌（不用文字，Godot 專案沒有中文字型）
	if tenacity_on():
		draw_rect(Rect2(bar_x - 1, bar_y - 1, bar_w + 2, 7), TENACITY_COLOR, false, 1.5)
		var sx: float = bar_x - 9.0
		var sy: float = bar_y - 2.0
		draw_colored_polygon(PackedVector2Array([Vector2(sx, sy), Vector2(sx + 7, sy), Vector2(sx + 7, sy + 5), Vector2(sx + 3.5, sy + 9), Vector2(sx, sy + 5)]), TENACITY_COLOR)

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
