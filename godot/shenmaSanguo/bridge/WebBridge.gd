## WebBridge.gd
## 掛載到主場景節點
## 負責 Web ↔ Godot 雙向 postMessage 通訊

extends Node

signal payload_received(data: Dictionary)
signal start_battle_requested()
signal auto_toggle_requested()

var _msg_callback: JavaScriptObject

func _ready() -> void:
	if OS.get_name() != "Web":
		push_warning("[WebBridge] 非 Web 平台，橋接停用")
		return
	_setup_bridge()

func _setup_bridge() -> void:
	# 建立 GDScript callback（JS 會呼叫它並傳入 JSON 字串）
	_msg_callback = JavaScriptBridge.create_callback(_on_js_message)

	# 將 callback 掛到 window.__godot_receive，讓 JS 可以呼叫
	JavaScriptBridge.get_interface("window")["__godot_receive"] = _msg_callback

	# 註冊 message 事件，收到後呼叫 __godot_receive
	JavaScriptBridge.eval("""
		window.addEventListener('message', function(event) {
			try {
				var d = event.data;
				if (d && typeof d === 'object') {
					if (d.stage_id || d.__godot_bridge) {
						if (typeof window.__godot_receive === 'function') {
							window.__godot_receive(JSON.stringify(d));
						}
					}
				}
			} catch(e) {
				console.error('[WebBridge] error:', e);
			}
		});
		console.log('[WebBridge] Bridge ready');
	""")

## JS 呼叫此 callback，args[0] 為 JSON 字串
func _on_js_message(args: Array) -> void:
	if args.is_empty():
		return
	var json_str: String = str(args[0])
	var payload = JSON.parse_string(json_str)
	if payload == null:
		push_error("[WebBridge] JSON 解析失敗：" + json_str)
		return
	print("[WebBridge] 收到訊號:", payload.get("type", "payload"))
	if payload.get("type") == "start_battle":
		start_battle_requested.emit()
	elif payload.get("type") == "toggle_auto":
		auto_toggle_requested.emit()
	else:
		payload_received.emit(payload)

## 戰鬥結束後，呼叫此函式將結算結果傳回 Web
func send_result(result: Dictionary) -> void:
	result["__godot_bridge"] = true
	if OS.get_name() != "Web":
		print("[WebBridge] (非 Web) 模擬回傳：", result)
		return
	var json = JSON.stringify(result)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)
	print("[WebBridge] 結算結果已傳回 Web")

## 告知 Web 端：Godot 已啟動並準備就緒
func send_ready() -> void:
	if OS.get_name() != "Web":
		return
	var msg = {"__godot_bridge": true, "type": "game_ready"}
	var json = JSON.stringify(msg)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)
## 傳送即時戰鬥數據（金幣、波次、血量）給 Web
func send_stats(stats: Dictionary) -> void:
	stats["__godot_bridge"] = true
	stats["type"] = "update_stats"
	if OS.get_name() != "Web":
		return
	var json = JSON.stringify(stats)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)
