// 神馬三國回歸的選測：從「相對基準的改動檔案」決定要跑哪些測試，並記錄通過的結果供相同內容時引用
// - 只讀 git（diff、ls-files、hash-object），不 reset／stash／checkout，也不清任何資料
// - 改動 = 相對基準（預設 HEAD）的已提交差異＋工作樹與暫存區的修改＋未追蹤（沒被忽略）的檔案；刪除與改名也算
// - 每個檔案依 RULES 由上而下比對，第一條符合的規則生效；沒有任何規則符合的是「未分類」，計畫會明確列出、
//   要求選擇（加 --areas 或改用完整），不會靜默略過
// - 通過結果的快取：鍵是快取格式＋來源內容的 fingerprint（git blob，不看 mtime）＋步驟名稱與參數＋Node 版本＋相關環境
//   （LOCAL_ASSETS 與 out/ 的內容、ENGINE_DIR 目錄的內容、GAS_BACKEND 模組連同它匯入的檔案、GAS_FILE 的內容、
//   GAS_MAP_CHECK、Playwright 版本、實際的瀏覽器與版本、有沒有顯示視窗、只跑一部分的選段）。
//   每筆紀錄另存範圍（full／partial）、斷言數與原始結果的位置和 sha256。完整的執行只引用完整、有斷言的紀錄；
//   只跑一部分（MAP_EDITOR_ONLY 等）的結果只給同樣的選段引用。環境裡有設定卻算不出內容的輸入（檔案不存在、
//   瀏覽器版本讀不到等）時整次不引用也不記錄。只記錄通過；失敗、中斷、沒有跑的都不記錄，所以不會被引用成通過
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

// ── 估時（2026-10-03 開發模式完整回歸的實測秒數；負載不同會變，只用來比較）──
export const BROWSER_SECONDS = {
  "i1-init.js": 32,
  "i2-lifecycle.js": 30,
  "auto-timer.js": 21,
  "normal-flows.js": 53,
  "r3-mixed.js": 34,
  "r4-web.js": 33,
  "r5-web.js": 153,
  "r7-web.js": 39,
  "r8-web.js": 91,
  "r9-web.js": 185,
  "r10-web.js": 128,
  "r12-web.js": 62,
  "r13-web.js": 352,
  "r14-web.js": 63,
  "r15-web.js": 58,
  "r16-web.js": 78,
  "artifacts-and-network.js": 2,
  "r17-web.js": 99,
  "r18-web.js": 129,
  "r19-web.js": 36,
  "r20-web.js": 65,
  "save-conflict-web.js": 96,
  "backup-preview-web.js": 13,
  "map-editor-web.js": 7,
  "map-editor-save-web.js": 362,
  "skill-slow-aura-web.js": 45,
  "hero-filter-web.js": 29,
  "team-filter-web.js": 27,
  "hero-category-web.js": 7,
  "settle-web.js": 128,
  "settle-invalid-web.js": 102,
  "flying-web.js": 87,
  "enemy-column-web.js": 46,
  "air-readiness-web.js": 21,
  "air-first-web.js": 63,
  "next-wave-web.js": 66,
  "skill-dodge-web.js": 51,
  "stage-data-web.js": 85,
  "enemy-traits-web.js": 62,
  "wave-reject-exit-web.js": 30,
  "stage-keyboard-web.js": 31,
  "skill-def-aura-web.js": 53,
  "skill-stun-web.js": 54,
  "player-info-keyboard-web.js": 51,
  "skill-lifesteal-web.js": 45,
  "skill-atk-speed-web.js": 50,
  "skill-counter-web.js": 41,
  "skill-tenacity-web.js": 57,
  "skill-atk-down-web.js": 53,
  "hero-keyboard-web.js": 227,
  "skill-double-shot-web.js": 55,
  "hud-keyboard-web.js": 250,
  "read-retry-web.js": 201,
  "save-dialog-keyboard-web.js": 75,
  "battle-tips-web.js": 58,
  "skill-chain-web.js": 38,
  "skill-storm-web.js": 40,
  "skill-berserk-web.js": 40,
  "skill-supply-web.js": 36,
  "skill-knockback-web.js": 48,
  "engine-load-web.js": 158,
  "skill-guard-web.js": 77,
  "skill-base-guard-web.js": 48,
  "skill-assassinate-web.js": 50,
  "skill-charm-web.js": 50,
  "battle-live-web.js": 148,
  "panel-scope-web.js": 71,
  "bgm-load-web.js": 30,
  "release-entry-web.js": 70,
  "hero-compare-web.js": 60,
  "panel-safe-web.js": 70,
  "stage-browse-web.js": 90,
  "stage-route-web.js": 90,
  "stage-rhythm-web.js": 90,
  "stage-sort-web.js": 60,
  "hud-preload-web.js": 120,
};
export const QUICK_SECONDS = 104;
export const GODOT_FULL_SECONDS = 1800;
export const BUILD_SECONDS = 90;

