// 地面路線沒有路程與戰場內「下一波」的網頁端規則測試，不需要瀏覽器：
// - utils/stagePreview：地面組的路線只有一個路點、或所有路點同一格（總路程 0）時遊戲會略過（原因代碼和 Godot 相同）；
//   看總路程、不看起終點：地面的環狀路線與短路線照常；座標無法判讀時「無法判斷」，不猜；檢查順序和 Godot 相同；飛行規則不變
// - utils/waveReject：地面的原因代碼轉成文字，和飛行的原因分得開
// - utils/stageAirReadiness：地面組被略過或整波被拒絕時，飛行敵人的數量照同一份預覽
// - utils/nextWave：下一波＝這一場 update_stats 的 wave＋1；沒有這一場的戰況時等待；最後一波、缺波次、整波被拒絕、
//   數量無法確定、關卡沒有波次（遊戲會拒絕第 1 波）各自分開；對空提醒只看這一波
// 用法：node scripts/shenma-regression/web/next-wave.test.mjs
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

const { buildStagePreview, stagePathPoints, groundRouteProblem } = require(
  join(UTILS, "stagePreview.ts")
);
const { stageAirReadiness, previewAirReadiness } = require(
  join(UTILS, "stageAirReadiness.ts")
);
const { waveRejectNotice } = require(join(UTILS, "waveReject.ts"));
const { nextWaveView } = require(join(UTILS, "nextWave.ts"));

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

