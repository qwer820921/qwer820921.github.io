## Tower.gd
## 防禦塔：弓兵 / 步兵 / 砲兵 / 騎兵 / 文士
## 可用戰鬥金幣升級（最高 5 級），不持久化
## 對空（設定的 anti_air）：弓兵塔可以攻擊飛行敵人、文士塔可以對飛行敵人減速；
## 步兵、騎兵、砲兵塔只打地面（步兵塔的緩速光環、砲兵塔的範圍傷害也只作用於地面）

class_name Tower
extends Node2D

# ── Signals ───────────────────────────────────────────────────
signal tower_clicked(tower: Node)
signal upgrade_requested(tower: Node, cost: int)

# ── 職業常數 ──────────────────────────────────────────────────
enum TowerType { ARCHER, INFANTRY, ARTILLERY, CAVALRY, SCHOLAR }

const TOWER_CONFIGS: Dictionary = {
	"archer": {
		"type":        TowerType.ARCHER,
		"name":        "弓兵塔",
		"atk":         30.0,
		"atk_spd":     0.80,
		"range":       2.5,
		"cost":        50,
		"upgrade_base": 50,
		"color":       Color(0.20, 0.65, 0.20, 1),
		"aoe":         false,
		"anti_air":    true,
		"image":       "tower_archer.webp",
		"scale":       0.9,
	},
	"infantry": {
		"type":        TowerType.INFANTRY,
		"name":        "步兵塔",
		"atk":         20.0,
		"atk_spd":     1.50,
		"range":       1.5,
		"cost":        70,
		"upgrade_base": 60,
		"color":       Color(0.60, 0.20, 0.20, 1),
		"aoe":         false,
		"slow_mult":   0.55,
		"image":       "tower_infantry.webp",
		"scale":       1.2,
	},
	"artillery": {
		"type":        TowerType.ARTILLERY,
		"name":        "砲兵塔",
		"atk":         80.0,
		"atk_spd":     3.00,
		"range":       2.0,
		"cost":        100,
		"upgrade_base": 80,
		"color":       Color(0.60, 0.45, 0.10, 1),
		"aoe":         true,
		"aoe_radius":  80.0,
		"image":       "tower_artillery.webp",
		"scale":       0.9,
	},
	"cavalry": {
		"type":        TowerType.CAVALRY,
		"name":        "騎兵塔",
		"atk":         50.0,
		"atk_spd":     1.20,
		"range":       1.8,
		"cost":        120,
		"upgrade_base": 70,
		"color":       Color(0.55, 0.25, 0.65, 1),
		"aoe":         false,
		"image":       "tower_cavalry.webp",
		"scale":       1.2,
	},
	"scholar": {
		"type":        TowerType.SCHOLAR,
		"name":        "文士塔",
		"atk":         0.0,
		"atk_spd":     1.20,
		"range":       2.5,
		"cost":        80,
		"upgrade_base": 75,
		"color":       Color(0.20, 0.50, 0.65, 1),
		"aoe":         false,
		"stack_slow_amount": 0.05,
		"anti_air":    true,
		"image":       "tower_scholar.webp",
		"scale":       1.0,
	},
}

# ── 實例屬性 ──────────────────────────────────────────────────
var tower_type_key: String = "archer"
var tower_level: int       = 1
var atk: float             = 30.0
var atk_spd: float         = 0.80
var range_tiles: float     = 2.5
var upgrade_cost_base: int = 50
var is_aoe: bool           = false
var aoe_radius: float      = 0.0
var slow_mult: float       = 1.0       # < 1.0 表示有緩速
## 步兵塔的緩速光環：每一幀對射程內的地面敵人套用 slow_mult（來源是這座塔自己的 slow_source，每個塔節點各自不同，
## 不用塔的種類）；離開射程、倒下的敵人撤除，塔被拆除或切換關卡時撤除全部。和其他倍率減速由敵人取最強的一個
var slow_source: String    = ""
var _aura_slowed: Dictionary = {}
var stack_slow_amount: float = 0.0     # 疊加減速量 (文士塔)
## 能不能攻擊（文士塔是減速）飛行敵人：設定沒有 anti_air 的塔只打地面
var can_hit_air: bool      = false
var body_color: Color      = Color.GREEN
var tower_name: String     = "弓兵塔"

