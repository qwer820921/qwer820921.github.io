// 敵軍預覽的路線預覽與波次導覽的網頁端規則測試，不需要瀏覽器：
// - utils/stageRouteMap：路點只用 stagePathPoints（paths 物件、paths 陣列、舊版 waypoints）；地圖尺寸要是 1～上限的整數，
//   缺少、無法判讀或過大時不畫格子（不補造尺寸）；無法判讀與超出地圖的路點切斷折線、不把前後兩點連起來；
//   起點／終點只標有效且在地圖內的第一個／最後一個路點；飛行路線和預覽的飛行判讀相同；不改輸入
// - utils/waveNav：資料問題＝沒有資料／遊戲會拒絕／資料不完整（重複的波次照預覽只用第一筆，本身不算問題）；
//   下一個資料問題依波次編號往後找、到底從頭找、沒有問題時是 null；設定更新後只保留還存在的波次（依編號，不依索引）
// 用法：node scripts/shenma-regression/web/stage-route.test.mjs
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
  MAX_ROUTE_MAP_SIDE,
  flyingRouteIds,
  routeProblems,
  routeSummary,
  stageRouteMap,
} = require(join(UTILS, "stageRouteMap.ts"));
const { keepExistingWaves, nextProblemWave, problemWaves } = require(
  join(UTILS, "waveNav.ts")
);
const { buildStagePreview } = require(join(UTILS, "stagePreview.ts"));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail).slice(0, 900)}`
  );
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

// ── 路線預覽 ──
// 正式 chapter1_1（黃巾起義）的 path_json 形狀：14×11、path_a 從 [0,8] 到 [13,5]，另有同內容的舊版 waypoints
const PATH_A = [
  [0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [5, 7], [5, 6], [5, 5],
  [5, 4], [5, 3], [5, 2], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1],
  [10, 2], [10, 3], [10, 4], [10, 5], [11, 5], [12, 5], [13, 5],
]; // prettier-ignore
const CH1_1 = deepFreeze({
  map_id: "chapter1_1",
  cols: 14,
  rows: 11,
  paths: { path_a: PATH_A },
  waypoints: PATH_A,
  spawn: [0, 8],
  base: [13, 5],
});
{
  const m = stageRouteMap(CH1_1);
  const r = m.routes[0];
  const asString = stageRouteMap(JSON.stringify(CH1_1));
  check(
    "正式 chapter1_1：14×11 格、一條 path_a（25 個路點、一段折線）、起點 (0, 8)、終點 (13, 5)、沒有資料問題；字串形式的 path_json 結果相同",
    m.cols === 14 &&
      m.rows === 11 &&
      m.sizeProblem === null &&
      same(
        m.routes.map((x) => x.id),
        ["path_a"]
      ) &&
      r.points === 25 &&
      r.segments.length === 1 &&
      r.segments[0].length === 25 &&
      same(r.start, [0, 8]) &&
      same(r.end, [13, 5]) &&
      routeProblems(r, m).length === 0 &&
      routeSummary(r) === "25 個路點，路線起點 (0, 8) → 路線終點 (13, 5)" &&
      same(asString, m),
    { m }
  );
}

{
  const multi = stageRouteMap({
    cols: 14,
    rows: 11,
    paths: {
      path_b: [
        [13, 8],
        [13, 1],
      ],
      path_a: [
        [0, 5],
        [3, 5],
      ],
    },
  });
  const legacy = stageRouteMap({
    cols: 10,
    rows: 10,
    waypoints: [
      [0, 0],
      [9, 9],
    ],
  });
  const arrayForm = stageRouteMap({
    cols: 10,
    rows: 10,
    paths: [
      [1, 1],
      [2, 2],
    ],
  });
  check(
    "多條路線照設定的順序（和 stagePathPoints 相同）；舊版 waypoints 與 paths 陣列都當成 path_a",
    same(
      multi.routes.map((r) => r.id),
      ["path_b", "path_a"]
    ) &&
      same(
        legacy.routes.map((r) => [r.id, r.start, r.end]),
        [["path_a", [0, 0], [9, 9]]]
      ) &&
      same(
        arrayForm.routes.map((r) => [r.id, r.points]),
        [["path_a", 2]]
      ),
    { multi, legacy, arrayForm }
  );
}

{
  const pts = { path_a: PATH_A };
  const missing = stageRouteMap({ paths: pts });
  const bad = ["abc", 0, -3, null, true].map((cols) =>
    stageRouteMap({ cols, rows: 11, paths: pts })
  );
  const huge = stageRouteMap({ cols: 100000, rows: 11, paths: pts });
  const edge = stageRouteMap({
    cols: MAX_ROUTE_MAP_SIDE,
    rows: "11",
    paths: pts,
  });
  check(
    "地圖尺寸缺少、無法判讀（字串、0、負數、null、布林）或過大：不畫格子（cols／rows 是 null、有說明），路線仍有文字說明；上限內的尺寸（含整數字串）照畫",
    missing.cols === null &&
      /沒有地圖尺寸/.test(missing.sizeProblem) &&
      missing.routes[0].points === 25 &&
      same(missing.routes[0].start, [0, 8]) &&
      bad.every((m) => m.cols === null && /無法判讀/.test(m.sizeProblem)) &&
      huge.cols === null &&
      new RegExp(
        `100000×11 超過預覽上限（每邊 ${MAX_ROUTE_MAP_SIDE} 格）`
      ).test(huge.sizeProblem) &&
      edge.cols === MAX_ROUTE_MAP_SIDE &&
      edge.rows === 11 &&
      edge.sizeProblem === null,
    { missing, bad, huge, edge }
  );
}

{
  const broken = stageRouteMap({
    cols: 14,
    rows: 11,
    paths: {
      path_a: [[0, 0], [1, 0], ["x", 1], [3, 0], [4, 0]],
      path_b: [[0, 2], [20, 2], [2, 2], [-1, 3], [3, 3]],
    },
  }); // prettier-ignore
  const [a, b] = broken.routes;
  check(
    "無法判讀的路點與超出地圖（含負數）的路點把折線切斷：前後兩段分開畫，不直接連成一條；各自列出資料問題",
    same(a.segments, [
      [[0, 0], [1, 0]],
      [[3, 0], [4, 0]],
    ]) &&
      a.unreadable === 1 &&
      routeProblems(a, broken).some((p) => /1 個路點的座標無法判讀/.test(p)) &&
      same(b.segments, [[[0, 2]], [[2, 2]], [[3, 3]]]) &&
      b.outside === 2 &&
      routeProblems(b, broken).some((p) => /2 個路點超出地圖（14×11）/.test(p)),
    { broken }
  ); // prettier-ignore
}

{
  const ends = stageRouteMap({
    cols: 5,
    rows: 5,
    paths: {
      path_a: [[null, 0], [1, 1], [2, 2], [9, 9]],
      path_b: [[2, 2]],
    },
  }); // prettier-ignore
  const [a, b] = ends.routes;
  check(
    "第一個路點無法判讀、最後一個路點超出地圖：不標起點／終點並說明；只有一個路點的路線畫成一個點",
    a.start === null &&
      a.end === null &&
      routeProblems(a, ends).includes("第一個路點無法標示，不畫路線起點") &&
      routeProblems(a, ends).includes("最後一個路點無法標示，不畫路線終點") &&
      b.points === 1 &&
      same(b.segments, [[[2, 2]]]) &&
      routeSummary(b) === "只有一個路點 (2, 2)",
    { ends }
  );
}

{
  const none = [
    stageRouteMap({ cols: 14, rows: 11, paths: {} }),
    stageRouteMap({ cols: 14, rows: 11 }),
    stageRouteMap(undefined),
    stageRouteMap("not json"),
    stageRouteMap({ cols: 14, rows: 11, paths: { path_a: [] } }),
  ];
  check(
    "沒有路線（空的 paths、沒有路線欄位、沒有 path_json、無法解析、路線沒有路點）：routes 是空的（畫面寫無法預覽）",
    none.every((m) => m.routes.length === 0),
    { none }
  );
}

{
  // 設定更新：path_b 被刪掉 → 只剩 path_a（畫面上選的 path_b 回到全部）
  const before = stageRouteMap({
    cols: 14,
    rows: 11,
    paths: { path_a: [[0, 1], [5, 1]], path_b: [[0, 8], [5, 8]] },
  }); // prettier-ignore
  const after = stageRouteMap({
    cols: 14,
    rows: 11,
    paths: { path_a: [[0, 1], [6, 1]] },
  }); // prettier-ignore
  check(
    "設定更新後路線跟著更新（刪掉的路線不在、路點換成新的）",
    same(
      before.routes.map((r) => r.id),
      ["path_a", "path_b"]
    ) &&
      same(
        after.routes.map((r) => r.id),
        ["path_a"]
      ) &&
      same(after.routes[0].end, [6, 1]),
    { before, after }
  );
}

// ── 飛行路線、波次導覽（用 buildStagePreview 的結果）──
const ENEMIES = deepFreeze([
  { enemy_id: "grunt", name: "步兵", hp: 300, speed: 80 },
  {
    enemy_id: "flyer",
    name: "飛騎",
    hp: 200,
    speed: 90,
    movement_type: "flying",
  },
]);
const PJ2 = {
  cols: 14,
  rows: 11,
  paths: {
    path_a: [[0, 5], [13, 5]],
    path_b: [[0, 8], [13, 8]],
    path_c: [[0, 1], [13, 1]],
  },
}; // prettier-ignore
const stage = (waves) => ({
  map_id: "t",
  name: "測試",
  chapter: 1,
  unlock_stage: "t",
  path_json: PJ2,
  waves,
});
const grp = (enemy_id, path, count = 1) => ({
  enemy_id,
  path,
  count,
  interval: 1,
});

{
  const p = buildStagePreview(
    stage([
      { wave: 1, enemies: [grp("flyer", "path_b"), grp("grunt", "path_a")] },
      // 飛行組在拒絕的波次（另一組數量 0 → 這一波沒有可以出兵的組）
      { wave: 2, enemies: [{ ...grp("flyer", "path_c"), count: 0 }] },
    ]),
    ENEMIES
  );
  check(
    "飛行路線：只列遊戲會出兵的飛行組走的路線（被略過的飛行組、會被拒絕的波次不算）",
    same(flyingRouteIds(p), ["path_b"]),
    { flying: flyingRouteIds(p) }
  );
}

{
  const waves = deepFreeze([
    { wave: 1, enemies: [grp("grunt", "path_a", 3)] },
    // 第 2 波缺少
    { wave: 3, enemies: [grp("ghost", "path_a")] }, // 找不到設定 → 拒絕
    { wave: 4, enemies: [{ ...grp("grunt", "path_a"), count: "many" }] }, // 數量無法判讀 → 無法確定
    { wave: 5, enemies: [{ enemy_id: "grunt", path: "path_a", count: 2 }] }, // 沒有間隔 → 用預設值（資料不完整）
    { wave: 6, enemies: [grp("grunt", "path_a", 2)] },
    { wave: 6, enemies: [grp("ghost", "path_a")] }, // 重複：遊戲只用第一筆
  ]);
  const p = buildStagePreview(stage(waves), ENEMIES);
  const w6 = p.waves.find((w) => w.wave === 6);
  check(
    "資料問題：缺波、遊戲會拒絕、數量無法確定、用了預設值的波次；正常與只有重複資料的波次不是問題（重複照預覽只用第一筆，數量 2）",
    same(problemWaves(p.waves), [2, 3, 4, 5]) &&
      w6.duplicates === 1 &&
      w6.total === 2,
    { problems: problemWaves(p.waves), w6 }
  );
  check(
    "下一個資料問題：沒有起點從第一個問題開始、依編號往後找、最後一個之後從頭；起點的波次已不存在時照編號找下一個",
    nextProblemWave(p.waves, null) === 2 &&
      nextProblemWave(p.waves, 2) === 3 &&
      nextProblemWave(p.waves, 4) === 5 &&
      nextProblemWave(p.waves, 5) === 2 &&
      nextProblemWave(p.waves, 1) === 2 &&
      nextProblemWave(p.waves, 6) === 2 &&
      nextProblemWave(
        p.waves.filter((w) => w.wave !== 3),
        2
      ) === 4,
    {}
  );
  const clean = buildStagePreview(
    stage([
      { wave: 1, enemies: [grp("grunt", "path_a")] },
      { wave: 2, enemies: [grp("grunt", "path_b", 2)] },
    ]),
    ENEMIES
  );
  check(
    "沒有資料問題：問題清單是空的，下一個資料問題是 null（按鈕停用）",
    problemWaves(clean.waves).length === 0 &&
      nextProblemWave(clean.waves, null) === null &&
      nextProblemWave(clean.waves, 1) === null,
    { problems: problemWaves(clean.waves) }
  );

  // 設定更新：第 4～6 波被刪掉（剩第 1～3 波，第 2 波仍是缺少的資料）；不能依索引跳到別波
  const fewer = buildStagePreview(
    stage(waves.filter((w) => w.wave <= 3)),
    ENEMIES
  );
  const open = [1, 4, 6];
  check(
    "設定更新後只保留還存在的波次（依編號）：全部都在時回傳原陣列；被刪的波次移除、其他照原順序",
    keepExistingWaves(open, p.waves) === open &&
      same(keepExistingWaves(open, fewer.waves), [1]) &&
      same(keepExistingWaves([3, 1], fewer.waves), [3, 1]),
    { fewer: fewer.waves.map((w) => w.wave) }
  );
  check(
    "不改輸入（凍結的設定與波次）",
    same(waves.length, 6) && Object.isFrozen(waves[0]),
    {}
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
