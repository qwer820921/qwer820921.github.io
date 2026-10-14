// 戰況觀測（utils/battleObservation）的網頁端規則測試，不需要瀏覽器：
// - game_ready 的 capabilities 列出 battle_observation 才使用；沒有這個欄位（舊版遊戲）、不是陣列都不用
// - 驗證：合理的一份（和遊戲送來的格式相同）採用；缺 battle_id、seq 0、NaN／無限大、負的生命或剩下時間、格式不對的 uid、
//   重複的武將 uid 或 hero_id、敵人 uid 和出兵世代不一致、敵人沒有依生成序號排序、總數和列出的不同、沒有受控卻帶來源、層數超過上限都整份不採用
// - 採用規則：只採用目前這一場（battle_id）；同一場只採用 lifecycle 較大、或 lifecycle 與出兵世代相同而 seq 較大的
// - ObservationTracker：沒有宣告時不採用；換一場（reset）後新的一場從頭採用
// - 面板：武將面板只對應同一場、同一位武將（hero_uid）；帶 battle_id 的面板只採用目前這一場，舊版遊戲沒有 battle_id 照舊採用
// - 敵軍分頁：39 隻是 20＋19、超出範圍拉回最後一頁、沒有敵人是 0 列；名稱、設定護甲、技能狀態文字
// - 敵軍的搜尋（中文名稱或 ID）與狀態篩選（受控／減速／暈眩／灼燒，多選 AND）、控制結束後自動不符合
// - 本波出兵進度（可選欄位 spawn）的驗證與說明：沒有欄位時不顯示、不合理時整份不採用
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
  filterEnemies,
  isEnemyQueryActive,
  EMPTY_ENEMY_QUERY,
  spawnProgressText,
  sortEnemies,
  filterHeroes,
  isHeroQueryActive,
  EMPTY_HERO_QUERY,
  LOW_HP_RATIO,
  heroSkillState,
  HERO_SKILL_FILTERS,
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

// ── 敵軍的搜尋與狀態篩選 ──
const ecfg = [
  { enemy_id: "grunt_lv1", name: "步兵LV1", hp: 1, speed: 1 },
  { enemy_id: "cavalry_lv1", name: "騎兵LV1", hp: 1, speed: 1 },
  { enemy_id: "siege_lv1", name: "攻城車LV1", hp: 1, speed: 1 },
];
// 39 隻：同一種敵人有很多隻；每 3 隻輪一種；第 0～9 隻受控、偶數隻灼燒、第 5 的倍數減速、第 7 的倍數暈眩
const many = Array.from({ length: 39 }, (_, i) =>
  enemy(1, i, {
    enemy_id: ["grunt_lv1", "cavalry_lv1", "siege_lv1"][i % 3],
    ...(i < 10
      ? { charmed: true, charm_left: 1, charm_source: "diao_chan" }
      : {}),
    burn_left: i % 2 === 0 ? 1.5 : 0,
    slow_left: i % 5 === 0 ? 0.4 : 0,
    speed_eff: i % 5 === 0 ? 24 : 80,
    stun_left: i % 7 === 0 ? 0.3 : 0,
  })
);
const q = (text, statuses = []) =>
  filterEnemies(many, { text, statuses }, ecfg);
