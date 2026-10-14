// 地圖編輯器設定寫入的錯誤說明（src/app/(tools)/mapEditor/utils/adminToken.ts 的 adminErrorText）測試，不需要瀏覽器
// - 後端設定寫入會回的錯誤代碼（管理密碼、忙碌、備份、寫入失敗、需要修復、以「=」或「'」開頭的值、設定表有公式、寫入後核對不符）
//   與敵人表缺少 movement_type 欄時拒絕飛行的設定，都要轉成中文說明，不能把英文代碼原樣顯示給管理者
// - 波次保存的地圖檢查（新版後端）：空白 map_id、設定裡沒有、重複、缺表、表頭不對都說明沒有寫入；
//   寫入後才發現地圖不見（MAP_CHANGED_DURING_SAVE）或寫入後的檢查發生錯誤（POSTWRITE_CHECK_ERROR）要說明已寫入、
//   不算成功、沒有自動還原，不能說沒有寫入
// - 有沒有寫入（adminWriteState／adminFailureText）：後端的 written 優先，written: true 時不管代碼都說明已寫入、
//   不要直接重送並附紀錄與備份；檢查錯誤（CHECK_ERROR）只有 written: false 時才說沒有寫入；
//   寫到一半、讀回不同、看不懂的代碼是不能確定，不能說成沒有改變
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
const {
  adminErrorText,
  adminFailureText,
  adminWriteInfoOf,
  adminWriteState,
  ADMIN_TOKEN_MISSING,
  NO_WRITE_INFO,
} = mod.exports;

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
  "MISSING_MAP_ID",
  "MAP_NOT_FOUND",
  "MAP_ID_DUPLICATE",
  "MAPS_SHEET_MISSING",
  "MAPS_HEADER_INVALID",
  "CHECK_ERROR",
  "MAP_CHANGED_DURING_SAVE",
  "POSTWRITE_CHECK_ERROR",
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
const MAP_REJECTS = [
  "MISSING_MAP_ID",
  "MAP_NOT_FOUND",
  "MAP_ID_DUPLICATE",
  "MAPS_SHEET_MISSING",
  "MAPS_HEADER_INVALID",
];
check(
  "錯誤說明-波次保存的地圖檢查拒絕：都說明這次沒有寫入",
  MAP_REJECTS.every((c) => /沒有寫入/.test(adminErrorText(c))),
  MAP_REJECTS.map((c) => adminErrorText(c))
);
check(
  "錯誤說明-設定裡沒有這張地圖：說明可能剛被刪除、要先新增至 Sheet；重複的 map_id 說明要刪除重複的列",
  /刪除/.test(adminErrorText("MAP_NOT_FOUND")) &&
    /新增至 Sheet/.test(adminErrorText("MAP_NOT_FOUND")) &&
    /重複/.test(adminErrorText("MAP_ID_DUPLICATE")),
  [adminErrorText("MAP_NOT_FOUND"), adminErrorText("MAP_ID_DUPLICATE")]
);
check(
  "錯誤說明-寫入後地圖不見：說明已寫入、不算保存成功、沒有自動還原、check_failed，不說沒有寫入",
  /已寫入/.test(adminErrorText("MAP_CHANGED_DURING_SAVE")) &&
    /不算保存成功/.test(adminErrorText("MAP_CHANGED_DURING_SAVE")) &&
    /沒有自動還原/.test(adminErrorText("MAP_CHANGED_DURING_SAVE")) &&
    /check_failed/.test(adminErrorText("MAP_CHANGED_DURING_SAVE")) &&
    !/沒有寫入/.test(adminErrorText("MAP_CHANGED_DURING_SAVE")),
  adminErrorText("MAP_CHANGED_DURING_SAVE")
);
check(
  "錯誤說明-寫入後的檢查發生錯誤：說明已寫入、不算保存成功、沒有自動還原、不要直接重送、check_failed，不說沒有寫入或沒有改變",
  /已寫入/.test(adminErrorText("POSTWRITE_CHECK_ERROR")) &&
    /不算保存成功/.test(adminErrorText("POSTWRITE_CHECK_ERROR")) &&
    /沒有自動還原/.test(adminErrorText("POSTWRITE_CHECK_ERROR")) &&
    /不要直接重送/.test(adminErrorText("POSTWRITE_CHECK_ERROR")) &&
    /check_failed/.test(adminErrorText("POSTWRITE_CHECK_ERROR")) &&
    !/沒有寫入|沒有改變/.test(adminErrorText("POSTWRITE_CHECK_ERROR")),
  adminErrorText("POSTWRITE_CHECK_ERROR")
);
check(
  "錯誤說明-只有代碼的檢查錯誤（CHECK_ERROR）：不能確定有沒有寫入，不說沒有寫入或沒有改變，要先唯讀核對",
  !/沒有寫入|沒有改變/.test(adminErrorText("CHECK_ERROR")) &&
    /唯讀核對/.test(adminErrorText("CHECK_ERROR")),
  adminErrorText("CHECK_ERROR")
);

