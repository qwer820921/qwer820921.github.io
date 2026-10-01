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

	# 只跑一部分（診斷與反向驗證用；完整回歸不設定）：SHENMA_TEST_ONLY=sweep 只跑橫掃（技能原型）；skills 跑武將的技能（馬超的首擊加倍、黃忠、周瑜（包括灼燒的入口）、趙雲的閃避、關羽的減速光環、劉備的防禦光環、張飛的暈眩、魏延的吸血、曹操的攻速光環、夏侯惇的反擊、廖化的堅韌）、橫掃原型與攻速成長；
	# flying 跑飛行敵人與對空（加上防禦塔目標優先，它也用剩餘路程）、飛行路線無效與優先飛行；airfirst 只跑飛行路線無效與優先飛行；
	# route 跑飛行與地面的路線無效（出兵前擋下）；blocker 只跑敵人攻擊阻路武將的冷卻；
	# dodge 只跑趙雲「閃避」；firststrike 只跑首擊加倍（馬超「衝鋒」）；
	# stagedata 跑關卡資料未完成（沒有波次、波次或路線的格式不對）；enemyatk 跑敵人設定的對武將攻擊力；immune 跑免疫減速；
	# slow 跑倍率減速的來源與有效期、關羽的減速光環；aura 只跑減速光環（skills 也包含減速光環）；defaura 只跑劉備的防禦光環（skills 也包含）；stun 只跑張飛的暈眩（skills 也包含）；lifesteal 只跑魏延的吸血（skills 也包含）；
	# atkspeed 只跑曹操的攻速光環（skills 也包含）；damage 只跑敵人受傷的入口（拒絕無效的傷害）；
	# burninput 只跑灼燒的入口（拒絕無效的灼燒參數，skills 也包含）；counter 只跑夏侯惇的反擊（skills 也包含）；tenacity 只跑廖化的堅韌（skills 也包含）
	var only: String = OS.get_environment("SHENMA_TEST_ONLY")
	if only != "":
		if only == "skills":
			await _r12_first_strike_cases()
			await _r14_long_range_cases()
			await _r15_burn_cases()
			await _r16_attack_speed_cases()
			await _sweep_cases()
			await _dodge_cases()
			await _slow_aura_cases()
			await _def_aura_cases()
			await _stun_cases()
			await _lifesteal_cases()
			await _atk_speed_aura_cases()
			await _burn_input_cases()
			await _counter_cases()
			await _tenacity_cases()
		elif only == "blocker":
			await _blocker_cases()
		elif only == "dodge":
			await _dodge_cases()
		elif only == "firststrike":
			await _r12_first_strike_cases()
		elif only == "sweep":
			await _sweep_cases()
		elif only == "flying":
			await _flying_cases()
			await _r17_tower_target_cases()
			await _flight_route_cases()
			await _air_first_cases()
		elif only == "airfirst":
			await _flight_route_cases()
			await _air_first_cases()
		elif only == "route":
			await _flight_route_cases()
			await _ground_route_cases()
		elif only == "stagedata":
			await _stage_data_cases()
		elif only == "enemyatk":
			await _enemy_atk_cases()
		elif only == "immune":
			await _slow_immune_cases()
		elif only == "slow":
			await _slow_source_cases()
			await _slow_aura_cases()
		elif only == "aura":
			await _slow_aura_cases()
		elif only == "defaura":
			await _def_aura_cases()
		elif only == "stun":
			await _stun_cases()
		elif only == "lifesteal":
			await _lifesteal_cases()
		elif only == "damage":
			await _damage_input_cases()
		elif only == "atkspeed":
			await _atk_speed_aura_cases()
		elif only == "burninput":
			await _burn_input_cases()
		elif only == "counter":
			await _counter_cases()
		elif only == "tenacity":
			await _tenacity_cases()
		else:
			_check("SHENMA_TEST_ONLY 的值不認得：" + only + "（可用 sweep、skills、flying、airfirst、route、blocker、dodge、firststrike、stagedata、enemyatk、immune、slow、aura、defaura、stun、lifesteal、atkspeed、damage、burninput、counter、tenacity）", false)
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

	# ── R12：首擊加倍，馬超「衝鋒」（每場戰鬥首次有效普通攻擊 2 倍傷害）──
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

	# ── 飛行路線無效（出兵前擋下）與防禦塔「優先飛行」──
	await _flight_route_cases()
	await _air_first_cases()

	# ── 地面路線沒有路程（出兵前擋下）──
	await _ground_route_cases()

	# ── 敵人攻擊阻路武將的冷卻（每個敵人共享一份、保留零頭、換目標不重設）──
	await _blocker_cases()

	# ── 趙雲「閃避」（每次受到敵人的直接攻擊各自判定，u < 0.15 閃避）──
	await _dodge_cases()

	# ── 關卡資料未完成（沒有波次時拒絕第 1 波、不改用內建的測試波次）──
	await _stage_data_cases()

	# ── 敵人設定的對武將攻擊力與免疫減速 ──
	await _enemy_atk_cases()
	await _slow_immune_cases()

	# ── 倍率減速的來源與有效期、關羽的減速光環 ──
	await _slow_source_cases()
	await _slow_aura_cases()

	# ── 劉備的防禦光環（範圍內其他武將的防禦 × 1.2，取最強不疊加）──
	await _def_aura_cases()

	# ── 張飛的暈眩（命中後目標暈眩 0.5 秒：不移動、不攻擊，刷新不累加）──
	await _stun_cases()

	# ── 敵人受傷的入口（拒絕 0、負數、NaN、無限大的傷害與已經倒下、正要被移除的敵人）──
	await _damage_input_cases()

	# ── 魏延的吸血（命中後恢復實際傷害的 15%，不含溢出、不超過最大生命、不復活）──
	await _lifesteal_cases()

	# ── 曹操的攻速光環（範圍內其他武將每秒攻擊次數 × 1.15，取最強不疊加，只影響之後新開始的冷卻）──
	await _atk_speed_aura_cases()

	# ── 灼燒的入口（拒絕無效的灼燒參數，已有的灼燒照原本的時間燒完）──
	await _burn_input_cases()

	# ── 夏侯惇的反擊（受到直接攻擊、實扣後仍活著時反彈實扣的 20% 給攻擊者）──
	await _counter_cases()

	# ── 廖化的堅韌（受傷前生命不高於 30% 時，防禦計算後的傷害再乘 0.8）──
	await _tenacity_cases()

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

# ── R12 輔助：首擊加倍，馬超「衝鋒」 ─────────────────────────────
func _r12_hero(hero_id: String, skill: Variant) -> Dictionary:
	var h: Dictionary = {"hero_id": hero_id, "level": 1, "star": 0, "atk": 100.0, "def": 50.0, "hp": 1000.0, "slot": 1}
	if skill != null:
		h["skill"] = skill
	return h

func _r12_ma(skill_id: String = "first_strike") -> Dictionary:
	return _r12_hero("ma_chao", {"id": skill_id, "first_attack_multiplier": 2})

func _r12_payload(stage_id: String, waves: Array, battle_id: String, team: Array) -> Dictionary:
	var p: Dictionary = _with_id(_payload(stage_id, waves), battle_id)
	p["team_list"] = team
	p["heroes_config"] = [
		{"hero_id": "ma_chao", "name": "馬超", "job": "cavalry", "attack_range": 3.0, "attack_speed": 0.5},
		{"hero_id": "zhao_yun", "name": "趙雲", "job": "cavalry", "attack_range": 3.0, "attack_speed": 0.5},
		{"hero_id": "gan_ning", "name": "甘寧", "job": "cavalry", "attack_range": 3.0, "attack_speed": 0.5},
		{"hero_id": "guan_yu", "name": "關羽", "job": "infantry", "attack_range": 3.0, "attack_speed": 0.5},
		# 橫掃原型的合成武將（步兵，數值和關羽相同）
		{"hero_id": "sweep_proto", "name": "原型", "job": "infantry", "attack_range": 3.0, "attack_speed": 0.5},
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
	_load(_r12_payload("r12_a", [tank], "r12-a1", [_r12_ma()]))
	_r12_place("ma_chao")
	await _wait(1.5)  # 超過 3 次攻擊間隔，場上沒有敵人
	var unused: Dictionary = _bm().get_debug_state().get("first_strike_used", {})
	_check("R12-2 放置後沒有目標（備戰中）：首擊加倍沒有被用掉", unused.is_empty(), unused)
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
	_check("R12-1 馬超第一擊造成 200（攻擊力 100 的 2 倍），之後恢復 100", hits1.size() >= 3 and hits1[0] == 200.0 and _all_equal(hits1.slice(1), 100.0), hits1)
	var used: Dictionary = _bm().get_debug_state().get("first_strike_used", {})
	_check("R12-1 這一場只記下一次首擊加倍（馬超，傷害 200）", used.size() == 1 and float(used.get("ma_chao", 0)) == 200.0, used)

	# R12-3：同一場的下一波不重置（第 1 波的敵人兩擊打倒後清波，第 2 波第一擊是 100）
	_load(_r12_payload("r12_b", [[_grp("soft", 1, 1.0)], tank], "r12-b1", [_r12_ma()]))
	_r12_place("ma_chao")
	_bm().player_start_battle()
	var w1: Array = await _record_hits(0.8)
	await _wait_until(func(): return _bm().game_state == 1, 5.0)
	_check("R12-3 前置：第 1 波第一擊 200，敵人被打倒後清波回到備戰", w1.size() >= 1 and w1[0] == 200.0 and _bm().kills == 1 and _bm().game_state == 1, {"hits": w1, "kills": _bm().kills, "state": _bm().game_state})
	_bm().player_start_battle()
	var w2: Array = await _record_hits(1.2)
	_check("R12-3 同一場的第 2 波不重置：每一擊都是 100", w2.size() >= 2 and _all_equal(w2, 100.0), w2)

	# R12-4：同一場移動位置不重置
	var ma: Node = main._placed_heroes.get("ma_chao")
	ma.reposition(Vector2i(2, 4), main.game_map.grid_to_world(Vector2i(2, 4)), main.game_map)
	var moved: Array = await _record_hits(1.2)
	_check("R12-4 同一場移動位置後：每一擊都是 100", moved.size() >= 2 and _all_equal(moved, 100.0), moved)

	# R12-5：同一場更新隊伍／屬性不重置
	main._on_payload_received({"type": "update_team", "team_list": [_r12_ma()]})
	var updated: Array = await _record_hits(1.2)
	_check("R12-5 同一場更新隊伍資料後：每一擊都是 100", updated.size() >= 2 and _all_equal(updated, 100.0), updated)

	# R12-6：同一場移除後重新放置不重置
	main._on_payload_received({"type": "update_team", "team_list": []})
	await _wait(0.2)
	var removed: bool = not main._placed_heroes.has("ma_chao")
	main._on_payload_received({"type": "update_team", "team_list": [_r12_ma()]})
	_r12_place("ma_chao", Vector2i(3, 4))
	var replaced: Array = await _record_hits(1.2)
	_check("R12-6 同一場移除後重新放置：每一擊都是 100", removed and main._placed_heroes.has("ma_chao") and replaced.size() >= 2 and _all_equal(replaced, 100.0), {"removed": removed, "hits": replaced})

	# R12-7：新的一場（同一關重來，新的 battle_id）重置，第一擊又是 200
	_load(_r12_payload("r12_b", [tank], "r12-b2", [_r12_ma()]))
	_r12_place("ma_chao")
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
	_load(_r12_payload("r12_d", [tank], "r12-d1", [_r12_ma("unknown_skill")]))
	_r12_place("ma_chao")
	_bm().player_start_battle()
	var unknown: Array = await _record_hits(1.2)
	_check("R12-9 不認得的技能 id：當作普通攻擊，第一擊就是 100", unknown.size() >= 2 and _all_equal(unknown, 100.0), unknown)
	# 首擊加倍-1：趙雲帶的是閃避，沒有首擊加倍：第一擊就是 100，這一場沒有首擊加倍的紀錄
	_load(_r12_payload("r12_e", [tank], "r12-e1", [_r12_hero("zhao_yun", {"id": "dodge", "dodge_chance": 0.15})]))
	_r12_place("zhao_yun")
	_bm().player_start_battle()
	var zhao_hits: Array = await _record_hits(1.2)
	var zhao_node: Node = main._placed_heroes.get("zhao_yun")
	var zhao_used: Dictionary = _bm().get_debug_state().get("first_strike_used", {})
	_check("首擊加倍-1 趙雲（技能是閃避）：沒有首擊加倍，第一擊就是 100，這一場沒有首擊加倍的紀錄",
		zhao_hits.size() >= 2 and _all_equal(zhao_hits, 100.0) and zhao_node != null and zhao_node.first_strike_multiplier == 1.0 and zhao_used.is_empty(),
		{"hits": zhao_hits, "used": zhao_used})

	# 首擊加倍-2：甘寧沒有技能參數（「首擊必殺」的意思還沒決定，不借用首擊加倍）：第一擊就是 100
	_load(_r12_payload("r12_f", [tank], "r12-f1", [_r12_hero("gan_ning", null)]))
	_r12_place("gan_ning")
	_bm().player_start_battle()
	var gan_hits: Array = await _record_hits(1.2)
	var gan_used: Dictionary = _bm().get_debug_state().get("first_strike_used", {})
	_check("首擊加倍-2 甘寧（沒有技能參數）：第一擊就是 100，這一場沒有首擊加倍的紀錄",
		gan_hits.size() >= 2 and _all_equal(gan_hits, 100.0) and gan_used.is_empty(), {"hits": gan_hits, "used": gan_used})
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
	_check("R14-2 敵人在 6 格（原射程 5 格外、新射程 7.5 格內）：實際扣血，每一擊都是攻擊力 100（傷害不變、不是首擊加倍）", at6.size() >= 2 and _all_equal(_dmgs(at6), 100.0), at6)
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

	# R14-11：不認得的技能 id（帶了 range_multiplier 也一樣）當作普通攻擊；首擊加倍不影響射程
	_load(_r14_payload("r14_d", "r14-d1", [_r14_huang(1, {"id": "unknown_skill", "range_multiplier": 1.5}), _r12_ma()]))
	_r12_place("huang_zhong", Vector2i(3, 4))
	_r12_place("ma_chao", Vector2i(8, 4))
	var ma: Node = main._placed_heroes.get("ma_chao")
	_check("R14-11 不認得的技能 id：射程維持 5；馬超（首擊加倍）的射程不受影響（3）", is_equal_approx(_huang().attack_range, 5.0) and ma != null and is_equal_approx(ma.attack_range, 3.0) and is_equal_approx(ma.first_strike_multiplier, 2.0), {"huang": _huang().attack_range, "ma": ma.attack_range if ma else null})
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
	## 倍率減速（依來源）：固定步進的目標不移動，只接受呼叫
	func apply_slow_from(_source: String, _mult: float, _duration: float) -> void:
		pass
	func remove_slow_from(_source: String) -> void:
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

# ── 橫掃（技能原型，沒有綁定任何正式武將）：合成的測試武將 sweep_proto（步兵）帶 sweep 參數（普通攻擊命中後，主目標附近半徑 1 格內最多 2 名其他敵人各受這一擊的 50%）──
# 測試武將攻擊力 100、射程 3 格、攻擊間隔 0.5 秒（_r12_payload 的設定）；敵人是不會移動、血量 99999 的 post（需要時直接改血量）。
# 確定性的單次攻擊：放置後停掉測試武將自己的 _process，敵人放好位置後由測試呼叫一次 _process（冷卻為 0 → 立刻攻擊一次），
# 用每個敵人的血量變化、擊殺數與戰鬥金幣判斷。主目標是第一個生成的敵人（放在測試武將右邊 2 格；路線進度相同時打清單裡的第一個）
func _sw_skill() -> Dictionary:
	return {"id": "sweep", "sweep_radius": 1.0, "sweep_max_targets": 2, "sweep_ratio": 0.5}

## 橫掃測試用的合成武將（不是正式武將；heroes_config 在 _r12_payload、_fly_payload）
const SW_HERO: String = "sweep_proto"

func _sw_hero() -> Node:
	return main._placed_heroes.get(SW_HERO)

func _sw_guan(skill: Variant) -> Dictionary:
	return _r12_hero(SW_HERO, skill)

## 目前關卡仍存活的敵人，依生成序號排列
func _sw_enemies() -> Array:
	var out: Array = []
	for e in _wm().get_active_enemies():
		if is_instance_valid(e) and not e.is_queued_for_deletion() and not e.is_dead():
			out.append(e)
	out.sort_custom(func(a, b): return a.spawn_seq < b.spawn_seq)
	return out

## 載入一場只有 n 個 post 的關卡、放置測試武將、開戰並等 n 個敵人都出現（出生點離測試武將 3.16 格，在射程外）。
## manual 為 true 時停掉測試武將自己的 _process，由測試決定何時攻擊。team 是 null 時用帶橫掃的測試武將
func _sw_start(battle_id: String, n: int, team: Variant = null, manual: bool = true) -> Array:
	var t: Array = team if team != null else [_sw_guan(_sw_skill())]
	_load(_r12_payload("sweep_a", [[_grp("post", n, 0.02)]], battle_id, t))
	_r12_place(SW_HERO, Vector2i(3, 4))
	if manual and _sw_hero() != null:
		_sw_hero().set_process(false)
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() == n, 5.0)
	return _sw_enemies()

## 主目標（第一個）放在測試武將右邊 2 格；其他敵人放在主目標加上 offs[i]（格）的位置。回傳中心（主目標的位置）
func _sw_place(es: Array, offs: Array) -> Vector2:
	var g: Node = _sw_hero()
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

## 測試武將打一次（呼叫一次 _process；冷卻為 0 時 delta 0 就會攻擊，之後每次給一個攻擊間隔）。
## 回傳每個敵人這一次受到的傷害（被打倒的記成倒下前的血量）、擊殺數與戰鬥金幣的變化、橫掃統計與範圍效果數的變化
func _sw_hit(es: Array, delta: float = 0.0) -> Dictionary:
	var g: Node = _sw_hero()
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
	var c0: int = _sw_hero().sweep_count
	var r: Dictionary = await _r19_hits(es, sec)
	var a: Dictionary = _sw_attacks(r)
	return {"t": a.t, "per_attack": a.per_attack, "bad": a.bad, "dmax": r.dmax, "count": _sw_hero().sweep_count - c0}

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
	if es.size() != 2 or _sw_hero() == null:
		_check("橫掃 前置：等不到敵人或測試武將沒有放置", false, {"enemies": es.size()})
		return
	var g: Node = _sw_hero()
	var tile: float = float(g.tile_size)
	_check("橫掃-0 Godot 讀到測試武將的橫掃參數（半徑 1 格、最多 2 名、50%）；敵人依出現順序帶生成序號 0、1",
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
		r4b = _sw_hit(es, _sw_hero().attack_speed)
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
		r7b = _sw_hit(es, _sw_hero().attack_speed)
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
			plain[k] = {"dmg": rv.dmg, "ratio": _sw_hero().sweep_ratio}
	var plain_ok: bool = plain.size() == variants.size()
	for k in plain:
		plain_ok = plain_ok and plain[k].dmg == [100.0, 0.0] and plain[k].ratio == 0.0
	_check("橫掃-10 不認得的技能 id（即使帶了橫掃參數）、沒有技能、半徑／人數／比例為 0：都當作普通攻擊（0.5 格的敵人 0）", plain_ok, plain)

	# 橫掃-11：移除測試武將、切換關卡、新的一場：範圍效果跟著清除、不再有橫掃傷害、統計從 0 開始
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
		_r12_place(SW_HERO, Vector2i(3, 4))
		d11["replaced_count"] = _sw_hero().sweep_count if _sw_hero() != null else -1
		# 放回後照常橫掃（新的武將節點，統計從 0 開始）
		if _sw_hero() != null:
			_sw_hero().set_process(false)
			_sw_place(es, [Vector2.ZERO, Vector2(0.5, 0.0)])
			d11["replaced_hit"] = _sw_hit(es).dmg
	_check("橫掃-11 戰鬥中移除測試武將：範圍效果跟著清除、之後 1.2 秒沒有任何傷害；放回後統計從 0 開始、照常橫掃",
		d11.get("fx_before") == 1 and d11.get("fx_after_remove") == 0 and d11.get("fx_node_freed") == true and d11.get("no_damage_after_remove") == true and d11.get("replaced_count") == 0 and d11.get("replaced_hit") == [100.0, 50.0], d11)
	var d11b: Dictionary = {}
	if _sw_hero() != null:
		var fx_b: Array = _sw_fx()
		d11b["fx_alive"] = fx_b.size()
		_load(_stage_b())
		d11b["fx_out_of_tree"] = fx_b.size() == 1 and not fx_b[0].is_inside_tree()
		await process_frame
		d11b["fx_freed"] = fx_b.size() == 1 and not is_instance_valid(fx_b[0])
		es = await _sw_start("sweep-11b", 2)
		d11b["new_battle_count"] = _sw_hero().sweep_count if _sw_hero() != null else -1
		d11b["new_battle_fx"] = _sw_fx().size()
	_check("橫掃-11b 範圍效果還在時切換關卡：效果隨單位一起清除；新的一場的測試武將橫掃次數從 0 開始、沒有殘留的效果",
		d11b.get("fx_alive") == 1 and d11b.get("fx_out_of_tree") == true and d11b.get("fx_freed") == true and d11b.get("new_battle_count") == 0 and d11b.get("new_battle_fx") == 0, d11b)

	# ── 真引擎（測試武將自己攻擊）：倍率、部署慢速、暫停都用遊戲時間 ──
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
		var c0: int = _sw_hero().sweep_count
		_sw_place(es, offs3)
		await _wait_until(func(): return _sw_hero().sweep_count > c0, 3.0)
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
		var c0: int = _sw_hero().sweep_count
		_sw_place(es, offs3)
		await _wait_until(func(): return _sw_hero().sweep_count > c0, 3.0)
		var fxs: Array = _sw_fx()
		d15["fx"] = fxs.size()
		if fxs.size() == 1:
			var f: Node = fxs[0]
			var p: Dictionary = _r20_pause(rec, true)
			d15["paused_reply"] = p.get("paused")
			var b: Array = [f.elapsed, _sw_hero()._atk_timer, es.map(func(e): return e.current_hp), _gt(), _sw_hero().sweep_count]
			await _wait_real(0.6)
			var a: Array = [f.elapsed if is_instance_valid(f) else -1.0, _sw_hero()._atk_timer, es.map(func(e): return e.current_hp), _gt(), _sw_hero().sweep_count]
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
			var c1: int = _sw_hero().sweep_count
			await _wait_until(func(): return _sw_hero().sweep_count > c1, 3.0)
			d15["resumed_sweep"] = _sw_hero().sweep_count > c1
	_check("橫掃-15 手動暫停 0.6 秒：範圍效果、攻擊冷卻、三個敵人的血量、遊戲時間與橫掃次數都不變；繼續後效果照剩下的時間消失，之後照常橫掃",
		d15.get("fx") == 1 and d15.get("paused_reply") == true and d15.get("frozen") == true and float(d15.get("fx_gone_after", 99.0)) <= float(d15.get("fx_left", 0.0)) + 0.1 and d15.get("resumed_sweep") == true, d15)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 飛行敵人與對空 ──
# 地圖：path_a 從 (0,5) 往右到 (4,5)、往上繞到第 2 列、再回到第 5 列到終點 (13,5)。飛行敵人沿第 5 列直線飛（13 格），
# 地面沿折線走（19 格）；(2,5) 是兩者都會經過的道路格。建築格：第 7 列、第 4 列的 5～8 欄、第 0 列的 3～10 欄
# 武將：每種職業一位（射程 3 格、攻擊間隔 0.5 秒、攻擊力 100）；周瑜（法師）另外用來測火攻、合成的 sweep_proto（步兵）測橫掃原型，
# 關羽（步兵）用在免疫減速與減速光環
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
	hc.append(_fly_hero_cfg(SW_HERO, "infantry"))
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

	# 飛行-5b：步兵的橫掃（合成的測試武將）不掃到飛行：主目標（地面）0.5 格內有一個飛行、一個地面 → 地面副目標 50、飛行 0，橫掃 1 次只打到 1 名
	es = await _fly_start("fly-5b", [_grp("gnd_post", 2, 0.02), _grp("fly_post", 1, 0.02)], 3, [_r12_hero(SW_HERO, _sw_skill())], {SW_HERO: Vector2i(6, 4)})
	var g5: Node = _fly_hero(SW_HERO)
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
	_check("飛行-5b 步兵的橫掃（測試武將）：主目標 100、0.5 格內的地面副目標 50、0.5 格內的飛行 0；橫掃 1 次、只打到 1 名（飛行不佔名額）",
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

# ── 飛行路線無效（出兵前擋下）──
# 地圖沿用飛行測試的 _fly_path_json，另外加幾條路線：
# path_loop：(0,5)→(4,5)→(4,2)→(0,2)→(0,5)，起點和終點同一格的環狀路線（地面照常走 14 格；飛行無效）
# path_dup：兩個相同的路點（飛行無效）；path_single：只有一個路點（飛行無效）；path_short：相鄰兩格（1 格長，飛行有效）
# path_dup3：三個相同的路點（總路程 0）。地面：path_single、path_dup、path_dup3 無效，path_loop、path_short 有效
func _route_payload(battle_id: String, waves: Array) -> Dictionary:
	var p: Dictionary = _fly_payload(battle_id, waves)
	var paths: Dictionary = p["map"]["path_json"]["paths"]
	paths["path_loop"] = [[0, 5], [4, 5], [4, 2], [0, 2], [0, 5]]
	paths["path_dup"] = [[3, 9], [3, 9]]
	paths["path_single"] = [[6, 2]]
	paths["path_short"] = [[10, 3], [11, 3]]
	paths["path_dup3"] = [[5, 9], [5, 9], [5, 9]]
	return p

func _grp_on(id: String, count: int, interval: float, path: String) -> Dictionary:
	return {"enemy_id": id, "count": count, "interval": interval, "path": path}

## 拒絕開戰的前後狀態：送出的 wave_rejected、拒絕信號、結算次數。wait_wave：先正常打完幾波再開下一波
func _route_reject(rec: Node, payload: Dictionary, auto: bool, wait_wave: int) -> Dictionary:
	_load(payload)
	var n_msg: int = rec.sent_wave_rejects.size()
	var ended0: int = battle_ended_count
	var sig: Array = []
	var on_reject := func(n: int, _r: String): sig.append(n)
	_bm().wave_start_rejected.connect(on_reject)
	if auto:
		_bm().toggle_auto_mode()
		await _wait_until(func(): return sig.size() > 0 or _bm().game_state == 3, 10.0)
	else:
		for i in range(wait_wave):
			_bm().player_start_battle()
			await _wait_until(func(): return _bm().game_state != 2, 10.0)
		_bm().player_start_battle()
	await _wait(1.0)
	_bm().wave_start_rejected.disconnect(on_reject)
	var msgs: Array = rec.sent_wave_rejects.slice(n_msg)
	return {"state": _state(), "sig": sig, "ended": battle_ended_count - ended0, "msgs": msgs, "nodes": _sw_enemies().size()}

func _route_reasons(msg: Dictionary) -> Array:
	var out: Array = []
	for s in msg.get("skipped", []):
		out.append([int(s.get("index", -1)), str(s.get("enemy_id", "")), str(s.get("path", "")), str(s.get("reason", ""))])
	return out

func _flight_route_cases() -> void:
	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)

	# 路線-1：這一波的飛行組全部無效（環狀路線起終點同格、兩個路點相同、只有一個路點）→ 拒絕開戰：
	# 停在備戰、波次不前進、城池不扣血、沒有結算、場上沒有敵人；拒絕信號一次；Web 收到一則 wave_rejected，逐組列出原因（不含玩家資料）
	var r1: Dictionary = await _route_reject(rec, _route_payload("route-1", [[_grp_on("fly_walk", 2, 0.1, "path_loop"), _grp_on("fly_walk", 1, 0.1, "path_dup"), _grp_on("fly_run", 1, 0.1, "path_single")]]), false, 0)
	var m1: Dictionary = r1.msgs[0] if r1.msgs.size() == 1 else {}
	var want1: Array = [[1, "fly_walk", "path_loop", "flight_same_endpoints"], [2, "fly_walk", "path_dup", "flight_same_endpoints"], [3, "fly_run", "path_single", "flight_single_point"]]
	_check("路線-1 飛行組全部無效（環狀路線起終點同格、兩個相同路點、只有一個路點）→ 拒絕開戰：備戰、波次 0、城池 20、沒有結算、場上沒有敵人；拒絕信號 1 次；wave_rejected 帶這一場的 battle_id、第 1 波、逐組原因（位置、enemy_id、路線），不含玩家 key",
		r1.state.state == 1 and r1.state.wave == 0 and r1.state.hp == MAX_HP and not r1.state.auto and r1.state.active == 0 and r1.nodes == 0 and r1.ended == 0 and r1.sig == [1] and
		r1.msgs.size() == 1 and m1.get("battle_id") == "route-1" and int(m1.get("wave", -1)) == 1 and m1.get("missing") == false and _route_reasons(m1) == want1 and not JSON.stringify(m1).contains("\"key\""),
		{"state": r1.state, "sig": r1.sig, "ended": r1.ended, "msgs": r1.msgs})

	# 路線-2：自動模式，第 2 波只有無效的飛行組 → 第 1 波（地面，1 隻抵達）照常，第 2 波拒絕：自動關閉、波次停在 1、城池只扣第 1 波的 1、沒有結算
	var r2: Dictionary = await _route_reject(rec, _route_payload("route-2", [[_grp("gnd_run", 1, 0.1)], [_grp_on("fly_walk", 3, 0.1, "path_dup")]]), true, 0)
	var m2: Dictionary = r2.msgs[0] if r2.msgs.size() == 1 else {}
	_check("路線-2 自動模式第 2 波只有無效的飛行組：第 1 波照常（地面抵達，城池 19），第 2 波拒絕：自動關閉、停在備戰、波次 1、沒有結算；wave_rejected 是第 2 波、原因 flight_same_endpoints",
		r2.state.state == 1 and r2.state.wave == 1 and r2.state.hp == MAX_HP - 1 and not r2.state.auto and r2.ended == 0 and r2.sig == [2] and int(m2.get("wave", -1)) == 2 and _route_reasons(m2) == [[1, "fly_walk", "path_dup", "flight_same_endpoints"]],
		{"state": r2.state, "sig": r2.sig, "ended": r2.ended, "msgs": r2.msgs})

	# 路線-3：短但有效的飛行路線（相鄰兩格、1 格長）照常出兵：兩個路點、剩餘 1 格；飛到終點才扣城血（每秒 40 像素，約 1 格 ÷ 40 秒），不是一出現就扣
	_load(_route_payload("route-3", [[_grp_on("fly_walk", 1, 0.1, "path_short")]]))
	var n3: int = rec.sent_wave_rejects.size()
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() == 1, 3.0)
	var d3: Dictionary = {"spawned": _sw_enemies().size()}
	if _sw_enemies().size() == 1:
		var e3: Node = _sw_enemies()[0]
		var t3: float = float(e3.tile_size)
		var p0: float = _pt()
		d3["wps"] = e3._waypoints.size()
		d3["rem_tiles"] = snappedf(e3.get_remaining_distance() / t3, 0.01)
		d3["hp_at_spawn"] = _bm().base_hp
		d3["expect_sec"] = snappedf(t3 / 40.0, 0.001)
		await _wait_until(func(): return _bm().base_hp < MAX_HP, 5.0)
		d3["arrive_sec"] = snappedf(_pt() - p0, 0.001)
		d3["hp"] = _bm().base_hp
	d3["rejects"] = rec.sent_wave_rejects.size() - n3
	_check("路線-3 相鄰兩格的飛行路線（1 格長）照常出兵：兩個路點、剩餘 1 格、出現時城池 20；約 1 格 ÷ 40 像素／秒後抵達才扣 1（不是一出現就扣）；沒有拒絕",
		d3.get("spawned") == 1 and d3.get("wps") == 2 and is_equal_approx(float(d3.get("rem_tiles", 0.0)), 1.0) and d3.get("hp_at_spawn") == MAX_HP and float(d3.get("arrive_sec", 0.0)) >= float(d3.get("expect_sec", 99.0)) - 0.1 and float(d3.get("arrive_sec", 99.0)) <= float(d3.get("expect_sec", 0.0)) + 0.5 and d3.get("hp") == MAX_HP - 1 and d3.get("rejects") == 0, d3)
	await _wait_until(func(): return _bm().game_state == 3, 5.0)

	# 路線-4：同一波混合：無效的飛行組（環狀路線）略過，合法的飛行組與地面組照常開戰；不送 wave_rejected，城池不因無效組扣血
	_load(_route_payload("route-4", [[_grp_on("fly_walk", 2, 0.05, "path_loop"), _grp("fly_walk", 1, 0.05), _grp("gnd_walk", 1, 0.05)]]))
	var n4: int = rec.sent_wave_rejects.size()
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() == 2, 3.0)
	await _wait(0.5)
	var es4: Array = _sw_enemies()
	var rep4: Dictionary = _wm().get_last_plan_report()
	var d4: Dictionary = {"state": _bm().game_state, "count": es4.size(), "moves": es4.map(func(e): return e.movement_type), "hp": _bm().base_hp, "rejects": rec.sent_wave_rejects.size() - n4, "skipped": _route_reasons(rep4)}
	_check("路線-4 同一波混合：無效的飛行組略過（計畫的說明列出它），合法的飛行與地面各 1 隻照常開戰；沒有 wave_rejected、城池 20",
		d4.state == 2 and d4.count == 2 and d4.moves == ["flying", "ground"] and d4.hp == MAX_HP and d4.rejects == 0 and d4.skipped == [[1, "fly_walk", "path_loop", "flight_same_endpoints"]], d4)
	_load(_stage_b())

	# 路線-5：地面的環狀路線（起終點同格）不受飛行規則影響：照常出兵、五個路點、剩餘 14 格，走完全程（每秒 240 像素）才抵達扣城血
	_load(_route_payload("route-5", [[_grp_on("gnd_run", 1, 0.1, "path_loop")]]))
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() == 1, 3.0)
	var d5: Dictionary = {"spawned": _sw_enemies().size(), "state": _bm().game_state}
	if _sw_enemies().size() == 1:
		var e5: Node = _sw_enemies()[0]
		var t5: float = float(e5.tile_size)
		var p5: float = _pt()
		d5["wps"] = e5._waypoints.size()
		d5["rem_tiles"] = snappedf(e5.get_remaining_distance() / t5, 0.01)
		d5["expect_sec"] = snappedf(14.0 * t5 / 240.0, 0.001)
		await _wait_until(func(): return _bm().base_hp < MAX_HP, 8.0)
		d5["arrive_sec"] = snappedf(_pt() - p5, 0.001)
		d5["hp"] = _bm().base_hp
	_check("路線-5 地面的環狀路線（起終點同格）照常：出兵、五個路點、剩餘 14 格，約 14 格 ÷ 240 像素／秒後才抵達扣 1",
		d5.get("spawned") == 1 and d5.get("state") == 2 and d5.get("wps") == 5 and is_equal_approx(float(d5.get("rem_tiles", 0.0)), 14.0) and float(d5.get("arrive_sec", 0.0)) >= float(d5.get("expect_sec", 99.0)) - 0.1 and float(d5.get("arrive_sec", 99.0)) <= float(d5.get("expect_sec", 0.0)) + 0.5 and d5.get("hp") == MAX_HP - 1, d5)
	await _wait_until(func(): return _bm().game_state == 3, 5.0)

	# 路線-6：缺波次的拒絕也帶 missing：第 2 波不存在 → wave_rejected {wave: 2, missing: true, skipped: []}
	var gap: Dictionary = _route_payload("route-6", [[_grp("gnd_run", 1, 0.1)]])
	gap["map"]["waves"].append({"wave": 3, "enemies": [_grp("gnd_run", 1, 0.1)]})
	var r6: Dictionary = await _route_reject(rec, gap, false, 1)
	var m6: Dictionary = r6.msgs[0] if r6.msgs.size() == 1 else {}
	_check("路線-6 缺波次（第 2 波不存在）：拒絕開戰，wave_rejected 帶 wave 2、missing true、沒有逐組原因",
		r6.state.state == 1 and r6.state.wave == 1 and r6.ended == 0 and int(m6.get("wave", -1)) == 2 and m6.get("missing") == true and m6.get("skipped", [1]) == [], {"state": r6.state, "msgs": r6.msgs})

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 地面路線沒有路程（出兵前擋下）──
# 地面敵人沿路點依序走：只有一個路點、或所有路點在同一格（總路程 0）時一出現就抵達基地，所以出兵前略過；
# 判斷看沿路點的總路程，不看起點和終點：起終點同格的環狀路線（路線-5、地面路線-6）照常出兵
func _ground_route_cases() -> void:
	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)

	# 地面路線-1：這一波的地面組全部無效（只有一個路點、兩個相同路點、三個相同路點）→ 拒絕開戰：
	# 停在備戰、波次不前進、城池不扣血、沒有結算、場上沒有敵人；拒絕信號一次；wave_rejected 逐組列出地面的原因代碼（和飛行不同）
	var r1: Dictionary = await _route_reject(rec, _route_payload("ground-1", [[_grp_on("gnd_walk", 2, 0.1, "path_single"), _grp_on("gnd_walk", 1, 0.1, "path_dup"), _grp_on("gnd_run", 3, 0.1, "path_dup3")]]), false, 0)
	var m1: Dictionary = r1.msgs[0] if r1.msgs.size() == 1 else {}
	var want1: Array = [[1, "gnd_walk", "path_single", "ground_single_point"], [2, "gnd_walk", "path_dup", "ground_zero_length"], [3, "gnd_run", "path_dup3", "ground_zero_length"]]
	_check("地面路線-1 地面組全部無效（只有一個路點、兩個相同路點、三個相同路點）→ 拒絕開戰：備戰、波次 0、城池 20、沒有結算、場上沒有敵人；拒絕信號 1 次；wave_rejected 帶這一場的 battle_id、第 1 波、逐組原因 ground_single_point／ground_zero_length，不含玩家 key",
		r1.state.state == 1 and r1.state.wave == 0 and r1.state.hp == MAX_HP and not r1.state.auto and r1.state.active == 0 and r1.nodes == 0 and r1.ended == 0 and r1.sig == [1] and
		r1.msgs.size() == 1 and m1.get("battle_id") == "ground-1" and int(m1.get("wave", -1)) == 1 and m1.get("missing") == false and _route_reasons(m1) == want1 and not JSON.stringify(m1).contains("\"key\""),
		{"state": r1.state, "sig": r1.sig, "ended": r1.ended, "nodes": r1.nodes, "msgs": r1.msgs})

	# 地面路線-2：自動模式，第 2 波只有無效的地面組 → 第 1 波（1 隻抵達）照常，第 2 波拒絕：自動關閉、波次停在 1、城池只扣第 1 波的 1、沒有結算
	var r2: Dictionary = await _route_reject(rec, _route_payload("ground-2", [[_grp("gnd_run", 1, 0.1)], [_grp_on("gnd_run", 3, 0.1, "path_single")]]), true, 0)
	var m2: Dictionary = r2.msgs[0] if r2.msgs.size() == 1 else {}
	_check("地面路線-2 自動模式第 2 波只有無效的地面組：第 1 波照常（抵達，城池 19），第 2 波拒絕：自動關閉、停在備戰、波次 1、沒有結算、場上沒有敵人；wave_rejected 是第 2 波、原因 ground_single_point",
		r2.state.state == 1 and r2.state.wave == 1 and r2.state.hp == MAX_HP - 1 and not r2.state.auto and r2.ended == 0 and r2.nodes == 0 and r2.sig == [2] and int(m2.get("wave", -1)) == 2 and _route_reasons(m2) == [[1, "gnd_run", "path_single", "ground_single_point"]],
		{"state": r2.state, "sig": r2.sig, "ended": r2.ended, "msgs": r2.msgs})

	# 地面路線-3：手動，下一波（第 2 波）只有總路程 0 的地面組 → 第 1 波打完後按迎戰被拒絕：波次停在 1、城池 19、沒有結算
	var r3: Dictionary = await _route_reject(rec, _route_payload("ground-3", [[_grp("gnd_run", 1, 0.1)], [_grp_on("gnd_walk", 2, 0.1, "path_dup3")]]), false, 1)
	var m3: Dictionary = r3.msgs[0] if r3.msgs.size() == 1 else {}
	_check("地面路線-3 手動開下一波，第 2 波只有三個相同路點的地面組：拒絕，備戰、波次 1、城池 19、沒有結算、場上沒有敵人；wave_rejected 是第 2 波、原因 ground_zero_length",
		r3.state.state == 1 and r3.state.wave == 1 and r3.state.hp == MAX_HP - 1 and r3.ended == 0 and r3.nodes == 0 and r3.sig == [2] and int(m3.get("wave", -1)) == 2 and _route_reasons(m3) == [[1, "gnd_walk", "path_dup3", "ground_zero_length"]],
		{"state": r3.state, "sig": r3.sig, "ended": r3.ended, "msgs": r3.msgs})

	# 地面路線-4：同一波混合：無效的地面組（單一路點、兩個相同路點）略過，合法的地面與飛行各 1 隻照常開戰；沒有 wave_rejected，城池不因無效組扣血
	_load(_route_payload("ground-4", [[_grp_on("gnd_run", 2, 0.05, "path_single"), _grp_on("gnd_walk", 1, 0.05, "path_dup"), _grp("gnd_walk", 1, 0.05), _grp("fly_walk", 1, 0.05)]]))
	var n4: int = rec.sent_wave_rejects.size()
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() == 2, 3.0)
	await _wait(0.5)
	var es4: Array = _sw_enemies()
	var d4: Dictionary = {"state": _bm().game_state, "count": es4.size(), "moves": es4.map(func(e): return e.movement_type), "hp": _bm().base_hp, "rejects": rec.sent_wave_rejects.size() - n4, "skipped": _route_reasons(_wm().get_last_plan_report())}
	_check("地面路線-4 同一波混合：無效的地面組略過（計畫的說明列出兩組與原因），合法的地面與飛行各 1 隻照常開戰；沒有 wave_rejected、城池 20",
		d4.state == 2 and d4.count == 2 and d4.moves == ["ground", "flying"] and d4.hp == MAX_HP and d4.rejects == 0 and d4.skipped == [[1, "gnd_run", "path_single", "ground_single_point"], [2, "gnd_walk", "path_dup", "ground_zero_length"]], d4)
	_load(_stage_b())

	# 地面路線-5：短但有效的地面路線（相鄰兩格、1 格長）照常出兵：兩個路點、剩餘 1 格；走到終點才扣城血（每秒 40 像素），不是一出現就扣
	_load(_route_payload("ground-5", [[_grp_on("gnd_walk", 1, 0.1, "path_short")]]))
	var n5: int = rec.sent_wave_rejects.size()
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() == 1, 3.0)
	var d5: Dictionary = {"spawned": _sw_enemies().size()}
	if _sw_enemies().size() == 1:
		var e5: Node = _sw_enemies()[0]
		var t5: float = float(e5.tile_size)
		var p5: float = _pt()
		d5["move"] = e5.movement_type
		d5["wps"] = e5._waypoints.size()
		d5["rem_tiles"] = snappedf(e5.get_remaining_distance() / t5, 0.01)
		d5["hp_at_spawn"] = _bm().base_hp
		d5["expect_sec"] = snappedf(t5 / 40.0, 0.001)
		await _wait_until(func(): return _bm().base_hp < MAX_HP, 5.0)
		d5["arrive_sec"] = snappedf(_pt() - p5, 0.001)
		d5["hp"] = _bm().base_hp
	d5["rejects"] = rec.sent_wave_rejects.size() - n5
	_check("地面路線-5 相鄰兩格的地面路線（1 格長）照常出兵：地面、兩個路點、剩餘 1 格、出現時城池 20；約 1 格 ÷ 40 像素／秒後抵達才扣 1；沒有拒絕",
		d5.get("spawned") == 1 and d5.get("move") == "ground" and d5.get("wps") == 2 and is_equal_approx(float(d5.get("rem_tiles", 0.0)), 1.0) and d5.get("hp_at_spawn") == MAX_HP and float(d5.get("arrive_sec", 0.0)) >= float(d5.get("expect_sec", 99.0)) - 0.1 and float(d5.get("arrive_sec", 99.0)) <= float(d5.get("expect_sec", 0.0)) + 0.5 and d5.get("hp") == MAX_HP - 1 and d5.get("rejects") == 0, d5)
	await _wait_until(func(): return _bm().game_state == 3, 5.0)

	# 地面路線-6：同一波的地面環狀路線（起終點同格、中間有 14 格路程）照常出兵，只略過兩個相同路點的組：
	# 環狀路線的敵人五個路點、剩餘 14 格、出現時城池 20；計畫的說明只列出 path_dup；沒有 wave_rejected
	_load(_route_payload("ground-6", [[_grp_on("gnd_walk", 1, 0.05, "path_loop"), _grp_on("gnd_walk", 1, 0.05, "path_dup")]]))
	var n6: int = rec.sent_wave_rejects.size()
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() == 1, 3.0)
	await _wait(0.3)
	var es6: Array = _sw_enemies()
	var d6: Dictionary = {"state": _bm().game_state, "count": es6.size(), "hp": _bm().base_hp, "rejects": rec.sent_wave_rejects.size() - n6, "skipped": _route_reasons(_wm().get_last_plan_report())}
	if es6.size() == 1:
		d6["wps"] = es6[0]._waypoints.size()
		d6["rem_tiles"] = snappedf((es6[0].get_remaining_distance() + es6[0].position.distance_to(es6[0]._waypoints[0])) / float(es6[0].tile_size), 0.01)
	_check("地面路線-6 地面環狀路線（起終點同格、中間有路程）照常出兵、同一波兩個相同路點的組略過：場上 1 隻、五個路點、全程 14 格、城池 20；計畫的說明只列 path_dup（ground_zero_length）；沒有 wave_rejected",
		d6.state == 2 and d6.count == 1 and d6.get("wps") == 5 and is_equal_approx(float(d6.get("rem_tiles", 0.0)), 14.0) and d6.hp == MAX_HP and d6.rejects == 0 and d6.skipped == [[2, "gnd_walk", "path_dup", "ground_zero_length"]], d6)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 防禦塔「優先飛行」（air_first）──
# 弓兵塔或文士塔放在 (6,4)，敵人都不會移動（飛行測試的 fly_post／gnd_post）。位置沿用飛行-7：
# 地面在最後一段路、剩餘 7.4 格（塔的上方 1.5 格）；飛行 A 剩餘約 9 格（左下 2.06 格，射程內）；飛行 B 剩餘較短（右下 1.41 格，射程內）；
# 射程外的飛行放在塔的右邊 3 格（剩餘最短，但射程 2.5 格打不到）
const AF_BASE_MODES: Array = ["first", "strongest", "weakest"]
const AF_AIR_MODES: Array = ["first", "strongest", "weakest", "air_first"]

func _af_cmd(rec: Node, tw: Node, mode: String, bid: String = "", uid: String = "") -> Dictionary:
	var n: int = rec.sent_tower_targets.size()
	_r19_js(rec, {"type": "set_tower_target", "battle_id": bid if bid != "" else _bm().battle_id, "tower_uid": uid if uid != "" else tw.tower_uid, "mode": mode})
	return rec.sent_tower_targets.back() if rec.sent_tower_targets.size() > n else {}

## 開戰（一波：地面 1、飛行 nf 隻），在 (6,4) 放 tower_type，敵人放到固定位置、選取這座塔後回傳 {tower, g, f:[...]}
func _af_start(battle_id: String, tower_type: String, nf: int) -> Dictionary:
	var es: Array = await _fly_start(battle_id, [_grp("gnd_post", 1, 0.02), _grp("fly_post", nf, 0.02)], 1 + nf, [], {}, {tower_type: Vector2i(6, 4)})
	var tw: Node = main.game_map.get_occupant(Vector2i(6, 4))
	if es.size() != 1 + nf or tw == null:
		return {}
	var t: float = float(tw.tile_size)
	var g: Node = es.filter(func(e): return not e.is_flying())[0]
	var fs: Array = es.filter(func(e): return e.is_flying())
	g._wp_index = 5
	g.global_position = tw.global_position + Vector2(0.0, -1.5) * t
	fs[0].global_position = tw.global_position + Vector2(-2.0, 0.5) * t
	if nf > 1:
		fs[1].global_position = tw.global_position + Vector2(1.0, 1.0) * t
	main._on_tower_clicked(tw)
	return {"tower": tw, "g": g, "f": fs}

## 清掉疊加減速（文士塔的測試每一段重新量）
func _af_clear_slow(es: Array) -> void:
	for e in es:
		if is_instance_valid(e):
			e._stack_slow_amount = 0.0
			e._stack_slow_timer = 0.0

func _air_first_cases() -> void:
	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)
	# Web 的升級命令（request_upgrade）：和拆除測試一樣接到 Main
	rec.upgrade_unit_requested.connect(main._on_web_upgrade_unit)

	# 優先飛行-0：可選的目標優先：弓兵塔、文士塔的面板與測試快照多了 air_first；步兵、砲兵、騎兵塔只有三種。
	# 只打地面的塔：Web 送 air_first 不套用、不回覆，Tower.set_target_mode 也拒絕（不能只靠前端隱藏）
	_load(_fly_payload("af-0", [[_grp("gnd_post", 1, 0.02)]]))
	var cells0: Dictionary = {"archer": Vector2i(5, 7), "scholar": Vector2i(6, 7), "infantry": Vector2i(7, 7), "artillery": Vector2i(8, 7), "cavalry": Vector2i(9, 7)}
	var d0: Dictionary = {}
	var ok0: bool = true
	for tt in cells0:
		var tw: Node = _r18_build(tt, cells0[tt])
		if tw == null:
			d0[tt] = "setup"
			ok0 = false
			continue
		var panel: Dictionary = _r18_panel(rec, tw)
		var snap: Dictionary = _fly_snapshot(rec)
		var reply: Dictionary = _af_cmd(rec, tw, "air_first")
		var air: bool = FLY_TOWERS[tt]
		var direct: bool = tw.set_target_mode("air_first") if not air else true
		var snap_modes = snap.get("tower_targets", {}).get(tw.tower_uid, {}).get("modes")
		d0[tt] = {"panel_modes": panel.get("target_modes"), "snap_modes": snap_modes, "reply": reply.get("target_mode"), "mode": tw.target_mode, "direct": direct}
		var want: Array = AF_AIR_MODES if air else AF_BASE_MODES
		ok0 = ok0 and panel.get("target_modes") == want and snap_modes == want
		if air:
			ok0 = ok0 and reply.get("target_mode") == "air_first" and tw.target_mode == "air_first"
		else:
			ok0 = ok0 and reply.is_empty() and tw.target_mode == "first" and direct == false
	main._deselect_unit()
	_check("優先飛行-0 可選的目標優先：弓兵塔、文士塔的面板與快照是 first／strongest／weakest／air_first，Web 選 air_first 後 Godot 回覆並套用；步兵、砲兵、騎兵塔只有三種，Web 送 air_first 不回覆、模式維持 first，set_target_mode 也回傳 false", ok0, d0)

	# 優先飛行-1：弓兵塔，地面（剩餘 7.4 格）與飛行 A（剩餘約 9 格）都在射程內：「優先前方」打地面（對照）；切到 air_first 後只打飛行
	var s: Dictionary = await _af_start("af-1", "archer", 1)
	var d1: Dictionary = {}
	if not s.is_empty():
		var tw: Node = s.tower
		var pair: Dictionary = {"g": s.g, "f": s.f[0]}
		var t: float = float(tw.tile_size)
		d1["rem"] = {"g": snappedf(s.g.get_remaining_distance() / t, 0.01), "f": snappedf(s.f[0].get_remaining_distance() / t, 0.01)}
		await _r17_wait_hit(pair)
		d1["first"] = (await _r17_hits(pair, 1.7)).dmg
		d1["reply"] = _af_cmd(rec, tw, "air_first").get("target_mode")
		await _r17_wait_hit(pair)
		d1["air"] = (await _r17_hits(pair, 1.7)).dmg
		# 優先飛行-2：飛行移到射程外（右邊 3 格，剩餘最短）→ 塔不放棄射程內的地面；飛行回到射程內 → 再改打飛行
		s.f[0].global_position = tw.global_position + Vector2(3.0, 0.0) * t
		d1["out_rem"] = snappedf(s.f[0].get_remaining_distance() / t, 0.01)
		await _r17_wait_hit(pair)
		d1["out"] = (await _r17_hits(pair, 1.7)).dmg
		s.f[0].global_position = tw.global_position + Vector2(-2.0, 0.5) * t
		await _r17_wait_hit(pair)
		d1["back"] = (await _r17_hits(pair, 1.7)).dmg
	_check("優先飛行-1 弓兵塔：地面剩餘較短（7.4 格）、飛行較遠（約 9 格）都在射程內：「優先前方」只打地面；切到 air_first（Godot 回覆 air_first）後只打飛行",
		d1.has("air") and float(d1.first.g) > 0.0 and float(d1.first.f) == 0.0 and d1.reply == "air_first" and float(d1.air.f) > 0.0 and float(d1.air.g) == 0.0 and float(d1.rem.g) < float(d1.rem.f), d1)
	_check("優先飛行-2 飛行在射程外（剩餘最短）：塔照常打射程內的地面（不因射程外有飛行而停手或打射程外）；飛行回到射程內後再只打飛行",
		d1.has("back") and float(d1.out.g) > 0.0 and float(d1.out.f) == 0.0 and float(d1.back.f) > 0.0 and float(d1.back.g) == 0.0, d1)

	# 優先飛行-3：兩個飛行與一個地面都在射程內：只打剩餘較短的飛行 B（不打地面、不打飛行 A）；兩個飛行在同一個位置時維持清單順序（先出現的 A）
	s = await _af_start("af-3", "archer", 2)
	var d3: Dictionary = {}
	if not s.is_empty():
		var tw: Node = s.tower
		var t: float = float(tw.tile_size)
		var trio: Dictionary = {"g": s.g, "fa": s.f[0], "fb": s.f[1]}
		_af_cmd(rec, tw, "air_first")
		d3["rem"] = {"g": snappedf(s.g.get_remaining_distance() / t, 0.01), "fa": snappedf(s.f[0].get_remaining_distance() / t, 0.01), "fb": snappedf(s.f[1].get_remaining_distance() / t, 0.01)}
		await _r17_wait_hit(trio)
		d3["near"] = (await _r17_hits(trio, 1.7)).dmg
		s.f[1].global_position = s.f[0].global_position
		await _r17_wait_hit(trio)
		d3["tie"] = (await _r17_hits(trio, 1.7)).dmg
	_check("優先飛行-3 兩個飛行與一個地面都在射程內：只打剩餘較短的飛行 B；兩個飛行在同一個位置（剩餘相同）時打先出現的 A；地面都不打",
		d3.has("tie") and float(d3.near.fb) > 0.0 and float(d3.near.fa) == 0.0 and float(d3.near.g) == 0.0 and float(d3.tie.fa) > 0.0 and float(d3.tie.fb) == 0.0 and float(d3.tie.g) == 0.0 and float(d3.rem.fb) < float(d3.rem.fa), d3)
	_load(_stage_b())

	# 優先飛行-4：文士塔：「優先前方」減速地面；air_first 只減速飛行；飛行移到射程外 → 減速地面。都不造成傷害
	s = await _af_start("af-4", "scholar", 1)
	var d4: Dictionary = {}
	if not s.is_empty():
		var tw: Node = s.tower
		var t: float = float(tw.tile_size)
		var pair: Dictionary = {"g": s.g, "f": s.f[0]}
		_af_clear_slow([s.g, s.f[0]])
		var r_first: Dictionary = await _r17_hits(pair, 1.5)
		d4["first"] = r_first.stack
		d4["reply"] = _af_cmd(rec, tw, "air_first").get("target_mode")
		_af_clear_slow([s.g, s.f[0]])
		var r_air: Dictionary = await _r17_hits(pair, 1.5)
		d4["air"] = r_air.stack
		s.f[0].global_position = tw.global_position + Vector2(3.0, 0.0) * t
		_af_clear_slow([s.g, s.f[0]])
		var r_out: Dictionary = await _r17_hits(pair, 1.5)
		d4["out"] = r_out.stack
		d4["dmg"] = [r_first.dmg, r_air.dmg, r_out.dmg]
	_check("優先飛行-4 文士塔：「優先前方」只減速地面；air_first（回覆 air_first）只減速飛行；飛行在射程外時減速地面；三段都沒有傷害",
		d4.has("out") and float(d4.first.g) > 0.0 and float(d4.first.f) == 0.0 and d4.reply == "air_first" and float(d4.air.f) > 0.0 and float(d4.air.g) == 0.0 and float(d4.out.g) > 0.0 and float(d4.out.f) == 0.0 and
		d4.dmg.all(func(x): return float(x.g) == 0.0 and float(x.f) == 0.0), d4)
	_load(_stage_b())

	# 優先飛行-5：切換不重置冷卻、不額外攻擊、不花錢：看到一擊的那一幀立刻切到 air_first，下一擊仍在 0.8 秒的前後一幀內、打的是飛行；
	# 金幣、攻擊力、射程、等級不變
	s = await _af_start("af-5", "archer", 1)
	var d5: Dictionary = {}
	if not s.is_empty():
		var tw: Node = s.tower
		var pair: Dictionary = {"g": s.g, "f": s.f[0]}
		var gold0: int = _bm().battle_gold
		var hit_a: Dictionary = await _r17_wait_hit(pair)
		var timer_before: float = tw._atk_timer
		var reply: Dictionary = _af_cmd(rec, tw, "air_first")
		var timer_after: float = tw._atk_timer
		var f_hp: float = s.f[0].current_hp
		var hit_b: Dictionary = await _r17_wait_hit(pair)
		d5 = {"reply": reply, "itv": snappedf(float(hit_b.t) - float(hit_a.t), 0.0001), "dt_a": hit_a.dt, "dt_b": hit_b.dt, "timer": [timer_before, timer_after],
			"f_hit": s.f[0].current_hp < f_hp, "gold": _bm().battle_gold - gold0, "atk": tw.atk, "range": tw.range_tiles, "level": tw.tower_level}
	_check("優先飛行-5 切換不重置冷卻：看到一擊的那一幀切到 air_first（回覆帶 battle_id、tower_uid），冷卻計時不變、下一擊間隔在 0.8 秒的前後一幀內且打飛行；金幣、攻擊力、射程、等級不變",
		d5.has("itv") and d5.reply.get("battle_id") == "af-5" and d5.reply.get("tower_uid") == s.tower.tower_uid and d5.reply.get("target_mode") == "air_first" and is_equal_approx(float(d5.timer[0]), float(d5.timer[1])) and
		float(d5.itv) >= 0.8 - float(d5.dt_a) - 0.0005 and float(d5.itv) <= 0.8 + float(d5.dt_b) + 0.0005 and d5.f_hit and d5.gold == 0 and is_equal_approx(float(d5.atk), 30.0) and is_equal_approx(float(d5.range), 2.5) and d5.level == 1, d5)

	# 優先飛行-6：2× 速度下切換：冷卻用遊戲時間，下一擊間隔仍是 0.8 秒（遊戲時間）的前後一幀；手動暫停中送 air_first 不套用、不回覆、冷卻不變；繼續後可以切換
	var d6: Dictionary = {}
	if not s.is_empty():
		var tw: Node = s.tower
		var pair: Dictionary = {"g": s.g, "f": s.f[0]}
		d6["speed"] = _r19_speed(rec, 2).get("speed")
		var hit_a: Dictionary = await _r17_wait_hit(pair)
		var reply: Dictionary = _af_cmd(rec, tw, "first")
		var hit_b: Dictionary = await _r17_wait_hit(pair)
		d6["itv"] = snappedf(float(hit_b.t) - float(hit_a.t), 0.0001)
		d6["dt"] = [hit_a.dt, hit_b.dt]
		d6["reply"] = reply.get("target_mode")
		d6["ts"] = Engine.time_scale
		_r19_speed(rec, 1)
		d6["paused"] = _r20_pause(rec, true).get("paused")
		var tm0: float = tw._atk_timer
		d6["paused_reply"] = _af_cmd(rec, tw, "air_first")
		d6["paused_mode"] = tw.target_mode
		d6["paused_timer_same"] = is_equal_approx(tw._atk_timer, tm0)
		_r20_pause(rec, false)
		d6["resumed_reply"] = _af_cmd(rec, tw, "air_first").get("target_mode")
	_check("優先飛行-6 2× 速度下從 air_first 切回 first：下一擊間隔仍在遊戲時間 0.8 秒的前後一幀內；手動暫停中送 air_first 不套用、不回覆、冷卻不變；繼續後切換成功",
		d6.has("itv") and d6.speed == 2 and is_equal_approx(float(d6.ts), 2.0) and d6.reply == "first" and float(d6.itv) >= 0.8 - float(d6.dt[0]) - 0.0005 and float(d6.itv) <= 0.8 + float(d6.dt[1]) + 0.0005 and
		d6.paused == true and d6.paused_reply.is_empty() and d6.paused_mode == "first" and d6.paused_timer_same and d6.resumed_reply == "air_first", d6)

	# 優先飛行-7：升級保留選擇：air_first 的弓兵塔升到 Lv2 → 仍是 air_first，面板的 target_mode 與 target_modes 照舊
	var d7: Dictionary = {}
	if not s.is_empty():
		var tw: Node = s.tower
		main._on_tower_clicked(tw)
		_r18_upgrade(rec)
		var panel: Dictionary = rec.sent_panels.back() if not rec.sent_panels.is_empty() else {}
		d7 = {"level": tw.tower_level, "mode": tw.target_mode, "panel_mode": panel.get("target_mode"), "panel_modes": panel.get("target_modes"), "panel_level": panel.get("level")}
	_check("優先飛行-7 升級保留選擇：air_first 的弓兵塔升到 Lv2 後仍是 air_first，面板帶 air_first 與四種可選",
		d7.get("level") == 2 and d7.get("mode") == "air_first" and d7.get("panel_mode") == "air_first" and d7.get("panel_modes") == AF_AIR_MODES and d7.get("panel_level") == 2, d7)
	_load(_stage_b())

	# 優先飛行-8：拆除重建、新的一場都回到 first：備戰中選 air_first → 拆除 → 同一格重建（新識別碼）是 first；
	# 舊識別碼的延遲命令不套用到新塔；新的一場放的塔也是 first
	_load(_fly_payload("af-8", [[_grp("gnd_post", 1, 0.02)]]))
	var d8: Dictionary = {}
	var t8: Node = _r18_build("archer", Vector2i(6, 4))
	if t8 != null:
		var p8: Dictionary = _r18_panel(rec, t8)
		d8["set"] = _af_cmd(rec, t8, "air_first").get("target_mode")
		var old_uid: String = t8.tower_uid
		d8["sold"] = _r18_sell(rec, old_uid, int(p8.get("sell_refund", -1))).get("ok")
		var t8b: Node = _r18_build("archer", Vector2i(6, 4))
		if t8b != null:
			var p8b: Dictionary = _r18_panel(rec, t8b)
			d8["rebuilt"] = {"uid_new": t8b.tower_uid != old_uid, "mode": t8b.target_mode, "panel_mode": p8b.get("target_mode")}
			d8["stale"] = _af_cmd(rec, t8b, "air_first", "", old_uid)
			d8["after_stale"] = t8b.target_mode
	_load(_fly_payload("af-8b", [[_grp("gnd_post", 1, 0.02)]]))
	var t8c: Node = _r18_build("scholar", Vector2i(6, 4))
	d8["new_battle"] = t8c.target_mode if t8c != null else null
	_check("優先飛行-8 拆除重建與新的一場回到 first：備戰中選 air_first 後拆除，同一格重建的新塔（新識別碼）是 first；舊識別碼的 air_first 命令不回覆、新塔仍是 first；新的一場的文士塔也是 first",
		d8.get("set") == "air_first" and d8.get("sold") == true and d8.get("rebuilt", {}).get("uid_new") == true and d8.get("rebuilt", {}).get("mode") == "first" and d8.get("rebuilt", {}).get("panel_mode") == "first" and
		d8.get("stale", {1: 1}).is_empty() and d8.get("after_stale") == "first" and d8.get("new_battle") == "first", d8)

	rec.upgrade_unit_requested.disconnect(main._on_web_upgrade_unit)
	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 敵人攻擊阻路武將的冷卻 ─────────────────────────────────────
# 每個敵人只有一份攻擊冷卻：阻擋中保留越過零點的零頭、沒有阻擋時停在 0（不囤積）、換阻擋對象不重設；
# 第一次接觸的時機不變（偵測到阻擋的那一步不攻擊，下一步打第一擊）

## 阻路武將（防禦 50）每被打一次實際扣的血：20 ×（1 − 50 ÷ 150）
const BLK_DMG: float = 20.0 * (1.0 - 50.0 / 150.0)

## 固定步進用的假地圖：world_to_grid 依 x 座標換算格子（每格 tile 像素，一律第 5 列）；get_occupant 回傳 cells 登記的單位
class BlkMap extends Node:
	var tile: float = 48.0
	var cells: Dictionary = {}

	func world_to_grid(p: Vector2) -> Vector2i:
		return Vector2i(int(floor(p.x / tile)), 5)

	func get_occupant(c: Vector2i) -> Node:
		var n = cells.get(c, null)
		return n if n != null and is_instance_valid(n) else null

## 真正的 Enemy 腳本（地面、速度 0：停在第 cell_x 格），不經過場景樹的物理處理：測試自己用固定的 delta 呼叫 _physics_process
func _blk_enemy(holder: Node, map: BlkMap, cell_x: int = 3) -> Node:
	var e: Node = load("res://entities/enemy/Enemy.gd").new()
	holder.add_child(e)
	e.set_physics_process(false)
	e.setup({"enemy_id": "blk", "hp": 99999.0, "speed": 0.0}, [Vector2(0.5 * map.tile, 0.0), Vector2(12.5 * map.tile, 0.0)])
	e.position = Vector2((float(cell_x) + 0.5) * map.tile, 0.0)
	e._game_map = map
	return e

## 真正的 Hero 腳本當作阻路武將：放在第 cell_x 格（第 5 列）、防禦 50、不攻擊（不處理 _process）；死亡時從假地圖移除（和 Main 相同）
func _blk_hero(holder: Node, map: BlkMap, cell_x: int, hp: float = 1000000.0) -> Node:
	var h: Node = load("res://entities/hero/Hero.gd").new()
	holder.add_child(h)
	h.set_process(false)
	h.grid_cell = Vector2i(cell_x, 5)
	h.max_hp = hp
	h.current_hp = hp
	h.def_stat = 50.0
	map.cells[h.grid_cell] = h
	h.hero_died.connect(func(x): map.cells.erase(x.grid_cell))
	return h

## 用固定的 delta 呼叫 steps 次 _physics_process（步數從 first 起算）：每一擊發生在第幾步、打到第幾位武將（[步, 武將]）；
## 同一步打到兩下以上時 multi 為 true；每擊實際扣血不是 BLK_DMG 的記在 bad；detect 是偵測到阻擋的第一步。
## ev 是從敵人的攻擊次數（blocker_attacks）記下的每一次攻擊 [步, 武將]，不看血量：被閃避、沒有扣血的攻擊也算（武將 -1 表示不在 hs 裡）。
## before 在每一步之前呼叫（測試在這裡移動、移除或新增武將）
func _blk_steps(e: Node, hs: Array, delta: float, steps: int, first: int = 1, before: Callable = Callable()) -> Dictionary:
	var at: Array = []
	var ev: Array = []
	var multi: bool = false
	var bad: Array = []
	var detect: int = -1
	for i in range(first, first + steps):
		if before.is_valid():
			before.call(i)
		var last: Array = []
		for h in hs:
			last.append(h.current_hp if is_instance_valid(h) else 0.0)
		var was_blocked: bool = e._blocker != null
		var n_atk: int = e.blocker_attacks
		e._physics_process(delta)
		if detect < 0 and not was_blocked and e._blocker != null:
			detect = i
		if e.blocker_attacks > n_atk:
			ev.append([i, hs.find(e._blocker)])
			if e.blocker_attacks > n_atk + 1:
				multi = true
		var n: int = 0
		for k in range(hs.size()):
			var now: float = hs[k].current_hp if is_instance_valid(hs[k]) else 0.0
			var drop: float = float(last[k]) - now
			if drop > 0.0001:
				n += 1
				at.append([i, k])
				if absf(drop - BLK_DMG) > 0.0001:
					bad.append(snappedf(drop, 0.0001))
		if n > 1:
			multi = true
	return {"at": at, "multi": multi, "bad": bad, "detect": detect, "ev": ev}

## 舊寫法的對照（只記錄，不影響判定）：第 1 步偵測、第 2 步打第一擊，之後每擊設回完整的 1 秒（丟掉零頭）
func _blk_old_rule(delta: float, steps: int) -> int:
	var timer: float = 0.0
	var n: int = 0
	for i in range(2, steps + 1):
		timer -= delta
		if timer <= 0.0:
			n += 1
			timer = 1.0
	return n

## 時間矩陣：一直被同一位武將擋住 30 秒遊戲時間。步長：1 倍（1/60）、2 倍（2/60）、部署慢速（0.1/60），
## 以及不整除攻擊間隔的步長（0.03、0.07、0.013，對照一幀長短不一）。
## 偵測到阻擋的第 1 步不攻擊、第 2 步打第一擊；第 k 擊和「第一擊＋k × 1 秒」相差 0 到一步；
## 總擊數和理想 1 + floor((總時間 − 第一擊的時間) ÷ 1) 相差不超過 1；每擊扣 BLK_DMG、一步最多一擊；1 倍與 2 倍相差不超過 1
func _blk_matrix(holder: Node) -> Dictionary:
	var bad: Array = []
	var rows: Array = []
	var n_by: Dictionary = {}
	for delta in [1.0 / 60.0, 2.0 / 60.0, 0.1 / 60.0, 0.03, 0.07, 0.013]:
		var map := BlkMap.new()
		holder.add_child(map)
		var e: Node = _blk_enemy(holder, map)
		var h: Node = _blk_hero(holder, map, 3)
		var steps: int = int(round(30.0 / delta))
		var r: Dictionary = _blk_steps(e, [h], delta, steps)
		var at: Array = r.at.map(func(x): return int(x[0]))
		var lo: float = 0.0
		var hi: float = 0.0
		var first_ok: bool = r.detect == 1 and not at.is_empty() and at[0] == 2
		if first_ok:
			for k in range(at.size()):
				var off: float = float(at[k] - at[0]) * delta - float(k) * 1.0
				lo = minf(lo, off)
				hi = maxf(hi, off)
		var ideal: int = int(floor((float(steps) * delta - 2.0 * delta) / 1.0 + 1e-9)) + 1
		var row: Dictionary = {"step": snappedf(delta, 0.000001), "detect": r.detect, "first": at[0] if not at.is_empty() else -1, "hits": at.size(), "ideal": ideal,
			"off": [snappedf(lo, 0.000001), snappedf(hi, 0.000001)], "old_rule": _blk_old_rule(delta, steps)}
		rows.append(row)
		if not first_ok or r.multi or not r.bad.is_empty() or lo < -1e-9 or hi > delta + 1e-9 or absi(at.size() - ideal) > 1:
			bad.append(row)
		n_by[snappedf(delta, 0.000001)] = at.size()
	var x1: int = int(n_by.get(snappedf(1.0 / 60.0, 0.000001), -99))
	var x2: int = int(n_by.get(snappedf(2.0 / 60.0, 0.000001), -99))
	if absi(x1 - x2) > 1:
		bad.append({"x1": x1, "x2": x2})
	return {"rows": rows, "bad": bad}

## 冷卻途中換阻擋對象（每秒 60 步）：A 擋住、第 2 步打第一擊，第 26 步（第一擊後 0.4 秒）之前讓 A 離開（how：died 死亡、moved 移位、removed 被移除），
## 同一格換成 B。之後不再打 A；B 的第一擊在 A 那一擊之後 1 秒（第 62 步，浮點誤差可能多一步），不是換目標後立即打
func _blk_retarget(holder: Node, how: String) -> Dictionary:
	var map := BlkMap.new()
	holder.add_child(map)
	var e: Node = _blk_enemy(holder, map)
	var a: Node = _blk_hero(holder, map, 3)
	var hs: Array = [a]
	var r1: Dictionary = _blk_steps(e, hs, 1.0 / 60.0, 25)
	var timer_before: float = e._blocker_atk_timer
	match how:
		"died":
			a.take_damage(1e12)
		"moved":
			map.cells.erase(a.grid_cell)
			a.grid_cell = Vector2i(3, 4)
		"removed":
			map.cells.erase(a.grid_cell)
			a.queue_free()
	var b: Node = _blk_hero(holder, map, 3)
	hs.append(b)
	var r2: Dictionary = _blk_steps(e, hs, 1.0 / 60.0, 100, 26)
	var a_after: Array = r2.at.filter(func(x): return int(x[1]) == 0)
	var b_hits: Array = r2.at.filter(func(x): return int(x[1]) == 1).map(func(x): return int(x[0]))
	var ok: bool = r1.detect == 1 and r1.at.size() == 1 and int(r1.at[0][0]) == 2 and a_after.is_empty() and b_hits.size() >= 2 \
		and b_hits[0] >= 62 and b_hits[0] <= 63 and b_hits[1] - b_hits[0] >= 59 and b_hits[1] - b_hits[0] <= 61 and not r2.multi and r2.bad.is_empty()
	var d: Dictionary = {"how": how, "a_first": r1.at, "timer_at_swap": snappedf(timer_before, 0.0001), "a_after": a_after, "b_hits": b_hits, "multi": r2.multi, "bad": r2.bad}
	return {"ok": ok, "d": d}

## 沒有阻擋的空檔不囤積（每秒 60 步）：A 擋住、第 2 步打第一擊，第 26 步之前 A 死亡；之後 180 步（3 秒）沒有武將：不攻擊、冷卻停在 0；
## 第 207 步之前放上 B：偵測的那一步不打、下一步（第 208 步）打一擊，再下一擊在 1 秒之後（60 步，浮點誤差可能多一步），不是一次補打好幾下
func _blk_idle(holder: Node) -> Dictionary:
	var map := BlkMap.new()
	holder.add_child(map)
	var e: Node = _blk_enemy(holder, map)
	var a: Node = _blk_hero(holder, map, 3)
	var r1: Dictionary = _blk_steps(e, [a], 1.0 / 60.0, 25)
	a.take_damage(1e12)
	var r2: Dictionary = _blk_steps(e, [a], 1.0 / 60.0, 181, 26)
	var idle_timer: float = e._blocker_atk_timer
	var b: Node = _blk_hero(holder, map, 3)
	var r3: Dictionary = _blk_steps(e, [b], 1.0 / 60.0, 100, 207)
	var bh: Array = r3.at.map(func(x): return int(x[0]))
	var ok: bool = r1.at.size() == 1 and r2.at.is_empty() and idle_timer == 0.0 and r3.detect == 207 and bh.size() >= 2 and bh[0] == 208 \
		and bh[1] - bh[0] >= 60 and bh[1] - bh[0] <= 61 and not r3.multi
	var d: Dictionary = {"first": r1.at, "idle_hits": r2.at, "idle_timer": idle_timer, "b_detect": r3.detect, "b_hits": bh}
	return {"ok": ok, "d": d}

## 反覆移入移出（每秒 60 步、5 秒）：A 擋住之後，每 6 步把 A 移到旁邊一步再移回原格。每次移回都是新的接觸，
## 但冷卻是這個敵人共享的：擊數不超過 1 + floor((300 − 2) ÷ 60) + 1，相鄰兩擊至少隔 59 步
func _blk_toggle(holder: Node) -> Dictionary:
	var map := BlkMap.new()
	holder.add_child(map)
	var e: Node = _blk_enemy(holder, map)
	var a: Node = _blk_hero(holder, map, 3)
	var contacts: Array = [0]
	var toggle := func(i: int) -> void:
		if i < 3:
			return
		if i % 6 == 0:
			map.cells.erase(a.grid_cell)
			a.grid_cell = Vector2i(3, 4)
		elif i % 6 == 1:
			a.grid_cell = Vector2i(3, 5)
			map.cells[a.grid_cell] = a
			contacts[0] += 1
	var r: Dictionary = _blk_steps(e, [a], 1.0 / 60.0, 300, 1, toggle)
	var at: Array = r.at.map(func(x): return int(x[0]))
	var min_gap: int = 9999
	for k in range(1, at.size()):
		min_gap = mini(min_gap, at[k] - at[k - 1])
	var ok: bool = contacts[0] >= 40 and at.size() >= 2 and at.size() <= 1 + int(floor(298.0 / 60.0)) + 1 and min_gap >= 59 and not r.multi
	var d: Dictionary = {"contacts": contacts[0], "hits": at, "min_gap_steps": min_gap}
	return {"ok": ok, "d": d}

## 依序回傳 st.us 的抽樣值（循環使用），st.i 是已經抽了幾次：閃避的測試替身（Hero.dodge_roll_override）
func _dodge_seq(st: Dictionary) -> Callable:
	var f := func() -> float:
		var u: float = float(st.us[int(st.i) % st.us.size()])
		st.i = int(st.i) + 1
		return u
	return f

## 被閃避的攻擊照樣用掉冷卻（每秒 60 步、10 秒）：同一個固定步進的情境跑兩次，阻路的武將分別是普通武將，
## 以及會閃避的武將（機率 0.15、抽樣值依序 0、0.9、0.1、0.5 循環：第 1、3、5… 擊閃避）。
## 兩邊的攻擊事件（敵人的攻擊次數）發生在完全相同的步數、每一步的冷卻完全相同（閃避後不會因為沒扣血而提早再打）；
## 會閃避的那一邊：閃避的那幾擊不扣血、其餘每擊扣 13.333，判定次數＝攻擊次數
func _blk_dodge_cadence(holder: Node) -> Dictionary:
	var runs: Dictionary = {}
	for kind in ["plain", "dodge"]:
		var map := BlkMap.new()
		holder.add_child(map)
		var e: Node = _blk_enemy(holder, map)
		var h: Node = _blk_hero(holder, map, 3)
		var st: Dictionary = {"i": 0, "us": [0.0, 0.9, 0.1, 0.5]}
		if kind == "dodge":
			h.dodge_chance = 0.15
			h.dodge_roll_override = _dodge_seq(st)
		var timers: Array = []
		var ref: Dictionary = {"e": e}
		var rec_t := func(_i: int) -> void:
			timers.append(ref.e._blocker_atk_timer)
		var r: Dictionary = _blk_steps(e, [h], 1.0 / 60.0, 600, 1, rec_t)
		runs[kind] = {"ev": r.ev.map(func(x): return int(x[0])), "hp_at": r.at.map(func(x): return int(x[0])), "timers": timers,
			"multi": r.multi, "bad": r.bad, "rolls": h.dodge_rolls, "dodges": h.dodge_count, "hp": h.current_hp, "calls": st.i}
	var p: Dictionary = runs.plain
	var q: Dictionary = runs.dodge
	var n: int = q.ev.size()
	var hit_steps: Array = []
	for k in range(n):
		if k % 2 == 1:
			hit_steps.append(q.ev[k])
	var n_dodged: int = int(ceil(float(n) / 2.0))
	var n_hit: int = n - n_dodged
	var ok: bool = n >= 10 and p.ev == q.ev and p.ev[0] == 2 and p.timers == q.timers and p.hp_at == p.ev and q.hp_at == hit_steps \
		and q.rolls == n and q.calls == n and q.dodges == n_dodged and is_equal_approx(float(q.hp), 1000000.0 - float(n_hit) * BLK_DMG) \
		and not p.multi and not q.multi and p.bad.is_empty() and q.bad.is_empty()
	var d: Dictionary = {"attacks": n, "same_steps": p.ev == q.ev, "same_timers": p.timers == q.timers, "first_steps": p.ev.slice(0, 3),
		"hp_drop_steps": q.hp_at.slice(0, 3), "rolls": q.rolls, "dodges": q.dodges, "lost": snappedf(1000000.0 - float(q.hp), 0.0001)}
	return {"ok": ok, "d": d}

## 換成會閃避的武將、或從它換走，都不會多打（每秒 60 步，用攻擊事件計數）。會閃避的武將的抽樣值一律 0（每擊都閃避）：
## - dodger_first：A 會閃避，第 2 步的第一擊被閃避；第 26 步之前 A 被移除，同一格換成普通的 B
## - 否則：A 是普通武將，第 2 步打第一擊之後 A 死亡，同一格換成會閃避的 B
## 之後不再攻擊 A；B 的第一次攻擊在上一擊的 1 秒後（第 62 步，浮點誤差可能多一步），100 步內共 2 次
func _blk_dodge_retarget(holder: Node, dodger_first: bool) -> Dictionary:
	var map := BlkMap.new()
	holder.add_child(map)
	var e: Node = _blk_enemy(holder, map)
	var a: Node = _blk_hero(holder, map, 3)
	var st: Dictionary = {"i": 0, "us": [0.0]}
	if dodger_first:
		a.dodge_chance = 0.15
		a.dodge_roll_override = _dodge_seq(st)
	var hs: Array = [a]
	var r1: Dictionary = _blk_steps(e, hs, 1.0 / 60.0, 25)
	var a_hp: float = a.current_hp
	if dodger_first:
		map.cells.erase(a.grid_cell)
		a.queue_free()
	else:
		a.take_damage(1e12)
	var b: Node = _blk_hero(holder, map, 3)
	if not dodger_first:
		b.dodge_chance = 0.15
		b.dodge_roll_override = _dodge_seq(st)
	hs.append(b)
	var r2: Dictionary = _blk_steps(e, hs, 1.0 / 60.0, 100, 26)
	var ev_a: Array = r2.ev.filter(func(x): return int(x[1]) == 0)
	var ev_b: Array = r2.ev.filter(func(x): return int(x[1]) == 1).map(func(x): return int(x[0]))
	var ok: bool = r1.ev.size() == 1 and int(r1.ev[0][0]) == 2 and ev_a.is_empty() and r2.ev.size() == 2 and ev_b.size() == 2 \
		and ev_b[0] >= 62 and ev_b[0] <= 63 and ev_b[1] - ev_b[0] >= 59 and ev_b[1] - ev_b[0] <= 61 and not r2.multi
	var d: Dictionary = {"a_first": r1.ev, "a_after": ev_a, "b_attacks": ev_b, "a_hp": a_hp, "b_hp": b.current_hp, "calls": st.i}
	if dodger_first:
		# A 的第一擊被閃避（血量不變）、只判定一次；B 是普通武將，每擊扣 13.333
		ok = ok and a_hp == 1000000.0 and st.i == 1 and is_equal_approx(b.current_hp, 1000000.0 - 2.0 * BLK_DMG)
	else:
		# A 被打了一擊；B 的兩次攻擊都被閃避（血量不變）、判定 2 次
		ok = ok and is_equal_approx(a_hp, 1000000.0 - BLK_DMG) and b.current_hp == 1000000.0 and b.dodge_rolls == 2 and b.dodge_count == 2 and st.i == 2
	return {"ok": ok, "d": d}

## 實際引擎用的關卡：直線路線（第 5 列），阻路的武將射程 0.3 格：敵人走進武將的格子被擋下時（離中心約半格）武將打不到它，不會緩速或打倒它
func _blk_payload(battle_id: String, waves: Array, hp: float, skill_a: Variant = null) -> Dictionary:
	var a: Dictionary = _r12_hero("blk_a", skill_a)
	a["hp"] = hp
	var b: Dictionary = _r12_hero("blk_b", null)
	b["hp"] = hp
	b["slot"] = 2
	var p: Dictionary = _r12_payload("blk_a", waves, battle_id, [a, b])
	p["heroes_config"] = [
		{"hero_id": "blk_a", "name": "A", "job": "infantry", "attack_range": 0.3, "attack_speed": 0.5},
		{"hero_id": "blk_b", "name": "B", "job": "infantry", "attack_range": 0.3, "attack_speed": 0.5},
	]
	return p

## 載入一場（一波）、放置武將（cells：hero_id → 格子）、speed 不是 1 時切換速度、開戰並等第一個敵人出現。
## skill_a 是武將 A 的技能參數；setup 在放置之後、開戰之前呼叫（測試在這裡換上閃避的測試替身）
func _blk_start(rec: Node, battle_id: String, groups: Array, cells: Dictionary, speed: int = 1, hp: float = 1000000.0, skill_a: Variant = null, setup: Callable = Callable()) -> Node:
	_load(_blk_payload(battle_id, [groups], hp, skill_a))
	for hid in cells:
		_r12_place(hid, cells[hid])
	if setup.is_valid():
		setup.call()
	if speed != 1:
		_r19_speed(rec, float(speed))
	_bm().player_start_battle()
	await _wait_until(func(): return _first_enemy() != null, 5.0)
	return _first_enemy()

## 實際引擎：逐個物理步進記錄這些武將被敵人打的時間（敵人攻擊武將在物理步進裡）。在 physics_frame 信號當下讀取：
## 這一步的節點還沒處理，讀到的血量與物理時鐘都是到上一步為止，所以每一擊記到的是它發生那一步結束時的物理時鐘。
## 記錄到物理時鐘前進 sec 秒為止；wall_ms ≥ 0 時改成等牆鐘 wall_ms 毫秒（暫停中物理時鐘不前進）。
## 血量歸零（死亡）不算一擊；each(tr) 在每一步讀取之後呼叫（測試在這裡移動、打倒或放置武將；設 tr.stop 為 true 就提前結束）
func _blk_track(hs: Array, sec: float, wall_ms: int = -1, each: Callable = Callable()) -> Dictionary:
	var tr: Dictionary = {"hits": [], "multi": false, "bad": [], "smax": 0.0, "steps": 0}
	var last: Array = []
	for h in hs:
		last.append(h.current_hp if is_instance_valid(h) else 0.0)
	var p_end: float = _pt() + sec
	var w_end: int = Time.get_ticks_msec() + (wall_ms if wall_ms >= 0 else int(sec * 4000.0) + 15000)
	var prev: float = _pt()
	while (wall_ms >= 0 or _pt() < p_end) and Time.get_ticks_msec() < w_end:
		await physics_frame
		tr.steps += 1
		tr.smax = maxf(float(tr.smax), _pt() - prev)
		prev = _pt()
		var n: int = 0
		for k in range(hs.size()):
			var alive: bool = is_instance_valid(hs[k]) and hs[k].current_hp > 0.0
			var now: float = hs[k].current_hp if alive else 0.0
			var drop: float = float(last[k]) - now
			if alive and drop > 0.0001:
				n += 1
				tr.hits.append({"t": _pt(), "k": k})
				if absf(drop - BLK_DMG) > 0.0001:
					tr.bad.append(snappedf(drop, 0.0001))
			last[k] = now
		if n > 1:
			tr.multi = true
		if each.is_valid():
			each.call(tr)
		if tr.get("stop", false):
			break
	return tr

func _blk_times(tr: Dictionary, k: int = -1) -> Array:
	return tr.hits.filter(func(h): return k < 0 or int(h.k) == k).map(func(h): return float(h.t))

## 把武將移到另一格（和 Main 的移位相同：釋放舊格子、reposition、佔用新格子）。遊戲裡移位只在備戰；測試直接呼叫
func _blk_move(h: Node, cell: Vector2i) -> void:
	main.game_map.clear_occupied(h.get_cell())
	h.reposition(cell, main.game_map.grid_to_world(cell), main.game_map)
	main.game_map.set_occupied(cell, h)

func _blocker_cases() -> void:
	var holder := Node2D.new()
	holder.visible = false
	root.add_child(holder)

	# 阻路-1：時間矩陣（固定步進、真正的 Enemy／Hero 程式）
	var m: Dictionary = _blk_matrix(holder)
	_check("阻路-1 冷卻保留零頭（固定步進 30 秒遊戲時間，步長 1 倍／2 倍／部署慢速與 0.03／0.07／0.013 秒）：偵測的那一步不打、下一步打第一擊（第一次接觸的時機不變）；每一擊和「第一擊＋k × 1 秒」只差不到一步、總擊數和理想相差不超過 1、每擊扣 13.333、一步最多一擊；1 倍與 2 倍相差不超過 1",
		m.bad.is_empty() and m.rows.size() == 6, m)

	# 阻路-2：冷卻途中換阻擋對象（A 死亡、移位、被移除）不重設冷卻
	var r2a: Dictionary = _blk_retarget(holder, "died")
	var r2b: Dictionary = _blk_retarget(holder, "moved")
	var r2c: Dictionary = _blk_retarget(holder, "removed")
	_check("阻路-2a 冷卻途中阻擋的武將死亡、同一格換成 B：之後不再打 A；B 的第一擊在 A 那一擊的 1 秒後（第 62 步），不是換目標就立即打", r2a.ok, r2a.d)
	_check("阻路-2b 冷卻途中阻擋的武將移位、同一格換成 B：之後不再打 A；B 的第一擊在 A 那一擊的 1 秒後", r2b.ok, r2b.d)
	_check("阻路-2c 冷卻途中阻擋的武將被移除（排入刪除、這一幀還沒釋放）、同一格換成 B：同一幀之內也不再打被移除的 A；B 的第一擊在 A 那一擊的 1 秒後", r2c.ok, r2c.d)

	# 阻路-3：空檔不囤積
	var r3: Dictionary = _blk_idle(holder)
	_check("阻路-3 沒有阻擋的 3 秒不攻擊、冷卻停在 0；再被擋住時偵測的那一步不打、下一步打一擊，之後照 1 秒，不補打", r3.ok, r3.d)

	# 阻路-4：反覆移入移出不能連擊
	var r4: Dictionary = _blk_toggle(holder)
	_check("阻路-4 反覆移入移出（5 秒內重新接觸 40 次以上）：冷卻是這個敵人共享的，擊數不超過 7、相鄰兩擊至少隔 59 步", r4.ok, r4.d)
	# 阻路-13：被閃避的攻擊照樣用掉冷卻（用敵人的攻擊次數計數，不看血量）
	var r13: Dictionary = _blk_dodge_cadence(holder)
	_check("阻路-13 被閃避的攻擊照樣用掉冷卻（固定步進 10 秒，用敵人的攻擊次數計數）：阻路的武將會閃避時，攻擊發生的步數與每一步的冷卻都和普通武將完全相同（第 2 步起每 60 步一次）；閃避的那幾擊不扣血、其餘每擊扣 13.333，判定次數＝攻擊次數", r13.ok, r13.d)

	# 阻路-14：換成會閃避的武將、或從它換走，都不會多打
	var r14a: Dictionary = _blk_dodge_retarget(holder, true)
	var r14b: Dictionary = _blk_dodge_retarget(holder, false)
	_check("阻路-14a 會閃避的武將閃避第一擊後被移除、同一格換成普通武將：不再攻擊被移除的武將；下一次攻擊在上一擊的 1 秒後（第 62～63 步），100 步內共 2 次（用攻擊事件計數）", r14a.ok, r14a.d)
	_check("阻路-14b 普通武將死亡、同一格換成會閃避的武將：下一次攻擊在上一擊的 1 秒後，100 步內共 2 次，兩次都被閃避（血量不變）、判定 2 次（用攻擊事件計數）", r14b.ok, r14b.d)
	holder.queue_free()

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)
	var step: float = 1.0 / float(Engine.physics_ticks_per_second)

	# 阻路-5：實際引擎的第一次接觸：地面敵人走進武將的格子被擋下，偵測到阻擋的那一步之後的下一步打第一擊（時機不變），
	# 第二擊在第一擊的 1 秒後（一步之內）；每擊扣 13.333
	var e5: Node = await _blk_start(rec, "blk-5", [_grp("gnd_run", 1, 0.02)], {"blk_a": Vector2i(4, 5)})
	var d5: Dictionary = {}
	var ok5: bool = false
	var a5: Node = _fly_hero("blk_a")
	if e5 != null and a5 != null:
		var det5: Array = [-1.0]
		var tr5_each := func(_tr) -> void:
			if det5[0] < 0.0 and is_instance_valid(e5) and e5._blocker != null:
				det5[0] = _pt()
		var tr5: Dictionary = await _blk_track([a5], 3.0, -1, tr5_each)
		var t5: Array = _blk_times(tr5)
		ok5 = det5[0] > 0.0 and t5.size() >= 2 and absf(t5[0] - det5[0] - step) < 1e-6 and t5[1] - t5[0] >= 1.0 - 0.0005 and t5[1] - t5[0] <= 1.0 + float(tr5.smax) + 0.0005 and tr5.bad.is_empty() and not tr5.multi
		d5 = {"detect": snappedf(det5[0], 0.0001), "hits": t5.map(func(t): return snappedf(t - det5[0], 0.0001)), "step": step, "bad": tr5.bad}
	_check("阻路-5 實際引擎第一次接觸：偵測到阻擋的下一個物理步進打第一擊（時機不變），第二擊在 1 秒後（一步之內），每擊扣 13.333", ok5, d5)

	# 阻路-6：實際引擎長時間 1× 與 2×：從第一擊起 10.5 秒遊戲時間內都是 11 擊；整段追蹤（12 秒）的扣血＝整段的擊數 × 13.333；
	# 每一擊和「第一擊＋k × 1 秒」的差距不超過一步（累積時程不漂移）、一步最多一擊
	var d6: Dictionary = {}
	for sp in [1, 2]:
		var e6: Node = await _blk_start(rec, "blk-6x%d" % sp, [_grp("gnd_run", 1, 0.02)], {"blk_a": Vector2i(4, 5)}, sp)
		var a6: Node = _fly_hero("blk_a")
		if e6 == null or a6 == null:
			d6[sp] = {"setup": false}
			continue
		await _wait_until(func(): return is_instance_valid(e6) and e6._blocker != null, 5.0)
		var hp0: float = a6.current_hp
		var tr6: Dictionary = await _blk_track([a6], 12.0)
		var t6: Array = _blk_times(tr6)
		var win: Array = t6.filter(func(t): return t - t6[0] < 10.5) if not t6.is_empty() else []
		var lost: float = hp0 - a6.current_hp
		d6[sp] = {"in_window": win.size(), "total_hits": t6.size(), "lost": snappedf(lost, 0.0001), "spread": snappedf(_r20_spread(t6, 1.0), 0.0001), "smax": snappedf(float(tr6.smax), 0.0001),
			"multi": tr6.multi, "bad": tr6.bad, "lost_ok": is_equal_approx(lost, float(t6.size()) * BLK_DMG)}
	var ok6: bool = true
	for sp in [1, 2]:
		var r: Dictionary = d6.get(sp, {})
		ok6 = ok6 and r.get("in_window") == 11 and r.get("lost_ok") == true and float(r.get("spread", 99.0)) >= 0.0 and float(r.get("spread", 99.0)) <= float(r.get("smax", 0.0)) + 0.0005 and r.get("multi") == false and r.get("bad", [1]).is_empty()
	_check("阻路-6 實際引擎長時間 1× 與 2×：從第一擊起 10.5 秒遊戲時間內都是 11 擊、扣血＝擊數 × 13.333；累積時程（第一擊＋k × 1 秒）的差距不超過一步、一步最多一擊", ok6, d6)
	_r19_speed(rec, 1.0)

	# 阻路-7：實際引擎跨暫停、部署慢速與倍率：命令當下冷卻與武將血量不變；暫停 1.2 秒（牆鐘）期間不攻擊、冷卻不動；
	# 整段每一擊和累積時程的差距不超過一步，擊數和經過的遊戲時間相符
	var e7: Node = await _blk_start(rec, "blk-7", [_grp("gnd_run", 1, 0.02)], {"blk_a": Vector2i(4, 5)})
	var a7: Node = _fly_hero("blk_a")
	var d7: Dictionary = {}
	var ok7: bool = false
	if e7 != null and a7 != null:
		await _wait_until(func(): return is_instance_valid(e7) and e7._blocker != null, 5.0)
		var all_t: Array = []
		var tr7: Dictionary = await _blk_track([a7], 1.5)
		all_t.append_array(_blk_times(tr7))
		var smax: float = float(tr7.smax)
		var cmds: Array = []
		var seq: Array = [
			["pause", func(): _r20_pause(rec, true), [0.0, 1200]],
			["resume", func(): _r20_pause(rec, false), [1.3, -1]],
			["menu", func(): d7["menu"] = _r19_open(rec), [0.0, 1500]],
			["close", func(): _r19_close(rec, d7.get("menu", {})), [1.2, -1]],
			["speed2", func(): _r19_speed(rec, 2.0), [2.5, -1]],
			["speed1", func(): _r19_speed(rec, 1.0), [1.5, -1]],
		]
		for st in seq:
			var b: Array = [e7._blocker_atk_timer, a7.current_hp]
			st[1].call()
			var a: Array = [e7._blocker_atk_timer, a7.current_hp]
			var w: Array = st[2]
			var p0: float = _pt()
			var trs: Dictionary = await _blk_track([a7], float(w[0]), int(w[1]))
			var ts: Array = _blk_times(trs)
			all_t.append_array(ts)
			smax = maxf(smax, float(trs.smax))
			cmds.append({"cmd": st[0], "timer_same": b[0] == a[0], "hp_same": b[1] == a[1], "hits": ts.size(), "game_s": snappedf(_pt() - p0, 0.001),
				"timer_after": snappedf(e7._blocker_atk_timer, 0.0001), "timer_cmd": snappedf(float(a[0]), 0.0001)})
		var paused: Dictionary = cmds[0]
		var el: float = all_t.back() - all_t[0] if all_t.size() >= 2 else -1.0
		var expect_n: int = int(floor(el / 1.0 + 1e-9)) + 1
		var spread: float = _r20_spread(all_t, 1.0)
		var cmd_ok: bool = true
		for c in cmds:
			cmd_ok = cmd_ok and c.timer_same and c.hp_same
		ok7 = cmd_ok and paused.hits == 0 and paused.game_s == 0.0 and paused.timer_after == paused.timer_cmd and all_t.size() >= 6 and absi(all_t.size() - expect_n) <= 1 and spread >= 0.0 and spread <= smax + 0.0005
		d7 = {"cmds": cmds, "hits": all_t.size(), "expect": expect_n, "spread": snappedf(spread, 0.0001), "smax": snappedf(smax, 0.0001)}
	_check("阻路-7 實際引擎跨暫停／部署慢速／倍率：命令當下冷卻與武將血量不變；暫停 1.2 秒不攻擊、冷卻不動；整段每一擊和累積時程（第一擊＋k × 1 秒）的差距不超過一步、擊數和遊戲時間相符", ok7, d7)

	# 阻路-8：實際引擎的阻擋武將死亡後換目標：A（第 4 格）打過一擊後 0.3 秒被打倒，敵人往前走進第 5 格被 B 擋住（在冷卻結束之前）；
	# B 的第一擊在 A 最後一擊的 1 秒後（一步之內），不是接觸就立即打；A 死亡後不再被打
	var e8: Node = await _blk_start(rec, "blk-8", [_grp("gnd_run", 1, 0.02)], {"blk_a": Vector2i(4, 5), "blk_b": Vector2i(5, 5)})
	var a8: Node = _fly_hero("blk_a")
	var b8: Node = _fly_hero("blk_b")
	var d8: Dictionary = {}
	var ok8: bool = false
	if e8 != null and a8 != null and b8 != null:
		# 會被打倒釋放的節點放在字典裡引用（lambda 直接捕捉的物件被釋放後，每次呼叫都會印錯誤）
		var st8: Dictionary = {"killed_at": -1.0, "det_b": -1.0, "a": a8, "b": b8, "e": e8}
		var tr8_each := func(tr) -> void:
			var ah: Array = tr.hits.filter(func(h): return int(h.k) == 0)
			if st8.killed_at < 0.0 and not ah.is_empty() and _pt() - float(ah[0].t) >= 0.3:
				st8.killed_at = _pt()
				st8.a.take_damage(1e12)
			if st8.det_b < 0.0 and is_instance_valid(st8.e) and is_instance_valid(st8.b) and st8.e._blocker == st8.b:
				st8.det_b = _pt()
		var tr8: Dictionary = await _blk_track([a8, b8], 4.0, -1, tr8_each)
		var ta: Array = _blk_times(tr8, 0)
		var tb: Array = _blk_times(tr8, 1)
		var gap: float = tb[0] - ta.back() if not ta.is_empty() and not tb.is_empty() else -1.0
		ok8 = ta.size() == 1 and st8.killed_at > 0.0 and st8.det_b > 0.0 and st8.det_b < ta.back() + 0.9 and tb.size() >= 2 and gap >= 1.0 - 0.0005 and gap <= 1.0 + float(tr8.smax) + 0.0005 and tr8.bad.is_empty()
		d8 = {"a_hits": ta.size(), "killed_after_hit": snappedf(st8.killed_at - (ta[0] if not ta.is_empty() else 0.0), 0.0001), "b_detect_after_a": snappedf(st8.det_b - (ta.back() if not ta.is_empty() else 0.0), 0.0001),
			"b_first_after_a": snappedf(gap, 0.0001), "b_hits": tb.size(), "smax": snappedf(float(tr8.smax), 0.0001), "bad": tr8.bad}
	_check("阻路-8 實際引擎：阻擋的武將死亡後，敵人在冷卻結束前被下一位武將擋住；下一位的第一擊在上一擊的 1 秒後（一步之內），死亡的武將不再被打", ok8, d8)

	# 阻路-9：實際引擎反覆移入移出：A 擋住並打過一擊後，4 秒內每 6 步把 A 移到上方的建築格、下一步移回敵人所在的格子（重新接觸 30 次以上）；
	# 擊數不超過 1 + 4 + 1，相鄰兩擊至少隔 1 秒減一步
	var e9: Node = await _blk_start(rec, "blk-9", [_grp("gnd_walk", 1, 0.02)], {"blk_a": Vector2i(1, 5)})
	var a9: Node = _fly_hero("blk_a")
	var d9: Dictionary = {}
	var ok9: bool = false
	if e9 != null and a9 != null:
		# 先等 A 被打第一擊
		var tr9a_each := func(tr) -> void:
			if not tr.hits.is_empty():
				tr["stop"] = true
		var tr9a: Dictionary = await _blk_track([a9], 4.0, -1, tr9a_each)
		var st9: Dictionary = {"n": 0, "contacts": 0}
		var tr9_each := func(_tr) -> void:
			if not is_instance_valid(e9) or not is_instance_valid(a9):
				return
			st9.n += 1
			if st9.n % 6 == 0:
				_blk_move(a9, Vector2i(a9.get_cell().x, 4))
			elif st9.n % 6 == 1 and st9.n > 1:
				_blk_move(a9, main.game_map.world_to_grid(e9.position))
				st9.contacts += 1
		var tr9: Dictionary = await _blk_track([a9], 4.0, -1, tr9_each)
		var t9: Array = _blk_times(tr9)
		var first9: Array = _blk_times(tr9a)
		var all9: Array = first9.slice(0, 1) + t9
		var gap9: float = 99.0
		for k in range(1, all9.size()):
			gap9 = minf(gap9, all9[k] - all9[k - 1])
		ok9 = not first9.is_empty() and st9.contacts >= 30 and t9.size() <= 5 and gap9 >= 1.0 - float(tr9.smax) - 0.0005 and not tr9.multi
		d9 = {"contacts": st9.contacts, "hits_in_4s": t9.size(), "min_gap": snappedf(gap9, 0.0001), "smax": snappedf(float(tr9.smax), 0.0001)}
	_check("阻路-9 實際引擎反覆移入移出（4 秒內重新接觸 30 次以上）：4 秒內最多 5 擊、相鄰兩擊至少隔 1 秒減一步，不會每次接觸都立即打", ok9, d9)

	# 阻路-10：實際引擎空檔不囤積：A（第 1 格）打過一擊後 0.2 秒被打倒，同時在第 4 格放上 B；敵人往前走 3 格（約 3.8 秒）才被 B 擋住。
	# 走路期間冷卻停在 0；B 被偵測後的下一步打一擊，第二擊在 1 秒後（一步之內），1.5 秒內共 2 擊（不補打）
	var e10: Node = await _blk_start(rec, "blk-10", [_grp("gnd_walk", 1, 0.02)], {"blk_a": Vector2i(1, 5)})
	var a10: Node = _fly_hero("blk_a")
	var d10: Dictionary = {}
	var ok10: bool = false
	if e10 != null and a10 != null:
		# 會被打倒釋放的節點放在字典裡引用（同阻路-8）
		var st10: Dictionary = {"killed": false, "det_b": -1.0, "timer_before_b": -1.0, "b": null, "a": a10, "e": e10}
		var tr10_each := func(tr) -> void:
			if not st10.killed and not tr.hits.is_empty() and _pt() - float(tr.hits[0].t) >= 0.2:
				st10.killed = true
				st10.a.take_damage(1e12)
				_r12_place("blk_b", Vector2i(4, 5))
				st10.b = _fly_hero("blk_b")
			if st10.b != null and is_instance_valid(st10.e):
				if st10.e._blocker == st10.b:
					st10.det_b = _pt()
					tr["stop"] = true
				else:
					st10.timer_before_b = st10.e._blocker_atk_timer
		var tr10: Dictionary = await _blk_track([a10], 9.0, -1, tr10_each)
		var b10: Node = st10.b
		var tb: Array = []
		var smax10: float = 0.0
		if b10 != null and is_instance_valid(b10) and st10.det_b > 0.0:
			var tr10b: Dictionary = await _blk_track([b10], 1.5)
			tb = _blk_times(tr10b)
			smax10 = float(tr10b.smax)
		ok10 = st10.killed and st10.det_b > 0.0 and st10.timer_before_b == 0.0 and _blk_times(tr10).size() == 1 and tb.size() == 2 			and absf(tb[0] - st10.det_b - step) < 1e-6 and tb[1] - tb[0] >= 1.0 - 0.0005 and tb[1] - tb[0] <= 1.0 + smax10 + 0.0005
		d10 = {"a_hits": _blk_times(tr10).size(), "timer_before_b": st10.timer_before_b, "walk_s": snappedf(st10.det_b - (float(tr10.hits[0].t) if not tr10.hits.is_empty() else 0.0), 0.001),
			"b_hits_after_detect": tb.map(func(t): return snappedf(t - st10.det_b, 0.0001))}
	_check("阻路-10 實際引擎空檔不囤積：阻擋的武將死亡後走了 3 秒多才被下一位擋住，走路期間冷卻停在 0；被擋住後下一步只打一擊，1 秒後才打第二擊（1.5 秒內共 2 擊）", ok10, d10)

	# 阻路-11：新的一場乾淨：上一場的敵人冷卻途中切換關卡，新的一場的敵人第一次接觸照樣在偵測後的下一步打
	var e11: Node = await _blk_start(rec, "blk-11", [_grp("gnd_run", 1, 0.02)], {"blk_a": Vector2i(4, 5)})
	var a11: Node = _fly_hero("blk_a")
	var d11: Dictionary = {}
	var ok11: bool = false
	if e11 != null and a11 != null:
		var det11: Array = [-1.0]
		var tr11_each := func(_tr) -> void:
			if det11[0] < 0.0 and is_instance_valid(e11) and e11._blocker != null:
				det11[0] = _pt()
		var tr11: Dictionary = await _blk_track([a11], 2.5, -1, tr11_each)
		var t11: Array = _blk_times(tr11)
		ok11 = det11[0] > 0.0 and t11.size() >= 1 and absf(t11[0] - det11[0] - step) < 1e-6
		d11 = {"prev_battle": "blk-10 的敵人冷卻途中", "first_after_detect": snappedf(t11[0] - det11[0], 0.000001) if not t11.is_empty() else -1.0}
	_check("阻路-11 新的一場：上一場冷卻途中切換關卡，新的一場的敵人第一次接觸照樣在偵測後的下一步打", ok11, d11)

	# 阻路-12：飛行敵人不阻路、不打地面武將：飛行敵人飛過武將的格子，3 秒內武將血量不變、敵人一直沒有阻擋對象
	var e12: Node = await _blk_start(rec, "blk-12", [_grp("fly_walk", 1, 0.02)], {"blk_a": Vector2i(1, 5)})
	var a12: Node = _fly_hero("blk_a")
	var d12: Dictionary = {}
	var ok12: bool = false
	if e12 != null and a12 != null:
		var ever: Array = [false]
		var tr12_each := func(_tr) -> void:
			if is_instance_valid(e12) and e12._blocker != null:
				ever[0] = true
		var tr12: Dictionary = await _blk_track([a12], 3.0, -1, tr12_each)
		var passed: float = (e12.position.x - a12.position.x) / float(a12.tile_size) if is_instance_valid(e12) else -99.0
		ok12 = tr12.hits.is_empty() and not ever[0] and a12.current_hp == a12.max_hp and passed > 0.5
		d12 = {"hits": tr12.hits.size(), "blocked": ever[0], "passed_tiles": snappedf(passed, 0.01)}
	_check("阻路-12 飛行敵人不阻路、不打地面武將：飛過武將的格子，3 秒內武將血量不變、一直沒有阻擋對象", ok12, d12)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())


# ── 趙雲「閃避」（每次受到敵人的直接攻擊各自判定：抽樣值 u < 0.15 就閃避，這一擊不扣血）──────
## 趙雲的技能參數（和 heroSkills 的 zhao_yun 相同）
func _dodge_skill(chance: Variant = 0.15) -> Dictionary:
	return {"id": "dodge", "dodge_chance": chance}

## 放單獨武將的節點（不顯示）：浮動文字也加在這裡
func _dodge_holder() -> Node:
	var holder := Node2D.new()
	holder.visible = false
	root.add_child(holder)
	return holder

## 單獨的趙雲（真正的 Hero 腳本，不經過 Main、不攻擊）：防禦 50、血量 1000；skill 是 null 時帶 heroSkills 的閃避參數
func _dodge_hero(holder: Node, skill: Variant = null) -> Node:
	var h: Node = load("res://entities/hero/Hero.gd").new()
	holder.add_child(h)
	h.set_process(false)
	h.hero_id = "zhao_yun"
	h.max_hp = 1000.0
	h.current_hp = 1000.0
	h.def_stat = 50.0
	h._read_skill({"skill": _dodge_skill() if skill == null else skill})
	return h

## parent 底下還在顯示的浮動文字（先等一幀：文字是延遲設定的）
func _dodge_texts(parent: Node) -> Array:
	await process_frame
	var out: Array = []
	for c in parent.get_children():
		if c is FloatingText and not c.is_queued_for_deletion() and c._label != null:
			out.append(c._label.text)
	return out

## 實際引擎：逐個物理步進記錄敵人 e 的每一次攻擊（敵人的攻擊次數增加的地方，不看血量）：時間（物理時鐘）、
## 這一擊讓阻路的武將 h 扣了多少血、這一步的判定次數與 Godot 判定的抽樣值、是否閃避。記錄到物理時鐘前進 sec 秒為止；
## wall_ms ≥ 0 時改成等牆鐘 wall_ms 毫秒（暫停中物理時鐘不前進）；stop_n ≥ 0 時記到第 stop_n 次攻擊就結束
func _dodge_track(e: Node, h: Node, sec: float, wall_ms: int = -1, stop_n: int = -1) -> Dictionary:
	var tr: Dictionary = {"ev": [], "multi": false, "smax": 0.0}
	var n0: int = e.blocker_attacks
	var hp0: float = h.current_hp
	var rolls0: int = h.dodge_rolls
	var p_end: float = _pt() + sec
	var w_end: int = Time.get_ticks_msec() + (wall_ms if wall_ms >= 0 else int(sec * 4000.0) + 15000)
	var prev: float = _pt()
	while (wall_ms >= 0 or _pt() < p_end) and Time.get_ticks_msec() < w_end:
		await physics_frame
		tr.smax = maxf(float(tr.smax), _pt() - prev)
		prev = _pt()
		if not is_instance_valid(e) or not is_instance_valid(h):
			break
		var n: int = e.blocker_attacks
		if n > n0:
			if n > n0 + 1:
				tr.multi = true
			var last: Dictionary = h.dodge_log.back() if h.dodge_rolls > rolls0 else {}
			tr.ev.append({"t": _pt(), "lost": snappedf(hp0 - h.current_hp, 0.0001), "rolled": h.dodge_rolls - rolls0,
				"u": last.get("u", -1.0), "dodged": last.get("dodged", null)})
			n0 = n
		hp0 = h.current_hp
		rolls0 = h.dodge_rolls
		if stop_n >= 0 and tr.ev.size() >= stop_n:
			break
	return tr

## 場上（UnitsLayer）還在顯示的「MISS」
func _dodge_miss_nodes() -> Array:
	return main.units_layer.get_children().filter(func(c): return c is FloatingText and not c.is_queued_for_deletion() and c._label != null and c._label.text == "MISS")

func _dodge_cases() -> void:
	# 閃避-0：Godot 讀到的機率。0～1 的有限數字才啟用（1 也算）；其他值與不認得的技能 id 都不啟用。換技能時舊的參數清掉
	var h0: Node = load("res://entities/hero/Hero.gd").new()
	var vals: Dictionary = {"0.15": 0.15, "int_1": 1, "one": 1.0, "tiny": 0.000001, "zero": 0.0, "neg": -0.1, "over": 1.5, "over_int": 2,
		"nan": NAN, "inf": INF, "ninf": -INF, "str": "0.15", "bool": true, "null": null}
	var got0: Dictionary = {}
	for k in vals:
		h0._read_skill({"skill": _dodge_skill(vals[k])})
		got0[k] = h0.dodge_chance
	h0._read_skill({"skill": {"id": "dodge"}})
	got0["missing"] = h0.dodge_chance
	h0._read_skill({"skill": {"id": "evade", "dodge_chance": 0.15}})
	got0["unknown_id"] = h0.dodge_chance
	h0._read_skill({"skill": _dodge_skill()})
	h0._read_skill({"skill": {"id": "first_strike", "first_attack_multiplier": 2}})
	var to_fs: Array = [h0.dodge_chance, h0.first_strike_multiplier]
	h0._read_skill({"skill": _dodge_skill()})
	var to_dodge: Array = [h0.dodge_chance, h0.first_strike_multiplier]
	h0.free()
	var want0: Dictionary = {"0.15": 0.15, "int_1": 1.0, "one": 1.0, "tiny": 0.000001}
	var ok0: bool = got0.size() == 16 and to_fs == [0.0, 2.0] and to_dodge == [0.15, 1.0]
	for k in got0:
		ok0 = ok0 and got0[k] == float(want0.get(k, 0.0))
	_check("閃避-0 Godot 讀到的閃避機率：0.15、1、0.000001 照用；0、負數、超過 1、NaN、無限大、字串、布林、null、缺欄位、不認得的技能 id 都不啟用（0）；首擊加倍與閃避互換時舊的參數清掉",
		ok0, {"got": got0, "to_first_strike": to_fs, "to_dodge": to_dodge})

	# 閃避-1：機率邊界。測試替身依序給抽樣值 0、0.149999、0.15、0.999999、0.5、0.1499999999：
	# 小於 0.15 閃避（血量不變、出現「MISS」），0.15 以上照原本的防禦公式扣 20 × (1 − 50 ÷ 150) = 13.333（出現紅色的「13」）
	var hd1: Node = _dodge_holder()
	var h1: Node = _dodge_hero(hd1)
	var st1: Dictionary = {"i": 0, "us": [0.0, 0.149999, 0.15, 0.999999, 0.5, 0.1499999999]}
	h1.dodge_roll_override = _dodge_seq(st1)
	var rows1: Array = []
	for k in range(st1.us.size()):
		var before: float = h1.current_hp
		h1.take_damage(20.0)
		rows1.append({"u": st1.us[k], "lost": snappedf(before - h1.current_hp, 0.0001), "dodged": h1.dodge_log.back().get("dodged"), "logged_u": h1.dodge_log.back().get("u")})
	var texts1: Array = await _dodge_texts(hd1)
	var want1: Array = [true, true, false, false, false, true]
	var ok1: bool = h1.dodge_rolls == 6 and h1.dodge_count == 3 and st1.i == 6 and is_equal_approx(h1.current_hp, 1000.0 - 3.0 * BLK_DMG) \
		and texts1.count("MISS") == 3 and texts1.count("13") == 3 and texts1.size() == 6
	for k in range(rows1.size()):
		var lost_ok: bool = (rows1[k].lost == 0.0) if want1[k] else (absf(rows1[k].lost - BLK_DMG) < 0.001)
		ok1 = ok1 and rows1[k].dodged == want1[k] and rows1[k].logged_u == st1.us[k] and lost_ok
	_check("閃避-1 機率邊界（抽樣值 0、0.149999、0.15、0.999999、0.5、0.1499999999）：小於 0.15 的閃避（血量不變、出現「MISS」），0.15 以上照原本的防禦公式扣 13.333（出現「13」）；判定 6 次、閃避 3 次",
		ok1, {"rows": rows1, "texts": texts1, "hp": h1.current_hp})
	hd1.queue_free()

	# 閃避-2：無效的傷害不判定、不扣血（沒有閃避技能的武將也一樣）：不抽亂數、血量維持 1000（不會變成 NaN）；之後有效的一擊照常判定
	var hd2: Node = _dodge_holder()
	var h2: Node = _dodge_hero(hd2)
	var p2: Node = _dodge_hero(hd2, {})
	var st2: Dictionary = {"i": 0, "us": [0.0]}
	h2.dodge_roll_override = _dodge_seq(st2)
	for amt in [0.0, -5.0, NAN, INF, -INF]:
		h2.take_damage(amt)
		p2.take_damage(amt)
	var mid2: Array = [st2.i, h2.dodge_rolls, h2.current_hp, p2.current_hp]
	h2.take_damage(20.0)
	var texts2: Array = await _dodge_texts(hd2)
	var ok2: bool = mid2 == [0, 0, 1000.0, 1000.0] and st2.i == 1 and h2.dodge_rolls == 1 and h2.dodge_count == 1 and h2.current_hp == 1000.0 and texts2 == ["MISS"]
	_check("閃避-2 無效的傷害（0、負數、NaN、無限大、負無限大）：不判定（不抽亂數）、不扣血，血量維持 1000、不是 NaN（沒有閃避技能的武將也一樣）；之後有效的一擊照常判定",
		ok2, {"before_valid": mid2, "calls": st2.i, "hp": h2.current_hp, "texts": texts2})
	hd2.queue_free()

	# 閃避-3：已死亡、已被移除（排入刪除）的武將不判定：被打倒之後再受到攻擊不抽亂數、血量維持 0（不復活）；被移除的武將在同一幀之內受到攻擊也不抽亂數
	var hd3: Node = _dodge_holder()
	var h3: Node = _dodge_hero(hd3)
	var st3: Dictionary = {"i": 0, "us": [0.9]}
	h3.dodge_roll_override = _dodge_seq(st3)
	h3.take_damage(1e12)
	var dead3: Array = [st3.i, h3.current_hp, h3.is_queued_for_deletion()]
	h3.take_damage(20.0)
	var after3: Array = [st3.i, h3.current_hp, h3.dodge_rolls]
	var h3b: Node = _dodge_hero(hd3)
	var st3b: Dictionary = {"i": 0, "us": [0.0]}
	h3b.dodge_roll_override = _dodge_seq(st3b)
	h3b.queue_free()
	h3b.take_damage(20.0)
	var removed3: Array = [st3b.i, h3b.dodge_rolls, h3b.dodge_count]
	var ok3: bool = dead3 == [1, 0.0, true] and after3 == [1, 0.0, 1] and removed3 == [0, 0, 0]
	_check("閃避-3 已死亡、已被移除的武將不判定：被打倒（判定 1 次、沒閃避）之後再受到攻擊不抽亂數、血量維持 0（不復活）；被移除（排入刪除）的武將同一幀之內受到攻擊也不抽亂數",
		ok3, {"dead": dead3, "after": after3, "removed": removed3})
	hd3.queue_free()

	# 閃避-4：不合理的機率不會讓武將無敵：機率是 0、負數、超過 1、NaN、無限大、字串、布林、null 時，
	# 測試替身一律給 0（啟用時必定閃避），兩擊仍各扣 13.333、不抽亂數
	var hd4: Node = _dodge_holder()
	var got4: Dictionary = {}
	for v in [0.0, -0.1, 1.5, 2, NAN, INF, "0.15", true, null]:
		var h4: Node = _dodge_hero(hd4, _dodge_skill(v))
		var st4: Dictionary = {"i": 0, "us": [0.0]}
		h4.dodge_roll_override = _dodge_seq(st4)
		h4.take_damage(20.0)
		h4.take_damage(20.0)
		got4[type_string(typeof(v)) + ":" + str(v)] = {"lost": snappedf(1000.0 - h4.current_hp, 0.0001), "calls": st4.i, "chance": h4.dodge_chance}
	var ok4: bool = got4.size() == 9
	for k in got4:
		ok4 = ok4 and absf(float(got4[k].lost) - 2.0 * BLK_DMG) < 0.001 and got4[k].calls == 0 and got4[k].chance == 0.0
	_check("閃避-4 不合理的機率不會讓武將無敵：0、負數、超過 1、NaN、無限大、字串、布林、null 時，測試替身給 0 也不閃避，兩擊各扣 13.333、不抽亂數", ok4, got4)
	hd4.queue_free()

	# 閃避-5：正式的亂數：每位武將建立時各自隨機取種子（種子不同），沒有測試替身時抽樣值都在 [0, 1)、2000 次幾乎沒有重複；
	# 測試替身只有 Godot 測試直接設定：遊戲程式（Main、WebBridge、BattleManager、WaveManager、Enemy）沒有任何地方寫到它
	var ra: Node = load("res://entities/hero/Hero.gd").new()
	var rb: Node = load("res://entities/hero/Hero.gd").new()
	var us5: Array = []
	for k in range(2000):
		us5.append(ra._dodge_roll())
	var uniq5: Dictionary = {}
	for u in us5:
		uniq5[u] = true
	var seeds5: Array = [ra._dodge_rng.seed, rb._dodge_rng.seed]
	ra.free()
	rb.free()
	var refs5: Dictionary = {}
	for path in ["res://main/Main.gd", "res://bridge/WebBridge.gd", "res://systems/BattleManager.gd", "res://systems/WaveManager.gd", "res://entities/enemy/Enemy.gd"]:
		refs5[path] = FileAccess.get_file_as_string(path).contains("dodge_roll_override")
	var ok5: bool = seeds5[0] != seeds5[1] and float(us5.min()) >= 0.0 and float(us5.max()) < 1.0 and uniq5.size() >= 1990 and not refs5.values().has(true)
	_check("閃避-5 正式的亂數：兩位武將的種子不同（不固定種子），抽樣值都在 [0, 1)、2000 次幾乎不重複；遊戲程式沒有任何地方設定測試替身（沒有訊息能控制必定閃避）",
		ok5, {"seeds_differ": seeds5[0] != seeds5[1], "min": us5.min(), "max": us5.max(), "unique": uniq5.size(), "refs": refs5})

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)

	# 閃避-6：實際引擎 1× 與 2×：阻路的趙雲（閃避 0.15，測試替身依序給 0、0.9：第 1、3、5… 擊閃避）被地面敵人攻擊。
	# 用敵人的攻擊次數計數：從第一擊起 10.5 秒遊戲時間內都是 11 次攻擊、相鄰兩次隔 1 秒（一步之內），閃避不會讓敵人提早再打；
	# 每次攻擊判定一次，閃避的不扣血、其餘扣 13.333；沒有擊殺、戰鬥金幣不變。快照的 hero_dodge、enemy_blocker_attacks 和 Godot 相同
	var d6: Dictionary = {}
	for sp in [1, 2]:
		var st6: Dictionary = {"i": 0, "us": [0.0, 0.9]}
		var set6 := func() -> void:
			var z: Node = _fly_hero("blk_a")
			if z != null:
				z.dodge_roll_override = _dodge_seq(st6)
		var e6: Node = await _blk_start(rec, "dodge-6x%d" % sp, [_grp("gnd_run", 1, 0.02)], {"blk_a": Vector2i(4, 5)}, sp, 1000000.0, _dodge_skill(), set6)
		var z6: Node = _fly_hero("blk_a")
		if e6 == null or z6 == null:
			d6[sp] = {"setup": false}
			continue
		var gold0: int = _bm().battle_gold
		var tr6: Dictionary = await _dodge_track(e6, z6, 12.0)
		var ts: Array = tr6.ev.map(func(x): return float(x.t))
		var win: Array = ts.filter(func(t): return t - ts[0] < 10.5) if not ts.is_empty() else []
		var gaps: Array = []
		for k in range(1, ts.size()):
			gaps.append(ts[k] - ts[k - 1])
		var ev_ok: bool = not tr6.ev.is_empty()
		for k in range(tr6.ev.size()):
			var x: Dictionary = tr6.ev[k]
			var want_dodge: bool = k % 2 == 0
			var lost_ok: bool = (x.lost == 0.0) if want_dodge else (absf(float(x.lost) - BLK_DMG) < 0.001)
			ev_ok = ev_ok and x.rolled == 1 and x.dodged == want_dodge and lost_ok
		var snap: Dictionary = _fly_snapshot(rec)
		var sd: Dictionary = snap.get("hero_dodge", {}).get("blk_a", {})
		var sa: Dictionary = snap.get("enemy_blocker_attacks", {})
		d6[sp] = {"in_window": win.size(), "attacks": ts.size(), "enemy_attacks": e6.blocker_attacks,
			"gap_min": snappedf(float(gaps.min()) if not gaps.is_empty() else -1.0, 0.0001), "gap_max": snappedf(float(gaps.max()) if not gaps.is_empty() else -1.0, 0.0001),
			"smax": snappedf(float(tr6.smax), 0.0001), "ev_ok": ev_ok, "multi": tr6.multi, "rolls": z6.dodge_rolls, "dodges": z6.dodge_count,
			"kills": _bm().kills, "gold_same": _bm().battle_gold == gold0,
			"snap": {"chance": sd.get("chance"), "rolls": sd.get("rolls"), "dodges": sd.get("dodges"), "hp": sd.get("hp"), "log_n": sd.get("log", []).size(),
				"enemy_attacks": sa.get(str(e6.get_instance_id()))},
			"hp_same": sd.get("hp") == z6.current_hp}
	var ok6: bool = true
	for sp in [1, 2]:
		var r: Dictionary = d6.get(sp, {})
		var n6: int = int(r.get("attacks", -1))
		ok6 = ok6 and r.get("in_window") == 11 and r.get("ev_ok") == true and r.get("multi") == false and r.get("enemy_attacks") == n6 \
			and float(r.get("gap_min", -1.0)) >= 1.0 - 0.0005 and float(r.get("gap_max", 99.0)) <= 1.0 + float(r.get("smax", 0.0)) + 0.0005 \
			and r.get("rolls") == n6 and r.get("dodges") == int(ceil(float(n6) / 2.0)) and r.get("kills") == 0 and r.get("gold_same") == true \
			and r.get("snap", {}).get("chance") == 0.15 and r.get("snap", {}).get("rolls") == n6 and r.get("snap", {}).get("dodges") == r.get("dodges") \
			and r.get("snap", {}).get("enemy_attacks") == n6 and r.get("hp_same") == true
	_check("閃避-6 實際引擎 1× 與 2×（用敵人的攻擊次數計數）：從第一擊起 10.5 秒遊戲時間內都是 11 次攻擊、相鄰兩次隔 1 秒（一步之內），被閃避的攻擊照樣用掉冷卻；每次攻擊判定一次，閃避的不扣血、其餘扣 13.333；沒有擊殺、戰鬥金幣不變；快照的閃避與攻擊次數和 Godot 相同",
		ok6, d6)
	_r19_speed(rec, 1.0)

	# 閃避-7：暫停與閃避提示：第一擊被閃避、出現「MISS」後立刻手動暫停 1.2 秒（牆鐘）：暫停中沒有攻擊、沒有判定，提示停在原處沒有淡出；
	# 繼續後下一次攻擊在上一次的 1 秒後（一步之內），提示照遊戲時間在 0.8 秒後消失
	var st7: Dictionary = {"i": 0, "us": [0.0]}
	var set7 := func() -> void:
		var z: Node = _fly_hero("blk_a")
		if z != null:
			z.dodge_roll_override = _dodge_seq(st7)
	var e7: Node = await _blk_start(rec, "dodge-7", [_grp("gnd_run", 1, 0.02)], {"blk_a": Vector2i(4, 5)}, 1, 1000000.0, _dodge_skill(), set7)
	var z7: Node = _fly_hero("blk_a")
	var d7: Dictionary = {}
	var ok7: bool = false
	if e7 != null and z7 != null:
		var tr7a: Dictionary = await _dodge_track(e7, z7, 4.0, -1, 1)
		_r20_pause(rec, true)
		await process_frame
		var miss7: Array = _dodge_miss_nodes()
		var timers7: Array = miss7.map(func(n): return n._timer)
		var tr7p: Dictionary = await _dodge_track(e7, z7, 0.0, 1200)
		var still7: Array = miss7.filter(func(n): return is_instance_valid(n) and not n.is_queued_for_deletion())
		var timers7b: Array = still7.map(func(n): return n._timer)
		var rolls_paused: int = z7.dodge_rolls
		_r20_pause(rec, false)
		var tr7b: Dictionary = await _dodge_track(e7, z7, 1.5, -1, 1)
		var gap7: float = float(tr7b.ev[0].t) - float(tr7a.ev[0].t) if not tr7a.ev.is_empty() and not tr7b.ev.is_empty() else -1.0
		var gone7: bool = miss7.all(func(n): return not is_instance_valid(n) or n.is_queued_for_deletion())
		var smax7: float = maxf(float(tr7a.smax), float(tr7b.smax))
		ok7 = tr7a.ev.size() == 1 and tr7a.ev[0].dodged == true and miss7.size() == 1 and tr7p.ev.is_empty() and rolls_paused == 1 \
			and still7.size() == 1 and timers7b == timers7 and gap7 >= 1.0 - 0.0005 and gap7 <= 1.0 + smax7 + 0.0005 and gone7
		d7 = {"first": tr7a.ev, "miss_at_pause": miss7.size(), "timer_at_pause": timers7, "timer_after_pause": timers7b, "attacks_paused": tr7p.ev.size(),
			"rolls_paused": rolls_paused, "next_gap": snappedf(gap7, 0.0001), "miss_gone": gone7}
	_check("閃避-7 暫停與閃避提示：第一擊被閃避出現「MISS」後手動暫停 1.2 秒，暫停中沒有攻擊與判定、提示停住沒有淡出；繼續後下一次攻擊在上一次的 1 秒後（一步之內），提示照遊戲時間消失",
		ok7, d7)

	# 閃避-8：升級、移位、跨波次不改變機率、不重設判定紀錄；新的一場是新的武將：判定紀錄從 0 開始、上一場的「MISS」不殘留、沒有測試替身
	# 趙雲（射程 3）在建築位打血量 300 的敵人（三擊打倒、清波）；建築位的武將不會被敵人攻擊，這裡直接呼叫受傷留下判定紀錄與提示
	var zs: Dictionary = _r12_hero("zhao_yun", _dodge_skill())
	_load(_r12_payload("dodge_8", [[_grp("soft", 1, 1.0)], [_grp("soft", 1, 1.0)]], "dodge-8a", [zs]))
	_r12_place("zhao_yun")
	var z8: Node = _fly_hero("zhao_yun")
	var d8: Dictionary = {}
	var ok8: bool = false
	if z8 != null:
		var z8_id: int = z8.get_instance_id()
		z8.dodge_roll_override = _dodge_seq({"i": 0, "us": [0.0]})
		z8.take_damage(20.0)
		z8.take_damage(20.0)
		var b8: Array = [z8.dodge_chance, z8.dodge_rolls, z8.dodge_count]
		_bm().player_start_battle()
		await _wait_until(func(): return _bm().game_state == 1 and _bm().kills == 1, 8.0)
		var wave1: Array = [_bm().current_wave, _bm().kills, _bm().game_state]
		var up: Dictionary = zs.duplicate(true)
		up["level"] = 2
		up["atk"] = 120.0
		main._on_payload_received({"type": "update_team", "team_list": [up]})
		_blk_move(z8, Vector2i(2, 4))
		var after_up: Array = [z8.dodge_chance, z8.dodge_rolls, z8.dodge_count, z8.hero_level, z8.get_cell()]
		_bm().player_start_battle()
		await _wait_until(func(): return _bm().current_wave == 2 and _bm().game_state == 2, 3.0)
		z8.take_damage(20.0)
		var wave2: Array = [_bm().current_wave, z8.dodge_chance, z8.dodge_rolls, z8.dodge_count]
		await process_frame
		var miss_before: int = _dodge_miss_nodes().size()
		_load(_r12_payload("dodge_8", [[_grp("soft", 1, 1.0)]], "dodge-8b", [zs]))
		_r12_place("zhao_yun")
		await process_frame
		var z8b: Node = _fly_hero("zhao_yun")
		var fresh: Array = [z8b != null and z8b.get_instance_id() != z8_id, z8b.dodge_chance if z8b else null, z8b.dodge_rolls if z8b else null,
			z8b.dodge_count if z8b else null, z8b.dodge_log.size() if z8b else null, _dodge_miss_nodes().size(), z8b.dodge_roll_override.is_valid() if z8b else null]
		ok8 = b8 == [0.15, 2, 2] and wave1 == [1, 1, 1] and after_up == [0.15, 2, 2, 2, Vector2i(2, 4)] and wave2 == [2, 0.15, 3, 3] and miss_before >= 1 \
			and fresh == [true, 0.15, 0, 0, 0, 0, false]
		d8 = {"before": b8, "wave1": wave1, "after_upgrade_move": after_up, "wave2": wave2, "miss_before_new": miss_before, "new_battle": fresh}
	_check("閃避-8 升級（等級 2）、移位、跨到第 2 波：機率維持 0.15、判定紀錄接續（不重設）；新的一場是新的武將：判定與閃避次數從 0 開始、上一場的「MISS」不殘留、沒有測試替身",
		ok8, d8)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())


# ── 關卡資料未完成：沒有波次、波次或路線的格式不對 ───────────────────────
# 遊戲收到沒有波次的關卡資料時，不改用內建的測試波次、不自動勝利、也不會按了迎戰沒有反應：開戰（迎戰或開啟自動）時拒絕第 1 波，
# 送出可辨識的 wave_rejected（missing），留在備戰、城池不扣血、沒有結算；切到有效關卡照常。
# 路線空白、無法解析或格式不對時，每一組都因為路線沒有路點被略過（沿用既有的拒絕）。開發用的內建關卡只在非 Web 平台明確送出

## 關卡資料：路線與波次可以是任何值（照原樣放進 map），extra_enemies 加在敵人設定後面
func _sd_payload(battle_id: String, path_json: Variant, waves: Variant, extra_enemies: Array = []) -> Dictionary:
	var p: Dictionary = _with_id(_payload("sd_" + battle_id, []), battle_id)
	p["map"]["path_json"] = path_json
	p["map"]["waves"] = waves
	for e in extra_enemies:
		p["enemies_config"].append(e)
	return p

## 經過真實的 JSON 路徑（數字都是 float）載入一場，再開戰 presses 次（auto 時改成開啟自動），
## 回傳 Godot 讀到的總波數與波次資料數、之後的狀態、拒絕信號、wave_rejected、結算與場上的敵人
func _sd_run(rec: Node, payload: Dictionary, presses: int = 1, auto: bool = false) -> Dictionary:
	var n_msg: int = rec.sent_wave_rejects.size()
	var n_res: int = rec.sent_results.size()
	var ended0: int = battle_ended_count
	_r19_js(rec, payload.duplicate(true))
	var loaded: Dictionary = {"bid": _bm().battle_id, "total": _bm().total_waves, "waves": _wm()._waves_data.size(), "state": _bm().game_state}
	var sig: Array = []
	var on_reject := func(n: int, _r: String): sig.append(n)
	_bm().wave_start_rejected.connect(on_reject)
	for i in range(presses):
		if auto:
			_bm().toggle_auto_mode()
		else:
			_bm().player_start_battle()
		await _wait(0.3)
	await _wait(0.5)
	_bm().wave_start_rejected.disconnect(on_reject)
	return {"loaded": loaded, "state": _state(), "sig": sig, "msgs": rec.sent_wave_rejects.slice(n_msg),
		"results": rec.sent_results.size() - n_res, "ended": battle_ended_count - ended0, "nodes": _sw_enemies().size()}

## 拒絕了第 1 波 n 次：備戰、波次 0、城池 20、沒有自動、場上沒有敵人、沒有結算；每次的拒絕信號與 wave_rejected 都是這一場的第 1 波，
## missing 與逐組的原因代碼符合
func _sd_rejected(r: Dictionary, bid: String, n: int, missing: bool, reasons: Array = []) -> bool:
	var s: Dictionary = r.state
	if not (s.state == 1 and s.wave == 0 and s.hp == MAX_HP and not s.auto and s.active == 0 and r.nodes == 0 and r.results == 0 and r.ended == 0):
		return false
	if r.sig.size() != n or r.msgs.size() != n:
		return false
	for k in range(n):
		var m: Dictionary = r.msgs[k]
		if r.sig[k] != 1 or m.get("battle_id") != bid or int(m.get("wave", -1)) != 1 or m.get("missing") != missing:
			return false
		if _route_reasons(m).map(func(x): return x[3]) != reasons:
			return false
	return true

func _stage_data_cases() -> void:
	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)
	var good_wave: Array = [{"wave": 1, "enemies": [_grp("c_fast", 1, 0.1)]}]
	# 內建測試波次用過的敵人（soldier、cavalry、general）：如果遊戲偷偷改用內建的波次，有了這些設定就會真的開戰
	var builtin: Array = [{"enemy_id": "soldier", "name": "兵", "hp": 100.0, "speed": 60.0}, {"enemy_id": "cavalry", "name": "騎", "hp": 100.0, "speed": 60.0},
		{"enemy_id": "general", "name": "將", "hp": 100.0, "speed": 60.0}]

	# 資料-9：開發用的內建關卡保留明確的入口（非 Web 平台的測試 payload，自己帶 3 波），不是替補。
	# 放在最前面：它沒有音效設定，會開始播背景音樂，之後的關卡資料（音效關閉）會停掉，不留到測試結束
	await main._inject_test_payload()
	var d9: Dictionary = {"stage": _bm().stage_id, "total": _bm().total_waves, "waves": _wm()._waves_data.size()}
	_check("資料-9 開發用的內建關卡保留明確的入口（非 Web 平台的測試 payload，自己帶 3 波）：載入後關卡 chapter1_1、總波數 3", d9.stage == "chapter1_1" and d9.total == 3 and d9.waves == 3, d9)

	# 資料-1：沒有波次（空陣列）、路線有效：總波數 0、波次資料 0 筆（沒有補上內建的測試波次）；按迎戰拒絕第 1 波（missing）
	var r1: Dictionary = await _sd_run(rec, _sd_payload("sd-1", _path_json(), []))
	_check("資料-1 沒有波次的關卡：Godot 的總波數 0、沒有補上內建的測試波次；按迎戰拒絕第 1 波（wave_rejected 帶這一場的 battle_id、第 1 波、missing、沒有逐組原因），備戰、城池 20、沒有敵人、沒有結算",
		r1.loaded.bid == "sd-1" and r1.loaded.total == 0 and r1.loaded.waves == 0 and r1.loaded.state == 1 and _sd_rejected(r1, "sd-1", 1, true), r1)

	# 資料-2：同上，但敵人設定裡有內建測試波次用的敵人：照樣拒絕、不出兵（改用內建的波次時這一關會真的開戰）
	var r2: Dictionary = await _sd_run(rec, _sd_payload("sd-2", _path_json(), [], builtin))
	_check("資料-2 沒有波次、敵人設定裡有內建測試波次的敵人（soldier、cavalry、general）：照樣拒絕第 1 波、不出兵、沒有結算（不偷偷用內建的波次開戰）",
		r2.loaded.total == 0 and _sd_rejected(r2, "sd-2", 1, true), r2)

	# 資料-3：開啟自動：拒絕第 1 波並關閉自動，不自動勝利
	var r3: Dictionary = await _sd_run(rec, _sd_payload("sd-3", _path_json(), [], builtin), 1, true)
	_check("資料-3 沒有波次、開啟自動：拒絕第 1 波並關閉自動、備戰、沒有結算（不自動勝利）", _sd_rejected(r3, "sd-3", 1, true), r3)

	# 資料-4：不會一直無聲備戰：連按三次迎戰，每次都拒絕並送出原因
	var r4: Dictionary = await _sd_run(rec, _sd_payload("sd-4", _path_json(), []), 3)
	_check("資料-4 沒有波次、連按三次迎戰：每次都拒絕並送出 wave_rejected（3 則，都是第 1 波、missing），不會按了沒有反應；仍在備戰、沒有結算", _sd_rejected(r4, "sd-4", 3, true), r4)

	# 資料-5：波次的格式不對：載入不出錯、總波數 0，按迎戰拒絕第 1 波
	var bad_waves: Array = [null, "wave1", 123, [1, "x", null], [{"wave": null, "enemies": [_grp("c_fast", 1, 0.1)]}], [{"wave": 0, "enemies": [_grp("c_fast", 1, 0.1)]}]]
	var d5: Array = []
	var ok5: bool = true
	for k in range(bad_waves.size()):
		var bid5: String = "sd-5-%d" % k
		var r5: Dictionary = await _sd_run(rec, _sd_payload(bid5, _path_json(), bad_waves[k]))
		var ok: bool = r5.loaded.bid == bid5 and r5.loaded.total == 0 and _sd_rejected(r5, bid5, 1, true)
		ok5 = ok5 and ok
		d5.append({"waves": str(bad_waves[k]), "ok": ok, "total": r5.loaded.total, "sig": r5.sig, "state": r5.state.state, "msgs": r5.msgs})
	_check("資料-5 波次的格式不對（null、字串、數字、只有不是物件的項目、編號 null、編號 0）：載入不出錯、總波數 0；按迎戰拒絕第 1 波（missing）、沒有結算", ok5, d5)

	# 資料-6：第 1 波的敵人組格式不對：當作沒有組 → 拒絕第 1 波（有這一波，不是 missing）
	var r6a: Dictionary = await _sd_run(rec, _sd_payload("sd-6a", _path_json(), [{"wave": 1, "enemies": "c_fast"}]))
	var r6b: Dictionary = await _sd_run(rec, _sd_payload("sd-6b", _path_json(), [{"wave": 1, "enemies": [1, "c_fast", null, []]}]))
	_check("資料-6 第 1 波的敵人組格式不對（enemies 是字串；組是數字、字串、null、陣列）：載入與開戰都不出錯，總波數 1、拒絕第 1 波（不是缺波次、沒有逐組原因）、沒有結算",
		r6a.loaded.total == 1 and _sd_rejected(r6a, "sd-6a", 1, false) and r6b.loaded.total == 1 and _sd_rejected(r6b, "sd-6b", 1, false), {"a": r6a, "b": r6b})

	# 資料-7：路線空白或格式不對、波次有效：每一組都因為路線沒有路點被略過 → 拒絕第 1 波（path_empty）
	var bad_paths: Array = [{"paths": [], "spawn": [], "base": []}, {}, null, "{bad json", 123, {"paths": {"path_a": "x"}}, {"paths": {"path_a": [7, [1], ["a", null]]}}]
	var d7: Array = []
	var ok7: bool = true
	for k in range(bad_paths.size()):
		var bid7: String = "sd-7-%d" % k
		var r7: Dictionary = await _sd_run(rec, _sd_payload(bid7, bad_paths[k], good_wave))
		var ok: bool = r7.loaded.total == 1 and _sd_rejected(r7, bid7, 1, false, ["path_empty"])
		ok7 = ok7 and ok
		d7.append({"path_json": str(bad_paths[k]), "ok": ok, "sig": r7.sig, "msgs": r7.msgs, "state": r7.state})
	_check("資料-7 路線空白或格式不對（GAS 的空白形狀、空物件、null、無法解析的字串、數字、路線不是陣列、路點的格式不對），波次有效：載入不出錯；按迎戰時這一組因為路線沒有路點被略過 → 拒絕第 1 波（path_empty）、沒有結算", ok7, d7)

	# 資料-8：拒絕之後切到有效關卡照常開戰
	_r19_js(rec, _sd_payload("sd-8", _path_json(), good_wave))
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() >= 1 or _bm().game_state == 3, 3.0)
	var d8: Dictionary = {"bid": _bm().battle_id, "state": _bm().game_state, "wave": _bm().current_wave, "total": _bm().total_waves}
	_check("資料-8 拒絕之後切到有效關卡：新的一場照常開戰（第 1 波、總波數 1）", d8.bid == "sd-8" and d8.total == 1 and d8.wave == 1 and (d8.state == 2 or d8.state == 3), d8)
	await _wait_until(func(): return _bm().game_state == 3, 5.0)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 敵人設定的對武將攻擊力（atk）────────────────────────────────────────
# 被武將擋住的敵人每次攻擊那位武將的攻擊力：有限、不小於 0 的數字照用（包括 0），其他一律 20；傷害照武將的防禦公式、趙雲可以閃避；
# 每次攻擊照樣用掉冷卻（atk 0 也是），攻擊間隔不變；攻城、擊殺金幣、結算不受影響

## 實際引擎用的敵人設定（全部經過 JSON 路徑送進去）
const ATK_ENEMIES: Array = [
	{"enemy_id": "atk32_run", "name": "A", "hp": 99999.0, "speed": 240.0, "atk": 32},
	{"enemy_id": "atk120_run", "name": "B", "hp": 99999.0, "speed": 240.0, "atk": 120},
	{"enemy_id": "atk0_run", "name": "C", "hp": 99999.0, "speed": 240.0, "atk": 0},
	{"enemy_id": "atkstr_run", "name": "D", "hp": 99999.0, "speed": 240.0, "atk": "32"},
	{"enemy_id": "atk120_fly", "name": "E", "hp": 99999.0, "speed": 40.0, "atk": 120, "movement_type": "flying"},
	{"enemy_id": "atk120_leak", "name": "F", "hp": 99999.0, "speed": 2000.0, "atk": 120},
	{"enemy_id": "atk120_soft", "name": "G", "hp": 50.0, "speed": 240.0, "atk": 120},
]

## 兩個清單逐項近似相等
func _approx_list(a: Array, b: Array) -> bool:
	if a.size() != b.size():
		return false
	for i in range(a.size()):
		if not is_equal_approx(float(a[i]), float(b[i])):
			return false
	return true

## 固定步進用的敵人（和阻路測試相同，停在第 3 格）：cfg 另外帶 atk 等欄位
func _atk_enemy(holder: Node, map: BlkMap, extra: Dictionary) -> Node:
	var e: Node = load("res://entities/enemy/Enemy.gd").new()
	holder.add_child(e)
	e.set_physics_process(false)
	var cfg: Dictionary = {"enemy_id": "atk", "hp": 99999.0, "speed": 0.0}
	cfg.merge(extra, true)
	e.setup(cfg, [Vector2(0.5 * map.tile, 0.0), Vector2(12.5 * map.tile, 0.0)])
	e.position = Vector2(3.5 * map.tile, 0.0)
	e._game_map = map
	return e

## 固定步進 10 秒（每秒 60 步）被同一位武將（防禦 50）擋住：每一次攻擊（敵人的攻擊次數）發生的步數與這一擊扣的血；
## 沒有攻擊卻扣血時記 -1。dodge_us 不是空的時，武將會閃避（機率 0.15，抽樣值依序循環）
func _atk_steps(holder: Node, extra: Dictionary, dodge_us: Array = []) -> Dictionary:
	var map := BlkMap.new()
	holder.add_child(map)
	var e: Node = _atk_enemy(holder, map, extra)
	var h: Node = _blk_hero(holder, map, 3)
	var st: Dictionary = {"i": 0, "us": dodge_us}
	if not dodge_us.is_empty():
		h.dodge_chance = 0.15
		h.dodge_roll_override = _dodge_seq(st)
	var ev: Array = []
	var drops: Array = []
	for i in range(1, 601):
		var hp0: float = h.current_hp
		var n0: int = e.blocker_attacks
		e._physics_process(1.0 / 60.0)
		if e.blocker_attacks > n0:
			ev.append(i)
			drops.append(snappedf(hp0 - h.current_hp, 0.0001))
		elif h.current_hp != hp0:
			drops.append(-1.0)
	return {"atk": e.blocker_atk, "ev": ev, "drops": drops, "rolls": h.dodge_rolls, "hp": h.current_hp}

## 實際引擎（經過真實的 JSON 路徑：數字是 float）：一波、放置阻路的武將（防禦 50、射程 0.3 格，打不到擋住的敵人）、
## speed 不是 1 時切換速度、開戰並等第一個敵人被擋住
func _atk_start(rec: Node, battle_id: String, groups: Array, cells: Dictionary, speed: int = 1, wait_block: bool = true) -> Node:
	var p: Dictionary = _blk_payload(battle_id, [groups], 1000000.0)
	for c in ATK_ENEMIES:
		p["enemies_config"].append(c.duplicate())
	_r19_js(rec, p)
	for hid in cells:
		_r12_place(hid, cells[hid])
	if speed != 1:
		_r19_speed(rec, float(speed))
	_bm().player_start_battle()
	await _wait_until(func(): return _first_enemy() != null, 5.0)
	var e: Node = _first_enemy()
	if e != null and wait_block and not cells.is_empty():
		await _wait_until(func(): return is_instance_valid(e) and e._blocker != null, 5.0)
	return e

func _enemy_atk_cases() -> void:
	var holder := Node2D.new()
	holder.visible = false
	root.add_child(holder)

	# 攻擊-0：設定值的判讀（和 Web 的 utils/enemyCombat 相同）
	var parse_cases: Array = [
		[{"atk": 20.0}, 20.0], [{"atk": 32}, 32.0], [{"atk": 120.0}, 120.0], [{"atk": 0}, 0.0], [{"atk": 0.0}, 0.0], [{"atk": 12.5}, 12.5], [{"atk": 1000000.0}, 1000000.0],
		[{}, 20.0], [{"atk": null}, 20.0], [{"atk": ""}, 20.0], [{"atk": "32"}, 20.0], [{"atk": -5.0}, 20.0], [{"atk": NAN}, 20.0], [{"atk": INF}, 20.0], [{"atk": -INF}, 20.0],
		[{"atk": true}, 20.0], [{"atk": [32]}, 20.0], [{"atk": {"v": 32}}, 20.0],
		[JSON.parse_string("{\"atk\": 32}"), 32.0], [JSON.parse_string("{\"atk\": 0}"), 0.0], [JSON.parse_string("{\"atk\": \"32\"}"), 20.0],
	]
	var bad0: Array = []
	for c in parse_cases:
		var got: float = Enemy.blocker_atk_of(c[0])
		if not (got == float(c[1])):
			bad0.append({"cfg": str(c[0]), "got": got, "want": c[1]})
	_check("攻擊-0 設定的 atk 判讀（和 Web 相同）：20、32（整數）、120、0（整數與小數）、12.5、1000000 照用、不設上限；沒有欄位、null、空白、字串 \"32\"、負數、NaN、無限大、布林、陣列、物件一律 20；經過 JSON 的數字照用",
		bad0.is_empty(), bad0)

	# 攻擊-1：固定步進 10 秒、阻路的武將防禦 50：每擊扣 atk ×（1 − 50 ÷ 150）；攻擊的步數和預設完全相同（atk 0 也照樣每 1 秒一次）
	var base: Dictionary = _atk_steps(holder, {})
	var d1: Dictionary = {"default_steps": base.ev}
	var ok1: bool = base.ev.size() >= 9 and base.ev[0] == 2 and base.atk == 20.0
	for atk in [20.0, 32.0, 120.0, 0.0]:
		var r: Dictionary = _atk_steps(holder, {"atk": atk})
		var per: float = atk * (1.0 - 50.0 / 150.0)
		var all_per: bool = r.drops.all(func(x): return is_equal_approx(float(x), snappedf(per, 0.0001)))
		var lost: float = 1000000.0 - float(r.hp)
		var ok: bool = r.atk == atk and r.ev == base.ev and all_per and is_equal_approx(lost + 1.0, float(r.ev.size()) * per + 1.0)
		ok1 = ok1 and ok
		d1[str(atk)] = {"atk": r.atk, "attacks": r.ev.size(), "same_steps": r.ev == base.ev, "per_hit": r.drops.slice(0, 3), "lost": snappedf(lost, 0.0001)}
	_check("攻擊-1 固定步進 10 秒、阻路的武將防禦 50：atk 20／32／120／0 每擊各扣 13.333／21.333／80／0（照防禦公式）；攻擊的步數和預設完全相同（第 2 步起每 1 秒一次），atk 0 也照樣用掉冷卻、不高速重試",
		ok1, d1)

	# 攻擊-2：沒有有效 atk 的設定照預設 20
	var ok2: bool = true
	var d2: Dictionary = {}
	for k in [["missing", {}], ["blank", {"atk": ""}], ["str", {"atk": "32"}], ["neg", {"atk": -5.0}], ["nan", {"atk": NAN}], ["inf", {"atk": INF}], ["null", {"atk": null}]]:
		var r: Dictionary = _atk_steps(holder, k[1])
		var ok: bool = r.atk == 20.0 and r.ev == base.ev and r.drops.all(func(x): return is_equal_approx(float(x), 13.3333))
		ok2 = ok2 and ok
		d2[k[0]] = {"atk": r.atk, "attacks": r.ev.size(), "per_hit": r.drops.slice(0, 2)}
	_check("攻擊-2 沒有有效的 atk（沒有欄位、空白、字串 \"32\"、負數、NaN、無限大、null）：照預設 20，每擊 13.333、攻擊的步數相同", ok2, d2)

	# 攻擊-3：會閃避的武將（抽樣值 0、0.9 交替）：atk 32 時閃避的那幾擊不扣血、其餘 21.333；atk 0 的攻擊不判定閃避
	var r3a: Dictionary = _atk_steps(holder, {"atk": 32.0}, [0.0, 0.9])
	var r3b: Dictionary = _atk_steps(holder, {"atk": 0.0}, [0.0, 0.9])
	var want3: Array = []
	for k in range(r3a.ev.size()):
		want3.append(0.0 if k % 2 == 0 else 21.3333)
	var ok3: bool = r3a.ev == base.ev and _approx_list(r3a.drops, want3) and r3a.rolls == r3a.ev.size() and r3b.ev == base.ev and r3b.rolls == 0 and r3b.hp == 1000000.0
	_check("攻擊-3 會閃避的武將（抽樣值 0、0.9 交替）：atk 32 時閃避的那幾擊不扣血、其餘每擊 21.333、判定次數＝攻擊次數、步數不變；atk 0 的攻擊照樣每 1 秒一次，但沒有有效傷害、不判定閃避（不抽亂數）、血量不變",
		ok3, {"a": {"attacks": r3a.ev.size(), "drops": r3a.drops.slice(0, 4), "rolls": r3a.rolls}, "b": {"attacks": r3b.ev.size(), "rolls": r3b.rolls, "hp": r3b.hp}})

	# 攻擊-4：冷卻途中阻擋的武將死亡、同一格換成另一位：下一位的第一擊在上一擊的 1 秒後，照樣扣 21.333（換目標不重設冷卻、不改攻擊力）
	var map4 := BlkMap.new()
	holder.add_child(map4)
	var e4: Node = _atk_enemy(holder, map4, {"atk": 32.0})
	var a4: Node = _blk_hero(holder, map4, 3)
	var r4a: Dictionary = _blk_steps(e4, [a4], 1.0 / 60.0, 25)
	a4.take_damage(1e12)
	var b4: Node = _blk_hero(holder, map4, 3)
	var r4b: Dictionary = _blk_steps(e4, [a4, b4], 1.0 / 60.0, 100, 26)
	var b_ev: Array = r4b.ev.filter(func(x): return int(x[1]) == 1).map(func(x): return int(x[0]))
	var ok4: bool = r4a.ev.size() == 1 and int(r4a.ev[0][0]) == 2 and b_ev.size() == 2 and b_ev[0] >= 62 and b_ev[0] <= 63 and is_equal_approx(1000000.0 - b4.current_hp, 2.0 * 32.0 * (1.0 - 50.0 / 150.0))
	_check("攻擊-4 冷卻途中阻擋的武將死亡、同一格換成另一位：下一位的第一擊在上一擊的 1 秒後（第 62～63 步），兩擊各扣 21.333（換目標不重設冷卻、不改攻擊力）",
		ok4, {"first": r4a.ev, "b_attacks": b_ev, "b_lost": snappedf(1000000.0 - b4.current_hp, 0.0001)})
	holder.queue_free()

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)

	# 攻擊-5：實際引擎（經過 JSON，atk 是 32.0）1× 與 2×：從第一擊起 10.5 秒遊戲時間內都是 11 次、每次扣 21.333；累積時程不漂移；快照的 enemy_atk 是 32
	var d5: Dictionary = {}
	var ok5: bool = true
	for sp in [1, 2]:
		var e5: Node = await _atk_start(rec, "atk-5x%d" % sp, [_grp("atk32_run", 1, 0.02)], {"blk_a": Vector2i(4, 5)}, sp)
		var a5: Node = _fly_hero("blk_a")
		if e5 == null or a5 == null:
			ok5 = false
			d5[sp] = {"setup": false}
			continue
		var snap5: Dictionary = _fly_snapshot(rec)
		var snap_atk: Variant = snap5.get("enemy_atk", {}).get(str(e5.get_instance_id()), null)
		var tr5: Dictionary = await _dodge_track(e5, a5, 11.5)
		var ts: Array = tr5.ev.map(func(x): return float(x.t))
		var win: Array = ts.filter(func(t): return t - ts[0] < 10.5) if not ts.is_empty() else []
		var per_ok: bool = not tr5.ev.is_empty() and tr5.ev.all(func(x): return is_equal_approx(float(x.lost), 21.3333))
		var spread: float = _r20_spread(ts, 1.0)
		ok5 = ok5 and win.size() == 11 and per_ok and not tr5.multi and is_instance_valid(e5) and e5.blocker_atk == 32.0 and snap_atk == 32.0 and spread >= 0.0 and spread <= float(tr5.smax) + 0.0005
		d5[sp] = {"in_window": win.size(), "per_hit": tr5.ev.slice(0, 3).map(func(x): return x.lost), "snapshot_atk": snap_atk,
			"spread": snappedf(spread, 0.0001), "smax": snappedf(float(tr5.smax), 0.0001), "multi": tr5.multi}
	_r19_speed(rec, 1.0)
	_check("攻擊-5 實際引擎（經過 JSON，atk 32）1× 與 2×：從第一擊起 10.5 秒遊戲時間內都是 11 次攻擊、每次扣 21.333（防禦 50）；累積時程（第一擊＋k × 1 秒）不漂移、一步最多一擊；快照的 enemy_atk 是 32",
		ok5, d5)

	# 攻擊-6：實際引擎 atk 0：武將的血量一直不變、沒有閃避判定；攻擊照樣每 1 秒一次（3.2 秒內 3～4 次），不會每一步都攻擊
	var e6: Node = await _atk_start(rec, "atk-6", [_grp("atk0_run", 1, 0.02)], {"blk_a": Vector2i(4, 5)})
	var a6: Node = _fly_hero("blk_a")
	var d6: Dictionary = {}
	var ok6: bool = false
	if e6 != null and a6 != null:
		var tr6: Dictionary = await _dodge_track(e6, a6, 3.2)
		ok6 = e6.blocker_atk == 0.0 and tr6.ev.size() >= 3 and tr6.ev.size() <= 4 and not tr6.multi and a6.current_hp == a6.max_hp and tr6.ev.all(func(x): return float(x.lost) == 0.0)
		d6 = {"atk": e6.blocker_atk, "attacks": tr6.ev.size(), "hp": a6.current_hp, "max_hp": a6.max_hp}
	_check("攻擊-6 實際引擎 atk 0：3.2 秒內照樣每 1 秒攻擊一次（3～4 次，不會每一步都攻擊），武將的血量不變", ok6, d6)

	# 攻擊-7：實際引擎 atk 120 跨手動暫停：每擊扣 80；暫停 1.2 秒（牆鐘）期間沒有攻擊，繼續後下一擊在上一擊的 1 秒後
	var e7: Node = await _atk_start(rec, "atk-7", [_grp("atk120_run", 1, 0.02)], {"blk_a": Vector2i(4, 5)})
	var a7: Node = _fly_hero("blk_a")
	var d7: Dictionary = {}
	var ok7: bool = false
	if e7 != null and a7 != null:
		var tr7a: Dictionary = await _dodge_track(e7, a7, 3.0, -1, 1)
		_r20_pause(rec, true)
		var tr7p: Dictionary = await _dodge_track(e7, a7, 0.0, 1200)
		_r20_pause(rec, false)
		var tr7b: Dictionary = await _dodge_track(e7, a7, 3.0, -1, 1)
		var gap7: float = float(tr7b.ev[0].t) - float(tr7a.ev[0].t) if not tr7a.ev.is_empty() and not tr7b.ev.is_empty() else -1.0
		var smax7: float = maxf(float(tr7a.smax), float(tr7b.smax))
		ok7 = tr7a.ev.size() == 1 and is_equal_approx(float(tr7a.ev[0].lost), 80.0) and tr7p.ev.is_empty() and tr7b.ev.size() == 1 and is_equal_approx(float(tr7b.ev[0].lost), 80.0) \
			and gap7 >= 1.0 - 0.0005 and gap7 <= 1.0 + smax7 + 0.0005
		d7 = {"first": tr7a.ev, "paused_attacks": tr7p.ev.size(), "after": tr7b.ev, "gap": snappedf(gap7, 0.0001)}
	_check("攻擊-7 實際引擎 atk 120 跨手動暫停：每擊扣 80（防禦 50）；暫停 1.2 秒期間沒有攻擊，繼續後下一擊在上一擊的 1 秒後（一步之內）", ok7, d7)

	# 攻擊-8：同一波三種敵人各自用自己的攻擊力（32、字串 "32" 當作 20、120）；新的一場沒有 atk 的敵人是 20，不沿用上一場
	var p8: Dictionary = _blk_payload("atk-8", [[_grp("atk32_run", 1, 0.02), _grp("atkstr_run", 1, 0.02), _grp("atk120_run", 1, 0.02)]], 1000000.0)
	for c in ATK_ENEMIES:
		p8["enemies_config"].append(c.duplicate())
	_r19_js(rec, p8)
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() == 3, 3.0)
	var s8: Dictionary = _fly_snapshot(rec)
	var by8: Dictionary = {}
	for e in _sw_enemies():
		by8[e.enemy_id] = s8.get("enemy_atk", {}).get(str(e.get_instance_id()), null)
	_r19_js(rec, _blk_payload("atk-8b", [[_grp("gnd_run", 1, 0.02)]], 1000000.0))
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() == 1, 3.0)
	var s8b: Dictionary = _fly_snapshot(rec)
	var next8: Variant = s8b.get("enemy_atk", {}).values()
	_check("攻擊-8 同一波三種敵人各自用自己的攻擊力（32、字串 \"32\" 當作預設 20、120，快照 enemy_atk）；新的一場沒有 atk 的敵人是 20，不沿用上一場",
		by8 == {"atk32_run": 32.0, "atkstr_run": 20.0, "atk120_run": 120.0} and next8 == [20.0], {"wave": by8, "next_battle": next8})
	await _wait_until(func(): return _bm().game_state == 3, 5.0)

	# 攻擊-9：飛行敵人（atk 120）不阻路、不攻擊地面武將；抵達城池只扣 1；打倒 atk 120 的敵人照樣 +5 金幣；結算的戰場點數照原公式
	var e9: Node = await _atk_start(rec, "atk-9a", [_grp("atk120_fly", 1, 0.02)], {"blk_a": Vector2i(1, 5)}, 1, false)
	var a9: Node = _fly_hero("blk_a")
	var d9: Dictionary = {}
	var ok9a: bool = false
	if e9 != null and a9 != null:
		var ever: Array = [false]
		var tr9_each := func(_tr) -> void:
			if is_instance_valid(e9) and e9._blocker != null:
				ever[0] = true
		var tr9: Dictionary = await _blk_track([a9], 3.0, -1, tr9_each)
		ok9a = tr9.hits.is_empty() and not ever[0] and a9.current_hp == a9.max_hp and e9.blocker_attacks == 0
		d9["fly"] = {"hits": tr9.hits.size(), "blocked": ever[0], "attacks": e9.blocker_attacks if is_instance_valid(e9) else -1}
	var p9: Dictionary = _r12_payload("atk_9b", [[_grp("atk120_leak", 1, 0.02), _grp("atk120_soft", 1, 0.02)]], "atk-9b", [_r12_hero("gan_ning", null)])
	for c in ATK_ENEMIES:
		p9["enemies_config"].append(c.duplicate())
	_r19_js(rec, p9)
	_r12_place("gan_ning")
	var gold0: int = _bm().battle_gold
	var n_res: int = rec.sent_results.size()
	_bm().player_start_battle()
	await _wait_until(func(): return _bm().game_state == 3, 10.0)
	var res9: Dictionary = rec.sent_results[n_res] if rec.sent_results.size() > n_res else {}
	var pts9: int = 0
	for l in res9.get("loots", []):
		if l.get("item") == "battle_points":
			pts9 = int(l.get("count", 0))
	d9["base"] = {"hp": _bm().base_hp, "kills": _bm().kills, "gold": _bm().battle_gold - gold0, "result": res9.get("result"), "stars": res9.get("stars_earned"), "points": pts9}
	var ok9b: bool = _bm().base_hp == MAX_HP - 1 and _bm().kills == 1 and _bm().battle_gold - gold0 == 5 and res9.get("result") == "WIN" and int(res9.get("stars_earned", 0)) == 3 and pts9 == 1 * 10 + 19 * 20 + 600
	_check("攻擊-9 飛行敵人（atk 120）不阻路、不攻擊地面武將；atk 120 的敵人抵達城池只扣 1、被打倒照樣 +5 金幣；結算勝利 3 星、戰場點數照原公式（擊殺 1 × 10＋城池 19 × 20＋600）",
		ok9a and ok9b, d9)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 敵人設定的免疫減速（trait 是 immune_slow）─────────────────────────────
# 免疫減速的敵人不受任何減速：武將在道路上的阻擋減速、步兵塔的緩速光環（apply_slow）、文士塔的疊加減速（apply_stackable_slow），
# 也不顯示「緩」。只看 trait，不看敵人的 id；仍會被地面武將擋住並攻擊武將；時間倍率與手動暫停照常。
# 測試刻意讓 id 和 trait 不一致：免疫的敵人 id 沒有 cavalry，id 有 cavalry 的敵人沒有這個 trait

## 固定步進用的敵人：沿直線走（沒有地圖，不會被擋住），速度 60；extra 另外帶 trait 等欄位
func _imm_enemy(holder: Node, extra: Dictionary) -> Node:
	var e: Node = load("res://entities/enemy/Enemy.gd").new()
	holder.add_child(e)
	e.set_physics_process(false)
	var cfg: Dictionary = {"enemy_id": "imm_unit", "hp": 99999.0, "speed": 60.0}
	cfg.merge(extra, true)
	e.setup(cfg, [Vector2(0.0, 0.0), Vector2(100000.0, 0.0)])
	return e

## 實際引擎用的敵人設定：速度 120（免疫、普通、id 有 cavalry 但沒有 trait、免疫的飛行）
const IMM_ENEMIES: Array = [
	{"enemy_id": "imm_walk", "name": "I", "hp": 99999.0, "speed": 120.0, "atk": 30, "trait": "immune_slow"},
	{"enemy_id": "cavalry_plain", "name": "N", "hp": 99999.0, "speed": 120.0, "atk": 30},
	{"enemy_id": "imm_pad", "name": "P", "hp": 99999.0, "speed": 120.0, "atk": 30, "trait": " immune_slow "},
]

## 實際引擎：載入一場（經過 JSON）、放置武將（hero_id → 格子）與防禦塔（種類 → 格子）、開戰並等 n 個敵人出現
func _imm_start(rec: Node, battle_id: String, groups: Array, n: int, heroes: Dictionary = {}, towers: Dictionary = {}) -> Array:
	var team: Array = []
	for hid in heroes:
		team.append(_r12_hero(hid, null))
	var p: Dictionary = _r12_payload("imm_" + battle_id, [groups], battle_id, team)
	p["team_list"] = team
	for c in IMM_ENEMIES:
		p["enemies_config"].append(c.duplicate())
	_r19_js(rec, p)
	for hid in heroes:
		_r12_place(hid, heroes[hid])
	for tt in towers:
		main._on_web_place_tower({"tower_type": tt, "cell_x": towers[tt].x, "cell_y": towers[tt].y})
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() >= n, 5.0)
	return _sw_enemies()

## 實際引擎：逐個物理步進追蹤這些敵人，直到全部離場或 sec 秒（物理時鐘）：每個敵人的最低減速倍率、最高疊加減速、
## 被擋住的時間（從開始追蹤算起；沒有被擋住是 -1）、攻擊次數；場上出現過的「緩」（不重複計算同一個提示）
func _imm_track(es: Array, sec: float) -> Dictionary:
	var st: Dictionary = {}
	for e in es:
		st[e.get_instance_id()] = {"id": e.enemy_id, "min_mult": e.speed_mult, "max_stack": e._stack_slow_amount, "blocked_at": -1.0, "attacks": 0, "immune": e.immune_slow, "flying": e.is_flying()}
	var slow_texts: Dictionary = {}
	var t0: float = _pt()
	var w_end: int = Time.get_ticks_msec() + int(sec * 4000.0) + 15000
	while _pt() - t0 < sec and Time.get_ticks_msec() < w_end:
		await physics_frame
		var alive: int = 0
		for e in es:
			if not is_instance_valid(e) or e.is_queued_for_deletion():
				continue
			alive += 1
			var r: Dictionary = st[e.get_instance_id()]
			r.min_mult = minf(float(r.min_mult), e.speed_mult)
			r.max_stack = maxf(float(r.max_stack), e._stack_slow_amount)
			r.attacks = e.blocker_attacks
			if float(r.blocked_at) < 0.0 and e._blocker != null:
				r.blocked_at = snappedf(_pt() - t0, 0.001)
		for c in main.units_layer.get_children():
			if c is FloatingText and not c.is_queued_for_deletion() and c._label != null and c._label.text == "緩":
				slow_texts[c.get_instance_id()] = true
		if alive == 0:
			break
	var by: Dictionary = {}
	for k in st:
		by[st[k].id] = st[k]
	return {"by": by, "slow_texts": slow_texts.size()}

func _slow_immune_cases() -> void:
	var holder := _dodge_holder()

	# 免疫-0：trait 的判讀（和 Web 相同）：只有字串 immune_slow（前後空白可以）
	var tcases: Array = [["immune_slow", true], ["  immune_slow\t", true], ["Immune_Slow", false], ["immune_slow,armored", false], ["armored", false], ["", false],
		[null, false], [1, false], [true, false], [["immune_slow"], false]]
	var bad0: Array = []
	for c in tcases:
		if Enemy.is_immune_slow_cfg({"trait": c[0]}) != c[1]:
			bad0.append(str(c[0]))
	if Enemy.is_immune_slow_cfg({}) or not Enemy.is_immune_slow_cfg(JSON.parse_string("{\"trait\": \"immune_slow\"}")):
		bad0.append("missing/json")
	_check("免疫-0 trait 的判讀（和 Web 相同）：immune_slow 與前後有空白的是免疫；大小寫不同、合在一起寫的、其他值、空白、null、數字、布林、陣列、沒有欄位都不是；經過 JSON 的字串照用",
		bad0.is_empty(), bad0)

	# 免疫-1：兩個減速 API 對免疫的敵人都不套用、不顯示「緩」；普通的敵人照舊（id 有 cavalry 但沒有 trait 的也是普通）；傷害與灼燒照常
	var imm: Node = _imm_enemy(holder, {"trait": "immune_slow"})
	var nor: Node = _imm_enemy(holder, {"enemy_id": "cavalry_plain"})
	imm.apply_slow(0.3, 0.5)
	nor.apply_slow(0.3, 0.5)
	var after_slow: Array = [imm.speed_mult, nor.speed_mult]
	imm.apply_stackable_slow(0.05, 3.5)
	nor.apply_stackable_slow(0.05, 3.5)
	var after_stack: Array = [imm._stack_slow_amount, imm._stack_slow_timer, nor._stack_slow_amount, nor._stack_slow_timer]
	var texts1: Array = await _dodge_texts(holder)
	imm.take_damage(100.0)
	imm.apply_burn(20.0, 3, 1.0)
	var hp_burn: Array = [imm.current_hp, imm.is_burning()]
	# 61 步：第一跳在 1 秒（60 步）後，多一步避免浮點誤差讓第一跳落在下一步
	for i in range(61):
		imm._physics_process(1.0 / 60.0)
	var hp_after_tick: float = imm.current_hp
	var ok1: bool = imm.immune_slow and not nor.immune_slow and after_slow == [1.0, 0.3] and _approx_list(after_stack, [0.0, 0.0, 0.05, 3.5]) \
		and texts1.count("緩") == 1 and is_equal_approx(float(hp_burn[0]), 99899.0) and hp_burn[1] == true and is_equal_approx(hp_after_tick, 99879.0)
	_check("免疫-1 免疫的敵人：阻擋減速／緩速光環（apply_slow）與疊加減速（apply_stackable_slow）都不套用、不顯示「緩」；普通的敵人（id 有 cavalry 但沒有 trait）照舊 0.3 與 0.05、顯示「緩」；免疫的敵人照常受傷與灼燒",
		ok1, {"immune": [imm.immune_slow, nor.immune_slow], "after_slow": after_slow, "after_stack": after_stack, "texts": texts1, "hp_burn": hp_burn, "hp_after_tick": hp_after_tick})

	# 免疫-2：作用的先後：先疊加減速再光環、先光環再疊加減速、連續兩種光環（0.3 → 0.55），免疫的敵人都不受影響；普通的敵人照舊（最後一次光環的倍率）
	var ok2: bool = true
	var d2: Array = []
	for order in [["stack", "slow"], ["slow", "stack"], ["slow", "aura"]]:
		var a: Node = _imm_enemy(holder, {"trait": " immune_slow "})
		var b: Node = _imm_enemy(holder, {})
		for step_name in order:
			for x in [a, b]:
				match step_name:
					"stack":
						x.apply_stackable_slow(0.05, 3.5)
					"slow":
						x.apply_slow(0.3, 0.5)
					"aura":
						x.apply_slow(0.55, 0.2)
		var want_b: float = 0.55 if order.has("aura") else 0.3
		var want_bs: float = 0.05 if order.has("stack") else 0.0
		var ok: bool = a.speed_mult == 1.0 and a._stack_slow_amount == 0.0 and b.speed_mult == want_b and is_equal_approx(b._stack_slow_amount + 1.0, want_bs + 1.0)
		ok2 = ok2 and ok
		d2.append({"order": order, "immune": [a.speed_mult, a._stack_slow_amount], "normal": [b.speed_mult, b._stack_slow_amount]})
	_check("免疫-2 作用的先後（疊加減速→光環、光環→疊加減速、光環 0.3→0.55）：免疫的敵人（trait 前後有空白）都維持倍率 1、疊加 0；普通的敵人照舊", ok2, d2)

	# 免疫-3：移動距離（固定步進）：套用兩種減速後各走 60 步。1 倍（每步 1/60 秒）免疫的走 60 像素、普通的 60 × 0.3 × 0.95 = 17.1 像素；
	# 2 倍（每步 2/60 秒）免疫的走 120 像素（時間倍率照常作用，不是減速）。倍率減速照有效期到期：這裡的有效期（10 秒）涵蓋整段移動
	var d3: Dictionary = {}
	var ok3: bool = true
	for scale in [1.0, 2.0]:
		var a: Node = _imm_enemy(holder, {"trait": "immune_slow"})
		var b: Node = _imm_enemy(holder, {"enemy_id": "cavalry_plain"})
		for x in [a, b]:
			x.apply_slow(0.3, 10.0)
			x.apply_stackable_slow(0.05, 3.5)
		var ax: float = a.position.x
		var bx: float = b.position.x
		for i in range(60):
			a._physics_process(scale / 60.0)
			b._physics_process(scale / 60.0)
		var da: float = a.position.x - ax
		var db: float = b.position.x - bx
		ok3 = ok3 and absf(da - 60.0 * scale) < 0.01 and absf(db - 60.0 * scale * 0.3 * 0.95) < 0.01
		d3[str(scale)] = {"immune_px": snappedf(da, 0.001), "normal_px": snappedf(db, 0.001)}
	_check("免疫-3 固定步進 60 步、兩種減速都套用過：1 倍時免疫的走 60 像素、普通的 17.1 像素（60 × 0.3 × 0.95）；2 倍時免疫的走 120 像素（時間倍率照常）",
		ok3, d3)
	holder.queue_free()

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)

	# 免疫-4：實際引擎的道路武將（關羽，步兵、射程 3 格，在第 6 格）：免疫的敵人一路都不被減速（倍率 1），但照樣被擋住並攻擊武將（每擊 30 × 2/3 = 20）；
	# 之後新的一場，普通的敵人（id 有 cavalry、沒有 trait）被打中後倍率 0.3、比較晚才走到武將的格子（新場次不沿用免疫）
	var es4a: Array = await _imm_start(rec, "imm-4a", [_grp("imm_walk", 1, 0.02)], 1, {"guan_yu": Vector2i(6, 5)})
	var g4a: Node = _fly_hero("guan_yu")
	var tr4a: Dictionary = await _imm_track(es4a, 7.0) if es4a.size() == 1 else {"by": {}}
	var snap4: Dictionary = _fly_snapshot(rec)
	var hp4a: float = g4a.current_hp if g4a != null else -1.0
	var ia: Dictionary = tr4a.by.get("imm_walk", {})
	var imm_snap: Variant = snap4.get("enemy_immune", {}).values()
	var es4b: Array = await _imm_start(rec, "imm-4b", [_grp("cavalry_plain", 1, 0.02)], 1, {"guan_yu": Vector2i(6, 5)})
	var tr4b: Dictionary = await _imm_track(es4b, 12.0) if es4b.size() == 1 else {"by": {}}
	var nb: Dictionary = tr4b.by.get("cavalry_plain", {})
	var ok4: bool = ia.get("immune") == true and ia.get("flying") == false and float(ia.get("min_mult", 0.0)) == 1.0 and float(ia.get("max_stack", 1.0)) == 0.0 \
		and float(ia.get("blocked_at", -1.0)) > 0.0 and int(ia.get("attacks", 0)) >= 2 and is_equal_approx(1000.0 - hp4a, float(ia.get("attacks", 0)) * 20.0) and imm_snap == [true] \
		and nb.get("immune") == false and is_equal_approx(float(nb.get("min_mult", 1.0)), 0.3) and float(nb.get("blocked_at", -1.0)) > float(ia.get("blocked_at", 99.0)) + 1.0
	_check("免疫-4 實際引擎的道路武將：免疫的敵人（地面）一路倍率 1、疊加 0，照樣被擋住並攻擊武將（每擊 20）、快照 enemy_immune 是 true；新的一場普通的敵人（id 有 cavalry、沒有 trait）被打中後倍率 0.3、比免疫的晚 1 秒以上才被擋住",
		ok4, {"immune": ia, "hero_lost": snappedf(1000.0 - hp4a, 0.001), "snapshot": imm_snap, "normal": nb})

	# 免疫-5：實際引擎的防禦塔（步兵塔的緩速光環在第 3 格上方、文士塔在第 6 格上方）：
	# a 只有免疫的敵人：倍率一直 1、疊加 0、場上從來沒有「緩」；b 只有普通的敵人：倍率 0.55、疊加大於 0、出現「緩」；
	# c 同一波普通的先出、免疫的後出：普通的照樣被減速、免疫的不受影響（不會因為有免疫的敵人讓所有人都免疫）
	var towers5: Dictionary = {"infantry": Vector2i(3, 4), "scholar": Vector2i(6, 4)}
	var es5a: Array = await _imm_start(rec, "imm-5a", [_grp("imm_walk", 1, 0.02)], 1, {}, towers5)
	var tr5a: Dictionary = await _imm_track(es5a, 12.0)
	var es5b: Array = await _imm_start(rec, "imm-5b", [_grp("cavalry_plain", 1, 0.02)], 1, {}, towers5)
	var tr5b: Dictionary = await _imm_track(es5b, 14.0)
	var es5c: Array = await _imm_start(rec, "imm-5c", [_grp("cavalry_plain", 1, 0.02), _grp("imm_pad", 1, 0.02)], 2, {}, towers5)
	var tr5c: Dictionary = await _imm_track(es5c, 14.0)
	var a5: Dictionary = tr5a.by.get("imm_walk", {})
	var b5: Dictionary = tr5b.by.get("cavalry_plain", {})
	var cn: Dictionary = tr5c.by.get("cavalry_plain", {})
	var ci: Dictionary = tr5c.by.get("imm_pad", {})
	var ok5: bool = float(a5.get("min_mult", 0.0)) == 1.0 and float(a5.get("max_stack", 1.0)) == 0.0 and tr5a.slow_texts == 0 \
		and is_equal_approx(float(b5.get("min_mult", 1.0)), 0.55) and float(b5.get("max_stack", 0.0)) > 0.0 and tr5b.slow_texts >= 1 \
		and is_equal_approx(float(cn.get("min_mult", 1.0)), 0.55) and float(ci.get("min_mult", 0.0)) == 1.0 and float(ci.get("max_stack", 1.0)) == 0.0 and ci.get("immune") == true and cn.get("immune") == false
	_check("免疫-5 實際引擎的步兵塔光環與文士塔：只有免疫的敵人時倍率一直 1、疊加 0、從來沒有「緩」；只有普通的敵人時倍率 0.55、疊加大於 0、出現「緩」；同一波普通的先出、免疫的後出：普通的照樣被減速、免疫的不受影響",
		ok5, {"a_immune": a5, "a_texts": tr5a.slow_texts, "b_normal": b5, "b_texts": tr5b.slow_texts, "c_normal": cn, "c_immune": ci})

	# 免疫-6：時間倍率與暫停照常：免疫的敵人在直線上每個物理步進前進 速度 × 倍率 ÷ 60（1×、2×、部署選單的 0.1×），手動暫停時不動
	var es6: Array = await _imm_start(rec, "imm-6", [_grp("imm_walk", 1, 0.02)], 1)
	var d6: Dictionary = {}
	var ok6: bool = false
	if es6.size() == 1:
		var e6: Node = es6[0]
		# 先等 0.3 秒再量（和 R19-8 相同：剛出現的那一步不算在量測裡）
		await _wait(0.3)
		var m1: Dictionary = await _r19_move(e6, 0.5)
		_r19_speed(rec, 2.0)
		var m2: Dictionary = await _r19_move(e6, 0.5)
		_r19_speed(rec, 1.0)
		var menu: Dictionary = _r19_open(rec)
		var m01: Dictionary = await _r19_move(e6, 0.5)
		_r19_close(rec, menu)
		_r20_pause(rec, true)
		var mp: Dictionary = await _r19_move(e6, 0.5)
		_r20_pause(rec, false)
		var per: float = 120.0 / float(Engine.physics_ticks_per_second)
		ok6 = e6.immune_slow and e6.speed_mult == 1.0 and absf(float(m1.per_step) - per) < 1e-3 and absf(float(m2.per_step) - 2.0 * per) < 1e-3 and absf(float(m01.per_step) - 0.1 * per) < 1e-3 			and absf(float(m1.per_sec) - 120.0) < 0.1 and absf(float(m2.per_sec) - 120.0) < 0.1 and float(mp.dx) == 0.0
		d6 = {"x1": [snappedf(float(m1.per_step), 0.0001), snappedf(float(m1.per_sec), 0.01)], "x2": [snappedf(float(m2.per_step), 0.0001), snappedf(float(m2.per_sec), 0.01)],
			"x0_1": snappedf(float(m01.per_step), 0.0001), "paused_dx": mp.get("dx"), "expect_x1": per}
	_check("免疫-6 時間倍率與手動暫停照常作用在免疫的敵人：每個物理步進前進 速度 × 倍率 ÷ 每秒步數（1×、2×、部署選單的 0.1×）、換算成每秒遊戲時間都是 120 px，暫停時不動",
		ok6, d6)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 倍率減速的來源與有效期（武將在道路上的阻擋、步兵塔的緩速光環、武將的減速光環）──
# 每個來源各自保存 {倍率, 有效期}：生效的是最強的一個（最小倍率，和套用的先後無關），同一來源再次套用只刷新、不累加；
# 有效期照遊戲時間到期（固定步進與物理時鐘量）；撤除只撤自己的來源（舊的 clear_slow 只撤 apply_slow 的效果）；
# 文士塔的疊加減速另外計算：移動速度＝基礎速度 × 倍率 × (1 − 疊加量)，最少基礎速度的 15%

## 實際引擎用的敵人：速度 120 的普通／免疫，以及不會移動的普通／免疫
const SLW_ENEMIES: Array = [
	{"enemy_id": "slw_walk", "name": "W", "hp": 99999.0, "speed": 120.0, "atk": 30},
	{"enemy_id": "slw_imm", "name": "I", "hp": 99999.0, "speed": 120.0, "atk": 30, "trait": "immune_slow"},
	{"enemy_id": "slw_post", "name": "P", "hp": 99999.0, "speed": 0.0},
	{"enemy_id": "slw_post_imm", "name": "Q", "hp": 99999.0, "speed": 0.0, "trait": "immune_slow"},
]
## 關羽的減速光環（和網頁 utils/heroSkills 的出征參數相同）
const AURA_SKILL: Dictionary = {"id": "slow_aura", "slow_mult": 0.9}

## 固定步進：走 n 步（每步 dt 秒），回傳前進的距離
func _slw_steps(e: Node, n: int, dt: float) -> float:
	var x0: float = e.position.x
	for i in range(n):
		e._physics_process(dt)
	return e.position.x - x0

## 實際引擎：載入一場（經過 JSON），team 是出征的武將、cells 是放置的格子（hero_id → 格子）、towers 是防禦塔（[種類, 格子] 的清單），
## heroes_config 可以另外指定；開戰並等 n 個敵人出現
func _slw_start(rec: Node, battle_id: String, groups: Array, n: int, team: Array, cells: Dictionary = {}, towers: Array = [], heroes_config: Variant = null) -> Array:
	var p: Dictionary = _r12_payload("slw_" + battle_id, [groups], battle_id, team)
	if heroes_config != null:
		p["heroes_config"] = heroes_config
	for c in SLW_ENEMIES:
		p["enemies_config"].append(c.duplicate())
	_r19_js(rec, p)
	for hid in cells:
		_r12_place(hid, cells[hid])
	for t in towers:
		main._on_web_place_tower({"tower_type": t[0], "cell_x": t[1].x, "cell_y": t[1].y})
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() >= n, 5.0)
	return _sw_enemies()

## 場上的防禦塔（依放置順序）
func _slw_towers() -> Array:
	var out: Array = []
	for c in main.units_layer.get_children():
		if c is Tower and not c.is_queued_for_deletion():
			out.append(c)
	return out

## 逐個物理步進記錄一個敵人（在 stop 回傳 true 或 sec 秒物理時鐘後停止）：位置（格）、到 ref 的距離（格）、倍率、來源、攻擊圖片的狀態、這一步前進的距離
func _slw_track(e: Node, ref: Vector2, sec: float, stop: Callable = Callable()) -> Array:
	var rows: Array = []
	var t: float = float(main._tile_size)
	var t0: float = _pt()
	var w_end: int = Time.get_ticks_msec() + int(sec * 4000.0) + 15000
	var last_x: float = e.global_position.x if is_instance_valid(e) else 0.0
	while _pt() - t0 < sec and Time.get_ticks_msec() < w_end:
		await physics_frame
		if not is_instance_valid(e) or e.is_queued_for_deletion():
			break
		var x: float = e.global_position.x
		rows.append({"x": x / t, "d": e.global_position.distance_to(ref) / t, "m": e.speed_mult, "src": e.slow_sources_state().keys(),
			"fight": e.is_fighting_blocker(), "dx": x - last_x})
		last_x = x
		if stop.is_valid() and stop.call(e):
			break
	return rows

func _slow_source_cases() -> void:
	var holder := _dodge_holder()

	# 減速-0：來源 API 的參數檢查：空的來源、倍率不在 0～1 之間（0、1、1.2、負數、NaN、無限大）、有效期不是正的有限數字（0、負數、NaN、無限大）
	# 都不套用；已經倒下的敵人不套用；合理的參數照常套用
	var e0: Node = _imm_enemy(holder, {})
	var bad0: Array = []
	for c in [["", 0.5, 1.0], ["s", 0.0, 1.0], ["s", 1.0, 1.0], ["s", 1.2, 1.0], ["s", -0.1, 1.0], ["s", NAN, 1.0], ["s", INF, 1.0],
			["s", 0.5, 0.0], ["s", 0.5, -1.0], ["s", 0.5, NAN], ["s", 0.5, INF]]:
		e0.apply_slow_from(c[0], c[1], c[2])
		if e0.speed_mult != 1.0 or not e0.slow_sources_state().is_empty():
			bad0.append(str(c))
			e0.remove_slow_from(c[0])
	var dead: Node = _imm_enemy(holder, {})
	dead._is_dead = true
	dead.apply_slow_from("s", 0.5, 1.0)
	e0.apply_slow_from("s", 0.5, 1.0)
	_check("減速-0 來源 API 的參數檢查：空的來源、倍率 0／1／1.2／負數／NaN／無限大、有效期 0／負數／NaN／無限大都不套用；倒下的敵人不套用；合理的參數照常（倍率 0.5、一個來源）",
		bad0.is_empty() and dead.speed_mult == 1.0 and dead.slow_sources_state().is_empty() and e0.speed_mult == 0.5 and e0.slow_sources_state().keys() == ["s"],
		{"bad": bad0, "dead": dead.speed_mult, "ok": [e0.speed_mult, e0.slow_sources_state()]})

	# 減速-1：兩個來源（0.9 與 0.3）不論先後都是 0.3（最強），兩個來源都保留；各走 60 步（1 秒）都是 60 × 0.3 = 18 像素
	var a1: Node = _imm_enemy(holder, {})
	var b1: Node = _imm_enemy(holder, {})
	a1.apply_slow_from("A", 0.9, 5.0)
	a1.apply_slow_from("B", 0.3, 5.0)
	b1.apply_slow_from("B", 0.3, 5.0)
	b1.apply_slow_from("A", 0.9, 5.0)
	var da1: float = _slw_steps(a1, 60, 1.0 / 60.0)
	var db1: float = _slw_steps(b1, 60, 1.0 / 60.0)
	_check("減速-1 兩個來源 0.9 與 0.3：先 0.9 後 0.3、先 0.3 後 0.9 都是 0.3（取最強，和先後無關），兩個來源都保留；1 秒各走 18 像素",
		is_equal_approx(a1.speed_mult, 0.3) and is_equal_approx(b1.speed_mult, 0.3) and a1.slow_sources_state().size() == 2 and b1.slow_sources_state().size() == 2 \
			and absf(da1 - 18.0) < 0.01 and absf(db1 - 18.0) < 0.01,
		{"a": [a1.speed_mult, snappedf(da1, 0.001)], "b": [b1.speed_mult, snappedf(db1, 0.001)]})

	# 減速-2：同一個來源刷新不累加：0.9 套用三次仍是 0.9（不是 0.729）、只有一個來源；同一來源先 0.5 再 0.8 → 0.8（刷新成新的倍率）；
	# 有效期刷新成新的值（不相加）：1 秒的效果過了 0.5 秒再套用 1 秒 → 之後 0.9 秒仍有效、1.1 秒時已到期
	var e2: Node = _imm_enemy(holder, {})
	for i in range(3):
		e2.apply_slow_from("A", 0.9, 1.0)
	var m2a: Array = [e2.speed_mult, e2.slow_sources_state().size()]
	var e2b: Node = _imm_enemy(holder, {})
	e2b.apply_slow_from("A", 0.5, 1.0)
	e2b.apply_slow_from("A", 0.8, 1.0)
	_slw_steps(e2, 30, 1.0 / 60.0)
	e2.apply_slow_from("A", 0.9, 1.0)
	_slw_steps(e2, 54, 1.0 / 60.0)
	var still2: bool = e2.has_slow_from("A")
	_slw_steps(e2, 12, 1.0 / 60.0)
	var gone2: bool = not e2.has_slow_from("A") and e2.speed_mult == 1.0
	_check("減速-2 同一個來源刷新不累加：0.9 套用三次仍是 0.9、只有一個來源；先 0.5 再 0.8 是 0.8；有效期刷新成新的 1 秒（不是剩下的 0.5 加 1）：再過 0.9 秒仍有效、1.1 秒時已到期、倍率回到 1",
		is_equal_approx(float(m2a[0]), 0.9) and m2a[1] == 1 and is_equal_approx(e2b.speed_mult, 0.8) and e2b.slow_sources_state().size() == 1 and still2 and gone2,
		{"triple": m2a, "refresh": e2b.speed_mult, "still_0_9s": still2, "gone_1_1s": gone2})

	# 減速-3：強的來源先到期、弱的仍有效：0.3（0.51 秒）與 0.9（1.51 秒），兩種套用順序 × 1 倍／2 倍／部署選單的 0.1 倍（每步 倍率 ÷ 60 秒）：
	# 遊戲時間 0.45 秒時 0.3、0.6 秒時 0.9、1.45 秒時 0.9、1.6 秒時 1；1.6 秒走的距離 ≈ 60 ×（0.3 × 0.51 ＋ 0.9 × 1.0 ＋ 0.09）＝ 68.58 像素（誤差不超過一步）
	var ok3: bool = true
	var d3: Dictionary = {}
	for scale in [1.0, 2.0, 0.1]:
		for order in [["A", "B"], ["B", "A"]]:
			var e: Node = _imm_enemy(holder, {})
			for s in order:
				if s == "A":
					e.apply_slow_from("A", 0.3, 0.51)
				else:
					e.apply_slow_from("B", 0.9, 1.51)
			var dt: float = scale / 60.0
			var x0: float = e.position.x
			var gt: float = 0.0
			var marks: Array = []
			for target in [0.45, 0.6, 1.45, 1.6]:
				while gt < target - 1e-9:
					e._physics_process(dt)
					gt += dt
				marks.append(snappedf(e.speed_mult, 0.0001))
			var dist: float = e.position.x - x0
			var ok: bool = _approx_list(marks, [0.3, 0.9, 0.9, 1.0]) and absf(dist - 68.58) <= 60.0 * dt + 0.01
			ok3 = ok3 and ok
			d3["%s %s" % [scale, "".join(order)]] = {"marks": marks, "dist": snappedf(dist, 0.001)}
	_check("減速-3 強的來源先到期、弱的仍有效（照遊戲時間）：兩種套用順序 × 1 倍、2 倍、0.1 倍：遊戲時間 0.45 秒 0.3、0.6 秒 0.9、1.45 秒 0.9、1.6 秒 1；1.6 秒走約 68.58 像素",
		ok3, d3)

	# 減速-4：只撤自己的來源：0.3（A）、0.9（B）、舊入口 apply_slow 的 0.55 → 0.3；撤 A → 0.55；舊的 clear_slow 只撤 apply_slow 的效果 → 0.9（B 還在）；
	# 撤不存在的來源不影響；撤 B → 1
	var e4: Node = _imm_enemy(holder, {})
	e4.apply_slow_from("A", 0.3, 5.0)
	e4.apply_slow_from("B", 0.9, 5.0)
	e4.apply_slow(0.55, 5.0)
	var seq4: Array = [e4.speed_mult]
	e4.remove_slow_from("A")
	seq4.append(e4.speed_mult)
	e4.clear_slow()
	seq4.append(e4.speed_mult)
	e4.remove_slow_from("nope")
	seq4.append(e4.speed_mult)
	e4.remove_slow_from("B")
	seq4.append(e4.speed_mult)
	_check("減速-4 只撤自己的來源：三個來源時 0.3；撤 A 後 0.55；舊的 clear_slow 只撤 apply_slow 的效果 → 0.9（其他來源還在）；撤不存在的來源不變；撤最後一個來源回到 1",
		_approx_list(seq4, [0.3, 0.55, 0.9, 0.9, 1.0]) and e4.slow_sources_state().is_empty(), seq4)

	# 減速-5：免疫減速的敵人：來源 API、舊入口 apply_slow、疊加減速都不套用（倍率 1、沒有來源、疊加 0），60 步照常走 60 像素
	var e5: Node = _imm_enemy(holder, {"trait": "immune_slow"})
	e5.apply_slow_from("A", 0.3, 5.0)
	e5.apply_slow(0.3, 5.0)
	e5.apply_stackable_slow(0.2, 3.5)
	var d5: float = _slw_steps(e5, 60, 1.0 / 60.0)
	_check("減速-5 免疫減速的敵人：來源 API（apply_slow_from）、舊入口 apply_slow、疊加減速都不套用：倍率 1、沒有來源、疊加 0，1 秒照常走 60 像素",
		e5.speed_mult == 1.0 and e5.slow_sources_state().is_empty() and e5._stack_slow_amount == 0.0 and absf(d5 - 60.0) < 0.01,
		{"mult": e5.speed_mult, "src": e5.slow_sources_state(), "stack": e5._stack_slow_amount, "px": snappedf(d5, 0.001)})

	# 減速-6：和文士塔的疊加減速組合（速度＝基礎 × 倍率 × (1 − 疊加)，最少 15%）：0.9 與疊加 0.2 → 60 × 0.9 × 0.8 ＝ 43.2 像素／秒；
	# 0.3 與疊加（0.5 兩次，上限 0.85）→ 60 × 0.3 × 0.15 ＝ 2.7，低於最少的 9 → 9 像素／秒；疊加的上限、持續時間照舊
	var e6: Node = _imm_enemy(holder, {})
	e6.apply_slow_from("A", 0.9, 10.0)
	e6.apply_stackable_slow(0.2, 3.5)
	var d6a: float = _slw_steps(e6, 60, 1.0 / 60.0)
	var e6b: Node = _imm_enemy(holder, {})
	e6b.apply_slow_from("A", 0.3, 10.0)
	e6b.apply_stackable_slow(0.5, 3.5)
	e6b.apply_stackable_slow(0.5, 3.5)
	var stack6: Array = [e6b._stack_slow_amount, e6b._stack_slow_timer]
	var d6b: float = _slw_steps(e6b, 60, 1.0 / 60.0)
	_check("減速-6 和文士塔的疊加減速：0.9 × (1 − 0.2) → 1 秒 43.2 像素；0.3 與疊加（上限 0.85）→ 低於最少 15%，1 秒 9 像素；疊加上限 0.85、持續 3.5 秒照舊",
		absf(d6a - 43.2) < 0.01 and absf(d6b - 9.0) < 0.01 and _approx_list(stack6, [0.85, 3.5]) and is_equal_approx(e6.get_effective_speed(), 43.2),
		{"a_px": snappedf(d6a, 0.001), "b_px": snappedf(d6b, 0.001), "stack": stack6})
	holder.queue_free()

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)
	var t: float = float(main._tile_size)

	# 減速-7：實際引擎，兩座步兵塔（(3,4)、(4,4)，射程 1.5 格）與一位沒有目標的武將（關羽在 (12,6)，沒有技能、不在道路上）：
	# 敵人在塔的範圍內每一步都是 0.55（沒有目標的武將不會清掉塔的減速）；兩座塔範圍重疊處有兩個不同的來源（每座塔各自一個）；
	# 離開兩座塔的範圍後沒有來源、倍率 1；兩座塔的來源字串不同
	var es7: Array = await _slw_start(rec, "slw-7", [_grp("slw_walk", 1, 0.02)], 1, [_r12_hero("guan_yu", null)], {},
		[["infantry", Vector2i(3, 4)], ["infantry", Vector2i(4, 4)]])
	# 武將在塔之後放置：同一幀裡武將在塔之後處理，錯誤地清掉所有減速時，敵人在下一個物理步進就會失去塔的減速
	_r12_place("guan_yu", Vector2i(12, 6))
	var tw7: Array = _slw_towers()
	var d7: Dictionary = {}
	var ok7: bool = false
	if es7.size() == 1 and tw7.size() == 2:
		var c1: Vector2 = tw7[0].global_position
		var c2: Vector2 = tw7[1].global_position
		var rng: float = tw7[0].range_tiles
		var rows: Array = await _slw_track(es7[0], c1, 6.0, func(e): return e.global_position.x / t > 8.0)
		var inside_bad: Array = []
		var outside_bad: Array = []
		var overlap: int = 0
		var overlap_bad: Array = []
		for r in rows:
			var d1: float = float(r.d)
			var d2: float = absf(float(r.x) * t - c2.x) / t
			# 敵人在第 5 列、塔在第 4 列：距離＝√(水平² + 1)
			d2 = sqrt(d2 * d2 + 1.0)
			var in1: bool = d1 < rng - 0.15
			var in2: bool = d2 < rng - 0.15
			var out_all: bool = d1 > rng + 0.15 and d2 > rng + 0.15
			if (in1 or in2) and not is_equal_approx(float(r.m), 0.55):
				inside_bad.append(r)
			if out_all and (float(r.m) != 1.0 or not (r.src as Array).is_empty()):
				outside_bad.append(r)
			if in1 and in2:
				overlap += 1
				var srcs: Array = r.src
				if srcs.size() != 2 or not srcs.has(tw7[0].slow_source) or not srcs.has(tw7[1].slow_source):
					overlap_bad.append(r)
		ok7 = rows.size() > 30 and inside_bad.is_empty() and outside_bad.is_empty() and overlap >= 3 and overlap_bad.is_empty() and tw7[0].slow_source != tw7[1].slow_source \
			and _fly_hero("guan_yu") != null
		d7 = {"frames": rows.size(), "inside_bad": inside_bad.slice(0, 3), "outside_bad": outside_bad.slice(0, 3), "overlap": overlap, "overlap_bad": overlap_bad.slice(0, 3),
			"sources": [tw7[0].slow_source, tw7[1].slow_source]}
	_check("減速-7 實際引擎：兩座步兵塔範圍內每一步都是 0.55（場上沒有目標的武將不會清掉塔的減速）；重疊處有兩座塔各自的來源；離開兩座塔的範圍後沒有來源、倍率 1；兩座塔的來源不同",
		ok7, d7)

	# 減速-8：道路武將的阻擋減速與攻擊圖片：關羽（沒有技能）在道路 (6,5)、步兵塔在 (3,4)：
	# a 被打中後倍率 0.3（道路來源），在還沒被擋住時是 0.3 但不是攻擊的圖（攻擊圖片看阻擋狀態，不看倍率）；被擋住時是攻擊的圖；
	# b 把關羽移到建築格 (6,4)：下一幀撤掉道路的來源（塔的來源不受影響，這時已離開塔的範圍 → 倍率 1），敵人不再被擋、恢復走路的圖
	var es8: Array = await _slw_start(rec, "slw-8", [_grp("slw_walk", 1, 0.02)], 1, [_r12_hero("guan_yu", null)], {"guan_yu": Vector2i(6, 5)},
		[["infantry", Vector2i(3, 4)]])
	var g8: Node = _fly_hero("guan_yu")
	var d8: Dictionary = {}
	var ok8: bool = false
	if es8.size() == 1 and g8 != null:
		var e8: Node = es8[0]
		var rows8: Array = await _slw_track(e8, g8.global_position, 8.0, func(e): return e.is_fighting_blocker())
		var slowed_walk: int = 0
		var both: int = 0
		for r in rows8:
			if float(r.m) <= 0.5 and not r.fight:
				slowed_walk += 1
			if (r.src as Array).has(g8.slow_source) and (r.src as Array).size() == 2:
				both += 1
		var fight_at_block: bool = e8.is_fighting_blocker() and is_equal_approx(e8.speed_mult, 0.3) and e8.has_slow_from(g8.slow_source)
		var snap8: Dictionary = _fly_snapshot(rec)
		var snap_fight: Variant = snap8.get("enemy_fighting", {}).values()
		main.game_map.clear_occupied(Vector2i(6, 5))
		g8.reposition(Vector2i(6, 4), main.game_map.grid_to_world(Vector2i(6, 4)), main.game_map)
		main.game_map.set_occupied(Vector2i(6, 4), g8)
		await physics_frame
		await process_frame
		await physics_frame
		var after8: Array = [e8.speed_mult, e8.slow_sources_state().keys(), e8.is_fighting_blocker()]
		var rows8b: Array = await _slw_track(e8, g8.global_position, 0.5)
		var moved: float = 0.0
		for r in rows8b:
			moved += float(r.dx)
		ok8 = slowed_walk >= 3 and both >= 1 and fight_at_block and snap_fight == [true] and float(after8[0]) == 1.0 and (after8[1] as Array).is_empty() and after8[2] == false and moved > 20.0
		d8 = {"slowed_walk_frames": slowed_walk, "both_sources_frames": both, "blocked": fight_at_block, "snapshot_fighting": snap_fight, "after_move": after8, "moved_px": snappedf(moved, 0.01)}
	_check("減速-8 道路武將：被打中後 0.3（道路來源；經過塔的範圍時兩個來源），還沒被擋住時不是攻擊的圖（不看倍率）、被擋住時是攻擊的圖（快照 enemy_fighting）；武將移到建築格後下一幀撤掉道路的來源、倍率 1、恢復走路的圖並繼續前進",
		ok8, d8)

	# 減速-9：免疫的敵人被道路武將擋住時也是攻擊的圖（倍率一直 1、沒有來源）
	var es9: Array = await _slw_start(rec, "slw-9", [_grp("slw_imm", 1, 0.02)], 1, [_r12_hero("guan_yu", null)], {"guan_yu": Vector2i(6, 5)})
	var ok9: bool = false
	var d9: Dictionary = {}
	if es9.size() == 1:
		var rows9: Array = await _slw_track(es9[0], _fly_hero("guan_yu").global_position, 6.0, func(e): return e.is_fighting_blocker())
		var max_m: float = 0.0
		var min_m: float = 1.0
		for r in rows9:
			max_m = maxf(max_m, float(r.m))
			min_m = minf(min_m, float(r.m))
		ok9 = es9[0].is_fighting_blocker() and min_m == 1.0 and es9[0].slow_sources_state().is_empty()
		d9 = {"fighting": es9[0].is_fighting_blocker(), "min_mult": min_m, "src": es9[0].slow_sources_state()}
	_check("減速-9 免疫減速的敵人被道路武將擋住：倍率一直 1、沒有來源，攻擊時照樣是攻擊的圖（攻擊圖片看阻擋狀態）", ok9, d9)

	# 減速-10：有效期照遊戲時間：同一個敵人（沒有其他減速）加上 0.3 秒的來源，1 倍、2 倍、部署選單的 0.1 倍下，到期時的物理時鐘都在 0.3 秒的一步之內；
	# 手動暫停 1 秒（牆鐘）時來源與剩餘有效期不變、敵人不動，繼續後照剩下的時間到期；新的一場的敵人沒有舊的來源
	var es10: Array = await _slw_start(rec, "slw-10", [_grp("slw_walk", 1, 0.02)], 1, [])
	var d10: Dictionary = {}
	var ok10: bool = false
	if es10.size() == 1:
		var e10: Node = es10[0]
		var fresh: bool = e10.slow_sources_state().is_empty()
		var spans: Dictionary = {}
		for mode in ["x1", "x2", "x0_1"]:
			var menu: Dictionary = {}
			if mode == "x2":
				_r19_speed(rec, 2.0)
			elif mode == "x0_1":
				menu = _r19_open(rec)
			await physics_frame
			e10.apply_slow_from("probe", 0.5, 0.3)
			var p0: float = _pt()
			while e10.has_slow_from("probe") and _pt() - p0 < 2.0:
				await physics_frame
			spans[mode] = snappedf(_pt() - p0, 0.0001)
			if mode == "x2":
				_r19_speed(rec, 1.0)
			elif mode == "x0_1":
				_r19_close(rec, menu)
		e10.apply_slow_from("probe", 0.5, 0.6)
		await physics_frame
		var left0: float = float(e10.slow_sources_state().get("probe", {}).get("left", -1.0))
		var x0: float = e10.global_position.x
		_r20_pause(rec, true)
		await _wait_real(1.0)
		var paused: Array = [e10.has_slow_from("probe"), float(e10.slow_sources_state().get("probe", {}).get("left", -1.0)), e10.global_position.x - x0]
		_r20_pause(rec, false)
		var p1: float = _pt()
		while e10.has_slow_from("probe") and _pt() - p1 < 2.0:
			await physics_frame
		var rest: float = _pt() - p1
		var step1: float = 1.0 / float(Engine.physics_ticks_per_second)
		ok10 = fresh and absf(float(spans.x1) - 0.3) <= step1 + 1e-4 and absf(float(spans.x2) - 0.3) <= 2.0 * step1 + 1e-4 and absf(float(spans.x0_1) - 0.3) <= 0.1 * step1 + 1e-4 \
			and paused[0] == true and is_equal_approx(float(paused[1]), left0) and float(paused[2]) == 0.0 and absf(rest - left0) <= step1 + 1e-4
		d10 = {"fresh": fresh, "spans": spans, "left_before_pause": left0, "paused": paused, "rest_after_resume": snappedf(rest, 0.0001)}
	_check("減速-10 有效期照遊戲時間：0.3 秒的來源在 1 倍、2 倍、0.1 倍下都在遊戲時間 0.3 秒（一步之內）到期；暫停 1 秒（牆鐘）時來源與剩餘有效期不變、敵人不動，繼續後照剩下的時間到期；新的一場的敵人一開始沒有來源",
		ok10, d10)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 關羽「減速光環」（設定表的被動描述「周圍敵人減速10%」）──
# 範圍與規則的補充（設定表沒有寫）：以關羽為中心、目前有效射程內（含邊界，比中心距離）的地面敵人移動速度 × 0.9；
# 不需要普通攻擊的目標、不看攻擊冷卻；飛行與免疫減速的敵人不受影響；和其他倍率減速取最強（兩個光環不相乘）；
# 離開範圍、移位、升級、倒下、移除、新的一場都在下一幀內更新。普通攻擊照舊（沒有橫掃）
func _aura_guan() -> Dictionary:
	return _r12_hero("guan_yu", AURA_SKILL.duplicate())

func _slow_aura_cases() -> void:
	# 光環-0：技能參數的判讀：slow_mult 是 0～1 之間（不含兩端）的有限數字才啟用；字串、0、1、1.5、負數、布林、null、NaN、無限大、
	# 沒有欄位、不認得的 id、sweep 都不是光環；經過 JSON 的 0.9 照用；光環不帶橫掃
	var h0: Node = load("res://entities/hero/Hero.gd").new()
	var bad0: Array = []
	for c in [[{"id": "slow_aura", "slow_mult": 0.9}, 0.9], [{"id": "slow_aura", "slow_mult": 0.5}, 0.5], [{"id": "slow_aura", "slow_mult": "0.9"}, 1.0],
			[{"id": "slow_aura", "slow_mult": 0}, 1.0], [{"id": "slow_aura", "slow_mult": 1}, 1.0], [{"id": "slow_aura", "slow_mult": 1.5}, 1.0],
			[{"id": "slow_aura", "slow_mult": -0.1}, 1.0], [{"id": "slow_aura", "slow_mult": true}, 1.0], [{"id": "slow_aura", "slow_mult": null}, 1.0],
			[{"id": "slow_aura", "slow_mult": NAN}, 1.0], [{"id": "slow_aura", "slow_mult": INF}, 1.0], [{"id": "slow_aura"}, 1.0],
			[{"id": "slow_aura_x", "slow_mult": 0.9}, 1.0], [{"id": "sweep", "sweep_radius": 1.0, "sweep_max_targets": 2, "sweep_ratio": 0.5}, 1.0], [null, 1.0]]:
		var st: Dictionary = {} if c[0] == null else {"skill": c[0]}
		h0._read_skill(st)
		var want_sweep: bool = c[0] != null and c[0].get("id") == "sweep"
		if not is_equal_approx(h0.slow_aura_mult, float(c[1])) or (h0.sweep_ratio > 0.0) != want_sweep:
			bad0.append(str(c[0]))
	h0._read_skill({"skill": JSON.parse_string("{\"id\": \"slow_aura\", \"slow_mult\": 0.9}")})
	var json0: float = h0.slow_aura_mult
	h0.free()
	_check("光環-0 技能參數：slow_mult 0.9、0.5 啟用；字串、0、1、1.5、負數、布林、null、NaN、無限大、沒有欄位、不認得的 id 都不啟用；sweep 只有橫掃、光環不帶橫掃；經過 JSON 的 0.9 照用",
		bad0.is_empty() and is_equal_approx(json0, 0.9), {"bad": bad0, "json": json0})

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)
	var t: float = float(main._tile_size)

	# 光環-1：邊界與對象（不會移動的敵人，關羽在建築格 (6,4)、射程 3 格，攻擊冷卻設成很長 → 這段期間沒有普通攻擊）：
	# 正好 3 格（含邊界）、1 格、√5 格的地面敵人都有光環（0.9、關羽的光環來源），3.02 格的沒有；1 格的飛行、1 格的免疫減速的地面都沒有（免疫的倍率 1）；
	# 沒有普通攻擊（冷卻沒到、血量不變）也照樣作用；備戰時光環不作用（快照 aura_active false），開戰後 true
	var team1: Array = [_aura_guan()]
	var p1: Dictionary = _r12_payload("slw_aura1", [[_grp("slw_post", 4, 0.02), _grp("fly_post", 1, 0.02), _grp("slw_post_imm", 1, 0.02)]], "aura-1", team1)
	for c in SLW_ENEMIES:
		p1["enemies_config"].append(c.duplicate())
	_r19_js(rec, p1)
	_r12_place("guan_yu", Vector2i(6, 4))
	var g1: Node = _fly_hero("guan_yu")
	for i in range(3):
		await process_frame
	var prep_active: bool = g1.slow_state().aura_active if g1 != null else true
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() >= 6, 5.0)
	var es1: Array = _sw_enemies()
	var d1: Dictionary = {}
	var ok1: bool = false
	if es1.size() == 6 and g1 != null:
		g1._atk_timer = 999.0
		var R: float = g1.attack_range * t
		var posts: Array = es1.filter(func(e): return e.enemy_id == "slw_post")
		var fly: Node = es1.filter(func(e): return e.enemy_id == "fly_post")[0]
		var imm: Node = es1.filter(func(e): return e.enemy_id == "slw_post_imm")[0]
		var c: Vector2 = g1.global_position
		posts[0].global_position = c + Vector2(R, 0.0)
		posts[1].global_position = c + Vector2(R + 0.02 * t, 0.0)
		posts[2].global_position = c + Vector2(0.0, 1.0) * t
		posts[3].global_position = c + Vector2(-2.0, 1.0) * t
		fly.global_position = c + Vector2(1.0, 0.0) * t
		imm.global_position = c + Vector2(-1.0, 0.0) * t
		var hp0: Array = es1.map(func(e): return e.current_hp)
		for i in range(4):
			await process_frame
			await physics_frame
		var src: String = g1.aura_source
		var got: Array = []
		for e in [posts[0], posts[1], posts[2], posts[3], fly, imm]:
			got.append([e.has_slow_from(src), snappedf(e.speed_mult, 0.0001)])
		var hp1: Array = es1.map(func(e): return e.current_hp)
		var snap1: Dictionary = _fly_snapshot(rec)
		var hs: Dictionary = snap1.get("hero_slow", {}).get("guan_yu", {})
		ok1 = got == [[true, 0.9], [false, 1.0], [true, 0.9], [true, 0.9], [false, 1.0], [false, 1.0]] and hp0 == hp1 and prep_active == false \
			and hs.get("aura_active") == true and is_equal_approx(float(hs.get("aura_mult", 0.0)), 0.9) and is_equal_approx(float(hs.get("radius", 0.0)), 3.0) and (hs.get("aura", []) as Array).size() == 3
		d1 = {"edge_3": got[0], "out_3_02": got[1], "one": got[2], "sqrt5": got[3], "flying": got[4], "immune": got[5], "hp_same": hp0 == hp1, "prep_active": prep_active, "snapshot": hs}
	_check("光環-1 範圍與對象：正好 3 格（含邊界）、1 格、√5 格的地面敵人 0.9，3.02 格的沒有；飛行、免疫減速的敵人沒有（倍率 1）；沒有普通攻擊（冷卻沒到、血量不變）也照樣作用；備戰時不作用、開戰後快照 aura_active、倍率 0.9、半徑 3、影響 3 名",
		ok1, d1)

	# 光環-2：普通攻擊不變、沒有橫掃：主目標（生成序號 0，免疫減速）在 2 格、另外兩名在它旁邊 0.3 格與 0.4 格：
	# 關羽打一次只有主目標扣 100，其他 0；橫掃次數 0；免疫的主目標沒有光環但照樣受到普通攻擊；旁邊兩名有光環
	var p2: Dictionary = _r12_payload("slw_aura2", [[_grp("slw_post_imm", 1, 0.02), _grp("slw_post", 2, 0.02)]], "aura-2", [_aura_guan()])
	for c in SLW_ENEMIES:
		p2["enemies_config"].append(c.duplicate())
	_r19_js(rec, p2)
	_r12_place("guan_yu", Vector2i(3, 4))
	var g2: Node = _fly_hero("guan_yu")
	if g2 != null:
		g2.set_process(false)
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() >= 3, 5.0)
	var es2: Array = _sw_enemies()
	var d2: Dictionary = {}
	var ok2: bool = false
	if es2.size() == 3 and g2 != null:
		var c2: Vector2 = g2.global_position + Vector2(2.0 * t, 0.0)
		es2[0].global_position = c2
		es2[1].global_position = c2 + Vector2(0.3, 0.0) * t
		es2[2].global_position = c2 + Vector2(0.0, 0.4) * t
		var before: Array = es2.map(func(e): return e.current_hp)
		g2._process(0.0)
		var dmg: Array = []
		for i in range(3):
			dmg.append(snappedf(float(before[i]) - es2[i].current_hp, 0.01))
		var aura: Array = es2.map(func(e): return e.has_slow_from(g2.aura_source))
		ok2 = es2[0].enemy_id == "slw_post_imm" and dmg == [100.0, 0.0, 0.0] and g2.sweep_count == 0 and g2.sweep_ratio == 0.0 and aura == [false, true, true]
		d2 = {"main": es2[0].enemy_id, "dmg": dmg, "sweep": [g2.sweep_count, g2.sweep_ratio], "aura": aura}
		g2.set_process(true)
	_check("光環-2 普通攻擊不變、沒有橫掃：主目標（免疫減速）受到 100、旁邊 0.3 與 0.4 格的兩名 0；橫掃次數 0、沒有橫掃參數；免疫的主目標沒有光環但照樣被打，旁邊兩名有光環",
		ok2, d2)

	# 光環-3：實際移動距離（速度 120、關羽在建築格 (6,4)，不擋路也沒有道路減速）：範圍外每一步 2 像素；範圍內每一步 1.8 像素（0.9，不是 0.1 倍的 0.2）、
	# 快照的實際速度 108；2 倍每步 3.6、部署選單的 0.1 倍每步 0.18，換算成每秒遊戲時間都是 108；暫停時不動、光環仍在；離開範圍後回到每步 2 像素、沒有來源
	var es3: Array = await _slw_start(rec, "aura-3", [_grp("slw_walk", 1, 0.02)], 1, [_aura_guan()], {"guan_yu": Vector2i(6, 4)})
	var g3: Node = _fly_hero("guan_yu")
	var d3: Dictionary = {}
	var ok3: bool = false
	if es3.size() == 1 and g3 != null:
		var e3: Node = es3[0]
		var R3: float = g3.attack_range
		var at3: Vector2 = g3.global_position
		var pre: Array = await _slw_track(e3, at3, 3.0, func(e): return e.global_position.distance_to(at3) / t < R3 - 0.4)
		var pre_steps: Array = []
		# 前兩步不算（剛出現的那一步還沒移動）
		for r in pre.slice(2):
			if float(r.d) > R3 + 0.2:
				pre_steps.append(snappedf(float(r.dx), 0.0001))
		var snap3: Dictionary = _fly_snapshot(rec)
		var sp3: float = float(snap3.get("enemy_speed", {}).values()[0]) if not snap3.get("enemy_speed", {}).is_empty() else -1.0
		# 從一般幀開始量（_slw_track 停在物理步進開頭，這時開始量會少算一步）
		await process_frame
		var m1: Dictionary = await _r19_move(e3, 0.4)
		_r19_speed(rec, 2.0)
		var m2: Dictionary = await _r19_move(e3, 0.4)
		_r19_speed(rec, 1.0)
		var menu: Dictionary = _r19_open(rec)
		var m01: Dictionary = await _r19_move(e3, 0.4)
		_r19_close(rec, menu)
		_r20_pause(rec, true)
		var mp: Dictionary = await _r19_move(e3, 0.4)
		var paused_src: bool = e3.has_slow_from(g3.aura_source)
		_r20_pause(rec, false)
		var post: Array = await _slw_track(e3, at3, 6.0, func(e): return e.global_position.distance_to(at3) / t > R3 + 0.6)
		var out_steps: Array = []
		for r in post:
			if float(r.d) > R3 + 0.3:
				out_steps.append(snappedf(float(r.dx), 0.0001))
		var per: float = 120.0 / float(Engine.physics_ticks_per_second)
		var all_eq := func(a: Array, v: float) -> bool:
			for x in a:
				if absf(float(x) - v) > 1e-3:
					return false
			return a.size() > 0
		ok3 = all_eq.call(pre_steps, per) and is_equal_approx(sp3, 108.0) and absf(float(m1.per_step) - 0.9 * per) < 1e-3 and absf(float(m2.per_step) - 1.8 * per) < 1e-3 \
			and absf(float(m01.per_step) - 0.09 * per) < 1e-3 and absf(float(m1.per_sec) - 108.0) < 0.1 and absf(float(m2.per_sec) - 108.0) < 0.1 and absf(float(m01.per_sec) - 108.0) < 0.1 \
			and float(mp.dx) == 0.0 and paused_src and all_eq.call(out_steps, per) and e3.slow_sources_state().is_empty() and e3.speed_mult == 1.0
		d3 = {"before": pre_steps.slice(0, 5), "speed_in": sp3, "x1": [snappedf(float(m1.per_step), 0.0001), snappedf(float(m1.per_sec), 0.01)],
			"x2": [snappedf(float(m2.per_step), 0.0001), snappedf(float(m2.per_sec), 0.01)], "x0_1": [snappedf(float(m01.per_step), 0.0001), snappedf(float(m01.per_sec), 0.01)],
			"paused_dx": mp.get("dx"), "paused_src": paused_src, "after": out_steps.slice(0, 5), "final_src": e3.slow_sources_state()}
	_check("光環-3 實際移動距離：範圍外每步 2 像素；範圍內每步 1.8（0.9 倍）、快照速度 108；2 倍每步 3.6、0.1 倍每步 0.18，每秒遊戲時間都是 108；暫停時不動、光環仍在；離開範圍後每步 2、沒有來源",
		ok3, d3)

	# 光環-4：兩個光環不相乘：關羽 (6,4) 與帶同樣光環的趙雲 (6,6) 都涵蓋第 5 列的敵人 → 兩個不同的光環來源、倍率 0.9（不是 0.81）、每步 1.8 像素
	var es4: Array = await _slw_start(rec, "aura-4", [_grp("slw_walk", 1, 0.02)], 1, [_aura_guan(), _r12_hero("zhao_yun", AURA_SKILL.duplicate())],
		{"guan_yu": Vector2i(6, 4), "zhao_yun": Vector2i(6, 6)})
	var ga: Node = _fly_hero("guan_yu")
	var gz: Node = _fly_hero("zhao_yun")
	var d4: Dictionary = {}
	var ok4: bool = false
	if es4.size() == 1 and ga != null and gz != null:
		var at4: Vector2 = ga.global_position
		var rows4: Array = await _slw_track(es4[0], at4, 4.0, func(e): return e.global_position.distance_to(at4) / t < 1.2)
		var both4: Array = []
		for r in rows4:
			if (r.src as Array).has(ga.aura_source) and (r.src as Array).has(gz.aura_source):
				both4.append(r)
		var steps4: Array = []
		for r in both4.slice(1):
			steps4.append(snappedf(float(r.dx), 0.0001))
		var bad4: Array = both4.filter(func(r): return not is_equal_approx(float(r.m), 0.9))
		ok4 = both4.size() >= 10 and bad4.is_empty() and ga.aura_source != gz.aura_source and steps4.all(func(x): return absf(float(x) - 1.8) < 1e-3)
		d4 = {"frames_both": both4.size(), "bad": bad4.slice(0, 3), "steps": steps4.slice(0, 5), "sources": [ga.aura_source, gz.aura_source]}
	_check("光環-4 兩個光環涵蓋同一個敵人：兩個不同的來源、倍率 0.9（不是 0.81）、每步 1.8 像素", ok4, d4)

	# 光環-5：和道路阻擋取最強：關羽（光環）在道路 (8,5)，敵人進入範圍前把攻擊冷卻設成 0.6 秒：先只有光環 0.9、被打中後 0.3（光環＋道路兩個來源）、被擋住；
	# 把關羽移到建築格 (8,4) 後道路的來源撤掉、仍在光環範圍 → 0.9、繼續前進；離開光環範圍 → 1、沒有來源
	var es5: Array = await _slw_start(rec, "aura-5", [_grp("slw_walk", 1, 0.02)], 1, [_aura_guan()], {"guan_yu": Vector2i(8, 5)})
	var g5: Node = _fly_hero("guan_yu")
	var d5: Dictionary = {}
	var ok5: bool = false
	if es5.size() == 1 and g5 != null:
		var e5: Node = es5[0]
		var at5: Vector2 = g5.global_position
		var R5: float = g5.attack_range
		# 進入範圍前把攻擊冷卻設成 0.6 秒：先有一段只有光環（還沒被打中）的時間
		await _slw_track(e5, at5, 5.0, func(e): return e.global_position.distance_to(at5) / t < R5 + 0.3)
		g5._atk_timer = 0.6
		var rows5: Array = await _slw_track(e5, at5, 8.0, func(e): return e.is_fighting_blocker())
		var aura_only: int = 0
		var both5: int = 0
		for r in rows5:
			var s: Array = r.src
			if s == [g5.aura_source] and is_equal_approx(float(r.m), 0.9):
				aura_only += 1
			if s.size() == 2 and s.has(g5.aura_source) and s.has(g5.slow_source) and is_equal_approx(float(r.m), 0.3):
				both5 += 1
		var blocked: bool = e5.is_fighting_blocker()
		main.game_map.clear_occupied(Vector2i(8, 5))
		g5.reposition(Vector2i(8, 4), main.game_map.grid_to_world(Vector2i(8, 4)), main.game_map)
		main.game_map.set_occupied(Vector2i(8, 4), g5)
		await physics_frame
		await process_frame
		await physics_frame
		var mid: Array = [snappedf(e5.speed_mult, 0.0001), e5.slow_sources_state().keys() == [g5.aura_source], e5.is_fighting_blocker()]
		var at5b: Vector2 = g5.global_position
		var rows5b: Array = await _slw_track(e5, at5b, 6.0, func(e): return e.global_position.distance_to(at5b) / t > R5 + 0.3)
		await physics_frame
		await process_frame
		await physics_frame
		var end5: Array = [e5.speed_mult, e5.slow_sources_state().is_empty()] if is_instance_valid(e5) else [-1.0, false]
		ok5 = aura_only >= 3 and both5 >= 3 and blocked and mid == [0.9, true, false] and rows5b.size() > 5 and end5 == [1.0, true]
		d5 = {"aura_only_frames": aura_only, "aura_and_road_frames": both5, "blocked": blocked, "after_move": mid, "end": end5}
	_check("光環-5 和道路阻擋取最強：先只有光環 0.9，被打中後光環＋道路兩個來源、0.3、被擋住；關羽移到建築格後只剩光環 0.9、不再被擋；離開光環範圍後 1、沒有來源",
		ok5, d5)

	# 光環-6：移位、升級、移除、倒下、新的一場（不會移動的敵人 A 在 3.3 格、B 在 1 格；關羽的射程成長 0.5，2 級時 3.5 格）：
	# 1 級只有 B；升到 2 級（隊伍更新）後 A 也有；移到遠處 (1,4) 後兩個都沒有；移回來兩個都有；從隊伍移除後兩個都沒有；
	# 重新放置後兩個都有，關羽倒下後兩個都沒有；新的一場的敵人沒有來源
	var hc6: Array = [{"hero_id": "guan_yu", "name": "關羽", "job": "infantry", "attack_range": 3.0, "attack_speed": 0.5, "range_growth": 0.5}]
	var es6: Array = await _slw_start(rec, "aura-6", [_grp("slw_post", 2, 0.02)], 2, [_aura_guan()], {"guan_yu": Vector2i(6, 4)}, [], hc6)
	var g6: Node = _fly_hero("guan_yu")
	var d6: Dictionary = {}
	var ok6: bool = false
	if es6.size() == 2 and g6 != null:
		g6._atk_timer = 999.0
		var base6: Vector2 = main.game_map.grid_to_world(Vector2i(6, 4))
		es6[0].global_position = base6 + Vector2(3.3, 0.0) * t
		es6[1].global_position = base6 + Vector2(0.0, 1.0) * t
		var has := func() -> Array:
			var h: Node = _fly_hero("guan_yu")
			var src: String = h.aura_source if h != null else "none"
			return [es6[0].has_slow_from(src), es6[1].has_slow_from(src), es6[0].slow_sources_state().size(), es6[1].slow_sources_state().size()]
		var steps: Dictionary = {}
		for i in range(3):
			await process_frame
			await physics_frame
		steps["lv1"] = has.call()
		var lv2: Dictionary = _aura_guan()
		lv2["level"] = 2
		_r19_js(rec, {"type": "update_team", "team_list": [lv2]})
		for i in range(3):
			await process_frame
			await physics_frame
		steps["lv2"] = has.call()
		steps["lv2_radius"] = g6.attack_range
		main.game_map.clear_occupied(Vector2i(6, 4))
		g6.reposition(Vector2i(1, 4), main.game_map.grid_to_world(Vector2i(1, 4)), main.game_map)
		main.game_map.set_occupied(Vector2i(1, 4), g6)
		for i in range(3):
			await process_frame
			await physics_frame
		steps["moved_away"] = has.call()
		main.game_map.clear_occupied(Vector2i(1, 4))
		g6.reposition(Vector2i(6, 4), base6, main.game_map)
		main.game_map.set_occupied(Vector2i(6, 4), g6)
		for i in range(3):
			await process_frame
			await physics_frame
		steps["moved_back"] = has.call()
		var src6: String = g6.aura_source
		_r19_js(rec, {"type": "update_team", "team_list": []})
		for i in range(3):
			await process_frame
			await physics_frame
		steps["removed"] = [es6[0].has_slow_from(src6), es6[1].has_slow_from(src6), es6[0].slow_sources_state().size(), es6[1].slow_sources_state().size()]
		_r19_js(rec, {"type": "update_team", "team_list": [lv2]})
		_r12_place("guan_yu", Vector2i(6, 4))
		var g6b: Node = _fly_hero("guan_yu")
		if g6b != null:
			g6b._atk_timer = 999.0
		for i in range(3):
			await process_frame
			await physics_frame
		steps["replaced"] = has.call()
		steps["new_source"] = g6b != null and g6b.aura_source != src6
		var src6b: String = g6b.aura_source if g6b != null else ""
		if g6b != null:
			g6b.take_damage(1.0e9)
		for i in range(3):
			await process_frame
			await physics_frame
		steps["died"] = [es6[0].has_slow_from(src6b), es6[1].has_slow_from(src6b), es6[0].slow_sources_state().size(), es6[1].slow_sources_state().size(), _fly_hero("guan_yu") == null]
		var es6n: Array = await _slw_start(rec, "aura-6b", [_grp("slw_post", 2, 0.02)], 2, [_aura_guan()])
		steps["new_battle"] = es6n.map(func(e): return e.slow_sources_state().size())
		ok6 = steps.lv1 == [false, true, 0, 1] and steps.lv2 == [true, true, 1, 1] and is_equal_approx(float(steps.lv2_radius), 3.5) and steps.moved_away == [false, false, 0, 0] \
			and steps.moved_back == [true, true, 1, 1] and steps.removed == [false, false, 0, 0] and steps.replaced == [true, true, 1, 1] and steps.new_source \
			and steps.died == [false, false, 0, 0, true] and steps.new_battle == [0, 0]
		d6 = steps
	_check("光環-6 移位、升級、移除、倒下、新的一場：1 級只有 1 格的敵人；2 級（半徑 3.5）3.3 格的也有；移到遠處都沒有、移回來都有；從隊伍移除後都沒有；重新放置（新的來源）都有、倒下後都沒有；新的一場的敵人沒有來源",
		ok6, d6)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 劉備「防禦光環」 ──────────────────────────────────────────
# 以劉備為中心、目前有效射程內（含邊界）的其他存活武將防禦 × 1.2；受傷照原本的防禦公式、用提高後的防禦計算（不是直接少扣 20%）；
# 不含自己與防禦塔；多個防禦光環取最強、不相乘不累加；只在戰鬥中；移位、升級、移除、倒下、戰鬥結束、新的一場都撤除，不寫回 def_stat

## 劉備的防禦光環（和網頁 utils/heroSkills 的出征參數相同）
const DEF_AURA_SKILL: Dictionary = {"id": "def_aura", "def_mult": 1.2}
## 攻擊力 100 打防禦 100 的武將：沒有加成扣 50；有加成（防禦 120）扣 10000 ÷ 220；只有 1.1 的加成（防禦 110）扣 10000 ÷ 210
const DEF_HIT_PLAIN: float = 50.0
const DEF_HIT_AURA: float = 10000.0 / 220.0
const DEF_HIT_WEAK: float = 10000.0 / 210.0

## 實際引擎用的敵人：攻擊力 100 的快速地面兵（普通與免疫減速）、不會移動的地面兵（讓戰鬥持續、不會被打到）
const DEF_ENEMIES: Array = [
	{"enemy_id": "def_run", "name": "R", "hp": 99999.0, "speed": 240.0, "atk": 100},
	{"enemy_id": "def_run_imm", "name": "I", "hp": 99999.0, "speed": 240.0, "atk": 100, "trait": "immune_slow"},
	{"enemy_id": "def_post", "name": "P", "hp": 99999.0, "speed": 0.0},
]

## 出征的武將：防禦 100、血量 1,000,000（被打很多下也不會倒）
func _def_hero(hid: String, skill: Variant = null, slot: int = 1) -> Dictionary:
	var h: Dictionary = _r12_hero(hid, skill)
	h["def"] = 100.0
	h["hp"] = 1000000.0
	h["slot"] = slot
	return h

## 實際引擎：載入一場（經過 JSON）並依 cells 的順序放置武將（hero_id → 格子）、放置防禦塔（[種類, 格子]），不開戰。
## 劉備與另一位帶防禦光環的測試武將 def_b 射程 3 格（劉備的射程成長 0.5）；def_a／def_c／def_d 射程 0.3 格（擋住的敵人打不到，不會打倒它）
func _def_load(rec: Node, battle_id: String, waves: Array, team: Array, cells: Dictionary, towers: Array = []) -> void:
	var p: Dictionary = _r12_payload("def_" + battle_id, waves, battle_id, team)
	p["heroes_config"] = [
		{"hero_id": "liu_bei", "name": "劉備", "job": "infantry", "attack_range": 3.0, "attack_speed": 0.5, "range_growth": 0.5},
		{"hero_id": "def_b", "name": "B", "job": "cavalry", "attack_range": 3.0, "attack_speed": 0.5},
		{"hero_id": "def_a", "name": "A", "job": "infantry", "attack_range": 0.3, "attack_speed": 0.5},
		{"hero_id": "def_c", "name": "C", "job": "archer", "attack_range": 0.3, "attack_speed": 0.5},
		{"hero_id": "def_d", "name": "D", "job": "mage", "attack_range": 0.3, "attack_speed": 0.5},
	]
	for c in DEF_ENEMIES:
		p["enemies_config"].append(c.duplicate())
	_r19_js(rec, p)
	for hid in cells:
		_r12_place(hid, cells[hid])
	for t in towers:
		main._on_web_place_tower({"tower_type": t[0], "cell_x": t[1].x, "cell_y": t[1].y})

## 等 n 個一般幀＋物理步進（光環每一幀更新）
func _def_frames(n: int = 3) -> void:
	for i in range(n):
		await process_frame
		await physics_frame

## 場上武將受到的防禦加成（hero_id → 倍率；不在場上是 -1）
func _def_bonus(ids: Array) -> Array:
	var out: Array = []
	for hid in ids:
		var h: Node = _fly_hero(hid)
		out.append(snappedf(h.def_bonus_mult, 0.0001) if h != null else -1.0)
	return out

## 實際引擎：開戰、等被 def_a 擋住的敵人，記錄 sec 秒（物理時鐘）內每一擊讓 def_a 扣的血
func _def_hits(e: Node, sec: float) -> Array:
	var a: Node = _fly_hero("def_a")
	if e == null or a == null:
		return []
	await _wait_until(func(): return is_instance_valid(e) and e._blocker != null, 5.0)
	var tr: Dictionary = await _dodge_track(e, a, sec)
	return tr.ev.map(func(x): return float(x.lost))

func _def_all(xs: Array, v: float) -> bool:
	return not xs.is_empty() and xs.all(func(x): return absf(float(x) - v) < 0.0002)

func _def_aura_cases() -> void:
	# 防禦-0：技能參數的判讀：def_mult 是大於 1 的有限數字才啟用；字串、1、0.8、0、負數、布林、null、NaN、無限大、沒有欄位、不認得的 id 都不啟用；
	# 減速光環不是防禦光環；經過 JSON 的 1.2 照用；防禦光環不帶其他技能
	var h0: Node = load("res://entities/hero/Hero.gd").new()
	var bad0: Array = []
	for c in [[{"id": "def_aura", "def_mult": 1.2}, 1.2], [{"id": "def_aura", "def_mult": 2}, 2.0], [{"id": "def_aura", "def_mult": "1.2"}, 1.0],
			[{"id": "def_aura", "def_mult": 1}, 1.0], [{"id": "def_aura", "def_mult": 1.0}, 1.0], [{"id": "def_aura", "def_mult": 0.8}, 1.0],
			[{"id": "def_aura", "def_mult": 0}, 1.0], [{"id": "def_aura", "def_mult": -1.2}, 1.0], [{"id": "def_aura", "def_mult": true}, 1.0],
			[{"id": "def_aura", "def_mult": null}, 1.0], [{"id": "def_aura", "def_mult": NAN}, 1.0], [{"id": "def_aura", "def_mult": INF}, 1.0],
			[{"id": "def_aura"}, 1.0], [{"id": "def_aura_x", "def_mult": 1.2}, 1.0], [{"id": "heal", "def_mult": 1.2}, 1.0],
			[{"id": "slow_aura", "slow_mult": 0.9}, 1.0], [null, 1.0]]:
		var st: Dictionary = {} if c[0] == null else {"skill": c[0]}
		h0._read_skill(st)
		var want_slow: bool = c[0] != null and c[0].get("id") == "slow_aura"
		if not is_equal_approx(h0.def_aura_mult, float(c[1])) or (h0.slow_aura_mult < 1.0) != want_slow:
			bad0.append(str(c[0]))
	h0._read_skill({"skill": JSON.parse_string("{\"id\": \"def_aura\", \"def_mult\": 1.2}")})
	var json0: float = h0.def_aura_mult
	var other0: Array = [h0.slow_aura_mult, h0.dodge_chance, h0.first_strike_multiplier, h0.range_multiplier, h0.burn_ratio, h0.sweep_ratio]
	h0.free()
	_check("防禦-0 技能參數：def_mult 1.2、2 啟用；字串、1、0.8、0、負數、布林、null、NaN、無限大、沒有欄位、不認得的 id 都不啟用；減速光環不是防禦光環；經過 JSON 的 1.2 照用、不帶其他技能",
		bad0.is_empty() and is_equal_approx(json0, 1.2) and other0 == [1.0, 0.0, 1.0, 1.0, 0.0, 0.0], {"bad": bad0, "json": json0, "other": other0})

	# 防禦-1：受傷公式（單獨的武將，不經過 Main；劉備射程 3 格）：防禦 100 的武將被打 100 → 沒有加成扣 50；
	# 劉備的光環作用後扣 10000 ÷ 220 ≈ 45.4545（不是直接少扣 20% 的 40），def_stat 仍是 100、有效防禦 120；光環再更新 10 次仍是 45.4545（不疊乘）；
	# 劉備自己被打 100 仍扣 50（不含自己）；防禦 0 的武將有加成也扣 100；會閃避的武將（抽樣 0、0.9）先判定閃避：第一擊不扣血、第二擊 45.4545；
	# 劉備不再更新後，加成照遊戲時間 0.5 秒到期（0.3 秒時還在、0.55 秒時沒有）
	var holder := _dodge_holder()
	var t: float = float(main._tile_size)
	var mk := func(def: float, pos: Vector2) -> Node:
		var h: Node = load("res://entities/hero/Hero.gd").new()
		holder.add_child(h)
		h.set_process(false)
		h.tile_size = int(t)
		h.max_hp = 1000000.0
		h.current_hp = 1000000.0
		h.def_stat = def
		h.position = pos
		return h
	var hit := func(h: Node) -> float:
		var hp0: float = h.current_hp
		h.take_damage(100.0)
		return snappedf(hp0 - h.current_hp, 0.0001)
	var lb1: Node = mk.call(100.0, Vector2(t, 0.0))
	lb1.hero_id = "liu_bei"
	lb1.attack_range = 3.0
	lb1._read_skill({"skill": DEF_AURA_SKILL.duplicate()})
	var a1: Node = mk.call(100.0, Vector2.ZERO)
	var z1: Node = mk.call(0.0, Vector2(0.0, t))
	var d1: Node = mk.call(100.0, Vector2(0.0, -t))
	d1.dodge_chance = 0.15
	d1.dodge_roll_override = _dodge_seq({"i": 0, "us": [0.0, 0.9]})
	var plain1: float = hit.call(a1)
	lb1._update_def_aura()
	var aura1: float = hit.call(a1)
	var eff1: float = a1.effective_def()
	for i in range(10):
		lb1._update_def_aura()
		a1._tick_def_sources(1.0 / 60.0)
	var aura1b: float = hit.call(a1)
	var self1: float = hit.call(lb1)
	var zero1: float = hit.call(z1)
	var dodge1: Array = [hit.call(d1), hit.call(d1)]
	a1._tick_def_sources(0.3)
	var ttl_mid: float = a1.def_bonus_mult
	a1._tick_def_sources(0.25)
	var ttl_end: float = a1.def_bonus_mult
	var aura_hit: float = snappedf(DEF_HIT_AURA, 0.0001)
	var ok1: bool = plain1 == DEF_HIT_PLAIN and is_equal_approx(aura1, aura_hit) and is_equal_approx(aura1b, aura_hit) and a1.def_stat == 100.0 and is_equal_approx(eff1, 120.0) \
		and self1 == DEF_HIT_PLAIN and lb1.def_bonus_mult == 1.0 and zero1 == 100.0 and is_equal_approx(z1.def_bonus_mult, 1.2) \
		and dodge1[0] == 0.0 and is_equal_approx(float(dodge1[1]), aura_hit) and d1.dodge_rolls == 2 and is_equal_approx(ttl_mid, 1.2) and ttl_end == 1.0
	_check("防禦-1 受傷公式：防禦 100 被打 100 沒有加成扣 50、劉備的光環作用後扣 45.4545（有效防禦 120，不是直接少扣 20% 的 40）、def_stat 仍是 100；更新 10 次仍是 45.4545；劉備自己仍扣 50；防禦 0 的有加成也扣 100；會閃避的先判定（第一擊閃避不扣、第二擊 45.4545）；停止更新後 0.3 秒還在、0.55 秒到期",
		ok1, {"plain": plain1, "aura": aura1, "aura_after_10": aura1b, "def_stat": a1.def_stat, "effective": eff1, "self": [self1, lb1.def_bonus_mult], "def0": [zero1, z1.def_bonus_mult],
			"dodge": [dodge1, d1.dodge_rolls], "ttl": [ttl_mid, ttl_end]})

	# 防禦-2：兩個來源（1.2 與 1.1）：兩種套用順序都是 1.2（不是相乘的 1.32）；撤掉強的剩 1.1、扣 10000 ÷ 210 ≈ 47.619；同一個來源重複套用只刷新（仍 1 個來源）；
	# 撤除不存在的來源不影響；無效的套用（倍率 0.9、1、NaN、有效期 0、空的來源）都不算；撤掉弱的回到 1、扣 50
	var a2: Node = mk.call(100.0, Vector2(20.0 * t, 20.0 * t))
	var orders: Array = []
	for order in [["s", "w"], ["w", "s"]]:
		for k in order:
			a2.apply_def_from("src_" + k, 1.2 if k == "s" else 1.1, 0.5)
		orders.append(snappedf(a2.def_bonus_mult, 0.0001))
		a2.remove_def_from("src_s")
		a2.remove_def_from("src_w")
	a2.apply_def_from("src_s", 1.2, 0.5)
	a2.apply_def_from("src_w", 1.1, 0.5)
	a2.remove_def_from("src_s")
	var weak2: Array = [snappedf(a2.def_bonus_mult, 0.0001), hit.call(a2)]
	for i in range(3):
		a2.apply_def_from("src_w", 1.1, 0.5)
	a2.remove_def_from("src_none")
	for bad in [["x1", 0.9, 0.5], ["x2", 1.0, 0.5], ["x3", NAN, 0.5], ["x4", 1.5, 0.0], ["", 1.5, 0.5]]:
		a2.apply_def_from(bad[0], bad[1], bad[2])
	var kept2: Array = [a2._def_sources.keys(), snappedf(a2.def_bonus_mult, 0.0001)]
	a2.remove_def_from("src_w")
	var none2: Array = [a2.def_bonus_mult, hit.call(a2), a2._def_sources.size()]
	holder.queue_free()
	_check("防禦-2 兩個來源（1.2 與 1.1）：兩種套用順序都是 1.2（不相乘）；撤掉強的剩 1.1、扣 47.619；重複套用只刷新、撤除不存在的來源不影響、無效的套用不算；撤掉弱的回到 1、扣 50",
		orders == [1.2, 1.2] and weak2[0] == 1.1 and is_equal_approx(float(weak2[1]), snappedf(DEF_HIT_WEAK, 0.0001)) and kept2 == [["src_w"], 1.1] and none2 == [1.0, DEF_HIT_PLAIN, 0],
		{"orders": orders, "weak": weak2, "kept": kept2, "none": none2})

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)

	# 防禦-3：範圍與對象（實際引擎；劉備在建築格 (6,4)、射程 3 格，唯一的敵人不會移動、在範圍外 → 劉備沒有攻擊目標）：
	# 備戰時不作用；開戰後正好 3 格（含邊界）與 1 格的友軍 1.2，3.02 格的 1；劉備自己 1；範圍內的防禦塔不列入；
	# 快照與升級面板：劉備的光環作用中、倍率 1.2、半徑 3、加成 def_a 與 def_d；def_a 原本的防禦 100、有效防禦 120，def_c 100／100
	var team3: Array = [_def_hero("liu_bei", DEF_AURA_SKILL.duplicate(), 1), _def_hero("def_a", null, 2), _def_hero("def_c", null, 3), _def_hero("def_d", null, 4)]
	_def_load(rec, "def-3", [[_grp("def_post", 1, 0.02)]], team3, {"liu_bei": Vector2i(6, 4), "def_a": Vector2i(1, 4), "def_c": Vector2i(2, 4), "def_d": Vector2i(3, 4)}, [["archer", Vector2i(6, 6)]])
	await _def_frames()
	var prep3: Array = _def_bonus(["def_a", "def_c", "def_d", "liu_bei"])
	var lb3: Node = _fly_hero("liu_bei")
	var prep_active3: bool = lb3.def_state().aura_active if lb3 != null else true
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() >= 1, 5.0)
	var d3: Dictionary = {}
	var ok3: bool = false
	if lb3 != null and _fly_hero("def_a") != null and _fly_hero("def_c") != null and _fly_hero("def_d") != null:
		lb3._atk_timer = 999.0
		var R: float = lb3.attack_range * t
		var c3: Vector2 = lb3.global_position
		_fly_hero("def_a").global_position = c3 + Vector2(R, 0.0)
		_fly_hero("def_c").global_position = c3 + Vector2(R + 0.02 * t, 0.0)
		_fly_hero("def_d").global_position = c3 + Vector2(0.0, 1.0) * t
		await _def_frames(4)
		var got3: Array = _def_bonus(["def_a", "def_c", "def_d", "liu_bei"])
		var snap3: Dictionary = _fly_snapshot(rec)
		var hd: Dictionary = snap3.get("hero_def", {})
		var lbs: Dictionary = hd.get("liu_bei", {})
		var np: int = rec.sent_panels.size()
		main._on_hero_clicked(_fly_hero("def_a"))
		var panel_a: Dictionary = rec.sent_panels.back() if rec.sent_panels.size() > np else {}
		main._on_hero_clicked(_fly_hero("def_c"))
		var panel_c: Dictionary = rec.sent_panels.back() if rec.sent_panels.size() > np + 1 else {}
		main._deselect_unit()
		var towers3: int = _slw_towers().size()
		ok3 = prep3 == [1.0, 1.0, 1.0, 1.0] and prep_active3 == false and got3 == [1.2, 1.0, 1.2, 1.0] and towers3 == 1 \
			and lbs.get("aura_active") == true and is_equal_approx(float(lbs.get("aura_mult", 0.0)), 1.2) and is_equal_approx(float(lbs.get("radius", 0.0)), 3.0) and lbs.get("buffed") == ["def_a", "def_d"] \
			and is_equal_approx(float(hd.get("def_a", {}).get("def", 0.0)), 100.0) and is_equal_approx(float(hd.get("def_a", {}).get("effective", 0.0)), 120.0) \
			and is_equal_approx(float(hd.get("def_c", {}).get("effective", 0.0)), 100.0) and lb3.current_hp == lb3.max_hp \
			and is_equal_approx(float(panel_a.get("def", 0.0)), 100.0) and is_equal_approx(float(panel_a.get("def_effective", 0.0)), 120.0) \
			and is_equal_approx(float(panel_c.get("def", 0.0)), 100.0) and is_equal_approx(float(panel_c.get("def_effective", 0.0)), 100.0)
		d3 = {"prep": prep3, "prep_active": prep_active3, "edge_3/out_3_02/one/self": got3, "towers": towers3, "liu_bei": lbs, "def_a": hd.get("def_a"), "def_c": hd.get("def_c"),
			"panel_a": [panel_a.get("def"), panel_a.get("def_effective")], "panel_c": [panel_c.get("def"), panel_c.get("def_effective")]}
	_check("防禦-3 範圍與對象：備戰時不作用；開戰後正好 3 格（含邊界）與 1 格的友軍 1.2、3.02 格的 1、劉備自己 1；範圍內的防禦塔不列入；快照光環作用中、倍率 1.2、半徑 3、加成 def_a 與 def_d；升級面板 def_a 原本 100、有效 120，範圍外的 def_c 100／100",
		ok3, d3)

	# 防禦-4：實際受傷（被 def_a 擋在道路 (4,5) 的敵人，攻擊力 100，劉備在 (6,4)、距離 √5 格）：
	# 沒有劉備每擊扣 50；有劉備每擊 45.4545；免疫減速的敵人也是 45.4545（不會忽略防禦），敵人的攻擊力仍是 100；
	# 2 倍速每擊仍是 45.4545；手動暫停 1 秒（牆鐘）後加成仍在、只有 1 個來源，繼續後每擊 45.4545
	var d4: Dictionary = {}
	_def_load(rec, "def-4a", [[_grp("def_run", 1, 0.02)]], [_def_hero("def_a", null, 2)], {"def_a": Vector2i(4, 5)})
	_bm().player_start_battle()
	await _wait_until(func(): return _first_enemy() != null, 5.0)
	d4["plain"] = await _def_hits(_first_enemy(), 2.2)
	var team4: Array = [_def_hero("liu_bei", DEF_AURA_SKILL.duplicate(), 1), _def_hero("def_a", null, 2)]
	_def_load(rec, "def-4b", [[_grp("def_run", 1, 0.02)]], team4, {"liu_bei": Vector2i(6, 4), "def_a": Vector2i(4, 5)})
	_bm().player_start_battle()
	await _wait_until(func(): return _first_enemy() != null, 5.0)
	var e4: Node = _first_enemy()
	d4["aura"] = await _def_hits(e4, 2.2)
	d4["enemy_atk"] = e4.blocker_atk if is_instance_valid(e4) else -1.0
	_r19_speed(rec, 2.0)
	d4["x2"] = await _def_hits(e4, 2.2)
	_r19_speed(rec, 1.0)
	_r20_pause(rec, true)
	await _wait_real(1.0)
	var a4: Node = _fly_hero("def_a")
	d4["paused"] = [snappedf(a4.def_bonus_mult, 0.0001), a4._def_sources.size()] if a4 != null else []
	_r20_pause(rec, false)
	d4["after_pause"] = await _def_hits(e4, 2.2)
	_def_load(rec, "def-4c", [[_grp("def_run_imm", 1, 0.02)]], team4, {"liu_bei": Vector2i(6, 4), "def_a": Vector2i(4, 5)})
	_bm().player_start_battle()
	await _wait_until(func(): return _first_enemy() != null, 5.0)
	var e4i: Node = _first_enemy()
	d4["immune"] = await _def_hits(e4i, 2.2)
	d4["immune_enemy"] = [e4i.immune_slow, e4i.blocker_atk] if is_instance_valid(e4i) else []
	_check("防禦-4 實際受傷（攻擊力 100 打防禦 100 的阻路武將）：沒有劉備每擊 50；有劉備每擊 45.4545；免疫減速的敵人也是 45.4545、敵人攻擊力仍是 100；2 倍速仍是 45.4545；暫停 1 秒後加成仍在（1 個來源）、繼續後 45.4545",
		_def_all(d4.plain, DEF_HIT_PLAIN) and _def_all(d4.aura, DEF_HIT_AURA) and d4.enemy_atk == 100.0 and _def_all(d4.x2, DEF_HIT_AURA) and d4.paused == [1.2, 1]
			and _def_all(d4.after_pause, DEF_HIT_AURA) and _def_all(d4.immune, DEF_HIT_AURA) and d4.immune_enemy == [true, 100.0], d4)

	# 防禦-5：兩個防禦光環（劉備 1.2、測試武將 def_b 1.1，都涵蓋被擋住的 def_a），兩種放置順序：def_a 1.2、兩個來源、每擊 45.4545；
	# 兩位光環武將互相加成、不加自己（劉備 1.1、def_b 1.2）；把劉備從隊伍移除後 def_a 剩 1.1（只剩 def_b 的來源）、每擊 47.619；再移除 def_b 回到 1、每擊 50
	var d5: Dictionary = {}
	var ok5: bool = true
	var weak_skill: Dictionary = {"id": "def_aura", "def_mult": 1.1}
	for order in [["liu_bei", "def_b"], ["def_b", "liu_bei"]]:
		var team5: Array = [_def_hero("liu_bei", DEF_AURA_SKILL.duplicate(), 1), _def_hero("def_b", weak_skill.duplicate(), 2), _def_hero("def_a", null, 3)]
		var cells5: Dictionary = {}
		cells5[order[0]] = Vector2i(6, 4) if order[0] == "liu_bei" else Vector2i(3, 4)
		cells5[order[1]] = Vector2i(6, 4) if order[1] == "liu_bei" else Vector2i(3, 4)
		cells5["def_a"] = Vector2i(4, 5)
		_def_load(rec, "def-5-" + order[0], [[_grp("def_run", 1, 0.02)]], team5, cells5)
		_bm().player_start_battle()
		await _wait_until(func(): return _first_enemy() != null, 5.0)
		var e5: Node = _first_enemy()
		var both: Array = await _def_hits(e5, 2.2)
		var a5: Node = _fly_hero("def_a")
		var src5: int = a5._def_sources.size() if a5 != null else -1
		var mutual: Array = _def_bonus(["def_a", "liu_bei", "def_b"])
		var r: Dictionary = {"hits": both.slice(0, 3), "sources": src5, "a/liu_bei/def_b": mutual}
		ok5 = ok5 and _def_all(both, DEF_HIT_AURA) and src5 == 2 and mutual == [1.2, 1.1, 1.2]
		if order[0] == "liu_bei":
			_r19_js(rec, {"type": "update_team", "team_list": [team5[1], team5[2]]})
			await _def_frames()
			var weak: Array = [_def_bonus(["def_a"])[0], _fly_hero("def_a")._def_sources.size() if _fly_hero("def_a") != null else -1]
			var weak_hits: Array = await _def_hits(e5, 2.2)
			_r19_js(rec, {"type": "update_team", "team_list": [team5[2]]})
			await _def_frames()
			var none: Array = [_def_bonus(["def_a"])[0], _fly_hero("def_a")._def_sources.size() if _fly_hero("def_a") != null else -1]
			var none_hits: Array = await _def_hits(e5, 2.2)
			r["removed_liu_bei"] = {"bonus/sources": weak, "hits": weak_hits.slice(0, 3)}
			r["removed_both"] = {"bonus/sources": none, "hits": none_hits.slice(0, 3)}
			ok5 = ok5 and weak == [1.1, 1] and _def_all(weak_hits, DEF_HIT_WEAK) and none == [1.0, 0] and _def_all(none_hits, DEF_HIT_PLAIN)
		d5[",".join(order)] = r
	_check("防禦-5 兩個防禦光環（1.2 與 1.1）兩種放置順序：def_a 1.2、兩個來源、每擊 45.4545；兩位光環武將互相加成、不加自己（劉備 1.1、def_b 1.2）；移除劉備後剩 1.1（1 個來源）、每擊 47.619；再移除 def_b 回到 1、每擊 50",
		ok5, d5)

	# 防禦-6：升級、移位、戰鬥結束、倒下、移除、新的一場（兩波，每波一個不會移動的敵人；劉備 (6,4)，def_a 在 3.3 格、def_c 在 1 格；劉備的射程成長 0.5，2 級時 3.5 格）：
	# 1 級只有 def_c；劉備升到 2 級後兩位都有；def_a 的防禦更新成 150（有效 180），同樣的資料再送一次仍是 150／180、改成 160 是 160／192（不殘留、不膨脹）；
	# 劉備移到遠處 (1,6) 兩位都沒有、移回來都有；第 1 波打完回到備戰時都沒有、光環不作用，開第 2 波又有；
	# def_c 倒下後劉備只加成 def_a；把劉備從隊伍移除後都沒有；重新放置（新的來源）又有；第 2 波打完（結算）後都沒有；
	# 新的一場的武將沒有來源，開戰後有，劉備倒下後都沒有
	var d6: Dictionary = {}
	var ok6: bool = false
	var team6: Array = [_def_hero("liu_bei", DEF_AURA_SKILL.duplicate(), 1), _def_hero("def_a", null, 2), _def_hero("def_c", null, 3)]
	_def_load(rec, "def-6", [[_grp("def_post", 1, 0.02)], [_grp("def_post", 1, 0.02)]], team6, {"liu_bei": Vector2i(6, 4), "def_a": Vector2i(1, 4), "def_c": Vector2i(2, 4)})
	_bm().player_start_battle()
	await _wait_until(func(): return _sw_enemies().size() >= 1, 5.0)
	var lb6: Node = _fly_hero("liu_bei")
	if lb6 != null and _fly_hero("def_a") != null and _fly_hero("def_c") != null:
		var base6: Vector2 = main.game_map.grid_to_world(Vector2i(6, 4))
		_fly_hero("def_a").global_position = base6 + Vector2(3.3, 0.0) * t
		_fly_hero("def_c").global_position = base6 + Vector2(0.0, 1.0) * t
		var ac: Array = ["def_a", "def_c"]
		await _def_frames()
		d6["lv1"] = _def_bonus(ac)
		var lv2: Dictionary = team6[0].duplicate()
		lv2["level"] = 2
		_r19_js(rec, {"type": "update_team", "team_list": [lv2, team6[1], team6[2]]})
		await _def_frames()
		d6["lv2"] = _def_bonus(ac) + [lb6.attack_range]
		var a150: Dictionary = team6[1].duplicate()
		a150["def"] = 150.0
		a150["level"] = 2
		_r19_js(rec, {"type": "update_team", "team_list": [lv2, a150, team6[2]]})
		await _def_frames()
		var ha: Node = _fly_hero("def_a")
		d6["def150"] = [ha.def_stat, snappedf(ha.effective_def(), 0.0001)]
		_r19_js(rec, {"type": "update_team", "team_list": [lv2, a150, team6[2]]})
		await _def_frames()
		d6["def150_again"] = [ha.def_stat, snappedf(ha.effective_def(), 0.0001)]
		var a160: Dictionary = a150.duplicate()
		a160["def"] = 160.0
		_r19_js(rec, {"type": "update_team", "team_list": [lv2, a160, team6[2]]})
		await _def_frames()
		d6["def160"] = [ha.def_stat, snappedf(ha.effective_def(), 0.0001)]
		main.game_map.clear_occupied(Vector2i(6, 4))
		lb6.reposition(Vector2i(1, 6), main.game_map.grid_to_world(Vector2i(1, 6)), main.game_map)
		main.game_map.set_occupied(Vector2i(1, 6), lb6)
		await _def_frames()
		d6["moved_away"] = _def_bonus(ac)
		main.game_map.clear_occupied(Vector2i(1, 6))
		lb6.reposition(Vector2i(6, 4), base6, main.game_map)
		main.game_map.set_occupied(Vector2i(6, 4), lb6)
		await _def_frames()
		d6["moved_back"] = _def_bonus(ac)
		for e in _sw_enemies():
			e.take_damage(1.0e9)
		await _wait_until(func(): return _bm().game_state == BattleManager.GameState.PREP, 5.0)
		await _def_frames()
		d6["prep"] = _def_bonus(ac) + [lb6.def_state().aura_active, _bm().game_state]
		_bm().player_start_battle()
		await _wait_until(func(): return _sw_enemies().size() >= 1, 5.0)
		await _def_frames()
		d6["wave2"] = _def_bonus(ac) + [_bm().current_wave]
		_fly_hero("def_c").take_damage(1.0e12)
		await _def_frames()
		d6["def_c_died"] = [lb6.def_state().buffed, _fly_hero("def_c") == null]
		var src6: String = lb6.def_aura_source
		_r19_js(rec, {"type": "update_team", "team_list": [a160, team6[2]]})
		await _def_frames()
		d6["removed"] = [_def_bonus(["def_a"])[0], ha._def_sources.size()]
		_r19_js(rec, {"type": "update_team", "team_list": [lv2, a160, team6[2]]})
		_r12_place("liu_bei", Vector2i(6, 4))
		await _def_frames()
		var lb6b: Node = _fly_hero("liu_bei")
		d6["replaced"] = [_def_bonus(["def_a"])[0], lb6b != null and lb6b.def_aura_source != src6, ha._def_sources.keys() == ([lb6b.def_aura_source] if lb6b != null else [])]
		for e in _sw_enemies():
			e.take_damage(1.0e9)
		await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 5.0)
		await _def_frames()
		d6["result"] = [_def_bonus(["def_a"])[0], lb6b.def_state().aura_active if lb6b != null else null, _bm().game_state]
		_def_load(rec, "def-6b", [[_grp("def_post", 1, 0.02)]], [_def_hero("liu_bei", DEF_AURA_SKILL.duplicate(), 1), _def_hero("def_a", null, 2)], {"liu_bei": Vector2i(6, 4), "def_a": Vector2i(5, 4)})
		await _def_frames()
		var na: Node = _fly_hero("def_a")
		d6["new_prep"] = [na._def_sources.size() if na != null else -1, na.def_stat if na != null else -1.0]
		_bm().player_start_battle()
		await _wait_until(func(): return _sw_enemies().size() >= 1, 5.0)
		await _def_frames()
		d6["new_battle"] = _def_bonus(["def_a"])
		var nl: Node = _fly_hero("liu_bei")
		if nl != null:
			nl.take_damage(1.0e12)
		await _def_frames()
		d6["liu_bei_died"] = [_def_bonus(["def_a"])[0], na._def_sources.size() if na != null else -1, _fly_hero("liu_bei") == null]
		ok6 = d6.lv1 == [1.0, 1.2] and d6.lv2 == [1.2, 1.2, 3.5] and d6.def150 == [150.0, 180.0] and d6.def150_again == [150.0, 180.0] and d6.def160 == [160.0, 192.0] \
			and d6.moved_away == [1.0, 1.0] and d6.moved_back == [1.2, 1.2] and d6.prep == [1.0, 1.0, false, BattleManager.GameState.PREP] and d6.wave2 == [1.2, 1.2, 2] \
			and d6.def_c_died == [["def_a"], true] and d6.removed == [1.0, 0] and d6.replaced == [1.2, true, true] and d6.result == [1.0, false, BattleManager.GameState.RESULT] \
			and d6.new_prep == [0, 100.0] and d6.new_battle == [1.2] and d6.liu_bei_died == [1.0, 0, true]
	_check("防禦-6 升級、移位、戰鬥結束、倒下、移除、新的一場：1 級只有 1 格的友軍、2 級（半徑 3.5）兩位都有；友軍防禦更新成 150 是 150／180、再送一次不變、改成 160 是 160／192；移到遠處都沒有、移回來都有；第 1 波打完回到備戰時都沒有、第 2 波又有；友軍倒下後只加成另一位；移除劉備都沒有、重新放置（新的來源）又有；結算後沒有；新的一場沒有殘留、開戰後有、劉備倒下後沒有",
		ok6, d6)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 張飛「暈眩」 ──────────────────────────────────────────────
# 每次普通攻擊命中、目標被打後還活著時，目標暈眩 0.5 秒（遊戲時間）：不移動、不攻擊阻路的武將，照常受傷與死亡；
# 再次命中取較長的剩餘時間（不累加、不縮短）；不是減速（免疫減速的敵人也會暈眩）；
# 暈眩中減速、灼燒照常計時，攻擊冷卻照常倒數但停在 0（不囤積）；記在敵人身上，張飛移位、被移除、陣亡都不提早解除

## 張飛的暈眩（和網頁 utils/heroSkills 的出征參數相同）
const STUN_SKILL: Dictionary = {"id": "stun", "stun_sec": 0.5}
## 實際引擎用的敵人：慢速地面兵（每秒 20 像素、攻擊力 100、血量很多；普通與免疫減速）、不會移動的飛行兵、血量 80 的慢速地面兵（張飛一擊打倒）
const STUN_ENEMIES: Array = [
	{"enemy_id": "stn_walk", "name": "W", "hp": 99999.0, "speed": 20.0, "atk": 100},
	{"enemy_id": "stn_walk_imm", "name": "I", "hp": 99999.0, "speed": 20.0, "atk": 100, "trait": "immune_slow"},
	{"enemy_id": "stn_fly", "name": "F", "hp": 99999.0, "speed": 0.0, "movement_type": "flying"},
	{"enemy_id": "stn_soft", "name": "S", "hp": 80.0, "speed": 20.0},
]
## 實際引擎的敵人速度（像素／秒）
const STN_SPEED: float = 20.0
## 阻路的張飛（防禦 50）被攻擊力 100 的敵人打一下實際扣的血：100 ×（1 − 50 ÷ 150）
const STN_BLOCK_DMG: float = 100.0 * (1.0 - 50.0 / 150.0)

## 固定步進用的敵人（真正的 Enemy 腳本，不經過場景樹的物理處理）：地面、速度 speed 像素／秒，沿直線往右走 40 格；extra 另外加進設定（例如 trait、hp）
func _stn_enemy(holder: Node, speed: float, extra: Dictionary = {}) -> Node:
	var e: Node = load("res://entities/enemy/Enemy.gd").new()
	holder.add_child(e)
	e.set_physics_process(false)
	var cfg: Dictionary = {"enemy_id": "stn", "hp": 99999.0, "speed": speed}
	cfg.merge(extra, true)
	e.setup(cfg, [Vector2.ZERO, Vector2(40.0 * 48.0, 0.0)])
	return e

## 固定步進 steps 步（步數從 first 起算），每一步之前呼叫 before(i)。記錄：處理前在暈眩的步數、暈眩中卻移動的步數、暈眩外每一步前進的距離、
## 攻擊阻路武將的步數（敵人的攻擊次數增加的地方）、處理後仍在暈眩卻顯示攻擊圖片的步數、一步打兩下以上
func _stn_steps(e: Node, delta: float, steps: int, first: int = 1, before: Callable = Callable()) -> Dictionary:
	var r: Dictionary = {"stunned": [], "moved_in_stun": [], "dx": [], "atk": [], "fight_in_stun": [], "multi": false}
	for i in range(first, first + steps):
		if before.is_valid():
			before.call(i)
		if e.is_dead():
			break
		var was: bool = e.is_stunned()
		var x0: float = e.position.x
		var n: int = e.blocker_attacks
		e._physics_process(delta)
		var dx: float = e.position.x - x0
		if was:
			r.stunned.append(i)
			if absf(dx) > 1e-9:
				r.moved_in_stun.append(i)
		else:
			r.dx.append(dx)
		if e.blocker_attacks > n:
			r.atk.append(i)
			if e.blocker_attacks > n + 1:
				r.multi = true
		if e.is_stunned() and e.is_fighting_blocker():
			r.fight_in_stun.append(i)
	return r

## 連續的步數分段（[起, 迄] 的清單）
func _stn_runs(xs: Array) -> Array:
	var out: Array = []
	for x in xs:
		if not out.is_empty() and int(out.back()[1]) == int(x) - 1:
			var last: Array = out.back()
			last[1] = int(x)
		else:
			out.append([int(x), int(x)])
	return out

## 每個值都和 v 相差不到 eps（空的清單不算；位置是 32 位元浮點，位移的比較用 1e-4）
func _stn_all(xs: Array, v: float, eps: float = 1e-4) -> bool:
	return not xs.is_empty() and xs.all(func(x): return absf(float(x) - v) < eps)

## 暈眩時間（遊戲時間）介於 sec 與 sec ＋ 一步之間
func _stn_len_ok(dur: float, sec: float, step: float) -> bool:
	return dur >= sec - 1e-6 and dur <= sec + step + 1e-6

## 實際引擎：載入一場（經過 JSON）並依 cells 放置武將（hero_id → 格子），不開戰；towers 是防禦塔（[種類, 格子] 的清單）。
## 張飛射程 zf_range 格、攻擊間隔 1.5 秒
func _stn_load(rec: Node, battle_id: String, waves: Array, team: Array, cells: Dictionary, zf_range: float = 2.5, towers: Array = []) -> void:
	var p: Dictionary = _r12_payload("stn_" + battle_id, waves, battle_id, team)
	p["heroes_config"] = [
		{"hero_id": "zhang_fei", "name": "張飛", "job": "infantry", "attack_range": zf_range, "attack_speed": 1.5},
	]
	for c in STUN_ENEMIES:
		p["enemies_config"].append(c.duplicate())
	_r19_js(rec, p)
	for hid in cells:
		_r12_place(hid, cells[hid])
	for t in towers:
		main._on_web_place_tower({"tower_type": t[0], "cell_x": t[1].x, "cell_y": t[1].y})

## 出征的張飛（攻擊力 100、防禦 50、血量 1,000,000）；skill 是 null 時帶暈眩的參數
func _stn_zf(skill: Variant = null) -> Dictionary:
	var h: Dictionary = _r12_hero("zhang_fei", STUN_SKILL.duplicate() if skill == null else skill)
	h["hp"] = 1000000.0
	return h

## 開戰、等第一個敵人出現，把它放到 cell 的中心再加上 offset 格（沿著直線路線，第 5 列）
func _stn_start(cell: Vector2i, offset: Vector2 = Vector2.ZERO) -> Node:
	_bm().player_start_battle()
	await _wait_until(func(): return _first_enemy() != null, 5.0)
	var e: Node = _first_enemy()
	if e != null:
		e.global_position = main.game_map.grid_to_world(cell) + offset * float(main._tile_size)
	return e

func _stn_read(e: Node, h: Node) -> Dictionary:
	var alive: bool = h != null and is_instance_valid(h)
	return {"st": e.is_stunned(), "x": e.global_position.x, "atk": e.blocker_attacks, "hhp": h.current_hp if alive else 0.0, "ehp": e.current_hp,
		"pt": _pt(), "blk": e._blocker != null, "fight": e.is_fighting_blocker(), "left": e._stun_left, "ts": Engine.time_scale}

## 實際引擎：逐個物理步進記錄敵人 e，直到 stop(rows) 回傳 true、物理時鐘前進 sec 秒或牆鐘逾時。在 physics_frame 信號當下讀取
## （這一步的節點還沒處理；上一步之後的一般幀已處理，張飛的攻擊在一般幀）。每一列是一步：st＝這一步處理前是否暈眩、dx＝這一步前進的距離（格）、
## atk＝攻擊阻路武將的次數增加、lost＝阻路武將 h 扣的血、hit＝這一步到下一步之間敵人被打掉的血、dt＝這一步的物理時鐘長度、t＝這一步之後的物理時鐘、
## after＝下一步處理前是否暈眩、blk／fight＝之後是否被擋住、是否顯示攻擊圖片、left＝之後剩餘的暈眩時間、ts＝讀取時的時間倍率。
## each(row) 在每一列之後呼叫（同步：切換速度、打開部署選單、暫停、移除武將）
func _stn_track(e: Node, h: Node, sec: float, stop: Callable, each: Callable = Callable()) -> Array:
	var rows: Array = []
	var t: float = float(main._tile_size)
	var p_end: float = _pt() + sec
	var w_end: int = Time.get_ticks_msec() + int(sec * 4000.0) + 20000
	await physics_frame
	var prev: Dictionary = _stn_read(e, h)
	while _pt() < p_end and Time.get_ticks_msec() < w_end:
		await physics_frame
		if not is_instance_valid(e) or e.is_queued_for_deletion():
			break
		var cur: Dictionary = _stn_read(e, h)
		var row: Dictionary = {"st": prev.st, "dx": (cur.x - prev.x) / t, "atk": cur.atk - prev.atk, "lost": snappedf(prev.hhp - cur.hhp, 0.0001),
			"hit": snappedf(prev.ehp - cur.ehp, 0.0001), "dt": cur.pt - prev.pt, "t": cur.pt, "after": cur.st, "blk": cur.blk, "fight": cur.fight,
			"left": cur.left, "ts": prev.ts}
		rows.append(row)
		prev = cur
		if each.is_valid():
			each.call(row)
		if stop.call(rows):
			break
	return rows

## 暈眩段（連續 st 為 true 的列）：遊戲時間（dt 的和）、步數、最長的一步、期間最小／最大的時間倍率、dt 為 0 的列數（手動暫停）、
## 其中移動、攻擊的列數；complete＝開始與結束都記錄到（前一列不在暈眩、最後一列之後不在暈眩）
func _stn_segments(rows: Array) -> Array:
	var segs: Array = []
	var i: int = 0
	while i < rows.size():
		if not rows[i].st:
			i += 1
			continue
		var s: Dictionary = {"from": i, "dur": 0.0, "steps": 0, "maxdt": 0.0, "ts_min": 99.0, "ts_max": 0.0, "zero": 0, "moved": 0, "atk": 0}
		var started: bool = i > 0
		while i < rows.size() and rows[i].st:
			var r: Dictionary = rows[i]
			s.dur = float(s.dur) + float(r.dt)
			s.steps = int(s.steps) + 1
			s.maxdt = maxf(float(s.maxdt), float(r.dt))
			if float(r.dt) > 0.0:
				s.ts_min = minf(float(s.ts_min), float(r.ts))
				s.ts_max = maxf(float(s.ts_max), float(r.ts))
			else:
				s.zero = int(s.zero) + 1
			if absf(float(r.dx)) > 1e-9:
				s.moved = int(s.moved) + 1
			if int(r.atk) > 0:
				s.atk = int(s.atk) + 1
			i += 1
		s["to"] = i - 1
		s["complete"] = started and not rows[i - 1].after
		segs.append(s)
	return segs

## 完整暈眩段的摘要（回報用）
func _stn_seg_brief(segs: Array) -> Array:
	return segs.map(func(s): return {"dur": snappedf(float(s.dur), 0.0001), "steps": s.steps, "maxdt": snappedf(float(s.maxdt), 0.0001),
		"ts": [snappedf(float(s.ts_min), 0.01), snappedf(float(s.ts_max), 0.01)], "zero": s.zero, "moved": s.moved, "atk": s.atk})

## 暈眩外、有前進時間的列：每一步前進的距離都是速度 × 這一步的時間（格），回傳不符合的列數
func _stn_bad_moves(rows: Array, speed: float) -> int:
	var t: float = float(main._tile_size)
	var bad: int = 0
	for r in rows:
		if not r.st and float(r.dt) > 0.0 and absf(float(r.dx) - speed * float(r.dt) / t) > 1e-4:
			bad += 1
	return bad

## 數完整的暈眩段（each 用）：st 為 false、after 為 true 時開始，之後 st 為 true、after 為 false 時完成一段
func _stn_count(sc: Dictionary, row: Dictionary) -> void:
	if not row.st and row.after:
		sc.open = true
	elif row.st and not row.after and sc.open:
		sc.open = false
		sc.done = int(sc.done) + 1

func _stun_cases() -> void:
	# 暈眩-0：技能參數的判讀：stun_sec 是正的有限數字才啟用（0.5、1、2.5、經過 JSON 的 0.5）；字串、布林、null、NaN、無限大、0、負數、沒有欄位、
	# 不認得或大小寫不同的 id、其他技能都不啟用；暈眩不帶其他技能，改成沒有技能後清除。Enemy.apply_stun 也拒絕 0、負數、NaN、無限大，倒下的敵人不套用
	var h0: Node = load("res://entities/hero/Hero.gd").new()
	var bad0: Array = []
	for c in [[{"id": "stun", "stun_sec": 0.5}, 0.5], [{"id": "stun", "stun_sec": 1}, 1.0], [{"id": "stun", "stun_sec": 2.5}, 2.5],
			[{"id": "stun", "stun_sec": "0.5"}, 0.0], [{"id": "stun", "stun_sec": true}, 0.0], [{"id": "stun", "stun_sec": null}, 0.0],
			[{"id": "stun", "stun_sec": NAN}, 0.0], [{"id": "stun", "stun_sec": INF}, 0.0], [{"id": "stun", "stun_sec": -INF}, 0.0],
			[{"id": "stun", "stun_sec": 0}, 0.0], [{"id": "stun", "stun_sec": 0.0}, 0.0], [{"id": "stun", "stun_sec": -0.5}, 0.0],
			[{"id": "stun"}, 0.0], [{"id": "stun_x", "stun_sec": 0.5}, 0.0], [{"id": "Stun", "stun_sec": 0.5}, 0.0],
			[{"id": "def_aura", "def_mult": 1.2}, 0.0], [{"id": "slow_aura", "slow_mult": 0.9}, 0.0], [null, 0.0]]:
		var st: Dictionary = {} if c[0] == null else {"skill": c[0]}
		h0._read_skill(st)
		if h0.stun_duration != float(c[1]):
			bad0.append(str(c[0]))
	h0._read_skill({"skill": JSON.parse_string("{\"id\": \"stun\", \"stun_sec\": 0.5}")})
	var json0: float = h0.stun_duration
	var other0: Array = [h0.slow_aura_mult, h0.def_aura_mult, h0.dodge_chance, h0.first_strike_multiplier, h0.range_multiplier, h0.burn_ratio, h0.sweep_ratio]
	h0._read_skill({})
	var cleared0: float = h0.stun_duration
	h0.free()
	var holder := _dodge_holder()
	var e0: Node = _stn_enemy(holder, 60.0)
	var rej0: Array = []
	for v in [0.0, -0.5, NAN, INF, -INF]:
		rej0.append(e0.apply_stun(v))
	var none0: Array = [e0.is_stunned(), e0.stun_count, e0.stun_log.size()]
	var e0d: Node = _stn_enemy(holder, 60.0)
	e0d.take_damage(1.0e9)
	var dead0: bool = e0d.apply_stun(0.5)
	_check("暈眩-0 技能參數：stun_sec 0.5、1、2.5 與經過 JSON 的 0.5 啟用；字串、布林、null、NaN、無限大、0、負數、沒有欄位、不認得或大小寫不同的 id、其他技能都不啟用（當作普通攻擊）；暈眩不帶其他技能、改成沒有技能後清除；敵人拒絕 0、負數、NaN、無限大的暈眩，倒下的敵人不套用",
		bad0.is_empty() and json0 == 0.5 and other0 == [1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0] and cleared0 == 0.0 and rej0 == [false, false, false, false, false]
			and none0 == [false, 0, 0] and dead0 == false,
		{"bad": bad0, "json": json0, "other": other0, "cleared": cleared0, "rejected": rej0, "after_reject": none0, "dead": dead0})

	# 暈眩-1：移動中的敵人（固定步進，真正的 Enemy 程式，速度 60 像素／秒）：步長 1 倍（1/60）、2 倍（2/60）、部署慢速（0.1/60）與不整除的 0.03、0.07。
	# 先走 10 步，第 11 步之前暈眩 0.5 秒：從第 11 步起連續不動，不動的時間（步數 × 步長）介於 0.5 與 0.5 ＋ 一步之間、這段時間一步都沒動；
	# 前後每步都前進 60 × 步長（恢復原本的速度）；暈眩紀錄只有一段、長度和不動的時間相同、剩餘時間歸零
	var rows1: Array = []
	var bad1: Array = []
	for delta in [1.0 / 60.0, 2.0 / 60.0, 0.1 / 60.0, 0.03, 0.07]:
		var e1: Node = _stn_enemy(holder, 60.0)
		var pre: Dictionary = _stn_steps(e1, delta, 10)
		var applied: bool = e1.apply_stun(0.5)
		var mid: Dictionary = _stn_steps(e1, delta, int(ceil(0.5 / delta)) + 12, 11)
		var runs: Array = _stn_runs(mid.stunned)
		var frozen: float = float(mid.stunned.size()) * delta
		var want: float = 60.0 * delta
		var log1: Array = e1.stun_log.duplicate(true)
		var row: Dictionary = {"step": snappedf(delta, 0.000001), "frozen": snappedf(frozen, 0.000001), "runs": runs, "moved_in_stun": mid.moved_in_stun,
			"pre": pre.dx.slice(0, 2).map(func(x): return snappedf(x, 0.000001)), "after": mid.dx.slice(0, 3).map(func(x): return snappedf(x, 0.000001)),
			"log": log1, "left": e1._stun_left}
		rows1.append(row)
		var log_ok: bool = log1.size() == 1 and absf(float(log1[0].to) - float(log1[0].from) - frozen) < 1e-6
		if not (applied and runs.size() == 1 and int(runs[0][0]) == 11 and _stn_len_ok(frozen, 0.5, delta) and mid.moved_in_stun.is_empty()
				and pre.dx.size() == 10 and _stn_all(pre.dx, want) and mid.dx.size() >= 10 and _stn_all(mid.dx, want) and log_ok and e1._stun_left == 0.0):
			bad1.append(row)
		e1.queue_free()
	_check("暈眩-1 移動中的敵人（固定步進，步長 1 倍／2 倍／部署慢速與 0.03／0.07 秒）：暈眩 0.5 秒時從下一步起連續不動，不動的時間介於 0.5 與 0.5 ＋ 一步之間、這段時間一步都沒動；前後每步都前進 60 × 步長（恢復原本的速度）；暈眩紀錄只有一段、長度和不動的時間相同",
		bad1.is_empty() and rows1.size() == 5, {"bad": bad1, "rows": rows1})

	# 暈眩-2：被擋住的敵人（固定步進，真正的 Enemy／Hero 程式；武將防禦 50、每擊扣 13.333，偵測的第 1 步不打、第 2 步打第一擊，沒有暈眩時每 1 秒一擊）：
	# a 冷卻剩約 0.2 秒時暈眩 0.5 秒（每秒 60 步：第 50 步）：暈眩中一步都不攻擊（原本第 62 步的那一擊延後），暈眩結束的下一步打一擊，再下一擊在 1 秒後（差一步以內）；
	#   暈眩中仍被同一位武將擋住、沒有移動、不顯示攻擊圖片；2 倍（2/60）與部署慢速（0.1/60）同樣在冷卻剩約 0.2 秒時暈眩，結果相同
	# b 暈眩 3 秒（冷卻早就好了）：恢復後只打一擊（不補打），下一擊在 1 秒後
	# c 剛打完不久（第 10 步）暈眩 0.5 秒：冷卻在暈眩中照常倒數，攻擊的步數和沒有暈眩時完全相同（第 2、62、122… 步）
	# 每一種都是一步最多一擊、每擊扣 13.333、武將扣的血＝攻擊次數 × 13.333
	var d2: Dictionary = {}
	var ok2: bool = true
	var ref_atk: Array = []
	for spec in [["ref", 1.0 / 60.0, -1, 0.0], ["a", 1.0 / 60.0, 50, 0.5], ["a2x", 2.0 / 60.0, 2 + int(ceil(0.8 * 30.0)), 0.5],
			["a01", 0.1 / 60.0, 2 + int(ceil(0.8 * 600.0)), 0.5], ["b", 1.0 / 60.0, 50, 3.0], ["c", 1.0 / 60.0, 10, 0.5]]:
		var kind: String = spec[0]
		var dt: float = float(spec[1])
		var at_step: int = int(spec[2])
		var sec: float = float(spec[3])
		var map := BlkMap.new()
		holder.add_child(map)
		var e2: Node = _blk_enemy(holder, map)
		var h2: Node = _blk_hero(holder, map, 3)
		var st2: Dictionary = {"e": e2, "h": h2, "at": at_step, "sec": sec, "unblocked": 0}
		var bf := func(i: int) -> void:
			if i == int(st2.at):
				st2.e.apply_stun(float(st2.sec))
			if st2.e.is_stunned() and st2.e._blocker != st2.h:
				st2.unblocked = int(st2.unblocked) + 1
		var total: float = (3.0 if kind == "ref" else float(at_step) * dt + sec + 2.2)
		var r2: Dictionary = _stn_steps(e2, dt, int(ceil(total / dt)), 1, bf)
		var runs2: Array = _stn_runs(r2.stunned)
		var lost2: float = 1000000.0 - h2.current_hp
		var row2: Dictionary = {"atk": r2.atk.slice(0, 6), "runs": runs2, "moved": r2.moved_in_stun.size(), "fight_in_stun": r2.fight_in_stun.size(),
			"unblocked": st2.unblocked, "multi": r2.multi, "lost_ok": absf(lost2 - float(r2.atk.size()) * BLK_DMG) < 0.001}
		var ok: bool = row2.lost_ok and not r2.multi and r2.moved_in_stun.is_empty() and r2.fight_in_stun.is_empty() and int(st2.unblocked) == 0 \
			and not r2.atk.is_empty() and int(r2.atk[0]) == 2
		if kind == "ref":
			ref_atk = r2.atk.duplicate()
			ok = ok and r2.atk.size() >= 3 and runs2.is_empty()
		else:
			var in_stun: Array = r2.atk.filter(func(x): return r2.stunned.has(x))
			var len_ok: bool = runs2.size() == 1 and int(runs2[0][0]) == at_step and _stn_len_ok(float(r2.stunned.size()) * dt, sec, dt)
			row2["len"] = snappedf(float(r2.stunned.size()) * dt, 0.000001)
			ok = ok and len_ok and in_stun.is_empty()
			if kind == "c":
				ok = ok and r2.atk.slice(0, 3) == ref_atk.slice(0, 3)
			elif len_ok:
				var end: int = int(runs2[0][1])
				var after: Array = r2.atk.filter(func(x): return int(x) > end)
				var before: Array = r2.atk.filter(func(x): return int(x) < at_step)
				row2["before"] = before
				row2["after"] = after.slice(0, 3)
				ok = ok and before == [2] and after.size() >= 2 and int(after[0]) == end + 1 \
					and float(int(after[1]) - int(after[0])) * dt >= 1.0 - 1e-6 and float(int(after[1]) - int(after[0])) * dt <= 1.0 + dt + 1e-6
		d2[kind] = row2
		ok2 = ok2 and ok
	_check("暈眩-2 被擋住的敵人（固定步進）：冷卻快好時暈眩 0.5 秒（1 倍／2 倍／部署慢速）：暈眩中不攻擊、仍被同一位武將擋住、不移動、不顯示攻擊圖片，結束的下一步打一擊、再下一擊間隔 1 秒；暈眩 3 秒恢復後只打一擊（不補打）；剛打完就暈眩時攻擊的步數和沒有暈眩時相同（冷卻照常倒數）；一步最多一擊、每擊 13.333",
		ok2, d2)

	# 暈眩-2d：被擋住又暈眩時，阻擋的武將陣亡（固定步進，每秒 60 步，敵人速度 60 像素／秒）：第 20 步之前暈眩 0.5 秒、第 25 步之前武將陣亡：
	# 下一步不再被擋住，但到暈眩結束才開始走（暈眩中不動），之後每步前進 1 像素
	var map2d := BlkMap.new()
	holder.add_child(map2d)
	var e2d: Node = load("res://entities/enemy/Enemy.gd").new()
	holder.add_child(e2d)
	e2d.set_physics_process(false)
	e2d.setup({"enemy_id": "blk", "hp": 99999.0, "speed": 60.0}, [Vector2(0.5 * map2d.tile, 0.0), Vector2(12.5 * map2d.tile, 0.0)])
	e2d.position = Vector2(3.5 * map2d.tile, 0.0)
	e2d._game_map = map2d
	var h2d: Node = _blk_hero(holder, map2d, 3)
	var st2d: Dictionary = {"e": e2d, "h": h2d, "blk_after_kill": 0}
	var bf2d := func(i: int) -> void:
		if i == 20:
			st2d.e.apply_stun(0.5)
		elif i == 25:
			st2d.h.take_damage(1.0e12)
		elif i > 26 and st2d.e._blocker != null:
			st2d.blk_after_kill = int(st2d.blk_after_kill) + 1
	var r2d: Dictionary = _stn_steps(e2d, 1.0 / 60.0, 70, 1, bf2d)
	var runs2d: Array = _stn_runs(r2d.stunned)
	var moves2d: Array = r2d.dx.filter(func(x): return x > 0.0)
	var d2d: Dictionary = {"runs": runs2d, "moved_in_stun": r2d.moved_in_stun, "blk_after_kill": st2d.blk_after_kill, "moves": moves2d.size(),
		"move_step": snappedf(moves2d[0], 0.000001) if not moves2d.is_empty() else -1.0}
	_check("暈眩-2d 被擋住又暈眩時阻擋的武將陣亡：下一步不再被擋住，但到暈眩結束（0.5 秒，差一步以內）才開始走、暈眩中不動，之後每步照原速前進",
		runs2d.size() == 1 and int(runs2d[0][0]) == 20 and _stn_len_ok(float(r2d.stunned.size()) / 60.0, 0.5, 1.0 / 60.0) and r2d.moved_in_stun.is_empty()
			and int(st2d.blk_after_kill) == 0 and moves2d.size() >= 15 and _stn_all(moves2d, 1.0), d2d)

	# 暈眩-3：刷新與到期（固定步進每秒 60 步）：暈眩 0.5 秒、過 0.2 秒（剩 0.3）後再 0.5 → 剩 0.5（不是相加的 0.8）；再 0.2 → 仍是 0.5（不縮短）；
	# 再 1.0 → 1.0（取較長）；無效的時間不算；生效 4 次、只有一段暈眩紀錄；最後一次之後 1 秒（差一步以內）結束、恢復原速；結束後再暈眩是新的一段
	var e3: Node = _stn_enemy(holder, 60.0)
	e3.apply_stun(0.5)
	_stn_steps(e3, 1.0 / 60.0, 12)
	var left3: Array = [snappedf(e3._stun_left, 0.000001)]
	for v in [0.5, 0.2, 1.0]:
		e3.apply_stun(v)
		left3.append(snappedf(e3._stun_left, 0.000001))
	for v in [0.0, -1.0, NAN]:
		e3.apply_stun(v)
	left3.append(snappedf(e3._stun_left, 0.000001))
	var count3: int = e3.stun_count
	var r3: Dictionary = _stn_steps(e3, 1.0 / 60.0, 80, 13)
	var frozen3: float = float(r3.stunned.size()) / 60.0
	var log3: int = e3.stun_log.size()
	e3.apply_stun(0.5)
	var d3: Dictionary = {"left": left3, "count": count3, "frozen": snappedf(frozen3, 0.000001), "moved_in_stun": r3.moved_in_stun.size(),
		"after": r3.dx.slice(0, 3), "log_before/after": [log3, e3.stun_log.size()]}
	_check("暈眩-3 刷新與到期：剩 0.3 秒時再 0.5 → 0.5（不相加）、再 0.2 → 仍是 0.5（不縮短）、再 1.0 → 1.0；無效的時間不算；生效 4 次、只有一段紀錄；最後一次之後 1 秒（差一步以內）結束、恢復原速；結束後再暈眩是新的一段",
		left3 == [0.3, 0.5, 0.5, 1.0, 1.0] and count3 == 4 and _stn_len_ok(frozen3, 1.0, 1.0 / 60.0) and r3.moved_in_stun.is_empty() and _stn_all(r3.dx, 1.0)
			and log3 == 1 and e3.stun_log.size() == 2, d3)

	# 暈眩-4：暈眩中其他狀態照常計時（固定步進每秒 60 步，暈眩 1 秒）：
	# 減速：0.3 秒的來源（0.5）在暈眩中到期、5 秒的來源（0.8）還在；文士塔的疊加減速（0.4 秒）到期歸零；恢復後每步前進 60 × 0.8 ÷ 60（當下應有的減速速度）；
	# 灼燒：每 0.2 秒 10 點、3 跳，0.7 秒時已在暈眩中扣完 30；
	# 灼燒致死：血量 25 的敵人在暈眩中被第 3 跳（0.6 秒，差一步以內）打倒，死亡信號只發一次，之後再處理也不會重複
	var e4: Node = _stn_enemy(holder, 60.0)
	e4.apply_slow_from("stn_short", 0.5, 0.3)
	e4.apply_slow_from("stn_long", 0.8, 5.0)
	e4.apply_stackable_slow(0.3, 0.4)
	e4.apply_burn(10.0, 3, 0.2)
	e4.apply_stun(1.0)
	var hp4: float = e4.current_hp
	var r4a: Dictionary = _stn_steps(e4, 1.0 / 60.0, 42)
	var mid4: Dictionary = {"stunned": e4.is_stunned(), "sources": e4.slow_sources_state().keys(), "mult": snappedf(e4.speed_mult, 0.0001),
		"stack": e4._stack_slow_amount, "burn_lost": snappedf(hp4 - e4.current_hp, 0.0001), "burn_left": e4._burn_ticks_left}
	var r4b: Dictionary = _stn_steps(e4, 1.0 / 60.0, 40, 43)
	var frozen4: float = float(r4a.stunned.size() + r4b.stunned.size()) / 60.0
	var e4k: Node = _stn_enemy(holder, 60.0, {"hp": 25.0})
	var died4: Array = [0, -1]
	var on_died4 := func(_x) -> void:
		died4[0] = int(died4[0]) + 1
	e4k.died.connect(on_died4)
	e4k.apply_burn(10.0, 3, 0.2)
	e4k.apply_stun(1.0)
	for i in range(1, 61):
		e4k._physics_process(1.0 / 60.0)
		if e4k.is_dead() and int(died4[1]) < 0:
			died4[1] = i
	var d4: Dictionary = {"mid": mid4, "frozen": snappedf(frozen4, 0.000001), "moved_in_stun": r4a.moved_in_stun.size() + r4b.moved_in_stun.size(),
		"after": r4b.dx.slice(0, 3).map(func(x): return snappedf(x, 0.000001)), "burn_kill": {"died": died4[0], "step": died4[1]}}
	_check("暈眩-4 暈眩中其他狀態照常計時：0.3 秒的減速來源到期、5 秒的（0.8）還在，文士塔的疊加減速到期歸零，灼燒 3 跳在暈眩中扣完 30；暈眩 1 秒後恢復成當下應有的速度（每步 0.8 像素）；灼燒在暈眩中致死（第 36 步，差一步以內）只發一次死亡信號",
		mid4.stunned and mid4.sources == ["stn_long"] and mid4.mult == 0.8 and mid4.stack == 0.0 and mid4.burn_lost == 30.0 and mid4.burn_left == 0
			and _stn_len_ok(frozen4, 1.0, 1.0 / 60.0) and int(d4.moved_in_stun) == 0 and _stn_all(r4b.dx, 0.8)
			and died4[0] == 1 and int(died4[1]) >= 36 and int(died4[1]) <= 37, d4)

	# 暈眩-5：免疫減速的敵人（trait immune_slow，固定步進每秒 60 步）：倍率減速與文士塔的疊加減速都不套用，但暈眩照樣生效：
	# 0.5 秒不動（差一步以內），恢復後照原速（每步 1 像素）前進
	var e5: Node = _stn_enemy(holder, 60.0, {"trait": "immune_slow"})
	e5.apply_slow_from("stn_s", 0.5, 5.0)
	e5.apply_stackable_slow(0.3, 5.0)
	var applied5: bool = e5.apply_stun(0.5)
	var r5: Dictionary = _stn_steps(e5, 1.0 / 60.0, 45)
	var d5: Dictionary = {"immune": e5.immune_slow, "applied": applied5, "mult": e5.speed_mult, "sources": e5._slow_sources.size(), "stack": e5._stack_slow_amount,
		"frozen": snappedf(float(r5.stunned.size()) / 60.0, 0.000001), "moved_in_stun": r5.moved_in_stun.size(), "after": r5.dx.slice(0, 3)}
	_check("暈眩-5 免疫減速的敵人：倍率減速與疊加減速都不套用（倍率 1、沒有來源），但暈眩照樣生效：0.5 秒不動（差一步以內），恢復後照原速前進",
		e5.immune_slow and applied5 and e5.speed_mult == 1.0 and e5._slow_sources.is_empty() and e5._stack_slow_amount == 0.0
			and _stn_len_ok(float(r5.stunned.size()) / 60.0, 0.5, 1.0 / 60.0) and r5.moved_in_stun.is_empty() and _stn_all(r5.dx, 1.0), d5)
	holder.queue_free()

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)

	# 暈眩-6：實際引擎，移動中的敵人（每秒 20 像素、血量很多，放在 (4,5)）；張飛在建築格 (5,4)、射程 2.5 格、攻擊間隔 1.5 秒、攻擊力 100：
	# 每次命中敵人扣 100 並暈眩；暈眩中每一步都沒有移動，暈眩外每一步都照原速前進；每段暈眩的遊戲時間（物理時鐘）介於 0.5 與 0.5 ＋ 一步之間；
	# 1 倍記錄 2 段、切到 2 倍記錄 1 段、暈眩開始時打開部署選單（0.1 倍）記錄 1 段，最後一段在暈眩中手動暫停 1 秒（牆鐘）：
	# 暫停中剩餘時間與位置不變、繼續後這一段總長仍是 0.5；張飛讓敵人暈眩的次數＝敵人的生效次數＝暈眩紀錄的段數＝命中次數（沒有刷新）
	var d6: Dictionary = {}
	var ok6: bool = false
	_stn_load(rec, "stn-6", [[_grp("stn_walk", 1, 0.02)]], [_stn_zf()], {"zhang_fei": Vector2i(5, 4)})
	var e6: Node = await _stn_start(Vector2i(4, 5))
	var zf6: Node = _fly_hero("zhang_fei")
	if e6 != null and zf6 != null:
		var st6: Dictionary = {"done": 0, "open": false, "phase": 0, "menu": {}, "pause": {}, "rec": rec, "e": e6}
		var each6 := func(row: Dictionary) -> void:
			_stn_count(st6, row)
			var ph: int = int(st6.phase)
			if ph == 0 and int(st6.done) >= 2:
				_r19_speed(st6.rec, 2.0)
				st6.phase = 1
			elif ph == 1 and int(st6.done) >= 3:
				st6.phase = 2
			elif ph == 2 and not row.st and row.after:
				st6.menu = _r19_open(st6.rec, 2)
				st6.phase = 3
			elif ph == 3 and int(st6.done) >= 4:
				_r19_close(st6.rec, st6.menu)
				_r19_speed(st6.rec, 1.0)
				st6.phase = 4
			elif ph == 4 and not row.st and row.after:
				st6.pause = {"left": st6.e._stun_left, "x": st6.e.global_position.x, "wall": Time.get_ticks_msec(), "reply": _r20_pause(st6.rec, true)}
				st6.phase = 5
			elif ph == 5 and Time.get_ticks_msec() - int(st6.pause.wall) >= 1000:
				st6.pause["left2"] = st6.e._stun_left
				st6.pause["x2"] = st6.e.global_position.x
				st6.pause["frozen"] = _r20_frozen()
				_r20_pause(st6.rec, false)
				st6.phase = 6
		var rows6: Array = await _stn_track(e6, null, 30.0, func(_r): return int(st6.phase) == 6 and int(st6.done) >= 5, each6)
		var segs6: Array = _stn_segments(rows6).filter(func(s): return s.complete)
		var hits6: Array = rows6.filter(func(r): return float(r.hit) > 0.0).map(func(r): return r.hit)
		var lens_ok: bool = segs6.size() >= 5
		for s in segs6:
			lens_ok = lens_ok and _stn_len_ok(float(s.dur), 0.5, float(s.maxdt)) and int(s.moved) == 0
		var p6: Dictionary = st6.pause
		d6 = {"segments": _stn_seg_brief(segs6), "bad_moves": _stn_bad_moves(rows6, STN_SPEED), "hits": hits6.slice(0, 8),
			"counts": [zf6.stun_count, e6.stun_count, e6.stun_log.size(), roundi((e6.max_hp - e6.current_hp) / 100.0)], "phase": st6.phase,
			"pause": {"left": [p6.get("left"), p6.get("left2")], "x_same": p6.get("x") == p6.get("x2"), "frozen": p6.get("frozen"), "reply": p6.get("reply")},
			"menu": st6.menu, "ts_now": Engine.time_scale}
		ok6 = lens_ok and int(d6.bad_moves) == 0 and _stn_all(hits6, 100.0) and zf6.stun_count >= 5 and zf6.stun_count == e6.stun_count             and e6.stun_count == e6.stun_log.size() and e6.stun_count == roundi((e6.max_hp - e6.current_hp) / 100.0)             and float(segs6[2].ts_min) >= 1.9 and int(segs6[3].steps) >= 250 and float(segs6[3].ts_min) <= 0.11 and int(segs6[4].zero) >= 20             and p6.get("left") == p6.get("left2") and p6.get("x") == p6.get("x2") and p6.get("frozen") == true and not st6.menu.is_empty() and is_equal_approx(Engine.time_scale, 1.0)
	_check("暈眩-6 實際引擎（移動中的敵人）：張飛每次命中扣 100 並暈眩；暈眩中每一步都不動、暈眩外照原速前進；1 倍 2 段、2 倍 1 段、部署慢速 1 段、手動暫停 1 秒的 1 段，每段遊戲時間都介於 0.5 與 0.5 ＋ 一步之間；暫停中剩餘時間與位置不變；張飛的暈眩次數＝敵人的生效次數＝紀錄段數＝命中次數",
		ok6, d6)

	# 暈眩-7：實際引擎，被擋住的敵人：張飛在道路 (4,5)（射程 1.5 格、攻擊間隔 1.5 秒），敵人（攻擊力 100）放在張飛的格子裡（中心左邊 0.4 格），第一步就被擋下；記錄 9 秒遊戲時間：
	# 暈眩中的每一步都沒有攻擊、張飛沒有扣血、沒有移動、不顯示攻擊圖片；被擋下之後一直是擋住的狀態（暈眩不解除阻擋）；
	# 暈眩外照常攻擊，每擊扣 66.667、一步最多一擊；相鄰兩擊至少隔 1 秒減一步（不補打）；每兩段暈眩之間都有攻擊（恢復後照常攻擊）
	var d7: Dictionary = {}
	var ok7: bool = false
	_stn_load(rec, "stn-7", [[_grp("stn_walk", 1, 0.02)]], [_stn_zf()], {"zhang_fei": Vector2i(4, 5)}, 1.5)
	var e7: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	var zf7: Node = _fly_hero("zhang_fei")
	if e7 != null and zf7 != null:
		var rows7: Array = await _stn_track(e7, zf7, 9.0, func(_r): return false)
		var first_blk: int = -1
		for i in range(rows7.size()):
			if rows7[i].blk:
				first_blk = i
				break
		var segs7: Array = _stn_segments(rows7).filter(func(s): return s.complete)
		var atk_idx: Array = []
		var bad7: Array = []
		var maxdt: float = 0.0
		for i in range(rows7.size()):
			var r: Dictionary = rows7[i]
			maxdt = maxf(maxdt, float(r.dt))
			if r.st and (int(r.atk) != 0 or float(r.lost) != 0.0 or absf(float(r.dx)) > 1e-9):
				bad7.append({"i": i, "why": "stunned", "row": r})
			if r.after and r.fight:
				bad7.append({"i": i, "why": "fight", "row": r})
			if first_blk >= 0 and i >= first_blk and not r.blk:
				bad7.append({"i": i, "why": "unblocked", "row": r})
			if int(r.atk) > 0:
				atk_idx.append(i)
				if int(r.atk) > 1 or absf(float(r.lost) - STN_BLOCK_DMG) > 0.001:
					bad7.append({"i": i, "why": "hit", "row": r})
			elif float(r.lost) != 0.0:
				bad7.append({"i": i, "why": "lost", "row": r})
		var gaps: Array = []
		for k in range(1, atk_idx.size()):
			gaps.append(snappedf(float(rows7[atk_idx[k]].t) - float(rows7[atk_idx[k - 1]].t), 0.0001))
		var windows: int = 0
		var windows_ok: int = 0
		var recovery: int = 0
		for k in range(segs7.size() - 1):
			if atk_idx.is_empty() or int(segs7[k].from) < int(atk_idx[0]):
				continue
			windows += 1
			var a: int = int(segs7[k].to)
			var b: int = int(segs7[k + 1].from)
			if atk_idx.any(func(x): return x > a and x < b):
				windows_ok += 1
			if atk_idx.has(a + 1):
				recovery += 1
		d7 = {"first_blk": first_blk, "segments": _stn_seg_brief(segs7), "attacks": atk_idx.size(), "gaps": gaps, "windows": [windows_ok, windows], "recovery_immediate": recovery,
			"bad": bad7.slice(0, 5), "zf_stun": zf7.stun_count}
		var lens7: bool = segs7.size() >= 3
		for s in segs7:
			lens7 = lens7 and _stn_len_ok(float(s.dur), 0.5, float(s.maxdt))
		ok7 = first_blk >= 0 and bad7.is_empty() and lens7 and atk_idx.size() >= 3 and gaps.all(func(g): return g >= 1.0 - maxdt - 1e-6)             and windows >= 2 and windows_ok == windows
	_check("暈眩-7 實際引擎（被擋住的敵人）：暈眩中不攻擊、張飛不扣血、不移動、不顯示攻擊圖片，仍被擋住；暈眩外照常攻擊（每擊 66.667、一步最多一擊）；相鄰兩擊至少隔 1 秒減一步（不補打）；每兩段暈眩之間都有攻擊；每段暈眩 0.5 秒（差一步以內）",
		ok7, d7)

	# 暈眩-8：不觸發與不受影響（實際引擎，張飛射程 2.5 格）：
	# a 普攻致死：血量 80 的敵人被一擊打倒，張飛的暈眩次數 0、擊殺 1、只結算一次；
	# b 空目標：唯一的敵人在出生點（射程外）1.5 秒遊戲時間，張飛沒有攻擊、暈眩次數 0、攻擊冷卻待命在 0；
	# c 飛行：不會移動的飛行兵放在 (4,5)（射程內）2 秒：張飛（步兵）打不到它：血量不變、沒有暈眩、暈眩次數 0；
	# d 免疫減速：步兵塔 (4,6) 的緩速光環範圍內、免疫減速的慢速兵照樣暈眩（兩段，暈眩中不動、各 0.5 秒），但沒有任何減速來源、倍率 1；
	# e 技能 id 不認得（stun_x）：照樣命中扣 100，但不暈眩
	var d8: Dictionary = {}
	_stn_load(rec, "stn-8a", [[_grp("stn_soft", 1, 0.02)]], [_stn_zf()], {"zhang_fei": Vector2i(5, 4)})
	var ended8: int = battle_ended_count
	await _stn_start(Vector2i(4, 5))
	await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 5.0)
	var zf8a: Node = _fly_hero("zhang_fei")
	d8["a"] = [zf8a.stun_count if zf8a != null else -1, _bm().kills, _bm().game_state == BattleManager.GameState.RESULT, battle_ended_count - ended8]
	_stn_load(rec, "stn-8b", [[_grp("stn_walk", 1, 0.02)]], [_stn_zf()], {"zhang_fei": Vector2i(10, 4)})
	_bm().player_start_battle()
	await _wait_until(func(): return _first_enemy() != null, 5.0)
	var e8b: Node = _first_enemy()
	var g8: float = _pt()
	await _wait_until(func(): return _pt() - g8 >= 1.5, 8.0)
	var zf8b: Node = _fly_hero("zhang_fei")
	d8["b"] = [zf8b.stun_count if zf8b != null else -1, zf8b._atk_timer if zf8b != null else -1.0, e8b.stun_count if is_instance_valid(e8b) else -1,
		e8b.current_hp == e8b.max_hp if is_instance_valid(e8b) else false]
	_stn_load(rec, "stn-8c", [[_grp("stn_fly", 1, 0.02)]], [_stn_zf()], {"zhang_fei": Vector2i(5, 4)})
	var e8c: Node = await _stn_start(Vector2i(4, 5))
	var g8c: float = _pt()
	await _wait_until(func(): return _pt() - g8c >= 2.0, 8.0)
	var zf8c: Node = _fly_hero("zhang_fei")
	d8["c"] = [e8c.is_flying() if is_instance_valid(e8c) else false, e8c.current_hp == e8c.max_hp if is_instance_valid(e8c) else false,
		e8c.stun_count if is_instance_valid(e8c) else -1, zf8c.stun_count if zf8c != null else -1, zf8c.can_hit_air if zf8c != null else true]
	_stn_load(rec, "stn-8d", [[_grp("stn_walk_imm", 1, 0.02)]], [_stn_zf()], {"zhang_fei": Vector2i(5, 4)}, 2.5, [["infantry", Vector2i(4, 6)]])
	var e8d: Node = await _stn_start(Vector2i(4, 5))
	var ok8d: bool = false
	if e8d != null:
		var sc8: Dictionary = {"done": 0, "open": false}
		var cnt8 := func(row: Dictionary) -> void:
			_stn_count(sc8, row)
		var rows8: Array = await _stn_track(e8d, null, 8.0, func(_r): return int(sc8.done) >= 2, cnt8)
		var segs8: Array = _stn_segments(rows8).filter(func(s): return s.complete)
		var lens8: bool = segs8.size() >= 2
		for s in segs8:
			lens8 = lens8 and _stn_len_ok(float(s.dur), 0.5, float(s.maxdt)) and int(s.moved) == 0
		d8["d"] = {"immune": e8d.immune_slow, "segments": _stn_seg_brief(segs8), "mult": e8d.speed_mult, "sources": e8d._slow_sources.size(), "towers": _slw_towers().size(),
			"bad_moves": _stn_bad_moves(rows8, STN_SPEED)}
		ok8d = e8d.immune_slow and lens8 and e8d.speed_mult == 1.0 and e8d._slow_sources.is_empty() and _slw_towers().size() == 1 and int(d8.d.bad_moves) == 0
	_stn_load(rec, "stn-8e", [[_grp("stn_walk", 1, 0.02)]], [_stn_zf({"id": "stun_x", "stun_sec": 0.5})], {"zhang_fei": Vector2i(5, 4)})
	var e8e: Node = await _stn_start(Vector2i(4, 5))
	var ok8e: bool = false
	if e8e != null:
		var rows8e: Array = await _stn_track(e8e, null, 3.5, func(_r): return false)
		var hits8e: Array = rows8e.filter(func(r): return float(r.hit) > 0.0).map(func(r): return r.hit)
		var zf8e: Node = _fly_hero("zhang_fei")
		d8["e"] = {"hits": hits8e, "stunned_rows": rows8e.filter(func(r): return r.st).size(), "stun_count": e8e.stun_count, "zf_duration": zf8e.stun_duration if zf8e != null else -1.0}
		ok8e = hits8e.size() >= 2 and _stn_all(hits8e, 100.0) and int(d8.e.stunned_rows) == 0 and e8e.stun_count == 0 and zf8e != null and zf8e.stun_duration == 0.0
	_check("暈眩-8 不觸發與不受影響：普攻致死不暈眩（擊殺 1、結算一次）；射程內沒有敵人時不攻擊、冷卻待命在 0；步兵張飛打不到飛行兵（不扣血、不暈眩）；免疫減速的敵人照樣暈眩（每段 0.5 秒、暈眩中不動），步兵塔的緩速光環仍然無效；不認得的技能 id 照樣扣 100 但不暈眩",
		d8.a == [0, 1, true, 1] and d8.b == [0, 0.0, 0, true] and d8.c == [true, true, 0, 0, false] and ok8d and ok8e, d8)

	# 暈眩-9：施加者離開與清理（實際引擎）：
	# a 移動中的敵人被張飛暈眩後，立刻把張飛移出隊伍（送出和隊伍視窗相同的 update_team）：這一段暈眩照樣到 0.5 秒（差一步以內）才結束、之後照原速移動、不再暈眩
	#   （放到射程內的當下可能已被打過一下，那一段開始時間沒有記錄到，不列入長度檢查）；
	# b 被擋住的敵人（張飛在道路 (4,5)）在暈眩中、張飛陣亡：下一步不再被擋住，但到暈眩結束（0.5 秒）才開始走（暈眩中不動），之後照原速前進；
	# c 暈眩中的敵人被打倒：擊殺 1、只結算一次；
	# d 新的一場：備戰時上一場的敵人都不在了，開戰後新的敵人沒有暈眩（剩餘 0、次數 0）
	var d9: Dictionary = {}
	var ok9a: bool = false
	_stn_load(rec, "stn-9a", [[_grp("stn_walk", 1, 0.02)]], [_stn_zf()], {"zhang_fei": Vector2i(5, 4)})
	var e9a: Node = await _stn_start(Vector2i(4, 5))
	if e9a != null:
		var st9a: Dictionary = {"done": 0, "open": false, "removed": false, "rec": rec, "t": -1.0}
		var each9a := func(row: Dictionary) -> void:
			_stn_count(st9a, row)
			if not st9a.removed and not row.st and row.after:
				_r19_js(st9a.rec, {"type": "update_team", "team_list": []})
				st9a.removed = true
			if int(st9a.done) >= 1 and float(st9a.t) < 0.0:
				st9a.t = _pt()
		var rows9a: Array = await _stn_track(e9a, null, 8.0, func(_r): return float(st9a.t) >= 0.0 and _pt() - float(st9a.t) >= 1.2, each9a)
		var segs9a: Array = _stn_segments(rows9a)
		var done9a: Array = segs9a.filter(func(s): return s.complete)
		var tail: Array = rows9a.slice(int(done9a[0].to) + 1) if not done9a.is_empty() else []
		d9["a"] = {"segments": _stn_seg_brief(segs9a), "zf_gone": _fly_hero("zhang_fei") == null, "stun_count": e9a.stun_count, "tail_rows": tail.size(),
			"tail_bad_moves": _stn_bad_moves(tail, STN_SPEED), "tail_moving": tail.filter(func(r): return float(r.dx) > 0.0).size()}
		ok9a = done9a.size() == 1 and bool(segs9a.back().complete) and _stn_len_ok(float(done9a[0].dur), 0.5, float(done9a[0].maxdt)) and int(done9a[0].moved) == 0             and _fly_hero("zhang_fei") == null and e9a.stun_count == segs9a.size() and tail.size() >= 30 and int(d9.a.tail_bad_moves) == 0 and int(d9.a.tail_moving) >= 30
	var ok9b: bool = false
	_stn_load(rec, "stn-9b", [[_grp("stn_walk", 1, 0.02)]], [_stn_zf()], {"zhang_fei": Vector2i(4, 5)}, 1.5)
	var e9b: Node = await _stn_start(Vector2i(3, 5))
	if e9b != null:
		var st9b: Dictionary = {"killed": -1, "t": -1.0, "done": 0, "open": false}
		var each9b := func(row: Dictionary) -> void:
			_stn_count(st9b, row)
			if int(st9b.killed) < 0 and row.after and row.blk:
				var z: Node = _fly_hero("zhang_fei")
				if z != null:
					z.take_damage(1.0e12)
					st9b.killed = int(st9b.done)
			if int(st9b.killed) >= 0 and int(st9b.done) > int(st9b.killed) and float(st9b.t) < 0.0:
				st9b.t = _pt()
		var rows9b: Array = await _stn_track(e9b, null, 12.0, func(_r): return float(st9b.t) >= 0.0 and _pt() - float(st9b.t) >= 1.2, each9b)
		var segs9b: Array = _stn_segments(rows9b)
		var last9b: Dictionary = segs9b.back() if not segs9b.is_empty() else {}
		var tail9b: Array = rows9b.slice(int(last9b.get("to", rows9b.size())) + 1)
		var in_seg: Array = rows9b.slice(int(last9b.get("from", 0)), int(last9b.get("to", -1)) + 1)
		d9["b"] = {"segments": _stn_seg_brief(segs9b), "zf_gone": _fly_hero("zhang_fei") == null, "blk_in_seg": in_seg.map(func(r): return r.blk).slice(0, 3),
			"tail_rows": tail9b.size(), "tail_blk": tail9b.filter(func(r): return r.blk).size(), "tail_bad_moves": _stn_bad_moves(tail9b, STN_SPEED),
			"tail_moving": tail9b.filter(func(r): return float(r.dx) > 0.0).size()}
		ok9b = not last9b.is_empty() and bool(last9b.complete) and _stn_len_ok(float(last9b.dur), 0.5, float(last9b.maxdt)) and int(last9b.moved) == 0             and in_seg.size() >= 2 and not in_seg[1].blk and _fly_hero("zhang_fei") == null and tail9b.size() >= 30 and int(d9.b.tail_blk) == 0             and int(d9.b.tail_bad_moves) == 0 and int(d9.b.tail_moving) >= 30
	_stn_load(rec, "stn-9c", [[_grp("stn_walk", 1, 0.02)]], [_stn_zf()], {"zhang_fei": Vector2i(5, 4)})
	var ended9: int = battle_ended_count
	var e9c: Node = await _stn_start(Vector2i(4, 5))
	await _wait_until(func(): return is_instance_valid(e9c) and e9c.is_stunned(), 5.0)
	var was9c: bool = is_instance_valid(e9c) and e9c.is_stunned()
	if is_instance_valid(e9c):
		e9c.take_damage(1.0e9)
	await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 5.0)
	await _wait(0.3)
	d9["c"] = [was9c, _bm().kills, battle_ended_count - ended9, _bm().game_state == BattleManager.GameState.RESULT]
	_stn_load(rec, "stn-9d", [[_grp("stn_walk", 1, 0.02)]], [_stn_zf()], {"zhang_fei": Vector2i(10, 4)})
	await _def_frames()
	var prep9: bool = _first_enemy() == null
	_bm().player_start_battle()
	await _wait_until(func(): return _first_enemy() != null, 5.0)
	var e9d: Node = _first_enemy()
	d9["d"] = [prep9, e9d._stun_left if e9d != null else -1.0, e9d.stun_count if e9d != null else -1, e9d.stun_log.size() if e9d != null else -1]
	_check("暈眩-9 施加者離開與清理：暈眩後張飛被移出隊伍，這一段仍到 0.5 秒才結束、之後照原速移動且不再暈眩；被擋住又暈眩時張飛陣亡，下一步不再被擋住、到暈眩結束才走、之後照原速；暈眩中的敵人被打倒只擊殺與結算一次；新的一場沒有殘留的敵人、新的敵人沒有暈眩",
		ok9a and ok9b and d9.c == [true, 1, 1, true] and d9.d == [true, 0.0, 0, 0], d9)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 曹操「指揮」（攻速光環）──
# 以曹操為中心、目前有效射程內（含邊界）的其他存活武將每秒攻擊次數 × 1.15（攻擊間隔 ÷ 1.15，不是減少 15%）；
# 不含自己與防禦塔；多個攻速光環取最強、不相乘不累加；只在戰鬥中；加成只用在之後新開始的攻擊冷卻（正在倒數的不重設、不補打）；
# 離開範圍、移位、升級、移除、倒下、戰鬥結束、新的一場都撤除；attack_speed、攻擊力與射程都不變

## 曹操的攻速光環（和網頁 utils/heroSkills 的出征參數相同）
const SPD_AURA_SKILL: Dictionary = {"id": "atk_speed_aura", "atk_speed_mult": 1.15}
## 單獨的武將每一步的時間（秒）
const SPD_DT: float = 1.0 / 60.0
## 實際引擎用的敵人：不會移動的地面兵（血量很多，讓戰鬥持續）
const SPD_ENEMIES: Array = [
	{"enemy_id": "spd_post", "name": "P", "hp": 1.0e9, "speed": 0.0},
]

## 取到小數第四位（除以 10000 的結果是最接近的浮點數，可以直接和 1.15 這類字面值比較；snappedf 乘回去會差最後一位）
func _spd_r4(x: float) -> float:
	return roundf(x * 10000.0) / 10000.0

## 攻擊紀錄相鄰兩次的預定時間（攻擊當下的時間 − 零頭）差應該正好是前一次冷卻用的攻擊間隔；回傳不符合的位置（最多 5 個）
func _spd_gaps_bad(log: Array) -> Array:
	var bad: Array = []
	for i in range(1, log.size()):
		var gap: float = (float(log[i].t) - float(log[i].late)) - (float(log[i - 1].t) - float(log[i - 1].late))
		if absf(gap - float(log[i - 1].interval)) > 1e-6:
			bad.append({"i": i, "gap": gap, "want": log[i - 1].interval})
	return bad.slice(0, 5)

## 紀錄裡每一次冷卻用的攻擊間隔都是 v
func _spd_all(log: Array, v: float) -> bool:
	return not log.is_empty() and log.all(func(x): return absf(float(x.interval) - v) < 1e-9)

## 紀錄裡每一次冷卻用的攻擊間隔（取到 0.0001）
func _spd_intervals(log: Array) -> Array:
	return log.map(func(x): return _spd_r4(float(x.interval)))

## 單獨的武將（真正的 Hero 腳本，不經過 Main、測試自己呼叫 _process）：位置 pos、射程 range_t 格、攻擊間隔 interval 秒、攻擊力 100、
## 生命 1000；skill 是技能參數（null 表示沒有技能）；wave 是假的 WaveManager（R20Wave），目標放在 wave.enemies
func _spd_hero(holder: Node, wave: Node, hid: String, pos: Vector2, range_t: float, interval: float, skill: Variant = null) -> Node:
	var h: Node = load("res://entities/hero/Hero.gd").new()
	holder.add_child(h)
	h.set_process(false)
	h.hero_id = hid
	h.tile_size = 48
	h.position = pos
	h.attack_range = range_t
	h.attack_speed = interval
	h.atk = 100.0
	h.max_hp = 1000.0
	h.current_hp = 1000.0
	h._read_skill({} if skill == null else {"skill": skill})
	h._wave_mgr = wave
	return h

## 讓 heroes 依序各處理 steps 步（每步 SPD_DT）；each(i) 在第 i 步（從 0 起算）之前呼叫，回傳 true 時提早結束
func _spd_steps(heroes: Array, steps: int, each: Callable = Callable()) -> void:
	for i in range(steps):
		if each.is_valid() and each.call(i):
			return
		for h in heroes:
			if is_instance_valid(h) and h.is_inside_tree():
				h._process(SPD_DT)

## 實際引擎：載入一場（經過 JSON）並依 cells 的順序放置武將（hero_id → 格子）、放置防禦塔（[種類, 格子]），不開戰。
## 曹操射程 3 格、攻擊間隔 1 秒、射程成長 0.5；spd_a／spd_b 是弓兵、攻擊間隔 0.5 秒、射程 6／12 格；
## 組合用的魏延、張飛、馬超、周瑜射程 4 格、攻擊間隔 0.5 秒
func _spd_load(rec: Node, battle_id: String, waves: Array, team: Array, cells: Dictionary, towers: Array = []) -> void:
	var p: Dictionary = _r12_payload("spd_" + battle_id, waves, battle_id, team)
	p["heroes_config"] = [
		{"hero_id": "cao_cao", "name": "曹操", "job": "infantry", "attack_range": 3.0, "attack_speed": 1.0, "range_growth": 0.5},
		{"hero_id": "spd_a", "name": "A", "job": "archer", "attack_range": 6.0, "attack_speed": 0.5},
		{"hero_id": "spd_b", "name": "B", "job": "archer", "attack_range": 12.0, "attack_speed": 0.5},
		{"hero_id": "wei_yan", "name": "魏延", "job": "infantry", "attack_range": 4.0, "attack_speed": 0.5},
		{"hero_id": "zhang_fei", "name": "張飛", "job": "infantry", "attack_range": 4.0, "attack_speed": 0.5},
		{"hero_id": "ma_chao", "name": "馬超", "job": "cavalry", "attack_range": 4.0, "attack_speed": 0.5},
		{"hero_id": "zhou_yu", "name": "周瑜", "job": "mage", "attack_range": 4.0, "attack_speed": 0.5},
	]
	for c in SPD_ENEMIES:
		p["enemies_config"].append(c.duplicate())
	_r19_js(rec, p)
	for hid in cells:
		_r12_place(hid, cells[hid])
	for t in towers:
		main._on_web_place_tower({"tower_type": t[0], "cell_x": t[1].x, "cell_y": t[1].y})

## 場上武將受到的攻速加成（hero_id → 倍率；不在場上是 -1）
func _spd_bonus(ids: Array) -> Array:
	var out: Array = []
	for hid in ids:
		var h: Node = _fly_hero(hid)
		out.append(_spd_r4(h.atk_speed_bonus_mult) if h != null else -1.0)
	return out

## 實際引擎：等遊戲時間前進 sec 秒（或牆鐘 wall_ms 毫秒），每一幀記錄防禦塔 tw 的攻擊（冷卻變大的地方）攻擊後的冷卻
func _spd_watch(sec: float, tw: Node, out: Array, wall_ms: int = 15000) -> void:
	var end_gt: float = _gt() + sec
	var w_end: int = Time.get_ticks_msec() + wall_ms
	var prev: float = tw._atk_timer if is_instance_valid(tw) else 0.0
	while _gt() < end_gt and Time.get_ticks_msec() < w_end:
		await process_frame
		if is_instance_valid(tw):
			var cur: float = tw._atk_timer
			if cur > prev + 1e-9:
				out.append(cur)
			prev = cur

## 武將 h 的攻擊紀錄中，攻擊當下的時間在 [from, to] 的次數
func _spd_count(h: Node, from: float, to: float) -> int:
	return h.attack_log.filter(func(x): return float(x.t) >= from and float(x.t) <= to).size()

func _atk_speed_aura_cases() -> void:
	# 指揮-0：技能參數的判讀：atk_speed_mult 是大於 1 的有限數字才啟用（1.15、2、1.0001、經過 JSON 的 1.15）；
	# 字串、1、1.0、0.9、0、負數、布林、null、陣列、NaN、正負無限大、沒有欄位、不認得或大小寫不同的 id、其他技能都不啟用；不帶其他技能，改成沒有技能後清除
	var h0: Node = load("res://entities/hero/Hero.gd").new()
	var bad0: Array = []
	for c in [[{"id": "atk_speed_aura", "atk_speed_mult": 1.15}, 1.15], [{"id": "atk_speed_aura", "atk_speed_mult": 2}, 2.0],
			[{"id": "atk_speed_aura", "atk_speed_mult": 1.0001}, 1.0001], [{"id": "atk_speed_aura", "atk_speed_mult": "1.15"}, 1.0],
			[{"id": "atk_speed_aura", "atk_speed_mult": 1}, 1.0], [{"id": "atk_speed_aura", "atk_speed_mult": 1.0}, 1.0],
			[{"id": "atk_speed_aura", "atk_speed_mult": 0.9}, 1.0], [{"id": "atk_speed_aura", "atk_speed_mult": 0}, 1.0],
			[{"id": "atk_speed_aura", "atk_speed_mult": -1.15}, 1.0], [{"id": "atk_speed_aura", "atk_speed_mult": true}, 1.0],
			[{"id": "atk_speed_aura", "atk_speed_mult": null}, 1.0], [{"id": "atk_speed_aura", "atk_speed_mult": [1.15]}, 1.0],
			[{"id": "atk_speed_aura", "atk_speed_mult": NAN}, 1.0], [{"id": "atk_speed_aura", "atk_speed_mult": INF}, 1.0],
			[{"id": "atk_speed_aura", "atk_speed_mult": -INF}, 1.0], [{"id": "atk_speed_aura"}, 1.0],
			[{"id": "atk_speed_aura_x", "atk_speed_mult": 1.15}, 1.0], [{"id": "Atk_Speed_Aura", "atk_speed_mult": 1.15}, 1.0],
			[{"id": "def_aura", "def_mult": 1.2}, 1.0], [{"id": "lifesteal", "lifesteal_ratio": 0.15}, 1.0], [null, 1.0]]:
		var st: Dictionary = {} if c[0] == null else {"skill": c[0]}
		h0._read_skill(st)
		if not is_equal_approx(h0.atk_speed_aura_mult, float(c[1])):
			bad0.append(str(c[0]))
	h0._read_skill({"skill": JSON.parse_string("{\"id\": \"atk_speed_aura\", \"atk_speed_mult\": 1.15}")})
	var json0: float = h0.atk_speed_aura_mult
	var other0: Array = [h0.def_aura_mult, h0.slow_aura_mult, h0.stun_duration, h0.lifesteal_ratio, h0.dodge_chance, h0.first_strike_multiplier, h0.range_multiplier, h0.burn_ratio, h0.sweep_ratio]
	h0._read_skill({})
	var cleared0: float = h0.atk_speed_aura_mult
	h0.free()
	_check("指揮-0 技能參數：atk_speed_mult 1.15、2、1.0001 與經過 JSON 的 1.15 啟用；字串、1、0.9、0、負數、布林、null、陣列、NaN、正負無限大、沒有欄位、不認得或大小寫不同的 id、其他技能都不啟用；不帶其他技能、改成沒有技能後清除",
		bad0.is_empty() and is_equal_approx(json0, 1.15) and other0 == [1.0, 1.0, 0.0, 0.0, 0.0, 1.0, 1.0, 0.0, 0.0] and cleared0 == 1.0,
		{"bad": bad0, "json": json0, "other": other0, "cleared": cleared0})

	# 指揮-1：範圍與次數（單獨的武將，每步 1/60 秒、共 1212 步＝20.2 秒遊戲時間；曹操在原點、射程 3 格、攻擊間隔 1 秒，
	# 其他武將攻擊間隔 0.5 秒、射程 50 格；唯一的敵人不會移動、在曹操旁邊）：
	# 正好 3 格（含邊界）與 1 格的友軍每次冷卻都是 0.5 ÷ 1.15、各打 47 下（不是間隔 0.425 的 48 下，也不是沒有加成的 41 下）；
	# 3.02 格的友軍沒有加成（0.5 秒、41 下）；曹操自己沒有加成（1 秒、21 下）；相鄰兩次攻擊的預定時間差都是前一次的間隔；
	# attack_speed、攻擊力、射程都不變，敵人扣的血＝100 × 總攻擊次數。友軍先處理時第一下還沒有加成（0.5），之後都是 0.5 ÷ 1.15、次數相同
	var buffed_i: float = 0.5 / 1.15
	var d1: Dictionary = {}
	var ok1: bool = true
	for order in ["cao_first", "ally_first"]:
		var holder := _dodge_holder()
		var wave := R20Wave.new()
		holder.add_child(wave)
		var e1: Node = _stn_enemy(holder, 0.0, {"hp": 1.0e9})
		e1.position = Vector2(24.0, 24.0)
		wave.enemies.append(e1)
		var cc: Node = _spd_hero(holder, wave, "cao_cao", Vector2.ZERO, 3.0, 1.0, SPD_AURA_SKILL.duplicate())
		var edge: Node = _spd_hero(holder, wave, "edge", Vector2(144.0, 0.0), 50.0, 0.5)
		var near: Node = _spd_hero(holder, wave, "near", Vector2(0.0, -48.0), 50.0, 0.5)
		var out: Node = _spd_hero(holder, wave, "out", Vector2(0.0, 3.02 * 48.0), 50.0, 0.5)
		var heroes: Array = [cc, edge, near, out] if order == "cao_first" else [edge, near, out, cc]
		# 攻擊紀錄只留最近 40 次：第一下的間隔在第 1 步之後先記下
		_spd_steps(heroes, 1)
		var first: Array = [_spd_r4(float(edge.attack_log[0].interval)), _spd_r4(float(near.attack_log[0].interval))] if edge.attack_count == 1 and near.attack_count == 1 else []
		_spd_steps(heroes, 1211)
		var counts: Array = [edge.attack_count, near.attack_count, out.attack_count, cc.attack_count]
		var total: int = counts[0] + counts[1] + counts[2] + counts[3]
		var r: Dictionary = {"edge/near/out/cao_cao": counts, "bonus": [edge.atk_speed_bonus_mult, near.atk_speed_bonus_mult, out.atk_speed_bonus_mult, cc.atk_speed_bonus_mult],
			"edge_intervals": _spd_intervals(edge.attack_log.slice(0, 3)), "out_intervals": _spd_intervals(out.attack_log.slice(0, 3)),
			"gaps_bad": _spd_gaps_bad(edge.attack_log) + _spd_gaps_bad(near.attack_log) + _spd_gaps_bad(out.attack_log) + _spd_gaps_bad(cc.attack_log),
			"unchanged": [edge.attack_speed, edge.atk, edge.attack_range, cc.attack_speed], "enemy_lost": 1.0e9 - e1.current_hp, "total": total,
			"buffed": cc.atk_speed_state().buffed, "first": first}
		var want_first: Array = [_spd_r4(buffed_i), _spd_r4(buffed_i)] if order == "cao_first" else [0.5, 0.5]
		var buffed_ok: bool = _spd_all(edge.attack_log, buffed_i) and _spd_all(near.attack_log, buffed_i) and first == want_first
		ok1 = ok1 and counts == [47, 47, 41, 21] and buffed_ok and _spd_all(out.attack_log, 0.5) and _spd_all(cc.attack_log, 1.0) \
			and r.gaps_bad.is_empty() and r.unchanged == [0.5, 100.0, 50.0, 1.0] and is_equal_approx(r.enemy_lost, 100.0 * total) \
			and is_equal_approx(edge.atk_speed_bonus_mult, 1.15) and out.atk_speed_bonus_mult == 1.0 and cc.atk_speed_bonus_mult == 1.0 and r.buffed == ["edge", "near"]
		d1[order] = r
		holder.queue_free()
	_check("指揮-1 範圍與次數（20.2 秒遊戲時間）：正好 3 格與 1 格的友軍每次冷卻 0.5 ÷ 1.15、各 47 下（不是 0.425 秒的 48 下、沒有加成的 41 下）；3.02 格的友軍 0.5 秒、41 下；曹操自己 1 秒、21 下；相鄰攻擊的預定時間差都是前一次的間隔；attack_speed、攻擊力、射程不變、敵人扣血＝100 × 總次數；兩種處理順序次數相同（友軍先處理時第一下沒有加成）",
		ok1, d1)

	# 指揮-2：加成改變不重設正在倒數的冷卻（友軍攻擊間隔 1 秒；曹操一開始在範圍外，每一步曹操先處理）：
	# 第 1 步友軍打第 1 下；第 30 步曹操移進範圍：第 31～60 步沒有攻擊（不補打），第 2 下的預定時間仍是第 1 下 + 1 秒；之後的冷卻是 1 ÷ 1.15；
	# 第 4 下之後 0.3 秒曹操移出範圍：第 5 下的預定時間是第 4 下 + 1 ÷ 1.15（不重設），之後回到 1 秒；第 6 下之後馬上移回範圍：第 7 下仍是第 6 下 + 1 秒；
	# 第 7 下之後 0.2 秒曹操倒下（生命 0）：第 8 下是第 7 下 + 1 ÷ 1.15，之後回到 1 秒。每次冷卻用的間隔依序是 1、0.8696、0.8696、0.8696、1、1、0.8696、1、1
	var holder2 := _dodge_holder()
	var wave2 := R20Wave.new()
	holder2.add_child(wave2)
	var e2: Node = _stn_enemy(holder2, 0.0, {"hp": 1.0e9})
	e2.position = Vector2(24.0, 0.0)
	wave2.enemies.append(e2)
	var far: Vector2 = Vector2(480.0, 480.0)
	var cc2: Node = _spd_hero(holder2, wave2, "cao_cao", far, 3.0, 1.0, SPD_AURA_SKILL.duplicate())
	var a2: Node = _spd_hero(holder2, wave2, "ally", Vector2.ZERO, 50.0, 1.0)
	var st2: Dictionary = {"t4": -1.0, "t7": -1.0, "moved_out": false, "moved_back": false, "killed": false, "count_60": -1, "timer_29": -1.0}
	var n2: Dictionary = {"a": a2, "cc": cc2}
	var step2 := func(i: int) -> bool:
		var a2n: Node = n2.a
		var cc2n: Node = n2.cc
		if i == 29:
			st2.timer_29 = a2n._atk_timer
			cc2n.position = Vector2(48.0, 0.0)
		if i == 60:
			st2.count_60 = a2n.attack_count
		if a2n.attack_count >= 4 and st2.t4 < 0.0:
			st2.t4 = a2n._age
		if st2.t4 >= 0.0 and not st2.moved_out and a2n._age >= st2.t4 + 0.3:
			st2.moved_out = true
			cc2n.position = far
		if a2n.attack_count >= 6 and not st2.moved_back:
			st2.moved_back = true
			cc2n.position = Vector2(48.0, 0.0)
		if a2n.attack_count >= 7 and st2.t7 < 0.0:
			st2.t7 = a2n._age
		if st2.t7 >= 0.0 and not st2.killed and a2n._age >= st2.t7 + 0.2:
			st2.killed = true
			cc2n.current_hp = 0.0
		return a2n.attack_count >= 9
	_spd_steps([cc2, a2], 1200, step2)
	var want2: Array = [1.0, 0.8696, 0.8696, 0.8696, 1.0, 1.0, 0.8696, 1.0, 1.0]
	var iv2: Array = _spd_intervals(a2.attack_log)
	var gaps2: Array = _spd_gaps_bad(a2.attack_log)
	holder2.queue_free()
	_check("指揮-2 加成改變不重設冷卻：曹操移進範圍後不補打（第 31～60 步沒有攻擊）、第 2 下仍在第 1 下 + 1 秒；移出範圍、移回範圍、曹操倒下時正在倒數的冷卻都照原本的時間；每次冷卻的間隔依序 1、0.8696、0.8696、0.8696、1、1、0.8696、1、1，預定時間差都等於前一次的間隔",
		st2.count_60 == 1 and iv2 == want2 and gaps2.is_empty() and st2.moved_out and st2.killed,
		{"intervals": iv2, "gaps_bad": gaps2, "count_at_60": st2.count_60, "state": st2})

	# 指揮-3：兩個攻速光環（曹操 1.15、測試武將 1.3，都涵蓋友軍），兩種放置順序：友軍 1.3（不是相乘的 1.495、相加的 1.45）、兩個來源、冷卻 0.5 ÷ 1.3；
	# 兩位光環武將互相加成、不加自己（曹操 1.3、測試武將 1.15）；把 1.3 的移出場景後友軍馬上剩 1.15（1 個來源）、之後的冷卻 0.5 ÷ 1.15；
	# 曹操停止處理後，加成照遊戲時間 0.5 秒到期（0.3 秒時還在、0.55 秒時沒有）；無效的套用（倍率 0.9、1、NaN、無限大、有效期 0、空的來源）都不算、重複套用只刷新
	var d3: Dictionary = {}
	var ok3: bool = true
	for order in [["cao_cao", "strong"], ["strong", "cao_cao"]]:
		var holder3 := _dodge_holder()
		var wave3 := R20Wave.new()
		holder3.add_child(wave3)
		var e3: Node = _stn_enemy(holder3, 0.0, {"hp": 1.0e9})
		e3.position = Vector2(24.0, 0.0)
		wave3.enemies.append(e3)
		var auras: Dictionary = {}
		for hid in order:
			var pos: Vector2 = Vector2(48.0, 0.0) if hid == "cao_cao" else Vector2(-48.0, 0.0)
			var sk: Dictionary = SPD_AURA_SKILL.duplicate() if hid == "cao_cao" else {"id": "atk_speed_aura", "atk_speed_mult": 1.3}
			auras[hid] = _spd_hero(holder3, wave3, hid, pos, 3.0, 1.0, sk)
		var a3: Node = _spd_hero(holder3, wave3, "ally", Vector2.ZERO, 50.0, 0.5)
		_spd_steps([auras[order[0]], auras[order[1]], a3], 120)
		var r: Dictionary = {"ally": [_spd_r4(a3.atk_speed_bonus_mult), a3._atk_speed_sources.size(), _spd_r4(float(a3.attack_log.back().interval))],
			"cao_cao/strong": [_spd_r4(auras.cao_cao.atk_speed_bonus_mult), _spd_r4(auras.strong.atk_speed_bonus_mult)]}
		holder3.remove_child(auras.strong)
		r["removed_strong"] = [_spd_r4(a3.atk_speed_bonus_mult), a3._atk_speed_sources.size()]
		_spd_steps([auras.cao_cao, a3], 60)
		r["after_removed"] = _spd_r4(float(a3.attack_log.back().interval))
		_spd_steps([a3], 18)
		r["ttl_0_3"] = a3.atk_speed_bonus_mult
		_spd_steps([a3], 15)
		r["ttl_0_55"] = [a3.atk_speed_bonus_mult, a3._atk_speed_sources.size()]
		a3.apply_atk_speed_from("src_w", 1.1, 0.5)
		for i in range(3):
			a3.apply_atk_speed_from("src_w", 1.1, 0.5)
		for bad in [["x1", 0.9, 0.5], ["x2", 1.0, 0.5], ["x3", NAN, 0.5], ["x4", INF, 0.5], ["x5", 1.5, 0.0], ["", 1.5, 0.5]]:
			a3.apply_atk_speed_from(bad[0], bad[1], bad[2])
		r["kept"] = [a3._atk_speed_sources.keys(), _spd_r4(a3.atk_speed_bonus_mult)]
		auras.strong.free()
		holder3.queue_free()
		ok3 = ok3 and r.ally == [1.3, 2, _spd_r4(0.5 / 1.3)] and r["cao_cao/strong"] == [1.3, 1.15] and r.removed_strong == [1.15, 1] \
			and r.after_removed == _spd_r4(buffed_i) and is_equal_approx(r.ttl_0_3, 1.15) and r.ttl_0_55 == [1.0, 0] and r.kept == [["src_w"], 1.1]
		d3[",".join(order)] = r
	_check("指揮-3 兩個攻速光環（1.15 與 1.3）兩種放置順序：友軍 1.3（不相乘、不相加）、兩個來源、冷卻 0.5 ÷ 1.3；兩位光環武將互相加成、不加自己；移除 1.3 的馬上剩 1.15、冷卻 0.5 ÷ 1.15；停止更新後 0.3 秒還在、0.55 秒到期；無效的套用不算、重複套用只刷新",
		ok3, d3)

	# 指揮-4：升級與不疊乘（apply_stat_update；設定表：曹操射程 3、射程成長 0.5，友軍攻擊間隔 0.5、攻速成長 0.1）：
	# 1 級時 3.3 格的友軍沒有加成、1 格的有；曹操升到 2 級（射程 3.5）後兩位都有；同樣的資料再送 3 次，曹操的倍率仍是 1.15、友軍的加成仍是 1.15；
	# 友軍升到 2 級後 attack_speed 是 0.45、有效間隔 0.45 ÷ 1.15（不是 0.5 ÷ 1.15 ÷ 1.15），之後的冷卻用 0.45 ÷ 1.15；攻擊力照隊伍資料
	var holder4 := _dodge_holder()
	var wave4 := R20Wave.new()
	holder4.add_child(wave4)
	var e4: Node = _stn_enemy(holder4, 0.0, {"hp": 1.0e9})
	e4.position = Vector2(24.0, 0.0)
	wave4.enemies.append(e4)
	var cfg4: Array = [
		{"hero_id": "cao_cao", "attack_range": 3.0, "range_growth": 0.5, "attack_speed": 1.0},
		{"hero_id": "far_ally", "attack_range": 50.0, "attack_speed": 0.5, "atk_spd_growth": 0.1},
		{"hero_id": "near_ally", "attack_range": 50.0, "attack_speed": 0.5, "atk_spd_growth": 0.1},
	]
	var cc4: Node = _spd_hero(holder4, wave4, "cao_cao", Vector2.ZERO, 3.0, 1.0, SPD_AURA_SKILL.duplicate())
	var fa: Node = _spd_hero(holder4, wave4, "far_ally", Vector2(3.3 * 48.0, 0.0), 50.0, 0.5)
	var na: Node = _spd_hero(holder4, wave4, "near_ally", Vector2(48.0, 0.0), 50.0, 0.5)
	_spd_steps([cc4, fa, na], 3)
	var d4: Dictionary = {"lv1": [fa.atk_speed_bonus_mult, _spd_r4(na.atk_speed_bonus_mult)]}
	var cc_lv2: Dictionary = {"hero_id": "cao_cao", "level": 2, "atk": 100.0, "def": 50.0, "hp": 1000.0, "skill": SPD_AURA_SKILL.duplicate()}
	for i in range(4):
		cc4.apply_stat_update(cc_lv2.duplicate(true), cfg4)
		_spd_steps([cc4, fa, na], 3)
	d4["lv2"] = [_spd_r4(fa.atk_speed_bonus_mult), _spd_r4(na.atk_speed_bonus_mult), cc4.attack_range, cc4.atk_speed_aura_mult, cc4.atk_speed_bonus_mult]
	var na_lv2: Dictionary = {"hero_id": "near_ally", "level": 2, "atk": 120.0, "def": 50.0, "hp": 1000.0}
	for i in range(3):
		na.apply_stat_update(na_lv2.duplicate(true), cfg4)
	_spd_steps([cc4, fa, na], 120)
	d4["ally_lv2"] = [_spd_r4(na.attack_speed), _spd_r4(na.effective_attack_interval()), _spd_r4(float(na.attack_log.back().interval)), na.atk,
		_spd_r4(na.atk_speed_bonus_mult)]
	holder4.queue_free()
	_check("指揮-4 升級與不疊乘：1 級時 3.3 格的友軍沒有加成、1 格的有；曹操升到 2 級（射程 3.5）兩位都有，同樣的資料送 4 次倍率仍是 1.15、曹操自己沒有加成；友軍升到 2 級 attack_speed 0.45、有效間隔與之後的冷卻都是 0.45 ÷ 1.15（不疊乘）、攻擊力 120",
		d4.lv1 == [1.0, 1.15] and d4.lv2 == [1.15, 1.15, 3.5, 1.15, 1.0] and d4.ally_lv2 == [0.45, _spd_r4(0.45 / 1.15), _spd_r4(0.45 / 1.15), 120.0, 1.15], d4)

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)

	# 指揮-5：實際引擎（曹操在建築格 (2,4)、射程 3 格；spd_a 在 (3,4)＝1 格、spd_b 在 (8,6)＝範圍外；弓兵塔在 (1,6)＝範圍內；
	# 唯一的敵人不會移動、在起點 (0,5)，所有單位都打得到）：
	# 備戰時光環不作用、spd_a 沒有加成；開戰後 spd_a 1.15、spd_b 與曹操 1；1 倍 3 秒、2 倍 3 秒、部署選單的慢速 1 秒（牆鐘）、手動暫停 1 秒（牆鐘）、
	# 恢復後 2 秒：spd_a 第一下之後每次冷卻都是 0.5 ÷ 1.15、spd_b 都是 0.5、曹操都是 1，相鄰攻擊的預定時間差都是前一次的間隔；
	# 暫停中攻擊次數與武將的遊戲時間不變、加成仍在（1 個來源）；同一段遊戲時間 spd_a 的次數是 spd_b 的 1.15 倍（各差不到 1 下）；
	# 防禦塔每次攻擊後的冷卻仍是 0.8 秒（不受加成）；spd_a 的 attack_speed、攻擊力、射程不變；
	# 快照：曹操的光環作用中、倍率 1.15、半徑 3、加成 spd_a；面板：spd_a 每秒 2 次、有效 2.3 次，spd_b 2／2；
	# 把曹操移出隊伍：spd_a 馬上（下一幀內）沒有加成、正在倒數的冷卻照原本的時間，之後是 0.5；重新放置曹操（新的來源）又有；
	# 打倒敵人後勝利且只結算一次、沒有加成、光環不作用；新的一場沒有殘留，開戰後又有
	var d5: Dictionary = {}
	var ok5: bool = false
	var team5: Array = [_r12_hero("cao_cao", SPD_AURA_SKILL.duplicate()), _r12_hero("spd_a", null), _r12_hero("spd_b", null)]
	team5[1]["slot"] = 2
	team5[2]["slot"] = 3
	var cells5: Dictionary = {"cao_cao": Vector2i(2, 4), "spd_a": Vector2i(3, 4), "spd_b": Vector2i(8, 6)}
	_spd_load(rec, "spd-5", [[_grp("spd_post", 1, 0.02)]], team5, cells5, [["archer", Vector2i(1, 6)]])
	await _def_frames()
	var cc5: Node = _fly_hero("cao_cao")
	var sa: Node = _fly_hero("spd_a")
	var sb: Node = _fly_hero("spd_b")
	var tw5: Array = _slw_towers()
	if cc5 != null and sa != null and sb != null and tw5.size() == 1:
		d5["prep"] = _spd_bonus(["spd_a", "spd_b", "cao_cao"]) + [cc5.atk_speed_state().aura_active]
		var ended0: int = battle_ended_count
		_bm().player_start_battle()
		await _wait_until(func(): return _sw_enemies().size() >= 1, 5.0)
		await _def_frames()
		d5["battle"] = _spd_bonus(["spd_a", "spd_b", "cao_cao"])
		var t0: float = sa._age
		var tower_cd: Array = []
		await _spd_watch(3.0, tw5[0], tower_cd)
		_r19_speed(rec, 2.0)
		await _spd_watch(3.0, tw5[0], [])
		_r19_speed(rec, 1.0)
		var menu5: Dictionary = _r19_open(rec, 5)
		d5["slow_ts"] = Engine.time_scale
		await _wait_real(1.0)
		_r19_close(rec, menu5)
		_r20_pause(rec, true)
		await _def_frames()
		var pa: Array = [sa.attack_count, sa._age, sb.attack_count]
		await _wait_real(1.0)
		d5["paused"] = [sa.attack_count == pa[0], sa._age == pa[1], sb.attack_count == pa[2], _spd_r4(sa.atk_speed_bonus_mult), sa._atk_speed_sources.size()]
		_r20_pause(rec, false)
		await _spd_watch(2.0, tw5[0], [])
		var t1: float = sa._age
		d5["window"] = snappedf(t1 - t0, 0.001)
		var na5: int = _spd_count(sa, t0, t1)
		var nb5: int = _spd_count(sb, t0, t1)
		d5["counts_a/b"] = [na5, nb5, snappedf((t1 - t0) / buffed_i, 0.01), snappedf((t1 - t0) / 0.5, 0.01)]
		d5["intervals_a"] = _spd_intervals(sa.attack_log.slice(1, 4))
		d5["gaps_bad"] = _spd_gaps_bad(sa.attack_log) + _spd_gaps_bad(sb.attack_log) + _spd_gaps_bad(cc5.attack_log)
		d5["tower_cd"] = tower_cd.map(func(x): return snappedf(float(x), 0.001))
		d5["unchanged"] = [sa.attack_speed, sa.atk, sa.attack_range]
		var snap5: Dictionary = _fly_snapshot(rec)
		var hs: Dictionary = snap5.get("hero_atk_speed", {})
		var ccs: Dictionary = hs.get("cao_cao", {})
		d5["snapshot"] = [ccs.get("aura_active"), _spd_r4(float(ccs.get("aura_mult", 0.0))), ccs.get("radius"), ccs.get("buffed"),
			_spd_r4(float(hs.get("spd_a", {}).get("effective", 0.0))), hs.get("spd_a", {}).get("interval")]
		var np: int = rec.sent_panels.size()
		main._on_hero_clicked(sa)
		var pa5: Dictionary = rec.sent_panels.back() if rec.sent_panels.size() > np else {}
		main._on_hero_clicked(sb)
		var pb5: Dictionary = rec.sent_panels.back() if rec.sent_panels.size() > np + 1 else {}
		main._deselect_unit()
		d5["panel_a/b"] = [_spd_r4(float(pa5.get("atk_spd", 0.0))), _spd_r4(float(pa5.get("atk_spd_effective", 0.0))),
			_spd_r4(float(pb5.get("atk_spd", 0.0))), _spd_r4(float(pb5.get("atk_spd_effective", 0.0)))]
		var log_ok: bool = _spd_all(sa.attack_log.slice(1), buffed_i) and _spd_all(sb.attack_log, 0.5) and _spd_all(cc5.attack_log, 1.0)
		var src5: String = cc5.atk_speed_aura_source
		var n_before: int = sa.attack_count
		var timer_before: float = sa._atk_timer
		_r19_js(rec, {"type": "update_team", "team_list": [team5[1], team5[2]]})
		await process_frame
		d5["removed"] = [_spd_bonus(["spd_a"])[0], sa._atk_speed_sources.size(), _fly_hero("cao_cao") == null]
		await _spd_watch(2.0, tw5[0], [])
		var after: Array = sa.attack_log.slice(sa.attack_log.size() - (sa.attack_count - n_before))
		d5["after_removed"] = {"first_gap_ok": _spd_gaps_bad(sa.attack_log).is_empty(), "intervals": _spd_intervals(after.slice(0, 3)), "timer_before": _spd_r4(timer_before)}
		_r19_js(rec, {"type": "update_team", "team_list": team5})
		_r12_place("cao_cao", Vector2i(2, 4))
		await _def_frames()
		var cc5b: Node = _fly_hero("cao_cao")
		d5["replaced"] = [_spd_bonus(["spd_a"])[0], cc5b != null and cc5b.atk_speed_aura_source != src5]
		for e in _sw_enemies():
			e.take_damage(1.0e12)
		await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 5.0)
		await _def_frames()
		d5["result"] = [_spd_bonus(["spd_a"])[0], cc5b.atk_speed_state().aura_active if cc5b != null else null, battle_ended_count - ended0, last_result.get("result")]
		_spd_load(rec, "spd-5b", [[_grp("spd_post", 1, 0.02)]], team5, cells5)
		await _def_frames()
		var sa2: Node = _fly_hero("spd_a")
		d5["new_prep"] = [sa2._atk_speed_sources.size() if sa2 != null else -1, sa2.atk_speed_bonus_mult if sa2 != null else -1.0, sa2.attack_count if sa2 != null else -1]
		_bm().player_start_battle()
		await _wait_until(func(): return _sw_enemies().size() >= 1, 5.0)
		await _def_frames()
		d5["new_battle"] = _spd_bonus(["spd_a"])
		var after_ok: bool = d5.after_removed.first_gap_ok and not d5.after_removed.intervals.is_empty() and d5.after_removed.intervals.all(func(x): return x == 0.5)
		ok5 = d5.prep == [1.0, 1.0, 1.0, false] and d5.battle == [1.15, 1.0, 1.0] and d5.slow_ts < 1.0 and d5.paused == [true, true, true, 1.15, 1] \
			and absf(float(na5) - (t1 - t0) / buffed_i) <= 1.0 and absf(float(nb5) - (t1 - t0) / 0.5) <= 1.0 and log_ok and d5.gaps_bad.is_empty() \
			and not tower_cd.is_empty() and tower_cd.all(func(x): return float(x) <= 0.8 + 1e-6 and float(x) >= 0.74) and d5.unchanged == [0.5, 100.0, 6.0] \
			and d5.snapshot == [true, 1.15, 3.0, ["spd_a"], _spd_r4(buffed_i), 0.5] and d5["panel_a/b"] == [2.0, 2.3, 2.0, 2.0] \
			and d5.removed == [1.0, 0, true] and after_ok and d5.replaced == [1.15, true] and d5.result == [1.0, false, 1, "WIN"] \
			and d5.new_prep == [0, 1.0, 0] and d5.new_battle == [1.15]
	_check("指揮-5 實際引擎：備戰時不作用；開戰後範圍內的友軍 1.15、範圍外與曹操 1；1 倍、2 倍、部署慢速、手動暫停之後每次冷卻都是 0.5 ÷ 1.15（範圍外 0.5、曹操 1），預定時間差都是前一次的間隔；暫停中次數與遊戲時間不變、加成仍在；同一段遊戲時間的次數各差不到 1 下；防禦塔的冷卻仍是 0.8；快照與面板（2 次 → 2.3 次）；移出曹操馬上沒有加成、正在倒數的不重設；重新放置又有；勝利只結算一次後沒有加成；新的一場沒有殘留",
		ok5, d5)

	# 指揮-6：和其他技能一起（實際引擎；曹操 (2,4)，魏延 (1,4)、張飛 (3,4)、馬超 (1,6)、周瑜 (2,6) 都在範圍內、都打得到不會移動的敵人）：
	# 四位的每次冷卻都是 0.5 ÷ 1.15（第一下之後）；魏延（生命先設成 300）每一擊恢復 15、恢復次數＝攻擊次數；張飛的暈眩次數＝攻擊次數；
	# 馬超的首擊加倍只用一次；周瑜的灼燒間隔仍是 1 秒（不受攻速加成）；打倒敵人後勝利且只結算一次、擊殺 1
	var d6: Dictionary = {}
	var ok6: bool = false
	var team6: Array = [_r12_hero("cao_cao", SPD_AURA_SKILL.duplicate()), _r12_hero("wei_yan", {"id": "lifesteal", "lifesteal_ratio": 0.15}),
		_r12_hero("zhang_fei", {"id": "stun", "stun_sec": 0.5}), _r12_hero("ma_chao", {"id": "first_strike", "first_attack_multiplier": 2}),
		_r12_hero("zhou_yu", {"id": "burn", "burn_ratio": 0.2, "burn_ticks": 3, "burn_interval": 1.0})]
	for i in range(team6.size()):
		team6[i]["slot"] = i + 1
	_spd_load(rec, "spd-6", [[_grp("spd_post", 1, 0.02)]], team6,
		{"cao_cao": Vector2i(2, 4), "wei_yan": Vector2i(1, 4), "zhang_fei": Vector2i(3, 4), "ma_chao": Vector2i(1, 6), "zhou_yu": Vector2i(2, 6)})
	await _def_frames()
	var ids6: Array = ["wei_yan", "zhang_fei", "ma_chao", "zhou_yu"]
	var all6: bool = _fly_hero("cao_cao") != null and ids6.all(func(h): return _fly_hero(h) != null)
	if all6:
		_fly_hero("wei_yan").current_hp = 300.0
		var ended6: int = battle_ended_count
		var kills6: int = _bm().kills
		_bm().player_start_battle()
		await _wait_until(func(): return _sw_enemies().size() >= 1, 5.0)
		var e6: Node = _sw_enemies()[0] if not _sw_enemies().is_empty() else null
		await _spd_watch(3.0, null, [])
		var wy: Node = _fly_hero("wei_yan")
		var zf: Node = _fly_hero("zhang_fei")
		d6["bonus"] = _spd_bonus(ids6)
		d6["intervals_ok"] = ids6.map(func(h): return _spd_all(_fly_hero(h).attack_log.slice(1), buffed_i) and _spd_gaps_bad(_fly_hero(h).attack_log).is_empty())
		d6["wei_yan"] = [wy.attack_count, wy.lifesteal_count, _spd_r4(wy.lifesteal_total)]
		d6["zhang_fei"] = [zf.attack_count, zf.stun_count]
		d6["first_strike_used"] = _bm()._first_strike_used.keys()
		d6["burn"] = [e6._burn_interval, e6.burn_state().ticks_left > 0] if is_instance_valid(e6) else []
		if is_instance_valid(e6):
			e6.take_damage(1.0e12)
		await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 5.0)
		await _def_frames()
		d6["result"] = [battle_ended_count - ended6, _bm().kills - kills6, last_result.get("result")]
		ok6 = d6.bonus == [1.15, 1.15, 1.15, 1.15] and d6.intervals_ok == [true, true, true, true] and d6.wei_yan[0] >= 6 and d6.wei_yan[1] == d6.wei_yan[0] \
			and is_equal_approx(float(d6.wei_yan[2]), 15.0 * d6.wei_yan[0]) and d6.zhang_fei[0] >= 6 and d6.zhang_fei[1] == d6.zhang_fei[0] \
			and d6.first_strike_used == ["ma_chao"] and d6.burn == [1.0, true] and d6.result == [1, 1, "WIN"]
	_check("指揮-6 和其他技能一起：魏延、張飛、馬超、周瑜都在範圍內，每次冷卻都是 0.5 ÷ 1.15；魏延每一擊恢復 15、恢復次數＝攻擊次數；張飛的暈眩次數＝攻擊次數；馬超的首擊加倍只用一次；周瑜的灼燒間隔仍是 1 秒；勝利只結算一次、擊殺 1",
		ok6, d6)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 敵人受傷的入口：拒絕無效的傷害 ──
# 傷害不是正的有限數字（0、負數、NaN、正負無限大），或敵人已經倒下、正要被移除時：回傳 0，生命、傷害數字、閃爍、音效都不變，
# 不發死亡信號（不會被擊殺、不影響結算）；正常的傷害照常扣血，回傳實際扣掉的生命（致死的一擊不含溢出的部分）

## parent 底下目前的傷害數字（FloatingText）數量
func _dmg_texts(parent: Node) -> int:
	var n: int = 0
	for c in parent.get_children():
		if c is FloatingText and not c.is_queued_for_deletion():
			n += 1
	return n

## 受擊與死亡音效的節省模式冷卻（播放後才會大於 0）：測試前歸零，之後讀取就知道有沒有播放
func _dmg_sfx_reset(sfx: Node) -> void:
	sfx._cooldowns["enemy_hit"] = 0.0
	sfx._cooldowns["enemy_die"] = 0.0

func _dmg_sfx_state(sfx: Node) -> Array:
	return [float(sfx._cooldowns.get("enemy_hit", 0.0)), float(sfx._cooldowns.get("enemy_die", 0.0))]

func _damage_input_cases() -> void:
	# 受傷-1：單獨的敵人（真正的 Enemy 程式，血量 100，不在戰鬥流程裡）。音效打開、節省模式，用冷卻判斷有沒有播放：
	# a 0、-5、NaN、+∞、-∞：回傳 0，生命仍是有限的 100、沒有倒下、死亡信號 0、沒有傷害數字、沒有閃爍、受擊與死亡音效都沒有播放；
	# b 正要被移除（queue_free 之後、還沒倒下，例如切換關卡時被清掉）受到 500：回傳 0、生命 100、死亡信號 0、沒有傷害數字；
	# c 灼燒的每跳傷害是 NaN 或 +∞：灼燒的入口就拒絕（不開始灼燒），生命仍是 100、沒有倒下；
	# d 正常：受到 30 回傳 30（剩 70、有傷害數字、閃爍、受擊音效），剩 70 時受到 100 回傳 70（溢出的 30 不算；生命 0、倒下、死亡信號一次），
	#   倒下後再受到 10、+∞、NaN 都回傳 0，死亡信號仍是一次、沒有新的傷害數字
	var sfx: Node = root.get_node("SFXManager")
	var sfx_prev: Array = [sfx.sfx_enabled, sfx.sfx_polyphony]
	sfx.sfx_enabled = true
	sfx.sfx_polyphony = "single"
	var holder := _dodge_holder()
	var a1: Dictionary = {}
	var bad_a: Array = []
	for pair in [["zero", 0.0], ["negative", -5.0], ["nan", NAN], ["+inf", INF], ["-inf", -INF]]:
		var e: Node = _stn_enemy(holder, 0.0, {"hp": 100.0})
		var deaths: Array = [0]
		e.died.connect(func(_x): deaths[0] += 1)
		_dmg_sfx_reset(sfx)
		var t0: int = _dmg_texts(holder)
		var ret: float = e.take_damage(pair[1])
		var row: Array = [ret, e.current_hp, is_finite(e.current_hp), e.is_dead(), deaths[0], _dmg_texts(holder) - t0, e._flash_timer, _dmg_sfx_state(sfx)]
		a1[pair[0]] = row
		if row != [0.0, 100.0, true, false, 0, 0, 0.0, [0.0, 0.0]]:
			bad_a.append(pair[0])
	var eq: Node = _stn_enemy(holder, 0.0, {"hp": 100.0})
	var dq: Array = [0]
	eq.died.connect(func(_x): dq[0] += 1)
	eq.queue_free()
	var tq: int = _dmg_texts(holder)
	var b1: Array = [eq.take_damage(500.0), eq.current_hp, dq[0], _dmg_texts(holder) - tq]
	var c1: Dictionary = {}
	for pair in [["nan", NAN], ["+inf", INF]]:
		var eb: Node = _stn_enemy(holder, 0.0, {"hp": 100.0})
		var db: Array = [0]
		eb.died.connect(func(_x): db[0] += 1)
		eb.apply_burn(pair[1], 3, 0.1)
		for i in range(6):
			eb._physics_process(0.1)
		c1[pair[0]] = [eb.current_hp, eb.is_dead(), db[0]]
	var en: Node = _stn_enemy(holder, 0.0, {"hp": 100.0})
	var dn: Array = [0]
	en.died.connect(func(_x): dn[0] += 1)
	_dmg_sfx_reset(sfx)
	var tn: int = _dmg_texts(holder)
	var d_hit: Array = [en.take_damage(30.0), en.current_hp, _dmg_texts(holder) - tn, en._flash_timer > 0.0, _dmg_sfx_state(sfx)[0] > 0.0]
	var d_kill: Array = [en.take_damage(100.0), en.current_hp, en.is_dead(), dn[0]]
	var tk: int = _dmg_texts(holder)
	var d_after: Array = [en.take_damage(10.0), en.take_damage(INF), en.take_damage(NAN), en.current_hp, dn[0], _dmg_texts(holder) - tk]
	holder.queue_free()
	for p in sfx._players:
		p.stop()
	sfx.sfx_enabled = sfx_prev[0]
	sfx.sfx_polyphony = sfx_prev[1]
	_check("受傷-1 無效的傷害不改變敵人：0、負數、NaN、正負無限大回傳 0，生命仍是 100、沒有倒下、沒有死亡信號、傷害數字、閃爍與音效；正要被移除的敵人受到 500 也不變；灼燒每跳是 NaN／無限大時不扣血；正常受到 30 回傳 30（數字、閃爍、音效照常），剩 70 時受到 100 回傳 70、死亡信號一次，倒下後再受傷都回傳 0、不重複死亡",
		bad_a.is_empty() and b1 == [0.0, 100.0, 0, 0] and c1.nan == [100.0, false, 0] and c1["+inf"] == [100.0, false, 0]
			and d_hit == [30.0, 70.0, 1, true, true] and d_kill == [70.0, 0.0, true, 1] and d_after == [0.0, 0.0, 0.0, 0.0, 1, 0],
		{"bad": bad_a, "invalid": a1, "queued": b1, "burn": c1, "hit": d_hit, "kill": d_kill, "after": d_after})

	# 受傷-2：實際引擎（Main、WaveManager、BattleManager）：一波只有一隻不會移動的敵人（血量 130），開戰並出兵後：
	# 0、負數、NaN、+∞、-∞ 的傷害都回傳 0，0.3 秒後生命仍是 130、場上仍有 1 隻、擊殺 0、戰鬥金幣不變、仍在戰鬥中、沒有結算；
	# 之後受到 1000 回傳 130（溢出的 870 不算），同一幀再受到 1000、+∞ 都回傳 0；勝利且只結算一次、擊殺 1、金幣只加一次擊殺獎勵
	_load(_payload("dmg_input", [[_grp("ember", 1, 0.1)]]))
	var ended0: int = battle_ended_count
	var gold0: int = _bm().battle_gold
	_bm().player_start_battle()
	await _wait_until(func(): return _wm().get_active_enemy_count() == 1, 2.0)
	var e2: Node = null
	for c in main.units_layer.get_children():
		if c is Enemy and not c.is_queued_for_deletion():
			e2 = c
	# 敵人被打倒後會被釋放，之後不能再用 e2 判斷有沒有找到
	var found2: bool = e2 != null
	var inv2: Array = []
	var mid2: Dictionary = {}
	var fin2: Dictionary = {}
	if found2:
		for v in [0.0, -5.0, NAN, INF, -INF]:
			inv2.append(e2.take_damage(v))
		await _wait(0.3)
		mid2 = {"ret": inv2, "hp": e2.current_hp, "active": _wm().get_active_enemy_count(), "kills": _bm().kills,
			"gold": _bm().battle_gold - gold0, "state": _bm().game_state, "ended": battle_ended_count - ended0}
		fin2["ret"] = [e2.take_damage(1000.0), e2.take_damage(1000.0), e2.take_damage(INF)]
		await _wait_until(func(): return _bm().game_state == 3, 3.0)
		await _wait(0.3)
		fin2.merge({"kills": _bm().kills, "gold": _bm().battle_gold - gold0, "ended": battle_ended_count - ended0,
			"result": last_result.get("result"), "kills_result": last_result.get("kills")})
	_check("受傷-2 實際引擎：場上的敵人受到 0、負數、NaN、正負無限大的傷害後生命仍是 130、仍在場上、擊殺 0、金幣不變、沒有結算；受到 1000 回傳 130、同一幀再打都回傳 0；勝利且只結算一次、擊殺 1、金幣只加一次擊殺獎勵",
		found2 and inv2 == [0.0, 0.0, 0.0, 0.0, 0.0] and mid2.get("hp") == 130.0 and mid2.get("active") == 1 and mid2.get("kills") == 0
			and mid2.get("gold") == 0 and mid2.get("state") == 2 and mid2.get("ended") == 0
			and fin2.get("ret") == [130.0, 0.0, 0.0] and fin2.get("kills") == 1 and fin2.get("gold") == BattleManager.GOLD_PER_KILL
			and fin2.get("ended") == 1 and fin2.get("result") == "WIN" and fin2.get("kills_result") == 1,
		{"found": found2, "mid": mid2, "final": fin2})
	_load(_stage_b())

# ── 吸血（魏延）──
# 每次普通攻擊命中後，恢復這一擊實際扣掉敵人的生命 × 15%（不含溢出的傷害；打倒敵人的那一擊也算）；
# 不超過最大生命、已經倒下或正要被移除時不恢復；只算自己這一擊的直接傷害（灼燒、橫掃原型的副目標、其他武將與防禦塔都不算）

## 魏延的吸血（和網頁 utils/heroSkills 的出征參數相同）
const LS_SKILL: Dictionary = {"id": "lifesteal", "lifesteal_ratio": 0.15}
## 實際引擎用的敵人：不會移動的地面兵（血量很多）、慢速地面兵（每秒 20 像素、攻擊力 100；普通與免疫減速）、不會移動的飛行兵、
## 血量 30 的不會移動的地面兵（魏延一擊打倒，實際只扣 30）
const LS_ENEMIES: Array = [
	{"enemy_id": "ls_post", "name": "P", "hp": 99999.0, "speed": 0.0},
	{"enemy_id": "ls_walk", "name": "W", "hp": 99999.0, "speed": 20.0, "atk": 100},
	{"enemy_id": "ls_walk_imm", "name": "I", "hp": 99999.0, "speed": 20.0, "atk": 100, "trait": "immune_slow"},
	{"enemy_id": "ls_fly", "name": "F", "hp": 99999.0, "speed": 0.0, "movement_type": "flying"},
	{"enemy_id": "ls_soft", "name": "S", "hp": 30.0, "speed": 0.0},
]
## 阻路的魏延（防禦 50）在劉備的防禦光環裡（防禦 60）被攻擊力 100 的敵人打一下實際扣的血：100 × 100 ÷（60 ＋ 100）
const LS_BLOCK_AURA_DMG: float = 100.0 * 100.0 / 160.0

func _ls_near(a: Variant, b: float, eps: float = 1e-9) -> bool:
	return (a is float or a is int) and absf(float(a) - b) < eps

## 每一擊的 [武將生命的變化, 敵人生命的變化] 和 want 逐一相符（容許浮點誤差）
func _ls_hits_ok(hits: Array, want: Array) -> bool:
	if hits.size() != want.size():
		return false
	for i in range(hits.size()):
		if not (_ls_near(hits[i][0], float(want[i][0]), 1e-6) and _ls_near(hits[i][1], float(want[i][1]), 1e-6)):
			return false
	return true

## 單獨的魏延（真正的 Hero 腳本，不經過 Main、測試自己呼叫 _process）：攻擊力 atk_v、射程 3 格、攻擊間隔 1 秒、最大生命 1000、目前生命 hp；
## skill 是 null 時帶吸血的參數；wave 是假的 WaveManager（R20Wave），敵人放在 wave.enemies
func _ls_hero(holder: Node, wave: Node, hp: float, atk_v: float = 100.0, skill: Variant = null) -> Node:
	var h: Node = load("res://entities/hero/Hero.gd").new()
	holder.add_child(h)
	h.set_process(false)
	h.hero_id = "wei_yan"
	h.attack_range = 3.0
	h.attack_speed = 1.0
	h.atk = atk_v
	h.max_hp = 1000.0
	h.current_hp = hp
	h._read_skill({"skill": LS_SKILL.duplicate() if skill == null else skill})
	h._wave_mgr = wave
	return h

## 固定步進用的敵人（不會移動）：血量 hp，放在 (x, 0)（武將在原點，射程 3 格＝144 像素）
func _ls_enemy(holder: Node, wave: Node, hp: float, x: float = 48.0) -> Node:
	var e: Node = _stn_enemy(holder, 0.0, {"hp": hp})
	e.position = Vector2(x, 0.0)
	wave.enemies.append(e)
	return e

## 讓武將打一擊（攻擊冷卻歸零後處理一步）：回傳 [武將生命的變化, 敵人被打掉的生命]
func _ls_hit(h: Node, e: Node) -> Array:
	var h0: float = h.current_hp
	var e0: float = e.current_hp
	h._atk_timer = 0.0
	h._process(1.0 / 60.0)
	return [h.current_hp - h0, e0 - e.current_hp]

## 單獨的魏延對一個敵人連打 n 擊：每一擊的 [武將生命的變化, 敵人被打掉的生命]、目前生命、實際恢復的次數與總量、紀錄、
## 敵人的死亡信號次數與是否倒下、恢復提示（綠色的「+」文字）
func _ls_case(hp: float, enemy_hp: float, n: int = 1, atk_v: float = 100.0, skill: Variant = null) -> Dictionary:
	var holder := _dodge_holder()
	var wave := R20Wave.new()
	holder.add_child(wave)
	var h: Node = _ls_hero(holder, wave, hp, atk_v, skill)
	var e: Node = _ls_enemy(holder, wave, enemy_hp)
	var died: Array = [0]
	var on_died := func(_x) -> void:
		died[0] = int(died[0]) + 1
	e.died.connect(on_died)
	var hits: Array = []
	for i in range(n):
		hits.append(_ls_hit(h, e))
	var r: Dictionary = {"hits": hits, "hp": h.current_hp, "count": h.lifesteal_count, "total": h.lifesteal_total, "log": h.lifesteal_log.duplicate(true),
		"ratio": h.lifesteal_ratio, "died": died[0], "dead": e.is_dead()}
	r["texts"] = (await _dodge_texts(holder)).filter(func(t): return str(t).begins_with("+"))
	holder.queue_free()
	return r

## 實際引擎：載入一場（經過 JSON）並依 cells 放置武將（hero_id → 格子），不開戰。
## 魏延的職業 wy_job、射程 wy_range 格、攻擊間隔 1 秒；張飛（射程 2.5 格、攻擊間隔 1.5 秒）與劉備（射程 3 格）用來測組合
func _ls_load(rec: Node, battle_id: String, waves: Array, team: Array, cells: Dictionary, wy_job: String = "infantry", wy_range: float = 2.5) -> void:
	var p: Dictionary = _r12_payload("ls_" + battle_id, waves, battle_id, team)
	p["heroes_config"] = [
		{"hero_id": "wei_yan", "name": "魏延", "job": wy_job, "attack_range": wy_range, "attack_speed": 1.0},
		{"hero_id": "zhang_fei", "name": "張飛", "job": "infantry", "attack_range": 2.5, "attack_speed": 1.5},
		{"hero_id": "liu_bei", "name": "劉備", "job": "infantry", "attack_range": 3.0, "attack_speed": 0.5},
	]
	for c in LS_ENEMIES:
		p["enemies_config"].append(c.duplicate())
	_r19_js(rec, p)
	for hid in cells:
		_r12_place(hid, cells[hid])

## 出征的魏延（攻擊力 100、防禦 50、最大生命 1000）；skill 是 null 時帶吸血的參數
func _ls_wy(skill: Variant = null) -> Dictionary:
	return _r12_hero("wei_yan", LS_SKILL.duplicate() if skill == null else skill)

## 載入後把場上的魏延的生命改成 hp（測試的起點，不是治療）；回傳魏延（不在場上時是 null）
func _ls_set_hp(hp: float) -> Node:
	var wy: Node = _fly_hero("wei_yan")
	if wy != null:
		wy.current_hp = hp
	return wy

## 實際引擎：逐個物理步進記錄魏延 h 與敵人 e 的生命變化（在 physics_frame 信號當下讀取），直到 stop(rows) 回傳 true 或牆鐘 wall_ms 毫秒。
## 每一列：dh＝魏延的生命變化、de＝敵人被打掉的生命、dt＝物理時鐘前進的時間、ts＝時間倍率。each(row) 在每一列之後呼叫
func _ls_track(h: Node, e: Node, wall_ms: int, stop: Callable, each: Callable = Callable()) -> Array:
	var rows: Array = []
	var w_end: int = Time.get_ticks_msec() + wall_ms
	await physics_frame
	var ph: float = h.current_hp
	var pe: float = e.current_hp
	var pt: float = _pt()
	while Time.get_ticks_msec() < w_end:
		await physics_frame
		if not is_instance_valid(h) or not is_instance_valid(e) or e.is_queued_for_deletion():
			break
		var row: Dictionary = {"dh": snappedf(h.current_hp - ph, 0.0001), "de": snappedf(pe - e.current_hp, 0.0001), "dt": _pt() - pt, "ts": Engine.time_scale}
		ph = h.current_hp
		pe = e.current_hp
		pt = _pt()
		rows.append(row)
		if each.is_valid():
			each.call(row)
		if stop.call(rows):
			break
	return rows

## 每一列：被打掉 100 的列魏延同一步恢復 15、沒有命中的列生命不變；回傳不符合的列（最多 5 列）
func _ls_bad_rows(rows: Array) -> Array:
	var bad: Array = []
	for i in range(rows.size()):
		var r: Dictionary = rows[i]
		var ok: bool = (float(r.de) == 0.0 and float(r.dh) == 0.0) or (absf(float(r.de) - 100.0) < 1e-3 and absf(float(r.dh) - 15.0) < 1e-3)
		if not ok:
			bad.append({"i": i, "row": r})
	return bad.slice(0, 5)

func _lifesteal_cases() -> void:
	# 吸血-0：技能參數的判讀：lifesteal_ratio 是大於 0、不超過 1 的有限數字才啟用（0.15、0.5、1、1.0、0.0001、經過 JSON 的 0.15）；
	# 字串、布林、null、陣列、NaN、無限大、0、負數、超過 1、沒有欄位、不認得或大小寫不同的 id、其他技能都不啟用；吸血不帶其他技能，改成沒有技能後清除
	var h0: Node = load("res://entities/hero/Hero.gd").new()
	var bad0: Array = []
	for c in [[{"id": "lifesteal", "lifesteal_ratio": 0.15}, 0.15], [{"id": "lifesteal", "lifesteal_ratio": 0.5}, 0.5], [{"id": "lifesteal", "lifesteal_ratio": 1}, 1.0],
			[{"id": "lifesteal", "lifesteal_ratio": 1.0}, 1.0], [{"id": "lifesteal", "lifesteal_ratio": 0.0001}, 0.0001],
			[{"id": "lifesteal", "lifesteal_ratio": "0.15"}, 0.0], [{"id": "lifesteal", "lifesteal_ratio": true}, 0.0], [{"id": "lifesteal", "lifesteal_ratio": null}, 0.0],
			[{"id": "lifesteal", "lifesteal_ratio": [0.15]}, 0.0], [{"id": "lifesteal", "lifesteal_ratio": NAN}, 0.0], [{"id": "lifesteal", "lifesteal_ratio": INF}, 0.0],
			[{"id": "lifesteal", "lifesteal_ratio": -INF}, 0.0], [{"id": "lifesteal", "lifesteal_ratio": 0}, 0.0], [{"id": "lifesteal", "lifesteal_ratio": 0.0}, 0.0],
			[{"id": "lifesteal", "lifesteal_ratio": -0.15}, 0.0], [{"id": "lifesteal", "lifesteal_ratio": 1.0001}, 0.0], [{"id": "lifesteal", "lifesteal_ratio": 15}, 0.0],
			[{"id": "lifesteal"}, 0.0], [{"id": "lifesteal_x", "lifesteal_ratio": 0.15}, 0.0], [{"id": "Lifesteal", "lifesteal_ratio": 0.15}, 0.0],
			[{"id": "stun", "stun_sec": 0.5}, 0.0], [{"id": "def_aura", "def_mult": 1.2}, 0.0], [null, 0.0]]:
		var st: Dictionary = {} if c[0] == null else {"skill": c[0]}
		h0._read_skill(st)
		if h0.lifesteal_ratio != float(c[1]):
			bad0.append(str(c[0]))
	h0._read_skill({"skill": JSON.parse_string("{\"id\": \"lifesteal\", \"lifesteal_ratio\": 0.15}")})
	var json0: float = h0.lifesteal_ratio
	var other0: Array = [h0.stun_duration, h0.slow_aura_mult, h0.def_aura_mult, h0.dodge_chance, h0.first_strike_multiplier, h0.range_multiplier, h0.burn_ratio, h0.sweep_ratio]
	h0._read_skill({})
	var cleared0: float = h0.lifesteal_ratio
	h0.free()
	_check("吸血-0 技能參數：lifesteal_ratio 0.15、0.5、1、1.0、0.0001 與經過 JSON 的 0.15 啟用；字串、布林、null、陣列、NaN、無限大、0、負數、超過 1、沒有欄位、不認得或大小寫不同的 id、其他技能都不啟用（當作普通攻擊）；吸血不帶其他技能、改成沒有技能後清除",
		bad0.is_empty() and json0 == 0.15 and other0 == [0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0] and cleared0 == 0.0,
		{"bad": bad0, "json": json0, "other": other0, "cleared": cleared0})

	# 吸血-0b：敵人受傷的回傳值（實際扣掉的生命，不含溢出的部分）：血量 100 的敵人受到 30 回傳 30（剩 70）、0 回傳 0（不變）、
	# 100 回傳 70（打倒、死亡信號一次）、倒下後再受到 10 回傳 0（死亡信號仍是一次）；負數、NaN、無限大的傷害回傳 0，
	# 而且生命仍是 100、沒有倒下（無效的傷害被拒絕，不是只把回傳值當 0；其餘狀態見受傷-1）
	var holder := _dodge_holder()
	var died0: Array = [0]
	var on_died0 := func(_x) -> void:
		died0[0] = int(died0[0]) + 1
	var ea: Node = _stn_enemy(holder, 0.0, {"hp": 100.0})
	ea.died.connect(on_died0)
	var r0: Array = [ea.take_damage(30.0), ea.current_hp, ea.take_damage(0.0), ea.current_hp, ea.take_damage(100.0), ea.current_hp, ea.is_dead(), int(died0[0])]
	r0 += [ea.take_damage(10.0), int(died0[0])]
	var eb: Node = _stn_enemy(holder, 0.0, {"hp": 100.0})
	var eb_r: Array = [eb.take_damage(-5.0), eb.current_hp, eb.is_dead()]
	var ec: Node = _stn_enemy(holder, 0.0, {"hp": 100.0})
	var ec_r: Array = [ec.take_damage(NAN), ec.current_hp, ec.is_dead()]
	var ed: Node = _stn_enemy(holder, 0.0, {"hp": 100.0})
	var ed_r: Array = [ed.take_damage(INF), ed.current_hp, ed.is_dead()]
	holder.queue_free()
	_check("吸血-0b 敵人受傷的回傳值：受到 30 回傳 30、0 回傳 0、剩 70 時受到 100 回傳 70（打倒、死亡信號一次）、倒下後回傳 0（死亡信號仍是一次）；負數、NaN、無限大的傷害回傳 0，生命仍是 100、沒有倒下",
		r0 == [30.0, 70.0, 0.0, 70.0, 70.0, 0.0, true, 1, 0.0, 1] and eb_r == [0.0, 100.0, false] and ec_r == [0.0, 100.0, false] and ed_r == [0.0, 100.0, false],
		{"a": r0, "negative": eb_r, "nan": ec_r, "inf": ed_r})

	# 吸血-1：單獨的魏延（真正的 Hero 程式，攻擊力 100、最大生命 1000），每一擊之前冷卻歸零：
	# a 生命 500 打一擊：敵人扣 100、魏延同一步恢復 15（515），紀錄是實際傷害 100、恢復 15，出現綠色的「+15」；
	# b 敵人只剩 30：這一擊打倒它、只恢復 4.5（不是 15），「+4.5」，死亡信號一次；之後沒有目標，再打兩次都不恢復；
	# c 比例 1 時打倒只剩 30 的敵人只恢復 30；d 生命 998 只恢復到 1000（+2）；e 滿血：恢復 0、不顯示提示，紀錄的恢復是 0；
	# f 攻擊力 0.01：恢復 0.0015（不取整、不吞掉，提示太小不顯示）；g 攻擊力 0：沒有傷害、不恢復也不記錄；
	# h 技能 id 不認得（lifesteal_x）：照常扣 100、不恢復；i 生命 100 連打 5 擊：每擊恢復 15，175、恢復 5 次共 75
	var c1: Dictionary = {}
	c1["hit"] = await _ls_case(500.0, 99999.0)
	c1["kill"] = await _ls_case(500.0, 30.0, 3)
	c1["kill_all"] = await _ls_case(500.0, 30.0, 1, 100.0, {"id": "lifesteal", "lifesteal_ratio": 1})
	c1["cap"] = await _ls_case(998.0, 99999.0)
	c1["full"] = await _ls_case(1000.0, 99999.0)
	c1["tiny"] = await _ls_case(500.0, 99999.0, 1, 0.01)
	c1["zero"] = await _ls_case(500.0, 99999.0, 1, 0.0)
	c1["unknown"] = await _ls_case(500.0, 99999.0, 1, 100.0, {"id": "lifesteal_x", "lifesteal_ratio": 0.15})
	c1["multi"] = await _ls_case(100.0, 99999.0, 5)
	var ok1: Dictionary = {}
	ok1["hit"] = _ls_hits_ok(c1.hit.hits, [[15, 100]]) and _ls_near(c1.hit.hp, 515.0) and c1.hit.count == 1 and c1.hit.texts == ["+15"] \
		and c1.hit.log.size() == 1 and _ls_near(c1.hit.log[0].dealt, 100.0) and _ls_near(c1.hit.log[0].heal, 15.0)
	ok1["kill"] = _ls_hits_ok(c1.kill.hits, [[4.5, 30], [0, 0], [0, 0]]) and _ls_near(c1.kill.hp, 504.5) and c1.kill.count == 1 and c1.kill.died == 1 \
		and c1.kill.dead and c1.kill.texts == ["+4.5"] and c1.kill.log.size() == 1 and _ls_near(c1.kill.log[0].dealt, 30.0)
	ok1["kill_all"] = _ls_hits_ok(c1.kill_all.hits, [[30, 30]]) and _ls_near(c1.kill_all.hp, 530.0)
	ok1["cap"] = _ls_hits_ok(c1.cap.hits, [[2, 100]]) and c1.cap.hp == 1000.0 and c1.cap.texts == ["+2"]
	ok1["full"] = _ls_hits_ok(c1.full.hits, [[0, 100]]) and c1.full.hp == 1000.0 and c1.full.count == 0 and c1.full.texts.is_empty() \
		and c1.full.log.size() == 1 and float(c1.full.log[0].heal) == 0.0
	ok1["tiny"] = _ls_hits_ok(c1.tiny.hits, [[0.0015, 0.01]]) and _ls_near(c1.tiny.hp, 500.0015, 1e-9) and c1.tiny.count == 1 and c1.tiny.texts.is_empty()
	ok1["zero"] = _ls_hits_ok(c1.zero.hits, [[0, 0]]) and c1.zero.count == 0 and c1.zero.log.is_empty() and c1.zero.texts.is_empty()
	ok1["unknown"] = _ls_hits_ok(c1.unknown.hits, [[0, 100]]) and c1.unknown.count == 0 and c1.unknown.ratio == 0.0
	ok1["multi"] = _ls_hits_ok(c1.multi.hits, [[15, 100], [15, 100], [15, 100], [15, 100], [15, 100]]) and _ls_near(c1.multi.hp, 175.0) \
		and c1.multi.count == 5 and _ls_near(c1.multi.total, 75.0)
	var bad1: Array = ok1.keys().filter(func(k): return not ok1[k])
	_check("吸血-1 單獨的魏延：普通命中 100 恢復 15（「+15」）；打倒只剩 30 的敵人恢復 4.5（比例 1 時 30），之後沒有目標不恢復；只差 2 時恢復 2；滿血恢復 0、不顯示；攻擊力 0.01 恢復 0.0015（不取整）；攻擊力 0 不恢復；不認得的 id 不恢復；連打 5 擊共恢復 75",
		bad1.is_empty(), {"bad": bad1, "cases": c1})

	# 吸血-1b：不會恢復：傷害 0、負數、NaN、無限大；生命 0（已經倒下）；正要被移除（queue_free 之後）；
	# 被敵人打倒的魏延即使再處理一次攻擊，也不恢復、生命仍是 0（不會復活）；
	# 目標的受傷沒有回傳值（測試用的假目標）：攻擊照常完成（命中一次、冷卻設回攻擊間隔），不恢復、沒有 script error
	var hz := _dodge_holder()
	var wz := R20Wave.new()
	hz.add_child(wz)
	var hi: Node = _ls_hero(hz, wz, 500.0)
	for v in [0.0, -10.0, NAN, INF, -INF]:
		hi._lifesteal(v)
	var hd: Node = _ls_hero(hz, wz, 0.0)
	hd._lifesteal(100.0)
	var hq: Node = _ls_hero(hz, wz, 500.0)
	hq.queue_free()
	hq._lifesteal(100.0)
	var hk: Node = _ls_hero(hz, wz, 50.0)
	var ek: Node = _ls_enemy(hz, wz, 99999.0)
	hk.take_damage(1.0e12)
	var k1: Array = _ls_hit(hk, ek)
	var wv := R20Wave.new()
	hz.add_child(wv)
	var hv: Node = _ls_hero(hz, wv, 500.0)
	var tv := R20Target.new()
	hz.add_child(tv)
	tv.position = Vector2(48.0, 0.0)
	wv.enemies.append(tv)
	hv._atk_timer = 0.0
	hv._process(1.0 / 60.0)
	var d1b: Dictionary = {"invalid": [hi.current_hp, hi.lifesteal_count, hi.lifesteal_log.size()], "dead": [hd.current_hp, hd.lifesteal_count],
		"queued": [hq.current_hp, hq.lifesteal_count], "killed": [hk.current_hp, hk.lifesteal_count, hk.is_queued_for_deletion(), k1],
		"no_return": [tv.hits, hv.current_hp, hv.lifesteal_count, hv._atk_timer]}
	hz.queue_free()
	_check("吸血-1b 不恢復：傷害 0／負數／NaN／無限大；生命 0；正要被移除；被打倒的魏延再處理一次攻擊也不恢復（生命仍是 0，不會復活）；目標的受傷沒有回傳值時攻擊照常完成（命中一次、冷卻設回 1 秒）、不恢復",
		d1b.invalid == [500.0, 0, 0] and d1b.dead == [0.0, 0] and d1b.queued == [500.0, 0] and d1b.killed[0] == 0.0 and d1b.killed[1] == 0 and d1b.killed[2] == true
			and d1b.no_return == [1, 500.0, 0, 1.0],
		d1b)

	# 吸血-1c：只算自己這一擊的直接傷害：
	# a 同時設定橫掃原型（測試直接設定欄位；正式資料一位武將只有一個技能）：主目標扣 100、兩個副目標各扣 50，魏延只恢復 15（一次）；
	# b 之後灼燒 3 跳（每跳 50）、直接受到 100（防禦塔的傷害走同一個入口）、另一位沒有吸血的武將普通攻擊，魏延的生命都不變
	var hs := _dodge_holder()
	var ws := R20Wave.new()
	hs.add_child(ws)
	var h_s: Node = _ls_hero(hs, ws, 500.0)
	h_s.sweep_ratio = 0.5
	h_s.sweep_radius = 2.0
	h_s.sweep_max_targets = 2
	var es: Array = [_ls_enemy(hs, ws, 99999.0, 48.0), _ls_enemy(hs, ws, 99999.0, 60.0), _ls_enemy(hs, ws, 99999.0, 72.0)]
	var hp_s0: float = h_s.current_hp
	h_s._atk_timer = 0.0
	h_s._process(1.0 / 60.0)
	var lost_s: Array = es.map(func(e): return snappedf(99999.0 - e.current_hp, 0.0001))
	lost_s.sort()
	var a1c: Dictionary = {"heal": h_s.current_hp - hp_s0, "lost": lost_s, "sweep": [h_s.sweep_count, h_s.sweep_hits], "count": h_s.lifesteal_count}
	var hp_s1: float = h_s.current_hp
	var eb1: Node = es[0]
	var hp_b0: float = eb1.current_hp
	eb1.apply_burn(50.0, 3, 0.1)
	for i in range(8):
		eb1._physics_process(0.05)
	var burn_lost: float = snappedf(hp_b0 - eb1.current_hp, 0.0001)
	eb1.take_damage(100.0)
	var other: Node = _ls_hero(hs, ws, 500.0, 100.0, {"id": "stun", "stun_sec": 0.5})
	other._atk_timer = 0.0
	other._process(1.0 / 60.0)
	var b1c: Dictionary = {"wy": h_s.current_hp - hp_s1, "burn_lost": burn_lost, "burn_left": eb1._burn_ticks_left, "other_ratio": other.lifesteal_ratio,
		"other_stuns": other.stun_count, "wy_count": h_s.lifesteal_count}
	hs.queue_free()
	_check("吸血-1c 只算自己這一擊的直接傷害：帶橫掃原型時主目標 100、副目標各 50，只恢復 15；灼燒 3 跳（150）、直接受到 100、另一位武將的普通攻擊都不讓魏延恢復",
		_ls_near(a1c.heal, 15.0, 1e-6) and a1c.lost == [50.0, 50.0, 100.0] and a1c.sweep == [1, 2] and a1c.count == 1
			and b1c.wy == 0.0 and b1c.burn_lost == 150.0 and b1c.burn_left == 0 and b1c.other_ratio == 0.0 and b1c.other_stuns == 1 and b1c.wy_count == 1,
		{"a": a1c, "b": b1c})

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)

	# 吸血-2：實際引擎（時間倍率與暫停）：魏延在建築格 (5,4)、射程 2.5 格、攻擊間隔 1 秒、攻擊力 100，生命先改成 300；不會移動的地面兵在 (4,5)。
	# 1 倍打 3 擊 → 切到 2 倍再打 3 擊 → 打開部署選單（0.1 倍）打 1 擊 → 關閉選單、回到 1 倍後手動暫停 1 秒（牆鐘）→ 繼續後再打 1 擊：
	# 每一步：敵人被打掉 100 時魏延同一步恢復 15，沒有命中的步數生命不變（沒有另外計時的回血）；暫停中沒有命中、生命不變；
	# 恢復次數＝敵人被命中的次數＝紀錄筆數，最後的生命＝300 ＋ 15 × 命中次數
	var d2: Dictionary = {}
	var ok2: bool = false
	_ls_load(rec, "ls-2", [[_grp("ls_post", 1, 0.02)]], [_ls_wy()], {"wei_yan": Vector2i(5, 4)})
	var wy2: Node = _ls_set_hp(300.0)
	var e2: Node = await _stn_start(Vector2i(4, 5))
	if e2 != null and wy2 != null:
		var st2: Dictionary = {"hits": 0, "phase": 0, "menu": {}, "pause": {}, "rec": rec, "h": wy2, "paused": []}
		var each2 := func(row: Dictionary) -> void:
			if float(row.de) > 0.0:
				st2.hits = int(st2.hits) + 1
			var ph: int = int(st2.phase)
			if ph == 3:
				st2.paused.append(row)
			if ph == 0 and int(st2.hits) >= 3:
				_r19_speed(st2.rec, 2.0)
				st2.phase = 1
			elif ph == 1 and int(st2.hits) >= 6:
				st2.menu = _r19_open(st2.rec, 2)
				st2.phase = 2
			elif ph == 2 and int(st2.hits) >= 7:
				_r19_close(st2.rec, st2.menu)
				_r19_speed(st2.rec, 1.0)
				st2.pause = {"hits": st2.hits, "hp": st2.h.current_hp, "wall": Time.get_ticks_msec(), "reply": _r20_pause(st2.rec, true)}
				st2.phase = 3
			elif ph == 3 and Time.get_ticks_msec() - int(st2.pause.wall) >= 1000:
				st2.pause["hits2"] = st2.hits
				st2.pause["hp2"] = st2.h.current_hp
				st2.pause["frozen"] = _r20_frozen()
				_r20_pause(st2.rec, false)
				st2.phase = 4
		var rows2: Array = await _ls_track(wy2, e2, 60000, func(_r): return int(st2.phase) == 4 and int(st2.hits) >= 8, each2)
		var ever: int = roundi((e2.max_hp - e2.current_hp) / 100.0)
		var hit_ts: Array = rows2.filter(func(r): return float(r.de) > 0.0).map(func(r): return snappedf(float(r.ts), 0.01))
		var p2: Dictionary = st2.pause
		d2 = {"phase": st2.phase, "hits": st2.hits, "ever": ever, "count": wy2.lifesteal_count, "log": wy2.lifesteal_log.size(), "hp": wy2.current_hp,
			"bad_rows": _ls_bad_rows(rows2), "hit_ts": hit_ts, "pause": {"hits": [p2.get("hits"), p2.get("hits2")], "hp": [p2.get("hp"), p2.get("hp2")],
			"frozen": p2.get("frozen"), "rows": st2.paused.size(), "moved": st2.paused.filter(func(r): return float(r.de) != 0.0 or float(r.dh) != 0.0 or float(r.dt) != 0.0).size()},
			"menu": not st2.menu.is_empty(), "ts_now": Engine.time_scale}
		ok2 = int(st2.phase) == 4 and int(st2.hits) >= 8 and d2.bad_rows.is_empty() and ever == wy2.lifesteal_count and ever == wy2.lifesteal_log.size() \
			and _ls_near(wy2.current_hp, 300.0 + 15.0 * float(ever), 1e-6) and hit_ts.has(2.0) and hit_ts.has(0.1) and hit_ts.has(1.0) \
			and p2.get("hits") == p2.get("hits2") and p2.get("hp") == p2.get("hp2") and p2.get("frozen") == true and int(d2.pause.rows) >= 20 and int(d2.pause.moved) == 0 \
			and not st2.menu.is_empty() and is_equal_approx(Engine.time_scale, 1.0)
	_check("吸血-2 實際引擎（1 倍、2 倍、部署慢速、手動暫停）：每次命中敵人扣 100、魏延同一步恢復 15，沒有命中的步數生命不變；暫停 1 秒中沒有命中、生命不變；恢復次數＝命中次數＝紀錄筆數，生命＝300 ＋ 15 × 命中次數",
		ok2, d2)

	# 吸血-3：組合與結算（實際引擎）：
	# a 致死：血量 30 的敵人被魏延一擊打倒：恢復 4.5（不是 15），擊殺 1、只結算一次；
	# b 組合：魏延在道路 (4,5) 擋住免疫減速的敵人（攻擊力 100）、劉備在 (5,4)（防禦光環）、張飛在 (4,6)（暈眩）；魏延生命 600、記錄 6 秒遊戲時間：
	#   魏延的每次恢復都是實際傷害 100 的 15（三位武將都在打同一個敵人），魏延有劉備的加成（1.2），敵人有被暈眩、沒有任何減速；
	#   魏延的生命變化＝恢復總量 − 敵人攻擊次數 × 62.5（防禦 60 的公式）；
	# c 對空：步兵魏延打不到射程內不會移動的飛行兵（2 秒不扣血、不恢復）；職業改成弓兵時打得到，每擊 100 恢復 15；
	# d 空目標：唯一的敵人在射程外 1.5 秒：沒有攻擊、不恢復、冷卻待命在 0；
	# e 技能 id 不認得（lifesteal_x）：照常扣 100，但不恢復
	var d3: Dictionary = {}
	_ls_load(rec, "ls-3a", [[_grp("ls_soft", 1, 0.02)]], [_ls_wy()], {"wei_yan": Vector2i(5, 4)})
	var wy3a: Node = _ls_set_hp(300.0)
	var ended3: int = battle_ended_count
	await _stn_start(Vector2i(4, 5))
	await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 5.0)
	await _wait(0.3)
	d3["a"] = {"hp": wy3a.current_hp if is_instance_valid(wy3a) else -1.0, "log": wy3a.lifesteal_log.duplicate(true) if is_instance_valid(wy3a) else [],
		"kills": _bm().kills, "ended": battle_ended_count - ended3, "result": _bm().game_state == BattleManager.GameState.RESULT}
	var ok3a: bool = _ls_near(d3.a.hp, 304.5, 1e-6) and d3.a.log.size() == 1 and _ls_near(d3.a.log[0].dealt, 30.0, 1e-6) and _ls_near(d3.a.log[0].heal, 4.5, 1e-6) \
		and d3.a.kills == 1 and d3.a.ended == 1 and d3.a.result

	var ok3b: bool = false
	_ls_load(rec, "ls-3b", [[_grp("ls_walk_imm", 1, 0.02)]], [_ls_wy(), _r12_hero("liu_bei", DEF_AURA_SKILL.duplicate()), _stn_zf()],
		{"wei_yan": Vector2i(4, 5), "liu_bei": Vector2i(5, 4), "zhang_fei": Vector2i(4, 6)}, "infantry", 1.5)
	var wy3b: Node = _ls_set_hp(600.0)
	var e3b: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	if e3b != null and wy3b != null:
		await _wait_until(func(): return is_instance_valid(e3b) and e3b._blocker != null, 5.0)
		var hp0: float = wy3b.current_hp
		var atk0: int = e3b.blocker_attacks
		var tot0: float = wy3b.lifesteal_total
		var n0: int = wy3b.lifesteal_count
		var g3: float = _pt()
		await _wait_until(func(): return _pt() - g3 >= 6.0, 30.0)
		var logs: Array = wy3b.lifesteal_log.slice(n0) if wy3b.lifesteal_log.size() == wy3b.lifesteal_count else wy3b.lifesteal_log.duplicate()
		var attacks: int = e3b.blocker_attacks - atk0
		var heals: float = wy3b.lifesteal_total - tot0
		var expect_hp: float = hp0 + heals - float(attacks) * LS_BLOCK_AURA_DMG
		d3["b"] = {"heals": wy3b.lifesteal_count - n0, "heal_total": heals, "attacks": attacks, "hp": wy3b.current_hp, "expect_hp": expect_hp,
			"logs_ok": logs.all(func(x): return absf(float(x.dealt) - 100.0) < 1e-6 and absf(float(x.heal) - 15.0) < 1e-6), "bonus": wy3b.def_bonus_mult,
			"stuns": e3b.stun_count, "immune": e3b.immune_slow, "sources": e3b._slow_sources.size(), "mult": e3b.speed_mult, "blocked": e3b._blocker == wy3b}
		ok3b = int(d3.b.heals) >= 3 and attacks >= 1 and d3.b.logs_ok and _ls_near(wy3b.current_hp, expect_hp, 1e-6) and is_equal_approx(wy3b.def_bonus_mult, 1.2) \
			and e3b.stun_count >= 1 and e3b.immune_slow and e3b._slow_sources.is_empty() and e3b.speed_mult == 1.0 and d3.b.blocked

	var ok3c: bool = false
	_ls_load(rec, "ls-3c", [[_grp("ls_fly", 1, 0.02)]], [_ls_wy()], {"wei_yan": Vector2i(5, 4)})
	var wy3c: Node = _ls_set_hp(500.0)
	var e3c: Node = await _stn_start(Vector2i(4, 5))
	var g3c: float = _pt()
	await _wait_until(func(): return _pt() - g3c >= 2.0, 10.0)
	var c_inf: Array = [e3c.is_flying() if is_instance_valid(e3c) else false, e3c.current_hp == e3c.max_hp if is_instance_valid(e3c) else false,
		wy3c.lifesteal_count if wy3c != null else -1, wy3c.current_hp if wy3c != null else -1.0, wy3c.can_hit_air if wy3c != null else true]
	_ls_load(rec, "ls-3c2", [[_grp("ls_fly", 1, 0.02)]], [_ls_wy()], {"wei_yan": Vector2i(5, 4)}, "archer")
	var wy3c2: Node = _ls_set_hp(500.0)
	var e3c2: Node = await _stn_start(Vector2i(4, 5))
	await _wait_until(func(): return wy3c2 != null and is_instance_valid(wy3c2) and wy3c2.lifesteal_count >= 2, 10.0)
	var c_arc: Array = []
	if wy3c2 != null and is_instance_valid(e3c2):
		var ever3c: int = roundi((e3c2.max_hp - e3c2.current_hp) / 100.0)
		c_arc = [wy3c2.can_hit_air, ever3c, wy3c2.lifesteal_count, _ls_near(wy3c2.current_hp, 500.0 + 15.0 * float(wy3c2.lifesteal_count), 1e-6)]
		ok3c = c_inf == [true, true, 0, 500.0, false] and c_arc[0] == true and int(c_arc[2]) >= 2 and abs(int(c_arc[1]) - int(c_arc[2])) <= 1 and c_arc[3] == true
	d3["c"] = {"infantry": c_inf, "archer": c_arc}

	_ls_load(rec, "ls-3d", [[_grp("ls_post", 1, 0.02)]], [_ls_wy()], {"wei_yan": Vector2i(10, 4)})
	var wy3d: Node = _ls_set_hp(500.0)
	_bm().player_start_battle()
	await _wait_until(func(): return _first_enemy() != null, 5.0)
	var e3d: Node = _first_enemy()
	var g3d: float = _pt()
	await _wait_until(func(): return _pt() - g3d >= 1.5, 8.0)
	d3["d"] = [wy3d.lifesteal_count if wy3d != null else -1, wy3d._atk_timer if wy3d != null else -1.0, wy3d.current_hp if wy3d != null else -1.0,
		e3d.current_hp == e3d.max_hp if is_instance_valid(e3d) else false]

	_ls_load(rec, "ls-3e", [[_grp("ls_post", 1, 0.02)]], [_ls_wy({"id": "lifesteal_x", "lifesteal_ratio": 0.15})], {"wei_yan": Vector2i(5, 4)})
	var wy3e: Node = _ls_set_hp(500.0)
	var e3e: Node = await _stn_start(Vector2i(4, 5))
	var g3e: float = _pt()
	await _wait_until(func(): return _pt() - g3e >= 2.5, 10.0)
	d3["e"] = [roundi((e3e.max_hp - e3e.current_hp) / 100.0) if is_instance_valid(e3e) else -1, wy3e.lifesteal_ratio if wy3e != null else -1.0,
		wy3e.lifesteal_count if wy3e != null else -1, wy3e.current_hp if wy3e != null else -1.0]
	_check("吸血-3 組合與結算：致死只恢復 4.5、擊殺與結算一次；和劉備的防禦光環、張飛的暈眩、免疫減速的敵人一起時，每次恢復都是 100 的 15、生命＝恢復 − 敵人攻擊 × 62.5，防禦加成 1.2、敵人有暈眩沒有減速；步兵打不到飛行兵（不恢復），弓兵打得到（每擊恢復 15）；射程內沒有敵人時不攻擊不恢復；不認得的 id 不恢復",
		ok3a and ok3b and ok3c and d3.d == [0, 0.0, 500.0, true] and int(d3.e[0]) >= 2 and d3.e[1] == 0.0 and d3.e[2] == 0 and d3.e[3] == 500.0, d3)

	# 吸血-4：移位、移除、陣亡與新的一場（實際引擎）：
	# a 魏延（生命 400）打不會移動的敵人，恢復過之後移到 (3,4)（仍在射程內）：移動本身不改變生命，之後每擊照樣恢復 15，生命＝400 ＋ 15 × 恢復次數；
	# b 把魏延移出隊伍（update_team）：魏延不在場上，敵人之後不再被打；
	# c 魏延在道路 (4,5) 擋住敵人時陣亡：之後不在場上（不會被恢復拉回來），敵人不再被擋住、照常前進；
	# d 新的一場：魏延的恢復次數 0、生命是最大生命 1000、沒有紀錄
	var d4: Dictionary = {}
	_ls_load(rec, "ls-4a", [[_grp("ls_post", 1, 0.02)]], [_ls_wy()], {"wei_yan": Vector2i(5, 4)})
	var wy4: Node = _ls_set_hp(400.0)
	var e4: Node = await _stn_start(Vector2i(4, 5))
	await _wait_until(func(): return wy4 != null and is_instance_valid(wy4) and wy4.lifesteal_count >= 1, 5.0)
	var before_move: Array = [wy4.current_hp, wy4.lifesteal_count]
	wy4.reposition(Vector2i(3, 4), main.game_map.grid_to_world(Vector2i(3, 4)), main.game_map)
	var after_move: float = wy4.current_hp
	await _wait_until(func(): return is_instance_valid(wy4) and wy4.lifesteal_count >= int(before_move[1]) + 2, 6.0)
	d4["a"] = {"before": before_move, "after_move": after_move, "count": wy4.lifesteal_count, "hp": wy4.current_hp,
		"ok": _ls_near(wy4.current_hp, 400.0 + 15.0 * float(wy4.lifesteal_count), 1e-6)}
	_r19_js(rec, {"type": "update_team", "team_list": []})
	await _def_frames(3)
	var hp4b: float = e4.current_hp if is_instance_valid(e4) else -1.0
	var g4: float = _pt()
	await _wait_until(func(): return _pt() - g4 >= 1.5, 8.0)
	d4["b"] = [_fly_hero("wei_yan") == null, is_instance_valid(e4) and e4.current_hp == hp4b]

	_ls_load(rec, "ls-4c", [[_grp("ls_walk", 1, 0.02)]], [_ls_wy()], {"wei_yan": Vector2i(4, 5)}, "infantry", 1.5)
	var wy4c: Node = _ls_set_hp(400.0)
	var e4c: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	var ok4c: bool = false
	if e4c != null and wy4c != null:
		await _wait_until(func(): return is_instance_valid(e4c) and e4c._blocker != null and is_instance_valid(wy4c) and wy4c.lifesteal_count >= 1, 5.0)
		var x0: float = e4c.global_position.x
		wy4c.take_damage(1.0e12)
		await _def_frames(5)
		var g4c: float = _pt()
		await _wait_until(func(): return _pt() - g4c >= 1.0, 8.0)
		d4["c"] = {"gone": _fly_hero("wei_yan") == null, "blocker": e4c._blocker == null if is_instance_valid(e4c) else false,
			"moved": (e4c.global_position.x - x0) / float(main._tile_size) if is_instance_valid(e4c) else 0.0}
		ok4c = bool(d4.c.gone) and bool(d4.c.blocker) and float(d4.c.moved) > 0.2

	_ls_load(rec, "ls-4d", [[_grp("ls_post", 1, 0.02)]], [_ls_wy()], {"wei_yan": Vector2i(5, 4)})
	await _def_frames()
	var wy4d: Node = _fly_hero("wei_yan")
	d4["d"] = [wy4d.lifesteal_count if wy4d != null else -1, wy4d.current_hp if wy4d != null else -1.0, wy4d.max_hp if wy4d != null else -1.0,
		wy4d.lifesteal_log.size() if wy4d != null else -1, _first_enemy() == null]
	_check("吸血-4 移位、移除、陣亡與新的一場：移位不改變生命、之後照樣每擊恢復 15；移出隊伍後不在場上、敵人不再被打；擋路時陣亡後不在場上（不會復活），敵人不再被擋住、照常前進；新的一場恢復次數 0、生命 1000、沒有紀錄",
		d4.a.after_move == float(d4.a.before[0]) and int(d4.a.count) >= int(d4.a.before[1]) + 2 and d4.a.ok and d4.b == [true, true] and ok4c and d4.d == [0, 1000.0, 1000.0, 0, true],
		d4)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 灼燒的入口（周瑜「火攻」：拒絕無效的參數）──
# Enemy.apply_burn 只接受正的有限每跳傷害與間隔、正的跳數，已經倒下或正要被移除的敵人不接受；拒絕時什麼都不改
# （沒有新的灼燒，已有的灼燒照原本的時間、跳數與每跳傷害燒完）。Hero._read_skill 的火攻參數：比例與間隔是正的有限數字、
# 跳數是正整數（JSON 的 3.0 也算），三個都合理才啟用，不會從無效或缺少的參數自動補出可用的灼燒

## 無效的灼燒參數：[名稱, 每跳傷害, 跳數, 間隔]
const BI_INVALID: Array = [
	["dmg0", 0.0, 3, 1.0], ["dmg-neg", -5.0, 3, 1.0], ["dmg-nan", NAN, 3, 1.0], ["dmg+inf", INF, 3, 1.0], ["dmg-inf", -INF, 3, 1.0],
	["int0", 20.0, 3, 0.0], ["int-neg", 20.0, 3, -1.0], ["int-nan", 20.0, 3, NAN], ["int+inf", 20.0, 3, INF], ["int-inf", 20.0, 3, -INF],
	["ticks0", 20.0, 0, 1.0], ["ticks-neg", 20.0, -2, 1.0],
]
## 固定步進的長度（秒）：1/16 秒在二進位是精確值，累加不會有誤差（每秒正好 16 步；敵人每一步最多採用 0.1 秒）
const BI_DT: float = 0.0625

## 用 BI_DT 呼叫 steps 次 _physics_process，記錄扣血的步（[步, 扣血]）；敵人倒下後停止
func _bi_steps(e: Node, steps: int) -> Array:
	var out: Array = []
	for i in range(1, steps + 1):
		if e.is_dead():
			break
		var hp0: float = e.current_hp
		e._physics_process(BI_DT)
		var lost: float = hp0 - e.current_hp
		if lost != 0.0:
			out.append([i, snappedf(lost, 0.0001)])
	return out

## 單獨的周瑜（真正的 Hero 腳本，測試自己呼叫 _process）：攻擊力 100、射程 3 格、攻擊間隔 1 秒；skill 是火攻的參數
func _bi_hero(holder: Node, wave: Node, skill: Variant) -> Node:
	var h: Node = load("res://entities/hero/Hero.gd").new()
	holder.add_child(h)
	h.set_process(false)
	h.hero_id = "zhou_yu"
	h.attack_range = 3.0
	h.attack_speed = 1.0
	h.atk = 100.0
	h._read_skill({"skill": skill})
	h._wave_mgr = wave
	return h

func _burn_input_cases() -> void:
	# 灼燒入口-0：火攻參數的判讀：比例與間隔是正的有限數字、跳數是正整數（3 與 JSON 的 3.0）才啟用，三個都要合理；
	# 比例沒有上限（2 也啟用）。字串、布林、null、陣列、NaN、無限大、0、負數、小數的跳數、超過 2^53 − 1 的跳數、沒有欄位
	# （包括沒有間隔：不會自動當作 1 秒）、不認得或大小寫不同的 id 都不啟用（比例 0、跳數 0、間隔 1）；火攻不帶其他技能，改成沒有技能後清除
	var ok_p: Dictionary = {"id": "burn", "burn_ratio": 0.2, "burn_ticks": 3, "burn_interval": 1.0}
	var cases0: Array = [[ok_p, [0.2, 3, 1.0]], [{"id": "burn", "burn_ratio": 0.2, "burn_ticks": 3.0, "burn_interval": 1}, [0.2, 3, 1.0]],
		[{"id": "burn", "burn_ratio": 2, "burn_ticks": 1, "burn_interval": 0.25}, [2.0, 1, 0.25]]]
	for field in ["burn_ratio", "burn_interval", "burn_ticks"]:
		var bads: Array = ["0.2", true, null, [1.0], NAN, INF, -INF, 0, 0.0, -1.0]
		if field == "burn_ticks":
			bads += [2.5, 0.5, 1.0e300, 9007199254740992.0]
		for v in bads:
			var p: Dictionary = ok_p.duplicate()
			p[field] = v
			cases0.append([p, [0.0, 0, 1.0]])
		var missing: Dictionary = ok_p.duplicate()
		missing.erase(field)
		cases0.append([missing, [0.0, 0, 1.0]])
	for p in [{"id": "burn_x", "burn_ratio": 0.2, "burn_ticks": 3, "burn_interval": 1.0}, {"id": "Burn", "burn_ratio": 0.2, "burn_ticks": 3, "burn_interval": 1.0}]:
		cases0.append([p, [0.0, 0, 1.0]])
	var h0: Node = load("res://entities/hero/Hero.gd").new()
	var bad0: Array = []
	for c in cases0:
		h0._read_skill({"skill": c[0]})
		var got: Array = [h0.burn_ratio, h0.burn_ticks, h0.burn_interval]
		if got != c[1]:
			bad0.append({"skill": str(c[0]), "got": got})
	h0._read_skill({"skill": JSON.parse_string("{\"id\": \"burn\", \"burn_ratio\": 0.2, \"burn_ticks\": 3, \"burn_interval\": 1}")})
	var json0: Array = [h0.burn_ratio, h0.burn_ticks, h0.burn_interval, typeof(h0.burn_ticks) == TYPE_INT]
	var other0: Array = [h0.stun_duration, h0.slow_aura_mult, h0.def_aura_mult, h0.dodge_chance, h0.first_strike_multiplier, h0.range_multiplier,
		h0.sweep_ratio, h0.lifesteal_ratio, h0.atk_speed_aura_mult, h0.counter_ratio]
	h0._read_skill({})
	var cleared0: Array = [h0.burn_ratio, h0.burn_ticks, h0.burn_interval]
	h0.free()
	_check("灼燒入口-0 火攻參數：比例與間隔是正的有限數字、跳數是正整數（3、JSON 的 3.0）才啟用，比例 2 也啟用；任何一個是字串、布林、null、陣列、NaN、無限大、0、負數、小數的跳數、過大的跳數或沒有欄位（沒有間隔不會當作 1 秒）、id 不認得或大小寫不同時不啟用；火攻不帶其他技能、改成沒有技能後清除",
		bad0.is_empty() and json0 == [0.2, 3, 1.0, true] and other0 == [0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0] and cleared0 == [0.0, 0, 1.0],
		{"bad": bad0, "cases": cases0.size(), "json": json0, "other": other0, "cleared": cleared0})

	# 灼燒入口-1：沒有灼燒的敵人（血量 100）收到無效的參數（每跳傷害 0／負數／NaN／正負無限大、間隔 0／負數／NaN／正負無限大、跳數 0／負數）：
	# 不顯示灼燒（is_burning 是 false）、狀態不變（剩餘跳數 0、每跳傷害 0、間隔 1、計時 0），之後 6 秒都不扣血、沒有倒下、沒有傷害數字
	var holder := _dodge_holder()
	var rows1: Dictionary = {}
	var bad1: Array = []
	for c in BI_INVALID:
		var e: Node = _stn_enemy(holder, 0.0, {"hp": 100.0})
		var died: Array = [0]
		e.died.connect(func(_x): died[0] += 1)
		var t0: int = _dmg_texts(holder)
		e.apply_burn(c[1], c[2], c[3])
		var row: Array = [e.is_burning(), e._burn_ticks_left, e._burn_damage, e._burn_interval, e._burn_timer]
		row += [_bi_steps(e, 96), e.current_hp, e.is_burning(), died[0], _dmg_texts(holder) - t0]
		rows1[c[0]] = str(row)
		if row != [false, 0, 0.0, 1.0, 0.0, [], 100.0, false, 0, 0]:
			bad1.append(c[0])
	_check("灼燒入口-1 沒有灼燒的敵人收到無效的灼燒參數（每跳傷害或間隔是 0、負數、NaN、正負無限大，跳數 0 或負數）：不顯示灼燒、狀態不變，之後 6 秒不扣血、沒有倒下、沒有傷害數字",
		bad1.is_empty(), {"bad": bad1, "rows": rows1})

	# 灼燒入口-2：已經在灼燒（每跳 20、3 跳、間隔 1 秒，血量 1000）的敵人在第 0.5 秒收到同一組無效的參數：剩餘跳數、每跳傷害與下一跳的時間都不變
	#（3 跳、20、0.5 秒後），之後照原本的時間在第 1、2、3 秒各扣 20、共 60，燒完後不再顯示灼燒，間隔仍是 1 秒
	var rows2: Dictionary = {}
	var bad2: Array = []
	for c in BI_INVALID:
		var e: Node = _stn_enemy(holder, 0.0, {"hp": 1000.0})
		var died: Array = [0]
		e.died.connect(func(_x): died[0] += 1)
		e.apply_burn(20.0, 3, 1.0)
		var pre: Array = _bi_steps(e, 8)
		var st_a: Dictionary = e.burn_state()
		e.apply_burn(c[1], c[2], c[3])
		var st_b: Dictionary = e.burn_state()
		var row: Array = [pre, st_a == st_b, st_b, _bi_steps(e, 88), e.current_hp, e.is_burning(), died[0], e._burn_interval]
		rows2[c[0]] = str(row)
		if row != [[], true, {"ticks_left": 3, "damage": 20.0, "next_in": 0.5}, [[8, 20.0], [24, 20.0], [40, 20.0]], 940.0, false, 0, 1.0]:
			bad2.append(c[0])
	_check("灼燒入口-2 已有灼燒（每跳 20、3 跳、間隔 1 秒）的敵人在第 0.5 秒收到無效的參數：剩餘跳數、每跳傷害與下一跳的時間不變，照原本的時間在第 1、2、3 秒各扣 20（共 60）後結束",
		bad2.is_empty(), {"bad": bad2, "rows": rows2})

	# 灼燒入口-3：已經倒下的敵人、正要被移除（queue_free 之後、還沒倒下）的敵人收到有效的參數：不開始灼燒；
	# 已在灼燒的敵人被移除後再收到每跳 30 的參數：不刷新（每跳仍是 20）
	var ed: Node = _stn_enemy(holder, 0.0, {"hp": 10.0})
	ed.take_damage(100.0)
	ed.apply_burn(20.0, 3, 1.0)
	var eq: Node = _stn_enemy(holder, 0.0, {"hp": 100.0})
	eq.queue_free()
	eq.apply_burn(20.0, 3, 1.0)
	var er: Node = _stn_enemy(holder, 0.0, {"hp": 100.0})
	er.apply_burn(20.0, 3, 1.0)
	er.queue_free()
	er.apply_burn(30.0, 3, 1.0)
	var d3: Dictionary = {"dead": [ed.is_dead(), ed._burn_ticks_left, ed.is_burning()], "queued": [eq._burn_ticks_left, eq._burn_damage, eq.is_burning()],
		"queued_refresh": [er._burn_ticks_left, er._burn_damage]}
	_check("灼燒入口-3 已經倒下、正要被移除的敵人不開始灼燒；已在灼燒的敵人被移除後不再刷新（每跳仍是 20）",
		d3.dead == [true, 0, false] and d3.queued == [0, 0.0, false] and d3.queued_refresh == [3, 20.0], d3)

	# 灼燒入口-4：正常的規則不變：
	# a 第 0.5 秒再附加每跳 30：剩餘跳數回到 3、每跳換成 30，下一跳仍在第 1 秒（不延後、不疊加），之後第 1、2、3 秒各 30、共 90；
	# b 血量 50 的敵人受到每跳 30 的灼燒：第 1 秒扣 30、第 2 秒打倒（只扣剩下的 20），死亡信號一次、不再顯示灼燒；
	#   之後再處理 8 步（例如同一幀裡還有物理步進）也不再扣血、死亡信號仍是一次
	var ea: Node = _stn_enemy(holder, 0.0, {"hp": 1000.0})
	ea.apply_burn(20.0, 3, 1.0)
	var a4_pre: Array = _bi_steps(ea, 8)
	ea.apply_burn(30.0, 3, 1.0)
	var a4: Dictionary = {"pre": a4_pre, "state": ea.burn_state(), "hits": _bi_steps(ea, 88), "hp": ea.current_hp, "burning": ea.is_burning()}
	var el: Node = _stn_enemy(holder, 0.0, {"hp": 50.0})
	var dl: Array = [0]
	el.died.connect(func(_x): dl[0] += 1)
	el.apply_burn(30.0, 3, 1.0)
	var b4_hits: Array = _bi_steps(el, 96)
	for i in range(8):
		el._physics_process(BI_DT)
	var b4: Dictionary = {"hits": b4_hits, "hp": el.current_hp, "dead": el.is_dead(), "died": dl[0], "burning": el.is_burning()}
	_check("灼燒入口-4 正常的規則不變：第 0.5 秒再附加每跳 30 時剩餘跳數回到 3、下一跳仍在第 1 秒，之後第 1、2、3 秒各 30；血量 50 的敵人第 1 秒扣 30、第 2 秒打倒（扣 20），死亡信號一次，之後再處理也不扣血",
		a4.pre.is_empty() and a4.state == {"ticks_left": 3, "damage": 30.0, "next_in": 0.5} and a4.hits == [[8, 30.0], [24, 30.0], [40, 30.0]] and a4.hp == 910.0 and not a4.burning
			and b4.hits == [[16, 30.0], [32, 20.0]] and b4.hp == 0.0 and b4.dead and b4.died == 1 and not b4.burning,
		{"refresh": a4, "kill": b4})

	# 灼燒入口-5：周瑜的普通攻擊（真正的 Hero 程式，每一擊之前冷卻歸零）：參數無效（間隔是無限大、跳數 2.5、比例是字串、沒有間隔）時
	# 命中照常扣 100，但敵人沒有灼燒、之後 3 秒不再扣血；參數有效時命中後開始灼燒（每跳 20、3 跳），3 秒內再扣 60
	var wave := R20Wave.new()
	holder.add_child(wave)
	var rows5: Dictionary = {}
	for c in [["int+inf", {"id": "burn", "burn_ratio": 0.2, "burn_ticks": 3, "burn_interval": INF}], ["ticks2.5", {"id": "burn", "burn_ratio": 0.2, "burn_ticks": 2.5, "burn_interval": 1.0}],
			["ratio-str", {"id": "burn", "burn_ratio": "0.2", "burn_ticks": 3, "burn_interval": 1.0}], ["no-interval", {"id": "burn", "burn_ratio": 0.2, "burn_ticks": 3}],
			["valid", {"id": "burn", "burn_ratio": 0.2, "burn_ticks": 3, "burn_interval": 1.0}]]:
		wave.enemies.clear()
		var e: Node = _stn_enemy(holder, 0.0, {"hp": 1000.0})
		e.position = Vector2(48.0, 0.0)
		wave.enemies.append(e)
		var h: Node = _bi_hero(holder, wave, c[1])
		h._atk_timer = 0.0
		h._process(1.0 / 60.0)
		var hit: float = 1000.0 - e.current_hp
		rows5[c[0]] = [hit, e.is_burning(), e._burn_damage, e._burn_ticks_left, _bi_steps(e, 48), e.is_burning()]
	holder.queue_free()
	var bad5: Array = []
	for k in rows5:
		var want: Array = [100.0, true, 20.0, 3, [[16, 20.0], [32, 20.0], [48, 20.0]], false] if k == "valid" else [100.0, false, 0.0, 0, [], false]
		if rows5[k] != want:
			bad5.append(k)
	_check("灼燒入口-5 周瑜的普通攻擊：參數無效（間隔無限大、跳數 2.5、比例是字串、沒有間隔）時命中照常扣 100、不附加灼燒、之後不再扣血；參數有效時命中後每秒 20、共 3 跳",
		bad5.is_empty(), {"bad": bad5, "rows": rows5})

	# 灼燒入口-6：實際引擎（經過 JSON 的出征資料）：周瑜的參數沒有間隔、跳數 2.5、比例是字串時命中 100 後沒有灼燒、沒有跳傷（舊寫法會補成 1 秒、2 跳而啟用）
	var r6: Dictionary = {}
	var ok6: bool = true
	for c in [["no-interval", {"id": "burn", "burn_ratio": 0.2, "burn_ticks": 3}], ["ticks2.5", {"id": "burn", "burn_ratio": 0.2, "burn_ticks": 2.5, "burn_interval": 1.0}],
			["ratio-str", {"id": "burn", "burn_ratio": "0.2", "burn_ticks": 3, "burn_interval": 1.0}]]:
		var e6: Node = await _r15_start(_r15_payload("bi_6", "bi-6-" + str(c[0]), [_r15_zhou(100.0, c[1])]))
		var z6: Node = _zhou()
		var h6: Dictionary = await _r15_hit_then_leave(e6, z6)
		var d6: Dictionary = await _r15_drops(e6, h6.t0, 2.3)
		var burning6: bool = e6.is_burning() if is_instance_valid(e6) else true
		r6[c[0]] = {"hit": h6.dmg, "drops": d6.drops, "burning": burning6, "ratio": z6.burn_ratio if z6 != null else -1.0}
		ok6 = ok6 and h6.dmg == 100.0 and d6.drops.is_empty() and not burning6 and z6 != null and z6.burn_ratio == 0.0
	_check("灼燒入口-6 實際引擎：周瑜的火攻參數沒有間隔、跳數 2.5、比例是字串時不啟用：命中 100 後沒有灼燒、沒有跳傷",
		ok6, r6)
	_load(_stage_b())

# ── 反擊（夏侯惇）──
# 受到敵人對阻路武將的直接攻擊、實際扣血後自己仍然活著時，對這次攻擊自己的敵人造成實扣生命 × 20% 的傷害（防禦公式與防禦光環之後的實扣）；
# 閃避、0 或無效的傷害、打倒自己的那一擊、沒有攻擊者或攻擊者無效時不反彈；反彈走敵人一般的受傷流程（可能打倒攻擊者，擊殺與結算一次），
# 不會再引發其他技能或另一次反彈

## 夏侯惇的反擊（和網頁 utils/heroSkills 的出征參數相同）
const CTR_SKILL: Dictionary = {"id": "counter", "counter_ratio": 0.2}
## 防禦 100 的武將被攻擊力 100 的敵人打一下實際扣的血：100 ×（1 − 100 ÷ 200）；在劉備的防禦光環裡（防禦 120）：100 × 100 ÷ 220
const CTR_HIT: float = 50.0
const CTR_HIT_AURA: float = 100.0 * 100.0 / 220.0
## 實際引擎用的敵人：慢速地面兵（每秒 20 像素、攻擊力 100、血量很多；普通與免疫減速）、血量 25 的慢速地面兵（反彈 10、10、5 打倒）
const CTR_ENEMIES: Array = [
	{"enemy_id": "ctr_walk", "name": "W", "hp": 99999.0, "speed": 20.0, "atk": 100},
	{"enemy_id": "ctr_walk_imm", "name": "I", "hp": 99999.0, "speed": 20.0, "atk": 100, "trait": "immune_slow"},
	{"enemy_id": "ctr_soft", "name": "S", "hp": 25.0, "speed": 20.0, "atk": 100},
]

## 不合法的攻擊者（測試用的假敵人，不是 Enemy）：有受傷的方法，只數被呼叫了幾次
class CtrFake extends Node2D:
	var calls: int = 0
	var current_hp: float = 1000.0
	func is_dead() -> bool:
		return false
	func take_damage(_amount: float, _is_burn: bool = false, _is_counter: bool = false) -> float:
		calls += 1
		return 0.0

## 固定步進用的一對：真正的 Enemy（攻擊力 atk_v、血量 ehp、速度 0，停在第 3 格；extra 另外加進設定）與真正的 Hero（夏侯惇：防禦 def_v、生命 hp，
## 放在第 3 格擋住它、不攻擊）；skill 是 null 時帶反擊的參數。測試自己用固定的 delta 呼叫敵人的 _physics_process：第 1 步偵測到阻擋、第 2 步打第一擊
func _ctr_pair(holder: Node, atk_v: float = 100.0, ehp: float = 99999.0, hp: float = 1000.0, def_v: float = 100.0, skill: Variant = null, extra: Dictionary = {}) -> Dictionary:
	var map := BlkMap.new()
	holder.add_child(map)
	var e: Node = _ctr_enemy(holder, map, atk_v, ehp, extra)
	var h: Node = _blk_hero(holder, map, 3, hp)
	h.hero_id = "xia_hou_dun"
	h.def_stat = def_v
	h._read_skill({"skill": CTR_SKILL.duplicate() if skill == null else skill})
	return {"e": e, "h": h, "map": map}

func _ctr_enemy(holder: Node, map: BlkMap, atk_v: float = 100.0, ehp: float = 99999.0, extra: Dictionary = {}) -> Node:
	var e: Node = load("res://entities/enemy/Enemy.gd").new()
	holder.add_child(e)
	e.set_physics_process(false)
	var cfg: Dictionary = {"enemy_id": "ctr", "hp": ehp, "speed": 0.0, "atk": atk_v}
	cfg.merge(extra, true)
	e.setup(cfg, [Vector2(0.5 * map.tile, 0.0), Vector2(12.5 * map.tile, 0.0)])
	e.position = Vector2(3.5 * map.tile, 0.0)
	e._game_map = map
	return e

## 固定步進 steps 步（每步 1/60 秒），每一步之前呼叫 before(i)。記錄敵人攻擊的步：[步, 武將扣的血, 敵人扣的血, 反彈次數的增加]；
## 沒有攻擊卻有變化的步記在 odd（應該沒有）
func _ctr_steps(e: Node, h: Node, steps: int, before: Callable = Callable()) -> Dictionary:
	var r: Dictionary = {"atk": [], "odd": []}
	for i in range(1, steps + 1):
		if before.is_valid():
			before.call(i)
		var hh: float = h.current_hp
		var eh: float = e.current_hp
		var n: int = e.blocker_attacks
		var c: int = h.counter_count
		e._physics_process(1.0 / 60.0)
		var row: Array = [i, hh - h.current_hp, eh - e.current_hp, h.counter_count - c]
		if e.blocker_attacks > n:
			r.atk.append(row)
		elif row[1] != 0.0 or row[2] != 0.0 or row[3] != 0:
			r.odd.append(row)
	return r

## 每次攻擊的 [步, 武將扣的血, 敵人扣的血, 反彈次數] 和 want 逐一相符（血量容許浮點誤差）
func _ctr_rows_ok(rows: Array, want: Array) -> bool:
	if rows.size() != want.size():
		return false
	for i in range(rows.size()):
		var a: Array = rows[i]
		var b: Array = want[i]
		if int(a[0]) != int(b[0]) or not _ls_near(a[1], float(b[1]), 1e-6) or not _ls_near(a[2], float(b[2]), 1e-6) or int(a[3]) != int(b[3]):
			return false
	return true

## parent 底下還在顯示的浮動文字：[文字, 顏色是不是反彈的洋紅色, 顏色是不是武將受傷的紅色]（先等一幀：文字是延遲設定的）
func _ctr_texts(parent: Node) -> Array:
	await process_frame
	var out: Array = []
	for c in parent.get_children():
		if c is FloatingText and not c.is_queued_for_deletion() and c._label != null:
			var col: Color = c._label.get_theme_color("font_color")
			out.append([c._label.text, col.is_equal_approx(Enemy.COUNTER_COLOR), col.is_equal_approx(Color(1.0, 0.2, 0.2))])
	return out

## 實際引擎：載入一場（經過 JSON）並依 cells 放置武將（hero_id → 格子），不開戰。夏侯惇是步兵、射程 xhd_range 格、攻擊間隔 1.1 秒；
## 劉備（射程 3 格）、張飛（射程 2.5 格、攻擊間隔 1.5 秒）用來測組合
func _ctr_load(rec: Node, battle_id: String, waves: Array, team: Array, cells: Dictionary, xhd_range: float = 1.5) -> void:
	var p: Dictionary = _r12_payload("ctr_" + battle_id, waves, battle_id, team)
	p["heroes_config"] = [
		{"hero_id": "xia_hou_dun", "name": "夏侯惇", "job": "infantry", "attack_range": xhd_range, "attack_speed": 1.1},
		{"hero_id": "liu_bei", "name": "劉備", "job": "infantry", "attack_range": 3.0, "attack_speed": 0.5},
		{"hero_id": "zhang_fei", "name": "張飛", "job": "infantry", "attack_range": 2.5, "attack_speed": 1.5},
	]
	for c in CTR_ENEMIES:
		p["enemies_config"].append(c.duplicate())
	_r19_js(rec, p)
	for hid in cells:
		_r12_place(hid, cells[hid])

## 出征的夏侯惇（攻擊力 atk_v、防禦 100、生命 1000）；skill 是 null 時帶反擊的參數
func _ctr_xhd(atk_v: float = 100.0, skill: Variant = null) -> Dictionary:
	var h: Dictionary = _r12_hero("xia_hou_dun", CTR_SKILL.duplicate() if skill == null else skill)
	h["atk"] = atk_v
	h["def"] = 100.0
	return h

## 場上的敵人（生成順序）
func _ctr_enemies() -> Array:
	return main.units_layer.get_children().filter(func(c): return c is Enemy and not c.is_queued_for_deletion())

## 實際引擎：逐個物理步進記錄夏侯惇 h 與敵人 e（在 physics_frame 信號當下讀取），直到 stop(rows) 回傳 true 或牆鐘 wall_ms 毫秒。
## 每一列：atk＝敵人攻擊阻路武將的次數增加、ctr＝反彈次數的增加、dh＝夏侯惇的生命變化、dt＝物理時鐘前進的時間、ts＝時間倍率。each(row) 在每一列之後呼叫
func _ctr_track(h: Node, e: Node, wall_ms: int, stop: Callable, each: Callable = Callable()) -> Array:
	var rows: Array = []
	var w_end: int = Time.get_ticks_msec() + wall_ms
	await physics_frame
	var ph: float = h.current_hp
	var pa: int = e.blocker_attacks
	var pc: int = h.counter_count
	var pt: float = _pt()
	while Time.get_ticks_msec() < w_end:
		await physics_frame
		if not is_instance_valid(h) or not is_instance_valid(e) or e.is_queued_for_deletion():
			break
		var row: Dictionary = {"atk": e.blocker_attacks - pa, "ctr": h.counter_count - pc, "dh": h.current_hp - ph, "dt": _pt() - pt, "ts": Engine.time_scale}
		ph = h.current_hp
		pa = e.blocker_attacks
		pc = h.counter_count
		pt = _pt()
		rows.append(row)
		if each.is_valid():
			each.call(row)
		if stop.call(rows):
			break
	return rows

## 每一列：敵人攻擊 1 次的列夏侯惇扣 hit、同一步反彈 1 次；沒有攻擊的列生命不變、沒有反彈。回傳不符合的列（最多 5 列）
func _ctr_bad_rows(rows: Array, hit: float = CTR_HIT) -> Array:
	var bad: Array = []
	for i in range(rows.size()):
		var r: Dictionary = rows[i]
		var ok: bool = (int(r.atk) == 0 and int(r.ctr) == 0 and float(r.dh) == 0.0) or (int(r.atk) == 1 and int(r.ctr) == 1 and absf(float(r.dh) + hit) < 1e-6)
		if not ok:
			bad.append({"i": i, "row": r})
	return bad.slice(0, 5)

## 反擊紀錄每一筆都是實扣 hit、反彈 hit × 0.2、攻擊者實際扣掉 hit × 0.2
func _ctr_logs_ok(logs: Array, hit: float = CTR_HIT) -> bool:
	return not logs.is_empty() and logs.all(func(x): return _ls_near(x.taken, hit, 1e-6) and _ls_near(x.reflect, hit * 0.2, 1e-6) and _ls_near(x.dealt, hit * 0.2, 1e-6))

func _counter_cases() -> void:
	# 反擊-0：技能參數的判讀：counter_ratio 是大於 0、不超過 1 的有限數字才啟用（0.2、0.5、1、1.0、0.0001、經過 JSON 的 0.2）；
	# 字串、布林、null、陣列、NaN、無限大、0、負數、超過 1、沒有欄位、不認得或大小寫不同的 id、其他技能都不啟用；反擊不帶其他技能，改成沒有技能後清除
	var h0: Node = load("res://entities/hero/Hero.gd").new()
	var bad0: Array = []
	for c in [[{"id": "counter", "counter_ratio": 0.2}, 0.2], [{"id": "counter", "counter_ratio": 0.5}, 0.5], [{"id": "counter", "counter_ratio": 1}, 1.0],
			[{"id": "counter", "counter_ratio": 1.0}, 1.0], [{"id": "counter", "counter_ratio": 0.0001}, 0.0001],
			[{"id": "counter", "counter_ratio": "0.2"}, 0.0], [{"id": "counter", "counter_ratio": true}, 0.0], [{"id": "counter", "counter_ratio": null}, 0.0],
			[{"id": "counter", "counter_ratio": [0.2]}, 0.0], [{"id": "counter", "counter_ratio": NAN}, 0.0], [{"id": "counter", "counter_ratio": INF}, 0.0],
			[{"id": "counter", "counter_ratio": -INF}, 0.0], [{"id": "counter", "counter_ratio": 0}, 0.0], [{"id": "counter", "counter_ratio": 0.0}, 0.0],
			[{"id": "counter", "counter_ratio": -0.2}, 0.0], [{"id": "counter", "counter_ratio": 1.0001}, 0.0], [{"id": "counter", "counter_ratio": 20}, 0.0],
			[{"id": "counter"}, 0.0], [{"id": "counter_x", "counter_ratio": 0.2}, 0.0], [{"id": "Counter", "counter_ratio": 0.2}, 0.0],
			[{"id": "lifesteal", "lifesteal_ratio": 0.15}, 0.0], [{"id": "dodge", "dodge_chance": 0.15}, 0.0], [null, 0.0]]:
		var st: Dictionary = {} if c[0] == null else {"skill": c[0]}
		h0._read_skill(st)
		if h0.counter_ratio != float(c[1]):
			bad0.append(str(c[0]))
	h0._read_skill({"skill": JSON.parse_string("{\"id\": \"counter\", \"counter_ratio\": 0.2}")})
	var json0: float = h0.counter_ratio
	var other0: Array = [h0.stun_duration, h0.slow_aura_mult, h0.def_aura_mult, h0.dodge_chance, h0.first_strike_multiplier, h0.range_multiplier, h0.burn_ratio,
		h0.sweep_ratio, h0.lifesteal_ratio, h0.atk_speed_aura_mult]
	h0._read_skill({})
	var cleared0: float = h0.counter_ratio
	h0.free()
	_check("反擊-0 技能參數：counter_ratio 0.2、0.5、1、1.0、0.0001 與經過 JSON 的 0.2 啟用；字串、布林、null、陣列、NaN、無限大、0、負數、超過 1、沒有欄位、不認得或大小寫不同的 id、其他技能都不啟用；反擊不帶其他技能、改成沒有技能後清除",
		bad0.is_empty() and json0 == 0.2 and other0 == [0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0] and cleared0 == 0.0,
		{"bad": bad0, "json": json0, "other": other0, "cleared": cleared0})

	# 反擊-1：固定步進（真正的 Enemy 與 Hero，每步 1/60 秒；敵人第 2、62、122 步攻擊）：
	# a 敵人攻擊力 100、夏侯惇防禦 100：每次攻擊夏侯惇扣 50、敵人同一步扣 10（實扣的 20%，不是攻擊力 100 的 20%），沒有攻擊的步數都不變；
	#   紀錄是實扣 50、反彈 10、實際 10；敵人身上出現 3 個洋紅色的「10」、夏侯惇身上 3 個紅色的「50」；夏侯惇自己沒有攻擊（普通攻擊的次數 0）；
	# b 在防禦光環裡（防禦 × 1.2）：每次扣約 45.4545、反彈約 9.0909；c 比例 1：扣 50、反彈 50
	var ha := _dodge_holder()
	var pa: Dictionary = _ctr_pair(ha)
	var ra: Dictionary = _ctr_steps(pa.e, pa.h, 130)
	var texts_a: Array = await _ctr_texts(ha)
	var a1: Dictionary = {"atk": ra.atk, "odd": ra.odd, "count": pa.h.counter_count, "total": pa.h.counter_total, "dealt": pa.h.counter_dealt,
		"log": pa.h.counter_log.duplicate(true), "attacks": pa.h.attack_count, "hp": [pa.h.current_hp, pa.e.current_hp],
		"magenta10": texts_a.filter(func(t): return t[0] == "10" and t[1]).size(), "red50": texts_a.filter(func(t): return t[0] == "50" and t[2]).size(),
		"magenta_other": texts_a.filter(func(t): return t[1] and t[0] != "10").size()}
	ha.queue_free()
	var hb := _dodge_holder()
	var pb: Dictionary = _ctr_pair(hb)
	pb.h.apply_def_from("test_def", 1.2, 1.0e9)
	var rb: Dictionary = _ctr_steps(pb.e, pb.h, 70)
	var pc: Dictionary = _ctr_pair(hb, 100.0, 99999.0, 1000.0, 100.0, {"id": "counter", "counter_ratio": 1})
	var rc: Dictionary = _ctr_steps(pc.e, pc.h, 70)
	var b1: Dictionary = {"aura": rb.atk, "aura_odd": rb.odd, "aura_def": pb.h.effective_def(), "aura_log": pb.h.counter_log.duplicate(true), "full": rc.atk, "full_odd": rc.odd}
	hb.queue_free()
	_check("反擊-1 固定步進：攻擊力 100 打防禦 100 的夏侯惇，每次攻擊扣 50、同一步反彈 10（實扣的 20%），沒有攻擊的步數不變；洋紅色的「10」、紅色的「50」各 3 個，夏侯惇自己沒有普通攻擊；防禦光環裡扣約 45.45、反彈約 9.09；比例 1 時反彈 50",
		_ctr_rows_ok(a1.atk, [[2, 50, 10, 1], [62, 50, 10, 1], [122, 50, 10, 1]]) and a1.odd.is_empty() and a1.count == 3 and _ls_near(a1.total, 30.0) and _ls_near(a1.dealt, 30.0)
			and _ctr_logs_ok(a1.log) and a1.log.all(func(x): return x.killed == false) and a1.attacks == 0 and a1.hp == [850.0, 99969.0]
			and a1.magenta10 == 3 and a1.red50 == 3 and a1.magenta_other == 0
			and _ctr_rows_ok(b1.aura, [[2, CTR_HIT_AURA, CTR_HIT_AURA * 0.2, 1], [62, CTR_HIT_AURA, CTR_HIT_AURA * 0.2, 1]]) and b1.aura_odd.is_empty()
			and _ls_near(b1.aura_def, 120.0) and _ctr_logs_ok(b1.aura_log, CTR_HIT_AURA)
			and _ctr_rows_ok(b1.full, [[2, 50, 50, 1], [62, 50, 50, 1]]) and b1.full_odd.is_empty(),
		{"a": a1, "b": b1})

	# 反擊-1b：不反彈（自己的扣血照常）：
	# a 敵人攻擊力 0：照樣攻擊（用掉冷卻）但沒有扣血、不反彈；b 閃避（測試同時設定閃避，抽樣 0）：兩擊都閃避、不反彈，改成抽樣 0.99 後下一擊扣 50、反彈 10；
	# c 直接呼叫受傷：傷害 0／負數／NaN／正負無限大（帶攻擊者）不扣血、不反彈；沒有攻擊者、攻擊者是 null 各扣 50、不反彈；帶有效的攻擊者扣 50、反彈 10；
	# d 致死：生命 30 與 50 被打一下就倒下（倒下信號一次）、不反彈、敵人生命不變；生命 50.0001 撐住時照常反彈 10；
	# e 攻擊者無效：已經倒下的敵人、正要被移除的敵人、不是敵人的假目標（受傷不會被呼叫）、一般節點、數字、字典、字串、已釋放的物件：各扣 50、都不反彈、沒有錯誤；
	# f 夏侯惇正要被移除（queue_free 之後）：扣 50、不反彈
	var hz := _dodge_holder()
	var pz: Dictionary = _ctr_pair(hz, 0.0)
	var rz: Dictionary = _ctr_steps(pz.e, pz.h, 70)
	var pd: Dictionary = _ctr_pair(hz)
	var u: Array = [0.0]
	pd.h.dodge_chance = 0.5
	pd.h.dodge_roll_override = func() -> float: return float(u[0])
	var rd: Dictionary = _ctr_steps(pd.e, pd.h, 70)
	u[0] = 0.99
	var rd2: Dictionary = _ctr_steps(pd.e, pd.h, 60)
	var pf: Dictionary = _ctr_pair(hz)
	var inv: Array = []
	for v in [0.0, -5.0, NAN, INF, -INF]:
		pf.h.take_damage(v, pf.e)
		inv.append([pf.h.current_hp, pf.e.current_hp, pf.h.counter_count])
	pf.h.take_damage(100.0)
	var no_src: Array = [pf.h.current_hp, pf.e.current_hp, pf.h.counter_count]
	pf.h.take_damage(100.0, null)
	var null_src: Array = [pf.h.current_hp, pf.e.current_hp, pf.h.counter_count]
	pf.h.take_damage(100.0, pf.e)
	var ok_src: Array = [pf.h.current_hp, pf.e.current_hp, pf.h.counter_count]
	var lethal: Dictionary = {}
	for hp in [30.0, 50.0, 50.0001]:
		var pl: Dictionary = _ctr_pair(hz, 100.0, 99999.0, hp)
		var deaths: Array = [0]
		pl.h.hero_died.connect(func(_x): deaths[0] += 1)
		var rl: Dictionary = _ctr_steps(pl.e, pl.h, 5)
		lethal[str(hp)] = {"atk": rl.atk.size(), "hp": pl.h.current_hp, "queued": pl.h.is_queued_for_deletion(), "died": deaths[0], "count": pl.h.counter_count, "ehp": pl.e.current_hp}
	var ps: Dictionary = _ctr_pair(hz)
	var map_s: BlkMap = ps.map
	var dead_e: Node = _ctr_enemy(hz, map_s)
	dead_e.take_damage(1.0e12)
	var queued_e: Node = _ctr_enemy(hz, map_s)
	queued_e.queue_free()
	var fake := CtrFake.new()
	hz.add_child(fake)
	var plain := Node2D.new()
	hz.add_child(plain)
	var freed := Node.new()
	freed.free()
	var srcs: Array = [["dead", dead_e], ["queued", queued_e], ["fake", fake], ["node", plain], ["number", 3.0], ["dict", {"take_damage": 1}], ["string", "enemy"], ["freed", freed]]
	var bad_src: Array = []
	for s in srcs:
		var hp0: float = ps.h.current_hp
		var c0: int = ps.h.counter_count
		ps.h.take_damage(100.0, s[1])
		if not (_ls_near(hp0 - ps.h.current_hp, 50.0) and ps.h.counter_count == c0):
			bad_src.append(s[0])
	var src_extra: Array = [fake.calls, queued_e.current_hp, dead_e.current_hp]
	var pq: Dictionary = _ctr_pair(hz)
	pq.h.queue_free()
	pq.h.take_damage(100.0, pq.e)
	var queued_h: Array = [pq.h.current_hp, pq.e.current_hp, pq.h.counter_count]
	hz.queue_free()
	var d1b: Dictionary = {"zero_atk": [rz.atk, rz.odd, pz.h.counter_count, pz.h.current_hp], "dodge": [rd.atk, pd.h.dodge_count, rd2.atk],
		"invalid": inv, "no_src": no_src, "null_src": null_src, "ok_src": ok_src, "lethal": lethal, "bad_src": bad_src, "src_extra": src_extra, "queued_hero": queued_h}
	_check("反擊-1b 不反彈、自己的扣血照常：敵人攻擊力 0（照樣攻擊、不扣血）；閃避（抽樣 0）兩擊都不反彈，改成 0.99 後扣 50、反彈 10；無效的傷害不扣血不反彈；沒有攻擊者或 null 扣 50 不反彈、有效的攻擊者扣 50 反彈 10；生命 30、50 被打倒時不反彈（倒下一次），50.0001 撐住時反彈；攻擊者已倒下、正要被移除、不是敵人、節點、數字、字典、字串、已釋放：扣 50 不反彈；夏侯惇正要被移除時不反彈",
		_ctr_rows_ok(rz.atk, [[2, 0, 0, 0], [62, 0, 0, 0]]) and rz.odd.is_empty() and pz.h.counter_count == 0 and pz.h.current_hp == 1000.0
			and _ctr_rows_ok(rd.atk, [[2, 0, 0, 0], [62, 0, 0, 0]]) and pd.h.dodge_count == 2 and _ctr_rows_ok(rd2.atk, [[52, 50, 10, 1]])
			and inv.all(func(x): return x == [1000.0, 99999.0, 0]) and no_src == [950.0, 99999.0, 0] and null_src == [900.0, 99999.0, 0] and ok_src == [850.0, 99989.0, 1]
			and lethal["30.0"] == {"atk": 1, "hp": 0.0, "queued": true, "died": 1, "count": 0, "ehp": 99999.0}
			and lethal["50.0"] == {"atk": 1, "hp": 0.0, "queued": true, "died": 1, "count": 0, "ehp": 99999.0}
			and lethal["50.0001"].count == 1 and lethal["50.0001"].died == 0 and _ls_near(lethal["50.0001"].ehp, 99989.0)
			and bad_src.is_empty() and src_extra == [0, 99999.0, 0.0] and queued_h == [950.0, 99999.0, 0],
		d1b)

	# 反擊-1c：反彈打倒攻擊者：血量 25 的敵人（攻擊力 100）打防禦 100 的夏侯惇：第 2、62、122 步各反彈 10、10、5（實際扣掉的只有剩下的 5），
	# 第 3 次反彈打倒它：死亡信號一次、紀錄最後一筆是打倒；之後再處理 5 步（同一幀裡還有物理步進、節點還沒被釋放）不再攻擊、夏侯惇不再扣血
	var hk := _dodge_holder()
	var pk: Dictionary = _ctr_pair(hk, 100.0, 25.0)
	var dk: Array = [0]
	pk.e.died.connect(func(_x): dk[0] += 1)
	var rk: Dictionary = _ctr_steps(pk.e, pk.h, 130)
	var atk_k: int = pk.e.blocker_attacks
	var hp_k: float = pk.h.current_hp
	for i in range(5):
		pk.e._physics_process(1.0 / 60.0)
	var c1c: Dictionary = {"atk": rk.atk, "odd": rk.odd, "died": dk[0], "dead": pk.e.is_dead(), "queued": pk.e.is_queued_for_deletion(), "attacks": [atk_k, pk.e.blocker_attacks],
		"hp": [hp_k, pk.h.current_hp], "log": pk.h.counter_log.duplicate(true), "total": pk.h.counter_total, "dealt": pk.h.counter_dealt, "ehp": pk.e.current_hp}
	hk.queue_free()
	_check("反擊-1c 反彈打倒攻擊者：血量 25 的敵人第 2、62、122 步各被反彈 10、10、5，第 3 次反彈打倒它（死亡信號一次、紀錄最後一筆是打倒）；之後再處理 5 步不再攻擊、夏侯惇不再扣血",
		_ctr_rows_ok(c1c.atk, [[2, 50, 10, 1], [62, 50, 10, 1], [122, 50, 5, 1]]) and c1c.odd.is_empty() and c1c.died == 1 and c1c.dead and c1c.queued
			and c1c.attacks == [3, 3] and c1c.hp == [850.0, 850.0] and c1c.log.size() == 3 and c1c.log[2].killed == true and _ls_near(c1c.log[2].dealt, 5.0)
			and _ls_near(c1c.total, 30.0) and _ls_near(c1c.dealt, 25.0) and c1c.ehp == 0.0,
		c1c)

	# 反擊-1d：反彈不引發其他技能、免疫減速照樣反彈、多個敵人只打實際的攻擊者：
	# a 夏侯惇同時設定吸血 0.5、暈眩 1 秒、灼燒、首擊 2 倍、橫掃（測試直接設定欄位；正式資料一位武將只有一個技能）：兩次攻擊各扣 50、反彈 10，
	#   夏侯惇沒有恢復、沒有普通攻擊、冷卻不變，敵人沒有暈眩、沒有灼燒；
	# b 免疫減速的敵人：每次攻擊照樣反彈 10；
	# c 兩個敵人擋在同一位夏侯惇前面（第二個從第 31 步才開始處理）：第一個在第 2、62、122 步攻擊、第二個在第 32、92 步攻擊，
	#   每次只有攻擊者被扣 10，彼此的攻擊時間不受對方的反彈影響；夏侯惇扣 50 × 5、反彈 5 次
	var hj := _dodge_holder()
	var pj: Dictionary = _ctr_pair(hj)
	pj.h.lifesteal_ratio = 0.5
	pj.h.stun_duration = 1.0
	pj.h.burn_ratio = 0.5
	pj.h.burn_ticks = 3
	pj.h.burn_interval = 0.5
	pj.h.first_strike_multiplier = 2.0
	pj.h.sweep_ratio = 0.5
	pj.h.sweep_radius = 2.0
	pj.h.sweep_max_targets = 2
	var wj := R20Wave.new()
	hj.add_child(wj)
	wj.enemies.append(pj.e)
	pj.h._wave_mgr = wj
	var timer_j: float = pj.h._atk_timer
	var rj: Dictionary = _ctr_steps(pj.e, pj.h, 70)
	var a1d: Dictionary = {"atk": rj.atk, "odd": rj.odd, "lifesteal": [pj.h.lifesteal_count, pj.h.lifesteal_log.size()], "stun": [pj.h.stun_count, pj.e.is_stunned(), pj.e.stun_count],
		"burn": [pj.e.is_burning(), pj.e._burn_ticks_left], "attacks": pj.h.attack_count, "timer": [timer_j, pj.h._atk_timer], "sweep": pj.h.sweep_count}
	var pim: Dictionary = _ctr_pair(hj, 100.0, 99999.0, 1000.0, 100.0, null, {"trait": "immune_slow"})
	var ri: Dictionary = _ctr_steps(pim.e, pim.h, 70)
	var b1d: Dictionary = {"immune": pim.e.immune_slow, "atk": ri.atk, "odd": ri.odd}
	var pm: Dictionary = _ctr_pair(hj)
	var e2m: Node = _ctr_enemy(hj, pm.map)
	var wm := R20Wave.new()
	hj.add_child(wm)
	wm.enemies.append(e2m)
	wm.enemies.append(pm.e)
	pm.h._wave_mgr = wm
	var at1: Array = []
	var at2: Array = []
	var bad_m: Array = []
	for i in range(1, 131):
		var h0m: float = pm.h.current_hp
		var e1h: float = pm.e.current_hp
		var e2h: float = e2m.current_hp
		var n1: int = pm.e.blocker_attacks
		pm.e._physics_process(1.0 / 60.0)
		if pm.e.blocker_attacks > n1:
			at1.append(i)
			if not (_ls_near(e1h - pm.e.current_hp, 10.0) and e2h == e2m.current_hp):
				bad_m.append(["e1", i])
		if i >= 31:
			var n2: int = e2m.blocker_attacks
			var e1h2: float = pm.e.current_hp
			var e2h2: float = e2m.current_hp
			e2m._physics_process(1.0 / 60.0)
			if e2m.blocker_attacks > n2:
				at2.append(i)
				if not (_ls_near(e2h2 - e2m.current_hp, 10.0) and e1h2 == pm.e.current_hp):
					bad_m.append(["e2", i])
		if pm.h.current_hp != h0m and not (at1.has(i) or at2.has(i)):
			bad_m.append(["hero", i])
	var c1d: Dictionary = {"at1": at1, "at2": at2, "bad": bad_m, "hp": pm.h.current_hp, "count": pm.h.counter_count, "lost": [99999.0 - pm.e.current_hp, 99999.0 - e2m.current_hp]}
	hj.queue_free()
	_check("反擊-1d 反彈不引發吸血、暈眩、灼燒、首擊、橫掃（同時設定時）：每次扣 50、反彈 10，沒有恢復、沒有普通攻擊、冷卻不變、敵人沒有暈眩與灼燒；免疫減速的敵人照樣反彈；兩個敵人時只有攻擊者被扣 10，攻擊時間（第 2、62、122 步與第 32、92 步）互不影響",
		_ctr_rows_ok(a1d.atk, [[2, 50, 10, 1], [62, 50, 10, 1]]) and a1d.odd.is_empty() and a1d.lifesteal == [0, 0] and a1d.stun == [0, false, 0] and a1d.burn == [false, 0]
			and a1d.attacks == 0 and a1d.timer[0] == a1d.timer[1] and a1d.sweep == 0
			and b1d.immune and _ctr_rows_ok(b1d.atk, [[2, 50, 10, 1], [62, 50, 10, 1]]) and b1d.odd.is_empty()
			and c1d.at1 == [2, 62, 122] and c1d.at2 == [32, 92] and c1d.bad.is_empty() and c1d.hp == 750.0 and c1d.count == 5 and _ls_near(c1d.lost[0], 30.0) and _ls_near(c1d.lost[1], 20.0),
		{"a": a1d, "b": b1d, "c": c1d})

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)

	# 反擊-2：實際引擎（時間倍率與暫停）：夏侯惇在道路 (4,5) 擋住慢速地面兵（攻擊力 100），射程 1.5 格、攻擊間隔 1.1 秒、攻擊力 100、防禦 100。
	# 1 倍 3 次攻擊 → 切到 2 倍再 3 次 → 打開部署選單（0.1 倍）1 次 → 關閉選單、回到 1 倍後手動暫停 1 秒（牆鐘）→ 繼續後再 1 次：
	# 每一步：敵人攻擊 1 次時夏侯惇扣 50、同一步反彈 1 次，沒有攻擊的步數生命不變、沒有反彈；暫停中沒有攻擊與反彈；
	# 反彈次數＝敵人的攻擊次數＝紀錄筆數，紀錄每筆都是 50／10／10；敵人被扣掉的總量＝普通攻擊 100 × 次數 ＋ 反彈 10 × 次數；
	# 夏侯惇的普通攻擊間隔仍是 1.1 秒
	var d2: Dictionary = {}
	var ok2: bool = false
	_ctr_load(rec, "ctr-2", [[_grp("ctr_walk", 1, 0.02)]], [_ctr_xhd()], {"xia_hou_dun": Vector2i(4, 5)})
	var x2: Node = _fly_hero("xia_hou_dun")
	var e2: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	if e2 != null and x2 != null:
		await _wait_until(func(): return is_instance_valid(e2) and e2._blocker != null, 5.0)
		var st2: Dictionary = {"n": 0, "phase": 0, "menu": {}, "pause": {}, "rec": rec, "h": x2, "paused": []}
		var each2 := func(row: Dictionary) -> void:
			st2.n = int(st2.n) + int(row.atk)
			var ph: int = int(st2.phase)
			if ph == 3:
				st2.paused.append(row)
			if ph == 0 and int(st2.n) >= 3:
				_r19_speed(st2.rec, 2.0)
				st2.phase = 1
			elif ph == 1 and int(st2.n) >= 6:
				st2.menu = _r19_open(st2.rec, 2)
				st2.phase = 2
			elif ph == 2 and int(st2.n) >= 7:
				_r19_close(st2.rec, st2.menu)
				_r19_speed(st2.rec, 1.0)
				st2.pause = {"n": st2.n, "hp": st2.h.current_hp, "count": st2.h.counter_count, "wall": Time.get_ticks_msec(), "reply": _r20_pause(st2.rec, true)}
				st2.phase = 3
			elif ph == 3 and Time.get_ticks_msec() - int(st2.pause.wall) >= 1000:
				st2.pause["n2"] = st2.n
				st2.pause["hp2"] = st2.h.current_hp
				st2.pause["count2"] = st2.h.counter_count
				st2.pause["frozen"] = _r20_frozen()
				_r20_pause(st2.rec, false)
				st2.phase = 4
		var rows2: Array = await _ctr_track(x2, e2, 60000, func(_r): return int(st2.phase) == 4 and int(st2.n) >= 8, each2)
		var atk_ts: Array = rows2.filter(func(r): return int(r.atk) > 0).map(func(r): return snappedf(float(r.ts), 0.01))
		var p2: Dictionary = st2.pause
		var intervals: Array = x2.attack_log.map(func(x): return float(x.interval))
		d2 = {"phase": st2.phase, "n": st2.n, "attacks": e2.blocker_attacks, "count": x2.counter_count, "log": x2.counter_log.size(), "hp": x2.current_hp,
			"lost": e2.max_hp - e2.current_hp, "hits": x2.attack_count, "bad_rows": _ctr_bad_rows(rows2), "atk_ts": atk_ts, "logs_ok": _ctr_logs_ok(x2.counter_log),
			"intervals_ok": not intervals.is_empty() and intervals.all(func(v): return absf(float(v) - 1.1) < 1e-9),
			"pause": {"n": [p2.get("n"), p2.get("n2")], "hp": [p2.get("hp"), p2.get("hp2")], "count": [p2.get("count"), p2.get("count2")], "frozen": p2.get("frozen"),
				"rows": st2.paused.size(), "moved": st2.paused.filter(func(r): return int(r.atk) != 0 or int(r.ctr) != 0 or float(r.dh) != 0.0 or float(r.dt) != 0.0).size()},
			"menu": not st2.menu.is_empty(), "ts_now": Engine.time_scale}
		ok2 = int(st2.phase) == 4 and int(st2.n) >= 8 and d2.bad_rows.is_empty() and x2.counter_count == e2.blocker_attacks and x2.counter_log.size() == x2.counter_count \
			and d2.logs_ok and _ls_near(x2.current_hp, 1000.0 - 50.0 * float(x2.counter_count), 1e-6) \
			and _ls_near(d2.lost, 100.0 * float(x2.attack_count) + 10.0 * float(x2.counter_count), 1e-6) and d2.intervals_ok \
			and atk_ts.has(2.0) and atk_ts.has(0.1) and atk_ts.has(1.0) \
			and p2.get("n") == p2.get("n2") and p2.get("hp") == p2.get("hp2") and p2.get("count") == p2.get("count2") and p2.get("frozen") == true \
			and int(d2.pause.rows) >= 20 and int(d2.pause.moved) == 0 and not st2.menu.is_empty() and is_equal_approx(Engine.time_scale, 1.0)
	_check("反擊-2 實際引擎（1 倍、2 倍、部署慢速、手動暫停）：敵人每次攻擊夏侯惇扣 50、同一步反彈 10，沒有攻擊的步數不變；暫停 1 秒中沒有攻擊與反彈；反彈次數＝攻擊次數＝紀錄筆數；敵人被扣掉的＝普通攻擊 100 × 次數 ＋ 反彈 10 × 次數；普通攻擊間隔仍是 1.1 秒",
		ok2, d2)

	# 反擊-3：組合與結算（實際引擎）：
	# a 致死：血量 25 的敵人擋在攻擊力 0 的夏侯惇前面（只有反彈會扣它的血）：反彈 10、10、5 後倒下，擊殺 1、勝利且只結算一次、戰鬥金幣只加一次，
	#   夏侯惇生命 850、紀錄最後一筆是打倒；
	# b 劉備的防禦光環（劉備在 (5,4)）：夏侯惇的防禦加成 1.2，每次攻擊扣約 45.4545、同一步反彈約 9.0909；
	# c 張飛的暈眩、免疫減速的敵人：反彈次數仍等於敵人的攻擊次數、每筆都是 50／10，敵人有被暈眩、沒有任何減速；
	# d 兩個敵人都擋在攻擊力 0 的夏侯惇前面：每個敵人被扣掉的＝10 × 它自己的攻擊次數，夏侯惇扣 50 × 兩個敵人的攻擊次數；
	# e 技能 id 不認得（counter_x）：照常扣 50，但不反彈
	var d3: Dictionary = {}
	_ctr_load(rec, "ctr-3a", [[_grp("ctr_soft", 1, 0.02)]], [_ctr_xhd(0.0)], {"xia_hou_dun": Vector2i(4, 5)})
	var x3a: Node = _fly_hero("xia_hou_dun")
	var ended3: int = battle_ended_count
	var gold3: int = _bm().battle_gold
	await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	await _wait_until(func(): return _bm().game_state == BattleManager.GameState.RESULT, 10.0)
	await _wait(0.3)
	d3["a"] = {"hp": x3a.current_hp if is_instance_valid(x3a) else -1.0, "log": x3a.counter_log.duplicate(true) if is_instance_valid(x3a) else [],
		"kills": _bm().kills, "ended": battle_ended_count - ended3, "result": last_result.get("result"), "gold": _bm().battle_gold - gold3}
	var lg3: Array = d3.a.log
	var ok3a: bool = d3.a.hp == 850.0 and lg3.size() == 3 and _ls_near(lg3[0].dealt, 10.0) and _ls_near(lg3[1].dealt, 10.0) and _ls_near(lg3[2].dealt, 5.0) \
		and lg3[2].killed == true and lg3[0].killed == false and d3.a.kills == 1 and d3.a.ended == 1 and d3.a.result == "WIN" and d3.a.gold == BattleManager.GOLD_PER_KILL

	var ok3b: bool = false
	_ctr_load(rec, "ctr-3b", [[_grp("ctr_walk", 1, 0.02)]], [_ctr_xhd(), _r12_hero("liu_bei", DEF_AURA_SKILL.duplicate())],
		{"xia_hou_dun": Vector2i(4, 5), "liu_bei": Vector2i(5, 4)})
	var x3b: Node = _fly_hero("xia_hou_dun")
	var e3b: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	if e3b != null and x3b != null:
		await _wait_until(func(): return is_instance_valid(e3b) and e3b._blocker != null, 5.0)
		var rows3b: Array = await _ctr_track(x3b, e3b, 20000, func(rs): return rs.filter(func(r): return int(r.atk) > 0).size() >= 3)
		d3["b"] = {"bonus": x3b.def_bonus_mult, "bad_rows": _ctr_bad_rows(rows3b, CTR_HIT_AURA), "n": rows3b.filter(func(r): return int(r.atk) > 0).size(),
			"logs_ok": _ctr_logs_ok(x3b.counter_log, CTR_HIT_AURA)}
		ok3b = is_equal_approx(x3b.def_bonus_mult, 1.2) and d3.b.bad_rows.is_empty() and int(d3.b.n) >= 3 and d3.b.logs_ok

	var ok3c: bool = false
	_ctr_load(rec, "ctr-3c", [[_grp("ctr_walk_imm", 1, 0.02)]], [_ctr_xhd(), _stn_zf()], {"xia_hou_dun": Vector2i(4, 5), "zhang_fei": Vector2i(4, 6)})
	var x3c: Node = _fly_hero("xia_hou_dun")
	var e3c: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	if e3c != null and x3c != null:
		await _wait_until(func(): return is_instance_valid(e3c) and e3c._blocker != null, 5.0)
		var g3: float = _pt()
		await _wait_until(func(): return _pt() - g3 >= 6.0, 30.0)
		d3["c"] = {"attacks": e3c.blocker_attacks, "count": x3c.counter_count, "logs_ok": _ctr_logs_ok(x3c.counter_log), "stuns": e3c.stun_count,
			"immune": e3c.immune_slow, "sources": e3c._slow_sources.size(), "mult": e3c.speed_mult, "hp": x3c.current_hp}
		ok3c = e3c.blocker_attacks >= 2 and x3c.counter_count == e3c.blocker_attacks and d3.c.logs_ok and e3c.stun_count >= 1 and e3c.immune_slow \
			and e3c._slow_sources.is_empty() and e3c.speed_mult == 1.0 and _ls_near(x3c.current_hp, 1000.0 - 50.0 * float(e3c.blocker_attacks), 1e-6)

	var ok3d: bool = false
	_ctr_load(rec, "ctr-3d", [[_grp("ctr_walk", 2, 0.02)]], [_ctr_xhd(0.0)], {"xia_hou_dun": Vector2i(4, 5)})
	var x3d: Node = _fly_hero("xia_hou_dun")
	_bm().player_start_battle()
	await _wait_until(func(): return _ctr_enemies().size() >= 2, 5.0)
	var es3d: Array = _ctr_enemies()
	if es3d.size() >= 2 and x3d != null:
		es3d[0].global_position = main.game_map.grid_to_world(Vector2i(4, 5)) + Vector2(-0.3, 0.0) * float(main._tile_size)
		es3d[1].global_position = main.game_map.grid_to_world(Vector2i(4, 5)) + Vector2(-0.45, 0.0) * float(main._tile_size)
		var g3d: float = _pt()
		await _wait_until(func(): return _pt() - g3d >= 5.0, 30.0)
		var per: Array = es3d.map(func(e): return [e.blocker_attacks, e.max_hp - e.current_hp] if is_instance_valid(e) else [-1, -1.0])
		var total: int = int(per[0][0]) + int(per[1][0])
		d3["d"] = {"per": per, "count": x3d.counter_count, "hp": x3d.current_hp}
		ok3d = int(per[0][0]) >= 2 and int(per[1][0]) >= 2 and _ls_near(per[0][1], 10.0 * float(per[0][0]), 1e-6) and _ls_near(per[1][1], 10.0 * float(per[1][0]), 1e-6) \
			and x3d.counter_count == total and _ls_near(x3d.current_hp, 1000.0 - 50.0 * float(total), 1e-6)

	_ctr_load(rec, "ctr-3e", [[_grp("ctr_walk", 1, 0.02)]], [_ctr_xhd(0.0, {"id": "counter_x", "counter_ratio": 0.2})], {"xia_hou_dun": Vector2i(4, 5)})
	var x3e: Node = _fly_hero("xia_hou_dun")
	var e3e: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	var g3e: float = _pt()
	await _wait_until(func(): return _pt() - g3e >= 2.5, 10.0)
	d3["e"] = [e3e.blocker_attacks if is_instance_valid(e3e) else -1, x3e.counter_ratio if x3e != null else -1.0, x3e.counter_count if x3e != null else -1,
		x3e.current_hp if x3e != null else -1.0, e3e.current_hp == e3e.max_hp if is_instance_valid(e3e) else false]
	_check("反擊-3 組合與結算：反彈 10、10、5 打倒血量 25 的敵人，擊殺 1、勝利且只結算一次、金幣只加一次；劉備的防禦光環裡每次扣約 45.45、同一步反彈約 9.09；和張飛的暈眩、免疫減速的敵人一起時反彈次數＝攻擊次數、每筆 50／10、敵人有暈眩沒有減速；兩個敵人各自只被反彈自己的攻擊；不認得的 id 不反彈",
		ok3a and ok3b and ok3c and ok3d and int(d3.e[0]) >= 2 and d3.e[1] == 0.0 and d3.e[2] == 0 and _ls_near(d3.e[3], 1000.0 - 50.0 * float(d3.e[0]), 1e-6) and d3.e[4] == true, d3)

	# 反擊-4：移位、移除、陣亡與新的一場（實際引擎）：
	# a 夏侯惇擋住敵人、反彈過之後移到建築格 (5,4)：敵人不再被擋住、照常前進，之後不再攻擊也不再反彈；
	# b 夏侯惇擋住敵人時被移出隊伍（update_team）：不在場上，敵人不再被擋住，之後沒有反彈；
	# c 攻擊力 0 的夏侯惇生命 120：前兩次攻擊各扣 50、反彈 10，第三次攻擊打倒它、不反彈（敵人只被扣掉 20），之後不在場上、敵人照常前進；
	# d 新的一場：反彈次數 0、沒有紀錄、生命 1000
	var d4: Dictionary = {}
	_ctr_load(rec, "ctr-4a", [[_grp("ctr_walk", 1, 0.02)]], [_ctr_xhd(0.0)], {"xia_hou_dun": Vector2i(4, 5)})
	var x4: Node = _fly_hero("xia_hou_dun")
	var e4: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	var ok4a: bool = false
	if e4 != null and x4 != null:
		await _wait_until(func(): return is_instance_valid(x4) and x4.counter_count >= 1, 5.0)
		var before4: Array = [x4.counter_count, e4.blocker_attacks, e4.current_hp, e4.global_position.x]
		_blk_move(x4, Vector2i(5, 4))
		var g4: float = _pt()
		await _wait_until(func(): return _pt() - g4 >= 2.5, 10.0)
		d4["a"] = {"before": before4, "after": [x4.counter_count, e4.blocker_attacks, e4.current_hp], "blocker": e4._blocker == null, "cell": [x4.grid_cell.x, x4.grid_cell.y],
			"moved": (e4.global_position.x - float(before4[3])) / float(main._tile_size)}
		ok4a = int(before4[0]) >= 1 and x4.counter_count == int(before4[0]) and e4.blocker_attacks == int(before4[1]) and e4.current_hp == float(before4[2]) \
			and d4.a.blocker and float(d4.a.moved) > 0.2

	_ctr_load(rec, "ctr-4b", [[_grp("ctr_walk", 1, 0.02)]], [_ctr_xhd(0.0)], {"xia_hou_dun": Vector2i(4, 5)})
	var x4b: Node = _fly_hero("xia_hou_dun")
	var e4b: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	var ok4b: bool = false
	if e4b != null and x4b != null:
		await _wait_until(func(): return is_instance_valid(x4b) and x4b.counter_count >= 1, 5.0)
		var hp4b: float = e4b.current_hp
		var atk4b: int = e4b.blocker_attacks
		_r19_js(rec, {"type": "update_team", "team_list": []})
		await _def_frames(3)
		var g4b: float = _pt()
		await _wait_until(func(): return _pt() - g4b >= 1.5, 8.0)
		d4["b"] = [_fly_hero("xia_hou_dun") == null, e4b.current_hp == hp4b, e4b.blocker_attacks == atk4b, e4b._blocker == null]
		ok4b = d4.b == [true, true, true, true]

	_ctr_load(rec, "ctr-4c", [[_grp("ctr_walk", 1, 0.02)]], [_ctr_xhd(0.0)], {"xia_hou_dun": Vector2i(4, 5)})
	var x4c: Node = _fly_hero("xia_hou_dun")
	if x4c != null:
		x4c.current_hp = 120.0
	var e4c: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	var ok4c: bool = false
	if e4c != null and x4c != null:
		# 倒下時（節點被釋放之前）記下反擊的紀錄
		var box: Dictionary = {"log": [], "died": 0}
		x4c.hero_died.connect(func(h: Node) -> void:
			box["log"] = h.counter_log.duplicate(true)
			box["died"] = int(box["died"]) + 1)
		await _wait_until(func(): return int(box["died"]) > 0, 10.0)
		var log4c: Array = box["log"]
		var atk4c: int = e4c.blocker_attacks
		var lost4c: float = e4c.max_hp - e4c.current_hp
		await _def_frames(5)
		var x0: float = e4c.global_position.x
		var g4c: float = _pt()
		await _wait_until(func(): return _pt() - g4c >= 1.0, 8.0)
		d4["c"] = {"log": log4c, "attacks": atk4c, "lost": lost4c, "gone": _fly_hero("xia_hou_dun") == null, "blocker": e4c._blocker == null,
			"moved": (e4c.global_position.x - x0) / float(main._tile_size)}
		ok4c = atk4c == 3 and log4c.size() == 2 and _ctr_logs_ok(log4c) and _ls_near(lost4c, 20.0, 1e-6) and bool(d4.c.gone) and bool(d4.c.blocker) and float(d4.c.moved) > 0.2

	_ctr_load(rec, "ctr-4d", [[_grp("ctr_walk", 1, 0.02)]], [_ctr_xhd()], {"xia_hou_dun": Vector2i(4, 5)})
	await _def_frames()
	var x4d: Node = _fly_hero("xia_hou_dun")
	d4["d"] = [x4d.counter_count if x4d != null else -1, x4d.counter_log.size() if x4d != null else -1, x4d.current_hp if x4d != null else -1.0, x4d.counter_ratio if x4d != null else -1.0]
	_check("反擊-4 移位、移除、陣亡與新的一場：反彈過的夏侯惇移到建築格後敵人不再被擋住、照常前進，不再攻擊與反彈；移出隊伍後不在場上、沒有反彈；生命 120 時前兩擊各反彈 10、第三擊打倒它不反彈（敵人只被扣 20），之後不在場上、敵人照常前進；新的一場反彈次數 0、沒有紀錄、生命 1000",
		ok4a and ok4b and ok4c and d4.d == [0, 0, 1000.0, 0.2], d4)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())

# ── 堅韌（廖化）──
# 每次有效的受傷都用受傷前的生命比例判斷：current_hp ÷ max_hp 不高於 30%（含剛好 30%）時，防禦計算後（含防禦光環）的傷害再乘 0.8；
# 不是提高防禦、只乘一次；讓生命跨過門檻的那一擊不減傷、下一擊才減傷；用當下的最大生命；沒有攻擊者的扣血同樣減傷；致死照常倒下

## 廖化的堅韌（和網頁 utils/heroSkills 的出征參數相同）
const TEN_SKILL: Dictionary = {"id": "tenacity", "low_hp_ratio": 0.3, "damage_mult": 0.8}
## 攻擊力 100 打防禦 100：沒有減傷扣 50、減傷扣 40；在劉備的防禦光環裡（防禦 120）沒有減傷扣 100 × 100 ÷ 220、減傷再乘 0.8
const TEN_HIT: float = 50.0
const TEN_HIT_LOW: float = 40.0
const TEN_HIT_AURA: float = 100.0 * 100.0 / 220.0
const TEN_HIT_AURA_LOW: float = 100.0 * 100.0 / 220.0 * 0.8
## 實際引擎用的敵人：慢速地面兵（每秒 20 像素、攻擊力 100、血量很多）
const TEN_ENEMIES: Array = [
	{"enemy_id": "ten_walk", "name": "W", "hp": 99999.0, "speed": 20.0, "atk": 100},
]

## 數字（可以是巢狀的陣列）逐一相符，容許浮點誤差；其他型別要完全相同
func _ten_same(a: Variant, b: Variant, eps: float = 1e-6) -> bool:
	if a is Array and b is Array:
		if a.size() != b.size():
			return false
		for i in range(a.size()):
			if not _ten_same(a[i], b[i], eps):
				return false
		return true
	if (a is float or a is int) and (b is float or b is int):
		return absf(float(a) - float(b)) < eps
	return typeof(a) == typeof(b) and a == b

## 單獨的廖化（真正的 Hero 腳本，不經過 Main、不攻擊）：最大生命 max_v、目前生命 hp、防禦 def_v；skill 是 null 時帶堅韌的參數
func _ten_hero(holder: Node, hp: float, max_v: float = 1000.0, def_v: float = 100.0, skill: Variant = null) -> Node:
	var h: Node = load("res://entities/hero/Hero.gd").new()
	holder.add_child(h)
	h.set_process(false)
	h.hero_id = "liao_hua"
	h.max_hp = max_v
	h.current_hp = hp
	h.def_stat = def_v
	h._read_skill({"skill": TEN_SKILL.duplicate() if skill == null else skill})
	return h

## 直接呼叫受傷（傷害 amount，可以帶攻擊者）：回傳 [受傷前的生命, 扣掉的生命]
func _ten_hit(h: Node, amount: float = 100.0, source: Variant = null) -> Array:
	var before: float = h.current_hp
	h.take_damage(amount, source)
	return [before, before - h.current_hp]

## 固定步進用的一對：真正的 Enemy（攻擊力 100、速度 0，停在第 3 格）與真正的 Hero（廖化：防禦 100、最大生命 max_v、目前生命 hp，
## 放在第 3 格擋住它、不攻擊）；skill 是 null 時帶堅韌的參數。測試自己用固定的 delta 呼叫敵人的 _physics_process（第 2 步打第一擊）
func _ten_pair(holder: Node, hp: float, max_v: float = 1000.0, skill: Variant = null) -> Dictionary:
	var map := BlkMap.new()
	holder.add_child(map)
	var e: Node = _ctr_enemy(holder, map)
	var h: Node = _blk_hero(holder, map, 3, max_v)
	h.hero_id = "liao_hua"
	h.def_stat = 100.0
	h.current_hp = hp
	h._read_skill({"skill": TEN_SKILL.duplicate() if skill == null else skill})
	return {"e": e, "h": h, "map": map}

## 實際引擎：載入一場（經過 JSON）並依 cells 放置武將（hero_id → 格子），不開戰。廖化是步兵、射程 1.5 格、攻擊間隔 1.1 秒；劉備（射程 3 格）用來測組合
func _ten_load(rec: Node, battle_id: String, waves: Array, team: Array, cells: Dictionary) -> void:
	var p: Dictionary = _r12_payload("ten_" + battle_id, waves, battle_id, team)
	p["heroes_config"] = [
		{"hero_id": "liao_hua", "name": "廖化", "job": "infantry", "attack_range": 1.5, "attack_speed": 1.1},
		{"hero_id": "liu_bei", "name": "劉備", "job": "infantry", "attack_range": 3.0, "attack_speed": 0.5},
	]
	for c in TEN_ENEMIES:
		p["enemies_config"].append(c.duplicate())
	_r19_js(rec, p)
	for hid in cells:
		_r12_place(hid, cells[hid])

## 出征的廖化（攻擊力 100、防禦 100、生命 hp、等級 level）；skill 是 null 時帶堅韌的參數
func _ten_lh(hp: float = 1000.0, skill: Variant = null, level: int = 1) -> Dictionary:
	var h: Dictionary = _r12_hero("liao_hua", TEN_SKILL.duplicate() if skill == null else skill)
	h["def"] = 100.0
	h["hp"] = hp
	h["level"] = level
	return h

## 每一列：敵人攻擊 1 次的列廖化扣 hit；沒有攻擊的列生命不變。回傳不符合的列（最多 5 列）
func _ten_bad_rows(rows: Array, hit: float) -> Array:
	var bad: Array = []
	for i in range(rows.size()):
		var r: Dictionary = rows[i]
		var ok: bool = (int(r.atk) == 0 and float(r.dh) == 0.0) or (int(r.atk) == 1 and absf(float(r.dh) + hit) < 1e-6)
		if not ok:
			bad.append({"i": i, "row": r})
	return bad.slice(0, 5)

## 堅韌紀錄每一筆都是 [受傷前的生命, 實際扣掉的生命, 有沒有減傷]
func _ten_log(h: Node) -> Array:
	return h.tenacity_log.map(func(x): return [x.before, x.taken, x.reduced])

func _tenacity_cases() -> void:
	# 堅韌-0：技能參數的判讀：low_hp_ratio 與 damage_mult 都是 0～1 之間（不含兩端）的有限數字才啟用（0.3／0.8、0.0001／0.9999、0.5／0.5、經過 JSON 的 0.3／0.8）；
	# 任何一個是字串、布林、null、陣列、字典、NaN、正負無限大、0、負數、1、超過 1 或沒有欄位時整個不啟用（另一個合理也一樣，不補預設值）；
	# 不認得或大小寫不同的 id、其他技能都不啟用；堅韌不帶其他技能，換成其他技能或沒有技能後清除
	var h0: Node = load("res://entities/hero/Hero.gd").new()
	var off: Array = [0.0, 1.0]
	var cases0: Array = [[{"id": "tenacity", "low_hp_ratio": 0.3, "damage_mult": 0.8}, [0.3, 0.8]],
		[{"id": "tenacity", "low_hp_ratio": 0.0001, "damage_mult": 0.9999}, [0.0001, 0.9999]],
		[{"id": "tenacity", "low_hp_ratio": 0.5, "damage_mult": 0.5}, [0.5, 0.5]]]
	for bad in ["0.3", true, false, null, [0.3], {"v": 0.3}, NAN, INF, -INF, 0, 0.0, -0.3, 1, 1.0, 1.5]:
		cases0.append([{"id": "tenacity", "low_hp_ratio": bad, "damage_mult": 0.8}, off])
		cases0.append([{"id": "tenacity", "low_hp_ratio": 0.3, "damage_mult": bad}, off])
	cases0.append_array([[{"id": "tenacity", "damage_mult": 0.8}, off], [{"id": "tenacity", "low_hp_ratio": 0.3}, off], [{"id": "tenacity"}, off],
		[{"id": "tenacity_x", "low_hp_ratio": 0.3, "damage_mult": 0.8}, off], [{"id": "Tenacity", "low_hp_ratio": 0.3, "damage_mult": 0.8}, off],
		[{"id": "counter", "counter_ratio": 0.2, "low_hp_ratio": 0.3, "damage_mult": 0.8}, off], [{"id": "def_aura", "def_mult": 1.2}, off], [null, off]])
	var bad0: Array = []
	for c in cases0:
		h0._read_skill({} if c[0] == null else {"skill": c[0]})
		if [h0.tenacity_hp_ratio, h0.tenacity_damage_mult] != c[1]:
			bad0.append(str(c[0]))
	h0._read_skill({"skill": JSON.parse_string("{\"id\": \"tenacity\", \"low_hp_ratio\": 0.3, \"damage_mult\": 0.8}")})
	var json0: Array = [h0.tenacity_hp_ratio, h0.tenacity_damage_mult]
	var other0: Array = [h0.stun_duration, h0.slow_aura_mult, h0.def_aura_mult, h0.dodge_chance, h0.first_strike_multiplier, h0.range_multiplier, h0.burn_ratio,
		h0.sweep_ratio, h0.lifesteal_ratio, h0.atk_speed_aura_mult, h0.counter_ratio]
	h0._read_skill({"skill": {"id": "counter", "counter_ratio": 0.2}})
	var switched0: Array = [h0.tenacity_hp_ratio, h0.tenacity_damage_mult, h0.counter_ratio]
	h0._read_skill({"skill": TEN_SKILL.duplicate()})
	h0._read_skill({})
	var cleared0: Array = [h0.tenacity_hp_ratio, h0.tenacity_damage_mult]
	h0.free()
	_check("堅韌-0 技能參數：low_hp_ratio／damage_mult 是 0～1 之間（不含兩端）的有限數字才啟用（0.3／0.8、0.0001／0.9999、0.5／0.5 與經過 JSON 的 0.3／0.8）；任何一個是字串、布林、null、陣列、字典、NaN、無限大、0、負數、1、超過 1 或沒有欄位時整個不啟用；不認得或大小寫不同的 id、其他技能都不啟用；堅韌不帶其他技能，換成反擊或沒有技能後清除",
		bad0.is_empty() and json0 == [0.3, 0.8] and other0 == [0.0, 1.0, 1.0, 0.0, 1.0, 1.0, 0.0, 0.0, 0.0, 1.0, 0.0] and switched0 == [0.0, 1.0, 0.2] and cleared0 == [0.0, 1.0],
		{"bad": bad0, "json": json0, "other": other0, "switched": switched0, "cleared": cleared0, "cases": cases0.size()})

	# 堅韌-1：受傷前的生命判斷與數值（單獨的廖化，直接呼叫受傷、不帶攻擊者，也就是舊的呼叫方式）：最大生命 1000、防禦 100、傷害 100：
	# a 生命 301 → 扣 50 到 251（這一擊不減傷）→ 下一擊扣 40 到 211；紀錄是受傷前的生命、最大生命、防禦計算後的傷害、實扣與有沒有減傷，減傷 1 次、少扣 10；
	# b 剛好 300 扣 40、300.001 扣 50、299.999 扣 40；
	# c 生命 260 經過恢復（吸血的恢復流程）回到 301 後扣 50、下一擊扣 40；
	# d 最大生命 500：150 扣 40、151 扣 50；最大生命 2000：600 扣 40、601 扣 50、301 扣 40（門檻跟著最大生命，不是固定的 300 點）；
	# e 升級（更新隊伍，最大生命 1000 → 2000，生命照比例變成 500、640）：25% 的扣 40、32% 的扣 50（用新的最大生命）；
	# f 防禦光環（防禦 × 1.2）：生命 400 扣約 45.45、生命 300 扣約 36.36（防禦計算後再乘 0.8，不是加在防禦上、只乘一次）；防禦 0 的生命 300 扣 80；
	# g 參數無效（沒有倍率）時生命 300 照常扣 50；無效的傷害（0、負數、NaN、正負無限大）不扣血、不記錄；
	# h 閃避（抽樣 0）不扣血、不記錄，改成抽樣 0.99 後扣 40；
	# i 致死：生命 40 扣 40 倒下、39.9 倒下（倒下信號一次、生命 0、正要被移除），40.0001 撐住剩 0.0001；最大生命 100、生命 50（不減傷）扣 50 倒下；
	# j 同時設定反擊 0.2（帶攻擊者）：生命 300 扣 40、反彈 8（以減傷後的實扣為準），生命 400 扣 50、反彈 10
	var hh := _dodge_holder()
	var ha: Node = _ten_hero(hh, 301.0)
	var a1: Array = [_ten_hit(ha), _ten_hit(ha)]
	var log_a: Array = ha.tenacity_log.map(func(x): return [x.before, x.max_hp, x.raw, x.taken, x.reduced])
	var cnt_a: Array = [ha.tenacity_count, ha.tenacity_saved]
	var b1: Array = []
	for hp in [300.0, 300.001, 299.999]:
		b1.append(_ten_hit(_ten_hero(hh, hp))[1])
	var hc: Node = _ten_hero(hh, 260.0)
	hc.lifesteal_ratio = 1.0
	hc._lifesteal(41.0)
	var c1: Array = [hc.current_hp, _ten_hit(hc)[1], _ten_hit(hc)[1]]
	var d1: Array = []
	for c in [[500.0, 150.0], [500.0, 151.0], [2000.0, 600.0], [2000.0, 601.0], [2000.0, 301.0]]:
		d1.append(_ten_hit(_ten_hero(hh, c[1], c[0]))[1])
	var e1: Array = []
	for hp in [250.0, 320.0]:
		var he: Node = _ten_hero(hh, hp)
		he.apply_stat_update({"hp": 2000.0, "level": 2, "def": 100.0}, [])
		e1.append([he.max_hp, he.current_hp, _ten_hit(he)[1]])
	var hf: Node = _ten_hero(hh, 400.0)
	hf.apply_def_from("test_def", 1.2, 1.0e9)
	var f1: Array = [_ten_hit(hf)[1]]
	hf.current_hp = 300.0
	f1.append(_ten_hit(hf)[1])
	f1.append(_ten_hit(_ten_hero(hh, 300.0, 1000.0, 0.0))[1])
	var g1: Array = [_ten_hit(_ten_hero(hh, 300.0, 1000.0, 100.0, {"id": "tenacity", "low_hp_ratio": 0.3}))[1]]
	var hg: Node = _ten_hero(hh, 250.0)
	for v in [0.0, -5.0, NAN, INF, -INF]:
		hg.take_damage(v)
	g1.append([hg.current_hp, hg.tenacity_count, hg.tenacity_log.size()])
	var hd: Node = _ten_hero(hh, 250.0)
	var u: Array = [0.0]
	hd.dodge_chance = 0.5
	hd.dodge_roll_override = func() -> float: return float(u[0])
	var h1: Array = [_ten_hit(hd)[1]]
	u[0] = 0.99
	h1.append(_ten_hit(hd)[1])
	h1.append_array([hd.dodge_count, hd.tenacity_log.size()])
	var i1: Array = []
	for c in [[1000.0, 40.0], [1000.0, 39.9], [1000.0, 40.0001], [100.0, 50.0]]:
		var hl: Node = _ten_hero(hh, c[1], c[0])
		var deaths: Array = [0]
		hl.hero_died.connect(func(_x): deaths[0] += 1)
		var r: Array = _ten_hit(hl)
		i1.append([r[1], hl.current_hp, deaths[0], hl.is_queued_for_deletion()])
	var pk: Dictionary = _ten_pair(hh, 300.0)
	pk.h.counter_ratio = 0.2
	var j1: Array = [_ten_hit(pk.h, 100.0, pk.e)[1], 99999.0 - pk.e.current_hp]
	pk.h.current_hp = 400.0
	j1.append_array([_ten_hit(pk.h, 100.0, pk.e)[1], 99999.0 - pk.e.current_hp])
	j1.append(pk.h.counter_log.map(func(x): return x.taken))
	hh.queue_free()
	var d1x: Dictionary = {"a": a1, "log_a": log_a, "count_a": cnt_a, "b": b1, "c": c1, "d": d1, "e": e1, "f": f1, "g": g1, "h": h1, "i": i1, "j": j1}
	_check("堅韌-1 受傷前的生命判斷（不帶攻擊者的扣血也減傷）：301 扣 50 到 251、下一擊扣 40；剛好 300 扣 40、300.001 扣 50、299.999 扣 40；恢復到 301 後扣 50；最大生命 500 時 150／151、2000 時 600／601／301 照比例判斷；升級後照新的最大生命（25% 扣 40、32% 扣 50）；防禦光環裡 45.45 → 36.36（只乘一次）、防禦 0 扣 80；參數無效照常扣 50；無效的傷害與閃避不扣血不記錄；致死照常倒下不保底（40、39.9 倒下，40.0001 剩 0.0001，不減傷的 50 也倒下）；同時有反擊時反彈減傷後實扣的 20%",
		_ten_same(a1, [[301.0, 50.0], [251.0, 40.0]]) and _ten_same(log_a, [[301.0, 1000.0, 50.0, 50.0, false], [251.0, 1000.0, 50.0, 40.0, true]]) and _ten_same(cnt_a, [1, 10.0])
			and _ten_same(b1, [40.0, 50.0, 40.0]) and _ten_same(c1, [301.0, 50.0, 40.0]) and _ten_same(d1, [40.0, 50.0, 40.0, 50.0, 40.0])
			and _ten_same(e1, [[2000.0, 500.0, 40.0], [2000.0, 640.0, 50.0]]) and _ten_same(f1, [TEN_HIT_AURA, TEN_HIT_AURA_LOW, 80.0])
			and _ten_same(g1, [50.0, [250.0, 0, 0]]) and _ten_same(h1, [0.0, 40.0, 1, 1])
			and _ten_same(i1, [[40.0, 0.0, 1, true], [39.9, 0.0, 1, true], [40.0, 0.0001, 0, false], [50.0, 0.0, 1, true]], 1e-9)
			and _ten_same(j1, [40.0, 8.0, 50.0, 18.0, [40.0, 50.0]]),
		d1x)

	# 堅韌-2：固定步進（真正的 Enemy 與 Hero，每步 1/60 秒；敵人第 2、62、122、182 步攻擊）：攻擊力 100 打防禦 100 的廖化（最大生命 1000）：
	# a 生命 340：第 2 步扣 50（34%，不減傷）→ 之後每擊扣 40（290、250、210 都在門檻內），沒有攻擊的步數生命不變；減傷 3 次；
	# b 生命 301：扣 50 到 251 → 下一擊扣 40；剛好 300：每擊扣 40；
	# c 在防禦光環裡（防禦 × 1.2）生命 300：每擊約 36.36；
	# d 生命 40：第一擊扣 40 倒下（倒下信號一次），之後敵人不再被擋住、不再攻擊
	var h2 := _dodge_holder()
	var pa: Dictionary = _ten_pair(h2, 340.0)
	var ra: Dictionary = _ctr_steps(pa.e, pa.h, 190)
	var a2: Dictionary = {"atk": ra.atk, "odd": ra.odd, "hp": pa.h.current_hp, "count": pa.h.tenacity_count, "log": _ten_log(pa.h)}
	var pb: Dictionary = _ten_pair(h2, 301.0)
	var rb: Dictionary = _ctr_steps(pb.e, pb.h, 70)
	var pb2: Dictionary = _ten_pair(h2, 300.0)
	var rb2: Dictionary = _ctr_steps(pb2.e, pb2.h, 70)
	var pc: Dictionary = _ten_pair(h2, 300.0)
	pc.h.apply_def_from("test_def", 1.2, 1.0e9)
	var rc: Dictionary = _ctr_steps(pc.e, pc.h, 70)
	var pd: Dictionary = _ten_pair(h2, 40.0)
	var dd: Array = [0]
	pd.h.hero_died.connect(func(_x): dd[0] += 1)
	var rd: Dictionary = _ctr_steps(pd.e, pd.h, 70)
	var b2: Dictionary = {"cross": rb.atk, "cross_odd": rb.odd, "edge": rb2.atk, "edge_odd": rb2.odd, "aura": rc.atk, "aura_odd": rc.odd,
		"lethal": rd.atk, "died": dd[0], "attacks": pd.e.blocker_attacks, "blocker": pd.e._blocker == null, "hp": pd.h.current_hp}
	h2.queue_free()
	_check("堅韌-2 固定步進（真正的 Enemy 阻路攻擊）：生命 340 第一擊扣 50、之後每擊 40；301 扣 50 到 251、下一擊 40；剛好 300 每擊 40；防禦光環裡每擊約 36.36；沒有攻擊的步數不變；生命 40 第一擊扣 40 倒下（一次），之後不再被攻擊",
		_ctr_rows_ok(a2.atk, [[2, 50, 0, 0], [62, 40, 0, 0], [122, 40, 0, 0], [182, 40, 0, 0]]) and a2.odd.is_empty() and _ten_same(a2.hp, 170.0) and a2.count == 3
			and _ten_same(a2.log, [[340.0, 50.0, false], [290.0, 40.0, true], [250.0, 40.0, true], [210.0, 40.0, true]])
			and _ctr_rows_ok(b2.cross, [[2, 50, 0, 0], [62, 40, 0, 0]]) and b2.cross_odd.is_empty()
			and _ctr_rows_ok(b2.edge, [[2, 40, 0, 0], [62, 40, 0, 0]]) and b2.edge_odd.is_empty()
			and _ctr_rows_ok(b2.aura, [[2, TEN_HIT_AURA_LOW, 0, 0], [62, TEN_HIT_AURA_LOW, 0, 0]]) and b2.aura_odd.is_empty()
			and _ctr_rows_ok(b2.lethal, [[2, 40, 0, 0]]) and b2.died == 1 and b2.attacks == 1 and b2.blocker and b2.hp == 0.0,
		{"a": a2, "b": b2})

	var rec: Node = load("res://__regression__/bridge_recorder.gd").new()
	var original: Node = main.web_bridge
	main.web_bridge = rec
	rec.payload_received.connect(main._on_payload_received)

	# 堅韌-3：實際引擎（時間倍率與暫停）：廖化在道路 (4,5) 擋住慢速地面兵（攻擊力 100），最大生命 2000、防禦 100，開戰前生命設成剛好 600（30%）：
	# 備戰時點選廖化，面板的堅韌是生效中（門檻 0.3、倍率 0.8）；1 倍 3 次攻擊 → 2 倍 3 次 → 部署選單（0.1 倍）1 次 → 關閉、回到 1 倍後手動暫停 1 秒（牆鐘）→ 繼續後再 1 次：
	# 每一步：敵人攻擊 1 次時廖化扣 40、沒有攻擊的步數生命不變；暫停中沒有攻擊、生命不變；減傷次數＝攻擊次數＝紀錄筆數；生命＝600 − 40 × 次數；
	# 快照的 hero_tenacity 和節點一致（生效中、門檻 0.3、倍率 0.8、最大生命 2000、紀錄每筆都是 40）
	var d3: Dictionary = {}
	var ok3: bool = false
	_ten_load(rec, "ten-3", [[_grp("ten_walk", 1, 0.02)]], [_ten_lh(2000.0)], {"liao_hua": Vector2i(4, 5)})
	var x3: Node = _fly_hero("liao_hua")
	if x3 != null:
		x3.current_hp = 600.0
		main._on_hero_clicked(x3)
	var panel3: Dictionary = rec.sent_panels.back() if not rec.sent_panels.is_empty() else {}
	var e3: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	if e3 != null and x3 != null:
		await _wait_until(func(): return is_instance_valid(e3) and e3._blocker != null, 5.0)
		var st3: Dictionary = {"n": 0, "phase": 0, "menu": {}, "pause": {}, "rec": rec, "h": x3, "paused": []}
		var each3 := func(row: Dictionary) -> void:
			st3.n = int(st3.n) + int(row.atk)
			var ph: int = int(st3.phase)
			if ph == 3:
				st3.paused.append(row)
			if ph == 0 and int(st3.n) >= 3:
				_r19_speed(st3.rec, 2.0)
				st3.phase = 1
			elif ph == 1 and int(st3.n) >= 6:
				st3.menu = _r19_open(st3.rec, 2)
				st3.phase = 2
			elif ph == 2 and int(st3.n) >= 7:
				_r19_close(st3.rec, st3.menu)
				_r19_speed(st3.rec, 1.0)
				st3.pause = {"n": st3.n, "hp": st3.h.current_hp, "count": st3.h.tenacity_count, "wall": Time.get_ticks_msec(), "reply": _r20_pause(st3.rec, true)}
				st3.phase = 3
			elif ph == 3 and Time.get_ticks_msec() - int(st3.pause.wall) >= 1000:
				st3.pause["n2"] = st3.n
				st3.pause["hp2"] = st3.h.current_hp
				st3.pause["count2"] = st3.h.tenacity_count
				st3.pause["frozen"] = _r20_frozen()
				_r20_pause(st3.rec, false)
				st3.phase = 4
		var rows3: Array = await _ctr_track(x3, e3, 60000, func(_r): return int(st3.phase) == 4 and int(st3.n) >= 8, each3)
		var atk_ts: Array = rows3.filter(func(r): return int(r.atk) > 0).map(func(r): return snappedf(float(r.ts), 0.01))
		var p3: Dictionary = st3.pause
		var snap3: Dictionary = _fly_snapshot(rec)
		var ten3: Dictionary = snap3.get("hero_tenacity", {}).get("liao_hua", {})
		d3 = {"phase": st3.phase, "n": st3.n, "attacks": e3.blocker_attacks, "count": x3.tenacity_count, "log": x3.tenacity_log.size(), "hp": x3.current_hp,
			"bad_rows": _ten_bad_rows(rows3, TEN_HIT_LOW), "atk_ts": atk_ts, "panel": panel3.get("tenacity", {}),
			"logs_ok": x3.tenacity_log.all(func(x): return x.reduced == true and _ls_near(x.taken, TEN_HIT_LOW, 1e-6) and x.max_hp == 2000.0),
			"snap": {"low": ten3.get("low_hp_ratio"), "mult": ten3.get("damage_mult"), "active": ten3.get("active"), "count": ten3.get("count"), "hp": ten3.get("hp"),
				"max_hp": ten3.get("max_hp"), "log": (ten3.get("log", []) as Array).size(), "saved": ten3.get("saved")},
			"pause": {"n": [p3.get("n"), p3.get("n2")], "hp": [p3.get("hp"), p3.get("hp2")], "count": [p3.get("count"), p3.get("count2")], "frozen": p3.get("frozen"),
				"rows": st3.paused.size(), "moved": st3.paused.filter(func(r): return int(r.atk) != 0 or float(r.dh) != 0.0 or float(r.dt) != 0.0).size()},
			"menu": not st3.menu.is_empty(), "ts_now": Engine.time_scale}
		var n3: int = x3.tenacity_count
		ok3 = int(st3.phase) == 4 and int(st3.n) >= 8 and d3.bad_rows.is_empty() and n3 == e3.blocker_attacks and x3.tenacity_log.size() == n3 and d3.logs_ok \
			and _ls_near(x3.current_hp, 600.0 - 40.0 * float(n3), 1e-6) and atk_ts.has(2.0) and atk_ts.has(0.1) and atk_ts.has(1.0) \
			and p3.get("n") == p3.get("n2") and p3.get("hp") == p3.get("hp2") and p3.get("count") == p3.get("count2") and p3.get("frozen") == true \
			and int(d3.pause.rows) >= 20 and int(d3.pause.moved) == 0 and not st3.menu.is_empty() and is_equal_approx(Engine.time_scale, 1.0) \
			and d3.panel == {"active": true, "low_hp_ratio": 0.3, "damage_mult": 0.8, "max_hp": 2000.0} \
			and d3.snap.low == 0.3 and d3.snap.mult == 0.8 and d3.snap.active == true and int(d3.snap.count) == n3 and _ls_near(d3.snap.hp, x3.current_hp, 1e-6) \
			and d3.snap.max_hp == 2000.0 and int(d3.snap.log) == n3 and _ls_near(d3.snap.saved, 10.0 * float(n3), 1e-6)
	_check("堅韌-3 實際引擎（1 倍、2 倍、部署慢速、手動暫停）：最大生命 2000、生命剛好 600 的廖化每次被攻擊扣 40，沒有攻擊的步數不變；暫停 1 秒中沒有攻擊、生命不變；減傷次數＝攻擊次數＝紀錄筆數、生命＝600 − 40 × 次數；選取面板與快照的堅韌是生效中（0.3、0.8、最大生命 2000）",
		ok3, d3)

	# 堅韌-4：實際引擎的自然受傷、組合與多個敵人：
	# a 最大生命 200 的廖化（不改生命）：150、100、50（第 3 擊讓生命跨過門檻，這一擊不減傷）、之後 10、倒下：扣 50、50、50、40、10（第 5 擊減傷後 40 仍然打倒它）；
	#   倒下時紀錄是受傷前 200／150／100／50／10、減傷只有後兩擊；倒下一次、之後不在場上、敵人照常前進；
	# b 劉備的防禦光環（劉備在 (5,4)）、生命 300：防禦加成 1.2，每擊約 36.36；
	# c 兩個敵人都擋在廖化前面（最大生命 2000、生命 600）：每次攻擊扣 40、減傷次數＝兩個敵人的攻擊次數；
	# d 技能 id 不認得（tenacity_x）：生命 300 照常扣 50、快照沒有 hero_tenacity
	var d4: Dictionary = {}
	_ten_load(rec, "ten-4a", [[_grp("ten_walk", 1, 0.02)]], [_ten_lh(200.0)], {"liao_hua": Vector2i(4, 5)})
	var x4a: Node = _fly_hero("liao_hua")
	var e4a: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	var ok4a: bool = false
	if e4a != null and x4a != null:
		var box: Dictionary = {"log": [], "died": 0}
		x4a.hero_died.connect(func(h: Node) -> void:
			box["log"] = h.tenacity_log.map(func(x): return [x.before, x.taken, x.reduced])
			box["died"] = int(box["died"]) + 1)
		await _wait_until(func(): return int(box["died"]) > 0, 15.0)
		var atk4a: int = e4a.blocker_attacks
		await _def_frames(5)
		var x0: float = e4a.global_position.x
		var g4a: float = _pt()
		await _wait_until(func(): return _pt() - g4a >= 1.0, 8.0)
		d4["a"] = {"log": box["log"], "died": box["died"], "attacks": atk4a, "gone": _fly_hero("liao_hua") == null, "blocker": e4a._blocker == null,
			"moved": (e4a.global_position.x - x0) / float(main._tile_size)}
		ok4a = _ten_same(box["log"], [[200.0, 50.0, false], [150.0, 50.0, false], [100.0, 50.0, false], [50.0, 40.0, true], [10.0, 40.0, true]]) \
			and int(box["died"]) == 1 and atk4a == 5 and bool(d4.a.gone) and bool(d4.a.blocker) and float(d4.a.moved) > 0.2

	var ok4b: bool = false
	_ten_load(rec, "ten-4b", [[_grp("ten_walk", 1, 0.02)]], [_ten_lh(1000.0), _r12_hero("liu_bei", DEF_AURA_SKILL.duplicate())],
		{"liao_hua": Vector2i(4, 5), "liu_bei": Vector2i(5, 4)})
	var x4b: Node = _fly_hero("liao_hua")
	if x4b != null:
		x4b.current_hp = 300.0
	var e4b: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	if e4b != null and x4b != null:
		await _wait_until(func(): return is_instance_valid(e4b) and e4b._blocker != null, 5.0)
		var rows4b: Array = await _ctr_track(x4b, e4b, 20000, func(rs): return rs.filter(func(r): return int(r.atk) > 0).size() >= 3)
		d4["b"] = {"bonus": x4b.def_bonus_mult, "bad_rows": _ten_bad_rows(rows4b, TEN_HIT_AURA_LOW), "n": rows4b.filter(func(r): return int(r.atk) > 0).size(),
			"count": x4b.tenacity_count}
		ok4b = is_equal_approx(x4b.def_bonus_mult, 1.2) and d4.b.bad_rows.is_empty() and int(d4.b.n) >= 3 and x4b.tenacity_count == e4b.blocker_attacks

	var ok4c: bool = false
	_ten_load(rec, "ten-4c", [[_grp("ten_walk", 2, 0.02)]], [_ten_lh(2000.0)], {"liao_hua": Vector2i(4, 5)})
	var x4c: Node = _fly_hero("liao_hua")
	if x4c != null:
		x4c.current_hp = 600.0
	_bm().player_start_battle()
	await _wait_until(func(): return _ctr_enemies().size() >= 2, 5.0)
	var es4c: Array = _ctr_enemies()
	if es4c.size() >= 2 and x4c != null:
		es4c[0].global_position = main.game_map.grid_to_world(Vector2i(4, 5)) + Vector2(-0.3, 0.0) * float(main._tile_size)
		es4c[1].global_position = main.game_map.grid_to_world(Vector2i(4, 5)) + Vector2(-0.45, 0.0) * float(main._tile_size)
		var g4c: float = _pt()
		await _wait_until(func(): return _pt() - g4c >= 4.0, 30.0)
		var per: Array = es4c.map(func(e): return e.blocker_attacks if is_instance_valid(e) else -1)
		var total: int = int(per[0]) + int(per[1])
		d4["c"] = {"per": per, "count": x4c.tenacity_count, "hp": x4c.current_hp, "log_ok": x4c.tenacity_log.all(func(x): return _ls_near(x.taken, TEN_HIT_LOW, 1e-6))}
		ok4c = int(per[0]) >= 2 and int(per[1]) >= 2 and x4c.tenacity_count == total and _ls_near(x4c.current_hp, 600.0 - 40.0 * float(total), 1e-6) and bool(d4.c.log_ok)

	_ten_load(rec, "ten-4d", [[_grp("ten_walk", 1, 0.02)]], [_ten_lh(1000.0, {"id": "tenacity_x", "low_hp_ratio": 0.3, "damage_mult": 0.8})], {"liao_hua": Vector2i(4, 5)})
	var x4d: Node = _fly_hero("liao_hua")
	if x4d != null:
		x4d.current_hp = 300.0
	var e4d: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	var g4d: float = _pt()
	await _wait_until(func(): return _pt() - g4d >= 2.5, 10.0)
	var snap4d: Dictionary = _fly_snapshot(rec)
	d4["d"] = [e4d.blocker_attacks if is_instance_valid(e4d) else -1, x4d.tenacity_hp_ratio if x4d != null else -1.0, x4d.tenacity_count if x4d != null else -1,
		x4d.current_hp if x4d != null else -1.0, snap4d.has("hero_tenacity") and (snap4d.hero_tenacity as Dictionary).is_empty()]
	_check("堅韌-4 實際引擎：最大生命 200 的廖化自然受傷 50、50、50（跨過門檻的那一擊不減傷）、40、40（倒下，不保底），倒下一次、之後不在場上、敵人照常前進；劉備的防禦光環裡每擊約 36.36；兩個敵人時每擊 40、減傷次數＝攻擊次數；不認得的 id 照常扣 50、快照沒有堅韌",
		ok4a and ok4b and ok4c and int(d4.d[0]) >= 2 and d4.d[1] == 0.0 and d4.d[2] == 0 and _ls_near(d4.d[3], 300.0 - 50.0 * float(d4.d[0]), 1e-6) and d4.d[4] == true, d4)

	# 堅韌-5：移位、升級、換技能、移除與新的一場（實際引擎）：
	# a 減傷過的廖化（最大生命 2000、生命 600）移到建築格 (5,4)：技能參數不變、仍然生效，敵人不再被擋住、不再攻擊；
	# b 戰鬥中升級（更新隊伍：最大生命 1000 → 2000，生命 250 → 500）：之後每擊仍扣 40（用新的最大生命判斷），點選面板是生效中、最大生命 2000；
	#   生命 320 的升級後 640（32%）：面板是未生效，第一擊扣 50（到 590，29.5%）、第二擊扣 40；
	# c 更新隊伍把廖化的技能換成反擊：堅韌清除，生命 300 每擊扣 50；
	# d 移出隊伍：不在場上，敵人不再被擋住；
	# e 新的一場：減傷次數 0、沒有紀錄、生命等於最大生命、未生效
	var d5: Dictionary = {}
	_ten_load(rec, "ten-5a", [[_grp("ten_walk", 1, 0.02)]], [_ten_lh(2000.0)], {"liao_hua": Vector2i(4, 5)})
	var x5a: Node = _fly_hero("liao_hua")
	if x5a != null:
		x5a.current_hp = 600.0
	var e5a: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	var ok5a: bool = false
	if e5a != null and x5a != null:
		await _wait_until(func(): return is_instance_valid(x5a) and x5a.tenacity_count >= 1, 5.0)
		var before5: Array = [x5a.tenacity_count, e5a.blocker_attacks, x5a.current_hp]
		_blk_move(x5a, Vector2i(5, 4))
		var g5: float = _pt()
		await _wait_until(func(): return _pt() - g5 >= 2.5, 10.0)
		d5["a"] = {"before": before5, "after": [x5a.tenacity_count, e5a.blocker_attacks, x5a.current_hp], "params": [x5a.tenacity_hp_ratio, x5a.tenacity_damage_mult],
			"on": x5a.tenacity_on(), "blocker": e5a._blocker == null}
		ok5a = int(before5[0]) >= 1 and d5.a.after == before5 and d5.a.params == [0.3, 0.8] and d5.a.on and d5.a.blocker

	var ok5b: bool = false
	var b5: Array = []
	for hp in [250.0, 320.0]:
		_ten_load(rec, "ten-5b-%d" % int(hp), [[_grp("ten_walk", 1, 0.02)]], [_ten_lh(1000.0)], {"liao_hua": Vector2i(4, 5)})
		var x5b: Node = _fly_hero("liao_hua")
		if x5b == null:
			b5.append({})
			continue
		x5b.current_hp = hp
		_r19_js(rec, {"type": "update_team", "team_list": [_ten_lh(2000.0, null, 2)]})
		await _def_frames(2)
		main._on_hero_clicked(x5b)
		var panel5: Dictionary = rec.sent_panels.back() if not rec.sent_panels.is_empty() else {}
		var e5b: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
		if e5b == null:
			b5.append({})
			continue
		# 用廖化自己的受傷紀錄比對開戰後的前兩擊（不受開始追蹤的時間點影響）
		await _wait_until(func(): return is_instance_valid(x5b) and x5b.tenacity_log.size() >= 2, 10.0)
		b5.append({"max": x5b.max_hp, "level": x5b.hero_level, "panel": panel5.get("tenacity", {}), "log": _ten_log(x5b).slice(0, 2),
			"attacks": e5b.blocker_attacks if is_instance_valid(e5b) else -1})
	d5["b"] = b5
	if b5.size() == 2 and not b5[0].is_empty() and not b5[1].is_empty():
		ok5b = b5[0].max == 2000.0 and b5[0].level == 2 and _ten_same(b5[0].log, [[500.0, 40.0, true], [460.0, 40.0, true]]) \
			and b5[0].panel == {"active": true, "low_hp_ratio": 0.3, "damage_mult": 0.8, "max_hp": 2000.0} \
			and b5[1].max == 2000.0 and _ten_same(b5[1].log, [[640.0, 50.0, false], [590.0, 40.0, true]]) \
			and b5[1].panel == {"active": false, "low_hp_ratio": 0.3, "damage_mult": 0.8, "max_hp": 2000.0}

	var ok5c: bool = false
	_ten_load(rec, "ten-5c", [[_grp("ten_walk", 1, 0.02)]], [_ten_lh(1000.0)], {"liao_hua": Vector2i(4, 5)})
	var x5c: Node = _fly_hero("liao_hua")
	if x5c != null:
		x5c.current_hp = 300.0
		_r19_js(rec, {"type": "update_team", "team_list": [_ten_lh(1000.0, {"id": "counter", "counter_ratio": 0.2})]})
		await _def_frames(2)
		var e5c: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
		if e5c != null:
			await _wait_until(func(): return is_instance_valid(e5c) and e5c._blocker != null, 5.0)
			var rows5c: Array = await _ctr_track(x5c, e5c, 20000, func(rs): return rs.filter(func(r): return int(r.atk) > 0).size() >= 2)
			d5["c"] = {"params": [x5c.tenacity_hp_ratio, x5c.tenacity_damage_mult, x5c.counter_ratio], "bad50": _ten_bad_rows(rows5c, TEN_HIT).size(),
				"count": x5c.tenacity_count, "log": x5c.tenacity_log.size()}
			ok5c = d5.c.params == [0.0, 1.0, 0.2] and int(d5.c.bad50) == 0 and int(d5.c.count) == 0 and int(d5.c.log) == 0

	var ok5d: bool = false
	_ten_load(rec, "ten-5d", [[_grp("ten_walk", 1, 0.02)]], [_ten_lh(2000.0)], {"liao_hua": Vector2i(4, 5)})
	var x5d: Node = _fly_hero("liao_hua")
	if x5d != null:
		x5d.current_hp = 600.0
	var e5d: Node = await _stn_start(Vector2i(4, 5), Vector2(-0.4, 0.0))
	if e5d != null and x5d != null:
		await _wait_until(func(): return is_instance_valid(x5d) and x5d.tenacity_count >= 1, 5.0)
		var atk5d: int = e5d.blocker_attacks
		_r19_js(rec, {"type": "update_team", "team_list": []})
		await _def_frames(3)
		var g5d: float = _pt()
		await _wait_until(func(): return _pt() - g5d >= 1.5, 8.0)
		d5["d"] = [_fly_hero("liao_hua") == null, e5d.blocker_attacks == atk5d, e5d._blocker == null]
		ok5d = d5.d == [true, true, true]

	_ten_load(rec, "ten-5e", [[_grp("ten_walk", 1, 0.02)]], [_ten_lh(1000.0)], {"liao_hua": Vector2i(4, 5)})
	await _def_frames()
	var x5e: Node = _fly_hero("liao_hua")
	d5["e"] = [x5e.tenacity_count if x5e != null else -1, x5e.tenacity_log.size() if x5e != null else -1, x5e.current_hp if x5e != null else -1.0,
		x5e.max_hp if x5e != null else -1.0, x5e.tenacity_on() if x5e != null else true, [x5e.tenacity_hp_ratio, x5e.tenacity_damage_mult] if x5e != null else []]
	_check("堅韌-5 移位、升級、換技能、移除與新的一場：減傷過的廖化移到建築格後參數不變、仍然生效、不再被攻擊；升級後用新的最大生命判斷（25% → 500／2000 每擊 40、面板生效中；32% → 640／2000 面板未生效、扣 50 後下一擊 40）；換成反擊後堅韌清除、生命 300 每擊 50；移出隊伍後不在場上、敵人不再被擋住；新的一場沒有紀錄、滿血、未生效",
		ok5a and ok5b and ok5c and ok5d and d5.e == [0, 0, 1000.0, 1000.0, false, [0.3, 0.8]], d5)

	rec.payload_received.disconnect(main._on_payload_received)
	main.web_bridge = original
	rec.free()
	_load(_stage_b())
