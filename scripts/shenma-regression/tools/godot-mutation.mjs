// Godot 技能（包括閃避與首擊加倍）、飛行敵人與敵人阻路冷卻測試的反向驗證：把 godot/shenmaSanguo 的版本控制檔案（取工作區內容）複製到暫存目錄，
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
    from: "\t\t\tblocker_attacks += 1\n\t\t\t_blocker.take_damage(BLOCKER_ATK)\n",
    to: "\t\t\tblocker_attacks += 1\n\t\t\tvar hp_before: float = _blocker.current_hp\n\t\t\t_blocker.take_damage(BLOCKER_ATK)\n\t\t\tif is_instance_valid(_blocker) and _blocker.current_hp == hp_before:\n\t\t\t\t_blocker_atk_timer = 0.0\n\t\t\t\tqueue_redraw()\n\t\t\t\treturn\n",
    only: "blocker",
    expect: ["阻路-13 ", "阻路-14a ", "阻路-14b "],
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
