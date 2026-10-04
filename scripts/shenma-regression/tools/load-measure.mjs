// 遊戲引擎的首次載入、回訪與換版量測（本機，不連正式站、不呼叫後端）
// - 用 GitHub Pages 的方式提供遊戲包：可壓縮的檔案送 gzip（level 6）、ETag／Last-Modified、Cache-Control max-age（預設 600）、
//   If-None-Match 相同時回 304、不送 COOP／COEP。伺服器記錄每個請求實際送出的位元組（壓縮後）、狀態、時間與內容的 sha256
// - 遊戲包放在發布時的網址（見 tools/game-release.mjs）：版本目錄（經過 postexport 的匯出）在 /games/shenmaSanguo-v/<版本>/，
//   舊正式版（和 release/legacy-root.json 相同的目錄）在 /games/shenmaSanguo/。直接開遊戲外殼頁（頂層），量到
//   「引擎啟動」（外殼頁的 #status 移除）與 game_ready；不經過網站頁面、不送關卡資料
// - 每一輪用新的使用者資料夾（launchPersistentContext，和一般使用者一樣有磁碟上的 HTTP 快取），依序量：
//     cold    第一次開啟（沒有 HTTP 快取、Service Worker 與 Cache Storage）
//     warm1   同一個瀏覽器再開一次
//     warm2   再開一次
//     update  （有 --update-dir 時）網站入口換成另一個遊戲包：同一個瀏覽器開新包的外殼頁（網站的 iframe 改指新目錄的情況，
//             例如發布新版本、或回退到舊正式版），量這一次開啟到 game_ready
// - 每一輪都核對「真的載入了目標包」，不把沒更新、混版或逾時當成成功：頁面網址是目標包的目錄、有版本守門的包網址帶它的版本
//   而且由它目錄的 Service Worker 控制；這一輪頁面拿到的外殼頁／載入程式／資料包（回應內容的 sha256）、伺服器送出的檔案、
//   快取裡的引擎與資料包都是目標包的內容；沒有向其他包的目錄要遊戲檔案；時間由這一次開啟起算而且大於 0；請求數有上限（不無限重試）。
//   任何一項不符：結果寫明 failed 與原因，結束碼 1
// - 前置檢查（不符時結束碼 2，不開瀏覽器）：遊戲包必要的檔案都在；版本目錄自我一致（外殼頁、Service Worker、EXPECTED、版本）；
//   舊正式版和 legacy-root.json 相同；兩個包不能是同一版、也不能放在同一個網址（原地覆寫）
// - 反向驗證：--tamper-update <檔名> 讓 update 那一輪的目標包網址改送原本那個包的同名檔案（CDN／HTTP 快取回舊內容）；
//   index.html＝新網址還是舊外殼頁（仍是舊版），index.pck＝新外殼頁配舊資料包。兩者都應該失敗（結束碼 1）
// - 設定：desktop（1280×800、不節流）；mobile（390×844、伺服器端限速與延遲、CPU 4 倍慢；不是實體手機）
// 用法：node scripts/shenma-regression/tools/load-measure.mjs [--dir <遊戲包，預設網站入口的版本目錄>] [--update-dir <另一個遊戲包>]
//        [--profile desktop|mobile] [--max-age 600] [--port 3100] [--label 名稱] [--tamper-update index.pck|index.html]
//   PLAYWRIGHT_DIR、BROWSER_CHANNEL（預設 chrome）同 run-browser.mjs；EVIDENCE_DIR 寫 load-measure-<label>.json
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import {
  LEGACY_MANIFEST,
  LEGACY_PATH,
  PACKAGES_DIR,
  PACKAGES_PATH,
  packageProblems,
  readRelease,
} from "./game-release.mjs";
import { stripCR } from "./postexport.mjs";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i === -1 ? def : args[i + 1];
};
const release = readRelease(ROOT);
const DEFAULT_DIR =
  release.entry === "legacy"
    ? "public/games/shenmaSanguo"
    : `${PACKAGES_DIR}/${release.entry}`;
const DIR = resolve(ROOT, opt("--dir", DEFAULT_DIR));
const UPDATE_DIR = opt("--update-dir", null)
  ? resolve(ROOT, opt("--update-dir"))
  : null;
