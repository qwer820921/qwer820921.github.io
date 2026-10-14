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
## 威壓（顏良）：範圍內敵人對阻路武將的直接攻擊力乘上倍率（見 atk_down_aura_mult；倍率記在敵人身上，Enemy.atk_mult），不改敵人設定的攻擊力
## 連環計（龐統）：普通攻擊實際扣到主目標的生命後，依序傳給前一個被打中的敵人附近的下一個敵人（見 chain_ratio、_chain），傷害逐跳遞減
## 呼風喚雨（諸葛亮）：普通攻擊實際扣到主目標的生命後，以主目標被打中的位置為中心，範圍內最多幾名其他敵人各受一定比例的傷害（見 storm_ratio、_storm），不遞減、不傳遞
## 戰神（呂布）：自己的普通攻擊打倒敵人後，下一擊起攻擊力加一層（見 berserk_ratio、berserk_atk；層數記在 BattleManager，這一場內保留）
## 補給（魯肅）：在場上、還活著時，全隊每次有效擊殺的戰鬥金幣乘上倍率（見 supply_gold_multiplier；擊殺結算時由 BattleManager 確認來源）

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
## 威壓（atk_down_aura，顏良）：戰鬥中（BATTLE）、這位武將活著且在場上時，以武將為中心、目前有效射程內（含邊界，比中心距離）的
## 所有存活敵人對阻路武將的直接攻擊力 × atk_down_aura_mult（0.9 ＝ 降低 10%）。地面、飛行、免疫減速的敵人都算（威壓不是減速）；
## 不需要普通攻擊的目標、不看攻擊冷卻，也不改變自己的普通攻擊；敵人的移動速度、攻擊間隔與冷卻、抵達城池扣的城防都不變。
## 每一幀重新判斷：離開範圍、移位／升級改變範圍、倒下、被移除、換掉技能、戰鬥結束時撤除自己的來源（最遲下一幀）。
## 一個敵人同時在幾個威壓裡時由敵人取最強的一個（Enemy.atk_mult），不相乘、不累加。atk_down_aura_mult 1.0 代表沒有這個技能
var atk_down_aura_mult: float = 1.0
## 這位武將施加威壓時用的來源（每個武將節點各自不同：移除後重新放置也是新的來源）
var atk_down_aura_source: String = ""
## 目前被這位武將的威壓影響的敵人（instance id → 敵人）
var _atk_downed: Dictionary = {}
## 威壓的範圍圈（戰鬥中）：暗紅色，和敵人身上的向下箭頭同色
const ATK_DOWN_AURA_COLOR: Color = Color(0.85, 0.22, 0.28, 1.0)
var _atk_down_aura_shown: bool = false
## 連射（double_shot，孫尚香）：每次普通攻擊對目標實際造成正的有限傷害、而且目標被這一擊打過後仍然活著時，抽一個 [0,1) 的亂數 u，
## u < double_shot_chance 就在同一個攻擊回合立刻對同一個目標再打一擊（這次普通攻擊的攻擊力 × 1）。
## 追加的一擊走敵人一般的受傷與死亡流程（擊殺與金幣只算一次），不再引發首擊、橫掃、灼燒、暈眩、吸血，也不會再連射；
## 攻擊冷卻、攻擊次數與攻擊紀錄仍算一次攻擊。沒有目標、傷害無效、第一擊就打倒目標時不抽亂數。
## double_shot_chance 0 代表沒有這個技能；機率不是 0～1 之間（不含兩端）的有限數字時不啟用
var double_shot_chance: float = 0.0
## 連射用的亂數：每位武將各自一份，建立時隨機取種子（正式遊戲不固定種子，也沒有訊息或設定欄位可以控制它）
var _double_shot_rng: RandomNumberGenerator = RandomNumberGenerator.new()
## 測試替身：有設定時用它回傳的值取代亂數（回傳的不是數字時當作沒有抽中）。只有 Godot 測試直接設定這個屬性
var double_shot_roll_override: Callable = Callable()
## 測試用唯讀統計（debug_snapshot）：抽亂數的次數、追加的次數、追加的一擊實際扣掉的生命總量，
## 以及最近 DOUBLE_SHOT_LOG_MAX 次抽樣的值、是否追加、第一擊與追加的一擊實際扣掉的生命
var double_shot_rolls: int = 0
var double_shot_count: int = 0
var double_shot_dealt: float = 0.0
var double_shot_log: Array = []
const DOUBLE_SHOT_LOG_MAX: int = 40
## 連環計（chain，龐統）：每次普通攻擊對主目標實際造成正的有限傷害後，從主目標被打中時的位置開始傳遞：
## 每一跳從「上一個被打中的敵人被打中時的位置」找 chain_radius 格內（含邊界）最近、這次攻擊還沒打過、這位武將打得到的存活敵人
## （距離相同時生成序號小的優先），最多 chain_max_jumps 跳；找不到下一位就停止。所以第二跳可以在主目標 chain_radius 格以外，只要在第一跳附近。
## 第 k 跳的傷害＝這次主攻擊打出去的傷害（含首擊加倍）× chain_ratio 的 k 次方（0.5 時是 50%、25%），不是拿上一跳實際扣掉的生命再乘。
## 每一跳都走敵人一般的受傷與死亡流程（擊殺與金幣照常只算一次）；被主攻擊或前一跳打倒的敵人照樣從它被打中的位置傳下一跳。
## 傳遞不再引發首擊、吸血、灼燒、暈眩、橫掃、連射或新的連環計，不增加攻擊次數、不改攻擊冷卻；和橫掃（以主目標為中心的範圍）是不同的規則。
## chain_ratio 0 代表沒有這個技能；半徑要是正的有限數字、比例是 0～1 之間（不含兩端）的有限數字、跳數只接受 1 或 2（JSON 的 2.0 也算），
## 任何一個缺少或不合理就當作普通攻擊
var chain_ratio: float = 0.0
var chain_radius: float = 0.0
var chain_max_jumps: int = 0
## 測試用唯讀統計（debug_snapshot）：有傳遞出去的攻擊次數、追加命中的次數、追加命中實際扣掉的生命總量（超過敵人剩餘生命的部分不算），
## 以及最近 CHAIN_LOG_MAX 次傳遞的每一跳（生成序號、離上一個起點的距離（格）、這一跳的傷害與實際扣掉的生命）
var chain_count: int = 0
var chain_hits: int = 0
var chain_dealt: float = 0.0
var chain_log: Array = []
const CHAIN_LOG_MAX: int = 40
const CHAIN_FX_TIME: float = 0.35
## 半徑邊界的容許誤差（像素）：正好在半徑上的敵人算在內
const CHAIN_EDGE_EPS: float = 0.001
## 呼風喚雨（storm，諸葛亮）：每次普通攻擊對主目標實際造成正的有限傷害後，以主目標被打中時的位置為中心、半徑 storm_radius 格（含邊界）內，
## 對最多 storm_max_targets 名其他仍存活、這位武將打得到的敵人，各造成這次普通攻擊打出去的傷害（含首擊加倍）× storm_ratio
## （由近到遠，距離相同時生成序號小的優先，每名最多一次）。中心是主目標，不是武將；主目標被這一擊打倒也照樣以它被打中的位置生效。
## 每一名都是同樣的傷害（不遞減、不從被打中的敵人再往外傳，和連環計不同），走敵人一般的受傷與死亡流程（擊殺與金幣照常只算一次）；
## 不再引發首擊、吸血、灼燒、暈眩、橫掃、連射、連環計或新的呼風喚雨，不增加攻擊次數、不改攻擊冷卻。
## storm_ratio 0 代表沒有這個技能；半徑要是正的有限數字、比例是 0～1 之間（不含兩端）的有限數字、人數只接受 1～4 的整數（JSON 的 4.0 也算），
## 任何一個缺少或不合理就當作普通攻擊（不補預設值）
var storm_ratio: float = 0.0
var storm_radius: float = 0.0
var storm_max_targets: int = 0
## 測試用唯讀統計（debug_snapshot）：有範圍傷害的攻擊次數、範圍命中的次數、範圍命中實際扣掉的生命總量（超過敵人剩餘生命的部分不算），
## 以及最近 STORM_LOG_MAX 次的中心與每一名（生成序號、離中心的距離（格）、傷害與實際扣掉的生命）
var storm_count: int = 0
var storm_hits: int = 0
var storm_dealt: float = 0.0
var storm_log: Array = []
const STORM_LOG_MAX: int = 40
const STORM_FX_TIME: float = 0.45
## 範圍邊界的容許誤差（像素）：距離正好是半徑的敵人算在範圍內
const STORM_EDGE_EPS: float = 0.001
## 戰神（berserk，呂布）：這位武將自己的普通攻擊打倒一名敵人後加一層，最多 berserk_max_stacks 層；
## 普通攻擊的傷害＝目前等級的攻擊力 ×（1 ＋ berserk_ratio × 層數）（加法疊加，不是連乘；打倒敵人的那一擊用加層前的層數）。
## 只算自己普通攻擊的最後一擊：攻擊前是存活的敵人、這一擊實際扣到正的有限生命、而且這一擊讓它倒下。其他武將、防禦塔、灼燒、反擊、
## 範圍或傳遞的傷害、敵人漏到城池造成的死亡都不算；不是訂閱全場的擊殺，也不改擊殺數與金幣（照常只算一次）。
## 層數記在 BattleManager（依 hero_id）：跨波次、移位、升級、同場移出再放回都保留，新的一場（initialize）從 0 開始，不寫存檔。
## 攻擊力 atk 本身不變（升級後照新的攻擊力重新相乘，不疊乘）；攻擊間隔、射程、防禦、生命都不變。
## berserk_ratio 0 代表沒有這個技能；比例要是 0～1 之間（不含兩端）的有限數字、上限是 1～10 的整數（JSON 的 10.0 也算），
## 任何一個缺少或不合理就當作普通攻擊；沒有這個技能（或換成其他技能）時這一場累積的層數一併清除
var berserk_ratio: float = 0.0
var berserk_max_stacks: int = 0
## 加層提示的顏色（橘紅色，和金色的技能倍率、綠色的恢復區分）；提示的次數（測試用唯讀統計）
const BERSERK_COLOR: Color = Color(1.0, 0.45, 0.2)
var berserk_shown: int = 0
var berserk_last_text: String = ""
## 補給（supply，魯肅）：這位武將在場上（場景樹裡）、沒有正要被移除、生命大於 0 時，這一場每次有效擊殺的戰鬥金幣＝基礎 × 倍率（向下取整）。
## 不限自己打倒的：其他武將、防禦塔、灼燒等任何來源的有效擊殺都算，擊殺數照常只加一次；只改有效擊殺的戰鬥金幣，不改部署、升級、
## 退款與拆除的金額，也不改玩家的獎勵。登記在 BattleManager，擊殺結算的當下才確認（陣亡、被移除、換成其他技能時立刻不算）；
## 同時有幾個來源時取最高的倍率，不相乘、不相加。攻擊力、攻擊間隔、射程、防禦、生命都不變。
## supply_gold_multiplier 1.0 代表沒有這個技能；倍率要是大於 1、不超過 2 的有限數字，其他值（缺少、字串、布林、NaN、無限大、1 以下、超過 2）都不啟用
var supply_gold_multiplier: float = 1.0
## 怪力（knockback，許褚）：這位武將自己的普通攻擊打中主目標、實際扣到正的有限生命、目標打中前後都還活著（不是這一擊打倒的），
## 而且技能冷卻已經好了時，把這個地面敵人沿它自己已經走過的路線往回推最多 knockback_distance 格（Enemy.knockback）。
## 傷害照普通攻擊，不另外加傷害、暈眩或攻擊次數，也不改攻擊間隔與選目標。實際推動了才算成功：成功後冷卻 knockback_cooldown 秒，
## 用 BattleManager 的戰鬥時間（只在戰鬥中、照時間倍率前進，手動暫停與備戰不前進），不累積多次；推不動（已在路線起點）、
## 這一擊沒有扣到生命或打倒了目標都不用掉冷卻、不顯示提示。冷卻記在 BattleManager（依 hero_id）：跨波次、移位、升級、
## 同場移出再放回、重新讀技能都保留，新的一場（initialize）才清空。其他武將、防禦塔、灼燒、反擊與範圍或傳遞的傷害都不會觸發。
## knockback_distance 0 代表沒有這個技能；距離（格）要是大於 0、不超過 1 的有限數字，冷卻（秒）要是大於 0、不超過 10 的有限數字，
## 任何一個缺少或不合理就當作普通攻擊（不補預設值）
var knockback_distance: float = 0.0
var knockback_cooldown: float = 0.0
## 成功推動時在敵人上方顯示的英文標記（Godot 專案沒有中文字型，技能說明裡寫明這個標記）與顏色（淺藍白，和其他技能的提示區分）
const KNOCKBACK_TEXT: String = "PUSH"
const KNOCKBACK_COLOR: Color = Color(0.7, 0.9, 1.0)
## 護衛（guard_share，典韋）：這位武將在場上（場景樹裡）、沒有正要被移除、生命大於 0 時，戰鬥中（BATTLE、沒有手動暫停）同一層裡的其他友軍武將
## 受到敵人的直接攻擊（敵人攻擊阻路武將時把自己傳給 take_damage），而且受傷當下兩人中心的距離在 guard_radius 格內（含邊界）：
## 友軍先照自己的閃避、防禦（含防禦光環）與堅韌算出這一擊要扣的生命 D，這位武將承擔 S＝min(D × guard_share_ratio, 自己剩下的生命)，
## 友軍扣 D − S（用完整的 D 分攤，不先截成友軍剩下的生命）。承擔的部分走 absorb_guard_damage：直接扣生命，不再用這位武將的防禦、閃避、堅韌，
## 也不引發護衛、反擊或其他技能，不改敵人的攻擊冷卻；可能因此倒下（照常發出 hero_died、離開場上）。不保護自己、防禦塔與城池；
## 閃避、D 不是正的有限數字、沒有攻擊者（舊的呼叫方式）或攻擊者不是仍然活著的敵人時都不分攤。同時有幾名護衛時只由一名承擔
## （比例高的優先，同比例時距離近的，再同時 hero_id 字典序小的、節點編號小的），不疊加，承擔的部分不再轉給別人。
## 來源在受傷當下才確認（_find_guard），沒有登記、快取、永久加成或存檔欄位。
## guard_share_ratio 0 代表沒有這個技能；比例要是大於 0、不超過 0.5 的有限數字、範圍（格）是大於 0、不超過 5 的有限數字，
## 任何一個缺少或不合理就當作普通武將（不補預設值）
var guard_share_ratio: float = 0.0
var guard_radius: float = 0.0
## 成功承擔時在這位武將上方顯示的英文標記（Godot 專案沒有中文字型，技能說明裡寫明這個標記）、描邊的顏色（銀灰色）與顯示時間（秒，遊戲時間）
const GUARD_TEXT: String = "GUARD"
const GUARD_COLOR: Color = Color(0.86, 0.88, 0.94)
const GUARD_FLASH_TIME: float = 0.4
var _guard_flash_left: float = 0.0
## 範圍邊界的容許誤差（像素）：距離正好是半徑的友軍算在範圍內
const GUARD_EDGE_EPS: float = 0.001
## 測試用唯讀統計（debug_snapshot）：這位武將承擔的次數、承擔的生命總量，以及最近 GUARD_LOG_MAX 次的被保護的友軍、攻擊者的生成序號、
## 友軍減傷後／分擔前的傷害 D、這位武將承擔的 S、友軍與這位武將扣血前後的生命
var guard_count: int = 0
var guard_total: float = 0.0
var guard_log: Array = []
const GUARD_LOG_MAX: int = 40
## 守護（base_guard，孫權）：這位武將在場上（場景樹裡）、沒有正要被移除、生命大於 0 時，敵人抵達城池的漏城傷害乘上 base_guard_mult，
## 和部署位置無關（BattleManager 累計後無條件進位才扣城防，見 BattleManager.on_enemy_reached_base）。登記在 BattleManager，
## 抵達的當下才確認；多個來源取最強（倍率最小）的一個。base_guard_mult 1.0 代表沒有這個技能；
## 倍率要是 0.5 以上、小於 1 的有限數字，其他值（缺少、字串、布林、NaN、無限大、超出範圍）都不啟用
var base_guard_mult: float = 1.0
## 奇襲（assassinate，甘寧）：這一場（battle）這位武將第一次有效的普通攻擊必殺主目標，每場只有一次，不是兩倍傷害。
## 有效＝戰鬥中（BATTLE、沒有手動暫停）、主目標攻擊前還活著（沒有正要被移除、屬於目前這一場、這位武將打得到）、主目標的生命與這一擊的傷害
## 都是正的有限數字，而且普通攻擊實際扣到正的有限生命。先照原本的普通攻擊扣血：這一擊已經打倒就算用掉、不再補扣；沒有打倒時把剩下的生命
## 用 Enemy.take_damage 的一般入口補扣到 0（照常死亡，擊殺、金幣、補給、波次清理各一次；不直接改生命或移除節點）。只對主目標：
## 不新增攻擊次數、不改攻擊冷卻，補扣不算這一擊的普通攻擊傷害（不借給範圍、傳遞、吸血等其他技能）。是否用過記在 BattleManager（依 hero_id）：
## 跨波次、移位、升級、移出再放回、重新讀技能或換成其他技能再換回都不恢復，新的一場（initialize）才恢復。
## 無效、已倒下、沒有實扣、備戰／結算／暫停中的攻擊都不用掉。assassinate_on false 代表沒有這個技能
var assassinate_on: bool = false
## 必殺時在主目標上方顯示的英文標記（Godot 專案沒有中文字型，技能說明裡寫明這個標記）、這位武將描邊的顏色（緋紅色）與顯示時間（秒，遊戲時間）
const ASSASSINATE_TEXT: String = "KILL"
const ASSASSINATE_COLOR: Color = Color(1.0, 0.3, 0.38)
const ASSASSINATE_FLASH_TIME: float = 0.5
var _assassinate_flash_left: float = 0.0
## 魅惑（charm，貂蟬）：這位武將自己的普通攻擊打中主目標、實際扣到正的有限生命、目標打中前後都還活著（不是這一擊打倒的）、
## 戰鬥中（BATTLE、沒有手動暫停）、技能冷卻已經好了時，讓這個地面敵人受控 charm_duration 秒（戰鬥時間，Enemy.apply_charm）：
## 停在原地、不前進也不攻擊武將（解除原本的阻擋），改用自己的攻擊力攻擊 charm_attack_radius 格內最近的其他地面敵人。
## 受控的敵人仍然活著（波次照樣要等它倒下或抵達才結束），但不是敵對可選的目標：武將與防禦塔的普通攻擊、範圍與傳遞的傷害、
## 新的減速／威壓都不選它（_enemy_hostile）。成功控制才開始冷卻 charm_cooldown 秒（BattleManager 的戰鬥時間，依 hero_id，
## 跨波次、移位、升級、移出再放回、重新讀技能都保留，新的一場清空）；已經受控、飛行、致死、沒有扣到生命都不控制也不用掉冷卻。
## 這位武將陣亡、被移除、技能失效時，它造成的控制立刻結束。charm_duration 0 代表沒有這個技能；時間（秒）要是大於 0、不超過 5，
## 冷卻（秒）大於 0、不超過 10，範圍（格）大於 0、不超過 2 的有限數字，任何一個缺少或不合理就整個不啟用（不補預設值）
var charm_duration: float = 0.0
var charm_cooldown: float = 0.0
var charm_attack_radius: float = 0.0
## 成功控制時在敵人上方顯示的英文標記（Godot 專案沒有中文字型，技能說明裡寫明這個標記）與顏色（粉紅色）
const CHARM_TEXT: String = "CHARM"
const CHARM_COLOR: Color = Color(1.0, 0.5, 0.85)
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
	_double_shot_rng.randomize()
	slow_source = "hero_road#%d" % get_instance_id()
	aura_source = "hero_aura#%d" % get_instance_id()
	def_aura_source = "hero_def_aura#%d" % get_instance_id()
	atk_speed_aura_source = "hero_atk_speed_aura#%d" % get_instance_id()
	atk_down_aura_source = "hero_atk_down_aura#%d" % get_instance_id()

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
	# 奇襲只有開關（每場一次是固定規則，沒有參數）；用過與否記在 BattleManager，重新讀技能不會恢復
	var as_skill: Variant = state.get("skill", null)
	assassinate_on = as_skill is Dictionary and str(as_skill.get("id", "")) == "assassinate"
	_read_charm(as_skill)
	guard_share_ratio = 0.0
	guard_radius = 0.0
	base_guard_mult = 1.0
	_read_guard_skills(state)
	knockback_distance = 0.0
	knockback_cooldown = 0.0
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
	atk_down_aura_mult = 1.0
	double_shot_chance = 0.0
	chain_ratio = 0.0
	chain_radius = 0.0
	chain_max_jumps = 0
	storm_ratio = 0.0
	storm_radius = 0.0
	storm_max_targets = 0
	berserk_ratio = 0.0
	berserk_max_stacks = 0
	supply_gold_multiplier = 1.0
	var skill = state.get("skill", null)
	if not (skill is Dictionary):
		_drop_berserk_stacks()
		_sync_supply()
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
		"atk_down_aura":
			# 倍率要是 0～1 之間（不含兩端）的有限數字；字串、布林、null、NaN、無限大、0 以下、1 以上、沒有欄位都不啟用（當作普通武將）
			var w: Variant = skill.get("atk_mult")
			if _open_unit(w):
				atk_down_aura_mult = float(w)
		"double_shot":
			# 機率要是 0～1 之間（不含兩端）的有限數字；字串、布林、null、NaN、無限大、0 以下、1 以上、沒有欄位都不啟用（當作普通攻擊）
			var q: Variant = skill.get("double_shot_chance")
			if _open_unit(q):
				double_shot_chance = float(q)
		"chain":
			# 半徑要是正的有限數字、比例是 0～1 之間（不含兩端）、跳數是 1 或 2；三個都合理才啟用，任何一個缺少或不合理就當作普通攻擊（不補預設值）。
			# 字串、布林、null、NaN、無限大、0 以下、小數或 3 以上的跳數都不合理
			var cr: Variant = skill.get("chain_radius")
			var ck: Variant = skill.get("chain_ratio")
			var cj: Variant = skill.get("chain_max_jumps")
			if _positive_finite(cr) and _open_unit(ck) and _positive_whole(cj) and float(cj) <= 2.0:
				chain_radius = float(cr)
				chain_ratio = float(ck)
				chain_max_jumps = int(cj)
		"storm":
			# 半徑要是正的有限數字、比例是 0～1 之間（不含兩端）、人數是 1～4 的整數；三個都合理才啟用，任何一個缺少或不合理就當作普通攻擊（不補預設值）。
			# 字串、布林、null、NaN、無限大、0 以下、小數或 5 以上的人數都不合理
			var sr: Variant = skill.get("storm_radius")
			var sk: Variant = skill.get("storm_ratio")
			var st: Variant = skill.get("storm_max_targets")
			if _positive_finite(sr) and _open_unit(sk) and _positive_whole(st) and float(st) <= 4.0:
				storm_radius = float(sr)
				storm_ratio = float(sk)
				storm_max_targets = int(st)
		"berserk":
			# 每層比例要是 0～1 之間（不含兩端）、上限是 1～10 的整數；兩個都合理才啟用，任何一個缺少或不合理就當作普通攻擊（不補預設值）。
			# 字串、布林、null、NaN、無限大、0 以下、比例 1 以上、小數或 11 以上的上限都不合理
			var bk: Variant = skill.get("berserk_ratio")
			var bx: Variant = skill.get("berserk_max_stacks")
			if _open_unit(bk) and _positive_whole(bx) and float(bx) <= 10.0:
				berserk_ratio = float(bk)
				berserk_max_stacks = int(bx)
		"supply":
			# 倍率要是大於 1、不超過 2 的有限數字；字串、布林、null、NaN、無限大、1 以下、超過 2、沒有欄位都不啟用（當作普通武將）
			var g: Variant = skill.get("supply_gold_multiplier")
			if _positive_finite(g) and float(g) > 1.0 and float(g) <= 2.0:
				supply_gold_multiplier = float(g)
		"knockback":
			# 距離（格）要是大於 0、不超過 1 的有限數字，冷卻（秒）要是大於 0、不超過 10 的有限數字；兩個都合理才啟用，
			# 任何一個缺少或不合理（字串、布林、null、NaN、無限大、0 以下、超過上限）就當作普通攻擊（不補預設值）
			var kd: Variant = skill.get("knockback_distance")
			var kc: Variant = skill.get("knockback_cooldown")
			if _positive_finite(kd) and float(kd) <= 1.0 and _positive_finite(kc) and float(kc) <= 10.0:
				knockback_distance = float(kd)
				knockback_cooldown = float(kc)
	if not (berserk_ratio > 0.0):
		_drop_berserk_stacks()
	_sync_supply()

