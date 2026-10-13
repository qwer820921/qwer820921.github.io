// 神馬三國 JS 版的移位（備戰時移動場上的武將與塔；純 Node、不連網）
// - 用真正的 engine/BattleEngine.ts（beginMove、previewMove、listMoveTargets、commitMove、cancelMove、refreshMoveState、handleCellClick）、
//   engine/entities/HeroEntity.ts、engine/entities/TowerEntity.ts、engine/GameMap.ts 與 BattleManager；期待值照 Godot 版 Main._place_unit
//   （只在備戰、沒有暫停時；釋放舊格 → reposition → 佔用新格；不花費、不重建實例）與本輪的規則手寫，不由被測的程式產生
// - 假的依賴只有畫面：BattleEngine 傳入什麼都不畫的 renderer（不建立 CanvasRenderer、不啟動遊戲迴圈）
// - 受控的部分都標明：階段（setState）、暫停（setPaused）、結算（endBattle）、生命、冷卻、首擊紀錄、光環施加（直接呼叫 hero.update 一次，
//   等同戰鬥中那一幀的武將更新；不是產品在備戰時的重算路徑）。
// - 另外用 TypeScript AST 從 components/shenmaSanguoJsPage.tsx 取出實際的 handleMoveStart、commitMoveTo、currentAccountOf、moveRejectText 與
//   MOVE_HERO_BLOCKED_TEXT（轉成 JS 後執行）；bridge、store、React 狀態都是這裡的假物件（只記呼叫）。證據等級：頁面實際的函式＋受控的輸入
// - 所有金鑰都是虛構的 test_*
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/unitMovement.test.mjs"
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

const { BattleEngine } = require(join(HERE, "../engine/BattleEngine.ts"));
const { GameState } = require(join(HERE, "../engine/BattleManager.ts"));
const B = require(join(HERE, "battleAccountBoundary.ts"));

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

// ═══ 合成關：一條路（第 3 列）、四個建築位；(0,0) 是一般地形（不能放） ═══
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
const cfg = (hero_id, extra = {}) => ({
  hero_id,
  name: hero_id,
  job: "infantry",
  attack_range: 2,
  range_growth: 0.1,
  attack_speed: 1.0,
  atk_spd_growth: 0.05,
  ...extra,
});
const CFG = [
  cfg("hero_ma_chao", { job: "cavalry" }),
  cfg("hero_zhao_yun"),
  cfg("hero_liu_bei", { attack_range: 10 }),
  cfg("hero_zhang_fei", { attack_range: 10 }),
];
const MA = {
  hero_id: "hero_ma_chao",
  level: 2,
  atk: 100,
  def: 50,
  hp: 1000,
  skill: { id: "first_strike", first_attack_multiplier: 2 },
};
const ZY = { hero_id: "hero_zhao_yun", level: 1, atk: 90, def: 60, hp: 1100 };
const LB = {
  hero_id: "hero_liu_bei",
  level: 1,
  atk: 1,
  def: 50,
  hp: 1000,
  skill: { id: "def_aura", def_mult: 1.2 },
};
const ZF = {
  hero_id: "hero_zhang_fei",
  level: 1,
  atk: 1,
  def: 50,
  hp: 1000,
  skill: { id: "atk_speed_aura", atk_speed_mult: 1.15 },
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
    totalWaves: 2,
    pathJson: JSON.stringify(PATH),
    waves: [],
    heroesConfig: CFG,
    enemiesConfig: [],
  });
}
const heroAt = (e, col, row) =>
  e.heroes.find((h) => h.gridCell.col === col && h.gridCell.row === row) ||
  null;
const occ = (e, col, row) => {
  const o = e.gameMap.getOccupant(col, row);
  return o === null || o === undefined
    ? null
    : o.isHero
      ? `hero:${o.heroId}`
      : o.towerUid
        ? `tower:${o.towerUid}`
        : "other";
};
/** 這一場與場上所有單位的快照（拒絕前後要完全相同） */
const snap = (e) => {
  const bm = e.battleManager;
  const cells = [];
  for (let r = 0; r < e.gameMap.rows; r++)
    for (let c = 0; c < e.gameMap.cols; c++) cells.push(occ(e, c, r));
  return {
    battleId: bm.battleId,
    state: bm.gameState,
    paused: bm.manualPaused,
    wave: bm.currentWave,
    time: bm.battleTime,
    gold: bm.battleGold,
    base: bm.baseHp,
    firstStrike: [...bm.firstStrikeUsed],
    heroes: e.heroes.map((h) => [
      h.heroId,
      h.gridCell.col,
      h.gridCell.row,
      h.x,
      h.y,
      h.isOnRoad,
      h.isDead,
      h.heroLevel,
      h.atk,
      h.defStat,
      h.maxHp,
      h.currentHp,
      h.atkTimer,
      h.defBonusMult,
      h.atkSpeedBonusMult,
    ]),
    towers: e.towers.map((t) => [
      t.towerUid,
      t.gridCell.col,
      t.gridCell.row,
      t.x,
      t.y,
      t.towerLevel,
      t.investedGold,
      t.getSellRefund(),
      t.sold,
    ]),
    cells,
    selected: e.selectedUnit ? { ...e.selectedUnit } : null,
  };
};
const watchMoves = (e) => {
  const ended = [];
  const picked = [];
  e.onMoveEnded = (info) => ended.push(info);
  e.onMoveCellPicked = (p) => picked.push(p);
  return { ended, picked };
};