## 目標優先：只存在這一場的記憶體（不寫存檔），新放置的塔一律從 "first" 開始。
## - "first"：走得最前面＝到終點的剩餘路程最短（Enemy.get_remaining_distance：地面沿路線折線、飛行是到終點的直線，混在一起也能比）
## - "strongest"：當下血量最多；"weakest"：當下血量最少（比 current_hp，不是最大血量或百分比）
## - "air_first"（優先飛行，只有能對空的弓兵塔、文士塔可以選）：射程內有飛行敵人就選飛行，沒有就選地面；
##   同一類之間照「優先前方」比剩餘路程。射程外的飛行不是候選，不會讓塔放棄射程內的地面。文士塔是優先減速飛行，不造成傷害
## 血量相同時看剩餘路程，再相同（相差不到 0.001 像素）維持候選的原順序。候選只有這座塔打得到的敵人（對空）。
## 只改主要目標：砲兵的範圍傷害、文士的減速跟著主要目標，步兵的緩速光環照舊作用於範圍內所有地面敵人
const TARGET_MODES: Array = ["first", "strongest", "weakest", "air_first"]
## 只有能對空的塔可以選的目標優先
const AIR_TARGET_MODES: Array = ["air_first"]
var target_mode: String    = "first"
## 這座塔的識別碼（Main 放置時指定，同一個頁面內不重複）：Web 的命令用它確認是同一座塔
var tower_uid: String      = ""

## 備戰拆除（Round 18）：這座塔已實際支付的戰鬥金幣（建造＋成功的升級；只有扣款成功才計入，失敗的升級不算），
## 拆除時返還 floor(投入 × SELL_REFUND_RATIO)。比例集中在這裡維護（第一版 50%，還沒做平衡評估）。
## 只存在這一場的記憶體；新放置的塔（包括同一格重建）從 0 開始
const SELL_REFUND_RATIO: float = 0.5
var invested_gold: int     = 0
## 已拆除：Main 在同一個處理裡標記、釋放格子並移除這座塔；重複或延遲的命令看到它就不會再退款
var sold: bool             = false

var grid_cell: Vector2i    = Vector2i.ZERO
var tile_size: int         = 48
var _texture: Texture2D    = null
var _texture_atk: Texture2D = null
var tower_w: int           = 34
var tower_h: int           = 34

# ── 內部狀態 ──────────────────────────────────────────────────
var _atk_timer: float      = 0.0
var _anim_timer: float     = 0.0   # 攻擊動畫計時器
var _wave_mgr: Node        = null
var _is_selected: bool     = false
var _is_attacking: bool    = false  # 用於攻擊狀態識別

# ═══════════════════════════════════════════
#  初始化
# ═══════════════════════════════════════════
func _init() -> void:
	slow_source = "tower_aura#%d" % get_instance_id()

func setup(type_key: String, cell: Vector2i, wave_mgr: Node) -> void:
	tower_type_key = type_key
	grid_cell      = cell
	_wave_mgr      = wave_mgr

	var cfg: Dictionary = TOWER_CONFIGS.get(type_key, TOWER_CONFIGS["archer"])
	atk              = float(cfg["atk"])
	atk_spd          = float(cfg["atk_spd"])
	range_tiles      = float(cfg["range"])
	upgrade_cost_base = int(cfg["upgrade_base"])
	is_aoe           = bool(cfg.get("aoe", false))
	aoe_radius       = float(cfg.get("aoe_radius", 0.0))
	slow_mult        = float(cfg.get("slow_mult", 1.0))
	stack_slow_amount = float(cfg.get("stack_slow_amount", 0.0))
	can_hit_air      = bool(cfg.get("anti_air", false))
	body_color       = cfg["color"]
	tower_name       = str(cfg["name"])
	tower_w = max(20, min(tile_size, int(tile_size * float(cfg.get("scale", 0.88)))))
	tower_h = tower_w
	var img_name: String = str(cfg.get("image", ""))
	if img_name != "":
		var path: String = "res://assets/units/" + img_name
		if ResourceLoader.exists(path):
			_texture = load(path) as Texture2D
		
		# 優先嘗試尋找 _atk.webp (例如 tower_archer_atk.webp)
		var atk_path: String = path.replace(".webp", "_atk.webp")
		if ResourceLoader.exists(atk_path):
			_texture_atk = load(atk_path) as Texture2D
		else:
			# 嘗試尋找 _attack.webp
			atk_path = path.replace(".webp", "_attack.webp")
			if ResourceLoader.exists(atk_path):
				_texture_atk = load(atk_path) as Texture2D
	queue_redraw()

