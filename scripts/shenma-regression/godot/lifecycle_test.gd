## lifecycle_test.gd
## 神馬三國 headless 生命週期回歸測試（不進正式產物）
## 執行：由 run-godot-tests.sh 複製到「暫存專案」的 res://__regression__/ 後以
##   godot --headless --path <暫存專案> --script res://__regression__/lifecycle_test.gd
## 直接載入 Main.tscn，用 wave_cleared 等信號在「窗口當下」操作，時序可控。
## 只使用舊版也有的公開行為判定結果，因此同一支測試可以對照修正前後。

extends SceneTree

const MAX_HP: int = 20
var main: Node
## 物理時鐘（physics_clock.gd）：灼燒的計時用
var pclock: Node
var results: Array = []
var battle_ended_count: int = 0
var last_result: Dictionary = {}

func _initialize() -> void:
	_run.call_deferred()

# ── 小工具 ────────────────────────────────────────────────────
func _check(name: String, ok: bool, detail: Variant = "") -> void:
	results.append({"name": name, "ok": ok, "detail": str(detail)})
	print(("PASS  " if ok else "FAIL  ") + name + "  " + str(detail))

func _wait(sec: float) -> void:
	await create_timer(sec).timeout

## 不受 Engine.time_scale 影響的等待（R20）：錯誤的實作可能用倍率 0 假裝暫停，測試自己的等待不能因此停住
func _wait_real(sec: float) -> void:
	await create_timer(sec, true, false, true).timeout

func _wait_until_real(cond: Callable, timeout: float) -> bool:
	var t: float = 0.0
	while t < timeout:
		if cond.call():
			return true
		await create_timer(0.02, true, false, true).timeout
		t += 0.02
	return cond.call()

## 遊戲時間（秒）：Main 每一幀累加的 delta（受 Engine.time_scale 影響、暫停時不前進），和敵人灼燒、武將攻擊用的是同一個 delta。
## 計時的斷言一律用它，不用牆鐘：電腦忙碌時一幀可能變長，但遊戲時間和遊戲裡的計時器仍然一致。
## 在 await process_frame 之後讀取：這一幀的節點還沒處理，讀到的時間和血量都是上一幀處理完的狀態
func _gt() -> float:
	return main._game_time

## 物理時鐘（秒）：累加 _physics_process 的 delta，和敵人的移動、灼燒同一個物理步進（受倍率影響、暫停時不前進）。
## 灼燒的計時用它；武將攻擊在 _process，用 _gt
func _pt() -> float:
	return pclock.t

func _wait_until(cond: Callable, timeout: float) -> bool:
	var t: float = 0.0
	while t < timeout:
		if cond.call():
			return true
		await create_timer(0.02).timeout
		t += 0.02
	return cond.call()

func _bm() -> Node:
	return main.battle_manager

func _wm() -> Node:
	return main.wave_manager

func _enemy_nodes() -> Dictionary:
	var d: Dictionary = {}
	for c in main.units_layer.get_children():
		if c is Enemy and not c.is_queued_for_deletion():
			d[c.enemy_id] = int(d.get(c.enemy_id, 0)) + 1
	return d

func _state() -> Dictionary:
	return {
		"stage": _bm().stage_id, "state": _bm().game_state, "wave": _bm().current_wave,
		"hp": _bm().base_hp, "auto": _bm().auto_mode, "kills": _bm().kills,
		"active": _wm().get_active_enemy_count(), "enemy_nodes": _enemy_nodes(),
	}

func _path_json() -> Dictionary:
	var bz: Array = []
	for c in range(1, 13):
		bz.append([c, 4])
		bz.append([c, 6])
	return {"cols": 14, "rows": 11, "paths": {"path_a": [[0, 5], [13, 5]]},
		"spawn": [0, 5], "base": [13, 5], "build_zones": bz, "obstacles": []}

func _enemies_cfg() -> Array:
	return [
		{"enemy_id": "a_slow", "name": "A", "hp": 99999.0, "speed": 12.0},
		{"enemy_id": "b_grunt", "name": "B", "hp": 20.0, "speed": 60.0},
		{"enemy_id": "c_fast", "name": "C", "hp": 99999.0, "speed": 2000.0},
		{"enemy_id": "w_grunt", "name": "W", "hp": 20.0, "speed": 60.0},
		# R12：極慢、血厚（量測每一擊的傷害）／血量 300（兩擊打倒，用來清波）
		{"enemy_id": "tank", "name": "T", "hp": 99999.0, "speed": 4.0},
		{"enemy_id": "soft", "name": "S", "hp": 300.0, "speed": 4.0},
		# R14：不會移動（速度 0）、血厚：放在離武將指定格數的位置量射程
		{"enemy_id": "post", "name": "P", "hp": 99999.0, "speed": 0.0},
		# R15：不會移動、血量 130（普通攻擊 100 後剩 30，灼燒第 2 跳打倒）
		{"enemy_id": "ember", "name": "E", "hp": 130.0, "speed": 0.0},
		# R17：不會移動、血量不同（防禦塔目標優先）
		{"enemy_id": "t_front", "name": "F", "hp": 1000.0, "speed": 0.0},
		{"enemy_id": "t_tank", "name": "K", "hp": 5000.0, "speed": 0.0},
		{"enemy_id": "t_weak", "name": "W", "hp": 300.0, "speed": 0.0},
		# R19：不會移動、血量 90（弓兵塔 30 × 3 擊打倒；比較 1 倍與 2 倍的結算）
		{"enemy_id": "r19_soft", "name": "S", "hp": 90.0, "speed": 0.0},
		# 飛行敵人與對空（movement_type）：不會移動的地面／飛行、快速的地面／飛行（比較路線）、慢速的地面／飛行（阻擋與倍率）、
		# 兩擊打倒的飛行（擊殺只算一次），以及 movement_type 的各種寫法（前後空白算飛行；大小寫不同、不認得、空白都是地面）
		{"enemy_id": "fly_post", "name": "F", "hp": 99999.0, "speed": 0.0, "movement_type": "flying"},
		{"enemy_id": "gnd_post", "name": "G", "hp": 99999.0, "speed": 0.0, "movement_type": "ground"},
		{"enemy_id": "fly_run", "name": "F", "hp": 99999.0, "speed": 240.0, "movement_type": "flying"},
		{"enemy_id": "gnd_run", "name": "G", "hp": 99999.0, "speed": 240.0},
		{"enemy_id": "fly_walk", "name": "F", "hp": 99999.0, "speed": 40.0, "movement_type": "flying"},
		{"enemy_id": "gnd_walk", "name": "G", "hp": 99999.0, "speed": 40.0, "movement_type": "ground"},
		{"enemy_id": "fly_soft", "name": "F", "hp": 60.0, "speed": 0.0, "movement_type": "flying"},
		{"enemy_id": "fly_pad", "name": "F", "hp": 99999.0, "speed": 0.0, "movement_type": " flying "},
		{"enemy_id": "fly_caps", "name": "F", "hp": 99999.0, "speed": 0.0, "movement_type": "Flying"},
		{"enemy_id": "fly_air", "name": "F", "hp": 99999.0, "speed": 0.0, "movement_type": "air"},
		{"enemy_id": "fly_blank", "name": "F", "hp": 99999.0, "speed": 0.0, "movement_type": ""},
	]

func _payload(stage_id: String, waves: Array) -> Dictionary:
	var ws: Array = []
	for i in range(waves.size()):
		ws.append({"wave": i + 1, "enemies": waves[i]})
	return {
		"stage_id": stage_id,
		"player": {"key": "test", "nickname": "test", "level": 1, "gold": 0},
		"team_list": [],
		"heroes_config": [],
		"enemies_config": _enemies_cfg(),
		"map": {"map_id": stage_id, "name": stage_id, "path_json": _path_json(), "waves": ws},
		"sound_settings": {"sfx_enabled": false, "sfx_polyphony": "single"},
	}

func _grp(id: String, count: int, interval: float) -> Dictionary:
	return {"enemy_id": id, "count": count, "interval": interval, "path": "path_a"}

func _load(p: Dictionary) -> void:
	main._on_payload_received(p)

func _stage_a() -> Dictionary:
	return _payload("stage_a", [[_grp("a_slow", 5, 2.0)], [_grp("a_slow", 5, 2.0)]])

func _stage_b() -> Dictionary:
	return _payload("stage_b", [[_grp("b_grunt", 2, 1.0)]])

func _stage_c() -> Dictionary:
	return _payload("stage_c", [[_grp("c_fast", 1, 0.1)], [_grp("c_fast", 1, 0.1)], [_grp("c_fast", 1, 0.1)]])

func _expect_clean_prep(prefix: String, stage: String, waited: float) -> void:
	var s: Dictionary = _state()
	_check(prefix + "：仍在備戰", s.stage == stage and s.state == 1 and s.wave == 0, s)
	_check(prefix + "：城池 HP 仍為 20", s.hp == MAX_HP, "hp=%d（等待 %.1fs）" % [s.hp, waited])
	_check(prefix + "：場上沒有任何敵人", s.enemy_nodes.is_empty() and s.active == 0, s.enemy_nodes)

# ── 測試 ──────────────────────────────────────────────────────
func _run() -> void:
	# 物理時鐘放在最前面、優先處理：同一個物理步進裡先於遊戲節點累加
	pclock = load("res://__regression__/physics_clock.gd").new()
	pclock.process_physics_priority = -1000
	root.add_child(pclock)
	main = load("res://main/Main.tscn").instantiate()
	root.add_child(main)
	# 手動暫停時物理時鐘也不前進（和敵人的移動、灼燒一樣）
	pclock.bm = main.battle_manager
	# 非 Web 平台 Main 會在 0.5 秒後注入自己的測試 payload，先等它結束再開始
	await _wait(1.0)
	_bm().battle_ended.connect(func(r: Dictionary):
		battle_ended_count += 1
		last_result = r)

	# 只跑一部分（診斷與反向驗證用；完整回歸不設定）：SHENMA_TEST_ONLY=sweep 只跑橫掃；skills 跑四位武將的技能與攻速成長；
	# flying 跑飛行敵人與對空（加上防禦塔目標優先，它也用剩餘路程）
	var only: String = OS.get_environment("SHENMA_TEST_ONLY")
	if only != "":
		if only == "skills":
			await _r12_first_strike_cases()
			await _r14_long_range_cases()
			await _r15_burn_cases()
			await _r16_attack_speed_cases()
			await _sweep_cases()
		elif only == "sweep":
			await _sweep_cases()
		elif only == "flying":
			await _flying_cases()
			await _r17_tower_target_cases()
		else:
			_check("SHENMA_TEST_ONLY 的值不認得：" + only + "（可用 sweep、skills、flying）", false)
		_finish()
		return

	# I2-1：A 出兵間隔內切到 B，超過 A 的出兵間隔後 B 必須乾淨
	_load(_stage_a())
	_bm().player_start_battle()
	await _wait_until(func(): return _wm().get_active_enemy_count() >= 1, 2.0)
	_check("I2-1 前置：A 已出兵且仍在出兵間隔中", _wm().get_active_enemy_count() == 1, _state())
	_load(_stage_b())
	await _wait(5.0)  # 超過 A 的 2 秒間隔兩次以上
	_expect_clean_prep("I2-1 A→B", "stage_b", 5.0)

	# I2-2：A → B → A
	_load(_stage_a())
	_bm().player_start_battle()
	await _wait(0.3)
	_load(_stage_b())
	await _wait(0.2)
	_load(_stage_a())
	await _wait(5.0)
	_expect_clean_prep("I2-2 A→B→A", "stage_a", 5.0)

	# I2-3：同關重開（A 出兵中再載入 A）
	_load(_stage_a())
	_bm().player_start_battle()
	await _wait(0.3)
	_load(_stage_a())
	await _wait(5.0)
	_expect_clean_prep("I2-3 同關重開", "stage_a", 5.0)

	# I2-4：自動模式清波後的 1.5 秒等待窗口內切到 B
	await _auto_window_test("I2-4 自動等待中切 B", func(): _load(_stage_b()), "stage_b")

	# I2-5：自動等待窗口內同關重開
	await _auto_window_test("I2-5 自動等待中同關重開", func(): _load(_stage_c()), "stage_c")

	# I2-6：自動等待窗口內關閉自動，不得偷開下一波，且之後能手動迎戰
	_load(_stage_c())
	var off_fired: Array = [false]
	var cb_off := func(_n: int):
		if not off_fired[0]:
			off_fired[0] = true
			_bm().toggle_auto_mode()  # 關閉自動
	_wm().wave_cleared.connect(cb_off)
	_bm().toggle_auto_mode()  # 開啟自動 → 立刻開第 1 波
	await _wait_until(func(): return off_fired[0], 5.0)
	_wm().wave_cleared.disconnect(cb_off)
	_check("I2-6 前置：在等待窗口內關閉自動", off_fired[0] and not _bm().auto_mode, _state())
	await _wait(3.0)
	var s6: Dictionary = _state()
	_check("I2-6 關閉自動後沒有偷開第 2 波", s6.wave == 1 and s6.active == 0, s6)
	_check("I2-6 關閉自動後回到備戰（可手動迎戰）", s6.state == 1, s6)
	_bm().player_start_battle()
	await _wait(0.1)
	_check("I2-6 手動迎戰可開第 2 波", _bm().current_wave == 2, _state())

	# I2-7：同一波重複收到清波通知，只能排程一次
	_load(_stage_c())
	var dup_fired: Array = [false]
	var cb_dup := func(_n: int):
		if not dup_fired[0]:
			dup_fired[0] = true
			_bm().on_wave_all_enemies_dead()  # 模擬重複通知
	_wm().wave_cleared.connect(cb_dup)
	_bm().toggle_auto_mode()
	await _wait_until(func(): return dup_fired[0], 5.0)
	_wm().wave_cleared.disconnect(cb_dup)
	var before_ended: int = battle_ended_count
	# 1.5 秒後第 2 波開出並很快清空、再排第 3 波（再 1.5 秒）；在 2.0 秒時只該在第 2 波。
	# 若重複排程，兩個計時器會在 1.5 秒同時觸發而直接跳到第 3 波。
	await _wait(2.0)
	_check("I2-7 重複清波通知只推進一波", _bm().current_wave == 2, _state())
	await _wait_until(func(): return _bm().game_state == 3, 10.0)
	_check("I2-7 最終只結算一次", battle_ended_count - before_ended == 1, "結算次數 %d" % (battle_ended_count - before_ended))

	# N-1：正常自動三波 → 只結算一次、漏怪數與 HP 一致
	_load(_stage_c())
	before_ended = battle_ended_count
	_bm().toggle_auto_mode()
	await _wait_until(func(): return _bm().game_state == 3, 15.0)
	await _wait(0.5)
	_check("N-1 自動三波完成並結算一次", battle_ended_count - before_ended == 1 and last_result.get("result") == "WIN", last_result)
	_check("N-1 三隻漏怪 → HP 17", _bm().base_hp == 17, _state())

	# N-2：最後一波最後一隻漏怪讓 HP 歸零時必須判負（扣血要先於清波判定）
	_load(_payload("stage_leak", [[_grp("c_fast", 20, 0.05)]]))
	before_ended = battle_ended_count
	_bm().player_start_battle()
	await _wait_until(func(): return _bm().game_state == 3, 15.0)
	await _wait(0.5)
	_check("N-2 20 隻全漏 → 判負", last_result.get("result") == "LOSE" and _bm().base_hp == 0, {"result": last_result.get("result"), "hp": _bm().base_hp})
	_check("N-2 只結算一次", battle_ended_count - before_ended == 1, battle_ended_count - before_ended)

	# N-3：手動兩波＋防禦塔 → 擊殺數＋漏怪數 = 敵人總數
	_load(_payload("stage_w", [[_grp("w_grunt", 3, 1.0)], [_grp("w_grunt", 3, 1.0)]]))
	main._on_web_place_tower({"tower_type": "archer", "cell_x": 4, "cell_y": 4})
	main._on_web_place_tower({"tower_type": "archer", "cell_x": 8, "cell_y": 6})
	before_ended = battle_ended_count
	_bm().player_start_battle()
	await _wait_until(func(): return _bm().game_state == 1 or _bm().game_state == 3, 30.0)
	_check("N-3 第 1 波清空後回到備戰", _bm().game_state == 1 and _bm().current_wave == 1, _state())
	_bm().player_start_battle()
	await _wait_until(func(): return _bm().game_state == 3, 30.0)
	await _wait(0.5)
	var leaked: int = MAX_HP - _bm().base_hp
	_check("N-3 勝利且只結算一次", last_result.get("result") == "WIN" and battle_ended_count - before_ended == 1, last_result)
	_check("N-3 擊殺＋漏怪＝6", _bm().kills + leaked == 6, "kills=%d leaked=%d result.kills=%s" % [_bm().kills, leaked, str(last_result.get("kills"))])
	_check("N-3 結算的擊殺數與戰場一致", int(last_result.get("kills", -1)) == _bm().kills, last_result.get("kills"))

	# ── R3：混合敵人組（無效組不得讓波次提前結束）──
	await _r3_codex_case()
	var missing: Dictionary = _grp("missing_config", 1, 1.0)
	var no_path: Dictionary = {"enemy_id": "c_fast", "count": 1, "interval": 0.1, "path": "path_missing"}
	var blank: Dictionary = {"enemy_id": "", "count": 1, "interval": 0.1, "path": "path_a"}
	await _r3_mixed_case("R3-M1 缺設定組在第一組", [missing, _grp("c_fast", 3, 0.5)], 3, false)
	await _r3_mixed_case("R3-M2 缺設定組在中間", [_grp("c_fast", 1, 0.1), missing, _grp("c_fast", 2, 0.5)], 3, false)
	await _r3_mixed_case("R3-M3 缺設定組在最後", [_grp("c_fast", 2, 0.5), missing], 2, false)
	await _r3_mixed_case("R3-M4 無路徑組混有效組", [no_path, _grp("c_fast", 2, 0.5)], 2, false)
	await _r3_mixed_case("R3-M5 count=0 混有效組", [_grp("c_fast", 0, 0.5), _grp("c_fast", 2, 0.5)], 2, false)
	await _r3_mixed_case("R3-M6 空白列混有效組", [blank, _grp("c_fast", 1, 0.1)], 1, false)
	await _r3_mixed_case("R3-M7 正常多組", [_grp("c_fast", 2, 0.5), _grp("c_fast", 2, 0.3)], 4, false)
	await _r3_mixed_case("R3-M8 自動模式缺設定組在第一組", [missing, _grp("c_fast", 2, 0.5)], 2, true)

	# 全部組無效／空波：拒絕開戰、不得給勝利獎勵，之後能切到有效關卡恢復
	await _r3_refuse_case("R3-E1 全部組無效", _payload("stage_all_invalid", [[missing, no_path, _grp("c_fast", 0, 0.5), blank]]), false, 0)
	await _r3_refuse_case("R3-E2 完全空波", _payload("stage_empty", [[]]), false, 0)
	var gap: Dictionary = _payload("stage_gap", [[_grp("c_fast", 1, 0.1)]])
	gap.map.waves.append({"wave": 3, "enemies": [_grp("c_fast", 1, 0.1)]})
	await _r3_refuse_case("R3-E3 波次缺號（第 2 波不存在）", gap, false, 1)
	await _r3_refuse_case("R3-E4 自動模式第 2 波全無效", _payload("stage_auto_invalid", [[_grp("c_fast", 1, 0.1)], [missing]]), true, 1)
	_load(_stage_c())
	before_ended = battle_ended_count
	_bm().toggle_auto_mode()
	await _wait_until(func(): return _bm().game_state == 3, 15.0)
	_check("R3-E5 拒絕後切到有效關卡可正常完成", last_result.get("result") == "WIN" and last_result.get("stage_id") == "stage_c" and battle_ended_count - before_ended == 1, last_result)

	# ── R9：場次識別碼（battle_id）──
	await _r9_battle_id_cases()

	# ── R10：就緒訊息帶協定版本（Web 用來判斷遊戲版本是否相符）──
	var bridge: Node = main.web_bridge
	var ready: Dictionary = bridge.ready_message() if bridge.has_method("ready_message") else {}
	_check("R10-1 game_ready 帶協定版本 7（加入飛行敵人與對空後的版本；Web 只在版本相同時送出關卡資料）", ready.get("type") == "game_ready" and ready.get("__godot_bridge") == true and typeof(ready.get("protocol")) == TYPE_INT and ready.get("protocol") == 7, ready)

	# ── R12：趙雲「奇襲」（每場戰鬥首次有效普通攻擊 2 倍傷害）──
	await _r12_first_strike_cases()

	# R12-10：Web 請遊戲再送一次就緒訊息（request_ready）：只回覆 game_ready，不當成關卡資料
	var rec_ready: Node = load("res://__regression__/bridge_recorder.gd").new()
	var payloads: Array = [0]
	rec_ready.payload_received.connect(func(_p): payloads[0] += 1)
	rec_ready._on_js_message([JSON.stringify({"__godot_bridge": true, "type": "request_ready"})])
	_check("R12-10 收到 request_ready：再送一次 game_ready，不當成關卡資料", rec_ready.sent_ready == 1 and payloads[0] == 0, {"sent_ready": rec_ready.sent_ready, "payloads": payloads[0]})
	rec_ready.free()

	# ── R14：黃忠「百步穿楊」（有效射程 ×1.5）──
	await _r14_long_range_cases()

	# ── R15：周瑜「火攻」（命中後附加 3 跳灼燒）──
	await _r15_burn_cases()

	# ── R16：攻速成長（D17）──
	await _r16_attack_speed_cases()

	# ── R17：防禦塔目標優先 ──
	await _r17_tower_target_cases()

	# ── R18：備戰拆除防禦塔 ──
	await _r18_sell_cases()

	# ── R19：戰鬥速度 1×／2× 與部署選單的暫時慢速 ──
	await _r19_speed_cases()

	# ── R20：攻擊冷卻保留零頭與手動暫停 ──
	await _r20_cooldown_cases()
	await _r20_pause_cases()

	# ── 關羽「橫掃」（普通攻擊命中後，主目標附近 1 格內最多 2 名其他敵人各受 50%）──
	await _sweep_cases()

	# ── 飛行敵人與對空 ──
	await _flying_cases()

	_finish()

# ── 輸出 ──
func _finish() -> void:
	var failed: int = 0
	for r in results:
		if not r.ok:
			failed += 1
	print("RESULT_JSON " + JSON.stringify({"total": results.size(), "failed": failed, "results": results}))
	quit(1 if failed > 0 else 0)

func _auto_window_test(name: String, action: Callable, expect_stage: String) -> void:
	_load(_stage_c())
	var fired: Array = [false]
	var cb := func(_n: int):
		if not fired[0]:
			fired[0] = true
			action.call()  # 在清波信號當下（自動下一波計時器剛排程）執行
	_wm().wave_cleared.connect(cb)
	_bm().toggle_auto_mode()  # 開啟自動 → 立刻開第 1 波
	await _wait_until(func(): return fired[0], 5.0)
	if _wm().wave_cleared.is_connected(cb):
		_wm().wave_cleared.disconnect(cb)
	_check(name + " 前置：已在等待窗口內操作", fired[0], _state())
	await _wait(3.0)  # 超過 1.5 秒的自動出波延遲
	var s: Dictionary = _state()
	_check(name + "：沒有被舊計時器自動開戰", s.stage == expect_stage and s.state == 1 and s.wave == 0, s)
	_check(name + "：場上沒有敵人、HP 20", s.enemy_nodes.is_empty() and s.hp == MAX_HP, s)

# ── R3 輔助 ───────────────────────────────────────────────────
# R3-0：Codex 在 Round 3 提供的重現案例（單波；缺設定組在前、有效組在後）
func _r3_codex_case() -> void:
	_load(_payload("mixed_groups", [[_grp("missing_config", 1, 1.0), _grp("a_slow", 3, 1.0)]]))
	var before: int = battle_ended_count
	_bm().player_start_battle()
	await _wait(0.1)
	_check("R3-0 缺設定組在前：0.1 秒時仍在戰鬥、未結算", _bm().game_state == 2 and battle_ended_count == before, _state())
	await _wait(2.5)
	_check("R3-0 缺設定組在前：3 隻有效敵人全部生成且未結算", _wm().get_active_enemy_count() == 3 and battle_ended_count == before, _state())

## 混合組放在第 1 波（共 2 波）。清波是勝利／回備戰／下一波唯一的入口，
## 所以在清波當下檢查「有效敵人已全部生成、也都已擊殺或漏怪」，並檢查每波只清一次
func _r3_mixed_case(name: String, groups: Array, expected: int, auto: bool) -> void:
	_load(_payload("stage_mixed", [groups, [_grp("c_fast", 1, 0.1)]]))
	var before_ended: int = battle_ended_count
	var rec: Dictionary = {"spawned": 0, "all_spawned": {}, "cleared": {}, "at_clear": {}}
	var on_spawn := func(_e: Node): rec["spawned"] += 1
	var on_all := func(n: int): rec["all_spawned"][n] = int(rec["all_spawned"].get(n, 0)) + 1
	var on_clear := func(n: int):
		rec["cleared"][n] = int(rec["cleared"].get(n, 0)) + 1
		if not rec["at_clear"].has(n):
			rec["at_clear"][n] = {"spawned": rec["spawned"], "processed": _bm().kills + MAX_HP - _bm().base_hp}
	_wm().enemy_spawned.connect(on_spawn)
	_wm().wave_all_spawned.connect(on_all)
	_wm().wave_cleared.connect(on_clear)
	if auto:
		_bm().toggle_auto_mode()
		await _wait_until(func(): return _bm().game_state == 3, 20.0)
	else:
		_bm().player_start_battle()
		await _wait_until(func(): return _bm().game_state != 2, 15.0)
		await _wait(0.3)  # 給重複通知出現的機會
		var s1: Dictionary = _state()
		_check(name + "：清波後回到備戰、未結算", s1.state == 1 and s1.wave == 1 and battle_ended_count == before_ended, s1)
		_bm().player_start_battle()
		await _wait_until(func(): return _bm().game_state == 3, 10.0)
	await _wait(0.3)
	_wm().enemy_spawned.disconnect(on_spawn)
	_wm().wave_all_spawned.disconnect(on_all)
	_wm().wave_cleared.disconnect(on_clear)
	var at1: Dictionary = rec["at_clear"].get(1, {"spawned": -1, "processed": -1})
	_check(name + "：第 1 波清波時 %d 隻有效敵人已全部生成並處理完" % expected, at1.spawned == expected and at1.processed == expected, rec)
	_check(name + "：每波只發一次 wave_all_spawned／wave_cleared", rec["all_spawned"] == {1: 1, 2: 1} and rec["cleared"] == {1: 1, 2: 1}, rec)
	var total: int = _bm().kills + MAX_HP - _bm().base_hp
	_check(name + "：勝利且只結算一次、敵人總數 %d" % (expected + 1), last_result.get("result") == "WIN" and battle_ended_count - before_ended == 1 and total == expected + 1, {"result": last_result.get("result"), "ended": battle_ended_count - before_ended, "processed": total})

## 無法生成任何敵人的波次：必須拒絕開戰（停在備戰、波次不前進、不結算），並發出可辨識的拒絕信號
func _r3_refuse_case(name: String, payload: Dictionary, auto: bool, expect_wave: int) -> void:
	_load(payload)
	var before_ended: int = battle_ended_count
	var rejected: Array = []
	var on_reject := func(n: int, reason: String): rejected.append([n, reason])
	var has_sig: bool = _bm().has_signal("wave_start_rejected")
	if has_sig:
		_bm().wave_start_rejected.connect(on_reject)
	if auto:
		_bm().toggle_auto_mode()
		await _wait_until(func(): return _bm().game_state == 3 or rejected.size() > 0, 10.0)
	else:
		if expect_wave > 0:
			# 先正常打完前面的波次
			_bm().player_start_battle()
			await _wait_until(func(): return _bm().game_state != 2, 10.0)
		_bm().player_start_battle()
	await _wait(1.0)
	if has_sig:
		_bm().wave_start_rejected.disconnect(on_reject)
	var s: Dictionary = _state()
	_check(name + "：拒絕開戰，停在備戰且波次不前進", s.state == 1 and s.wave == expect_wave and not s.auto and s.active == 0, s)
	_check(name + "：沒有結算（不給勝利獎勵）", battle_ended_count == before_ended, {"ended": battle_ended_count - before_ended, "last": last_result.get("stage_id")})
	_check(name + "：發出一次拒絕信號", rejected.size() == 1 and rejected[0][0] == expect_wave + 1, {"has_signal": has_sig, "rejected": rejected})

# ── R9 輔助 ───────────────────────────────────────────────────
## 依序列出訊息中出現過的 battle_id（去除重複）
func _battle_ids(msgs: Array) -> Array:
	var ids: Array = []
	for m in msgs:
		var id: Variant = m.get("battle_id", null)
		if not ids.has(id):
			ids.append(id)
	return ids

func _with_id(p: Dictionary, battle_id: String) -> Dictionary:
	p["battle_id"] = battle_id
	return p

## R9：Web 送進來的 battle_id 會帶在 update_stats 與結算上；結算帶的是產生它的那一場的識別碼。
## 暫時把 Main.web_bridge 換成 bridge_recorder.gd（繼承正式 WebBridge，只多記一份送出的訊息）
func _r9_battle_id_cases() -> void:
	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec

	# R9-1：載入後（備戰）與開打後的 stats 都帶這一場的 battle_id
	_load(_with_id(_stage_a(), "r9-a1"))
	_bm().player_start_battle()
	await _wait(0.5)
	var states1: Array = rec.sent_stats.map(func(s): return int(s.get("game_state", -1)))
	_check("R9-1 載入後與開打後的 update_stats 都帶這一場的 battle_id", _battle_ids(rec.sent_stats) == ["r9-a1"] and states1.has(1) and states1.has(2), {"ids": _battle_ids(rec.sent_stats), "states": states1})

	# R9-2：同一關重來（出兵間隔中）：之後只有新的一場送出訊息，上一場不再送出 stats 或結算
	var n_stats: int = rec.sent_stats.size()
	_load(_with_id(_stage_a(), "r9-a2"))
	await _wait(5.0)  # 超過 A 的 2 秒出兵間隔兩次以上
	var ids2: Array = _battle_ids(rec.sent_stats.slice(n_stats))
	_check("R9-2 同一關重來後：之後的 stats 都帶新的 battle_id，上一場沒有再送出 stats 或結算", ids2 == ["r9-a2"] and rec.sent_results.is_empty() and _bm().battle_id == "r9-a2", {"ids": ids2, "results": rec.sent_results.size()})

	# R9-3：打完一場：結算只有一筆，帶這一場的 battle_id
	n_stats = rec.sent_stats.size()
	_load(_with_id(_stage_c(), "r9-c1"))
	_bm().toggle_auto_mode()
	await _wait_until(func(): return _bm().game_state == 3, 15.0)
	await _wait(0.3)
	_check("R9-3 結算只有一筆，帶這一場的 battle_id 與 stage_id", rec.sent_results.size() == 1 and rec.sent_results[0].get("battle_id") == "r9-c1" and rec.sent_results[0].get("stage_id") == "stage_c", rec.sent_results)
	_check("R9-3 這一場的 stats 都帶這一場的 battle_id", _battle_ids(rec.sent_stats.slice(n_stats)) == ["r9-c1"], _battle_ids(rec.sent_stats.slice(n_stats)))

	# R9-4：戰鬥結束時最早發出的信號（state_changed 進入 RESULT）當下就載入新關卡：
	# 送出的結算仍是產生它的那一場（battle_id、stage_id 都不會變成新場次的）
	_load(_with_id(_stage_c(), "r9-c2"))
	var fired: Array = [false]
	var reload_on_result := func(state: int):
		if state == 3 and not fired[0]:
			fired[0] = true
			_load(_with_id(_stage_b(), "r9-b1"))
	_bm().state_changed.connect(reload_on_result)
	var n_results: int = rec.sent_results.size()
	_bm().toggle_auto_mode()
	await _wait_until(func(): return fired[0], 15.0)
	await _wait(0.3)
	_bm().state_changed.disconnect(reload_on_result)
	var r4: Array = rec.sent_results.slice(n_results)
	_check("R9-4 戰鬥結束的第一個信號中就載入新關卡：送出的結算仍帶產生它的那一場（r9-c2、stage_c）", fired[0] and r4.size() == 1 and r4[0].get("battle_id") == "r9-c2" and r4[0].get("stage_id") == "stage_c", r4)
	var last4: Dictionary = rec.sent_stats[rec.sent_stats.size() - 1]
	_check("R9-4 之後是新的一場：備戰中，stats 帶新的 battle_id", _bm().battle_id == "r9-b1" and _bm().game_state == 1 and last4.get("battle_id") == "r9-b1" and int(last4.get("game_state", -1)) == 1, {"bm": _bm().battle_id, "last": last4})

	# R9-5：關卡資料沒有 battle_id：stats 帶空字串（Web 不會採用）
	_load(_stage_b())
	var last5: Dictionary = rec.sent_stats[rec.sent_stats.size() - 1]
	_check("R9-5 關卡資料沒有 battle_id：stats 的 battle_id 是空字串", last5.has("battle_id") and last5.get("battle_id") == "", last5)

	main.web_bridge = original
	rec.free()

# ── R12 輔助：趙雲「奇襲」 ─────────────────────────────────────
func _r12_hero(hero_id: String, skill: Variant) -> Dictionary:
	var h: Dictionary = {"hero_id": hero_id, "level": 1, "star": 0, "atk": 100.0, "def": 50.0, "hp": 1000.0, "slot": 1}
	if skill != null:
		h["skill"] = skill
	return h

func _r12_zhao(skill_id: String = "first_strike") -> Dictionary:
	return _r12_hero("zhao_yun", {"id": skill_id, "first_attack_multiplier": 2})

func _r12_payload(stage_id: String, waves: Array, battle_id: String, team: Array) -> Dictionary:
	var p: Dictionary = _with_id(_payload(stage_id, waves), battle_id)
	p["team_list"] = team
	p["heroes_config"] = [
		{"hero_id": "zhao_yun", "name": "趙雲", "job": "cavalry", "attack_range": 3.0, "attack_speed": 0.5},
		{"hero_id": "guan_yu", "name": "關羽", "job": "infantry", "attack_range": 3.0, "attack_speed": 0.5},
	]
	return p

func _r12_place(hero_id: String, cell: Vector2i = Vector2i(1, 4)) -> void:
	main._on_web_place_hero({"hero_id": hero_id, "cell_x": cell.x, "cell_y": cell.y})

