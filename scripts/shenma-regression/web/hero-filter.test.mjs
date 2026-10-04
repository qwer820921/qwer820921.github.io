// 神馬三國武將列表的搜尋、職業篩選與排序（utils/heroFilter.ts）測試，不需要瀏覽器
// - 用專案內的 TypeScript 即時轉譯 heroFilter.ts（主頁武將視窗、武將頁與隊伍編排共用的純函式）與 heroCategories.ts
// - 涵蓋：名稱／id 的部分文字、頭尾空白、英文字母大小寫；職業篩選（含法師與「其他」）與組合；空結果與符合數；
//   等級／攻擊力（高→低）與升級費用、出陣費用（低→高）的排序、同值維持原清單順序、數值不是用格式化文字比較；
//   沒有升級紀錄的武將是 Lv1 與基礎屬性；不改動傳入的資料；職業與稀有度的名稱、顏色與不認得的值；
//   武將列表的對空（沿用 heroCanHitAir）與上陣（存檔隊伍的有效 hero_id、去重；沒有隊伍資料時不能判斷）篩選與組合
// 用法：node scripts/shenma-regression/web/hero-filter.test.mjs
// 反向驗證：HERO_FILTER_SRC 指向改壞的 heroFilter.ts 時應該要有測試失敗
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const UTILS = join(ROOT, "src/app/(games)/shenmaSanguo/utils");
const REAL = join(UTILS, "heroFilter.ts");
const SRC = process.env.HERO_FILTER_SRC
  ? resolve(process.env.HERO_FILTER_SRC)
  : REAL;

require.extensions[".ts"] = (module, filename) => {
  const source =
    filename === REAL
      ? readFileSync(SRC, "utf8")
      : readFileSync(filename, "utf8");
  const out = ts.transpileModule(source, {
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
  filterAndSortHeroes,
  resolveHeroState,
  heroUpgradeCost,
  isDefaultHeroFilter,
  teamHeroIdSet,
  matchesAir,
  DEFAULT_HERO_FILTER,
  HERO_JOB_OPTIONS,
  HERO_SORT_OPTIONS,
  TEAM_SORT_OPTIONS,
  HERO_AIR_OPTIONS,
  HERO_TEAM_OPTIONS,
  OTHER_JOB,
} = require(REAL);
const { heroCanHitAir } = require(join(UTILS, "antiAir.ts"));
const {
  jobInfo,
  rarityInfo,
  HERO_JOBS,
  HERO_RARITIES,
  UNKNOWN_CATEGORY_COLOR,
} = require(join(UTILS, "heroCategories.ts"));

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
    check(
      `${name}（執行時拋出例外）`,
      false,
      String((e && e.stack) || e)
        .split(/\r?\n/)
        .slice(0, 2)
        .join(" | ")
    );
  }
};

const cfg = (hero_id, name, job, over = {}) => ({
  hero_id,
  name,
  rarity: "orange",
  cost: 8,
  job,
  base_atk: 100,
  base_def: 80,
  base_hp: 1000,
  attack_range: 1.5,
  attack_speed: 1.2,
  upgrade_cost_base: 100,
  atk_growth: 10,
  def_growth: 8,
  hp_growth: 100,
  range_growth: 0,
  atk_spd_growth: 0,
  ...over,
});
// 設定的原始順序：關羽、趙雲、黃忠、周瑜（mage，不屬於四種職業）、張飛、Lu Bu（英文名稱）
const CONFIGS = [
  cfg("guan_yu", "關羽", "infantry", { upgrade_cost_base: 120 }),
  cfg("zhao_yun", "趙雲", "cavalry", { upgrade_cost_base: 90 }),
  cfg("huang_zhong", "黃忠", "archer", { base_atk: 130 }),
  cfg("zhou_yu", "周瑜", "mage", { base_atk: 122 }),
  cfg("zhang_fei", "張飛", "infantry", { base_atk: 999 }),
  cfg("lu_bu", "Lu Bu", "cavalry", { upgrade_cost_base: 250 }),
];
// 玩家存檔：關羽 Lv3、趙雲 Lv2、黃忠 Lv3（沒有紀錄的周瑜、張飛、Lu Bu 是 Lv1）
const HEROES = [
  { hero_id: "guan_yu", level: 3, star: 0, atk: 1000, def: 96, hp: 1200 },
  { hero_id: "zhao_yun", level: 2, star: 0, atk: 110, def: 88, hp: 1100 },
  { hero_id: "huang_zhong", level: 3, star: 0, atk: 150, def: 96, hp: 1200 },
];
const ids = (r) => r.items.map((e) => e.config.hero_id);
const run = (over, configs = CONFIGS, heroes = HEROES) =>
  filterAndSortHeroes(configs, heroes, { ...DEFAULT_HERO_FILTER, ...over });

