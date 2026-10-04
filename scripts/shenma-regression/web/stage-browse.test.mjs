// 關卡搜尋與狀態篩選、敵軍預覽的敵軍組成的網頁端規則測試，不需要瀏覽器：
// - utils/stageFilter：名稱或 id（去掉頭尾空白、英文字母不分大小寫）、章節、狀態（可出征／未解鎖／資料未完成）是「而且」；
//   狀態和卡片同一套判斷（資料未完成優先）；章節分組與組內順序和原本的畫面相同；章節選單只列設定裡已有的有效章節；
//   空結果、清除、進度或設定更新後重新計算；還沒讀到進度時不把資料完整的關卡當成未解鎖；不改輸入
// - utils/stageComposition：依 enemy_id 合計已確認會出兵的組（跨波相加、同名不同 id 分開、第一次出現的順序）；
//   同一波重複的資料只用第一筆、遊戲會略過的組與數量無法確定的組不算、缺波次時不是全關總數；找不到設定的 enemy_id 列為資料問題；
//   全關確定時合計等於預覽的全關總數；不改輸入
// 用法：node scripts/shenma-regression/web/stage-browse.test.mjs
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
  DEFAULT_STAGE_FILTER,
  filterStages,
  groupStagesByChapter,
  isDefaultStageFilter,
  stageCardStatus,
  stageChapters,
} = require(join(UTILS, "stageFilter.ts"));
const { stageComposition } = require(join(UTILS, "stageComposition.ts"));
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

// ── 關卡 ──
const PJ = {
  paths: {
    path_a: [
      [0, 5],
      [13, 5],
    ],
  },
};
const W1 = [
  { wave: 1, enemies: [{ enemy_id: "grunt", count: 2, path: "path_a" }] },
];
const map = (map_id, name, chapter, extra = {}) => ({
  map_id,
  name,
  chapter,
  unlock_stage: map_id,
  path_json: PJ,
  waves: W1,
  ...extra,
});
// 設定裡的順序刻意不是章節順序：第 2 章在前、第 1 章裡 1_3 在 1_1 前面
const MAPS = deepFreeze([
  map("chapter2_1", "界橋之戰", 2),
  map("chapter1_3", "討伐黃巾", 1),
  map("chapter1_1", "黃巾起義", 1),
  map("chapter1_10", "郿塢之戰", 1),
  map("chapter1_7", "汜水關", 1, { waves: [] }), // 缺波次：資料未完成
  map("chapter3_1", "官渡之戰", 3, {
    path_json: { paths: [], spawn: [], base: [] },
  }), // 空路線：資料未完成（也未解鎖）
  map("chapter3_2", "Mock Battle", 3),
]);
const ids = (r) => r.groups.flatMap((g) => g.maps.map((m) => m.map_id));
const f = (criteria, maxStage = "chapter1_3", maps = MAPS) =>
  filterStages(maps, { ...DEFAULT_STAGE_FILTER, ...criteria }, maxStage);

