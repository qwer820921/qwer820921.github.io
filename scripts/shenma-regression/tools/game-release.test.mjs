// 發布工具（tools/game-release.mjs）的測試：在暫存目錄建立假的倉庫（舊正式版目錄、版本目錄、網站入口指標），
// 核對「該失敗時一定失敗」：舊目錄被改或多了新版檔案、版本目錄不一致或用了舊的快取前綴、入口指向不存在的目錄、
// 沒有列管的版本目錄、網站寫死遊戲目錄、out/ 和 public/ 不同；發布同一版內容不同時拒絕、回退只改入口指標。
// 另外在真的倉庫（唯讀）核對：legacy-root.json 可以由來源 commit 重新產生（不依賴暫存的回退包）。不需要瀏覽器與 Godot
// 用法：node scripts/shenma-regression/tools/game-release.test.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  LEGACY_DIR,
  LEGACY_MANIFEST,
  PACKAGES_DIR,
  PACKAGE_FILES,
  RELEASE_FILE,
  ROOT,
  BaselineError,
  checkRelease,
  entryPath,
  legacyManifest,
  packageProblems,
  point,
  publish,
  publishedProblems,
  readRelease,
} from "./game-release.mjs";
import { buildInfo, patchServiceWorker } from "./postexport.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = readFileSync(
  join(HERE, "..", "fixtures", "godot-4.6.2-service-worker.js"),
  "utf8"
);
const HTML = readFileSync(
  join(HERE, "..", "fixtures", "godot-4.6.2-index.html"),
  "utf8"
);
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail)}`
  );
};
const throws = (fn, re) => {
  try {
    fn();
    return false;
  } catch (e) {
    return !re || re.test(e.message);
  }
};
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const blobOf = (b) =>
  createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b]))
    .digest("hex");
const tmp = mkdtempSync(join(tmpdir(), "shenma-release-test-"));

/** 一份經過 postexport 的假匯出（label 決定外殼頁內容、pck 決定資料包）；寫到 dir，回傳版本 */
function makeExport(dir, label, pck = "pck") {
  const raw = {
    "index.html": Buffer.from(
      HTML.replace("shenmaSanguo</title>", `${label}</title>`)
    ),
    "index.js": Buffer.from("js engine-1\n"),
    "index.wasm": Buffer.from("wasm engine-1 ".repeat(20)),
    "index.pck": Buffer.from(pck.repeat(20)),
    "index.audio.worklet.js": Buffer.from("w1"),
    "index.audio.position.worklet.js": Buffer.from("w2"),
  };
  const info = buildInfo((f) => raw[f]);
  mkdirSync(dir, { recursive: true });
  const files = {
    ...raw,
    "index.html": Buffer.from(info.html),
    "index.service.worker.js": Buffer.from(patchServiceWorker(TEMPLATE, info)),
  };
  for (const f of PACKAGE_FILES)
    writeFileSync(join(dir, f), files[f] || Buffer.from(`static ${f}`));
  return info.version;
}

/** 假的倉庫：舊正式版目錄（和自己的 legacy-root.json 相同）、一個版本目錄、入口指向它、一個正常引用 GAME_ENTRY 的元件 */
function makeRepo(name) {
  const root = join(tmp, name);
  const legacy = join(root, LEGACY_DIR);
  mkdirSync(legacy, { recursive: true });
  const files = {};
  for (const f of ["index.html", "index.js", "index.pck", "index.wasm"]) {
    const data = Buffer.from(`legacy ${f}\n`);
    writeFileSync(join(legacy, f), data);
    files[f] = { bytes: data.length, sha256: sha256(data), blob: blobOf(data) };
  }
  mkdirSync(dirname(join(root, LEGACY_MANIFEST)), { recursive: true });
  writeFileSync(
    join(root, LEGACY_MANIFEST),
    JSON.stringify({ source: "0".repeat(40), dir: LEGACY_DIR, files })
  );
  const v = makeExport(join(tmp, name + "-export"), name);
  cpSync(join(tmp, name + "-export"), join(root, PACKAGES_DIR, v), {
    recursive: true,
  });
  mkdirSync(dirname(join(root, RELEASE_FILE)), { recursive: true });
  writeFileSync(
    join(root, RELEASE_FILE),
    JSON.stringify({ entry: v, retained: [v] })
  );
  const comp = join(root, "src/app/(games)/shenmaSanguo/components");
  mkdirSync(comp, { recursive: true });
  writeFileSync(
    join(comp, "Page.tsx"),
    'import { GAME_ENTRY } from "../utils/gameEngine";\nexport const P = () => <iframe src={GAME_ENTRY} />;\n'
  );
  return { root, v };
}
const has = (problems, re) => problems.some((p) => re.test(p));

// ── 核對 ──
const ok = makeRepo("ok");
check(
  "正常：舊正式版目錄和清單相同、版本目錄自我一致、入口指向保留中的版本目錄 → 沒有問題",
  checkRelease(ok.root).length === 0 &&
    entryPath(ok.v) === `/games/shenmaSanguo-v/${ok.v}/` &&
    entryPath("legacy") === "/games/shenmaSanguo/",
  checkRelease(ok.root)
);

const extra = makeRepo("legacy-extra");
writeFileSync(join(extra.root, LEGACY_DIR, "bgm_battle.ogg"), "ogg");
const changed = makeRepo("legacy-changed");
writeFileSync(join(changed.root, LEGACY_DIR, "index.pck"), "new pck\n");
const missing = makeRepo("legacy-missing");
rmSync(join(missing.root, LEGACY_DIR, "index.wasm"));
check(
  "舊正式版目錄多了新版的檔案、資料包被換掉、少了引擎：都失敗（舊目錄不能被覆寫）",
  has(checkRelease(extra.root), /舊正式版目錄多了 bgm_battle\.ogg/) &&
    has(checkRelease(changed.root), /舊正式版目錄的 index\.pck 和/) &&
    has(checkRelease(missing.root), /舊正式版目錄少了 index\.wasm/),
  {
    extra: checkRelease(extra.root),
    changed: checkRelease(changed.root),
    missing: checkRelease(missing.root),
  }
);

const swapped = makeRepo("pkg-swapped");
writeFileSync(
  join(swapped.root, PACKAGES_DIR, swapped.v, "index.pck"),
  "pck of another version"
);
const prefix = makeRepo("pkg-prefix");
const swPath = join(
  prefix.root,
  PACKAGES_DIR,
  prefix.v,
  "index.service.worker.js"
);
writeFileSync(
  swPath,
  readFileSync(swPath, "utf8").replace(
    "const CACHE_PREFIX = 'shenmaSanguo-pkg-';",
    "const CACHE_PREFIX = 'shenmaSanguo-sw-cache-';"
  )
);
const renamed = makeRepo("pkg-renamed");
const wrongName = "0123456789abcdef";
cpSync(
  join(renamed.root, PACKAGES_DIR, renamed.v),
  join(renamed.root, PACKAGES_DIR, wrongName),
  { recursive: true }
);
rmSync(join(renamed.root, PACKAGES_DIR, renamed.v), { recursive: true });
writeFileSync(
  join(renamed.root, RELEASE_FILE),
  JSON.stringify({ entry: wrongName, retained: [wrongName] })
);
check(
  "版本目錄：資料包換成別版、快取前綴用回舊正式版的、目錄名稱和內容的版本不同：都失敗",
  has(checkRelease(swapped.root), /index\.pck 和 Service Worker 記錄的/) &&
    has(checkRelease(prefix.root), /快取前綴不是 shenmaSanguo-pkg-/) &&
    has(
      checkRelease(renamed.root),
      /外殼頁的版本 .* 和目錄名稱 0123456789abcdef 不同/
    ),
  {
    swapped: checkRelease(swapped.root),
    prefix: checkRelease(prefix.root),
    renamed: checkRelease(renamed.root),
  }
);

const dangling = makeRepo("entry-dangling");
writeFileSync(
  join(dangling.root, RELEASE_FILE),
  JSON.stringify({ entry: "fedcba9876543210", retained: [dangling.v] })
);
const gone = makeRepo("retained-gone");
writeFileSync(
  join(gone.root, RELEASE_FILE),
  JSON.stringify({ entry: gone.v, retained: [gone.v, "fedcba9876543210"] })
);
const unlisted = makeRepo("unlisted");
makeExport(join(unlisted.root, PACKAGES_DIR, "aaaaaaaaaaaaaaaa"), "x");
check(
  "入口指向不在 retained 的版本、retained 的目錄不存在、有沒列管的版本目錄：都失敗",
  has(checkRelease(dangling.root), /entry（fedcba9876543210）必須是/) &&
    has(checkRelease(gone.root), /fedcba9876543210 不存在/) &&
    has(
      checkRelease(unlisted.root),
      /aaaaaaaaaaaaaaaa 不在入口指標的 retained/
    ),
  {
    dangling: checkRelease(dangling.root),
    gone: checkRelease(gone.root),
    unlisted: checkRelease(unlisted.root),
  }
);

const hard = makeRepo("hardcoded");
writeFileSync(
  join(hard.root, "src/app/(games)/shenmaSanguo/components/Old.tsx"),
  'export const O = () => <iframe src="/games/shenmaSanguo/index.html" />;\n'
);
check(
  "網站原始碼寫死遊戲目錄（沒有經過入口指標）：失敗",
  has(checkRelease(hard.root), /Old\.tsx 寫死了遊戲目錄/),
  checkRelease(hard.root)
);

const out = makeRepo("out");
cpSync(join(out.root, LEGACY_DIR), join(out.root, "out/games/shenmaSanguo"), {
  recursive: true,
});
cpSync(
  join(out.root, PACKAGES_DIR),
  join(out.root, "out/games/shenmaSanguo-v"),
  { recursive: true }
);
const outOk = checkRelease(out.root, { withOut: true }).length === 0;
writeFileSync(
  join(out.root, "out/games/shenmaSanguo-v", out.v, "index.pck"),
  "stale build"
);
check(
  "--out：out/ 的遊戲目錄和 public/ 相同才通過；out/ 是舊的建置時失敗",
  outOk &&
    has(
      checkRelease(out.root, { withOut: true }),
      new RegExp(`out/games/shenmaSanguo-v/${out.v} 和 .* 不同：index\\.pck`)
    ),
  checkRelease(out.root, { withOut: true })
);

// ── 發布與回退 ──
const rel = makeRepo("publish");
const v2 = makeExport(join(tmp, "v2-export"), "second", "pck2");
const p1 = publish(join(tmp, "v2-export"), rel.root);
const afterPublish = readRelease(rel.root);
check(
  "發布新版：放進它的版本目錄，入口改成新版，上一個入口版本仍保留；核對通過",
  p1.copied &&
    p1.version === v2 &&
    p1.previous === rel.v &&
    afterPublish.entry === v2 &&
    JSON.stringify(afterPublish.retained) === JSON.stringify([rel.v, v2]) &&
    checkRelease(rel.root).length === 0,
  { p1, afterPublish, problems: checkRelease(rel.root) }
);
const p2 = publish(join(tmp, "v2-export"), rel.root);
writeFileSync(join(tmp, "v2-export", "index.offline.html"), "changed offline");
check(
  "同一版再發布一次：內容相同時不複製；版本相同但內容不同（外殼頁以外的檔案被改）時拒絕，版本目錄不變",
  !p2.copied &&
    throws(
      () => publish(join(tmp, "v2-export"), rel.root),
      /已存在但內容不同/
    ) &&
    readFileSync(
      join(rel.root, PACKAGES_DIR, v2, "index.offline.html"),
      "utf8"
    ) === "static index.offline.html",
  p2
);
const bad = join(tmp, "bad-export");
makeExport(bad, "bad");
writeFileSync(join(bad, "index.pck"), "corrupted");
check(
  "匯出目錄本身不一致（資料包和 Service Worker 記錄的不同）：拒絕發布",
  throws(() => publish(bad, rel.root), /匯出目錄有問題/),
  packageProblems(bad).problems
);
const back = point("legacy", rel.root);
const backRelease = readRelease(rel.root);
const forward = point(rel.v, rel.root);
check(
  "回退：入口指回舊正式版（legacy）或保留中的版本，只改入口指標、版本目錄都還在；指向沒有保留的版本時拒絕",
  back.previous === v2 &&
    back.path === "/games/shenmaSanguo/" &&
    backRelease.entry === "legacy" &&
    JSON.stringify(backRelease.retained) === JSON.stringify([rel.v, v2]) &&
    forward.entry === rel.v &&
    checkRelease(rel.root).length === 0 &&
    throws(() => point("fedcba9876543210", rel.root), /不是保留中的版本目錄/),
  { back, backRelease, forward }
);

// ── 正式保留核對（外部正式基準）──
/** 假的正式 Pages（另一個 git 倉庫）：舊正式版目錄照 legacyFrom、已發布的版本目錄照 versions 的 [版本, 來源倉庫]；回傳 { repo, sha } */
function makePages(name, legacyFrom, versions) {
  const dir = join(tmp, name + "-pages");
  mkdirSync(dir, { recursive: true });
  if (legacyFrom)
    cpSync(join(legacyFrom, LEGACY_DIR), join(dir, "games/shenmaSanguo"), {
      recursive: true,
    });
  for (const [v, from] of versions)
    cpSync(join(from, PACKAGES_DIR, v), join(dir, "games/shenmaSanguo-v", v), {
      recursive: true,
    });
  writeFileSync(join(dir, "shenmaSanguo.html"), "<html></html>\n");
  const g = (...a) =>
    execFileSync(
      "git",
      [
        "-C",
        dir,
        "-c",
        "core.autocrlf=false",
        "-c",
        "user.name=test",
        "-c",
        "user.email=test@example.invalid",
        ...a,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
    );
  g("init", "-q");
  g("add", "-A");
  g("commit", "-q", "-m", "pages");
  return { repo: dir, sha: g("rev-parse", "HEAD").trim() };
}
const pubProblems = (root, pages) =>
  publishedProblems(root, pages.sha, pages.repo).problems;

const fresh = makeRepo("pub-fresh");
const emptyPages = makePages("pub-empty", fresh.root, []);
const emptyResult = publishedProblems(
  fresh.root,
  emptyPages.sha,
  emptyPages.repo
);
check(
  "正式基準還沒有已發布版本（只有舊正式版）＋這個候選：通過",
  emptyResult.problems.length === 0 &&
    emptyResult.published.length === 0 &&
    checkRelease(fresh.root).length === 0,
  emptyResult
);

// 已發布 A（正式基準有 A 的原檔）；候選再發布 B：retained [A, B]、A 原樣保留
const kept = makeRepo("pub-kept");
const pagesA = makePages("pub-a", kept.root, [[kept.v, kept.root]]);
makeExport(join(tmp, "pub-b-export"), "pub-b", "pckB");
const vB = publish(join(tmp, "pub-b-export"), kept.root).version;
check(
  "正式基準已有版本 A＋候選保留 A 原檔並加上 B：通過",
  pubProblems(kept.root, pagesA).length === 0 &&
    checkRelease(kept.root).length === 0 &&
    JSON.stringify(readRelease(kept.root).retained) ===
      JSON.stringify([kept.v, vB]),
  pubProblems(kept.root, pagesA)
);

/** 複製 kept（A 已發布、候選 A＋B）再做手腳 */
const variant = (name, mutate) => {
  const root = join(tmp, name);
  cpSync(kept.root, root, { recursive: true });
  mutate(root);
  return root;
};
const onlyRetained = variant("pub-only-retained", (root) =>
  writeFileSync(
    join(root, RELEASE_FILE),
    JSON.stringify({ entry: vB, retained: [vB] })
  )
);
const bothGone = variant("pub-both-gone", (root) => {
  writeFileSync(
    join(root, RELEASE_FILE),
    JSON.stringify({ entry: vB, retained: [vB] })
  );
  rmSync(join(root, PACKAGES_DIR, kept.v), { recursive: true });
});
const blobChanged = variant("pub-blob-changed", (root) =>
  writeFileSync(join(root, PACKAGES_DIR, kept.v, "index.png"), "other png")
);
check(
  "候選只漏了 retained、retained 與目錄一起刪掉、改了已發布版本的檔案：正式保留核對都失敗（後兩者候選自洽核對仍會通過）",
  has(
    pubProblems(onlyRetained, pagesA),
    /已正式發布的版本 .* 不在入口指標的 retained/
  ) &&
    has(pubProblems(bothGone, pagesA), /不在入口指標的 retained/) &&
    has(pubProblems(bothGone, pagesA), /的目錄 .* 不存在/) &&
    checkRelease(bothGone).length === 0 &&
    has(pubProblems(blobChanged, pagesA), /的 index\.png 和正式基準不同/) &&
    checkRelease(blobChanged).length === 0,
  {
    onlyRetained: pubProblems(onlyRetained, pagesA),
    bothGone: pubProblems(bothGone, pagesA),
    bothGoneSelf: checkRelease(bothGone),
    blobChanged: pubProblems(blobChanged, pagesA),
    blobChangedSelf: checkRelease(blobChanged),
  }
);

const legacyChangedPages = makePages("pub-legacy-changed", kept.root, []);
writeFileSync(
  join(legacyChangedPages.repo, "games/shenmaSanguo/index.pck"),
  "live pck\n"
);
execFileSync(
  "git",
  [
    "-C",
    legacyChangedPages.repo,
    "-c",
    "user.name=test",
    "-c",
    "user.email=test@example.invalid",
    "commit",
    "-q",
    "-am",
    "changed",
  ],
  { stdio: ["ignore", "pipe", "pipe"] }
);
legacyChangedPages.sha = execFileSync(
  "git",
  ["-C", legacyChangedPages.repo, "rev-parse", "HEAD"],
  { encoding: "utf8" }
).trim();
check(
  "正式基準的舊正式版目錄和 legacy-root.json 的原檔不同：失敗",
  has(
    pubProblems(fresh.root, legacyChangedPages),
    /正式基準的舊正式版目錄 index\.pck 和 legacy-root\.json 的原檔不同/
  ),
  pubProblems(fresh.root, legacyChangedPages)
);

const notPages = makePages("pub-not-pages", null, []);
const baselineErr = (sha, repo) =>
  throws(() => publishedProblems(fresh.root, sha, repo), /正式基準|本機沒有/) &&
  (() => {
    try {
      publishedProblems(fresh.root, sha, repo);
    } catch (e) {
      return e instanceof BaselineError;
    }
    return false;
  })();
let cliExit = null;
try {
  execFileSync(
    process.execPath,
    [join(HERE, "game-release.mjs"), "check-published"],
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  cliExit = 0;
} catch (e) {
  cliExit = e.status;
}
check(
  "正式基準缺失／不是完整 SHA／本機沒有／不是神馬三國的 Pages 樹：停止（BaselineError、CLI 結束碼 2），不當成沒有已發布版本",
  baselineErr(undefined, emptyPages.repo) &&
    baselineErr("origin/gh-pages", emptyPages.repo) &&
    baselineErr(emptyPages.sha.slice(0, 12), emptyPages.repo) &&
    baselineErr("1".repeat(40), emptyPages.repo) &&
    baselineErr(notPages.sha, notPages.repo) &&
    cliExit === 2,
  { cliExit }
);

// ── 真的倉庫（唯讀）──
const pinned = JSON.parse(readFileSync(join(ROOT, LEGACY_MANIFEST), "utf8"));
const regenerated = legacyManifest(pinned.source, ROOT);
check(
  "legacy-root.json 可以由來源 commit 重新產生（舊正式版目錄不依賴暫存的回退包）",
  JSON.stringify(regenerated) === JSON.stringify(pinned) &&
    Object.keys(pinned.files).length > 0,
  { source: pinned.source, files: Object.keys(regenerated.files).length }
);

rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