const PROFILE = opt("--profile", "desktop");
const MAX_AGE = Number(opt("--max-age", "600"));
const PORT = Number(opt("--port", "3100"));
const LABEL = opt("--label", `${PROFILE}-maxage${MAX_AGE}`);
const TAMPER = opt("--tamper-update", null);
/** 一輪最多的遊戲相關請求數：超過就是重試失控（不是正常載入） */
const MAX_REQUESTS = 120;
const PROFILES = {
  desktop: {
    viewport: { width: 1280, height: 800 },
    kbps: 0,
    rttMs: 0,
    cpu: 1,
  },
  // 約 10 Mbps 下行（1250 KB/s）、往返 150 ms、CPU 4 倍慢
  mobile: {
    viewport: { width: 390, height: 844 },
    kbps: 1250,
    rttMs: 150,
    cpu: 4,
  },
};
const P = PROFILES[PROFILE];

const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const isText = (buf) => !buf.subarray(0, 8000).includes(0);
const report = {
  label: LABEL,
  profile: PROFILE,
  maxAge: MAX_AGE,
  dir: DIR,
  updateDir: UPDATE_DIR,
  tamperUpdate: TAMPER,
  ok: false,
  failures: [],
  results: [],
};
const writeReport = () => {
  report.at = new Date().toISOString();
  if (!process.env.EVIDENCE_DIR) return;
  mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(process.env.EVIDENCE_DIR, `load-measure-${LABEL}.json`),
    JSON.stringify(report, null, 2) + "\n"
  );
};

// ── 前置檢查：遊戲包是哪一種、完整、放在哪個網址 ──
/** 舊正式版：檔案和 legacy-root.json 相同（文字檔 CRLF 視為 LF） */
function legacyPackage(dir) {
  const manifest = JSON.parse(
    readFileSync(join(ROOT, LEGACY_MANIFEST), "utf8")
  );
  const problems = [];
  for (const [f, e] of Object.entries(manifest.files)) {
    if (!existsSync(join(dir, f))) {
      problems.push(`缺少 ${f}`);
      continue;
    }
    const buf = readFileSync(join(dir, f));
    const data = isText(buf) ? stripCR(buf) : buf;
    if (data.length !== e.bytes || sha256(data) !== e.sha256)
      problems.push(`${f} 和舊正式版（${manifest.source.slice(0, 8)}）不同`);
  }
  return problems;
}
/** 遊戲包：{ kind: 'version'|'legacy', version, path, dir, files: 檔名 → sha256（伺服器送出的原始內容） } 或 { problems } */
function describePackage(dir, role) {
  if (!dir || !existsSync(dir) || !statSync(dir).isDirectory())
    return { problems: [`${role}：目錄不存在 ${dir}`] };
  const files = {};
  for (const f of readdirSync(dir))
    if (statSync(join(dir, f)).isFile())
      files[f] = sha256(readFileSync(join(dir, f)));
  const html = existsSync(join(dir, "index.html"))
    ? readFileSync(join(dir, "index.html"), "utf8")
    : "";
  if (html.includes("window.__shenmaGuard")) {
    const { version, problems } = packageProblems(dir);
    if (problems.length)
      return { problems: problems.map((p) => `${role}（版本目錄）：${p}`) };
    return {
      kind: "version",
      version,
      path: `${PACKAGES_PATH}${version}/`,
      dir,
      files,
    };
  }
  const problems = legacyPackage(dir);
  if (problems.length)
    return {
      problems: [
        `${role}：不是經過 postexport 的版本目錄，也不是舊正式版（${problems.join("、")}）`,
      ],
    };
  return { kind: "legacy", version: null, path: LEGACY_PATH, dir, files };
}
const pre = [];
if (!P) pre.push(`不認得的 --profile ${PROFILE}`);
const base = describePackage(DIR, "--dir");
const update = UPDATE_DIR ? describePackage(UPDATE_DIR, "--update-dir") : null;
pre.push(...(base.problems || []), ...((update && update.problems) || []));
if (!pre.length && update) {
  if (update.path === base.path)
    pre.push(
      `兩個包會放在同一個網址 ${base.path}（原地覆寫）：發布方式是每一版自己的目錄，舊正式版目錄不覆寫`
    );
  if (update.kind === "version" && update.version === base.version)
    pre.push("--update-dir 和 --dir 是同一版，量不到換版");
}
if (TAMPER && !["index.pck", "index.html"].includes(TAMPER))
  pre.push("--tamper-update 只接受 index.pck 或 index.html");
