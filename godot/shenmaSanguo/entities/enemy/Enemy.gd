## Enemy.gd
## 敵人：沿路點移動（飛行敵人直線飛向終點）、受傷、死亡、抵達基地

class_name Enemy
extends Node2D

# ── Signals ───────────────────────────────────────────────────
signal died(enemy: Node)
signal reached_base(enemy: Node)

# ── 屬性 ──────────────────────────────────────────────────────
var enemy_id: String  = "soldier"
## 生成序號：這一場第幾個生成的敵人（WaveManager 設定，從 0 起算）。橫掃的副目標距離相同時用它決定順序
var spawn_seq: int    = 0
var max_hp: float     = 100.0
var current_hp: float = 100.0
var base_speed: float = 1.5        # 像素/秒
## 一般倍率減速（武將在道路上的阻擋、步兵塔的緩速光環、武將的減速光環）：每個來源各自保存 {倍率, 剩餘有效期}。
## 生效的倍率 speed_mult ＝ 所有來源中最小的（最強的減速；和套用的先後無關），沒有來源時是 1：
## - 同一個來源再次套用只刷新倍率與有效期，不累加；不同來源不相乘（兩個 0.9 仍是 0.9）
## - 有效期用 _physics_process 的 delta 倒數（遊戲時間：受時間倍率與部署慢速影響，手動暫停時不前進）；
##   到期或來源自己撤除（remove_slow_from）時只移除那一個來源，其他來源照常生效
## 來源是施加者自己的識別字串（武將、防禦塔的節點各自不同，見 Hero.slow_source／Tower.slow_source），不用武將 id 或塔的種類
var speed_mult: float = 1.0
var _slow_sources: Dictionary = {}
## 沒有指定來源的舊入口（apply_slow／clear_slow）共用的來源：clear_slow 只撤除它，不會清掉其他來源
const LEGACY_SLOW_SOURCE: String = "legacy"
## 每一幀重新套用的減速（光環、道路阻擋）用的有效期：施加者每一幀都會刷新；施加者停止處理又沒有撤除時，最多再維持這麼久
const SLOW_REFRESH_TTL: float = 0.5
## 移動速度＝基礎速度 × speed_mult × (1 − 文士塔的疊加減速量)，最少保留基礎速度的 15%（MIN_SPEED_RATIO）
const MIN_SPEED_RATIO: float = 0.15
var _stack_slow_amount: float = 0.0 # 疊加的減速量（來自文士塔）
var _stack_slow_timer: float = 0.0  # 疊加減速持續時間

# ── 移動方式（enemies_config 的 movement_type）──────────────────
## "flying"（去掉前後空白後完全相同）是飛行，其他（沒有這個欄位、空白、不認得的值）一律是地面。
## 飛行：從這一組路線的第一個路點直線飛到最後一個路點（忽略中間的轉折），不被武將擋住、不攻擊武將；
## 只有能對空的武將與防禦塔打得到（Hero.can_target、Tower.can_target）。
## 飛行路線至少要有兩個路點、起點和終點不同，否則一出現就在終點：這個檢查在出兵前由 WaveManager.plan_wave 做，無效的組不出兵。
## 地面路線同樣至少要有兩個路點，而且沿路點走的總路程不為 0（環狀路線可以），也在出兵前檢查
const MOVE_GROUND: String = "ground"
const MOVE_FLYING: String = "flying"
var movement_type: String = MOVE_GROUND

# ── 路徑 ──────────────────────────────────────────────────────
var _waypoints: Array   = []       # Array[Vector2] 像素座標（飛行只有起點與終點）
var _wp_index: int      = 0
## _tail[i]：路點 i 到終點的路程（像素，沿路點折線）。剩餘路程＝目前位置到下一個路點＋_tail[下一個路點]
var _tail: Array        = []
## 飛行的直線總長（像素）：路線完成比例的分母
var _flight_len: float  = 0.0

# ── 視覺常數 ──────────────────────────────────────────────────
var tile_size: int      = 48
var enemy_radius: int   = 17
const HP_BAR_W: int     = 36
const HP_BAR_H: int     = 5
const FLASH_TIME: float = 0.12

# ── 閃爍效果 ──────────────────────────────────────────────────
var _flash_timer: float = 0.0
var _is_dead: bool      = false
var _texture: Texture2D = null
var _texture_atk: Texture2D = null

# ── 灼燒（周瑜「火攻」，Hero.gd 命中時呼叫 apply_burn）───────────────
## 同一個敵人只有一份灼燒：剩餘跳數、每跳傷害（最近一次命中時的快照）、距離下一跳的時間。
## 時間用 _physics_process 的 delta 推進（受 Engine.time_scale 影響；遊戲暫停時不前進）
var _burn_ticks_left: int   = 0
var _burn_damage: float     = 0.0
var _burn_interval: float   = 1.0
var _burn_timer: float      = 0.0
const BURN_COLOR: Color     = Color(1.0, 0.55, 0.05)  # 橘色：灼燒標記與跳傷數字
## 夏侯惇「反擊」反彈的傷害數字：洋紅色（和普通攻擊的橘紅、灼燒的橘色區分）
const COUNTER_COLOR: Color  = Color(1.0, 0.35, 0.8)

# ── 暈眩（張飛「暈眩」，Hero.gd 命中時呼叫 apply_stun）───────────────
## 剩餘的暈眩時間（秒，遊戲時間：_physics_process 的 delta，受時間倍率與部署慢速影響，手動暫停時不前進）；0 表示沒有暈眩。
## 暈眩中不移動、不攻擊阻路的武將，照常受傷與死亡；減速、灼燒照常計時，攻擊冷卻照常倒數但停在 0（不囤積）。
## 不是減速：不看 immune_slow，也不改 speed_mult。再次套用時取較長的剩餘時間（刷新、不累加，也不會縮短）。
## 記在敵人身上：施加的武將移位、被移除、陣亡都不提早解除；敵人死亡、抵達基地或切換關卡時跟著節點一起消失
var _stun_left: float = 0.0
## 暈眩的標記顏色（黃色星星，和淺藍色的減速、橘色的灼燒區分）
const STUN_COLOR: Color = Color(1.0, 0.9, 0.25)
## 剩餘時間小於這個值就算結束（浮點誤差：0.5 秒在每秒 60 步時正好 30 步，不會因為 0.5 − 30 × (1/60) 留下極小的正數而多停一步）
const STUN_END_EPS: float = 1e-6
## 測試用唯讀資訊（debug_snapshot）：生效的暈眩次數（包括刷新）；這個敵人出現後經過的遊戲時間（物理步進的 delta），
## 以及用這個時間記下的暈眩區間（[開始, 結束]，還在暈眩時結束是 -1）與攻擊阻路武將的時間（各保留最近 STUN_LOG_MAX 筆）
var stun_count: int = 0
var _age: float = 0.0
var stun_log: Array = []
var attack_log: Array = []
const STUN_LOG_MAX: int = 40

