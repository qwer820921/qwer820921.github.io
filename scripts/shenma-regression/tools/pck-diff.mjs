// 診斷用：列出兩個 pck 內容的差異（依路徑比對每個檔案的內容）
// 用法：node pck-diff.mjs <a.pck> <b.pck>
// 只產生報表，結束碼不代表驗收結果；驗收請用 verify-export.mjs
import { createHash } from "node:crypto";
import { parsePck } from "./pck.mjs";

const md5 = (buf) => createHash("md5").update(buf).digest("hex");
const [a, c] = [parsePck(process.argv[2]), parsePck(process.argv[3])];
console.log("A:", { fmt: a.fmt, ver: a.ver, flags: a.flags, count: a.count });
console.log("B:", { fmt: c.fmt, ver: c.ver, flags: c.flags, count: c.count });
const names = [...new Set([...a.files.keys(), ...c.files.keys()])].sort();
let same = 0;
for (const n of names) {
  const x = a.files.get(n);
  const y = c.files.get(n);
  if (!x || !y) {
    console.log(`${x ? "只在 A" : "只在 B"}: ${n}`);
    continue;
  }
  if (md5(x.data) === md5(y.data)) {
    same++;
    continue;
  }
  let firstDiff = -1;
  for (let i = 0; i < Math.min(x.data.length, y.data.length); i++) {
    if (x.data[i] !== y.data[i]) {
      firstDiff = i;
      break;
    }
  }
  console.log(
    `DIFF ${n} sizeA=${x.size} sizeB=${y.size} firstDiffByte=${firstDiff}`
  );
  if (process.env.SHOW && n.endsWith(process.env.SHOW)) {
    const from = Math.max(0, firstDiff - 40);
    console.log(
      "A>",
      JSON.stringify(x.data.toString("latin1", from, firstDiff + 80))
    );
    console.log(
      "B>",
      JSON.stringify(y.data.toString("latin1", from, firstDiff + 80))
    );
  }
}
console.log(`相同 ${same} / 共 ${names.length}`);