// ═══ M1：第 0 波備戰移動武將（同一個實例、免費、數值／生命／冷卻／首擊不變、選取與虛影） ═══
{
  const e = mkEngine("m1");
  const w = watchMoves(e);
  e.placeHero(3, 3, MA);
  e.placeTower(2, 1, "archer");
  const roster = [];
  e.onHeroRosterChanged = (info) => roster.push(info);
  const h = heroAt(e, 3, 3);
  // 受控前置：生命 600、攻擊冷卻 0.37、這一場的首擊已用
  h.currentHp = 600;
  h.atkTimer = 0.37;
  e.battleManager.consumeFirstStrike("hero_ma_chao", 200);
  const s0 = snap(e);
  const r = e.beginMove("m1", "hero", h, { col: 3, row: 3 });
  check(
    "開始移動武將：回傳移動編號、這一場、種類、名稱與來源格；選取這位武將並顯示虛影",
    r.ok === true &&
      r.moveId === 1 &&
      r.battleId === "m1" &&
      r.kind === "hero" &&
      r.name === h.heroName &&
      same(r.from, { col: 3, row: 3 }) &&
      same(e.selectedUnit, {
        type: "hero",
        id: "hero_ma_chao",
        col: 3,
        row: 3,
      }) &&
      !!e.dragGhost &&
      e.dragGhost.type === "hero" &&
      same(e.getMoveState(), {
        moveId: 1,
        battleId: "m1",
        kind: "hero",
        from: { col: 3, row: 3 },
      }),
    { r, sel: e.selectedUnit, ghost: e.dragGhost, ms: e.getMoveState() }
  );
  const targets = e.listMoveTargets(r.moveId);
  const has = (c, rr) => targets.some((t) => t.col === c && t.row === rr);
  check(
    "合法目的格：空的道路格與建築位；不含原格、被塔占的建築位與一般地形",
    has(5, 3) &&
      has(4, 1) &&
      !has(3, 3) &&
      !has(2, 1) &&
      !has(0, 0) &&
      targets.find((t) => t.col === 5 && t.row === 3).terrain === "road" &&
      targets.find((t) => t.col === 4 && t.row === 1).terrain === "build",
    { n: targets.length, sample: targets.slice(0, 6) }
  );
  check(
    "預覽合法格：高亮是綠的，虛影移到那一格",
    e.previewMove(r.moveId, 5, 3) === true &&
      same(e.highlightCell, { col: 5, row: 3, valid: true }) &&
      e.dragGhost.x === e.gameMap.gridToWorld(5, 3).x,
    { hl: e.highlightCell }
  );
  check(
    "預覽不合法格：高亮是紅的，不移動",
    e.previewMove(r.moveId, 2, 1) === false &&
      same(e.highlightCell, { col: 2, row: 1, valid: false }) &&
      h.gridCell.col === 3,
    { hl: e.highlightCell }
  );
  const c = e.commitMove(r.moveId, 5, 3);
  const s1 = snap(e);
  check(
    "提交移到道路 (5,3)：同一個實例在新格、舊格釋放、新格占用、在道路上",
    c.ok === true &&
      same(c.from, { col: 3, row: 3 }) &&
      same(c.to, { col: 5, row: 3 }) &&
      e.heroes.length === 1 &&
      e.heroes[0] === h &&
      h.gridCell.col === 5 &&
      h.gridCell.row === 3 &&
      occ(e, 3, 3) === null &&
      occ(e, 5, 3) === "hero:hero_ma_chao" &&
      h.isOnRoad === true &&
      h.x === e.gameMap.gridToWorld(5, 3).x,
    { c, cell: h.gridCell }
  );
  check(
    "免費、等級／攻擊／防禦／生命 600／攻擊冷卻 0.37／首擊紀錄／金幣／波次／時間都不變",
    s1.gold === s0.gold &&
      s1.wave === s0.wave &&
      s1.time === s0.time &&
      same(s1.firstStrike, s0.firstStrike) &&
      h.currentHp === 600 &&
      h.atkTimer === 0.37 &&
      h.heroLevel === 2 &&
      h.atk === s0.heroes[0][8] &&
      h.defStat === s0.heroes[0][9] &&
      h.maxHp === s0.heroes[0][10],
    { s0, s1 }
  );
  check(
    "移動後：選取改到新格、虛影與高亮清掉、沒有進行中的移動、通知一次 moved",
    same(e.selectedUnit, {
      type: "hero",
      id: "hero_ma_chao",
      col: 5,
      row: 3,
    }) &&
      e.dragGhost === null &&
      e.highlightCell === null &&
      e.getMoveState() === null &&
      same(w.ended, [{ moveId: 1, battleId: "m1", reason: "moved" }]),
    { sel: e.selectedUnit, ended: w.ended }
  );
  check(
    "移動不送部署名單的變更（已在場上的武將不增加、不重設）",
    roster.length === 0,
    roster
  );
  const sBefore2 = snap(e);
  const c2 = e.commitMove(r.moveId, 7, 3);
  check(
    "同一個編號再提交一次：不接受（stale_move），什麼都不變",
    c2.ok === false && c2.reason === "stale_move" && same(snap(e), sBefore2),
    { c2 }
  );
  // 塔：建築位 (2,1) → (4,1)
  const tw = e.towers[0];
  const invested = tw.investedGold;
  const refund = tw.getSellRefund();
  const rt = e.beginMove("m1", "tower", tw, { col: 2, row: 1 });
  const ct = rt.ok ? e.commitMove(rt.moveId, 4, 1) : null;
  check(
    "移動塔到另一個建築位：同一個實例、投入與返還、等級不變、舊格釋放新格占用",
    rt.ok &&
      ct &&
      ct.ok &&
      e.towers[0] === tw &&
      tw.gridCell.col === 4 &&
      tw.gridCell.row === 1 &&
      occ(e, 2, 1) === null &&
      occ(e, 4, 1) === `tower:${tw.towerUid}` &&
      tw.investedGold === invested &&
      tw.getSellRefund() === refund &&
      tw.towerLevel === 1 &&
      e.battleManager.battleGold === s1.gold,
    { rt, ct, invested, refund }
  );
  const rt2 = e.beginMove("m1", "tower", tw, { col: 4, row: 1 });
  const before = snap(e);
  const bad = e.commitMove(rt2.moveId, 7, 3);
  check(
    "塔不能放到道路格：不接受（invalid_terrain），什麼都不變",
    bad.ok === false &&
      bad.reason === "invalid_terrain" &&
      same(snap(e), before),
    { bad }
  );
  e.cancelMove(rt2.moveId);
  // 武將移到建築位：不在道路上
  const rh = e.beginMove("m1", "hero", h, { col: 5, row: 3 });
  const ch = e.commitMove(rh.moveId, 6, 1);
  check(
    "武將可以移到建築位 (6,1)，之後不在道路上",
    ch.ok &&
      h.gridCell.col === 6 &&
      h.gridCell.row === 1 &&
      h.isOnRoad === false,
    { ch }
  );
}

// ═══ M2：清波後的備戰、取消、生命 0 但還沒陣亡 ═══
{
  const e = mkEngine("m2");
  const w = watchMoves(e);
  e.placeHero(3, 3, ZY);
  // 受控：開戰、清完第 1 波回到備戰
  e.battleManager.setState(GameState.BATTLE);
  e.battleManager.currentWave = 1;
  e.battleManager.setState(GameState.PREP);
  const h = heroAt(e, 3, 3);
  const r = e.beginMove("m2", "hero", h, { col: 3, row: 3 });
  const c = r.ok ? e.commitMove(r.moveId, 7, 3) : null;
  check(
    "清波後的備戰（第 1 波之後）也可以移動",
    r.ok && c && c.ok && h.gridCell.col === 7,
    { r, c }
  );
  const s0 = snap(e);
  const r2 = e.beginMove("m2", "hero", h, { col: 7, row: 3 });
  const cancelled = e.cancelMove(r2.moveId);
  check(
    "取消：回傳 true、沒有進行中的移動、虛影清掉、場上與選取以外不變、通知 cancelled",
    cancelled === true &&
      e.getMoveState() === null &&
      e.dragGhost === null &&
      same({ ...snap(e), selected: null }, { ...s0, selected: null }) &&
      w.ended.at(-1).reason === "cancelled",
    { ended: w.ended }
  );
  check("取消後再取消同一個編號：false", e.cancelMove(r2.moveId) === false);
  h.currentHp = 0; // 受控：生命 0 但還沒陣亡（沿用在場的身份）
  const r3 = e.beginMove("m2", "hero", h, { col: 7, row: 3 });
  const c3 = r3.ok ? e.commitMove(r3.moveId, 5, 3) : null;
  check(
    "生命 0 但還沒陣亡的武將照樣可以移動（沿用在場的身份，不新增數值政策）",
    r3.ok &&
      c3 &&
      c3.ok &&
      h.gridCell.col === 5 &&
      h.currentHp === 0 &&
      h.isDead === false,
    { r3, c3 }
  );
}

