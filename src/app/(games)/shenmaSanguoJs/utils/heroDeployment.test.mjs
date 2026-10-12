// 神馬三國 JS 版武將的部署唯一性、陣亡後重派與合法的 0 數值（純 Node、不連網）
// - 用真正的 engine/BattleEngine.ts 入口（placeHero／placeTower／handleCellClick）與 engine/entities/HeroEntity.ts（建構與 takeDamage），
//   期待值照 Godot 版 Main._place_hero／_on_hero_died 與 Hero.setup（缺值時生命 1000、攻擊 100、防禦 50）手寫，不由被測的程式產生
// - 假的依賴只有畫面：BattleEngine 傳入一個什麼都不畫的 renderer（不建立 CanvasRenderer、不啟動遊戲迴圈）；音效在 Node 沒有 AudioContext，照原本的程式靜默略過
// - 陣亡用受控的 takeDamage（真正的死亡流程），不是自然通關；首擊只核紀錄（同一場重派不重設），不驗傷害
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/heroDeployment.test.mjs"
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

const { HeroEntity } = require(join(HERE, "../engine/entities/HeroEntity.ts"));
const { BattleEngine } = require(join(HERE, "../engine/BattleEngine.ts"));

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
/** 觀察的格子：道路 (3,3)、(5,3)、(7,3)，建築位 (2,1)、(4,1) */
const CELLS = [
  [3, 3],
  [5, 3],
  [7, 3],
  [2, 1],
  [4, 1],
];
const MA = { hero_id: "ma_chao", level: 1, atk: 120, def: 40, hp: 900 };
const ZY = { hero_id: "zhao_yun", level: 1, atk: 90, def: 60, hp: 1100 };

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
const heroAt = (e, col, row) =>
  e.heroes.find((h) => h.gridCell.col === col && h.gridCell.row === row) ||
  null;
const occLabel = (o) =>
  o === null || o === undefined
    ? null
    : o.isHero
      ? `hero:${o.heroId}`
      : o.towerUid
        ? `tower:${o.towerUid}`
        : "other";
/** 狀態快照：金幣、場上武將（識別碼、格子、陣亡）、觀察格的占用者、選取、首擊紀錄 */
const snap = (e) => ({
  gold: e.battleManager.battleGold,
  heroes: e.heroes.map((h) => [
    h.heroId,
    h.gridCell.col,
    h.gridCell.row,
    h.isDead,
  ]),
  occ: CELLS.map(([c, r]) => occLabel(e.gameMap.getOccupant(c, r))),
  selected: e.selectedUnit ? { ...e.selectedUnit } : null,
  firstStrike: [...e.battleManager.firstStrikeUsed],
});
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** 受控的真正陣亡：一次給足以打倒的傷害（走 HeroEntity.takeDamage 的死亡流程） */
const kill = (e, hero) =>
  hero.takeDamage(1e9, null, e.floatingTexts, e.soundManager);

