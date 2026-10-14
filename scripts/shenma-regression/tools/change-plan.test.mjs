// 回歸選測與結果快取（tools/change-plan.mjs）的自我測試：在暫存的 git 倉庫上改動檔案，核對分類與計畫、
// 快取只引用相同內容的通過結果。不需要瀏覽器、dev server 或 Godot；不碰工作樹本身
// 用法：node scripts/shenma-regression/tools/change-plan.test.mjs
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  browserFingerprint,
  cacheKey,
  classify,
  digestOf,
  gitChanges,
  makePlan,
  openCache,
  sourceBlobs,
} from "./change-plan.mjs";

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail)}`
  );
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const dir = mkdtempSync(join(tmpdir(), "change-plan-"));
const git = (...args) =>
  execFileSync("git", ["-C", dir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
const put = (p, text) => {
  mkdirSync(dirname(join(dir, p)), { recursive: true });
  writeFileSync(join(dir, p), text);
};
const SG = "src/app/(games)/shenmaSanguo/";
const AREAS = {
  "map-editor": { scripts: ["map-editor-web.js", "map-editor-save-web.js"] },
  "save-conflict": { scripts: ["save-conflict-web.js"] },
  "enemy-column": { scripts: ["enemy-column-web.js"] },
  "hero-category": { scripts: ["hero-category-web.js"] },
  "battle-live": { scripts: ["battle-live-web.js", "panel-scope-web.js"] },
  release: { scripts: ["release-entry-web.js"] },
  "engine-version": { scripts: ["r10-web.js"] },
};
const FULL = [
  "i1-init.js",
  "i2-lifecycle.js",
  "normal-flows.js",
  "save-conflict-web.js",
  "map-editor-web.js",
  "map-editor-save-web.js",
  "hero-category-web.js",
  "settle-web.js",
  "enemy-column-web.js",
  "skill-charm-web.js",
  "battle-live-web.js",
  "panel-scope-web.js",
  "r10-web.js",
  "release-entry-web.js",
];
const opts = (extra = {}) => ({
  areas: AREAS,
  full: FULL,
  suite: join(dir, "scripts/shenma-regression"),
  ...extra,
});

try {
  git("init", "-q");
  git("config", "user.email", "t@example.invalid");
  git("config", "user.name", "t");
  git("config", "core.autocrlf", "false");
  put(".gitignore", "/node_modules\n");
  put(SG + "components/BattleLivePanel.tsx", "export const a = 1;\n");
  put("src/app/(tools)/mapEditor/utils/adminToken.ts", "export const t = 1;\n");
  put("docs/a.md", "# a\n");
  put("scripts/shenma-regression/skill-charm-web.js", "async () => 1\n");
  put("scripts/shenma-regression/battle-live-web.js", "async () => 2\n");
  put(
    "scripts/shenma-regression/map-editor-save-web.js",
    'async () => readFileSync("fixtures/map-config-snapshot.json")\n'
  );
  put("scripts/shenma-regression/fixtures/map-config-snapshot.json", "{}\n");
  put("godot/shenmaSanguo/main/Main.gd", "extends Node\n");
  git("add", "-A");
  git("commit", "-q", "-m", "base");

  // ── 分類與計畫 ──
  put("src/app/(tools)/mapEditor/utils/adminToken.ts", "export const t = 2;\n"); // 修改
  unlinkSync(join(dir, "scripts/shenma-regression/skill-charm-web.js")); // 刪除
  git("mv", "docs/a.md", "docs/b.md"); // 改名（已暫存）
  put("scripts/shenma-regression/fixtures/map-config-snapshot.json", "{ }\n"); // 測試資料
  put(SG + "weird/New.tsx", "export {};\n"); // 未追蹤、沒有規則
  const changes = gitChanges(dir);
  const byPath = Object.fromEntries(changes.map((c) => [c.path, c.status]));
  check(
    "改動清單：修改 M、刪除 D、改名 R（記得舊路徑）、未追蹤 ?，路徑裡的括號與中文不被引號包起來",
    byPath["src/app/(tools)/mapEditor/utils/adminToken.ts"] === "M" &&
      byPath["scripts/shenma-regression/skill-charm-web.js"] === "D" &&
      byPath["docs/b.md"] === "R" &&
      changes.find((c) => c.path === "docs/b.md").from === "docs/a.md" &&
      byPath[SG + "weird/New.tsx"] === "?" &&
      changes.length === 5,
    changes
  );
  const plan = makePlan(changes, opts());
  check(
    "未分類：沒有規則的產品檔案明確列出（不靜默略過）",
    same(plan.unknown, [SG + "weird/New.tsx"]),
    plan.unknown
  );
  check(
    "地圖編輯器的管理密碼 → 地圖編輯器、存檔衝突（管理密碼）等功能；測試資料 → 內容提到這個檔名的腳本；刪除的腳本不執行；文件不跑",
    same(plan.browser.scripts, [
      "save-conflict-web.js",
      "map-editor-web.js",
      "map-editor-save-web.js",
      "hero-category-web.js",
      "enemy-column-web.js",
    ]) &&
      !plan.browser.full &&
      plan.files.find((f) => f.path.endsWith("skill-charm-web.js")).note ===
        "刪除的腳本不再執行" &&
      plan.files
        .filter((f) => f.path.startsWith("docs/"))
        .every((f) => !f.tests),
    plan.browser.scripts
  );
  check(
    "估時：選出的腳本加總，並列出完整的秒數比較",
    plan.browser.seconds > 0 &&
      plan.browser.fullSeconds > plan.browser.seconds &&
      plan.estimateSeconds >= plan.browser.seconds,
    plan.browser
  );
  const plan2 = makePlan(
    [{ status: "M", path: SG + "components/BattleLivePanel.tsx" }],
    opts()
  );
  check(
    "唯讀顯示（戰況）→ 戰況＋煙霧測試（兩個入口開戰、換場、結算），normal-flows 前面補 i1-init，不跑完整",
    same(plan2.browser.scripts, [
      "i1-init.js",
      "i2-lifecycle.js",
      "normal-flows.js",
      "settle-web.js",
      "battle-live-web.js",
      "panel-scope-web.js",
    ]) && !plan2.browser.full,
    plan2.browser
  );
  const plan3 = makePlan(
    [{ status: "M", path: "godot/shenmaSanguo/main/Main.gd" }],
    opts()
  );
  check(
    "遊戲引擎原始碼 → Godot 完整、重新匯出、瀏覽器完整（附理由）",
    plan3.godot.full &&
      plan3.export.needed &&
      plan3.browser.full &&
      same(plan3.browser.scripts, FULL) &&
      plan3.browser.reasons.length === 1,
    plan3
  );
  const plan4 = makePlan(
    [
      {
        status: "M",
        path: "public/games/shenmaSanguo-v/0123456789abcdef/index.service.worker.js",
      },
    ],
    opts()
  );
  check(
    "版本目錄的 Service Worker／匯出模板 → 瀏覽器完整＋建置後用靜態匯出跑",
    plan4.browser.full && plan4.build.needed,
    plan4
  );
  const plan4b = makePlan(
    [
      { status: "M", path: "public/games/shenmaSanguo/index.pck" },
      { status: "M", path: SG + "utils/gameRelease.json" },
    ],
    opts()
  );
  check(
    "舊正式版目錄或網站入口指標有改 → 跑發布入口與遊戲版本的瀏覽器腳本、建置後用靜態匯出跑（不是未分類）",
    plan4b.browser.scripts.includes("release-entry-web.js") &&
      plan4b.browser.scripts.includes("r10-web.js") &&
      plan4b.build.needed &&
      plan4b.unknown.length === 0,
    plan4b
  );
  const plan5 = makePlan(
    [{ status: "?", path: "scripts/shenma-regression/new-thing-web.js" }],
    opts()
  );
  check(
    "新的瀏覽器腳本不在完整清單：不執行，列在要人判斷",
    plan5.browser.scripts.length === 0 &&
      plan5.review.some((r) => r.includes("new-thing-web.js")),
    plan5
  );
  check(
    "分類規則：文件、Node 規則測試、未分類",
    classify("docs/x.md").none === true &&
      classify("scripts/shenma-regression/web/a.test.mjs").quickOnly === true &&
      classify(SG + "weird/New.tsx") === null,
    null
  );

  // ── 內容 fingerprint 與快取 ──
  const roots = ["src", "scripts/shenma-regression", "godot/shenmaSanguo"];
  const b1 = sourceBlobs(dir, roots);
  const fp1 = digestOf(b1);
  const env = { mode: "dev" };
  const cache = openCache(dir);
  const k1 = cacheKey({ name: "quick" }, fp1, env);
  cache.record(k1, { pass: true, seconds: 1 });
  check("同內容同環境：引用通過的結果", !!cache.hit(k1), null);
  check(
    "同內容但靜態匯出（out）：不引用開發模式的結果",
    !cache.hit(cacheKey({ name: "quick" }, fp1, { mode: "out" })),
    null
  );
  check(
    "同內容但不同後端程式：不引用",
    !cache.hit(
      cacheKey({ name: "quick" }, fp1, { mode: "dev", gasFile: "abc" })
    ),
    null
  );
  put("docs/c.md", "# 文件\n");
  check(
    "只加了文件（.md）：fingerprint 不變",
    digestOf(sourceBlobs(dir, roots)) === fp1,
    null
  );
  put(SG + "components/BattleLivePanel.tsx", "export const a = 2;\n");
  const b2 = sourceBlobs(dir, roots);
  const fp2 = digestOf(b2);
  check(
    "來源內容改了：fingerprint 不同，舊的通過不再引用",
    fp2 !== fp1 && !cache.hit(cacheKey({ name: "quick" }, fp2, env)),
    null
  );
  put(SG + "components/BattleLivePanel.tsx", "export const a = 1;\n");
  check(
    "改回原本的內容（mtime 不同）：fingerprint 相同，可以引用",
    digestOf(sourceBlobs(dir, roots)) === fp1 && !!cache.hit(k1),
    null
  );
  const k3 = cacheKey({ name: "fail" }, fp1, env);
  cache.record(k3, { pass: false });
  cache.record(k1, null);
  check(
    "失敗或中斷（沒有結果）不記錄成通過；同一個鍵後來失敗時移除舊的通過",
    !cache.hit(k3) && !cache.hit(k1),
    null
  );
  cache.record(k1, { pass: true, seconds: 1 });
  cache.save();
  check("存檔後重新開啟仍可引用", !!openCache(dir).hit(k1), null);

  // ── 瀏覽器腳本的 fingerprint：只看產品來源、它自己與 harness ──
  const fA = browserFingerprint(b1, "battle-live-web.js");
  put("scripts/shenma-regression/map-editor-save-web.js", "async () => 3\n");
  const fB = browserFingerprint(sourceBlobs(dir, roots), "battle-live-web.js");
  put("scripts/shenma-regression/battle-live-web.js", "async () => 4\n");
  const fC = browserFingerprint(sourceBlobs(dir, roots), "battle-live-web.js");
  put("scripts/shenma-regression/web/x.test.mjs", "1\n");
  const fD = browserFingerprint(sourceBlobs(dir, roots), "battle-live-web.js");
  put(SG + "components/BattleLivePanel.tsx", "export const a = 9;\n");
  const fE = browserFingerprint(sourceBlobs(dir, roots), "battle-live-web.js");
  check(
    "瀏覽器腳本：只改另一支腳本或 Node 規則測試時不變（可引用）；改它自己或產品來源時改變",
    fA === fB && fB !== fC && fC === fD && fD !== fE,
    { fA, fB, fC, fD, fE }
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// ── 完整／局部／環境：用 run-tier.mjs 的真實流程（--browser-only、執行器替身、暫存的快取目錄）──
{
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
  const tmp = mkdtempSync(join(tmpdir(), "tier-cache-"));
  try {
    const pw = join(tmp, "pw");
    mkdirSync(join(pw, "playwright"), { recursive: true });
    writeFileSync(
      join(pw, "playwright", "package.json"),
      JSON.stringify({ version: "1.0.0-stub" })
    );
    const stubLog = join(tmp, "ran.log");
    const ranCount = () => {
      try {
        return readFileSync(stubLog, "utf8").split("\n").filter(Boolean).length;
      } catch {
        return 0;
      }
    };
    /** 跑一次 run-tier related map-editor（兩支腳本）；回傳這次實際執行的支數、引用的支數與結束碼 */
    const tier = (env = {}) => {
      const before = ranCount();
      const r = spawnSync(
        "node",
        [
          join(ROOT, "scripts/shenma-regression/tools/run-tier.mjs"),
          "related",
          "map-editor",
          "--browser-only",
        ],
        {
          cwd: ROOT,
          encoding: "utf8",
          env: {
            PATH: process.env.PATH,
            SystemRoot: process.env.SystemRoot,
            SHENMA_TIER_RUNNER: join(
              ROOT,
              "scripts/shenma-regression/fixtures/tier-runner-stub.mjs"
            ),
            SHENMA_REGRESSION_CACHE_DIR: join(tmp, "cache"),
            PLAYWRIGHT_DIR: pw,
            EVIDENCE_DIR: join(tmp, "ev"),
            STUB_LOG: stubLog,
            ...env,
          },
        }
      );
      const out = r.stdout || "";
      return {
        ran: ranCount() - before,
        reused: (out.match(/^REUSED {2}\S+/gm) || []).length,
        status: r.status,
        noCache: /瀏覽器腳本不使用快取/.test(out),
        out: out.slice(-400),
      };
    };
    const engineA = join(tmp, "engineA");
    mkdirSync(engineA);
    writeFileSync(join(engineA, "index.pck"), "pck A");
    const backend = join(tmp, "backend.mjs");
    writeFileSync(
      backend,
      'import { x } from "./dep.mjs";\nexport const createBackend = () => x;\n'
    );
    writeFileSync(join(tmp, "dep.mjs"), "export const x = 1;\n");

    const partial = tier({ MAP_EDITOR_ONLY: "map-backend-check" });
    const fullAfterPartial = tier();
    const fullAgain = tier();
    const partialAgain = tier({ MAP_EDITOR_ONLY: "map-backend-check" });
    const otherPartial = tier({ MAP_EDITOR_ONLY: "another-section" });
    check(
      "局部（MAP_EDITOR_ONLY）通過後，完整的執行不引用它（兩支都重跑）；完整再跑一次才引用；同樣的選段引用局部的紀錄，不同的選段重跑",
      partial.ran === 2 &&
        fullAfterPartial.ran === 2 &&
        fullAfterPartial.reused === 0 &&
        fullAgain.ran === 0 &&
        fullAgain.reused === 2 &&
        partialAgain.ran === 0 &&
        otherPartial.ran === 2,
      { partial, fullAfterPartial, fullAgain, partialAgain, otherPartial }
    );
    const e1 = tier({ ENGINE_DIR: engineA });
    const e2 = tier({ ENGINE_DIR: engineA });
    writeFileSync(join(engineA, "index.pck"), "pck A changed");
    const e3 = tier({ ENGINE_DIR: engineA });
    const b1 = tier({ GAS_BACKEND: backend });
    const b2 = tier({ GAS_BACKEND: backend });
    writeFileSync(join(tmp, "dep.mjs"), "export const x = 2;\n");
    const b3 = tier({ GAS_BACKEND: backend });
    const v2 = tier({ STUB_BROWSER_VERSION: "2.0" });
    check(
      "環境：ENGINE_DIR 的內容、GAS_BACKEND 匯入的檔案、瀏覽器版本改變時重跑；相同時引用",
      e1.ran === 2 &&
        e2.ran === 0 &&
        e3.ran === 2 &&
        b1.ran === 2 &&
        b2.ran === 0 &&
        b3.ran === 2 &&
        v2.ran === 2,
      { e1, e2, e3, b1, b2, b3, v2 }
    );
    const f1 = tier({ STUB_BROWSER_VERSION: "3.0", STUB_RESULT: "fail" });
    const f2 = tier({ STUB_BROWSER_VERSION: "3.0" });
    const c1 = tier({ STUB_BROWSER_VERSION: "4.0", STUB_RESULT: "crash" });
    const c2 = tier({ STUB_BROWSER_VERSION: "4.0" });
    const z1 = tier({ STUB_BROWSER_VERSION: "5.0", STUB_RESULT: "zero" });
    const z2 = tier({ STUB_BROWSER_VERSION: "5.0" });
    check(
      "失敗、中斷（沒有結果）、沒有斷言的「通過」都不記錄：之後同樣的內容與環境照樣重跑；它們本身結束碼非 0",
      f1.status !== 0 &&
        f2.ran === 2 &&
        c1.status !== 0 &&
        c2.ran === 2 &&
        z1.status !== 0 &&
        z2.ran === 2,
      { f1, f2, c1, c2, z1, z2 }
    );
    const p1 = tier({ STUB_BROWSER_VERSION: "6.0", STUB_PROBE_FAIL: "1" });
    const p2 = tier({ STUB_BROWSER_VERSION: "6.0" });
    const m1 = tier({ GAS_BACKEND: join(tmp, "missing.mjs") });
    const m2 = tier({ GAS_BACKEND: join(tmp, "missing.mjs") });
    check(
      "算不出內容的環境輸入（讀不到瀏覽器版本、GAS_BACKEND 不存在）：說明不使用快取、照跑也不記錄",
      p1.noCache &&
        p1.ran === 2 &&
        p2.ran === 2 &&
        m1.noCache &&
        m1.ran === 2 &&
        m2.ran === 2,
      { p1, p2, m1, m2 }
    );
    const cacheFile = join(tmp, "cache", "results.json");
    const data = JSON.parse(readFileSync(cacheFile, "utf8"));
    data.old = { pass: true, seconds: 1, at: "2026-10-03" };
    writeFileSync(cacheFile, JSON.stringify(data));
    const reopened = openCache(ROOT, {
      SHENMA_REGRESSION_CACHE_DIR: join(tmp, "cache"),
    });
    check(
      "快取格式升版：舊格式的紀錄開啟時移除、不引用；紀錄都有範圍、斷言數與原始結果的 sha256",
      reopened.dropped === 1 &&
        !reopened.hit("old") &&
        Object.values(data)
          .filter((r) => r.format)
          .every(
            (r) =>
              (r.scope === "full" || r.scope === "partial") &&
              r.assertions.total > 0 &&
              /^[0-9a-f]{64}$/.test(r.rawSha256)
          ),
      { dropped: reopened.dropped }
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
