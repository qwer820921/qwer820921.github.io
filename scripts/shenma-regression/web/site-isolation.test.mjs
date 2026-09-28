// 跨來源隔離開機腳本（src/utils/siteIsolation/boot.ts）與神馬三國復原判斷的測試，不需要瀏覽器
// - 用專案內的 TypeScript 即時轉譯，在 Node 內用假的 window（location、兩種 storage、Service Worker）執行
// - 驗證「先備份再離開隔離、只採用自己那一筆、只移除經辨識的舊註冊、每一種重新載入都不會重複」
// - 真實瀏覽器的切換行為（sessionStorage 兩份、實際 SW）由 r13-web.js 驗證
// 用法：node scripts/shenma-regression/web/site-isolation.test.mjs
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

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

const { siteIsolationBoot } = require(
  join(ROOT, "src/utils/siteIsolation/boot.ts")
);
const { findIsolationRecovery } = require(
  join(ROOT, "src/app/(games)/shenmaSanguo/utils/isolationRecovery.ts")
);

// ── 假環境 ─────────────────────────────────────────────────────
class MemStorage {
  // throws：所有讀寫都拋出；failKeys：只有寫入這些項目時拋出（模擬 QuotaExceededError）
  constructor(init = {}, { throws = false, failKeys = [] } = {}) {
    this.m = new Map(Object.entries(init));
    this.throws = throws;
    this.failKeys = new Set(failKeys);
  }
  get length() {
    return this.m.size;
  }
  key(i) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k) {
    if (this.throws) throw new Error("storage denied");
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    if (this.throws) throw new Error("storage denied");
    if (this.failKeys.has(k)) throw new Error("QuotaExceededError");
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
}

const ORIGIN = "https://site.test";
const K = "shenma_player_state";
const COI = ORIGIN + "/coi-serviceworker.js";
const worker = (scriptURL) => ({
  scriptURL,
  state: "activated",
  addEventListener() {},
});
const reg = (scope, scriptURL, opts = {}) => ({
  scope: ORIGIN + scope,
  active: worker(scriptURL),
  waiting: null,
  installing: null,
  unregistered: false,
  unregister() {
    this.unregistered = true;
    return opts.unregister ? opts.unregister() : Promise.resolve(true);
  },
});
const legacy = (opts) => reg("/", COI, opts);
const godot = () =>
  reg(
    "/games/shenmaSanguo/",
    ORIGIN + "/games/shenmaSanguo/index.service.worker.js"
  );

function env({
  path = "/shenmaSanguo",
  iso = false,
  session = {},
  local = {},
  regs = [],
  sw = true,
  lsThrows = false,
  ssFail = [],
  lsFail = [],
  register,
  getRegistrations,
} = {}) {
  const ss = new MemStorage(session, { failKeys: ssFail });
  const ls = new MemStorage(local, { throws: lsThrows, failKeys: lsFail });
  const e = { replaced: [], historyUrls: [], registered: [], regs };
  let href = ORIGIN + path;
  const location = {
    get href() {
      return href;
    },
    get origin() {
      return ORIGIN;
    },
    get pathname() {
      return new URL(href).pathname;
    },
    replace(u) {
      e.replaced.push(u);
    },
  };
  const container = {
    controller: null,
    getRegistrations:
      getRegistrations || (async () => regs.filter((r) => !r.unregistered)),
    register:
      register ||
      (async (script, opts) => {
        e.registered.push({ script, scope: opts && opts.scope });
        const r = reg(opts.scope, ORIGIN + script);
        regs.push(r);
        return r;
      }),
  };
  e.w = {
    location,
    history: {
      state: { next: 1 },
      replaceState(state, _t, u) {
        e.historyUrls.push(u);
        e.historyState = state;
        href = new URL(u, href).href;
      },
    },
    crossOriginIsolated: iso,
    isSecureContext: true,
    sessionStorage: ss,
    localStorage: ls,
    navigator: sw ? { serviceWorker: container } : {},
  };
  e.ss = ss;
  e.ls = ls;
  e.setPath = (p) => {
    href = ORIGIN + p;
  };
  e.boot = () => {
    siteIsolationBoot(e.w);
    return e.w.__siteIsolation;
  };
  return e;
}
const tick = () => new Promise((r) => setImmediate(r));
async function settle(n = 30) {
  for (let i = 0; i < n; i++) await tick();
}
const recs = (ls) =>
  [...ls.m.keys()].filter((k) => k.startsWith("__site_iso_mig:"));
const recovery = (ls) => JSON.parse(ls.m.get("__site_iso_recovery") || "[]");
const tab = (ss) => JSON.parse(ss.m.get("__site_iso_tab") || "null");
const trusted = (ss) => !!tab(ss) && tab(ss).trusted === true;
// 同一個分頁的下一次載入：沿用兩種 storage 的內容
const nextLoad = (e, opts = {}) =>
  env({
    session: Object.fromEntries(e.ss.m),
    local: Object.fromEntries(e.ls.m),
    ...opts,
  });
