// 檢查 Godot log：錯誤行與測試結果
// 用法：node check-log.mjs <import|export|test> <log>
// 結束碼：0 = 通過；1 = 有錯誤或測試未通過；2 = 參數或讀檔錯誤
//
// - import／export：出現任何 ERROR／SCRIPT ERROR／USER ERROR／Parse Error 行就失敗。
// - test：SCRIPT ERROR、Parse Error 一律失敗；ERROR 行必須符合下方 ALLOWED_TEST_ERRORS。
//   另外必須剛好有一行 RESULT_JSON，且 failed=0、total>0，PASS 行數等於 total、沒有 FAIL 行。
import { readFileSync } from "node:fs";

const [kind, logPath] = process.argv.slice(2);
if (!["import", "export", "test"].includes(kind) || !logPath) {
  console.error("用法：node check-log.mjs <import|export|test> <log>");
  process.exit(2);
}

// 測試 log 中「預期會出現」的 ERROR（其他 ERROR 一律視為失敗）
const ALLOWED_TEST_ERRORS = [
  {
    re: /^ERROR: Resource file not found: res:\/\/assets\/tiles\/tile_(dirt|grass)\.webp \(expected type: unknown\)$/,
    why: "Main.gd 在非 Web 平台會自動注入內建測試 payload，其中的貼圖名稱不存在（實際檔名帶編號）；正式 Web 產物不會走到",
  },
  {
    re: /^ERROR: \[BattleManager\] 拒絕開始第 \d+ 波：/,
    why: "R3-E 系列測試刻意載入無效波次，驗證拒絕開戰時輸出的錯誤",
  },
];
const ERROR_LINE =
  /^(ERROR|SCRIPT ERROR|USER ERROR|USER SCRIPT ERROR):|Parse Error/;

let text;
try {
  text = readFileSync(logPath, "utf8");
} catch (e) {
  console.error("讀取 log 失敗：" + e.message);
  process.exit(2);
}
const lines = text.split(/\r?\n/);
const problems = [];
const allowedCount = new Map();

for (const line of lines) {
  if (!ERROR_LINE.test(line)) continue;
  const rule =
    kind === "test" && line.startsWith("ERROR: ") && !/Parse Error/.test(line)
      ? ALLOWED_TEST_ERRORS.find((r) => r.re.test(line))
      : undefined;
  if (rule) {
    allowedCount.set(rule, (allowedCount.get(rule) || 0) + 1);
  } else {
    problems.push("錯誤行：" + line.slice(0, 200));
  }
}

let summary = "";
if (kind === "test") {
  const pass = lines.filter((l) => l.startsWith("PASS  ")).length;
  const fail = lines.filter((l) => l.startsWith("FAIL  ")).length;
  const resultLines = lines.filter((l) => l.startsWith("RESULT_JSON "));
  if (resultLines.length !== 1) {
    problems.push(
      `RESULT_JSON 應該剛好 1 行，實際 ${resultLines.length} 行（測試可能中途結束）`
    );
  } else {
    let r = null;
    try {
      r = JSON.parse(resultLines[0].slice("RESULT_JSON ".length));
    } catch {
      problems.push("RESULT_JSON 無法解析");
    }
    if (r) {
      summary = `總數 ${r.total}、失敗 ${r.failed}（PASS 行 ${pass}、FAIL 行 ${fail}）`;
      if (!(r.total > 0)) problems.push("測試總數為 0");
      if (r.failed !== 0) problems.push(`測試失敗 ${r.failed} 項`);
      if (fail !== 0) problems.push(`log 中有 ${fail} 行 FAIL`);
      if (pass !== r.total)
        problems.push(`PASS 行數 ${pass} 與總數 ${r.total} 不符`);
    }
  }
}

console.log(`== ${kind} log：${logPath}`);
if (summary) console.log("測試結果：" + summary);
for (const [rule, n] of allowedCount)
  console.log(`允許的 ERROR ×${n}：${rule.why}`);
for (const p of problems.slice(0, 30)) console.log("✗ " + p);
if (problems.length > 30) console.log(`✗ ……另有 ${problems.length - 30} 項`);
console.log(
  problems.length
    ? `${kind} 檢查：失敗（${problems.length} 項）`
    : `${kind} 檢查：通過`
);
process.exit(problems.length ? 1 : 0);