// ═══ M3：拒絕（拒絕前後整個場上完全相同） ═══
{
  const e = mkEngine("m3");
  e.placeHero(3, 3, MA);
  e.placeHero(5, 3, ZY);
  e.placeTower(2, 1, "archer");
  const h = heroAt(e, 3, 3);
  const tw = e.towers[0];
  const tryBegin = (name, args, want) => {
    const s0 = snap(e);
    const r = e.beginMove(...args);
    check(
      `開始移動被拒：${name}（${want}），什麼都不變`,
      r.ok === false &&
        r.reason === want &&
        same(snap(e), s0) &&
        e.getMoveState() === null,
      { r }
    );
  };
  tryBegin(
    "別場的 battleId",
    ["other", "hero", h, { col: 3, row: 3 }],
    "stale_battle"
  );
  tryBegin(
    "來源格不是它現在的格子",
    ["m3", "hero", h, { col: 5, row: 3 }],
    "source_changed"
  );
  e.battleManager.setState(GameState.BATTLE); // 受控
  tryBegin("戰鬥中", ["m3", "hero", h, { col: 3, row: 3 }], "not_prep");
  e.battleManager.setState(GameState.PREP);
  e.battleManager.setPaused("m3", true); // 受控
  tryBegin("暫停中", ["m3", "tower", tw, { col: 2, row: 1 }], "paused");
  e.battleManager.setPaused("m3", false);
  // 提交的目的格檢查：先開始一次合法的移動
  const r = e.beginMove("m3", "hero", h, { col: 3, row: 3 });
  const tryCommit = (name, col, row, want) => {
    const s0 = snap(e);
    const c = e.commitMove(r.moveId, col, row);
    check(
      `提交被拒：${name}（${want}），什麼都不變，移動仍在進行`,
      c.ok === false &&
        c.reason === want &&
        same(snap(e), s0) &&
        e.getMoveState()?.moveId === r.moveId,
      { c }
    );
  };
  tryCommit('座標是字串 "7"（不轉型）', "7", 3, "invalid_cell");
  tryCommit("座標是 NaN", NaN, 3, "invalid_cell");
  tryCommit("座標是 Infinity", Infinity, 3, "invalid_cell");
  tryCommit("座標是小數 7.5", 7.5, 3, "invalid_cell");
  tryCommit("座標是負數", -1, 3, "invalid_cell");
  tryCommit("超出地圖", 99, 3, "invalid_cell");
  tryCommit("原格", 3, 3, "same_cell");
  tryCommit("被別的武將占的格子", 5, 3, "occupied");
  tryCommit("被塔占的建築位", 2, 1, "occupied");
  tryCommit("一般地形 (0,0)", 0, 0, "invalid_terrain");
  // 來源被改（受控：原格的占用者換成別人）
  const occupant = e.gameMap.getOccupant(3, 3);
  e.gameMap.setOccupied(3, 3, tw);
  tryCommit("原格的占用者不是它自己", 7, 3, "source_changed");
  e.gameMap.setOccupied(3, 3, occupant);
  e.battleManager.setState(GameState.BATTLE);
  tryCommit("開始之後進入戰鬥", 7, 3, "not_prep");
  e.battleManager.setState(GameState.PREP);
  e.battleManager.setPaused("m3", true);
  tryCommit("開始之後暫停", 7, 3, "paused");
  e.battleManager.setPaused("m3", false);
  e.battleManager.endBattle(false); // 受控：結算
  tryCommit("開始之後結算", 7, 3, "not_prep");
}

// ═══ M4：真陣亡／被移除／拆除、同 ID 的新實例、舊編號與晚到的取消、失效 ═══
{
  const e = mkEngine("m4");
  const w = watchMoves(e);
  e.placeHero(3, 3, MA);
  e.placeTower(2, 1, "archer");
  const old = heroAt(e, 3, 3);
  const r = e.beginMove("m4", "hero", old, { col: 3, row: 3 });
  // 隊伍同步把馬超移出（真正的離場），再派一位同 ID 的新馬超到同一格
  e.syncTeam("m4", []);
  e.placeHero(3, 3, MA);
  const fresh = heroAt(e, 3, 3);
  const s0 = snap(e);
  const c = e.commitMove(r.moveId, 7, 3);
  check(
    "原本的武將離場後，同 ID 的新武將派在同一格：舊的移動不解析成新實例（not_found），新的馬超不動",
    fresh !== old &&
      c.ok === false &&
      c.reason === "not_found" &&
      same(snap(e), s0) &&
      fresh.gridCell.col === 3,
    { c }
  );
  e.refreshMoveState();
  check(
    "每幀檢查：原單位不在場上 → 移動失效、通知 invalidated",
    e.getMoveState() === null &&
      w.ended.at(-1).reason === "invalidated" &&
      w.ended.at(-1).moveId === r.moveId,
    { ended: w.ended }
  );
  const sOld = snap(e);
  const rOld = e.beginMove("m4", "hero", old, { col: 3, row: 3 });
  check(
    "用已離場的舊實例開始：not_found",
    rOld.ok === false && rOld.reason === "not_found" && same(snap(e), sOld),
    { rOld }
  );
  // 拆掉的塔
  const tw = e.towers[0];
  const rt = e.beginMove("m4", "tower", tw, { col: 2, row: 1 });
  tw.sold = true; // 受控：已拆
  const ct = e.commitMove(rt.moveId, 4, 1);
  check(
    "塔在開始之後被拆：not_found",
    ct.ok === false && ct.reason === "not_found",
    { ct }
  );
  tw.sold = false;
  e.cancelMove(rt.moveId);
  // 舊編號與晚到的取消
  const r1 = e.beginMove("m4", "hero", fresh, { col: 3, row: 3 });
  const r2 = e.beginMove("m4", "tower", tw, { col: 2, row: 1 });
  check(
    "開始新的移動：舊的移動被取消（通知 cancelled），新的編號較大",
    r1.ok &&
      r2.ok &&
      r2.moveId > r1.moveId &&
      w.ended.some((x) => x.moveId === r1.moveId && x.reason === "cancelled") &&
      e.getMoveState().moveId === r2.moveId,
    { r1, r2 }
  );
  check(
    "晚到的舊取消不影響新的移動",
    e.cancelMove(r1.moveId) === false && e.getMoveState()?.moveId === r2.moveId
  );
  const cOld = e.commitMove(r1.moveId, 7, 3);
  check(
    "舊編號提交：stale_move，新的移動仍在",
    cOld.ok === false &&
      cOld.reason === "stale_move" &&
      e.getMoveState()?.moveId === r2.moveId &&
      fresh.gridCell.col === 3,
    { cOld }
  );
  const cNew = e.commitMove(r2.moveId, 4, 1);
  check("新的移動照常提交", cNew.ok && tw.gridCell.col === 4, { cNew });
  // 進入戰鬥、換場時失效
  const r3 = e.beginMove("m4", "hero", fresh, { col: 3, row: 3 });
  e.battleManager.setState(GameState.BATTLE);
  e.refreshMoveState();
  check(
    "開始之後進入戰鬥：每幀檢查讓移動失效、清掉虛影與高亮",
    e.getMoveState() === null &&
      e.dragGhost === null &&
      e.highlightCell === null &&
      w.ended.at(-1).moveId === r3.moveId &&
      w.ended.at(-1).reason === "invalidated",
    { ended: w.ended.at(-1) }
  );
  e.battleManager.setState(GameState.PREP);
  const r4 = e.beginMove("m4", "hero", fresh, { col: 3, row: 3 });
  load(e, "m4b");
  check(
    "換成新的一場：上一場的移動失效（invalidated），新的一場沒有移動",
    e.getMoveState() === null &&
      w.ended.at(-1).moveId === r4.moveId &&
      w.ended.at(-1).reason === "invalidated"
  );
}