## 讀取護衛（guard_share）與守護（base_guard）的參數（_read_skill 開頭先把兩者重設成沒有技能再呼叫），並向 BattleManager 登記或取消守護。
## 護衛：比例要是大於 0、不超過 0.5 的有限數字，範圍（格）是大於 0、不超過 5 的有限數字，兩個都合理才啟用。
## 守護：倍率要是 0.5 以上、小於 1 的有限數字。字串、布林、null、NaN、無限大、超出範圍、沒有欄位都不啟用（不補預設值，不沿用前一個技能的參數）
func _read_guard_skills(state: Dictionary) -> void:
	var skill: Variant = state.get("skill", null)
	if skill is Dictionary:
		match str(skill.get("id", "")):
			"guard_share":
				var gr: Variant = skill.get("guard_share_ratio")
				var gd: Variant = skill.get("guard_radius")
				if _positive_finite(gr) and float(gr) <= 0.5 and _positive_finite(gd) and float(gd) <= 5.0:
					guard_share_ratio = float(gr)
					guard_radius = float(gd)
			"base_guard":
				var bg: Variant = skill.get("base_damage_mult")
				if _positive_finite(bg) and float(bg) >= 0.5 and float(bg) < 1.0:
					base_guard_mult = float(bg)
	_sync_base_guard()

