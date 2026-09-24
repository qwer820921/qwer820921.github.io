// 不經 Playwright MCP，直接用 Node 依序執行瀏覽器回歸腳本（同一個 browser context）
// 用法：node scripts/shenma-regression/tools/run-browser.mjs harness.js i1-init.js r4-web.js r5-web.js
// - 腳本和 MCP 用的是同一批檔案（async (page) => {...}），第一支必須是 harness.js
// - 每支腳本的原始回傳寫到 harness 的證據目錄：<腳本名>.raw.json
// - PLAYWRIGHT_DIR：playwright 套件所在的 node_modules 目錄（專案本身沒有安裝 playwright）
// - BROWSER_CHANNEL：預設 chrome（和 Playwright MCP 一樣使用系統的 Chrome）；HEADED=1 會顯示視窗
// - 前置：npm run dev（http://localhost:3000）
// 任何一支腳本 allPass 不是 true（或執行時拋出例外）時結束碼為 1
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const SUITE = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = resolve(SUITE, "../..");
const pwDir = process.env.PLAYWRIGHT_DIR;
const { chromium } = require(pwDir ? join(pwDir, "playwright") : "playwright");

const files = process.argv.slice(2);
if (files[0] !== "harness.js") {
  console.error(
    "用法：run-browser.mjs harness.js <情境腳本...>（第一支必須是 harness.js）"
  );
  process.exit(2);
}
process.chdir(ROOT); // 腳本內的截圖路徑是倉庫相對路徑

const browser = await chromium.launch({
  channel: process.env.BROWSER_CHANNEL || "chrome",
  headless: process.env.HEADED !== "1",
});
const context = await browser.newContext({ acceptDownloads: true });
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
    writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
    const isHarness = file === "harness.js";
    const pass = isHarness ? !result?.error : result?.allPass === true;
    if (!pass) failed += 1;
    const asserts = result?.assertions || [];
    const count = isHarness
      ? ""
      : `${asserts.filter((a) => a.pass).length}/${asserts.length}`;
    const seconds = Math.round((Date.now() - started) / 1000);
    const why = (result?.failures || []).join("；") || result?.error || "";
    console.log(
      `${pass ? "PASS" : "FAIL"}  ${file}  ${count}  ${seconds}s  ${out}  ${why}`.trim()
    );
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
