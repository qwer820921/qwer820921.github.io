// 神馬三國 JS 版：訪客本機結算的星數來源（純 Node、不連網）
// - 被測體：真 store（store/useJsPlayerStore.ts 的 startGuestMode／settleBattle／guestSettle）、真引擎（BattleEngine／BattleManager／WaveManager 的 gameLoop）、
//   Bridge 實際的 bindEngineCallbacks／startBattle，以及用 TypeScript AST 從 components/shenmaSanguoJsPage.tsx 取出的實際 onBattleEnded 回呼與模組層 currentAccountOf，
//   和 utils/battleAccountBoundary.ts 的 guestRewardAllowed；不另抄一份邏輯
// - 受控（都標明）：localStorage／sessionStorage 是記憶體假物件；fetch 一律拒絕並計數；requestAnimationFrame 換成空函式、renderer 不畫；
//   以固定時戳直接呼叫 gameLoop；statsRef 只在每次 gameLoop 回傳之後才更新（模擬 React 的 render＋effect 晚一拍）；
//   用 zustand 的 setState 重設玩家資料、設成共用帳號模式；StageDataManager 的 getStageById 暫時換成回缺資料的下一關
// - 期待值全部手寫（星數、金幣、經驗、進度、呼叫次數），不由被測的程式產生
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/guestStars.test.mjs"
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const HERE = dirname(fileURLToPath(import.meta.url));

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

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  let shown = "";
  if (!pass && detail !== undefined) shown = `  ${JSON.stringify(detail)}`;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${shown}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 假環境 ──
