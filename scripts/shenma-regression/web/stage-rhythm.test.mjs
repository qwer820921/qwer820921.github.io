// 敵軍預覽的依路線組成與設定出兵節奏的網頁端規則測試，不需要瀏覽器：
// - utils/stageComposition 的 routeComposition：只看 path 等於選的路線的組，依 enemy_id 合計、第一次出現的順序、記下出兵的波次；
//   全關的出兵都能確定時合計才是這條路線的全部，否則只寫已確認（缺波、遊戲會拒絕、無法確定的組都不補 0）；沒有路點的路線不會出現；
//   各路線已確認的合計加起來等於全關；不改輸入
// - utils/stageComposition 的 waveRouteView（逐波依路線查看）：只列 path 等於選的路線的組，原本的組序與物件不變；已確認只算確定會出兵的組
//   （數量無法確定、略過不補 0）；其他路線的資料問題（略過、無法確定、資料不完整的註記，含沒有路點的路線）另列、不重複；
//   缺波、拒絕、重複照整波；用正式 chapter1_3、chapter1_5 的逐波資料核對各波各路線的隻數；不改預覽與整波出兵節奏
// - utils/stageComposition 的 sortCompositionRows（敵軍組成的排列）：首次出現＝原本的順序；已確認隻數由多到少、同數量維持首次出現；
//   用正式 chapter1_3、chapter1_5 核對全關與兩條路線的順序與合計；同名不同 id 分開、資料問題的組不會變成列；回傳新陣列、不改來源；設定更新後重新排
// - 敵軍組成每一列的 firstWave（前往首次出兵用）：全關與每條路線各自的首次已確認出兵波次（正式 chapter1_3 cavalry_lv2 全關 1、path_a 1、path_b 3；
//   chapter1_5 全關 2、path_a 2、path_b 4）；排列後跟著列走；只有已確認的列有首次，缺波與有問題的組不是首次；設定更新後用新的資料
// - 敵軍組成每一列的 perWave（逐波隻數的明細用）：全關與每條路線各自的逐波已確認隻數，用正式 chapter1_3、chapter1_5 逐列核對（cavalry_lv2 在 chapter1_5
//   全關第 2、3 波各 10、第 4～7 波各 20，path_a 第 2～7 波各 10，path_b 第 4～7 波各 10）；同一波同一敵人多組相加、加起來等於合計、第一筆是首次；
//   缺波、找不到設定、數量無法判讀或 0、略過與重複波次的第二筆都不進逐波（不補 0）；同名不同 id 分開；排列後跟著列走；設定更新後用新的資料
// - utils/stageComposition 的 filterCompositionRows（敵軍組成的搜尋）：名稱或 enemy_id 包含查詢（去掉前後空白、不分大小寫），只篩選目前範圍已排列的列；
//   用正式 chapter1_3、chapter1_5（正式名稱）六個範圍核對符合的列、種數與小計；路線不借全關的；同類不同等級、同名不同 id 分開；資料問題的組沒有列也搜不到
// - sortCompositionRows 的 waves（依已確認出兵的波數）：perWave 筆數由多到少、同波數依首次出現；正式六個範圍的順序與波數寫死；同一波多組只算一波、
//   資料問題的組不算波；只改順序（合計、首次、逐波不變、新陣列不改來源）；和依隻數的順序不同的例子
// - 敵軍組成每一列的末次已確認出兵（lastConfirmedWave，前往末次出兵用）：逐波隻數的最後一筆；正式 chapter1_3、chapter1_5 六個範圍每一列的首次與末次寫死
//   （cavalry_lv2 chapter1_5 path_b 首次 4、末次 7）；缺波、數量無法確定、重複波次的第二筆、找不到設定都不算；沒有筆數是 null；排列與搜尋後跟著列走；設定更新後用新的資料
// - utils/spawnRhythm：同一波各組同時開始、各組第一隻立刻出兵，最後一隻名義在 (n−1)×interval 秒，整波取各組最大值（不相加）；
//   n＝1 是 0 秒（間隔是什麼都一樣）；沒有提供間隔照遊戲以 1 秒計並標出預設；間隔 ≤ 0 或小於計時器最短時間時依處理幀出兵、
//   不寫成 0 秒；不是數字的間隔不強轉；數字太大時無法估算（不出現 Infinity）；有無法估算的組時只寫已知範圍
// 用法：node scripts/shenma-regression/web/stage-rhythm.test.mjs
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

const { buildStagePreview } = require(join(UTILS, "stagePreview.ts"));
const {
  filterCompositionRows,
  lastConfirmedWave,
  routeComposition,
  sortCompositionRows,
  stageComposition,
  waveRouteView,
} = require(join(UTILS, "stageComposition.ts"));
const {
  MIN_TIMER_SEC,
  groupRhythmText,
  intervalSettingText,
  secText,
  waveRhythm,
  waveRhythmText,
} = require(join(UTILS, "spawnRhythm.ts"));

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

const enemy = (enemy_id, name, movement_type = "ground") => ({
  enemy_id,
  name,
  hp: 100,
  speed: 1,
  movement_type,
});
const ENEMIES = [
  enemy("grunt_lv1", "黃巾賊"),
  enemy("grunt_lv2", "黃巾力士"),
  enemy("grunt_lv3", "黃巾頭目"),
  enemy("cavalry_lv1", "騎兵"),
  enemy("cavalry_lv2", "輕騎"),
  enemy("cavalry_lv3", "重騎"),
  enemy("siege_lv1", "衝車"),
  enemy("siege_lv2", "井闌"),
  enemy("siege_lv3", "投石車"),
  enemy("bird", "飛鳥", "flying"),
];
const g = (enemy_id, count, interval, path) => ({
  enemy_id,
  count,
  interval,
  path,
});
const stage = (paths, waves) => ({
  map_id: "t",
  name: "測試",
  path_json: { cols: 14, rows: 11, paths },
  waves,
});

// ── 正式 chapter1_3（討伐黃巾）的形狀：兩條路線、3 波、全關 70 隻、間隔都是 1.5 ──
const PATHS_13 = {
  path_a: [
    [0, 1],
    [3, 1],
    [3, 5],
    [5, 5],
    [5, 8],
    [9, 8],
    [9, 5],
    [13, 5],
  ],
  path_b: [
    [0, 8],
    [3, 8],
    [3, 5],
    [5, 5],
    [5, 1],
    [9, 1],
    [9, 5],
    [13, 5],
  ],
};
const WAVES_13 = [
  {
    wave: 1,
    enemies: [
      g("grunt_lv2", 5, 1.5, "path_a"),
      g("grunt_lv3", 5, 1.5, "path_a"),
      g("cavalry_lv2", 5, 1.5, "path_a"),
    ],
  },
  {
    wave: 2,
    enemies: [
      g("grunt_lv2", 5, 1.5, "path_a"),
      g("siege_lv3", 5, 1.5, "path_b"),
      g("siege_lv2", 5, 1.5, "path_b"),
    ],
  },
  {
    wave: 3,
    enemies: [
      g("grunt_lv2", 5, 1.5, "path_a"),
      g("cavalry_lv2", 5, 1.5, "path_b"),
      g("cavalry_lv3", 10, 1.5, "path_a"),
      g("siege_lv3", 5, 1.5, "path_b"),
      g("grunt_lv2", 10, 1.5, "path_a"),
      g("grunt_lv2", 5, 1.5, "path_b"),
    ],
  },
];
const rowsOf = (rc) =>
  rc.rows.map((r) => [r.enemyId, r.count, r.waves.join(",")]);

{
  const map = deepFreeze(stage(PATHS_13, WAVES_13));
  const p = buildStagePreview(map, deepFreeze(ENEMIES));
  const whole = stageComposition(p);
  const a = routeComposition(p, "path_a", whole);
  const b = routeComposition(p, "path_b", whole);
  check(
    "正式 chapter1_3 形狀：path_a 依第一次出現的順序 grunt_lv2 25（第 1、2、3 波）、grunt_lv3 5、cavalry_lv2 5（第 1 波）、cavalry_lv3 10（第 3 波），共 45；" +
      "path_b siege_lv3 10（第 2、3 波）、siege_lv2 5、cavalry_lv2 5、grunt_lv2 5，共 25；兩條都是完整的、合計等於全關 70；可選路線和預覽的路線相同",
    same(p.pathIds, ["path_a", "path_b"]) &&
      same(rowsOf(a), [
        ["grunt_lv2", 25, "1,2,3"],
        ["grunt_lv3", 5, "1"],
        ["cavalry_lv2", 5, "1"],
        ["cavalry_lv3", 10, "3"],
      ]) &&
      a.confirmed === 45 &&
      a.complete &&
      same(a.waves, [1, 2, 3]) &&
      same(a.gaps, []) &&
      same(rowsOf(b), [
        ["siege_lv3", 10, "2,3"],
        ["siege_lv2", 5, "2"],
        ["cavalry_lv2", 5, "3"],
        ["grunt_lv2", 5, "3"],
      ]) &&
      b.confirmed === 25 &&
      b.complete &&
      same(b.waves, [2, 3]) &&
      p.total === 70 &&
      whole.confirmed === a.confirmed + b.confirmed,
    { a: rowsOf(a), b: rowsOf(b), total: p.total }
  );
}

// ── 正式 chapter1_5（董卓進京）的第 7 波：9 組、間隔 1.1 與 1.6，兩條路線 ──
const PATHS_15 = {
  path_a: [
    [0, 5],
    [3, 5],
    [3, 8],
    [5, 8],
    [5, 1],
    [9, 1],
    [9, 0],
  ],
  path_b: [
    [13, 8],
    [13, 1],
    [11, 1],
    [11, 8],
    [9, 8],
    [9, 0],
  ],
};
const WAVE7_15 = {
  wave: 7,
  enemies: [
    g("grunt_lv2", 10, 1.1, "path_a"),
    g("cavalry_lv2", 10, 1.1, "path_a"),
    g("siege_lv2", 10, 1.1, "path_a"),
    g("cavalry_lv3", 10, 1.6, "path_a"),
    g("grunt_lv3", 10, 1.6, "path_a"),
    g("grunt_lv2", 10, 1.1, "path_b"),
    g("cavalry_lv2", 10, 1.1, "path_b"),
    g("siege_lv2", 10, 1.1, "path_b"),
    g("siege_lv3", 10, 1.6, "path_b"),
  ],
};
const filler = (n) => ({
  wave: n,
  enemies: [g("grunt_lv1", 10, 1.5, "path_a")],
});
{
  const map = deepFreeze(
    stage(PATHS_15, [1, 2, 3, 4, 5, 6].map(filler).concat([WAVE7_15]))
  );
  const p = buildStagePreview(map, ENEMIES);
  const r = waveRhythm(p.waves[6]);
  check(
    "正式 chapter1_5 第 7 波：9 組同時開始；間隔 1.1 的 10 隻最後一隻名義在 9.9 秒、1.6 的在 14.4 秒；整波取最大 14.4 秒（不是相加），說明寫明各組取最晚、不是相加",
    r.status === "complete" &&
      r.groups.length === 9 &&
      same(
        r.groups.map((x) => secText(x.lastSec)),
        ["9.9", "9.9", "9.9", "14.4", "14.4", "9.9", "9.9", "9.9", "14.4"]
      ) &&
      secText(r.lastSec) === "14.4" &&
      /9 組同時開始；整波最後一隻名義在第 14\.4 秒出兵（各組取最晚的一組，不是相加）/.test(
        waveRhythmText(r)
      ) &&
      /第一隻在波次開始時出兵，最後一隻名義在第 9\.9 秒（\(10−1\)×1\.1）/.test(
        groupRhythmText(r.groups[0])
      ),
    { r, text: waveRhythmText(r) }
  );
  const a = routeComposition(p, "path_a");
  const b = routeComposition(p, "path_b");
  check(
    "chapter1_5 形狀：path_a 110（前 6 波 60＋第 7 波 50）、path_b 40，各自完整，合計等於全關 150",
    a.complete &&
      b.complete &&
      a.confirmed + b.confirmed === p.total &&
      p.total === 150 &&
      a.confirmed === 110 &&
      b.confirmed === 40,
    { a: a.confirmed, b: b.confirmed, total: p.total }
  );
}