# ═══════════════════════════════════════════
#  _process — 自動攻擊
# ═══════════════════════════════════════════
## 攻擊冷卻和武將相同（見 Hero._process）：持續有目標時保留越過零點的零頭；
## 沒有目標時停在 0 不囤積；一幀最多打一擊，單幀長過攻擊間隔時其餘作廢、從這一擊起算完整的間隔
func _process(delta: float) -> void:
	# 步兵塔：緩速光環每一幀更新（不看攻擊冷卻）
	if slow_mult < 1.0 and tower_type_key == "infantry":
		_apply_slow_aura()
	var was_ready: bool = _atk_timer <= 0.0
	_atk_timer -= delta
	
	if _anim_timer > 0.0:
		_anim_timer -= delta
		if _anim_timer <= 0.0:
			_is_attacking = false
			queue_redraw()

	if _atk_timer > 0.0 or not _wave_mgr:
		return

	var range_px: float = range_tiles * tile_size
	var enemies: Array = _wave_mgr.get_active_enemies()
	var target: Node = _find_target(enemies, range_px)
	if target == null:
		_atk_timer = 0.0  # 待命：不囤積攻擊
		return

	if is_aoe:
		_attack_aoe(target, enemies)
	elif tower_type_key == "scholar":
		target.apply_stackable_slow(stack_slow_amount, 3.5) # 減速持續 3.5 秒
	else:
		target.take_damage(atk)

	_is_attacking = true
	_anim_timer   = 0.22  # 攻擊圖顯示時長
	var late: float = 0.0 if was_ready else -_atk_timer
	_atk_timer    = atk_spd - (late if late < atk_spd else 0.0)
	queue_redraw()
	_sfx("tower_shoot")

## 這座塔能不能攻擊（文士塔是減速）這個敵人：地面一律可以；飛行只有能對空的塔可以
func can_target(e: Node) -> bool:
	return can_hit_air or not e.is_flying()

## 每次準備攻擊時，依目前的目標優先與敵人當下的狀態重新挑選（射程內、有效、活著、打得到的敵人）
func _find_target(enemies: Array, range_px: float) -> Node:
	var best: Node = null
	for e in enemies:
		if not is_instance_valid(e) or e.is_dead() or not can_target(e):
			continue
		if global_position.distance_to(e.global_position) > range_px:
			continue
		if best == null or _better_target(e, best):
			best = e
	return best

## a 是否比目前的 b 更優先（相同時回傳 false，保留先出現的候選）
func _better_target(a: Node, b: Node) -> bool:
	match target_mode:
		"strongest":
			if not is_equal_approx(a.current_hp, b.current_hp):
				return a.current_hp > b.current_hp
		"weakest":
			if not is_equal_approx(a.current_hp, b.current_hp):
				return a.current_hp < b.current_hp
		"air_first":
			if a.is_flying() != b.is_flying():
				return a.is_flying()
	return a.get_remaining_distance() < b.get_remaining_distance() - REMAINING_EPS

## 剩餘路程的比較容許誤差（像素）：相差不到這個值視為相同，保留候選的原順序
const REMAINING_EPS: float = 0.001

## 這座塔可以選的目標優先：每座塔都有 first／strongest／weakest，能對空的塔（弓兵、文士）再加 air_first
func get_target_modes() -> Array:
	var modes: Array = []
	for m in TARGET_MODES:
		if can_hit_air or not AIR_TARGET_MODES.has(m):
			modes.append(m)
	return modes

## 切換目標優先：只換之後挑選目標的方式，不重置攻擊冷卻、不立即攻擊、不動射程／傷害／等級。
## 不認得的模式、這座塔不能選的模式（例如只打地面的塔選 air_first）不套用
func set_target_mode(mode: String) -> bool:
	if not get_target_modes().has(mode):
		return false
	target_mode = mode
	queue_redraw()
	return true

## 範圍傷害：主要目標周圍、這座塔打得到的敵人（砲兵塔不能對空：旁邊的飛行敵人不受波及）
func _attack_aoe(primary: Node, all_enemies: Array) -> void:
	for e in all_enemies:
		if not is_instance_valid(e) or e.is_dead() or not can_target(e):
			continue
		if primary.global_position.distance_to(e.global_position) <= aoe_radius:
			e.take_damage(atk)

func _apply_slow_aura() -> void:
	var keep: Dictionary = {}
	if _wave_mgr and not is_queued_for_deletion() and not sold:
		var range_px: float = range_tiles * tile_size
		for e in _wave_mgr.get_active_enemies():
			# 步兵塔不能對空：緩速光環只作用於地面敵人
			if is_instance_valid(e) and not e.is_queued_for_deletion() and not e.is_dead() and can_target(e):
				var dist: float = global_position.distance_to(e.global_position)
				if dist <= range_px:
					e.apply_slow_from(slow_source, slow_mult, Enemy.SLOW_REFRESH_TTL)
					# 免疫減速的敵人不會套用，也就不列入
					if e.has_slow_from(slow_source):
						keep[e.get_instance_id()] = e
	for id in _aura_slowed:
		if not keep.has(id) and is_instance_valid(_aura_slowed[id]):
			_aura_slowed[id].remove_slow_from(slow_source)
	_aura_slowed = keep