// 同一批裡要先跑的腳本（auto-timer、normal-flows 用 i1-init 建好的帳號；r3-mixed 接在 i2-lifecycle 之後）
export const PREREQ = {
  "auto-timer.js": ["i1-init.js"],
  "normal-flows.js": ["i1-init.js"],
  "r3-mixed.js": ["i2-lifecycle.js"],
};

// 兩個入口開戰、換場與結算的煙霧測試（只改唯讀顯示、局部面板時代替完整回歸）
const SMOKE = [
  "i1-init.js",
  "i2-lifecycle.js",
  "normal-flows.js",
  "settle-web.js",
];

const SG = "src/app/\\(games\\)/shenmaSanguo/";
const re = (s) => new RegExp("^" + s);

/**
 * 改動檔案 → 測試。欄位：
 * - why：說明（計畫裡顯示）
 * - areas：run-tier 的功能（AREAS 的鍵）；scripts：另外的瀏覽器腳本；smoke：加上煙霧測試
 * - self：瀏覽器腳本本身改了，跑它自己；fixture：跑內容提到這個檔名的瀏覽器腳本
 * - browserFull／godotFull：要完整一次的理由；build：要重新建置並跑靜態匯出；export：要重新匯出遊戲產物並核對 public
 * - review：預設的選擇可能不夠，要人判斷（計畫裡列出）
 * - none：不需要測試（文件）
 */