## 讀取魅惑（charm）的參數（_read_skill 開頭呼叫，先重設成沒有技能）：時間、冷卻、範圍三個都是合理的正有限數字（時間 ≤ 5、冷卻 ≤ 10、範圍 ≤ 2）才啟用，
## 任何一個缺少、字串、布林、null、NaN、無限大、0 以下或超過上限就整組不啟用（不補預設值，不沿用前一個技能的參數）
func _read_charm(skill: Variant) -> void:
	charm_duration = 0.0
	charm_cooldown = 0.0
	charm_attack_radius = 0.0
	if not (skill is Dictionary) or str(skill.get("id", "")) != "charm":
		return
	var cd: Variant = skill.get("charm_duration")
	var cc: Variant = skill.get("charm_cooldown")
	var cr: Variant = skill.get("charm_attack_radius")
	if _positive_finite(cd) and float(cd) <= 5.0 and _positive_finite(cc) and float(cc) <= 10.0 and _positive_finite(cr) and float(cr) <= 2.0:
		charm_duration = float(cd)
		charm_cooldown = float(cc)
		charm_attack_radius = float(cr)

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
	# 奇襲必殺後的描邊：照遊戲時間倒數，結束時重畫
	if _assassinate_flash_left > 0.0:
		_assassinate_flash_left = maxf(0.0, _assassinate_flash_left - delta)
		queue_redraw()
	# 護衛成功承擔後的描邊：照遊戲時間倒數，結束時重畫
	if _guard_flash_left > 0.0:
		_guard_flash_left = maxf(0.0, _guard_flash_left - delta)
		queue_redraw()
	# 減速（道路阻擋、光環）、防禦光環、攻速光環與威壓每一幀更新，不看攻擊冷卻；受到的防禦與攻速加成照遊戲時間倒數有效期
	_update_slows()
	_tick_def_sources(delta)
	_update_def_aura()
	_tick_atk_speed_sources(delta)
	_update_atk_speed_aura()
	_update_atk_down_aura()
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
	# 戰神：用這一場目前的層數（這一擊打倒敵人時，加的層從下一擊才算）
	if berserk_ratio > 0.0:
		damage = berserk_atk()
	if first_strike_multiplier > 1.0 and _battle_mgr != null:
		var boosted: float = atk * first_strike_multiplier
		if _battle_mgr.consume_first_strike(hero_id, boosted):
			damage = boosted
			# Godot 專案沒有中文字型（中文會顯示成方框），用一定顯示得出來的倍率標記（例如「x2!」）；技能說明裡寫明這個標記
			var m: float = first_strike_multiplier
			_show_skill_text("x%s!" % (str(int(m)) if is_equal_approx(m, roundf(m)) else String.num(m, 2)))
	# 橫掃以主目標被打中時的位置為中心、連環計從這個位置開始傳遞：先記下位置與主目標，主目標被這一擊打倒也照樣生效
	var hit_pos: Vector2 = target.global_position
	var primary_id: int = target.get_instance_id()
	# 戰神：攻擊前就已經倒下、正要被移除的敵人不可能是這一擊打倒的
	var target_was_alive: bool = berserk_ratio > 0.0 and _enemy_alive(target)
	# 怪力：只推打中前還活著的主目標
	var push_alive: bool = knockback_distance > 0.0 and _enemy_alive(target)
	# 奇襲：攻擊前判斷這一擊能不能是這一場的必殺，可以時記下主目標攻擊前的生命（不行是 -1）
	var assassinate_hp: float = _assassinate_hp(target, damage) if assassinate_on else -1.0
	# 魅惑：只控制打中前還活著、敵對可選（還沒受控）的主目標
	var charm_alive: bool = charm_duration > 0.0 and _enemy_hostile(target)
	# 實際扣掉敵人的生命（不含溢出的部分，打倒目標的這一擊也照算；無效的傷害回傳 0、不改變敵人）
	var dealt: Variant = target.take_damage(damage)
	if target_was_alive:
		_berserk_on_hit(target, damage, dealt)
	# 奇襲：普通攻擊實際扣到生命才用掉這一場的機會；沒有打倒時補扣剩下的生命（補扣不改 dealt，下面的技能只看普通攻擊的傷害）
	if assassinate_hp > 0.0:
		_assassinate(target, damage, assassinate_hp, dealt)
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
	# 連射：第一擊實際扣到生命、目標仍然活著時抽一次亂數，抽中就在這個攻擊回合對同一個目標再打一擊（不經過上面的技能，也不再連射）
	if double_shot_chance > 0.0:
		_double_shot(target, dealt)
	# 連環計：主目標這一擊實際扣到生命時，從主目標被打中的位置開始傳遞（主目標被打倒也照樣傳；傳遞不經過上面的技能，也不算一次攻擊）
	if chain_ratio > 0.0:
		_chain(hit_pos, primary_id, damage, dealt)
	# 呼風喚雨：主目標這一擊實際扣到生命時，以主目標被打中的位置為中心打範圍內的其他敵人（主目標被打倒也照樣生效；範圍傷害不經過上面的技能，也不算一次攻擊）
	if storm_ratio > 0.0:
		_storm(hit_pos, primary_id, damage, dealt)
	# 怪力：主目標這一擊實際扣到生命、打中後仍活著，冷卻好了就沿它走過的路線往回推（推不動時不用掉冷卻）
	if push_alive:
		_knockback(target, dealt)
	# 魅惑：主目標這一擊實際扣到生命、打中後仍活著，冷卻好了就讓它受控（被拒絕時不用掉冷卻）
	if charm_alive:
		_charm(target, dealt)
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
	if is_on_road and _enemy_hostile(target) and not target.is_flying():
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
		# 受控（魅惑）的敵人仍然活著，但不是敵對可選的目標
		if _charmed(e):
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
		if _charmed(e):
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

