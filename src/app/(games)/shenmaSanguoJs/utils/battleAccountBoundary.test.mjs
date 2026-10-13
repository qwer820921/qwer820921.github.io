// 神馬三國 JS 版換帳號後的舊場守門（純 Node、不連網）
// - 用真正的 utils/battleAccountBoundary.ts（isCurrentAccount、guestRewardAllowed、heroDeployAllowed）；期待值照 Round98 的規則手寫，不由被測的程式產生：
//   一般的當場身份要兩邊都是已選帳號（訪客或共用帳號）、模式相同、金鑰是非空字串而且原樣相同、帳號世代是已知的合法整數（0 也算）而且相同、不在載入中
// - 另外用 TypeScript AST 從 components/shenmaSanguoJsPage.tsx 取出實際的 onBattleEnded 回呼、handlePlaceHero 與 currentAccountOf 原文
//   （轉成 JS 後執行）。它們用到的 React 狀態、ref、store、bridge 與既有的 settleBattle 都是這裡的假物件（只記呼叫次數與參數）；
//   證據等級是「頁面實際的函式＋受控的輸入」，不是 React 生命週期或正常入口（正常入口另由瀏覽器契約測試第 36 段驗收）
// - AUTO 的出征原因純函式 sortieBlockReasonOf、Bridge 的唯讀查詢 getControlState 與頁面實際的 handleToggleAuto（真 Engine／BattleManager；受控的開戰、清波、暫停與時間推進都標明）
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

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ═══ AUTO：出征原因的純函式、Bridge 的唯讀查詢、頁面實際的 handleToggleAuto（真 Engine／BattleManager） ═══
// 期待照 auto-proposal-v3 的規則手寫：新開（實際沒開）在備戰或戰鬥中要出征原因是 null；關（實際已開）不看出征原因；暫停中開關都不動；
// 其他階段照原本行為。受控：開戰用 BattleManager 既有的 playerStartBattle、清波用既有的 onWaveAllEnemiesDead、暫停直接設 manualPaused、
// 自動下一波的時間用 gameLoop 推進；store 是假物件（getter 計數）；renderer 是什麼都不畫的物件。
// handleToggleAuto 用 AST 從頁面取出；它可能用到的畫面值（stats、這次 render 的 sortieBlockReason、statsRef）都給「晚一拍」的假值，
// 證明真正的判斷不看它們
// 遊戲迴圈結尾的 requestAnimationFrame 換成不排程的空函式（只在 Node 測試裡）
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
const { BattleEngine } = require(join(HERE, "../engine/BattleEngine.ts"));
const { GameState } = require(join(HERE, "../engine/BattleManager.ts"));
const { LocalGameBridge } = require(join(HERE, "../engine/LocalGameBridge.ts"));
const R_UNSUP = "雲端的出征隊伍這裡還不支援：暫時不能出征";
const R_EMPTY = "還沒有出征隊伍：請先到「隊伍」編排並保存";
const TEAM1 = [{ hero_id: "ma_chao", slot: 1 }];

