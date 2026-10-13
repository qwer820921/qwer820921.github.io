// 神馬三國 JS 版同一場的動態隊伍同步（純 Node、不連網）
// - 用真正的 engine/BattleEngine.ts（syncTeam、placeHero、placeTower、handleCellClick、陣亡流程）、engine/entities/HeroEntity.ts（applyStatUpdate、
//   建構、光環、takeDamage）、engine/entities/EnemyEntity.ts（update 的阻擋與位移）與 engine/BattleManager.ts；期待值照 Godot 版
//   Main.update_team（先 Hero.apply_stat_update 再移除不在隊伍裡的武將）與 Round96 的裁示手寫，不由被測的程式產生
// - 假的依賴只有畫面：BattleEngine 傳入什麼都不畫的 renderer（不建立 CanvasRenderer、不啟動遊戲迴圈）；音效在 Node 沒有 AudioContext，照原本的程式靜默略過
// - 合成或受控的部分都標明：武將設定、技能參數、敵人是合成資料；生命、冷卻、收到的加成、首擊紀錄、階段（setState／setPaused／endBattle）是受控設定，
//   不是自然戰鬥。帳號世代的部分用真正的 store（store/useJsPlayerStore.ts 的 getAccountEpoch），後端是 tests/profile-contract-fixture.mjs 包成假的 fetch
// - 所有金鑰都是虛構的 test_*
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/teamSync.test.mjs"
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

// ── 帳號世代的部分要的假環境（瀏覽器儲存是記憶體物件；後端是 fixture） ──
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

const { HeroEntity } = require(join(HERE, "../engine/entities/HeroEntity.ts"));
const { EnemyEntity } = require(
  join(HERE, "../engine/entities/EnemyEntity.ts")
);
const { BattleEngine } = require(join(HERE, "../engine/BattleEngine.ts"));
const { GameState } = require(join(HERE, "../engine/BattleManager.ts"));
const { StageDataManager } = require(
  join(HERE, "../engine/StageDataManager.ts")
);

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
const near = (a, b) => Math.abs(a - b) < 1e-9;

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
/** 觀察的格子：道路 (3,3)、(5,3)、(7,3)，建築位 (2,1)、(4,1)、(6,1) */
const CELLS = [
  [3, 3],
  [5, 3],
  [7, 3],
  [2, 1],
  [4, 1],
  [6, 1],
];
/** 合成的武將設定：射程 2 格（每級＋0.1）、攻擊間隔 1.0 秒（每級 −5%）；光環測試用射程 10 格的武將 */
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
  cfg("hero_huang_zhong", { job: "archer" }),
  cfg("hero_liu_bei", { attack_range: 10 }),
  cfg("hero_guan_yu", { attack_range: 10 }),
  cfg("hero_cao_cao", { attack_range: 10 }),
  cfg("hero_yan_liang", { attack_range: 10 }),
  cfg("hero_zhang_fei", { attack_range: 10 }),
  cfg("hero_wei_yan", { attack_range: 10 }),
  cfg("hero_lv_bu", { attack_range: 10 }),
  cfg("hero_dian_wei", { attack_range: 10 }),
];
/** 合成的技能參數（Canvas 的 13 種），以及 HeroEntity 讀進去後各欄位應有的字面值 */
const SKILLS = [
  [
    "first_strike",
    { first_attack_multiplier: 2 },
    { firstStrikeMultiplier: 2 },
  ],
  ["long_range", { range_multiplier: 1.5 }, { rangeMultiplier: 1.5 }],
  [
    "burn",
    { burn_ratio: 0.2, burn_ticks: 3, burn_interval: 1 },
    { burnRatio: 0.2, burnTicks: 3, burnInterval: 1 },
  ],
  ["slow_aura", { slow_mult: 0.9 }, { slowAuraMult: 0.9 }],
  ["dodge", { dodge_chance: 0.2 }, { dodgeChance: 0.2 }],
  ["def_aura", { def_mult: 1.2 }, { defAuraMult: 1.2 }],
  ["stun", { stun_sec: 0.5 }, { stunDuration: 0.5 }],
  ["lifesteal", { lifesteal_ratio: 0.1 }, { lifestealRatio: 0.1 }],
  ["atk_speed_aura", { atk_speed_mult: 1.15 }, { atkSpeedAuraMult: 1.15 }],
  ["counter", { counter_ratio: 0.2 }, { counterRatio: 0.2 }],
  [
    "tenacity",
    { low_hp_ratio: 0.3, damage_mult: 0.7 },
    { tenacityHpRatio: 0.3, tenacityDamageMult: 0.7 },
  ],
  ["atk_down_aura", { atk_mult: 0.9 }, { atkDownAuraMult: 0.9 }],
  ["double_shot", { double_shot_chance: 0.25 }, { doubleShotChance: 0.25 }],
];
/** 沒有技能時的 16 個參數（HeroEntity 欄位的初始值） */
const NO_SKILL = {
  firstStrikeMultiplier: 1,
  rangeMultiplier: 1,
  burnRatio: 0,
  burnTicks: 0,
  burnInterval: 1,
  slowAuraMult: 1,
  dodgeChance: 0,
  defAuraMult: 1,
  stunDuration: 0,
  lifestealRatio: 0,
  atkSpeedAuraMult: 1,
  counterRatio: 0,
  tenacityHpRatio: 0,
  tenacityDamageMult: 1,
  atkDownAuraMult: 1,
  doubleShotChance: 0,
};
const skillParams = (h) =>
  Object.fromEntries(Object.keys(NO_SKILL).map((k) => [k, h[k]]));
const skill = (id, extra = {}) => ({ id, ...extra });

const MA = {
  hero_id: "hero_ma_chao",
  level: 1,
  atk: 100,
  def: 50,
  hp: 1000,
  skill: skill("first_strike", { first_attack_multiplier: 2 }),
};
const ZY = { hero_id: "hero_zhao_yun", level: 1, atk: 90, def: 60, hp: 1100 };
const HZ = {
  hero_id: "hero_huang_zhong",
  level: 1,
  atk: 80,
  def: 30,
  hp: 800,
  skill: skill("long_range", { range_multiplier: 1.5 }),
};

