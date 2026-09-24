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
  S().applyBattleResult({
    result: "WIN",
    stage_id: "chapter1_1",
    stars_earned: 3,
    kills: 5,
    time_seconds: 30,
    loots: [{ item: "battle_points", count: 500 }],
  });
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
  S().applyBattleResult({
    result: "WIN",
    stage_id: "chapter1_1",
    stars_earned: 3,
    kills: 5,
    time_seconds: 30,
    loots: [{ item: "battle_points", count: 500 }],
  });
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
