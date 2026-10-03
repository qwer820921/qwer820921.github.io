// run-tier.mjs 自我測試用的瀏覽器執行器替身（SHENMA_TIER_RUNNER）：不開瀏覽器，照 run-browser.mjs 的輸出格式回報結果。
// 只給 tools/change-plan.test.mjs 使用
// - --probe：印出 BROWSER_PROBE（版本取 STUB_BROWSER_VERSION，預設 1.0）；STUB_PROBE_FAIL=1 時不印、結束碼 1
// - harness.js <腳本...>：每支腳本在 STUB_LOG 記一行（確認有沒有實際執行），依 STUB_RESULT 回報
//   pass（預設）／fail／zero（通過但沒有斷言）／crash（這支沒有結果就結束）；設了 MAP_EDITOR_ONLY 時回報 onlySections
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

const args = process.argv.slice(2);
if (args[0] === "--probe") {
  if (process.env.STUB_PROBE_FAIL === "1") process.exit(1);
  console.log(
    "BROWSER_PROBE " +
      JSON.stringify({
        channel: "stub",
        version: process.env.STUB_BROWSER_VERSION || "1.0",
        headless: true,
      })
  );
  process.exit(0);
}
const dir = process.env.EVIDENCE_DIR || ".";
mkdirSync(dir, { recursive: true });
const result = process.env.STUB_RESULT || "pass";
const only = String(process.env.MAP_EDITOR_ONLY || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
let failed = 0;
for (const file of args) {
  if (file === "harness.js") {
    console.log(`PASS  harness.js    0s  ${join(dir, "harness.raw.json")}`);
    console.log(
      "RESULT_JSON " +
        JSON.stringify({
          script: file,
          pass: true,
          assertions: { passed: 0, total: 0 },
          scope: "full",
        })
    );
    continue;
  }
  if (process.env.STUB_LOG) appendFileSync(process.env.STUB_LOG, file + "\n");
  if (result === "crash") process.exit(1);
  const total = result === "zero" ? 0 : 3;
  const pass = result !== "fail" && total > 0;
  if (!pass) failed++;
  const raw = { allPass: result !== "fail", assertions: [] };
  if (only.length) raw.onlySections = only;
  const rawPath = join(dir, file.replace(/\.js$/, "") + ".raw.json");
  const rawText = JSON.stringify(raw) + "\n";
  writeFileSync(rawPath, rawText);
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${file}  ${total}/${total}  0s  ${rawPath}`
  );
  console.log(
    "RESULT_JSON " +
      JSON.stringify({
        script: file,
        pass,
        seconds: 0,
        assertions: { passed: total, total },
        scope: only.length ? "partial" : "full",
        only,
        skipped: [],
        raw: rawPath,
        rawSha256: createHash("sha256").update(rawText).digest("hex"),
      })
  );
}
process.exit(failed ? 1 : 0);