// ═══ H1：同一位武將還活著時不能再派（引擎入口，不靠部署選單停用） ═══
{
  const e = mkEngine("b1");
  const ok = e.placeHero(3, 3, MA);
  const h = heroAt(e, 3, 3);
  check(
    "派出馬超到道路 (3,3)：成功、占用者是這個實例、金幣不變（免費）",
    ok === true &&
      !!h &&
      h.heroId === "ma_chao" &&
      e.gameMap.getOccupant(3, 3) === h &&
      e.battleManager.battleGold === 5000 &&
      same([...e.getAliveHeroIds()], ["ma_chao"]),
    { ok, gold: e.battleManager.battleGold, alive: e.getAliveHeroIds() }
  );
  e.placeTower(4, 1, "archer");
  select(e, 3, 3);
  const s0 = snap(e);
  const r1 = e.placeHero(5, 3, MA);
  check(
    "馬超還在場上：再派到別的道路 (5,3) 被拒，金幣、武將、格子、選取、塔都不變",
    r1 === false && same(snap(e), s0),
    { r1, before: s0, after: snap(e) }
  );
  const r2 = e.placeHero(3, 3, MA);
  check(
    "馬超還在場上：再派到同一格 (3,3) 被拒，狀態不變",
    r2 === false && same(snap(e), s0),
    { r2, before: s0, after: snap(e) }
  );
  const r3 = e.placeHero(2, 1, { ...MA, atk: 999 });
  check(
    "馬超還在場上：換一份數值派到建築位 (2,1) 也被拒，狀態不變",
    r3 === false && same(snap(e), s0),
    { r3, before: s0, after: snap(e) }
  );
  const r4 = e.placeHero(5, 3, ZY);
  check(
    "另一位武將（趙雲）派到 (5,3)：成功，馬超、塔與選取不受影響",
    r4 === true &&
      e.heroes.length === 2 &&
      heroAt(e, 3, 3) === h &&
      occLabel(e.gameMap.getOccupant(4, 1)) === "tower:tower_1" &&
      same(e.selectedUnit, s0.selected) &&
      same([...e.getAliveHeroIds()], ["ma_chao", "zhao_yun"]),
    { r4, after: snap(e) }
  );
}
// 無效的武將識別碼：不建立武將、不占格子
for (const [label, state] of [
  ["空字串", { ...MA, hero_id: "" }],
  ["只有空白", { ...MA, hero_id: "   " }],
  ["缺 hero_id", { level: 1, atk: 120, def: 40, hp: 900 }],
  ["hero_id 是 null", { ...MA, hero_id: null }],
  ["hero_id 是數字", { ...MA, hero_id: 5 }],
  ["沒有武將資料（null）", null],
]) {
  const e = mkEngine("b1");
  const s0 = snap(e);
  let r;
  let threw = null;
  try {
    r = e.placeHero(3, 3, state);
  } catch (err) {
    threw = String(err);
  }
  check(
    `無效的武將識別碼（${label}）：拒絕，不建立武將、不占格子，狀態不變`,
    !threw &&
      r === false &&
      same(snap(e), s0) &&
      e.getAliveHeroIds().length === 0,
    { threw, r, before: s0, after: snap(e) }
  );
}

