extends Area2D

# --- [BobaSurvivors：冰晶爆裂區域] ---

var freeze_duration: float = 1.2
var lifetime: float = 4.0 # 與黑糖陷阱同步現存 4 秒

func _ready() -> void:
	# 冰晶爆裂改為瞬間呈現，不再進行放大動畫
	scale = Vector2(1.5, 1.5)
	modulate = Color(0.5, 0.8, 1.0, 0.6) # 冰藍色半透明
	
	# 連接訊號：進入就凍結
	area_entered.connect(_on_area_entered)
	
	# 設定自動銷毀
	get_tree().create_timer(lifetime).timeout.connect(queue_free)
	
	# 瞬間凍結目前區域內的所有怪獸
	apply_initial_freeze()

func apply_initial_freeze():
	for area in get_overlapping_areas():
		if area.is_in_group("enemy") and area.has_method("freeze"):
			area.freeze(freeze_duration)

func _on_area_entered(area: Area2D) -> void:
	if area.is_in_group("enemy") and area.has_method("freeze"):
		area.freeze(freeze_duration)