function mkEngine(battleId, heroesConfig = CFG) {
  const e = new BattleEngine(RENDERER);
  load(e, battleId, heroesConfig);
  return e;
}
function load(e, battleId, heroesConfig = CFG) {
  e.loadStage({
    stageId: "chapter1_1",
    battleId,
    totalWaves: 1,
    pathJson: JSON.stringify(PATH),
    waves: [],
    heroesConfig,
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
/** 這一場的狀態快照：battleId、階段、暫停、速度、自動、部署選單、波次、時間、金幣、城防、擊殺、首擊紀錄、塔、場上武將、觀察格、選取 */
const snap = (e) => {
  const bm = e.battleManager;
  return {
    battleId: bm.battleId,
    state: bm.gameState,
    paused: bm.manualPaused,
    speed: bm.speedPref,
    auto: bm.autoMode,
    menu: bm.deployMenuId,
    wave: bm.currentWave,
    time: bm.battleTime,
    gold: bm.battleGold,
    base: bm.baseHp,
    kills: bm.kills,
    firstStrike: [...bm.firstStrikeUsed],
    towers: e.towers.map((t) => [t.towerUid, t.gridCell.col, t.gridCell.row]),
    heroes: e.heroes.map((h) => [
      h.heroId,
      h.gridCell.col,
      h.gridCell.row,
      h.isDead,
      h.heroLevel,
      h.atk,
      h.defStat,
      h.maxHp,
      h.currentHp,
      h.attackRange,
      h.attackSpeed,
      skillParams(h),
    ]),
    occ: CELLS.map(([c, r]) => occLabel(e.gameMap.getOccupant(c, r))),
    selected: e.selectedUnit ? { ...e.selectedUnit } : null,
  };
};
/** 記下名單通知（陣亡或同步） */
const watch = (e) => {
  const notes = [];
  e.onHeroRosterChanged = (info) => notes.push(info);
  return notes;
};
/** 合成敵人：放在道路格 (col,3) 的中心，往右走；血量很高、對阻擋武將的攻擊力 0（不會打死武將） */
let enemySeq = 0;
const mkEnemy = (e, col, extra = {}) => {
  const from = e.gameMap.gridToWorld(col, 3);
  const to = e.gameMap.gridToWorld(12, 3);
  const en = new EnemyEntity(
    `syn_${++enemySeq}`,
    enemySeq,
    { enemy_id: "synthetic", hp: 1e9, speed: 10, atk: 0, ...extra },
    [from, to]
  );
  e.waveManager.activeEnemies.push(en);
  return en;
};
/** 受控的一次武將更新（光環施加、道路阻擋緩速）：每位武將各呼叫一次 HeroEntity.update，不跑整個遊戲迴圈 */
const tickHeroes = (e, delta = 0.016) => {
  for (const h of [...e.heroes])
    h.update(
      delta,
      e.waveManager.activeEnemies,
      e.heroes,
      e.battleManager,
      e.floatingTexts,
      e.soundManager
    );
};

// ═══ T1：數值更新（Godot 版 apply_stat_update 的順序與比例生命） ═══
{
  const e = mkEngine("t1");
  const notes = watch(e);
  e.placeHero(3, 3, MA);
  e.placeTower(2, 1, "archer");
  const h = heroAt(e, 3, 3);
  // 受控前置：生命 600／1000、攻擊冷卻 0.37、別人加在它身上的防禦加成 1.3、這一場的首擊已用
  h.currentHp = 600;
  h.atkTimer = 0.37;
  h.applyDefFrom("other_def_src", 1.3, 5);
  const fsUsed = e.battleManager.consumeFirstStrike("hero_ma_chao", 200);
  select(e, 3, 3);
  const s0 = snap(e);
  const r = e.syncTeam("t1", [
    { ...MA, level: 2, atk: 115, def: 58, hp: 1100 },
  ]);
  check(
    "升級同步：同一個實例，生命 1000／600 → 1100／660（照舊比例、不補滿），攻擊 115、防禦 58、等級 2",
    fsUsed === true &&
      r.ok === true &&
      heroAt(e, 3, 3) === h &&
      e.heroes.length === 1 &&
      h.maxHp === 1100 &&
      h.currentHp === 660 &&
      h.atk === 115 &&
      h.defStat === 58 &&
      h.heroLevel === 2 &&
      same(r.updated, ["hero_ma_chao"]) &&
      same(r.removed, []),
    { r, hp: [h.currentHp, h.maxHp], atk: h.atk, def: h.defStat }
  );
  check(
    "升級同步：用這一場載入時的設定依新等級重算，射程 2.1 格、攻擊間隔 0.95 秒（合成設定 2＋0.1×1、1.0×(1−0.05×1)）",
    near(h.attackRange, 2.1) && near(h.attackSpeed, 0.95),
    { range: h.attackRange, interval: h.attackSpeed }
  );
  const s1 = snap(e);
  check(
    "升級同步：冷卻 0.37、格子、選取、收到的防禦加成 1.3、首擊紀錄、塔、金幣、城防、battleId、階段都不變",
    h.atkTimer === 0.37 &&
      h.defBonusMult === 1.3 &&
      same(s1.selected, s0.selected) &&
      same(s1.occ, s0.occ) &&
      same(s1.towers, s0.towers) &&
      same(s1.firstStrike, s0.firstStrike) &&
      s1.gold === s0.gold &&
      s1.base === s0.base &&
      s1.battleId === "t1" &&
      s1.state === s0.state,
    { before: s0, after: s1, atkTimer: h.atkTimer, def: h.defBonusMult }
  );
  check(
    "升級同步：通知一次（removed 是空的凍結陣列、還活著的名單不變），不是陣亡通知",
    notes.length === 1 &&
      !("died" in notes[0]) &&
      Array.isArray(notes[0].removed) &&
      notes[0].removed.length === 0 &&
      Object.isFrozen(notes[0].removed) &&
      Object.isFrozen(notes[0].aliveHeroIds) &&
      same([...notes[0].aliveHeroIds], ["hero_ma_chao"]) &&
      notes[0].battleId === "t1",
    { notes: notes.map((n) => Object.keys(n)) }
  );
  const r2 = e.syncTeam("t1", [
    { ...MA, level: 2, atk: 115, def: 58, hp: 1100 },
  ]);
  check(
    "重複同一份隊伍：沒有更新、不通知，生命 660 不漂移，冷卻、位置與選取不變",
    r2.ok === true &&
      same(r2.updated, []) &&
      same(r2.removed, []) &&
      notes.length === 1 &&
      h.currentHp === 660 &&
      h.atkTimer === 0.37 &&
      same(snap(e), s1),
    { r2, notes: notes.length, hp: h.currentHp }
  );
  // 設定管理器換成新的設定（射程 9 格）：同一場仍用載入時的設定
  const mgr = StageDataManager.getInstance();
  const oldMgrCfg = mgr.heroesConfig;
  mgr.heroesConfig = [cfg("hero_ma_chao", { attack_range: 9 })];
  const r3 = e.syncTeam("t1", [
    { ...MA, level: 3, atk: 130, def: 66, hp: 1200 },
  ]);
  mgr.heroesConfig = oldMgrCfg;
  check(
    "設定管理器換了新設定：同一場仍用載入時的設定重算，等級 3 射程 2.2、攻擊間隔 0.9（不是新設定的 9 格）",
    r3.ok === true &&
      h.heroLevel === 3 &&
      near(h.attackRange, 2.2) &&
      near(h.attackSpeed, 0.9),
    { r3, range: h.attackRange, interval: h.attackSpeed }
  );
}
// 射程倍率（黃忠的長射程 1.5）每次從設定重算、不疊乘
{
  const e = mkEngine("t1b");
  e.placeHero(3, 3, HZ);
  const h = heroAt(e, 3, 3);
  const r0 = h.attackRange;
  e.syncTeam("t1b", [{ ...HZ, level: 2 }]);
  const r1 = h.attackRange;
  e.syncTeam("t1b", [{ ...HZ, level: 2, atk: 81 }]);
  const r2 = h.attackRange;
  e.syncTeam("t1b", [{ ...HZ, level: 3 }]);
  const r3 = h.attackRange;
  check(
    "射程倍率 1.5 不疊乘：等級 1 → 3 格、等級 2 → 3.15 格（再同步一次仍 3.15）、等級 3 → 3.3 格",
    near(r0, 3) && near(r1, 3.15) && near(r2, 3.15) && near(r3, 3.3),
    { r0, r1, r2, r3 }
  );
}

// ═══ T2：技能參數（13 種重設與重讀、缺 skill 保留、null／空物件清掉、和建構等效） ═══
for (const [id, params, expect] of SKILLS) {
  const e = mkEngine("t2");
  const built = new HeroEntity(
    { ...ZY, skill: skill(id, params) },
    CFG,
    { col: 3, row: 3 },
    { x: 0, y: 0 },
    true
  );
  e.placeHero(3, 3, ZY);
  const h = heroAt(e, 3, 3);
  const before = skillParams(h);
  const r = e.syncTeam("t2", [{ ...ZY, skill: skill(id, params) }]);
  check(
    `技能 ${id}：同一位武將的資料帶這個技能 → 參數和建構時讀到的相同（${JSON.stringify(expect)}），其餘 16 個參數是沒有技能的值`,
    r.ok === true &&
      same(before, NO_SKILL) &&
      same(skillParams(h), skillParams(built)) &&
      same(skillParams(h), { ...NO_SKILL, ...expect }),
    { r, before, after: skillParams(h), built: skillParams(built) }
  );
}
{
  const e = mkEngine("t2b");
  e.placeHero(3, 3, {
    ...ZY,
    skill: skill("burn", { burn_ratio: 0.2, burn_ticks: 3, burn_interval: 1 }),
  });
  const h = heroAt(e, 3, 3);
  e.syncTeam("t2b", [{ ...ZY, skill: skill("stun", { stun_sec: 0.5 }) }]);
  const afterStun = skillParams(h);
  e.syncTeam("t2b", [{ ...ZY, atk: 91 }]);
  const afterMissing = skillParams(h);
  e.syncTeam("t2b", [{ ...ZY, atk: 92, skill: null }]);
  const afterNull = skillParams(h);
  const atkNull = h.atk;
  e.syncTeam("t2b", [{ ...ZY, skill: skill("dodge", { dodge_chance: 0.2 }) }]);
  e.syncTeam("t2b", [{ ...ZY, atk: 93, skill: {} }]);
  const afterEmpty = skillParams(h);
  const atkEmpty = h.atk;
  check(
    "換技能（灼燒 → 暈眩）：灼燒的三個參數回到 0／0／1，只剩暈眩 0.5",
    same(afterStun, { ...NO_SKILL, stunDuration: 0.5 }),
    afterStun
  );
  check(
    "更新資料沒有 skill 欄位：保留原技能（暈眩 0.5），攻擊照樣更新",
    same(afterMissing, { ...NO_SKILL, stunDuration: 0.5 }),
    afterMissing
  );
  check(
    "skill 是 null：重設成沒有技能，攻擊照樣更新成 92",
    same(afterNull, NO_SKILL) && atkNull === 92,
    { afterNull, atkNull }
  );
  check(
    "skill 是空物件：重設成沒有技能，攻擊照樣更新成 93",
    same(afterEmpty, NO_SKILL) && atkEmpty === 93,
    { afterEmpty, atkEmpty }
  );
}
{
  // 建構時沒有技能的武將：16 個參數都是欄位的初始值（readSkill 先重設不改變建構的結果）
  const h = new HeroEntity(ZY, CFG, { col: 3, row: 3 }, { x: 0, y: 0 }, true);
  check(
    "建構時沒有技能：16 個參數都是沒有技能的值，射程 2、攻擊間隔 1（等級 1）",
    same(skillParams(h), NO_SKILL) &&
      near(h.attackRange, 2) &&
      near(h.attackSpeed, 1),
    { params: skillParams(h), range: h.attackRange, interval: h.attackSpeed }
  );
  const hz = new HeroEntity(HZ, CFG, { col: 3, row: 3 }, { x: 0, y: 0 }, true);
  const nocfg = new HeroEntity(
    { ...HZ, hero_id: "hero_unknown_x" },
    CFG,
    { col: 3, row: 3 },
    { x: 0, y: 0 },
    true
  );
  const sg = new HeroEntity(
    { ...ZY, level: 3 },
    [{ hero_id: "hero_zhao_yun", attack_speed: 2, speed_growth: 0.1 }],
    { col: 3, row: 3 },
    { x: 0, y: 0 },
    true
  );
  check(
    "建構的射程與攻擊間隔公式不變：長射程 1.5 → 3 格；找不到設定 → 2 格、1 秒（不乘倍率）；只有 speed_growth、等級 3 → 2×(1−0.2)＝1.6 秒、射程 2",
    near(hz.attackRange, 3) &&
      near(nocfg.attackRange, 2) &&
      near(nocfg.attackSpeed, 1) &&
      near(sg.attackSpeed, 1.6) &&
      near(sg.attackRange, 2),
    {
      hz: hz.attackRange,
      nocfg: [nocfg.attackRange, nocfg.attackSpeed],
      sg: [sg.attackRange, sg.attackSpeed],
    }
  );
}

// ═══ T3：別名（hero_ 前綴兩種寫法）只比較，不改 ID、不把別名的技能套上 ═══
{
  const e = mkEngine("t3");
  const notes = watch(e);
  e.placeHero(3, 3, { ...MA, hero_id: "ma_chao", skill: undefined });
  const h = heroAt(e, 3, 3);
  const r = e.syncTeam("t3", [{ ...MA, atk: 140, hp: 1200 }]);
  check(
    "場上是 ma_chao（沒有技能）、隊伍是 hero_ma_chao（帶首擊）：同一位，數值更新，ID 仍是 ma_chao，不套首擊",
    r.ok === true &&
      heroAt(e, 3, 3) === h &&
      h.heroId === "ma_chao" &&
      h.atk === 140 &&
      h.maxHp === 1200 &&
      same(skillParams(h), NO_SKILL) &&
      same(r.updated, ["ma_chao"]) &&
      notes.length === 1,
    { r, id: h.heroId, params: skillParams(h) }
  );
}
{
  const e = mkEngine("t3b");
  e.placeHero(3, 3, MA);
  const h = heroAt(e, 3, 3);
  const r = e.syncTeam("t3b", [
    { hero_id: "ma_chao", level: 2, atk: 110, def: 55, hp: 1050, skill: null },
  ]);
  check(
    "場上是 hero_ma_chao（首擊 2）、隊伍是 ma_chao（skill null）：數值更新，ID 不變，首擊 2 保留（別名不碰技能）",
    r.ok === true &&
      h.heroId === "hero_ma_chao" &&
      h.atk === 110 &&
      h.heroLevel === 2 &&
      h.firstStrikeMultiplier === 2,
    { r, id: h.heroId, fs: h.firstStrikeMultiplier }
  );
}

// ═══ T4：陣亡、生命 0、壞值與合法的 0 ═══
{
  const e = mkEngine("t4");
  const notes = watch(e);
  e.placeHero(3, 3, ZY);
  const h = heroAt(e, 3, 3);
  h.currentHp = 0; // 受控：生命 0 但還沒陣亡
  const s0 = snap(e);
  const r = e.syncTeam("t4", [{ ...ZY, atk: 500, hp: 5000 }]);
  check(
    "生命已是 0（還沒陣亡）的武將在隊伍裡：不更新、不復活（生命 0、最大生命與攻擊不變），沒有通知",
    r.ok === true &&
      same(r.updated, []) &&
      h.currentHp === 0 &&
      h.maxHp === 1100 &&
      h.atk === 90 &&
      h.isDead === false &&
      notes.length === 0 &&
      same(snap(e), s0),
    { r, hp: h.currentHp, max: h.maxHp, notes: notes.length }
  );
}
{
  const e = mkEngine("t4b");
  const notes = watch(e);
  e.placeHero(3, 3, ZY);
  const h = heroAt(e, 3, 3);
  h.takeDamage(1e9, null, e.floatingTexts, e.soundManager); // 受控的真正陣亡
  const r = e.syncTeam("t4b", [{ ...ZY, atk: 500, hp: 5000 }]);
  check(
    "已陣亡的武將：陣亡時已離場，同步不碰它（不復活、不重建），只有原本的一次陣亡通知",
    r.ok === true &&
      same(r.updated, []) &&
      same(r.removed, []) &&
      e.heroes.length === 0 &&
      h.isDead === true &&
      h.currentHp === 0 &&
      notes.length === 1 &&
      notes[0].died === h,
    { r, heroes: e.heroes.length, notes: notes.length }
  );
}
{
  // 正生命更新成合法的 0：撤除自己發出的防禦光環（立即，不等下一次更新），但不當成陣亡
  const e = mkEngine("t4c");
  const notes = watch(e);
  const LB = {
    hero_id: "hero_liu_bei",
    level: 1,
    atk: 90,
    def: 50,
    hp: 1000,
    skill: skill("def_aura", { def_mult: 1.2 }),
  };
  e.placeHero(3, 3, LB);
  e.placeHero(5, 3, ZY);
  tickHeroes(e);
  const lb = heroAt(e, 3, 3);
  const zy = heroAt(e, 5, 3);
  const before = zy.defBonusMult;
  const r = e.syncTeam("t4c", [{ ...LB, hp: 0 }, ZY]);
  check(
    "正生命更新成合法的 0：生命與最大生命 0、不是陣亡、仍在場上名單；它的防禦光環立即撤除（趙雲加成 1.2 → 1），通知不是陣亡",
    before === 1.2 &&
      r.ok === true &&
      lb.currentHp === 0 &&
      lb.maxHp === 0 &&
      lb.isDead === false &&
      e.heroes.includes(lb) &&
      same([...e.getAliveHeroIds()], ["hero_liu_bei", "hero_zhao_yun"]) &&
      zy.defBonusMult === 1 &&
      notes.length === 1 &&
      !("died" in notes[0]) &&
      notes[0].removed.length === 0,
    { before, after: zy.defBonusMult, hp: [lb.currentHp, lb.maxHp], notes }
  );
}
{
  // 壞值各自保留目前的值；合法的 0 照用
  const bad = [
    ['生命是 "1e309" 字串（轉換後非有限）', { hp: "1e309" }],
    ["生命是 null", { hp: null }],
    ["生命是空字串", { hp: "" }],
    ["生命是布林", { hp: true }],
    ["生命是負數", { hp: -5 }],
    ["生命是 NaN", { hp: NaN }],
    ["攻擊是 Infinity", { atk: Infinity }],
    ['攻擊是 "abc"', { atk: "abc" }],
    ["防禦是 -1", { def: -1 }],
    ['防禦是 " "', { def: " " }],
    ["等級是 1.5", { level: 1.5 }],
    ["等級是 0", { level: 0 }],
    ['等級是字串 "2"', { level: "2" }],
    ["等級超過安全整數", { level: 2 ** 53 }],
  ];
  for (const [label, patch] of bad) {
    const e = mkEngine("t4d");
    e.placeHero(3, 3, ZY);
    const h = heroAt(e, 3, 3);
    h.currentHp = 550;
    const s0 = snap(e);
    const r = e.syncTeam("t4d", [{ ...ZY, ...patch }]);
    check(
      `壞值（${label}）：保留目前的值（等級 1、攻擊 90、防禦 60、生命 550／1100），不套建構的預設`,
      r.ok === true &&
        h.heroLevel === 1 &&
        h.atk === 90 &&
        h.defStat === 60 &&
        h.currentHp === 550 &&
        h.maxHp === 1100 &&
        same(snap(e), s0),
      {
        r,
        lv: h.heroLevel,
        atk: h.atk,
        def: h.defStat,
        hp: [h.currentHp, h.maxHp],
      }
    );
  }
  const e = mkEngine("t4e");
  e.placeHero(3, 3, ZY);
  const h = heroAt(e, 3, 3);
  const r = e.syncTeam("t4e", [{ ...ZY, atk: 0, def: "0", hp: "1650" }]);
  check(
    '合法的 0 與數字字串照用：攻擊 0、防禦 0（字串 "0"）、生命 "1650" → 1650（比例 1）',
    r.ok === true &&
      h.atk === 0 &&
      h.defStat === 0 &&
      h.maxHp === 1650 &&
      h.currentHp === 1650,
    { atk: h.atk, def: h.defStat, hp: [h.currentHp, h.maxHp] }
  );
}

// ═══ T5：整筆驗證、階段與場次守門、暫停 ═══
{
  const badTeams = [
    ["不是陣列（null）", null],
    ["不是陣列（物件）", { hero_id: "hero_zhao_yun" }],
    ["有一筆是 null", [ZY, null]],
    ["有一筆缺 hero_id", [ZY, { level: 1 }]],
    ["有一筆 hero_id 是空字串", [ZY, { hero_id: "" }]],
    ["有一筆 hero_id 只有前綴", [ZY, { hero_id: "hero_" }]],
    ["有一筆 hero_id 是數字", [ZY, { hero_id: 7 }]],
    ["同一位出現兩次", [ZY, { ...ZY, atk: 999 }]],
    [
      "前綴兩種寫法碰撞",
      [
        { ...ZY, atk: 999 },
        { ...ZY, hero_id: "zhao_yun" },
      ],
    ],
  ];
  for (const [label, team] of badTeams) {
    const e = mkEngine("t5");
    const notes = watch(e);
    e.placeHero(3, 3, ZY);
    e.placeHero(5, 3, MA);
    e.placeTower(2, 1, "archer");
    select(e, 5, 3);
    const s0 = snap(e);
    let r;
    let threw = null;
    try {
      r = e.syncTeam("t5", team);
    } catch (err) {
      threw = String(err);
    }
    check(
      `不合法的隊伍（${label}）：整筆不接受（bad_team），場上、選取、格子、塔都不變、沒有通知`,
      !threw &&
        r &&
        r.ok === false &&
        r.reason === "bad_team" &&
        same(snap(e), s0) &&
        notes.length === 0,
      { threw, r, before: s0, after: snap(e) }
    );
  }
  const e = mkEngine("t5b");
  const notes = watch(e);
  e.placeHero(3, 3, ZY);
  e.placeHero(5, 3, MA);
  e.placeTower(2, 1, "archer");
  const r = e.syncTeam("t5b", []);
  check(
    "合法的空陣列：隊伍清空，場上兩位都離場、兩個格子釋放，塔留著，通知一次（removed 兩個實例）",
    r.ok === true &&
      e.heroes.length === 0 &&
      same(r.removed, ["hero_zhao_yun", "hero_ma_chao"]) &&
      e.gameMap.getOccupant(3, 3) === null &&
      e.gameMap.getOccupant(5, 3) === null &&
      occLabel(e.gameMap.getOccupant(2, 1)) === "tower:tower_1" &&
      notes.length === 1 &&
      notes[0].removed.length === 2 &&
      notes[0].aliveHeroIds.length === 0,
    { r, notes: notes.length }
  );
}
{
  const fresh = new BattleEngine(RENDERER);
  const r0 = fresh.syncTeam(fresh.battleManager.battleId, [ZY]);
  check(
    "還沒載入任何一場（WAITING）：不接受（not_active）",
    r0.ok === false && r0.reason === "not_active",
    { r0, state: fresh.battleManager.gameState }
  );
  const e = mkEngine("t5c");
  e.placeHero(3, 3, ZY);
  const s0 = snap(e);
  const rOld = e.syncTeam("t5-old", []);
  check(
    "別場的 battleId：不接受（stale_battle），什麼都不變",
    rOld.ok === false && rOld.reason === "stale_battle" && same(snap(e), s0),
    { rOld }
  );
  e.battleManager.endBattle(false);
  const s1 = snap(e);
  const rRes = e.syncTeam("t5c", []);
  check(
    "結算（RESULT）：不接受（not_active），場上武將不變",
    rRes.ok === false &&
      rRes.reason === "not_active" &&
      e.heroes.length === 1 &&
      same(snap(e), s1),
    { rRes }
  );
}
{
  const e = mkEngine("t5d");
  e.placeHero(3, 3, ZY);
  e.battleManager.setState(GameState.BATTLE);
  const ok = e.battleManager.setPaused("t5d", true);
  const r = e.syncTeam("t5d", [{ ...ZY, atk: 101 }]);
  check(
    "戰鬥中暫停：同步照常（攻擊 101），暫停維持、仍是戰鬥中",
    ok === "" &&
      r.ok === true &&
      heroAt(e, 3, 3)?.atk === 101 &&
      e.battleManager.manualPaused === true &&
      e.battleManager.gameState === GameState.BATTLE,
    { ok, r, paused: e.battleManager.manualPaused }
  );
  e.battleManager.setPaused("t5d", false);
  e.battleManager.setState(GameState.PREP);
  e.battleManager.setPaused("t5d", true);
  const r2 = e.syncTeam("t5d", []);
  check(
    "備戰中暫停：同步照常（移除），暫停維持",
    r2.ok === true &&
      e.heroes.length === 0 &&
      e.battleManager.manualPaused === true,
    { r2 }
  );
}
{
  // 通知的回呼裡換成新的一場並派出武將：同步回傳後不會再碰新的一場
  const e = mkEngine("t5e");
  e.placeHero(3, 3, ZY);
  let newHero = null;
  e.onHeroRosterChanged = () => {
    load(e, "t5f");
    e.placeHero(5, 3, MA);
    newHero = heroAt(e, 5, 3);
  };
  const r = e.syncTeam("t5e", []);
  check(
    "通知回呼裡換成新的一場：新場的武將（馬超）不被這次同步移除或改數值",
    r.ok === true &&
      e.battleManager.battleId === "t5f" &&
      e.heroes.length === 1 &&
      e.heroes[0] === newHero &&
      newHero.atk === 100 &&
      e.gameMap.getOccupant(5, 3) === newHero,
    {
      r,
      battleId: e.battleManager.battleId,
      heroes: e.heroes.map((h) => h.heroId),
    }
  );
}

// ═══ T6：離場（光環來源、阻擋、格子、選取、生命 0、通知、重派） ═══
{
  // 五種來源：每種兩個施放者（要離場的 X、留下的 Y），離場的只撤除自己的
  const e = mkEngine("t6");
  const notes = watch(e);
  const em = (id, kind, params) => ({
    hero_id: id,
    level: 1,
    atk: 1,
    def: 50,
    hp: 1000,
    skill: kind ? skill(kind, params) : undefined,
  });
  const GY = em("hero_guan_yu", "slow_aura", { slow_mult: 0.9 });
  const ZF = em("hero_zhang_fei", "slow_aura", { slow_mult: 0.8 });
  const LB = em("hero_liu_bei", "def_aura", { def_mult: 1.2 });
  const WY = em("hero_wei_yan", "def_aura", { def_mult: 1.3 });
  const CC = em("hero_cao_cao", "atk_speed_aura", { atk_speed_mult: 1.15 });
  const LV = em("hero_lv_bu", "atk_speed_aura", { atk_speed_mult: 1.2 });
  const YL = em("hero_yan_liang", "atk_down_aura", { atk_mult: 0.9 });
  const DW = em("hero_dian_wei", "atk_down_aura", { atk_mult: 0.8 });
  // 道路上兩位（會打敵人、施加道路阻擋緩速）：X＝關羽 (3,3)、Y＝張飛 (5,3)；建築位與其他道路格放其他施放者
  e.placeHero(3, 3, GY);
  e.placeHero(5, 3, ZF);
  e.placeHero(2, 1, LB);
  e.placeHero(4, 1, WY);
  e.placeHero(6, 1, CC);
  e.placeHero(8, 1, LV);
  e.placeHero(7, 3, YL);
  e.placeHero(9, 3, DW);
  e.placeHero(11, 3, ZY);
  const en = mkEnemy(e, 4);
  tickHeroes(e);
  const H = (c, r) => heroAt(e, c, r);
  const gy = H(3, 3);
  const zf = H(5, 3);
  const lb = H(2, 1);
  const wy = H(4, 1);
  const cc = H(6, 1);
  const lv = H(8, 1);
  const yl = H(7, 3);
  const dw = H(9, 3);
  const zy = H(11, 3);
  const had = {
    road: [en.hasSlowFrom(gy.slowSource), en.hasSlowFrom(zf.slowSource)],
    slow: [en.hasSlowFrom(gy.auraSource), en.hasSlowFrom(zf.auraSource)],
    def: [
      zy.defSources.has(lb.defAuraSource),
      zy.defSources.has(wy.defAuraSource),
    ],
    spd: [
      zy.atkSpeedSources.has(cc.atkSpeedAuraSource),
      zy.atkSpeedSources.has(lv.atkSpeedAuraSource),
    ],
    down: [
      en.hasAtkDownFrom(yl.atkDownAuraSource),
      en.hasAtkDownFrom(dw.atkDownAuraSource),
    ],
  };
  const r = e.syncTeam("t6", [ZF, WY, LV, DW, ZY]);
  const has = {
    road: [en.hasSlowFrom(gy.slowSource), en.hasSlowFrom(zf.slowSource)],
    slow: [en.hasSlowFrom(gy.auraSource), en.hasSlowFrom(zf.auraSource)],
    def: [
      zy.defSources.has(lb.defAuraSource),
      zy.defSources.has(wy.defAuraSource),
    ],
    spd: [
      zy.atkSpeedSources.has(cc.atkSpeedAuraSource),
      zy.atkSpeedSources.has(lv.atkSpeedAuraSource),
    ],
    down: [
      en.hasAtkDownFrom(yl.atkDownAuraSource),
      en.hasAtkDownFrom(dw.atkDownAuraSource),
    ],
  };
  check(
    "受控前置：五種來源（道路阻擋緩速、減速光環、防禦光環、攻速光環、威壓）兩個施放者都已加上",
    Object.values(had).every((p) => p[0] === true && p[1] === true),
    had
  );
  check(
    "離場的四位（關羽、劉備、曹操、顏良）撤除自己的五種來源，留下的張飛、魏延、呂布、典韋的同種來源還在（不等下一次更新）",
    r.ok === true &&
      same(r.removed, [
        "hero_guan_yu",
        "hero_liu_bei",
        "hero_cao_cao",
        "hero_yan_liang",
      ]) &&
      Object.values(has).every((p) => p[0] === false && p[1] === true),
    { r, has }
  );
  check(
    "離場只清自己占的四個格子，留下的武將格子與實例不變，通知一次（removed 是離場的四個實例、凍結）",
    e.gameMap.getOccupant(3, 3) === null &&
      e.gameMap.getOccupant(2, 1) === null &&
      e.gameMap.getOccupant(6, 1) === null &&
      e.gameMap.getOccupant(7, 3) === null &&
      e.gameMap.getOccupant(5, 3) === zf &&
      e.gameMap.getOccupant(4, 1) === wy &&
      e.gameMap.getOccupant(8, 1) === lv &&
      e.gameMap.getOccupant(9, 3) === dw &&
      e.gameMap.getOccupant(11, 3) === zy &&
      notes.length === 1 &&
      Object.isFrozen(notes[0].removed) &&
      notes[0].removed.length === 4 &&
      notes[0].removed.every((x, i) => x === [gy, lb, cc, yl][i]) &&
      same(
        [...notes[0].aliveHeroIds],
        [
          "hero_zhang_fei",
          "hero_wei_yan",
          "hero_lv_bu",
          "hero_dian_wei",
          "hero_zhao_yun",
        ]
      ),
    { notes: notes.length, alive: notes[0] && notes[0].aliveHeroIds }
  );
}
{
  // 阻擋：只放開被離場武將阻擋的敵人；不改敵人的暈眩、灼燒、攻擊冷卻、路徑
  const e = mkEngine("t6b");
  e.placeHero(3, 3, ZY);
  e.placeHero(7, 3, MA);
  const x = heroAt(e, 3, 3);
  const y = heroAt(e, 7, 3);
  const e1 = mkEnemy(e, 3);
  const e2 = mkEnemy(e, 7);
  const e3 = mkEnemy(e, 3);
  e1.blocker = x;
  e1.isFighting = true;
  e1.blockerAtkTimer = 0.4;
  e2.blocker = y;
  e2.isFighting = true;
  e3.blocker = x;
  e3.isFighting = true;
  e3.applyStun(0.5);
  e3.applyBurn(5, 3, 1);
  const s3 = {
    stun: e3.stunLeft,
    burn: [e3.burnDamage, e3.burnTicksLeft, e3.burnTimer],
    wp: e3.wpIndex,
    timer: e3.blockerAtkTimer,
  };
  select(e, 3, 3);
  const x0 = e1.x;
  const r = e.syncTeam("t6b", [MA]);
  check(
    "離場的武將：阻擋它的兩個敵人 blocker 清掉、不在戰鬥，攻擊冷卻 0.4 不變；阻擋留下武將的敵人不受影響；選取取消",
    r.ok === true &&
      e1.blocker === null &&
      e1.isFighting === false &&
      e1.blockerAtkTimer === 0.4 &&
      e3.blocker === null &&
      e2.blocker === y &&
      e2.isFighting === true &&
      e.selectedUnit === null,
    {
      r,
      e1: [e1.blocker === null, e1.isFighting, e1.blockerAtkTimer],
      e2: e2.blocker === y,
    }
  );
  check(
    "離場不改敵人的暈眩、灼燒、路徑與攻擊冷卻",
    e3.stunLeft === s3.stun &&
      same([e3.burnDamage, e3.burnTicksLeft, e3.burnTimer], s3.burn) &&
      e3.wpIndex === s3.wp &&
      e3.blockerAtkTimer === s3.timer,
    {
      before: s3,
      after: {
        stun: e3.stunLeft,
        burn: [e3.burnDamage, e3.burnTicksLeft, e3.burnTimer],
        wp: e3.wpIndex,
      },
    }
  );
  e1.update(0.1, e.gameMap, e.floatingTexts, e.soundManager);
  check(
    "沒有暈眩、還沒到終點的敵人：下一次 update 往前走（x 變大），不再被已離場的武將擋住",
    e1.x > x0 && e1.blocker === null,
    { x0, x1: e1.x, blocker: e1.blocker === null }
  );
}
{
  // 生命 0 但還沒陣亡的武將不在隊伍裡：照樣離場，不冒充陣亡
  const e = mkEngine("t6c");
  const notes = watch(e);
  e.placeHero(3, 3, ZY);
  e.placeHero(5, 3, MA);
  const z = heroAt(e, 3, 3);
  z.currentHp = 0;
  const r = e.syncTeam("t6c", [MA]);
  check(
    "生命 0 但還沒陣亡、不在隊伍裡：照樣離場（格子釋放、名單只剩馬超），isDead 仍是 false，通知是 removed 不是 died",
    r.ok === true &&
      same(r.removed, ["hero_zhao_yun"]) &&
      z.isDead === false &&
      e.gameMap.getOccupant(3, 3) === null &&
      same([...e.getAliveHeroIds()], ["hero_ma_chao"]) &&
      notes.length === 1 &&
      !("died" in notes[0]) &&
      notes[0].removed[0] === z,
    { r, notes }
  );
}
{
  // 陣亡通知的內容不變（died 是那個實例，沒有 removed）
  const e = mkEngine("t6d");
  const notes = watch(e);
  e.placeHero(3, 3, ZY);
  const h = heroAt(e, 3, 3);
  h.takeDamage(1e9, null, e.floatingTexts, e.soundManager);
  check(
    "陣亡通知照原本：欄位只有 battleId、aliveHeroIds、died，died 是陣亡的那個實例",
    notes.length === 1 &&
      same(Object.keys(notes[0]).sort(), [
        "aliveHeroIds",
        "battleId",
        "died",
      ]) &&
      notes[0].died === h &&
      notes[0].battleId === "t6d",
    { keys: notes[0] && Object.keys(notes[0]) }
  );
}
{
  // 離場後同一場再派：新的實例，這一場的首擊紀錄仍是已用
  const e = mkEngine("t6e");
  e.placeHero(3, 3, MA);
  const first = heroAt(e, 3, 3);
  e.battleManager.consumeFirstStrike("hero_ma_chao", 200);
  e.syncTeam("t6e", []);
  const ok = e.placeHero(5, 3, MA);
  const again = heroAt(e, 5, 3);
  check(
    "離場後同一場再派馬超：成功、是新的實例；首擊紀錄仍是已用（再消耗回 false）",
    ok === true &&
      again &&
      again !== first &&
      e.battleManager.consumeFirstStrike("hero_ma_chao", 999) === false &&
      same([...e.battleManager.firstStrikeUsed], [["hero_ma_chao", 200]]),
    { ok, fs: [...e.battleManager.firstStrikeUsed] }
  );
}

// ═══ T7：帳號世代（真正的 store 的 getAccountEpoch；後端是 fixture） ═══
const { createProfileFixture } = await import(
  pathToFileURL(join(HERE, "../tests/profile-contract-fixture.mjs")).href
);
const { useJsPlayerStore } = require(
  join(HERE, "../store/useJsPlayerStore.ts")
);
const st = () => useJsPlayerStore.getState();
const clone = (o) =>
  o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const HEROES = [
  {
    hero_id: "guan_yu",
    name: "關羽",
    cost: 5,
    base_atk: 140,
    base_def: 70,
    base_hp: 1450,
    upgrade_cost_base: 120,
    atk_growth: 10,
    def_growth: 5,
    hp_growth: 100,
  },
  {
    hero_id: "zhao_yun",
    name: "趙雲",
    cost: 4,
    base_atk: 120,
    base_def: 60,
    base_hp: 1300,
    upgrade_cost_base: 120,
    atk_growth: 10,
    def_growth: 5,
    hp_growth: 100,
  },
];
const DATA = (nickname) => ({
  nickname,
  level: 1,
  exp: 0,
  gold: 500,
  capacity: 11,
  max_stage: "chapter1_3",
  heroes: [],
  team: [{ hero_id: "guan_yu", slot: 1 }],
});
const fx = createProfileFixture({ heroesConfig: HEROES });
fx.seed("test_team_a", clone(DATA("甲")), 3);
fx.seed("test_team_b", clone(DATA("乙")), 5);
const net = { calls: [], failGet: 0 };
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  net.calls.push(body.action);
  if (body.action === "get_profile" && net.failGet > 0) {
    net.failGet -= 1;
    throw new TypeError("Failed to fetch");
  }
  const res = fx.handle(clone(body));
  return { ok: true, status: 200, json: async () => clone(res) };
};
const tick = () => new Promise((r) => setImmediate(r));
async function until(fn, n = 400) {
  for (let i = 0; i < n; i++) {
    if (fn()) return true;
    await tick();
  }
  return fn();
}
/** 資料欄位（不含函式）的快照 */
const stateData = () =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(st()).filter(([, v]) => typeof v !== "function")
    )
  );
{
  const ep = [];
  await st().init();
  await until(() => !st().isLoading);
  ep.push(st().getAccountEpoch());
  await st().startGuestMode();
  ep.push(st().getAccountEpoch());
  const ra = await st().loginWithKey("test_team_a");
  ep.push(st().getAccountEpoch());
  const playerA = st().player;
  const rb = await st().loginWithKey("test_team_b");
  ep.push(st().getAccountEpoch());
  const ra2 = await st().loginWithKey("test_team_a");
  ep.push(st().getAccountEpoch());
  const playerA2 = st().player;
  check(
    "帳號世代：初始化、訪客、登入 A、登入 B、再登入 A 每次都換新（遞增）；同一把金鑰重新登入世代不同，key 相等不能代替世代",
    ra.success &&
      rb.success &&
      ra2.success &&
      ep.every((v, i) => typeof v === "number" && (i === 0 || v > ep[i - 1])) &&
      playerA.key === "test_team_a" &&
      playerA2.key === "test_team_a" &&
      ep[4] !== ep[2],
    { ep, ra, rb, ra2 }
  );
  const beforeFail = st().player;
  const eBefore = st().getAccountEpoch();
  // store 的讀取會自動重試：讓這次登入的每一次讀取都斷線，登入結束後歸零
  net.failGet = 1000;
  const rf = await st().loginWithKey("test_team_b");
  net.failGet = 0;
  const eAfter = st().getAccountEpoch();
  check(
    "登入失敗（讀取斷線）：世代已換新，但畫面上的玩家資料仍是原本那一份（同一個物件、金鑰 A）",
    rf.success === false &&
      eAfter > eBefore &&
      st().player === beforeFail &&
      st().player.key === "test_team_a",
    { rf, eBefore, eAfter, key: st().player && st().player.key }
  );
  const calls0 = net.calls.length;
  const d0 = stateData();
  const g = [
    st().getAccountEpoch(),
    st().getAccountEpoch(),
    st().getAccountEpoch(),
  ];
  check(
    "getAccountEpoch 只讀：連續三次相同，store 的資料欄位、網路請求數都不變",
    g[0] === eAfter &&
      g[1] === g[0] &&
      g[2] === g[0] &&
      stateData() === d0 &&
      net.calls.length === calls0,
    { g, calls: [calls0, net.calls.length] }
  );
  // 同一個帳號正常改隊伍、升級、手動同步：世代不變
  await st().loginWithKey("test_team_a");
  await until(() => !st().isLoading);
  const eA = st().getAccountEpoch();
  const t = await st().updateTeam([
    { hero_id: "hero_guan_yu", slot: 1 },
    { hero_id: "hero_zhao_yun", slot: 2 },
  ]);
  const eT = st().getAccountEpoch();
  const u = await st().requestHeroUpgrade("hero_guan_yu");
  const eU = st().getAccountEpoch();
  const f = await st().forceSync();
  const eF = st().getAccountEpoch();
  check(
    "同一個帳號正常改隊伍、升級、手動同步：都成功，世代不變",
    t.success && u.success && f.success && eT === eA && eU === eA && eF === eA,
    { t, u, f, eA, eT, eU, eF }
  );
  // 出征固定後讀世代：固定、待確認、寫入都不受影響
  const armed = st().armSharedSettle({
    battleId: "b-epoch",
    stageId: "chapter1_1",
    configReady: true,
    completeStageIds: new Set(["chapter1_1", "chapter1_2", "chapter1_3"]),
    practice: false,
  });
  const d1 = stateData();
  const calls1 = net.calls.length;
  const g2 = st().getAccountEpoch();
  check(
    "出征固定後讀世代：settleArmed 仍是 true、待確認不變、store 資料與網路請求都不變",
    armed === true &&
      g2 === eA &&
      st().settleArmed === true &&
      stateData() === d1 &&
      net.calls.length === calls1,
    { armed, g2, eA, settleArmed: st().settleArmed }
  );
  st().disarmSharedSettle();
  st().logout();
  check("登出：世代換新", st().getAccountEpoch() > eA, {
    after: st().getAccountEpoch(),
    eA,
  });
}

