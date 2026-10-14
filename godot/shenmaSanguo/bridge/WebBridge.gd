## WebBridge.gd
## 掛載到主場景節點
## 負責 Web ↔ Godot 雙向 postMessage 通訊

extends Node

signal payload_received(data: Dictionary)
signal start_battle_requested()
signal auto_toggle_requested()
signal move_unit_requested()
signal deselect_unit_requested()
signal upgrade_unit_requested()
signal debug_snapshot_requested(request_id: String)

## Web ↔ Godot 橋接協定的版本：game_ready 帶給 Web，Web 只在版本和自己相同時才送出關卡資料。
## 版本不同（例如瀏覽器還在用舊版遊戲的快取）時，Web 會提示更新，不會開戰。
## 2：update_stats 與結算帶 battle_id（Round 9）
## 3：防禦塔目標優先（Round 17）：set_tower_target 命令與 tower_target_changed 回覆；舊版遊戲不認得這個命令，
##    所以提升版本，讓網頁對舊版遊戲顯示更新提示，而不是讓面板的選項默默失效
## 4：備戰拆除防禦塔（Round 18）：sell_tower 命令與 tower_sell_result 回覆，面板多了投入與返還金額；
##    舊版遊戲不認得拆除命令（網頁會一直等不到回覆），所以同樣提升版本
## 5：戰鬥速度：set_game_speed 命令與 game_speed_result 回覆，update_stats 帶 speed／time_scale／deploy_slow；
##    click_cell 帶 battle_id 與選單編號，關閉選單的 resume_game 要帶回（舊版遊戲不看，舊的關閉命令會解除新選單的慢速）。
##    舊版遊戲不認得速度命令（按鈕會默默沒有作用），所以提升版本
## 6：手動暫停：set_paused 命令 {battle_id, paused（布林，目標狀態）} 與 game_pause_result 回覆
##    {battle_id, ok, paused, speed, time_scale, reason?}，update_stats 帶 paused。舊版遊戲不認得暫停命令，所以提升版本
## 7：飛行敵人與對空：enemies_config 的 movement_type（flying 直線飛向終點、不被武將擋住），武將與防禦塔依職業／種類
##    決定能不能攻擊飛行敵人；show_upgrade_panel 帶 anti_air。舊版遊戲會把飛行敵人當成地面、所有單位都打得到，
##    和網頁的說明不同，所以提升版本。
##    同一版還加了：防禦塔的 air_first（優先飛行）目標優先與 show_upgrade_panel 的 target_modes（Web 只顯示列出的選項，
##    沒有 target_modes 的遊戲只會顯示原本三種）、拒絕開戰時的 wave_rejected（沒有這則訊息只是不顯示原因）。
##    這兩項對沒有它們的遊戲不會出現按了沒反應的選項，而且和 7 的其他內容一起首次發布，所以沒有另外提升版本；
##    網頁與遊戲產物必須同批發布。wave_rejected 的原因代碼後來多了地面路線的 ground_single_point／ground_zero_length
##    （網頁不認得的代碼顯示成「設定無效」），同樣在 7 首次發布前加入。
##    趙雲的閃避（team_list[].skill 的 id dodge、dodge_chance）與首擊加倍改綁馬超也在 7 首次發布前加入：
##    不認得的技能一律當作普通攻擊，舊產物收到 dodge 不會出錯、只是不閃避；網頁與遊戲產物同批發布，所以沒有另外提升版本。
##    同樣在 7 首次發布前加入：敵人設定的 atk（對阻路武將的攻擊力）與 trait 的 immune_slow（免疫減速）開始生效，
##    關卡沒有波次時拒絕第 1 波（不再改用內建的測試波次）。訊息格式沒有改變（enemies_config 原本就整份送進來），
##    舊產物只是照舊固定 20、照舊減速；網頁的敵軍資訊照新規則顯示，所以網頁與遊戲產物必須同批發布。
##    同樣在 7 首次發布前加入：關羽的技能改成減速光環（team_list[].skill 的 id slow_aura、slow_mult），網頁不再送 sweep；
##    倍率減速改成依來源保存與到期。舊產物收到 slow_aura 只是當作普通攻擊（沒有光環），網頁與遊戲產物同批發布，所以沒有另外提升版本
const BRIDGE_PROTOCOL: int = 7

## 可選的功能（game_ready 的 capabilities）：協定版本不變，Web 只在列出時才使用；沒有列出的舊遊戲照舊運作。
## battle_observation：戰況觀測（武將的生命與技能狀態、場上的敵人），Godot 主動送出、不需要 Web 的命令，
##   武將面板（show_upgrade_panel）同時帶這一場的 battle_id 與武將的識別碼 hero_uid。見 Main.battle_observation
const BRIDGE_CAPABILITIES: Array = ["battle_observation"]


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
	if payload.get("type") == "debug_snapshot":
		# 測試用唯讀查詢，頻繁輪詢時不印 log
		debug_snapshot_requested.emit(str(payload.get("request_id", "")))
		return
	if payload.get("type") == "request_ready":
		# Web 掛上訊息監聽後請遊戲再送一次就緒訊息：遊戲可能比頁面先準備好，第一次的 game_ready 會被漏掉
		send_ready()
		return
	print("[WebBridge] 收到訊號:", payload.get("type", "payload"))
	if payload.get("type") == "start_battle":
		start_battle_requested.emit()
	elif payload.get("type") == "toggle_auto":
		auto_toggle_requested.emit()
	elif payload.get("type") == "request_move":
		move_unit_requested.emit()
	elif payload.get("type") == "deselect_unit":
		deselect_unit_requested.emit()
	elif payload.get("type") == "request_upgrade":
		upgrade_unit_requested.emit()
	elif payload.get("type") == "update_sound_settings":
		SFXManager.configure(
			payload.get("sfx_enabled", true),
			payload.get("sfx_polyphony", "single")
		)
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

