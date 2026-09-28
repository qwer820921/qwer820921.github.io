// 用 GitHub Pages 的方式在本機提供 npm run build 產生的 out/（驗證正式靜態匯出，而不是 next dev）
// - /path → out/path（檔案）→ out/path.html → out/path/index.html；都沒有時回 out/404.html（狀態 404）
// - 不送 COOP／COEP（和 GitHub Pages 相同），跨來源隔離只能靠 Service Worker
// - 正式版的 _next 資源指向 https://qwer820921.github.io/_next/（assetPrefix），在正式站和頁面同源。
//   本機的頁面在 localhost，資源就變成另一個來源：跨來源隔離的頁面（bgRemover，COEP require-corp）會擋下
//   SW 取得的跨來源不透明回應，和正式站不同。所以 HTML／JS／CSS／RSC 文字檔裡的這個前綴改寫成同源的 /_next/
//   （只改前綴，其他位元組不變）；run-browser.mjs 的 LOCAL_ASSETS=1 另外把仍指向正式站的請求改由 out/ 回應
// 用法：node scripts/shenma-regression/tools/serve-out.mjs [port]（預設 3000；先停掉 npm run dev）
import { createServer } from "node:http";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, normalize, resolve } from "node:path";
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
  if (p.includes("..")) return null;
  const base = join(OUT, p);
  const isFile = (f) => existsSync(f) && statSync(f).isFile();
  if (isFile(base)) return base;
  if (isFile(base + ".html")) return base + ".html";
  if (isFile(join(base, "index.html"))) return join(base, "index.html");
  return null;
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