// ── 依路線的組成：資料問題 ──
{
  const map = stage(
    {
      path_a: [
        [0, 5],
        [13, 5],
      ],
      path_b: [
        [0, 8],
        [13, 8],
      ],
    },
    [
      {
        wave: 1,
        enemies: [
          g("grunt_lv1", 3, 1, "path_a"),
          g("ghost", 2, 1, "path_b"),
          g("grunt_lv1", 4, 1, "path_z"),
          g("bird", 2, 1, "path_b"),
        ],
      },
      {
        wave: 2,
        enemies: [
          g("grunt_lv1", 1, 1, "path_a"),
          g("cavalry_lv1", "many", 1, "path_b"),
        ],
      },
      { wave: 2, enemies: [g("siege_lv1", 99, 1, "path_a")] },
    ]
  );
  const p = buildStagePreview(map, ENEMIES);
  const whole = stageComposition(p);
  const a = routeComposition(p, "path_a", whole);
  const b = routeComposition(p, "path_b", whole);
  const z = routeComposition(p, "path_z", whole);
  check(
    "依路線：沒有路點的 path_z 不在可選路線（預覽的路線只有 path_a、path_b），它的組也不屬於任何路線；找不到設定的 ghost 只列在 path_b 的問題；" +
      "重複的第 2 波只用第一筆（siege_lv1 99 隻不算）",
    same(p.pathIds, ["path_a", "path_b"]) &&
      same(rowsOf(a), [["grunt_lv1", 4, "1,2"]]) &&
      same(b.unknownIds, ["ghost"]) &&
      same(a.unknownIds, []) &&
      b.skipped === 1 &&
      a.skipped === 0 &&
      z.rows.length === 0 &&
      whole.skipped === 2,
    { a: rowsOf(a), b: { rows: rowsOf(b), unknown: b.unknownIds }, whole }
  );
  check(
    "依路線：path_b 第 2 波數量無法判讀→path_b 只寫已確認（飛鳥 2 隻），問題寫這條路線第 2 波與全關的原因；path_a 自己沒有問題，但全關不完整時也只寫已確認（不當成它的全部）",
    !b.complete &&
      same(rowsOf(b), [["bird", 2, "1"]]) &&
      same(b.undeterminedWaves, [2]) &&
      b.gaps[0] === "這條路線在第 2 波有無法確定能不能出兵或數量的組" &&
      b.gaps.slice(1).every((x) => x.startsWith("全關：")) &&
      !a.complete &&
      same(a.undeterminedWaves, []) &&
      a.gaps.length > 0 &&
      a.gaps.every((x) => x.startsWith("全關：")),
    { a, b }
  );
}
{
  // 缺第 2 波、第 3 波遊戲會拒絕：每條路線都不完整，已確認的照算、不補 0
  const map = stage(
    {
      path_a: [
        [0, 5],
        [13, 5],
      ],
      path_b: [
        [0, 8],
        [13, 8],
      ],
    },
    [
      { wave: 1, enemies: [g("grunt_lv1", 3, 1, "path_a")] },
      { wave: 3, enemies: [g("ghost", 2, 1, "path_b")] },
    ]
  );
  const p = buildStagePreview(map, ENEMIES);
  const a = routeComposition(p, "path_a");
  const b = routeComposition(p, "path_b");
  check(
    "依路線：缺少的第 2 波與遊戲會拒絕的第 3 波→兩條路線都只寫已確認；path_b 沒有已確認的組（0 列、不寫成完整的 0 隻）",
    !a.complete &&
      a.confirmed === 3 &&
      a.gaps.some((x) => /全關：第 2 波沒有資料/.test(x)) &&
      a.gaps.some((x) => /全關：第 3 波沒有可以出兵的組/.test(x)) &&
      !b.complete &&
      b.rows.length === 0 &&
      b.skipped === 1,
    { a, b }
  );
}

// ── 逐波依路線查看（waveRouteView）：正式 chapter1_3、chapter1_5 的逐波資料（敵人 id、數量、間隔、路線照正式設定） ──
const routeIdx = (v) => v.groups.map((x) => x.index);
const viewOf = (p, pathId) =>
  p.waves.map((w) => {
    const v = waveRouteView(w, pathId);
    return [v.confirmed, v.confirmedGroups];
  });
{
  const map = deepFreeze(stage(PATHS_13, WAVES_13));
  const p = buildStagePreview(map, deepFreeze(ENEMIES));
  const before = JSON.stringify(p);
  const rhythmBefore = p.waves.map((w) => JSON.stringify(waveRhythm(w)));
  const a = p.waves.map((w) => waveRouteView(w, "path_a"));
  const b = p.waves.map((w) => waveRouteView(w, "path_b"));
  check(
    "逐波依路線（正式 chapter1_3）：path_a 第 1 波第 1、2、3 組 15 隻／3 組，第 2 波第 1 組 5 隻，第 3 波第 1、3、5 組 25 隻；" +
      "path_b 第 1 波沒有已確認出兵組（0 組、其他路線 3 組沒有列出），第 2 波第 2、3 組 10 隻，第 3 波第 2、4、6 組 15 隻；組序是原本的編號",
    same(a.map(routeIdx), [[1, 2, 3], [1], [1, 3, 5]]) &&
      same(viewOf(p, "path_a"), [
        [15, 3],
        [5, 1],
        [25, 3],
      ]) &&
      same(b.map(routeIdx), [[], [2, 3], [2, 4, 6]]) &&
      same(viewOf(p, "path_b"), [
        [0, 0],
        [10, 2],
        [15, 3],
      ]) &&
      b[0].otherHidden === 3 &&
      b[0].otherProblems.length === 0 &&
      a.every((v) => v.undetermined === 0 && v.otherProblems.length === 0),
    {
      a: a.map(routeIdx),
      b: b.map(routeIdx),
      va: viewOf(p, "path_a"),
      vb: viewOf(p, "path_b"),
    }
  );
  const whole = stageComposition(p);
  check(
    "逐波依路線（正式 chapter1_3）：各波兩條路線的已確認隻數加起來等於那一波的總數；逐波加總等於依路線組成（45、25）；" +
      "列出的組就是原本那幾組（同一個物件，不複製、不改內容）；預覽與整波出兵節奏不變",
    p.waves.every((w, i) => a[i].confirmed + b[i].confirmed === w.total) &&
      a.reduce((s, v) => s + v.confirmed, 0) ===
        routeComposition(p, "path_a", whole).confirmed &&
      b.reduce((s, v) => s + v.confirmed, 0) ===
        routeComposition(p, "path_b", whole).confirmed &&
      a.every((v, i) =>
        v.groups.every((x) => p.waves[i].groups[x.index - 1] === x)
      ) &&
      JSON.stringify(p) === before &&
      p.waves.every(
        (w, i) => JSON.stringify(waveRhythm(w)) === rhythmBefore[i]
      ),
    { a: a.map((v) => v.confirmed), b: b.map((v) => v.confirmed) }
  );
}
const WAVES_15 = [
  {
    wave: 1,
    enemies: [
      g("grunt_lv1", 10, 1.5, "path_a"),
      g("cavalry_lv1", 10, 1.1, "path_a"),
      g("siege_lv1", 10, 1.1, "path_a"),
    ],
  },
  {
    wave: 2,
    enemies: [
      g("grunt_lv2", 10, 1.1, "path_a"),
      g("cavalry_lv2", 10, 1.1, "path_a"),
      g("siege_lv1", 10, 1.1, "path_b"),
    ],
  },
  {
    wave: 3,
    enemies: [
      g("grunt_lv1", 10, 1.1, "path_a"),
      g("cavalry_lv2", 10, 1.1, "path_a"),
      g("siege_lv2", 10, 1.5, "path_a"),
      g("siege_lv2", 10, 1.5, "path_b"),
    ],
  },
  {
    wave: 4,
    enemies: [
      g("grunt_lv2", 10, 1.1, "path_a"),
      g("cavalry_lv2", 10, 1.1, "path_a"),
      g("siege_lv2", 10, 1.1, "path_b"),
      g("cavalry_lv2", 10, 1.1, "path_b"),
    ],
  },
  {
    wave: 5,
    enemies: [
      g("grunt_lv2", 10, 1.1, "path_a"),
      g("cavalry_lv2", 10, 1.1, "path_a"),
      g("siege_lv2", 10, 1.1, "path_a"),
      g("grunt_lv2", 10, 1.1, "path_b"),
      g("cavalry_lv2", 10, 1.1, "path_b"),
      g("siege_lv2", 10, 1.1, "path_b"),
    ],
  },
  {
    wave: 6,
    enemies: [
      g("grunt_lv2", 10, 1.1, "path_a"),
      g("cavalry_lv2", 10, 1.1, "path_a"),
      g("siege_lv2", 10, 1.1, "path_a"),
      g("cavalry_lv3", 10, 1.1, "path_b"),
      g("grunt_lv2", 10, 1.1, "path_b"),
      g("cavalry_lv2", 10, 1.1, "path_b"),
      g("siege_lv2", 10, 1.1, "path_b"),
    ],
  },
  {
    wave: 7,
    enemies: [
      g("grunt_lv2", 10, 1.1, "path_a"),
      g("cavalry_lv2", 10, 1.1, "path_a"),
      g("siege_lv2", 10, 1.1, "path_a"),
      g("cavalry_lv3", 10, 1.6, "path_a"),
      g("grunt_lv3", 10, 1.6, "path_a"),
      g("grunt_lv2", 10, 1.1, "path_b"),
      g("cavalry_lv2", 10, 1.1, "path_b"),
      g("siege_lv2", 10, 1.1, "path_b"),
      g("siege_lv3", 10, 1.6, "path_b"),
    ],
  },
];
{
  const map = deepFreeze(stage(PATHS_15, WAVES_15));
  const p = buildStagePreview(map, deepFreeze(ENEMIES));
  const a = viewOf(p, "path_a");
  const b = viewOf(p, "path_b");
  const sum = (l) => l.reduce((s, [n]) => s + n, 0);
  const v7a = waveRouteView(p.waves[6], "path_a");
  const v7b = waveRouteView(p.waves[6], "path_b");
  check(
    "逐波依路線（正式 chapter1_5）：path_a 各波 30、20、30、20、30、30、50（共 210），path_b 0、10、10、20、30、40、40（共 150），全關 360；" +
      "第 7 波 path_a 第 1～5 組、path_b 第 6～9 組（原本的組序）；整波出兵節奏仍是 9 組、14.4 秒",
    same(
      a.map(([n]) => n),
      [30, 20, 30, 20, 30, 30, 50]
    ) &&
      same(
        b.map(([n]) => n),
        [0, 10, 10, 20, 30, 40, 40]
      ) &&
      sum(a) === 210 &&
      sum(b) === 150 &&
      p.total === 360 &&
      same(routeIdx(v7a), [1, 2, 3, 4, 5]) &&
      same(routeIdx(v7b), [6, 7, 8, 9]) &&
      waveRhythm(p.waves[6]).groups.length === 9 &&
      secText(waveRhythm(p.waves[6]).lastSec) === "14.4",
    { a, b, total: p.total }
  );
}