// ── A1. 純函式 sortieBlockReasonOf ──
const reasonCases = [
  [
    "訪客：隊伍不支援的旗標或空隊伍都不算（null）",
    { mode: "guest", player: { team: [] }, teamEditable: false },
    null,
  ],
  [
    "還沒選帳號（none）→ null",
    { mode: "none", player: null, teamEditable: true },
    null,
  ],
  [
    "共用帳號但還沒有玩家資料（player 是 null）→ null（先判 player）",
    { mode: "shared", player: null, teamEditable: false },
    null,
  ],
  [
    "共用帳號、雲端隊伍不支援（有隊伍）→「雲端的出征隊伍這裡還不支援：暫時不能出征」",
    { mode: "shared", player: { team: TEAM1 }, teamEditable: false },
    R_UNSUP,
  ],
  [
    "共用帳號、隊伍不支援而且是空隊伍 → 隊伍不支援優先",
    { mode: "shared", player: { team: [] }, teamEditable: false },
    R_UNSUP,
  ],
  [
    "共用帳號、可編輯但空隊伍 →「還沒有出征隊伍：請先到「隊伍」編排並保存」",
    { mode: "shared", player: { team: [] }, teamEditable: true },
    R_EMPTY,
  ],
  [
    "共用帳號、可編輯有隊伍 → null",
    { mode: "shared", player: { team: TEAM1 }, teamEditable: true },
    null,
  ],
  [
    "共用帳號有隊伍、可編輯，唯讀／保存中／待確認／設定未就緒／練習／載入中等其他欄位都不擴大（null）",
    {
      mode: "shared",
      player: { team: TEAM1, key: "test_auto_a" },
      teamEditable: true,
      readOnly: true,
      busy: true,
      writeBlocked: "x",
      pendingSettle: { battleId: "b0" },
      isLoading: true,
      practice: true,
    },
    null,
  ],
];
for (const [name, st, want] of reasonCases) {
  const got = B.sortieBlockReasonOf(st);
  check(`出征原因（純函式）：${name}`, got === want, { got, want });
}
/** 會記下每次讀了哪個欄位的假 store 狀態（玩家資料也記） */
function countingState(base) {
  const reads = [];
  const player =
    base.player === null
      ? null
      : new Proxy(base.player, {
          get: (t, p) => (reads.push(`player.${String(p)}`), t[p]),
        });
  const state = new Proxy(
    { ...base, player },
    { get: (t, p) => (reads.push(String(p)), t[p]) }
  );
  return { state, reads };
}
{
  const { state, reads } = countingState({
    mode: "shared",
    player: { team: [], key: "test_auto_a", heroes: [] },
    teamEditable: true,
    readOnly: true,
    busy: true,
    isLoading: true,
    pendingSettle: null,
  });
  const got = B.sortieBlockReasonOf(state);
  const allowed = new Set(["mode", "player", "teamEditable", "player.team"]);
  check(
    "出征原因（純函式）：只讀 mode、player、teamEditable 與 player.team（其他欄位讀取 0 次）",
    got === R_EMPTY && reads.every((r) => allowed.has(r)),
    { got, reads }
  );
}

// ── A2. 真 Engine＋Bridge 唯讀查詢 ──
const AUTO_PATH = {
  cols: 14,
  rows: 10,
  paths: {
    path_a: [
      [0, 3],
      [13, 3],
    ],
  },
  base: [13, 3],
  build_zones: [[2, 1]],
};
const AUTO_WAVE = (wave) => ({
  wave,
  enemies: [{ enemy_id: "e_slow", count: 1, interval: 1, path: "path_a" }],
});
function autoEngine(battleId) {
  const e = new BattleEngine({
    init() {},
    resize() {},
    render() {},
    destroy() {},
  });
  e.loadStage({
    stageId: "chapter1_1",
    battleId,
    totalWaves: 3,
    pathJson: JSON.stringify(AUTO_PATH),
    waves: [AUTO_WAVE(1), AUTO_WAVE(2), AUTO_WAVE(3)],
    heroesConfig: [],
    enemiesConfig: [{ enemy_id: "e_slow", hp: 1000000, speed: 0.01, atk: 1 }],
  });
  e.lastTimestamp = 1000;
  // Bridge 用原型建立（不跑建構子的 DOM 部分），engine 指到這個真引擎；getControlState／toggleAuto 都是 Bridge 實際的方法
  const bridge = Object.create(LocalGameBridge.prototype);
  bridge.engine = e;
  return { e, bm: e.battleManager, bridge };
}
const ctl = (bm) => ({
  battleId: bm.battleId,
  state: bm.gameState,
  wave: bm.currentWave,
  auto: bm.autoMode,
  pending: bm.autoWavePending,
  paused: bm.manualPaused,
});
{
  const { e, bm, bridge } = autoEngine("q1");
  let synced = 0;
  e.onStatsUpdated = () => synced++;
  const before = ctl(bm);
  const a = bridge.getControlState();
  const b = bridge.getControlState();
  check(
    "Bridge 唯讀查詢：回傳新的純值 battleId／phase／auto／paused（四個鍵、等於 BattleManager 當下、每次是新物件、值都不是物件）",
    same(Object.keys(a).sort(), ["auto", "battleId", "paused", "phase"]) &&
      a.battleId === "q1" &&
      a.phase === GameState.PREP &&
      a.auto === false &&
      a.paused === false &&
      a !== b &&
      Object.values(a).every((v) => v === null || typeof v !== "object"),
    { a }
  );
  a.auto = true;
  a.paused = true;
  a.phase = GameState.BATTLE;
  a.battleId = "x";
  check(
    "Bridge 唯讀查詢：改回傳值不影響 BattleManager；查詢本身零副作用（沒有同步通知、狀態不變）",
    same(ctl(bm), before) &&
      synced === 0 &&
      bridge.getControlState().auto === false,
    { now: ctl(bm), before, synced }
  );
}