## 在 sec 秒內，每一幀記錄場上敵人的血量下降量，也就是每一擊實際造成的傷害（同時只有一位武將攻擊時才準確）。
## 開始時已在場上的敵人以當下血量為基準；記錄期間才出現的敵人用最大血量比較，避免漏掉出現當下的那一擊
func _record_hits(sec: float) -> Array:
	var hits: Array = []
	var last: Dictionary = {}
	for c in main.units_layer.get_children():
		if c is Enemy and is_instance_valid(c):
			last[c.get_instance_id()] = c.current_hp
	var end_ms: int = Time.get_ticks_msec() + int(sec * 1000.0)
	while Time.get_ticks_msec() < end_ms:
		for c in main.units_layer.get_children():
			if c is Enemy and is_instance_valid(c):
				var id: int = c.get_instance_id()
				var before: float = float(last.get(id, c.max_hp))
				if c.current_hp < before - 0.001:
					hits.append(snappedf(before - c.current_hp, 0.01))
				last[id] = c.current_hp
		await process_frame
	return hits

func _all_equal(hits: Array, value: float) -> bool:
	for h in hits:
		if h != value:
			return false
	return true

func _r12_first_strike_cases() -> void:
	var tank: Array = [_grp("tank", 1, 1.0)]

	# R12-1、R12-2：放置後沒有敵人時不會用掉；開戰後第一擊 200（攻擊力 100 的 2 倍），之後恢復 100
	_load(_r12_payload("r12_a", [tank], "r12-a1", [_r12_zhao()]))
	_r12_place("zhao_yun")
	await _wait(1.5)  # 超過 3 次攻擊間隔，場上沒有敵人
	var unused: Dictionary = _bm().get_debug_state().get("first_strike_used", {})
	_check("R12-2 放置後沒有目標（備戰中）：奇襲沒有被用掉", unused.is_empty(), unused)
	# 記下這段期間出現的浮動文字（武將上方的技能標記、敵人的傷害數字）
	var float_texts: Array = []
	var on_child := func(n: Node) -> void:
		if n is FloatingText:
			create_timer(0.1).timeout.connect(func() -> void:
				if is_instance_valid(n) and n._label != null:
					float_texts.append(n._label.text)
			)
	main.units_layer.child_entered_tree.connect(on_child)
	_bm().player_start_battle()
	var hits1: Array = await _record_hits(2.2)
	main.units_layer.child_entered_tree.disconnect(on_child)
	_check("R12-1 觸發時武將上方出現「x2!」，整段只出現一次（第一擊）", float_texts.count("x2!") == 1, float_texts)
	_check("R12-1 趙雲第一擊造成 200（攻擊力 100 的 2 倍），之後恢復 100", hits1.size() >= 3 and hits1[0] == 200.0 and _all_equal(hits1.slice(1), 100.0), hits1)
	var used: Dictionary = _bm().get_debug_state().get("first_strike_used", {})
	_check("R12-1 這一場只記下一次奇襲（趙雲，傷害 200）", used.size() == 1 and float(used.get("zhao_yun", 0)) == 200.0, used)

	# R12-3：同一場的下一波不重置（第 1 波的敵人兩擊打倒後清波，第 2 波第一擊是 100）
	_load(_r12_payload("r12_b", [[_grp("soft", 1, 1.0)], tank], "r12-b1", [_r12_zhao()]))
	_r12_place("zhao_yun")
	_bm().player_start_battle()
	var w1: Array = await _record_hits(0.8)
	await _wait_until(func(): return _bm().game_state == 1, 5.0)
	_check("R12-3 前置：第 1 波第一擊 200，敵人被打倒後清波回到備戰", w1.size() >= 1 and w1[0] == 200.0 and _bm().kills == 1 and _bm().game_state == 1, {"hits": w1, "kills": _bm().kills, "state": _bm().game_state})
	_bm().player_start_battle()
	var w2: Array = await _record_hits(1.2)
	_check("R12-3 同一場的第 2 波不重置：每一擊都是 100", w2.size() >= 2 and _all_equal(w2, 100.0), w2)

	# R12-4：同一場移動位置不重置
	var zhao: Node = main._placed_heroes.get("zhao_yun")
	zhao.reposition(Vector2i(2, 4), main.game_map.grid_to_world(Vector2i(2, 4)), main.game_map)
	var moved: Array = await _record_hits(1.2)
	_check("R12-4 同一場移動位置後：每一擊都是 100", moved.size() >= 2 and _all_equal(moved, 100.0), moved)

	# R12-5：同一場更新隊伍／屬性不重置
	main._on_payload_received({"type": "update_team", "team_list": [_r12_zhao()]})
	var updated: Array = await _record_hits(1.2)
	_check("R12-5 同一場更新隊伍資料後：每一擊都是 100", updated.size() >= 2 and _all_equal(updated, 100.0), updated)

	# R12-6：同一場移除後重新放置不重置
	main._on_payload_received({"type": "update_team", "team_list": []})
	await _wait(0.2)
	var removed: bool = not main._placed_heroes.has("zhao_yun")
	main._on_payload_received({"type": "update_team", "team_list": [_r12_zhao()]})
	_r12_place("zhao_yun", Vector2i(3, 4))
	var replaced: Array = await _record_hits(1.2)
	_check("R12-6 同一場移除後重新放置：每一擊都是 100", removed and main._placed_heroes.has("zhao_yun") and replaced.size() >= 2 and _all_equal(replaced, 100.0), {"removed": removed, "hits": replaced})

	# R12-7：新的一場（同一關重來，新的 battle_id）重置，第一擊又是 200
	_load(_r12_payload("r12_b", [tank], "r12-b2", [_r12_zhao()]))
	_r12_place("zhao_yun")
	_bm().player_start_battle()
	var again: Array = await _record_hits(1.2)
	_check("R12-7 新的一場（新 battle_id）重置：第一擊 200，之後 100", again.size() >= 2 and again[0] == 200.0 and _all_equal(again.slice(1), 100.0), again)

	# R12-8：沒有帶技能參數的武將（這裡的關羽不帶 skill）不受影響
	_load(_r12_payload("r12_c", [tank], "r12-c1", [_r12_hero("guan_yu", null)]))
	_r12_place("guan_yu")
	_bm().player_start_battle()
	var guan: Array = await _record_hits(1.2)
	_check("R12-8 沒有帶技能參數的武將（關羽）：第一擊就是 100", guan.size() >= 2 and _all_equal(guan, 100.0), guan)

	# R12-9：不認得的技能一律當作普通攻擊
	_load(_r12_payload("r12_d", [tank], "r12-d1", [_r12_zhao("unknown_skill")]))
	_r12_place("zhao_yun")
	_bm().player_start_battle()
	var unknown: Array = await _record_hits(1.2)
	_check("R12-9 不認得的技能 id：當作普通攻擊，第一擊就是 100", unknown.size() >= 2 and _all_equal(unknown, 100.0), unknown)
	_load(_stage_b())

# ── R14 輔助：黃忠「百步穿楊」（有效射程 ×1.5） ──────────────────
# 設定和正式 heroes_config 的黃忠相同（射程 5、射程成長 0.03）；攻擊間隔改成 0.5 秒，讓測試快一點
func _r14_huang(level: int = 1, skill: Variant = {"id": "long_range", "range_multiplier": 1.5}) -> Dictionary:
	var h: Dictionary = _r12_hero("huang_zhong", skill)
	h["level"] = level
	return h

func _r14_payload(stage_id: String, battle_id: String, team: Array) -> Dictionary:
	# 速度 0 的敵人停在原地：測試直接把它放在離武將指定格數的位置
	var p: Dictionary = _r12_payload(stage_id, [[_grp("post", 1, 0.3)]], battle_id, team)
	p["heroes_config"].append({"hero_id": "huang_zhong", "name": "黃忠", "job": "archer", "attack_range": 5.0, "range_growth": 0.03, "attack_speed": 0.5})
	return p

func _first_enemy() -> Node:
	for c in main.units_layer.get_children():
		if c is Enemy and is_instance_valid(c) and not c.is_queued_for_deletion():
			return c
	return null

## 開戰後等這一場的敵人出現
func _r14_enemy() -> Node:
	await _wait_until(func(): return _first_enemy() != null, 5.0)
	return _first_enemy()

## 把敵人放在武將右邊正好 d 格的位置（距離 = d 格）
func _r14_put(enemy: Node, hero: Node, d: float) -> void:
	enemy.global_position = hero.global_position + Vector2(d * float(hero.tile_size), 0.0)

## sec 秒（遊戲時間）內的每一擊：實際傷害與發生的時間（遊戲時間，秒；Round 16 起不用牆鐘）
func _record_hits_timed(sec: float) -> Array:
	var hits: Array = []
	var last: Dictionary = {}
	for c in main.units_layer.get_children():
		if c is Enemy and is_instance_valid(c):
			last[c.get_instance_id()] = c.current_hp
	var t0: float = _gt()
	var wall_end: int = Time.get_ticks_msec() + int(sec * 4000.0) + 10000
	while _gt() < t0 + sec and Time.get_ticks_msec() < wall_end:
		for c in main.units_layer.get_children():
			if c is Enemy and is_instance_valid(c):
				var id: int = c.get_instance_id()
				var before: float = float(last.get(id, c.max_hp))
				if c.current_hp < before - 0.001:
					hits.append({"dmg": snappedf(before - c.current_hp, 0.01), "t": _gt() - t0})
				last[id] = c.current_hp
		await process_frame
	return hits

func _dmgs(hits: Array) -> Array:
	var out: Array = []
	for h in hits:
		out.append(h.dmg)
	return out

## 相鄰兩擊的平均間隔（秒）；少於兩擊時回傳 -1
func _avg_interval(hits: Array) -> float:
	if hits.size() < 2:
		return -1.0
	return (float(hits[hits.size() - 1].t) - float(hits[0].t)) / float(hits.size() - 1)

func _huang() -> Node:
	return main._placed_heroes.get("huang_zhong")

## 把敵人放在 d 格、記錄 sec 秒內的每一擊
func _hits_at(enemy: Node, d: float, sec: float) -> Array:
	_r14_put(enemy, _huang(), d)
	return await _record_hits_timed(sec)

func _r14_long_range_cases() -> void:
	# R14-1～R14-4：Lv1 有效射程 7.5 格（5 × 1.5）
	_load(_r14_payload("r14_a", "r14-a1", [_r14_huang()]))
	_r12_place("huang_zhong", Vector2i(3, 4))
	_check("R14-1 黃忠 Lv1 放置後有效射程 7.5 格（射程 5 × 1.5）", is_equal_approx(_huang().attack_range, 7.5), _huang().attack_range)
	_bm().player_start_battle()
	var e: Node = await _r14_enemy()
	var at6: Array = await _hits_at(e, 6.0, 1.6)
	_check("R14-2 敵人在 6 格（原射程 5 格外、新射程 7.5 格內）：實際扣血，每一擊都是攻擊力 100（傷害不變、不是奇襲）", at6.size() >= 2 and _all_equal(_dmgs(at6), 100.0), at6)
	var itv_skill: float = _avg_interval(at6)
	var at74: Array = await _hits_at(e, 7.4, 1.2)
	var at752: Array = await _hits_at(e, 7.52, 1.2)
	var at76: Array = await _hits_at(e, 7.6, 1.2)
	_check("R14-3 新射程邊界：7.4 格打得到；7.52 格、7.6 格（7.5 格外）打不到", at74.size() >= 1 and at752.is_empty() and at76.is_empty(), {"7.4": at74.size(), "7.52": at752.size(), "7.6": at76.size()})

	# 對照：同一位武將沒有技能時，射程 5 格：6 格打不到、4.9 格打得到；攻擊間隔相同
	_load(_r14_payload("r14_b", "r14-b1", [_r14_huang(1, null)]))
	_r12_place("huang_zhong", Vector2i(3, 4))
	_bm().player_start_battle()
	var e0: Node = await _r14_enemy()
	var n6: Array = await _hits_at(e0, 6.0, 1.2)
	var n49: Array = await _hits_at(e0, 4.9, 1.6)
	var itv_plain: float = _avg_interval(n49)
	_check("R14-4 對照：沒有技能時射程 5 格（6 格打不到、4.9 格打得到），每一擊同樣是 100", is_equal_approx(_huang().attack_range, 5.0) and n6.is_empty() and n49.size() >= 2 and _all_equal(_dmgs(n49), 100.0), {"range": _huang().attack_range, "6": n6.size(), "4.9": n49})
	_check("R14-5 攻擊間隔不因技能改變：有技能與沒有技能都約 0.5 秒", itv_skill > 0.42 and itv_skill < 0.62 and absf(itv_skill - itv_plain) < 0.06, {"skill": itv_skill, "plain": itv_plain})

	# R14-6：Lv2 的射程成長也一起乘上 1.5：(5 + 0.03) × 1.5 = 7.545
	_load(_r14_payload("r14_c", "r14-c1", [_r14_huang(2)]))
	_r12_place("huang_zhong", Vector2i(3, 4))
	_bm().player_start_battle()
	var e2: Node = await _r14_enemy()
	var l2_in: Array = await _hits_at(e2, 7.52, 1.2)
	var l2_out: Array = await _hits_at(e2, 7.57, 1.2)
	_check("R14-6 Lv2 有效射程 7.545 格（(5 + 0.03) × 1.5）：7.52 格打得到（Lv1 打不到）、7.57 格打不到", is_equal_approx(_huang().attack_range, 7.545) and l2_in.size() >= 1 and l2_out.is_empty(), {"range": _huang().attack_range, "7.52": l2_in.size(), "7.57": l2_out.size()})

	# R14-7：同一場連續更新隊伍三次：不疊乘，仍是 7.545；邊界不變
	for i in range(3):
		main._on_payload_received({"type": "update_team", "team_list": [_r14_huang(2)]})
	var upd_in: Array = await _hits_at(e2, 7.52, 1.2)
	var upd_out: Array = await _hits_at(e2, 7.6, 1.2)
	_check("R14-7 連續更新隊伍三次：射程仍是 7.545（沒有變成 11.3 或 17）；7.52 格打得到、7.6 格打不到", is_equal_approx(_huang().attack_range, 7.545) and upd_in.size() >= 1 and upd_out.is_empty(), {"range": _huang().attack_range, "in": upd_in.size(), "out": upd_out.size()})

	# R14-8：更新隊伍時等級改變，從基礎值重算（Lv1 → 7.5、Lv3 → (5 + 0.06) × 1.5 = 7.59）
	main._on_payload_received({"type": "update_team", "team_list": [_r14_huang(1)]})
	var r_l1: float = _huang().attack_range
	main._on_payload_received({"type": "update_team", "team_list": [_r14_huang(3)]})
	var r_l3: float = _huang().attack_range
	_check("R14-8 更新隊伍時等級改變：從基礎值重新計算（Lv1 7.5、Lv3 7.59）", is_equal_approx(r_l1, 7.5) and is_equal_approx(r_l3, 7.59), {"lv1": r_l1, "lv3": r_l3})

	# R14-9：移動位置、移除後重新放置：不疊乘
	main._on_payload_received({"type": "update_team", "team_list": [_r14_huang(1)]})
	_huang().reposition(Vector2i(4, 4), main.game_map.grid_to_world(Vector2i(4, 4)), main.game_map)
	var r_moved: float = _huang().attack_range
	main._on_payload_received({"type": "update_team", "team_list": []})
	await _wait(0.2)
	var removed: bool = not main._placed_heroes.has("huang_zhong")
	main._on_payload_received({"type": "update_team", "team_list": [_r14_huang(1)]})
	_r12_place("huang_zhong", Vector2i(5, 4))
	var r_replaced: float = _huang().attack_range if _huang() != null else -1.0
	var re_in: Array = await _hits_at(e2, 7.4, 1.2)
	var re_out: Array = await _hits_at(e2, 7.6, 1.2)
	_check("R14-9 移動位置、移除後重新放置：射程仍是 7.5；7.4 格打得到、7.6 格打不到", is_equal_approx(r_moved, 7.5) and removed and is_equal_approx(r_replaced, 7.5) and re_in.size() >= 1 and re_out.is_empty(), {"moved": r_moved, "removed": removed, "replaced": r_replaced, "in": re_in.size(), "out": re_out.size()})

	# R14-10：新的一場（同一關重來）仍是 7.5
	_load(_r14_payload("r14_c", "r14-c2", [_r14_huang(1)]))
	_r12_place("huang_zhong", Vector2i(3, 4))
	_check("R14-10 新的一場：射程 7.5", is_equal_approx(_huang().attack_range, 7.5), _huang().attack_range)

	# R14-11：不認得的技能 id（帶了 range_multiplier 也一樣）當作普通攻擊；奇襲不影響射程
	_load(_r14_payload("r14_d", "r14-d1", [_r14_huang(1, {"id": "unknown_skill", "range_multiplier": 1.5}), _r12_zhao()]))
	_r12_place("huang_zhong", Vector2i(3, 4))
	_r12_place("zhao_yun", Vector2i(8, 4))
	var zhao: Node = main._placed_heroes.get("zhao_yun")
	_check("R14-11 不認得的技能 id：射程維持 5；趙雲（奇襲）的射程不受影響（3）", is_equal_approx(_huang().attack_range, 5.0) and zhao != null and is_equal_approx(zhao.attack_range, 3.0) and is_equal_approx(zhao.first_strike_multiplier, 2.0), {"huang": _huang().attack_range, "zhao": zhao.attack_range if zhao else null})
	_load(_stage_b())

# ── R15 輔助：周瑜「火攻」（每次有效普通攻擊附加 3 跳灼燒，每跳＝命中時攻擊力 × 20%，間隔 1 秒） ──
# 設定和正式 heroes_config 的周瑜相同（射程 4、射程成長 0.05、法師）；攻擊間隔改成 0.35 秒（測試用：連續命中和每秒的跳傷時間錯開）。
# 用每一幀的實際血量下降判斷：攻擊力 100 時普通攻擊一擊 100、跳傷 20（同一幀兩者都發生時是 120）
func _r15_zhou(atk_v: float = 100.0, skill: Variant = {"id": "burn", "burn_ratio": 0.2, "burn_ticks": 3, "burn_interval": 1.0}) -> Dictionary:
	var h: Dictionary = _r12_hero("zhou_yu", skill)
	h["atk"] = atk_v
	return h

func _r15_payload(stage_id: String, battle_id: String, team: Array, waves: Array = [[_grp("post", 1, 0.3)]]) -> Dictionary:
	var p: Dictionary = _r12_payload(stage_id, waves, battle_id, team)
	p["heroes_config"].append({"hero_id": "zhou_yu", "name": "周瑜", "job": "mage", "attack_range": 4.0, "range_growth": 0.05, "attack_speed": 0.35})
	return p

func _zhou() -> Node:
	return main._placed_heroes.get("zhou_yu")

## 開戰、等敵人出現後先移到射程外（離 (3,4) 8 格），再放置武將；之後由測試決定何時進入射程
func _r15_start(payload: Dictionary, hero_id: String = "zhou_yu") -> Node:
	_load(payload)
	_bm().player_start_battle()
	var e: Node = await _r14_enemy()
	if e != null:
		e.global_position = main.game_map.grid_to_world(Vector2i(3, 4)) + Vector2(8.0 * float(e.tile_size), 0.0)
	_r12_place(hero_id, Vector2i(3, 4))
	return e

## 把敵人放進射程（離武將 2 格），等到被打中（血量下降）的那一幀，立刻移到射程外（8 格）。
## 回傳看到命中的那一次的物理時鐘 t0、和前一次觀察的差 dh 與這一擊的傷害（命中發生在前一次觀察之後的 _process，灼燒從下一個物理步進開始倒數）；
## wall 是實際時間（毫秒），只供診斷
func _r15_hit_then_leave(e: Node, hero: Node) -> Dictionary:
	var before: float = e.current_hp
	_r14_put(e, hero, 2.0)
	var prev: float = _pt()
	var g_end: float = _pt() + 3.0
	var wall_end: int = Time.get_ticks_msec() + 20000
	while _pt() < g_end and Time.get_ticks_msec() < wall_end and is_instance_valid(e) and e.current_hp >= before - 0.001:
		prev = _pt()
		await process_frame
	var t0: float = _pt()
	var dmg: float = snappedf(before - e.current_hp, 0.01) if is_instance_valid(e) else -1.0
	if is_instance_valid(e) and not e.is_dead():
		_r14_put(e, hero, 8.0)
	return {"t0": t0, "dh": t0 - prev, "dmg": dmg, "wall": Time.get_ticks_msec()}

## 到物理時鐘 t0 + sec 秒為止，記錄這個敵人每一幀的血量下降：t 是這一次、p 是前一次觀察時的物理時鐘（都相對 t0）。
## 敵人死亡時記下死亡那一幀與前一幀的時間後停止。wall_ms 是同一段的實際時間（只供診斷）
func _r15_drops(e: Node, t0: float, sec: float) -> Dictionary:
	var drops: Array = []
	var died: Array = [-1.0, -1.0]
	if not is_instance_valid(e):
		return {"drops": drops, "died": -1.0, "died_p": -1.0}
	var prev: Array = [_pt()]
	var on_died := func(_n: Node) -> void:
		died[0] = _pt() - t0
		died[1] = prev[0] - t0
	e.died.connect(on_died)
	var last: float = e.current_hp
	var wall0: int = Time.get_ticks_msec()
	var wall_end: int = wall0 + int(sec * 4000.0) + 10000
	while _pt() < t0 + sec and Time.get_ticks_msec() < wall_end:
		prev[0] = _pt()
		await process_frame
		if not is_instance_valid(e):
			break
		if e.current_hp < last - 0.001:
			drops.append({"t": _pt() - t0, "p": prev[0] - t0, "dmg": snappedf(last - e.current_hp, 0.01)})
		last = e.current_hp
	if is_instance_valid(e) and e.died.is_connected(on_died):
		e.died.disconnect(on_died)
	return {"drops": drops, "died": died[0], "died_p": died[1], "wall_ms": Time.get_ticks_msec() - wall0}

## 把每一幀的血量下降拆成普通攻擊與灼燒跳傷（每一幀最多一擊、最多一跳）；拆不開的放在 bad。回傳的是 _r15_drops 的紀錄
func _r15_split(drops: Array, hit: float, tick: float) -> Dictionary:
	var hits: Array = []
	var ticks: Array = []
	var bad: Array = []
	for d in drops:
		var v: float = d.dmg
		if is_equal_approx(v, hit):
			hits.append(d)
		elif is_equal_approx(v, tick):
			ticks.append(d)
		elif is_equal_approx(v, hit + tick):
			hits.append(d)
			ticks.append(d)
		else:
			bad.append(d)
	return {"hits": hits, "ticks": ticks, "bad": bad}

## 每一跳都發生在「預期時間 expected[i]（物理時鐘，相對命中）到達」的那一幀：前一次觀察還沒到、這一次已經到。
## 命中發生在看到命中的前一次觀察之後，所以下限再放寬 dh（兩次觀察之間的物理時間）。
## 容差只來自實際經過的物理步進，不是固定秒數；0.0005 秒只吸收浮點誤差（1/60 秒累加 60 次不一定正好是 1）
func _r15_at(recs: Array, expected: Array, dh: float) -> bool:
	if recs.size() != expected.size():
		return false
	for i in range(recs.size()):
		var ex: float = float(expected[i])
		if not (float(recs[i].p) < ex + 0.0005 and float(recs[i].t) >= ex - dh - 0.0005):
			return false
	return true

## 紀錄的時間（顯示用，毫秒精度）
func _r15_ts(recs: Array) -> Array:
	var out: Array = []
	for r in recs:
		out.append(snappedf(float(r.t), 0.001))
	return out

## 等不受時間倍率影響的 sec 秒（引擎的 delta，不是牆鐘），回傳這段期間物理時鐘前進的時間 adv、經過的物理步進數 steps，
## 以及每一步的長度 per_step（應該正好是 Engine.time_scale ÷ 每秒物理步數）。電腦忙時引擎會限制每幀的步數，
## 所以不拿實際時間比，只看每一步前進多少
func _physics_rate(sec: float) -> Dictionary:
	var tm: SceneTreeTimer = create_timer(sec, true, false, true)
	var g0: float = _pt()
	var f0: int = Engine.get_physics_frames()
	while tm.time_left > 0.0:
		await process_frame
	var steps: int = Engine.get_physics_frames() - f0
	var adv: float = _pt() - g0
	return {"adv": adv, "steps": steps, "per_step": adv / float(steps) if steps > 0 else -1.0}

func _r15_burn_cases() -> void:
	# 灼燒在敵人的 _physics_process 推進：計時一律用物理時鐘（_pt），判定用 _r15_at：跳傷發生在預期時間到達的那一幀；牆鐘只記在細節裡供診斷
	# R15-1：命中一次後移出射程：普通一擊 100；之後 3 跳各 20，第一跳在命中後 1 秒（命中當下不另外跳），之後每秒一跳，沒有第 4 跳
	var float_texts: Array = []
	var on_child := func(n: Node) -> void:
		if n is FloatingText:
			create_timer(0.1).timeout.connect(func() -> void:
				if is_instance_valid(n) and n._label != null:
					float_texts.append({"text": n._label.text, "color": n._label.get_theme_color("font_color")})
			)
	var e1: Node = await _r15_start(_r15_payload("r15_a", "r15-a1", [_r15_zhou()]))
	_check("R15-0 周瑜讀到火攻參數：每跳 20%、3 跳、間隔 1 秒；射程與攻擊間隔照設定（4 格、0.35 秒），不受技能影響", _zhou() != null and is_equal_approx(_zhou().burn_ratio, 0.2) and _zhou().burn_ticks == 3 and is_equal_approx(_zhou().burn_interval, 1.0) and is_equal_approx(_zhou().attack_range, 4.0) and is_equal_approx(_zhou().attack_speed, 0.35), {"ratio": _zhou().burn_ratio, "ticks": _zhou().burn_ticks, "interval": _zhou().burn_interval, "range": _zhou().attack_range})
	main.units_layer.child_entered_tree.connect(on_child)
	var h1: Dictionary = await _r15_hit_then_leave(e1, _zhou())
	await _wait(0.5)
	var burning_mid: bool = e1.is_burning()
	var r1: Dictionary = await _r15_drops(e1, h1.t0, 4.6)
	main.units_layer.child_entered_tree.disconnect(on_child)
	var s1: Dictionary = _r15_split(r1.drops, 100.0, 20.0)
	_check("R15-1 命中一次後移出射程：普通一擊 100；之後 3 跳各 20，在命中後遊戲時間 1、2、3 秒到達的那一幀（第一跳不在命中當下），到第 4.6 秒沒有第 4 跳", h1.dmg == 100.0 and s1.hits.is_empty() and s1.bad.is_empty() and _r15_at(s1.ticks, [1.0, 2.0, 3.0], h1.dh), {"hit": h1.dmg, "dh": h1.dh, "ticks": _r15_ts(s1.ticks), "drops": r1.drops, "wall_ms": r1.wall_ms})
	var burn_texts: int = 0
	for f in float_texts:
		if f.text == "20" and f.color.is_equal_approx(Color(1.0, 0.55, 0.05)):
			burn_texts += 1
	_check("R15-2 灼燒看得到：跳完前敵人有灼燒狀態（橘色外圈），跳完後沒有；3 次跳傷都顯示橘色的「20」", burning_mid and not e1.is_burning() and burn_texts == 3, {"mid": burning_mid, "after": e1.is_burning(), "burn_texts": burn_texts, "texts": float_texts})

	# R15-3：連續命中（每 0.35 秒一擊）約 2.6 秒後移出射程：不疊加（每跳都是 20），也不延後下一跳（仍在第 1、2 秒跳）；
	# 最後一擊把剩餘跳數刷新為 3，之後在第 3、4、5 秒各跳一次，共 5 跳
	var e3: Node = await _r15_start(_r15_payload("r15_b", "r15-b1", [_r15_zhou()]))
	var before3: float = e3.current_hp
	_r14_put(e3, _zhou(), 2.0)
	var prev3: float = _pt()
	var g_end3: float = _pt() + 3.0
	var wall_end3: int = Time.get_ticks_msec() + 20000
	while _pt() < g_end3 and Time.get_ticks_msec() < wall_end3 and e3.current_hp >= before3 - 0.001:
		prev3 = _pt()
		await process_frame
	var t3: float = _pt()
	var dh3: float = t3 - prev3
	var first3: float = snappedf(before3 - e3.current_hp, 0.01)
	var in_range: Dictionary = await _r15_drops(e3, t3, 2.6)
	_r14_put(e3, _zhou(), 8.0)
	var out_at: float = _pt() - t3
	var after3: Dictionary = await _r15_drops(e3, t3, 6.2)
	var s3: Dictionary = _r15_split(in_range.drops + after3.drops, 100.0, 20.0)
	var last_hit: float = float(s3.hits[s3.hits.size() - 1].t) if not s3.hits.is_empty() else -1.0
	_check("R15-3 連續命中時不疊加、不延後：每跳都是 20，跳傷在第 1、2 秒（不會因為一直命中而一直延後）；移出射程後不再命中，再跳 3 次（第 3、4、5 秒），共 5 跳", first3 == 100.0 and s3.bad.is_empty() and s3.hits.size() >= 6 and last_hit > 2.0 and last_hit <= out_at + 0.0005 and _r15_at(s3.ticks, [1.0, 2.0, 3.0, 4.0, 5.0], dh3), {"hits": _r15_ts(s3.hits), "ticks": _r15_ts(s3.ticks), "out_at": out_at, "dh": dh3, "bad": s3.bad})

	# R15-4：灼燒中攻擊力變成 150 後再命中一次：每跳傷害換成最近一次命中的快照（30）；下一跳的時間不重設（仍在第 1 秒），刷新後共 3 跳
	var e4: Node = await _r15_start(_r15_payload("r15_c", "r15-c1", [_r15_zhou()]))
	var h4: Dictionary = await _r15_hit_then_leave(e4, _zhou())
	await _wait(0.3)
	main._on_payload_received({"type": "update_team", "team_list": [_r15_zhou(150.0)]})
	var h4b: Dictionary = await _r15_hit_then_leave(e4, _zhou())
	var second_at: float = h4b.t0 - h4.t0
	var r4: Dictionary = await _r15_drops(e4, h4.t0, 4.6)
	var s4: Dictionary = _r15_split(r4.drops, 150.0, 30.0)
	_check("R15-4 灼燒中再命中（攻擊力 150）：每跳換成 30（最近一次命中的 20%）；下一跳仍在第一次命中後 1 秒（不從第二擊重算），之後共 3 跳", h4.dmg == 100.0 and h4b.dmg == 150.0 and second_at < 0.9 and s4.bad.is_empty() and _r15_at(s4.ticks, [1.0, 2.0, 3.0], h4.dh), {"first": h4.dmg, "second": h4b.dmg, "second_at": second_at, "ticks": _r15_ts(s4.ticks), "drops": r4.drops})

	# R15-5：灼燒打倒敵人（血量 130：普通 100 後剩 30，第 1 跳剩 10、第 2 跳打倒）：死亡後立即停止；擊殺、金幣、清波、結算都只一次
	var killed: Array = [0]
	var cleared: Array = [0]
	var on_killed := func(_n: Node) -> void:
		killed[0] += 1
	var on_cleared := func(_w: int) -> void:
		cleared[0] += 1
	_wm().enemy_killed.connect(on_killed)
	_wm().wave_cleared.connect(on_cleared)
	var ended0: int = battle_ended_count
	var e5: Node = await _r15_start(_r15_payload("r15_d", "r15-d1", [_r15_zhou()], [[_grp("ember", 1, 0.3)]]))
	var kills0: int = _bm().kills
	var gold0: int = _bm().battle_gold
	var h5: Dictionary = await _r15_hit_then_leave(e5, _zhou())
	var r5: Dictionary = await _r15_drops(e5, h5.t0, 3.6)
	await _wait(0.3)
	_wm().enemy_killed.disconnect(on_killed)
	_wm().wave_cleared.disconnect(on_cleared)
	var s5: Dictionary = _r15_split(r5.drops, 100.0, 20.0)
	var died5: bool = float(r5.died_p) < 2.0005 and float(r5.died) >= 2.0 - h5.dh - 0.0005
	_check("R15-5 灼燒打倒敵人：普通 100 後第 1 跳（第 1 秒）剩 10，第 2 跳（第 2 秒到達的那一幀）打倒，之後沒有再跳；敵人移除", h5.dmg == 100.0 and s5.bad.is_empty() and _r15_at(s5.ticks, [1.0], h5.dh) and died5 and not is_instance_valid(e5), {"hit": h5.dmg, "dh": h5.dh, "drops": r5.drops, "died": r5.died, "died_p": r5.died_p, "wall_ms": r5.wall_ms})
	_check("R15-5 擊殺只結算一次：kills +1、戰鬥金幣 +5、擊殺信號 1 次、清波 1 次、這一場結算 1 次", _bm().kills - kills0 == 1 and _bm().battle_gold - gold0 == 5 and killed[0] == 1 and cleared[0] == 1 and battle_ended_count - ended0 == 1, {"kills": _bm().kills - kills0, "gold": _bm().battle_gold - gold0, "killed": killed[0], "cleared": cleared[0], "ended": battle_ended_count - ended0})

	# R15-6：灼燒中抵達基地：立即停止（敵人移除），不算擊殺，城池只扣一次
	var leaked: Array = [0]
	var on_leaked := func(_n: Node) -> void:
		leaked[0] += 1
	_wm().enemy_leaked.connect(on_leaked)
	var e6: Node = await _r15_start(_r15_payload("r15_e", "r15-e1", [_r15_zhou()]))
	var kills6: int = _bm().kills
	var hp6: int = _bm().base_hp
	var h6: Dictionary = await _r15_hit_then_leave(e6, _zhou())
	var burning6: bool = e6.is_burning()
	e6.base_speed = 3000.0
	await _wait(2.5)
	_wm().enemy_leaked.disconnect(on_leaked)
	_check("R15-6 灼燒中抵達基地：敵人移除、之後沒有跳傷；不算擊殺，城池只扣 1", h6.dmg == 100.0 and burning6 and not is_instance_valid(e6) and _bm().kills == kills6 and leaked[0] == 1 and hp6 - _bm().base_hp == 1, {"burning": burning6, "kills": _bm().kills - kills6, "leaked": leaked[0], "hp": hp6 - _bm().base_hp})

	# R15-7：命中後移除周瑜（更新隊伍時拿掉）：已附加的灼燒仍跳完 3 次
	var e7: Node = await _r15_start(_r15_payload("r15_f", "r15-f1", [_r15_zhou()]))
	var h7: Dictionary = await _r15_hit_then_leave(e7, _zhou())
	main._on_payload_received({"type": "update_team", "team_list": []})
	var r7: Dictionary = await _r15_drops(e7, h7.t0, 4.6)
	var s7: Dictionary = _r15_split(r7.drops, 100.0, 20.0)
	_check("R15-7 命中後移除周瑜：已附加的灼燒仍在第 1、2、3 秒各跳 20", h7.dmg == 100.0 and not main._placed_heroes.has("zhou_yu") and s7.hits.is_empty() and s7.bad.is_empty() and _r15_at(s7.ticks, [1.0, 2.0, 3.0], h7.dh), {"removed": not main._placed_heroes.has("zhou_yu"), "ticks": _r15_ts(s7.ticks), "drops": r7.drops})

	# R15-8：灼燒中開始新的一場（同一關重來）：舊敵人移除，新的一場的敵人沒有灼燒、不扣血
	var e8: Node = await _r15_start(_r15_payload("r15_g", "r15-g1", [_r15_zhou()]))
	await _r15_hit_then_leave(e8, _zhou())
	var burning8: bool = e8.is_burning()
	_load(_r15_payload("r15_g", "r15-g2", [_r15_zhou()]))
	_bm().player_start_battle()
	var e8b: Node = await _r14_enemy()
	await _wait(2.3)
	_check("R15-8 新的一場不殘留：舊敵人移除；新的一場的敵人沒有灼燒、2 秒後血量不變", burning8 and not is_instance_valid(e8) and e8b != null and not e8b.is_burning() and e8b.current_hp == e8b.max_hp, {"old_valid": is_instance_valid(e8), "new_burning": e8b.is_burning() if e8b else null, "new_hp": e8b.current_hp if e8b else null})

	# R15-9：暫停不消耗時間：命中後 0.3 秒暫停 1.5 秒（實際時間）。暫停期間遊戲時間、灼燒的倒數與血量都不變；
	# 恢復後照剩下的時間繼續，所以 3 跳仍在命中後遊戲時間 1、2、3 秒（實際時間延後了暫停的長度，只記在細節）
	var e9: Node = await _r15_start(_r15_payload("r15_h", "r15-h1", [_r15_zhou()]))
	var h9: Dictionary = await _r15_hit_then_leave(e9, _zhou())
	await _wait(0.3)
	var hp_pause: float = e9.current_hp
	var g_pause: float = _pt()
	var next_pause: float = float(e9.burn_state().next_in)
	var p_start: int = Time.get_ticks_msec()
	paused = true
	await _wait(1.5)
	var hp_paused_end: float = e9.current_hp
	var g_paused_end: float = _pt()
	var next_paused_end: float = float(e9.burn_state().next_in)
	paused = false
	var pause_wall: float = (Time.get_ticks_msec() - p_start) / 1000.0
	var r9: Dictionary = await _r15_drops(e9, h9.t0, 3.6)
	var s9: Dictionary = _r15_split(r9.drops, 100.0, 20.0)
	_check("R15-9 暫停期間遊戲時間、灼燒倒數與血量都不變（沒有跳傷）；恢復後繼續，3 跳在命中後遊戲時間 1、2、3 秒", hp_pause == hp_paused_end and g_pause == g_paused_end and next_pause == next_paused_end and next_pause > 0.0 and s9.bad.is_empty() and _r15_at(s9.ticks, [1.0, 2.0, 3.0], h9.dh), {"pause_wall": pause_wall, "game_during": g_paused_end - g_pause, "next_in": [next_pause, next_paused_end], "hp_during": hp_pause - hp_paused_end, "ticks": _r15_ts(s9.ticks)})

	# R15-10：時間倍率：2 倍速時每個物理步進前進的時間是 1 倍速的 2 倍；部署選單的慢速（0.1 倍）只有 0.1 倍。
	# 灼燒照遊戲時間跳（兩種倍率下都在命中後遊戲時間 1、2、3 秒）；實際時間只記在細節。
	# 倍率只由 BattleManager 設定、新的一場回到 1 倍：開戰後用正式的速度命令（set_speed）切到 2 倍，
	# 慢速用正式的打開／關閉部署選單（原本直接改 Engine.time_scale，載入新的一場後會被重設）
	var e10: Node = await _r15_start(_r15_payload("r15_i", "r15-i1", [_r15_zhou()]))
	var sp10: String = _bm().set_speed(_bm().battle_id, 2.0)
	# 比例在命中之前量：命中之後才量會佔掉遊戲時間約 1 秒，第一跳發生在量測期間而沒有記到（Round 16 第一次反向驗證時出現過一次）
	var rate2: Dictionary = await _physics_rate(0.5)
	var h10: Dictionary = await _r15_hit_then_leave(e10, _zhou())
	var r10: Dictionary = await _r15_drops(e10, h10.t0, 3.6)
	var ts10: float = Engine.time_scale
	var s10: Dictionary = _r15_split(r10.drops, 100.0, 20.0)
	var e10b: Node = await _r15_start(_r15_payload("r15_i", "r15-i2", [_r15_zhou()]))
	var ts10b: float = Engine.time_scale
	var h10b: Dictionary = await _r15_hit_then_leave(e10b, _zhou())
	var menu10: int = _bm().open_deploy_menu()
	var rate01: Dictionary = await _physics_rate(1.0)
	_bm().close_deploy_menu(_bm().battle_id, menu10)
	var r10b: Dictionary = await _r15_drops(e10b, h10b.t0, 3.6)
	var s10b: Dictionary = _r15_split(r10b.drops, 100.0, 20.0)
	var tps: float = float(Engine.physics_ticks_per_second)
	var rate_ok: bool = rate2.steps > 0 and absf(rate2.per_step - 2.0 / tps) < 1e-9 and rate01.steps > 0 and absf(rate01.per_step - 0.1 / tps) < 1e-9
	_check("R15-10 時間倍率：2 倍速（速度命令）時每個物理步進前進 2 ÷ 每秒步數、部署慢速 0.1 ÷ 每秒步數；兩種倍率下灼燒都在命中後遊戲時間 1、2、3 秒（照遊戲時間推進）；下一場開始時回到 1 倍", sp10 == "" and ts10 == 2.0 and ts10b == 1.0 and menu10 > 0 and rate_ok and s10.bad.is_empty() and _r15_at(s10.ticks, [1.0, 2.0, 3.0], h10.dh) and s10b.bad.is_empty() and _r15_at(s10b.ticks, [1.0, 2.0, 3.0], h10b.dh), {"set_speed": sp10, "ts": [ts10, ts10b], "x2_rate": rate2, "x2": _r15_ts(s10.ticks), "x2_wall_ms": r10.wall_ms, "slow_rate": rate01, "slow": _r15_ts(s10b.ticks)})

	# R15-11：沒有火攻的武將與不認得的技能 id 不附加灼燒（帶了灼燒參數也一樣）
	var e11: Node = await _r15_start(_r15_payload("r15_j", "r15-j1", [_r15_zhou(100.0, {"id": "unknown_skill", "burn_ratio": 0.2, "burn_ticks": 3, "burn_interval": 1.0})]))
	var h11: Dictionary = await _r15_hit_then_leave(e11, _zhou())
	var r11: Dictionary = await _r15_drops(e11, h11.t0, 2.3)
	# 下一次載入關卡會移除這個敵人：先記下狀態
	var burning11: bool = e11.is_burning()
	var e11b: Node = await _r15_start(_r15_payload("r15_j", "r15-j2", [_r12_hero("guan_yu", null)]), "guan_yu")
	var h11b: Dictionary = await _r15_hit_then_leave(e11b, main._placed_heroes.get("guan_yu"))
	var r11b: Dictionary = await _r15_drops(e11b, h11b.t0, 2.3)
	var burning11b: bool = e11b.is_burning()
	_check("R15-11 不認得的技能 id（帶了灼燒參數）與沒有技能的關羽：命中 100 後沒有灼燒、沒有跳傷", h11.dmg == 100.0 and r11.drops.is_empty() and not burning11 and h11b.dmg == 100.0 and r11b.drops.is_empty() and not burning11b, {"unknown": r11.drops, "guan": r11b.drops})

	# R15-12：可控步進（Round 16）：停掉這個敵人的物理更新，改由測試以固定 0.0625 秒呼叫它的 _physics_process，時間完全由測試決定
	#（敵人每一步最多採用 0.1 秒；1/16 秒在二進位是精確值，累加不會有誤差）。
	# 附加（每跳 20）後第 0.75 秒沒有跳、第 1 秒正好一跳；第 1.5 秒再附加（每跳 30）只刷新剩餘跳數與傷害，
	# 下一跳仍在第 2 秒（不是 2.5 秒）；之後第 2、3、4 秒各 30，第 5 秒沒有。命中當下（第 0 秒）不跳
	_load(_r15_payload("r15_k", "r15-k1", []))
	_bm().player_start_battle()
	var e12: Node = await _r14_enemy()
	var steps12: Array = []
	if e12 != null:
		e12.set_physics_process(false)
		var hp12: float = e12.current_hp
		e12.apply_burn(20.0, 3, 1.0)
		var at0: bool = e12.current_hp == hp12
		for i in range(1, 81):
			e12._physics_process(0.0625)
			var t12: float = i * 0.0625
			if e12.current_hp < hp12 - 0.001:
				steps12.append([t12, snappedf(hp12 - e12.current_hp, 0.01)])
			hp12 = e12.current_hp
			if is_equal_approx(t12, 1.5):
				e12.apply_burn(30.0, 3, 1.0)
		_check("R15-12 可控步進（每步 0.0625 秒）：附加當下不跳；第 1 秒 20；第 1.5 秒再附加後下一跳仍在第 2 秒；第 2、3、4 秒各 30，之後沒有", at0 and str(steps12) == str([[1.0, 20.0], [2.0, 30.0], [3.0, 30.0], [4.0, 30.0]]) and not e12.is_burning(), steps12)
	else:
		_check("R15-12 可控步進：等不到敵人", false, "")
	_load(_stage_b())

