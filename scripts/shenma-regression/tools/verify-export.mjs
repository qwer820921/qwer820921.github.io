// 驗收：本次從原始碼匯出的產物必須與交付產物（預設為工作區 public/games/shenmaSanguo）一致
// 用法：node verify-export.mjs <本次匯出目錄> <交付產物目錄>
// 結束碼：0 = 一致（只剩允許的差異）；1 = 有不允許的差異；2 = 參數或讀檔錯誤
//
// 兩邊都要是「匯出＋匯出後處理（postexport.mjs）」的結果。只允許幾種已知、每次匯出都會隨機產生的差異：
//   1. index.pck 內 *.scn 的 node_ids 陣列內容（.tscn 沒有 unique_id，匯出時隨機產生）
//   2. index.service.worker.js 的 CACHE_VERSION 那一行（匯出時間戳）
//   3. 這一版的版本（VERSION，由檔案內容決定、跟著 1 不同）：index.html 與 index.service.worker.js 裡的版本，
//      以及 EXPECTED 裡 index.pck、index.html 的 sha256。兩邊各自：EXPECTED 必須和自己目錄的檔案相符、
//      外殼頁與 Service Worker 的版本相同、而且等於由自己的檔案重新計算的版本
// 其他內容（包含所有 .gdc、uid_cache.bin、引擎檔、背景音樂）都必須逐位元組相同。
// 文字檔（前 8000 bytes 沒有 NUL，與 git 的判定相同）比較前把 CRLF 視為 LF，
// 因為本機 core.autocrlf=true 會讓未修改的檔案在工作區變成 CRLF，提交時再轉回 LF。
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { maskNodeIds, parsePck } from "./pck.mjs";
import {
  htmlVersionOf,
  maskHtmlVersion,
  stripCR,
  versionOf,
} from "./postexport.mjs";

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
// 匯出後處理寫進 Service Worker 的這一版的版本
const SW_VERSION_LINE = /^const VERSION = '([0-9a-f]{16})';$/m;
// 匯出後處理（postexport.mjs）寫進 Service Worker 的這一版檔案大小與 sha256
const EXPECTED_LINE = /^const EXPECTED = (\{.*\});$/m;
/** EXPECTED 是否和這個目錄的檔案相符（文字檔去掉 CR 後計算）；回傳問題清單 */
function expectedProblems(expected, dir) {
  const problems = [];
  for (const [f, e] of Object.entries(expected)) {
    let buf;
    try {
      buf = readFileSync(join(dir, f));
    } catch {
      problems.push(`${f} 不存在`);
      continue;
    }
    const data = e.text ? stripCR(buf) : buf;
    const hash = createHash("sha256").update(data).digest("hex");
    if (data.length !== e.bytes || hash !== e.sha256)
      problems.push(`${f} 和 Service Worker 記錄的不同`);
  }
  return problems;
}
function compareServiceWorker(a, b, dirA, dirB) {
  const [x, y] = [normalize(a).toString("utf8"), normalize(b).toString("utf8")];
  const [cx, cy] = [x.match(CACHE_LINE) || [], y.match(CACHE_LINE) || []];
  if (cx.length !== 1 || cy.length !== 1) {
    return {
      ok: false,
      detail: `CACHE_VERSION 行數異常（${cx.length}／${cy.length}）`,
    };
  }
  const allowed = [];
  const [ex, ey] = [x.match(EXPECTED_LINE), y.match(EXPECTED_LINE)];
  if (!!ex !== !!ey)
    return { ok: false, detail: "只有一邊經過匯出後處理（EXPECTED）" };
  if (ex) {
    // 兩邊各自和自己的檔案相符；index.pck 的 sha256 可以不同（資料包的 node_ids 每次匯出不同，pck 另外逐項核對），其他都要相同
    const [px, py] = [JSON.parse(ex[1]), JSON.parse(ey[1])];
    const self = [
      ...expectedProblems(px, dirA).map((p) => "本次匯出：" + p),
      ...expectedProblems(py, dirB).map((p) => "交付產物：" + p),
    ];
    // 版本：Service Worker、外殼頁與由自己的檔案重新計算的版本三者相同
    for (const [side, sw, e, dir] of [
      ["本次匯出", x, px, dirA],
      ["交付產物", y, py, dirB],
    ]) {
      const swVersion = (sw.match(SW_VERSION_LINE) || [])[1] || null;
      const html = readFileSync(join(dir, "index.html"), "utf8");
      const htmlVersion = htmlVersionOf(html);
      if (!swVersion || swVersion !== htmlVersion)
        self.push(
          `${side}：Service Worker 與外殼頁的版本不同（${swVersion}／${htmlVersion}）`
        );
      else if (versionOf(maskHtmlVersion(html), e) !== swVersion)
        self.push(`${side}：版本和檔案內容重新計算的不同`);
    }
    if (self.length) return { ok: false, detail: self.join("；") };
    const versionless = (o) =>
      JSON.stringify({
        ...o,
        "index.pck": { ...o["index.pck"], sha256: "<pck>" },
        "index.html": { ...o["index.html"], sha256: "<html>" },
      });
    if (versionless(px) !== versionless(py))
      return {
        ok: false,
        detail: "EXPECTED 除了 index.pck、index.html 的 sha256 以外不同",
      };
    if (px["index.pck"].sha256 !== py["index.pck"].sha256)
      allowed.push(
        "這一版的版本、EXPECTED 的 index.pck／index.html sha256（各自和自己的檔案相符）"
      );
  }
  const strip = (s) =>
    s
      .replace(CACHE_LINE, "const CACHE_VERSION = '<masked>';")
      .replace(SW_VERSION_LINE, "const VERSION = '<masked>';")
      .replace(EXPECTED_LINE, "const EXPECTED = <masked>;");
  if (strip(x) !== strip(y))
    return { ok: false, detail: "CACHE_VERSION 與 EXPECTED 以外的內容不同" };
  if (cx[0] !== cy[0])
    allowed.unshift(
      `CACHE_VERSION（${cx[0].slice(23, -2)} → ${cy[0].slice(23, -2)}）`
    );
  return allowed.length
    ? { ok: true, allowed: "只有 " + allowed.join("、") + " 不同" }
    : { ok: true };
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
    const r = compareServiceWorker(a, b, exportDir, publicDir);
    if (!r.ok) failed = true;
    rows.push([
      f,
      r.ok ? (r.allowed ? "ALLOWED " + r.allowed : "SAME") : "DIFF " + r.detail,
    ]);
  } else if (f === "index.html" && htmlVersionOf(a.toString("utf8"))) {
    // 外殼頁：版本跟著資料包不同（版本的一致性在 Service Worker 那一列核對），其他內容必須相同
    const [x, y] = [a, b].map((buf) => maskHtmlVersion(buf.toString("utf8")));
    const same = x === y;
    if (!same) failed = true;
    const sameVersion =
      htmlVersionOf(a.toString("utf8")) === htmlVersionOf(b.toString("utf8"));
    rows.push([
      f,
      same
        ? sameVersion
          ? "SAME"
          : "ALLOWED 只有版本不同"
        : `DIFF ${a.length} → ${b.length} bytes`,
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
