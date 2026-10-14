// 發布過渡的原生瀏覽器驗證（本機伺服器、真的 Chrome，不連正式站、不呼叫後端、不經過網站頁面）
// 發布方式（見 tools/game-release.mjs）：新版放在自己的版本目錄 /games/shenmaSanguo-v/<版本>/，舊正式版目錄 /games/shenmaSanguo/
// 保持原檔。這裡模擬「伺服器從只有舊正式版，換成舊目錄＋版本目錄」的各種時間點，核對每個頁面實際拿到的檔案是哪一版：
//   S1 舊正式版 Service Worker 已安裝、舊頁面開著且引擎／資料包還在下載，伺服器換成新拓樸後才補完（原本會拿到新版資料包配舊載入程式）
//   S2 舊正式版 Service Worker 只裝好小檔（install-only，引擎與資料包不在快取），伺服器換成新拓樸後才開舊頁面
//   S3 舊正式版完整快取：換成新拓樸後重新整理舊頁面、同時開新入口；新版啟用不刪舊正式版的快取
//   S4 停用 Service Worker（瀏覽器設定）：HTTP 快取裡的舊外殼頁照樣配舊檔案；新入口直接從網路載入新版目錄（沒有核對，靠網址不同）
//   S5 兩個版本目錄（同一個引擎）：舊版本頁面開著時發布新版本，新版本共用引擎快取、舊版本照常；新版本目錄的資料包被回成別版內容時明確失敗
//   S6 版本目錄缺檔（404）、半包（連線中斷）明確失敗；完整快取後伺服器離線仍能開
// 每個頁面記錄：外殼頁／載入程式／資料包的回應 sha256（對照各版本的檔案）、伺服器實際送出哪一版的哪個檔案、控制頁面的 Service Worker、
// Cache Storage 每個快取的檔案與 sha256、頁面錯誤；結果寫成 JSON，任何一項不符時結束碼 1
// 用法：node scripts/shenma-regression/tools/release-transition.mjs [--legacy <舊正式版目錄>] [--v1 <版本目錄>]
//        [--v2 <同一個引擎的另一版（版本目錄或經過 postexport 的匯出）>] [--only S1,S3] [--port 3104]
//   預設 --legacy public/games/shenmaSanguo、--v1 網站入口的版本目錄；沒有 --v2 時 S5 不執行（結果寫明）
//   反向驗證：--in-place <目錄> 改成舊的發布方式（換拓樸時把舊目錄 /games/shenmaSanguo/ 原地換成這個目錄的檔案），
//   S1／S2 應該抓到舊頁面拿到新版檔案（結束碼 1）
//   PLAYWRIGHT_DIR、BROWSER_CHANNEL（預設 chrome）同 run-browser.mjs；EVIDENCE_DIR 寫 release-transition.json
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEGACY_PATH,
  PACKAGES_DIR,
  PACKAGES_PATH,
  legacyProblems,
  packageProblems,
  readRelease,
} from "./game-release.mjs";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i === -1 ? def : args[i + 1];
};
const release = readRelease(ROOT);
const LEGACY = resolve(ROOT, opt("--legacy", "public/games/shenmaSanguo"));
const V1DIR = resolve(
  ROOT,
  opt(
    "--v1",
    release.entry === "legacy" ? "" : `${PACKAGES_DIR}/${release.entry}`
  )
);
const V2DIR = opt("--v2", null) ? resolve(ROOT, opt("--v2")) : null;
const ONLY = opt("--only", null)?.split(",") || null;
const IN_PLACE = opt("--in-place", null)
  ? resolve(ROOT, opt("--in-place"))
  : null;
const PORT = Number(opt("--port", "3104"));
const ORIGIN = `http://localhost:${PORT}`;

// ── 前置：目錄完整（缺檔時直接拒絕，不把沒跑到當成通過）──
const pre = [];
if (LEGACY === resolve(ROOT, "public/games/shenmaSanguo"))
  pre.push(...legacyProblems(ROOT).map((p) => "舊正式版：" + p));
else if (!existsSync(join(LEGACY, "index.html")))
  pre.push("舊正式版目錄沒有 index.html：" + LEGACY);