block("搜尋", () => {
  const byName = run({ query: "關" });
  check(
    "武將篩選-1 名稱的部分文字：「關」只找到關羽，符合 1 位／共 6 位",
    JSON.stringify(ids(byName)) === '["guan_yu"]' &&
      byName.matched === 1 &&
      byName.total === 6,
    byName
  );
  const byId = run({ query: "ZHAO" });
  const byId2 = run({ query: "Zhang_Fei" });
  check(
    "武將篩選-2 id 的部分文字不分英文字母大小寫：ZHAO → 趙雲、Zhang_Fei → 張飛",
    JSON.stringify(ids(byId)) === '["zhao_yun"]' &&
      JSON.stringify(ids(byId2)) === '["zhang_fei"]',
    { byId: ids(byId), byId2: ids(byId2) }
  );
  // 設定的 id 本身有大寫字母時，小寫的搜尋文字也找得到
  const upperId = run({ query: "diao" }, [
    ...CONFIGS,
    cfg("Diao_Chan", "貂蟬", "archer"),
  ]);
  check(
    "武將篩選-2b 設定的 id 有大寫字母（Diao_Chan）時，小寫的 diao 也找得到",
    JSON.stringify(ids(upperId)) === '["Diao_Chan"]',
    ids(upperId)
  );
  const enName = run({ query: "lu b" });
  check(
    "武將篩選-3 英文名稱不分大小寫：「lu b」找到 Lu Bu",
    JSON.stringify(ids(enName)) === '["lu_bu"]',
    ids(enName)
  );
  const padded = run({ query: "  zhou　 " });
  const blank = run({ query: " \t　 " });
  check(
    "武將篩選-4 頭尾空白（含全形空白、tab）去掉後比對；只有空白時等於沒有搜尋（6／6、原順序）",
    JSON.stringify(ids(padded)) === '["zhou_yu"]' &&
      blank.matched === 6 &&
      JSON.stringify(ids(blank)) ===
        JSON.stringify(CONFIGS.map((c) => c.hero_id)),
    { padded: ids(padded), blank: ids(blank) }
  );
  const partial = run({ query: "_y" });
  check(
    "武將篩選-5 同時符合多位時維持原清單順序：「_y」→ 關羽、趙雲、周瑜",
    JSON.stringify(ids(partial)) === '["guan_yu","zhao_yun","zhou_yu"]',
    ids(partial)
  );
});

block("職業", () => {
  const inf = run({ job: "infantry" });
  const cav = run({ job: "cavalry" });
  check(
    "武將篩選-6 職業篩選：步兵 → 關羽、張飛；騎兵 → 趙雲、Lu Bu（總數仍是 6）",
    JSON.stringify(ids(inf)) === '["guan_yu","zhang_fei"]' &&
      JSON.stringify(ids(cav)) === '["zhao_yun","lu_bu"]' &&
      inf.total === 6 &&
      inf.matched === 2,
    { inf: ids(inf), cav: ids(cav) }
  );
  const combo = run({ job: "infantry", query: "zh" });
  const comboNone = run({ job: "archer", query: "關" });
  check(
    "武將篩選-7 搜尋與職業同時成立才顯示：步兵＋zh → 張飛；弓兵＋關 → 沒有",
    JSON.stringify(ids(combo)) === '["zhang_fei"]' &&
      comboNone.matched === 0 &&
      comboNone.items.length === 0,
    { combo: ids(combo), comboNone: ids(comboNone) }
  );
  const art = run({ job: "artillery" });
  const none = run({ query: "不存在的武將" });
  check(
    "武將篩選-8 空結果：砲兵（沒有砲兵武將）與找不到的文字都是 0 位，總數仍是 6",
    art.matched === 0 &&
      art.total === 6 &&
      none.matched === 0 &&
      none.total === 6 &&
      none.items.length === 0,
    { art, none }
  );
  const all = run({});
  check(
    "武將篩選-9 預設（全部職業、沒有搜尋、預設順序）：6 位全部依原順序，包含不屬於四種職業的周瑜",
    JSON.stringify(ids(all)) ===
      JSON.stringify(CONFIGS.map((c) => c.hero_id)) && all.matched === 6,
    ids(all)
  );
});

