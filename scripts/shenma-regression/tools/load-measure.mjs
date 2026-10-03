// 遊戲引擎的首次載入與回訪量測（本機，不連正式站、不呼叫後端）
// - 用 GitHub Pages 的方式提供遊戲目錄：可壓縮的檔案送 gzip（level 6）、ETag／Last-Modified、Cache-Control max-age（預設 600）、
//   If-None-Match 相同時回 304、不送 COOP／COEP。伺服器記錄每個請求實際送出的位元組（壓縮後）、狀態與時間
// - 直接開遊戲外殼頁（/games/shenmaSanguo/index.html，頂層），量到「引擎啟動」（外殼頁的 #status 移除）與 game_ready；
//   不經過網站頁面、不送關卡資料
// - 每一輪用新的使用者資料夾（launchPersistentContext，和一般使用者一樣有磁碟上的 HTTP 快取），依序量：
//     cold    第一次開啟（沒有 HTTP 快取、Service Worker 與 Cache Storage）
//     warm1   同一個瀏覽器再開一次
//     warm2   再開一次
//     update  伺服器換成 --update-dir 的新匯出（只有 index.pck／index.html／index.service.worker.js 不同，引擎相同），
//             照主頁的做法：舊的 Service Worker 先用快取開舊版，新的裝好後送 "update" 讓它接管並重新載入，量到新版的 game_ready
// - 設定：desktop（1280×800、不節流）；mobile（390×844、伺服器端限速與延遲、CPU 4 倍慢；不是實體手機）
// 用法：node scripts/shenma-regression/tools/load-measure.mjs --update-dir <新匯出目錄> [--dir <遊戲目錄，預設 out/games/shenmaSanguo>]
//        [--profile desktop|mobile] [--max-age 600] [--port 3100] [--label 名稱]
//   PLAYWRIGHT_DIR、BROWSER_CHANNEL（預設 chrome）同 run-browser.mjs；EVIDENCE_DIR 寫 load-measure-<label>.json
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  return i === -1 ? def : args[i + 1];
};
const DIR = resolve(ROOT, opt("--dir", "out/games/shenmaSanguo"));
const UPDATE_DIR = opt("--update-dir", null);
const PROFILE = opt("--profile", "desktop");
const MAX_AGE = Number(opt("--max-age", "600"));
const PORT = Number(opt("--port", "3100"));
const LABEL = opt("--label", `${PROFILE}-maxage${MAX_AGE}`);
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
if (!P || !existsSync(join(DIR, "index.html"))) {
  console.error(
    "用法：load-measure.mjs --update-dir <新匯出目錄> [--dir <遊戲目錄>] [--profile desktop|mobile] [--max-age 600]"
  );
  process.exit(2);
}
const GAME = "/games/shenmaSanguo/";
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