const byName = q("騎兵");
const byId = q(" SIEGE_LV1 ");
const charmed = q("", ["charmed"]);
const charmedBurning = q("", ["charmed", "burning"]);
const charmedBurningGrunt = q("步兵", ["charmed", "burning"]);
const slowedStunned = q("", ["slowed", "stunned"]);
const none = q("不存在的敵人");
const pgf = enemyPage(q("", ["burning"]), 1);
check(
  "O-12 敵軍搜尋與狀態篩選：中文名稱的一部分（騎兵 13 隻）或 enemy_id（不分大小寫、去掉前後空白；攻城車 13 隻）；狀態多選是 AND（受控 10、受控且灼燒 5、再加搜尋步兵 2、減速且暈眩 2：第 0、35 隻）；沒有符合是 0 隻；順序仍依出場；篩選後照樣每頁 20（灼燒 20 隻是 1 頁）",
  byName.length === 13 &&
    byName.every((e) => e.enemy_id === "cavalry_lv1") &&
    byId.length === 13 &&
    charmed.length === 10 &&
    charmedBurning.length === 5 &&
    charmedBurningGrunt.length === 2 &&
    charmedBurningGrunt.every(
      (e) => e.enemy_id === "grunt_lv1" && e.charmed && e.burn_left > 0
    ) &&
    slowedStunned.length === 2 &&
    slowedStunned.map((e) => e.seq).join() === "0,35" &&
    none.length === 0 &&
    charmed.every((e, i, a) => i === 0 || a[i - 1].seq < e.seq) &&
    pgf.pages === 1 &&
    pgf.rows.length === 20 &&
    !isEnemyQueryActive(EMPTY_ENEMY_QUERY) &&
    isEnemyQueryActive({ text: " 步 ", statuses: [] }) &&
    !isEnemyQueryActive({ text: "  ", statuses: [] }),
  {
    byName: byName.length,
    byId: byId.length,
    charmed: charmed.length,
    charmedBurning: charmedBurning.length,
    grunt: charmedBurningGrunt.length,
    slowedStunned: slowedStunned.map((e) => e.seq),
    pgf: [pgf.pages, pgf.rows.length],
  }
);
// 控制結束（下一份觀測裡不再受控）：自動不符合「受控」；符合數和總數分開
const next = many.map((e) =>
  e.seq === 3 ? { ...e, charmed: false, charm_left: 0, charm_source: "" } : e
);
const afterEnd = filterEnemies(next, { text: "", statuses: ["charmed"] }, ecfg);
check(
  "O-13 控制結束後（下一份觀測不再受控）：那一隻不再符合「受控」（10→9），總數仍是 39；同 ID 的多隻各自判斷",
  afterEnd.length === 9 &&
    !afterEnd.some((e) => e.seq === 3) &&
    next.length === 39,
  { after: afterEnd.length }
);

// ── 本波出兵進度（可選欄位 spawn）──
const sp = (s, over = {}) =>
  parseBattleObservation(
    sample({
      spawn: {
        wave: 1,
        planned: 10,
        spawned: 4,
        pending: 6,
        alive: 3,
        killed: 1,
        leaked: 0,
        spawning: true,
        ...s,
      },
      ...over,
    })
  );
const spOk = sp({});
const spMissing = parseBattleObservation(sample());
const spBad = {
  "已出＋待出不等於計畫": sp({ pending: 5 }),
  負數: sp({ killed: -1 }),
  小數: sp({ spawned: 4.5, pending: 5.5 }),
  "倒下＋漏城＋存活超過已出": sp({ alive: 3, killed: 2 }),
  存活超過場上總數: sp({ alive: 4, killed: 0 }),
  "wave 0 卻有計畫": sp({ wave: 0 }),
  spawning不是布林: sp({ spawning: 1 }),
  不是物件: parseBattleObservation(sample({ spawn: [1, 2] })),
};
check(
  "O-14 本波出兵進度：合理的一份採用；沒有這個欄位（舊版遊戲）時 spawn 是 null、整份照常採用；已出＋待出≠計畫、負數、小數、倒下＋漏城＋存活超過已出、存活超過場上總數、wave 0 卻有計畫、spawning 不是布林、不是物件都整份不採用",
  spOk &&
    spOk.spawn &&
    spOk.spawn.planned === 10 &&
    spMissing &&
    spMissing.spawn === null &&
    Object.values(spBad).every((v) => v === null),
  {
    ok: spOk && spOk.spawn,
    missing: spMissing && spMissing.spawn,
    bad: Object.entries(spBad)
      .filter(([, v]) => v !== null)
      .map(([k]) => k),
  }
);
const txt = (s, over = {}) =>
  spawnProgressText(parseBattleObservation(sample({ spawn: s, ...over })));
