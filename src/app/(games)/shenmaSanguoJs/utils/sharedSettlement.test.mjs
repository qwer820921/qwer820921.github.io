// 神馬三國 JS 版共用帳號戰鬥結算的生命週期測試（store/useJsPlayerStore.ts 的 armSharedSettle／settleSharedBattle／retrySharedSettle）
// - 直接呼叫真正的 store；後端是 tests/profile-contract-fixture.mjs（照後端 v2.9 的玩家動作），包成假的 fetch：
//   每個請求都可以暫停到測試放行、斷線、寫入了但回應遺失、改寫回應或不經 fixture 直接回應
// - sessionStorage／localStorage 是記憶體的假物件，可以讓寫入失敗；檢查第一次送出前已暫存、暫存內容、重新整理後的待確認
// - 期望值是寫死的字面值（後端 v2.9：點數＝勝利的 battle_points、落敗 10；經驗＝勝利 50＋星數×20、落敗 10；
//   經驗滿 level×100 升一級；容量＝10＋level；勝利且下一關比較大才更新進度），不由實作產生
// - 修正追加（R77-1～R77-5）：人工確認跨同步／重新整理／換帳號仍在且不能重送；重新確認前後暫存被改過就不送；
//   舊場次的回呼不動目前的固定；讀回不合法的存檔不算已保存；暫存讀不到時維持阻擋
// - 第二次修正追加：送出中的標記（寫不進去就不送；人工確認的標記寫不進去、送出途中重新整理都還是人工確認，
//   丟掉 store 模組重新載入來模擬真正的重新整理）；換帳號或登出後才回來的終止回應記到原帳號；
//   登入後暫存或標記才變成讀不到時，寫入與固定出征前重新讀取
// - 所有金鑰都是虛構的 test_*；不連網
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/sharedSettlement.test.mjs"
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