// ── 逐波依路線查看：資料問題不被藏起來、不補 0、不重複 ──
{
  const map = deepFreeze(
    stage(
      {
        path_a: [
          [0, 5],
          [13, 5],
        ],
        path_b: [
          [0, 8],
          [13, 8],
        ],
      },
      [
        // 第 1 波：path_a 第 1 組數量無法判讀、第 3 組正常；path_b 第 2 組找不到敵人設定；第 4 組在沒有路點的 path_z；
        // 第 5 組 path_b 沒有提供間隔（資料不完整的註記）
        {
          wave: 1,
          enemies: [
            g("grunt_lv1", "many", 1, "path_a"),
            g("ghost", 2, 1, "path_b"),
            g("grunt_lv2", 3, 1, "path_a"),
            g("grunt_lv3", 2, 1, "path_z"),
            { enemy_id: "cavalry_lv1", count: 4, path: "path_b" },
          ],
        },
        // 第 2 波缺少；第 3 波只有 path_a 上找不到設定的組（整波遊戲會拒絕）
        { wave: 3, enemies: [g("ghost", 1, 1, "path_a")] },
        // 第 4 波有重複資料（遊戲只用第一筆）
        { wave: 4, enemies: [g("grunt_lv1", 2, 1, "path_b")] },
        { wave: 4, enemies: [g("grunt_lv1", 9, 1, "path_a")] },
      ]
    )
  );
  const p = buildStagePreview(map, deepFreeze(ENEMIES));
  const [w1, w2, w3, w4] = p.waves;
  const a1 = waveRouteView(w1, "path_a");
  const b1 = waveRouteView(w1, "path_b");
  check(
    "資料問題（第 1 波 path_a）：列第 1 組（數量無法確定）與第 3 組，已確認只算第 3 組 3 隻／1 組、另有 1 組無法確定；" +
      "其他路線的問題照原內容另列：第 2 組（找不到設定）、第 4 組（沒有路點的 path_z）、第 5 組（沒有提供間隔），沒有可以不列的組",
    same(routeIdx(a1), [1, 3]) &&
      a1.confirmed === 3 &&
      a1.confirmedGroups === 1 &&
      a1.undetermined === 1 &&
      same(
        a1.otherProblems.map((x) => x.index),
        [2, 4, 5]
      ) &&
      a1.otherProblems.every((x) => x.notes.length > 0) &&
      a1.otherHidden === 0,
    {
      a1: routeIdx(a1),
      c: a1.confirmed,
      other: a1.otherProblems.map((x) => [x.index, x.notes]),
    }
  );
  check(
    "資料問題（第 1 波 path_b）：列第 2 組（找不到設定，遊戲會略過）與第 5 組，已確認只算第 5 組 4 隻；其他路線的問題是第 1 組與 path_z 的第 4 組，" +
      "第 3 組（path_a 正常）不列、算在其他路線沒有列出的 1 組；每一組只出現一次（本路線與全波資料提醒不重複，合起來是整波）",
    same(routeIdx(b1), [2, 5]) &&
      b1.confirmed === 4 &&
      b1.confirmedGroups === 1 &&
      b1.undetermined === 0 &&
      same(
        b1.otherProblems.map((x) => x.index),
        [1, 4]
      ) &&
      b1.otherHidden === 1 &&
      [a1, b1].every((v) => {
        const ids = [...v.groups, ...v.otherProblems].map((x) => x.index);
        return (
          new Set(ids).size === ids.length &&
          ids.length + v.otherHidden === w1.groups.length
        );
      }),
    {
      b1: routeIdx(b1),
      other: b1.otherProblems.map((x) => x.index),
      hidden: b1.otherHidden,
    }
  );
  const a2 = waveRouteView(w2, "path_a");
  const a3 = waveRouteView(w3, "path_a");
  const b3 = waveRouteView(w3, "path_b");
  const a4 = waveRouteView(w4, "path_a");
  const b4 = waveRouteView(w4, "path_b");
  check(
    "缺波、拒絕、重複：第 2 波沒有資料時兩條路線都是 0 組、沒有已確認（不補成 0 隻的完整波）；第 3 波 path_a 列出找不到設定的第 1 組、沒有已確認，" +
      "path_b 把它列在全波資料提醒；第 4 波重複資料照預覽只用第一筆（path_b 2 隻，path_a 沒有組）",
    w2.missing &&
      a2.groups.length === 0 &&
      a2.confirmedGroups === 0 &&
      a2.otherProblems.length === 0 &&
      w3.rejected &&
      same(routeIdx(a3), [1]) &&
      a3.confirmedGroups === 0 &&
      same(
        b3.otherProblems.map((x) => x.index),
        [1]
      ) &&
      w4.duplicates === 1 &&
      b4.confirmed === 2 &&
      a4.groups.length === 0 &&
      a4.otherHidden === 1,
    {
      a2,
      a3: routeIdx(a3),
      b3: b3.otherProblems.length,
      b4: b4.confirmed,
      a4: a4.groups.length,
    }
  );
}

// ── 敵軍組成的排列（sortCompositionRows）：正式 chapter1_3、chapter1_5 的逐波資料，期望值是正式設定算出的隻數 ──
const idCount = (rows) => rows.map((r) => [r.enemyId, r.count]);
{
  const p = buildStagePreview(
    deepFreeze(stage(PATHS_13, WAVES_13)),
    deepFreeze(ENEMIES)
  );
  const whole = deepFreeze(stageComposition(p));
  const a = deepFreeze(routeComposition(p, "path_a", whole));
  const b = deepFreeze(routeComposition(p, "path_b", whole));
  const before = JSON.stringify([whole, a, b]);
  const wFirst = sortCompositionRows(whole.rows, "first");
  const wCount = sortCompositionRows(whole.rows, "count");
  check(
    "組成排列（正式 chapter1_3 全關 70）：首次出現＝原本的順序 grunt_lv2 30、grunt_lv3 5、cavalry_lv2 10、siege_lv3 10、siege_lv2 5、cavalry_lv3 10；" +
      "已確認隻數＝grunt_lv2 30、cavalry_lv2 10、siege_lv3 10、cavalry_lv3 10、grunt_lv3 5、siege_lv2 5（三個 10 與兩個 5 維持首次出現的先後）",
    same(idCount(wFirst), [
      ["grunt_lv2", 30],
      ["grunt_lv3", 5],
      ["cavalry_lv2", 10],
      ["siege_lv3", 10],
      ["siege_lv2", 5],
      ["cavalry_lv3", 10],
    ]) &&
      same(idCount(wCount), [
        ["grunt_lv2", 30],
        ["cavalry_lv2", 10],
        ["siege_lv3", 10],
        ["cavalry_lv3", 10],
        ["grunt_lv3", 5],
        ["siege_lv2", 5],
      ]),
    { first: idCount(wFirst), count: idCount(wCount) }
  );
  const aCount = sortCompositionRows(a.rows, "count");
  const bCount = sortCompositionRows(b.rows, "count");
  check(
    "組成排列（正式 chapter1_3 兩條路線）：path_a 45＝grunt_lv2 25、cavalry_lv3 10、grunt_lv3 5、cavalry_lv2 5；path_b 25＝siege_lv3 10、siege_lv2 5、cavalry_lv2 5、grunt_lv2 5（同數量依首次出現）；" +
      "出兵波次跟著列走；合計、說明用的資料都不變；回傳新陣列、列物件不複製，來源陣列與組成都沒有被改",
    same(idCount(aCount), [
      ["grunt_lv2", 25],
      ["cavalry_lv3", 10],
      ["grunt_lv3", 5],
      ["cavalry_lv2", 5],
    ]) &&
      same(
        aCount.map((r) => r.waves.join(",")),
        ["1,2,3", "3", "1", "1"]
      ) &&
      same(idCount(bCount), [
        ["siege_lv3", 10],
        ["siege_lv2", 5],
        ["cavalry_lv2", 5],
        ["grunt_lv2", 5],
      ]) &&
      aCount.reduce((s, r) => s + r.count, 0) === 45 &&
      bCount.reduce((s, r) => s + r.count, 0) === 25 &&
      wCount !== whole.rows &&
      wFirst !== whole.rows &&
      wCount.every((r) => whole.rows.includes(r)) &&
      JSON.stringify([whole, a, b]) === before,
    { a: idCount(aCount), b: idCount(bCount) }
  );
}
{
  const p = buildStagePreview(
    deepFreeze(stage(PATHS_15, WAVES_15)),
    deepFreeze(ENEMIES)
  );
  const whole = deepFreeze(stageComposition(p));
  const a = routeComposition(p, "path_a", whole);
  const b = routeComposition(p, "path_b", whole);
  check(
    "組成排列（正式 chapter1_5 全關 360）：cavalry_lv2 100、siege_lv2 90、grunt_lv2 80、grunt_lv1 20、siege_lv1 20、cavalry_lv3 20、cavalry_lv1 10、grunt_lv3 10、siege_lv3 10；" +
      "path_a 210＝cavalry_lv2 60、grunt_lv2 50、siege_lv2 40、grunt_lv1 20、cavalry_lv1 10、siege_lv1 10、cavalry_lv3 10、grunt_lv3 10；" +
      "path_b 150＝siege_lv2 50、cavalry_lv2 40、grunt_lv2 30、siege_lv1 10、cavalry_lv3 10、siege_lv3 10",
    same(idCount(sortCompositionRows(whole.rows, "count")), [
      ["cavalry_lv2", 100],
      ["siege_lv2", 90],
      ["grunt_lv2", 80],
      ["grunt_lv1", 20],
      ["siege_lv1", 20],
      ["cavalry_lv3", 20],
      ["cavalry_lv1", 10],
      ["grunt_lv3", 10],
      ["siege_lv3", 10],
    ]) &&
      same(idCount(sortCompositionRows(a.rows, "count")), [
        ["cavalry_lv2", 60],
        ["grunt_lv2", 50],
        ["siege_lv2", 40],
        ["grunt_lv1", 20],
        ["cavalry_lv1", 10],
        ["siege_lv1", 10],
        ["cavalry_lv3", 10],
        ["grunt_lv3", 10],
      ]) &&
      same(idCount(sortCompositionRows(b.rows, "count")), [
        ["siege_lv2", 50],
        ["cavalry_lv2", 40],
        ["grunt_lv2", 30],
        ["siege_lv1", 10],
        ["cavalry_lv3", 10],
        ["siege_lv3", 10],
      ]) &&
      whole.confirmed === 360 &&
      a.confirmed === 210 &&
      b.confirmed === 150,
    { whole: idCount(sortCompositionRows(whole.rows, "count")) }
  );
}
{
  // 同名不同 id、找不到設定、略過、缺波、數量無法確定：排列只動已確認的列，不補 0、不改資料問題
  const twins = [...ENEMIES, enemy("grunt_twin", "黃巾力士")];
  const map = deepFreeze(
    stage(
      {
        path_a: [
          [0, 5],
          [13, 5],
        ],
      },
      [
        {
          wave: 1,
          enemies: [
            g("grunt_lv2", 2, 1, "path_a"),
            g("grunt_twin", 7, 1, "path_a"),
            g("ghost", 9, 1, "path_a"),
          ],
        },
        {
          wave: 3,
          enemies: [
            g("grunt_lv2", 3, 1, "path_a"),
            g("grunt_lv3", "many", 1, "path_a"),
            g("cavalry_lv1", 0, 1, "path_a"),
          ],
        },
      ]
    )
  );
  const p = buildStagePreview(map, deepFreeze(twins));
  const c = deepFreeze(stageComposition(p));
  const before = JSON.stringify(c);
  const sorted = sortCompositionRows(c.rows, "count");
  check(
    "組成排列（資料問題）：同名不同 id 分開排（grunt_twin 7 在 grunt_lv2 5 前面）；找不到設定的 ghost、數量無法判讀、數量 0 的組不會變成列；" +
      "已確認合計 12、不是全關總數，資料問題與略過的組數不變",
    same(idCount(sorted), [
      ["grunt_twin", 7],
      ["grunt_lv2", 5],
    ]) &&
      sorted.reduce((s, r) => s + r.count, 0) === 12 &&
      !c.complete &&
      c.unknownIds.includes("ghost") &&
      c.gaps.length > 0 &&
      JSON.stringify(c) === before,
    {
      sorted: idCount(sorted),
      gaps: c.gaps,
      unknown: c.unknownIds,
      skipped: c.skipped,
    }
  );
  // 設定更新：用新的資料重新排，不沿用舊的順序
  const updated = buildStagePreview(
    stage(
      {
        path_a: [
          [0, 5],
          [13, 5],
        ],
      },
      [
        {
          wave: 1,
          enemies: [
            g("grunt_lv2", 9, 1, "path_a"),
            g("grunt_twin", 7, 1, "path_a"),
          ],
        },
      ]
    ),
    twins
  );
  check(
    "組成排列（設定更新）：grunt_lv2 改成 9 隻後重新排，變成 grunt_lv2 9、grunt_twin 7（用最新的列，不是舊的順序）",
    same(
      idCount(sortCompositionRows(stageComposition(updated).rows, "count")),
      [
        ["grunt_lv2", 9],
        ["grunt_twin", 7],
      ]
    )
  );
}

