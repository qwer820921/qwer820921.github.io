// 神馬三國遊戲的發布目錄與網站入口的版本指標
//
// 發布方式（版本目錄）：
// - 每一版（postexport.mjs 算出的版本）放在自己的目錄 public/games/shenmaSanguo-v/<版本>/，發布後內容不再改變、不刪除。
//   伺服器上同一個網址永遠是同一份內容：已經開著的頁面（或 HTTP 快取、CDN 還是舊的網站頁面）仍然拿到它那一版的成套檔案
// - 舊正式版留在原本的 public/games/shenmaSanguo/，內容固定是 release/legacy-root.json 記錄的那一版（來源 commit 的原檔），
//   不再覆寫：已經裝了舊正式版 Service Worker、或開著舊頁面的玩家，之後重試或補下載都還是舊正式版的成套檔案
// - 網站兩個入口（主頁、獨立戰鬥頁）的 iframe 由 src/app/(games)/shenmaSanguo/utils/gameRelease.json 決定：
//   entry 是目前入口的版本（或 "legacy"＝舊正式版目錄）；retained 是保留在伺服器上的版本目錄（必須全部存在）
// - 回退：只改入口指標（point legacy 或 point <保留中的版本>）再建置網站，不刪除、不覆寫任何遊戲目錄
//
// 用法：
//   node game-release.mjs check [--out]             候選自洽：核對發布目錄（--out 另核對 out/ 與 public/ 相同）；離線；結束碼 0 通過、1 有問題
//   node game-release.mjs check-published <gh-pages 完整 SHA> [--out]
//                                                   發布前的正式保留核對：候選自洽＋正式基準（釘選的 gh-pages 提交）上已發布的版本目錄
//                                                   全部原樣保留、舊正式版目錄就是固定原檔；基準讀不到時結束碼 2（不當成沒有已發布版本）
//   node game-release.mjs publish <匯出目錄>         把經過 postexport 的匯出放進它的版本目錄，入口改成這一版（上一個入口版本保留）
//   node game-release.mjs point <版本|legacy>        只改入口指標（回退用）；目標必須是保留中的版本目錄或舊正式版
//   node game-release.mjs restore-legacy            從 legacy-root.json 的來源 commit 取回舊正式版目錄的原檔（不在清單的檔案移除）
//   node game-release.mjs legacy-manifest <commit>  由 commit 裡的 public/games/shenmaSanguo 產生 legacy-root.json（換舊正式版時才用）
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CACHE_NAMESPACE,
  htmlVersionOf,
  maskHtmlVersion,
  stripCR,
  versionOf,
} from "./postexport.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "../../..");
export const LEGACY_DIR = "public/games/shenmaSanguo";
export const PACKAGES_DIR = "public/games/shenmaSanguo-v";
export const RELEASE_FILE =
  "src/app/(games)/shenmaSanguo/utils/gameRelease.json";
export const LEGACY_MANIFEST =
  "scripts/shenma-regression/release/legacy-root.json";
/** 網站上的路徑（iframe、Service Worker 範圍） */
export const LEGACY_PATH = "/games/shenmaSanguo/";
export const PACKAGES_PATH = "/games/shenmaSanguo-v/";
/** 版本目錄必須有的檔案（Godot 匯出＋postexport 複製的背景音樂） */
export const PACKAGE_FILES = [
  "index.html",
  "index.js",
  "index.wasm",
  "index.pck",
  "index.service.worker.js",
  "index.audio.worklet.js",
  "index.audio.position.worklet.js",
  "index.offline.html",
  "index.icon.png",
  "index.apple-touch-icon.png",
  "index.manifest.json",
  "index.png",
  "index.144x144.png",
  "index.180x180.png",
  "index.512x512.png",
  "bgm_battle.ogg",
];
const VERSION_RE = /^[0-9a-f]{16}$/;

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const isText = (buf) => !buf.subarray(0, 8000).includes(0);
/** 比較用：文字檔把 CRLF 視為 LF（本機 core.autocrlf=true，git 以 LF 保存與部署） */
const canonical = (buf) => (isText(buf) ? stripCR(buf) : buf);
const listFiles = (dir) =>
  readdirSync(dir)
    .filter((f) => statSync(join(dir, f)).isFile())
    .sort();