// ── 假環境 ──
class MemStorage {
  constructor() {
    this.m = new Map();
    this.failSet = false;
    this.failGet = false;
    // 只讓某些前綴的讀取丟例外；只讓符合條件的寫入丟例外（例如只有人工確認的標記）
    this.failGetPrefixes = [];
    this.failSetIf = null;
  }
  get length() {
    return this.m.size;
  }
  key(i) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k) {
    if (this.failGet || this.failGetPrefixes.some((p) => k.startsWith(p))) {
      const e = new Error("SecurityError");
      e.name = "SecurityError";
      throw e;
    }
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    if (this.failSet || (this.failSetIf && this.failSetIf(k, String(v)))) {
      const e = new Error("QuotaExceededError");
      e.name = "QuotaExceededError";
      throw e;
    }
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

const clone = (o) =>
  o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const { createProfileFixture } = await import(
  pathToFileURL(join(HERE, "../tests/profile-contract-fixture.mjs")).href
);
const store = require(join(HERE, "../store/useJsPlayerStore.ts"));
const { useJsPlayerStore, SETTLE_PENDING_PREFIX } = store;
const bs = require(join(HERE, "sharedBattleSettlement.ts"));
const sync = require(join(HERE, "sharedProfileSync.ts"));
const st = () => useJsPlayerStore.getState();

// 後端武將設定（虛構）：關羽與趙雲
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
const DATA0 = () => ({
  nickname: "結算",
  level: 1,
  exp: 0,
  gold: 500,
  capacity: 11,
  max_stage: "chapter1_3",
  heroes: [],
  team: [{ hero_id: "guan_yu", slot: 1 }],
});

// ── 假的 GAS（fetch）：fixture 回應；規則可暫停、斷線、遺失回應、改寫或直接回應 ──
let fx = null;
const net = { calls: [], rules: [] };
function rule(action, kind, opts = {}) {
  const r = {
    action,
    kind,
    times: opts.times ?? 1,
    fn: opts.fn,
    then: opts.then ?? "ok",
    release: null,
    waiting: false,
  };
  net.rules.push(r);
  return r;
}
// 直接看記憶體內容（不經過可能被設成丟例外的 getItem）
const pendingRaw = () => {
  for (const [k, v] of session.m)
    if (k.startsWith(SETTLE_PENDING_PREFIX)) return v;
  return null;
};
const pendingKey = () =>
  [...session.m.keys()].find((k) => k.startsWith(SETTLE_PENDING_PREFIX)) ??
  null;
globalThis.fetch = async (_url, init) => {
  const body = JSON.parse(init.body);
  const call = {
    action: body.action,
    key: body.key ?? null,
    payload: clone(body.payload),
    pendingAtCall: pendingRaw(),
    status: null,
    error: null,
  };
  net.calls.push(call);
  const r = net.rules.find((x) => x.times > 0 && x.action === body.action);
  let kind = "ok";
  if (r) {
    r.times -= 1;
    kind = r.kind;
  }
  if (kind === "hold") {
    r.waiting = true;
    kind = await new Promise((res) => (r.release = res));
    r.waiting = false;
  }
  if (kind === "network") throw new TypeError("Failed to fetch");
  let res;
  if (kind === "reply") res = r.fn(clone(body));
  else {
    res = fx.handle(clone(body));
    if (kind === "lost") throw new TypeError("Failed to fetch");
    if (kind === "transform") res = r.fn(clone(res));
  }
  call.status = res.status;
  call.error = res.error ?? null;
  return { ok: true, status: 200, json: async () => clone(res) };
};
const saves = () => net.calls.filter((c) => c.action === "save_result");
const writes = () =>
  net.calls.filter((c) =>
    ["save_result", "save_profile", "upgrade_hero", "create_profile"].includes(
      c.action
    )
  );

const tick = () => new Promise((r) => setImmediate(r));
async function until(fn, n = 400) {
  for (let i = 0; i < n; i++) {
    const v = fn();
    if (v) return v;
    await tick();
  }
  return fn();
}

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + String(JSON.stringify(detail)).slice(0, 900)}`
  );
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** 每個情境：全新的後端與瀏覽器儲存，登入 key（雲端版本 rev） */
async function fresh(key, data = DATA0(), rev = 7, opts = {}) {
  st().logout();
  local.clear();
  session.clear();
  session.failSet = false;
  session.failGet = false;
  session.failGetPrefixes = [];
  session.failSetIf = null;
  net.calls = [];
  net.rules = [];
  fx = createProfileFixture({ heroesConfig: HEROES });
  if (data) fx.seed(key, clone(data), rev, opts);
  local.setItem("shenma_player_key", key);
  await st().init();
  await until(() => !st().isLoading);
}
const COMPLETE = new Set([
  "chapter1_1",
  "chapter1_2",
  "chapter1_3",
  "chapter1_4",
  "chapter1_5",
]);
let seq = 0;
const sortie = (stageId, extra = {}) => ({
  battleId: `b-${++seq}`,
  stageId,
  configReady: true,
  completeStageIds: COMPLETE,
  practice: false,
  ...extra,
});
/** 引擎的凍結結果（固定字面值：基地 20／15／9 與落敗的點數 1120／690／330／10） */
const R = (s, result, stars, kills, time, points) => ({
  result,
  stage_id: s.stageId,
  battle_id: s.battleId,
  stars_earned: stars,
  kills,
  time_seconds: time,
  loots: [{ item: "battle_points", count: points }],
});
const pick = (d) =>
  d && {
    gold: d.gold,
    exp: d.exp,
    level: d.level,
    capacity: d.capacity,
    max_stage: d.max_stage,
  };
const BODY = (stageId, result, stars, kills, time, points, rid, base = 7) => ({
  stage_id: stageId,
  result,
  stars_earned: stars,
  kills,
  time_seconds: time,
  loots: [{ item: "battle_points", count: points }],
  request_id: rid,
  base_rev: base,
  settle_contract: 2,
});

// ═══ 1. 已解鎖的勝 3／2／1 星與落敗：一次 save_result、內容逐欄、讀回、後端的獎勵、刪除暫存 ═══
for (const c of [
  {
    name: "勝利 3 星（第 2 關）",
    stage: "chapter1_2",
    res: "WIN",
    stars: 3,
    kills: 12,
    time: 95,
    pts: 1120,
    after: {
      gold: 1620,
      exp: 10,
      level: 2,
      capacity: 12,
      max_stage: "chapter1_3",
    },
    reward: { points: 1120, exp: 110, leveledUp: true, newLevel: 2 },
  },
  {
    name: "勝利 2 星（第 3 關，進度推到第 4 關）",
    stage: "chapter1_3",
    res: "WIN",
    stars: 2,
    kills: 9,
    time: 80,
    pts: 690,
    after: {
      gold: 1190,
      exp: 90,
      level: 1,
      capacity: 11,
      max_stage: "chapter1_4",
    },
    reward: { points: 690, exp: 90, leveledUp: false, newLevel: 1 },
  },
  {
    name: "勝利 1 星（重玩第 1 關，進度不倒退）",
    stage: "chapter1_1",
    res: "WIN",
    stars: 1,
    kills: 5,
    time: 60,
    pts: 330,
    after: {
      gold: 830,
      exp: 70,
      level: 1,
      capacity: 11,
      max_stage: "chapter1_3",
    },
    reward: { points: 330, exp: 70, leveledUp: false, newLevel: 1 },
  },
  {
    name: "落敗（0 星、10 點）",
    stage: "chapter1_2",
    res: "LOSE",
    stars: 0,
    kills: 4,
    time: 50,
    pts: 10,
    after: {
      gold: 510,
      exp: 10,
      level: 1,
      capacity: 11,
      max_stage: "chapter1_3",
    },
    reward: { points: 10, exp: 10, leveledUp: false, newLevel: 1 },
  },
]) {
  await fresh("test_settle_a");
  const s = sortie(c.stage);
  const armedOk = st().armSharedSettle(s);
  await st().settleSharedBattle(R(s, c.res, c.stars, c.kills, c.time, c.pts));
  const sv = saves();
  const rid = sv[0] && sv[0].payload.request_id;
  const back = fx.read("test_settle_a");
  check(
    `已解鎖：${c.name}：固定成功、只有一次 save_result、內容逐欄等於寫死的值（契約 2、base_rev 7、request_id 只產生一次）`,
    armedOk &&
      sv.length === 1 &&
      /^js-[0-9a-z]+-[0-9a-z]+$/.test(rid || "") &&
      same(
        sv[0].payload,
        BODY(c.stage, c.res, c.stars, c.kills, c.time, c.pts, rid)
      ),
    { armedOk, sv }
  );
  check(
    `已解鎖：${c.name}：送出前已暫存同一個 request_id，確認後刪除暫存`,
    !!sv[0] &&
      typeof sv[0].pendingAtCall === "string" &&
      JSON.parse(sv[0].pendingAtCall).requestId === rid &&
      pendingRaw() === null &&
      st().pendingSettle === null,
    { at: sv[0] && sv[0].pendingAtCall, now: pendingRaw() }
  );
  check(
    `已解鎖：${c.name}：雲端讀回＝寫死的結果（rev 8），畫面已保存並列後端回應的獎勵`,
    back.rev === 8 &&
      same(pick(back.data), c.after) &&
      st().rev === 8 &&
      same(pick(st().canonical), c.after) &&
      st().settleView.phase === "confirmed" &&
      same(st().settleView.reward, c.reward) &&
      !st().busy,
    { back: pick(back.data), rev: back.rev, view: st().settleView }
  );
}

// ═══ 2. 不送出的情況：不固定、零請求、說明原因 ═══
{
  const cases = [
    [
      "自由演練（已解鎖的關卡也一樣）",
      "chapter1_2",
      { practice: true },
      /自由演練/,
    ],
    ["未解鎖（第 5 關，進度第 3 關）", "chapter1_5", {}, /還沒解鎖/],
    ["設定不是後端的", "chapter1_2", { configReady: false }, /設定還沒讀到/],
    ["關卡不在後端完整設定裡", "chapter1_6", {}, /沒有這一關的完整資料/],
  ];
  const got = [];
  for (const [name, stage, extra, text] of cases) {
    await fresh("test_settle_b");
    const s = sortie(stage, extra);
    const ok = st().armSharedSettle(s);
    const note = st().sortieNote;
    await st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
    got.push({
      name,
      ok,
      note,
      saves: saves().length,
      pending: pendingRaw(),
      view: st().settleView && st().settleView.phase,
      pass:
        !ok &&
        text.test(note || "") &&
        saves().length === 0 &&
        pendingRaw() === null &&
        st().settleView.phase === "not-sent",
    });
  }
  check(
    "不寫入：自由演練、未解鎖、設定不是後端的、關卡不完整都不固定、零請求、沒有暫存、說明原因",
    got.every((x) => x.pass),
    got
  );
}
{
  // 雲端進度格式不明、唯讀（版本不明）、隊伍不支援
  const got = [];
  await fresh("test_settle_c", { ...DATA0(), max_stage: "第三關" });
  got.push({
    name: "進度格式不明",
    ok: st().armSharedSettle(sortie("chapter1_1")),
    note: st().sortieNote,
  });
  await fresh("test_settle_c", {
    ...DATA0(),
    team: [{ hero_id: "lu_bu", slot: 1 }],
  });
  got.push({
    name: "隊伍不支援",
    ok: st().armSharedSettle(sortie("chapter1_1")),
    note: st().sortieNote,
    teamEditable: st().teamEditable,
  });
  st().logout();
  fx = createProfileFixture({ heroesConfig: HEROES });
  fx.seed("test_settle_c", DATA0(), 7);
  net.rules = [];
  rule("get_profile", "transform", {
    fn: (res) => ({ ...res, rev: undefined }),
  });
  local.setItem("shenma_player_key", "test_settle_c");
  await st().init();
  got.push({
    name: "版本不明（唯讀）",
    ok: st().armSharedSettle(sortie("chapter1_1")),
    note: st().sortieNote,
    readOnly: st().readOnly,
  });
  check(
    "不寫入：雲端進度格式不明、隊伍不支援、版本不明（唯讀）都不固定並說明",
    got.every((x) => x.ok === false && /不會寫入共用進度/.test(x.note || "")) &&
      got[2].readOnly === true &&
      got[1].teamEditable === false,
    got
  );
}
{
  // 訪客：不連雲端
  st().logout();
  local.clear();
  session.clear();
  net.calls = [];
  await st().startGuestMode();
  const s = sortie("chapter1_1");
  const ok = st().armSharedSettle(s);
  await st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  check(
    "訪客：不固定、不送任何請求、沒有共用的結算狀態",
    ok === false &&
      net.calls.length === 0 &&
      st().settleView === null &&
      pendingRaw() === null,
    { ok, calls: net.calls, view: st().settleView }
  );
}

// ═══ 3. 同一場的重複回呼、出征中不開其他寫入 ═══
{
  await fresh("test_settle_d");
  const s = sortie("chapter1_2");
  st().armSharedSettle(s);
  const blocked = await st().updateNickname("出征中改名");
  const r = R(s, "WIN", 3, 12, 95, 1120);
  await Promise.all([
    st().settleSharedBattle(r),
    st().settleSharedBattle(clone(r)),
  ]);
  await st().settleSharedBattle(clone(r));
  check(
    "出征中不能改暱稱（零請求）；同一場的結果回呼三次只送一次",
    blocked.success === false &&
      /出征中/.test(blocked.error || "") &&
      saves().length === 1 &&
      writes().length === 1,
    { blocked, writes: writes() }
  );
}

// ═══ 4. 暫存：不能寫入就不送；其他帳號的暫存不影響；這個帳號的暫存無法辨識或超過長度要人工確認 ═══
{
  await fresh("test_settle_e");
  const s = sortie("chapter1_2");
  st().armSharedSettle(s);
  session.failSet = true;
  await st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  session.failSet = false;
  check(
    "暫存寫入失敗：零請求、這場沒有送出並說明",
    saves().length === 0 &&
      st().settleView.phase === "not-sent" &&
      /不能暫存/.test(st().settleView.text),
    st().settleView
  );
}
{
  await fresh("test_settle_f");
  session.setItem(
    SETTLE_PENDING_PREFIX + "a0000000000000000",
    '{"schema":"shenma-js-settle","version":1}'
  );
  const s = sortie("chapter1_2");
  const ok = st().armSharedSettle(s);
  await st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  check(
    "其他帳號的暫存：不影響這個帳號送出，也沒有被刪掉",
    ok &&
      saves().length === 1 &&
      session.getItem(SETTLE_PENDING_PREFIX + "a0000000000000000") !== null,
    { ok, saves: saves().length }
  );
}
{
  const bad = [];
  for (const [name, text] of [
    ["無法解析", "{oops"],
    ["超過長度", "x".repeat(5000)],
  ]) {
    st().logout();
    local.clear();
    session.clear();
    net.calls = [];
    net.rules = [];
    fx = createProfileFixture({ heroesConfig: HEROES });
    fx.seed("test_settle_g", DATA0(), 7);
    // 先登入一次取得這個帳號的暫存鍵（鍵用帳號指紋），再放壞的暫存，重新整理
    local.setItem("shenma_player_key", "test_settle_g");
    await st().init();
    const s0 = sortie("chapter1_2");
    st().armSharedSettle(s0);
    rule("save_result", "network");
    await st().settleSharedBattle(R(s0, "WIN", 3, 12, 95, 1120));
    const k = [...session.m.keys()].find((x) =>
      x.startsWith(SETTLE_PENDING_PREFIX)
    );
    session.setItem(k, text);
    await st().init();
    const nick = await st().updateNickname("改名");
    const ok = st().armSharedSettle(sortie("chapter1_2"));
    const retry = await st().retrySharedSettle();
    bad.push({
      name,
      status: st().pendingSettle && st().pendingSettle.status,
      nick: nick.success,
      ok,
      retry: retry.success,
      saves: saves().length,
      kept: session.getItem(k) === text,
    });
  }
  check(
    "這個帳號的暫存無法解析或超過長度：要人工確認、不能改暱稱、不能出征寫入、重新確認也不送、暫存原樣保留",
    bad.every(
      (x) =>
        x.status === "review" &&
        !x.nick &&
        !x.ok &&
        !x.retry &&
        x.saves === 1 &&
        x.kept
    ),
    bad
  );
}

// ═══ 5. 後端的各種回應 ═══
async function sendWith(key, rules, s = sortie("chapter1_2")) {
  await fresh(key);
  for (const r of rules) rule(...r);
  st().armSharedSettle(s);
  await st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  return s;
}
{
  const out = [];
  for (const [name, rules, wantRev, wantPhase] of [
    [
      "SERVER_ERROR（提交後）",
      [
        [
          "save_result",
          "transform",
          { fn: () => ({ status: 500, error: "SERVER_ERROR" }) },
        ],
      ],
      8,
      "pending",
    ],
    [
      "SERVER_ERROR（提交前）",
      [
        [
          "save_result",
          "reply",
          { fn: () => ({ status: 500, error: "SERVER_ERROR" }) },
        ],
      ],
      7,
      "pending",
    ],
    ["網路中斷（已寫入、回應遺失）", [["save_result", "lost"]], 8, "pending"],
    ["網路中斷（沒有送到）", [["save_result", "network"]], 7, "pending"],
    [
      "伺服器忙碌 BUSY（沒有寫入）",
      [
        [
          "save_result",
          "reply",
          { fn: () => ({ status: 503, error: "BUSY" }) },
        ],
      ],
      7,
      "pending",
    ],
  ]) {
    await sendWith("test_settle_h", rules);
    const back = fx.read("test_settle_h");
    out.push({
      name,
      rev: back.rev,
      phase: st().settleView.phase,
      pending: pendingRaw() !== null,
      ps: !!st().pendingSettle,
      pass:
        back.rev === wantRev &&
        st().settleView.phase === wantPhase &&
        pendingRaw() !== null &&
        !!st().pendingSettle &&
        !st().busy,
    });
  }
  check(
    "結果不明（SERVER_ERROR 提交前／後、網路中斷兩種、BUSY）：待確認、暫存留著、不自動重送",
    out.every((x) => x.pass) && true,
    out
  );
}
{
  await sendWith("test_settle_i", [
    [
      "save_result",
      "reply",
      { fn: () => ({ status: 400, error: "INVALID_REWARD", field: "loots" }) },
    ],
  ]);
  check(
    "後端明確拒絕而且沒有寫入（INVALID_REWARD）：沒有送出、刪除暫存、雲端不變",
    st().settleView.phase === "not-sent" &&
      pendingRaw() === null &&
      fx.read("test_settle_i").rev === 7,
    st().settleView
  );
}
{
  await sendWith("test_settle_j", [
    ["save_result", "transform", { fn: (res) => ({ ...res, logged: false }) }],
  ]);
  const back = fx.read("test_settle_j");
  check(
    "logged:false：仍是已保存（存檔已寫入），讀回 rev 8、只加一次",
    st().settleView.phase === "confirmed" &&
      back.rev === 8 &&
      back.data.gold === 1620 &&
      pendingRaw() === null,
    { view: st().settleView, gold: back.data.gold }
  );
}
{
  // base_mismatch：送出前別處改過（rev 7 → 8），後端套在最新資料上，回應沒有 rev → 要讀回確認
  await fresh("test_settle_k");
  const s = sortie("chapter1_2");
  st().armSharedSettle(s);
  fx.handle({
    action: "save_profile",
    key: "test_settle_k",
    payload: { data: { ...DATA0(), nickname: "別處改" }, base_rev: 7 },
  });
  await st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  const sv = saves();
  const back = fx.read("test_settle_k");
  check(
    "base_mismatch：仍帶第一次的 base_rev 7、後端已保存（rev 9、只加一次），讀回確認後已保存",
    sv.length === 1 &&
      sv[0].payload.base_rev === 7 &&
      back.rev === 9 &&
      back.data.gold === 1620 &&
      back.data.nickname === "別處改" &&
      st().settleView.phase === "confirmed" &&
      st().rev === 9,
    {
      base: sv[0] && sv[0].payload.base_rev,
      rev: back.rev,
      view: st().settleView,
    }
  );
}
{
  const out = [];
  for (const [name, fn, code] of [
    [
      "RESULT_UNKNOWN",
      () => ({ status: 409, error: "RESULT_UNKNOWN" }),
      "review",
    ],
    [
      "REQUEST_ID_REUSED",
      () => ({ status: 409, error: "REQUEST_ID_REUSED" }),
      "review",
    ],
    [
      "舊契約的回應（沒有 settle_contract）",
      () => ({ status: 200, success: true, log_id: "x", rev: 8 }),
      "review",
    ],
  ]) {
    await sendWith("test_settle_l", [["save_result", "reply", { fn }]]);
    const nick = await st().updateNickname("改名");
    out.push({
      name,
      phase: st().settleView.phase,
      kept: pendingRaw() !== null,
      nick: nick.success,
      saves: saves().length,
      pass:
        st().settleView.phase === code &&
        pendingRaw() !== null &&
        !nick.success &&
        saves().length === 1,
    });
  }
  check(
    "RESULT_UNKNOWN、REQUEST_ID_REUSED、舊契約的回應：要人工確認、暫存留著、不改用其他寫入、不換 id 重送",
    out.every((x) => x.pass),
    out
  );
}
{
  const out = [];
  for (const [name, getRule] of [
    [
      "讀回錯誤",
      [
        "get_profile",
        "reply",
        { fn: () => ({ status: 500, error: "DATA_CORRUPT" }) },
      ],
    ],
    [
      "讀回找不到",
      [
        "get_profile",
        "reply",
        { fn: () => ({ status: 404, error: "PROFILE_NOT_FOUND" }) },
      ],
    ],
    [
      "讀回較舊（rev 7）",
      ["get_profile", "transform", { fn: (res) => ({ ...res, rev: 7 }) }],
    ],
    [
      "讀回沒有版本",
      [
        "get_profile",
        "transform",
        { fn: (res) => ({ ...res, rev: undefined }) },
      ],
    ],
  ]) {
    await fresh("test_settle_m");
    const s = sortie("chapter1_2");
    st().armSharedSettle(s);
    rule(...getRule);
    await st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
    out.push({
      name,
      phase: st().settleView.phase,
      kept: pendingRaw() !== null,
      backRev: fx.read("test_settle_m").rev,
      pass:
        st().settleView.phase === "pending" &&
        pendingRaw() !== null &&
        fx.read("test_settle_m").rev === 8,
    });
  }
  check(
    "後端接受但讀回錯誤、找不到、較舊、沒有版本：不報已保存、待確認、暫存留著",
    out.every((x) => x.pass),
    out
  );
}

// ═══ 6. 重新整理後待確認、不自動送；明確重新確認原樣再送、獎勵只一次；普通同步不清待確認 ═══
{
  await sendWith("test_settle_n", [["save_result", "lost"]]);
  const first = saves()[0];
  const stored = pendingRaw();
  // 重新整理：store 重新初始化，同一個分頁的 sessionStorage 還在
  await st().init();
  await until(() => !st().isLoading);
  const afterInit = {
    saves: saves().length,
    pending: st().pendingSettle,
    phase: st().settleView,
  };
  const synced = await st().forceSync();
  const afterSync = {
    pending: st().pendingSettle,
    nick: (await st().updateNickname("改名")).success,
  };
  const retry = await st().retrySharedSettle();
  const sv = saves();
  const back = fx.read("test_settle_n");
  check(
    "重新整理後：待確認、沒有自動送出；普通同步不清掉待確認、仍不能寫入其他資料",
    afterInit.saves === 1 &&
      !!afterInit.pending &&
      afterInit.pending.status === "pending" &&
      synced.success &&
      !!afterSync.pending &&
      afterSync.nick === false,
    { afterInit, afterSync }
  );
  check(
    "明確重新確認：同一個 request_id、base_rev 7 與內容原樣再送；後端回之前已處理，讀回確認、點數只加一次、刪除暫存",
    retry.success &&
      sv.length === 2 &&
      same(sv[1].payload, first.payload) &&
      sv[1].pendingAtCall === stored &&
      back.rev === 8 &&
      back.data.gold === 1620 &&
      st().settleView.phase === "confirmed" &&
      st().settleView.reward === null &&
      pendingRaw() === null &&
      st().pendingSettle === null,
    {
      retry,
      sv: sv.map((x) => x.payload),
      gold: back.data.gold,
      view: st().settleView,
    }
  );
}
{
  // 重新確認前要讀到合法的雲端存檔：讀取失敗時不送
  await sendWith("test_settle_o", [["save_result", "network"]]);
  rule("get_profile", "reply", {
    fn: () => ({ status: 500, error: "DATA_CORRUPT" }),
  });
  const retry = await st().retrySharedSettle();
  check(
    "重新確認前讀不到合法的雲端存檔：這次不送、暫存留著",
    !retry.success && saves().length === 1 && pendingRaw() !== null,
    { retry, saves: saves().length }
  );
}

// ═══ 7. 每個 await 換帳號／登出、舊的回應晚到 ═══
{
  await fresh("test_settle_p");
  fx.seed("test_settle_q", { ...DATA0(), nickname: "乙" }, 3);
  const s = sortie("chapter1_2");
  st().armSharedSettle(s);
  const hold = rule("save_result", "hold");
  const p = st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  await until(() => hold.waiting);
  const busyA = st().busy;
  const login = await st().loginWithKey("test_settle_q");
  const mid = {
    key: st().player && st().player.key,
    busy: st().busy,
    view: st().settleView,
  };
  hold.release("ok");
  await p;
  await until(() => true, 20);
  const afterB = {
    key: st().player.key,
    busy: st().busy,
    view: st().settleView,
    pending: st().pendingSettle,
    rev: st().rev,
    gold: st().canonical.gold,
  };
  const keyA = [...session.m.keys()].find((x) =>
    x.startsWith(SETTLE_PENDING_PREFIX)
  );
  const backA = fx.read("test_settle_p");
  // 回到甲：待確認重新出現；重新確認 → 後端之前已處理 → 已保存
  await st().loginWithKey("test_settle_p");
  const backPending = st().pendingSettle;
  const retry = await st().retrySharedSettle();
  check(
    "送出中換成乙：甲遲到的回應不改乙的畫面、正在保存或待確認；甲的暫存留著",
    busyA &&
      login.success &&
      mid.key === "test_settle_q" &&
      afterB.key === "test_settle_q" &&
      !afterB.busy &&
      afterB.view === null &&
      afterB.pending === null &&
      afterB.rev === 3 &&
      !!keyA &&
      backA.rev === 8,
    { busyA, mid, afterB, keyA: !!keyA }
  );
  check(
    "回到甲：待確認重新出現，重新確認後已保存、點數只加一次",
    !!backPending &&
      retry.success &&
      fx.read("test_settle_p").data.gold === 1620 &&
      st().pendingSettle === null,
    { backPending, retry, gold: fx.read("test_settle_p").data.gold }
  );
}
{
  // 讀回確認中登出：不改登出後的狀態、暫存留著
  await fresh("test_settle_r");
  const s = sortie("chapter1_2");
  st().armSharedSettle(s);
  const hold = rule("get_profile", "hold");
  const p = st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  await until(() => hold.waiting);
  st().logout();
  hold.release("ok");
  await p;
  check(
    "讀回確認中登出：登出後沒有帳號、沒有正在保存、沒有結算狀態；暫存留著",
    st().player === null &&
      !st().busy &&
      st().settleView === null &&
      pendingRaw() !== null,
    { player: st().player, busy: st().busy, view: st().settleView }
  );
}
{
  // 送出中換關（頁面放下這一場）：送出照常完成；這段期間下一場不能固定
  await fresh("test_settle_s");
  const s = sortie("chapter1_2");
  st().armSharedSettle(s);
  const hold = rule("save_result", "hold");
  const p = st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  await until(() => hold.waiting);
  st().disarmSharedSettle();
  const s2 = sortie("chapter1_3");
  const ok2 = st().armSharedSettle(s2);
  const note2 = st().sortieNote;
  hold.release("ok");
  await p;
  check(
    "送出中換關：下一場不能固定（正在保存），這一場照常已保存，結算狀態仍屬於原本這一場",
    ok2 === false &&
      /正在保存/.test(note2 || "") &&
      st().settleView.phase === "confirmed" &&
      st().settleView.battleId === s.battleId,
    { ok2, note2, view: st().settleView }
  );
}
{
  // 同一個世代：正在保存時其他寫入不會開始，舊寫入結束後才解除
  await fresh("test_settle_t");
  const s = sortie("chapter1_2");
  st().armSharedSettle(s);
  const hold = rule("save_result", "hold");
  const p = st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  await until(() => hold.waiting);
  const nick = await st().updateNickname("改名");
  const up = await st().requestHeroUpgrade("hero_guan_yu");
  const retry = await st().retrySharedSettle();
  hold.release("ok");
  await p;
  check(
    "同一個世代正在保存結算時：改暱稱、升級、重新確認都不開始（零請求），結算完成後才解除",
    !nick.success &&
      !up.success &&
      !retry.success &&
      writes().length === 1 &&
      !st().busy &&
      st().settleView.phase === "confirmed",
    { nick, up, retry, writes: writes().map((w) => w.action) }
  );
}

// ═══ 修正追加 R77-1：人工確認跨同步、重新整理、換帳號仍在，store 也拒絕重送 ═══
for (const [name, fn] of [
  ["RESULT_UNKNOWN", () => ({ status: 409, error: "RESULT_UNKNOWN" })],
  ["REQUEST_ID_REUSED", () => ({ status: 409, error: "REQUEST_ID_REUSED" })],
  ["舊契約的回應", () => ({ status: 200, success: true, log_id: "x", rev: 8 })],
]) {
  await sendWith("test_settle_u", [["save_result", "reply", { fn }]]);
  const r0 = await st().retrySharedSettle();
  const synced = await st().forceSync();
  const afterSync = st().pendingSettle && st().pendingSettle.status;
  const r1 = await st().retrySharedSettle();
  await st().init();
  await until(() => !st().isLoading);
  const afterReload = st().pendingSettle && st().pendingSettle.status;
  const r2 = await st().retrySharedSettle();
  fx.seed("test_settle_v", DATA0(), 3);
  await st().loginWithKey("test_settle_v");
  const otherStatus = st().pendingSettle;
  await st().loginWithKey("test_settle_u");
  const backStatus = st().pendingSettle && st().pendingSettle.status;
  const r3 = await st().retrySharedSettle();
  const nick = await st().updateNickname("改名");
  const ok = st().armSharedSettle(sortie("chapter1_2"));
  check(
    `人工確認（${name}）：store 拒絕重新確認；同步、重新整理、換帳號再回來都還是要人工確認；不能改暱稱、不能出征寫入；只有一次 save_result、暫存原樣保留`,
    !r0.success &&
      synced.success &&
      afterSync === "review" &&
      !r1.success &&
      afterReload === "review" &&
      !r2.success &&
      otherStatus === null &&
      backStatus === "review" &&
      !r3.success &&
      !nick.success &&
      !ok &&
      saves().length === 1 &&
      pendingRaw() !== null &&
      /人工確認/.test(st().notice || ""),
    {
      r0,
      afterSync,
      afterReload,
      r2,
      otherStatus,
      backStatus,
      r3,
      nick,
      ok,
      saves: saves().length,
      notice: st().notice,
    }
  );
}

// ═══ 修正追加 R77-2：重新確認讀回期間暫存被改過（內容、版本、這一場）或被刪：不送，改成人工確認 ═══
{
  const variants = [
    [
      "同 request_id、base_rev 6、點數 2222 的自洽暫存",
      (env) => {
        const a = bs.armSettle({
          accountKey: "test_settle_w",
          epoch: 1,
          baseRev: 6,
          stageId: env.stageId,
          battleId: env.battleId,
          requestId: env.requestId,
        }).armed;
        const req = sync.buildSettleRequest(
          {
            stageId: env.stageId,
            result: "WIN",
            starsEarned: 3,
            kills: 12,
            timeSeconds: 95,
            battlePoints: 2222,
          },
          env.requestId,
          6
        );
        return bs.makePendingEnvelope(a, req);
      },
    ],
    [
      "同內容但換了 battle_id",
      (env) => {
        const a = bs.armSettle({
          accountKey: "test_settle_w",
          epoch: 1,
          baseRev: env.baseRev,
          stageId: env.stageId,
          battleId: "b-other",
          requestId: env.requestId,
        }).armed;
        const req = sync.buildSettleRequest(
          {
            stageId: env.stageId,
            result: "WIN",
            starsEarned: 3,
            kills: 12,
            timeSeconds: 95,
            battlePoints: 1120,
          },
          env.requestId,
          env.baseRev
        );
        return bs.makePendingEnvelope(a, req);
      },
    ],
    ["暫存被刪掉", () => null],
  ];
  const out = [];
  for (const [name, make] of variants) {
    await sendWith("test_settle_w", [["save_result", "network"]]);
    const k = pendingKey();
    const raw0 = pendingRaw();
    // 前置：第一次送出（網路錯誤）後要留有可解析的暫存；沒有或不是 JSON 物件時記成這一輪不通過（不略過、不中斷）
    let env = null;
    if (raw0 !== null) {
      try {
        env = JSON.parse(raw0);
      } catch {
        env = null;
      }
    }
    if (!k || !env || typeof env !== "object") {
      out.push({
        name,
        pre: raw0 === null ? "第一次送出後沒有暫存" : "暫存不是 JSON 物件",
      });
      continue;
    }
    const hold = rule("get_profile", "hold");
    const p = st().retrySharedSettle();
    // 重新確認一定要先讀回（沒走到讀回時記下來、這項不通過，不讓整支測試中斷）
    const reached = await until(() => hold.waiting);
    const next = make(env);
    if (next === null) session.m.delete(k);
    else session.m.set(k, next);
    if (reached) hold.release("ok");
    const r = await p;
    out.push({
      name,
      reached,
      valid: next === null || bs.parsePendingEnvelope(next, "test_settle_w").ok,
      ok: r.success,
      saves: saves().length,
      status: st().pendingSettle && st().pendingSettle.status,
      phase: st().settleView && st().settleView.phase,
    });
  }
  check(
    "重新確認的讀回期間暫存被改成另一份自洽內容（版本 6、點數 2222）、換了這一場或被刪掉：不送（只有第一次的 save_result），改成人工確認",
    out.every(
      (x) =>
        !x.pre &&
        x.reached &&
        x.valid &&
        !x.ok &&
        x.saves === 1 &&
        x.status === "review" &&
        x.phase === "review"
    ),
    out
  );
}

// ═══ 修正追加 R77-3：舊場次的回呼不動目前的固定 ═══
{
  await fresh("test_settle_x");
  const s = sortie("chapter1_2");
  st().armSharedSettle(s);
  const old = { ...R(s, "WIN", 3, 12, 95, 1120), battle_id: "b-old" };
  await st().settleSharedBattle(old);
  const after = {
    armed: st().settleArmed,
    view: st().settleView,
    saves: saves().length,
  };
  await st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  check(
    "固定這一場之後，舊場次晚到的結束回呼：不解除固定、不改結算狀態、不送；之後這一場的結果正常只送一次",
    after.armed === true &&
      after.view === null &&
      after.saves === 0 &&
      saves().length === 1 &&
      st().settleView.phase === "confirmed",
    { after, saves: saves().length, view: st().settleView }
  );
}

// ═══ 修正追加 R77-4：後端接受但讀回的存檔不合法：不報已保存、不刪暫存 ═══
{
  const out = [];
  for (const [name, fn] of [
    ["data 是 null", (res) => ({ ...res, data: null })],
    ["gold 是字串", (res) => ({ ...res, data: { ...res.data, gold: "很多" } })],
  ]) {
    await fresh("test_settle_y");
    const s = sortie("chapter1_2");
    st().armSharedSettle(s);
    rule("get_profile", "transform", { fn });
    await st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
    out.push({
      name,
      phase: st().settleView.phase,
      kept: pendingRaw() !== null,
      status: st().pendingSettle && st().pendingSettle.status,
      backRev: fx.read("test_settle_y").rev,
    });
  }
  check(
    "後端接受（rev 8）但讀回的存檔不合法（data 是 null、gold 是字串）：待確認、暫存留著、不報已保存",
    out.every(
      (x) =>
        x.phase === "pending" &&
        x.kept &&
        x.status === "pending" &&
        x.backRev === 8
    ),
    out
  );
}

// ═══ 修正追加 R77-5：暫存讀不到時維持阻擋；恢復後依暫存核實 ═══
{
  await fresh("test_settle_z");
  const s = sortie("chapter1_2");
  st().armSharedSettle(s);
  const hold = rule("save_result", "hold");
  const p = st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  await until(() => hold.waiting);
  session.failGet = true;
  hold.release("network");
  await p;
  const blocked = {
    status: st().pendingSettle && st().pendingSettle.status,
    phase: st().settleView.phase,
  };
  const nick = await st().updateNickname("改名");
  const ok = st().armSharedSettle(sortie("chapter1_3"));
  const retry = await st().retrySharedSettle();
  await st().init();
  await until(() => !st().isLoading);
  const afterReload = st().pendingSettle && st().pendingSettle.status;
  const nick2 = await st().updateNickname("改名");
  session.failGet = false;
  await st().forceSync();
  const restored = st().pendingSettle && st().pendingSettle.status;
  check(
    "送出中暫存變成讀不到（SecurityError）＋網路錯誤：維持阻擋（不能改暱稱、不能出征寫入、不能重新確認），重新整理後仍阻擋；儲存空間恢復後讀到暫存才回到待確認",
    blocked.status === "unavailable" &&
      !nick.success &&
      !ok &&
      !retry.success &&
      afterReload === "unavailable" &&
      !nick2.success &&
      net.calls.filter((c) => c.action === "save_profile").length === 0 &&
      saves().length === 1 &&
      restored === "pending" &&
      pendingRaw() !== null,
    { blocked, nick, ok, retry, afterReload, nick2, restored }
  );
}

// ═══ 第二次修正追加 R77-1a：送出中的標記；人工確認的標記寫不進去時，真正重新載入後仍不能重送 ═══
const REVIEW_PREFIX = store.SETTLE_REVIEW_PREFIX;
const reviewRaw = () => {
  for (const [k, v] of session.m) if (k.startsWith(REVIEW_PREFIX)) return v;
  return null;
};
const STORE_PATH = require.resolve(join(HERE, "../store/useJsPlayerStore.ts"));
/** 真正的重新載入：丟掉 store 模組（記憶體裡的標記、送出中的紀錄都沒了），重新載入並初始化；sessionStorage 留著 */
async function reloadStore() {
  delete require.cache[STORE_PATH];
  const s = require(STORE_PATH).useJsPlayerStore;
  await s.getState().init();
  await until(() => !s.getState().isLoading);
  return s;
}
const TERMINAL = [
  ["RESULT_UNKNOWN", () => ({ status: 409, error: "RESULT_UNKNOWN" })],
  ["REQUEST_ID_REUSED", () => ({ status: 409, error: "REQUEST_ID_REUSED" })],
  ["舊契約的回應", () => ({ status: 200, success: true, log_id: "x", rev: 8 })],
];
{
  await fresh("test_settle_qa");
  // 標記的寫入一律 quota 失敗（暫存本身寫得進去、讀得到）
  session.failSetIf = (k) => k.startsWith(REVIEW_PREFIX);
  const s = sortie("chapter1_2");
  const ok = st().armSharedSettle(s);
  rule("save_result", "reply", {
    fn: () => ({ status: 409, error: "RESULT_UNKNOWN" }),
  });
  await st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  const first = {
    phase: st().settleView.phase,
    text: st().settleView.text,
    pending: pendingRaw(),
    status: st().pendingSettle,
  };
  const s2 = await reloadStore();
  const afterReload = s2.getState().pendingSettle;
  const retry = await s2.getState().retrySharedSettle();
  session.failSetIf = null;
  check(
    "送出中的標記寫不進去（只有標記的寫入 quota 失敗）：不送出（零 save_result）、說明沒有寫入、放下暫存；真正重新載入後沒有可以重新確認的結算",
    ok &&
      first.phase === "not-sent" &&
      /不能暫存/.test(first.text) &&
      first.pending === null &&
      first.status === null &&
      afterReload === null &&
      !retry.success &&
      saves().length === 0 &&
      reviewRaw() === null,
    { ok, first, afterReload, retry, saves: saves().length }
  );
}
{
  const out = [];
  for (const [i, [name, fn]] of TERMINAL.entries()) {
    // 每輪換一把金鑰：寫不進去的人工確認會留在這個模組的記憶體（這個分頁一直擋住）
    const key = `test_settle_qb${i}`;
    await fresh(key);
    // 送出中的標記寫得進去；之後的人工確認標記寫不進去
    session.failSetIf = (k, v) =>
      k.startsWith(REVIEW_PREFIX) && !v.includes('"SENDING"');
    const s = sortie("chapter1_2");
    st().armSharedSettle(s);
    rule("save_result", "reply", { fn });
    await st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
    const before = st().pendingSettle && st().pendingSettle.status;
    const r0 = await st().retrySharedSettle();
    const s2 = await reloadStore();
    const g = s2.getState();
    const afterReload = g.pendingSettle && g.pendingSettle.status;
    const r1 = await g.retrySharedSettle();
    const nick = await g.updateNickname("改名");
    const armedOk = g.armSharedSettle(sortie("chapter1_2"));
    session.failSetIf = null;
    out.push({
      name,
      before,
      r0: r0.success,
      afterReload,
      r1: r1.success,
      nick: nick.success,
      armedOk,
      saves: saves().length,
      profiles: net.calls.filter((c) => c.action === "save_profile").length,
      kept: pendingRaw() !== null,
    });
  }
  check(
    "人工確認的標記寫不進去（RESULT_UNKNOWN、REQUEST_ID_REUSED、舊契約）：這個頁面要人工確認；真正重新載入後仍要人工確認（送出中的標記還在），不能重新確認、改暱稱或出征寫入；只有一次 save_result、暫存原樣保留",
    out.length === 3 &&
      out.every(
        (x) =>
          x.before === "review" &&
          !x.r0 &&
          x.afterReload === "review" &&
          !x.r1 &&
          !x.nick &&
          !x.armedOk &&
          x.saves === 1 &&
          x.profiles === 0 &&
          x.kept
      ),
    out
  );
}
{
  // 正常的結果不明（寫入了但回應遺失）仍可在真正重新載入後原樣重新確認
  await fresh("test_settle_qc");
  const s = sortie("chapter1_2");
  st().armSharedSettle(s);
  rule("save_result", "lost");
  await st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  const first = {
    status: st().pendingSettle && st().pendingSettle.status,
    phase: st().settleView.phase,
    mark: reviewRaw(),
  };
  const s2 = await reloadStore();
  const afterReload =
    s2.getState().pendingSettle && s2.getState().pendingSettle.status;
  const retry = await s2.getState().retrySharedSettle();
  const sv = saves();
  const back = fx.read("test_settle_qc");
  check(
    "結果不明（寫入了但回應遺失）：送出中的標記已解除、待確認；真正重新載入後仍可原樣重新確認一次；後端回之前已處理，讀回確認、點數只加一次、暫存與標記都刪除",
    first.status === "pending" &&
      first.phase === "pending" &&
      first.mark === null &&
      afterReload === "pending" &&
      retry.success &&
      sv.length === 2 &&
      same(sv[1].payload, sv[0].payload) &&
      back.rev === 8 &&
      back.data.gold === 1620 &&
      s2.getState().settleView.phase === "confirmed" &&
      pendingRaw() === null &&
      reviewRaw() === null,
    { first, afterReload, retry, saves: sv.length, gold: back.data.gold }
  );
}
{
  // 送出途中真正重新載入：回應還沒回來，可能已經處理
  await fresh("test_settle_qd");
  const s = sortie("chapter1_2");
  st().armSharedSettle(s);
  const hold = rule("save_result", "hold");
  const p = st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
  await until(() => hold.waiting);
  const midStatus = st().pendingSettle && st().pendingSettle.status;
  const s2 = await reloadStore();
  const g = s2.getState();
  const afterReload = g.pendingSettle && g.pendingSettle.status;
  const retry = await g.retrySharedSettle();
  const nick = await g.updateNickname("改名");
  const n = saves().length;
  const kept = pendingRaw() !== null;
  check(
    "送出途中真正重新載入（回應還沒回來）：新頁面要人工確認，不能重新確認或改暱稱（只有一次 save_result、暫存留著）",
    midStatus === "pending" &&
      afterReload === "review" &&
      !retry.success &&
      !nick.success &&
      n === 1 &&
      kept,
    { midStatus, afterReload, retry, nick, n, kept }
  );
  // 結束舊模組那個暫停中的請求（真正的瀏覽器重新整理後舊頁面不會再處理）
  hold.release("network");
  await p;
}

// ═══ 第二次修正追加 R77-1b：換帳號或登出後才回來的終止回應：記到原帳號，不動新帳號 ═══
{
  const out = [];
  for (const [name, fn] of TERMINAL) {
    for (const how of ["換成乙", "登出"]) {
      await fresh("test_settle_la");
      fx.seed("test_settle_lb", { ...DATA0(), nickname: "乙" }, 3);
      const s = sortie("chapter1_2");
      st().armSharedSettle(s);
      const hold = rule("save_result", "hold", { fn });
      const p = st().settleSharedBattle(R(s, "WIN", 3, 12, 95, 1120));
      await until(() => hold.waiting);
      let bBefore = null;
      let bHold = null;
      let bWrite = null;
      if (how === "換成乙") {
        await st().loginWithKey("test_settle_lb");
        bBefore = { rev: st().rev, canonical: clone(st().canonical) };
        // 乙開始自己的寫入（暫停中）：甲晚到的回應不能動乙的 owner
        bHold = rule("save_profile", "hold");
        bWrite = st().updateNickname("乙改名");
        await until(() => bHold.waiting);
      } else st().logout();
      hold.release("reply");
      await p;
      await until(() => true, 20);
      const mid = {
        key: st().player ? st().player.key : null,
        busy: st().busy,
        view: st().settleView,
        pending: st().pendingSettle,
        rev: st().rev,
        canonical: clone(st().canonical),
      };
      let bDone = null;
      if (bHold) {
        bHold.release("ok");
        bDone = await bWrite;
      }
      const bAfter =
        how === "換成乙"
          ? {
              ok: bDone.success,
              nick: st().canonical.nickname,
              rev: st().rev,
              busy: st().busy,
            }
          : null;
      await st().loginWithKey("test_settle_la");
      const back = st().pendingSettle && st().pendingSettle.status;
      const retry = await st().retrySharedSettle();
      const s2 = await reloadStore();
      const reload =
        s2.getState().pendingSettle && s2.getState().pendingSettle.status;
      const retry2 = await s2.getState().retrySharedSettle();
      const bOk =
        how === "換成乙"
          ? mid.key === "test_settle_lb" &&
            mid.busy === true &&
            mid.view === null &&
            mid.pending === null &&
            mid.rev === 3 &&
            same(mid.canonical, bBefore.canonical) &&
            bAfter.ok &&
            bAfter.nick === "乙改名" &&
            bAfter.rev === 4 &&
            !bAfter.busy
          : mid.key === null && !mid.busy && mid.view === null;
      out.push({
        name,
        how,
        bOk,
        mid: { key: mid.key, busy: mid.busy, view: mid.view },
        bAfter,
        back,
        retry: retry.success,
        reload,
        retry2: retry2.success,
        saves: saves().length,
        kept: pendingRaw() !== null,
      });
    }
  }
  check(
    "甲送出中換成乙或登出，之後才收到終止回應（RESULT_UNKNOWN、REQUEST_ID_REUSED、舊契約）：乙的存檔、版本、結算畫面與自己的寫入都不受影響；回到甲或真正重新載入都要人工確認、不能重新確認（只有一次 save_result）",
    out.length === 6 &&
      out.every(
        (x) =>
          x.bOk &&
          x.back === "review" &&
          !x.retry &&
          x.reload === "review" &&
          !x.retry2 &&
          x.saves === 1 &&
          x.kept
      ),
    out
  );
}

// ═══ 第二次修正追加 R77-5：登入後暫存或標記才變成讀不到：寫入與固定出征前重新讀取 ═══
{
  const out = [];
  for (const [name, prefixes] of [
    ["只有暫存讀不到", [SETTLE_PENDING_PREFIX]],
    ["只有標記讀不到", [REVIEW_PREFIX]],
    ["兩者都讀不到", [SETTLE_PENDING_PREFIX, REVIEW_PREFIX]],
  ]) {
    // 寫入：登入後才讀不到，第一個動作就是寫入（不靠其他動作先更新畫面上的狀態）
    await fresh("test_settle_sa");
    const before = st().pendingSettle;
    session.failGetPrefixes = prefixes;
    const nick = await st().updateNickname("改名");
    const team = await st().updateTeam(st().player.team);
    const up = await st().requestHeroUpgrade("hero_guan_yu");
    const state = st().pendingSettle && st().pendingSettle.status;
    const w0 = writes().length;
    session.failGetPrefixes = [];
    const nick2 = await st().updateNickname("恢復");
    const saved = fx.read("test_settle_sa").data.nickname;
    // 固定出征：重新開始，登入後才讀不到，第一個動作就是固定出征
    await fresh("test_settle_sa");
    session.failGetPrefixes = prefixes;
    const ok = st().armSharedSettle(sortie("chapter1_2"));
    const armed = st().settleArmed;
    const armState = st().pendingSettle && st().pendingSettle.status;
    session.failGetPrefixes = [];
    out.push({
      name,
      before,
      nick: nick.success,
      team: team.success,
      up: up.success,
      state,
      w0,
      nick2: nick2.success,
      saved,
      ok,
      armed,
      armState,
    });
  }
  check(
    "登入時暫存可讀、之後才變成讀不到（只有暫存、只有標記、兩者）：改暱稱、隊伍、升級都不送（零寫入）、不固定出征、狀態改成讀不到；恢復可讀、沒有暫存時正常寫入",
    out.length === 3 &&
      out.every(
        (x) =>
          x.before === null &&
          !x.nick &&
          !x.team &&
          !x.up &&
          x.state === "unavailable" &&
          x.w0 === 0 &&
          x.nick2 &&
          x.saved === "恢復" &&
          !x.ok &&
          x.armed === false &&
          x.armState === "unavailable"
      ),
    out
  );
}
{
  // 有合法的待確認，之後標記才讀不到；恢復後依原暫存重新確認
  await sendWith("test_settle_sb", [["save_result", "lost"]]);
  const stored = pendingRaw();
  session.failGetPrefixes = [REVIEW_PREFIX];
  const retry = await st().retrySharedSettle();
  const nick = await st().updateNickname("改名");
  const state = st().pendingSettle && st().pendingSettle.status;
  const n = saves().length;
  session.failGetPrefixes = [];
  const retry2 = await st().retrySharedSettle();
  const sv = saves();
  check(
    "有合法的待確認、之後標記才讀不到：不能重新確認或改暱稱；恢復可讀後依原暫存原樣重新確認一次、點數只加一次",
    !retry.success &&
      !nick.success &&
      state === "unavailable" &&
      n === 1 &&
      retry2.success &&
      sv.length === 2 &&
      sv[1].pendingAtCall === stored &&
      fx.read("test_settle_sb").data.gold === 1620 &&
      pendingRaw() === null,
    { retry, nick, state, n, retry2, gold: fx.read("test_settle_sb").data.gold }
  );
}
{
  // 訪客不受影響
  st().logout();
  local.clear();
  session.clear();
  net.calls = [];
  net.rules = [];
  await st().startGuestMode();
  session.failGet = true;
  const nick = await st().updateNickname("遊俠");
  session.failGet = false;
  check(
    "訪客不受影響：sessionStorage 讀不到時仍可改暱稱（只在本機，零請求）",
    nick.success && st().player.nickname === "遊俠" && net.calls.length === 0,
    { nick, calls: net.calls.length }
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
