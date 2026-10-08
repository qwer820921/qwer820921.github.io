// 用 GitHub Pages 的方式在本機提供 npm run build 產生的 out/（驗證正式靜態匯出，而不是 next dev）
// - /path → out/path（檔案）→ out/path.html → out/path/index.html；都沒有時回 out/404.html（狀態 404）
// - 例外只有一種：Windows 建置把兩層以上的區段 RSC（__next.<段1>.<段2>.txt）寫成巢狀目錄，
//   正式站（Linux 建置）是扁平檔；扁平檔找不到時才換成巢狀路徑（見 windowsNestedRsc，其他缺檔照樣 404）
// - 不送 COOP／COEP（和 GitHub Pages 相同），跨來源隔離只能靠 Service Worker
// - 正式版的 _next 資源指向 https://qwer820921.github.io/_next/（assetPrefix），在正式站和頁面同源。
//   本機的頁面在 localhost，資源就變成另一個來源：跨來源隔離的頁面（bgRemover，COEP require-corp）會擋下
//   SW 取得的跨來源不透明回應，和正式站不同。所以 HTML／JS／CSS／RSC 文字檔裡的這個前綴改寫成同源的 /_next/
//   （只改前綴，其他位元組不變）；run-browser.mjs 的 LOCAL_ASSETS=1 另外把仍指向正式站的請求改由 out/ 回應
// 用法：node scripts/shenma-regression/tools/serve-out.mjs [port]（預設 3000；先停掉 npm run dev）
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = join(ROOT, "out");
const PORT = Number(process.argv[2] || 3000);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".pck": "application/octet-stream",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".xml": "application/xml",
  ".woff2": "font/woff2",
};

export function resolveOutPath(pathname) {
  let p = decodeURIComponent(pathname);
  if (p.includes("\0")) return null;
  p = normalize(p).replace(/\\/g, "/");
  // 只擋真正的上層目錄片段；檔名本身可以有「..」（例如 Next 產生的 chunk 0a822ktq9z.9..js）
  if (p.split("/").includes("..")) return null;
  const base = join(OUT, p);
  const isFile = (f) => existsSync(f) && statSync(f).isFile();
  if (isFile(base)) return base;
  if (isFile(base + ".html")) return base + ".html";
  if (isFile(join(base, "index.html"))) return join(base, "index.html");
  const nested = windowsNestedRsc(pathname, p);
  return nested && isFile(nested) ? nested : null;
}

// 區段 RSC 檔的每一段只能是這些字元（Next 編碼後的 route group「!…」、$d$slug、__PAGE__、@parallel 等）
const RSC_SEGMENT = /^[A-Za-z0-9_\-@!$]+$/;
// 原始網址（解碼與正規化之前）裡不接受的寫法：編碼的點、斜線、反斜線、NUL，原始反斜線，冒號（磁碟代號）
const UNSAFE_RAW = /%2e|%2f|%5c|%00|\\|:/i;

/** 整條原始 pathname 是「乾淨」的：以 / 開頭、沒有 UNSAFE_RAW、每一段都非空而且不是「.」或「..」 */
function isPlainRawPath(raw) {
  if (!raw.startsWith("/") || UNSAFE_RAW.test(raw)) return false;
  return raw
    .slice(1)
    .split("/")
    .every((s) => s !== "" && s !== "." && s !== "..");
}

/**
 * Windows 建置的兩層以上區段 RSC：瀏覽器要的是扁平檔 __next.<段1>.<段2>….txt（Linux 建置、GitHub Pages 上就是這樣），
 * Windows 上的 next 把它寫成巢狀的 __next.<段1>/<段2>/….txt。上面的直接查找都找不到時才換成巢狀路徑：
 * 整條原始路徑要乾淨（isPlainRawPath），原始檔名不能有任何百分比編碼，各段非空、只能是 RSC_SEGMENT 的字元、至少兩段，
 * 副檔名剛好是 .txt，而且換算後的路徑仍要在 out/ 底下；其他缺檔不做任何替代
 */
function windowsNestedRsc(rawPathname, p) {
  if (!isPlainRawPath(rawPathname)) return null;
  const rawName = rawPathname.slice(rawPathname.lastIndexOf("/") + 1);
  if (rawName.includes("%")) return null;
  const m = /^(.*\/)?__next\.([^/]+)\.txt$/.exec(p);
  if (!m) return null;
  const segs = m[2].split(".");
  if (segs.length < 2 || !segs.every((s) => RSC_SEGMENT.test(s))) return null;
  const candidate = resolve(
    join(
      OUT,
      m[1] || "",
      `__next.${segs[0]}`,
      ...segs.slice(1, -1),
      `${segs[segs.length - 1]}.txt`
    )
  );
  return candidate.startsWith(resolve(OUT) + sep) ? candidate : null;
}

const PROD_ASSETS = "https://qwer820921.github.io/_next/";
const TEXT = new Set([".html", ".js", ".mjs", ".css", ".txt", ".json"]);

/** 讀取要送出的內容：文字檔把正式站的資源前綴改成同源 */
export function readServed(file) {
  const buf = readFileSync(file);
  if (!TEXT.has(extname(file).toLowerCase())) return buf;
  const text = buf.toString("utf8");
  return text.includes(PROD_ASSETS)
    ? Buffer.from(text.split(PROD_ASSETS).join("/_next/"), "utf8")
    : buf;
}

export const contentType = (file) =>
  TYPES[extname(file).toLowerCase()] || "application/octet-stream";

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (!existsSync(OUT)) {
    console.error("找不到 out/，請先執行 npm run build");
    process.exit(2);
  }
  createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const file = resolveOutPath(url.pathname);
    if (!file) {
      const nf = join(OUT, "404.html");
      res.writeHead(404, { "Content-Type": TYPES[".html"] });
      res.end(existsSync(nf) ? readFileSync(nf) : "404");
      return;
    }
    res.writeHead(200, {
      "Content-Type": contentType(file),
      "Cache-Control": "max-age=600",
    });
    res.end(req.method === "HEAD" ? undefined : readServed(file));
  }).listen(PORT, () =>
    console.log(`serving ${OUT} on http://localhost:${PORT}`)
  );
}
