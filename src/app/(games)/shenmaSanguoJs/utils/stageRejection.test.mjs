// 神馬三國 JS 版：缺資料的關卡載入守門與開波被拒說明（純 Node、不連網）
// - 被測體是頁面實際的程式：用 TypeScript AST 從 components/shenmaSanguoJsPage.tsx 取出 loadBattle、loadStageData（useCallback 的第一個參數）、
//   遠端設定讀到後的 then 回呼、handleStartBattle、handleToggleAuto，以及模組層的 teamSourceUsable、isRemoteConfig、stageLoadRejectText、
//   stageLoadProblemOf、WAVE_CONFIG_REASONS、waveRejectText 原文（轉成 JS 後執行），不另抄一份邏輯
// - 真的部分：utils/stagePlayability.ts（getStageDataProblem、stageDataProblemText、isStageUnlocked）、engine/builtinData.ts、
//   真 BattleEngine／BattleManager／WaveManager，以及 LocalGameBridge 實際的 getStageLoadState、startBattle、toggleAuto、bindEngineCallbacks
//   （Bridge 用原型建立、不跑建構子的 DOM 部分，engine 指到真引擎，再呼叫實際的 bindEngineCallbacks 接上引擎回呼）
// - 受控替身（都標明）：React 的 setter 與 ref 是記錄呼叫的假物件；store 是假物件；StageDataManager 是假單例（只給 getStages／
//   getHeroesConfig／getEnemiesConfig）；renderer 什麼都不畫；requestAnimationFrame 換成不排程的空函式；開戰用 Bridge 實際的 startBattle、
//   清波用 BattleManager 既有的 onWaveAllEnemiesDead、暫停直接設 manualPaused、結算用既有的 endBattle
// - 第 9 段起的暫停與恢復改用 Bridge 實際的 togglePause（頁面暫停鍵呼叫的同一個方法；仍是受控前置，不是自然暫停驗收）；
//   放塔用真引擎的 placeTower 當前置（讓金幣與場上單位有東西可比）
// - 第 12 段另外取出模組層的 latestStageOf、sameOwner 與「出征隊伍改變時」的 effect 原文，用同一個受控環境執行（說明見該段）
// - 期待值全部手寫（說明文字逐字、呼叫順序與次數），不由被測的程式產生
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/stageRejection.test.mjs"
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

// 遊戲迴圈結尾的 requestAnimationFrame 換成不排程的空函式（只在 Node 測試裡）
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
const SP = require(join(HERE, "stagePlayability.ts"));
const BD = require(join(HERE, "../engine/builtinData.ts"));
const { BattleEngine } = require(join(HERE, "../engine/BattleEngine.ts"));
const { GameState } = require(join(HERE, "../engine/BattleManager.ts"));
const { LocalGameBridge } = require(join(HERE, "../engine/LocalGameBridge.ts"));