// ── A3. 頁面實際的 handleToggleAuto ──
const foundA = { handleToggleAuto: [] };
(function walkA(n) {
  if (
    ts.isVariableDeclaration(n) &&
    ts.isIdentifier(n.name) &&
    n.name.text === "handleToggleAuto" &&
    n.initializer
  )
    foundA.handleToggleAuto.push(n.initializer);
  ts.forEachChild(n, walkA);
})(sf);
check(
  "取出頁面的 handleToggleAuto（剛好一個）",
  foundA.handleToggleAuto.length === 1,
  { count: foundA.handleToggleAuto.length }
);
const SHARED_OK = {
  mode: "shared",
  player: { team: TEAM1, key: "test_auto_a" },
  teamEditable: true,
};
const SHARED_UNSUP = {
  mode: "shared",
  player: { team: TEAM1, key: "test_auto_b" },
  teamEditable: false,
};
const SHARED_EMPTY = {
  mode: "shared",
  player: { team: [], key: "test_auto_c" },
  teamEditable: true,
};
const GUEST = {
  mode: "guest",
  player: { team: TEAM1, key: "guest_auto" },
  teamEditable: true,
};
/**
 * 用真 Engine 的 Bridge 跑一次頁面的 handleToggleAuto。store：getState 回 storeState（記讀取欄位）；
 * view：這次 render 的畫面值（stats、sortieBlockReason、statsRef），刻意可以和實際不同（晚一拍）
 */
function pressAuto(env, storeState, view = {}) {
  const { state, reads } = countingState(storeState);
  const stats = view.stats ?? {
    auto_mode: false,
    game_state: GameState.PREP,
    paused: false,
  };
  const deps = {
    bridgeRef: { current: env.bridge },
    useJsPlayerStore: { getState: () => state },
    sortieBlockReasonOf: B.sortieBlockReasonOf,
    GameState,
    stats,
    statsRef: { current: stats },
    sortieBlockReason: view.sortieBlockReason ?? null,
  };
  const names = Object.keys(deps);
  const f = new Function(
    ...names,
    `${js(foundA.handleToggleAuto[0])}\nreturn __f;`
  )(...names.map((n) => deps[n]));
  let toggles = 0;
  const orig = env.bridge.toggleAuto;
  env.bridge.toggleAuto = function () {
    toggles++;
    return orig.call(this);
  };
  f();
  env.bridge.toggleAuto = orig;
  const allowed = new Set(["mode", "player", "teamEditable", "player.team"]);
  return { toggles, reads, readsOk: reads.every((r) => allowed.has(r)) };
}
/** 推進遊戲時間直到條件成立（最多 limit 次 gameLoop，每次 62.5ms） */
function advance(env, cond, limit = 400) {
  for (let i = 0; i < limit; i++) {
    if (cond()) return i;
    env.e.gameLoop(env.e.lastTimestamp + 62.5);
  }
  return cond() ? limit : -1;
}
const STALE_PREP = {
  auto_mode: false,
  game_state: GameState.PREP,
  paused: false,
};

