// Godot 技能與飛行敵人測試的反向驗證：把 godot/shenmaSanguo 的版本控制檔案（取工作區內容）複製到暫存目錄，
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