## 拆除、切換關卡（離開場景樹）時撤除這座塔的緩速；其他來源不受影響
func _exit_tree() -> void:
	for id in _aura_slowed:
		if is_instance_valid(_aura_slowed[id]):
			_aura_slowed[id].remove_slow_from(slow_source)
	_aura_slowed.clear()

# ═══════════════════════════════════════════
#  升級
# ═══════════════════════════════════════════
func get_upgrade_cost() -> int:
	if tower_level >= 5:
		return 0   # 最高級
	return upgrade_cost_base * tower_level

func can_upgrade() -> bool:
	return tower_level < 5

func apply_upgrade() -> void:
	tower_level   += 1
	if tower_type_key == "scholar":
		stack_slow_amount += 0.02   # 升級增加 2% 緩速幅度
		atk_spd *= 0.95             # 攻速稍微提升
		range_tiles += 0.20
	else:
		atk           *= 1.20       # 攻擊力 +20%
		atk_spd       *= 0.92       # 攻速提升（間隔縮短 8%）
		range_tiles   += 0.20       # 射程 +0.2 格
	queue_redraw()
	_sfx("upgrade")

func request_upgrade() -> void:
	var cost: int = get_upgrade_cost()
	if cost > 0:
		upgrade_requested.emit(self, cost)

# ═══════════════════════════════════════════
#  拆除（Round 18）
# ═══════════════════════════════════════════
## 記下一筆已成功扣款的建造或升級費用（呼叫端在 spend_gold 成功之後才呼叫）
func add_investment(amount: int) -> void:
	if amount > 0:
		invested_gold += amount

## 拆除時返還的戰鬥金幣：floor(已實際支付 × 比例)，不依等級推算
func get_sell_refund() -> int:
	return int(floor(float(invested_gold) * SELL_REFUND_RATIO))

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
	var half_w: float = tower_w / 2.0
	var half_h: float = tower_h / 2.0
	var body_rect: Rect2 = Rect2(Vector2(-half_w, -half_h), Vector2(tower_w, tower_h))
	var flash: bool = _is_attacking

	# 射程圈（選中時顯示）
	if _is_selected:
		draw_circle(Vector2.ZERO, range_tiles * tile_size, Color(1.0, 0.0, 0.0, 0.3))
		draw_arc(Vector2.ZERO, range_tiles * tile_size, 0, TAU, 48, Color(1.0, 0.2, 0.2, 0.7), 2.5)

	# 塔身
	var current_tex = _texture_atk if (_is_attacking and _texture_atk) else _texture
	
	if current_tex != null:
		draw_texture_rect(current_tex, body_rect, false)
		if _is_attacking and not _texture_atk:
			# 如果沒有攻擊貼圖，則使用原本的白光閃爍效果
			draw_rect(body_rect, Color(1.0, 1.0, 1.0, 0.5))
	else:
		draw_rect(Rect2(Vector2(-half_w, -half_h) + Vector2(2, 2),
					Vector2(tower_w, tower_h)), Color(0, 0, 0, 0.35))
		draw_rect(body_rect, Color.WHITE if flash else body_color)
		draw_rect(Rect2(Vector2(-half_w, -half_h), Vector2(tower_w, 8)),
			(body_color if flash else body_color.darkened(0.3)))
		var short: String = tower_name.left(2)
		draw_string(ThemeDB.fallback_font,
			Vector2(-10, 8), short,
			HORIZONTAL_ALIGNMENT_LEFT, -1, 13,
			Color(0, 0, 0, 1) if flash else Color.WHITE)

	# 等級圓點（貼圖與純色共用）
	for i in range(tower_level):
		draw_circle(Vector2(-half_w + 6 + i * 8, half_h - 7), 3, Color.WHITE)

	# 選取邊框（貼圖與純色共用）
	if _is_selected:
		draw_rect(body_rect, Color(1.0, 0.9, 0.2, 1.0), false, 2.5)

# ═══════════════════════════════════════════
#  查詢
# ═══════════════════════════════════════════
func get_cell() -> Vector2i:
	return grid_cell

func get_level() -> int:
	return tower_level

func reposition(new_cell: Vector2i, world_pos: Vector2) -> void:
	grid_cell = new_cell
	position = world_pos
	queue_redraw()

# ═══════════════════════════════════════════
#  內部：安全音效呼叫
# ═══════════════════════════════════════════
func _sfx(key: String) -> void:
	if get_tree() and get_tree().root.has_node("SFXManager"):
		get_tree().root.get_node("SFXManager").play(key)
