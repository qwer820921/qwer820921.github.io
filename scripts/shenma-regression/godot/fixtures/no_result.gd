## 失敗 fixture：沒有輸出任何結果就以結束碼 0 結束（模擬測試中途結束）。godot-check.sh 必須回報失敗。
extends SceneTree

func _initialize() -> void:
	quit(0)
