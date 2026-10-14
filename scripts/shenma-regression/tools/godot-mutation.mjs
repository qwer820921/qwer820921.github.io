// Godot 技能（包括閃避、首擊加倍、防禦光環、暈眩、吸血、攻速光環、反擊、堅韌、威壓、連射、連環計、呼風喚雨、戰神、補給、怪力、護衛、守護、奇襲與魅惑，以及受控敵人的目標整合）、敵人受傷與灼燒的入口、飛行敵人、敵人阻路冷卻、關卡沒有波次的拒絕、敵人的攻擊力與免疫減速測試的反向驗證：把 godot/shenmaSanguo 的版本控制檔案（取工作區內容）複製到暫存目錄，
// 對遊戲程式套用一個刻意的錯誤，只跑指定的測試組（SHENMA_TEST_ONLY），確認測試「該失敗時一定失敗」。
// 用法：GODOT=<Godot 4.6.2 console 執行檔> node scripts/shenma-regression/tools/godot-mutation.mjs <變異名稱|none|list>
// - none：不改程式，同一組測試必須全部通過、log 也要通過 check-log.mjs 的檢查（確認基準）
// - 其他名稱：預期的測試項目必須 FAIL，否則結束碼 1（測試抓不到這個錯誤）
// - check：只檢查全部變異定義的原文（見 checkDefinitions），不需要 GODOT；有任何一種失配、缺檔或定義無效時結束碼 1
// - --keep-temp（或 SHENMA_KEEP_TEMP=1）：一律保留暫存目錄
// 不寫入倉庫。暫存目錄（log 在 <暫存>/test.log）在結果符合預期、而且結果與 log 已存到 <EVIDENCE_DIR>/temp-evidence/ 時刪除；
// 沒有符合預期、中斷或沒有 EVIDENCE_DIR 時保留供查看（見 temp-dir.mjs）
import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createTempDir, finishTempDir } from "./temp-dir.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const GAME = join(ROOT, "godot/shenmaSanguo");
const HERO = "entities/hero/Hero.gd";
const TOWER = "entities/tower/Tower.gd";
const ENEMY = "entities/enemy/Enemy.gd";
const WAVE = "systems/WaveManager.gd";
const MAIN = "main/Main.gd";
const BATTLE = "systems/BattleManager.gd";
const SFX = "systems/SFXManager.gd";

// 許褚怪力（Enemy.knockback）從推之前的路線進度檢查到退完的檢查（含中間的倒退迴圈）：「完全不檢查」的變異一次拿掉兩道檢查
const KB_CHECKED = [
  "\tif not _path_progress_valid():\n\t\treturn 0.0\n",
  "\tvar pos: Vector2 = position\n\tvar k: int = _wp_index\n\tvar left: float = distance\n",
  "\t# 每一圈不是退完，就是把 k 減一：最多 n 圈\n\twhile left > 0.0:\n\t\tvar prev: Vector2 = _waypoints[k - 1]\n\t\tvar d: float = pos.distance_to(prev)\n",
  "\t\tif d >= left:\n\t\t\tpos = pos + (prev - pos) / d * left if d > 0.0 else prev\n\t\t\tleft = 0.0\n\t\t\tbreak\n",
  "\t\tpos = prev\n\t\tleft -= d\n\t\tif k - 1 <= 0:\n\t\t\tbreak  # 已經在路線起點\n\t\tk -= 1\n",
  "\tvar moved: float = distance - left\n",
  "\tif not (moved > 0.0 and moved <= distance and _finite_v2(pos) and k >= 1 and k < n and _on_path_segment(pos, k)):\n",
].join("");

