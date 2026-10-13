// 神馬三國 JS 版換帳號後的舊場守門（純 Node、不連網）
// - 用真正的 utils/battleAccountBoundary.ts（isCurrentAccount、guestRewardAllowed、heroDeployAllowed）；期待值照 Round98 的規則手寫，不由被測的程式產生：
//   一般的當場身份要兩邊都是已選帳號（訪客或共用帳號）、模式相同、金鑰是非空字串而且原樣相同、帳號世代是已知的合法整數（0 也算）而且相同、不在載入中
// - 另外用 TypeScript AST 從 components/shenmaSanguoJsPage.tsx 取出實際的 onBattleEnded 回呼、handlePlaceHero 與 currentAccountOf 原文
//   （轉成 JS 後執行）。它們用到的 React 狀態、ref、store、bridge 與既有的 settleBattle 都是這裡的假物件（只記呼叫次數與參數）；
//   證據等級是「頁面實際的函式＋受控的輸入」，不是 React 生命週期或正常入口（正常入口另由瀏覽器契約測試第 36 段驗收）
// - 所有金鑰都是虛構的 test_*
// 用法：node "src/app/(games)/shenmaSanguoJs/utils/battleAccountBoundary.test.mjs"
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

const B = require(join(HERE, "battleAccountBoundary.ts"));

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass: !!pass });
  let shown = "";
  if (!pass && detail !== undefined) shown = `  ${JSON.stringify(detail)}`;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${shown}`);
};

// ── 1. 純函式：當場身份 ──
const G = (extra = {}) => ({
  mode: "guest",
  key: "test_guest_a",
  epoch: 3,
  ...extra,
});
const S = (extra = {}) => ({
  mode: "shared",
  key: "test_shared_a",
  epoch: 5,
  ...extra,
});
const NOW = (owner, extra = {}) => ({
  mode: owner.mode,
  key: owner.key,
  epoch: owner.epoch,
  isLoading: false,
  ...extra,
});
const identityCases = [
  ["訪客：模式、金鑰、世代都相同", G(), NOW(G()), true],
  ["共用帳號：模式、金鑰、世代都相同", S(), NOW(S()), true],
  [
    "世代 0 也是合法的世代（不因為是 0 就不算）",
    G({ epoch: 0 }),
    NOW(G({ epoch: 0 })),
    true,
  ],
  [
    "模式不同（來源是訪客，現在是共用帳號、同一把金鑰與世代）",
    G(),
    NOW(G(), { mode: "shared" }),
    false,
  ],
  ["金鑰不同", S(), NOW(S(), { key: "test_shared_b" }), false],
  [
    "同一把金鑰、新的世代（重新登入或登出再選回）",
    G(),
    NOW(G(), { epoch: 4 }),
    false,
  ],
  [
    "還沒選帳號（兩邊都是 mode none、金鑰 null）",
    { mode: "none", key: null, epoch: 2 },
    { mode: "none", key: null, epoch: 2, isLoading: false },
    false,
  ],
  [
    "模式是 none 但金鑰與世代都有值（不是已選的帳號）",
    { mode: "none", key: "test_none_x", epoch: 2 },
    { mode: "none", key: "test_none_x", epoch: 2, isLoading: false },
    false,
  ],
  ["來源的金鑰是 null", G({ key: null }), NOW(G()), false],
  ["現在沒有玩家資料（金鑰是 null）", G(), NOW(G(), { key: null }), false],
  ["兩邊金鑰都是空字串", G({ key: "" }), NOW(G({ key: "" })), false],
  ["兩邊金鑰都只有空白", G({ key: "  " }), NOW(G({ key: "  " })), false],
  [
    "金鑰前後多一個空白（不修剪，原樣比較）",
    G({ key: "test_guest_a " }),
    NOW(G()),
    false,
  ],
  ["來源的世代不明（null）", G({ epoch: null }), NOW(G()), false],
  ['世代是字串 "3"（不轉型）', G(), NOW(G(), { epoch: "3" }), false],
  ['來源的世代是字串 "3"（不轉型）', G({ epoch: "3" }), NOW(G()), false],
  ["世代是 NaN", G({ epoch: NaN }), NOW(G({ epoch: NaN })), false],
  ["世代是負數", G({ epoch: -1 }), NOW(G({ epoch: -1 })), false],
  ["世代是小數", G({ epoch: 1.5 }), NOW(G({ epoch: 1.5 })), false],
  ["現在正在載入（登入中）", G(), NOW(G(), { isLoading: true }), false],
  [
    "載入狀態不是布林 false（undefined）",
    G(),
    NOW(G(), { isLoading: undefined }),
    false,
  ],
];
for (const [name, owner, current, want] of identityCases) {
  const got = B.isCurrentAccount(owner, current);
  check(`當場身份：${name} → ${want ? "是" : "不是"}`, got === want, {
    owner,
    current,
    got,
  });
}

// 訪客的本機結算：只給訪客本人
const rewardCases = [
  ["訪客本人（同一個世代）", G(), NOW(G()), true],
  ["訪客本人、世代 0", G({ epoch: 0 }), NOW(G({ epoch: 0 })), true],
  ["共用帳號本人（不是訪客，不走本機結算）", S(), NOW(S()), false],
  ["這一場是共用帳號甲的，現在是訪客", S(), NOW(G()), false],
  ["同一個訪客登出再選回（新的世代）", G(), NOW(G(), { epoch: 4 }), false],
  [
    "這一場是訪客的，現在還沒選帳號",
    G(),
    { mode: "none", key: null, epoch: 4, isLoading: false },
    false,
  ],
  ["訪客本人但正在載入", G(), NOW(G(), { isLoading: true }), false],
];
for (const [name, owner, current, want] of rewardCases) {
  const got = B.guestRewardAllowed(owner, current);
  check(`訪客本機結算：${name} → ${want ? "給" : "不給"}`, got === want, {
    owner,
    current,
    got,
  });
}

// 派武將：這一場的來源與選單的隊伍來源都要是目前帳號
const deployCases = [
  ["這一場與選單隊伍都是目前的共用帳號", S(), S(), NOW(S()), true],
  [
    "這一場與選單隊伍都是目前的訪客（世代 0）",
    G({ epoch: 0 }),
    G({ epoch: 0 }),
    NOW(G({ epoch: 0 })),
    true,
  ],
  [
    "這一場是甲，選單隊伍與現在都是乙",
    S(),
    S({ key: "test_shared_b" }),
    NOW(S({ key: "test_shared_b" })),
    false,
  ],
  [
    "這一場與現在都是甲，選單隊伍卻是乙（選單資料過期）",
    S(),
    S({ key: "test_shared_b" }),
    NOW(S()),
    false,
  ],
  [
    "這一場與選單隊伍是甲的舊世代，現在是甲的新世代",
    S(),
    S(),
    NOW(S(), { epoch: 6 }),
    false,
  ],
  ["選單隊伍的世代不明（null）", S(), S({ epoch: null }), NOW(S()), false],
  [
    "現在還沒選帳號",
    G(),
    G(),
    { mode: "none", key: null, epoch: 4, isLoading: false },
    false,
  ],
];
for (const [name, battle, menu, current, want] of deployCases) {
  const got = B.heroDeployAllowed(battle, menu, current);
  check(`派武將：${name} → ${want ? "可以" : "不可以"}`, got === want, {
    battle,
    menu,
    current,
    got,
  });
}
check(
  "說明文字：本機結算沒有寫入",
  B.LOCAL_NOT_SAVED_TEXT ===
    "這場沒有寫入本機進度：出征後帳號來源已變更，請重新選關再出征。"
);
check(
  "說明文字：武將卡不能派",
  B.HERO_DEPLOY_BLOCKED_TEXT === "這一場是換帳號前的出征，請重新選關再派武將。"
);

// ── 2. 頁面實際的 onBattleEnded、handlePlaceHero（AST 取出原文＋受控的假依賴） ──
const PAGE = join(HERE, "../components/shenmaSanguoJsPage.tsx");
const sf = ts.createSourceFile(
  PAGE,
  readFileSync(PAGE, "utf8"),
  ts.ScriptTarget.ES2020,
  true,
  ts.ScriptKind.TSX
);
const found = { onBattleEnded: [], handlePlaceHero: [], currentAccountOf: [] };
(function walk(n) {
  if (
    ts.isBinaryExpression(n) &&
    n.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(n.left) &&
    n.left.name.text === "onBattleEnded" &&
    ts.isIdentifier(n.left.expression) &&
    n.left.expression.text === "bridge"
  )
    found.onBattleEnded.push(n.right);
  if (
    ts.isVariableDeclaration(n) &&
    ts.isIdentifier(n.name) &&
    (n.name.text === "handlePlaceHero" || n.name.text === "currentAccountOf") &&
    n.initializer
  )
    found[n.name.text].push(n.initializer);
  ts.forEachChild(n, walk);
})(sf);
check(
  "取出頁面的 bridge.onBattleEnded、handlePlaceHero、currentAccountOf（各剛好一個）",
  found.onBattleEnded.length === 1 &&
    found.handlePlaceHero.length === 1 &&
    found.currentAccountOf.length === 1,
  {
    counts: Object.fromEntries(
      Object.entries(found).map(([k, v]) => [k, v.length])
    ),
  }
);
const js = (node) =>
  ts
    .transpileModule(`const __f = ${node.getText(sf)};`, {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2020,
      },
    })
    .outputText.replace(/^"use strict";\s*/, "");
const currentAccountOf = new Function(
  `${js(found.currentAccountOf[0])}\nreturn __f;`
)();

/** 假的 store 狀態（getState 回這個物件；getAccountEpoch 回 epoch） */
const store = (mode, key, epoch, extra = {}) => {
  const calls = { settleSharedBattle: 0 };
  return {
    calls,
    mode,
    player: key === null ? null : { key },
    isLoading: false,
    teamEditable: true,
    readOnly: false,
    getAccountEpoch: () => epoch,
    settleSharedBattle: () => {
      calls.settleSharedBattle++;
      return Promise.resolve();
    },
    ...extra,
  };
};
const OWN = (mode, key, epoch) => ({ mode, key, epoch });

function runEnded({
  ctxOwner,
  st,
  result = "WIN",
  battleId = "battle_1",
  ctxBattleId = "battle_1",
}) {
  const log = { settleBattle: [], reward: [], reason: [], result: [] };
  const deps = {
    battleCtxRef: {
      current:
        ctxOwner === undefined
          ? null
          : { battleId: ctxBattleId, owner: ctxOwner },
    },
    placementMenuRef: { current: null },
    setPlacementMenu: () => {},
    setUpgradeTower: () => {},
    setHeroInfo: () => {},
    setBattleResult: (r) => log.result.push(r),
    setSettleRetryMsg: () => {},
    setLocalNotSavedReason: (v) => log.reason.push(v),
    setBattleReward: (v) => log.reward.push(v),
    useJsPlayerStore: { getState: () => st },
    guestRewardAllowed: B.guestRewardAllowed,
    currentAccountOf,
    LOCAL_NOT_SAVED_TEXT: B.LOCAL_NOT_SAVED_TEXT,
    settleBattle: (...a) => {
      log.settleBattle.push(a);
      return {
        stars: 3,
        goldEarned: 200,
        expEarned: 100,
        leveledUp: false,
        newLevel: 1,
      };
    },
    currentStageRef: { current: { map_id: "chapter1_1" } },
    statsRef: { current: { hp: 20, max_hp: 20 } },
  };
  const names = Object.keys(deps);
  const f = new Function(
    ...names,
    `${js(found.onBattleEnded[0])}\nreturn __f;`
  )(...names.map((n) => deps[n]));
  f({ battle_id: battleId, result });
  return {
    log,
    sharedCalls: st.calls.settleSharedBattle,
    lastReason: log.reason.at(-1) ?? null,
    lastReward: log.reward.at(-1),
  };
}

const e1 = runEnded({
  ctxOwner: OWN("guest", "test_guest_a", 3),
  st: store("guest", "test_guest_a", 3),
});
check(
  "結算回呼：訪客本人勝利 → 照舊呼叫 settleBattle 一次（關卡、城防），獎勵照舊、沒有說明",
  e1.log.settleBattle.length === 1 &&
    JSON.stringify(e1.log.settleBattle[0]) ===
      JSON.stringify(["chapter1_1", 20, 20]) &&
    e1.lastReward &&
    e1.lastReward.goldEarned === 200 &&
    e1.lastReason === null,
  e1
);
const e0 = runEnded({
  ctxOwner: OWN("guest", "test_guest_a", 0),
  st: store("guest", "test_guest_a", 0),
});
check(
  "結算回呼：訪客本人、世代 0 → 照舊結算",
  e0.log.settleBattle.length === 1 && e0.lastReason === null,
  e0
);
const e2 = runEnded({
  ctxOwner: OWN("guest", "test_guest_a", 3),
  st: store("guest", "test_guest_a", 4),
});
check(
  "結算回呼：同一個訪客登出再選回（新的世代）勝利 → 不呼叫 settleBattle、沒有獎勵、顯示沒有寫入本機進度的說明",
  e2.log.settleBattle.length === 0 &&
    e2.lastReward === null &&
    e2.lastReason === B.LOCAL_NOT_SAVED_TEXT,
  e2
);
const e3 = runEnded({
  ctxOwner: OWN("shared", "test_shared_a", 5),
  st: store("guest", "test_guest_a", 6),
});
check(
  "結算回呼：共用帳號甲的那一場、現在是訪客 → 不呼叫 settleBattle、不呼叫共用結算、顯示說明",
  e3.log.settleBattle.length === 0 &&
    e3.sharedCalls === 0 &&
    e3.lastReward === null &&
    e3.lastReason === B.LOCAL_NOT_SAVED_TEXT,
  e3
);
const e4 = runEnded({
  ctxOwner: OWN("guest", "test_guest_a", 3),
  st: store("none", null, 4),
});
check(
  "結算回呼：訪客的那一場、現在還沒選帳號 → 不呼叫 settleBattle、顯示說明",
  e4.log.settleBattle.length === 0 && e4.lastReason === B.LOCAL_NOT_SAVED_TEXT,
  e4
);
const e5 = runEnded({
  ctxOwner: OWN("guest", "test_guest_a", 3),
  st: store("guest", "test_guest_a", 3, { isLoading: true }),
});
check(
  "結算回呼：訪客本人但正在載入 → 不呼叫 settleBattle、顯示說明",
  e5.log.settleBattle.length === 0 && e5.lastReason === B.LOCAL_NOT_SAVED_TEXT,
  e5
);
const e6 = runEnded({
  ctxOwner: OWN("guest", "test_guest_a", 3),
  st: store("guest", "test_guest_a", 3),
  result: "LOSE",
});
check(
  "結算回呼：訪客本人落敗 → 照舊不結算、沒有獎勵，也沒有換帳號的說明",
  e6.log.settleBattle.length === 0 &&
    e6.lastReward === null &&
    e6.lastReason === null,
  e6
);
const e6b = runEnded({
  ctxOwner: OWN("shared", "test_shared_a", 5),
  st: store("guest", "test_guest_a", 6),
  result: "LOSE",
});
check(
  "結算回呼：換帳號後落敗 → 不結算、不顯示說明（落敗本來就沒有本機獎勵）",
  e6b.log.settleBattle.length === 0 && e6b.lastReason === null,
  e6b
);
const e7 = runEnded({
  ctxOwner: OWN("guest", "test_guest_a", 3),
  st: store("shared", "test_shared_a", 7),
});
check(
  "結算回呼：現在是共用帳號 → 照舊交給共用結算一次，不呼叫 settleBattle、不顯示本機說明",
  e7.sharedCalls === 1 &&
    e7.log.settleBattle.length === 0 &&
    e7.lastReason === null,
  e7
);
const e8 = runEnded({
  ctxOwner: OWN("guest", "test_guest_a", 3),
  st: store("guest", "test_guest_a", 3),
  battleId: "battle_old",
});
check(
  "結算回呼：別場（舊場次晚到）的結果 → 什麼都不做",
  e8.log.result.length === 0 &&
    e8.log.settleBattle.length === 0 &&
    e8.log.reason.length === 0,
  e8
);
check(
  "結算回呼：每次收到這一場的結果都先清掉舊的說明（第一個 setLocalNotSavedReason 是 null）",
  e2.log.reason[0] === null && e1.log.reason.length === 1,
  { e1: e1.log.reason, e2: e2.log.reason }
);

function runPlace({ ctxOwner, menuOwner, st, menuOpen = true }) {
  const log = { placeHero: [], placed: 0 };
  const deps = {
    bridgeRef: {
      current: {
        isDeployMenuOpen: () => menuOpen,
        placeHero: (...a) => {
          log.placeHero.push(a);
          return true;
        },
      },
    },
    battleCtxRef: {
      current:
        ctxOwner === undefined
          ? null
          : { battleId: "battle_1", owner: ctxOwner },
    },
    heroDeployAllowed: B.heroDeployAllowed,
    activeTeamRef: { current: { heroes: [], owner: menuOwner } },
    currentAccountOf,
    useJsPlayerStore: { getState: () => st },
    setPlacedHeroIds: () => {
      log.placed++;
    },
  };
  const names = Object.keys(deps);
  const f = new Function(
    ...names,
    `${js(found.handlePlaceHero[0])}\nreturn __f;`
  )(...names.map((n) => deps[n]));
  const ok = f({ battleId: "battle_1", menuId: 1 }, 3, 3, {
    hero_id: "hero_ma_chao",
  });
  return { ok, log };
}

const A5 = OWN("shared", "test_shared_a", 5);
const p1 = runPlace({
  ctxOwner: A5,
  menuOwner: A5,
  st: store("shared", "test_shared_a", 5),
});
check(
  "派武將：這一場、選單隊伍、現在都是甲 → 照舊派出一次、更新名單",
  p1.ok === true && p1.log.placeHero.length === 1 && p1.log.placed === 1,
  p1
);
const p2 = runPlace({
  ctxOwner: A5,
  menuOwner: OWN("shared", "test_shared_b", 6),
  st: store("shared", "test_shared_b", 6),
});
check(
  "派武將：這一場是甲、現在是乙 → 不派（placeHero 0 次）、不改名單、回 false",
  p2.ok === false && p2.log.placeHero.length === 0 && p2.log.placed === 0,
  p2
);
const p3 = runPlace({
  ctxOwner: A5,
  menuOwner: A5,
  st: store("shared", "test_shared_b", 6),
});
check(
  "派武將：頁面的隊伍快照還沒更新（仍是甲），store 已經是乙 → 用 store 的值，不派",
  p3.ok === false && p3.log.placeHero.length === 0 && p3.log.placed === 0,
  p3
);
const p4 = runPlace({
  ctxOwner: A5,
  menuOwner: A5,
  st: store("shared", "test_shared_a", 6),
});
check(
  "派武將：同一把金鑰、store 已是新的世代（登入失敗或重新登入）→ 不派",
  p4.ok === false && p4.log.placeHero.length === 0,
  p4
);
const p5 = runPlace({
  ctxOwner: A5,
  menuOwner: OWN("shared", "test_shared_b", 6),
  st: store("shared", "test_shared_a", 5),
});
check(
  "派武將：這一場與現在是甲，選單的隊伍來源卻是乙 → 不派",
  p5.ok === false && p5.log.placeHero.length === 0,
  p5
);
const p6 = runPlace({
  ctxOwner: A5,
  menuOwner: A5,
  st: store("shared", "test_shared_a", 5, { isLoading: true }),
});
check(
  "派武將：甲本人但正在載入 → 不派",
  p6.ok === false && p6.log.placeHero.length === 0,
  p6
);
const p7 = runPlace({
  ctxOwner: OWN("guest", "test_guest_a", 3),
  menuOwner: OWN("none", null, 4),
  st: store("none", null, 4),
});
check(
  "派武將：還沒選帳號 → 不派",
  p7.ok === false && p7.log.placeHero.length === 0,
  p7
);
const p8 = runPlace({
  ctxOwner: A5,
  menuOwner: A5,
  st: store("shared", "test_shared_a", 5),
  menuOpen: false,
});
check(
  "派武將：選單已經不是開著的這一個 → 照舊不派（原本的選單守門）",
  p8.ok === false && p8.log.placeHero.length === 0,
  p8
);
const p9 = runPlace({
  ctxOwner: undefined,
  menuOwner: A5,
  st: store("shared", "test_shared_a", 5),
});
check(
  "派武將：還沒有任何一場 → 不派",
  p9.ok === false && p9.log.placeHero.length === 0,
  p9
);

const failed = results.filter((r) => !r.pass).length;
console.log(
  `RESULT_JSON ${JSON.stringify({ script: "battleAccountBoundary.test.mjs", pass: failed === 0, assertions: { passed: results.length - failed, total: results.length } })}`
);
process.exit(failed ? 1 : 0);