// ── 敵軍組成的首次出兵波次（列的 firstWave，前往首次出兵用）：正式 chapter1_3、chapter1_5，期望值是正式設定算出的波次 ──
const idWave = (rows) => rows.map((r) => [r.enemyId, r.firstWave]);
{
  const p = buildStagePreview(
    deepFreeze(stage(PATHS_13, WAVES_13)),
    deepFreeze(ENEMIES)
  );
  const whole = stageComposition(p);
  const a = routeComposition(p, "path_a", whole);
  const b = routeComposition(p, "path_b", whole);
  check(
    "首次出兵（正式 chapter1_3）：全關 grunt_lv2 1、grunt_lv3 1、cavalry_lv2 1、siege_lv3 2、siege_lv2 2、cavalry_lv3 3；" +
      "path_a grunt_lv2 1、grunt_lv3 1、cavalry_lv2 1、cavalry_lv3 3；path_b siege_lv3 2、siege_lv2 2、cavalry_lv2 3、grunt_lv2 3" +
      "（cavalry_lv2 全關與 path_a 是第 1 波、path_b 是第 3 波：每個範圍用自己的首次，不借全關的）",
    same(idWave(whole.rows), [
      ["grunt_lv2", 1],
      ["grunt_lv3", 1],
      ["cavalry_lv2", 1],
      ["siege_lv3", 2],
      ["siege_lv2", 2],
      ["cavalry_lv3", 3],
    ]) &&
      same(idWave(a.rows), [
        ["grunt_lv2", 1],
        ["grunt_lv3", 1],
        ["cavalry_lv2", 1],
        ["cavalry_lv3", 3],
      ]) &&
      same(idWave(b.rows), [
        ["siege_lv3", 2],
        ["siege_lv2", 2],
        ["cavalry_lv2", 3],
        ["grunt_lv2", 3],
      ]),
    { whole: idWave(whole.rows), a: idWave(a.rows), b: idWave(b.rows) }
  );
  // 依隻數排列後首次出兵跟著列走（不重算、不換成別的列的）
  check(
    "首次出兵（排列）：path_b 依已確認隻數排列後，cavalry_lv2 仍是第 3 波、grunt_lv2 第 3 波、siege_lv3 第 2 波",
    same(idWave(sortCompositionRows(b.rows, "count")), [
      ["siege_lv3", 2],
      ["siege_lv2", 2],
      ["cavalry_lv2", 3],
      ["grunt_lv2", 3],
    ]) &&
      same(
        idWave(sortCompositionRows(whole.rows, "count")).find(
          (x) => x[0] === "cavalry_lv3"
        ),
        ["cavalry_lv3", 3]
      )
  );
}
{
  const p = buildStagePreview(
    deepFreeze(stage(PATHS_15, WAVES_15)),
    deepFreeze(ENEMIES)
  );
  const whole = stageComposition(p);
  const a = routeComposition(p, "path_a", whole);
  const b = routeComposition(p, "path_b", whole);
  check(
    "首次出兵（正式 chapter1_5）：cavalry_lv2 全關第 2 波、path_a 第 2 波、path_b 第 4 波；全關 grunt_lv1 1、cavalry_lv1 1、siege_lv1 1、grunt_lv2 2、cavalry_lv2 2、siege_lv2 3、cavalry_lv3 6、grunt_lv3 7、siege_lv3 7；" +
      "path_b siege_lv1 2、siege_lv2 3、cavalry_lv2 4、grunt_lv2 5、cavalry_lv3 6、siege_lv3 7",
    same(idWave(whole.rows), [
      ["grunt_lv1", 1],
      ["cavalry_lv1", 1],
      ["siege_lv1", 1],
      ["grunt_lv2", 2],
      ["cavalry_lv2", 2],
      ["siege_lv2", 3],
      ["cavalry_lv3", 6],
      ["grunt_lv3", 7],
      ["siege_lv3", 7],
    ]) &&
      same(idWave(a.rows), [
        ["grunt_lv1", 1],
        ["cavalry_lv1", 1],
        ["siege_lv1", 1],
        ["grunt_lv2", 2],
        ["cavalry_lv2", 2],
        ["siege_lv2", 3],
        ["cavalry_lv3", 7],
        ["grunt_lv3", 7],
      ]) &&
      same(idWave(b.rows), [
        ["siege_lv1", 2],
        ["siege_lv2", 3],
        ["cavalry_lv2", 4],
        ["grunt_lv2", 5],
        ["cavalry_lv3", 6],
        ["siege_lv3", 7],
      ]),
    { whole: idWave(whole.rows), a: idWave(a.rows), b: idWave(b.rows) }
  );
}
{
  // 同名不同 id、找不到設定、略過、缺波、數量無法確定：只有已確認的列有首次出兵；缺的波次不會被當成首次
  const twins = [...ENEMIES, enemy("grunt_twin", "黃巾力士")];
  const p = buildStagePreview(
    deepFreeze(
      stage(
        {
          path_a: [
            [0, 5],
            [13, 5],
          ],
        },
        [
          // 第 1 波缺少；第 2 波：找不到設定、數量無法判讀、數量 0；第 3 波：grunt_lv2 與同名的 grunt_twin
          {
            wave: 2,
            enemies: [
              g("ghost", 2, 1, "path_a"),
              g("grunt_lv3", "many", 1, "path_a"),
              g("cavalry_lv1", 0, 1, "path_a"),
            ],
          },
          {
            wave: 3,
            enemies: [
              g("grunt_twin", 4, 1, "path_a"),
              g("grunt_lv2", 4, 1, "path_a"),
            ],
          },
          { wave: 4, enemies: [g("grunt_lv2", 1, 1, "path_a")] },
        ]
      )
    ),
    deepFreeze(twins)
  );
  const c = stageComposition(p);
  check(
    "首次出兵（資料問題）：只有已確認的 grunt_twin 與 grunt_lv2 有首次（都是第 3 波，同名不同 id 各自一列）；找不到設定、數量無法判讀、數量 0 的組沒有列；缺少的第 1 波與有問題的第 2 波都不是首次",
    same(idWave(c.rows), [
      ["grunt_twin", 3],
      ["grunt_lv2", 3],
    ]) && !c.complete,
    { rows: idWave(c.rows), gaps: c.gaps }
  );
  // 設定更新：首次出兵改成新的資料（舊的第 3 波不再是首次）
  const updated = buildStagePreview(
    stage(
      {
        path_a: [
          [0, 5],
          [13, 5],
        ],
      },
      [{ wave: 1, enemies: [g("grunt_lv2", 2, 1, "path_a")] }]
    ),
    twins
  );
  check(
    "首次出兵（設定更新）：只剩第 1 波時 grunt_lv2 的首次是第 1 波、grunt_twin 不再有列（用最新的資料，不留舊的目標）",
    same(idWave(stageComposition(updated).rows), [["grunt_lv2", 1]])
  );
}

// ── 敵軍組成的逐波已確認隻數（列的 perWave，逐波隻數的明細用）：正式 chapter1_3、chapter1_5，期望值是正式設定算出的逐波隻數 ──
// 每一列：[enemy_id, 合計, "波次:隻數 波次:隻數 …"]
const idPerWave = (rows) =>
  rows.map((r) => [
    r.enemyId,
    r.count,
    r.perWave.map((x) => `${x.wave}:${x.count}`).join(" "),
  ]);
const PER_WAVE_13 = {
  all: [
    ["grunt_lv2", 30, "1:5 2:5 3:20"],
    ["grunt_lv3", 5, "1:5"],
    ["cavalry_lv2", 10, "1:5 3:5"],
    ["siege_lv3", 10, "2:5 3:5"],
    ["siege_lv2", 5, "2:5"],
    ["cavalry_lv3", 10, "3:10"],
  ],
  path_a: [
    ["grunt_lv2", 25, "1:5 2:5 3:15"],
    ["grunt_lv3", 5, "1:5"],
    ["cavalry_lv2", 5, "1:5"],
    ["cavalry_lv3", 10, "3:10"],
  ],
  path_b: [
    ["siege_lv3", 10, "2:5 3:5"],
    ["siege_lv2", 5, "2:5"],
    ["cavalry_lv2", 5, "3:5"],
    ["grunt_lv2", 5, "3:5"],
  ],
};
const PER_WAVE_15 = {
  all: [
    ["grunt_lv1", 20, "1:10 3:10"],
    ["cavalry_lv1", 10, "1:10"],
    ["siege_lv1", 20, "1:10 2:10"],
    ["grunt_lv2", 80, "2:10 4:10 5:20 6:20 7:20"],
    ["cavalry_lv2", 100, "2:10 3:10 4:20 5:20 6:20 7:20"],
    ["siege_lv2", 90, "3:20 4:10 5:20 6:20 7:20"],
    ["cavalry_lv3", 20, "6:10 7:10"],
    ["grunt_lv3", 10, "7:10"],
    ["siege_lv3", 10, "7:10"],
  ],
  path_a: [
    ["grunt_lv1", 20, "1:10 3:10"],
    ["cavalry_lv1", 10, "1:10"],
    ["siege_lv1", 10, "1:10"],
    ["grunt_lv2", 50, "2:10 4:10 5:10 6:10 7:10"],
    ["cavalry_lv2", 60, "2:10 3:10 4:10 5:10 6:10 7:10"],
    ["siege_lv2", 40, "3:10 5:10 6:10 7:10"],
    ["cavalry_lv3", 10, "7:10"],
    ["grunt_lv3", 10, "7:10"],
  ],
  path_b: [
    ["siege_lv1", 10, "2:10"],
    ["siege_lv2", 50, "3:10 4:10 5:10 6:10 7:10"],
    ["cavalry_lv2", 40, "4:10 5:10 6:10 7:10"],
    ["grunt_lv2", 30, "5:10 6:10 7:10"],
    ["cavalry_lv3", 10, "6:10"],
    ["siege_lv3", 10, "7:10"],
  ],
};
// 每一列的逐波隻數：加起來等於合計、波次由小到大不重複、沒有 0、第一筆是首次出兵；路線的列和它的出兵波次相同
const perWaveSane = (rows) =>
  rows.every(
    (r) =>
      r.perWave.reduce((s, x) => s + x.count, 0) === r.count &&
      r.perWave.every(
        (x, i) => x.count > 0 && (i === 0 || x.wave > r.perWave[i - 1].wave)
      ) &&
      r.perWave[0].wave === r.firstWave &&
      (!r.waves ||
        same(
          r.waves,
          r.perWave.map((x) => x.wave)
        ))
  );
