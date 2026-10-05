// 部署前的正式基準守門（GitHub Actions 發布 out/ 到 gh-pages 之前用）：唯讀，只讀遠端與 fetch 一個提交，不推送、不改任何 ref
//
// 用法：
//   node deploy-guard.mjs pin              讀遠端 origin 的 gh-pages 完整 SHA、fetch 到本機並確認是提交；stdout 只印這個 SHA
//                                          讀不到、沒有 gh-pages、fetch 失敗：結束碼 2（不當成沒有已發布版本放行）
//   node deploy-guard.mjs unchanged <SHA>  發布前再讀一次遠端 gh-pages：和核對用的基準相同 0、不同 1（遠端漂移，要重新核對）、讀不到 2
//
// 部署流程（.github/workflows/deploy.yml 的「正式保留核對」步驟，建置之後、發布之前）：
//   sha=$(deploy-guard.mjs pin) → game-release.mjs check-published "$sha" --out → deploy-guard.mjs unchanged "$sha"
// 任何一步非 0 都停止，不會發布。
// 限制：unchanged 之後到發布動作實際推送之間仍有空窗；這裡只擋「核對用的基準已經不是遠端現況」，
// 不解決兩個部署同時進行的競態（那要部署本身以基準做條件式推送，或部署流程排隊）。
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(HERE, "../../..");
export const PAGES_REF = "refs/heads/gh-pages";
const REMOTE = "origin";
const SHA_RE = /^[0-9a-f]{40}$/;

/** 讀不到正式基準（或用法錯誤）：結束碼 2 */
export class GuardError extends Error {}

const git = (args, root) =>
  execFileSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
const stderrOf = (e) => String((e && e.stderr) || (e && e.message) || e).trim();

/** 遠端 gh-pages 目前的完整 SHA（git ls-remote，唯讀） */
export function remotePagesSha(root = ROOT) {
  let out;
  try {
    out = git(["ls-remote", "--exit-code", REMOTE, PAGES_REF], root);
  } catch (e) {
    throw new GuardError(
      e && e.status === 2
        ? `遠端 ${REMOTE} 沒有 ${PAGES_REF}（沒有正式基準，不能放行）`
        : `讀不到遠端 ${REMOTE} 的 ${PAGES_REF}：${stderrOf(e)}`
    );
  }
  const rows = out.split("\n").filter(Boolean);
  const [sha, ref] = (rows[0] || "").split("\t");
  if (rows.length !== 1 || ref !== PAGES_REF || !SHA_RE.test(sha || ""))
    throw new GuardError(`遠端 ${PAGES_REF} 的回應無法解析：${out}`);
  return sha;
}

/** 釘選正式基準：讀遠端完整 SHA，本機沒有就 fetch 這個提交（淺層 clone 時也只取一層），確認是提交 */
export function pin(root = ROOT) {
  const sha = remotePagesSha(root);
  const has = () => {
    try {
      return git(["cat-file", "-t", sha], root) === "commit";
    } catch {
      return false;
    }
  };
  if (!has()) {
    // 只有本來就是淺層的倉庫（Actions 的 checkout）才加 --depth，不把開發機的完整倉庫變成淺層
    const shallow =
      git(["rev-parse", "--is-shallow-repository"], root) === "true";
    try {
      git(
        [
          "fetch",
          "--no-tags",
          "--no-write-fetch-head",
          ...(shallow ? ["--depth=1"] : []),
          REMOTE,
          sha,
        ],
        root
      );
    } catch (e) {
      throw new GuardError(`fetch 正式基準 ${sha} 失敗：${stderrOf(e)}`);
    }
    if (!has()) throw new GuardError(`fetch 之後本機仍沒有正式基準提交 ${sha}`);
  }
  return sha;
}

/** 發布前再讀遠端：還是核對用的基準就 true */
export function unchanged(baseline, root = ROOT) {
  if (!SHA_RE.test(baseline || ""))
    throw new GuardError(
      "核對用的基準必須是 pin 印出的完整 40 字元 SHA（不接受分支名稱）"
    );
  return remotePagesSha(root) === baseline;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const [cmd, arg] = process.argv.slice(2);
  try {
    if (cmd === "pin") {
      const sha = pin();
      console.error(`正式基準（遠端 ${PAGES_REF}）：${sha}`);
      console.log(sha);
    } else if (cmd === "unchanged") {
      if (!unchanged(arg)) {
        console.error(
          `遠端 ${PAGES_REF} 已經不是核對用的基準 ${arg}（核對之後有其他發布）：停止，請重新執行部署以重新核對`
        );
        process.exit(1);
      }
      console.error(`遠端 ${PAGES_REF} 仍是核對用的基準 ${arg}`);
    } else {
      console.error("用法：deploy-guard.mjs pin | unchanged <SHA>");
      process.exit(2);
    }
  } catch (e) {
    console.error(String((e && e.message) || e));
    process.exit(e instanceof GuardError ? 2 : 1);
  }
}