// ═══ M5：移位模式中點畫布只交給頁面（不改選取、不開部署選單或單位面板） ═══
{
  const e = mkEngine("m5");
  const w = watchMoves(e);
  const opened = { menu: 0, tower: 0, hero: 0, cell: 0 };
  e.onShowPlacementMenu = () => opened.menu++;
  e.onShowUpgradePanel = () => opened.tower++;
  e.onShowHeroInfo = () => opened.hero++;
  e.onCellClicked = () => opened.cell++;
  e.placeHero(3, 3, MA);
  e.placeTower(2, 1, "archer");
  const h = heroAt(e, 3, 3);
  const r = e.beginMove("m5", "hero", h, { col: 3, row: 3 });
  const sel = { ...e.selectedUnit };
  for (const [c, rr] of [
    [7, 3],
    [2, 1],
    [0, 0],
  ]) {
    const p = e.gameMap.gridToWorld(c, rr);
    e.handleCellClick(p.x, p.y);
  }
  check(
    "移位模式中點了三格（空道路、塔、一般地形）：只通知頁面三次，不開部署選單／面板、不改選取、不移動",
    same(
      w.picked.map((p) => [p.moveId, p.battleId, p.col, p.row]),
      [
        [r.moveId, "m5", 7, 3],
        [r.moveId, "m5", 2, 1],
        [r.moveId, "m5", 0, 0],
      ]
    ) &&
      same(opened, { menu: 0, tower: 0, hero: 0, cell: 0 }) &&
      same(e.selectedUnit, sel) &&
      h.gridCell.col === 3,
    { picked: w.picked, opened }
  );
  e.cancelMove(r.moveId);
  const p = e.gameMap.gridToWorld(7, 3);
  e.handleCellClick(p.x, p.y);
  check(
    "移動結束後點空道路：照原本開部署選單",
    opened.menu === 1 && w.picked.length === 3,
    { opened }
  );
}

// ═══ M6：光環來源的定向清理（移動者發出的、別人加在移動者身上的；無關的保持；不推進時間） ═══
{
  const e = mkEngine("m6");
  e.placeHero(3, 3, LB); // 劉備：防禦光環 1.2（射程 10）
  e.placeHero(5, 3, ZY); // 趙雲：沒有光環
  e.placeHero(7, 3, ZF); // 張飛：攻速光環 1.15（射程 10）
  const lb = heroAt(e, 3, 3);
  const zy = heroAt(e, 5, 3);
  const zf = heroAt(e, 7, 3);
  const tick = () => {
    for (const x of [...e.heroes])
      x.update(
        0.016,
        e.waveManager.activeEnemies,
        e.heroes,
        e.battleManager,
        e.floatingTexts,
        e.soundManager
      );
  };
  // 受控：一次戰鬥中的武將更新（施加光環），再回到備戰
  e.battleManager.setState(GameState.BATTLE);
  tick();
  e.battleManager.setState(GameState.PREP);
  const before = {
    lbOnZy: lb.aurasOn(zy),
    lbOnZf: lb.aurasOn(zf),
    zfOnZy: zf.aurasOn(zy),
    zfOnLb: zf.aurasOn(lb),
    zyDef: zy.defBonusMult,
    zyAs: zy.atkSpeedBonusMult,
    zfDef: zf.defBonusMult,
    lbAs: lb.atkSpeedBonusMult,
  };
  check(
    "前置（受控的一次戰鬥中更新）：劉備的防禦光環在趙雲、張飛身上，張飛的攻速光環在趙雲、劉備身上",
    before.lbOnZy.def &&
      before.lbOnZf.def &&
      before.zfOnZy.atkSpeed &&
      before.zfOnLb.atkSpeed &&
      before.zyDef === 1.2 &&
      before.zyAs === 1.15 &&
      before.zfDef === 1.2 &&
      before.lbAs === 1.15,
    before
  );
  const zfDefLeft = zf.defSources.get(lb.defAuraSource).left;
  const timeBefore = e.battleManager.battleTime;
  const atkTimers = e.heroes.map((x) => x.atkTimer);
  // 移動趙雲（沒有光環）：別人加在它身上的撤除；劉備對張飛、張飛對劉備的無關來源保持
  const r1 = e.beginMove("m6", "hero", zy, { col: 5, row: 3 });
  const c1 = e.commitMove(r1.moveId, 6, 1);
  check(
    "移動趙雲：劉備與張飛加在它身上的防禦、攻速來源撤除（集合也一致），倍率回到 1",
    c1.ok &&
      !lb.aurasOn(zy).def &&
      !zf.aurasOn(zy).atkSpeed &&
      zy.defBonusMult === 1 &&
      zy.atkSpeedBonusMult === 1 &&
      !zy.defSources.has(lb.defAuraSource) &&
      !zy.atkSpeedSources.has(zf.atkSpeedAuraSource),
    { c1, zyDef: zy.defBonusMult, zyAs: zy.atkSpeedBonusMult }
  );
  check(
    "無關的來源保持：劉備對張飛的防禦（有效期 left 不變）、張飛對劉備的攻速",
    lb.aurasOn(zf).def &&
      zf.defBonusMult === 1.2 &&
      zf.defSources.get(lb.defAuraSource).left === zfDefLeft &&
      zf.aurasOn(lb).atkSpeed &&
      lb.atkSpeedBonusMult === 1.15,
    {
      zfDef: zf.defBonusMult,
      left: zf.defSources.get(lb.defAuraSource)?.left,
      zfDefLeft,
    }
  );
  check(
    "移動沒有推進時間：battleTime 與所有武將的攻擊冷卻不變",
    e.battleManager.battleTime === timeBefore &&
      same(
        e.heroes.map((x) => x.atkTimer),
        atkTimers
      ),
    { timeBefore, now: e.battleManager.battleTime }
  );
  // 移動劉備（光環發出者）：它發出的防禦光環全部撤除；張飛加在它身上的攻速也撤除
  const r2 = e.beginMove("m6", "hero", lb, { col: 3, row: 3 });
  const c2 = e.commitMove(r2.moveId, 8, 1);
  check(
    "移動劉備：它發出的防禦光環從張飛身上撤除（劉備的集合清空）；張飛加在劉備身上的攻速撤除",
    c2.ok &&
      !lb.aurasOn(zf).def &&
      zf.defBonusMult === 1 &&
      !zf.defSources.has(lb.defAuraSource) &&
      !zf.aurasOn(lb).atkSpeed &&
      lb.atkSpeedBonusMult === 1,
    { c2, zfDef: zf.defBonusMult, lbAs: lb.atkSpeedBonusMult }
  );
  // 第一次戰鬥中更新照新位置重建（受控的一次更新）：射程 10 格，三位都在範圍內
  e.battleManager.setState(GameState.BATTLE);
  tick();
  check(
    "之後第一次戰鬥中的更新依新位置重建光環（三位都在 10 格內）",
    lb.aurasOn(zy).def &&
      lb.aurasOn(zf).def &&
      zf.aurasOn(zy).atkSpeed &&
      zf.aurasOn(lb).atkSpeed &&
      zy.defBonusMult === 1.2 &&
      zy.atkSpeedBonusMult === 1.15,
    { zyDef: zy.defBonusMult, zyAs: zy.atkSpeedBonusMult }
  );
}