const scopesOf = (paths, waves) => {
  const p = buildStagePreview(
    deepFreeze(stage(paths, waves)),
    deepFreeze(ENEMIES)
  );
  const whole = stageComposition(p);
  return {
    all: whole.rows,
    path_a: routeComposition(p, "path_a", whole).rows,
    path_b: routeComposition(p, "path_b", whole).rows,
  };
};
const perWaveOf = (rows, id) =>
  (idPerWave(rows).find((r) => r[0] === id) || [])[2] ?? null;
{
  const s13 = scopesOf(PATHS_13, WAVES_13);
  const s15 = scopesOf(PATHS_15, WAVES_15);
  const cav = {
    c13: ["all", "path_a", "path_b"].map((k) =>
      perWaveOf(s13[k], "cavalry_lv2")
    ),
    c15: ["all", "path_a", "path_b"].map((k) =>
      perWaveOf(s15[k], "cavalry_lv2")
    ),
  };
  check(
    "逐波隻數（正式 cavalry_lv2）：chapter1_5 全關 100＝第 2 波 10、第 3 波 10、第 4～7 波各 20（第 4 波起兩條路線各 10 相加），path_a 第 2～7 波各 10 共 60，path_b 第 4～7 波各 10 共 40；" +
      "chapter1_3 全關第 1 波 5、第 3 波 5，path_a 只有第 1 波 5，path_b 只有第 3 波 5（每個範圍用自己的逐波，不借全關的）",
    same(cav.c15, [
      "2:10 3:10 4:20 5:20 6:20 7:20",
      "2:10 3:10 4:10 5:10 6:10 7:10",
      "4:10 5:10 6:10 7:10",
    ]) && same(cav.c13, ["1:5 3:5", "1:5", "3:5"]),
    cav
  );
  check(
    "逐波隻數（正式 chapter1_3）：全關與兩條路線每一列的合計與逐波都和正式設定算出的相同；第 3 波的 grunt_lv2 是 path_a 的 5＋10 與 path_b 的 5（同一波同一敵人多組相加：全關 20、path_a 15、path_b 5）",
    same(idPerWave(s13.all), PER_WAVE_13.all) &&
      same(idPerWave(s13.path_a), PER_WAVE_13.path_a) &&
      same(idPerWave(s13.path_b), PER_WAVE_13.path_b),
    {
      all: idPerWave(s13.all),
      a: idPerWave(s13.path_a),
      b: idPerWave(s13.path_b),
    }
  );
  check(
    "逐波隻數（正式 chapter1_5）：全關 360、path_a 210、path_b 150 每一列的合計與逐波都和正式設定算出的相同",
    same(idPerWave(s15.all), PER_WAVE_15.all) &&
      same(idPerWave(s15.path_a), PER_WAVE_15.path_a) &&
      same(idPerWave(s15.path_b), PER_WAVE_15.path_b),
    {
      all: idPerWave(s15.all),
      a: idPerWave(s15.path_a),
      b: idPerWave(s15.path_b),
    }
  );
  check(
    "逐波隻數（一致性）：兩關六個範圍的每一列逐波加起來等於合計、波次由小到大不重複、沒有 0、第一筆就是首次出兵；路線的列和它的出兵波次相同",
    [s13, s15].every((s) => Object.values(s).every(perWaveSane))
  );
  // 依隻數排列：逐波跟著列走（同一個列，不重算、不換成別的列的）
  const sorted = sortCompositionRows(s15.path_b, "count");
  check(
    "逐波隻數（排列）：chapter1_5 path_b 依已確認隻數排列後 siege_lv2 50、cavalry_lv2 40、grunt_lv2 30 的逐波跟著各自的列，和首次出現時相同",
    same(idPerWave(sorted).slice(0, 3), [
      PER_WAVE_15.path_b[1],
      PER_WAVE_15.path_b[2],
      PER_WAVE_15.path_b[3],
    ]) &&
      sorted.every(
        (r) =>
          r.perWave === s15.path_b.find((x) => x.enemyId === r.enemyId).perWave
      )
  );
}
{
  // 資料問題：缺少的波、找不到設定、數量無法判讀、數量 0、遊戲會略過的組都不進逐波（不補 0）；同名不同 id 各自一列；
  // 同一波重複的資料照預覽只用第一筆；同一波同一敵人兩組相加
  const twins = [...ENEMIES, enemy("grunt_twin", "黃巾力士")];
  const paths = {
    path_a: [
      [0, 5],
      [13, 5],
    ],
    path_b: [
      [0, 8],
      [13, 8],
    ],
  };
  const p = buildStagePreview(
    deepFreeze(
      stage(paths, [
        // 第 1 波缺少
        {
          wave: 2,
          enemies: [
            g("ghost", 2, 1, "path_a"),
            g("grunt_lv3", "many", 1, "path_a"),
            g("cavalry_lv1", 0, 1, "path_a"),
            g("grunt_lv2", 3, 1, "path_z"),
            g("grunt_lv2", 4, 1, "path_a"),
            g("grunt_twin", 2, 1, "path_b"),
          ],
        },
        // 第 3 波兩筆：預覽只用第一筆（grunt_lv2 兩組 1＋5），第二筆的 50 不算
        {
          wave: 3,
          enemies: [
            g("grunt_lv2", 1, 1, "path_a"),
            g("grunt_lv2", 5, 1, "path_b"),
          ],
        },
        { wave: 3, enemies: [g("grunt_lv2", 50, 1, "path_a")] },
        { wave: 4, enemies: [g("grunt_twin", 3, 1, "path_b")] },
      ])
    ),
    deepFreeze(twins)
  );
  const whole = stageComposition(p);
  const a = routeComposition(p, "path_a", whole);
  const b = routeComposition(p, "path_b", whole);
  check(
    "逐波隻數（資料問題）：全關 grunt_lv2 第 2 波 4、第 3 波 6（同一波兩條路線 1＋5 相加；重複的第 3 波第二筆 50 不算；沒有路點的 path_z 會略過、不算）、grunt_twin 第 2 波 2、第 4 波 3（同名不同 id 各自一列）；" +
      "path_a 只有 grunt_lv2 第 2 波 4、第 3 波 1；path_b grunt_twin 2、3 與 grunt_lv2 第 3 波 5；缺少的第 1 波、找不到設定、數量無法判讀、數量 0 都沒有列也沒有逐波，不補 0",
    !whole.complete &&
      same(idPerWave(whole.rows), [
        ["grunt_lv2", 10, "2:4 3:6"],
        ["grunt_twin", 5, "2:2 4:3"],
      ]) &&
      same(idPerWave(a.rows), [["grunt_lv2", 5, "2:4 3:1"]]) &&
      same(idPerWave(b.rows), [
        ["grunt_twin", 5, "2:2 4:3"],
        ["grunt_lv2", 5, "3:5"],
      ]) &&
      [whole.rows, a.rows, b.rows].every(perWaveSane),
    { whole: idPerWave(whole.rows), a: idPerWave(a.rows), b: idPerWave(b.rows) }
  );
  // 設定更新：用新的資料重算（舊的波次不留）
  const updated = buildStagePreview(
    stage(paths, [
      {
        wave: 1,
        enemies: [
          g("grunt_lv2", 2, 1, "path_a"),
          g("grunt_lv2", 3, 1, "path_a"),
        ],
      },
    ]),
    twins
  );
  check(
    "逐波隻數（設定更新）：只剩第 1 波兩組 grunt_lv2 時逐波是第 1 波 5（兩組相加）、grunt_twin 不再有列；舊的第 2、3 波不留",
    same(idPerWave(stageComposition(updated).rows), [["grunt_lv2", 5, "1:5"]])
  );
}

// ── 敵軍組成的搜尋（filterCompositionRows）：正式 chapter1_3、chapter1_5，敵人名稱用正式設定的名稱，期望值是正式設定算出的 ──
// 每一個查詢：[查詢, "符合的 enemy_id（顯示順序）", 種數, 已確認隻數的小計]；目前範圍的合計另外寫
const FORMAL_ENEMIES = [
  enemy("grunt_lv1", "普通兵LV1"),
  enemy("grunt_lv2", "普通兵LV2"),
  enemy("grunt_lv3", "普通兵LV3"),
  enemy("cavalry_lv1", "輕騎兵LV1"),
  enemy("cavalry_lv2", "輕騎兵LV2"),
  enemy("cavalry_lv3", "輕騎兵LV3"),
  enemy("siege_lv1", "攻城車LV1"),
  enemy("siege_lv2", "攻城車LV2"),
  enemy("siege_lv3", "攻城車LV3"),
];
const QUERIES = [
  "",
  "輕騎兵LV2",
  " CAVALRY_LV2 ",
  "lv2",
  "輕騎兵",
  "no_such_enemy",
];
const searchCase = (rows, q) => {
  const hit = filterCompositionRows(rows, q);
  return [
    q,
    hit.map((r) => r.enemyId).join(","),
    hit.length,
    hit.reduce((s, r) => s + r.count, 0),
  ];
};
const SEARCH_13 = {
  all: [
    70,
    [
      [
        "",
        "grunt_lv2,grunt_lv3,cavalry_lv2,siege_lv3,siege_lv2,cavalry_lv3",
        6,
        70,
      ],
      ["輕騎兵LV2", "cavalry_lv2", 1, 10],
      [" CAVALRY_LV2 ", "cavalry_lv2", 1, 10],
      ["lv2", "grunt_lv2,cavalry_lv2,siege_lv2", 3, 45],
      ["輕騎兵", "cavalry_lv2,cavalry_lv3", 2, 20],
      ["no_such_enemy", "", 0, 0],
    ],
  ],
  path_a: [
    45,
    [
      ["", "grunt_lv2,grunt_lv3,cavalry_lv2,cavalry_lv3", 4, 45],
      ["輕騎兵LV2", "cavalry_lv2", 1, 5],
      [" CAVALRY_LV2 ", "cavalry_lv2", 1, 5],
      ["lv2", "grunt_lv2,cavalry_lv2", 2, 30],
      ["輕騎兵", "cavalry_lv2,cavalry_lv3", 2, 15],
      ["no_such_enemy", "", 0, 0],
    ],
  ],
  path_b: [
    25,
    [
      ["", "siege_lv3,siege_lv2,cavalry_lv2,grunt_lv2", 4, 25],
      ["輕騎兵LV2", "cavalry_lv2", 1, 5],
      [" CAVALRY_LV2 ", "cavalry_lv2", 1, 5],
      ["lv2", "siege_lv2,cavalry_lv2,grunt_lv2", 3, 15],
      ["輕騎兵", "cavalry_lv2", 1, 5],
      ["no_such_enemy", "", 0, 0],
    ],
  ],
};
const SEARCH_15 = {
  all: [
    360,
    [
      [
        "",
        "grunt_lv1,cavalry_lv1,siege_lv1,grunt_lv2,cavalry_lv2,siege_lv2,cavalry_lv3,grunt_lv3,siege_lv3",
        9,
        360,
      ],
      ["輕騎兵LV2", "cavalry_lv2", 1, 100],
      [" CAVALRY_LV2 ", "cavalry_lv2", 1, 100],
      ["lv2", "grunt_lv2,cavalry_lv2,siege_lv2", 3, 270],
      ["輕騎兵", "cavalry_lv1,cavalry_lv2,cavalry_lv3", 3, 130],
      ["no_such_enemy", "", 0, 0],
    ],
  ],
  path_a: [
    210,
    [
      [
        "",
        "grunt_lv1,cavalry_lv1,siege_lv1,grunt_lv2,cavalry_lv2,siege_lv2,cavalry_lv3,grunt_lv3",
        8,
        210,
      ],
      ["輕騎兵LV2", "cavalry_lv2", 1, 60],
      [" CAVALRY_LV2 ", "cavalry_lv2", 1, 60],
      ["lv2", "grunt_lv2,cavalry_lv2,siege_lv2", 3, 150],
      ["輕騎兵", "cavalry_lv1,cavalry_lv2,cavalry_lv3", 3, 80],
      ["no_such_enemy", "", 0, 0],
    ],
  ],
  path_b: [
    150,
    [
      [
        "",
        "siege_lv1,siege_lv2,cavalry_lv2,grunt_lv2,cavalry_lv3,siege_lv3",
        6,
        150,
      ],
      ["輕騎兵LV2", "cavalry_lv2", 1, 40],
      [" CAVALRY_LV2 ", "cavalry_lv2", 1, 40],
      ["lv2", "siege_lv2,cavalry_lv2,grunt_lv2", 3, 120],
      ["輕騎兵", "cavalry_lv2,cavalry_lv3", 2, 50],
      ["no_such_enemy", "", 0, 0],
    ],
  ],
};
const formalScopes = (paths, waves) => {
  const p = buildStagePreview(
    deepFreeze(stage(paths, waves)),
    deepFreeze(FORMAL_ENEMIES)
  );
  const whole = stageComposition(p);
  const a = routeComposition(p, "path_a", whole);
  const b = routeComposition(p, "path_b", whole);
  return {
    all: [whole.confirmed, whole.rows],
    path_a: [a.confirmed, a.rows],
    path_b: [b.confirmed, b.rows],
  };
};
const searchTable = (scopes) =>
  Object.fromEntries(
    Object.entries(scopes).map(([k, [confirmed, rows]]) => [
      k,
      [confirmed, QUERIES.map((q) => searchCase(rows, q))],
    ])
  );
{
  const s13 = formalScopes(PATHS_13, WAVES_13);
  const s15 = formalScopes(PATHS_15, WAVES_15);
  const t13 = searchTable(s13);
  const t15 = searchTable(s15);
  check(
    "組成搜尋（正式 chapter1_3）：全關 70、path_a 45、path_b 25 各自搜尋「輕騎兵LV2」「 CAVALRY_LV2 」（大寫加前後空白）「lv2」「輕騎兵」與沒有符合的查詢，符合的列、種數與已確認小計都和正式設定算出的相同；" +
      "path_b 的「輕騎兵」只有 cavalry_lv2 5（不借全關的 cavalry_lv3）；目前範圍的合計不因搜尋改變",
    same(t13, SEARCH_13),
    t13
  );
  check(
    "組成搜尋（正式 chapter1_5）：全關 360 搜尋「輕騎兵」是 LV1 10、LV2 100、LV3 20 共 130（同類不同等級分開成三列），「輕騎兵LV2」只有 100；path_a 60、path_b 40；「lv2」全關 270、path_a 150、path_b 120；沒有符合的查詢是 0 種 0 隻",
    same(t15, SEARCH_15),
    t15
  );
  // 搜尋只篩選：符合的列就是原本的列物件（合計、首次、逐波不變），不改來源；查詢只有空白時是全部的列
  const [, allRows] = s15.all;
  const before = JSON.stringify(allRows);
  const hit = filterCompositionRows(allRows, "輕騎兵");
  check(
    "組成搜尋（只篩選）：符合的列是原本的列（cavalry_lv2 仍是 100 隻、首次第 2 波、逐波 2:10 3:10 4:20 5:20 6:20 7:20），來源的列不變；查詢只有空白（「   」）時回傳全部 9 列",
    hit.every((r) => allRows.includes(r)) &&
      JSON.stringify(allRows) === before &&
      same(idPerWave(hit.filter((r) => r.enemyId === "cavalry_lv2")), [
        ["cavalry_lv2", 100, "2:10 3:10 4:20 5:20 6:20 7:20"],
      ]) &&
      hit.find((r) => r.enemyId === "cavalry_lv2").firstWave === 2 &&
      filterCompositionRows(allRows, "   ").length === 9 &&
      filterCompositionRows(allRows, "   ") !== allRows
  );
  // 先排列再搜尋：符合的列照排列後的順序
  check(
    "組成搜尋（排列）：chapter1_5 全關依已確認隻數排列後搜尋「輕騎兵」是 cavalry_lv2 100、cavalry_lv3 20、cavalry_lv1 10（首次出現時是 LV1、LV2、LV3）",
    same(searchCase(sortCompositionRows(allRows, "count"), "輕騎兵"), [
      "輕騎兵",
      "cavalry_lv2,cavalry_lv3,cavalry_lv1",
      3,
      130,
    ]) &&
      same(searchCase(allRows, "輕騎兵"), [
        "輕騎兵",
        "cavalry_lv1,cavalry_lv2,cavalry_lv3",
        3,
        130,
      ])
  );
}
{
  // 同名不同 id、找不到設定、略過、數量無法判讀、缺波：搜尋只看已確認的列，不造列、不合併
  const twins = [...FORMAL_ENEMIES, enemy("grunt_twin", "普通兵LV2")];
  const p = buildStagePreview(
    deepFreeze(
      stage(
        {
          path_a: [
            [0, 5],
            [13, 5],
          ],
          path_b: [
            [0, 8],
            [13, 8],
          ],
        },
        [
          // 第 1 波缺少
          {
            wave: 2,
            enemies: [
              g("ghost_lv2", 2, 1, "path_a"),
              g("cavalry_lv2", "many", 1, "path_a"),
              g("siege_lv2", 0, 1, "path_a"),
              g("grunt_lv2", 4, 1, "path_a"),
              g("grunt_twin", 3, 1, "path_b"),
            ],
          },
          { wave: 3, enemies: [g("cavalry_lv2", 6, 1, "path_z")] },
        ]
      )
    ),
    deepFreeze(twins)
  );
  const whole = stageComposition(p);
  const b = routeComposition(p, "path_b", whole);
  check(
    "組成搜尋（資料問題）：「普通兵LV2」符合 grunt_lv2 4 與同名的 grunt_twin 3 兩列（不合併）、小計 7；「grunt_twin」只有 grunt_twin；「lv2」也只有這兩列——找不到設定的 ghost_lv2、數量無法判讀的輕騎兵、數量 0 的攻城車、沒有路點的路線上的輕騎兵都沒有列，不會被搜尋出來；" +
      "path_b 搜尋「grunt_lv2」沒有符合（不借全關的 grunt_lv2）",
    !whole.complete &&
      same(searchCase(whole.rows, "普通兵LV2"), [
        "普通兵LV2",
        "grunt_lv2,grunt_twin",
        2,
        7,
      ]) &&
      same(searchCase(whole.rows, "grunt_twin"), [
        "grunt_twin",
        "grunt_twin",
        1,
        3,
      ]) &&
      same(searchCase(whole.rows, "lv2"), [
        "lv2",
        "grunt_lv2,grunt_twin",
        2,
        7,
      ]) &&
      same(searchCase(whole.rows, "ghost"), ["ghost", "", 0, 0]) &&
      same(searchCase(whole.rows, "輕騎兵"), ["輕騎兵", "", 0, 0]) &&
      same(searchCase(b.rows, "grunt_lv2"), ["grunt_lv2", "", 0, 0]),
    { whole: whole.rows.map((r) => [r.enemyId, r.name, r.count]) }
  );
}

