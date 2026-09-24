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

// ── 測試框架 ───────────────────────────────────────────────────
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  const d = typeof detail === "string" ? detail : JSON.stringify(detail);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${d}`.slice(0, 400));
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

// ── 輸出 ───────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok).length;
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      total: results.length,
      failed,
      results: results.map(({ name, ok }) => ({ name, ok })),
    })
);
process.exit(failed ? 1 : 0);
