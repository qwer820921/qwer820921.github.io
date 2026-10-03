// 不經 Playwright MCP，直接用 Node 依序執行瀏覽器回歸腳本（同一個 browser context）
// 用法：node scripts/shenma-regression/tools/run-browser.mjs harness.js i1-init.js r4-web.js r5-web.js
// - 腳本和 MCP 用的是同一批檔案（async (page) => {...}），第一支必須是 harness.js
// - 每支腳本的原始回傳寫到 harness 的證據目錄：<腳本名>.raw.json
// - PLAYWRIGHT_DIR：playwright 套件所在的 node_modules 目錄（專案本身沒有安裝 playwright）
// - BROWSER_CHANNEL：預設 chrome（和 Playwright MCP 一樣使用系統的 Chrome）；HEADED=1 會顯示視窗
// - 前置：npm run dev（http://localhost:3000）
// - EVIDENCE_DIR：證據目錄（預設是 harness.js 裡的 EVIDENCE）；不同批次用不同目錄，避免互相覆寫
// - ENGINE_DIR：反向驗證用的遊戲檔案目錄（支援的情境腳本會改用這個目錄的遊戲，見 README）
// - GAS_BACKEND：多分頁情境（save-conflict-web.js）的共用後端模組（export createBackend），沒有設定時用腳本內建的契約 mock
// - LOCAL_ASSETS=1：驗證正式靜態匯出時使用（前置改成 tools/serve-out.mjs）。正式版的 _next 資源指向
//   https://qwer820921.github.io/（assetPrefix），這些請求一律由本機 out/ 回應，不會連到正式站
// 任何一支腳本 allPass 不是 true（或執行時拋出例外）、或沒有任何斷言時結束碼為 1
// 每支腳本另外印一行 RESULT_JSON：通過與否、斷言數、範圍（腳本回傳 onlySections／skippedSections 時是 partial）、
//   原始結果的路徑與 sha256（run-tier.mjs 依此記錄快取）
// run-browser.mjs --probe：只啟動瀏覽器，印出 BROWSER_PROBE（channel、實際版本、有沒有顯示視窗）後結束
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const SUITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(SUITE, "../..");
const pwDir = process.env.PLAYWRIGHT_DIR;
const { chromium } = require(pwDir ? join(pwDir, "playwright") : "playwright");

const files = process.argv.slice(2);
const launchOptions = {
  channel: process.env.BROWSER_CHANNEL || "chrome",
  headless: process.env.HEADED !== "1",
};
if (files[0] === "--probe") {
  const b = await chromium.launch(launchOptions);
  console.log(
    "BROWSER_PROBE " +
      JSON.stringify({
        channel: launchOptions.channel,
        version: b.version(),
        headless: launchOptions.headless,
      })
  );
  await b.close();
  process.exit(0);
}
if (files[0] !== "harness.js") {
  console.error(
    "用法：run-browser.mjs harness.js <情境腳本...>（第一支必須是 harness.js）"
  );
  process.exit(2);
}
process.chdir(ROOT); // 腳本內的截圖路徑是倉庫相對路徑

const browser = await chromium.launch(launchOptions);
const context = await browser.newContext({ acceptDownloads: true });
if (process.env.EVIDENCE_DIR) {
  // harness 讀取這個目錄當作證據目錄（截圖與 *.raw.json 都寫在這裡）
  mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
  context.__shenmaEvidence = process.env.EVIDENCE_DIR;
}
if (process.env.ENGINE_DIR) {
  // 反向驗證用：遊戲的 index.html／index.pck／index.service.worker.js 改由這個目錄提供（例如刻意改壞後匯出的遊戲），
  // 情境腳本讀 context.__shenmaEngineDir 自行攔截
  context.__shenmaEngineDir = process.env.ENGINE_DIR;
}
if (process.env.GAS_BACKEND) {
  // 共用後端（多分頁情境用）：模組的 createBackend() 取代情境腳本內建的契約 mock，
  // 例如用本機模擬的試算表執行後端程式。模組路徑相對於倉庫根目錄
  const mod = await import(
    pathToFileURL(resolve(ROOT, process.env.GAS_BACKEND)).href
  );
  context.__shenmaGasBackendFactory = mod.createBackend;
}
if (process.env.LOCAL_ASSETS === "1") {
  const { resolveOutPath, contentType } = await import("./serve-out.mjs");
  await context.route("https://qwer820921.github.io/**", (route) => {
    const file = resolveOutPath(new URL(route.request().url()).pathname);
    return file
      ? route.fulfill({
          status: 200,
          contentType: contentType(file),
          body: readFileSync(file),
        })
      : route.fulfill({ status: 404, body: "not in out/" });
  });
}
const page = await context.newPage();
let failed = 0;
try {
  for (const file of files) {
    const script = new Function(
      `return (${readFileSync(join(SUITE, file), "utf8")});`
    )();
    const started = Date.now();
    let result;
    try {
      result = await script(page);
    } catch (e) {
      result = { allPass: false, error: String((e && e.stack) || e) };
    }
    const evidence = context.__shenma?.H?.EVIDENCE;
    if (!evidence) throw new Error("harness 沒有安裝成功，找不到證據目錄");
    const out = join(evidence, file.replace(/\.js$/, "") + ".raw.json");
    const rawText = JSON.stringify(result, null, 2) + "\n";
    writeFileSync(out, rawText);
    const isHarness = file === "harness.js";
    const asserts = result?.assertions || [];
    // 沒有任何斷言的「通過」不算通過（例如選段名稱打錯、整支都跳過）
    const noAssertions = !isHarness && asserts.length === 0;
    const pass = isHarness
      ? !result?.error
      : result?.allPass === true && !noAssertions;
    if (!pass) failed += 1;
    const count = isHarness
      ? ""
      : `${asserts.filter((a) => a.pass).length}/${asserts.length}`;
    const seconds = Math.round((Date.now() - started) / 1000);
    const why =
      (result?.failures || []).join("；") ||
      result?.error ||
      (noAssertions ? "沒有任何斷言" : "");
    console.log(
      `${pass ? "PASS" : "FAIL"}  ${file}  ${count}  ${seconds}s  ${out}  ${why}`.trim()
    );
    const only = result?.onlySections || [];
    const skipped = result?.skippedSections || [];
    console.log(
      "RESULT_JSON " +
        JSON.stringify({
          script: file,
          pass,
          seconds,
          assertions: {
            passed: asserts.filter((a) => a.pass).length,
            total: asserts.length,
          },
          scope: only.length || skipped.length ? "partial" : "full",
          only,
          skipped,
          raw: out,
          rawSha256: createHash("sha256").update(rawText).digest("hex"),
        })
    );
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