## 告知 Web 端的就緒訊息（帶協定版本與可選的功能）
func ready_message() -> Dictionary:
	return {"__godot_bridge": true, "type": "game_ready", "protocol": BRIDGE_PROTOCOL, "capabilities": BRIDGE_CAPABILITIES.duplicate()}

## 告知 Web 端：Godot 已啟動並準備就緒
func send_ready() -> void:
	if OS.get_name() != "Web":
		return
	var json = JSON.stringify(ready_message())
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)
## 傳送即時戰鬥數據（金幣、波次、血量）給 Web
func send_stats(stats: Dictionary) -> void:
	stats["__godot_bridge"] = true
	stats["type"] = "update_stats"
	if OS.get_name() != "Web":
		return
	var json = JSON.stringify(stats)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)

## 當玩家點擊地圖空地時，通知 Web 彈出選單
func send_click_cell(data: Dictionary) -> void:
	data["__godot_bridge"] = true
	data["type"] = "click_cell"
	if OS.get_name() != "Web":
		print("[WebBridge] (非 Web) 點擊格子：", data)
		return
	var json = JSON.stringify(data)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)

func send_show_upgrade_panel(data: Dictionary) -> void:
	data["__godot_bridge"] = true
	data["type"] = "show_upgrade_panel"
	if OS.get_name() != "Web":
		print("[WebBridge] (非 Web) 顯示升級面板：", data)
		return
	var json = JSON.stringify(data)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)

## 測試用：回傳 debug_snapshot 查詢結果
func send_debug_snapshot(data: Dictionary) -> void:
	data["__godot_bridge"] = true
	data["type"] = "debug_snapshot"
	if OS.get_name() != "Web":
		print("[WebBridge] (非 Web) 快照：", data)
		return
	var json = JSON.stringify(data)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)

## 防禦塔的目標優先已套用：回傳塔的實際模式（同一場的 battle_id 與塔的識別碼），面板只顯示這個
func send_tower_target_changed(data: Dictionary) -> void:
	data["__godot_bridge"] = true
	data["type"] = "tower_target_changed"
	if OS.get_name() != "Web":
		return
	var json = JSON.stringify(data)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)

## 拆除防禦塔的結果（Round 18）：{battle_id, tower_uid, ok, refund, gold, reason?}。
## battle_id 與 tower_uid 是命令帶來的值，Web 只在和目前面板相同時採用
func send_tower_sell_result(data: Dictionary) -> void:
	data["__godot_bridge"] = true
	data["type"] = "tower_sell_result"
	if OS.get_name() != "Web":
		return
	var json = JSON.stringify(data)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)

## 戰鬥速度的回覆：{battle_id, ok, speed, time_scale, reason?}。battle_id 是命令帶來的值，Web 只在和目前這一場相同時採用
func send_game_speed_result(data: Dictionary) -> void:
	data["__godot_bridge"] = true
	data["type"] = "game_speed_result"
	if OS.get_name() != "Web":
		return
	var json = JSON.stringify(data)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)

## 手動暫停的回覆：{battle_id, ok, paused, speed, time_scale, reason?}。battle_id 是命令帶來的值，Web 只在和目前這一場相同時採用
func send_game_pause_result(data: Dictionary) -> void:
	data["__godot_bridge"] = true
	data["type"] = "game_pause_result"
	if OS.get_name() != "Web":
		return
	var json = JSON.stringify(data)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)

## 拒絕開戰：{battle_id, wave, missing, skipped: [{index, enemy_id, path, reason}]}（說明見 WaveManager.get_last_plan_report）。
## 仍在備戰、沒有扣城血也不結算；Web 只在 battle_id 和目前這一場相同時顯示原因。舊版遊戲不送，Web 只是不顯示原因
func send_wave_rejected(data: Dictionary) -> void:
	data["__godot_bridge"] = true
	data["type"] = "wave_rejected"
	if OS.get_name() != "Web":
		return
	var json = JSON.stringify(data)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)

## 戰況觀測（唯讀，見 Main.battle_observation）：備戰與戰鬥中最多每 0.25 秒（牆鐘）一次，狀態改變時立刻送；不印 log
func send_battle_observation(data: Dictionary) -> void:
	data["__godot_bridge"] = true
	data["type"] = "battle_observation"
	if OS.get_name() != "Web":
		return
	var json = JSON.stringify(data)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)

func send_hide_upgrade_panel() -> void:
	var data = { "__godot_bridge": true, "type": "hide_upgrade_panel" }
	if OS.get_name() != "Web": return
	var json = JSON.stringify(data)
	JavaScriptBridge.eval("window.parent.postMessage(%s, '*');" % json)

