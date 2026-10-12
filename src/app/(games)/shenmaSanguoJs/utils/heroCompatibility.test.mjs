// 神馬三國 JS 版的武將身份比較（別名）、生命 ≤ 0 時的光環、改目標的暫停守門（純 Node、不連網）
// - 用真正的 engine/BattleEngine.ts（placeHero／setTowerTargetMode）、engine/entities/HeroEntity.ts（update 與光環的發出／接收）、
//   engine/entities/EnemyEntity.ts 與 utils/heroSkillBinding.ts（正式技能表）；期待值照 Godot 版 Hero.gd 的 leaving（current_hp <= 0）、
//   _hero_alive、apply_def_from／apply_atk_speed_from 手寫，不 mock 生命、光環或唯一性的判定
// - 生命調成 0 用受控的記憶體欄位（currentHp＝0、沒有陣亡），不是自然戰鬥；敵人是不移動的木樁實例
// - 假的依賴只有畫面：BattleEngine 傳入一個什麼都不畫的 renderer；音效在 Node 沒有 AudioContext，照原本的程式靜默略過
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/heroCompatibility.test.mjs"
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
const { EnemyEntity } = require(
  join(HERE, "../engine/entities/EnemyEntity.ts")
);
const { canvasHeroSkill } = require(join(HERE, "heroSkillBinding.ts"));

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
function mkEngine(battleId) {
  const e = new BattleEngine(RENDERER);
  e.loadStage({
    stageId: "chapter1_1",
    battleId,
    totalWaves: 1,
    pathJson: JSON.stringify(PATH),
    waves: [],
    heroesConfig: [],
    enemiesConfig: [],
  });
  return e;
}
/** 武將資料：數值寫死，技能照正式技能表（只有完整 ID 會帶到正式技能） */
const STATE = (id) => ({
  hero_id: id,
  level: 1,
  atk: 120,
  def: 40,
  hp: 900,
  ...canvasHeroSkill(id),
});
const heroAt = (e, col, row) =>
  e.heroes.find((h) => h.gridCell.col === col && h.gridCell.row === row) ||
  null;
const snap = (e) => ({
  gold: e.battleManager.battleGold,
  heroes: e.heroes.map((h) => [h.heroId, h.gridCell.col, h.gridCell.row]),
  occ: [
    [3, 3],
    [5, 3],
    [7, 3],
    [2, 1],
  ].map(([c, r]) => e.gameMap.isOccupied(c, r)),
  firstStrike: [...e.battleManager.firstStrikeUsed],
});
const kill = (e, h) => h.takeDamage(1e9, null, e.floatingTexts, e.soundManager);