# ── 武將阻路 ──────────────────────────────────────────────────
var _game_map: Node        = null
var _blocker: Node         = null   # 正在阻擋路徑的武將
var _blocked_cell: Vector2i = Vector2i(-1, -1)
## 攻擊阻路武將的冷卻：距離下一擊的遊戲時間（物理步進的 delta，受時間倍率影響；手動暫停時節點停住、不前進）。
## 每個敵人只有一份，換阻擋對象（武將死亡、移位、移除後遇到下一位）不重設：
## - 阻擋中：越過零點的零頭保留到下一擊（1 倍與 2 倍在相同遊戲時間的擊數相同）；原本就在待命（冷卻已是 0）時打一擊後設回完整間隔
## - 沒有阻擋：照常倒數但停在 0，不累積欠下的攻擊；恢復阻擋時最多先打一擊，之後照攻擊間隔
## - 一步最多打一擊；第一次接觸時，偵測到阻擋的那一步不攻擊，下一步冷卻已到（初始 0）就打
var _blocker_atk_timer: float = 0.0
## 對阻路武將的直接攻擊力（enemies_config 的 atk）：每次攻擊交給 Hero.take_damage（照武將的防禦公式減傷、趙雲可閃避、夏侯惇可反擊）；
## 顏良的威壓在攻擊當下乘上倍率（見 atk_mult、effective_blocker_atk），這個值本身不變。
## 只接受有限、不小於 0 的數字（JSON 的數字，包括 0：0 照樣是一次攻擊、用掉冷卻，只是沒有傷害）；
## 沒有這個欄位、空白、字串（包括看起來像數字的）、布林、負數、NaN、無限大一律用 BLOCKER_ATK_DEFAULT。
## 不設上限。只用在攻擊阻路武將：抵達城池一律扣 1（BattleManager），和它無關。Web 的 utils/enemyCombat 用同一份規則顯示
const BLOCKER_ATK_DEFAULT: float = 20.0
var blocker_atk: float = BLOCKER_ATK_DEFAULT
const BLOCKER_ATK_SPD: float = 1.0 # 攻擊間隔（秒）
## 測試用唯讀統計：這個敵人攻擊阻路武將的次數（每次攻擊都算，包括被閃避、沒有扣血的）
var blocker_attacks: int = 0

# ── 威壓（顏良「威壓」，Hero.gd 的 atk_down_aura 每一幀套用）────────────
## 對阻路武將的直接攻擊力倍率：每個來源各自保存 {倍率, 剩餘有效期}。生效的倍率 atk_mult ＝ 所有來源中最小的（最強的減攻），沒有來源時是 1：
## - 同一個來源再次套用只刷新倍率與有效期，不累加；不同來源不相乘（0.9 與 0.8 同時作用是 0.8，撤除 0.8 後回到 0.9）
## - 施加者自己撤除（remove_atk_down_from）時立即恢復；有效期用 _physics_process 的 delta 倒數（遊戲時間：受時間倍率與部署慢速影響，
##   手動暫停時不前進），只是施加者停止處理又沒有撤除時的清理保險
## 每次攻擊阻路武將時用當下的有效攻擊力（effective_blocker_atk ＝ blocker_atk × atk_mult），再交給武將照常計算閃避、防禦、堅韌與反擊；
## blocker_atk 本身（敵人設定的攻擊力）不變。移動速度、攻擊間隔與冷卻、抵達城池扣的城防（BattleManager 固定扣 1）都不受影響。
## 不是減速：免疫減速（immune_slow）的敵人照樣受到；飛行敵人也可以有這個狀態（目前飛行敵人不阻路，也就不攻擊武將）
var atk_mult: float = 1.0
var _atk_down_sources: Dictionary = {}
## 每一幀重新套用的威壓用的有效期：施加者每一幀都會刷新；施加者停止處理又沒有撤除時，最多再維持這麼久
const ATK_DOWN_REFRESH_TTL: float = 0.5
## 測試用唯讀資訊（debug_snapshot）：最近 STUN_LOG_MAX 次攻擊阻路武將時的時間（_age）、敵人設定的攻擊力、倍率與實際用的攻擊力
## （attack_log 只記時間、格式不變）
var atk_log: Array = []
## 威壓的標記顏色（暗紅色的向下箭頭，和淺藍色的減速、橘色的灼燒、黃色的暈眩區分）
const ATK_DOWN_COLOR: Color = Color(0.85, 0.22, 0.28)

# ── 魅惑（貂蟬「魅惑」，Hero.gd 命中時呼叫 apply_charm）─────────────
## 受控：來源（施加的武將，weakref）、它的 BattleManager（weakref）與那一場的生命週期編號、結束的戰鬥時間（battle_time）、
## 攻擊其他敵人的範圍（像素）、找攻擊對象用的 WaveManager（來源的，weakref）。沒有受控時 _charm_src 是 null。
## 受控中：仍然活著（波次照樣要等它倒下或抵達），但不前進、不抵達城池、不攻擊武將（受控開始時解除阻擋）；攻擊冷卻和攻擊阻路武將共用
## _blocker_atk_timer（進出受控都不重設，一步最多一擊），冷卻好了就用 effective_blocker_atk（含威壓）打範圍內最近的其他敵人
## （地面、活著、沒有受控、同一場；距離相同時生成序號小的優先），沒有對象時原地等待。暈眩照常抑制攻擊；減速、灼燒、威壓照原本的時間繼續。
## 結束：戰鬥時間到期（手動暫停、備戰、結算時戰鬥時間不前進）、來源失效（陣亡、被移除、技能失效）、不同的一場；
## 結束後從原本的位置與路點繼續走（下一步照常判斷阻擋與抵達）。已經受控時不疊加、不刷新、不轉移
var _charm_src: WeakRef = null
var _charm_bm: WeakRef = null
var _charm_wave: WeakRef = null
var _charm_life: int = -1
var _charm_until: float = 0.0
var _charm_radius_px: float = 0.0
var _charm_hero_id: String = ""
## 測試用唯讀統計（debug_snapshot）：受控的次數、受控時攻擊其他敵人的次數，以及最近 CHARM_LOG_MAX 筆（開始、攻擊、結束）
var charm_count: int = 0
var charm_attacks: int = 0
var charm_log: Array = []
const CHARM_LOG_MAX: int = 40
## 範圍邊界的容許誤差（像素）：距離正好是半徑的敵人算在範圍內
const CHARM_EDGE_EPS: float = 0.001
## 受控中的外圈顏色（粉紅色，和遊戲裡的 CHARM 標記同色）
const CHARM_COLOR: Color = Color(1.0, 0.5, 0.85)

# ── 免疫減速（enemies_config 的 trait）────────────────────────────
## trait 是字串、去掉前後空白後完全等於 immune_slow 時，這個敵人不受任何減速：武將在道路上的阻擋減速、步兵塔的緩速光環（apply_slow）
## 與文士塔的疊加減速（apply_stackable_slow）都不套用，也不顯示減速提示。只看 trait，不看敵人的種類或 id；其他 trait 的值遊戲不使用。
## 免疫減速不是不被阻擋：地面敵人遇到武將照樣停下並攻擊武將；時間倍率與手動暫停照常作用（它們不是減速）
## 所有減速入口（apply_slow_from、apply_slow、apply_stackable_slow）都在最前面拒絕
const TRAIT_IMMUNE_SLOW: String = "immune_slow"
var immune_slow: bool = false

# ── 顏色（依 enemy_id 可設不同顏色，預設灰） ──────────────
var body_color: Color   = Color(0.55, 0.20, 0.20, 1)  # 深紅兵
var label_text: String  = "兵"

