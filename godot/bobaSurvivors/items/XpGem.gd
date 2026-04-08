extends Area2D

@export var xp_amount: int = 1

func _ready() -> void:
	# 防呆：用程式自動連接身體進入範圍的訊號
	body_entered.connect(_on_body_entered)

func _on_body_entered(body: Node2D) -> void:
	# 不管名字叫什麼，只要您能獲得經驗值，就可以吃掉寶石！
	if body.has_method("gain_xp"):
		body.gain_xp(xp_amount)
		queue_free()