// ═══ C1：別名只用於碰撞比較（完整 ID hero_ma_chao 與去掉前綴的 ma_chao） ═══
for (const [label, first, second, cell2] of [
  [
    "完整 ID 在場上，再派去掉前綴的寫法到別格",
    "hero_ma_chao",
    "ma_chao",
    [5, 3],
  ],
  [
    "去掉前綴的寫法在場上，再派完整 ID 到別格",
    "ma_chao",
    "hero_ma_chao",
    [5, 3],
  ],
  [
    "完整 ID 在場上，再派去掉前綴的寫法到建築位",
    "hero_ma_chao",
    "ma_chao",
    [2, 1],
  ],
  [
    "去掉前綴的寫法在場上，再派完整 ID 到同一格",
    "ma_chao",
    "hero_ma_chao",
    [3, 3],
  ],
]) {
  const e = mkEngine("b1");
  const ok1 = e.placeHero(3, 3, STATE(first));
  const s0 = snap(e);
  const r = e.placeHero(cell2[0], cell2[1], STATE(second));
  check(
    `${label}：第二次被拒，武將、格子、首擊紀錄都不變`,
    ok1 === true && r === false && same(snap(e), s0),
    { ok1, r, before: s0, after: snap(e) }
  );
}
{
  const e = mkEngine("b1");
  e.placeHero(3, 3, STATE("hero_ma_chao"));
  const r = e.placeHero(5, 3, STATE("hero_zhao_yun"));
  const r2 = e.placeHero(7, 3, STATE("zhou_yu"));
  check(
    "不同武將不受影響：馬超在場上時，趙雲（完整 ID）與周瑜（去掉前綴）都能派",
    r === true && r2 === true && e.heroes.length === 3,
    { r, r2, heroes: snap(e).heroes }
  );
}
{
  const e = mkEngine("b1");
  e.placeHero(3, 3, STATE("hero_ma_chao"));
  const full = heroAt(e, 3, 3);
  const e2 = mkEngine("b2");
  e2.placeHero(3, 3, STATE("ma_chao"));
  const bare = heroAt(e2, 3, 3);
  check(
    "身份比較不改原本的 ID：完整 ID 的實例仍是 hero_ma_chao，去掉前綴的仍是 ma_chao",
    full.heroId === "hero_ma_chao" && bare.heroId === "ma_chao",
    [full.heroId, bare.heroId]
  );
  check(
    "正式技能只認完整 ID：hero_ma_chao 首擊倍率 2；ma_chao 不會因比較被升成正式技能（倍率 1、沒有 skill）",
    full.firstStrikeMultiplier === 2 &&
      bare.firstStrikeMultiplier === 1 &&
      !("skill" in canvasHeroSkill("ma_chao")),
    {
      full: full.firstStrikeMultiplier,
      bare: bare.firstStrikeMultiplier,
      skillBare: canvasHeroSkill("ma_chao"),
    }
  );
}
for (const [label, id] of [
  ["只有前綴 hero_", "hero_"],
  ["空字串", ""],
  ["只有空白", "  "],
  ["數字", 5],
  ["null", null],
]) {
  const e = mkEngine("b1");
  const s0 = snap(e);
  const r = e.placeHero(3, 3, { ...STATE("hero_ma_chao"), hero_id: id });
  check(
    `沒有身份的 ID（${label}）：拒絕，不建立武將、不占格子`,
    r === false && same(snap(e), s0),
    { r, before: s0, after: snap(e) }
  );
}
{
  const e = mkEngine("b1");
  const r1 = e.placeHero(3, 3, STATE("hero_unknown_x"));
  const r2 = e.placeHero(5, 3, STATE("unknown_x"));
  const h = heroAt(e, 3, 3);
  check(
    "不在名冊的 ID 照同一個前綴慣例比較：hero_unknown_x 在場上時 unknown_x 被拒；未知的 ID 不會拿到正式技能",
    r1 === true &&
      r2 === false &&
      !!h &&
      h.firstStrikeMultiplier === 1 &&
      !("skill" in canvasHeroSkill("hero_unknown_x")),
    { r1, r2, mult: h && h.firstStrikeMultiplier }
  );
}
{
  // 陣亡後兩種寫法都能再派，但同時只能有一位；首擊紀錄照原本的規則（以原 ID 記、同一場不重設）
  const e = mkEngine("b1");
  e.placeHero(3, 3, STATE("hero_ma_chao"));
  e.battleManager.consumeFirstStrike("hero_ma_chao", 240);
  const fs0 = [...e.battleManager.firstStrikeUsed];
  kill(e, heroAt(e, 3, 3));
  const r1 = e.placeHero(3, 3, STATE("ma_chao"));
  const r2 = e.placeHero(5, 3, STATE("hero_ma_chao"));
  check(
    "完整 ID 的馬超陣亡後：去掉前綴的寫法可以再派，之後完整 ID 被拒（同時只有一位）；首擊紀錄不變",
    r1 === true &&
      r2 === false &&
      e.heroes.length === 1 &&
      e.heroes[0].heroId === "ma_chao" &&
      same([...e.battleManager.firstStrikeUsed], fs0),
    { r1, r2, heroes: snap(e).heroes, fs: [...e.battleManager.firstStrikeUsed] }
  );
  kill(e, heroAt(e, 3, 3));
  const r3 = e.placeHero(3, 3, STATE("hero_ma_chao"));
  check(
    "去掉前綴的那位也陣亡後，完整 ID 再派成功；這一場的首擊仍以原 ID 記為已用（再判定是 false）",
    r3 === true &&
      e.battleManager.consumeFirstStrike("hero_ma_chao", 1) === false &&
      same([...e.battleManager.firstStrikeUsed], fs0),
    { r3, fs: [...e.battleManager.firstStrikeUsed] }
  );
}

{
  // 「仍在場上」看的是有沒有陣亡（isDead），不是生命是否大於 0：生命 0、沒有陣亡的武將仍擋同一位再派
  const e = mkEngine("b1");
  const ok1 = e.placeHero(3, 3, { ...STATE("hero_ma_chao"), hp: 0 });
  const h = heroAt(e, 3, 3);
  const r2 = e.placeHero(5, 3, STATE("hero_ma_chao"));
  const r3 = e.placeHero(7, 3, STATE("ma_chao"));
  check(
    "生命 0（存檔數值）但沒有陣亡的馬超仍算在場上：完整 ID 與去掉前綴的寫法再派都被拒",
    ok1 === true &&
      !!h &&
      h.currentHp === 0 &&
      h.isDead === false &&
      r2 === false &&
      r3 === false &&
      e.heroes.length === 1,
    { ok1, hp: h && h.currentHp, isDead: h && h.isDead, r2, r3 }
  );
}