# ── 飛行的外觀（只用圖形，Godot 專案沒有中文字型）──────────────
## 身體往上畫的比例（× 半徑）：純視覺，命中、射程、移動都用實際座標
const FLY_LIFT: float        = 0.45
const FLY_WING_COLOR: Color  = Color(0.95, 0.97, 1.0, 0.9)
const FLY_SHADOW_COLOR: Color = Color(0.0, 0.0, 0.0, 0.35)
## 倍率減速的標記顏色（淺藍）
const SLOW_COLOR: Color      = Color(0.45, 0.85, 1.0, 0.9)

# ═══════════════════════════════════════════
#  初始化
# ═══════════════════════════════════════════
func setup(cfg: Dictionary, waypoints: Array) -> void:
	movement_type = MOVE_FLYING if str(cfg.get("movement_type", "")).strip_edges() == MOVE_FLYING else MOVE_GROUND
	# 飛行只取這條路線的起點與終點（同一個 Array 由同一組的敵人共用，這裡另外建立，不改動它）
	_waypoints   = [waypoints[0], waypoints[waypoints.size() - 1]] if is_flying() and waypoints.size() >= 2 else waypoints
	_wp_index    = 1
	_build_tail()
	max_hp       = float(cfg.get("hp", 100))
	current_hp   = max_hp
	base_speed   = float(cfg.get("speed", 1.5))
	blocker_atk  = blocker_atk_of(cfg)
	immune_slow  = is_immune_slow_cfg(cfg)
	enemy_id     = str(cfg.get("enemy_id", "soldier"))
	label_text   = str(cfg.get("name", "兵")).left(1)
	enemy_radius = max(8, int(tile_size * 0.35))
	var img_name: String = str(cfg.get("image", ""))
	if img_name != "":
		var path: String = "res://assets/units/" + img_name
		if ResourceLoader.exists(path):
			_texture = load(path) as Texture2D
			
			# 嘗試讀取攻擊圖片
			var atk_path: String = path.replace(".webp", "_atk.webp")
			if ResourceLoader.exists(atk_path):
				_texture_atk = load(atk_path) as Texture2D
			else:
				atk_path = path.replace(".webp", "_attack.webp")
				if ResourceLoader.exists(atk_path):
					_texture_atk = load(atk_path) as Texture2D

	# 依 enemy_id 設定顏色
	match enemy_id:
		"cavalry":  body_color = Color(0.20, 0.20, 0.65, 1); label_text = "騎"
		"archer":   body_color = Color(0.20, 0.55, 0.20, 1); label_text = "弓"
		"general":  body_color = Color(0.65, 0.50, 0.10, 1); label_text = "將"
		_:          body_color = Color(0.55, 0.20, 0.20, 1)

	if not waypoints.is_empty():
		position = waypoints[0]
	queue_redraw()

# ═══════════════════════════════════════════
#  _physics_process — 移動（Web 端使用物理時鐘較穩定）
# ═══════════════════════════════════════════
func _physics_process(delta: float) -> void:
	if _is_dead or _waypoints.is_empty():
		return

	# 防止 Web 端 delta 異常導致的「瞬移」
	delta = min(delta, 0.1)
	_age += delta

	# 閃爍與狀態計時
	if _flash_timer > 0.0:
		_flash_timer -= delta
		if _flash_timer <= 0.0:
			queue_redraw()

	if _stack_slow_timer > 0.0:
		_stack_slow_timer -= delta
		if _stack_slow_timer <= 0.0:
			_stack_slow_amount = 0.0 # 疊加效果結束
			queue_redraw()
	_tick_slow_sources(delta)
	_tick_atk_down_sources(delta)

	# 灼燒：到時間就跳一次（走一般的受傷／死亡流程）；死亡後立即停止
	if _burn_ticks_left > 0:
		_burn_timer -= delta
		while _burn_ticks_left > 0 and _burn_timer <= 0.0 and not _is_dead:
			_burn_ticks_left -= 1
			_burn_timer += _burn_interval
			take_damage(_burn_damage, true)
			if _burn_ticks_left == 0:
				queue_redraw()
		if _is_dead:
			return

	# 魅惑：受控中不前進、不抵達城池、不攻擊武將，改打附近的其他敵人（到期或來源失效時先整理，這一步照常處理）
	if _charm_step():
		_charm_physics(delta)
		return

	# 抵達終點
	if _wp_index >= _waypoints.size():
		_on_reached_base()
		return

	# ── 武將阻路處理 ──────────────────────────────────────────
	# 武將失效、死亡、已被移除（排入刪除），或者已經不在原本阻擋的格子（被玩家移走）：解除阻擋，攻擊冷卻不重設
	if _blocker != null and (not is_instance_valid(_blocker) or _blocker.is_queued_for_deletion() or _blocker.current_hp <= 0.0 or _blocker.get_cell() != _blocked_cell):
		_blocker = null
		_blocked_cell = Vector2i(-1, -1)
		queue_redraw()  # 回到走路的圖

	# ── 暈眩：這一步不移動、不攻擊（上面的減速、灼燒已照常計時；阻擋的武將失效時也已照常解除）──
	# 攻擊冷卻照遊戲時間倒數、停在 0，不囤積：恢復後冷卻已到就先打一擊，之後照攻擊間隔。
	# 開始暈眩後的每一步都算在暈眩裡（包括剩餘時間在這一步歸零的那一步），暈眩的長度以物理步進為單位，最多差一步
	if _stun_left > 0.0:
		_stun_left -= delta
		_blocker_atk_timer = maxf(0.0, _blocker_atk_timer - delta)
		if _stun_left <= STUN_END_EPS:
			_stun_left = 0.0
			if not stun_log.is_empty():
				stun_log.back()["to"] = _age
		queue_redraw()  # 星星轉動；結束時移除標記、換回攻擊或走路的圖
		return

	if _blocker != null:
		var was_ready: bool = _blocker_atk_timer <= 0.0
		_blocker_atk_timer -= delta
		if _blocker_atk_timer <= 0.0:
			# 被閃避（沒有扣血）也是一次攻擊：照樣用掉冷卻
			blocker_attacks += 1
			attack_log.append(_age)
			if attack_log.size() > STUN_LOG_MAX:
				attack_log.pop_front()
			# 威壓：用這一擊當下的有效攻擊力（敵人設定的攻擊力 × 目前最強的減攻倍率）
			var hit_atk: float = effective_blocker_atk()
			atk_log.append({"t": _age, "base": blocker_atk, "mult": atk_mult, "atk": hit_atk})
			if atk_log.size() > STUN_LOG_MAX:
				atk_log.pop_front()
			# 傳入自己當作攻擊者：夏侯惇的反擊只反彈給攻擊它的敵人
			_blocker.take_damage(hit_atk, self)
			# 反擊可能在這一擊把自己打倒（死亡、擊殺與金幣已在受傷時處理一次）：之後不再處理這一步
			if _is_dead:
				return
			# 保留這一步越過零點的零頭；原本就在待命、或零頭長過一個間隔時從這一擊起算完整的間隔
			var late: float = 0.0 if was_ready else -_blocker_atk_timer
			_blocker_atk_timer = BLOCKER_ATK_SPD - (late if late < BLOCKER_ATK_SPD else 0.0)
		queue_redraw()
		return  # 停下來等武將死亡或移開
	# 沒有阻擋：冷卻照遊戲時間倒數，停在 0（待命），不囤積攻擊
	_blocker_atk_timer = maxf(0.0, _blocker_atk_timer - delta)

	# 檢查前方格子是否有武將阻路（飛行敵人不被武將擋住，也就不會停下來攻擊武將）
	if _game_map != null and not is_flying():
		var cur_cell: Vector2i  = _game_map.world_to_grid(position)
		var next_cell: Vector2i = _game_map.world_to_grid(_waypoints[_wp_index])
		for check_cell in [cur_cell, next_cell]:
			var occ: Node = _game_map.get_occupant(check_cell)
			if occ != null and occ is Hero and not occ.is_queued_for_deletion() and occ.current_hp > 0.0:
				# 只記下阻擋對象；攻擊冷卻沿用這個敵人目前的剩餘時間（換目標不重設）
				_blocker = occ
				_blocked_cell = check_cell
				queue_redraw()
				return

	# 移動
	var target: Vector2        = _waypoints[_wp_index]
	var effective_speed: float = get_effective_speed()
	
	var direction: Vector2     = (target - position).normalized()
	var move_dist: float       = effective_speed * delta

	if position.distance_to(target) <= move_dist:
		position = target
		_wp_index += 1
	else:
		position += direction * move_dist
		queue_redraw()

