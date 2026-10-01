// 關卡能不能出征、敵人設定的對武將攻擊力與免疫減速的網頁端規則測試，不需要瀏覽器：
// - utils/stagePlayability：整關沒有有效路線或沒有波次是「尚未開放」（和敵軍預覽的判讀一致：有路點的路線、編號 1 以上的波次）；
//   第 1 波沒有可以出兵的組、之後的波次缺資料、混合有效與無效的組都不擋（照舊由遊戲逐波拒絕或略過）；
//   設定還沒載入、讀取失敗、找不到關卡、未解鎖、可以出征分開；資料未完成優先於未解鎖（不說成還沒通關）；
//   進度內最後一個可以出征的關卡；給玩家的說明
// - utils/enemyCombat：atk 只接受有限、不小於 0 的數字（0 照用），其他一律 20、不設上限；trait 只認字串 immune_slow（前後空白可以），
//   其他值是遊戲不使用的特性；和 Godot Enemy.gd 的預設值與字串相同
// - utils/stagePreview：敵軍預覽的每一組帶遊戲實際用的攻擊力（含預設值）與免疫減速
// - Godot 原始碼：不再有內建測試波次的替補、沒有波次時拒絕第 1 波（靜態確認；行為由 Godot 測試驗證）
// 用法：node scripts/shenma-regression/web/stage-data.test.mjs
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
  stageDataProblem,
  stageDataProblemText,
  stageAccess,
  stageAccessMessage,
  latestPlayableStage,
  isPlayable,
} = require(join(UTILS, "stagePlayability.ts"));
const {
  enemyBlockerAtk,
  enemyTraitInfo,
  blockerAtkText,
  ENEMY_BLOCKER_ATK_DEFAULT,
  TRAIT_IMMUNE_SLOW,
} = require(join(UTILS, "enemyCombat.ts"));
const { buildStagePreview } = require(join(UTILS, "stagePreview.ts"));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail).slice(0, 900)}`
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

// ── 測試資料（合成，不是正式設定表）──
const PATH = {
  cols: 14,
  rows: 11,
  paths: {
    path_a: [
      [0, 5],
      [13, 5],
    ],
  },
  base: [13, 5],
};
// GAS 在 path_json 空白或無法解析時回傳的形狀
const GAS_EMPTY_PATH = { paths: [], spawn: [], base: [] };
const g = (enemy_id, count = 3, path = "path_a") => ({
  enemy_id,
  count,
  interval: 1,
  path,
});
const map = (map_id, path_json, waves, name = map_id) => ({
  map_id,
  chapter: 1,
  name,
  unlock_stage: map_id,
  path_json,
  waves,
});
const W = (...list) => list.map((enemies, i) => ({ wave: i + 1, enemies }));
const ENEMIES = [
  { enemy_id: "grunt", name: "步兵", hp: 300, speed: 80, atk: 20 },
  { enemy_id: "grunt2", name: "步兵二", hp: 480, speed: 85, atk: 32 },
  {
    enemy_id: "cav",
    name: "輕騎",
    hp: 200,
    speed: 160,
    atk: 30,
    trait: "immune_slow",
  },
  {
    enemy_id: "cav_pad",
    name: "騎兵空白",
    hp: 200,
    speed: 160,
    atk: 45,
    trait: "  immune_slow  ",
  },
  {
    enemy_id: "siege",
    name: "攻城車",
    hp: 1500,
    speed: 40,
    atk: 120,
    trait: "",
  },
  { enemy_id: "zero", name: "零攻", hp: 10, speed: 40, atk: 0 },
  { enemy_id: "noatk", name: "舊兵", hp: 20, speed: 60 },
  { enemy_id: "stratk", name: "字串攻", hp: 20, speed: 60, atk: "32" },
  { enemy_id: "caps", name: "大寫", hp: 20, speed: 60, trait: "Immune_Slow" },
  { enemy_id: "other", name: "其他特性", hp: 20, speed: 60, trait: "armored" },
];

block("路線與波次的資料問題", () => {
  const ok = map("ok", PATH, W([g("grunt")]));
  const cases = {
    gasBlank: stageDataProblem(map("a", GAS_EMPTY_PATH, [])),
    nullPath: stageDataProblem(map("b", null, W([g("grunt")]))),
    emptyStr: stageDataProblem(map("c", "", W([g("grunt")]))),
    badJson: stageDataProblem(map("d", "{bad json", W([g("grunt")]))),
    goodJsonStr: stageDataProblem(
      map("e", JSON.stringify(PATH), W([g("grunt")]))
    ),
    number: stageDataProblem(map("f", 123, W([g("grunt")]))),
    array: stageDataProblem(
      map(
        "g",
        [
          [0, 5],
          [13, 5],
        ],
        W([g("grunt")])
      )
    ),
    emptyPaths: stageDataProblem(
      map("h", { paths: { path_a: [] } }, W([g("grunt")]))
    ),
    noWaves: stageDataProblem(map("i", PATH, [])),
    wavesNull: stageDataProblem(map("j", PATH, null)),
    wavesStr: stageDataProblem(map("k", PATH, "wave1")),
    wavesZero: stageDataProblem(
      map("l", PATH, [{ wave: 0, enemies: [g("grunt")] }])
    ),
    wavesNotObj: stageDataProblem(map("m", PATH, [1, 2, null])),
    ok: stageDataProblem(ok),
  };
  check(
    "資料-1 路線：GAS 空白／無法解析的形狀、null、空字串、無法解析的字串、數字、陣列以外的格式錯誤、路線沒有路點都是缺路線；可以解析的字串照常；原因分得開（沒有路線資料／無法解析／格式不對／沒有可用的路線）",
    same(cases.gasBlank.gaps, ["route", "waves"]) &&
      same(cases.nullPath, { gaps: ["route"], reasons: ["沒有路線資料"] }) &&
      same(cases.emptyStr, { gaps: ["route"], reasons: ["沒有路線資料"] }) &&
      same(cases.badJson, {
        gaps: ["route"],
        reasons: ["路線資料的格式無法解析"],
      }) &&
      cases.goodJsonStr === null &&
      same(cases.number, {
        gaps: ["route"],
        reasons: ["路線資料的格式不對"],
      }) &&
      cases.array.gaps[0] === "route" &&
      same(cases.emptyPaths, {
        gaps: ["route"],
        reasons: ["沒有可用的路線"],
      }) &&
      same(cases.gasBlank.reasons, ["沒有可用的路線", "沒有波次資料"]),
    cases
  );
  check(
    "資料-2 波次：空陣列、null、不是陣列、只有編號 0、只有不是物件的項目都是缺波次（原因分得開）；完整的關卡沒有問題",
    same(cases.noWaves, { gaps: ["waves"], reasons: ["沒有波次資料"] }) &&
      same(cases.wavesNull, { gaps: ["waves"], reasons: ["沒有波次資料"] }) &&
      same(cases.wavesStr, {
        gaps: ["waves"],
        reasons: ["波次資料的格式不對"],
      }) &&
      same(cases.wavesZero, {
        gaps: ["waves"],
        reasons: ["沒有編號 1 以上的有效波次"],
      }) &&
      same(cases.wavesNotObj, {
        gaps: ["waves"],
        reasons: ["沒有編號 1 以上的有效波次"],
      }) &&
      cases.ok === null,
    cases
  );
  // 和敵軍預覽（遊戲的出兵判讀）一致：缺路線 ⇔ 沒有有路點的路線；缺波次 ⇔ 沒有編號 1 以上的波次
  const all = [
    map("x1", GAS_EMPTY_PATH, []),
    map("x2", PATH, []),
    map("x3", null, W([g("grunt")])),
    map("x4", PATH, W([g("grunt")])),
    map("x5", "{", [{ wave: -1 }]),
    map(
      "x6",
      {
        waypoints: [
          [0, 1],
          [5, 1],
        ],
      },
      W([g("grunt")])
    ),
  ];
  const agree = all.every((m) => {
    const p = buildStagePreview(m, ENEMIES);
    const d = stageDataProblem(m);
    const gaps = d ? d.gaps : [];
    return (
      gaps.includes("route") === (p.pathIds.length === 0) &&
      gaps.includes("waves") === (p.waves.length === 0)
    );
  });
  check(
    "資料-3 缺路線、缺波次的判讀和敵軍預覽一致（舊版 waypoints 也算路線）",
    agree,
    all.map((m) => [m.map_id, stageDataProblem(m)])
  );
});

block("只擋整關，逐波的問題照舊", () => {
  const firstAllInvalid = map(
    "p1",
    PATH,
    W([g("missing_cfg"), g("grunt", 0)], [g("grunt")])
  );
  const gap = map("p2", PATH, [
    { wave: 1, enemies: [g("grunt")] },
    { wave: 3, enemies: [g("grunt")] },
  ]);
  const mixed = map("p3", PATH, W([g("missing_cfg"), g("grunt", 2)]));
  const badPathGroup = map("p4", PATH, W([g("grunt", 2, "path_x")]));
  const laterMissing = map("p5", PATH, W([g("grunt")], []));
  const probs = [firstAllInvalid, gap, mixed, badPathGroup, laterMissing].map(
    stageDataProblem
  );
  const previews = [firstAllInvalid, badPathGroup].map(
    (m) => buildStagePreview(m, ENEMIES).waves[0].rejected
  );
  check(
    "逐波-1 第 1 波所有組都無效、第 1 波的組都引用不存在的路線、之後的波次缺號或空波、同一波混合有效與無效的組：都不算資料未完成（照舊由遊戲打到那一波時拒絕或略過）；預覽照舊標出第 1 波會被拒絕",
    probs.every((p) => p === null) && previews.every((r) => r === true),
    { probs, previews }
  );
});

block("出征判斷（兩個入口共用）", () => {
  // 和正式資料同樣的分布（合成）：1_1～1_6 完整、1_7 有路線沒有波次、1_8 GAS 空白
  const maps = [
    ...[1, 2, 3, 4, 5, 6].map((n) =>
      map(`chapter1_${n}`, PATH, W([g("grunt")]), `第${n}關`)
    ),
    map("chapter1_7", PATH, [], "第7關"),
    map("chapter1_8", GAS_EMPTY_PATH, [], "第8關"),
  ];
  const config = { heroesConfig: [], enemiesConfig: ENEMIES, maps };
  const a = (mapId, maxStage, extra = {}) =>
    stageAccess({ mapId, config, maxStage, ...extra });
  const r = {
    loading: stageAccess({
      mapId: "chapter1_1",
      config: null,
      maxStage: "chapter1_7",
    }),
    failed: stageAccess({
      mapId: "chapter1_1",
      config: null,
      configError: "GAS_ERROR",
      maxStage: "chapter1_7",
    }),
    notFound: a("chapter9_9", "chapter1_7"),
    empty: a("", "chapter1_7"),
    playable: a("chapter1_6", "chapter1_7"),
    lockedValid: a("chapter1_6", "chapter1_3"),
    incompleteUnlocked: a("chapter1_7", "chapter1_7"),
    incompleteLocked: a("chapter1_8", "chapter1_7"),
    noPlayer: a("chapter1_6", null),
    noPlayerIncomplete: a("chapter1_7", null),
  };
  check(
    "出征-1 設定還沒載入 loading、讀取失敗 config_failed（帶錯誤代碼）、設定裡沒有 not_found、玩家資料還沒載入時完整的關卡是 loading（不知道有沒有解鎖）",
    r.loading.status === "loading" &&
      r.failed.status === "config_failed" &&
      r.failed.error === "GAS_ERROR" &&
      r.notFound.status === "not_found" &&
      r.notFound.mapId === "chapter9_9" &&
      r.empty.status === "not_found" &&
      r.noPlayer.status === "loading",
    r
  );
  check(
    "出征-2 未解鎖與資料未完成分開：完整但進度未到 locked；1_7（有路線沒有波次）已解鎖時 incomplete、locked=false；1_8（GAS 空白）incomplete、同時未解鎖 locked=true（資料未完成優先，不說成還沒通關）；玩家資料還沒載入時資料未完成照樣 incomplete",
    r.lockedValid.status === "locked" &&
      r.incompleteUnlocked.status === "incomplete" &&
      r.incompleteUnlocked.locked === false &&
      same(r.incompleteUnlocked.problem.gaps, ["waves"]) &&
      r.incompleteLocked.status === "incomplete" &&
      r.incompleteLocked.locked === true &&
      same(r.incompleteLocked.problem.gaps, ["route", "waves"]) &&
      r.noPlayerIncomplete.status === "incomplete" &&
      r.playable.status === "playable" &&
      isPlayable(r.playable) &&
      r.playable.map.map_id === "chapter1_6" &&
      !isPlayable(r.incompleteUnlocked) &&
      !isPlayable(r.lockedValid) &&
      !isPlayable(r.loading),
    r
  );
  const latest = {
    at7: latestPlayableStage(maps, "chapter1_7")?.map_id,
    at3: latestPlayableStage(maps, "chapter1_3")?.map_id,
    at1: latestPlayableStage([maps[6], maps[7]], "chapter1_8"),
    reversed: latestPlayableStage([...maps].reverse(), "chapter1_7")?.map_id,
    noPlayer: latestPlayableStage(maps, null),
    noMaps: latestPlayableStage(null, "chapter1_7"),
  };
  check(
    "出征-3 進度內最後一個可以出征的關卡：進度 1_7（尚未開放）→ 1_6；進度 1_3 → 1_3；只有資料未完成的關卡 → 沒有；看關卡編號，不看設定裡的順序；沒有玩家或關卡時沒有",
    latest.at7 === "chapter1_6" &&
      latest.at3 === "chapter1_3" &&
      latest.at1 === null &&
      latest.reversed === "chapter1_6" &&
      latest.noPlayer === null &&
      latest.noMaps === null,
    latest
  );
  const msg = {
    incomplete: stageAccessMessage(r.incompleteLocked),
    unlockedIncomplete: stageAccessMessage(r.incompleteUnlocked),
    locked: stageAccessMessage(r.lockedValid, { progressName: "第3關" }),
    failed: stageAccessMessage(r.failed),
    notFound: stageAccessMessage(r.notFound),
    playable: stageAccessMessage(r.playable),
    loading: stageAccessMessage(r.loading),
  };
  check(
    "出征-4 說明：資料未完成是「尚未開放」並列出原因、寫明不是還沒通關、進度沒有改變（同時未解鎖時另外一行）；未解鎖是「尚未解鎖」並帶目前進度；讀取失敗帶錯誤代碼、可以重試；可以出征與載入中沒有說明",
    msg.incomplete.title === "「第8關」尚未開放" &&
      msg.incomplete.lines[0] ===
        "關卡資料未完成：沒有可用的路線、沒有波次資料。" &&
      /不是還沒通關，進度沒有改變/.test(msg.incomplete.lines[1]) &&
      msg.incomplete.lines.includes("這一關也還沒解鎖。") &&
      !msg.unlockedIncomplete.lines.includes("這一關也還沒解鎖。") &&
      msg.locked.title === "「第6關」尚未解鎖" &&
      /目前進度：第3關/.test(msg.locked.lines[0]) &&
      msg.failed.title === "遊戲設定讀取失敗" &&
      /GAS_ERROR/.test(msg.failed.lines[0]) &&
      /重試/.test(msg.failed.lines[1]) &&
      /chapter9_9/.test(msg.notFound.lines[0]) &&
      msg.playable === null &&
      msg.loading === null &&
      stageDataProblemText(r.incompleteUnlocked.problem) ===
        "關卡資料未完成：沒有波次資料",
    msg
  );
  // 凍結的輸入：判斷不改設定
  const frozen = JSON.parse(JSON.stringify(config));
  const deepFreeze = (o) => {
    if (o && typeof o === "object") {
      Object.values(o).forEach(deepFreeze);
      Object.freeze(o);
    }
    return o;
  };
  deepFreeze(frozen);
  const fa = stageAccess({
    mapId: "chapter1_8",
    config: frozen,
    maxStage: "chapter1_7",
  });
  check(
    "出征-5 凍結的設定照常判斷（不修改設定）",
    fa.status === "incomplete" && fa.locked === true,
    fa
  );
});

block("對武將攻擊力", () => {
  const v = (atk) => enemyBlockerAtk({ atk });
  const cases = {
    n20: v(20),
    n32: v(32),
    n120: v(120),
    zero: v(0),
    frac: v(12.5),
    big: v(1e6),
    missing: enemyBlockerAtk({}),
    nul: v(null),
    blank: v(""),
    str: v("32"),
    neg: v(-5),
    nan: v(NaN),
    inf: v(Infinity),
    ninf: v(-Infinity),
    bool: v(true),
    obj: v({}),
    noCfg: enemyBlockerAtk(null),
  };
  const fb = (x) => x.value === 20 && x.fallback === true;
  check(
    "攻擊-1 有限、不小於 0 的數字照用（20、32、120、0、12.5、1000000 不設上限；0 不回退成 20）",
    same(cases.n20, { value: 20, fallback: false }) &&
      same(cases.n32, { value: 32, fallback: false }) &&
      same(cases.n120, { value: 120, fallback: false }) &&
      same(cases.zero, { value: 0, fallback: false }) &&
      cases.frac.value === 12.5 &&
      same(cases.big, { value: 1e6, fallback: false }),
    cases
  );
  check(
    '攻擊-2 沒有欄位、null、空白、字串（包括 "32"）、負數、NaN、無限大、布林、物件、沒有設定：一律 20 並標成預設值',
    [
      cases.missing,
      cases.nul,
      cases.blank,
      cases.str,
      cases.neg,
      cases.nan,
      cases.inf,
      cases.ninf,
      cases.bool,
      cases.obj,
      cases.noCfg,
    ].every(fb) && ENEMY_BLOCKER_ATK_DEFAULT === 20,
    cases
  );
  check(
    "攻擊-3 說明寫「對武將攻擊力」、預設值寫明是遊戲以預設值計；不寫成對城池的傷害",
    blockerAtkText(cases.n32) === "對武將攻擊力 32" &&
      /^對武將攻擊力 20（預設值：設定沒有有效的數字）$/.test(
        blockerAtkText(cases.blank)
      ) &&
      !/城/.test(blockerAtkText(cases.n32) + blockerAtkText(cases.blank)),
    [blockerAtkText(cases.n32), blockerAtkText(cases.blank)]
  );
});

block("免疫減速", () => {
  const t = (trait) => enemyTraitInfo({ trait });
  const cases = {
    exact: t("immune_slow"),
    padded: t("  immune_slow\t"),
    caps: t("Immune_Slow"),
    combo: t("immune_slow,armored"),
    other: t("armored"),
    blank: t(""),
    spaces: t("   "),
    nul: t(null),
    missing: enemyTraitInfo({}),
    num: t(1),
    bool: t(true),
    noCfg: enemyTraitInfo(undefined),
  };
  check(
    "免疫-1 只有字串 immune_slow（前後空白可以）免疫減速；大小寫不同、合在一起寫的、其他值都不是，並列為遊戲不使用的特性；空白、null、沒有欄位不列；數字、布林不是免疫",
    same(cases.exact, { immuneSlow: true, unused: null }) &&
      same(cases.padded, { immuneSlow: true, unused: null }) &&
      same(cases.caps, { immuneSlow: false, unused: "Immune_Slow" }) &&
      same(cases.combo, { immuneSlow: false, unused: "immune_slow,armored" }) &&
      same(cases.other, { immuneSlow: false, unused: "armored" }) &&
      same(cases.blank, { immuneSlow: false, unused: null }) &&
      same(cases.spaces, { immuneSlow: false, unused: null }) &&
      same(cases.nul, { immuneSlow: false, unused: null }) &&
      same(cases.missing, { immuneSlow: false, unused: null }) &&
      same(cases.num, { immuneSlow: false, unused: "1" }) &&
      cases.bool.immuneSlow === false &&
      same(cases.noCfg, { immuneSlow: false, unused: null }) &&
      TRAIT_IMMUNE_SLOW === "immune_slow",
    cases
  );
});

block("敵軍預覽帶攻擊力與免疫減速", () => {
  const m = map(
    "pv",
    PATH,
    W(
      [
        g("grunt2", 2),
        g("cav", 3),
        g("siege", 1),
        g("zero", 1),
        g("noatk", 1),
        g("stratk", 1),
        g("caps", 1),
        g("other", 1),
        g("cav_pad", 1),
      ],
      [g("missing_cfg", 1)]
    )
  );
  const p = buildStagePreview(m, ENEMIES);
  const by = Object.fromEntries(p.waves[0].groups.map((x) => [x.enemyId, x]));
  const miss = p.waves[1].groups[0];
  check(
    '預覽-1 每一組帶遊戲實際用的攻擊力：32、30、120、0 照用；沒有欄位與字串 "32" 是預設 20；找不到敵人設定時沒有攻擊力（null）',
    same(by.grunt2.blockerAtk, { value: 32, fallback: false }) &&
      same(by.cav.blockerAtk, { value: 30, fallback: false }) &&
      same(by.siege.blockerAtk, { value: 120, fallback: false }) &&
      same(by.zero.blockerAtk, { value: 0, fallback: false }) &&
      same(by.noatk.blockerAtk, { value: 20, fallback: true }) &&
      same(by.stratk.blockerAtk, { value: 20, fallback: true }) &&
      miss.blockerAtk === null,
    { by, miss }
  );
  check(
    "預覽-2 免疫減速只看 trait：cav 與前後有空白的 cav_pad 是；大寫、其他特性、空白、沒有欄位都不是；其他特性另外列出遊戲不使用；找不到設定時不是免疫",
    by.cav.immuneSlow &&
      by.cav_pad.immuneSlow &&
      !by.caps.immuneSlow &&
      !by.other.immuneSlow &&
      !by.siege.immuneSlow &&
      !by.grunt2.immuneSlow &&
      by.caps.unusedTrait === "Immune_Slow" &&
      by.other.unusedTrait === "armored" &&
      by.siege.unusedTrait === null &&
      by.cav.unusedTrait === null &&
      miss.immuneSlow === false &&
      miss.unusedTrait === null,
    by
  );
  check(
    "預覽-3 攻擊力與免疫減速不影響出兵判讀與資料不完整（預設 20 不算資料不完整；第 1 波 12 隻、不拒絕）",
    p.waves[0].total === 12 &&
      !p.waves[0].rejected &&
      by.noatk.notes.length === 0 &&
      by.stratk.notes.length === 0,
    p.waves[0]
  );
});

block("和 Godot 原始碼一致", () => {
  const enemy = readFileSync(join(GODOT, "entities/enemy/Enemy.gd"), "utf8");
  const main = readFileSync(join(GODOT, "main/Main.gd"), "utf8");
  const bm = readFileSync(join(GODOT, "systems/BattleManager.gd"), "utf8");
  const def = (enemy.match(/const BLOCKER_ATK_DEFAULT: float = ([0-9.]+)/) ||
    [])[1];
  const trait = (enemy.match(/const TRAIT_IMMUNE_SLOW: String = "([^"]+)"/) ||
    [])[1];
  check(
    "原始碼-1 Godot 的預設攻擊力與免疫減速的字串和 Web 相同（20、immune_slow）；攻擊阻路武將用設定的攻擊力（顏良的威壓在攻擊當下乘上倍率），並傳入自己當作攻擊者",
    Number(def) === ENEMY_BLOCKER_ATK_DEFAULT &&
      trait === TRAIT_IMMUNE_SLOW &&
      /var hit_atk: float = effective_blocker_atk\(\)/.test(enemy) &&
      /_blocker\.take_damage\(hit_atk, self\)/.test(enemy) &&
      /func effective_blocker_atk\(\) -> float:\r?\n\treturn blocker_atk \* atk_mult/.test(
        enemy
      ),
    { def, trait }
  );
  check(
    "原始碼-2 Godot 不再有內建測試波次的替補（沒有 _build_default_waves）；總波數 0 時不直接返回（會拒絕第 1 波）",
    !/_build_default_waves/.test(main) &&
      /if next_wave > total_waves and total_waves > 0:/.test(bm),
    null
  );
});

const failed = results.filter((r) => !r.pass).length;
console.log(
  "RESULT_JSON " +
    JSON.stringify({ total: results.length, failed, results: results })
);
process.exit(failed > 0 ? 1 : 0);