## 連射：first 是第一擊實際扣掉的生命（目標的受傷沒有回傳數字時當作沒有扣到）。第一擊沒有扣到生命、目標已經倒下或正要被移除時不抽亂數。
## 抽中時追加的一擊直接呼叫敵人的受傷（攻擊力 × 1，不含首擊加倍），上方出現金色的「+1」（Godot 專案沒有中文字型，技能說明裡寫明這個標記）
func _double_shot(target: Node, first: Variant) -> void:
	var f: float = float(first) if (first is float or first is int) else 0.0
	if not (f > 0.0 and is_finite(f)) or not _enemy_alive(target):
		return
	if _charmed(target):
		return
	var u: float = _double_shot_roll()
	var hit: bool = u >= 0.0 and u < 1.0 and u < double_shot_chance
	double_shot_rolls += 1
	var second: float = 0.0
	if hit:
		var r: Variant = target.take_damage(atk)
		second = float(r) if (r is float or r is int) else 0.0
		double_shot_count += 1
		double_shot_dealt += second
		_show_skill_text("+1")
	double_shot_log.append({"u": u, "hit": hit, "first": f, "second": second})
	if double_shot_log.size() > DOUBLE_SHOT_LOG_MAX:
		double_shot_log.pop_front()

## 連射判定用的亂數 u（0 ≤ u < 1，和閃避相同的取法）。有測試替身時改用替身的值（測試用來驗證 0、0.199999、0.2、接近 1 這些邊界）；
## 替身回傳的不是數字時是 NaN（不會抽中）
func _double_shot_roll() -> float:
	if double_shot_roll_override.is_valid():
		var v: Variant = double_shot_roll_override.call()
		return float(v) if (v is float or v is int) else NAN
	return float(_double_shot_rng.randi()) / 4294967296.0

## 測試用唯讀資訊（debug_snapshot）：Godot 實際讀到的機率、抽亂數與追加的次數、追加的一擊實際扣掉的生命總量、普通攻擊的次數與最近幾次的抽樣
func double_shot_state() -> Dictionary:
	return {"chance": double_shot_chance, "rolls": double_shot_rolls, "count": double_shot_count, "dealt": double_shot_dealt,
		"attacks": attack_count, "log": double_shot_log.duplicate(true)}

## 連環計：origin 是主目標被打中時的位置、primary_id 是主目標（不會再被傳到）、base 是這次主攻擊打出去的傷害、first 是主目標實際扣掉的生命。
## 主目標沒有實際扣到生命（無效的傷害、沒有回傳數字）時不傳遞。每一跳先選好敵人、記下它被打中時的位置，再造成傷害
## （受傷可能讓敵人死亡並從 WaveManager 的清單移除，所以每一跳都重新讀清單，不邊走訪邊打）
func _chain(origin: Vector2, primary_id: int, base: float, first: Variant) -> void:
	var f: float = float(first) if (first is float or first is int) else 0.0
	if not (f > 0.0 and is_finite(f)) or not (base > 0.0 and is_finite(base)) or not _wave_mgr:
		return
	var radius_px: float = chain_radius * tile_size
	var hit_ids: Dictionary = {primary_id: true}
	var from: Vector2 = origin
	var points: Array = [origin]
	var jumps: Array = []
	for k in range(1, chain_max_jumps + 1):
		var best: Node = null
		var best_d: float = 0.0
		var best_seq: int = 0
		for e in _wave_mgr.get_active_enemies():
			# 已釋放、正要移除、已倒下、這次已打過（含主目標）、這位武將打不到（不能對空的職業遇到飛行敵人）的都不算
			if not _enemy_alive(e) or hit_ids.has(e.get_instance_id()) or not can_target(e):
				continue
			if _charmed(e):
				continue
			var raw: float = from.distance_to(e.global_position)
			if raw > radius_px + CHAIN_EDGE_EPS:
				continue
			# 距離取到 0.001 像素再比較：浮點誤差造成的極小差距視為等距，交給生成序號決定
			var d: float = snappedf(raw, 0.001)
			var seq: int = int(e.spawn_seq)
			if best == null or d < best_d or (d == best_d and seq < best_seq):
				best = e
				best_d = d
				best_seq = seq
		if best == null:
			break
		var pos: Vector2 = best.global_position
		var amount: float = base * pow(chain_ratio, k)
		hit_ids[best.get_instance_id()] = true
		var r: Variant = best.take_damage(amount)
		var got: float = float(r) if (r is float or r is int) else 0.0
		if not (got > 0.0 and is_finite(got)):
			got = 0.0
		jumps.append({"seq": best_seq, "dist": snappedf(best_d / float(tile_size), 0.0001), "amount": amount, "dealt": got})
		chain_hits += 1
		chain_dealt += got
		points.append(pos)
		from = pos
	# 附近沒有可以傳遞的敵人：就是一般的普通攻擊（不顯示效果、不計次）
	if jumps.is_empty():
		return
	chain_count += 1
	chain_log.append({"base": base, "first": f, "jumps": jumps})
	if chain_log.size() > CHAIN_LOG_MAX:
		chain_log.pop_front()
	_show_chain_fx(points)

