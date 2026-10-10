// 神馬三國 JS 版關卡名稱來源的測試（engine/StageDataManager.ts 的 hasConfirmedStageNames 與快取裡的 mapsSource）
// - 用真正的 StageDataManager：記憶體的 localStorage、假的 fetch（依 action 回固定內容；不連任何端點），每個情境重新載入模組
// - 名稱來源只有兩種會確認：正式 get_all_maps 的正常成功回應（status 200、沒有 error、正規化出後端的關卡），
//   或快取裡和這份 maps 一起保存、版本可辨識、對得上的來源資料
// - 不確認：HTTP 200 的空 maps（快取存成內建資料後重新載入也一樣）、遺漏／錯型 maps、全部無效、邏輯錯誤回應、
//   沒有來源資料的舊快取、版本不識別或對不上的來源資料、換掉 maps 後的前一份確認
// - 原本的載入、回退、正規化、快取欄位與 TTL 照舊（另外核）
// - 期望值是寫死的字面值（關卡名稱取自正式後端 get_all_maps：chapter1_1 黃巾起義 … chapter1_5 董卓進京）
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/sharedStageNameSource.test.mjs"
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

// ── 假環境 ──
class MemStorage {
  constructor() {
    this.m = new Map();
  }
  getItem(k) {
    return this.m.has(k) ? this.m.get(k) : null;
  }
  setItem(k, v) {
    this.m.set(k, String(v));
  }
  removeItem(k) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
}
const local = new MemStorage();
globalThis.window = { localStorage: local };
globalThis.localStorage = local;

/** 每個 action 的回應：物件＝原樣回；"network"＝丟例外（像斷線） */
let replies = {};
const calls = [];
globalThis.fetch = async (_url, init) => {
  const action = JSON.parse(init.body).action;
  calls.push(action);
  const r = replies[action];
  if (r === "network" || r === undefined)
    throw new TypeError("Failed to fetch");
  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(JSON.stringify(r)),
  };
};

