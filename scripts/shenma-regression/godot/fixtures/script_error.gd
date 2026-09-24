## 失敗 fixture：執行期發生 SCRIPT ERROR，但所有檢查都通過、結束碼是 0。godot-check.sh 必須回報失敗。
extends SceneTree

func _initialize() -> void:
	_trigger_script_error()
	print("PASS  fixture：SCRIPT ERROR 之後的檢查照常通過  {}")
	print("RESULT_JSON " + JSON.stringify({"total": 1, "failed": 0, "results": []}))
	quit(0)

func _trigger_script_error() -> void:
	var obj = RefCounted.new()
	obj.this_method_does_not_exist()  # 執行期錯誤：Invalid call. Nonexistent function