if (TAMPER && !update) pre.push("--tamper-update 需要 --update-dir");
if (pre.length) {
  report.failures = pre.map((p) => "前置檢查：" + p);
  writeReport();
  console.error("前置檢查失敗（沒有開始量測）：\n  " + pre.join("\n  "));
  process.exit(2);
}
const PACKAGES = { base, ...(update ? { update } : {}) };
const ownerOf = (hash) =>
  Object.entries(PACKAGES)
    .filter(([, p]) => Object.values(p.files).includes(hash))
    .map(([k]) => k);

// ── 伺服器（Pages 的方式）──
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".pck": "application/octet-stream",
  ".png": "image/png",
  ".ogg": "audio/ogg",
};
const COMPRESS = new Set([".html", ".js", ".json", ".wasm", ".pck"]);
let phase = "idle";
let serving = new Set(["base"]);
let tamperNow = false;
const log = [];
const fileCache = new Map();
const load = (file) => {
  if (!fileCache.has(file)) {
    const raw = readFileSync(file);
    const ext = extname(file);
    fileCache.set(file, {
      raw,
      sha256: sha256(raw),
      gz: COMPRESS.has(ext) ? gzipSync(raw, { level: 6 }) : null,
      etag: '"' + sha256(raw).slice(0, 16) + '"',
      type: TYPES[ext] || "application/octet-stream",
    });
  }
  return fileCache.get(file);
};
// 全部回應共用的限速（模擬同一條網路）：每 16 KB 等待足夠的時間
let nextFree = 0;
const pace = async (bytes) => {
  if (!P.kbps) return;
  const now = Date.now();
  const start = Math.max(now, nextFree);
  nextFree = start + (bytes / 1024 / P.kbps) * 1000;
  if (nextFree > now) await new Promise((r) => setTimeout(r, nextFree - now));
};
const resolveFile = (pathname) => {
  for (const key of serving) {
    const pkg = PACKAGES[key];
    if (!pathname.startsWith(pkg.path)) continue;
    const name = pathname.slice(pkg.path.length) || "index.html";
    if (name.includes("/") || name.includes("..")) return null;
    // 反向驗證：update 包的網址改送原本那個包的同名檔案
    const dir =
      key === "update" && tamperNow && name === TAMPER ? base.dir : pkg.dir;
    const file = join(dir, name);
    return existsSync(file) ? { key, name, file } : null;
  }
  return null;
};
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const entry = {
    phase,
    path: url.pathname,
    t0: Date.now(),
    status: 0,
    bytes: 0,
    enc: "",
    pkg: null,
    sha256: null,
  };
  log.push(entry);
  if (P.rttMs) await new Promise((r) => setTimeout(r, P.rttMs));
  const hit = resolveFile(url.pathname);
  if (!hit) {
    entry.status = 404;
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    entry.t1 = Date.now();
    return;
  }
  const f = load(hit.file);
  entry.pkg = hit.key;
  entry.sha256 = f.sha256;
  const headers = {
    "Content-Type": f.type,
    "Cache-Control": `max-age=${MAX_AGE}`,
    ETag: f.etag,
    "Last-Modified": "Sat, 03 Oct 2026 00:00:00 GMT",
    Vary: "Accept-Encoding",
  };
  if (req.headers["if-none-match"] === f.etag) {
    entry.status = 304;
    res.writeHead(304, headers);
    res.end();
    entry.t1 = Date.now();
    return;
  }
  const gzip = f.gz && /\bgzip\b/.test(req.headers["accept-encoding"] || "");
  const body = gzip ? f.gz : f.raw;
  if (gzip) headers["Content-Encoding"] = "gzip";
  headers["Content-Length"] = body.length;
  entry.status = 200;
  entry.enc = gzip ? "gzip" : "identity";
  res.writeHead(200, headers);
  for (let i = 0; i < body.length && req.method !== "HEAD"; i += 16384) {
    const chunk = body.subarray(i, i + 16384);
    await pace(chunk.length);
    if (!res.write(chunk)) await new Promise((r) => res.once("drain", r));
    entry.bytes += chunk.length;
  }
  res.end();
  entry.t1 = Date.now();
});
await new Promise((r) => server.listen(PORT, r));

