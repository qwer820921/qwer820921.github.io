// 神馬三國離線備份檔（utils/backupFile.ts）的讀取與驗證測試，不需要瀏覽器
// - 用專案內的 TypeScript 即時轉譯 backupFile.ts 與 saveConflict.ts（buildExport、compareSaves）
// - 涵蓋：目前的匯出格式（版本 1）與沒有格式標記的舊匯出、未知格式與較新版本、壞掉的 JSON、過大的檔案、
//   欄位型別與範圍、巢狀層數與禁止的鍵名、存檔金鑰不會出現在結果裡
// 用法：node scripts/shenma-regression/web/backup-file.test.mjs
// 反向驗證：BACKUP_FILE_SRC 指向改壞的 backupFile.ts 時應該要有測試失敗
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const UTILS = join(ROOT, "src/app/(games)/shenmaSanguo/utils");
const REAL = join(UTILS, "backupFile.ts");
const SRC = process.env.BACKUP_FILE_SRC
  ? resolve(process.env.BACKUP_FILE_SRC)
  : REAL;

require.extensions[".ts"] = (module, filename) => {
  // 反向驗證時，backupFile.ts 換成指定的檔案內容（其他模組照常）
  const source =
    filename === REAL
      ? readFileSync(SRC, "utf8")
      : readFileSync(filename, "utf8");
  const out = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(out.outputText, filename);
};

const {
  parseBackupFile,
  MAX_BACKUP_FILE_BYTES,
  BACKUP_FILE_FORMAT,
  backupFileErrorText,
} = require(REAL);
const { buildExport, compareSaves } = require(join(UTILS, "saveConflict.ts"));

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok: !!ok });
  console.log(
    (ok ? "PASS  " : "FAIL  ") +
      name +
      (ok || detail === undefined
        ? ""
        : "  " + JSON.stringify(detail).slice(0, 600))
  );
};
const block = (name, fn) => {
  try {
    fn();
  } catch (e) {
    check(
      `${name}（執行時拋出例外）`,
      false,
      String((e && e.stack) || e)
        .split(/\r?\n/)
        .slice(0, 2)
        .join(" | ")
    );
  }
};

const player = (over = {}) => ({
  nickname: "測試玩家",
  level: 3,
  exp: 40,
  gold: 900,
  capacity: 11,
  max_stage: "chapter1_4",
  heroes: [
    { hero_id: "guan_yu", level: 2, star: 0, atk: 160, def: 128, hp: 1600 },
  ],
  team: [{ hero_id: "guan_yu", slot: 1 }],
  ...over,
});
const exportOf = (over = {}) =>
  buildExport({
    reason: "conflict",
    local: player(),
    localBaseRev: 5,
    cloud: player({ gold: 700, team: [] }),
    cloudRev: 6,
    ...over,
  });
const parse = (obj) =>
  parseBackupFile(typeof obj === "string" ? obj : JSON.stringify(obj));
const errOf = (obj) => {
  const r = parse(obj);
  return r.ok ? "OK" : r.error;
};
const names = { hero: (id) => id, stage: (id) => id };

block("備份檔-1", () => {
  const exp = exportOf();
  const r = parse(exp);
  check(
    "備份檔-1 目前的匯出（有格式標記、版本 1）可以讀回：匯出時間、原因、兩份資料與版本都相同",
    exp.format === BACKUP_FILE_FORMAT &&
      exp.version === 1 &&
      r.ok &&
      r.backup.version === 1 &&
      r.backup.exportedAt === exp.exported_at &&
      r.backup.reason === "conflict" &&
      r.backup.local.gold === 900 &&
      r.backup.cloud.gold === 700 &&
      r.backup.localBaseRev === 5 &&
      r.backup.cloudRev === 6 &&
      r.backup.local.team.length === 1,
    r
  );
  const cmp = compareSaves(r.backup.local, r.backup.cloud, names);
  check(
    "備份檔-2 讀回的資料可以直接用既有的比較：點數與隊伍標示不同、暱稱相同",
    cmp.summary.find((x) => x.id === "gold").differs &&
      cmp.summary.find((x) => x.id === "team").differs &&
      !cmp.summary.find((x) => x.id === "nickname").differs,
    cmp.summary
  );
});

