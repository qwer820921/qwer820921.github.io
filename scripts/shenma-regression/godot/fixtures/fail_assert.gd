## 失敗 fixture：有一項檢查失敗，並以結束碼 1 結束。godot-check.sh 必須回報失敗。
extends SceneTree

func _initialize() -> void:
	print("FAIL  fixture：刻意失敗的檢查  {}")
	print("RESULT_JSON " + JSON.stringify({"total": 1, "failed": 1, "results": []}))
	quit(1)