# ═══════════════════════════════════════════
#  受傷 / 死亡
# ═══════════════════════════════════════════
## is_burn：灼燒的跳傷（數字用橘色、稍微往上，和普通攻擊區分）；is_counter：夏侯惇反擊的反彈傷害（數字用洋紅色、稍微往下）。
## 死亡、擊殺與金幣照一般流程只觸發一次。
## 回傳這一擊實際扣掉的生命，不含超過剩餘生命的部分（剩 30 時受到 100 回傳 30，打倒的這一擊也照算；魏延的吸血用它計算恢復量）。
## 拒絕無效的受傷：傷害不是正的有限數字（0、負數、NaN、正負無限大），或這個敵人已經倒下、正要被移除時，立即回傳 0，
## 生命、傷害數字、音效、閃爍都不變，也不會發出死亡信號（不會被擊殺、不會重複死亡、不影響結算）
func take_damage(amount: float, is_burn: bool = false, is_counter: bool = false) -> float:
	if _is_dead or is_queued_for_deletion() or not (amount > 0.0 and is_finite(amount)):
		return 0.0
	var dealt: float = minf(amount, maxf(current_hp, 0.0))
	current_hp -= amount
	_flash_timer = FLASH_TIME

	# 顯示傷害數字
	var ft = load("res://ui/FloatingText.gd").new()
	get_parent().add_child(ft)
	if is_burn:
		ft.setup("%.0f" % amount, BURN_COLOR, global_position + Vector2(0, -12))
	elif is_counter:
		ft.setup("%.0f" % amount, COUNTER_COLOR, global_position + Vector2(0, 10))
	else:
		ft.setup("%.0f" % amount, Color(1.0, 0.4, 0.2), global_position)

	if current_hp <= 0.0:
		current_hp = 0.0
		_die()
	else:
		_sfx("enemy_hit")  # 死亡時由 _die() 播音，避免重疊
	queue_redraw()
	return dealt

## 套用（或刷新）source 這個來源的倍率減速：mult 是移動速度的倍率（0.9 ＝ 降低 10%），duration 是有效期（秒，遊戲時間）。
## 不套用：免疫減速、已經倒下、來源是空字串、倍率不在 0～1 之間（不含兩端）、有效期不是正的有限數字
func apply_slow_from(source: String, mult: float, duration: float) -> void:
	if immune_slow or _is_dead or source == "":
		return
	if not (is_finite(mult) and mult > 0.0 and mult < 1.0 and is_finite(duration) and duration > 0.0):
		return
	_slow_sources[source] = {"mult": mult, "left": duration}
	_refresh_speed_mult()

## 撤除 source 這個來源的減速；其他來源不受影響（沒有這個來源時什麼都不做）
func remove_slow_from(source: String) -> void:
	if _slow_sources.erase(source):
		_refresh_speed_mult()

func has_slow_from(source: String) -> bool:
	return _slow_sources.has(source)

## 測試用唯讀資訊（debug_snapshot）：每個來源目前的倍率與剩餘有效期
func slow_sources_state() -> Dictionary:
	var out: Dictionary = {}
	for s in _slow_sources:
		out[s] = {"mult": _slow_sources[s].mult, "left": _slow_sources[s].left}
	return out

## 舊入口（相容用）：沒有指定來源的倍率減速，來源固定是 LEGACY_SLOW_SOURCE，同樣照有效期到期
func apply_slow(mult: float, duration: float) -> void:
	apply_slow_from(LEGACY_SLOW_SOURCE, mult, duration)

## 舊入口（相容用）：只撤除 apply_slow 套用的效果，不會清掉武將、防禦塔或光環的來源
func clear_slow() -> void:
	remove_slow_from(LEGACY_SLOW_SOURCE)

## 目前的移動速度（像素／秒，不含時間倍率）：基礎速度 × speed_mult × (1 − 疊加減速量)，最少基礎速度的 15%
func get_effective_speed() -> float:
	return maxf(base_speed * MIN_SPEED_RATIO, base_speed * speed_mult * (1.0 - _stack_slow_amount))

func _refresh_speed_mult() -> void:
	var m: float = 1.0
	for s in _slow_sources:
		m = minf(m, float(_slow_sources[s].mult))
	if m != speed_mult:
		speed_mult = m
		queue_redraw()  # 減速標記

## 倒數每個來源的有效期（遊戲時間）；到期的來源移除
func _tick_slow_sources(delta: float) -> void:
	if _slow_sources.is_empty():
		return
	var expired: Array = []
	for s in _slow_sources:
		var e: Dictionary = _slow_sources[s]
		e.left = float(e.left) - delta
		if e.left <= 0.0:
			expired.append(s)
	for s in expired:
		_slow_sources.erase(s)
	if not expired.is_empty():
		_refresh_speed_mult()

## 套用（或刷新）source 這個來源的威壓：mult 是對阻路武將的直接攻擊力倍率（0.9 ＝ 降低 10%），duration 是有效期（秒，遊戲時間）。
## 不套用（已有的來源也不改動）：已經倒下或正要被移除、來源是空字串、倍率不在 0～1 之間（不含兩端）、有效期不是正的有限數字。
## 不看 immune_slow（威壓不是減速）
func apply_atk_down_from(source: String, mult: float, duration: float) -> void:
	if _is_dead or is_queued_for_deletion() or source == "":
		return
	if not (is_finite(mult) and mult > 0.0 and mult < 1.0 and is_finite(duration) and duration > 0.0):
		return
	_atk_down_sources[source] = {"mult": mult, "left": duration}
	_refresh_atk_mult()

## 撤除 source 這個來源的威壓；其他來源不受影響（沒有這個來源時什麼都不做）
func remove_atk_down_from(source: String) -> void:
	if _atk_down_sources.erase(source):
		_refresh_atk_mult()

func has_atk_down_from(source: String) -> bool:
	return _atk_down_sources.has(source)

