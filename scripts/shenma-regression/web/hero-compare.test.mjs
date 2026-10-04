// 兩位武將比較的規則（utils/heroCompare.ts）測試，不需要瀏覽器
// - 用專案內的 TypeScript 即時轉譯 heroCompare.ts（主頁武將視窗、武將頁共用）與它用到的規則（heroFilter、heroStats、heroSkills、antiAir）
// - 涵蓋：選取（加入、取消、選滿時不替換也不加入、不改原陣列）；設定重新載入後拿掉不在設定裡與重複的選取；
//   比較欄的數值來自目前存檔（沒有升級紀錄的是 Lv1 與基礎屬性）；基礎射程不含技能、射程技能只在「戰場有效射程」乘一次；
//   攻擊間隔與既有公式相同；技能名稱與沒有技能；對空依職業；設定或存檔無效時不能比較（不猜 0）；沒有總戰力、排名或每秒傷害
// 用法：node scripts/shenma-regression/web/hero-compare.test.mjs
// 反向驗證：HERO_COMPARE_SRC 指向改壞的 heroCompare.ts 時應該要有測試失敗
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const UTILS = join(ROOT, "src/app/(games)/shenmaSanguo/utils");
const REAL = join(UTILS, "heroCompare.ts");
const SRC = process.env.HERO_COMPARE_SRC
  ? resolve(process.env.HERO_COMPARE_SRC)
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
  COMPARE_MAX,
  toggleCompare,
  pruneCompare,
  compareColumn,
  compareColumns,
} = require(REAL);
const { attackIntervalSec } = require(join(UTILS, "heroStats.ts"));

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`
  );
};

const hero = (id, extra = {}) => ({
  hero_id: id,
  name:
    {
      guan_yu: "關羽",
      huang_zhong: "黃忠",
      zhou_cang: "周倉",
      liu_bei: "劉備",
    }[id] || id,
  rarity: "purple",
  cost: 3,
  job: "infantry",
  base_atk: 30,
  base_def: 10,
  base_hp: 200,
  attack_range: 1.5,
  attack_speed: 1.2,
  upgrade_cost_base: 100,
  atk_growth: 5,
  def_growth: 2,
  hp_growth: 20,
  range_growth: 0.1,
  atk_spd_growth: 0.02,
  ...extra,
});
const CONFIGS = [
  hero("guan_yu", { cost: 4 }),
  hero("huang_zhong", {
    job: "archer",
    attack_range: 5,
    range_growth: 0.5,
    cost: 3,
    attack_speed: 1.5,
  }),
  hero("zhou_cang", { cost: 2 }),
  hero("liu_bei", { job: "mage" }),
];
const SAVE = [
  { hero_id: "huang_zhong", level: 3, star: 0, atk: 48, def: 14, hp: 260 },
];

// ── 選取 ──
const s0 = [];
const s1 = toggleCompare(s0, "guan_yu");
const s2 = toggleCompare(s1.selected, "huang_zhong");
const s3 = toggleCompare(s2.selected, "zhou_cang");
const s4 = toggleCompare(s3.selected, "guan_yu");
const s5 = toggleCompare(s4.selected, "zhou_cang");
check(
  "選取：最多 2 位；選滿時再點第三位不加入也不替換（refused）；再點已選的是取消；之後可以選別人；不改原陣列",
  COMPARE_MAX === 2 &&
    JSON.stringify(s1.selected) === '["guan_yu"]' &&
    JSON.stringify(s2.selected) === '["guan_yu","huang_zhong"]' &&
    s3.refused === true &&
    JSON.stringify(s3.selected) === '["guan_yu","huang_zhong"]' &&
    s4.refused === false &&
    JSON.stringify(s4.selected) === '["huang_zhong"]' &&
    JSON.stringify(s5.selected) === '["huang_zhong","zhou_cang"]' &&
    s0.length === 0 &&
    s2.selected !== s3.selected,
  { s1, s2, s3, s4, s5 }
);
check(
  "設定重新載入：拿掉已經不在設定裡的武將與重複的選取，順序不變",
  JSON.stringify(
    pruneCompare(
      ["huang_zhong", "removed_hero", "huang_zhong", "guan_yu"],
      CONFIGS
    )
  ) === '["huang_zhong","guan_yu"]',
  pruneCompare(
    ["huang_zhong", "removed_hero", "huang_zhong", "guan_yu"],
    CONFIGS
  )
);

// ── 比較欄 ──
const hz = compareColumn(CONFIGS[1], SAVE);
const gy = compareColumn(CONFIGS[0], SAVE);
check(
  "數值來自目前存檔：有升級紀錄的用存檔（Lv3、ATK 48、DEF 14、HP 260），沒有的照既有規則是 Lv1 與基礎屬性；出陣容量是設定的 cost",
  hz.ok &&
    hz.level === 3 &&
    hz.atk === 48 &&
    hz.def === 14 &&
    hz.hp === 260 &&
    hz.cost === 3 &&
    gy.ok &&
    gy.level === 1 &&
    gy.atk === 30 &&
    gy.def === 10 &&
    gy.hp === 200 &&
    gy.cost === 4,
  { hz, gy }
);
check(
  "射程：基礎射程＝attack_range＋（等級−1）×range_growth、不含技能（黃忠 Lv3＝6 格）；百步穿楊只在戰場有效射程乘一次 1.5（9 格，不是 13.5）；沒有射程技能的沒有戰場有效射程",
  hz.range === 6 &&
    hz.battleRange === 9 &&
    gy.range === 1.5 &&
    gy.battleRange === null,
  { hz: [hz.range, hz.battleRange], gy: [gy.range, gy.battleRange] }
);
check(
  "攻擊間隔和既有公式相同（數字越小越快）",
  hz.interval === attackIntervalSec(CONFIGS[1], 3) &&
    gy.interval === attackIntervalSec(CONFIGS[0], 1),
  { hz: hz.interval, gy: gy.interval }
);
const zc = compareColumn(CONFIGS[2], SAVE);
check(
  "技能：有技能的列名稱與說明（關羽「減速光環」、黃忠「百步穿楊」），沒有技能的是 null（周倉，不造技能）；對空依職業（弓兵、法師可以，步兵不行）",
  gy.skillName === "減速光環" &&
    typeof gy.skillText === "string" &&
    gy.skillText.length > 0 &&
    hz.skillName === "百步穿楊" &&
    zc.skillName === null &&
    zc.skillText === null &&
    hz.canHitAir === true &&
    compareColumn(CONFIGS[3], SAVE).canHitAir === true &&
    gy.canHitAir === false &&
    /打不到飛行/.test(gy.airText),
  { gy: gy.skillName, hz: hz.skillName, zc: zc.skillName }
);
const badRange = compareColumn(
  hero("guan_yu", { attack_range: Number.NaN }),
  []
);
const noCost = compareColumn(hero("guan_yu", { cost: undefined }), []);
const badSave = compareColumn(CONFIGS[1], [
  { hero_id: "huang_zhong", level: 0, star: 0, atk: 48, def: 14, hp: 260 },
]);
const strSpeed = compareColumn(hero("guan_yu", { attack_speed: "1.2" }), []);
check(
  "設定或存檔無效（射程不是有限的數字、沒有 cost、等級 0、攻擊間隔是文字）：不能比較、數值都是 null 並寫明欄位，不猜 0 或 Lv1",
  [badRange, noCost, badSave, strSpeed].every(
    (c) =>
      c.ok === false &&
      c.atk === null &&
      c.range === null &&
      c.interval === null &&
      c.level === null &&
      c.problems.length > 0
  ) &&
    badRange.problems.some((p) => /attack_range/.test(p)) &&
    noCost.problems.some((p) => /cost/.test(p)) &&
    badSave.problems.some((p) => /等級/.test(p)) &&
    strSpeed.problems.some((p) => /attack_speed/.test(p)),
  {
    badRange: badRange.problems,
    noCost: noCost.problems,
    badSave: badSave.problems,
    strSpeed: strSpeed.problems,
  }
);
const cols = compareColumns(
  ["huang_zhong", "removed_hero", "guan_yu"],
  CONFIGS,
  SAVE
);
check(
  "兩位的比較欄照選取的順序、略過不在設定裡的；沒有總戰力、排名或每秒傷害的欄位；不改傳入的存檔與設定",
  cols.length === 2 &&
    cols[0].heroId === "huang_zhong" &&
    cols[1].heroId === "guan_yu" &&
    !Object.keys(cols[0]).some((k) => /power|score|rank|dps/i.test(k)) &&
    SAVE.length === 1 &&
    SAVE[0].level === 3 &&
    CONFIGS[1].attack_range === 5,
  cols.map((c) => c.heroId)
);

const failed = results.filter((r) => !r.ok).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