block("排序", () => {
  const lv = run({ sort: "level" });
  check(
    "武將篩選-10 等級高→低、同等級依原順序：關羽 Lv3、黃忠 Lv3、趙雲 Lv2，接著 Lv1 的周瑜、張飛、Lu Bu",
    JSON.stringify(ids(lv)) ===
      '["guan_yu","huang_zhong","zhao_yun","zhou_yu","zhang_fei","lu_bu"]',
    ids(lv)
  );
  const atk = run({ sort: "atk" });
  check(
    "武將篩選-11 攻擊力高→低用數值比較（1000 在 999 之前，不是文字排序）：關羽 1000、張飛 999（Lv1 基礎）、黃忠 150、周瑜 122、趙雲 110、Lu Bu 100",
    JSON.stringify(ids(atk)) ===
      '["guan_yu","zhang_fei","huang_zhong","zhou_yu","zhao_yun","lu_bu"]',
    ids(atk)
  );
  const cost = run({ sort: "cost" });
  check(
    "武將篩選-12 升級費用低→高（每級費用 × 目前等級）：周瑜 100、張飛 100（同值依原順序）、趙雲 180、Lu Bu 250、黃忠 300、關羽 360",
    JSON.stringify(ids(cost)) ===
      '["zhou_yu","zhang_fei","zhao_yun","lu_bu","huang_zhong","guan_yu"]' &&
      JSON.stringify(cost.items.map((e) => e.cost)) ===
        "[100,100,180,250,300,360]",
    cost.items.map((e) => [e.config.hero_id, e.cost])
  );
  // 格式化後相同（四捨五入都是 100）的攻擊力仍依實際數值排序；全部同值時完全維持原順序
  const close = run({ sort: "atk" }, CONFIGS.slice(0, 3), [
    { hero_id: "guan_yu", level: 1, star: 0, atk: 99.6, def: 1, hp: 1 },
    { hero_id: "zhao_yun", level: 1, star: 0, atk: 100.4, def: 1, hp: 1 },
    { hero_id: "huang_zhong", level: 1, star: 0, atk: 100, def: 1, hp: 1 },
  ]);
  const ties = run({ sort: "level" }, CONFIGS, []);
  check(
    "武將篩選-13 顯示同為 100 的 100.4、100、99.6 依實際數值排序；全部同值（都沒有紀錄、Lv1）時維持原清單順序",
    JSON.stringify(ids(close)) === '["zhao_yun","huang_zhong","guan_yu"]' &&
      JSON.stringify(ids(ties)) ===
        JSON.stringify(CONFIGS.map((c) => c.hero_id)),
    { close: ids(close), ties: ids(ties) }
  );
  const combo = run({ sort: "level", job: "infantry" });
  const comboCost = run({ sort: "cost", query: "u" });
  check(
    "武將篩選-14 排序套在篩選後的結果：步兵依等級 → 關羽、張飛；含 u 依費用 → 周瑜 100、趙雲 180、Lu Bu 250、黃忠 300、關羽 360",
    JSON.stringify(ids(combo)) === '["guan_yu","zhang_fei"]' &&
      JSON.stringify(ids(comboCost)) ===
        '["zhou_yu","zhao_yun","lu_bu","huang_zhong","guan_yu"]',
    { combo: ids(combo), comboCost: ids(comboCost) }
  );
  const bad = run({ sort: "level" }, CONFIGS.slice(0, 3), [
    { hero_id: "guan_yu", level: Number.NaN, star: 0, atk: 1, def: 1, hp: 1 },
    { hero_id: "zhao_yun", level: 2, star: 0, atk: 1, def: 1, hp: 1 },
  ]);
  check(
    "武將篩選-15 等級不是有效數字的資料排在最後、不打亂其他武將（趙雲 Lv2、黃忠 Lv1、關羽 NaN）",
    JSON.stringify(ids(bad)) === '["zhao_yun","huang_zhong","guan_yu"]',
    ids(bad)
  );
});