const listDirs = (dir) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => statSync(join(dir, f)).isDirectory())
        .sort()
    : [];

/** 入口指標 → 網站上的遊戲目錄 */
export const entryPath = (entry) =>
  entry === "legacy" ? LEGACY_PATH : `${PACKAGES_PATH}${entry}/`;

export function readRelease(root = ROOT) {
  return JSON.parse(readFileSync(join(root, RELEASE_FILE), "utf8"));
}

/** 入口指標寫成和 prettier 相同的格式（清單放得下一行時同一行，否則一個版本一行），提交時格式化工具不會再改它 */
function writeRelease(root, release) {
  const items = (release.retained || []).map((v) => JSON.stringify(v));
  const inline = `  "retained": [${items.join(", ")}]`;
  const retained =
    inline.length <= 80
      ? inline
      : `  "retained": [\n${items.map((i) => "    " + i).join(",\n")}\n  ]`;
  writeFileSync(
    join(root, RELEASE_FILE),
    `{\n  "entry": ${JSON.stringify(release.entry)},\n${retained}\n}\n`
  );
}

/**
 * 一個版本目錄（或匯出目錄）自己是否一致：必要檔案都在；外殼頁、Service Worker（VERSION、CACHE_VERSION）都是同一個版本，
 * 而且等於由檔案內容重新計算的版本；Service Worker 的 EXPECTED 和檔案相符；快取用版本目錄的命名空間；引擎快取名稱和檔案相符。
 * expectVersion 有給時版本也必須是它（版本目錄的名稱）。回傳 { version, problems }
 */
export function packageProblems(dir, expectVersion = null) {
  const problems = [];
  const missing = PACKAGE_FILES.filter((f) => !existsSync(join(dir, f)));
  if (missing.length) {
    problems.push(`缺少 ${missing.join("、")}`);
    return { version: null, problems };
  }
  const html = readFileSync(join(dir, "index.html"), "utf8");
  const sw = readFileSync(join(dir, "index.service.worker.js"), "utf8").replace(
    /\r\n/g,
    "\n"
  );
  const version = htmlVersionOf(html);
  if (!version) {
    problems.push("外殼頁沒有版本守門（不是經過 postexport 的匯出）");
    return { version: null, problems };
  }
  if (expectVersion && version !== expectVersion)
    problems.push(`外殼頁的版本 ${version} 和目錄名稱 ${expectVersion} 不同`);
  const swVersion = (sw.match(/^const VERSION = '([0-9a-f]{16})';$/m) || [])[1];
  if (swVersion !== version)
    problems.push(
      `Service Worker 的版本 ${swVersion} 和外殼頁 ${version} 不同`
    );
  const cacheVersion = (sw.match(/^const CACHE_VERSION = '([^'\n]*)';$/m) ||
    [])[1];
  if (cacheVersion !== version)
    problems.push(
      `Service Worker 的 CACHE_VERSION ${cacheVersion} 不是這一版的版本`
    );
  if (!sw.includes(`\nconst CACHE_PREFIX = '${CACHE_NAMESPACE}';\n`))
    problems.push(`Service Worker 的快取前綴不是 ${CACHE_NAMESPACE}`);
  const expectedLine = sw.match(/^const EXPECTED = (\{.*\});$/m);
  if (!expectedLine) {
    problems.push("Service Worker 沒有 EXPECTED（不是經過 postexport 的匯出）");
    return { version, problems };
  }
  const expected = JSON.parse(expectedLine[1]);
  for (const [f, e] of Object.entries(expected)) {
    const buf = readFileSync(join(dir, f));
    const data = e.text ? stripCR(buf) : buf;
    if (data.length !== e.bytes || sha256(data) !== e.sha256)
      problems.push(`${f} 和 Service Worker 記錄的大小／sha256 不同`);
  }
  if (versionOf(maskHtmlVersion(html), expected) !== version)
    problems.push("版本和檔案內容重新計算的不同");
  const engine = sha256(
    Buffer.concat([
      stripCR(readFileSync(join(dir, "index.js"))),
      readFileSync(join(dir, "index.wasm")),
    ])
  ).slice(0, 16);
  if (!sw.includes(`const ENGINE_CACHE = CACHE_PREFIX + 'engine-${engine}';`))
    problems.push(
      `Service Worker 的引擎快取名稱和檔案不符（應為 engine-${engine}）`
    );
  return { version, problems };
}