// ═══ T8：頁面的隊伍來源守門（載入與同步之前的判斷） ═══
// 證據等級：從 components/shenmaSanguoJsPage.tsx 用 TypeScript AST 取出實際的 teamSourceUsable 原文（轉成 JS 後執行），
// 搭配合成的 store 狀態。只驗這個判斷本身，不是 React 生命週期或正常入口（正常入口在瀏覽器契約測試第 35 段）
{
  const PAGE = join(HERE, "../components/shenmaSanguoJsPage.tsx");
  const sf = ts.createSourceFile(
    PAGE,
    readFileSync(PAGE, "utf8"),
    ts.ScriptTarget.ES2020,
    true,
    ts.ScriptKind.TSX
  );
  const found = sf.statements.filter(
    (st0) =>
      ts.isVariableStatement(st0) &&
      st0.declarationList.declarations.some(
        (d) => ts.isIdentifier(d.name) && d.name.text === "teamSourceUsable"
      )
  );
  const js = found.length
    ? ts.transpileModule(found[0].getText(sf), {
        compilerOptions: { target: ts.ScriptTarget.ES2020 },
      }).outputText
    : "";
  const usable = found.length
    ? new Function(`${js}\nreturn teamSourceUsable;`)()
    : null;
  check(
    "取出頁面的 teamSourceUsable（頂層只有一個、可以執行）",
    found.length === 1 && typeof usable === "function",
    { found: found.length }
  );
  /** 合成的 store 狀態：預設是共用帳號 A、世代 7、不在載入中、隊伍可編輯、不是唯讀 */
  const S = (o = {}) => ({
    isLoading: false,
    mode: "shared",
    player: { key: "test_src_a" },
    teamEditable: true,
    readOnly: false,
    epoch: 7,
    ...o,
    getAccountEpoch() {
      return this.epoch;
    },
  });
  const OWN = (o = {}) => ({
    mode: "shared",
    key: "test_src_a",
    epoch: 7,
    ...o,
  });
  const run = (owner, s, bootstrap) => {
    try {
      return usable(owner, s, bootstrap);
    } catch (err) {
      return `threw:${err}`;
    }
  };
  for (const [label, owner, s, bootstrap, want] of [
    ["共用帳號 A、世代 7、都是目前的", OWN(), S(), false, true],
    [
      "訪客、世代 7、目前的",
      OWN({ mode: "guest", key: "guest_x" }),
      S({ mode: "guest", player: { key: "guest_x" } }),
      false,
      true,
    ],
    [
      "登出後還沒選帳號（mode none、世代已知、目前的）",
      OWN({ mode: "none", key: null, epoch: 9 }),
      S({ mode: "none", player: null, epoch: 9 }),
      false,
      false,
    ],
    [
      "還沒選帳號的舊世代快照（mode none、世代 8，store 世代 9）",
      OWN({ mode: "none", key: null, epoch: 8 }),
      S({ mode: "none", player: null, epoch: 9 }),
      false,
      false,
    ],
    [
      "已選帳號的模式卻沒有玩家資料（共用帳號、store 的 player 是 null）",
      OWN(),
      S({ player: null }),
      false,
      false,
    ],
    [
      "已選帳號但來源沒有金鑰（訪客、key null）",
      OWN({ mode: "guest", key: null }),
      S({ mode: "guest", player: { key: "guest_x" } }),
      false,
      false,
    ],
    [
      "已選帳號但來源金鑰是空字串（玩家的金鑰也是空字串）",
      OWN({ key: "" }),
      S({ player: { key: "" } }),
      false,
      false,
    ],
    [
      "登入失敗後：資料還是 A 的舊世代 6，store 已換成世代 7",
      OWN({ epoch: 6 }),
      S(),
      false,
      false,
    ],
    [
      "A 的舊快照，store 已是 B",
      OWN({ epoch: 6 }),
      S({ player: { key: "test_src_b" } }),
      false,
      false,
    ],
    [
      "同一把金鑰、世代不同（重新登入前的快照）",
      OWN({ epoch: 6 }),
      S({ epoch: 8 }),
      false,
      false,
    ],
    ["正在載入（登入中）", OWN(), S({ isLoading: true }), false, false],
    ["共用帳號唯讀", OWN(), S({ readOnly: true }), false, false],
    [
      "共用帳號的隊伍不支援（不可編輯）",
      OWN(),
      S({ teamEditable: false }),
      false,
      false,
    ],
    ["世代不知道（null）", OWN({ epoch: null }), S(), false, false],
    [
      "模式不同（快照是訪客，store 是共用帳號）",
      OWN({ mode: "guest" }),
      S(),
      false,
      false,
    ],
    [
      "首次內建展示：還沒有一場、來源與 store 都沒選帳號",
      OWN({ mode: "none", key: null, epoch: null }),
      S({ mode: "none", player: null }),
      true,
      true,
    ],
    [
      "首次內建展示的條件不給已有一場的載入（bootstrap false）",
      OWN({ mode: "none", key: null, epoch: null }),
      S({ mode: "none", player: null }),
      false,
      false,
    ],
    [
      "首次內建展示不放行已選帳號的舊快照（store 已是訪客）",
      OWN({ mode: "none", key: null, epoch: null }),
      S({ mode: "guest", player: { key: "guest_x" } }),
      true,
      false,
    ],
    [
      "首次內建展示不放行世代不明的已選帳號快照",
      OWN({ epoch: null }),
      S({ isLoading: true }),
      true,
      false,
    ],
    [
      "首次內建展示：store 沒有選帳號但還留著玩家資料",
      OWN({ mode: "none", key: null, epoch: null }),
      S({ mode: "none" }),
      true,
      false,
    ],
    [
      "首次內建展示不放行還帶著金鑰的快照（mode none 但 key 是舊的）",
      OWN({ mode: "none", key: "test_src_a", epoch: null }),
      S({ mode: "none", player: null }),
      true,
      false,
    ],
    [
      "首次內建展示：兩邊都沒選帳號、世代已知也一樣（不需要世代）",
      OWN({ mode: "none", key: null, epoch: 9 }),
      S({ mode: "none", player: null, epoch: 9 }),
      true,
      true,
    ],
    [
      "首次內建展示的旗標不改變已選帳號的一般判斷（訪客、目前的）",
      OWN({ mode: "guest", key: "guest_x" }),
      S({ mode: "guest", player: { key: "guest_x" } }),
      true,
      true,
    ],
  ]) {
    const got = run(owner, s, bootstrap);
    check(
      `來源守門（抽函式）：${label} → ${want ? "可以" : "不可以"}載入或同步`,
      got === want,
      { owner, state: { ...s, getAccountEpoch: undefined }, bootstrap, got }
    );
  }
}

const passed = results.filter((r) => r.pass).length;
console.log(
  `RESULT_JSON ${JSON.stringify({ script: "teamSync.test.mjs", pass: passed === results.length, assertions: { passed, total: results.length } })}`
);
process.exit(passed === results.length ? 0 : 1);
