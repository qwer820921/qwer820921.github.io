## FloatingText.gd
## 浮動文字效果（傷害數字）

class_name FloatingText
extends Node2D

var _label: Label
var _velocity: Vector2 = Vector2(0, -60)
var _duration: float    = 0.8
var _timer: float       = 0.0

func _ready() -> void:
	z_index = 100 # 確保在最上層
	
	_label = Label.new()
	add_child(_label)
	
	# 設定樣式
	_label.add_theme_font_size_override("font_size", 14)
	_label.add_theme_constant_override("outline_size", 4)
	_label.add_theme_color_override("font_outline_color", Color.BLACK)
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	
	# 置中
	_label.position = Vector2(-50, -10)
	_label.custom_minimum_size = Vector2(100, 20)

func setup(text: String, color: Color, start_pos: Vector2) -> void:
	position = start_pos
	# 加上一點隨機偏移，避免重疊
	position += Vector2(randf_range(-15, 15), randf_range(-10, 10))
	
	call_deferred("_finalize_setup", text, color)

func _finalize_setup(text: String, color: Color) -> void:
	if _label:
		_label.text = text
		_label.add_theme_color_override("font_color", color)

func _process(delta: float) -> void:
	_timer += delta
	position += _velocity * delta
	
	# 逐漸消失
	var alpha: float = 1.0 - (_timer / _duration)
	modulate.a = alpha
	
	if _timer >= _duration:
		queue_free()