// ═══ H2：陣亡後清場、通知與同一場重派（首擊紀錄保留） ═══
{
  const e = mkEngine("b1");
  const events = [];
  e.onHeroRosterChanged = (info) => events.push(info);
  e.placeHero(3, 3, MA);
  e.placeHero(5, 3, ZY);
  const ma = heroAt(e, 3, 3);
  const zy = heroAt(e, 5, 3);
  // 受控：這一場馬超已經用過首擊（只核紀錄）
  e.battleManager.consumeFirstStrike("ma_chao", 240);
  const fs0 = [...e.battleManager.firstStrikeUsed];
  select(e, 3, 3);
  check(
    "前置：馬超 (3,3)、趙雲 (5,3)，選取馬超，首擊紀錄有馬超 240",
    same(e.selectedUnit, { type: "hero", id: "ma_chao", col: 3, row: 3 }) &&
      same(fs0, [["ma_chao", 240]]),
    { selected: e.selectedUnit, fs0 }
  );
  kill(e, ma);
  const ev = events[0];
  check(
    "馬超陣亡：標記陣亡、從場上移除、(3,3) 釋放、取消選取（選的是它）",
    ma.isDead === true &&
      ma.currentHp === 0 &&
      !e.heroes.includes(ma) &&
      !e.gameMap.isOccupied(3, 3) &&
      e.selectedUnit === null,
    {
      isDead: ma.isDead,
      hp: ma.currentHp,
      inHeroes: e.heroes.includes(ma),
      occ: occLabel(e.gameMap.getOccupant(3, 3)),
      selected: e.selectedUnit,
    }
  );
  check(
    "陣亡通知一次：這一場 b1、還活著的只剩趙雲（凍結的複本）、剛陣亡的是馬超這個實例",
    events.length === 1 &&
      ev.battleId === "b1" &&
      same([...ev.aliveHeroIds], ["zhao_yun"]) &&
      Object.isFrozen(ev.aliveHeroIds) &&
      ev.aliveHeroIds !== e.heroes &&
      ev.died === ma,
    {
      n: events.length,
      battleId: ev && ev.battleId,
      alive: ev && ev.aliveHeroIds,
      frozen: ev && Object.isFrozen(ev.aliveHeroIds),
      diedIsMa: ev && ev.died === ma,
    }
  );
  check(
    "趙雲不受影響：仍在 (5,3)、占用者是它",
    e.heroes.includes(zy) && e.gameMap.getOccupant(5, 3) === zy,
    { occ: occLabel(e.gameMap.getOccupant(5, 3)) }
  );
  const ok = e.placeHero(3, 3, MA);
  const ma2 = heroAt(e, 3, 3);
  check(
    "同一場：陣亡的馬超可以再派到同一格 (3,3)（新的實例、免費），首擊紀錄逐字不變",
    ok === true &&
      !!ma2 &&
      ma2 !== ma &&
      ma2.heroId === "ma_chao" &&
      e.gameMap.getOccupant(3, 3) === ma2 &&
      e.battleManager.battleGold === 5000 &&
      same([...e.battleManager.firstStrikeUsed], fs0) &&
      same([...e.getAliveHeroIds()], ["zhao_yun", "ma_chao"]),
    {
      ok,
      newInstance: ma2 !== ma,
      gold: e.battleManager.battleGold,
      fs: [...e.battleManager.firstStrikeUsed],
      alive: e.getAliveHeroIds(),
    }
  );
  const r2 = e.placeHero(7, 3, MA);
  check(
    "重派後馬超又在場上：再派到 (7,3) 被拒",
    r2 === false && e.heroes.filter((h) => h.heroId === "ma_chao").length === 1,
    { r2, heroes: snap(e).heroes }
  );
  select(e, 3, 3);
  const s1 = snap(e);
  const n1 = events.length;
  // 舊實例重複的陣亡通知（受控：再呼叫一次它的回呼）
  ma.onHeroDied(ma);
  kill(e, ma);
  check(
    "舊實例重複或晚到的陣亡通知：不移除同一位武將的新實例、不釋放 (3,3)、不取消新的選取、不再通知",
    same(snap(e), s1) &&
      e.heroes.includes(ma2) &&
      e.gameMap.getOccupant(3, 3) === ma2 &&
      events.length === n1,
    { before: s1, after: snap(e), events: events.length - n1 }
  );
  // 陣亡的不是選取中的武將：不取消別人的選取
  select(e, 3, 3);
  const n2 = events.length;
  kill(e, zy);
  const last = events.length > n2 ? events[events.length - 1] : null;
  check(
    "趙雲陣亡時選的是馬超：選取保留，只釋放 (5,3)，通知只剩馬超",
    same(e.selectedUnit, { type: "hero", id: "ma_chao", col: 3, row: 3 }) &&
      !e.gameMap.isOccupied(5, 3) &&
      e.gameMap.getOccupant(3, 3) === ma2 &&
      !!last &&
      same([...last.aliveHeroIds], ["ma_chao"]),
    { selected: e.selectedUnit, newEvents: events.length - n2, last }
  );
}
// 格子的占用者已經不是陣亡的那個實例：不能清掉（受控：直接換成別的占用者，模擬格子已經有新的單位）
{
  const e = mkEngine("b1");
  e.placeHero(3, 3, MA);
  const ma = heroAt(e, 3, 3);
  const other = { isHero: true, heroId: "placeholder", isDead: false };
  e.gameMap.setOccupied(3, 3, other);
  kill(e, ma);
  check(
    "陣亡時格子的占用者已經是別的單位：不清掉那個占用者，馬超照樣從場上移除",
    e.gameMap.getOccupant(3, 3) === other && !e.heroes.includes(ma),
    {
      occ: occLabel(e.gameMap.getOccupant(3, 3)),
      inHeroes: e.heroes.includes(ma),
    }
  );
}
// 換一場（同一個引擎）：上一場的武將晚到的陣亡不影響新的一場
{
  const e = mkEngine("b1");
  const events = [];
  e.onHeroRosterChanged = (info) => events.push(info);
  e.placeHero(3, 3, MA);
  const oldMa = heroAt(e, 3, 3);
  load(e, "b2");
  e.placeHero(3, 3, MA);
  const newMa = heroAt(e, 3, 3);
  select(e, 3, 3);
  const s0 = snap(e);
  kill(e, oldMa);
  check(
    "新的一場 b2 派了同一位馬超到同一格；上一場 b1 的馬超晚到陣亡：新場的馬超、格子、選取不變，不通知",
    newMa !== oldMa &&
      same(snap(e), s0) &&
      e.gameMap.getOccupant(3, 3) === newMa &&
      events.length === 0,
    { before: s0, after: snap(e), events: events.length }
  );
}