export const RULES = [
  { test: /(^docs\/|\.md$|\/doc\/)/, why: "文件", none: true },
  {
    test: /^\.github\/workflows\/deploy\.yml$/,
    why: "部署流程（快速一層核對部署前正式保留核對的接線）",
    quickOnly: true,
  },
  {
    test: /^(AGENTS|CLAUDE|README)(\.md)?$|^\.gitignore$|^\.github\//,
    why: "專案說明與 CI 設定（不影響本機回歸）",
    none: true,
  },
  {
    test: /^\.gitattributes$/,
    why: "Git 的換行屬性（版本目錄的遊戲檔以 LF 取出；快速一層核對版本目錄）",
    quickOnly: true,
  },
  {
    test: /^scripts\/shenma-regression\/(harness\.js|tools\/run-browser\.mjs)$/,
    why: "所有瀏覽器腳本共用的前置／執行器",
    browserFull: "瀏覽器測試共用的前置或執行器",
  },
  {
    test: /^scripts\/shenma-regression\/tools\/(run-tier|change-plan)(\.test)?\.mjs$/,
    why: "回歸分層與選測工具（快速一層的自我測試涵蓋）",
    quickOnly: true,
  },
  {
    test: /^scripts\/shenma-regression\/tools\/serve-out\.mjs$/,
    why: "本機供應靜態匯出",
    scripts: ["i1-init.js", "engine-load-web.js", "normal-flows.js"],
    build: "靜態匯出要用 serve-out 跑一次",
  },
  {
    test: /^scripts\/shenma-regression\/release\//,
    why: "舊正式版目錄的清單（快速一層核對舊正式版目錄）",
    areas: ["release", "engine-version"],
    build: "舊正式版目錄要用靜態匯出驗證",
  },
  {
    test: /^scripts\/shenma-regression\/tools\/release-transition\.mjs$/,
    why: "發布過渡的原生瀏覽器驗證（另外執行 tools/release-transition.mjs）",
    quickOnly: true,
  },
  {
    test: /^scripts\/shenma-regression\/tools\/(postexport|verify-export)\.mjs$/,
    why: "匯出後處理與產物核對（交付的 Service Worker 與背景音樂由它產生）",
    export: "要重新產生並核對遊戲產物",
    browserFull: "Service Worker 的產生方式（最終收斂後完整一次）",
    build: "Service Worker 要用靜態匯出驗證",
  },
  {
    test: /^scripts\/shenma-regression\/tools\//,
    why: "回歸工具（快速一層執行或核對）",
    quickOnly: true,
  },
  {
    test: /^scripts\/shenma-regression\/web-template\/manifest\.json$/,
    why: "裁減網頁模板的紀錄（godot-check.sh 只接受這裡釘選的模板）",
    export: "釘選的模板可能不同：要重新匯出並核對遊戲產物",
    godotFull: "網頁模板的釘選有改",
  },
  {
    test: /^scripts\/shenma-regression\/web-template\/build-web-template\.mjs$/,
    why: "重建網頁模板的腳本（不影響交付產物；重建出的模板要另外驗證後才更新 manifest）",
    quickOnly: true,
  },
  {
    test: /^scripts\/shenma-regression\/(godot\/|godot-check\.sh$)/,
    why: "Godot 測試程式",
    godotFull: "Godot 測試程式有改",
  },
  {
    test: /^scripts\/shenma-regression\/web\//,
    why: "網頁規則的 Node 測試（快速一層）",
    quickOnly: true,
  },
  {
    test: /^scripts\/shenma-regression\/fixtures\//,
    why: "測試資料（跑用到這個檔案的瀏覽器腳本）",
    fixture: true,
  },
  {
    test: /^scripts\/shenma-regression\/[^/]+\.js$/,
    why: "瀏覽器腳本本身",
    self: true,
  },
  // 地圖編輯器
  {
    test: /^src\/app\/\(tools\)\/mapEditor\/utils\/adminToken\.ts$/,
    why: "地圖編輯器的管理密碼與設定寫入的錯誤說明",
    areas: ["map-editor", "save-conflict", "enemy-column", "hero-category"],
  },
  {
    test: /^src\/app\/\(tools\)\/mapEditor\//,
    why: "地圖編輯器",
    areas: ["map-editor", "enemy-column", "hero-category"],
  },
  // 神馬三國：玩家同步、帳號與後端契約（最終收斂後完整一次）
  {
    test: re(
      SG +
        "(store/playerStore\\.ts|api/|utils/(saveConflict|battleReward|battleSession|playerErrors|isolationRecovery)\\.ts|components/GameInitializer\\.tsx)"
    ),
    why: "玩家同步、帳號或後端持久化契約",
    areas: ["account", "save-conflict", "settle", "read-retry"],
    browserFull: "玩家同步、帳號或後端持久化契約（最終收斂後完整一次）",
  },
  // 戰況觀測（唯讀顯示）
  {
    test: re(
      SG +
        "(components/BattleLivePanel\\.tsx|utils/battleObservation\\.ts|store/battleObservationStore\\.ts)"
    ),
    why: "戰況觀測（唯讀顯示）",
    areas: ["battle-live"],
    smoke: true,
  },
  {
    test: re(SG + "battle/components/UpgradePanel\\.tsx"),
    why: "單位面板（技能說明與即時狀態）",
    areas: ["battle-live", "skills", "battle-layout"],
    smoke: true,
  },
  {
    test: re(
      SG +
        "(components/SinglePageContent\\.tsx|battle/components/BattlePageContent\\.tsx|components/MainMenuContent\\.tsx|layout\\.tsx|page\\.tsx|battle/page\\.tsx)"
    ),
    why: "戰鬥入口（共用）",
    areas: [
      "battle-flow",
      "battle-live",
      "settle",
      "floating-ui",
      "hud-preload",
    ],
    smoke: true,
    review:
      "戰鬥入口有改：預設跑煙霧、戰鬥流程、戰況與結算；如果改到結算、同步、帳號、命令協定或 iframe 生命週期，改跑完整（--full）",
  },
  {
    test: re(SG + "styles/"),
    why: "神馬三國的樣式",
    areas: [
      "floating-ui",
      "battle-layout",
      "battle-tips",
      "battle-live",
      "wave-reject",
    ],
    review: "樣式有改：預設跑版面相關；大範圍改版面時加跑對應功能",
  },
  {
    test: re(SG + "(utils/heroSkills\\.ts|components/HeroSkillInfo\\.tsx)"),
    why: "武將技能的定義與說明",
    areas: ["skills", "heroes"],
  },
  {
    test: re(
      SG +
        "(utils/hero(Stats|Filter|Categories|Compare)\\.ts|components/(HeroFilterBar|HeroAntiAir|HeroCompareBar|HeroCompareTable)\\.tsx|components/useHeroCompare\\.ts|components/modals/(HeroListModal|HeroCompareDialog)\\.tsx|heroes/)"
    ),
    why: "武將列表與數值",
    areas: ["heroes", "stage-preview", "hero-category"],
  },
  {
    test: re(SG + "(team/|components/modals/TeamEditModal\\.tsx)"),
    why: "隊伍編排",
    areas: ["team"],
  },
  {
    test: re(
      SG +
        "(utils/(antiAir|stageAirReadiness)\\.ts|components/StageAirReadinessNote\\.tsx)"
    ),
    why: "飛行與對空",
    areas: ["flying", "air-readiness", "air-first"],
  },
  {
    test: re(SG + "(utils/nextWave\\.ts|components/NextWaveEntry\\.tsx)"),
    why: "戰場內的下一波",
    areas: ["next-wave"],
  },
  {
    test: re(SG + "utils/enemyCombat\\.ts"),
    why: "敵人攻擊力與免疫減速",
    areas: ["enemy-traits", "next-wave"],
  },
  {
    test: re(SG + "(utils/waveReject\\.ts|components/WaveRejectNotice\\.tsx)"),
    why: "拒絕開戰的提示與出口",
    areas: ["wave-reject", "air-first", "next-wave"],
  },
  {
    test: re(SG + "utils/stageAnchor\\.ts"),
    why: "戰場上的面板定位（選取面板、部署選單）",
    areas: ["battle-layout", "floating-ui", "battle-live"],
  },
  {
    test: re(
      SG + "(components/PreviewWaveDetail\\.tsx|utils/stagePreview\\.ts)"
    ),
    why: "敵軍預覽的解析與逐波內容（戰場內的下一波也共用）",
    areas: [
      "stage-data",
      "stage-preview",
      "stage-browse",
      "stage-route",
      "stage-rhythm",
      "wave-reject",
      "air-readiness",
      "next-wave",
    ],
  },
  {
    test: re(
      SG +
        "(stages/|components/modals/(StageSelectModal|EnemyPreviewModal)\\.tsx|components/(Stage[A-Za-z]*|PreviewWave[A-Za-z]*)\\.tsx|utils/(stage[A-Za-z]*|waveNav|spawnRhythm)\\.ts)"
    ),
    why: "關卡選擇、敵軍預覽與關卡資料",
    areas: [
      "stage-data",
      "stage-preview",
      "stage-browse",
      "stage-route",
      "stage-rhythm",
      "stage-sort",
      "wave-reject",
      "air-readiness",
    ],
  },
  {
    test: re(SG + "utils/tower(Target|Sell)\\.ts"),
    why: "防禦塔目標與拆除",
    areas: ["floating-ui", "battle-layout", "air-first"],
  },
  {
    test: re(
      SG +
        "(utils/gameSpeed\\.ts|battle/components/(SpeedToggle|PauseToggle)\\.tsx)"
    ),
    why: "戰鬥速度與暫停",
    areas: ["speed-pause"],
  },
  {
    test: re(SG + "battle/components/PlacementMenu\\.tsx"),
    why: "部署選單",
    areas: ["flying", "battle-layout"],
  },
  {
    test: re(SG + "utils/gameRelease\\.json"),
    why: "網站入口指標（兩個入口開哪一個遊戲目錄；發布與回退）",
    areas: [
      "release",
      "engine-load",
      "engine-version",
      "artifacts",
      "battle-flow",
    ],
    build: "入口網址要用靜態匯出驗證",
  },
  {
    test: re(
      SG +
        "(utils/(engineLoad|gameEngine)\\.ts|components/(useEngineLoad\\.ts|EngineUpdatePrompt\\.tsx))"
    ),
    why: "遊戲引擎的載入與版本",
    areas: ["engine-load", "engine-version", "battle-flow", "release"],
  },
  {
    test: re(SG + "(components/BattleTips\\.tsx|store/battleTipsStore\\.ts)"),
    why: "戰場的玩法提示",
    areas: ["battle-tips"],
  },
  {
    test: re(
      SG +
        "(components/ReadWaitNotice\\.tsx|store/(readWaitStore|staticConfigStore)\\.ts)"
    ),
    why: "後端讀取等待與遊戲設定",
    areas: ["read-retry", "stage-data"],
    smoke: true,
  },
  {
    test: re(
      SG +
        "(components/(SaveConflictNotice|SaveCompareTable|ConflictBackupNotice)\\.tsx|components/modals/(SaveConflictModal|BackupPreviewModal)\\.tsx|utils/backupFile\\.ts)"
    ),
    why: "存檔衝突與備份預覽",
    areas: ["save-conflict", "backup-preview", "save-dialog"],
  },
  {
    test: re(
      SG +
        "components/(SettleUnconfirmedNotice|InvalidResultNotice|UpgradeUnconfirmedNotice)\\.tsx"
    ),
    why: "結算與升級的提示",
    areas: ["settle"],
  },
  {
    test: re(
      SG + "components/(IsolationProblemNotice|MigrationHoldNotice)\\.tsx"
    ),
    why: "跨來源隔離與舊狀態遷移",
    areas: ["isolation"],
  },
  {
    test: re(SG + "components/modals/PlayerInfoModal\\.tsx"),
    why: "玩家資訊視窗",
    areas: ["wave-reject", "account"],
  },
  {
    test: re(
      SG +
        "(components/modals/SettingsModal\\.tsx|settings/|store/soundSettingsStore\\.ts)"
    ),
    why: "遊戲設定",
    areas: ["team", "backup-preview"],
  },
  {
    test: re(SG + "(components/useDialogFocus\\.ts|utils/keyboard\\.ts)"),
    why: "對話框的焦點與鍵盤",
    areas: ["save-dialog", "wave-reject", "heroes", "team", "map-editor"],
  },
  {
    test: re(SG + "types/"),
    why: "型別（快速一層的型別檢查）",
    quickOnly: true,
  },
  // 遊戲引擎與產物
  {
    test: /^godot\/shenmaSanguo\/audio\//,
    why: "遊戲的音效與音樂",
    export: "要重新匯出遊戲產物",
    areas: ["engine-load", "artifacts", "bgm"],
    smoke: true,
  },
  {
    test: /^godot\/shenmaSanguo\/export_presets\.cfg$/,
    why: "Godot 匯出設定（資料包內容、模板）",
    godotFull: "匯出設定有改",
    export: "要重新匯出遊戲產物",
    browserFull: "匯出設定（最終收斂後完整一次）",
    build: "匯出設定要用靜態匯出驗證",
  },
  {
    test: /^godot\/shenmaSanguo\//,
    why: "遊戲引擎的原始碼（戰鬥、目標、傷害、命令協定）",
    godotFull: "遊戲引擎的原始碼有改",
    export: "要重新匯出遊戲產物",
    browserFull: "核心戰鬥或命令協定（最終收斂後完整一次）",
  },
  {
    test: /^public\/games\/shenmaSanguo\//,
    why: "舊正式版目錄（發布後不改；快速一層核對和 release/legacy-root.json 相同）",
    areas: ["release", "engine-version"],
    build: "舊正式版目錄要用靜態匯出驗證",
  },
  {
    test: /^public\/games\/shenmaSanguo-v\/[0-9a-f]{16}\/index\.(html|offline\.html|service\.worker\.js|manifest\.json)$/,
    why: "版本目錄的匯出模板、Service Worker 或 PWA 設定",
    browserFull: "匯出模板或 Service Worker（最終收斂後完整一次）",
    build: "Service Worker／模板要用靜態匯出驗證",
    areas: ["release"],
  },
  {
    test: /^public\/games\/shenmaSanguo-v\//,
    why: "版本目錄的遊戲產物（引擎、資源包、背景音樂）",
    export: "核對版本目錄與匯出結果",
    areas: ["engine-load", "artifacts", "battle-flow", "bgm", "release"],
    smoke: true,
  },
  {
    test: /^public\//,
    why: "網站的其他靜態檔（快速一層的素材引用檢查）",
    quickOnly: true,
  },
  {
    test: /^(package(-lock)?\.json|next\.config\.[a-z]+|tsconfig\.json|eslint\.config\.[a-z]+|\.prettierrc[^/]*|postcss\.config\.[a-z]+)$/,
    why: "建置或相依套件設定",
    browserFull: "建置或相依套件設定",
    build: "建置設定有改",
  },
  {
    test: /^src\/components\//,
    why: "全站共用元件（導覽列、浮動入口等）",
    areas: ["floating-ui", "map-editor"],
    review:
      "全站共用元件有改：預設跑浮動入口與地圖編輯器；改到神馬三國用到的元件時加跑對應功能",
  },
  // 神馬三國與地圖編輯器底下沒有對應規則的檔案不在這裡，會落到「未分類」
  {
    test: /^src\/app\/\((games|tools|general|investment|media|auth)\)\/(?!shenmaSanguo\/|mapEditor\/)/,
    why: "其他頁面（不是神馬三國或地圖編輯器）",
    none: true,
  },
];

