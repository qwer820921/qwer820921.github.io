// 神馬三國後端請求的自動重試（api/gameApi.ts）與遊戲設定載入（store/staticConfigStore.ts）的測試，不需要瀏覽器
// - 只有唯讀的 action 會自動重試：暫時的失敗（連線失敗、逾時、平台的錯誤頁、429／5xx、後端的 BUSY／SERVER_ERROR）
//   最多重試 2 次（1 秒、2 秒後），每次最多等 30 秒；後端明確的回應（找不到存檔、權限、版本衝突、資料損毀等）不重試
// - 所有寫入 action 不論遇到什麼失敗都只送一次
// - 讀取過期（active 回傳 false）後不再重試；玩家正在等的讀取記錄「較慢」「重試中」給畫面說明，背景讀取不記錄，
//   過期的讀取也不再說明
// - 遊戲設定：三支讀取任一失敗後其餘不再重試、較新的讀取作廢舊的、連按共用同一次、錯誤只留代碼
// 計時器與 fetch 都是假的，由測試控制時間與每個請求的結果
// 用法：node scripts/shenma-regression/web/read-retry.test.mjs
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const GAME = join(ROOT, "src/app/(games)/shenmaSanguo");
const API = join(GAME, "api/gameApi.ts");
const API_SRC = process.env.GAME_API_SRC
  ? resolve(process.env.GAME_API_SRC)
  : API;

