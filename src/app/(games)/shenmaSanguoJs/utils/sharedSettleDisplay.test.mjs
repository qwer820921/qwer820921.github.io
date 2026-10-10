// 神馬三國 JS 版共用帳號待確認結算的關卡說明（utils/sharedSettleDisplay.ts；純函式、不連網、不碰儲存空間）
// - 期望值是寫死的字面值：關卡 ID 與名稱取自正式後端 get_all_maps 的投影（chapter1_1 黃巾起義、chapter1_2 桃園結義、
//   chapter1_3 討伐黃巾、chapter1_5 董卓進京、chapter2_1 磐河之戰），不由被測函式產生
// - 只用暫存裡的關卡 ID；設定未就緒、未知 ID、重複 ID、空名稱或用 ID 補的名稱都只顯示 ID 並說名稱未確認，
//   不拿內建的代用資料猜名稱；暫存讀不到時不說是哪一關；沒有待確認時沒有說明
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/sharedSettleDisplay.test.mjs"
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const HERE = dirname(fileURLToPath(import.meta.url));

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

const { describePendingStage } = require(join(HERE, "sharedSettleDisplay.ts"));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail).slice(0, 900)}`
  );
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 正式後端的關卡（get_all_maps 投影的一部分）
const FORMAL = [
  { map_id: "chapter1_1", name: "黃巾起義" },
  { map_id: "chapter1_2", name: "桃園結義" },
  { map_id: "chapter1_3", name: "討伐黃巾" },
  { map_id: "chapter1_4", name: "十常侍之亂" },
  { map_id: "chapter1_5", name: "董卓進京" },
  { map_id: "chapter2_1", name: "磐河之戰" },
];
// 內建的代用資料（engine/builtinData.ts）：名稱和正式的不同
const BUILTIN = [
  { map_id: "chapter1_1", name: "第一章 第1關 - 涿郡初陣" },
  { map_id: "chapter1_2", name: "第一章 第2關 - 界橋隘口" },
  { map_id: "chapter1_3", name: "第一章 第3關 - 虎牢關血戰" },
];
const P = (stageId, status = "pending") => ({ stageId, status });

// ═══ 正式三關：設定就緒時顯示正式名稱與 ID ═══
check(
  "待確認：chapter1_3 顯示正式名稱「討伐黃巾」與 ID",
  same(describePendingStage(P("chapter1_3"), FORMAL, true), {
    stageId: "chapter1_3",
    name: "討伐黃巾",
    text: "待確認的結算：討伐黃巾（chapter1_3）",
  }),
  describePendingStage(P("chapter1_3"), FORMAL, true)
);
check(
  "要人工確認：chapter1_5 顯示正式名稱「董卓進京」與 ID",
  same(describePendingStage(P("chapter1_5", "review"), FORMAL, true), {
    stageId: "chapter1_5",
    name: "董卓進京",
    text: "要人工確認的結算：董卓進京（chapter1_5）",
  }),
  describePendingStage(P("chapter1_5", "review"), FORMAL, true)
);
check(
  "另一章：chapter2_1 顯示正式名稱「磐河之戰」與 ID",
  same(describePendingStage(P("chapter2_1"), FORMAL, true), {
    stageId: "chapter2_1",
    name: "磐河之戰",
    text: "待確認的結算：磐河之戰（chapter2_1）",
  }),
  describePendingStage(P("chapter2_1"), FORMAL, true)
);

// ═══ 名稱未確認：只顯示 ID，不猜名稱 ═══
check(
  "設定未就緒（清單是正式的也一樣）：只顯示 ID、名稱未確認",
  same(describePendingStage(P("chapter1_3"), FORMAL, false), {
    stageId: "chapter1_3",
    name: null,
    text: "待確認的結算：chapter1_3（關卡名稱未確認）",
  }),
  describePendingStage(P("chapter1_3"), FORMAL, false)
);
{
  const r = describePendingStage(P("chapter1_3"), BUILTIN, false);
  check(
    "設定未就緒、清單是內建的代用資料：不拿內建名稱（虎牢關血戰）猜",
    same(r, {
      stageId: "chapter1_3",
      name: null,
      text: "待確認的結算：chapter1_3（關卡名稱未確認）",
    }) && !r.text.includes("虎牢關"),
    r
  );
}
check(
  "未知的關卡 ID：只顯示 ID、名稱未確認",
  same(describePendingStage(P("chapter9_99"), FORMAL, true), {
    stageId: "chapter9_99",
    name: null,
    text: "待確認的結算：chapter9_99（關卡名稱未確認）",
  }),
  describePendingStage(P("chapter9_99"), FORMAL, true)
);
check(
  "同一個 ID 對到兩關（名稱不同）：不選其中一個，只顯示 ID",
  same(
    describePendingStage(
      P("chapter1_3", "review"),
      [...FORMAL, { map_id: "chapter1_3", name: "另一個名稱" }],
      true
    ),
    {
      stageId: "chapter1_3",
      name: null,
      text: "要人工確認的結算：chapter1_3（關卡名稱未確認）",
    }
  )
);
{
  const out = [
    ["空字串", ""],
    ["只有空白", "   "],
    ["讀取時用 ID 補的名稱", "chapter1_3"],
  ].map(([label, name]) => ({
    label,
    r: describePendingStage(
      P("chapter1_3"),
      [{ map_id: "chapter1_3", name }],
      true
    ),
  }));
  check(
    "名稱是空字串、只有空白或等於 ID：只顯示 ID、名稱未確認",
    out.every((x) =>
      same(x.r, {
        stageId: "chapter1_3",
        name: null,
        text: "待確認的結算：chapter1_3（關卡名稱未確認）",
      })
    ),
    out
  );
}

// ═══ 暫存讀不到、無法辨識、沒有待確認 ═══
check(
  "暫存讀不到（關卡 ID 是空的）：只說讀不到、無法確認是哪一關（就算設定就緒也不說關卡）",
  same(describePendingStage(P("", "unavailable"), FORMAL, true), {
    stageId: "",
    name: null,
    text: "這個分頁的暫存讀不到，無法確認是哪一關。",
  }),
  describePendingStage(P("", "unavailable"), FORMAL, true)
);
check(
  "要人工確認但暫存無法辨識（關卡 ID 是空的）：說無法辨識是哪一關",
  same(describePendingStage(P("", "review"), FORMAL, true), {
    stageId: "",
    name: null,
    text: "要人工確認的結算：無法辨識是哪一關。",
  }),
  describePendingStage(P("", "review"), FORMAL, true)
);
check(
  "沒有待確認：沒有說明",
  describePendingStage(null, FORMAL, true) === null
);

// ═══ 文字的資料邊界：原樣當文字（畫面用 React 文字輸出，不在這裡轉 HTML）；去掉前後空白 ═══
check(
  "名稱含 <、&、引號：原樣放進文字，不轉成 HTML",
  same(
    describePendingStage(
      P("chapter1_3"),
      [{ map_id: "chapter1_3", name: '<b>甲</b> & "乙"' }],
      true
    ),
    {
      stageId: "chapter1_3",
      name: '<b>甲</b> & "乙"',
      text: '待確認的結算：<b>甲</b> & "乙"（chapter1_3）',
    }
  )
);
check(
  "名稱與關卡 ID 前後的空白去掉後再比對與顯示",
  same(
    describePendingStage(
      P("  chapter1_3 "),
      [{ map_id: "chapter1_3", name: "  討伐黃巾  " }],
      true
    ),
    {
      stageId: "chapter1_3",
      name: "討伐黃巾",
      text: "待確認的結算：討伐黃巾（chapter1_3）",
    }
  )
);
{
  // 清單裡的空項目略過；凍結的輸入不會被改（也不會丟例外）
  const stages = Object.freeze([
    null,
    Object.freeze({ map_id: "chapter1_3", name: "討伐黃巾" }),
  ]);
  const pending = Object.freeze(P("chapter1_3"));
  let r = null;
  let threw = false;
  try {
    r = describePendingStage(pending, stages, true);
  } catch {
    threw = true;
  }
  check(
    "清單有空項目、輸入是凍結的：略過空項目、不改輸入",
    !threw &&
      same(r, {
        stageId: "chapter1_3",
        name: "討伐黃巾",
        text: "待確認的結算：討伐黃巾（chapter1_3）",
      }),
    { threw, r }
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