/** 一個檔案依規則分類：回傳第一條符合的規則（沒有時 null，也就是未分類） */
export function classify(path) {
  return RULES.find((r) => r.test.test(path)) || null;
}

/** 相對基準的改動：[{ status: A|M|D|R|?, path, from? }]；只讀 git */
export function gitChanges(root, base = "HEAD") {
  const git = (args) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  const out = [];
  // 基準與工作樹（含暫存區）的差異；-z 避免中文與括號被引號包起來
  const parts = git(["diff", "--name-status", "-z", "-M", base])
    .split("\0")
    .filter(Boolean);
  for (let i = 0; i < parts.length; ) {
    const status = parts[i++];
    if (status[0] === "R" || status[0] === "C") {
      const from = parts[i++];
      const to = parts[i++];
      out.push({ status: "R", path: to, from });
    } else {
      out.push({ status: status[0], path: parts[i++] });
    }
  }
  for (const p of git(["ls-files", "--others", "--exclude-standard", "-z"])
    .split("\0")
    .filter(Boolean)) {
    out.push({ status: "?", path: p });
  }
  return out;
}

const uniq = (a) => [...new Set(a)];

/**
 * 依改動產生計畫。opts：areas（AREAS）、full（完整的腳本順序）、suite（瀏覽器腳本目錄，fixture 規則用）、
 * extraAreas（--areas 指定）、forceFull（--full）
 */
