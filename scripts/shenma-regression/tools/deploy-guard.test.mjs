// 部署前正式基準守門（tools/deploy-guard.mjs）與部署流程接線的測試：只用暫存目錄裡的假遠端（本機 bare 倉庫），
// 不連 GitHub、不觸發任何部署。依部署流程的順序實際執行 CLI（pin → game-release check-published --out → unchanged），
// 核對結束碼：核對成功 0；已發布版本被拿掉時核對失敗（不會走到發布）；遠端沒有 gh-pages 時停止；核對後遠端被其他發布改了時停止。
// 另外靜態核對 .github/workflows/deploy.yml：守門步驟在建置之後、發布之前，任何一步失敗都會停止。
// 用法：node scripts/shenma-regression/tools/deploy-guard.test.mjs
import { execFileSync, spawnSync } from "node:child_process";
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
  RELEASE_FILE,
  ROOT,
} from "./game-release.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS = "scripts/shenma-regression/tools";
const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail)}`
  );
};
const tmp = mkdtempSync(join(tmpdir(), "shenma-deploy-guard-test-"));
const git = (dir, ...a) =>
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
  ).trim();
const blobOf = (b) =>
  createHash("sha1")
    .update(Buffer.concat([Buffer.from(`blob ${b.length}\0`), b]))
    .digest("hex");

// 假遠端（bare）與用來推送假正式 Pages 的工作倉庫
const remote = join(tmp, "remote.git");
mkdirSync(remote);
git(remote, "init", "-q", "--bare");
const pages = join(tmp, "pages");
mkdirSync(pages);
git(pages, "init", "-q");
const LEGACY = { "index.html": "legacy html\n", "index.pck": "legacy pck\n" };
/** 推一版假的正式 Pages 到遠端 gh-pages；versions 是已發布的版本目錄 { 版本: { 檔名: 內容 } }；回傳 SHA */
function pushPages(message, versions = {}) {
  rmSync(join(pages, "games"), { recursive: true, force: true });
  for (const [f, text] of Object.entries(LEGACY)) {
    mkdirSync(join(pages, "games/shenmaSanguo"), { recursive: true });
    writeFileSync(join(pages, "games/shenmaSanguo", f), text);
  }
  for (const [v, files] of Object.entries(versions))
    for (const [f, text] of Object.entries(files)) {
      const p = join(pages, "games/shenmaSanguo-v", v, f);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, text);
    }
  writeFileSync(join(pages, "index.html"), `${message}\n`);
  git(pages, "add", "-A");
  git(pages, "commit", "-q", "-m", message);
  git(pages, "push", "-q", "--force", remote, "HEAD:refs/heads/gh-pages");
  return git(pages, "rev-parse", "HEAD");
}

// 候選倉庫：origin 指向假遠端，工具放在和真倉庫相同的相對路徑（ROOT 就是它）；舊正式版目錄、入口指標、建置後的 out/
const cand = join(tmp, "candidate");
mkdirSync(join(cand, TOOLS), { recursive: true });
for (const f of ["deploy-guard.mjs", "game-release.mjs", "postexport.mjs"])
  cpSync(join(HERE, f), join(cand, TOOLS, f));
git(cand, "init", "-q");
git(cand, "remote", "add", "origin", remote);
const files = {};
for (const [f, text] of Object.entries(LEGACY)) {
  const data = Buffer.from(text);
  for (const d of [LEGACY_DIR, "out/games/shenmaSanguo"]) {
    mkdirSync(join(cand, d), { recursive: true });
    writeFileSync(join(cand, d, f), data);
  }
  files[f] = {
    bytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
    blob: blobOf(data),
  };
}
mkdirSync(dirname(join(cand, LEGACY_MANIFEST)), { recursive: true });
writeFileSync(
  join(cand, LEGACY_MANIFEST),
  JSON.stringify({ source: "0".repeat(40), dir: LEGACY_DIR, files })
);
mkdirSync(dirname(join(cand, RELEASE_FILE)), { recursive: true });
writeFileSync(
  join(cand, RELEASE_FILE),
  JSON.stringify({ entry: "legacy", retained: [] })
);

/** 在候選倉庫（root）執行工具（和部署步驟相同的命令），回傳 { status, stdout, stderr } */
const runIn = (root, tool, ...args) => {
  const r = spawnSync(process.execPath, [join(root, TOOLS, tool), ...args], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: r.status, stdout: r.stdout.trim(), stderr: r.stderr.trim() };
};
const run = (tool, ...args) => runIn(cand, tool, ...args);
/** 部署步驟：pin → check-published --out → unchanged；任何一步非 0 就停（和 bash -e 相同），回傳每一步的結果 */
function guardStep(beforeUnchanged = () => {}, root = cand) {
  const steps = [];
  const p = runIn(root, "deploy-guard.mjs", "pin");
  steps.push(["pin", p.status]);
  if (p.status !== 0) return { steps, sha: null, deployed: false, p };
  const c = runIn(
    root,
    "game-release.mjs",
    "check-published",
    p.stdout,
    "--out"
  );
  steps.push(["check-published", c.status]);
  if (c.status !== 0) return { steps, sha: p.stdout, deployed: false, c };
  beforeUnchanged();
  const u = runIn(root, "deploy-guard.mjs", "unchanged", p.stdout);
  steps.push(["unchanged", u.status]);
  return { steps, sha: p.stdout, deployed: u.status === 0, u };
}
const codes = (r) => r.steps.map(([s, c]) => `${s}:${c}`).join(" ");

// ── 無基準：遠端沒有 gh-pages ──
const none = guardStep();
check(
  "遠端沒有 gh-pages：pin 結束碼 2、不印 SHA，不會核對也不會發布（不用空集合放行）",
  codes(none) === "pin:2" && !none.deployed && none.p.stdout === "",
  { codes: codes(none), stderr: none.p.stderr }
);

// ── 核對成功 ──
const sha1 = pushPages("pages 1");
const ok = guardStep();
check(
  "正式基準只有舊正式版、候選照舊：pin 釘選遠端完整 SHA（fetch 到本機）→ check-published 0 → unchanged 0 → 可以發布",
  codes(ok) === "pin:0 check-published:0 unchanged:0" &&
    ok.sha === sha1 &&
    ok.deployed &&
    git(cand, "cat-file", "-t", sha1) === "commit",
  { codes: codes(ok), sha: ok.sha, sha1 }
);

// ── 核對失敗：正式基準已發布的版本，候選沒有保留 ──
const V = "0123456789abcdef";
pushPages("pages 2", { [V]: { "index.html": "v html\n", "sub/a.js": "a\n" } });
const dropped = guardStep();
check(
  "正式基準已有版本、候選沒有保留：check-published 結束碼 1，停在核對，不會發布",
  codes(dropped) === "pin:0 check-published:1" &&
    !dropped.deployed &&
    /已正式發布的版本 0123456789abcdef 不在入口指標的 retained/.test(
      dropped.c.stdout
    ),
  { codes: codes(dropped), out: dropped.c && dropped.c.stdout }
);

// ── 遠端漂移：核對之後有其他發布 ──
pushPages("pages 3");
const drift = guardStep(() => pushPages("pages 4 (other deploy)"));
check(
  "核對通過後遠端 gh-pages 被其他發布改了：unchanged 結束碼 1，不會發布",
  codes(drift) === "pin:0 check-published:0 unchanged:1" && !drift.deployed,
  { codes: codes(drift), stderr: drift.u && drift.u.stderr }
);

// ── Actions 的淺層倉庫：checkout 只有一層、沒有 gh-pages 的提交，pin 要另外 fetch（--depth=1）；倉庫仍是淺層 ──
git(cand, "add", "-A");
git(cand, "commit", "-q", "-m", "candidate");
git(cand, "push", "-q", remote, "HEAD:refs/heads/main");
const shallow = join(tmp, "shallow");
execFileSync(
  "git",
  [
    "-c",
    "core.autocrlf=false",
    "clone",
    "-q",
    "--depth=1",
    "--branch",
    "main",
    "file:///" + remote.replace(/\\/g, "/"),
    shallow,
  ],
  { stdio: ["ignore", "pipe", "pipe"] }
);
const sha5 = pushPages("pages 5");
const hasCommit = (root, sha) => {
  try {
    return git(root, "cat-file", "-t", sha) === "commit";
  } catch {
    return false;
  }
};
const hadBefore = hasCommit(shallow, sha5);
const sh = guardStep(undefined, shallow);
check(
  "淺層倉庫（和 Actions 的 checkout 相同，沒有正式基準的提交）：pin 以 --depth=1 fetch 正式基準 → check-published 0 → unchanged 0；倉庫仍是淺層",
  !hadBefore &&
    codes(sh) === "pin:0 check-published:0 unchanged:0" &&
    sh.sha === sha5 &&
    hasCommit(shallow, sha5) &&
    git(shallow, "rev-parse", "--is-shallow-repository") === "true",
  { codes: codes(sh), sha: sh.sha, sha5, hadBefore, p: sh.p }
);

// ── 基準必須是 SHA ──
const branch = run("deploy-guard.mjs", "unchanged", "gh-pages");
const short = run("deploy-guard.mjs", "unchanged", sha1.slice(0, 12));
const cpBranch = run(
  "game-release.mjs",
  "check-published",
  "gh-pages",
  "--out"
);
check(
  "分支名稱或短 SHA 不能當基準：unchanged 與 check-published 都是結束碼 2",
  branch.status === 2 && short.status === 2 && cpBranch.status === 2,
  { branch, short, cpBranch: cpBranch.status }
);

// ── 部署流程接線（靜態）──
const yml = readFileSync(join(ROOT, ".github/workflows/deploy.yml"), "utf8")
  .replace(/\r\n/g, "\n")
  .split("\n");
const stepAt = (re) => yml.findIndex((l) => re.test(l));
const build = stepAt(/^\s+- name: Build with Next\.js/);
const guard = stepAt(/^\s+- name: Check published game versions are retained/);
const deploy = stepAt(/^\s+- name: Deploy/);
const guardBlock = yml.slice(guard, deploy).join("\n");
const nextSteps = yml
  .slice(guard + 1, deploy)
  .filter((l) => /^\s+- name:/.test(l));
check(
  "deploy.yml：守門步驟在建置之後、緊接在發布之前，以 bash（-e）依序 pin → check-published --out → unchanged，沒有 continue-on-error；發布的仍是 out",
  build > 0 &&
    guard > build &&
    deploy > guard &&
    nextSteps.length === 0 &&
    /shell: bash/.test(guardBlock) &&
    /sha=\$\(node scripts\/shenma-regression\/tools\/deploy-guard\.mjs pin\)\n\s+node scripts\/shenma-regression\/tools\/game-release\.mjs check-published "\$sha" --out\n\s+node scripts\/shenma-regression\/tools\/deploy-guard\.mjs unchanged "\$sha"/.test(
      guardBlock
    ) &&
    !yml.some((l) => /continue-on-error/.test(l)) &&
    yml.slice(deploy).some((l) => /^\s+folder: out\b/.test(l)),
  { build, guard, deploy, nextSteps }
);

rmSync(tmp, { recursive: true, force: true });
const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