## 連環計的連線效果：從主目標被打中的位置依序連到每一跳被打中的位置，CHAIN_FX_TIME 秒（遊戲時間）後消失。
## 掛在武將底下（不跟著武將移動）：手動暫停時跟著停住，武將被移除或切換關卡時一起清除
func _show_chain_fx(points: Array) -> void:
	var fx := ChainFx.new()
	fx.duration = CHAIN_FX_TIME
	fx.top_level = true
	var start: Vector2 = points[0]
	var rel: PackedVector2Array = PackedVector2Array()
	for p in points:
		rel.append(p - start)
	fx.points = rel
	add_child(fx)
	fx.global_position = start

## 測試用唯讀資訊（debug_snapshot）：Godot 實際讀到的半徑（格）、比例與跳數（沒有啟用時比例是 0）、有傳遞的攻擊次數、追加命中的次數與實際扣掉的生命總量、
## 普通攻擊的次數、目前還在顯示的連線效果數與最近幾次傳遞的每一跳
func chain_state() -> Dictionary:
	var fx_n: int = 0
	for c in get_children():
		if c is ChainFx and not c.is_queued_for_deletion():
			fx_n += 1
	return {"radius": chain_radius, "ratio": chain_ratio, "max_jumps": chain_max_jumps, "count": chain_count, "hits": chain_hits,
		"dealt": chain_dealt, "attacks": attack_count, "fx": fx_n, "log": chain_log.duplicate(true)}

## 呼風喚雨：center 是主目標被打中時的位置、primary_id 是主目標（不會再被打）、base 是這次主攻擊打出去的傷害、first 是主目標實際扣掉的生命。
## 主目標沒有實際扣到生命（無效的傷害、沒有回傳數字）時不生效。先選好全部對象、記下距離，再依序造成傷害
## （受傷可能讓敵人死亡並從 WaveManager 的清單移除，不能邊走訪邊打）；候選和選目標一樣排除已釋放、正要移除（包括已經漏到城池）、已倒下、
## 這位武將打不到的敵人（不能對空的職業遇到飛行敵人）；免疫減速的敵人照樣受傷
func _storm(center: Vector2, primary_id: int, base: float, first: Variant) -> void:
	var hit: float = float(first) if (first is float or first is int) else 0.0
	if not (hit > 0.0 and is_finite(hit)) or not (base > 0.0 and is_finite(base)) or not _wave_mgr:
		return
	var radius_px: float = storm_radius * tile_size
	var picks: Array = []
	for e in _wave_mgr.get_active_enemies():
		if not _enemy_alive(e) or e.get_instance_id() == primary_id or not can_target(e):
			continue
		if _charmed(e):
			continue
		var raw: float = center.distance_to(e.global_position)
		if raw > radius_px + STORM_EDGE_EPS:
			continue
		# 距離取到 0.001 像素再比較：浮點誤差造成的極小差距視為等距，交給生成序號決定
		picks.append({"e": e, "d": snappedf(raw, 0.001), "seq": int(e.spawn_seq)})
	picks.sort_custom(func(x, y): return x.d < y.d or (x.d == y.d and x.seq < y.seq))
	picks = picks.slice(0, storm_max_targets)
	# 範圍內沒有其他敵人：就是一般的普通攻擊（不顯示效果、不計次）
	if picks.is_empty():
		return
	var amount: float = base * storm_ratio
	var hits: Array = []
	var points: PackedVector2Array = PackedVector2Array()
	for p in picks:
		var e: Node = p.e
		if not _enemy_hostile(e):
			continue
		points.append(e.global_position - center)
		var r: Variant = e.take_damage(amount)
		var got: float = float(r) if (r is float or r is int) else 0.0
		if not (got > 0.0 and is_finite(got)):
			got = 0.0
		hits.append({"seq": int(p.seq), "dist": snappedf(float(p.d) / float(tile_size), 0.0001), "amount": amount, "dealt": got})
		storm_hits += 1
		storm_dealt += got
	if hits.is_empty():
		return
	storm_count += 1
	storm_log.append({"base": base, "first": hit, "center": center, "hits": hits})
	if storm_log.size() > STORM_LOG_MAX:
		storm_log.pop_front()
	_show_storm_fx(center, radius_px, points)

## 呼風喚雨的範圍效果：以主目標被打中的位置為中心、半徑和實際範圍相同的風雨圈，STORM_FX_TIME 秒（遊戲時間）後消失。
## 掛在武將底下（不跟著武將移動）：手動暫停時跟著停住，武將被移除或切換關卡時一起清除
func _show_storm_fx(origin: Vector2, radius_px: float, points: PackedVector2Array) -> void:
	var fx := StormFx.new()
	fx.radius = radius_px
	fx.points = points
	fx.duration = STORM_FX_TIME
	fx.top_level = true
	add_child(fx)
	fx.global_position = origin

## 測試用唯讀資訊（debug_snapshot）：Godot 實際讀到的半徑（格）、比例與人數（沒有啟用時比例是 0）、有範圍傷害的攻擊次數、範圍命中的次數與實際扣掉的生命總量、
## 普通攻擊的次數、目前還在顯示的風雨圈數與最近幾次的每一名
func storm_state() -> Dictionary:
	var fx_n: int = 0
	for c in get_children():
		if c is StormFx and not c.is_queued_for_deletion():
			fx_n += 1
	var entries: Array = []
	for x in storm_log:
		entries.append({"base": x.base, "first": x.first, "center": [x.center.x, x.center.y], "hits": x.hits.duplicate(true)})
	return {"radius": storm_radius, "ratio": storm_ratio, "max_targets": storm_max_targets, "count": storm_count, "hits": storm_hits,
		"dealt": storm_dealt, "attacks": attack_count, "fx": fx_n, "log": entries}

## 戰神：這一場目前的層數（不超過上限）；沒有這個技能、沒有 BattleManager（單獨建立的武將）時是 0
func berserk_stacks() -> int:
	if not (berserk_ratio > 0.0) or _battle_mgr == null:
		return 0
	return mini(_battle_mgr.berserk_stacks(hero_id), berserk_max_stacks)

## 戰神：目前的有效攻擊力＝目前等級的攻擊力 ×（1 ＋ 每層比例 × 層數）；沒有這個技能時就是攻擊力（atk 本身不改）
func berserk_atk() -> float:
	if not (berserk_ratio > 0.0):
		return atk
	return atk * (1.0 + berserk_ratio * float(berserk_stacks()))

## 戰神：這一擊之後判斷是不是自己打倒的（呼叫前已確認攻擊前目標還活著）：實際扣到正的有限生命、而且目標現在已經倒下才加一層。
## 已經是上限時照樣記下這次擊殺，但層數不變、不顯示提示
func _berserk_on_hit(target: Node, damage: float, dealt: Variant) -> void:
	var got: float = float(dealt) if (dealt is float or dealt is int) else 0.0
	if not (got > 0.0 and is_finite(got)) or _battle_mgr == null:
		return
	if not (is_instance_valid(target) and target.is_dead()):
		return
	var r: Dictionary = _battle_mgr.add_berserk_kill(hero_id, berserk_max_stacks, int(target.spawn_seq), damage, got)
	if int(r.after) > int(r.before):
		_show_berserk(int(r.after))

## 沒有這個技能（或換成其他技能、參數不合理）時，清掉這一場替這位武將累積的層數，之後換回戰神也從 0 開始
func _drop_berserk_stacks() -> void:
	if _battle_mgr != null and hero_id != "":
		_battle_mgr.clear_berserk(hero_id)

## 加層提示：武將上方出現橘紅色的「ATK+目前加成%」，到達上限時加上「MAX」（Godot 專案沒有中文字型，技能說明裡寫明這個標記）。
## FloatingText 照遊戲時間移動、淡出：受時間倍率影響，手動暫停時跟著停住，切換關卡時跟著清除
func _show_berserk(stacks: int) -> void:
	var parent: Node = get_parent()
	if parent == null:
		return
	var pct: float = berserk_ratio * float(stacks) * 100.0
	var shown: String = str(roundi(pct)) if is_equal_approx(pct, roundf(pct)) else String.num(pct, 1)
	var text: String = "ATK+%s%%" % shown
	if stacks >= berserk_max_stacks:
		text += " MAX"
	berserk_shown += 1
	berserk_last_text = text
	var ft = load("res://ui/FloatingText.gd").new()
	parent.add_child(ft)
	ft.setup(text, BERSERK_COLOR, global_position + Vector2(0, -hero_half - 20))