# ── R16：攻速成長（D17）──
# Web 把正式設定的 speed_growth 正規化成 atk_spd_growth 後才送進來（store 測試 R16-A1～A5）；Godot 只讀 atk_spd_growth。
# 攻擊間隔＝max(0.1, attack_speed × (1 − (等級 − 1) × atk_spd_growth))，初始化與 update_team 都從設定重新計算。
# 武將攻擊在 _process：用遊戲時間（_gt）量實際的攻擊間隔
func _r16_guan(level: int) -> Dictionary:
	var h: Dictionary = _r12_hero("guan_yu", null)
	h["level"] = level
	return h

func _r16_payload(battle_id: String, team: Array, growth: Dictionary) -> Dictionary:
	var p: Dictionary = _r12_payload("r16_a", [[_grp("post", 1, 0.3)]], battle_id, team)
	var cfg: Dictionary = {"hero_id": "guan_yu", "name": "關羽", "job": "infantry", "attack_range": 3.0, "attack_speed": 0.5}
	cfg.merge(growth)
	p["heroes_config"] = [cfg]
	return p

func _guan() -> Node:
	return main._placed_heroes.get("guan_yu")

## sec 秒（遊戲時間）內這個敵人每一次被打中的時間，以及期間最長的一幀（遊戲時間）
func _r16_hits(e: Node, sec: float) -> Dictionary:
	var hits: Array = []
	var dmax: float = 0.0
	var last: float = e.current_hp
	var t0: float = _gt()
	var prev: float = t0
	var wall_end: int = Time.get_ticks_msec() + int(sec * 4000.0) + 10000
	while _gt() < t0 + sec and Time.get_ticks_msec() < wall_end:
		await process_frame
		dmax = maxf(dmax, _gt() - prev)
		prev = _gt()
		if not is_instance_valid(e):
			break
		if e.current_hp < last - 0.001:
			hits.append(snappedf(_gt() - t0, 0.0001))
		last = e.current_hp
	return {"hits": hits, "dmax": dmax}

## 累積時程：冷卻保留越過零點的零頭，第 k 擊排在「第一擊的預定時間＋k × 攻擊間隔」，實際命中落在那之後的第一幀。
## 所以每一擊的時間減去 k × 攻擊間隔的差距都落在同一個一幀寬的範圍內（最大減最小 ≤ 最長的一幀），不會逐擊變大；
## 相鄰兩擊的間隔因此可能比攻擊間隔短（最多一幀），但一幀不會打兩下。容差只來自實際的幀長；0.0005 秒吸收浮點誤差。
## 舊的判定（每一擊都不得短於攻擊間隔）只適用於每擊設回完整冷卻的舊寫法，已不適用
func _r16_interval_ok(r: Dictionary, expect: float) -> bool:
	var h: Array = r.hits
	if h.size() < 3:
		return false
	var lo: float = INF
	var hi: float = -INF
	for i in range(h.size()):
		if i > 0 and float(h[i]) - float(h[i - 1]) < expect - float(r.dmax) - 0.0005:
			return false
		var off: float = float(h[i]) - float(h[0]) - float(i) * expect
		lo = minf(lo, off)
		hi = maxf(hi, off)
	return hi - lo <= float(r.dmax) + 0.0005

func _r16_attack_speed_cases() -> void:
	# R16-1：Lv1 放置：攻擊間隔＝基礎 0.5 秒（成長 0.2 在 Lv1 不作用）
	_load(_r16_payload("r16-a1", [_r16_guan(1)], {"atk_spd_growth": 0.2}))
	_r12_place("guan_yu", Vector2i(3, 4))
	_bm().player_start_battle()
	var e: Node = await _r14_enemy()
	if e == null or _guan() == null:
		_check("R16-1 前置：等不到敵人或關羽沒有放置", false, "")
		return
	_r14_put(e, _guan(), 1.0)
	await _wait(0.6)
	var r1: Dictionary = await _r16_hits(e, 2.0)
	_check("R16-1 Lv1：攻擊間隔 0.5 秒；實際每一擊都在累積時程（第一擊＋k × 0.5 秒）的一幀之內", is_equal_approx(_guan().attack_speed, 0.5) and _r16_interval_ok(r1, 0.5), {"attack_speed": _guan().attack_speed, "hits": r1.hits, "dmax": r1.dmax})

	# R16-2：戰鬥中升到 Lv2（update_team）：0.5 × (1 − 0.2) = 0.4
	main._on_payload_received({"type": "update_team", "team_list": [_r16_guan(2)]})
	var as2: float = _guan().attack_speed
	await _wait(0.6)
	var r2: Dictionary = await _r16_hits(e, 2.0)
	_check("R16-2 戰鬥中升到 Lv2（update_team）：攻擊間隔 0.4 秒（0.5 × (1 − 0.2)），實際間隔相符", is_equal_approx(as2, 0.4) and _r16_interval_ok(r2, 0.4), {"attack_speed": as2, "hits": r2.hits, "dmax": r2.dmax})

	# R16-3：同一個等級重複 update_team 三次：仍是 0.4（從設定重新計算，不在目前的值上再乘）
	for i in range(3):
		main._on_payload_received({"type": "update_team", "team_list": [_r16_guan(2)]})
	await _wait(0.5)
	var r3: Dictionary = await _r16_hits(e, 1.6)
	_check("R16-3 同一個等級重複 update_team 三次：攻擊間隔仍是 0.4 秒（不疊算），實際間隔相符", is_equal_approx(_guan().attack_speed, 0.4) and _r16_interval_ok(r3, 0.4), {"attack_speed": _guan().attack_speed, "hits": r3.hits})

	# R16-4：升到 Lv3：0.5 × (1 − 0.4) = 0.3
	main._on_payload_received({"type": "update_team", "team_list": [_r16_guan(3)]})
	await _wait(0.5)
	var r4: Dictionary = await _r16_hits(e, 1.6)
	_check("R16-4 升到 Lv3：攻擊間隔 0.3 秒，實際間隔相符", is_equal_approx(_guan().attack_speed, 0.3) and _r16_interval_ok(r4, 0.3), {"attack_speed": _guan().attack_speed, "hits": r4.hits})

	# R16-5：下限 0.1 秒：成長 0.6、直接以 Lv3 放置（初始化）→ 0.5 × (1 − 1.2) < 0.1 → 0.1；再升到 Lv5 仍是 0.1
	_load(_r16_payload("r16-b1", [_r16_guan(3)], {"atk_spd_growth": 0.6}))
	_r12_place("guan_yu", Vector2i(3, 4))
	_bm().player_start_battle()
	var e5: Node = await _r14_enemy()
	_r14_put(e5, _guan(), 1.0)
	await _wait(0.3)
	var r5: Dictionary = await _r16_hits(e5, 1.0)
	var as5: float = _guan().attack_speed
	main._on_payload_received({"type": "update_team", "team_list": [_r16_guan(5)]})
	_check("R16-5 下限：成長 0.6 的 Lv3 攻擊間隔是 0.1 秒（不會變成 0 或負數），實際間隔相符；升到 Lv5 仍是 0.1", is_equal_approx(as5, 0.1) and _r16_interval_ok(r5, 0.1) and is_equal_approx(_guan().attack_speed, 0.1), {"lv3": as5, "lv5": _guan().attack_speed, "hits": r5.hits, "dmax": r5.dmax})

	# R16-6：初始化與 update_team 一致：直接以 Lv2 放置 → 0.4（和 R16-2 升級後相同）
	_load(_r16_payload("r16-c1", [_r16_guan(2)], {"atk_spd_growth": 0.2}))
	_r12_place("guan_yu", Vector2i(3, 4))
	_check("R16-6 直接以 Lv2 放置（初始化）：攻擊間隔 0.4 秒，和戰鬥中升到 Lv2 相同", _guan() != null and is_equal_approx(_guan().attack_speed, 0.4), _guan().attack_speed if _guan() else null)

	# R16-7：Godot 只讀 atk_spd_growth：只有 speed_growth（正式設定的名稱）時沒有成長。
	# 正式設定由 Web 在進入 store 時正規化（store R16-A3、A4；瀏覽器 r16-web.js），這一項記錄兩邊的分工
	_load(_r16_payload("r16-d1", [_r16_guan(2)], {"speed_growth": 0.2}))
	_r12_place("guan_yu", Vector2i(3, 4))
	_check("R16-7 Godot 只讀 atk_spd_growth：設定只有 speed_growth 時 Lv2 仍是 0.5 秒（別名由 Web 正規化）", _guan() != null and is_equal_approx(_guan().attack_speed, 0.5), _guan().attack_speed if _guan() else null)
	_load(_stage_b())

# ── R17：防禦塔目標優先（Round 17）──
# 三個不會移動的敵人同時在塔的射程內：生成順序是 weak、front、tank；路線進度（路點序號 ÷ 路點數）
# 設成 front 0.75、tank 0.5、weak 0.25；血量 front 1000、tank 5000、weak 300。
# 「優先前方」打 front、「血量最多」打 tank、「血量最少」打 weak，用實際的血量下降（或減速）判斷打中誰。
# 塔的攻擊在 _process：時間用遊戲時間（_gt）
func _r17_payload(battle_id: String, waves: int = 1) -> Dictionary:
	var ws: Array = []
	for i in range(waves):
		ws.append([_grp("t_weak", 1, 0.3), _grp("t_front", 1, 0.3), _grp("t_tank", 1, 0.3)])
	var p: Dictionary = _r12_payload("r17_a", ws, battle_id, [_r12_hero("guan_yu", null)])
	# 四個路點：路線進度可以是 0.25、0.5、0.75（兩個路點時同一段路上的敵人進度都相同）
	p["map"]["path_json"]["paths"] = {"path_a": [[0, 5], [4, 5], [8, 5], [13, 5]]}
	return p

func _r17_enemies() -> Dictionary:
	var d: Dictionary = {}
	for c in main.units_layer.get_children():
		if c is Enemy and is_instance_valid(c) and not c.is_queued_for_deletion() and not c.is_dead():
			d[c.enemy_id] = c
	return d

## 敵人放在塔旁邊（off 的單位是格），並設定路線進度
func _r17_place_enemies(tower: Node, es: Dictionary, off: Dictionary) -> void:
	var wp: Dictionary = {"t_front": 3, "t_tank": 2, "t_weak": 1}
	var t: float = float(tower.tile_size)
	for k in es:
		es[k].global_position = tower.global_position + off.get(k, Vector2(20, 20)) * t
		es[k]._wp_index = wp[k]

func _r17_off() -> Dictionary:
	return {"t_front": Vector2(0.6, 0.9), "t_tank": Vector2(-0.6, 0.9), "t_weak": Vector2(0.0, 1.3)}

## 載入這一場、在 (3,4) 放一座塔、開戰，等三個敵人出現後放到射程內
func _r17_start(battle_id: String, tower_type: String, off: Dictionary = {}, waves: int = 1) -> Dictionary:
	_load(_r17_payload(battle_id, waves))
	main._on_web_place_tower({"tower_type": tower_type, "cell_x": 3, "cell_y": 4})
	var tower: Node = main.game_map.get_occupant(Vector2i(3, 4))
	_bm().player_start_battle()
	await _wait_until(func(): return _r17_enemies().size() == 3, 5.0)
	var es: Dictionary = _r17_enemies()
	if tower != null and es.size() == 3:
		_r17_place_enemies(tower, es, off if not off.is_empty() else _r17_off())
	return {"tower": tower, "e": es}

## sec 秒（遊戲時間）內，每種敵人受到的傷害、被打中的時間（相對開始）、最低的移動倍率與疊加減速
func _r17_hits(es: Dictionary, sec: float) -> Dictionary:
	var dmg: Dictionary = {}
	var times: Dictionary = {}
	var last: Dictionary = {}
	var slow: Dictionary = {}
	var stack: Dictionary = {}
	for k in es:
		dmg[k] = 0.0
		times[k] = []
		last[k] = es[k].current_hp if is_instance_valid(es[k]) else 0.0
		slow[k] = 1.0
		stack[k] = 0.0
	var t0: float = _gt()
	var wall_end: int = Time.get_ticks_msec() + int(sec * 4000.0) + 10000
	while _gt() < t0 + sec and Time.get_ticks_msec() < wall_end:
		await process_frame
		for k in es:
			# 先檢查再指定：已釋放（死亡後移除）的敵人不能指定給有型別的變數
			if not is_instance_valid(es[k]):
				continue
			var e: Node = es[k]
			if e.current_hp < float(last[k]) - 0.001:
				dmg[k] = float(dmg[k]) + float(last[k]) - e.current_hp
				times[k].append(snappedf(_gt() - t0, 0.001))
			last[k] = e.current_hp
			slow[k] = minf(float(slow[k]), e.speed_mult)
			stack[k] = maxf(float(stack[k]), e._stack_slow_amount)
	return {"dmg": dmg, "times": times, "slow": slow, "stack": stack}

## 只有 kind 受到傷害（其他敵人沒有）
func _r17_only(r: Dictionary, kind: String) -> bool:
	for k in r.dmg:
		if (k == kind) != (float(r.dmg[k]) > 0.0):
			return false
	return true

func _r17_cmd(tower: Node, mode: String, bid: String = "", uid: String = "") -> void:
	main._on_payload_received({"type": "set_tower_target", "battle_id": bid if bid != "" else _bm().battle_id, "tower_uid": uid if uid != "" else tower.tower_uid, "mode": mode})

## 等到這座塔打中任何一個敵人的那一幀，回傳那一幀的遊戲時間 t 與那一幀的長度 dt（沒有等到時 t 是 -1）
func _r17_wait_hit(es: Dictionary, timeout: float = 3.0) -> Dictionary:
	var last: Dictionary = {}
	for k in es:
		last[k] = es[k].current_hp if is_instance_valid(es[k]) else 0.0
	var g_end: float = _gt() + timeout
	var wall_end: int = Time.get_ticks_msec() + 20000
	var prev: float = _gt()
	while _gt() < g_end and Time.get_ticks_msec() < wall_end:
		prev = _gt()
		await process_frame
		for k in es:
			if is_instance_valid(es[k]) and es[k].current_hp < float(last[k]) - 0.001:
				return {"t": _gt(), "dt": _gt() - prev}
	return {"t": -1.0, "dt": 0.0}

func _r17_tower_target_cases() -> void:
	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	# 和正式的 WebBridge 一樣：rec 收到 Web 的 JSON 後，不認得的類型交給 Main 的 payload 處理
	rec.payload_received.connect(main._on_payload_received)

	# R17-1：新放置的弓兵塔預設「優先前方」；面板帶這座塔的識別碼、這一場的 battle_id 與實際模式
	var s: Dictionary = await _r17_start("r17-a1", "archer")
	var tw: Node = s.tower
	var es: Dictionary = s.e
	if tw == null or es.size() != 3:
		_check("R17 前置：放置弓兵塔並等到三個敵人", false, {"tower": tw, "enemies": es.keys()})
		main.web_bridge = original
		rec.free()
		return
	main._on_tower_clicked(tw)
	var panel1: Dictionary = rec.sent_panels.back() if not rec.sent_panels.is_empty() else {}
	var r1: Dictionary = await _r17_hits(es, 1.7)
	_check("R17-1 預設「優先前方」：面板帶塔的識別碼、這一場的 battle_id 與實際模式 first；三個敵人都在射程內時只打路線進度最高的 front（生成順序 weak 在前，不是取第一個候選）", tw.target_mode == "first" and panel1.get("tower_uid") == tw.tower_uid and tw.tower_uid != "" and panel1.get("battle_id") == "r17-a1" and panel1.get("target_mode") == "first" and _r17_only(r1, "t_front"), {"panel": panel1, "dmg": r1.dmg})

	# R17-2：切換不偷跑冷卻：看到一擊的那一幀（剛設回 0.8 秒）立刻經由橋接的 JSON 切到「血量最多」，
	# 下一擊仍在 0.8 秒到 0.8 秒＋一幀之後，打的是 tank；Godot 回傳實際模式；金幣、攻擊力、射程、等級不變
	var gold0: int = _bm().battle_gold
	var atk0: float = tw.atk
	var range0: float = tw.range_tiles
	var hit_a: Dictionary = await _r17_wait_hit(es)
	rec._on_js_message([JSON.stringify({"__godot_bridge": true, "type": "set_tower_target", "battle_id": "r17-a1", "tower_uid": tw.tower_uid, "mode": "strongest"})])
	var reply2: Dictionary = rec.sent_tower_targets.back() if not rec.sent_tower_targets.is_empty() else {}
	var tank_hp0: float = es.t_tank.current_hp
	var hit_b: Dictionary = await _r17_wait_hit(es)
	# 攻擊只會發生在某一幀：間隔在 0.8 秒−看到第一擊那一幀的長度（冷卻保留零頭）到 0.8 秒＋看到第二擊那一幀的長度之間
	var itv: float = float(hit_b.t) - float(hit_a.t)
	var r2: Dictionary = await _r17_hits(es, 1.7)
	_check("R17-2 切換到「血量最多」：Godot 回傳 {battle_id, tower_uid, target_mode: strongest}；切換不重置冷卻（下一擊間隔在 0.8 秒的前後一幀內）、不額外攻擊；之後只打 tank；金幣、攻擊力、射程、等級不變", reply2.get("battle_id") == "r17-a1" and reply2.get("tower_uid") == tw.tower_uid and reply2.get("target_mode") == "strongest" and tw.target_mode == "strongest" and float(hit_a.t) > 0.0 and float(hit_b.t) > 0.0 and itv >= 0.8 - float(hit_a.dt) - 0.0005 and itv <= 0.8 + float(hit_b.dt) + 0.0005 and es.t_tank.current_hp < tank_hp0 and _r17_only(r2, "t_tank") and _bm().battle_gold == gold0 and is_equal_approx(tw.atk, atk0) and is_equal_approx(tw.range_tiles, range0) and tw.tower_level == 1, {"reply": reply2, "interval": itv, "frame": hit_b.dt, "dmg": r2.dmg})

	# R17-3：「血量最少」只打 weak
	_r17_cmd(tw, "weakest")
	await _r17_wait_hit(es)
	var r3: Dictionary = await _r17_hits(es, 1.7)
	_check("R17-3 切換到「血量最少」：之後只打 weak（當下血量最少）", tw.target_mode == "weakest" and _r17_only(r3, "t_weak"), r3.dmg)

	# R17-4：每次攻擊都依「當下」血量重新挑選：「血量最多」時把 tank 的血量降到 500（最大血量仍是 5000，幾擊內不會死），
	# 之後改打 front（1000）。比的若是最大血量，會繼續打 tank
	_r17_cmd(tw, "strongest")
	es.t_tank.current_hp = 500.0
	await _r17_wait_hit(es)
	var r4: Dictionary = await _r17_hits(es, 1.7)
	_check("R17-4 依當下血量重新挑選：「血量最多」時 tank 的血量降到 500（最大血量 5000），之後改打 front（1000）", _r17_only(r4, "t_front"), r4.dmg)
	_load(_stage_b())

	# R17-5：平手：「血量最少」時 weak 與 front 都是 400 → 看路線進度（front 0.75 > weak 0.25）；
	# 進度也相同時維持候選的原順序（生成順序 weak 在前）
	s = await _r17_start("r17-b1", "archer")
	tw = s.tower
	es = s.e
	main._on_tower_clicked(tw)
	_r17_cmd(tw, "weakest")
	# 設好血量後直接記錄：決定打誰的是設定後的第一擊（之後被打的那個血量更少，仍是同一個）
	await _r17_wait_hit(es)
	es.t_weak.current_hp = 400.0
	es.t_front.current_hp = 400.0
	var r5a: Dictionary = await _r17_hits(es, 0.9)
	await _r17_wait_hit(es)
	es.t_weak.current_hp = 400.0
	es.t_front.current_hp = 400.0
	# 剩餘路程也相同：front 放到 weak 的位置、同一段路（前往同一個路點）
	es.t_front._wp_index = 1
	es.t_front.global_position = es.t_weak.global_position
	var r5b: Dictionary = await _r17_hits(es, 0.9)
	_check("R17-5 平手：血量相同時打剩餘路程較短的 front；剩餘路程也相同（同一個位置、同一段路）時維持原順序（weak）", float(r5a.dmg.t_front) > 0.0 and float(r5a.dmg.t_weak) == 0.0 and float(r5b.dmg.t_weak) > 0.0 and float(r5b.dmg.t_front) == 0.0, {"a": r5a.dmg, "b": r5b.dmg})

	# R17-6：射程外、死亡、沒有目標：weak 移到射程外 → 改打 front；front 死亡 → 改打 tank；
	# 三個都不在射程內 → 不攻擊；tank 回到射程內 → 繼續攻擊
	es.t_front._wp_index = 3
	es.t_weak.global_position = tw.global_position + Vector2(8.0, 0.0) * float(tw.tile_size)
	await _r17_wait_hit(es)
	var r6a: Dictionary = await _r17_hits(es, 0.9)
	es.t_front.take_damage(99999.0)
	await _r17_wait_hit(es)
	var r6b: Dictionary = await _r17_hits(es, 0.9)
	es.t_tank.global_position = tw.global_position + Vector2(-8.0, 0.0) * float(tw.tile_size)
	var r6c: Dictionary = await _r17_hits(es, 1.7)
	es.t_tank.global_position = tw.global_position + Vector2(0.0, 1.0) * float(tw.tile_size)
	var r6d: Dictionary = await _r17_hits(es, 1.0)
	_check("R17-6 只選射程內活著的敵人：weak 在射程外時打 front；front 死亡後打 tank；沒有目標時不攻擊；回到射程內繼續", _r17_only(r6a, "t_front") and float(r6b.dmg.t_tank) > 0.0 and float(r6b.dmg.t_weak) == 0.0 and float(r6c.dmg.t_tank) == 0.0 and float(r6c.dmg.t_weak) == 0.0 and float(r6d.dmg.t_tank) > 0.0, {"a": r6a.dmg, "b": r6b.dmg, "none": r6c.dmg, "back": r6d.dmg})
	_load(_stage_b())

	# R17-7：砲兵塔只改主要目標，範圍傷害照舊：weak 與 front 相距 0.5 格（範圍 80 像素內），tank 在另一側。
	# 「血量最少」→ 主要目標 weak，weak 與 front 各受 80；「血量最多」→ 主要目標 tank，只有 tank 受傷
	var art_off: Dictionary = {"t_weak": Vector2(-1.8, 0.0), "t_front": Vector2(-1.8, 0.5), "t_tank": Vector2(1.8, 0.0)}
	s = await _r17_start("r17-c1", "artillery", art_off)
	tw = s.tower
	es = s.e
	main._on_tower_clicked(tw)
	_r17_cmd(tw, "weakest")
	await _r17_wait_hit(es, 4.0)
	var r7a: Dictionary = await _r17_hits(es, 3.1)
	_r17_cmd(tw, "strongest")
	await _r17_wait_hit(es, 4.0)
	var r7b: Dictionary = await _r17_hits(es, 3.1)
	_check("R17-7 砲兵塔：主要目標依模式（最少→weak、最多→tank），範圍傷害照舊（weak 為主時 front 也受 80）", float(r7a.dmg.t_weak) > 0.0 and is_equal_approx(float(r7a.dmg.t_weak), float(r7a.dmg.t_front)) and float(r7a.dmg.t_tank) == 0.0 and _r17_only(r7b, "t_tank"), {"weakest": r7a.dmg, "strongest": r7b.dmg, "aoe_px": tw.aoe_radius, "tile": tw.tile_size})
	_load(_stage_b())

	# R17-8：文士塔的減速跟著主要目標：「血量最多」→ 只有 tank 有疊加減速
	s = await _r17_start("r17-d1", "scholar")
	tw = s.tower
	es = s.e
	main._on_tower_clicked(tw)
	_r17_cmd(tw, "strongest")
	var r8: Dictionary = await _r17_hits(es, 1.5)
	_check("R17-8 文士塔：「血量最多」時只有 tank 被疊加減速（沒有傷害）", float(r8.stack.t_tank) > 0.0 and float(r8.stack.t_front) == 0.0 and float(r8.stack.t_weak) == 0.0, {"stack": r8.stack, "dmg": r8.dmg})
	_load(_stage_b())

	# R17-9：步兵塔：傷害打「血量最少」的 weak；緩速光環照舊作用於射程內所有敵人（不因模式改變）
	s = await _r17_start("r17-e1", "infantry", {"t_front": Vector2(0.5, 0.9), "t_tank": Vector2(-0.5, 0.9), "t_weak": Vector2(0.0, 1.3)})
	tw = s.tower
	es = s.e
	main._on_tower_clicked(tw)
	_r17_cmd(tw, "weakest")
	await _r17_wait_hit(es, 3.0)
	var r9: Dictionary = await _r17_hits(es, 3.2)
	_check("R17-9 步兵塔：傷害只打 weak；緩速光環照舊作用於射程內三個敵人", _r17_only(r9, "t_weak") and float(r9.slow.t_weak) < 1.0 and float(r9.slow.t_front) < 1.0 and float(r9.slow.t_tank) < 1.0, {"dmg": r9.dmg, "slow": r9.slow})
	_load(_stage_b())

	# R17-10：騎兵塔：「血量最少」只打 weak
	s = await _r17_start("r17-e2", "cavalry")
	tw = s.tower
	es = s.e
	main._on_tower_clicked(tw)
	_r17_cmd(tw, "weakest")
	await _r17_wait_hit(es, 3.0)
	var r10: Dictionary = await _r17_hits(es, 2.5)
	_check("R17-10 騎兵塔：「血量最少」只打 weak", _r17_only(r10, "t_weak"), r10.dmg)
	_load(_stage_b())

	# R17-11：每座塔獨立；升級、關閉再開啟面板、跨波都保留
	s = await _r17_start("r17-f1", "archer", {}, 2)
	tw = s.tower
	es = s.e
	main._on_web_place_tower({"tower_type": "archer", "cell_x": 6, "cell_y": 4})
	var tw2: Node = main.game_map.get_occupant(Vector2i(6, 4))
	main._on_tower_clicked(tw)
	_r17_cmd(tw, "weakest")
	var n_panels: int = rec.sent_panels.size()
	main._on_web_upgrade_unit()
	var up_panel: Dictionary = rec.sent_panels.back() if rec.sent_panels.size() > n_panels else {}
	main._deselect_unit()
	main._on_tower_clicked(tw)
	var reopen: Dictionary = rec.sent_panels.back()
	# 打倒第一波，手動開第二波：同一座塔仍是「血量最少」
	for k in es:
		es[k].take_damage(999999.0)
	await _wait_until(func(): return _bm().game_state == BattleManager.GameState.PREP, 3.0)
	_bm().player_start_battle()
	await _wait_until(func(): return _r17_enemies().size() == 3, 5.0)
	var es2: Dictionary = _r17_enemies()
	if es2.size() == 3:
		_r17_place_enemies(tw, es2, _r17_off())
	await _r17_wait_hit(es2)
	var r11: Dictionary = await _r17_hits(es2, 1.5)
	_check("R17-11 每座塔獨立（第二座仍是 first）；升級後 Lv2 仍是「血量最少」、面板帶實際模式；關閉再開啟仍是；第二波仍只打 weak", tw2 != null and tw2.target_mode == "first" and tw2.tower_uid != tw.tower_uid and tw.tower_level == 2 and up_panel.get("target_mode") == "weakest" and reopen.get("target_mode") == "weakest" and _bm().current_wave == 2 and es2.size() == 3 and float(r11.dmg.get("t_weak", 0.0)) > 0.0 and float(r11.dmg.get("t_tank", 0.0)) == 0.0, {"tw2": tw2.target_mode if tw2 else null, "level": tw.tower_level, "up_panel": up_panel.get("target_mode"), "reopen": reopen.get("target_mode"), "wave": _bm().current_wave, "dmg": r11.dmg})

	# R17-12：新的一場：舊塔移除，新放置的塔從「優先前方」開始；上一場的命令不套用、不回覆
	var old_uid: String = tw.tower_uid
	s = await _r17_start("r17-g1", "archer")
	tw = s.tower
	es = s.e
	main._on_tower_clicked(tw)
	var n_reply: int = rec.sent_tower_targets.size()
	_r17_cmd(tw, "weakest", "r17-f1")
	_r17_cmd(tw, "weakest", "", old_uid)
	_check("R17-12 新的一場：新塔是 first、識別碼不同；上一場的 battle_id 或舊塔的識別碼送來的命令都不套用、不回覆", tw.target_mode == "first" and tw.tower_uid != old_uid and rec.sent_tower_targets.size() == n_reply, {"mode": tw.target_mode, "uid": tw.tower_uid, "old": old_uid, "replies": rec.sent_tower_targets.size() - n_reply})

	# R17-13：錯誤的命令一律不套用、不回覆：另一座塔的識別碼、不認得的模式、沒有選取、選取的是武將、這一場結束之後
	main._on_web_place_tower({"tower_type": "archer", "cell_x": 6, "cell_y": 4})
	var tw_b: Node = main.game_map.get_occupant(Vector2i(6, 4))
	main._on_tower_clicked(tw)
	n_reply = rec.sent_tower_targets.size()
	_r17_cmd(tw, "weakest", "", tw_b.tower_uid)
	_r17_cmd(tw, "closest")
	main._deselect_unit()
	_r17_cmd(tw, "weakest")
	_r12_place("guan_yu", Vector2i(8, 4))
	var guan: Node = main._placed_heroes.get("guan_yu")
	if guan != null:
		main._on_hero_clicked(guan)
	_r17_cmd(tw, "weakest")
	var mid_ok: bool = tw.target_mode == "first" and tw_b.target_mode == "first" and rec.sent_tower_targets.size() == n_reply
	main._on_tower_clicked(tw)
	for k in es:
		if is_instance_valid(es[k]):
			es[k].take_damage(999999.0)
	await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 3.0)
	_r17_cmd(tw, "weakest")
	_check("R17-13 錯誤的命令不套用、不回覆：另一座塔的識別碼、不認得的模式、沒有選取、選取的是武將、這一場結束（RESULT）之後", mid_ok and guan != null and _bm().game_state == BattleManager.GameState.RESULT and tw.target_mode == "first" and tw_b.target_mode == "first" and rec.sent_tower_targets.size() == n_reply, {"mode": [tw.target_mode, tw_b.target_mode], "replies": rec.sent_tower_targets.size() - n_reply, "state": _bm().game_state})

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── R18：備戰拆除防禦塔（Round 18）──
# 命令一律經過真實的 JSON 路徑（rec._on_js_message），和 Web 送來的一樣（數字是 float）。
# 返還＝floor(這座塔已實際支付的建造＋成功升級費用 × 0.5)，只有 PREP 能拆
## 還在場上（沒有被釋放、仍在場景樹裡）：錯誤的實作可能提早釋放節點，不能直接對它呼叫方法
func _alive(n: Variant) -> bool:
	return is_instance_valid(n) and n.is_inside_tree()

