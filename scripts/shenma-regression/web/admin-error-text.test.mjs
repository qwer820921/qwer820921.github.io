// 地圖編輯器設定寫入的錯誤說明（src/app/(tools)/mapEditor/utils/adminToken.ts 的 adminErrorText）測試，不需要瀏覽器
// - 後端設定寫入會回的錯誤代碼（管理密碼、忙碌、備份、寫入失敗、需要修復、以「=」或「'」開頭的值、設定表有公式、寫入後核對不符）
//   與敵人表缺少 movement_type 欄時拒絕飛行的設定，都要轉成中文說明，不能把英文代碼原樣顯示給管理者
// - 沒有對應說明的代碼照原樣回傳（不吞掉資訊）
// 用法：node scripts/shenma-regression/web/admin-error-text.test.mjs
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = process.env.ADMIN_TOKEN_SRC
  ? resolve(process.env.ADMIN_TOKEN_SRC)
  : join(ROOT, "src/app/(tools)/mapEditor/utils/adminToken.ts");

const out = ts.transpileModule(readFileSync(SRC, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
  fileName: SRC,
});
const mod = { exports: {} };
new Function("module", "exports", "require", out.outputText)(
  mod,
  mod.exports,
  require
);
const { adminErrorText, ADMIN_TOKEN_MISSING } = mod.exports;

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail)}`
  );
};
const CJK = /[一-鿿]/;

// 後端設定寫入會回、而且需要管理者處理的代碼
const CODES = [
  ADMIN_TOKEN_MISSING,
  "ADMIN_REQUIRED",
  "BUSY",
  "BACKUP_FAILED",
  "CONFIG_WRITE_FAILED",
  "BACKUP_LIMIT",
  "CONFIG_NEEDS_REPAIR",
  "UNSUPPORTED_TEXT",
  "CONFIG_HAS_FORMULAS",
  "CONFIG_VERIFY_FAILED",
  "MOVEMENT_COLUMN_MISSING",
];
for (const code of CODES) {
  const text = adminErrorText(code);
  check(
    `錯誤說明-${code} 轉成中文說明（不是原樣的代碼）`,
    typeof text === "string" &&
      text !== code &&
      CJK.test(text) &&
      !text.includes(code),
    text
  );
}
check(
  "錯誤說明-「=」「'」開頭的值：說明兩種開頭與沒有寫入",
  /=/.test(adminErrorText("UNSUPPORTED_TEXT")) &&
    /'/.test(adminErrorText("UNSUPPORTED_TEXT")) &&
    /沒有寫入/.test(adminErrorText("UNSUPPORTED_TEXT")),
  adminErrorText("UNSUPPORTED_TEXT")
);
check(
  "錯誤說明-設定表有公式：說明沒有寫入、要把公式改成值",
  /公式/.test(adminErrorText("CONFIG_HAS_FORMULAS")) &&
    /沒有寫入/.test(adminErrorText("CONFIG_HAS_FORMULAS")),
  adminErrorText("CONFIG_HAS_FORMULAS")
);
check(
  "錯誤說明-寫入後核對不符：說明已備份、再儲存會先恢復",
  /備份/.test(adminErrorText("CONFIG_VERIFY_FAILED")) &&
    /恢復/.test(adminErrorText("CONFIG_VERIFY_FAILED")),
  adminErrorText("CONFIG_VERIFY_FAILED")
);
check(
  "錯誤說明-敵人表缺少移動方式欄：說明欄名、沒有寫入、加欄後重新載入或改回地面",
  /movement_type/.test(adminErrorText("MOVEMENT_COLUMN_MISSING")) &&
    /沒有寫入/.test(adminErrorText("MOVEMENT_COLUMN_MISSING")) &&
    /重新載入/.test(adminErrorText("MOVEMENT_COLUMN_MISSING")) &&
    /地面/.test(adminErrorText("MOVEMENT_COLUMN_MISSING")),
  adminErrorText("MOVEMENT_COLUMN_MISSING")
);
check(
  "錯誤說明-沒有對應說明的代碼照原樣回傳",
  adminErrorText("MAP_ID_EXISTS") === "MAP_ID_EXISTS",
  adminErrorText("MAP_ID_EXISTS")
);

const failed = results.filter((r) => !r.pass).length;
console.log(
  "RESULT_JSON " +
    JSON.stringify({ total: results.length, failed, module: "adminToken.ts" })
);
process.exit(failed ? 1 : 0);