// 每個變異：要改的檔案、原文（必須剛好出現一次）、改成的內容、要跑的測試組與預期會 FAIL 的項目（名稱開頭）
const MUTATIONS = {
  "sweep-no-range-check": {
    why: "橫掃不檢查範圍（範圍外的敵人也被打）",
    file: HERO,
    from: "\t\tif d <= radius_px + SWEEP_EDGE_EPS:\n",
    to: "\t\tif true:\n",
    only: "sweep",
    expect: ["橫掃-1 ", "橫掃-4 ", "橫掃-4b "],
  },
  "sweep-double-damage": {
    why: "副目標的傷害重複（每名副目標受兩次傷害）",
    file: HERO,
    from: "\t\t\te.take_damage(sweep_damage)\n",
    to: "\t\t\te.take_damage(sweep_damage)\n\t\t\te.take_damage(sweep_damage)\n",
    only: "sweep",
    expect: ["橫掃-2 ", "橫掃-3 "],
  },
  "sweep-skip-when-primary-dies": {
    why: "主目標被這一擊打倒時不橫掃",
    file: HERO,
    from: "\tif sweep_ratio > 0.0:\n\t\t_sweep(hit_pos, target, damage * sweep_ratio)\n",
    to: "\tif sweep_ratio > 0.0 and not target.is_dead():\n\t\t_sweep(hit_pos, target, damage * sweep_ratio)\n",
    only: "sweep",
    expect: ["橫掃-6 ", "橫掃-8 "],
  },
  "sweep-ties-by-list-order": {
    why: "距離相同時不看生成序號（改成清單順序）",
    file: HERO,
    from: "return a.d < b.d or (a.d == b.d and a.seq < b.seq))",
    to: "return a.d < b.d)",
    only: "sweep",
    expect: ["橫掃-5 "],
  },
  // 飛行敵人與對空（SHENMA_TEST_ONLY=flying）
  "air-filter-hero": {
    why: "武將漏掉對空過濾（每位武將都打得到飛行）",
    file: HERO,
    from: "\treturn can_hit_air or not e.is_flying()\n",
    to: "\treturn true\n",
    only: "flying",
    expect: ["飛行-2a ", "飛行-3 "],
  },
  "air-filter-tower": {
    why: "防禦塔漏掉對空過濾（每座塔都打得到飛行）",
    file: TOWER,
    from: "\treturn can_hit_air or not e.is_flying()\n",
    to: "\treturn true\n",
    only: "flying",
    expect: ["飛行-4 ", "飛行-5a "],
  },
  "aoe-hits-air": {
    why: "砲兵塔的範圍傷害繞過對空過濾（波及旁邊的飛行）",
    file: TOWER,
    from: "\t\tif not is_instance_valid(e) or e.is_dead() or not can_target(e):\n\t\t\tcontinue\n\t\tif primary.global_position",
    to: "\t\tif not is_instance_valid(e) or e.is_dead():\n\t\t\tcontinue\n\t\tif primary.global_position",
    only: "flying",
    expect: ["飛行-5a "],
  },
  "sweep-hits-air": {
    why: "橫掃的副目標繞過對空過濾（步兵武將掃到飛行）",
    file: HERO,
    from: "e.is_queued_for_deletion() or e.is_dead() or not can_target(e):",
    to: "e.is_queued_for_deletion() or e.is_dead():",
    only: "flying",
    expect: ["飛行-5b "],
  },
  "flying-ground-path": {
    why: "飛行敵人仍沿地面的折線路線",
    file: ENEMY,
    from: "\t_waypoints   = [waypoints[0], waypoints[waypoints.size() - 1]] if is_flying() and waypoints.size() >= 2 else waypoints\n",
    to: "\t_waypoints   = waypoints\n",
    only: "flying",
    expect: ["飛行-0 ", "飛行-1 "],
  },
  "flying-blocked": {
    why: "飛行敵人仍被武將擋住（停下攻擊武將）",
    file: ENEMY,
    from: "\tif _game_map != null and not is_flying():\n",
    to: "\tif _game_map != null:\n",
    only: "flying",
    expect: ["飛行-2a "],
  },
  "first-by-ratio": {
    why: "防禦塔「優先前方」仍比路點比例（不是剩餘路程）",
    file: TOWER,
    from: "\treturn a.get_remaining_distance() < b.get_remaining_distance() - REMAINING_EPS\n",
    to: "\treturn a.get_progress_ratio() > b.get_progress_ratio()\n",
    only: "flying",
    expect: ["飛行-7a ", "飛行-7c "],
  },
  // 飛行路線無效與防禦塔「優先飛行」（SHENMA_TEST_ONLY=airfirst）
  "flight-route-unchecked": {
    why: "出兵前不檢查飛行路線（起終點相同、只有一個路點的飛行組照常出兵，一出現就扣城血）",
    file: WAVE,
    from: '\t\tif flight_problem != "":\n',
    to: "\t\tif false:\n",
    only: "airfirst",
    expect: ["路線-1 ", "路線-2 ", "路線-4 "],
  },
  "air-first-out-of-range": {
    why: "優先飛行漏掉射程過濾（射程外的飛行也被選為目標）",
    file: TOWER,
    from: "\t\tif global_position.distance_to(e.global_position) > range_px:\n\t\t\tcontinue\n",
    to: '\t\tif global_position.distance_to(e.global_position) > range_px and not (target_mode == "air_first" and e.is_flying()):\n\t\t\tcontinue\n',
    only: "airfirst",
    expect: ["優先飛行-2 ", "優先飛行-4 "],
  },
  "air-first-resets-cooldown": {
    why: "切換目標優先時重置攻擊冷卻（切換後立刻多打一擊）",
    file: TOWER,
    from: "\ttarget_mode = mode\n\tqueue_redraw()\n\treturn true\n",
    to: "\ttarget_mode = mode\n\t_atk_timer = 0.0\n\tqueue_redraw()\n\treturn true\n",
    only: "airfirst",
    expect: ["優先飛行-5 ", "優先飛行-6 "],
  },
  "air-first-ground-tower": {
    why: "只打地面的塔也能選優先飛行（只靠前端隱藏）",
    file: TOWER,
    from: "\t\tif can_hit_air or not AIR_TARGET_MODES.has(m):\n",
    to: "\t\tif true:\n",
    only: "airfirst",
    expect: ["優先飛行-0 "],
  },
  "air-first-ignored": {
    why: "優先飛行沒有先選飛行（和優先前方相同）",
    file: TOWER,
    from: '\t\t"air_first":\n\t\t\tif a.is_flying() != b.is_flying():\n\t\t\t\treturn a.is_flying()\n',
    to: "",
    only: "airfirst",
    expect: ["優先飛行-1 ", "優先飛行-4 "],
  },
  // 地面路線沒有路程（SHENMA_TEST_ONLY=route）
  "ground-route-unchecked": {
    why: "出兵前不檢查地面路線（只有一個路點、所有路點同格的地面組照常出兵，一出現就扣城血）",
    file: WAVE,
    from: '\t\tif ground_problem != "":\n',
    to: "\t\tif false:\n",
    only: "route",
    expect: ["地面路線-1 ", "地面路線-2 ", "地面路線-3 ", "地面路線-4 "],
  },
  "ground-route-endpoints": {
    why: "地面改用起點和終點判斷（起終點同格的環狀路線被誤擋）",
    file: WAVE,
    from: "\tif total <= FLIGHT_MIN_LEN:\n",
    to: "\tif (waypoints[0] as Vector2).distance_to(waypoints[waypoints.size() - 1]) <= FLIGHT_MIN_LEN:\n",
    only: "route",
    expect: ["路線-5 ", "地面路線-6 "],
  },
  // 敵人攻擊阻路武將的冷卻（SHENMA_TEST_ONLY=blocker）
  "blocker-drops-remainder": {
    why: "敵人攻擊阻路武將後設回完整間隔（丟掉越過零點的零頭，舊寫法）",
    file: ENEMY,
    from: "\t\t\t_blocker_atk_timer = BLOCKER_ATK_SPD - (late if late < BLOCKER_ATK_SPD else 0.0)\n",
    to: "\t\t\t_blocker_atk_timer = BLOCKER_ATK_SPD\n",
    only: "blocker",
    expect: ["阻路-1 ", "阻路-6 "],
  },
  "blocker-reset-on-retarget": {
    why: "偵測到新的阻擋對象就把冷卻歸零（換目標、重新接觸立即打，舊寫法）",
    file: ENEMY,
    from: "\t\t\t\t_blocker = occ\n\t\t\t\t_blocked_cell = check_cell\n",
    to: "\t\t\t\t_blocker = occ\n\t\t\t\t_blocked_cell = check_cell\n\t\t\t\t_blocker_atk_timer = 0.0\n",
    only: "blocker",
    expect: [
      "阻路-2a ",
      "阻路-2b ",
      "阻路-2c ",
      "阻路-4 ",
      "阻路-8 ",
      "阻路-9 ",
      "阻路-14a ",
      "阻路-14b ",
    ],
  },
  "blocker-hits-removed-hero": {
    why: "阻擋的武將被移除（排入刪除）後，同一幀之內仍繼續打它",
    file: ENEMY,
    from: "_blocker.is_queued_for_deletion() or ",
    to: "",
    only: "blocker",
    expect: ["阻路-2c ", "阻路-14a "],
  },
  // 被閃避的攻擊照樣用掉冷卻（SHENMA_TEST_ONLY=blocker）
  "dodge-refunds-enemy-cooldown": {
    why: "攻擊被閃避（沒有扣血）時退還敵人的冷卻，下一步立刻再打",
    file: ENEMY,
    from: "\t\t\t_blocker.take_damage(hit_atk, self)\n",
    to: "\t\t\tvar hp_before: float = _blocker.current_hp\n\t\t\t_blocker.take_damage(hit_atk, self)\n\t\t\tif is_instance_valid(_blocker) and _blocker.current_hp == hp_before:\n\t\t\t\t_blocker_atk_timer = 0.0\n\t\t\t\tqueue_redraw()\n\t\t\t\treturn\n",
    only: "blocker",
    expect: ["阻路-13 ", "阻路-14a ", "阻路-14b "],
  },
  // 關卡資料未完成（SHENMA_TEST_ONLY=stagedata）
  "no-waves-builtin-fallback": {
    why: "關卡沒有波次時改用內建的測試波次（舊寫法：一波 soldier）",
    file: MAIN,
    from: "\t_waves = raw_waves if raw_waves is Array else []\n",
    to: '\t_waves = raw_waves if raw_waves is Array else []\n\tif _waves.is_empty():\n\t\t_waves = [{"wave": 1, "enemies": [{"enemy_id": "soldier", "count": 3, "interval": 1.2, "path": "path_a"}]}]\n',
    only: "stagedata",
    expect: ["資料-1 ", "資料-2 ", "資料-3 ", "資料-4 "],
  },
  "no-waves-silent": {
    why: "關卡沒有波次時按迎戰直接返回（沒有拒絕、一直停在備戰，舊寫法）",
    file: BATTLE,
    from: "\tif next_wave > total_waves and total_waves > 0:\n",
    to: "\tif next_wave > total_waves:\n",
    only: "stagedata",
    expect: ["資料-1 ", "資料-2 ", "資料-3 ", "資料-4 ", "資料-5 "],
  },
  "no-waves-auto-win": {
    why: "關卡沒有波次時直接當成打完（勝利結算）",
    file: BATTLE,
    from: "\tif next_wave > total_waves and total_waves > 0:\n\t\treturn\n",
    to: "\tif next_wave > total_waves:\n\t\tif total_waves <= 0:\n\t\t\t_end_battle(true)\n\t\treturn\n",
    only: "stagedata",
    expect: ["資料-1 ", "資料-2 ", "資料-3 ", "資料-4 ", "資料-5 "],
  },
  // 敵人設定的對武將攻擊力（SHENMA_TEST_ONLY=enemyatk）
  "atk-fixed-20": {
    why: "敵人攻擊阻路武將固定 20（沒有讀設定的 atk，舊寫法）",
    file: ENEMY,
    from: "\tblocker_atk  = blocker_atk_of(cfg)\n",
    to: "\tblocker_atk  = BLOCKER_ATK_DEFAULT\n",
    only: "enemyatk",
    expect: [
      "攻擊-1 ",
      "攻擊-3 ",
      "攻擊-4 ",
      "攻擊-5 ",
      "攻擊-6 ",
      "攻擊-7 ",
      "攻擊-8 ",
    ],
  },
  "atk-zero-fallback": {
    why: "atk 是 0 時回退成 20（只接受正數）",
    file: ENEMY,
    from: "and float(raw) >= 0.0:\n",
    to: "and float(raw) > 0.0:\n",
    only: "enemyatk",
    expect: ["攻擊-0 ", "攻擊-1 ", "攻擊-3 ", "攻擊-6 "],
  },
  // 敵人設定的免疫減速（SHENMA_TEST_ONLY=immune）
  "immune-missing-slow": {
    why: "免疫減速漏掉倍率減速（阻擋減速、緩速光環：apply_slow_from／apply_slow 照樣套用）",
    file: ENEMY,
    from: '\tif immune_slow or _is_dead or source == "":\n',
    to: '\tif _is_dead or source == "":\n',
    only: "immune",
    expect: ["免疫-1 ", "免疫-2 ", "免疫-3 ", "免疫-4 ", "免疫-5 "],
  },
  "immune-missing-stack": {
    why: "免疫減速漏掉文士塔的疊加減速（apply_stackable_slow 照樣套用、顯示「緩」）",
    file: ENEMY,
    from: "func apply_stackable_slow(amount: float, duration: float) -> void:\n\tif immune_slow:\n\t\treturn\n",
    to: "func apply_stackable_slow(amount: float, duration: float) -> void:\n",
    only: "immune",
    expect: ["免疫-1 ", "免疫-2 ", "免疫-3 ", "免疫-5 "],
  },
  "immune-as-flying": {
    why: "把免疫減速當成飛行（不被武將擋住、不攻擊武將）",
    file: ENEMY,
    from: "\treturn movement_type == MOVE_FLYING\n",
    to: "\treturn movement_type == MOVE_FLYING or immune_slow\n",
    only: "immune",
    expect: ["免疫-4 "],
  },
  "immune-by-id": {
    why: "用敵人的 id 判斷免疫（id 有 cavalry 就免疫，不看 trait）",
    file: ENEMY,
    from: "\timmune_slow  = is_immune_slow_cfg(cfg)\n",
    to: '\timmune_slow  = str(cfg.get("enemy_id", "")).contains("cavalry")\n',
    only: "immune",
    expect: ["免疫-1 ", "免疫-2 ", "免疫-3 ", "免疫-4 ", "免疫-5 "],
  },
  "immune-shared": {
    why: "免疫是所有敵人共用的一份（最後生成的敵人決定大家都免疫或都不免疫）",
    file: ENEMY,
    from: "var immune_slow: bool = false\n",
    to: "static var immune_slow: bool = false\n",
    only: "immune",
    expect: ["免疫-1 ", "免疫-5 "],
  },
  // 趙雲「閃避」（SHENMA_TEST_ONLY=dodge）
  "dodge-boundary-inclusive": {
    why: "機率邊界錯誤：抽樣值剛好等於機率（0.15）也算閃避",
    file: HERO,
    from: "\t\tvar dodged: bool = u < dodge_chance\n",
    to: "\t\tvar dodged: bool = u <= dodge_chance\n",
    only: "dodge",
    expect: ["閃避-1 "],
  },
  "dodge-still-damages": {
    why: "閃避之後仍照防禦公式扣血",
    file: HERO,
    from: "\t\t\t_show_dodge()\n\t\t\treturn\n",
    to: "\t\t\t_show_dodge()\n",
    only: "dodge",
    expect: ["閃避-1 ", "閃避-6 "],
  },
  "dodge-rolls-invalid-damage": {
    why: "無效的傷害（0、負數、NaN、無限大）也判定閃避、照公式扣血",
    file: HERO,
    from: "\tif not (amount > 0.0 and is_finite(amount)):\n\t\treturn\n",
    to: "",
    only: "dodge",
    expect: ["閃避-2 "],
  },
  "dodge-rolls-when-removed": {
    why: "已被移除（排入刪除）的武將仍判定閃避",
    file: HERO,
    from: "\tif dodge_chance > 0.0 and not is_queued_for_deletion():\n",
    to: "\tif dodge_chance > 0.0:\n",
    only: "dodge",
    expect: ["閃避-3 "],
  },
  "dodge-accepts-out-of-range": {
    why: "閃避機率不檢查範圍（超過 1 的機率讓武將每擊都閃避）",
    file: HERO,
    from: " and float(c) > 0.0 and float(c) <= 1.0:\n",
    to: ":\n",
    only: "dodge",
    expect: ["閃避-0 ", "閃避-4 "],
  },
  "dodge-fixed-seed": {
    why: "閃避的亂數用固定種子（每位武將的抽樣序列都一樣）",
    file: HERO,
    from: "\t_dodge_rng.randomize()\n",
    to: "\t_dodge_rng.seed = 12345\n",
    only: "dodge",
    expect: ["閃避-5 "],
  },
  // 首擊加倍，馬超「衝鋒」（SHENMA_TEST_ONLY=firststrike）
  "first-strike-per-node": {
    why: "首擊加倍記在武將節點上（同一場移除後重新放置又能再觸發）",
    file: HERO,
    from: "_battle_mgr.consume_first_strike(hero_id, boosted)",
    to: "_battle_mgr.consume_first_strike(hero_id + str(get_instance_id()), boosted)",
    only: "firststrike",
    expect: ["R12-1 ", "R12-6 "],
  },
  "dodge-keeps-first-strike": {
    why: "帶閃避技能的武將（趙雲）仍有首擊加倍",
    file: HERO,
    from: "\t\t\t\tdodge_chance = float(c)\n",
    to: "\t\t\t\tdodge_chance = float(c)\n\t\t\t\tfirst_strike_multiplier = 2.0\n",
    only: "firststrike",
    expect: ["首擊加倍-1 "],
  },
  // 倍率減速的來源與有效期、關羽的減速光環（SHENMA_TEST_ONLY=slow）
  "slow-ignores-duration": {
    why: "倍率減速忽略有效期（永遠不到期）",
    file: ENEMY,
    from: "\t\tvar e: Dictionary = _slow_sources[s]\n\t\te.left = float(e.left) - delta\n",
    to: "\t\tvar e: Dictionary = _slow_sources[s]\n\t\te.left = float(e.left)\n",
    only: "slow",
    expect: ["減速-2 ", "減速-3 ", "減速-10 "],
  },
  "slow-last-writer": {
    why: "倍率減速由最後套用的來源覆蓋（不是取最強）",
    file: ENEMY,
    from: '\t_slow_sources[source] = {"mult": mult, "left": duration}\n\t_refresh_speed_mult()\n',
    to: '\t_slow_sources[source] = {"mult": mult, "left": duration}\n\tspeed_mult = mult\n',
    only: "slow",
    expect: ["減速-1 "],
  },
  "slow-remove-clears-all": {
    why: "撤除一個來源時清掉所有來源",
    file: ENEMY,
    from: "\tif _slow_sources.erase(source):\n\t\t_refresh_speed_mult()\n",
    to: "\tif _slow_sources.has(source):\n\t\t_slow_sources.clear()\n\t\t_refresh_speed_mult()\n",
    only: "slow",
    expect: ["減速-4 "],
  },
  "slow-sources-multiply": {
    why: "多個來源相乘（兩個 0.9 變成 0.81）",
    file: ENEMY,
    from: "\t\tm = minf(m, float(_slow_sources[s].mult))\n",
    to: "\t\tm = m * float(_slow_sources[s].mult)\n",
    only: "slow",
    expect: ["減速-1 ", "減速-4 ", "光環-4 ", "光環-5 "],
  },
  "slow-immune-new-api": {
    why: "免疫減速漏掉依來源的減速（apply_slow_from）",
    file: ENEMY,
    from: '\tif immune_slow or _is_dead or source == "":\n',
    to: '\tif _is_dead or source == "":\n',
    only: "slow",
    expect: ["減速-5 ", "減速-9 ", "光環-1 ", "光環-2 "],
  },
  "hero-no-target-clears-all": {
    why: "沒有目標的武將清掉所有敵人的所有減速（包括防禦塔的）",
    file: HERO,
    from: "\t\t# 待命停在 0，不囤積攻擊（射程內沒有目標時，道路阻擋的減速已由 _update_slows 撤除；其他來源的減速不受影響）\n\t\t_atk_timer = 0.0\n",
    to: "\t\tfor e in enemies:\n\t\t\tif is_instance_valid(e):\n\t\t\t\te._slow_sources.clear()\n\t\t\t\te._refresh_speed_mult()\n\t\t_atk_timer = 0.0\n",
    only: "slow",
    expect: ["減速-7 "],
  },
  "tower-shared-source": {
    why: "每座步兵塔用同一個來源（依塔的種類）",
    file: TOWER,
    from: '\tslow_source = "tower_aura#%d" % get_instance_id()\n',
    to: '\tslow_source = "tower_aura"\n',
    only: "slow",
    expect: ["減速-7 "],
  },
  "hero-road-not-released": {
    why: "道路阻擋的減速在武將離開道路或敵人離開射程後仍保留",
    file: HERO,
    from: "\t\tif leaving or not is_on_road or not _enemy_alive(e) or global_position.distance_to(e.global_position) > range_px:\n",
    to: "\t\tif not _enemy_alive(e):\n",
    only: "slow",
    expect: ["減速-8 "],
  },
  "fighting-by-speed": {
    why: "攻擊圖片仍看減速倍率（倍率 ≤ 0.5 就當成交戰）",
    file: ENEMY,
    from: "\treturn _blocker != null and not is_stunned()\n",
    to: "\treturn speed_mult <= 0.5\n",
    only: "slow",
    expect: ["減速-8 ", "減速-9 "],
  },
  "aura-mult-inverted": {
    why: "光環把 0.9 當成減少的比例（移速變成 10%）",
    file: HERO,
    from: "\t\t\t\te.apply_slow_from(aura_source, slow_aura_mult, Enemy.SLOW_REFRESH_TTL)\n",
    to: "\t\t\t\te.apply_slow_from(aura_source, 1.0 - slow_aura_mult, Enemy.SLOW_REFRESH_TTL)\n",
    only: "slow",
    expect: ["光環-1 ", "光環-3 ", "光環-4 "],
  },
  "aura-keeps-sweep": {
    why: "關羽的光環仍帶橫掃（普通攻擊附帶範圍傷害）",
    file: HERO,
    from: "\t\t\t\tslow_aura_mult = float(m)\n",
    to: "\t\t\t\tslow_aura_mult = float(m)\n\t\t\t\tsweep_radius = 1.0\n\t\t\t\tsweep_max_targets = 2\n\t\t\t\tsweep_ratio = 0.5\n",
    only: "slow",
    expect: ["光環-0 ", "光環-2 "],
  },
  "aura-no-range-check": {
    why: "光環不檢查範圍（全場地面敵人都減速）",
    file: HERO,
    from: "\t\t\tif _enemy_alive(e) and not e.is_flying() and global_position.distance_to(e.global_position) <= radius_px:\n",
    to: "\t\t\tif _enemy_alive(e) and not e.is_flying():\n",
    only: "slow",
    expect: ["光環-1 ", "光環-3 ", "光環-6 "],
  },
  "aura-hits-flying": {
    why: "光環也減速飛行敵人",
    file: HERO,
    from: "\t\t\tif _enemy_alive(e) and not e.is_flying() and global_position.distance_to(e.global_position) <= radius_px:\n",
    to: "\t\t\tif _enemy_alive(e) and global_position.distance_to(e.global_position) <= radius_px:\n",
    only: "slow",
    expect: ["光環-1 "],
  },
  "aura-waits-cooldown": {
    why: "光環要等攻擊冷卻（綁在普通攻擊上）",
    file: HERO,
    from: "\tvar active: bool = slow_aura_mult < 1.0 and not leaving and _wave_mgr != null and _in_battle()\n",
    to: "\tvar active: bool = slow_aura_mult < 1.0 and not leaving and _wave_mgr != null and _in_battle() and _atk_timer <= 0.0\n",
    only: "slow",
    expect: ["光環-1 "],
  },
  "aura-not-released-on-exit": {
    why: "武將被移除或倒下時不撤除自己的減速（等有效期到期）",
    file: HERO,
    from: "func _exit_tree() -> void:\n\t_release_slows()\n",
    to: "func _exit_tree() -> void:\n\tpass\n",
    only: "slow",
    expect: ["光環-6 "],
  },
  "aura-in-prep": {
    why: "備戰時光環也作用（不看戰鬥狀態）",
    file: HERO,
    from: "\treturn _battle_mgr == null or _battle_mgr.game_state == BattleManager.GameState.BATTLE\n",
    to: "\treturn true\n",
    only: "slow",
    expect: ["光環-1 "],
  },
  // 劉備的防禦光環（SHENMA_TEST_ONLY=defaura）
  "def-aura-flat-cut": {
    why: "防禦光環直接少扣 20% 的傷害（不是提高防禦後照防禦公式計算）",
    file: HERO,
    from: "\tvar raw_dmg: float = amount * (1.0 - d / (d + 100.0))\n",
    to: "\tvar raw_dmg: float = amount * (1.0 - def_stat / (def_stat + 100.0)) * (2.0 - def_bonus_mult)\n",
    only: "defaura",
    expect: ["防禦-1 ", "防禦-2 ", "防禦-4 ", "防禦-5 "],
  },
  "def-aura-multiply-sources": {
    why: "多個防禦光環相乘（1.2 × 1.1）而不是取最強",
    file: HERO,
    from: "\t\tm = maxf(m, float(_def_sources[s].mult))\n",
    to: "\t\tm *= float(_def_sources[s].mult)\n",
    only: "defaura",
    expect: ["防禦-2 ", "防禦-5 "],
  },
  "def-aura-writes-back": {
    why: "防禦光環把加成寫回 def_stat（每一幀重複疊乘）",
    file: HERO,
    from: '\t_def_sources[source] = {"mult": mult, "left": duration}\n',
    to: '\t_def_sources[source] = {"mult": mult, "left": duration}\n\tdef_stat *= mult\n',
    only: "defaura",
    expect: ["防禦-1 ", "防禦-3 ", "防禦-4 ", "防禦-6 "],
  },
  "def-aura-not-removed": {
    why: "來源離開（移位、移除、戰鬥結束）時不撤除防禦加成（等有效期到期）",
    file: HERO,
    from: "\tif _def_sources.erase(source):\n\t\t_refresh_def_bonus()\n",
    to: "\tif false:\n\t\t_refresh_def_bonus()\n",
    only: "defaura",
    expect: ["防禦-2 ", "防禦-5 ", "防禦-6 "],
  },
  "def-aura-remove-clears-all": {
    why: "撤除一個來源時清掉所有防禦加成（強的離開後弱的也沒了）",
    file: HERO,
    from: "\tif _def_sources.erase(source):\n\t\t_refresh_def_bonus()\n",
    to: "\t_def_sources.clear()\n\tif true:\n\t\t_refresh_def_bonus()\n",
    only: "defaura",
    expect: ["防禦-2 "],
  },
  "def-aura-includes-self": {
    why: "防禦光環也加成劉備自己",
    file: HERO,
    from: "\t\t\tif h == self or not (h is Hero) or not _hero_alive(h):\n\t\t\t\tcontinue\n\t\t\tif global_position.distance_to(h.global_position) <= radius_px:\n\t\t\t\th.apply_def_from(",
    to: "\t\t\tif not (h is Hero) or not _hero_alive(h):\n\t\t\t\tcontinue\n\t\t\tif global_position.distance_to(h.global_position) <= radius_px:\n\t\t\t\th.apply_def_from(",
    only: "defaura",
    expect: ["防禦-1 ", "防禦-3 ", "防禦-5 "],
  },
  "def-aura-no-range-check": {
    why: "防禦光環不檢查範圍（全場武將都加成）",
    file: HERO,
    from: "\t\t\tif global_position.distance_to(h.global_position) <= radius_px:\n\t\t\t\th.apply_def_from(",
    to: "\t\t\tif true:\n\t\t\t\th.apply_def_from(",
    only: "defaura",
    expect: ["防禦-3 ", "防禦-6 "],
  },
  "def-aura-in-prep": {
    why: "備戰時防禦光環也作用（不看戰鬥狀態）",
    file: HERO,
    from: "\tvar active: bool = def_aura_mult > 1.0 and not leaving and _in_battle() and get_parent() != null\n",
    to: "\tvar active: bool = def_aura_mult > 1.0 and not leaving and get_parent() != null\n",
    only: "defaura",
    expect: ["防禦-3 ", "防禦-6 "],
  },
  // 張飛的暈眩（SHENMA_TEST_ONLY=stun）
  "stun-still-attacks": {
    why: "暈眩只停止移動，被擋住時仍攻擊武將（暈眩的判斷排在攻擊之後）",
    file: ENEMY,
    from: "\tif _stun_left > 0.0:\n\t\t_stun_left -= delta\n",
    to: "\tif _stun_left > 0.0 and _blocker == null:\n\t\t_stun_left -= delta\n",
    only: "stun",
    expect: ["暈眩-2 ", "暈眩-7 "],
  },
  "stun-immune-slow": {
    why: "把免疫減速當成免疫暈眩",
    file: ENEMY,
    from: "\tif _is_dead or not (is_finite(duration) and duration > 0.0):\n\t\treturn false\n",
    to: "\tif immune_slow or _is_dead or not (is_finite(duration) and duration > 0.0):\n\t\treturn false\n",
    only: "stun",
    expect: ["暈眩-5 ", "暈眩-8 "],
  },
  "stun-adds-up": {
    why: "再次命中時暈眩時間相加（不是取較長的）",
    file: ENEMY,
    from: "\t_stun_left = maxf(_stun_left, duration)\n",
    to: "\t_stun_left += duration\n",
    only: "stun",
    expect: ["暈眩-3 "],
  },
  "stun-overwrites": {
    why: "再次命中時直接改成這次的時間（較短的效果縮短了剩餘時間）",
    file: ENEMY,
    from: "\t_stun_left = maxf(_stun_left, duration)\n",
    to: "\t_stun_left = duration\n",
    only: "stun",
    expect: ["暈眩-3 "],
  },
  "stun-freezes-timers": {
    why: "暈眩在最前面就提早結束這一步，減速、灼燒的計時跟著停住",
    file: ENEMY,
    from: "\t_age += delta\n",
    to: "\t_age += delta\n\tif _stun_left > 0.0:\n\t\t_stun_left = maxf(0.0, _stun_left - delta)\n\t\t_blocker_atk_timer = maxf(0.0, _blocker_atk_timer - delta)\n\t\treturn\n",
    only: "stun",
    expect: ["暈眩-4 "],
  },
  "stun-freezes-cooldown": {
    why: "暈眩中攻擊冷卻不倒數（恢復後延後攻擊）",
    file: ENEMY,
    from: "\t\t_stun_left -= delta\n\t\t_blocker_atk_timer = maxf(0.0, _blocker_atk_timer - delta)\n",
    to: "\t\t_stun_left -= delta\n",
    only: "stun",
    expect: ["暈眩-2 "],
  },
  "stun-shows-attack-anim": {
    why: "暈眩中仍顯示攻擊阻路武將的圖片",
    file: ENEMY,
    from: "\treturn _blocker != null and not is_stunned()\n",
    to: "\treturn _blocker != null\n",
    only: "stun",
    expect: ["暈眩-2 ", "暈眩-7 "],
  },
  "stun-reads-invalid": {
    why: "暈眩時間不檢查（字串、布林、0、負數也啟用）",
    file: HERO,
    from: "\t\t\tif (s is float or s is int) and is_finite(float(s)) and float(s) > 0.0:\n",
    to: "\t\t\tif s != null:\n",
    only: "stun",
    expect: ["暈眩-0 "],
  },
  // 魏延的吸血（SHENMA_TEST_ONLY=lifesteal）
  "lifesteal-nominal-damage": {
    why: "用這一擊的名義傷害計算（溢出的傷害也算）",
    file: HERO,
    from: "\tvar dealt: Variant = target.take_damage(damage)\n",
    to: "\ttarget.take_damage(damage)\n\tvar dealt: Variant = damage\n",
    only: "lifesteal",
    expect: ["吸血-1 ", "吸血-3 "],
  },
  "lifesteal-no-cap": {
    why: "恢復不檢查最大生命（可以超過最大生命）",
    file: HERO,
    from: "\tvar gain: float = minf(dealt * lifesteal_ratio, max_hp - current_hp)\n",
    to: "\tvar gain: float = dealt * lifesteal_ratio\n",
    only: "lifesteal",
    expect: ["吸血-1 "],
  },
  "lifesteal-skips-kill": {
    why: "打倒敵人的那一擊不恢復",
    file: HERO,
    from: "\tif lifesteal_ratio > 0.0:\n\t\t_lifesteal(float(dealt)",
    to: "\tif lifesteal_ratio > 0.0 and _enemy_alive(target):\n\t\t_lifesteal(float(dealt)",
    only: "lifesteal",
    expect: ["吸血-1 ", "吸血-3 "],
  },
  "lifesteal-reads-invalid": {
    why: "吸血比例只檢查是不是數字（NaN、無限大、0、負數、超過 1 也啟用）",
    file: HERO,
    from: "\t\t\tif (r is float or r is int) and is_finite(float(r)) and float(r) > 0.0 and float(r) <= 1.0:\n",
    to: "\t\t\tif r is float or r is int:\n",
    only: "lifesteal",
    expect: ["吸血-0 "],
  },
  "lifesteal-revives": {
    why: "已經倒下或正要被移除的武將也恢復生命",
    file: HERO,
    from: "\tif not (dealt > 0.0 and is_finite(dealt)) or not _hero_alive(self):\n",
    to: "\tif not (dealt > 0.0 and is_finite(dealt)):\n",
    only: "lifesteal",
    expect: ["吸血-1b "],
  },
  "lifesteal-counts-sweep": {
    why: "橫掃副目標的傷害也恢復生命",
    file: HERO,
    from: "\t\t\te.take_damage(sweep_damage)\n\t\t\tsweep_hits += 1\n",
    to: "\t\t\tvar sd: float = e.take_damage(sweep_damage)\n\t\t\tif lifesteal_ratio > 0.0:\n\t\t\t\t_lifesteal(sd)\n\t\t\tsweep_hits += 1\n",
    only: "lifesteal",
    expect: ["吸血-1c "],
  },
  // 曹操的攻速光環（SHENMA_TEST_ONLY=atkspeed）
  "atk-speed-multiplies": {
    why: "多個攻速光環的倍率相乘（不是取最強）",
    file: HERO,
    from: "\t\tm = maxf(m, float(_atk_speed_sources[s].mult))\n",
    to: "\t\tm *= float(_atk_speed_sources[s].mult)\n",
    only: "atkspeed",
    expect: ["指揮-3 "],
  },
  "atk-speed-interval-085": {
    why: "攻擊間隔直接減少 15%（× 0.85），不是除以 1.15",
    file: HERO,
    from: "\treturn attack_speed / atk_speed_bonus_mult\n",
    to: "\treturn attack_speed * (2.0 - atk_speed_bonus_mult)\n",
    only: "atkspeed",
    expect: ["指揮-1 ", "指揮-5 "],
  },
  "atk-speed-zero-cooldown": {
    why: "加成改變時把正在倒數的冷卻歸零（立刻補打）",
    file: HERO,
    from: "\tif m != atk_speed_bonus_mult:\n\t\tatk_speed_bonus_mult = m\n",
    to: "\tif m != atk_speed_bonus_mult:\n\t\tatk_speed_bonus_mult = m\n\t\t_atk_timer = 0.0\n",
    only: "atkspeed",
    expect: ["指揮-2 "],
  },
  "atk-speed-rescale-cooldown": {
    why: "加成改變時照新的倍率重新計算正在倒數的冷卻",
    file: HERO,
    from: "\tif m != atk_speed_bonus_mult:\n\t\tatk_speed_bonus_mult = m\n",
    to: "\tif m != atk_speed_bonus_mult:\n\t\t_atk_timer = _atk_timer * atk_speed_bonus_mult / m\n\t\tatk_speed_bonus_mult = m\n",
    only: "atkspeed",
    expect: ["指揮-2 "],
  },
  "atk-speed-buffs-self": {
    why: "攻速光環也加成曹操自己",
    file: HERO,
    from: "\t\tfor h in get_parent().get_children():\n\t\t\tif h == self or not (h is Hero) or not _hero_alive(h):\n\t\t\t\tcontinue\n\t\t\tif global_position.distance_to(h.global_position) <= radius_px:\n\t\t\t\th.apply_atk_speed_from(",
    to: "\t\tfor h in get_parent().get_children():\n\t\t\tif not (h is Hero) or not _hero_alive(h):\n\t\t\t\tcontinue\n\t\t\tif global_position.distance_to(h.global_position) <= radius_px:\n\t\t\t\th.apply_atk_speed_from(",
    only: "atkspeed",
    expect: ["指揮-1 ", "指揮-3 "],
  },
  "atk-speed-reads-invalid": {
    why: "攻速倍率只檢查是不是數字（NaN、無限大、1 以下也啟用）",
    file: HERO,
    from: "\t\t\tif (a is float or a is int) and is_finite(float(a)) and float(a) > 1.0:\n",
    to: "\t\t\tif a is float or a is int:\n",
    only: "atkspeed",
    expect: ["指揮-0 "],
  },
  "atk-speed-outside-battle": {
    why: "攻速光環在備戰與結算後也作用",
    file: HERO,
    from: "\tvar active: bool = atk_speed_aura_mult > 1.0 and not leaving and _in_battle() and get_parent() != null\n",
    to: "\tvar active: bool = atk_speed_aura_mult > 1.0 and not leaving and get_parent() != null\n",
    only: "atkspeed",
    expect: ["指揮-5 "],
  },
  // 敵人受傷的入口（SHENMA_TEST_ONLY=damage）
  "damage-accepts-invalid": {
    why: "無效的傷害（0、負數、NaN、無限大）只把回傳值當 0，仍然扣血、顯示數字、播放音效與觸發死亡",
    file: ENEMY,
    from: "\tif _is_dead or is_queued_for_deletion() or not (amount > 0.0 and is_finite(amount)):\n\t\treturn 0.0\n\tvar dealt: float = minf(amount, maxf(current_hp, 0.0))\n",
    to: "\tif _is_dead:\n\t\treturn 0.0\n\tvar dealt: float = minf(amount, maxf(current_hp, 0.0)) if amount > 0.0 and is_finite(amount) else 0.0\n",
    only: "damage",
    expect: ["受傷-1 ", "受傷-2 "],
  },
  "damage-hits-queued": {
    why: "正要被移除（還沒倒下）的敵人仍然受傷、可以被打倒",
    file: ENEMY,
    from: "\tif _is_dead or is_queued_for_deletion() or not (amount > 0.0 and is_finite(amount)):\n",
    to: "\tif _is_dead or not (amount > 0.0 and is_finite(amount)):\n",
    only: "damage",
    expect: ["受傷-1 "],
  },
  "damage-nominal-return": {
    why: "回傳這一擊的名義傷害（致死時溢出的部分也算）",
    file: ENEMY,
    from: "\treturn dealt\n",
    to: "\treturn amount\n",
    only: "damage",
    expect: ["受傷-1 ", "受傷-2 "],
  },
  // 灼燒的入口（SHENMA_TEST_ONLY=burninput）
  "burn-apply-nonfinite": {
    why: "灼燒只擋 0 以下的每跳傷害與間隔（NaN、無限大照樣套用）",
    file: ENEMY,
    from: "\tif not (damage > 0.0 and is_finite(damage) and interval > 0.0 and is_finite(interval)):\n\t\treturn\n",
    to: "\tif damage <= 0.0 or interval <= 0.0:\n\t\treturn\n",
    only: "burninput",
    expect: ["灼燒入口-1 ", "灼燒入口-2 "],
  },
  "burn-reject-clears": {
    why: "拒絕無效的參數時清掉已有的灼燒",
    file: ENEMY,
    from: "\tif not (damage > 0.0 and is_finite(damage) and interval > 0.0 and is_finite(interval)):\n\t\treturn\n",
    to: "\tif not (damage > 0.0 and is_finite(damage) and interval > 0.0 and is_finite(interval)):\n\t\t_burn_ticks_left = 0\n\t\treturn\n",
    only: "burninput",
    expect: ["灼燒入口-2 "],
  },
  "burn-apply-queued": {
    why: "正要被移除（還沒倒下）的敵人仍然開始或刷新灼燒",
    file: ENEMY,
    from: "\tif _is_dead or is_queued_for_deletion() or ticks <= 0:\n",
    to: "\tif _is_dead or ticks <= 0:\n",
    only: "burninput",
    expect: ["灼燒入口-3 "],
  },
  "burn-read-loose": {
    why: "火攻參數只檢查是不是正的數字（無限大的間隔、小數的跳數也啟用）",
    file: HERO,
    from: "\t\t\tif _positive_finite(br) and _positive_finite(bi) and _positive_whole(bt):\n",
    to: "\t\t\tif (br is float or br is int) and (bi is float or bi is int) and (bt is float or bt is int) and float(br) > 0.0 and float(bi) > 0.0 and int(bt) > 0:\n",
    only: "burninput",
    expect: ["灼燒入口-0 ", "灼燒入口-5 "],
  },
  "burn-read-default-interval": {
    why: "沒有間隔時自動當作 1 秒（舊寫法）",
    file: HERO,
    from: '\t\t\tvar bi: Variant = skill.get("burn_interval")\n',
    to: '\t\t\tvar bi: Variant = skill.get("burn_interval", 1.0)\n',
    only: "burninput",
    expect: ["灼燒入口-0 ", "灼燒入口-5 ", "灼燒入口-6 "],
  },
  "burn-read-fraction": {
    why: "小數的跳數也啟用（截成整數）",
    file: HERO,
    from: "\treturn _positive_finite(v) and float(v) == floorf(float(v)) and float(v) <= 9007199254740991.0\n",
    to: "\treturn _positive_finite(v) and float(v) >= 1.0\n",
    only: "burninput",
    expect: ["灼燒入口-0 ", "灼燒入口-5 ", "灼燒入口-6 "],
  },
  // 夏侯惇的反擊（SHENMA_TEST_ONLY=counter）
  "counter-nominal": {
    why: "用敵人的名義攻擊力計算反彈（不是防禦計算後的實扣）",
    file: HERO,
    from: "\t\tif counter_ratio > 0.0:\n\t\t\t_counter(actual_dmg, source)\n",
    to: "\t\tif counter_ratio > 0.0:\n\t\t\t_counter(amount, source)\n",
    only: "counter",
    expect: ["反擊-1 ", "反擊-2 ", "反擊-3 "],
  },
  "counter-on-dodge": {
    why: "閃避（沒有扣血）時仍然反彈",
    file: HERO,
    from: "\t\t\tdodge_count += 1\n\t\t\t_show_dodge()\n\t\t\treturn\n",
    to: "\t\t\tdodge_count += 1\n\t\t\t_show_dodge()\n\t\t\tif counter_ratio > 0.0:\n\t\t\t\t_counter(amount * (1.0 - effective_def() / (effective_def() + 100.0)), source)\n\t\t\treturn\n",
    only: "counter",
    expect: ["反擊-1b "],
  },
  "counter-on-lethal": {
    why: "打倒自己的那一擊也反彈（用受傷前是否活著判斷）",
    file: HERO,
    from: "\tif current_hp <= 0.0:\n\t\tcurrent_hp = 0.0\n\t\thero_died.emit(self)\n\t\tqueue_free()\n\telse:\n\t\tqueue_redraw()\n\t\t# 反擊：打倒自己的那一擊不會走到這裡（不反彈）\n\t\tif counter_ratio > 0.0:\n\t\t\t_counter(actual_dmg, source)\n",
    to: "\tif counter_ratio > 0.0:\n\t\tvar hp_now: float = current_hp\n\t\tcurrent_hp = maxf(current_hp, 0.001)\n\t\t_counter(actual_dmg, source)\n\t\tcurrent_hp = hp_now\n\tif current_hp <= 0.0:\n\t\tcurrent_hp = 0.0\n\t\thero_died.emit(self)\n\t\tqueue_free()\n\telse:\n\t\tqueue_redraw()\n",
    only: "counter",
    expect: ["反擊-1b ", "反擊-4 "],
  },
  "counter-any-source": {
    why: "不檢查攻擊者是不是活著的敵人（有受傷方法的都反彈）",
    file: HERO,
    from: "\tif not (is_instance_valid(source) and source is Enemy) or not _enemy_alive(source):\n\t\treturn\n",
    to: '\tif not is_instance_valid(source) or not source.has_method("take_damage"):\n\t\treturn\n',
    only: "counter",
    expect: ["反擊-1b "],
  },
  "counter-continues-after-death": {
    why: "已經倒下（還沒被釋放）的敵人在之後的物理步進繼續處理、再攻擊",
    file: ENEMY,
    from: "\tif _is_dead or _waypoints.is_empty():\n\t\treturn\n",
    to: "\tif _waypoints.is_empty():\n\t\treturn\n",
    only: "counter",
    expect: ["反擊-1c "],
  },
  "counter-triggers-lifesteal": {
    why: "反彈的傷害也觸發吸血",
    file: HERO,
    from: "\tvar dealt: float = source.take_damage(reflect, false, true)\n",
    to: "\tvar dealt: float = source.take_damage(reflect, false, true)\n\tif lifesteal_ratio > 0.0:\n\t\t_lifesteal(dealt)\n",
    only: "counter",
    expect: ["反擊-1d "],
  },
  "counter-to-first-enemy": {
    why: "反彈給場上第一個敵人（不是這次的攻擊者）",
    file: HERO,
    from: "\tvar dealt: float = source.take_damage(reflect, false, true)\n",
    to: "\tvar tgt: Variant = _wave_mgr.get_active_enemies()[0] if _wave_mgr != null and not _wave_mgr.get_active_enemies().is_empty() else source\n\tvar dealt: float = tgt.take_damage(reflect, false, true)\n",
    only: "counter",
    expect: ["反擊-1d ", "反擊-3 "],
  },
  "counter-reads-invalid": {
    why: "反擊比例只檢查是不是數字（NaN、無限大、0、負數、超過 1 也啟用）",
    file: HERO,
    from: "\t\t\tif (k is float or k is int) and is_finite(float(k)) and float(k) > 0.0 and float(k) <= 1.0:\n",
    to: "\t\t\tif k is float or k is int:\n",
    only: "counter",
    expect: ["反擊-0 "],
  },
  // 廖化的堅韌（SHENMA_TEST_ONLY=tenacity）
  "tenacity-strict-less": {
    why: "門檻用嚴格小於（生命剛好 30% 時不減傷）",
    file: HERO,
    from: "\treturn current_hp / max_hp <= tenacity_hp_ratio\n",
    to: "\treturn current_hp / max_hp < tenacity_hp_ratio\n",
    only: "tenacity",
    expect: ["堅韌-1 ", "堅韌-2 ", "堅韌-3 "],
  },
  "tenacity-after-damage": {
    why: "用扣血後的生命判斷（讓生命跨過門檻的那一擊就減傷）",
    file: HERO,
    from: "\t\tvar reduced: bool = tenacity_on()\n",
    to: "\t\tvar reduced: bool = tenacity_on() or (current_hp - raw_dmg) / max_hp <= tenacity_hp_ratio\n",
    only: "tenacity",
    expect: ["堅韌-1 ", "堅韌-2 ", "堅韌-4 "],
  },
  "tenacity-as-def": {
    why: "減傷倍率加在防禦上（防禦 ÷ 0.8 再照防禦公式，不是防禦計算後乘 0.8）",
    file: HERO,
    from: "\t\t\tactual_dmg = raw_dmg * tenacity_damage_mult\n",
    to: "\t\t\tactual_dmg = amount * (1.0 - (d / tenacity_damage_mult) / (d / tenacity_damage_mult + 100.0))\n",
    only: "tenacity",
    expect: ["堅韌-1 ", "堅韌-2 ", "堅韌-3 "],
  },
  "tenacity-no-mult": {
    why: "判斷生效但漏乘倍率（照原本的傷害扣血）",
    file: HERO,
    from: "\t\t\tactual_dmg = raw_dmg * tenacity_damage_mult\n",
    to: "\t\t\tactual_dmg = raw_dmg\n",
    only: "tenacity",
    expect: ["堅韌-1 ", "堅韌-2 ", "堅韌-3 "],
  },
  "tenacity-double": {
    why: "倍率重複套用（防禦計算後乘兩次）",
    file: HERO,
    from: "\t\t\tactual_dmg = raw_dmg * tenacity_damage_mult\n",
    to: "\t\t\tactual_dmg = raw_dmg * tenacity_damage_mult * tenacity_damage_mult\n",
    only: "tenacity",
    expect: ["堅韌-1 ", "堅韌-2 "],
  },
  "tenacity-deploy-max": {
    why: "門檻用部署時的最大生命（升級後最大生命不更新）",
    file: HERO,
    from: "\tmax_hp     = new_max_hp\n",
    to: "\tmax_hp     = max_hp if max_hp > 0.0 else new_max_hp\n",
    only: "tenacity",
    expect: ["堅韌-1 ", "堅韌-5 "],
  },
  "tenacity-needs-source": {
    why: "只有帶攻擊者的受傷才減傷（套用了反擊的來源限制）",
    file: HERO,
    from: "\tif tenacity_hp_ratio > 0.0:\n\t\tvar before: float = current_hp\n",
    to: "\tif tenacity_hp_ratio > 0.0 and source != null:\n\t\tvar before: float = current_hp\n",
    only: "tenacity",
    expect: ["堅韌-1 "],
  },
  "tenacity-floor-1hp": {
    why: "減傷時保底 1 點生命（致死的一擊留下 1）",
    file: HERO,
    from: "\t\t\tactual_dmg = raw_dmg * tenacity_damage_mult\n",
    to: "\t\t\tactual_dmg = minf(raw_dmg * tenacity_damage_mult, current_hp - 1.0)\n",
    only: "tenacity",
    expect: ["堅韌-1 ", "堅韌-2 ", "堅韌-4 "],
  },
  "tenacity-counter-raw": {
    why: "同時有反擊時用減傷前的傷害計算反彈",
    file: HERO,
    from: "\t\tif counter_ratio > 0.0:\n\t\t\t_counter(actual_dmg, source)\n",
    to: "\t\tif counter_ratio > 0.0:\n\t\t\t_counter(raw_dmg, source)\n",
    only: "tenacity",
    expect: ["堅韌-1 "],
  },
  "tenacity-reads-invalid": {
    why: "門檻與倍率只檢查是不是數字（NaN、無限大、0、負數、1 以上也啟用）",
    file: HERO,
    from: "\t\t\tif _open_unit(lr) and _open_unit(lm):\n",
    to: "\t\t\tif (lr is float or lr is int) and (lm is float or lm is int):\n",
    only: "tenacity",
    expect: ["堅韌-0 "],
  },
  "tenacity-not-cleared": {
    why: "讀取技能時沒有清掉前一次的堅韌（換成其他技能後殘留）",
    file: HERO,
    from: "\ttenacity_hp_ratio = 0.0\n\ttenacity_damage_mult = 1.0\n\tatk_down_aura_mult = 1.0\n",
    to: "\tatk_down_aura_mult = 1.0\n",
    only: "tenacity",
    expect: ["堅韌-0 ", "堅韌-5 "],
  },
  // 顏良的威壓（SHENMA_TEST_ONLY=atkdown）
  "atkdown-multiply": {
    why: "多個威壓的倍率相乘（0.9 與 0.8 變成 0.72，不是取最強的 0.8）",
    file: ENEMY,
    from: "\t\tm = minf(m, float(_atk_down_sources[s].mult))\n",
    to: "\t\tm *= float(_atk_down_sources[s].mult)\n",
    only: "atkdown",
    expect: ["威壓-1 ", "威壓-2 ", "威壓-6 "],
  },
  "atkdown-panel-only": {
    why: "只有狀態與快照顯示降低，實際攻擊仍用原本的攻擊力",
    file: ENEMY,
    from: "\t\t\t_blocker.take_damage(hit_atk, self)\n",
    to: "\t\t\t_blocker.take_damage(blocker_atk, self)\n",
    only: "atkdown",
    expect: ["威壓-2 ", "威壓-4 ", "威壓-5 ", "威壓-6 ", "威壓-8 "],
  },
  "atkdown-linger": {
    why: "撤除來源沒有作用（離開範圍、移除後要等有效期到了才恢復）",
    file: ENEMY,
    from: "\tif _atk_down_sources.erase(source):\n\t\t_refresh_atk_mult()\n",
    to: "\tif false and _atk_down_sources.erase(source):\n\t\t_refresh_atk_mult()\n",
    only: "atkdown",
    expect: ["威壓-1 ", "威壓-2 ", "威壓-3 ", "威壓-5 ", "威壓-6 "],
  },
  "atkdown-no-release": {
    why: "顏良離開場景樹時沒有撤除自己的威壓（倒下、移除後要等有效期）",
    file: HERO,
    from: "\t_release_atk_speed_aura()\n\t_release_atk_down_aura()\n",
    to: "\t_release_atk_speed_aura()\n",
    only: "atkdown",
    expect: ["威壓-5 "],
  },
  "atkdown-counter-raw": {
    why: "反擊用威壓前的傷害計算反彈",
    file: HERO,
    from: "\tvar reflect: float = taken * counter_ratio\n",
    to: "\tvar reflect: float = taken / source.atk_mult * counter_ratio\n",
    only: "atkdown",
    expect: ["威壓-2 ", "威壓-8 "],
  },
  "atkdown-immune-skip": {
    why: "免疫減速的敵人也免疫威壓（把威壓當成減速）",
    file: ENEMY,
    from: '\tif _is_dead or is_queued_for_deletion() or source == "":\n',
    to: '\tif immune_slow or _is_dead or is_queued_for_deletion() or source == "":\n',
    only: "atkdown",
    expect: ["威壓-1 ", "威壓-3 ", "威壓-8 "],
  },
  "atkdown-ground-only": {
    why: "威壓只影響地面敵人（漏掉飛行敵人）",
    file: HERO,
    from: "\t\t\tif _enemy_hostile(e) and global_position.distance_to(e.global_position) <= radius_px:\n\t\t\t\te.apply_atk_down_from(",
    to: "\t\t\tif _enemy_hostile(e) and not e.is_flying() and global_position.distance_to(e.global_position) <= radius_px:\n\t\t\t\te.apply_atk_down_from(",
    only: "atkdown",
    expect: ["威壓-3 "],
  },
  "atkdown-strict-edge": {
    why: "範圍不含邊界（正好在射程上的敵人沒有威壓）",
    file: HERO,
    from: "\t\tvar radius_px: float = attack_range * tile_size + AURA_EDGE_EPS\n\t\tfor e in _wave_mgr.get_active_enemies():\n\t\t\tif _enemy_hostile(e) and global_position",
    to: "\t\tvar radius_px: float = attack_range * tile_size - 0.5\n\t\tfor e in _wave_mgr.get_active_enemies():\n\t\t\tif _enemy_hostile(e) and global_position",
    only: "atkdown",
    expect: ["威壓-3 "],
  },
  "atkdown-never-enabled": {
    why: "引擎的威壓都在，但讀取技能時永遠不啟用（顏良當作普通武將）",
    file: HERO,
    from: "\t\t\tif _open_unit(w):\n\t\t\t\tatk_down_aura_mult = float(w)\n",
    to: "\t\t\tif false and _open_unit(w):\n\t\t\t\tatk_down_aura_mult = float(w)\n",
    only: "atkdown",
    expect: [
      "威壓-0 ",
      "威壓-3 ",
      "威壓-4 ",
      "威壓-5 ",
      "威壓-6 ",
      "威壓-7 ",
      "威壓-8 ",
    ],
  },
  "atkdown-reads-invalid": {
    why: "倍率只檢查是不是數字（NaN、無限大、0、負數、1 以上也啟用）",
    file: HERO,
    from: "\t\t\tif _open_unit(w):\n",
    to: "\t\t\tif (w is float or w is int):\n",
    only: "atkdown",
    expect: ["威壓-0 "],
  },
  "atkdown-not-cleared": {
    why: "讀取技能時沒有清掉前一次的威壓（換成其他技能後殘留）",
    file: HERO,
    from: "\tatk_down_aura_mult = 1.0\n\tdouble_shot_chance = 0.0\n",
    to: "\tdouble_shot_chance = 0.0\n",
    only: "atkdown",
    expect: ["威壓-0 ", "威壓-5 "],
  },
  "atkdown-prep-active": {
    why: "備戰時（不在戰鬥中）威壓也作用",
    file: HERO,
    from: "\tvar active: bool = atk_down_aura_mult < 1.0 and not leaving and _wave_mgr != null and _in_battle()\n",
    to: "\tvar active: bool = atk_down_aura_mult < 1.0 and not leaving and _wave_mgr != null\n",
    only: "atkdown",
    expect: ["威壓-3 ", "威壓-5 "],
  },
  "atkdown-slows-move": {
    why: "威壓也降低移動速度",
    file: ENEMY,
    from: "\treturn maxf(base_speed * MIN_SPEED_RATIO, base_speed * speed_mult * (1.0 - _stack_slow_amount))\n",
    to: "\treturn maxf(base_speed * MIN_SPEED_RATIO, base_speed * speed_mult * atk_mult * (1.0 - _stack_slow_amount))\n",
    only: "atkdown",
    expect: ["威壓-1 ", "威壓-7 "],
  },
  "atkdown-cooldown": {
    why: "套用威壓時延後敵人的攻擊冷卻（攻擊次數變少）",
    file: ENEMY,
    from: '\t_atk_down_sources[source] = {"mult": mult, "left": duration}\n',
    to: '\t_atk_down_sources[source] = {"mult": mult, "left": duration}\n\t_blocker_atk_timer = maxf(_blocker_atk_timer, 0.2)\n',
    only: "atkdown",
    expect: ["威壓-2 ", "威壓-4 "],
  },
  "atkdown-shields-base": {
    why: "受到威壓的敵人抵達城池時不扣城防（把威壓當成保護城池）",
    file: ENEMY,
    from: "\t_is_dead = true\n\treached_base.emit(self)\n",
    to: "\t_is_dead = true\n\tif atk_mult >= 1.0:\n\t\treached_base.emit(self)\n",
    only: "atkdown",
    expect: ["威壓-7 "],
  },
  "doubleshot-never-enabled": {
    why: "引擎的連射都在，但讀取技能時永遠不啟用（孫尚香當作普通攻擊）",
    file: HERO,
    from: "\t\t\tif _open_unit(q):\n",
    to: "\t\t\tif false and _open_unit(q):\n",
    only: "doubleshot",
    expect: [
      "連射-0 ",
      "連射-1 ",
      "連射-2 ",
      "連射-4 ",
      "連射-5 ",
      "連射-6 ",
      "連射-6b ",
      "連射-7 ",
      "連射-8 ",
    ],
  },
  "doubleshot-lte": {
    why: "抽樣用 <=（u 剛好等於機率 0.2 也追加）",
    file: HERO,
    from: "\tvar hit: bool = u >= 0.0 and u < 1.0 and u < double_shot_chance\n",
    to: "\tvar hit: bool = u >= 0.0 and u < 1.0 and u <= double_shot_chance\n",
    only: "doubleshot",
    expect: ["連射-1 "],
  },
  "doubleshot-negative-roll": {
    why: "不檢查抽樣值的範圍（負數、負無限大也算抽中）",
    file: HERO,
    from: "\tvar hit: bool = u >= 0.0 and u < 1.0 and u < double_shot_chance\n",
    to: "\tvar hit: bool = u < double_shot_chance\n",
    only: "doubleshot",
    expect: ["連射-1 "],
  },
  "doubleshot-invalid-roll": {
    why: "替身回傳的不是數字時當作 0（字串、null、布林、陣列都會追加）",
    file: HERO,
    from: "\t\treturn float(v) if (v is float or v is int) else NAN\n",
    to: "\t\treturn float(v) if (v is float or v is int) else 0.0\n",
    only: "doubleshot",
    expect: ["連射-1 "],
  },
  "doubleshot-roll-twice": {
    why: "每次攻擊抽兩次（一個回合可能追加兩擊）",
    file: HERO,
    from: "\t\t_double_shot(target, dealt)\n",
    to: "\t\t_double_shot(target, dealt)\n\t\t_double_shot(target, dealt)\n",
    only: "doubleshot",
    expect: ["連射-1 ", "連射-4 ", "連射-6 "],
  },
  "doubleshot-chain": {
    why: "追加之後再抽一次（追加的一擊又可以連射）",
    file: HERO,
    from: "\t\tdouble_shot_count += 1\n",
    to: "\t\tdouble_shot_count += 1\n\t\tif _enemy_alive(target) and _double_shot_roll() < double_shot_chance:\n\t\t\ttarget.take_damage(atk)\n",
    only: "doubleshot",
    expect: ["連射-1 ", "連射-4 ", "連射-6 "],
  },
  "doubleshot-after-kill": {
    why: "第一擊已經打倒目標也抽樣（倒下的目標也算追加）",
    file: HERO,
    from: "\tif not (f > 0.0 and is_finite(f)) or not _enemy_alive(target):\n",
    to: "\tif not (f > 0.0 and is_finite(f)):\n",
    only: "doubleshot",
    expect: ["連射-2 ", "連射-4 ", "連射-8 "],
  },
  "doubleshot-retarget": {
    why: "第一擊打倒目標時改打射程內的另一個敵人",
    file: HERO,
    from: "\tif not (f > 0.0 and is_finite(f)) or not _enemy_alive(target):\n\t\treturn\n",
    to: "\tif not (f > 0.0 and is_finite(f)):\n\t\treturn\n\tif not _enemy_alive(target):\n\t\ttarget = _find_target(_wave_mgr.get_active_enemies(), attack_range * tile_size) if _wave_mgr else null\n\t\tif target == null:\n\t\t\treturn\n",
    only: "doubleshot",
    expect: ["連射-4 "],
  },
  "doubleshot-roll-on-miss": {
    why: "第一擊沒有實際傷害也抽樣（攻擊力 0、受傷沒有回傳數字也會追加）",
    file: HERO,
    from: "\tif not (f > 0.0 and is_finite(f)) or not _enemy_alive(target):\n",
    to: "\tif not _enemy_alive(target):\n",
    only: "doubleshot",
    expect: ["連射-2 ", "連射-3 "],
  },
  "doubleshot-ground-only": {
    why: "連射不打飛行敵人（只對地面目標判定）",
    file: HERO,
    from: "\tif not (f > 0.0 and is_finite(f)) or not _enemy_alive(target):\n",
    to: "\tif not (f > 0.0 and is_finite(f)) or not _enemy_alive(target) or target.is_flying():\n",
    only: "doubleshot",
    expect: ["連射-7 "],
  },
  "doubleshot-text-only": {
    why: "抽中時只出現「+1」，沒有真的扣敵人的生命",
    file: HERO,
    from: "\t\tvar r: Variant = target.take_damage(atk)\n",
    to: "\t\tvar r: Variant = 0.0\n",
    only: "doubleshot",
    expect: ["連射-1 ", "連射-2 ", "連射-6 "],
  },
  "doubleshot-delayed": {
    why: "追加的一擊排在 0.3 秒後才打（不是同一個攻擊回合）",
    file: HERO,
    from: "\t\tvar r: Variant = target.take_damage(atk)\n",
    to: "\t\tvar later: Callable = func():\n\t\t\tif _enemy_alive(target):\n\t\t\t\ttarget.take_damage(atk)\n\t\tget_tree().create_timer(0.3).timeout.connect(later)\n\t\tvar r: Variant = atk\n",
    only: "doubleshot",
    expect: ["連射-1 ", "連射-6 "],
  },
  "doubleshot-boosted-second": {
    why: "追加的一擊用這一擊加成後的傷害（首擊加倍時追加 200，不是攻擊力 100）",
    file: HERO,
    from: "\t\t_double_shot(target, dealt)\n",
    to: "\t\tvar keep_atk: float = atk\n\t\tatk = damage\n\t\t_double_shot(target, dealt)\n\t\tatk = keep_atk\n",
    only: "doubleshot",
    expect: ["連射-8 "],
  },
  "doubleshot-chains-skills": {
    why: "追加的一擊也引發吸血與灼燒",
    file: HERO,
    from: "\t\tdouble_shot_count += 1\n",
    to: "\t\tdouble_shot_count += 1\n\t\tif lifesteal_ratio > 0.0:\n\t\t\t_lifesteal(second)\n\t\tif burn_ratio > 0.0 and _enemy_alive(target):\n\t\t\ttarget.apply_burn(atk * burn_ratio, burn_ticks, burn_interval)\n",
    only: "doubleshot",
    expect: ["連射-5 "],
  },
  "doubleshot-counts-attack": {
    why: "追加的一擊也算一次攻擊（攻擊次數變多）",
    file: HERO,
    from: "\t\tdouble_shot_count += 1\n",
    to: "\t\tdouble_shot_count += 1\n\t\tattack_count += 1\n",
    only: "doubleshot",
    expect: ["連射-1 ", "連射-6 "],
  },
  "doubleshot-cooldown": {
    why: "追加之後縮短冷卻（下一擊提早一半）",
    file: HERO,
    from: "\t_atk_timer    = interval - (late if late < interval else 0.0)\n",
    to: "\t_atk_timer    = interval * (0.5 if double_shot_log.size() > 0 and double_shot_log.back().hit else 1.0) - (late if late < interval else 0.0)\n",
    only: "doubleshot",
    expect: ["連射-6 ", "連射-6b "],
  },
  "doubleshot-reads-invalid": {
    why: "機率只檢查是不是數字（NaN、無限大、0、負數、1 以上也啟用）",
    file: HERO,
    from: "\t\t\tif _open_unit(q):\n",
    to: "\t\t\tif (q is float or q is int):\n",
    only: "doubleshot",
    expect: ["連射-0 "],
  },
  "doubleshot-not-cleared": {
    why: "讀取技能時沒有清掉前一次的連射（換成其他技能後殘留）",
    file: HERO,
    from: "\tdouble_shot_chance = 0.0\n\tchain_ratio = 0.0\n",
    to: "\tchain_ratio = 0.0\n",
    only: "doubleshot",
    expect: ["連射-0 ", "連射-8 "],
  },
  // 龐統的連環計（SHENMA_TEST_ONLY=chain）
  "chain-sweep-center": {
    why: "每一跳都從主目標的位置找（誤用橫掃的中心），第二跳不能在主目標的範圍外",
    file: HERO,
    from: "\t\tfrom = pos\n",
    to: "\t\tpass\n",
    only: "chain",
    expect: ["連環計-1 ", "連環計-3 "],
  },
  "chain-flat-ratio": {
    why: "每一跳都是主攻擊的 50%（第二跳沒有變成 25%）",
    file: HERO,
    from: "\t\tvar amount: float = base * pow(chain_ratio, k)\n",
    to: "\t\tvar amount: float = base * chain_ratio\n",
    only: "chain",
    expect: ["連環計-1 ", "連環計-5 "],
  },
  "chain-uses-dealt": {
    why: "第二跳用前一個敵人實際扣掉的生命再乘比例（不是主攻擊傷害的 25%）",
    file: HERO,
    from: "\t\tvar amount: float = base * pow(chain_ratio, k)\n",
    to: "\t\tvar amount: float = (base if jumps.is_empty() else float(jumps[jumps.size() - 1].dealt)) * chain_ratio\n",
    only: "chain",
    expect: ["連環計-6 "],
  },
  "chain-loop-primary": {
    why: "沒有排除主目標（傳遞會回頭打主目標）",
    file: HERO,
    from: "\tvar hit_ids: Dictionary = {primary_id: true}\n",
    to: "\tvar hit_ids: Dictionary = {}\n",
    only: "chain",
    expect: ["連環計-1 ", "連環計-7 "],
  },
  "chain-no-dedupe": {
    why: "沒有記下已打過的敵人（第二跳打回第一跳的敵人）",
    file: HERO,
    from: "\t\thit_ids[best.get_instance_id()] = true\n",
    to: "",
    only: "chain",
    expect: ["連環計-1 ", "連環計-7 "],
  },
  "chain-counts-attack": {
    why: "每一跳也算一次攻擊（攻擊次數多加）",
    file: HERO,
    from: "\t\tchain_hits += 1\n",
    to: "\t\tchain_hits += 1\n\t\tattack_count += 1\n",
    only: "chain",
    expect: ["連環計-1 ", "連環計-11 ", "連環計-20 "],
  },
  "chain-ignores-can-target": {
    why: "傳遞不檢查這位武將打不打得到（不能對空也傳到飛行敵人）",
    file: HERO,
    from: "\t\t\tif not _enemy_alive(e) or hit_ids.has(e.get_instance_id()) or not can_target(e):\n",
    to: "\t\t\tif not _enemy_alive(e) or hit_ids.has(e.get_instance_id()):\n",
    only: "chain",
    expect: ["連環計-9 "],
  },
  "chain-no-range": {
    why: "傳遞不檢查範圍（範圍外的敵人也被傳到）",
    file: HERO,
    from: "\t\t\tif raw > radius_px + CHAIN_EDGE_EPS:\n",
    to: "\t\t\tif false:\n",
    only: "chain",
    expect: ["連環計-2 ", "連環計-2b ", "連環計-3 "],
  },
  "chain-exclusive-edge": {
    why: "範圍不含邊界（正好 1.5 格的敵人不被傳到）",
    file: HERO,
    from: "\t\t\tif raw > radius_px + CHAIN_EDGE_EPS:\n",
    to: "\t\t\tif raw >= radius_px - CHAIN_EDGE_EPS:\n",
    only: "chain",
    expect: ["連環計-3 "],
  },
  "chain-ties-by-list": {
    why: "距離相同時不看生成序號（改成清單順序）",
    file: HERO,
    from: "\t\t\tif best == null or d < best_d or (d == best_d and seq < best_seq):\n",
    to: "\t\t\tif best == null or d < best_d:\n",
    only: "chain",
    expect: ["連環計-4 "],
  },
  "chain-skip-when-primary-dies": {
    why: "主目標被這一擊打倒時不傳遞",
    file: HERO,
    from: "\tif chain_ratio > 0.0:\n\t\t_chain(hit_pos, primary_id, damage, dealt)\n",
    to: "\tif chain_ratio > 0.0 and _enemy_alive(target):\n\t\t_chain(hit_pos, primary_id, damage, dealt)\n",
    only: "chain",
    expect: ["連環計-5 ", "連環計-21 "],
  },
  "chain-stops-at-kill": {
    why: "被傳到的敵人倒下時就停止（不從它的位置繼續傳）",
    file: HERO,
    from: "\t\tfrom = pos\n",
    to: "\t\tif best.is_dead():\n\t\t\tbreak\n\t\tfrom = pos\n",
    only: "chain",
    expect: ["連環計-6 "],
  },
  "chain-on-zero-damage": {
    why: "主目標沒有實際扣血也傳遞",
    file: HERO,
    from: "\tif not (f > 0.0 and is_finite(f)) or not (base > 0.0 and is_finite(base)) or not _wave_mgr:\n",
    to: "\tif not _wave_mgr:\n",
    only: "chain",
    expect: ["連環計-10 "],
  },
  "chain-never-enabled": {
    why: "連環計永遠不啟用（讀到參數也當作普通攻擊）",
    file: HERO,
    from: "\t\t\t\tchain_ratio = float(ck)\n",
    to: "\t\t\t\tchain_ratio = 0.0\n",
    only: "chain",
    expect: ["連環計-0 ", "連環計-1 "],
  },
  "chain-allows-three-jumps": {
    why: "跳數沒有限制在 1 或 2（3 跳以上也啟用）",
    file: HERO,
    from: " and _positive_whole(cj) and float(cj) <= 2.0:\n",
    to: " and _positive_whole(cj):\n",
    only: "chain",
    expect: ["連環計-0 "],
  },
  "chain-not-cleared": {
    why: "讀取技能時沒有清掉前一次的連環計（換成其他技能後殘留）",
    file: HERO,
    from: "\tchain_ratio = 0.0\n\tchain_radius = 0.0\n\tchain_max_jumps = 0\n\tstorm_ratio = 0.0\n",
    to: "\tstorm_ratio = 0.0\n",
    only: "chain",
    expect: ["連環計-0 ", "連環計-27 "],
  },
  "chain-triggers-lifesteal": {
    why: "傳遞的傷害也引發吸血",
    file: HERO,
    from: "\t\tchain_dealt += got\n",
    to: "\t\tchain_dealt += got\n\t\tif lifesteal_ratio > 0.0:\n\t\t\t_lifesteal(got)\n",
    only: "chain",
    expect: ["連環計-12 "],
  },
  "chain-fx-longer": {
    why: "連線效果停留時間不對（0.7 秒）",
    file: HERO,
    from: "const CHAIN_FX_TIME: float = 0.35\n",
    to: "const CHAIN_FX_TIME: float = 0.7\n",
    only: "chain",
    expect: ["連環計-13 ", "連環計-24 "],
  },
  "chain-fx-at-hero": {
    why: "連線效果畫在武將的位置（不是主目標被打中的位置）",
    file: HERO,
    from: "\tfx.global_position = start\n",
    to: "\tfx.position = Vector2.ZERO\n",
    only: "chain",
    expect: ["連環計-1b "],
  },
  "chain-panel-missing": {
    why: "選取武將時沒有把連環計的參數送給網頁",
    file: MAIN,
    from: '\t\tinfo["chain"] = {"radius": hero.chain_radius, "ratio": hero.chain_ratio, "max_jumps": hero.chain_max_jumps}\n',
    to: "\t\tpass\n",
    only: "chain",
    expect: ["連環計-20 "],
  },
  // 諸葛亮的呼風喚雨（SHENMA_TEST_ONLY=storm）
  "storm-center-hero": {
    why: "範圍的中心是武將自己（不是主目標被打中的位置）",
    file: HERO,
    from: "\tif storm_ratio > 0.0:\n\t\t_storm(hit_pos, primary_id, damage, dealt)\n",
    to: "\tif storm_ratio > 0.0:\n\t\t_storm(global_position, primary_id, damage, dealt)\n",
    only: "storm",
    expect: ["呼風喚雨-5 "],
  },
  "storm-wired-to-chain": {
    why: "呼風喚雨的參數被當成連環計（變成從被打中的敵人往外傳、逐跳遞減）",
    file: HERO,
    from: "\t\t\t\tstorm_radius = float(sr)\n\t\t\t\tstorm_ratio = float(sk)\n\t\t\t\tstorm_max_targets = int(st)\n",
    to: "\t\t\t\tchain_radius = float(sr)\n\t\t\t\tchain_ratio = float(sk)\n\t\t\t\tchain_max_jumps = 2\n",
    only: "storm",
    expect: ["呼風喚雨-0 ", "呼風喚雨-2 ", "呼風喚雨-10 ", "呼風喚雨-20 "],
  },
  "storm-decays": {
    why: "範圍內的傷害逐名遞減（50%、25%…，不是每一名都 50%）",
    file: HERO,
    from: "\t\tvar r: Variant = e.take_damage(amount)\n",
    to: "\t\tvar r: Variant = e.take_damage(amount * pow(storm_ratio, hits.size()))\n",
    only: "storm",
    expect: ["呼風喚雨-2 ", "呼風喚雨-12 ", "呼風喚雨-20 "],
  },
  "storm-five-targets": {
    why: "人數上限多算一名（4 名時打到第 5 名）",
    file: HERO,
    from: "\tpicks = picks.slice(0, storm_max_targets)\n",
    to: "\tpicks = picks.slice(0, storm_max_targets + 1)\n",
    only: "storm",
    expect: ["呼風喚雨-2 ", "呼風喚雨-3 ", "呼風喚雨-20 "],
  },
  "storm-full-damage": {
    why: "範圍內每一名受到 100%（比例沒有乘上）",
    file: HERO,
    from: "\tvar amount: float = base * storm_ratio\n",
    to: "\tvar amount: float = base\n",
    only: "storm",
    expect: ["呼風喚雨-2 ", "呼風喚雨-12 "],
  },
  "storm-uses-atk": {
    why: "範圍傷害用攻擊力計算（首擊加倍時沒有跟著這次打出去的傷害）",
    file: HERO,
    from: "\tvar amount: float = base * storm_ratio\n",
    to: "\tvar amount: float = atk * storm_ratio\n",
    only: "storm",
    expect: ["呼風喚雨-20b "],
  },
  "storm-hits-primary": {
    why: "沒有排除主目標（主目標再被範圍打一次）",
    file: HERO,
    from: "\t\tif not _enemy_alive(e) or e.get_instance_id() == primary_id or not can_target(e):\n",
    to: "\t\tif not _enemy_alive(e) or not can_target(e):\n",
    only: "storm",
    expect: ["呼風喚雨-1 ", "呼風喚雨-2 "],
  },
  "storm-ignores-can-target": {
    why: "範圍傷害不檢查這位武將打不打得到（不能對空也打到飛行敵人）",
    file: HERO,
    from: "\t\tif not _enemy_alive(e) or e.get_instance_id() == primary_id or not can_target(e):\n",
    to: "\t\tif not _enemy_alive(e) or e.get_instance_id() == primary_id:\n",
    only: "storm",
    expect: ["呼風喚雨-9 "],
  },
  "storm-no-range": {
    why: "範圍傷害不檢查半徑（範圍外的敵人也被打）",
    file: HERO,
    from: "\t\tif raw > radius_px + STORM_EDGE_EPS:\n",
    to: "\t\tif false:\n",
    only: "storm",
    expect: ["呼風喚雨-1 ", "呼風喚雨-4 ", "呼風喚雨-5 "],
  },
  "storm-exclusive-edge": {
    why: "範圍不含邊界（正好 2 格的敵人不受傷）",
    file: HERO,
    from: "\t\tif raw > radius_px + STORM_EDGE_EPS:\n",
    to: "\t\tif raw >= radius_px - STORM_EDGE_EPS:\n",
    only: "storm",
    expect: ["呼風喚雨-4 "],
  },
  "storm-ties-by-list": {
    why: "距離相同時不看生成序號（改成清單順序）",
    file: HERO,
    from: "return x.d < y.d or (x.d == y.d and x.seq < y.seq))",
    to: "return x.d < y.d)",
    only: "storm",
    expect: ["呼風喚雨-3 "],
  },
  "storm-skip-when-primary-dies": {
    why: "主目標被這一擊打倒時沒有範圍傷害",
    file: HERO,
    from: "\tif storm_ratio > 0.0:\n\t\t_storm(hit_pos, primary_id, damage, dealt)\n",
    to: "\tif storm_ratio > 0.0 and _enemy_alive(target):\n\t\t_storm(hit_pos, primary_id, damage, dealt)\n",
    only: "storm",
    expect: ["呼風喚雨-6 ", "呼風喚雨-21 "],
  },
  "storm-on-zero-damage": {
    why: "主目標沒有實際扣血也有範圍傷害",
    file: HERO,
    from: "\tif not (hit > 0.0 and is_finite(hit)) or not (base > 0.0 and is_finite(base)) or not _wave_mgr:\n",
    to: "\tif not _wave_mgr:\n",
    only: "storm",
    expect: ["呼風喚雨-13 "],
  },
  "storm-counts-attack": {
    why: "範圍內每一名也算一次攻擊（攻擊次數多加）",
    file: HERO,
    from: "\t\tstorm_hits += 1\n",
    to: "\t\tstorm_hits += 1\n\t\tattack_count += 1\n",
    only: "storm",
    expect: ["呼風喚雨-2 ", "呼風喚雨-12 ", "呼風喚雨-20 "],
  },
  "storm-triggers-lifesteal": {
    why: "範圍傷害也引發吸血",
    file: HERO,
    from: "\t\tstorm_dealt += got\n",
    to: "\t\tstorm_dealt += got\n\t\tif lifesteal_ratio > 0.0:\n\t\t\t_lifesteal(got)\n",
    only: "storm",
    expect: ["呼風喚雨-11 "],
  },
  "storm-never-enabled": {
    why: "呼風喚雨永遠不啟用（讀到參數也當作普通攻擊）",
    file: HERO,
    from: "\t\t\t\tstorm_ratio = float(sk)\n",
    to: "\t\t\t\tstorm_ratio = 0.0\n",
    only: "storm",
    expect: ["呼風喚雨-0 ", "呼風喚雨-2 "],
  },
  "storm-allows-five": {
    why: "人數沒有限制在 1～4（5 名以上也啟用）",
    file: HERO,
    from: " and _positive_whole(st) and float(st) <= 4.0:\n",
    to: " and _positive_whole(st):\n",
    only: "storm",
    expect: ["呼風喚雨-0 "],
  },
  "storm-not-cleared": {
    why: "讀取技能時沒有清掉前一次的呼風喚雨（換成其他技能後殘留）",
    file: HERO,
    from: "\tstorm_ratio = 0.0\n\tstorm_radius = 0.0\n\tstorm_max_targets = 0\n\tberserk_ratio = 0.0\n",
    to: "\tberserk_ratio = 0.0\n",
    only: "storm",
    expect: ["呼風喚雨-0 ", "呼風喚雨-27 "],
  },
  "storm-fx-at-hero": {
    why: "風雨圈畫在武將的位置（不是主目標被打中的位置）",
    file: HERO,
    from: "\tfx.global_position = origin\n",
    to: "\tfx.position = Vector2.ZERO\n",
    only: "storm",
    expect: ["呼風喚雨-5 ", "呼風喚雨-14 "],
  },
  "storm-fx-longer": {
    why: "風雨圈停留時間不對（0.9 秒）",
    file: HERO,
    from: "const STORM_FX_TIME: float = 0.45\n",
    to: "const STORM_FX_TIME: float = 0.9\n",
    only: "storm",
    expect: ["呼風喚雨-14 ", "呼風喚雨-24 "],
  },
  "storm-panel-missing": {
    why: "選取武將時沒有把呼風喚雨的參數送給網頁",
    file: MAIN,
    from: '\t\tinfo["storm"] = {"radius": hero.storm_radius, "ratio": hero.storm_ratio, "max_targets": hero.storm_max_targets}\n',
    to: "\t\tpass\n",
    only: "storm",
    expect: ["呼風喚雨-20 "],
  },
  "berserk-every-kill": {
    why: "全場的擊殺都替呂布加層（不是只算自己普通攻擊的最後一擊）",
    file: BATTLE,
    from: "\tkills += 1\n\tvar src: Dictionary = supply_source()\n",
    to: '\tkills += 1\n\tadd_berserk_kill("lv_bu", 10, -1, 0.0, 0.0)\n\tvar src: Dictionary = supply_source()\n',
    only: "berserk",
    expect: ["戰神-21 "],
  },
  "berserk-hit-not-kill": {
    why: "沒有確認這一擊讓目標倒下（打到就加層）",
    file: HERO,
    from: "\tif not (is_instance_valid(target) and target.is_dead()):\n\t\treturn\n\tvar r: Dictionary = _battle_mgr.add_berserk_kill(",
    to: "\tvar r: Dictionary = _battle_mgr.add_berserk_kill(",
    only: "berserk",
    expect: ["戰神-1 ", "戰神-3 "],
  },
  "berserk-boost-kill-hit": {
    why: "打倒敵人的那一擊提前用加層後的攻擊力",
    file: HERO,
    from: "\tif berserk_ratio > 0.0:\n\t\tdamage = berserk_atk()\n",
    to: "\tif berserk_ratio > 0.0:\n\t\tdamage = atk * (1.0 + berserk_ratio * float(mini(berserk_stacks() + 1, berserk_max_stacks)))\n",
    only: "berserk",
    expect: ["戰神-1 ", "戰神-20 "],
  },
  "berserk-multiplicative": {
    why: "層數連乘（125 × 1.05 的 n 次方，不是加法）",
    file: HERO,
    from: "\treturn atk * (1.0 + berserk_ratio * float(berserk_stacks()))\n",
    to: "\treturn atk * pow(1.0 + berserk_ratio, float(berserk_stacks()))\n",
    only: "berserk",
    expect: ["戰神-1 ", "戰神-2 "],
  },
  "berserk-no-cap": {
    why: "層數沒有上限（到 10 層後照樣加層、照樣提示）",
    file: BATTLE,
    from: "\tvar after: int = before + 1 if before < max_stacks else before\n",
    to: "\tvar after: int = before + 1\n",
    only: "berserk",
    expect: ["戰神-2 "],
  },
  "berserk-cap-nine": {
    why: "上限 10 不被接受（只接受 9 以下）",
    file: HERO,
    from: " and _positive_whole(bx) and float(bx) <= 10.0:\n",
    to: " and _positive_whole(bx) and float(bx) < 10.0:\n",
    only: "berserk",
    expect: ["戰神-0 "],
  },
  "berserk-upgrade-compounds": {
    why: "升級時把加成乘進攻擊力（之後再乘一次，重複加成）",
    file: HERO,
    from: '\tatk        = float(new_state.get("atk", atk))\n',
    to: '\tatk        = float(new_state.get("atk", atk)) * (1.0 + berserk_ratio * float(berserk_stacks()))\n',
    only: "berserk",
    expect: ["戰神-5 "],
  },
  "berserk-kept-next-battle": {
    why: "新的一場沒有清掉上一場的層數",
    file: BATTLE,
    from: "\t_berserk.clear()\n",
    to: "\tpass\n",
    only: "berserk",
    expect: ["戰神-22 "],
  },
  "berserk-switch-keeps-stacks": {
    why: "換成其他技能時沒有清掉這一場的層數（換回戰神時沿用舊層數）",
    file: HERO,
    from: "\tif not (berserk_ratio > 0.0):\n\t\t_drop_berserk_stacks()\n",
    to: "\tpass\n",
    only: "berserk",
    expect: ["戰神-6 "],
  },
  "berserk-not-cleared": {
    why: "讀取技能時沒有清掉前一次的戰神（換成其他技能後殘留）",
    file: HERO,
    from: "\tberserk_ratio = 0.0\n\tberserk_max_stacks = 0\n\tsupply_gold_multiplier = 1.0\n",
    to: "\tsupply_gold_multiplier = 1.0\n",
    only: "berserk",
    expect: ["戰神-0 "],
  },
  "berserk-panel-missing": {
    why: "選取武將時沒有把戰神的層數與攻擊力送給網頁",
    file: MAIN,
    from: '\tif hero.berserk_ratio > 0.0:\n\t\tinfo["berserk"] = {',
    to: '\tif false:\n\t\tinfo["berserk"] = {',
    only: "berserk",
    expect: ["戰神-20 "],
  },
  // 魯肅的補給（SHENMA_TEST_ONLY=supply）
  "supply-generic-income": {
    why: "倍率套在通用的 earn_gold（不是只套在有效擊殺）：擊殺的金幣被乘兩次",
    file: BATTLE,
    from: "func earn_gold(amount: int) -> void:\n\tbattle_gold += amount\n",
    to: "func earn_gold(amount: int) -> void:\n\tbattle_gold += kill_gold(float(supply_source().mult)) * amount / GOLD_PER_KILL\n",
    only: "supply",
    expect: ["補給-1 ", "補給-4 ", "補給-20 "],
  },
  "supply-refund-boosted": {
    why: "拆除的返還也乘上補給的倍率",
    file: BATTLE,
    from: "\t\treturn\n\tbattle_gold += amount\n",
    to: "\t\treturn\n\tbattle_gold += kill_gold(float(supply_source().mult)) * amount / GOLD_PER_KILL\n",
    only: "supply",
    expect: ["補給-4 ", "補給-24 "],
  },
  "supply-stale-source": {
    why: "結算時沒有確認來源還在場上、活著（未部署、陣亡、正要被移除、移出隊伍的魯肅仍然有效）",
    file: HERO,
    from: "\treturn supply_gold_multiplier > 1.0 and is_inside_tree() and _hero_alive(self)\n",
    to: "\treturn supply_gold_multiplier > 1.0\n",
    only: "supply",
    expect: ["補給-1 ", "補給-2 ", "補給-22 "],
  },
  "supply-sources-multiply": {
    why: "多個來源的倍率相乘（不是取最強的一個）",
    file: BATTLE,
    from: "\t\tif float(s.mult) > float(best.mult):\n\t\t\tbest = s\n",
    to: '\t\tbest = {"hero_id": s.hero_id, "mult": float(best.mult) * float(s.mult)}\n',
    only: "supply",
    expect: ["補給-3 "],
  },
  "supply-round-half-up": {
    why: "每次擊殺的金幣四捨五入（不是向下取整）",
    file: BATTLE,
    from: "\treturn int(floor(float(GOLD_PER_KILL) * mult + SUPPLY_EPS))\n",
    to: "\treturn int(round(float(GOLD_PER_KILL) * mult))\n",
    only: "supply",
    expect: ["補給-0 ", "補給-3 "],
  },
  "supply-kept-next-battle": {
    why: "新的一場沒有清掉上一場的補給來源",
    file: BATTLE,
    from: "\t_supply_sources.clear()\n",
    to: "\tpass\n",
    only: "supply",
    expect: ["補給-5 "],
  },
  "supply-not-cleared": {
    why: "讀取技能時沒有清掉前一次的補給（換成其他技能後殘留）",
    file: HERO,
    from: '\tsupply_gold_multiplier = 1.0\n\tvar skill = state.get("skill", null)\n',
    to: '\tvar skill = state.get("skill", null)\n',
    only: "supply",
    expect: ["補給-0 ", "補給-2 ", "補給-22 "],
  },
  "supply-no-upper-bound": {
    why: "倍率沒有上限（超過 2 也接受）",
    file: HERO,
    from: "\t\t\tif _positive_finite(g) and float(g) > 1.0 and float(g) <= 2.0:\n",
    to: "\t\t\tif _positive_finite(g) and float(g) > 1.0:\n",
    only: "supply",
    expect: ["補給-0 "],
  },
  "supply-panel-missing": {
    why: "選取武將時沒有把補給的倍率與每次擊殺的金幣送給網頁",
    file: MAIN,
    from: "\tif hero.supply_gold_multiplier > 1.0:\n\t\tvar src: Dictionary = battle_manager.supply_source()\n",
    to: "\tif false:\n\t\tvar src: Dictionary = battle_manager.supply_source()\n",
    only: "supply",
    expect: ["補給-20 "],
  },
  // 許褚的怪力（SHENMA_TEST_ONLY=knockback）
  "knockback-away-from-hero": {
    why: "直接把敵人往遠離武將的方向推，不沿它走過的路線倒退（路點索引與剩餘路程不變）",
    file: HERO,
    from: "\tvar moved: float = target.knockback(requested)\n",
    to: "\ttarget.global_position += (target.global_position - global_position).normalized() * requested\n\tvar moved: float = requested\n",
    only: "knockback",
    expect: ["怪力-5 ", "怪力-20 "],
  },
  "knockback-corner-index-kept": {
    why: "跨過折點時位置退了、路點索引沒有跟著退：下一步直接斜著走向原本的路點",
    file: ENEMY,
    from: "\tposition = pos\n\t_wp_index = k\n",
    to: "\tposition = pos\n",
    only: "knockback",
    expect: ["怪力-1 ", "怪力-3 "],
  },
  "knockback-past-start": {
    // 退完的位置也要在路段上：越過起點的位置被這道檢查擋下（回傳 0），所以抓到的是「剩 10 時應該退到起點」的怪力-1
    why: "退到路線起點還有剩時繼續往起點外面推（越過起點）",
    file: ENEMY,
    from: "\t\tif k - 1 <= 0:\n\t\t\tbreak  # 已經在路線起點\n",
    to: "\t\tif k - 1 <= 0:\n\t\t\tpos += (prev - (_waypoints[1] as Vector2)).normalized() * left\n\t\t\tleft = 0.0\n\t\t\tbreak\n",
    only: "knockback",
    expect: ["怪力-1 "],
  },
  "knockback-no-damage-check": {
    why: "沒有實際扣到生命（無效的傷害）也推",
    file: HERO,
    from: '\tif not (got > 0.0 and is_finite(got)) or _battle_mgr == null or hero_id == "":\n\t\treturn\n\tif not _enemy_alive(target) or target.is_flying()',
    to: '\tif _battle_mgr == null or hero_id == "":\n\t\treturn\n\tif not _enemy_alive(target) or target.is_flying()',
    only: "knockback",
    expect: ["怪力-6 "],
  },
  "knockback-dead-enemy-moves": {
    why: "已倒下的敵人也會被推（敵人這一側不檢查是否倒下）",
    file: ENEMY,
    from: "\tif _is_dead or is_queued_for_deletion() or is_flying():\n\t\treturn 0.0\n",
    to: "\tif is_queued_for_deletion() or is_flying():\n\t\treturn 0.0\n",
    only: "knockback",
    expect: ["怪力-2 "],
  },
  "knockback-cooldown-reset-on-read": {
    why: "重新讀技能（換回怪力、升級、移出再放回）時清掉這一場的冷卻",
    file: HERO,
    from: "\t\t\t\tknockback_distance = float(kd)\n\t\t\t\tknockback_cooldown = float(kc)\n",
    to: "\t\t\t\tknockback_distance = float(kd)\n\t\t\t\tknockback_cooldown = float(kc)\n\t\t\t\tif _battle_mgr != null:\n\t\t\t\t\t_battle_mgr._knockback.erase(hero_id)\n",
    only: "knockback",
    expect: ["怪力-8 ", "怪力-23 "],
  },
  "knockback-blocker-kept": {
    why: "推開後沒有解除阻擋：敵人在許褚的格子外仍然攻擊許褚",
    file: ENEMY,
    from: "\tif _blocker != null:\n\t\t_blocker = null\n\t\t_blocked_cell = Vector2i(-1, -1)\n\tqueue_redraw()\n\treturn moved\n",
    to: "\tqueue_redraw()\n\treturn moved\n",
    only: "knockback",
    expect: ["怪力-4 ", "怪力-24 "],
  },
  "knockback-cooldown-wallclock": {
    why: "冷卻照牆鐘時間算（乘上時間倍率），不是戰鬥中的遊戲時間：2 倍速時要等兩倍的戰鬥時間",
    file: BATTLE,
    from: "\trec.ready_at = battle_time + cooldown\n",
    to: "\trec.ready_at = battle_time + cooldown * Engine.time_scale\n",
    only: "knockback",
    expect: ["怪力-21 "],
  },
  "knockback-panel-missing": {
    why: "選取武將時沒有把怪力的參數與剩下的冷卻送給網頁",
    file: MAIN,
    from: '\tif hero.knockback_distance > 0.0:\n\t\tinfo["knockback"]',
    to: '\tif false:\n\t\tinfo["knockback"]',
    only: "knockback",
    expect: ["怪力-20 "],
  },
  "knockback-no-progress-check": {
    why: "完全不檢查路線進度（推之前與退完的位置都不檢查）：偏離路段、越過這一段、索引是終點卻不在終點、NaN／無限大的位置也照樣倒退（位置可能變成 NaN 或被往前推）",
    file: ENEMY,
    from: KB_CHECKED,
    to: KB_CHECKED.replace(
      "\tif not _path_progress_valid():\n\t\treturn 0.0\n",
      ""
    ).replace(
      "\tif not (moved > 0.0 and moved <= distance and _finite_v2(pos) and k >= 1 and k < n and _on_path_segment(pos, k)):\n",
      "\tif not (moved > 0.0):\n"
    ),
    only: "knockback",
    expect: ["怪力-10 ", "怪力-12 "],
  },
  "knockback-no-start-check": {
    why: "推之前不檢查路線進度（只檢查退完的位置）：路點或剩餘路程是 NaN／無限大、和路線對不起來、零長段不在那個路點上時照樣推",
    file: ENEMY,
    from: "\tif not _path_progress_valid():\n\t\treturn 0.0\n",
    to: "",
    only: "knockback",
    expect: ["怪力-10 "],
  },
  "knockback-progress-any-segment": {
    why: "位置只要在路線的任何一段上就當成合理（不看目前的路點索引）：重複路點的零長段不在那個路點上時照樣推",
    file: ENEMY,
    from: "\treturn _on_path_segment(position, _wp_index)\n",
    to: "\tfor j in range(1, n + 1):\n\t\tif _on_path_segment(position, j):\n\t\t\treturn true\n\treturn false\n",
    only: "knockback",
    expect: ["怪力-10 "],
  },
  "knockback-progress-eps-loose": {
    why: "容差放寬到半個像素：明顯偏離或越過路段 0.02 像素的位置也當成在路段上",
    file: ENEMY,
    from: "const PATH_EPS_MIN: float = 0.01\n",
    to: "const PATH_EPS_MIN: float = 0.5\n",
    only: "knockback",
    expect: ["怪力-10 "],
  },
  // 典韋的護衛（SHENMA_TEST_ONLY=guard）
  "guard-absorb-uses-defense": {
    why: "承擔的部分又照典韋的防禦減少（不是直接扣生命）：典韋少扣、友軍多扣",
    file: HERO,
    from: "\tvar dealt: float = minf(amount, current_hp)\n\tcurrent_hp -= dealt\n",
    to: "\tvar dealt: float = minf(amount * (1.0 - effective_def() / (effective_def() + 100.0)), current_hp)\n\tcurrent_hp -= dealt\n",
    only: "guard",
    expect: ["護衛-1 ", "護衛-8 "],
  },
  "guard-low-hp-full-share": {
    why: "典韋生命不夠時仍替友軍擋下完整的 20%（友軍少扣、典韋只付出剩下的生命，等於免費多擋）",
    file: HERO,
    from: "\tvar want: float = minf(dmg * g.guard_share_ratio, g.current_hp)\n\tif not (want > 0.0 and is_finite(want)):\n\t\treturn 0.0\n\tvar guard_before: float = g.current_hp\n\tvar s: float = g.absorb_guard_damage(want)\n",
    to: "\tvar want: float = dmg * g.guard_share_ratio\n\tif not (want > 0.0 and is_finite(want)):\n\t\treturn 0.0\n\tvar guard_before: float = g.current_hp\n\tvar s: float = want if g.absorb_guard_damage(want) > 0.0 else 0.0\n",
    only: "guard",
    expect: ["護衛-2 ", "護衛-21 "],
  },
  "guard-counter-before-share": {
    why: "被保護的夏侯惇用分擔前的傷害反彈（把典韋承擔的部分也算進去）",
    file: HERO,
    from: "\tactual_dmg -= shared\n\tcurrent_hp -= actual_dmg\n",
    to: "\tcurrent_hp -= actual_dmg - shared\n",
    only: "guard",
    expect: ["護衛-5 "],
  },
  "guard-recursive": {
    why: "承擔的部分走典韋一般的受傷流程（會再閃避、減傷、堅韌、反擊，也會再找別的護衛分攤）",
    file: HERO,
    from: "\tvar s: float = g.absorb_guard_damage(want)\n",
    to: "\tvar gh: float = g.current_hp\n\tg.take_damage(want / maxf(1e-9, 1.0 - g.effective_def() / (g.effective_def() + 100.0)), source)\n\tvar s: float = gh - g.current_hp\n",
    only: "guard",
    expect: ["護衛-6 ", "護衛-8 "],
  },
  "guard-stale-source": {
    why: "不確認護衛此刻能不能提供（已倒下、正要被移除、屬於另一場的典韋也分攤）",
    file: HERO,
    from: "\t\tif h == self or not (h is Hero) or not h.guard_available() or h._battle_mgr != _battle_mgr:\n",
    to: "\t\tif h == self or not (h is Hero) or not (h.guard_share_ratio > 0.0):\n",
    only: "guard",
    expect: ["護衛-3 ", "護衛-7 "],
  },
  "guard-outside-battle": {
    why: "備戰、結算後與手動暫停時也分攤",
    file: HERO,
    from: "\tif _battle_mgr == null or _battle_mgr.game_state != BattleManager.GameState.BATTLE or _battle_mgr.manual_paused:\n\t\treturn null\n",
    to: "\tif _battle_mgr == null:\n\t\treturn null\n",
    only: "guard",
    expect: ["護衛-3 "],
  },
  "guard-panel-missing": {
    why: "選取武將時沒有把護衛的參數與範圍內的友軍送給網頁",
    file: MAIN,
    from: '\tif hero.guard_share_ratio > 0.0:\n\t\tinfo["guard_share"]',
    to: '\tif false:\n\t\tinfo["guard_share"]',
    only: "guard",
    expect: ["護衛-20 ", "護衛-22 "],
  },
  // 孫權的守護（SHENMA_TEST_ONLY=baseguard）
  "base-guard-floor-each": {
    why: "每次漏城各自向下取整（0.8 變 0）：守護在場時城防永遠不扣",
    file: BATTLE,
    from: "\tvar target: int = int(ceil(_leak_total - LEAK_EPS))\n",
    to: "\tvar target: int = _leak_lost + int(floor(float(src.mult)))\n",
    only: "baseguard",
    expect: ["守護-1 ", "守護-2 ", "守護-3 ", "守護-20 "],
  },
  "base-guard-reset-on-register": {
    why: "重新部署（登記來源）時把累計的漏城傷害與已扣的城防歸零：反覆部署可以重新拿到折扣",
    file: BATTLE,
    from: "\t\t_base_guard_sources[hero.get_instance_id()] = weakref(hero)\n",
    to: "\t\t_base_guard_sources[hero.get_instance_id()] = weakref(hero)\n\t\t_leak_total = 0.0\n\t\t_leak_lost = 0\n",
    only: "baseguard",
    expect: ["守護-2 "],
  },
  "base-guard-stale-source": {
    why: "不確認來源此刻能不能提供（正要被移除、倒下的孫權仍然減傷）",
    file: BATTLE,
    from: "\t\tif h == null or not is_instance_valid(h) or not h.base_guard_active():\n",
    to: "\t\tif h == null or not is_instance_valid(h) or not (h.base_guard_mult < 1.0):\n",
    only: "baseguard",
    expect: ["守護-2 "],
  },
  "base-guard-leak-as-kill": {
    why: "漏城被當成擊殺（擊殺數與戰場點數增加）",
    file: BATTLE,
    from: "\t_leak_lost += loss\n\tbase_hp -= loss\n",
    to: "\t_leak_lost += loss\n\tbase_hp -= loss\n\tkills += 1\n",
    only: "baseguard",
    expect: ["守護-3 ", "守護-20 "],
  },
  "base-guard-stats-hp-mismatch": {
    why: "送給網頁的城防用漏城的隻數計算，和實際的城防（結算用）不一致",
    file: BATTLE,
    from: '\t\t"hp": base_hp,\n',
    to: '\t\t"hp": MAX_BASE_HP - _leak_log.size(),\n',
    only: "baseguard",
    expect: ["守護-20 "],
  },
  "base-guard-panel-missing": {
    why: "選取武將時沒有把守護的倍率與生效狀態送給網頁",
    file: MAIN,
    from: '\tif hero.base_guard_mult < 1.0:\n\t\tinfo["base_guard"]',
    to: '\tif false:\n\t\tinfo["base_guard"]',
    only: "baseguard",
    expect: ["守護-20 "],
  },
  "base-guard-no-hud-refresh": {
    why: "孫權離開場上（陣亡、移出隊伍）時沒有重新送出生效的倍率：戰場上方仍顯示減傷",
    file: HERO,
    from: "\tif base_guard_mult < 1.0 and _battle_mgr != null and is_instance_valid(_battle_mgr):\n\t\t_battle_mgr.notify_base_guard_changed()\n",
    to: "\tif false:\n\t\t_battle_mgr.notify_base_guard_changed()\n",
    only: "baseguard",
    expect: ["守護-21 "],
  },
  // 甘寧的奇襲（SHENMA_TEST_ONLY=assassinate）
  "assassinate-double-damage": {
    why: "首擊只是再打一次普通攻擊（兩倍傷害），不是必殺",
    file: HERO,
    from: "\t\t_assassinate(target, damage, assassinate_hp, dealt)\n",
    to: "\t\t_battle_mgr.record_assassinate(hero_id, {})\n\t\ttarget.take_damage(damage)\n",
    only: "assassinate",
    expect: ["奇襲-1 ", "奇襲-20 "],
  },
  "assassinate-reset-on-read": {
    why: "重新讀技能（重新部署、升級、換技能再換回）時把這一場用過的紀錄清掉",
    file: HERO,
    from: '\tassassinate_on = as_skill is Dictionary and str(as_skill.get("id", "")) == "assassinate"\n',
    to: '\tassassinate_on = as_skill is Dictionary and str(as_skill.get("id", "")) == "assassinate"\n\tif assassinate_on and _battle_mgr != null:\n\t\t_battle_mgr._assassinate_used.erase(hero_id)\n',
    only: "assassinate",
    expect: ["奇襲-4 ", "奇襲-21 "],
  },
  "assassinate-per-target": {
    why: "每個目標各自一次（不是每場一次）：每次普通攻擊都必殺",
    file: HERO,
    from: "_battle_mgr.combat_active() or not _battle_mgr.assassinate_ready(hero_id):\n",
    to: "_battle_mgr.combat_active() or not _battle_mgr.assassinate_ready(hero_id + str(target.get_instance_id())):\n",
    only: "assassinate",
    expect: ["奇襲-1 ", "奇襲-20 ", "奇襲-21 "],
  },
  "assassinate-double-kill": {
    why: "補扣之後又多發一次死亡（擊殺與獎勵算兩次）",
    file: HERO,
    from: "\t\t\tvar r: Variant = target.take_damage(mid)\n",
    to: "\t\t\tvar r: Variant = target.take_damage(mid)\n\t\t\ttarget.died.emit(target)\n",
    only: "assassinate",
    expect: ["奇襲-1 ", "奇襲-20 ", "奇襲-23 "],
  },
  "assassinate-bypass-death": {
    why: "補扣直接把生命設成 0 並移除節點（不走受傷與死亡的流程：沒有擊殺、金幣與波次清理）",
    file: HERO,
    from: "\t\t\tvar r: Variant = target.take_damage(mid)\n",
    to: "\t\t\ttarget.current_hp = 0.0\n\t\t\ttarget.queue_free()\n\t\t\tvar r: Variant = mid\n",
    only: "assassinate",
    expect: ["奇襲-1 ", "奇襲-20 "],
  },
  "assassinate-outside-battle": {
    why: "備戰、結算與手動暫停中也用掉（不檢查戰鬥中）",
    file: HERO,
    from: '\tif _battle_mgr == null or hero_id == "" or not _battle_mgr.combat_active() or not',
    to: '\tif _battle_mgr == null or hero_id == "" or not',
    only: "assassinate",
    expect: ["奇襲-3 "],
  },
  "assassinate-finish-feeds-skills": {
    why: "補扣的傷害也算進這一擊（範圍、吸血等其他技能用補扣後的數字）",
    file: HERO,
    from: "\t\t_assassinate(target, damage, assassinate_hp, dealt)\n",
    to: "\t\t_assassinate(target, damage, assassinate_hp, dealt)\n\t\tdamage = assassinate_hp\n\t\tdealt = assassinate_hp\n",
    only: "assassinate",
    expect: ["奇襲-5 "],
  },
  "assassinate-panel-missing": {
    why: "選取武將時沒有把奇襲用過了沒有送給網頁",
    file: MAIN,
    from: "\tif hero.assassinate_on:\n\t\tvar used: bool",
    to: "\tif false:\n\t\tvar used: bool",
    only: "assassinate",
    expect: ["奇襲-20 "],
  },
  // 貂蟬的魅惑與敵對可選的目標整合（SHENMA_TEST_ONLY=charm）
  "charm-hero-targets-charmed": {
    why: "武將選目標時不排除受控的敵人（仍打被魅惑的敵人）",
    file: HERO,
    from: "\t\t# 受控（魅惑）的敵人仍然活著，但不是敵對可選的目標\n\t\tif _charmed(e):\n\t\t\tcontinue\n",
    to: "",
    only: "charm",
    expect: ["魅惑-2 ", "整合-1 ", "魅惑-22 "],
  },
  "charm-tower-targets-charmed": {
    why: "防禦塔選目標時不排除受控的敵人",
    file: TOWER,
    from: "\t\t# 受控（貂蟬的魅惑）的敵人仍然活著，但不是敵對可選的目標\n\t\tif _charmed(e):\n\t\t\tcontinue\n",
    to: "",
    only: "charm",
    expect: ["整合-2 ", "魅惑-22 "],
  },
  "charm-still-walks": {
    why: "受控的敵人照常前進、抵達城池、攻擊擋路的武將（受控只多了攻擊其他敵人）",
    file: ENEMY,
    from: "\tif _charm_step():\n\t\t_charm_physics(delta)\n\t\treturn\n",
    to: "\tif _charm_step():\n\t\t_charm_physics(delta)\n",
    only: "charm",
    expect: ["魅惑-1 ", "魅惑-6 ", "魅惑-21 "],
  },
  "charm-source-unchecked": {
    why: "來源陣亡、被移除或技能失效後仍維持控制（只看時間）",
    file: ENEMY,
    from: '\tif h == null or not is_instance_valid(h) or not h.has_method("charm_source_active") or not h.charm_source_active():\n',
    to: "\tif h == null or not is_instance_valid(h):\n",
    only: "charm",
    expect: ["魅惑-5 "],
  },
  "charm-early-win": {
    why: "波次清理不計受控的敵人（只剩受控的敵人時提早清波、勝利）",
    file: WAVE,
    from: "\treturn _active_enemies.is_empty() and _active_spawning_groups <= 0\n",
    to: "\treturn _active_enemies.filter(func(e): return not e.is_charmed()).is_empty() and _active_spawning_groups <= 0\n",
    only: "charm",
    expect: ["魅惑-22 "],
  },
  "charm-resets-attack-cd": {
    why: "開始受控時把攻擊冷卻歸零（進入受控就免費多打一下）",
    file: ENEMY,
    from: '\t_blocked_cell = Vector2i(-1, -1)\n\t_charm_note({"ev": "start"',
    to: '\t_blocked_cell = Vector2i(-1, -1)\n\t_blocker_atk_timer = 0.0\n\t_charm_note({"ev": "start"',
    only: "charm",
    expect: ["魅惑-1 "],
  },
  "charm-refresh": {
    why: "已經受控的敵人可以再被控制（刷新或轉移來源）",
    file: ENEMY,
    from: "\tif _is_dead or is_queued_for_deletion() or is_flying() or is_charmed():\n\t\treturn false\n",
    to: "\tif _is_dead or is_queued_for_deletion() or is_flying():\n\t\treturn false\n",
    only: "charm",
    expect: ["魅惑-3 "],
  },
  "charm-wallclock": {
    why: "控制時間乘上時間倍率（2 倍速時受控的戰鬥時間變成兩倍）",
    file: ENEMY,
    from: "\t_charm_until = float(bm.battle_time) + duration\n",
    to: "\t_charm_until = float(bm.battle_time) + duration * Engine.time_scale\n",
    only: "charm",
    expect: ["魅惑-21 "],
  },
  "charm-attacks-charmed": {
    why: "受控的敵人也攻擊另一個受控的敵人",
    file: ENEMY,
    from: "\t\tif e.is_flying() or e.is_charmed():\n",
    to: "\t\tif e.is_flying():\n",
    only: "charm",
    expect: ["魅惑-4 "],
  },
  "charm-aoe-hits-charmed": {
    why: "砲兵塔的範圍傷害波及受控的敵人",
    file: TOWER,
    from: "<= aoe_radius and not _charmed(e):\n",
    to: "<= aoe_radius:\n",
    only: "charm",
    expect: ["整合-2 "],
  },
  "charm-chain-hits-charmed": {
    why: "連環計傳給受控的敵人",
    file: HERO,
    from: "\t\t\tif _charmed(e):\n\t\t\t\tcontinue\n\t\t\tvar raw: float = from.distance_to(e.global_position)\n",
    to: "\t\t\tvar raw: float = from.distance_to(e.global_position)\n",
    only: "charm",
    expect: ["整合-1 "],
  },
  "charm-aura-removes-existing": {
    why: "減速光環在敵人受控時立刻撤除已經有的減速（沒有照有效期結束）",
    file: HERO,
    from: "\t\tif not keep.has(id) and is_instance_valid(_aura_slowed[id]) and not _charmed(_aura_slowed[id]):\n\t\t\t_aura_slowed[id].remove_slow_from(aura_source)\n",
    to: "\t\tif not keep.has(id) and is_instance_valid(_aura_slowed[id]):\n\t\t\t_aura_slowed[id].remove_slow_from(aura_source)\n",
    only: "charm",
    expect: ["整合-3 "],
  },
  "charm-panel-missing": {
    why: "選取武將時沒有把魅惑的參數與冷卻送給網頁",
    file: MAIN,
    from: '\tif hero.charm_duration > 0.0:\n\t\tinfo["charm"]',
    to: '\tif false:\n\t\tinfo["charm"]',
    only: "charm",
    expect: ["魅惑-20 "],
  },
  "charm-cooldown-not-reset": {
    why: "新的一場沒有清掉魅惑的冷卻（上一場的冷卻延續到新的一場）",
    file: BATTLE,
    from: "\t# 魅惑：新的一場冷卻清空\n\t_charm.clear()\n",
    to: "",
    only: "charm",
    expect: ["魅惑-23 "],
  },
  "observation-skips-charmed": {
    why: "戰況觀測漏掉受控的敵人（仍活著、計入波次，卻沒有列出）",
    file: MAIN,
    from: "\t\tif not is_instance_valid(e) or e.is_queued_for_deletion() or e.is_dead():\n\t\t\tcontinue\n\t\tenemies.append(_enemy_observation(e, gen))\n",
    to: "\t\tif not is_instance_valid(e) or e.is_queued_for_deletion() or e.is_dead() or e.is_charmed():\n\t\t\tcontinue\n\t\tenemies.append(_enemy_observation(e, gen))\n",
    only: "observation",
    expect: ["觀測-5 ", "觀測-7 "],
  },
  "observation-seq-not-reset": {
    why: "新的一場沒有把戰況觀測的 seq 從頭算（沿用上一場的編號）",
    file: MAIN,
    from: "func _reset_observation() -> void:\n\t_obs_seq = 0\n",
    to: "func _reset_observation() -> void:\n\tpass\n",
    only: "observation",
    expect: ["觀測-8 "],
  },
  "observation-no-immediate": {
    why: "狀態改變時不立刻送戰況觀測（只照間隔送；結算後的最後一份送不出去）",
    file: MAIN,
    from: "func _mark_observation() -> void:\n\t_obs_force = true\n",
    to: "func _mark_observation() -> void:\n\tpass\n",
    only: "observation",
    expect: ["觀測-9 "],
  },
  "bgm-duplicate-download": {
    why: "背景音樂下載中再要播放時又送出一次下載（重複下載）",
    file: SFX,
    from: "\tif _bgm_pending or _bgm_tries >= BGM_MAX_TRIES:\n\t\treturn\n",
    to: "\tif _bgm_tries >= BGM_MAX_TRIES:\n\t\treturn\n",
    only: "bgm",
    expect: ["BGM-2 "],
  },
  "bgm-plays-after-stop": {
    why: "停止（結算、換場）之後背景音樂下載完成仍然開始播放",
    file: SFX,
    from: "\tif _bgm_wanted and sfx_enabled and not _bgm_player.playing:\n",
    to: "\tif sfx_enabled and not _bgm_player.playing:\n",
    only: "bgm",
    expect: ["BGM-3 "],
  },
  "spawn-planned-wrong": {
    why: "本波出兵進度的計畫總數算錯（不是有效計畫的 count 加總）",
    file: WAVE,
    from: "\tfor p in plans:\n\t\tplanned += int(p.count)\n",
    to: "\tfor p in plans:\n\t\tplanned += int(p.count) + 1\n",
    only: "spawn",
    expect: ["出兵進度-1 "],
  },
  "spawn-kills-not-per-wave": {
    why: "上一波的敵人倒下也算進這一波的擊殺",
    file: WAVE,
    from: '\tif int(enemy.get_meta(WAVE_META, -1)) != _prog_wave or enemy.has_meta("spawn_counted"):\n',
    to: '\tif enemy.has_meta("spawn_counted"):\n',
    only: "spawn",
    expect: ["出兵進度-4 "],
  },
  "spawn-not-reset-on-new-battle": {
    why: "換場（新的一場）沒有清空本波出兵進度",
    file: WAVE,
    from: "func _begin_new_generation() -> void:\n\t_reset_progress(0, 0)\n",
    to: "func _begin_new_generation() -> void:\n",
    only: "spawn",
    expect: ["出兵進度-5 "],
  },
  "bgm-unlimited-retry": {
    why: "背景音樂下載失敗後沒有次數上限（每次要播放都重新下載）",
    file: SFX,
    from: "\tif _bgm_pending or _bgm_tries >= BGM_MAX_TRIES:\n\t\treturn\n",
    to: "\tif _bgm_pending:\n\t\treturn\n",
    only: "bgm",
    expect: ["BGM-6 "],
  },
};