func _r18_sell(rec: Node, uid: String, expected: Variant, bid: String = "") -> Dictionary:
	var d: Dictionary = {"__godot_bridge": true, "type": "sell_tower", "battle_id": bid if bid != "" else _bm().battle_id, "tower_uid": uid}
	if expected != null:
		d["expected_refund"] = expected
	var n: int = rec.sent_sells.size()
	rec._on_js_message([JSON.stringify(d)])
	return rec.sent_sells.back() if rec.sent_sells.size() > n else {}

func _r18_upgrade(rec: Node) -> void:
	rec._on_js_message([JSON.stringify({"__godot_bridge": true, "type": "request_upgrade"})])

func _r18_build(type_key: String, cell: Vector2i) -> Node:
	main._on_web_place_tower({"tower_type": type_key, "cell_x": cell.x, "cell_y": cell.y})
	return main.game_map.get_occupant(cell)

## 選取這座塔，回傳面板送出的資料
func _r18_panel(rec: Node, tw: Node) -> Dictionary:
	main._on_tower_clicked(tw)
	return rec.sent_panels.back() if not rec.sent_panels.is_empty() else {}

func _r18_sell_cases() -> void:
	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)
	# 升級命令（request_upgrade）在正式的 WebBridge 是另一個信號，Main 在 _ready 接的是原本的橋接，這裡也接上
	rec.upgrade_unit_requested.connect(main._on_web_upgrade_unit)

	# R18-1：五種塔各建一座（備戰中）：投入＝建造費、面板的返還＝一半；逐一拆除：金幣剛好加回返還、格子釋放、節點立即移出場景、面板關閉；擊殺數不變
	_load(_r17_payload("r18-a1"))
	var types: Array = ["archer", "infantry", "artillery", "cavalry", "scholar"]
	var costs: Dictionary = {"archer": 50, "infantry": 70, "artillery": 100, "cavalry": 120, "scholar": 80}
	var g0: int = _bm().battle_gold
	var towers: Array = []
	var build_ok: bool = true
	for i in range(types.size()):
		var g_before: int = _bm().battle_gold
		var tw: Node = _r18_build(types[i], Vector2i(i + 1, 4))
		towers.append(tw)
		build_ok = build_ok and tw != null and tw.invested_gold == int(costs[types[i]]) and _bm().battle_gold == g_before - int(costs[types[i]])
	var rows: Array = []
	var sell_ok: bool = true
	for i in range(towers.size()):
		var tw: Node = towers[i]
		var cost: int = int(costs[types[i]])
		var panel: Dictionary = _r18_panel(rec, tw)
		var hides: int = rec.sent_hides
		var g_before: int = _bm().battle_gold
		var reply: Dictionary = _r18_sell(rec, tw.tower_uid, float(panel.get("sell_refund", -1)))
		var refund: int = floori(float(cost) / 2.0)
		rows.append({"type": types[i], "panel_refund": panel.get("sell_refund"), "invested": panel.get("invested_gold"), "can_sell": panel.get("can_sell"), "reply": reply, "gold": _bm().battle_gold - g_before, "in_tree": tw.is_inside_tree(), "hide": rec.sent_hides - hides})
		sell_ok = sell_ok and int(panel.get("sell_refund", -1)) == refund and int(panel.get("invested_gold", -1)) == cost and panel.get("can_sell") == true and reply.get("ok") == true and int(reply.get("refund", -1)) == refund and _bm().battle_gold - g_before == refund and not tw.is_inside_tree() and main.game_map.get_occupant(Vector2i(i + 1, 4)) == null and rec.sent_hides - hides >= 1 and main._selected_unit == null
	_check("R18-1 五種塔：投入＝建造費（50／70／100／120／80）、返還＝一半（25／35／50／60／40）；備戰中拆除後金幣剛好加回返還、格子釋放、節點立即移出場景、面板關閉；擊殺數仍是 0", build_ok and sell_ok and _bm().kills == 0 and _bm().battle_gold == g0 - 420 + 210, {"rows": rows, "gold": [g0, _bm().battle_gold], "kills": _bm().kills})

	# R18-2：弓兵升到 Lv3（50＋50＋100＝200，返還 100）；金幣不足的升級失敗、不計入；升到 Lv5 後再要求升級不會免費升到 Lv6
	var ar: Node = _r18_build("archer", Vector2i(1, 4))
	_r18_panel(rec, ar)
	_r18_upgrade(rec)
	_r18_upgrade(rec)
	var lv3: Dictionary = {"level": ar.tower_level, "invested": ar.invested_gold, "refund": ar.get_sell_refund(), "panel": rec.sent_panels.back().get("sell_refund")}
	var g_keep: int = _bm().battle_gold
	_bm().battle_gold = 10
	_r18_upgrade(rec)
	var failed: Dictionary = {"level": ar.tower_level, "invested": ar.invested_gold, "gold": _bm().battle_gold}
	_bm().battle_gold = g_keep
	_r18_upgrade(rec)
	_r18_upgrade(rec)
	var g_max: int = _bm().battle_gold
	_r18_upgrade(rec)
	var capped: Dictionary = {"level": ar.tower_level, "invested": ar.invested_gold, "gold": _bm().battle_gold - g_max}
	var reply2: Dictionary = _r18_sell(rec, ar.tower_uid, float(ar.get_sell_refund()))
	_check("R18-2 弓兵 Lv3 共支付 200、返還 100（面板也是 100）；金幣不足的升級失敗：等級與投入不變；Lv5（支付 550）後再要求升級：仍是 Lv5、不扣金幣、投入不變；拆除返還 275", lv3.level == 3 and lv3.invested == 200 and lv3.refund == 100 and int(lv3.panel) == 100 and failed.level == 3 and failed.invested == 200 and failed.gold == 10 and capped.level == 5 and capped.invested == 550 and capped.gold == 0 and reply2.get("ok") == true and int(reply2.get("refund", -1)) == 275, {"lv3": lv3, "failed": failed, "capped": capped, "reply": reply2})

	# R18-3：文士 80＋首次升級 75＝155，返還 77（奇數向下取整）
	var sc: Node = _r18_build("scholar", Vector2i(2, 4))
	_r18_panel(rec, sc)
	_r18_upgrade(rec)
	var g3: int = _bm().battle_gold
	var p3: Dictionary = rec.sent_panels.back()
	var reply3: Dictionary = _r18_sell(rec, sc.tower_uid, float(p3.get("sell_refund", -1)))
	_check("R18-3 文士 80＋75＝155：面板與實際返還都是 77（向下取整）", sc.invested_gold == 155 and int(p3.get("sell_refund", -1)) == 77 and reply3.get("ok") == true and int(reply3.get("refund", -1)) == 77 and _bm().battle_gold - g3 == 77, {"invested": sc.invested_gold, "panel": p3.get("sell_refund"), "reply": reply3, "gold": _bm().battle_gold - g3})

	# R18-4：兩塔獨立：A 升級並改成「血量最少」、拆 A；B 的等級、模式、投入、占格都不變，金幣只加 A 的返還
	var ta: Node = _r18_build("archer", Vector2i(3, 4))
	var tb: Node = _r18_build("cavalry", Vector2i(4, 4))
	_r18_panel(rec, ta)
	_r18_upgrade(rec)
	_r17_cmd(ta, "weakest")
	var g4: int = _bm().battle_gold
	var reply4: Dictionary = _r18_sell(rec, ta.tower_uid, float(ta.get_sell_refund()))
	_check("R18-4 兩塔獨立：拆 A（投入 100、返還 50）後，B 仍是 Lv1、first、投入 120、占著 (4,4)；金幣只加 50", reply4.get("ok") == true and _bm().battle_gold - g4 == 50 and _alive(tb) and tb.tower_level == 1 and tb.target_mode == "first" and tb.invested_gold == 120 and main.game_map.get_occupant(Vector2i(4, 4)) == tb, {"reply": reply4, "gold": _bm().battle_gold - g4, "b": [tb.tower_level, tb.target_mode, tb.invested_gold] if _alive(tb) else null})

	# R18-5：重複命令：同一座塔連送兩次拆除，只返還一次（第二次回覆不成功）；原格重建是新的塔（新識別碼、Lv1、first、投入＝建造費），舊識別碼的命令不能拆掉它
	var td: Node = _r18_build("archer", Vector2i(5, 4))
	var old_uid: String = td.tower_uid
	_r18_panel(rec, td)
	var g5: int = _bm().battle_gold
	var r5a: Dictionary = _r18_sell(rec, old_uid, 25.0)
	var r5b: Dictionary = _r18_sell(rec, old_uid, 25.0)
	var once: int = _bm().battle_gold - g5
	var tn: Node = _r18_build("archer", Vector2i(5, 4))
	_r18_panel(rec, tn)
	var g5b: int = _bm().battle_gold
	var r5c: Dictionary = _r18_sell(rec, old_uid, 25.0)
	_check("R18-5 連送兩次只返還一次（第二次 not_selected）；原格重建：新識別碼、Lv1、first、投入 50；舊識別碼的延遲命令不拆新塔、不退款", r5a.get("ok") == true and r5b.get("ok") == false and r5b.get("reason") == "not_selected" and once == 25 and tn != null and tn.tower_uid != old_uid and tn.tower_level == 1 and tn.target_mode == "first" and tn.invested_gold == 50 and r5c.get("ok") == false and _bm().battle_gold == g5b and main.game_map.get_occupant(Vector2i(5, 4)) == tn, {"a": r5a, "b": r5b, "once": once, "new": [tn.tower_uid, old_uid], "c": r5c})

	# R18-6：拒絕（金幣、塔、投入都不變，回覆原因）：別場的 battle_id、另一座塔、返還金額不符（少 1、Web 自己填的大金額、沒有帶、非整數）、沒有選取、選取的是武將
	var te: Node = _r18_build("archer", Vector2i(6, 4))
	var g6: int = _bm().battle_gold
	_r18_panel(rec, te)
	var n_panels: int = rec.sent_panels.size()
	var hides6: int = rec.sent_hides
	var r6: Dictionary = {}
	r6["stale"] = _r18_sell(rec, te.tower_uid, 25.0, "r18-old")
	r6["other"] = _r18_sell(rec, tn.tower_uid, 25.0)
	r6["less"] = _r18_sell(rec, te.tower_uid, 24.0)
	r6["forged"] = _r18_sell(rec, te.tower_uid, 9999.0)
	r6["missing"] = _r18_sell(rec, te.tower_uid, null)
	r6["fraction"] = _r18_sell(rec, te.tower_uid, 25.5)
	# 拒絕時不重送面板（不會先隱藏再顯示）；是這座塔時回覆帶現在的返還金額 25 與 can_sell，別座塔時 refund 是 -1
	var refreshed: bool = rec.sent_panels.size() == n_panels and rec.sent_hides == hides6 and int(r6.less.get("refund", -1)) == 25 and int(r6.forged.get("refund", -1)) == 25 and r6.less.get("can_sell") == true and int(r6.other.get("refund", 0)) == -1
	main._deselect_unit()
	r6["none"] = _r18_sell(rec, te.tower_uid, 25.0)
	_r12_place("guan_yu", Vector2i(8, 4))
	var guan: Node = main._placed_heroes.get("guan_yu")
	if guan != null:
		main._on_hero_clicked(guan)
	r6["hero"] = _r18_sell(rec, te.tower_uid, 25.0)
	var reasons: Dictionary = {}
	var all_rejected: bool = true
	for k in r6:
		reasons[k] = [r6[k].get("ok"), r6[k].get("reason")]
		all_rejected = all_rejected and r6[k].get("ok") == false
	_check("R18-6 拒絕且不改任何狀態：別場 → stale_battle；另一座塔 → not_selected；返還金額少 1、Web 自填 9999、沒有帶、非整數 → refund_changed（不重送面板，回覆帶現在的返還 25）；沒有選取、選取武將 → not_selected", all_rejected and r6.stale.get("reason") == "stale_battle" and r6.other.get("reason") == "not_selected" and r6.less.get("reason") == "refund_changed" and r6.forged.get("reason") == "refund_changed" and r6.missing.get("reason") == "refund_changed" and r6.fraction.get("reason") == "refund_changed" and r6.none.get("reason") == "not_selected" and r6.hero.get("reason") == "not_selected" and refreshed and _bm().battle_gold == g6 and _alive(te) and te.invested_gold == 50 and main.game_map.get_occupant(Vector2i(6, 4)) == te and guan != null, {"reasons": reasons, "refreshed": refreshed, "gold": _bm().battle_gold - g6})

	# R18-7：確認期間升級了（返還 25 → 50）：拿舊金額的命令不拆（refund_changed），面板重送 50；用新金額再確認才拆，返還 50
	_r18_panel(rec, te)
	_r18_upgrade(rec)
	var g7: int = _bm().battle_gold
	var p7: Dictionary = rec.sent_panels.back()
	var r7a: Dictionary = _r18_sell(rec, te.tower_uid, 25.0)
	var mid7: int = _bm().battle_gold - g7
	var r7b: Dictionary = _r18_sell(rec, te.tower_uid, float(r7a.get("refund", -1)))
	_check("R18-7 確認期間升級（返還 25→50，升級時面板已重送 50）：拿舊金額 25 的命令 refund_changed、不退款，回覆帶現在的 50；用 50 再確認才拆、返還 50", r7a.get("ok") == false and r7a.get("reason") == "refund_changed" and int(r7a.get("refund", -1)) == 50 and int(p7.get("sell_refund", -1)) == 50 and mid7 == 0 and r7b.get("ok") == true and _bm().battle_gold - g7 == 50, {"a": r7a, "panel": p7.get("sell_refund"), "b": r7b})

	# R18-8：拆掉的塔立即停止作用：備戰中拆掉弓兵與步兵，開戰後把三個敵人放在原本的位置 2 秒：沒有受傷、沒有被緩速
	_load(_r17_payload("r18-b1"))
	var t8a: Node = _r18_build("archer", Vector2i(3, 4))
	var t8b: Node = _r18_build("infantry", Vector2i(4, 4))
	var pos8: Vector2 = t8a.global_position
	for t in [t8a, t8b]:
		_r18_panel(rec, t)
		_r18_sell(rec, t.tower_uid, float(t.get_sell_refund()))
	_bm().player_start_battle()
	await _wait_until(func(): return _r17_enemies().size() == 3, 5.0)
	var es8: Dictionary = _r17_enemies()
	var r8: Dictionary = {"dmg": {}, "slow": {}}
	if es8.size() == 3:
		var ts: float = float(main._tile_size)
		var offs: Dictionary = _r17_off()
		for k in es8:
			es8[k].global_position = pos8 + offs[k] * ts
		r8 = await _r17_hits(es8, 2.0)
	var none_hit: bool = es8.size() == 3
	for k in r8.dmg:
		none_hit = none_hit and float(r8.dmg[k]) == 0.0 and float(r8.slow[k]) == 1.0
	_check("R18-8 備戰中拆掉的弓兵與步兵立即停止作用：開戰後三個敵人在原本的位置 2 秒，沒有受傷、沒有被緩速", none_hit and not is_instance_valid(t8a) and not is_instance_valid(t8b), r8)

	# R18-9：戰鬥中（BATTLE）不能拆：面板 can_sell 是 false；命令回覆 not_prep、不退款；塔仍在。這一場結束（RESULT）後同樣不能拆
	var t9: Node = _r18_build("archer", Vector2i(6, 4))
	var p9: Dictionary = _r18_panel(rec, t9)
	var g9: int = _bm().battle_gold
	var uid9: String = t9.tower_uid
	var r9: Dictionary = _r18_sell(rec, uid9, float(t9.get_sell_refund()))
	var gold9: int = _bm().battle_gold - g9
	for k in es8:
		if is_instance_valid(es8[k]):
			es8[k].take_damage(999999.0)
	await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 3.0)
	var state9: int = _bm().game_state
	var r9b: Dictionary = _r18_sell(rec, uid9, 25.0)
	_check("R18-9 戰鬥中面板 can_sell=false，拆除命令 not_prep（回覆 can_sell=false）、不退款、塔仍在；這一場結束（RESULT）後同樣 not_prep", p9.get("can_sell") == false and r9.get("ok") == false and r9.get("reason") == "not_prep" and r9.get("can_sell") == false and gold9 == 0 and state9 == BattleManager.GameState.RESULT and r9b.get("ok") == false and r9b.get("reason") == "not_prep" and _alive(t9), {"panel": p9.get("can_sell"), "r9": r9, "state": state9, "r9b": r9b, "gold": gold9})

	# R18-10：拆除不算擊殺、不影響結算：這一場打倒 3 個敵人，結算的 kills 是 3，戰場點數＝3×10＋20×20＋600
	var loots: Array = last_result.get("loots", [])
	var points: int = int(loots[0].get("count", -1)) if not loots.is_empty() else -1
	_check("R18-10 拆除不影響擊殺與結算：kills 3、戰場點數 1030（3×10＋城池 20×20＋三星 600）", last_result.get("battle_id") == "r18-b1" and int(last_result.get("kills", -1)) == 3 and points == 1030, last_result)

	# R18-11：競態：備戰中打開確認後開戰 → not_prep；自動模式清波後、下一波開始前（仍是 BATTLE、等待自動下一波）→ not_prep；下一波開始後 → not_prep
	_load(_r17_payload("r18-c1", 2))
	var t11: Node = _r18_build("archer", Vector2i(3, 4))
	var confirm_refund: int = int(_r18_panel(rec, t11).get("sell_refund", -1))
	var uid11: String = t11.tower_uid
	_bm().player_start_battle()
	var r11a: Dictionary = _r18_sell(rec, uid11, float(confirm_refund))
	await _wait_until(func(): return _r17_enemies().size() == 3, 5.0)
	_bm().toggle_auto_mode()
	for e in _r17_enemies().values():
		e.take_damage(999999.0)
	await _wait_until(func(): return _bm()._auto_wave_pending, 3.0)
	var pending: bool = _bm()._auto_wave_pending and _bm().game_state == BattleManager.GameState.BATTLE
	if _alive(t11):
		_r18_panel(rec, t11)
	var r11b: Dictionary = _r18_sell(rec, uid11, float(confirm_refund))
	await _wait_until(func(): return _bm().current_wave == 2, 4.0)
	var r11c: Dictionary = _r18_sell(rec, uid11, float(confirm_refund))
	_check("R18-11 競態：確認後開戰 → not_prep；自動模式清波後等待下一波（BATTLE）→ not_prep；下一波開始後 → not_prep；塔一直在、沒有退款", r11a.get("reason") == "not_prep" and pending and r11b.get("reason") == "not_prep" and _bm().current_wave == 2 and r11c.get("reason") == "not_prep" and _alive(t11) and t11.invested_gold == 50, {"a": r11a, "pending": pending, "b": r11b, "wave": _bm().current_wave, "c": r11c})

	rec.payload_received.disconnect(main._on_payload_received)
	rec.upgrade_unit_requested.disconnect(main._on_web_upgrade_unit)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── R19：戰鬥速度 1×／2× 與部署選單的暫時慢速 ──
# 倍率只由 BattleManager 寫入：實際倍率＝部署選單開著時 0.1，否則是玩家選的速度（1 或 2）；新的一場與結算時回到 1。
# 命令一律經過真實的 JSON 路徑（_on_js_message，數字是 float）；打開部署選單用 Main._open_deploy_menu（點空格時呼叫的同一個函式，
# 實際的點擊由瀏覽器 r19-web.js 驗證）。比例用物理步進與遊戲時間量，不用牆鐘
const R19_NO_SPEED: String = "__no_speed__"

func _r19_js(rec: Node, d: Dictionary) -> void:
	d["__godot_bridge"] = true
	rec._on_js_message([JSON.stringify(d)])

## 送出速度命令，回傳 Godot 的回覆（沒有回覆時是空字典）；speed 是 R19_NO_SPEED 時不帶 speed 欄位
func _r19_speed(rec: Node, speed: Variant, bid: String = "") -> Dictionary:
	var d: Dictionary = {"type": "set_game_speed", "battle_id": bid if bid != "" else _bm().battle_id}
	if not (speed is String and speed == R19_NO_SPEED):
		d["speed"] = speed
	var n: int = rec.sent_speeds.size()
	_r19_js(rec, d)
	return rec.sent_speeds.back() if rec.sent_speeds.size() > n else {}

## 點了 (c,4) 的建築位：打開部署選單，回傳 Web 收到的 click_cell（沒有打開時是空字典）
func _r19_open(rec: Node, c: int = 2) -> Dictionary:
	var n: int = rec.sent_clicks.size()
	main._open_deploy_menu(Vector2i(c, 4), "build", Vector2(10.0, 10.0))
	return rec.sent_clicks.back() if rec.sent_clicks.size() > n else {}

## Web 關閉部署選單（resume_game）：預設帶這個選單的 battle_id 與編號，可以指定別的值模擬過期命令
func _r19_close(rec: Node, menu: Dictionary, bid: Variant = null, mid: Variant = null) -> void:
	_r19_js(rec, {"type": "resume_game", "battle_id": bid if bid != null else menu.get("battle_id", ""), "menu_id": mid if mid != null else menu.get("menu_id")})

func _r19_state() -> Dictionary:
	return {"ts": Engine.time_scale, "pref": _bm().speed_pref, "menu": _bm().deploy_menu_id, "bid": _bm().battle_id, "state": _bm().game_state}

func _r19_last_stats(rec: Node) -> Dictionary:
	return rec.sent_stats.back() if not rec.sent_stats.is_empty() else {}

func _r19_payload(battle_id: String, waves: Array = [[_grp("a_slow", 3, 2.0)], [_grp("a_slow", 3, 2.0)]]) -> Dictionary:
	return _with_id(_payload("r19_a", waves), battle_id)

## 等不受倍率影響的 sec 秒，回傳這個敵人每個物理步進前進的距離、每秒遊戲時間前進的距離（直線路段）
func _r19_move(e: Node, sec: float) -> Dictionary:
	var tm: SceneTreeTimer = create_timer(sec, true, false, true)
	var x0: float = e.global_position.x
	var g0: float = _pt()
	var f0: int = Engine.get_physics_frames()
	while tm.time_left > 0.0 and is_instance_valid(e):
		await process_frame
	if not is_instance_valid(e):
		return {"steps": 0, "per_step": -1.0, "per_sec": -1.0}
	var steps: int = Engine.get_physics_frames() - f0
	var dx: float = e.global_position.x - x0
	var adv: float = _pt() - g0
	return {"steps": steps, "dx": dx, "per_step": dx / float(steps) if steps > 0 else -1.0, "per_sec": dx / adv if adv > 0.0 else -1.0}

## sec 秒（遊戲時間）內這些敵人每一次受傷的遊戲時間與傷害、期間最長的一幀（遊戲時間）、經過的物理步進
func _r19_hits(es: Array, sec: float) -> Dictionary:
	var last: Dictionary = {}
	for e in es:
		last[e.get_instance_id()] = e.current_hp
	var hits: Array = []
	var t0: float = _gt()
	var prev: float = t0
	var dmax: float = 0.0
	var f0: int = Engine.get_physics_frames()
	var wall_end: int = Time.get_ticks_msec() + int(sec * 4000.0) + 10000
	while _gt() < t0 + sec and Time.get_ticks_msec() < wall_end:
		await process_frame
		dmax = maxf(dmax, _gt() - prev)
		prev = _gt()
		for e in es:
			if not is_instance_valid(e):
				continue
			var id: int = e.get_instance_id()
			if e.current_hp < float(last[id]) - 0.001:
				hits.append({"t": snappedf(_gt() - t0, 0.0001), "dmg": snappedf(float(last[id]) - e.current_hp, 0.01)})
			last[id] = e.current_hp
	return {"hits": hits, "dmax": dmax, "steps": Engine.get_physics_frames() - f0}

## 累積時程（遊戲時間；和 _r16_interval_ok 相同的判定）：每一擊減去 k × 攻擊間隔的差距都在最長的一幀之內
func _r19_interval_ok(r: Dictionary, expect: float) -> bool:
	var ts: Array = []
	for h in r.hits:
		ts.append(float(h.t))
	return _r16_interval_ok({"hits": ts, "dmax": r.dmax}, expect)

## 出兵與自動下一波的時間：載入 battle_id 這一場（兩波，每波 3 隻 c_fast、間隔 1 秒）、切到 speed 倍、開自動，
## 記錄每一次出兵、清波、開始下一波當下的遊戲時間與物理步進，直到結算；dmax 是期間最長的一幀（遊戲時間）
func _r19_spawn_timing(rec: Node, battle_id: String, speed: float) -> Dictionary:
	_load(_with_id(_payload("r19_s", [[_grp("c_fast", 3, 1.0)], [_grp("c_fast", 3, 1.0)]]), battle_id))
	_r19_speed(rec, speed)
	var ev: Dictionary = {"spawn": [], "clear": [], "wave": []}
	var on_spawn := func(_e: Node) -> void:
		ev.spawn.append([_gt(), Engine.get_physics_frames()])
	var on_clear := func(_n: int) -> void:
		ev.clear.append([_gt(), Engine.get_physics_frames()])
	var on_wave := func(cur: int, _t: int) -> void:
		ev.wave.append([_gt(), Engine.get_physics_frames(), cur, Engine.time_scale])
	_wm().enemy_spawned.connect(on_spawn)
	_wm().wave_cleared.connect(on_clear)
	_bm().wave_changed.connect(on_wave)
	_bm().toggle_auto_mode()
	var prev: float = _gt()
	var dmax: float = 0.0
	var wall_end: int = Time.get_ticks_msec() + 30000
	while _bm().game_state != BattleManager.GameState.RESULT and Time.get_ticks_msec() < wall_end:
		await process_frame
		dmax = maxf(dmax, _gt() - prev)
		prev = _gt()
	_wm().enemy_spawned.disconnect(on_spawn)
	_wm().wave_cleared.disconnect(on_clear)
	_bm().wave_changed.disconnect(on_wave)
	var gaps: Array = []
	var gap_steps: Array = []
	for i in [1, 2, 4, 5]:
		if i < ev.spawn.size():
			gaps.append(float(ev.spawn[i][0]) - float(ev.spawn[i - 1][0]))
			gap_steps.append(int(ev.spawn[i][1]) - int(ev.spawn[i - 1][1]))
	var wait: float = -1.0
	var wait_steps: int = -1
	var w2: Array = ev.wave.filter(func(w): return int(w[2]) == 2)
	if not ev.clear.is_empty() and not w2.is_empty():
		wait = float(w2[0][0]) - float(ev.clear[0][0])
		wait_steps = int(w2[0][1]) - int(ev.clear[0][1])
	return {"gaps": gaps, "gap_steps": gap_steps, "wait": wait, "wait_steps": wait_steps, "dmax": dmax, "spawns": ev.spawn.size(), "waves": ev.wave, "result": last_result.get("battle_id") == battle_id}

## 1 倍與 2 倍的同一個固定場景：備戰中蓋弓兵（投入 50）並拆除、再蓋一座；開戰後兩個不會移動、血量 90 的敵人在射程內，
## 弓兵每擊 30 打倒兩個敵人後結算。回傳每一擊的傷害、結算與金幣。
## 每一擊用血量下降記錄（基準是最大血量，開始記錄前的那一擊也算到）；被打倒的那一擊敵人會立刻移除，記成倒下前剩下的血量
func _r19_same_game(rec: Node, battle_id: String, speed: float) -> Dictionary:
	_load(_with_id(_payload("r19_g", [[_grp("r19_soft", 2, 0.3)]]), battle_id))
	_r19_speed(rec, speed)
	var g0: int = _bm().battle_gold
	var t1: Node = _r18_build("archer", Vector2i(1, 4))
	var p1: Dictionary = _r18_panel(rec, t1)
	var sell: Dictionary = _r18_sell(rec, t1.tower_uid, float(p1.get("sell_refund", -1)))
	_r18_build("archer", Vector2i(1, 4))
	main._deselect_unit()
	var ended0: int = battle_ended_count
	_bm().player_start_battle()
	var found: Array = [[]]
	await _wait_until(func():
		found[0] = []
		for c in main.units_layer.get_children():
			if c is Enemy and not c.is_queued_for_deletion():
				found[0].append(c)
		return found[0].size() == 2, 5.0)
	var track: Array = []
	for e in found[0]:
		track.append({"node": e, "last": float(e.max_hp), "done": false})
	var dmgs: Array = []
	var f0: int = Engine.get_physics_frames()
	var t0: float = _gt()
	var wall_end: int = Time.get_ticks_msec() + 30000
	while _bm().game_state != BattleManager.GameState.RESULT and _gt() < t0 + 8.0 and Time.get_ticks_msec() < wall_end:
		await process_frame
		for t in track:
			if t.done:
				continue
			if not is_instance_valid(t.node) or t.node.is_dead():
				dmgs.append(snappedf(float(t.last), 0.01))
				t.done = true
				continue
			var hp: float = t.node.current_hp
			if hp < float(t.last) - 0.001:
				dmgs.append(snappedf(float(t.last) - hp, 0.01))
				t.last = hp
	var steps: int = Engine.get_physics_frames() - f0
	var loots: Array = last_result.get("loots", [])
	return {
		"speed": speed, "sell": sell.get("refund"), "dmgs": dmgs, "kills": last_result.get("kills"),
		"stars": last_result.get("stars_earned"), "points": int(loots[0].get("count", -1)) if not loots.is_empty() else -1,
		"time": last_result.get("time_seconds"), "gold": _bm().battle_gold - g0, "ended": battle_ended_count - ended0,
		"same_battle": last_result.get("battle_id") == battle_id, "steps": steps,
	}

