// 飛行路線無效、防禦塔「優先飛行」選項與拒絕開戰提示的網頁端規則測試，不需要瀏覽器：
// - utils/stagePreview：路線座標的判讀和 Godot 相同（int() 取整數、純整數字串；其他無法確定）；飛行組的路線只有一個路點、
//   起點和終點同一格時遊戲會略過（原因、數量不算、全部無效的波次會被拒絕）；短但不同格的路線、地面的環狀路線照常
// - utils/stageAirReadiness：路線無效的飛行組另外列出，不算進飛行敵人與總數
// - utils/towerTarget：選項以 Godot 送來的 target_modes 為準（沒有送的只顯示三種）；文士塔的說明都是減速
// - utils/waveReject：只採用目前這一場的 wave_rejected，原因代碼轉成文字，不認得的代碼不猜
// 用法：node scripts/shenma-regression/web/flight-route.test.mjs
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

const {
  buildStagePreview,
  stagePathPoints,
  stagePathIds,
  flightRouteProblem,
} = require(join(UTILS, "stagePreview.ts"));
const { stageAirReadiness } = require(join(UTILS, "stageAirReadiness.ts"));
const { towerTargetOptions } = require(join(UTILS, "towerTarget.ts"));
const { waveRejectNotice } = require(join(UTILS, "waveReject.ts"));

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