// 變異原文檢查（check）：逐一核對每個變異定義仍然有效（目標檔案存在、原文非空、而且在目前的原始碼裡剛好出現一次，CRLF 當作 LF）。
// 只讀工作區的檔案：不啟動 Godot、不匯入、不建立暫存專案、不寫入任何檔案，也不需要 GODOT。
// 執行某個變異時同樣會檢查它自己的原文；這個模式一次檢查全部，避免沒有執行的變異在程式改動後過期很久才被發現（快速一層會跑）
function checkDefinitions() {
  const problems = [];
  const perFile = {};
  for (const [k, m] of Object.entries(MUTATIONS)) {
    const bad = [];
    if (typeof m?.file !== "string" || m.file === "")
      bad.push("file 不是非空字串");
    if (typeof m?.from !== "string" || m.from === "")
      bad.push("from 不是非空字串");
    if (typeof m?.to !== "string") bad.push("to 不是字串");
    else if (m.to === m.from) bad.push("to 和 from 相同（沒有改動）");
    if (typeof m?.only !== "string" || m.only === "")
      bad.push("only 不是非空字串");
    if (
      !Array.isArray(m?.expect) ||
      m.expect.length === 0 ||
      m.expect.some((e) => typeof e !== "string" || e.trim() === "")
    )
      bad.push("expect 不是非空的字串清單");
    if (bad.length > 0) {
      problems.push({ name: k, file: m?.file ?? null, reason: bad.join("、") });
      continue;
    }
    let text;
    try {
      text = readFileSync(join(GAME, m.file), "utf8").replace(/\r\n/g, "\n");
    } catch {
      problems.push({ name: k, file: m.file, reason: "檔案不存在或無法讀取" });
      continue;
    }
    const n = text.split(m.from).length - 1;
    if (n !== 1)
      problems.push({
        name: k,
        file: m.file,
        count: n,
        reason: `原文出現 ${n} 次（應為 1）`,
      });
    perFile[m.file] = (perFile[m.file] ?? 0) + 1;
  }
  for (const p of problems)
    console.log(`FAIL  ${p.name}\t${p.file ?? "（沒有檔案）"}\t${p.reason}`);
  const total = Object.keys(MUTATIONS).length;
  console.log(
    "RESULT_JSON " +
      JSON.stringify({
        mode: "check",
        total,
        ok: total - problems.length,
        problems,
        per_file: perFile,
      })
  );
  return problems.length === 0;
}