func _r19_speed_cases() -> void:
	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)
	rec.upgrade_unit_requested.connect(main._on_web_upgrade_unit)

	# R19-1：切關：A 開著部署選單（0.1）時載入 B：B 是 1 倍、沒有開著的選單；
	# 2 倍速時同一關重來（新的 battle_id）回到 1 倍；戰鬥中 2 倍並開著選單時載入新的一場也一樣
	_load(_r19_payload("r19-a1"))
	var a_menu: Dictionary = _r19_open(rec)
	var in_menu: Dictionary = _r19_state()
	var slow_stats: Dictionary = _r19_last_stats(rec)
	_load(_r19_payload("r19-b1"))
	var after_b: Dictionary = _r19_state()
	var b_stats: Dictionary = _r19_last_stats(rec)
	_r19_speed(rec, 2.0)
	var at2: float = Engine.time_scale
	_load(_r19_payload("r19-b2"))
	var after_restart: Dictionary = _r19_state()
	_r19_speed(rec, 2.0)
	_bm().player_start_battle()
	_r19_open(rec)
	var battle_menu: Dictionary = _r19_state()
	_load(_r19_payload("r19-b3"))
	var after_battle: Dictionary = _r19_state()
	var ok1: bool = a_menu.get("battle_id") == "r19-a1" and int(a_menu.get("menu_id", 0)) > 0 and in_menu.ts == 0.1 and in_menu.menu == int(a_menu.get("menu_id", -1)) \
		and slow_stats.get("battle_id") == "r19-a1" and slow_stats.get("deploy_slow") == true and slow_stats.get("time_scale") == 0.1 and int(slow_stats.get("speed", -1)) == 1 \
		and after_b.ts == 1.0 and after_b.pref == 1 and after_b.menu == 0 and after_b.bid == "r19-b1" \
		and b_stats.get("battle_id") == "r19-b1" and int(b_stats.get("speed", -1)) == 1 and b_stats.get("time_scale") == 1.0 and b_stats.get("deploy_slow") == false \
		and at2 == 2.0 and after_restart.ts == 1.0 and after_restart.pref == 1 \
		and battle_menu.ts == 0.1 and battle_menu.pref == 2 and battle_menu.state == BattleManager.GameState.BATTLE and after_battle.ts == 1.0 and after_battle.pref == 1 and after_battle.menu == 0
	_check("R19-1 部署慢速與速度不跨場：A 開部署選單（0.1，click_cell 帶 battle_id 與選單編號）→ 載入 B：倍率 1、選擇 1、沒有開著的選單，B 的 stats 也是 1；2 倍時同一關重來回到 1；戰鬥中 2 倍並開著選單時載入新的一場也回到 1", ok1, {"click": a_menu, "in_menu": in_menu, "slow_stats": slow_stats, "after_b": after_b, "b_stats": b_stats, "at2": at2, "restart": after_restart, "battle_menu": battle_menu, "after_battle": after_battle})

	# R19-2：過期的關閉命令不改新場次：C1 開選單後切到 C2（2 倍）並開新選單；C1 的關閉命令、C2 帶較早的選單編號、沒有帶選單編號、
	# 選單編號是字串、完全沒有識別（舊版網頁的命令）都不解除 C2 的慢速；C2 自己的關閉命令才恢復 2 倍；
	# 再送一次同一個關閉命令、再送 C1 的舊命令都不改變（不會被改回 1 倍）
	_load(_r19_payload("r19-c1"))
	var c1m: Dictionary = _r19_open(rec)
	_load(_r19_payload("r19-c2"))
	_r19_speed(rec, 2.0)
	var c2m: Dictionary = _r19_open(rec)
	var seen: Array = []
	_r19_close(rec, c1m)
	seen.append(Engine.time_scale)
	_r19_close(rec, c2m, null, c1m.get("menu_id"))
	seen.append(Engine.time_scale)
	_r19_js(rec, {"type": "resume_game", "battle_id": "r19-c2"})
	seen.append(Engine.time_scale)
	_r19_js(rec, {"type": "resume_game", "battle_id": "r19-c2", "menu_id": str(c2m.get("menu_id"))})
	seen.append(Engine.time_scale)
	_r19_js(rec, {"type": "resume_game"})
	seen.append(Engine.time_scale)
	var still: Dictionary = _r19_state()
	_r19_close(rec, c2m)
	var restored: Dictionary = _r19_state()
	_r19_close(rec, c2m)
	_r19_close(rec, c1m)
	var after_dupe: Dictionary = _r19_state()
	_check("R19-2 過期的關閉命令不改新場次：上一場的關閉、較早的選單編號、沒有編號、編號是字串、沒有任何識別都不解除慢速（仍是 0.1、選單仍開著）；這個選單自己的關閉才恢復 2 倍；重複的關閉與上一場的舊命令之後也不會改回 1 倍",
		seen == [0.1, 0.1, 0.1, 0.1, 0.1] and still.menu == int(c2m.get("menu_id", -1)) and int(c2m.get("menu_id", 0)) > int(c1m.get("menu_id", 0)) and restored.ts == 2.0 and restored.pref == 2 and restored.menu == 0 and after_dupe.ts == 2.0 and after_dupe.pref == 2 and after_dupe.bid == "r19-c2",
		{"seen": seen, "menus": [c1m.get("menu_id"), c2m.get("menu_id")], "still": still, "restored": restored, "after_dupe": after_dupe})

	# R19-3：同一場先後兩個部署選單（第一個還沒關閉就打開第二個）：第一個的關閉命令不解除第二個的慢速；第二個關閉後恢復 2 倍
	_load(_r19_payload("r19-d1"))
	_r19_speed(rec, 2.0)
	var d1: Dictionary = _r19_open(rec, 2)
	var d2: Dictionary = _r19_open(rec, 3)
	_r19_close(rec, d1)
	var mid3: Dictionary = _r19_state()
	_r19_close(rec, d2)
	var end3: Dictionary = _r19_state()
	_check("R19-3 同一場兩個部署選單重疊：舊選單的關閉命令不解除新選單的慢速（仍 0.1、開著的是新選單）；新選單關閉後恢復 2 倍",
		mid3.ts == 0.1 and mid3.menu == int(d2.get("menu_id", -1)) and int(d2.get("menu_id", 0)) > int(d1.get("menu_id", 0)) and end3.ts == 2.0 and end3.menu == 0,
		{"menus": [d1.get("menu_id"), d2.get("menu_id")], "mid": mid3, "end": end3})

	# R19-4：玩家選擇與部署慢速分開記錄：2 倍 → 開選單固定 0.1（不是 0.2）→ 取消回 2 倍；選單開著時選 1 倍：回覆成功、已確認的選擇 1、
	# 實際倍率仍 0.1 → 關閉後 1 倍；選單開著時選回 2 倍 → 關閉後 2 倍
	_load(_r19_payload("r19-e1"))
	var r4a: Dictionary = _r19_speed(rec, 2.0)
	var e1m: Dictionary = _r19_open(rec)
	var e_menu: Dictionary = _r19_state()
	var e_stats: Dictionary = _r19_last_stats(rec)
	_r19_close(rec, e1m)
	var e_back: Dictionary = _r19_state()
	var e2m: Dictionary = _r19_open(rec)
	var r4b: Dictionary = _r19_speed(rec, 1.0)
	var e_mid: Dictionary = _r19_state()
	_r19_close(rec, e2m)
	var e_to1: Dictionary = _r19_state()
	var e3m: Dictionary = _r19_open(rec)
	var r4c: Dictionary = _r19_speed(rec, 2)
	var e_mid2: Dictionary = _r19_state()
	_r19_close(rec, e3m)
	var e_to2: Dictionary = _r19_state()
	_check("R19-4 選擇與部署慢速分開：2 倍時開選單是 0.1（不是 0.2），取消後回 2；選單中選 1 倍：回覆 ok、speed 1、time_scale 0.1，關閉後 1；選單中選回 2 倍：關閉後 2",
		r4a.get("ok") == true and int(r4a.get("speed", -1)) == 2 and r4a.get("time_scale") == 2.0 and e_menu.ts == 0.1 and e_menu.pref == 2 and e_stats.get("time_scale") == 0.1 and int(e_stats.get("speed", -1)) == 2 \
		and e_back.ts == 2.0 and r4b.get("ok") == true and int(r4b.get("speed", -1)) == 1 and r4b.get("time_scale") == 0.1 and e_mid.ts == 0.1 and e_mid.pref == 1 and e_to1.ts == 1.0 \
		and r4c.get("ok") == true and e_mid2.ts == 0.1 and e_to2.ts == 2.0 and e_to2.pref == 2,
		{"r4a": r4a, "menu": e_menu, "stats": e_stats, "back": e_back, "r4b": r4b, "mid": e_mid, "to1": e_to1, "r4c": r4c, "to2": e_to2})

	# R19-5：同一場保留 2 倍：更新隊伍、蓋塔與升級、第 1 波清空回到備戰、自動模式的第 2、3 波開始當下都還是 2；
	# 第 3 波開著部署選單時結算：結算後倍率 1、選擇 1、沒有開著的選單（慢速與加速都不延續到結算畫面）
	_load(_with_id(_payload("r19_f", [[_grp("c_fast", 1, 0.1)], [_grp("c_fast", 1, 0.1)], [_grp("c_fast", 1, 0.1)]]), "r19-f1"))
	_r19_speed(rec, 2.0)
	main._on_payload_received({"type": "update_team", "team_list": []})
	var tw5: Node = _r18_build("archer", Vector2i(2, 4))
	_r18_panel(rec, tw5)
	_r18_upgrade(rec)
	main._deselect_unit()
	var keep1: Dictionary = _r19_state()
	var lv5: int = tw5.tower_level
	var at_wave: Dictionary = {}
	var menu5: Array = [{}]
	var on_wave5 := func(cur: int, _t: int) -> void:
		at_wave[cur] = [_bm().speed_pref, Engine.time_scale, _bm().game_state]
		if cur == 3:
			menu5[0] = _r19_open(rec)
	_bm().wave_changed.connect(on_wave5)
	_bm().player_start_battle()
	await _wait_until(func(): return _bm().game_state == BattleManager.GameState.PREP and _bm().current_wave == 1, 10.0)
	var keep2: Dictionary = _r19_state()
	_bm().toggle_auto_mode()
	await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 30.0)
	_bm().wave_changed.disconnect(on_wave5)
	var at_result: Dictionary = _r19_state()
	_check("R19-5 同一場保留 2 倍：更新隊伍、蓋塔並升到 Lv2 後仍 2；第 1 波清空回到備戰仍 2；自動模式第 2、3 波開始當下仍 2；第 3 波開著部署選單（0.1）時結算：結算後倍率 1、選擇 1、沒有開著的選單",
		keep1.ts == 2.0 and keep1.pref == 2 and lv5 == 2 and keep2.ts == 2.0 and keep2.pref == 2 and at_wave.get(1, []) == [2, 2.0, 2] and at_wave.get(2, []) == [2, 2.0, 2] and at_wave.get(3, []) == [2, 2.0, 2] \
		and int(menu5[0].get("menu_id", 0)) > 0 and at_result.state == BattleManager.GameState.RESULT and at_result.ts == 1.0 and at_result.pref == 1 and at_result.menu == 0,
		{"keep1": keep1, "level": lv5, "keep2": keep2, "at_wave": at_wave, "menu": menu5[0], "at_result": at_result})

	# R19-6：拒絕且不改任何狀態：結算後（RESULT）的速度命令 → not_active、打開部署選單不開（沒有 click_cell、倍率仍 1）；
	# 新的一場選 2 倍後：別場的 battle_id → stale_battle；字串 "2"、3、0、-1、1.5、true、null、沒有帶 → invalid_speed。
	# 每個命令都有回覆；battle_id、倍率、選擇都不變
	var r6_result: Dictionary = _r19_speed(rec, 2.0)
	var clicks6: int = rec.sent_clicks.size()
	main._open_deploy_menu(Vector2i(2, 4), "build", Vector2(10.0, 10.0))
	var result_menu: bool = rec.sent_clicks.size() == clicks6 and Engine.time_scale == 1.0
	_load(_r19_payload("r19-g1"))
	_r19_speed(rec, 2.0)
	var before6: Dictionary = _r19_state()
	var rej: Dictionary = {}
	rej["stale"] = _r19_speed(rec, 1.0, "r19-f1")
	rej["string"] = _r19_speed(rec, "2")
	rej["three"] = _r19_speed(rec, 3)
	rej["zero"] = _r19_speed(rec, 0)
	rej["negative"] = _r19_speed(rec, -1)
	rej["fraction"] = _r19_speed(rec, 1.5)
	rej["bool"] = _r19_speed(rec, true)
	rej["null"] = _r19_speed(rec, null)
	rej["missing"] = _r19_speed(rec, R19_NO_SPEED)
	var after6: Dictionary = _r19_state()
	var reasons6: Dictionary = {}
	var all_rej: bool = true
	for k in rej:
		reasons6[k] = [rej[k].get("ok"), rej[k].get("reason")]
		all_rej = all_rej and rej[k].get("ok") == false and rej[k].get("reason") == ("stale_battle" if k == "stale" else "invalid_speed")
	_check("R19-6 拒絕且不改狀態：結算後 not_active、也不開部署選單；別場 stale_battle；字串、3、0、-1、1.5、true、null、沒有帶都是 invalid_speed；battle_id、倍率 2、選擇 2 都不變",
		r6_result.get("ok") == false and r6_result.get("reason") == "not_active" and result_menu and all_rej and before6 == after6 and after6.ts == 2.0 and after6.pref == 2 and after6.bid == "r19-g1",
		{"result": r6_result, "result_menu": result_menu, "reasons": reasons6, "before": before6, "after": after6})

	# R19-7：暫停（SceneTree.paused）中選速度：回覆成功、選擇改變，但暫停不被解除；暫停期間遊戲時間不前進
	paused = true
	var g7: float = _gt()
	var r7: Dictionary = _r19_speed(rec, 1.0)
	await _wait(0.3)
	var still_paused: bool = paused
	var g7b: float = _gt()
	paused = false
	_check("R19-7 暫停中選 1 倍：回覆 ok、選擇 1，暫停沒有被解除、遊戲時間不前進（速度命令只改倍率）",
		r7.get("ok") == true and int(r7.get("speed", -1)) == 1 and still_paused and g7 == g7b, {"reply": r7, "paused": still_paused, "game_time": [g7, g7b]})

	# R19-8：每個物理步進前進的遊戲時間＝實際倍率 ÷ 每秒步數：1 倍、2 倍、部署選單 0.1（選擇 2 倍時也是 0.1）、關閉後回到 2 倍；
	# 同一個敵人（速度 60 px/秒、直線路段）每個物理步進前進的距離也照同樣的比例，換算成每秒遊戲時間都是 60 px
	_load(_with_id(_payload("r19_m", [[_grp("w_grunt", 1, 0.1)]]), "r19-m1"))
	_bm().player_start_battle()
	var mv: Node = await _r14_enemy()
	var rt: Dictionary = {}
	var mvs: Dictionary = {}
	if mv != null:
		rt["x1"] = await _physics_rate(0.3)
		mvs["x1"] = await _r19_move(mv, 0.4)
		_r19_speed(rec, 2.0)
		rt["x2"] = await _physics_rate(0.3)
		mvs["x2"] = await _r19_move(mv, 0.4)
		var m8: Dictionary = _r19_open(rec)
		rt["slow"] = await _physics_rate(0.5)
		mvs["slow"] = await _r19_move(mv, 0.5)
		_r19_close(rec, m8)
		rt["back"] = await _physics_rate(0.3)
	var tps: float = float(Engine.physics_ticks_per_second)
	var k8: Dictionary = {"x1": 1.0, "x2": 2.0, "slow": 0.1, "back": 2.0}
	var ok8: bool = mv != null
	for k in k8:
		ok8 = ok8 and rt.has(k) and int(rt[k].steps) > 0 and absf(float(rt[k].per_step) - float(k8[k]) / tps) < 1e-9
	for k in ["x1", "x2", "slow"]:
		ok8 = ok8 and mvs.has(k) and int(mvs[k].steps) > 0 and absf(float(mvs[k].per_step) - 60.0 * float(k8[k]) / tps) < 1e-3 and absf(float(mvs[k].per_sec) - 60.0) < 0.05
	_check("R19-8 實際推進照倍率：每個物理步進前進 1、2、0.1（2 倍時開選單）÷ 每秒步數，關閉選單回到 2；敵人每步前進 1、2、0.1 px（速度 60），換算成每秒遊戲時間都是 60 px", ok8, {"rate": rt, "move": mvs})

	# R19-9：攻擊冷卻照遊戲時間：同一座弓兵（0.8 秒）與關羽（0.5 秒）在 1 倍與 2 倍下，每一擊的傷害相同、每一擊都在累積時程的一幀之內
	# （冷卻保留零頭，相鄰兩擊可能短一幀，所以驗累積時程），同樣 3 秒遊戲時間的擊數相差不超過 1（不額外補一發）；2 倍經過的物理步進約是 1 倍的一半。
	# 長時間（60 秒）與各種幀率的比較在 R20-1
	var s9: Dictionary = await _r17_start("r19-k1", "archer")
	var h9: Dictionary = {}
	if s9.e.size() == 3:
		h9["tower1"] = await _r19_hits([s9.e["t_front"]], 3.0)
		_r19_speed(rec, 2.0)
		h9["tower2"] = await _r19_hits([s9.e["t_front"]], 3.0)
	_load(_r16_payload("r19-k2", [_r16_guan(1)], {}))
	_r12_place("guan_yu", Vector2i(3, 4))
	_bm().player_start_battle()
	var e9: Node = await _r14_enemy()
	if e9 != null and _guan() != null:
		_r14_put(e9, _guan(), 1.0)
		await _wait(0.6)
		h9["hero1"] = await _r19_hits([e9], 3.0)
		_r19_speed(rec, 2.0)
		h9["hero2"] = await _r19_hits([e9], 3.0)
	var ok9: bool = h9.size() == 4
	if ok9:
		for pair in [["tower1", "tower2", 0.8, 30.0], ["hero1", "hero2", 0.5, 100.0]]:
			var a: Dictionary = h9[pair[0]]
			var b: Dictionary = h9[pair[1]]
			var dmg_ok: bool = true
			for h in a.hits + b.hits:
				dmg_ok = dmg_ok and float(h.dmg) == float(pair[3])
			var ratio: float = float(b.steps) / float(a.steps) if int(a.steps) > 0 else -1.0
			ok9 = ok9 and dmg_ok and _r19_interval_ok(a, pair[2]) and _r19_interval_ok(b, pair[2]) and absi(a.hits.size() - b.hits.size()) <= 1 and ratio > 0.4 and ratio < 0.6
	var brief9: Dictionary = {}
	for k in h9:
		brief9[k] = {"n": h9[k].hits.size(), "t": h9[k].hits.map(func(h): return h.t), "dmg": h9[k].hits.map(func(h): return h.dmg).slice(0, 2), "dmax": h9[k].dmax, "steps": h9[k].steps}
	_check("R19-9 攻擊冷卻照遊戲時間：弓兵 0.8 秒、關羽 0.5 秒，1 倍與 2 倍下每擊傷害相同（30、100），每一擊都在累積時程的一幀之內，3 秒遊戲時間的擊數相差不超過 1；2 倍經過的物理步進約是一半", ok9, brief9)

	# R19-10：灼燒、減速、切換當下：周瑜命中後灼燒中切到 2 倍的同一幀，遊戲時間、灼燒倒數、減速剩餘時間、周瑜的攻擊冷卻都不變（不跳時鐘、不重設計時器）；
	# 之後灼燒仍在命中後遊戲時間 1、2、3 秒各跳一次（共 3 跳、不加倍）；跳完後再加 1 秒的疊加減速：2 倍下經過 1 秒遊戲時間（約 30 個物理步進）解除
	var e10: Node = await _r15_start(_r15_payload("r19_b", "r19-n1", [_r15_zhou()]))
	var ok10: bool = false
	var d10: Dictionary = {}
	if e10 != null:
		var h10: Dictionary = await _r15_hit_then_leave(e10, _zhou())
		e10.apply_stackable_slow(0.2, 1.0)
		var before10: Array = [_gt(), _pt(), e10.burn_state().next_in, e10._stack_slow_timer, _zhou()._atk_timer]
		var r10s: Dictionary = _r19_speed(rec, 2.0)
		var after10: Array = [_gt(), _pt(), e10.burn_state().next_in, e10._stack_slow_timer, _zhou()._atk_timer]
		# 灼燒在切換後立刻開始記錄（第一跳在命中後 1 秒，不能被其他量測佔掉）；跳完後再量一次新的 1 秒減速
		var r10: Dictionary = await _r15_drops(e10, h10.t0, 3.6)
		var s10: Dictionary = _r15_split(r10.drops, 100.0, 20.0)
		e10.apply_stackable_slow(0.2, 1.0)
		var p0: float = _pt()
		var f0: int = Engine.get_physics_frames()
		var prev10: float = p0
		var dp: float = 0.0
		var wall_end: int = Time.get_ticks_msec() + 20000
		while e10._stack_slow_amount > 0.0 and Time.get_ticks_msec() < wall_end:
			prev10 = _pt()
			await process_frame
			dp = maxf(dp, _pt() - prev10)
		var slow_end: Array = [_pt() - p0, Engine.get_physics_frames() - f0]
		var slow_ok: bool = float(slow_end[0]) >= 1.0 - 0.0005 and float(slow_end[0]) <= 1.0 + dp + 0.0005 and int(slow_end[1]) >= 25 and int(slow_end[1]) <= 40
		ok10 = r10s.get("ok") == true and before10 == after10 and slow_ok and s10.bad.is_empty() and _r15_at(s10.ticks, [1.0, 2.0, 3.0], h10.dh) and Engine.time_scale == 2.0
		d10 = {"reply": r10s, "before": before10, "after": after10, "slow_end": slow_end, "dp": dp, "ticks": _r15_ts(s10.ticks), "bad": s10.bad}
	_check("R19-10 切到 2 倍的同一幀：遊戲時間、灼燒倒數、減速剩餘、周瑜攻擊冷卻都不變；之後灼燒在命中後 1、2、3 秒各跳一次（不加倍）；1 秒的減速在 2 倍下經過 1 秒遊戲時間（約 30 步）解除", ok10, d10)

	# R19-11：出兵間隔與自動下一波的等待照遊戲時間：1 倍與 2 倍下出兵間隔都是 1 秒、清波到下一波都是 1.5 秒（到 1 秒／1.5 秒＋一幀之間）；
	# 2 倍經過的物理步進約是 1 倍的一半
	var sp1: Dictionary = await _r19_spawn_timing(rec, "r19-p1", 1.0)
	var sp2: Dictionary = await _r19_spawn_timing(rec, "r19-p2", 2.0)
	var ok11: bool = true
	for sp in [sp1, sp2]:
		ok11 = ok11 and sp.gaps.size() == 4 and sp.result and float(sp.wait) >= 1.5 - 0.0005 and float(sp.wait) <= 1.5 + float(sp.dmax) + 0.0005
		for g in sp.gaps:
			ok11 = ok11 and float(g) >= 1.0 - 0.0005 and float(g) <= 1.0 + float(sp.dmax) + 0.0005
	for w in sp1.waves:
		ok11 = ok11 and float(w[3]) == 1.0
	for w in sp2.waves:
		ok11 = ok11 and float(w[3]) == 2.0
	var steps_ratio: float = float(sp2.wait_steps) / float(sp1.wait_steps) if int(sp1.wait_steps) > 0 else -1.0
	var sum1: int = 0
	var sum2: int = 0
	for s in sp1.gap_steps:
		sum1 += int(s)
	for s in sp2.gap_steps:
		sum2 += int(s)
	var gap_ratio: float = float(sum2) / float(sum1) if sum1 > 0 else -1.0
	ok11 = ok11 and steps_ratio > 0.4 and steps_ratio < 0.6 and gap_ratio > 0.4 and gap_ratio < 0.6
	_check("R19-11 出兵與自動下一波照遊戲時間：1 倍與 2 倍下出兵間隔都是 1 秒、清波到下一波都是 1.5 秒（到＋一幀之間）；2 倍的物理步進約是一半",
		ok11, {"x1": sp1, "x2": sp2, "wait_ratio": steps_ratio, "gap_ratio": gap_ratio})

	# R19-12：沒有額外收益：同一個固定場景在 1 倍與 2 倍下，備戰拆塔返還都是 25；每一擊都是 30、擊數相同；
	# 擊殺、星數、戰場點數、戰鬥金幣變化、結算次數都相同；結算的 time_seconds 是遊戲時間（相差不超過 1 秒）
	var g1: Dictionary = await _r19_same_game(rec, "r19-q1", 1.0)
	var g2: Dictionary = await _r19_same_game(rec, "r19-q2", 2.0)
	var same: bool = g1.same_battle and g2.same_battle and int(g1.ended) == 1 and int(g2.ended) == 1 and int(g1.sell) == 25 and int(g2.sell) == 25 \
		and g1.dmgs == g2.dmgs and g1.dmgs.size() == 6 and _all_equal(g1.dmgs, 30.0) and g1.kills == g2.kills and int(g1.kills) == 2 and g1.stars == g2.stars and int(g1.stars) == 3 \
		and g1.points == g2.points and int(g1.points) == 1020 and g1.gold == g2.gold and absi(int(g1.time) - int(g2.time)) <= 1
	_check("R19-12 沒有額外收益：1 倍與 2 倍的同一個場景：拆塔返還都是 25；6 擊都是 30；擊殺 2、三星、戰場點數 1020、戰鬥金幣變化、結算一次都相同；time_seconds 是遊戲時間（相差不超過 1）",
		same, {"x1": g1, "x2": g2})

	rec.payload_received.disconnect(main._on_payload_received)
	rec.upgrade_unit_requested.disconnect(main._on_web_upgrade_unit)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── R20：攻擊冷卻保留零頭與手動暫停 ──
# A：Hero／Tower 的攻擊冷卻保留越過零點的零頭（下一擊排在上一擊的預定時間＋攻擊間隔）；沒有目標時停在 0、不囤積；
#    一幀最多一擊，單幀長過攻擊間隔時從這一擊起算完整的間隔。固定步進的部分直接呼叫真正的 Hero._process／Tower._process
#    （set_process(false) 後手動給 delta＝倍率 ÷ 每秒幀數，不依牆鐘）；實際引擎的部分用遊戲時間（_gt）量。
# B：手動暫停。命令一律經過真實的 JSON 路徑（bridge_recorder 的 _on_js_message）；暫停只停掉模擬用的節點，
#    不動 SceneTree.paused 與 Engine.time_scale。測試的等待用 SceneTree 計時器與牆鐘（不受這個暫停影響，測試自己不會停住）

## 固定步進用的目標：永遠在射程內、不會死，只數被打了幾次（文士塔的減速也算一次）
class R20Target extends Node2D:
	var hits: int = 0
	var current_hp: float = 1.0e9
	func is_dead() -> bool:
		return false
	func get_progress_ratio() -> float:
		return 0.5
	## 敵人介面（飛行敵人與對空）：地面、到終點的剩餘路程固定
	func is_flying() -> bool:
		return false
	func get_remaining_distance() -> float:
		return 100.0
	func take_damage(_amount: float, _is_burn: bool = false) -> void:
		hits += 1
	func apply_slow(_mult: float, _duration: float) -> void:
		pass
	func clear_slow() -> void:
		pass
	func apply_stackable_slow(_amount: float, _duration: float) -> void:
		hits += 1
	func apply_burn(_damage: float, _ticks: int, _interval: float) -> void:
		pass

class R20Wave extends Node:
	var enemies: Array = []
	func get_active_enemies() -> Array:
		return enemies

## 真正的武將或弓兵塔腳本（攻擊間隔改成 cd），不經過場景樹的處理：測試自己呼叫 _process
func _r20_unit(holder: Node, kind: String, cd: float, wave: Node) -> Node:
	var u: Node
	if kind == "hero":
		u = load("res://entities/hero/Hero.gd").new()
		holder.add_child(u)
		u.attack_range = 3.0
		u.attack_speed = cd
		u._wave_mgr = wave
	else:
		u = load("res://entities/tower/Tower.gd").new()
		holder.add_child(u)
		u.setup("archer", Vector2i.ZERO, wave)
		u.atk_spd = cd
	u.set_process(false)
	return u

## 用固定的 delta 呼叫 steps 次 _process（步數從 first 起算），回傳每一擊發生在第幾步；同一步打到兩下以上時 multi 為 true
func _r20_steps(u: Node, tgt: Node, delta: float, steps: int, first: int = 1) -> Dictionary:
	var at: Array = []
	var multi: bool = false
	for i in range(first, first + steps):
		var before: int = tgt.hits
		u._process(delta)
		var n: int = tgt.hits - before
		if n > 0:
			at.append(i)
		if n > 1:
			multi = true
	return {"at": at, "multi": multi}

## 時間矩陣：武將與弓兵塔 × 攻擊間隔 0.1／0.5／0.8／3 秒 × 每秒 30／60／120 幀 × 1／2 倍，都跑 60 秒遊戲時間。
## 冷卻從 0 開始、目標一直在射程內：第一擊在第 1 步（首次攻擊相位）；第 k 擊和第一擊相差 k × 間隔 到 k × 間隔＋一步之間（理想時程）；
## 總擊數和理想時程 1 + floor((60 − 第一擊的時間) ÷ 間隔) 相差不超過 1；同一個間隔與幀率下 1 倍與 2 倍相差不超過 1
func _r20_matrix(holder: Node, tgt: Node, wave: Node) -> Dictionary:
	var bad: Array = []
	var sample: Array = []
	var all: Array = []
	for kind in ["hero", "tower"]:
		for cd in [0.1, 0.5, 0.8, 3.0]:
			for fps in [30, 60, 120]:
				var n_by: Dictionary = {}
				for speed in [1, 2]:
					var u: Node = _r20_unit(holder, kind, cd, wave)
					var delta: float = float(speed) / float(fps)
					var steps: int = int(round(60.0 * float(fps) / float(speed)))
					tgt.hits = 0
					var r: Dictionary = _r20_steps(u, tgt, delta, steps)
					u.free()
					var at: Array = r.at
					var lo: float = 0.0
					var hi: float = 0.0
					var first_ok: bool = not at.is_empty() and int(at[0]) == 1
					if first_ok:
						for k in range(at.size()):
							var off: float = float(int(at[k]) - int(at[0])) * delta - float(k) * cd
							lo = minf(lo, off)
							hi = maxf(hi, off)
					var ideal: int = int(floor((float(steps) * delta - delta) / cd + 1e-9)) + 1
					var row: Dictionary = {"kind": kind, "cd": cd, "fps": fps, "speed": speed, "hits": at.size(), "ideal": ideal, "off": [snappedf(lo, 0.000001), snappedf(hi, 0.000001)], "step": snappedf(delta, 0.000001)}
					all.append([kind, cd, fps, speed, at.size(), ideal])
					if not first_ok or r.multi or lo < -1e-9 or hi > delta + 1e-9 or absi(at.size() - ideal) > 1:
						bad.append(row)
					if is_equal_approx(cd, 0.1) and fps == 60:
						sample.append(row)
					n_by[speed] = at.size()
				if absi(int(n_by[1]) - int(n_by[2])) > 1:
					bad.append({"kind": kind, "cd": cd, "fps": fps, "x1": n_by[1], "x2": n_by[2]})
	print("R20_MATRIX " + JSON.stringify(all))
	return {"rows": all.size(), "bad": bad, "sample": sample}

## 空場不囤積（每秒 60 幀、1 倍、間隔 0.5 秒）：有目標 60 步 → 移走目標 180 步 → 放回。沒有目標時不攻擊、冷卻停在 0；
## 放回的那一步打一擊，下一擊在一個間隔（30 步，浮點誤差可能多一步）之後，不是立刻補打
func _r20_idle(holder: Node, tgt: Node, wave: Node, kind: String) -> Dictionary:
	var u: Node = _r20_unit(holder, kind, 0.5, wave)
	var d: float = 1.0 / 60.0
	tgt.hits = 0
	var a: Dictionary = _r20_steps(u, tgt, d, 60, 1)
	wave.enemies = []
	var b: Dictionary = _r20_steps(u, tgt, d, 180, 61)
	var idle_timer: float = u._atk_timer
	wave.enemies = [tgt]
	var c: Dictionary = _r20_steps(u, tgt, d, 50, 241)
	u.free()
	var ok: bool = a.at.size() == 2 and b.at.is_empty() and idle_timer == 0.0 and c.at.size() == 2 and int(c.at[0]) == 241 \
		and int(c.at[1]) - 241 >= 30 and int(c.at[1]) - 241 <= 31 and not c.multi
	return {"ok": ok, "before": a.at, "empty": b.at, "idle_timer": idle_timer, "after": c.at}

## 極長的一幀（每秒 60 幀跑 1 秒後給一步 5 秒）：那一步只打一擊（不是 10 擊），之後冷卻是完整的 0.5 秒；
## 下一擊在 30 步（浮點誤差可能多一步）之後，中間沒有補打
func _r20_long_frame(holder: Node, tgt: Node, wave: Node, kind: String) -> Dictionary:
	var u: Node = _r20_unit(holder, kind, 0.5, wave)
	var d: float = 1.0 / 60.0
	tgt.hits = 0
	_r20_steps(u, tgt, d, 60, 1)
	var h0: int = tgt.hits
	u._process(5.0)
	var in_long: int = tgt.hits - h0
	var timer_after: float = u._atk_timer
	var c: Dictionary = _r20_steps(u, tgt, d, 50, 62)
	u.free()
	var ok: bool = in_long == 1 and is_equal_approx(timer_after, 0.5) and c.at.size() == 1 and int(c.at[0]) - 61 >= 30 and int(c.at[0]) - 61 <= 31
	return {"ok": ok, "hits_in_long_frame": in_long, "timer_after": timer_after, "after": c.at}

## 反向檢查的對照：同一個矩陣條件下，舊的「每擊設回完整冷卻」會少打多少（只記錄，不影響判定；真正的反向驗證是把正式程式改回舊寫法重跑）
func _r20_old_rule(cd: float, fps: int, speed: int) -> int:
	var delta: float = float(speed) / float(fps)
	var timer: float = 0.0
	var n: int = 0
	for i in range(int(round(60.0 * float(fps) / float(speed)))):
		timer -= delta
		if timer <= 0.0:
			n += 1
			timer = cd
	return n

## 實際引擎的一擊紀錄：每一幀比較血量，記下血量下降那一幀的遊戲時間（單擊傷害 dmg；一幀掉兩擊以上記為 multi）
func _r20_tracker(e: Node, dmg: float) -> Dictionary:
	return {"e": e, "last": e.current_hp, "dmg": dmg, "hits": [], "dmax": 0.0, "multi": false, "bad_dmg": []}