## 對阻路武將的有效攻擊力：敵人設定的攻擊力 × 目前最強的減攻倍率（攻擊力 0 仍是 0）
func effective_blocker_atk() -> float:
	return blocker_atk * atk_mult

## 測試用唯讀資訊（debug_snapshot）：敵人設定的攻擊力、倍率、有效攻擊力、每個來源的倍率與剩餘有效期、最近幾次攻擊用的攻擊力
func atk_down_state() -> Dictionary:
	var src: Dictionary = {}
	for s in _atk_down_sources:
		src[s] = {"mult": _atk_down_sources[s].mult, "left": _atk_down_sources[s].left}
	return {"base": blocker_atk, "mult": atk_mult, "effective": effective_blocker_atk(), "sources": src, "log": atk_log.duplicate(true)}

func _refresh_atk_mult() -> void:
	var m: float = 1.0
	for s in _atk_down_sources:
		m = minf(m, float(_atk_down_sources[s].mult))
	if m != atk_mult:
		atk_mult = m
		queue_redraw()  # 威壓標記

## 倒數每個威壓來源的有效期（遊戲時間）；到期的來源移除
func _tick_atk_down_sources(delta: float) -> void:
	if _atk_down_sources.is_empty():
		return
	var expired: Array = []
	for s in _atk_down_sources:
		var e: Dictionary = _atk_down_sources[s]
		e.left = float(e.left) - delta
		if e.left <= 0.0:
			expired.append(s)
	for s in expired:
		_atk_down_sources.erase(s)
	if not expired.is_empty():
		_refresh_atk_mult()

## 疊加減速（文士塔用）。免疫減速的敵人不套用，也不顯示「緩」
func apply_stackable_slow(amount: float, duration: float) -> void:
	if immune_slow:
		return
	_stack_slow_amount += amount
	if _stack_slow_amount > 0.85:
		_stack_slow_amount = 0.85  # 最多減少 85%
	_stack_slow_timer = duration   # 每次被打中都會刷新持續時間
	
	# 顯示「減速」提示字
	var ft = load("res://ui/FloatingText.gd").new()
	get_parent().add_child(ft)
	ft.setup("緩", Color(0.2, 0.6, 0.9), global_position + Vector2(0, -10))
	
	queue_redraw()

## 周瑜「火攻」：附加灼燒。同一個敵人只有一份：
## - 沒有灼燒時：開始新的一份，第一跳在 interval 秒後（命中當下不另外跳）
## - 已在灼燒時：剩餘跳數刷新為 ticks、每跳傷害換成這次的快照，已在倒數的下一跳時間不變（不疊加、不延後）
## 不套用（什麼都不改：沒有新的灼燒，已有的灼燒照原本的時間、跳數與每跳傷害燒完）：已經倒下或正要被移除、
## 每跳傷害或間隔不是正的有限數字（0、負數、NaN、正負無限大；無限大或 NaN 的間隔會讓灼燒永遠不結束）、跳數不是正數
func apply_burn(damage: float, ticks: int, interval: float) -> void:
	if _is_dead or is_queued_for_deletion() or ticks <= 0:
		return
	if not (damage > 0.0 and is_finite(damage) and interval > 0.0 and is_finite(interval)):
		return
	if _burn_ticks_left <= 0:
		_burn_interval = interval
		_burn_timer = interval
	_burn_ticks_left = ticks
	_burn_damage = damage
	queue_redraw()

func is_burning() -> bool:
	return _burn_ticks_left > 0 and not _is_dead

## 張飛「暈眩」：這個敵人暈眩 duration 秒（遊戲時間）。已在暈眩時剩餘時間取較長的（不累加、不縮短）。
## 不看 immune_slow（暈眩不是減速）。不套用：已經倒下、時間不是正的有限數字。回傳這次是否生效
func apply_stun(duration: float) -> bool:
	if _is_dead or not (is_finite(duration) and duration > 0.0):
		return false
	if _stun_left <= 0.0:
		stun_log.append({"from": _age, "to": -1.0})
		if stun_log.size() > STUN_LOG_MAX:
			stun_log.pop_front()
	_stun_left = maxf(_stun_left, duration)
	stun_count += 1
	queue_redraw()
	return true

func is_stunned() -> bool:
	return _stun_left > 0.0 and not _is_dead

## 貂蟬「魅惑」：讓這個敵人受控 duration 秒（source 的 BattleManager 的戰鬥時間），攻擊其他敵人的範圍 radius_px（像素）。回傳是否生效。
## 不生效（什麼都不改）：已經倒下或正要被移除、飛行、已經受控（不疊加、不刷新、不轉移）、時間或範圍不是正的有限數字、來源或 BattleManager 無效、
## 來源此刻不能提供。生效時解除原本的阻擋（不再攻擊擋路的武將），攻擊冷卻、生命、路點、位置、減速、暈眩、灼燒、威壓都不動
func apply_charm(source: Node, bm: Node, duration: float, radius_px: float) -> bool:
	if _is_dead or is_queued_for_deletion() or is_flying() or is_charmed():
		return false
	if not (is_finite(duration) and duration > 0.0 and is_finite(radius_px) and radius_px > 0.0):
		return false
	if source == null or bm == null or not is_instance_valid(source) or not is_instance_valid(bm) or not source.charm_source_active():
		return false
	_charm_src = weakref(source)
	_charm_bm = weakref(bm)
	_charm_wave = weakref(source._wave_mgr) if source._wave_mgr != null else null
	_charm_life = bm.lifecycle()
	_charm_until = float(bm.battle_time) + duration
	_charm_radius_px = radius_px
	_charm_hero_id = str(source.hero_id)
	charm_count += 1
	_blocker = null
	_blocked_cell = Vector2i(-1, -1)
	_charm_note({"ev": "start", "t": float(bm.battle_time), "source": _charm_hero_id, "until": _charm_until})
	queue_redraw()
	return true

## 受控中：有來源、還沒到期、來源此刻仍能提供、同一場（只判斷，不改任何狀態；結束的整理在 _physics_process）。
## 受控的敵人仍然活著（is_dead 是 false），只是不是武將與防禦塔敵對可選的目標
func is_charmed() -> bool:
	return _charm_src != null and not _is_dead and _charm_end_reason() == ""

## 受控剩下的戰鬥時間（秒）；沒有受控時是 0
func charm_remaining() -> float:
	if not is_charmed():
		return 0.0
	return maxf(0.0, _charm_until - float(_charm_bm.get_ref().battle_time))

## 受控要結束的原因：source（來源陣亡、被移除、技能失效）、battle（不同的一場）、expired（戰鬥時間到期）；還在受控時是空字串
func _charm_end_reason() -> String:
	var h: Variant = _charm_src.get_ref() if _charm_src != null else null
	var bm: Variant = _charm_bm.get_ref() if _charm_bm != null else null
	if h == null or not is_instance_valid(h) or not h.has_method("charm_source_active") or not h.charm_source_active():
		return "source"
	if bm == null or not is_instance_valid(bm) or h._battle_mgr != bm or bm.lifecycle() != _charm_life:
		return "battle"
	if float(bm.battle_time) >= _charm_until:
		return "expired"
	return ""