class MemStorage {
  constructor() {
    this.m = new Map();
  }
  get length() {
    return this.m.size;
  }
  key(i) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
const local = new MemStorage();
const session = new MemStorage();
globalThis.window = {
  addEventListener: () => {},
  removeEventListener: () => {},
  localStorage: local,
  sessionStorage: session,
};
globalThis.localStorage = local;
globalThis.sessionStorage = session;
let fetchCalls = 0;
globalThis.fetch = async () => {
  fetchCalls++;
  throw new Error("測試不連網");
};
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const { BattleEngine } = require(join(HERE, "../engine/BattleEngine.ts"));
const { GameState } = require(join(HERE, "../engine/BattleManager.ts"));
const { LocalGameBridge } = require(join(HERE, "../engine/LocalGameBridge.ts"));
const { StageDataManager } = require(
  join(HERE, "../engine/StageDataManager.ts")
);
const B = require(join(HERE, "battleAccountBoundary.ts"));
const { useJsPlayerStore, GUEST_STATE_KEY } = require(
  join(HERE, "../store/useJsPlayerStore.ts")
);
const st = () => useJsPlayerStore.getState();

// ── 訪客（真 store） ──
await st().startGuestMode();
const BASE = JSON.parse(JSON.stringify(st().player));
const GUEST_KEY = BASE.key;
/** 受控：把玩家資料重設成預設訪客，再套上指定欄位 */
const resetGuest = (extra = {}) =>
  useJsPlayerStore.setState({
    mode: "guest",
    player: { ...JSON.parse(JSON.stringify(BASE)), ...extra },
  });
const saved = () => JSON.parse(local.getItem(GUEST_STATE_KEY) || "null");
const NEXT_NAME = "第一章 第2關 - 界橋隘口";

// ── 1. 凍結星數決定這一場的星數與本機紀錄 ──
{
  const got = [];
  for (const [hp, s] of [
    [20, 3],
    [19, 3],
    [18, 3],
    [17, 2],
    [10, 2],
    [9, 1],
    [1, 1],
  ]) {
    resetGuest();
    const r = st().settleBattle("chapter1_1", hp, 20, s);
    got.push([hp, s, r.stars, st().player.cleared_stages.chapter1_1]);
  }
  check(
    "凍結星數（城防 20／19／18／17／10／9／1、合法勝利星數 3／3／3／2／2／1／1）：回傳的 stars 與本機紀錄 cleared_stages 都是這個星數",
    got.every(([, s, r, c]) => r === s && c === s),
    got
  );
}
{
  resetGuest();
  const a = st().settleBattle("chapter1_1", 20, 20, 1).stars;
  resetGuest();
  const b = st().settleBattle("chapter1_1", 10, 20, 3).stars;
  check(
    "凍結星數勝過城防比例：城防 20＋凍結 1 → 1、城防 10＋凍結 3 → 3",
    a === 1 && b === 3,
    { a, b }
  );
}
{
  resetGuest();
  const r = st().settleBattle("chapter1_1", 20, 20, 0);
  const c = st().player.cleared_stages.chapter1_1;
  check(
    "凍結星數 0 有效：城防 20＋凍結 0 → 這場 0 星（不退回比例的 3），原本沒有紀錄 → 紀錄 0",
    r.stars === 0 && c === 0,
    { stars: r.stars, c }
  );
}
{
  const got = [];
  for (const [hp, want, args] of [
    [19, 2, []],
    [20, 3, []],
    [9, 1, []],
    [19, 2, [undefined]],
  ]) {
    resetGuest();
    got.push([
      hp,
      want,
      st().settleBattle("chapter1_1", hp, 20, ...args).stars,
    ]);
  }
  check(
    "省略或 undefined：照原本的城防比例（城防 19 → 2、城防 20 → 3、城防 9 → 1）",
    got.every(([, want, s]) => s === want),
    got
  );
}
{
  const got = [];
  for (const [label, v, hp, want] of [
    ["-1", -1, 20, 3],
    ["1.5", 1.5, 20, 3],
    ["-Infinity", -Infinity, 20, 3],
    ["null", null, 20, 3],
    ["true", true, 20, 3],
    ["false", false, 20, 3],
    ["4", 4, 10, 2],
    ['"3"', "3", 10, 2],
    ["NaN", NaN, 10, 2],
    ["Infinity", Infinity, 10, 2],
    ["{}", {}, 10, 2],
  ]) {
    resetGuest();
    const s = st().settleBattle("chapter1_1", hp, 20, v).stars;
    got.push([label, hp, want, s]);
  }
  check(
    '不合法的凍結星數不轉型、不夾值，照城防比例：-1／1.5／-Infinity／null／true／false 配城防 20 → 3；4／"3"／NaN／Infinity／{} 配城防 10 → 2',
    got.every(([, , want, s]) => s === want),
    got
  );
}

// ── 2. 紀錄只升不降 ──
{
  resetGuest({ cleared_stages: { chapter1_1: 3 } });
  const r1 = st().settleBattle("chapter1_1", 20, 20, 1);
  const c1 = st().player.cleared_stages.chapter1_1;
  resetGuest({ cleared_stages: { chapter1_1: 1 } });
  const r2 = st().settleBattle("chapter1_1", 20, 20, 3);
  const c2 = st().player.cleared_stages.chapter1_1;
  check(
    "紀錄只升不降：已有 3、這場凍結 1 → 回 1、紀錄仍 3；已有 1、這場凍結 3 → 紀錄升成 3",
    r1.stars === 1 && c1 === 3 && r2.stars === 3 && c2 === 3,
    { r1: r1.stars, c1, r2: r2.stars, c2 }
  );
}

// ── 3. 收益與進度不受星數影響 ──
const pick = (p) => ({
  gold: p.gold,
  exp: p.exp,
  level: p.level,
  capacity: p.capacity,
  max_stage: p.max_stage,
});
{
  resetGuest();
  const r3 = st().settleBattle("chapter1_1", 20, 20);
  const p3 = pick(st().player);
  resetGuest();
  const r4 = st().settleBattle("chapter1_1", 20, 20, 1);
  const p4 = pick(st().player);
  const want = {
    gold: 1700,
    exp: 100,
    level: 1,
    capacity: 65,
    max_stage: "chapter1_2",
  };
  const rest = (r) => ({ ...r, stars: undefined });
  check(
    "收益與進度（三參數與四參數同初態）：金幣 1500→1700、經驗 +100、等級 1、容量 65、解鎖「第一章 第2關」；兩種呼叫除星數外逐欄相同",
    same(p3, want) &&
      same(p4, want) &&
      r3.goldEarned === 200 &&
      r3.expEarned === 100 &&
      r3.leveledUp === false &&
      r3.stageUnlocked === NEXT_NAME &&
      same(rest(r3), rest(r4)) &&
      r3.stars === 3 &&
      r4.stars === 1,
    { r3, r4, p3, p4 }
  );
}
{
  // 受控：下一關缺路線，原本的規則是不解鎖
  const mgr = StageDataManager.getInstance();
  const orig = mgr.getStageById;
  mgr.getStageById = (id) =>
    id === "chapter1_2"
      ? {
          map_id: "chapter1_2",
          name: "缺資料",
          path_json: { cols: 14, rows: 10 },
          waves: [],
        }
      : orig.call(mgr, id);
  resetGuest();
  const r3 = st().settleBattle("chapter1_1", 20, 20);
  const p3 = pick(st().player);
  resetGuest();
  const r4 = st().settleBattle("chapter1_1", 20, 20, 2);
  const p4 = pick(st().player);
  mgr.getStageById = orig;
  check(
    "下一關缺資料（受控）：三參數與四參數都不解鎖（max_stage 仍 chapter1_1、沒有 stageUnlocked）、金幣 1700、經驗 100",
    p3.max_stage === "chapter1_1" &&
      p4.max_stage === "chapter1_1" &&
      r3.stageUnlocked === undefined &&
      r4.stageUnlocked === undefined &&
      p3.gold === 1700 &&
      p4.exp === 100,
    { r3, r4, p3, p4 }
  );
}
{
  resetGuest();
  const r = st().settleBattle("chapter1_1", 20, 20);
  check("舊的三參數呼叫：城防 20 → 3 星", r.stars === 3, r);
}
{
  resetGuest();
  const r = st().settleBattle("chapter1_3", 19, 20, 3);
  const p = st().player;
  check(
    "未解鎖的關卡（現行界線不變）：max_stage chapter1_1 時以 chapter1_3 勝利（凍結 3）→ 紀錄寫入 3、不解鎖、max_stage 不變",
    p.cleared_stages.chapter1_3 === 3 &&
      p.max_stage === "chapter1_1" &&
      r.stageUnlocked === undefined,
    { cleared: p.cleared_stages, max: p.max_stage }
  );
}

// ── 4. 非訪客與沒有玩家：第四參數沒有效果 ──
{
  resetGuest();
  const before = local.getItem(GUEST_STATE_KEY);
  useJsPlayerStore.setState({ mode: "shared" });
  const a = st().settleBattle("chapter1_1", 19, 20, 1);
  const b = st().settleBattle("chapter1_1", 19, 20);
  const after = local.getItem(GUEST_STATE_KEY);
  check(
    "共用帳號模式（受控）帶第四參數：回傳和三參數逐欄相同（城防比例 2 星、notSaved、沒有收益），訪客存檔不變",
    same(a, b) &&
      a.stars === 2 &&
      a.notSaved === true &&
      a.goldEarned === 0 &&
      a.expEarned === 0 &&
      after === before,
    { a, b }
  );
  useJsPlayerStore.setState({ player: null });
  const c = st().settleBattle("chapter1_1", 19, 20, 1);
  const d = st().settleBattle("chapter1_1", 19, 20);
  check(
    "沒有玩家帶第四參數：回傳和三參數相同（預設 1 星、沒有收益、newLevel 1）",
    same(c, d) &&
      same(c, {
        stars: 1,
        expEarned: 0,
        goldEarned: 0,
        leveledUp: false,
        newLevel: 1,
      }),
    { c, d }
  );
  resetGuest();
}

// ── 頁面實際的 onBattleEnded 與 currentAccountOf ──
const PAGE = join(HERE, "../components/shenmaSanguoJsPage.tsx");
const sf = ts.createSourceFile(
  PAGE,
  readFileSync(PAGE, "utf8"),
  ts.ScriptTarget.ES2020,
  true,
  ts.ScriptKind.TSX
);
const found = { onBattleEnded: [], currentAccountOf: [] };
(function walk(n) {
  if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    n.left.getText(sf) === "bridge.onBattleEnded"
  )
    found.onBattleEnded.push(n.right);
  if (
    ts.isVariableDeclaration(n) &&
    ts.isIdentifier(n.name) &&
    n.name.text === "currentAccountOf" &&
    n.initializer
  )
    found.currentAccountOf.push(n.initializer);
  ts.forEachChild(n, walk);
})(sf);
check(
  "取出頁面的程式：onBattleEnded 回呼與模組層 currentAccountOf 各剛好一個",
  found.onBattleEnded.length === 1 && found.currentAccountOf.length === 1,
  {
    onBattleEnded: found.onBattleEnded.length,
    currentAccountOf: found.currentAccountOf.length,
  }
);
const js = (node) =>
  ts
    .transpileModule(`const __f = ${node.getText(sf)};`, {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2020,
      },
    })
    .outputText.replace(/^"use strict";\s*/, "");
