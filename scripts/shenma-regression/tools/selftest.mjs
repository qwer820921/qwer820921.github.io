// 回歸工具自我測試：用刻意製造的 fixture 確認 verify-export.mjs 與 check-log.mjs
// 「該失敗時一定失敗、允許的差異才放行」。不需要 Godot，也不會修改傳入的目錄。
// 用法：node selftest.mjs <交付產物目錄，例如 public/games/shenmaSanguo>
// 結束碼：0 = 每個 fixture 的結果都符合預期；1 = 有工具誤判
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { maskNodeIds, parsePck } from "./pck.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const publicDir = process.argv[2];
if (!publicDir) {
  console.error("用法：node selftest.mjs <交付產物目錄>");
  process.exit(2);
}
const root = mkdtempSync(join(tmpdir(), "shenma-selftest-"));
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
    variant("只改 SW 的 CACHE_VERSION", (d) =>
      editText(d, "index.service.worker.js", (s) =>
        s.replace(/CACHE_VERSION = '[^']*'/, "CACHE_VERSION = 'selftest|1'")
      )
    ),
    0,
  ],
  [
    variant("只改 .scn 的 node_ids", (d) =>
      patchPck(d, (x) => x.endsWith("Main.scn"), nodeIdsStart)
    ),
    0,
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
      "ERROR: Resource file not found: res://assets/tiles/tile_dirt.webp (expected type: unknown)",
      "ERROR: [BattleManager] 拒絕開始第 1 波：selftest",
      "PASS  a",
      "PASS  b",
      okResult(2),
    ]),
    0,
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
process.exit(bad ? 1 : 0);
