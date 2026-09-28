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
	# 非 Web 平台 Main 會在 0.5 秒後注入自己的測試 payload，先等它結束再開始
	await _wait(1.0)
	_bm().battle_ended.connect(func(r: Dictionary):
		battle_ended_count += 1
		last_result = r)

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
	_check("R10-1 game_ready 帶協定版本 3（Round 17 起；Web 只在版本相同時送出關卡資料）", ready.get("type") == "game_ready" and ready.get("__godot_bridge") == true and typeof(ready.get("protocol")) == TYPE_INT and ready.get("protocol") == 3, ready)

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

	# ── 輸出 ──
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

	# R12-8：其他武將（關羽，沒有技能）不受影響
	_load(_r12_payload("r12_c", [tank], "r12-c1", [_r12_hero("guan_yu", null)]))
	_r12_place("guan_yu")
	_bm().player_start_battle()
	var guan: Array = await _record_hits(1.2)
	_check("R12-8 沒有技能的武將（關羽）：第一擊就是 100", guan.size() >= 2 and _all_equal(guan, 100.0), guan)

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

	# R15-10：時間倍率：2 倍速時每個物理步進前進的時間是 1 倍速的 2 倍；子彈時間（0.1 倍）只有 0.1 倍。
	# 灼燒照遊戲時間跳（兩種倍率下都在命中後遊戲時間 1、2、3 秒）；實際時間只記在細節
	Engine.time_scale = 2.0
	# 比例在命中之前量：命中之後才量會佔掉遊戲時間約 1 秒，第一跳發生在量測期間而沒有記到（Round 16 第一次反向驗證時出現過一次）
	var rate2: Dictionary = await _physics_rate(0.5)
	var e10: Node = await _r15_start(_r15_payload("r15_i", "r15-i1", [_r15_zhou()]))
	var h10: Dictionary = await _r15_hit_then_leave(e10, _zhou())
	var r10: Dictionary = await _r15_drops(e10, h10.t0, 3.6)
	Engine.time_scale = 1.0
	var s10: Dictionary = _r15_split(r10.drops, 100.0, 20.0)
	var e10b: Node = await _r15_start(_r15_payload("r15_i", "r15-i2", [_r15_zhou()]))
	var h10b: Dictionary = await _r15_hit_then_leave(e10b, _zhou())
	Engine.time_scale = 0.1
	var rate01: Dictionary = await _physics_rate(1.0)
	Engine.time_scale = 1.0
	var r10b: Dictionary = await _r15_drops(e10b, h10b.t0, 3.6)
	var s10b: Dictionary = _r15_split(r10b.drops, 100.0, 20.0)
	var tps: float = float(Engine.physics_ticks_per_second)
	var rate_ok: bool = rate2.steps > 0 and absf(rate2.per_step - 2.0 / tps) < 1e-9 and rate01.steps > 0 and absf(rate01.per_step - 0.1 / tps) < 1e-9
	_check("R15-10 時間倍率：2 倍速時每個物理步進前進 2 ÷ 每秒步數、子彈時間 0.1 ÷ 每秒步數；兩種倍率下灼燒都在命中後遊戲時間 1、2、3 秒（照遊戲時間推進）", rate_ok and s10.bad.is_empty() and _r15_at(s10.ticks, [1.0, 2.0, 3.0], h10.dh) and s10b.bad.is_empty() and _r15_at(s10b.ticks, [1.0, 2.0, 3.0], h10b.dh), {"x2_rate": rate2, "x2": _r15_ts(s10.ticks), "x2_wall_ms": r10.wall_ms, "slow_rate": rate01, "slow": _r15_ts(s10b.ticks)})

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

## 相鄰兩擊的間隔都在 [攻擊間隔, 攻擊間隔 + 最長的一幀]：每次攻擊後計時器設回攻擊間隔，攻擊只會發生在某一幀，
## 所以實際間隔最多多出一幀（容差只來自實際的幀長；0.0005 秒吸收浮點誤差）
func _r16_interval_ok(r: Dictionary, expect: float) -> bool:
	var h: Array = r.hits
	if h.size() < 3:
		return false
	for i in range(1, h.size()):
		var d: float = float(h[i]) - float(h[i - 1])
		if d < expect - 0.0005 or d > expect + float(r.dmax) + 0.0005:
			return false
	return true

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
	_check("R16-1 Lv1：攻擊間隔 0.5 秒；實際每一擊的間隔在 0.5 秒到 0.5 秒＋一幀之間", is_equal_approx(_guan().attack_speed, 0.5) and _r16_interval_ok(r1, 0.5), {"attack_speed": _guan().attack_speed, "hits": r1.hits, "dmax": r1.dmax})

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
	# 攻擊只會發生在某一幀：間隔在 0.8 秒到 0.8 秒＋看到第二擊那一幀的長度之間
	var itv: float = float(hit_b.t) - float(hit_a.t)
	var r2: Dictionary = await _r17_hits(es, 1.7)
	_check("R17-2 切換到「血量最多」：Godot 回傳 {battle_id, tower_uid, target_mode: strongest}；切換不重置冷卻（下一擊間隔在 0.8 秒到 0.8 秒＋一幀）、不額外攻擊；之後只打 tank；金幣、攻擊力、射程、等級不變", reply2.get("battle_id") == "r17-a1" and reply2.get("tower_uid") == tw.tower_uid and reply2.get("target_mode") == "strongest" and tw.target_mode == "strongest" and float(hit_a.t) > 0.0 and float(hit_b.t) > 0.0 and itv >= 0.8 - 0.0005 and itv <= 0.8 + float(hit_b.dt) + 0.0005 and es.t_tank.current_hp < tank_hp0 and _r17_only(r2, "t_tank") and _bm().battle_gold == gold0 and is_equal_approx(tw.atk, atk0) and is_equal_approx(tw.range_tiles, range0) and tw.tower_level == 1, {"reply": reply2, "interval": itv, "frame": hit_b.dt, "dmg": r2.dmg})

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
	es.t_front._wp_index = 1
	var r5b: Dictionary = await _r17_hits(es, 0.9)
	_check("R17-5 平手：血量相同時打路線進度較高的 front；進度也相同時維持原順序（weak）", float(r5a.dmg.t_front) > 0.0 and float(r5a.dmg.t_weak) == 0.0 and float(r5b.dmg.t_weak) > 0.0 and float(r5b.dmg.t_front) == 0.0, {"a": r5a.dmg, "b": r5b.dmg})

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