const T = {
  prep: txt(
    {
      wave: 0,
      planned: 0,
      spawned: 0,
      pending: 0,
      alive: 0,
      killed: 0,
      leaked: 0,
      spawning: false,
    },
    { state: 1, enemies: [], enemy_total: 0 }
  ),
  spawning: txt({
    wave: 2,
    planned: 10,
    spawned: 4,
    pending: 6,
    alive: 3,
    killed: 1,
    leaked: 0,
    spawning: true,
  }),
  clearing: txt({
    wave: 2,
    planned: 10,
    spawned: 10,
    pending: 0,
    alive: 2,
    killed: 7,
    leaked: 1,
    spawning: false,
  }),
  cleared: txt(
    {
      wave: 2,
      planned: 4,
      spawned: 4,
      pending: 0,
      alive: 0,
      killed: 3,
      leaked: 1,
      spawning: false,
    },
    { enemies: [], enemy_total: 0 }
  ),
  result: txt(
    {
      wave: 3,
      planned: 4,
      spawned: 4,
      pending: 0,
      alive: 0,
      killed: 4,
      leaked: 0,
      spawning: false,
    },
    { state: 3, enemies: [], enemy_total: 0 }
  ),
  old: spawnProgressText(parseBattleObservation(sample())),
};
check(
  "O-15 本波出兵進度的說明：備戰還沒出兵；出兵中寫「已出 4／10、待出 6、場上 3」；出完還有敵人是清場中；出完也清場；結算寫最後一波；舊版遊戲（沒有欄位）不顯示",
  /備戰中，還沒開始出兵/.test(T.prep) &&
    /第 2 波出兵中：已出 4／10、待出 6、場上 3/.test(T.spawning) &&
    /已全部出完（10 隻）：清場中，場上 3/.test(T.clearing) &&
    /已全部出完並清場（擊殺 3、漏城 1）/.test(T.cleared) &&
    /已結算：第 3 波已出 4／4/.test(T.result) &&
    T.old === null,
  T
);

// ── 敵軍的排序（過濾之後、分頁之前；同數值依出場順序）──
const sortList = [
  enemy(2, 0, { hp: 50, max_hp: 100, atk: 10, atk_eff: 10 }),
  enemy(2, 1, { hp: 30, max_hp: 300, atk: 30, atk_eff: 15 }),
  enemy(2, 2, { hp: 10, max_hp: 100, atk: 30, atk_eff: 30 }),
  enemy(2, 3, { hp: 200, max_hp: 400, atk: 20, atk_eff: 30 }),
  enemy(2, 4, { hp: 100, max_hp: 100, atk: 5, atk_eff: 5 }),
];
const seqs = (l) => l.map((e) => e.seq).join(",");
const shuffled = [
  sortList[3],
  sortList[0],
  sortList[4],
  sortList[2],
  sortList[1],
];
const sortedHp = sortEnemies(shuffled, "hp");
const sortedAtk = sortEnemies(shuffled, "atk");
const sortedSpawn = sortEnemies(shuffled, "spawn");
// 45 隻、其中 30 隻灼燒（seq 不是 3 的倍數），生命比例隨 seq 變小
const burningMix = Array.from({ length: 45 }, (_, i) =>
  enemy(3, i, { burn_left: i % 3 ? 1 : 0, hp: 500 - i, max_hp: 500 })
);
const sortPaged = enemyPage(
  sortEnemies(
    filterEnemies(burningMix, { text: "", statuses: ["burning"] }, ecfg),
    "hp"
  ),
  1
);
check(
  "O-16 敵軍排序：生命比例由低到高（10%、10%、50%、50%、100%；同比例依出場順序 1 在 2 前、0 在 3 前）、有效攻擊力由高到低（30、30 依出場順序 2 在 3 前）、" +
    "出場順序依 seq；不改原本的陣列；先過濾再排序再分頁（45 隻裡灼燒的 30 隻依生命比例排序後，第 2 頁是第 21～30 隻、都是灼燒、比例一路不減）",
  seqs(sortedHp) === "1,2,0,3,4" &&
    seqs(sortedAtk) === "2,3,1,0,4" &&
    seqs(sortedSpawn) === "0,1,2,3,4" &&
    seqs(shuffled) === "3,0,4,2,1" &&
    sortPaged.from === 21 &&
    sortPaged.rows.length === 10 &&
    sortPaged.rows.every((e) => e.burn_left > 0) &&
    sortPaged.rows.every(
      (e, i, a) => i === 0 || e.hp / e.max_hp >= a[i - 1].hp / a[i - 1].max_hp
    ),
  {
    hp: seqs(sortedHp),
    atk: seqs(sortedAtk),
    spawn: seqs(sortedSpawn),
    page: sortPaged.from,
  }
);

