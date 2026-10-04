// 回歸工具自我測試：用刻意製造的 fixture 確認 verify-export.mjs 與 check-log.mjs
// 「該失敗時一定失敗、允許的差異才放行」。不需要 Godot，也不會修改傳入的目錄。
// 用法：node selftest.mjs <交付產物目錄，例如 public/games/shenmaSanguo-v/<版本>> [--keep-temp]
// 結束碼：0 = 每個 fixture 的結果都符合預期；1 = 有工具誤判
// fixture 放在這次建立的暫存目錄：全部符合預期而且結果已存到 EVIDENCE_DIR 時刪除，其他情況保留（見 temp-dir.mjs）
import { spawnSync } from "node:child_process";
import { cpSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maskNodeIds, parsePck } from "./pck.mjs";
import { createTempDir, finishTempDir } from "./temp-dir.mjs";
import {
  VERSION_PLACEHOLDER,
  htmlVersionOf,
  maskHtmlVersion,
  versionOf,
} from "./postexport.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = process.argv.slice(2).find((a) => a !== "--keep-temp");
if (!publicDir) {
  console.error("用法：node selftest.mjs <交付產物目錄>");
  process.exit(2);
}
const tmp = createTempDir("shenma-selftest-");
const root = tmp.dir;
const base = join(root, "base");
cpSync(publicDir, base, { recursive: true });

const run = (tool, args) =>
  spawnSync(process.execPath, [join(here, tool), ...args], {
    encoding: "utf8",
  });

// 在 pck 副本中改動某個檔案內容的一個 byte（offsetOf 回傳該檔案內要改的位置）
function patchPck(dir, entryTest, offsetOf) {
  const path = join(dir, "index.pck");
  const buf = readFileSync(path);
  const pck = parsePck(path);
  const [name, entry] = [...pck.files].find(([n]) => entryTest(n));
  const at = entry.offset + offsetOf(entry.data);
  buf[at] ^= 0xff;
  writeFileSync(path, buf);
  return name;
}
const nodeIdsStart = (data) => maskNodeIds(data).hits[0].start;
// 經過匯出後處理的 Service Worker 記錄了 index.pck 的 sha256，版本（外殼頁與 Service Worker）也由它決定：
// 照 postexport.mjs 的方式跟著更新（真正重新匯出時也是這樣；Service Worker 的 VERSION 與 CACHE_VERSION 都是版本）。
// withVersion=false 時只更新 EXPECTED、版本不動
function syncExpectedPck(dir, withVersion = true) {
  const sw = join(dir, "index.service.worker.js");
  const text = readFileSync(sw, "utf8");
  const m = text.match(/^const EXPECTED = (\{.*\});$/m);
  if (!m) return;
  const exp = JSON.parse(m[1]);
  exp["index.pck"].sha256 = createHash("sha256")
    .update(readFileSync(join(dir, "index.pck")))
    .digest("hex");
  let out = text.replace(
    m[0],
    () => "const EXPECTED = " + JSON.stringify(exp) + ";"
  );
  const htmlPath = join(dir, "index.html");
  const html = readFileSync(htmlPath, "utf8");
  if (withVersion && htmlVersionOf(html)) {
    const version = versionOf(maskHtmlVersion(html), exp);
    const newHtml = maskHtmlVersion(html).replace(
      `'${VERSION_PLACEHOLDER}'`,
      `'${version}'`
    );
    writeFileSync(htmlPath, newHtml);
    const data = Buffer.from(newHtml, "utf8");
    exp["index.html"] = {
      ...exp["index.html"],
      bytes: data.length,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
    out = out
      .replace(
        /^const EXPECTED = \{.*\};$/m,
        () => "const EXPECTED = " + JSON.stringify(exp) + ";"
      )
      .replace(
        /^const VERSION = '[0-9a-f]{16}';$/m,
        () => `const VERSION = '${version}';`
      )
      .replace(
        /^const CACHE_VERSION = '[^'\n]*';$/m,
        () => `const CACHE_VERSION = '${version}';`
      );
  }
  writeFileSync(sw, out);
}

let n = 0;
function variant(label, mutate) {
  const dir = join(root, `case-${++n}`);
  cpSync(base, dir, { recursive: true });
  const note = mutate(dir);
  return { label: note ? `${label}（${note}）` : label, dir };
}
const editText = (dir, file, fn) =>
  writeFileSync(
    join(dir, file),
    fn(readFileSync(join(dir, file), "latin1")),
    "latin1"
  );

