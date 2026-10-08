// 神馬三國 JS 版共用帳號戰鬥結算的資料邊界測試（utils/sharedBattleSettlement.ts；純函式、不連網、不碰儲存空間）
// - 固定字面值樣本：引擎凍結結果（BattleResultData）的勝 3／2／1 星與落敗 → 請求內容逐欄寫死（不由實作產生期望）
// - 阻擋：帳號／世代／這一場不符、自由演練、未解鎖、關卡不存在、進度格式不對、狀態不可寫、結果欄位或 loots 不合法
// - 凍結：呼叫後改原輸入不影響已建立的請求；重送只用同一份內容
// - 待確認的結算格式：綁定帳號指紋、request_id、這一場、第一次的版本與內容；不符一律要人工確認；
//   內容和 prepareSettle 一樣嚴格（建構回 null、解析用重算檢查碼的自洽資料直接驗）
// - 伺服器行為用 tests/profile-contract-fixture.mjs（照後端 v2.9 實作、另有原始碼逐步對照）：同一場重送、
//   舊版本的 base_mismatch、同 id 不同內容、被擠出去重紀錄的舊結算、重玩舊關進度不倒退
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/sharedBattleSettlement.test.mjs"
// 輸出 PASS／FAIL 各行與一行 RESULT_JSON；有任何失敗時結束碼為 1
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

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