const v1 = packageProblems(V1DIR);
pre.push(...v1.problems.map((p) => "v1：" + p));
const v2 = V2DIR ? packageProblems(V2DIR) : null;
if (v2) pre.push(...v2.problems.map((p) => "v2：" + p));
if (v2 && v2.version === v1.version) pre.push("v2 和 v1 是同一個版本");
if (pre.length) {
  console.error("前置檢查失敗：\n  " + pre.join("\n  "));
  process.exit(2);
}
const V1 = v1.version;
const V2 = v2 ? v2.version : null;
const PATHS = {
  legacy: LEGACY_PATH,
  v1: `${PACKAGES_PATH}${V1}/`,
  ...(V2 ? { v2: `${PACKAGES_PATH}${V2}/` } : {}),
};
const DIRS = {
  legacy: LEGACY,
  v1: V1DIR,
  ...(V2 ? { v2: V2DIR } : {}),
  ...(IN_PLACE ? { inplace: IN_PLACE } : {}),
};

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
// 各版本每個檔案的 sha256 → 用來辨認回應或快取裡的內容是哪一版（同一個引擎的兩版 index.js 相同：記成「v1:index.js|v2:index.js」）
const KNOWN = new Map();
for (const [label, dir] of Object.entries(DIRS))
  for (const f of readdirSync(dir)) {
    const h = sha256(readFileSync(join(dir, f)));
    KNOWN.set(h, [...(KNOWN.get(h) || []), `${label}:${f}`]);
  }
const whose = (hash) => (KNOWN.get(hash) || ["unknown"]).join("|");
const isFrom = (tag, label, file) =>
  typeof tag === "string" && tag.split("|").includes(`${label}:${file}`);
const shaOf = (label, f) => sha256(readFileSync(join(DIRS[label], f)));

// ── 伺服器：Pages 的方式（max-age、ETag、304；不送 COOP／COEP）。serve 決定目前提供哪些目錄 ──
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".pck": "application/octet-stream",
  ".png": "image/png",
  ".ogg": "audio/ogg",
};
const state = {
  serve: new Set(["legacy"]),
  scenario: "",
  hold: null, // (path) => boolean：先不回應（放行時才用當下的伺服器內容回應）
  held: [],
  tamper: {}, // 網址路徑 → { status } | { body } | { cut: 位元組數 }
  down: false,
  log: [],
};
const fileFor = (path) => {
  for (const label of state.serve) {
    // 反向驗證（--in-place）：換拓樸後舊目錄的網址改送 IN_PLACE 目錄的檔案（舊的原地覆寫發布方式）
    const base = label === "inplace" ? LEGACY_PATH : PATHS[label];
    if (path.startsWith(base)) {
      const name = path.slice(base.length) || "index.html";
      if (name.includes("/") || name.includes("..")) return null;
      const file = join(DIRS[label], name);
      return existsSync(file) ? { label, name, file } : null;
    }
  }
  return null;
};
const reply = (req, res, path) => {
  const entry = {
    scenario: state.scenario,
    path,
    status: 0,
    label: null,
    sha256: null,
  };
  state.log.push(entry);
  if (state.down) {
    entry.status = -1;
    res.destroy();
    return;
  }
  const t = state.tamper[path];
  if (t && t.status) {
    entry.status = t.status;
    res.writeHead(t.status, { "Content-Type": "text/plain" });
    res.end("tampered");
    return;
  }
  const hit = fileFor(path);
  if (!hit && !(t && t.body)) {
    entry.status = 404;
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  const body = t && t.body ? t.body : readFileSync(hit.file);
  const etag = '"' + sha256(body).slice(0, 16) + '"';
  entry.label = t && t.body ? "tampered" : hit.label;
  entry.sha256 = sha256(body);
  const headers = {
    "Content-Type": TYPES[extname(path)] || "application/octet-stream",
    "Cache-Control": path.endsWith("index.service.worker.js")
      ? "max-age=0"
      : "max-age=600",
    ETag: etag,
  };
  if (req.headers["if-none-match"] === etag) {
    entry.status = 304;
    res.writeHead(304, headers);
    res.end();
    return;
  }
  if (t && t.cut !== undefined) {
    entry.status = 200;
    entry.cut = t.cut;
    res.writeHead(200, { ...headers, "Content-Length": body.length });
    res.write(body.subarray(0, t.cut));
    setTimeout(() => res.destroy(), 200);
    return;
  }
  entry.status = 200;
  res.writeHead(200, { ...headers, "Content-Length": body.length });
  res.end(req.method === "HEAD" ? undefined : body);
};
const server = createServer((req, res) => {
  const path = new URL(req.url, ORIGIN).pathname;
  if (path === "/seed.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<!doctype html><title>seed</title>");
    return;
  }
  if (state.hold && state.hold(path)) {
    state.held.push(() => reply(req, res, path));
    return;
  }
  reply(req, res, path);
});
/** 換成新拓樸：舊目錄＋版本目錄；反向驗證時舊目錄的網址改送 IN_PLACE（原地覆寫） */
const newTopology = () =>
  new Set(IN_PLACE ? ["inplace", "legacy", "v1"] : ["legacy", "v1"]);