require.extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename === API ? API_SRC : filename, "utf8");
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(out.outputText, filename);
};

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, ok: !!pass });
  const d = detail === undefined ? "" : JSON.stringify(detail);
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}  ${d}`.slice(0, 400));
};

const realSetImmediate = setImmediate;
const tick = () => new Promise((r) => realSetImmediate(r));
async function settle(n = 20) {
  for (let i = 0; i < n; i++) await tick();
}

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
}

// ── 假環境：計時器只有 advance(ms) 才前進；每個請求都停在待回應，由測試決定結果 ──
function makeEnv() {
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
  globalThis.window = {};
  globalThis.localStorage = local;
  globalThis.window.localStorage = local;

  const calls = [];
  globalThis.fetch = (url, init) => {
    const body = JSON.parse(init.body);
    return new Promise((resolveFetch, rejectFetch) => {
      const call = {
        url,
        rawBody: init.body,
        action: body.action,
        key: body.key,
        payload: body.payload,
        at: clock.now,
        hasSignal: !!init.signal,
        settled: false,
        // 後端程式的回應（HTTP 一律 200，錯誤寫在內容的 status）
        respond(json) {
          call.settled = true;
          resolveFetch({ status: 200, json: async () => json });
        },
        // 平台回的錯誤頁（HTML，無法解析成 JSON）
        htmlPage(status = 404) {
          call.settled = true;
          resolveFetch({
            status,
            json: async () => {
              throw new SyntaxError("Unexpected token '<'");
            },
          });
        },
        // 能解析、但不是後端程式格式的 JSON
        rawJson(value, status = 200) {
          call.settled = true;
          resolveFetch({ status, json: async () => value });
        },
        networkError() {
          call.settled = true;
          rejectFetch(new TypeError("Failed to fetch"));
        },
      };
      calls.push(call);
      init.signal?.addEventListener?.("abort", () => {
        call.aborted = true;
      });
    });
  };
  const count = (action) =>
    calls.filter((c) => action === undefined || c.action === action).length;
  async function waitCall(action, nth = 1) {
    for (let i = 0; i < 500; i++) {
      const list = calls.filter((c) => c.action === action);
      if (list.length >= nth) return list[nth - 1];
      await tick();
    }
    throw new Error(`等不到第 ${nth} 個 ${action} 請求`);
  }
  return { clock, calls, count, waitCall, local };
}

function freshModules() {
  for (const k of Object.keys(require.cache)) {
    if (k.startsWith(GAME)) delete require.cache[k];
  }
  const api = require(API);
  const wait = require(join(GAME, "store/readWaitStore.ts"));
  return { api, wait };
}

const settleOf = (p) =>
  p.then(
    (value) => ({ state: "ok", value }),
    (error) => ({ state: "error", error })
  );

async function test(id, fn) {
  const env = makeEnv();
  const mods = freshModules();
  try {
    await fn({ env, ...mods });
  } catch (e) {
    check(
      `${id} 執行時拋出例外`,
      false,
      String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e)
    );
  }
}

// 讓呼叫在背景跑，回傳可查詢的狀態
function track(promise) {
  const t = { done: false, result: null };
  settleOf(promise).then((r) => {
    t.done = true;
    t.result = r;
  });
  return t;
}

const READ_CALLS = {
  get_settings: (api, o) => api.gameApi.getSettings(o),
  get_heroes_config: (api, o) => api.gameApi.getHeroesConfig(o),
  get_enemies_config: (api, o) => api.gameApi.getEnemiesConfig(o),
  get_all_maps: (api, o) => api.gameApi.getAllMaps(o),
  get_map_config: (api, o) => api.gameApi.getMapConfig("chapter1_1", o),
  get_profile: (api, o) => api.gameApi.getProfile("test_read", o),
};
const WRITE_CALLS = {
  create_profile: (api) => api.gameApi.createProfile("test_w", "旅行者"),
  save_profile: (api) => api.gameApi.saveProfile("test_w", { gold: 1 }, 3),
  save_result: (api) =>
    api.gameApi.saveResult("test_w", { result: "WIN" }, "req-1", 3, true),
  upgrade_hero: (api) => api.gameApi.upgradeHero("test_w", "guan_yu", 3),
  save_enemies_config: (api) => api.gameApi.saveEnemiesConfig([], "token"),
  save_heroes_config: (api) => api.gameApi.saveHeroesConfig([], "token"),
};

// ── 1. 清單：唯讀 action 剛好是明列的六個 ──
await test("清單", async ({ api }) => {
  const list = [...api.READ_ONLY_ACTIONS].sort();
  check(
    "清單-1 自動重試只限明列的六個唯讀 action",
    JSON.stringify(list) === JSON.stringify(Object.keys(READ_CALLS).sort()),
    list
  );
  check(
    "清單-2 寫入 action 都不在清單內",
    Object.keys(WRITE_CALLS).every((a) => !api.READ_ONLY_ACTIONS.has(a)),
    Object.keys(WRITE_CALLS)
  );
  check(
    "清單-3 正式預設：逾時 30 秒、重試 2 次（1 秒、2 秒）",
    api.READ_TIMEOUT_MS === 30000 &&
      JSON.stringify(api.READ_RETRY_DELAYS_MS) === "[1000,2000]",
    { timeout: api.READ_TIMEOUT_MS, delays: api.READ_RETRY_DELAYS_MS }
  );
});

// ── 2. 每個唯讀 action：連線失敗一次後重試成功，重送的內容相同 ──
for (const [action, call] of Object.entries(READ_CALLS)) {
  await test(`讀取-${action}`, async ({ env, api }) => {
    const t = track(call(api));
    const first = await env.waitCall(action);
    first.networkError();
    await settle();
    await env.clock.advance(999);
    const beforeDelay = env.count(action);
    await env.clock.advance(1);
    const second = await env.waitCall(action, 2);
    second.respond({ status: 200, ok: action });
    await settle();
    check(
      `讀取-${action} 連線失敗 → 1 秒後重試一次並成功，內容與第一次相同`,
      t.done &&
        t.result.state === "ok" &&
        t.result.value.ok === action &&
        beforeDelay === 1 &&
        env.count(action) === 2 &&
        second.rawBody === first.rawBody &&
        second.at - first.at === 1000,
      {
        result: t.result?.state,
        beforeDelay,
        count: env.count(action),
        gap: second.at - first.at,
      }
    );
  });
}

// ── 3. 上限：第一次＋重試 2 次都失敗 → 丟出最後一次的錯誤，不再送出 ──
await test("上限", async ({ env, api }) => {
  const t = track(api.gameApi.getProfile("test_read"));
  (await env.waitCall("get_profile")).networkError();
  await settle();
  await env.clock.advance(1000);
  (await env.waitCall("get_profile", 2)).networkError();
  await settle();
  await env.clock.advance(1999);
  const before = env.count("get_profile");
  await env.clock.advance(1);
  const third = await env.waitCall("get_profile", 3);
  third.networkError();
  await settle();
  await env.clock.advance(120000);
  const e = t.result?.error;
  check(
    "上限-1 三次都連線失敗：第二次重試在 2 秒後，之後不再送出",
    t.done &&
      t.result.state === "error" &&
      before === 2 &&
      env.count("get_profile") === 3,
    { state: t.result?.state, before, count: env.count("get_profile") }
  );
  check(
    "上限-2 錯誤是 NETWORK_ERROR（GasTransportError，不是後端的拒絕、不帶網址）",
    e instanceof api.GasTransportError &&
      !(e instanceof api.GasError) &&
      e.message === "NETWORK_ERROR",
    { name: e?.constructor?.name, message: e?.message }
  );
});

// ── 4. 逾時：30 秒沒有回應 → 逾時重試；逾時後才到的舊回應不採用 ──
await test("逾時", async ({ env, api }) => {
  const t = track(api.gameApi.getAllMaps());
  const first = await env.waitCall("get_all_maps");
  await env.clock.advance(29999);
  const notYet = !t.done && env.count("get_all_maps") === 1;
  await env.clock.advance(1);
  const timedOut = !t.done;
  await env.clock.advance(1000);
  const second = await env.waitCall("get_all_maps", 2);
  first.respond({ status: 200, maps: ["old"] }); // 逾時之後才到
  await settle();
  const ignoredLate = !t.done;
  second.respond({ status: 200, maps: ["new"] });
  await settle();
  check(
    "逾時-1 等滿 30 秒才算逾時，逾時後 1 秒重試",
    notYet && timedOut && second.at === 31000,
    { notYet, timedOut, secondAt: second.at }
  );
  check(
    "逾時-2 逾時後才到的第一次回應不採用，採用重試的結果",
    ignoredLate &&
      t.result?.state === "ok" &&
      JSON.stringify(t.result.value.maps) === '["new"]',
    { ignoredLate, value: t.result?.value }
  );
  check("逾時-3 請求帶中止訊號，逾時時中止", first.hasSignal && first.aborted, {
    hasSignal: first.hasSignal,
    aborted: first.aborted,
  });

  // 三次都逾時：總時間有上限（30＋1＋30＋2＋30 秒），錯誤是 TIMEOUT
  const t2 = track(api.gameApi.getAllMaps());
  await env.waitCall("get_all_maps", 3);
  const start = env.clock.now;
  await env.clock.advance(30000 + 1000 + 30000 + 2000 + 29999);
  const beforeEnd = !t2.done;
  await env.clock.advance(1);
  check(
    "逾時-4 三次都沒有回應：93 秒後以 TIMEOUT 結束，不會一直等",
    beforeEnd &&
      t2.done &&
      t2.result.state === "error" &&
      t2.result.error.message === "TIMEOUT" &&
      env.count("get_all_maps") === 5 &&
      env.clock.now - start === 93000,
    {
      beforeEnd,
      state: t2.result?.state,
      code: t2.result?.error?.message,
      count: env.count("get_all_maps"),
    }
  );
});

// ── 5. 平台的錯誤頁、429／5xx、不是後端格式的 JSON：都是暫時的失敗 ──
const PLATFORM = [
  ["HTML 404 錯誤頁", (c) => c.htmlPage(404)],
  ["HTML 200 錯誤頁", (c) => c.htmlPage(200)],
  ["HTTP 429", (c) => c.rawJson({ status: 200, data: {} }, 429)],
  ["HTTP 503", (c) => c.htmlPage(503)],
  ["非後端格式的 JSON", (c) => c.rawJson({ message: "x" })],
  ["JSON 陣列", (c) => c.rawJson([1, 2])],
  ["後端 BUSY", (c) => c.respond({ status: 503, error: "BUSY" })],
  [
    "後端 SERVER_ERROR",
    (c) => c.respond({ status: 500, error: "SERVER_ERROR" }),
  ],
];
for (const [name, fail] of PLATFORM) {
  await test(`平台-${name}`, async ({ env, api }) => {
    const t = track(api.gameApi.getProfile("test_read"));
    fail(await env.waitCall("get_profile"));
    await settle();
    await env.clock.advance(1000);
    (await env.waitCall("get_profile", 2)).respond({
      status: 200,
      data: { nickname: "x" },
    });
    await settle();
    check(
      `平台-${name}：當成暫時的失敗重試，第二次成功`,
      t.result?.state === "ok" && env.count("get_profile") === 2,
      { state: t.result?.state, count: env.count("get_profile") }
    );
  });
}
await test("平台-用完", async ({ env, api }) => {
  const t = track(api.gameApi.getProfile("test_read"));
  for (let i = 1; i <= 3; i++) {
    (await env.waitCall("get_profile", i)).htmlPage(404);
    await settle();
    await env.clock.advance(i === 1 ? 1000 : 2000);
  }
  const e = t.result?.error;
  check(
    "平台-用完 三次都是 404 錯誤頁：BAD_RESPONSE（不是 PROFILE_NOT_FOUND）",
    e instanceof api.GasTransportError &&
      e.message === "BAD_RESPONSE" &&
      env.count("get_profile") === 3,
    { message: e?.message, count: env.count("get_profile") }
  );
});

// ── 6. 後端明確的回應：不重試，照原樣交給呼叫端 ──
const DEFINITE = [
  "PROFILE_NOT_FOUND",
  "ADMIN_REQUIRED",
  "REV_CONFLICT",
  "DATA_CORRUPT",
  "MISSING_KEY",
  "MAP_NOT_FOUND",
  "MOCK_INJECTED_FAILURE",
];
for (const code of DEFINITE) {
  await test(`明確-${code}`, async ({ env, api }) => {
    const t = track(api.gameApi.getProfile("test_read"));
    (await env.waitCall("get_profile")).respond({
      status: code === "PROFILE_NOT_FOUND" ? 404 : 500,
      error: code,
      rev: 7,
    });
    await settle();
    await env.clock.advance(10000);
    const e = t.result?.error;
    check(
      `明確-${code}：只送一次、丟出 GasError（附後端回應）`,
      t.done &&
        e instanceof api.GasError &&
        e.message === code &&
        e.response?.rev === 7 &&
        env.count("get_profile") === 1,
      { message: e?.message, count: env.count("get_profile") }
    );
  });
}

// ── 7. 寫入：不論哪種失敗都只送一次 ──
const WRITE_FAILS = [
  ["連線失敗", (c) => c.networkError()],
  ["HTML 錯誤頁", (c) => c.htmlPage(404)],
  ["後端 BUSY", (c) => c.respond({ status: 503, error: "BUSY" })],
  [
    "後端 SERVER_ERROR",
    (c) => c.respond({ status: 500, error: "SERVER_ERROR" }),
  ],
];
for (const [action, call] of Object.entries(WRITE_CALLS)) {
  for (const [name, fail] of WRITE_FAILS) {
    await test(`寫入-${action}-${name}`, async ({ env, api }) => {
      const t = track(call(api));
      fail(await env.waitCall(action));
      await settle();
      await env.clock.advance(120000);
      check(
        `寫入-${action}-${name}：只送一次、失敗直接交給呼叫端`,
        t.done && t.result.state === "error" && env.count() === 1,
        { state: t.result?.state, count: env.count() }
      );
    });
  }
  await test(`寫入-${action}-沒有回應`, async ({ env, api }) => {
    const t = track(call(api));
    await env.waitCall(action);
    await env.clock.advance(300000);
    check(
      `寫入-${action}-沒有回應：不設逾時、不重送（結果不明由原本的待確認流程處理）`,
      !t.done && env.count() === 1,
      { done: t.done, count: env.count() }
    );
  });
}

// ── 8. 過期：active 回傳 false 後不再重試 ──
await test("過期-失敗時", async ({ env, api }) => {
  let alive = true;
  const t = track(api.gameApi.getProfile("test_read", { active: () => alive }));
  alive = false;
  (await env.waitCall("get_profile")).networkError();
  await settle();
  const immediate = t.done; // 不等重試間隔
  await env.clock.advance(10000);
  check(
    "過期-1 失敗時已經過期：不重試、不等重試間隔，直接丟出錯誤",
    immediate && t.result?.state === "error" && env.count("get_profile") === 1,
    { immediate, state: t.result?.state, count: env.count("get_profile") }
  );
});
await test("過期-等待中", async ({ env, api }) => {
  let alive = true;
  const t = track(api.gameApi.getProfile("test_read", { active: () => alive }));
  (await env.waitCall("get_profile")).networkError();
  await settle();
  await env.clock.advance(500);
  alive = false; // 等待重試的期間換了帳號
  await env.clock.advance(10000);
  check(
    "過期-2 等待重試期間過期：時間到也不送出",
    t.result?.state === "error" &&
      t.result.error.message === "NETWORK_ERROR" &&
      env.count("get_profile") === 1,
    { state: t.result?.state, count: env.count("get_profile") }
  );
});

// ── 9. 畫面的等待狀態：前景讀取記錄較慢／重試中，結束後清除；背景讀取不記錄 ──
await test("等待狀態", async ({ env, api, wait }) => {
  const S = () => wait.useReadWaitStore.getState();
  const retryOf = () => wait.selectReadRetry(S());
  const slowOf = () => wait.selectReadSlow(S());
  const t = track(api.gameApi.getProfile("test_read", { foreground: true }));
  await env.waitCall("get_profile");
  const start = {
    retry: retryOf(),
    slow: slowOf(),
    n: Object.keys(S().waits).length,
  };
  await env.clock.advance(7999);
  const before8s = slowOf();
  await env.clock.advance(1);
  const after8s = slowOf();
  (await env.waitCall("get_profile")).networkError();
  await settle();
  const retrying = { retry: retryOf(), slow: slowOf() };
  await env.clock.advance(1000);
  const second = await env.waitCall("get_profile", 2);
  await env.clock.advance(8000);
  const slowRetry = { retry: retryOf(), slow: slowOf() };
  second.respond({ status: 200, data: {} });
  await settle();
  const end = Object.keys(S().waits).length;
  check(
    "等待狀態-1 前景讀取：開始時登記、8 秒後標為較慢、失敗後顯示第 1 次重試",
    start.n === 1 &&
      start.retry === 0 &&
      !start.slow &&
      !before8s &&
      after8s &&
      retrying.retry === 1 &&
      !retrying.slow &&
      slowRetry.retry === 1 &&
      slowRetry.slow,
    { start, before8s, after8s, retrying, slowRetry }
  );
  check("等待狀態-2 讀取結束後清除", t.done && end === 0, { end });

  const bg = track(api.gameApi.getProfile("test_read"));
  (await env.waitCall("get_profile", 3)).networkError();
  await settle();
  const bgWaits = Object.keys(S().waits).length;
  await env.clock.advance(1000);
  (await env.waitCall("get_profile", 4)).respond({ status: 200, data: {} });
  await settle();
  check(
    "等待狀態-3 背景讀取（沒有 foreground）：重試照常，但不登記等待狀態",
    bg.result?.state === "ok" && bgWaits === 0,
    { bgWaits, state: bg.result?.state }
  );

  const fail = track(api.gameApi.getAllMaps({ foreground: true }));
  for (let i = 1; i <= 3; i++) {
    (await env.waitCall("get_all_maps", i)).networkError();
    await settle();
    await env.clock.advance(i === 1 ? 1000 : 2000);
  }
  check(
    "等待狀態-4 重試用完而失敗：等待狀態也清除",
    fail.result?.state === "error" && Object.keys(S().waits).length === 0,
    { waits: S().waits }
  );
});

// 過期的讀取（換了帳號、有較新的讀取）請求可能還在等回應，但不再說明它慢或正在重試
await test("等待狀態-過期", async ({ env, api, wait }) => {
  const S = () => wait.useReadWaitStore.getState();
  const now = () => ({
    retry: wait.selectReadRetry(S()),
    slow: wait.selectReadSlow(S()),
    n: Object.keys(S().waits).length,
  });
  // 1. 還不到 8 秒就過期：計時到了也不標為較慢
  let aliveA = true;
  const a = track(
    api.gameApi.getProfile("test_a", {
      foreground: true,
      active: () => aliveA,
    })
  );
  const readA = await env.waitCall("get_profile");
  await env.clock.advance(3000);
  aliveA = false;
  await env.clock.advance(5000);
  const afterTimer = now();
  // 2. 已經說明較慢之後過期：dropStaleReadWaits 立即拿掉；仍有效的讀取不受影響
  let aliveB = true;
  const b = track(
    api.gameApi.getAllMaps({ foreground: true, active: () => aliveB })
  );
  const c = track(api.gameApi.getSettings({ foreground: true }));
  await env.waitCall("get_all_maps");
  await env.waitCall("get_settings");
  await env.clock.advance(8000);
  const bothSlow = now();
  aliveB = false;
  api.dropStaleReadWaits();
  const dropped = now();
  // 3. 等待重試時過期：重試說明拿掉
  let aliveD = true;
  const d = track(
    api.gameApi.getHeroesConfig({ foreground: true, active: () => aliveD })
  );
  (await env.waitCall("get_heroes_config")).networkError();
  await settle();
  const retrying = now();
  aliveD = false;
  api.dropStaleReadWaits();
  const retryDropped = now();
  // 過期的請求之後回來或逾時，等待狀態都不會再出現
  readA.respond({ status: 404, error: "PROFILE_NOT_FOUND" });
  (await env.waitCall("get_all_maps")).respond({ status: 200, maps: [] });
  (await env.waitCall("get_settings")).respond({ status: 200, settings: {} });
  await env.clock.advance(10000);
  check(
    "等待狀態-5 過期之後計時才到：不標為較慢",
    afterTimer.slow === false && afterTimer.n === 0,
    afterTimer
  );
  check(
    "等待狀態-6 已說明較慢後過期：拿掉過期的那一筆，仍有效的讀取照常說明較慢",
    bothSlow.slow && bothSlow.n === 2 && dropped.slow && dropped.n === 1,
    { bothSlow, dropped }
  );
  check(
    "等待狀態-7 等待重試時過期：重試說明拿掉，也不再送出；全部結束後等待狀態清空",
    retrying.retry === 1 &&
      retryDropped.retry === 0 &&
      env.count("get_heroes_config") === 1 &&
      [a, b, c, d].every((t) => t.done) &&
      now().n === 0,
    { retrying, retryDropped, end: now() }
  );
});

// ── 10. 遊戲設定的載入 ──
const CONFIG_ACTIONS = [
  "get_heroes_config",
  "get_enemies_config",
  "get_all_maps",
];
const configReply = (action) =>
  action === "get_heroes_config"
    ? { status: 200, heroes: [{ hero_id: "guan_yu", speed_growth: 0 }] }
    : action === "get_enemies_config"
      ? { status: 200, enemies: [] }
      : { status: 200, maps: [{ map_id: "chapter1_1" }] };
const freshConfigStore = () =>
  require(join(GAME, "store/staticConfigStore.ts")).useStaticConfigStore;

await test("設定-重試成功", async ({ env, wait }) => {
  const store = freshConfigStore();
  const t = track(store.getState().loadConfig());
  for (const a of CONFIG_ACTIONS) await env.waitCall(a);
  (await env.waitCall("get_all_maps")).networkError();
  env.calls
    .filter((c) => !c.settled && c.action !== "get_all_maps")
    .forEach((c) => c.respond(configReply(c.action)));
  await settle();
  const retryShown = wait.selectReadRetry(wait.useReadWaitStore.getState());
  await env.clock.advance(1000);
  (await env.waitCall("get_all_maps", 2)).respond(configReply("get_all_maps"));
  await settle();
  const s = store.getState();
  check(
    "設定-1 一支連線失敗後重試成功：載入完成、沒有錯誤、進度 3／3",
    t.done &&
      !!s.config &&
      s.error === null &&
      s.isLoading === false &&
      s.fetchProgress === 3 &&
      env.count() === 4,
    { error: s.error, progress: s.fetchProgress, count: env.count() }
  );
  check("設定-2 首次載入是玩家在等的讀取：顯示重試中", retryShown === 1, {
    retryShown,
  });
});

await test("設定-失敗", async ({ env }) => {
  const store = freshConfigStore();
  const t = track(store.getState().loadConfig());
  for (const a of CONFIG_ACTIONS) await env.waitCall(a);
  // 英雄表一直連線失敗；其他兩支第一次也連線失敗、等待重試
  (await env.waitCall("get_heroes_config")).networkError();
  (await env.waitCall("get_enemies_config")).networkError();
  (await env.waitCall("get_all_maps")).respond(configReply("get_all_maps"));
  await settle();
  await env.clock.advance(1000);
  (await env.waitCall("get_heroes_config", 2)).networkError();
  const enemiesSecond = await env.waitCall("get_enemies_config", 2);
  await settle();
  await env.clock.advance(2000);
  (await env.waitCall("get_heroes_config", 3)).networkError();
  await settle();
  // 英雄表用完重試、整批失敗：敵人表之後失敗也不再重試
  enemiesSecond.networkError();
  await settle();
  await env.clock.advance(60000);
  const s = store.getState();
  check(
    "設定-3 重試用完：錯誤只留代碼（NETWORK_ERROR），不再停在載入中",
    t.done &&
      s.error === "NETWORK_ERROR" &&
      s.isLoading === false &&
      s.config === null,
    { error: s.error, isLoading: s.isLoading }
  );
  check(
    "設定-4 一支失敗後，其他還在重試的讀取不再送出",
    env.count("get_enemies_config") === 2,
    { enemies: env.count("get_enemies_config") }
  );
});

await test("設定-共用", async ({ env }) => {
  const store = freshConfigStore();
  const a = store.getState().loadConfig();
  const b = store.getState().loadConfig();
  await settle();
  const first = env.count();
  env.calls.forEach((c) => c.respond(configReply(c.action)));
  await Promise.all([a, b]);
  check("設定-5 連續呼叫兩次：共用同一次載入，只送 3 個請求", first === 3, {
    first,
  });
});

await test("設定-作廢", async ({ env }) => {
  const store = freshConfigStore();
  const old = store.getState().loadConfig();
  for (const a of CONFIG_ACTIONS) await env.waitCall(a);
  (await env.waitCall("get_heroes_config")).networkError();
  await settle();
  await env.clock.advance(500);
  // 等待重試期間玩家按了手動同步：舊的讀取作廢
  const fresh = store.getState().refreshConfig();
  for (const a of CONFIG_ACTIONS) await env.waitCall(a, 2);
  await env.clock.advance(5000);
  const oldRetried = env.count("get_heroes_config");
  // 舊讀取還沒回應的兩支，比新的晚回來、內容是舊的
  env.calls
    .filter((c) => !c.settled && c.at === 0)
    .forEach((c) =>
      c.respond(
        c.action === "get_all_maps"
          ? { status: 200, maps: [{ map_id: "OLD" }] }
          : configReply(c.action)
      )
    );
  env.calls
    .filter((c) => !c.settled)
    .forEach((c) => c.respond(configReply(c.action)));
  await Promise.all([old, fresh]);
  await settle();
  const s = store.getState();
  check(
    "設定-6 較新的讀取開始後，舊讀取不再重試、它的回應不蓋掉新的設定",
    oldRetried === 2 &&
      s.config?.maps?.[0]?.map_id === "chapter1_1" &&
      s.error === null &&
      s.isLoading === false,
    { oldRetried, map: s.config?.maps?.[0]?.map_id, error: s.error }
  );
});

await test("設定-後端拒絕", async ({ env }) => {
  const store = freshConfigStore();
  const t = track(store.getState().loadConfig());
  for (const a of CONFIG_ACTIONS) await env.waitCall(a);
  (await env.waitCall("get_all_maps")).respond({
    status: 500,
    error: "MOCK_INJECTED_FAILURE",
  });
  await settle();
  await env.clock.advance(60000);
  check(
    "設定-7 後端明確的錯誤：不重試，錯誤代碼照原樣（之後由玩家按重試）",
    t.done &&
      store.getState().error === "MOCK_INJECTED_FAILURE" &&
      env.count("get_all_maps") === 1,
    { error: store.getState().error, count: env.count("get_all_maps") }
  );
});

const failed = results.filter((r) => !r.ok);
console.log(
  "RESULT_JSON " +
    JSON.stringify({ total: results.length, failed: failed.length, results })
);
process.exit(failed.length ? 1 : 0);