export function makePlan(changes, opts) {
  const {
    areas: AREAS,
    full: FULL,
    suite,
    extraAreas = [],
    forceFull = false,
  } = opts;
  const files = [];
  const unknown = [];
  const review = [];
  const browserFull = [];
  const godotFull = [];
  const build = [];
  const exportNeeded = [];
  let scripts = [];
  let smoke = false;
  const fixtureUsers = (path) => {
    const name = path.split("/").pop();
    if (!suite || !existsSync(suite)) return [];
    return readdirSync(suite).filter(
      (f) =>
        f.endsWith(".js") && readFileSync(join(suite, f), "utf8").includes(name)
    );
  };
  for (const c of changes) {
    // 改名時新舊兩個路徑都算（舊路徑的規則也要跑）
    for (const p of c.from ? [c.from, c.path] : [c.path]) {
      const rule = classify(p);
      const entry = {
        status: c.status,
        path: p,
        why: rule ? rule.why : "未分類",
      };
      files.push(entry);
      if (!rule) {
        unknown.push(p);
        continue;
      }
      if (rule.none || rule.quickOnly) continue;
      const tests = [];
      for (const a of rule.areas || [])
        tests.push(...(AREAS[a]?.scripts || []));
      tests.push(...(rule.scripts || []));
      if (rule.self) {
        const name = p.split("/").pop();
        if (c.status === "D") {
          entry.note = "刪除的腳本不再執行";
        } else if (FULL.includes(name) || name === "harness.js") {
          tests.push(name);
        } else {
          entry.note =
            "不在完整回歸清單裡（新的腳本要加進 run-tier 的 FULL 與 README）";
          review.push(`${name}：不在完整回歸清單裡`);
        }
      }
      if (rule.fixture) tests.push(...fixtureUsers(p));
      if (rule.smoke) smoke = true;
      if (rule.review) review.push(rule.review);
      if (rule.browserFull) browserFull.push(`${p}：${rule.browserFull}`);
      if (rule.godotFull) godotFull.push(`${p}：${rule.godotFull}`);
      if (rule.build) build.push(`${p}：${rule.build}`);
      if (rule.export) exportNeeded.push(`${p}：${rule.export}`);
      entry.tests = uniq(tests);
      scripts.push(...tests);
    }
  }
  for (const a of extraAreas) scripts.push(...(AREAS[a]?.scripts || []));
  if (smoke) scripts.push(...SMOKE);
  if (forceFull) browserFull.push("指定 --full");
  const full = browserFull.length > 0;
  if (full) scripts = FULL.slice();
  // 先跑的腳本、去重、依完整回歸的順序
  for (const s of [...scripts]) scripts.push(...(PREREQ[s] || []));
  scripts = uniq(scripts)
    .filter((s) => FULL.includes(s))
    .sort((a, b) => FULL.indexOf(a) - FULL.indexOf(b));
  const browserSeconds = scripts.reduce(
    (t, s) => t + (BROWSER_SECONDS[s] || 60),
    0
  );
  const fullSeconds = FULL.reduce((t, s) => t + (BROWSER_SECONDS[s] || 60), 0);
  return {
    files,
    unknown: uniq(unknown),
    review: uniq(review),
    quick: true,
    browser: {
      full,
      reasons: uniq(browserFull),
      scripts,
      seconds: browserSeconds,
      fullSeconds,
    },
    godot: {
      full: godotFull.length > 0,
      reasons: uniq(godotFull),
      seconds: godotFull.length ? GODOT_FULL_SECONDS : 0,
    },
    export: { needed: exportNeeded.length > 0, reasons: uniq(exportNeeded) },
    build: {
      needed: build.length > 0,
      reasons: uniq(build),
      seconds: build.length ? BUILD_SECONDS : 0,
    },
    estimateSeconds:
      QUICK_SECONDS +
      browserSeconds +
      (godotFull.length ? GODOT_FULL_SECONDS : 0) +
      (build.length ? BUILD_SECONDS : 0),
  };
}