const sockets = new Set();
server.on("connection", (s) => {
  sockets.add(s);
  s.on("close", () => sockets.delete(s));
});
await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

// ── 瀏覽器 ──
const pwDir = process.env.PLAYWRIGHT_DIR;
const { chromium } = require(pwDir ? join(pwDir, "playwright") : "playwright");
const contexts = [];
const newContext = async (options = {}) => {
  const dir = mkdtempSync(join(tmpdir(), "shenma-transition-"));
  const ctx = await chromium.launchPersistentContext(dir, {
    channel: process.env.BROWSER_CHANNEL || "chrome",
    headless: process.env.HEADED !== "1",
    viewport: { width: 1024, height: 700 },
    ...options,
  });
  contexts.push({ ctx, dir });
  return ctx;
};
const closeContext = async (ctx) => {
  const i = contexts.findIndex((c) => c.ctx === ctx);
  await ctx.close().catch(() => {});
  if (i >= 0) {
    rmSync(contexts[i].dir, { recursive: true, force: true });
    contexts.splice(i, 1);
  }
};
const FILES = ["index.html", "index.js", "index.pck", "index.wasm"];
/** 開一個頁面：記錄遊戲檔案的回應（sha256 辨認版本；wasm 太大時 Chrome 可能不給內容，記錄原因）與頁面錯誤 */
const openPage = async (ctx, url) => {
  const page = await ctx.newPage();
  const rec = { url, responses: [], errors: [] };
  page.on("pageerror", (e) => rec.errors.push(String(e.message).slice(0, 200)));
  page.on("response", async (r) => {
    const u = new URL(r.url());
    const name = u.pathname.split("/").pop();
    if (!FILES.includes(name)) return;
    const row = {
      path: u.pathname,
      status: r.status(),
      sw: r.fromServiceWorker(),
    };
    rec.responses.push(row);
    try {
      const body = await r.body();
      row.sha256 = sha256(body);
      row.is = whose(row.sha256);
    } catch (e) {
      row.bodyError = String(e.message).slice(0, 80);
    }
  });
  await page
    .goto(url, { waitUntil: "domcontentloaded" })
    .catch((e) => rec.errors.push("goto " + e.message));
  return { page, rec };
};
/** 等頁面的結果：引擎啟動（外殼頁的 #status 移除）或外殼頁顯示說明；版本守門可能自動重新載入一次 */
const outcome = async (page, ms = 120000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await page.evaluate(() => {
        if (document.readyState === "loading") return null;
        if (!document.getElementById("status")) return { started: true };
        const n = document.getElementById("status-notice");
        if (n && n.style.display === "block" && n.textContent.trim())
          return { notice: n.textContent.trim() };
        return null;
      });
      if (r) return r;
    } catch {
      // 重新載入中：再等一下
    }
    await page.waitForTimeout(250);
  }
  return { timeout: true };
};
/** 頁面看到的狀態：網址的版本、守門、控制它的 Service Worker、註冊、Cache Storage（遊戲檔案的 sha256 對照版本） */
const inspect = async (page) => {
  const info = await page.evaluate(async () => {
    const hex = (buf) =>
      [...new Uint8Array(buf)]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const out = {
      href: location.href,
      ver: new URL(location.href).searchParams.get("shenma_ver"),
      guard: !!window.__shenmaGuard,
      controller: navigator.serviceWorker.controller
        ? navigator.serviceWorker.controller.scriptURL
        : null,
      regs: (await navigator.serviceWorker.getRegistrations()).map(
        (r) => r.scope
      ),
      caches: {},
    };
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      out.caches[k] = {};
      for (const q of await c.keys()) {
        const name = new URL(q.url).pathname.split("/").pop();
        out.caches[k][name] = [
          "index.html",
          "index.js",
          "index.pck",
          "index.wasm",
        ].includes(name)
          ? hex(
              await crypto.subtle.digest(
                "SHA-256",
                await (await c.match(q)).arrayBuffer()
              )
            )
          : true;
      }
    }
    return out;
  });
  for (const files of Object.values(info.caches))
    for (const [n, v] of Object.entries(files))
      if (typeof v === "string") files[n] = whose(v);
  return info;
};
const served = (scenario, re) =>
  state.log.filter((e) => e.scenario === scenario && re.test(e.path));