// ═══ C2：生命 ≤ 0 時的光環（發出端與接收端；每個情況各用新的引擎與相同前置） ═══
const DT = 0.016;
const tick = (e, h, enemies = []) =>
  h.update(
    DT,
    enemies,
    e.heroes,
    e.battleManager,
    e.floatingTexts,
    e.soundManager
  );
/** 不移動的木樁敵人，放在指定格子的中心 */
function dummyAt(e, col, row, id = "d1") {
  const w = e.gameMap.gridToWorld(col, row);
  const en = new EnemyEntity(
    id,
    0,
    { enemy_id: "dummy", hp: 1000000, speed: 60, atk: 1 },
    e.gameMap.getWaypointsWorld("path_a"),
    e.gameMap.tileSize
  );
  en.x = w.x;
  en.y = w.y;
  return en;
}
/** 光環武將放 (3,3)、另一位武將放 (4,3)（一格距離，射程 2 格內） */
function auraSetup(casterId, otherId = "hero_zhao_yun") {
  const e = mkEngine("b1");
  e.placeHero(3, 3, STATE(casterId));
  e.placeHero(4, 3, STATE(otherId));
  return { e, caster: heroAt(e, 3, 3), other: heroAt(e, 4, 3) };
}
for (const [label, casterId, mult, has, bonus, sources, apply] of [
  [
    "防禦光環（劉備 1.2）",
    "hero_liu_bei",
    1.2,
    (h, src) => h.defSources.has(src),
    (h) => h.defBonusMult,
    (c) => c.defAuraSource,
    (h, src, m) => h.applyDefFrom(src, m, 5),
  ],
  [
    "攻速光環（曹操 1.15）",
    "hero_cao_cao",
    1.15,
    (h, src) => h.atkSpeedSources.has(src),
    (h) => h.atkSpeedBonusMult,
    (c) => c.atkSpeedAuraSource,
    (h, src, m) => h.applyAtkSpeedFrom(src, m, 5),
  ],
]) {
  {
    const { e, caster, other } = auraSetup(casterId);
    apply(other, "other_source", 1.1);
    tick(e, caster);
    const b1 = [has(other, sources(caster)), bonus(other)];
    caster.currentHp = 0; // 受控：生命 0、沒有陣亡
    tick(e, caster);
    const b2 = [has(other, sources(caster)), bonus(other)];
    check(
      `${label}：發出者生命 0 時不再發，並撤除自己給趙雲的加成；其他來源（1.1）保留`,
      same(b1, [true, mult]) &&
        same(b2, [false, 1.1]) &&
        caster.isDead === false,
      { b1, b2, isDead: caster.isDead }
    );
  }
  {
    const { e, caster, other } = auraSetup(casterId);
    other.currentHp = 0;
    tick(e, caster);
    apply(other, "direct_source", 1.3);
    check(
      `${label}：接收者生命 0 時，光環不給它，直接套用也不接收`,
      !has(other, sources(caster)) &&
        !has(other, "direct_source") &&
        bonus(other) === 1,
      { bonus: bonus(other) }
    );
  }
  {
    const { e, caster, other } = auraSetup(casterId);
    tick(e, caster);
    const before = has(other, sources(caster));
    other.currentHp = 0;
    tick(e, caster);
    check(
      `${label}：已拿到加成的接收者生命變 0 後，下一次更新撤除`,
      before === true && !has(other, sources(caster)) && bonus(other) === 1,
      { before, after: has(other, sources(caster)), bonus: bonus(other) }
    );
  }
  {
    const { e, caster, other } = auraSetup(casterId);
    tick(e, caster);
    tick(e, caster);
    check(
      `${label}：雙方生命都是正的時照常持續（對照）`,
      has(other, sources(caster)) && bonus(other) === mult,
      { bonus: bonus(other) }
    );
  }
}
for (const [label, casterId, hasFn, srcFn, applyOther, hasOther] of [
  [
    "減速光環（關羽 0.9）",
    "hero_guan_yu",
    (en, c) => en.hasSlowFrom(c.auraSource),
    (c) => c.auraSource,
    (en) => en.applySlowFrom("other_slow", 0.8, 5),
    (en) => en.hasSlowFrom("other_slow"),
  ],
  [
    "威壓（顏良 0.9）",
    "hero_yan_liang",
    (en, c) => en.hasAtkDownFrom(c.atkDownAuraSource),
    (c) => c.atkDownAuraSource,
    (en) => en.applyAtkDownFrom("other_down", 0.8, 5),
    (en) => en.hasAtkDownFrom("other_down"),
  ],
]) {
  const { e, caster } = auraSetup(casterId);
  const en = dummyAt(e, 4, 3);
  applyOther(en);
  tick(e, caster, [en]);
  const b1 = hasFn(en, caster);
  caster.currentHp = 0;
  tick(e, caster, [en]);
  const b2 = hasFn(en, caster);
  check(
    `${label}：發出者生命 0 時不再發，並撤除自己對木樁的來源；其他來源保留`,
    b1 === true && b2 === false && hasOther(en) === true,
    { b1, b2, other: hasOther(en), source: srcFn(caster) }
  );
}
{
  // 道路阻擋：生命 0 的武將普通攻擊照常（命中仍附加道路減速），下一次更新撤除（和 Godot 版一樣分開處理）
  const { e, caster } = auraSetup("hero_zhang_fei");
  const en = dummyAt(e, 4, 3);
  caster.currentHp = 0;
  const atk0 = caster.attackCount;
  tick(e, caster, [en]);
  const afterHit = [
    caster.attackCount - atk0,
    en.hasSlowFrom(caster.slowSource),
  ];
  tick(e, caster, [en]);
  const afterNext = [
    caster.attackCount - atk0,
    en.hasSlowFrom(caster.slowSource),
  ];
  check(
    "道路上生命 0 的張飛：這次更新照常攻擊一次、命中附加道路減速；下一次更新（還在冷卻、沒有攻擊）撤除道路減速",
    same(afterHit, [1, true]) && same(afterNext, [1, false]),
    { afterHit, afterNext }
  );
}
{
  const { e, caster } = auraSetup("hero_zhang_fei");
  const en = dummyAt(e, 4, 3);
  tick(e, caster, [en]);
  tick(e, caster, [en]);
  check(
    "對照：生命正的張飛，下一次更新道路減速仍刷新保留",
    en.hasSlowFrom(caster.slowSource) === true,
    { attackCount: caster.attackCount }
  );
}
{
  const { e, other } = auraSetup("hero_liu_bei");
  other.currentHp = 0;
  other.takeDamage(100, null, e.floatingTexts, e.soundManager);
  check(
    "生命 0 的武將受傷照既有規則略過：生命仍 0、沒有陣亡、仍在場上",
    other.currentHp === 0 && other.isDead === false && e.heroes.includes(other),
    { hp: other.currentHp, isDead: other.isDead }
  );
}

