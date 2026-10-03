// 戰況觀測（utils/battleObservation）的網頁端規則測試，不需要瀏覽器：
// - game_ready 的 capabilities 列出 battle_observation 才使用；沒有這個欄位（舊版遊戲）、不是陣列都不用
// - 驗證：合理的一份（和遊戲送來的格式相同）採用；缺 battle_id、seq 0、NaN／無限大、負的生命或剩下時間、格式不對的 uid、
//   重複的武將 uid 或 hero_id、敵人 uid 和出兵世代不一致、敵人沒有依生成序號排序、總數和列出的不同、沒有受控卻帶來源、層數超過上限都整份不採用
// - 採用規則：只採用目前這一場（battle_id）；同一場只採用 lifecycle 較大、或 lifecycle 與出兵世代相同而 seq 較大的
// - ObservationTracker：沒有宣告時不採用；換一場（reset）後新的一場從頭採用
// - 面板：武將面板只對應同一場、同一位武將（hero_uid）；帶 battle_id 的面板只採用目前這一場，舊版遊戲沒有 battle_id 照舊採用
// - 敵軍分頁：39 隻是 20＋19、超出範圍拉回最後一頁、沒有敵人是 0 列；名稱、設定護甲、技能狀態文字
// 用法：node scripts/shenma-regression/web/battle-observation.test.mjs
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const UTILS = join(ROOT, "src/app/(games)/shenmaSanguo/utils");

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