// ── 已部署武將的搜尋、受傷／低生命篩選與排序 ──
const hcfg = [
  { hero_id: "gan_ning", name: "甘寧" },
  { hero_id: "diao_chan", name: "貂蟬" },
  { hero_id: "guan_yu", name: "關羽" },
];
const hero = (n, heroId, hp, maxHp) => ({
  uid: `hero-${n}`,
  hero_id: heroId,
  cell: [n, 1],
  hp,
  max_hp: maxHp,
  skill: null,
});
// 同一位武將（關羽）部署兩位；低生命的門檻 30%（剛好 30% 算低生命）
const heroes = [
  hero(12, "guan_yu", 300, 1000),
  hero(3, "gan_ning", 1235, 1235),
  hero(7, "diao_chan", 1000, 1294),
  hero(10, "guan_yu", 1000, 1000),
  hero(11, "diao_chan", 100, 1294),
];
const uids = (l) => l.map((h) => h.uid.slice(5)).join(",");
const hq = (over) =>
  filterHeroes(heroes, { ...EMPTY_HERO_QUERY, ...over }, hcfg);
const H = {
  all: uids(hq({})),
  guan: uids(hq({ text: "關羽" })),
  id: uids(hq({ text: " GUAN_YU " })),
  injured: uids(hq({ health: "injured" })),
  low: uids(hq({ health: "low" })),
  hpSort: uids(hq({ sort: "hp" })),
  lowGuan: uids(hq({ text: "關", health: "low" })),
  none: hq({ text: "不存在" }).length,
  unknownName: uids(
    filterHeroes(
      [hero(20, "zhou_cang", 50, 100)],
      { ...EMPTY_HERO_QUERY, text: "zhou" },
      hcfg
    )
  ),
};
check(
  "O-17 武將：預設依部署順序（uid 流水號 3、7、10、11、12）；搜尋中文名稱或 ID（不分大小寫、去空白）時同一位武將的兩個實例都列出；" +
    "受傷＝生命少於最大生命；低生命＝比例 ≤ 30%（剛好 30% 算）；生命比例由低到高（同比例依部署順序）；條件可以疊加；沒有符合是 0；設定裡沒有的武將用 ID 搜尋",
  H.all === "3,7,10,11,12" &&
    H.guan === "10,12" &&
    H.id === "10,12" &&
    H.injured === "7,11,12" &&
    H.low === "11,12" &&
    H.hpSort === "11,12,7,3,10" &&
    H.lowGuan === "12" &&
    H.none === 0 &&
    H.unknownName === "20" &&
    LOW_HP_RATIO === 0.3,
  H
);
check(
  "O-18 武將篩選的狀態：只改排序不算篩選（不顯示符合數）；有搜尋或生命狀態才算；不改原本的陣列",
  !isHeroQueryActive({ ...EMPTY_HERO_QUERY, sort: "hp" }) &&
    isHeroQueryActive({ ...EMPTY_HERO_QUERY, text: " 關 " }) &&
    isHeroQueryActive({ ...EMPTY_HERO_QUERY, health: "low" }) &&
    !isHeroQueryActive({ ...EMPTY_HERO_QUERY, text: "  " }) &&
    uids(heroes) === "12,3,7,10,11",
  null
);