// ── 敵軍組成依已確認出兵的波數排列（sortCompositionRows 的 waves）：正式 chapter1_3、chapter1_5，期望值是正式設定算出的 ──
// 每一個範圍：[已確認合計, "enemy_id:波數 …（依波數由多到少、同波數依首次出現）"]
const byWaves = (rows) =>
  sortCompositionRows(rows, "waves")
    .map((r) => `${r.enemyId}:${r.perWave.length}`)
    .join(" ");
const WAVES_SORT_13 = {
  all: [
    70,
    "grunt_lv2:3 cavalry_lv2:2 siege_lv3:2 grunt_lv3:1 siege_lv2:1 cavalry_lv3:1",
  ],
  path_a: [45, "grunt_lv2:3 grunt_lv3:1 cavalry_lv2:1 cavalry_lv3:1"],
  path_b: [25, "siege_lv3:2 siege_lv2:1 cavalry_lv2:1 grunt_lv2:1"],
};
const WAVES_SORT_15 = {
  all: [
    360,
    "cavalry_lv2:6 grunt_lv2:5 siege_lv2:5 grunt_lv1:2 siege_lv1:2 cavalry_lv3:2 cavalry_lv1:1 grunt_lv3:1 siege_lv3:1",
  ],
  path_a: [
    210,
    "cavalry_lv2:6 grunt_lv2:5 siege_lv2:4 grunt_lv1:2 cavalry_lv1:1 siege_lv1:1 cavalry_lv3:1 grunt_lv3:1",
  ],
  path_b: [
    150,
    "siege_lv2:5 cavalry_lv2:4 grunt_lv2:3 siege_lv1:1 cavalry_lv3:1 siege_lv3:1",
  ],
};
{
  const s13 = formalScopes(PATHS_13, WAVES_13);
  const s15 = formalScopes(PATHS_15, WAVES_15);
  const table = (s) =>
    Object.fromEntries(
      Object.entries(s).map(([k, [confirmed, rows]]) => [
        k,
        [confirmed, byWaves(rows)],
      ])
    );
  const t13 = table(s13);
  const t15 = table(s15);
  check(
    "依波數排列（正式 chapter1_3）：全關 70 是 grunt_lv2 3 波、cavalry_lv2 與 siege_lv3 各 2 波、其餘 1 波（同波數依首次出現）；path_a 45、path_b 25 各用自己的波數（第 3 波 grunt_lv2 的三組只算一波）",
    same(t13, WAVES_SORT_13),
    t13
  );
  check(
    "依波數排列（正式 chapter1_5）：全關 360 是 cavalry_lv2 6 波、grunt_lv2 與 siege_lv2 各 5 波…；path_a 210、path_b 150 各用自己的波數（path_b 的 cavalry_lv2 是 4 波，不借全關的 6 波）",
    same(t15, WAVES_SORT_15),
    t15
  );
  // 只改順序：每一列的合計、首次、逐波都是原本的列；正式輕騎兵 LV2 全關／path_a／path_b 是 6／6／4 波、100／60／40 隻
  const cav = ["all", "path_a", "path_b"].map((k) => {
    const r = sortCompositionRows(s15[k][1], "waves").find(
      (x) => x.enemyId === "cavalry_lv2"
    );
    return [r.perWave.length, r.count, r.firstWave];
  });
  const [, all15] = s15.all;
  const before = JSON.stringify(all15);
  const sorted = sortCompositionRows(all15, "waves");
  check(
    "依波數排列（只排順序）：正式 cavalry_lv2 在 chapter1_5 全關／path_a／path_b 是 6／6／4 波、100／60／40 隻、首次第 2／2／4 波；排列後是同一批列物件、回傳新陣列、來源不變",
    same(cav, [
      [6, 100, 2],
      [6, 60, 2],
      [4, 40, 4],
    ]) &&
      sorted !== all15 &&
      sorted.length === all15.length &&
      sorted.every((r) => all15.includes(r)) &&
      JSON.stringify(all15) === before
  );
  // 和依隻數排列不同：隻數多不等於出現的波數多
  check(
    "依波數排列和依隻數不同：chapter1_5 全關依隻數是 siege_lv2 90 在 grunt_lv2 80 前面，依波數兩者都是 5 波、照首次出現 grunt_lv2 在前；chapter1_3 全關的 cavalry_lv3（10 隻、1 波）依隻數排第 4、依波數排最後",
    same(
      sortCompositionRows(all15, "count")
        .slice(1, 3)
        .map((r) => r.enemyId),
      ["siege_lv2", "grunt_lv2"]
    ) &&
      same(
        sortCompositionRows(all15, "waves")
          .slice(1, 3)
          .map((r) => r.enemyId),
        ["grunt_lv2", "siege_lv2"]
      ) &&
      sortCompositionRows(s13.all[1], "count")
        .map((r) => r.enemyId)
        .indexOf("cavalry_lv3") === 3 &&
      sortCompositionRows(s13.all[1], "waves")
        .map((r) => r.enemyId)
        .indexOf("cavalry_lv3") === 5
  );
}
{
  // 同一波多組只算一波；找不到設定、數量無法判讀、數量 0、沒有路點的路線、缺波都不算波；同波數維持首次出現
  const p = buildStagePreview(
    deepFreeze(
      stage(
        {
          path_a: [
            [0, 5],
            [13, 5],
          ],
        },
        [
          {
            wave: 1,
            enemies: [
              g("grunt_lv1", 2, 1, "path_a"),
              g("grunt_lv1", 3, 1, "path_a"),
              g("cavalry_lv1", 1, 1, "path_a"),
            ],
          },
          {
            wave: 2,
            enemies: [
              g("cavalry_lv1", 9, 1, "path_a"),
              g("grunt_lv1", "many", 1, "path_a"),
              g("siege_lv1", 0, 1, "path_a"),
              g("ghost", 4, 1, "path_a"),
            ],
          },
          // 第 3 波缺少
          {
            wave: 4,
            enemies: [
              g("siege_lv1", 5, 1, "path_a"),
              g("grunt_lv1", 1, 1, "path_z"),
            ],
          },
        ]
      )
    ),
    deepFreeze(FORMAL_ENEMIES)
  );
  const c = stageComposition(p);
  check(
    "依波數排列（資料問題）：grunt_lv1 第 1 波兩組只算 1 波（第 2 波數量無法判讀、第 4 波在沒有路點的路線都不算）、cavalry_lv1 2 波、siege_lv1 1 波（第 2 波數量 0 不算）；依波數是 cavalry_lv1、grunt_lv1、siege_lv1（同 1 波依首次出現），依隻數是 cavalry_lv1 10、grunt_lv1 5、siege_lv1 5",
    !c.complete &&
      byWaves(c.rows) === "cavalry_lv1:2 grunt_lv1:1 siege_lv1:1" &&
      same(
        sortCompositionRows(c.rows, "count").map((r) => [r.enemyId, r.count]),
        [
          ["cavalry_lv1", 10],
          ["grunt_lv1", 5],
          ["siege_lv1", 5],
        ]
      ),
    { rows: c.rows.map((r) => [r.enemyId, r.count, r.perWave]) }
  );
}