block("備份檔-3", () => {
  const legacy = exportOf();
  delete legacy.format;
  delete legacy.version;
  const r = parse(legacy);
  const nullCloud = parse(exportOf({ cloud: null, localBaseRev: null }));
  check(
    "備份檔-3 加入格式標記前的舊匯出（沒有 format／version）仍可預覽，標成版本 0；雲端無法讀取（null）與版本不明（null）也可以",
    r.ok &&
      r.backup.version === 0 &&
      r.backup.local.gold === 900 &&
      nullCloud.ok &&
      nullCloud.backup.cloud === null &&
      nullCloud.backup.localBaseRev === null,
    { r, nullCloud }
  );
});

block("備份檔-4", () => {
  const e = exportOf();
  const codes = {
    otherFormat: errOf({ ...e, format: "other-game-save" }),
    newer: errOf({ ...e, version: 2 }),
    versionText: errOf({ ...e, version: "1" }),
    versionZero: errOf({ ...e, version: 0 }),
    versionFraction: errOf({ ...e, version: 1.5 }),
    formatOnly: errOf({ ...e, version: undefined }),
    unrelated: errOf({ hello: "world" }),
    array: errOf([e]),
    text: errOf('"just a string"'),
    broken: errOf('{"format": "shenma-save-backup", '),
    empty: errOf("   "),
  };
  check(
    "備份檔-4 未知格式、較新的版本（2）、版本不是正整數、不是物件、壞掉的 JSON、空檔案都拒絕，錯誤代碼各自不同",
    codes.otherFormat === "UNKNOWN_FORMAT" &&
      codes.newer === "UNSUPPORTED_VERSION" &&
      codes.versionText === "INVALID_FIELD" &&
      codes.versionZero === "INVALID_FIELD" &&
      codes.versionFraction === "INVALID_FIELD" &&
      codes.formatOnly === "INVALID_FIELD" &&
      codes.unrelated === "UNKNOWN_FORMAT" &&
      codes.array === "NOT_OBJECT" &&
      codes.text === "NOT_OBJECT" &&
      codes.broken === "INVALID_JSON" &&
      codes.empty === "EMPTY_FILE",
    codes
  );
});

block("備份檔-5", () => {
  const e = exportOf();
  const big = JSON.stringify({ ...e, note: "x".repeat(MAX_BACKUP_FILE_BYTES) });
  check(
    "備份檔-5 超過大小上限（512 KB）的內容直接拒絕，不解析",
    errOf(big) === "FILE_TOO_LARGE",
    big.length
  );
});

block("備份檔-6", () => {
  const e = exportOf();
  const withLocal = (over) => ({ ...e, this_tab: { ...e.this_tab, ...over } });
  const cases = {
    negativeGold: withLocal({ gold: -1 }),
    textGold: withLocal({ gold: "900" }),
    infiniteGold: JSON.stringify(e).replace('"gold":900', '"gold":1e999'),
    heroesNotArray: withLocal({ heroes: "guan_yu" }),
    tooManyHeroes: withLocal({
      heroes: Array.from({ length: 301 }, (_, i) => ({
        hero_id: "h" + i,
        level: 1,
      })),
    }),
    emptyHeroId: withLocal({ heroes: [{ hero_id: "", level: 1 }] }),
    negativeHeroHp: withLocal({ heroes: [{ hero_id: "a", level: 1, hp: -5 }] }),
    fractionSlot: withLocal({ team: [{ hero_id: "a", slot: 1.5 }] }),
    longNickname: withLocal({ nickname: "名".repeat(201) }),
    missingStage: withLocal({ max_stage: undefined }),
    badDate: { ...e, exported_at: "not-a-date" },
    negativeBaseRev: { ...e, this_tab_base_rev: -1 },
    fractionCloudRev: { ...e, cloud_rev: 1.5 },
    cloudText: { ...e, cloud: "雲端" },
  };
  const got = Object.fromEntries(
    Object.entries(cases).map(([k, v]) => [k, parse(v)])
  );
  const bad = Object.entries(got).filter(
    ([, r]) => r.ok || r.error !== "INVALID_FIELD"
  );
  check(
    "備份檔-6 欄位型別與範圍：負數、文字數字、無限大、陣列不是陣列、武將超過上限、空的武將 id、小數的隊伍位置、過長暱稱、缺欄位、日期、負的或小數的版本、雲端不是物件都拒絕（INVALID_FIELD，指出欄位）",
    bad.length === 0 &&
      got.negativeGold.field === "this_tab.gold" &&
      got.fractionSlot.field === "this_tab.team[0].slot" &&
      got.badDate.field === "exported_at",
    {
      bad: bad.map(([k, r]) => [k, r]),
      fields: Object.fromEntries(
        Object.entries(got).map(([k, r]) => [k, r.field])
      ),
    }
  );
});