// ═══ C3：改目標的暫停／階段守門 ═══
for (const [label, prep, allowed] of [
  ["備戰", () => {}, true],
  ["戰鬥", (e) => e.battleManager.setState(GameState.BATTLE), true],
  ["備戰＋暫停", (e) => e.battleManager.setPaused("b1", true), false],
  [
    "戰鬥＋暫停",
    (e) => {
      e.battleManager.setState(GameState.BATTLE);
      e.battleManager.setPaused("b1", true);
    },
    false,
  ],
  ["結算", (e) => e.battleManager.setState(GameState.RESULT), false],
]) {
  const e = mkEngine("b1");
  e.placeTower(2, 1, "archer");
  const w = e.gameMap.gridToWorld(2, 1);
  e.handleCellClick(w.x, w.y);
  prep(e);
  const t = e.towers[0];
  const before = [
    t.targetMode,
    e.battleManager.battleGold,
    { ...e.selectedUnit },
  ];
  e.setTowerTargetMode(2, 1, "weakest");
  const after = [
    t.targetMode,
    e.battleManager.battleGold,
    { ...e.selectedUnit },
  ];
  check(
    allowed
      ? `${label}：改目標成功（第一 → 殘血），金幣與選取不變`
      : `${label}：改目標被拒，目標、金幣、選取都不變`,
    allowed
      ? after[0] === "weakest" && same(after.slice(1), before.slice(1))
      : same(after, before) && after[0] === "first",
    { before, after }
  );
}
{
  const e = mkEngine("b1");
  e.placeTower(2, 1, "archer");
  e.battleManager.setPaused("b1", true);
  e.setTowerTargetMode(2, 1, "weakest");
  const mid = e.towers[0].targetMode;
  e.battleManager.setPaused("b1", false);
  const afterResume = e.towers[0].targetMode;
  e.setTowerTargetMode(2, 1, "weakest");
  check(
    "暫停中改目標被拒；解除暫停本身不補送，新的呼叫才改成殘血",
    mid === "first" &&
      afterResume === "first" &&
      e.towers[0].targetMode === "weakest",
    { mid, afterResume, now: e.towers[0].targetMode }
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
