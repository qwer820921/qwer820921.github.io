## physics_clock.gd
## 測試用的物理時鐘（只放在暫存測試專案，不進正式產物）：累加 _physics_process 的 delta。
## 和敵人的移動、灼燒用的是同一個固定物理步進（受 Engine.time_scale 影響、遊戲暫停時不前進），
## 所以不管電腦多忙、一幀多長，灼燒的時間都能用它精確比對。lifecycle_test.gd 把它放在場景樹最前面，
## 同一個物理步進裡先於敵人處理：敵人在某一步死亡時，讀到的時間已經包含那一步
extends Node

var t: float = 0.0

func _physics_process(delta: float) -> void:
	t += delta