const name = process.argv.slice(2).find((a) => a !== "--keep-temp");
if (name === "check") process.exit(checkDefinitions() ? 0 : 1);
if (!name || name === "list") {
  for (const [k, m] of Object.entries(MUTATIONS))
    console.log(`${k}\t${m.why}（預期 FAIL：${m.expect.join("、").trim()}）`);
  console.log("none\t不改程式（基準：同一組測試必須全部通過）");
  process.exit(name ? 0 : 2);
}
const mut = name === "none" ? null : MUTATIONS[name];
if (name !== "none" && !mut) {
  console.error(`不認得的變異：${name}（用 list 列出全部）`);
  process.exit(2);
}
const GODOT = process.env.GODOT;
if (!GODOT) {
  console.error("請設定 GODOT 為 Godot 4.6.2 console 執行檔路徑");
  process.exit(2);
}
const only = mut ? mut.only : process.env.SHENMA_TEST_ONLY || "sweep";

const tmp = createTempDir("shenma-godot-mutation-");
const work = tmp.dir;
const proj = join(work, "project");
mkdirSync(proj, { recursive: true });
const files = execFileSync("git", ["ls-files", "-z", "."], { cwd: GAME })
  .toString()
  .split("\0")
  .filter(Boolean);
for (const f of files) {
  mkdirSync(dirname(join(proj, f)), { recursive: true });
  cpSync(join(GAME, f), join(proj, f));
}
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
if (mut) {
  const p = join(proj, mut.file);
  const text = readFileSync(p, "utf8").replace(/\r\n/g, "\n");
  const n = text.split(mut.from).length - 1;
  if (n !== 1) {
    console.error(
      `變異原文在 ${mut.file} 出現 ${n} 次（應為 1），程式可能已改動，請更新變異定義`
    );
    process.exit(2);
  }
  writeFileSync(p, text.replace(mut.from, mut.to));
}