// ── 測試資料（地面路線和 Godot 測試的地面路線組相同）──
const ENEMIES = [
  {
    enemy_id: "bird",
    name: "飛鳥",
    hp: 30,
    speed: 40,
    movement_type: "flying",
  },
  {
    enemy_id: "foot",
    name: "步兵",
    hp: 50,
    speed: 60,
    movement_type: "ground",
  },
  { enemy_id: "old", name: "舊兵", hp: 70, speed: 50 },
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
    path_dup3: [
      [5, 9],
      [5, 9],
      [5, 9],
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
    path_odd_mid: [
      [5, 5],
      ["x", 1],
      [5, 5],
    ],
    path_odd_known: [
      ["x", 1],
      [5, 5],
      [6, 5],
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
const brief = (gs) =>
  gs.map((x) => [x.outcome, x.count, x.flightProblem, x.groundProblem]);

block("地面路線", () => {
  const pts = stagePathPoints(PATHS);
  check(
    "地面-1 地面路線的問題看總路程：一個路點 → ground_single_point；兩個、三個相同路點與取整數後同格 → ground_zero_length；相鄰兩格、環狀路線、折線 → 沒有問題；座標無法判讀而能判讀的都同格 → unknown；能判讀的有兩格不同 → 沒有問題",
    groundRouteProblem(pts.path_single) === "ground_single_point" &&
      groundRouteProblem(pts.path_dup) === "ground_zero_length" &&
      groundRouteProblem(pts.path_dup3) === "ground_zero_length" &&
      groundRouteProblem(pts.path_float) === "ground_zero_length" &&
      groundRouteProblem(pts.path_short) === null &&
      groundRouteProblem(pts.path_loop) === null &&
      groundRouteProblem(pts.path_a) === null &&
      groundRouteProblem(pts.path_odd) === "unknown" &&
      groundRouteProblem(pts.path_odd_mid) === "unknown" &&
      groundRouteProblem(pts.path_odd_known) === null,
    pts
  );

  const all = buildStagePreview(
    map([
      {
        wave: 1,
        enemies: [
          g("foot", 2, "path_single"),
          g("foot", 1, "path_dup"),
          g("old", 3, "path_dup3"),
        ],
      },
    ]),
    ENEMIES
  );
  const w1 = all.waves[0];
  check(
    "地面-2 地面組全部無效（單一路點、兩個相同路點、三個相同路點；沒有 movement_type 的也是地面）：三組「遊戲會略過」並寫明地面路線的原因、數量不算；這一波會被拒絕、沒有總數",
    same(brief(w1.groups), [
      ["skip", null, null, "ground_single_point"],
      ["skip", null, null, "ground_zero_length"],
      ["skip", null, null, "ground_zero_length"],
    ]) &&
      w1.groups.every((x) =>
        x.notes.some((n) => /遊戲會略過這一組/.test(n) && /地面路線/.test(n))
      ) &&
      /只有一個路點/.test(w1.groups[0].notes.join()) &&
      /都在同一格/.test(w1.groups[1].notes.join()) &&
      w1.rejected &&
      w1.total === null &&
      all.total === null,
    w1
  );

  const mixed = buildStagePreview(
    map([
      {
        wave: 1,
        enemies: [
          g("foot", 5, "path_single"),
          g("foot", 2, "path_loop"),
          g("old", 4, "path_dup"),
          g("foot", 1, "path_short"),
          g("bird", 3),
        ],
      },
    ]),
    ENEMIES
  );
  check(
    "地面-3 同一波混合：無效的地面組略過，地面的環狀路線、短路線與飛行照常；這一波 6 隻（無效組的 9 隻不算）、不拒絕",
    same(brief(groupsOf(mixed)), [
      ["skip", null, null, "ground_single_point"],
      ["spawn", 2, null, null],
      ["skip", null, null, "ground_zero_length"],
      ["spawn", 1, null, null],
      ["spawn", 3, null, null],
    ]) &&
      mixed.waves[0].total === 6 &&
      !mixed.waves[0].rejected &&
      mixed.total === 6,
    groupsOf(mixed)
  );
  check(
    "地面-4 環狀路線與短路線沒有任何路線的說明（不是「無法判斷」也不是略過）",
    [1, 3].every((i) => groupsOf(mixed)[i].notes.length === 0),
    groupsOf(mixed)
  );

  const odd = buildStagePreview(
    map([
      {
        wave: 1,
        enemies: [
          g("foot", 2, "path_odd"),
          g("foot", 1, "path_odd_known"),
          g("foot", 1),
        ],
      },
    ]),
    ENEMIES
  );
  check(
    "地面-5 地面路線的座標無法判讀、能判讀的點都同格：這一組「無法判斷」（不說會略過、不給數量），這一波沒有確定的總數；能判讀的點有兩格不同時照常出兵",
    same(brief(groupsOf(odd)), [
      ["unknown", null, null, null],
      ["spawn", 1, null, null],
      ["spawn", 1, null, null],
    ]) &&
      /座標無法判讀/.test(groupsOf(odd)[0].notes.join()) &&
      !odd.waves[0].rejected &&
      odd.waves[0].total === null,
    groupsOf(odd)
  );

  const order = buildStagePreview(
    map([
      {
        wave: 1,
        enemies: [
          g("foot", "x", "path_single"),
          g("ghost", 2, "path_single"),
          g("foot", 2, "path_empty"),
          g("foot", 0, "path_dup"),
          g("foot", 0),
        ],
      },
    ]),
    ENEMIES
  );
  check(
    "地面-6 檢查順序和 Godot 相同：地面路線在數量之前（數量無法判讀、數量 0 的無效地面組原因是地面路線）；找不到設定、路線沒有路點時不再看地面路線；路線有效而數量 0 時原因是數量",
    same(brief(groupsOf(order)), [
      ["skip", null, null, "ground_single_point"],
      ["skip", null, null, null],
      ["skip", null, null, null],
      ["skip", null, null, "ground_zero_length"],
      ["skip", null, null, null],
    ]) &&
      /找不到敵人設定/.test(groupsOf(order)[1].notes.join()) &&
      /沒有路點/.test(groupsOf(order)[2].notes.join()) &&
      /數量是 0/.test(groupsOf(order)[4].notes.join()) &&
      order.waves[0].rejected,
    groupsOf(order)
  );

  const fly = buildStagePreview(
    map([
      {
        wave: 1,
        enemies: [
          g("bird", 2, "path_loop"),
          g("bird", 1, "path_single"),
          g("bird", 1, "path_short"),
        ],
      },
    ]),
    ENEMIES
  );
  check(
    "地面-7 飛行規則不變：飛行組不套用地面規則（環狀路線、單一路點仍是飛行的原因），相鄰兩格的飛行照常",
    same(brief(groupsOf(fly)), [
      ["skip", null, "flight_same_endpoints", null],
      ["skip", null, "flight_single_point", null],
      ["spawn", 1, null, null],
    ]),
    groupsOf(fly)
  );
});

block("拒絕開戰的原因", () => {
  const n = waveRejectNotice(
    {
      type: "wave_rejected",
      battle_id: "b1",
      wave: 2,
      missing: false,
      skipped: [
        {
          index: 1,
          enemy_id: "foot",
          path: "path_single",
          reason: "ground_single_point",
        },
        {
          index: 2,
          enemy_id: "old",
          path: "path_dup",
          reason: "ground_zero_length",
        },
        {
          index: 3,
          enemy_id: "bird",
          path: "path_loop",
          reason: "flight_same_endpoints",
        },
      ],
    },
    "b1",
    ENEMIES
  );
  check(
    "原因-1 地面的原因代碼有自己的文字（只有一個路點、路點都在同一格），和飛行的原因分得開；不是「設定無效」",
    !!n &&
      n.wave === 2 &&
      same(n.lines, [
        "第 1 組 步兵（路線 path_single）：地面路線只有一個路點",
        "第 2 組 舊兵（路線 path_dup）：地面路線的路點都在同一格（沒有路程）",
        "第 3 組 飛鳥（路線 path_loop）：飛行路線的起點和終點是同一格",
      ]),
    n
  );
});

block("對空提醒", () => {
  const m = map([
    { wave: 1, enemies: [g("foot", 3, "path_single"), g("bird", 2)] },
    {
      wave: 2,
      enemies: [g("foot", 1, "path_dup3"), g("bird", 4, "path_loop")],
    },
  ]);
  const r = stageAirReadiness(m, ENEMIES, [], []);
  check(
    "提醒-1 地面組被略過不影響飛行的數量（第 1 波飛鳥 ×2）；第 2 波的地面組無效、飛行組路線無效 → 整波被拒絕，飛行組另外列為路線無效，不算進飛行敵人",
    r.kind === "flying" &&
      same(r.flyingWaves, [
        { wave: 1, groups: [{ name: "飛鳥", count: 2 }] },
      ]) &&
      r.flyingTotal === 2 &&
      same(
        r.invalidFlying.map((x) => [x.wave, x.reason]),
        [[2, "flight_same_endpoints"]]
      ),
    r
  );
});

// ── 下一波 ──
const PREP = 1;
const BATTLE = 2;
const RESULT = 3;
const stats = (wave, total, state = PREP, battle_id = "b1") => ({
  battle_id,
  wave,
  total_waves: total,
  game_state: state,
});
const THREE = map([
  { wave: 1, enemies: [g("foot", 3), g("foot", 2, "path_loop")] },
  {
    wave: 2,
    enemies: [
      g("bird", 3),
      g("bird", 1, "path_single"),
      g("foot", 2, "path_single"),
    ],
  },
  { wave: 3, enemies: [g("bird", 1), g("foot", 1)] },
]);
const battle = (m = THREE, battleId = "b1", enemies = ENEMIES) => ({
  battleId,
  map: m,
  enemies,
});

block("下一波", () => {
  const b = battle();
  const waiting = [
    nextWaveView(null, b),
    nextWaveView(stats(0, 3), null),
    nextWaveView(stats(0, 3, PREP, "old"), b),
    nextWaveView({ wave: 0, total_waves: 3, game_state: PREP }, b),
    nextWaveView(stats(0, 3, 0), b),
    nextWaveView(stats(-1, 3), b),
    nextWaveView(stats(1.5, 3), b),
    nextWaveView(stats(0, "3"), b),
  ];
  check(
    "下一波-1 沒有這一場的有效戰況時等待：沒有戰況、沒有這一場的設定、上一場的 battle_id、缺 battle_id、遊戲還在等待、波次不是非負整數",
    waiting.every((v) => v.status === "waiting"),
    waiting
  );

  const v0 = nextWaveView(stats(0, 3, PREP), b);
  check(
    "下一波-2 初始備戰（wave 0）：下一波是第 1 波，共 3 波；只有第 1 波的兩組（地面 3＋環狀路線 2＝5 隻）",
    v0.status === "wave" &&
      v0.next === 1 &&
      v0.current === 0 &&
      v0.total === 3 &&
      v0.phase === "prep" &&
      v0.wave.wave === 1 &&
      v0.wave.total === 5 &&
      same(
        v0.wave.groups.map((x) => [x.enemyId, x.count, x.movement.value]),
        [
          ["foot", 3, "ground"],
          ["foot", 2, "ground"],
        ]
      ) &&
      v0.scoped.waves.length === 1 &&
      v0.dataWaves === 3,
    v0
  );
  const v1 = nextWaveView(stats(1, 3, BATTLE), b);
  const v1p = nextWaveView(stats(1, 3, PREP), b);
  check(
    "下一波-3 第 1 波戰鬥中與第 1 波清完的備戰：下一波都是第 2 波（階段分開：battle／prep）；第 2 波只算飛鳥 ×3（路線無效的飛行、地面組略過）",
    v1.status === "wave" &&
      v1.next === 2 &&
      v1.phase === "battle" &&
      v1p.status === "wave" &&
      v1p.next === 2 &&
      v1p.phase === "prep" &&
      v1.wave.total === 3 &&
      same(brief(v1.wave.groups), [
        ["spawn", 3, null, null],
        ["skip", null, "flight_single_point", null],
        ["skip", null, null, "ground_single_point"],
      ]),
    { v1, v1p }
  );
  const last = nextWaveView(stats(3, 3, BATTLE), b);
  const none = nextWaveView(stats(0, 0, PREP), b);
  check(
    "下一波-4 最後一波戰鬥中：已是最後一波（沒有下一波）；遊戲的總波數是 0 時也沒有下一波",
    last.status === "last" &&
      last.current === 3 &&
      last.total === 3 &&
      none.status === "last" &&
      none.total === 0,
    { last, none }
  );
  check(
    "下一波-5 結算中（game_state 3）：ended",
    nextWaveView(stats(2, 3, RESULT), b).status === "ended"
  );

  const gap = battle(
    map([
      { wave: 1, enemies: [g("foot", 1)] },
      { wave: 3, enemies: [g("foot", 1)] },
    ])
  );
  const vg = nextWaveView(stats(1, 3, PREP), gap);
  check(
    "下一波-6 缺波次不是沒有下一波：第 2 波沒有資料 → 下一波是第 2 波、標成沒有資料、遊戲會拒絕開始",
    vg.status === "wave" &&
      vg.next === 2 &&
      vg.wave.missing &&
      vg.wave.rejected &&
      vg.wave.total === null,
    vg
  );

  const rej = battle(
    map([
      { wave: 1, enemies: [g("foot", 1)] },
      {
        wave: 2,
        enemies: [g("foot", 2, "path_dup"), g("bird", 1, "path_loop")],
      },
    ])
  );
  const vr = nextWaveView(stats(1, 2, PREP), rej);
  check(
    "下一波-7 下一波的組全部無效：這一波會被拒絕（不是沒有下一波），各組帶原因（地面：路點同格；飛行：起終點同格）",
    vr.status === "wave" &&
      vr.next === 2 &&
      !vr.wave.missing &&
      vr.wave.rejected &&
      same(brief(vr.wave.groups), [
        ["skip", null, null, "ground_zero_length"],
        ["skip", null, "flight_same_endpoints", null],
      ]),
    vr
  );

  const unk = battle(
    map([
      { wave: 1, enemies: [g("foot", "三隻"), g("bird", 1)] },
      { wave: 2, enemies: [g("foot", 1)] },
    ])
  );
  const vu = nextWaveView(stats(0, 2, PREP), unk);
  check(
    "下一波-8 數量無法判讀：這一組「無法判斷」、這一波沒有確定的總數，不當成 0 也不被拒絕",
    vu.status === "wave" &&
      vu.wave.total === null &&
      !vu.wave.rejected &&
      vu.wave.groups[0].outcome === "unknown" &&
      vu.wave.groups[0].count === null,
    vu
  );

  // 遊戲收到沒有波次的關卡：總波數 0、打第 1 波時拒絕（不改用內建的測試波次）
  const noWaves = nextWaveView(stats(0, 0, PREP), battle(map([])));
  const noArray = nextWaveView(
    stats(0, 0, PREP),
    battle({ ...map([]), waves: null })
  );
  check(
    "下一波-9 關卡資料沒有波次（遊戲總波數 0、會拒絕第 1 波）：說明會拒絕開戰、無法預覽；不當成沒有下一波，也不說成改用內建的波次",
    noWaves.status === "unknown" &&
      noWaves.next === 1 &&
      noWaves.total === 0 &&
      /拒絕開始第 1 波/.test(noWaves.reason) &&
      !/改用內建/.test(noWaves.reason) &&
      noArray.status === "unknown" &&
      noArray.next === 1,
    { noWaves, noArray }
  );

  const short = nextWaveView(
    stats(2, 3, PREP),
    battle(
      map([
        { wave: 1, enemies: [g("foot", 1)] },
        { wave: 2, enemies: [g("foot", 1)] },
      ])
    )
  );
  check(
    "下一波-10 遊戲的總波數比關卡資料多（例如資料有無法判讀的編號）：下一波照遊戲的波數，標成沒有資料，並記下資料只有 2 波",
    short.status === "wave" &&
      short.next === 3 &&
      short.wave.missing &&
      short.dataWaves === 2 &&
      short.total === 3,
    short
  );

  const team = [{ slot: 1, hero_id: "h_arch" }];
  const heroes = [{ hero_id: "h_arch", name: "弓手", job: "archer" }];
  const a1 = previewAirReadiness(v0.scoped, team, heroes);
  const a2 = previewAirReadiness(v1.scoped, team, heroes);
  const a3 = previewAirReadiness(
    nextWaveView(stats(2, 3, BATTLE), b).scoped,
    [],
    heroes
  );
  const whole = stageAirReadiness(THREE, ENEMIES, team, heroes);
  check(
    "下一波-11 對空提醒只看這一波：第 1 波只有地面（ground，不提其他波的飛行）；第 2 波飛鳥 ×3、路線無效的只列第 2 波的那一組；第 3 波飛鳥 ×1；整關則是第 2、3 波共 4 隻",
    a1.kind === "ground" &&
      a1.flyingWaves.length === 0 &&
      a1.invalidFlying.length === 0 &&
      a2.kind === "flying" &&
      same(a2.flyingWaves, [
        { wave: 2, groups: [{ name: "飛鳥", count: 3 }] },
      ]) &&
      a2.flyingTotal === 3 &&
      same(
        a2.invalidFlying.map((x) => [x.wave, x.reason]),
        [[2, "flight_single_point"]]
      ) &&
      a2.team.status === "ready" &&
      same(a2.team.airHeroes, ["弓手"]) &&
      a3.kind === "flying" &&
      a3.flyingTotal === 1 &&
      a3.team.status === "empty" &&
      whole.flyingTotal === 4,
    { a1, a2, a3, whole: whole.flyingWaves }
  );
  const vmiss = previewAirReadiness(vg.scoped, [], []);
  check(
    "下一波-12 缺波次的那一波：對空提醒是「資料不完整」（無法確認有沒有飛行），不是確定沒有飛行",
    vmiss.kind === "unclear" &&
      vmiss.incomplete.some((x) => /第 2 波沒有資料/.test(x)),
    vmiss
  );

  const frozenBattle = deepFreeze(JSON.parse(JSON.stringify(battle())));
  const vf = nextWaveView(deepFreeze(stats(1, 3, BATTLE)), frozenBattle);
  const other = nextWaveView(
    stats(1, 3, BATTLE),
    battle(
      THREE,
      "b1",
      ENEMIES.filter((e) => e.enemy_id !== "bird")
    )
  );
  check(
    "下一波-13 凍結的輸入照常計算（不修改戰況與關卡）；敵人名稱與設定取自這一場送進遊戲的敵人設定（這一場沒有飛鳥時標成找不到設定）",
    vf.status === "wave" &&
      vf.wave.total === 3 &&
      other.status === "wave" &&
      other.wave.groups[0].name === null &&
      /找不到敵人設定/.test(other.wave.groups[0].notes.join()),
    { vf, other }
  );
});

block("自動模式", () => {
  const b = battle();
  const pending = nextWaveView(
    { ...stats(1, 3, BATTLE), auto_next_wave_pending: true },
    b
  );
  const running = nextWaveView(stats(1, 3, BATTLE), b);
  const prep = nextWaveView(
    { ...stats(1, 3, PREP), auto_next_wave_pending: true },
    b
  );
  check(
    "下一波-14 自動模式清波後等待開下一波（仍是戰鬥狀態）：下一波仍是第 2 波、標成即將自動開始；一般戰鬥中與備戰中不標",
    pending.status === "wave" &&
      pending.next === 2 &&
      pending.autoPending === true &&
      running.autoPending === false &&
      prep.autoPending === false,
    { pending, running, prep }
  );
});

const failed = results.filter((r) => !r.pass).length;
console.log(
  "RESULT_JSON " +
    JSON.stringify({ total: results.length, failed, results: results })
);
process.exit(failed > 0 ? 1 : 0);
