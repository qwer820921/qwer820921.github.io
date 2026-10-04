// 神馬三國回歸分層：快速／相關／完整。依序執行（不平行），記錄每一步的耗時
// 用法：
//   node scripts/shenma-regression/tools/run-tier.mjs quick
//   node scripts/shenma-regression/tools/run-tier.mjs related <功能...>   例：related save-conflict backup-preview
//   node scripts/shenma-regression/tools/run-tier.mjs full
//   node scripts/shenma-regression/tools/run-tier.mjs list              列出功能與對應的瀏覽器腳本
// - quick：型別檢查、神馬三國與地圖編輯器的 ESLint、Node 測試（store、後端讀取的自動重試、戰鬥結算獎勵規則、飛行敵人與對空規則、出征前的對空準備、
//   飛行路線無效與優先飛行選項、地面路線沒有路程與戰場內的下一波、戰況觀測、關卡能不能出征與敵人攻擊力／免疫減速、備份檔、武將列表篩選、
//   地圖編輯器的錯誤說明、敵人表的移動方式欄判斷、地圖資訊保存判斷、地圖資料檢查與波次保存判斷、
//   跨來源隔離開機腳本）、harness 雜訊規則、
//   工具自我測試、素材引用檢查、Godot 反向驗證的變異原文檢查（只讀原始碼）。不需要 dev server 與 Godot
// - related：quick 之後，只跑指定功能的瀏覽器腳本；full：quick 之後跑全部瀏覽器腳本（開發模式約 60～90 分鐘）
//   瀏覽器腳本需要 npm run dev 與 PLAYWRIGHT_DIR（見 README）；Godot 端另外用 godot-check.sh
// - plan：只列出計畫，不執行。相對基準（--base，預設 HEAD；含未提交與未追蹤的檔案）的每個改動檔案 → 對應的測試、
//   要不要完整一次與理由、預估耗時；沒有規則的「未分類」檔案明確列出（結束碼 3），規則在 change-plan.mjs
// - changed：照 plan 執行（快速一層＋選出的瀏覽器腳本）；有未分類的檔案時不執行，除非 --areas 補上或 --allow-unclassified。
//   Godot、匯出與建置只列出、不在這裡執行
// - 所有模式都會引用「相同內容已通過」的結果（快速一層用全部來源，瀏覽器腳本用產品來源＋它自己＋harness，
//   再加上開發／靜態匯出與 out/、ENGINE_DIR 的內容、後端模組連同它匯入的檔案與後端程式、Playwright 版本、
//   實際的瀏覽器版本與有沒有顯示視窗、只跑一部分的選段），並記錄新的通過；失敗、中斷、沒有斷言的都不記錄。
//   完整的執行只引用完整的紀錄，只跑一部分（MAP_EDITOR_ONLY 等）的結果只給同樣的選段引用；
//   有設定卻算不出內容的環境輸入時整次不引用也不記錄（印出原因）。--no-cache 關閉
// - --browser-only：不跑快速一層，只跑瀏覽器腳本（開發中補跑用；最終驗收仍要跑快速一層）
// - SHENMA_TIER_RUNNER：瀏覽器執行器（預設 tools/run-browser.mjs；自我測試換成不開瀏覽器的替身）
// - EVIDENCE_DIR：瀏覽器腳本的證據目錄，耗時摘要寫在 <EVIDENCE_DIR>/tier-<層>.json（沒有設定時只印出）
// - 跑瀏覽器腳本時不要同時改 src、跑 build 或另一批瀏覽器回歸
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PREREQ,
  QUICK_SECONDS,
  browserEnv,
  browserFingerprint,
  cacheKey,
  digestOf,
  gitChanges,
  makePlan,
  openCache,
  quickEnv,
  reusable,
  sourceBlobs,
} from "./change-plan.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
// 工具自我測試用的交付產物：網站入口的版本目錄（入口指回舊正式版時用最後一個保留的版本目錄；見 tools/game-release.mjs）
const RELEASE = JSON.parse(
  readFileSync(
    join(ROOT, "src/app/(games)/shenmaSanguo/utils/gameRelease.json"),
    "utf8"
  )
);
const PACKAGE_DIR = `public/games/shenmaSanguo-v/${
  RELEASE.entry === "legacy" ? RELEASE.retained.at(-1) : RELEASE.entry
}`;

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
    "戰況觀測的驗證、採用規則與敵軍分頁測試",
    "node",
    ["scripts/shenma-regression/web/battle-observation.test.mjs"],
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
    "兩位武將比較的規則測試",
    "node",
    ["scripts/shenma-regression/web/hero-compare.test.mjs"],
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
    ["scripts/shenma-regression/tools/selftest.mjs", PACKAGE_DIR],
  ],
  [
    "回歸工具暫存目錄清理的正反案例（只清自己建立且通過的目錄、路徑保護）",
    "node",
    ["scripts/shenma-regression/tools/temp-dir.test.mjs"],
  ],
  [
    "發布目錄核對（舊正式版目錄沒有改、版本目錄自我一致、網站入口指向保留中的目錄）",
    "node",
    ["scripts/shenma-regression/tools/game-release.mjs", "check"],
  ],
  [
    "發布工具測試（核對、發布、回退指標的正反案例）",
    "node",
    ["scripts/shenma-regression/tools/game-release.test.mjs"],
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
  [
    "匯出後處理的 Service Worker 與外殼頁測試（版本完整性、核對後交付、重新驗證、引擎快取）",
    "node",
    ["scripts/shenma-regression/tools/postexport.test.mjs"],
  ],
  [
    "回歸選測與結果快取的自我測試",
    "node",
    ["scripts/shenma-regression/tools/change-plan.test.mjs"],
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
  "engine-load": {
    what: "主頁載入畫面的遊戲引擎進度：下載大小、停住時的重新載入、引擎無法啟動與缺少 WebGL2 的說明（需要 Godot 產物）",
    scripts: ["engine-load-web.js"],
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
    what: "武將技能（馬超的首擊加倍、趙雲的閃避、黃忠、周瑜、關羽的減速光環、劉備的防禦光環、張飛的暈眩、魏延的吸血、曹操的攻速光環、夏侯惇的反擊、廖化的堅韌、顏良的威壓、孫尚香的連射、龐統的連環計、諸葛亮的呼風喚雨、呂布的戰神、魯肅的補給、許褚的怪力、典韋的護衛、孫權的守護、甘寧的奇襲、貂蟬的魅惑）：趙雲在兩個入口實際擋路受擊，逐次核對閃避的判定；關羽在兩個入口實際部署，核對光環範圍內地面敵人的速度與免疫、飛行不受影響；劉備在兩個入口實際部署，核對友軍每擊的實際扣血、移出隊伍後恢復與單位面板的防禦；張飛在兩個入口實際部署，核對暈眩區間裡沒有攻擊、暈眩後照常攻擊與劉備的加成；魏延在兩個入口實際部署擋路受擊，逐次核對恢復量（實際傷害的 15%、不超過最大生命）與暫停後重新點選的面板生命值；曹操在兩個入口實際部署，核對範圍內友軍每次冷卻的攻擊間隔（÷ 1.15）、範圍外不變與面板的攻擊間隔；夏侯惇在兩個入口實際部署擋路受擊，核對每次被打的實扣與反彈（實扣的 20%）、反彈次數與攻擊次數相符與暫停後重新點選的面板生命值；廖化在兩個入口實際部署擋路受擊，逐擊核對受傷前生命不高於 30% 時防禦計算後的傷害乘 0.8、跨過門檻的那一擊不減傷與門檻前後重新點選的面板狀態；顏良在兩個入口實際部署在擋路武將旁，核對範圍內敵人每次攻擊用的攻擊力（× 0.9）與擋路武將的扣血、備戰時拖到遠處後不再降低；孫尚香在兩個入口實際部署，用正式的機率與真正的亂數觀察到追加與沒有追加的攻擊、追加後暫停時的「+1」，核對抽亂數次數＝攻擊次數、紀錄與敵人被打掉的生命一致；龐統在兩個入口實際部署，核對每次攻擊傳遞 2 次（50%、25%）、三個木樁依序被打掉的生命、選取面板的規則與暫停時停住；諸葛亮在兩個入口實際部署，核對每次攻擊以主目標為中心打到最多 4 名（各 50%）、第 5 名不受傷、六個木樁被打掉的生命、選取面板與鍵盤／窄矮畫面的說明、暫停時風雨圈停住；呂布在兩個入口實際部署，核對三次擊殺的那一擊依序是 125、131.25、137.5（不提前加成）、3 層後跨波每擊 143.75、加層提示與暫停、選取面板的基礎與目前攻擊力；魯肅在兩個入口實際部署，核對只部署甘寧時每次擊殺 +5、部署魯肅後每次 +6、戰鬥金幣與 update_stats 和畫面一致、選取面板寫明選取時生效中；許褚在兩個入口站在路上擋路，核對每次推動是沿原路退半格（索引不變、剩餘路程增加實際退距）、PUSH、相鄰兩次推動的戰鬥時間 3 秒以上（2× 時也是）與選取面板剩下的冷卻；典韋在兩個入口站在擋路的甘寧旁邊，核對每次承擔是甘寧防禦後傷害的 20%、兩人扣血守恆、GUARD、選取面板與暫停時不承擔；孫權在兩個入口部署在打不到敵人的地方，核對 5 隻漏城依序扣 1、1、1、1、0、城防旁的「守護 −20%」、勝利結算與確認後只送一次的 save_result、重新整理後讀回；甘寧在兩個入口實際部署，核對第一擊必殺木樁（普通 122＋補扣 99877、攻擊 1 次）、第 2 波的草人每擊 122 不再必殺、選取面板用過了沒有、結算與確認後只送一次、重新整理後讀回；貂蟬在兩個入口實際部署，核對猛兵受控（暫停時控制時間與位置不變）、受控的猛兵打倒草人（擊殺與金幣只算一次、只剩受控者時不提早結束）、受控期間貂蟬不打它、選取面板的冷卻、結算與確認後只送一次、重新整理後讀回（需要 Godot 產物）",
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
      "skill-knockback-web.js",
      "skill-guard-web.js",
      "skill-base-guard-web.js",
      "skill-assassinate-web.js",
      "skill-charm-web.js",
    ],
  },
  heroes: {
    what: "武將列表的搜尋、職業篩選與排序（主頁武將視窗、武將頁），升級後重新排序與切換帳號後重算；法師與遊戲不認得的職業／稀有度的顯示；武將列表與詳情的鍵盤操作（主頁備戰與戰鬥中、獨立武將頁：對話框名稱、Tab 留在最上層、卡片 Enter／空白鍵、Esc 只關最上層與焦點歸還、搜尋無結果與卡片卸載的退路、升級處理中焦點掉到頁面本身、設定載入中的列表外殼與最後的退路、獨立武將頁每一步等焦點穩定後兩個方向連續循環與邊界、卡片按鈕裡沒有區塊與互動元素；兩位武將的比較（比較模式、比較表、升級後照目前存檔、鍵盤與手機）；需要 Godot 產物）",
    scripts: [
      "hero-filter-web.js",
      "team-filter-web.js",
      "hero-keyboard-web.js",
      "hero-compare-web.js",
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
    what: "戰場適應視窗、備戰拆除防禦塔；手機的矮畫面上選取面板不擋暫停與繼續、拆除確認點得到、Esc 關閉面板（兩個入口 390×600、320×568、740×360；需要 Godot 產物）",
    scripts: ["r18-web.js", "panel-safe-web.js"],
  },
  "speed-pause": {
    what: "戰鬥速度 1×／2×、部署慢速、手動暫停",
    scripts: ["r19-web.js", "r20-web.js"],
  },
  artifacts: {
    what: "瀏覽器實際取得的遊戲產物與網路統計",
    scripts: ["artifacts-and-network.js"],
  },
  bgm: {
    what: "背景音樂不在啟動必載的資料包裡：game_ready 之前沒有請求、收到關卡資料（音效開著）後下載一次、換關沿用、音效關閉不下載、404 不影響遊戲而且最多試 2 次（需要 Godot 產物）",
    scripts: ["bgm-load-web.js"],
  },
  release: {
    what: "發布入口：兩個入口都開網站入口指標的版本目錄、開戰到結算、背景音樂與手機尺寸，沒有碰舊正式版目錄（需要 Godot 產物）",
    scripts: ["release-entry-web.js"],
  },
  "battle-live": {
    what: "戰況觀測：武將面板不重新點選就看到目前的生命與技能狀態、「戰況」的武將技能與敵軍查看（分頁、離場、受控、鍵盤、390×600）、舊的與上一場的觀測不採用、舊版遊戲退回選取時的快照；武將的技能狀態篩選（冷卻中、本場已用過、無特殊技能）；單位面板只屬於目前這一場（需要 Godot 產物）",
    scripts: ["battle-live-web.js", "panel-scope-web.js"],
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
  "map-editor-save-web.js",
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
  "skill-knockback-web.js",
  "engine-load-web.js",
  "skill-guard-web.js",
  "skill-base-guard-web.js",
  "skill-assassinate-web.js",
  "skill-charm-web.js",
  "battle-live-web.js",
  "panel-scope-web.js",
  "bgm-load-web.js",
  "panel-safe-web.js",
  "release-entry-web.js",
  "hero-compare-web.js",
];

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  argv.splice(i, 1);
  return true;
};
const option = (name) => {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const noCache = flag("--no-cache");
const browserOnly = flag("--browser-only");
const RUNNER =
  process.env.SHENMA_TIER_RUNNER ||
  "scripts/shenma-regression/tools/run-browser.mjs";
const forceFull = flag("--full");
const allowUnclassified = flag("--allow-unclassified");
const base = option("--base") || "HEAD";
const extraAreas = (option("--areas") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const [mode, ...rest] = argv;
const MODES = ["quick", "related", "full", "plan", "changed"];
if (mode === "list" || !MODES.includes(mode)) {
  console.log(
    "用法：run-tier.mjs quick | related <功能...> | full | plan | changed | list\n" +
      "  plan／changed 的選項：--base <ref>（預設 HEAD）、--areas a,b（另外加功能）、--full、--allow-unclassified；\n" +
      "  所有模式：--no-cache（不引用、也不記錄通過的結果）\n\n功能（related 與 --areas 的參數）："
  );
  for (const [k, v] of Object.entries(AREAS))
    console.log(
      `  ${k.padEnd(15)} ${v.scripts.join(" ")}\n  ${"".padEnd(15)} ${v.what}`
    );
  process.exit(mode === "list" ? 0 : 2);
}
const unknownAreas = [...rest, ...extraAreas].filter((a) => !AREAS[a]);
if (unknownAreas.length) {
  console.error(
    `不認得的功能：${unknownAreas.join("、")}（run-tier.mjs list 列出全部）`
  );
  process.exit(2);
}

// ── 選測計畫（plan／changed）──
let plan = null;
if (mode === "plan" || mode === "changed") {
  let changes;
  try {
    changes = gitChanges(ROOT, base);
  } catch {
    console.error(`讀不到相對 ${base} 的改動（基準不存在或不是 git 工作樹）`);
    process.exit(2);
  }
  plan = makePlan(changes, {
    areas: AREAS,
    full: FULL,
    suite: join(ROOT, "scripts/shenma-regression"),
    extraAreas,
    forceFull: !!forceFull,
  });
  const min = (s) => `${Math.round(s / 6) / 10} 分鐘`;
  console.log(
    `改動（相對 ${base}，含未提交與未追蹤）：${plan.files.length} 個`
  );
  for (const f of plan.files)
    console.log(
      `  ${f.status} ${f.path}\n      → ${f.why}${f.tests && f.tests.length ? `：${f.tests.join(" ")}` : ""}${f.note ? `（${f.note}）` : ""}`
    );
  console.log(`\n快速一層：一次（約 ${QUICK_SECONDS} 秒）`);
  console.log(
    plan.browser.full
      ? `瀏覽器：完整 ${plan.browser.scripts.length} 支（約 ${min(plan.browser.seconds)}）；理由：\n    ${plan.browser.reasons.join("\n    ")}`
      : `瀏覽器：${plan.browser.scripts.length} 支（約 ${min(plan.browser.seconds)}，完整約 ${min(plan.browser.fullSeconds)}）${plan.browser.scripts.length ? "：" + plan.browser.scripts.join(" ") : ""}`
  );
  console.log(
    plan.godot.full
      ? `Godot：完整檢查（godot-check.sh，約 ${min(plan.godot.seconds)}）；理由：\n    ${plan.godot.reasons.join("\n    ")}`
      : "Godot：不需要"
  );
  if (plan.export.needed)
    console.log(
      `遊戲產物：${plan.export.reasons.join("；")}（verify-export.mjs）`
    );
  if (plan.build.needed)
    console.log(
      `建置：npm run build 後用 serve-out 跑一次；${plan.build.reasons.join("；")}`
    );
  console.log(
    `預估合計：約 ${min(plan.estimateSeconds)}（瀏覽器的秒數是 2026-10-03 完整回歸的實測，只供比較）`
  );
  if (plan.review.length)
    console.log(`\n要人判斷：\n  ${plan.review.join("\n  ")}`);
  if (plan.unknown.length) {
    console.log(
      `\n未分類（沒有對應的測試規則，需要選擇：加 --areas、改用 --full，或確認不影響後加 --allow-unclassified）：\n  ${plan.unknown.join("\n  ")}`
    );
  }
  if (process.env.EVIDENCE_DIR) {
    mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      join(process.env.EVIDENCE_DIR, `plan.json`),
      JSON.stringify({ base, ...plan }, null, 2) + "\n"
    );
  }
  if (mode === "plan") process.exit(plan.unknown.length ? 3 : 0);
  if (plan.unknown.length && !allowUnclassified) {
    console.error("\n有未分類的改動，這次不執行（見上方）");
    process.exit(3);
  }
  if (plan.godot.full || plan.build.needed || plan.export.needed)
    console.log(
      "\n注意：Godot、匯出與建置不在 run-tier 裡執行，要另外跑（見上方）"
    );
}

let browserScripts = [];
if (mode === "related") {
  if (rest.length === 0) {
    console.error("related 需要功能名稱（run-tier.mjs list 列出全部）");
    process.exit(2);
  }
  browserScripts = [...new Set(rest.flatMap((a) => AREAS[a].scripts))].sort(
    (a, b) => FULL.indexOf(a) - FULL.indexOf(b)
  );
} else if (mode === "full") {
  browserScripts = FULL;
} else if (mode === "changed") {
  browserScripts = plan.browser.scripts;
}

// ── 通過結果的快取：相同的來源內容、參數與環境已經通過時引用，不重跑 ──
const cache = noCache ? null : openCache(ROOT);
if (cache && cache.dropped)
  console.log(`快取：移除 ${cache.dropped} 筆舊格式的紀錄（不再引用）`);
const blobs = sourceBlobs(ROOT);
const quickPrint = digestOf(blobs);
// 快速一層的環境：Node 規則測試的來源替換（*_SRC）連內容算進鍵；算不出內容時不引用也不記錄
const qEnv = quickEnv(ROOT);
if (qEnv.problems.length)
  console.log(`快速一層不使用快取：${qEnv.problems.join("；")}`);
const quickCache = qEnv.problems.length ? null : cache;
const steps = [];
const runStep = (name, cmd, args) => {
  const key = cacheKey(
    { name, cmd: cmd.replace(/\.cmd$/, ""), args },
    quickPrint,
    qEnv.env
  );
  const hit = quickCache && quickCache.hit(key);
  if (hit) {
    const step = { name, seconds: 0, ok: true, reused: hit.at };
    steps.push(step);
    console.log(
      `REUSED  ${name}（相同內容在 ${hit.at} 通過，${hit.seconds}s）`
    );
    return true;
  }
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
  if (quickCache)
    quickCache.record(key, { pass: step.ok, seconds: step.seconds });
  console.log(`${step.ok ? "PASS" : "FAIL"}  ${name}  ${step.seconds}s`);
  return step.ok;
};

const t0 = Date.now();
if (!browserOnly)
  for (const [name, cmd, args] of QUICK) runStep(name, cmd, args);
else console.log("--browser-only：不跑快速一層");
if (cache) cache.save();
const browser = {
  planned: browserScripts,
  scope: null,
  reused: [],
  ran: [],
  passed: [],
  failed: [],
  missing: [],
  results: {},
};
if (browserScripts.length) {
  // 實際的瀏覽器（版本、有沒有顯示視窗）：執行器 --probe 啟動一次瀏覽器讀出來；讀不到時不使用快取
  let probe = null;
  const pr = spawnSync("node", [RUNNER, "--probe"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const pline = (pr.stdout || "")
    .split(/\r?\n/)
    .find((l) => l.startsWith("BROWSER_PROBE "));
  try {
    probe = pline ? JSON.parse(pline.slice("BROWSER_PROBE ".length)) : null;
  } catch {
    probe = null;
  }
  const { env, problems } = browserEnv(ROOT, process.env, probe);
  // 這次要的範圍：設定了 *_ONLY 是局部（只引用同樣選段的局部紀錄），否則是完整（只引用完整、有斷言的紀錄）
  const want = {
    scope: env.selection ? "partial" : "full",
    selection: env.selection,
    needAssertions: true,
  };
  browser.scope = env.selection
    ? `局部（${Object.entries(env.selection)
        .map(([k, v]) => `${k}=${v}`)
        .join("、")}）`
    : "完整";
  browser.browser = env.browser;
  const browserCache = cache && problems.length === 0 ? cache : null;
  if (cache && problems.length)
    console.log(`瀏覽器腳本不使用快取：${problems.join("；")}`);
  const keyOf = (s) =>
    cacheKey(
      { browser: s, scope: want.scope, selection: want.selection },
      browserFingerprint(blobs, s),
      env
    );
  const prior = new Map(
    browserScripts.map((s) => {
      const r = browserCache ? browserCache.hit(keyOf(s)) : null;
      return [s, reusable(r, want) ? r : null];
    })
  );
  let toRun = browserScripts.filter((s) => !prior.get(s));
  // 要跑的腳本需要的前置照跑（即使前置本身已經通過）
  for (const s of [...toRun]) toRun.push(...(PREREQ[s] || []));
  toRun = [...new Set(toRun)].sort((a, b) => FULL.indexOf(a) - FULL.indexOf(b));
  for (const s of browserScripts)
    if (!toRun.includes(s)) {
      const p = prior.get(s);
      browser.reused.push({
        script: s,
        at: p.at,
        scope: p.scope,
        assertions: p.assertions,
        seconds: p.seconds,
        raw: p.raw,
        rawSha256: p.rawSha256,
      });
      console.log(
        `REUSED  ${s}（相同內容與環境在 ${p.at} 通過，${p.scope === "full" ? "完整" : "局部"} ${p.assertions.passed}/${p.assertions.total}，原始結果 ${p.raw}）`
      );
    }
  if (toRun.length) {
    // 一次啟動瀏覽器、依序跑（同一個 browser context，第一支必須是 harness.js）；輸出照常顯示，逐支記錄通過與否
    const tb = Date.now();
    const r = await new Promise((done) => {
      const child = spawn("node", [RUNNER, "harness.js", ...toRun], {
        cwd: ROOT,
        stdio: ["ignore", "pipe", "inherit"],
      });
      let stdout = "";
      child.stdout.on("data", (d) => {
        process.stdout.write(d);
        stdout += d;
      });
      child.on("close", (status) => done({ status, stdout }));
    });
    // 每支的結果：執行器的 RESULT_JSON（通過、斷言數、範圍、原始結果與 sha256）
    const seen = new Map();
    for (const line of (r.stdout || "").split(/\r?\n/)) {
      if (!line.startsWith("RESULT_JSON ")) continue;
      try {
        const j = JSON.parse(line.slice("RESULT_JSON ".length));
        if (j && j.script) seen.set(j.script, j);
      } catch {
        // 看不懂的行：當成沒有結果
      }
    }
    for (const s of toRun) {
      const got = seen.get(s);
      browser.ran.push(s);
      browser.results[s] = got || null;
      // 通過：執行器說通過、而且有斷言（沒有斷言的「通過」不算）
      const pass = !!got && got.pass === true && got.assertions?.total > 0;
      if (!got) browser.missing.push(s);
      else if (pass) browser.passed.push(s);
      else browser.failed.push(s);
      // 沒有結果（中斷）或失敗都不記錄成通過；範圍照實際的結果記（選段之外跳過的段落算局部）
      if (browserCache)
        browserCache.record(
          keyOf(s),
          pass
            ? {
                pass: true,
                scope: got.scope === "full" ? "full" : "partial",
                selection: got.scope === "full" ? null : want.selection,
                only: got.only,
                skipped: got.skipped,
                assertions: got.assertions,
                seconds: got.seconds,
                raw: got.raw,
                rawSha256: got.rawSha256,
                browser: env.browser,
              }
            : null
        );
    }
    const harnessOk = seen.get("harness.js")?.pass === true;
    steps.push({
      name: `瀏覽器腳本 ${toRun.length} 支：${toRun.join(" ")}`,
      seconds: Math.round((Date.now() - tb) / 100) / 10,
      ok:
        r.status === 0 &&
        harnessOk &&
        browser.failed.length === 0 &&
        browser.missing.length === 0,
    });
    if (cache) cache.save();
  }
}
const summary = {
  mode,
  areas: mode === "related" ? rest : undefined,
  base: plan ? base : undefined,
  plan: plan || undefined,
  quickSkipped: browserOnly ? true : undefined,
  steps,
  browser: browserScripts.length ? browser : undefined,
  cache: cache ? cache.file : "不使用（--no-cache）",
  totalSeconds: Math.round((Date.now() - t0) / 1000),
  allPass: steps.every((s) => s.ok),
};
console.log(
  `\n${summary.allPass ? "全部通過" : "有失敗"}：${mode}，共 ${summary.totalSeconds} 秒` +
    (browserScripts.length
      ? `；瀏覽器（${browser.scope}）實跑 ${browser.ran.length} 支、引用 ${browser.reused.length} 支${browser.failed.length ? `、失敗 ${browser.failed.join(" ")}` : ""}${browser.missing.length ? `、沒有結果 ${browser.missing.join(" ")}` : ""}`
      : "") +
    (browserOnly
      ? "；快速一層沒有跑（--browser-only）"
      : `；快速一層引用 ${steps.filter((s) => s.reused).length} 步`)
);
if (process.env.EVIDENCE_DIR) {
  mkdirSync(process.env.EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    join(process.env.EVIDENCE_DIR, `tier-${mode}.json`),
    JSON.stringify(summary, null, 2) + "\n"
  );
}
process.exit(summary.allPass ? 0 : 1);
