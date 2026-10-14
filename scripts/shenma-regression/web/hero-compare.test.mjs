// 兩位武將比較的規則（utils/heroCompare.ts）測試，不需要瀏覽器
// - 用專案內的 TypeScript 即時轉譯 heroCompare.ts（主頁武將視窗、武將頁共用）與它用到的規則（heroFilter、heroStats、heroSkills、antiAir）
// - 涵蓋：選取（加入、取消、選滿時不替換也不加入、不改原陣列）；設定重新載入後拿掉不在設定裡與重複的選取；
//   比較欄的數值來自目前存檔（沒有升級紀錄的是 Lv1 與基礎屬性）；基礎射程不含技能、射程技能只在「戰場有效射程」乘一次；
//   攻擊間隔與既有公式相同；技能名稱與沒有技能；對空依職業；設定或存檔無效時不能比較（不猜 0）；沒有總戰力、排名或每秒傷害
// - 比較畫面狀態（components/useHeroCompare.ts）：設定拿掉再恢復時選取不復活、視窗不自動重開；載入中與有效空清單分開；
//   換存檔清除；設定重新載入時數值更新；沒有無限重畫
// 用法：node scripts/shenma-regression/web/hero-compare.test.mjs
// 反向驗證：HERO_COMPARE_SRC 指向改壞的 heroCompare.ts、HERO_COMPARE_HOOK_SRC 指向改壞的 useHeroCompare.ts 時應該要有測試失敗
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
  compareDiffs,
  battleRangeOf,
  COMPARE_DIFF_KEYS,
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
  "技能：有技能的列名稱與說明（關羽「減速光環」、黃忠「百步穿楊」，說明是和詳情相同的短版、用這一欄的射程），沒有技能的是 null（周倉，不造技能）；對空依職業（弓兵、法師可以，步兵不行）",
  gy.skillName === "減速光環" &&
    gy.skillText ===
      "射程內（目前 1.5 格）的地面敵人移動速度 −10%；飛行與免疫減速的敵人不受影響。和其他減速取最強、不疊加，但文士塔的減速另外計算。" &&
    hz.skillName === "百步穿楊" &&
    hz.skillText ===
      "戰場上的有效射程是屬性射程的 1.5 倍（升級的射程成長也一起乘）：目前 6 格，戰場上 9 格。傷害與攻擊間隔不變。" &&
    zc.skillName === null &&
    zc.skillText === null &&
    hz.canHitAir === true &&
    compareColumn(CONFIGS[3], SAVE).canHitAir === true &&
    gy.canHitAir === false &&
    /打不到飛行/.test(gy.airText),
  {
    gy: [gy.skillName, gy.skillText],
    hz: [hz.skillName, hz.skillText],
    zc: zc.skillName,
  }
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

// ── 差額（右欄−左欄）──
{
  const gyCol = compareColumn(CONFIGS[0], SAVE);
  const hzCol = compareColumn(CONFIGS[1], SAVE);
  const gyCopy = JSON.stringify(gyCol);
  const d = compareDiffs(gyCol, hzCol);
  const r = compareDiffs(hzCol, gyCol);
  check(
    "差額以左欄為基準、右欄−左欄：關羽→黃忠 ATK +18、DEF +4、HP +60、出陣容量 −1、基礎射程 +4.5、戰場射程 +7.5（關羽沒有射程技能沿用基礎射程 1.5，黃忠 9）、攻擊間隔 +0.24；左右對調正負號相反；不改傳入的欄",
    d.atk === 18 &&
      d.def === 4 &&
      d.hp === 60 &&
      d.cost === -1 &&
      d.range === 4.5 &&
      d.battleRange === 7.5 &&
      d.interval === 0.24 &&
      COMPARE_DIFF_KEYS.every((k) => r[k] === -d[k]) &&
      battleRangeOf(gyCol) === 1.5 &&
      battleRangeOf(hzCol) === 9 &&
      JSON.stringify(gyCol) === gyCopy,
    { d, r }
  );
  const same = compareDiffs(gyCol, compareColumn(CONFIGS[0], SAVE));
  const fast = compareColumn(hero("zhou_cang", { attack_speed: 1 }), []);
  const slow = compareColumn(hero("guan_yu", { attack_speed: 1.2 }), []);
  const f = compareDiffs(slow, fast);
  check(
    "差額：數值相同是 0（不是 −0）；先照畫面四捨五入再相減，沒有浮點誤差（1.2→1 秒是 −0.2，不是 −0.19999…）；只有 7 個數值鍵，沒有百分比、總戰力或排名",
    COMPARE_DIFF_KEYS.every((k) => Object.is(same[k], 0)) &&
      f.interval === -0.2 &&
      Object.keys(d).sort().join() === [...COMPARE_DIFF_KEYS].sort().join() &&
      COMPARE_DIFF_KEYS.length === 7,
    { same, interval: f.interval, keys: Object.keys(d) }
  );
  const bad = compareColumn(hero("guan_yu", { attack_range: Number.NaN }), []);
  const b1 = compareDiffs(bad, hzCol);
  const b2 = compareDiffs(hzCol, bad);
  check(
    "差額：任一欄不能比較（射程不是有限的數字）時每一列都是 null（不能比較），不把無效值當 0；戰場射程也不能用另一欄單獨算",
    COMPARE_DIFF_KEYS.every((k) => b1[k] === null && b2[k] === null) &&
      battleRangeOf(bad) === null,
    { b1, b2 }
  );
}

