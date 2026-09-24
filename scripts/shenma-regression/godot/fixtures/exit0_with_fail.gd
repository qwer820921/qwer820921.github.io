## 失敗 fixture：有一項檢查失敗，但結束碼是 0。godot-check.sh 不能只看結束碼，必須回報失敗。
extends SceneTree

func _initialize() -> void:
	print("FAIL  fixture：刻意失敗的檢查  {}")
	print("RESULT_JSON " + JSON.stringify({"total": 1, "failed": 1, "results": []}))
	quit(0)
