// 神馬三國回歸分層：快速／相關／完整。依序執行（不平行），記錄每一步的耗時
// 用法：
//   node scripts/shenma-regression/tools/run-tier.mjs quick
//   node scripts/shenma-regression/tools/run-tier.mjs related <功能...>   例：related save-conflict backup-preview
//   node scripts/shenma-regression/tools/run-tier.mjs full
//   node scripts/shenma-regression/tools/run-tier.mjs list              列出功能與對應的瀏覽器腳本
// - quick：型別檢查、神馬三國與地圖編輯器的 ESLint、Node 測試（store、後端讀取的自動重試、戰鬥結算獎勵規則、飛行敵人與對空規則、出征前的對空準備、
//   飛行路線無效與優先飛行選項、地面路線沒有路程與戰場內的下一波、關卡能不能出征與敵人攻擊力／免疫減速、備份檔、武將列表篩選、
//   地圖編輯器的錯誤說明、敵人表的移動方式欄判斷、地圖資訊保存判斷、地圖資料檢查與波次保存判斷、
//   跨來源隔離開機腳本）、harness 雜訊規則、
//   工具自我測試、素材引用檢查、Godot 反向驗證的變異原文檢查（只讀原始碼）。不需要 dev server 與 Godot
// - related：quick 之後，只跑指定功能的瀏覽器腳本；full：quick 之後跑全部瀏覽器腳本（約 35 分鐘）
//   瀏覽器腳本需要 npm run dev 與 PLAYWRIGHT_DIR（見 README）；Godot 端另外用 godot-check.sh
// - EVIDENCE_DIR：瀏覽器腳本的證據目錄，耗時摘要寫在 <EVIDENCE_DIR>/tier-<層>.json（沒有設定時只印出）
// - 跑瀏覽器腳本時不要同時改 src、跑 build 或另一批瀏覽器回歸
import { mkdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";

const QUICK = [
  ["型別檢查（tsc）", npx, ["tsc", "--noEmit", "-p", "tsconfig.json"]],
  [
    "ESLint（神馬三國、地圖編輯器、共用元件）",
    npx,
    [
      "eslint",
      "src/app/(games)/shenmaSanguo",
      "src/app/(tools)/mapEditor",
      "src/components",
    ],
  ],
  [
    "玩家存檔 store 測試",
    "node",
    ["scripts/shenma-regression/web/player-store.test.mjs"],
  ],
  [
    "後端讀取的自動重試與遊戲設定載入測試",
    "node",
    ["scripts/shenma-regression/web/read-retry.test.mjs"],
  ],
  [
    "戰鬥結算獎勵規則測試",
    "node",
    ["scripts/shenma-regression/web/battle-reward.test.mjs"],
  ],
  [
    "飛行敵人與對空規則測試",
    "node",
    ["scripts/shenma-regression/web/anti-air.test.mjs"],
  ],
  [
    "出征前的對空準備提醒測試",
    "node",
    ["scripts/shenma-regression/web/air-readiness.test.mjs"],
  ],
  [
    "飛行路線無效、優先飛行選項與拒絕開戰提示測試",
    "node",
    ["scripts/shenma-regression/web/flight-route.test.mjs"],
  ],
  [
    "地面路線沒有路程與戰場內下一波的規則測試",
    "node",
    ["scripts/shenma-regression/web/next-wave.test.mjs"],
  ],
  [
    "關卡能不能出征與敵人攻擊力、免疫減速的規則測試",
    "node",
    ["scripts/shenma-regression/web/stage-data.test.mjs"],
  ],
  [
    "備份檔讀取與驗證測試",
    "node",
    ["scripts/shenma-regression/web/backup-file.test.mjs"],
  ],
  [
    "武將列表搜尋、篩選與排序測試",
    "node",
    ["scripts/shenma-regression/web/hero-filter.test.mjs"],
  ],
  [
    "地圖編輯器設定寫入的錯誤說明測試",
    "node",
    ["scripts/shenma-regression/web/admin-error-text.test.mjs"],
  ],
  [
    "地圖編輯器敵人表的移動方式欄判斷測試",
    "node",
    ["scripts/shenma-regression/web/movement-column.test.mjs"],
  ],
  [
    "地圖編輯器的地圖資訊保存判斷、地圖資料檢查與波次保存判斷測試",
    "node",
    ["scripts/shenma-regression/web/map-editor-data.test.mjs"],
  ],
  [
    "跨來源隔離開機腳本測試",
    "node",
    ["scripts/shenma-regression/web/site-isolation.test.mjs"],
  ],
  [
    "工具自我測試",
    "node",
    [
      "scripts/shenma-regression/tools/selftest.mjs",
      "public/games/shenmaSanguo",
    ],
  ],
  [
    "素材引用檢查",
    "node",
    ["scripts/shenma-regression/tools/check-assets.mjs"],
  ],
  [
    "harness 已知雜訊規則的正反案例",
    "node",
    ["scripts/shenma-regression/tools/harness-noise.test.mjs"],
  ],
  [
    "Godot 反向驗證的變異原文檢查（不啟動 Godot）",
    "node",
    ["scripts/shenma-regression/tools/godot-mutation.mjs", "check"],
  ],
];

// 功能 → 瀏覽器腳本（改到哪些功能就跑哪幾組；README 有「改了什麼 → 跑哪幾組」的對照）
const AREAS = {
  account: {
    what: "登入、建檔、切換帳號、手動同步、補送與升級恢復",
    scripts: ["i1-init.js", "r4-web.js", "r5-web.js", "r7-web.js"],
  },
  "save-conflict": {
    what: "存檔版本保護、衝突比較與處理、衝突備份匯出與預覽、地圖編輯器的管理密碼（兩個分頁）",
    scripts: ["save-conflict-web.js"],
  },
  "backup-preview": {
    what: "離線備份檔預覽（設定頁，唯讀）",
    scripts: ["backup-preview-web.js"],
  },
  "read-retry": {
    what: "後端讀取的自動重試：連線失敗、平台錯誤頁、逾時、回應較慢的說明，寫入只送一次（兩個戰鬥入口）",
    scripts: ["read-retry-web.js"],
  },
  "save-dialog": {
    what: "存檔比較與備份檔預覽的鍵盤操作（對話框名稱、Tab 留在視窗裡、Esc、處理中不能關閉、焦點歸還與退路）",
    scripts: ["save-dialog-keyboard-web.js"],
  },
  "battle-tips": {
    what: "戰場的玩法提示：兩個戰鬥入口的位置（不疊在遊戲畫面上）、開關與收起、記住收起、不暫停戰鬥（需要 Godot 產物）",
    scripts: ["battle-tips-web.js"],
  },
  "map-editor": {
    what: "地圖編輯器的素材、頁面說明與分頁操作（管理密碼在 save-conflict）；既有地圖的名稱／章節／解鎖條件保存與讀回、地圖資料檢查、素材轉換下載、載入與保存回應晚到時保留較新的草稿、波次以讀回的內容為保存基準（可用 GAS_BACKEND 換成模擬試算表上的後端程式）",
    scripts: ["map-editor-web.js", "map-editor-save-web.js"],
  },
  "battle-flow": {
    what: "開戰、切關、自動下一波、勝敗結算、戰鬥中的帳號與場次隔離（需要 Godot 產物）",
    scripts: [
      "i2-lifecycle.js",
      "auto-timer.js",
      "normal-flows.js",
      "r3-mixed.js",
      "r8-web.js",
      "r9-web.js",
    ],
  },
  "engine-version": {
    what: "遊戲版本不相符的提示與重試（需要舊版產物，見 README）",
    scripts: ["r10-web.js"],
  },
  isolation: {
    what: "跨來源隔離只留給 bgRemover、舊狀態遷移",
    scripts: ["r13-web.js"],
  },
  skills: {
    what: "武將技能（馬超的首擊加倍、趙雲的閃避、黃忠、周瑜、關羽的減速光環、劉備的防禦光環、張飛的暈眩、魏延的吸血、曹操的攻速光環、夏侯惇的反擊、廖化的堅韌、顏良的威壓、孫尚香的連射、龐統的連環計、諸葛亮的呼風喚雨、呂布的戰神、魯肅的補給）：趙雲在兩個入口實際擋路受擊，逐次核對閃避的判定；關羽在兩個入口實際部署，核對光環範圍內地面敵人的速度與免疫、飛行不受影響；劉備在兩個入口實際部署，核對友軍每擊的實際扣血、移出隊伍後恢復與單位面板的防禦；張飛在兩個入口實際部署，核對暈眩區間裡沒有攻擊、暈眩後照常攻擊與劉備的加成；魏延在兩個入口實際部署擋路受擊，逐次核對恢復量（實際傷害的 15%、不超過最大生命）與暫停後重新點選的面板生命值；曹操在兩個入口實際部署，核對範圍內友軍每次冷卻的攻擊間隔（÷ 1.15）、範圍外不變與面板的攻擊間隔；夏侯惇在兩個入口實際部署擋路受擊，核對每次被打的實扣與反彈（實扣的 20%）、反彈次數與攻擊次數相符與暫停後重新點選的面板生命值；廖化在兩個入口實際部署擋路受擊，逐擊核對受傷前生命不高於 30% 時防禦計算後的傷害乘 0.8、跨過門檻的那一擊不減傷與門檻前後重新點選的面板狀態；顏良在兩個入口實際部署在擋路武將旁，核對範圍內敵人每次攻擊用的攻擊力（× 0.9）與擋路武將的扣血、備戰時拖到遠處後不再降低；孫尚香在兩個入口實際部署，用正式的機率與真正的亂數觀察到追加與沒有追加的攻擊、追加後暫停時的「+1」，核對抽亂數次數＝攻擊次數、紀錄與敵人被打掉的生命一致；龐統在兩個入口實際部署，核對每次攻擊傳遞 2 次（50%、25%）、三個木樁依序被打掉的生命、選取面板的規則與暫停時停住；諸葛亮在兩個入口實際部署，核對每次攻擊以主目標為中心打到最多 4 名（各 50%）、第 5 名不受傷、六個木樁被打掉的生命、選取面板與鍵盤／窄矮畫面的說明、暫停時風雨圈停住；呂布在兩個入口實際部署，核對三次擊殺的那一擊依序是 125、131.25、137.5（不提前加成）、3 層後跨波每擊 143.75、加層提示與暫停、選取面板的基礎與目前攻擊力；魯肅在兩個入口實際部署，核對只部署甘寧時每次擊殺 +5、部署魯肅後每次 +6、戰鬥金幣與 update_stats 和畫面一致、選取面板寫明選取時生效中（需要 Godot 產物）",
    scripts: [
      "r12-web.js",
      "r14-web.js",
      "r15-web.js",
      "skill-slow-aura-web.js",
      "skill-dodge-web.js",
      "skill-def-aura-web.js",
      "skill-stun-web.js",
      "skill-lifesteal-web.js",
      "skill-atk-speed-web.js",
      "skill-counter-web.js",
      "skill-tenacity-web.js",
      "skill-atk-down-web.js",
      "skill-double-shot-web.js",
      "skill-chain-web.js",
      "skill-storm-web.js",
      "skill-berserk-web.js",
      "skill-supply-web.js",
    ],
  },
  heroes: {
    what: "武將列表的搜尋、職業篩選與排序（主頁武將視窗、武將頁），升級後重新排序與切換帳號後重算；法師與遊戲不認得的職業／稀有度的顯示；武將列表與詳情的鍵盤操作（主頁備戰與戰鬥中、獨立武將頁：對話框名稱、Tab 留在最上層、卡片 Enter／空白鍵、Esc 只關最上層與焦點歸還、搜尋無結果與卡片卸載的退路、升級處理中焦點掉到頁面本身、設定載入中的列表外殼與最後的退路、獨立武將頁每一步等焦點穩定後兩個方向連續循環與邊界、卡片按鈕裡沒有區塊與互動元素；需要 Godot 產物）",
    scripts: [
      "hero-filter-web.js",
      "team-filter-web.js",
      "hero-keyboard-web.js",
    ],
  },
  team: {
    what: "隊伍編排的搜尋、職業篩選與排序（主頁隊伍視窗、隊伍頁）：只篩選可選武將、槽位照常、依 hero_id 入隊、容量、鍵盤、切換帳號、寫入限制；主頁隊伍編排與遊戲設定的對話框鍵盤（名稱、Tab 留在視窗裡、Esc、焦點歸還與退路、槽位操作後的焦點、儲存與寫入限制）、隊伍編排開著時結算卡在最上層（需要 Godot 產物）",
    scripts: ["team-filter-web.js", "hud-keyboard-web.js"],
  },
  "hero-category": {
    what: "地圖編輯器武將表的稀有度／職業選單（遊戲的值、不認得的值保留原值）",
    scripts: ["hero-category-web.js"],
  },
  settle: {
    what: "戰鬥結算的完整獎勵：真 Godot 勝敗結算、回應遺失與重新確認、重新整理時在途、結算中改隊伍（需要 Godot 產物；可用 GAS_BACKEND 換成模擬後端）；結算資料異常時兩個入口的畫面與出口；主頁結算卡是對話框（隊伍編排等視窗開著時在最上層、Esc 不關閉）",
    scripts: ["settle-web.js", "settle-invalid-web.js", "hud-keyboard-web.js"],
  },
  flying: {
    what: "飛行敵人與對空：示範關的敵軍預覽標記、武將詳情／部署選單／單位面板的對空說明、兩個入口實際部署後扣血或不扣血與結算、390 寬與鍵盤、地圖編輯器敵人表的移動方式（需要 Godot 產物）",
    scripts: ["flying-web.js"],
  },
  "enemy-column": {
    what: "地圖編輯器敵人表的移動方式欄：未載入、載入失敗、有欄／缺欄 × 空表／有資料、舊後端無法確認、刪光再新增、讀取後表頭被移除（可用 GAS_BACKEND 換成模擬試算表上的後端程式）",
    scripts: ["enemy-column-web.js"],
  },
  "air-readiness": {
    what: "出征前的對空準備提醒：兩個關卡選擇入口與敵軍預覽、換隊伍即時更新、缺敵人設定、390 寬與鍵盤、不阻擋出征（需要 Godot 產物）",
    scripts: ["air-readiness-web.js"],
  },
  "wave-reject": {
    what: "拒絕開戰後的出口：主頁（桌面與 390×844）從提示的「切換關卡」打開關卡選擇，原本提示範圍內的有效關卡用 hit-test 確認在最上層並用真實滑鼠點擊換關；取消選關、Esc、再開；獨立戰鬥頁返回關卡選擇後換關；不結算、資源不變。另外全程用鍵盤：關卡選擇的對話框名稱、Tab 留在視窗內、Esc 只關最上層（巢狀的敵軍預覽先關）、焦點歸還、換關；玩家資訊視窗（對話框名稱、Tab 留在視窗內、Esc、切換金鑰表單的開合、從玩家資訊打開關卡選擇再取消或換關）與「選擇其他關卡」入口的鍵盤取消（需要 Godot 產物）",
    scripts: [
      "wave-reject-exit-web.js",
      "stage-keyboard-web.js",
      "player-info-keyboard-web.js",
    ],
  },
  "air-first": {
    what: "飛行路線無效與防禦塔「優先飛行」：兩個關卡選擇入口的提醒與預覽和實際出兵一致、兩個戰鬥入口選塔切換並觀察攻擊／減速目標、拒絕開戰的提示與出口、390 寬與鍵盤（需要 Godot 產物）",
    scripts: ["air-first-web.js"],
  },
  "next-wave": {
    what: "戰場內的下一波：兩個戰鬥入口從備戰到最後一波、開著視窗跨波、飛行／純地面／缺波次／無效組／數量未知、不改暫停自動倍率也不送命令、換關與新場關閉、390 寬與鍵盤；地面路線沒有路程的拒絕開戰與預覽（需要 Godot 產物）",
    scripts: ["next-wave-web.js"],
  },
  "stage-preview": { what: "攻速成長、關卡敵軍預覽", scripts: ["r16-web.js"] },
  "stage-data": {
    what: "關卡資料未完成的入口：兩個關卡選擇入口的卡片（尚未開放／尚未解鎖）、主頁與獨立戰鬥頁直接進入時不送關卡資料並說明原因與出口、在有效戰場點尚未開放的關卡不改變目前的戰場、快速連點、重玩、遊戲設定讀取失敗與重試、390 寬（需要 Godot 產物）",
    scripts: ["stage-data-web.js"],
  },
  "enemy-traits": {
    what: "敵人設定的對武將攻擊力與免疫減速：敵軍預覽與戰場內的下一波的顯示、兩個戰鬥入口實際部署受擊（快照核對攻擊力、免疫、減速倍率與扣血）、390 寬（需要 Godot 產物）",
    scripts: ["enemy-traits-web.js"],
  },
  "floating-ui": {
    what: "全站浮動入口在神馬三國視窗上的隱藏、敵軍預覽鍵盤操作、防禦塔目標優先",
    scripts: ["r17-web.js"],
  },
  "battle-layout": {
    what: "戰場適應視窗、備戰拆除防禦塔",
    scripts: ["r18-web.js"],
  },
  "speed-pause": {
    what: "戰鬥速度 1×／2×、部署慢速、手動暫停",
    scripts: ["r19-web.js", "r20-web.js"],
  },
  artifacts: {
    what: "瀏覽器實際取得的遊戲產物與網路統計",
    scripts: ["artifacts-and-network.js"],
  },
};
// 完整回歸的順序（和 README 的清單相同，新的腳本接在最後）
const FULL = [
  "i1-init.js",
  "i2-lifecycle.js",
  "auto-timer.js",
  "normal-flows.js",
  "r3-mixed.js",
  "r4-web.js",
  "r5-web.js",
  "r7-web.js",
  "r8-web.js",
  "r9-web.js",
  "r10-web.js",
  "r12-web.js",
  "r13-web.js",
  "r14-web.js",
  "r15-web.js",
  "r16-web.js",
  "artifacts-and-network.js",
  "r17-web.js",
  "r18-web.js",
  "r19-web.js",
  "r20-web.js",
  "save-conflict-web.js",
  "backup-preview-web.js",
  "map-editor-web.js",
  "skill-slow-aura-web.js",
  "hero-filter-web.js",
  "team-filter-web.js",
  "hero-category-web.js",
  "settle-web.js",
  "settle-invalid-web.js",
  "flying-web.js",
  "enemy-column-web.js",
  "air-readiness-web.js",
  "air-first-web.js",
  "next-wave-web.js",
  "skill-dodge-web.js",
  "stage-data-web.js",
  "enemy-traits-web.js",
  "wave-reject-exit-web.js",
  "stage-keyboard-web.js",
  "skill-def-aura-web.js",
  "skill-stun-web.js",
  "player-info-keyboard-web.js",
  "skill-lifesteal-web.js",
  "skill-atk-speed-web.js",
  "skill-counter-web.js",
  "skill-tenacity-web.js",
  "skill-atk-down-web.js",
  "hero-keyboard-web.js",
  "skill-double-shot-web.js",
  "hud-keyboard-web.js",
  "read-retry-web.js",
  "save-dialog-keyboard-web.js",
  "battle-tips-web.js",
  "skill-chain-web.js",
  "skill-storm-web.js",
  "skill-berserk-web.js",
  "skill-supply-web.js",
];

const [mode, ...rest] = process.argv.slice(2);
if (mode === "list" || !["quick", "related", "full"].includes(mode)) {
  console.log(
    "用法：run-tier.mjs quick | related <功能...> | full | list\n\n功能（related 的參數）："
  );
  for (const [k, v] of Object.entries(AREAS))
    console.log(
      `  ${k.padEnd(15)} ${v.scripts.join(" ")}\n  ${"".padEnd(15)} ${v.what}`
    );
  process.exit(mode === "list" ? 0 : 2);
}
let browserScripts = [];
if (mode === "related") {
  const unknown = rest.filter((a) => !AREAS[a]);
  if (rest.length === 0 || unknown.length) {
    console.error(
      `related 需要功能名稱${unknown.length ? "；不認得：" + unknown.join("、") : ""}（run-tier.mjs list 列出全部）`
    );
    process.exit(2);
  }
  browserScripts = [...new Set(rest.flatMap((a) => AREAS[a].scripts))].sort(
    (a, b) => FULL.indexOf(a) - FULL.indexOf(b)
  );
} else if (mode === "full") {
  browserScripts = FULL;
}

const steps = [];
const runStep = (name, cmd, args) => {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32" && cmd === npx,
  });
  const step = {
    name,
    seconds: Math.round((Date.now() - t0) / 100) / 10,
    ok: r.status === 0,
  };
  steps.push(step);
  console.log(`${step.ok ? "PASS" : "FAIL"}  ${name}  ${step.seconds}s`);
  return step.ok;
};

const t0 = Date.now();
for (const [name, cmd, args] of QUICK) runStep(name, cmd, args);
if (browserScripts.length) {
  // 一次啟動瀏覽器、依序跑（同一個 browser context，第一支必須是 harness.js）；每支的耗時在執行器的輸出裡
  runStep(
    `瀏覽器腳本 ${browserScripts.length} 支：${browserScripts.join(" ")}`,
    "node",
    [
      "scripts/shenma-regression/tools/run-browser.mjs",
      "harness.js",
      ...browserScripts,
    ]
  );
}
const summary = {
  mode,
  areas: mode === "related" ? rest : undefined,
  steps,
  totalSeconds: Math.round((Date.now() - t0) / 1000),
  allPass: steps.every((s) => s.ok),
};
console.log(
  `\n${summary.allPass ? "全部通過" : "有失敗"}：${mode}，共 ${summary.totalSeconds} 秒`
);
if (process.env.EVIDENCE_DIR) {
  mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(process.env.EVIDENCE_DIR, `tier-${mode}.json`),
    JSON.stringify(summary, null, 2) + "\n"
  );
}
process.exit(summary.allPass ? 0 : 1);