## 記錄到遊戲時間前進 sec 秒為止；wall_ms ≥ 0 時改成等牆鐘 wall_ms 毫秒（暫停中遊戲時間不前進）
func _r20_track(tr: Dictionary, sec: float, wall_ms: int = -1) -> void:
	var g_end: float = _gt() + sec
	var w_end: int = Time.get_ticks_msec() + (wall_ms if wall_ms >= 0 else int(sec * 4000.0) + 10000)
	var prev: float = _gt()
	while (wall_ms >= 0 or _gt() < g_end) and Time.get_ticks_msec() < w_end:
		await process_frame
		tr.dmax = maxf(float(tr.dmax), _gt() - prev)
		prev = _gt()
		if not is_instance_valid(tr.e):
			return
		var e: Node = tr.e
		var drop: float = float(tr.last) - e.current_hp
		if drop > 0.001:
			tr.hits.append(_gt())
			if drop > float(tr.dmg) * 1.5:
				tr.multi = true
			elif not is_equal_approx(drop, float(tr.dmg)):
				tr.bad_dmg.append(drop)
		tr.last = e.current_hp

## 累積時程：每一擊的時間減去 k × 間隔（以記錄到的第一擊為準）的最大差距。保留零頭時只差在「命中落在哪一幀」，不超過最長的一幀；
## 每擊都設回完整冷卻時這個差距會逐擊變大
func _r20_spread(hits: Array, cd: float) -> float:
	if hits.size() < 2:
		return -1.0
	var lo: float = INF
	var hi: float = -INF
	for i in range(hits.size()):
		var off: float = float(hits[i]) - float(hits[0]) - float(i) * cd
		lo = minf(lo, off)
		hi = maxf(hi, off)
	return hi - lo

func _r20_cooldown_cases() -> void:
	var holder := Node2D.new()
	holder.visible = false
	root.add_child(holder)
	var wave := R20Wave.new()
	holder.add_child(wave)
	var tgt := R20Target.new()
	holder.add_child(tgt)
	wave.enemies = [tgt]

	# R20-1：時間矩陣（固定步進、真正的 Hero／Tower 程式）
	var m: Dictionary = _r20_matrix(holder, tgt, wave)
	var old: Dictionary = {"0.1@60 x1": _r20_old_rule(0.1, 60, 1), "0.1@60 x2": _r20_old_rule(0.1, 60, 2), "0.5@60 x1": _r20_old_rule(0.5, 60, 1), "0.5@60 x2": _r20_old_rule(0.5, 60, 2)}
	_check("R20-1 冷卻保留零頭（固定步進 60 秒遊戲時間，武將與弓兵塔 × 間隔 0.1／0.5／0.8／3 秒 × 每秒 30／60／120 幀 × 1／2 倍，共 48 組）：第一擊在第 1 步，每一擊和理想時程（第一擊＋k × 間隔）只差不到一步，總擊數和理想相差不超過 1，1 倍與 2 倍相差不超過 1",
		m.rows == 48 and m.bad.is_empty(), {"bad": m.bad, "sample_cd0.1_fps60": m.sample, "old_rule_for_reference": old})

	# R20-2：空場／目標離開不囤積，取得新目標最多先打一擊，之後照冷卻
	var i_hero: Dictionary = _r20_idle(holder, tgt, wave, "hero")
	var i_tower: Dictionary = _r20_idle(holder, tgt, wave, "tower")
	_check("R20-2 空場不囤積（固定步進）：沒有目標的 180 步不攻擊、冷卻停在 0；目標回來的那一步打一擊，下一擊在一個間隔（30 步）之後，武將與弓兵塔都一樣",
		i_hero.ok and i_tower.ok, {"hero": i_hero, "tower": i_tower})

	# R20-3：極長的一幀只打一擊，之後從這一擊起算完整的間隔（不補發）
	var l_hero: Dictionary = _r20_long_frame(holder, tgt, wave, "hero")
	var l_tower: Dictionary = _r20_long_frame(holder, tgt, wave, "tower")
	_check("R20-3 極長的一幀（5 秒、間隔 0.5 秒）：那一幀只打一擊（受幀率限制，其餘作廢），冷卻設回完整的 0.5 秒，下一擊在 30 步之後、中間不補打；武將與弓兵塔都一樣",
		l_hero.ok and l_tower.ok, {"hero": l_hero, "tower": l_tower})
	holder.queue_free()

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)

	# R20-4：實際引擎：弓兵塔（0.8 秒、每擊 30）持續打同一個不會移動的敵人；途中經由橋接切到 2 倍、開部署選單（0.1）再關閉、
	# 手動暫停再繼續、切回 1 倍。每個命令的當下攻擊冷卻與敵人血量都不變（命令本身不重設冷卻、不攻擊）；
	# 整段每一擊的遊戲時間減去 k × 0.8 的差距不超過最長的一幀（累積時程不漂移），擊數和經過的遊戲時間相符，每擊都是 30、一幀最多一擊
	var s4: Dictionary = await _r17_start("r20-k1", "archer")
	var ok4: bool = false
	var d4: Dictionary = {}
	if s4.tower != null and s4.e.size() == 3:
		var tw: Node = s4.tower
		var ef: Node = s4.e["t_front"]
		var tr: Dictionary = _r20_tracker(ef, 30.0)
		var cmds: Array = []
		await _r20_track(tr, 2.0)
		var steps: Array = [
			["speed2", func(): _r19_speed(rec, 2.0)],
			["menu", func(): d4["menu"] = _r19_open(rec)],
			["close", func(): _r19_close(rec, d4.get("menu", {}))],
			["pause", func(): _r20_pause(rec, true)],
			["resume", func(): _r20_pause(rec, false)],
			["speed1", func(): _r19_speed(rec, 1.0)],
		]
		var waits: Dictionary = {"speed2": [2.0, -1], "menu": [0.12, -1], "close": [1.5, -1], "pause": [0.0, 1200], "resume": [1.5, -1], "speed1": [2.0, -1]}
		for st in steps:
			var b: Array = [tw._atk_timer, ef.current_hp, Engine.time_scale]
			st[1].call()
			var a: Array = [tw._atk_timer, ef.current_hp, Engine.time_scale]
			cmds.append({"cmd": st[0], "timer_same": b[0] == a[0], "hp_same": b[1] == a[1], "ts": [b[2], a[2]]})
			var w: Array = waits[st[0]]
			await _r20_track(tr, float(w[0]), int(w[1]))
		var h: Array = tr.hits
		var elapsed: float = float(h.back()) - float(h[0]) if h.size() >= 2 else -1.0
		var expect_n: int = int(floor(elapsed / 0.8 + 1e-9)) + 1
		var spread: float = _r20_spread(h, 0.8)
		var cmd_ok: bool = true
		for c in cmds:
			cmd_ok = cmd_ok and c.timer_same and c.hp_same
		ok4 = cmd_ok and h.size() >= 8 and spread >= 0.0 and spread <= float(tr.dmax) + 0.0005 and absi(h.size() - expect_n) <= 1 and not tr.multi and tr.bad_dmg.is_empty() and Engine.time_scale == 1.0
		d4 = {"cmds": cmds, "hits": h.size(), "expect": expect_n, "spread": snappedf(spread, 0.0001), "dmax": snappedf(float(tr.dmax), 0.0001), "multi": tr.multi, "bad_dmg": tr.bad_dmg, "t": h.map(func(x): return snappedf(float(x) - float(h[0]), 0.001))}
	_check("R20-4 實際引擎跨倍率／部署／暫停：命令當下冷卻與血量不變；整段每一擊和累積時程（第一擊＋k × 0.8）的差距不超過一幀、擊數和遊戲時間相符、每擊 30、一幀最多一擊", ok4, d4)

	# R20-5：實際引擎的空場重新有目標與極長的一幀：關羽（0.5 秒、每擊 100）的目標移到射程外 1.5 秒：沒有攻擊、冷卻停在 0；
	# 移回射程的第一幀就打一擊，下一擊在 0.5 秒到 0.5 秒＋一幀之間（不補打）；再直接給這位武將一個 3 秒的 _process：只打一擊，
	# 之後 0.45 秒遊戲時間內沒有補打，下一擊在 0.5 秒到 0.5 秒＋一幀之間
	_load(_r16_payload("r20-i1", [_r16_guan(1)], {}))
	_r12_place("guan_yu", Vector2i(3, 4))
	_bm().player_start_battle()
	var e5: Node = await _r14_enemy()
	var ok5: bool = false
	var d5: Dictionary = {}
	if e5 != null and _guan() != null:
		var g: Node = _guan()
		_r14_put(e5, g, 1.0)
		var t_a: Dictionary = _r20_tracker(e5, 100.0)
		await _r20_track(t_a, 1.2)
		_r14_put(e5, g, 6.0)
		var t_b: Dictionary = _r20_tracker(e5, 100.0)
		await _r20_track(t_b, 1.5)
		var idle_timer: float = g._atk_timer
		_r14_put(e5, g, 1.0)
		var back_at: float = _gt()
		var t_c: Dictionary = _r20_tracker(e5, 100.0)
		await _r20_track(t_c, 1.1)
		var hp_l: float = e5.current_hp
		var long_at: float = _gt()
		g._process(3.0)
		var long_hits: float = (hp_l - e5.current_hp) / 100.0
		var long_timer: float = g._atk_timer
		var t_d: Dictionary = _r20_tracker(e5, 100.0)
		await _r20_track(t_d, 0.45)
		# 等待可能跨過截止時間一幀；只算真正發生在 0.45 秒窗口內的攻擊，不能把窗口外的正常下一擊算成補發
		var quiet: int = t_d.hits.filter(func(t): return float(t) - long_at < 0.45).size()
		await _r20_track(t_d, 0.3)
		var hc: Array = t_c.hits
		var hd: Array = t_d.hits
		var reacq_ok: bool = hc.size() >= 2 and float(hc[0]) - back_at <= float(t_c.dmax) + 0.0005 and float(hc[1]) - float(hc[0]) >= 0.5 - 0.0005 and float(hc[1]) - float(hc[0]) <= 0.5 + float(t_c.dmax) + 0.0005
		var long_ok: bool = is_equal_approx(long_hits, 1.0) and is_equal_approx(long_timer, 0.5) and quiet == 0 and hd.size() >= 1 and float(hd[0]) - long_at >= 0.5 - 0.0005 and float(hd[0]) - long_at <= 0.5 + float(t_d.dmax) + 0.0005
		ok5 = t_a.hits.size() >= 2 and t_b.hits.is_empty() and idle_timer == 0.0 and reacq_ok and long_ok and not t_c.multi and not t_d.multi
		d5 = {"before": t_a.hits.size(), "empty": t_b.hits.size(), "idle_timer": idle_timer, "reacq": hc.map(func(x): return snappedf(float(x) - back_at, 0.001)), "dmax_c": snappedf(float(t_c.dmax), 0.0001),
			"long_hits": long_hits, "long_timer": long_timer, "quiet": quiet, "after_long": hd.map(func(x): return snappedf(float(x) - long_at, 0.001)), "dmax_d": snappedf(float(t_d.dmax), 0.0001)}
	_check("R20-5 實際引擎的空場與極長一幀：目標離開 1.5 秒沒有攻擊、冷卻停在 0；回到射程的第一幀打一擊、下一擊在 0.5 秒到＋一幀；3 秒的單幀只打一擊、冷卻設回 0.5，之後 0.45 秒不補打、下一擊在 0.5 秒到＋一幀", ok5, d5)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

## 送出暫停命令（真實的 JSON 路徑），回傳 Godot 的回覆（沒有回覆時是空字典）；omit 為 true 時不帶 paused 欄位
func _r20_pause(rec: Node, paused: Variant, bid: String = "", omit: bool = false) -> Dictionary:
	var d: Dictionary = {"type": "set_paused", "battle_id": bid if bid != "" else _bm().battle_id}
	if not omit:
		d["paused"] = paused
	var n: int = rec.sent_pauses.size()
	_r19_js(rec, d)
	return rec.sent_pauses.back() if rec.sent_pauses.size() > n else {}

## 暫停前後比對用：場上每個單位的位置、血量、攻擊冷卻、灼燒與減速剩餘、路點；遊戲計時器剩下的時間；出兵數、波次、遊戲時間、戰鬥時間
func _r20_world(spawned: Array) -> Dictionary:
	var units: Dictionary = {}
	for c in main.units_layer.get_children():
		if c.is_queued_for_deletion():
			continue
		var k: String = str(c.get_instance_id())
		if c is Enemy:
			units[k] = [c.position, c.current_hp, c._burn_timer, c._burn_ticks_left, c._stack_slow_timer, c._stack_slow_amount, c._wp_index]
		elif c is Tower or c is Hero:
			units[k] = [c.position, c._atk_timer, c._anim_timer]
	return {"units": units, "timers": _r20_timers(), "spawned": spawned[0], "wave": _bm().current_wave, "state": _bm().game_state,
		"gt": _gt(), "bt": _bm().battle_time, "active": _wm().get_active_enemy_count(), "spawning": _wm().get_spawning_group_count(), "pending": _bm()._auto_wave_pending}

## WaveManager 與 BattleManager 底下還在倒數的遊戲計時器剩下的時間
func _r20_timers() -> Array:
	var out: Array = []
	for n in _wm().get_children() + _bm().get_children():
		if n is Timer and not n.is_queued_for_deletion() and not n.is_stopped():
			out.append(n.time_left)
	return out

func _r20_frozen() -> bool:
	return main.units_layer.process_mode == Node.PROCESS_MODE_DISABLED and _wm().process_mode == Node.PROCESS_MODE_DISABLED and _bm().process_mode == Node.PROCESS_MODE_DISABLED

func _r20_running() -> bool:
	return main.units_layer.process_mode == Node.PROCESS_MODE_INHERIT and _wm().process_mode == Node.PROCESS_MODE_INHERIT and _bm().process_mode == Node.PROCESS_MODE_INHERIT

## 等到遊戲時間到 t（或牆鐘逾時），回傳期間最長的一幀
func _r20_until_gt(t: float, wall_ms: int = 10000) -> float:
	var dmax: float = 0.0
	var prev: float = _gt()
	var w_end: int = Time.get_ticks_msec() + wall_ms
	while _gt() < t and Time.get_ticks_msec() < w_end:
		await process_frame
		dmax = maxf(dmax, _gt() - prev)
		prev = _gt()
	return dmax

func _r20_pause_cases() -> void:
	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)
	rec.upgrade_unit_requested.connect(main._on_web_upgrade_unit)
	rec.start_battle_requested.connect(main._on_start_btn_pressed)
	rec.auto_toggle_requested.connect(main._on_auto_btn_pressed)
	rec.move_unit_requested.connect(main._on_web_move_unit)
	var spawned: Array = [0]
	var spawn_t: Array = []
	var on_spawn := func(_e: Node) -> void:
		spawned[0] += 1
		spawn_t.append(_gt())
	_wm().enemy_spawned.connect(on_spawn)

	# R20-6：暫停真的凍結模擬：出兵中（間隔 1 秒、第一隻出現後 0.4 秒）的場上有移動中的敵人、弓兵塔與文士塔（減速計時）；
	# 暫停後等牆鐘 1.5 秒：每個單位的位置／血量／冷卻／減速剩餘、出兵計時器剩下的時間、出兵數、波次、遊戲時間、戰鬥時間都不變；
	# Engine.time_scale 仍是 1、SceneTree.paused 仍是 false；update_stats 帶 paused。繼續後下一隻在「剩下的時間」後出現（不重新計滿、不立刻補出）
	_load(_with_id(_payload("r20_p", [[_grp("a_slow", 3, 1.0)], [_grp("a_slow", 1, 0.1)]]), "r20-p1"))
	main._on_web_place_tower({"tower_type": "archer", "cell_x": 1, "cell_y": 4})
	main._on_web_place_tower({"tower_type": "scholar", "cell_x": 2, "cell_y": 4})
	spawned[0] = 0
	spawn_t.clear()
	_bm().player_start_battle()
	await _wait_until_real(func(): return spawned[0] >= 1, 5.0)
	await _r20_until_gt(float(spawn_t[0]) + 0.4 if not spawn_t.is_empty() else _gt())
	var w0: Dictionary = _r20_world(spawned)
	var r6: Dictionary = _r20_pause(rec, true)
	var st6: Dictionary = _r19_last_stats(rec)
	await _wait_real(1.5)
	var w1: Dictionary = _r20_world(spawned)
	var frozen6: bool = _r20_frozen()
	var tree6: bool = paused
	var ts6: float = Engine.time_scale
	var rem: float = float(w1.timers[0]) if w1.timers.size() == 1 else -1.0
	var t_resume: float = _gt()
	var n_before: int = spawned[0]
	var r6b: Dictionary = _r20_pause(rec, false)
	var dmax6: float = 0.0
	var prev6: float = _gt()
	var w_end6: int = Time.get_ticks_msec() + 10000
	while spawned[0] == n_before and Time.get_ticks_msec() < w_end6:
		await process_frame
		dmax6 = maxf(dmax6, _gt() - prev6)
		prev6 = _gt()
	var gap6: float = float(spawn_t.back()) - t_resume if spawned[0] > n_before else -1.0
	var ok6: bool = r6.get("ok") == true and r6.get("paused") == true and st6.get("paused") == true and st6.get("battle_id") == "r20-p1" and w0 == w1 and frozen6 and not tree6 and ts6 == 1.0 \
		and rem > 0.0 and rem < 1.0 and r6b.get("ok") == true and r6b.get("paused") == false and _r20_running() and gap6 >= rem - 0.0005 and gap6 <= rem + dmax6 + 0.0005 and w0.units.size() >= 3
	_check("R20-6 暫停凍結模擬：牆鐘 1.5 秒內位置／血量／冷卻／減速／出兵計時器／出兵數／波次／遊戲時間／戰鬥時間都不變，time_scale 仍 1、SceneTree 沒有暫停、stats 帶 paused；繼續後下一隻在剩下的時間（不重新計滿）到＋一幀出現",
		ok6, {"reply": r6, "stats_paused": st6.get("paused"), "same": w0 == w1, "frozen": frozen6, "tree_paused": tree6, "ts": ts6, "remaining": rem, "resume_reply": r6b, "gap": gap6, "dmax": dmax6, "units": w0.units.size(), "gt": [w0.gt, w1.gt], "timers": [w0.timers, w1.timers]})

	# R20-7：2 倍 → 暫停 → 繼續：暫停中 time_scale 仍是 2（不靠倍率 0）、選擇仍是 2；繼續後每個物理步進前進 2 ÷ 每秒步數
	_r19_speed(rec, 2.0)
	var r7: Dictionary = _r20_pause(rec, true)
	var mid7: Array = [Engine.time_scale, _bm().speed_pref, _r20_frozen()]
	var g7: float = _gt()
	await _wait_real(0.4)
	var g7b: float = _gt()
	_r20_pause(rec, false)
	var rate7: Dictionary = await _physics_rate(0.3)
	var tps: float = float(Engine.physics_ticks_per_second)
	var ok7: bool = r7.get("ok") == true and float(r7.get("time_scale", -1)) == 2.0 and int(r7.get("speed", -1)) == 2 and mid7 == [2.0, 2, true] and g7 == g7b \
		and int(rate7.steps) > 0 and absf(float(rate7.per_step) - 2.0 / tps) < 1e-9 and Engine.time_scale == 2.0 and _r20_running()
	_check("R20-7 2 倍時暫停：回覆與 time_scale 都是 2（不用倍率 0 假裝暫停）、遊戲時間不前進；繼續後仍是 2 倍（每個物理步進 2 ÷ 每秒步數）", ok7, {"reply": r7, "mid": mid7, "game_time": [g7, g7b], "rate": rate7})

	# R20-8：部署與暫停：2 倍開部署選單（0.1）後暫停 → 暫停優先（凍結、倍率仍記 0.1）；暫停中不能開新選單；
	# 暫停中關閉選單 → 倍率 2 但仍暫停；繼續 → 2 倍。另一次保留選單直接繼續 → 回到 0.1，關閉後 2
	var m8: Dictionary = _r19_open(rec)
	var r8: Dictionary = _r20_pause(rec, true)
	var a8: Array = [Engine.time_scale, _bm().manual_paused, _r20_frozen(), _bm().deploy_menu_id]
	var clicks8: int = rec.sent_clicks.size()
	var open8: Dictionary = _r19_open(rec, 5)
	var no_click8: bool = rec.sent_clicks.size() == clicks8
	_r19_close(rec, m8)
	var st8: Dictionary = _r19_last_stats(rec)
	var b8: Array = [Engine.time_scale, _bm().manual_paused, _r20_frozen(), _bm().deploy_menu_id]
	_r20_pause(rec, false)
	var c8: Array = [Engine.time_scale, _bm().manual_paused, _r20_running()]
	var m8b: Dictionary = _r19_open(rec)
	_r20_pause(rec, true)
	_r20_pause(rec, false)
	var d8: Array = [Engine.time_scale, _bm().manual_paused, _r20_running(), _bm().deploy_menu_id == int(m8b.get("menu_id", -1))]
	_r19_close(rec, m8b)
	var e8: float = Engine.time_scale
	var ok8: bool = not m8.is_empty() and r8.get("ok") == true and float(r8.get("time_scale", -1)) == 0.1 and a8 == [0.1, true, true, int(m8.get("menu_id", -1))] \
		and open8.is_empty() and no_click8 and b8 == [2.0, true, true, 0] and st8.get("paused") == true and st8.get("deploy_slow") == false and float(st8.get("time_scale", -1)) == 2.0 \
		and c8 == [2.0, false, true] and not m8b.is_empty() and d8 == [0.1, false, true, true] and e8 == 2.0
	_check("R20-8 部署中暫停：暫停優先（凍結，倍率記 0.1）；暫停中不能開新選單；暫停中關閉選單 → 倍率 2 仍暫停，繼續後 2；保留選單直接繼續 → 0.1，關閉後 2",
		ok8, {"pause_reply": r8, "in_menu": a8, "new_menu": open8, "closed": b8, "stats": {"paused": st8.get("paused"), "deploy_slow": st8.get("deploy_slow"), "ts": st8.get("time_scale")}, "resumed": c8, "keep_menu": d8, "after_close": e8})

	# R20-9：暫停中選速度只記下偏好：選 1 倍 → 回覆成功、選擇 1、倍率 1，但仍暫停、仍凍結；繼續後 1 倍。
	# 重送同一個值冪等：暫停兩次、繼續兩次都成功，狀態只改一次
	_r20_pause(rec, true)
	var r9: Dictionary = _r19_speed(rec, 1.0)
	var a9: Array = [_bm().speed_pref, Engine.time_scale, _bm().manual_paused, _r20_frozen()]
	var n9: int = rec.sent_stats.size()
	var r9b: Dictionary = _r20_pause(rec, true)
	var dup_stats: int = rec.sent_stats.size() - n9
	_r20_pause(rec, false)
	var r9c: Dictionary = _r20_pause(rec, false)
	var ok9: bool = r9.get("ok") == true and int(r9.get("speed", -1)) == 1 and a9 == [1, 1.0, true, true] and r9b.get("ok") == true and r9b.get("paused") == true and dup_stats == 0 \
		and r9c.get("ok") == true and r9c.get("paused") == false and not _bm().manual_paused and _r20_running() and Engine.time_scale == 1.0
	_check("R20-9 暫停中選 1 倍：回覆成功、選擇與倍率 1，但仍暫停；重送暫停／繼續冪等（第二次成功、不再改狀態也不再送 stats）；繼續後 1 倍",
		ok9, {"speed_reply": r9, "during": a9, "dup_pause": r9b, "dup_stats": dup_stats, "dup_resume": r9c})

	# R20-10：拒絕且不改狀態：別場 → stale_battle（暫停中送別場的繼續也不會解除）；字串、數字、null、物件、沒有帶 → invalid_paused；結算後 → not_active
	var reasons10: Dictionary = {}
	var before10: Array = [_bm().manual_paused, Engine.time_scale, _bm().battle_id]
	reasons10["stale"] = _r20_pause(rec, true, "r20-old").get("reason")
	for v in ["true", 1.0, 0.0, null, {"x": 1}]:
		reasons10[JSON.stringify(v)] = _r20_pause(rec, v).get("reason")
	reasons10["missing"] = _r20_pause(rec, null, "", true).get("reason")
	var after10: Array = [_bm().manual_paused, Engine.time_scale, _bm().battle_id]
	_r20_pause(rec, true)
	var stale_resume: Dictionary = _r20_pause(rec, false, "r20-old")
	var still10: bool = _bm().manual_paused and _r20_frozen()
	_r20_pause(rec, false)
	var all_invalid: bool = true
	for k in reasons10:
		if k != "stale":
			all_invalid = all_invalid and reasons10[k] == "invalid_paused"
	var ok10: bool = reasons10["stale"] == "stale_battle" and all_invalid and before10 == after10 and stale_resume.get("reason") == "stale_battle" and stale_resume.get("paused") == true and still10
	_check("R20-10 拒絕且不改狀態：別場 stale_battle；字串 \"true\"、1、0、null、物件、沒有帶都是 invalid_paused；暫停中別場的繼續命令不解除（回覆 stale_battle、paused 仍 true）",
		ok10, {"reasons": reasons10, "before": before10, "after": after10, "stale_resume": stale_resume, "still_paused": still10})

	# R20-11：暫停中的操作一律由 Godot 拒絕（經過真實的 JSON 路徑）：開戰、切自動、部署武將與防禦塔、移位、升級、拆塔、改目標、
	# 點空格開部署選單、Godot 內的拖曳都不改狀態；暫停前開始的拖曳在暫停時取消。繼續後升級與開戰恢復可用
	_load(_r16_payload("r20-o1", [_r16_guan(1)], {}))
	var t11: Node = _r18_build("archer", Vector2i(1, 4))
	main._on_drag_tower_started("archer")
	var dragging0: bool = main._is_dragging
	_r20_pause(rec, true)
	var drag_cancelled: bool = not main._is_dragging
	main._on_tower_clicked(t11)
	var gold11: int = _bm().battle_gold
	var n_units: int = main.units_layer.get_child_count()
	var tt11: int = rec.sent_tower_targets.size()
	_r19_js(rec, {"type": "start_battle"})
	_r19_js(rec, {"type": "toggle_auto"})
	_r19_js(rec, {"type": "place_hero", "hero_id": "guan_yu", "cell_x": 5, "cell_y": 4})
	_r19_js(rec, {"type": "place_tower", "tower_type": "archer", "cell_x": 6, "cell_y": 4})
	_r19_js(rec, {"type": "request_move"})
	var moving: bool = main._is_dragging
	_r19_js(rec, {"type": "request_upgrade"})
	var sell11: Dictionary = _r18_sell(rec, t11.tower_uid, float(t11.get_sell_refund()))
	_r19_js(rec, {"type": "set_tower_target", "battle_id": "r20-o1", "tower_uid": t11.tower_uid, "mode": "strongest"})
	var click11: Dictionary = _r19_open(rec, 7)
	main._on_drag_hero_started({"hero_id": "guan_yu"})
	var hud_drag: bool = main._is_dragging
	main._on_unit_move_requested(t11)
	var move_drag: bool = main._is_dragging
	var a11: Dictionary = {"state": _bm().game_state, "wave": _bm().current_wave, "auto": _bm().auto_mode, "heroes": main._placed_heroes.size(), "units": main.units_layer.get_child_count(),
		"gold": _bm().battle_gold, "level": t11.tower_level, "mode": t11.target_mode, "alive": _alive(t11), "menu": _bm().deploy_menu_id}
	var rej11: bool = a11.state == 1 and a11.wave == 0 and a11.auto == false and a11.heroes == 0 and a11.units == n_units and a11.gold == gold11 and a11.level == 1 and a11.mode == "first" \
		and a11.alive and a11.menu == 0 and not moving and not hud_drag and not move_drag and sell11.get("reason") == "paused" and sell11.get("ok") == false and rec.sent_tower_targets.size() == tt11 and click11.is_empty()
	_r20_pause(rec, false)
	_r19_js(rec, {"type": "request_upgrade"})
	var lv_after: int = t11.tower_level
	_r19_js(rec, {"type": "start_battle"})
	var ok11: bool = dragging0 and drag_cancelled and rej11 and lv_after == 2 and _bm().game_state == BattleManager.GameState.BATTLE
	_check("R20-11 暫停中 Godot 拒絕操作：開戰、切自動、部署武將／防禦塔、移位（Web 命令與 Godot 內拖曳）、升級、拆塔（回覆 paused）、改目標、開部署選單都不改狀態；暫停前的拖曳被取消；繼續後升級與開戰可用",
		ok11, {"drag_before": dragging0, "drag_cancelled": drag_cancelled, "after": a11, "sell": sell11, "click": click11, "level_after_resume": lv_after, "state_after": _bm().game_state})

	# R20-12：新的一場清掉暫停：A 戰鬥中 2 倍並暫停 → 載入 B：B 未暫停、模擬節點恢復處理、倍率 1、B 的 stats paused false；
	# B 暫停後送 A 的繼續命令不解除（stale_battle）；同一關重來（新的 battle_id）也未暫停
	_load(_r19_payload("r20-n1"))
	_bm().player_start_battle()
	_r19_speed(rec, 2.0)
	_r20_pause(rec, true)
	var a12: Array = [_bm().manual_paused, _r20_frozen(), Engine.time_scale]
	_load(_r19_payload("r20-n2"))
	var st12: Dictionary = _r19_last_stats(rec)
	var b12: Array = [_bm().manual_paused, _r20_running(), Engine.time_scale, _bm().speed_pref]
	_r20_pause(rec, true)
	var old12: Dictionary = _r20_pause(rec, false, "r20-n1")
	var c12: Array = [_bm().manual_paused, _r20_frozen()]
	_load(_r19_payload("r20-n3"))
	var d12: Array = [_bm().manual_paused, _r20_running(), Engine.time_scale]
	var ok12: bool = a12 == [true, true, 2.0] and b12 == [false, true, 1.0, 1] and st12.get("paused") == false and st12.get("battle_id") == "r20-n2" and old12.get("reason") == "stale_battle" and c12 == [true, true] and d12 == [false, true, 1.0]
	_check("R20-12 新的一場清掉暫停：A（2 倍、暫停）→ B 未暫停、恢復處理、倍率 1、stats paused false；B 暫停時 A 的繼續命令不解除；同一關重來也未暫停",
		ok12, {"a": a12, "b": b12, "b_stats": {"paused": st12.get("paused"), "bid": st12.get("battle_id")}, "old_resume": old12, "b_paused": c12, "restart": d12})

	# R20-13：舊計時器無效：A 出兵中（間隔 1 秒）暫停後載入 B（不開戰）：A 的出兵計時器恢復倒數後觸發，但 B 沒有敵人、仍在備戰；
	# C 自動模式清波後等待下一波時暫停、載入 D：D 不會自己開波
	_load(_with_id(_payload("r20_t", [[_grp("a_slow", 3, 1.0)]]), "r20-t1"))
	spawned[0] = 0
	_bm().player_start_battle()
	await _wait_until_real(func(): return spawned[0] >= 1, 5.0)
	await _wait_real(0.2)
	_r20_pause(rec, true)
	var t13: int = _r20_timers().size()
	_load(_with_id(_payload("r20_t", [[_grp("a_slow", 3, 1.0)]]), "r20-t2"))
	var n13: int = spawned[0]
	await _wait_real(2.0)
	var sp13: int = spawned[0] - n13
	var b13: Dictionary = _state()
	_load(_with_id(_payload("r20_c", [[_grp("c_fast", 1, 0.1)], [_grp("c_fast", 1, 0.1)]]), "r20-c1"))
	var cleared: Array = [false]
	var cb13 := func(_n: int) -> void:
		if not cleared[0]:
			cleared[0] = true
			# 清波是在敵人的物理處理中發出的：暫停延到這一幀的處理結束後（實際的命令也是在兩幀之間從 Web 送來）
			_r20_pause.call_deferred(rec, true)
	_wm().wave_cleared.connect(cb13)
	_bm().toggle_auto_mode()
	await _wait_until_real(func(): return cleared[0], 5.0)
	_wm().wave_cleared.disconnect(cb13)
	var pend13: bool = _bm()._auto_wave_pending and _bm().manual_paused
	_load(_with_id(_payload("r20_c", [[_grp("c_fast", 1, 0.1)], [_grp("c_fast", 1, 0.1)]]), "r20-c2"))
	await _wait_real(2.5)
	var d13: Dictionary = _state()
	var ok13: bool = t13 >= 1 and sp13 == 0 and b13.state == 1 and b13.wave == 0 and b13.enemy_nodes.is_empty() and b13.active == 0 and pend13 and d13.state == 1 and d13.wave == 0 and d13.stage == "r20_c"
	_check("R20-13 舊計時器無效：A 出兵中暫停後載入 B，A 的出兵計時器之後觸發也不在 B 出兵（B 仍備戰、沒有敵人）；C 等待自動下一波時暫停、載入 D，D 不會自己開波",
		ok13, {"timers_at_pause": t13, "spawned_after_load": sp13, "b": b13, "pending_paused": pend13, "d": d13})

	# R20-14：自動下一波的等待也凍結：C 自動模式清波後 0.5 秒暫停，牆鐘 2 秒後仍在第 1 波、仍在等待，計時器剩約 1 秒；
	# 繼續後在剩下的時間到＋一幀開第 2 波（清波到開波的遊戲時間約 1.5 秒）
	_load(_with_id(_payload("r20_w", [[_grp("c_fast", 1, 0.1)], [_grp("a_slow", 1, 0.1)]]), "r20-w1"))
	var clear_t: Array = [-1.0]
	var cb14 := func(_n: int) -> void:
		if clear_t[0] < 0.0:
			clear_t[0] = _gt()
	_wm().wave_cleared.connect(cb14)
	_bm().toggle_auto_mode()
	await _wait_until_real(func(): return clear_t[0] >= 0.0, 5.0)
	_wm().wave_cleared.disconnect(cb14)
	var dm14: float = await _r20_until_gt(float(clear_t[0]) + 0.5)
	_r20_pause(rec, true)
	await _wait_real(2.0)
	var mid14: Array = [_bm().current_wave, _bm()._auto_wave_pending, _r20_timers()]
	var rem14: float = float(mid14[2][0]) if (mid14[2] as Array).size() == 1 else -1.0
	var t_r14: float = _gt()
	var w2_t: Array = [-1.0]
	var cbw := func(cur: int, _t: int) -> void:
		if cur == 2 and w2_t[0] < 0.0:
			w2_t[0] = _gt()
	_bm().wave_changed.connect(cbw)
	_r20_pause(rec, false)
	var dmax14: float = 0.0
	var prev14: float = _gt()
	var w_end14: int = Time.get_ticks_msec() + 10000
	while w2_t[0] < 0.0 and Time.get_ticks_msec() < w_end14:
		await process_frame
		dmax14 = maxf(dmax14, _gt() - prev14)
		prev14 = _gt()
	_bm().wave_changed.disconnect(cbw)
	var gap14: float = float(w2_t[0]) - t_r14
	var total14: float = float(w2_t[0]) - float(clear_t[0])
	var ok14: bool = mid14[0] == 1 and mid14[1] == true and rem14 > 0.9 and rem14 <= 1.0 + 0.0005 and gap14 >= rem14 - 0.0005 and gap14 <= rem14 + dmax14 + 0.0005 \
		and total14 >= 1.5 - 0.0005 and total14 <= 1.5 + maxf(dm14, dmax14) * 2.0 + 0.0005
	_check("R20-14 自動下一波的等待凍結：清波後 0.5 秒暫停，牆鐘 2 秒後仍第 1 波、仍等待、剩約 1 秒；繼續後在剩下的時間到＋一幀開第 2 波（清波到開波的遊戲時間約 1.5 秒）",
		ok14, {"mid": mid14, "remaining": rem14, "gap": gap14, "dmax": dmax14, "total": total14})

	# R20-15：灼燒與減速剩餘也凍結：周瑜命中後（灼燒中）加 1 秒疊加減速，暫停牆鐘 1.2 秒：灼燒倒數、剩餘跳數、減速剩餘、血量都不變；
	# 繼續後灼燒仍在命中後遊戲時間（物理時鐘，暫停時不前進）1、2、3 秒各跳一次（共 3 跳、不補跳）
	var e15: Node = await _r15_start(_r15_payload("r20_b", "r20-b1", [_r15_zhou()]))
	var ok15: bool = false
	var d15: Dictionary = {}
	if e15 != null:
		var h15: Dictionary = await _r15_hit_then_leave(e15, _zhou())
		e15.apply_stackable_slow(0.2, 1.0)
		var b15: Array = [e15.burn_state().next_in, e15.burn_state().ticks_left, e15._stack_slow_timer, e15.current_hp, _pt()]
		var r15: Dictionary = _r20_pause(rec, true)
		await _wait_real(1.2)
		var a15: Array = [e15.burn_state().next_in, e15.burn_state().ticks_left, e15._stack_slow_timer, e15.current_hp, _pt()]
		_r20_pause(rec, false)
		var dr15: Dictionary = await _r15_drops(e15, h15.t0, 3.6)
		var s15: Dictionary = _r15_split(dr15.drops, 100.0, 20.0)
		ok15 = r15.get("ok") == true and b15 == a15 and s15.bad.is_empty() and _r15_at(s15.ticks, [1.0, 2.0, 3.0], h15.dh)
		d15 = {"before": b15, "after": a15, "ticks": _r15_ts(s15.ticks), "bad": s15.bad}
	_check("R20-15 灼燒與減速凍結：暫停牆鐘 1.2 秒內灼燒倒數、剩餘跳數、減速剩餘、血量與物理時鐘都不變；繼續後灼燒在命中後 1、2、3 秒各跳一次（不補跳）", ok15, d15)

	# R20-16：外部測試自己設的 SceneTree.paused 不被這個功能解除：樹暫停時送速度 2、暫停、繼續：回覆都成功，SceneTree 仍暫停、遊戲時間不前進
	_load(_r19_payload("r20-x1"))
	paused = true
	var g16: float = _gt()
	var s16: Dictionary = _r19_speed(rec, 2.0)
	var p16: Dictionary = _r20_pause(rec, true)
	var q16: Dictionary = _r20_pause(rec, false)
	await _wait_real(0.3)
	var still16: bool = paused
	var g16b: float = _gt()
	paused = false
	var ok16: bool = s16.get("ok") == true and p16.get("ok") == true and q16.get("ok") == true and still16 and g16 == g16b and not _bm().manual_paused
	_check("R20-16 外部設的 SceneTree.paused 不被解除：樹暫停時速度 2、暫停、繼續的回覆都成功，SceneTree 仍暫停、遊戲時間不前進", ok16, {"speed": s16, "pause": p16, "resume": q16, "tree_paused": still16, "game_time": [g16, g16b]})

	# R20-17：結算清掉暫停（白箱：暫停中直接讓城池血量歸零觸發結算；正常遊戲暫停中不會結算）：結算內容屬於這一場（先建立再清狀態）；
	# 結算後未暫停、恢復處理、倍率 1；結算後的暫停命令 not_active
	_load(_r19_payload("r20-r1"))
	_bm().player_start_battle()
	_r19_speed(rec, 2.0)
	_r20_pause(rec, true)
	var ended17: int = battle_ended_count
	for i in range(MAX_HP):
		_bm().on_enemy_reached_base()
	var after17: Array = [_bm().manual_paused, _r20_running(), Engine.time_scale, _bm().game_state]
	var late17: Dictionary = _r20_pause(rec, true)
	var ok17: bool = battle_ended_count - ended17 == 1 and last_result.get("battle_id") == "r20-r1" and last_result.get("result") == "LOSE" and after17 == [false, true, 1.0, BattleManager.GameState.RESULT] \
		and late17.get("reason") == "not_active" and not _bm().manual_paused
	_check("R20-17 結算清掉暫停（白箱觸發）：結算一次、屬於這一場；之後未暫停、恢復處理、倍率 1；結算後的暫停命令 not_active",
		ok17, {"ended": battle_ended_count - ended17, "result": {"bid": last_result.get("battle_id"), "r": last_result.get("result")}, "after": after17, "late": late17})

	_wm().enemy_spawned.disconnect(on_spawn)
	rec.payload_received.disconnect(main._on_payload_received)
	rec.upgrade_unit_requested.disconnect(main._on_web_upgrade_unit)
	rec.start_battle_requested.disconnect(main._on_start_btn_pressed)
	rec.auto_toggle_requested.disconnect(main._on_auto_btn_pressed)
	rec.move_unit_requested.disconnect(main._on_web_move_unit)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 橫掃：關羽（普通攻擊命中後，主目標附近半徑 1 格內最多 2 名其他敵人各受這一擊的 50%）──
