// 回歸工具暫存目錄清理（temp-dir.mjs）的正反案例，不需要 Godot 或瀏覽器
// - 完整通過＋有 EVIDENCE_DIR：證據寫好、讀回核對後才刪除這次建立的目錄
// - 沒有通過、要求保留、沒有 EVIDENCE_DIR、證據寫不進去：保留
// - 路徑保護：紀錄被改成暫存根目錄、外部目錄、別的同前綴目錄、名稱不符或符號連結（junction）時拒絕刪除，目標都還在
// 全部在這個測試自己建立的測試根目錄（系統暫存目錄底下）裡進行，結束時移除該測試根目錄
// 用法：node scripts/shenma-regression/tools/temp-dir.test.mjs
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkRemovable, createTempDir, finishTempDir } from "./temp-dir.mjs";

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok });
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : "  " + JSON.stringify(detail)}`
  );
};

// 測試根目錄：當作「系統暫存目錄」傳給 createTempDir，所有案例都在它底下
const sandbox = realpathSync(
  mkdtempSync(join(tmpdir(), "shenma-tempdir-test-"))
);
const outside = join(sandbox, "..", `${sandbox.split(/[\\/]/).pop()}-outside`);
const evidence = join(sandbox, "__evidence");
const quiet = (fn) => {
  const log = console.log;
  const lines = [];
  console.log = (...a) => lines.push(a.join(" "));
  try {
    return { r: fn(), lines };
  } finally {
    console.log = log;
  }
};
const withEnv = (env, fn) => {
  const keep = {};
  for (const k of Object.keys(env)) {
    keep[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(keep)) {
      if (keep[k] === undefined) delete process.env[k];
      else process.env[k] = keep[k];
    }
  }
};
const make = () => {
  const t = createTempDir("shenma-selftest-", sandbox);
  writeFileSync(join(t.dir, "test.log"), "PASS  a\nRESULT_JSON {}\n");
  return t;
};
const finish = (t, opts, env = {}) =>
  withEnv(
    { EVIDENCE_DIR: evidence, SHENMA_KEEP_TEMP: undefined, ...env },
    () =>
      quiet(() =>
        finishTempDir(t, {
          name: "selftest",
          result: { fixtures: 1 },
          files: ["test.log"],
          argv: ["node", "x"],
          ...opts,
        })
      ).r
  );

try {
  // ── 成功清除 ──
  const t1 = make();
  const r1 = finish(t1, { passed: true });
  const ev = r1.evidence && join(r1.evidence.dir, "test.log");
  check(
    "暫存-1 完整通過且有 EVIDENCE_DIR：結果與 log 已寫到 temp-evidence/<目錄名>/ 並讀回核對（大小與 sha256），之後刪除這次建立的目錄",
    r1.removed === true &&
      !existsSync(t1.dir) &&
      !!ev &&
      readFileSync(ev, "utf8") === "PASS  a\nRESULT_JSON {}\n" &&
      JSON.parse(readFileSync(join(r1.evidence.dir, "result.json"), "utf8"))
        .name === "selftest" &&
      r1.evidence.files.every((f) => /^[0-9a-f]{64}$/.test(f.sha256)),
    r1
  );

  // ── 保留 ──
  const t2 = make();
  const r2 = finish(t2, { passed: false });
  const t3 = make();
  const r3 = finish(t3, { passed: true, argv: ["node", "x", "--keep-temp"] });
  const t4 = make();
  const r4 = finish(t4, { passed: true }, { SHENMA_KEEP_TEMP: "1" });
  const t5 = make();
  const r5 = finish(t5, { passed: true }, { EVIDENCE_DIR: undefined });
  const blocker = join(sandbox, "__blocker");
  writeFileSync(blocker, "not a directory");
  const t6 = make();
  const r6 = finish(t6, { passed: true }, { EVIDENCE_DIR: blocker });
  const t7 = make();
  const r7 = finish(t7, { passed: true, files: ["missing.log"] });
  check(
    "暫存-2 沒有通過、--keep-temp、SHENMA_KEEP_TEMP=1、沒有 EVIDENCE_DIR、證據目錄寫不進去、要保存的 log 不存在：都保留目錄並寫明原因",
    [
      [t2, r2],
      [t3, r3],
      [t4, r4],
      [t5, r5],
      [t6, r6],
      [t7, r7],
    ].every(
      ([t, r]) => r.removed === false && existsSync(t.dir) && !!r.reason
    ) &&
      /沒有完整通過/.test(r2.reason) &&
      /要求保留/.test(r3.reason) &&
      /要求保留/.test(r4.reason) &&
      /沒有 EVIDENCE_DIR/.test(r5.reason) &&
      /證據保存失敗/.test(r6.reason) &&
      /證據保存失敗/.test(r7.reason),
    [r2, r3, r4, r5, r6, r7].map((r) => r.reason)
  );

  // ── 路徑保護 ──
  mkdirSync(outside, { recursive: true });
  const t8 = make();
  const guards = {
    root: checkRemovable({ ...t8, dir: sandbox }),
    outside: checkRemovable({ ...t8, dir: outside }),
    parent: checkRemovable({ ...t8, dir: join(sandbox, "..") }),
    nested: (() => {
      const d = join(t8.dir, "shenma-selftest-abcdef");
      mkdirSync(d);
      return checkRemovable({ ...t8, dir: d });
    })(),
    prefix: checkRemovable({ ...t8, prefix: "shenma-godot-mutation-" }),
    badPrefix: checkRemovable({ ...t8, prefix: ".*" }),
    notRecord: checkRemovable({ dir: t8.dir }),
    missing: checkRemovable({
      ...t8,
      dir: join(sandbox, "shenma-selftest-zzzzzz"),
    }),
  };
  // 別的同前綴目錄（不是這次建立的）也通過形式檢查：finishTempDir 只會用自己的紀錄，所以只刪自己的
  const other = createTempDir("shenma-selftest-", sandbox);
  const r8 = finish(t8, { passed: true });
  // 符號連結（Windows 用 junction）：名稱符合前綴，但指向外部目錄
  const link = join(sandbox, "shenma-selftest-link01");
  let linkMade = true;
  try {
    symlinkSync(outside, link, "junction");
  } catch {
    linkMade = false;
  }
  const linkGuard = linkMade
    ? checkRemovable({ dir: link, root: sandbox, prefix: "shenma-selftest-" })
    : { ok: false, reason: "（無法建立連結，略過）" };
  const linkFinish = linkMade
    ? finish(
        { dir: link, root: sandbox, prefix: "shenma-selftest-" },
        { passed: true, files: [] }
      )
    : null;
  check(
    "暫存-3 路徑保護：暫存根目錄、外部目錄、上一層、子目錄、別的前綴、不合法前綴、不是 createTempDir 的紀錄、不存在的目錄都拒絕刪除；只刪自己的紀錄，別的同前綴目錄還在",
    Object.values(guards).every((g) => g.ok === false && !!g.reason) &&
      existsSync(sandbox) &&
      existsSync(outside) &&
      r8.removed === true &&
      !existsSync(t8.dir) &&
      existsSync(other.dir),
    { guards, r8: r8.reason, other: existsSync(other.dir) }
  );
  check(
    "暫存-4 名稱符合前綴的符號連結（junction）指向外部：拒絕刪除、連結指向的外部目錄與內容都還在",
    linkMade &&
      linkGuard.ok === false &&
      /符號連結/.test(linkGuard.reason) &&
      linkFinish.removed === false &&
      /拒絕刪除/.test(linkFinish.reason) &&
      existsSync(outside),
    { linkMade, linkGuard, linkFinish: linkFinish && linkFinish.reason }
  );
} finally {
  rmSync(join(sandbox, "shenma-selftest-link01"), { force: true });
  rmSync(sandbox, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