block("備份檔-7", () => {
  const e = exportOf();
  const proto = JSON.stringify(e).replace(
    '"this_tab":{',
    '"this_tab":{"__proto__":{"polluted":true},'
  );
  const ctor = {
    ...e,
    cloud: { ...e.cloud, extra: { constructor: { prototype: 1 } } },
  };
  let deep = { v: 1 };
  for (let i = 0; i < 15; i++) deep = { d: deep };
  const tooDeep = { ...e, this_tab: { ...e.this_tab, extra: deep } };
  const wide = {
    ...e,
    this_tab: { ...e.this_tab, extra: Array.from({ length: 25000 }, () => 0) },
  };
  const codes = {
    proto: errOf(proto),
    ctor: errOf(ctor),
    tooDeep: errOf(tooDeep),
    wide: errOf(wide),
  };
  check(
    "備份檔-7 禁止的鍵名（__proto__、constructor、prototype）拒絕，也沒有污染物件原型；巢狀太深或值太多拒絕（TOO_COMPLEX）",
    codes.proto === "INVALID_FIELD" &&
      codes.ctor === "INVALID_FIELD" &&
      codes.tooDeep === "TOO_COMPLEX" &&
      codes.wide === "TOO_COMPLEX" &&
      {}.polluted === undefined,
    codes
  );
});

block("備份檔-8", () => {
  const e = exportOf();
  const r = parse({
    ...e,
    this_tab: { ...e.this_tab, key: "test_secret_key", mystery: { a: 1 } },
    cloud: { ...e.cloud, key: "test_secret_key" },
  });
  const html = parse({
    ...e,
    this_tab: { ...e.this_tab, nickname: '<img src=x onerror="alert(1)">' },
  });
  check(
    "備份檔-8 檔案裡如果有存檔金鑰（key）會被拿掉，其他不認得的欄位保留（只標示是否不同）；HTML 字串原樣當成文字，不做任何轉譯",
    r.ok &&
      !("key" in r.backup.local) &&
      !("key" in r.backup.cloud) &&
      !JSON.stringify(r.backup).includes("test_secret_key") &&
      r.backup.local.mystery.a === 1 &&
      html.ok &&
      html.backup.local.nickname === '<img src=x onerror="alert(1)">',
    r
  );
});

block("備份檔-9", () => {
  const texts = [
    "EMPTY_FILE",
    "FILE_TOO_LARGE",
    "READ_FAILED",
    "INVALID_JSON",
    "NOT_OBJECT",
    "UNKNOWN_FORMAT",
    "UNSUPPORTED_VERSION",
    "TOO_COMPLEX",
    "INVALID_FIELD",
  ].map((c) =>
    backupFileErrorText(c, c === "INVALID_FIELD" ? "this_tab.gold" : undefined)
  );
  check(
    "備份檔-9 每個錯誤代碼都有說明文字（欄位錯誤會指出欄位）",
    texts.every((t) => typeof t === "string" && t.length > 4) &&
      texts[8].includes("this_tab.gold"),
    texts
  );
});

const failed = results.filter((r) => !r.ok).length;
console.log(
  "RESULT_JSON " +
    JSON.stringify({
      total: results.length,
      failed,
      module: SRC === REAL ? "backupFile.ts" : SRC,
    })
);
process.exit(failed ? 1 : 0);
