// 匯出後處理（tools/postexport.mjs）的 Service Worker 與外殼頁測試：把 Godot 4.6.2 模板（fixtures/godot-4.6.2-service-worker.js、
// fixtures/godot-4.6.2-index.html）處理後放進 Node 的 vm 沙盒（假的 Cache Storage、網路與頁面），逐項核對：
// 只交付同一版（頁面網址的 shenma_ver）、先完整下載並核對大小與 sha256 才交付、錯的內容（舊版／新版、沒下載完、404、網路錯誤）
// 不交給頁面也不放進快取並告訴頁面原因、快取裡正確的檔案照常使用、向伺服器重新驗證（cache: 'no-cache'）、
// 外殼頁導覽的快取與網路行為、引擎相同時跨版本沿用、切換版本只刪這個遊戲其他版本的快取、從原本的 Godot 模板 Service Worker 升級。
// 外殼頁的版本守門在瀏覽器測試（engine-load、r10、載入量測）實際執行。不需要瀏覽器
// 用法：node scripts/shenma-regression/tools/postexport.test.mjs
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import {
  VERSION_PARAM,
  buildInfo,
  htmlVersionOf,
  maskHtmlVersion,
  patchHtml,
  patchServiceWorker,
  templateHash,
  versionOf,
} from "./postexport.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = readFileSync(
  join(HERE, "..", "fixtures", "godot-4.6.2-service-worker.js"),
  "utf8"
);
const HTML = readFileSync(
  join(HERE, "..", "fixtures", "godot-4.6.2-index.html"),
  "utf8"
);
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail)}`
  );
};
const throws = (fn, re) => {
  try {
    fn();
    return false;
  } catch (e) {
    return !re || re.test(e.message);
  }
};

const BASE = "https://example.test/games/shenmaSanguo/";
const sha = (b) => createHash("sha256").update(b).digest("hex");
const bytes = (s) => new TextEncoder().encode(s);
/** 一版的檔案（外殼頁與 Service Worker 經過匯出後處理）：wasm／js 決定引擎，pck 決定版本 */
const version = (cacheVersion, pck, engine = "engine-1") => {
  const raw = {
    "index.html": bytes(
      HTML.replace("shenmaSanguo</title>", `${cacheVersion}</title>`)
    ),
    "index.js": bytes(`js ${engine}\nsecond line\n`),
    "index.wasm": bytes(`wasm ${engine} `.repeat(50)),
    "index.pck": bytes(pck.repeat(30)),
    "index.offline.html": bytes("offline"),
    "index.icon.png": bytes("icon"),
    "index.apple-touch-icon.png": bytes("apple"),
    "index.audio.worklet.js": bytes(`w1 ${engine}`),
    "index.audio.position.worklet.js": bytes(`w2 ${engine}`),
  };
  const info = buildInfo((f) => Buffer.from(raw[f]));
  const files = { ...raw, "index.html": bytes(info.html) };
  const sw = patchServiceWorker(
    TEMPLATE.replace(
      /^const CACHE_VERSION = '[^'\n]*';$/m,
      `const CACHE_VERSION = '${cacheVersion}';`
    ),
    info
  );
  return { files, sw, info, cacheVersion, engineVersion: info.engine };
};

// ── 假的瀏覽器環境 ──
class FakeRequest {
  constructor(input, init = {}) {
    const src = input instanceof FakeRequest ? input : null;
    this.url = src
      ? src.url
      : new URL(input, BASE + "index.service.worker.js").href;
    this.mode = init.mode ?? (src ? src.mode : "cors");
    this.cache = init.cache ?? (src ? src.cache : "default");
    this.referrer = init.referrer ?? (src ? src.referrer : "");
  }
}
const keyOf = (r) =>
  r instanceof FakeRequest
    ? r.url
    : new URL(r, BASE + "index.service.worker.js").href;
/** Cache Storage；net 是 addAll（原本的模板安裝時用）取得檔案的網路 */
const makeCaches = (net = null) => {
  const store = new Map();
  const open = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      match: async (r) => {
        const hit = m.get(keyOf(r));
        return hit ? hit.clone() : undefined;
      },
      put: async (r, res) => {
        m.set(keyOf(r), res.clone());
      },
      addAll: async (names) => {
        for (const n of names) {
          const res = await net.fetch(n);
          if (!res.ok) throw new TypeError("addAll failed: " + n);
          m.set(keyOf(n), res);
        }
      },
      keys: async () => [...m.keys()].map((u) => new FakeRequest(u)),
    };
  };
  return {
    store,
    api: {
      open: async (name) => open(name),
      keys: async () => [...store.keys()],
      delete: async (name) => store.delete(name),
      match: async (r) => {
        for (const m of store.values())
          if (m.has(keyOf(r))) return m.get(keyOf(r)).clone();
        return undefined;
      },
    },
  };
};
/**
 * 網路：server 是目前伺服器上的檔案（name → bytes）；override 可以讓某個檔案回別的內容、狀態，
 * 或 error: true（連線失敗）、cut: n（送出 n bytes 後連線中斷）
 */
const makeNetwork = () => {
  const net = { server: {}, override: {}, log: [] };
  net.fetch = async (req) => {
    const r = req instanceof FakeRequest ? req : new FakeRequest(req);
    const name = new URL(r.url).pathname.split("/").pop();
    net.log.push({ name, cache: r.cache, mode: r.mode });
    const o = net.override[name];
    if (o && o.error) throw new TypeError("Failed to fetch");
    if (o && o.cut !== undefined) {
      const data = net.server[name].slice(0, o.cut);
      const body = new ReadableStream({
        start(c) {
          c.enqueue(data);
          c.error(new TypeError("network error"));
        },
      });
      return new Response(body, { status: 200 });
    }
    if (o) return new Response(o.body ?? "", { status: o.status ?? 200 });
    if (!(name in net.server))
      return new Response("not found", { status: 404 });
    return new Response(net.server[name], {
      status: 200,
      headers: { "Content-Type": "application/octet-stream" },
    });
  };
  return net;
};
/** 頁面（client）：url 是頁面網址，messages 是 Service Worker 送來的訊息 */
const makeClients = () => {
  const map = new Map();
  return {
    map,
    add: (id, url) => {
      const c = { id, url, type: "window", messages: [] };
      c.postMessage = (m) => c.messages.push(m);
      map.set(id, c);
      return c;
    },
  };
};
const pageUrl = (v) =>
  BASE + "index.html" + (v ? `?${VERSION_PARAM}=${v}` : "");
/** 載入一個 Service Worker（同一個 Cache Storage） */
const loadSW = (src, caches, net, clients = makeClients()) => {
  const listeners = {};
  const counts = { update: 0, skipWaiting: 0, claim: 0, preload: null };
  const self = {
    location: { href: BASE + "index.service.worker.js" },
    addEventListener: (t, fn) => (listeners[t] ||= []).push(fn),
    registration: {
      navigationPreload: {
        enable: async () => (counts.preload = "enabled"),
        disable: async () => (counts.preload = "disabled"),
      },
      update: async () => {
        counts.update++;
      },
    },
    skipWaiting: async () => {
      counts.skipWaiting++;
    },
    clients: {
      get: async (id) => clients.map.get(id) || null,
      claim: async () => {
        counts.claim++;
      },
      matchAll: async () => [...clients.map.values()],
    },
    fetch: net.fetch,
  };
  const ctx = vm.createContext({
    self,
    caches: caches.api,
    fetch: net.fetch,
    Request: FakeRequest,
    Response,
    Headers,
    URL,
    crypto: webcrypto,
    console: { ...console, error: () => {} },
    Promise,
    Uint8Array,
    Array,
    Map,
    Date,
    TextEncoder,
  });
  vm.runInContext(src, ctx);
  const dispatch = async (type, extra = {}) => {
    const pending = [];
    for (const fn of listeners[type] || [])
      fn({ waitUntil: (p) => pending.push(p), ...extra });
    await Promise.all(pending);
  };
  /** 頁面 clientId（頁面網址 page）要求 name；mode 'navigate' 是導覽 */
  const fetchEvent = async (
    name,
    { mode = "cors", page = null, clientId = "" } = {}
  ) => {
    const pending = [];
    let responded = null;
    const request = new FakeRequest(BASE + name, {
      mode,
      referrer:
        mode === "navigate" ? "https://example.test/shenmaSanguo" : page || "",
    });
    for (const fn of listeners.fetch)
      fn({
        request,
        clientId,
        resultingClientId: "",
        preloadResponse: Promise.resolve(undefined),
        respondWith: (p) => (responded = p),
        waitUntil: (p) => pending.push(p),
      });
    const res = responded ? await responded : null;
    const body =
      res && res.type !== "error"
        ? Buffer.from(await res.clone().arrayBuffer())
        : null;
    await Promise.all(pending);
    return {
      status: res && res.status,
      body,
      header: res && res.headers ? res.headers.get("X-Shenma-SW") : null,
    };
  };
  const message = async (data) => {
    const replies = [];
    const port = { postMessage: (m) => replies.push(m) };
    await dispatch("message", {
      data,
      ports: [port],
      origin: "https://example.test",
      source: { id: "" },
    });
    return replies;
  };
  return {
    install: () => dispatch("install"),
    activate: () => dispatch("activate"),
    fetch: fetchEvent,
    message,
    counts,
  };
};
const cacheFiles = (caches, name) => {
  const m = caches.store.get(name);
  return m
    ? Object.fromEntries(
        [...m.entries()].map(([u, r]) => [u.split("/").pop(), r])
      )
    : null;
};
const bodyOf = async (r) =>
  r ? Buffer.from(await r.clone().arrayBuffer()) : null;
const same = (a, b) =>
  !!a && !!b && Buffer.compare(Buffer.from(a), Buffer.from(b)) === 0;
const lastMessage = (client, type) =>
  client.messages.filter((m) => m.type === type).pop() || null;

// ── 模板 ──
check(
  "模板：fixture 是 Godot 4.6.2 產生的 Service Worker（遮掉 CACHE_VERSION 後的 sha256 固定）；處理過的再處理一次會拒絕",
  templateHash(TEMPLATE) ===
    "8abb909daaebeafaf250a5c45a1b53994a0a639e5fb04458c11414ff9f26c436" &&
    throws(() =>
      patchServiceWorker(version("x", "p").sw, version("y", "p").info)
    ),
  templateHash(TEMPLATE)
);
check(
  "模板改版（要整段換掉的區塊內容不同、或找不到已知的片段）時直接失敗，不產生半套的 Service Worker",
  throws(
    () =>
      patchServiceWorker(
        TEMPLATE.replace("cache.addAll(CACHED_FILES)", "cache.addAll(OTHER)"),
        version("x", "p").info
      ),
    /區塊和預期不同/
  ) &&
    throws(
      () =>
        patchServiceWorker(
          TEMPLATE.replace(
            "caches.delete(CACHE_NAME);\n",
            "caches.delete(X);\n"
          ),
          version("x", "p").info
        ),
      /片段出現 0 次/
    ),
  null
);
check(
  "外殼頁：fixture 是 Godot 4.6.2 產生的 index.html（sha256 固定）；處理過的再處理一次、模板改版（片段找不到）都直接失敗",
  sha(HTML.replace(/\r\n/g, "\n")) ===
    "770657669a424c4e753b3e1bb52986d5ef6d23b3d4ea3eda11b79d3e338b1b28" &&
    throws(() => patchHtml(patchHtml(HTML)), /重複執行/) &&
    throws(
      () => patchHtml(HTML.replace('<script src="index.js"></script>', "")),
      /片段出現 0 次/
    ),
  sha(HTML.replace(/\r\n/g, "\n"))
);

const v1 = version("v1", "pck-one ");
const html1 = new TextDecoder().decode(v1.files["index.html"]);
check(
  '外殼頁：載入程式改成確認版本後才載入（沒有直接的 <script src="index.js">）、啟動程式包在 boot 裡；外殼頁與 Service Worker 的版本相同，' +
    "遮掉版本後重新計算得到同一個版本",
  !html1.includes('<script src="index.js">') &&
    html1.includes(
      "window.__shenmaGuard.boot(function () {\nconst engine = new Engine(GODOT_CONFIG);"
    ) &&
    html1.includes(
      "current = window.__shenmaGuard.progress(current, total);"
    ) &&
    html1.includes("if (window.__shenmaGuard.handleFailure(err)) {") &&
    htmlVersionOf(html1) === v1.info.version &&
    v1.sw.includes(`const VERSION = '${v1.info.version}';`) &&
    versionOf(maskHtmlVersion(html1), v1.info.expected) === v1.info.version,
  { version: v1.info.version, html: htmlVersionOf(html1) }
);
check(
  "版本由內容決定：只有資料包不同也是不同的版本；同樣的檔案是同一個版本",
  version("v2", "pck-two ").info.version !== v1.info.version &&
    version("v1-again", "pck-one ").info.version ===
      version("v1-again", "pck-one ").info.version,
  null
);

// ── 安裝、第一次載入、回訪 ──
const caches = makeCaches();
caches.store.set("site-other-cache", new Map()); // 網站其他的快取：不能被刪
const net = makeNetwork();
net.server = { ...v1.files };
const clients = makeClients();
const page1 = clients.add("p1", pageUrl(v1.info.version));
const sw1 = loadSW(v1.sw, caches, net, clients);
await sw1.install();
const c1 = cacheFiles(caches, "shenmaSanguo-sw-cache-v1");
check(
  "安裝：先載入的檔案（外殼頁、載入程式、音訊 worklet 等）都核對後放進這一版的快取，向伺服器重新驗證（cache: no-cache），" +
    "沒有下載引擎與資料包",
  c1 &&
    same(await bodyOf(c1["index.html"]), v1.files["index.html"]) &&
    same(await bodyOf(c1["index.js"]), v1.files["index.js"]) &&
    same(
      await bodyOf(c1["index.audio.worklet.js"]),
      v1.files["index.audio.worklet.js"]
    ) &&
    net.log.length === 7 &&
    net.log.every((l) => l.cache === "no-cache") &&
    !net.log.some((l) => l.name === "index.wasm" || l.name === "index.pck"),
  { files: c1 && Object.keys(c1), log: net.log }
);
await sw1.activate();
check(
  "啟用：關掉導覽預載（外殼頁自己重新驗證）並接手範圍內的頁面",
  sw1.counts.preload === "disabled" && sw1.counts.claim === 1,
  sw1.counts
);
check(
  "版本守門的訊息：問版本時用傳來的 port 回答這一版；要求接手時立即啟用並接手",
  await (async () => {
    const replies = await sw1.message({ type: "shenma-version" });
    const before = { ...sw1.counts };
    await sw1.message({ type: "shenma-claim" });
    return (
      replies.length === 1 &&
      replies[0].version === v1.info.version &&
      sw1.counts.skipWaiting === before.skipWaiting + 1 &&
      sw1.counts.claim === before.claim + 1
    );
  })(),
  sw1.counts
);
net.log = [];
const w1 = await sw1.fetch("index.wasm", {
  page: pageUrl(v1.info.version),
  clientId: "p1",
});
const p1 = await sw1.fetch("index.pck", {
  page: pageUrl(v1.info.version),
  clientId: "p1",
});
const prog = lastMessage(page1, "shenma-sw-progress");
check(
  "第一次取得引擎與資料包（同一版的頁面）：從網路（重新驗證）完整下載並核對後交付；引擎放進引擎快取、資料包放進這一版的快取；" +
    "下載時把已下載的位元組送給頁面（最後一次等於檔案大小）",
  w1.status === 200 &&
    same(w1.body, v1.files["index.wasm"]) &&
    same(p1.body, v1.files["index.pck"]) &&
    same(
      await bodyOf(
        cacheFiles(
          caches,
          "shenmaSanguo-sw-cache-engine-" + v1.engineVersion
        )?.["index.wasm"]
      ),
      v1.files["index.wasm"]
    ) &&
    same(
      await bodyOf(cacheFiles(caches, "shenmaSanguo-sw-cache-v1")["index.pck"]),
      v1.files["index.pck"]
    ) &&
    net.log.every((l) => l.cache === "no-cache") &&
    !!prog &&
    prog.file === "index.pck" &&
    prog.loaded === v1.files["index.pck"].length &&
    prog.total === v1.files["index.pck"].length,
  { log: net.log, prog }
);
net.log = [];
const w1b = await sw1.fetch("index.wasm", {
  page: pageUrl(v1.info.version),
  clientId: "p1",
});
const nav1 = await sw1.fetch("index.html", { mode: "navigate" });
check(
  "回訪：這一版的檔案都在快取時，外殼頁與引擎都從快取提供，沒有網路請求",
  net.log.length === 0 &&
    same(w1b.body, v1.files["index.wasm"]) &&
    same(nav1.body, v1.files["index.html"]),
  net.log
);

// ── 版本不同的頁面：不交付 ──
const legacy = clients.add("legacy", pageUrl(null));
const other = clients.add("other", pageUrl("0123456789abcdef"));
const r1 = await sw1.fetch("index.pck", {
  page: pageUrl(null),
  clientId: "legacy",
});
const r2 = await sw1.fetch("index.js", {
  page: pageUrl("0123456789abcdef"),
  clientId: "other",
});
const r3 = await sw1.fetch("index.audio.worklet.js", {
  page: pageUrl(null),
  clientId: "legacy",
});
check(
  "頁面網址沒有版本（舊版外殼頁）或是別的版本：載入程式、引擎與資料包都拒絕（503，告訴頁面 no-page-version／page-version），" +
    "不交出這一版的內容；音訊 worklet 等不分版本的檔案照常",
  r1.status === 503 &&
    !same(r1.body, v1.files["index.pck"]) &&
    /no-page-version/.test(r1.header) &&
    lastMessage(legacy, "shenma-sw-refused")?.reason === "no-page-version" &&
    r2.status === 503 &&
    lastMessage(other, "shenma-sw-refused")?.reason === "page-version" &&
    r3.status === 200,
  { r1: r1.status, r2: r2.status, r3: r3.status }
);
check(
  "頁面網址的版本由 referrer 取得；referrer 沒有版本時改看頁面目前的網址",
  (await sw1.fetch("index.pck", { page: BASE + "index.html", clientId: "p1" }))
    .status === 200,
  null
);

// ── Codex 重現：A 已啟用、資料包還沒快取，伺服器換成 B ──
const vA = version("review-A", "pck-A ");
const vB = version("review-B", "pck-B ");
const cachesA = makeCaches();
const netA = makeNetwork();
netA.server = { ...vA.files };
const clientsA = makeClients();
const pageA = clientsA.add("a", pageUrl(vA.info.version));
const swA = loadSW(vA.sw, cachesA, netA, clientsA);
await swA.install();
await swA.activate();
netA.server = { ...vB.files };
const updatesBefore = swA.counts.update;
const pckAB = await swA.fetch("index.pck", {
  page: pageUrl(vA.info.version),
  clientId: "a",
});
const jsAB = await swA.fetch("index.js", {
  page: pageUrl(vA.info.version),
  clientId: "a",
});
check(
  "錯的內容不交付（Codex 重現）：A 啟用、伺服器換成 B → A 的頁面要資料包時拒絕（503），沒有交出 B 的資料包、也沒有放進 A 的快取；" +
    "告訴頁面 mismatch、檢查 Service Worker 有沒有新版；載入程式仍是快取裡的 A",
  pckAB.status === 503 &&
    !same(pckAB.body, vB.files["index.pck"]) &&
    !cacheFiles(cachesA, "shenmaSanguo-sw-cache-review-A")["index.pck"] &&
    lastMessage(pageA, "shenma-sw-refused")?.reason === "mismatch" &&
    swA.counts.update === updatesBefore + 1 &&
    same(jsAB.body, vA.files["index.js"]),
  {
    status: pckAB.status,
    msg: lastMessage(pageA, "shenma-sw-refused"),
    updates: swA.counts.update,
  }
);
netA.log = [];
const again = await swA.fetch("index.pck", {
  page: pageUrl(vA.info.version),
  clientId: "a",
});
check(
  "剛拒絕過（內容不是這一版）：Godot 重試時直接拒絕，不再重新下載",
  again.status === 503 && !netA.log.some((l) => l.name === "index.pck"),
  netA.log
);
const navAB = await swA.fetch("index.html", { mode: "navigate" });
check(
  "舊版啟用、伺服器是新版、檔案還不完整：外殼頁的導覽向伺服器重新驗證，交出伺服器上的 B 外殼頁（由 B 的版本守門處理），" +
    "不放進 A 的快取；B 的頁面向 A 要載入程式時拒絕（不會拿 A 的載入程式配 B 的外殼頁）",
  navAB.status === 200 &&
    same(navAB.body, vB.files["index.html"]) &&
    same(
      await bodyOf(
        cacheFiles(cachesA, "shenmaSanguo-sw-cache-review-A")["index.html"]
      ),
      vA.files["index.html"]
    ) &&
    (
      await swA.fetch("index.js", {
        page: pageUrl(vB.info.version),
        clientId: "",
      })
    ).status === 503,
  { status: navAB.status }
);

// ── 下載不完整、錯誤狀態、網路錯誤 ──
const vC = version("v-c", "pck-c ");
const cachesC = makeCaches();
const netC = makeNetwork();
netC.server = { ...vC.files };
const clientsC = makeClients();
const pageC = clientsC.add("c", pageUrl(vC.info.version));
const swC = loadSW(vC.sw, cachesC, netC, clientsC);
await swC.install();
await swC.activate();
const pc = pageUrl(vC.info.version);
const cacheC = () => cacheFiles(cachesC, "shenmaSanguo-sw-cache-v-c");
netC.override["index.pck"] = { body: vC.files["index.pck"].slice(0, 20) };
const half = await swC.fetch("index.pck", { page: pc, clientId: "c" });
const halfReason = lastMessage(pageC, "shenma-sw-refused")?.reason;
netC.override["index.pck"] = { cut: 30 };
const cut = await swC.fetch("index.pck", { page: pc, clientId: "c" });
const cutReason = lastMessage(pageC, "shenma-sw-refused")?.reason;
netC.override["index.pck"] = { status: 404, body: "not found" };
const nf = await swC.fetch("index.pck", { page: pc, clientId: "c" });
const nfMsg = lastMessage(pageC, "shenma-sw-refused");
netC.override["index.pck"] = { error: true };
const ne = await swC.fetch("index.pck", { page: pc, clientId: "c" });
const neReason = lastMessage(pageC, "shenma-sw-refused")?.reason;
check(
  "半包（伺服器只給前 20 bytes）、下載中途連線中斷、404、連不上：都不交給頁面（503）、不放進快取，" +
    "告訴頁面原因（size／network／status 404／network）",
  [half, cut, nf, ne].every(
    (r) => r.status === 503 && !same(r.body, vC.files["index.pck"])
  ) &&
    halfReason === "size" &&
    cutReason === "network" &&
    nfMsg?.reason === "status" &&
    nfMsg?.status === 404 &&
    neReason === "network" &&
    !cacheC()["index.pck"],
  {
    half: half.status,
    halfReason,
    cut: cut.status,
    cutReason,
    nf: nf.status,
    nfMsg,
    ne: ne.status,
    neReason,
  }
);
delete netC.override["index.pck"];
const okC = await swC.fetch("index.pck", { page: pc, clientId: "c" });
check(
  "伺服器回這一版的完整資料包後才交付並放進快取",
  okC.status === 200 &&
    same(await bodyOf(cacheC()["index.pck"]), vC.files["index.pck"]),
  okC.status
);
netC.log = [];
netC.override["index.pck"] = { status: 404, body: "gone" };
netC.override["index.wasm"] = { body: "garbage" };
const fromCache = await swC.fetch("index.pck", { page: pc, clientId: "c" });
await swC.fetch("index.wasm", { page: pc, clientId: "c" }); // 先讓引擎進快取（伺服器的是錯的：拒絕）
check(
  "已有正確快取：伺服器之後回 404 或錯的內容，資料包照樣從快取提供（沒有網路請求）；快取裡沒有的引擎遇到錯的內容則拒絕",
  fromCache.status === 200 &&
    same(fromCache.body, vC.files["index.pck"]) &&
    !netC.log.some((l) => l.name === "index.pck") &&
    !cacheFiles(cachesC, "shenmaSanguo-sw-cache-engine-" + vC.engineVersion)?.[
      "index.wasm"
    ],
  netC.log
);
netC.override = { "index.html": { error: true } };
await cachesC.api.delete("shenmaSanguo-sw-cache-engine-" + vC.engineVersion);
const offline = await swC.fetch("index.html", { mode: "navigate" });
check(
  "檔案不完整又連不上：外殼頁的導覽給離線頁",
  offline.status === 200 && same(offline.body, vC.files["index.offline.html"]),
  offline.status
);

// ── 新版：只有資料包不同（引擎相同）──
const v2 = version("v2", "pck-two ");
net.server = { ...v2.files };
net.log = [];
const page2 = clients.add("p2", pageUrl(v2.info.version));
const sw2 = loadSW(v2.sw, caches, net, clients);
await sw2.install();
await sw2.activate();
check(
  "新版（引擎相同）啟用：刪掉舊版本的快取，引擎快取保留；網站其他的快取不動",
  !caches.store.has("shenmaSanguo-sw-cache-v1") &&
    caches.store.has("shenmaSanguo-sw-cache-v2") &&
    caches.store.has("shenmaSanguo-sw-cache-engine-" + v2.engineVersion) &&
    v2.engineVersion === v1.engineVersion &&
    caches.store.has("site-other-cache"),
  [...caches.store.keys()]
);
net.log = [];
const w2 = await sw2.fetch("index.wasm", {
  page: pageUrl(v2.info.version),
  clientId: "p2",
});
check(
  "新版沿用相同的引擎：index.wasm 從引擎快取提供，沒有重新下載",
  same(w2.body, v1.files["index.wasm"]) &&
    !net.log.some((l) => l.name === "index.wasm"),
  net.log
);
const oldPage = await sw2.fetch("index.pck", {
  page: pageUrl(v1.info.version),
  clientId: "p1",
});
check(
  "新版接手後，還開著的舊版頁面要資料包：拒絕（page-version），不會把新版資料包配舊版外殼頁",
  oldPage.status === 503 &&
    lastMessage(page1, "shenma-sw-refused")?.reason === "page-version",
  oldPage.status
);
// 新版啟用後，HTTP 快取或 CDN 還在回舊的資料包
net.override["index.pck"] = { body: v1.files["index.pck"] };
const stale = await sw2.fetch("index.pck", {
  page: pageUrl(v2.info.version),
  clientId: "p2",
});
check(
  "新版啟用、伺服器（HTTP 快取／CDN）回舊版資料包：拒絕交付（mismatch）、不放進新版的快取",
  stale.status === 503 &&
    !same(stale.body, v1.files["index.pck"]) &&
    lastMessage(page2, "shenma-sw-refused")?.reason === "mismatch" &&
    !cacheFiles(caches, "shenmaSanguo-sw-cache-v2")["index.pck"],
  stale.status
);

// 安裝時先載入的檔案是舊版：不安裝（舊版本照常運作）
const v3 = version("v3", "pck-three ");
net.server = { ...v3.files, "index.js": bytes("js of another export") };
const sw3 = loadSW(v3.sw, caches, net);
let installFailed = false;
try {
  await sw3.install();
} catch {
  installFailed = true;
}
check(
  "新版安裝時取得的載入程式和這一版不符：安裝失敗（不產生半套的快取，舊版本照常運作）",
  installFailed,
  null
);

// Windows 工作樹的文字檔是 CRLF（git 以 LF 保存、部署）：內容相同，照樣安裝
const v5 = version("v5", "pck-five ");
const cachesW = makeCaches();
const netW = makeNetwork();
const crlf = (b) => bytes(new TextDecoder().decode(b).replace(/\n/g, "\r\n"));
netW.server = {
  ...v5.files,
  "index.js": crlf(v5.files["index.js"]),
  "index.html": crlf(v5.files["index.html"]),
};
const sw5 = loadSW(v5.sw, cachesW, netW);
let crlfOk = true;
try {
  await sw5.install();
} catch {
  crlfOk = false;
}
check(
  "外殼頁與載入程式是 CRLF（Windows 工作樹）而 git 與部署是 LF：去掉 CR 後內容相同，照樣安裝",
  crlfOk && !!cacheFiles(cachesW, "shenmaSanguo-sw-cache-v5")?.["index.js"],
  null
);

// 引擎不同的新版：引擎快取換新名稱，舊引擎的快取在啟用時刪除
const v4 = version("v4", "pck-four ", "engine-2");
net.server = { ...v4.files };
net.override = {};
clients.add("p4", pageUrl(v4.info.version));
const sw4 = loadSW(v4.sw, caches, net, clients);
await sw4.install();
await sw4.activate();
net.log = [];
const w4 = await sw4.fetch("index.wasm", {
  page: pageUrl(v4.info.version),
  clientId: "p4",
});
check(
  "引擎不同的新版：重新下載新引擎、放進新名稱的快取，舊引擎的快取刪除（不會拿舊引擎配新的載入程式）",
  v4.engineVersion !== v1.engineVersion &&
    same(w4.body, v4.files["index.wasm"]) &&
    net.log.some((l) => l.name === "index.wasm") &&
    !caches.store.has("shenmaSanguo-sw-cache-engine-" + v1.engineVersion) &&
    caches.store.has("shenmaSanguo-sw-cache-engine-" + v4.engineVersion),
  [...caches.store.keys()]
);

// ── 從原本的 Godot 模板 Service Worker（正式站目前的版本，沒有核對）升級 ──
const legacyNet = makeNetwork();
const legacyCaches = makeCaches(legacyNet);
const legacyFiles = {
  ...version("legacy", "pck-legacy ").files,
  "index.html": bytes("<html>legacy</html>"),
};
legacyNet.server = legacyFiles;
const legacySw = TEMPLATE.replace(
  /^const CACHE_VERSION = '[^'\n]*';$/m,
  "const CACHE_VERSION = 'legacy';"
);
const swL = loadSW(legacySw, legacyCaches, legacyNet);
await swL.install();
await swL.activate();
const vN = version("vN", "pck-new ", "engine-new");
legacyNet.server = { ...vN.files };
const clientsN = makeClients();
const pageN = clientsN.add("n", pageUrl(vN.info.version));
const oldLegacyPage = clientsN.add("old", pageUrl(null));
const swN = loadSW(vN.sw, legacyCaches, legacyNet, clientsN);
await swN.install();
await swN.activate();
const nPck = await swN.fetch("index.pck", {
  page: pageUrl(vN.info.version),
  clientId: "n",
});
const lPck = await swN.fetch("index.js", {
  page: pageUrl(null),
  clientId: "old",
});
check(
  "從原本的模板 Service Worker 升級：舊的快取刪除、導覽預載關掉；新版頁面拿到新版檔案，還開著的舊版頁面（網址沒有版本）要載入程式時拒絕",
  !legacyCaches.store.has("shenmaSanguo-sw-cache-legacy") &&
    swN.counts.preload === "disabled" &&
    nPck.status === 200 &&
    same(nPck.body, vN.files["index.pck"]) &&
    lPck.status === 503 &&
    lastMessage(oldLegacyPage, "shenma-sw-refused")?.reason ===
      "no-page-version" &&
    pageN.messages.every((m) => m.type !== "shenma-sw-refused"),
  { caches: [...legacyCaches.store.keys()], n: nPck.status, l: lPck.status }
);

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