## 這一步還受控嗎？受控已經結束時整理（清掉來源、記下原因、重畫）並回傳 false
func _charm_step() -> bool:
	if _charm_src == null:
		return false
	var reason: String = _charm_end_reason()
	if reason == "":
		return true
	var bm: Variant = _charm_bm.get_ref() if _charm_bm != null else null
	_charm_note({"ev": "end", "t": float(bm.battle_time) if bm != null and is_instance_valid(bm) else -1.0, "reason": reason})
	_charm_src = null
	_charm_bm = null
	_charm_wave = null
	_charm_hero_id = ""
	queue_redraw()
	return false

## 受控中的一步：暈眩時不攻擊（和平常相同，暈眩照遊戲時間結束）；備戰、結算時不攻擊；
## 否則攻擊冷卻好了就打範圍內最近的其他敵人（一步最多一擊；沒有對象時冷卻停在 0，不囤積）
func _charm_physics(delta: float) -> void:
	if is_stunned():
		_charm_stunned(delta)
		return
	var bm: Variant = _charm_bm.get_ref()
	if not bm.combat_active():
		_blocker_atk_timer = maxf(0.0, _blocker_atk_timer - delta)
		return
	var was_ready: bool = _blocker_atk_timer <= 0.0
	_blocker_atk_timer -= delta
	if _blocker_atk_timer > 0.0:
		return
	var victim: Node = _charm_pick()
	if victim == null:
		_blocker_atk_timer = 0.0
		return
	var hit_atk: float = effective_blocker_atk()
	var dealt: float = victim.take_damage(hit_atk)
	charm_attacks += 1
	_charm_note({"ev": "hit", "t": float(bm.battle_time), "target": int(victim.spawn_seq), "atk": hit_atk, "dealt": dealt, "killed": victim.is_dead()})
	var late: float = 0.0 if was_ready else -_blocker_atk_timer
	_blocker_atk_timer = BLOCKER_ATK_SPD - (late if late < BLOCKER_ATK_SPD else 0.0)
	queue_redraw()

## 受控中的暈眩：和沒有受控時相同（暈眩照遊戲時間結束、攻擊冷卻倒數到 0 為止、這一步不攻擊）
func _charm_stunned(delta: float) -> void:
	_stun_left = _stun_left - delta
	_blocker_atk_timer = maxf(0.0, _blocker_atk_timer - delta)
	if _stun_left <= STUN_END_EPS:
		_stun_left = 0.0
		if not stun_log.is_empty():
			stun_log.back()["to"] = _age
	queue_redraw()

## 受控時攻擊的對象：來源的 WaveManager 這一場的敵人中，範圍內（中心距離、含邊界）最近的其他地面敵人（活著、沒有正要被移除、沒有受控）；
## 距離相同時生成序號小的優先；沒有時是 null。受控的敵人不打武將、防禦塔、城池、自己與其他受控的敵人，也不打飛行敵人
func _charm_pick() -> Node:
	var w: Variant = _charm_wave.get_ref() if _charm_wave != null else null
	if w == null or not is_instance_valid(w):
		return null
	var best: Node = null
	var best_d: float = 0.0
	var best_seq: int = 0
	for e in w.get_active_enemies():
		if e == self or not is_instance_valid(e) or not (e is Enemy) or e.is_queued_for_deletion() or e.is_dead():
			continue
		if e.is_flying() or e.is_charmed():
			continue
		if w.has_method("owns_enemy") and not w.owns_enemy(e):
			continue
		var raw: float = global_position.distance_to(e.global_position)
		if raw > _charm_radius_px + CHARM_EDGE_EPS:
			continue
		# 距離取到 0.001 像素再比較：浮點誤差造成的極小差距視為等距，交給生成序號決定
		var d: float = snappedf(raw, 0.001)
		var seq: int = int(e.spawn_seq)
		if best == null or d < best_d or (d == best_d and seq < best_seq):
			best = e
			best_d = d
			best_seq = seq
	return best

func _charm_note(entry: Dictionary) -> void:
	charm_log.append(entry)
	if charm_log.size() > CHARM_LOG_MAX:
		charm_log.pop_front()

## 測試用唯讀資訊（debug_snapshot）：是否受控、來源的 hero_id、剩下的戰鬥時間、生成序號、受控的次數、受控時的攻擊次數、最近幾筆紀錄
func charm_state() -> Dictionary:
	var on: bool = is_charmed()
	return {"charmed": on, "source": _charm_hero_id if on else "", "remaining": charm_remaining(), "seq": spawn_seq,
		"count": charm_count, "attacks": charm_attacks, "log": charm_log.duplicate(true)}

## 許褚「怪力」：沿這個敵人自己已經走過的路線往回退最多 distance 像素，回傳實際退了多少（不能退時是 0）。
## 依路點的索引倒退（彎道、重複的路點、繞回或交叉的路線都照走過的順序，不用距離重新投影到別段）：
## 從目前位置退向上一個路點，退到了還有剩就把 _wp_index 減一、接著退向更前面的路點，最多退到路線起點（不越過、不換路線）。
## 退完後 _wp_index 仍指向下一個要走向的路點，下一步照原本的路線往前走；剩餘路程增加實際退的距離。
## 只處理地面敵人，而且要：距離是正的有限數字、還活著、沒有正要被移除、路線至少兩個路點、目前的路點索引合理（1～路點數，
## 已經走到終點但還沒處理抵達的也可以退），而且路線進度對得起來（_path_progress_valid：位置在目前的路段上）。
## 任何一項不符合時什麼都不改、回傳 0。退完的位置、實際距離與索引先在區域變數算好，也要合理才一次寫回。
## 實際退了正的距離時解除原本的阻擋（不再攻擊原本擋路的武將，下一步照現有的佔格檢查重新判斷）；
## 攻擊冷卻、減速、暈眩、灼燒、威壓都不動
func knockback(distance: float) -> float:
	if not (distance > 0.0 and is_finite(distance)):
		return 0.0
	if _is_dead or is_queued_for_deletion() or is_flying():
		return 0.0
	var n: int = _waypoints.size()
	if n < 2 or _tail.size() != n or _wp_index < 1 or _wp_index > n:
		return 0.0
	# 位置不在目前的路段上（偏離、越過這一段、索引是終點但不在終點）、座標或路點不是有限數字時不推：不投影到別段、不修正位置
	if not _path_progress_valid():
		return 0.0
	var pos: Vector2 = position
	var k: int = _wp_index
	var left: float = distance
	# 每一圈不是退完，就是把 k 減一：最多 n 圈
	while left > 0.0:
		var prev: Vector2 = _waypoints[k - 1]
		var d: float = pos.distance_to(prev)
		if d >= left:
			pos = pos + (prev - pos) / d * left if d > 0.0 else prev
			left = 0.0
			break
		pos = prev
		left -= d
		if k - 1 <= 0:
			break  # 已經在路線起點
		k -= 1
	var moved: float = distance - left
	if not (moved > 0.0 and moved <= distance and _finite_v2(pos) and k >= 1 and k < n and _on_path_segment(pos, k)):
		return 0.0
	position = pos
	_wp_index = k
	if _blocker != null:
		_blocker = null
		_blocked_cell = Vector2i(-1, -1)
	queue_redraw()
	return moved