// ═══ H3：生命、攻擊、防禦的合法 0 與缺值（HeroEntity 建構；期待值照 Godot Hero.setup 手寫） ═══
const mkHero = (state) =>
  new HeroEntity(
    { hero_id: "ma_chao", ...state },
    [],
    { col: 0, row: 0 },
    { x: 0, y: 0 },
    false
  );
const stats = (h) => ({
  hp: h.currentHp,
  maxHp: h.maxHp,
  atk: h.atk,
  def: h.defStat,
});
for (const [label, state, want] of [
  ["都是 0", { hp: 0, atk: 0, def: 0 }, { hp: 0, maxHp: 0, atk: 0, def: 0 }],
  [
    "正值",
    { hp: 900, atk: 120, def: 40 },
    { hp: 900, maxHp: 900, atk: 120, def: 40 },
  ],
  ["缺值", {}, { hp: 1000, maxHp: 1000, atk: 100, def: 50 }],
  [
    "null",
    { hp: null, atk: null, def: null },
    { hp: 1000, maxHp: 1000, atk: 100, def: 50 },
  ],
  [
    "空字串",
    { hp: "", atk: "", def: "" },
    { hp: 1000, maxHp: 1000, atk: 100, def: 50 },
  ],
  [
    "只有空白的字串",
    { hp: "  ", atk: "  ", def: "  " },
    { hp: 1000, maxHp: 1000, atk: 100, def: 50 },
  ],
  [
    "NaN",
    { hp: NaN, atk: NaN, def: NaN },
    { hp: 1000, maxHp: 1000, atk: 100, def: 50 },
  ],
  [
    "無限大",
    { hp: Infinity, atk: Infinity, def: Infinity },
    { hp: 1000, maxHp: 1000, atk: 100, def: 50 },
  ],
  [
    "負數",
    { hp: -1, atk: -5, def: -10 },
    { hp: 1000, maxHp: 1000, atk: 100, def: 50 },
  ],
  [
    "非數字的字串",
    { hp: "abc", atk: "x", def: "?" },
    { hp: 1000, maxHp: 1000, atk: 100, def: 50 },
  ],
  [
    "數字字串（含 0）",
    { hp: "0", atk: "250", def: "0" },
    { hp: 0, maxHp: 0, atk: 250, def: 0 },
  ],
  [
    "只有 hp 是 0",
    { hp: 0, atk: 120, def: 40 },
    { hp: 0, maxHp: 0, atk: 120, def: 40 },
  ],
  [
    "只有 atk 是 0",
    { hp: 900, atk: 0, def: 40 },
    { hp: 900, maxHp: 900, atk: 0, def: 40 },
  ],
]) {
  const got = stats(mkHero(state));
  check(
    `數值${label}：生命 ${want.hp}／最大 ${want.maxHp}、攻擊 ${want.atk}、防禦 ${want.def}`,
    same(got, want),
    { state: String(JSON.stringify(state)), got, want }
  );
}
{
  // 引擎入口：0 生命的武將照樣派出，數值保留 0（不換成預設 1000）
  const e = mkEngine("b1");
  const ok = e.placeHero(3, 3, { hero_id: "zhao_yun", hp: 0, atk: 0, def: 0 });
  const h = heroAt(e, 3, 3);
  check(
    "引擎入口派出 0 生命／0 攻擊／0 防禦的趙雲：成功，數值都是 0",
    ok === true && !!h && same(stats(h), { hp: 0, maxHp: 0, atk: 0, def: 0 }),
    { ok, stats: h && stats(h) }
  );
  // 既有生命週期（和 Godot Hero.take_damage 相同：生命已經 ≤ 0 時受傷直接略過）：不會因此陣亡、不通知；本輪不新增特殊死亡或復活規則
  const events = [];
  e.onHeroRosterChanged = (info) => events.push(info);
  h.takeDamage(100, null, e.floatingTexts, e.soundManager);
  check(
    "0 生命的武將受傷：照既有規則略過（生命仍 0、沒有陣亡、仍在場上、不通知）",
    h.currentHp === 0 &&
      h.isDead === false &&
      e.heroes.includes(h) &&
      events.length === 0,
    { hp: h.currentHp, isDead: h.isDead, events: events.length }
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