/** 兩個目錄的檔案是否完全相同（文字檔 CRLF 視為 LF）；回傳不同的檔名 */
function dirDifferences(a, b) {
  const [fa, fb] = [listFiles(a), existsSync(b) ? listFiles(b) : []];
  const out = [];
  for (const f of [...new Set([...fa, ...fb])].sort()) {
    if (!fa.includes(f) || !fb.includes(f)) {
      out.push(`${f}（只在${fa.includes(f) ? "前者" : "後者"}）`);
      continue;
    }
    if (
      !canonical(readFileSync(join(a, f))).equals(
        canonical(readFileSync(join(b, f)))
      )
    )
      out.push(f);
  }
  return out;
}

/** 舊正式版目錄是否就是 legacy-root.json 記錄的檔案（不多不少、內容相同） */
export function legacyProblems(root = ROOT) {
  const manifest = JSON.parse(
    readFileSync(join(root, LEGACY_MANIFEST), "utf8")
  );
  const dir = join(root, LEGACY_DIR);
  if (!existsSync(dir)) return [`舊正式版目錄 ${LEGACY_DIR} 不存在`];
  const problems = [];
  const files = listFiles(dir);
  for (const f of files)
    if (!manifest.files[f])
      problems.push(`舊正式版目錄多了 ${f}（舊目錄不能放新版的檔案）`);
  for (const [f, e] of Object.entries(manifest.files)) {
    if (!files.includes(f)) {
      problems.push(`舊正式版目錄少了 ${f}`);
      continue;
    }
    const data = canonical(readFileSync(join(dir, f)));
    if (data.length !== e.bytes || sha256(data) !== e.sha256)
      problems.push(
        `舊正式版目錄的 ${f} 和 ${manifest.source.slice(0, 8)} 的原檔不同`
      );
  }
  return problems;
}

/** 網站原始碼不能寫死遊戲目錄（兩個入口都要經過 gameRelease.json） */
function hardcodedEntries(root) {
  const base = join(root, "src/app/(games)/shenmaSanguo");
  const out = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(f)) {
        const text = readFileSync(p, "utf8");
        if (/["'`]\/games\/shenmaSanguo(-v\/[^"'`]*)?\/index\.html/.test(text))
          out.push(p.slice(root.length + 1).replace(/\\/g, "/"));
      }
    }
  };
  if (existsSync(base)) walk(base);
  return out;
}

/** 整體核對；withOut 時另核對 out/ 與 public/ 的遊戲目錄相同。回傳問題清單 */
export function checkRelease(root = ROOT, { withOut = false } = {}) {
  const problems = [...legacyProblems(root)];
  let release;
  try {
    release = readRelease(root);
  } catch (e) {
    return [...problems, `讀不到入口指標 ${RELEASE_FILE}：${e.message}`];
  }
  const retained = Array.isArray(release.retained) ? release.retained : null;
  if (!retained || retained.some((v) => !VERSION_RE.test(v)))
    problems.push("入口指標的 retained 必須是版本（16 個小寫十六進位）的清單");
  else if (new Set(retained).size !== retained.length)
    problems.push("入口指標的 retained 有重複的版本");
  if (
    release.entry !== "legacy" &&
    !(retained && retained.includes(release.entry))
  )
    problems.push(
      `入口指標的 entry（${release.entry}）必須是 "legacy" 或 retained 裡的版本`
    );
  const pkgRoot = join(root, PACKAGES_DIR);
  for (const v of retained || []) {
    const dir = join(pkgRoot, v);
    if (!existsSync(dir)) {
      problems.push(`保留的版本目錄 ${PACKAGES_DIR}/${v} 不存在`);
      continue;
    }
    for (const p of packageProblems(dir, v).problems)
      problems.push(`${PACKAGES_DIR}/${v}：${p}`);
    const extra = listFiles(dir).filter((f) => !PACKAGE_FILES.includes(f));
    if (extra.length)
      problems.push(`${PACKAGES_DIR}/${v}：多了 ${extra.join("、")}`);
  }
  for (const d of listDirs(pkgRoot))
    if (!(retained || []).includes(d))
      problems.push(
        `${PACKAGES_DIR}/${d} 不在入口指標的 retained（沒有列管的版本目錄）`
      );
  for (const f of existsSync(pkgRoot) ? listFiles(pkgRoot) : [])
    problems.push(`${PACKAGES_DIR} 底下不能直接放檔案：${f}`);
  for (const f of hardcodedEntries(root))
    problems.push(`${f} 寫死了遊戲目錄（請用 gameEngine.ts 的 GAME_ENTRY）`);
  if (withOut) {
    const pairs = [[LEGACY_DIR, "out/games/shenmaSanguo"]];
    for (const v of retained || [])
      pairs.push([`${PACKAGES_DIR}/${v}`, `out/games/shenmaSanguo-v/${v}`]);
    for (const [a, b] of pairs) {
      const diff = existsSync(join(root, b))
        ? dirDifferences(join(root, a), join(root, b))
        : ["目錄不存在"];
      if (diff.length) problems.push(`${b} 和 ${a} 不同：${diff.join("、")}`);
    }
    for (const d of listDirs(join(root, "out/games/shenmaSanguo-v")))
      if (!(retained || []).includes(d))
        problems.push(
          `out/games/shenmaSanguo-v/${d} 不在 retained（請重新建置網站）`
        );
  }
  return problems;
}