// 查詢舊註冊：依序回傳（"reject"、"hang"、或註冊陣列），用完後沿用最後一個；記錄呼叫次數
const lookups = (...seq) => {
  const f = () => {
    f.calls += 1;
    const r = seq[Math.min(f.calls - 1, seq.length - 1)];
    if (r === "reject") return Promise.reject(new Error("lookup failed"));
    if (r === "hang") return new Promise(() => {});
    return Promise.resolve(r.filter((x) => !x.unregistered));
  };
  f.calls = 0;
  return f;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const player = (key, team, extra = {}) =>
  JSON.stringify({
    key,
    nickname: "測試",
    gold: 100,
    heroes: [],
    team: team.map((h, i) => ({ hero_id: h, slot: i + 1 })),
    rev: 0,
    syncedRev: 0,
    ...extra,
  });

// ── 測試 ───────────────────────────────────────────────────────
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, pass: true });
    console.log("PASS", name);
  } catch (e) {
    results.push({ name, pass: false, error: String(e && e.message) });
    console.log("FAIL", name, "—", e && e.message);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const ISO_VALUE = player("test_k", ["zhao_yun"], { rev: 1, syncedRev: 0 });
const OLD_VALUE = player("test_k", ["guan_yu"], { rev: 1, syncedRev: 0 });

await test("SI-1 舊根目錄 SW 的隔離頁：先備份 session，只移除舊的 coi 註冊（遊戲 SW 不動），再帶遷移編號重新載入", async () => {
  const L = legacy();
  const G = godot();
  const e = env({ iso: true, session: { [K]: ISO_VALUE }, regs: [L, G] });
  const api = e.boot();
  assert(api.phase === "leaving", "phase " + api.phase);
  assert(!api.usable("/shenmaSanguo"), "離開前不能使用 session");
  await settle();
  assert(L.unregistered && !G.unregistered, "只移除舊的 coi 註冊");
  assert(
    e.replaced.length === 1 && /[?&]__iso_mig=/.test(e.replaced[0]),
    "帶遷移編號重新載入 " + e.replaced
  );
  const id = new URL(e.replaced[0], ORIGIN).searchParams.get("__iso_mig");
  const r = JSON.parse(e.ls.getItem("__site_iso_mig:" + id));
  assert(r.entries[K] === ISO_VALUE, "備份的是隔離那一份");
  assert(e.ls.getItem("__site_iso_retired"), "記下移除過舊註冊");
});

await test("SI-2 帶遷移編號的非隔離頁：採用那一筆備份，取代舊的非隔離暫存（留在復原區 replaced），移除網址標記", async () => {
  const e = env({
    path: "/shenmaSanguo?__iso_mig=m1&map=x",
    session: { [K]: OLD_VALUE },
    local: {
      "__site_iso_mig:m1": JSON.stringify({
        v: 1,
        id: "m1",
        at: Date.now(),
        entries: { [K]: ISO_VALUE },
      }),
      "__site_iso_mig:other": JSON.stringify({
        v: 1,
        id: "other",
        at: Date.now(),
        entries: { [K]: "OTHER" },
      }),
    },
  });
  const api = e.boot();
  assert(
    e.historyUrls[0] === "/shenmaSanguo?map=x",
    "移除標記、保留其他參數 " + e.historyUrls[0]
  );
  assert(
    e.historyState && e.historyState.next === 1,
    "保留原本的 history.state"
  );
  await settle();
  assert(e.ss.getItem(K) === ISO_VALUE, "session 換成備份");
  assert(
    api.phase === "ready" && api.usable("/shenmaSanguo"),
    "phase " + api.phase
  );
  const rec = recovery(e.ls);
  assert(
    rec.length === 1 &&
      rec[0].reason === "replaced" &&
      rec[0].value === OLD_VALUE,
    "舊的非隔離暫存留在復原區"
  );
  assert(!e.ls.getItem("__site_iso_mig:m1"), "採用的備份已刪除");
  assert(e.ls.getItem("__site_iso_mig:other"), "其他分頁的備份不採用、不刪除");
  assert(tab(e.ss) && tab(e.ss).id === api.tabId, "寫入分頁識別");
  assert(e.replaced.length === 0, "沒有再重新載入");
});

await test("SI-3 帶遷移編號回來仍是隔離：停止（failed），不再重新載入，刪除那一筆備份，照舊使用隔離那一份", async () => {
  const e = env({
    path: "/shenmaSanguo?__iso_mig=m2",
    iso: true,
    session: { [K]: ISO_VALUE },
    regs: [legacy()],
    local: {
      "__site_iso_mig:m2": JSON.stringify({
        v: 1,
        id: "m2",
        at: Date.now(),
        entries: { [K]: ISO_VALUE },
      }),
    },
  });
  const api = e.boot();
  await settle();
  assert(
    api.phase === "failed" && api.usable("/shenmaSanguo"),
    "phase " + api.phase
  );
  assert(e.replaced.length === 0, "沒有重新載入");
  assert(recs(e.ls).length === 0, "備份已刪除");
  assert(e.ss.getItem(K) === ISO_VALUE, "session 不動");
  // 同一個分頁再載入：不再嘗試
  const e2 = env({
    iso: true,
    session: { [K]: ISO_VALUE, __site_iso_leave_failed: "1" },
    regs: [legacy()],
  });
  const api2 = e2.boot();
  await settle();
  assert(
    api2.phase === "failed" &&
      e2.replaced.length === 0 &&
      recs(e2.ls).length === 0,
    "失敗過的分頁不再嘗試"
  );
});

await test("SI-4 移除舊註冊失敗：不重新載入（failed），刪除備份", async () => {
  const e = env({
    iso: true,
    session: { [K]: ISO_VALUE },
    regs: [legacy({ unregister: () => Promise.reject(new Error("x")) })],
  });
  const api = e.boot();
  await settle();
  assert(
    api.phase === "failed" &&
      e.replaced.length === 0 &&
      recs(e.ls).length === 0,
    "phase " + api.phase
  );
  const e2 = env({
    iso: true,
    session: { [K]: ISO_VALUE },
    regs: [legacy({ unregister: () => Promise.resolve(false) })],
  });
  const api2 = e2.boot();
  await settle();
  assert(
    api2.phase === "failed" && e2.replaced.length === 0,
    "回報 false 也視為失敗"
  );
});

await test("SI-5 localStorage 無法寫入：不備份就不離開隔離（failed，不重新載入、不移除舊註冊）", async () => {
  const L = legacy();
  const e = env({
    iso: true,
    session: { [K]: ISO_VALUE },
    regs: [L],
    lsThrows: true,
  });
  const api = e.boot();
  await settle();
  assert(
    api.phase === "failed" && e.replaced.length === 0 && !L.unregistered,
    "phase " + api.phase
  );
});

await test("SI-6 強制重新整理（非隔離、舊 SW 還在、分頁未確認）且非隔離那一份沒有資料：先回到隔離狀態備份", async () => {
  const L = legacy();
  const e = env({ regs: [L] });
  const api = e.boot();
  await settle();
  assert(
    api.phase === "leaving" && !api.usable("/shenmaSanguo"),
    "phase " + api.phase
  );
  assert(
    e.replaced.length === 1 && /__iso_hop=1/.test(e.replaced[0]),
    "帶標記回到隔離 " + e.replaced
  );
  assert(!L.unregistered, "這時不移除舊註冊（要靠它回到隔離）");
});

await test("SI-7 回到隔離的標記回來仍是非隔離：不再來回，移除舊註冊後以非隔離使用", async () => {
  const L = legacy();
  const e = env({ path: "/shenmaSanguo?__iso_hop=1", regs: [L] });
  const api = e.boot();
  await settle();
  assert(
    api.phase === "ready" && e.replaced.length === 0 && L.unregistered,
    "phase " + api.phase
  );
});

await test("SI-8 強制重新整理且非隔離那一份有資料：不回到隔離（會被它蓋掉），移除舊註冊，暫存移到復原區（unverified）、不留在 session", async () => {
  const L = legacy();
  const e = env({ session: { [K]: OLD_VALUE }, regs: [L] });
  const api = e.boot();
  await settle();
  assert(
    api.phase === "ready" && e.replaced.length === 0 && L.unregistered,
    "phase " + api.phase
  );
  assert(e.ss.getItem(K) === null, "session 不再有這份暫存");
  const rec = recovery(e.ls);
  assert(
    rec.length === 1 &&
      rec[0].reason === "unverified" &&
      rec[0].value === OLD_VALUE &&
      rec[0].tab === api.tabId,
    "復原區 " + JSON.stringify(rec)
  );
  assert(tab(e.ss).id === api.tabId, "分頁已確認");
});

await test("SI-9 已確認的分頁：非隔離那一份直接信任（舊註冊仍在時只移除它，不動資料、不回到隔離）", async () => {
  const L = legacy();
  const e = env({
    session: {
      [K]: OLD_VALUE,
      __site_iso_tab: JSON.stringify({ v: 1, id: "t1" }),
    },
    regs: [L],
  });
  const api = e.boot();
  await settle();
  assert(
    api.phase === "ready" &&
      api.tabId === "t1" &&
      e.ss.getItem(K) === OLD_VALUE &&
      L.unregistered &&
      e.replaced.length === 0,
    "phase " + api.phase
  );
  assert(recovery(e.ls).length === 0, "沒有復原項目");
});

await test("SI-10 沒有舊註冊、分頁未確認、session 有資料：這個瀏覽器從沒移除過舊註冊時信任（例如不支援 SW），移除過時不信任", async () => {
  const e = env({ session: { [K]: OLD_VALUE }, sw: false });
  const api = e.boot();
  await settle();
  assert(
    api.phase === "ready" &&
      e.ss.getItem(K) === OLD_VALUE &&
      recovery(e.ls).length === 0,
    "沒有舊網站的跡象時信任"
  );
  const e2 = env({
    session: { [K]: OLD_VALUE },
    local: { __site_iso_retired: String(Date.now()) },
  });
  const api2 = e2.boot();
  await settle();
  assert(
    api2.phase === "ready" &&
      e2.ss.getItem(K) === null &&
      recovery(e2.ls)[0].reason === "unverified",
    "其他分頁已遷移時，這個舊分頁的暫存不自動採用"
  );
});

await test("SI-11 新使用者：非隔離、沒有任何註冊與資料 → 直接可用，不重新載入", async () => {
  const e = env();
  const api = e.boot();
  assert(
    api.phase === "checking" && !api.usable("/shenmaSanguo"),
    "確認中不能使用"
  );
  await settle();
  assert(
    api.phase === "ready" &&
      api.usable("/shenmaSanguo") &&
      e.replaced.length === 0 &&
      e.registered.length === 0,
    "phase " + api.phase
  );
});

await test("SI-12 bgRemover（非隔離）：註冊範圍只有 /bgRemover 的 coi SW，啟用後帶標記重新載入；帶標記回來仍非隔離就停止", async () => {
  const e = env({ path: "/bgRemover" });
  const api = e.boot();
  await settle();
  assert(
    e.registered.length === 1 &&
      e.registered[0].scope === "/bgRemover" &&
      e.registered[0].script === "/coi-serviceworker.js",
    JSON.stringify(e.registered)
  );
  assert(
    api.phase === "entering" &&
      e.replaced.length === 1 &&
      /__iso_enter=1/.test(e.replaced[0]),
    "phase " + api.phase
  );
  const e2 = env({ path: "/bgRemover?__iso_enter=1" });
  const api2 = e2.boot();
  await settle();
  assert(
    api2.phase === "unavailable" &&
      e2.replaced.length === 0 &&
      e2.registered.length === 0 &&
      api2.usable("/bgRemover"),
    "phase " + api2.phase
  );
  const e3 = env({
    path: "/bgRemover",
    register: () => Promise.reject(new Error("fetch failed")),
  });
  const api3 = e3.boot();
  await settle();
  assert(
    api3.phase === "unavailable" && e3.replaced.length === 0,
    "註冊失敗 " + api3.phase
  );
  const e4 = env({ path: "/bgRemover", sw: false });
  const api4 = e4.boot();
  await settle();
  assert(
    api4.phase === "unavailable" && e4.replaced.length === 0,
    "不支援 SW " + api4.phase
  );
});

await test("SI-13 bgRemover（隔離，含舊根目錄 SW）：直接可用，不遷移；SPA 換到其他頁時才先備份再離開", async () => {
  const L = legacy();
  const e = env({
    path: "/bgRemover",
    iso: true,
    session: { [K]: ISO_VALUE },
    regs: [L],
  });
  const api = e.boot();
  await settle();
  assert(
    api.phase === "ready" &&
      api.usable("/bgRemover") &&
      e.replaced.length === 0 &&
      !L.unregistered,
    "phase " + api.phase
  );
  assert(!api.usable("/shenmaSanguo"), "隔離狀態下其他路徑不能使用 session");
  e.setPath("/shenmaSanguo");
  api.check("/shenmaSanguo");
  assert(api.phase === "leaving", "phase " + api.phase);
  await settle();
  assert(
    L.unregistered &&
      e.replaced.length === 1 &&
      /^\/shenmaSanguo\?__iso_mig=/.test(e.replaced[0]),
    e.replaced[0]
  );
  const id = new URL(e.replaced[0], ORIGIN).searchParams.get("__iso_mig");
  assert(
    JSON.parse(e.ls.getItem("__site_iso_mig:" + id)).entries[K] === ISO_VALUE,
    "備份隔離那一份"
  );
});

await test("SI-14 SPA 從一般頁進入 bgRemover：check 觸發進入隔離；unavailable 之後不再重試", async () => {
  const e = env({ path: "/" });
  const api = e.boot();
  await settle();
  assert(api.phase === "ready", "phase " + api.phase);
  e.setPath("/bgRemover");
  api.check("/bgRemover");
  await settle();
  assert(
    e.registered.length === 1 && e.replaced.length === 1,
    "進入 " + e.replaced
  );
  const e2 = env({ path: "/", register: () => Promise.reject(new Error("x")) });
  const api2 = e2.boot();
  await settle();
  e2.setPath("/bgRemover");
  api2.check("/bgRemover");
  await settle();
  api2.check("/bgRemover");
  await settle();
  assert(
    api2.phase === "unavailable" && e2.replaced.length === 0,
    "phase " + api2.phase
  );
});

await test("SI-15 備份與復原區的清理：過期的備份與復原項目（都是 7 天）、未知版本移除；最多保留 20 筆", async () => {
  const old = Date.now() - 8 * 24 * 3600 * 1000;
  const entries = [];
  for (let i = 0; i < 25; i++)
    entries.push({
      v: 1,
      id: "r" + i,
      at: Date.now() - i,
      tab: "t",
      reason: "replaced",
      key: K,
      value: "x",
    });
  entries.push({
    v: 1,
    id: "expired",
    at: Date.now() - 8 * 24 * 3600 * 1000,
    tab: "t",
    reason: "unverified",
    key: K,
    value: "x",
  });
  entries.push({
    v: 2,
    id: "future",
    at: Date.now(),
    tab: "t",
    reason: "unverified",
    key: K,
    value: "x",
  });
  const e = env({
    local: {
      "__site_iso_mig:old": JSON.stringify({
        v: 1,
        id: "old",
        at: old,
        entries: {},
      }),
      "__site_iso_mig:new": JSON.stringify({
        v: 1,
        id: "new",
        at: Date.now(),
        entries: {},
      }),
      "__site_iso_mig:bad": "{",
      __site_iso_recovery: JSON.stringify(entries),
    },
  });
  e.boot();
  await settle();
  assert(
    JSON.stringify(recs(e.ls)) === JSON.stringify(["__site_iso_mig:new"]),
    "備份 " + recs(e.ls)
  );
  const rec = recovery(e.ls);
  assert(
    rec.length === 20 &&
      !rec.some((x) => x.id === "expired" || x.id === "future"),
    "復原區 " + rec.length
  );
});

await test("SI-16 查詢舊註冊一直逾時（重試後仍然如此）：未確認的分頁停在 uncertain、不可使用、不寫確認標記；已確認的分頁照常", async () => {
  const look = lookups("hang");
  const e = env({ getRegistrations: look });
  const api = e.boot();
  await sleep(3 * 3000 + 3000 + 500);
  await settle();
  assert(
    api.phase === "uncertain" && api.problem === "lookup-failed",
    "phase " + api.phase
  );
  assert(
    !api.usable("/shenmaSanguo") && !trusted(e.ss) && look.calls === 3,
    "calls " + look.calls
  );
  const e2 = env({
    getRegistrations: lookups("hang"),
    session: {
      __site_iso_tab: JSON.stringify({ v: 1, id: "t1", trusted: true }),
      [K]: OLD_VALUE,
    },
  });
  const api2 = e2.boot();
  await sleep(3 * 3000 + 3000 + 500);
  await settle();
  assert(
    api2.phase === "ready" &&
      api2.usable("/shenmaSanguo") &&
      e2.ss.getItem(K) === OLD_VALUE,
    "已確認的分頁 " + api2.phase
  );
});

await test("SI-19 C13-1 查詢舊註冊一直失敗、session 有舊的未同步資料：不信任、不可使用、不寫確認標記、資料原封不動", async () => {
  const look = lookups("reject");
  const e = env({
    session: { [K]: OLD_VALUE },
    regs: [legacy()],
    getRegistrations: look,
  });
  const api = e.boot();
  await sleep(3500);
  await settle();
  assert(
    api.phase === "uncertain" &&
      api.problem === "lookup-failed" &&
      !api.usable("/shenmaSanguo"),
    "phase " + api.phase
  );
  assert(
    !trusted(e.ss) &&
      e.ss.getItem(K) === OLD_VALUE &&
      recovery(e.ls).length === 0 &&
      look.calls === 3,
    "calls " + look.calls
  );
  assert(
    e.replaced.length === 0 && !e.regs[0].unregistered,
    "沒有重新載入、沒有移除註冊"
  );
});

await test("SI-20 C13-1 查詢失敗後重試成功：照一般規則處理（舊註冊還在 → 暫存移到復原區、移除舊註冊、分頁確認）", async () => {
  const L = legacy();
  const look = lookups("reject", [L]);
  const e = env({
    session: { [K]: OLD_VALUE },
    regs: [L],
    getRegistrations: look,
  });
  const api = e.boot();
  await sleep(1500);
  await settle();
  assert(
    api.phase === "ready" && api.problem === null && look.calls === 2,
    "phase " + api.phase + " calls " + look.calls
  );
  assert(
    L.unregistered &&
      e.ss.getItem(K) === null &&
      recovery(e.ls)[0].reason === "unverified" &&
      trusted(e.ss) &&
      api.lostCopy,
    "處理結果"
  );
});

await test("SI-21 C13-1 查不到時玩家改用雲端存檔繼續：暫存移到復原區、分頁標成遷移狀態不明並確認、可以使用；重新整理後仍是遷移狀態不明", async () => {
  const e = env({
    session: { [K]: OLD_VALUE },
    getRegistrations: lookups("reject"),
  });
  const api = e.boot();
  await sleep(3500);
  await settle();
  assert(api.phase === "uncertain", "phase " + api.phase);
  api.continueWithCloud();
  assert(
    api.phase === "ready" &&
      api.problem === null &&
      api.usable("/shenmaSanguo"),
    "phase " + api.phase
  );
  assert(
    e.ss.getItem(K) === null &&
      recovery(e.ls)[0].value === OLD_VALUE &&
      trusted(e.ss) &&
      api.lostCopy,
    "復原區與標記"
  );
  const e2 = nextLoad(e, { getRegistrations: lookups([]) });
  const api2 = e2.boot();
  await settle();
  assert(
    api2.phase === "ready" && api2.lostCopy && api2.tabId === api.tabId,
    "下一次載入 " + api2.phase
  );
});

await test("SI-22 C13-2 備份寫不回 session：保留備份、編號記進分頁紀錄（網址標記移除）、不可信、不寫確認標記；下一次載入寫得進去時採用並刪除備份", async () => {
  const backup = JSON.stringify({
    v: 1,
    id: "m9",
    at: Date.now(),
    entries: { [K]: ISO_VALUE },
  });
  const e = env({
    path: "/shenmaSanguo?__iso_mig=m9",
    session: { [K]: OLD_VALUE },
    local: { "__site_iso_mig:m9": backup },
    ssFail: [K],
  });
  const api = e.boot();
  await settle();
  assert(
    api.problem === "restore-failed" && api.untrusted.includes(K),
    "problem " + api.problem
  );
  assert(e.ls.getItem("__site_iso_mig:m9") === backup, "備份保留");
  assert(
    tab(e.ss).pendingClaim === "m9" && !trusted(e.ss),
    "分頁紀錄 " + JSON.stringify(tab(e.ss))
  );
  assert(
    e.historyUrls.at(-1) === "/shenmaSanguo" && e.ss.getItem(K) === OLD_VALUE,
    "網址標記移除、session 不動"
  );
  assert(
    recovery(e.ls).some(
      (x) => x.reason === "replaced" && x.value === OLD_VALUE
    ) && !api.lostCopy,
    "被取代的舊值已保存；不是遷移狀態不明"
  );
  const e2 = nextLoad(e);
  const api2 = e2.boot();
  await settle();
  assert(
    api2.problem === null &&
      api2.phase === "ready" &&
      e2.ss.getItem(K) === ISO_VALUE,
    "採用 " + api2.problem
  );
  assert(
    !e2.ls.getItem("__site_iso_mig:m9") &&
      tab(e2.ss).pendingClaim === undefined &&
      trusted(e2.ss),
    "備份刪除、紀錄清除"
  );
});

await test("SI-23 C13-2 被取代的舊值存不進復原區：不覆蓋 session、保留備份（不抹除任何一份）", async () => {
  const backup = JSON.stringify({
    v: 1,
    id: "m8",
    at: Date.now(),
    entries: { [K]: ISO_VALUE },
  });
  const e = env({
    path: "/shenmaSanguo?__iso_mig=m8",
    session: { [K]: OLD_VALUE },
    local: { "__site_iso_mig:m8": backup },
    lsFail: ["__site_iso_recovery"],
  });
  const api = e.boot();
  await settle();
  assert(
    api.problem === "restore-failed" &&
      e.ss.getItem(K) === OLD_VALUE &&
      e.ls.getItem("__site_iso_mig:m8") === backup,
    "problem " + api.problem
  );
});

await test("SI-24 C13-2 分頁紀錄也寫不進去：網址上的遷移編號保留，重新整理後仍找得到那一筆", async () => {
  const backup = JSON.stringify({
    v: 1,
    id: "m7",
    at: Date.now(),
    entries: { [K]: ISO_VALUE },
  });
  const e = env({
    path: "/shenmaSanguo?__iso_mig=m7&x=1",
    session: { [K]: OLD_VALUE },
    local: { "__site_iso_mig:m7": backup },
    ssFail: [K, "__site_iso_tab"],
  });
  const api = e.boot();
  await settle();
  assert(
    api.problem === "restore-failed" &&
      e.ls.getItem("__site_iso_mig:m7") === backup,
    "problem " + api.problem
  );
  assert(
    !e.historyUrls.some((u) => !/__iso_mig=m7/.test(u)),
    "網址 " + JSON.stringify(e.historyUrls)
  );
});

await test("SI-25 C13-2 寫回失敗時就算有舊註冊，也不把 session 的舊值當成無法確認的暫存（不是遷移狀態不明）", async () => {
  const L = legacy();
  const backup = JSON.stringify({
    v: 1,
    id: "m6",
    at: Date.now(),
    entries: { [K]: ISO_VALUE },
  });
  const e = env({
    path: "/shenmaSanguo?__iso_mig=m6",
    session: { [K]: OLD_VALUE },
    local: { "__site_iso_mig:m6": backup },
    regs: [L],
    ssFail: [K],
  });
  const api = e.boot();
  await settle();
  assert(
    api.problem === "restore-failed" &&
      !api.lostCopy &&
      e.ss.getItem(K) === OLD_VALUE &&
      !recovery(e.ls).some((x) => x.reason === "unverified"),
    JSON.stringify(recovery(e.ls))
  );
});

await test("SI-26 C13-1 在原頁面重試（不重新載入）：查詢恢復後照一般規則處理；分頁紀錄的 uncertain 清除", async () => {
  const look = lookups("reject", "reject", "reject", []);
  const e = env({ session: { [K]: OLD_VALUE }, getRegistrations: look });
  const api = e.boot();
  await sleep(3500);
  await settle();
  assert(
    api.phase === "uncertain" && tab(e.ss).uncertain === true && !trusted(e.ss),
    "phase " + api.phase
  );
  api.retry();
  await settle();
  assert(
    api.phase === "ready" &&
      api.problem === null &&
      e.replaced.length === 0 &&
      look.calls === 4,
    "phase " + api.phase + " calls " + look.calls
  );
  assert(
    trusted(e.ss) &&
      tab(e.ss).uncertain === undefined &&
      e.ss.getItem(K) === OLD_VALUE,
    "從沒有過舊註冊：信任 " + JSON.stringify(tab(e.ss))
  );
});

await test("SI-27 C13-1 停在 uncertain 後仍被舊 SW 帶回隔離狀態（例如自己重新整理）：備份標成可疑，非隔離頁不採用，連同舊暫存放進復原區", async () => {
  const L = legacy();
  const e1 = env({
    session: { [K]: OLD_VALUE },
    regs: [L],
    getRegistrations: lookups("reject"),
  });
  e1.boot();
  await sleep(3500);
  await settle();
  // 重新整理經過舊 SW：隔離頁看到的 session 已被非隔離那一份（含分頁紀錄的 uncertain）套用
  const e2 = env({
    iso: true,
    session: Object.fromEntries(e1.ss.m),
    local: Object.fromEntries(e1.ls.m),
    regs: [L],
  });
  const api2 = e2.boot();
  await settle();
  assert(
    api2.phase === "leaving" && e2.replaced.length === 1,
    "phase " + api2.phase
  );
  const id = new URL(e2.replaced[0], ORIGIN).searchParams.get("__iso_mig");
  assert(
    JSON.parse(e2.ls.getItem("__site_iso_mig:" + id)).suspect === true,
    "備份標成可疑"
  );
  const e3 = env({
    path: "/shenmaSanguo?__iso_mig=" + id,
    session: Object.fromEntries(e1.ss.m),
    local: Object.fromEntries(e2.ls.m),
    getRegistrations: lookups([]),
  });
  const api3 = e3.boot();
  await settle();
  assert(
    api3.phase === "ready" &&
      api3.problem === null &&
      e3.ss.getItem(K) === null,
    "不採用 " + e3.ss.getItem(K)
  );
  assert(
    recovery(e3.ls).some(
      (x) => x.reason === "unverified" && x.value === OLD_VALUE
    ) &&
      api3.lostCopy &&
      trusted(e3.ss),
    "復原區與遷移狀態不明"
  );
  assert(recs(e3.ls).length === 0, "備份已處理");
});

await test("SI-28 C13-2 在原頁面重試：儲存空間恢復後採用分頁紀錄裡的備份", async () => {
  const backup = JSON.stringify({
    v: 1,
    id: "m5",
    at: Date.now(),
    entries: { [K]: ISO_VALUE },
  });
  const e = env({
    path: "/shenmaSanguo?__iso_mig=m5",
    session: { [K]: OLD_VALUE },
    local: { "__site_iso_mig:m5": backup },
    ssFail: [K],
  });
  const api = e.boot();
  await settle();
  assert(api.problem === "restore-failed", "problem " + api.problem);
  api.retry();
  await settle();
  assert(
    api.problem === "restore-failed" &&
      e.ls.getItem("__site_iso_mig:m5") === backup,
    "還寫不進去時維持"
  );
  e.ss.failKeys.clear();
  api.retry();
  await settle();
  assert(
    api.problem === null &&
      api.phase === "ready" &&
      e.ss.getItem(K) === ISO_VALUE &&
      !e.ls.getItem("__site_iso_mig:m5") &&
      trusted(e.ss),
    "採用 " + api.problem
  );
  assert(e.replaced.length === 0, "沒有重新載入");
});

await test("SI-29 C13-1 停在 uncertain 後被帶回隔離、而且離開隔離也失敗：隔離那一份不照舊使用，放進復原區並標成遷移狀態不明", async () => {
  const L = legacy();
  const e1 = env({
    session: { [K]: OLD_VALUE },
    regs: [L],
    getRegistrations: lookups("reject"),
  });
  e1.boot();
  await sleep(3500);
  await settle();
  // 帶著遷移編號回來仍是隔離（查詢一直失敗，舊註冊移不掉）
  const e2 = env({
    path: "/shenmaSanguo?__iso_mig=gone",
    iso: true,
    session: Object.fromEntries(e1.ss.m),
    local: Object.fromEntries(e1.ls.m),
    regs: [L],
    getRegistrations: lookups("reject"),
  });
  const api2 = e2.boot();
  await settle();
  assert(
    api2.phase === "failed" && e2.replaced.length === 0,
    "phase " + api2.phase
  );
  assert(
    e2.ss.getItem(K) === null &&
      recovery(e2.ls).some(
        (x) => x.reason === "unverified" && x.value === OLD_VALUE
      ),
    "放進復原區"
  );
  assert(
    api2.lostCopy &&
      api2.usable("/shenmaSanguo") &&
      tab(e2.ss).uncertain === undefined,
    "遷移狀態不明 " + JSON.stringify(tab(e2.ss))
  );
});

await test("SI-17 復原區移除會通知訂閱者；已有 __siteIsolation 時不重複執行", async () => {
  const e = env({
    local: {
      __site_iso_recovery: JSON.stringify([
        {
          v: 1,
          id: "a",
          at: Date.now(),
          tab: "t",
          reason: "unverified",
          key: K,
          value: "x",
        },
      ]),
    },
  });
  const api = e.boot();
  await settle();
  let n = 0;
  const off = api.subscribe(() => n++);
  api.recovery.remove(["a"]);
  off();
  api.recovery.remove(["a"]);
  assert(n === 1 && api.recovery.list().length === 0, "通知 " + n);
  siteIsolationBoot(e.w);
  assert(e.w.__siteIsolation === api, "沒有重建");
});

await test("SI-18 開機函式可以單獨序列化執行（layout 用 toString 放進 HTML，不能引用外部變數）", async () => {
  const src = `(${siteIsolationBoot.toString()})(window)`;
  const e = env({ path: "/" });
  new Function("window", src)(e.w);
  await settle();
  assert(e.w.__siteIsolation && e.w.__siteIsolation.phase === "ready", "phase");
});

// ── 神馬三國：復原提示的判斷 ──
const entry = (id, tabId, value, reason = "unverified") => ({
  v: 1,
  id,
  at: Date.now(),
  tab: tabId,
  reason,
  key: K,
  value,
});
await test("SR-1 只顯示這個分頁、這個帳號、無法確認的暫存；有未同步修改或待確認升級才算 dirty", async () => {
  const dirty = player("test_k", ["guan_yu"], { rev: 2, syncedRev: 1 });
  const clean = player("test_k", ["zhao_yun"], { rev: 3, syncedRev: 3 });
  const pending = player("test_k", ["zhao_yun"], {
    rev: 0,
    syncedRev: 0,
    pendingUpgrade: { id: "op" },
  });
  const legacyFmt = JSON.stringify({
    key: "test_k",
    nickname: "舊",
    gold: 1,
    heroes: [],
    team: [],
    syncStatus: "pending",
  });
  const all = [
    entry("a", "t1", clean),
    entry("b", "t1", dirty),
    entry("c", "t2", dirty),
    entry(
      "d",
      "t1",
      player("test_other", ["guan_yu"], { rev: 1, syncedRev: 0 })
    ),
    entry("e", "t1", dirty, "replaced"),
    entry("f", "t1", "{"),
  ];
  const got = findIsolationRecovery(all, "t1", K, "test_k");
  assert(
    got &&
      got.dirty &&
      got.value === dirty &&
      JSON.stringify(got.ids) === '["a","b"]' &&
      JSON.stringify(got.team) === '["guan_yu"]',
    JSON.stringify(got)
  );
  assert(
    findIsolationRecovery(all, "t2", K, "test_k").ids.length === 1,
    "其他分頁"
  );
  assert(
    findIsolationRecovery(all, "t1", K, "test_none") === null,
    "其他帳號不顯示"
  );
  assert(
    findIsolationRecovery(all, null, K, "test_k") === null,
    "沒有分頁識別"
  );
  assert(
    findIsolationRecovery([entry("a", "t1", clean)], "t1", K, "test_k")
      .dirty === false,
    "沒有未同步內容"
  );
  assert(
    findIsolationRecovery([entry("p", "t1", pending)], "t1", K, "test_k")
      .pendingUpgrade === true,
    "待確認升級"
  );
  assert(
    findIsolationRecovery([entry("l", "t1", legacyFmt)], "t1", K, "test_k")
      .dirty === true,
    "沒有版本號的舊格式"
  );
});

const failed = results.filter((r) => !r.pass);
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      total: results.length,
      passed: results.length - failed.length,
      failed: failed.map((f) => f.name),
    })
);
process.exit(failed.length ? 1 : 0);
