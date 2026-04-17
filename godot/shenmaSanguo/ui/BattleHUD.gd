## BattleHUD.gd
## 戰鬥 UI：底部放置面板、HUD 資訊、迎戰/自動按鈕
## 全部以程式碼建立節點，避免 .tscn 複雜度

class_name BattleHUD
extends CanvasLayer

# ── Signals（傳給 Main.gd）────────────────────────────────────
signal start_btn_pressed()
signal auto_btn_pressed()
signal drag_hero_started(hero_data: Dictionary)
signal drag_tower_started(tower_type: String)
signal upgrade_panel_closed()
signal unit_move_requested(unit: Node)

# ── Layout 常數 ───────────────────────────────────────────────
const PANEL_H:   int = 128
const CARD_W:    int = 64
const CARD_H:    int = 80
const BTN_W:     int = 90
const BTN_H:     int = 44
const BOTTOM_UI_H: int = 128    # 底部 UI 高度預留

# ── 節點引用（_ready 建立後快取）────────────────────────────
var _gold_label:   Label
var _wave_label:   Label
var _hp_label:     Label
var _base_bar:     ProgressBar
var _start_btn:    Button
var _auto_btn:     Button
var _hero_container: HBoxContainer
var _info_panel:   PanelContainer  # 選中塔/升級面板

# ── 武將資料（setup 時儲存）─────────────────────────────────
var _team_list: Array = []
var _game_state: int = 0  # 預設為 PREP (0)

# ═══════════════════════════════════════════
#  _ready — 建立所有 UI 節點
# ═══════════════════════════════════════════
func _ready() -> void:
	layer = 10
	_build_ui()