const build = (name, deps) => {
  const keys = Object.keys(deps);
  return new Function(...keys, `${js(found[name][0])}\nreturn __f;`)(
    ...keys.map((k) => deps[k])
  );
};
const currentAccountOf = build("currentAccountOf", {});
/** 頁面實際的 onBattleEnded：React 的 setter、ref 是受控替身，settleBattle 由呼叫端給 */
function pageEnded({ ctx, storeObj, statsRef, settleBattle, log }) {
  return build("onBattleEnded", {
    battleCtxRef: { current: ctx },
    placementMenuRef: { current: null },
    setPlacementMenu: () => {},
    setUpgradeTower: () => {},
    setHeroInfo: () => {},
    setBattleResult: (r) => log.result.push(r),
    setSettleRetryMsg: () => {},
    setLocalNotSavedReason: (v) => log.reason.push(v),
    setBattleReward: (v) => log.reward.push(v),
    useJsPlayerStore: { getState: storeObj },
    guestRewardAllowed: B.guestRewardAllowed,
    currentAccountOf,
    LOCAL_NOT_SAVED_TEXT: B.LOCAL_NOT_SAVED_TEXT,
    settleBattle,
    currentStageRef: { current: { map_id: "chapter1_1" } },
    statsRef,
  });
}

// ── 5. 真引擎：最後一隻漏進城的那一幀同時勝利；城防歸零落敗 ──
const renderer = { init() {}, resize() {}, render() {}, destroy() {} };
/** 一場只有一波的快速敵人（直接漏進城），用固定時戳逐幀呼叫 gameLoop，statsRef 每幀結束後才更新 */
function runEngine(count) {
  resetGuest();
  const e = new BattleEngine(renderer);
  const bridge = Object.create(LocalGameBridge.prototype);
  bridge.engine = e;
  LocalGameBridge.prototype.bindEngineCallbacks.call(bridge);
  const bm = e.battleManager;
  e.loadStage({
    stageId: "chapter1_1",
    battleId: "g_1",
    totalWaves: 1,
    pathJson: {
      cols: 14,
      rows: 10,
      paths: {
        path_a: [
          [0, 3],
          [3, 3],
        ],
      },
      base: [3, 3],
      build_zones: [[2, 1]],
    },
    waves: [
      {
        wave: 1,
        enemies: [{ enemy_id: "e_fast", count, interval: 0.3, path: "path_a" }],
      },
    ],
    heroesConfig: [],
    enemiesConfig: [{ enemy_id: "e_fast", hp: 1000000, speed: 300, atk: 1 }],
    playerHeroes: [],
  });
  let pending = null;
  bridge.onStatsChanged = (s) => {
    pending = s;
  };
  bm.syncStats();
  const statsRef = { current: pending };
  const log = { result: [], reward: [], reason: [], settle: [] };
  const owner = {
    mode: "guest",
    key: GUEST_KEY,
    epoch: st().getAccountEpoch(),
  };
  const handler = pageEnded({
    ctx: { battleId: "g_1", owner },
    storeObj: () => st(),
    statsRef,
    settleBattle: (...a) => {
      log.settle.push(a);
      return st().settleBattle(...a);
    },
    log,
  });
  const seen = {};
  bridge.onBattleEnded = (r) => {
    seen.r = r;
    seen.hp = bm.baseHp;
    seen.statsHp = statsRef.current && statsRef.current.hp;
    handler(r);
  };
  const before = local.getItem(GUEST_STATE_KEY);
  let t = 1000;
  e.lastTimestamp = t;
  bridge.startBattle();
  for (let i = 0; i < 4000 && bm.gameState !== GameState.RESULT; i++) {
    t += 16;
    e.gameLoop(t);
    if (pending) statsRef.current = pending;
  }
  return { seen, log, before, after: local.getItem(GUEST_STATE_KEY) };
}
{
  const { seen, log } = runEngine(11);
  const reward = log.reward.at(-1);
  check(
    "同一幀（真引擎 gameLoop、頁面實際 onBattleEnded、statsRef 每幀結束後才更新）：最後一隻漏進城的那一幀同時勝利 → 引擎城防 9、凍結 1 星；頁面傳的城防仍是 10、第四參數 1；訪客回傳與本機紀錄都是 1",
    seen.r &&
      seen.r.result === "WIN" &&
      seen.r.stars_earned === 1 &&
      seen.hp === 9 &&
      seen.statsHp === 10 &&
      log.settle.length === 1 &&
      same(log.settle[0], ["chapter1_1", 10, 20, 1]) &&
      reward &&
      reward.stars === 1 &&
      st().player.cleared_stages.chapter1_1 === 1 &&
      saved().cleared_stages.chapter1_1 === 1,
    {
      r: seen.r && { result: seen.r.result, stars: seen.r.stars_earned },
      hp: seen.hp,
      statsHp: seen.statsHp,
      settle: log.settle,
      reward: reward && reward.stars,
    }
  );
}
{
  const { seen, log, before, after } = runEngine(20);
  check(
    "真的落敗（20 隻漏進城、城防 0）：頁面不呼叫 settleBattle、獎勵是 null、訪客存檔不變",
    seen.r &&
      seen.r.result === "LOSE" &&
      seen.r.stars_earned === 0 &&
      log.settle.length === 0 &&
      log.reward.at(-1) === null &&
      after === before,
    { r: seen.r && seen.r.result, settle: log.settle.length }
  );
}