{
  const all = f({});
  check(
    "預設（全部）：全部關卡、章節由小到大、同一章照設定的順序；符合數＝總數",
    all.matched === 7 &&
      all.total === 7 &&
      same(
        all.groups.map((g) => g.chapter),
        [1, 2, 3]
      ) &&
      same(ids(all), [
        "chapter1_3",
        "chapter1_1",
        "chapter1_10",
        "chapter1_7",
        "chapter2_1",
        "chapter3_1",
        "chapter3_2",
      ]) &&
      isDefaultStageFilter(DEFAULT_STAGE_FILTER),
    { groups: all.groups.map((g) => [g.chapter, g.maps.map((m) => m.map_id)]) }
  );
}
{
  const zh = f({ query: "黃巾" });
  const id = f({ query: "  CHAPTER1_1 " });
  const mixed = f({ query: "mock" });
  check(
    "搜尋：中文名稱部分文字；id 去掉頭尾空白、不分大小寫（chapter1_1 也比對到 chapter1_10）；英文名稱不分大小寫",
    same(ids(zh), ["chapter1_3", "chapter1_1"]) &&
      same(ids(id), ["chapter1_1", "chapter1_10"]) &&
      same(ids(mixed), ["chapter3_2"]),
    { zh: ids(zh), id: ids(id), mixed: ids(mixed) }
  );
}
{
  const st = Object.fromEntries(
    MAPS.map((m) => [m.map_id, stageCardStatus(m, "chapter1_3")])
  );
  check(
    "狀態：資料未完成優先（缺波次、空路線，空路線那一關也未解鎖仍是資料未完成），其他依進度分可出征／未解鎖",
    same(st, {
      chapter2_1: "locked",
      chapter1_3: "playable",
      chapter1_1: "playable",
      chapter1_10: "locked",
      chapter1_7: "incomplete",
      chapter3_1: "incomplete",
      chapter3_2: "locked",
    }),
    st
  );
  check(
    "狀態篩選：可出征／未解鎖／資料未完成各自的關卡",
    same(ids(f({ status: "playable" })), ["chapter1_3", "chapter1_1"]) &&
      same(ids(f({ status: "locked" })), [
        "chapter1_10",
        "chapter2_1",
        "chapter3_2",
      ]) &&
      same(ids(f({ status: "incomplete" })), ["chapter1_7", "chapter3_1"]),
    {
      playable: ids(f({ status: "playable" })),
      locked: ids(f({ status: "locked" })),
      incomplete: ids(f({ status: "incomplete" })),
    }
  );
}
{
  const and1 = f({ chapter: 1, status: "locked" });
  const and2 = f({ query: "之戰", chapter: 1, status: "locked" });
  const and3 = f({ query: "之戰", chapter: 2, status: "playable" });
  check(
    "條件是「而且」：章節＋狀態、再加搜尋；沒有符合時 0 關（空結果），總數不變",
    same(ids(and1), ["chapter1_10"]) &&
      same(ids(and2), ["chapter1_10"]) &&
      and3.matched === 0 &&
      and3.total === 7 &&
      and3.groups.length === 0 &&
      !and3.statusUnknown,
    { and1: ids(and1), and2: ids(and2), and3 }
  );
}
{
  const before = f({ status: "playable" }, "chapter1_3");
  const after = f({ status: "playable" }, "chapter2_1");
  const refreshed = f({ status: "playable" }, "chapter2_1", [
    ...MAPS,
    map("chapter1_2", "桃園結義", 1),
  ]);
  check(
    "進度更新、設定更新後重新計算（同樣的條件）：進度到 chapter2_1 多了 1_10、2_1；設定多一關就多一關",
    same(ids(before), ["chapter1_3", "chapter1_1"]) &&
      same(ids(after), [
        "chapter1_3",
        "chapter1_1",
        "chapter1_10",
        "chapter2_1",
      ]) &&
      same(ids(refreshed), [
        "chapter1_3",
        "chapter1_1",
        "chapter1_10",
        "chapter1_2",
        "chapter2_1",
      ]),
    { before: ids(before), after: ids(after), refreshed: ids(refreshed) }
  );
}
{
  const p = f({ status: "playable" }, null);
  const l = filterStages(
    MAPS,
    { ...DEFAULT_STAGE_FILTER, status: "locked" },
    undefined
  );
  const i = f({ status: "incomplete" }, null);
  const a = f({}, null);
  check(
    "還沒讀到玩家進度：可出征／未解鎖都是 0 關並標示不能判斷（不把資料完整的關卡當成未解鎖）；資料未完成與全部照常",
    p.matched === 0 &&
      p.statusUnknown &&
      l.matched === 0 &&
      l.statusUnknown &&
      same(ids(i), ["chapter1_7", "chapter3_1"]) &&
      !i.statusUnknown &&
      a.matched === 7 &&
      !a.statusUnknown &&
      stageCardStatus(MAPS[0], null) === null,
    { p, l, i: ids(i) }
  );
}
{
  const odd = deepFreeze([
    ...MAPS,
    map("chapter9_1", "沒有章節", undefined),
    map("chapter9_2", "文字章節", "2"),
  ]);
  const opts = stageChapters(odd);
  const all = f({}, "chapter1_3", odd);
  const ch2 = f({ chapter: 2 }, "chapter1_3", odd);
  // 原本兩個入口的分組寫法
  const original = {};
  odd.forEach((m) => {
    if (!original[m.chapter]) original[m.chapter] = [];
    original[m.chapter].push(m.map_id);
  });
  const originalOrder = Object.entries(original)
    .sort(([x], [y]) => Number(x) - Number(y))
    .map(([, v]) => v);
  check(
    "章節選單只列有效章節（去重、由小到大，不補造）；沒有有效章節的關卡只在全部章節出現，分組和原本的寫法相同",
    same(opts, [1, 2, 3]) &&
      all.matched === 9 &&
      same(
        groupStagesByChapter(odd).map((g) => g.maps.map((m) => m.map_id)),
        originalOrder
      ) &&
      same(ids(ch2), ["chapter2_1"]),
    {
      opts,
      groups: groupStagesByChapter(odd).map((g) => [
        g.chapter,
        g.maps.map((m) => m.map_id),
      ]),
      originalOrder,
      ch2: ids(ch2),
    }
  );
}
{
  let threw = null;
  try {
    f({ query: "黃", chapter: 1, status: "playable" });
    filterStages(null, DEFAULT_STAGE_FILTER, "chapter1_1");
  } catch (e) {
    threw = String(e);
  }
  const none = filterStages(null, DEFAULT_STAGE_FILTER, "chapter1_1");
  check(
    "不改輸入（凍結的設定照常篩選）；設定還沒讀到（不是陣列）時 0 關、不丟錯",
    threw === null &&
      none.total === 0 &&
      none.matched === 0 &&
      none.groups.length === 0,
    { threw, none }
  );
}

