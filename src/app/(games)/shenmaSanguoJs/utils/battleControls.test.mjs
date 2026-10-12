// 神馬三國 JS 版的暫停操作守門與部署選單慢速（純 Node、不連網）
// - 用真正的 engine/BattleManager.ts、engine/BattleEngine.ts（placeHero／placeTower／upgradeTower／handleCellClick 與遊戲迴圈）與 engine/LocalGameBridge.ts，
//   期待值照 Godot 版 BattleManager（open_deploy_menu／close_deploy_menu／effective_time_scale、DEPLOY_TIME_SCALE＝0.1、不乘玩家選的速度）手寫
// - 假的依賴只有畫面：BattleEngine 傳入一個什麼都不畫的 renderer；遊戲迴圈結尾要的 requestAnimationFrame 換成不排程的空函式，
//   由測試直接用固定的時間戳呼叫真正的 gameLoop（不替換倍率、暫停或戰鬥時間的計算）；音效在 Node 沒有 AudioContext，照原本的程式靜默略過
// - 階段用既有的 setState／setPaused／endBattle 受控設定，不是自然戰鬥
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/battleControls.test.mjs"
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
// 遊戲迴圈結尾會排下一幀：測試自己用固定時間戳呼叫，不需要真的排程
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const { BattleEngine } = require(join(HERE, "../engine/BattleEngine.ts"));
const { BattleManager, GameState } = require(
  join(HERE, "../engine/BattleManager.ts")
);
const { LocalGameBridge } = require(join(HERE, "../engine/LocalGameBridge.ts"));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  let shown = "";
  if (!pass) {
    try {
      shown = String(
        JSON.stringify(detail === undefined ? null : detail)
      ).slice(0, 900);
    } catch (e) {
      shown = `（detail 無法序列化：${e}）`;
    }
  }
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + shown}`);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ═══ 合成關：一條路（第 3 列）、四個建築位 ═══
const RENDERER = { init() {}, resize() {}, render() {}, destroy() {} };
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
  build_zones: [
    [2, 1],
    [4, 1],
    [6, 1],
    [8, 1],
  ],
};
const PAYLOAD = (battleId) => ({
  stageId: "chapter1_1",
  battleId,
  totalWaves: 1,
  pathJson: JSON.stringify(PATH),
  waves: [],
  heroesConfig: [],
  enemiesConfig: [],
});
const MA = { hero_id: "ma_chao", level: 1, atk: 120, def: 40, hp: 900 };
const ZY = { hero_id: "zhao_yun", level: 1, atk: 90, def: 60, hp: 1100 };
function mkEngine(battleId) {
  const e = new BattleEngine(RENDERER);
  e.loadStage(PAYLOAD(battleId));
  return e;
}
/** 狀態快照：金幣、場上武將、塔（識別碼、等級、投入）、觀察格占用、選取、首擊紀錄、飄字數 */
const snap = (e) => ({
  gold: e.battleManager.battleGold,
  heroes: e.heroes.map((h) => [h.heroId, h.gridCell.col, h.gridCell.row]),
  towers: e.towers.map((t) => [t.towerUid, t.towerLevel, t.investedGold]),
  occ: [
    [3, 3],
    [5, 3],
    [2, 1],
    [4, 1],
  ].map(([c, r]) => e.gameMap.isOccupied(c, r)),
  selected: e.selectedUnit ? { ...e.selectedUnit } : null,
  firstStrike: [...e.battleManager.firstStrikeUsed],
  floating: e.floatingTexts.getSnapshot().length,
});

// ═══ C1：派武將、建塔、升級的入口守門（PREP／BATTLE／RESULT × 暫停與否；每個組合各用新的引擎與相同前置） ═══
/** 前置：備戰中建弓兵塔 A（2,1）（5000 → 4950），派馬超到 (3,3)；再切到指定階段與暫停狀態 */
function setup(state, paused) {
  const e = mkEngine("b1");
  e.placeTower(2, 1, "archer");
  e.placeHero(3, 3, MA);
  const bm = e.battleManager;
  if (state !== GameState.PREP) bm.setState(state);
  if (paused) bm.manualPaused = true;
  return e;
}
const STATES = [
  ["備戰", GameState.PREP],
  ["戰鬥", GameState.BATTLE],
  ["結算", GameState.RESULT],
];
{
  const e = setup(GameState.PREP, false);
  check(
    "前置：弓兵塔 A 在 (2,1)（扣 50、投入 50）、馬超在 (3,3)，戰場金幣 4950",
    e.battleManager.battleGold === 4950 &&
      e.towers.length === 1 &&
      e.towers[0].investedGold === 50 &&
      e.heroes.length === 1,
    snap(e)
  );
}
for (const [label, state] of STATES) {
  for (const paused of [false, true]) {
    const allowed = !paused && state !== GameState.RESULT;
    const tag = `${label}${paused ? "＋暫停" : ""}`;
    {
      const e = setup(state, paused);
      const before = snap(e);
      const r = e.placeHero(5, 3, ZY);
      const after = snap(e);
      check(
        allowed
          ? `${tag}：派趙雲到 (5,3) 成功（免費，金幣 4950 不變）`
          : `${tag}：派趙雲被拒，金幣、武將、塔、格子、選取、首擊、飄字都不變`,
        allowed
          ? r === true &&
              after.heroes.length === 2 &&
              after.occ[1] === true &&
              after.gold === 4950
          : r === false && same(after, before),
        { r, before, after }
      );
    }
    {
      const e = setup(state, paused);
      const before = snap(e);
      const r = e.placeTower(4, 1, "archer");
      const after = snap(e);
      check(
        allowed
          ? `${tag}：建弓兵塔到 (4,1) 成功（4950 → 4900、投入 50）`
          : `${tag}：建塔被拒，金幣、塔、格子、選取、飄字都不變`,
        allowed
          ? r === true &&
              after.gold === 4900 &&
              after.towers.length === 2 &&
              after.towers[1][2] === 50 &&
              after.occ[3] === true
          : r === false && same(after, before),
        { r, before, after }
      );
    }
    {
      const e = setup(state, paused);
      const before = snap(e);
      const r = e.upgradeTower(2, 1);
      const after = snap(e);
      check(
        allowed
          ? `${tag}：升級弓兵塔 A 成功（4950 → 4900、Lv.2、投入 100）`
          : `${tag}：升級被拒，金幣、等級、投入、飄字都不變`,
        allowed
          ? r === true &&
              after.gold === 4900 &&
              same(after.towers[0].slice(1), [2, 100])
          : r === false && same(after, before),
        { r, before, after }
      );
    }
  }
}
{
  // 金幣不足時被拒（不在暫停）：照原本的規則顯示「金幣不足」飄字；暫停時連這個效果都不出現（上面已核飄字數不變）
  const e = setup(GameState.PREP, false);
  const b = e.battleManager;
  b.spendGold(b.battleGold - 10);
  const f0 = e.floatingTexts.getSnapshot().length;
  const r = e.placeTower(4, 1, "archer");
  check(
    "沒有暫停、金幣只剩 10：建塔被拒並照原本顯示一則「金幣不足」飄字",
    r === false && e.floatingTexts.getSnapshot().length === f0 + 1,
    { r, f0, f1: e.floatingTexts.getSnapshot().length }
  );
}
{
  // 暫停中被拒後解除暫停：由新的呼叫才成功，不自動補送
  const e = setup(GameState.PREP, false);
  const bm = e.battleManager;
  check(
    "備戰中用 setPaused 暫停成功",
    bm.setPaused("b1", true) === "" && bm.manualPaused === true,
    { paused: bm.manualPaused }
  );
  const r1 = e.placeHero(5, 3, ZY);
  const r2 = e.placeTower(4, 1, "archer");
  const r3 = e.upgradeTower(2, 1);
  const mid = snap(e);
  bm.setPaused("b1", false);
  const afterResume = snap(e);
  check(
    "暫停中三個操作都被拒；解除暫停本身不補送任何操作（狀態和暫停時一樣）",
    r1 === false &&
      r2 === false &&
      r3 === false &&
      same(afterResume, mid) &&
      mid.heroes.length === 1 &&
      mid.towers.length === 1,
    { r1, r2, r3, mid, afterResume }
  );
  const ok1 = e.placeHero(5, 3, ZY);
  const ok2 = e.placeTower(4, 1, "archer");
  const ok3 = e.upgradeTower(2, 1);
  check(
    "解除暫停後新的呼叫才成功：派趙雲、建塔（4950 → 4900）、升級 A（4900 → 4850）",
    ok1 === true &&
      ok2 === true &&
      ok3 === true &&
      e.battleManager.battleGold === 4850 &&
      e.heroes.length === 2 &&
      e.towers.length === 2,
    { ok1, ok2, ok3, after: snap(e) }
  );
}

// ═══ C2：部署選單編號與倍率（BattleManager；字面值） ═══
function mkBm(battleId) {
  const bm = new BattleManager();
  bm.initialize(1, "chapter1_1", battleId);
  return bm;
}
{
  const bm = mkBm("b1");
  check(
    "新的一場：速度 1、倍率 1、沒有開著的選單、沒有暫停",
    bm.speedPref === 1 &&
      bm.effectiveTimeScale() === 1 &&
      bm.deployMenuId === 0 &&
      bm.manualPaused === false,
    {
      speed: bm.speedPref,
      scale: bm.effectiveTimeScale(),
      menu: bm.deployMenuId,
    }
  );
  const m1 = bm.openDeployMenu();
  check(
    "備戰中打開選單：編號 1，倍率 0.1",
    m1 === 1 && bm.deployMenuId === 1 && bm.effectiveTimeScale() === 0.1,
    { m1, scale: bm.effectiveTimeScale() }
  );
  const sp = bm.setSpeed("b1", 2);
  check(
    "選單開著時選 2 倍：記下速度 2，倍率仍是 0.1（不乘速度）",
    sp === "" && bm.speedPref === 2 && bm.effectiveTimeScale() === 0.1,
    { sp, speed: bm.speedPref, scale: bm.effectiveTimeScale() }
  );
  const c1 = bm.closeDeployMenu("b1", 1);
  check(
    "帶這一場與編號 1 關閉：成功，倍率回到 2，速度仍是 2",
    c1 === true &&
      bm.deployMenuId === 0 &&
      bm.effectiveTimeScale() === 2 &&
      bm.speedPref === 2,
    { c1, scale: bm.effectiveTimeScale(), speed: bm.speedPref }
  );
  const c1b = bm.closeDeployMenu("b1", 1);
  check(
    "同一個關閉再送一次：無效，倍率仍是 2",
    c1b === false && bm.effectiveTimeScale() === 2,
    { c1b, scale: bm.effectiveTimeScale() }
  );
}
{
  const bm = mkBm("b1");
  bm.setState(GameState.BATTLE);
  const a = bm.openDeployMenu();
  const b = bm.openDeployMenu();
  const closeA = bm.closeDeployMenu("b1", a);
  check(
    "戰鬥中先開 A（1）再開 B（2）：關 A 無效，B 仍開著、倍率 0.1",
    a === 1 &&
      b === 2 &&
      closeA === false &&
      bm.deployMenuId === 2 &&
      bm.effectiveTimeScale() === 0.1,
    { a, b, closeA, menu: bm.deployMenuId, scale: bm.effectiveTimeScale() }
  );
  const before = [bm.deployMenuId, bm.effectiveTimeScale(), bm.speedPref];
  const bad = [
    ["別的場次", "b0", b],
    ["空的場次", "", b],
    ["場次是數字", 1, b],
    ["編號是字串", "b1", "2"],
    ["編號是小數", "b1", 2.5],
    ["編號是 0", "b1", 0],
    ["編號是負數", "b1", -2],
    ["編號是 NaN", "b1", NaN],
    ["編號缺值", "b1", undefined],
    ["編號是 null", "b1", null],
    ["較早的編號", "b1", 1],
  ].map(([label, bid, id]) => ({
    label,
    open: bm.isDeployMenuOpen(bid, id),
    close: bm.closeDeployMenu(bid, id),
  }));
  check(
    "B 開著時，別場、空值、型別不對、0／負數／NaN、缺值、較早的編號：查詢都是 false、關閉都無效，B 與倍率不變",
    bad.every((x) => x.open === false && x.close === false) &&
      same([bm.deployMenuId, bm.effectiveTimeScale(), bm.speedPref], before),
    { bad, before, after: [bm.deployMenuId, bm.effectiveTimeScale()] }
  );
  check("查詢 B：開著", bm.isDeployMenuOpen("b1", b) === true, bm.deployMenuId);
  const closeB = bm.closeDeployMenu("b1", b);
  check(
    "有效關閉 B 一次：倍率回到 1",
    closeB === true && bm.deployMenuId === 0 && bm.effectiveTimeScale() === 1,
    { closeB, scale: bm.effectiveTimeScale() }
  );
}
for (const [label, prep] of [
  [
    "暫停中",
    (bm) => {
      bm.setPaused("b1", true);
    },
  ],
  [
    "結算中",
    (bm) => {
      bm.setState(GameState.RESULT);
    },
  ],
  [
    "還沒載入（WAITING_PAYLOAD）",
    (bm) => {
      bm.setState(GameState.WAITING_PAYLOAD);
    },
  ],
]) {
  const bm = mkBm("b1");
  bm.setSpeed("b1", 2);
  prep(bm);
  const before = [bm.deployMenuId, bm.effectiveTimeScale(), bm.speedPref];
  const id = bm.openDeployMenu();
  check(
    `${label}打開選單：回傳 0，編號、倍率、速度都不變`,
    id === 0 &&
      same([bm.deployMenuId, bm.effectiveTimeScale(), bm.speedPref], before),
    { id, before, after: [bm.deployMenuId, bm.effectiveTimeScale()] }
  );
}
{
  // 選單開著時暫停、取消：取消只關這個選單，不解除暫停；暫停時回報的倍率仍是 0.1（暫停由 manualPaused 讓有效時間變 0）
  const bm = mkBm("b1");
  bm.setState(GameState.BATTLE);
  const m = bm.openDeployMenu();
  bm.setPaused("b1", true);
  const mid = [bm.manualPaused, bm.effectiveTimeScale(), bm.deployMenuId];
  const c = bm.closeDeployMenu("b1", m);
  check(
    "選單開著時暫停（倍率仍回報 0.1）；取消選單成功，但仍在暫停中，倍率回到 1",
    same(mid, [true, 0.1, m]) &&
      c === true &&
      bm.manualPaused === true &&
      bm.effectiveTimeScale() === 1 &&
      bm.deployMenuId === 0,
    { mid, c, paused: bm.manualPaused, scale: bm.effectiveTimeScale() }
  );
  const sp = bm.setSpeed("b1", 2);
  check(
    "暫停中選 2 倍：記下速度 2（仍在暫停）",
    sp === "" && bm.speedPref === 2 && bm.manualPaused === true,
    { sp, speed: bm.speedPref, paused: bm.manualPaused }
  );
}
{
  // 換一場與結算：既有的重設（速度 1、選單 0、解除暫停）；舊場次的關閉不碰新場的選單
  const bm = mkBm("b1");
  bm.setSpeed("b1", 2);
  const old = bm.openDeployMenu();
  bm.initialize(1, "chapter1_1", "b2");
  check(
    "換成新的一場 b2：速度 1、選單 0、倍率 1、沒有暫停",
    bm.speedPref === 1 &&
      bm.deployMenuId === 0 &&
      bm.effectiveTimeScale() === 1 &&
      bm.manualPaused === false,
    [bm.speedPref, bm.deployMenuId, bm.effectiveTimeScale(), bm.manualPaused]
  );
  const now = bm.openDeployMenu();
  const cOld = bm.closeDeployMenu("b1", old);
  const cOldIdNewBid = bm.closeDeployMenu("b2", old);
  check(
    "新場開了選單後，上一場的關閉（b1）與舊編號配新場次都無效，新選單仍開著、倍率 0.1",
    now > old &&
      cOld === false &&
      cOldIdNewBid === false &&
      bm.deployMenuId === now &&
      bm.effectiveTimeScale() === 0.1,
    { old, now, cOld, cOldIdNewBid, menu: bm.deployMenuId }
  );
  bm.setState(GameState.BATTLE);
  bm.setPaused("b2", true);
  bm.endBattle(false);
  check(
    "結算（endBattle）：既有的重設——選單 0、速度 1、解除暫停、倍率 1",
    bm.gameState === GameState.RESULT &&
      bm.deployMenuId === 0 &&
      bm.speedPref === 1 &&
      bm.manualPaused === false &&
      bm.effectiveTimeScale() === 1,
    [bm.gameState, bm.deployMenuId, bm.speedPref, bm.manualPaused]
  );
}

// ═══ C3：真正的遊戲迴圈套用倍率（固定時間戳，每幀 0.05 秒；戰鬥時間只在戰鬥中、沒有暫停時增加） ═══
/** 用固定的時間戳跑 n 幀（每幀 50 毫秒），回傳戰鬥時間增加多少 */
function runFrames(e, n) {
  const t0 = e.battleManager.battleTime;
  for (let i = 0; i < n; i++) {
    e.gameLoop(e.lastTimestamp + 50);
  }
  return Math.round((e.battleManager.battleTime - t0) * 1e6) / 1e6;
}
{
  const e = mkEngine("b1");
  const bm = e.battleManager;
  e.lastTimestamp = 1000;
  bm.setState(GameState.BATTLE);
  const d1 = runFrames(e, 10);
  bm.setSpeed("b1", 2);
  const d2 = runFrames(e, 10);
  const m = bm.openDeployMenu();
  const dMenu = runFrames(e, 10);
  bm.setPaused("b1", true);
  const dPause = runFrames(e, 10);
  bm.closeDeployMenu("b1", m);
  const dPauseClosed = runFrames(e, 10);
  bm.setPaused("b1", false);
  const dAfter = runFrames(e, 10);
  check(
    "遊戲迴圈 10 幀（每幀 0.05 秒）：1 倍 +0.5、2 倍 +1.0、選單開著（速度 2）+0.05、暫停 +0、暫停中關選單仍 +0、解除暫停回到 2 倍 +1.0",
    d1 === 0.5 &&
      d2 === 1 &&
      dMenu === 0.05 &&
      dPause === 0 &&
      dPauseClosed === 0 &&
      dAfter === 1,
    { d1, d2, dMenu, dPause, dPauseClosed, dAfter }
  );
}

// ═══ C4：橋接（真正的 LocalGameBridge；頁面用的入口） ═══
function mkBridge(battleId) {
  const br = new LocalGameBridge();
  br.loadStage(PAYLOAD(battleId));
  const menus = [];
  br.onPlacementMenuOpen = (m) => menus.push(m ? { ...m } : null);
  return { br, e: br.engine, menus };
}
const clickCell = (e, col, row) => {
  const w = e.gameMap.gridToWorld(col, row);
  e.handleCellClick(w.x, w.y);
};
{
  const { br, e, menus } = mkBridge("b1");
  clickCell(e, 3, 3);
  const m = menus[0];
  check(
    "點空的道路格：選單打開並帶這一場 b1 與編號 1，倍率 0.1",
    menus.length === 1 &&
      !!m &&
      m.battleId === "b1" &&
      m.menuId === 1 &&
      m.col === 3 &&
      m.row === 3 &&
      m.isRoad === true &&
      e.battleManager.effectiveTimeScale() === 0.1,
    { menus, scale: e.battleManager.effectiveTimeScale() }
  );
  const bad = [
    null,
    undefined,
    {},
    { battleId: "b1" },
    { battleId: "b1", menuId: "1" },
    { battleId: "b0", menuId: 1 },
    { battleId: 1, menuId: 1 },
    { battleId: "b1", menuId: 1.5 },
  ].map((x) => [br.isDeployMenuOpen(x), br.closeDeployMenu(x)]);
  check(
    "橋接：空值、缺欄位、型別不對、別場的關閉都無效，選單仍開著",
    bad.every(([o, c]) => o === false && c === false) &&
      br.isDeployMenuOpen({ battleId: "b1", menuId: 1 }) === true &&
      e.battleManager.deployMenuId === 1,
    { bad, menu: e.battleManager.deployMenuId }
  );
  const ok = br.closeDeployMenu({ battleId: "b1", menuId: 1 });
  const again = br.closeDeployMenu({ battleId: "b1", menuId: 1 });
  check(
    "橋接：帶打開時的這一組關閉成功、倍率回到 1；再送一次無效",
    ok === true &&
      again === false &&
      e.battleManager.effectiveTimeScale() === 1,
    { ok, again, scale: e.battleManager.effectiveTimeScale() }
  );
}
{
  const { br, e, menus } = mkBridge("b1");
  br.setPaused(true);
  clickCell(e, 3, 3);
  check(
    "暫停中點空格：不打開選單、選單編號 0、倍率不變",
    menus.length === 0 &&
      e.battleManager.deployMenuId === 0 &&
      e.battleManager.effectiveTimeScale() === 1,
    { menus, menu: e.battleManager.deployMenuId }
  );
  const r1 = br.placeHero(3, 3, MA);
  const r2 = br.placeTower(2, 1, "archer");
  check(
    "暫停中：頁面用的派武將、建塔入口也被拒，金幣 5000、場上沒有單位",
    r1 === false &&
      r2 === false &&
      e.battleManager.battleGold === 5000 &&
      e.heroes.length === 0 &&
      e.towers.length === 0,
    { r1, r2, gold: e.battleManager.battleGold }
  );
  br.setPaused(false);
  clickCell(e, 3, 3);
  const m = menus[0];
  const placed = br.placeHero(3, 3, MA);
  check(
    "解除暫停後新的點擊才打開選單；派馬超成功後通知關閉選單（null）",
    !!m &&
      m.battleId === "b1" &&
      placed === true &&
      menus[menus.length - 1] === null,
    { menus, placed }
  );
}
{
  // 結算後：不開選單，入口也拒
  const { br, e, menus } = mkBridge("b1");
  e.battleManager.setState(GameState.BATTLE);
  e.battleManager.endBattle(true);
  clickCell(e, 3, 3);
  const r = br.placeHero(3, 3, MA);
  check(
    "結算後點空格不打開選單，派武將也被拒",
    menus.length === 0 && r === false && e.heroes.length === 0,
    { menus, r }
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