func _build_ui() -> void:
	var vp: Vector2 = get_viewport().get_visible_rect().size

	# ── 底部主面板 ──────────────────────────────────────────
	var panel: PanelContainer = PanelContainer.new()
	add_child(panel)
	
	# 強制固定在底部
	panel.anchor_top = 1.0
	panel.anchor_bottom = 1.0
	panel.anchor_left = 0.0
	panel.anchor_right = 1.0
	panel.offset_top = -PANEL_H
	panel.offset_bottom = 0
	panel.custom_minimum_size = Vector2(0, PANEL_H)

	var panel_style: StyleBoxFlat = StyleBoxFlat.new()
	panel_style.bg_color = Color(0.08, 0.08, 0.12, 0.95)
	panel_style.border_color = Color(0.35, 0.30, 0.20, 1.0)
	panel_style.border_width_top = 2
	panel.add_theme_stylebox_override("panel", panel_style)

	var main_hbox: HBoxContainer = HBoxContainer.new()
	main_hbox.set_anchors_preset(Control.PRESET_FULL_RECT)
	main_hbox.add_theme_constant_override("separation", 12)
	panel.add_child(main_hbox)

	# ── 武將區 ─────────────────────────────────────────────
	var hero_vbox: VBoxContainer = VBoxContainer.new()
	hero_vbox.custom_minimum_size = Vector2(300, 0)
	main_hbox.add_child(hero_vbox)

	var hero_title: Label = Label.new()
	hero_title.text = "⚔ 武將"
	hero_title.add_theme_color_override("font_color", Color(0.95, 0.80, 0.30, 1))
	hero_title.add_theme_font_size_override("font_size", 13)
	hero_vbox.add_child(hero_title)

	_hero_container = HBoxContainer.new()
	_hero_container.add_theme_constant_override("separation", 8)
	hero_vbox.add_child(_hero_container)

	# ── 防禦塔區 ────────────────────────────────────────────
	var tower_vbox: VBoxContainer = VBoxContainer.new()
	tower_vbox.custom_minimum_size = Vector2(240, 0)
	main_hbox.add_child(tower_vbox)

	var tower_title: Label = Label.new()
	tower_title.text = "🏯 防禦塔"
	tower_title.add_theme_color_override("font_color", Color(0.95, 0.80, 0.30, 1))
	tower_title.add_theme_font_size_override("font_size", 13)
	tower_vbox.add_child(tower_title)

	var tower_hbox: HBoxContainer = HBoxContainer.new()
	tower_hbox.add_theme_constant_override("separation", 8)
	tower_vbox.add_child(tower_hbox)

	_add_tower_card(tower_hbox, "archer",   "弓兵塔", "50G", Color(0.20, 0.65, 0.20, 1))
	_add_tower_card(tower_hbox, "infantry", "步兵塔", "70G", Color(0.60, 0.20, 0.20, 1))
	_add_tower_card(tower_hbox, "artillery","砲兵塔","100G", Color(0.60, 0.45, 0.10, 1))

	# ── 分隔 ─────────────────────────────────────────────
	var sep: VSeparator = VSeparator.new()
	sep.add_theme_color_override("separator_color", Color(0.35, 0.30, 0.20, 0.5))
	main_hbox.add_child(sep)

	# ── 狀態區 ─────────────────────────────────────────────
	var status_vbox: VBoxContainer = VBoxContainer.new()
	status_vbox.custom_minimum_size = Vector2(160, 0)
	status_vbox.add_theme_constant_override("separation", 4)
	main_hbox.add_child(status_vbox)

	_gold_label = _mk_label("💰 金幣：500", Color(1.0, 0.85, 0.20, 1))
	status_vbox.add_child(_gold_label)

	_wave_label = _mk_label("🌊 波次：0 / 0", Color(0.70, 0.85, 1.0, 1))
	status_vbox.add_child(_wave_label)

	_hp_label = _mk_label("🏰 基地：20 / 20", Color(0.85, 0.40, 0.40, 1))
	status_vbox.add_child(_hp_label)

	_base_bar = ProgressBar.new()
	_base_bar.custom_minimum_size = Vector2(150, 10)
	_base_bar.max_value = 20
	_base_bar.value = 20
	_base_bar.show_percentage = false
	status_vbox.add_child(_base_bar)

	# ── 按鈕區 ─────────────────────────────────────────────
	var btn_vbox: VBoxContainer = VBoxContainer.new()
	btn_vbox.custom_minimum_size = Vector2(BTN_W + 20, 0)
	btn_vbox.add_theme_constant_override("separation", 8)
	main_hbox.add_child(btn_vbox)

	_start_btn = Button.new()
	_start_btn.text = "⚔ 迎戰"
	_start_btn.custom_minimum_size = Vector2(BTN_W, BTN_H)
	_start_btn.add_theme_font_size_override("font_size", 16)
	_start_btn.pressed.connect(func(): start_btn_pressed.emit())
	btn_vbox.add_child(_start_btn)

	_auto_btn = Button.new()
	_auto_btn.text = "▶ 自動"
	_auto_btn.custom_minimum_size = Vector2(BTN_W, BTN_H)
	_auto_btn.add_theme_font_size_override("font_size", 14)
	_auto_btn.toggle_mode = true
	_auto_btn.pressed.connect(func(): auto_btn_pressed.emit())
	btn_vbox.add_child(_auto_btn)

	# ── 升級/資訊浮動面板（選中塔時出現）──────────────────
	_info_panel = PanelContainer.new()
	_info_panel.visible = false
	_info_panel.z_index = 20
	add_child(_info_panel)
	var info_style: StyleBoxFlat = StyleBoxFlat.new()
	info_style.bg_color = Color(0.08, 0.08, 0.12, 0.88) # 半透明深色
	info_style.border_color = Color(0.95, 0.80, 0.30, 0.8) # 金色發光邊框
	info_style.set_border_width_all(2)
	info_style.set_corner_radius_all(6)
	info_style.shadow_color = Color(0, 0, 0, 0.45)
	info_style.shadow_size = 10
	_info_panel.add_theme_stylebox_override("panel", info_style)