block("Lv1 與輸入不變", () => {
  const r = run({ query: "張飛" });
  const e = r.items[0];
  check(
    "武將篩選-16 沒有升級紀錄的武將用 Lv1 規則：等級 1、攻擊／防禦／血量是基礎值、費用＝每級費用 × 1",
    e &&
      e.hero.level === 1 &&
      e.hero.atk === 999 &&
      e.hero.def === 80 &&
      e.hero.hp === 1000 &&
      e.cost === 100,
    e
  );
  const g = resolveHeroState(CONFIGS[0], HEROES);
  check(
    "武將篩選-17 有紀錄的武將用存檔裡的數值（關羽 Lv3、攻擊 1000）；heroUpgradeCost 和升級按鈕同一個公式（120 × 3）",
    g.level === 3 && g.atk === 1000 && heroUpgradeCost(CONFIGS[0], g) === 360,
    g
  );
  const cfgBefore = JSON.stringify(CONFIGS);
  const heroesBefore = JSON.stringify(HEROES);
  const defBefore = JSON.stringify(DEFAULT_HERO_FILTER);
  for (const sort of ["default", "level", "atk", "cost"])
    run({ sort, query: "u", job: "cavalry" });
  check(
    "武將篩選-18 篩選與排序不改動傳入的設定清單、玩家武將與預設條件",
    JSON.stringify(CONFIGS) === cfgBefore &&
      JSON.stringify(HEROES) === heroesBefore &&
      JSON.stringify(DEFAULT_HERO_FILTER) === defBefore
  );
  const dup = run({ sort: "level" }, CONFIGS.slice(0, 1), [
    { hero_id: "guan_yu", level: 2, star: 0, atk: 1, def: 1, hp: 1 },
    { hero_id: "guan_yu", level: 9, star: 0, atk: 1, def: 1, hp: 1 },
  ]);
  check(
    "武將篩選-19 存檔裡同一位武將出現兩次時和既有畫面一樣取第一筆（Lv2）",
    dup.items[0] && dup.items[0].hero.level === 2,
    dup.items[0]
  );
});

block("選項", () => {
  check(
    "武將篩選-20 職業選項是全部、步兵、弓兵、砲兵、騎兵、法師、其他；武將列表的排序是預設、等級、攻擊力、升級費用；隊伍編排多了出陣費用",
    JSON.stringify(HERO_JOB_OPTIONS.map((o) => [o.value, o.label])) ===
      '[[null,"全部"],["infantry","步兵"],["archer","弓兵"],["artillery","砲兵"],["cavalry","騎兵"],["mage","法師"],["other","其他"]]' &&
      JSON.stringify(HERO_SORT_OPTIONS.map((o) => o.value)) ===
        '["default","level","atk","cost"]' &&
      JSON.stringify(TEAM_SORT_OPTIONS.map((o) => o.value)) ===
        '["default","level","atk","deploy","cost"]',
    {
      jobs: HERO_JOB_OPTIONS,
      sorts: HERO_SORT_OPTIONS,
      team: TEAM_SORT_OPTIONS,
    }
  );
  check(
    "武將篩選-21 預設條件的判斷：只有空白的搜尋仍算預設，任何職業或排序不是預設就不是",
    isDefaultHeroFilter(DEFAULT_HERO_FILTER) &&
      isDefaultHeroFilter({ ...DEFAULT_HERO_FILTER, query: "  " }) &&
      !isDefaultHeroFilter({ ...DEFAULT_HERO_FILTER, query: "關" }) &&
      !isDefaultHeroFilter({ ...DEFAULT_HERO_FILTER, job: "archer" }) &&
      !isDefaultHeroFilter({ ...DEFAULT_HERO_FILTER, sort: "cost" })
  );
});