// ── 敵軍組成 ──
const ENEMIES = deepFreeze([
  { enemy_id: "grunt", name: "步兵", hp: 300, speed: 80 },
  { enemy_id: "grunt_b", name: "步兵", hp: 480, speed: 85 }, // 同名不同 id
  {
    enemy_id: "flyer",
    name: "飛騎",
    hp: 100,
    speed: 120,
    movement_type: "flying",
  },
  { enemy_id: "cav", name: "輕騎", hp: 200, speed: 160 },
]);
const g = (enemy_id, count, path = "path_a") => ({
  enemy_id,
  count,
  interval: 1,
  path,
});
const stage = (waves) =>
  deepFreeze({
    map_id: "chapter1_1",
    name: "測試",
    chapter: 1,
    unlock_stage: "chapter1_1",
    path_json: PJ,
    waves,
  });
const comp = (waves) => {
  const m = stage(waves);
  const p = buildStagePreview(m, ENEMIES);
  return { p, c: stageComposition(p) };
};
const rowsOf = (c) =>
  c.rows.map((r) => [
    r.enemyId,
    r.name,
    r.count,
    r.movement && r.movement.value,
    r.firstWave,
  ]);

{
  const { p, c } = comp([
    { wave: 1, enemies: [g("cav", 2), g("grunt", 3), g("flyer", 2)] },
    { wave: 2, enemies: [g("grunt_b", 4), g("grunt", 1)] },
    { wave: 3, enemies: [g("cav", 5)] },
  ]);
  check(
    "完整的關卡：跨波相加、依第一次出現的順序；同名不同 id 分開；移動方式照設定；合計＝預覽的全關總數",
    c.complete &&
      p.total === 17 &&
      c.confirmed === 17 &&
      same(rowsOf(c), [
        ["cav", "輕騎", 7, "ground", 1],
        ["grunt", "步兵", 4, "ground", 1],
        ["flyer", "飛騎", 2, "flying", 1],
        ["grunt_b", "步兵", 4, "ground", 2],
      ]) &&
      c.gaps.length === 0 &&
      c.unknownIds.length === 0,
    { total: p.total, c }
  );
}
{
  const { p, c } = comp([
    { wave: 1, enemies: [g("grunt", 2)] },
    { wave: 1, enemies: [g("cav", 9)] }, // 同一波重複：遊戲只用第一筆
    { wave: 2, enemies: [g("grunt", 1)] },
  ]);
  check(
    "同一波有重複的資料只用第一筆（重複那筆的輕騎不算）",
    c.complete &&
      p.total === 3 &&
      same(rowsOf(c), [["grunt", "步兵", 3, "ground", 1]]),
    { total: p.total, rows: rowsOf(c) }
  );
}
{
  const { p, c } = comp([
    {
      wave: 1,
      enemies: [
        { enemy_id: "", count: 1, path: "path_a" }, // 空白列
        g("ghost", 3), // 找不到設定：遊戲略過
        g("grunt", 0), // 數量 0：遊戲略過
        g("grunt", 2, "path_x"), // 路線沒有路點：遊戲略過
        g("cav", 2),
      ],
    },
    { wave: 2, enemies: [g("ghost", 1), g("grunt", 1)] },
  ]);
  check(
    "遊戲會略過的組不算（找不到設定、數量 0、路線沒有路點）；找不到設定的 enemy_id 列為資料問題（去重），不造敵人；其他組照常",
    c.complete &&
      p.total === 3 &&
      same(rowsOf(c), [
        ["cav", "輕騎", 2, "ground", 1],
        ["grunt", "步兵", 1, "ground", 2],
      ]) &&
      same(c.unknownIds, ["ghost"]) &&
      c.skipped === 4,
    { total: p.total, c }
  );
}
{
  const { p, c } = comp([
    { wave: 1, enemies: [g("grunt", 2), g("cav", "abc")] }, // 數量無法判讀
    { wave: 3, enemies: [g("flyer", 1)] }, // 缺第 2 波
  ]);
  check(
    "數量無法確定的組不算、缺波次：不是全關總數（complete＝false、預覽總數也是 null），已確認的組照列、原因寫明是哪幾波",
    !c.complete &&
      p.total === null &&
      c.confirmed === 3 &&
      same(rowsOf(c), [
        ["grunt", "步兵", 2, "ground", 1],
        ["flyer", "飛騎", 1, "flying", 3],
      ]) &&
      c.gaps.some((x) => /第 2 波沒有資料/.test(x)) &&
      c.gaps.some((x) => /第 1 波有無法確定/.test(x)),
    { total: p.total, c }
  );
}
{
  const { c } = comp([{ wave: 1, enemies: [g("ghost", 2), g("grunt", 0)] }]);
  const empty = stageComposition(buildStagePreview(stage([]), ENEMIES));
  check(
    "沒有任何已確認的組（整波都會被略過、或沒有波次）：組成是空的、不是全關總數，原因照實寫（遊戲會拒絕、沒有波次）",
    c.rows.length === 0 &&
      !c.complete &&
      c.confirmed === 0 &&
      c.gaps.some((x) => /第 1 波沒有可以出兵的組/.test(x)) &&
      empty.rows.length === 0 &&
      !empty.complete &&
      empty.gaps.some((x) => /沒有提供波次/.test(x)),
    { c, empty }
  );
}
{
  const waves = [{ wave: 1, enemies: [g("grunt", 2)] }];
  const m = stage(waves);
  const p = buildStagePreview(m, ENEMIES);
  const snapshot = JSON.stringify(p);
  const c = stageComposition(p);
  c.rows[0].count = 999; // 回傳的是新物件，改它不影響預覽
  check(
    "不改輸入：凍結的關卡與敵人設定照常計算；組成的列是新物件，不改預覽的逐波內容",
    JSON.stringify(p) === snapshot && p.waves[0].groups[0].count === 2,
    { p }
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