## 測試用唯讀資訊（debug_snapshot）：Godot 實際讀到的每層比例與上限（沒有啟用時比例是 0）、這一場的層數與倍率、基礎與有效攻擊力、
## 加層提示的次數與最後的文字、普通攻擊的次數、這一場的擊殺次數與最近幾次自己的擊殺（生成序號、這一擊的傷害、實扣、加層前後）
func berserk_state() -> Dictionary:
	var stacks: int = berserk_stacks()
	var rec: Dictionary = _battle_mgr.berserk_record(hero_id) if _battle_mgr != null else {}
	return {"ratio": berserk_ratio, "max_stacks": berserk_max_stacks, "stacks": stacks, "mult": 1.0 + berserk_ratio * float(stacks),
		"base_atk": atk, "effective_atk": berserk_atk(), "shown": berserk_shown, "last_text": berserk_last_text, "attacks": attack_count,
		"kills": int(rec.get("kills", 0)), "log": rec.get("log", [])}

## 補給：這位武將此刻能不能提供補給：有這個技能、在場景樹裡（在場上）、沒有正要被移除、生命大於 0（擊殺結算的當下由 BattleManager 呼叫）
func supply_active() -> bool:
	return supply_gold_multiplier > 1.0 and is_inside_tree() and _hero_alive(self)

## 補給：讀完技能後向 BattleManager 登記或取消（登記只是候選名單，是否有效在擊殺結算時才確認）；沒有 BattleManager（單獨建立的武將）時不做事
func _sync_supply() -> void:
	if _battle_mgr == null:
		return
	if supply_gold_multiplier > 1.0:
		_battle_mgr.register_supply(self)
	else:
		_battle_mgr.unregister_supply(self)

## 測試用唯讀資訊（debug_snapshot）：Godot 實際讀到的倍率、此刻能不能提供補給、這位武將提供時每次擊殺的戰鬥金幣
func supply_state() -> Dictionary:
	return {"mult": supply_gold_multiplier, "active": supply_active(), "kill_gold": BattleManager.kill_gold(supply_gold_multiplier)}

## 怪力：dealt 是這一擊實際扣掉的生命。打中後仍活著的地面主目標、冷卻已經好了才推；實際推動了才記下這次（開始冷卻）並顯示標記
func _knockback(target: Node, dealt: Variant) -> void:
	var got: float = float(dealt) if (dealt is float or dealt is int) else 0.0
	if not (got > 0.0 and is_finite(got)) or _battle_mgr == null or hero_id == "":
		return
	if not _enemy_alive(target) or target.is_flying() or not target.has_method("knockback"):
		return
	if _charmed(target) or not _battle_mgr.knockback_ready(hero_id):
		return
	var requested: float = knockback_distance * float(tile_size)
	var before: Dictionary = target.path_state()
	var moved: float = target.knockback(requested)
	if not (moved > 0.0):
		return
	var after: Dictionary = target.path_state()
	_battle_mgr.record_knockback(hero_id, knockback_cooldown, {"seq": int(target.spawn_seq), "requested": requested, "actual": moved,
		"index_before": before.index, "index_after": after.index, "remaining_before": before.remaining, "remaining_after": after.remaining})
	var parent: Node = get_parent()
	if parent != null:
		var ft = load("res://ui/FloatingText.gd").new()
		parent.add_child(ft)
		ft.setup(KNOCKBACK_TEXT, KNOCKBACK_COLOR, target.global_position + Vector2(0, -20))

## 怪力（測試用唯讀資訊）：Godot 實際讀到的距離（格）與冷卻（秒）、這一場成功推動的次數、此刻剩下的冷卻（秒）與最近幾次推動
## （敵人的生成序號、要求與實際推動的像素、推動前後的路點索引與剩餘路程）；沒有 BattleManager 時次數是 0
func knockback_state() -> Dictionary:
	var rec: Dictionary = _battle_mgr.knockback_record(hero_id) if _battle_mgr != null else {}
	return {"distance": knockback_distance, "cooldown": knockback_cooldown, "count": int(rec.get("count", 0)),
		"remaining": _battle_mgr.knockback_remaining(hero_id) if _battle_mgr != null else 0.0, "attacks": attack_count, "log": rec.get("log", [])}

## 敵人屬於目前這一場（WaveManager 這一代生成的；測試用的替身沒有世代時不檢查）
func _in_this_battle(e: Node) -> bool:
	return _wave_mgr != null and (not _wave_mgr.has_method("owns_enemy") or _wave_mgr.owns_enemy(e))

## 奇襲：這一擊攻擊前的檢查。這一場還沒用過、戰鬥中（BATTLE、沒有手動暫停）、主目標還活著而且屬於這一場、這位武將打得到、
## 主目標的生命與這一擊的傷害都是正的有限數字時，回傳主目標攻擊前的生命；否則回傳 -1（這一擊照普通攻擊處理、不用掉機會）
func _assassinate_hp(target: Node, damage: float) -> float:
	if _battle_mgr == null or hero_id == "" or not _battle_mgr.combat_active() or not _battle_mgr.assassinate_ready(hero_id):
		return -1.0
	if not _enemy_alive(target) or not can_target(target) or not _in_this_battle(target):
		return -1.0
	var hp: Variant = target.get("current_hp")
	if not ((hp is float or hp is int) and is_finite(float(hp)) and float(hp) > 0.0) or not (damage > 0.0 and is_finite(damage)):
		return -1.0
	return float(hp)

## 奇襲：dealt 是普通攻擊實際扣掉的生命。不是正的有限數字時什麼都不做（不用掉）；是的話記下這一場已用過，
## 主目標還活著時把剩下的生命用一般的受傷入口補扣（打倒、擊殺與金幣由敵人的死亡流程處理一次）。打倒時顯示 KILL 與描邊
func _assassinate(target: Node, damage: float, hp_before: float, dealt: Variant) -> void:
	var got: float = float(dealt) if (dealt is float or dealt is int) else 0.0
	if not (got > 0.0 and is_finite(got)):
		return
	var seq: int = int(target.spawn_seq) if is_instance_valid(target) else -1
	var pos: Vector2 = target.global_position if is_instance_valid(target) else global_position
	var mid: float = 0.0
	var finish: float = 0.0
	if _enemy_alive(target):
		var left: Variant = target.get("current_hp")
		mid = float(left) if (left is float or left is int) else 0.0
		if mid > 0.0 and is_finite(mid):
			var r: Variant = target.take_damage(mid)
			finish = float(r) if (r is float or r is int) else 0.0
	var killed: bool = is_instance_valid(target) and target.is_dead()
	var hp_after: float = float(target.current_hp) if is_instance_valid(target) else 0.0
	_battle_mgr.record_assassinate(hero_id, {"seq": seq, "damage": damage, "hp_before": hp_before, "normal": got, "hp_mid": mid,
		"finish": finish, "hp_after": hp_after, "killed": killed})
	if not killed:
		return
	_assassinate_flash_left = ASSASSINATE_FLASH_TIME
	queue_redraw()
	var parent: Node = get_parent()
	if parent != null:
		var ft = load("res://ui/FloatingText.gd").new()
		parent.add_child(ft)
		ft.setup(ASSASSINATE_TEXT, ASSASSINATE_COLOR, pos + Vector2(0, -24))

## 奇襲（測試用唯讀資訊）：Godot 實際讀到的開關、這一場剩下的次數（0 或 1）、是否用過與那一次的紀錄（主目標的生成序號、這一擊的傷害、
## 攻擊前的生命、普通攻擊實扣、普通攻擊後的生命、補扣實扣、最後的生命、是否打倒、戰鬥時間）、普通攻擊的次數、描邊是否顯示中
func assassinate_state() -> Dictionary:
	var used: bool = _battle_mgr != null and not _battle_mgr.assassinate_ready(hero_id)
	return {"on": assassinate_on, "remaining": 0 if used else 1, "used": used,
		"record": _battle_mgr.assassinate_record(hero_id) if _battle_mgr != null else {}, "attacks": attack_count, "flash": _assassinate_flash_left > 0.0}

## 魅惑：這位武將此刻能不能維持它造成的控制：有這個技能、在場景樹裡（在場上）、沒有正要被移除、生命是正的有限數字（受控的敵人每一步確認）
func charm_source_active() -> bool:
	return charm_duration > 0.0 and is_inside_tree() and _hero_alive(self) and is_finite(current_hp)

## 魅惑：dealt 是這一擊實際扣掉的生命。戰鬥中、冷卻好了、主目標打中後仍是敵對可選的地面敵人（屬於這一場）才控制；
## 敵人接受控制（Enemy.apply_charm）才記下這次（開始冷卻）並顯示標記。被拒絕（已經受控、飛行、無效的狀態）不用掉冷卻
func _charm(target: Node, dealt: Variant) -> void:
	var got: float = float(dealt) if (dealt is float or dealt is int) else 0.0
	if not (got > 0.0 and is_finite(got)) or _battle_mgr == null or hero_id == "":
		return
	if not _battle_mgr.combat_active() or not _battle_mgr.charm_ready(hero_id):
		return
	if not _enemy_hostile(target) or target.is_flying() or not _in_this_battle(target) or not target.has_method("apply_charm"):
		return
	if not target.apply_charm(self, _battle_mgr, charm_duration, charm_attack_radius * float(tile_size)):
		return
	_battle_mgr.record_charm(hero_id, charm_cooldown, {"seq": int(target.spawn_seq), "dealt": got, "hp": float(target.current_hp),
		"until": float(_battle_mgr.battle_time) + charm_duration})
	var parent: Node = get_parent()
	if parent != null:
		var ft = load("res://ui/FloatingText.gd").new()
		parent.add_child(ft)
		ft.setup(CHARM_TEXT, CHARM_COLOR, target.global_position + Vector2(0, -22))

