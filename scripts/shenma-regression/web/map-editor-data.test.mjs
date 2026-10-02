// 地圖編輯器的地圖資訊保存判斷（src/app/(tools)/mapEditor/utils/mapMeta.ts）與地圖資料檢查
// （src/app/(tools)/mapEditor/utils/mapIntegrity.ts）測試，不需要瀏覽器
// - 地圖資訊：沒有修改的欄位不送（後端保留原本的格子與型別）；有修改的名稱、解鎖條件照輸入的文字送出（清空送空字串）；
//   章節有修改時必須是 1 以上的整數，其他寫法回傳錯誤、不轉成別的數字；map_id 改過或沒有原值時三欄都送
// - 地圖資料檢查：和遊戲「關卡資料未完成」同一份規則；正式設定快照（fixtures/map-config-snapshot.json）是
//   6 張完整、1 張有路線缺波次、93 張路線與波次都缺；錯型別、單一波沒有可出兵的組（資料完整，但遊戲打到那一波時拒絕）
// - 波次保存（src/app/(tools)/mapEditor/utils/waveSave.ts）：沒有選敵人的組與濾完沒有組的波次不送出、不補敵人不重新編號；
//   被濾掉的組的說明；送出後設定裡應有的波次（和後端相同的去空白、轉數字、分組排序）；比對字串不受型別寫法影響
// 用法：node scripts/shenma-regression/web/map-editor-data.test.mjs
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