// ── 來源內容的 fingerprint 與通過結果的快取 ──

/** 回歸會讀到的來源（文件不算） */
export const FINGERPRINT_ROOTS = [
  "src",
  "scripts/shenma-regression",
  "public/games/shenmaSanguo",
  "public/games/shenmaSanguo-v",
  "godot/shenmaSanguo",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "next.config.ts",
  "eslint.config.mjs",
];

/**
 * 工作樹裡這些路徑每個檔案的內容（git blob）：未改的用索引裡的 blob，改過、未追蹤的重新計算，刪除的記成 deleted。
 * 只看內容，不看 mtime；.md 文件不算
 */
export function sourceBlobs(root, roots = FINGERPRINT_ROOTS) {
  const git = (args) =>
    execFileSync("git", ["-C", root, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 256 * 1024 * 1024,
    });
  const present = roots.filter((r) => existsSync(join(root, r)));
  const blobs = new Map();
  for (const line of git(["ls-files", "-s", "-z", "--", ...present])
    .split("\0")
    .filter(Boolean)) {
    const tab = line.indexOf("\t");
    blobs.set(line.slice(tab + 1), line.slice(0, tab).split(" ")[1]);
  }
  const dirty = new Set([
    ...git(["diff", "--name-only", "-z", "--", ...present])
      .split("\0")
      .filter(Boolean),
    ...git([
      "ls-files",
      "--others",
      "--exclude-standard",
      "-z",
      "--",
      ...present,
    ])
      .split("\0")
      .filter(Boolean),
  ]);
  // 改過與未追蹤的檔案一次算（每批 200 個；逐一啟動 git 很慢）
  const present2 = [...dirty].filter((p) => existsSync(join(root, p)));
  for (const p of dirty) if (!present2.includes(p)) blobs.set(p, "deleted");
  for (let i = 0; i < present2.length; i += 200) {
    const batch = present2.slice(i, i + 200);
    const hashes = git(["hash-object", "--", ...batch])
      .split(/\r?\n/)
      .filter(Boolean);
    batch.forEach((p, k) => blobs.set(p, hashes[k]));
  }
  for (const p of [...blobs.keys()]) if (p.endsWith(".md")) blobs.delete(p);
  return blobs;
}