const {
  hasObservationCapability,
  parseBattleObservation,
  isNewerObservation,
  ObservationTracker,
  liveHeroFor,
  isCurrentPanel,
  enemyPage,
  enemyName,
  configArmor,
  skillStateText,
  skillName,
} = require(join(UTILS, "battleObservation.ts"));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail).slice(0, 700)}`
  );
};
const clone = (o) => JSON.parse(JSON.stringify(o));

// 和遊戲送來的格式相同的一份（Main.battle_observation）
const enemy = (gen, seq, extra = {}) => ({
  uid: `${gen}-${seq}`,
  seq,
  enemy_id: "grunt_lv1",
  hp: 300,
  max_hp: 300,
  flying: false,
  charmed: false,
  charm_left: 0,
  charm_source: "",
  atk: 20,
  atk_eff: 20,
  atk_down_left: 0,
  speed: 80,
  speed_eff: 80,
  slow_left: 0,
  immune_slow: false,
  stun_left: 0,
  burn_left: 0,
  ...extra,
});
const sample = (over = {}) => ({
  __godot_bridge: true,
  type: "battle_observation",
  battle_id: "b1",
  lifecycle: 3,
  generation: 7,
  seq: 10,
  state: 2,
  paused: false,
  wave: 1,
  heroes: [
    {
      uid: "hero-4",
      hero_id: "gan_ning",
      cell: [3, 4],
      hp: 1235,
      max_hp: 1235,
      skill: { id: "assassinate", used: false, remaining: 1 },
    },
    {
      uid: "hero-5",
      hero_id: "diao_chan",
      cell: [5, 6],
      hp: 900,
      max_hp: 1294,
      skill: { id: "charm", remaining: 2.5, cooldown: 6 },
    },
    {
      uid: "hero-6",
      hero_id: "zhou_cang",
      cell: [6, 4],
      hp: 10,
      max_hp: 900,
      skill: {},
    },
  ],
  enemies: [
    enemy(7, 0),
    enemy(7, 2, { charmed: true, charm_left: 1.2, charm_source: "diao_chan" }),
    enemy(7, 5, { flying: true }),
  ],
  enemy_total: 3,
  ...over,
});

// ── 能力 ──
check(
  "O-1 game_ready 的 capabilities 列出 battle_observation 才使用；沒有欄位、不是陣列、別的名稱都不用",
  hasObservationCapability({
    type: "game_ready",
    protocol: 7,
    capabilities: ["battle_observation"],
  }) &&
    !hasObservationCapability({ type: "game_ready", protocol: 7 }) &&
    !hasObservationCapability({ capabilities: "battle_observation" }) &&
    !hasObservationCapability({ capabilities: ["other"] }) &&
    !hasObservationCapability(null)
);

// ── 驗證 ──
const ok = parseBattleObservation(sample());
check(
  "O-2 合理的一份採用：武將 3 位（沒有技能的是 null）、敵人 3 隻、受控的帶來源",
  !!ok &&
    ok.heroes.length === 3 &&
    ok.heroes[2].skill === null &&
    ok.enemies.length === 3 &&
    ok.enemies[1].charm_source === "diao_chan",
  ok
);
const BAD = {
  "type 不是 battle_observation": (o) => {
    o.type = "update_stats";
  },
  "缺 battle_id": (o) => {
    delete o.battle_id;
  },
  "seq 0": (o) => {
    o.seq = 0;
  },
  "seq 是小數": (o) => {
    o.seq = 1.5;
  },
  "state 4": (o) => {
    o.state = 4;
  },
  "paused 不是布林": (o) => {
    o.paused = 1;
  },
  "武將生命 NaN": (o) => {
    o.heroes[0].hp = NaN;
  },
  武將生命無限大: (o) => {
    o.heroes[0].hp = Infinity;
  },
  武將生命負數: (o) => {
    o.heroes[0].hp = -1;
  },
  "最大生命 0": (o) => {
    o.heroes[0].max_hp = 0;
  },
  冷卻剩下時間負數: (o) => {
    o.heroes[1].skill.remaining = -0.1;
  },
  "冷卻剩下時間 NaN": (o) => {
    o.heroes[1].skill.remaining = NaN;
  },
  "冷卻 0": (o) => {
    o.heroes[1].skill.cooldown = 0;
  },
  "used 不是布林": (o) => {
    o.heroes[0].skill.used = "no";
  },
  層數超過上限: (o) => {
    o.heroes[0].skill = { id: "berserk", stacks: 11, max_stacks: 10, atk: 100 };
  },
  "武將 uid 格式不對": (o) => {
    o.heroes[0].uid = "h4";
  },
  "重複的武將 uid": (o) => {
    o.heroes[1].uid = "hero-4";
  },
  "重複的 hero_id": (o) => {
    o.heroes[1].hero_id = "gan_ning";
  },
  格子不是兩個整數: (o) => {
    o.heroes[0].cell = [3];
  },
  "敵人 uid 和出兵世代不一致": (o) => {
    o.enemies[0].uid = "6-0";
  },
  敵人沒有依生成序號排序: (o) => {
    o.enemies.reverse();
  },
  重複的敵人: (o) => {
    o.enemies[1] = clone(o.enemies[0]);
  },
  總數和列出的不同: (o) => {
    o.enemy_total = 4;
  },
  沒有受控卻帶來源: (o) => {
    o.enemies[0].charm_source = "diao_chan";
  },
  敵人剩下時間負數: (o) => {
    o.enemies[0].stun_left = -1;
  },
  "敵人移速 NaN": (o) => {
    o.enemies[0].speed_eff = NaN;
  },
  "flying 不是布林": (o) => {
    o.enemies[0].flying = "no";
  },
};
const wrong = [];
for (const [name, mut] of Object.entries(BAD)) {
  const o = clone(sample());
  // 直接在物件上設定（NaN／無限大不經過 JSON，和遊戲 iframe 用 postMessage 送來的一樣保留）
  mut(o);
  if (parseBattleObservation(o) !== null) wrong.push(name);
}
check(
  `O-3 不合理的一份整份不採用（${Object.keys(BAD).length} 種）`,
  wrong.length === 0,
  wrong
);

// ── 採用規則 ──
const p = (over) => parseBattleObservation(sample(over));
const cur = p({});
check(
  "O-4 只採用目前這一場：battle_id 不同、還沒有這一場都不採用；第一份採用",
  !isNewerObservation(cur, p({ battle_id: "b0", seq: 99 }), "b1") &&
    !isNewerObservation(null, cur, null) &&
    isNewerObservation(null, cur, "b1")
);
check(
  "O-5 同一場：seq 較大才採用（相同、較小不採用）；lifecycle 較大採用、較小不採用；lifecycle 相同但出兵世代不同不採用",
  isNewerObservation(cur, p({ seq: 11 }), "b1") &&
    !isNewerObservation(cur, p({ seq: 10 }), "b1") &&
    !isNewerObservation(cur, p({ seq: 9 }), "b1") &&
    isNewerObservation(
      cur,
      p({ lifecycle: 4, seq: 1, generation: 8, enemies: [], enemy_total: 0 }),
      "b1"
    ) &&
    !isNewerObservation(cur, p({ lifecycle: 2, seq: 50 }), "b1") &&
    !isNewerObservation(
      cur,
      p({ generation: 8, seq: 11, enemies: [], enemy_total: 0 }),
      "b1"
    )
);
const t = new ObservationTracker();
const a1 = t.accept(sample({ seq: 1 }), "b1");
t.onReady({
  type: "game_ready",
  protocol: 7,
  capabilities: ["battle_observation"],
});
const a2 = t.accept(sample({ seq: 1 }), "b1");
const a3 = t.accept(sample({ seq: 1 }), "b1");
t.reset();
const a4 = t.accept(sample({ seq: 1, battle_id: "b2" }), "b2");
const a5 = t.accept(sample({ seq: 50, battle_id: "b1" }), "b2");
t.onReady({ type: "game_ready", protocol: 7 });
const a6 = t.accept(sample({ seq: 2, battle_id: "b2" }), "b2");
check(
  "O-6 ObservationTracker：沒有宣告前不採用；宣告後採用、同一份不再採用；換一場後新的一場從 seq 1 採用、上一場的不採用；舊版遊戲的 game_ready 之後不採用",
  a1 === null &&
    !!a2 &&
    a3 === null &&
    !!a4 &&
    a5 === null &&
    a6 === null &&
    t.capable === false
);

// ── 面板 ──
const panel = { unit_type: "hero", hero_uid: "hero-5", battle_id: "b1" };
check(
  "O-7 武將面板的即時資料：同一場、同一位（hero_uid）才有；防禦塔、別場、沒有 hero_uid（舊版遊戲）、場上沒有這位都沒有",
  liveHeroFor(panel, cur)?.hero_id === "diao_chan" &&
    liveHeroFor({ ...panel, unit_type: "tower" }, cur) === null &&
    liveHeroFor({ ...panel, battle_id: "b0" }, cur) === null &&
    liveHeroFor({ unit_type: "hero", battle_id: "b1" }, cur) === null &&
    liveHeroFor({ ...panel, hero_uid: "hero-9" }, cur) === null &&
    liveHeroFor(panel, null) === null
);
check(
  "O-8 面板的場次：帶 battle_id 的只採用目前這一場；沒有 battle_id（舊版遊戲的武將面板）照舊採用；battle_id 不是字串不採用",
  isCurrentPanel({ battle_id: "b1" }, "b1") &&
    !isCurrentPanel({ battle_id: "b0" }, "b1") &&
    isCurrentPanel({}, "b1") &&
    !isCurrentPanel({ battle_id: 1 }, "b1") &&
    !isCurrentPanel({ battle_id: "b1" }, null)
);

// ── 敵軍分頁與文字 ──
const list = Array.from({ length: 39 }, (_, i) => enemy(1, i));
const g0 = enemyPage(list, 0);
const g1 = enemyPage(list, 1);
const g9 = enemyPage(list, 9);
const g00 = enemyPage([], 3);
check(
  "O-9 敵軍分頁：39 隻是 20＋19（第 1～20、21～39 隻）；超出範圍拉回最後一頁；沒有敵人時 1 頁 0 列",
  g0.pages === 2 &&
    g0.rows.length === 20 &&
    g0.from === 1 &&
    g0.to === 20 &&
    g1.rows.length === 19 &&
    g1.from === 21 &&
    g1.to === 39 &&
    g9.page === 1 &&
    g00.pages === 1 &&
    g00.rows.length === 0 &&
    g00.from === 0,
  { g0: [g0.pages, g0.from, g0.to], g1: [g1.from, g1.to], g9: g9.page }
);
const cfg = [
  { enemy_id: "siege_lv1", name: "攻城車LV1", hp: 1, speed: 1, armor: 30 },
  { enemy_id: "grunt_lv1", name: " ", hp: 1, speed: 1, armor: 0 },
];
check(
  "O-10 敵人名稱照這一場的設定，設定裡沒有（或名稱空白）時是「未知敵軍（id）」；設定護甲只有正數才標示",
  enemyName("siege_lv1", cfg) === "攻城車LV1" &&
    enemyName("x_new", cfg) === "未知敵軍（x_new）" &&
    enemyName("grunt_lv1", cfg) === "未知敵軍（grunt_lv1）" &&
    configArmor("siege_lv1", cfg) === 30 &&
    configArmor("grunt_lv1", cfg) === null &&
    configArmor("x_new", cfg) === null
);
const texts = {
  charm0: skillStateText({ id: "charm", remaining: 0, cooldown: 6 }),
  charm: skillStateText({ id: "charm", remaining: 2.34, cooldown: 6 }),
  kb: skillStateText({ id: "knockback", remaining: 0, cooldown: 3 }),
  as0: skillStateText({ id: "assassinate", used: false, remaining: 1 }),
  as1: skillStateText({ id: "assassinate", used: true, remaining: 0 }),
  fs: skillStateText({ id: "first_strike", used: true }),
  burn: skillStateText({ id: "burn" }),
  aura: skillStateText({ id: "slow_aura", active: false, affected: 0 }),
  unknown: skillStateText({ id: "new_skill" }),
  name: skillName("diao_chan", { id: "charm" }),
  nameOther: skillName("diao_chan", { id: "stun" }),
};
check(
  "O-11 技能狀態文字照最新一份：魅惑「可以控制」「冷卻中，還剩 2.3 秒」、怪力「可以推動」、奇襲剩 1／0 次、衝鋒用過、火攻命中時觸發、光環沒有作用、不認得的技能「狀態不明」；名稱照隊伍的技能表",
  texts.charm0 === "可以控制" &&
    texts.charm === "冷卻中，還剩 2.3 秒" &&
    texts.kb === "可以推動" &&
    /剩 1 次/.test(texts.as0) &&
    /剩 0 次/.test(texts.as1) &&
    /已經用過/.test(texts.fs) &&
    /命中時觸發/.test(texts.burn) &&
    /沒有作用/.test(texts.aura) &&
    texts.unknown === "狀態不明" &&
    texts.name === "魅惑" &&
    texts.nameOther === "暈眩",
  texts
);

const failed = results.filter((r) => !r.pass).length;
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      total: results.length,
      failed,
      module: "battleObservation.ts",
    })
);
process.exit(failed ? 1 : 0);