// #1、#2：備戰新開（訪客、共用帳號正常）→ 立刻開下一波
for (const [label, st] of [
  ["訪客", GUEST],
  ["共用帳號、隊伍正常", SHARED_OK],
]) {
  const env = autoEngine(`a1_${label}`);
  const r = pressAuto(env, st);
  const c = ctl(env.bm);
  check(
    `自動 #1／#2（頁面實際函式）：備戰、實際沒開，${label} → 開，立刻開第 1 波（同一場、戰鬥中）`,
    r.toggles === 1 &&
      c.auto === true &&
      c.state === GameState.BATTLE &&
      c.wave === 1 &&
      c.battleId === `a1_${label}` &&
      r.readsOk,
    { r, c }
  );
}
// #3：備戰新開，隊伍不支援／沒有隊伍 → 不開，什麼都不變
for (const [label, st] of [
  ["雲端隊伍不支援", SHARED_UNSUP],
  ["沒有出征隊伍", SHARED_EMPTY],
]) {
  const env = autoEngine(`a3_${label}`);
  const before = ctl(env.bm);
  const r = pressAuto(env, st);
  check(
    `自動 #3：備戰、實際沒開，${label} → 不呼叫 toggleAuto，battleId／階段／波次／自動／排程都不變（不開波）`,
    r.toggles === 0 && same(ctl(env.bm), before) && r.readsOk,
    { r, now: ctl(env.bm), before }
  );
}
// #4：畫面是甲（隊伍正常、原因 null），store 已是隊伍不支援的乙 → 用 store 當下的值，不開
{
  const env = autoEngine("a4");
  const before = ctl(env.bm);
  const r = pressAuto(env, SHARED_UNSUP, {
    stats: STALE_PREP,
    sortieBlockReason: null,
  });
  check(
    "自動 #4：這次 render 的出征原因是 null（舊畫面），store 當下是隊伍不支援 → 不開、不開波",
    r.toggles === 0 && same(ctl(env.bm), before),
    { r, now: ctl(env.bm) }
  );
}
// #5：畫面是乙（原因有值、按鈕停用），store 已恢復正常 → 受控呼叫 onClick 照常開
{
  const env = autoEngine("a5");
  const r = pressAuto(env, SHARED_OK, {
    stats: STALE_PREP,
    sortieBlockReason: R_UNSUP,
  });
  const c = ctl(env.bm);
  check(
    "自動 #5：這次 render 的出征原因是隊伍不支援（舊畫面），store 當下已正常 → 受控呼叫照常開、開第 1 波（不新增限制）",
    r.toggles === 1 && c.auto === true && c.state === GameState.BATTLE,
    { r, c }
  );
}
// #6：戰鬥中新開（隊伍正常）→ 開、這一波照常，清波後排下一波（不立刻開）
{
  const env = autoEngine("a6");
  env.bm.playerStartBattle();
  const r = pressAuto(env, SHARED_OK, {
    stats: { auto_mode: false, game_state: GameState.BATTLE, paused: false },
  });
  const c1 = ctl(env.bm);
  env.bm.onWaveAllEnemiesDead();
  const c2 = ctl(env.bm);
  check(
    "自動 #6：戰鬥中、實際沒開、隊伍正常 → 開（仍是第 1 波，不立刻開下一波）；受控清波後留在戰鬥中並排下一波",
    r.toggles === 1 &&
      c1.auto === true &&
      c1.state === GameState.BATTLE &&
      c1.wave === 1 &&
      c2.state === GameState.BATTLE &&
      c2.pending === true &&
      c2.wave === 1,
    { r, c1, c2 }
  );
}
// #7：戰鬥中新開，隊伍不支援 → 不開；清波後回備戰
{
  const env = autoEngine("a7");
  env.bm.playerStartBattle();
  const r = pressAuto(env, SHARED_UNSUP, {
    stats: { auto_mode: false, game_state: GameState.BATTLE, paused: false },
  });
  const c1 = ctl(env.bm);
  env.bm.onWaveAllEnemiesDead();
  const c2 = ctl(env.bm);
  check(
    "自動 #7：戰鬥中、實際沒開、隊伍不支援 → 不開；受控清波後回備戰、不排下一波",
    r.toggles === 0 &&
      c1.auto === false &&
      c2.state === GameState.PREP &&
      c2.pending === false,
    { r, c1, c2 }
  );
}
// #8：實際已開、畫面還是沒開（舊 render），store 隊伍不支援 → 照常關（關不看出征原因）
for (const phase of ["PREP", "BATTLE"]) {
  const env = autoEngine(`a8_${phase}`);
  if (phase === "BATTLE") env.bm.playerStartBattle();
  env.bm.autoMode = true; // 受控：實際已開（畫面還沒同步）
  const r = pressAuto(env, SHARED_UNSUP, {
    stats: { auto_mode: false, game_state: GameState[phase], paused: false },
    sortieBlockReason: R_UNSUP,
  });
  const c = ctl(env.bm);
  check(
    `自動 #8：${phase === "PREP" ? "備戰" : "戰鬥中"}、實際已開但畫面是沒開，store 隊伍不支援 → 照常關（不讀出征原因阻擋）`,
    r.toggles === 1 && c.auto === false,
    { r, c }
  );
}
// #9：戰鬥中已排下一波（清波後仍是戰鬥中）→ 關：取消排程並回備戰
{
  const env = autoEngine("a9");
  env.bm.playerStartBattle();
  env.bridge.toggleAuto();
  env.bm.onWaveAllEnemiesDead();
  const c0 = ctl(env.bm);
  const r = pressAuto(env, SHARED_UNSUP, {
    stats: { auto_mode: true, game_state: GameState.BATTLE, paused: false },
  });
  const c1 = ctl(env.bm);
  check(
    "自動 #9：戰鬥中已排下一波（auto 開、排程中）→ 關：取消排程、回備戰（store 隊伍不支援也照關）",
    c0.state === GameState.BATTLE &&
      c0.pending === true &&
      r.toggles === 1 &&
      c1.auto === false &&
      c1.pending === false &&
      c1.state === GameState.PREP,
    { c0, r, c1 }
  );
}
// #10：暫停中開關都不動
for (const on of [false, true]) {
  const env = autoEngine(`a10_${on}`);
  if (on) env.bm.autoMode = true;
  env.bm.manualPaused = true; // 受控：暫停
  const before = ctl(env.bm);
  const r = pressAuto(env, SHARED_OK, {
    stats: { auto_mode: on, game_state: GameState.PREP, paused: false },
  });
  check(
    `自動 #10：暫停中、實際${on ? "已開" : "沒開"}（畫面還是沒暫停）→ 不呼叫 toggleAuto、什麼都不變`,
    r.toggles === 0 && same(ctl(env.bm), before) && r.reads.length === 0,
    { r, now: ctl(env.bm), before }
  );
}
// #11、#12：不擴大限制
for (const [label, st] of [
  [
    "共用帳號唯讀、保存中、待確認、設定未就緒、練習（隊伍正常）",
    {
      ...SHARED_OK,
      readOnly: true,
      busy: true,
      writeBlocked: "x",
      pendingSettle: { battleId: "b0" },
      practice: true,
    },
  ],
  [
    "載入中、換帳號後的舊場（store 是另一把金鑰、隊伍正常）",
    {
      mode: "shared",
      player: { team: TEAM1, key: "test_auto_other" },
      teamEditable: true,
      isLoading: true,
    },
  ],
]) {
  const env = autoEngine(`a11_${label.length}`);
  const r = pressAuto(env, st);
  check(
    `自動 #11／#12：${label} → 照常開（不新增限制，只讀 mode／player／teamEditable）`,
    r.toggles === 1 && env.bm.autoMode === true && r.readsOk,
    { r, c: ctl(env.bm) }
  );
}
// #13：已開而且已排下一波，之後 store 換成隊伍不支援 → 沒有任何取消；下一波照時程開（受控：推進遊戲時間）
{
  const env = autoEngine("a13");
  env.bm.playerStartBattle();
  env.bridge.toggleAuto();
  env.bm.onWaveAllEnemiesDead();
  const c0 = ctl(env.bm);
  const n = advance(env, () => env.bm.currentWave === 2);
  const c1 = ctl(env.bm);
  check(
    "自動 #13：戰鬥中已開並排好下一波，之後換成隊伍不支援的帳號（頁面不呼叫任何東西）→ 自動仍開、下一波照時程開、同一場",
    c0.pending === true &&
      n >= 0 &&
      c1.wave === 2 &&
      c1.auto === true &&
      c1.state === GameState.BATTLE &&
      c1.battleId === "a13",
    { c0, n, c1 }
  );
}
// 其他階段：照原本行為（結算後實際沒開 → 照常呼叫 toggleAuto，不套出征原因）
{
  const env = autoEngine("a14");
  env.bm.playerStartBattle();
  env.bm.endBattle(true); // 受控：結算
  const st0 = env.bm.gameState;
  const r = pressAuto(env, SHARED_UNSUP, {
    stats: { auto_mode: false, game_state: st0, paused: false },
  });
  check(
    "自動（其他階段）：結算後實際沒開、store 隊伍不支援 → 照原本呼叫 toggleAuto（不在這案改結算後的自動規則）",
    st0 !== GameState.PREP && st0 !== GameState.BATTLE && r.toggles === 1,
    { st0, r }
  );
}
// 沒有 bridge：照舊不動
{
  const deps = {
    bridgeRef: { current: null },
    useJsPlayerStore: { getState: () => SHARED_OK },
    sortieBlockReasonOf: B.sortieBlockReasonOf,
    GameState,
  };
  const names = Object.keys(deps);
  const f = new Function(
    ...names,
    `${js(foundA.handleToggleAuto[0])}\nreturn __f;`
  )(...names.map((n) => deps[n]));
  let threw = null;
  try {
    f();
  } catch (err) {
    threw = String(err);
  }
  check("自動：沒有 bridge → 不動、不丟例外", threw === null, { threw });
}

const failed = results.filter((r) => !r.pass).length;
console.log(
  `RESULT_JSON ${JSON.stringify({ script: "battleAccountBoundary.test.mjs", pass: failed === 0, assertions: { passed: results.length - failed, total: results.length } })}`
);
process.exit(failed ? 1 : 0);