// ── 伺服器（Pages 的方式）──
let serveDir = DIR;
let phase = "idle";
const log = [];
const fileCache = new Map();
const load = (file) => {
  if (!fileCache.has(file)) {
    const raw = readFileSync(file);
    const ext = extname(file);
    fileCache.set(file, {
      raw,
      gz: COMPRESS.has(ext) ? gzipSync(raw, { level: 6 }) : null,
      etag:
        '"' + createHash("sha1").update(raw).digest("hex").slice(0, 16) + '"',
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
const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const entry = {
    phase,
    path: url.pathname,
    t0: Date.now(),
    status: 0,
    bytes: 0,
    enc: "",
  };
  log.push(entry);
  if (P.rttMs) await new Promise((r) => setTimeout(r, P.rttMs));
  const name = url.pathname.startsWith(GAME)
    ? url.pathname.slice(GAME.length)
    : null;
  const file =
    name && !name.includes("/") && !name.includes("..")
      ? join(serveDir, name || "index.html")
      : null;
  if (!file || !existsSync(file)) {
    entry.status = 404;
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    entry.t1 = Date.now();
    return;
  }
  const f = load(file);
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
const results = [];
const summarize = (name, t0, page) => {
  const reqs = log.filter((e) => e.phase === name);
  const by = (p) => reqs.filter((e) => e.path.endsWith(p));
  const pick = (p) =>
    by(p).map((e) => ({
      status: e.status,
      bytes: e.bytes,
      enc: e.enc,
      ms: (e.t1 || Date.now()) - e.t0,
      startMs: e.t0 - t0,
    }));
  return page
    .evaluate(() => window.__lm && window.__lm)
    .then((lm) => {
      const ev = lm && lm.events;
      const pr = (lm && lm.progress) || [];
      const at = (k) => {
        const hit = (ev || []).filter((x) => x[0] === k).pop();
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
    });
};
// Cache Storage 的內容：每個快取的檔名；index.pck／index.wasm／index.js 另記大小與 sha256 前 12 碼（核對是哪一版的檔案）
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
      out[k][name] = { bytes: buf.byteLength, sha256: hash.slice(0, 12) };
    }
  }
  return out;
};
const TIMEOUT = PROFILE === "mobile" ? 240000 : 120000;
const openGame = async (name) => {
  phase = name;
  for (const p of ctx.pages()) await p.close();
  const page = await ctx.newPage();
  if (P.cpu > 1)
    await (
      await ctx.newCDPSession(page)
    ).send("Emulation.setCPUThrottlingRate", { rate: P.cpu });
  const t0 = Date.now();
  await page.goto(`http://localhost:${PORT}${GAME}index.html`);
  await page.waitForFunction(
    () => window.__lm && window.__lm.events.some((x) => x[0] === "game_ready"),
    null,
    { timeout: TIMEOUT }
  );
  // 讓遊戲的 Service Worker 有時間把檔案放進快取（和使用者停留在頁面上相同）
  await page.waitForTimeout(3000);
  const r = await summarize(name, t0, page);
  // 外殼頁的版本守門：確認版本花的時間與結果（舊版外殼頁沒有守門時是 null）
  r.guard = await page.evaluate(() =>
    window.__shenmaGuard ? window.__shenmaGuard.stats : null
  );
  r.swControlled = await page.evaluate(
    () => !!navigator.serviceWorker.controller
  );
  r.swCaches = await page.evaluate(listCaches);
  results.push(r);
  console.log(
    `${name}: game_ready ${r.gameReadyMs} ms、引擎啟動 ${r.engineStartedMs} ms、送出 ${r.bytes} bytes（${r.requests} 個請求）；wasm ${JSON.stringify(r.wasm)}；pck ${JSON.stringify(r.pck)}`
  );
  return page;
};

try {
  await openGame("cold");
  await openGame("warm1");
  await openGame("warm2");
  if (UPDATE_DIR) {
    serveDir = resolve(ROOT, UPDATE_DIR);
    phase = "update";
    for (const p of ctx.pages()) await p.close();
    const page = await ctx.newPage();
    if (P.cpu > 1)
      await (
        await ctx.newCDPSession(page)
      ).send("Emulation.setCPUThrottlingRate", { rate: P.cpu });
    const t0 = Date.now();
    await page.goto(`http://localhost:${PORT}${GAME}index.html`);
    // 舊的 Service Worker 先用快取開舊版；新的裝好（waiting）後照主頁的做法送 "update"，它會接管並重新載入這一頁
    const oldReady = await page
      .waitForFunction(
        () =>
          window.__lm && window.__lm.events.some((x) => x[0] === "game_ready"),
        null,
        { timeout: TIMEOUT }
      )
      .then(() => Date.now() - t0)
      .catch(() => null);
    const waiting = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      for (let i = 0; i < 300 && reg && !reg.waiting; i++) {
        await reg.update().catch(() => {});
        await new Promise((r) => setTimeout(r, 200));
      }
      if (!reg || !reg.waiting) return false;
      reg.waiting.postMessage("update");
      return true;
    });
    const tReload = Date.now();
    if (waiting) {
      await page.waitForEvent("load", { timeout: TIMEOUT }).catch(() => {});
      await page.waitForFunction(
        () =>
          window.__lm && window.__lm.events.some((x) => x[0] === "game_ready"),
        null,
        { timeout: TIMEOUT }
      );
      await page.waitForTimeout(3000);
    }
    const r = await summarize("update", t0, page);
    r.oldVersionReadyMs = oldReady;
    r.guard = await page.evaluate(() =>
      window.__shenmaGuard ? window.__shenmaGuard.stats : null
    );
    r.newWorkerWaiting = waiting;
    r.reloadToReadyMs =
      r.gameReadyMs !== null ? r.gameReadyMs - (tReload - t0) : null;
    r.loadedPckSize = await page.evaluate(() =>
      typeof GODOT_CONFIG === "object"
        ? GODOT_CONFIG.fileSizes["index.pck"]
        : null
    );
    r.swCaches = await page.evaluate(listCaches);
    results.push(r);
    console.log(
      `update: 舊版 game_ready ${oldReady} ms、新版接管後 ${r.reloadToReadyMs} ms 就緒；送出 ${r.bytes} bytes；wasm ${JSON.stringify(r.wasm)}；pck ${JSON.stringify(r.pck)}；載入的 pck 大小 ${r.loadedPckSize}`
    );
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
const report = {
  label: LABEL,
  profile: PROFILE,
  network: P.kbps
    ? `${P.kbps} KB/s、往返 ${P.rttMs} ms（伺服器端模擬）`
    : "不節流（本機）",
  cpuThrottle: P.cpu,
  maxAge: MAX_AGE,
  dir: DIR,
  updateDir: UPDATE_DIR,
  sizes,
  results,
  at: new Date().toISOString(),
};
if (process.env.EVIDENCE_DIR) {
  mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(process.env.EVIDENCE_DIR, `load-measure-${LABEL}.json`),
    JSON.stringify(report, null, 2) + "\n"
  );
}
console.log(JSON.stringify({ sizes }, null, 0));