/** 依路徑排序後的 sha256；keep(path) 決定哪些檔案算進去 */
export function digestOf(blobs, keep = () => true) {
  const h = createHash("sha256");
  for (const p of [...blobs.keys()].filter(keep).sort())
    h.update(p + "\0" + blobs.get(p) + "\n");
  return h.digest("hex");
}

export const sourceFingerprint = (root, roots) =>
  digestOf(sourceBlobs(root, roots));

const BROWSER_SCRIPT = /^scripts\/shenma-regression\/[^/]+\.js$/;
const NOT_BROWSER = /^scripts\/shenma-regression\/(web|godot)\//;
/**
 * 一支瀏覽器腳本的來源：產品程式與產物、回歸工具、測試資料、harness 與它自己；不含其他瀏覽器腳本、
 * Node 規則測試與 Godot 測試（只改另一支腳本的斷言時，這一支的結果仍可引用）
 */
export const browserFingerprint = (blobs, script) =>
  digestOf(
    blobs,
    (p) =>
      !NOT_BROWSER.test(p) &&
      (!BROWSER_SCRIPT.test(p) ||
        p.endsWith("/" + script) ||
        p.endsWith("/harness.js"))
  );

/** 目錄裡全部檔案的內容 hash（靜態匯出的 out/ 用；目錄不存在時 null） */
export function dirFingerprint(dir) {
  if (!existsSync(dir)) return null;
  const h = createHash("sha256");
  const walk = (d) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else
        h.update(
          relative(dir, p).replace(/\\/g, "/") +
            "\0" +
            createHash("sha256").update(readFileSync(p)).digest("hex") +
            "\n"
        );
    }
  };
  walk(dir);
  return h.digest("hex");
}

const fileHash = (p) =>
  p && existsSync(p) && statSync(p).isFile()
    ? createHash("sha256").update(readFileSync(p)).digest("hex")
    : null;

/** 環境變數裡的路徑：相對路徑以倉庫根目錄為準 */
const envPath = (root, p) => (isAbsolute(p) ? p : resolve(root, p));

const IMPORT_RE =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;
/**
 * 模組連同它（遞迴）匯入的相對路徑檔案的內容 hash；套件與 node: 模組只記名稱。
 * 有相對匯入找不到檔案時回傳 null（算不出內容）
 */
export function moduleFingerprint(file) {
  const seen = new Map();
  const visit = (p) => {
    if (seen.has(p)) return true;
    const h = fileHash(p);
    if (!h) return false;
    seen.set(p, h);
    const text = readFileSync(p, "utf8");
    for (const m of text.matchAll(IMPORT_RE)) {
      const spec = m[1];
      if (!spec.startsWith(".")) {
        seen.set("pkg:" + spec, "");
        continue;
      }
      const base = resolve(dirname(p), spec);
      const target = [base, base + ".mjs", base + ".js", base + ".cjs"].find(
        (c) => existsSync(c) && statSync(c).isFile()
      );
      if (!target || !visit(target)) return false;
    }
    return true;
  };
  if (!visit(file)) return null;
  const top = dirname(file);
  const h = createHash("sha256");
  for (const [p, v] of [...seen.entries()].sort())
    h.update(
      (p.startsWith("pkg:") ? p : relative(top, p).replace(/\\/g, "/")) +
        "\0" +
        v +
        "\n"
    );
  return h.digest("hex");
}

/** 只跑一部分的選段（設定了就是局部的結果）：MAP_EDITOR_ONLY 與其他 *_ONLY */
export const SELECTION_ENV = /^[A-Z][A-Z0-9_]*_ONLY$/;
export function selectionOf(env = process.env) {
  const sel = {};
  for (const [k, v] of Object.entries(env))
    if (SELECTION_ENV.test(k) && String(v || "").trim())
      sel[k] = String(v).trim();
  return Object.keys(sel).length ? sel : null;
}

/**
 * 瀏覽器結果的環境：開發或靜態匯出（LOCAL_ASSETS；靜態匯出時另加 out/ 的內容，out/ 沒有重新建置時原始碼相同也不能引用）、
 * ENGINE_DIR 目錄的內容、後端模組（連同它匯入的檔案）與後端程式的內容、GAS_MAP_CHECK、Playwright 版本、
 * 實際的瀏覽器（probe：run-browser.mjs --probe 的結果，版本與有沒有顯示視窗）、只跑一部分的選段。
 * 回傳 { env, problems }：problems 是有設定卻算不出內容的輸入（有任何一項時不引用也不記錄）
 */