// ── 6. 來源界線（頁面實際 onBattleEnded；假 store 狀態） ──
{
  const fake = (mode, key, epoch, isLoading = false) => ({
    mode,
    player: key ? { key } : null,
    getAccountEpoch: () => epoch,
    isLoading,
    settleSharedBattle: async () => {},
  });
  const OWN = { mode: "guest", key: "test_guest_a", epoch: 3 };
  const run = (storeObj, battleId = "b1") => {
    const log = { result: [], reward: [], reason: [], settle: [] };
    pageEnded({
      ctx: { battleId: "b1", owner: OWN },
      storeObj: () => storeObj,
      statsRef: { current: { hp: 20, max_hp: 20 } },
      settleBattle: (...a) => {
        log.settle.push(a);
        return { stars: 3 };
      },
      log,
    })({ battle_id: battleId, result: "WIN", stars_earned: 3 });
    return log.settle;
  };
  const n = {
    self: run(fake("guest", "test_guest_a", 3)),
    newEpoch: run(fake("guest", "test_guest_a", 4)),
    otherGuest: run(fake("guest", "test_guest_b", 3)),
    shared: run(fake("shared", "test_shared_c", 3)),
    none: run(fake("none", null, 3)),
    loading: run(fake("guest", "test_guest_a", 3, true)),
    oldBattle: run(fake("guest", "test_guest_a", 3), "b0"),
  };
  check(
    "來源界線（頁面實際 onBattleEnded）：訪客本人勝利 → settleBattle 1 次（第四參數＝這場的星數 3）；同訪客新世代、另一個訪客、共用帳號、還沒選帳號、載入中、舊場次晚到 → 0 次",
    same(n.self, [["chapter1_1", 20, 20, 3]]) &&
      [
        "newEpoch",
        "otherGuest",
        "shared",
        "none",
        "loading",
        "oldBattle",
      ].every((k) => n[k].length === 0),
    n
  );
}

check("整段沒有網路請求（fetch 呼叫 0 次）", fetchCalls === 0, { fetchCalls });

const passed = results.filter((r) => r.pass).length;
console.log(
  `RESULT_JSON ${JSON.stringify({ passed, total: results.length, failed: results.length - passed })}`
);
process.exit(passed === results.length ? 0 : 1);