// ── 測試資料（路線和 Godot 測試的飛行路線無效組相同）──
const ENEMIES = [
  {
    enemy_id: "bird",
    name: "飛鳥",
    hp: 30,
    speed: 40,
    movement_type: "flying",
  },
  {
    enemy_id: "pad",
    name: "怪鳥",
    hp: 30,
    speed: 40,
    movement_type: " flying ",
  },
  {
    enemy_id: "foot",
    name: "步兵",
    hp: 50,
    speed: 60,
    movement_type: "ground",
  },
  {
    enemy_id: "caps",
    name: "大寫",
    hp: 50,
    speed: 60,
    movement_type: "Flying",
  },
];
const PATHS = {
  paths: {
    path_a: [
      [0, 5],
      [4, 5],
      [4, 2],
      [9, 2],
      [9, 5],
      [13, 5],
    ],
    path_loop: [
      [0, 5],
      [4, 5],
      [4, 2],
      [0, 2],
      [0, 5],
    ],
    path_dup: [
      [3, 9],
      [3, 9],
    ],
    path_single: [[6, 2]],
    path_short: [
      [10, 3],
      [11, 3],
    ],
    path_float: [
      [2.9, 4],
      [2.1, 4.8],
    ],
    path_odd: [
      ["x", 1],
      [5, 5],
    ],
    path_empty: [],
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
const g = (enemy_id, count, path = "path_a", extra = {}) => ({
  enemy_id,
  count,
  interval: 1,
  path,
  ...extra,
});
const groupsOf = (p, wave = 1) => p.waves[wave - 1].groups;

block("路線座標", () => {
  const pts = stagePathPoints(PATHS);
  check(
    "座標-1 paths 物件：每條有路點的路線都列出（空的 path_empty 不列），和 stagePathIds 相同",
    same(Object.keys(pts), [
      "path_a",
      "path_loop",
      "path_dup",
      "path_single",
      "path_short",
      "path_float",
      "path_odd",
    ]) && same(stagePathIds(PATHS), Object.keys(pts)),
    Object.keys(pts)
  );
  check(
    "座標-2 和 Godot 的 int() 相同：小數取整數部分（2.9→2、4.8→4）；無法確定的座標是 null",
    same(pts.path_float, [
      [2, 4],
      [2, 4],
    ]) && same(pts.path_odd, [null, [5, 5]]),
    { float: pts.path_float, odd: pts.path_odd }
  );
  const arr = stagePathPoints({
    paths: [[1, 1], "bad", [3, "4"], [5]],
  });
  const legacy = stagePathPoints(JSON.stringify({ waypoints: [[1, 2]] }));
  check(
    "座標-3 paths 陣列只取 [x, y] 形式的點（視為 path_a，純整數字串可判讀）；舊版 waypoints 與 JSON 字串照常；壞的 JSON 沒有路線",
    same(arr, {
      path_a: [
        [1, 1],
        [3, 4],
      ],
    }) &&
      same(legacy, { path_a: [[1, 2]] }) &&
      same(stagePathPoints("{bad"), {}),
    { arr, legacy }
  );
  check(
    "座標-4 飛行路線的問題：一個路點 → flight_single_point；起終點同格 → flight_same_endpoints；相鄰兩格 → 沒有問題；起點或終點無法判讀 → unknown",
    flightRouteProblem(pts.path_single) === "flight_single_point" &&
      flightRouteProblem(pts.path_loop) === "flight_same_endpoints" &&
      flightRouteProblem(pts.path_dup) === "flight_same_endpoints" &&
      flightRouteProblem(pts.path_float) === "flight_same_endpoints" &&
      flightRouteProblem(pts.path_short) === null &&
      flightRouteProblem(pts.path_a) === null &&
      flightRouteProblem(pts.path_odd) === "unknown"
  );
});

block("敵軍預覽", () => {
  const all = buildStagePreview(
    map([
      {
        wave: 1,
        enemies: [
          g("bird", 2, "path_loop"),
          g("pad", 1, "path_dup"),
          g("bird", 3, "path_single"),
        ],
      },
    ]),
    ENEMIES
  );
  const w1 = all.waves[0];
  check(
    "預覽-1 飛行組全部無效（環狀、兩個相同路點、只有一個路點）：三組都「遊戲會略過」並寫明原因、數量不算；這一波會被拒絕、沒有總數；本關不算有飛行敵人",
    same(
      w1.groups.map((x) => [x.outcome, x.count, x.flightProblem]),
      [
        ["skip", null, "flight_same_endpoints"],
        ["skip", null, "flight_same_endpoints"],
        ["skip", null, "flight_single_point"],
      ]
    ) &&
      w1.groups.every((x) =>
        x.notes.some((n) => /遊戲會略過這一組/.test(n) && /飛行路線/.test(n))
      ) &&
      /起點和終點是同一格/.test(w1.groups[0].notes.join()) &&
      /只有一個路點/.test(w1.groups[2].notes.join()) &&
      w1.rejected &&
      w1.total === null &&
      all.flying === false,
    w1
  );
  const mixed = buildStagePreview(
    map([
      {
        wave: 1,
        enemies: [
          g("bird", 2, "path_loop"),
          g("bird", 1),
          g("foot", 3),
          g("bird", 2, "path_short"),
        ],
      },
    ]),
    ENEMIES
  );
  check(
    "預覽-2 同一波混合：無效的飛行組略過，合法的飛行（折線路線、相鄰兩格的短路線）與地面照常；這一波 6 隻、不拒絕、有飛行敵人",
    same(
      groupsOf(mixed).map((x) => [x.outcome, x.count]),
      [
        ["skip", null],
        ["spawn", 1],
        ["spawn", 3],
        ["spawn", 2],
      ]
    ) &&
      mixed.waves[0].total === 6 &&
      !mixed.waves[0].rejected &&
      mixed.flying === true,
    groupsOf(mixed)
  );
  const ground = buildStagePreview(
    map([
      {
        wave: 1,
        enemies: [
          g("foot", 2, "path_loop"),
          g("caps", 1, "path_dup"),
          g("foot", 1, "path_single"),
        ],
      },
    ]),
    ENEMIES
  );
  check(
    "預覽-3 地面不套用飛行規則：地面的環狀路線、兩個相同路點、單一路點（大小寫不同的 Flying 也是地面）都照常出兵，沒有飛行路線的說明",
    same(
      groupsOf(ground).map((x) => [x.outcome, x.count, x.flightProblem]),
      [
        ["spawn", 2, null],
        ["spawn", 1, null],
        ["spawn", 1, null],
      ]
    ) &&
      !groupsOf(ground).some((x) => x.notes.some((n) => /飛行路線/.test(n))) &&
      ground.waves[0].total === 4,
    groupsOf(ground)
  );
  const odd = buildStagePreview(
    map([
      {
        wave: 1,
        enemies: [g("bird", 2, "path_odd"), g("foot", 1)],
      },
    ]),
    ENEMIES
  );
  check(
    "預覽-4 飛行路線的座標無法判讀：這一組「無法判斷」（不說會略過、也不給數量），這一波沒有確定的總數",
    groupsOf(odd)[0].outcome === "unknown" &&
      groupsOf(odd)[0].count === null &&
      groupsOf(odd)[0].flightProblem === null &&
      /座標無法判讀/.test(groupsOf(odd)[0].notes.join()) &&
      odd.waves[0].total === null,
    groupsOf(odd)
  );
  const order = buildStagePreview(
    map([
      {
        wave: 1,
        enemies: [
          g("bird", "x", "path_loop"),
          g("ghost", 2, "path_loop"),
          g("bird", 2, "path_empty"),
          g("bird", 0, "path_single"),
        ],
      },
    ]),
    ENEMIES
  );
  check(
    "預覽-5 檢查順序和 Godot 相同：飛行路線在數量之前（數量無法判讀的無效飛行組是「會略過」而不是「無法判斷」）；找不到設定、路線沒有路點時不再看飛行路線；數量 0 的無效飛行組原因是飛行路線",
    same(
      groupsOf(order).map((x) => [x.outcome, x.flightProblem]),
      [
        ["skip", "flight_same_endpoints"],
        ["skip", null],
        ["skip", null],
        ["skip", "flight_single_point"],
      ]
    ) &&
      order.waves[0].rejected &&
      /找不到敵人設定/.test(groupsOf(order)[1].notes.join()) &&
      /沒有路點/.test(groupsOf(order)[2].notes.join()),
    groupsOf(order)
  );
});

block("對空提醒", () => {
  const m = map([
    { wave: 1, enemies: [g("bird", 2, "path_loop"), g("foot", 2)] },
    { wave: 2, enemies: [g("bird", 1), g("pad", 4, "path_single")] },
  ]);
  const r = stageAirReadiness(m, ENEMIES, [], []);
  check(
    "提醒-1 路線無效的飛行組另外列出（第 1 波飛鳥 path_loop 起終點同格、第 2 波怪鳥 path_single 只有一個路點），不算進飛行敵人：飛行只有第 2 波飛鳥 ×1、總數 1",
    r.kind === "flying" &&
      same(r.flyingWaves, [
        { wave: 2, groups: [{ name: "飛鳥", count: 1 }] },
      ]) &&
      r.flyingTotal === 1 &&
      same(r.invalidFlying, [
        {
          wave: 1,
          name: "飛鳥",
          path: "path_loop",
          reason: "flight_same_endpoints",
        },
        {
          wave: 2,
          name: "怪鳥",
          path: "path_single",
          reason: "flight_single_point",
        },
      ]) &&
      r.incomplete.length === 0,
    r
  );
  const only = stageAirReadiness(
    map([{ wave: 1, enemies: [g("bird", 3, "path_dup"), g("foot", 1)] }]),
    ENEMIES,
    [],
    []
  );
  check(
    "提醒-2 飛行組全部路線無效：沒有會出現的飛行敵人（kind ground、沒有總數），但另外列出無效的組（提醒元件仍會顯示）",
    only.kind === "ground" &&
      only.flyingWaves.length === 0 &&
      only.flyingTotal === null &&
      only.invalidFlying.length === 1 &&
      only.invalidFlying[0].reason === "flight_same_endpoints",
    only
  );
  const frozen = deepFreeze(JSON.parse(JSON.stringify(m)));
  const fr = stageAirReadiness(frozen, deepFreeze([...ENEMIES]), [], []);
  check(
    "提醒-3 凍結的輸入照常計算（不修改關卡、敵人資料）",
    fr.invalidFlying.length === 2 && fr.flyingTotal === 1
  );
});

block("目標優先選項", () => {
  const four = ["first", "strongest", "weakest", "air_first"];
  const archer = towerTargetOptions("archer", four);
  const scholar = towerTargetOptions("scholar", four);
  check(
    "選項-1 弓兵塔：Godot 列出四種時顯示四個選項，第四個是「優先飛行」，說明是先打射程內的飛行、沒有就打地面",
    same(
      archer.map((o) => o.mode),
      four
    ) &&
      archer[3].label === "優先飛行" &&
      /先打飛行/.test(archer[3].hint) &&
      /沒有飛行就打地面/.test(archer[3].hint),
    archer
  );
  check(
    "選項-2 文士塔：四個選項的說明都是「減速」，不出現「打」（文士塔不造成傷害）",
    scholar.length === 4 &&
      scholar.every((o) => /減速/.test(o.hint) && !/打/.test(o.hint)) &&
      /先減速飛行/.test(scholar[3].hint),
    scholar
  );
  const infantry = towerTargetOptions("infantry", [
    "first",
    "strongest",
    "weakest",
  ]);
  const oldGame = towerTargetOptions("archer", undefined);
  const odd = towerTargetOptions("archer", ["first", "sideways", 3]);
  check(
    "選項-3 選項以 Godot 的 target_modes 為準：步兵塔三種；沒有 target_modes（舊遊戲）的弓兵塔也只顯示三種；不認得的值不顯示",
    same(
      infantry.map((o) => o.mode),
      ["first", "strongest", "weakest"]
    ) &&
      same(
        oldGame.map((o) => o.mode),
        ["first", "strongest", "weakest"]
      ) &&
      same(
        odd.map((o) => o.mode),
        ["first"]
      ),
    { infantry, oldGame, odd }
  );
});

block("拒絕開戰提示", () => {
  const msg = {
    __godot_bridge: true,
    type: "wave_rejected",
    battle_id: "b-1",
    wave: 2,
    missing: false,
    skipped: [
      {
        index: 1,
        enemy_id: "bird",
        path: "path_loop",
        reason: "flight_same_endpoints",
      },
      {
        index: 3,
        enemy_id: "ghost",
        path: "path_a",
        reason: "enemy_not_found",
      },
      { index: 4, enemy_id: "bird", path: "p", reason: "constructor" },
    ],
  };
  const n = waveRejectNotice(msg, "b-1", ENEMIES);
  check(
    "提示-1 目前這一場的 wave_rejected：第 2 波，逐組列出（敵人名稱、路線、原因）；不認得的原因代碼（包括 constructor 這類內建名稱）顯示「設定無效」",
    n &&
      n.wave === 2 &&
      same(n.lines, [
        "第 1 組 飛鳥（路線 path_loop）：飛行路線的起點和終點是同一格",
        "第 3 組 ghost（路線 path_a）：找不到敵人設定",
        "第 4 組 飛鳥（路線 p）：設定無效",
      ]),
    n
  );
  check(
    "提示-2 不是這一場（battle_id 不同、缺少、空白）、波次不是正整數、類型不同都不採用",
    waveRejectNotice(msg, "b-2", ENEMIES) === null &&
      waveRejectNotice({ ...msg, battle_id: undefined }, "b-1") === null &&
      waveRejectNotice({ ...msg, battle_id: "" }, "") === null &&
      waveRejectNotice({ ...msg, wave: 0 }, "b-1") === null &&
      waveRejectNotice({ ...msg, wave: "2" }, "b-1") === null &&
      waveRejectNotice({ ...msg, type: "update_stats" }, "b-1") === null
  );
  const missing = waveRejectNotice(
    { ...msg, missing: true, skipped: [] },
    "b-1"
  );
  const empty = waveRejectNotice({ ...msg, skipped: [] }, "b-1");
  const many = waveRejectNotice(
    {
      ...msg,
      skipped: Array.from({ length: 9 }, (_, i) => ({
        index: i + 1,
        enemy_id: "bird",
        path: "path_dup",
        reason: "flight_same_endpoints",
      })),
    },
    "b-1",
    ENEMIES
  );
  check(
    "提示-3 缺波次顯示「關卡資料沒有第 2 波」；沒有逐組原因時顯示這一波沒有可以出兵的敵人組；超過 6 組只列 6 組，另外寫「另有 3 組」",
    same(missing?.lines, ["關卡資料沒有第 2 波"]) &&
      same(empty?.lines, ["這一波沒有可以出兵的敵人組"]) &&
      many?.lines.length === 7 &&
      many.lines[6] === "另有 3 組無法出兵",
    { missing, empty, many }
  );
});

const failed = results.filter((r) => !r.pass).length;
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      total: results.length,
      failed,
      module:
        "stagePreview.ts／stageAirReadiness.ts／towerTarget.ts／waveReject.ts",
    })
);
process.exit(failed ? 1 : 0);
