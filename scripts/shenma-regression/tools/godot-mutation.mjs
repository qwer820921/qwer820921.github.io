// Godot 技能（包括閃避、首擊加倍、防禦光環、暈眩、吸血、攻速光環與反擊）、敵人受傷與灼燒的入口、飛行敵人、敵人阻路冷卻、關卡沒有波次的拒絕、敵人的攻擊力與免疫減速測試的反向驗證：把 godot/shenmaSanguo 的版本控制檔案（取工作區內容）複製到暫存目錄，
// 對遊戲程式套用一個刻意的錯誤，只跑指定的測試組（SHENMA_TEST_ONLY），確認測試「該失敗時一定失敗」。
// 用法：GODOT=<Godot 4.6.2 console 執行檔> node scripts/shenma-regression/tools/godot-mutation.mjs <變異名稱|none|list>
// - none：不改程式，同一組測試必須全部通過、log 也要通過 check-log.mjs 的檢查（確認基準）
// - 其他名稱：預期的測試項目必須 FAIL，否則結束碼 1（測試抓不到這個錯誤）
// 不寫入倉庫，暫存目錄保留供查看（log 在 <暫存>/test.log）
import { spawnSync, execFileSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const GAME = join(ROOT, "godot/shenmaSanguo");
const HERO = "entities/hero/Hero.gd";
const TOWER = "entities/tower/Tower.gd";
const ENEMY = "entities/enemy/Enemy.gd";
const WAVE = "systems/WaveManager.gd";
const MAIN = "main/Main.gd";
const BATTLE = "systems/BattleManager.gd";

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
    from: "\t\t\t_blocker.take_damage(blocker_atk, self)\n",
    to: "\t\t\tvar hp_before: float = _blocker.current_hp\n\t\t\t_blocker.take_damage(blocker_atk, self)\n\t\t\tif is_instance_valid(_blocker) and _blocker.current_hp == hp_before:\n\t\t\t\t_blocker_atk_timer = 0.0\n\t\t\t\tqueue_redraw()\n\t\t\t\treturn\n",
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
    from: "\t\te.left = float(e.left) - delta\n",
    to: "\t\te.left = float(e.left)\n",
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
    from: "\tvar actual_dmg: float = amount * (1.0 - d / (d + 100.0))\n",
    to: "\tvar actual_dmg: float = amount * (1.0 - def_stat / (def_stat + 100.0)) * (2.0 - def_bonus_mult)\n",
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
};

const name = process.argv[2];
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

const work = mkdtempSync(join(tmpdir(), "shenma-godot-mutation-"));
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
console.log(
  "RESULT_JSON " +
    JSON.stringify({
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
    })
);
process.exit(ok ? 0 : 1);