// ── 法師、遊戲不認得的職業、出陣費用排序（隊伍編排）─────────────────
// 混合的設定：標準職業、法師、不認得的職業（中文舊值、healer、空白、沒有欄位）、舊的稀有度
const MIXED = [
  cfg("guan_yu", "關羽", "infantry", { cost: 8 }),
  cfg("zhou_yu", "周瑜", "mage", { cost: 6, rarity: "purple" }),
  cfg("old_a", "舊甲", "步兵", { cost: 3, rarity: "SR" }),
  cfg("healer", "華佗", "healer", { cost: 5, rarity: "" }),
  cfg("blank", "無名", "", { cost: 4 }),
  cfg("nojob", "無職", undefined, { cost: 7 }),
  cfg("zhao_yun", "趙雲", "cavalry", { cost: 5 }),
];
block("法師與其他", () => {
  const mage = run({ job: "mage" }, MIXED, []);
  const other = run({ job: OTHER_JOB }, MIXED, []);
  const inf = run({ job: "infantry" }, MIXED, []);
  const otherQ = run({ job: OTHER_JOB, query: "華" }, MIXED, []);
  check(
    "武將篩選-22 法師篩選找到周瑜；「其他」找到所有遊戲不認得的職業（中文「步兵」、healer、空白、沒有欄位），不會把中文「步兵」當成步兵；步兵只有 infantry；「其他」也能和搜尋組合（華 → 華佗）",
    JSON.stringify(ids(mage)) === '["zhou_yu"]' &&
      JSON.stringify(ids(other)) === '["old_a","healer","blank","nojob"]' &&
      JSON.stringify(ids(inf)) === '["guan_yu"]' &&
      JSON.stringify(ids(otherQ)) === '["healer"]' &&
      mage.total === 7,
    { mage: ids(mage), other: ids(other), inf: ids(inf), otherQ: ids(otherQ) }
  );
  const deploy = run({ sort: "deploy" }, MIXED, []);
  const deployTie = run(
    { sort: "deploy" },
    [
      cfg("a", "甲", "infantry", { cost: 5 }),
      cfg("b", "乙", "mage", { cost: "x" }),
      cfg("c", "丙", "archer", { cost: 5 }),
      cfg("d", "丁", "archer", { cost: 2 }),
    ],
    []
  );
  check(
    "武將篩選-23 出陣費用 低→高：3、4、5、5、6、7、8（同值依設定順序：華佗在趙雲前）；無效的費用排在最後",
    JSON.stringify(ids(deploy)) ===
      '["old_a","blank","healer","zhao_yun","zhou_yu","nojob","guan_yu"]' &&
      JSON.stringify(ids(deployTie)) === '["d","a","c","b"]',
    { deploy: ids(deploy), deployTie: ids(deployTie) }
  );
});
block("職業與稀有度的顯示", () => {
  const known = HERO_JOBS.map((j) => jobInfo(j.value));
  const mage = jobInfo("mage");
  const unknown = ["步兵", "healer", "", null, undefined, 3].map(jobInfo);
  check(
    "武將篩選-24 職業名稱與顏色：五種職業（含法師，顏色和其他職業都不同）；不認得的值顯示「其他（原始值）」或「其他（未設定）」、灰色、known=false，不會變成步兵",
    known.every((k) => k.known && k.label && k.short && k.color) &&
      new Set(known.map((k) => k.color)).size === 5 &&
      mage.label === "法師" &&
      mage.short === "法" &&
      unknown[0].label === "其他（步兵）" &&
      unknown[1].label === "其他（healer）" &&
      unknown[2].label === "其他（未設定）" &&
      unknown[3].label === "其他（未設定）" &&
      unknown[4].label === "其他（未設定）" &&
      unknown[5].label === "其他（3）" &&
      unknown.every(
        (u) =>
          !u.known &&
          u.color === UNKNOWN_CATEGORY_COLOR &&
          u.color !== jobInfo("infantry").color
      ),
    { known, unknown }
  );
  const rk = HERO_RARITIES.map((r) => rarityInfo(r.value));
  const ru = ["SR", "N", "", null, " UR "].map(rarityInfo);
  check(
    "武將篩選-25 稀有度：橘、紫、藍、綠四種；不認得的值（舊的 SR、N、空白、前後空白）顯示原始值或「？」、灰色、known=false，不會空白",
    JSON.stringify(rk.map((r) => r.label)) === '["橘","紫","藍","綠"]' &&
      rk.every((r) => r.known) &&
      ru[0].label === "SR" &&
      ru[1].label === "N" &&
      ru[2].label === "？" &&
      ru[3].label === "？" &&
      ru[4].label === "UR" &&
      ru.every((r) => !r.known && r.color === UNKNOWN_CATEGORY_COLOR),
    { rk, ru }
  );
});

