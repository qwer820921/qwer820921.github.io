// 神馬三國 JS 版防禦塔的投入、拆除返還與拆除守門（純 Node、不連網）
// - 用真正的 engine/entities/TowerEntity.ts 與 engine/BattleEngine.ts 的入口（placeTower／upgradeTower／sellTower／handleCellClick），
//   期待值照 Godot 版 Tower.gd 的建造費、升級費（升級基數 × 目前等級）與 floor(投入 × 0.5) 手寫，不由被測的 getSellRefund 產生
// - 假的依賴只有畫面：BattleEngine 傳入一個什麼都不畫的 renderer（不建立 CanvasRenderer、不啟動遊戲迴圈）；音效在 Node 沒有 AudioContext，照原本的程式靜默略過
// - 拆除請求要帶這一場、這座塔的識別碼與格子，以及看到的返還金額；任何一項不符、沒有選取這座塔、暫停或不在備戰都拒絕，狀態不變；成功只拆一次、返還一次
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/towerEconomy.test.mjs"
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

const { TowerEntity } = require(
  join(HERE, "../engine/entities/TowerEntity.ts")
);
const { BattleEngine } = require(join(HERE, "../engine/BattleEngine.ts"));
const { GameState } = require(join(HERE, "../engine/BattleManager.ts"));

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

// ═══ T1：五種塔的投入與返還（寫死；建造費、升級費照 Godot Tower.gd） ═══
// [種類, 建造費, 建造後返還, 第一次升級費, 升級後總投入, 升級後返還]
const TABLE = [
  ["archer", 50, 25, 50, 100, 50],
  ["infantry", 70, 35, 60, 130, 65],
  ["artillery", 100, 50, 80, 180, 90],
  ["cavalry", 120, 60, 70, 190, 95],
  ["scholar", 80, 40, 75, 155, 77],
];
for (const [type, cost, refund0, up1, total1, refund1] of TABLE) {
  const t = new TowerEntity("t", type, { col: 0, row: 0 }, { x: 0, y: 0 });
  t.addInvestment(cost);
  const a = {
    invested: t.investedGold,
    refund: t.getSellRefund(),
    legacy: t.getSellRefund(true),
    upCost: t.getUpgradeCost(),
  };
  check(
    `${type}：建造 ${cost} → 投入 ${cost}、返還 ${refund0}（舊的備戰參數不影響）；第一次升級費 ${up1}`,
    a.invested === cost &&
      a.refund === refund0 &&
      a.legacy === refund0 &&
      a.upCost === up1,
    a
  );
  t.upgrade();
  const b = {
    invested: t.investedGold,
    refund: t.getSellRefund(),
    legacy: t.getSellRefund(true),
    level: t.towerLevel,
  };
  check(
    `${type}：再升一級 → 總投入 ${total1}、返還 ${refund1}（floor）、Lv.2`,
    b.invested === total1 &&
      b.refund === refund1 &&
      b.legacy === refund1 &&
      b.level === 2,
    b
  );
}
{
  const t = new TowerEntity("t", "archer", { col: 0, row: 0 }, { x: 0, y: 0 });
  t.addInvestment(50);
  t.upgrade();
  const c2 = t.getUpgradeCost();
  t.upgrade();
  check(
    "弓兵：建 50＋升 50＋升 100（升級基數 50 × Lv.2）→ 總投入 200、返還 100",
    c2 === 100 &&
      t.investedGold === 200 &&
      t.getSellRefund() === 100 &&
      t.towerLevel === 3,
    {
      c2,
      invested: t.investedGold,
      refund: t.getSellRefund(),
      level: t.towerLevel,
    }
  );
  const before = t.investedGold;
  t.addInvestment(0);
  t.addInvestment(-30);
  check(
    "addInvestment 只接受正數（0、負數不改投入）",
    t.investedGold === before,
    { before, after: t.investedGold }
  );
}