# ═══════════════════════════════════════════
#  setup — 接收 team_list，動態建立武將卡片
# ═══════════════════════════════════════════
func setup_heroes(team_list: Array, heroes_config: Array) -> void:
	_team_list = team_list
	# 清除舊卡片
	for child in _hero_container.get_children():
		child.queue_free()

	for hero_state in team_list:
		var hid: String = str(hero_state.get("hero_id", ""))
		var hname: String = hid
		var job: String = ""
		for cfg in heroes_config:
			if cfg.get("hero_id", "") == hid:
				hname = str(cfg.get("name", hid))
				job   = str(cfg.get("job", ""))
				break

		var color: Color = _job_color(job)
		var card: Control = _make_hero_card(hname, hero_state, color)
		_hero_container.add_child(card)

func _job_color(job: String) -> Color:
	match job:
		"infantry":  return Color(0.65, 0.20, 0.20, 1)
		"archer":    return Color(0.20, 0.65, 0.20, 1)
		"artillery": return Color(0.65, 0.50, 0.10, 1)
		_:           return Color(0.20, 0.40, 0.80, 1)

# ── 建立武將卡片 ─────────────────────────────────────────────
func _make_hero_card(name_text: String, hero_data: Dictionary, color: Color) -> Control:
	var card: Button = Button.new()
	card.custom_minimum_size = Vector2(CARD_W, CARD_H)
	card.text = ""
	card.tooltip_text = name_text

	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = color.darkened(0.3)
	style.border_color = color
	style.set_border_width_all(2)
	style.corner_radius_bottom_left  = 6
	style.corner_radius_bottom_right = 6
	style.corner_radius_top_left     = 6
	style.corner_radius_top_right    = 6
	card.add_theme_stylebox_override("normal", style)
	card.add_theme_stylebox_override("hover", style)

	# 卡片內容
	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_FULL_RECT)
	vbox.add_theme_constant_override("separation", 2)
	card.add_child(vbox)

	var hero_icon: Label = Label.new()
	hero_icon.text = "" # 移除標誌文字
	hero_icon.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	hero_icon.add_theme_font_size_override("font_size", 24)
	vbox.add_child(hero_icon)

	var name_label: Label = Label.new()
	name_label.text = name_text
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_label.add_theme_font_size_override("font_size", 18)
	name_label.add_theme_color_override("font_color", Color.WHITE)
	vbox.add_child(name_label)

	var lv_label: Label = Label.new()
	lv_label.text = "Lv.%d" % int(hero_data.get("level", 1))
	lv_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	lv_label.add_theme_font_size_override("font_size", 10)
	lv_label.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2, 1))
	vbox.add_child(lv_label)

	# 拖曳事件
	card.button_down.connect(func(): drag_hero_started.emit(hero_data))
	return card

# ── 建立塔卡片 ───────────────────────────────────────────────
func _add_tower_card(parent: HBoxContainer, type_key: String, name_text: String, cost_text: String, color: Color) -> void:
	var card: Button = Button.new()
	card.custom_minimum_size = Vector2(CARD_W, CARD_H)
	card.text = ""
	card.tooltip_text = "%s (%s)" % [name_text, cost_text]

	var style: StyleBoxFlat = StyleBoxFlat.new()
	style.bg_color = color.darkened(0.3)
	style.border_color = color
	style.set_border_width_all(2)
	style.corner_radius_bottom_left  = 4
	style.corner_radius_bottom_right = 4
	style.corner_radius_top_left     = 4
	style.corner_radius_top_right    = 4
	card.add_theme_stylebox_override("normal", style)
	card.add_theme_stylebox_override("hover", style)

	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.set_anchors_preset(Control.PRESET_FULL_RECT)
	vbox.add_theme_constant_override("separation", 2)
	card.add_child(vbox)

	var icon_label: Label = Label.new()
	icon_label.text = "" # 移除標誌文字
	icon_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	icon_label.add_theme_font_size_override("font_size", 22)
	vbox.add_child(icon_label)

	var name_lbl: Label = Label.new()
	name_lbl.text = name_text
	name_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_lbl.add_theme_font_size_override("font_size", 16)
	name_lbl.add_theme_color_override("font_color", Color.WHITE)
	vbox.add_child(name_lbl)

	var cost_lbl: Label = Label.new()
	cost_lbl.text = cost_text
	cost_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cost_lbl.add_theme_font_size_override("font_size", 10)
	cost_lbl.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2, 1))
	vbox.add_child(cost_lbl)

	card.button_down.connect(func(): drag_tower_started.emit(type_key))
	parent.add_child(card)

