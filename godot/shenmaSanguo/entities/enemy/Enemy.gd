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
var speed_mult: float = 1.0        # 速度乘數（被減速時 < 1.0，通常為光環）
var _stack_slow_amount: float = 0.0 # 疊加的減速量（來自文士塔）
var _stack_slow_timer: float = 0.0  # 疊加減速持續時間

# ── 移動方式（enemies_config 的 movement_type）──────────────────
## "flying"（去掉前後空白後完全相同）是飛行，其他（沒有這個欄位、空白、不認得的值）一律是地面。
## 飛行：從這一組路線的第一個路點直線飛到最後一個路點（忽略中間的轉折），不被武將擋住、不攻擊武將；
## 只有能對空的武將與防禦塔打得到（Hero.can_target、Tower.can_target）。
## 飛行路線至少要有兩個路點、起點和終點不同，否則一出現就在終點：這個檢查在出兵前由 WaveManager.plan_wave 做，無效的組不出兵
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
var _blocker_atk_timer: float = 0.0
const BLOCKER_ATK: float   = 20.0  # 敵人對武將的攻擊力
const BLOCKER_ATK_SPD: float = 1.0 # 攻擊間隔（秒）

# ── 顏色（依 enemy_id 可設不同顏色，預設灰） ──────────────
var body_color: Color   = Color(0.55, 0.20, 0.20, 1)  # 深紅兵
var label_text: String  = "兵"

# ── 飛行的外觀（只用圖形，Godot 專案沒有中文字型）──────────────
## 身體往上畫的比例（× 半徑）：純視覺，命中、射程、移動都用實際座標
const FLY_LIFT: float        = 0.45
const FLY_WING_COLOR: Color  = Color(0.95, 0.97, 1.0, 0.9)
const FLY_SHADOW_COLOR: Color = Color(0.0, 0.0, 0.0, 0.35)

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
	if _blocker != null:
		# 如果武將失效、死亡，或者已經不在原本阻擋的格子（被玩家移走）
		if not is_instance_valid(_blocker) or _blocker.current_hp <= 0.0 or _blocker.get_cell() != _blocked_cell:
			_blocker = null
			_blocked_cell = Vector2i(-1, -1)
		else:
			_blocker_atk_timer -= delta
			if _blocker_atk_timer <= 0.0:
				_blocker.take_damage(BLOCKER_ATK)
				_blocker_atk_timer = BLOCKER_ATK_SPD
			queue_redraw()
			return  # 停下來等武將死亡或移開

	# 檢查前方格子是否有武將阻路（飛行敵人不被武將擋住，也就不會停下來攻擊武將）
	if _game_map != null and not is_flying():
		var cur_cell: Vector2i  = _game_map.world_to_grid(position)
		var next_cell: Vector2i = _game_map.world_to_grid(_waypoints[_wp_index])
		for check_cell in [cur_cell, next_cell]:
			var occ: Node = _game_map.get_occupant(check_cell)
			if occ != null and occ is Hero:
				_blocker = occ
				_blocked_cell = check_cell
				_blocker_atk_timer = 0.0
				queue_redraw()
				return

	# 移動
	var target: Vector2        = _waypoints[_wp_index]
	var effective_speed: float = base_speed * speed_mult * (1.0 - _stack_slow_amount)
	effective_speed = max(base_speed * 0.15, effective_speed) # 限制最少保留 15% 基礎跑速
	
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

## 減速光環（speed_mult < 1.0）
func apply_slow(mult: float, _duration: float) -> void:
	speed_mult = mult

func clear_slow() -> void:
	speed_mult = 1.0

## 疊加減速（文士塔用）
func apply_stackable_slow(amount: float, duration: float) -> void:
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

	# 如果被武將大幅減速（speed_mult <= 0.5），視為正在交戰，顯示攻擊圖片
	var is_fighting: bool = (speed_mult <= 0.5)
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
