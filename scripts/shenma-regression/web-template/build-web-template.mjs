// 重建裁減後的 Godot 4.6.2 網頁模板（manifest.json 記錄來源、工具版本、建置參數、Windows 修補與預期的模板 sha256）。
// 模板 zip、Godot 原始碼與 emsdk 都放在倉庫外的工具目錄，不進版控；這個腳本只照 manifest 準備並建置。
// 用法（Windows，需要 Python 與網路）：
//   node scripts/shenma-regression/web-template/build-web-template.mjs <工具目錄> [--check]
//   工具目錄的內容（腳本會檢查）：
//     emsdk/                         emsdk（manifest.tools.emsdk 的 commit），已執行 emsdk install/activate <version>
//     godot-src/godot-4.6.2-stable/  manifest.source 的原始碼；沒有時下載 tar.gz、核對 sha256 後解開
//   --check：只檢查工具目錄與修補，不建置
// 步驟：核對 emsdk 版本 → 準備原始碼（tar.gz 的 sha256 必須相同）→ 套用 Windows 修補（已套用就略過；找不到原文就失敗）
//   → emsdk_env 後執行 SCons（manifest.scons 的參數，-j4）→ 計算模板 zip 的 sha256，複製到 <工具目錄>/web-templates/
// 結果和 manifest.template.sha256 不同時（重建通常不會逐位元組相同）照樣保留，但要重新驗證並更新 manifest，
// godot-check.sh 只接受 manifest 記錄的 sha256（不會靜默改用別的模板）
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const M = JSON.parse(readFileSync(join(HERE, "manifest.json"), "utf8"));
const [toolsArg, ...flags] = process.argv.slice(2);
if (!toolsArg) {
  console.error("用法：build-web-template.mjs <工具目錄> [--check]");
  process.exit(2);
}
const TOOLS = resolve(toolsArg);
const checkOnly = flags.includes("--check");
const sha256 = (p) =>
  createHash("sha256").update(readFileSync(p)).digest("hex");
const die = (msg) => {
  console.error("✗ " + msg);
  process.exit(1);
};

// 1. emsdk
const EMSDK = join(TOOLS, "emsdk");
const emVersionFile = join(EMSDK, "upstream", "emscripten", "emscripten-version.txt");
if (!existsSync(emVersionFile))
  die(`找不到 emsdk：${EMSDK}（照 manifest.tools.emsdk 安裝 ${M.tools.emsdk.version}）`);
const emVersion = readFileSync(emVersionFile, "utf8").replace(/["\s]/g, "");
if (emVersion !== M.tools.emsdk.version)
  die(`emsdk 版本是 ${emVersion}，manifest 要 ${M.tools.emsdk.version}`);
console.log(`emsdk ${emVersion}`);

// 2. 原始碼
const SRC = join(TOOLS, "godot-src", M.source.dir);
if (!existsSync(join(SRC, "SConstruct"))) {
  if (checkOnly) die(`找不到原始碼：${SRC}`);
  const tar = join(TOOLS, "godot-src", `${M.source.dir}.tar.gz`);
  mkdirSync(dirname(tar), { recursive: true });
  if (!existsSync(tar)) {
    console.log(`下載 ${M.source.url}`);
    const res = await fetch(M.source.url);
    if (!res.ok) die(`下載失敗：HTTP ${res.status}`);
    writeFileSync(tar + ".part", Buffer.from(await res.arrayBuffer()));
    renameSync(tar + ".part", tar);
  }
  if (sha256(tar) !== M.source.tarSha256)
    die(`原始碼 tar.gz 的 sha256 不符：${tar}`);
  execFileSync("tar", ["-xzf", tar, "-C", dirname(tar)], { stdio: "inherit" });
}
console.log(`原始碼 ${SRC}`);

// 3. Windows 修補
const [scsub, closure] = M.windowsPatches;
const scsubPath = join(SRC, scsub.file);
let text = readFileSync(scsubPath, "utf8");
if (text.includes(scsub.replace)) console.log(`已套用：${scsub.file}`);
else {
  if (text.split(scsub.find).length !== 2)
    die(`${scsub.file} 找不到要修補的原文（原始碼版本不同？）`);
  if (!checkOnly) {
    writeFileSync(scsubPath, text.replace(scsub.find, () => scsub.replace));
    console.log(`套用：${scsub.file}`);
  } else console.log(`未套用：${scsub.file}`);
}
const closurePath = join(
  EMSDK,
  "upstream",
  "emscripten",
  "node_modules",
  ".bin",
  "google-closure-compiler"
);
if (existsSync(closurePath) && readFileSync(closurePath, "utf8") === closure.content)
  console.log("已套用：google-closure-compiler 入口");
else if (!checkOnly) {
  if (existsSync(closurePath) && !existsSync(closurePath + ".sh-orig"))
    copyFileSync(closurePath, closurePath + ".sh-orig");
  writeFileSync(closurePath, closure.content);
  console.log("套用：google-closure-compiler 入口（原檔備份 .sh-orig）");
} else console.log("未套用：google-closure-compiler 入口");
if (checkOnly) process.exit(0);

// 4. 建置
const args = ["-m", "SCons", ...M.scons, "-j4"];
console.log(`SCons ${M.scons.length} 個參數（${M.scons.slice(0, 5).join(" ")} …）`);
const r = spawnSync(
  "cmd.exe",
  ["/d", "/s", "/c", `call "${join(EMSDK, "emsdk_env.bat")}" >nul && python ${args.join(" ")}`],
  { cwd: SRC, stdio: "inherit", windowsVerbatimArguments: true }
);
if (r.status !== 0) die(`SCons 結束碼 ${r.status}`);

// 5. 結果
const zip = join(SRC, M.output);
if (!existsSync(zip)) die(`沒有產生 ${M.output}`);
const hash = sha256(zip);
const outDir = join(TOOLS, "web-templates");
mkdirSync(outDir, { recursive: true });
const name = `shenma-4.6.2-trim-web_nothreads_debug-${hash.slice(0, 12)}.zip`;
copyFileSync(zip, join(outDir, name));
console.log(`模板：${join(outDir, name)}（sha256 ${hash}）`);
console.log(
  hash === M.template.sha256
    ? "和 manifest 記錄的模板相同"
    : "和 manifest 記錄的模板不同：要重新驗證（匯出、Godot 與瀏覽器回歸）後才能更新 manifest 改用；godot-check.sh 不會接受它"
);