# ═══════════════════════════════════════════
#  HUD 更新
# ═══════════════════════════════════════════
func update_gold(gold: int) -> void:
	if _gold_label:
		_gold_label.text = "戰場點數：%d" % gold

func update_wave(current: int, total: int) -> void:
	if _wave_label:
		_wave_label.text = "波次：%d / %d" % [current, total]

func update_base_hp(hp: int, max_hp: int) -> void:
	if _hp_label:
		_hp_label.text = "基地：%d / %d" % [hp, max_hp]
	if _base_bar:
		_base_bar.max_value = max_hp
		_base_bar.value = hp

func set_game_state(state: int) -> void:
	_game_state = state
	if _start_btn:
		match state:
			BattleManager.GameState.PREP:
				_start_btn.text     = "迎戰"
				_start_btn.disabled = false
			BattleManager.GameState.BATTLE:
				_start_btn.text     = "戰鬥中"
				_start_btn.disabled = true
			BattleManager.GameState.RESULT:
				_start_btn.text     = "結束"
				_start_btn.disabled = true

# ═══════════════════════════════════════════
#  升級面板
# ═══════════════════════════════════════════
func show_upgrade_panel(tower_node: Node, pos_screen: Vector2, can_afford: bool) -> void:
	var tower: Object = tower_node
	if not _info_panel:
		return
	# 清除舊內容
	for child in _info_panel.get_children():
		child.queue_free()

	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 6)
	_info_panel.add_child(vbox)

	var name_lbl: Label = Label.new()
	name_lbl.text = "%s  Lv.%d" % [tower.tower_name, tower.get_level()]
	name_lbl.add_theme_font_size_override("font_size", 14)
	name_lbl.add_theme_color_override("font_color", Color(0.95, 0.80, 0.30, 1))
	vbox.add_child(name_lbl)

	var stats_lbl: Label = Label.new()
	stats_lbl.text = "ATK: %.0f  速: %.2fs  射: %.1f格" % [tower.atk, tower.atk_spd, tower.range_tiles]
	stats_lbl.add_theme_font_size_override("font_size", 11)
	stats_lbl.add_theme_color_override("font_color", Color(0.8, 0.8, 0.8, 1))
	vbox.add_child(stats_lbl)

	var stats_grid: GridContainer = GridContainer.new()
	stats_grid.columns = 2
	stats_grid.add_theme_constant_override("h_separation", 15)
	vbox.add_child(stats_grid)

	stats_grid.add_child(_mk_label("攻擊力:", Color(0.8, 0.8, 0.8)))
	stats_grid.add_child(_mk_label(str(tower.atk), Color.WHITE))
	
	stats_grid.add_child(_mk_label("頻率:", Color(0.8, 0.8, 0.8)))
	var freq: float = 1.0 / tower.atk_spd if tower.atk_spd > 0 else 0
	stats_grid.add_child(_mk_label("%.1f 次/秒" % freq, Color.WHITE))
	
	stats_grid.add_child(_mk_label("範圍:", Color(0.8, 0.8, 0.8)))
	stats_grid.add_child(_mk_label("%.1f 格" % tower.range_tiles, Color.WHITE))

	if tower.can_upgrade():
		var upgrade_btn: Button = Button.new()
		var cost: int = int(tower.get_upgrade_cost())
		upgrade_btn.text = "升級 (花費 %d G)" % cost
		upgrade_btn.disabled = not can_afford
		if not can_afford:
			upgrade_btn.add_theme_color_override("font_color", Color(0.6, 0.6, 0.6, 1))
		upgrade_btn.pressed.connect(func():
			tower.request_upgrade()
			hide_upgrade_panel()
		)
		vbox.add_child(upgrade_btn)
	
	else:
		var max_lbl: Label = Label.new()
		max_lbl.text = "已達最高等級"
		max_lbl.add_theme_color_override("font_color", Color(1, 0.85, 0.2, 1))
		vbox.add_child(max_lbl)

	var close_btn: Button = Button.new()
	close_btn.text = "關閉"
	close_btn.pressed.connect(func(): hide_upgrade_panel())
	vbox.add_child(close_btn)

	_info_panel.position = pos_screen - Vector2(100, PANEL_H + 80)
	_info_panel.visible = true

