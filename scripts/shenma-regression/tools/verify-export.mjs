// 驗收：本次從原始碼匯出的產物必須與交付產物（預設為工作區 public/games/shenmaSanguo）一致
// 用法：node verify-export.mjs <本次匯出目錄> <交付產物目錄>
// 結束碼：0 = 一致（只剩允許的差異）；1 = 有不允許的差異；2 = 參數或讀檔錯誤
//
// 只允許兩種已知、每次匯出都會隨機產生的差異：
//   1. index.pck 內 *.scn 的 node_ids 陣列內容（.tscn 沒有 unique_id，匯出時隨機產生）
//   2. index.service.worker.js 的 CACHE_VERSION 那一行（匯出時間戳）
// 其他內容（包含所有 .gdc、uid_cache.bin、引擎檔）都必須逐位元組相同。
// 文字檔（前 8000 bytes 沒有 NUL，與 git 的判定相同）比較前把 CRLF 視為 LF，
// 因為本機 core.autocrlf=true 會讓未修改的檔案在工作區變成 CRLF，提交時再轉回 LF。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { maskNodeIds, parsePck } from "./pck.mjs";

const [exportDir, publicDir] = process.argv.slice(2);
if (!exportDir || !publicDir) {
  console.error("用法：node verify-export.mjs <本次匯出目錄> <交付產物目錄>");
  process.exit(2);
}

const listFiles = (dir) =>
  readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort();
const isText = (buf) => !buf.subarray(0, 8000).includes(0);
const normalize = (buf) =>
  isText(buf)
    ? Buffer.from(buf.toString("latin1").replace(/\r\n/g, "\n"), "latin1")
    : buf;

const CACHE_LINE = /^const CACHE_VERSION = '[^'\n]*';$/gm;
function compareServiceWorker(a, b) {
  const [x, y] = [normalize(a).toString("utf8"), normalize(b).toString("utf8")];
  const [cx, cy] = [x.match(CACHE_LINE) || [], y.match(CACHE_LINE) || []];
  if (cx.length !== 1 || cy.length !== 1) {
    return {
      ok: false,
      detail: `CACHE_VERSION 行數異常（${cx.length}／${cy.length}）`,
    };
  }
  const strip = (s) =>
    s.replace(CACHE_LINE, "const CACHE_VERSION = '<masked>';");
  if (strip(x) !== strip(y))
    return { ok: false, detail: "CACHE_VERSION 以外的內容不同" };
  return cx[0] === cy[0]
    ? { ok: true }
    : {
        ok: true,
        allowed: `只有 CACHE_VERSION 不同（${cx[0].slice(23, -2)} → ${cy[0].slice(23, -2)}）`,
      };
}

function comparePck(pathA, pathB) {
  const [a, b] = [parsePck(pathA), parsePck(pathB)];
  const problems = [];
  const allowed = [];
  for (const k of ["fmt", "ver", "flags"]) {
    if (a[k] !== b[k]) problems.push(`header ${k}: ${a[k]} → ${b[k]}`);
  }
  const names = [...new Set([...a.files.keys(), ...b.files.keys()])].sort();
  let same = 0;
  for (const n of names) {
    const x = a.files.get(n);
    const y = b.files.get(n);
    if (!x || !y) {
      problems.push(`${x ? "只在本次匯出" : "只在交付產物"}：${n}`);
      continue;
    }
    if (x.data.equals(y.data)) {
      same++;
      continue;
    }
    if (n.endsWith(".scn")) {
      const [mx, my] = [maskNodeIds(x.data), maskNodeIds(y.data)];
      if (
        mx.hits.length === 1 &&
        my.hits.length === 1 &&
        mx.masked.equals(my.masked)
      ) {
        allowed.push(`${n}（只有 node_ids 不同）`);
        continue;
      }
    }
    const kind = n.endsWith(".gdc") ? "【.gdc 腳本】" : "";
    problems.push(`${kind}內容不同：${n}（${x.size} → ${y.size} bytes）`);
  }
  return { same, total: names.length, problems, allowed };
}

let failed = false;
const rows = [];
let exportFiles;
let publicFiles;
try {
  exportFiles = listFiles(exportDir);
  publicFiles = listFiles(publicDir);
} catch (e) {
  console.error("讀取目錄失敗：" + e.message);
  process.exit(2);
}
if (exportFiles.length === 0) {
  console.error("本次匯出目錄是空的：" + exportDir);
  process.exit(2);
}
for (const f of [...new Set([...exportFiles, ...publicFiles])].sort()) {
  if (!exportFiles.includes(f) || !publicFiles.includes(f)) {
    rows.push([
      f,
      `DIFF 只存在於${exportFiles.includes(f) ? "本次匯出" : "交付產物"}`,
    ]);
    failed = true;
    continue;
  }
  const a = readFileSync(join(exportDir, f));
  const b = readFileSync(join(publicDir, f));
  if (f === "index.pck") {
    const r = comparePck(join(exportDir, f), join(publicDir, f));
    const tail = r.allowed.length ? `，允許差異 ${r.allowed.length} 個` : "";
    if (r.problems.length) {
      failed = true;
      rows.push([
        f,
        `DIFF pck 內 ${r.problems.length} 個不允許的差異（相同 ${r.same}／${r.total}${tail}）`,
      ]);
      for (const p of r.problems) rows.push(["", "  ✗ " + p]);
    } else {
      rows.push([
        f,
        `${r.allowed.length ? "ALLOWED" : "SAME"} 相同 ${r.same}／${r.total}${tail}`,
      ]);
    }
    for (const p of r.allowed) rows.push(["", "  ~ " + p]);
  } else if (f === "index.service.worker.js") {
    const r = compareServiceWorker(a, b);
    if (!r.ok) failed = true;
    rows.push([
      f,
      r.ok ? (r.allowed ? "ALLOWED " + r.allowed : "SAME") : "DIFF " + r.detail,
    ]);
  } else {
    const same = normalize(a).equals(normalize(b));
    if (!same) failed = true;
    rows.push([
      f,
      same
        ? a.equals(b)
          ? "SAME"
          : "SAME（只有換行不同）"
        : `DIFF ${a.length} → ${b.length} bytes`,
    ]);
  }
}

console.log(`本次匯出：${exportDir}`);
console.log(`交付產物：${publicDir}`);
for (const [f, s] of rows) console.log(`${f.padEnd(34)} ${s}`);
console.log(
  failed
    ? "產物核對：失敗（有不允許的差異）"
    : "產物核對：通過（只剩允許的差異）"
);
process.exit(failed ? 1 : 0);