// ── 從頁面取出實際的程式 ──
const PAGE = join(HERE, "../components/shenmaSanguoJsPage.tsx");
const sf = ts.createSourceFile(
  PAGE,
  readFileSync(PAGE, "utf8"),
  ts.ScriptTarget.ES2020,
  true,
  ts.ScriptKind.TSX
);
const NAMES = [
  "teamSourceUsable",
  "isRemoteConfig",
  "stageLoadRejectText",
  "stageLoadProblemOf",
  "WAVE_CONFIG_REASONS",
  "waveRejectText",
  "loadBattle",
  "loadStageData",
  "handleStartBattle",
  "handleToggleAuto",
];
const found = Object.fromEntries(NAMES.map((n) => [n, []]));
found.then = [];
(function walk(n) {
  if (
    ts.isVariableDeclaration(n) &&
    ts.isIdentifier(n.name) &&
    found[n.name.text] &&
    n.initializer
  ) {
    let init = n.initializer;
    // useCallback(箭頭函式, [...]) 取第一個參數
    if (
      ts.isCallExpression(init) &&
      ts.isIdentifier(init.expression) &&
      init.expression.text === "useCallback"
    )
      init = init.arguments[0];
    found[n.name.text].push(init);
  }
  if (
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === "then" &&
    ts.isCallExpression(n.expression.expression) &&
    n.expression.expression.expression.getText(sf) === "stageMgr.loadAllStages"
  )
    found.then.push(n.arguments[0]);
  ts.forEachChild(n, walk);
})(sf);
check(
  "取出頁面的程式（每個剛好一個）：模組層 6 個、loadBattle／loadStageData、遠端設定的 then 回呼、handleStartBattle、handleToggleAuto",
  Object.values(found).every((v) => v.length === 1),
  {
    counts: Object.fromEntries(
      Object.entries(found).map(([k, v]) => [k, v.length])
    ),
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
/** 用指定的依賴執行頁面取出的程式，回傳它的值 */
const build = (name, deps) => {
  const keys = Object.keys(deps);
  return new Function(...keys, `${js(found[name][0])}\nreturn __f;`)(
    ...keys.map((k) => deps[k])
  );
};
const teamSourceUsable = build("teamSourceUsable", {});
const isRemoteConfig = build("isRemoteConfig", {
  BUILTIN_STAGES: BD.BUILTIN_STAGES,
  BUILTIN_HEROES_CONFIG: BD.BUILTIN_HEROES_CONFIG,
  BUILTIN_ENEMIES_CONFIG: BD.BUILTIN_ENEMIES_CONFIG,
});
const stageLoadRejectText = build("stageLoadRejectText", {
  stageDataProblemText: SP.stageDataProblemText,
});
const WAVE_CONFIG_REASONS = build("WAVE_CONFIG_REASONS", {});
const waveRejectText = build("waveRejectText", { WAVE_CONFIG_REASONS });

// ── 關卡資料（手寫） ──
const PATH = {
  cols: 14,
  rows: 10,
  paths: {
    path_a: [
      [0, 3],
      [13, 3],
    ],
  },
  base: [13, 3],
  build_zones: [[2, 1]],
};
const WAVE = (wave, enemy = "e_slow") => ({
  wave,
  enemies: [{ enemy_id: enemy, count: 1, interval: 1, path: "path_a" }],
});
const ENEMIES = [{ enemy_id: "e_slow", hp: 1000000, speed: 0.01, atk: 1 }];
const stage = (id, name, extra = {}) => ({
  map_id: id,
  chapter: 1,
  name,
  unlock_stage: id,
  path_json: PATH,
  waves: [WAVE(1), WAVE(2), WAVE(3)],
  ...extra,
});
const GOOD = stage("chapter1_1", "黃巾起義");
const GOOD2 = stage("chapter1_2", "桃園結義");
const NO_ROUTE = stage("chapter1_1", "黃巾起義", {
  path_json: { cols: 14, rows: 10, base: [13, 3], build_zones: [] },
});
const NO_WAVES = stage("chapter1_1", "黃巾起義", { waves: [] });
const BOTH = stage("chapter1_1", "黃巾起義", {
  path_json: { cols: 14, rows: 10 },
  waves: [],
});
const BAD_ENEMY = stage("chapter1_3", "討伐黃巾", {
  waves: [WAVE(1, "e_missing"), WAVE(2)],
});
const T_ROUTE =
  "「黃巾起義」關卡資料未完成：沒有可用的行軍路線，暫時不能出征，請改選已開放關卡。";
const T_WAVES =
  "「黃巾起義」關卡資料未完成：沒有波次資料，暫時不能出征，請改選已開放關卡。";
const T_BOTH =
  "「黃巾起義」關卡資料未完成：沒有可用的行軍路線、沒有波次資料，暫時不能出征，請改選已開放關卡。";
const T_WAVE_CFG = "這一波的敵軍配置尚未完成，暫時無法開始，請改選已開放關卡。";
const T_WAVE_OTHER = "這一波暫時無法開始，請改選其他關卡或稍後再試。";

// ── 說明文字（頁面實際的模組層函式） ──
check(
  "說明：缺路線／缺波次／兩者都缺的逐字句子（關卡名稱＋既有的缺什麼說明）",
  stageLoadRejectText(NO_ROUTE, SP.getStageDataProblem(NO_ROUTE)) === T_ROUTE &&
    stageLoadRejectText(NO_WAVES, SP.getStageDataProblem(NO_WAVES)) ===
      T_WAVES &&
    stageLoadRejectText(BOTH, SP.getStageDataProblem(BOTH)) === T_BOTH,
  [
    stageLoadRejectText(NO_ROUTE, SP.getStageDataProblem(NO_ROUTE)),
    stageLoadRejectText(BOTH, SP.getStageDataProblem(BOTH)),
  ]
);
{
  const cfg = [
    "wave_missing",
    "wave_empty",
    "enemy_not_found",
    "path_empty",
    "flight_single_point",
    "flight_same_endpoints",
    "ground_single_point",
    "ground_zero_length",
    "count_invalid",
  ];
  const other = ["wave_start_failed", "<b>x</b>", "", null, undefined, 3, {}];
  check(
    "開波被拒的說明：資料類的 9 個原因碼都是「這一波的敵軍配置尚未完成…」；start_failed、未知、HTML、空字串、null、非字串都是安全的通用句（不含原因碼）",
    cfg.every((r) => waveRejectText(r) === T_WAVE_CFG) &&
      other.every((r) => waveRejectText(r) === T_WAVE_OTHER),
    { got: other.map((r) => waveRejectText(r)) }
  );
}

// ── 真引擎＋實際的 Bridge ──
const renderer = { init() {}, resize() {}, render() {}, destroy() {} };
function newBridge() {
  const e = new BattleEngine(renderer);
  e.lastTimestamp = 1000;
  const bridge = Object.create(LocalGameBridge.prototype);
  bridge.engine = e;
  // 實際的 bindEngineCallbacks：接上引擎的回呼（含 onWaveRejected）
  LocalGameBridge.prototype.bindEngineCallbacks.call(bridge);
  return { e, bm: e.battleManager, wm: e.waveManager, bridge };
}
const payload = (st, battleId) => ({
  stageId: st.map_id,
  battleId,
  totalWaves: st.waves.length,
  pathJson: st.path_json,
  waves: st.waves,
  heroesConfig: [],
  enemiesConfig: ENEMIES,
  playerHeroes: [],
});
const bmState = (bm) => ({
  battleId: bm.battleId,
  phase: bm.gameState,
  wave: bm.currentWave,
  paused: bm.manualPaused,
  auto: bm.autoMode,
});

// ── 1. Bridge 的純查詢 getStageLoadState ──
{
  const { e, bm, bridge } = newBridge();
  e.loadStage(payload(GOOD, "q_1"));
  let synced = 0;
  e.onStatsUpdated = () => synced++;
  const before = bmState(bm);
  const a = bridge.getStageLoadState();
  const b = bridge.getStageLoadState();
  a.battleId = "x";
  a.wave = 99;
  a.phase = GameState.BATTLE;
  a.paused = true;
  check(
    "getStageLoadState：四個鍵 battleId／phase／wave／paused＝BattleManager 當下的值、每次新物件、值都不是物件；改回傳值不影響 BattleManager、查詢沒有同步通知",
    same(Object.keys(b).sort(), ["battleId", "paused", "phase", "wave"]) &&
      b.battleId === "q_1" &&
      b.phase === GameState.PREP &&
      b.wave === 0 &&
      b.paused === false &&
      a !== b &&
      Object.values(b).every((v) => v === null || typeof v !== "object") &&
      same(bmState(bm), before) &&
      synced === 0,
    { b, now: bmState(bm), synced }
  );
  // 實際狀態變化時跟著變：開戰 → 戰鬥中第 1 波；清波 → 第 1 波備戰；暫停
  bridge.startBattle();
  const s1 = bridge.getStageLoadState();
  bm.onWaveAllEnemiesDead();
  const s2 = bridge.getStageLoadState();
  bm.manualPaused = true;
  const s3 = bridge.getStageLoadState();
  check(
    "getStageLoadState 跟著實際狀態：開戰後（戰鬥中、第 1 波）、受控清波後（備戰、第 1 波）、受控暫停（paused true）",
    s1.phase === GameState.BATTLE &&
      s1.wave === 1 &&
      s2.phase === GameState.PREP &&
      s2.wave === 1 &&
      s3.paused === true,
    { s1, s2, s3 }
  );
}

// ── 頁面函式的受控環境 ──
const OWNER = { mode: "guest", key: "guest_k1", epoch: 7 };
const TEAM = { heroes: [], owner: OWNER };
function storeOf(extra = {}) {
  const s = {
    isLoading: false,
    mode: "guest",
    player: { key: "guest_k1" },
    teamEditable: true,
    readOnly: false,
    canonical: null,
    disarms: 0,
    getAccountEpoch: () => 7,
    disarmSharedSettle() {
      this.disarms++;
    },
    ...extra,
  };
  return s;
}
/** 假的 StageDataManager 單例：getStages 回 remote（沒有就是內建） */
const mgrOf = (remote = BD.BUILTIN_STAGES) => {
  const inst = {
    getStages: () => remote,
    getHeroesConfig: () =>
      remote === BD.BUILTIN_STAGES ? BD.BUILTIN_HEROES_CONFIG : [],
    getEnemiesConfig: () =>
      remote === BD.BUILTIN_STAGES ? BD.BUILTIN_ENEMIES_CONFIG : ENEMIES,
  };
  return { getInstance: () => inst };
};
/**
 * 頁面的 loadBattle／loadStageData／handler 的執行環境：setter 記錄呼叫順序（[名稱, 值]），ref 是普通物件。
 * 引擎載入一場起始的完整關卡當「目前這一場」
 */
function env(opts = {}) {
  const calls = [];
  const S = (name) => (v) => calls.push([name, v]);
  const eng = newBridge();
  const store = opts.store ?? storeOf();
  const mgr = mgrOf(opts.remote);
  eng.e.loadStage(payload(opts.start ?? GOOD, "start_1"));
  const ctx0 = {
    battleId: "start_1",
    stageId: (opts.start ?? GOOD).map_id,
    configReady: false,
    practice: false,
    armTried: false,
    owner: OWNER,
    syncedTeam: "[]",
  };
  const r = {
    eng,
    calls,
    store,
    bridgeRef: { current: eng.bridge },
    battleCtxRef: { current: opts.noCtx ? null : ctx0 },
    ctx0,
    battleSeqRef: { current: 5 },
    placementMenuRef: { current: "OLD_MENU" },
    stageBlockRef: { current: opts.block ?? null },
    currentStageRef: { current: opts.current ?? GOOD },
    activeTeamRef: { current: opts.team ?? TEAM },
    panelUnitRef: { current: "OLD_PANEL" },
  };
  const stageLoadProblemOf = build("stageLoadProblemOf", {
    getStageDataProblem: SP.getStageDataProblem,
    StageDataManager: mgr,
    BUILTIN_STAGES: BD.BUILTIN_STAGES,
    stageLoadRejectText,
  });
  r.stageLoadProblemOf = stageLoadProblemOf;
  const common = {
    bridgeRef: r.bridgeRef,
    useJsPlayerStore: { getState: () => store },
    battleCtxRef: r.battleCtxRef,
    stageLoadProblemOf,
    setStageLoadNotice: S("notice"),
    setIsStageSelectorOpen: S("selector"),
    GameState,
    stageBlockRef: r.stageBlockRef,
    setStageBlock: S("block"),
  };
  r.loadBattle = build("loadBattle", {
    ...common,
    teamSourceUsable,
    StageDataManager: mgr,
    battleSeqRef: r.battleSeqRef,
    isRemoteConfig,
    isStageUnlocked: SP.isStageUnlocked,
    BUILTIN_HEROES_CONFIG: BD.BUILTIN_HEROES_CONFIG,
    BUILTIN_ENEMIES_CONFIG: BD.BUILTIN_ENEMIES_CONFIG,
    waveRejectText,
    setPlacedHeroIds: S("placed"),
    setPlacementMenu: S("placementMenu"),
    placementMenuRef: r.placementMenuRef,
    setBattleOwner: S("owner"),
  });
  r.loadBattleCalls = [];
  r.loadBattleResults = [];
  const lb = (...a) => {
    r.loadBattleCalls.push(a[0]);
    const ok = r.loadBattle(...a);
    r.loadBattleResults.push(ok);
    return ok;
  };
  r.mgr = mgr;
  r.lb = lb;
  r.S = S;
  r.loadStageData = build("loadStageData", {
    ...common,
    activeTeamRef: r.activeTeamRef,
    teamSourceUsable,
    setCurrentStage: S("currentStage"),
    currentStageRef: r.currentStageRef,
    setPlacementMenu: S("placementMenu"),
    setUpgradeTower: S("upgradeTower"),
    setHeroInfo: S("heroInfo"),
    panelUnitRef: r.panelUnitRef,
    setPanelSnap: S("panelSnap"),
    setBattleResult: S("battleResult"),
    setBattleReward: S("battleReward"),
    setLocalNotSavedReason: S("localNotSaved"),
    setPlacedHeroIds: S("placed"),
    loadBattle: lb,
  });
  r.then = (bridge) =>
    build("then", {
      ...common,
      // 頁面模組層的來源判斷（then 原文沒有用到；讓改壞來源判斷的反例能執行到具名斷言）
      teamSourceUsable,
      bridge,
      setAllStages: S("allStages"),
      currentStageRef: r.currentStageRef,
      setCurrentStage: S("currentStage"),
      loadBattle: lb,
      activeTeamRef: r.activeTeamRef,
      statsRef: { current: STALE },
      stats: STALE,
    });
  r.handleStartBattle = (sortieBlockReason = null) =>
    build("handleStartBattle", {
      sortieBlockReason,
      bridgeRef: r.bridgeRef,
      stageBlockRef: r.stageBlockRef,
      statsRef: { current: STALE },
      stats: STALE,
    });
  r.handleToggleAuto = (storeState) =>
    build("handleToggleAuto", {
      bridgeRef: r.bridgeRef,
      GameState,
      sortieBlockReasonOf: (s) =>
        s.mode === "shared" && s.player && s.player.team.length === 0
          ? "還沒有出征隊伍：請先到「隊伍」編排並保存"
          : null,
      useJsPlayerStore: { getState: () => storeState ?? store },
      stageBlockRef: r.stageBlockRef,
      statsRef: { current: STALE },
      stats: STALE,
    });
  return r;
}
const names = (calls) => calls.map((c) => c[0]);
/** 畫面晚一拍的值（第 0 波、備戰、沒暫停、沒開自動）：頁面真正的判斷不應該看它們 */
const STALE = {
  battle_id: "stale_0",
  wave: 0,
  game_state: GameState.PREP,
  paused: false,
  auto_mode: false,
};

// ── 2. loadBattle：正常資料成功一次 ──
{
  const r = env({
    block: { battleId: "start_1", stageId: "chapter1_1", reason: "舊" },
  });
  const ok = r.loadBattle(GOOD2, TEAM);
  const bm = r.eng.bm;
  check(
    "loadBattle（正常的完整關卡）：回 true；新的 battleId（序號 5→6）、新的這一場（關卡 chapter1_2、來源＝隊伍來源）、放下固定 1 次、引擎載入這一場（備戰第 0 波）",
    ok === true &&
      r.battleSeqRef.current === 6 &&
      r.battleCtxRef.current !== r.ctx0 &&
      r.battleCtxRef.current.stageId === "chapter1_2" &&
      /^battle_\d+_6$/.test(r.battleCtxRef.current.battleId) &&
      bm.battleId === r.battleCtxRef.current.battleId &&
      bm.gameState === GameState.PREP &&
      bm.currentWave === 0 &&
      r.store.disarms === 1 &&
      same(r.battleCtxRef.current.owner, OWNER),
    {
      ok,
      ctx: r.battleCtxRef.current,
      bm: bmState(bm),
      disarms: r.store.disarms,
    }
  );
  check(
    "loadBattle（成功）：畫面依序清掉在場名單、部署選單、記來源，最後清掉資料阻擋與說明（block null、notice null）；開波被拒通知已接上",
    same(names(r.calls), [
      "placed",
      "placementMenu",
      "owner",
      "block",
      "notice",
    ]) &&
      r.calls[3][1] === null &&
      r.calls[4][1] === null &&
      r.stageBlockRef.current === null &&
      r.placementMenuRef.current === null &&
      typeof r.eng.bridge.onWaveRejected === "function",
    { calls: names(r.calls) }
  );
}

// ── 3. loadBattle：缺資料在任何副作用前拒絕 ──
for (const [label, st, text] of [
  ["缺路線", NO_ROUTE, T_ROUTE],
  ["空波次", NO_WAVES, T_WAVES],
  ["路線與波次都缺", BOTH, T_BOTH],
]) {
  const r = env();
  const before = bmState(r.eng.bm);
  const ok = r.loadBattle(st, TEAM);
  check(
    `loadBattle（${label}）：回 false；只顯示「${text.slice(0, 22)}…」並打開關卡選擇；序號、這一場、固定、引擎、在場名單、選單、來源都不動`,
    ok === false &&
      same(r.calls, [
        ["notice", text],
        ["selector", true],
      ]) &&
      r.battleSeqRef.current === 5 &&
      r.battleCtxRef.current === r.ctx0 &&
      r.store.disarms === 0 &&
      same(bmState(r.eng.bm), before) &&
      r.placementMenuRef.current === "OLD_MENU" &&
      r.eng.bridge.onWaveRejected === undefined,
    { ok, calls: r.calls, bm: bmState(r.eng.bm) }
  );
}
{
  // 來源先核：來源不能用時不看資料、什麼都不做（原守門）
  const cases = [
    [
      "還沒選帳號（none、不是首次內建）",
      storeOf({ mode: "none", player: null }),
      { heroes: [], owner: { mode: "none", key: null, epoch: null } },
    ],
    ["載入中", storeOf({ isLoading: true }), TEAM],
    ["過期的帳號世代", storeOf({ getAccountEpoch: () => 8 }), TEAM],
  ];
  for (const [label, store, team] of cases) {
    const r = env({ store });
    const ok = r.loadBattle(BOTH, team);
    check(
      `loadBattle 來源守門照舊（${label}）：回 false、連資料說明都沒有（先核來源）；這一場與引擎不動`,
      ok === false &&
        r.calls.length === 0 &&
        r.battleCtxRef.current === r.ctx0 &&
        r.eng.bm.battleId === "start_1",
      { calls: r.calls }
    );
  }
  // 首次內建展示照原規則：還沒有任何一場、還沒選帳號、內建資料 → 可以載入
  const r = env({
    noCtx: true,
    store: storeOf({ mode: "none", player: null }),
  });
  const ok = r.loadBattle(
    BD.BUILTIN_STAGES[0],
    { heroes: [], owner: { mode: "none", key: null, epoch: null } },
    true
  );
  check(
    "loadBattle 首次內建展示照原規則：還沒有任何一場、兩邊都沒選帳號、內建資料 → 回 true（不新禁 bootstrap）",
    ok === true &&
      r.battleCtxRef.current !== null &&
      r.battleCtxRef.current.configReady === false,
    { ok }
  );
}
{
  // 後端已讀到同一關而且缺資料：不改用同一個 ID 的內建代用資料載入
  const remote = [NO_ROUTE, GOOD2];
  const r = env({ remote });
  const before = bmState(r.eng.bm);
  const ok = r.loadBattle(GOOD, TEAM);
  check(
    "loadBattle：後端的 chapter1_1 缺路線時，傳入同 ID 的完整內建資料也拒絕（說明用後端的那一份）；這一場與引擎不動",
    ok === false &&
      same(r.calls, [
        ["notice", T_ROUTE],
        ["selector", true],
      ]) &&
      same(bmState(r.eng.bm), before) &&
      r.battleCtxRef.current === r.ctx0,
    { calls: r.calls }
  );
  const ok2 = r.loadBattle(GOOD2, TEAM);
  check(
    "同上環境，後端完整的另一關 chapter1_2 照常載入（另一關的缺資料不擋這一關）",
    ok2 === true && r.battleCtxRef.current.stageId === "chapter1_2",
    { ok2 }
  );
}

// ── 4. loadStageData：同一個資料檢查在任何畫面變更之前 ──
{
  const r = env();
  const ok = r.loadStageData(NO_WAVES);
  check(
    "loadStageData（空波次）：回 false；只顯示說明並打開關卡選擇，沒有換關卡（currentStage／ref 不動）、沒清面板與結算、沒呼叫 loadBattle",
    ok === false &&
      same(r.calls, [
        ["notice", T_WAVES],
        ["selector", true],
      ]) &&
      r.currentStageRef.current === GOOD &&
      r.panelUnitRef.current === "OLD_PANEL" &&
      r.loadBattleCalls.length === 0,
    { calls: r.calls }
  );
  const r2 = env();
  const ok2 = r2.loadStageData(GOOD2);
  check(
    "loadStageData（完整的另一關）：換關卡、清面板與結算，再呼叫 loadBattle 一次並成功；最後清掉說明",
    ok2 === true &&
      r2.currentStageRef.current === GOOD2 &&
      r2.loadBattleCalls.length === 1 &&
      names(r2.calls)[0] === "currentStage" &&
      names(r2.calls).includes("battleResult") &&
      names(r2.calls).at(-1) === "notice" &&
      r2.calls.at(-1)[1] === null,
    { calls: names(r2.calls) }
  );
}

// ── 5. 遠端設定的 then 回呼 ──
const res = (...stages) => ({ stages });
{
  // 舊 bridge 的結果：不改任何畫面
  const r = env();
  const old = newBridge().bridge;
  r.then(old)(res(GOOD, GOOD2));
  check(
    "then：已換成新 bridge 時，舊 bridge 的結果 0 次畫面變更、不載入",
    r.calls.length === 0 && r.loadBattleCalls.length === 0,
    { calls: r.calls }
  );
}
{
  // 第 0 波備戰、沒暫停、仍是這一場：完整 → 換成後端資料並重新載入
  const remoteGood = stage("chapter1_1", "黃巾起義", {
    waves: [WAVE(1), WAVE(2)],
  });
  const r = env({ remote: [remoteGood, GOOD2] });
  r.then(r.eng.bridge)(res(remoteGood, GOOD2));
  check(
    "then（第 0 波備戰、完整）：更新清單、換成後端的這一關、重新載入一次（新的一場）",
    names(r.calls)[0] === "allStages" &&
      same(names(r.calls), [
        "allStages",
        "placed",
        "placementMenu",
        "owner",
        "block",
        "notice",
        "currentStage",
      ]) &&
      r.currentStageRef.current === remoteGood &&
      r.loadBattleCalls.length === 1 &&
      r.loadBattleCalls[0] === remoteGood &&
      r.eng.bm.battleId !== "start_1",
    { calls: names(r.calls) }
  );
}
for (const [label, bad, text] of [
  ["缺路線", NO_ROUTE, T_ROUTE],
  ["空波次", NO_WAVES, T_WAVES],
  ["兩者都缺", BOTH, T_BOTH],
]) {
  const r = env({ remote: [bad, GOOD2] });
  const before = bmState(r.eng.bm);
  r.then(r.eng.bridge)(res(bad, GOOD2));
  check(
    `then（第 0 波備戰、後端同關${label}）：只更新清單；不換成壞資料、不重新載入、不清場；記下這一場的資料阻擋並說明原因、打開關卡選擇`,
    same(names(r.calls), ["allStages", "block", "notice", "selector"]) &&
      same(r.calls[1][1], {
        battleId: "start_1",
        stageId: "chapter1_1",
        reason: text,
      }) &&
      r.calls[2][1] === text &&
      same(r.stageBlockRef.current, {
        battleId: "start_1",
        stageId: "chapter1_1",
        reason: text,
      }) &&
      r.currentStageRef.current === GOOD &&
      r.loadBattleCalls.length === 0 &&
      same(bmState(r.eng.bm), before) &&
      r.battleCtxRef.current === r.ctx0,
    { calls: r.calls }
  );
}
{
  // 實際已是第 1 波備戰（清波後），畫面的 stats 還停在第 0 波：不重新載入
  const r = env({ remote: [stage("chapter1_1", "黃巾起義"), GOOD2] });
  r.eng.bridge.startBattle();
  r.eng.bm.onWaveAllEnemiesDead();
  const before = bmState(r.eng.bm);
  r.then(r.eng.bridge)(res(stage("chapter1_1", "黃巾起義"), GOOD2));
  const r2 = env({ remote: [NO_ROUTE, GOOD2] });
  r2.eng.bridge.startBattle();
  r2.eng.bm.onWaveAllEnemiesDead();
  r2.then(r2.eng.bridge)(res(NO_ROUTE, GOOD2));
  check(
    "then（實際第 1 波備戰、畫面 stats 晚一拍仍是第 0 波）：完整時只換畫面的這一關、不重新載入；缺資料時只更新清單、不設阻擋或說明",
    before.wave === 1 &&
      r.loadBattleCalls.length === 0 &&
      same(names(r.calls), ["allStages", "currentStage"]) &&
      same(bmState(r.eng.bm), before) &&
      same(names(r2.calls), ["allStages"]) &&
      r2.stageBlockRef.current === null,
    { before, calls: names(r.calls), calls2: names(r2.calls) }
  );
}
for (const [label, setup] of [
  ["戰鬥中", (e) => e.bridge.startBattle()],
  ["結算後", (e) => (e.bridge.startBattle(), e.bm.endBattle(false))],
]) {
  const r = env({ remote: [NO_WAVES, GOOD2] });
  setup(r.eng);
  const before = bmState(r.eng.bm);
  r.then(r.eng.bridge)(res(NO_WAVES, GOOD2));
  check(
    `then（${label}、後端同關缺資料）：只更新清單，不重新載入、不清場、不設阻擋或說明`,
    same(names(r.calls), ["allStages"]) &&
      r.loadBattleCalls.length === 0 &&
      same(bmState(r.eng.bm), before) &&
      r.stageBlockRef.current === null,
    { calls: names(r.calls), before }
  );
}
{
  // 暫停中的第 0 波備戰仍是還沒開打的這一場：缺資料時記下阻擋（暫停不改）
  const r = env({ remote: [NO_WAVES, GOOD2] });
  r.eng.bm.manualPaused = true;
  const before = bmState(r.eng.bm);
  r.then(r.eng.bridge)(res(NO_WAVES, GOOD2));
  check(
    "then（暫停中（第 0 波備戰）、後端同關缺資料）：不重新載入、不清場、暫停保持；記下同場阻擋並說明原因、打開選關",
    same(names(r.calls), ["allStages", "block", "notice", "selector"]) &&
      same(r.calls[1][1], {
        battleId: "start_1",
        stageId: "chapter1_1",
        reason: T_WAVES,
      }) &&
      r.calls[2][1] === T_WAVES &&
      r.calls[3][1] === true &&
      same(r.stageBlockRef.current, {
        battleId: "start_1",
        stageId: "chapter1_1",
        reason: T_WAVES,
      }) &&
      r.loadBattleCalls.length === 0 &&
      same(bmState(r.eng.bm), before) &&
      before.paused === true,
    { calls: r.calls, before }
  );
}
{
  // 這一場已不是畫面記的那一場（ctx 與 Bridge 不同）：不重新載入
  const r = env({ remote: [stage("chapter1_1", "黃巾起義"), GOOD2] });
  r.eng.e.loadStage(payload(GOOD, "other_9"));
  r.then(r.eng.bridge)(res(stage("chapter1_1", "黃巾起義"), GOOD2));
  check(
    "then：Bridge 實際的這一場和頁面記的這一場不同時，不重新載入",
    r.loadBattleCalls.length === 0,
    { calls: names(r.calls) }
  );
}

// ── 6. 開戰與自動：資料阻擋 ──
{
  const block = (id) => ({
    battleId: id,
    stageId: "chapter1_1",
    reason: T_ROUTE,
  });
  const run = (blk, sortie = null) => {
    const r = env({ block: blk });
    let starts = 0;
    const orig = r.eng.bridge.startBattle;
    r.eng.bridge.startBattle = function () {
      starts++;
      return orig.call(this);
    };
    r.handleStartBattle(sortie)();
    return { starts, st: bmState(r.eng.bm) };
  };
  const a = run(block("start_1"));
  const b = run(block("other_1"));
  const c = run(null);
  const d = run(null, "還沒有出征隊伍：請先到「隊伍」編排並保存");
  check(
    "handleStartBattle（頁面實際函式）：這一場有資料阻擋 → 不呼叫 startBattle（仍是第 0 波備戰）；阻擋屬於別場 → 照常開戰；沒有阻擋 → 開戰；出征原因有值 → 照原本不開",
    a.starts === 0 &&
      a.st.phase === GameState.PREP &&
      b.starts === 1 &&
      b.st.phase === GameState.BATTLE &&
      c.starts === 1 &&
      d.starts === 0,
    { a, b, c, d }
  );
}
{
  const blk = { battleId: "start_1", stageId: "chapter1_1", reason: T_ROUTE };
  const press = (r) => {
    let toggles = 0;
    const orig = r.eng.bridge.toggleAuto;
    r.eng.bridge.toggleAuto = function () {
      toggles++;
      return orig.call(this);
    };
    r.handleToggleAuto()();
    r.eng.bridge.toggleAuto = orig;
    return toggles;
  };
  const r1 = env({ block: blk });
  const t1 = press(r1);
  const r2 = env();
  const t2 = press(r2);
  // 已開自動（實際）時這一場才被記下阻擋：要關照常
  const r3 = env();
  r3.eng.bm.autoMode = true;
  r3.stageBlockRef.current = blk;
  const t3 = press(r3);
  // 暫停中照原規則不動
  const r4 = env();
  r4.eng.bm.manualPaused = true;
  const t4 = press(r4);
  check(
    "handleToggleAuto（頁面實際函式）：這一場有資料阻擋時新開不 toggle（不開波）；沒有阻擋時照常開（立刻開第 1 波）；實際已開時要關照常（不被資料阻擋擋住）；暫停中照原規則不動",
    t1 === 0 &&
      r1.eng.bm.autoMode === false &&
      r1.eng.bm.currentWave === 0 &&
      t2 === 1 &&
      r2.eng.bm.autoMode === true &&
      r2.eng.bm.currentWave === 1 &&
      t3 === 1 &&
      r3.eng.bm.autoMode === false &&
      t4 === 0,
    { t1, t2, t3, t4 }
  );
}

// ── 7. 開波被拒（真引擎拒絕 → 頁面實際的 onWaveRejected 回呼） ──
/** 受控呼叫回呼：不是函式就回 false（記成具名 FAIL，不丟例外） */
const callWR = (h, ...a) => (typeof h === "function" ? (h(...a), true) : false);
{
  const r = env({ remote: [BAD_ENEMY, GOOD, GOOD2] });
  const ok = r.loadBattle(BAD_ENEMY, TEAM);
  r.calls.length = 0;
  r.eng.bridge.startBattle();
  const st = bmState(r.eng.bm);
  check(
    "開波被拒（正常資料檢查放行、敵人 ID 不存在）：真引擎拒絕第 1 波 → 頁面回呼只顯示「這一波的敵軍配置尚未完成…」；仍是第 0 波備戰、場上沒有敵人、沒有結算",
    ok === true &&
      same(r.calls, [["notice", T_WAVE_CFG]]) &&
      st.phase === GameState.PREP &&
      st.wave === 0 &&
      r.eng.wm.activeEnemies.length === 0,
    { ok, calls: r.calls, st }
  );
  // 受控呼叫同一個回呼：未知原因碼、HTML → 安全的通用句（不顯示原因碼）
  r.calls.length = 0;
  const c1 = callWR(r.eng.bridge.onWaveRejected, 1, "<b>internal_code</b>");
  check(
    "開波被拒（受控呼叫頁面實際的回呼）：未知原因碼／HTML → 只顯示安全的通用句，不含原因碼",
    c1 && same(r.calls, [["notice", T_WAVE_OTHER]]),
    { calls: r.calls }
  );
  // 波次不對（不是下一波）→ 不改說明
  r.calls.length = 0;
  const c2 = callWR(r.eng.bridge.onWaveRejected, 3, "wave_empty");
  check(
    "開波被拒（受控）：回呼的波次不是下一波 → 不改說明",
    c2 && r.calls.length === 0,
    { calls: r.calls }
  );
  // 舊回呼：同一個 bridge 換成新的一場後，持有的舊回呼不改新場的說明
  const oldHandler = r.eng.bridge.onWaveRejected;
  r.loadBattle(GOOD2, TEAM);
  r.calls.length = 0;
  const c3 = callWR(oldHandler, 1, "wave_empty");
  check(
    "開波被拒（受控持有舊回呼）：同一個 bridge 換場後，舊場的回呼 0 次畫面變更（只證明捕捉的 battleId 守門，不宣稱能辨識被轉送的偽造事件）",
    c3 && r.calls.length === 0 && r.eng.bridge.onWaveRejected !== oldHandler,
    { calls: r.calls }
  );
  // 舊 bridge：頁面已換成另一個 bridge
  const curHandler = r.eng.bridge.onWaveRejected;
  r.bridgeRef.current = newBridge().bridge;
  const c4 = callWR(curHandler, 1, "wave_empty");
  check(
    "開波被拒（受控）：頁面已換成新的 bridge 時，舊 bridge 的回呼 0 次畫面變更",
    c4 && r.calls.length === 0,
    { calls: r.calls }
  );
  // 結算後：同一場、結算後的回呼不改說明
  r.bridgeRef.current = r.eng.bridge;
  r.eng.bridge.startBattle();
  r.eng.bm.endBattle(false);
  r.calls.length = 0;
  const c5 = callWR(
    r.eng.bridge.onWaveRejected,
    r.eng.bm.currentWave + 1,
    "wave_empty"
  );
  check(
    "開波被拒（受控）：這一場結算後的回呼 0 次畫面變更",
    c5 && r.calls.length === 0,
    { calls: r.calls }
  );
}
{
  // 對照：有效的波次正常開始（沒有被拒說明）；後端設定含這一波的敵人
  const r = env({ remote: [GOOD, GOOD2] });
  r.loadBattle(GOOD2, TEAM);
  r.calls.length = 0;
  r.eng.bridge.startBattle();
  check(
    "對照：有效的波次正常開始（戰鬥中第 1 波、場上 1 個敵人、沒有任何說明）",
    r.eng.bm.gameState === GameState.BATTLE &&
      r.eng.bm.currentWave === 1 &&
      r.eng.wm.activeEnemies.length === 1 &&
      r.calls.length === 0,
    { calls: r.calls, st: bmState(r.eng.bm) }
  );
}

// ── 8. 說明只在成功載入時清掉 ──
{
  const r = env();
  r.loadBattle(NO_ROUTE, TEAM);
  r.loadStageData(BOTH);
  const nullsBefore = r.calls.filter(
    (c) => c[0] === "notice" && c[1] === null
  ).length;
  r.loadBattle(GOOD2, TEAM);
  const nullsAfter = r.calls.filter(
    (c) => c[0] === "notice" && c[1] === null
  ).length;
  check(
    "說明：兩次被拒都不清掉說明（只設成原因）；成功載入完整的一場才清一次",
    nullsBefore === 0 && nullsAfter === 1,
    { calls: r.calls }
  );
}

// ── 9. 暫停中的第 0 波收到後端同關缺資料：記下阻擋，恢復後迎戰／新開自動都擋 ──
// 暫停與恢復是受控前置（Bridge 實際的 togglePause），放塔用真引擎的 placeTower
/** 這一場的實際狀態：場次、階段、波次、暫停、自動、金幣、城防、塔、武將、場上敵人 */
const field = (eng) => ({
  ...bmState(eng.bm),
  gold: eng.bm.battleGold,
  hp: eng.bm.baseHp,
  towers: eng.e.towers.length,
  heroes: eng.e.heroes.length,
  enemies: eng.wm.activeEnemies.length,
});
/** 按頁面實際的 handleStartBattle／handleToggleAuto 一次，回傳 Bridge 的 startBattle／toggleAuto 被呼叫幾次 */
const pressEntry = (r, entry) => {
  const key = entry === "迎戰" ? "startBattle" : "toggleAuto";
  let n = 0;
  const orig = r.eng.bridge[key];
  r.eng.bridge[key] = function () {
    n++;
    return orig.call(this);
  };
  if (entry === "迎戰") r.handleStartBattle()();
  else r.handleToggleAuto()();
  r.eng.bridge[key] = orig;
  return n;
};
for (const [label, bad, text] of [
  ["缺路線", NO_ROUTE, T_ROUTE],
  ["空波次", NO_WAVES, T_WAVES],
  ["兩者都缺", BOTH, T_BOTH],
]) {
  for (const entry of ["迎戰", "自動"]) {
    const r = env({ remote: [bad, GOOD2] });
    r.eng.e.placeTower(2, 1, "archer");
    r.eng.bridge.togglePause();
    const before = field(r.eng);
    r.then(r.eng.bridge)(res(bad, GOOD2));
    const after = field(r.eng);
    const blk = { battleId: "start_1", stageId: "chapter1_1", reason: text };
    r.eng.bridge.togglePause();
    const resumed = field(r.eng);
    const n = pressEntry(r, entry);
    const pressed = field(r.eng);
    check(
      `暫停中第 0 波（${label}）：then 不重新載入、不清場、暫停與場上（塔 1、金幣、城防）都不變，記下同場阻擋、說明原因、打開選關；受控恢復後按${entry}不開波（仍是這一場第 0 波備戰、敵人 0、自動沒開）`,
      before.paused === true &&
        before.towers === 1 &&
        same(after, before) &&
        same(names(r.calls), ["allStages", "block", "notice", "selector"]) &&
        same(r.calls[1][1], blk) &&
        r.calls[2][1] === text &&
        same(r.stageBlockRef.current, blk) &&
        r.loadBattleCalls.length === 0 &&
        r.store.disarms === 0 &&
        r.battleCtxRef.current === r.ctx0 &&
        r.currentStageRef.current === GOOD &&
        resumed.paused === false &&
        n === 0 &&
        pressed.battleId === "start_1" &&
        pressed.phase === GameState.PREP &&
        pressed.wave === 0 &&
        pressed.enemies === 0 &&
        pressed.auto === false &&
        pressed.towers === 1,
      { calls: r.calls, before, after, resumed, n, pressed }
    );
    // 正向：改選完整的另一關，阻擋與說明清掉，同一個入口照常開
    const ok = r.loadStageData(GOOD2);
    const n2 = pressEntry(r, entry);
    const fin = field(r.eng);
    check(
      `同上（${label}、${entry}）：改選完整的另一關 chapter1_2 → 載入成功、阻擋與說明清掉；按${entry}照常開（新的一場、戰鬥中第 1 波、敵人 1${entry === "自動" ? "、自動開著" : ""}）`,
      ok === true &&
        r.stageBlockRef.current === null &&
        r.calls.filter((c) => c[0] === "notice").at(-1)[1] === null &&
        n2 === 1 &&
        fin.battleId !== "start_1" &&
        fin.phase === GameState.BATTLE &&
        fin.wave === 1 &&
        fin.enemies === 1 &&
        fin.auto === (entry === "自動"),
      { ok, n2, fin }
    );
  }
}
{
  // 對照：暫停中第 0 波、後端同關完整 → 不破壞性重新載入
  const remoteGood = stage("chapter1_1", "黃巾起義", {
    waves: [WAVE(1), WAVE(2)],
  });
  const r = env({ remote: [remoteGood, GOOD2] });
  r.eng.e.placeTower(2, 1, "archer");
  r.eng.bridge.togglePause();
  const before = field(r.eng);
  r.then(r.eng.bridge)(res(remoteGood, GOOD2));
  check(
    "then（暫停中第 0 波、後端同關完整）：不重新載入、不放下固定（0 次）、不清場、暫停保持、不設阻擋或說明；只更新清單並照原本換畫面的這一關（ref 與引擎的這一場不換）",
    before.paused === true &&
      same(names(r.calls), ["allStages", "currentStage"]) &&
      r.calls[1][1] === remoteGood &&
      r.loadBattleCalls.length === 0 &&
      r.store.disarms === 0 &&
      same(field(r.eng), before) &&
      r.currentStageRef.current === GOOD &&
      r.battleCtxRef.current === r.ctx0 &&
      r.stageBlockRef.current === null,
    { calls: names(r.calls), before, now: field(r.eng) }
  );
}

// ── 10. then：隊伍來源不能用時，完整的資料也不換關卡；缺資料的阻擋照記 ──
/** 不能用的三種來源（每次新的 store，固定次數各自計） */
const badSources = () => [
  [
    "還沒選帳號（none）",
    storeOf({ mode: "none", player: null }),
    { heroes: [], owner: { mode: "none", key: null, epoch: null } },
  ],
  ["載入中", storeOf({ isLoading: true }), TEAM],
  ["過期的帳號世代", storeOf({ getAccountEpoch: () => 8 }), TEAM],
];
for (const [label, store, team] of badSources()) {
  const remoteGood = stage("chapter1_1", "黃巾起義", {
    waves: [WAVE(1), WAVE(2)],
  });
  const r = env({ remote: [remoteGood, GOOD2], store, team });
  r.eng.e.placeTower(2, 1, "archer");
  const before = field(r.eng);
  r.then(r.eng.bridge)(res(remoteGood, GOOD2));
  check(
    `then（第 0 波備戰、後端同關完整、隊伍來源${label}）：只更新清單；實際呼叫頁面的 loadBattle 一次、被來源守門拒絕（回 false）；currentStage setter 0 次、ref 不變，這一場／序號／引擎／場上／固定／阻擋／說明都不動`,
    same(names(r.calls), ["allStages"]) &&
      r.loadBattleCalls.length === 1 &&
      r.loadBattleCalls[0] === remoteGood &&
      same(r.loadBattleResults, [false]) &&
      r.currentStageRef.current === GOOD &&
      r.battleCtxRef.current === r.ctx0 &&
      r.battleSeqRef.current === 5 &&
      same(field(r.eng), before) &&
      r.store.disarms === 0 &&
      r.stageBlockRef.current === null,
    { calls: names(r.calls), results: r.loadBattleResults, now: field(r.eng) }
  );
}
for (const [label, store, team] of badSources()) {
  const r = env({ remote: [NO_ROUTE, GOOD2], store, team });
  const before = field(r.eng);
  r.then(r.eng.bridge)(res(NO_ROUTE, GOOD2));
  check(
    `then（第 0 波備戰、後端同關缺路線、隊伍來源${label}）：缺資料的阻擋與隊伍能不能載入分開判斷，照樣記下同場阻擋、說明、打開選關；不載入、不清場`,
    same(names(r.calls), ["allStages", "block", "notice", "selector"]) &&
      same(r.stageBlockRef.current, {
        battleId: "start_1",
        stageId: "chapter1_1",
        reason: T_ROUTE,
      }) &&
      r.loadBattleCalls.length === 0 &&
      same(field(r.eng), before) &&
      r.store.disarms === 0,
    { calls: names(r.calls) }
  );
}
{
  // 正向：有效來源時載入成功後 state 與 ref 一起換成後端的這一關
  const remoteGood = stage("chapter1_1", "黃巾起義", {
    waves: [WAVE(1), WAVE(2)],
  });
  const r = env({ remote: [remoteGood, GOOD2] });
  r.then(r.eng.bridge)(res(remoteGood, GOOD2));
  const cs = r.calls.filter((c) => c[0] === "currentStage");
  check(
    "then（第 0 波備戰、後端同關完整、有效來源）：loadBattle 回 true 之後 currentStage（1 次）的值與 ref 都是後端的這一關；新的一場（引擎的 battleId＝頁面記的這一場、關卡 chapter1_1）、固定 1 次",
    same(r.loadBattleResults, [true]) &&
      cs.length === 1 &&
      cs[0][1] === remoteGood &&
      r.currentStageRef.current === remoteGood &&
      r.battleCtxRef.current !== r.ctx0 &&
      r.battleCtxRef.current.stageId === "chapter1_1" &&
      r.battleCtxRef.current.battleId === r.eng.bm.battleId &&
      r.eng.bm.battleId !== "start_1" &&
      r.store.disarms === 1,
    { calls: names(r.calls), results: r.loadBattleResults }
  );
}

// ── 11. loadStageData：先核 bridge 與隊伍來源，再核關卡資料 ──
for (const [label, store, team] of badSources()) {
  const r = env({ store, team });
  r.eng.e.placeTower(2, 1, "archer");
  const before = field(r.eng);
  const oks = [NO_ROUTE, NO_WAVES, BOTH, GOOD2].map((st) =>
    r.loadStageData(st)
  );
  check(
    `loadStageData（隊伍來源${label}）：缺路線／空波次／兩者都缺／完整的另一關都回 false；0 次畫面變更（連缺資料說明與選關都沒有）、0 次 loadBattle、固定 0；這一場、引擎、場上、目前關卡、面板都不動`,
    same(oks, [false, false, false, false]) &&
      r.calls.length === 0 &&
      r.loadBattleCalls.length === 0 &&
      r.store.disarms === 0 &&
      r.battleCtxRef.current === r.ctx0 &&
      same(field(r.eng), before) &&
      r.currentStageRef.current === GOOD &&
      r.panelUnitRef.current === "OLD_PANEL",
    { oks, calls: r.calls }
  );
}
{
  // 沒有 bridge：同樣在資料檢查之前就不動
  const r = env();
  r.bridgeRef.current = null;
  const ok = r.loadStageData(BOTH);
  check(
    "loadStageData（沒有 bridge、缺資料）：回 false、0 次畫面變更、0 次 loadBattle",
    ok === false && r.calls.length === 0 && r.loadBattleCalls.length === 0,
    { calls: r.calls }
  );
}
{
  // 選關不給首次內建展示的例外：還沒有任何一場、沒選帳號
  const r = env({
    noCtx: true,
    store: storeOf({ mode: "none", player: null }),
    team: { heroes: [], owner: { mode: "none", key: null, epoch: null } },
  });
  const ok = r.loadStageData(BD.BUILTIN_STAGES[0]);
  check(
    "loadStageData（還沒有任何一場、兩邊都沒選帳號、內建關卡）：回 false、0 次畫面變更、0 次 loadBattle（首次內建展示的例外只在初始載入）",
    ok === false &&
      r.calls.length === 0 &&
      r.loadBattleCalls.length === 0 &&
      r.battleCtxRef.current === null,
    { calls: r.calls }
  );
}

// ── 12. 來源恢復後的重新載入：latestStageOf 與「出征隊伍改變時」的 effect（頁面實際的原文） ──
// 另外用 AST 取出模組層的 latestStageOf、sameOwner，以及 useEffect 第一個參數含「if (!sameOwner(activeTeam.owner, ctx.owner))」的 effect 本體
// （第 1 段的取出清單不動）。受控：ref、setter、假 store（「來源恢復」是就地改同一個 store 物件）、假 manager、stats 由真 BattleManager 當下的值組成。
// 真頁面的 !ctx 情況下，ref 另由同步 currentStage 的 effect 跟上；這裡不跑那個 effect，單獨驗這個 effect 自己選哪一份資料
const found12 = { latestStageOf: [], sameOwner: [], effect: [] };
(function walk(n) {
  if (
    ts.isVariableDeclaration(n) &&
    ts.isIdentifier(n.name) &&
    (n.name.text === "latestStageOf" || n.name.text === "sameOwner") &&
    n.initializer
  )
    found12[n.name.text].push(n.initializer);
  if (
    ts.isCallExpression(n) &&
    ts.isIdentifier(n.expression) &&
    n.expression.text === "useEffect" &&
    n.arguments[0] &&
    n.arguments[0]
      .getText(sf)
      .includes("if (!sameOwner(activeTeam.owner, ctx.owner))")
  )
    found12.effect.push(n.arguments[0]);
  ts.forEachChild(n, walk);
})(sf);
check(
  "取出頁面的程式（第 12 段）：latestStageOf、sameOwner、出征隊伍改變時的 effect 各剛好一個",
  Object.values(found12).every((v) => v.length === 1),
  {
    counts: Object.fromEntries(
      Object.entries(found12).map(([k, v]) => [k, v.length])
    ),
  }
);
const build12 = (name, deps) => {
  const keys = Object.keys(deps);
  return new Function(...keys, `${js(found12[name][0])}\nreturn __f;`)(
    ...keys.map((k) => deps[k])
  );
};
const sameOwner12 = build12("sameOwner", {});
const latestOf12 = (remote) =>
  build12("latestStageOf", {
    StageDataManager: mgrOf(remote),
    BUILTIN_STAGES: BD.BUILTIN_STAGES,
    // 頁面模組層已匯入的函式（送審版 helper 沒用到；讓改壞 helper 的反例能執行到具名斷言）
    getStageDataProblem: SP.getStageDataProblem,
  });
const BUILTIN_C1 = BD.BUILTIN_STAGES.find((s) => s.map_id === "chapter1_1");
const R12 = stage("chapter1_1", "黃巾起義", { waves: [WAVE(1), WAVE(2)] });
{
  const snap = (x) => JSON.stringify(x);
  const remoteA = [GOOD2, R12];
  const remoteBad = [GOOD2, NO_ROUTE];
  const remoteNone = [GOOD2];
  const before = [
    snap(BUILTIN_C1),
    snap(remoteA),
    snap(remoteBad),
    snap(remoteNone),
  ];
  const a = latestOf12(BD.BUILTIN_STAGES)(BUILTIN_C1);
  const b = latestOf12(remoteA)(BUILTIN_C1);
  const c = latestOf12(remoteBad)(BUILTIN_C1);
  const d = latestOf12(remoteNone)(BUILTIN_C1);
  const e = latestOf12(remoteA)(GOOD2);
  check(
    "latestStageOf：manager 仍內建 → 傳入的同一個物件；已讀到同 ID → manager 那一份（另一關排第一也找對）；同 ID 缺資料也回那一份（不換內建代用）；沒有同 ID → 傳入的；不改輸入與清單",
    a === BUILTIN_C1 &&
      b === R12 &&
      c === NO_ROUTE &&
      d === BUILTIN_C1 &&
      e === GOOD2 &&
      same(before, [
        snap(BUILTIN_C1),
        snap(remoteA),
        snap(remoteBad),
        snap(remoteNone),
      ]),
    { a: a?.name, b: b === R12, c: c === NO_ROUTE, d: d === BUILTIN_C1 }
  );
}
/** 執行頁面實際的 effect 一次（team＝這次 render 的 activeTeam；stats 預設是真 BattleManager 當下的值） */
const runEffect12 = (r, team, statsOverride) => {
  const bm = r.eng.bm;
  build12("effect", {
    bridgeRef: r.bridgeRef,
    battleCtxRef: r.battleCtxRef,
    loadBattle: r.lb,
    activeTeam: team,
    stats: statsOverride ?? {
      battle_id: bm.battleId,
      game_state: bm.gameState,
      wave: bm.currentWave,
    },
    sameOwner: sameOwner12,
    teamSourceUsable,
    useJsPlayerStore: { getState: () => r.store },
    GameState,
    currentStageRef: r.currentStageRef,
    latestStageOf: build12("latestStageOf", {
      StageDataManager: r.mgr,
      BUILTIN_STAGES: BD.BUILTIN_STAGES,
      getStageDataProblem: SP.getStageDataProblem,
    }),
    setCurrentStage: r.S("currentStage"),
  })();
};
/** 之後有效的來源：共用帳號 k_sh（和這一場記下的訪客不同） */
const SH12 = { mode: "shared", key: "k_sh", epoch: 9 };
const TEAM_SH12 = { heroes: [], owner: SH12 };
const VALID_SH12 = {
  isLoading: false,
  mode: "shared",
  player: { key: "k_sh" },
  getAccountEpoch: () => 9,
};
/** 設定到時不能用的三種來源（每次新的 store；隊伍是這次 render 的 activeTeam） */
const early12 = () => [
  ["載入中", storeOf({ isLoading: true }), TEAM],
  ["世代不符", storeOf({ getAccountEpoch: () => 8 }), TEAM],
  [
    "還沒選帳號",
    storeOf({ mode: "none", player: null }),
    { heroes: [], owner: { mode: "none", key: null, epoch: null } },
  ],
];
const EFFECT_OK_SEQ = [
  "placed",
  "placementMenu",
  "owner",
  "block",
  "notice",
  "currentStage",
];
for (const [label, store, team] of early12()) {
  const r = env({ remote: [R12, GOOD2], current: BUILTIN_C1, store, team });
  r.then(r.eng.bridge)(res(R12, GOOD2));
  const thenCalls = names(r.calls);
  const thenRef = r.currentStageRef.current;
  const thenResults = r.loadBattleResults.slice();
  Object.assign(r.store, VALID_SH12);
  r.activeTeamRef.current = TEAM_SH12;
  r.calls.length = 0;
  runEffect12(r, TEAM_SH12);
  const ctx = r.battleCtxRef.current;
  check(
    `effect（來源不同、第 0 波；設定到時來源${label}）：then 只更新清單、中央載入回 false、ref 仍是內建那一份；之後來源有效 → 載入 manager 的同 ID 那一份一次、configReady true、新的一場、成功後才換 currentStage 與 ref`,
    same(thenCalls, ["allStages"]) &&
      same(thenResults, [false]) &&
      thenRef === BUILTIN_C1 &&
      r.loadBattleCalls.length === 2 &&
      r.loadBattleCalls[1] === R12 &&
      same(r.loadBattleResults, [false, true]) &&
      ctx !== r.ctx0 &&
      ctx.configReady === true &&
      ctx.stageId === "chapter1_1" &&
      same(ctx.owner, SH12) &&
      ctx.battleId === r.eng.bm.battleId &&
      r.eng.bm.battleId !== "start_1" &&
      same(names(r.calls), EFFECT_OK_SEQ) &&
      r.calls.at(-1)[1] === R12 &&
      r.currentStageRef.current === R12 &&
      r.store.disarms === 1,
    { thenCalls, thenResults, calls: names(r.calls), ctx }
  );
}
for (const [label, store, team] of early12()) {
  const r = env({
    noCtx: true,
    remote: [R12, GOOD2],
    current: BUILTIN_C1,
    store,
    team,
  });
  r.then(r.eng.bridge)(res(R12, GOOD2));
  const thenCalls = names(r.calls);
  const thenRef = r.currentStageRef.current;
  const thenLoads = r.loadBattleCalls.length;
  Object.assign(r.store, VALID_SH12);
  r.activeTeamRef.current = TEAM_SH12;
  r.calls.length = 0;
  runEffect12(r, TEAM_SH12);
  const ctx = r.battleCtxRef.current;
  check(
    `effect（還沒有任何一場；設定到時來源${label}）：then 不載入、只更新清單與原本的 currentStage（ref 不換）；之後來源有效 → 載入 manager 的同 ID 那一份、configReady true、成功後才換 currentStage 與 ref`,
    same(thenCalls, ["allStages", "currentStage"]) &&
      thenLoads === 0 &&
      thenRef === BUILTIN_C1 &&
      same(r.loadBattleCalls, [R12]) &&
      same(r.loadBattleResults, [true]) &&
      ctx !== null &&
      ctx.configReady === true &&
      same(ctx.owner, SH12) &&
      ctx.battleId === r.eng.bm.battleId &&
      same(names(r.calls), EFFECT_OK_SEQ) &&
      r.calls.at(-1)[1] === R12 &&
      r.currentStageRef.current === R12,
    { thenCalls, thenLoads, calls: names(r.calls), ctx }
  );
}
/** 之後仍不能用的三種來源（和這一場記下的訪客不同的共用帳號） */
const still12 = () => [
  ["載入中", { ...VALID_SH12, isLoading: true }, TEAM_SH12],
  ["世代不符", { ...VALID_SH12, getAccountEpoch: () => 10 }, TEAM_SH12],
  [
    "還沒選帳號",
    { isLoading: false, mode: "none", player: null, getAccountEpoch: () => 0 },
    { heroes: [], owner: { mode: "none", key: null, epoch: null } },
  ],
];
for (const noCtx of [false, true]) {
  for (const [label, fields, team] of still12()) {
    const r = env({
      noCtx,
      remote: [R12, GOOD2],
      current: BUILTIN_C1,
      store: storeOf(fields),
      team,
    });
    r.eng.e.placeTower(2, 1, "archer");
    const before = field(r.eng);
    runEffect12(r, team);
    check(
      `effect（${noCtx ? "還沒有任何一場" : "來源不同、第 0 波"}；來源仍${label}）：中央載入一次回 false；0 次 setter（含說明、選關、選單）、ref 仍內建，ctx／序號／引擎／場上／固定都不動`,
      same(r.loadBattleCalls, [R12]) &&
        same(r.loadBattleResults, [false]) &&
        r.calls.length === 0 &&
        r.currentStageRef.current === BUILTIN_C1 &&
        r.battleCtxRef.current === (noCtx ? null : r.ctx0) &&
        r.battleSeqRef.current === 5 &&
        same(field(r.eng), before) &&
        r.store.disarms === 0,
      { calls: r.calls, results: r.loadBattleResults }
    );
  }
}
for (const noCtx of [false, true]) {
  const r = env({
    noCtx,
    remote: [NO_ROUTE, GOOD2],
    current: BUILTIN_C1,
    store: storeOf(VALID_SH12),
    team: TEAM_SH12,
  });
  const before = field(r.eng);
  runEffect12(r, TEAM_SH12);
  check(
    `effect（${noCtx ? "還沒有任何一場" : "來源不同、第 0 波"}；來源有效、manager 的同一關缺路線）：中央拒絕（回 false），只說明缺路線並打開選關；不換 currentStage／ref，ctx／引擎／固定不動`,
    same(r.loadBattleCalls, [NO_ROUTE]) &&
      same(r.loadBattleResults, [false]) &&
      same(r.calls, [
        ["notice", T_ROUTE],
        ["selector", true],
      ]) &&
      r.currentStageRef.current === BUILTIN_C1 &&
      r.battleCtxRef.current === (noCtx ? null : r.ctx0) &&
      same(field(r.eng), before) &&
      r.store.disarms === 0,
    { calls: r.calls }
  );
}
for (const [label, remote] of [
  ["manager 仍是內建", undefined],
  ["manager 已讀到但沒有同 ID", [GOOD2]],
]) {
  const r = env({
    remote,
    current: BUILTIN_C1,
    store: storeOf(VALID_SH12),
    team: TEAM_SH12,
  });
  runEffect12(r, TEAM_SH12);
  check(
    `effect（來源不同、第 0 波；${label}）：照原本載入 ref 的那一份（同一個物件）、configReady false；成功後 currentStage 的值仍是那一份`,
    same(r.loadBattleCalls, [BUILTIN_C1]) &&
      same(r.loadBattleResults, [true]) &&
      r.battleCtxRef.current.configReady === false &&
      r.calls.at(-1)[0] === "currentStage" &&
      r.calls.at(-1)[1] === BUILTIN_C1 &&
      r.currentStageRef.current === BUILTIN_C1,
    { calls: names(r.calls) }
  );
}
for (const [label, setup, pre, override] of [
  [
    "實際是第 1 波備戰",
    (e) => (e.bridge.startBattle(), e.bm.onWaveAllEnemiesDead()),
    (s) => s.phase === GameState.PREP && s.wave === 1,
  ],
  [
    "戰鬥中",
    (e) => e.bridge.startBattle(),
    (s) => s.phase === GameState.BATTLE && s.wave === 1,
  ],
  [
    "結算後",
    (e) => (e.bridge.startBattle(), e.bm.endBattle(false)),
    (s) => s.phase === GameState.RESULT,
  ],
  [
    "stats 是別場（第 0 波備戰）",
    () => {},
    (s) => s.phase === GameState.PREP && s.wave === 0,
    { battle_id: "other_1", game_state: GameState.PREP, wave: 0 },
  ],
]) {
  const r = env({
    remote: [R12, GOOD2],
    current: BUILTIN_C1,
    store: storeOf(VALID_SH12),
    team: TEAM_SH12,
  });
  setup(r.eng);
  const st = bmState(r.eng.bm);
  runEffect12(r, TEAM_SH12, override);
  check(
    `effect（來源不同；${label}）：前置成立；0 次 loadBattle、0 次 setter、ref 不換`,
    pre(st) &&
      r.loadBattleCalls.length === 0 &&
      r.calls.length === 0 &&
      r.currentStageRef.current === BUILTIN_C1,
    { st, loads: r.loadBattleCalls.length, calls: names(r.calls) }
  );
}
{
  const r = env({ remote: [R12, GOOD2], current: BUILTIN_C1 });
  r.battleCtxRef.current.syncedTeam = '["old"]';
  let syncs = 0;
  const orig = r.eng.bridge.syncTeam;
  r.eng.bridge.syncTeam = function (...a) {
    syncs++;
    return orig.apply(this, a);
  };
  runEffect12(r, TEAM);
  r.eng.bridge.syncTeam = orig;
  check(
    "effect（同一個來源改隊伍）：只呼叫一次 Bridge 的 syncTeam；0 次 loadBattle、0 次 setter、ref 不換",
    syncs === 1 &&
      r.loadBattleCalls.length === 0 &&
      r.calls.length === 0 &&
      r.currentStageRef.current === BUILTIN_C1,
    { syncs, calls: names(r.calls) }
  );
}

const passed = results.filter((r) => r.pass).length;
console.log(
  `RESULT_JSON ${JSON.stringify({ passed, total: results.length, failed: results.length - passed })}`
);
process.exit(passed === results.length ? 0 : 1);
