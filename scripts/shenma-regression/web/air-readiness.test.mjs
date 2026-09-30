// 出征前的對空準備提醒（src/app/(games)/shenmaSanguo/utils/stageAirReadiness.ts）測試，不需要瀏覽器
// - 關卡有沒有飛行敵人和敵軍預覽（stagePreview 的 flying）一致；遊戲會略過的組、會拒絕的波次不算
// - 飛行敵人的數量沿用預覽的合法 count 規則：無法判讀時不給數字、不會出現 NaN；資料不完整時不給總數
// - 找不到敵人設定、缺波次、沒有波次或路線時標成資料不完整（地面關卡也不能說成「確定沒有飛行」）
// - 隊伍只看上陣的武將（依 hero_id 去重），弓兵、法師能對空，其他與遊戲不認得的職業只打地面；
//   沒上陣的弓兵不算、找不到設定的武將另外列出；空隊伍與資料未載入分開
// - 不修改傳入的資料
// 用法：node scripts/shenma-regression/web/air-readiness.test.mjs
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const UTILS = join(ROOT, "src/app/(games)/shenmaSanguo/utils");

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

const { stageAirReadiness, teamAirState } = require(
  join(UTILS, "stageAirReadiness.ts")
);
const { buildStagePreview } = require(join(UTILS, "stagePreview.ts"));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail).slice(0, 700)}`
  );
};
const block = (name, fn) => {
  try {
    fn();
  } catch (e) {
    check(name + "（執行時例外）", false, String(e && e.stack));
  }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const deepFreeze = (o) => {
  if (o && typeof o === "object") {
    Object.values(o).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

// ── 測試資料 ──
const ENEMIES = [
  {
    enemy_id: "foot",
    name: "步兵",
    hp: 50,
    speed: 60,
    movement_type: "ground",
  },
  { enemy_id: "fly", name: "飛騎", hp: 30, speed: 80, movement_type: "flying" },
  {
    enemy_id: "pad",
    name: "怪鳥",
    hp: 30,
    speed: 80,
    movement_type: " flying ",
  },
  { enemy_id: "air", name: "氣球", hp: 30, speed: 80, movement_type: "air" },
  { enemy_id: "old", name: "舊兵", hp: 30, speed: 80 },
];
const HEROES = [
  { hero_id: "huang", name: "黃忠", job: "archer" },
  { hero_id: "zhuge", name: "諸葛亮", job: "mage" },
  { hero_id: "guan", name: "關羽", job: "infantry" },
  { hero_id: "zhao", name: "趙雲", job: "cavalry" },
  { hero_id: "ninja", name: "忍者", job: "ninja" },
  { hero_id: "gun", name: "砲手", job: "artillery" },
];
const PATHS = {
  paths: {
    path_a: [
      [0, 0],
      [5, 5],
    ],
    path_b: [],
  },
};
const map = (waves, path_json = PATHS) => ({
  map_id: "m",
  chapter: 1,
  name: "測試",
  unlock_stage: "",
  path_json,
  waves,
});
const g = (enemy_id, count, extra = {}) => ({
  enemy_id,
  count,
  interval: 1,
  path: "path_a",
  ...extra,
});
const team = (...ids) => ids.map((hero_id, i) => ({ hero_id, slot: i + 1 }));

const FLY_MAP = map([
  { wave: 1, enemies: [g("foot", 2), g("fly", 2)] },
  { wave: 2, enemies: [g("pad", 3)] },
]);
const GROUND_MAP = map([
  { wave: 1, enemies: [g("foot", 2), g("air", 1), g("old", 1)] },
]);

block("關卡判讀", () => {
  const r = stageAirReadiness(FLY_MAP, ENEMIES, team("guan"), HEROES);
  check(
    "關卡-1 飛行關：kind flying，第 1 波飛騎 ×2、第 2 波怪鳥（「 flying 」）×3，總數 5",
    r.kind === "flying" &&
      same(r.flyingWaves, [
        { wave: 1, groups: [{ name: "飛騎", count: 2 }] },
        { wave: 2, groups: [{ name: "怪鳥", count: 3 }] },
      ]) &&
      r.flyingTotal === 5 &&
      r.incomplete.length === 0,
    r
  );
  const gr = stageAirReadiness(GROUND_MAP, ENEMIES, team("guan"), HEROES);
  check(
    "關卡-2 地面關（air、沒有移動方式都當地面）且資料完整：kind ground，沒有飛行波次",
    gr.kind === "ground" &&
      gr.flyingWaves.length === 0 &&
      gr.flyingTotal === null &&
      gr.incomplete.length === 0,
    gr
  );

  const unk = stageAirReadiness(
    map([{ wave: 1, enemies: [g("foot", 2), g("ghost", 2)] }]),
    ENEMIES,
    team("guan"),
    HEROES
  );
  check(
    "關卡-3 沒有發現飛行、但有找不到設定的敵人：kind unclear（不能保證沒有飛行），原因列出 enemy_id",
    unk.kind === "unclear" && unk.incomplete.some((t) => /ghost/.test(t)),
    unk
  );
  const flyUnk = stageAirReadiness(
    map([{ wave: 1, enemies: [g("fly", 2), g("ghost", 2)] }]),
    ENEMIES,
    team("guan"),
    HEROES
  );
  check(
    "關卡-4 有飛行也有找不到設定的敵人：kind flying、標示資料不完整、不給總數",
    flyUnk.kind === "flying" &&
      flyUnk.incomplete.length > 0 &&
      flyUnk.flyingTotal === null &&
      flyUnk.flyingWaves[0].groups[0].count === 2,
    flyUnk
  );
  const noEnemies = stageAirReadiness(FLY_MAP, null, team("guan"), HEROES);
  check(
    "關卡-5 敵人設定還沒載入（null）：kind unclear，不說成地面",
    noEnemies.kind === "unclear" && noEnemies.incomplete.length > 0,
    noEnemies
  );
  const noWaves = stageAirReadiness(map([]), ENEMIES, team("guan"), HEROES);
  check(
    "關卡-6 沒有波次資料：kind unclear",
    noWaves.kind === "unclear" &&
      noWaves.incomplete.some((t) => /波次/.test(t)),
    noWaves
  );
  const gap = stageAirReadiness(
    map([
      { wave: 1, enemies: [g("foot", 1)] },
      { wave: 3, enemies: [g("fly", 1)] },
    ]),
    ENEMIES,
    team("guan"),
    HEROES
  );
  check(
    "關卡-7 缺第 2 波：資料不完整（列出第 2 波），第 3 波的飛騎仍列出、不給總數",
    gap.kind === "flying" &&
      gap.incomplete.some((t) => /第 2 波/.test(t)) &&
      gap.flyingTotal === null &&
      gap.flyingWaves[0].wave === 3,
    gap
  );
});

block("數量", () => {
  const cases = [
    ['字串 "3"', "3", 3],
    ["小數 2.7（和遊戲的 int() 相同取 2）", 2.7, 2],
    ['無法判讀 "abc"', "abc", null],
    ["沒有提供（遊戲以 1 隻計）", undefined, 1],
  ];
  for (const [label, count, want] of cases) {
    const grp =
      count === undefined
        ? { enemy_id: "fly", interval: 1, path: "path_a" }
        : g("fly", count);
    const r = stageAirReadiness(
      map([{ wave: 1, enemies: [grp] }]),
      ENEMIES,
      team("huang"),
      HEROES
    );
    const got = r.flyingWaves[0] && r.flyingWaves[0].groups[0].count;
    check(
      `數量-${label}：${want === null ? "數量無法確定（null，總數也是 null）" : want + " 隻"}`,
      r.kind === "flying" &&
        got === want &&
        (want === null ? r.flyingTotal === null : r.flyingTotal === want) &&
        !Number.isNaN(r.flyingTotal),
      r
    );
  }
  const zero = stageAirReadiness(
    map([{ wave: 1, enemies: [g("foot", 1), g("fly", 0), g("fly", -2)] }]),
    ENEMIES,
    team("huang"),
    HEROES
  );
  check(
    "數量-0 與負數的飛行組遊戲會略過：不算飛行關",
    zero.kind === "ground" && zero.flyingWaves.length === 0,
    zero
  );
  const noPath = stageAirReadiness(
    map([
      { wave: 1, enemies: [g("foot", 1), g("fly", 2, { path: "path_b" })] },
    ]),
    ENEMIES,
    team("huang"),
    HEROES
  );
  check(
    "數量-路線沒有路點的飛行組遊戲會略過：不算飛行關",
    noPath.kind === "ground",
    noPath
  );
  const rejected = stageAirReadiness(
    map([
      { wave: 1, enemies: [g("fly", "abc", { path: "path_b" })] },
      { wave: 2, enemies: [g("foot", 1)] },
    ]),
    ENEMIES,
    team("huang"),
    HEROES
  );
  check(
    "數量-整波都會被略過（遊戲拒絕那一波）：不算飛行關",
    rejected.kind === "ground",
    rejected
  );
  const dup = stageAirReadiness(
    map([
      { wave: 1, enemies: [g("foot", 1)] },
      { wave: 1, enemies: [g("fly", 5)] },
    ]),
    ENEMIES,
    team("huang"),
    HEROES
  );
  check(
    "數量-同一個波次編號有多筆時只用第一筆（和遊戲相同）：第二筆的飛騎不算",
    dup.kind === "ground",
    dup
  );

  // 和敵軍預覽的 flying 一致
  const fixtures = [
    FLY_MAP,
    GROUND_MAP,
    map([{ wave: 1, enemies: [g("fly", "x")] }]),
    map([{ wave: 2, enemies: [g("pad", 1)] }]),
    map([{ wave: 1, enemies: [g("fly", 1, { path: "nope" })] }]),
  ];
  const agree = fixtures.every(
    (m) =>
      (stageAirReadiness(m, ENEMIES, [], HEROES).kind === "flying") ===
      buildStagePreview(m, ENEMIES).flying
  );
  check("數量-有沒有飛行和敵軍預覽的判讀一致（5 組資料）", agree);
});

block("隊伍", () => {
  const air = (ids) =>
    stageAirReadiness(FLY_MAP, ENEMIES, team(...ids), HEROES).team;
  check(
    "隊伍-1 弓兵：能對空（黃忠）",
    same(air(["huang", "guan"]), {
      status: "ready",
      size: 2,
      airHeroes: ["黃忠"],
      unknownHeroes: [],
    }),
    air(["huang", "guan"])
  );
  check(
    "隊伍-2 法師：能對空（諸葛亮）",
    same(air(["zhuge"]).airHeroes, ["諸葛亮"]),
    air(["zhuge"])
  );
  check(
    "隊伍-3 步兵、騎兵、砲兵：都不能對空",
    same(air(["guan", "zhao", "gun"]), {
      status: "ready",
      size: 3,
      airHeroes: [],
      unknownHeroes: [],
    }),
    air(["guan", "zhao", "gun"])
  );
  check(
    "隊伍-4 遊戲不認得的職業（ninja）照矩陣只打地面",
    same(air(["ninja"]).airHeroes, []) &&
      same(air(["ninja"]).unknownHeroes, []),
    air(["ninja"])
  );
  check(
    "隊伍-5 同一個武將出現兩次：去重（1 人、名稱只列一次）",
    same(air(["huang", "huang"]), {
      status: "ready",
      size: 1,
      airHeroes: ["黃忠"],
      unknownHeroes: [],
    }),
    air(["huang", "huang"])
  );
  check(
    "隊伍-6 沒上陣的弓兵不算：隊伍只有關羽時沒有能對空的武將（設定裡有黃忠、諸葛亮）",
    same(air(["guan"]).airHeroes, []),
    air(["guan"])
  );
  check(
    "隊伍-7 找不到設定的上陣武將另外列出",
    same(air(["guan", "lu_bu"]), {
      status: "ready",
      size: 2,
      airHeroes: [],
      unknownHeroes: ["lu_bu"],
    }),
    air(["guan", "lu_bu"])
  );
  check(
    "隊伍-8 空隊伍：empty（和未載入分開）",
    same(teamAirState([], HEROES), { status: "empty" }) &&
      same(teamAirState([{ hero_id: "", slot: 1 }], HEROES), {
        status: "empty",
      })
  );
  check(
    "隊伍-9 玩家或武將設定還沒載入：unknown",
    same(teamAirState(undefined, HEROES), { status: "unknown" }) &&
      same(teamAirState(team("huang"), null), { status: "unknown" })
  );
  check(
    "隊伍-10 換隊伍後結果跟著變（同一關）",
    same(air(["guan"]).airHeroes, []) &&
      same(air(["guan", "zhuge"]).airHeroes, ["諸葛亮"])
  );
});

block("不修改資料", () => {
  const m = deepFreeze(JSON.parse(JSON.stringify(FLY_MAP)));
  const e = deepFreeze(JSON.parse(JSON.stringify(ENEMIES)));
  const t = deepFreeze(team("huang", "guan"));
  const h = deepFreeze(JSON.parse(JSON.stringify(HEROES)));
  const r = stageAirReadiness(m, e, t, h);
  check(
    "不修改-凍結的輸入照常計算（沒有寫入關卡、敵人、隊伍、武將資料）",
    r.kind === "flying" && same(r.team.airHeroes, ["黃忠"])
  );
});

const failed = results.filter((r) => !r.pass).length;
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      total: results.length,
      failed,
      module: "stageAirReadiness.ts",
    })
);
process.exit(failed ? 1 : 0);