const run = (log, args, env = {}) => {
  const r = spawnSync(GODOT, ["--headless", ...args], {
    env: { ...process.env, ...env },
    timeout: 900000,
    maxBuffer: 256 * 1024 * 1024,
  });
  const out = (r.stdout || "").toString() + (r.stderr || "").toString();
  writeFileSync(join(work, log), out);
  return { code: r.status, out, timedOut: r.error?.code === "ETIMEDOUT" };
};

const t0 = Date.now();
const imp = run("import.log", ["--path", proj, "--import"]);
cpSync(
  join(ROOT, "scripts/shenma-regression/godot"),
  join(proj, "__regression__"),
  {
    recursive: true,
  }
);
const test = run(
  "test.log",
  ["--path", proj, "--script", "res://__regression__/lifecycle_test.gd"],
  { SHENMA_TEST_ONLY: only }
);
const lines = test.out.split(/\r?\n/);
const fails = lines
  .filter((l) => l.startsWith("FAIL  "))
  .map((l) => l.slice(6));
const passes = lines.filter((l) => l.startsWith("PASS  ")).length;
const scriptErrors = lines.filter((l) => /SCRIPT ERROR|Parse Error/.test(l));
const resultLine = lines.find((l) => l.startsWith("RESULT_JSON "));
const missed = mut
  ? mut.expect.filter((e) => !fails.some((f) => f.startsWith(e)))
  : [];
