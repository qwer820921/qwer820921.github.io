## 失敗 fixture：輸出一個不在允許清單內的 ERROR，但所有檢查都通過、結束碼是 0。godot-check.sh 必須回報失敗。
extends SceneTree

func _initialize() -> void:
	push_error("fixture：不在允許清單內的錯誤")
	print("PASS  fixture：錯誤之後的檢查照常通過  {}")
	print("RESULT_JSON " + JSON.stringify({"total": 1, "failed": 0, "results": []}))
	quit(0)