// ── 比較畫面狀態（components/useHeroCompare.ts）──
// 用最小的 React hook 模擬執行真正的 hook：依呼叫順序的 state／ref／memo 槽、effect 依賴有變才執行、
// effect 或操作改了 state 就重畫到穩定（超過 20 次視為無限循環）。不是瀏覽器；掛載畫面的情境在 hero-compare-web.js
const HOOK = join(
  ROOT,
  "src/app/(games)/shenmaSanguo/components/useHeroCompare.ts"
);
const HOOK_SRC = process.env.HERO_COMPARE_HOOK_SRC
  ? resolve(process.env.HERO_COMPARE_HOOK_SRC)
  : HOOK;
function mountHook() {
  const slots = [];
  let cursor = 0;
  let pending = [];
  let dirty = false;
  const same = (a, b) =>
    !!a &&
    !!b &&
    a.length === b.length &&
    a.every((v, i) => Object.is(v, b[i]));
  const fakeReact = {
    useState(init) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { v: init };
      const s = slots[i];
      const set = (next) => {
        const v = typeof next === "function" ? next(s.v) : next;
        if (!Object.is(v, s.v)) {
          s.v = v;
          dirty = true;
        }
      };
      return [s.v, set];
    },
    useRef(init) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = { current: init };
      return slots[i];
    },
    useMemo(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { v: fn(), deps };
      return slots[i].v;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        slots[i] = { deps };
        pending.push(fn);
      }
    },
  };
  const out = ts.transpileModule(readFileSync(HOOK_SRC, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: HOOK,
  }).outputText;
  const mod = { exports: {} };
  const req = createRequire(HOOK);
  new Function("require", "module", "exports", out)(
    (id) => (id === "react" ? fakeReact : req(id)),
    mod,
    mod.exports
  );
  let props = null;
  let view = null;
  let passes = 0;
  const settle = () => {
    passes = 0;
    do {
      dirty = false;
      cursor = 0;
      pending = [];
      view = mod.exports.useHeroCompare(props.key, props.configs);
      for (const fn of pending) fn();
      passes += 1;
    } while (dirty && passes <= 20);
    return view;
  };
  return {
    render: (key, configs) => {
      props = { key, configs };
      return settle();
    },
    act: (fn) => {
      fn(view);
      return settle();
    },
    passes: () => passes,
  };
}
const shot = (v) => ({ active: v.active, selected: v.selected, open: v.open });
const ALL = CONFIGS;
const NO_GY = CONFIGS.filter((c) => c.hero_id !== "guan_yu");
const picked = (h, key = "test_a") => {
  h.render(key, ALL);
  h.act((v) => v.toggleMode());
  h.act((v) => v.pick("guan_yu"));
  h.act((v) => v.pick("huang_zhong"));
  return h.act((v) => v.start());
};

