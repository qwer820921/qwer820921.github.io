// 神馬三國 JS 版共用存檔規則的單元測試（utils/sharedProfile.ts、utils/sharedProfileSync.ts；純函式、不連網）
// - 武將 ID 對照：只有後端設定的 g 和 JS 版內建的 "hero_" + g 兩邊各一次才配對，不對任意字串加減前綴
// - 顯示投影：後端新建立的存檔 heroes 是空陣列、team 是空陣列（v2.9 createProfile）時不崩潰；0 照樣是 0；升級過的武將用存檔的數值；
//   對照不到或重複的武將原樣保留並標記；隊伍不能完整表示時整份不可編輯、不換成預設隊伍；team 可以沒有；欄位壞掉時唯讀
// - 修改：暱稱與隊伍只改這兩個欄位，其他（含不認得的欄位與武將）原樣保留；隊伍換成後端格式並用後端設定的 cost 與存檔的 capacity 檢查；
//   修改的結果不會出現 JS 版的預設值（gold 1500、capacity 65、key、updatedAt、serverRev）
// - 同步：寫入錯誤分成衝突／明確拒絕／結果不明；結算請求固定 request_id、base_rev 與內容，回應的 base_mismatch／duplicate／缺契約與錯誤的分類
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/sharedProfile.test.mjs"
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