// ═══ 引擎：合成關（一條路、四個建築位） ═══
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
function mkEngine(battleId) {
  const e = new BattleEngine(RENDERER);
  load(e, battleId);
  return e;
}
function load(e, battleId) {
  e.loadStage({
    stageId: "chapter1_1",
    battleId,
    totalWaves: 1,
    pathJson: JSON.stringify(PATH),
    waves: [],
    heroesConfig: [],
    enemiesConfig: [],
  });
}
const select = (e, col, row) => {
  const w = e.gameMap.gridToWorld(col, row);
  e.handleCellClick(w.x, w.y);
  return e.selectedUnit;
};
const towerAt = (e, col, row) =>
  e.towers.find((t) => t.gridCell.col === col && t.gridCell.row === row) ||
  null;
const setGold = (e, n) => {
  const b = e.battleManager;
  if (b.battleGold > n) b.spendGold(b.battleGold - n);
  else if (b.battleGold < n) b.earnGold(n - b.battleGold);
  return b.battleGold;
};
/** 狀態快照：金幣、塔（識別碼、等級、投入、已拆）、四個建築位的占用、選取 */
const snap = (e) => ({
  gold: e.battleManager.battleGold,
  towers: e.towers.map((t) => [
    t.towerUid,
    t.towerLevel,
    t.investedGold,
    t.sold,
  ]),
  occupied: PATH.build_zones.map(([c, r]) => e.gameMap.isOccupied(c, r)),
  selected: e.selectedUnit ? { ...e.selectedUnit } : null,
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ═══ T2：建造與升級的投入（失敗不新增投入、單位、占位或金幣變化） ═══
{
  const e = mkEngine("b1");
  const ok1 = e.placeTower(2, 1, "archer");
  const t = towerAt(e, 2, 1);
  check(
    "建弓兵塔成功：扣 50（5000 → 4950）、投入 50、占用格子",
    ok1 &&
      !!t &&
      t.investedGold === 50 &&
      e.battleManager.battleGold === 4950 &&
      e.gameMap.isOccupied(2, 1),
    { ok1, invested: t && t.investedGold, gold: e.battleManager.battleGold }
  );
  setGold(e, 40);
  const s0 = snap(e);
  const r1 = e.placeTower(4, 1, "archer");
  const r2 = e.placeTower(4, 1, "no_such_tower");
  const r3 = e.placeTower(2, 1, "archer");
  check(
    "建造失敗（金幣 40 不夠 50、沒有這種塔、格子已占用）：不新增塔、不扣錢、不占格子",
    r1 === false &&
      r2 === false &&
      r3 === false &&
      same(snap(e), s0) &&
      e.gameMap.canPlaceTower(4, 1),
    { r1, r2, r3, before: s0, after: snap(e) }
  );
  const u1 = e.upgradeTower(2, 1);
  check(
    "升級失敗（金幣 40 不夠 50）：等級、投入、金幣都不變",
    u1 === false && same(snap(e), s0),
    { u1, before: s0, after: snap(e) }
  );
  setGold(e, 120);
  const u2 = e.upgradeTower(2, 1);
  check(
    "升級成功：扣 50（120 → 70）、投入 100、Lv.2、返還 50",
    u2 &&
      t.towerLevel === 2 &&
      t.investedGold === 100 &&
      t.getSellRefund() === 50 &&
      e.battleManager.battleGold === 70,
    {
      u2,
      level: t.towerLevel,
      invested: t.investedGold,
      gold: e.battleManager.battleGold,
    }
  );
}

// ═══ T3：拆除守門（每次都重新檢查；拒絕時狀態完全不變） ═══
// 每個拒絕案例各用一個新的引擎與相同的前置（A、B 兩座塔、選取 A），一個案例錯誤地拆掉塔，不會影響其他案例的判定
/** 前置：弓兵 A（2,1）投入 50、文士 B（4,1）建 80＋升 75 投入 155；選取 A */
function setupAB() {
  const e = mkEngine("b1");
  e.placeTower(2, 1, "archer");
  e.placeTower(4, 1, "scholar");
  e.upgradeTower(4, 1);
  const A = towerAt(e, 2, 1);
  const B = towerAt(e, 4, 1);
  select(e, 2, 1);
  const rA = {
    battleId: "b1",
    towerUid: A.towerUid,
    col: 2,
    row: 1,
    expectedRefund: 25,
  };
  return { e, A, B, rA };
}
/** 在 e 上送 req，核拒絕原因與狀態完全不變 */
function expectReject(e, label, req, reason) {
  const before = snap(e);
  let r;
  let threw = null;
  try {
    r = e.sellTower(req);
  } catch (err) {
    threw = String(err);
  }
  const after = snap(e);
  check(
    `拒絕：${label} → ${reason}，金幣、塔、格子與選取都不變`,
    !threw && r && r.ok === false && r.reason === reason && same(after, before),
    { threw, r, before, after }
  );
  return r;
}
{
  const { e, A, B } = setupAB();
  check(
    "前置：弓兵 A 投入 50（返還 25）、文士 B 投入 80＋75＝155（返還 77），金幣 5000−50−80−75＝4795",
    A.investedGold === 50 &&
      A.getSellRefund() === 25 &&
      B.investedGold === 155 &&
      B.getSellRefund() === 77 &&
      e.battleManager.battleGold === 4795,
    {
      A: [A.investedGold, A.getSellRefund()],
      B: [B.investedGold, B.getSellRefund()],
      gold: e.battleManager.battleGold,
    }
  );
  check(
    "點選 A：選取的是 A",
    same(e.selectedUnit, { type: "tower", id: A.towerUid, col: 2, row: 1 }),
    e.selectedUnit
  );
}
{
  const { e, rA } = setupAB();
  e.selectedUnit = null;
  expectReject(e, "沒有選取任何塔", rA, "not_selected");
}
{
  const { e, rA } = setupAB();
  select(e, 4, 1);
  expectReject(e, "選了塔 B 卻送塔 A", rA, "not_selected");
}
{
  const { e, rA } = setupAB();
  expectReject(
    e,
    "塔 A 的識別碼配上別的格子",
    { ...rA, col: 4 },
    "not_selected"
  );
}
{
  const { e, rA } = setupAB();
  expectReject(
    e,
    "不存在的識別碼",
    { ...rA, towerUid: "tower_999" },
    "not_selected"
  );
}
{
  const { e, B, rA } = setupAB();
  expectReject(
    e,
    "塔 B 的識別碼（目前選的是 A）",
    { ...rA, towerUid: B.towerUid, col: 4, expectedRefund: 77 },
    "not_selected"
  );
}
for (const [label, mk] of [
  ["null", () => null],
  ["undefined", () => undefined],
  ["數字", () => 5],
  ["字串", () => "sell"],
  ["空物件", () => ({})],
  [
    "缺 expectedRefund",
    (rA) => ({ battleId: "b1", towerUid: rA.towerUid, col: 2, row: 1 }),
  ],
  ['expectedRefund 是字串 "25"', (rA) => ({ ...rA, expectedRefund: "25" })],
  ["expectedRefund 是小數 25.5", (rA) => ({ ...rA, expectedRefund: 25.5 })],
  ["expectedRefund 是負數", (rA) => ({ ...rA, expectedRefund: -1 })],
  ["expectedRefund 是 NaN", (rA) => ({ ...rA, expectedRefund: NaN })],
  ["battleId 是空字串", (rA) => ({ ...rA, battleId: "" })],
  ["battleId 是數字", (rA) => ({ ...rA, battleId: 1 })],
  ["towerUid 是空字串", (rA) => ({ ...rA, towerUid: "" })],
  ["col 是字串", (rA) => ({ ...rA, col: "2" })],
]) {
  const { e, rA } = setupAB();
  expectReject(e, `請求格式不對（${label}）`, mk(rA), "invalid_request");
}
{
  const { e, rA } = setupAB();
  expectReject(e, "別的場次（b0）", { ...rA, battleId: "b0" }, "stale_battle");
}
{
  const { e, rA } = setupAB();
  e.battleManager.manualPaused = true;
  expectReject(e, "暫停中", rA, "paused");
}
{
  const { e, rA } = setupAB();
  e.battleManager.setState(GameState.BATTLE);
  expectReject(e, "戰鬥中", rA, "not_prep");
}
{
  const { e, rA } = setupAB();
  e.battleManager.setState(GameState.RESULT);
  expectReject(e, "結算中", rA, "not_prep");
}
{
  const { e, rA } = setupAB();
  const r24 = expectReject(
    e,
    "預期返還 24（實際 25）",
    { ...rA, expectedRefund: 24 },
    "refund_changed"
  );
  check(
    "拒絕結果帶現在的返還 25 與「現在可以拆」",
    r24 && r24.refund === 25 && r24.canSell === true,
    r24
  );
}
{
  const { e, rA } = setupAB();
  expectReject(
    e,
    "預期返還 26（實際 25）",
    { ...rA, expectedRefund: 26 },
    "refund_changed"
  );
}
{
  const { e } = setupAB();
  expectReject(e, "舊的只給格子呼叫 sellTower(2, 1)", 2, "invalid_request");
}
// 過期的返還、成功、重複送出、拆後再建、奇數投入、換一場：同一個引擎依序進行
{
  const { e, A, B, rA } = setupAB();
  e.upgradeTower(2, 1);
  check(
    "升級 A 後返還變 50（投入 100）",
    A.getSellRefund() === 50 && A.investedGold === 100,
    [A.investedGold, A.getSellRefund()]
  );
  expectReject(e, "升級前記下的請求（預期 25，實際 50）", rA, "refund_changed");
  const goldBefore = e.battleManager.battleGold;
  const ok = e.sellTower({ ...rA, expectedRefund: 50 });
  check(
    "成功：返還 50、金幣加 50、A 已拆並移除、格子釋放（可以再建）、取消選取",
    ok &&
      ok.ok === true &&
      ok.refund === 50 &&
      e.battleManager.battleGold === goldBefore + 50 &&
      A.sold === true &&
      !e.towers.includes(A) &&
      !e.gameMap.isOccupied(2, 1) &&
      e.gameMap.canPlaceTower(2, 1) &&
      e.selectedUnit === null,
    {
      ok,
      gold: e.battleManager.battleGold,
      goldBefore,
      sold: A.sold,
      selected: e.selectedUnit,
    }
  );
  expectReject(
    e,
    "同一份成功的請求再送一次",
    { ...rA, expectedRefund: 50 },
    "not_selected"
  );
  const rebuilt = e.placeTower(2, 1, "archer");
  const A2 = towerAt(e, 2, 1);
  check(
    "拆完可以在同一格再建（新的識別碼）",
    rebuilt && !!A2 && A2.towerUid !== A.towerUid && A2.investedGold === 50,
    { rebuilt, uid: A2 && A2.towerUid }
  );
  select(e, 4, 1);
  const okB = e.sellTower({
    battleId: "b1",
    towerUid: B.towerUid,
    col: 4,
    row: 1,
    expectedRefund: 77,
  });
  check(
    "奇數投入：文士 B 投入 155，返還 floor(77.5)＝77",
    okB && okB.ok === true && okB.refund === 77 && B.sold === true,
    okB
  );
  // 換一場（同一個引擎）：舊場次的請求一律拒絕
  load(e, "b3");
  e.placeTower(2, 1, "archer");
  const C = towerAt(e, 2, 1);
  select(e, 2, 1);
  expectReject(
    e,
    "新的一場送上一場（b1）的請求",
    {
      battleId: "b1",
      towerUid: C.towerUid,
      col: 2,
      row: 1,
      expectedRefund: 25,
    },
    "stale_battle"
  );
}

// ═══ T4：跨場次同一個識別碼、同一格（新頁面的引擎從 tower_1 重新編號） ═══
{
  const e1 = mkEngine("b1");
  e1.placeTower(2, 1, "archer");
  const old = {
    battleId: "b1",
    towerUid: towerAt(e1, 2, 1).towerUid,
    col: 2,
    row: 1,
    expectedRefund: 25,
  };
  const e2 = mkEngine("b2");
  e2.placeTower(2, 1, "archer");
  const t2 = towerAt(e2, 2, 1);
  select(e2, 2, 1);
  const before = snap(e2);
  const r = e2.sellTower(old);
  check(
    "另一場同一個識別碼（tower_1）、同一格、同樣的返還：拒絕 stale_battle，狀態不變",
    t2.towerUid === old.towerUid &&
      r.ok === false &&
      r.reason === "stale_battle" &&
      same(snap(e2), before),
    { uid: [t2.towerUid, old.towerUid], r, before, after: snap(e2) }
  );
  const okNow = e2.sellTower({ ...old, battleId: "b2" });
  check(
    "帶這一場（b2）的請求才成功",
    okNow.ok === true && okNow.refund === 25,
    okNow
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
