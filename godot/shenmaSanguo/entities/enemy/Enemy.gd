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
## 對阻路武將的直接攻擊力（enemies_config 的 atk）：每次攻擊交給 Hero.take_damage（照武將的防禦公式減傷、趙雲可閃避）。
## 只接受有限、不小於 0 的數字（JSON 的數字，包括 0：0 照樣是一次攻擊、用掉冷卻，只是沒有傷害）；
## 沒有這個欄位、空白、字串（包括看起來像數字的）、布林、負數、NaN、無限大一律用 BLOCKER_ATK_DEFAULT。
## 不設上限。只用在攻擊阻路武將：抵達城池一律扣 1（BattleManager），和它無關。Web 的 utils/enemyCombat 用同一份規則顯示
const BLOCKER_ATK_DEFAULT: float = 20.0
var blocker_atk: float = BLOCKER_ATK_DEFAULT
const BLOCKER_ATK_SPD: float = 1.0 # 攻擊間隔（秒）
## 測試用唯讀統計：這個敵人攻擊阻路武將的次數（每次攻擊都算，包括被閃避、沒有扣血的）
var blocker_attacks: int = 0

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
	if _blocker != null:
		var was_ready: bool = _blocker_atk_timer <= 0.0
		_blocker_atk_timer -= delta
		if _blocker_atk_timer <= 0.0:
			# 被閃避（沒有扣血）也是一次攻擊：照樣用掉冷卻
			blocker_attacks += 1
			_blocker.take_damage(blocker_atk)
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
## is_burn：灼燒的跳傷（數字用橘色、稍微往上，和普通攻擊區分）；死亡、擊殺與金幣照一般流程只觸發一次
func take_damage(amount: float, is_burn: bool = false) -> void:
	if _is_dead:
		return
	current_hp -= amount
	_flash_timer = FLASH_TIME

	# 顯示傷害數字
	var ft = load("res://ui/FloatingText.gd").new()
	get_parent().add_child(ft)
	if is_burn:
		ft.setup("%.0f" % amount, BURN_COLOR, global_position + Vector2(0, -12))
	else:
		ft.setup("%.0f" % amount, Color(1.0, 0.4, 0.2), global_position)

	if current_hp <= 0.0:
		current_hp = 0.0
		_die()
	else:
		_sfx("enemy_hit")  # 死亡時由 _die() 播音，避免重疊
	queue_redraw()

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
func apply_burn(damage: float, ticks: int, interval: float) -> void:
	if _is_dead or ticks <= 0 or damage <= 0.0 or interval <= 0.0:
		return
	if _burn_ticks_left <= 0:
		_burn_interval = interval
		_burn_timer = interval
	_burn_ticks_left = ticks
	_burn_damage = damage
	queue_redraw()

func is_burning() -> bool:
	return _burn_ticks_left > 0 and not _is_dead

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

	# 被武將擋住（停下來攻擊阻路的武將）時顯示攻擊圖片；只看阻擋狀態，不看減速倍率（免疫減速的敵人攻擊時也一樣）
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
	if is_flying():
		draw_set_transform(Vector2.ZERO)

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

## 正在攻擊阻路的武將（被擋住、停下來）：攻擊圖片看這個狀態
func is_fighting_blocker() -> bool:
	return _blocker != null

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
