// 神馬三國戰鬥結算的獎勵規則（utils/battleReward.ts）測試，不需要瀏覽器
// - 用專案內的 TypeScript 即時轉譯 battleReward.ts（前端先顯示用；後端的完整結算用同一套規則）
// - 涵蓋：勝利點數（battle_points 優先、沒有才算舊名稱 gold、兩種都有時不重複）、落敗固定 10；
//   經驗（勝 50＋星數×20、敗 10）；升級門檻 level×100、可連升、容量＝10＋level；進度（下一關、換章、不倒退）；
//   不合規則的星數與點數；異常的等級與經驗；不改動傳入的資料
// 用法：node scripts/shenma-regression/web/battle-reward.test.mjs
// 反向驗證：BATTLE_REWARD_SRC 指向改壞的 battleReward.ts 時應該要有測試失敗
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const UTILS = join(ROOT, "src/app/(games)/shenmaSanguo/utils");
const REAL = join(UTILS, "battleReward.ts");
const SRC = process.env.BATTLE_REWARD_SRC
  ? resolve(process.env.BATTLE_REWARD_SRC)
  : REAL;

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename === REAL ? SRC : filename, "utf8");
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
  computeBattleReward,
  applyBattleReward,
  toBattleRecord,
  sameSettleAfter,
  LOSE_POINTS,
  LOSE_EXP,
} = require(REAL);

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
      `${name} 執行時拋出例外`,
      false,
      String(e && e.stack ? e.stack.split("\n").slice(0, 2).join(" | ") : e)
    );
  }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const win = (loots, stars = 3, extra = {}) => ({
  result: "WIN",
  stage_id: "chapter1_1",
  stars_earned: stars,
  kills: 12,
  time_seconds: 95,
  loots,
  __godot_bridge: true,
  ...extra,
});
const lose = (loots = [{ item: "battle_points", count: 10 }]) => ({
  result: "LOSE",
  stage_id: "chapter1_1",
  stars_earned: 0,
  kills: 2,
  time_seconds: 30,
  loots,
  __godot_bridge: true,
});
const bp = (count) => ({ item: "battle_points", count });
const gold = (count) => ({ item: "gold", count });
const player = (over = {}) => ({
  gold: 500,
  exp: 0,
  level: 1,
  max_stage: "chapter1_1",
  ...over,
});

block("結算規則-1", () => {
  const cases = [
    [[bp(580)], 580],
    [[bp(100), gold(50)], 100],
    [[gold(50), bp(100)], 100],
    [[gold(50), gold(25)], 75],
    [[bp(10), bp(20)], 30],
    [[gold(7), bp(0)], 0],
    [[{ item: "item_x", count: 5 }], 0],
    [[], 0],
  ];
  const got = cases.map(([loots]) => computeBattleReward(win(loots))?.points);
  check(
    "結算規則-1 勝利點數：只要有 battle_points 就只加總 battle_points（同時帶 gold 時 gold 不計，順序無關）；沒有才加總 gold；battle_points 0 也算有；其他道具不計",
    got.every((p, i) => p === cases[i][1]),
    got
  );
});

block("結算規則-2", () => {
  const exp = [0, 1, 2, 3].map(
    (s) => computeBattleReward(win([bp(1)], s))?.exp
  );
  const l = computeBattleReward(lose([bp(999), gold(5)]));
  const l2 = computeBattleReward(lose([]));
  check(
    "結算規則-2 經驗：勝利 50＋星數×20（0～3 星：50／70／90／110）；落敗固定 10 點數、10 經驗（不看 loots 的 999）",
    same(exp, [50, 70, 90, 110]) &&
      l?.points === LOSE_POINTS &&
      l?.exp === LOSE_EXP &&
      LOSE_POINTS === 10 &&
      LOSE_EXP === 10 &&
      same(l2, { points: 10, exp: 10 }),
    { exp, l, l2 }
  );
});

block("結算規則-3", () => {
  const bad = [
    win([bp(1)], 4),
    win([bp(1)], -1),
    win([bp(1)], 1.5),
    win([bp(1)], "3"),
    { ...win([bp(1)]), stars_earned: undefined },
    win([bp(-1)]),
    win([bp(1.5)]),
    win([bp("10")]),
    win([bp(null)]),
    win([bp(2 ** 53)]),
    win([gold(-3)]),
    lose([bp(-10)]),
    win({ item: "battle_points", count: 5 }),
    win([bp(Number.MAX_SAFE_INTEGER), bp(1)]),
  ].map((r) => computeBattleReward(r));
  const recs = [
    toBattleRecord({ ...win([bp(1)]), result: "DRAW" }),
    toBattleRecord({ ...win([bp(1)]), stage_id: "" }),
    toBattleRecord({ ...win([bp(1)]), stage_id: "x".repeat(51) }),
    toBattleRecord(win([bp(1)], 9)),
  ];
  check(
    "結算規則-3 不合規則：星數不是 0～3 的整數、battle_points／gold 的 count 不是非負安全整數（負數、小數、文字、null、2^53、相加超過安全整數）、落敗時的負數、loots 不是陣列 → null；勝負、關卡（空白或超過 50 字）不對時 toBattleRecord 也是 null",
    bad.every((r) => r === null) && recs.every((r) => r === null),
    { bad, recs }
  );
});