const exportCases = [
  [variant("完全相同", () => {}), 0],
  [
    variant(
      "SW 的 CACHE_VERSION 不是這一版的版本（例如匯出時間戳，沒有經過現在的匯出後處理）",
      (d) =>
        editText(d, "index.service.worker.js", (s) =>
          s.replace(/CACHE_VERSION = '[^']*'/, "CACHE_VERSION = 'selftest|1'")
        )
    ),
    1,
  ],
  [
    variant(
      "只改 .scn 的 node_ids（Service Worker 記錄的 index.pck sha256 與版本都照匯出後處理跟著更新）",
      (d) => {
        const name = patchPck(d, (x) => x.endsWith("Main.scn"), nodeIdsStart);
        syncExpectedPck(d);
        return name;
      }
    ),
    0,
  ],
  [
    variant(
      "只改 .scn 的 node_ids，但 Service Worker 記錄的 index.pck sha256 沒有更新",
      (d) => patchPck(d, (x) => x.endsWith("Main.scn"), nodeIdsStart)
    ),
    1,
  ],
  [
    variant(
      "只改 .scn 的 node_ids，EXPECTED 跟著更新但版本（外殼頁與 Service Worker）沒有重算",
      (d) => {
        const name = patchPck(d, (x) => x.endsWith("Main.scn"), nodeIdsStart);
        syncExpectedPck(d, false);
        return name;
      }
    ),
    1,
  ],
  [
    variant("外殼頁的版本和 Service Worker 不同", (d) =>
      editText(d, "index.html", (h) =>
        h.replace(
          /^(\tconst VERSION = ')[0-9a-f]{16}(';)$/m,
          "$10123456789abcdef$2"
        )
      )
    ),
    1,
  ],
  [
    variant("背景音樂改一個 byte", (d) => {
      const p = join(d, "bgm_battle.ogg");
      const b = readFileSync(p);
      b[100] ^= 0xff;
      writeFileSync(p, b);
    }),
    1,
  ],
  [
    variant("index.js 只有換行不同（CRLF 與 LF 互換）", (d) =>
      editText(d, "index.js", (s) =>
        s.includes("\r\n") ? s.replace(/\r\n/g, "\n") : s.replace(/\n/g, "\r\n")
      )
    ),
    0,
  ],
  [
    variant("改 .gdc 一個 byte", (d) =>
      patchPck(
        d,
        (x) => x.endsWith("WaveManager.gdc"),
        (data) => data.length - 1
      )
    ),
    1,
  ],
  [
    variant("改 .scn 的 node_ids 以外內容", (d) =>
      patchPck(
        d,
        (x) => x.endsWith("Main.scn"),
        () => 40
      )
    ),
    1,
  ],
  [
    variant("改 uid_cache.bin", (d) =>
      patchPck(
        d,
        (x) => x.endsWith("uid_cache.bin"),
        () => 20
      )
    ),
    1,
  ],
  [
    variant("改 SW 的 CACHE_VERSION 以外內容", (d) =>
      editText(d, "index.service.worker.js", (s) =>
        s.replace(
          "CACHE_PREFIX + CACHE_VERSION",
          "CACHE_PREFIX + 'x' + CACHE_VERSION"
        )
      )
    ),
    1,
  ],
  [
    variant("index.html 多一個字", (d) =>
      editText(d, "index.html", (s) => s + " ")
    ),
    1,
  ],
  [
    variant("交付產物多一個檔案", (d) =>
      writeFileSync(join(d, "extra.txt"), "x")
    ),
    1,
  ],
];

const writeLog = (name, lines) => {
  const p = join(root, name);
  writeFileSync(p, lines.join("\n") + "\n");
  return p;
};
const okResult = (total) =>
  `RESULT_JSON {"total":${total},"failed":0,"results":[]}`;