/** 正式基準讀不到或不是正式 Pages 的樹：停止核對（不能當成「沒有已發布版本」） */
export class BaselineError extends Error {}

/** git 的 blob id（文字檔 CRLF 視為 LF，和提交時相同） */
const blobId = (buf) => {
  const data = canonical(buf);
  return createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${data.length}\0`), data]))
    .digest("hex");
};

/**
 * 讀正式基準：gh-pages 的完整 SHA（由唯讀的 git ls-remote 取得、git fetch 到本機後釘選）裡的舊正式版目錄與已發布的版本目錄。
 * 回傳 { baseline, legacy: Map<檔名, blob>, published: Map<版本, Map<檔名, blob>> }；讀不到就丟 BaselineError
 */
export function readPublished(baseline, repo = ROOT) {
  if (!/^[0-9a-f]{40}$/.test(baseline || ""))
    throw new BaselineError(
      "正式基準必須是 gh-pages 的完整 40 字元 SHA（先 git ls-remote 取得、git fetch 到本機再指定；不接受分支名稱）"
    );
  let type;
  try {
    type = execFileSync("git", ["-C", repo, "cat-file", "-t", baseline], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch {
    throw new BaselineError(
      `本機沒有正式基準 ${baseline}（先 git fetch origin gh-pages）`
    );
  }
  if (type !== "commit")
    throw new BaselineError(`正式基準 ${baseline} 不是提交（${type}）`);
  const legacyPath = LEGACY_PATH.slice(1);
  const packagesPath = PACKAGES_PATH.slice(1);
  const rows = git(repo, [
    "ls-tree",
    "-r",
    "-z",
    baseline,
    "--",
    legacyPath,
    packagesPath,
  ])
    .split("\0")
    .filter(Boolean)
    .map((l) => {
      const [meta, path] = l.split("\t");
      return { blob: meta.split(" ")[2], path };
    });
  const legacy = new Map();
  const published = new Map();
  for (const { blob, path } of rows) {
    if (path.startsWith(legacyPath)) {
      legacy.set(path.slice(legacyPath.length), blob);
      continue;
    }
    const [v, ...rest] = path.slice(packagesPath.length).split("/");
    if (!rest.length)
      throw new BaselineError(
        `正式基準的 ${packagesPath} 底下直接放了檔案 ${v}，無法解析`
      );
    if (!published.has(v)) published.set(v, new Map());
    published.get(v).set(rest.join("/"), blob);
  }
  if (!legacy.size)
    throw new BaselineError(
      `正式基準 ${baseline.slice(0, 8)} 沒有舊正式版目錄 ${legacyPath}（不是神馬三國的正式 Pages 樹？）`
    );
  return { baseline, legacy, published };
}

/**
 * 正式保留核對（發布前用）：候選（root 的 public/ 與入口指標）必須原樣保留正式基準上已發布的一切——
 * 每一個已發布版本都在 retained、版本目錄的檔案和正式基準完全相同（不多不少）；正式基準的舊正式版目錄必須就是 legacy-root.json 的原檔。
 * 依據是外部的正式基準，不是候選自己的入口指標（候選把 retained 與目錄一起刪掉時，checkRelease 仍會通過）。
 * 候選自己的一致性另用 checkRelease（離線）；這個核對要正式基準，不放進每次的快速測試。回傳 { published, problems }
 */
export function publishedProblems(root, baseline, repo = ROOT) {
  const live = readPublished(baseline, repo);
  const problems = [];
  const manifest = JSON.parse(
    readFileSync(join(root, LEGACY_MANIFEST), "utf8")
  );
  for (const [f, blob] of live.legacy)
    if (!manifest.files[f])
      problems.push(`正式基準的舊正式版目錄有 ${f}，但 legacy-root.json 沒有`);
    else if (manifest.files[f].blob !== blob)
      problems.push(
        `正式基準的舊正式版目錄 ${f} 和 legacy-root.json 的原檔不同（${blob.slice(0, 8)}）`
      );
  for (const f of Object.keys(manifest.files))
    if (!live.legacy.has(f)) problems.push(`正式基準的舊正式版目錄少了 ${f}`);
  let retained = [];
  try {
    const r = readRelease(root).retained;
    if (Array.isArray(r)) retained = r;
  } catch {
    retained = [];
  }
  for (const [v, files] of live.published) {
    const label = `已正式發布的版本 ${v}`;
    if (!VERSION_RE.test(v)) problems.push(`正式基準有不是版本名稱的目錄 ${v}`);
    if (!retained.includes(v))
      problems.push(`${label} 不在入口指標的 retained（發布後必須保留）`);
    const dir = join(root, PACKAGES_DIR, v);
    if (!existsSync(dir)) {
      problems.push(`${label} 的目錄 ${PACKAGES_DIR}/${v} 不存在`);
      continue;
    }
    for (const [f, blob] of files) {
      const p = join(dir, f);
      if (!existsSync(p)) problems.push(`${label} 少了 ${f}`);
      else if (blobId(readFileSync(p)) !== blob)
        problems.push(
          `${label} 的 ${f} 和正式基準不同（發布後不能改；正式 ${blob.slice(0, 8)}）`
        );
    }
    for (const f of listFiles(dir))
      if (!files.has(f))
        problems.push(`${label} 多了 ${f}（正式基準沒有；發布後不能改）`);
  }
  return { published: [...live.published.keys()].sort(), problems };
}

/** 把經過 postexport 的匯出放進版本目錄；入口改成這一版。已發布的同一版內容必須完全相同（版本目錄發布後不能改） */
export function publish(exportDir, root = ROOT) {
  const { version, problems } = packageProblems(exportDir);
  if (problems.length)
    throw new Error("匯出目錄有問題：" + problems.join("；"));
  const extra = listFiles(exportDir).filter((f) => !PACKAGE_FILES.includes(f));
  if (extra.length)
    throw new Error("匯出目錄有不認得的檔案：" + extra.join("、"));
  const target = join(root, PACKAGES_DIR, version);
  let copied = false;
  if (existsSync(target)) {
    const diff = dirDifferences(exportDir, target);
    if (diff.length)
      throw new Error(
        `版本目錄 ${PACKAGES_DIR}/${version} 已存在但內容不同（${diff.join("、")}）；版本目錄發布後不能改`
      );
  } else {
    mkdirSync(target, { recursive: true });
    for (const f of PACKAGE_FILES)
      copyFileSync(join(exportDir, f), join(target, f));
    copied = true;
  }
  const release = readRelease(root);
  const previous = release.entry;
  const retained = (release.retained || []).filter((v) => v !== version);
  retained.push(version);
  writeRelease(root, { entry: version, retained });
  return {
    version,
    dir: `${PACKAGES_DIR}/${version}`,
    copied,
    previous,
    retained,
  };
}

/** 只改入口指標（回退用） */
export function point(target, root = ROOT) {
  const release = readRelease(root);
  if (target !== "legacy" && !(release.retained || []).includes(target))
    throw new Error(
      `${target} 不是保留中的版本目錄（retained：${(release.retained || []).join("、")}）`
    );
  if (target !== "legacy") {
    const { problems } = packageProblems(
      join(root, PACKAGES_DIR, target),
      target
    );
    if (problems.length)
      throw new Error(`${target} 的版本目錄有問題：${problems.join("；")}`);
  } else {
    const problems = legacyProblems(root);
    if (problems.length)
      throw new Error("舊正式版目錄有問題：" + problems.join("；"));
  }
  const previous = release.entry;
  writeRelease(root, { entry: target, retained: release.retained || [] });
  return { previous, entry: target, path: entryPath(target) };
}

const git = (root, args, encoding = "utf8") =>
  execFileSync("git", ["-C", root, ...args], {
    encoding,
    maxBuffer: 256 * 1024 * 1024,
  });

/** 從 legacy-root.json 的來源 commit 取回舊正式版目錄的原檔；不在清單的檔案移除 */
export function restoreLegacy(root = ROOT) {
  const manifest = JSON.parse(
    readFileSync(join(root, LEGACY_MANIFEST), "utf8")
  );
  const dir = join(root, LEGACY_DIR);
  mkdirSync(dir, { recursive: true });
  const removed = [];
  for (const f of listFiles(dir))
    if (!manifest.files[f]) {
      rmSync(join(dir, f));
      removed.push(f);
    }
  for (const f of Object.keys(manifest.files))
    writeFileSync(
      join(dir, f),
      git(root, ["show", `${manifest.source}:${LEGACY_DIR}/${f}`], "buffer")
    );
  return {
    source: manifest.source,
    files: Object.keys(manifest.files).length,
    removed,
  };
}

/** 由 commit 裡的舊正式版目錄產生 legacy-root.json */
export function legacyManifest(commit, root = ROOT) {
  const source = git(root, ["rev-parse", `${commit}^{commit}`]).trim();
  const files = {};
  for (const line of git(root, ["ls-tree", source, "--", LEGACY_DIR + "/"])
    .split("\n")
    .filter(Boolean)) {
    const [meta, path] = line.split("\t");
    const [, type, blob] = meta.split(" ");
    if (type !== "blob") continue;
    const data = git(root, ["show", `${source}:${path}`], "buffer");
    files[path.split("/").pop()] = {
      bytes: data.length,
      sha256: sha256(data),
      blob,
    };
  }
  return { source, dir: LEGACY_DIR, files };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [cmd, arg, opt] = process.argv.slice(2);
  try {
    if (cmd === "check-published") {
      // 候選自洽（離線）＋正式保留核對（外部正式基準），分開列出
      const self = checkRelease(ROOT, { withOut: opt === "--out" });
      const live = publishedProblems(ROOT, arg);
      for (const p of self) console.log("✗ 候選自洽：" + p);
      for (const p of live.problems) console.log("✗ 正式保留：" + p);
      console.log(
        JSON.stringify({
          baseline: arg,
          published: live.published,
          retained: readRelease(ROOT).retained,
          candidateProblems: self.length,
          publishedProblems: live.problems.length,
        })
      );
      process.exit(self.length || live.problems.length ? 1 : 0);
    } else if (cmd === "check") {
      const problems = checkRelease(ROOT, { withOut: arg === "--out" });
      const release = readRelease(ROOT);
      for (const p of problems) console.log("✗ " + p);
      console.log(
        JSON.stringify({
          entry: release.entry,
          entryPath: entryPath(release.entry),
          retained: release.retained,
          problems: problems.length,
        })
      );
      process.exit(problems.length ? 1 : 0);
    } else if (cmd === "publish" && arg) {
      console.log(JSON.stringify(publish(resolve(arg))));
    } else if (cmd === "point" && arg) {
      console.log(JSON.stringify(point(arg)));
    } else if (cmd === "restore-legacy") {
      console.log(JSON.stringify(restoreLegacy()));
    } else if (cmd === "legacy-manifest" && arg) {
      const out = join(ROOT, LEGACY_MANIFEST);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, JSON.stringify(legacyManifest(arg), null, 2) + "\n");
      console.log(out);
    } else {
      console.error(
        "用法：game-release.mjs check [--out] | check-published <gh-pages 完整 SHA> [--out] | publish <匯出目錄> | point <版本|legacy> | restore-legacy | legacy-manifest <commit>"
      );
      process.exit(2);
    }
  } catch (e) {
    console.error(String((e && e.message) || e));
    process.exit(e instanceof BaselineError ? 2 : 1);
  }
}
