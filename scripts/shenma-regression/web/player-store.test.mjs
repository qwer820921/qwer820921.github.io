// 神馬三國玩家存檔 store（playerStore.ts）的非同步測試，不需要瀏覽器
// - 用專案內的 TypeScript 即時轉譯 store 與相依模組，在 Node 內以假的 storage、fetch、計時器執行
// - 每個 GAS 請求都可以停在「待回應」，由測試決定何時成功、後端錯誤或網路錯誤，不靠固定等待
// - 所有金鑰都是虛構的 test_*，後端是記憶體內的 mock
// 用法：node scripts/shenma-regression/web/player-store.test.mjs
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const GAME = join(ROOT, "src/app/(games)/shenmaSanguo");

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

// ── 假環境 ─────────────────────────────────────────────────────
class MemStorage {
  constructor() {
    this.m = new Map();
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

const realSetImmediate = setImmediate;
const tick = () => new Promise((r) => realSetImmediate(r));
async function settle(n = 20) {
  for (let i = 0; i < n; i++) await tick();
}

const baseProfile = (nickname = "旅行者") => ({
  nickname,
  level: 1,
  exp: 0,
  gold: 1000,
  capacity: 11,
  max_stage: "chapter1_1",
  heroes: [],
  team: [{ hero_id: "guan_yu", slot: 1 }],
});

function makeEnv() {
  // 計時器：只有 tick(ms) 才會前進
  const clock = { now: 0, seq: 0, timers: new Map() };
  globalThis.setTimeout = (fn, ms = 0) => {
    const id = ++clock.seq;
    clock.timers.set(id, { at: clock.now + ms, fn });
    return id;
  };
  globalThis.clearTimeout = (id) => clock.timers.delete(id);
  clock.advance = async (ms) => {
    const until = clock.now + ms;
    for (;;) {
      const due = [...clock.timers.entries()]
        .filter(([, t]) => t.at <= until)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      if (due.length === 0) break;
      const [id, t] = due[0];
      clock.timers.delete(id);
      clock.now = t.at;
      t.fn();
      await settle();
    }
    clock.now = until;
    await settle();
  };

  const local = new MemStorage();
  const session = new MemStorage();
  const listeners = {};
  globalThis.window = {
    addEventListener: (type, fn) => {
      (listeners[type] ||= []).push(fn);
    },
    removeEventListener: () => {},
  };
  globalThis.localStorage = local;
  globalThis.sessionStorage = session;
  globalThis.window.localStorage = local;
  globalThis.window.sessionStorage = session;

  // mock 後端：held 內的 action 不會自動回應，由測試決定結果
  const server = {
    profiles: new Map(),
    calls: [],
    held: new Set(),
    battleLogs: [],
    count(action, key) {
      return this.calls.filter(
        (c) => c.action === action && (key === undefined || c.key === key)
      ).length;
    },
    handle(c) {
      let res;
      switch (c.action) {
        case "get_profile":
          res = this.profiles.has(c.key)
            ? { status: 200, data: structuredClone(this.profiles.get(c.key)) }
            : { status: 404, error: "PROFILE_NOT_FOUND" };
          break;
        case "create_profile":
          this.profiles.set(c.key, baseProfile(c.payload?.nickname));
          res = { status: 200 };
          break;
        case "save_profile":
          this.profiles.set(c.key, structuredClone(c.payload.data));
          res = { status: 200 };
          break;
        case "save_result":
          this.battleLogs.push({ key: c.key, ...c.payload });
          res = { status: 200 };
          break;
        case "upgrade_hero": {
          const p = this.profiles.get(c.key);
          const hero = {
            hero_id: c.payload.hero_id,
            level: 2,
            star: 0,
            atk: 160,
            def: 128,
            hp: 1600,
          };
          p.gold -= 100;
          p.heroes = [
            ...p.heroes.filter((h) => h.hero_id !== hero.hero_id),
            hero,
          ];
          res = { status: 200, hero, gold_remaining: p.gold };
          break;
        }
        default:
          res = { status: 400, error: "UNSUPPORTED" };
      }
      c.respond(res);
    },
    async waitFor(action, key, nth = 1) {
      for (let i = 0; i < 2000; i++) {
        const list = this.calls.filter(
          (c) => c.action === action && (key === undefined || c.key === key)
        );
        if (list.length >= nth) return list[nth - 1];
        await tick();
      }
      throw new Error(`等不到第 ${nth} 個 ${action}(${key ?? "*"}) 請求`);
    },
  };
  globalThis.fetch = (url, init) => {
    const body = JSON.parse(init.body);
    return new Promise((resolveFetch, rejectFetch) => {
      const call = {
        action: body.action,
        key: body.key,
        payload: body.payload,
        keepalive: !!init.keepalive,
        settled: false,
        respond(json) {
          call.settled = true;
          resolveFetch({ json: async () => json });
        },
        networkError() {
          call.settled = true;
          rejectFetch(new TypeError("Failed to fetch"));
        },
      };
      server.calls.push(call);
      if (!server.held.has(call.action)) server.handle(call);
    });
  };
  return { clock, local, session, server, listeners };
}

function freshStore() {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(GAME)) delete require.cache[k];
  }
  return require(join(GAME, "store/playerStore.ts")).usePlayerStore;
}

const SESSION_KEY = "shenma_player_state";
const readSession = (env) =>
  JSON.parse(env.session.getItem(SESSION_KEY) || "null");

// 模擬同一分頁重新整理：舊頁面的計時器與事件監聽都消失，舊頁面還在等的請求，回應也不會再被處理。
// 伺服器仍可能處理這些請求：之後用 env.server.handle(call) 讓伺服器處理，但回應送不到任何頁面。
// sessionStorage／localStorage 保留（同一分頁）。回傳新頁面的 store getter。
function reloadPage(env) {
  env.clock.timers.clear();
  for (const k of Object.keys(env.listeners)) delete env.listeners[k];
  for (const c of env.server.calls) {
    if (c.settled) continue;
    c.orphaned = true;
    c.respond = () => {
      c.settled = true;
    };
    c.networkError = () => {
      c.settled = true;
    };
  }
  const store = freshStore();
  return () => store.getState();
}
/** 觸發頁面卸載（beforeunload）時註冊的所有監聽 */
const unload = (env) => {
  for (const fn of env.listeners.beforeunload || []) fn();
};
/** 讓伺服器處理請求，但回應在途中遺失（頁面收不到） */
const serverAppliesButResponseLost = (env, call) => {
  call.respond = () => {
    call.settled = true;
  };
  env.server.handle(call);
};
/** 送出順序：key 的 action 請求在 calls 中的位置（從 from 開始） */
const indexesOf = (env, action, key, from = 0) =>
  env.server.calls
    .map((c, i) => ({ c, i }))
    .filter(({ c, i }) => i >= from && c.action === action && c.key === key)
    .map(({ i }) => i);