export function browserEnv(root, env = process.env, probe = undefined) {
  const problems = [];
  const pw = env.PLAYWRIGHT_DIR
    ? join(env.PLAYWRIGHT_DIR, "playwright", "package.json")
    : null;
  let playwright = null;
  try {
    playwright =
      pw && existsSync(pw)
        ? JSON.parse(readFileSync(pw, "utf8")).version
        : null;
  } catch {
    playwright = null;
  }
  if (!playwright) problems.push("Playwright 版本讀不到（PLAYWRIGHT_DIR）");
  const out = env.LOCAL_ASSETS === "1";
  const outPrint = out ? dirFingerprint(join(root, "out")) : null;
  if (out && !outPrint) problems.push("LOCAL_ASSETS=1 但沒有 out/");
  const engineDir = env.ENGINE_DIR
    ? dirFingerprint(envPath(root, env.ENGINE_DIR))
    : null;
  if (env.ENGINE_DIR && !engineDir)
    problems.push(`ENGINE_DIR 不存在：${env.ENGINE_DIR}`);
  const gasBackend = env.GAS_BACKEND
    ? moduleFingerprint(envPath(root, env.GAS_BACKEND))
    : null;
  if (env.GAS_BACKEND && !gasBackend)
    problems.push(`GAS_BACKEND 或它匯入的檔案不存在：${env.GAS_BACKEND}`);
  const gasFile = env.GAS_FILE ? fileHash(envPath(root, env.GAS_FILE)) : null;
  if (env.GAS_FILE && !gasFile)
    problems.push(`GAS_FILE 不存在：${env.GAS_FILE}`);
  if (probe !== undefined && !(probe && probe.version))
    problems.push("瀏覽器版本讀不到（run-browser.mjs --probe 失敗）");
  return {
    env: {
      mode: out ? "out" : "dev",
      out: outPrint,
      engineDir,
      gasBackend,
      gasFile,
      gasMapCheck: env.GAS_MAP_CHECK || null,
      playwright,
      browser:
        probe && probe.version
          ? {
              channel: probe.channel,
              version: probe.version,
              headless: probe.headless,
            }
          : null,
      selection: selectionOf(env),
    },
    problems,
  };
}

/** Node 規則測試讀的來源替換（反向驗證用的 *_SRC）：設定了就把內容算進快速一層的鍵 */
export const SOURCE_ENV = /^[A-Z][A-Z0-9_]*_SRC$/;
export function quickEnv(root, env = process.env) {
  const problems = [];
  const inputs = {};
  for (const [k, v] of Object.entries(env))
    if (SOURCE_ENV.test(k) && v) {
      inputs[k] = fileHash(envPath(root, v));
      if (!inputs[k]) problems.push(`${k} 不存在：${v}`);
    }
  return { env: inputs, problems };
}

/** 快取的格式：鍵與紀錄的內容改變時加一（舊格式的紀錄一律不引用，開啟時移除） */
export const CACHE_FORMAT = 2;

/** 快取的鍵：格式、步驟、參數、來源 fingerprint、Node 版本與環境 */
export function cacheKey(step, fingerprint, env) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        format: CACHE_FORMAT,
        step,
        fingerprint,
        node: process.version,
        env,
      })
    )
    .digest("hex");
}

/**
 * 這筆通過紀錄能不能被這次的執行引用：格式相同、範圍相同（完整的執行只引用完整、有斷言的紀錄；
 * 局部只引用同樣選段的局部紀錄）
 * @param {object|null} record
 * @param {{scope: string, selection?: object|null, needAssertions?: boolean}} want
 */
export function reusable(record, want) {
  if (!record || record.pass !== true || record.format !== CACHE_FORMAT)
    return false;
  if (record.scope !== want.scope) return false;
  if (
    want.scope === "partial" &&
    JSON.stringify(record.selection || null) !==
      JSON.stringify(want.selection || null)
  )
    return false;
  if (
    want.needAssertions &&
    !(record.assertions && record.assertions.total > 0)
  )
    return false;
  return true;
}

/**
 * 快取檔（node_modules/.cache 已被忽略、不進版控；SHENMA_REGRESSION_CACHE_DIR 可以換目錄，自我測試用）；
 * 讀不到時當成空的；舊格式的紀錄開啟時移除
 */
export function openCache(root, env = process.env) {
  const dir =
    env.SHENMA_REGRESSION_CACHE_DIR ||
    join(root, "node_modules", ".cache", "shenma-regression");
  const file = join(dir, "results.json");
  let data = {};
  try {
    data = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    data = {};
  }
  let dropped = 0;
  for (const k of Object.keys(data))
    if (!data[k] || data[k].format !== CACHE_FORMAT) {
      delete data[k];
      dropped++;
    }
  return {
    file,
    /** 開啟時移除的舊格式紀錄數 */
    dropped,
    /** 有相同鍵的通過紀錄時回傳它，否則 null */
    hit(key) {
      const r = data[key];
      return r && r.pass === true && r.format === CACHE_FORMAT ? r : null;
    },
    /** 只記錄通過；失敗、中斷、沒有跑的一律不記錄（並移除同一個鍵的舊紀錄） */
    record(key, result) {
      if (result && result.pass === true)
        data[key] = {
          scope: "full",
          ...result,
          pass: true,
          format: CACHE_FORMAT,
          at: new Date().toISOString(),
        };
      else delete data[key];
    },
    save() {
      mkdirSync(dir, { recursive: true });
      writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    },
  };
}