# 關羽攻擊力 100、射程 3 格、攻擊間隔 0.5 秒（_r12_payload 的設定）；敵人是不會移動、血量 99999 的 post（需要時直接改血量）。
# 確定性的單次攻擊：放置後停掉關羽自己的 _process，敵人放好位置後由測試呼叫一次 _process（冷卻為 0 → 立刻攻擊一次），
# 用每個敵人的血量變化、擊殺數與戰鬥金幣判斷。主目標是第一個生成的敵人（放在關羽右邊 2 格；路線進度相同時打清單裡的第一個）
func _sw_skill() -> Dictionary:
	return {"id": "sweep", "sweep_radius": 1.0, "sweep_max_targets": 2, "sweep_ratio": 0.5}

func _sw_guan(skill: Variant) -> Dictionary:
	return _r12_hero("guan_yu", skill)

## 目前關卡仍存活的敵人，依生成序號排列
func _sw_enemies() -> Array:
	var out: Array = []
	for e in _wm().get_active_enemies():
		if is_instance_valid(e) and not e.is_queued_for_deletion() and not e.is_dead():
			out.append(e)
	out.sort_custom(func(a, b): return a.spawn_seq < b.spawn_seq)
	return out

## 載入一場只有 n 個 post 的關卡、放置關羽、開戰並等 n 個敵人都出現（出生點離關羽 3.16 格，在射程外）。
## manual 為 true 時停掉關羽自己的 _process，由測試決定何時攻擊。team 是 null 時用帶橫掃的關羽
func _sw_start(battle_id: String, n: int, team: Variant = null, manual: bool = true) -> Array:
	var t: Array = team if team != null else [_sw_guan(_sw_skill())]
	_load(_r12_payload("sweep_a", [[_grp("post", n, 0.02)]], battle_id, t))
	_r12_place("guan_yu", Vector2i(3, 4))
	if manual and _guan() != null:
		_guan().set_process(false)
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() == n, 5.0)
	return _sw_enemies()

## 主目標（第一個）放在關羽右邊 2 格；其他敵人放在主目標加上 offs[i]（格）的位置。回傳中心（主目標的位置）
func _sw_place(es: Array, offs: Array) -> Vector2:
	var g: Node = _guan()
	var t: float = float(g.tile_size)
	var center: Vector2 = g.global_position + Vector2(2.0 * t, 0.0)
	for i in range(es.size()):
		var o: Vector2 = offs[i] if i < offs.size() else Vector2(6.0, 0.0)
		es[i].global_position = center + o * t
	return center

## 場上所有武將底下的橫掃範圍效果
func _sw_fx() -> Array:
	var out: Array = []
	for c in main.units_layer.get_children():
		if c is Hero:
			for k in c.get_children():
				if k is Hero.SweepFx and not k.is_queued_for_deletion():
					out.append(k)
	return out

## 關羽打一次（呼叫一次 _process；冷卻為 0 時 delta 0 就會攻擊，之後每次給一個攻擊間隔）。
## 回傳每個敵人這一次受到的傷害（被打倒的記成倒下前的血量）、擊殺數與戰鬥金幣的變化、橫掃統計與範圍效果數的變化
func _sw_hit(es: Array, delta: float = 0.0) -> Dictionary:
	var g: Node = _guan()
	var before: Array = []
	for e in es:
		before.append(e.current_hp if is_instance_valid(e) and not e.is_dead() else 0.0)
	var k0: int = _bm().kills
	var gold0: int = _bm().battle_gold
	var c0: int = g.sweep_count
	var h0: int = g.sweep_hits
	var fx0: int = _sw_fx().size()
	g._process(delta)
	var dmg: Array = []
	for i in range(es.size()):
		# 已被釋放的敵人不能指定給有型別的變數：先檢查再取血量
		var now: float = es[i].current_hp if is_instance_valid(es[i]) else 0.0
		dmg.append(snappedf(float(before[i]) - now, 0.01))
	return {"dmg": dmg, "kills": _bm().kills - k0, "gold": _bm().battle_gold - gold0, "count": g.sweep_count - c0, "hits": g.sweep_hits - h0, "fx": _sw_fx().size() - fx0}

## 同一次攻擊（同一幀）的血量下降：主目標 100 一筆、副目標 50 各一筆。回傳每次攻擊的時間與副目標數，以及不是 100／50 的下降
func _sw_attacks(r: Dictionary) -> Dictionary:
	var by_t: Dictionary = {}
	var bad: Array = []
	for h in r.hits:
		if not by_t.has(h.t):
			by_t[h.t] = {"main": 0, "side": 0}
		if is_equal_approx(float(h.dmg), 100.0):
			by_t[h.t]["main"] += 1
		elif is_equal_approx(float(h.dmg), 50.0):
			by_t[h.t]["side"] += 1
		else:
			bad.append(h)
	var ts: Array = by_t.keys()
	ts.sort()
	var sides: Array = []
	for t in ts:
		sides.append([by_t[t]["main"], by_t[t]["side"]])
	return {"t": ts, "per_attack": sides, "bad": bad}

## 真引擎：三個敵人（主目標與兩名 0.5 格內的副目標），記錄 sec 秒遊戲時間內每一次攻擊。回傳攻擊時間、每次的 [主, 副] 筆數、橫掃次數
func _sw_run(es: Array, sec: float) -> Dictionary:
	var c0: int = _guan().sweep_count
	var r: Dictionary = await _r19_hits(es, sec)
	var a: Dictionary = _sw_attacks(r)
	return {"t": a.t, "per_attack": a.per_attack, "bad": a.bad, "dmax": r.dmax, "count": _guan().sweep_count - c0}

## 每次攻擊都是主目標 100 一筆＋副目標 50 兩筆、攻擊時間符合累積時程（第一擊＋k × 0.5 秒，一幀之內）、橫掃次數等於攻擊次數
func _sw_run_ok(r: Dictionary, n_min: int, n_max: int) -> bool:
	if r.t.size() < n_min or r.t.size() > n_max or not r.bad.is_empty() or r.count != r.t.size():
		return false
	for p in r.per_attack:
		if p != [1, 2]:
			return false
	return _r16_interval_ok({"hits": r.t, "dmax": r.dmax}, 0.5)

func _sweep_cases() -> void:
	# 橫掃-0、1：Godot 讀到的參數；附近沒有其他敵人時就是普通攻擊
	var es: Array = await _sw_start("sweep-1", 2)
	if es.size() != 2 or _guan() == null:
		_check("橫掃 前置：等不到敵人或關羽沒有放置", false, {"enemies": es.size()})
		return
	var g: Node = _guan()
	var tile: float = float(g.tile_size)
	_check("橫掃-0 Godot 讀到關羽的橫掃參數（半徑 1 格、最多 2 名、50%）；敵人依出現順序帶生成序號 0、1",
		is_equal_approx(g.sweep_radius, 1.0) and g.sweep_max_targets == 2 and is_equal_approx(g.sweep_ratio, 0.5) and es[0].spawn_seq == 0 and es[1].spawn_seq == 1,
		{"radius": g.sweep_radius, "max": g.sweep_max_targets, "ratio": g.sweep_ratio, "seq": es.map(func(e): return e.spawn_seq)})
	_sw_place(es, [Vector2.ZERO, Vector2(6.0, 0.0)])
	var r1: Dictionary = _sw_hit(es)
	_check("橫掃-1 附近沒有其他敵人（另一個在 6 格外）：等同普通攻擊，主目標 100、其他 0；沒有橫掃、沒有範圍效果",
		r1.dmg == [100.0, 0.0] and r1.count == 0 and r1.hits == 0 and r1.fx == 0, r1)

	# 橫掃-2：一名其他敵人在 0.5 格 → 50；範圍效果在主目標被打中的位置、半徑 1 格
	var center: Vector2 = _sw_place(es, [Vector2.ZERO, Vector2(0.5, 0.0)])
	var r2: Dictionary = _sw_hit(es, g.attack_speed)
	var fx: Array = _sw_fx()
	_check("橫掃-2 一名其他敵人在 0.5 格：主目標 100、副目標 50（這一擊的 50%）；橫掃 1 次、打到 1 名",
		r2.dmg == [100.0, 50.0] and r2.count == 1 and r2.hits == 1, r2)
	_check("橫掃-2b 出現一個範圍效果：中心是主目標被打中的位置、半徑 1 格（%d 像素）" % int(tile),
		r2.fx == 1 and fx.size() == 1 and fx[0].global_position.is_equal_approx(center) and is_equal_approx(fx[0].radius, tile),
		{"fx": fx.size(), "pos": fx[0].global_position if fx.size() > 0 else null, "center": center, "radius": fx[0].radius if fx.size() > 0 else null})

	# 橫掃-3：範圍內 3 名 → 只打最近的 2 名（和出現順序無關）
	es = await _sw_start("sweep-3", 4)
	var r3: Dictionary = {}
	if es.size() == 4:
		_sw_place(es, [Vector2.ZERO, Vector2(0.9, 0.0), Vector2(0.0, 0.6), Vector2(0.0, -0.3)])
		r3 = _sw_hit(es)
	_check("橫掃-3 範圍內有 3 名其他敵人（0.9、0.6、0.3 格；先出現的最遠）：只打最近的 2 名（0.3、0.6 格各 50），0.9 格的 0",
		r3.get("dmg") == [100.0, 0.0, 50.0, 50.0] and r3.get("count") == 1 and r3.get("hits") == 2, r3)

	# 橫掃-4：邊界（正好 1 格算在內，1.02 格不算）；範圍外的不佔名額也不受傷
	es = await _sw_start("sweep-4", 3)
	var r4: Dictionary = {}
	var r4b: Dictionary = {}
	if es.size() == 3:
		_sw_place(es, [Vector2.ZERO, Vector2(0.0, 1.0), Vector2(1.02, 0.0)])
		r4 = _sw_hit(es)
		_sw_place(es, [Vector2.ZERO, Vector2(-0.6, -0.8), Vector2(0.0, -1.05)])
		r4b = _sw_hit(es, _guan().attack_speed)
	_check("橫掃-4 半徑含邊界：正下方正好 1 格的敵人受到 50；1.02 格的敵人 0（還有空的名額也不打）",
		r4.get("dmg") == [100.0, 50.0, 0.0] and r4.get("hits") == 1, r4)
	_check("橫掃-4b 斜向正好 1 格（0.6, 0.8）受到 50；1.05 格的 0",
		r4b.get("dmg") == [100.0, 50.0, 0.0] and r4b.get("hits") == 1, r4b)

	# 橫掃-5：距離相同時用生成序號（不是清單順序）：把副目標在 WaveManager 清單裡的順序倒過來
	es = await _sw_start("sweep-5", 4)
	var r5: Dictionary = {}
	if es.size() == 4:
		_sw_place(es, [Vector2.ZERO, Vector2(0.5, 0.0), Vector2(0.0, 0.5), Vector2(0.0, -0.5)])
		var act: Array = _wm().get_active_enemies()
		act.clear()
		act.append_array([es[0], es[3], es[2], es[1]])
		r5 = _sw_hit(es)
	_check("橫掃-5 三名其他敵人都在 0.5 格：打生成序號最小的 2 名（清單順序倒過來也一樣），序號最大的 0",
		r5.get("dmg") == [100.0, 50.0, 50.0, 0.0] and r5.get("hits") == 2, r5)

	# 橫掃-6：主目標被這一擊打倒，仍以它剛才的位置橫掃；擊殺與金幣只算一次
	es = await _sw_start("sweep-6", 3)
	var r6: Dictionary = {}
	if es.size() == 3:
		es[0].current_hp = 100.0
		_sw_place(es, [Vector2.ZERO, Vector2(0.5, 0.0), Vector2(0.0, 0.8)])
		r6 = _sw_hit(es)
		var k_hit: int = _bm().kills
		await process_frame
		await process_frame
		r6["kills_later"] = _bm().kills - k_hit
		r6["active_later"] = _wm().get_active_enemy_count()
	_check("橫掃-6 主目標被這一擊打倒（血量 100）：仍以它的位置橫掃，兩名副目標各 50；擊殺 1、金幣 +5，之後不再增加",
		r6.get("dmg") == [100.0, 50.0, 50.0] and r6.get("kills") == 1 and r6.get("gold") == BattleManager.GOLD_PER_KILL and r6.get("hits") == 2 and r6.get("kills_later") == 0 and r6.get("active_later") == 2, r6)

	# 橫掃-7：副目標被橫掃打倒：獎勵一次；下一擊不再選到它，名額給下一個
	es = await _sw_start("sweep-7", 4)
	var r7: Dictionary = {}
	var r7b: Dictionary = {}
	if es.size() == 4:
		es[1].current_hp = 50.0
		_sw_place(es, [Vector2.ZERO, Vector2(0.3, 0.0), Vector2(0.0, 0.6), Vector2(0.0, -0.9)])
		r7 = _sw_hit(es)
		await process_frame
		r7b = _sw_hit(es, _guan().attack_speed)
	_check("橫掃-7 副目標（血量 50）被橫掃打倒：擊殺 1、金幣 +5（只一次）；這一擊打 0.3、0.6 格，0.9 格的 0",
		r7.get("dmg") == [100.0, 50.0, 50.0, 0.0] and r7.get("kills") == 1 and r7.get("gold") == BattleManager.GOLD_PER_KILL, r7)
	_check("橫掃-7b 下一擊：已倒下的敵人不再被選到（不重複擊殺、不重複金幣），名額給 0.9 格的敵人",
		r7b.get("dmg") == [100.0, 0.0, 50.0, 50.0] and r7b.get("kills") == 0 and r7b.get("gold") == 0 and r7b.get("hits") == 2, r7b)

	# 橫掃-8：主目標與兩名副目標在同一擊全部倒下：擊殺 3、金幣 3 份、結算的擊殺數 3、只結算一次
	var ended0: int = battle_ended_count
	es = await _sw_start("sweep-8", 3)
	var r8: Dictionary = {}
	if es.size() == 3:
		es[0].current_hp = 100.0
		es[1].current_hp = 50.0
		es[2].current_hp = 30.0
		_sw_place(es, [Vector2.ZERO, Vector2(0.5, 0.0), Vector2(0.0, 0.5)])
		r8 = _sw_hit(es)
		await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 3.0)
		await _wait(0.3)
		r8["ended"] = battle_ended_count - ended0
		r8["result_kills"] = last_result.get("kills")
		r8["result_bid"] = last_result.get("battle_id")
	_check("橫掃-8 主目標與兩名副目標同一擊全部倒下：擊殺 3、金幣 +15；清波後只結算一次，結算的擊殺數是 3",
		r8.get("dmg") == [100.0, 50.0, 30.0] and r8.get("kills") == 3 and r8.get("gold") == 3 * BattleManager.GOLD_PER_KILL and r8.get("ended") == 1 and int(r8.get("result_kills", -1)) == 3 and r8.get("result_bid") == "sweep-8", r8)

	# 橫掃-9：不連鎖：六個敵人擠在一起，一擊只有主目標 100＋2 名副目標各 50（副目標受到的傷害不再引發橫掃）
	es = await _sw_start("sweep-9", 6)
	var r9: Dictionary = {}
	if es.size() == 6:
		_sw_place(es, [Vector2.ZERO, Vector2(0.2, 0.0), Vector2(0.0, 0.2), Vector2(-0.2, 0.0), Vector2(0.0, -0.2), Vector2(0.3, 0.0)])
		r9 = _sw_hit(es)
	_check("橫掃-9 不連鎖、不加攻擊：六個敵人擠在 0.3 格內，一擊只有主目標 100 與生成序號最小的 2 名各 50，其他 0（總傷害 200）",
		r9.get("dmg") == [100.0, 50.0, 50.0, 0.0, 0.0, 0.0] and r9.get("count") == 1 and r9.get("hits") == 2, r9)

	# 橫掃-10：不認得的技能 id（帶了橫掃參數）、沒有技能、參數不合理：都是普通攻擊
	var plain: Dictionary = {}
	var variants: Dictionary = {
		"unknown": {"id": "unknown_skill", "sweep_radius": 1.0, "sweep_max_targets": 2, "sweep_ratio": 0.5},
		"none": null,
		"radius0": {"id": "sweep", "sweep_radius": 0.0, "sweep_max_targets": 2, "sweep_ratio": 0.5},
		"max0": {"id": "sweep", "sweep_radius": 1.0, "sweep_max_targets": 0, "sweep_ratio": 0.5},
		"ratio0": {"id": "sweep", "sweep_radius": 1.0, "sweep_max_targets": 2, "sweep_ratio": 0.0},
	}
	for k in variants:
		es = await _sw_start("sweep-10-" + k, 2, [_sw_guan(variants[k])])
		if es.size() == 2:
			_sw_place(es, [Vector2.ZERO, Vector2(0.5, 0.0)])
			var rv: Dictionary = _sw_hit(es)
			plain[k] = {"dmg": rv.dmg, "ratio": _guan().sweep_ratio}
	var plain_ok: bool = plain.size() == variants.size()
	for k in plain:
		plain_ok = plain_ok and plain[k].dmg == [100.0, 0.0] and plain[k].ratio == 0.0
	_check("橫掃-10 不認得的技能 id（即使帶了橫掃參數）、沒有技能、半徑／人數／比例為 0：都當作普通攻擊（0.5 格的敵人 0）", plain_ok, plain)

	# 橫掃-11：移除關羽、切換關卡、新的一場：範圍效果跟著清除、不再有橫掃傷害、統計從 0 開始
	es = await _sw_start("sweep-11", 2)
	var d11: Dictionary = {}
	if es.size() == 2:
		_sw_place(es, [Vector2.ZERO, Vector2(0.5, 0.0)])
		_sw_hit(es)
		var fx_a: Array = _sw_fx()
		d11["fx_before"] = fx_a.size()
		main._on_payload_received({"type": "update_team", "team_list": []})
		await process_frame
		await process_frame
		d11["fx_after_remove"] = _sw_fx().size()
		d11["fx_node_freed"] = fx_a.size() == 1 and not is_instance_valid(fx_a[0])
		var hp_before: Array = es.map(func(e): return e.current_hp)
		await _wait(1.2)
		d11["no_damage_after_remove"] = es.map(func(e): return e.current_hp) == hp_before
		main._on_payload_received({"type": "update_team", "team_list": [_sw_guan(_sw_skill())]})
		_r12_place("guan_yu", Vector2i(3, 4))
		d11["replaced_count"] = _guan().sweep_count if _guan() != null else -1
		# 放回後照常橫掃（新的武將節點，統計從 0 開始）
		if _guan() != null:
			_guan().set_process(false)
			_sw_place(es, [Vector2.ZERO, Vector2(0.5, 0.0)])
			d11["replaced_hit"] = _sw_hit(es).dmg
	_check("橫掃-11 戰鬥中移除關羽：範圍效果跟著清除、之後 1.2 秒沒有任何傷害；放回後統計從 0 開始、照常橫掃",
		d11.get("fx_before") == 1 and d11.get("fx_after_remove") == 0 and d11.get("fx_node_freed") == true and d11.get("no_damage_after_remove") == true and d11.get("replaced_count") == 0 and d11.get("replaced_hit") == [100.0, 50.0], d11)
	var d11b: Dictionary = {}
	if _guan() != null:
		var fx_b: Array = _sw_fx()
		d11b["fx_alive"] = fx_b.size()
		_load(_stage_b())
		d11b["fx_out_of_tree"] = fx_b.size() == 1 and not fx_b[0].is_inside_tree()
		await process_frame
		d11b["fx_freed"] = fx_b.size() == 1 and not is_instance_valid(fx_b[0])
		es = await _sw_start("sweep-11b", 2)
		d11b["new_battle_count"] = _guan().sweep_count if _guan() != null else -1
		d11b["new_battle_fx"] = _sw_fx().size()
	_check("橫掃-11b 範圍效果還在時切換關卡：效果隨單位一起清除；新的一場的關羽橫掃次數從 0 開始、沒有殘留的效果",
		d11b.get("fx_alive") == 1 and d11b.get("fx_out_of_tree") == true and d11b.get("fx_freed") == true and d11b.get("new_battle_count") == 0 and d11b.get("new_battle_fx") == 0, d11b)

	# ── 真引擎（關羽自己攻擊）：倍率、部署慢速、暫停都用遊戲時間 ──
	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)
	var offs3: Array = [Vector2.ZERO, Vector2(0.5, 0.0), Vector2(0.0, 0.5)]

	# 橫掃-12：1× 與 2× 各記錄 3 秒遊戲時間：每次攻擊都是主目標 100＋兩名副目標 50（同一幀），
	# 攻擊時間符合累積時程（冷卻保留零頭），攻擊次數和理想（7 次）相差不超過 1、兩種倍率相差不超過 1
	var runs: Dictionary = {}
	for sp in [1.0, 2.0]:
		es = await _sw_start("sweep-12-x%d" % int(sp), 3, null, false)
		if es.size() != 3:
			continue
		_r19_speed(rec, sp)
		_sw_place(es, offs3)
		runs[sp] = await _sw_run(es, 3.0)
		runs[sp]["time_scale"] = Engine.time_scale
	var ok12: bool = runs.size() == 2
	for sp in runs:
		ok12 = ok12 and _sw_run_ok(runs[sp], 6, 8)
	if ok12:
		ok12 = absi(runs[1.0].t.size() - runs[2.0].t.size()) <= 1 and runs[2.0].time_scale == 2.0
	_check("橫掃-12 1× 與 2× 各 3 秒遊戲時間：每次攻擊都是主目標 100＋兩名副目標各 50，攻擊時間符合累積時程（第一擊＋k × 0.5 秒），次數 6～8 且兩種倍率相差不超過 1，橫掃次數＝攻擊次數", ok12, runs)

	# 橫掃-13：部署選單的暫時慢速（0.1×）：0.6 秒遊戲時間（約 6 秒）內攻擊 1～2 次，照樣是主目標 100＋兩名副目標 50
	es = await _sw_start("sweep-13", 3, null, false)
	var r13: Dictionary = {}
	if es.size() == 3:
		var menu: Dictionary = _r19_open(rec)
		r13["time_scale"] = Engine.time_scale
		_sw_place(es, offs3)
		r13["run"] = await _sw_run(es, 0.6)
		_r19_close(rec, menu)
	var ok13: bool = r13.has("run") and is_equal_approx(float(r13.time_scale), 0.1) and not r13.run.t.is_empty() and r13.run.t.size() <= 2 and r13.run.bad.is_empty() and r13.run.count == r13.run.t.size()
	if ok13:
		for p in r13.run.per_attack:
			ok13 = ok13 and p == [1, 2]
		if r13.run.t.size() == 2:
			ok13 = ok13 and float(r13.run.t[1]) - float(r13.run.t[0]) >= 0.5 - float(r13.run.dmax) - 0.0005
	_check("橫掃-13 部署選單開著（0.1×）：0.6 秒遊戲時間內攻擊 1～2 次，每次主目標 100＋兩名副目標 50，攻擊間隔照遊戲時間", ok13, r13)

	# 橫掃-14：範圍效果的時間是遊戲時間：1× 與 2× 都在 0.3 秒遊戲時間（± 一幀）後消失
	var life: Dictionary = {}
	for sp in [1.0, 2.0]:
		es = await _sw_start("sweep-14-x%d" % int(sp), 3, null, false)
		if es.size() != 3:
			continue
		_r19_speed(rec, sp)
		var c0: int = _guan().sweep_count
		_sw_place(es, offs3)
		await _wait_until(func(): return _guan().sweep_count > c0, 3.0)
		var fxs: Array = _sw_fx()
		if fxs.is_empty():
			continue
		var f: Node = fxs[0]
		var t0: float = _gt() - float(f.elapsed)
		var prev: float = _gt()
		var dmax: float = 0.0
		var wall_end: int = Time.get_ticks_msec() + 5000
		while is_instance_valid(f) and not f.is_queued_for_deletion() and Time.get_ticks_msec() < wall_end:
			await process_frame
			dmax = maxf(dmax, _gt() - prev)
			prev = _gt()
		life[sp] = {"life": snappedf(_gt() - t0, 0.0001), "dmax": snappedf(dmax, 0.0001), "time_scale": Engine.time_scale}
	var ok14: bool = life.size() == 2
	for sp in life:
		ok14 = ok14 and float(life[sp].life) >= 0.3 - 0.0005 and float(life[sp].life) <= 0.3 + float(life[sp].dmax) + 0.0005
	_check("橫掃-14 範圍效果 0.3 秒遊戲時間後消失：1× 與 2× 都在 0.3 秒到＋一幀之間", ok14, life)

	# 橫掃-15：手動暫停：範圍效果、攻擊冷卻、敵人血量、遊戲時間都不前進；繼續後效果照剩下的時間消失、攻擊照冷卻恢復
	es = await _sw_start("sweep-15", 3, null, false)
	var d15: Dictionary = {}
	if es.size() == 3:
		var c0: int = _guan().sweep_count
		_sw_place(es, offs3)
		await _wait_until(func(): return _guan().sweep_count > c0, 3.0)
		var fxs: Array = _sw_fx()
		d15["fx"] = fxs.size()
		if fxs.size() == 1:
			var f: Node = fxs[0]
			var p: Dictionary = _r20_pause(rec, true)
			d15["paused_reply"] = p.get("paused")
			var b: Array = [f.elapsed, _guan()._atk_timer, es.map(func(e): return e.current_hp), _gt(), _guan().sweep_count]
			await _wait_real(0.6)
			var a: Array = [f.elapsed if is_instance_valid(f) else -1.0, _guan()._atk_timer, es.map(func(e): return e.current_hp), _gt(), _guan().sweep_count]
			d15["frozen"] = is_instance_valid(f) and b == a
			d15["before"] = b
			d15["after"] = a
			_r20_pause(rec, false)
			var left: float = 0.3 - float(b[0])
			var tr: float = _gt()
			# 效果節點會被釋放：lambda 不直接捕捉它（捕捉到已釋放的物件會印出錯誤），改用 weakref
			var wr: WeakRef = weakref(f)
			await _wait_until_real(func(): return wr.get_ref() == null or wr.get_ref().is_queued_for_deletion(), 3.0)
			d15["fx_left"] = snappedf(left, 0.0001)
			d15["fx_gone_after"] = snappedf(_gt() - tr, 0.0001)
			var c1: int = _guan().sweep_count
			await _wait_until(func(): return _guan().sweep_count > c1, 3.0)
			d15["resumed_sweep"] = _guan().sweep_count > c1
	_check("橫掃-15 手動暫停 0.6 秒：範圍效果、攻擊冷卻、三個敵人的血量、遊戲時間與橫掃次數都不變；繼續後效果照剩下的時間消失，之後照常橫掃",
		d15.get("fx") == 1 and d15.get("paused_reply") == true and d15.get("frozen") == true and float(d15.get("fx_gone_after", 99.0)) <= float(d15.get("fx_left", 0.0)) + 0.1 and d15.get("resumed_sweep") == true, d15)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 飛行敵人與對空 ──
# 地圖：path_a 從 (0,5) 往右到 (4,5)、往上繞到第 2 列、再回到第 5 列到終點 (13,5)。飛行敵人沿第 5 列直線飛（13 格），
# 地面沿折線走（19 格）；(2,5) 是兩者都會經過的道路格。建築格：第 7 列、第 4 列的 5～8 欄、第 0 列的 3～10 欄
# 武將：每種職業一位（射程 3 格、攻擊間隔 0.5 秒、攻擊力 100）；周瑜（法師）與關羽（步兵）另外用來測火攻與橫掃
const FLY_JOBS: Dictionary = {
	"fly_archer": "archer", "fly_mage": "mage", "fly_inf": "infantry", "fly_cav": "cavalry",
	"fly_art": "artillery", "fly_odd": "spear", "fly_none": null,
}
## 能對空的職業（和 Hero.AIR_JOBS 對照；測試自己寫一份，不讀遊戲的常數）
const FLY_AIR_HEROES: Array = ["fly_archer", "fly_mage"]
## 防禦塔：能不能打（文士塔是減速）飛行
const FLY_TOWERS: Dictionary = {"archer": true, "infantry": false, "artillery": false, "cavalry": false, "scholar": true}

func _fly_path_json() -> Dictionary:
	var bz: Array = []
	for c in range(1, 13):
		bz.append([c, 7])
	for c in range(5, 9):
		bz.append([c, 4])
	for c in range(3, 11):
		bz.append([c, 0])
	return {"cols": 14, "rows": 11, "paths": {"path_a": [[0, 5], [4, 5], [4, 2], [9, 2], [9, 5], [13, 5]]},
		"spawn": [0, 5], "base": [13, 5], "build_zones": bz, "obstacles": []}

func _fly_hero_cfg(hid: String, job: Variant) -> Dictionary:
	var c: Dictionary = {"hero_id": hid, "name": hid, "attack_range": 3.0, "attack_speed": 0.5}
	if job != null:
		c["job"] = job
	return c

func _fly_payload(battle_id: String, waves: Array, team: Array = []) -> Dictionary:
	var p: Dictionary = _r12_payload("fly_a", waves, battle_id, team)
	var hc: Array = []
	for hid in FLY_JOBS:
		hc.append(_fly_hero_cfg(hid, FLY_JOBS[hid]))
	hc.append(_fly_hero_cfg("zhou_yu", "mage"))
	hc.append(_fly_hero_cfg("guan_yu", "infantry"))
	p["heroes_config"] = hc
	p["map"]["path_json"] = _fly_path_json()
	return p