const EDITOR = join(SRC, "app/(tools)/mapEditor/utils");
const {
  CHAPTER_INVALID,
  mapMetaUpdate,
  metaReadbackDiff,
  metaText,
  parseChapter,
} = require(join(EDITOR, "mapMeta.ts"));
const {
  filterByIntegrity,
  integritySummary,
  integritySummaryText,
  mapIntegrity,
} = require(join(EDITOR, "mapIntegrity.ts"));
const {
  cleanWavesForSave,
  droppedGroupsText,
  expectedSavedWaves,
  normalizeWaves,
  wavesSig,
} = require(join(EDITOR, "waveSave.ts"));
const { buildStagePreview } = require(
  join(SRC, "app/(games)/shenmaSanguo/utils/stagePreview.ts")
);
const { isStageUnlocked } = require(
  join(SRC, "app/(games)/shenmaSanguo/utils/stageUtils.ts")
);
const SNAPSHOT = JSON.parse(
  readFileSync(
    join(ROOT, "scripts/shenma-regression/fixtures/map-config-snapshot.json"),
    "utf8"
  )
);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail)}`
  );
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── 章節的寫法 ──
{
  const invalid = [
    "",
    " ",
    "0",
    "-1",
    "1.5",
    "2abc",
    "abc",
    "01",
    "1e2",
    "١",
    "+2",
  ];
  const okOnes = [
    [parseChapter("1"), 1],
    [parseChapter(" 12 "), 12],
    [parseChapter("100"), 100],
  ];
  const bad = invalid.map((s) => [s, parseChapter(s)]);
  check(
    "章節：1、 12 、100 是有效的整數；空白、0、負數、小數、2abc、01、1e2、全形或其他數字字元、+2 都是無效（不轉成別的數字）",
    okOnes.every(([a, b]) => a === b) && bad.every(([, v]) => v === null),
    { okOnes, bad }
  );
  check(
    "章節：超過安全整數範圍的位數無效",
    parseChapter("99999999999999999999") === null
  );
}

// ── 沒有修改：不送，後端保留原本的格子（型別也不變） ──
const ORIG = {
  mapId: "chapter1_1",
  name: "黃巾起義",
  chapter: 1,
  unlock_stage: "chapter1_1",
};
const input = (o = {}) => ({
  name: "黃巾起義",
  chapter: "1",
  unlockStage: "chapter1_1",
  ...o,
});
{
  const r = mapMetaUpdate(ORIG, "chapter1_1", input());
  check(
    "沒有修改：三欄都不送；保存後的值是原值（章節仍是數字 1）",
    r.ok && same(r.fields, {}) && r.effective.chapter === 1,
    r
  );
  // 原值不是數字（例如試算表裡的章節是文字或空白）、使用者沒有修改：不送，不偷偷改成數字
  const odd = { ...ORIG, chapter: "", name: 7, unlock_stage: null };
  const r2 = mapMetaUpdate(
    odd,
    "chapter1_1",
    input({ chapter: "", name: "7", unlockStage: "" })
  );
  check(
    "原值是空白章節、數字名稱、沒有解鎖條件，使用者沒有修改：三欄都不送（不把空白章節補成 1、不把名稱改成文字）",
    r2.ok &&
      same(r2.fields, {}) &&
      r2.effective.chapter === "" &&
      r2.effective.name === 7,
    r2
  );
  check(
    "原值顯示的文字：沒有值是空白，不補預設值",
    metaText(undefined) === "" &&
      metaText(null) === "" &&
      metaText(1) === "1" &&
      metaText("") === ""
  );
}

// ── 有修改：三欄放在頂層送出 ──
{
  const r = mapMetaUpdate(
    ORIG,
    "chapter1_1",
    input({ name: "改過的名稱", chapter: "2", unlockStage: "chapter1_2" })
  );
  check(
    "三欄都改：送出 name（文字）、chapter（數字 2）、unlock_stage（文字）",
    r.ok &&
      same(r.fields, {
        name: "改過的名稱",
        chapter: 2,
        unlock_stage: "chapter1_2",
      }),
    r
  );
  const only = mapMetaUpdate(ORIG, "chapter1_1", input({ chapter: " 3 " }));
  check(
    "只改章節：只送 chapter（數字 3），名稱與解鎖條件不送",
    only.ok && same(only.fields, { chapter: 3 }),
    only
  );
  const cleared = mapMetaUpdate(
    ORIG,
    "chapter1_1",
    input({ name: "", unlockStage: "" })
  );
  check(
    "有意清空名稱與解鎖條件：送出空字串（不補值），章節沒有修改不送",
    cleared.ok && same(cleared.fields, { name: "", unlock_stage: "" }),
    cleared
  );
}

// ── 章節有修改但無效：回傳錯誤（呼叫端不問管理密碼、不送出） ──
{
  const bad = ["", "abc", "2abc", "0", "1.5"].map((c) => [
    c,
    mapMetaUpdate(ORIG, "chapter1_1", input({ chapter: c })),
  ]);
  check(
    "章節改成空白、abc、2abc、0、1.5：回傳錯誤（章節要填 1 以上的整數），沒有要送的欄位",
    bad.every(
      ([, r]) => !r.ok && r.field === "chapter" && r.error === CHAPTER_INVALID
    ),
    bad
  );
}

// ── 沒有原值、或 map_id 改成別的：三欄都送 ──
{
  const none = mapMetaUpdate(null, "chapter9_9", input());
  const other = mapMetaUpdate(ORIG, "chapter1_2", input());
  check(
    "沒有原值（新地圖、匯入）或 map_id 已經改成別的地圖：三欄都送（原值只屬於載入的那一張）",
    none.ok &&
      same(Object.keys(none.fields), ["name", "chapter", "unlock_stage"]) &&
      other.ok &&
      same(other.fields, {
        name: "黃巾起義",
        chapter: 1,
        unlock_stage: "chapter1_1",
      }),
    { none, other }
  );
  const noneBad = mapMetaUpdate(null, "x", input({ chapter: "" }));
  check("沒有原值時章節空白：也是錯誤（不補成 1）", !noneBad.ok, noneBad);
}

// ── 讀回比對 ──
{
  const ok = metaReadbackDiff(
    { name: "新", chapter: 2 },
    { name: "新", chapter: 2, unlock_stage: "x" }
  );
  const diff = metaReadbackDiff(
    { name: "新", chapter: 2, unlock_stage: "" },
    { name: "舊", chapter: 1, unlock_stage: "" }
  );
  check(
    "讀回比對：只比對有送出的欄位；名稱與章節讀回的是舊值時列出差異",
    ok.length === 0 &&
      same(
        diff.map((d) => d.field),
        ["name", "chapter"]
      ),
    { ok, diff }
  );
}

// ── 地圖資料檢查：正式設定快照 ──
const maps = SNAPSHOT.maps;
const enemies = SNAPSHOT.enemies;
{
  const s = integritySummary(maps);
  check(
    "正式設定快照 100 張：資料完整 6、待補資料 94（有路線缺波次 1、路線與波次都缺 93、有波次缺路線 0）",
    same(s, {
      total: 100,
      complete: 6,
      incomplete: 94,
      waves: 1,
      route: 0,
      both: 93,
    }),
    s
  );
  const complete = filterByIntegrity(maps, "complete").map((m) => m.map_id);
  check(
    "資料完整的是 chapter1_1～1_6",
    same(complete, [
      "chapter1_1",
      "chapter1_2",
      "chapter1_3",
      "chapter1_4",
      "chapter1_5",
      "chapter1_6",
    ]),
    complete
  );
  const c17 = mapIntegrity(maps.find((m) => m.map_id === "chapter1_7"));
  check(
    "chapter1_7 汜水關：缺波次（有路線），原因和遊戲的「尚未開放」相同（沒有波次資料）",
    c17.kind === "waves" && same(c17.problem.reasons, ["沒有波次資料"]),
    c17
  );
  const c18 = mapIntegrity(maps.find((m) => m.map_id === "chapter1_8"));
  check(
    "chapter1_8：路線與波次都缺（沒有可用的路線、沒有波次資料）",
    c18.kind === "both" &&
      same(c18.problem.reasons, ["沒有可用的路線", "沒有波次資料"]),
    c18
  );
  check(
    "篩選：全部 100、待補資料 94",
    filterByIntegrity(maps, "all").length === 100 &&
      filterByIntegrity(maps, "incomplete").length === 94
  );
  check(
    "摘要文字",
    integritySummaryText(s) ===
      "共 100 張：資料完整 6、待補資料 94（有路線缺波次 1、路線與波次都缺 93）",
    integritySummaryText(s)
  );
  check(
    "空清單的摘要是「設定裡沒有任何地圖」（讀取成功、真的沒有地圖時才用）",
    integritySummaryText(integritySummary([])) === "設定裡沒有任何地圖"
  );
  // 前六關每一波都至少有一組會出兵（敵軍預覽的判讀）：6 張 29 波
  const waves = maps
    .filter((m) => mapIntegrity(m).kind === "complete")
    .map((m) => buildStagePreview(m, enemies).waves);
  check(
    "前六關 29 波，每一波都有可出兵的組（敵軍預覽的判讀，沒有被拒絕的波次）",
    waves.flat().length === 29 && waves.flat().every((w) => !w.rejected),
    waves.map((w) => w.length)
  );
}

// ── 地圖資料檢查：各種資料形狀 ──
{
  const PATH = {
    paths: {
      path_a: [
        [0, 0],
        [3, 0],
      ],
    },
  };
  const W = [{ wave: 1, enemies: [{ enemy_id: "grunt_lv1", count: 2 }] }];
  const m = (path_json, waves) => ({
    map_id: "t",
    name: "t",
    chapter: 1,
    unlock_stage: "",
    path_json,
    waves,
  });
  const kinds = {
    valid: mapIntegrity(m(PATH, W)).kind,
    noRoute: mapIntegrity(m({ paths: [] }, W)).kind,
    noWaves: mapIntegrity(m(PATH, [])).kind,
    both: mapIntegrity(m({ paths: [], spawn: [], base: [] }, [])).kind,
    badJson: mapIntegrity(m("{bad", W)),
    wavesStr: mapIntegrity(m(PATH, "wave1")),
    emptyRoute: mapIntegrity(m({ paths: { path_a: [] } }, W)).kind,
  };
  check(
    "有效＝資料完整；沒有路線＝缺路線；沒有波次＝缺波次；兩者都沒有＝缺路線與波次；路線沒有路點＝缺路線",
    kinds.valid === "complete" &&
      kinds.noRoute === "route" &&
      kinds.noWaves === "waves" &&
      kinds.both === "both" &&
      kinds.emptyRoute === "route",
    kinds
  );
  check(
    "錯型別：路線是無法解析的文字、波次是文字時說明原因（和遊戲相同）",
    kinds.badJson.kind === "route" &&
      same(kinds.badJson.problem.reasons, ["路線資料的格式無法解析"]) &&
      kinds.wavesStr.kind === "waves" &&
      same(kinds.wavesStr.problem.reasons, ["波次資料的格式不對"]),
    kinds
  );
  // 單一波沒有可出兵的組：整關的資料是完整的（遊戲照樣能出征），打到那一波時才拒絕；檢查清單不把它算成缺資料
  const rejectWave = m(PATH, [
    ...W,
    { wave: 2, enemies: [{ enemy_id: "no_such_enemy", count: 3 }] },
  ]);
  const pv = buildStagePreview(rejectWave, enemies);
  check(
    "單一波沒有可出兵的組：整關仍是資料完整（不是缺資料），敵軍預覽標出第 2 波會被拒絕",
    mapIntegrity(rejectWave).kind === "complete" &&
      pv.waves[1].rejected === true &&
      pv.waves[0].rejected === false,
    pv.waves.map((w) => w.rejected)
  );
}

// ── 資料完整和玩家解鎖是兩回事 ──
{
  const c16 = maps.find((m) => m.map_id === "chapter1_6");
  const c17 = maps.find((m) => m.map_id === "chapter1_7");
  check(
    "資料完整不代表已解鎖：玩家進度 chapter1_2 時 chapter1_6 資料完整但未解鎖；chapter1_7 缺波次與解鎖無關",
    mapIntegrity(c16).kind === "complete" &&
      isStageUnlocked("chapter1_6", "chapter1_2") === false &&
      mapIntegrity(c17).kind === "waves" &&
      isStageUnlocked("chapter1_7", "chapter1_7") === true
  );
}

// ── 波次保存：送出的內容、被濾掉的組、設定裡應有的波次 ──
{
  const g = (enemy_id, count = 5) => ({
    enemy_id,
    count,
    interval: 1.5,
    path: "path_a",
  });
  const allEmpty = [{ wave: 1, enemies: [g("")] }];
  check(
    "波次保存：整波都沒有選敵人時送出 0 波，說明「波次 1（整波）」",
    same(cleanWavesForSave(allEmpty), []) &&
      droppedGroupsText(allEmpty) === "波次 1（整波）" &&
      same(expectedSavedWaves(cleanWavesForSave(allEmpty)), []),
    { clean: cleanWavesForSave(allEmpty), text: droppedGroupsText(allEmpty) }
  );
  const mixed = [
    { wave: 1, enemies: [g(""), g("grunt_lv1")] },
    { wave: 2, enemies: [g("  ")] },
    { wave: 3, enemies: [g("cavalry_lv1", 2)] },
  ];
  const clean = cleanWavesForSave(mixed);
  check(
    "波次保存：有效與空白（含只有空白字元）的組混在一起時只送有效的組，波次編號照原本的 1、3（不補敵人、不重新編號）；說明「波次 1 的 1 組、波次 2（整波）」",
    same(clean, [
      { wave: 1, enemies: [g("grunt_lv1")] },
      { wave: 3, enemies: [g("cavalry_lv1", 2)] },
    ]) && droppedGroupsText(mixed) === "波次 1 的 1 組、波次 2（整波）",
    { clean, text: droppedGroupsText(mixed) }
  );
  check(
    "波次保存：沒有濾掉任何組時說明是空字串、送出的內容不變",
    droppedGroupsText(clean) === "" && same(cleanWavesForSave(clean), clean)
  );
  // 和後端相同：enemy_id 去空白、數量與間隔轉數字、路線空白是 path_a、依波次編號分組排序
  const raw = [
    {
      wave: "2",
      enemies: [{ enemy_id: " siege_lv1 ", count: "3", interval: "2", path: "" }],
    },
    { wave: 1, enemies: [g("grunt_lv1")] },
    { wave: 2, enemies: [g("grunt_lv2")] },
  ];
  check(
    "波次保存：設定裡應有的波次和後端讀回相同（去空白、轉數字、空白路線是 path_a、同一波合併、由小到大）",
    same(expectedSavedWaves(raw), [
      { wave: 1, enemies: [g("grunt_lv1")] },
      {
        wave: 2,
        enemies: [
          { enemy_id: "siege_lv1", count: 3, interval: 2, path: "path_a" },
          g("grunt_lv2"),
        ],
      },
    ]),
    expectedSavedWaves(raw)
  );
  check(
    "波次保存：比對字串不受數字寫成文字影響，但數量不同、多一組空白就不同；讀到的不是陣列時是 0 波",
    wavesSig([{ wave: "1", enemies: [g("grunt_lv1", "5")] }]) ===
      wavesSig([{ wave: 1, enemies: [g("grunt_lv1", 5)] }]) &&
      wavesSig([{ wave: 1, enemies: [g("grunt_lv1", 7)] }]) !==
        wavesSig([{ wave: 1, enemies: [g("grunt_lv1", 5)] }]) &&
      wavesSig(mixed) !== wavesSig(expectedSavedWaves(clean)) &&
      same(normalizeWaves(undefined), []) &&
      same(normalizeWaves("x"), [])
  );
}

const failed = results.filter((r) => !r.pass);
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      pass: results.length - failed.length,
      total: results.length,
      failed: failed.map((r) => r.name),
    })
);
process.exit(failed.length ? 1 : 0);