{
  const h = mountHook();
  const before = shot(picked(h));
  const removed = shot(h.render("test_a", NO_GY));
  const restored = shot(h.render("test_a", ALL));
  const third = shot(h.act((v) => v.pick("zhou_cang")));
  const started = shot(h.act((v) => v.start()));
  check(
    "比較狀態：有效設定清單拿掉關羽→選取只剩黃忠、視窗關閉；設定再有關羽也不會重新入選或自動重開；再選周倉滿兩位仍不自動開，按「比較這兩位」才開",
    before.open === true &&
      before.selected.join() === "guan_yu,huang_zhong" &&
      removed.open === false &&
      removed.selected.join() === "huang_zhong" &&
      restored.open === false &&
      restored.selected.join() === "huang_zhong" &&
      third.selected.join() === "huang_zhong,zhou_cang" &&
      third.open === false &&
      started.open === true,
    { before, removed, restored, third, started }
  );
}
{
  const h = mountHook();
  picked(h);
  const loading = shot(h.render("test_a", null));
  const back = shot(h.render("test_a", ALL));
  const empty = shot(h.render("test_a", []));
  const afterEmpty = shot(h.render("test_a", ALL));
  check(
    "比較狀態：設定載入中或失敗（null）不顯示選取也不比較、視窗關閉，但選取不算失效；設定回來後兩位仍在、視窗不自動重開；有效的空清單則把選取全部移除，之後設定恢復也不回來",
    loading.selected.length === 0 &&
      loading.open === false &&
      back.selected.join() === "guan_yu,huang_zhong" &&
      back.open === false &&
      empty.selected.length === 0 &&
      afterEmpty.selected.length === 0 &&
      afterEmpty.active === true,
    { loading, back, empty, afterEmpty }
  );
}
{
  const h = mountHook();
  picked(h);
  const sameKey = shot(h.render("test_a", ALL));
  const otherKey = shot(h.render("test_b", ALL));
  const backKey = shot(h.render("test_a", ALL));
  check(
    "比較狀態：同一個存檔重畫保留選取與視窗；換成不同的 player.key 時比較模式、選取與視窗全部清掉，換回來也不恢復",
    sameKey.open === true &&
      sameKey.selected.length === 2 &&
      otherKey.active === false &&
      otherKey.selected.length === 0 &&
      otherKey.open === false &&
      backKey.active === false &&
      backKey.selected.length === 0,
    { sameKey, otherKey, backKey }
  );
}
{
  const h = mountHook();
  const v0 = picked(h);
  const refreshed = CONFIGS.map((c) =>
    c.hero_id === "guan_yu" ? { ...c, cost: 6 } : { ...c }
  );
  const v1 = h.render("test_a", refreshed);
  const c0 = compareColumns(v0.selected, CONFIGS, SAVE);
  const c1 = compareColumns(v1.selected, refreshed, SAVE);
  check(
    "比較狀態：設定重新載入（新的陣列、同樣的武將）時選取與視窗照舊，比較表的數值改用新的設定（關羽出陣容量 4→6）",
    v1.open === true &&
      v1.selected.join() === "guan_yu,huang_zhong" &&
      c0[0].cost === 4 &&
      c1[0].cost === 6,
    { selected: v1.selected, open: v1.open, cost: [c0[0].cost, c1[0].cost] }
  );
}
{
  const h = mountHook();
  picked(h);
  const counts = [];
  let stable = true;
  let last = h.render("test_a", [...ALL]);
  for (let i = 0; i < 5; i++) {
    const v = h.render("test_a", [...ALL]);
    counts.push(h.passes());
    if (v.selected.join() !== last.selected.join() || v.open !== last.open)
      stable = false;
    last = v;
  }
  h.render("test_a", NO_GY);
  counts.push(h.passes());
  check(
    "比較狀態沒有循環：每次傳入新的設定陣列（內容相同）重畫一次就穩定、選取與視窗不變；拿掉一位時最多再重畫兩次",
    stable && counts.slice(0, 5).every((n) => n === 1) && counts[5] <= 3,
    counts
  );
}

const failed = results.filter((r) => !r.ok).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
