## Tower.gd
## 防禦塔：弓兵 / 步兵 / 砲兵
## 可用戰鬥金幣升級（最高 5 級），不持久化

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
var stack_slow_amount: float = 0.0     # 疊加減速量 (文士塔)
var body_color: Color      = Color.GREEN
var tower_name: String     = "弓兵塔"

## 目標優先（Round 17）：只存在這一場的記憶體（不寫存檔），新放置的塔一律從 "first" 開始。
## - "first"：路線進度最高（既有行為；比的是路點進度，不是精確的「離基地剩餘距離」）
## - "strongest"：當下血量最多；"weakest"：當下血量最少（比 current_hp，不是最大血量或百分比）
## 血量相同時看路線進度，再相同維持候選的原順序。只改主要目標：砲兵的範圍傷害、文士的減速跟著主要目標，
## 步兵的緩速光環照舊作用於範圍內所有敵人
const TARGET_MODES: Array = ["first", "strongest", "weakest"]
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
	var was_ready: bool = _atk_timer <= 0.0
	_atk_timer -= delta
	
	if _anim_timer > 0.0:
		_anim_timer -= delta
		if _anim_timer <= 0.0:
			_is_attacking = false
			queue_redraw()

	if _atk_timer > 0.0 or not _wave_mgr:
		return

	# 步兵塔：對範圍內所有敵人施加緩速（每幀）
	if slow_mult < 1.0 and tower_type_key == "infantry":
		_apply_slow_aura()

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

## 每次準備攻擊時，依目前的目標優先與敵人當下的狀態重新挑選（射程內、有效、活著的敵人）
func _find_target(enemies: Array, range_px: float) -> Node:
	var best: Node = null
	for e in enemies:
		if not is_instance_valid(e) or e.is_dead():
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
	return a.get_progress_ratio() > b.get_progress_ratio()

## 切換目標優先：只換之後挑選目標的方式，不重置攻擊冷卻、不立即攻擊、不動射程／傷害／等級。不認得的模式不套用
func set_target_mode(mode: String) -> bool:
	if not TARGET_MODES.has(mode):
		return false
	target_mode = mode
	queue_redraw()
	return true

func _attack_aoe(primary: Node, all_enemies: Array) -> void:
	for e in all_enemies:
		if not is_instance_valid(e) or e.is_dead():
			continue
		if primary.global_position.distance_to(e.global_position) <= aoe_radius:
			e.take_damage(atk)

func _apply_slow_aura() -> void:
	if not _wave_mgr:
		return
	var range_px: float = range_tiles * tile_size
	for e in _wave_mgr.get_active_enemies():
		if is_instance_valid(e) and not e.is_dead():
			var dist: float = global_position.distance_to(e.global_position)
			if dist <= range_px:
				e.apply_slow(slow_mult, 0.2)

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