## 魅惑（測試用唯讀資訊）：Godot 實際讀到的時間、冷卻與範圍（格）、這一場成功控制的次數、此刻剩下的冷卻（秒）、普通攻擊的次數與最近幾次的紀錄
func charm_state() -> Dictionary:
	var rec: Dictionary = _battle_mgr.charm_record(hero_id) if _battle_mgr != null else {}
	return {"duration": charm_duration, "cooldown": charm_cooldown, "radius": charm_attack_radius, "count": int(rec.get("count", 0)),
		"remaining": _battle_mgr.charm_remaining(hero_id) if _battle_mgr != null else 0.0, "active": charm_source_active(), "attacks": attack_count,
		"log": rec.get("log", [])}

## 技能觸發時在武將上方顯示的文字（金色、放大，和一般的傷害數字區分）
const SKILL_TEXT_COLOR: Color = Color(1.0, 0.85, 0.2)
func _show_skill_text(text: String) -> void:
	var ft = load("res://ui/FloatingText.gd").new()
	get_parent().add_child(ft)
	ft.scale = Vector2(1.5, 1.5)
	ft.setup(text, SKILL_TEXT_COLOR, global_position + Vector2(0, -hero_half - 12))

## 每一幀更新這位武將自己的兩個減速來源（只動自己的來源，其他武將、防禦塔的減速不受影響）：
## - 道路阻擋：打過的地面敵人還在射程內（和選目標相同的距離判斷）就刷新；離開射程、倒下、武將不在道路上或正要被移除時撤除
## - 減速光環：見 slow_aura_mult
func _update_slows() -> void:
	var leaving: bool = is_queued_for_deletion() or current_hp <= 0.0
	var range_px: float = attack_range * tile_size
	for id in _road_slowed.keys():
		var e: Variant = _road_slowed[id]
		if _charmed(e):
			_road_slowed.erase(id)
			continue
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
			if _charmed(e):
				continue
			if _enemy_alive(e) and not e.is_flying() and global_position.distance_to(e.global_position) <= radius_px:
				e.apply_slow_from(aura_source, slow_aura_mult, Enemy.SLOW_REFRESH_TTL)
				# 免疫減速的敵人不會套用，也就不列入
				if e.has_slow_from(aura_source):
					keep[e.get_instance_id()] = e
	for id in _aura_slowed:
		if not keep.has(id) and is_instance_valid(_aura_slowed[id]) and not _charmed(_aura_slowed[id]):
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

## 每一幀更新這位武將的威壓（只動自己的來源，其他武將的威壓不受影響）：範圍內（和選目標相同的中心距離，含邊界）
## 存活的敵人刷新，離開範圍、倒下或被移除的撤除；這位武將正要被移除、倒下、沒有這個技能，或不在戰鬥中時全部撤除
func _update_atk_down_aura() -> void:
	var leaving: bool = is_queued_for_deletion() or current_hp <= 0.0
	var active: bool = atk_down_aura_mult < 1.0 and not leaving and _wave_mgr != null and _in_battle()
	var keep: Dictionary = {}
	if active:
		var radius_px: float = attack_range * tile_size + AURA_EDGE_EPS
		for e in _wave_mgr.get_active_enemies():
			if _enemy_hostile(e) and global_position.distance_to(e.global_position) <= radius_px:
				e.apply_atk_down_from(atk_down_aura_source, atk_down_aura_mult, Enemy.ATK_DOWN_REFRESH_TTL)
				if e.has_atk_down_from(atk_down_aura_source):
					keep[e.get_instance_id()] = e
	for id in _atk_downed:
		if not keep.has(id) and is_instance_valid(_atk_downed[id]) and not _charmed(_atk_downed[id]):
			_atk_downed[id].remove_atk_down_from(atk_down_aura_source)
	_atk_downed = keep
	if active != _atk_down_aura_shown:
		_atk_down_aura_shown = active
		queue_redraw()

## 撤除這位武將的威壓（被移除、倒下、切換關卡時離開場景樹）
func _release_atk_down_aura() -> void:
	for id in _atk_downed:
		if is_instance_valid(_atk_downed[id]):
			_atk_downed[id].remove_atk_down_from(atk_down_aura_source)
	_atk_downed.clear()

## 測試用唯讀資訊（debug_snapshot）：威壓的倍率、半徑（格）、是否作用、目前影響的敵人與來源的識別字串
func atk_down_state() -> Dictionary:
	return {"aura_mult": atk_down_aura_mult, "radius": attack_range, "aura_active": _atk_down_aura_shown,
		"affected": _atk_downed.keys().map(func(k): return str(k)), "aura_source": atk_down_aura_source}

func _exit_tree() -> void:
	_release_slows()
	_release_def_aura()
	_release_atk_speed_aura()
	_release_atk_down_aura()
	# 守護的來源離開場上（陣亡、移出隊伍、切換關卡）：請 BattleManager 稍後把目前生效的漏城倍率重新送給網頁
	if base_guard_mult < 1.0 and _battle_mgr != null and is_instance_valid(_battle_mgr):
		_battle_mgr.notify_base_guard_changed()

## 戰鬥中（BATTLE）才有光環；沒有 BattleManager（單獨建立的武將）時視為戰鬥中
func _in_battle() -> bool:
	return _battle_mgr == null or _battle_mgr.game_state == BattleManager.GameState.BATTLE

func _enemy_alive(e: Variant) -> bool:
	return e != null and is_instance_valid(e) and not e.is_queued_for_deletion() and not e.is_dead()

## 受控（魅惑）中的敵人：仍然活著、照常計入波次，但不是敵對可選的目標（已釋放、沒有這個狀態的節點都不算）
static func _charmed(e: Variant) -> bool:
	return e != null and is_instance_valid(e) and e.has_method("is_charmed") and e.is_charmed()

## 敵對可選：活著（_enemy_alive）而且沒有受控。選目標、範圍與傳遞的傷害、新的減速與威壓用它；死亡、灼燒、波次清理、反擊與護衛的攻擊者仍用 _enemy_alive
func _enemy_hostile(e: Variant) -> bool:
	return _enemy_alive(e) and not _charmed(e)

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
	var ten_entry: Dictionary = {}
	# 堅韌：用受傷前的生命判斷，防禦計算後的傷害再乘上倍率
	if tenacity_hp_ratio > 0.0:
		var before: float = current_hp
		var reduced: bool = tenacity_on()
		if reduced:
			actual_dmg = raw_dmg * tenacity_damage_mult
			tenacity_count += 1
			tenacity_saved += raw_dmg - actual_dmg
		ten_entry = {"before": before, "max_hp": max_hp, "raw": raw_dmg, "reduced": reduced}
	# 護衛（典韋）：減傷後、分擔前的傷害 actual_dmg 由範圍內的一名護衛承擔一部分，這位武將扣其餘的部分（之後的 actual_dmg 就是自己實際被扣的生命，
	# 反擊也只用這個數字）
	var shared: float = _take_guard_share(actual_dmg, source)
	if not ten_entry.is_empty():
		# 堅韌的紀錄：after_tenacity 是減傷後、分擔前的傷害，shared 是護衛承擔的部分，taken 照舊是最後實際扣掉自己的生命
		ten_entry["after_tenacity"] = actual_dmg
		ten_entry["shared"] = shared
		ten_entry["taken"] = actual_dmg - shared
		tenacity_log.append(ten_entry)
		if tenacity_log.size() > TENACITY_LOG_MAX:
			tenacity_log.pop_front()
	actual_dmg -= shared
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

## 護衛：這位武將此刻能不能替友軍承擔：有這個技能、在場景樹裡（在場上）、沒有正要被移除、生命是正的有限數字（受傷的當下由友軍確認）
func guard_available() -> bool:
	return guard_share_ratio > 0.0 and is_inside_tree() and _hero_alive(self) and is_finite(current_hp)

## 護衛：h（另一位護衛候選，和它的距離 dh）是不是比 best（距離 db）更優先：比例高的優先，同比例時距離近的，再同時 hero_id 字典序小的、節點編號小的
static func _guard_before(h: Node, dh: float, best: Node, db: float) -> bool:
	if h.guard_share_ratio != best.guard_share_ratio:
		return h.guard_share_ratio > best.guard_share_ratio
	if dh != db:
		return dh < db
	if h.hero_id != best.hero_id:
		return h.hero_id < best.hero_id
	return h.get_instance_id() < best.get_instance_id()

