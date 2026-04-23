## BattleHUD.gd
## 戰鬥 UI：同步資料與控制
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

# ── Layout 常數 ──────────────────────────────────────────────
const PANEL_H:   int = 100
const BOTTOM_UI_H: int = 160

# ── 節點引用 ──────────────────────────────────────────────
var _gold_label:   Label
var _wave_label:   Label
var _hp_label:     Label
var _base_bar:     ProgressBar
var _start_btn:    Button
var _auto_btn:     Button
var _info_panel:   PanelContainer  # 雖然 UI 遷移，但保留節點避免報錯

# ── 狀態 ──────────────────────────────────────────────────
var _team_list: Array = []
var _game_state: int = 0

# ═══════════════════════════════════════════
#  _ready
# ═══════════════════════════════════════════
func _ready() -> void:
	layer = 10
	_info_panel = PanelContainer.new()
	_info_panel.visible = false
	add_child(_info_panel)

# ═══════════════════════════════════════════
#  資料同步函式
# ═══════════════════════════════════════════
func setup_heroes(team_list: Array, _heroes_config: Array) -> void:
	_team_list = team_list

func update_gold(gold: int) -> void:
	if _gold_label:
		_gold_label.text = "💰 %d" % gold

func update_wave(current: int, total: int) -> void:
	if _wave_label:
		_wave_label.text = "🌊 %d/%d" % [current, total]

func update_base_hp(hp: int, max_hp: int) -> void:
	if _hp_label:
		_hp_label.text = "🏰 %d/%d" % [hp, max_hp]
	if _base_bar:
		_base_bar.max_value = max_hp
		_base_bar.value = hp

func set_game_state(state: int) -> void:
	_game_state = state

# ═══════════════════════════════════════════
#  UI 遷移至 React (保留空函式)
# ═══════════════════════════════════════════
func show_upgrade_panel(_tower_node: Node, _pos_screen: Vector2, _can_afford: bool) -> void:
	pass

func show_hero_panel(_hero_node: Node, _pos_screen: Vector2) -> void:
	pass

func hide_upgrade_panel() -> void:
	_info_panel.visible = false
	upgrade_panel_closed.emit()

func show_battle_result(_result: Dictionary) -> void:
	pass

func _mk_label(text: String, color: Color) -> Label:
	var lbl: Label = Label.new()
	lbl.text = text
	lbl.add_theme_font_size_override("font_size", 13)
	lbl.add_theme_color_override("font_color", color)
	return lbl