// ── 設定出兵節奏 ──
const rhythmOf = (enemies) =>
  waveRhythm(
    buildStagePreview(
      stage(
        {
          path_a: [
            [0, 5],
            [13, 5],
          ],
          path_b: [
            [0, 8],
            [13, 8],
          ],
        },
        [{ wave: 1, enemies }]
      ),
      ENEMIES
    ).waves[0]
  );
{
  const one = rhythmOf([g("grunt_lv1", 1, 5, "path_a")]);
  const oneBad = rhythmOf([g("grunt_lv1", 1, "abc", "path_a")]);
  const oneZero = rhythmOf([g("grunt_lv1", 1, 0, "path_a")]);
  check(
    "n＝1：只有一隻、波次開始時出兵（0 秒），間隔是 5、無法判讀或 0 都一樣，整波是完整的 0 秒",
    [one, oneBad, oneZero].every(
      (r) =>
        r.status === "complete" &&
        r.groups[0].kind === "single" &&
        r.lastSec === 0 &&
        /只有 1 隻：波次開始時出兵（0 秒）/.test(groupRhythmText(r.groups[0]))
    ),
    { one, oneBad, oneZero }
  );
}
{
  const r = rhythmOf([
    { enemy_id: "grunt_lv1", count: 5, path: "path_a" },
    g("cavalry_lv1", 3, 2, "path_b"),
  ]);
  check(
    "沒有提供間隔：照遊戲以 1 秒計並標出是預設（5 隻→4 秒）；另一組 3 隻×2 秒→4 秒；整波 4 秒（同時開始，不是 8 秒）",
    r.status === "complete" &&
      r.groups[0].intervalDefault === true &&
      r.groups[0].lastSec === 4 &&
      /每隻間隔 1 秒（沒有提供，遊戲預設）/.test(
        groupRhythmText(r.groups[0])
      ) &&
      r.groups[1].intervalDefault === false &&
      r.groups[1].lastSec === 4 &&
      r.lastSec === 4,
    { r, text: r.groups.map(groupRhythmText) }
  );
}
{
  const zero = rhythmOf([
    g("grunt_lv1", 5, 0, "path_a"),
    g("cavalry_lv1", 3, 2, "path_b"),
  ]);
  const neg = rhythmOf([g("grunt_lv1", 5, -3, "path_a")]);
  const tiny = rhythmOf([g("grunt_lv1", 5, MIN_TIMER_SEC / 2, "path_a")]);
  const texts = [zero, neg, tiny].map((r) => groupRhythmText(r.groups[0]));
  check(
    "間隔 0、負數（預覽照遊戲當 0）、小於計時器最短 0.0001 秒，n＞1：依處理幀出兵、無法由設定估算精確秒數，不寫成 0 秒；" +
      "和 4 秒的組在同一波時整波寫「至少 4 秒」，不是精確時間；只有這種組時不寫任何秒數",
    [zero, neg, tiny].every((r) => r.groups[0].kind === "frame") &&
      texts.every(
        (t) =>
          /依處理幀出兵，無法由設定估算精確秒數/.test(t) &&
          !/(^|[^.\d])0 秒/.test(t)
      ) &&
      /間隔設定 ≤ 0（遊戲當作 0）/.test(texts[1]) &&
      /小於遊戲計時器最短的 0\.0001 秒/.test(texts[2]) &&
      zero.status === "frame" &&
      zero.lastSec === 4 &&
      /整波至少 4 秒，無法估算精確秒數/.test(waveRhythmText(zero)) &&
      neg.status === "frame" &&
      neg.lastSec === null &&
      !/\d+(\.\d+)? 秒/.test(waveRhythmText(neg)),
    { texts, zero: waveRhythmText(zero), neg: waveRhythmText(neg) }
  );
}
{
  const bad = rhythmOf([
    g("grunt_lv1", 5, "1.5", "path_a"),
    g("cavalry_lv1", 3, 2, "path_b"),
  ]);
  const unknownCount = rhythmOf([
    g("grunt_lv1", "many", 1, "path_a"),
    g("cavalry_lv1", 3, 2, "path_b"),
  ]);
  check(
    "間隔不是數字（字串 1.5 不強轉）、數量無法判讀：那一組無法估算；整波只寫已估算組的最晚 4 秒，寫明不是整波",
    bad.groups[0].kind === "unknown" &&
      /間隔無法判讀：出兵間隔不是數字，無法估算/.test(
        groupRhythmText(bad.groups[0])
      ) &&
      bad.status === "partial" &&
      bad.lastSec === 4 &&
      /僅已估算的組：最晚在第 4 秒；另有 1 組無法估算，不是整波的出兵時間/.test(
        waveRhythmText(bad)
      ) &&
      unknownCount.groups[0].kind === "unknown" &&
      /數量無法確定/.test(groupRhythmText(unknownCount.groups[0])) &&
      unknownCount.status === "partial",
    { bad: waveRhythmText(bad), unknownCount: waveRhythmText(unknownCount) }
  );
}
{
  const huge = rhythmOf([g("grunt_lv1", 3, 1e308, "path_a")]);
  const many = rhythmOf([g("grunt_lv1", 1e300, 1, "path_a")]);
  const all = [huge, many].map((r) => [
    groupRhythmText(r.groups[0]),
    waveRhythmText(r),
  ]);
  check(
    "數字太大：(3−1)×1e308 溢位、數量 1e300 不是安全整數→無法估算，畫面文字沒有 Infinity／NaN，整波無法確定",
    huge.groups[0].kind === "unknown" &&
      many.groups[0].kind === "unknown" &&
      huge.status === "partial" &&
      huge.lastSec === null &&
      all.flat().every((t) => !/Infinity|NaN/.test(t)) &&
      /整波的出兵時間無法確定/.test(waveRhythmText(huge)),
    { all }
  );
}
{
  const p = buildStagePreview(
    stage(
      {
        path_a: [
          [0, 5],
          [13, 5],
        ],
      },
      [
        { wave: 1, enemies: [g("ghost", 3, 1, "path_a")] },
        { wave: 3, enemies: [g("grunt_lv1", 3, 1, "path_a")] },
        {
          wave: 4,
          enemies: [g("ghost", 3, 1, "path_a"), g("grunt_lv1", 3, 1, "path_a")],
        },
      ]
    ),
    ENEMIES
  );
  const [rejected, missing, , mixed] = p.waves.map(waveRhythm);
  check(
    "遊戲會拒絕的第 1 波、缺少的第 2 波：沒有節奏可以估算；第 4 波遊戲會略過的組不列入、另外計數，其他組照常",
    rejected.status === "none" &&
      missing.status === "none" &&
      /這一波不會出兵/.test(waveRhythmText(missing)) &&
      mixed.status === "complete" &&
      mixed.skipped === 1 &&
      mixed.groups.length === 1 &&
      mixed.groups[0].index === 2 &&
      mixed.lastSec === 2,
    { rejected, missing, mixed }
  );
}
{
  const shown = {
    "9×1.1": secText(9 * 1.1),
    "0.1+0.2": secText(0.1 + 0.2),
    14: secText(14),
    0.0001: secText(0.0001),
    0.001: secText(0.001),
    0.004: secText(0.004),
    0.005: secText(0.005),
    1.001: secText(1.001),
    "1/3": secText(1 / 3),
    "2/3": secText(2 / 3),
    "2/3 floor": secText(2 / 3, true),
    "1/3 floor": secText(1 / 3, true),
    "1e20": secText(1e20),
    "1e308": secText(1e308),
    // 真的差一點點、不是浮點誤差的值：要標約，「至少」不能進位
    0.6666999999999: secText(0.6666999999999),
    "0.6666999999999 floor": secText(0.6666999999999, true),
    123456789.0129: secText(123456789.0129),
    "123456789.0129 floor": secText(123456789.0129, true),
    // 安全整數照原樣，一位都不抹掉
    1234567890123: secText(1234567890123),
    "1234567890129 floor": secText(1234567890129, true),
    // 浮點誤差在真值之下（7×0.1＝0.7000000000000001、0.7 的鄰居 0.6999999999999999）
    "0.6999999999999999 floor": secText(0.6999999999999999, true),
  };
  check(
    "秒數顯示：只差浮點誤差時寫整齊的小數（9×1.1＝9.9、0.1＋0.2＝0.3、整數不帶小數）；小數 4 位內照實寫，小的正值不寫成 0（0.0001、0.001、0.004、0.005、1.001、123456789.0129）；" +
      "真的不是 4 位小數時寫到 4 位並標「約」（1/3＝約 0.3333、2/3＝約 0.6667、0.6666999999999＝約 0.6667）；「至少」從真值往下取（2/3＝0.6666、0.6666999999999＝0.6666、0.6999999999999999＝0.6999）；" +
      "安全整數照原樣（1234567890123、1234567890129）；極大值照原樣、沒有 Infinity",
    shown["9×1.1"] === "9.9" &&
      shown["0.1+0.2"] === "0.3" &&
      shown[14] === "14" &&
      shown[0.0001] === "0.0001" &&
      shown[0.001] === "0.001" &&
      shown[0.004] === "0.004" &&
      shown[0.005] === "0.005" &&
      shown[1.001] === "1.001" &&
      shown["1/3"] === "約 0.3333" &&
      shown["2/3"] === "約 0.6667" &&
      shown["2/3 floor"] === "0.6666" &&
      shown["1/3 floor"] === "0.3333" &&
      shown["1e20"] === "100000000000000000000" &&
      shown["1e308"] === "1e+308" &&
      shown["0.6666999999999"] === "約 0.6667" &&
      shown["0.6666999999999 floor"] === "0.6666" &&
      shown["123456789.0129"] === "123456789.0129" &&
      shown["123456789.0129 floor"] === "123456789.0129" &&
      shown[1234567890123] === "1234567890123" &&
      shown["1234567890129 floor"] === "1234567890129" &&
      shown["0.6999999999999999 floor"] === "0.6999",
    shown
  );
}
{
  // 「至少」的下限：任何有限的秒數，顯示的數字都不大於真值（含整數捷徑、極大值、浮點誤差在真值上下的值）
  const fixed = [
    0,
    0.0001,
    0.001,
    0.004,
    0.005,
    1.001,
    0.1 + 0.2,
    7 * 0.1,
    0.6999999999999999,
    9 * 1.1,
    9 * 1.6,
    1 / 3,
    2 / 3,
    0.6666999999999,
    0.66669999999999996,
    123456789.0129,
    1234567890123,
    1234567890129,
    999999999999.99,
    9007199254740991,
    1e20,
    1e308,
    Number.MIN_VALUE,
  ];
  let seed = 61;
  const rand = () =>
    (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const random = Array.from(
    { length: 20000 },
    (_, i) => rand() * 10 ** ((i % 16) - 5)
  );
  const bad = [...fixed, ...random].filter(
    (v) => !(Number(secText(v, true)) <= v)
  );
  const looksZero = [...fixed, ...random].filter(
    (v) => v > 0 && /^約? ?0$/.test(secText(v))
  );
  check(
    "「至少」的下限不大於真值：固定反例 23 個與 20000 個隨機值（10⁻⁵～10¹⁰）都滿足 Number(secText(v, true)) ≤ v；正值不會顯示成 0",
    bad.length === 0 && looksZero.length === 0,
    { bad: bad.slice(0, 5), looksZero: looksZero.slice(0, 5) }
  );
}
{
  // 整波：依處理幀的組＋2 隻×0.6666999999999 秒 → 「至少 0.6666 秒」（不是 0.6667），計算值是真值
  const near = rhythmOf([
    g("grunt_lv1", 2, 0, "path_a"),
    g("cavalry_lv1", 2, 0.6666999999999, "path_b"),
  ]);
  // 2 隻×1234567890123 秒：最後一隻在第 1234567890123 秒（整數照原樣）
  const big = rhythmOf([g("grunt_lv1", 2, 1234567890123, "path_a")]);
  check(
    "整波的下限與真值：依處理幀＋2 隻×0.6666999999999 秒寫「其他組最晚在約第 0.6667 秒…整波至少 0.6666 秒」，計算值仍是 0.6666999999999；2 隻×1234567890123 秒寫第 1234567890123 秒",
    near.status === "frame" &&
      near.lastSec === 0.6666999999999 &&
      /其他組最晚在約第 0\.6667 秒，另有 1 組依處理幀出兵：整波至少 0\.6666 秒/.test(
        waveRhythmText(near)
      ) &&
      big.status === "complete" &&
      big.lastSec === 1234567890123 &&
      /整波最後一隻名義在第 1234567890123 秒出兵/.test(waveRhythmText(big)),
    { near: waveRhythmText(near), big: waveRhythmText(big) }
  );
}
{
  // count 2、間隔 0.001：不是 n＝1，最後一隻在 0.001 秒，不能寫成 0 秒
  const small = rhythmOf([g("grunt_lv1", 2, 0.001, "path_a")]);
  const gt = groupRhythmText(small.groups[0]);
  const wt = waveRhythmText(small);
  // 和依處理幀的組同一波、另一組是 3 隻×1/3 秒（0.6666… 秒）：整波「至少」用不進位的 0.6666，其他組的時間標約值
  const third = rhythmOf([
    g("grunt_lv1", 3, 0, "path_a"),
    g("cavalry_lv1", 3, 1 / 3, "path_b"),
  ]);
  const tt = waveRhythmText(third);
  check(
    "小的正值間隔：2 隻×0.001 秒的最後一隻名義在第 0.001 秒、整波 0.001 秒（不是 0 秒）；非整的時間寫「約第 0.6667 秒」，「至少」是 0.6666 秒（下限不進位）",
    small.status === "complete" &&
      small.groups[0].kind === "timed" &&
      small.lastSec === 0.001 &&
      /2 隻，每隻間隔 0\.001 秒：第一隻在波次開始時出兵，最後一隻名義在第 0\.001 秒（\(2−1\)×0\.001）/.test(
        gt
      ) &&
      /整波最後一隻名義在第 0\.001 秒出兵/.test(wt) &&
      ![gt, wt].some((t) => /第 0 秒|×0）/.test(t)) &&
      third.status === "frame" &&
      /其他組最晚在約第 0\.6667 秒，另有 1 組依處理幀出兵：整波至少 0\.6666 秒/.test(
        tt
      ) &&
      /最後一隻名義在約第 0\.6667 秒/.test(groupRhythmText(third.groups[1])),
    { gt, wt, tt, third: groupRhythmText(third.groups[1]) }
  );
}
{
  const groupsOf = (enemies) =>
    buildStagePreview(
      stage(
        {
          path_a: [
            [0, 5],
            [13, 5],
          ],
        },
        [{ wave: 1, enemies }]
      ),
      ENEMIES
    ).waves[0].groups;
  const [def, bad, zero, neg, tiny, small, normal] = groupsOf([
    { enemy_id: "grunt_lv1", count: 2, path: "path_a" },
    g("grunt_lv1", 2, "1.5", "path_a"),
    g("grunt_lv1", 2, 0, "path_a"),
    g("grunt_lv1", 2, -3, "path_a"),
    g("grunt_lv1", 2, MIN_TIMER_SEC / 2, "path_a"),
    g("grunt_lv1", 2, 0.001, "path_a"),
    g("grunt_lv1", 2, 1.5, "path_a"),
  ]);
  const texts = [def, bad, zero, neg, tiny, small, normal].map(
    intervalSettingText
  );
  check(
    "逐波組列的「設定間隔」：沒有提供寫遊戲以 1 秒計；字串寫無法判讀；0 與負數（照遊戲當 0）寫兩隻之間依處理幀、不是同時出兵；小於計時器最短時間另外說明；0.001 照實寫；1.5 秒照寫",
    texts[0] === "設定間隔 未提供（遊戲以 1 秒計）" &&
      texts[1] === "設定間隔 無法判讀" &&
      texts[2] ===
        "設定間隔 ≤ 0（遊戲當作 0；兩隻之間依處理幀，不是同時出兵）" &&
      texts[3] === texts[2] &&
      texts[4] ===
        "設定間隔 0.00005 秒（小於遊戲計時器最短的 0.0001 秒；兩隻之間依處理幀）" &&
      texts[5] === "設定間隔 0.001 秒" &&
      texts[6] === "設定間隔 1.5 秒",
    texts
  );
}

// ── 敵軍組成的末次已確認出兵（lastConfirmedWave，前往末次出兵用）：正式 chapter1_3、chapter1_5 ──
// 每一列：[enemy_id, 首次, 末次已確認]；期望值寫死，是另外從正式設定的 raw 波次與組直接算出的（不是用被測的函式產生）
const idFirstLast = (rows) =>
  rows.map((r) => [r.enemyId, r.firstWave, lastConfirmedWave(r)]);
const LAST_13 = {
  all: [
    ["grunt_lv2", 1, 3],
    ["grunt_lv3", 1, 1],
    ["cavalry_lv2", 1, 3],
    ["siege_lv3", 2, 3],
    ["siege_lv2", 2, 2],
    ["cavalry_lv3", 3, 3],
  ],
  path_a: [
    ["grunt_lv2", 1, 3],
    ["grunt_lv3", 1, 1],
    ["cavalry_lv2", 1, 1],
    ["cavalry_lv3", 3, 3],
  ],
  path_b: [
    ["siege_lv3", 2, 3],
    ["siege_lv2", 2, 2],
    ["cavalry_lv2", 3, 3],
    ["grunt_lv2", 3, 3],
  ],
};
const LAST_15 = {
  all: [
    ["grunt_lv1", 1, 3],
    ["cavalry_lv1", 1, 1],
    ["siege_lv1", 1, 2],
    ["grunt_lv2", 2, 7],
    ["cavalry_lv2", 2, 7],
    ["siege_lv2", 3, 7],
    ["cavalry_lv3", 6, 7],
    ["grunt_lv3", 7, 7],
    ["siege_lv3", 7, 7],
  ],
  path_a: [
    ["grunt_lv1", 1, 3],
    ["cavalry_lv1", 1, 1],
    ["siege_lv1", 1, 1],
    ["grunt_lv2", 2, 7],
    ["cavalry_lv2", 2, 7],
    ["siege_lv2", 3, 7],
    ["cavalry_lv3", 7, 7],
    ["grunt_lv3", 7, 7],
  ],
  path_b: [
    ["siege_lv1", 2, 2],
    ["siege_lv2", 3, 7],
    ["cavalry_lv2", 4, 7],
    ["grunt_lv2", 5, 7],
    ["cavalry_lv3", 6, 6],
    ["siege_lv3", 7, 7],
  ],
};
{
  const s13 = scopesOf(PATHS_13, WAVES_13);
  const s15 = scopesOf(PATHS_15, WAVES_15);
  const scopes = ["all", "path_a", "path_b"];
  check(
    "末次已確認出兵（正式 chapter1_3）：cavalry_lv2 全關第 1→3 波、path_a 第 1→1 波、path_b 第 3→3 波；全關與兩條路線每一列的首次與末次都和正式設定算出的相同（路線用自己的，不借全關的）",
    scopes.every((k) => same(idFirstLast(s13[k]), LAST_13[k])),
    Object.fromEntries(scopes.map((k) => [k, idFirstLast(s13[k])]))
  );
  check(
    "末次已確認出兵（正式 chapter1_5）：cavalry_lv2 全關第 2→7 波、path_a 第 2→7 波、path_b 第 4→7 波（末次是 7，不是路線的首次 4，也不是出現的波數 4）；cavalry_lv3 path_b 只有第 6 波（首末同一波）；全關與兩條路線每一列都和正式設定算出的相同",
    scopes.every((k) => same(idFirstLast(s15[k]), LAST_15[k])),
    Object.fromEntries(scopes.map((k) => [k, idFirstLast(s15[k])]))
  );
  const allRows = [
    ...scopes.map((k) => s13[k]),
    ...scopes.map((k) => s15[k]),
  ].flat();
  check(
    "末次已確認出兵：每一列的末次就是逐波隻數最後一筆的波次、不早於首次；排列（依隻數、依波數）與搜尋後末次跟著各自的列",
    allRows.every(
      (r) =>
        lastConfirmedWave(r) === r.perWave[r.perWave.length - 1].wave &&
        lastConfirmedWave(r) >= r.firstWave
    ) &&
      same(
        idFirstLast(sortCompositionRows(s15.path_b, "count")).sort(),
        LAST_15.path_b.slice().sort()
      ) &&
      same(
        idFirstLast(sortCompositionRows(s15.all, "waves")).sort(),
        LAST_15.all.slice().sort()
      ) &&
      same(idFirstLast(filterCompositionRows(s15.path_b, "輕騎")), [
        ["cavalry_lv2", 4, 7],
      ]),
    {
      count: idFirstLast(sortCompositionRows(s15.path_b, "count")),
      search: idFirstLast(filterCompositionRows(s15.path_b, "輕騎")),
    }
  );
}
{
  // 資料問題：第 2、5 波缺少；第 3 波重複（第二筆的 cavalry_lv1 遊戲不用）；第 4 波 grunt_lv2 數量無法判讀；第 6 波只有找不到設定的組。
  // grunt_lv2 已確認出兵的是第 1、3 波：末次是 3，不是有它但數量無法確定的第 4 波，也不是最後一筆資料的第 6 波
  const p = buildStagePreview(
    deepFreeze(
      stage(
        {
          path_a: [
            [0, 5],
            [13, 5],
          ],
        },
        [
          { wave: 1, enemies: [g("grunt_lv2", 2, 1, "path_a")] },
          { wave: 3, enemies: [g("grunt_lv2", 3, 1, "path_a")] },
          { wave: 3, enemies: [g("cavalry_lv1", 9, 1, "path_a")] },
          { wave: 4, enemies: [g("grunt_lv2", "many", 1, "path_a")] },
          { wave: 6, enemies: [g("ghost", 2, 1, "path_a")] },
        ]
      )
    ),
    deepFreeze(ENEMIES)
  );
  const c = stageComposition(p);
  const r = routeComposition(p, "path_a", c);
  check(
    "末次已確認出兵（資料問題）：grunt_lv2 只算已確認的第 1、3 波，末次是第 3 波（不是數量無法確定的第 4 波、不是最後一筆資料的第 6 波）；重複波次第二筆的 cavalry_lv1、找不到設定的組沒有列；資料不完整",
    same(idFirstLast(c.rows), [["grunt_lv2", 1, 3]]) &&
      same(idFirstLast(r.rows), [["grunt_lv2", 1, 3]]) &&
      !c.complete,
    { rows: idFirstLast(c.rows), route: idFirstLast(r.rows), gaps: c.gaps }
  );
  const row = deepFreeze({
    perWave: [
      { wave: 2, count: 1 },
      { wave: 5, count: 3 },
    ],
  });
  check(
    "末次已確認出兵（輸入）：沒有已確認的筆數回傳 null（不補全關的最後一波、不當成 0）；只有一筆時就是那一波；不改傳入的列（凍結的列照樣可以讀）",
    lastConfirmedWave({ perWave: [] }) === null &&
      lastConfirmedWave({ perWave: [{ wave: 4, count: 2 }] }) === 4 &&
      lastConfirmedWave(row) === 5 &&
      row.perWave.length === 2
  );
  // 設定更新：末次改成新的資料
  const updated = buildStagePreview(
    stage(
      {
        path_a: [
          [0, 5],
          [13, 5],
        ],
      },
      [
        { wave: 1, enemies: [g("grunt_lv2", 2, 1, "path_a")] },
        { wave: 2, enemies: [g("grunt_lv2", 2, 1, "path_a")] },
      ]
    ),
    ENEMIES
  );
  check(
    "末次已確認出兵（設定更新）：新的資料只有第 1、2 波時 grunt_lv2 的末次是第 2 波（用最新的資料，不留舊的第 3 波）",
    same(idFirstLast(stageComposition(updated).rows), [["grunt_lv2", 1, 2]])
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