## 判斷「位置在路段上」的容差（像素）：max(PATH_EPS_MIN, 一格 × PATH_EPS_TILE_RATIO)，一格 48～51 像素時就是 0.01 像素。
## 敵人只沿路段的直線移動（走到路點時直接放在路點上），位置和路段的偏差只來自浮點誤差（座標幾百像素時約萬分之一像素）；
## 0.01 像素在畫面上看不出來、遠小於一次擊退的距離，明顯偏離或越過路段（0.02 像素以上）都不會被當成在路段上
const PATH_EPS_MIN: float = 0.01
const PATH_EPS_TILE_RATIO: float = 1e-4

func _path_eps() -> float:
	return maxf(PATH_EPS_MIN, float(tile_size) * PATH_EPS_TILE_RATIO)

static func _finite_v2(v: Variant) -> bool:
	return v is Vector2 and is_finite((v as Vector2).x) and is_finite((v as Vector2).y)

## 擊退前檢查路線進度（只檢查、不修正任何狀態）：路線至少兩個路點、每個路點都是有限的 Vector2；_tail 和路點一樣多、每一項是有限數字、
## 終點是 0、相鄰兩項的差等於那一段的長度（容差內）；路點索引 1～路點數；位置是有限的 Vector2，而且在目前的路段上（_on_path_segment）
func _path_progress_valid() -> bool:
	var n: int = _waypoints.size()
	if n < 2 or _tail.size() != n or _wp_index < 1 or _wp_index > n or not _finite_v2(position):
		return false
	for w in _waypoints:
		if not _finite_v2(w):
			return false
	var eps: float = _path_eps()
	for i in range(n):
		var t: Variant = _tail[i]
		if not ((t is float or t is int) and is_finite(float(t))):
			return false
		var seg: float = (_waypoints[i] as Vector2).distance_to(_waypoints[i + 1]) if i < n - 1 else 0.0
		var nxt: float = float(_tail[i + 1]) if i < n - 1 else 0.0
		if absf(float(t) - nxt - seg) > eps:
			return false
	return _on_path_segment(position, _wp_index)

## p 是否在路點索引 k 的路段上（k 是 1～路點數，呼叫前已確認路點都是有限的 Vector2）：
## k 小於路點數時是路點 k−1 到路點 k 的線段（含兩端）；k 等於路點數（已走到終點、還沒處理抵達）時只有終點本身。
## 用投影判斷：沿路段的位置在 −容差～路段長＋容差之間、離路段直線不超過容差；只判斷，不把 p 移到投影點、不找別的路段。
## 長度是 0 的路段（重複的路點）只接受在那個路點上（容差內）
func _on_path_segment(p: Vector2, k: int) -> bool:
	var eps: float = _path_eps()
	var n: int = _waypoints.size()
	if k == n:
		return p.distance_to(_waypoints[n - 1]) <= eps
	var a: Vector2 = _waypoints[k - 1]
	var b: Vector2 = _waypoints[k]
	var seg_len: float = a.distance_to(b)
	if seg_len == 0.0:
		return p.distance_to(a) <= eps
	var u: Vector2 = (b - a) / seg_len
	var along: float = (p - a).dot(u)
	return along >= -eps and along <= seg_len + eps and absf((p - a).cross(u)) <= eps

## 路線上的進度（測試與擊退紀錄用的唯讀資訊）：下一個要走向的路點索引、到終點的剩餘路程（像素）、目前位置
func path_state() -> Dictionary:
	return {"index": _wp_index, "remaining": get_remaining_distance(), "pos": [position.x, position.y]}

## 測試用唯讀資訊（debug_snapshot）：剩餘時間、生效次數、這個敵人的時間（見 _age）、暈眩區間與攻擊阻路武將的時間
func stun_state() -> Dictionary:
	return {"left": _stun_left, "count": stun_count, "age": _age, "log": stun_log.duplicate(true), "attacks": attack_log.duplicate()}

## 測試用唯讀資訊（debug_snapshot）：剩餘跳數與每跳傷害
func burn_state() -> Dictionary:
	return {"ticks_left": _burn_ticks_left, "damage": _burn_damage, "next_in": _burn_timer if _burn_ticks_left > 0 else 0.0}

func _die() -> void:
	_is_dead = true
	died.emit(self)
	_sfx("enemy_die")
	queue_free()

func _on_reached_base() -> void:
	_is_dead = true
	reached_base.emit(self)
	queue_free()

# ═══════════════════════════════════════════
#  繪製
# ═══════════════════════════════════════════
func _draw() -> void:
	var r: float = float(enemy_radius)
	# 飛行：地面上的陰影在實際位置，身體（連同翅膀、灼燒圈、血條）往上畫；只是外觀，命中與射程都用實際座標
	var lift: Vector2 = Vector2.ZERO
	if is_flying():
		lift = Vector2(0.0, -r * FLY_LIFT)
		_draw_ellipse(Vector2(0.0, r * 0.55), Vector2(r * 0.85, r * 0.3), FLY_SHADOW_COLOR)
		draw_set_transform(lift)
		_draw_wings(r)
	var sprite_rect: Rect2 = Rect2(Vector2(-r, -r), Vector2(r * 2.0, r * 2.0))

	# 被武將擋住（停下來攻擊阻路的武將）時顯示攻擊圖片；只看阻擋狀態，不看減速倍率（免疫減速的敵人攻擊時也一樣）；暈眩中不攻擊，顯示一般的圖
	var is_fighting: bool = is_fighting_blocker()
	var current_tex: Texture2D = _texture_atk if (is_fighting and _texture_atk != null) else _texture

	if current_tex != null:
		draw_texture_rect(current_tex, sprite_rect, false)
		if _flash_timer > 0.0:
			draw_rect(sprite_rect, Color(1.0, 0.2, 0.2, 0.45))
	else:
		var color: Color = Color.WHITE if _flash_timer > 0.0 else body_color
		draw_circle(Vector2.ZERO, r, color)
		draw_arc(Vector2.ZERO, r, 0, TAU, 24, Color(0, 0, 0, 0.5), 1.5)
		draw_string(ThemeDB.fallback_font,
			Vector2(-6, 6), label_text,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color.WHITE)

	# 灼燒中：橘色外圈（貼圖與純色模式共用）
	if is_burning():
		draw_arc(Vector2.ZERO, r + 3.0, 0, TAU, 28, Color(BURN_COLOR, 0.95), 3.0)
	# 被倍率減速中（道路阻擋、步兵塔、減速光環）：淺藍色的虛線外圈
	if speed_mult < 1.0:
		for i in range(8):
			var a0: float = TAU * float(i) / 8.0
			draw_arc(Vector2.ZERO, r + 6.0, a0, a0 + TAU / 16.0, 4, SLOW_COLOR, 2.0)

	# HP 條（貼圖與純色模式共用）
	var bar_x: float = -HP_BAR_W / 2.0
	var bar_y: float = -(r + HP_BAR_H + 3)
	var hp_ratio: float = current_hp / max_hp
	draw_rect(Rect2(bar_x, bar_y, HP_BAR_W, HP_BAR_H), Color(0.2, 0.2, 0.2, 0.8))
	draw_rect(Rect2(bar_x, bar_y, HP_BAR_W * hp_ratio, HP_BAR_H),
		Color(0.2, 0.85, 0.2, 1) if hp_ratio > 0.5
		else (Color(0.9, 0.7, 0.1, 1) if hp_ratio > 0.25
		else Color(0.9, 0.15, 0.15, 1))
	)
	# 威壓中（顏良）：血條右上方一個暗紅色、白色描邊的向下箭頭（箭桿＋箭頭，不用文字，Godot 專案沒有中文字型）。
	# 戰場在手機寬度會縮小，箭頭做到 12×13。整個箭頭在血條的上方：被武將擋住時敵人和武將幾乎重疊、兩條血條一樣高，
	# 放在血條旁邊會蓋住武將的血條；水平方向在血條右端再往右 2 像素，碰不到暈眩的星星、灼燒與減速的外圈
	if atk_mult < 1.0:
		_draw_atk_down_arrow(Vector2(bar_x + HP_BAR_W + 2.0, bar_y - 17.0))
	# 受控中（貂蟬的魅惑）：粉紅色的外圈
	if is_charmed():
		draw_arc(Vector2.ZERO, r + 9.0, 0, TAU, 32, Color(CHARM_COLOR, 0.95), 2.5)
	# 暈眩中：血條上方三顆轉動的黃色星星（隨剩餘時間轉動：手動暫停時停住）
	if is_stunned():
		var cy: float = bar_y - 9.0
		for i in range(3):
			var a: float = _stun_left * 6.0 + TAU * float(i) / 3.0
			_draw_star(Vector2(cos(a) * r * 0.7, cy + sin(a) * 3.0), 4.5)
	if is_flying():
		draw_set_transform(Vector2.ZERO)