// ── 對空與上陣（只有武將列表顯示；隊伍編排沿用「全部」）─────────────────
block("對空與上陣", () => {
  const air = run({ air: "air" });
  const ground = run({ air: "ground" });
  const mixedGround = filterAndSortHeroes(MIXED, [], {
    ...DEFAULT_HERO_FILTER,
    air: "ground",
  });
  check(
    "武將篩選-26 對空沿用戰場規則（heroCanHitAir）：可以對空＝弓兵、法師（黃忠、周瑜），只打地面＝其他 4 位；兩者合起來是全部；遊戲不認得的職業（舊中文、healer、空白、沒有欄位）都算只打地面（和步兵關羽、騎兵趙雲一起）",
    JSON.stringify(ids(air)) === '["huang_zhong","zhou_yu"]' &&
      JSON.stringify(ids(ground)) ===
        '["guan_yu","zhao_yun","zhang_fei","lu_bu"]' &&
      air.matched + ground.matched === air.total &&
      CONFIGS.every(
        (c) =>
          matchesAir(c.job, "air") === heroCanHitAir(c.job) &&
          matchesAir(c.job, "ground") === !heroCanHitAir(c.job) &&
          matchesAir(c.job, "all")
      ) &&
      JSON.stringify(ids(mixedGround)) ===
        '["guan_yu","old_a","healer","blank","nojob","zhao_yun"]',
    { air: ids(air), ground: ids(ground), mixed: ids(mixedGround) }
  );
  const team = [
    { hero_id: "huang_zhong", slot: 1 },
    { hero_id: "guan_yu", slot: 2 },
    { hero_id: "guan_yu", slot: 3 },
    { hero_id: "ghost_hero", slot: 4 },
    { hero_id: 5, slot: 5 },
    null,
    { slot: 6 },
  ];
  const set = teamHeroIdSet(team, CONFIGS);
  check(
    "武將篩選-27 上陣的武將只算存檔隊伍裡有效的 hero_id：去掉重複、設定沒有的 id、不是文字的 id 與壞掉的格子；隊伍不是陣列時是 null（不能判斷），空陣列是空集合",
    set instanceof Set &&
      JSON.stringify([...set].sort()) === '["guan_yu","huang_zhong"]' &&
      teamHeroIdSet(undefined, CONFIGS) === null &&
      teamHeroIdSet(null, CONFIGS) === null &&
      teamHeroIdSet({ 0: "guan_yu" }, CONFIGS) === null &&
      teamHeroIdSet([], CONFIGS).size === 0,
    { set: set && [...set] }
  );
  const runT = (over, teamIds) =>
    filterAndSortHeroes(
      CONFIGS,
      HEROES,
      { ...DEFAULT_HERO_FILTER, ...over },
      teamIds
    );
  const inT = runT({ team: "in" }, set);
  const outT = runT({ team: "out" }, set);
  const unknownIn = runT({ team: "in" }, null);
  const unknownOut = runT({ team: "out" }, undefined);
  const unknownAll = runT({}, null);
  const emptyIn = runT({ team: "in" }, new Set());
  const emptyOut = runT({ team: "out" }, new Set());
  check(
    "武將篩選-28 上陣：已上陣＝關羽、黃忠（照原清單順序），未上陣＝其他 4 位；沒有隊伍資料時選已上陣或未上陣都沒有武將符合並標示 teamUnknown（不會把全部當成未上陣），選全部照常；空隊伍時全部未上陣",
    JSON.stringify(ids(inT)) === '["guan_yu","huang_zhong"]' &&
      JSON.stringify(ids(outT)) ===
        '["zhao_yun","zhou_yu","zhang_fei","lu_bu"]' &&
      !inT.teamUnknown &&
      !outT.teamUnknown &&
      unknownIn.matched === 0 &&
      unknownIn.teamUnknown === true &&
      unknownOut.matched === 0 &&
      unknownOut.teamUnknown === true &&
      unknownAll.matched === 6 &&
      unknownAll.teamUnknown === false &&
      emptyIn.matched === 0 &&
      !emptyIn.teamUnknown &&
      emptyOut.matched === 6,
    {
      in: ids(inT),
      out: ids(outT),
      unknownIn,
      unknownOut: unknownOut.matched,
      emptyOut: emptyOut.matched,
    }
  );
  const andAir = runT({ team: "in", air: "air" }, set);
  const andQuery = runT({ team: "out", air: "ground", query: "u" }, set);
  const andJob = runT({ team: "out", job: "cavalry", air: "air" }, set);
  const sorted = runT({ team: "in", sort: "atk" }, set);
  const sortedOut = runT({ team: "out", sort: "level" }, set);
  check(
    "武將篩選-29 和搜尋、職業是「而且」：已上陣＋可以對空＝黃忠；未上陣＋只打地面＋「u」＝趙雲、Lu Bu；未上陣＋騎兵＋可以對空＝0；排序規則不變（已上陣依攻擊力：關羽 1000、黃忠 150；未上陣依等級：趙雲 Lv2 在前，其他同 Lv1 照原順序）",
    JSON.stringify(ids(andAir)) === '["huang_zhong"]' &&
      JSON.stringify(ids(andQuery)) === '["zhao_yun","lu_bu"]' &&
      andJob.matched === 0 &&
      andJob.total === 6 &&
      JSON.stringify(ids(sorted)) === '["guan_yu","huang_zhong"]' &&
      JSON.stringify(ids(sortedOut)) ===
        '["zhao_yun","zhou_yu","zhang_fei","lu_bu"]',
    {
      andAir: ids(andAir),
      andQuery: ids(andQuery),
      andJob: andJob.matched,
      sorted: ids(sorted),
      sortedOut: ids(sortedOut),
    }
  );
  const setBefore = JSON.stringify([...set]);
  const teamBefore = JSON.stringify(team);
  const cfgBefore = JSON.stringify(CONFIGS);
  runT({ team: "out", air: "ground", sort: "cost" }, set);
  check(
    "武將篩選-30 預設條件是對空全部、上陣全部；任一個不是全部就不是預設；選項名稱（全部／可以對空／只打地面、全部／已上陣／未上陣）；篩選不改傳入的隊伍、集合與設定",
    DEFAULT_HERO_FILTER.air === "all" &&
      DEFAULT_HERO_FILTER.team === "all" &&
      !isDefaultHeroFilter({ ...DEFAULT_HERO_FILTER, air: "air" }) &&
      !isDefaultHeroFilter({ ...DEFAULT_HERO_FILTER, team: "out" }) &&
      JSON.stringify(HERO_AIR_OPTIONS.map((o) => [o.value, o.label])) ===
        '[["all","全部"],["air","可以對空"],["ground","只打地面"]]' &&
      JSON.stringify(HERO_TEAM_OPTIONS.map((o) => [o.value, o.label])) ===
        '[["all","全部"],["in","已上陣"],["out","未上陣"]]' &&
      JSON.stringify([...set]) === setBefore &&
      JSON.stringify(team) === teamBefore &&
      JSON.stringify(CONFIGS) === cfgBefore
  );
});

const failed = results.filter((r) => !r.ok).length;
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      total: results.length,
      failed,
      module: SRC === REAL ? "heroFilter.ts" : SRC,
    })
);
process.exit(failed ? 1 : 0);
