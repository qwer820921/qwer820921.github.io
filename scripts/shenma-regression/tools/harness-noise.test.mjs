// harness.js 已知 console 雜訊規則（KNOWN_CONSOLE_NOISE）的正反案例：該略過的略過、同類但範圍外的錯誤仍會被當成失敗
// 用法：node scripts/shenma-regression/tools/harness-noise.test.mjs [harness.js 路徑]；有任何案例不符時結束碼為 1
// （路徑預設是倉庫內的 harness.js；指定改過的副本可確認規則放寬時這裡會失敗）
// 直接從 harness.js 取出規則原文執行（不另外複製一份），規則改動後這裡的案例要一起更新；新的例外要附網址與原因
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const HARNESS =
  process.argv[2] || join(ROOT, "scripts/shenma-regression/harness.js");
const src = readFileSync(HARNESS, "utf8").replace(/\r\n/g, "\n");

const blockLine = src
  .split("\n")
  .find((l) => /^\s*const BLOCK = \/.*\/;\s*$/.test(l));
const start = src.indexOf("  const hostOf = ");
const arrStart = src.indexOf("  const KNOWN_CONSOLE_NOISE = [", start);
const end = src.indexOf("\n  ];\n", arrStart);
if (!blockLine || start < 0 || arrStart < 0 || end < 0) {
  console.error(
    "在 harness.js 找不到 BLOCK、hostOf 或 KNOWN_CONSOLE_NOISE 的定義（格式改變了，請更新這支測試）"
  );
  process.exit(2);
}
const rules = new Function(
  `${blockLine}\n${src.slice(start, end + 5)}\nreturn KNOWN_CONSOLE_NOISE;`
)();

const NOT_FOUND =
  "Failed to load resource: the server responded with a status of 404 (Not Found)";
const L = "http://localhost:3000";
// [名稱, console 文字, 網址, 是否應略過]
const CASES = [
  [
    "部落格子路徑的預先載入 404（靜態匯出）",
    NOT_FOUND,
    `${L}/blog/example/__next.a.b.txt`,
    true,
  ],
  [
    "部落格預先載入帶查詢字串",
    NOT_FOUND,
    `${L}/blog/2024/post/__next.x.y.txt?_rsc=1`,
    true,
  ],
  ["登入頁的預先載入 404", NOT_FOUND, `${L}/logIn/__next.a.b.txt`, true],
  [
    "神馬三國主頁的預先載入 404 不略過",
    NOT_FOUND,
    `${L}/shenmaSanguo/__next.a.b.txt`,
    false,
  ],
  [
    "神馬三國設定頁的預先載入 404 不略過",
    NOT_FOUND,
    `${L}/shenmaSanguo/settings/__next.a.b.txt`,
    false,
  ],
  [
    "地圖編輯器的預先載入 404 不略過",
    NOT_FOUND,
    `${L}/mapEditor/__next.a.b.txt`,
    false,
  ],
  [
    "部落格根目錄（沒有子路徑）的預先載入 404 不略過",
    NOT_FOUND,
    `${L}/blog/__next.a.b.txt`,
    false,
  ],
  [
    "登入頁的其他 404（不是預先載入）不略過",
    NOT_FOUND,
    `${L}/logIn/main.js`,
    false,
  ],
  [
    "部落格預先載入但不是 404（網路錯誤）不略過",
    "Failed to load resource: net::ERR_FAILED",
    `${L}/blog/example/__next.a.b.txt`,
    false,
  ],
  ["首頁聯絡卡片封面 404", NOT_FOUND, `${L}/images/cover/contact.webp`, true],
  ["其他圖片 404 不略過", NOT_FOUND, `${L}/images/cover/other.webp`, false],
  [
    "GA 被網路防線擋下",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT",
    "https://www.googletagmanager.com/gtag/js?id=x",
    true,
  ],
  [
    "其他網站被擋下不略過",
    "Failed to load resource: net::ERR_BLOCKED_BY_CLIENT",
    "https://script.google.com/macros/s/x/exec",
    false,
  ],
  [
    "dev 模式不存在的共用元件 chunk",
    NOT_FOUND,
    `${L}/_next/static/chunks/src_components_common_navbar_abc._.js`,
    true,
  ],
  [
    "其他 chunk 404 不略過",
    NOT_FOUND,
    `${L}/_next/static/chunks/src_app_shenmaSanguo_abc._.js`,
    false,
  ],
];

let failed = 0;
for (const [name, text, url, expected] of CASES) {
  const hit = rules.find((r) => r.test({ text, url }));
  const ok = !!hit === expected;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}  ${expected ? "應略過" : "不應略過"}${hit ? `（符合：${hit.why.slice(0, 40)}…）` : ""}`
  );
}
console.log(
  "RESULT_JSON " +
    JSON.stringify({ rules: rules.length, total: CASES.length, failed })
);
process.exit(failed ? 1 : 0);