## 威壓標記的向下箭頭：左上角在 p，寬 12、高 13（箭桿寬 4、高 6，箭頭寬 12、高 7）。
## 先畫白色的粗描邊（深色與淺色的地面上都看得到），再填暗紅色、加深色的細外框
func _draw_atk_down_arrow(p: Vector2) -> void:
	var pts: PackedVector2Array = PackedVector2Array([
		p + Vector2(4.0, 0.0), p + Vector2(8.0, 0.0), p + Vector2(8.0, 6.0), p + Vector2(12.0, 6.0),
		p + Vector2(6.0, 13.0), p + Vector2(0.0, 6.0), p + Vector2(4.0, 6.0),
	])
	var outline: PackedVector2Array = pts.duplicate()
	outline.append(pts[0])
	draw_polyline(outline, Color(1.0, 1.0, 1.0, 0.95), 3.0)
	draw_colored_polygon(pts, ATK_DOWN_COLOR)
	draw_polyline(outline, Color(0.2, 0.0, 0.0, 0.9), 1.0)

## 暈眩標記的四角星（黃色、深色外框）
func _draw_star(c: Vector2, size: float) -> void:
	var pts: PackedVector2Array = PackedVector2Array()
	for k in range(8):
		var rad: float = size if k % 2 == 0 else size * 0.4
		var a: float = -PI / 2.0 + PI * float(k) / 4.0
		pts.append(c + Vector2(cos(a), sin(a)) * rad)
	draw_colored_polygon(pts, STUN_COLOR)
	var outline: PackedVector2Array = pts.duplicate()
	outline.append(pts[0])
	draw_polyline(outline, Color(0.3, 0.2, 0.0, 0.9), 1.0)

## 飛行的翅膀：身體左右各一片（淺色、深色外框），貼圖與純色模式共用
func _draw_wings(r: float) -> void:
	for s in [-1.0, 1.0]:
		var pts: PackedVector2Array = PackedVector2Array([
			Vector2(s * r * 0.55, -r * 0.15),
			Vector2(s * r * 1.75, -r * 0.95),
			Vector2(s * r * 1.45, -r * 0.2),
			Vector2(s * r * 1.7, r * 0.2),
			Vector2(s * r * 0.55, r * 0.3),
		])
		draw_colored_polygon(pts, FLY_WING_COLOR)
		var outline: PackedVector2Array = pts.duplicate()
		outline.append(pts[0])
		draw_polyline(outline, Color(0.1, 0.12, 0.2, 0.9), 1.5)

func _draw_ellipse(center: Vector2, radii: Vector2, color: Color) -> void:
	var pts: PackedVector2Array = PackedVector2Array()
	for i in range(20):
		var a: float = TAU * float(i) / 20.0
		pts.append(center + Vector2(cos(a) * radii.x, sin(a) * radii.y))
	draw_colored_polygon(pts, color)

# ═══════════════════════════════════════════
#  查詢
# ═══════════════════════════════════════════
func is_flying() -> bool:
	return movement_type == MOVE_FLYING

## 正在攻擊阻路的武將（被擋住、停下來）：攻擊圖片看這個狀態。暈眩中不攻擊，所以不算（仍被擋住，暈眩結束後照常攻擊）
func is_fighting_blocker() -> bool:
	return _blocker != null and not is_stunned()

## 敵人設定的 atk（對阻路武將的直接攻擊力）：有限、不小於 0 的數字照用，其他一律 BLOCKER_ATK_DEFAULT（見 blocker_atk）
static func blocker_atk_of(cfg: Dictionary) -> float:
	var raw: Variant = cfg.get("atk", null)
	if (raw is float or raw is int) and is_finite(float(raw)) and float(raw) >= 0.0:
		return float(raw)
	return BLOCKER_ATK_DEFAULT

## 敵人設定的 trait 是不是免疫減速：必須是字串，去掉前後空白後完全等於 immune_slow（大小寫不同、其他值、沒有欄位都不是）
static func is_immune_slow_cfg(cfg: Dictionary) -> bool:
	var raw: Variant = cfg.get("trait", null)
	return raw is String and (raw as String).strip_edges() == TRAIT_IMMUNE_SLOW

## 每個路點到終點的路程（沿路點折線；飛行只有起點與終點，就是直線長度）
func _build_tail() -> void:
	_tail = []
	_tail.resize(_waypoints.size())
	var acc: float = 0.0
	for i in range(_waypoints.size() - 1, -1, -1):
		if i < _waypoints.size() - 1:
			acc += (_waypoints[i] as Vector2).distance_to(_waypoints[i + 1])
		_tail[i] = acc
	_flight_len = acc if is_flying() else 0.0

## 到終點的剩餘路程（像素）：目前位置到下一個路點，再沿路點到終點。地面沿路線折線；飛行只有起點與終點，就是到終點的直線距離。
## 防禦塔「優先前方」用它比較誰走得最前面（地面與飛行混在一起也能比）
func get_remaining_distance() -> float:
	if _wp_index >= _waypoints.size() or _tail.size() != _waypoints.size():
		return 0.0
	return position.distance_to(_waypoints[_wp_index]) + float(_tail[_wp_index])

func get_progress_ratio() -> float:
	## 回傳在路徑上的進度（0~1），越接近基地越大，武將用它選目標。
	## 地面：已經過的路點比例（沿用原本的算法）；飛行：直線已飛過的比例（不沿用地面的折線）
	if is_flying():
		return clampf(1.0 - get_remaining_distance() / _flight_len, 0.0, 1.0) if _flight_len > 0.0 else 1.0
	return float(_wp_index) / max(1, _waypoints.size())

func is_dead() -> bool:
	return _is_dead

# ═══════════════════════════════════════════
#  內部：安全音效呼叫
# ═══════════════════════════════════════════
func _sfx(key: String) -> void:
	if get_tree() and get_tree().root.has_node("SFXManager"):
		get_tree().root.get_node("SFXManager").play(key)