const registerLegacy = async (ctx) => {
  const { page } = await openPage(ctx, ORIGIN + "/seed.html");
  const ok = await page.evaluate(async (scope) => {
    const r = await navigator.serviceWorker.register(
      scope + "index.service.worker.js"
    );
    for (
      let i = 0;
      i < 200 && (!r.active || r.active.state !== "activated");
      i++
    )
      await new Promise((x) => setTimeout(x, 50));
    return !!r.active && r.active.state === "activated";
  }, LEGACY_PATH);
  await page.close();
  return ok;
};
const waitHeld = async (n, ms = 60000) => {
  const end = Date.now() + ms;
  while (Date.now() < end && state.held.length < n)
    await new Promise((r) => setTimeout(r, 50));
  return state.held.length;
};
const release_ = () => {
  const held = state.held.splice(0);
  state.hold = null;
  for (const f of held) f();
  return held.length;
};
/** 回應的版本：某個檔案的所有回應（有內容的）都是 label 那一版 */
const allFrom = (rec, file, label) => {
  const rows = rec.responses.filter(
    (r) => r.path.endsWith("/" + file) && r.sha256
  );
  return rows.length > 0 && rows.every((r) => isFrom(r.is, label, file));
};

// ── 情境 ──

const checks = [];
const check = (scenario, name, pass, detail) => {
  checks.push({ scenario, name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${scenario} ${name}${pass ? "" : "  " + JSON.stringify(detail).slice(0, 600)}`
  );
};
const scenarios = {
  async S1() {
    const ctx = await newContext();
    const reg = await registerLegacy(ctx);
    state.hold = (p) =>
      p.startsWith(LEGACY_PATH) && /index\.(pck|wasm)$/.test(p);
    const A = await openPage(ctx, ORIGIN + LEGACY_PATH + "index.html");
    const heldN = await waitHeld(2);
    // 伺服器換成新拓樸（舊目錄不變＋版本目錄），之後才放行已開頁面的大檔
    state.serve = newTopology();
    const released = release_();
    const a = await outcome(A.page);
    const aInfo = await inspect(A.page);
    const B = await openPage(ctx, ORIGIN + PATHS.v1 + "index.html");
    const b = await outcome(B.page);
    const bInfo = await inspect(B.page);
    const legacyBig = served(
      "S1",
      /^\/games\/shenmaSanguo\/index\.(pck|wasm)$/
    );
    const r = {
      reg,
      heldN,
      released,
      a,
      aInfo,
      A: A.rec,
      legacyBig,
      b,
      bInfo,
      B: B.rec,
    };
    check(
      "S1",
      "前置：舊正式版 Service Worker 已啟用，舊頁面的引擎與資料包請求在伺服器換拓樸前被攔下",
      reg && heldN >= 2 && released >= 2,
      r
    );
    check(
      "S1",
      "伺服器換成新拓樸後才補完：舊頁面拿到的外殼頁、載入程式、資料包都是舊正式版，引擎與資料包由伺服器的舊目錄送出舊正式版，引擎正常啟動、沒有頁面錯誤",
      a.started &&
        allFrom(A.rec, "index.html", "legacy") &&
        allFrom(A.rec, "index.js", "legacy") &&
        allFrom(A.rec, "index.pck", "legacy") &&
        legacyBig.length >= 2 &&
        legacyBig.every(
          (e) =>
            e.label === "legacy" &&
            e.sha256 === shaOf("legacy", e.path.split("/").pop())
        ) &&
        A.rec.errors.length === 0 &&
        aInfo.controller === ORIGIN + LEGACY_PATH + "index.service.worker.js",
      r
    );
    check(
      "S1",
      "同一個瀏覽器開新入口（版本目錄）：外殼頁、載入程式、資料包都是 v1，網址帶 v1 的版本、由 v1 目錄的 Service Worker 控制，引擎正常啟動",
      b.started &&
        allFrom(B.rec, "index.html", "v1") &&
        allFrom(B.rec, "index.js", "v1") &&
        allFrom(B.rec, "index.pck", "v1") &&
        bInfo.ver === V1 &&
        bInfo.controller === ORIGIN + PATHS.v1 + "index.service.worker.js" &&
        B.rec.errors.length === 0,
      r
    );
    check(
      "S1",
      "新版啟用後舊正式版的快取還在（不同命名空間，沒有被刪）",
      Object.keys(bInfo.caches).some((k) =>
        k.startsWith("shenmaSanguo-sw-cache-")
      ) && Object.keys(bInfo.caches).includes("shenmaSanguo-pkg-" + V1),
      bInfo.caches
    );
    await closeContext(ctx);
    return r;
  },
  async S2() {
    const ctx = await newContext();
    const reg = await registerLegacy(ctx);
    const pre = await (async () => {
      const { page } = await openPage(ctx, ORIGIN + "/seed.html");
      const i = await inspect(page);
      await page.close();
      return i;
    })();
    state.serve = newTopology();
    const A = await openPage(ctx, ORIGIN + LEGACY_PATH + "index.html");
    const a = await outcome(A.page);
    const aInfo = await inspect(A.page);
    const legacyBig = served(
      "S2",
      /^\/games\/shenmaSanguo\/index\.(pck|wasm)$/
    );
    const r = { reg, preCaches: pre.caches, a, aInfo, A: A.rec, legacyBig };
    const legacyCache = Object.entries(pre.caches).find(([k]) =>
      k.startsWith("shenmaSanguo-sw-cache-")
    );
    check(
      "S2",
      "前置：舊正式版 Service Worker 只快取小檔（沒有引擎與資料包）",
      reg &&
        !!legacyCache &&
        !legacyCache[1]["index.pck"] &&
        !legacyCache[1]["index.wasm"] &&
        isFrom(legacyCache[1]["index.js"], "legacy", "index.js"),
      r
    );
    check(
      "S2",
      "換成新拓樸後才開舊頁面：引擎與資料包由舊目錄送出舊正式版，頁面拿到的都是舊正式版，引擎正常啟動",
      a.started &&
        allFrom(A.rec, "index.js", "legacy") &&
        allFrom(A.rec, "index.pck", "legacy") &&
        legacyBig.length >= 2 &&
        legacyBig.every((e) => e.label === "legacy") &&
        A.rec.errors.length === 0,
      r
    );
    await closeContext(ctx);
    return r;
  },
  async S3() {
    const ctx = await newContext();
    const A = await openPage(ctx, ORIGIN + LEGACY_PATH + "index.html");
    await outcome(A.page);
    // 舊模板的 Service Worker 第一次開啟時還沒控制頁面（引擎與資料包不經過它）：再開一次才會放進它的快取
    await A.page.waitForTimeout(1500);
    await A.page.reload({ waitUntil: "domcontentloaded" });
    const a0 = await outcome(A.page);
    // 舊模板的 Service Worker 放進快取不等完成（35 MB 的引擎要一點時間）：等到引擎與資料包都在快取裡（最多 30 秒）
    let before = await inspect(A.page);
    for (let i = 0; i < 60; i++) {
      const lc0 = Object.entries(before.caches).find(([k]) =>
        k.startsWith("shenmaSanguo-sw-cache-")
      );
      if (lc0 && lc0[1]["index.pck"] && lc0[1]["index.wasm"]) break;
      await A.page.waitForTimeout(500);
      before = await inspect(A.page);
    }
    // 還沒有時由測試補進同一個快取、同一個鍵（模板放進快取時用的是請求的完整網址；舊模板的 cache.put 沒有 waitUntil，
    // Service Worker 被回收時可能沒寫完）：內容一樣從伺服器的舊目錄取得。從範圍外的頁面寫（不經過舊模板的 Service Worker）
    const seed = (await openPage(ctx, ORIGIN + "/seed.html")).page;
    const filled = await seed.evaluate(async (path) => {
      const name = (await caches.keys()).find((k) =>
        k.startsWith("shenmaSanguo-sw-cache-")
      );
      if (!name) return null;
      const c = await caches.open(name);
      const added = [];
      for (const f of ["index.wasm", "index.pck"])
        if (!(await c.match(location.origin + path + f))) {
          await c.add(new Request(location.origin + path + f));
          added.push(f);
        }
      return added;
    }, LEGACY_PATH);
    await seed.close();
    if (filled && filled.length) before = await inspect(A.page);
    state.serve = newTopology();
    state.scenario = "S3-new";
    await A.page.reload({ waitUntil: "domcontentloaded" });
    const a = await outcome(A.page);
    const B = await openPage(ctx, ORIGIN + PATHS.v1 + "index.html");
    const b = await outcome(B.page);
    await B.page.waitForTimeout(2000);
    const after = await inspect(B.page);
    const legacyAfter = served("S3-new", /^\/games\/shenmaSanguo\//);
    const r = {
      a0,
      filledByTest: filled,
      before: before.caches,
      a,
      A: A.rec,
      b,
      B: B.rec,
      after: after.caches,
      legacyAfter,
    };
    const lc = (caches) =>
      Object.entries(caches).find(([k]) =>
        k.startsWith("shenmaSanguo-sw-cache-")
      );
    check(
      "S3",
      "前置：舊正式版開過（舊模板的 Service Worker 沒寫完時由測試補進同一個鍵，見 filledByTest），快取裡有舊正式版的引擎與資料包",
      a0.started &&
        !!lc(before.caches) &&
        isFrom(lc(before.caches)[1]["index.pck"], "legacy", "index.pck") &&
        isFrom(lc(before.caches)[1]["index.wasm"], "legacy", "index.wasm"),
      r
    );
    check(
      "S3",
      "換成新拓樸後重新整理舊頁面：從舊正式版的快取成套載入（伺服器沒有送出舊目錄的引擎與資料包），引擎正常啟動",
      a.started &&
        !legacyAfter.some(
          (e) => /index\.(pck|wasm)$/.test(e.path) && e.status === 200
        ) &&
        A.rec.errors.length === 0,
      r
    );
    check(
      "S3",
      "同時開新入口：v1 的成套檔案、引擎正常啟動；之後舊正式版的快取仍然完整（版本目錄的 Service Worker 不刪它）",
      b.started &&
        allFrom(B.rec, "index.js", "v1") &&
        allFrom(B.rec, "index.pck", "v1") &&
        !!lc(after.caches) &&
        isFrom(lc(after.caches)[1]["index.pck"], "legacy", "index.pck") &&
        isFrom(lc(after.caches)[1]["index.wasm"], "legacy", "index.wasm") &&
        isFrom(
          after.caches["shenmaSanguo-pkg-" + V1]?.["index.pck"],
          "v1",
          "index.pck"
        ),
      r
    );
    await closeContext(ctx);
    return r;
  },
  async S4() {
    // 停用 Service Worker：只剩 HTTP 快取（max-age 600）
    const ctx = await newContext({ serviceWorkers: "block" });
    const A = await openPage(ctx, ORIGIN + LEGACY_PATH + "index.html");
    const a0 = await outcome(A.page);
    state.serve = newTopology();
    state.scenario = "S4-new";
    await A.page.close();
    const A2 = await openPage(ctx, ORIGIN + LEGACY_PATH + "index.html");
    const a = await outcome(A2.page);
    const B = await openPage(ctx, ORIGIN + PATHS.v1 + "index.html");
    const b = await outcome(B.page);
    const bInfo = await inspect(B.page);
    const r = {
      a0,
      a,
      A2: A2.rec,
      b,
      B: B.rec,
      bInfo,
      log: served("S4-new", /./),
    };
    check(
      "S4",
      "停用 Service Worker、HTTP 快取有舊外殼頁：換成新拓樸後舊頁面拿到的外殼頁、載入程式、資料包都是舊正式版，引擎正常啟動",
      a0.started &&
        a.started &&
        allFrom(A2.rec, "index.html", "legacy") &&
        allFrom(A2.rec, "index.js", "legacy") &&
        allFrom(A2.rec, "index.pck", "legacy"),
      r
    );
    check(
      "S4",
      "停用 Service Worker 時新入口直接從網路載入 v1 目錄（沒有核對，保護只來自每一版網址不同）：拿到的都是 v1、沒有控制者，引擎正常啟動",
      b.started &&
        allFrom(B.rec, "index.html", "v1") &&
        allFrom(B.rec, "index.js", "v1") &&
        allFrom(B.rec, "index.pck", "v1") &&
        bInfo.controller === null,
      r
    );
    await closeContext(ctx);
    return r;
  },
  async S5() {
    if (!V2) return { skipped: "沒有 --v2" };
    state.serve = newTopology();
    const ctx = await newContext();
    const A = await openPage(ctx, ORIGIN + PATHS.v1 + "index.html");
    const a0 = await outcome(A.page);
    await A.page.waitForTimeout(3000);
    state.serve = new Set(["legacy", "v1", "v2"]);
    state.scenario = "S5-v2";
    const B = await openPage(ctx, ORIGIN + PATHS.v2 + "index.html");
    const b = await outcome(B.page);
    await B.page.waitForTimeout(2000);
    const bInfo = await inspect(B.page);
    const v2wasm = served("S5-v2", new RegExp(`^${PATHS.v2}index\\.wasm$`));
    state.scenario = "S5-v1-again";
    await A.page.reload({ waitUntil: "domcontentloaded" });
    const a = await outcome(A.page);
    const aInfo = await inspect(A.page);
    const v1net = served(
      "S5-v1-again",
      new RegExp(`^${PATHS.v1}index\\.(pck|wasm|js)$`)
    );
    const r = { a0, b, bInfo, B: B.rec, v2wasm, a, aInfo, A: A.rec, v1net };
    check(
      "S5",
      "v1 開著時發布 v2（同一個引擎）：v2 的外殼頁、載入程式、資料包都是 v2，由 v2 目錄的 Service Worker 控制；引擎從共用的引擎快取取得（伺服器沒有送出 v2 的 index.wasm）",
      a0.started &&
        b.started &&
        allFrom(B.rec, "index.html", "v2") &&
        allFrom(B.rec, "index.js", "v2") &&
        allFrom(B.rec, "index.pck", "v2") &&
        bInfo.ver === V2 &&
        bInfo.controller === ORIGIN + PATHS.v2 + "index.service.worker.js" &&
        v2wasm.filter((e) => e.status === 200).length === 0,
      r
    );
    check(
      "S5",
      "v1 的頁面還開著：v1 的快取保留；重新整理 v1 仍從 v1 自己的快取成套載入 v1（沒有網路請求），引擎正常啟動",
      a.started &&
        aInfo.ver === V1 &&
        isFrom(
          bInfo.caches["shenmaSanguo-pkg-" + V1]?.["index.pck"],
          "v1",
          "index.pck"
        ) &&
        v1net.filter((e) => e.status === 200).length === 0 &&
        A.rec.errors.length === 0,
      r
    );
    await closeContext(ctx);
    // v2 目錄的資料包網址被回成 v1 的內容（CDN／誤部署）：明確失敗，不交給頁面
    const ctx2 = await newContext();
    state.tamper = {
      [PATHS.v2 + "index.pck"]: {
        body: readFileSync(join(V1DIR, "index.pck")),
      },
    };
    const C = await openPage(ctx2, ORIGIN + PATHS.v2 + "index.html");
    const c = await outcome(C.page, 90000);
    state.tamper = {};
    const r2 = { c, C: C.rec };
    check(
      "S5",
      "v2 目錄的資料包被回成 v1 的內容：Service Worker 拒絕交付（503），頁面沒有拿到別版資料包，外殼頁顯示中文說明、引擎沒有啟動",
      !!c.notice &&
        !c.started &&
        !C.rec.responses.some(
          (x) => x.path.endsWith("/index.pck") && x.status === 200
        ) &&
        C.rec.responses.some(
          (x) => x.path.endsWith("/index.pck") && x.status === 503
        ),
      r2
    );
    await closeContext(ctx2);
    return { ...r, tamper: r2 };
  },
  async S6() {
    state.serve = newTopology();
    const run = async (label, tamper) => {
      const ctx = await newContext();
      state.tamper = tamper;
      const P = await openPage(ctx, ORIGIN + PATHS.v1 + "index.html");
      const o = await outcome(P.page, 90000);
      state.tamper = {};
      await closeContext(ctx);
      return { label, o, rec: P.rec };
    };
    const nf = await run("404", { [PATHS.v1 + "index.pck"]: { status: 404 } });
    const half = await run("cut", {
      [PATHS.v1 + "index.pck"]: { cut: 1000000 },
    });
    check(
      "S6",
      "v1 的資料包 404：明確失敗，外殼頁說明伺服器沒有提供 index.pck（HTTP 404），引擎沒有啟動",
      !nf.o.started &&
        /index\.pck/.test(nf.o.notice || "") &&
        /404/.test(nf.o.notice || ""),
      nf
    );
    check(
      "S6",
      "v1 的資料包下載到一半連線中斷：明確失敗（說明下載失敗或沒有下載完整），沒有交出不完整的資料包，引擎沒有啟動",
      !half.o.started &&
        /index\.pck/.test(half.o.notice || "") &&
        /失敗|不完整|沒有下載完整/.test(half.o.notice || "") &&
        !half.rec.responses.some(
          (x) => x.path.endsWith("/index.pck") && x.status === 200
        ),
      half
    );
    // 完整快取後離線
    const ctx = await newContext();
    const P = await openPage(ctx, ORIGIN + PATHS.v1 + "index.html");
    const o0 = await outcome(P.page);
    await P.page.waitForTimeout(3000);
    state.down = true;
    for (const s of sockets) s.destroy();
    state.scenario = "S6-offline";
    await P.page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    const o = await outcome(P.page);
    const info = await inspect(P.page);
    state.down = false;
    const offline = { o0, o, info, rec: P.rec, log: served("S6-offline", /./) };
    check(
      "S6",
      "v1 完整快取後伺服器離線：重新整理仍從快取成套載入 v1，引擎正常啟動",
      o0.started &&
        o.started &&
        info.ver === V1 &&
        offline.log.every((e) => e.status === -1),
      offline
    );
    await closeContext(ctx);
    return { nf, half, offline };
  },
};

const report = {
  inPlace: IN_PLACE,
  legacy: LEGACY,
  v1: { dir: V1DIR, version: V1 },
  v2: V2 ? { dir: V2DIR, version: V2 } : null,
  scenarios: {},
};
try {
  for (const [name, fn] of Object.entries(scenarios)) {
    if (ONLY && !ONLY.includes(name)) continue;
    state.serve = new Set(["legacy"]);
    state.scenario = name;
    state.tamper = {};
    state.hold = null;
    state.held = [];
    const t0 = Date.now();
    try {
      report.scenarios[name] = await fn();
    } catch (e) {
      report.scenarios[name] = {
        error: String((e && e.stack) || e).slice(0, 600),
      };
      check(name, "執行時發生例外", false, report.scenarios[name].error);
    }
    report.scenarios[name].seconds = Math.round((Date.now() - t0) / 1000);
  }
} finally {
  for (const { ctx, dir } of contexts.splice(0)) {
    await ctx.close().catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
  server.close();
}
report.checks = checks;
report.serverLog = state.log;
report.at = new Date().toISOString();
const failed = checks.filter((c) => !c.pass).length;
if (process.env.EVIDENCE_DIR) {
  mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(process.env.EVIDENCE_DIR, "release-transition.json"),
    JSON.stringify(report, null, 2) + "\n"
  );
}
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      total: checks.length,
      failed,
      skipped: Object.entries(report.scenarios)
        .filter(([, v]) => v.skipped)
        .map(([k]) => k),
    })
);
process.exit(failed || checks.length === 0 ? 1 : 0);