// ═══ M7：頁面實際的 handleMoveStart、commitMoveTo（AST 取出原文＋受控的假依賴） ═══
const PAGE = join(HERE, "../components/shenmaSanguoJsPage.tsx");
const sf = ts.createSourceFile(
  PAGE,
  readFileSync(PAGE, "utf8"),
  ts.ScriptTarget.ES2020,
  true,
  ts.ScriptKind.TSX
);
const found = {
  handleMoveStart: [],
  handleMovePreview: [],
  commitMoveTo: [],
  currentAccountOf: [],
  MOVE_HERO_BLOCKED_TEXT: [],
  moveRejectText: [],
};
(function walk(n) {
  if (
    ts.isVariableDeclaration(n) &&
    ts.isIdentifier(n.name) &&
    n.name.text in found &&
    n.initializer
  )
    found[n.name.text].push(n.initializer);
  if (ts.isFunctionDeclaration(n) && n.name && n.name.text === "moveRejectText")
    found.moveRejectText.push(n);
  ts.forEachChild(n, walk);
})(sf);
check(
  "取出頁面的 handleMoveStart、handleMovePreview、commitMoveTo（useCallback 的第一個參數）、currentAccountOf、MOVE_HERO_BLOCKED_TEXT、moveRejectText（各剛好一個）",
  Object.values(found).every((v) => v.length === 1),
  Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length]))
);
const jsOf = (node) =>
  ts
    .transpileModule(`const __f = ${node.getText(sf)};`, {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2020,
      },
    })
    .outputText.replace(/^"use strict";\s*/, "");
const fnOf = (node) =>
  ts
    .transpileModule(node.getText(sf), {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2020,
      },
    })
    .outputText.replace(/^"use strict";\s*/, "");
const currentAccountOf = new Function(
  `${jsOf(found.currentAccountOf[0])}\nreturn __f;`
)();
const MOVE_HERO_BLOCKED_TEXT = new Function(
  `${jsOf(found.MOVE_HERO_BLOCKED_TEXT[0])}\nreturn __f;`
)();
const moveRejectText = new Function(
  `${fnOf(found.moveRejectText[0])}\nreturn moveRejectText;`
)();
const commitInit = found.commitMoveTo[0];
const commitArrow = ts.isCallExpression(commitInit)
  ? commitInit.arguments[0]
  : commitInit;

/** 假的 store：只有 getState 會被呼叫；其他任何讀取都記下（不應寫入 profile） */
const storeOf = (mode, key, epoch, extra = {}) => {
  const touched = [];
  const state = {
    mode,
    player: key === null ? null : { key },
    isLoading: false,
    teamEditable: true,
    readOnly: false,
    getAccountEpoch: () => epoch,
    ...extra,
  };
  return {
    touched,
    api: new Proxy(
      { getState: () => state },
      {
        get: (t, p) =>
          p === "getState" ? t.getState : (touched.push(String(p)), undefined),
      }
    ),
  };
};
const OWN = (mode, key, epoch) => ({ mode, key, epoch });
const mkBridge = (beginResult = null) => {
  const calls = { begin: [], commit: [], cancel: [], list: [], preview: [] };
  return {
    calls,
    bridge: {
      beginMove: (...a) => (
        calls.begin.push(a),
        beginResult || {
          ok: true,
          moveId: 9,
          battleId: "b1",
          kind: a[1],
          name: "n",
          from: a[3],
        }
      ),
      listMoveTargets: (id) => (
        calls.list.push(id), [{ col: 7, row: 3, terrain: "road" }]
      ),
      commitMove: (...a) => (
        calls.commit.push(a),
        {
          ok: true,
          moveId: a[0],
          battleId: "b1",
          from: { col: 3, row: 3 },
          to: { col: a[1], row: a[2] },
        }
      ),
      cancelMove: (id) => (calls.cancel.push(id), true),
      previewMove: (...a) => (calls.preview.push(a), true),
    },
  };
};
function runCommit({
  kind,
  ctxOwner,
  store,
  ms = { moveId: 9, battleId: "b1", kind, name: "n", targets: [] },
  ctxBattleId = "b1",
  moveId = 9,
}) {
  const { calls, bridge } = mkBridge();
  const log = { applied: [], notice: [] };
  const deps = {
    bridgeRef: { current: bridge },
    moveStateRef: { current: ms },
    battleCtxRef: {
      current:
        ctxOwner === undefined
          ? null
          : { battleId: ctxBattleId, owner: ctxOwner },
    },
    isCurrentAccount: B.isCurrentAccount,
    currentAccountOf,
    useJsPlayerStore: store.api,
    applyMoveState: (v) => log.applied.push(v),
    setMoveNotice: (v) => log.notice.push(v),
    MOVE_HERO_BLOCKED_TEXT,
    moveRejectText,
  };
  const names = Object.keys(deps);
  const f = new Function(...names, `${jsOf(commitArrow)}\nreturn __f;`)(
    ...names.map((n) => deps[n])
  );
  f(moveId, 7, 3);
  return { calls, log, touched: store.touched };
}
const A5 = OWN("shared", "test_mv_a", 5);
const c1 = runCommit({
  kind: "hero",
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 5),
});
check(
  "提交（頁面實際函式）：武將、這一場的來源是目前的帳號 → 呼叫引擎提交一次，不取消、沒有說明",
  c1.calls.commit.length === 1 &&
    same(c1.calls.commit[0], [9, 7, 3]) &&
    c1.calls.cancel.length === 0 &&
    same(c1.log.notice, [null]) &&
    c1.touched.length === 0,
  c1
);
const c2 = runCommit({
  kind: "hero",
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 6),
});
check(
  "提交：同一把金鑰的新世代 → 不提交、取消這次移動、說明換帳號前的出征",
  c2.calls.commit.length === 0 &&
    same(c2.calls.cancel, [9]) &&
    c2.log.notice.at(-1) === MOVE_HERO_BLOCKED_TEXT &&
    c2.touched.length === 0,
  c2
);
const c3 = runCommit({
  kind: "hero",
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_b", 7),
});
check(
  "提交：頁面畫面還是甲（舊 render），store 已是乙 → 用 store 的值，不提交",
  c3.calls.commit.length === 0 && same(c3.calls.cancel, [9]),
  c3
);
const c4 = runCommit({
  kind: "hero",
  ctxOwner: A5,
  store: storeOf("none", null, 6),
});
check(
  "提交：還沒選帳號 → 不提交、取消",
  c4.calls.commit.length === 0 && same(c4.calls.cancel, [9]),
  c4
);
const c5 = runCommit({
  kind: "hero",
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 5, { isLoading: true }),
});
check(
  "提交：載入中 → 不提交、取消",
  c5.calls.commit.length === 0 && same(c5.calls.cancel, [9]),
  c5
);
const c6 = runCommit({
  kind: "tower",
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_b", 7),
});
check(
  "提交：塔不因換帳號而擋 → 照常呼叫引擎提交",
  c6.calls.commit.length === 1 && c6.calls.cancel.length === 0,
  c6
);
const c7 = runCommit({
  kind: "hero",
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 5),
  ctxBattleId: "b2",
});
check(
  "提交：這次移動的場次和目前這一場不同 → 不提交、取消",
  c7.calls.commit.length === 0 && same(c7.calls.cancel, [9]),
  c7
);
const c8 = runCommit({
  kind: "tower",
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 5),
  moveId: 8,
});
check(
  "提交：舊面板或晚到的點選帶的是舊的移動編號 8（畫面上是 9）→ 不提交、也不取消新的移動、沒有說明",
  c8.calls.commit.length === 0 &&
    c8.calls.cancel.length === 0 &&
    c8.log.notice.length === 0 &&
    c8.log.applied.length === 0,
  c8
);

