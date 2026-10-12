// 神馬三國 JS 版的開波與出兵／自動下一波計時（純 Node、不連網）
// - 用真正的 engine/BattleEngine.ts（loadStage、gameLoop）、engine/BattleManager.ts、engine/WaveManager.ts、engine/entities/EnemyEntity.ts；
//   期待值照 Godot 版 BattleManager.gd／WaveManager.gd 與原生 Timer 的規則手寫：先 plan、沒有可生成的組就拒絕（波次不前進、不進戰鬥）；
//   每組第一隻開戰時同步生成，之後每隻等 max(間隔, 0.0001) 秒遊戲時間、扣到小於 0 才生成、每次處理最多一隻、超過的時間不帶入；
//   自動下一波等 1.5 秒遊戲時間（暫停不扣、照目前倍率扣）
// - 遊戲迴圈用固定的時間戳直接呼叫真正的 gameLoop：62.5 毫秒（0.0625 秒，二進位能精確表示，剛好扣到 0 的情況是確定的），
//   部署選單 0.1 倍時用 80 毫秒（避開剛好整除）。敵人是幾乎不動的木樁；清波用受控擊殺（takeDamage 大數值），不是自然戰鬥
// - 假的依賴只有畫面：BattleEngine 傳入一個什麼都不畫的 renderer；requestAnimationFrame 換成不排程的空函式；音效在 Node 沒有 AudioContext，照原本的程式靜默略過
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/waveTiming.test.mjs"
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

globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};

