extends Area2D

# --- [BobaSurvivors：黑糖黏人陷阱] ---

var damage: float = 1.0
var lifetime: float = 4.0 # 現存 4 秒
var tick_timer: float = 0.5 # 每 0.5 秒跳一次傷害

func _ready() -> void:
	# 初始稍微縮放，增加「擴散」感
	scale = Vector2(0.5, 0.5)
	var tween = create_tween()
	tween.tween_property(self, "scale", Vector2(1.5, 1.5), 0.5).set_trans(Tween.TRANS_ELASTIC)
	
	# 連接訊號
	area_entered.connect(_on_area_entered)
	area_exited.connect(_on_area_exited)
	
	# 設定自動銷毀
	get_tree().create_timer(lifetime).timeout.connect(queue_free)

func _process(delta: float) -> void:
	# 持續傷害邏輯
	tick_timer -= delta
	if tick_timer <= 0:
		tick_timer = 0.5
		apply_tick_damage()

func apply_tick_damage():
	for area in get_overlapping_areas():
		if area.is_in_group("enemy") and area.has_method("take_damage"):
			area.take_damage(damage)

func _on_area_entered(area: Area2D) -> void:
	if area.is_in_group("enemy") and area.has_method("set_puddle_status"):
		area.set_puddle_status(true)

func _on_area_exited(area: Area2D) -> void:
	if area.is_in_group("enemy") and area.has_method("set_puddle_status"):
		area.set_puddle_status(false)
