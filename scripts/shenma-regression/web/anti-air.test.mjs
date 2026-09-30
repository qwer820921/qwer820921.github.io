// 神馬三國的飛行敵人與對空規則（utils/antiAir.ts、utils/stagePreview.ts）測試，不需要瀏覽器
// - 用專案內的 TypeScript 即時轉譯
// - 涵蓋：movement_type 的判讀（和 Godot 的 strip_edges 相同：只去掉字元碼 ≤ 32 的前後字元）、武將職業與防禦塔的對空矩陣、
//   Web 的矩陣和 Godot 原始碼（Hero.gd 的 AIR_JOBS、Tower.gd 設定的 anti_air）一致、敵軍預覽的飛行標記與說明
// 戰場上的實際行為由 Godot 的飛行測試（lifecycle_test.gd，SHENMA_TEST_ONLY=flying）與瀏覽器的 flying-web.js 驗證
// 用法：node scripts/shenma-regression/web/anti-air.test.mjs
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const UTILS = join(ROOT, "src/app/(games)/shenmaSanguo/utils");
const GODOT = join(ROOT, "godot/shenmaSanguo");

require.extensions[".ts"] = (module, filename) => {
  const out = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(out.outputText, filename);
};

const {
  movementOf,
  isFlyingEnemy,
  heroCanHitAir,
  towerAirAbility,
  towerAirText,
  AIR_HERO_JOBS,
} = require(join(UTILS, "antiAir.ts"));
const { buildStagePreview } = require(join(UTILS, "stagePreview.ts"));

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok });
  console.log(
    (ok ? "PASS  " : "FAIL  ") +
      name +
      (ok || detail === undefined
        ? ""
        : "  " + JSON.stringify(detail).slice(0, 600))
  );
};
const block = (name, fn) => {
  try {
    fn();
  } catch (e) {
    check(name + "（執行時例外）", false, String(e && e.stack));
  }
};

block("對空-1", () => {
  const cases = [
    ["flying", "flying", true],
    ["ground", "ground", true],
    ["", "ground", true],
    [undefined, "ground", true],
    [null, "ground", true],
    [" flying ", "flying", false],
    ["flying\n", "flying", false],
    ["\tflying", "flying", false],
    ["Flying", "ground", false],
    ["FLYING", "ground", false],
    ["air", "ground", false],
    ["飛行", "ground", false],
    ["　flying", "ground", false],
    [1, "ground", false],
    [true, "ground", false],
  ];
  const got = cases.map(([v]) => {
    const m = movementOf(v);
    return [m.value, m.known];
  });
  const want = cases.map(([, v, k]) => [v, k]);
  check(
    "對空-1 movement_type 的判讀：flying 與前後有空白／換行／tab 的 flying 是飛行（後者標成不是遊戲的寫法）；Flying、FLYING、air、中文、前面是全形空白（Godot 不去掉）、數字、布林都當地面；空白、沒有設定是地面且不算錯誤",
    JSON.stringify(got) === JSON.stringify(want),
    { got, want }
  );
  check(
    "對空-1b isFlyingEnemy：只看 movement_type（名稱、trait、type 不影響）",
    isFlyingEnemy({ movement_type: "flying" }) &&
      !isFlyingEnemy({
        movement_type: "ground",
        name: "飛行兵",
        trait: "flying",
        type: "flying",
      }) &&
      !isFlyingEnemy({}) &&
      !isFlyingEnemy(null)
  );
});

block("對空-2", () => {
  const jobs = [
    "archer",
    "mage",
    "infantry",
    "cavalry",
    "artillery",
    "spear",
    "",
    undefined,
    null,
    "Archer",
    " archer",
  ];
  const got = jobs.map((j) => heroCanHitAir(j));
  check(
    "對空-2 武將：弓兵、法師可以攻擊飛行；步兵、騎兵、砲兵、不認得的職業、空白、沒有職業、大小寫不同、前面有空白都不行（Godot 同樣要完全相同）",
    JSON.stringify(got) ===
      JSON.stringify([
        true,
        true,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
        false,
      ]),
    got
  );
  const towers = [
    "archer",
    "scholar",
    "infantry",
    "cavalry",
    "artillery",
    "catapult",
    undefined,
  ];
  const ab = towers.map((t) => towerAirAbility(t));
  const text = towers.map((t) => towerAirText(t));
  check(
    "對空-2b 防禦塔：弓兵塔 attack（可對空）、文士塔 slow（可減速飛行）；步兵、騎兵、砲兵塔與不認得的種類 none（只打地面）",
    JSON.stringify(ab) ===
      JSON.stringify([
        "attack",
        "slow",
        "none",
        "none",
        "none",
        "none",
        "none",
      ]) &&
      text[0] === "可對空" &&
      text[1] === "可減速飛行" &&
      text[2] === "只打地面",
    { ab, text }
  );
});