// ── 瀏覽器 ──
const pwDir = process.env.PLAYWRIGHT_DIR;
const { chromium } = require(pwDir ? join(pwDir, "playwright") : "playwright");
const userData = mkdtempSync(join(tmpdir(), "shenma-load-"));
const ctx = await chromium.launchPersistentContext(userData, {
  channel: process.env.BROWSER_CHANNEL || "chrome",
  headless: process.env.HEADED !== "1",
  viewport: P.viewport,
});
await ctx.addInitScript(() => {
  window.__lm = { events: [], progress: [] };
  const mark = (k) => window.__lm.events.push([k, Date.now()]);
  // 外殼頁進度條（#status-progress）的值：每 100 ms 取樣，改變時記錄 [時間, value, max]
  // （Service Worker 下載與核對時由版本守門顯示；直接下載時是 Godot 的進度）
  const sample = () => {
    const bar = document.getElementById("status-progress");
    if (bar && bar.style.display === "block" && bar.hasAttribute("value")) {
      const last = window.__lm.progress[window.__lm.progress.length - 1];
      const v = Number(bar.value);
      const m = Number(bar.max);
      if (!last || last[1] !== v || last[2] !== m)
        window.__lm.progress.push([Date.now(), v, m]);
    }
    if (!window.__lm.events.some((x) => x[0] === "game_ready"))
      setTimeout(sample, 100);
  };
  setTimeout(sample, 100);
  addEventListener("message", (e) => {
    if (e.data && e.data.type === "game_ready") mark("game_ready");
  });
  const watch = () => {
    const s = document.getElementById("status");
    if (!s) return false;
    new MutationObserver(() => {
      if (
        !document.getElementById("status") &&
        !window.__lm.events.some((x) => x[0] === "engine_started")
      )
        mark("engine_started");
    }).observe(document.body, { childList: true });
    return true;
  };
  if (!watch()) document.addEventListener("DOMContentLoaded", watch);
});
// Cache Storage：每個快取的檔名；index.pck／index.wasm／index.js 另記大小與 sha256（核對是哪一個包的檔案）
const listCaches = async () => {
  const out = {};
  for (const k of await caches.keys()) {
    const c = await caches.open(k);
    out[k] = {};
    for (const q of await c.keys()) {
      const name = q.url.split("/").pop();
      if (!["index.pck", "index.wasm", "index.js"].includes(name)) {
        out[k][name] = true;
        continue;
      }
      const buf = await (await c.match(q)).arrayBuffer();
      const hash = [
        ...new Uint8Array(await crypto.subtle.digest("SHA-256", buf)),
      ]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      out[k][name] = { bytes: buf.byteLength, sha256: hash };
    }
  }
  return out;
};
const TIMEOUT = PROFILE === "mobile" ? 240000 : 120000;
const summarize = (name, t0, lm) => {
  const reqs = log.filter((e) => e.phase === name);
  const pick = (p) =>
    reqs
      .filter((e) => e.path.endsWith("/" + p))
      .map((e) => ({
        status: e.status,
        bytes: e.bytes,
        enc: e.enc,
        pkg: e.pkg,
        ms: (e.t1 || Date.now()) - e.t0,
        startMs: e.t0 - t0,
      }));
  const ev = (lm && lm.events) || [];
  const pr = (lm && lm.progress) || [];
  const at = (k) => {
    const hit = ev.filter((x) => x[0] === k).pop();
    return hit ? hit[1] - t0 : null;
  };
  return {
    name,
    requests: reqs.length,
    bytes: reqs.reduce((t, e) => t + e.bytes, 0),
    wasm: pick("index.wasm"),
    pck: pick("index.pck"),
    js: pick("index.js"),
    html: pick("index.html"),
    sw: pick("index.service.worker.js"),
    engineStartedMs: at("engine_started"),
    gameReadyMs: at("game_ready"),
    // 進度條：取樣到的不同值的個數、是否一路不減、第一個與最後一個（值／總共）
    progress: {
      samples: pr.length,
      nonDecreasing: pr.every((x, i) => i === 0 || x[1] >= pr[i - 1][1]),
      first: pr.length ? `${pr[0][1]}/${pr[0][2]}` : null,
      last: pr.length
        ? `${pr[pr.length - 1][1]}/${pr[pr.length - 1][2]}`
        : null,
    },
  };
};
/**
 * 核對這一輪真的載入了目標包 target（'base'／'update'）；回傳問題清單
 * r.responses：頁面拿到的遊戲檔案（回應內容的 sha256；wasm 太大時 Chrome 可能不給內容）；r.page：頁面狀態；r.swCaches：快取
 */