## 護衛：這一擊（減傷後、分擔前的傷害 dmg）由哪一位護衛承擔；沒有時回傳 null。只在戰鬥中（BATTLE、沒有手動暫停）、dmg 是正的有限數字、
## 攻擊者是仍然活著的敵人時才找。候選是同一層裡其他此刻能提供的護衛（guard_available）、屬於同一個 BattleManager，
## 受傷當下兩人中心的距離不超過那位護衛的範圍（含邊界）
func _find_guard(dmg: float, source: Variant) -> Node:
	if not (dmg > 0.0 and is_finite(dmg)):
		return null
	if not (is_instance_valid(source) and source is Enemy) or not _enemy_alive(source):
		return null
	if _battle_mgr == null or _battle_mgr.game_state != BattleManager.GameState.BATTLE or _battle_mgr.manual_paused:
		return null
	var parent: Node = get_parent()
	if parent == null or not is_inside_tree():
		return null
	var best: Node = null
	var best_d: float = 0.0
	for h in parent.get_children():
		if h == self or not (h is Hero) or not h.guard_available() or h._battle_mgr != _battle_mgr:
			continue
		var dist: float = global_position.distance_to(h.global_position)
		if not (dist <= h.guard_radius * float(h.tile_size) + GUARD_EDGE_EPS):
			continue
		if best == null or _guard_before(h, dist, best, best_d):
			best = h
			best_d = dist
	return best

## 護衛：找出承擔這一擊的護衛，由它承擔 min(dmg × 比例, 它剩下的生命)；回傳實際承擔的生命（沒有護衛、承擔不了時是 0）。
## 一擊只找一次護衛：承擔的部分走護衛的 absorb_guard_damage，不會再轉給別人
func _take_guard_share(dmg: float, source: Variant) -> float:
	var g: Node = _find_guard(dmg, source)
	if g == null:
		return 0.0
	var want: float = minf(dmg * g.guard_share_ratio, g.current_hp)
	if not (want > 0.0 and is_finite(want)):
		return 0.0
	var guard_before: float = g.current_hp
	var s: float = g.absorb_guard_damage(want)
	if not (s > 0.0):
		return 0.0
	g.note_guard(hero_id, int(source.spawn_seq), dmg, s, current_hp, maxf(0.0, current_hp - (dmg - s)), guard_before)
	return s

## 護衛承擔的傷害：直接扣這位武將的生命（不再用防禦、閃避、堅韌減少，也不引發護衛、反擊或其他技能，不改敵人的攻擊冷卻）。
## amount 不是正的有限數字、這位武將已經倒下或正要被移除時不扣、回傳 0；最多扣到 0（回傳實際扣掉的生命）。
## 生命歸零時照常倒下：發出 hero_died（Main 清除佔格與隊伍紀錄）、離開場上（光環與減速照常撤除）
func absorb_guard_damage(amount: float) -> float:
	if not (amount > 0.0 and is_finite(amount)) or not _hero_alive(self):
		return 0.0
	var dealt: float = minf(amount, current_hp)
	current_hp -= dealt
	var parent: Node = get_parent()
	if parent != null:
		var ft = load("res://ui/FloatingText.gd").new()
		parent.add_child(ft)
		ft.setup("%.0f" % dealt, Color(1.0, 0.2, 0.2), global_position)
	if current_hp <= 0.0:
		current_hp = 0.0
		hero_died.emit(self)
		queue_free()
	else:
		queue_redraw()
	return dealt

## 護衛：記下一次承擔（被保護的友軍、攻擊者的生成序號、減傷後／分擔前的傷害 d、承擔的 s、友軍扣血前後與這位武將扣血前後的生命），
## 顯示 GUARD 與描邊
func note_guard(ally_id: String, seq: int, d: float, s: float, ally_before: float, ally_after: float, guard_before: float) -> void:
	guard_count += 1
	guard_total += s
	guard_log.append({"ally": ally_id, "seq": seq, "d": d, "s": s, "ally_before": ally_before, "ally_after": ally_after,
		"guard_before": guard_before, "guard_after": current_hp})
	if guard_log.size() > GUARD_LOG_MAX:
		guard_log.pop_front()
	_guard_flash_left = GUARD_FLASH_TIME
	queue_redraw()
	var parent: Node = get_parent()
	if parent != null:
		var ft = load("res://ui/FloatingText.gd").new()
		parent.add_child(ft)
		ft.setup(GUARD_TEXT, GUARD_COLOR, global_position + Vector2(0, -hero_half - 14))

## 護衛：此刻範圍內（兩人中心的距離、含邊界）其他活著、在場上的友軍武將的 hero_id（排序）；這位武將不能提供時是空陣列
func guard_allies() -> Array:
	var out: Array = []
	if not guard_available() or get_parent() == null:
		return out
	for h in get_parent().get_children():
		if h == self or not (h is Hero) or not _hero_alive(h) or not h.is_inside_tree():
			continue
		if global_position.distance_to(h.global_position) <= guard_radius * float(tile_size) + GUARD_EDGE_EPS:
			out.append(h.hero_id)
	out.sort()
	return out

## 護衛（測試用唯讀資訊）：Godot 實際讀到的比例與範圍（格）、此刻能不能提供、範圍內的友軍、承擔的次數與總量、最近幾次的紀錄
func guard_state() -> Dictionary:
	return {"ratio": guard_share_ratio, "radius": guard_radius, "active": guard_available(), "allies": guard_allies(),
		"count": guard_count, "total": guard_total, "log": guard_log.duplicate(true), "flash": _guard_flash_left > 0.0}

## 守護：這位武將此刻能不能提供：有這個技能、在場景樹裡（在場上）、沒有正要被移除、生命大於 0（敵人抵達城池的當下由 BattleManager 呼叫）
func base_guard_active() -> bool:
	return base_guard_mult < 1.0 and is_inside_tree() and _hero_alive(self)

## 守護：讀完技能後向 BattleManager 登記或取消（只是候選名單，抵達的當下才確認）；沒有 BattleManager（單獨建立的武將）時不做事
func _sync_base_guard() -> void:
	if _battle_mgr == null:
		return
	if base_guard_mult < 1.0:
		_battle_mgr.register_base_guard(self)
	else:
		_battle_mgr.unregister_base_guard(self)

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
	# 威壓的範圍（戰鬥中）：暗紅色的淡圈，半徑是目前的有效射程
	if _atk_down_aura_shown:
		var wr: float = attack_range * tile_size
		draw_circle(Vector2.ZERO, wr, Color(ATK_DOWN_AURA_COLOR, 0.06))
		draw_arc(Vector2.ZERO, wr, 0, TAU, 48, Color(ATK_DOWN_AURA_COLOR, 0.45), 1.5)

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
	# 護衛剛承擔過傷害：銀灰色的描邊（短暫顯示，畫在其他外框的外面）
	if _guard_flash_left > 0.0:
		draw_rect(rect.grow(7.0), Color(GUARD_COLOR, 0.95), false, 2.5)
	# 奇襲剛必殺：緋紅色的描邊（短暫顯示，畫在護衛描邊的外面）
	if _assassinate_flash_left > 0.0:
		draw_rect(rect.grow(9.5), Color(ASSASSINATE_COLOR, 0.95), false, 2.5)

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

## 連環計的連線效果（不用文字，Godot 專案沒有中文字型）：紫色的折線依序連接主目標與每一跳被打中的位置，每個落點有一個小圓
class ChainFx extends Node2D:
	## 相對於第一個點（主目標被打中的位置）的落點；第一個是 (0, 0)
	var points: PackedVector2Array = PackedVector2Array()
	var duration: float = 0.35
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
		for i in range(1, points.size()):
			draw_line(points[i - 1], points[i], Color(0.62, 0.42, 1.0, 0.95 * k), 4.0, true)
		for i in range(points.size()):
			draw_circle(points[i], 6.0, Color(0.8, 0.65, 1.0, 0.6 * k))

## 呼風喚雨的範圍效果（不用文字，Godot 專案沒有中文字型）：淡藍色的圓（半徑＝實際範圍）、旋轉的風弧與落下的雨絲，被打中的敵人位置有小圈；
## 半透明、不接收點擊，隨時間淡出
class StormFx extends Node2D:
	var radius: float = 96.0
	## 被打中的敵人位置（相對於中心）
	var points: PackedVector2Array = PackedVector2Array()
	var duration: float = 0.45
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
		var t: float = elapsed / maxf(duration, 0.001)
		draw_circle(Vector2.ZERO, radius, Color(0.45, 0.72, 1.0, 0.14 * k))
		draw_arc(Vector2.ZERO, radius, 0.0, TAU, 48, Color(0.72, 0.88, 1.0, 0.8 * k), 2.0, true)
		# 風：三段跟著時間旋轉的弧
		for i in range(3):
			var a0: float = t * PI * 1.6 + i * TAU / 3.0
			draw_arc(Vector2.ZERO, radius * (0.45 + 0.17 * i), a0, a0 + PI * 0.55, 16, Color(0.85, 0.95, 1.0, 0.75 * k), 3.0, true)
		# 雨：固定位置的斜線，隨時間往下落（只畫在圓內）
		for i in range(12):
			var gx: float = (float(i % 4) - 1.5) / 2.0
			var gy: float = (floorf(float(i) / 4.0) - 1.0) / 1.6
			var p: Vector2 = Vector2(gx, gy + fmod(t * 1.2 + 0.13 * i, 0.6) - 0.3) * radius
			if p.length() > radius * 0.92:
				continue
			draw_line(p, p + Vector2(-0.06, 0.16) * radius, Color(0.78, 0.9, 1.0, 0.7 * k), 2.0, true)
		for p in points:
			draw_arc(p, 9.0, 0.0, TAU, 16, Color(0.9, 0.97, 1.0, 0.9 * k), 2.0, true)