const sp = require(join(HERE, "sharedProfile.ts"));
const sync = require(join(HERE, "sharedProfileSync.ts"));
const { GasError } = require(join(HERE, "../../shenmaSanguo/api/gameApi.ts"));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail).slice(0, 900)}`
  );
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (o) => JSON.parse(JSON.stringify(o));
const deepFreeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
};

// 後端武將設定（虛構的數值；hero_id 照後端的格式）：gan_ning 只在後端、lu_bu 兩邊都沒有
const CONFIG = deepFreeze([
  {
    hero_id: "guan_yu",
    cost: 5,
    base_atk: 140,
    base_def: 70,
    base_hp: 1450,
    upgrade_cost_base: 120,
    atk_growth: 14,
    def_growth: 7,
    hp_growth: 145,
  },
  {
    hero_id: "zhao_yun",
    cost: 4,
    base_atk: 120,
    base_def: 60,
    base_hp: 1300,
    upgrade_cost_base: "",
    atk_growth: 12,
    def_growth: 6,
    hp_growth: 130,
  },
  {
    hero_id: "zhang_fei",
    cost: 5,
    base_atk: 0,
    base_def: 80,
    base_hp: 1500,
    upgrade_cost_base: 100,
    atk_growth: 0,
    def_growth: 8,
    hp_growth: 150,
  },
  {
    hero_id: "gan_ning",
    cost: 7,
    base_atk: 122,
    base_def: 107,
    base_hp: 1235,
    upgrade_cost_base: 100,
    atk_growth: 12.2,
    def_growth: 10.7,
    hp_growth: 123.5,
  },
]);
const CANVAS_IDS = [
  "hero_guan_yu",
  "hero_zhao_yun",
  "hero_zhang_fei",
  "hero_ma_chao",
];
const MAP = sp.buildHeroIdMap(
  CONFIG.map((c) => c.hero_id),
  CANVAS_IDS
);
// v2.9 createProfile 的新存檔
const NEW_PROFILE = () => ({
  nickname: "新主公",
  level: 1,
  exp: 0,
  gold: 500,
  capacity: 11,
  max_stage: "chapter1_1",
  heroes: [],
  team: [],
});

// ── 對照表 ──
{
  const m = sp.buildHeroIdMap(
    ["guan_yu", "zhao_yun", "zhao_yun", "gan_ning", "hero_cao_cao", "ma_chao"],
    [
      "hero_guan_yu",
      "hero_zhao_yun",
      "hero_cao_cao",
      "hero_hero_cao_cao",
      "hero_ma_chao",
      "hero_ma_chao",
    ]
  );
  check(
    "ID 對照：guan_yu ↔ hero_guan_yu 配對；後端重複（zhao_yun）、JS 版重複（hero_ma_chao）、只在一邊（gan_ning）、已有前綴（hero_cao_cao）都不配對",
    same([...m.toCanvas.entries()], [["guan_yu", "hero_guan_yu"]]) &&
      same([...m.toCanonical.entries()], [["hero_guan_yu", "guan_yu"]]),
    { toCanvas: [...m.toCanvas.entries()] }
  );
}

// ── 顯示投影 ──
{
  const data = deepFreeze(NEW_PROFILE());
  const p = sp.projectSharedProfile("k1", data, 1, CONFIG, MAP);
  check(
    "新存檔（heroes 與 team 都是空陣列）：不唯讀、不崩潰；畫面列出三位兩邊都有的武將，用設定的基礎值（等級 1、星 0）；隊伍是空的但可以編輯；金幣 500、容量 11 照存檔",
    !p.readOnly &&
      p.teamEditable &&
      p.display.team.length === 0 &&
      same(
        p.display.heroes.map((h) => [
          h.hero_id,
          h.level,
          h.star,
          h.atk,
          h.def,
          h.hp,
        ]),
        [
          ["hero_guan_yu", 1, 0, 140, 70, 1450],
          ["hero_zhao_yun", 1, 0, 120, 60, 1300],
          ["hero_zhang_fei", 1, 0, 0, 80, 1500],
        ]
      ) &&
      p.display.gold === 500 &&
      p.display.capacity === 11 &&
      p.display.key === "k1" &&
      p.display.serverRev === 1,
    p
  );
}
{
  const data = deepFreeze({
    ...NEW_PROFILE(),
    gold: 0,
    exp: 0,
    heroes: [
      {
        hero_id: "guan_yu",
        level: 3,
        star: 0,
        atk: 0,
        def: 0,
        hp: 0,
        attack_range: 2.1,
      },
    ],
  });
  const p = sp.projectSharedProfile("k1", data, 4, CONFIG, MAP);
  const gy = p.display.heroes.find((h) => h.hero_id === "hero_guan_yu");
  check(
    "數值 0 照樣是 0：金幣 0、升級過的關羽攻防生命都是 0 時畫面也是 0（不被預設值蓋掉）；等級用存檔的 3",
    p.display.gold === 0 &&
      gy.level === 3 &&
      gy.atk === 0 &&
      gy.def === 0 &&
      gy.hp === 0 &&
      gy.star === 0,
    { gold: p.display.gold, gy }
  );
}
{
  const data = deepFreeze({
    ...NEW_PROFILE(),
    heroes: [
      { hero_id: "zhao_yun", level: 2, star: 1, atk: 132, def: 66, hp: 1430 },
      { hero_id: "lu_bu", level: 9, star: 3, atk: 999, def: 999, hp: 9999 },
      { hero_id: "gan_ning", level: 2, star: 0, atk: 134, def: 118, hp: 1358 },
      { hero_id: "zhang_fei", level: 2, star: 0, atk: 1, def: 1, hp: 1 },
      { hero_id: "zhang_fei", level: 5, star: 0, atk: 2, def: 2, hp: 2 },
    ],
  });
  const p = sp.projectSharedProfile("k1", data, 2, CONFIG, MAP);
  check(
    "對照不到（lu_bu、只在後端的 gan_ning）與重複（zhang_fei 兩筆）的武將：記在 lockedHeroIds、原樣保留；重複的不列在畫面上（不猜成基礎值）；畫面只列兩邊都有、沒有衝突的；升級過的趙雲用存檔的數值",
    same(p.lockedHeroIds.slice().sort(), ["gan_ning", "lu_bu", "zhang_fei"]) &&
      same(
        p.display.heroes.map((h) => h.hero_id),
        ["hero_guan_yu", "hero_zhao_yun"]
      ) &&
      p.display.heroes.find((h) => h.hero_id === "hero_zhao_yun").atk === 132 &&
      same(data.heroes.length, 5),
    p
  );
}
{
  const ok = sp.projectSharedProfile(
    "k",
    deepFreeze({
      ...NEW_PROFILE(),
      team: [
        { hero_id: "zhao_yun", slot: 2 },
        { hero_id: "guan_yu", slot: 1 },
      ],
    }),
    1,
    CONFIG,
    MAP
  );
  const cases = [
    ["對照不到的武將", [{ hero_id: "lu_bu", slot: 1 }]],
    ["只在後端的武將", [{ hero_id: "gan_ning", slot: 1 }]],
    [
      "slot 重複",
      [
        { hero_id: "guan_yu", slot: 1 },
        { hero_id: "zhao_yun", slot: 1 },
      ],
    ],
    ["slot 是 0", [{ hero_id: "guan_yu", slot: 0 }]],
    ["slot 不是整數", [{ hero_id: "guan_yu", slot: "1" }]],
    [
      "同一位武將兩次",
      [
        { hero_id: "guan_yu", slot: 1 },
        { hero_id: "guan_yu", slot: 2 },
      ],
    ],
    [
      "超過 5 位",
      [1, 2, 3, 4, 5, 6].map((n) => ({ hero_id: "guan_yu", slot: n })),
    ],
    [
      "不認得的欄位（改隊伍會丟掉）",
      [{ hero_id: "guan_yu", slot: 1, formation: "front" }],
    ],
  ];
  const bad = cases.map(([name, team]) => {
    const p = sp.projectSharedProfile(
      "k",
      deepFreeze({ ...NEW_PROFILE(), team }),
      1,
      CONFIG,
      MAP
    );
    return [
      name,
      p.teamEditable,
      p.display.team.length,
      !!p.teamNote,
      p.readOnly,
    ];
  });
  check(
    "隊伍：能表示時依 slot 排序換成 JS 版的槽位（0 起）；對照不到、只在後端、slot 重複／0／非整數、同一位兩次、超過 5 位、項目有不認得的欄位都整份不可編輯、畫面隊伍是空的（不換成預設），整份存檔不唯讀",
    same(ok.display.team, [
      { slot: 0, hero_id: "hero_guan_yu" },
      { slot: 1, hero_id: "hero_zhao_yun" },
    ]) &&
      ok.teamEditable &&
      bad.every(
        ([, editable, len, note, ro]) =>
          editable === false && len === 0 && note && ro === false
      ),
    { ok: ok.display.team, bad }
  );
}
{
  const data = NEW_PROFILE();
  delete data.team;
  const p = sp.projectSharedProfile("k", deepFreeze(data), 1, CONFIG, MAP);
  check(
    "team 可以沒有（v2.9 的弱驗證允許）：不唯讀、隊伍是空的、可以編輯",
    !p.readOnly && p.teamEditable && p.display.team.length === 0,
    p
  );
}
{
  const damaged = [
    ["gold 是字串", { ...NEW_PROFILE(), gold: "500" }, "GOLD"],
    [
      "沒有 level",
      (() => {
        const d = NEW_PROFILE();
        delete d.level;
        return d;
      })(),
      "LEVEL",
    ],
    ["heroes 不是陣列", { ...NEW_PROFILE(), heroes: {} }, "HEROES"],
    [
      "武將沒有 hero_id",
      { ...NEW_PROFILE(), heroes: [{ level: 2 }] },
      "HERO_ENTRY",
    ],
    [
      "武將數值不是數字",
      { ...NEW_PROFILE(), heroes: [{ hero_id: "guan_yu", atk: "big" }] },
      "HERO_VALUE",
    ],
    ["team 不是陣列", { ...NEW_PROFILE(), team: "x" }, "TEAM"],
    ["整份不是物件", ["x"], "NOT_OBJECT"],
  ];
  const got = damaged.map(([name, d, code]) => {
    let p = null;
    let threw = null;
    try {
      p = sp.projectSharedProfile("k", deepFreeze(d), 1, CONFIG, MAP);
    } catch (e) {
      threw = String(e);
    }
    return [
      name,
      threw,
      p && p.readOnly,
      p && p.issues.some((i) => i.code === code),
    ];
  });
  check(
    "欄位壞掉時唯讀而且不崩潰：gold 字串、沒有 level、heroes 不是陣列、武將沒有 id、武將數值不是數字、team 不是陣列、整份不是物件",
    got.every(
      ([, threw, ro, has]) => threw === null && ro === true && has === true
    ),
    got
  );
}

// ── 修改 ──
const RICH = () => ({
  ...NEW_PROFILE(),
  capacity: 9,
  gold: 0,
  heroes: [
    {
      hero_id: "guan_yu",
      level: 3,
      star: 0,
      atk: 168,
      def: 84,
      hp: 1740,
      attack_range: 2.2,
    },
    { hero_id: "lu_bu", level: 9 },
  ],
  team: [{ hero_id: "lu_bu", slot: 1, extra: "keep" }],
  stage_stars: { chapter1_1: 3 },
  future_field: { nested: [1, 2, 3] },
});
{
  const data = deepFreeze(RICH());
  const r = sp.patchNickname(data, "  趙子龍  ");
  const rest = (o) => {
    const c = clone(o);
    delete c.nickname;
    return c;
  };
  check(
    "暱稱：只改 nickname（去掉前後空白），其他欄位（不認得的 stage_stars、future_field、不支援的 lu_bu、隊伍原樣）完全相同；空白與超過 50 字拒絕；傳入的資料不被修改",
    r.ok &&
      r.data.nickname === "趙子龍" &&
      same(rest(r.data), rest(data)) &&
      sp.patchNickname(data, "   ").ok === false &&
      sp.patchNickname(data, "a".repeat(51)).ok === false &&
      data.nickname === "新主公",
    r
  );
}
{
  const data = deepFreeze({ ...RICH(), capacity: 9 });
  const r = sp.patchTeam(
    data,
    [
      { slot: 3, hero_id: "hero_zhao_yun" },
      { slot: 1, hero_id: "hero_guan_yu" },
    ],
    CONFIG,
    MAP
  );
  const rest = (o) => {
    const c = clone(o);
    delete c.team;
    return c;
  };
  const errs = [
    ["空的", sp.patchTeam(data, [], CONFIG, MAP)],
    [
      "超過容量（5+5>9）",
      sp.patchTeam(
        data,
        [
          { slot: 0, hero_id: "hero_guan_yu" },
          { slot: 1, hero_id: "hero_zhang_fei" },
        ],
        CONFIG,
        MAP
      ),
    ],
    [
      "對照不到",
      sp.patchTeam(data, [{ slot: 0, hero_id: "hero_ma_chao" }], CONFIG, MAP),
    ],
    [
      "重複",
      sp.patchTeam(
        data,
        [
          { slot: 0, hero_id: "hero_guan_yu" },
          { slot: 1, hero_id: "hero_guan_yu" },
        ],
        CONFIG,
        MAP
      ),
    ],
    [
      "超過 5 位",
      sp.patchTeam(
        data,
        [0, 1, 2, 3, 4, 5].map((i) => ({ slot: i, hero_id: "hero_guan_yu" })),
        CONFIG,
        MAP
      ),
    ],
    [
      "設定裡沒有 cost",
      sp.patchTeam(
        data,
        [{ slot: 0, hero_id: "hero_guan_yu" }],
        [{ hero_id: "guan_yu" }],
        MAP
      ),
    ],
  ].map(([n, x]) => [n, x.ok]);
  check(
    "隊伍：依槽位順序換成後端格式（guan_yu slot 1、zhao_yun slot 2），cost 用後端設定（5+4=9 ≤ 容量 9）；其他欄位原樣；空的、超過容量、對照不到、重複、超過 5 位、設定沒有 cost 都拒絕",
    r.ok &&
      same(r.data.team, [
        { hero_id: "guan_yu", slot: 1 },
        { hero_id: "zhao_yun", slot: 2 },
      ]) &&
      same(rest(r.data), rest(data)) &&
      errs.every(([, ok]) => ok === false),
    { r, errs }
  );
}
{
  const data = deepFreeze(NEW_PROFILE());
  const a = sp.patchNickname(data, "甲");
  const b = sp.patchTeam(
    data,
    [{ slot: 0, hero_id: "hero_zhao_yun" }],
    CONFIG,
    MAP
  );
  const allowed = new Set([...Object.keys(data), "nickname", "team"]);
  const extra = [a, b].flatMap((r) =>
    r.ok ? Object.keys(r.data).filter((k) => !allowed.has(k)) : ["NOT_OK"]
  );
  check(
    "修改結果不會出現 JS 版的預設值或本機欄位：沒有 key、updatedAt、serverRev、cleared_stages，金幣仍是 500、容量仍是 11",
    extra.length === 0 &&
      a.data.gold === 500 &&
      b.data.capacity === 11 &&
      !("key" in a.data) &&
      !("updatedAt" in b.data),
    { extra, a, b }
  );
}

// ── 升級預覽 ──
{
  const data = deepFreeze({
    ...NEW_PROFILE(),
    heroes: [
      { hero_id: "guan_yu", level: 3 },
      { hero_id: "zhang_fei", level: 0 },
    ],
  });
  const got = [
    sp.upgradeCostOf(data, "guan_yu", CONFIG),
    sp.upgradeCostOf(data, "zhao_yun", CONFIG),
    sp.upgradeCostOf(data, "zhang_fei", CONFIG),
    sp.upgradeCostOf(data, "lu_bu", CONFIG),
    sp.upgradeGrowthOf("zhang_fei", CONFIG),
  ];
  check(
    "升級費用照後端公式（upgrade_cost_base 沒有或空白時 100，乘目前等級，等級不是正數時當 1）：關羽 120×3=360、趙雲（未升級）100×1、張飛（等級 0）100×1、設定沒有的武將 null；成長值 0 照樣是 0",
    same(got, [360, 100, 100, null, { atk: 0, def: 8, hp: 150 }]),
    got
  );
}
{
  // 同一位武將兩筆（關羽 lv3／lv7）：不知道伺服器用哪一筆，不給費用預覽；只有一筆、沒有紀錄的照常
  const dup = deepFreeze({
    ...NEW_PROFILE(),
    heroes: [
      { hero_id: "guan_yu", level: 3, atk: 300 },
      { hero_id: "guan_yu", level: 7, atk: 700 },
      { hero_id: "zhao_yun", level: 2 },
    ],
  });
  const p = sp.projectSharedProfile("k", dup, 4, CONFIG, MAP);
  const got = {
    dupCost: sp.upgradeCostOf(dup, "guan_yu", CONFIG),
    singleCost: sp.upgradeCostOf(dup, "zhao_yun", CONFIG),
    sparseCost: sp.upgradeCostOf(dup, "zhang_fei", CONFIG),
    listed: p.display.heroes.map((h) => [h.hero_id, h.level, h.atk]),
    locked: p.lockedHeroIds,
    kept: dup.heroes.length,
  };
  check(
    "重複的武將（關羽兩筆）：不列成一般武將、不給費用預覽、記在 lockedHeroIds、兩筆原樣保留；一筆紀錄的趙雲與沒有紀錄的張飛照常",
    got.dupCost === null &&
      got.singleCost === 200 &&
      got.sparseCost === 100 &&
      !got.listed.some(([id]) => id === "hero_guan_yu") &&
      same(
        got.listed.find(([id]) => id === "hero_zhao_yun"),
        ["hero_zhao_yun", 2, 120]
      ) &&
      same(
        got.listed.find(([id]) => id === "hero_zhang_fei"),
        ["hero_zhang_fei", 1, 0]
      ) &&
      same(got.locked, ["guan_yu"]) &&
      got.kept === 3 &&
      !p.readOnly,
    got
  );
}

// ── 同步 ──
{
  const conflict = sync.classifyWriteError(
    new GasError("REV_CONFLICT", {
      status: 409,
      error: "REV_CONFLICT",
      rev: 7,
      data: { gold: 3 },
    })
  );
  const rejected = sync.classifyWriteError(
    new GasError("GOLD_NOT_ENOUGH", { status: 400, required: 300, current: 10 })
  );
  const unknown = sync.classifyWriteError(new TypeError("Failed to fetch"));
  // 後端在寫入提交點之前就回應的錯誤（一定沒寫入）才是拒絕；SERVER_ERROR 可能在寫入後才發生，沒有或不認得的錯誤碼也不能假設沒寫入
  const notWritten = [
    "INVALID_DATA",
    "BUSY",
    "DATA_TOO_LARGE",
    "BASE_REV_REQUIRED",
    "BAD_BASE_REV",
    "PROFILE_NOT_FOUND",
    "DATA_CORRUPT",
    "KEY_ALREADY_EXISTS",
    "HERO_CONFIG_NOT_FOUND",
    "MISSING_HERO_ID",
  ].map(
    (c) =>
      sync.classifyWriteError(new GasError(c, { status: 400, error: c })).kind
  );
  const maybeWritten = ["SERVER_ERROR", "GAS_ERROR", "SOMETHING_NEW"].map(
    (c) =>
      sync.classifyWriteError(new GasError(c, { status: 500, error: c })).kind
  );
  const conflictNoData = sync.classifyWriteError(
    new GasError("REV_CONFLICT", { status: 409, error: "REV_CONFLICT" })
  );
  check(
    "寫入錯誤分類：409 REV_CONFLICT 是衝突（附雲端的 data 與 rev 7；沒附時 rev 是 null）；一定沒寫入的錯誤是明確拒絕；SERVER_ERROR、沒有錯誤碼、不認得的錯誤碼與網路錯誤是結果不明",
    conflict.kind === "conflict" &&
      conflict.serverRev === 7 &&
      same(conflict.serverData, { gold: 3 }) &&
      conflictNoData.kind === "conflict" &&
      conflictNoData.serverRev === null &&
      rejected.kind === "rejected" &&
      rejected.code === "GOLD_NOT_ENOUGH" &&
      notWritten.every((k) => k === "rejected") &&
      maybeWritten.every((k) => k === "unknown") &&
      unknown.kind === "unknown",
    { conflict, rejected, unknown, notWritten, maybeWritten, conflictNoData }
  );
}
{
  const revs = [0, 5, -1, 1.5, "3", null, undefined, NaN].map((v) =>
    sync.revOf(v)
  );
  const e = sync.createEpoch();
  const t1 = e.next();
  const was = e.isCurrent(t1);
  e.next();
  check(
    "版本號只接受非負整數；帳號世代換新後舊的請求不是目前的",
    same(revs, [0, 5, null, null, null, null, null, null]) &&
      was &&
      !e.isCurrent(t1),
    { revs }
  );
}
{
  const input = {
    stageId: "chapter1_2",
    result: "WIN",
    starsEarned: 3,
    kills: 12,
    timeSeconds: 90,
    battlePoints: 140,
  };
  const req = sync.buildSettleRequest(input, "r-1", 4);
  const bad = [
    sync.buildSettleRequest(input, "r-1", null),
    sync.buildSettleRequest(input, "", 4),
    sync.buildSettleRequest({ ...input, starsEarned: 4 }, "r-1", 4),
    sync.buildSettleRequest({ ...input, battlePoints: -1 }, "r-1", 4),
    sync.buildSettleRequest(input, "x".repeat(101), 4),
  ];
  check(
    "結算請求：固定 request_id 與 base_rev，帶 settle_contract 2 與 battle_points；沒有版本、空 id、星數超過 3、負的點數、id 太長都不建立",
    req &&
      req.requestId === "r-1" &&
      req.baseRev === 4 &&
      same(req.payload, {
        stage_id: "chapter1_2",
        result: "WIN",
        stars_earned: 3,
        kills: 12,
        time_seconds: 90,
        loots: [{ item: "battle_points", count: 140 }],
        request_id: "r-1",
        base_rev: 4,
        settle_contract: 2,
      }) &&
      bad.every((x) => x === null),
    { req, bad }
  );
}
{
  const req = sync.buildSettleRequest(
    {
      stageId: "chapter1_2",
      result: "WIN",
      starsEarned: 2,
      kills: 1,
      timeSeconds: 1,
      battlePoints: 1,
    },
    "r-9",
    4
  );
  const base = {
    status: 200,
    success: true,
    settle_contract: 2,
    request_id: "r-9",
    reward: { points: 1, exp: 90 },
    after: { gold: 9 },
  };
  const got = {
    applied: sync.interpretSettleResponse(
      { ...base, rev: 5, prev_rev: 4 },
      req
    ),
    mismatch: sync.interpretSettleResponse(
      { ...base, prev_rev: 6, base_mismatch: true },
      req
    ),
    dupRev: sync.interpretSettleResponse(
      { ...base, duplicate: true, rev: 5 },
      req
    ),
    dupNoRev: sync.interpretSettleResponse(
      { ...base, duplicate: true, base_mismatch: true },
      req
    ),
    noContract: sync.interpretSettleResponse(
      { status: 200, success: true, log_id: "x" },
      req
    ),
    otherId: sync.interpretSettleResponse(
      { ...base, request_id: "r-8", rev: 5 },
      req
    ),
  };
  check(
    "結算回應：帶新 rev 是已結算；base_mismatch 是已結算但要唯讀讀回（不是沒保存）；同一場重送不重發獎勵；沒有新契約或 request_id 不同不能當完整結算",
    got.applied.kind === "applied" &&
      got.applied.rev === 5 &&
      got.mismatch.kind === "applied-reread" &&
      got.mismatch.duplicate === false &&
      got.dupRev.kind === "duplicate" &&
      got.dupRev.rev === 5 &&
      got.dupNoRev.kind === "applied-reread" &&
      got.dupNoRev.duplicate === true &&
      got.noContract.kind === "contract-missing" &&
      got.otherId.kind === "contract-missing",
    got
  );
}
{
  const got = [
    sync.classifySettleError(new GasError("RESULT_UNKNOWN", { status: 409 }))
      .kind,
    sync.classifySettleError(new GasError("REQUEST_ID_REUSED", { status: 409 }))
      .kind,
    sync.classifySettleError(new GasError("INVALID_REWARD", { status: 400 }))
      .kind,
    sync.classifySettleError(new TypeError("Failed to fetch")).kind,
    sync.classifySettleError(new GasError("SERVER_ERROR", { status: 500 }))
      .kind,
    sync.classifySettleError(new GasError("GAS_ERROR", { status: 500 })).kind,
  ];
  check(
    "結算錯誤：RESULT_UNKNOWN、REQUEST_ID_REUSED 要人工確認（不換 id 重送）；一定沒寫入的錯誤是拒絕；網路錯誤、SERVER_ERROR、沒有錯誤碼是結果不明（保留原 request_id 與內容）",
    same(got, [
      "needs-review",
      "needs-review",
      "rejected",
      "unknown",
      "unknown",
      "unknown",
    ]),
    got
  );
}

// ── 結算請求的欄位守門與邊界對照組（邊界本身的完整測試在 sharedBattleSettlement.test.mjs） ──
{
  const input = {
    stageId: "chapter1_2",
    result: "WIN",
    starsEarned: 3,
    kills: 12,
    timeSeconds: 90,
    battlePoints: 140,
  };
  const bad = [
    ["版本是字串", input, "r-1", "4"],
    ["版本是小數", input, "r-1", 1.5],
    ["版本是負數", input, "r-1", -1],
    ["版本超過安全整數", input, "r-1", 2 ** 53],
    ["版本 NaN", input, "r-1", NaN],
    ["request_id 不是字串", input, 7, 4],
    ["空的關卡", { ...input, stageId: "" }, "r-1", 4],
    ["51 字的關卡", { ...input, stageId: "c".repeat(51) }, "r-1", 4],
    ["關卡不是字串", { ...input, stageId: 12 }, "r-1", 4],
    ["result 小寫", { ...input, result: "win" }, "r-1", 4],
    ["result 不明", { ...input, result: "DRAW" }, "r-1", 4],
    ["kills 負數", { ...input, kills: -1 }, "r-1", 4],
    ["kills 小數", { ...input, kills: 1.5 }, "r-1", 4],
    ["kills 字串", { ...input, kills: "12" }, "r-1", 4],
    ["kills NaN", { ...input, kills: NaN }, "r-1", 4],
    ["kills Infinity", { ...input, kills: Infinity }, "r-1", 4],
    ["time 負數", { ...input, timeSeconds: -1 }, "r-1", 4],
    ["time 小數", { ...input, timeSeconds: 9.5 }, "r-1", 4],
    ["time 字串", { ...input, timeSeconds: "90" }, "r-1", 4],
    ["星數小數", { ...input, starsEarned: 2.5 }, "r-1", 4],
    ["點數超過安全整數", { ...input, battlePoints: 2 ** 53 }, "r-1", 4],
  ].map(([name, i, id, rev]) => [name, sync.buildSettleRequest(i, id, rev)]);
  const ok = [
    sync.buildSettleRequest({ ...input, stageId: "c".repeat(50) }, "r-1", 0),
    sync.buildSettleRequest(
      { ...input, result: "LOSE", starsEarned: 0, kills: 0, timeSeconds: 0 },
      "x".repeat(100),
      4
    ),
  ];
  check(
    "結算請求守門：版本（字串、小數、負數、超過安全整數、NaN）、request_id 不是字串、關卡（空、51 字、不是字串）、result（小寫、不明）、kills／time（負數、小數、字串、NaN、Infinity）、星數小數、點數超過安全整數都不建立；50 字關卡、版本 0、100 字 id、全 0 的落敗照樣建立",
    bad.every(([, r]) => r === null) && ok.every((r) => r !== null),
    { bad: bad.filter(([, r]) => r !== null), ok }
  );
}
{
  const bs = require(join(HERE, "sharedBattleSettlement.ts"));
  const armed = bs.armSettle({
    accountKey: "acc-A",
    epoch: 1,
    baseRev: 4,
    stageId: "chapter1_2",
    battleId: "battle_1",
    requestId: "r-1",
  }).armed;
  const ctx = {
    mode: "shared",
    accountKey: "acc-A",
    epoch: 1,
    readOnly: false,
    busy: false,
    writeBlocked: false,
    teamSupported: true,
    configReady: true,
    practice: false,
    completeStageIds: new Set(["chapter1_1", "chapter1_2"]),
    maxStage: "chapter1_2",
  };
  const viaAdapter = bs.prepareSettle(armed, ctx, {
    result: "WIN",
    stage_id: "chapter1_2",
    battle_id: "battle_1",
    stars_earned: 3,
    kills: 12,
    time_seconds: 90,
    loots: [{ item: "battle_points", count: 140 }],
  });
  const direct = sync.buildSettleRequest(
    {
      stageId: "chapter1_2",
      result: "WIN",
      starsEarned: 3,
      kills: 12,
      timeSeconds: 90,
      battlePoints: 140,
    },
    "r-1",
    4
  );
  const blocked = bs.prepareSettle(
    armed,
    { ...ctx, practice: true },
    {
      result: "WIN",
      stage_id: "chapter1_2",
      battle_id: "battle_1",
      stars_earned: 3,
      kills: 12,
      time_seconds: 90,
      loots: [{ item: "battle_points", count: 140 }],
    }
  );
  check(
    "邊界對照組：同一場經過結算邊界與直接建立的請求完全相同（不另算獎勵、不改欄位）；自由演練時邊界不產生請求",
    viaAdapter.ok &&
      same(viaAdapter.request, direct) &&
      !blocked.ok &&
      blocked.reason === "practice",
    { viaAdapter, direct, blocked }
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