function verify(name, target, r) {
  const pkg = PACKAGES[target];
  const problems = [];
  const reqs = log.filter((e) => e.phase === name);
  if (r.timeout) problems.push(`等不到 game_ready（${TIMEOUT / 1000} 秒）`);
  if (!(r.gameReadyMs > 0))
    problems.push(
      `game_ready 時間不是這一次開啟之後的正數（${r.gameReadyMs}）`
    );
  if (r.page.path !== pkg.path + "index.html")
    problems.push(`頁面不是目標包的外殼頁（${r.page.path}）`);
  if (pkg.kind === "version") {
    if (r.page.ver !== pkg.version)
      problems.push(
        `頁面網址的版本是 ${r.page.ver}，不是目標包 ${pkg.version}`
      );
    if (
      r.page.controller !==
      `http://localhost:${PORT}${pkg.path}index.service.worker.js`
    )
      problems.push(
        `控制頁面的 Service Worker 不是目標包的（${r.page.controller}）`
      );
  }
  for (const f of ["index.html", "index.js", "index.pck"]) {
    const rows = r.responses.filter((x) => x.file === f && x.sha256);
    if (!rows.length) problems.push(`頁面沒有拿到可核對的 ${f}`);
    else if (!rows.every((x) => x.sha256 === pkg.files[f]))
      problems.push(
        `頁面拿到的 ${f} 不是目標包的（${rows.map((x) => ownerOf(x.sha256).join("|") || "其他").join("、")}）`
      );
  }
  // 引擎：伺服器送出的要是目標包的；沒有送出（快取）時快取裡的引擎要是目標包的
  const wasmSent = reqs.filter(
    (e) => e.path.endsWith("/index.wasm") && e.status === 200
  );
  if (wasmSent.some((e) => e.sha256 !== pkg.files["index.wasm"]))
    problems.push("伺服器送出的 index.wasm 不是目標包的");
  const cachedWasm = Object.values(r.swCaches)
    .map((c) => c["index.wasm"])
    .filter((x) => x && x.sha256);
  const pageWasm = r.responses.filter(
    (x) => x.file === "index.wasm" && x.sha256
  );
  if (
    !wasmSent.length &&
    !pageWasm.length &&
    !cachedWasm.some((x) => x.sha256 === pkg.files["index.wasm"])
  )
    problems.push("找不到目標包的 index.wasm（伺服器沒送、快取裡也沒有）");
  if (pageWasm.some((x) => x.sha256 !== pkg.files["index.wasm"]))
    problems.push("頁面拿到的 index.wasm 不是目標包的");
  // 資料包：有版本守門的包放進快取前核對過，快取裡這一版的資料包要是目標包的
  if (pkg.kind === "version") {
    const mine = r.swCaches["shenmaSanguo-pkg-" + pkg.version] || {};
    if (
      !mine["index.pck"] ||
      mine["index.pck"].sha256 !== pkg.files["index.pck"]
    )
      problems.push("目標包這一版的快取裡沒有它的資料包");
  }
  const foreign = reqs.filter(
    (e) => e.path.startsWith("/games/") && !e.path.startsWith(pkg.path)
  );
  if (foreign.length)
    problems.push(
      `向其他目錄要了遊戲檔案：${[...new Set(foreign.map((e) => e.path))].slice(0, 4).join("、")}`
    );
  if (reqs.length > MAX_REQUESTS)
    problems.push(
      `這一輪的請求有 ${reqs.length} 個（上限 ${MAX_REQUESTS}，重試失控）`
    );
  return problems;
}
const openGame = async (name, target) => {
  phase = name;
  for (const p of ctx.pages()) await p.close();
  const page = await ctx.newPage();
  const responses = [];
  page.on("response", async (res) => {
    const file = new URL(res.url()).pathname.split("/").pop();
    if (!["index.html", "index.js", "index.pck", "index.wasm"].includes(file))
      return;
    const row = { file, status: res.status(), sw: res.fromServiceWorker() };
    responses.push(row);
    try {
      row.sha256 = sha256(await res.body());
    } catch (e) {
      row.bodyError = String(e.message).slice(0, 60);
    }
  });
  if (P.cpu > 1)
    await (
      await ctx.newCDPSession(page)
    ).send("Emulation.setCPUThrottlingRate", { rate: P.cpu });
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}${PACKAGES[target].path}index.html`);
  const timeout = await page
    .waitForFunction(
      () =>
        window.__lm && window.__lm.events.some((x) => x[0] === "game_ready"),
      null,
      { timeout: TIMEOUT }
    )
    .then(() => false)
    .catch(() => true);
  // 讓遊戲的 Service Worker 有時間把檔案放進快取（和使用者停留在頁面上相同）
  if (!timeout) await page.waitForTimeout(3000);
  const lm = await page.evaluate(() => window.__lm).catch(() => null);
  const r = summarize(name, t0, lm);
  r.target = target;
  r.timeout = timeout;
  // 外殼頁的版本守門：確認版本花的時間與結果（舊正式版沒有守門時是 null）
  r.guard = await page
    .evaluate(() => (window.__shenmaGuard ? window.__shenmaGuard.stats : null))
    .catch(() => null);
  r.page = await page
    .evaluate(() => ({
      path: location.pathname,
      ver: new URL(location.href).searchParams.get("shenma_ver"),
      controller: navigator.serviceWorker.controller
        ? navigator.serviceWorker.controller.scriptURL
        : null,
      notice:
        (document.getElementById("status-notice") || {}).textContent || null,
    }))
    .catch(() => ({ path: null }));
  r.loadedPckSize = await page
    .evaluate(() =>
      typeof GODOT_CONFIG === "object"
        ? GODOT_CONFIG.fileSizes["index.pck"]
        : null
    )
    .catch(() => null);
  r.swCaches = await page.evaluate(listCaches).catch(() => ({}));
  r.responses = responses;
  r.problems = verify(name, target, r);
  r.ok = r.problems.length === 0;
  results.push(r);
  console.log(
    `${name}（${PACKAGES[target].kind} ${PACKAGES[target].version || "legacy"}）：${r.ok ? "OK" : "FAILED"} game_ready ${r.gameReadyMs} ms、引擎啟動 ${r.engineStartedMs} ms、` +
      `送出 ${r.bytes} bytes（${r.requests} 個請求）；wasm ${JSON.stringify(r.wasm.map((x) => x.status))}；pck ${JSON.stringify(r.pck.map((x) => x.status))}` +
      (r.ok ? "" : `；問題：${r.problems.join("；")}`)
  );
  return page;
};

const results = report.results;
try {
  await openGame("cold", "base");
  await openGame("warm1", "base");
  await openGame("warm2", "base");
  if (update) {
    // 網站入口換成另一個包：伺服器同時有兩個包（原本的目錄不刪），同一個瀏覽器開新包的外殼頁
    serving = new Set(["base", "update"]);
    tamperNow = !!TAMPER;
    await openGame("update", "update");
  }
} finally {
  await ctx.close();
  server.close();
  rmSync(userData, { recursive: true, force: true });
}

const sizes = {};
for (const n of ["index.wasm", "index.pck", "index.js", "index.html"]) {
  const f = load(join(DIR, n));
  sizes[n] = {
    raw: f.raw.length,
    gzip6: f.gz ? f.gz.length : null,
    gzip9: f.gz ? gzipSync(f.raw, { level: 9 }).length : null,
  };
}
report.network = P.kbps
  ? `${P.kbps} KB/s、往返 ${P.rttMs} ms（伺服器端模擬）`
  : "不節流（本機）";
report.cpuThrottle = P.cpu;
report.packages = Object.fromEntries(
  Object.entries(PACKAGES).map(([k, p]) => [
    k,
    { kind: p.kind, version: p.version, path: p.path, dir: p.dir },
  ])
);
report.sizes = sizes;
report.failures = results
  .filter((r) => !r.ok)
  .map((r) => `${r.name}：${r.problems.join("；")}`);
report.ok = report.failures.length === 0 && results.length > 0;
writeReport();
console.log(
  JSON.stringify({ ok: report.ok, failures: report.failures, sizes }, null, 0)
);
process.exit(report.ok ? 0 : 1);