function runPreview({ kind, ctxOwner, store, moveId = 9 }) {
  const { calls, bridge } = mkBridge();
  const log = { applied: [], notice: [] };
  const deps = {
    bridgeRef: { current: bridge },
    moveStateRef: {
      current: { moveId: 9, battleId: "b1", kind, name: "n", targets: [] },
    },
    battleCtxRef: { current: { battleId: "b1", owner: ctxOwner } },
    isCurrentAccount: B.isCurrentAccount,
    currentAccountOf,
    useJsPlayerStore: store.api,
    applyMoveState: (v) => log.applied.push(v),
    setMoveNotice: (v) => log.notice.push(v),
    MOVE_HERO_BLOCKED_TEXT,
  };
  const names = Object.keys(deps);
  const f = new Function(
    ...names,
    `${jsOf(found.handleMovePreview[0])}
return __f;`
  )(...names.map((n) => deps[n]));
  f(moveId, 7, 3);
  return { calls, log, touched: store.touched };
}
const p1 = runPreview({
  kind: "hero",
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 5),
});
check(
  "選目的格（頁面實際函式）：武將、目前的帳號 → 只預覽一次，不取消、沒有說明",
  same(p1.calls.preview, [[9, 7, 3]]) &&
    p1.calls.cancel.length === 0 &&
    p1.log.notice.length === 0 &&
    p1.touched.length === 0,
  p1
);
const p2 = runPreview({
  kind: "hero",
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 6),
});
check(
  "選目的格：武將而 store 已是新的世代 → 不預覽、取消這次移動、說明換帳號前的出征",
  p2.calls.preview.length === 0 &&
    same(p2.calls.cancel, [9]) &&
    same(p2.log.applied, [null]) &&
    p2.log.notice.at(-1) === MOVE_HERO_BLOCKED_TEXT,
  p2
);
const p3 = runPreview({
  kind: "tower",
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_b", 7),
});
check(
  "選目的格：塔不因換帳號而擋 → 照常預覽",
  same(p3.calls.preview, [[9, 7, 3]]) && p3.calls.cancel.length === 0,
  p3
);
const p4 = runPreview({
  kind: "hero",
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 5),
  moveId: 8,
});
check(
  "選目的格：舊面板帶舊的移動編號 8 → 不預覽、不取消新的移動",
  p4.calls.preview.length === 0 &&
    p4.calls.cancel.length === 0 &&
    p4.log.applied.length === 0,
  p4
);

const UNIT = { tag: "hero-instance" };
function runStart({
  kind,
  cap,
  ctxOwner,
  ctxBattleId = "b1",
  store,
  beginResult = null,
  snap,
}) {
  const { calls, bridge } = mkBridge(beginResult);
  const log = {
    applied: [],
    notice: [],
    heroInfo: [],
    tower: [],
    panelSnap: [],
  };
  const deps = {
    bridgeRef: { current: bridge },
    panelUnitRef: { current: cap },
    moveStateRef: { current: null },
    setPanelSnap: (v) => log.panelSnap.push(v),
    battleCtxRef: {
      current:
        ctxOwner === undefined
          ? null
          : { battleId: ctxBattleId, owner: ctxOwner },
    },
    setMoveNotice: (v) => log.notice.push(v),
    isCurrentAccount: B.isCurrentAccount,
    currentAccountOf,
    useJsPlayerStore: store.api,
    MOVE_HERO_BLOCKED_TEXT,
    moveRejectText,
    setHeroInfo: (v) => log.heroInfo.push(v),
    setUpgradeTower: (v) => log.tower.push(v),
    applyMoveState: (v) => log.applied.push(v),
  };
  const names = Object.keys(deps);
  const f = new Function(
    ...names,
    `${jsOf(found.handleMoveStart[0])}\nreturn __f;`
  )(...names.map((n) => deps[n]));
  f(kind, snap === undefined ? cap : snap);
  return { calls, log, touched: store.touched };
}
const CAP = (kind, battleId = "b1") => ({
  kind,
  unit: UNIT,
  battleId,
  from: { col: 3, row: 3 },
});
const s1 = runStart({
  kind: "hero",
  cap: CAP("hero"),
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 5),
});
check(
  "開始（頁面實際函式）：用面板打開時捕捉的實例、場次與來源格呼叫引擎；成功後關掉武將資訊、進入移位模式（帶合法目的格）",
  s1.calls.begin.length === 1 &&
    s1.calls.begin[0][0] === "b1" &&
    s1.calls.begin[0][1] === "hero" &&
    s1.calls.begin[0][2] === UNIT &&
    same(s1.calls.begin[0][3], { col: 3, row: 3 }) &&
    same(s1.log.heroInfo, [null]) &&
    s1.log.applied.length === 1 &&
    s1.log.applied[0].moveId === 9 &&
    same(s1.log.applied[0].targets, [{ col: 7, row: 3, terrain: "road" }]) &&
    s1.touched.length === 0,
  s1
);
const s2 = runStart({
  kind: "hero",
  cap: CAP("hero"),
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 6),
});
check(
  "開始：武將而 store 已是新的世代 → 不呼叫引擎、不關面板、說明換帳號前的出征",
  s2.calls.begin.length === 0 &&
    s2.log.heroInfo.length === 0 &&
    s2.log.notice.at(-1) === MOVE_HERO_BLOCKED_TEXT,
  s2
);
const s3 = runStart({
  kind: "tower",
  cap: CAP("tower"),
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_b", 7),
});
check(
  "開始：塔不因換帳號而擋 → 呼叫引擎、關掉塔的面板",
  s3.calls.begin.length === 1 && same(s3.log.tower, [null]),
  s3
);
const s4 = runStart({
  kind: "hero",
  cap: CAP("hero", "b0"),
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 5),
});
check(
  "開始：面板是上一場打開的（場次不同）→ 不呼叫引擎、請重新點選",
  s4.calls.begin.length === 0 &&
    s4.log.notice.at(-1) === "請重新點選要移動的單位。",
  s4
);
const s5 = runStart({
  kind: "tower",
  cap: CAP("hero"),
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 5),
});
check(
  "開始：捕捉的是武將但按的是塔的移動 → 不呼叫引擎",
  s5.calls.begin.length === 0,
  s5
);
const s7 = runStart({
  kind: "hero",
  cap: CAP("hero"),
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 5),
  snap: { ...CAP("hero"), unit: { tag: "another-instance" } },
});
check(
  "開始：面板顯示的不是捕捉的那個實例 → 不呼叫引擎、請重新點選",
  s7.calls.begin.length === 0 &&
    s7.log.notice.at(-1) === "請重新點選要移動的單位。",
  s7
);
const s6 = runStart({
  kind: "hero",
  cap: CAP("hero"),
  ctxOwner: A5,
  store: storeOf("shared", "test_mv_a", 5),
  beginResult: { ok: false, reason: "not_prep" },
});
check(
  "開始：引擎不接受（not_prep）→ 不關面板、不進入移位模式、說明只有備戰時可以移動",
  s6.log.heroInfo.length === 0 &&
    s6.log.applied.length === 0 &&
    s6.log.notice.at(-1) === "只有備戰時可以移動。",
  s6
);

