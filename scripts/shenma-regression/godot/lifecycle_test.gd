## lifecycle_test.gd
## 神馬三國 headless 生命週期回歸測試（不進正式產物）
## 執行：由 run-godot-tests.sh 複製到「暫存專案」的 res://__regression__/ 後以
##   godot --headless --path <暫存專案> --script res://__regression__/lifecycle_test.gd
## 直接載入 Main.tscn，用 wave_cleared 等信號在「窗口當下」操作，時序可控。
## 只使用舊版也有的公開行為判定結果，因此同一支測試可以對照修正前後。

extends SceneTree

const MAX_HP: int = 20
var main: Node
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
	_check("R10-1 game_ready 帶協定版本 2（Web 只在版本相同時送出關卡資料）", ready.get("type") == "game_ready" and ready.get("__godot_bridge") == true and typeof(ready.get("protocol")) == TYPE_INT and ready.get("protocol") == 2, ready)

	# ── R12：趙雲「奇襲」（每場戰鬥首次有效普通攻擊 2 倍傷害）──
	await _r12_first_strike_cases()

	# R12-10：Web 請遊戲再送一次就緒訊息（request_ready）：只回覆 game_ready，不當成關卡資料
	var rec_ready: Node = load("res://__regression__/bridge_recorder.gd").new()
	var payloads: Array = [0]
	rec_ready.payload_received.connect(func(_p): payloads[0] += 1)
	rec_ready._on_js_message([JSON.stringify({"__godot_bridge": true, "type": "request_ready"})])
	_check("R12-10 收到 request_ready：再送一次 game_ready，不當成關卡資料", rec_ready.sent_ready == 1 and payloads[0] == 0, {"sent_ready": rec_ready.sent_ready, "payloads": payloads[0]})
	rec_ready.free()

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