// 基準（none）另外用 godot-check 的同一套 log 規則檢查（ERROR 行、RESULT_JSON、PASS 數）
const logCheck = mut
  ? null
  : spawnSync("node", [
      join(ROOT, "scripts/shenma-regression/tools/check-log.mjs"),
      "test",
      join(work, "test.log"),
    ]).status;
const ok = mut
  ? fails.length > 0 && missed.length === 0
  : !!resultLine &&
    fails.length === 0 &&
    passes > 0 &&
    scriptErrors.length === 0 &&
    test.code === 0 &&
    logCheck === 0;

for (const f of fails) console.log("FAIL  " + f.slice(0, 160));
const summary = {
  mutation: name,
  why: mut?.why ?? "基準（未改程式）",
  only,
  import_code: imp.code,
  test_code: test.code,
  timed_out: test.timedOut,
  pass: passes,
  fail: fails.length,
  failed_names: fails.map((f) => f.split("  ")[0]),
  expected: mut?.expect.map((e) => e.trim()) ?? [],
  missed: missed.map((e) => e.trim()),
  script_errors: scriptErrors.length,
  log_check: logCheck === null ? null : logCheck === 0,
  caught: mut ? ok : null,
  seconds: Math.round((Date.now() - t0) / 1000),
  work,
};
console.log("RESULT_JSON " + JSON.stringify(summary));
// 證據：結果、變異身份（檔案、原文與改後的 sha256）、改過的遊戲程式的指紋與兩份 log
finishTempDir(tmp, {
  passed: ok,
  name: `godot-mutation ${name}`,
  result: {
    ...summary,
    identity: mut
      ? {
          file: mut.file,
          fromSha256: sha256(mut.from),
          toSha256: sha256(mut.to),
          mutatedFileSha256: sha256(readFileSync(join(proj, mut.file))),
        }
      : null,
    projectFiles: files.length,
  },
  files: ["import.log", "test.log"],
});
process.exit(ok ? 0 : 1);