# --- 武將資訊面板 ---
func show_hero_panel(hero_node: Node, pos_screen: Vector2) -> void:
	var hero: Object = hero_node
	if not _info_panel:
		return
	for child in _info_panel.get_children():
		child.queue_free()

	var vbox: VBoxContainer = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 6)
	_info_panel.add_child(vbox)

	var name_lbl: Label = Label.new()
	name_lbl.text = "%s" % hero.hero_name
	name_lbl.add_theme_font_size_override("font_size", 14)
	name_lbl.add_theme_color_override("font_color", Color(0.3, 0.6, 1.0, 1))
	vbox.add_child(name_lbl)

	var stats_grid: GridContainer = GridContainer.new()
	stats_grid.columns = 2
	stats_grid.add_theme_constant_override("h_separation", 15)
	vbox.add_child(stats_grid)

	stats_grid.add_child(_mk_label("攻擊力:", Color(0.8, 0.8, 0.8)))
	stats_grid.add_child(_mk_label("%.0f" % hero.atk, Color.WHITE))
	
	stats_grid.add_child(_mk_label("頻率:", Color(0.8, 0.8, 0.8)))
	var freq: float = 1.0 / hero.attack_speed if hero.attack_speed > 0 else 0
	stats_grid.add_child(_mk_label("%.1f 次/秒" % freq, Color.WHITE))
	
	stats_grid.add_child(_mk_label("範圍:", Color(0.8, 0.8, 0.8)))
	stats_grid.add_child(_mk_label("%.1f 格" % hero.attack_range, Color.WHITE))

	stats_grid.add_child(_mk_label("生命值:", Color(0.8, 0.8, 0.8)))
	stats_grid.add_child(_mk_label("%.0f/%.0f" % [hero.current_hp, hero.max_hp], Color.WHITE))

	var close_btn: Button = Button.new()
	close_btn.text = "關閉"
	close_btn.pressed.connect(func(): hide_upgrade_panel())
	vbox.add_child(close_btn)

	_info_panel.position = pos_screen - Vector2(100, PANEL_H + 80)
	_info_panel.visible = true

func hide_upgrade_panel() -> void:
	if _info_panel == null or not _info_panel.visible:
		return
	_info_panel.visible = false
	upgrade_panel_closed.emit()

# ═══════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════
func _mk_label(text: String, color: Color) -> Label:
	var lbl: Label = Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", 13)
	lbl.add_theme_color_override("font_color", color)
	return lbl