block("結算規則-4", () => {
  const rec = toBattleRecord({
    ...win([bp(580), gold(3)]),
    battle_id: "b-1",
    kills: -5,
    time_seconds: "x",
  });
  check(
    "結算規則-4 送到後端的內容：只有 result、stage_id、stars_earned、kills、time_seconds、loots（不含 battle_id 與橋接標記）；擊殺數與時間不是非負有限數時當 0；loots 原樣保留",
    same(Object.keys(rec).sort(), [
      "kills",
      "loots",
      "result",
      "stage_id",
      "stars_earned",
      "time_seconds",
    ]) &&
      rec.kills === 0 &&
      rec.time_seconds === 0 &&
      same(rec.loots, [bp(580), gold(3)]),
    rec
  );
});

block("結算規則-5", () => {
  const w = { points: 580, exp: 110 };
  const a = applyBattleReward(player(), w, {
    result: "WIN",
    stage_id: "chapter1_1",
  });
  const one = applyBattleReward(
    player({ exp: 90 }),
    { points: 0, exp: 70 },
    { result: "WIN", stage_id: "chapter1_1" }
  );
  const exact = applyBattleReward(
    player({ exp: 50 }),
    { points: 0, exp: 50 },
    { result: "LOSE", stage_id: "chapter1_1" }
  );
  const multi = applyBattleReward(
    player({ exp: 290 }),
    { points: 0, exp: 110 },
    { result: "WIN", stage_id: "chapter1_10" }
  );
  const high = applyBattleReward(
    player({ level: 5, exp: 490 }),
    { points: 0, exp: 10 },
    { result: "LOSE", stage_id: "chapter1_1" }
  );
  check(
    "結算規則-5 升級：500＋580、經驗 110 → Lv2 剩 10、容量 12、進度 chapter1_2；90＋70 → Lv2 剩 60；剛好 100 也升級（剩 0）；290＋110 → 連升到 Lv3 剩 100、容量 13；Lv5 490＋10 → 門檻 500 剛好升到 Lv6 剩 0；chapter1_10 通關換章 chapter2_1",
    same(a, {
      gold: 1080,
      exp: 10,
      level: 2,
      capacity: 12,
      max_stage: "chapter1_2",
    }) &&
      one.level === 2 &&
      one.exp === 60 &&
      exact.level === 2 &&
      exact.exp === 0 &&
      same(multi, {
        gold: 500,
        exp: 100,
        level: 3,
        capacity: 13,
        max_stage: "chapter2_1",
      }) &&
      high.level === 6 &&
      high.exp === 0 &&
      high.capacity === 16,
    { a, one, exact, multi, high }
  );
});

block("結算規則-6", () => {
  const behind = applyBattleReward(
    player({ max_stage: "chapter3_1" }),
    { points: 0, exp: 50 },
    { result: "WIN", stage_id: "chapter1_1" }
  );
  const lost = applyBattleReward(
    player(),
    { points: 10, exp: 10 },
    { result: "LOSE", stage_id: "chapter1_1" }
  );
  const odd = applyBattleReward(
    player({ level: 0, exp: -5 }),
    { points: 0, exp: 50 },
    { result: "LOSE", stage_id: "chapter1_1" }
  );
  const frac = applyBattleReward(
    player({ level: 2.5, exp: "abc" }),
    { points: 0, exp: 10 },
    { result: "LOSE", stage_id: "chapter1_1" }
  );
  const noStage = applyBattleReward(
    player({ max_stage: undefined }),
    { points: 0, exp: 50 },
    { result: "WIN", stage_id: "chapter1_1" }
  );
  check(
    "結算規則-6 進度不倒退（已到 chapter3_1）、落敗不推進；異常的等級或經驗：level 0 或 2.5 當 1、exp 負數或文字當 0（不會無限迴圈）；沒有 max_stage 時勝利寫入下一關",
    behind.max_stage === "chapter3_1" &&
      lost.max_stage === "chapter1_1" &&
      odd.level === 1 &&
      odd.exp === 50 &&
      odd.capacity === 11 &&
      frac.level === 1 &&
      frac.exp === 10 &&
      noStage.max_stage === "chapter1_2",
    { behind, lost, odd, frac, noStage }
  );
});

block("結算規則-7", () => {
  const p = player();
  const before = JSON.stringify(p);
  const r = win([bp(5)]);
  const rBefore = JSON.stringify(r);
  applyBattleReward(p, computeBattleReward(r), r);
  toBattleRecord(r);
  const after = {
    gold: 1,
    exp: 2,
    level: 3,
    capacity: 13,
    max_stage: "chapter1_2",
  };
  check(
    "結算規則-7 不改動傳入的資料；sameSettleAfter 五個欄位都相同才算相同（缺欄位、型別不同都不相同）",
    JSON.stringify(p) === before &&
      JSON.stringify(r) === rBefore &&
      sameSettleAfter(after, { ...after }) &&
      !sameSettleAfter(after, { ...after, exp: "2" }) &&
      !sameSettleAfter(after, { gold: 1, exp: 2, level: 3, capacity: 13 }) &&
      !sameSettleAfter(after, null),
    null
  );
});

const failed = results.filter((r) => !r.ok).length;
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      total: results.length,
      failed,
      results: results.map(({ name, ok }) => ({ name, ok })),
    })
);
process.exit(failed ? 1 : 0);