const logCases = [
  [
    "import",
    "匯入 log 乾淨",
    writeLog("import-ok.log", ["Godot Engine v4.6.2", "WARNING: 只是警告"]),
    0,
  ],
  [
    "import",
    "匯入 log 有 ERROR",
    writeLog("import-err.log", ["ERROR: Failed to import"]),
    1,
  ],
  [
    "export",
    "匯出 log 有 SCRIPT ERROR",
    writeLog("export-err.log", ["SCRIPT ERROR: Parse Error: x"]),
    1,
  ],
  [
    "test",
    "測試全部通過（含允許的 ERROR）",
    writeLog("test-ok.log", [
      "ERROR: [BattleManager] 拒絕開始第 1 波：selftest",
      "PASS  a",
      "PASS  b",
      okResult(2),
    ]),
    0,
  ],
  [
    "test",
    "測試有找不到的貼圖（內建測試資料改用實際素材後不再允許）",
    writeLog("test-missing-tile.log", [
      "ERROR: Resource file not found: res://assets/tiles/tile_dirt.webp (expected type: unknown)",
      "PASS  a",
      okResult(1),
    ]),
    1,
  ],
  [
    "test",
    "測試有 SCRIPT ERROR",
    writeLog("test-script-error.log", [
      "SCRIPT ERROR: Invalid call.",
      "PASS  a",
      okResult(1),
    ]),
    1,
  ],
  [
    "test",
    "測試有不在允許清單的 ERROR",
    writeLog("test-unexpected.log", [
      "ERROR: 其他錯誤",
      "PASS  a",
      okResult(1),
    ]),
    1,
  ],
  [
    "test",
    "測試有 Parse Error",
    writeLog("test-parse.log", [
      "ERROR: Parse Error: x",
      "PASS  a",
      okResult(1),
    ]),
    1,
  ],
  [
    "test",
    "有 FAIL 行但 RESULT_JSON 說 0 失敗",
    writeLog("test-inconsistent.log", ["FAIL  a", "PASS  b", okResult(2)]),
    1,
  ],
  [
    "test",
    "RESULT_JSON failed=1",
    writeLog("test-failed.log", [
      "FAIL  a",
      `RESULT_JSON {"total":1,"failed":1,"results":[]}`,
    ]),
    1,
  ],
  [
    "test",
    "沒有 RESULT_JSON（中途結束）",
    writeLog("test-no-result.log", ["PASS  a"]),
    1,
  ],
  ["test", "RESULT_JSON total=0", writeLog("test-empty.log", [okResult(0)]), 1],
];

const rows = [];
// fixture 必須真的改到檔案（第一個「完全相同」除外），避免允許差異的案例其實沒改而空過
const changed = (dir) =>
  readdirSync(dir).some((f) => {
    try {
      return !readFileSync(join(dir, f)).equals(readFileSync(join(base, f)));
    } catch {
      return true;
    }
  });
for (const [i, [c, expect]] of exportCases.entries()) {
  const r = run("verify-export.mjs", [base, c.dir]);
  const mutated = changed(c.dir);
  const got = i > 0 && !mutated ? "fixture 沒有改到任何檔案" : r.status;
  rows.push({ tool: "verify-export", label: c.label, expect, got });
}
for (const [kind, label, path, expect] of logCases) {
  const r = run("check-log.mjs", [kind, path]);
  rows.push({ tool: `check-log ${kind}`, label, expect, got: r.status });
}
let bad = 0;
for (const r of rows) {
  const ok = r.expect === r.got;
  if (!ok) bad++;
  console.log(
    `${ok ? "OK " : "BAD"}  ${r.tool.padEnd(17)} 預期 ${r.expect ? "失敗" : "通過"}、實際結束碼 ${r.got}  ${r.label}`
  );
}
console.log(`fixture 目錄：${root}`);
console.log(
  bad
    ? `自我測試：失敗（${bad} 個 fixture 被誤判）`
    : `自我測試：通過（${rows.length} 個 fixture 都符合預期）`
);
// 證據：交付產物的指紋（檔名＋sha256）與每個 fixture 的結果
const packageFiles = readdirSync(base)
  .sort()
  .map((f) => [
    f,
    createHash("sha256")
      .update(readFileSync(join(base, f)))
      .digest("hex"),
  ]);
finishTempDir(tmp, {
  passed: bad === 0,
  name: "selftest",
  result: {
    package: publicDir,
    packageFingerprint: createHash("sha256")
      .update(JSON.stringify(packageFiles))
      .digest("hex"),
    packageFiles,
    fixtures: rows.length,
    bad,
    rows,
  },
});
process.exit(bad ? 1 : 0);