// ── 技能狀態篩選（只認明列的欄位）──
const sk = (n, heroId, skill, hp = 1000, maxHp = 1000) => ({
  ...hero(n, heroId, hp, maxHp),
  skill,
});
const skillHeroes = [
  sk(1, "xu_chu", { id: "knockback", remaining: 2.4, cooldown: 3 }),
  sk(2, "diao_chan", { id: "charm", remaining: 0, cooldown: 6 }),
  sk(3, "diao_chan", { id: "charm", cooldown: 6 }),
  sk(4, "ma_chao", { id: "first_strike", used: true }, 200, 1000),
  sk(5, "gan_ning", { id: "assassinate", used: false }),
  sk(6, "gan_ning", { id: "assassinate" }),
  sk(7, "zhou_cang", null, 250, 1000),
  sk(8, "guan_yu", { id: "slow_aura", active: true }),
  sk(9, "mystery", { id: "unknown_skill", remaining: 5, used: true }),
  sk(10, "lv_bu", { id: "berserk", stacks: 0, max_stacks: 5, atk: 80 }),
];
const before = JSON.stringify(skillHeroes);
const sq = (over) =>
  uids(filterHeroes(skillHeroes, { ...EMPTY_HERO_QUERY, ...over }, hcfg));
const SK = {
  states: skillHeroes.map((h) => heroSkillState(h) ?? "-").join(","),
  cooldown: sq({ skill: "cooldown" }),
  used: sq({ skill: "used" }),
  none: sq({ skill: "none" }),
  all: sq({ skill: "all" }),
};
check(
  "O-19 技能狀態：冷卻中只認怪力／魅惑而且 remaining > 0（2.4 秒算，0 秒與缺 remaining 不算）；本場已用過只認衝鋒／奇襲而且 used 是 true（false、缺欄位不算）；" +
    "無特殊技能只認 skill: null（周倉）；不認得的技能（即使帶 remaining／used）、常駐（減速光環）、層數（戰神）都不屬於任何一種；全部照部署順序列出",
  SK.states === "cooldown,-,-,used,-,-,none,-,-,-" &&
    SK.cooldown === "1" &&
    SK.used === "4" &&
    SK.none === "7" &&
    SK.all === "1,2,3,4,5,6,7,8,9,10" &&
    HERO_SKILL_FILTERS.map((f) => f.id).join(",") === "all,cooldown,used,none",
  SK
);
const AND = {
  usedLow: sq({ skill: "used", health: "low" }),
  usedLowText: sq({ skill: "used", health: "low", text: "不存在" }),
  noneInjured: sq({ skill: "none", health: "injured" }),
  noneLowSortHp: sq({ skill: "none", health: "low", sort: "hp" }),
  cooldownText: sq({ skill: "cooldown", text: "XU" }),
  cooldownDiaoChan: sq({ skill: "cooldown", text: "貂蟬" }),
};
check(
  "O-20 技能狀態和搜尋、生命篩選一起（AND）：已用過＋低生命（馬超 20%）、加上搜不到的文字是 0；無特殊技能＋受傷（周倉）；冷卻中＋ID 搜尋（xu）；" +
    "冷卻中＋貂蟬（0 秒與缺欄位的貂蟬都不算）是 0；技能狀態算篩選（顯示符合數）、只改排序不算；不改原本的陣列",
  AND.usedLow === "4" &&
    AND.usedLowText === "" &&
    AND.noneInjured === "7" &&
    AND.noneLowSortHp === "7" &&
    AND.cooldownText === "1" &&
    AND.cooldownDiaoChan === "" &&
    isHeroQueryActive({ ...EMPTY_HERO_QUERY, skill: "used" }) &&
    !isHeroQueryActive({ ...EMPTY_HERO_QUERY, sort: "hp" }) &&
    JSON.stringify(skillHeroes) === before,
  AND
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