block("對空-3", () => {
  // Web 的矩陣和 Godot 原始碼一致（兩邊各寫一份，這裡防止只改一邊）
  const hero = readFileSync(join(GODOT, "entities/hero/Hero.gd"), "utf8");
  const m = hero.match(/const AIR_JOBS: Array\s*=\s*\[([^\]]*)\]/);
  const godotJobs = m
    ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort()
    : null;
  const tower = readFileSync(join(GODOT, "entities/tower/Tower.gd"), "utf8");
  const cfg = tower.slice(
    tower.indexOf("const TOWER_CONFIGS"),
    tower.indexOf("# ── 實例屬性")
  );
  const godotTowers = {};
  for (const part of cfg
    .split(/\n\t"(\w+)": \{/)
    .slice(1)
    .reduce(
      (acc, v, i, arr) => (i % 2 === 0 ? acc.concat([[v, arr[i + 1]]]) : acc),
      []
    )) {
    const [name, body] = part;
    godotTowers[name] = /"anti_air":\s*true/.test(body);
  }
  const webTowers = Object.fromEntries(
    Object.keys(godotTowers).map((k) => [k, towerAirAbility(k) !== "none"])
  );
  check(
    "對空-3 Web 的矩陣和 Godot 一致：Hero.gd 的 AIR_JOBS＝Web 的 AIR_HERO_JOBS；Tower.gd 設定 anti_air 的塔＝Web 可以對空（攻擊或減速）的塔，五種塔都有列出",
    JSON.stringify(godotJobs) === JSON.stringify([...AIR_HERO_JOBS].sort()) &&
      Object.keys(godotTowers).length === 5 &&
      JSON.stringify(godotTowers) === JSON.stringify(webTowers),
    { godotJobs, web: AIR_HERO_JOBS, godotTowers, webTowers }
  );
});

block("對空-4", () => {
  const enemies = [
    { enemy_id: "g", name: "步兵", hp: 20, speed: 60 },
    { enemy_id: "f", name: "飛兵", hp: 30, speed: 80, movement_type: "flying" },
    { enemy_id: "a", name: "怪兵", hp: 30, speed: 80, movement_type: "air" },
    {
      enemy_id: "p",
      name: "空白兵",
      hp: 30,
      speed: 80,
      movement_type: " flying ",
    },
  ];
  const pj = {
    paths: {
      path_a: [
        [0, 5],
        [13, 5],
      ],
    },
  };
  const map = (waves) => ({
    map_id: "m",
    chapter: 1,
    name: "m",
    unlock_stage: "m",
    path_json: pj,
    waves,
  });
  const grp = (enemy_id, count) => ({
    enemy_id,
    count,
    interval: 1,
    path: "path_a",
  });
  const p1 = buildStagePreview(
    map([
      { wave: 1, enemies: [grp("g", 2), grp("f", 3)] },
      { wave: 2, enemies: [grp("a", 1), grp("p", 1)] },
    ]),
    enemies
  );
  const g1 = p1.waves[0].groups;
  const g2 = p1.waves[1].groups;
  check(
    "對空-4 敵軍預覽：每一組帶遊戲判讀的移動方式（飛行、地面）；有出兵的飛行組時整關標示 flying；不是遊戲的寫法（air、前後空白）另外註明遊戲怎麼處理，但出兵與總數照常",
    p1.flying === true &&
      g1[0].movement.value === "ground" &&
      g1[1].movement.value === "flying" &&
      g1[1].notes.length === 0 &&
      g2[0].movement.value === "ground" &&
      g2[0].notes.some((n) => n.includes("air") && n.includes("當作地面")) &&
      g2[1].movement.value === "flying" &&
      g2[1].notes.some((n) => n.includes("當作飛行")) &&
      p1.total === 7,
    { flying: p1.flying, g1, g2, total: p1.total }
  );
  const p2 = buildStagePreview(
    map([{ wave: 1, enemies: [grp("g", 2), grp("f", 0)] }]),
    enemies
  );
  const p3 = buildStagePreview(
    map([
      { wave: 1, enemies: [grp("g", 2), { ...grp("f", 2), path: "path_x" }] },
    ]),
    enemies
  );
  const p4 = buildStagePreview(
    map([
      { wave: 1, enemies: [grp("g", 1)] },
      { wave: 2, enemies: [grp("f", 2)] },
    ]),
    enemies
  );
  check(
    "對空-4b 遊戲會略過的飛行組（數量 0、路線沒有路點）不算這一關有飛行；只有後面的波次有飛行也算",
    p2.flying === false && p3.flying === false && p4.flying === true,
    { p2: p2.flying, p3: p3.flying, p4: p4.flying }
  );
});

const failed = results.filter((r) => !r.ok).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed > 0 ? 1 : 0);
