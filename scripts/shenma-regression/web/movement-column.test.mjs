// 地圖編輯器敵人表的 movement_type 欄判斷（src/app/(tools)/mapEditor/utils/movementColumn.ts）測試，不需要瀏覽器
// - 後端回報表頭（columns）時以表頭為準：有欄空表可以確定、缺欄空表也可以確定
// - 舊後端（沒有表頭資訊）：有資料列時用資料列推定；沒有資料列、資料列不一致時無法確認
// - 還沒載入、載入失敗：無法確認；無法確認不能說成「沒有這一欄」
// - 儲存前的檢查：只有確定有這一欄時才放行飛行（含前後空白的「 flying 」）；只有地面、空白、遊戲不認得的值時一律不擋
// 用法：node scripts/shenma-regression/web/movement-column.test.mjs
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { existsSync, readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const SRC = join(ROOT, "src");

require.extensions[".ts"] = (module, filename) => {
  const out = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(out.outputText, filename);
};
// 專案的路徑別名 @/ → src/
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    const base = join(SRC, request.slice(2));
    const file = [base + ".ts", base + ".tsx", base].find((f) => existsSync(f));
    if (file) return file;
  }
  return resolveFilename.call(this, request, ...rest);
};

const {
  COLUMN_LOAD_FAILED,
  COLUMN_MISSING_ON_SAVE,
  COLUMN_NOT_LOADED,
  flyingRowCount,
  flyingSaveProblem,
  missingColumnText,
  movementColumnFromLoad,
  unknownColumnText,
} = require(join(SRC, "app/(tools)/mapEditor/utils/movementColumn.ts"));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail)}`
  );
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 載入回應的判斷 ──
const row = (extra) => ({ enemy_id: "e1", name: "兵", ...extra });
const cases = [
  [
    "表頭有欄＋空表（新後端）",
    { enemies: [], columns: ["enemy_id", "name", "movement_type"] },
    { status: "present", source: "columns" },
  ],
  [
    "表頭缺欄＋空表（新後端）",
    { enemies: [], columns: ["enemy_id", "name"] },
    { status: "missing", source: "columns" },
  ],
  [
    "表頭有欄＋有資料（新後端，以表頭為準）",
    {
      enemies: [row({ movement_type: "" })],
      columns: ["enemy_id", "movement_type"],
    },
    { status: "present", source: "columns" },
  ],
  [
    "表頭缺欄＋有資料（新後端）",
    { enemies: [row({})], columns: ["enemy_id", "name"] },
    { status: "missing", source: "columns" },
  ],
  [
    "表頭名稱有前後空白不算（後端依表頭名稱完全相同寫入）",
    { enemies: [], columns: ["enemy_id", " movement_type"] },
    { status: "missing", source: "columns" },
  ],
  [
    "表頭資訊不可信時仍以表頭為準：大小寫不同不算",
    { enemies: [], columns: ["enemy_id", "Movement_Type"] },
    { status: "missing", source: "columns" },
  ],
  [
    "舊後端＋空表：無法確認",
    { enemies: [] },
    { status: "unknown", reason: "no_rows" },
  ],
  [
    "舊後端＋沒有 enemies：無法確認",
    {},
    { status: "unknown", reason: "no_rows" },
  ],
  [
    "舊後端＋每列都有欄位：推定有",
    { enemies: [row({ movement_type: "" }), row({ movement_type: "flying" })] },
    { status: "present", source: "rows" },
  ],
  [
    "舊後端＋每列都沒有欄位：推定沒有",
    { enemies: [row({}), row({})] },
    { status: "missing", source: "rows" },
  ],
  [
    "舊後端＋有的有有的沒有：無法確認",
    { enemies: [row({ movement_type: "" }), row({})] },
    { status: "unknown", reason: "rows_mixed" },
  ],
  [
    "columns 不是陣列時當作舊後端",
    { enemies: [], columns: "movement_type" },
    { status: "unknown", reason: "no_rows" },
  ],
];
for (const [name, data, want] of cases) {
  const got = movementColumnFromLoad(data);
  check(`欄位判斷-${name}`, same(got, want), { got, want });
}

// ── 儲存前的檢查 ──
const PRESENT = { status: "present", source: "columns" };
const MISSING = { status: "missing", source: "columns" };
const NO_ROWS = { status: "unknown", reason: "no_rows" };
const flying = [{ movement_type: "ground" }, { movement_type: "flying" }];
const padded = [{ movement_type: " flying\t" }];
const groundOnly = [
  { movement_type: "ground" },
  { movement_type: "" },
  { movement_type: "air" },
  { movement_type: "Flying" },
  {},
];

check(
  "飛行列數-「flying」「 flying\\t」算飛行，Flying、air、空白、沒有欄位不算",
  flyingRowCount([...flying, ...padded, ...groundOnly]) === 2,
  flyingRowCount([...flying, ...padded, ...groundOnly])
);
check(
  "儲存檢查-確定有欄：飛行放行",
  flyingSaveProblem(PRESENT, flying) === null
);
check(
  "儲存檢查-舊後端資料列推定有欄：飛行放行",
  flyingSaveProblem({ status: "present", source: "rows" }, flying) === null
);
for (const [label, state] of [
  ["確定缺欄", MISSING],
  ["儲存時後端回報缺欄", COLUMN_MISSING_ON_SAVE],
  ["還沒載入", COLUMN_NOT_LOADED],
  ["載入失敗", COLUMN_LOAD_FAILED],
  ["舊後端空表", NO_ROWS],
  ["資料列不一致", { status: "unknown", reason: "rows_mixed" }],
]) {
  const p1 = flyingSaveProblem(state, flying);
  const p2 = flyingSaveProblem(state, padded);
  check(
    `儲存檢查-${label}：飛行（含前後空白）擋下並說明`,
    typeof p1 === "string" &&
      /1 列設定為飛行/.test(p1) &&
      typeof p2 === "string",
    { p1, p2 }
  );
  check(
    `儲存檢查-${label}：只有地面、空白、遊戲不認得的值時不擋`,
    flyingSaveProblem(state, groundOnly) === null &&
      flyingSaveProblem(state, []) === null
  );
}

// ── 說明文字：無法確認不能說成沒有這一欄；確定沒有時說明處理方式 ──
// 斷定「沒有 movement_type 欄」（「有沒有 movement_type 欄」是疑問，不算）
const SAYS_MISSING = /(?<!有)沒有 movement_type 欄/;
for (const [label, state, re] of [
  ["還沒載入", COLUMN_NOT_LOADED, /從 Sheet 載入/],
  ["載入失敗", COLUMN_LOAD_FAILED, /重新載入/],
  ["舊後端空表", NO_ROWS, /先把移動方式設為地面儲存/],
  ["資料列不一致", { status: "unknown", reason: "rows_mixed" }, /重新載入/],
]) {
  const t = unknownColumnText(state);
  const p = flyingSaveProblem(state, flying);
  check(
    `說明-${label}：寫「尚無法確認」與可採取的操作，不說成沒有這一欄`,
    /尚無法確認/.test(t) &&
      re.test(t) &&
      !SAYS_MISSING.test(t) &&
      /尚無法確認/.test(p) &&
      !SAYS_MISSING.test(p) &&
      missingColumnText(state) === null,
    { t, p }
  );
}
check(
  "說明-確定缺欄：說明加欄、重新載入或改回地面；不是「尚無法確認」",
  /沒有 movement_type 欄/.test(missingColumnText(MISSING)) &&
    /重新載入/.test(missingColumnText(MISSING)) &&
    /沒有 movement_type 欄/.test(flyingSaveProblem(MISSING, flying)) &&
    /改回地面/.test(flyingSaveProblem(MISSING, flying)) &&
    unknownColumnText(MISSING) === null,
  { m: missingColumnText(MISSING), p: flyingSaveProblem(MISSING, flying) }
);
check(
  "說明-儲存時後端回報缺欄：說明這次沒有寫入、可能在載入後被移除",
  /沒有寫入/.test(missingColumnText(COLUMN_MISSING_ON_SAVE)) &&
    /載入後被移除/.test(missingColumnText(COLUMN_MISSING_ON_SAVE)),
  missingColumnText(COLUMN_MISSING_ON_SAVE)
);
check(
  "說明-確定有欄：沒有任何警告",
  missingColumnText(PRESENT) === null && unknownColumnText(PRESENT) === null
);

const failed = results.filter((r) => !r.pass).length;
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      total: results.length,
      failed,
      module: "movementColumn.ts",
    })
);
process.exit(failed ? 1 : 0);