## 載入一場（一波，groups 同時出兵）、放置武將（cells：hero_id → 格子）與防禦塔、開戰、等 n 個敵人都出現。回傳依生成序號排列的敵人
func _fly_start(battle_id: String, groups: Array, n: int, team: Array = [], cells: Dictionary = {}, towers: Dictionary = {}) -> Array:
	_load(_fly_payload(battle_id, [groups], team))
	for hid in cells:
		_r12_place(hid, cells[hid])
	for tt in towers:
		main._on_web_place_tower({"tower_type": tt, "cell_x": towers[tt].x, "cell_y": towers[tt].y})
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() == n, 5.0)
	return _sw_enemies()

## 格子中心的世界座標
func _fly_cell(c: int, r: int) -> Vector2:
	return main.game_map.grid_to_world(Vector2i(c, r))

## 點到線段的距離
func _fly_seg_dist(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab: Vector2 = b - a
	var t: float = clampf((p - a).dot(ab) / maxf(ab.length_squared(), 0.000001), 0.0, 1.0)
	return p.distance_to(a + ab * t)

## 點到折線的距離
func _fly_poly_dist(p: Vector2, pts: Array) -> float:
	var d: float = INF
	for i in range(pts.size() - 1):
		d = minf(d, _fly_seg_dist(p, pts[i], pts[i + 1]))
	return d

func _fly_hero(hid: String) -> Node:
	var h = main._placed_heroes.get(hid)
	return h if h != null and is_instance_valid(h) else null

func _fly_snapshot(rec: Node) -> Dictionary:
	var n: int = rec.sent_snapshots.size()
	main._on_debug_snapshot_requested("fly-snap")
	return rec.sent_snapshots.back() if rec.sent_snapshots.size() > n else {}

func _flying_cases() -> void:
	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)
	var line_a: Vector2 = Vector2.ZERO
	var line_b: Vector2 = Vector2.ZERO

	# 飛行-0：movement_type 的判讀（去掉前後空白後等於 flying 才是飛行）；飛行只有起點與終點兩個路點，
	# 剩餘路程：飛行＝直線 13 格、地面＝折線 19 格；測試快照帶每個敵人的移動方式與剩餘路程
	var es: Array = await _fly_start("fly-0", [_grp("fly_post", 1, 0.02), _grp("gnd_post", 1, 0.02), _grp("fly_pad", 1, 0.02),
		_grp("fly_caps", 1, 0.02), _grp("fly_air", 1, 0.02), _grp("fly_blank", 1, 0.02), _grp("post", 1, 0.02)], 7)
	var d0: Dictionary = {}
	if es.size() == 7:
		var t: float = float(es[0].tile_size)
		d0["moves"] = es.map(func(e): return e.movement_type)
		d0["wps"] = es.map(func(e): return e._waypoints.size())
		d0["remaining"] = es.map(func(e): return snappedf(e.get_remaining_distance() / t, 0.001))
		var snap: Dictionary = _fly_snapshot(rec)
		var sm: Array = []
		for e in es:
			sm.append(snap.get("enemy_move", {}).get(str(e.get_instance_id())))
		d0["snap_moves"] = sm
		d0["snap_rem"] = snappedf(float(snap.get("enemy_remaining", {}).get(str(es[0].get_instance_id()), -1.0)), 0.001)
		line_a = es[0]._waypoints[0]
		line_b = es[0]._waypoints[1]
	var want_moves: Array = ["flying", "ground", "flying", "ground", "ground", "ground", "ground"]
	_check("飛行-0 movement_type：flying 與前後有空白的「 flying 」是飛行；Flying（大小寫不同）、air、空白、沒有這個欄位都是地面。飛行只有起點與終點兩個路點（地面 6 個）；剩餘路程飛行 13 格（直線）、地面 19 格（折線）；測試快照帶移動方式與剩餘路程",
		d0.get("moves") == want_moves and d0.get("wps") == [2, 6, 2, 6, 6, 6, 6] and is_equal_approx(float(d0.get("remaining", [0])[0]), 13.0) and is_equal_approx(float(d0.get("remaining", [0, 0])[1]), 19.0) and d0.get("snap_moves") == want_moves and is_equal_approx(float(d0.get("snap_rem", -1.0)), 13.0), d0)

	# 飛行-1：同時出發、速度相同：飛行沿第 5 列直線飛（每一幀都在起點到終點的直線上、x 只增不減），
	# 地面沿折線走（每一幀都在折線上、最高離開直線 3 格）；飛行先到。兩隻都抵達基地：城池 -2（各一次）、這一場只結算一次、勝利
	var ended1: int = battle_ended_count
	es = await _fly_start("fly-1", [_grp("gnd_run", 1, 0.02), _grp("fly_run", 1, 0.02)], 2)
	var d1: Dictionary = {}
	if es.size() == 2:
		var g: Node = es[0]
		var f: Node = es[1]
		var t: float = float(g.tile_size)
		var poly: Array = g._waypoints.duplicate()
		var fa: Vector2 = f._waypoints[0]
		var fb: Vector2 = f._waypoints[1]
		var f_off: float = 0.0
		var g_off: float = 0.0
		var g_dev: float = 0.0
		var f_back: float = 0.0
		var prev_fx: float = f.position.x
		var f_gone: float = -1.0
		var g_gone: float = -1.0
		var t0: float = _gt()
		var hp0: int = _bm().base_hp
		var wall_end: int = Time.get_ticks_msec() + 15000
		var gr: WeakRef = weakref(g)
		var fr: WeakRef = weakref(f)
		while Time.get_ticks_msec() < wall_end and (f_gone < 0.0 or g_gone < 0.0):
			await process_frame
			var fo = fr.get_ref()
			var go = gr.get_ref()
			if fo != null and not fo.is_queued_for_deletion():
				f_off = maxf(f_off, _fly_seg_dist(fo.position, fa, fb))
				f_back = maxf(f_back, prev_fx - fo.position.x)
				prev_fx = fo.position.x
			elif f_gone < 0.0:
				f_gone = _gt() - t0
			if go != null and not go.is_queued_for_deletion():
				g_off = maxf(g_off, _fly_poly_dist(go.position, poly))
				g_dev = maxf(g_dev, _fly_seg_dist(go.position, fa, fb))
			elif g_gone < 0.0:
				g_gone = _gt() - t0
		await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 3.0)
		await _wait(0.2)
		d1 = {"f_off_px": snappedf(f_off, 0.001), "f_back_px": snappedf(f_back, 0.001), "g_off_px": snappedf(g_off, 0.001), "g_dev_tiles": snappedf(g_dev / t, 0.01),
			"f_arrive": snappedf(f_gone, 0.01), "g_arrive": snappedf(g_gone, 0.01), "hp_lost": hp0 - _bm().base_hp, "ended": battle_ended_count - ended1,
			"result": last_result.get("result"), "kills": last_result.get("kills")}
	_check("飛行-1 折線地圖上同時出發：飛行每一幀都在起點到終點的直線上（偏離 ≤ 0.5 像素、不往回飛），地面每一幀都在折線上（≤ 0.5 像素）且最高離開直線約 3 格；飛行先抵達。兩隻都抵達基地：城池各扣一次（共 2）、只結算一次（勝利、擊殺 0）",
		d1.get("f_off_px", 99.0) <= 0.5 and d1.get("f_back_px", 99.0) <= 0.001 and d1.get("g_off_px", 99.0) <= 0.5 and d1.get("g_dev_tiles", 0.0) >= 2.9 and
			d1.get("f_arrive", -1.0) > 0.0 and d1.get("g_arrive", -1.0) > d1.get("f_arrive", 99.0) and d1.get("hp_lost") == 2 and d1.get("ended") == 1 and d1.get("result") == "WIN" and d1.get("kills") == 0, d1)

	# 飛行-2：武將不擋飛行、飛行不攻擊武將。(2,5) 是兩條路都會經過的道路格，放一位只打地面的步兵武將：
	# a. 只有飛行（每秒 40 像素）：飛過武將的格子繼續前進（沒有停下、沒有被緩速），武將血量不變，飛行血量也不變（步兵打不到）
	# b. 只有地面（對照；每秒 240 像素，道路武將的緩速下也很快走到）：在武將的格子前停下、攻擊武將（武將扣血），武將打得到它
	# c. 能對空的弓兵武將在道路上：打得到飛行，但不施加阻擋用的緩速，飛行照常飛過
	var d2: Dictionary = {}
	for k in ["a", "b", "c"]:
		var hid: String = "fly_archer" if k == "c" else "fly_inf"
		var grp: Dictionary = _grp("gnd_run", 1, 0.02) if k == "b" else _grp("fly_walk", 1, 0.02)
		es = await _fly_start("fly-2" + k, [grp], 1, [_r12_hero(hid, null)], {hid: Vector2i(2, 5)})
		var h: Node = _fly_hero(hid)
		if es.size() != 1 or h == null:
			d2[k] = {"setup": false}
			continue
		var e: Node = es[0]
		var t: float = float(h.tile_size)
		var hx: float = h.position.x
		var min_mult: float = 1.0
		var wr: WeakRef = weakref(e)
		var t_end: float = _gt() + 5.0
		var wall_end: int = Time.get_ticks_msec() + 20000
		while _gt() < t_end and Time.get_ticks_msec() < wall_end:
			await process_frame
			var eo = wr.get_ref()
			if eo == null or eo.is_queued_for_deletion():
				break
			min_mult = minf(min_mult, eo.speed_mult)
		var eo2 = wr.get_ref()
		d2[k] = {"passed_tiles": snappedf(((eo2.position.x if eo2 != null else INF) - hx) / t, 0.01), "hero_hp": snappedf(h.current_hp, 0.01),
			"enemy_dmg": snappedf(99999.0 - (eo2.current_hp if eo2 != null else 99999.0), 0.01), "min_mult": min_mult,
			"blocked": eo2 != null and eo2._blocker != null}
	_check("飛行-2a 只打地面的步兵武將在飛行必經的道路格：飛行飛過武將繼續前進（5 秒後在武將右邊 1 格以上）、沒有被擋也沒有被緩速；武將血量不變（飛行不攻擊武將）、飛行血量不變（步兵打不到）",
		d2.get("a", {}).get("passed_tiles", 0.0) >= 1.0 and d2.get("a", {}).get("hero_hp") == 1000.0 and d2.get("a", {}).get("enemy_dmg") == 0.0 and d2.get("a", {}).get("min_mult") == 1.0 and d2.get("a", {}).get("blocked") == false, d2.get("a"))
	_check("飛行-2b 對照：地面敵人在同一格前被擋下、停在武將左邊並攻擊武將（武將扣血），步兵武將打得到地面",
		d2.get("b", {}).get("passed_tiles", 99.0) < 0.0 and d2.get("b", {}).get("blocked") == true and float(d2.get("b", {}).get("hero_hp", 1000.0)) < 1000.0 and float(d2.get("b", {}).get("enemy_dmg", 0.0)) > 0.0, d2.get("b"))
	_check("飛行-2c 能對空的弓兵武將在道路上：打得到飛行，但不施加阻擋用的緩速（移動倍率一直是 1），飛行照常飛過、不攻擊武將",
		float(d2.get("c", {}).get("enemy_dmg", 0.0)) > 0.0 and d2.get("c", {}).get("min_mult") == 1.0 and d2.get("c", {}).get("passed_tiles", 0.0) >= 1.0 and d2.get("c", {}).get("hero_hp") == 1000.0, d2.get("c"))

	# 飛行-3：武將的對空矩陣。每種職業放在建築格 (6,4)，a. 只有飛行在射程內（1 格）、b. 只有地面在射程內，各看 1.2 秒遊戲時間的傷害。
	# 弓兵、法師：a、b 都打；步兵、騎兵、砲兵、不認得的職業、沒有職業：a 不打（也沒有別的目標）、b 打
	var d3: Dictionary = {}
	var ok3: bool = true
	for hid in FLY_JOBS:
		es = await _fly_start("fly-3-" + hid, [_grp("fly_post", 1, 0.02), _grp("gnd_post", 1, 0.02)], 2, [_r12_hero(hid, null)], {hid: Vector2i(6, 4)})
		var h: Node = _fly_hero(hid)
		if es.size() != 2 or h == null:
			d3[hid] = "setup"
			ok3 = false
			continue
		var t: float = float(h.tile_size)
		var pair: Dictionary = {"f": es[0], "g": es[1]}
		es[0].global_position = h.global_position + Vector2(1.0, 0.0) * t
		es[1].global_position = h.global_position + Vector2(-9.0, 0.0) * t
		var ra: Dictionary = await _r17_hits(pair, 1.2)
		es[0].global_position = h.global_position + Vector2(9.0, 0.0) * t
		es[1].global_position = h.global_position + Vector2(-1.0, 0.0) * t
		var rb: Dictionary = await _r17_hits(pair, 1.2)
		var air: bool = FLY_AIR_HEROES.has(hid)
		var snap: Dictionary = _fly_snapshot(rec)
		d3[hid] = {"air_dmg": ra.dmg.f, "ground_in_a": ra.dmg.g, "ground_dmg": rb.dmg.g, "air_in_b": rb.dmg.f, "can_hit_air": h.can_hit_air, "snap_air": snap.get("hero_air", {}).get(hid)}
		ok3 = ok3 and ((float(ra.dmg.f) > 0.0) == air) and float(ra.dmg.g) == 0.0 and float(rb.dmg.g) > 0.0 and float(rb.dmg.f) == 0.0 and h.can_hit_air == air and snap.get("hero_air", {}).get(hid) == air
	_check("飛行-3 武將的對空矩陣：弓兵、法師打得到飛行；步兵、騎兵、砲兵、不認得的職業（spear）、沒有職業都打不到飛行（射程內只有飛行時不攻擊）；每一種都打得到地面；測試快照的 hero_air 相同", ok3, d3)

	# 飛行-4：防禦塔的對空矩陣。每種塔放在 (6,4)，a. 只有飛行在射程內（1 格）、b. 只有地面在射程內，各看 3.3 秒（砲兵塔的間隔 3 秒）。
	# 弓兵塔打得到飛行；文士塔對飛行疊加減速；步兵塔（包括緩速光環）、騎兵塔、砲兵塔對飛行沒有任何作用；每一種都作用於地面
	var d4: Dictionary = {}
	var ok4: bool = true
	for tt in FLY_TOWERS:
		es = await _fly_start("fly-4-" + tt, [_grp("fly_post", 1, 0.02), _grp("gnd_post", 1, 0.02)], 2, [], {}, {tt: Vector2i(6, 4)})
		var tw: Node = main.game_map.get_occupant(Vector2i(6, 4))
		if es.size() != 2 or tw == null:
			d4[tt] = "setup"
			ok4 = false
			continue
		var t: float = float(tw.tile_size)
		var pair: Dictionary = {"f": es[0], "g": es[1]}
		es[0].global_position = tw.global_position + Vector2(1.0, 0.0) * t
		es[1].global_position = tw.global_position + Vector2(-9.0, 0.0) * t
		var ra: Dictionary = await _r17_hits(pair, 3.3)
		es[0].global_position = tw.global_position + Vector2(9.0, 0.0) * t
		es[1].global_position = tw.global_position + Vector2(-1.0, 0.0) * t
		var rb: Dictionary = await _r17_hits(pair, 3.3)
		var air: bool = FLY_TOWERS[tt]
		var scholar: bool = tt == "scholar"
		var a_effect: bool = float(ra.stack.f) > 0.0 if scholar else float(ra.dmg.f) > 0.0
		var b_effect: bool = float(rb.stack.g) > 0.0 if scholar else float(rb.dmg.g) > 0.0
		var snap: Dictionary = _fly_snapshot(rec)
		var snap_air = snap.get("tower_targets", {}).get(tw.tower_uid, {}).get("air")
		d4[tt] = {"air_effect": a_effect, "air_dmg": ra.dmg.f, "air_stack": ra.stack.f, "air_slow": ra.slow.f, "ground_effect": b_effect, "ground_dmg": rb.dmg.g, "ground_slow": rb.slow.g, "can_hit_air": tw.can_hit_air, "snap_air": snap_air}
		ok4 = ok4 and a_effect == air and b_effect and float(ra.slow.f) == 1.0 and float(rb.dmg.f) == 0.0 and tw.can_hit_air == air and snap_air == air
		if scholar:
			ok4 = ok4 and float(ra.dmg.f) == 0.0
		if tt == "infantry":
			ok4 = ok4 and float(rb.slow.g) < 1.0
	_check("飛行-4 防禦塔的對空矩陣：弓兵塔打得到飛行、文士塔對飛行疊加減速；步兵塔（緩速光環也不作用）、騎兵塔、砲兵塔對飛行沒有傷害也沒有減速；每一種都作用於地面（步兵塔緩速地面）；測試快照的 air 相同", ok4, d4)

	# 飛行-5a：砲兵塔的範圍傷害不波及飛行：主要目標是地面，另一個地面（0.5 格）與一個飛行（0.5 格）都在範圍內 → 兩個地面各 80、飛行 0
	es = await _fly_start("fly-5a", [_grp("gnd_post", 2, 0.02), _grp("fly_post", 1, 0.02)], 3, [], {}, {"artillery": Vector2i(6, 4)})
	var d5: Dictionary = {}
	var art: Node = main.game_map.get_occupant(Vector2i(6, 4))
	if es.size() == 3 and art != null:
		var t: float = float(art.tile_size)
		var gs: Array = es.filter(func(e): return not e.is_flying())
		var fs: Array = es.filter(func(e): return e.is_flying())
		var c: Vector2 = art.global_position + Vector2(1.5, 0.0) * t
		gs[0].global_position = c
		gs[1].global_position = c + Vector2(0.5, 0.0) * t
		fs[0].global_position = c + Vector2(0.0, 0.5) * t
		var r5: Dictionary = await _r17_hits({"g1": gs[0], "g2": gs[1], "f": fs[0]}, 3.3)
		d5["artillery"] = {"dmg": r5.dmg, "aoe_px": art.aoe_radius, "f_dist_px": snappedf(0.5 * t, 0.01)}
	_check("飛行-5a 砲兵塔的範圍傷害：主要目標與 0.5 格內的另一個地面各受 80，0.5 格內的飛行 0（範圍傷害先過能否攻擊）",
		d5.has("artillery") and float(d5.artillery.dmg.g1) > 0.0 and is_equal_approx(float(d5.artillery.dmg.g1), float(d5.artillery.dmg.g2)) and float(d5.artillery.dmg.f) == 0.0, d5.get("artillery"))

	# 飛行-5b：關羽（步兵）的橫掃不掃到飛行：主目標（地面）0.5 格內有一個飛行、一個地面 → 地面副目標 50、飛行 0，橫掃 1 次只打到 1 名
	es = await _fly_start("fly-5b", [_grp("gnd_post", 2, 0.02), _grp("fly_post", 1, 0.02)], 3, [_r12_hero("guan_yu", _sw_skill())], {"guan_yu": Vector2i(6, 4)})
	var g5: Node = _fly_hero("guan_yu")
	var r5b: Dictionary = {}
	if es.size() == 3 and g5 != null:
		g5.set_process(false)
		var t: float = float(g5.tile_size)
		var gs: Array = es.filter(func(e): return not e.is_flying())
		var fs: Array = es.filter(func(e): return e.is_flying())
		var c: Vector2 = g5.global_position + Vector2(2.0, 0.0) * t
		gs[0].global_position = c
		fs[0].global_position = c + Vector2(0.5, 0.0) * t
		gs[1].global_position = c + Vector2(0.0, 0.5) * t
		var before: Array = [gs[0].current_hp, gs[1].current_hp, fs[0].current_hp]
		var c0: int = g5.sweep_count
		var h0: int = g5.sweep_hits
		g5._process(0.0)
		r5b = {"dmg": [before[0] - gs[0].current_hp, before[1] - gs[1].current_hp, before[2] - fs[0].current_hp], "count": g5.sweep_count - c0, "hits": g5.sweep_hits - h0}
	_check("飛行-5b 關羽（步兵）的橫掃：主目標 100、0.5 格內的地面副目標 50、0.5 格內的飛行 0；橫掃 1 次、只打到 1 名（飛行不佔名額）",
		r5b.get("dmg") == [100.0, 50.0, 0.0] and r5b.get("count") == 1 and r5b.get("hits") == 1, r5b)

	# 飛行-6：周瑜（法師）打得到飛行，火攻照樣附加：第一擊後就在灼燒（每跳 20＝攻擊力 100 × 20%）；
	# 之後 2.3 秒的總傷害＝普通攻擊 100 的倍數＋跳傷 20 的倍數（跳傷可能和普通攻擊落在同一幀，所以看總和除以 100 的餘數）
	es = await _fly_start("fly-6", [_grp("fly_post", 1, 0.02)], 1, [_r12_hero("zhou_yu", {"id": "burn", "burn_ratio": 0.2, "burn_ticks": 3, "burn_interval": 1.0})], {"zhou_yu": Vector2i(6, 4)})
	var zy: Node = _fly_hero("zhou_yu")
	var d6: Dictionary = {}
	if es.size() == 1 and zy != null:
		var f6: Node = es[0]
		var hp6: float = f6.current_hp
		f6.global_position = zy.global_position + Vector2(1.0, 0.0) * float(zy.tile_size)
		await _wait_until(func(): return f6.current_hp < hp6, 3.0)
		d6["first_hit"] = hp6 - f6.current_hp
		d6["burning"] = f6.is_burning()
		d6["burn_damage"] = f6.burn_state().damage
		await _wait(2.3)
		var total: float = hp6 - f6.current_hp
		d6["total"] = total
		d6["burn_part"] = fmod(total, 100.0)
	_check("飛行-6 周瑜（法師）打得到飛行，命中後附加火攻：第一擊 100 後在灼燒、每跳 20；之後的總傷害除以 100 餘 20 的倍數（有跳傷）",
		d6.get("first_hit") == 100.0 and d6.get("burning") == true and d6.get("burn_damage") == 20.0 and float(d6.get("burn_part", 0.0)) > 0.0 and is_equal_approx(fmod(float(d6.get("burn_part", 1.0)), 20.0), 0.0), d6)

	# 飛行-7：防禦塔「優先前方」用剩餘路程（地面沿折線、飛行直線），不是路點比例。弓兵塔在 (6,4)，敵人都不會移動：
	# a. 地面在最後一段路（路點比例 5/6 很高）但剩餘 7.4 格；飛行剩餘 5.5 格 → 打飛行（用路點比例會打地面）
	# b. 飛行移到剩餘 9 格 → 改打地面
	# c. 兩個地面在同一段路（路點比例相同）：離下一個路點較近的剩餘較短 → 打後出現的那個（只看路點比例會打清單第一個）
	# d. 兩個飛行在同一個位置（剩餘相同）：維持清單順序，打先出現的；重複兩次結果相同
	es = await _fly_start("fly-7", [_grp("gnd_post", 2, 0.02), _grp("fly_post", 2, 0.02)], 4, [], {}, {"archer": Vector2i(6, 4)})
	var tw7: Node = main.game_map.get_occupant(Vector2i(6, 4))
	var d7: Dictionary = {}
	if es.size() == 4 and tw7 != null:
		var t: float = float(tw7.tile_size)
		var gs: Array = es.filter(func(e): return not e.is_flying())
		var fs: Array = es.filter(func(e): return e.is_flying())
		var far: Vector2 = tw7.global_position + Vector2(0.0, 9.0) * t
		gs[0]._wp_index = 5
		gs[0].global_position = tw7.global_position + Vector2(0.0, -1.5) * t
		fs[0].global_position = tw7.global_position + Vector2(1.5, 0.8) * t
		gs[1].global_position = far
		fs[1].global_position = far
		var rem_a: Dictionary = {"g": snappedf(gs[0].get_remaining_distance() / t, 0.01), "f": snappedf(fs[0].get_remaining_distance() / t, 0.01), "g_ratio": snappedf(gs[0].get_progress_ratio(), 0.01), "f_ratio": snappedf(fs[0].get_progress_ratio(), 0.01)}
		await _r17_wait_hit({"g": gs[0], "f": fs[0]})
		var ra: Dictionary = await _r17_hits({"g": gs[0], "f": fs[0]}, 1.7)
		fs[0].global_position = tw7.global_position + Vector2(-2.0, 0.5) * t
		var rem_b: Dictionary = {"g": snappedf(gs[0].get_remaining_distance() / t, 0.01), "f": snappedf(fs[0].get_remaining_distance() / t, 0.01)}
		await _r17_wait_hit({"g": gs[0], "f": fs[0]})
		var rb: Dictionary = await _r17_hits({"g": gs[0], "f": fs[0]}, 1.7)
		# c：兩個地面都在最後一段路，後出現的（gs[1]）離終點較近
		fs[0].global_position = far
		gs[1]._wp_index = 5
		gs[0].global_position = tw7.global_position + Vector2(-1.0, 1.0) * t
		gs[1].global_position = tw7.global_position + Vector2(1.0, 1.0) * t
		await _r17_wait_hit({"g1": gs[0], "g2": gs[1]})
		var rc: Dictionary = await _r17_hits({"g1": gs[0], "g2": gs[1]}, 1.7)
		# d：兩個飛行在同一個位置
		gs[0].global_position = far
		gs[1].global_position = far
		fs[0].global_position = tw7.global_position + Vector2(1.0, 1.0) * t
		fs[1].global_position = fs[0].global_position
		await _r17_wait_hit({"f1": fs[0], "f2": fs[1]})
		var rd1: Dictionary = await _r17_hits({"f1": fs[0], "f2": fs[1]}, 1.7)
		var rd2: Dictionary = await _r17_hits({"f1": fs[0], "f2": fs[1]}, 1.7)
		d7 = {"rem_a": rem_a, "a": ra.dmg, "rem_b": rem_b, "b": rb.dmg, "c": rc.dmg, "d1": rd1.dmg, "d2": rd2.dmg}
	_check("飛行-7a 地面在最後一段路（路點比例 0.83）但剩餘 7.4 格、飛行剩餘 5.5 格（比例 0.58）：「優先前方」打飛行（比的是剩餘路程）",
		d7.has("a") and float(d7.a.f) > 0.0 and float(d7.a.g) == 0.0 and float(d7.rem_a.f) < float(d7.rem_a.g) and float(d7.rem_a.g_ratio) > float(d7.rem_a.f_ratio), d7.get("rem_a", d7))
	_check("飛行-7b 飛行移到剩餘 9 格（地面 7.4 格）：改打地面", d7.has("b") and float(d7.b.g) > 0.0 and float(d7.b.f) == 0.0, {"rem": d7.get("rem_b"), "dmg": d7.get("b")})
	_check("飛行-7c 兩個地面在同一段路（路點比例相同）：打離終點較近、後出現的那個（不是清單第一個）", d7.has("c") and float(d7.c.g2) > 0.0 and float(d7.c.g1) == 0.0, d7.get("c"))
	_check("飛行-7d 兩個飛行在同一個位置（剩餘路程相同）：維持清單順序打先出現的，重複兩次結果相同", d7.has("d1") and float(d7.d1.f1) > 0.0 and float(d7.d1.f2) == 0.0 and float(d7.d2.f1) > 0.0 and float(d7.d2.f2) == 0.0, {"d1": d7.get("d1"), "d2": d7.get("d2")})

	# 飛行-8：擊殺與抵達只結算一次：兩擊打倒的飛行放在弓兵塔旁（擊殺 1、金幣 +5 一次），快速的飛行與地面各抵達一次（城池 -2）；
	# 清波與結算各一次，結算的擊殺數 1
	var ended8: int = battle_ended_count
	es = await _fly_start("fly-8", [_grp("fly_soft", 1, 0.02), _grp("fly_run", 1, 0.02), _grp("gnd_run", 1, 0.02)], 3, [], {}, {"archer": Vector2i(6, 4)})
	var d8: Dictionary = {}
	var tw8: Node = main.game_map.get_occupant(Vector2i(6, 4))
	if es.size() == 3 and tw8 != null:
		var gold0: int = _bm().battle_gold
		var cleared: Array = [0]
		var cb := func(_n: int): cleared[0] += 1
		_wm().wave_cleared.connect(cb)
		es[0].global_position = tw8.global_position + Vector2(0.0, 1.0) * float(tw8.tile_size)
		await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 15.0)
		await _wait(0.3)
		_wm().wave_cleared.disconnect(cb)
		d8 = {"kills": _bm().kills, "gold": _bm().battle_gold - gold0, "hp": _bm().base_hp, "cleared": cleared[0], "ended": battle_ended_count - ended8,
			"result_kills": last_result.get("kills"), "result": last_result.get("result"), "left": _wm().get_active_enemy_count()}
	_check("飛行-8 擊殺與抵達只算一次：飛行被弓兵塔打倒 → 擊殺 1、金幣 +5；快速的飛行與地面各抵達一次 → 城池 18；清波 1 次、結算 1 次（勝利、擊殺 1），場上沒有剩下的敵人",
		d8.get("kills") == 1 and d8.get("gold") == BattleManager.GOLD_PER_KILL and d8.get("hp") == MAX_HP - 2 and d8.get("cleared") == 1 and d8.get("ended") == 1 and d8.get("result_kills") == 1 and d8.get("result") == "WIN" and d8.get("left") == 0, d8)

	# 飛行-9：遊戲時鐘：1× 每秒遊戲時間前進 40 像素、每個物理步進 40 ÷ 60；2× 每步加倍；部署選單的 0.1×；手動暫停時位置不變、繼續後照常。
	# 全程都在直線上（y 不變）
	es = await _fly_start("fly-9", [_grp("fly_walk", 1, 0.02)], 1)
	var d9: Dictionary = {}
	if es.size() == 1:
		var e: Node = es[0]
		var y0: float = e.position.y
		d9["x1"] = await _r19_move(e, 0.6)
		_r19_speed(rec, 2)
		d9["x2"] = await _r19_move(e, 0.6)
		var menu: Dictionary = _r19_open(rec, 6)
		d9["slow"] = await _r19_move(e, 0.6)
		_r19_close(rec, menu)
		_r19_speed(rec, 1)
		var pr: Dictionary = _r20_pause(rec, true)
		var p0: Vector2 = e.position
		await _wait_real(0.5)
		d9["paused_reply"] = pr.get("paused")
		d9["paused_moved"] = e.position.distance_to(p0)
		_r20_pause(rec, false)
		d9["resumed"] = await _r19_move(e, 0.4)
		d9["y_drift"] = absf(e.position.y - y0)
		d9["ts"] = Engine.time_scale
	var ps: float = 40.0 / float(Engine.physics_ticks_per_second)
	var ok9: bool = d9.has("x1")
	if ok9:
		ok9 = absf(float(d9.x1.per_sec) - 40.0) < 1.0 and absf(float(d9.x1.per_step) - ps) < 0.01 and absf(float(d9.x2.per_step) - 2.0 * ps) < 0.02 and absf(float(d9.x2.per_sec) - 40.0) < 1.0 and absf(float(d9.slow.per_step) - 0.1 * ps) < 0.005 and d9.paused_reply == true and d9.paused_moved == 0.0 and float(d9.resumed.dx) > 0.0 and d9.y_drift < 0.001
	_check("飛行-9 遊戲時鐘：每秒遊戲時間 40 像素（1×、2× 都是）、每個物理步進 1× 為 40÷60、2× 加倍、部署選單 0.1×；手動暫停 0.5 秒位置不變、繼續後照常；全程沒有離開直線", ok9, d9)

	# 飛行-10：新的一場不殘留：飛行還在場上時換成沒有飛行的關卡 → 舊的飛行敵人移出場景；新關卡的地面敵人被武將擋住（阻擋照常）；
	# 再換回飛行關卡 → 新的飛行敵人照樣只有兩個路點
	es = await _fly_start("fly-10a", [_grp("fly_walk", 2, 0.02)], 2)
	var old: Array = es.map(func(e): return weakref(e))
	es = await _fly_start("fly-10b", [_grp("gnd_run", 1, 0.02)], 1, [_r12_hero("fly_inf", null)], {"fly_inf": Vector2i(2, 5)})
	await process_frame
	var old_gone: bool = old.all(func(w): return w.get_ref() == null or not w.get_ref().is_inside_tree())
	if es.size() == 1:
		var g10: Node = es[0]
		await _wait_until(func(): return is_instance_valid(g10) and g10._blocker != null, 5.0)
	var nb: Dictionary = {"old_gone": old_gone, "flying_now": _sw_enemies().filter(func(e): return e.is_flying()).size(),
		"blocked": es.size() == 1 and is_instance_valid(es[0]) and es[0]._blocker != null}
	es = await _fly_start("fly-10c", [_grp("fly_walk", 1, 0.02)], 1)
	nb["new_flying_wps"] = es[0]._waypoints.size() if es.size() == 1 else -1
	_check("飛行-10 新的一場不殘留：換關卡後舊的飛行敵人移出場景、新關卡沒有飛行敵人、地面敵人照常被武將擋住；再換回飛行關卡，新的飛行敵人只有兩個路點",
		nb.old_gone == true and nb.flying_now == 0 and nb.blocked == true and nb.new_flying_wps == 2, nb)

	# 飛行-11：面板帶對空（anti_air）：弓兵、法師武將 true，步兵、不認得的職業 false；弓兵塔、文士塔 true，步兵、砲兵、騎兵塔 false
	_load(_fly_payload("fly-11", [[_grp("gnd_post", 1, 0.02)]], [_r12_hero("fly_archer", null), _r12_hero("fly_mage", null), _r12_hero("fly_inf", null), _r12_hero("fly_odd", null)]))
	var hcells: Dictionary = {"fly_archer": Vector2i(1, 7), "fly_mage": Vector2i(2, 7), "fly_inf": Vector2i(3, 7), "fly_odd": Vector2i(4, 7)}
	var tcells: Dictionary = {"archer": Vector2i(5, 7), "scholar": Vector2i(6, 7), "infantry": Vector2i(7, 7), "artillery": Vector2i(8, 7), "cavalry": Vector2i(9, 7)}
	var panels: Dictionary = {}
	for hid in hcells:
		_r12_place(hid, hcells[hid])
		var h: Node = _fly_hero(hid)
		if h != null:
			main._on_hero_clicked(h)
			panels[hid] = rec.sent_panels.back().get("anti_air") if not rec.sent_panels.is_empty() else null
	for tt in tcells:
		main._on_web_place_tower({"tower_type": tt, "cell_x": tcells[tt].x, "cell_y": tcells[tt].y})
		var tw: Node = main.game_map.get_occupant(tcells[tt])
		if tw != null:
			main._on_tower_clicked(tw)
			panels[tt] = rec.sent_panels.back().get("anti_air") if not rec.sent_panels.is_empty() else null
	main._deselect_unit()
	_check("飛行-11 單位面板帶對空：弓兵、法師武將 true，步兵、不認得的職業 false；弓兵塔、文士塔 true，步兵、砲兵、騎兵塔 false",
		panels == {"fly_archer": true, "fly_mage": true, "fly_inf": false, "fly_odd": false, "archer": true, "scholar": true, "infantry": false, "artillery": false, "cavalry": false}, panels)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())
