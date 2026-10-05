// 敵軍預覽的依路線組成與設定出兵節奏的網頁端規則測試，不需要瀏覽器：
// - utils/stageComposition 的 routeComposition：只看 path 等於選的路線的組，依 enemy_id 合計、第一次出現的順序、記下出兵的波次；
//   全關的出兵都能確定時合計才是這條路線的全部，否則只寫已確認（缺波、遊戲會拒絕、無法確定的組都不補 0）；沒有路點的路線不會出現；
//   各路線已確認的合計加起來等於全關；不改輸入
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
const { routeComposition, stageComposition } = require(
  join(UTILS, "stageComposition.ts")
);
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

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
