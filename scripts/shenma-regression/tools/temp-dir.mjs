// 回歸工具自己的暫存目錄（selftest.mjs、godot-mutation.mjs 共用）：只清「這次自己建立、完整通過、證據已經保存」的那一個目錄
// - createTempDir(prefix)：在系統暫存目錄下用 mkdtemp 建立，記下建立時的實際路徑（之後只認這一個）
// - finishTempDir(t, { passed, name, result, files })：
//   1. 沒有完整通過、設定了 SHENMA_KEEP_TEMP=1（或工具收到 --keep-temp）、沒有 EVIDENCE_DIR 時一律保留並說明原因
//   2. 先把結果（result，含變異身份與指紋）與指定的 log（files，暫存目錄裡的相對路徑）寫到 <EVIDENCE_DIR>/temp-evidence/<目錄名>/，
//      讀回核對大小與 sha256；寫不進去或核對不符就保留
//   3. 刪除前再核對路徑（checkRemovable）：不符就拒絕刪除、保留
//   中斷或拋出例外時走不到這裡，暫存目錄自然保留。不會回頭掃描或刪除其他（舊的、別人的）暫存目錄
// 每次結束印一行 TEMP_DIR {...}（dir、removed、reason、evidence）
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
// 前綴只能是英數與連字號，mkdtemp 在後面加 6 個英數字元
const PREFIX_RE = /^[A-Za-z0-9-]+$/;

export const keepTempRequested = (argv = process.argv) =>
  process.env.SHENMA_KEEP_TEMP === "1" || argv.includes("--keep-temp");

export function createTempDir(prefix, root = tmpdir()) {
  if (!PREFIX_RE.test(prefix)) throw new Error(`暫存目錄前綴不合法：${prefix}`);
  const realRoot = realpathSync(root);
  const dir = realpathSync(mkdtempSync(join(realRoot, prefix)));
  return Object.freeze({ dir, root: realRoot, prefix });
}

/**
 * 這個目錄可不可以刪：t 必須是 createTempDir 的紀錄，而且目前的路徑
 * - 不是符號連結或 junction（lstat）
 * - 解析後（realpath）和建立時記下的路徑完全相同
 * - 就在暫存根目錄底下一層、不是根目錄本身
 * - 名稱是「前綴＋6 個英數字元」
 */
export function checkRemovable(t) {
  if (!t || typeof t.dir !== "string" || typeof t.root !== "string")
    return { ok: false, reason: "不是 createTempDir 建立的紀錄" };
  if (!PREFIX_RE.test(t.prefix || ""))
    return { ok: false, reason: "前綴不合法" };
  let st;
  try {
    st = lstatSync(t.dir);
  } catch {
    return { ok: false, reason: "目錄不存在" };
  }
  if (st.isSymbolicLink())
    return { ok: false, reason: "是符號連結或 junction，不刪除" };
  if (!st.isDirectory()) return { ok: false, reason: "不是目錄" };
  let real;
  let realRoot;
  try {
    real = realpathSync(t.dir);
    realRoot = realpathSync(t.root);
  } catch {
    return { ok: false, reason: "路徑無法解析" };
  }
  if (real !== resolve(t.dir))
    return { ok: false, reason: "解析後的路徑和建立時不同" };
  if (real === realRoot || realRoot === dirname(realRoot))
    return { ok: false, reason: "是暫存根目錄或磁碟根目錄" };
  if (dirname(real) !== realRoot)
    return { ok: false, reason: "不在暫存根目錄底下一層" };
  if (!new RegExp(`^${t.prefix}[A-Za-z0-9]{6}$`).test(basename(real)))
    return { ok: false, reason: "名稱不是這次的前綴加 mkdtemp 的 6 個字元" };
  return { ok: true, reason: null };
}

function report(info) {
  console.log("TEMP_DIR " + JSON.stringify(info));
  return info;
}

export function finishTempDir(
  t,
  { passed, name, result, files = [], argv = process.argv }
) {
  const base = { dir: t.dir, removed: false, evidence: null };
  if (keepTempRequested(argv))
    return report({
      ...base,
      reason: "要求保留（--keep-temp／SHENMA_KEEP_TEMP=1）",
    });
  if (!passed) return report({ ...base, reason: "沒有完整通過，保留供排查" });
  const evidenceRoot = process.env.EVIDENCE_DIR;
  if (!evidenceRoot)
    return report({ ...base, reason: "沒有 EVIDENCE_DIR 可保存證據，保留" });
  const out = join(resolve(evidenceRoot), "temp-evidence", basename(t.dir));
  const saved = [];
  try {
    mkdirSync(out, { recursive: true });
    const items = [
      [
        "result.json",
        Buffer.from(JSON.stringify({ name, ...result }, null, 2) + "\n"),
      ],
      ...files.map((f) => [basename(f), readFileSync(join(t.dir, f))]),
    ];
    for (const [file, buf] of items) {
      const p = join(out, file);
      writeFileSync(p, buf);
      const back = readFileSync(p);
      if (back.length !== buf.length || sha256(back) !== sha256(buf))
        throw new Error(`讀回核對不符：${file}`);
      saved.push({ file, bytes: buf.length, sha256: sha256(buf) });
    }
  } catch (e) {
    return report({
      ...base,
      reason: `證據保存失敗，保留（${e instanceof Error ? e.message : e}）`,
    });
  }
  const evidence = { dir: out, files: saved };
  const guard = checkRemovable(t);
  if (!guard.ok)
    return report({ ...base, evidence, reason: `拒絕刪除：${guard.reason}` });
  try {
    rmSync(t.dir, { recursive: true });
  } catch (e) {
    return report({
      ...base,
      evidence,
      reason: `刪除失敗（${e instanceof Error ? e.message : e}）`,
    });
  }
  return report({ ...base, removed: true, evidence, reason: null });
}