# ═══════════════════════════════════════════
#  戰役結算介面
# ═══════════════════════════════════════════
func show_battle_result(result: Dictionary) -> void:
	var is_win: bool = result.get("result", "LOSE") == "WIN"
	
	# 全螢幕遮罩
	var bg = ColorRect.new()
	bg.color = Color(0, 0, 0, 0.75)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	
	var win_w: int = 400
	var win_h: int = 320
	
	var panel = PanelContainer.new()
	panel.custom_minimum_size = Vector2(win_w, win_h)
	panel.anchor_left = 0.5
	panel.anchor_right = 0.5
	panel.anchor_top = 0.5
	panel.anchor_bottom = 0.5
	panel.offset_left = -win_w / 2.0
	panel.offset_right = win_w / 2.0
	panel.offset_top = -win_h / 2.0
	panel.offset_bottom = win_h / 2.0
	add_child(panel)
	
	var style = StyleBoxFlat.new()
	style.bg_color = Color(0.12, 0.12, 0.16, 1.0)
	style.set_border_width_all(3)
	style.border_color = Color(0.95, 0.80, 0.30, 1.0) if is_win else Color(0.6, 0.2, 0.2, 1.0)
	style.set_corner_radius_all(8)
	style.shadow_size = 15
	style.shadow_color = Color(0, 0, 0, 0.5)
	panel.add_theme_stylebox_override("panel", style)
	
	var vbox = VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 20)
	panel.add_child(vbox)
	
	# 標題
	var title = Label.new()
	title.text = "戰 役 勝 利" if is_win else "戰 役 失 敗"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 32)
	title.add_theme_color_override("font_color", Color(1.0, 0.85, 0.2, 1) if is_win else Color(0.85, 0.3, 0.3, 1))
	vbox.add_child(title)
	
	# 星等（僅勝利顯示）
	if is_win:
		var star_label = Label.new()
		var stars_count = result.get("stars_earned", 0)
		var stars_str = ""
		for i in range(3):
			stars_str += "星" if i < stars_count else "空"
		star_label.text = stars_str
		star_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		star_label.add_theme_font_size_override("font_size", 28)
		star_label.add_theme_color_override("font_color", Color(1.0, 1.0, 0, 1))
		vbox.add_child(star_label)
	
	# 數據統計
	var grid = GridContainer.new()
	grid.columns = 2
	grid.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	grid.add_theme_constant_override("h_separation", 40)
	vbox.add_child(grid)
	
	grid.add_child(_mk_label("擊殺敵軍：", Color(0.7, 0.7, 0.7)))
	grid.add_child(_mk_label(str(result.get("kills", 0)), Color.WHITE))
	
	grid.add_child(_mk_label("戰鬥用時：", Color(0.7, 0.7, 0.7)))
	grid.add_child(_mk_label("%d 秒" % result.get("time_seconds", 0), Color.WHITE))
	
	# 戰場點數（這波的核心）
	var loot_count = 0
	for loot in result.get("loots", []):
		if loot.get("item") == "battle_points":
			loot_count = loot.get("count", 0)
	
	var loot_box = HBoxContainer.new()
	loot_box.alignment = BoxContainer.ALIGNMENT_CENTER
	vbox.add_child(loot_box)
	
	var loot_label = Label.new()
	loot_label.text = "獲得戰場點數： %d" % loot_count
	loot_label.add_theme_font_size_override("font_size", 18)
	loot_label.add_theme_color_override("font_color", Color(0.4, 1.0, 0.4, 1))
	loot_box.add_child(loot_label)
	
	# 返回按鈕
	var btn_box = CenterContainer.new()
	vbox.add_child(btn_box)
	
	var quit_btn = Button.new()
	quit_btn.text = "  返 回 營 地  "
	quit_btn.custom_minimum_size = Vector2(160, 48)
	quit_btn.pressed.connect(func():
		print("[HUD] Returning to Web Camp with result: ", result)
		# 在 Godot 中重新載入當前場景，方便重複測試
		get_tree().reload_current_scene()
	)
	btn_box.add_child(quit_btn)

func set_auto_active(active: bool) -> void:
	if _auto_btn:
		_auto_btn.button_pressed = active