// ── 測試框架 ───────────────────────────────────────────────────
const results = [];
const limitations = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${d}`.slice(0, 400));
}
// 已知限制的 fixture：記錄「目前的行為仍會出現這個限制」，不計入 PASS／FAIL。
// reproduced=false 代表行為改變了（例如後端加了版本號），需要更新文件與這個 fixture。
function limitation(name, reproduced, detail = "") {
  limitations.push({ name, reproduced: !!reproduced, detail });
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log(
    `${reproduced ? "LIMIT" : "LIMIT-CHANGED"}  ${name}  ${d}`.slice(0, 400)
  );
}
async function test(id, fn) {
  const env = makeEnv();
  const store = freshStore();
  const S = () => store.getState();
  try {
    await fn({ env, S, store });
  } catch (e) {
    check(
      `${id} 執行時拋出例外`,
      false,
      String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e)
    );
  }
}
const loaded = async (env, S, key, profile = baseProfile()) => {
  env.server.profiles.set(key, profile);
  env.local.setItem("shenma_player_key", key);
  const r = await S().initFromGAS(key);
  await settle();
  return r;
};
const status = (S) => S().player?.syncStatus;

// ── 驗收 1：有 key、無 session，get_profile 失敗 ────────────────
await test("W1", async ({ env, S }) => {
  env.server.profiles.set("test_w1", baseProfile("既有玩家"));
  env.local.setItem("shenma_player_key", "test_w1");
  env.server.held.add("get_profile");
  const p = S().initFromGAS("test_w1");
  (await env.server.waitFor("get_profile", "test_w1")).networkError();
  const r = await p;
  check("W1-1 get_profile 網路錯誤：回傳失敗", r && r.ok === false, r);
  check(
    "W1-2 載入狀態結束、有錯誤可顯示、沒有玩家資料",
    S().isLoading === false && !!S().error && S().player === null,
    { isLoading: S().isLoading, error: S().error }
  );
  check(
    "W1-3 非 PROFILE_NOT_FOUND 不建檔",
    env.server.count("create_profile") === 0,
    env.server.count("create_profile")
  );

  const p2 = S().initFromGAS("test_w1");
  (await env.server.waitFor("get_profile", "test_w1", 2)).respond({
    status: 500,
    error: "INTERNAL",
  });
  const r2 = await p2;
  check(
    "W1-4 後端 500：回傳失敗、仍不建檔",
    r2 && r2.ok === false && env.server.count("create_profile") === 0,
    r2
  );

  env.server.held.delete("get_profile");
  const r3 = await S().initFromGAS("test_w1");
  check(
    "W1-5 重試成功：載入既有存檔、錯誤清除",
    r3 &&
      r3.ok === true &&
      r3.created === false &&
      S().player?.nickname === "既有玩家" &&
      S().error === null,
    r3
  );
});

// ── 驗收 2：新 key 建檔 ─────────────────────────────────────────
await test("W2", async ({ env, S }) => {
  const r = await S().initFromGAS("test_w2_new");
  check(
    "W2-1 PROFILE_NOT_FOUND 建檔一次並成功",
    r &&
      r.ok === true &&
      r.created === true &&
      env.server.count("create_profile") === 1,
    { r, creates: env.server.count("create_profile") }
  );
  check(
    "W2-2 成功後才寫入 key 與 session",
    env.local.getItem("shenma_player_key") === "test_w2_new" &&
      readSession(env)?.key === "test_w2_new"
  );
});
await test("W2b", async ({ env, S }) => {
  env.server.held.add("create_profile");
  const p = S().initFromGAS("test_w2b");
  (await env.server.waitFor("create_profile", "test_w2b")).respond({
    status: 500,
    error: "CREATE_FAILED",
  });
  const r = await p;
  check(
    "W2-3 create_profile 失敗：不報成功、沒有玩家資料、不寫入 key",
    r &&
      r.ok === false &&
      S().player === null &&
      env.local.getItem("shenma_player_key") === null,
    r
  );
  env.server.held.delete("create_profile");
  const r2 = await S().initFromGAS("test_w2b");
  check(
    "W2-4 重試後建檔成功",
    r2 && r2.ok === true && S().player?.key === "test_w2b",
    r2
  );
});
await test("W2c", async ({ env, S }) => {
  // 建檔其實成功、但回應遺失：重試時先讀到存檔，不能再建一次
  env.server.held.add("create_profile");
  const p = S().initFromGAS("test_w2c");
  const c = await env.server.waitFor("create_profile", "test_w2c");
  env.server.profiles.set("test_w2c", baseProfile("旅行者"));
  c.networkError();
  const r = await p;
  env.server.held.delete("create_profile");
  const r2 = await S().initFromGAS("test_w2c");
  check(
    "W2-5 建檔回應遺失後重試：讀到存檔、只建檔 1 次",
    r &&
      r.ok === false &&
      r2 &&
      r2.ok === true &&
      env.server.count("create_profile") === 1,
    { r, r2, creates: env.server.count("create_profile") }
  );
});
await test("W2d", async ({ env, S }) => {
  env.server.held.add("get_profile");
  const p1 = S().initFromGAS("test_w2d");
  const p2 = S().initFromGAS("test_w2d");
  await settle();
  const gets = env.server.count("get_profile", "test_w2d");
  env.server.held.delete("get_profile");
  for (const c of env.server.calls.filter((x) => !x.settled))
    env.server.handle(c);
  const [r1, r2] = await Promise.all([p1, p2]);
  check(
    "W2-6 連按兩次：只發 1 次 get_profile、只建檔 1 次",
    gets === 1 && env.server.count("create_profile") === 1 && r1?.ok && r2?.ok,
    { gets, creates: env.server.count("create_profile") }
  );
});
await test("W2e", async ({ env, S }) => {
  env.server.held.add("get_profile");
  const p = S().initFromGAS("test_w2e");
  env.server.handle(await env.server.waitFor("get_profile", "test_w2e", 1)); // NOT_FOUND
  (await env.server.waitFor("get_profile", "test_w2e", 2)).networkError(); // 建檔後讀取失敗
  const r = await p;
  check(
    "W2-7 建檔後讀取失敗：不報成功",
    r && r.ok === false && S().player === null,
    r
  );
});

// ── 驗收 3：A 慢、B 後到 ───────────────────────────────────────
for (const aOutcome of ["success", "error"]) {
  await test(`W3-${aOutcome}`, async ({ env, S }) => {
    env.server.profiles.set("test_a", baseProfile("A"));
    env.server.profiles.set("test_b", baseProfile("B"));
    env.server.held.add("get_profile");
    const pA = S().initFromGAS("test_a");
    const cA = await env.server.waitFor("get_profile", "test_a");
    const pB = S().initFromGAS("test_b");
    env.server.handle(await env.server.waitFor("get_profile", "test_b"));
    const rB = await pB;
    if (aOutcome === "success") env.server.handle(cA);
    else cA.networkError();
    const rA = await pA;
    await settle();
    check(
      `W3-${aOutcome} A 最後${aOutcome === "success" ? "成功" : "失敗"}也不覆蓋 B`,
      rB?.ok === true &&
        rA?.ok === false &&
        S().player?.key === "test_b" &&
        env.local.getItem("shenma_player_key") === "test_b" &&
        readSession(env)?.key === "test_b" &&
        S().error === null &&
        S().isLoading === false,
      {
        rA,
        rB,
        player: S().player?.key,
        lsKey: env.local.getItem("shenma_player_key"),
        error: S().error,
      }
    );
  });
}
await test("W3b", async ({ env, S }) => {
  await loaded(env, S, "test_a", baseProfile("A"));
  env.server.profiles.set("test_b", baseProfile("B"));
  S().updateTeam([{ hero_id: "zhao_yun", slot: 1 }]);
  env.server.held.add("save_profile");
  const p = S().initFromGAS("test_b");
  (await env.server.waitFor("save_profile", "test_a")).respond({
    status: 500,
    error: "SAVE_FAILED",
  });
  const r = await p;
  await settle();
  check(
    "W3-3 A 未同步修改保存失敗：切換被擋",
    r?.ok === false &&
      S().player?.key === "test_a" &&
      S().player?.team?.[0]?.hero_id === "zhao_yun" &&
      env.local.getItem("shenma_player_key") === "test_a" &&
      readSession(env)?.key === "test_a" &&
      readSession(env)?.team?.[0]?.hero_id === "zhao_yun",
    { r, player: S().player?.key, team: S().player?.team }
  );
  check(
    "W3-4 切換被擋時沒有讀取 B",
    env.server.count("get_profile", "test_b") === 0
  );
  check("W3-5 A 仍標為未同步", status(S) === "pending", status(S));
});
await test("W3c", async ({ env, S }) => {
  await loaded(env, S, "test_a", baseProfile("A"));
  env.server.profiles.set("test_b", baseProfile("B"));
  S().updateTeam([{ hero_id: "zhao_yun", slot: 1 }]);
  const r = await S().initFromGAS("test_b");
  check(
    "W3-6 A 先保存成功再切換到 B",
    r?.ok === true &&
      env.server.profiles.get("test_a").team[0].hero_id === "zhao_yun" &&
      S().player?.key === "test_b" &&
      S().player?.nickname === "B",
    { r, serverA: env.server.profiles.get("test_a").team }
  );
});
await test("W3d", async ({ env, S }) => {
  await loaded(env, S, "test_a", baseProfile("A"));
  env.server.profiles.set("test_b", baseProfile("B"));
  env.server.held.add("get_profile");
  const pRefresh = S().backgroundRefresh("test_a");
  const cRefresh = await env.server.waitFor("get_profile", "test_a", 2);
  const pB = S().initFromGAS("test_b");
  env.server.handle(await env.server.waitFor("get_profile", "test_b"));
  await pB;
  env.server.handle(cRefresh);
  await pRefresh;
  await settle();
  check(
    "W3-7 切換後 A 的背景讀取回來不影響 B",
    S().player?.key === "test_b" && S().player?.nickname === "B",
    S().player?.key
  );
});

// ── 驗收 4：重新整理後恢復未完成的同步 ─────────────────────────
for (const [id, sess, label] of [
  ["W4-pending", { syncStatus: "pending", rev: 2, syncedRev: 1 }, "Pending"],
  ["W4-syncing", { syncStatus: "syncing", rev: 3, syncedRev: 2 }, "Syncing"],
  ["W4-legacy", { syncStatus: "syncing" }, "舊版 Syncing（無版本號）"],
]) {
  await test(id, async ({ env, S }) => {
    env.server.profiles.set("test_r", baseProfile("伺服器舊資料"));
    env.local.setItem("shenma_player_key", "test_r");
    env.session.setItem(
      SESSION_KEY,
      JSON.stringify({
        ...baseProfile("本機新暱稱"),
        team: [{ hero_id: "zhao_yun", slot: 1 }],
        key: "test_r",
        ...sess,
      })
    );
    const ok = S().loadFromSession("test_r");
    await env.clock.advance(60_000);
    const server = env.server.profiles.get("test_r");
    check(
      `${id} ${label} session 重新整理後不操作也會補送 save_profile`,
      ok === true &&
        env.server.count("save_profile", "test_r") >= 1 &&
        server.nickname === "本機新暱稱" &&
        server.team[0].hero_id === "zhao_yun",
      {
        saves: env.server.count("save_profile", "test_r"),
        server: { nickname: server.nickname },
      }
    );
    check(
      `${id} 補送成功後 UI 與 session 都是 Idle`,
      status(S) === "idle" && readSession(env)?.syncStatus === "idle",
      { store: status(S), session: readSession(env)?.syncStatus }
    );
    check(
      `${id} 不重播 save_result／upgrade_hero`,
      env.server.count("save_result") === 0 &&
        env.server.count("upgrade_hero") === 0
    );
    const sent = env.server.calls.find((c) => c.action === "save_profile");
    check(
      `${id} 送出的資料不含本機欄位`,
      sent &&
        !("key" in sent.payload.data) &&
        !("syncStatus" in sent.payload.data) &&
        !("rev" in sent.payload.data) &&
        !("syncedRev" in sent.payload.data),
      sent && Object.keys(sent.payload.data)
    );
  });
}
await test("W4-idle", async ({ env, S }) => {
  env.local.setItem("shenma_player_key", "test_i");
  env.session.setItem(
    SESSION_KEY,
    JSON.stringify({
      ...baseProfile(),
      key: "test_i",
      syncStatus: "idle",
      rev: 4,
      syncedRev: 4,
    })
  );
  S().loadFromSession("test_i");
  await env.clock.advance(120_000);
  check(
    "W7-1 Idle session 不會產生 save_profile",
    env.server.count("save_profile") === 0,
    env.server.count("save_profile")
  );
});
await test("W4-mismatch", async ({ env, S }) => {
  env.server.profiles.set("test_y", baseProfile("Y"));
  env.local.setItem("shenma_player_key", "test_y");
  env.session.setItem(
    SESSION_KEY,
    JSON.stringify({
      ...baseProfile("X 的資料"),
      key: "test_x",
      syncStatus: "pending",
      rev: 2,
      syncedRev: 1,
    })
  );
  const ok = S().loadFromSession("test_y");
  await env.clock.advance(60_000);
  const r = ok ? null : await S().initFromGAS("test_y");
  await env.clock.advance(60_000);
  check(
    "W7-2 session 的 key 與目前 key 不符：不載入、不跨帳號寫入",
    ok === false &&
      env.server.count("save_profile", "test_y") === 0 &&
      env.server.profiles.get("test_y").nickname === "Y" &&
      S().player?.key === "test_y" &&
      S().player?.nickname === "Y",
    {
      ok,
      r,
      saves: env.server.calls
        .filter((c) => c.action === "save_profile")
        .map((c) => c.key),
      player: S().player?.nickname,
    }
  );
});

// ── 驗收 5：save_profile 在途時又修改 ──────────────────────────
await test("W5", async ({ env, S }) => {
  await loaded(env, S, "test_s", baseProfile("原暱稱"));
  S().updateTeam([{ hero_id: "zhao_yun", slot: 1 }]);
  env.server.held.add("save_profile");
  await env.clock.advance(30_000);
  const c1 = await env.server.waitFor("save_profile", "test_s", 1);
  S().updateNickname("新暱稱");
  env.server.handle(c1);
  await settle();
  check(
    "W5-1 舊回應回來後最新修改仍是 Pending",
    status(S) !== "idle" &&
      readSession(env)?.syncStatus !== "idle" &&
      S().player?.nickname === "新暱稱",
    { store: status(S), session: readSession(env)?.syncStatus }
  );
  env.server.held.delete("save_profile");
  await env.clock.advance(60_000);
  const server = env.server.profiles.get("test_s");
  check(
    "W5-2 最終補送成功：後端、UI、session 一致",
    server.nickname === "新暱稱" &&
      server.team[0].hero_id === "zhao_yun" &&
      status(S) === "idle" &&
      readSession(env)?.syncStatus === "idle" &&
      readSession(env)?.nickname === "新暱稱",
    { server: server.nickname, store: status(S) }
  );
});

// ── 驗收 6：背景讀取與手動同步 ─────────────────────────────────
await test("W6a", async ({ env, S }) => {
  await loaded(env, S, "test_bg", baseProfile("伺服器"));
  env.server.held.add("get_profile");
  const p = S().backgroundRefresh("test_bg");
  const c = await env.server.waitFor("get_profile", "test_bg", 2);
  S().updateNickname("本機修改");
  env.server.handle(c);
  await p;
  await settle();
  check(
    "W6-1 背景讀取在途時有本機修改：舊讀取結果被忽略",
    S().player?.nickname === "本機修改" && status(S) === "pending",
    { nickname: S().player?.nickname, status: status(S) }
  );
});
await test("W6b", async ({ env, S }) => {
  await loaded(env, S, "test_rf", baseProfile("伺服器"));
  S().updateTeam([{ hero_id: "zhao_yun", slot: 1 }]);
  env.server.held.add("save_profile");
  const p = S().refreshProfile();
  (await env.server.waitFor("save_profile", "test_rf")).networkError();
  const r = await p;
  await settle();
  check(
    "W6-2 手動同步時保存失敗：回傳失敗、不讀取伺服器舊資料",
    r?.ok === false && env.server.count("get_profile", "test_rf") === 1,
    { r, gets: env.server.count("get_profile", "test_rf") }
  );
  check(
    "W6-3 手動同步失敗後保留本機資料與 session",
    S().player?.team?.[0]?.hero_id === "zhao_yun" &&
      readSession(env)?.team?.[0]?.hero_id === "zhao_yun" &&
      status(S) === "pending",
    { team: S().player?.team, status: status(S) }
  );
  env.server.held.delete("save_profile");
  const r2 = await S().refreshProfile();
  check(
    "W6-4 再按一次：先保存再讀取，回報成功",
    r2?.ok === true &&
      env.server.profiles.get("test_rf").team[0].hero_id === "zhao_yun" &&
      S().player?.team?.[0]?.hero_id === "zhao_yun" &&
      status(S) === "idle",
    r2
  );
});

// ── 驗收 7：同步失敗後保留並重試 ───────────────────────────────
await test("W7", async ({ env, S }) => {
  await loaded(env, S, "test_retry", baseProfile("原暱稱"));
  S().updateNickname("要保存的暱稱");
  env.server.held.add("save_profile");
  await env.clock.advance(30_000);
  (await env.server.waitFor("save_profile", "test_retry", 1)).respond({
    status: 500,
    error: "TEMP",
  });
  await settle();
  check(
    "W7-3 同步失敗：資料保留、仍為 Pending",
    S().player?.nickname === "要保存的暱稱" &&
      status(S) === "pending" &&
      readSession(env)?.nickname === "要保存的暱稱",
    status(S)
  );
  env.server.held.delete("save_profile");
  await env.clock.advance(60_000);
  check(
    "W7-4 之後自動重試成功",
    env.server.profiles.get("test_retry").nickname === "要保存的暱稱" &&
      status(S) === "idle",
    { saves: env.server.count("save_profile"), status: status(S) }
  );
});

// ── 驗收 8（相容修正）：升級與戰鬥結算的回呼 ───────────────────
const heroCfg = {
  hero_id: "guan_yu",
  upgrade_cost_base: 100,
  base_atk: 150,
  base_def: 120,
  base_hp: 1500,
  atk_growth: 10,
  def_growth: 8,
  hp_growth: 100,
};
await test("W8a", async ({ env, S }) => {
  await loaded(env, S, "test_up", baseProfile());
  env.server.held.add("upgrade_hero");
  const p = S().upgradeHero("guan_yu", heroCfg);
  const c = await env.server.waitFor("upgrade_hero", "test_up");
  const second = await S().upgradeHero("guan_yu", heroCfg);
  S().updateTeam([{ hero_id: "zhao_yun", slot: 1 }]);
  env.server.handle(c);
  const r = await p;
  await settle();
  check(
    "W8-1 升級在途時修改隊伍：回應回來不覆蓋隊伍",
    r?.success === true &&
      S().player?.team?.[0]?.hero_id === "zhao_yun" &&
      S().player?.heroes?.find((h) => h.hero_id === "guan_yu")?.level === 2,
    { team: S().player?.team, heroes: S().player?.heroes }
  );
  check(
    "W8-2 升級在途時再按升級：被擋下，不重複扣款",
    second?.success === false && S().player?.gold === 900,
    { second, gold: S().player?.gold }
  );
});
await test("W8b", async ({ env, S }) => {
  await loaded(env, S, "test_bt", baseProfile());
  env.server.held.add("save_profile");
  // Round 8：結算要帶開戰時取得的戰鬥票（呼叫方式調整，斷言不變）
  S().applyBattleResult(
    {
      result: "WIN",
      stage_id: "chapter1_1",
      stars_earned: 3,
      kills: 5,
      time_seconds: 30,
      loots: [{ item: "battle_points", count: 500 }],
    },
    S().beginBattle?.()
  );
  const c1 = await env.server.waitFor("save_profile", "test_bt", 1);
  S().updateTeam([{ hero_id: "zhao_yun", slot: 1 }]);
  c1.respond({ status: 500, error: "TEMP" });
  await settle();
  env.server.held.delete("save_profile");
  await env.clock.advance(60_000);
  const server = env.server.profiles.get("test_bt");
  check(
    "W8-3 結算同步失敗後只重送 profile：save_result 只送 1 次",
    env.server.count("save_result") === 1,
    env.server.count("save_result")
  );
  check(
    "W8-4 最後保存的是最新快照（獎勵＋結算後的隊伍修改）",
    server.gold === 1500 &&
      server.team[0].hero_id === "zhao_yun" &&
      status(S) === "idle",
    { gold: server.gold, team: server.team, status: status(S) }
  );
});

// ══════════════════════════════════════════════════════════════
//  Round 5：伺服器操作結果不確定時的恢復（C1）、卸載時的盲寫（C2）
// ══════════════════════════════════════════════════════════════
const heroOf = (p, id = "guan_yu") => p?.heroes?.find((h) => h.hero_id === id);
const brief = (p) =>
  p && {
    nickname: p.nickname,
    gold: p.gold,
    heroes: (p.heroes || []).map((h) => `${h.hero_id}:${h.level}`),
    team: (p.team || []).map((t) => t.hero_id),
    status: p.syncStatus,
    pendingUpgrade: p.pendingUpgrade
      ? `${p.pendingUpgrade.hero_id}/${p.pendingUpgrade.state}`
      : null,
  };

// ── C1（Codex 重現）：升級已在伺服器完成、回應遺失，本機又改了暱稱 → 重新整理 ──
await test("C1", async ({ env, S }) => {
  await loaded(env, S, "test_c1");
  env.server.held.add("upgrade_hero");
  void S().upgradeHero("guan_yu", heroCfg);
  const call = await env.server.waitFor("upgrade_hero", "test_c1");
  serverAppliesButResponseLost(env, call);
  check(
    "C1-0 前置：伺服器已完成升級（關羽 Lv2、點數 900）",
    heroOf(env.server.profiles.get("test_c1"))?.level === 2 &&
      env.server.profiles.get("test_c1").gold === 900
  );
  S().updateNickname("preserve-this-edit");
  S().updateTeam([{ hero_id: "zhao_yun", slot: 1 }]);
  const mark = env.server.calls.length;
  const S2 = reloadPage(env);
  env.server.held.delete("upgrade_hero");
  S2().loadFromSession("test_c1");
  await env.clock.advance(0);
  await settle(60);
  const backend = env.server.profiles.get("test_c1");
  check(
    "C1-1 重新整理後：已完成的升級與扣款沒有被還原",
    heroOf(backend)?.level === 2 && backend.gold === 900,
    brief(backend)
  );
  check(
    "C1-2 本機暱稱與隊伍修改沒有遺失（已寫入後端）",
    backend.nickname === "preserve-this-edit" &&
      backend.team[0]?.hero_id === "zhao_yun",
    brief(backend)
  );
  check(
    "C1-3 已確認成功：UI、session 與後端一致且為 Idle，待確認紀錄已清除",
    status(S2) === "idle" &&
      readSession(env)?.syncStatus === "idle" &&
      !readSession(env)?.pendingUpgrade &&
      heroOf(S2().player)?.level === 2 &&
      S2().player?.gold === 900 &&
      S2().player?.nickname === "preserve-this-edit",
    brief(S2().player)
  );
  const gets = indexesOf(env, "get_profile", "test_c1", mark);
  const saves = indexesOf(env, "save_profile", "test_c1", mark);
  check(
    "C1-4 恢復時不重播 upgrade_hero；先讀取伺服器，再保存",
    env.server.count("upgrade_hero") === 1 &&
      gets.length >= 1 &&
      saves.length >= 1 &&
      gets[0] < saves[0],
    { upgrades: env.server.count("upgrade_hero"), gets, saves }
  );
});

// ── 升級回應持有超過 debounce：同頁的 profile 保存不能先送過時的 heroes／gold ──
await test("R5-H", async ({ env, S }) => {
  await loaded(env, S, "test_hold");
  env.server.held.add("upgrade_hero");
  const p = S().upgradeHero("guan_yu", heroCfg);
  const call = await env.server.waitFor("upgrade_hero", "test_hold");
  S().updateNickname("升級期間的修改");
  await env.clock.advance(35_000);
  check(
    "R5-H1 升級回應未到、debounce 已到期：沒有送出 save_profile",
    env.server.count("save_profile") === 0,
    env.server.calls
      .filter((c) => c.action === "save_profile")
      .map((c) => brief(c.payload.data))
  );
  env.server.handle(call);
  const r = await p;
  await env.clock.advance(35_000);
  const backend = env.server.profiles.get("test_hold");
  check(
    "R5-H2 升級回應後才保存：後端保有升級、扣款與暱稱，狀態 Idle",
    r?.success === true &&
      heroOf(backend)?.level === 2 &&
      backend.gold === 900 &&
      backend.nickname === "升級期間的修改" &&
      status(S) === "idle",
    brief(backend)
  );
  const sent = env.server.calls.filter((c) => c.action === "save_profile");
  check(
    "R5-H3 每一次 save_profile 都已包含升級結果",
    sent.length >= 1 &&
      sent.every(
        (c) =>
          heroOf(c.payload.data)?.level === 2 && c.payload.data.gold === 900
      ),
    sent.map((c) => brief(c.payload.data))
  );
});

// ── C2（Codex 重現，改為新預期）：卸載不再盲寫；重新整理後由恢復流程保存 ──
await test("C2", async ({ env, S }) => {
  await loaded(env, S, "test_c2");
  env.server.held.add("save_profile");
  S().updateNickname("old-edit");
  unload(env);
  await settle();
  check(
    "C2-1 卸載（beforeunload）不再產生額外的 save_profile",
    env.server.count("save_profile") === 0,
    env.server.calls
      .filter((c) => c.action === "save_profile")
      .map((c) => ({
        keepalive: c.keepalive,
        nickname: c.payload.data.nickname,
      }))
  );
  const S2 = reloadPage(env);
  env.server.held.delete("save_profile");
  S2().loadFromSession("test_c2");
  await env.clock.advance(0);
  await settle();
  check(
    "C2-2 重新整理後由恢復流程保存本機修改（普通 Pending 補送）",
    env.server.profiles.get("test_c2").nickname === "old-edit" &&
      status(S2) === "idle",
    { backend: env.server.profiles.get("test_c2").nickname, status: status(S2) }
  );
  S2().updateNickname("new-edit");
  await env.clock.advance(30_000);
  // 舊頁面如果送過 keepalive（修正前），讓它最後才到伺服器
  for (const c of env.server.calls.filter(
    (c) => c.orphaned && !c.settled && c.action === "save_profile"
  ))
    env.server.handle(c);
  await settle();
  check(
    "C2-3 後端最後是 new-edit，與 UI、session 一致",
    env.server.profiles.get("test_c2").nickname === "new-edit" &&
      S2().player?.nickname === "new-edit" &&
      readSession(env)?.nickname === "new-edit" &&
      status(S2) === "idle",
    {
      backend: env.server.profiles.get("test_c2").nickname,
      local: S2().player?.nickname,
      status: status(S2),
    }
  );
});

// ── 已知限制 L1：舊頁面「正常排程」的 save_profile 在途時重新整理，晚到伺服器 ──
await test("R5-L1", async ({ env, S }) => {
  await loaded(env, S, "test_l1");
  S().updateNickname("old-edit");
  env.server.held.add("save_profile");
  await env.clock.advance(30_000);
  const old = await env.server.waitFor("save_profile", "test_l1");
  const S2 = reloadPage(env);
  env.server.held.delete("save_profile");
  S2().loadFromSession("test_l1");
  await env.clock.advance(0);
  await settle();
  S2().updateNickname("new-edit");
  await env.clock.advance(30_000);
  env.server.handle(old); // 舊請求最後才被伺服器處理
  await settle();
  const backend = env.server.profiles.get("test_l1");
  limitation(
    "L1 重新整理前已送出的 save_profile 晚到伺服器，會把之後保存的 new-edit 蓋回 old-edit（前端無法得知舊請求何時被處理；需要後端版本號／條件寫入）",
    backend.nickname === "old-edit" && S2().player?.nickname === "new-edit",
    {
      backend: backend.nickname,
      local: S2().player?.nickname,
      status: status(S2),
    }
  );
});

// ── U1：升級還沒在伺服器完成就重新整理（之後才完成）──
await test("R5-U1", async ({ env, S }) => {
  await loaded(env, S, "test_u1");
  env.server.held.add("upgrade_hero");
  void S().upgradeHero("guan_yu", heroCfg);
  const call = await env.server.waitFor("upgrade_hero", "test_u1");
  S().updateNickname("本機暱稱");
  const S2 = reloadPage(env);
  env.server.held.delete("upgrade_hero");
  S2().loadFromSession("test_u1");
  await env.clock.advance(0);
  await settle();
  check(
    "R5-U1-1 伺服器還沒完成升級：恢復後標示結果待確認，沒有送出 save_profile",
    status(S2) === "unconfirmed" &&
      readSession(env)?.syncStatus === "unconfirmed" &&
      env.server.count("save_profile") === 0,
    {
      status: status(S2),
      session: readSession(env)?.syncStatus,
      saves: env.server.count("save_profile"),
    }
  );
  check(
    "R5-U1-2 本機暱稱與待確認的升級紀錄都保留在 session；沒有重播 upgrade_hero",
    readSession(env)?.nickname === "本機暱稱" &&
      readSession(env)?.pendingUpgrade?.hero_id === "guan_yu" &&
      env.server.count("upgrade_hero") === 1,
    brief(readSession(env))
  );
  // 舊請求之後才在伺服器完成（回應送不到任何頁面）
  env.server.handle(call);
  await env.clock.advance(30_000);
  await settle(60);
  const backend = env.server.profiles.get("test_u1");
  check(
    "R5-U1-3 之後自動重新確認看到升級：保留升級與扣款並保存暱稱，狀態 Idle",
    heroOf(backend)?.level === 2 &&
      backend.gold === 900 &&
      backend.nickname === "本機暱稱" &&
      status(S2) === "idle" &&
      !readSession(env)?.pendingUpgrade,
    { backend: brief(backend), local: brief(S2().player) }
  );
});

// ── U2：升級請求沒有到伺服器（永遠不會完成）──
await test("R5-U2", async ({ env, S }) => {
  await loaded(env, S, "test_u2");
  env.server.held.add("upgrade_hero");
  void S().upgradeHero("guan_yu", heroCfg);
  await env.server.waitFor("upgrade_hero", "test_u2");
  S().updateTeam([{ hero_id: "zhao_yun", slot: 1 }]);
  const mark = env.server.calls.length;
  const S2 = reloadPage(env);
  env.server.held.delete("upgrade_hero");
  S2().loadFromSession("test_u2");
  await env.clock.advance(0);
  await env.clock.advance(10 * 60_000);
  const gets = indexesOf(env, "get_profile", "test_u2", mark).length;
  check(
    "R5-U2-1 一直看不到升級：維持待確認，不保存、不猜測成功或失敗，本機隊伍保留",
    status(S2) === "unconfirmed" &&
      env.server.count("save_profile") === 0 &&
      S2().player?.team?.[0]?.hero_id === "zhao_yun" &&
      readSession(env)?.team?.[0]?.hero_id === "zhao_yun",
    { status: status(S2), saves: env.server.count("save_profile") }
  );
  check(
    "R5-U2-2 自動重新確認有次數上限（不會無限讀取）",
    gets >= 2 && gets <= 6,
    { gets }
  );
  // Round 6 規則變更：原本的 R5-U2-3 驗證「以雲端目前資料為準」會保存並解除待確認。
  // 看不到升級不代表確定沒套用，強制保存可能蓋掉晚到的升級（C4），所以這個能力已移除；
  // 改為驗證：手動重新確認、再重新整理一次都仍是待確認，資料與紀錄持續保留，也沒有任何保存
  const r = await S2().recheckPendingUpgrade();
  const S3 = reloadPage(env);
  S3().loadFromSession("test_u2");
  await env.clock.advance(10 * 60_000);
  const backend = env.server.profiles.get("test_u2");
  check(
    "R5-U2-3 看不到升級時沒有強制解除的方式：手動確認與再次重新整理後仍待確認，本機隊伍與紀錄保留、後端不變",
    r?.ok === false &&
      r?.error === "UPGRADE_UNCONFIRMED" &&
      typeof S3().resolvePendingUpgradeFromServer === "undefined" &&
      status(S3) === "unconfirmed" &&
      readSession(env)?.team?.[0]?.hero_id === "zhao_yun" &&
      readSession(env)?.pendingUpgrade?.hero_id === "guan_yu" &&
      env.server.count("save_profile") === 0 &&
      backend.team.length === 1 &&
      backend.team[0].hero_id === "guan_yu",
    { r, status: status(S3), backend: brief(backend) }
  );
});

// ── U3：升級明確失敗（伺服器回傳錯誤）──
await test("R5-U3", async ({ env, S }) => {
  await loaded(env, S, "test_u3");
  env.server.held.add("upgrade_hero");
  const p = S().upgradeHero("guan_yu", heroCfg);
  const call = await env.server.waitFor("upgrade_hero", "test_u3");
  S().updateTeam([{ hero_id: "zhao_yun", slot: 1 }]);
  call.respond({ status: 400, error: "GOLD_NOT_ENOUGH" });
  const r = await p;
  await settle();
  const statusAfter = status(S);
  await env.clock.advance(35_000);
  const backend = env.server.profiles.get("test_u3");
  check(
    "R5-U3-1 升級明確失敗：回傳失敗原因，不進入待確認",
    r?.success === false &&
      r?.error === "GOLD_NOT_ENOUGH" &&
      statusAfter !== "unconfirmed" &&
      !S().player?.pendingUpgrade,
    { r, statusAfter }
  );
  check(
    "R5-U3-2 期間的隊伍修改照常保存，武將與點數維持原值，狀態 Idle",
    backend.team[0]?.hero_id === "zhao_yun" &&
      backend.heroes.length === 0 &&
      backend.gold === 1000 &&
      status(S) === "idle",
    brief(backend)
  );
});

// ── U4：同一頁升級回應遺失（網路錯誤）──
await test("R5-U4", async ({ env, S }) => {
  await loaded(env, S, "test_u4");
  env.server.held.add("upgrade_hero");
  const p = S().upgradeHero("guan_yu", heroCfg);
  const call = await env.server.waitFor("upgrade_hero", "test_u4");
  S().updateNickname("連線中斷期間的修改");
  env.server.held.add("get_profile"); // 讓重新確認停在讀取中，先觀察待確認的行為
  const lost = call.networkError;
  serverAppliesButResponseLost(env, call);
  lost();
  const r = await p;
  await settle();
  const again = await S().upgradeHero("guan_yu", heroCfg);
  await env.clock.advance(35_000);
  check(
    "R5-U4-1 回應遺失：回報結果待確認（不當作失敗），不能再升級，也不保存",
    r?.success === false &&
      r?.error === "UPGRADE_UNCONFIRMED" &&
      again?.success === false &&
      again?.error === "UPGRADE_UNCONFIRMED" &&
      status(S) === "unconfirmed" &&
      env.server.count("save_profile") === 0 &&
      env.server.count("upgrade_hero") === 1,
    { r, again, status: status(S), saves: env.server.count("save_profile") }
  );
  env.server.held.delete("get_profile");
  for (const c of env.server.calls.filter(
    (c) => c.action === "get_profile" && !c.settled
  ))
    env.server.handle(c);
  await settle(60);
  const backend = env.server.profiles.get("test_u4");
  check(
    "R5-U4-2 重新確認看到升級：本機採用升級結果並保存暱稱，後端一致",
    heroOf(backend)?.level === 2 &&
      backend.gold === 900 &&
      backend.nickname === "連線中斷期間的修改" &&
      heroOf(S().player)?.level === 2 &&
      S().player?.gold === 900 &&
      status(S) === "idle",
    { backend: brief(backend), local: brief(S().player) }
  );
});

// ── U5：只有升級、沒有其他修改就重新整理 ──
await test("R5-U5", async ({ env, S }) => {
  await loaded(env, S, "test_u5");
  env.server.held.add("upgrade_hero");
  void S().upgradeHero("guan_yu", heroCfg);
  const call = await env.server.waitFor("upgrade_hero", "test_u5");
  const S2 = reloadPage(env);
  env.server.held.delete("upgrade_hero");
  env.server.handle(call); // 伺服器完成，回應遺失
  S2().loadFromSession("test_u5");
  void S2().backgroundRefresh("test_u5"); // GameInitializer 有 session 時也會呼叫
  await env.clock.advance(0);
  await settle(60);
  check(
    "R5-U5-1 伺服器已完成：確認後直接採用伺服器資料，不需要 save_profile，狀態 Idle",
    heroOf(S2().player)?.level === 2 &&
      S2().player?.gold === 900 &&
      status(S2) === "idle" &&
      !readSession(env)?.pendingUpgrade &&
      env.server.count("save_profile") === 0,
    { local: brief(S2().player), saves: env.server.count("save_profile") }
  );
});
await test("R5-U5b", async ({ env, S }) => {
  await loaded(env, S, "test_u5b");
  env.server.held.add("upgrade_hero");
  void S().upgradeHero("guan_yu", heroCfg);
  await env.server.waitFor("upgrade_hero", "test_u5b");
  const S2 = reloadPage(env);
  env.server.held.delete("upgrade_hero");
  S2().loadFromSession("test_u5b");
  await S2().backgroundRefresh("test_u5b");
  await env.clock.advance(0);
  await settle();
  check(
    "R5-U5-2 伺服器還沒完成：背景讀取不會清掉待確認紀錄，也不會標成 Idle",
    status(S2) === "unconfirmed" &&
      readSession(env)?.pendingUpgrade?.hero_id === "guan_yu" &&
      env.server.count("save_profile") === 0,
    brief(readSession(env))
  );
});

// ── 待確認期間：切換帳號、手動同步、戰鬥結算 ──
await test("R5-S", async ({ env, S }) => {
  await loaded(env, S, "test_s1");
  env.server.profiles.set("test_s2", baseProfile("另一個帳號"));
  env.server.held.add("upgrade_hero");
  const p = S().upgradeHero("guan_yu", heroCfg);
  const call = await env.server.waitFor("upgrade_hero", "test_s1");
  S().updateNickname("待確認期間的修改");
  call.networkError(); // 請求沒有到伺服器
  await p;
  await env.clock.advance(0);
  const r = await S().initFromGAS("test_s2");
  check(
    "R5-S1 有本機修改且升級待確認：切換帳號被擋下，資料與待確認紀錄保留",
    r?.ok === false &&
      r?.error === "UPGRADE_UNCONFIRMED" &&
      S().player?.key === "test_s1" &&
      S().player?.nickname === "待確認期間的修改" &&
      readSession(env)?.pendingUpgrade?.hero_id === "guan_yu" &&
      env.server.count("get_profile", "test_s2") === 0 &&
      env.server.count("save_profile") === 0,
    { r, player: brief(S().player) }
  );
  const r2 = await S().refreshProfile();
  check(
    "R5-S2 手動同步：重新確認仍看不到升級 → 回報待確認，不覆蓋本機、不清除紀錄",
    r2?.ok === false &&
      r2?.error === "UPGRADE_UNCONFIRMED" &&
      S().player?.nickname === "待確認期間的修改" &&
      status(S) === "unconfirmed" &&
      env.server.count("save_profile") === 0,
    { r2, player: brief(S().player) }
  );
});
await test("R5-S0", async ({ env, S }) => {
  await loaded(env, S, "test_s0");
  env.server.profiles.set("test_s0b", baseProfile("另一個帳號"));
  env.server.held.add("upgrade_hero");
  const p = S().upgradeHero("guan_yu", heroCfg);
  (await env.server.waitFor("upgrade_hero", "test_s0")).networkError();
  await p;
  await env.clock.advance(0);
  const before = status(S);
  const r = await S().initFromGAS("test_s0b");
  await env.clock.advance(10 * 60_000);
  check(
    "R5-S3 升級待確認但沒有本機修改：可以切換帳號，不會對舊帳號送出任何保存",
    before === "unconfirmed" &&
      r?.ok === true &&
      S().player?.key === "test_s0b" &&
      status(S) === "idle" &&
      !readSession(env)?.pendingUpgrade &&
      env.server.count("save_profile") === 0,
    { before, r, player: brief(S().player) }
  );
});
await test("R5-B", async ({ env, S }) => {
  await loaded(env, S, "test_b5");
  env.server.held.add("upgrade_hero");
  const p = S().upgradeHero("guan_yu", heroCfg);
  const call = await env.server.waitFor("upgrade_hero", "test_b5");
  call.networkError();
  await p;
  await env.clock.advance(0);
  // Round 8：結算要帶開戰時取得的戰鬥票（呼叫方式調整，斷言不變）
  S().applyBattleResult(
    {
      result: "WIN",
      stage_id: "chapter1_1",
      stars_earned: 3,
      kills: 5,
      time_seconds: 30,
      loots: [{ item: "battle_points", count: 500 }],
    },
    S().beginBattle?.()
  );
  await env.clock.advance(35_000);
  check(
    "R5-B1 待確認期間的戰鬥獎勵：本機保留（1500），save_result 送 1 次，不送 save_profile",
    S().player?.gold === 1500 &&
      env.server.count("save_result") === 1 &&
      env.server.count("save_profile") === 0 &&
      status(S) === "unconfirmed",
    brief(S().player)
  );
  env.server.handle(call); // 舊的升級請求之後才到伺服器
  const r = await S().recheckPendingUpgrade();
  await settle(60);
  const backend = env.server.profiles.get("test_b5");
  check(
    "R5-B2 重新確認看到升級：點數＝伺服器扣款後 900＋本機獎勵 500，武將 Lv2",
    r?.ok === true &&
      backend.gold === 1400 &&
      heroOf(backend)?.level === 2 &&
      S().player?.gold === 1400 &&
      status(S) === "idle",
    { r, backend: brief(backend) }
  );
});

// ══════════════════════════════════════════════════════════════
//  Round 6：較早的背景讀取還原已確認的升級（C3）、強制採用雲端不能證明舊升級已結束（C4）
// ══════════════════════════════════════════════════════════════

// ── C3（Codex 重現）：升級前送出的背景讀取，在重新確認之後才回來 ──
await test("C3", async ({ env, S }) => {
  await loaded(env, S, "test_c3");
  env.server.held.add("get_profile");
  const bg = S().backgroundRefresh("test_c3");
  const oldRead = await env.server.waitFor("get_profile", "test_c3", 2);
  env.server.held.add("upgrade_hero");
  const upgrade = S().upgradeHero("guan_yu", heroCfg);
  const call = await env.server.waitFor("upgrade_hero", "test_c3");
  const lost = call.networkError;
  serverAppliesButResponseLost(env, call);
  lost();
  await upgrade;
  env.server.held.delete("get_profile");
  const r = await S().recheckPendingUpgrade();
  await settle();
  check(
    "C3-0 前置：重新確認看到升級（Lv2、900）；沒有本機修改，所以沒有送 save_profile",
    r?.ok === true &&
      heroOf(S().player)?.level === 2 &&
      S().player?.gold === 900 &&
      status(S) === "idle" &&
      env.server.count("save_profile") === 0,
    { r, local: brief(S().player), saves: env.server.count("save_profile") }
  );
  oldRead.respond({ status: 200, data: baseProfile() }); // 升級前的舊資料最後才回來
  await bg;
  await settle();
  check(
    "C3-1 較早的背景讀取晚到：本機與 session 都不會被還原成升級前",
    heroOf(S().player)?.level === 2 &&
      S().player?.gold === 900 &&
      heroOf(readSession(env))?.level === 2 &&
      readSession(env)?.gold === 900,
    { local: brief(S().player), session: brief(readSession(env)) }
  );
  S().updateNickname("after-confirmation");
  await env.clock.advance(35_000);
  const backend = env.server.profiles.get("test_c3");
  check(
    "C3-2 之後修改並保存：後端保有升級與扣款，也有新暱稱，狀態 Idle",
    heroOf(backend)?.level === 2 &&
      backend.gold === 900 &&
      backend.nickname === "after-confirmation" &&
      status(S) === "idle",
    brief(backend)
  );
});

// ── C4：升級網路錯誤、後端還沒處理 → 改暱稱 → 一直等到升級晚到 ──
// 修正前的重現（強制採用雲端後，晚到的升級被蓋掉）見 round-06 的 store-test-before-fix.txt。
// Round 6 起沒有強制採用雲端的能力，改驗：待確認期間不送任何盲寫，升級晚到後重新確認，兩者都保留
await test("C4", async ({ env, S }) => {
  await loaded(env, S, "test_c4");
  env.server.held.add("upgrade_hero");
  const upgrade = S().upgradeHero("guan_yu", heroCfg);
  const oldUpgrade = await env.server.waitFor("upgrade_hero", "test_c4");
  oldUpgrade.networkError(); // 後端還沒處理
  await upgrade;
  S().updateNickname("preserve-me");
  await env.clock.advance(10 * 60_000); // 自動重新確認全部用完
  check(
    "C4-1 待確認期間：沒有強制採用雲端的能力，也沒有送出任何 save_profile；暱稱與待確認紀錄保留",
    typeof S().resolvePendingUpgradeFromServer === "undefined" &&
      env.server.count("save_profile") === 0 &&
      status(S) === "unconfirmed" &&
      readSession(env)?.nickname === "preserve-me" &&
      readSession(env)?.pendingUpgrade?.hero_id === "guan_yu",
    { status: status(S), saves: env.server.count("save_profile") }
  );
  env.server.handle(oldUpgrade); // 原升級這時才被後端處理
  check(
    "C4-0 前置：原升級晚到，後端變成 Lv2、900",
    heroOf(env.server.profiles.get("test_c4"))?.level === 2 &&
      env.server.profiles.get("test_c4").gold === 900
  );
  const r = await S().recheckPendingUpgrade();
  await settle(60);
  const backend = env.server.profiles.get("test_c4");
  check(
    "C4-2 重新確認看到升級：後端、本機與 session 都保有升級、扣款與暱稱，狀態 Idle",
    r?.ok === true &&
      heroOf(backend)?.level === 2 &&
      backend.gold === 900 &&
      backend.nickname === "preserve-me" &&
      heroOf(S().player)?.level === 2 &&
      S().player?.gold === 900 &&
      readSession(env)?.nickname === "preserve-me" &&
      !readSession(env)?.pendingUpgrade &&
      status(S) === "idle",
    { r, backend: brief(backend), local: brief(S().player) }
  );
});

// ── 其他採用伺服器資料的路徑：手動同步之後，較早的背景讀取晚到也不能套用 ──
await test("R6-G", async ({ env, S }) => {
  await loaded(env, S, "test_g6");
  env.server.held.add("get_profile");
  const bg = S().backgroundRefresh("test_g6");
  const oldRead = await env.server.waitFor("get_profile", "test_g6", 2);
  // 其他裝置在這之後改了後端資料，手動同步讀到新資料
  env.server.profiles.set("test_g6", {
    ...baseProfile("其他裝置的新暱稱"),
    gold: 777,
  });
  env.server.held.delete("get_profile");
  const r = await S().refreshProfile();
  oldRead.respond({ status: 200, data: baseProfile("舊暱稱") });
  await bg;
  await settle();
  check(
    "R6-G1 手動同步採用新資料後，較早的背景讀取晚到：不會把本機換回舊資料",
    r?.ok === true &&
      S().player?.nickname === "其他裝置的新暱稱" &&
      S().player?.gold === 777 &&
      readSession(env)?.gold === 777,
    { r, local: brief(S().player) }
  );
});

// ══════════════════════════════════════════════════════════════
//  Round 7：手動同步（initFromGAS／refreshProfile）也不能採用過時的快照（C5）
// ══════════════════════════════════════════════════════════════

// ── C5（Codex 重現）：手動同步的讀取在升級確認之後才回來 ──
await test("C5", async ({ env, S }) => {
  await loaded(env, S, "test_c5");
  env.server.held.add("get_profile");
  const refresh = S().refreshProfile();
  const stale = await env.server.waitFor("get_profile", "test_c5", 2);
  env.server.held.add("upgrade_hero");
  const upgrade = S().upgradeHero("guan_yu", heroCfg);
  const call = await env.server.waitFor("upgrade_hero", "test_c5");
  const lost = call.networkError;
  serverAppliesButResponseLost(env, call);
  lost();
  await upgrade;
  env.server.held.delete("get_profile");
  const r = await S().recheckPendingUpgrade();
  await settle();
  check(
    "C5-0 前置：重新確認看到升級（Lv2、900）；沒有本機修改，所以沒有送 save_profile",
    r?.ok === true &&
      heroOf(S().player)?.level === 2 &&
      S().player?.gold === 900 &&
      status(S) === "idle" &&
      env.server.count("save_profile") === 0,
    { r, local: brief(S().player) }
  );
  stale.respond({ status: 200, data: baseProfile() }); // 手動同步讀到的升級前資料最後才回來
  const rr = await refresh;
  await settle();
  check(
    "C5-1 較早的手動同步讀取晚到：本機與 session 都保有升級，狀態 Idle，也沒有多送 save_profile",
    rr?.ok === true &&
      heroOf(S().player)?.level === 2 &&
      S().player?.gold === 900 &&
      heroOf(readSession(env))?.level === 2 &&
      readSession(env)?.gold === 900 &&
      status(S) === "idle" &&
      env.server.count("save_profile") === 0,
    {
      rr,
      local: brief(S().player),
      saves: env.server.count("save_profile"),
    }
  );
  S().updateNickname("c5-later-edit");
  await env.clock.advance(35_000);
  const backend = env.server.profiles.get("test_c5");
  check(
    "C5-2 之後修改並保存：後端保有升級與扣款，也有新暱稱",
    heroOf(backend)?.level === 2 &&
      backend.gold === 900 &&
      backend.nickname === "c5-later-edit" &&
      status(S) === "idle",
    brief(backend)
  );
});

// ── 交錯：手動同步的讀取在途時，背景讀取先採用了較新的資料 ──
await test("R7-I", async ({ env, S }) => {
  await loaded(env, S, "test_i7");
  env.server.held.add("get_profile");
  const refresh = S().refreshProfile();
  const manualRead = await env.server.waitFor("get_profile", "test_i7", 2);
  // 其他裝置改了後端資料；背景讀取讀到新資料並採用
  env.server.profiles.set("test_i7", {
    ...baseProfile("其他裝置的新暱稱"),
    gold: 777,
  });
  env.server.held.delete("get_profile");
  await S().backgroundRefresh("test_i7");
  const adopted = brief(S().player);
  manualRead.respond({ status: 200, data: baseProfile("舊暱稱") }); // 手動同步的舊資料最後才回來
  const r = await refresh;
  await settle();
  check(
    "R7-I1 手動同步的讀取晚到、期間背景讀取已採用較新的資料：不會把本機換回舊資料",
    adopted.nickname === "其他裝置的新暱稱" &&
      r?.ok === true &&
      S().player?.nickname === "其他裝置的新暱稱" &&
      S().player?.gold === 777 &&
      readSession(env)?.gold === 777 &&
      env.server.count("save_profile") === 0,
    { adopted, r, local: brief(S().player) }
  );
});

// ══════════════════════════════════════════════════════════════
//  Round 8：戰鬥與結算的帳號歸屬（D8）
//  修正前的 store 沒有 beginBattle／setBattleLock，測試用可選呼叫（?.），
//  讓修正前也能跑出實際的錯誤歸屬，而不是只拋出「API 不存在」
// ══════════════════════════════════════════════════════════════
const winResult = (count = 500) => ({
  result: "WIN",
  stage_id: "chapter1_1",
  stars_earned: 3,
  kills: 5,
  time_seconds: 30,
  loots: [{ item: "battle_points", count }],
});
const resultCalls = (env) =>
  env.server.calls.filter((c) => c.action === "save_result").map((c) => c.key);
// Round 9 起，切換鎖屬於目前有效的那一場：上鎖 lockBattle(ticket)、離開 endBattle(ticket)，都會比對擁有者。
// Round 8 的 store 只有 setBattleLock(ticket | null)：這兩個 helper 在舊版改用它，
// 讓同一支測試在修正前也跑得出實際行為（R8-S2、S5 只換成這兩個 helper，斷言沒有改）
const lock = (S, ticket) =>
  S().lockBattle ? S().lockBattle(ticket) : S().setBattleLock?.(ticket);
const leave = (S, ticket) =>
  S().endBattle ? S().endBattle(ticket) : S().setBattleLock?.(null);

// ── S1：A 開戰後換成 B（例如備戰中切換），A 的結算晚到 ──
await test("R8-S1", async ({ env, S }) => {
  await loaded(env, S, "test_a8");
  env.server.profiles.set("test_b8", baseProfile("B"));
  const ticketA = S().beginBattle?.();
  await S().initFromGAS("test_b8");
  const r = S().applyBattleResult(winResult(), ticketA);
  await env.clock.advance(35_000);
  check(
    "R8-S1 A 的戰鬥結果在換成 B 之後才確認：不套用到 B，也不以任何 key 送出 save_result",
    S().player?.key === "test_b8" &&
      S().player?.gold === 1000 &&
      env.server.profiles.get("test_b8").gold === 1000 &&
      env.server.profiles.get("test_a8").gold === 1000 &&
      resultCalls(env).length === 0 &&
      r?.ok === false &&
      r?.error === "BATTLE_ACCOUNT_CHANGED",
    {
      r,
      local: brief(S().player),
      backendB: env.server.profiles.get("test_b8").gold,
      saveResultKeys: resultCalls(env),
    }
  );
});

// ── S2：戰鬥進行中（已上鎖）不能切換到其他帳號；同帳號同步照常 ──
await test("R8-S2", async ({ env, S }) => {
  await loaded(env, S, "test_a8");
  env.server.profiles.set("test_b8", baseProfile("B"));
  const ticketA = S().beginBattle?.();
  lock(S, ticketA);
  const r = await S().initFromGAS("test_b8");
  check(
    "R8-S2 戰鬥進行中切換到 B：被擋下（BATTLE_IN_PROGRESS），仍是 A，也沒有讀取 B",
    r?.ok === false &&
      r?.error === "BATTLE_IN_PROGRESS" &&
      S().player?.key === "test_a8" &&
      env.server.count("get_profile", "test_b8") === 0,
    { r, player: S().player?.key }
  );
  const same = await S().refreshProfile();
  check(
    "R8-S3 戰鬥進行中的同帳號同步不受影響",
    same?.ok === true && S().player?.key === "test_a8",
    same
  );
  leave(S, ticketA);
  const r2 = await S().initFromGAS("test_b8");
  check(
    "R8-S4 離開戰鬥（解除鎖定）後可以切換到 B",
    r2?.ok === true && S().player?.key === "test_b8",
    r2
  );
});

// ── S5：同一場戰鬥確認兩次（連按、重複結果）只結算一次 ──
await test("R8-S5", async ({ env, S }) => {
  await loaded(env, S, "test_a8");
  const ticket = S().beginBattle?.();
  lock(S, ticket);
  const r1 = S().applyBattleResult(winResult(), ticket);
  const r2 = S().applyBattleResult(winResult(), ticket);
  await env.clock.advance(35_000);
  check(
    "R8-S5 同一場戰鬥確認兩次：只送 1 次 save_result、點數只加一次（1500），第二次回報已結算",
    resultCalls(env).length === 1 &&
      S().player?.gold === 1500 &&
      env.server.profiles.get("test_a8").gold === 1500 &&
      r1?.ok === true &&
      r2?.ok === false &&
      r2?.error === "BATTLE_ALREADY_SETTLED",
    {
      r1,
      r2,
      saveResults: resultCalls(env).length,
      gold: S().player?.gold,
    }
  );
  env.server.profiles.set("test_b8", baseProfile("B"));
  const r3 = await S().initFromGAS("test_b8");
  check(
    "R8-S6 結算完成後自動解除鎖定，可以切換帳號",
    r3?.ok === true && S().player?.key === "test_b8",
    r3
  );
});

// ── S7：A → B → A：切回同一個帳號，切換前那場戰鬥的結果也不能再套用 ──
await test("R8-S7", async ({ env, S }) => {
  await loaded(env, S, "test_a8");
  env.server.profiles.set("test_b8", baseProfile("B"));
  const ticketA = S().beginBattle?.();
  await S().initFromGAS("test_b8");
  await S().initFromGAS("test_a8");
  const r = S().applyBattleResult(winResult(), ticketA);
  await env.clock.advance(35_000);
  check(
    "R8-S7 切走再切回 A：切換前那場戰鬥的結果不套用",
    S().player?.key === "test_a8" &&
      S().player?.gold === 1000 &&
      env.server.profiles.get("test_a8").gold === 1000 &&
      resultCalls(env).length === 0 &&
      r?.ok === false,
    { r, local: brief(S().player), saveResultKeys: resultCalls(env) }
  );
});

// ══════════════════════════════════════════════════════════════
//  Round 9：場次隔離（Codex C6～C8）
//  - C6：切換帳號的保存／讀取在途時才開打：提交前要重新檢查切換鎖
//  - C7：Godot 的 stats 與結算帶產生它的那一場的 battle_id，頁面（BattleSession）只接受目前這一場
//  - C8：store 只接受目前有效那一場的票；新場次、離開、換帳號都會讓舊票失效，上鎖與解除都比對擁有者
//  修正前沒有 lockBattle／endBattle（用上面的 lock()／leave()），BattleSession 也不比對 battle_id，
//  所以同一支測試在修正前會跑出實際的錯誤行為
// ══════════════════════════════════════════════════════════════
const newBattleSession = () =>
  new (require(join(GAME, "utils/battleSession.ts")).BattleSession)();
// Godot 送出的訊息：帶產生它的那一場的 battle_id（Web 送進 Godot 的是戰鬥票的 id）
const statsOf = (ticket, game_state, wave) => ({
  __godot_bridge: true,
  type: "update_stats",
  battle_id: ticket?.id,
  game_state,
  wave,
  total_waves: 2,
  gold: 5000,
  hp: 20,
  max_hp: 20,
  auto_mode: false,
});
const resultOf = (ticket, count) => ({
  __godot_bridge: true,
  ...winResult(count),
  battle_id: ticket?.id,
});
/** 頁面收到 update_stats：交給 BattleSession，這一場開打後向 store 上鎖（兩個戰鬥頁的做法） */
const onStats = (S, session, msg) => {
  const mine = session.onStats(msg);
  const t = session.lockTicket();
  if (t) lock(S, t);
  return mine;
};
/** 頁面明確離開目前這一場（切換關卡、離開頁面） */
const leavePage = (S, session) => {
  const owner = session.owner;
  session.end();
  leave(S, owner);
};
/** 頁面確認結算：同一場只交出一次，交給 store 結算 */
const confirm = (S, session) => {
  const taken = session.take();
  return taken ? S().applyBattleResult(taken.result, taken.ticket) : null;
};

// ── C6：切換到 B 的讀取在途時，A 開打 ──
await test("R9-C6a", async ({ env, S }) => {
  await loaded(env, S, "test_c6a");
  env.server.profiles.set("test_c6b", baseProfile("B"));
  env.server.held.add("get_profile");
  const switching = S().initFromGAS("test_c6b");
  const read = await env.server.waitFor("get_profile", "test_c6b");
  const ticket = S().beginBattle?.();
  lock(S, ticket);
  env.server.handle(read);
  const r = await switching;
  await settle();
  env.server.held.delete("get_profile");
  check(
    "R9-C6a 切換到 B 的讀取在途時 A 開打：讀取回來後不切換（BATTLE_IN_PROGRESS），store、session 與金鑰都還是 A",
    r?.ok === false &&
      r?.error === "BATTLE_IN_PROGRESS" &&
      S().player?.key === "test_c6a" &&
      readSession(env)?.key === "test_c6a" &&
      env.local.getItem("shenma_player_key") === "test_c6a",
    {
      r,
      key: S().player?.key,
      session: readSession(env)?.key,
      lsKey: env.local.getItem("shenma_player_key"),
    }
  );
  const current = S().isBattleTicketCurrent?.(ticket);
  const settled = S().applyBattleResult(winResult(), ticket);
  await env.clock.advance(35_000);
  check(
    "R9-C6a-2 A 那一場沒有被作廢：票仍有效，結算只算給 A（1500），save_result 的 key 是 A，B 不變",
    current === true &&
      settled?.ok === true &&
      S().player?.gold === 1500 &&
      env.server.profiles.get("test_c6a").gold === 1500 &&
      env.server.profiles.get("test_c6b").gold === 1000 &&
      JSON.stringify(resultCalls(env)) === JSON.stringify(["test_c6a"]),
    { current, settled, gold: S().player?.gold, keys: resultCalls(env) }
  );
});

// ── C6：切換前先保存 A 的修改，保存在途時 A 開打 ──
await test("R9-C6b", async ({ env, S }) => {
  await loaded(env, S, "test_c6a");
  env.server.profiles.set("test_c6b", baseProfile("B"));
  S().updateNickname("開打前的修改");
  env.server.held.add("save_profile");
  const switching = S().initFromGAS("test_c6b");
  const save = await env.server.waitFor("save_profile", "test_c6a");
  const ticket = S().beginBattle?.();
  lock(S, ticket);
  env.server.held.delete("save_profile");
  env.server.handle(save);
  const r = await switching;
  await settle();
  check(
    "R9-C6b 切換前的保存在途時 A 開打：保存完成後不讀取 B、不切換（BATTLE_IN_PROGRESS）；A 的修改已保存",
    r?.ok === false &&
      r?.error === "BATTLE_IN_PROGRESS" &&
      S().player?.key === "test_c6a" &&
      readSession(env)?.key === "test_c6a" &&
      env.server.count("get_profile", "test_c6b") === 0 &&
      env.server.count("create_profile") === 0 &&
      env.server.profiles.get("test_c6a").nickname === "開打前的修改" &&
      status(S) === "idle",
    {
      r,
      key: S().player?.key,
      readsB: env.server.count("get_profile", "test_c6b"),
      backendA: env.server.profiles.get("test_c6a").nickname,
      status: status(S),
    }
  );
});

// ── C6：讀取 B 之後、提交之前還要再保存一次（最後一次 await），這時 A 開打 ──
await test("R9-C6c", async ({ env, S }) => {
  await loaded(env, S, "test_c6a");
  env.server.profiles.set("test_c6b", baseProfile("B"));
  env.server.held.add("get_profile");
  const switching = S().initFromGAS("test_c6b");
  const read = await env.server.waitFor("get_profile", "test_c6b");
  S().updateNickname("讀取期間的修改");
  env.server.held.add("save_profile");
  env.server.handle(read);
  const save = await env.server.waitFor("save_profile", "test_c6a");
  const ticket = S().beginBattle?.();
  lock(S, ticket);
  env.server.held.clear();
  env.server.handle(save);
  const r = await switching;
  await settle();
  check(
    "R9-C6c 讀取 B 之後的第二次保存在途時 A 開打（提交前最後一次 await）：不切換，仍是 A；A 的修改已保存",
    r?.ok === false &&
      r?.error === "BATTLE_IN_PROGRESS" &&
      S().player?.key === "test_c6a" &&
      readSession(env)?.key === "test_c6a" &&
      env.local.getItem("shenma_player_key") === "test_c6a" &&
      env.server.profiles.get("test_c6a").nickname === "讀取期間的修改",
    {
      r,
      key: S().player?.key,
      backendA: env.server.profiles.get("test_c6a").nickname,
    }
  );
});

// ── C7：新場次（B）開打後，A 那一場的結算才送達（帶 A 那一場的 battle_id）──
await test("R9-C7a", async ({ env, S }) => {
  await loaded(env, S, "test_c7a");
  env.server.profiles.set("test_c7b", baseProfile("B"));
  const session = newBattleSession();
  const ticketA = S().beginBattle();
  session.begin(ticketA);
  onStats(S, session, statsOf(ticketA, 2, 1));
  const oldResult = resultOf(ticketA, 999); // A 那一場產生的結算，還沒送到頁面
  leavePage(S, session); // 切換關卡（明確離開）
  const sw = await S().initFromGAS("test_c7b");
  const ticketB = S().beginBattle();
  session.begin(ticketB);
  onStats(S, session, statsOf(ticketB, 2, 1));
  const accepted = session.onResult(oldResult);
  const r = accepted ? confirm(S, session) : null;
  await env.clock.advance(35_000);
  check(
    "R9-C7a 新場次（B）開打後，A 那一場的結算（帶 A 的 battle_id）才送達：不採用；A、B 點數不變，沒有 save_result",
    sw?.ok === true &&
      accepted === false &&
      S().player?.key === "test_c7b" &&
      S().player?.gold === 1000 &&
      env.server.profiles.get("test_c7b").gold === 1000 &&
      env.server.profiles.get("test_c7a").gold === 1000 &&
      resultCalls(env).length === 0,
    { sw, accepted, r, gold: S().player?.gold, keys: resultCalls(env) }
  );
  const okB = session.onResult(resultOf(ticketB, 300));
  const rB = confirm(S, session);
  const again = confirm(S, session);
  await env.clock.advance(35_000);
  check(
    "R9-C7a-2 B 自己那一場的結算照常採用、只結算一次：B 1300，save_result 1 次且 key 是 B",
    okB === true &&
      rB?.ok === true &&
      again === null &&
      S().player?.gold === 1300 &&
      env.server.profiles.get("test_c7b").gold === 1300 &&
      JSON.stringify(resultCalls(env)) === JSON.stringify(["test_c7b"]),
    { okB, rB, again, gold: S().player?.gold, keys: resultCalls(env) }
  );
});

// ── C7：同一關重來（stage_id 相同）後，上一場的結算才送達 ──
await test("R9-C7b", async ({ env, S }) => {
  await loaded(env, S, "test_c7");
  const session = newBattleSession();
  const t1 = S().beginBattle();
  session.begin(t1);
  onStats(S, session, statsOf(t1, 2, 1));
  const old = resultOf(t1, 999);
  // 同一關重來：送出同一關的關卡資料，開始新的一場並開打
  const t2 = S().beginBattle();
  session.begin(t2);
  onStats(S, session, statsOf(t2, 2, 1));
  const acceptedOld = session.onResult(old);
  check(
    "R9-C7b 同一關重來並開打後，上一場的結算（stage_id 相同）才送達：不採用",
    acceptedOld === false && old.stage_id === resultOf(t2, 1).stage_id,
    { acceptedOld }
  );
  const acceptedNew = session.onResult(resultOf(t2, 300));
  const r = confirm(S, session);
  await env.clock.advance(35_000);
  check(
    "R9-C7b-2 這一場的結算照常採用：點數 1300，save_result 1 次",
    acceptedNew === true &&
      r?.ok === true &&
      S().player?.gold === 1300 &&
      env.server.profiles.get("test_c7").gold === 1300 &&
      resultCalls(env).length === 1,
    { acceptedNew, r, gold: S().player?.gold, keys: resultCalls(env) }
  );
});

// ── C7：舊關卡的 stats 晚到（新的一場還在備戰）──
await test("R9-C7c", async ({ env, S }) => {
  await loaded(env, S, "test_c7");
  env.server.profiles.set("test_c7b", baseProfile("B"));
  const session = newBattleSession();
  const t1 = S().beginBattle();
  session.begin(t1);
  onStats(S, session, statsOf(t1, 2, 1));
  const oldStats = statsOf(t1, 2, 2); // 上一場開打中的狀態，還沒送到頁面
  leavePage(S, session);
  const t2 = S().beginBattle();
  session.begin(t2);
  onStats(S, session, statsOf(t2, 1, 0));
  const mine = onStats(S, session, oldStats);
  check(
    "R9-C7c 舊關卡的 stats 晚到：不屬於這一場（頁面不採用），還在備戰的新場次也不會因此上鎖",
    mine === false && session.lockTicket() === null,
    { mine, lockTicket: session.lockTicket() }
  );
  const sw = await S().initFromGAS("test_c7b");
  check(
    "R9-C7c-2 新場次仍在備戰：可以切換帳號（沒有被舊 stats 鎖住）",
    sw?.ok === true && S().player?.key === "test_c7b",
    sw
  );
  const acc = session.onResult(resultOf(t1, 999));
  check(
    "R9-C7c-3 之後上一場的結算晚到也不採用，沒有 save_result",
    acc === false && resultCalls(env).length === 0,
    { acc, keys: resultCalls(env) }
  );
});

// ── C7：缺少或錯誤的 battle_id ──
await test("R9-C7d", async ({ env, S }) => {
  await loaded(env, S, "test_c7");
  const session = newBattleSession();
  const t = S().beginBattle();
  session.begin(t);
  const noIdStats = statsOf(t, 2, 1);
  delete noIdStats.battle_id;
  const s1 = onStats(S, session, noIdStats);
  const s2 = onStats(S, session, { ...statsOf(t, 2, 1), battle_id: "bogus" });
  check(
    "R9-C7d 缺少或錯誤 battle_id 的 stats：不採用，也不算開打（不上鎖）",
    s1 === false && s2 === false && session.lockTicket() === null,
    { s1, s2, lockTicket: session.lockTicket() }
  );
  onStats(S, session, statsOf(t, 2, 1));
  const noId = resultOf(t, 999);
  delete noId.battle_id;
  const acc = [
    noId,
    { ...resultOf(t, 999), battle_id: "bogus" },
    { ...resultOf(t, 999), battle_id: "" },
    { ...resultOf(t, 999), battle_id: 12345 },
  ].map((m) => session.onResult(m));
  check(
    "R9-C7d-2 缺少、錯誤、空白、非字串 battle_id 的結算都不採用",
    acc.every((a) => a === false),
    acc
  );
  const ok = session.onResult(resultOf(t, 300));
  const dup = session.onResult(resultOf(t, 300));
  const r = confirm(S, session);
  const again = confirm(S, session);
  await env.clock.advance(35_000);
  check(
    "R9-C7d-3 正確 battle_id 的結算只採用一次（重複送達不再採用，只交出一次）：點數 1300，save_result 1 次",
    ok === true &&
      dup === false &&
      r?.ok === true &&
      again === null &&
      S().player?.gold === 1300 &&
      resultCalls(env).length === 1,
    { ok, dup, r, again, gold: S().player?.gold }
  );
  const sent = env.server.calls.find((c) => c.action === "save_result");
  check(
    "R9-C7d-4 送到後端的 save_result 不含 battle_id（場次識別碼只在頁面比對，不改變後端契約）",
    !!sent && !("battle_id" in sent.payload),
    sent?.payload
  );
});

// ── C8：同帳號、已作廢的票不能結算 ──
await test("R9-C8a", async ({ env, S }) => {
  await loaded(env, S, "test_c8");
  const retired = S().beginBattle();
  lock(S, retired);
  const current = S().beginBattle(); // 開始第二場（第一場沒有結算）
  const r = S().applyBattleResult(winResult(999), retired);
  await env.clock.advance(35_000);
  check(
    "R9-C8a 同帳號開始第二場後，用第一場（未結算）的票結算：不套用，點數不變，沒有 save_result",
    r?.ok === false &&
      S().player?.gold === 1000 &&
      env.server.profiles.get("test_c8").gold === 1000 &&
      resultCalls(env).length === 0,
    { r, gold: S().player?.gold, keys: resultCalls(env) }
  );
  const r2 = S().applyBattleResult(winResult(300), current);
  await env.clock.advance(35_000);
  check(
    "R9-C8a-2 目前那一場照常結算一次：點數 1300，save_result 1 次",
    r2?.ok === true &&
      S().player?.gold === 1300 &&
      env.server.profiles.get("test_c8").gold === 1300 &&
      resultCalls(env).length === 1,
    { r2, gold: S().player?.gold }
  );
});

await test("R9-C8b", async ({ env, S }) => {
  await loaded(env, S, "test_c8");
  const t = S().beginBattle();
  lock(S, t);
  leave(S, t); // 明確離開（切換關卡、離開頁面）
  const r = S().applyBattleResult(winResult(999), t);
  await env.clock.advance(35_000);
  check(
    "R9-C8b 明確離開後，用那一場的票結算：不套用，沒有 save_result",
    r?.ok === false &&
      S().player?.gold === 1000 &&
      resultCalls(env).length === 0,
    { r, gold: S().player?.gold, keys: resultCalls(env) }
  );
  const current = S().isBattleTicketCurrent?.(t);
  check("R9-C8b-2 離開後那張票不再是目前的場次", current === false, {
    current,
  });
});

// ── C8：舊票（舊頁面的 cleanup）不能解除新場次的鎖 ──
await test("R9-C8c", async ({ env, S }) => {
  await loaded(env, S, "test_c8");
  env.server.profiles.set("test_c8b", baseProfile("B"));
  const old = S().beginBattle(); // 舊頁面的那一場
  const cur = S().beginBattle(); // 新頁面的那一場
  lock(S, cur);
  leave(S, old); // 舊頁面的 cleanup 晚到
  const r1 = await S().initFromGAS("test_c8b");
  check(
    "R9-C8c 舊票的離開（舊頁面 cleanup 晚到）不會解除新場次的鎖：切換仍被擋下",
    r1?.ok === false &&
      r1?.error === "BATTLE_IN_PROGRESS" &&
      S().player?.key === "test_c8",
    r1
  );
  const r = S().applyBattleResult(winResult(300), cur);
  await env.clock.advance(35_000);
  const r2 = await S().initFromGAS("test_c8b");
  check(
    "R9-C8c-2 新場次結算後才解除，之後可以切換；結算只算給 A",
    r?.ok === true &&
      r2?.ok === true &&
      S().player?.key === "test_c8b" &&
      env.server.profiles.get("test_c8").gold === 1300 &&
      JSON.stringify(resultCalls(env)) === JSON.stringify(["test_c8"]),
    { r, r2, keys: resultCalls(env) }
  );
});

// ── C8：舊票想上鎖（舊關卡晚到的訊息）不會鎖住還在備戰的新場次 ──
await test("R9-C8d", async ({ env, S }) => {
  await loaded(env, S, "test_c8");
  env.server.profiles.set("test_c8b", baseProfile("B"));
  const old = S().beginBattle();
  S().beginBattle(); // 新的一場，還在備戰
  lock(S, old);
  const r = await S().initFromGAS("test_c8b");
  check(
    "R9-C8d 舊票上鎖無效：新場次還在備戰，可以切換帳號",
    r?.ok === true && S().player?.key === "test_c8b",
    r
  );
});

// ── C8：換帳號後，A 那一場的頁面 cleanup 不能解除 B 那一場的鎖 ──
await test("R9-C8e", async ({ env, S }) => {
  await loaded(env, S, "test_c8");
  env.server.profiles.set("test_c8b", baseProfile("B"));
  const tA = S().beginBattle(); // A 還在備戰
  const sw = await S().initFromGAS("test_c8b");
  const tB = S().beginBattle();
  lock(S, tB); // B 開打
  leave(S, tA);
  const r = await S().initFromGAS("test_c8");
  check(
    "R9-C8e 換帳號後，A 那一場的離開不會解除 B 那一場的鎖：切回 A 被擋下",
    sw?.ok === true &&
      r?.ok === false &&
      r?.error === "BATTLE_IN_PROGRESS" &&
      S().player?.key === "test_c8b",
    { sw, r }
  );
  const aCurrent = S().isBattleTicketCurrent?.(tA);
  const bCurrent = S().isBattleTicketCurrent?.(tB);
  check(
    "R9-C8e-2 換帳號後 A 的票失效，B 的票是目前的場次",
    aCurrent === false && bCurrent === true,
    { aCurrent, bCurrent }
  );
});

// ══════════════════════════════════════════════════════════════
//  Round 10：切換失敗的提示（D10）與遊戲版本握手
//  - store 的 switchNotice：切換到其他帳號失敗時留下原因（主畫面顯示），不含存檔金鑰；
//    只有最新一次請求可以寫入，之後合法切換成功就清除
//  - utils/gameEngine.ts 的 isCompatibleEngine：Godot 的 game_ready 協定版本和網頁相同才算相容
//  修正前沒有 switchNotice（undefined）也沒有 gameEngine.ts，所以同一支測試在修正前會失敗
// ══════════════════════════════════════════════════════════════
const switchNotice = (S) => S().switchNotice;

// ── D10：切換送出後才開打，提交被擋 ──
await test("R10-N1", async ({ env, S }) => {
  await loaded(env, S, "test_n1a");
  env.server.profiles.set("test_n1b", baseProfile("B"));
  env.server.held.add("get_profile");
  const switching = S().initFromGAS("test_n1b");
  const read = await env.server.waitFor("get_profile", "test_n1b");
  const ticket = S().beginBattle();
  lock(S, ticket);
  env.server.held.clear();
  env.server.handle(read);
  const r = await switching;
  await settle();
  const n = switchNotice(S);
  check(
    "R10-N1 切換送出後才開打、提交被擋：store 留下切換失敗的提示（BATTLE_IN_PROGRESS），仍是 A",
    r?.error === "BATTLE_IN_PROGRESS" &&
      n?.error === "BATTLE_IN_PROGRESS" &&
      S().player?.key === "test_n1a",
    { r, notice: n }
  );
  check(
    "R10-N1-2 提示不含任何存檔金鑰",
    !!n && !JSON.stringify(n).includes("test_n1"),
    n
  );
  S().applyBattleResult(winResult(), ticket);
  await env.clock.advance(35_000);
  const ok = await S().initFromGAS("test_n1b");
  check(
    "R10-N1-3 結算後合法切換成功：提示清除，不殘留過時的錯誤",
    ok?.ok === true &&
      S().player?.key === "test_n1b" &&
      switchNotice(S) === null,
    { ok, notice: switchNotice(S) }
  );
});

// ── D10：戰鬥中直接切換（立即被擋）也留下提示 ──
await test("R10-N2", async ({ env, S }) => {
  await loaded(env, S, "test_n2a");
  env.server.profiles.set("test_n2b", baseProfile("B"));
  lock(S, S().beginBattle());
  const r = await S().initFromGAS("test_n2b");
  check(
    "R10-N2 戰鬥中切換立即被擋：同樣留下提示，仍是 A",
    r?.error === "BATTLE_IN_PROGRESS" &&
      switchNotice(S)?.error === "BATTLE_IN_PROGRESS" &&
      S().player?.key === "test_n2a",
    { r, notice: switchNotice(S) }
  );
  S().clearSwitchNotice?.();
  check("R10-N2-2 關閉提示後清除", switchNotice(S) === null, switchNotice(S));
});

// ── 較早的切換在較新的切換之後才回來：不覆蓋較新的提示 ──
await test("R10-N3", async ({ env, S }) => {
  await loaded(env, S, "test_n3a");
  env.server.profiles.set("test_n3b", baseProfile("B"));
  env.server.profiles.set("test_n3c", baseProfile("C"));
  env.server.held.add("get_profile");
  const first = S().initFromGAS("test_n3b");
  const readB = await env.server.waitFor("get_profile", "test_n3b");
  const second = S().initFromGAS("test_n3c");
  const readC = await env.server.waitFor("get_profile", "test_n3c");
  lock(S, S().beginBattle());
  env.server.held.clear();
  env.server.handle(readC);
  const r2 = await second;
  const n2 = switchNotice(S);
  env.server.handle(readB);
  const r1 = await first;
  await settle();
  check(
    "R10-N3 較新的切換（C）被擋後，較早的切換（B）才回來：回報 SUPERSEDED，提示仍是較新的那一次，仍是 A",
    r2?.error === "BATTLE_IN_PROGRESS" &&
      r1?.superseded === true &&
      n2?.error === "BATTLE_IN_PROGRESS" &&
      switchNotice(S) === n2 &&
      S().player?.key === "test_n3a",
    { r1, r2, n2, now: switchNotice(S) }
  );
});

// ── 較新的切換成功後，較早的切換才回來：不產生提示 ──
await test("R10-N4", async ({ env, S }) => {
  await loaded(env, S, "test_n4a");
  env.server.profiles.set("test_n4b", baseProfile("B"));
  env.server.profiles.set("test_n4c", baseProfile("C"));
  env.server.held.add("get_profile");
  const first = S().initFromGAS("test_n4b");
  const readB = await env.server.waitFor("get_profile", "test_n4b");
  const second = S().initFromGAS("test_n4c");
  const readC = await env.server.waitFor("get_profile", "test_n4c");
  env.server.held.clear();
  env.server.handle(readC);
  const r2 = await second;
  env.server.handle(readB);
  const r1 = await first;
  await settle();
  check(
    "R10-N4 較新的切換（C）成功後，較早的切換（B）才回來：不切回 B，也不產生提示",
    r2?.ok === true &&
      r1?.superseded === true &&
      S().player?.key === "test_n4c" &&
      switchNotice(S) === null,
    { r1, r2, key: S().player?.key, notice: switchNotice(S) }
  );
});

// ── 不是切換帳號的失敗不產生切換提示 ──
await test("R10-N5", async ({ env, S }) => {
  await loaded(env, S, "test_n5a");
  env.server.held.add("get_profile");
  const refresh = S().refreshProfile();
  const read = await env.server.waitFor("get_profile", "test_n5a", 2);
  read.networkError();
  const r = await refresh;
  check(
    "R10-N5 同帳號同步失敗：不產生切換提示",
    r?.ok === false && switchNotice(S) === null,
    { r, notice: switchNotice(S) }
  );
});

await test("R10-N6", async ({ env, S }) => {
  env.local.setItem("shenma_player_key", "test_n6");
  env.server.held.add("get_profile");
  const login = S().initFromGAS("test_n6");
  const read = await env.server.waitFor("get_profile", "test_n6");
  read.networkError();
  const r = await login;
  check(
    "R10-N6 首次登入（還沒有玩家資料）失敗：由登入畫面顯示錯誤，不產生切換提示",
    r?.ok === false && switchNotice(S) === null && !!S().error,
    { r, notice: switchNotice(S), error: S().error }
  );
});

// ── 遊戲版本握手 ──
await test("R10-P1", async () => {
  const { isCompatibleEngine, BRIDGE_PROTOCOL } = require(
    join(GAME, "utils/gameEngine.ts")
  );
  const ready = (extra) => ({
    __godot_bridge: true,
    type: "game_ready",
    ...extra,
  });
  const got = [
    ready({}),
    ready({ protocol: 1 }),
    ready({ protocol: "2" }),
    ready({ protocol: 3 }),
    ready({ protocol: 2 }),
  ].map((m) => isCompatibleEngine(m));
  check(
    "R10-P1 只有協定版本和網頁相同（2）的 game_ready 才相容；舊版（沒有 protocol）、其他版本、字串都不相容",
    BRIDGE_PROTOCOL === 2 &&
      JSON.stringify(got) ===
        JSON.stringify([false, false, false, false, true]),
    got
  );
});

// ══════════════════════════════════════════════════════════════
//  Round 12：武將技能（趙雲「奇襲」）的定義是唯一來源
//  說明文字與送進 Godot 的參數（出征資料 team_list[].skill）都由 utils/heroSkills 產生
// ══════════════════════════════════════════════════════════════
await test("R12-S1", async () => {
  const { heroSkillOf, heroSkillPayload, describeHeroSkill } = require(
    join(GAME, "utils/heroSkills.ts")
  );
  const zhao = heroSkillOf("zhao_yun");
  const payload = heroSkillPayload("zhao_yun");
  const none = heroSkillPayload("guan_yu");
  check(
    "R12-S1 趙雲的奇襲：送進 Godot 的參數（first_strike、2 倍）與說明文字出自同一份定義；沒有技能的武將不帶 skill 欄位",
    zhao?.name === "奇襲" &&
      zhao.firstAttackMultiplier === 2 &&
      payload.skill?.id === "first_strike" &&
      payload.skill?.first_attack_multiplier === zhao.firstAttackMultiplier &&
      describeHeroSkill(zhao).includes(`${zhao.firstAttackMultiplier} 倍`) &&
      heroSkillOf("guan_yu") === null &&
      !("skill" in none),
    { zhao, payload, none }
  );
});

await test("R14-S1", async () => {
  const {
    heroSkillOf,
    heroSkillPayload,
    describeHeroSkill,
    effectiveRange,
  } = require(join(GAME, "utils/heroSkills.ts"));
  const huang = heroSkillOf("huang_zhong");
  const payload = heroSkillPayload("huang_zhong");
  const zhaoPayload = heroSkillPayload("zhao_yun");
  const lv1 = describeHeroSkill(huang, 5);
  const lv2 = describeHeroSkill(huang, 5 + 0.03);
  check(
    "R14-S1 黃忠的百步穿楊：送進 Godot 的參數（long_range、1.5 倍）、說明文字與實際射程出自同一份定義；參數只帶射程倍率，趙雲的參數不受影響",
    huang?.id === "long_range" &&
      huang.name === "百步穿楊" &&
      payload.skill?.id === "long_range" &&
      payload.skill?.range_multiplier === huang.rangeMultiplier &&
      JSON.stringify(Object.keys(payload.skill).sort()) ===
        '["id","range_multiplier"]' &&
      JSON.stringify(Object.keys(zhaoPayload.skill).sort()) ===
        '["first_attack_multiplier","id"]' &&
      effectiveRange(huang, 5) === 7.5 &&
      effectiveRange(huang, 5.03) === 7.545 &&
      effectiveRange(null, 5) === 5 &&
      lv1.includes(`${huang.rangeMultiplier} 倍`) &&
      lv1.includes("射程 5 格，戰場上是 7.5 格") &&
      lv2.includes("射程 5.03 格，戰場上是 7.545 格"),
    { huang, payload, zhaoPayload, lv1, lv2 }
  );
});

await test("R15-S1", async () => {
  const {
    heroSkillOf,
    heroSkillPayload,
    describeHeroSkill,
    burnTickDamage,
    effectiveRange,
  } = require(join(GAME, "utils/heroSkills.ts"));
  const zhou = heroSkillOf("zhou_yu");
  const payload = heroSkillPayload("zhou_yu");
  const text = describeHeroSkill(zhou, 4, 122);
  const others = ["zhao_yun", "huang_zhong", "guan_yu"].map((id) =>
    Object.keys(heroSkillPayload(id).skill || {}).sort()
  );
  check(
    "R15-S1 周瑜的火攻：送進 Godot 的參數（burn、20%、3 跳、間隔 1 秒）、說明文字與每跳傷害出自同一份定義；參數只帶火攻欄位，其他武將不受影響，射程不變",
    zhou?.id === "burn" &&
      zhou.name === "火攻" &&
      payload.skill?.id === "burn" &&
      payload.skill.burn_ratio === zhou.burnRatio &&
      payload.skill.burn_ticks === zhou.burnTicks &&
      payload.skill.burn_interval === zhou.burnIntervalSec &&
      zhou.burnRatio === 0.2 &&
      zhou.burnTicks === 3 &&
      zhou.burnIntervalSec === 1 &&
      JSON.stringify(Object.keys(payload.skill).sort()) ===
        '["burn_interval","burn_ratio","burn_ticks","id"]' &&
      JSON.stringify(others) ===
        JSON.stringify([
          ["first_attack_multiplier", "id"],
          ["id", "range_multiplier"],
          [],
        ]) &&
      burnTickDamage(zhou, 100) === 20 &&
      burnTickDamage(zhou, 122) === 24.4 &&
      burnTickDamage(heroSkillOf("zhao_yun"), 100) === 0 &&
      effectiveRange(zhou, 4) === 4 &&
      text.includes("每 1 秒受到一次傷害，共 3 次") &&
      text.includes("20%") &&
      text.includes("目前攻擊力 122：每次灼燒 24.4") &&
      text.includes("不會疊加"),
    { zhou, payload, others, text }
  );
});

// ══════════════════════════════════════════════════════════════
//  Round 13 修正（C13-F，Round 15 定案）：遷移狀態不明的寫入限制（MigrationHold）
//  讀不回網站更新前的暫存時，那份暫存可能有稍晚才在伺服器完成的升級，前端無法確認。
//  限制中這個分頁不送出任何寫入（save_profile、upgrade_hero、save_result、create_profile），只能讀取；
//  重新整理、讀取雲端、關閉提示都不會解除。斷言都用「經過一段時間後的寫入次數」，
//  不等待不應出現的請求
// ══════════════════════════════════════════════════════════════
const WRITE_ACTIONS = [
  "save_profile",
  "upgrade_hero",
  "save_result",
  "create_profile",
];
const writesSince = (env, from) =>
  env.server.calls
    .slice(from)
    .filter((c) => WRITE_ACTIONS.includes(c.action))
    .map((c) => c.action);
const holdOf = (env) => readSession(env)?.migrationHold ?? null;
const lateUpgrade = (env, key, gold = 900) => {
  const p = env.server.profiles.get(key);
  p.gold = gold;
  p.heroes = [
    { hero_id: "guan_yu", level: 2, star: 0, atk: 160, def: 128, hp: 1600 },
  ];
};
const teamOf = (p) => (p?.team || []).map((t) => t.hero_id);
const heroLv = (p, id) => p?.heroes?.find((h) => h.hero_id === id)?.level ?? 1;
const twoHeroes = () => ({
  ...baseProfile(),
  team: [
    { hero_id: "guan_yu", slot: 1 },
    { hero_id: "zhao_yun", slot: 2 },
  ],
});

await test("R13F-L2", async ({ env, S: S0 }) => {
  // 原本的已知限制 L2（合併保存的讀寫之間被蓋掉）改成失敗門檻：限制中不送出任何寫入。
  // 限制開始前已開戰、已有一筆還在 debounce 的修改；之後嘗試隊伍、暱稱、升級、結算、手動同步、重新整理補送
  await loaded(env, S0, "test_l2", twoHeroes());
  const ticket = S0().beginBattle();
  const editedBefore = S0().updateNickname("限制前的修改");
  const from = env.server.calls.length;
  S0().holdMigrationWrites();
  // 更新前的頁面送出的升級，稍晚才在伺服器完成
  lateUpgrade(env, "test_l2");
  const settled = S0().applyBattleResult(winResult(500), ticket);
  const team = S0().updateTeam([{ hero_id: "guan_yu", slot: 1 }]);
  const up = await S0().upgradeHero("guan_yu", heroCfg);
  const sync = await S0().refreshProfile();
  await env.clock.advance(120_000); // debounce（30 秒）與重試間隔都過了
  const beforeReload = S0().player;
  // 重新整理：新頁面沒有呼叫 holdMigrationWrites，限制來自 session 的標記
  const S = reloadPage(env);
  const restored = S().loadFromSession("test_l2");
  await env.clock.advance(120_000);
  const nickAfter = S().updateNickname("重新整理後");
  await env.clock.advance(60_000);
  const writes = writesSince(env, from);
  const server = env.server.profiles.get("test_l2");
  const p = S().player;
  check(
    "R13F-L2 遷移狀態不明：稍晚完成的升級之後，嘗試結算、隊伍、暱稱、升級、手動同步、debounce 自動保存、重新整理後補送，寫入請求都是 0；後端保有 900 與關羽 Lv2",
    !!ticket &&
      editedBefore === true &&
      writes.length === 0 &&
      settled.ok === false &&
      settled.error === "MIGRATION_HOLD" &&
      team === false &&
      up.error === "MIGRATION_HOLD" &&
      sync.ok === false &&
      sync.error === "MIGRATION_HOLD" &&
      restored === true &&
      nickAfter === false &&
      server.gold === 900 &&
      heroLv(server, "guan_yu") === 2 &&
      server.nickname === "旅行者" &&
      JSON.stringify(teamOf(server)) === '["guan_yu","zhao_yun"]',
    {
      writes,
      settled,
      team,
      up,
      sync,
      restored,
      nickAfter,
      server: {
        gold: server.gold,
        heroes: server.heroes,
        nickname: server.nickname,
      },
    }
  );
  check(
    "R13F-L2-2 本機修改保留在 session（暱稱、未同步版本），沒有套用結算獎勵、沒有本機升級；重新整理後仍在限制中，保存失敗原因是 MIGRATION_HOLD",
    beforeReload.gold === 1000 &&
      beforeReload.exp === 0 &&
      p.nickname === "限制前的修改" &&
      p.rev !== p.syncedRev &&
      heroLv(p, "guan_yu") === 1 &&
      JSON.stringify(teamOf(p)) === '["guan_yu","zhao_yun"]' &&
      S().writeHold === true &&
      !!holdOf(env) &&
      S().syncError === "MIGRATION_HOLD",
    {
      gold: beforeReload.gold,
      exp: beforeReload.exp,
      nickname: p.nickname,
      rev: p.rev,
      syncedRev: p.syncedRev,
      writeHold: S().writeHold,
      hold: holdOf(env),
      syncError: S().syncError,
    }
  );
});

await test("R13F-H1", async ({ env, S }) => {
  // 開機腳本的分頁標記（lostCopy）：store 在每次寫入前直接檢查，不依賴元件先呼叫 holdMigrationWrites
  globalThis.window.__siteIsolation = { lostCopy: true };
  const r = await loaded(env, S, "test_h1", twoHeroes());
  const from = env.server.calls.length;
  lateUpgrade(env, "test_h1");
  const team = S().updateTeam([{ hero_id: "guan_yu", slot: 1 }]);
  const nick = S().updateNickname("不應保存");
  const up = await S().upgradeHero("guan_yu", heroCfg);
  const ticket = S().beginBattle();
  await env.clock.advance(120_000);
  const server = env.server.profiles.get("test_h1");
  check(
    "R13F-H1 只有分頁標記（沒有呼叫 holdMigrationWrites）也一樣：讀取照常，隊伍、暱稱、升級都不修改、不能開戰，寫入請求 0，存檔記上標記",
    r.ok &&
      team === false &&
      nick === false &&
      up.error === "MIGRATION_HOLD" &&
      ticket === null &&
      writesSince(env, from).length === 0 &&
      server.gold === 900 &&
      S().writeHold === true &&
      !!holdOf(env) &&
      S().player.rev === S().player.syncedRev,
    { r, team, nick, up, ticket, writes: writesSince(env, from) }
  );
});

await test("R13F-H2", async ({ env, S: S0 }) => {
  // 重新整理前留下未同步的修改與結果不明的升級，之後進入限制
  env.server.profiles.set("test_h2", baseProfile());
  env.local.setItem("shenma_player_key", "test_h2");
  env.session.setItem(
    SESSION_KEY,
    JSON.stringify({
      ...baseProfile("未同步的暱稱"),
      key: "test_h2",
      syncStatus: "pending",
      rev: 2,
      syncedRev: 0,
      pendingUpgrade: {
        id: "op-h2",
        hero_id: "guan_yu",
        base: baseProfile(),
        sent_at: 0,
        state: "in_flight",
      },
      migrationHold: { since: 1 },
    })
  );
  void S0;
  const S = reloadPage(env);
  const restored = S().loadFromSession("test_h2");
  await env.clock.advance(1_000);
  const p1 = S().player;
  const reads1 = env.server.count("get_profile", "test_h2");
  // 舊升級稍晚才在伺服器完成：之後的自動重新確認讀得到，只在本機採用
  lateUpgrade(env, "test_h2");
  await env.clock.advance(60_000);
  const p2 = S().player;
  const writes = writesSince(env, 0);
  const server = env.server.profiles.get("test_h2");
  check(
    "R13F-H2 session 帶著限制標記：待確認的升級只重新讀取確認（不重送 upgrade_hero），看不到時維持待確認，未同步的暱稱保留、沒有補送",
    restored &&
      S().writeHold === true &&
      reads1 >= 1 &&
      p1.pendingUpgrade?.id === "op-h2" &&
      p1.nickname === "未同步的暱稱" &&
      writes.length === 0,
    {
      restored,
      reads1,
      pending: p1.pendingUpgrade?.id,
      nickname: p1.nickname,
      writes,
    }
  );
  check(
    "R13F-H2-2 升級稍晚完成後：讀取確認並在本機採用（900、關羽 Lv2），本機暱稱仍是未同步；寫入請求 0，後端維持 900／Lv2、暱稱不變",
    !p2.pendingUpgrade &&
      p2.gold === 900 &&
      heroLv(p2, "guan_yu") === 2 &&
      p2.nickname === "未同步的暱稱" &&
      p2.rev !== p2.syncedRev &&
      writes.length === 0 &&
      server.gold === 900 &&
      server.nickname === "旅行者",
    {
      pending: p2.pendingUpgrade,
      gold: p2.gold,
      nickname: p2.nickname,
      writes,
    }
  );
});

await test("R13F-H3", async ({ env, S }) => {
  // 限制中可以讀取：背景讀取、手動同步（沒有本機修改）採用雲端資料，限制不解除
  S().holdMigrationWrites();
  await loaded(env, S, "test_h3");
  lateUpgrade(env, "test_h3");
  const from = env.server.calls.length;
  await S().backgroundRefresh("test_h3");
  const afterBg = S().player.gold;
  lateUpgrade(env, "test_h3", 850);
  const sync = await S().refreshProfile();
  await env.clock.advance(60_000);
  check(
    "R13F-H3 限制中讀取照常：背景讀取與手動同步採用雲端（900、850），限制與標記仍在，寫入請求 0",
    afterBg === 900 &&
      sync.ok === true &&
      S().player.gold === 850 &&
      heroLv(S().player, "guan_yu") === 2 &&
      S().writeHold === true &&
      !!holdOf(env) &&
      writesSince(env, from).length === 0,
    { afterBg, sync, gold: S().player.gold, writes: writesSince(env, from) }
  );
});

await test("R13F-H4", async ({ env, S }) => {
  // 切換帳號：有本機修改時不切換（修改無法保存）；沒有修改時可以讀取其他帳號，但新帳號同樣受限、不建立新存檔
  await loaded(env, S, "test_h4a");
  S().updateNickname("A 的修改");
  S().holdMigrationWrites();
  env.server.profiles.set("test_h4b", baseProfile("B"));
  const from = env.server.calls.length;
  const r1 = await S().initFromGAS("test_h4b");
  const stayA =
    S().player.key === "test_h4a" && S().player.nickname === "A 的修改";
  check(
    "R13F-H4 限制中有本機修改：切換帳號失敗（MIGRATION_HOLD），留在原帳號、修改保留，寫入請求 0",
    r1.ok === false &&
      r1.error === "MIGRATION_HOLD" &&
      stayA &&
      writesSince(env, from).length === 0,
    { r1, key: S().player.key, writes: writesSince(env, from) }
  );
});

await test("R13F-H5", async ({ env, S }) => {
  S().holdMigrationWrites();
  await loaded(env, S, "test_h5a");
  env.server.profiles.set("test_h5b", baseProfile("B"));
  const from = env.server.calls.length;
  const r1 = await S().initFromGAS("test_h5b");
  const nick = S().updateNickname("B 的修改");
  const r2 = await S().initFromGAS("test_h5_new");
  await env.clock.advance(60_000);
  check(
    "R13F-H5 限制中沒有本機修改：可以讀取並切換到其他帳號（B），B 同樣受限；找不到存檔時不建立（MIGRATION_HOLD、沒有 create_profile），寫入請求 0",
    r1.ok === true &&
      S().player.key === "test_h5b" &&
      nick === false &&
      r2.ok === false &&
      r2.error === "MIGRATION_HOLD" &&
      env.server.count("create_profile") === 0 &&
      writesSince(env, from).length === 0 &&
      !!holdOf(env),
    { r1, r2, key: S().player.key, writes: writesSince(env, from) }
  );
});

await test("R13F-H6", async ({ env, S }) => {
  // 沒有遷移狀態不明的分頁不受影響：修改、升級、結算照常送出，存檔沒有限制標記
  await loaded(env, S, "test_h6");
  const nick = S().updateNickname("一般使用者");
  await env.clock.advance(35_000);
  const up = await S().upgradeHero("guan_yu", heroCfg);
  const ticket = S().beginBattle();
  const settled = S().applyBattleResult(winResult(500), ticket);
  await env.clock.advance(35_000);
  const server = env.server.profiles.get("test_h6");
  const saves = env.server.calls.filter((c) => c.action === "save_profile");
  check(
    "R13F-H6 一般分頁不受影響：暱稱保存、伺服器升級、結算與保存都照常送出；沒有限制標記，送出的資料不含限制欄位",
    nick === true &&
      up.success === true &&
      !!ticket &&
      settled.ok === true &&
      server.nickname === "一般使用者" &&
      heroLv(server, "guan_yu") === 2 &&
      server.gold === 1000 - 100 + 500 &&
      resultCalls(env).length === 1 &&
      S().writeHold === false &&
      !holdOf(env) &&
      saves.length >= 2 &&
      saves.every((c) => !("migrationHold" in c.payload.data)),
    {
      nick,
      up,
      settled,
      server: { nickname: server.nickname, gold: server.gold },
      saves: saves.length,
    }
  );
});

// ══════════════════════════════════════════════════════════════
//  Round 16（D17）：攻速成長的欄位名稱
//  正式 heroes_config 用 speed_growth，程式內部用 atk_spd_growth；靜態設定進入 store 時
//  （新的 API 回應、已存在的本機快取）都經過 utils/heroStats 的 normalizeStaticConfig
// ══════════════════════════════════════════════════════════════
const heroStats = () => require(join(GAME, "utils/heroStats.ts"));
const STATIC_LOCAL_KEY = "shenma_static_config";
const STATIC_TS_KEY = "shenma_static_ts";
// 舊格式的武將設定（和正式設定一樣只有 speed_growth）
const aliasHero = (hero_id, attack_speed, speed_growth) => ({
  hero_id,
  name: hero_id,
  attack_speed,
  speed_growth,
  attack_range: 3,
  range_growth: 0,
});

await test("R16-A1", async () => {
  const { normalizeHeroConfig } = heroStats();
  const g = (h) => normalizeHeroConfig(h).atk_spd_growth;
  const cases = {
    aliasOnly: g({ speed_growth: 0.02 }),
    oldOnly: g({ atk_spd_growth: 0.05 }),
    conflict: g({ atk_spd_growth: 0.05, speed_growth: 0.02 }),
    explicitZero: g({ atk_spd_growth: 0, speed_growth: 0.3 }),
    missing: g({}),
    negativeOld: g({ atk_spd_growth: -0.1, speed_growth: 0.02 }),
    nanOld: g({ atk_spd_growth: NaN, speed_growth: 0.02 }),
    infOld: g({ atk_spd_growth: Infinity, speed_growth: 0.02 }),
    nullOld: g({ atk_spd_growth: null, speed_growth: 0.02 }),
    textOld: g({ atk_spd_growth: "abc", speed_growth: 0.02 }),
    emptyOld: g({ atk_spd_growth: "", speed_growth: 0.02 }),
    numericTextAlias: g({ speed_growth: "0.02" }),
    bothInvalid: g({ atk_spd_growth: -1, speed_growth: "x" }),
    negativeAlias: g({ speed_growth: -0.02 }),
  };
  const raw = { hero_id: "zhou_yu", speed_growth: 0.02, attack_speed: 1 };
  const out = normalizeHeroConfig(raw);
  check(
    "R16-A1 攻速成長的欄位：atk_spd_growth 有效（包含明確的 0）時優先，否則用有效的 speed_growth，兩者都沒有或無效時是 0；無效＝負數、NaN、Infinity、null、非數字文字、空字串；其他欄位保留、原物件不被修改",
    cases.aliasOnly === 0.02 &&
      cases.oldOnly === 0.05 &&
      cases.conflict === 0.05 &&
      cases.explicitZero === 0 &&
      cases.missing === 0 &&
      cases.negativeOld === 0.02 &&
      cases.nanOld === 0.02 &&
      cases.infOld === 0.02 &&
      cases.nullOld === 0.02 &&
      cases.textOld === 0.02 &&
      cases.emptyOld === 0.02 &&
      cases.numericTextAlias === 0.02 &&
      cases.bothInvalid === 0 &&
      cases.negativeAlias === 0 &&
      out.speed_growth === 0.02 &&
      out.attack_speed === 1 &&
      out.hero_id === "zhou_yu" &&
      !("atk_spd_growth" in raw),
    cases
  );
});

await test("R16-A2", async () => {
  const { normalizeHeroConfig, attackIntervalSec, formatSec } = heroStats();
  const zhou = normalizeHeroConfig(aliasHero("zhou_yu", 1, 0.02));
  const huang = normalizeHeroConfig(aliasHero("huang_zhong", 1.9, 0.01));
  const fast = normalizeHeroConfig(aliasHero("fast", 1, 0.6));
  const v = {
    zhou1: attackIntervalSec(zhou, 1),
    zhou2: attackIntervalSec(zhou, 2),
    huang1: attackIntervalSec(huang, 1),
    huang2: attackIntervalSec(huang, 2),
    fast2: attackIntervalSec(fast, 2),
    fast3: attackIntervalSec(fast, 3),
    fmt: [formatSec(1.881), formatSec(0.98), formatSec(1), formatSec(0.1)],
  };
  check(
    "R16-A2 攻擊間隔＝max(0.1, attack_speed × (1 − (等級 − 1) × 成長))：周瑜（正式設定 1、0.02）Lv1 1、Lv2 0.98；黃忠（1.9、0.01）Lv1 1.9、Lv2 1.881；成長 0.6 的 Lv2 0.4、Lv3 下限 0.1；顯示最多 3 位小數",
    v.zhou1 === 1 &&
      Math.abs(v.zhou2 - 0.98) < 1e-12 &&
      v.huang1 === 1.9 &&
      Math.abs(v.huang2 - 1.881) < 1e-12 &&
      Math.abs(v.fast2 - 0.4) < 1e-12 &&
      v.fast3 === 0.1 &&
      JSON.stringify(v.fmt) === '["1.881","0.98","1","0.1"]',
    v
  );
});

await test("R16-A3", async ({ env }) => {
  // 已存在的新鮮快取（舊格式）：不打 API，直接用正規化後的設定
  const raw = {
    heroesConfig: [
      aliasHero("zhou_yu", 1, 0.02),
      { ...aliasHero("zhao_yun", 1.4, 0.3), atk_spd_growth: 0 },
    ],
    enemiesConfig: [],
    maps: [],
  };
  env.local.setItem(STATIC_LOCAL_KEY, JSON.stringify(raw));
  env.local.setItem(STATIC_TS_KEY, String(Date.now()));
  const { useStaticConfigStore } = require(
    join(GAME, "store/staticConfigStore.ts")
  );
  await useStaticConfigStore.getState().loadConfig();
  const cfg = useStaticConfigStore.getState().config;
  const byId = Object.fromEntries(cfg.heroesConfig.map((h) => [h.hero_id, h]));
  check(
    "R16-A3 從舊快取啟動：沒有打 API；周瑜只有 speed_growth → atk_spd_growth 0.02（不需要清除快取）；趙雲明確的 atk_spd_growth 0 不被 speed_growth 0.3 蓋掉；本機快取的內容不被改寫",
    env.server.calls.length === 0 &&
      byId.zhou_yu.atk_spd_growth === 0.02 &&
      byId.zhao_yun.atk_spd_growth === 0 &&
      env.local.getItem(STATIC_LOCAL_KEY) === JSON.stringify(raw),
    { calls: env.server.calls.length, heroes: cfg.heroesConfig }
  );
});

await test("R16-A4", async ({ env }) => {
  // 沒有快取：新的 API 回應（和正式設定一樣只有 speed_growth）同樣正規化；快取存 API 的原始內容
  for (const a of ["get_heroes_config", "get_enemies_config", "get_all_maps"])
    env.server.held.add(a);
  const { useStaticConfigStore } = require(
    join(GAME, "store/staticConfigStore.ts")
  );
  const p = useStaticConfigStore.getState().loadConfig();
  await settle();
  const respond = (action, body) =>
    env.server.calls
      .find((c) => c.action === action)
      .respond({ status: 200, ...body });
  respond("get_heroes_config", {
    heroes: [
      aliasHero("zhou_yu", 1, 0.02),
      aliasHero("huang_zhong", 1.9, 0.01),
    ],
  });
  respond("get_enemies_config", { enemies: [] });
  respond("get_all_maps", { maps: [] });
  await p;
  const cfg = useStaticConfigStore.getState().config;
  const cached = JSON.parse(env.local.getItem(STATIC_LOCAL_KEY) || "null");
  check(
    "R16-A4 新的 API 回應（只有 speed_growth）：store 的設定是 atk_spd_growth 0.02／0.01（送進 Godot 的 heroes_config 就是這一份）；快取保留原始內容",
    cfg.heroesConfig[0].atk_spd_growth === 0.02 &&
      cfg.heroesConfig[1].atk_spd_growth === 0.01 &&
      cfg.heroesConfig.every((h) => typeof h.atk_spd_growth === "number") &&
      cached &&
      !("atk_spd_growth" in cached.heroesConfig[0]),
    { heroes: cfg.heroesConfig }
  );
});

await test("R16-A5", async ({ env }) => {
  // 過期的舊快取：先用正規化後的快取顯示，API 回來後換成新的設定（新設定明確的 0 優先）
  env.local.setItem(
    STATIC_LOCAL_KEY,
    JSON.stringify({
      heroesConfig: [aliasHero("guan_yu", 1, 0.02)],
      enemiesConfig: [],
      maps: [],
    })
  );
  env.local.setItem(STATIC_TS_KEY, String(Date.now() - 10 * 60_000));
  for (const a of ["get_heroes_config", "get_enemies_config", "get_all_maps"])
    env.server.held.add(a);
  const { useStaticConfigStore } = require(
    join(GAME, "store/staticConfigStore.ts")
  );
  const p = useStaticConfigStore.getState().loadConfig();
  await settle();
  const early =
    useStaticConfigStore.getState().config.heroesConfig[0].atk_spd_growth;
  for (const [a, body] of [
    [
      "get_heroes_config",
      {
        heroes: [{ ...aliasHero("guan_yu", 1, 0.5), atk_spd_growth: 0 }],
      },
    ],
    ["get_enemies_config", { enemies: [] }],
    ["get_all_maps", { maps: [] }],
  ])
    env.server.calls
      .find((c) => c.action === a)
      .respond({ status: 200, ...body });
  await p;
  const late =
    useStaticConfigStore.getState().config.heroesConfig[0].atk_spd_growth;
  check(
    "R16-A5 過期的舊快取：API 回應前先用正規化後的快取（0.02）；API 回來後換成新的設定，明確的 atk_spd_growth 0 不被 speed_growth 0.5 蓋掉",
    early === 0.02 && late === 0,
    { early, late }
  );
});

// ══════════════════════════════════════════════════════════════
//  Round 16：關卡敵軍預覽（utils/stagePreview）
//  出兵規則照 Godot（Main._count_waves、WaveManager.plan_wave、GameMap._parse_path_json）
// ══════════════════════════════════════════════════════════════
const stagePreview = () => require(join(GAME, "utils/stagePreview.ts"));
const PV_ENEMIES = [
  { enemy_id: "grunt", name: "步兵", hp: 20, speed: 60 },
  { enemy_id: "cav", name: "騎兵", hp: 80, speed: 120 },
  { enemy_id: "ghost", name: "幽靈" },
];
const pvMap = (
  waves,
  path_json = {
    paths: {
      path_a: [
        [0, 5],
        [13, 5],
      ],
      path_b: [
        [0, 7],
        [13, 7],
      ],
    },
  }
) => ({
  map_id: "pv",
  chapter: 1,
  name: "預覽",
  unlock_stage: "pv",
  path_json,
  waves,
});

await test("R16-P1", async () => {
  const { buildStagePreview } = stagePreview();
  const pv = buildStagePreview(
    pvMap([
      {
        wave: 1,
        enemies: [
          { enemy_id: "grunt", count: 3, interval: 1, path: "path_a" },
          { enemy_id: "grunt", count: 2, interval: 0.5, path: "path_b" },
          { enemy_id: "cav", count: 1, interval: 1, path: "path_a" },
        ],
      },
      {
        wave: 2,
        enemies: [{ enemy_id: "cav", count: 4, interval: 2, path: "path_b" }],
      },
    ]),
    PV_ENEMIES
  );
  const w1 = pv.waves[0];
  check(
    "R16-P1 正常資料：2 波、每波與全關數量（6、4、10）；同種敵人分兩組、各自保留路線與間隔；名稱、血量、移動速度取自敵人設定；路線 path_a、path_b",
    pv.waves.length === 2 &&
      w1.total === 6 &&
      pv.waves[1].total === 4 &&
      pv.total === 10 &&
      w1.groups.length === 3 &&
      w1.groups[0].name === "步兵" &&
      w1.groups[0].path === "path_a" &&
      w1.groups[1].path === "path_b" &&
      w1.groups[1].count === 2 &&
      w1.groups[1].interval === 0.5 &&
      w1.groups[2].hp === 80 &&
      w1.groups[2].speed === 120 &&
      !w1.incomplete &&
      JSON.stringify(pv.pathIds) === '["path_a","path_b"]',
    pv
  );
});

await test("R16-P2", async () => {
  const { buildStagePreview } = stagePreview();
  const pv = buildStagePreview(
    pvMap([
      {
        wave: 1,
        enemies: [
          { enemy_id: "", count: 5 },
          { enemy_id: "unknown_x", count: 2 },
          { enemy_id: "grunt", count: 3, path: "path_z" },
          { enemy_id: "grunt", count: 0 },
          { enemy_id: "grunt" },
          { enemy_id: "ghost", count: 2, interval: 1 },
        ],
      },
      { wave: 3, enemies: [{ enemy_id: "cav", count: 1, interval: 1 }] },
      { wave: 1, enemies: [{ enemy_id: "cav", count: 9, interval: 1 }] },
    ]),
    PV_ENEMIES
  );
  const [w1, w2, w3] = pv.waves;
  const byId = (id) => w1.groups.filter((g) => g.enemyId === id);
  check(
    "R16-P2 不完整資料照遊戲規則：空白列略過（不算敵人）、找不到設定／路線沒有路點／數量 0 的組不會出兵；沒有數量以 1 隻計、沒有路線用 path_a、沒有間隔 1 秒；設定缺血量／速度標成未提供；同一波重複的資料只用第一筆；缺少的第 2 波會被拒絕；有缺漏時全關不給確定總數",
    pv.waves.length === 3 &&
      w1.blankRows === 1 &&
      byId("unknown_x")[0].outcome === "skip" &&
      byId("unknown_x")[0].count === null &&
      byId("grunt")[0].outcome === "skip" &&
      byId("grunt")[1].outcome === "skip" &&
      byId("grunt")[2].outcome === "spawn" &&
      byId("grunt")[2].count === 1 &&
      byId("grunt")[2].path === "path_a" &&
      byId("grunt")[2].interval === 1 &&
      byId("ghost")[0].hp === null &&
      byId("ghost")[0].speed === null &&
      byId("ghost")[0].count === 2 &&
      w1.total === 3 &&
      w1.incomplete &&
      w1.duplicates === 1 &&
      w2.missing &&
      w2.rejected &&
      w2.total === null &&
      w3.total === 1 &&
      pv.total === null,
    pv
  );
});

await test("R16-P3", async () => {
  const { buildStagePreview, stagePathIds } = stagePreview();
  const rejected = buildStagePreview(
    pvMap([{ wave: 1, enemies: [{ enemy_id: "unknown_x", count: 3 }] }]),
    PV_ENEMIES
  );
  const unknownCount = buildStagePreview(
    pvMap([
      {
        wave: 1,
        enemies: [
          { enemy_id: "grunt", count: "3隻" },
          { enemy_id: "cav", count: "2" },
        ],
      },
    ]),
    PV_ENEMIES
  );
  const empty = buildStagePreview(pvMap([]), PV_ENEMIES);
  const noPath = buildStagePreview(
    pvMap([{ wave: 1, enemies: [{ enemy_id: "grunt", count: 3 }] }], {}),
    PV_ENEMIES
  );
  const paths = {
    arr: stagePathIds({
      paths: [
        [0, 5],
        [13, 5],
      ],
    }),
    wp: stagePathIds({
      waypoints: [
        [0, 5],
        [13, 5],
      ],
    }),
    str: stagePathIds(JSON.stringify({ paths: { p1: [[0, 1]], empty: [] } })),
    bad: stagePathIds("{not json"),
  };
  check(
    "R16-P3 無法確定時不給數量：整波都不會出兵時標成遊戲會拒絕（不是 0 隻）；數量無法判讀（「3隻」）時這一波與全關都不給總數，純數字字串「2」照算；沒有波次、沒有路線都列為資料不完整；路線格式與 Godot 相同（paths 陣列、舊版 waypoints 都是 path_a，JSON 字串、沒有路點的路線不算）",
    rejected.waves[0].rejected &&
      rejected.waves[0].total === null &&
      rejected.total === null &&
      unknownCount.waves[0].groups[0].outcome === "unknown" &&
      unknownCount.waves[0].groups[1].count === 2 &&
      unknownCount.waves[0].total === null &&
      unknownCount.total === null &&
      empty.waves.length === 0 &&
      empty.total === null &&
      empty.problems.length === 1 &&
      noPath.waves[0].rejected &&
      noPath.problems.some((p) => /路線/.test(p)) &&
      JSON.stringify(paths) ===
        JSON.stringify({
          arr: ["path_a"],
          wp: ["path_a"],
          str: ["p1"],
          bad: [],
        }),
    {
      rejected: rejected.waves,
      unknownCount: unknownCount.waves,
      empty,
      noPath: noPath.waves,
      paths,
    }
  );
});

// ── 輸出 ───────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok).length;
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      total: results.length,
      failed,
      results: results.map(({ name, ok }) => ({ name, ok })),
      limitations: limitations.map(({ name, reproduced }) => ({
        name,
        reproduced,
      })),
    })
);
process.exit(failed ? 1 : 0);
