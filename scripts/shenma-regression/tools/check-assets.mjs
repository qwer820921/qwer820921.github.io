// 神馬三國素材引用檢查（不需要瀏覽器與 Godot）：
// - 網頁程式（src 的 ts／tsx／css）裡寫死的 tiles/…、maps/… 圖片，要存在於 public/images/shenmaSanguo/
// - Godot 程式（godot/shenmaSanguo 的 gd／tscn）裡的 tiles/… 圖片，要存在於 godot/shenmaSanguo/assets/tiles/
// - 註解裡的範例不檢查；已知例外逐項說明原因，另外列出、不算失敗
// 用法：node scripts/shenma-regression/tools/check-assets.mjs；有找不到的素材時結束碼為 1
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const WEB_ASSETS = join(ROOT, "public/images/shenmaSanguo");
const GODOT_ASSETS = join(ROOT, "godot/shenmaSanguo/assets");
const REF = /\b(tiles|maps)\/[A-Za-z0-9_-]+\.(webp|png|jpg|jpeg|gif)\b/g;

// 已知例外：[檔案（倉庫相對路徑）, 引用, 原因]。目前沒有例外；新增時要寫明網址或引用位置與原因
const KNOWN = [];

function walk(dir, exts, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, exts, out);
    else if (exts.some((e) => name.endsWith(e))) out.push(p);
  }
  return out;
}

// 拿掉註解（單行、區塊註解與 GDScript 的 #），避免把範例當成引用
function stripComments(text, gd) {
  if (gd)
    return text
      .split(/\r?\n/)
      .map((l) => l.replace(/(^|\s)#.*$/, ""))
      .join("\n");
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

const missing = [];
const known = [];
let checked = 0;
const scan = (files, base, gd) => {
  for (const f of files) {
    const rel = relative(ROOT, f).replace(/\\/g, "/");
    const refs = new Set(
      stripComments(readFileSync(f, "utf8"), gd).match(REF) || []
    );
    for (const ref of refs) {
      checked++;
      if (existsSync(join(base, ref))) continue;
      const k = KNOWN.find(([file, r]) => file === rel && r === ref);
      (k ? known : missing).push({
        file: rel,
        ref,
        ...(k ? { why: k[2] } : {}),
      });
    }
  }
};
scan(walk(join(ROOT, "src"), [".ts", ".tsx", ".css"]), WEB_ASSETS, false);
scan(
  walk(join(ROOT, "godot/shenmaSanguo"), [".gd", ".tscn"]),
  GODOT_ASSETS,
  true
);

for (const m of missing) console.log(`MISSING  ${m.file}: ${m.ref}`);
for (const k of known) console.log(`KNOWN    ${k.file}: ${k.ref}（${k.why}）`);
console.log(
  "RESULT_JSON " +
    JSON.stringify({ checked, missing: missing.length, known: known.length })
);
process.exit(missing.length ? 1 : 0);