const { BUILTIN_STAGES } = require(join(HERE, "../engine/builtinData.ts"));
const { describePendingStage } = require(join(HERE, "sharedSettleDisplay.ts"));
const MGR = require.resolve(join(HERE, "../engine/StageDataManager.ts"));
/** 重新載入模組（像重新整理頁面）：新的 manager，localStorage 留著 */
function freshManager() {
  delete require.cache[MGR];
  return require(MGR).StageDataManager.getInstance();
}

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail).slice(0, 900)}`
  );
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 正式後端的關卡（後端原始格式；名稱取自正式 get_all_maps）
const RAW = (map_id, name) => ({
  map_id,
  chapter: 1,
  name,
  unlock_stage: map_id,
  path_json: "{}",
  waves: [],
});
const FORMAL_MAPS = [
  RAW("chapter1_1", "黃巾起義"),
  RAW("chapter1_2", "桃園結義"),
  RAW("chapter1_3", "討伐黃巾"),
  RAW("chapter1_4", "十常侍之亂"),
  RAW("chapter1_5", "董卓進京"),
];
const FORMAL_NAMES = [
  "黃巾起義",
  "桃園結義",
  "討伐黃巾",
  "十常侍之亂",
  "董卓進京",
];
const HEROES = { status: 200, heroes: [{ hero_id: "guan_yu", name: "關羽" }] };
const ENEMIES = { status: 200, enemies: [{ enemy_id: "grunt_lv1" }] };
const names = (m) => m.getStages().map((s) => s.name);
const cache = () => JSON.parse(local.getItem("shenma_static_config"));
const P = { stageId: "chapter1_1", status: "pending" };
const label = (m) =>
  describePendingStage(P, m.getStages(), m.hasConfirmedStageNames()).text;

/** 全新的瀏覽器狀態＋回應，載入一次 */
async function load(mapsReply, opts = {}) {
  if (!opts.keepStorage) local.clear();
  replies = {
    get_all_maps: mapsReply,
    get_heroes_config: HEROES,
    get_enemies_config: ENEMIES,
  };
  calls.length = 0;
  const m = freshManager();
  const res = await m.loadAllStages();
  return { m, res };
}

// ═══ 1. 正常的正式回應：確認；快取帶著來源資料 ═══
{
  const { m, res } = await load({ status: 200, maps: FORMAL_MAPS });
  const c = cache();
  check(
    "正式 get_all_maps 的正常回應：名稱確認、清單是正式名稱、說明顯示「黃巾起義（chapter1_1）」",
    res.source === "gas" &&
      m.hasConfirmedStageNames() === true &&
      same(names(m), FORMAL_NAMES) &&
      label(m) === "待確認的結算：黃巾起義（chapter1_1）",
    {
      source: res.source,
      confirmed: m.hasConfirmedStageNames(),
      names: names(m),
    }
  );
  check(
    "快取：原本的 maps／heroesConfig／enemiesConfig 照舊，另外帶著版本 1、get_all_maps、5 關的來源資料；TTL 時間有寫",
    Array.isArray(c.maps) &&
      c.maps.length === 5 &&
      Array.isArray(c.heroesConfig) &&
      Array.isArray(c.enemiesConfig) &&
      c.mapsSource &&
      c.mapsSource.v === 1 &&
      c.mapsSource.action === "get_all_maps" &&
      /^5:[0-9a-f]+$/.test(c.mapsSource.fp) &&
      Number(local.getItem("shenma_static_ts")) > 0,
    c.mapsSource
  );
  // 新版的合法快取：重新載入後沿用（不打後端）
  calls.length = 0;
  const m2 = freshManager();
  const res2 = await m2.loadAllStages();
  check(
    "新版而且對得上的快取：重新載入後沿用確認、不打後端",
    res2.source === "cache" &&
      calls.length === 0 &&
      m2.hasConfirmedStageNames() === true &&
      label(m2) === "待確認的結算：黃巾起義（chapter1_1）",
    {
      source: res2.source,
      calls: [...calls],
      confirmed: m2.hasConfirmedStageNames(),
    }
  );
}

// ═══ 2. 舊快取、版本不識別、對不上：沿用 maps，但名稱不確認 ═══
{
  const out = [];
  for (const [label0, mapsSource, mutate] of [
    ["沒有來源資料的舊快取", undefined, null],
    ["來源資料的版本不識別（v 2）", { v: 2, action: "get_all_maps" }, null],
    [
      "來源資料對不上這份 maps（快取裡的名稱被改過）",
      "keep",
      (c) => (c.maps[0].name = "別的名稱"),
    ],
  ]) {
    await load({ status: 200, maps: FORMAL_MAPS });
    const c = cache();
    if (mapsSource === undefined) delete c.mapsSource;
    else if (mapsSource !== "keep")
      c.mapsSource = { ...c.mapsSource, ...mapsSource };
    if (mutate) mutate(c);
    local.setItem("shenma_static_config", JSON.stringify(c));
    local.setItem("shenma_static_ts", String(Date.now()));
    calls.length = 0;
    const m = freshManager();
    const res = await m.loadAllStages();
    out.push({
      label0,
      source: res.source,
      calls: calls.length,
      confirmed: m.hasConfirmedStageNames(),
      count: m.getStages().length,
      text: label(m),
    });
  }
  check(
    "沒有來源資料的舊快取、版本不識別、對不上這份 maps：照舊沿用快取（不打後端、5 關），但名稱不確認、說明只顯示 ID",
    out.every(
      (x) =>
        x.source === "cache" &&
        x.calls === 0 &&
        x.count === 5 &&
        x.confirmed === false &&
        x.text === "待確認的結算：chapter1_1（關卡名稱未確認）"
    ),
    out
  );
}

// ═══ 3. HTTP 200 的空 maps：不確認；存成內建資料的快取在重新載入後也不確認（重現的流程） ═══
{
  const { m, res } = await load({ status: 200, maps: [] });
  const c = cache();
  const first = {
    source: res.source,
    builtin: m.getStages() === BUILTIN_STAGES,
    confirmed: m.hasConfirmedStageNames(),
    mapsSource: c.mapsSource,
    cachedNames: c.maps.map((x) => x.name),
  };
  const m2 = freshManager();
  const res2 = await m2.loadAllStages();
  const second = {
    source: res2.source,
    builtinRef: m2.getStages() === BUILTIN_STAGES,
    names: names(m2),
    confirmed: m2.hasConfirmedStageNames(),
    text: label(m2),
  };
  check(
    "HTTP 200 的空 maps：照舊退回內建資料並寫快取（來源資料是 null），名稱不確認",
    first.builtin &&
      first.confirmed === false &&
      first.mapsSource === null &&
      same(first.cachedNames, [
        "第一章 第1關 - 涿郡初陣",
        "第一章 第2關 - 界橋隘口",
        "第一章 第3關 - 虎牢關血戰",
      ]),
    first
  );
  check(
    "空 maps 的快取在重新載入後：清單是內建名稱的新陣列，但名稱仍不確認，說明不猜「涿郡初陣」",
    second.builtinRef === false &&
      second.names[0] === "第一章 第1關 - 涿郡初陣" &&
      second.confirmed === false &&
      second.text === "待確認的結算：chapter1_1（關卡名稱未確認）",
    second
  );
}

// ═══ 4. 遺漏／錯型 maps、全部無效、邏輯錯誤回應：不確認 ═══
{
  const out = [];
  for (const [label0, reply, wantBuiltin] of [
    ["沒有 maps", { status: 200 }, true],
    ["maps 是字串", { status: 200, maps: "x" }, true],
    [
      "maps 全部無效（沒有 map_id）",
      { status: 200, maps: [{}, { name: "沒有 ID" }] },
      true,
    ],
    [
      "邏輯錯誤（status 500＋error，仍附 maps）",
      { status: 500, error: "SERVER_ERROR", maps: FORMAL_MAPS },
      false,
    ],
    [
      "status 200 但帶 error",
      { status: 200, error: "X", maps: FORMAL_MAPS },
      false,
    ],
  ]) {
    const { m } = await load(reply);
    out.push({
      label0,
      builtin: m.getStages() === BUILTIN_STAGES,
      wantBuiltin,
      confirmed: m.hasConfirmedStageNames(),
      mapsSource: cache().mapsSource,
      text: label(m),
    });
  }
  check(
    "沒有 maps、maps 錯型、全部無效、邏輯錯誤或帶 error 的回應：原本的載入照舊（無效的退回內建、附 maps 的照舊換上），但名稱都不確認、快取的來源資料是 null",
    out.every(
      (x) =>
        x.builtin === x.wantBuiltin &&
        x.confirmed === false &&
        x.mapsSource === null &&
        x.text === "待確認的結算：chapter1_1（關卡名稱未確認）"
    ),
    out
  );
}

// ═══ 5. 換掉 maps 不殘留前一份的確認 ═══
{
  // 先有確認的快取（過期，所以會再讀後端），這次後端回邏輯錯誤但附了另一份 maps
  await load({ status: 200, maps: FORMAL_MAPS });
  local.setItem("shenma_static_ts", "1");
  replies = {
    get_all_maps: {
      status: 500,
      error: "SERVER_ERROR",
      maps: [RAW("chapter1_1", "另一份")],
    },
    get_heroes_config: HEROES,
    get_enemies_config: ENEMIES,
  };
  calls.length = 0;
  const m = freshManager();
  const res = await m.loadAllStages();
  check(
    "已確認的快取被換成另一份 maps（邏輯錯誤的回應）：清單照舊換上，但不殘留前一份的確認、快取的來源資料是 null",
    calls.includes("get_all_maps") &&
      res.source === "gas" &&
      same(names(m), ["另一份"]) &&
      m.hasConfirmedStageNames() === false &&
      cache().mapsSource === null &&
      label(m) === "待確認的結算：chapter1_1（關卡名稱未確認）",
    {
      source: res.source,
      names: names(m),
      confirmed: m.hasConfirmedStageNames(),
    }
  );
}
{
  // 已確認的快取（過期）＋這次後端回空 maps：清單沒有換，仍是那份確認過的 maps
  await load({ status: 200, maps: FORMAL_MAPS });
  local.setItem("shenma_static_ts", "1");
  replies = {
    get_all_maps: { status: 200, maps: [] },
    get_heroes_config: HEROES,
    get_enemies_config: ENEMIES,
  };
  const m = freshManager();
  await m.loadAllStages();
  check(
    "已確認的快取＋這次後端回空 maps：清單沒有換（仍是確認過的那份），確認跟著這份清單；快取的來源資料仍對得上",
    same(names(m), FORMAL_NAMES) &&
      m.hasConfirmedStageNames() === true &&
      cache().mapsSource &&
      cache().mapsSource.v === 1,
    {
      names: names(m),
      confirmed: m.hasConfirmedStageNames(),
      src: cache().mapsSource,
    }
  );
}

// ═══ 6. 原本的回退流程照舊 ═══
{
  const { m, res } = await load("network");
  check(
    "斷線、沒有快取：照舊回內建資料（source builtin）、名稱不確認、可以再載入",
    res.source === "builtin" &&
      m.getStages() === BUILTIN_STAGES &&
      m.hasConfirmedStageNames() === false &&
      local.getItem("shenma_static_config") === null,
    { source: res.source }
  );
}
{
  await load({ status: 200, maps: FORMAL_MAPS });
  local.setItem("shenma_static_ts", "1");
  replies = {
    get_all_maps: "network",
    get_heroes_config: "network",
    get_enemies_config: "network",
  };
  const m = freshManager();
  const res = await m.loadAllStages();
  check(
    "已確認的快取過期、這次斷線：照舊沿用快取（source cache、5 關），確認跟著這份快取",
    res.source === "cache" &&
      same(names(m), FORMAL_NAMES) &&
      m.hasConfirmedStageNames() === true,
    { source: res.source, confirmed: m.hasConfirmedStageNames() }
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