// ── 有沒有寫入 ──
const info = (o) => ({ ...NO_WRITE_INFO, ...o });
const STATE_CASES = [
  ["CHECK_ERROR", info({ written: false, stage: "prewrite" }), "not_written"],
  ["CHECK_ERROR", info({ written: true, stage: "postwrite" }), "written"],
  ["CHECK_ERROR", NO_WRITE_INFO, "unknown"],
  ["POSTWRITE_CHECK_ERROR", info({ written: true }), "written"],
  ["POSTWRITE_CHECK_ERROR", NO_WRITE_INFO, "written"],
  ["MAP_CHANGED_DURING_SAVE", NO_WRITE_INFO, "written"],
  ["MAP_NOT_FOUND", NO_WRITE_INFO, "not_written"],
  ["MAP_NOT_FOUND", info({ written: false, stage: "prewrite" }), "not_written"],
  ["ADMIN_REQUIRED", NO_WRITE_INFO, "not_written"],
  ["BUSY", NO_WRITE_INFO, "not_written"],
  ["CONFIG_WRITE_FAILED", NO_WRITE_INFO, "unknown"],
  ["CONFIG_VERIFY_FAILED", NO_WRITE_INFO, "unknown"],
  ["SERVER_ERROR", NO_WRITE_INFO, "unknown"],
  ["儲存失敗", NO_WRITE_INFO, "unknown"],
];
const gotStates = STATE_CASES.map(([c, i]) => adminWriteState(c, i));
check(
  "有沒有寫入-後端的 written 優先；沒有給時只有寫入前就拒絕的代碼算沒有寫入，寫入後才會回的代碼算已寫入，其他（寫到一半、讀回不同、SERVER_ERROR、看不懂）不能確定",
  STATE_CASES.every(([, , want], k) => gotStates[k] === want),
  STATE_CASES.map(([c, i, want], k) => [c, i.written, want, gotStates[k]])
);
const parsed = adminWriteInfoOf({
  status: 500,
  error: "CHECK_ERROR",
  written: true,
  stage: "postwrite",
  journal_status: "check_failed",
  backup: "_bk_waves_config_x",
  op_id: "op-1",
});
const loose = adminWriteInfoOf({ written: "true", stage: 3, backup: "" });
check(
  '有沒有寫入-從回應取出 written／stage／journal_status／backup／op_id；型別不對（字串的 "true"、數字、空字串）當成沒有給',
  JSON.stringify(parsed) ===
    JSON.stringify({
      written: true,
      stage: "postwrite",
      journalStatus: "check_failed",
      backup: "_bk_waves_config_x",
      opId: "op-1",
    }) &&
    JSON.stringify(loose) === JSON.stringify(NO_WRITE_INFO) &&
    JSON.stringify(adminWriteInfoOf(null)) === JSON.stringify(NO_WRITE_INFO),
  { parsed, loose }
);
// 寫入後檢查拋出例外的回應（舊候選：CHECK_ERROR＋written: true）：不能說設定沒有改變
const postwrite = info({
  written: true,
  stage: "postwrite",
  journalStatus: "check_failed",
  backup: "_bk_waves_config_20261003T085548Z_01d81c",
  opId: "01d81cf0",
});
const t1 = adminFailureText("CHECK_ERROR", postwrite);
check(
  "有沒有寫入-CHECK_ERROR 但 written: true（寫入後的檢查例外）：說明已寫入、不算保存成功、沒有自動還原、不要直接重送，附紀錄狀態 check_failed、備份與 op_id；不說沒有改變、沒有寫入或請稍後再試",
  /^已寫入/.test(t1) &&
    /不算保存成功/.test(t1) &&
    /沒有自動還原/.test(t1) &&
    /不要直接重送/.test(t1) &&
    /check_failed/.test(t1) &&
    t1.includes(postwrite.backup) &&
    t1.includes("01d81cf0") &&
    !/沒有改變|沒有寫入|稍後再試/.test(t1),
  t1
);
const t2 = adminFailureText("POSTWRITE_CHECK_ERROR", postwrite);
check(
  "有沒有寫入-POSTWRITE_CHECK_ERROR：以「已寫入」開頭、附備份，不說沒有改變",
  /^已寫入/.test(t2) &&
    t2.includes(postwrite.backup) &&
    !/沒有改變|沒有寫入/.test(t2),
  t2
);
const t3 = adminFailureText(
  "CHECK_ERROR",
  info({ written: false, stage: "prewrite" })
);
const t4 = adminFailureText("CHECK_ERROR", NO_WRITE_INFO);
check(
  "有沒有寫入-CHECK_ERROR 且 written: false（寫入之前）才說這次沒有寫入；沒有 written 時不猜沒有改變",
  /沒有寫入/.test(t3) && !/沒有寫入|沒有改變/.test(t4),
  [t3, t4]
);
const t5 = adminFailureText(
  "MAP_NOT_FOUND",
  info({ written: false, stage: "precheck" })
);
const t6 = adminFailureText(
  "MAP_CHANGED_DURING_SAVE",
  info({ written: true, backup: "_bk_w" })
);
check(
  "有沒有寫入-寫入前的拒絕照原本的說明；MAP_CHANGED_DURING_SAVE 照原本的說明再附備份",
  t5 === adminErrorText("MAP_NOT_FOUND") &&
    t6.startsWith(adminErrorText("MAP_CHANGED_DURING_SAVE")) &&
    t6.includes("_bk_w"),
  [t5, t6]
);
const OLD = "設定沒有改變";
check(
  "有沒有寫入-反向：任何寫入後的狀態都沒有舊的「設定沒有改變」說明",
  [t1, t2, t4, t6, adminErrorText("CHECK_ERROR")].every(
    (t) => !t.includes(OLD)
  ),
  [t1, t2, t4]
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