const { BattleEngine } = require(join(HERE, "../engine/BattleEngine.ts"));
const { GameState } = require(join(HERE, "../engine/BattleManager.ts"));
const { WaveManager, waveGroupCount, waveGroupInterval } = require(
  join(HERE, "../engine/WaveManager.ts")
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

// ═══ 合成關：兩條路（第 3、6 列）；敵人幾乎不動（速度 0.01 px/s），測試期間不會漏到基地 ═══
const RENDERER = { init() {}, resize() {}, render() {}, destroy() {} };
const PATH = {
  cols: 14,
  rows: 10,
  paths: {
    path_a: [
      [0, 3],
      [13, 3],
    ],
    path_b: [
      [0, 6],
      [13, 6],
    ],
  },
  base: [13, 3],
  build_zones: [[2, 1]],
};
const ENEMIES = [
  { enemy_id: "e_a", hp: 100, speed: 0.01, atk: 1 },
  { enemy_id: "e_b", hp: 100, speed: 0.01, atk: 1 },
  // 很快的敵人：開戰後第一次處理的敵人更新就抵達基地（漏怪清波）
  { enemy_id: "e_fast", hp: 100, speed: 1000000, atk: 1 },
];
const W = (wave, enemies) => ({ wave, enemies });
/** 一組：interval 給 undefined 時不放這個鍵 */
const G = (enemy_id, count, interval, path = "path_a") => {
  const g = { enemy_id, count, path };
  if (interval !== undefined) g.interval = interval;
  return g;
};
const payload = (battleId, waves, totalWaves) => ({
  stageId: "chapter1_1",
  battleId,
  totalWaves,
  pathJson: JSON.stringify(PATH),
  waves,
  heroesConfig: [],
  enemiesConfig: ENEMIES,
});

/** 新引擎＋紀錄：生成（第幾次 tick、敵人、生成序號）、同步、拒絕、整波生成完、清波 */
function mk(waves, totalWaves, battleId = "b1") {
  const e = new BattleEngine(RENDERER);
  e.loadStage(payload(battleId, waves, totalWaves));
  e.lastTimestamp = 1000;
  const log = {
    tick: 0,
    spawns: [],
    stats: [],
    rejected: [],
    allSpawned: [],
    cleared: [],
  };
  const ctx = { e, log };
  bindLog(ctx);
  return ctx;
}
function bindLog(ctx) {
  const { e, log } = ctx;
  e.waveManager.onEnemySpawned = (en) =>
    log.spawns.push([log.tick, en.enemyId, en.spawnSeq]);
  e.waveManager.onWaveAllSpawned = (n) => log.allSpawned.push([log.tick, n]);
  e.onStatsUpdated = (s) =>
    log.stats.push([log.tick, s.game_state, s.wave, s.auto_next_wave_pending]);
  e.onWaveRejected = (w, r) => log.rejected.push([log.tick, w, r]);
  const cleared = e.waveManager.onWaveCleared;
  e.waveManager.onWaveCleared = (n) => {
    log.cleared.push([log.tick, n]);
    cleared(n);
  };
}
/** 跑 n 次 gameLoop（每次 ms 毫秒），tick 從 1 起算 */
function ticks(ctx, n, ms = 62.5) {
  for (let i = 0; i < n; i++) {
    ctx.log.tick++;
    ctx.e.gameLoop(ctx.e.lastTimestamp + ms);
  }
}
/** 跑到條件成立為止（最多 limit 次），回傳成立時的 tick（沒成立回 -1） */
function ticksUntil(ctx, cond, limit, ms = 62.5) {
  for (let i = 0; i < limit; i++) {
    ticks(ctx, 1, ms);
    if (cond()) return ctx.log.tick;
  }
  return -1;
}
const bm = (ctx) => ctx.e.battleManager;
const killAll = (ctx) => {
  for (const en of ctx.e.waveManager.activeEnemies.slice()) {
    en.takeDamage(1e12);
  }
};
const spawnTicks = (ctx) => ctx.log.spawns.map((s) => s[0]);
const sawBattle = (ctx) => ctx.log.stats.some((s) => s[1] === GameState.BATTLE);

// ═══ D9：沒有可生成的組一律拒絕（波次不前進、不進戰鬥、重按仍是同一波） ═══
const REJECTS = [
  [
    "缺這一波的資料（只有第 2 波）",
    [W(2, [G("e_a", 1, 0)])],
    2,
    "wave_missing",
  ],
  ["關卡沒有任何波次（總波數 0）", [], 0, "wave_missing"],
  ["enemies 不是陣列", [{ wave: 1, enemies: "x" }], 1, "wave_empty"],
  ["enemies 是空陣列", [W(1, [])], 1, "wave_empty"],
  [
    "全部是空白列",
    [W(1, [{ enemy_id: "" }, { enemy_id: "  " }])],
    1,
    "wave_empty",
  ],
  [
    "全部無效（找不到敵人、路線沒有路點、數量 0）",
    [
      W(1, [
        { enemy_id: "nope", count: 1 },
        { enemy_id: "e_a", count: 1, path: "path_empty" },
        { enemy_id: "e_a", count: 0, path: "path_a" },
      ]),
    ],
    1,
    "enemy_not_found",
  ],
];
for (const [label, waves, total, reason] of REJECTS) {
  const ctx = mk(waves, total);
  bm(ctx).playerStartBattle();
  const st1 = {
    state: bm(ctx).gameState,
    wave: bm(ctx).currentWave,
    enemies: ctx.e.waveManager.activeEnemies.length,
    rejected: ctx.log.rejected.slice(),
    battle: sawBattle(ctx),
  };
  check(
    `拒絕開戰：${label}：拒絕第 1 波（${reason}），仍是備戰、波次 0、沒有敵人、同步從未出現戰鬥中`,
    st1.state === GameState.PREP &&
      st1.wave === 0 &&
      st1.enemies === 0 &&
      same(st1.rejected, [[0, 1, reason]]) &&
      !st1.battle,
    st1
  );
  ticks(ctx, 3);
  bm(ctx).playerStartBattle();
  check(
    `拒絕開戰：${label}：之後重按仍是第 1 波、再拒絕一次，波次不前進`,
    same(ctx.log.rejected, [
      [0, 1, reason],
      [3, 1, reason],
    ]) &&
      bm(ctx).currentWave === 0 &&
      bm(ctx).gameState === GameState.PREP &&
      !sawBattle(ctx),
    { rejected: ctx.log.rejected, wave: bm(ctx).currentWave }
  );
}
{
  const ctx = mk([W(2, [G("e_a", 1, 0)])], 2);
  bm(ctx).toggleAutoMode();
  check(
    "拒絕開戰：自動模式在備戰中打開時第 1 波被拒：自動關閉、仍是備戰、波次 0、同步從未出現戰鬥中",
    bm(ctx).autoMode === false &&
      bm(ctx).gameState === GameState.PREP &&
      bm(ctx).currentWave === 0 &&
      same(ctx.log.rejected, [[0, 1, "wave_missing"]]) &&
      !sawBattle(ctx),
    { auto: bm(ctx).autoMode, rejected: ctx.log.rejected, stats: ctx.log.stats }
  );
}
{
  const ctx = mk(
    [
      W(1, [
        { enemy_id: "nope", count: 2, interval: 0.1, path: "path_a" },
        { enemy_id: "e_b", count: 2, interval: 0.1, path: "path_empty" },
        { enemy_id: "" },
        G("e_a", 2, 0.5, "path_b"),
      ]),
    ],
    1
  );
  let planCalls = 0;
  const plan = ctx.e.waveManager.planWave.bind(ctx.e.waveManager);
  ctx.e.waveManager.planWave = (n) => {
    planCalls++;
    return plan(n);
  };
  bm(ctx).playerStartBattle();
  const rep = ctx.e.waveManager.getLastPlanReport();
  check(
    "混合無效組：照常開第 1 波，有效組第一隻立刻生成；略過的兩組照實記原因（空白列不記）；這一波只 plan 一次",
    bm(ctx).gameState === GameState.BATTLE &&
      bm(ctx).currentWave === 1 &&
      same(ctx.log.spawns, [[0, "e_a", 0]]) &&
      same(rep.skipped, [
        {
          index: 1,
          enemy_id: "nope",
          path: "path_a",
          reason: "enemy_not_found",
        },
        { index: 2, enemy_id: "e_b", path: "path_empty", reason: "path_empty" },
      ]) &&
      ctx.log.rejected.length === 0 &&
      planCalls === 1,
    { spawns: ctx.log.spawns, rep, planCalls, state: bm(ctx).gameState }
  );
  check(
    "混合無效組：同步只有一次從備戰變成戰鬥中（第 1 波）",
    ctx.log.stats.filter(
      (s, i, a) =>
        s[1] === GameState.BATTLE &&
        (i === 0 || a[i - 1][1] !== GameState.BATTLE)
    ).length === 1,
    ctx.log.stats
  );
}

// ═══ 一次性開波資料：只能開始一次；換場（新世代、新場次）後不能開始 ═══
{
  const ctx = mk([W(1, [G("e_a", 2, 1)])], 1);
  const wm = new WaveManager();
  wm.setup([W(1, [G("e_a", 2, 1)])], ENEMIES, ctx.e.gameMap);
  const p = wm.prepareWave(1);
  const first = wm.startPreparedWave(p);
  const second = wm.startPreparedWave(p);
  check(
    "一次性開波資料：第一次開始成功、生成 1 隻；同一份再開始被拒、不多生成",
    first === true && second === false && wm.activeEnemies.length === 1,
    { first, second, n: wm.activeEnemies.length }
  );
  const p2 = wm.prepareWave(1);
  wm.setup([W(1, [G("e_a", 2, 1)])], ENEMIES, ctx.e.gameMap);
  const stale = wm.startPreparedWave(p2);
  check(
    "一次性開波資料：換場（新世代）之前產生的資料不能開始，新場沒有敵人",
    stale === false && wm.activeEnemies.length === 0,
    { stale, n: wm.activeEnemies.length }
  );
}
{
  const ctx = mk([W(1, [G("e_a", 2, 1)])], 1);
  const prepared = bm(ctx).onPrepareWave(1);
  ctx.e.loadStage(payload("b2", [W(1, [G("e_a", 2, 1)])], 1));
  bindLog(ctx);
  const ok = prepared.ok && prepared.start();
  check(
    "一次性開波資料：上一場（b1）產生的資料在換成 b2 之後開始被拒，b2 沒有敵人、仍是備戰",
    ok === false &&
      ctx.e.waveManager.activeEnemies.length === 0 &&
      bm(ctx).gameState === GameState.PREP,
    { ok, n: ctx.e.waveManager.activeEnemies.length }
  );
}

// ═══ 同步回呼裡換場：舊場的資料不開始、舊世代不再生成、不碰新場的計數 ═══
{
  const ctx = mk([W(1, [G("e_a", 2, 0)])], 1);
  let done = false;
  ctx.e.onStatsUpdated = (s) => {
    if (!done && s.game_state === GameState.BATTLE) {
      done = true;
      ctx.e.loadStage(payload("b2", [W(1, [G("e_b", 1, 0, "path_b")])], 1));
    }
  };
  bm(ctx).playerStartBattle();
  const after = {
    battleId: bm(ctx).battleId,
    state: bm(ctx).gameState,
    wave: bm(ctx).currentWave,
    enemies: ctx.e.waveManager.activeEnemies.length,
    tasks: ctx.e.waveManager.activeSpawningTasks.length,
  };
  check(
    "同步回呼換場：進入戰鬥的同步裡換成 b2，舊場的開波資料不開始：b2 仍是備戰、波次 0、沒有敵人與出兵工作",
    done &&
      same(after, {
        battleId: "b2",
        state: GameState.PREP,
        wave: 0,
        enemies: 0,
        tasks: 0,
      }),
    after
  );
}
{
  const ctx = mk([W(1, [G("e_a", 3, 0), G("e_b", 2, 0, "path_b")])], 1);
  let done = false;
  const seen = [];
  ctx.e.waveManager.onEnemySpawned = (en) => {
    seen.push([ctx.log.tick, en.enemyId, en.spawnSeq, bm(ctx).battleId]);
    if (!done) {
      done = true;
      ctx.e.loadStage(payload("b2", [W(1, [G("e_b", 1, 0, "path_b")])], 1));
    }
  };
  bm(ctx).playerStartBattle();
  ticks(ctx, 5);
  const mid = {
    seen: seen.slice(),
    enemies: ctx.e.waveManager.activeEnemies.length,
    tasks: ctx.e.waveManager.activeSpawningTasks.length,
    state: bm(ctx).gameState,
    wave: bm(ctx).currentWave,
  };
  check(
    "同步回呼換場：第一隻生成的通知裡換成 b2：舊場只生成那一隻（第二組與後續都不生成），b2 沒有敵人與出兵工作、仍是備戰",
    same(mid, {
      seen: [[0, "e_a", 0, "b1"]],
      enemies: 0,
      tasks: 0,
      state: GameState.PREP,
      wave: 0,
    }),
    mid
  );
  bm(ctx).playerStartBattle();
  check(
    "同步回呼換場：b2 開戰照常，生成序號從 0 開始、只生成 b2 的那一隻",
    same(seen.slice(1), [[5, "e_b", 0, "b2"]]) &&
      bm(ctx).currentWave === 1 &&
      ctx.e.waveManager.activeEnemies.length === 1,
    { seen, wave: bm(ctx).currentWave }
  );
}

// ═══ D10 前：出兵時點（62.5 毫秒一次，1 倍）。第 0 次＝開戰當下（同步） ═══
const SPAWN_CASES = [
  ["間隔 1 秒", 3, 1, [0, 17, 34]],
  ["間隔缺鍵（＝1 秒）", 3, undefined, [0, 17, 34]],
  ["間隔 0（合法，等 0.0001 秒）", 4, 0, [0, 1, 2, 3]],
  ["間隔 -1（當 0）", 4, -1, [0, 1, 2, 3]],
  ["間隔 0.0625（剛好一次的時間，扣到 0 不生成）", 3, 0.0625, [0, 2, 4]],
  ["間隔 0.05（小於一次）", 3, 0.05, [0, 1, 2]],
  ["間隔 0.07（略大於一次）", 3, 0.07, [0, 2, 4]],
];
for (const [label, count, interval, expectTicks] of SPAWN_CASES) {
  const ctx = mk([W(1, [G("e_a", count, interval)])], 1);
  bm(ctx).playerStartBattle();
  ticks(ctx, 40);
  check(
    `出兵時點：${label}：第 ${expectTicks.join("、")} 次生成，每次最多一隻`,
    same(spawnTicks(ctx), expectTicks) &&
      same(ctx.log.allSpawned, [[expectTicks[expectTicks.length - 1], 1]]),
    { spawns: ctx.log.spawns, all: ctx.log.allSpawned }
  );
}
{
  const ctx = mk([W(1, [G("e_a", 3, 0.5), G("e_b", 2, 0.25, "path_b")])], 1);
  bm(ctx).playerStartBattle();
  ticks(ctx, 30);
  check(
    "出兵時點：兩組兩路（0.5 秒 3 隻、0.25 秒 2 隻）：兩組第一隻都在開戰當下，各自倒數；整波生成完只通知一次（最後一組完成時）",
    same(ctx.log.spawns, [
      [0, "e_a", 0],
      [0, "e_b", 1],
      [5, "e_b", 2],
      [9, "e_a", 3],
      [18, "e_a", 4],
    ]) && same(ctx.log.allSpawned, [[18, 1]]),
    { spawns: ctx.log.spawns, all: ctx.log.allSpawned }
  );
}
{
  const ctx = mk([W(1, [G("e_a", 5, 0.01)])], 1);
  bm(ctx).setSpeed("b1", 2);
  bm(ctx).playerStartBattle();
  ticks(ctx, 10);
  check(
    "出兵時點：2 倍下每次 0.125 秒、間隔 0.01：每次只生成一隻，不在同一次追補（第 0～4 次）",
    same(spawnTicks(ctx), [0, 1, 2, 3, 4]),
    ctx.log.spawns
  );
}
{
  const ctx = mk([W(1, [G("e_a", 2, 1)])], 1);
  bm(ctx).playerStartBattle();
  ticks(ctx, 8);
  bm(ctx).setPaused("b1", true);
  const bt = bm(ctx).battleTime;
  ticks(ctx, 20);
  const btPaused = bm(ctx).battleTime;
  bm(ctx).setPaused("b1", false);
  ticks(ctx, 20);
  check(
    "出兵時點：間隔 1 秒，第 8 次後暫停 20 次：暫停中不扣也不生成、戰鬥時間不動；繼續後只等剩下的 0.5 秒（第 37 次）",
    same(spawnTicks(ctx), [0, 37]) && bt === btPaused,
    { spawns: ctx.log.spawns, bt, btPaused }
  );
}
{
  const ctx = mk([W(1, [G("e_a", 2, 1)])], 1);
  bm(ctx).playerStartBattle();
  ticks(ctx, 8);
  bm(ctx).setSpeed("b1", 2);
  ticks(ctx, 10);
  check(
    "出兵時點：間隔 1 秒，1 倍 8 次（0.5 秒）後換 2 倍：剩下的 0.5 秒照 0.125 扣，第 13 次生成",
    same(spawnTicks(ctx), [0, 13]),
    ctx.log.spawns
  );
}
{
  const ctx = mk([W(1, [G("e_a", 2, 0.5)])], 1);
  bm(ctx).openDeployMenu();
  bm(ctx).playerStartBattle();
  ticks(ctx, 70, 80);
  check(
    "出兵時點：部署選單開著（0.1 倍）、每次 80 毫秒、間隔 0.5 秒：每次扣 0.008，第 63 次生成",
    same(spawnTicks(ctx), [0, 63]),
    ctx.log.spawns
  );
}
// 0.0001 的下限：直接用真正的 WaveManager.update，每次 0.00004 秒
for (const [label, interval, expectTick] of [
  ["0", 0, 3],
  ["0.00005（小於下限，用 0.0001）", 0.00005, 3],
  ["0.0001（等於下限）", 0.0001, 3],
  ["0.00015（大於下限）", 0.00015, 4],
]) {
  const ctx = mk([], 1);
  const wm = new WaveManager();
  wm.setup([W(1, [G("e_a", 2, interval)])], ENEMIES, ctx.e.gameMap);
  let t = 0;
  const at = [];
  wm.onEnemySpawned = () => at.push(t);
  wm.startPreparedWave(wm.prepareWave(1));
  for (t = 1; t <= 6; t++) wm.update(0.00004);
  check(
    `出兵時點：最短等待 0.0001 秒（每次 0.00004 秒）：間隔 ${label} 的第二隻在第 ${expectTick} 次`,
    same(at, [0, expectTick]),
    at
  );
}

// ═══ 數量與間隔的取值 ═══
{
  const counts = [
    [undefined, 1],
    [2, 2],
    [2.7, 2],
    [-2.7, -2],
    [0, 0],
    ["2", 2],
    ["2.7", 2],
    [" 2", 0],
    ["abc", 0],
    [NaN, 0],
    [Infinity, 0],
    [null, 0],
    [true, 0],
    [[2], 0],
    [{}, 0],
  ];
  const got = counts.map(([v]) => waveGroupCount(v));
  check(
    '數量：缺鍵 1、有限數字向 0 取整（2.7→2）、數字字串 "2"／"2.7"→2；其他錯型（含 NaN、Infinity、null、布林、陣列、物件）→ 0（無效組）',
    same(
      got,
      counts.map((c) => c[1])
    ),
    { got, want: counts.map((c) => c[1]) }
  );
  const intervals = [
    [undefined, 1],
    [0, 0],
    [-1, 0],
    [0.5, 0.5],
    ["0.5", 0.5],
    ["0", 1],
    [NaN, 1],
    [Infinity, 1],
    [null, 1],
    [false, 1],
    ["abc", 1],
  ];
  const gotI = intervals.map(([v]) => waveGroupInterval(v));
  check(
    "間隔：缺鍵 1、有限數字取 max(0, x)（合法 0 保留、負數 0）；非有限數字用 1；其他型別照原本的換算",
    same(
      gotI,
      intervals.map((c) => c[1])
    ),
    { gotI, want: intervals.map((c) => c[1]) }
  );
  const ctx = mk(
    [
      W(1, [
        G("e_a", 2.7, 0),
        { enemy_id: "e_b", count: "2.7", interval: 0, path: "path_b" },
      ]),
    ],
    1
  );
  bm(ctx).playerStartBattle();
  ticks(ctx, 5);
  check(
    '數量：開戰時 2.7 與字串 "2.7" 各生成 2 隻',
    ctx.log.spawns.filter((s) => s[1] === "e_a").length === 2 &&
      ctx.log.spawns.filter((s) => s[1] === "e_b").length === 2,
    ctx.log.spawns
  );
  const bad = mk([W(1, [{ enemy_id: "e_a", count: NaN, path: "path_a" }])], 1);
  bm(bad).playerStartBattle();
  check(
    "數量：NaN 的組是無效組（count_invalid），這一波被拒絕",
    same(bad.log.rejected, [[0, 1, "count_invalid"]]) &&
      bm(bad).currentWave === 0,
    bad.log.rejected
  );
}

// ═══ D10：自動下一波用遊戲時間（1.5 秒）；第 0 次＝受控擊殺清波的當下 ═══
const WAVES3 = [1, 2, 3].map((n) => W(n, [G("e_a", 1, 0)]));
/** 自動模式開第 1 波、受控擊殺清波（排自動下一波） */
function autoCleared(before) {
  const ctx = mk(WAVES3, 3);
  bm(ctx).toggleAutoMode();
  if (before) before(ctx);
  killAll(ctx);
  return ctx;
}
const wave2 = (ctx) => bm(ctx).currentWave === 2;
{
  const st = [];
  const origSetTimeout = globalThis.setTimeout;
  let timeouts = 0;
  globalThis.setTimeout = (...a) => {
    timeouts++;
    return origSetTimeout(...a);
  };
  const ctx = autoCleared();
  st.push(bm(ctx).autoWavePending, bm(ctx).gameState, bm(ctx).currentWave);
  ticks(ctx, 24);
  st.push(bm(ctx).currentWave, bm(ctx).autoWavePending);
  ticks(ctx, 1);
  globalThis.setTimeout = origSetTimeout;
  check(
    "自動下一波 1 倍：清波後等待中仍是戰鬥中第 1 波；第 24 次（剛好 1.5 秒）還沒開，第 25 次開第 2 波；沒有用任何牆鐘計時器",
    same(st, [true, GameState.BATTLE, 1, 1, true]) &&
      bm(ctx).currentWave === 2 &&
      timeouts === 0 &&
      same(
        ctx.log.spawns.map((s) => s[0]),
        [0, 25]
      ),
    { st, wave: bm(ctx).currentWave, timeouts, spawns: ctx.log.spawns }
  );
  check(
    "自動下一波 1 倍：第 1 波清波只通知一次",
    same(ctx.log.cleared, [[0, 1]]),
    ctx.log.cleared
  );
}
{
  const ctx = autoCleared((c) => bm(c).setSpeed("b1", 2));
  const at = ticksUntil(ctx, () => wave2(ctx), 40);
  check("自動下一波 2 倍：第 13 次開第 2 波", at === 13, at);
}
{
  const ctx = autoCleared((c) => bm(c).openDeployMenu());
  const at = ticksUntil(ctx, () => wave2(ctx), 300, 80);
  check(
    "自動下一波 部署選單 0.1 倍（每次 80 毫秒，扣 0.008）：第 188 次開第 2 波",
    at === 188,
    at
  );
}
{
  const ctx = autoCleared();
  ticks(ctx, 8);
  bm(ctx).setSpeed("b1", 2);
  const at = ticksUntil(ctx, () => wave2(ctx), 40);
  check(
    "自動下一波：1 倍 8 次（0.5 秒）後換 2 倍：剩下 1 秒照 0.125 扣，第 17 次開第 2 波",
    at === 17,
    at
  );
}
{
  const ctx = autoCleared();
  ticks(ctx, 8);
  bm(ctx).setPaused("b1", true);
  ticks(ctx, 30);
  const during = [bm(ctx).currentWave, bm(ctx).autoWavePending];
  bm(ctx).setPaused("b1", false);
  const at = ticksUntil(ctx, () => wave2(ctx), 40);
  check(
    "自動下一波：第 8 次後暫停 30 次（不扣、不開），繼續後只等剩下的 1 秒：第 55 次開第 2 波",
    same(during, [1, true]) && at === 55,
    { during, at }
  );
}
{
  const ctx = autoCleared();
  ticks(ctx, 8);
  bm(ctx).toggleAutoMode();
  const right = [bm(ctx).gameState, bm(ctx).autoWavePending];
  ticks(ctx, 40);
  check(
    "自動下一波：等待中關閉自動：回到備戰、不再等待，之後 40 次都沒有開第 2 波",
    same(right, [GameState.PREP, false]) &&
      bm(ctx).currentWave === 1 &&
      bm(ctx).gameState === GameState.PREP &&
      ctx.log.spawns.length === 1,
    { right, wave: bm(ctx).currentWave, spawns: ctx.log.spawns }
  );
}
{
  const ctx = autoCleared();
  ticks(ctx, 8);
  ctx.e.loadStage(payload("b2", WAVES3, 3));
  bindLog(ctx);
  const spawnedBefore = ctx.log.spawns.length;
  ticks(ctx, 40);
  check(
    "自動下一波：等待中換場（b2）：舊的等待失效，b2 之後 40 次仍是備戰、波次 0、沒有敵人、沒有新的生成",
    bm(ctx).gameState === GameState.PREP &&
      bm(ctx).currentWave === 0 &&
      bm(ctx).autoWavePending === false &&
      ctx.e.waveManager.activeEnemies.length === 0 &&
      ctx.log.spawns.length === spawnedBefore,
    {
      state: bm(ctx).gameState,
      wave: bm(ctx).currentWave,
      spawns: ctx.log.spawns,
      spawnedBefore,
    }
  );
}
{
  const ctx = autoCleared();
  ticks(ctx, 8);
  bm(ctx).endBattle(false);
  ticks(ctx, 40);
  check(
    "自動下一波：等待中結算（受控敗局）：不再等待，之後 40 次仍是結算、第 1 波",
    bm(ctx).gameState === GameState.RESULT &&
      bm(ctx).currentWave === 1 &&
      bm(ctx).autoWavePending === false &&
      ctx.log.spawns.length === 1,
    { state: bm(ctx).gameState, wave: bm(ctx).currentWave }
  );
}
{
  const ctx = autoCleared();
  const token = bm(ctx).autoWaveToken;
  ticks(ctx, 1);
  bm(ctx).onWaveAllEnemiesDead();
  const token2 = bm(ctx).autoWaveToken;
  ticks(ctx, 40);
  check(
    "自動下一波：重複清波通知只排一次（token 不變），第 25 次開第 2 波且只開一次",
    token === token2 &&
      same(
        ctx.log.spawns.map((s) => s[0]),
        [0, 25]
      ) &&
      bm(ctx).currentWave === 2,
    { token, token2, spawns: ctx.log.spawns, wave: bm(ctx).currentWave }
  );
}
{
  const ctx = mk([W(1, [G("e_a", 1, 0)]), W(3, [G("e_a", 1, 0)])], 3);
  bm(ctx).toggleAutoMode();
  killAll(ctx);
  ticks(ctx, 30);
  check(
    "自動下一波：第 2 波沒有資料：第 25 次拒絕第 2 波，自動關閉、回到備戰、波次仍是 1",
    same(ctx.log.rejected, [[25, 2, "wave_missing"]]) &&
      bm(ctx).autoMode === false &&
      bm(ctx).gameState === GameState.PREP &&
      bm(ctx).currentWave === 1,
    {
      rejected: ctx.log.rejected,
      auto: bm(ctx).autoMode,
      wave: bm(ctx).currentWave,
    }
  );
}
{
  // 自動下一波在處理中開的新一波：第一隻立刻，第二隻的倒數下一次才開始扣（間隔 0 → 下一次生成）
  const ctx = mk([W(1, [G("e_a", 1, 0)]), W(2, [G("e_a", 3, 0)])], 2);
  bm(ctx).toggleAutoMode();
  killAll(ctx);
  ticks(ctx, 30);
  check(
    "自動下一波：第 25 次在處理中開第 2 波：第一隻當次生成，之後第 26、27 次各一隻",
    same(
      ctx.log.spawns.map((s) => s[0]),
      [0, 25, 26, 27]
    ),
    ctx.log.spawns
  );
}

// ═══ 數字字串溢位：轉換後不是有限數字就是無效組（開戰前拒絕） ═══
{
  const big = "9".repeat(400);
  const got = [
    waveGroupCount(big),
    waveGroupCount("-" + big),
    waveGroupCount("2"),
    waveGroupCount("2.7"),
  ];
  check(
    '數量：400 位數字字串（正、負）轉換後不是有限數字 → 0（無效組）；"2"、"2.7" 仍是 2',
    same(got, [0, 0, 2, 2]),
    got
  );
  const ctx = mk(
    [W(1, [{ enemy_id: "e_a", count: big, interval: 0, path: "path_a" }])],
    1
  );
  bm(ctx).playerStartBattle();
  check(
    "數量：400 位數字字串的組是無效組（count_invalid），這一波被拒絕：仍是備戰、波次 0、沒有敵人、同步從未出現戰鬥中",
    same(ctx.log.rejected, [[0, 1, "count_invalid"]]) &&
      bm(ctx).gameState === GameState.PREP &&
      bm(ctx).currentWave === 0 &&
      ctx.e.waveManager.activeEnemies.length === 0 &&
      !sawBattle(ctx),
    {
      rejected: ctx.log.rejected,
      wave: bm(ctx).currentWave,
      stats: ctx.log.stats,
    }
  );
}

// ═══ 一幀的處理界線：處理中才排的倒數下一幀才扣，處理前已有的這一幀就扣（不是看單一個管理器的 update） ═══
/** 自動模式：第 1 波 2 隻、間隔 0；第一隻在處理前受控擊殺，第二隻在出兵（WaveManager.update）的生成通知裡受控擊殺 → 清波在第 1 次處理中排 */
function autoClearedInWave(before) {
  const waves = [
    W(1, [G("e_a", 2, 0)]),
    W(2, [G("e_a", 1, 0)]),
    W(3, [G("e_a", 1, 0)]),
  ];
  const ctx = mk(waves, 3);
  ctx.e.waveManager.onEnemySpawned = (en) => {
    ctx.log.spawns.push([ctx.log.tick, en.enemyId, en.spawnSeq]);
    if (en.spawnSeq === 1) en.takeDamage(1e12);
  };
  bm(ctx).toggleAutoMode();
  if (before) before(ctx);
  killAll(ctx);
  return ctx;
}
{
  const ctx = autoClearedInWave();
  ticks(ctx, 1);
  const r1 = [
    bm(ctx).autoWavePending,
    bm(ctx).autoWaveRemaining,
    ctx.log.cleared.slice(),
  ];
  const at = ticksUntil(ctx, () => wave2(ctx), 40);
  check(
    "處理界線：第 1 次處理中（出兵的生成通知裡）清波排的自動下一波，建立的那一幀不扣（仍是 1.5），第 26 次才開第 2 波",
    same(r1, [true, 1.5, [[1, 1]]]) && at === 26,
    { r1, at }
  );
}
{
  const ctx = autoClearedInWave((c) => bm(c).setSpeed("b1", 2));
  ticks(ctx, 1);
  const at = ticksUntil(ctx, () => wave2(ctx), 40);
  check(
    "處理界線：同上但 2 倍：建立那一幀不扣，之後每次 0.125，第 14 次開第 2 波",
    at === 14,
    at
  );
}
{
  const ctx = autoClearedInWave();
  ticks(ctx, 5);
  bm(ctx).setPaused("b1", true);
  ticks(ctx, 10);
  const during = [bm(ctx).currentWave, bm(ctx).autoWaveRemaining];
  bm(ctx).setPaused("b1", false);
  const at = ticksUntil(ctx, () => wave2(ctx), 60);
  check(
    "處理界線：同上，第 5 次後暫停 10 次（剩 1.25 不動），繼續後第 36 次開第 2 波",
    same(during, [1, 1.25]) && at === 36,
    { during, at }
  );
}
{
  // 自動開波在 BattleManager.update 裡：新一波第一隻當場生成並受控擊殺 → 清波在同一幀處理中排 → 下一幀才扣
  const ctx = mk(WAVES3, 3);
  ctx.e.waveManager.onEnemySpawned = (en) => {
    ctx.log.spawns.push([ctx.log.tick, en.enemyId, en.spawnSeq]);
    en.takeDamage(1e12);
  };
  bm(ctx).toggleAutoMode();
  ticks(ctx, 60);
  check(
    "處理界線：每隻一生成就受控擊殺：處理前清波的第 1 波 → 第 25 次開第 2 波；第 2 波在處理中清波 → 再 25 次（第 50 次）開第 3 波並勝利",
    same(
      ctx.log.spawns.map((s) => s[0]),
      [0, 25, 50]
    ) &&
      same(
        ctx.log.cleared.map((c) => c[0]),
        [0, 25, 50]
      ) &&
      bm(ctx).gameState === GameState.RESULT,
    {
      spawns: ctx.log.spawns,
      cleared: ctx.log.cleared,
      state: bm(ctx).gameState,
    }
  );
}
{
  // 敵人更新時抵達基地（漏怪）清波：第 1 次處理走完路線、第 2 次處理的敵人更新開頭判定抵達 → 在第 2 次處理中排 → 下一幀才扣
  const ctx = mk([W(1, [G("e_fast", 1, 0)]), W(2, [G("e_a", 1, 0)])], 2);
  bm(ctx).toggleAutoMode();
  ticks(ctx, 1);
  const r1 = [bm(ctx).baseHp, bm(ctx).autoWavePending];
  ticks(ctx, 1);
  const r2 = [
    bm(ctx).baseHp,
    bm(ctx).autoWavePending,
    bm(ctx).autoWaveRemaining,
  ];
  const at = ticksUntil(ctx, () => wave2(ctx), 40);
  check(
    "處理界線：很快的敵人在第 2 次處理的敵人更新抵達基地（城血 19）清波，建立那一幀不扣（仍是 1.5），第 27 次開第 2 波",
    same(r1, [20, false]) && same(r2, [19, true, 1.5]) && at === 27,
    { r1, r2, at }
  );
}

// ═══ 開波的同步通知裡結算、換場、改波次或開始失敗：舊的開波資料不開始 ═══
{
  const ctx = mk([W(1, [G("e_a", 2, 0)])], 1);
  let done = false;
  ctx.e.onStatsUpdated = (s) => {
    if (!done && s.game_state === GameState.BATTLE) {
      done = true;
      bm(ctx).endBattle(false);
    }
  };
  bm(ctx).playerStartBattle();
  ticks(ctx, 3);
  const after = {
    state: bm(ctx).gameState,
    enemies: ctx.e.waveManager.activeEnemies.length,
    tasks: ctx.e.waveManager.activeSpawningTasks.length,
    spawns: ctx.log.spawns.length,
    rejected: ctx.log.rejected.length,
  };
  check(
    "開波重入：進入戰鬥的同步裡受控結算（敗局）：不開始出兵，仍是結算、沒有敵人與出兵工作，也沒有改回備戰或拒絕",
    done &&
      same(after, {
        state: GameState.RESULT,
        enemies: 0,
        tasks: 0,
        spawns: 0,
        rejected: 0,
      }),
    after
  );
}
{
  const ctx = mk([W(1, [G("e_a", 2, 0)])], 1);
  let done = false;
  ctx.e.onStatsUpdated = (s) => {
    if (!done && s.game_state === GameState.BATTLE) {
      done = true;
      ctx.e.loadStage(payload("b1", [W(1, [G("e_b", 1, 0, "path_b")])], 1));
    }
  };
  bm(ctx).playerStartBattle();
  const after = {
    battleId: bm(ctx).battleId,
    state: bm(ctx).gameState,
    wave: bm(ctx).currentWave,
    enemies: ctx.e.waveManager.activeEnemies.length,
    tasks: ctx.e.waveManager.activeSpawningTasks.length,
    spawns: ctx.log.spawns.length,
  };
  check(
    "開波重入：同步裡換場但沿用同一個 battleId（b1）：靠場次與世代擋下，舊資料不開始，新場仍是備戰、波次 0、沒有敵人",
    done &&
      same(after, {
        battleId: "b1",
        state: GameState.PREP,
        wave: 0,
        enemies: 0,
        tasks: 0,
        spawns: 0,
      }),
    after
  );
}
{
  const ctx = mk([W(1, [G("e_a", 1, 0)]), W(2, [G("e_b", 1, 0, "path_b")])], 2);
  let done = false;
  ctx.e.onStatsUpdated = (s) => {
    if (!done && s.game_state === GameState.BATTLE && s.wave === 1) {
      done = true;
      bm(ctx).spawnNextWave();
    }
  };
  bm(ctx).playerStartBattle();
  check(
    "開波重入：第 1 波的同步裡受控開了第 2 波：只開始第 2 波（e_b），第 1 波的舊資料不開始",
    done &&
      bm(ctx).currentWave === 2 &&
      same(
        ctx.log.spawns.map((s) => s[1]),
        ["e_b"]
      ),
    { wave: bm(ctx).currentWave, spawns: ctx.log.spawns }
  );
}
{
  const ctx = mk([W(1, [G("e_a", 1, 0)])], 1);
  let done = false;
  ctx.e.onStatsUpdated = (s) => {
    ctx.log.stats.push([ctx.log.tick, s.game_state, s.wave]);
    if (!done && s.game_state === GameState.BATTLE) {
      done = true;
      ctx.e.waveManager.stopAll();
    }
  };
  bm(ctx).playerStartBattle();
  check(
    "開波重入：同步裡受控停掉出兵（換了世代、同一場同一波）：開始失敗時退回第 0 波並拒絕（wave_start_failed），回到備戰，不留在沒有出兵的戰鬥中",
    done &&
      same(ctx.log.rejected, [[0, 1, "wave_start_failed"]]) &&
      bm(ctx).gameState === GameState.PREP &&
      bm(ctx).currentWave === 0 &&
      ctx.e.waveManager.activeEnemies.length === 0,
    {
      rejected: ctx.log.rejected,
      state: bm(ctx).gameState,
      wave: bm(ctx).currentWave,
    }
  );
}

// ═══ 全波：手動兩波兩組兩路，受控清波；出兵總數＝資料的數量總和 ═══
{
  const waves = [
    W(1, [G("e_a", 3, 0.25), G("e_b", 2, 0.25, "path_b")]),
    W(2, [G("e_a", 1, 0), G("e_b", 4, 0.125, "path_b")]),
  ];
  const ctx = mk(waves, 2);
  bm(ctx).playerStartBattle();
  ticks(ctx, 20);
  killAll(ctx);
  const mid = [bm(ctx).gameState, bm(ctx).currentWave];
  bm(ctx).playerStartBattle();
  ticks(ctx, 20);
  killAll(ctx);
  check(
    "全波（手動、受控清波）：第 1 波清完回備戰；兩波共生成 10 隻（3＋2＋1＋4），清波各通知一次，結算勝利、擊殺 10",
    same(mid, [GameState.PREP, 1]) &&
      ctx.log.spawns.length === 10 &&
      same(
        ctx.log.cleared.map((c) => c[1]),
        [1, 2]
      ) &&
      bm(ctx).gameState === GameState.RESULT &&
      bm(ctx).kills === 10,
    {
      mid,
      spawns: ctx.log.spawns.length,
      cleared: ctx.log.cleared,
      state: bm(ctx).gameState,
      kills: bm(ctx).kills,
    }
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log(`RESULT_JSON ${JSON.stringify({ total: results.length, failed })}`);
process.exit(failed ? 1 : 0);