const bs = require(join(HERE, "sharedBattleSettlement.ts"));
const { createProfileFixture } = await import(
  pathToFileURL(join(HERE, "../tests/profile-contract-fixture.mjs")).href
);

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : "  " + JSON.stringify(detail).slice(0, 900)}`
  );
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const clone = (o) => JSON.parse(JSON.stringify(o));

// ── 固定的這一場與結算當下的狀態（虛構的值） ──
const ARM = {
  accountKey: "acc-A",
  epoch: 3,
  baseRev: 7,
  stageId: "chapter1_2",
  battleId: "battle_1",
  requestId: "cv-req-1",
};
const armed = bs.armSettle(ARM).armed;
const CTX = () => ({
  mode: "shared",
  accountKey: "acc-A",
  epoch: 3,
  readOnly: false,
  busy: false,
  writeBlocked: false,
  teamSupported: true,
  configReady: true,
  practice: false,
  completeStageIds: new Set([
    "chapter1_1",
    "chapter1_2",
    "chapter1_3",
    "chapter1_4",
  ]),
  maxStage: "chapter1_3",
  clearedStages: undefined,
});
// 引擎的凍結結果（基地 20 生命：損失 ≤2→3 星、≤10→2 星、其他 1 星；點數 kills×10＋基地×20＋100／300／600；落敗 0 星、10 點）
const R = (extra = {}) => ({
  result: "WIN",
  stage_id: "chapter1_2",
  battle_id: "battle_1",
  stars_earned: 3,
  kills: 12,
  time_seconds: 95,
  loots: [{ item: "battle_points", count: 1120 }],
  ...extra,
});
const P = (extra = {}) => ({
  stage_id: "chapter1_2",
  result: "WIN",
  stars_earned: 3,
  kills: 12,
  time_seconds: 95,
  loots: [{ item: "battle_points", count: 1120 }],
  request_id: "cv-req-1",
  base_rev: 7,
  settle_contract: 2,
  ...extra,
});

// ── 固定字面值樣本 ──
{
  const cases = [
    ["勝利 3 星（基地 20、擊殺 12：120＋400＋600）", R(), P()],
    [
      "勝利 2 星（基地 15、擊殺 9：90＋300＋300）",
      R({
        stars_earned: 2,
        kills: 9,
        time_seconds: 80,
        loots: [{ item: "battle_points", count: 690 }],
      }),
      P({
        stars_earned: 2,
        kills: 9,
        time_seconds: 80,
        loots: [{ item: "battle_points", count: 690 }],
      }),
    ],
    [
      "勝利 1 星（基地 9、擊殺 5：50＋180＋100）",
      R({
        stars_earned: 1,
        kills: 5,
        time_seconds: 60,
        loots: [{ item: "battle_points", count: 330 }],
      }),
      P({
        stars_earned: 1,
        kills: 5,
        time_seconds: 60,
        loots: [{ item: "battle_points", count: 330 }],
      }),
    ],
    [
      "落敗（0 星、固定 10 點）",
      R({
        result: "LOSE",
        stars_earned: 0,
        kills: 4,
        time_seconds: 50,
        loots: [{ item: "battle_points", count: 10 }],
      }),
      P({
        result: "LOSE",
        stars_earned: 0,
        kills: 4,
        time_seconds: 50,
        loots: [{ item: "battle_points", count: 10 }],
      }),
    ],
  ];
  const got = cases.map(([name, r, want]) => {
    const p = bs.prepareSettle(armed, CTX(), r);
    return [
      name,
      p.ok &&
        same(p.request.payload, want) &&
        p.request.requestId === "cv-req-1" &&
        p.request.baseRev === 7,
      p,
    ];
  });
  check(
    "固定樣本：勝 3／2／1 星與落敗，請求逐欄等於寫死的內容（契約 2、固定 id 與 base_rev 7、星數與點數直接來自凍結結果）",
    got.every(([, ok]) => ok),
    got.filter(([, ok]) => !ok)
  );
}

// ── 原碼對照：用真正的引擎（engine/BattleManager.ts）產生凍結結果，音效換成空的替身 ──
{
  const soundPath = join(HERE, "../engine/SoundManager.ts");
  require.cache[soundPath] = {
    id: soundPath,
    filename: soundPath,
    loaded: true,
    exports: {
      SoundManager: { getInstance: () => ({ stopBgm() {}, play() {} }) },
    },
  };
  const { BattleManager } = require(join(HERE, "../engine/BattleManager.ts"));
  const run = (isWin, baseHp, kills, time) => {
    const bm = new BattleManager();
    let got = null;
    bm.onBattleEnded = (r) => (got = r);
    bm.initialize(5, "chapter1_2", "battle_1");
    bm.baseHp = baseHp;
    bm.kills = kills;
    bm.battleTime = time;
    bm.endBattle(isWin);
    return got;
  };
  const engine = [
    run(true, 20, 12, 95.7),
    run(true, 15, 9, 80.2),
    run(true, 9, 5, 60.9),
    run(false, 0, 4, 50.4),
  ];
  const want = [
    {
      stars_earned: 3,
      kills: 12,
      time_seconds: 95,
      loots: [{ item: "battle_points", count: 1120 }],
    },
    {
      stars_earned: 2,
      kills: 9,
      time_seconds: 80,
      loots: [{ item: "battle_points", count: 690 }],
    },
    {
      stars_earned: 1,
      kills: 5,
      time_seconds: 60,
      loots: [{ item: "battle_points", count: 330 }],
    },
    {
      result: "LOSE",
      stars_earned: 0,
      kills: 4,
      time_seconds: 50,
      loots: [{ item: "battle_points", count: 10 }],
    },
  ].map((w) => P(w));
  const got = engine.map((r) => bs.prepareSettle(armed, CTX(), r));
  check(
    "原碼對照：引擎結算（基地 20／15／9 與落敗、時間無條件捨去）經過邊界後逐欄等於寫死的請求",
    got.every((p, i) => p.ok && same(p.request.payload, want[i])),
    { engine, got }
  );
}

// ── 進場固定這一場 ──
{
  const bad = [
    ["空的關卡", { ...ARM, stageId: "" }, "bad-stage"],
    [
      "51 字的關卡",
      { ...ARM, stageId: "chapter1_" + "1".repeat(42) },
      "bad-stage",
    ],
    [
      "關卡格式不對（前後多字）",
      { ...ARM, stageId: "xchapter1_2" },
      "bad-stage",
    ],
    ["關卡補零", { ...ARM, stageId: "chapter01_2" }, "bad-stage"],
    ["沒有版本", { ...ARM, baseRev: null }, "missing-rev"],
    ["版本是字串", { ...ARM, baseRev: "7" }, "missing-rev"],
    ["版本超過安全整數", { ...ARM, baseRev: 2 ** 53 }, "missing-rev"],
    ["空的 battle_id", { ...ARM, battleId: "" }, "bad-battle"],
    [
      "101 字的 request_id",
      { ...ARM, requestId: "r".repeat(101) },
      "bad-request-id",
    ],
    ["空帳號", { ...ARM, accountKey: "" }, "bad-account"],
    ["負的世代", { ...ARM, epoch: -1 }, "bad-epoch"],
  ].map(([name, input, want]) => [name, bs.armSettle(input), want]);
  check(
    "進場：關卡（空、51 字、多字、補零）、版本（沒有、字串、超過安全整數）、battle_id、request_id、帳號、世代不合法都不能固定這一場",
    bad.every(([, r, want]) => !r.ok && r.reason === want),
    bad.filter(([, r, want]) => r.ok || r.reason !== want)
  );
  check(
    "進場：合法時回傳凍結的副本",
    Object.isFrozen(armed) &&
      armed.baseRev === 7 &&
      armed.requestId === "cv-req-1"
  );
}

// ── 阻擋：狀態與這一場 ──
{
  const cases = [
    ["不是共用帳號", { mode: "guest" }, R(), "not-shared"],
    ["換了帳號", { accountKey: "acc-B" }, R(), "account-changed"],
    ["舊世代", { epoch: 4 }, R(), "stale-epoch"],
    ["唯讀", { readOnly: true }, R(), "read-only"],
    ["正在保存", { busy: true }, R(), "busy"],
    ["上一個寫入待確認", { writeBlocked: true }, R(), "write-blocked"],
    ["隊伍不支援", { teamSupported: false }, R(), "team-unsupported"],
    ["武將設定沒讀到", { configReady: false }, R(), "config-not-ready"],
    [
      "關卡設定裡沒有這一關（格式合法）",
      { completeStageIds: new Set(["chapter1_1"]) },
      R(),
      "unknown-stage",
    ],
    [
      "雲端進度格式不對（多字）",
      { maxStage: "xchapter1_3" },
      R(),
      "bad-progress",
    ],
    ["雲端進度不是字串", { maxStage: 103 }, R(), "bad-progress"],
    ["自由演練（已解鎖也不送）", { practice: true }, R(), "practice"],
    ["錯的 battle_id", {}, R({ battle_id: "battle_2" }), "wrong-battle"],
    ["錯的 stage_id", {}, R({ stage_id: "chapter1_1" }), "wrong-battle"],
  ].map(([name, ctx, r, want]) => [
    name,
    bs.prepareSettle(armed, { ...CTX(), ...ctx }, r),
    want,
  ]);
  check(
    "阻擋：不是共用、換帳號、舊世代、唯讀、保存中、待確認、隊伍不支援、設定沒讀到、關卡不存在、進度格式不對、自由演練、錯的這一場，都不產生請求",
    cases.every(([, r, want]) => !r.ok && r.reason === want),
    cases
      .filter(([, r, want]) => r.ok || r.reason !== want)
      .map(([n, r]) => [n, r])
  );
  const locked = bs.armSettle({ ...ARM, stageId: "chapter1_4" }).armed;
  const lockedR = bs.prepareSettle(
    locked,
    CTX(),
    R({ stage_id: "chapter1_4" })
  );
  const clearedR = bs.prepareSettle(
    locked,
    { ...CTX(), clearedStages: { chapter1_4: 1 } },
    R({ stage_id: "chapter1_4" })
  );
  const oldStage = bs.armSettle({ ...ARM, stageId: "chapter1_1" }).armed;
  const oldR = bs.prepareSettle(oldStage, CTX(), R({ stage_id: "chapter1_1" }));
  check(
    "解鎖：進度 chapter1_3 時 chapter1_4 擋下（locked-stage）；cleared_stages 有 chapter1_4 的星數時可以送；已解鎖的舊關 chapter1_1 可以送",
    !lockedR.ok && lockedR.reason === "locked-stage" && clearedR.ok && oldR.ok,
    { lockedR, clearedR, oldR }
  );
}

// ── 阻擋：結果欄位與 loots ──
{
  const cases = [
    ["result 不明", R({ result: "DRAW" })],
    [
      "缺 result",
      (() => {
        const r = R();
        delete r.result;
        return r;
      })(),
    ],
    ["勝利 0 星", R({ stars_earned: 0 })],
    ["勝利 4 星", R({ stars_earned: 4 })],
    ["星數是小數", R({ stars_earned: 2.5 })],
    [
      "落敗卻有星數",
      R({
        result: "LOSE",
        stars_earned: 1,
        loots: [{ item: "battle_points", count: 10 }],
      }),
    ],
    [
      "落敗點數不是 10",
      R({
        result: "LOSE",
        stars_earned: 0,
        loots: [{ item: "battle_points", count: 11 }],
      }),
    ],
    ["kills 負數", R({ kills: -1 })],
    ["kills 小數", R({ kills: 1.5 })],
    ["kills 字串", R({ kills: "12" })],
    ["kills NaN", R({ kills: NaN })],
    ["kills Infinity", R({ kills: Infinity })],
    ["time 負數", R({ time_seconds: -1 })],
    ["time 小數", R({ time_seconds: 9.5 })],
    ["time 字串", R({ time_seconds: "95" })],
    [
      "缺 loots",
      (() => {
        const r = R();
        delete r.loots;
        return r;
      })(),
    ],
    ["loots 空陣列", R({ loots: [] })],
    [
      "loots 重複兩筆",
      R({
        loots: [
          { item: "battle_points", count: 1120 },
          { item: "battle_points", count: 5 },
        ],
      }),
    ],
    [
      "loots 多一筆未知項目",
      R({
        loots: [
          { item: "battle_points", count: 1120 },
          { item: "gold", count: 1 },
        ],
      }),
    ],
    ["loots 只有未知項目", R({ loots: [{ item: "gold", count: 1120 }] })],
    ["loots 點數負數", R({ loots: [{ item: "battle_points", count: -1 }] })],
    ["loots 點數小數", R({ loots: [{ item: "battle_points", count: 1.5 }] })],
    [
      "loots 項目多一個欄位",
      R({ loots: [{ item: "battle_points", count: 1120, bonus: 1 }] }),
    ],
    ["結果不是物件", null],
  ].map(([name, r]) => [name, bs.prepareSettle(armed, CTX(), r)]);
  check(
    "結果不合法：result 不明或缺、星數（勝 0／4、小數、落敗有星）、落敗點數、kills／time（負、小數、字串、NaN、Infinity）、loots（缺、空、重複、多未知項、只有未知項、負數、小數、多欄位）都擋下（不補 0、不忽略多的）",
    cases.every(([, r]) => !r.ok && r.reason === "bad-result"),
    cases
      .filter(([, r]) => r.ok || r.reason !== "bad-result")
      .map(([n, r]) => [n, r])
  );
}

// ── 凍結與重送 ──
{
  const r = R();
  const p = bs.prepareSettle(armed, CTX(), r);
  r.kills = 99;
  r.loots[0].count = 1;
  r.stars_earned = 1;
  let threw = false;
  try {
    p.request.payload.loots[0].count = 5;
  } catch {
    threw = true;
  }
  check(
    "凍結：呼叫後改原輸入（kills、loots、星數）不影響已建立的請求；請求本身凍結（嚴格模式改值會丟例外）",
    p.ok &&
      same(p.request.payload, P()) &&
      Object.isFrozen(p.request.payload.loots[0]) &&
      (threw || p.request.payload.loots[0].count === 1120),
    p
  );
}

// ── 待確認的結算格式 ──
{
  const p = bs.prepareSettle(armed, CTX(), R());
  const text = bs.makePendingEnvelope(armed, p.request);
  const back = bs.parsePendingEnvelope(text, "acc-A");
  check(
    "待確認：序列化後解析回同一份請求（同 id、同 base_rev、同內容），不含帳號金鑰原文",
    back.ok &&
      same(back.request, p.request) &&
      !text.includes("acc-A") &&
      back.battleId === "battle_1",
    { back, text }
  );
  const env = JSON.parse(text);
  const variants = [
    ["換帳號", bs.parsePendingEnvelope(text, "acc-B"), "account"],
    [
      "版本號 0",
      bs.parsePendingEnvelope(JSON.stringify({ ...env, version: 0 }), "acc-A"),
      "version",
    ],
    [
      "格式名稱不同",
      bs.parsePendingEnvelope(JSON.stringify({ ...env, schema: "x" }), "acc-A"),
      "version",
    ],
    ["不是 JSON", bs.parsePendingEnvelope("{oops", "acc-A"), "json"],
    [
      "超過長度",
      bs.parsePendingEnvelope("x".repeat(bs.MAX_PENDING_CHARS + 1), "acc-A"),
      "size",
    ],
    [
      "request_id 被改",
      bs.parsePendingEnvelope(
        JSON.stringify({ ...env, requestId: "cv-req-2" }),
        "acc-A"
      ),
      "binding",
    ],
    [
      "內容被改但仍合法（點數）",
      bs.parsePendingEnvelope(
        JSON.stringify({
          ...env,
          payload: {
            ...env.payload,
            loots: [{ item: "battle_points", count: 1 }],
          },
        }),
        "acc-A"
      ),
      "check",
    ],
    [
      "改成新版本重建（envelope 與 payload 一致地改成 9）",
      bs.parsePendingEnvelope(
        JSON.stringify({
          ...env,
          baseRev: 9,
          payload: { ...env.payload, base_rev: 9 },
        }),
        "acc-A"
      ),
      "check",
    ],
    [
      "多一個欄位",
      bs.parsePendingEnvelope(
        JSON.stringify({ ...env, updatedAt: 1 }),
        "acc-A"
      ),
      "envelope-keys",
    ],
    [
      "payload 多一個欄位",
      bs.parsePendingEnvelope(
        JSON.stringify({ ...env, payload: { ...env.payload, gold: 1 } }),
        "acc-A"
      ),
      "payload-keys",
    ],
    ["不是字串", bs.parsePendingEnvelope({ ...env }, "acc-A"), "size"],
  ];
  check(
    "待確認：換帳號、舊版本號、格式名稱、不是 JSON、超長、request_id 或內容被改、改成新版本、多欄位、不是字串都要人工確認（不重建可送的請求）",
    variants.every(
      ([, r, want]) => !r.ok && r.reason === "needs-review" && r.detail === want
    ),
    variants
      .filter(([, r, want]) => r.ok || r.detail !== want)
      .map(([n, r]) => [n, r])
  );
  // 檢查碼只偵測損壞、不是祕密：內容自洽（檢查碼照格式重算）的舊版或別帳號資料，仍要靠版本與帳號本身的核對擋下
  const recheck = (e) => {
    const { check: _old, ...b } = e;
    void _old;
    const c = bs.accountFingerprint(
      JSON.stringify([
        b.schema,
        b.version,
        b.account,
        b.requestId,
        b.stageId,
        b.battleId,
        b.baseRev,
        b.payload,
      ])
    );
    return JSON.stringify({ ...b, check: c });
  };
  const consistent = [
    [
      "自洽的舊版本號 0",
      bs.parsePendingEnvelope(recheck({ ...env, version: 0 }), "acc-A"),
      "version",
    ],
    [
      "自洽的其他格式名稱",
      bs.parsePendingEnvelope(recheck({ ...env, schema: "other" }), "acc-A"),
      "version",
    ],
    [
      "自洽的別帳號資料",
      bs.parsePendingEnvelope(recheck({ ...env }), "acc-B"),
      "account",
    ],
    [
      "對照：照原樣重算檢查碼仍可解析",
      bs.parsePendingEnvelope(recheck({ ...env }), "acc-A"),
      null,
    ],
  ];
  check(
    "待確認：檢查碼重算、內容自洽的舊版本號、其他格式名稱、別帳號資料，仍因版本或帳號要人工確認（對照組照原樣可解析）",
    consistent.every(([, r, want]) =>
      want === null ? r.ok : !r.ok && r.detail === want
    ),
    consistent.map(([n, r]) => [n, r.ok ? "ok" : r.detail])
  );
  const otherArmed = bs.armSettle({ ...ARM, requestId: "cv-req-2" }).armed;
  check(
    "待確認：這一場與請求的 id 不同時不序列化",
    bs.makePendingEnvelope(otherArmed, p.request) === null
  );

  // 建構與解析用和 prepareSettle 相同的嚴格內容規則（寫死的 payload，不經過 prepareSettle）
  const LOSE_OK = P({
    result: "LOSE",
    stars_earned: 0,
    kills: 4,
    time_seconds: 50,
    loots: [{ item: "battle_points", count: 10 }],
  });
  const badPayloads = [
    ["勝利 0 星", P({ stars_earned: 0 }), "result"],
    ["落敗 3 星", { ...LOSE_OK, stars_earned: 3 }, "result"],
    [
      "落敗 11 點",
      { ...LOSE_OK, loots: [{ item: "battle_points", count: 11 }] },
      "result",
    ],
    [
      "落敗 0 點（傳輸層合法，待確認不收）",
      { ...LOSE_OK, loots: [{ item: "battle_points", count: 0 }] },
      "result",
    ],
    [
      "多一個私有欄位",
      { ...P(), private_note: "DUMMY_PRIVATE_VALUE" },
      "payload-keys",
    ],
    ["負的 kills", P({ kills: -1 }), "counts"],
    ["舊契約 1", P({ settle_contract: 1 }), "contract"],
    [
      "loots 兩筆",
      P({
        loots: [
          { item: "battle_points", count: 1120 },
          { item: "battle_points", count: 5 },
        ],
      }),
      "loots",
    ],
  ];
  const makerRows = badPayloads.map(([name, payload]) => [
    name,
    bs.makePendingEnvelope(armed, {
      requestId: "cv-req-1",
      baseRev: 7,
      payload,
    }),
  ]);
  const makerOk = [P(), LOSE_OK].map((payload) =>
    bs.makePendingEnvelope(armed, {
      requestId: "cv-req-1",
      baseRev: 7,
      payload,
    })
  );
  check(
    "待確認建構：勝利 0 星、落敗有星、落敗 11 點或 0 點、多私有欄位、負 kills、舊契約、loots 兩筆都不序列化（回 null，不先存額外資料）；合法的勝利與落敗照樣序列化",
    makerRows.every(([, r]) => r === null) &&
      makerOk.every((r) => typeof r === "string" && !r.includes("DUMMY")),
    { makerRows, makerOk }
  );
  const parserRows = badPayloads.map(([name, payload, want]) => {
    const r = bs.parsePendingEnvelope(recheck({ ...env, payload }), "acc-A");
    return [name, r.ok ? "ok" : r.detail, want];
  });
  const parserOk = [P(), LOSE_OK].map((payload) =>
    bs.parsePendingEnvelope(recheck({ ...env, payload }), "acc-A")
  );
  check(
    "待確認解析：同樣的不合法內容用重算檢查碼的自洽資料直接解析，都要人工確認且原因正確（result／payload-keys／counts／contract／loots）；合法的勝利與落敗可解析",
    parserRows.every(([, got, want]) => got === want) &&
      parserOk.every((r) => r.ok),
    { parserRows, parserOk: parserOk.map((r) => (r.ok ? "ok" : r.detail)) }
  );
}

// ── 伺服器行為（strict fixture；不是正式後端） ──
{
  const fx = createProfileFixture({
    heroesConfig: [{ hero_id: "guan_yu", cost: 5 }],
  });
  const base = {
    nickname: "結算",
    level: 1,
    exp: 0,
    gold: 500,
    capacity: 11,
    max_stage: "chapter1_3",
    heroes: [],
    team: [],
  };
  fx.seed("acc-A", base, 7);
  const send = (req) =>
    fx.handle({
      action: "save_result",
      key: "acc-A",
      payload: clone(req.payload),
    });
  const first = bs.prepareSettle(armed, CTX(), R());
  const r1 = send(first.request);
  const after1 = fx.read("acc-A");
  const r2 = send(first.request);
  const after2 = fx.read("acc-A");
  check(
    "同一場：第一次 200（rev 8、點數 +1120、經驗 110）；原樣重送 duplicate、存檔不變（只發一次）；重玩已解鎖的 chapter1_2 進度不倒退（仍 chapter1_3）",
    r1.status === 200 &&
      r1.rev === 8 &&
      after1.data.gold === 1620 &&
      after1.data.exp === 10 &&
      after1.data.level === 2 &&
      after1.data.max_stage === "chapter1_3" &&
      r2.status === 200 &&
      r2.duplicate === true &&
      same(after2, after1),
    { r1, r2, after1: after1.data }
  );
  const reused = bs.prepareSettle(
    armed,
    CTX(),
    R({ kills: 13, loots: [{ item: "battle_points", count: 1130 }] })
  );
  const r3 = send(reused.request);
  check(
    "同一個 request_id 不同內容：409 REQUEST_ID_REUSED、存檔不變",
    r3.status === 409 &&
      r3.error === "REQUEST_ID_REUSED" &&
      same(fx.read("acc-A"), after1),
    r3
  );
  fx.handle({
    action: "save_profile",
    key: "acc-A",
    payload: { data: { ...after1.data, nickname: "別處改" }, base_rev: 8 },
  });
  const armed2 = bs.armSettle({
    ...ARM,
    battleId: "battle_2",
    requestId: "cv-req-2",
    baseRev: 8,
  }).armed;
  const second = bs.prepareSettle(
    armed2,
    { ...CTX() },
    R({ battle_id: "battle_2" })
  );
  const r4 = send(second.request);
  const after4 = fx.read("acc-A");
  check(
    "舊版本的新一場：200＋base_mismatch、沒有 rev（已結算、要讀回）；套在最新資料上只加一次",
    r4.status === 200 &&
      r4.base_mismatch === true &&
      r4.rev === undefined &&
      after4.rev === 10 &&
      after4.data.gold === 2740 &&
      after4.data.nickname === "別處改",
    { r4, after4: after4.data }
  );
  const fx2 = createProfileFixture({ heroesConfig: [] });
  const old = Array.from({ length: 30 }, (_, i) => ({
    id: `old${i}`,
    log_id: `l${i}`,
    rev: 20 + i + 1,
    prev_rev: 20 + i,
    c: 2,
    fp: "x",
    reward: {},
    after: {},
  }));
  fx2.seed("acc-A", base, 51, { results: old, trimmedRev: 19 });
  const unknown = fx2.handle({
    action: "save_result",
    key: "acc-A",
    payload: clone(first.request.payload),
  });
  check(
    "被擠出去重紀錄的舊結算（base_rev 7 ≤ 19）：409 RESULT_UNKNOWN、不套用",
    unknown.status === 409 &&
      unknown.error === "RESULT_UNKNOWN" &&
      fx2.read("acc-A").rev === 51,
    unknown
  );
}

const failed = results.filter((r) => !r.pass).length;
console.log("RESULT_JSON " + JSON.stringify({ total: results.length, failed }));
process.exit(failed ? 1 : 0);