// ═══ M8：同一個實例重新打開面板（R100-1）：真 Engine＋頁面實際的 openPanelSnapshot、handleMoveStart、handleUnitPanelClose，以及兩個面板 JSX 上的 onMove／onClose 原文 ═══
// 受控：按鈕是照頁面 JSX 原文重建、綁定「那一次 render 的 panelSnap」的函式；「晚到」是測試直接呼叫保留的舊按鈕函式（等同舊面板的按鈕晚一拍還能按），
// 不是自然的瀏覽器競態。落點用引擎的 commitMove（等同畫布點擊之後的提交）；移位結束時照頁面 onMoveEnded 的規則清掉畫面上的移動（測試側重寫，標明）
const found8 = { openPanelSnapshot: [], handleUnitPanelClose: [] };
const jsx8 = { HeroInfoModal: {}, UpgradePanelModal: {} };
(function walk8(n) {
  if (
    ts.isVariableDeclaration(n) &&
    ts.isIdentifier(n.name) &&
    n.name.text in found8 &&
    n.initializer
  )
    found8[n.name.text].push(n.initializer);
  if (
    (ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) &&
    n.tagName.getText(sf) in jsx8
  ) {
    for (const a of n.attributes.properties) {
      const an = ts.isJsxAttribute(a) ? a.name.getText(sf) : "";
      if (
        (an === "onMove" || an === "onClose") &&
        a.initializer &&
        ts.isJsxExpression(a.initializer)
      )
        (jsx8[n.tagName.getText(sf)][an] ||= []).push(a.initializer.expression);
    }
  }
  ts.forEachChild(n, walk8);
})(sf);
check(
  "取出頁面的 openPanelSnapshot、handleUnitPanelClose，以及武將資訊與塔面板 JSX 上的 onMove、onClose（各剛好一個）",
  Object.values(found8).every((v) => v.length === 1) &&
    Object.values(jsx8).every(
      (o) => o.onMove?.length === 1 && o.onClose?.length === 1
    ),
  {
    found8: Object.fromEntries(
      Object.entries(found8).map(([k, v]) => [k, v.length])
    ),
    jsx8: Object.fromEntries(
      Object.entries(jsx8).map(([k, o]) => [
        k,
        [o.onMove?.length ?? 0, o.onClose?.length ?? 0],
      ])
    ),
  }
);
/** 這一場、場上、進行中的移動、虛影與高亮（舊按鈕前後要完全相同） */
const view8 = (e) => ({
  field: snap(e),
  move: e.getMoveState(),
  ghost: e.dragGhost ? { ...e.dragGhost } : null,
  highlight: e.highlightCell ? { ...e.highlightCell } : null,
});
/** 一個場上有一位馬超（3,3）或一座弓兵塔（2,1）的真 Engine，加上用它當 bridge 的頁面函式 */
function setup8(kind, battleId) {
  const e = mkEngine(battleId);
  let unit;
  if (kind === "hero") {
    e.placeHero(3, 3, MA);
    unit = heroAt(e, 3, 3);
  } else {
    e.placeTower(2, 1, "archer");
    unit = e.towers[0];
  }
  const st = {
    begins: [],
    cancels: [],
    ended: [],
    notice: [],
    heroInfo: [],
    tower: [],
    panelSnap: [],
    applied: [],
  };
  const refs = {
    panelUnitRef: { current: null },
    panelSeqRef: { current: 0 },
    moveStateRef: { current: null },
  };
  e.onMoveEnded = (info) => {
    st.ended.push(info);
    // 頁面 onMoveEnded 的規則（測試側重寫）：只清畫面上正是這一次的移動
    const ms = refs.moveStateRef.current;
    if (ms && ms.moveId === info.moveId && ms.battleId === info.battleId)
      refs.moveStateRef.current = null;
  };
  const bridge = {
    beginMove: (...a) => (st.begins.push(a), e.beginMove(...a)),
    listMoveTargets: (id) => e.listMoveTargets(id),
    cancelMove: (id) => (st.cancels.push(id), e.cancelMove(id)),
  };
  const deps = {
    bridgeRef: { current: bridge },
    battleCtxRef: { current: { battleId, owner: A5 } },
    ...refs,
    setMoveNotice: (v) => st.notice.push(v),
    setPanelSnap: (v) => st.panelSnap.push(v),
    setHeroInfo: (v) => st.heroInfo.push(v),
    setUpgradeTower: (v) => st.tower.push(v),
    applyMoveState: (v) => {
      refs.moveStateRef.current = v;
      st.applied.push(v);
    },
    isCurrentAccount: B.isCurrentAccount,
    currentAccountOf,
    useJsPlayerStore: storeOf("shared", "test_mv_a", 5).api,
    MOVE_HERO_BLOCKED_TEXT,
    moveRejectText,
  };
  const mk = (node, extra = {}) => {
    const d = { ...deps, ...extra };
    const names = Object.keys(d);
    return new Function(...names, `${jsOf(node)}\nreturn __f;`)(
      ...names.map((n) => d[n])
    );
  };
  const openPanelSnapshot = mk(found8.openPanelSnapshot[0]);
  const handleMoveStart = mk(found.handleMoveStart[0]);
  const handleUnitPanelClose = mk(found8.handleUnitPanelClose[0]);
  const tag = kind === "hero" ? "HeroInfoModal" : "UpgradePanelModal";
  /** 打開面板（引擎點選單位時頁面做的事），回傳這一次 render 的面板按鈕（照 JSX 原文，panelSnap＝這一次的值） */
  const open = () => {
    openPanelSnapshot(kind, unit, battleId);
    const panelSnap = st.panelSnap.at(-1) ?? null;
    return {
      panelSnap,
      onMove: mk(jsx8[tag].onMove[0], { handleMoveStart, panelSnap }),
      onClose: mk(jsx8[tag].onClose[0], { handleUnitPanelClose, panelSnap }),
    };
  };
  return { e, unit, st, refs, open };
}
const at8 = (u) => [u.gridCell.col, u.gridCell.row];
for (const kind of ["hero", "tower"]) {
  const L = kind === "hero" ? "武將" : "塔";
  const [A, Bc, Cc] =
    kind === "hero"
      ? [
          [3, 3],
          [5, 3],
          [7, 3],
        ]
      : [
          [2, 1],
          [4, 1],
          [6, 1],
        ];
  // 1. 同一實例 A→B 後重開並開始新的移動；舊面板的「移動」晚到
  {
    const g = setup8(kind, `m8a_${kind}`);
    const p1 = g.open();
    p1.onMove();
    const first = g.e.getMoveState();
    const moved = first ? g.e.commitMove(first.moveId, Bc[0], Bc[1]) : null;
    check(
      `${L}（R100-1）：第一次面板的「移動」照常開始，落點後同一個實例到 B`,
      g.st.begins.length === 1 &&
        !!moved &&
        moved.ok &&
        same(at8(g.unit), Bc) &&
        g.refs.moveStateRef.current === null,
      { begins: g.st.begins.length, moved, at: at8(g.unit) }
    );
    const p2 = g.open();
    p2.onMove();
    const before = view8(g.e);
    const counts = [
      g.st.begins.length,
      g.st.cancels.length,
      g.st.ended.length,
      g.st.notice.length,
      g.st.applied.length,
    ];
    p1.onMove();
    const after = view8(g.e);
    check(
      `${L}（R100-1）：同一實例在 B 重開面板並開始新的移動後，受控呼叫第一次面板的「移動」→ 不呼叫 beginMove、不取消，新的移動（編號、來源格 B）、虛影、高亮、選取與場上完全不變，沒有新的說明`,
      p1.panelSnap.unit === p2.panelSnap.unit &&
        p1.panelSnap !== p2.panelSnap &&
        !!before.move &&
        same(before.move.from, { col: Bc[0], row: Bc[1] }) &&
        same(
          [
            g.st.begins.length,
            g.st.cancels.length,
            g.st.ended.length,
            g.st.notice.length,
            g.st.applied.length,
          ],
          counts
        ) &&
        same(after, before),
      { counts, after: g.st, before, afterView: after }
    );
    const done = before.move
      ? g.e.commitMove(before.move.moveId, Cc[0], Cc[1])
      : null;
    check(
      `${L}（R100-1）：新的移動（第二次面板）之後照常移到 C`,
      !!done && done.ok && same(at8(g.unit), Cc),
      { done, at: at8(g.unit) }
    );
  }
  // 2. 同一實例、同一格：關閉後重開（兩次面板要能區分）
  {
    const g = setup8(kind, `m8b_${kind}`);
    const p1 = g.open();
    p1.onClose();
    const p2 = g.open();
    p2.onMove();
    const before = view8(g.e);
    const nBegin = g.st.begins.length;
    const nNotice = g.st.notice.length;
    p1.onMove();
    check(
      `${L}（R100-1）：同一實例同一格關閉後重開（兩次快照不同、來源格相同），新面板開始移動後受控呼叫舊面板的「移動」→ 不呼叫 beginMove、新的移動與場上不變、沒有新的說明`,
      p1.panelSnap !== p2.panelSnap &&
        p1.panelSnap.seq !== p2.panelSnap.seq &&
        same(p1.panelSnap.from, p2.panelSnap.from) &&
        p1.panelSnap.unit === p2.panelSnap.unit &&
        nBegin === 1 &&
        !!before.move &&
        g.st.begins.length === 1 &&
        g.st.cancels.length === 0 &&
        g.st.notice.length === nNotice &&
        same(view8(g.e), before),
      { p1: p1.panelSnap, p2: p2.panelSnap, st: g.st }
    );
  }
  // 3. 關閉後沒有重開
  {
    const g = setup8(kind, `m8c_${kind}`);
    const p1 = g.open();
    p1.onClose();
    const before = view8(g.e);
    p1.onMove();
    check(
      `${L}（R100-1）：關閉面板後（沒有重開）受控呼叫它的「移動」→ 不呼叫 beginMove、沒有移動、場上不變，說明「請重新點選要移動的單位。」`,
      g.st.begins.length === 0 &&
        g.refs.panelUnitRef.current === null &&
        same(view8(g.e), before) &&
        before.move === null &&
        g.st.notice.at(-1) === "請重新點選要移動的單位。" &&
        same(at8(g.unit), A),
      { st: g.st }
    );
  }
  // 4. 開始成功後同一個按鈕重播
  {
    const g = setup8(kind, `m8d_${kind}`);
    const p1 = g.open();
    p1.onMove();
    const before = view8(g.e);
    const nNotice = g.st.notice.length;
    p1.onMove();
    check(
      `${L}（R100-1）：開始移動成功後（面板快照已消費）重播同一個「移動」→ 不再呼叫 beginMove、不取消，移動編號與場上不變、沒有新的說明`,
      g.refs.panelUnitRef.current === null &&
        !!before.move &&
        g.st.begins.length === 1 &&
        g.st.cancels.length === 0 &&
        g.st.notice.length === nNotice &&
        same(view8(g.e), before),
      { st: g.st, before }
    );
  }
  // 5. 舊面板晚到的關閉不能關新的面板、不能動新的快照或移動
  {
    const g = setup8(kind, `m8e_${kind}`);
    const p1 = g.open();
    const p2 = g.open();
    const panelsBefore = [g.st.heroInfo.length, g.st.tower.length];
    p1.onClose();
    const stillNew = g.refs.panelUnitRef.current === p2.panelSnap;
    const panelsAfterOldClose = [g.st.heroInfo.length, g.st.tower.length];
    p2.onMove();
    const before = view8(g.e);
    p1.onClose();
    check(
      `${L}（R100-1）：受控呼叫舊面板的關閉 → 不關新的面板、新的快照仍有效；新面板的「移動」照常開始，之後舊的關閉再到也不取消新的移動`,
      stillNew &&
        same(panelsAfterOldClose, panelsBefore) &&
        g.st.begins.length === 1 &&
        !!before.move &&
        g.st.cancels.length === 0 &&
        same(view8(g.e), before),
      { stillNew, panelsBefore, panelsAfterOldClose, st: g.st }
    );
  }
  // 7. 關閉後重開的新面板還沒按「移動」時，舊面板的「移動」晚到
  {
    const g = setup8(kind, `m8g_${kind}`);
    const p1 = g.open();
    p1.onClose();
    const p2 = g.open();
    const panels = [g.st.heroInfo.length, g.st.tower.length];
    const before = view8(g.e);
    p1.onMove();
    const stale = {
      begins: g.st.begins.length,
      active: g.refs.panelUnitRef.current === p2.panelSnap,
      panels: [g.st.heroInfo.length, g.st.tower.length],
      same: same(view8(g.e), before),
      notice: g.st.notice.at(-1),
    };
    p2.onMove();
    check(
      `${L}（R100-1）：同一實例關閉後重開、新面板還沒按「移動」時受控呼叫舊面板的「移動」→ 不呼叫 beginMove、新面板的快照仍有效、不關新面板、場上不變（說明請重新點選）；之後新面板的「移動」照常開始`,
      stale.begins === 0 &&
        stale.active &&
        same(stale.panels, panels) &&
        stale.same &&
        stale.notice === "請重新點選要移動的單位。" &&
        g.st.begins.length === 1 &&
        !!g.e.getMoveState(),
      { stale, st: g.st }
    );
  }
  // 6. 目前的新面板正常開始（正向）
  {
    const g = setup8(kind, `m8f_${kind}`);
    g.open();
    const p2 = g.open();
    p2.onMove();
    const ms = g.e.getMoveState();
    const moved = ms ? g.e.commitMove(ms.moveId, Bc[0], Bc[1]) : null;
    check(
      `${L}（R100-1）：目前的面板（同一實例第二次打開）「移動」照常：呼叫 beginMove 一次、來源格 A、快照被消費、關掉面板，落點後到 B`,
      g.st.begins.length === 1 &&
        same(g.st.begins[0][3], { col: A[0], row: A[1] }) &&
        g.st.begins[0][2] === g.unit &&
        g.refs.panelUnitRef.current === null &&
        (kind === "hero"
          ? same(g.st.heroInfo, [null])
          : same(g.st.tower, [null])) &&
        !!moved &&
        moved.ok &&
        same(at8(g.unit), Bc),
      { st: g.st, moved }
    );
  }
}

const failed = results.filter((r) => !r.pass).length;
console.log(
  `RESULT_JSON ${JSON.stringify({ script: "unitMovement.test.mjs", pass: failed === 0, assertions: { passed: results.length - failed, total: results.length } })}`
);
process.exit(failed ? 1 : 0);
