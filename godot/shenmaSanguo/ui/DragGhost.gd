## DragGhost.gd
## 拖曳時跟隨滑鼠的半透明預覽節點（CanvasLayer 內）

class_name DragGhost
extends Node2D

const GHOST_SIZE: int = 60

var _active: bool     = false
var _label_text: String = "?"
var _color: Color       = Color(0.5, 0.5, 0.5, 0.7)

func start_drag(type: String, label: String, color: Color) -> void:
	_active     = true
	_label_text = label.left(3)
	_color      = color
	visible     = true
	queue_redraw()

func update_pos(screen_pos: Vector2) -> void:
	if _active:
		position = screen_pos
		queue_redraw()

func end_drag() -> void:
	_active  = false
	visible  = false
	queue_redraw()

func _draw() -> void:
	if not _active:
		return
	var half: float = GHOST_SIZE / 2.0
	draw_rect(Rect2(Vector2(-half, -half), Vector2(GHOST_SIZE, GHOST_SIZE)), _color)
	draw_rect(Rect2(Vector2(-half, -half), Vector2(GHOST_SIZE, GHOST_SIZE)),
		Color(1, 1, 1, 0.6), false, 2.0)
	draw_string(ThemeDB.fallback_font,
		Vector2(-12, 8), _label_text,
		HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color.WHITE)
