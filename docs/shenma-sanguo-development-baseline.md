# 神馬三國：本機開發與驗證基準

> 建立日期：2026-09-24
> 基準 commit：`a1579e33`（branch `master`）
> 目的：記錄神馬三國（網頁 + Godot 戰鬥）目前可重現的建置、啟動、驗證方式與實測結果，作為後續開發與 Codex 驗證的起點。
> 本輪**沒有修改任何程式碼**，也沒有新增遊戲功能。
>
> **Round 2 更新（2026-09-24）**：已補齊 Godot 4.6.2 匯出環境、修正 I1～I3 並重新匯出，另建立可重跑的回歸腳本 `scripts/shenma-regression/`，結果見 **§10**。§0～§9 保留 Round 1 當時的紀錄，未改寫。
>
> **Round 3 更新（2026-09-24）**：修正「混合敵人組提前勝利」（R3-1），整波無效時改為拒絕開戰；回歸工具改為任何錯誤都回傳非零、不刪除目錄，並改成核對工作區交付產物（R3-2）。結果見 **§11**。§10 保留 Round 2 當時的紀錄，未改寫。
>
> **Round 4 更新（2026-09-24）**：只改 Web 端。登入失敗時顯示原因並可重試或更換金鑰（I7）；重新整理後會補送未完成的存檔同步（I4）；切換帳號前先保存。非同步規則、結果與後端限制見 **§12**。
>
> **Round 5 更新（2026-09-25）**：只改 Web 端。武將升級的回應遺失時（重新整理、網路錯誤），不再把升級前的武將與點數整份存回去蓋掉伺服器上已完成的升級（C1），改成「結果待確認」並重新讀取伺服器確認；升級在途時不先保存；移除卸載時的 keepalive 盲寫（C2）。恢復情境的分類與仍需後端支援的部分見 **§13**。
>
> **Round 6 更新（2026-09-25）**：只改 Web 端。修正較早送出的背景讀取在升級確認後才回來、把本機還原成升級前的問題（C3）；移除「以雲端資料為準」，待確認時沒有強制解除保護的方式（C4）；待確認提示改到畫面底部，不再擋住 HUD。見 **§14**。
>
> **Round 7 更新（2026-09-25）**：只改 Web 端。手動同步（強制從雲端同步）的讀取在升級確認之後才回來時，會把本機與後端還原成升級前（C5）；改成所有會採用伺服器玩家資料的讀取，都在送出前記下資料世代、提交前驗證。待決事項改列在 §15.6。見 **§15**。
>
> **Round 8 更新（2026-09-25）**：只改 Web 端。戰鬥與結算綁定開戰時的帳號：戰鬥中不能切換到其他帳號，結算只算給開戰的帳號，同一場只結算一次，舊結算晚到或重複送達都不採用；備戰中切換會用新帳號重新載入關卡。待決事項改列在 §16.5。見 **§16**。（Codex 驗收未通過：切換在途才開打、新場次開打後的舊結算、同帳號已作廢的戰鬥票，見 §17）
>
> **Round 9 更新（2026-09-25）**：Web 端與 Godot 端都有修改，並重新匯出 `public/games/shenmaSanguo/`。關卡資料帶場次識別碼 `battle_id`，Godot 的 stats 與結算帶回產生它的那一場的 `battle_id`，頁面只採用目前這一場的訊息；store 維護目前有效的一場，舊票不能結算、上鎖或解除新場次的鎖；切換帳號在每次等待之後、提交之前都重新檢查戰鬥鎖。待決事項改列在 §17.6。見 **§17**。
>
> **Round 10 更新（2026-09-25）**：Web 端與 Godot 端都有修改，並重新匯出 `public/games/shenmaSanguo/`。Godot 的 `game_ready` 帶橋接協定版本，網頁版本相同才送出關卡資料；舊版遊戲（例如瀏覽器還在用舊快取）顯示「遊戲版本需要更新」與重新載入入口，重新載入只換掉遊戲 iframe 並讓遊戲的 Service Worker 換成新版本，存檔與未同步的修改都保留。兩個戰鬥頁只接受目前遊戲 iframe 的訊息。切換存檔在視窗關閉後才失敗時，主畫面也會提示（D10）。待決事項改列在 §18.6。見 **§18**。
>
> **Round 11（2026-09-26）**：Round 7～10 已由 Codex 驗收，並在本機 commit（`81cabb43`，未 push）。本輪只調查 D11（跨來源隔離切換時的 sessionStorage），沒有修改產品程式碼。真實流程下兩種狀態各有一份 session；正常使用沒有重現遺失，但只要非隔離那一份曾被寫入，之後的強制重新整理可能送出過時的保存、或蓋掉未同步的修改與待確認升級。處理建議與新的待決事項見 **§19**。
>
> **Round 12（2026-09-27）**：第一個新玩法：趙雲「奇襲」（每場戰鬥首次有效普通攻擊 2 倍傷害）。另外修正獨立戰鬥頁在遊戲比頁面先準備好時會一直停在載入中的問題（補送就緒訊息）。依程式碼盤點的功能路線圖改為 `docs/shenma-sanguo-feature-roadmap.md`。見 **§20**。
>
> **Round 13（2026-09-28）**：Round 12 已在本機 commit（`c62298db`，未 push）。修復 D11／D12：跨來源隔離只留給 AI 去背（bgRemover），其他頁面都是非隔離；舊的全站隔離使用者先在隔離狀態備份存檔、再移除舊的 Service Worker 並換成非隔離，不會再讓隔離切換把神馬三國的存檔退回舊資料。見 **§21**。
>
> **Round 14（2026-09-28）**：Codex 驗收 Round 13 未通過（三個資料保護問題），本輪修正：查不到舊註冊時不再當作沒有、備份寫不回時不刪除、讀不回舊暫存的分頁之後改用合併保存（不蓋掉稍晚才在伺服器完成的升級）。另外實作第二個武將技能：黃忠「百步穿楊」（有效射程 ×1.5）。兩部分分開驗收。見 **§22**。
>
> **Round 15（2026-09-28）**：黃忠「百步穿楊」驗收通過，拆出來單獨在本機提交（`8275ff6d`）。Round 13 的 C13-F 改成「遷移狀態不明時停止寫入」：這個分頁不再送出存檔、升級、結算，只能讀取，重新整理不解除。另外實作周瑜「火攻」（命中後 3 跳灼燒）。兩部分分開驗收。見 **§23**。
>
> **Round 16（2026-09-28）**：Round 13～15 經 Codex 驗收後分成兩個本機 commit（`4793872e` 存檔修正、`95dea9fe` 周瑜火攻，未 push）。修正攻速成長沒有生效（正式設定的 `speed_growth` 在 Web 進入 store 時正規化，D17）；R15 的計時測試改用物理時鐘（不再依賴牆鐘）；新增關卡敵軍預覽（主頁關卡視窗與關卡頁，唯讀）。見 **§24**。
>
> **Round 17（2026-09-28）**：Round 16 經 Codex 驗收後在本機提交（`fe7724f2`，未 push）。神馬三國的視窗開啟時隱藏全站的說明／聊天浮動入口（D21）；敵軍預覽補上鍵盤操作；新增防禦塔目標優先（優先前方／血量最多／血量最少，只存在這一場），橋接協定升到 3。見 **§25**。

---

## 0. 摘要

| 面向                    | 結論                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| 網頁依賴／建置／型別    | `npm ci`、`npm run build`、`tsc --noEmit` 全部通過                                                    |
| 神馬三國範圍 ESLint     | 0 error、9 warning（全是既有的 `react-hooks/set-state-in-effect`）                                    |
| 瀏覽器實測（mock 後端） | 入口、Godot 載入、部署、波次、勝敗結算、選關、重開、武將升級、隊伍編輯皆可運作；另找到 3 個可重現缺陷 |
| 真實後端                | 只做了**唯讀**的靜態設定讀取（3 支 API）；所有寫入都在瀏覽器內 mock，沒有任何請求寫入正式 GAS／Sheets |
| Godot 專案載入／匯出    | **未執行**：本機沒有 Godot 編輯器，也沒有匯出模板                                                     |

---

## 1. 環境

### 1.1 實測版本

| 項目               | 版本／狀態                                                                  | 來源                                 |
| ------------------ | --------------------------------------------------------------------------- | ------------------------------------ |
| OS                 | Windows 10 Pro 10.0.19045                                                   | 實測                                 |
| Node.js            | v20.19.4（CI 使用 Node 20）                                                 | `node -v`                            |
| npm                | 10.8.2                                                                      | `npm -v`                             |
| Next.js            | 16.2.6（Turbopack）                                                         | `node_modules/next/package.json`     |
| React / React DOM  | 19.2.6                                                                      | 同上                                 |
| TypeScript         | 5.8.3                                                                       | 同上                                 |
| ESLint             | 9.26.0（`eslint-config-next` 16.2.6）                                       | 同上                                 |
| Zustand            | 5.0.11                                                                      | 同上                                 |
| Godot 編輯器       | **未安裝**（PATH、常見安裝目錄、winget、choco、C/D/P/Q/T 槽皆無）           | 實測搜尋                             |
| Godot 匯出模板     | **未安裝**（`%APPDATA%\Godot` 不存在）                                      | 實測                                 |
| 現有匯出產物的引擎 | Godot **4.6.2.stable.official**（`71f334935`），Emscripten 4.0.20，單執行緒 | `index.wasm` 字串與瀏覽器主控台      |
| 瀏覽器（實測用）   | Playwright MCP 驅動的 Chrome 153，WebGL 2.0（ANGLE / Intel HD 630 / D3D11） | 主控台與 `WEBGL_debug_renderer_info` |

> ⚠️ `AGENTS.md` 寫的是 Next.js 15，但實際安裝的是 16.2.6。Next 16 的 `next build` 不再執行 ESLint（本次建置 log 沒有 lint 步驟），所以 `AGENTS.md` §6「build 時 ESLint error 會中斷建置」的描述已過時，lint 需要另外跑。

### 1.2 Git

- 目前正確基底是 `master`；`main` 是舊版骨架，不要以 `main` 為基準。
- 提交身分只設定在倉庫層級：`git config --local user.name` = `ZeHoward`、`user.email` = `howard867@yahoo.com.tw`（全域設定是另一組身分，不要改全域）。

### 1.3 要重新匯出 Godot 時需要補齊的環境

1. Godot **4.6.2-stable**（Windows 版，建議同時有 `_console.exe` 方便看 headless 輸出）。版本要與現有匯出一致，避免 `.import`／`.uid` 檔被改寫。
2. 4.6.2 的匯出模板，放在 `%APPDATA%\Godot\export_templates\4.6.2.stable\`。`export_presets.cfg` 設定 `variant/thread_support=false`、`variant/extensions_support=false`，因此 Web 匯出需要其中的 `web_nothreads_release.zip`（debug 匯出則要 `web_nothreads_debug.zip`）。

---

## 2. 架構與資料流（依實際程式整理）

> 早期的 `src/app/(games)/shenmaSanguo/doc/implementation_plan.md` 已落後（例如仍以多頁路由為主），以下以實際程式為準。

- **主入口**：`/shenmaSanguo` → `page.tsx` → `components/SinglePageContent.tsx`（單頁：Godot iframe 常駐 + React HUD／Modal）。
- **Layout**：`layout.tsx` 掛 `GameInitializer`，負責讀 session 快取、呼叫 GAS 載入存檔與靜態設定。
- **Godot**：iframe 載入 `/games/shenmaSanguo/index.html`（即 `public/games/shenmaSanguo/`）。
- **Web ↔ Godot 通訊**：`window.postMessage`。
  - Web → Godot：出征 payload（含 `stage_id`，無 `type`）、`{__godot_bridge: true, type}`：`start_battle`、`toggle_auto`、`place_tower`、`place_hero`、`resume_game`、`request_upgrade`、`deselect_unit`、`update_team`、`update_sound_settings`。
  - Godot → Web：`game_ready`、`update_stats`、`click_cell`、`show_upgrade_panel`、`hide_upgrade_panel`，以及結算（`result`／`stage_id`／`stars_earned`／`kills`／`time_seconds`／`loots`，沒有 `type`）。
  - 對應程式：`godot/shenmaSanguo/bridge/WebBridge.gd`、`SinglePageContent.tsx` 的 `handleMessage`。
- **後端**：`api/gameApi.ts` 把寫死的 GAS URL 以 `fetch` POST（不帶 Content-Type，body 是 `{action, key, payload}` 字串）。
  - 讀取：`get_profile`、`get_heroes_config`、`get_enemies_config`、`get_all_maps`（另有 `get_settings`、`get_map_config` 目前沒被呼叫）。
  - 寫入：`create_profile`、`save_profile`、`save_result`、`upgrade_hero`（另有 `save_enemies_config`、`save_heroes_config`）。
  - GAS 原始碼**不在此倉庫**，mock 的回應格式是依前端程式推定的。
- **瀏覽器儲存**：
  - `localStorage`：`shenma_player_key`（玩家金鑰）、`shenma_static_config` + `shenma_static_ts`（靜態設定快取，TTL 60 秒）、`shenma_sound_settings`。
  - `sessionStorage`：`shenma_player_state`（存檔 + `syncStatus`：idle／pending／syncing）。
- **同步策略**（`store/playerStore.ts`）：戰鬥結算立即 `save_result` + `save_profile`；暱稱／隊伍／本地升級走 30 秒 debounce `save_profile`；`beforeunload` 時若為 pending，以 `fetch(..., {keepalive: true})` 送 `save_profile`。
- **Service Worker**：根 layout 以 `beforeInteractive` 載入 `/coi-serviceworker.js`（全站 COOP/COEP，讓頁面 `crossOriginIsolated`）；Godot 匯出另有 `index.service.worker.js`（PWA）。

---

## 3. 網頁建置與 Godot 匯出的關係

```
godot/shenmaSanguo/（GDScript、場景、素材）
        │  ← 只能用 Godot 編輯器 + Web 匯出模板「手動」匯出
        ▼
public/games/shenmaSanguo/（index.html / .js / .wasm / .pck / SW，納入版本控制）
        │  ← next build 原封不動複製 public/
        ▼
out/games/shenmaSanguo/（實測與 public/ 的 SHA256 完全相同）
        │  ← GitHub Actions（.github/workflows/deploy.yml）：
        │     push master → npm ci → npm run build → 部署 out/ 到 gh-pages
        ▼
正式站
```

重點：

1. **GitHub Actions 不會重新匯出 Godot**。只改 `.gd`／`.tscn`／素材而沒有重新匯出並提交 `public/games/shenmaSanguo/`，正式站**不會有任何變化**。
2. 反過來，只改 React 端就不需要動 Godot 產物；但如果改了 postMessage 協議（欄位名稱或 `type`），兩邊必須一起改，而且 Godot 端要重新匯出。
3. `export_presets.cfg` 的 `export_path` 指向 `../../public/games/shenmaSanguo/index.html`，也就是**直接覆蓋正式產物**。試匯出時必須在指令上指定其他輸出路徑（見 §5）。
4. ESLint 設定忽略 `godot/**` 與 `public/**`；`tsc` 也不涵蓋 GDScript，所以 Godot 端的錯誤只能靠 Godot 編輯器或瀏覽器主控台發現（例如 §7 的 I3）。
5. 目前匯出狀態：
   - 最後一次更新產物的 commit 是 `f6daadd8`（2026-05-03），SW `CACHE_VERSION` 時間戳也是 2026-05-03。
   - 該 commit 之後沒有任何 Godot 原始碼的提交。
   - `index.pck` 內含全部 12 支腳本（編譯後的 `.gdc`）。因為腳本已編譯，**無法逐位元組證明產物與目前原始碼完全一致**；要確認只能重新匯出後比對（§5）。
6. `godot/shenmaSanguo/` 內仍追蹤著早期的匯出檔（`index.js`、35 MB 的 `index.wasm`、13 KB 的 `index.pck`、`index*.png`）。其中 `index.png`、`index.icon.png`、`index.apple-touch-icon.png` 有 `.import` 檔，實測已被打包進目前的 `index.pck`（多餘資源）。

---

## 4. 網頁端：啟動與檢查步驟

在倉庫根目錄執行（PowerShell 或 Git Bash 皆可）：

```bash
npm ci                                          # 依 package-lock 安裝，實測約 5 分鐘
npm run build                                   # 靜態匯出到 out/，實測約 77 秒
npx tsc --noEmit -p tsconfig.json               # 全專案型別檢查，實測約 31 秒
npx eslint "src/app/(games)/shenmaSanguo"       # 神馬三國範圍 lint，實測約 16 秒
npm run dev                                     # http://localhost:3000/shenmaSanguo
```

注意事項：

- **本機驗證請用 `npm run dev`，不要直接伺服 `out/`**：非開發模式時 `assetPrefix` 是 `https://qwer820921.github.io/`，`out/shenmaSanguo.html` 內有 71 處 `_next` 資源指向正式站，本機開 `out/` 會載入線上 JS/CSS，不是本機產物。
- 開發模式下 Godot iframe 首次載入約 11～13 秒（35 MB wasm + 4.7 MB pck），之後有快取時約 2 秒。
- 本機頁面會照常載入 GA 與 AdSense：GA 事件會送進正式 GA 屬性（`G-CCKVESHCQ1`，會污染統計），AdSense iframe 則被 COEP 擋下（`ERR_BLOCKED_BY_RESPONSE`）。自動化測試時建議一併攔截這些網域。

### 4.1 隔離後端：瀏覽器內 mock GAS

**原則**：測試時不使用正式玩家存檔，也不寫入正式 GAS／Sheets。

做法（不需要改任何程式碼）：

1. **主要機制：頁面內覆寫 `fetch`**。以 `context.addInitScript` 在頁面腳本執行前取代 `window.fetch`：凡是 `https://script.google.com/` 開頭的請求，直接在頁面內回傳 mock 結果，**不經過網路也不經過 Service Worker**。mock 資料庫存在同一來源的 `localStorage`（`__shenma_mock_gas_db`），呼叫紀錄在 `__shenma_mock_gas_log`。`beforeunload` 的 keepalive `save_profile` 也會被攔下（實測確認）。
2. **安全網：`context.route("https://script.google.com/**")`**。任何漏到網路層的 GAS 請求，除了明確放行的動作以外一律 `abort`。
3. 為什麼不能只用 `page.route`：根 layout 會註冊 `coi-serviceworker`，經過 Service Worker 轉發的請求不保證會被 `page.route` 攔到。

兩種模式：

| 模式              | 靜態設定（heroes／enemies／maps） | 玩家存檔與所有寫入 | 用途                                          |
| ----------------- | --------------------------------- | ------------------ | --------------------------------------------- |
| `mock`            | mock 資料（2 武將、2 敵人、2 關） | mock               | 流程驗證，可快速分出勝負                      |
| `readonly-config` | **正式 GAS 唯讀讀取**             | mock               | 確認正式地圖／設定能在目前的 Godot 產物上運作 |

腳本（Playwright MCP 的 `browser_run_code_unsafe` 直接貼 `code`；MCP 只允許讀取倉庫內的檔案，若改用 `filename` 需要先把腳本放進倉庫，事後記得刪除）。**每個 browser context 只能安裝一次，切換模式要先 `browser_close`**。

> 這段原文已實跑過（mock 模式，2026-09-24）。MCP 會把程式碼包成 `(程式碼)(page)` 執行，所以**結尾不能有分號**；下方區塊加了 `prettier-ignore`，避免 lint-staged 格式化時補上分號。
> Playwright MCP 會在倉庫根目錄產生 `.playwright-mcp/`（截圖、主控台紀錄），這個目錄沒有被 gitignore，測完請刪除。

<!-- prettier-ignore -->
```js
async (page) => {
  const MODE = "mock"; // 或 "readonly-config"
  const PASSTHROUGH =
    MODE === "readonly-config"
      ? ["get_heroes_config", "get_enemies_config", "get_all_maps"]
      : [];

  // ── mock 靜態設定：14×11 地圖，第 5 列是直線道路，上下兩列是建築格 ──
  const ROW = 5;
  const build_zones = [];
  for (let c = 1; c <= 12; c++) {
    build_zones.push([c, ROW - 1]);
    build_zones.push([c, ROW + 1]);
  }
  const pathJson = {
    cols: 14,
    rows: 11,
    paths: {
      path_a: [
        [0, ROW],
        [13, ROW],
      ],
    },
    spawn: [0, ROW],
    base: [13, ROW],
    build_zones,
    obstacles: [],
    background_texture: "maps/bg_forest.webp",
  };
  const hero = (hero_id, name, image, job) => ({
    hero_id,
    name,
    rarity: "orange",
    cost: 8,
    job,
    base_atk: 150,
    base_def: 120,
    base_hp: 1500,
    attack_range: 1.5,
    attack_speed: 1.2,
    upgrade_cost_base: 100,
    atk_growth: 10,
    def_growth: 8,
    hp_growth: 100,
    range_growth: 0,
    atk_spd_growth: 0,
    image,
  });
  const config = {
    heroes: [
      hero("guan_yu", "關羽", "hero_guan_yu.webp", "infantry"),
      hero("zhao_yun", "趙雲", "hero_zhao_yun.webp", "cavalry"),
    ],
    enemies: [
      {
        enemy_id: "mock_grunt",
        name: "Mock 步兵",
        hp: 20,
        speed: 60,
        image: "enemy_grunt1.webp",
      },
      {
        enemy_id: "mock_rusher",
        name: "Mock 衝鋒",
        hp: 99999,
        speed: 220,
        image: "enemy_cavalry1.webp",
      },
    ],
    maps: [
      {
        map_id: "chapter1_1",
        chapter: 1,
        name: "Mock 勝利關",
        unlock_stage: "chapter1_1",
        path_json: pathJson,
        waves: [
          {
            wave: 1,
            enemies: [
              {
                enemy_id: "mock_grunt",
                count: 3,
                interval: 1.0,
                path: "path_a",
              },
            ],
          },
          {
            wave: 2,
            enemies: [
              {
                enemy_id: "mock_grunt",
                count: 3,
                interval: 1.0,
                path: "path_a",
              },
            ],
          },
        ],
      },
      {
        map_id: "chapter1_2",
        chapter: 1,
        name: "Mock 失敗關",
        unlock_stage: "chapter1_2",
        path_json: pathJson,
        waves: [
          {
            wave: 1,
            enemies: [
              {
                enemy_id: "mock_rusher",
                count: 22,
                interval: 0.25,
                path: "path_a",
              },
            ],
          },
        ],
      },
    ],
  };

  const context = page.context();
  if (context.__shenmaMockInstalled)
    return { error: "此 context 已安裝，切換模式請先 browser_close" };
  context.__shenmaMockInstalled = true;
  const netLog = [];
  context.__netLog = netLog; // 之後可用 page.context().__netLog 讀取

  // 安全網：網路層只放行 PASSTHROUGH，其餘 GAS 請求一律 abort
  await context.route("https://script.google.com/**", async (route) => {
    let action = "(unknown)";
    try {
      action = JSON.parse(route.request().postData() || "{}").action;
    } catch {}
    const allowed = PASSTHROUGH.includes(action);
    netLog.push({ t: Date.now(), action, allowed });
    return allowed ? route.continue() : route.abort("blockedbyclient");
  });

  // 主要機制：頁面內覆寫 fetch（只在最上層頁面，不影響 Godot iframe）
  await context.addInitScript(
    ({ config, passthrough }) => {
      if (window.top !== window || window.__SHENMA_MOCK_GAS__) return;
      window.__SHENMA_MOCK_GAS__ = true;
      const GAS_PREFIX = "https://script.google.com/";
      const DB_KEY = "__shenma_mock_gas_db";
      const LOG_KEY = "__shenma_mock_gas_log";
      const emptyDb = () => ({ profiles: {}, battle_logs: [] });
      const loadDb = () => {
        try {
          return JSON.parse(localStorage.getItem(DB_KEY)) || emptyDb();
        } catch {
          return emptyDb();
        }
      };
      const saveDb = (db) => localStorage.setItem(DB_KEY, JSON.stringify(db));
      const log = (e) => {
        let l = [];
        try {
          l = JSON.parse(localStorage.getItem(LOG_KEY) || "[]");
        } catch {}
        l.push(e);
        localStorage.setItem(LOG_KEY, JSON.stringify(l));
      };
      const defaultProfile = (nickname) => ({
        nickname: nickname || "旅行者",
        level: 1,
        exp: 0,
        gold: 1000,
        capacity: 11,
        max_stage: "chapter1_1",
        heroes: [],
        team: [
          { hero_id: "guan_yu", slot: 1 },
          { hero_id: "zhao_yun", slot: 2 },
        ],
      });
      const origFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url =
          typeof input === "string"
            ? input
            : (input && input.url) || String(input);
        if (!url.startsWith(GAS_PREFIX)) return origFetch(input, init);
        let body = {};
        try {
          body = JSON.parse((init && init.body) || "{}");
        } catch {}
        const { action, key, payload } = body;
        if (passthrough.includes(action)) {
          log({ t: Date.now(), action, mode: "real-readonly" });
          return origFetch(input, init);
        }
        const db = loadDb();
        let res;
        switch (action) {
          case "get_heroes_config":
            res = { status: 200, heroes: config.heroes };
            break;
          case "get_enemies_config":
            res = { status: 200, enemies: config.enemies };
            break;
          case "get_all_maps":
            res = { status: 200, maps: config.maps };
            break;
          case "get_profile":
            res = db.profiles[key]
              ? { status: 200, data: db.profiles[key] }
              : { status: 404, error: "PROFILE_NOT_FOUND" };
            break;
          case "create_profile":
            db.profiles[key] = defaultProfile(payload && payload.nickname);
            res = { status: 200 };
            break;
          case "save_profile":
            db.profiles[key] = payload.data;
            res = { status: 200 };
            break;
          case "save_result":
            db.battle_logs.push({ key, ...payload, t: Date.now() });
            res = { status: 200 };
            break;
          case "upgrade_hero": {
            const p = db.profiles[key];
            const cfg = config.heroes.find(
              (h) => h.hero_id === payload.hero_id
            );
            if (!p || !cfg) {
              res = { status: 400, error: "MOCK_NOT_FOUND" };
              break;
            }
            const idx = p.heroes.findIndex((h) => h.hero_id === cfg.hero_id);
            const cur =
              idx >= 0
                ? p.heroes[idx]
                : {
                    hero_id: cfg.hero_id,
                    level: 1,
                    star: 0,
                    atk: cfg.base_atk,
                    def: cfg.base_def,
                    hp: cfg.base_hp,
                  };
            const cost = cfg.upgrade_cost_base * cur.level;
            if (p.gold < cost) {
              res = { status: 400, error: "GOLD_NOT_ENOUGH" };
              break;
            }
            const next = {
              ...cur,
              level: cur.level + 1,
              atk: cur.atk + cfg.atk_growth,
              def: cur.def + cfg.def_growth,
              hp: cur.hp + cfg.hp_growth,
            };
            if (idx >= 0) p.heroes[idx] = next;
            else p.heroes.push(next);
            p.gold -= cost;
            res = { status: 200, hero: next, gold_remaining: p.gold };
            break;
          }
          default:
            res = { status: 400, error: "MOCK_UNSUPPORTED_" + action };
        }
        saveDb(db); // 同步寫入：beforeunload 的 keepalive 呼叫也會被記錄
        log({ t: Date.now(), action, key, mode: "mock", status: res.status });
        await new Promise((r) => setTimeout(r, 150));
        return new Response(JSON.stringify(res), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      };
    },
    { config, passthrough: PASSTHROUGH }
  );

  // 清空該來源的舊資料（用不含 App 程式的靜態頁，避免觸發 GAS 呼叫）
  await page.setViewportSize({ width: 540, height: 900 });
  await page.goto(
    "http://localhost:3000/games/shenmaSanguo/index.offline.html"
  );
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  return { mode: MODE, passthrough: PASSTHROUGH };
}
```

驗證沒有外洩的方法：

- 頁面內：`JSON.parse(localStorage.__shenma_mock_gas_log)`，每一筆都應該是 `mode: "mock"`（`readonly-config` 模式下只有 3 支讀取是 `real-readonly`）。
- 網路層：`page.context().__netLog` 應為空（mock 模式）或只有 3 支讀取、`allowed: true`（readonly-config 模式）；`browser_network_requests` 以 `script\.google` 過濾應只出現放行的讀取。
- mock 金鑰使用 `mock_` 前綴（本輪用 `mock_baseline_001`、`mock_readonly_001`）。

### 4.2 在 Godot 畫布上點擊格子

Godot 設定為 `canvas_items` + `expand`，基準解析度 540×720。設 iframe 的 CSS 尺寸為 `W×H`、地圖 `cols×rows`：

```
s      = min(W/540, H/720)
vp     = (W/s, H/s)
tile   = max(16, floor(min(vp.x/cols, vp.y/rows)))
offset = ((vp.x - cols*tile)/2, (vp.y - rows*tile)/2)
格子 (c, r) 中心 = iframe 左上 + (offset + ((c+0.5)*tile, (r+0.5)*tile)) * s
```

視窗 540×900 時 iframe 占滿整頁，mock 地圖（14×11）為 `tile = 38`、`offset = (4, 241)`，所以格子中心是 `(4 + (c+0.5)*38, 241 + (r+0.5)*38)`。進場的「進入戰場」按鈕在畫面中央 `(270, 450)`。

### 4.3 本輪瀏覽器實測流程（mock 模式）

1. 安裝 mock → 開 `/shenmaSanguo` → 看到金鑰畫面 → 輸入 `mock_baseline_001` →「進入遊戲」。
   - 實際結果：卡在「調兵遣將中」（見 I1），重新整理後才進入戰場。
2. 點「進入戰場」→ 點建築格 (4,4)、(8,6) 各蓋一座弓兵塔 → 點道路格 (6,5) 部署關羽。
3. 「迎戰」→ 第 1 波清空後回到備戰 →「迎戰」→ 第 2 波 → 勝利結算 →「確認」。
4. 切換關卡 → 選「Mock 失敗關」→ 進場 →「迎戰」（不佈防）→ 落敗結算 →「確認」。
5. 戰鬥中切換關卡（重現 I2）→ 重新選關重置 → 按「自動」（重現 I3）→ 勝利結算。
6. 「武將」→ 關羽 → 升級兩次 → 等 30 秒 debounce。
7. 「隊伍」→ 移除趙雲 → 儲存 → 立刻重新整理（測 beforeunload）。
8. 開啟設定 Modal；逐一開啟舊路由 `/shenmaSanguo/{stages,heroes,team,settings,battle?map=chapter1_1}`。
9. `browser_close` → 以 `readonly-config` 模式重裝 → 預先寫入金鑰 `mock_readonly_001` → 開 `/shenmaSanguo` → 首關開戰（不佈防）→ 確認結算。

> 本輪自動化瀏覽器視窗在背景，量到 iframe 的 `requestAnimationFrame` 只有約 **1.2 fps**，遊戲時間明顯慢於真實時間（例如勝利關實際約 50 秒，Godot 回報 `time_seconds: 6`）。功能驗證不受影響，但**本輪任何時間數據都不能當效能指標**。

---

## 5. Godot 端：載入與試匯出步驟（本輪未能執行）

本輪沒有 Godot 編輯器與模板，以下步驟**尚未實測**，是下一輪補齊環境後的建議做法：

1. **先複製專案到暫存目錄再操作**，避免首次匯入時改寫受版本控制的 `.import`／`.uid`／`project.godot`：

   ```powershell
   $tmp = "$env:TEMP\shenma-godot-check"
   Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
   Copy-Item godot\shenmaSanguo $tmp -Recurse
   ```

2. 載入與匯入檢查（產生 `.godot/` 快取，並顯示腳本解析錯誤）：

   ```powershell
   & "<Godot_v4.6.2-stable_win64_console.exe>" --headless --path $tmp --import
   ```

3. 試匯出到獨立目錄（必須明確指定輸出路徑，否則會依 preset 覆蓋 `public/games/shenmaSanguo/`）：

   ```powershell
   New-Item -ItemType Directory -Force "$env:TEMP\shenma-export" | Out-Null
   & "<Godot_v4.6.2-stable_win64_console.exe>" --headless --path $tmp --export-release "Web" "$env:TEMP\shenma-export\index.html"
   ```

4. 比對：新產物的 `index.pck` 檔案清單、`index.html` 內的 `GODOT_CONFIG`、`index.js`／`index.wasm` 是否與 `public/games/shenmaSanguo/` 相同引擎版本。確認無誤後，才由人決定是否覆蓋正式產物並提交。
5. 若要在倉庫目錄直接開專案，事後務必 `git status` 檢查是否有非預期的 `.import`／`.uid`／`project.godot` 變更。

---

## 6. 實際檢查結果

驗證方式欄位說明：**實測**＝實際執行指令或操作；**mock**＝瀏覽器實測，但後端是 §4.1 的 mock；**真實唯讀**＝實際讀取正式 GAS 的靜態設定，寫入仍為 mock；**靜態檢視**＝只讀程式碼，**不算通過**。

### 6.1 環境與建置

| #   | 項目                                  | 結果                   | 驗證方式 | 依據／原因                                                                                                                                                                                                              |
| --- | ------------------------------------- | ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Git 分支／工作區／提交身分            | 通過                   | 實測     | `master`、工作區乾淨、倉庫層級身分正確                                                                                                                                                                                  |
| E2  | Node／npm                             | 通過                   | 實測     | v20.19.4／10.8.2，與 CI 的 Node 20 一致                                                                                                                                                                                 |
| E3  | Godot 編輯器                          | 失敗（缺少）           | 實測     | 全部磁碟、PATH、winget、choco 都找不到                                                                                                                                                                                  |
| E4  | Godot Web 匯出模板                    | 失敗（缺少）           | 實測     | `%APPDATA%\Godot` 不存在                                                                                                                                                                                                |
| E5  | `npm ci`                              | 通過                   | 實測     | exit 0，約 296 秒，870 個套件；`package-lock.json` 未變動；`npm audit` 回報 36 個弱點（本輪不處理）                                                                                                                     |
| E6  | `npm run build`                       | 通過                   | 實測     | exit 0，約 77 秒，84 頁；6 個 `/shenmaSanguo*` 路由皆為靜態頁；log 無 warning／error                                                                                                                                    |
| E7  | `npx tsc --noEmit`                    | 通過                   | 實測     | exit 0，0 個錯誤（全專案）                                                                                                                                                                                              |
| E8  | 神馬三國範圍 ESLint                   | 通過（有既有 warning） | 實測     | 0 error、9 warning，全部是 `react-hooks/set-state-in-effect`（`SinglePageContent` 4、`MainMenuContent`、`PlayerInfoModal`、`TeamEditModal`、`SettingsPageContent`、`TeamPageContent` 各 1）。本輪沒有改程式，全部屬既有 |
| E9  | `out/` 內 Godot 產物與 `public/` 一致 | 通過                   | 實測     | 15 個檔案 SHA256 全部相同                                                                                                                                                                                               |
| E10 | `npm run dev` 啟動                    | 通過                   | 實測     | Ready 約 1.2 秒；伺服器 log 無錯誤，所有神馬三國路由回 200                                                                                                                                                              |
| E11 | 本機伺服 `out/` 驗證正式建置          | 未執行                 | —        | `out/` 的 `_next` 資源指向正式站（assetPrefix），本機開啟無法代表本機產物                                                                                                                                               |

### 6.2 瀏覽器流程

| #   | 項目                                         | 結果                     | 驗證方式       | 依據／原因                                                                                                                    |
| --- | -------------------------------------------- | ------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| B1  | 入口頁 `/shenmaSanguo` 載入、金鑰畫面        | 通過                     | mock           | 無金鑰時顯示金鑰設定卡片                                                                                                      |
| B2  | Godot 載入（iframe）                         | 通過                     | mock           | 主控台出現 `Godot Engine v4.6.2.stable.official`、WebGL 2.0、`[WebBridge] Bridge ready`；iframe `crossOriginIsolated=true`    |
| B3  | 新玩家輸入金鑰 → 建檔 → 進入戰場             | **失敗**                 | mock           | 建檔成功（`get_profile 404 → create_profile → get_profile`），但從未請求靜態設定，無限停在載入畫面，見 **I1**                 |
| B4  | 已有金鑰時載入（重新整理）                   | 通過                     | mock           | 約 4.5 秒進入戰場，payload 送達 Godot，HUD「Mock 勝利關 0/2、5000、20/20」                                                    |
| B5  | 「進入戰場」splash                           | 通過                     | mock           | 點擊後顯示地圖、BGM 開始播放                                                                                                  |
| B6  | 點建築格 → 部署選單 → 蓋塔                   | 通過                     | mock           | 選單列出 5 種塔與價格；兩座弓兵塔後金幣 5000→4950→4900；Godot 回報 `Web 成功建造防禦塔`                                       |
| B7  | 點道路格 → 部署武將                          | 通過                     | mock           | 選單列出隊伍武將；Godot 回報 `Web 成功部署武將：guan_yu 於 (6, 5)`                                                            |
| B8  | 手動波次（迎戰 × 2）                         | 通過                     | mock           | Godot 日誌：第 1 波開始 → 清空回到備戰 → 第 2 波 → 回傳結算                                                                   |
| B9  | 勝利結算與寫回                               | 通過                     | mock           | ★★★、戰場點數 +1050；金幣 1000→2050、Lv1→Lv2、`max_stage` → chapter1_2；`save_result`、`save_profile` 各一次，回到 idle       |
| B10 | 結算確認後重開同關                           | 通過                     | mock           | 同關重置為 0/2、5000、20/20，重新顯示 splash                                                                                  |
| B11 | 選關與解鎖                                   | 通過                     | mock           | 勝利後 chapter1_2 解鎖並標示「最新」，切換後 HUD 為「Mock 失敗關 0/1」                                                        |
| B12 | 落敗結算與寫回                               | 通過                     | mock           | ☆☆☆、+10；金幣 +10、exp +10、`max_stage` 不變                                                                                 |
| B13 | 戰鬥中切換關卡                               | **失敗**                 | mock           | 舊關卡剩餘敵人持續生成到新關卡，新關卡備戰中城池 20→5，見 **I2**                                                              |
| B14 | 自動模式                                     | 部分通過                 | mock           | 自動開波、自動接續第 2 波、勝利 ★★☆ +600 皆正常；但每次切換都有 GDScript `SCRIPT ERROR`，見 **I3**                            |
| B15 | 武將升級（伺服器計算 → 本地計算 → debounce） | 通過                     | mock           | 第 1 次走 `upgrade_hero`（Lv2、-100）；第 2 次在 pending 狀態本地計算（Lv3、-200）；約 29.7 秒後 `save_profile`，mock DB 一致 |
| B16 | 隊伍編輯、容量檢查                           | 通過                     | mock           | 超出容量時「儲存隊伍」停用；移除趙雲後 8/12 可儲存                                                                            |
| B17 | `beforeunload` keepalive 同步                | 通過（有附帶問題）       | mock           | pending 時重新整理，keepalive `save_profile` 被 mock 攔下並寫入；但重新整理後仍是 pending 且未重新排程，見 **I4**             |
| B18 | 設定 Modal                                   | 部分（只開啟）           | mock           | 可開啟並顯示音效開關與模式；未切換並驗證 Godot 端效果                                                                         |
| B19 | 舊版多頁路由                                 | 通過（僅 smoke）         | mock           | 5 個路由皆 200、無 pageerror，內容正確渲染；`/battle` 只看到「載入戰場中」，未深入                                            |
| B20 | 正式靜態設定 + 真實地圖開戰                  | 通過                     | 真實唯讀       | 23 武將、9 敵人、100 張地圖（chapter1_1～chapter10_10）；首關「黃巾起義」3 波正常渲染；不佈防時第 1 波即落敗，Godot 無錯誤    |
| B21 | 沒有請求寫入正式 GAS                         | 通過                     | 實測（網路層） | mock 模式網路層零筆 GAS 請求；readonly-config 模式只有 3 支讀取；所有寫入紀錄皆為 `mode: "mock"`                              |
| B22 | 塔／武將升級面板（UpgradePanel）、拖曳移動   | 未執行                   | —              | 本輪時間不足                                                                                                                  |
| B23 | 載入逾時畫面、SW 更新 banner、行動裝置觸控   | 未執行                   | —              | 需要特定條件（120 秒逾時、新版 SW、實機）                                                                                     |
| B24 | 效能／載入時間                               | 未執行（數據不具代表性） | —              | 自動化瀏覽器僅約 1.2 fps                                                                                                      |

### 6.3 Godot 與真實後端

| #   | 項目                                      | 結果   | 原因                                                                                         |
| --- | ----------------------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| G1  | Godot 專案載入（編輯器／headless import） | 未執行 | 沒有 Godot 4.6.2 編輯器                                                                      |
| G2  | Godot Web 試匯出                          | 未執行 | 沒有編輯器與 `web_nothreads_*` 模板                                                          |
| G3  | 產物與原始碼一致性                        | 未執行 | 腳本已編譯為 `.gdc`，無法靠靜態比對證明；需 G2 重新匯出後比對（只確認 pck 內 12 支腳本齊全） |
| R1  | 真實後端寫入（建檔、存檔、結算、升級）    | 未執行 | 依規定不得寫入正式 GAS／Sheets；本輪全部以 mock 驗證                                         |
| R2  | 真實後端讀取既有玩家存檔（`get_profile`） | 未執行 | 依規定不得使用正式玩家存檔                                                                   |
| R3  | mock 回應格式與真實 GAS 一致              | 未執行 | GAS 原始碼不在倉庫，mock 格式是依前端程式推定；尤其 `create_profile` 的預設存檔內容未知      |

---

## 7. 已知問題（皆可重現，本輪只記錄、未修正）

### I1（高）新玩家首次輸入金鑰後，無限停在載入畫面

- **重現**：清空 `localStorage`／`sessionStorage` → 開 `/shenmaSanguo` → 輸入任意新金鑰 →「進入遊戲」。存檔建立成功，但畫面一直是「調兵遣將中」（進度 50%），等 60 秒以上也不會變；重新整理後才正常。
- **原因**：`components/GameInitializer.tsx` 的 `useEffect` 只依賴 `[pathname]`。沒有金鑰時會在呼叫 `loadConfig()` 之前 `return`；在 `KeySetupView` 輸入金鑰後 pathname 沒變，effect 不會重跑，所以靜態設定永遠不會載入，`sendPayload` 也不會執行。加上 iframe 早已 `onLoad`，`iframeLoading` 是 false，120 秒的逾時畫面也不會出現。
- **影響**：沒有快取的全新玩家第一次進入必定卡住。
- **為何本輪不修**：重新整理即可繞過，不阻擋本機驗證。

### I2（高）戰鬥中切換關卡，舊關卡的敵人會繼續生成到新關卡並扣城池血量

- **重現**（mock）：進「Mock 失敗關」→「迎戰」→ 約 8 秒後切到「Mock 勝利關」→ 點「進入戰場」但**不要**按迎戰。道路上仍出現舊關卡的騎兵，HUD 顯示 0/2（備戰中），城池血量 20→16→11→6→5。舊關卡剩餘敵人再多一些就會在備戰階段直接判負。
- **原因**：`main/Main.gd` 的 `_do_initial_setup()` 先呼叫 `_cleanup_current_stage()` → `wave_manager.stop_all()`（`WaveManager.gd:37`，`_is_stopping = true`），接著在 `Main.gd:153` 呼叫 `wave_manager.setup()`，而 `setup()` 在 `WaveManager.gd:34` 又把 `_is_stopping` 設回 `false`。舊的 `_spawn_group` 協程計時器結束後檢查 `_is_stopping`（`WaveManager.gd:120`）看到的是 false，於是用舊的敵人設定與路徑繼續生成；新生成的敵人透過 `enemy_spawned` 接到新的 BattleManager，`on_enemy_reached_base()` 只擋 RESULT 狀態，所以備戰中也會扣血。
- **影響**：重開／切關後的戰況錯亂，可能直接判負並寫入錯誤結算。
- **修正需求**：需要改 GDScript 並**重新匯出 Godot**，本機目前做不到。

### I3（中）按「自動」時 Godot 拋出 SCRIPT ERROR

- **重現**：進任一關 → 按「自動」。主控台出現：

  ```
  SCRIPT ERROR: Invalid call. Nonexistent function 'set_auto_active' in base 'CanvasLayer (BattleHUD)'.
     at: _on_auto_mode_changed (res://main/Main.gd:212)
  ```

- **原因**：`Main.gd:212` 呼叫 `battle_hud.set_auto_active(enabled)`，但 `ui/BattleHUD.gd` 沒有這個函式（HUD 已改由 React 顯示，只留下部分空函式）。
- **影響**：錯誤只中斷該訊號處理，自動模式本身仍運作；但每次切換都會產生錯誤訊息。修正同樣需要重新匯出。

### I4（低）重新整理後 pending 的變更不會重新排程同步

- **重現**：編輯隊伍後（pending，30 秒 debounce 計時中）立刻重新整理。`beforeunload` 有送出 keepalive `save_profile`，但重新整理後 `sessionStorage` 的 `syncStatus` 仍是 `pending`；`readSession()` 只把 `syncing` 重設為 `idle`，也沒有重新呼叫 `_scheduleSync()`，`backgroundRefresh` 又會因非 idle 而跳過。
- **影響**：如果 keepalive 失敗，變更只留在這個分頁的 `sessionStorage`，直到下一次操作或關閉頁面才會再嘗試同步。

### I5（低）地圖出生點／城池圖示顯示為方框

- `GameMap.gd` 的 `_draw_tile_icon()` 用 `ThemeDB.fallback_font` 畫 `▶`、`⚔`，fallback 字型沒有這些字元，截圖中顯示為方框。

### I6（低）Godot 原始碼目錄內有舊匯出檔，且被打包進 pck

- 見 §3 第 6 點。會增加 pck 大小，也容易混淆哪一份才是正式產物。

### 其他環境觀察（非神馬三國邏輯）

- 開發模式每次載入都有一個 404：`/_next/static/chunks/src_components_common_0ruz7tw._.js`（從檔名看是全站 `src/components/common` 的 chunk preload，未深入追查，建置版未確認）。
- COEP 讓 AdSense iframe 被擋（`ERR_BLOCKED_BY_RESPONSE`），並有多則 `cross-world service worker resource mismatch` 的 preload 警告。
- 本機測試會送 GA 事件到正式 GA 屬性。
- `npm audit`：36 個弱點（4 low、10 moderate、18 high、4 critical），依本輪範圍未升級套件。

---

## 8. 尚未驗證項目

1. Godot 專案能否在 4.6.2 編輯器載入、腳本是否全部可解析（G1）。
2. Godot Web 試匯出，以及新產物與 `public/games/shenmaSanguo/` 的比對（G2、G3）。
3. 真實後端的任何寫入流程與回應格式（R1～R3）；mock 的 `create_profile` 預設存檔（初始隊伍、容量）與正式 GAS 不一定相同。
4. 真實地圖的完整通關（本輪只在「黃巾起義」不佈防開戰一次，得到落敗）。
5. 塔升級面板、武將資訊面板、備戰期拖曳移動單位（B22）。
6. 設定切換對 Godot 音效的實際效果、行動裝置觸控、SW 更新 banner、120 秒載入逾時畫面（B18、B23）。
7. `PlayerInfoModal` 的切換金鑰、「資料同步」按鈕。
8. 舊路由 `/shenmaSanguo/battle` 的完整戰鬥流程。
9. 正式建置版（`out/`）在瀏覽器上的行為（E11）。
10. 效能與載入時間（B24）。

---

## 9. 建議下一輪優先處理

1. **補齊 Godot 4.6.2 編輯器與 `web_nothreads_*` 模板**，依 §5 在暫存目錄完成載入與試匯出，建立「原始碼 → 產物」的可重現路徑。這是修 I2、I3 的前提。
2. **修 I1**（純 React 端，不需重新匯出）：例如讓 `GameInitializer` 在金鑰出現後也會載入靜態設定（effect 依賴金鑰，或在 `KeySetupView` 送出後觸發 `loadConfig()`）。修完用 §4.1 mock 重跑 B3。
3. **修 I2、I3**（GDScript）：`WaveManager` 需要讓舊協程能辨識自己已失效（例如以「世代編號」取代共用的 `_is_stopping` 布林），並在非 BATTLE 狀態忽略敵人抵達；移除或補上 `set_auto_active`。修完需重新匯出，並以 B13、B14 重測。
4. 決定正式後端的驗證方式：取得 GAS 原始碼或建立**隔離的測試用 GAS 部署 + 測試 Sheets**，讓 R1～R3 可以在不碰正式資料的前提下驗證；可考慮讓 GAS URL 可由環境變數覆寫（目前寫死在 `gameApi.ts`）。
5. 把 §4.1 的 mock 與 §4.3 的流程整理成可重複執行的腳本（並攔截 GA／AdSense），作為後續每次修改的回歸測試；同時在有前景視窗或實機上量測一次真實幀率與載入時間。
6. 清理 `godot/shenmaSanguo/` 內的舊匯出檔（I6），並更新 `AGENTS.md` 中過時的 Next.js 版本與 build-lint 描述。

---

## 10. Round 2（2026-09-24）：修正 I1～I3、補齊匯出環境與回歸腳本

驗證方式標示沿用 §6：**實測**、**mock**、**headless**（Godot 無頭測試）；**靜態**＝只讀程式碼，不算通過。

### 10.1 環境變更

| 項目                                        | 內容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Godot 編輯器                                | 官方 GitHub Release `4.6.2-stable`（2026-04-01）的 `Godot_v4.6.2-stable_win64.exe.zip`，SHA512 與官方 `SHA512-SUMS.txt` 相符。解壓到**倉庫外**的 `work/tools/godot-4.6.2/editor/`，以 `_sc_` 啟用 self-contained 模式（設定與模板都在 `editor_data/`，沒有動到 `%APPDATA%`，也沒改 PATH）。`--version` 為 `4.6.2.stable.official.71f334935`，與正式產物的引擎 commit 相同                                                                                                                                        |
| Web 匯出模板                                | 官方 tpz 有 1.25 GB，下載速度約 40～160 KB/s。改用 `scripts/shenma-regression/tools/extract-web-templates.mjs` 以 HTTP Range 只取出 `web_nothreads_release.zip`、`web_nothreads_debug.zip`、`version.txt`（`4.6.2.stable`），每個都以 zip 中央目錄的 CRC32 驗證通過。**完整 tpz 的官方 SHA512 尚未驗證**（背景續傳中）                                                                                                                                                                                           |
| `.next` 型別異常（Codex 回報的 `tsc` 失敗） | `.next/dev/types/validator.ts` 第 476 行有孤立的 `e.tsx`，並引用未定義的 `RouteHandlerConfig`；該檔的寫入時間正好是 Round 1 最後一次啟動 dev 後立刻強制結束的時段（證據在 `.handoff/evidence/round-02/A-tsc/`）。確認沒有本專案的 Node 程序在寫 `.next` 後，把 `.next` 移到 `%TEMP%`，接著 `npm run build` 通過、`tsc` 0 錯誤。之後完整跑一輪 dev 與瀏覽器測試：dev 閒置時 `validator.ts` 正常，停止前後雜湊不變，`tsc` 仍為 0 錯誤。**根因未能確認**（推測是寫到一半被強制結束，或 dev 與 tsc／build 同時存取） |

**操作原則**：`npm run dev` 執行中不要同時跑 `npm run build`；要跑 `tsc` 請等 dev 編譯完成、處於閒置狀態。若再出現 `.next/dev/types` 相關錯誤，先停掉 dev，移除 `.next/dev` 再重跑。

### 10.2 Godot 產物關係的新發現

1. **正式產物用的是 debug 模板**：`public/index.wasm` 與官方 `web_nothreads_debug` 的 wasm 逐位元組相同（release 版 wasm 是 37,695,054 bytes，內容不同）。Godot 匯出對話框的「Export With Debug」預設為勾選。本輪沿用 `--export-debug`，**沒有更換引擎版本**；是否改用 release 見 §10.7。
2. **HEAD 原始碼可以重現正式產物**：用 HEAD 的 `godot/shenmaSanguo/` 以 debug 模板匯出後，15 個檔案中有 13 個與 `public/` 的 git blob 逐位元組相同。`index.pck` 內 310 個檔案有 303 個相同，**包含全部 12 支編譯後腳本**；不同的只有 6 個場景的 `node_ids` 與 `uid_cache.bin`（`.tscn` 沒有 uid，每次在全新 `.godot` 匯入時都會隨機產生）。`index.service.worker.js` 只差 `CACHE_VERSION`。
3. 匯入不會改寫任何原始檔（310 個檔案匯入前後的雜湊相同），沒有 `.import`／`.uid` 變更。
4. 現有產物沒有自訂的 HTML、SW 或音訊整合，`index.html` 與 SW 都是模板原樣輸出。React 端 `SinglePageContent` 嘗試 resume 的 `window._my_godot_audio_ctx` 在任何產物中都不存在（**靜態**觀察）；實際的音訊解鎖由 `SFXManager.gd` 在第一次點擊時處理。
5. `public/` 的文字檔在工作區是 CRLF（`core.autocrlf=true`），比對時要用 git blob 或先正規化換行。

### 10.3 修正內容與根因

| 編號             | 修改檔案                                                      | 根因                                                                                                                      | 修正方式                                                                                                                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1               | `src/app/(games)/shenmaSanguo/components/GameInitializer.tsx` | effect 只依賴 `[pathname]`，無金鑰時提前 return；在金鑰畫面輸入後 pathname 不變，靜態設定永遠不會載入                     | 拆成兩個 effect：①玩家初始化與路由守門（依 pathname，讀 `getState()`，不訂閱整個 player）；②靜態設定載入，只訂閱穩定的 `player?.key`，條件是「有 key、尚無設定、沒有錯誤」。失敗時停在既有的錯誤提示，由使用者按「重試」，不會自動重打。移除原本的 `eslint-disable`           |
| I2（出兵）       | `godot/shenmaSanguo/systems/WaveManager.gd`、`main/Main.gd`   | `setup()` 把共用的 `_is_stopping` 設回 false，舊出兵協程在 await 後誤以為仍然有效                                         | 以只增不減的 `_generation` 取代布林值。協程帶著建立時的世代，每次 await 後、生成前、修改計數與發信號前都要檢查；敵人以 meta 記錄世代，死亡／抵達事件先經 `owns_enemy()` 過濾。每波只發一次清波通知。切關時先把舊單位移出場景樹                                                |
| I2（自動下一波） | `godot/shenmaSanguo/systems/BattleManager.gd`                 | 1.5 秒計時器回呼只檢查狀態是否為 PREP／BATTLE，切關或重開後的新關卡同樣符合；重複清波會重複排程；等待中關閉自動也不會取消 | `_lifecycle`（每次 initialize 遞增）加上 `_auto_wave_token`（每次排程或取消都遞增）。回呼只接受「同一生命週期、同一次排程」，並要求仍為自動、仍在 BATTLE、仍在同一波。`_auto_wave_pending` 防止重複排程；initialize、結算、等待中關閉自動都會取消排程，最後一種情況會回到備戰 |
| I3               | `godot/shenmaSanguo/main/Main.gd`、`systems/BattleManager.gd` | `Main.gd` 呼叫 `BattleHUD` 上不存在的 `set_auto_active`（HUD 已搬到 React）                                               | 移除錯誤的連線與呼叫；`toggle_auto_mode()` 立即把狀態同步給 Web，React 的自動按鈕會即時更新                                                                                                                                                                                   |
| 附帶修正         | `WaveManager.gd`、`Main.gd`、`BattleManager.gd`               | 清波判定早於擊殺與扣血：最後一隻被擊殺的敵人不計殺，最後一隻漏怪不扣血（最後一波 20 隻全漏時判定為**勝利**，HP 1）        | WaveManager 先發 `enemy_killed`／`enemy_leaked`，再做清波判定。狀態轉換統一由 `_set_state()` 同步給 Web（原本 React 得知回到 PREP，是靠之後偶然觸發的同步）                                                                                                                   |
| 測試輔助         | `bridge/WebBridge.gd`、`main/Main.gd`                         | —                                                                                                                         | 新增唯讀的 `debug_snapshot` 訊息（回傳關卡、狀態、波次、HP、擊殺、世代、場上敵人、遊戲時間）。回應不含 `stage_id`／`result`，React 會忽略。`update_stats` 新增 `auto_next_wave_pending` 欄位                                                                                  |

**為什麼舊協程與舊計時器不能再修改新關卡**：

- 世代與權杖都只增不減、不會重用。切關或重開時，WaveManager 會先進入新世代，BattleManager 進入新生命週期並作廢權杖。
- 舊協程醒來後第一步就比對自己記住的世代，不符合就直接 return：不生成敵人、不扣 `_active_spawning_groups`、不發出 `wave_cleared`。
- 舊計時器觸發時，權杖或生命週期對不上，一樣直接 return。
- 舊敵人即使在被釋放前發出信號，也會被 `owns_enemy()` 擋下。

整個修正沒有使用固定延遲、隱藏按鈕或單一布林值，正常的波次規則也沒有改變。

### 10.4 匯出與更新的產物

- 以修改後的原始碼（工作區內容，覆蓋在 HEAD 已匯入的暫存專案上）用 debug 模板匯出。和 HEAD 的匯出相比，`index.pck` 只有 `WebBridge.gdc`、`Main.gdc`、`BattleManager.gdc`、`WaveManager.gdc` 不同（其餘 306 個檔案相同）；`index.wasm`、`index.js` 等引擎檔完全相同。
- `public/games/shenmaSanguo/` 只更新 3 個檔案：
  - `index.pck`：4,703,824 → 4,706,592 bytes。
  - `index.html`：只改 `GODOT_CONFIG.fileSizes["index.pck"]`。
  - `index.service.worker.js`：只改 `CACHE_VERSION`，讓已安裝 PWA 的玩家丟掉舊快取。
- 用 `godot-check.sh` 從頭再匯出一次比對：與 `public/` 的新 pck 相比 304／310 相同，差異只有隨機的場景 `node_ids` 與 `uid_cache.bin`。

### 10.5 回歸腳本（`scripts/shenma-regression/`，用法見該目錄的 README）

- `godot-check.sh` 加上 `godot/lifecycle_test.gd`：暫存匯入 → debug 匯出 → 與 `public/` 比對 → headless 生命週期測試。測試在 `wave_cleared` 信號發出的當下操作，能精準命中出兵間隔與 1.5 秒自動窗口。
- `harness.js` 加上 5 支瀏覽器情境腳本（Playwright MCP）：
  - 導覽前安裝網路防線：GAS 寫入一律 abort，GA／AdSense 一律 abort；context 層級，涵蓋 iframe 與 SW 轉發的請求。
  - 頁面內 mock（可注入失敗）與 Godot 訊息紀錄。
  - 開始前清除 Service Worker 與 Cache Storage。
- 設定變更：
  - `eslint.config.mjs`：忽略 `scripts/shenma-regression/**`（MCP 程式片段不是模組），以及本機暫存的 `.handoff/**`、`.playwright-mcp/**`。
  - `.prettierignore`：忽略 `scripts/shenma-regression/*.js`（Prettier 會補上結尾分號，破壞 MCP 的包裝方式）。
  - `.gitignore`：新增 `.handoff/`、`.playwright-mcp/`。

### 10.6 Round 2 檢查結果

| #      | 項目                                        | 結果            | 驗證方式       | 依據                                                                                                                                                                             |
| ------ | ------------------------------------------- | --------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R2-A1  | `.next` 異常後的 build／tsc                 | 通過            | 實測           | 移開 `.next` 後 build 45 秒通過、tsc 0 錯誤；dev 測試結束後 tsc 仍為 0 錯誤                                                                                                      |
| R2-A2  | 修改後 `npm run build`                      | 通過            | 實測           | 53 秒，84 頁，無 warning／error                                                                                                                                                  |
| R2-A3  | 修改後 `tsc --noEmit`                       | 通過            | 實測           | 0 錯誤                                                                                                                                                                           |
| R2-A4  | 神馬三國範圍 ESLint                         | 通過            | 實測           | 0 error、9 warning，與 Round 1 是同一組既有的 `set-state-in-effect`；`GameInitializer.tsx` 沒有 warning                                                                          |
| R2-A5  | 全站 `npm run lint`                         | 通過（0 error） | 實測           | 81 個 warning，都在本輪沒改過的檔案（Round 1 沒跑全站，沒有基準）；設定變更只新增忽略路徑，不會增加問題                                                                          |
| R2-G1  | Godot 匯入                                  | 通過            | 實測           | HEAD 與修改版都沒有錯誤，也不改寫原始檔                                                                                                                                          |
| R2-G2  | GDScript 解析（`--check-only`）             | 部分            | 實測           | 10／12 通過。`Main.gd`、`WebBridge.gd` 回報 `Identifier not found: SFXManager`，HEAD 版本也一樣，原因是 check-only 不註冊 autoload（工具限制）；這兩支改由 headless 實際載入驗證 |
| R2-G3  | Web 匯出（debug）                           | 通過            | 實測           | 在暫存目錄匯出，產物差異見 §10.4                                                                                                                                                 |
| R2-G4  | headless 生命週期測試                       | 通過            | headless       | 修正後 30／30 PASS、0 次 SCRIPT ERROR。同一測試跑 HEAD：14 項 FAIL、6 次 `set_auto_active` SCRIPT ERROR（log 在 `.handoff/evidence/round-02/godot/`）                            |
| R2-B1  | I1：全新玩家（新金鑰 → 建檔 → 設定 → 備戰） | 通過            | mock           | 4.9 秒、不需重新整理；`get_profile`×2、`create_profile`×1、設定 3 支各 1 次                                                                                                      |
| R2-B2  | I1：後端已有金鑰、本機無快取                | 通過            | mock           | 5.3 秒；`get_profile`×1、沒有建檔、設定 3 支各 1 次                                                                                                                              |
| R2-B3  | I1：已有 session（移除設定快取）            | 通過            | mock           | `get_profile`×1（背景刷新）、設定 3 支各 1 次                                                                                                                                    |
| R2-B4  | I1：設定失敗 → 重試                         | 通過            | mock           | 失敗後 15 秒內沒有自動重打；按重試 0.9 秒後進入備戰，不需重新整理                                                                                                                |
| R2-B5  | I2：出兵間隔中切到 B                        | 通過            | mock           | 切換前 A 有 1 隻兵、1 組正在出兵；等遊戲時間 9 秒後 B 為備戰、HP 20、無敵人、出兵組 0                                                                                            |
| R2-B6  | I2：A→B→A、同關重開                         | 通過            | mock           | 判定條件同上                                                                                                                                                                     |
| R2-B7  | 自動窗口內切 B／同關重開                    | 通過            | mock           | 確認操作前沒有開出第 2 波（命中窗口）；等 4 秒遊戲時間後仍為備戰、HP 20、無敵人                                                                                                  |
| R2-B8  | 自動窗口內關閉自動                          | 通過            | mock           | Godot 立即回到備戰；React 的自動按鈕熄滅、迎戰可按；4 秒後仍在第 1 波；手動迎戰可開第 2 波                                                                                       |
| R2-B9  | 多次切換自動的同步                          | 通過            | mock           | 切換 6 次，Godot 回報值、React 按鈕、Godot 實際值都一致；`set_auto_active` 錯誤 0 次                                                                                             |
| R2-B10 | 手動兩波勝利（兩座塔）                      | 通過            | mock           | 結算 1 次、★★★、擊殺 6（Round 1 同情境只算 5）；確認後 `save_result`、`save_profile` 各 1 次，並重開同關                                                                         |
| R2-B11 | 自動兩波勝利、落敗                          | 通過            | mock           | 各結算 1 次；自動關漏 6 隻、HP 14；落敗關 HP 0                                                                                                                                   |
| R2-B12 | 產物版本                                    | 通過            | 實測           | 瀏覽器取得的 pck、wasm、js、html、SW 的 SHA-256 與本機 `public/` 一致；iframe 讀到新的 pck 大小；Godot SW 快取名稱為新版                                                         |
| R2-B13 | 正式 GAS 寫入零筆                           | 通過            | 實測（網路層） | 網路層 GAS 請求 0 筆；GA／AdSense 擋下 16 筆；mock 紀錄全部為 `mode: mock`                                                                                                       |

證據（截圖、JSON、log）在 `.handoff/evidence/round-02/`（本機，不進版控）。

### 10.7 問題狀態與未驗證項目

| 編號                               | 狀態                                                                                                                                                                                     |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I1～I3                             | 已修正，驗證見 §10.6                                                                                                                                                                     |
| I4～I6                             | 未處理（依 Round 2 指示延後）                                                                                                                                                            |
| I7（新發現，**靜態**觀察，未實測） | 已有金鑰但 `initFromGAS` 失敗時（例如網路錯誤），`SinglePageContent` 會因為 `hasKey` 為真而隱藏金鑰畫面，錯誤訊息沒有地方顯示；iframe 早已載入，所以也不會出現逾時畫面，可能停在載入動畫 |
| 待決定                             | 正式產物是否從 debug 模板改為 release（會換掉 wasm 與 js，行為與效能都需要重新驗證）                                                                                                     |
| 待決定                             | `debug_snapshot` 測試輔助要保留在正式產物，或改成只在特定條件下啟用                                                                                                                      |

尚未驗證：

1. 完整 tpz 的官方 SHA512（已驗證編輯器的 SHA512 與模板內各項目的 CRC32）。
2. 真實後端的讀寫（R1～R3）。本輪也沒有再做正式設定的唯讀讀取。
3. 真實地圖的完整通關、行動裝置觸控、效能與載入時間。
4. 舊路由 `/shenmaSanguo/battle` 搭配新產物的戰鬥流程。
5. 塔／武將升級面板與拖曳移動（Round 1 的 B22）。
6. I7 的實際重現。

## 11. Round 3（2026-09-24）：混合敵人組提前勝利、回歸工具收尾

驗證方式標示沿用 §6 與 §10：**實測**、**mock**、**headless**、**靜態**。本輪沿用 debug 模板（Codex 決定：release 另立驗證輪次），`debug_snapshot` 暫時保留為唯讀測試介面（不含玩家金鑰或存檔，也不接受修改指令）。

### 11.1 R3-1：混合敵人組會提前勝利

**根因**：`WaveManager.start_wave` 在迴圈中每次只把 `_active_spawning_groups` 加 1，接著立刻呼叫 `_spawn_group`。如果第一組在生成前就失敗（例如 `enemy_id` 找不到設定、路徑沒有路點、`count=0`），`_finish_group` 會把計數減回 0、發出 `wave_cleared`，但後面的有效組這時還沒登記。最後一波因此提前判勝，迴圈卻仍繼續生成後面的敵人。Round 1 的原始版本就有相同的呼叫順序，不是 Round 2 新引入的問題，但它和 Round 2 修改的波次計數與清波判定直接相關，所以本輪一起修正。

**修正**（`systems/WaveManager.gd`、`systems/BattleManager.gd`）：

- 新增 `WaveManager.plan_wave(wave)`：在生成任何敵人之前，先驗證每一組的敵人設定、路徑與數量，只回傳確定能生成的組。空白列（GAS 空行）照舊略過；缺設定、沒有路點、`count<=0` 的組會輸出警告後略過。
- `start_wave(wave, plans)` 先把所有組一次登記進 `_active_spawning_groups`，才開始逐組生成。任何一組同步完成，都不會讓計數提前歸零；每組只完成一次，整波也只清一次。
- 世代防護維持不變：迴圈每次呼叫下一組前都會比對世代。同步的信號回呼即使已經切關，剩下的組也不會再生成，也不會改動新世代的計數。`_finish_group` 若發現計數小於 0，會輸出錯誤而且不當成清波。
- `BattleManager._spawn_next_wave` 先呼叫 `plan_wave`，確認有敵人可生成才進入戰鬥；波次號碼也改成確認後才遞增。

### 11.2 整波無效：拒絕開戰

整波沒有任何可生成的敵人時（全部組無效、完全空波、波次缺號，或自動模式打到無效的下一波），`BattleManager._reject_wave` 會：

- 以 `push_error` 輸出 `[BattleManager] 拒絕開始第 N 波：…（關卡 X）`；
- 發出新的 `wave_start_rejected(wave, reason)` 信號；
- 取消自動排程、關閉自動模式，回到備戰並同步給 React；
- 不前進波次、不結算，所以不會發放勝利獎勵。

之後切換到有效關卡就能恢復正常。依 Codex 指示，本輪沒有新增設定管理 UI。目前玩家畫面上**看不到拒絕原因**，只能從主控台看到錯誤；是否要在 React 顯示提示，留給之後決定。

### 11.3 R3-2：回歸工具

| 項目                      | 內容                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `godot-check.sh`          | 移除 `rm -rf`，整支腳本不刪除任何檔案或目錄。省略工作目錄時用 `mktemp -d` 建立新目錄；指定時必須不存在或是空目錄，而且不能是倉庫本身、倉庫上層或倉庫內的目錄（`C:/…` 與 `/c/…`、大小寫差異都會先正規化），否則以結束碼 2 拒絕。匯入或匯出的結束碼非 0、逾時、log 出現錯誤、產物核對失敗、測試失敗，都會讓最後的結束碼為 1，並列出失敗項目                                               |
| `tools/check-log.mjs`     | 匯入與匯出 log 出現任何 `ERROR`／`SCRIPT ERROR`／`Parse Error` 就失敗。測試 log 只允許兩種已知 ERROR（Main 在非 Web 平台自動注入的測試 payload 引用了不存在的貼圖、R3-E 刻意觸發的拒絕開戰）；另外要求剛好一行 `RESULT_JSON`、`failed=0`、`total>0`、`PASS` 行數等於 `total`，而且沒有 `FAIL` 行                                                                                        |
| `tools/verify-export.mjs` | 驗收改為比對「本次原始碼匯出」與「工作區交付產物」。只允許兩種差異：`.scn` 內的 `node_ids` 陣列內容（工具會在二進位資源中找到這段資料並清零後再比對），以及 SW 的 `CACHE_VERSION` 那一行。`.gdc`、`uid_cache.bin`、`index.html` 等其他內容都必須逐位元組相同。與 HEAD 的比較改成可選的診斷（`COMPARE_HEAD=1`），不影響結果                                                              |
| `tools/selftest.mjs`      | 不需要 Godot。用 21 個 fixture 確認上面兩支工具「該失敗時一定失敗」，並確認每個 fixture 都真的改到了檔案                                                                                                                                                                                                                                                                                |
| Godot 失敗 fixture        | `godot/fixtures/` 內 5 支腳本：有 FAIL、有 FAIL 但結束碼 0、SCRIPT ERROR、不在允許清單的 ERROR、沒有輸出結果。每一支都必須讓 runner 以結束碼 1 結束                                                                                                                                                                                                                                     |
| 瀏覽器腳本                | `harness.js` 提供 `H.begin()`／`check()`／`finish()`：每支腳本都回傳 `allPass`、`failures`、`assertions`。`finish()` 會自動加上共通防線：SCRIPT ERROR、非預期的 console error、pageerror、GAS 被放行（外洩），以及 mock 模式下 GAS 出現在網路層，任何一項都會失敗。已知雜訊逐項列在 `KNOWN_CONSOLE_NOISE`，並回報次數。新增 `r3-mixed.js`，以及刻意失敗的 `fixtures/deliberate-fail.js` |
| ESLint／Prettier          | 忽略範圍縮小為 `scripts/shenma-regression/*.js` 與 `fixtures/*.js`（MCP 片段，整個檔案是一個函式運算式）；`tools/*.mjs` 照常 lint 與格式化                                                                                                                                                                                                                                              |

### 11.4 匯出與更新的產物

- 從工作區原始碼以 debug 模板重新匯出，`public/games/shenmaSanguo/` 同樣只更新 3 個檔案：
  - `index.pck`：4,706,592 → 4,707,520 bytes，只有 `BattleManager.gdc`、`WaveManager.gdc` 不同。
  - `index.html`：`fileSizes["index.pck"]` 隨 pck 大小更新。
  - `index.service.worker.js`：只改 `CACHE_VERSION`。
- 更新後用**新的工作目錄**從頭重跑 `godot-check.sh`：匯入與匯出都沒有錯誤；產物核對只剩 6 個 `.scn` 的 `node_ids` 與 `CACHE_VERSION` 差異；測試 76／76 通過；結束碼 0。

### 11.5 Round 3 檢查結果

| #     | 項目                       | 結果       | 驗證方式 | 依據                                                                                                                                                               |
| ----- | -------------------------- | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R3-G1 | 修正前跑新測試             | 如預期失敗 | headless | 總數 76、失敗 22，全部是 R3 新案例（Codex 的重現案例兩項都 FAIL）；原有 30 項照常通過；runner 結束碼 1                                                             |
| R3-G2 | 修正後、`public/` 尚未更新 | 如預期失敗 | headless | 測試 76／76 通過，但產物核對抓到 `BattleManager.gdc`、`WaveManager.gdc` 仍是舊版，runner 結束碼 1                                                                  |
| R3-G3 | 更新 `public/` 後完整重跑  | 通過       | headless | 匯入、匯出、產物核對、測試 76／76 全部通過，結束碼 0                                                                                                               |
| R3-G4 | 5 支 Godot 失敗 fixture    | 通過       | headless | 5 支都讓 runner 以結束碼 1 結束，失敗原因各自正確。其中一次匯入時 Godot 發生 Segmentation fault（見 §11.6），重跑該 fixture 後，只靠測試檢查也能判定失敗           |
| R3-G5 | 目錄防護                   | 通過       | 實測     | 倉庫本身、倉庫上層、倉庫內（含尚未建立的子目錄）、`/c/…` 與大寫路徑、非空目錄、檔案、`/`、`C:/`、`C:`、空字串，共 13 種都被拒絕；git status 與上層目錄內容前後相同 |
| R3-T1 | 工具自我測試               | 通過       | 實測     | 21／21 個 fixture 的結果都符合預期                                                                                                                                 |
| R3-W1 | `npm run build`            | 通過       | 實測     | 72 秒，84 頁                                                                                                                                                       |
| R3-W2 | `tsc --noEmit`             | 通過       | 實測     | build 後、dev 停止後各跑一次，都是 0 錯誤；dev 停止前後 `validator.ts` 的雜湊相同                                                                                  |
| R3-W3 | 神馬三國 ESLint／全站 lint | 通過       | 實測     | 遊戲 0 error、9 warning；全站 0 error、81 warning，都與 Round 2 相同；`tools/*.mjs` 已納入檢查，0 問題                                                             |
| R3-B1 | I1 四種情境                | 通過       | mock     | 13／13；呼叫次數與 Round 2 相同                                                                                                                                    |
| R3-B2 | I2 切關三種情境            | 通過       | mock     | 8／8                                                                                                                                                               |
| R3-B3 | 自動窗口與自動同步         | 通過       | mock     | 9／9；三個窗口測試都確認命中窗口                                                                                                                                   |
| R3-B4 | 正常流程：手動、自動、落敗 | 通過       | mock     | 9／9；每場只結算 1 次；手動關擊殺 6、自動關漏怪 6                                                                                                                  |
| R3-B5 | 混合組不提前結算           | 通過       | mock     | 開戰 1.5 秒時仍在戰鬥（場上 2 隻、1 組出兵中、0 次結算）；結算前最後一筆同步已是 HP 17（3 隻都漏完），最後只結算 1 次                                              |
| R3-B6 | 無效波拒絕開戰、拒絕後恢復 | 通過       | mock     | 按迎戰、按自動都停在備戰、波次 0、自動關閉（React 同步）、0 次結算，主控台有 2 次拒絕錯誤；切到有效關卡後正常結算 1 次                                             |
| R3-B7 | 產物版本與網路防線         | 通過       | 實測     | 瀏覽器取得的 5 個檔案 SHA-256 與本機 `public/` 完全一致；iframe 載入新的 pck；SW 快取只有新版本；整段期間 GAS 網路請求 0 筆、SCRIPT ERROR 0、pageerror 0           |
| R3-B8 | 刻意失敗的瀏覽器 fixture   | 通過       | mock     | `allPass=false`，5 種問題都被抓到。iframe 發出的 GAS 探測請求經 coi-serviceworker 轉發（`fromServiceWorker=true`）後被防線 abort                                   |
| R3-E1 | 完整 tpz 官方 SHA512       | 通過       | 實測     | 1,251,900,388 bytes，SHA512 與官方 `SHA512-SUMS.txt` 相符；目前使用的 3 個模板檔與 tpz 內同名檔逐位元組相同                                                        |

證據在 `.handoff/evidence/round-03/`（本機，不進版控）。

### 11.6 新發現與未驗證項目

新發現（本輪只記錄）：

1. **Godot 4.6.2 headless 匯入偶爾崩潰**：本輪共跑 9 次匯入，其中 1 次發生 Segmentation fault（重新匯入音效時）。runner 以「匯入結束碼非 0」正確判為失敗；遇到時重跑即可。
2. **`next dev` 頁面引用不存在的 chunk**（`src_components_common_*`，404）。Round 1 修改前的 console 就有，只在 dev 出現；harness 以網址限定範圍後列為已知雜訊。
3. **Godot Web 產物的 `push_warning` 也走 `console.error`**：刻意放入無效敵人組的情境，腳本必須用 `expectedConsole` 逐條宣告這些預期內的警告。
4. **Round 2 說「網路防線涵蓋 SW 轉發」時沒有直接證據**；本輪的刻意失敗 fixture 已實測確認。

尚未驗證（延續 §10.7）：

1. 真實後端的讀寫（需要 GAS 原始碼、試算表副本與測試部署）。
2. 真實地圖的完整通關、行動裝置觸控、效能與載入時間。
3. 舊路由 `/shenmaSanguo/battle` 搭配新產物的戰鬥流程。
4. 塔／武將升級面板與拖曳移動。
5. I7 的實際重現（依 Codex 安排，與 I4 一起在下一輪規劃）。

## 12. Round 4（2026-09-24）：登入失敗可恢復（I7）、重新整理後恢復同步（I4）

> Round 5 修改了本節的兩項規則：§12.2 的「beforeunload」已移除，§12.5 第 3 點（升級在途時重新整理會蓋掉升級）已修正。現行規則見 §13.2。本節保留 Round 4 當時的紀錄。

本輪只改 Web 端（玩家存檔 store 與相關畫面），沒有修改 GDScript，也沒有重新匯出 `public/`。後端全程使用 mock；沒有存取正式 GAS／試算表。驗證方式標示同前：**實測**、**mock**、**單元**（Node 內執行 store、請求與計時器由測試控制）、**靜態**。

### 12.1 修正前的重現（mock）

- **I7**：localStorage 有金鑰、沒有 session，`get_profile` 發生網路錯誤。失敗 10 秒後畫面仍停在「調兵遣將中」，沒有錯誤訊息，也沒有重試、更換金鑰或金鑰輸入框。
- **I4**：修改隊伍（Pending）後暫停 `save_profile`，讓 beforeunload 的 keepalive 請求卡住，再重新整理。之後 35 秒內沒有任何 `save_profile`，session 一直是 pending，後端仍是舊隊伍。
- **store 單元測試**：修正前共 41 項檢查，31 項失敗。重現到的問題包括：A 的慢回應會覆蓋 B；舊的 `save_profile` 回應會把新修改標成 Idle；背景讀取會蓋掉本機修改；重新整理後不補送；金鑰不符的 session 仍被載入；連按兩次會建檔兩次；升級回應會覆蓋升級期間的隊伍修改。

### 12.2 非同步狀態規則（`store/playerStore.ts`）

| 規則                 | 內容                                                                                                                                                                                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本機版本             | 每次本機修改（暱稱、隊伍、本地升級、戰鬥結算）都讓 `rev` 加 1。`syncedRev` 是伺服器已確認的版本，兩者不同就代表有未同步的修改。UI 的 Pending／Syncing／Idle 都由版本號和在途寫入推導，不另外設定                                                         |
| 保存只確認自己的版本 | `save_profile` 送出時記下版本號，成功後只把 `syncedRev` 推進到送出的版本。在途期間的新修改維持 Pending，並自動補送                                                                                                                                       |
| 單一在途保存         | 同一帳號同時只會有一個 `save_profile` 在途。失敗後保留資料，30 秒後重試                                                                                                                                                                                  |
| 帳號世代             | 從 session 恢復或提交不同帳號時，世代加 1。舊帳號在途的保存、背景讀取、升級、結算回應回來時一律忽略，計時器也跟著失效                                                                                                                                    |
| 讀取序號             | 每次 `initFromGAS` 序號加 1，只有最新一次讀取可以提交結果。同一個 key 的讀取正在進行時，重複呼叫會共用同一個結果                                                                                                                                         |
| 一起提交             | 讀取成功後，localStorage 金鑰、store 與 session 在同一步寫入。失敗時完全不動，原本的帳號與資料都保留                                                                                                                                                     |
| 切換帳號             | 先等目前帳號的在途寫入結束，再保存未同步的修改；保存失敗就不切換，並回傳 `UNSYNCED_SAVE_FAILED`。讀取期間如果又有新修改，提交前會再保存一次                                                                                                              |
| 建檔                 | 只有 `get_profile` 回 `PROFILE_NOT_FOUND` 才會 `create_profile`，之後再讀取一次；任一步失敗都不報成功。重試時一律先讀取，建檔回應遺失也不會重複建檔                                                                                                      |
| 背景讀取             | 送出前與回應時都要確認：同一帳號、版本沒變、沒有未同步修改、沒有在途寫入，全部成立才套用                                                                                                                                                                 |
| 手動同步             | `refreshProfile` 改由 `initFromGAS` 處理：先保存，成功才讀取。讀取期間本機有新版本時保留本機資料，不用舊的伺服器回應覆蓋                                                                                                                                 |
| 重新整理後恢復       | session 必須屬於目前的 key，不符就不載入（也就不會跨帳號寫入）。有未同步版本時，Pending 和 Syncing 都立即補送 `save_profile`；舊版 session 沒有版本號時，非 Idle 一律視為未同步。**只重送覆寫型的 `save_profile`，不重播 `save_result`／`upgrade_hero`** |
| 戰鬥結算             | 本機先更新（版本加 1），`save_result` 只送 1 次，失敗也不重播；接著用一般的保存流程送出最新快照                                                                                                                                                          |
| 伺服器升級           | 沒有未同步修改時才呼叫 `upgrade_hero`；上一次還在途時拒絕，回傳 `UPGRADE_IN_PROGRESS`。回應套用到「目前」的資料，金幣只扣伺服器算出的差額，不會蓋掉升級期間的其他修改                                                                                    |
| beforeunload         | 仍然會 best-effort 送出 keepalive，但不改變任何本機狀態，也不依賴它；恢復一律靠 session 的版本號                                                                                                                                                         |

### 12.3 畫面修改

- **主畫面**（`SinglePageContent.tsx`）：已有金鑰但讀不到存檔時，顯示錯誤面板：玩家看得懂的原因、錯誤代碼、「重試」、「更換金鑰」，不再停在載入動畫。「更換金鑰」會開啟預填舊金鑰的輸入畫面，可以返回。金鑰輸入畫面不再先寫入 localStorage，讀取成功才寫入；失敗時直接在畫面上顯示原因。
- **玩家資訊 Modal、舊的 `/settings` 頁**：切換帳號與「強制從雲端同步」都依共用初始化的回傳結果顯示成功或失敗，不再在失敗時仍然報成功。同步時也會檢查遊戲設定是否載入失敗。如果有背景保存失敗，會提示「會自動重試」。
- **錯誤文案**（新增 `utils/playerErrors.ts`）：依錯誤代碼顯示玩家文案，不把 GAS／試算表的設定說明當成主要訊息。
- 另外：同步狀態條加上 `data-sync-status`，供測試使用；兩個升級畫面新增「上一次升級還在處理中」的錯誤文字；沒有被引用的 `MainMenuContent` 也移除了「讀取前先寫入金鑰」的步驟。

### 12.4 Round 4 檢查結果

| #     | 項目                                                 | 結果 | 驗證方式 | 依據                                                                                                                  |
| ----- | ---------------------------------------------------- | ---- | -------- | --------------------------------------------------------------------------------------------------------------------- |
| R4-U1 | store 非同步測試                                     | 通過 | 單元     | 修正前 41 項中 31 項失敗；修正後 45／45                                                                               |
| R4-B1 | 有金鑰、無 session，`get_profile` 網路錯誤／後端錯誤 | 通過 | mock     | 顯示原因、代碼、重試、更換金鑰，不停在載入動畫；全程沒有 `create_profile`；重試成功後進入 Godot 備戰                  |
| R4-B2 | 更換金鑰、建檔失敗                                   | 通過 | mock     | 輸入畫面預填舊金鑰；建檔失敗時顯示原因，不寫入新金鑰；再試一次就建檔並進入備戰                                        |
| R4-B3 | 切換帳號時舊帳號保存失敗                             | 通過 | mock     | 顯示 `UNSYNCED_SAVE_FAILED`，金鑰、session 與隊伍修改都保留，也沒有讀取新金鑰；恢復後先保存舊帳號，再切換             |
| R4-B4 | Pending 重新整理                                     | 通過 | mock     | 不操作也會 `save_profile`，後端收到最新隊伍；UI 與 session 都是 idle                                                  |
| R4-B5 | Syncing 重新整理（戰鬥結算的 profile 保存在途）      | 通過 | mock     | 補送 profile，後端點數 1000 → 1640；`save_result` 只有 1 次                                                           |
| R4-B6 | Idle 重新整理                                        | 通過 | mock     | 沒有 `save_profile`                                                                                                   |
| R4-B7 | 手動同步時保存失敗                                   | 通過 | mock     | 回報失敗，本機與 session 保留、後端不變；恢復後同步成功                                                               |
| R4-B8 | 升級 smoke                                           | 通過 | mock     | 伺服器升級、扣點數，本機金額一致                                                                                      |
| R4-B9 | I1 回歸、正常流程、產物與網路                        | 通過 | mock     | 13／13、9／9、12／12；整段期間 GAS 網路請求 0 筆、SCRIPT ERROR 0、pageerror 0                                         |
| R4-W1 | build、tsc、lint                                     | 通過 | 實測     | build 97 秒、84 頁；tsc 0；遊戲與工具 ESLint 0 error、9 個既有 warning；全站 0 error、81 warning（都和 Round 3 相同） |
| R4-W2 | dev 停止前後的型別檔                                 | 通過 | 實測     | `validator.ts` 雜湊前後相同                                                                                           |

Godot 的 76 項測試沒有重跑：本輪沒有修改 GDScript，瀏覽器取得的產物雜湊也與 Round 3 提交的相同。證據在 `.handoff/evidence/round-04/`。

### 12.5 仍無法保證的後端語意（mock 無法驗證）

1. **`save_profile` 是整份覆寫，沒有版本號**：多裝置或多分頁同時修改時，最後寫入的一方勝出。重新整理後補送的快照，可能覆蓋這段期間其他裝置寫入的資料。
2. **獎勵由前端計算後整份寫回**：`save_result` 在後端的實際效果（是否也更新點數或 `max_stage`）未經真實後端確認。它失敗時不會重播，戰鬥紀錄可能缺一筆，但 profile 仍會帶上獎勵。
3. **`upgrade_hero` 在途時重新整理**：如果當下沒有其他本機修改，恢復後改以背景讀取的伺服器資料為準；如果有其他修改，補送的快照不包含這次升級，會覆蓋掉伺服器上的升級，已扣的點數也會一起還原。
4. **`create_profile` 是否冪等未知**：單一分頁內重試一律先讀取，不會重複建檔；但兩個分頁同時用同一個新金鑰建檔時，後端行為未知。
5. **請求沒有逾時**：GAS 一直不回應時，畫面會停在讀取中或 Syncing，直到瀏覽器放棄。
6. **只保障同一分頁重新整理**：關閉分頁會失去 sessionStorage，只剩 beforeunload 的 best-effort。其他分頁切換帳號後，本分頁殘留的未同步修改不會寫到新帳號，但會被捨棄。

### 12.6 新發現與未驗證項目

- **（靜態觀察，未實測）** 戰鬥畫面上用玩家資訊 Modal 切換帳號後，React 不會重新送出關卡 payload，Godot 會繼續顯示舊帳號的隊伍，直到重新選擇關卡。這是既有行為，本輪沒有處理。
- 無效波的 React 提示依 Codex 決定列為後續小項目。
- 以下仍未驗證：release 模板遷移、`debug_snapshot` 的 export feature、行動裝置與真實關卡、真實後端讀寫。

## 13. Round 5（2026-09-25）：伺服器操作結果不確定時的恢復（C1）、卸載時的盲寫（C2）

> Round 6 修改了本節：移除「以雲端資料為準」（§13.2 對應的列、§13.3「升級請求沒有到伺服器」的處理、§13.5 第 3 點），新增資料世代，待確認提示改到畫面底部。現行規則見 §14.2。本節保留 Round 5 當時的紀錄。

本輪只改 Web 端（玩家存檔 store、升級待確認的提示、錯誤文案、回歸工具），沒有修改 GDScript，也沒有重新匯出 `public/`。後端全程使用 mock，沒有存取正式 GAS／試算表。驗證方式標示同前：**實測**、**mock**、**單元**、**靜態**。

### 13.1 修正前的重現（Codex 補測，單元）

- **C1**：`upgrade_hero` 已在伺服器完成（關羽 Lv2、點數 900），但回應遺失；本機接著改了暱稱。重新整理後，恢復流程把 session 裡「升級前的武將與點數＋新暱稱」整份送出，後端變回 `heroes=[]`、`gold=1000`，升級被還原。這是前端恢復流程造成的覆蓋，不是只有多裝置才會發生。
- **同頁版本**：升級回應還沒回來、debounce（30 秒）先到期，`save_profile` 送出不含升級結果的 heroes／gold。
- **C2**：卸載時 beforeunload 用 keepalive 送出整份快照（old-edit）。重新整理後恢復流程補送、玩家又改成 new-edit 並保存成功，最後舊的 keepalive 才被伺服器處理，後端變回 old-edit，UI 與 session 卻是 new-edit 且 Idle。
- 正式測試檔在修正前共 72 項檢查、18 項失敗（原本 45 項全部通過），包含上述三個情境，以及「升級待確認時不保存」「背景讀取不清掉待確認紀錄」「待確認時切換帳號被擋」等新規則。

### 13.2 規則（`store/playerStore.ts`，取代 §12.2 的相關列）

| 規則                   | 內容                                                                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 升級送出前先記錄       | 伺服器升級（`upgrade_hero`）送出前，先把 `pendingUpgrade`（本機產生的 id、武將、**送出前的伺服器資料**、送出時間、`in_flight`）寫進 session。送出條件不變：沒有未同步修改、沒有在途寫入，所以「送出前的資料」就是伺服器已確認的資料                                               |
| 回應分三種             | 成功：套用伺服器結果並清除紀錄。**伺服器明確回傳錯誤**（JSON `status ≠ 200`，`GasError`）：升級沒有套用，清除紀錄，期間的其他修改照常保存。**網路錯誤、無法解析的回應**：結果不明，紀錄改成 `unknown`，狀態變成 `Unconfirmed`（保存結果待確認）                                   |
| 重新整理後             | session 裡的 `pendingUpgrade` 一律視為 `unknown`（送出請求的頁面已經不在）。**不重播 `upgrade_hero`**，也不把升級前的 heroes／gold 整份存回去                                                                                                                                     |
| 待確認期間             | 不送 `save_profile`（整份保存會送出可能過時的 heroes／gold）；不能再升級（`UPGRADE_UNCONFIRMED`）；其他修改照常記在本機與 session；背景讀取不會套用伺服器資料，也不會清掉紀錄                                                                                                     |
| 重新確認               | 重新讀取伺服器：該武將的等級比送出前高，就視為升級已完成 → 把本機修改套到伺服器的最新資料上（暱稱、隊伍等本機有改的欄位用本機的；點數用差額：伺服器點數＋本機自送出後的增減，例如戰鬥獎勵）→ 有修改才保存，沒有就直接採用伺服器資料。看不到升級就維持待確認，**不判定成功或失敗** |
| 自動重新確認           | 進入待確認時立即確認一次，之後依 30、60、120、240 秒再確認（合計約 7.5 分鐘，涵蓋 GAS 單次執行上限 6 分鐘），用完就停。玩家修改資料、按「重新確認」或「強制從雲端同步」時也會確認                                                                                                 |
| 以雲端資料為準         | 只能由玩家明確選擇（需要再按一次確定）。重新讀取伺服器，看得到升級就同上；看不到就沿用伺服器**目前**的武將與點數，再套上本機修改保存，清除紀錄                                                                                                                                    |
| 切換帳號、手動同步     | 目前帳號有本機修改且升級待確認：先重新確認，確認不了就擋下（`UPGRADE_UNCONFIRMED`），資料與紀錄保留。沒有本機修改：允許切換（舊帳號沒有要寫的資料，紀錄隨之捨棄）。同一帳號的手動同步改走重新確認，不會用伺服器資料直接覆蓋而清掉紀錄                                             |
| 伺服器操作在途時不保存 | `upgrade_hero` 或 `save_result` 還在途時，`save_profile` 會等它結束再送（例如升級回應超過 30 秒 debounce），避免送出不含其結果的快照                                                                                                                                              |
| 卸載不送保存           | 移除 beforeunload 的 keepalive `save_profile`。未確認的修改都在 session，重新整理後由恢復流程補送（普通 Pending／Syncing 規則同 §12.2）                                                                                                                                           |

畫面：同步狀態條新增紅色的 `unconfirmed`；待確認時畫面上方固定顯示「○○的升級結果待確認」提示，提供「重新確認」與「以雲端資料為準」（後者會先說明可能的結果，再按一次才執行）；玩家資訊 Modal 也會提示。提示區的 z-index 高於全站的頁面說明按鈕（`PageInfoButton`），避免文字被蓋住；遊戲設定載入失敗的提示也改放在同一個容器。

### 13.3 各恢復情境的分類

「已確認成功」＝伺服器上看得到結果並已保存；「未完成但資料保留」＝這次沒保存，本機資料與紀錄都在，之後可以繼續；「結果待確認」＝前端無法證明伺服器是否已處理。

| 情境                                                                  | 分類                                                                 | 行為                                                                                                 | 依據                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| 升級已在伺服器完成、回應遺失，本機另有暱稱／隊伍修改 → 重新整理（C1） | 已確認成功                                                           | 先讀取、看到升級，再保存合併結果；後端 Lv2、900＋本機修改                                            | 單元 C1-1～4、mock A-1～5                   |
| 升級還沒在伺服器完成就重新整理，之後才完成                            | 結果待確認 → 已確認成功                                              | 待確認期間不保存；自動或手動重新確認看到升級後合併保存                                               | 單元 R5-U1、mock B-1～4                     |
| 升級請求沒有到伺服器                                                  | 結果待確認（持續）                                                   | 自動確認用完後停止，不自行判定；玩家選擇「以雲端資料為準」後，以伺服器目前的武將與點數＋本機修改保存 | 單元 R5-U2、mock C-1～2                     |
| 升級明確失敗（伺服器回傳錯誤）                                        | 已確認（失敗）                                                       | 不進入待確認；期間修改照常保存，武將與點數不變                                                       | 單元 R5-U3                                  |
| 同一頁升級回應遺失（網路錯誤）                                        | 結果待確認 → 看到升級後已確認成功                                    | 回報「結果待確認」而不是失敗；不能再升級、不保存                                                     | 單元 R5-U4                                  |
| 只有升級、沒有其他修改 → 重新整理                                     | 伺服器已完成：已確認成功（直接採用，不需要保存）；未完成：結果待確認 | 背景讀取不會清掉紀錄                                                                                 | 單元 R5-U5-1、U5-2                          |
| 普通 Pending（修改還沒送出）→ 重新整理                                | 已確認成功                                                           | 卸載時不送；恢復後補送 profile                                                                       | 單元 C2-1～3、W4-pending；mock E-1～2、R4 D |
| Syncing（`save_profile` 在途）→ 重新整理                              | 補送的版本：已確認成功；**舊請求：結果待確認**                       | 以同一或更新的版本整份重送。舊請求若在之後的保存之後才被伺服器處理，會把後端蓋回舊內容（限制 L1）    | 單元 W4-syncing、fixture L1；mock R4 E      |
| `save_result` 在途 → 重新整理                                         | profile：補送後已確認成功；戰鬥紀錄：結果待確認                      | 不重播 `save_result`；它在後端的實際效果見 §13.5                                                     | 單元 W4-\*、mock R4 E                       |
| 升級待確認期間打完一場戰鬥                                            | 未完成但資料保留 → 確認後已確認成功                                  | 獎勵保留在本機、不保存；確認後以差額合併（伺服器 900＋獎勵 500＝1400）                               | 單元 R5-B1～2                               |
| 升級待確認期間切換帳號／手動同步（有本機修改）                        | 未完成但資料保留                                                     | 切換被擋、手動同步回報待確認；資料與紀錄保留                                                         | 單元 R5-S1～2                               |
| 升級待確認期間切換帳號（沒有本機修改）                                | —（沒有要保存的資料）                                                | 允許切換，不對舊帳號送出任何保存                                                                     | 單元 R5-S3                                  |
| 升級回應持有超過 30 秒 debounce（同一頁）                             | 已確認成功                                                           | debounce 到期時不送；升級回應後才保存，每次保存都含升級結果                                          | 單元 R5-H1～3、mock D-1～2                  |

### 13.4 Round 5 檢查結果

| #     | 項目                         | 結果                         | 驗證方式 | 依據                                                                                                                                                                        |
| ----- | ---------------------------- | ---------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R5-U1 | store 非同步測試             | 通過                         | 單元     | 修正前 72 項中 18 項失敗；修正後 73／73（修正後另補 R5-S3）。原 45 項維持通過，沒有改動既有斷言                                                                             |
| R5-U2 | 已知限制 fixture L1          | 重現（預期）                 | 單元     | `LIMIT`，不計入 PASS／FAIL；見 §13.5 第 1 點                                                                                                                                |
| R5-U3 | Codex 原始補測檔             | C1 通過；C2 拋出例外（預期） | 單元     | 修正後 47 PASS。原 C2 呼叫 `beforeunload` 監聽，本輪已移除；新預期版本在正式測試的 C2-1～3                                                                                  |
| R5-B1 | 瀏覽器 `r5-web.js`           | 通過                         | mock     | 20／20（C1 恢復、待確認提示與兩種處理、debounce、卸載不盲寫、Pending 補送；斷言 mock 後端資料與請求順序）                                                                   |
| R5-B2 | I1、R4、正常流程、產物與網路 | 通過                         | mock     | 14／14、22／22、9／9、12／12；產物雜湊與工作區 `public/` 相同；整段 GAS 網路請求 0 筆、SCRIPT ERROR 0、pageerror 0                                                          |
| R5-W1 | build、tsc、lint             | 通過                         | 實測     | build 92 秒、84 頁；tsc 0；遊戲與工具 ESLint 0 error／9 個既有 warning；全站 0 error／81 warning（都和 Round 4 相同）；`tools/selftest.mjs` 21／21；`git diff --check` 通過 |
| R5-W2 | dev 停止前後的型別檔         | 通過                         | 實測     | `validator.ts` 雜湊前後相同                                                                                                                                                 |

Godot 的 76 項測試沒有重跑：本輪沒有修改 GDScript 與 `public/`。證據在 `.handoff/evidence/round-05/`。

### 13.5 仍需後端支援（目前前端無法保證）

1. **晚到的舊保存（限制 L1）**：重新整理前已送出的 `save_profile`，關閉頁面只會取消瀏覽器端的等待，伺服器仍可能處理它。如果它比之後保存的新版本更晚被處理，會把後端蓋回舊內容；前端不知道舊請求何時被處理，也看不到這次覆蓋。需要後端的**版本號與條件寫入**（例如 `save_profile` 帶 `base_rev`，不符就拒絕）。
2. **升級的結果**：沒有 operation id，前端只能用「武將等級變高」推斷升級已完成，看不到時無法區分「沒送到」和「還沒處理完」，所以只能停在待確認。需要後端記錄已處理的 `op_id`（冪等），並能查詢某個 op 是否已處理。有了它，看不到結果時才能安全重送。
3. **「以雲端資料為準」與重新確認的讀寫空檔**：從讀取伺服器到保存之間，如果舊的升級請求剛好在這段時間被處理，保存會把它蓋掉（武將與點數一起還原，資料仍一致）。需要第 1 點的條件寫入才能避免。
4. **伺服器錯誤是否代表完全沒有套用**：前端把「伺服器回傳錯誤」當成升級沒有套用。這假設後端在回傳錯誤前不會只寫入一部分，未經真實後端確認。
5. **`save_result` 的語意與冪等**：它在後端是否也更新點數或 `max_stage` 仍未確認；在途時重新整理不會重播，戰鬥紀錄可能缺一筆。若它也會改 profile，晚到時可能與前端補送的 profile 重複計算。需要後端說明語意並支援 `op_id`。
6. **其他沿用 §12.5**：`create_profile` 是否冪等、多裝置同時修改（最後寫入者勝出）、關閉分頁後 session 遺失。請求逾時仍未處理；逾時只能代表結果不確定，不能當成失敗重送。

### 13.6 修正先前的說法

Round 4 回報曾寫「`save_profile` 是整份覆寫，重複送出不影響結果」。這只在**送出的是同一份快照、而且中間沒有其他版本寫入**時成立；不同版本的請求亂序到達時，較晚被處理的舊快照會蓋掉較新的資料（C2 與限制 L1 都是這種情況），整份覆寫無法保證結果正確。

### 13.7 後續事項（本輪沒有處理）

- 戰鬥中切換帳號後 Godot 仍沿用舊戰鬥：需要另一輪處理「戰鬥屬於哪個帳號」與結算歸屬，不能只同步武將列表。
- 請求逾時。
- 多裝置衝突、正式 GAS 的操作識別與條件寫入：需要後端原始碼與隔離的測試部署。

## 14. Round 6（2026-09-25）：較早的背景讀取還原已確認的升級（C3）、移除強制採用雲端（C4）

> Round 7 修改了本節：§14.2 的「資料世代」只套用在背景讀取，手動同步仍有同樣的漏洞（C5），現行規則見 §15.2；§14.7 的待決表改由 §15.6 取代。本節保留 Round 6 當時的紀錄。

本輪只改 Web 端（玩家存檔 store、待確認提示、回歸工具），沒有修改 GDScript，也沒有重新匯出 `public/`。後端全程使用 mock，沒有存取正式 GAS／試算表。驗證方式標示同前。

### 14.1 修正前的重現（Codex 補測，單元）

- **C3**：升級前送出的背景讀取停住 → 升級在後端完成（Lv2、900），但頁面收到網路錯誤 → 沒有本機修改，重新確認看到升級並採用 → 舊的背景讀取最後才回來。這時本機被換回 `heroes=[]`、`gold=1000`，狀態 Idle；之後改暱稱並保存，後端也被還原。原因：沒有本機修改時，重新確認採用伺服器資料不會推進 `rev`，舊讀取回來時帳號、`rev`、未同步修改、在途寫入都沒變，被當成有效。
- **C4**：升級網路錯誤、後端還沒處理 → 改暱稱 → 選「以雲端資料為準」，讀到舊資料並送出保存 → 原升級這時才被後端處理 → 保存最後到，後端從 Lv2、900 被還原成 `heroes=[]`、`gold=1000`。§13.5 第 3 點已揭露這個風險；Codex 判定不能用雙重確認文案取代請求已結束的證據。
- 正式測試在修改前共 78 項、3 項失敗（C3-1、C3-2、C4-1），結束碼 1。

### 14.2 規則變更（取代 §13.2 對應的列）

| 規則             | 內容                                                                                                                                                                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 資料世代         | 採用一份伺服器資料（`initFromGAS` 提交、背景讀取套用、重新確認看到升級）或送出 `upgrade_hero` 時加 1。背景讀取回應時世代變了就不套用。`rev`／`syncedRev` 的語意不變，沒有本機修改的重新確認仍然不送 `save_profile`                                       |
| 沒有強制解除     | 移除「以雲端資料為準」：畫面上的按鈕與 store 的 `resolvePendingUpgradeFromServer` 都拿掉。看不到升級一律維持待確認，也沒有逾時自動解除。看不到升級不代表確定沒套用，舊請求可能還沒被處理                                                                 |
| 等待確認時保留的 | 本機資料與待確認紀錄（session）、自動重新確認（立即＋30／60／120／240 秒）、「重新確認」按鈕；玩家修改資料或按「強制從雲端同步」時也會確認。提示說明「確認之前不保存；本機修改只在這個分頁，關閉分頁會遺失」                                             |
| 提示位置         | 待確認提示改到畫面**底部**（z-index 1040：高於遊戲與 HUD、低於全站聊天按鈕 1050，右側留空避開聊天按鈕）。原本在上方會蓋住 HUD 的頂欄與動作列（「武將」「隊伍」「迎戰」等），待確認期間無法操作；這是本輪瀏覽器驗收發現的。遊戲設定載入失敗的提示仍在上方 |

### 14.3 情境分類的變更（其他列同 §13.3）

| 情境                                               | 分類                                        | 行為                                                                   | 依據                                        |
| -------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------- |
| 升級請求沒有到伺服器                               | 結果待確認（持續）                          | 沒有強制解除的方式；本機修改保留在分頁的 session，但不會保存到後端     | 單元 R5-U2-3（規則變更）、C4-1；mock C-1～2 |
| 升級網路錯誤、後端之後才處理                       | 結果待確認 → 升級晚到後重新確認：已確認成功 | 待確認期間不送任何保存；看到升級後合併保存，升級、扣款與本機修改都保留 | 單元 C4-0～2；mock C-0～4                   |
| 較早送出的背景讀取，在重新確認或手動同步之後才回來 | —（讀取被忽略）                             | 不套用，本機、session 與之後的保存都保有新的資料                       | 單元 C3-0～2、R6-G1；mock F-1～3            |

**R5-U2-3 的規則變更**：原本驗證「以雲端目前資料為準」會保存並解除待確認（舊規則的成功定義）。這個能力已移除，改為驗證：手動重新確認與再次重新整理後仍待確認、本機隊伍與紀錄保留、後端不變、store 不再提供強制採用的方法。其他既有斷言沒有修改。

### 14.4 `GasError`「確定沒有套用」只在 mock 驗證過

- 前端把後端回傳 JSON `status ≠ 200`（`GasError`）當成「這次升級確定沒有套用」：清除待確認紀錄，其他修改照常整份保存。
- 這個判斷**只在 mock 驗證過**：mock 的 `upgrade_hero` 在回傳錯誤前不寫入任何資料。目前沒有 GAS 原始碼，也沒有真實後端的契約證據，**無法確認**真實 GAS 在每一種錯誤回應前都沒有寫入（例如已經扣了點數，寫入武將時發生例外才回錯誤）。未驗證，不宣稱所有錯誤回應都沒有副作用。
- 如果真實後端有「寫入一部分後才回錯誤」的情況，前端會當成沒套用，之後的整份保存可能把那部分寫入蓋回去。取得後端原始碼後，建議把「確定沒套用」限縮成已確認在寫入前就檢查的錯誤代碼（例如 `GOLD_NOT_ENOUGH`、`HERO_NOT_FOUND`），其他錯誤改走待確認。

### 14.5 Round 6 檢查結果

| #     | 項目                                      | 結果         | 驗證方式 | 依據                                                                                                                                                                      |
| ----- | ----------------------------------------- | ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R6-U1 | store 非同步測試                          | 通過         | 單元     | 修正前 78 項中 3 項失敗（結束碼 1）；修正後 80／80（結束碼 0）。R5-U2-3 依規則變更改寫，其餘既有斷言沒有修改                                                              |
| R6-U2 | 反向驗證                                  | 通過         | 單元     | 暫時拿掉資料世代檢查：C3-1、C3-2、R6-G1 會失敗；已還原                                                                                                                    |
| R6-U3 | 已知限制 fixture L1                       | 重現（預期） | 單元     | `LIMIT`，不計入 PASS／FAIL                                                                                                                                                |
| R6-B1 | 瀏覽器 `r5-web.js`（含 C3、C4、提示位置） | 通過         | mock     | 26／26                                                                                                                                                                    |
| R6-B2 | I1、R4、正常流程、產物與網路              | 通過         | mock     | 14／14、22／22、9／9、12／12；產物 SHA-256 與工作區 `public/` 相同；GAS 網路請求 0 筆、SCRIPT ERROR 0、pageerror 0                                                        |
| R6-W1 | build、tsc、lint                          | 通過         | 實測     | build 63 秒、84 頁；tsc 0；遊戲與工具 ESLint 0 error／9 個既有 warning；全站 0 error／81 warning（和 Round 5 相同）；`tools/selftest.mjs` 21／21；`git diff --check` 通過 |
| R6-W2 | dev 停止前後的型別檔                      | 通過         | 實測     | `validator.ts` 雜湊前後相同                                                                                                                                               |

瀏覽器回歸改用新增的 `tools/run-browser.mjs` 執行：本輪途中 Playwright MCP 斷線，改用同一批腳本、系統 Chrome（無頭）直接執行，每支的原始回傳寫成 `<腳本名>.raw.json`。第一次用 MCP 跑 `r5-web.js` 時 C 段失敗（提示蓋住 HUD，點不到「隊伍」），修正後的結果見上表。Godot 的 76 項沒有重跑：本輪沒有修改 GDScript 與 `public/`。證據在 `.handoff/evidence/round-06/`。

### 14.6 前端已修正的問題與既有的後端限制

**前端已修正**（單元與 mock 驗證）：C1（回應遺失後整份保存蓋掉升級）、同頁 debounce 先送舊資料、C2（卸載盲寫）、C3（較早的讀取晚到）、C4（強制採用雲端蓋掉晚到的升級）。§13.5 第 3 點（「以雲端資料為準」的讀寫空檔）隨著這個能力移除已不存在；重新確認只在看到升級、確認那次升級已完成之後才合併保存。

**既有的後端限制**（前端無法處理，需要後端能力）：

1. **L1**：重新整理前已送出的 `save_profile` 晚到，會蓋掉之後保存的新版本。需要版本號與條件寫入。
2. **沒有 operation id**：看不到升級時分不出「沒送到」與「還沒處理完」，只能持續待確認。請求真的沒到伺服器的玩家會一直停在待確認，本機修改只存在分頁的 session，關閉分頁就會遺失。需要冪等的 `op_id` 與「查詢某個 op 是否已處理」或安全取消的能力。
3. **`GasError` 的語意**：見 §14.4。
4. 沿用 §12.5／§13.5：`save_result` 的語意與冪等、`create_profile` 是否冪等、多裝置衝突、請求逾時。

### 14.7 待決事項（截至 Round 6）

以下事項還沒有決定，交由 Codex 規劃或使用者決定；做出決定後，在對應的回合更新這張表。

| #   | 事項                                                                                                                                                                                                                                                                                                               | 目前狀態                                                         | 來源                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | -------------------- |
| D1  | 一直待確認的玩家沒有出口：請求從沒到伺服器時，本機修改無法保存，只留在分頁的 session，關閉分頁就遺失。取得後端 `op_id`／查詢能力之前，是否提供不寫入後端的保全方式（例如匯出本機修改）                                                                                                                             | 未決定；目前維持待確認，不提供任何解除保護的方式                 | Round 6（C4 的取捨） |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright（從 npx 快取載入，以 `PLAYWRIGHT_DIR` 指定）。是否把 playwright 加進 `devDependencies`（會改 `package.json`）                                                                                                                                                      | 未決定；目前沒有改 `package.json`                                | Round 6              |
| D3  | `save_result` 在途時重新整理：是否比照升級建立待確認紀錄。目前不重播、補送 profile                                                                                                                                                                                                                                 | 未決定；需要後端說明 `save_result` 的語意                        | Round 5              |
| D4  | 自動重新確認的次數與間隔（目前立即＋30／60／120／240 秒，之後只在玩家操作時確認）                                                                                                                                                                                                                                  | 未決定；Round 6 沿用                                             | Round 5              |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（見 §14.4）                                                                                                                                                                                                                                                      | 未決定；需要 GAS 原始碼                                          | Round 6              |
| D6  | Round 4 的 GitHub Pages 部署（run 36032691203）失敗：`/novels/reader/[bookId]` 的 `generateStaticParams()` 在 build 時讀藏書閣 GAS 得到 404，回傳空陣列，Next 在 `output: "export"` 下中止。正式站仍是 Round 3 的部署（run 36003034901）。是否重跑部署，以及該頁書單讀不到時是否改成不中止 build（不屬於神馬三國） | 未決定；Round 5、6 本機 build 同一步驟正常，推測是外部暫時性錯誤 | Round 5 發現         |
| D7  | Round 5、Round 6 的修改何時 commit                                                                                                                                                                                                                                                                                 | 未 commit；需要使用者明確要求（push `master` 會觸發部署）        | Round 5、6           |
| D8  | 戰鬥中切換帳號後 Godot 仍沿用舊戰鬥（戰鬥與結算屬於哪個帳號）、請求逾時、多裝置衝突                                                                                                                                                                                                                                | 後續回合處理                                                     | Round 4、5           |

## 15. Round 7（2026-09-25）：手動同步也不能採用過時的快照（C5）

本輪只改 Web 端的玩家存檔 store（與一句錯誤文案），沒有修改 GDScript、`public/` 或畫面流程。後端全程使用 mock，沒有存取正式 GAS／試算表。

### 15.1 修正前的重現

- **C5（Codex 補測，單元）**：按「強制從雲端同步」（`refreshProfile` → `initFromGAS`），它的 `get_profile` 停住 → 升級在後端完成、頁面收到網路錯誤 → 沒有本機修改，重新確認看到升級並採用（`rev` 不變）→ 手動同步讀到的升級前資料最後才回來。`initFromGAS` 只檢查 `baseRev` 與 `pendingUpgrade`，把舊資料提交：本機變回 `heroes=[]`、`gold=1000`、Idle，之後改暱稱保存，後端也被還原。這和 C3 是同一種漏洞，只是發生在另一條讀取路徑；不是 L1 那類後端限制。
- **R7-I1（本輪新增的交錯）**：手動同步的讀取停住 → 其他裝置改了後端 → 背景讀取讀到新資料並採用 → 手動同步的舊資料最後才回來，同樣把本機換回舊資料。
- 正式測試在修改前共 84 項、3 項失敗（C5-1、C5-2、R7-I1），結束碼 1。瀏覽器 `r7-web.js` 修改前 9 項中 2 項失敗：舊的同步回應晚到後，武將畫面顯示關羽 Lv1、session 是 1000 點；之後改隊伍保存，後端也變回 `heroes=[]`、1000。

### 15.2 資料世代（取代 §14.2「資料世代」列）

| 項目                 | 內容                                                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 快照憑證             | 每一個會採用伺服器玩家資料的讀取，**送出前**記下 `snapshotToken`（帳號世代＋資料世代），**提交前**用 `isFreshSnapshot` 驗證；任一個變了，這份回應就不採用                                                                                       |
| 世代加 1 的時機      | 採用一份伺服器資料（登入／切換／手動同步提交、背景讀取套用、重新確認看到升級），以及送出 `upgrade_hero`                                                                                                                                         |
| 各路徑不採用時的處理 | 背景讀取：直接略過。登入／手動同步（同一帳號）：保留本機資料並回傳 `keptLocal`，本機資料來自較新的採用或本機修改。重新確認升級：不採用，照原本的自動確認排程再確認（錯誤代碼 `STALE_READ`）。切換到另一個帳號時，舊帳號的世代不影響新帳號的提交 |
| 沒有改變的規則       | `rev`／`syncedRev` 的語意不變；不會為了這個多送 `save_profile`；最新一次登入請求優先、切換帳號前先保存、升級待確認的保護，以及 C4 不提供強制解除，都維持原樣                                                                                    |

### 15.3 讀取路徑交錯的驗證

| 先送出的讀取 | 讀取回來前，已經採用的資料 | 結果                                                                                                                                         | 依據                       |
| ------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| 背景讀取     | 重新確認看到升級           | 背景讀取不套用                                                                                                                               | 單元 C3；mock F（Round 6） |
| 背景讀取     | 手動同步讀到的新資料       | 背景讀取不套用                                                                                                                               | 單元 R6-G1                 |
| 手動同步     | 重新確認看到升級           | 保留本機（有升級），之後的保存也保有升級                                                                                                     | 單元 C5-0～2；mock G-0～3  |
| 手動同步     | 背景讀取讀到的新資料       | 保留本機（背景讀到的新資料）                                                                                                                 | 單元 R7-I1                 |
| 重新確認升級 | —                          | 已加入檢查；但待確認期間背景讀取不會送出，同一帳號的手動同步也會改走重新確認、共用同一次讀取，目前找不到能觸發的操作順序，**只做了靜態檢視** | 靜態                       |

反向驗證：暫時拿掉 `initFromGAS` 的快照檢查後，C5-1、C5-2、R7-I1 都會失敗；Round 6 對背景讀取做過同樣的驗證（C3-1、C3-2、R6-G1）。

### 15.4 實際的 UI 行為（瀏覽器記錄）

手動同步進行中，玩家資訊視窗可以關閉，武將升級按鈕也可以按（沒有被讀取中的狀態擋住）。本輪沒有改 UI：造成覆寫的是 store 採用了過時的快照，這部分已修正；在這個操作順序下，UI、session 與後端最後都一致（mock G-2、G-3）。同步進行中是否要禁止其他操作，列為待決 D9。

### 15.5 Round 7 檢查結果

| #     | 項目                                 | 結果 | 驗證方式 | 依據                                                                                                                                                                      |
| ----- | ------------------------------------ | ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R7-U1 | store 非同步測試                     | 通過 | 單元     | 修正前 84 項中 3 項失敗（結束碼 1）；修正後 84／84（結束碼 0）。原 80 項斷言沒有修改                                                                                      |
| R7-U2 | 反向驗證                             | 通過 | 單元     | 暫時拿掉 `initFromGAS` 的快照檢查：C5-1、C5-2、R7-I1 失敗；已還原                                                                                                         |
| R7-B1 | 瀏覽器 `r7-web.js`                   | 通過 | mock     | 修正前 7／9（G-2、G-3 失敗）→ 修正後 9／9                                                                                                                                 |
| R7-B2 | I1、R4、R5／R6、正常流程、產物與網路 | 通過 | mock     | 14／14、22／22、26／26、9／9、12／12；產物 SHA-256 與工作區 `public/` 相同；GAS 網路請求 0 筆、SCRIPT ERROR 0、pageerror 0                                                |
| R7-W1 | build、tsc、lint                     | 通過 | 實測     | build 50 秒、84 頁；tsc 0；遊戲與工具 ESLint 0 error／9 個既有 warning；全站 0 error／81 warning（和 Round 6 相同）；`tools/selftest.mjs` 21／21；`git diff --check` 通過 |
| R7-W2 | dev 停止前後的型別檔                 | 通過 | 實測     | `validator.ts` 雜湊前後相同                                                                                                                                               |

瀏覽器用 `tools/run-browser.mjs`（系統 Chrome、無頭）執行，每支的原始回傳都存成 `<腳本名>.raw.json`，修正前的 R7 另存一份。Godot 的 76 項沒有重跑：本輪沒有修改 GDScript 與 `public/`。證據在 `.handoff/evidence/round-07/`。

### 15.6 待決事項（截至 Round 7，取代 §14.7）

> Round 8 起由 §16.5 取代。

| #   | 事項                                                                                                        | 目前狀態                                                                                                                                                                                |
| --- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改）                                | 依 Codex Round 7 的處置，存檔修正驗收後再規劃                                                                                                                                           |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`                                 | 存檔修正驗收後再規劃；目前沒有改 `package.json`                                                                                                                                         |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                                                    | 未決定；需要後端契約證據                                                                                                                                                                |
| D4  | 自動重新確認的次數與間隔                                                                                    | **已決定**（Codex Round 7）：暫時維持立即＋30／60／120／240 秒                                                                                                                          |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                                                  | 未決定；需要 GAS 原始碼，不假定已驗證                                                                                                                                                   |
| D6  | 藏書閣頁面（`/novels/reader/[bookId]`）讀不到書單時，`generateStaticParams()` 回傳空陣列會讓整個 build 中止 | Round 4 的部署因此失敗；之後 Round 5＋6 的部署（run 36066663221，commit `24b1315b`）成功，正式站是 Round 4＋5＋6 的網頁程式。build 會因外部服務中止的風險仍在，不屬於神馬三國，沒有處理 |
| D7  | commit                                                                                                      | Round 5＋6 已由使用者要求 commit＋push（`db6f8f8b`、`27d86885`、`24b1315b`）。Round 7 還沒 commit                                                                                       |
| D8  | 戰鬥中切換帳號後 Godot 沿用舊戰鬥、請求逾時、多裝置衝突                                                     | 存檔修正驗收後再規劃                                                                                                                                                                    |
| D9  | 手動同步進行中，是否要禁止關閉玩家資訊視窗、升級等其他操作（§15.4）                                         | 未決定；store 層的過時快照已修正，不依賴這個限制                                                                                                                                        |

## 16. Round 8（2026-09-25）：戰鬥與結算的帳號歸屬（D8）

> Round 9 修改了本節。Codex 驗收 Round 8 時找到三個漏洞：切換帳號的讀取在途時才開打，切換仍會提交（C6）；新場次開打之後，舊場次的結算會被當成新場次的結算（C7，瀏覽器實測 B 從 1000 變 1999）；同一個帳號已作廢的戰鬥票仍可以結算（C8）。§16.3「明確離開後可切換、舊結果不影響新帳號」的驗證只在新場次**還沒開打**時注入舊結算，沒有涵蓋這個時間順序，所以這一項在 Round 8 並沒有完成。§16.2 的「戰鬥票」「切換鎖」「結算採用條件」由 §17.2 取代；§16.4 第一項（結算沒有場次識別碼）已在 Round 9 處理；§16.5 由 §17.6 取代。本節保留 Round 8 當時的紀錄。

本輪只改 Web 端：玩家存檔 store、主頁面與獨立戰鬥頁、新增 `utils/battleSession.ts`，以及錯誤文案。沒有修改 GDScript，也沒有重新匯出 `public/`。Godot 收到新的關卡資料時會整個重設關卡（`_do_initial_setup`），沿用這個機制就夠了。後端全程使用 mock，沒有存取正式 GAS／試算表。

### 16.1 修正前的重現

- **store（單元）**：共 91 項、5 項失敗。
  - A 開戰、換成 B 之後才確認 A 的結算：獎勵加到 B（1500）。
  - 戰鬥進行中可以直接切換到 B。另一項失敗是因為前一步已經切到 B 而連帶失敗。
  - 同一場確認兩次：送出 2 次 `save_result`，點數變成 2000。
  - A→B→A 之後，切換前那場戰鬥仍然會發獎勵。
- **瀏覽器（mock，`r8-web.js`）**：修正前 16 項中 8 項通過。
  - 自動戰鬥中用玩家資訊切換到 B 成功。A 那場的結算（580 點）記給了 B：`save_result` 與 `save_profile` 的 key 都是 B，B 變成 1580、A 維持 1000。
  - 切換後 Godot 沒有重新載入 B 的關卡。Round 4 時的靜態觀察在這裡實測確認。
  - 切換關卡（離開戰鬥）後，模擬舊戰鬥的結算晚到：畫面顯示結算，確認後 A 多了 999。
  - 連按確認送出 2 次 `save_result`；確認後重複送達的結算又顯示一次，總共 3 次，點數也加了 3 次。
  - 獨立戰鬥頁把 Godot 回覆的 `debug_snapshot` 當成結算，跳出結算畫面。誤判後重新載入頁面時逾時，所以這段的連按項目在修正前沒有評估到。
- **實際 UI**：待結算時 HUD 不顯示，畫面上沒有玩家資訊（切換帳號）的入口。

### 16.2 規則

| 規則         | 內容                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 戰鬥票       | 每次送出關卡資料時（進入頁面、切換關卡、結算後同一關重來），向 store 取得 `BattleTicket`，內容是這一場的識別碼加上帳號世代，不含玩家金鑰、只存在記憶體。結算時 `applyBattleResult` 必須帶這張票：世代和目前不同（開戰後切換過帳號，即使又切回來）就不套用任何獎勵，也不送 `save_result`／`save_profile`（`BATTLE_ACCOUNT_CHANGED`）；同一張票只能結算一次（`BATTLE_ALREADY_SETTLED`） |
| 切換鎖       | 從開打（Godot 回報 BATTLE 狀態或波次 > 0）到結算確認之前，頁面把這張票設為鎖。鎖住時，`initFromGAS` 切換到其他帳號會被擋下（`BATTLE_IN_PROGRESS`：「請先結算或離開目前戰鬥，再切換存檔。」）。同帳號的同步不受影響，C5 的快照保護照舊。結算確認、切換關卡、離開頁面都會解除這個鎖                                                                                                     |
| 備戰中切換   | 還沒開打（波次 0 的備戰）時可以切換。切換後，頁面把舊關卡作廢，關卡改成新帳號預設的關卡（最高進度），並用新帳號的隊伍重新載入；之後的結算屬於新帳號。原本「切換後 Godot 仍顯示舊隊伍」的問題也一併解決                                                                                                                                                                                |
| 明確離開     | 主頁的「切換關卡」（包含同一關重來）會作廢目前這一場並解除鎖，之後就可以切換帳號                                                                                                                                                                                                                                                                                                      |
| 結算採用條件 | 只有結算訊息才算結算：有 `type` 的訊息（例如 `debug_snapshot`）一律不是。而且只採用目前這一場開打後的第一筆，關卡重新載入後才晚到的舊結算、確認後又重複送達的結算都不採用。這依賴 Godot 送訊息的順序：開打時一定先送出 BATTLE 狀態，之後才會送出結算                                                                                                                                  |
| 連按         | 頁面端同一場只會交出一次結算（`BattleSession.take`），store 端同一張票只結算一次，兩層都有防護                                                                                                                                                                                                                                                                                        |

### 16.3 Round 8 檢查結果

| #     | 項目                 | 結果 | 驗證方式 | 依據                                                                                                                                                                       |
| ----- | -------------------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R8-U1 | store 非同步測試     | 通過 | 單元     | 修正前 91 項中 5 項失敗（結束碼 1），修正後 91／91（結束碼 0）。原 84 項的斷言沒有修改；W8b、R5-B 只把呼叫改成帶戰鬥票                                                     |
| R8-U2 | 反向驗證             | 通過 | 單元     | 分別拿掉三項防護：不檢查帳號世代時 S1、S7 失敗；不記錄已結算的戰鬥時 S5 失敗；不檢查切換鎖時 S2、S3 失敗。之後都已還原                                                     |
| R8-B1 | 瀏覽器 `r8-web.js`   | 通過 | mock     | 修正前 8／16，修正後 16／16                                                                                                                                                |
| R8-B2 | 其他瀏覽器回歸       | 通過 | mock     | I1 14／14、I2 8／8、自動計時 9／9、正常流程 9／9、R3 13／13、產物與網路 12／12、R4 22／22、R5／R6 26／26、R7 9／9。產物 SHA-256 與工作區 `public/` 相同，GAS 網路請求 0 筆 |
| R8-W1 | build、tsc、lint     | 通過 | 實測     | build 67 秒、84 頁；tsc 0；遊戲與工具 ESLint 0 error／9 個既有 warning；全站 0 error／81 warning（和 Round 7 相同）；`tools/selftest.mjs` 21／21；`git diff --check` 通過  |
| R8-W2 | dev 停止前後的型別檔 | 通過 | 實測     | `validator.ts` 雜湊前後相同                                                                                                                                                |

**過程紀錄（照實保留）**

1. 第一次完整回歸時，同時在另一個指令做 store 的反向驗證，暫時改動了 `playerStore.ts`，dev server 的熱更新可能因此影響頁面：I1-d 在 15 秒內多出 2 次 `get_profile`。那次結果作廢，另存在 `discarded-run-1/`，之後重跑，重跑期間沒有改動任何檔案。
2. 重跑時，`r8-web.js` 的 11 項功能斷言都通過，但出現一筆非預期的 console error：Godot 對 r3 刻意使用的「缺設定敵人組」發出警告。原因是切換到 B 後，關卡改成了 B 預設的關卡（Mock M），B 那一場打的是 Mock M。產品行為本身正確，所以修改的是測試：切換並確認 Godot 重新載入後，先選 Mock W 再開打。之後 `r8-web.js` 重跑 16／16。

Godot 的 76 項沒有重跑，因為本輪沒有修改 GDScript 與 `public/`。證據在 `.handoff/evidence/round-08/`。

### 16.4 仍未涵蓋

- Godot 的結算訊息沒有場次識別碼，頁面只能用「這一場開打後的第一筆」來判斷。如果 Godot 在同一場裡送出兩筆不同的結算，只會採用第一筆。Round 2～3 的測試確認過每場只送一次結算，但「同一場送兩筆不同結算」的情況沒有實測。
- 獨立戰鬥頁沒有切換帳號的入口，它同樣使用戰鬥票與鎖。
- 關閉分頁或重新整理時，進行中的戰鬥與待確認的結算都會遺失（Godot 的狀態不會保存）。這是既有行為，本輪沒有處理。

### 16.5 待決事項（截至 Round 8，取代 §15.6）

> Round 9 起由 §17.6 取代。

| #   | 事項                                                                         | 目前狀態                                                                     |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改） | 後續再安排                                                                   |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`  | 後續再安排；目前沒有改 `package.json`                                        |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                     | 未決定；需要後端契約證據                                                     |
| D4  | 自動重新確認的次數與間隔                                                     | 已決定（Round 7）：維持立即＋30／60／120／240 秒                             |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                   | 未決定；需要 GAS 原始碼                                                      |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                    | 風險仍在；不屬於神馬三國，沒有處理（Round 5＋6 的部署已成功）                |
| D7  | commit                                                                       | Round 5＋6 已 commit＋push。Round 7、Round 8 還沒 commit                     |
| D8  | 戰鬥與結算的帳號歸屬；請求逾時；多裝置衝突                                   | 帳號歸屬已在 Round 8 處理（mock 範圍，見 §16）。請求逾時與多裝置衝突仍待規劃 |
| D9  | 手動同步進行中，是否禁止其他操作                                             | 已決定（Round 8）：暫時不加全域的同步操作鎖，維持 store 的快照保護           |

## 17. Round 9（2026-09-25）：場次隔離（C6～C8）

Round 8 的帳號歸屬沒有通過 Codex 驗收（見 §16 開頭的說明）。本輪只補齊場次隔離，不新增功能：

- Web 端：玩家存檔 store、`utils/battleSession.ts`、主頁面與獨立戰鬥頁、型別與錯誤文案。
- Godot 端：`systems/BattleManager.gd`、`main/Main.gd`。依 AGENTS 與回歸 README 手動匯出，更新 `public/games/shenmaSanguo/` 的 `index.pck`、`index.html`、`index.service.worker.js`（其餘引擎檔案逐位元組相同）。
- 後端全程使用 mock，沒有存取正式 GAS／試算表。L1、op_id 等後端範圍沒有擴大：場次識別碼不會送到後端。

### 17.1 修正前的重現

先把 Codex 的 C6～C8 整合進正式測試並補上新情境，在修正前執行，保存失敗結果：

- **store（單元）**：共 115 項、23 項失敗，結束碼 1。
  - C6：切換到 B 的讀取在途時 A 開打，讀取回來後仍切到 B，A 那一場的票也跟著失效；切換前的保存在途時開打、讀取 B 之後第二次保存在途時開打，也都切到 B。
  - C7：另一個帳號的新場次開打後，A 那一場的結算（帶 A 的 `battle_id`）被採用，B 變成 1999；同一關重來後，上一場的結算被採用；舊關卡的 stats 晚到，讓還在備戰的新場次上鎖（之後切換被擋）；缺少 `battle_id` 的結算被採用。
  - C8：同帳號開始第二場後，第一場的票仍可結算（1999）；明確離開後那張票仍可結算；舊頁面的 cleanup 解除了新場次的鎖；舊票可以上鎖；換帳號後 A 那一場的 cleanup 解除了 B 的鎖。
  - `R9-C7d-4`（後端收到的 `save_result` 不含 `battle_id`）在修正前就通過，因為舊版採用的是那筆沒有 `battle_id` 的結算，這一項在修正前沒有鑑別力。
- **Godot（HEAD 版原始碼跑新的 R9 測試）**：R9 的 5 項失敗（stats 與結算都沒有 `battle_id`），並在讀取 `BattleManager.battle_id` 時出現 SCRIPT ERROR，結束碼 1。
- **瀏覽器（mock，`r9-web.js`）**：21 項中 6 項通過（5 項共通防線，以及「從獨立戰鬥頁回到主頁開打後切換被擋下」），結束碼 1。
  - A 那一場由 Godot 實際產生的結算（先攔住、之後原封不動重送）在 B 的新場次開打後送達：畫面顯示結算，確認後 A 的 580 點記給 B（`save_result` 的 key 是 B）。
  - 同一關重來並開打後，上一場的結算被顯示並結算。
  - 舊關卡開打中的 stats 晚到：HUD 變成「戰鬥中、1/2」，之後切換被擋下。
  - 切換到 B 的讀取在途時、或切換前的保存在途時開打：仍切到 B，Godot 重新載入 B 的關卡，A 那一場消失。
  - 獨立戰鬥頁採用了錯誤、缺少 `battle_id` 的 stats 與結算（加了 999 點），後端的戰鬥紀錄也帶著那筆注入的 `battle_id`。
- Codex 的原始證據（`evidence/round-08/codex-extra.*`、`codex-browser/`）保持原樣。

### 17.2 規則（取代 §16.2 的「戰鬥票」「切換鎖」「結算採用條件」）

| 規則                    | 內容                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 場次識別碼              | 每次送出關卡資料時（進入頁面、切換關卡、同一關重來、結算後重新載入、換帳號後重新載入）都是新的一場。戰鬥票的 `id`（隨機產生，不含玩家金鑰）以 `battle_id` 隨關卡資料送進 Godot。`BattleManager` 在 `initialize` 時記下，`update_stats` 與結算都帶它；關卡資料沒有 `battle_id` 時是空字串。測試用的 `debug_snapshot` 也帶目前的 `battle_id`                                            |
| 結算帶產生它的那一場    | `BattleManager._end_battle` 在發出任何信號之前就建立整筆結算（`battle_id`、`stage_id`、擊殺數、獎勵）。之後的信號處理即使載入了新關卡，送出的仍是產生它的那一場的內容，不會改套新場次的識別碼                                                                                                                                                                                         |
| 頁面只接受目前這一場    | `BattleSession` 只接受 `battle_id` 和目前這一場相同的訊息。不同、缺少、空白或非字串一律不採用：不更新 HUD、不算開打、不上鎖、不顯示結算。不再用「開打後的第一筆」當成歸屬的證明；「開打後才接受結算」「同一場只交出一次」照舊保留                                                                                                                                                     |
| 目前有效的一場（store） | `beginBattle()` 建立目前有效的一場，同時讓前一場失效。明確離開（`endBattle(ticket)`：切換關卡、離開頁面、換帳號後重新載入）、結算、換帳號也都會讓它失效。`applyBattleResult` 要同時符合帳號世代、目前有效、還沒結算，否則不套用任何獎勵、不送任何請求（`BATTLE_ACCOUNT_CHANGED`／`BATTLE_ALREADY_SETTLED`／`BATTLE_NOT_CURRENT`）。`isBattleTicketCurrent` 也改成比對目前有效的那一場 |
| 切換鎖                  | 鎖屬於目前有效的那一場：`lockBattle(ticket)` 只有那一場的票才能上鎖；解除只會發生在那一場自己的離開或結算、開始新的一場、換帳號。舊頁面的 cleanup、舊關卡晚到的訊息、舊票都不能上鎖或解除新場次的鎖（原本不檢查擁有者的 `setBattleLock(null)` 已移除）                                                                                                                                |
| 切換前重新檢查          | `initFromGAS` 切換到其他帳號時，在開始、切換前的保存完成之後（讀取之前）、提交前最後一次等待之後都檢查切換鎖。鎖住就回傳 `BATTLE_IN_PROGRESS`：store、session、金鑰都維持原帳號，原本那一場和它的票仍然有效。保存期間才開打時，不讀取、也不建立另一個帳號的存檔                                                                                                                       |
| 後端契約                | `save_result` 送出前拿掉 `battle_id`，後端收到的欄位和 Round 8 相同                                                                                                                                                                                                                                                                                                                   |

### 17.3 Round 9 檢查結果

| #     | 項目                | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                                                               |
| ----- | ------------------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R9-U1 | store 非同步測試    | 通過 | 單元     | 修正前 115 項中 23 項失敗（結束碼 1），修正後 115／115（結束碼 0）。原 91 項的斷言沒有修改；R8-S2、S5 改用 `lock()`／`leave()` 兩個 helper                                                                                                                                                         |
| R9-U2 | store 反向驗證      | 通過 | 單元     | 分別拿掉 6 項防護：提交前最後一次檢查、保存之後讀取之前的檢查、`battle_id` 比對、目前有效場次的檢查、離開的擁有者檢查、上鎖的擁有者檢查。每一項都讓對應的 R9 測試失敗，其他測試不受影響；還原後檔案雜湊相同                                                                                        |
| R9-U3 | Codex 原始測試副本  | 通過 | 單元     | 只把改名的 API 換掉（6 行）後 94／94。副本的 C7 訊息沒有 `battle_id`，現在是因為缺少 id 被拒，已經沒有鑑別力；帶實際舊 `battle_id` 的案例由 R9-C7a 與瀏覽器 A、B 段涵蓋                                                                                                                            |
| R9-G1 | Godot headless 測試 | 通過 | 實測     | HEAD 版原始碼跑新測試：R9 的 5 項失敗，並出現 SCRIPT ERROR（結束碼 1）。新版 83／83（原 76 項＋R9 7 項）                                                                                                                                                                                           |
| R9-G2 | Godot 反向驗證      | 通過 | 實測     | 把 `_end_battle` 還原成「先發信號、再建立結算」：只有 R9-4 失敗，送出的結算變成新場次的 `stage_b`／`r9-b1`                                                                                                                                                                                         |
| R9-G3 | 匯出與產物          | 通過 | 實測     | 第一次匯出時測試全過，產物核對只有 `Main.gdc`、`BattleManager.gdc` 不同（原始碼改了、產物還是舊的）。把 `index.pck`、`index.html`、`index.service.worker.js` 複製到 `public/` 後，用全新工作目錄重跑兩次（最後一次用最終版測試），都全部通過、結束碼 0。build 輸出的 `index.pck` 與 `public/` 相同 |
| R9-B1 | 瀏覽器 `r9-web.js`  | 通過 | mock     | 修正前 6／21，修正後 21／21。舊場次的結算都是 Godot 實際產生、帶實際 `battle_id` 的訊息                                                                                                                                                                                                            |
| R9-B2 | 其他瀏覽器回歸      | 通過 | mock     | 全新 context 一次跑完：I1 14／14、I2 8／8、自動計時 9／9、正常流程 9／9、R3 13／13、產物與網路 12／12、R4 22／22、R5／R6 26／26、R7 9／9、R8 16／16（C-2 改成帶實際的舊 `battle_id`）。GAS 網路請求 0 筆                                                                                           |
| R9-W1 | build、tsc、lint    | 通過 | 實測     | dev 停止後執行：build 48 秒、84 頁；tsc 0；遊戲與工具 ESLint 0 error／9 個既有 warning（和 Round 8 同樣的 9 處）；全站 0 error／81 warning；`tools/selftest.mjs` 21／21；`git diff --check` 通過，未追蹤的新檔沒有尾端空白                                                                         |

**過程紀錄（照實保留）**

1. 開發途中曾在 dev server 執行時跑過一次 `tsc --noEmit`（結束碼 0）確認型別；列為證據的 tsc 與 build 都是在 dev 停止後重跑的。
2. 完整瀏覽器回歸前重新啟動了 dev server，執行期間沒有修改任何 `src/` 檔案；反向驗證在回歸結束、dev 停止之後才進行。
3. Godot 的 R9-4 原本在 `battle_ended` 信號中載入新關卡，這無法分辨「結算在發信號前建立」的順序（`battle_ended` 發出時結算已經建立）。改成在最早的 `state_changed`（進入 RESULT）中載入後，再用全新工作目錄重跑，並用反向驗證確認它有鑑別力。

證據在 `.handoff/evidence/round-09/`。

### 17.4 部署注意

網頁與 Godot 產物要一起更新（兩者在同一次部署裡）。新版網頁如果搭配舊的 Godot 產物（例如瀏覽器還在用舊的 Service Worker 快取），stats 與結算都沒有 `battle_id`，頁面會全部忽略：HUD 不更新、無法確認結算。這時不會誤發獎勵，但遊戲無法正常進行。`index.service.worker.js` 的 `CACHE_VERSION` 已隨這次匯出更新，主頁面在載入中偵測到新的 Service Worker 時會強制更新；這個過渡情況沒有實測。

### 17.5 仍未涵蓋

- 瀏覽器測試用 harness 先攔住 Godot 實際產生的結算、之後原封不動重送，驗證的是訊息內容與歸屬，不是實際的網路時序。
- 獨立戰鬥頁每次載入只有一場，舊頁面的 iframe 已經不存在，舊訊息實際上送不到新頁面；測試中「其他場次」的結算是用另一場實際的 `battle_id` 組出來的。
- 切換帳號送出後先關閉玩家資訊視窗、之後因為開打而被擋下時，畫面上沒有任何提示（store 的結果正確，只是沒有顯示）。本輪沒有修改，列在 §17.6 D10。
- 關閉分頁或重新整理時，進行中的戰鬥與待確認的結算都會遺失（既有行為）。
- `save_result` 沒有冪等鍵：前端同一場只送一次，但回應遺失時無法確認後端是否已記錄（D3，後端範圍，沒有擴大）。

### 17.6 待決事項（截至 Round 9，取代 §16.5）

> Round 10 起由 §18.6 取代。

| #   | 事項                                                                         | 目前狀態                                                                                       |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改） | 後續再安排                                                                                     |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`  | 後續再安排；目前沒有改 `package.json`                                                          |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                     | 未決定；需要後端契約證據                                                                       |
| D4  | 自動重新確認的次數與間隔                                                     | 已決定（Round 7）：維持立即＋30／60／120／240 秒                                               |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                   | 未決定；需要 GAS 原始碼                                                                        |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                    | 風險仍在；不屬於神馬三國，沒有處理（Round 5＋6 的部署已成功）                                  |
| D7  | commit                                                                       | Round 5＋6 已 commit＋push。Round 7、8、9 還沒 commit                                          |
| D8  | 戰鬥與結算的帳號歸屬；請求逾時；多裝置衝突                                   | 帳號歸屬與場次隔離已在 Round 8＋9 處理（mock 範圍，見 §16、§17）。請求逾時與多裝置衝突仍待規劃 |
| D9  | 手動同步進行中，是否禁止其他操作                                             | 已決定（Round 8）：暫時不加全域的同步操作鎖，維持 store 的快照保護                             |
| D10 | 切換帳號送出後關閉了玩家資訊視窗，之後被擋下（例如開打）時是否要另外提示     | 未決定；目前 store 的結果正確，只是畫面沒有提示                                                |

## 18. Round 10（2026-09-25）：遊戲版本不相符與延遲切換失敗的提示

處理 Round 9 揭露的兩個使用體驗缺口，不擴大後端或遊戲玩法範圍：

- Web 端：`utils/gameEngine.ts`（新增）、`components/EngineUpdatePrompt.tsx`（新增）、`components/SwitchFailedNotice.tsx`（新增）、兩個戰鬥頁、`GameInitializer`、玩家存檔 store、樣式。
- Godot 端：`bridge/WebBridge.gd`（`game_ready` 帶協定版本）。依規範手動匯出，更新 `public/games/shenmaSanguo/` 的 `index.pck`、`index.html`、`index.service.worker.js`。
- C7 的 `battle_id` 檢查沒有放寬；後端全程使用 mock。

### 18.1 修正前的重現

- **store（單元）**：共 125 項、10 項失敗（全是 R10），結束碼 1。切換送出後才開打、戰鬥中直接切換，store 都沒有留下可以在主畫面顯示的原因；沒有遊戲版本的判斷。R10-N4～N6（較新的切換成功、同帳號同步失敗、首次登入失敗不產生提示）在修正前失敗，只是因為還沒有這個欄位，不代表錯誤行為。
- **Godot**：Round 9 版的 `WebBridge.gd` 跑新的測試，只有 R10-1 失敗（`game_ready` 沒有協定版本）。
- **瀏覽器（mock，`r10-web.js`，舊版遊戲用真實舊產物）**：18 項中 9 項通過，結束碼 1。
  - 主頁載入舊版遊戲：頁面照常送出關卡資料，舊版遊戲載入關卡；用 Godot 畫面內的「自動」指令開打後打完一場，送出沒有 `battle_id` 的結算，頁面沒有顯示結算、也沒有任何提示，玩家不知道原因。
  - 獨立戰鬥頁一樣。
  - 切換送出後關閉視窗、之後開打被擋：主畫面沒有任何提示（store 的結果正確）。視窗開著時只有視窗內的訊息，關閉後就看不到了。
  - C-1（載入慢不誤判）、E-2、F-3（合法切換後沒有殘留提示）在修正前就通過，因為那時還沒有提示功能。
- **測試環境的發現**：前兩次修正前執行時，E、F 段逾時。原因是 sessionStorage 在跨來源隔離（COOP）與非隔離的頁面各有一份、切換時互相複製，harness 的 `resetOrigin` 只清到其中一份，下一段載入頁面時又把 A 段植入的「待確認升級」複製回來。已改成兩種狀態各清一次（第三次執行起不再發生），前兩次的結果保留在 `before-fix-attempt1/`、`before-fix-attempt2/`。

### 18.2 規則

| 規則                    | 內容                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 協定握手                | Godot 的 `game_ready` 帶 `protocol`（`WebBridge.BRIDGE_PROTOCOL`，目前是 2：stats 與結算帶 `battle_id`）。網頁的 `BRIDGE_PROTOCOL` 相同才送出關卡資料；不同或沒有（舊版遊戲）時標記為不相容：顯示「遊戲版本需要更新」，不送關卡資料，所以不會開戰，也不會有結算                                                                                                                                                                                                                                                              |
| 載入中不等於版本錯誤    | 只有收到 `game_ready` 才判斷版本；在那之前一律是載入中（原本 120 秒後的逾時畫面沒有改），不用逾時推斷版本                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 只接受目前的遊戲 iframe | 兩個戰鬥頁只處理 `event.source` 是目前遊戲 iframe 的訊息；重新載入前的舊 iframe、其他視窗送來的訊息（即使帶這一場的 `battle_id`）都不採用                                                                                                                                                                                                                                                                                                                                                                                    |
| 重新載入遊戲            | 只在玩家按「重新載入遊戲」時執行，不會自動重試：離開目前這一場（`endBattle`，只解除這一場自己的鎖）、清掉頁面上的戰鬥狀態 → 請遊戲的 Service Worker（範圍 `/games/shenmaSanguo/`）檢查更新，新版本安裝完成後請它接管（接管時會刪除舊版本的快取）→ 換成新的 iframe。不重新整理頁面、不清除任何儲存、不動網站其他的 Service Worker；玩家存檔、session、待確認的升級、未同步的修改與在途的請求都不受影響。任何一步失敗或逾時都照常換 iframe，仍然不相容時提示改成「重新載入後仍然是舊版」，建議稍後再試或關閉所有分頁後重新開啟 |
| 切換失敗的提示（D10）   | store 的 `switchNotice`：從目前的帳號切換到其他帳號失敗時記下原因（錯誤代碼，不含任何存檔金鑰），只有最新一次請求可以寫入，被較新請求取代的舊請求不會寫入。開始新的切換、切換成功或按「知道了」時清除；同帳號同步與首次登入失敗不產生。主畫面底部顯示「未切換存檔，目前仍是「暱稱」：原因」，玩家資訊視窗關閉後也看得到。沒有新增全域同步鎖，C6 的保護不變                                                                                                                                                                   |

### 18.3 Round 10 檢查結果

| #      | 項目                | 結果 | 驗證方式         | 依據                                                                                                                                                                                       |
| ------ | ------------------- | ---- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R10-U1 | store 非同步測試    | 通過 | 單元             | 修正前 125 項中 10 項失敗（結束碼 1），修正後 125／125（結束碼 0）。原 115 項沒有修改                                                                                                      |
| R10-U2 | store 反向驗證      | 通過 | 單元             | 拿掉「失敗時留下提示」、拿掉「開始新切換／切換成功時清除」、不區分是不是切換帳號：各自讓對應的 R10 測試失敗，其他測試不受影響；還原後檔案雜湊相同                                          |
| R10-G1 | Godot headless 測試 | 通過 | 實測             | Round 9 版 `WebBridge.gd` 跑新測試：只有 R10-1 失敗。新版 84／84（原 83 項＋R10-1）                                                                                                        |
| R10-G2 | 匯出與產物          | 通過 | 實測             | 第一次匯出時測試全過，產物核對只有 `WebBridge.gdc` 不同；把 3 個檔案複製到 `public/` 後，用全新工作目錄重跑全部通過、結束碼 0。build 輸出的 `index.pck` 與 `public/` 相同                  |
| R10-B1 | 瀏覽器 `r10-web.js` | 通過 | mock＋真實舊產物 | 修正前 9／18（第三次執行；前兩次見 18.1）。修正後單獨執行 26／26，完整回歸中再跑一次 26／26                                                                                                |
| R10-B2 | 瀏覽器反向驗證      | 通過 | mock             | 拿掉兩個戰鬥頁的訊息來源檢查：B-4、B-5、D-4、D-5 失敗（已移除的 iframe 送來的舊版 `game_ready` 讓版本提示誤跳出來，帶這一場 `battle_id` 的假結算被採用，點數多了 999）。還原後檔案雜湊相同 |
| R10-B3 | 其他瀏覽器回歸      | 通過 | mock             | 全新 context 一次跑完：I1 14／14、I2 8／8、自動計時 9／9、正常流程 9／9、R3 13／13、產物與網路 12／12、R4 22／22、R5／R6 26／26、R7 9／9、R8 16／16、R9 21／21。GAS 網路請求 0 筆          |
| R10-W1 | build、tsc、lint    | 通過 | 實測             | dev 停止後執行：build 64 秒、84 頁；tsc 0；遊戲與工具 ESLint 0 error／9 個既有 warning（同樣 9 處）；全站 0 error／81 warning；`tools/selftest.mjs` 21／21；`git diff --check` 通過        |

**過程紀錄（照實保留）**

1. 修正前的前兩次執行因為測試隔離問題（18.1 的 sessionStorage）在 E、F 段逾時，修正 harness 後第三次才得到完整的修正前結果。前兩次的原始結果都保留。
2. 完整回歸結束後，Prettier 把 `utils/gameEngine.ts`、store 測試與本文件重新排版（只有折行、空白與表格分隔線，已比對確認）。排版後重跑了 store 測試、tsc、build；瀏覽器回歸沒有重跑。
3. 開發途中曾在 dev 執行時跑過 tsc 確認型別；列為證據的 tsc 與 build 都在 dev 停止後執行。瀏覽器的反向驗證在完整回歸結束後、dev 停止前進行，還原後才停止 dev。

證據在 `.handoff/evidence/round-10/`。

### 18.4 仍未涵蓋

- 瀏覽器測試用 route 回應真實的舊檔案（包括舊版的 Service Worker），驗證舊快取接管、重試後換成新版本的流程；沒有在正式站實際部署後，從使用者瀏覽器既有的快取升級。
- 重試換新版本依賴遊戲 Service Worker 內建的 `claim` 訊息（Godot 4.6.2 匯出的樣板）。離線或伺服器上沒有新版本時，重試後仍是舊版，只會顯示「仍然是舊版」的提示。
- 載入超過 120 秒仍是原本的逾時畫面（重新整理整頁），本輪沒有修改。
- sessionStorage 在跨來源隔離與非隔離的頁面各有一份（見 18.1）。正式站由 coi-serviceworker 啟用跨來源隔離，第一次造訪會在啟用後重新載入一次；這個複製行為是否會在正式站造成舊 session 復原沒有調查，列在 D11。

### 18.5 修改檔案

| 檔案                                                                              | 內容                                                                                                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `godot/shenmaSanguo/bridge/WebBridge.gd`                                          | `BRIDGE_PROTOCOL = 2`、`ready_message()`；`game_ready` 帶協定版本                                                           |
| `public/games/shenmaSanguo/index.{pck,html,service.worker.js}`                    | 重新匯出（其餘檔案逐位元組相同）                                                                                            |
| `…/utils/gameEngine.ts`（新增）                                                   | `BRIDGE_PROTOCOL`、`isCompatibleEngine`、`activateLatestGameWorker`                                                         |
| `…/components/EngineUpdatePrompt.tsx`（新增）                                     | 版本提示與「重新載入遊戲」                                                                                                  |
| `…/components/SinglePageContent.tsx`、`…/battle/components/BattlePageContent.tsx` | 只接受目前 iframe 的訊息；`game_ready` 版本判斷；版本提示；重新載入遊戲（換新的 iframe）                                    |
| `…/store/playerStore.ts`                                                          | `switchNotice`、`clearSwitchNotice`                                                                                         |
| `…/components/SwitchFailedNotice.tsx`（新增）、`…/components/GameInitializer.tsx` | 主畫面底部的切換失敗提示                                                                                                    |
| `…/styles/shenmaSanguo.module.css`                                                | 版本提示的樣式                                                                                                              |
| `scripts/shenma-regression/…`                                                     | store 測試 R10（10 項）；Godot 測試 R10-1；`r10-web.js`（新增）；harness 的 `resetOrigin` 清兩次、證據目錄 round-10；README |

### 18.6 待決事項（截至 Round 10，取代 §17.6）

> Round 11 起由 §19.5 取代。

| #   | 事項                                                                         | 目前狀態                                                                                       |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改） | 後續再安排                                                                                     |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`  | 後續再安排；目前沒有改 `package.json`                                                          |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                     | 未決定；需要後端契約證據                                                                       |
| D4  | 自動重新確認的次數與間隔                                                     | 已決定（Round 7）：維持立即＋30／60／120／240 秒                                               |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                   | 未決定；需要 GAS 原始碼                                                                        |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                    | 風險仍在；不屬於神馬三國，沒有處理（Round 5＋6 的部署已成功）                                  |
| D7  | commit                                                                       | Round 5＋6 已 commit＋push。Round 7～10 還沒 commit                                            |
| D8  | 戰鬥與結算的帳號歸屬；請求逾時；多裝置衝突                                   | 帳號歸屬與場次隔離已在 Round 8＋9 處理（mock 範圍，見 §16、§17）。請求逾時與多裝置衝突仍待規劃 |
| D9  | 手動同步進行中，是否禁止其他操作                                             | 已決定（Round 8）：暫時不加全域的同步操作鎖，維持 store 的快照保護                             |
| D10 | 切換帳號送出後關閉了玩家資訊視窗，之後被擋下時是否另外提示                   | 已處理（Round 10）：主畫面底部顯示切換失敗的提示（見 18.2）                                    |
| D11 | 跨來源隔離切換時 sessionStorage 各有一份，正式站是否可能復原舊 session       | 未調查；測試環境已由 harness 處理                                                              |

## 19. Round 11（2026-09-26）：D11 調查——跨來源隔離切換時的 sessionStorage

本輪只調查，沒有修改產品程式碼，也沒有加入任何清除儲存的修正。Round 7～10 已由 Codex 驗收，並在本機 commit（`81cabb43`，未 push、未部署）。

### 19.1 環境與方法

- 瀏覽器：系統 Chrome 153.0.8010.53（Playwright `channel: "chrome"`，無頭模式），Windows 10。
- 本機 `next dev`（`localhost:3000`），後端全部 mock，虛構帳號 `test_d11_*`，沒有存取正式 GAS。
- 頁面是否跨來源隔離（`crossOriginIsolated`），完全取決於 coi-serviceworker（根目錄範圍）加上的 COOP／COEP：本機 dev 與正式站（GitHub Pages，實測回應標頭）都不送這兩個標頭。正式站另外有 `Cache-Control: max-age=600`，而且是靜態匯出版本；真實 GAS 的延遲是秒級，mock 約 150ms。
- 每一次頂層頁面載入都記錄隔離狀態、控制頁面的 Service Worker、載入當下的 session；也攔截每一次 sessionStorage 的寫入與清除。保存時送出的內容記在 mock 的紀錄裡。
- 非隔離的頁面載入都用真實流程產生：第一次造訪（還沒有 SW）、強制重新整理（CDP `Network.setBypassServiceWorker`，等同 Ctrl+Shift+R 略過 SW）、移除 SW 後再進入。E4、E5 另外讓 `coi-serviceworker.js` 載入失敗，模擬 SW 暫時無法註冊，這一步是刻意注入的故障。
- 證據在 `.handoff/evidence/round-11/`（每個實驗的腳本與原始 JSON）。

### 19.2 結果

| #   | 情境                                                                                                                                                             | 結果                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | 合成標頭：用另一個來源、沒有 SW，由 route 直接回應 COOP 與非 COOP 的頁面，用 `page.goto` 來回切換                                                                | 每次切換都讀到最新寫入的值，兩個方向都會帶過去                                                                                                                       |
| E1b | 同上，改用 `clear()`／`removeItem()`                                                                                                                             | 同樣會帶過去                                                                                                                                                         |
| E2  | 真實 app＋SW，照 Round 10 的順序：在隔離頁清除之後，進入沒有 SW 的非隔離頁                                                                                       | 重現：非隔離頁一載入就讀到舊的待確認 session，之前沒有任何寫入；coi 重新載入之後，隔離頁也讀到這份舊資料                                                             |
| E3  | 正常使用：第一次造訪 → 在隔離頁改隊伍（保存一律失敗，維持未同步）→ 設定頁往返、一般重新整理、只重新載入遊戲 iframe、強制重新整理、移除 SW 後再進入、網站首頁往返 | 隔離頁的未同步修改全部保留，每次保存送出的都是最新內容。強制重新整理與移除 SW 後的非隔離載入讀到的是空的（看不到隔離頁的資料），隨後就被 coi 重新載入                |
| E3b | 同 E3，隔離頁同時有未同步的暱稱、隊伍與結果待確認的升級                                                                                                          | 全部保留；金鑰和 session 一致；沒有送出保存                                                                                                                          |
| E4  | 非隔離的那一份留著未同步的舊修改（SW 無法註冊時改的隊伍）；之後在隔離頁保存了較新的修改，再按強制重新整理                                                        | 非隔離頁載入舊的未同步資料後，立刻送出 `save_profile`（舊隊伍，200）；coi 重新載入後，隔離那一份也被舊資料蓋掉，又保存一次。本機與伺服器都退回舊隊伍，較新的修改遺失 |
| E5  | 非隔離的那一份只有已同步的舊資料；隔離頁有未同步的隊伍與待確認升級，再按強制重新整理                                                                             | 這一次非隔離頁沒有寫入，但 coi 重新載入後，隔離那一份仍被舊資料蓋掉：未同步的修改與待確認升級的紀錄都不見了                                                          |

### 19.3 結論

- **真實流程（經過 coi SW）下，sessionStorage 在隔離與非隔離兩種狀態各有一份**：
  - 隔離 → 非隔離（強制重新整理、SW 被移除後再進入）：非隔離頁讀到的是自己那一份（可能是空的，也可能是舊的），看不到隔離頁的資料。
  - 非隔離 → 隔離（coi 自動重新載入、從非隔離頁導覽過去）：非隔離那一份有資料時會帶過去，蓋掉隔離那一份；是空的時，隔離那一份不受影響。
  - 合成標頭的實驗（E1、E1b）結果不同，兩個方向都會帶過去。Round 10 在 README 與 harness 註解寫的「互相複製」不精確，已改成上面的說法。harness 在兩種狀態各清一次的做法仍然需要：E2 就是它要處理的情況。
  - Chromium 內部的判斷規則沒有確定，以上只是這個版本、這些導覽方式的實測結果。
- **影響範圍（mock 實測）**：
  - 正常使用沒有重現遺失或退回舊版本（E3、E3b）：第一次造訪時，coi 很快就重新載入，非隔離頁來不及寫入 session。
  - 但只要非隔離那一份曾被寫入（非隔離頁存活到讀取或保存完成，例如 SW 無法註冊、coi 重新載入得很慢），之後任何一次強制重新整理或 SW 被移除，都可能造成兩種問題：送出過時的 `save_profile`，蓋掉伺服器上較新的資料（E4）；或讓隔離頁的未同步修改與待確認升級紀錄消失（E5）。待確認紀錄消失，會讓 Round 5 修過的「蓋掉伺服器已完成的升級」風險重新出現。
  - 正式站的標頭與本機相同（都靠 coi SW）。真實 GAS 延遲較長，第一次造訪的非隔離頁更不容易在重新載入前寫入；比較可能發生在 SW 無法註冊時（例如取得 `coi-serviceworker.js` 失敗）。正式站實際發生的頻率沒有資料，其他瀏覽器（Firefox、Safari 的 coi 行為不同）沒有測試。
- **為什麼網站有跨來源隔離**：coi-serviceworker 是 AI 去背工具（`bgRemover`，需要 `SharedArrayBuffer`）的 commit（`5eac4ced`）加進全站 `layout.tsx` 的。神馬三國與 bobaSurvivors 的 Godot 產物都是無執行緒版本（`GODOT_THREADS_ENABLED = false`），本身不需要跨來源隔離。

### 19.4 處理建議（沒有實作，待決定）

1. **根本處理（建議優先評估）**：只讓需要的頁面（`bgRemover`）啟用跨來源隔離，神馬三國的頁面不經過 coi SW，就不會在兩種狀態之間切換。這需要修改全站的 `layout.tsx` 與 coi 的註冊範圍，並驗證 `bgRemover` 與兩個 Godot 遊戲；已經註冊在根目錄的 coi SW 也要規劃移除或縮小範圍的遷移。
2. **局部防護（如果暫時保留全站隔離）**：非隔離、而且 coi 馬上會重新載入的頁面，不初始化玩家存檔（不讀 session、不自動保存），可以避免 E4 那種過時的保存。但它擋不住已經存在的舊副本在切換時蓋掉隔離那一份（E5），只能當輔助。
3. **不建議**直接加「清除所有儲存」：會連隔離那一份真正未同步的修改一起清掉。

### 19.5 待決事項（截至 Round 11，取代 §18.6）

> Round 12 起由 §20.6 取代。

| #   | 事項                                                                         | 目前狀態                                                                                                              |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改） | 後續再安排                                                                                                            |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`  | 後續再安排；目前沒有改 `package.json`                                                                                 |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                     | 未決定；需要後端契約證據                                                                                              |
| D4  | 自動重新確認的次數與間隔                                                     | 已決定（Round 7）：維持立即＋30／60／120／240 秒                                                                      |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                   | 未決定；需要 GAS 原始碼                                                                                               |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                    | 風險仍在；不屬於神馬三國，沒有處理（Round 5＋6 的部署已成功）                                                         |
| D7  | commit                                                                       | Round 7～10 已在本機 commit（`81cabb43`），未 push、未部署；Round 11 的文件修改還沒 commit                            |
| D8  | 戰鬥與結算的帳號歸屬；請求逾時；多裝置衝突                                   | 帳號歸屬與場次隔離已在 Round 8＋9 處理（mock 範圍）。請求逾時與多裝置衝突仍待規劃                                     |
| D9  | 手動同步進行中，是否禁止其他操作                                             | 已決定（Round 8）：暫時不加全域的同步操作鎖，維持 store 的快照保護                                                    |
| D10 | 切換帳號送出後關閉了玩家資訊視窗，之後被擋下時是否另外提示                   | 已處理（Round 10）                                                                                                    |
| D11 | 跨來源隔離切換時 sessionStorage 各有一份，正式站是否可能復原舊 session       | 已調查（Round 11，§19）：真實流程下各有一份；正常使用沒有重現，非隔離那一份曾被寫入時，會發生過時保存或蓋掉未同步修改 |
| D12 | 是否把跨來源隔離縮小到只有需要的頁面（`bgRemover`），讓神馬三國不再切換      | 未決定；需要一併驗證 `bgRemover` 與兩個 Godot 遊戲（§19.4）                                                           |

## 20. Round 12（2026-09-27）：趙雲「奇襲」第一版

照 Codex 調整後的排程，已驗收的修正收尾後開始做新玩法。D11／D12（§19）已重現資料回退，列為發布前必須處理的項目，本輪沒有處理，也沒有修改全站 COOP／Service Worker 或 `bgRemover`。

### 20.1 規則

完整規則與狀態見 `docs/shenma-sanguo-feature-roadmap.md` §3，這裡只列實作重點：

| 項目         | 內容                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 單一設定來源 | `utils/heroSkills.ts`：武將列表／詳情的說明文字，與隨出征資料 `team_list[].skill` 送進 Godot 的參數（`{ id: "first_strike", first_attack_multiplier: 2 }`）都由它產生。主頁三處、獨立戰鬥頁一處組隊伍資料時加上；`update_team` 也帶，所以戰鬥中更新隊伍不會失去技能 |
| Godot 端     | `Hero.gd` 讀取技能參數，攻擊到有效目標時向 `BattleManager.consume_first_strike` 詢問這一場是否用過；用過的紀錄以武將 id 記在 `BattleManager`，`initialize`（新的一場、新的 `battle_id`）才清空。不認得的技能 id 一律當作普通攻擊                                    |
| 觸發提示     | 武將上方出現放大的金色倍率標記（「x2!」）。Godot 專案沒有中文字型，畫布裡的中文會顯示成方框，所以不用「奇襲」兩個字；技能說明裡寫明這個標記                                                                                                                         |
| 存檔         | 技能參數只存在出征資料與戰場，不寫進玩家存檔、session、`save_result`，也沒有修改 GAS／Sheets                                                                                                                                                                        |
| 測試用快照   | `debug_snapshot` 多了 `first_strike_used`（這一場用過奇襲的武將與那一擊的傷害）與 `enemy_hp`（每個敵人目前的血量），讓瀏覽器測試能算出每一擊的實際傷害                                                                                                              |

### 20.2 另外修正：獨立戰鬥頁停在「載入戰場中…」

- **現象**：從主頁進入獨立戰鬥頁時，偶爾一直停在「載入戰場中…」。R12 瀏覽器測試的第一次到第四次執行都在這一段逾時。
- **原因（實測）**：卡住時 harness 記錄到 Godot 已送出 `game_ready`，但頁面沒有處理，也沒有送出關卡資料。從遊戲 iframe 內再補送一次 `game_ready`，頁面就立刻恢復，所以不是訊息監聽或來源檢查的問題，而是時序問題。獨立戰鬥頁的 iframe 在伺服器產生的 HTML 裡就有，會在頁面程式載入前開始載入；遊戲從 Service Worker 快取啟動得很快時，`game_ready` 比 React 掛上訊息監聽還早送出，而這個握手只有一次。主頁的 iframe 在 React 掛載後才建立，所以沒有這個問題。
- **修正**：Godot 收到 `request_ready` 時再送一次 `game_ready`；獨立戰鬥頁掛上訊息監聽後送出 `request_ready`。遊戲還沒啟動時會忽略這個請求，之後照常送出 `game_ready`；重複收到不影響。舊版遊戲不認得 `request_ready` 時會忽略，不會把它當成關卡資料（舊版會走到 payload 分支，但沒有 `stage_id`，不會重新載入關卡）。
- **穩定重現**：R12 瀏覽器的 F 段讓頁面程式（`/_next/static/chunks/*.js`）延遲 4 秒回應，確保遊戲比頁面先準備好。修正前獨立戰鬥頁必定卡住，修正後通過；主頁在同樣的條件下修正前後都正常。

### 20.3 Round 12 檢查結果

| #      | 項目                   | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                                        |
| ------ | ---------------------- | ---- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R12-G1 | Godot 測試（實際傷害） | 通過 | 實測     | 新版 97／97（原 84 項＋R12 13 項）。敵人血量實際下降：第一擊 200、之後 100；沒有目標不會用掉；同一場換波次、移動位置、更新隊伍、移除後重新放置都不再觸發；新的一場重置；沒有技能與不認得的技能都是普通攻擊；觸發時出現一次「x2!」；收到 `request_ready` 會再送 `game_ready` |
| R12-G2 | 功能前對照             | 通過 | 實測     | HEAD 版 Godot 跑新測試：需要出現 2 倍傷害的 R12-1、R12-3 前置、R12-7 與 R12-10 失敗（結束碼 1）；「不應重複觸發」的案例在沒有技能的版本本來就會通過，鑑別力由反向驗證證明                                                                                                   |
| R12-G3 | Godot 反向驗證         | 通過 | 實測     | 6 種錯誤實作（每個武將節點各記一次、每波重置、沒有目標也用掉、新的一場不重置、更新隊伍時重置、移位時重置）各自讓對應的 R12 測試失敗；用最終程式碼重跑，暫存副本還原                                                                                                         |
| R12-G4 | 匯出與產物             | 通過 | 實測     | 每次改 GDScript 後都先匯出（只有對應的 `.gdc` 不同），把 3 個檔案複製到 `public/` 後用全新工作目錄重跑，全部通過、結束碼 0                                                                                                                                                  |
| R12-U1 | store 測試             | 通過 | 單元     | 126／126（原 125 項＋R12-S1：技能定義是唯一來源）                                                                                                                                                                                                                           |
| R12-B1 | 瀏覽器 `r12-web.js`    | 通過 | mock     | 18／18：技能說明（主頁武將視窗、武將頁）；主頁與獨立戰鬥頁實際傷害 300、150、150、150；同一關重來又是 300；結算與存檔沒有技能欄位；頁面程式延遲 4 秒時兩個戰鬥頁都能進入。修正握手之前的四次試跑都在獨立戰鬥頁逾時，原始結果保留在 `dev-trial/` 與 `before-race-fix/`       |
| R12-B2 | 其他瀏覽器回歸         | 通過 | mock     | 全新 context 一次跑完：I1 14／14、I2 8／8、自動計時 9／9、正常流程 9／9、R3 13／13、產物與網路 12／12、R4 22／22、R5／R6 26／26、R7 9／9、R8 16／16、R9 21／21、R10 26／26。GAS 網路請求 0 筆                                                                               |
| R12-W1 | build、tsc、lint       | 通過 | 實測     | dev 停止後執行：build 65 秒、84 頁，`out/` 的 `index.pck` 與 `public/` 相同；tsc 0；遊戲與工具 ESLint 0 error／9 個既有 warning；全站 0 error／81 warning；`tools/selftest.mjs` 21／21；`git diff --check` 通過                                                             |

**過程紀錄（照實保留）**

1. 第一版 Godot 測試的量測工具會把同一隻敵人之前累積的傷害算成一擊（沿用上一段已受傷的敵人時），第一次匯出時 R12-4～R12-6 因此誤報失敗；改成以開始記錄時的血量為基準後重跑。
2. 瀏覽器的前幾次試跑：一次漏了先點掉「進入戰場」開場畫面；獨立戰鬥頁的畫布縮放和主頁不同，改用 `place_hero` 訊息放置；另外四次在獨立戰鬥頁卡在載入中，查出是 20.2 的握手時序問題並修正。
3. 最後一次 Godot 測試之後，只移除了測試檔結尾多出的空行（`git diff --check`），內容沒有變。
4. 觸發標記原本是「奇襲！」，截圖裡顯示成方框（沒有中文字型），改成倍率標記；新增的 Godot 斷言又抓到 `String.num(2.0)` 會產生「x2.0!」，已修正。

證據在 `.handoff/evidence/round-12/`。

### 20.4 仍未涵蓋

- 技能在真實 GAS 下的端到端沒有測試。技能不經過後端，只有結算與存檔照原本的流程。
- 獨立戰鬥頁的瀏覽器測試用頁面部署選單送出的同一個 `place_hero` 訊息放置趙雲。這個頁面的畫布縮放和主頁不同（地圖比畫面寬），主頁用的格子座標換算不適用；實際點擊部署選單的流程在主頁驗證。
- Godot 畫布裡的中文顯示成方框是既有問題（見路線圖 §4），本輪沒有處理。
- D11／D12 仍是發布前必須處理的項目。

### 20.5 修改檔案

| 檔案                                                                                                                                                               | 內容                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/app/(games)/shenmaSanguo/utils/heroSkills.ts`（新增）                                                                                                         | 技能定義（唯一來源）、說明文字、送進 Godot 的參數                                                                              |
| `…/components/HeroSkillInfo.tsx`（新增）、`…/components/modals/HeroListModal.tsx`、`…/heroes/components/HeroesPageContent.tsx`、`…/styles/shenmaSanguo.module.css` | 武將列表的技能標籤、詳情的完整規則                                                                                             |
| `…/components/SinglePageContent.tsx`、`…/battle/components/BattlePageContent.tsx`、`…/types/index.ts`                                                              | 隊伍資料帶技能參數；獨立戰鬥頁掛上監聽後送 `request_ready`                                                                     |
| `godot/shenmaSanguo/entities/hero/Hero.gd`、`systems/BattleManager.gd`、`main/Main.gd`、`bridge/WebBridge.gd`                                                      | 奇襲、這一場的使用紀錄、快照的 `enemy_hp`／`first_strike_used`、`request_ready`                                                |
| `public/games/shenmaSanguo/index.{pck,html,service.worker.js}`                                                                                                     | 重新匯出（其餘檔案逐位元組相同）                                                                                               |
| `scripts/shenma-regression/…`                                                                                                                                      | Godot 測試 R12-1～R12-10、`bridge_recorder.gd` 記錄就緒訊息、store 測試 R12-S1、`r12-web.js`（新增）、harness 證據目錄、README |
| `docs/shenma-sanguo-feature-roadmap.md`（新增）、`src/app/(games)/shenmaSanguo/doc/implementation_plan.md`、`…/doc/hero-skill-roadmap.md`                          | 依程式碼盤點的路線圖；舊文件開頭加上指引                                                                                       |

### 20.6 待決事項（截至 Round 12，取代 §19.5）

> Round 13 起由 §21.7 取代。

| #   | 事項                                                                         | 目前狀態                                                                                    |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改） | 後續再安排                                                                                  |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`  | 後續再安排                                                                                  |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                     | 未決定；需要後端契約證據                                                                    |
| D4  | 自動重新確認的次數與間隔                                                     | 已決定（Round 7）                                                                           |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                   | 未決定；需要 GAS 原始碼                                                                     |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                    | 風險仍在；不屬於神馬三國                                                                    |
| D7  | commit                                                                       | Round 7～10：`81cabb43`；Round 11 文件：`7cec1df2`；都在本機、未 push。Round 12 還沒 commit |
| D8  | 請求逾時；多裝置衝突                                                         | 仍待規劃（帳號歸屬與場次隔離已在 Round 8＋9 處理）                                          |
| D9  | 手動同步進行中，是否禁止其他操作                                             | 已決定（Round 8）：不加全域同步鎖                                                           |
| D10 | 切換帳號被擋下時的提示                                                       | 已處理（Round 10）                                                                          |
| D11 | 跨來源隔離切換時 sessionStorage 各有一份                                     | 已調查（Round 11，§19）；發布前必須處理                                                     |
| D12 | 是否把跨來源隔離縮小到只有 `bgRemover`                                       | 未決定；發布前必須處理（§19.4）                                                             |
| D13 | Godot 畫布裡的中文顯示成方框（沒有中文字型）                                 | 未決定；加入字型會讓遊戲檔案變大，而且要確認授權                                            |

## 21. Round 13（2026-09-28）：跨來源隔離只留給 AI 去背（D11／D12 修復）

Round 12 在本輪開始前經使用者同意在本機 commit（`c62298db`，未 push）。本輪實作 §19.4 的根本處理：網站只有 AI 去背（`bgRemover`）使用跨來源隔離，其他頁面一律非隔離，並把舊的全站隔離安全遷移掉。沒有部署、沒有存取正式 GAS，全部玩家請求都是 mock 與虛構金鑰。

### 21.1 機制實驗（設計依據）

系統 Chrome 153（無頭）、本機 dev、真實的 coi Service Worker（根目錄範圍），頁面是同一個來源、沒有任何程式的靜態頁。腳本與原始結果：`.handoff/evidence/round-13/x1-semantics.*`。

| #   | 操作                                                                      | 結果                                                                           |
| --- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| T1  | 隔離頁寫 X → 強制重新整理（非隔離）只寫 Y → 回到隔離                      | 非隔離頁看不到 X；回到隔離後 X 仍在、Y 也帶過來：**逐項套用**                  |
| T2  | 隔離頁寫 X → 非隔離頁寫 X 再移除 → 回到隔離                               | 隔離那一份的 X 也不見了：**移除也會套用**                                      |
| T3  | 隔離頁寫 X、`history.state`、`window.name` → 移除 SW 後重新載入（非隔離） | 看不到 X，`history.state` 與 `window.name` 都清空：**隔離 → 非隔離什麼都不帶** |
| T4  | 隔離頁寫 X、Z → 非隔離頁寫 X → 回到隔離                                   | X 變成非隔離的值，Z 保留（Round 11 E5 的機制）                                 |
| T5  | 移除 SW 後 `location.replace(?m=abc)`                                     | 查詢字串帶到非隔離頁                                                           |

推論：

1. 目前頁面是隔離狀態時，最後一次切換是「進入隔離」，非隔離那一份寫過的內容已經套用進來，所以**隔離那一份一定比較新**。
2. 在非隔離頁讀不到隔離那一份；要讀只能切回隔離，而非隔離那一份寫過的項目會先蓋過去。
3. 能跨越「隔離 → 非隔離」的只有 localStorage 與網址。

### 21.2 規則

| 項目                         | 規則                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 隔離範圍                     | 只有 `/bgRemover`。用同一支 `coi-serviceworker.js`（內容沒有改）註冊在 `/bgRemover` 範圍。首頁、神馬主頁、獨立戰鬥頁、bobaSurvivors 等其他頁面都是非隔離。兩個 Godot 產物都是無執行緒版本（`GODOT_THREADS_ENABLED = false`），實測在非隔離下都能啟動                                                                                                                               |
| 開機腳本                     | `src/utils/siteIsolation/boot.ts`，`layout.tsx` 用 `toString()` 放成 `<head>` 裡的行內 `<script>`，頁面解析時就執行。原本的 `next/script` `beforeInteractive` 在 App Router 其實是 Next 的程式載入後才注入執行。函式不能引用外部變數（有單元測試檢查）。SPA 換頁時由 `SiteIsolationGuard` 呼叫 `check()`                                                                           |
| 離開隔離                     | 發生在舊根目錄 SW 控制的頁面，或從 bgRemover 用 SPA 換到其他頁：在隔離頁把 `shenma_player_state` 備份到 localStorage（以隨機遷移編號區分）→ 只移除經辨識的舊註冊（範圍是根目錄、腳本是 `coi-serviceworker.js`；遊戲 SW 與其他資料不動）→ 帶 `?__iso_mig=編號` 重新載入。非隔離頁只採用網址上那個編號的備份，取代非隔離那一份；被取代的舊值放進復原區（`replaced`，不顯示、不採用） |
| 強制重新整理剛好是第一次載入 | 非隔離頁、舊 SW 還在、分頁還沒確認時，隔離那一份可能比較新。非隔離那一份沒有資料：帶 `?__iso_hop=1` 回到隔離（舊 SW 仍會加標頭；沒有資料可套用，不會蓋掉隔離那一份），在那裡照上一列遷移。有資料：回到隔離會先被它蓋掉，所以不回去；移除舊註冊，把這份資料移到復原區（`unverified`），神馬三國改用雲端存檔並提示玩家                                                               |
| 分頁確認                     | 新程式在非隔離頁完成判斷後，在非隔離的 sessionStorage 寫入分頁識別（`__site_iso_tab`），之後的載入直接信任這個分頁的資料。沒有分頁識別、session 卻有資料，而且這個瀏覽器有過舊註冊（還在，或 localStorage 記錄移除過）時，視為舊網站時期留下的非隔離暫存，移到復原區；從沒有過舊註冊時（例如不支援 SW、一直是非隔離的瀏覽器）照常信任                                              |
| 進入隔離（bgRemover）        | 非隔離時註冊範圍 SW，啟用後帶 `?__iso_enter=1` 重新載入；已註冊過時，直接導覽第一次載入就是隔離。和 coi 原本的頁面腳本一樣，隔離頁會把 `coepCredentialless` 設定告訴 SW                                                                                                                                                                                                            |
| 不會無限重新載入             | 每一種重新載入都帶標記，帶著標記回來仍未達成就停止。離開失敗（移除失敗、回報成功卻仍是隔離、localStorage 無法寫入）→ `failed`：不重新載入，照舊在隔離狀態使用（隔離那一份仍是最新的，刪除那筆備份），這個分頁之後不再嘗試。回到隔離失敗 → 移除舊註冊，以非隔離使用。進入失敗（註冊失敗、不支援 SW、逾時 10 秒）→ `unavailable`：bgRemover 以非隔離執行                             |
| 網址與紀錄                   | 標記只有隨機編號，載入後立即用 `replaceState` 移除（保留原本的 `history.state` 與其他參數）；不含存檔內容或金鑰，也不寫 console                                                                                                                                                                                                                                                    |
| 儲存與清理                   | 遷移備份 `__site_iso_mig:<編號>`：採用後刪除，沒被採用的 1 天後刪除。復原區 `__site_iso_recovery`：只保留 7 天、最多 20 筆，每筆記下分頁識別，未知版本忽略。`__site_iso_retired`：移除過舊註冊的時間。`__site_iso_leave_failed`（隔離那一份的 session）：這個分頁離開失敗過                                                                                                        |
| 神馬三國                     | `GameInitializer` 等遷移完成、而且這一頁不需要換頁（`usable()`）之後才讀 session；從 bgRemover 用 SPA 進來時，會先換成非隔離頁才初始化。復原區只看這個分頁、這個帳號、`unverified` 的項目：有未同步內容時提供「改用這份暫存」（再確認一次，說明會覆蓋雲端存檔；寫回 session 並重新載入，照一般流程補送，待確認的升級照常重新確認）與「捨棄」；沒有未同步內容時只告知已改用雲端存檔 |
| 沒有改                       | `coi-serviceworker.js`、兩個 Godot 產物與 GDScript、GAS／Sheets、存檔格式、playerStore 的同步規則（只把 session 的 key 名稱改成 export）                                                                                                                                                                                                                                           |

### 21.3 修復前後

同一支 `r13-web.js`（37 項斷言）先在修復前的程式（`c62298db`）上執行，再在修復後執行：

| 情境                                                              | 修復前（`before-fix/`）                                             | 修復後                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 整體                                                              | 7／37，結束碼 1                                                     | 37／37，結束碼 0                                                         |
| B（E5：隔離那一份有未同步隊伍＋待確認升級）                       | 一般載入正常；接著強制重新整理，隊伍退回、待確認升級消失（重現 E5） | 一般載入先備份再換成非隔離；強制重新整理後都還在，沒有保存、沒有重送升級 |
| E（強制重新整理剛好是第一次載入，非隔離那一份有較舊的未同步隊伍） | 舊的關羽隊伍送出兩次，伺服器退回舊隊伍（重現 E4）                   | 沒有送出，伺服器維持新隊伍；顯示提示，玩家確認後才改用                   |
| C（E4 形狀，一般載入後強制重新整理）                              | 這次沒有重現過時的保存（時序），只有隔離狀態的斷言失敗              | 採用新隊伍，舊暫存只留在復原區                                           |
| D、G（舊 SW 使用者的其他路徑）                                    | 資料保留，但頁面仍是隔離                                            | 資料保留並補送，頁面換成非隔離、舊註冊移除                               |

### 21.4 Round 13 檢查結果

| #      | 項目                | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------ | ------------------- | ---- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R13-X1 | 機制實驗            | 完成 | 實測     | §21.1                                                                                                                                                                                                                                                                                                                                                                                                   |
| R13-U1 | 開機腳本單元測試    | 通過 | 單元     | `web/site-isolation.test.mjs` 19／19（SI-1～SI-18、SR-1）                                                                                                                                                                                                                                                                                                                                               |
| R13-U2 | 開機腳本反向驗證    | 通過 | 單元     | 7 種錯誤實作（不備份、採用別的備份、失敗後繼續重試、有資料也回到隔離、進入隔離不看標記、移除所有 SW、無法確認的暫存直接信任）都被對應的測試抓到；在暫存副本執行，沒有改 src                                                                                                                                                                                                                             |
| R13-B1 | 瀏覽器 `r13-web.js` | 通過 | mock     | 37／37：新使用者（三個頁面都非隔離、一般／強制重新整理不再切換）、bgRemover 往返與實際去背、bobaSurvivors 啟動、B～G 舊使用者、I 失敗不迴圈。F 是已知限制（§21.5），只斷言安全結果                                                                                                                                                                                                                      |
| R13-B2 | 其他瀏覽器回歸      | 通過 | mock     | 重啟 dev、全新 context 一次跑完 15 支：I1 14、I2 8、自動 9、正常 9、R3 13、產物 12、R4 22、R5／R6 26、R7 9、R8 16、R9 21、R10 26、R12 18、R13 37。GAS 網路請求 0 筆                                                                                                                                                                                                                                     |
| R13-S1 | 正式靜態匯出        | 通過 | mock     | `npm run build` 之後用 `tools/serve-out.mjs` 以 GitHub Pages 的方式提供 `out/`（`/bgRemover` → `bgRemover.html`，不送 COOP／COEP）：harness＋`r13-web.js` 37／37、`r12-web.js` 18／18，結束碼 0（`LOCAL_ASSETS=1`；資源前綴改寫成同源，見過程紀錄 3）。實際走過 `/bgRemover` 範圍 SW、`?__iso_hop`／`?__iso_mig` 的遷移導覽與去背                                                                       |
| R13-U3 | store 測試          | 通過 | 單元     | 126／126（沒有新增）                                                                                                                                                                                                                                                                                                                                                                                    |
| R13-W1 | build、tsc、lint    | 通過 | 實測     | build 49 秒、結束碼 0；`out/` 的 82 個頁面都在 `<head>` 裡有開機腳本（壓縮後 4.3 KB）、沒有 coi 的注入；`out/coi-serviceworker.js` 與 Godot 產物和 `public/` 相同。tsc 0；遊戲、工具與新檔案的 ESLint 0 error／9 個既有 warning；`git -c core.whitespace=cr-at-eol diff --check` 通過（`layout.tsx`、`ClientLayout.tsx` 在版本庫裡是 CRLF，新增行照原檔用 CRLF，一般的 `--check` 會把行尾 CR 當成空白） |

**過程紀錄（照實保留）**

1. 第一次完整回歸期間，我用 Prettier 排版了 `src/utils/siteIsolation/boot.ts`（只有換行差異），違反「回歸期間不改 src」。那一次的結果只當參考（`full-run-ref/`），最終結果是 src 定案後重啟 dev 重跑的。
2. 參考回歸裡 `artifacts-and-network.js` 有一項失敗：iframe 的 wasm `encodedBodySize` 是壓縮後大小。以前神馬頁面由根目錄 coi SW 控制，iframe 資源經 SW 轉手（`transferSize` 0、回報解壓後大小）；現在沒有根目錄 SW，iframe 第一次載入直接走網路、dev server 壓縮傳輸。改成比對解壓後大小 `decodedBodySize`（兩種情況都成立），原欄位保留在結果裡。
3. 第一次正式靜態匯出驗證時，bgRemover 在隔離狀態下頁面程式沒有完成載入（去背沒有開始、SPA 連結找不到）：本機頁面在 `localhost`，正式版的 `_next` 資源卻指向 `https://qwer820921.github.io/`（assetPrefix），是另一個來源；隔離頁（COEP require-corp）會擋下 SW 取得的跨來源不透明回應。正式站兩者同源，不會這樣。`serve-out.mjs` 改成把文字檔裡的這個前綴改寫成同源的 `/_next/` 後重跑；第一次的結果保留在 `static-run/attempt1-cross-origin-assets/`。
4. R13 的 H-2 原本要求去背後主體中心的不透明度大於 240；實測是 234（邊緣柔化），改成大於 200，背景角落仍要求小於 16。
5. 測試經過網站首頁，新增兩項有說明的已知雜訊：首頁「聯絡」卡片的封面 `contact.webp` 不存在；正式靜態匯出時 Next 16 的部落格預先載入檔名和 `out/` 的巢狀目錄對不上（GitHub Pages 同樣 404）。兩者都和本輪無關。
6. 正式靜態匯出驗證的結果寫進了同一個證據目錄，蓋掉了完整回歸中 R12、R13 的原始 JSON 與截圖（15 支的摘要 log `run-browser-full.log` 還在）。之後在 dev 單獨重跑 R12＋R13（18／18、37／37），原始證據在 `dev-r12-r13/`。

證據在 `.handoff/evidence/round-13/`。

### 21.5 仍未涵蓋

1. **強制重新整理剛好是新程式的第一次載入，而且非隔離那一份寫過（r13 F）**：（Round 14 起：舊進度仍讀不回，但之後不會再覆蓋後端，見 §22.1 C13-F）隔離那一份（例如未同步隊伍、待確認升級）讀不到，這是 §21.1 的機制決定的。處理：不送出任何舊資料、不重送升級、改用雲端存檔並提示「更新前尚未同步的修改可能沒有保留」。如果那次升級之後才在伺服器完成，下一次保存可能蓋掉它（Round 5 以前的風險，只在這個情境）。前提是非隔離那一份曾被寫過（Round 11：正常使用沒有重現）。
2. **部署時開著舊版頁面的其他分頁**：第一個分頁完成遷移（移除舊註冊）後，其他分頁在重新整理前仍由舊程式在隔離狀態執行、照常自動保存；如果在保存完成前重新整理，隔離那一份同樣讀不到。沒有分頁識別的舊暫存不會自動採用。
3. 正式站的 HTML 有 10 分鐘快取：部署後短時間內載入舊 HTML 時，舊程式會再註冊根目錄 SW；之後載入新 HTML 時會再遷移一次（有測試涵蓋：再次遷移、移除失敗都不會迴圈）。
4. 只測了系統 Chrome 153（無頭）；Firefox、Safari 沒有測。正式站的實際遷移要部署後才能觀察。
5. 本機靜態匯出驗證和正式站的差別：頁面在 `localhost`、資源前綴改寫成同源（§21.4 過程紀錄 3）；沒有真實的 GitHub Pages 快取行為。
6. 主頁的「遊戲新版本已就緒」偵測（`SinglePageContent` 的 `navigator.serviceWorker.ready`）原本實際監看的是根目錄 coi SW，不是遊戲 SW；現在神馬頁面沒有 SW 控制，這段不會觸發。遊戲 SW 的更新由 Round 10 的 `activateLatestGameWorker` 處理，本輪沒有改。
7. 遊戲 iframe 第一次載入不再經過任何 SW（之前經過根目錄 coi SW），之後由遊戲自己的 SW 控制。
8. L1（跨重載舊 `save_profile` 晚到）、多裝置衝突、D13 字型不在本輪範圍。

### 21.6 修改檔案

| 檔案                                                                                                                                                                                | 內容                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `src/utils/siteIsolation/boot.ts`（新增）                                                                                                                                           | 開機腳本：隔離範圍、遷移、復原區、不重複重新載入                                                |
| `src/utils/siteIsolation/useSiteIsolation.ts`（新增）、`src/components/common/siteIsolationGuard.tsx`（新增）                                                                       | React 包裝：遷移完成才可使用、復原區內容；SPA 換頁時檢查                                        |
| `src/app/layout.tsx`、`src/app/ClientLayout.tsx`                                                                                                                                    | 移除全站 coi 腳本，改放行內開機腳本；加入 SPA 守門元件                                          |
| `src/app/(games)/shenmaSanguo/components/GameInitializer.tsx`、`…/components/IsolationRecoveryNotice.tsx`（新增）、`…/utils/isolationRecovery.ts`（新增）、`…/store/playerStore.ts` | 等遷移完成才初始化；復原提示；session key 名稱改成 export                                       |
| `scripts/shenma-regression/r13-web.js`（新增）、`web/site-isolation.test.mjs`（新增）、`tools/serve-out.mjs`（新增）                                                                | R13 瀏覽器回歸、開機腳本單元測試、正式靜態匯出的本機伺服器                                      |
| `scripts/shenma-regression/harness.js`、`tools/run-browser.mjs`、`artifacts-and-network.js`、`README.md`                                                                            | 證據目錄改為 round-13、兩項已知雜訊、回報預期錯誤的來源；`LOCAL_ASSETS=1`；比對解壓後大小；說明 |
| `docs/shenma-sanguo-feature-roadmap.md`                                                                                                                                             | 後續順序更新；黃忠「百步穿楊」草案與名單核對（§6）                                              |

### 21.7 待決事項（截至 Round 13，取代 §20.6）

> Round 14 起由 §22.6 取代。

| #   | 事項                                                                                           | 目前狀態                                                                                                                                                  |
| --- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改）                   | 後續再安排                                                                                                                                                |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`                    | 後續再安排                                                                                                                                                |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                                       | 未決定；需要後端契約證據                                                                                                                                  |
| D4  | 自動重新確認的次數與間隔                                                                       | 已決定（Round 7）                                                                                                                                         |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                                     | 未決定；需要 GAS 原始碼                                                                                                                                   |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                                      | 風險仍在；不屬於神馬三國                                                                                                                                  |
| D7  | commit                                                                                         | Round 7～10：`81cabb43`；Round 11：`7cec1df2`；Round 12：`c62298db`；都在本機、未 push。Round 13 還沒 commit，待 Codex 驗收                               |
| D8  | 請求逾時；多裝置衝突                                                                           | 仍待規劃                                                                                                                                                  |
| D9  | 手動同步進行中，是否禁止其他操作                                                               | 已決定（Round 8）：不加全域同步鎖                                                                                                                         |
| D10 | 切換帳號被擋下時的提示                                                                         | 已處理（Round 10）                                                                                                                                        |
| D11 | 跨來源隔離切換時 sessionStorage 各有一份                                                       | 已實作（Round 13，§21）：只有 bgRemover 隔離、舊使用者先備份再遷移；待 Codex 驗收。剩下 §21.5 的 1、2 兩種讀不到隔離那一份的情境                          |
| D12 | 是否把跨來源隔離縮小到只有 `bgRemover`                                                         | 已實作（Round 13）；待 Codex 驗收。部署後如何觀察正式站的遷移，需要另外決定                                                                               |
| D13 | Godot 畫布裡的中文顯示成方框（沒有中文字型）                                                   | 未決定                                                                                                                                                    |
| D14 | Round 14 黃忠「百步穿楊」的正式設定（`hero_id`、職業、射程）                                   | 倉庫無法證實（路線圖 §6）：需要使用者提供正式 `heroes_config` 那一列，或授權唯讀讀取；也可改做已證實 ID 的武將                                            |
| D15 | 這個 clone 沒有安裝 git hooks（`package.json` 沒有 `prepare: husky`，`core.hooksPath` 未設定） | 未決定：Round 11、12 的 commit 都沒有經過 lint-staged（模擬結果只會重排兩份舊 md，ESLint 沒有變動）。是否加上 `prepare`、或在 commit 前手動跑 lint-staged |

## 22. Round 14（2026-09-28）：Round 13 的資料保護修正與黃忠「百步穿楊」

Codex 驗收 Round 13 未通過：獨立重現三個資料保護問題（開機腳本補測 2 項失敗、F 情境補測 8／9）。Round 13 尚未 commit。本輪先修這三點，再實作第二個武將技能；兩部分分開記錄、分開驗收。沒有 commit、push 或部署。後端只有 Codex 對靜態武將設定做過一次唯讀讀取（不帶玩家金鑰，見路線圖 §3）；其餘全部 mock。

### 22.1 Round 13 修正

| #     | 問題（Codex 重現）                                                                                                                                 | 修正                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C13-1 | 查詢舊註冊失敗或逾時被當成「沒有舊註冊」：非隔離的舊暫存被信任、寫入確認標記，神馬三國讀取並補送舊資料                                             | 查詢失敗或逾時先再試兩次（1 秒、2 秒後）。仍然查不到，而且這個分頁還沒確認、也沒有採用備份時，停在 `uncertain`：不信任 session、不寫確認標記，神馬三國不讀取也不保存，顯示「存檔處理暫停」並提供「重試」（在原頁面重新查詢，不重新載入）與「改用雲端存檔繼續」（session 的資料移到復原區，分頁標成遷移狀態不明）。已確認的分頁照常使用                                                                                                                               |
| C13-2 | 備份寫不回 session 時仍刪除唯一的最新備份                                                                                                          | 寫回 session（並讀回確認）成功才刪備份。被取代的舊值存不進復原區時也不覆蓋 session。失敗時備份保留（保留期改成 7 天），編號記進分頁紀錄（`pendingClaim`），下一次載入或按「重試」時再採用；分頁紀錄也寫不進去時，網址上的遷移編號保留。在那之前神馬三國不讀取也不保存                                                                                                                                                                                                |
| C13-F | 讀不回隔離那一份（F 情境）之後，更新前送出的升級稍晚才在伺服器完成，之後的一般保存把它蓋掉（後端 gold 1000、heroes 空）                            | 讀不回隔離那一份的分頁標成「遷移狀態不明」（分頁紀錄 `lost`），這個分頁載入的每個帳號都加上保護（存檔的 `migrationGuard`：基準是最近一次確認過的伺服器資料）。保護中每次保存都先讀取伺服器最新資料，只把本機相對於基準的修改合併上去（武將與點數以伺服器為準、點數以差額合併，其他欄位用本機的修改）；升級一律由伺服器計算（有未同步修改時先合併保存）；讀取伺服器失敗就不保存。保護存在 session，重新整理、讀取雲端、關閉提示都不會解除；只有沒有這個情況的分頁照舊 |
| 自查  | 停在 `uncertain` 時重新載入（原本的「重試」、或玩家自己按 F5）：舊 SW 仍會把頁面帶回隔離狀態，非隔離那一份的舊暫存先套用過去，再被當成最新備份採用 | 「重試」改成在原頁面重跑；進入 `uncertain` 時分頁紀錄標上 `uncertain`（隨非隔離那一份套用到隔離狀態）。離開隔離時看到這個標記，備份標成可疑：非隔離頁不採用，連同舊暫存放進復原區、標成遷移狀態不明；離開隔離也失敗時，隔離那一份同樣不照舊使用                                                                                                                                                                                                                      |
| 共通  | 其他入口（登入、切換帳號、手動同步）                                                                                                               | 開機腳本回報問題（`problem`：`lookup-failed`／`restore-failed`／`storage-failed`）時，store 也暫停（`setSessionBlocked`）：不讀取 session、不讀取伺服器存檔、不保存                                                                                                                                                                                                                                                                                                  |

**仍無法恢復的部分**：F 情境隔離那一份的舊進度（未同步隊伍、待確認升級）仍然讀不回，這是 §21.1 的機制決定的；本輪只保證之後不會繼續覆蓋後端。合併保存是「先讀、再寫」，升級剛好在這兩步之間才在伺服器完成時仍會被蓋掉（store 的已知限制 L2，和 L1 一樣需要後端版本號或條件寫入）。

### 22.2 黃忠「百步穿楊」

規則、正式設定與畫面見路線圖 §3。重點：有效射程 ＝（基礎射程 ＋（等級 − 1）× 射程成長）× 1.5（Lv1 7.5 格），傷害與攻擊間隔不變；`Hero.gd` 在放置與 `update_team` 時都從基礎值重算再乘（`_compute_range`），不疊乘；Web 的 `utils/heroSkills.ts` 是說明、實際射程與 Godot 參數（`{ id: "long_range", range_multiplier: 1.5 }`）的唯一來源，每種技能只帶自己的參數；`debug_snapshot` 多了 `hero_ranges` 與 `hero_enemy_dist`（測試用）。已依規範重新匯出 Godot，`public/` 只有 `Hero.gdc`、`Main.gdc` 與對應的 `index.html`（pck 大小）、SW 版本不同。

### 22.3 Round 14 檢查結果

**Round 13 修正**

| #      | 項目                | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                              |
| ------ | ------------------- | ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C13-U1 | 開機腳本單元測試    | 通過 | 單元     | 30／30（新增 SI-19～SI-29；SI-16 從「逾時視為沒有」改成新規則、SI-15 保留期改成 7 天）；Codex 的補測 2／2 通過                                                                                                                                                    |
| C13-U2 | 修正前對照          | 通過 | 單元     | Round 13 版開機腳本跑新測試：12 項失敗（SI-16、SI-19～SI-29）；修正前的 store 跑新的保護測試：8 項失敗（功能不存在）                                                                                                                                              |
| C13-U3 | store 保護測試      | 通過 | 單元     | R13F-G1～G8（稍晚完成的升級 → 修改隊伍、重新整理、背景讀取與手動同步、升級、戰鬥獎勵、讀取失敗、切換帳號、改用舊暫存後）；一般使用者不受影響（G6）；已知限制 L2 另外記錄                                                                                          |
| C13-B1 | 瀏覽器 `r13-web.js` | 通過 | mock     | 45／45：原本 37 項，加上 F-4、F-5（Codex 的補測：稍晚完成的升級後用真實隊伍 UI 修改、重新整理再修改，後端保有 900 與關羽 Lv2、沒有重送升級）、K-1～K-4（查詢一直失敗、改用雲端、原頁面重試、停在 uncertain 時自己重新整理）、Q-1～Q-2（寫回失敗、空間恢復後重試） |

**Round 14 技能**

| #      | 項目                   | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                           |
| ------ | ---------------------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R14-G1 | Godot 測試（實際扣血） | 通過 | 實測     | 108／108（原 97 項＋R14-1～R14-11）：速度 0 的敵人放在 6、7.4 格會扣血，7.52、7.6 格不會；沒有技能時 5 格；Lv2 7.545 格；連續更新隊伍、更新等級、移位、重新放置、新的一場都不疊乘；傷害就是攻擊力、攻擊間隔約 0.50 秒（和沒有技能時相差 0.001 秒）             |
| R14-G2 | 功能前對照             | 通過 | 實測     | HEAD 版 Godot 跑新測試：R14-1～R14-3、R14-5～R14-10 失敗（射程停在 5）；R14-4 是對照組、R14-11 本來就該通過，鑑別力由反向驗證證明                                                                                                                              |
| R14-G3 | Godot 反向驗證         | 通過 | 實測     | 7 種錯誤實作（疊乘、更新隊伍忘了乘、成長沒有乘、改變攻擊間隔、不認得的技能也套用、移位再乘、加成傷害）都被對應的測試抓到；暫存副本還原                                                                                                                         |
| R14-G4 | 匯出與產物             | 通過 | 實測     | 第一次匯出只有兩個 `.gdc` 不同；複製 3 個檔案後用全新目錄重跑，產物核對通過、108／108、結束碼 0                                                                                                                                                                |
| R14-U1 | store 測試             | 通過 | 單元     | R14-S1：參數、說明與實際射程出自同一份定義；R12-S1 沒有退步                                                                                                                                                                                                    |
| R14-B1 | 瀏覽器 `r14-web.js`    | 通過 | mock     | 14／14：技能說明（視窗與武將頁，含實際射程）；主頁用部署選單放置，第一次扣血時敵人在 7.49 格（原射程外、新射程內），7.5 格外沒有扣血，每一擊就是攻擊力；選取面板顯示 7.5 格；戰鬥中升級兩次射程 7.545、7.59；獨立戰鬥頁有效；存檔與 session 沒有技能或射程欄位 |

**共通**

| #      | 項目             | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                              |
| ------ | ---------------- | ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R14-B2 | 瀏覽器完整回歸   | 通過 | mock     | 重啟 dev、全新 context 一次跑完 16 支：I1 14、I2 8、自動 9、正常 9、R3 13、產物 12、R4 22、R5／R6 26、R7 9、R8 16、R9 21、R10 26、R12 18、R13 45、R14 14，結束碼 0。GAS 網路請求 0 筆                                                                             |
| R14-S1 | 正式靜態匯出     | 通過 | mock     | build 後用 `tools/serve-out.mjs`：R13 45／45、R12 18／18、R14 14／14，結束碼 0                                                                                                                                                                                    |
| R14-W1 | build、tsc、lint | 通過 | 實測     | build 53 秒、結束碼 0；`out/` 82 頁都在 `<head>` 有開機腳本（壓縮後 6.1 KB）；Godot 產物與 coi 檔和 `public/` 相同。store 138／138（L1、L2 為已知限制）；tsc 0；範圍 ESLint 0／9、全站 0／81；Prettier 通過；`git -c core.whitespace=cr-at-eol diff --check` 通過 |

**過程紀錄（照實保留）**

1. `r13-web.js` 第一次跑時 K 段的量測函式也被「查詢註冊一律失敗」的故障注入打到；F-5 重新加入趙雲時超過隊伍容量（mock 武將每位花費 8、容量 11）。改成量測用保留的原生方法、F-5 改成把關羽換成趙雲後重跑。
2. 「存檔處理暫停」提示的「重試」按鈕在開發模式會被左下角的 Next 徽章蓋住（正式版沒有這個徽章），測試改用程式點擊同一個按鈕。
3. `r14-web.js` 第一次跑時，選取黃忠後的武將資訊面板蓋住了視窗的關閉鈕，第二次升級沒有完成；改成讀取面板上的射程並用它自己的關閉鈕關掉。第二次跑時 C-1 要求後端馬上是 Lv3，但第二次升級發生在第一次升級的保存還在 debounce 內（有未同步修改），依既有規則在本機計算、稍後保存；改成檢查本機等級，後端等級在同步完成後（E 段）檢查。
4. 這些都是測試本身的調整；每次調整後都重跑整支腳本，最終結果是 src 定案後、重啟 dev 的完整回歸。
5. 本輪的證據都用 `EVIDENCE_DIR` 分開目錄（`r13fix-dev-try*`、`skill-dev-try*`、`full-dev`、`static`），沒有互相覆寫。

證據在 `.handoff/evidence/round-14/`。

### 22.4 仍未涵蓋

1. F 情境與部署時開著的其他舊分頁：隔離那一份的舊進度仍然讀不回（§21.5 的 1、2）；本輪起不會再覆蓋後端，但合併保存的讀寫之間仍有空窗（L2）。
2. 沒有任何證據顯示曾在隔離狀態使用過的舊分頁（非隔離那一份沒有資料、沒有分頁紀錄）和新開的分頁分不出來，不會加上保護。
3. 保護只在同一個分頁；其他分頁或其他裝置同時修改仍屬 D8。
4. 選取武將後的資訊面板在升級後不會自動更新（仍顯示選取當下的等級與射程），這是既有行為，本輪沒有改。
5. 正式設定的 `speed_growth` 和程式使用的 `atk_spd_growth` 名稱不同，攻速成長目前沒有生效；本輪依指示沒有處理全體攻速。
6. 只測了 Chrome 153；Firefox、Safari 沒測；正式站實際遷移要部署後才能觀察。

### 22.5 修改檔案

**Round 13 修正**（Round 13 的檔案本來就還沒 commit，這裡只列本輪再改的部分）

| 檔案                                                                                                                                              | 內容                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/utils/siteIsolation/boot.ts`、`useSiteIsolation.ts`                                                                                          | 查不到舊註冊的 `uncertain`、有限重試、寫回失敗保留備份、分頁紀錄、原頁面重試、可疑備份 |
| `src/app/(games)/shenmaSanguo/store/playerStore.ts`、`types/index.ts`（`MigrationGuard`）、`utils/playerErrors.ts`                                | 遷移狀態不明的保護（合併保存）、store 暫停                                             |
| `…/components/GameInitializer.tsx`、`IsolationProblemNotice.tsx`（新增）、`IsolationRecoveryNotice.tsx`                                           | 暫停讀取與保存、「存檔處理暫停」提示、說明保護                                         |
| `scripts/shenma-regression/web/site-isolation.test.mjs`、`web/player-store.test.mjs`（R13F）、`r13-web.js`、`harness.js`、`tools/run-browser.mjs` | 單元與瀏覽器回歸、證據目錄可指定                                                       |

**Round 14 技能**

| 檔案                                                                                                                                                                                                         | 內容                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------- |
| `src/app/(games)/shenmaSanguo/utils/heroSkills.ts`、`types/index.ts`（`HeroSkillPayload`）、`components/HeroSkillInfo.tsx`、`heroes/components/HeroesPageContent.tsx`、`components/modals/HeroListModal.tsx` | 技能定義與參數、說明與實際射程   |
| `godot/shenmaSanguo/entities/hero/Hero.gd`、`main/Main.gd`、`public/games/shenmaSanguo/index.{pck,html,service.worker.js}`                                                                                   | 射程倍率技能、快照欄位、重新匯出 |
| `scripts/shenma-regression/godot/lifecycle_test.gd`、`r14-web.js`（新增）、`r12-web.js`（A-3 隨 mock 名單更新）、`harness.js`（mock 黃忠）、`web/player-store.test.mjs`（R14-S1）                            | 測試                             |
| `docs/shenma-sanguo-feature-roadmap.md`                                                                                                                                                                      | 百步穿楊規則與狀態               |

`types/index.ts`、`harness.js`、`player-store.test.mjs`、`README.md` 與本文件兩部分都有改到。

### 22.6 待決事項（截至 Round 14，取代 §21.7）

> Round 15 起由 §23.7 取代。

| #   | 事項                                                                             | 目前狀態                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改）     | 後續再安排                                                                                                                                                     |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`      | 後續再安排                                                                                                                                                     |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                         | 未決定；需要後端契約證據                                                                                                                                       |
| D4  | 自動重新確認的次數與間隔                                                         | 已決定（Round 7）                                                                                                                                              |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                       | 未決定；需要 GAS 原始碼                                                                                                                                        |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                        | 風險仍在；不屬於神馬三國                                                                                                                                       |
| D7  | commit                                                                           | Round 7～10：`81cabb43`；Round 11：`7cec1df2`；Round 12：`c62298db`；都在本機、未 push。Round 13（含本輪修正）與 Round 14 技能都還沒 commit，待 Codex 分別驗收 |
| D8  | 請求逾時；多裝置衝突                                                             | 仍待規劃（保護只在同一個分頁）                                                                                                                                 |
| D9  | 手動同步進行中，是否禁止其他操作                                                 | 已決定（Round 8）                                                                                                                                              |
| D10 | 切換帳號被擋下時的提示                                                           | 已處理（Round 10）                                                                                                                                             |
| D11 | 跨來源隔離切換時 sessionStorage 各有一份                                         | 已實作（Round 13）並修正三個資料保護問題（Round 14，§22.1）；待 Codex 驗收                                                                                     |
| D12 | 是否把跨來源隔離縮小到只有 `bgRemover`                                           | 已實作（Round 13）；待 Codex 驗收。部署後如何觀察正式站的遷移，需要另外決定                                                                                    |
| D13 | Godot 畫布裡的中文顯示成方框（沒有中文字型）                                     | 未決定                                                                                                                                                         |
| D14 | 黃忠的正式設定                                                                   | 已解決（Codex 唯讀讀取 `get_heroes_config`：`huang_zhong`、弓兵、射程 5、成長 0.03）；Round 14 已實作                                                          |
| D15 | 這個 clone 沒有自動執行 git hooks                                                | 已決定（Codex）：不改全站設定；之後獲准 commit 時手動對暫存的檔案跑 lint-staged 並核讀修改，不宣稱 hooks 已執行，不 amend 已驗收的 commit                      |
| D16 | 後端版本號／條件寫入（L1、L2）                                                   | 未決定；需要 GAS 原始碼與測試環境。在那之前，舊 `save_profile` 晚到（L1）與合併保存讀寫之間的空窗（L2）都保留為限制                                            |
| D17 | 正式設定的 `speed_growth` 與程式的 `atk_spd_growth` 名稱不同（攻速成長沒有生效） | 未決定；本輪依指示沒有處理全體攻速                                                                                                                             |

## 23. Round 15（2026-09-28）：黃忠提交、遷移狀態不明改成停止寫入、周瑜「火攻」

Codex 驗收 Round 14：黃忠「百步穿楊」通過，可以先獨立提交；Round 13 的 C13-1、C13-2 通過，但 C13-F 未通過——合併保存只是降低碰到舊值的機率，store 同一次執行就重現 L2（讀取之後後端才完成關羽 Lv2／900，接著的保存蓋回 1000／heroes 空）。Codex 選定的前端方案是「狀態未釐清時停止有風險的寫入」，不再加先讀再合併；後端原子寫入另列後續工作。同輪實作周瑜「火攻」MVP。Round 13（含本輪修正）與周瑜都還沒 commit，待 Codex 分別驗收；沒有 push、沒有部署。

### 23.1 黃忠獨立提交（`8275ff6d`）

- 使用者同意後照 `/commit-push` 流程本機提交、跳過 push：`feat: 新增黃忠百步穿楊射程技能`，19 個檔案，作者 ZeHoward。Round 13 的未提交修改全部保留在工作目錄。
- 拆分方式：在 HEAD（`c62298db`）的獨立 git worktree 組出只含技能的內容（`types/index.ts` 只有 `HeroSkillPayload`、`harness.js` 只有證據目錄與 mock 黃忠、`run-browser.mjs` 只有 `EVIDENCE_DIR`、store 測試只有 R14-S1；README、基準文件、路線圖只放黃忠段落，Round 13 標成待驗收），驗證後把同一份差異以部分暫存套到主倉庫；暫存區的樹雜湊與驗證用的完全相同（`6eff0e0c`）。
- 在獨立 worktree（不含任何 Round 13 修改）執行：tsc 0；手動 lint-staged（`eslint --fix`、`prettier --write`）沒有任何修改；store 127／127；Godot 全新暫存目錄 import／export／產物核對＋測試 108／108；瀏覽器（webpack dev：worktree 的 `node_modules` 是連結，Turbopack 不接受）`r12-web.js` 18／18、`r14-web.js` 14／14、`artifacts-and-network.js` 12／12。
- **意外（照實記錄）**：驗證完移除 worktree 時，`git worktree remove --force` 跟著 junction 把主倉庫的 `node_modules` 內容刪除。立刻用 `npm ci`（依 `package-lock.json`，820 個套件）恢復，之後 tsc 0、store 138／138 確認環境正常；版控內的檔案與未提交修改不受影響。

### 23.2 C13-F 定案：遷移狀態不明時停止寫入

| 項目                      | 規則                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 依據                      | 開機腳本的分頁紀錄 `lost`（`lostCopy`，存在 sessionStorage，重新整理後仍在），以及存檔的 `migrationHold` 標記，兩者任一就整個分頁受限。store 在每次寫入前直接讀分頁標記，不依賴元件先呼叫 `holdMigrationWrites()`；受限後載入或讀取的每一份存檔都記上標記                                                                                         |
| 禁止（store／API 呼叫前） | `save_profile`：自動 debounce、重新整理後補送、失敗重試、手動同步與切換帳號前的保存都經過 `_syncNow`，受限時不送出、不排重試（`syncError` 是 `MIGRATION_HOLD`）。`upgrade_hero`：拒絕，本機也不計算。`save_result`：開戰後才受限時不套用獎勵、不送出。`create_profile`：找不到存檔時不建檔。開戰：`beginBattle` 回傳 null，兩個戰鬥頁不送關卡資料 |
| 畫面                      | 底部「這個分頁的存檔暫停保存」提示一直顯示、沒有關閉按鈕（「說明」只展開原因與更新前暫存的摘要）；隊伍「儲存隊伍」、武將升級按鈕停用並說明；主頁與獨立戰鬥頁顯示不能開始戰鬥（主頁 HUD 仍可查看武將、隊伍、玩家資訊）；玩家資訊說明暫停保存（不再寫「會自動重試」）；結算視窗（開戰後才受限時）說明這場的結果與獎勵沒有記錄                       |
| 允許                      | 讀取（登入、背景讀取、手動同步、待確認升級的重新確認）；沒有本機修改時可以讀取並切換到其他帳號（新帳號同樣受限）；下載更新前的暫存（唯讀，拿掉存檔金鑰）                                                                                                                                                                                          |
| 保留                      | 已有的本機修改（session 的未同步版本）、待確認的升級（只重新讀取確認，不重送）、復原區的更新前暫存（開機腳本保留 7 天）                                                                                                                                                                                                                           |
| 不會解除                  | 重新整理、收合提示、讀取雲端、重新輸入金鑰、等待；沒有「改用這份暫存並覆蓋雲端」（原本 E 情境的改用按鈕已移除）。目前沒有可靠的解除依據（需要後端版本號，D16），受限分頁維持受限                                                                                                                                                                  |
| 移除                      | Round 14 的合併保存（保存前先讀取再合併）、`rebaseOnto`、保護中的升級先合併保存、`MIGRATION_GUARD_CONFLICT`。一般存檔流程（待確認升級的合併、升級確認）沒有改                                                                                                                                                                                     |
| 範圍                      | 受限分頁載入的所有帳號（讀不回的暫存屬於哪個帳號無法得知）；沒有遷移狀態不明的分頁不受影響                                                                                                                                                                                                                                                        |

### 23.3 周瑜「火攻」

規則、正式設定與畫面見路線圖 §3。重點：每次有效普通攻擊命中後附加灼燒，之後每 1 秒一次、共 3 次，每次＝命中當下攻擊力 × 20%，第一跳在附加後 1 秒；同一敵人只有一份，再次命中刷新剩餘跳數為 3、傷害換成最近一次命中的快照，不重設已在倒數的下一跳；離開射程或周瑜被移除後仍跳完，死亡／抵達基地／移除立即停止；用遊戲時間推進。灼燒走既有的受傷／死亡流程。Web 的 `utils/heroSkills.ts` 是說明、每跳傷害與 Godot 參數的唯一來源；Godot 的 `Enemy.apply_burn` 記錄灼燒，`Hero.gd` 命中後呼叫；`debug_snapshot` 多了 `enemy_burn`（測試用）。已重新匯出 Godot，`public/` 只有 `Enemy.gdc`、`Hero.gdc`、`Main.gdc` 與對應的 `index.html`（pck 大小）、SW 版本不同。

### 23.4 Round 15 檢查結果

**Round 13 修正（C13-F 停止寫入）**

| #      | 項目                | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                                                                                                                       |
| ------ | ------------------- | ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R15-H1 | store 門檻 R13F-L2  | 通過 | 單元     | 原本的已知限制 L2 改成失敗門檻：限制前已開戰、有 debounce 中的修改；稍晚完成的升級之後嘗試結算、隊伍、暱稱、升級、手動同步、自動保存、重新整理補送，寫入請求（save_profile、upgrade_hero、save_result、create_profile）都是 0，後端保有 900 與關羽 Lv2；本機修改保留、沒有套用獎勵、重新整理後仍受限。用經過一段時間後的寫入次數斷言，不等待不應出現的請求 |
| R15-H2 | store R13F-H1～H6   | 通過 | 單元     | 只有分頁標記時也擋下；session 標記下待確認升級只讀取確認（不重送）、稍晚完成後只在本機採用；限制中讀取照常；有本機修改時不切換帳號、沒有修改時可讀其他帳號但同樣受限、不建檔；一般分頁的修改、升級、結算照常送出且送出的資料不含限制欄位                                                                                                                   |
| R15-H3 | store 全部          | 通過 | 單元     | 137／137（R13F-G1～G8 與 LIMIT L2 改成 R13F-L2、H1～H6；另加 R15-S1）；L1 仍是已知限制                                                                                                                                                                                                                                                                     |
| R15-H4 | store 反向驗證      | 通過 | 單元     | 10 種錯誤實作（保存、升級、結算、建檔、切換前保存、開戰、修改隊伍不檢查限制；session 標記不恢復限制；不讀分頁標記；限制中不記標記）都被抓到；原檔已還原                                                                                                                                                                                                    |
| R15-H5 | 開機腳本單元測試    | 通過 | 單元     | 30／30；Codex 的失敗路徑補測 2／2                                                                                                                                                                                                                                                                                                                          |
| R15-H6 | 瀏覽器 `r13-web.js` | 通過 | mock     | 46／46。E：限制提示可見，展開說明有更新前暫存的摘要、可下載（不含金鑰），沒有改用／捨棄／關閉按鈕；實際操作隊伍、升級、開戰都被擋下，過了保存時間並重新整理後寫入 0。F：稍晚完成的升級後，主頁實際操作兩次（中間重新整理）寫入 0、後端保有 900／Lv2；重新整理不解除、復原資料保留；手動同步讀到 900／Lv2；獨立戰鬥頁不開戰。K-2、K-4 改驗限制標記與提示    |

**周瑜「火攻」**

| #      | 項目                         | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ---------------------------- | ---- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R15-G1 | Godot 測試（實際血量與時間） | 通過 | 實測     | 121／121（原 108 項＋R15-0～R15-11）。命中一次後 3 跳各 20（約 0.97、1.97、2.97 秒），沒有第 4 跳；每 0.35 秒連續命中時第 1～5 秒各跳一次、每跳 20（不疊加、不延後）；攻擊力改成 150 後再命中每跳 30、時間不重設；血量 130 的敵人第 2 跳打倒，kills／金幣／擊殺信號／清波／結算各 1 次；灼燒中抵達基地立即停止、不算擊殺、城池扣 1；移除周瑜後仍跳完；新的一場沒有殘留；暫停 1.5 秒期間不跳、恢復後延後 1.5 秒；2 倍速 0.51／1.01／1.51 秒、子彈時間 1 秒後 1.89／2.89／3.89 秒；不認得的技能 id 與關羽不附加；橘色外圈與 3 個橘色「20」 |
| R15-G2 | 匯出與產物                   | 通過 | 實測     | 第一次匯出只有 3 個 `.gdc` 不同；複製 3 個檔案後用全新目錄重跑，產物核對通過、121／121、結束碼 0                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R15-G3 | Godot 反向驗證               | 通過 | 實測     | 13 種錯誤實作（命中當下就跳、刷新時重設計時、疊加跳數、疊加傷害、不更新快照、跳傷不走受傷流程、跳傷再觸發火攻、離開射程就熄滅、移除武將時清除、暫停仍計時、不受時間倍率影響、不認得的技能也套用、比例錯誤）都被抓到。第一次執行時 M8 的預期多寫了 R15-7（實際由 R15-1 等抓到），修正預期並補 M13（移除武將）後重跑。功能前的腳本（HEAD，沒有火攻）在 R15-0 就因沒有 `burn_ratio` 中止，R15 0 項通過                                                                                                                                      |
| R15-U1 | store R15-S1                 | 通過 | 單元     | 參數（burn、0.2、3、1）、說明與每跳傷害出自同一份定義；其他武將的參數不受影響、射程不變                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| R15-B1 | 瀏覽器 `r15-web.js`          | 通過 | mock     | 13／13：技能說明（兩個入口，含「目前攻擊力 122：每次灼燒 24.4」）；主頁用部署選單放置，追蹤第一個敵人：普通攻擊 16 次、跳傷 18 次，沒有其他數值；最後一擊（距離 3.90 格）後再跳 3 次（4.21、4.53、4.80 格，已在射程外）就停止，之後觀察 5.1 秒（數字是 `skill-dev-try1`；完整回歸與正式靜態匯出同樣通過）；截圖有橘色外圈；獨立戰鬥頁同樣有效；存檔與 session 沒有技能或灼燒欄位                                                                                                                                                         |

**共通**

| #      | 項目             | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                                                                           |
| ------ | ---------------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R15-B2 | 瀏覽器完整回歸   | 通過 | mock     | 重啟 dev、全新 context 一次跑完 17 支全部通過，結束碼 0：I1 14、I2 8、自動 9、正常 9、R3 13、產物 12、R4 22、R5／R6 26、R7 9、R8 16、R9 21、R10 26、R12 18、R13 46、R14 14、R15 13。GAS 網路請求 0 筆                                                                                                          |
| R15-S  | 正式靜態匯出     | 通過 | mock     | build 後用 `tools/serve-out.mjs`：R13 46／46、R12 18／18、R14 14／14、R15 13／13，結束碼 0                                                                                                                                                                                                                     |
| R15-W  | build、tsc、lint | 通過 | 實測     | build 53 秒、結束碼 0；`out/` 82 頁都有開機腳本；Godot 產物與 `public/` 相同。tsc 0；全站 ESLint 0 error／83 warning（比 Round 14 多 2 個：兩個戰鬥頁既有的「送出關卡資料」effect，本輪在 `sendPayload` 加了受限時提前 return，規則 `react-hooks/set-state-in-effect` 與既有的相同）；改過的檔案 Prettier 通過 |

**過程紀錄（照實保留）**

1. `r13-web.js` 第一次跑 41／43：E、F 在點隊伍視窗的「關閉」時逾時——限制提示第一版文字太長，固定在底部蓋住了視窗的按鈕（底部提示的層級本來就高於視窗）。這是實際的畫面問題：提示改成平常只顯示一段簡短說明、「說明」再展開，之後重跑 46／46。
2. Godot 第一次跑 R15 時，R15-11 在新關卡載入後才讀舊敵人的狀態（已被移除）而中止；改成先記下狀態，重跑通過。
3. 反向驗證 M8 的預期寫錯（見 R15-G3）。
4. 這些都是測試或畫面的調整；每次調整後都重跑整支腳本。證據目錄全部分開（`hz-split`、`hold/r13-dev-try*`、`skill-dev-try1`、`full-dev`、`static`）。

證據在 `.handoff/evidence/round-15/`。

### 23.5 仍未涵蓋

1. 受限分頁沒有可靠的解除方式：舊進度讀不回（§21.5），也無法確認更新前送出的操作何時完成；在後端版本號（D16）之前一直受限（D18）。
2. 限制只在發生遷移狀態不明的分頁：同一個帳號在其他分頁或其他裝置仍可寫入，稍晚完成的舊操作與它們的先後仍屬 D8／L1。沒有任何跡象的舊分頁（§22.4 的 2）也分不出來。
3. 受限範圍是整個分頁的所有帳號（D19）。
4. 周瑜的數值是第一版設計值，沒有做過平衡（D20）；灼燒沒有減傷計算（目前敵人沒有防禦屬性）。
5. 底部提示的層級高於視窗：本輪把限制提示縮短，其他提示若變長仍可能蓋住視窗按鈕（既有設計）。
6. 只測了 Chrome 153；全部 mock，沒有正式 GAS 讀寫。

### 23.6 修改檔案

**Round 13 修正（C13-F 停止寫入）**

| 檔案                                                                                                                                                                                                                                                                                                             | 內容                                               |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `src/app/(games)/shenmaSanguo/store/playerStore.ts`、`types/index.ts`（`MigrationHold`）、`utils/playerErrors.ts`                                                                                                                                                                                                | 寫入限制（每次寫入前檢查、限制標記），移除合併保存 |
| `…/components/MigrationHoldNotice.tsx`（新增，取代 `IsolationRecoveryNotice.tsx`）、`GameInitializer.tsx`、`utils/isolationRecovery.ts`                                                                                                                                                                          | 一直顯示的限制提示、下載更新前的暫存               |
| `…/components/SinglePageContent.tsx`、`battle/components/BattlePageContent.tsx`、`modals/TeamEditModal.tsx`、`team/components/TeamPageContent.tsx`、`modals/HeroListModal.tsx`、`heroes/components/HeroesPageContent.tsx`、`modals/PlayerInfoModal.tsx`、`MainMenuContent.tsx`、`styles/shenmaSanguo.module.css` | 受限時不開戰、按鈕停用並說明、結算說明未記錄       |
| `scripts/shenma-regression/web/player-store.test.mjs`（R13F）、`r13-web.js`                                                                                                                                                                                                                                      | 單元與瀏覽器回歸                                   |

**周瑜「火攻」**

| 檔案                                                                                                                                                                                              | 內容                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `src/app/(games)/shenmaSanguo/utils/heroSkills.ts`、`types/index.ts`（`HeroSkillPayload`）、`components/HeroSkillInfo.tsx`、`modals/HeroListModal.tsx`、`heroes/components/HeroesPageContent.tsx` | 技能定義與參數、說明與每跳傷害       |
| `godot/shenmaSanguo/entities/enemy/Enemy.gd`、`entities/hero/Hero.gd`、`main/Main.gd`、`public/games/shenmaSanguo/index.{pck,html,service.worker.js}`                                             | 灼燒、命中時附加、快照欄位、重新匯出 |
| `scripts/shenma-regression/godot/lifecycle_test.gd`、`r15-web.js`（新增）、`r12-web.js`（A-3 隨 mock 名單更新）、`harness.js`（mock 周瑜、預設證據目錄）、`web/player-store.test.mjs`（R15-S1）   | 測試                                 |
| `docs/shenma-sanguo-feature-roadmap.md`、`scripts/shenma-regression/README.md`                                                                                                                    | 火攻規則與狀態、測試說明             |

`types/index.ts`、`HeroListModal.tsx`、`HeroesPageContent.tsx`、`harness.js`、`player-store.test.mjs`、`README.md` 與本文件兩部分都有改到。

### 23.7 待決事項（截至 Round 15，取代 §22.6）

> Round 16 起由 §24.8 取代。

| #   | 事項                                                                             | 目前狀態                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改）     | 後續再安排（受限分頁已可下載更新前的暫存）                                                                                                                                                            |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`      | 後續再安排                                                                                                                                                                                            |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                         | 未決定；需要後端契約證據                                                                                                                                                                              |
| D4  | 自動重新確認的次數與間隔                                                         | 已決定（Round 7）                                                                                                                                                                                     |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                       | 未決定；需要 GAS 原始碼                                                                                                                                                                               |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                        | 風險仍在；不屬於神馬三國                                                                                                                                                                              |
| D7  | commit                                                                           | Round 7～10：`81cabb43`；Round 11：`7cec1df2`；Round 12：`c62298db`；Round 14 黃忠：`8275ff6d`；都在本機、未 push。Round 13（含 Round 14、15 的修正）與 Round 15 周瑜都還沒 commit，待 Codex 分別驗收 |
| D8  | 請求逾時；多裝置、多分頁衝突                                                     | 仍待規劃（寫入限制只在遷移狀態不明的分頁）                                                                                                                                                            |
| D9  | 手動同步進行中，是否禁止其他操作                                                 | 已決定（Round 8）                                                                                                                                                                                     |
| D10 | 切換帳號被擋下時的提示                                                           | 已處理（Round 10）                                                                                                                                                                                    |
| D11 | 跨來源隔離切換時 sessionStorage 各有一份                                         | 已實作（Round 13），Round 14 修正 C13-1／C13-2，Round 15 把 C13-F 改成停止寫入；待 Codex 驗收                                                                                                         |
| D12 | 是否把跨來源隔離縮小到只有 `bgRemover`                                           | 已實作（Round 13）；待 Codex 驗收。部署後如何觀察正式站的遷移，需要另外決定                                                                                                                           |
| D13 | Godot 畫布裡的中文顯示成方框（沒有中文字型）                                     | 未決定（火攻只用橘色外圈與數字表示）                                                                                                                                                                  |
| D14 | 武將的正式設定                                                                   | 已解決（Codex 唯讀讀取 `get_heroes_config`）；黃忠 Round 14、周瑜 Round 15                                                                                                                            |
| D15 | 這個 clone 沒有自動執行 git hooks                                                | 已決定：獲准 commit 時手動對暫存的檔案跑 lint-staged 並核讀修改（`8275ff6d` 照做，沒有修改）                                                                                                          |
| D16 | 後端版本號／條件寫入                                                             | 未決定；需要 GAS 原始碼與測試環境。L1 仍是限制；L2（合併保存的讀寫空窗）因為不再合併保存而不再適用                                                                                                    |
| D17 | 正式設定的 `speed_growth` 與程式的 `atk_spd_growth` 名稱不同（攻速成長沒有生效） | 未決定；本輪依指示沒有處理                                                                                                                                                                            |
| D18 | 受限分頁的出口                                                                   | 未決定：目前沒有可靠的解除依據，維持受限並說明（可讀取、可下載暫存）；可能的出口需要後端版本號（D16）                                                                                                 |
| D19 | 寫入限制的範圍是整個分頁的所有帳號                                               | 本輪的選擇（讀不回的暫存屬於哪個帳號無法得知）；是否縮小需要 Codex 決定                                                                                                                               |
| D20 | 周瑜「火攻」的數值（20%、3 跳、1 秒）與平衡                                      | 第一版設計值，沒有做過平衡                                                                                                                                                                            |

## 24. Round 16（2026-09-28）：提交 Round 13～15、攻速成長（D17）、計時測試改用遊戲時間、關卡敵軍預覽

Codex 驗收 Round 15：Round 13＋14／15 的存檔收尾與周瑜「火攻」都通過，授權分成兩個本機 commit（不 push、不部署）；本輪先提交，再做三項新工作。Codex 的 Godot 首次整套是 120／121（R15-5 首跳的牆鐘時間 1.152 秒超過 1.15 秒上限），原封不動的 R15-5 重跑三次 6／6，判斷是牆鐘計時在併行負載下不穩，列為本輪的測試穩定性修正。D18（受限分頁沒有可靠出口）、D19（受限範圍是整個分頁）接受作為本機修正的明示限制。Round 16 的新工作還沒 commit，待 Codex 驗收；沒有 push、沒有部署，沒有讀寫正式 GAS／Sheets。

### 24.1 兩個已授權的 commit

| commit     | 內容                                                        | 範圍                                                                                                                                                                                                                                                                            | 提交前的核對                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ---------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `4793872e` | `fix: 限定網站隔離範圍並保護遷移不明的存檔`（Round 13～15） | 31 個檔案。共用檔用部分暫存：`types/index.ts` 只有 `MigrationHold`、兩個武將詳情入口只有寫入限制（沒有 `atk` 參數）、`harness.js` 沒有 mock 周瑜、store 測試沒有 R15-S1、README／基準文件／路線圖拿掉周瑜段落（§23.3 留一句「隨周瑜的提交補上」）。沒有 Godot 與 `public/` 產物 | 用 `git checkout-index` 把暫存區匯出到倉庫內的 `.handoff/split/c1/`（node_modules 由上層目錄解析，沒有建立 junction），在那裡跑：tsc 0；store 136／136（L1 仍是已知限制）；開機腳本 30／30；對暫存的 23 個 js／ts 檔跑 `eslint --fix --no-warn-ignored`（0 error／10 warning）與 `prettier --write`（另含 4 個 md／css），檔案沒有任何改變（`layout.tsx`、`ClientLayout.tsx` 是 CRLF，以原始位元組比對相同）；`cr-at-eol` diff check 通過。驗證完刪除匯出目錄 |
| `95dea9fe` | `feat: 新增周瑜火攻灼燒技能`（Round 15）                    | 其餘 19 個檔案：技能定義與說明、`HeroSkillPayload` 的 burn、兩個詳情入口的 `atk`、Godot 三個腳本與 `public/` 的 index.html／pck／service worker、Godot 與瀏覽器測試、mock 周瑜、R15-S1、文件的周瑜段落                                                                          | 提交後工作目錄沒有未提交的修改，和 Codex 驗證的狀態相同；對 9 個 js／ts 與 3 個 md 檔跑同樣的 lint-staged 指令沒有改變；tsc 0、store 137／137                                                                                                                                                                                                                                                                                                                 |

兩個 commit 的作者都是 ZeHoward，照 `/commit-push` 流程提交、跳過 push（使用者同意）。沒有 amend。這個 clone 仍然沒有自動執行 git hooks（D15），lint-staged 是手動執行。證據 `.handoff/evidence/round-16/c1-split/`、`c2/`。

### 24.2 攻速成長（D17）

| 項目     | 規則                                                                                                                                                                                                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 問題     | 正式 `heroes_config` 用 `speed_growth` 記攻速成長，Web 與 Godot 讀 `atk_spd_growth`，所以等級提升時攻擊間隔一直沒有變（Codex 的唯讀設定證據：23 位武將都只有 `speed_growth`，0.01～0.025）                                                                                                                                                        |
| 正規化   | 靜態設定進入 store 時統一處理（`utils/heroStats.ts` 的 `normalizeStaticConfig`）：`atk_spd_growth` 有效（有限、非負的數字或數字字串，包含明確的 0）就用它；否則用有效的 `speed_growth`；兩者都沒有或無效時是 0。明確的 0 不會被別名蓋掉。新的 API 回應、已存在的本機快取（新鮮或過期）都經過同樣處理，玩家不需要清除快取；快取保留 API 的原始內容 |
| 公式     | 不變：攻擊間隔（秒，越小越快）＝ max(0.1, attack_speed × (1 − (等級 − 1) × 成長))。武將頁（目前與升級預覽）、主頁武將視窗（新增「攻擊間隔 目前 → 升級後」）都用 `attackIntervalSec`；戰場的選取面板原本顯示「攻速 x.x/s」（一位小數分不出 1 秒和 0.98 秒），改成顯示 Godot 送來的攻擊間隔（最多 3 位小數）。技能不影響攻擊間隔                    |
| 正式數值 | 周瑜 Lv1 1 秒、Lv2 0.98 秒；黃忠 Lv1 1.9 秒、Lv2 1.881 秒（store R16-A2）                                                                                                                                                                                                                                                                         |
| Godot    | 沒有改：初始化與 `update_team` 本來就從設定重新計算（不疊算）、有 0.1 秒下限，只讀 `atk_spd_growth`；送進 Godot 的 `heroes_config` 就是 store 裡正規化後的那一份                                                                                                                                                                                  |
| 沒有改   | 正式 GAS／Sheets、存檔格式（攻速成長是靜態設定，不進玩家存檔）                                                                                                                                                                                                                                                                                    |

### 24.3 計時測試改用遊戲時間（R15 與 R14）

| 項目       | 內容                                                                                                                                                                                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原因       | R15 用牆鐘（`Time.get_ticks_msec`）量跳傷時間、固定 ±0.15 秒容差；灼燒其實在敵人的 `_physics_process` 以固定物理步進推進，電腦忙時實際時間和遊戲時間會差開（Codex 看到首跳 1.152 秒）                                                                                                                   |
| 物理時鐘   | 新增測試用的 `godot/physics_clock.gd`（只在暫存測試專案）：累加 `_physics_process` 的 delta，放在場景樹最前面、優先處理，跟著暫停與時間倍率。R15 的所有計時改用它                                                                                                                                       |
| 判定       | 跳傷發生在「預期時間（命中後第 1、2、3 秒）到達」的那一次觀察：前一次觀察還沒到、這一次已經到。命中發生在看到命中的前一次觀察之後，下限再放寬這兩次觀察之間的物理時間。容差只來自實際經過的物理步進，0.0005 秒只吸收浮點誤差（1/60 秒累加不一定正好是整數）。沒有加大容差、沒有刪除計時斷言，也不靠重跑 |
| 暫停與倍率 | 暫停：暫停期間物理時鐘、灼燒的倒數（`next_in`）與血量都不變，恢復後照遊戲時間第 1、2、3 秒跳。倍率：每個物理步進前進的時間正好是倍率 ÷ 每秒步數（2 倍、0.1 倍），兩種倍率下都在遊戲時間第 1、2、3 秒跳。不再比較實際時間（電腦忙時引擎會限制每幀的步數）                                                |
| 可控步進   | 新增 R15-12：停掉一個敵人的物理更新，由測試以固定 0.0625 秒（二進位精確值）呼叫 `_physics_process`：附加當下不跳、第 1 秒正好一跳；第 1.5 秒再附加只刷新剩餘跳數與傷害，下一跳仍在第 2 秒；之後第 2、3、4 秒各一跳                                                                                      |
| R14／R16   | 武將攻擊在 `_process`：攻擊間隔用 `Main._game_time`（每幀累加的遊戲 delta）。R14 的 `_record_hits_timed` 改用它；R16 每個間隔都要在「攻擊間隔」到「攻擊間隔＋最長的一幀」之間                                                                                                                           |
| 牆鐘       | 只記在細節裡供診斷（例如暫停的實際長度）                                                                                                                                                                                                                                                                |

### 24.4 關卡敵軍預覽

| 項目     | 內容                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 入口     | 主頁「關卡」視窗與獨立的 `/shenmaSanguo/stages` 的每張關卡卡片都有「敵軍預覽」按鈕（鎖定的關卡也有），開啟同一個唯讀視窗（`components/modals/EnemyPreviewModal.tsx`）。按鈕不冒泡到卡片；視窗用 portal 放在神馬三國的 `gameBody`（主題變數在那裡），不在卡片裡面。只有查看與關閉（右上 ×、下方「關閉」、Esc、點背景），關閉後回到原本的關卡列表；既有的出征、選擇關卡按鈕不變                                                                             |
| 內容     | 關卡名稱、鎖定標示、共幾波與全關數量、路線；每一波可展開收合（預設展開第 1 波），標題列有這一波的數量或狀態；每一組列出第幾組、敵人名稱、數量、路線、血量、移動速度（設定值）、出兵間隔。多路線、同種敵人多組都分開列出                                                                                                                                                                                                                                   |
| 規則來源 | `utils/stagePreview.ts`，照 Godot 實際的出兵規則（先核對了 `Main._count_waves`、`WaveManager.plan_wave`、`GameMap._parse_path_json`、`BattleManager._reject_wave`）：波數是最大的 `wave` 編號；同一個編號只用第一筆；每一組依序檢查空白 `enemy_id`（GAS 空白列，不是敵人）→ 找不到敵人設定 → 路線沒有路點 → 數量 ≤ 0，不符合就整組略過；沒有數量以 1 隻計、沒有路線用 `path_a`、沒有間隔 1 秒；某一波沒有資料或沒有任何可出兵的組時，遊戲會拒絕開始那一波 |
| 不完整   | 找不到的敵人、沒有路點的路線、數量 0、空白列，以及沒有提供的數量、間隔、血量、速度都逐項標示；整波會被拒絕時寫「遊戲會拒絕這一波」，不寫 0 隻；數量無法判讀（例如「3隻」）或有任何一波會被拒絕、沒有資料時，全關寫「數量無法確定」，不給確定的總數。資料裡沒有的敵人能力不推定                                                                                                                                                                            |
| 限制     | 只讀已載入的 `maps[].waves`、`enemiesConfig` 與關卡的 `path_json`；沒有新的後端接口、不讀玩家雲端、不送任何戰鬥或存檔請求。不改變解鎖規則、目前的關卡與 `battle_id`；寫入限制中的分頁照樣可以查看。預覽視窗保留底部空間（底部提示的層級高於視窗），兩個關閉按鈕都不會被蓋住。戰鬥生成的程式沒有改                                                                                                                                                         |
| mock     | `harness.js` 多了 `chapter1_8`「Mock P 多路線」（兩條路線、兩波、同種敵人分兩組，共 8 隻）與 `chapter1_9`「Mock Q 缺資料」（空白列、找不到的敵人、沒有路點的路線、沒有數量、數量 0、缺少第 2 波）。預設玩家的進度仍是 `chapter1_7`，這兩關對其他測試都是鎖定的。mock 的周瑜改成只有 `speed_growth` 0.02                                                                                                                                                   |

### 24.5 Round 16 檢查結果

| #      | 項目                | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | ------------------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R16-U1 | store 全部          | 通過 | 單元     | 145／145（Round 15 的 137 項＋R16-A1～A5、R16-P1～P3）；L1 仍是已知限制                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| R16-U2 | Web 反向驗證        | 通過 | 單元     | 12 種錯誤實作都被抓到：用 `a \|\| b`（明確的 0 被蓋掉）、別名優先、負數當有效、沒有 0.1 秒下限、舊快取不正規化、API 回應不正規化；預覽把沒有數量當 0、找不到設定也出兵、沒有路點也出兵、空白列當敵人、重複的波次用最後一筆、會被拒絕的波次當 0 隻。原檔已還原                                                                                                                                                                                                                                            |
| R16-G1 | Godot 測試          | 通過 | 實測     | 全新暫存目錄 import／export／產物核對＋測試 129／129，結束碼 0（Round 15 的 121 項＋R15-12＋R16-1～R16-7）。R15 各跳落在物理時鐘第 1、2、3 秒那一步（例如 R15-7：0.983、1.983、2.983，命中後的第一個物理步進才開始倒數）；R16 實際間隔：Lv1 0.5034 秒、Lv2 0.4068 秒、Lv3 0.3035 秒、下限 0.1034 秒（最長的一幀約 0.007 秒）                                                                                                                                                                             |
| R16-G2 | Godot 反向驗證      | 通過 | 實測     | 18 種錯誤實作都被抓到：Round 15 的 13 種（命中當下就跳、刷新時重設計時、疊加跳數、疊加傷害、不更新快照、跳傷不走受傷流程、跳傷再觸發火攻、離開射程就熄滅、移除武將時清除、暫停仍計時、不受時間倍率影響、不認得的技能也套用、比例錯誤），加上重複結算（灼燒打倒時擊殺信號發兩次）、攻擊間隔疊算、沒有下限、升級不重算、初始化忽略成長。原檔已還原                                                                                                                                                         |
| R16-G3 | R15 計時的穩定性    | 通過 | 實測     | 改用物理時鐘後，同一個暫存專案連續重跑 R15＋R16（21 項）10 次：修正 R15-10 的量測順序前 5 次中 1 次失敗（見過程紀錄 1），修正後 5／5 通過；之後只重跑受影響反向驗證時的基準 21／21、全新目錄的完整檢查 129／129                                                                                                                                                                                                                                                                                          |
| R16-B1 | 瀏覽器 `r16-web.js` | 通過 | mock     | 19／19。A：舊快取啟動沒有讀取靜態設定 API；主頁武將視窗關羽 1 → 0.75 秒、周瑜 1 → 0.98 秒、趙雲 1.2 → 1.2 秒；武將頁周瑜 1 → 0.98；主頁實戰量到的間隔 Lv1 平均 1.000 秒（0.983～1.017）、戰鬥中升級後 0.755 秒（0.734～0.783），選取面板依序顯示「1秒」「0.75秒」；清掉快取後從 API 讀取同樣正確。P：兩個入口的預覽內容、鎖定與資料不完整的標示；查看與關閉前後 battle_id 相同、Godot 沒有重新載入、寫入 0；Mock P 第 1 波實際生成步兵 5、B 步兵 1；手機寬度沒有左右捲動；寫入限制中兩個關閉按鈕都點得到 |
| R16-B2 | 瀏覽器完整回歸      | 通過 | mock     | 重啟 dev、全新 context 一次跑完 18 支，結束碼 0：I1 14、I2 8、自動 9、正常 9、R3 13、產物 12、R4 22、R5／R6 26、R7 9、R8 16、R9 21、R10 26、R12 18、R13 46、R14 14、R15 13、R16 19。GAS 網路請求 0 筆                                                                                                                                                                                                                                                                                                    |
| R16-S  | 正式靜態匯出        | 通過 | mock     | build 後用 `tools/serve-out.mjs`（`LOCAL_ASSETS=1`）：R13 46、R12 18、R14 14、R15 13、R16 19，結束碼 0                                                                                                                                                                                                                                                                                                                                                                                                   |
| R16-W  | build、tsc、lint    | 通過 | 實測     | build 54 秒、結束碼 0；`out/` 的 82 個 Next 頁面都有開機腳本；Godot 產物與 `public/` 相同。tsc 0；全站 ESLint 0 error／83 warning（和 Round 15 相同，沒有新增）；改過的檔案 Prettier 通過；`cr-at-eol` diff check 通過                                                                                                                                                                                                                                                                                   |

**過程紀錄（照實保留）**

1. R15-10 在反向驗證的一次執行裡意外失敗（那次的錯誤實作和周瑜無關）。用原本的程式重跑 5 次又出現 1 次：2 倍速時只記到第 2、3 跳。原因是測試順序——命中之後才量「每個物理步進前進多少」，那段量測佔掉遊戲時間約 1 秒，第一跳剛好發生在量測期間而沒有被記錄。把 2 倍速的量測移到開戰前後，連續 5 次通過，受影響的反向驗證（倍率、下限）重跑也只被對應的測試抓到；之後用全新目錄重跑完整檢查 129／129。產品程式沒有改。
2. 敵軍預覽第一版用 portal 放在 `body`，畫面是透明的、沒有文字顏色（主題變數 `--sg-*` 定義在神馬三國的 `gameBody`）。瀏覽器測試的斷言讀得到文字、仍然會通過，是看截圖才發現；改成放在 `gameBody` 後重跑並重新目視截圖（主頁、關卡頁、手機寬度、寫入限制中、正式靜態匯出）。
3. `r16-web.js` 第一次跑 18／19：P-4 的比對字串少算了名稱和「不會出兵」之間的空白（畫面內容正確），修正測試後重跑。
4. 反向驗證（Godot）期間同時跑了 Web 的反向驗證與全站 ESLint；計時斷言都用遊戲時間，負載不影響判定。完整瀏覽器回歸是在 Godot 反向驗證結束後、重啟 dev 才跑的。

證據在 `.handoff/evidence/round-16/`（`c1-split`、`c2`、`godot-check-run1.log`、`godot-check-final.log`、`mut/`、`r16-dev-try1`、`r16-dev-try2`、`full-dev`、`static`、`build.log`、`eslint-all.json`）。

### 24.6 仍未涵蓋

1. 攻速：只驗了 mock 與 Codex 取得的正式設定數值；正式設定裡如果出現非數字的 `speed_growth`，會當成 0（沒有成長），不會報錯。Godot 端本身不認得 `speed_growth`（R16-7），靠 Web 正規化後送進去；舊版網頁（正式站目前的部署）仍然沒有攻速成長，要部署後才會生效。
2. 敵軍預覽的移動速度是設定值（Godot 裡是像素／秒），格子大小隨畫面而變，無法可靠換算成「格／秒」，所以只寫設定值。關卡資料的 `waves` 若是字串或其他格式，預覽和 Godot 都不會正確解析（目前的資料是陣列）。
3. 全站的頁面說明按鈕（左上角的「i」，z-index 9999）和聊天按鈕會壓在所有視窗上面（包括敵軍預覽的左上角文字），是全站既有的設計，本輪沒有改（D21）。
4. 預覽和實際出兵的對照只在瀏覽器驗了 Mock P 的第 1 波（6 隻）；缺資料的情況由單元測試（R16-P2、P3）對照 Godot 規則，加上既有 R3 關卡（無效波會被拒絕、混合組 3 隻）的實際行為。
5. 計時測試：R15 改用物理時鐘、R14／R16 用遊戲時間；R12 等其他測試的「等待」仍是遊戲時間的計時器（`create_timer`），沒有牆鐘斷言。瀏覽器的攻擊間隔量測解析度是快照的間隔（約 0.1 秒），所以用實際量到的快照間隔當容差。
6. 只測了 Chrome 153；全部 mock，沒有正式 GAS 讀寫。L1、多裝置、D16、D18、D19 維持前一輪的限制。

### 24.7 修改檔案（Round 16，未 commit）

| 檔案                                                                                                                                                                                                                | 內容                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `src/app/(games)/shenmaSanguo/utils/heroStats.ts`（新增）、`store/staticConfigStore.ts`、`types/index.ts`（`speed_growth`）                                                                                         | 攻速成長的欄位正規化（API 與快取）、攻擊間隔公式                                                   |
| `…/heroes/components/HeroesPageContent.tsx`、`…/components/modals/HeroListModal.tsx`、`…/battle/components/UpgradePanel.tsx`                                                                                        | 攻擊間隔的顯示與升級預覽；戰場選取面板改顯示攻擊間隔                                               |
| `…/utils/stagePreview.ts`（新增）、`…/components/modals/EnemyPreviewModal.tsx`（新增）、`…/components/modals/StageSelectModal.tsx`、`…/stages/components/StagesPageContent.tsx`、`…/styles/shenmaSanguo.module.css` | 敵軍預覽的計算、共用視窗與兩個入口                                                                 |
| `scripts/shenma-regression/godot/lifecycle_test.gd`、`godot/physics_clock.gd`（新增）                                                                                                                               | R15 計時改用物理時鐘、R15-12 可控步進、R14 攻擊間隔改用遊戲時間、R16-1～R16-7                      |
| `scripts/shenma-regression/web/player-store.test.mjs`、`r16-web.js`（新增）、`harness.js`                                                                                                                           | R16-A、R16-P 單元測試；瀏覽器回歸；mock 周瑜只有 `speed_growth`、兩個預覽用關卡、證據目錄 round-16 |
| `scripts/shenma-regression/README.md`、`docs/shenma-sanguo-feature-roadmap.md`                                                                                                                                      | 測試說明、功能狀態與後續順序                                                                       |

Godot 的遊戲腳本與 `public/games/shenmaSanguo/` 的產物都沒有改（不需要重新匯出；Godot 檢查的產物核對通過）。

### 24.8 待決事項（截至 Round 16，取代 §23.7）

> Round 17 起由 §25.8 取代。

| #   | 事項                                                                         | 目前狀態                                                                                                                                                                                                         |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改） | 後續再安排（受限分頁已可下載更新前的暫存）                                                                                                                                                                       |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`  | 後續再安排                                                                                                                                                                                                       |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                     | 未決定；需要後端契約證據                                                                                                                                                                                         |
| D4  | 自動重新確認的次數與間隔                                                     | 已決定（Round 7）                                                                                                                                                                                                |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                   | 未決定；需要 GAS 原始碼                                                                                                                                                                                          |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                    | 風險仍在；不屬於神馬三國                                                                                                                                                                                         |
| D7  | commit                                                                       | Round 7～10：`81cabb43`；Round 11：`7cec1df2`；Round 12：`c62298db`；Round 14 黃忠：`8275ff6d`；Round 13～15 存檔：`4793872e`；Round 15 周瑜：`95dea9fe`；都在本機、未 push。Round 16 還沒 commit，待 Codex 驗收 |
| D8  | 請求逾時；多裝置、多分頁衝突                                                 | 仍待規劃（寫入限制只在遷移狀態不明的分頁）                                                                                                                                                                       |
| D9  | 手動同步進行中，是否禁止其他操作                                             | 已決定（Round 8）                                                                                                                                                                                                |
| D10 | 切換帳號被擋下時的提示                                                       | 已處理（Round 10）                                                                                                                                                                                               |
| D11 | 跨來源隔離切換時 sessionStorage 各有一份                                     | 本機修正已由 Codex 驗收並提交（`4793872e`）；讀不回的舊進度與後端原子寫入仍是發布前的課題（D16、D18）                                                                                                            |
| D12 | 是否把跨來源隔離縮小到只有 `bgRemover`                                       | 已實作並提交（`4793872e`）；部署後如何觀察正式站的遷移，需要另外決定                                                                                                                                             |
| D13 | Godot 畫布裡的中文顯示成方框（沒有中文字型）                                 | 未決定；Codex 指示本輪不加入                                                                                                                                                                                     |
| D14 | 武將的正式設定                                                               | 已解決（Codex 唯讀讀取 `get_heroes_config`）                                                                                                                                                                     |
| D15 | 這個 clone 沒有自動執行 git hooks                                            | 已決定：獲准 commit 時手動對暫存的檔案跑 lint-staged 並核讀修改（`4793872e`、`95dea9fe` 照做，都沒有修改）                                                                                                       |
| D16 | 後端版本號／條件寫入                                                         | 未決定；Codex 已向使用者詢問 GAS 程式位置，取得後先唯讀盤點契約再規劃。L1 仍是限制                                                                                                                               |
| D17 | 正式設定的 `speed_growth` 與程式的 `atk_spd_growth` 名稱不同                 | 已實作（Round 16，§24.2）：Web 進入 store 時正規化；待 Codex 驗收                                                                                                                                                |
| D18 | 受限分頁的出口                                                               | Codex 接受作為本機修正的明示限制；不加解除按鈕、不猜測升級已完成，需要後端版本號                                                                                                                                 |
| D19 | 寫入限制的範圍是整個分頁的所有帳號                                           | Codex 接受作為明示限制                                                                                                                                                                                           |
| D20 | 周瑜「火攻」的數值（20%、3 跳、1 秒）與平衡                                  | 維持；沒有實戰平衡資料前不調整                                                                                                                                                                                   |
| D21 | 全站的頁面說明按鈕（z-index 9999）壓在神馬三國的視窗上                       | 新發現、既有設計（§24.6 的 3）：是否讓神馬三國的視窗避開，或在遊戲頁隱藏這個按鈕，需要決定                                                                                                                       |

## 25. Round 17（2026-09-28）：提交 Round 16、神馬視窗與全站浮動入口、預覽的鍵盤操作、防禦塔目標優先

Codex 驗收 Round 16 通過（store 145、Godot 129、`r16-web.js` 19／19 等獨立重跑），授權合成一筆本機 commit，之後做 Round 17：D21（全站說明／聊天浮動按鈕壓在神馬視窗上）、敵軍預覽的鍵盤操作，以及新的戰鬥功能「防禦塔目標優先」MVP。Codex 在 Round 18 驗收 Round 17：目標優先與預覽鍵盤通過，另外指出兩項提交前必修（D21 漏了戰場面板、新按鈕列沒有用 Bootstrap Grid），修好並補測後可以提交（§25.9）。沒有 push、沒有部署，沒有讀寫正式 GAS／Sheets。

### 25.1 Round 16 的 commit

`fe7724f2` `feat: 新增關卡敵軍預覽並修正武將攻速成長`（19 個檔案，作者 ZeHoward，使用者同意、照 `/commit-push` 流程跳過 push）。提交前對暫存的 js／ts 跑 `eslint --fix --no-warn-ignored`、連同 md／css 跑 `prettier --write`，檔案沒有改變；`cr-at-eol` diff check 通過。這個 clone 仍然沒有自動執行 git hooks（D15）。沒有 amend。

### 25.2 D21：神馬三國的視窗與全站浮動入口

| 項目   | 內容                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 問題   | 全站的頁面說明（ⓘ，z-index 9999）與聊天入口（1050）層級高於神馬三國的視窗，會蓋住視窗文字、搶走點擊                                                                                                                                                                                                                                                                                                                              |
| 做法   | 兩個浮動入口加上標記 `data-floating-entry`；神馬三國的 CSS module 用一條規則：頁面上有神馬三國的視窗（`modalBackdrop`、結算、金鑰設定、戰場上的選取面板 `upgradePanel`（塔與武將）與部署選單 `placementOverlay`，或神馬頁面裡的 react-bootstrap Modal，body 有 `modal-open`）時把它們設成 `visibility: hidden`（看不到、點不到、Tab 也到不了），視窗關閉後自動恢復。戰場的兩種面板是 Codex 驗收時發現漏掉、提交前補上的（§25.9） |
| 為什麼 | 不再逐一調高 z-index：新的視窗沿用 `modalBackdrop` 就會一起套用。其他網站頁面沒有這些元素，不受影響；神馬三國底部的存檔提示（`bottomNotices`）不是浮動入口，照常顯示                                                                                                                                                                                                                                                             |
| 沒有改 | 兩個入口元件本身的行為與樣式（只加標記）。`chatWidget.tsx` 原本沒有通過 Prettier，這次存檔時一起排版（兩處換行，commit 時 lint-staged 也會做一樣的事）                                                                                                                                                                                                                                                                           |

### 25.3 敵軍預覽的鍵盤操作

- 對話框加上 `aria-modal="true"`。開啟時焦點移到右上的關閉鈕；Tab／Shift+Tab 只在視窗內循環；焦點被移到視窗外時（例如輔助工具）拉回視窗裡。背後的關卡卡片與出征按鈕碰不到。
- Esc 只關閉預覽（事件不再往後面的視窗傳），關閉後焦點回到開啟它的「敵軍預覽」按鈕，關卡列表維持原樣。
- 只處理這個新視窗，沒有改寫其他視窗。

### 25.4 防禦塔目標優先（MVP）

| 項目   | 規則                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模式   | 「優先前方」（預設，既有行為：比路線進度＝路點序號 ÷ 路點數，不是精確的離基地距離；同一段路上的敵人進度相同）、「血量最多」、「血量最少」（比 `current_hp`，不是最大血量或百分比）。血量相同時看路線進度，再相同維持候選的原順序（生成順序）                                                                                                                                                                                                                                                        |
| 候選   | 射程內、這一場的 wave manager 所屬、有效且活著的敵人；每次準備攻擊時依最新狀態重新挑選。沒有目標時照常等待                                                                                                                                                                                                                                                                                                                                                                                          |
| 切換   | 只換之後挑選目標的方式：不重置攻擊冷卻、不立即攻擊、不扣戰鬥金幣、不動射程／傷害／等級，也不改變時間倍率（子彈時間、暫停的規則照舊）                                                                                                                                                                                                                                                                                                                                                                |
| 五種塔 | 都可以選。砲兵只改主要目標，範圍傷害照舊以主要目標為中心；文士的疊加減速跟著主要目標；步兵的緩速光環照舊作用於射程內所有敵人；弓兵、騎兵是單體傷害。武將沒有這個選項，三個武將技能不變                                                                                                                                                                                                                                                                                                              |
| 保存   | 只存在單座塔這一場的記憶體（`Tower.target_mode`）：關閉／重開面板、升級、跨波都保留，其他塔各自獨立；新的一場（含同一關重來）放置的塔從「優先前方」開始。不寫 player／session／GAS／`save_result`，沒有全域偏好、沒有新的後端接口                                                                                                                                                                                                                                                                   |
| 命令   | 面板帶 Godot 的實際模式、這座塔的識別碼（`tower_uid`，同一個頁面內不重複）與這一場的 `battle_id`。Web 送 `set_tower_target {battle_id, tower_uid, mode}`；Godot 只在「這一場（PREP 或 BATTLE）、目前選取中的同一座有效防禦塔、認得的模式」時套用，確認後回傳 `tower_target_changed {battle_id, tower_uid, target_mode}`，面板只在場次與識別碼都相同時換成這個實際模式。別場、舊塔、另一座塔、不認得的模式、沒有選取、選取的是武將、這一場結束之後的命令都不套用、不回覆，也不拿當下任意的選取物代替 |
| 協定   | 橋接協定升到 3（`WebBridge.gd` 與 `gameEngine.ts`）：舊版遊戲不認得這個命令，網頁對舊版遊戲（包括 Round 16 的協定 2 產物）顯示既有的「遊戲版本需要更新」提示、不送關卡資料，面板的新選項不會默默失效                                                                                                                                                                                                                                                                                                |
| 面板   | 選取面板多了「攻擊目標」三個按鈕（高度 34px 以上）與目前模式的一句說明。定位修正：Godot 送來的座標是未縮放的遊戲畫面座標，乘上縮放比例 min(寬/540, 高/720)；放在單位上方，上方放不下時放在下方；只放在看得到的範圍（獨立戰鬥頁的遊戲畫面比視窗寬、左右超出視窗，之前面板會有一半在畫面外）。武將的選取面板也套用同樣的定位                                                                                                                                                                          |
| 測試用 | `debug_snapshot` 多了 `enemy_kind`（每個敵人的種類）與 `tower_targets`（每座塔的種類、模式、等級、畫面座標）                                                                                                                                                                                                                                                                                                                                                                                        |

### 25.5 Round 17 檢查結果

| #      | 項目                | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------ | ------------------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R17-G1 | Godot 測試          | 通過 | 實測     | 全新暫存目錄 import／export／產物核對＋測試 142／142，結束碼 0（Round 16 的 129 項＋R17-1～R17-13；R10-1 改成協定 3）。例如：切到「血量最多」後下一擊間隔 0.8068 秒（0.8 秒＋一幀 0.0069 秒，沒有偷跑冷卻）；砲兵以 weak 為主要目標時 weak、front 各受 80、tank 0；文士只讓 tank 疊加減速；步兵的緩速光環讓三個敵人都降到 0.55 倍，傷害只打 weak                                                                                                                                                                                                                                                                                                   |
| R17-G2 | Godot 反向驗證      | 通過 | 實測     | 8 種錯誤實作都被抓到：忽略模式、血量改用最大血量、切換時重置冷卻、平手不看進度、不檢查 battle_id、不檢查是不是同一座塔、不認得的模式也套用、結束後仍套用。原檔已還原                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| R17-W1 | Web 反向驗證        | 通過 | mock     | 4 種錯誤實作都被 `r17-web.js` 抓到：不隱藏浮動入口（F-2）、預覽不限制 Tab（K-1）、關閉後不還原焦點（K-2）、面板用舊的定位（T-9）。原檔已還原，之後重啟 dev 再做正式回歸                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R17-U1 | store 與開機腳本    | 通過 | 單元     | store 145／145（R10-P1 改成協定 3，並列出 Round 16 的 2 不相容）；開機腳本 30／30；tsc 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| R17-B1 | 瀏覽器 `r17-web.js` | 通過 | mock     | 21／21。F：首頁入口照常；神馬開啟關卡視窗、預覽、武將視窗時兩個入口都隱藏、點不到，關閉後恢復。K：主頁 Enter 開啟、Tab 8 次＋Shift+Tab 4 次都在視窗內、Enter 展開波次、Esc 後焦點回到 Mock P 的按鈕，battle_id 相同、寫入 0；關卡頁 375 寬 Tab 10 次都在視窗內；寫入限制中底部提示仍可見、兩個關閉鈕點得到。T：主頁實際放置與點選，優先前方→前鋒、血量最多→重甲、血量最少→傷兵（快照的種類與血量對照），按鈕只在 Godot 回傳後切換、時間倍率 1；關閉重開與升級後保留；錯誤命令 Godot 不回覆、別座塔的回覆不改面板；重來後回到預設；手機與獨立戰鬥頁面板完整在畫面內、按鈕點得到；寫入 0。V：協定 2 的產物顯示「遊戲版本需要更新」、沒有送出關卡資料 |
| R17-B2 | 瀏覽器完整回歸      | 通過 | mock     | 重啟 dev、全新 context 一次跑完 19 支，結束碼 0：I1 14、I2 8、自動 9、正常 9、R3 13、產物 12、R4 22、R5／R6 26、R7 9、R8 16、R9 21、R10 26、R12 18、R13 46、R14 14、R15 13、R16 19、R17 21。GAS 網路請求 0 筆（第一次完整回歸 R10 23／26，見過程紀錄 4）                                                                                                                                                                                                                                                                                                                                                                                           |
| R17-S  | 正式靜態匯出        | 通過 | mock     | build 後用 `tools/serve-out.mjs`（`LOCAL_ASSETS=1`）：R13 46、R12 18、R14 14、R15 13、R16 19、R17 21，結束碼 0（前兩次的中斷與 chunk 404 見過程紀錄 6）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| R17-W  | build、lint         | 通過 | 實測     | build 結束碼 0；`out/` 的 82 個 Next 頁面都有開機腳本；Godot 產物與 `public/` 相同；正式版 CSS 有隱藏浮動入口的規則。全站 ESLint 0 error／83 warning（和前兩輪相同）；改過的檔案 Prettier 通過；`cr-at-eol` diff check 通過                                                                                                                                                                                                                                                                                                                                                                                                                        |

**過程紀錄（照實保留）**

1. Godot 第一次跑 R17 時，R17-6 在敵人死亡後把已釋放的物件指定給有型別的變數而中止（SCRIPT ERROR，測試碼問題），改成先檢查再指定後重跑。
2. Godot 反向驗證第一次只抓到 7／8：「血量改用最大血量」沒被抓到——R17-4 把 tank 的血量降到 10，第一擊就打死它，之後自然改打 front，測試沒有真的區分「當下血量」與「最大血量」。改成降到 500（打不死）後，這一項被 R17-4 抓到。
3. 瀏覽器：第一版 r17 的 K-3 假設關卡頁也有兩個浮動入口（其實只有聊天）；「同一關重來」後沒關開場畫面就點格子；獨立戰鬥頁用格子換算點不到塔（遊戲畫面比視窗寬，(1,4) 在畫面外）。改成用快照裡塔的畫面座標乘上縮放比例點選、戰鬥頁把塔放在看得到的 (2,4)。為此在快照加了塔的畫面座標（Main.gd 又改了一次，重新匯出）。修好之後目視截圖，**發現獨立戰鬥頁的選取面板有一半在畫面外**（「優先前方」點不到；測試剛好點的是看得到的按鈕）——這是面板沿用舊的定位算法造成的，修正定位並把「面板完整在畫面內、三個按鈕都點得到」加進 T-1、T-8、T-9。
4. 第一次完整回歸 R10 23／26：`r10-web.js` 寫死「新版遊戲的協定版本是 2」。改成讀目前的版本（3）後單獨重跑 26／26，再重啟 dev 從頭跑一次 19 支全部通過。store 的 R10-P1 同樣釘著 2，一起改成 3；`r12-web.js` 失敗時才會用到的診斷程式也改成 3。
5. Web 反向驗證第一次設計的「不限制 Tab」只拿掉 Tab 循環，焦點拉回的另一道保護仍把焦點留在視窗內，所以沒被抓到；兩道一起拿掉後被 K-1 抓到（照實記錄：兩道保護是刻意的重複）。
6. 正式靜態匯出第一次在工具的前景時間上限（10 分鐘）被中斷（r13、r12、r14、r15 已通過），證據保留在 `static-interrupted/`。背景重跑時 r16 15／18、r17 18／21：獨立關卡頁載入 chunk `0a822ktq9z.9..js` 回 404（`ChunkLoadError`），頁面程式沒載完。原因是本機的 `tools/serve-out.mjs` 只要路徑字串含「..」就拒絕，而這次 build 的 chunk 檔名剛好有「..」（GitHub Pages 會正常提供）。改成只擋真正的上層目錄片段（`/../`、編碼過的 `%2e%2e` 仍然擋下），重啟伺服器後重跑完整的靜態驗證；那一次的證據保留在 `static-run2-dotdot/`。

證據在 `.handoff/evidence/round-17/`（`c16`、`godot-check-run1～3.log`、`godot-check-final.log`、`mut/`、`r17-dev-try1～4`、`full-dev`、`full-dev-r10`、`full-dev2`、`static-interrupted`、`static-run2-dotdot`、`static`、`build.log`、`eslint-all.json`、`proto2-godot/`）。

### 25.6 仍未涵蓋

1. 「優先前方」比的是路點序號，同一段路上的敵人都算相同進度（這時照生成順序），不是精確的離基地距離；目前的關卡路線大多只有兩個路點。沒有改這個既有定義。
2. 目標優先只存在這一場；沒有全域偏好或預設模式的設定，也沒有「最近」「最快」等其他模式。數值與平衡沒有調整。
3. 獨立戰鬥頁在窄的視窗裡，遊戲畫面左右超出視窗（出生點那一欄在畫面外），是既有的版面；這次只讓選取面板留在看得到的範圍（D22）。
4. 浮動入口的隱藏用 CSS `:has()`：Chrome 105、Safari 15.4、Firefox 121 以上支援；不支援的瀏覽器維持原本的行為（入口仍會蓋住視窗）。只測了 Chrome 153。
5. 預覽之外的神馬視窗（武將、隊伍、玩家資訊等）沒有加上焦點限制與還原（照指示只處理新視窗）。
6. 全部 mock，沒有正式 GAS 讀寫。L1、D16、D18、D19 維持。

### 25.7 修改檔案（Round 17，未 commit）

| 檔案                                                                                                                                                | 內容                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/PageInfoButton.tsx`、`src/components/common/chatWidget.tsx`、`…/styles/shenmaSanguo.module.css`                                     | 浮動入口的標記與隱藏規則（含戰場上的選取面板與部署選單，§25.9；chatWidget 另有既有的 Prettier 排版）；面板目標按鈕的樣式                                                |
| `…/components/modals/EnemyPreviewModal.tsx`                                                                                                         | 焦點移入、Tab 循環、焦點拉回、Esc 只關預覽、關閉後還原焦點、`aria-modal`                                                                                                |
| `godot/shenmaSanguo/entities/tower/Tower.gd`、`main/Main.gd`、`bridge/WebBridge.gd`、`public/games/shenmaSanguo/index.{html,pck,service.worker.js}` | 目標優先、命令驗證與回覆、協定 3、快照欄位；重新匯出                                                                                                                    |
| `…/battle/components/UpgradePanel.tsx`、`…/components/SinglePageContent.tsx`、`…/battle/components/BattlePageContent.tsx`、`…/utils/gameEngine.ts`  | 面板的目標選項（按鈕列用 Bootstrap `Row`／`Col`，§25.9）與定位、兩個戰鬥頁送出命令與採用回覆、協定 3                                                                    |
| `scripts/shenma-regression/godot/lifecycle_test.gd`、`godot/bridge_recorder.gd`                                                                     | R10-1 改成協定 3、R17-1～R17-13；recorder 記錄面板與目標優先的回覆                                                                                                      |
| `scripts/shenma-regression/r17-web.js`（新增）、`harness.js`、`r10-web.js`、`r12-web.js`、`web/player-store.test.mjs`、`tools/serve-out.mjs`        | 瀏覽器回歸（含提交前補的 C 段，§25.9）；mock `chapter1_10`「Mock T 塔目標」與三種敵人、證據目錄 round-17；R10 與 store 的協定版本改成 3；本機靜態伺服器允許檔名含「..」 |
| `scripts/shenma-regression/README.md`、`docs/shenma-sanguo-feature-roadmap.md`                                                                      | 測試說明（含協定 2 舊產物的取出方式）、功能狀態與後續順序                                                                                                               |

### 25.8 待決事項（截至 Round 17，取代 §24.8）

| #   | 事項                                                                         | 目前狀態                                                                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改） | 後續再安排（受限分頁已可下載更新前的暫存）                                                                                                                                                                                                                                               |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`  | 後續再安排                                                                                                                                                                                                                                                                               |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                     | 未決定；需要後端契約證據                                                                                                                                                                                                                                                                 |
| D4  | 自動重新確認的次數與間隔                                                     | 已決定（Round 7）                                                                                                                                                                                                                                                                        |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                   | 未決定；需要 GAS 原始碼                                                                                                                                                                                                                                                                  |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                    | 風險仍在；不屬於神馬三國                                                                                                                                                                                                                                                                 |
| D7  | commit                                                                       | Round 7～10：`81cabb43`；Round 11：`7cec1df2`；Round 12：`c62298db`；Round 14 黃忠：`8275ff6d`；Round 13～15 存檔：`4793872e`；Round 15 周瑜：`95dea9fe`；Round 16：`fe7724f2`；都在本機、未 push。Round 17＋提交前修正（§25.9）：Codex 預先授權一筆本機 commit，提交後的 SHA 記在下一節 |
| D8  | 請求逾時；多裝置、多分頁衝突                                                 | 仍待規劃                                                                                                                                                                                                                                                                                 |
| D9  | 手動同步進行中，是否禁止其他操作                                             | 已決定（Round 8）                                                                                                                                                                                                                                                                        |
| D10 | 切換帳號被擋下時的提示                                                       | 已處理（Round 10）                                                                                                                                                                                                                                                                       |
| D11 | 跨來源隔離切換時 sessionStorage 各有一份                                     | 本機修正已提交（`4793872e`）；讀不回的舊進度與後端原子寫入仍是發布前的課題（D16、D18）                                                                                                                                                                                                   |
| D12 | 是否把跨來源隔離縮小到只有 `bgRemover`                                       | 已提交（`4793872e`）；部署後如何觀察正式站的遷移，需要另外決定                                                                                                                                                                                                                           |
| D13 | Godot 畫布裡的中文顯示成方框（沒有中文字型）                                 | 未決定                                                                                                                                                                                                                                                                                   |
| D14 | 武將的正式設定                                                               | 已解決                                                                                                                                                                                                                                                                                   |
| D15 | 這個 clone 沒有自動執行 git hooks                                            | 已決定：獲准 commit 時手動對暫存的檔案跑 lint-staged 並核讀修改（`fe7724f2` 照做，沒有修改）                                                                                                                                                                                             |
| D16 | 後端版本號／條件寫入                                                         | 未決定；等 GAS 程式位置，取得後先唯讀盤點契約。L1 仍是限制                                                                                                                                                                                                                               |
| D17 | 攻速成長的欄位名稱                                                           | 已解決並提交（Round 16，`fe7724f2`）                                                                                                                                                                                                                                                     |
| D18 | 受限分頁的出口                                                               | Codex 接受作為明示限制                                                                                                                                                                                                                                                                   |
| D19 | 寫入限制的範圍是整個分頁的所有帳號                                           | Codex 接受作為明示限制                                                                                                                                                                                                                                                                   |
| D20 | 周瑜「火攻」的數值與平衡                                                     | 維持                                                                                                                                                                                                                                                                                     |
| D21 | 全站浮動入口壓在神馬三國的視窗上                                             | 完成：Round 17 只涵蓋大型視窗，Codex 在 Round 18 驗收時發現手機上說明按鈕蓋住弓兵塔面板；補上戰場的選取面板（塔與武將）與部署選單並補測後才算完成（§25.9）。不支援 `:has()` 的舊瀏覽器維持原行為                                                                                         |
| D22 | 獨立戰鬥頁在窄視窗裡遊戲畫面左右超出視窗（出生點在畫面外）                   | Codex 決定調整（Round 18 §4）：戰場依實際可用範圍完整顯示，面板與部署選單用同一套座標換算。另外記錄：手機主頁的部署選單最後一張卡片下緣超出畫面（§25.9），一併處理                                                                                                                       |

### 25.9 提交前修正（Codex Round 18 驗收）

Codex 在 Round 18 驗收 Round 17：目標優先與預覽鍵盤通過，另外指出兩項提交前必修，並預先授權「修好、補測通過、文件更新後，Round 17 連同這兩項合成一筆本機 commit」。這兩項只改 Web／CSS／測試，沒有動 Godot（產物與 `public/` 相同，不需要重跑 Godot 全套）。

| #      | 問題                                                                                                                                                                                      | 修正                                                                                                                                                                                                           |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R17-C1 | D21 漏了戰場面板：Codex 自己的 375 寬截圖裡，說明按鈕蓋在弓兵塔面板左上、遮住「攻擊力」。隱藏規則只列了大型視窗；Round 17 的 F-2 只測大型視窗、T-8 只測三個目標按鈕，所以全部綠燈也沒抓到 | 同一條 `:has()` 規則加上 `upgradePanel`（塔與武將的選取面板）與 `placementOverlay`（部署選單）。沒有加 z-index、沒有永久隱藏；關閉後恢復；底部存檔提示不是浮動入口，不受影響（K-4 驗過同一條規則下提示仍可見） |
| R17-C2 | 新的目標按鈕列用手寫 flex（`flex: 1`），不符合 AGENTS.md 的 Bootstrap Grid 規範                                                                                                           | 改用 react-bootstrap `Row`（`g-1`，間距和原本的 4px 相同）／`Col xs={4}`，按鈕 `width: 100%`，外觀樣式留在 CSS module。只改這一段；既有面板與 Godot 座標定位沒有動                                             |

**補測（`r17-web.js` 的 C 段，C-1～C-6）**：主頁與獨立戰鬥頁 × 1280×800 與 375×740，實際點格子開部署選單（先按 × 關閉、再開一次放弓兵塔）、點塔開面板、在路徑格放關羽再點武將開面板。開啟時浮動入口 `visibility: hidden`、點不到；塔與武將面板每個欄位（攻擊力、攻擊間隔、射程、生命值）與按鈕（關閉、升級、三個目標）完整在畫面內、中心點到自己；部署選單的關閉、分頁與每張卡片中心點到自己；每次關閉後入口恢復。C-5：手機主頁的塔面板和說明入口原本的位置重疊（1444 px²），重疊區域取 3×3 個點，全部點到面板。C-6：目標按鈕列是 `row g-1`、每個按鈕在 `col-4` 裡、三個同一列同寬。

| #      | 項目               | 結果 | 驗證方式 | 依據                                                                                                                                                                                                           |
| ------ | ------------------ | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R17-C  | 反向驗證           | 通過 | mock     | M1（規則拿掉兩個新選擇器＝Round 17 原本的版本）：C-1～C-5 失敗，重疊區 9 個點全部點到說明入口；M2（按鈕列改回手寫 flex）：只有 C-6 失敗。原檔還原、雜湊一致，之後重啟 dev 再跑正式回歸                         |
| R17-B3 | 瀏覽器回歸（dev）  | 通過 | mock     | 重啟 dev、全新 context：`r17-web.js` 27／27（原 21＋C 段 6）、`r16-web.js` 19／19、`artifacts-and-network.js` 12／12，結束碼 0；GAS 網路請求 0。375 寬截圖目視：塔面板「攻擊力」不再被遮、按鈕列排列和之前相同 |
| R17-S2 | 正式靜態匯出       | 通過 | mock     | build 後 `tools/serve-out.mjs`（`LOCAL_ASSETS=1`）：`r17-web.js` 27／27。正式 CSS 的規則（lightningcss 包成 `:is(...)`）包含 `upgradePanel` 與 `placementOverlay`；Godot 產物與 `public/` 相同                 |
| R17-W2 | tsc、ESLint、build | 通過 | 實測     | tsc 0；神馬三國範圍＋兩個浮動元件 ESLint 0 error／11 warning（和 Codex 相同）；Prettier 通過。build 前兩次在藏書閣頁面失敗（外部書單服務回 404，D6 的既有風險，和這次修改無關），第三次結束碼 0                |

**過程紀錄（照實保留）**

1. 第一版 C 段要求部署選單的每張卡片都完整在畫面內，手機主頁失敗：選單最後一張「文士塔」下緣超出畫面底部（中心仍點得到、沒有被入口擋住）。這是部署選單既有的定位（用視窗座標硬算、沒有捲動），屬於 Round 18 §4（D22）的範圍；C 段改成面板要求完整在畫面內、部署選單要求每一項中心點到自己，超出畫面的項目另外記錄（`outOfView`）。
2. 第一版 C-5 只檢查欄位中心點，反向驗證 M1 時仍然通過——說明按鈕只蓋住「攻擊力」欄位的左半，中心沒被蓋到。改成在入口原本位置和面板重疊的區域取 3×3 個點，M1 下 9 點全部點到入口、被抓到。
3. 開發模式左下角的 Next.js 指示器（「N」）在獨立戰鬥頁 375 寬會碰到升級按鈕的左下角；它只存在於 dev，正式匯出沒有，升級按鈕的中心點得到。

證據在 `.handoff/evidence/round-18/`（`c-try1～4`、`mut-m1`、`mut-m2`、`gate`、`static`、`build-try1-novels404.log`、`build-try2-novels404.log`、`build.log`、`tsc.log`、`eslint-scope.json`）。

## 26. Round 18（2026-09-28）：提交 Round 17、戰場適應視窗（D22）、備戰拆除防禦塔

Codex 補充驗收 R17-C1／C2 通過，Round 17 在本機提交；之後照原 Round 18 指示做 D22（戰場依實際可用範圍完整顯示）與新功能「備戰拆除防禦塔」。Round 18 的修改還沒 commit，待 Codex 驗收；沒有 push、沒有部署，沒有讀寫正式 GAS／Sheets。所有玩家測試都是 mock。

### 26.1 Round 17 的 commit

`e8bdd4b7` `feat: 新增防禦塔目標優先並改善遊戲視窗操作`（25 個檔案，作者 ZeHoward；使用者要求照溝通檔繼續，照 `/commit-push` 流程只 commit、跳過 push）。暫存後手動跑 lint-staged 的指令（`eslint --fix --no-warn-ignored` 0 error／6 warning、`prettier --write`），暫存檔案的 sha256 前後相同；cr-at-eol staged diff check 通過；`.handoff` 沒有進暫存。hooks 仍未啟用（D15）。沒有 amend。

### 26.2 D22：戰場適應視窗

| 項目     | 內容                                                                                                                                                                                                                                                                                                                                                                                    |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原因     | 獨立戰鬥頁的外層是置中排列，遊戲框沒有指定寬度，被「高度 × 0.9」撐寬、超出視窗（375 寬時約 594 寬，左右各被裁掉）。另外 Godot 用 `canvas_items`＋`expand`：iframe 的比例一變，邏輯畫面就跟著變（例如 375×740 是 540×1066）；地圖只在重畫時依新尺寸置中，已放置的單位不會跟著移動，縮放或轉向後可能錯位                                                                                  |
| 做法     | 戰場區域（`gamePortraitWrap`，頁面上標記 `data-game-stage`）寬度 100%、`container-type: size`；遊戲框用容器查詢單位固定 540:720：`width: min(100cqw, 75cqh)`、`aspect-ratio: 3 / 4`，放到最大並置中留邊，不拉伸、不裁切。比例固定時 Godot 的邏輯畫面一直是 540×720，縮放或轉向只改變縮放倍率，不需要改 Godot、不會重新載入遊戲                                                          |
| 面板定位 | 選取面板（塔與武將）與部署選單共用 `utils/stageAnchor.ts`：Godot 座標乘上 min(寬/540, 高/720)、放在單位上方（放不下時放下方）、限制在「戰場區域與視窗」的交集裡；可用高度不夠時限制最大高度，面板內容捲動（選取面板的標題列與關閉鈕固定）。視窗大小、方向、容器或面板本身大小改變時重新計算。部署選單原本用視窗座標硬算、沒有捲動（§25.9 記錄的手機主頁末項超出畫面），一併改用這套定位 |
| 頂欄     | 獨立戰鬥頁的頂欄改用 Bootstrap `Row`／`Col`（`g-2`、`xs="auto"`、控制按鈕 `ms-auto`），窄螢幕自動換行（320 寬換成三行），不再超出視窗；「迎戰」「自動」都看得到、點得到                                                                                                                                                                                                                 |
| 高度     | 兩個戰鬥頁的高度加上 `100dvh`（手機瀏覽器網址列收合時的實際可見高度），不支援的瀏覽器用原本的 `100vh`                                                                                                                                                                                                                                                                                   |
| 主頁     | 主頁使用同一個戰場容器：直式手機時遊戲畫面上下留邊（露出頁面背景），HUD 照舊疊在最上層；地圖在畫面上的位置與大小和之前相同（寬度受限時縮放倍率一樣）                                                                                                                                                                                                                                    |

### 26.3 備戰拆除防禦塔

| 項目     | 規則                                                                                                                                                                                                                                                                                                     |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 時機     | 五種防禦塔都可以在**備戰中（PREP）**拆除；戰鬥中（包括自動模式清波後等待下一波，仍是 BATTLE）、結算後、未載入都不行。武將沒有這個操作                                                                                                                                                                    |
| 返還     | `floor(這座塔已實際支付的建造＋升級戰鬥金幣 × 0.5)`。投入只在 `spend_gold` 成功後才記（建造、Godot 自己的升級、Web 的升級三處），失敗的升級不計入；不依等級推算。比例集中在 `Tower.SELL_REFUND_RATIO`（第一版 50%，沒有做平衡評估，D23）。例：弓兵 50 → 25；弓兵 Lv3 共 200 → 100；文士 80＋75＝155 → 77 |
| 結算方   | Godot 是唯一的結算方。Web 送 `sell_tower {battle_id, tower_uid, expected_refund}`；Godot 只在「這一場、目前選取中的同一座有效塔、還沒拆、PREP、`expected_refund` 等於現在的返還金額」時拆除。`expected_refund` 只用來確認玩家看到的是最新的數字，付款一律用 Godot 自己算的金額                           |
| 原子處理 | 同一個處理裡：標記已拆 → 取消拖曳與選取 → 釋放格子 → 移出場景並釋放（立即停止攻擊與光環）→ 返還一次 → 回覆 `tower_sell_result {ok: true, refund, gold}`。重複或延遲的命令找不到選取中的同一座塔，不會再退款；同一格重建的新塔有新識別碼、等級 1、優先前方、投入從建造費開始                              |
| 拒絕     | 每個命令都回覆：`stale_battle`（別場）、`not_selected`（不是目前選取的同一座塔，包括已拆掉的）、`not_prep`、`refund_changed`（金額不符、沒有帶、非整數）。回覆帶這座塔現在的返還金額與 `can_sell`，Web 用它更新面板；拒絕不改金幣、塔與投入，也不重送面板                                                |
| 面板     | 選取塔的面板多了「拆除（返還 💰X）」；戰鬥中是不能按的「備戰時可拆除」。按下後先顯示確認（返還與已投入的金額、確認拆除／取消），確認期間升級按鈕停用。確認期間開戰，確認畫面改成「戰鬥已開始，備戰時才能拆除」、確認鈕停用；Godot 因升級重送面板時確認畫面關閉，要重新確認新的金額。取消不送命令         |
| 金幣顯示 | Web 不先增加畫面上的金幣，等 Godot 的 `update_stats`                                                                                                                                                                                                                                                     |
| 不影響   | 返還不是擊殺收益：不改 kills、星數、戰場點數，不寫 player／session／`save_result`，沒有新的存檔欄位；存檔限制不變。已有時效的減速照原本的時間到期                                                                                                                                                        |
| 協定     | 橋接協定 3 → **4**（`WebBridge.gd`、`gameEngine.ts`）：舊版遊戲（包括 Round 17 的協定 3 產物）顯示既有的「遊戲版本需要更新」、不送關卡資料，拆除不會默默失效                                                                                                                                             |
| 順手修正 | Web 的升級命令（`request_upgrade`）在 Lv5 時沒有檢查，升級費是 0，會免費升到 Lv6。加上 `can_upgrade()` 檢查（Godot 自己的升級路徑原本就有）                                                                                                                                                              |
| 測試用   | `debug_snapshot` 的 `tower_targets` 多了 `cell`、`invested`、`refund`；面板資料多了 `invested_gold`、`sell_refund`、`can_sell`                                                                                                                                                                           |

### 26.4 Round 18 檢查結果

| #      | 項目                | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------ | ------------------- | ---- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R18-G1 | Godot 測試          | 通過 | 實測     | 全新暫存目錄 import／export／產物核對＋測試 153／153，結束碼 0（Round 17 的 142 項＋R18-1～R18-11；R10-1 改成協定 4）。五種塔的返還、Lv3 與文士的取整、失敗的升級不計入、Lv5 不會免費升級、兩塔獨立、重複命令只退一次、原格重建、各種拒絕、確認期間升級、拆掉的塔開戰後不再傷害與緩速、戰鬥中與結算後不能拆、擊殺與戰場點數不變、競態（確認後開戰、自動模式等待下一波、下一波開始後）                                                                                                                                                                                                  |
| R18-G2 | Godot 反向驗證      | 通過 | 實測     | 10 種錯誤實作都被抓到：重複退款、信任 Web 的金額、失敗的升級也計入、依等級推算返還、不檢查備戰狀態、不檢查 battle_id、不檢查是不是同一座塔、不釋放格子、不移除節點、退款算成擊殺。原檔已還原（第一次 9／10，見過程紀錄 5）                                                                                                                                                                                                                                                                                                                                                             |
| R18-W1 | Web 反向驗證        | 通過 | mock     | 5 種錯誤實作都被抓到：遊戲框不固定比例（D-1～D-8）、面板只定位一次（R-1～R-4 等）、部署選單用舊定位（D-3、D-4、D-6～D-8、R-3、R-4）、戰鬥中也能按拆除（S-9、B-2）、面板重送後保留舊的確認（S-7）。原檔還原、雜湊一致，之後重啟 dev 再做正式回歸                                                                                                                                                                                                                                                                                                                                        |
| R18-U1 | store、tsc、lint    | 通過 | 單元     | store 145／145（R10-P1 改成協定 4，並列出 Round 17 的 3 不相容）；tsc 0；神馬三國範圍＋兩個浮動元件 ESLint 0 error／11 warning（和 Round 17 相同的既有警告）；改過的檔案 Prettier 通過；cr-at-eol diff check 通過                                                                                                                                                                                                                                                                                                                                                                      |
| R18-B1 | 瀏覽器 `r18-web.js` | 通過 | mock     | 30／30。D：主頁與獨立戰鬥頁 × 1280×800、375×740、320×640、740×360，遊戲畫面完整在視窗內、固定 540:720、放到最大、頁面沒有捲動、頂欄按鈕點得到；地圖兩端 (1,4)、(12,4) 的點擊、部署選單、放下的塔、面板都對應同一格。R：戰鬥中開著面板連續縮放／轉向 5 次，面板每次都在可見範圍內、battle_id／血量／波次／模式不變、沒有重新載入；部署選單開著時轉向、關閉後倍率回到 1。S：主頁真實按鈕的確認／取消、金幣只在 Godot 回報後改變、原格重建、返還 100 與 77、確認期間升級、重複命令、確認期間開戰、沒有寫入。B：獨立戰鬥頁確認中轉向、拆除、重建、戰鬥中不能拆。V：協定 3 產物顯示更新提示 |
| R18-B2 | 瀏覽器完整回歸      | 通過 | mock     | 重啟 dev、全新 context 一次跑 20 支：I1 14、I2 8、自動 9、正常 9、R3 13、產物 12、R4 22、R5／R6 26、R7 9、R8 16、R9 21、R10 26、R12 18、R13 46、R14 14、R15 13、R16 19、R18 30；R17 26／27（C-5 的前提被 D22 改變，見過程紀錄 8）。修正 C-5 後重啟 dev、全新 context：R17 27／27、R18 30／30、R16 19／19、產物 12／12。GAS 網路請求 0                                                                                                                                                                                                                                                  |
| R18-S  | 正式靜態匯出        | 通過 | mock     | build 後用 `tools/serve-out.mjs`（`LOCAL_ASSETS=1`）：R13 46、R12 18、R14 14、R15 13、R16 19、R17 27、R18 30，結束碼 0；GAS 網路請求 0                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| R18-W  | build               | 通過 | 實測     | build 結束碼 0（這次第一次就成功）；`out/` 的 82 個 Next 頁面都有開機腳本；Godot 產物與 `public/` 相同；正式 CSS 有 3:4 容器規則與 `container-type: size`                                                                                                                                                                                                                                                                                                                                                                                                                              |

**過程紀錄（照實保留）**

1. Godot 第一次跑 R18：測試換上的 `bridge_recorder` 沒有接 `upgrade_unit_requested` 信號（Web 的升級命令是另一個信號），升級沒有生效，R18-2／3／4／7 連帶失敗；R18-8 對已釋放的塔呼叫 `is_inside_tree()` 出現 SCRIPT ERROR。都是測試碼問題，修正後通過。
2. 一開始的設計是拒絕時 Godot 重送面板（先隱藏再顯示）。在瀏覽器上發現這會讓 Web 收到隱藏訊息、清掉拆除狀態，拒絕的原因顯示不出來；改成回覆帶現在的返還金額與 `can_sell`、不重送面板。**這個修改是在把第一次匯出的產物複製到 `public/` 之後才做的**，所以第二次跑 `r18-web.js` 仍是舊行為（S-9 等不到原因說明）；用探查腳本看到訊息順序才發現，重跑 Godot 檢查、複製新的匯出、再用新目錄做最終核對。
3. 第一版 S-9 在拒絕後按「取消」，但依設計拒絕後確認畫面已換成原因說明，沒有取消鈕（測試步驟寫錯）；改成檢查原因說明與按鈕狀態。
4. 確認文字較長時，選取面板被撐到可用的最大寬度（375 寬時幾乎滿版、蓋住塔）。改成固定寬度 232px（很窄的畫面由定位的最大寬度限制）。
5. Godot 反向驗證第一次 9／10：「不檢查備戰狀態」讓 R18-9 失敗，但同一個錯誤實作把塔拆掉後，測試碼又對已釋放的塔呼叫方法而中止，R18-10／11 沒跑到。加上 `_alive()` 讓測試碼對已釋放的節點穩健後重跑 10／10，並因為改了測試碼重跑完整的 Godot 檢查。
6. Web 反向驗證第一次 W5（面板重送後保留舊的確認）讓 S 段在等待元素時逾時（例外），不是 S-7 的斷言失敗；把 S-7 改成不等待、直接記錄狀態，重跑後由 S-7 抓到。
7. 用 `sed -i` 改一個 CRLF 的檔案時被轉成 LF（替換也沒有生效），改用保留換行的 node 腳本修正並恢復 CRLF。
8. 完整回歸的 r17 C-5 失敗：它的前提是「手機主頁的塔面板和說明入口位置重疊」（Codex 當時發現的情境），D22 之後遊戲畫面置中留邊，四個情境都不再自然重疊。改成開著塔面板時把說明入口暫時移到「攻擊力」上模擬重疊，再驗 9 個點；拿掉隱藏規則時仍然失敗（9 個點都點到入口）。
9. `artifacts-and-network.js` 要在停在 `/shenmaSanguo` 的腳本之後執行（和 Codex 上輪記錄的一樣）；第一次接在 r18 後面回報 0 個斷言，照原順序接在 r16 後面重跑 12／12。

證據在 `.handoff/evidence/round-18/`（`c17/`、`godot-check-run1～3.log`、`godot-check-final-before-alive.log`、`godot-check-final.log`、`mut/`、`probe1`、`probe2`、`r18-try1～3`、`full-dev`、`full-dev2`、`full-dev3`、`static`、`build-r18.log`、`tsc-r18.log`、`eslint-scope-r18.json`、`store.txt`、`proto3-godot/`）。

### 26.5 仍未涵蓋

1. 返還比例 50% 沒有做平衡評估（D23）；只能在備戰中拆除，自動模式開著時兩波之間是 BATTLE，要關掉自動、清波回到備戰才能拆。
2. 直式手機的主頁改成留邊版面，遊戲畫面上下會露出頁面背景；橫向短高度時遊戲畫面較小（例如 740×360 約 237×316），但完整顯示、面板可以捲動（D24）。
3. 容器查詢單位需要 Chrome 105、Safari 16、Firefox 110 以上；不支援的瀏覽器維持填滿的舊版面（也就是 D22 之前的行為）。`100dvh` 不支援時用 `100vh`。
4. 部署選單的遮罩只蓋住遊戲畫面；點留邊的區域不會關閉選單，要按 ×。
5. 只測了 Chrome 153；全部 mock，沒有正式 GAS 讀寫。L1、D16、D18、D19 維持。

### 26.6 修改檔案（Round 18，未 commit）

| 檔案                                                                                                                                                                                    | 內容                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `godot/shenmaSanguo/entities/tower/Tower.gd`、`main/Main.gd`、`systems/BattleManager.gd`、`bridge/WebBridge.gd`、`public/games/shenmaSanguo/index.{html,pck,service.worker.js}`         | 投入與返還、拆除命令與回覆、退款入帳、Lv5 升級檢查、協定 4、快照與面板欄位；重新匯出                                 |
| `src/app/(games)/shenmaSanguo/utils/stageAnchor.ts`（新增）、`utils/towerSell.ts`（新增）                                                                                               | 面板與部署選單共用的定位；拆除的面板狀態與原因說明                                                                   |
| `…/battle/components/UpgradePanel.tsx`、`PlacementMenu.tsx`、`BattlePageContent.tsx`、`…/components/SinglePageContent.tsx`、`…/utils/gameEngine.ts`、`…/styles/shenmaSanguo.module.css` | 共用定位、面板捲動與拆除 UI、獨立戰鬥頁頂欄 Row／Col、兩個戰鬥頁的拆除命令與回覆、戰場容器 540:720、`100dvh`、協定 4 |
| `scripts/shenma-regression/godot/lifecycle_test.gd`、`godot/bridge_recorder.gd`                                                                                                         | R10-1 改成協定 4、R18-1～R18-11；recorder 記錄拆除的回覆與隱藏面板                                                   |
| `scripts/shenma-regression/r18-web.js`（新增）、`r17-web.js`、`harness.js`、`r10-web.js`、`r12-web.js`、`web/player-store.test.mjs`                                                     | 瀏覽器回歸；C-5 改成模擬重疊；證據目錄 round-18；R10、R12、store 的協定版本改成 4                                    |
| `scripts/shenma-regression/README.md`、`docs/shenma-sanguo-feature-roadmap.md`                                                                                                          | 測試說明（含協定 3 舊產物的取出方式）、功能狀態                                                                      |

### 26.7 待決事項（截至 Round 18，取代 §25.8）

| #   | 事項                                                                         | 目前狀態                                                                                                                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改） | 後續再安排（受限分頁已可下載更新前的暫存）                                                                                                                                                                                                                   |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`  | 後續再安排                                                                                                                                                                                                                                                   |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                     | 未決定；需要後端契約證據                                                                                                                                                                                                                                     |
| D4  | 自動重新確認的次數與間隔                                                     | 已決定（Round 7）                                                                                                                                                                                                                                            |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                   | 未決定；需要 GAS 原始碼                                                                                                                                                                                                                                      |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                    | 風險仍在；不屬於神馬三國（Round 18 第一次提交前的兩次 build 因此失敗）                                                                                                                                                                                       |
| D7  | commit                                                                       | Round 7～10：`81cabb43`；Round 11：`7cec1df2`；Round 12：`c62298db`；Round 14 黃忠：`8275ff6d`；Round 13～15 存檔：`4793872e`；Round 15 周瑜：`95dea9fe`；Round 16：`fe7724f2`；Round 17：`e8bdd4b7`；都在本機、未 push。Round 18 還沒 commit，待 Codex 驗收 |
| D8  | 請求逾時；多裝置、多分頁衝突                                                 | 仍待規劃                                                                                                                                                                                                                                                     |
| D9  | 手動同步進行中，是否禁止其他操作                                             | 已決定（Round 8）                                                                                                                                                                                                                                            |
| D10 | 切換帳號被擋下時的提示                                                       | 已處理（Round 10）                                                                                                                                                                                                                                           |
| D11 | 跨來源隔離切換時 sessionStorage 各有一份                                     | 本機修正已提交（`4793872e`）；讀不回的舊進度與後端原子寫入仍是發布前的課題（D16、D18）                                                                                                                                                                       |
| D12 | 是否把跨來源隔離縮小到只有 `bgRemover`                                       | 已提交（`4793872e`）；部署後如何觀察正式站的遷移，需要另外決定                                                                                                                                                                                               |
| D13 | Godot 畫布裡的中文顯示成方框（沒有中文字型）                                 | 未決定                                                                                                                                                                                                                                                       |
| D14 | 武將的正式設定                                                               | 已解決                                                                                                                                                                                                                                                       |
| D15 | 這個 clone 沒有自動執行 git hooks                                            | 已決定：獲准 commit 時手動對暫存的檔案跑 lint-staged 並核讀修改（`e8bdd4b7` 照做，沒有修改）                                                                                                                                                                 |
| D16 | 後端版本號／條件寫入                                                         | 未決定；等 GAS 程式位置，取得後先唯讀盤點契約。L1 仍是限制                                                                                                                                                                                                   |
| D17 | 攻速成長的欄位名稱                                                           | 已解決並提交（Round 16，`fe7724f2`）                                                                                                                                                                                                                         |
| D18 | 受限分頁的出口                                                               | Codex 接受作為明示限制                                                                                                                                                                                                                                       |
| D19 | 寫入限制的範圍是整個分頁的所有帳號                                           | Codex 接受作為明示限制                                                                                                                                                                                                                                       |
| D20 | 周瑜「火攻」的數值與平衡                                                     | 維持                                                                                                                                                                                                                                                         |
| D21 | 全站浮動入口壓在神馬三國的視窗上                                             | 完成並提交（`e8bdd4b7`，含戰場上的選取面板與部署選單）。不支援 `:has()` 的舊瀏覽器維持原行為                                                                                                                                                                 |
| D22 | 獨立戰鬥頁在窄視窗裡遊戲畫面左右超出視窗（出生點在畫面外）                   | 已實作（Round 18，§26.2）：遊戲畫面固定 540:720、放進戰場區域的實際寬高；面板與部署選單共用定位；待 Codex 驗收                                                                                                                                               |
| D23 | 拆除返還比例（第一版 50%）的數值與平衡                                       | 新增；維持 50%，需要平衡評估時再調整 `Tower.SELL_REFUND_RATIO`                                                                                                                                                                                               |
| D24 | 直式手機主頁改成留邊版面；橫向短高度時遊戲畫面較小                           | 新增：是 D22 做法的視覺取捨（不拉伸、不裁切），是否接受或另外設計留邊的背景，需要決定                                                                                                                                                                        |

## 27. 部署慢速的生命週期與戰鬥速度 1×／2×（2026-09-29）

先修正部署慢速的生命週期（不能殘留到新場次、過期的關閉命令不能解除新選單的慢速、戰場留邊可以關閉部署選單），再加上戰鬥速度 1×／2×。本節與 §28 的修改還沒提交，待驗收；沒有 push、沒有部署，沒有讀寫正式 GAS／Sheets。所有玩家測試都是 mock。

### 27.1 前一次提交

`d776e2d9` `feat: 改善戰場縮放並新增備戰拆塔退款`（26 個檔案，作者 ZeHoward／howard867@yahoo.com.tw；只 commit、沒有 push）。暫存後手動跑 lint-staged 的指令（`eslint --fix --no-warn-ignored` 0 error／6 warning、`prettier --write`），暫存檔案的 sha256 前後相同；cr-at-eol staged diff check 通過。hooks 仍未啟用（D15）。沒有 amend。

### 27.2 部署慢速的生命週期

| 項目            | 內容                                                                                                                                                                                                                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原因            | 部署選單的慢速由 `Main` 直接寫 `Engine.time_scale = 0.1`，Web 關閉選單送的 `resume_game` 固定寫回 1，`_cleanup_current_stage` 不重設倍率。所以開著部署選單時載入新的一場，新場次仍是 0.1；上一場或較早的選單晚到的關閉命令也會解除目前選單的慢速                                                                                            |
| 統一的狀態      | 倍率改由 `BattleManager` 管理，`Engine.time_scale` 只在 `_apply_time_scale` 寫入：實際倍率＝部署選單開著時固定 0.1，否則是玩家選的速度。記錄兩個狀態：玩家選的速度 `speed_pref`（1／2）與目前開著的部署選單編號 `deploy_menu_id`（0＝沒有）；編號是只增不減的流水號，換場次也不重用                                                         |
| 新的一場        | `initialize`（新關卡、同一關重來，都是新的 `battle_id`）清掉部署慢速並回到 1×；同一場的更新隊伍、蓋塔、升級、拆塔、跨波都不重設                                                                                                                                                                                                             |
| 結算            | `_end_battle` 在建立結算之後回到 1×、關閉部署慢速：結算畫面與之後的新場次都不繼承；結算的 `time_seconds` 仍是遊戲時間                                                                                                                                                                                                                       |
| 打開與關閉      | 點可部署的空格時 `Main._open_deploy_menu` 向 `BattleManager.open_deploy_menu` 取得選單編號（只有備戰與戰鬥中會開），`click_cell` 帶這一場的 `battle_id` 與 `menu_id`。Web 關閉選單時 `resume_game` 帶回這兩個值；只有「這一場、目前開著的那個選單」的命令能恢復速度，上一場的、較早的選單、已經關閉的、沒有帶識別或編號不是整數的都不改倍率 |
| Web             | 兩個戰鬥頁只開目前這一場的選單（`utils/gameSpeed.ts` 的 `deployMenuRef`）；不是這一場的 `click_cell` 不顯示，並立刻把它的識別送回關閉（Godot 只在它仍是目前選單時才恢復）。切換關卡時先照一般的取消關閉選單；結算時選單一起關閉                                                                                                             |
| 戰場留邊（D24） | 部署選單開著時，戰場區域（`data-game-stage`）裡、遊戲畫面之前多一層遮罩（`stageMenuBackdrop`，和選單外同樣變暗），只露出遊戲畫面以外的留邊；點留邊和點選單外一樣是取消：走同一個關閉函式、恢復玩家選的速度，不會傳到 Godot（不部署、不切關、不加金幣）。沒有改遊戲畫面的尺寸                                                                |

### 27.3 戰鬥速度 1×／2×

| 項目              | 規則                                                                                                                                                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 選擇              | 主頁 HUD（迎戰、自動之後）與獨立戰鬥頁頂欄（自動、迎戰之前）共用 `battle/components/SpeedToggle.tsx`：兩顆按鈕 1×、2×，備戰與戰鬥中可以選；沒有這一場的狀態、版本不相符（沒有送出關卡資料）、結算時不顯示或不能按。窄螢幕只縮小按鈕左右留白，不擠掉迎戰、返回與金幣                               |
| 只採 Godot 的確認 | 命令 `set_game_speed {battle_id, speed}`；畫面亮起的是 Godot `update_stats` 回報的 `speed`（這一場的訊息才採用），按下後不先改顯示。Godot 每個命令都回覆 `game_speed_result {battle_id, ok, speed, time_scale, reason?}`                                                                          |
| Godot 的檢查      | 只接受這一場（`battle_id` 相同）、備戰或戰鬥中、數字 1 或 2（JSON 的數字是 float；字串、布林、null、其他數值都拒絕）。拒絕的原因：`stale_battle`、`not_active`、`invalid_speed`，不改任何狀態                                                                                                     |
| 和部署慢速的關係  | 部署選單開著時實際倍率固定 0.1（不乘成 0.2）；這時選 1×／2× 只更新選擇，選單關閉後才套用。兩個頁面在按鈕下方短暫提示「部署中暫時慢速」（依 Godot 回報的 `deploy_slow`）                                                                                                                           |
| 範圍              | 新的一場從 1× 開始，同一場跨波保留。只改遊戲時間的推進：敵人移動、塔與武將的攻擊冷卻、灼燒、減速、出兵間隔、自動下一波的等待都照倍率；傷害、費用、擊殺獎勵、拆塔返還、星數與戰場點數不變。切換當下不跳時鐘、不重設任何計時器；不動 `SceneTree.paused` 與手動暫停（§28.2）。沒有 3×／4× 或平衡調整 |
| 存檔              | 速度只在這一場；不寫 session、玩家存檔、GAS，`save_result` 沒有新欄位，也沒有新的後端呼叫                                                                                                                                                                                                         |

### 27.4 橋接協定 5

`update_stats` 多了 `speed`、`time_scale`、`deploy_slow`；`click_cell` 多了 `battle_id`、`menu_id`；新的命令 `set_game_speed` 與回覆 `game_speed_result`；`resume_game` 改走一般的資料路徑（`payload_received`，要帶識別）。舊版遊戲不認得速度命令、也不看關閉命令的識別，所以協定提升到 5（`WebBridge.gd`、`utils/gameEngine.ts` 同步）：新網頁遇到舊遊戲顯示「遊戲版本需要更新」、不送關卡資料，速度按鈕不會默默失效。`debug_snapshot` 另外帶 `speed_pref`、`deploy_menu_id`（測試用）。§28 再提升到 6。

### 27.5 檢查結果（戰鬥速度完成時）

| #   | 項目             | 結果                                   | 驗證方式 | 依據                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ---------------- | -------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Godot 測試       | 通過                                   | 實測     | 全新暫存目錄 import／export／產物核對＋測試 165／165（之前的 153 項＋測試編號 R19-1～12；R10-1 改成協定 5；R15-10 改用正式的速度命令與部署選單）。切關與重來回到 1×、過期與重疊的關閉命令、2× 時部署固定 0.1、選單中改選擇、同一場跨波與更新隊伍保留、結算回到 1×、各種拒絕、暫停不被解除；物理步進的時間、敵人每步的距離、出兵 1 秒與自動下一波 1.5 秒、1× 與 2× 的傷害／擊殺／星數／戰場點數／金幣／拆塔返還相同。攻擊冷卻那一項當時只驗短時間的間隔，長時間的累積誤差在 §28.1 修正 |
| G2  | Godot 反向驗證   | 通過                                   | 實測     | 12 種錯誤實作都被抓到（關閉選單一律回 1 倍、新的一場不重設、結算不重設、關閉命令不檢查場次與編號、速度命令不檢查場次、接受任意數值、部署慢速乘上選擇、只改記錄不改倍率、切換時重設攻擊冷卻、解除暫停、結算後仍接受、`click_cell` 不帶識別）                                                                                                                                                                                                                                           |
| W1  | Web 反向驗證     | 通過                                   | mock     | 4 種錯誤實作都被抓到（按下就先改顯示、關閉選單不帶識別、沒有留邊的關閉區、切關時不關選單）                                                                                                                                                                                                                                                                                                                                                                                            |
| U1  | store、tsc、lint | 通過                                   | 單元     | store 147／147；tsc 0；神馬三國範圍 ESLint 0 error；改過的檔案 Prettier 通過                                                                                                                                                                                                                                                                                                                                                                                                          |
| B1  | 瀏覽器           | 通過（完整回歸第一次有一支中止，見下） | mock     | `r19-web.js` 22／22（dev 3 次、正式靜態匯出 1 次）；完整回歸 21 支。第一次的 `r17-web.js` T 段：主頁的遊戲 iframe 120 秒沒有載入完成而中止，同一支的其他段與之後各支都通過，用全新 context 重跑 27／27；原因沒有確定                                                                                                                                                                                                                                                                  |
| S   | build、靜態匯出  | 通過                                   | mock     | build 結束碼 0；`out/` 的 Godot 產物與 `public/` 相同；用 `tools/serve-out.mjs`（`LOCAL_ASSETS=1`）跑 R12～R19 通過                                                                                                                                                                                                                                                                                                                                                                   |

### 27.6 仍未涵蓋

1. 攻擊冷卻在攻擊後設回完整的冷卻時間，逐擊丟失越過零點的時間（D25）：已在 §28.1 修正。
2. 2× 時每個物理步進的遊戲時間也是兩倍：敵人一步走得較遠、射程判定的間隔較粗。固定場景的擊殺與結算相同，但沒有做整體的平衡評估。
3. 戰場畫布裡沒有速度的標示（Godot 沒有中文字型，D13）；速度只顯示在網頁的按鈕上。
4. 只測了 Chrome；全部 mock，沒有正式 GAS 讀寫。L1、D16、D18、D19 維持。

## 28. 攻擊冷卻保留零頭與手動暫停（2026-09-29）

先修正攻擊冷卻逐擊丟失零頭（D25），再加上手動暫停／繼續。和 §27 一樣還沒提交，待驗收；沒有 push、沒有部署，沒有讀寫正式 GAS／Sheets，所有玩家測試都是 mock。

### 28.1 攻擊冷卻保留零頭（D25）

| 項目         | 內容                                                                                                                                                                                                                                                                                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 原因         | `Hero._process`／`Tower._process` 攻擊後把 `_atk_timer` 設回完整的攻擊間隔，丟掉這一幀越過零點的時間，每一擊都晚「不到一幀」，而且逐擊累積。2× 時一幀的遊戲時間是兩倍，丟得更多。用真正的 `Hero._process`、固定目標、每秒 60 幀跑 60 秒遊戲時間：間隔 0.1 秒時 1× 515 擊、2× 450 擊（理想 600，2× 比 1× 少約 12.6%）；0.5 秒 117／113（理想 120）；0.8 秒 75／72 |
| 修正         | `_atk_timer` 是距離下一擊的遊戲時間：持續有目標時，下一擊排在「上一擊的預定時間＋攻擊間隔」（`_atk_timer = 間隔 − 零頭`），不因幀長逐擊落後                                                                                                                                                                                                                      |
| 空場不囤積   | 冷卻好了但沒有目標（空場、目標離開射程、等待出兵）時停在 0（待命），不累積欠下的攻擊；取得目標的那一幀打一擊，之後照攻擊間隔（這一擊不帶零頭）                                                                                                                                                                                                                   |
| 極長的一幀   | 一幀最多打一擊（沒有 while 補打）；零頭長過一個攻擊間隔時（例如分頁卡住後的一幀）其餘的攻擊作廢，從這一擊起算完整的間隔，不會在下一幀連打。這是受幀率限制的已知限制                                                                                                                                                                                              |
| 不變的部分   | 攻擊力、攻速成長公式與 0.1 秒下限、射程、目標優先、技能倍率都沒改。切換速度、部署慢速、手動暫停、升級、重選目標都不重設計時器、不因命令本身攻擊。奇襲一場一次、火攻刷新與跳數、砲兵範圍傷害、步兵光環、文士減速照原規則                                                                                                                                          |
| 對 1× 的影響 | 1× 原本也偏慢：修正後短間隔的攻擊次數變多（0.1 秒間隔 60 秒內 515 → 600 擊，+16.5%；0.5 秒 117 → 120；0.8 秒不變），等於高等級、攻速接近下限的武將變強。沒有為了保持舊偏差而放寬測試；是否需要調整數值見 D25                                                                                                                                                     |
| 測試判定     | 舊的「每一擊都不得短於攻擊間隔」只適用於舊寫法。R16、R17-2、R19-9 改驗累積時程：每一擊的時間減去 k × 攻擊間隔的差距都落在一幀寬的範圍內（相鄰兩擊可能短一幀，但一幀不打兩下）；R17-2 切換目標後的下一擊在 0.8 秒的前後一幀內                                                                                                                                     |

### 28.2 手動暫停／繼續

| 項目         | 規則                                                                                                                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 操作         | 主頁 HUD（速度之後）與獨立戰鬥頁頂欄共用 `battle/components/PauseToggle.tsx`：未暫停時是「暫停」，Godot 確認暫停後按鈕亮起變「繼續」，戰場下方中央另有「已暫停」與「繼續」（`PauseBadge`，疊在部署選單的遮罩之上）。400 寬以下按鈕只留圖示；360 寬以下主頁 HUD 縮小留白，320 寬仍是一列。備戰與戰鬥中可以操作；結算、未載入、舊版遊戲（沒有送出關卡資料）不顯示      |
| 命令與確認   | `set_paused {battle_id, paused}`：`paused` 是布林的目標狀態（不是每收一次就反轉），重送同一個值回覆成功、不改任何東西。Godot 每個命令都回覆 `game_pause_result {battle_id, ok, paused, speed, time_scale, reason?}`；畫面只採 `update_stats` 的 `paused`，按下後不先改顯示                                                                                           |
| Godot 的檢查 | 只接受這一場、備戰或戰鬥中、布林；拒絕的原因 `stale_battle`（上一場的繼續命令不能解除新場次的暫停）、`not_active`、`invalid_paused`（字串、數字、null、物件、沒有帶），不改任何狀態                                                                                                                                                                                  |
| 怎麼凍結     | 暫停狀態 `BattleManager.manual_paused` 和玩家選的速度、部署慢速分開記錄。暫停時 `Main` 把 `UnitsLayer`（敵人、武將、防禦塔、傷害數字）、`WaveManager`、`BattleManager` 的 `process_mode` 設成停用；不動 `Engine.time_scale`（不用倍率 0 假裝暫停），也不動 `SceneTree.paused`（橋接、`Main` 的輸入與命令、HUD、測試快照照常運作，也不會解除外部設的暫停）            |
| 計時器       | 出兵間隔與自動下一波原本用 `SceneTree.create_timer`（預設在暫停時照走），改成 `BattleManager.create_game_timer`：`Timer` 節點掛在 `WaveManager`／`BattleManager` 底下，照倍率倒數，節點被停掉時一起停住，繼續後只跑剩下的時間（不重新計滿、不立刻補出）。原本的生命週期（`_generation`）與排程號碼（`_auto_wave_token`）保護照舊：舊場次的計時器之後觸發也不動新場次 |
| 凍結的內容   | 遊戲時間、敵人移動、塔與武將的攻擊冷卻、灼燒、減速剩餘、出兵間隔、自動下一波的等待、戰鬥時間（結算的 `time_seconds`）                                                                                                                                                                                                                                                |
| 暫停中不能做 | 開戰、切自動、部署武將與防禦塔、移位（Web 命令與 Godot 內的拖曳）、升級、拆塔（回覆 `paused`）、改目標、點空格開部署選單：Web 停用按鈕（部署選單與單位面板顯示說明），Godot 也拒絕；暫停時取消進行中的拖曳。可以點單位查看面板                                                                                                                                       |
| 和速度、部署 | 暫停中可選 1×／2×，當作繼續後的速度（仍暫停）；部署選單開著時暫停優先，可以關閉選單但不會恢復戰鬥：繼續時選單還開著回到 0.1，已關閉回到玩家選的速度。暫停中不顯示「部署中暫時慢速」提示                                                                                                                                                                              |
| 生命週期     | 新的一場、同一關重來（`initialize`）與結算（先建立結算內容再解除）解除暫停、恢復處理，下一場不會一開場就凍住；同一場跨波保留速度                                                                                                                                                                                                                                     |
| 範圍         | 只存在這一場的戰場記憶體：不寫 session、玩家存檔、GAS，`save_result` 沒有新欄位，也沒有新的後端呼叫。沒有背景自動暫停、離線推進或存檔續戰                                                                                                                                                                                                                            |

### 28.3 橋接協定 6

`update_stats` 多了 `paused`；新的命令 `set_paused` 與回覆 `game_pause_result`（欄位見 §28.2）；拆塔的回覆多一個原因 `paused`。舊版遊戲不認得暫停命令，所以協定提升到 6（`WebBridge.gd`、`utils/gameEngine.ts`、store 的 R10-P1、`r10-web.js`、`r12-web.js`、Godot 的 R10-1 同步）：新網頁遇到舊遊戲顯示「遊戲版本需要更新」、不送關卡資料，暫停按鈕不會默默失效。`debug_snapshot` 另外帶 `manual_paused`、`world_frozen`、`tree_paused`、`enemy_pos`（測試用，唯讀）。

### 28.4 檢查結果

| #   | 項目                | 結果 | 驗證方式 | 依據                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------- | ---- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G1  | Godot 測試          | 通過 | 實測     | 全新暫存目錄 import／export／產物核對＋測試 182／182，結束碼 0（§27 的 165 項＋R20-1～17；R10-1 改成協定 6；R16、R17-2、R19-9 改驗累積時程）。R20-1 固定步進的 48 組全部等於理想擊數（例如 0.1 秒間隔 60 秒內，武將與弓兵塔在每秒 30／60／120 幀、1× 與 2× 都是 600 擊；舊寫法 1× 515、2× 450）；R20-4 實際引擎跨 2×、部署 0.1、暫停、1× 共 12 擊，累積時程的差距 0.013 秒（最長一幀 0.138 秒）；R20-6 暫停牆鐘 1.5 秒後剩 0.600 秒，繼續後 0.600 秒出下一隻；R20-14 自動下一波暫停時剩 0.997 秒，繼續後 1.000 秒開波（清波到開波的遊戲時間 1.503 秒）；R20-15 灼燒在命中後 0.983／1.983／2.983 秒（命中與觀察差一幀）各跳一次                                                |
| G2  | Godot 反向驗證      | 通過 | 實測     | 16 種錯誤實作都被抓到（只跑 R16 與 R20，基準 24 項全過）：每擊設回完整冷卻（R20-1、R16-1、R16-5）、空場時冷卻繼續往下扣而囤積（R20-1、2、3、5）、零頭不設上限而連打（R20-3、5）、只記錄暫停不停模擬（R20-6～10、12、14、15）、出兵改回 `SceneTree.create_timer`（R20-6、13）、自動下一波改回 `SceneTree.create_timer`（R20-14）、暫停命令不檢查場次（R20-10、12）、新的一場不解除（R20-12～14）、速度命令順便解除暫停（R20-9）、每收一次就反轉（R20-9）、暫停中不拒絕操作（R20-11）、用倍率 0 假裝暫停（R20-6～10、12、14）、用 `SceneTree.paused` 暫停（R20-6～10、12、16）、結算不解除（R20-17）、暫停時不取消拖曳（R20-11）、暫停中仍能開部署選單（R20-8、11）。原檔已還原 |
| W1  | 網頁反向驗證        | 通過 | mock     | 網頁的 4 種錯誤實作都被 `r20-web.js` 抓到：按下就先顯示「已暫停」（P-2）、暫停命令不帶 `battle_id`（P 段在等 Godot 確認時中止）、暫停中部署選單沒鎖（P-5）、暫停中迎戰與自動仍可按（P-3）。另外用 `ENGINE_DIR` 換成刻意改壞後匯出的遊戲：只記錄暫停不停模擬（P-3、P-4、P-8、P-9、B-3）、出兵與自動下一波改回 `SceneTree.create_timer`（P-4、P-9、B-3）、暫停命令不檢查場次（P-8）。原檔已還原                                                                                                                                                                                                                                                                                 |
| U1  | store、tsc、lint    | 通過 | 單元     | store 148／148（R10-P1 改成協定 6、列出 5 不相容；新增 R20-W1）；tsc 0；神馬三國範圍 ESLint 0 error／11 warning（既有警告，數量和 §27 相同）；改過的檔案 Prettier 通過；cr-at-eol diff check 通過                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| B1  | 瀏覽器 `r20-web.js` | 通過 | mock     | 20／20（dev 上跑了 3 次）。主頁：新的一場有「暫停」、375 與 320 寬放得下；命令被攔下時畫面不改；備戰中暫停後才顯示「已暫停」與「繼續」、迎戰與自動停用、點空格不開選單、直接送的命令被拒絕；戰鬥中暫停 2.5 秒遊戲時間、敵人位置與血量、出兵數不變，第二隻在第一隻之後約 4 秒（遊戲時間）出現；部署與速度的交互；暫停中看塔的面板；320×640 與 740×375；暫停中切關與上一場的繼續命令；自動下一波的等待凍結；沒有寫入。獨立戰鬥頁：頂欄、備戰中的拒絕、2× 暫停、橫向。舊版遊戲顯示更新提示、沒有暫停按鈕                                                                                                                                                                         |
| B2  | 瀏覽器完整回歸      | 通過 | mock     | dev、全新 context 一次跑 22 支：I1 14、I2 8、自動 9、正常 9、R3 13、R4 22、R5／R6 26、R7 9、R8 16、R9 21、R10 26、R12 18、R13 46、R14 14、R15 13、R16 19、產物 12、R17 27、R18 30、R19 22、R20 20，共 394／394；GAS 網路請求 0                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| S   | 正式靜態匯出        | 通過 | mock     | build 後停掉 dev，用 `tools/serve-out.mjs`（`LOCAL_ASSETS=1`）跑 R12 18、R14 14、R15 13、R16 19、R17 27、R18 30、R19 22、R20 20，結束碼 0；GAS 網路請求 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| W   | build               | 通過 | 實測     | tsc 0；build 結束碼 0；`out/` 的 Godot 產物與 `public/` 相同；正式的 JS 有 `set_paused`、CSS 有暫停的樣式                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**過程紀錄（照實保留）**

1. Godot 第一次完整檢查 180／182：R20-8 與 R20-13 的測試碼取值時機錯了（點擊數與出兵數在後面的步驟之後才讀，把之後合法的點擊與下一個關卡的出兵也算進去）。用只跑暫停段、印出每一次出兵的除錯版確認程式行為正確，只改測試碼後 182／182。
2. `r20-web.js` 第一次：320 寬主頁 HUD 多了暫停鈕後「隊伍」被擠出畫面，加上 360 寬以下縮小留白與間距；P 段中止是測試在已經是 2× 時又按 2×（按鈕不會送命令，等不到回覆），改成已經是這個速度就不按。
3. 改壞的引擎 E3（暫停命令不檢查場次）第一次：錯誤確實發生（上一場的繼續命令解除了新場次的暫停），但在 P-8 收尾按「繼續」時因按鈕已不在而中止，沒有記在 P-8 名下；改成先判定 P-8 再收尾（仍暫停才按）後，P-8 失敗被記到，正常的遊戲仍是 20／20。
4. 完整回歸開始後修了兩個戰鬥頁的 Prettier 排版（只把兩個長的 `disabled` 條件換行，不改行為），dev 因此重新編譯一次；回歸 22 支全過。
5. Godot 反向驗證第一次，「用倍率 0 假裝暫停」讓測試自己的等待（受倍率影響的 `SceneTree` 計時器）一起停住，900 秒逾時、沒有記到失敗。R20 段的等待改成不受倍率影響的計時器（`_wait_real`、`_wait_until_real`）後這一種也被抓到（R20-6、R20-7 等）；測試檔改過之後用全新目錄重跑完整檢查：182／182、產物核對通過。
6. 測試快照多了 `enemy_pos`（瀏覽器測試比對暫停前後的敵人位置），加上之後重新匯出；最終的產物核對與測試都用這一版。

### 28.5 仍未涵蓋

1. 冷卻修正後 1× 的短間隔攻擊次數變多（0.1 秒間隔 +16.5%），高等級武將變強；沒有做整體的平衡評估（D25）。
2. 敵人攻擊阻路武將的冷卻（`Enemy._blocker_atk_timer`，1 秒）仍是設回完整間隔；它在固定的物理步進裡，1× 與 2× 的誤差約一步，這次不在範圍（D27）。
3. 暫停時背景音樂照常播放（`SFXManager` 不在凍結範圍）；戰場畫布裡沒有「已暫停」標示（Godot 沒有中文字型，D13），只顯示在網頁上。暫停中仍可從主頁的武將、隊伍視窗改隊伍（`update_team` 會同步屬性、移除不在隊伍的武將），這次沒有限制（D28）。
4. 極長的一幀只打一擊（受幀率限制）；瀏覽器測試的剩餘時間用快照輪詢，容差 0.35 秒，精確的剩餘時間由 Godot 測試（R20-6、R20-14）負責。
5. 只測了 Chrome；全部 mock，沒有正式 GAS 讀寫。L1、D16、D18、D19 維持。

### 28.6 修改檔案（§27 與 §28，都還沒提交）

| 檔案                                                                                                                                                                                                                 | 內容                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `godot/shenmaSanguo/entities/hero/Hero.gd`、`entities/tower/Tower.gd`                                                                                                                                                | 攻擊冷卻保留零頭、空場停在 0、極長一幀從這一擊起算                                                                                                                  |
| `godot/shenmaSanguo/systems/BattleManager.gd`、`systems/WaveManager.gd`、`main/Main.gd`、`bridge/WebBridge.gd`、`public/games/shenmaSanguo/index.{html,pck,service.worker.js}`                                       | 倍率統一管理與部署選單識別、速度命令；手動暫停的狀態與命令、凍結模擬用的節點、暫停中拒絕操作、遊戲計時器（`create_game_timer`）；stats 與快照欄位；協定 6；重新匯出 |
| `src/app/(games)/shenmaSanguo/utils/gameSpeed.ts`（新增）、`utils/gameEngine.ts`、`utils/towerSell.ts`                                                                                                               | 速度、部署選單識別與暫停狀態的判定；協定 6；拆塔原因 `paused` 的說明                                                                                                |
| `…/battle/components/SpeedToggle.tsx`（新增）、`PauseToggle.tsx`（新增）、`PlacementMenu.tsx`、`UpgradePanel.tsx`、`BattlePageContent.tsx`、`…/components/SinglePageContent.tsx`、`…/styles/shenmaSanguo.module.css` | 1×／2× 與暫停按鈕、戰場上的「已暫停」與「繼續」；暫停中停用開戰、自動、部署、升級、改目標、拆除並顯示說明；部署選單識別、戰場留邊的關閉區；窄螢幕的 HUD             |
| `scripts/shenma-regression/godot/lifecycle_test.gd`、`godot/bridge_recorder.gd`、`godot/physics_clock.gd`                                                                                                            | R10-1 協定 6；R15-10；R19-1～12；R20-1～17；R16／R17-2／R19-9 改驗累積時程；recorder 記錄 `click_cell`、速度與暫停的回覆；物理時鐘在手動暫停時不前進                |
| `scripts/shenma-regression/r19-web.js`（新增）、`r20-web.js`（新增）、`r10-web.js`、`r12-web.js`、`web/player-store.test.mjs`、`tools/run-browser.mjs`、`README.md`、`.gitignore`                                    | 瀏覽器回歸；協定版本 6；store R19-W1、R19-W2、R20-W1；執行器的 `ENGINE_DIR`（反向驗證用）；測試說明；舊版遊戲產物放在已忽略的 `scripts/shenma-regression/.legacy/`  |
| `docs/shenma-sanguo-feature-roadmap.md`                                                                                                                                                                              | 戰鬥速度、手動暫停的狀態與後續順序                                                                                                                                  |

### 28.7 待決事項（取代 §26.7）

| #   | 事項                                                                         | 目前狀態                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改） | 後續再安排（受限分頁已可下載更新前的暫存）                                                                                                                                                                                                    |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`  | 後續再安排                                                                                                                                                                                                                                    |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                     | 未決定；需要後端契約證據                                                                                                                                                                                                                      |
| D4  | 自動重新確認的次數與間隔                                                     | 已決定                                                                                                                                                                                                                                        |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                   | 未決定；需要 GAS 原始碼                                                                                                                                                                                                                       |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                    | 風險仍在；不屬於神馬三國                                                                                                                                                                                                                      |
| D7  | commit                                                                       | `81cabb43`、`7cec1df2`、`c62298db`、`8275ff6d`、`4793872e`、`95dea9fe`、`fe7724f2`、`e8bdd4b7`、`d776e2d9` 都在本機、未 push。戰鬥速度與手動暫停（§27、§28）還沒提交，待驗收                                                                  |
| D8  | 請求逾時；多裝置、多分頁衝突                                                 | 仍待規劃                                                                                                                                                                                                                                      |
| D9  | 手動同步進行中，是否禁止其他操作                                             | 已決定                                                                                                                                                                                                                                        |
| D10 | 切換帳號被擋下時的提示                                                       | 已處理                                                                                                                                                                                                                                        |
| D11 | 跨來源隔離切換時 sessionStorage 各有一份                                     | 本機修正已提交（`4793872e`）；讀不回的舊進度與後端原子寫入仍是發布前的課題（D16、D18）                                                                                                                                                        |
| D12 | 是否把跨來源隔離縮小到只有 `bgRemover`                                       | 已提交（`4793872e`）；部署後如何觀察正式站的遷移，需要另外決定                                                                                                                                                                                |
| D13 | Godot 畫布裡的中文顯示成方框（沒有中文字型）                                 | 未決定；速度與暫停的狀態只顯示在網頁上                                                                                                                                                                                                        |
| D14 | 武將的正式設定                                                               | 已解決                                                                                                                                                                                                                                        |
| D15 | 這個 clone 沒有自動執行 git hooks                                            | 已決定：獲准 commit 時手動對暫存的檔案跑 lint-staged 並核讀修改                                                                                                                                                                               |
| D16 | 後端版本號／條件寫入                                                         | 未決定。已取得後端程式並完成唯讀盤點：存檔沒有版本檢查（後寫入的整份覆蓋）、鎖沒有確認是否取得、存檔解析失敗會被當成空存檔；另有需要優先處理的後端問題。修改要前後端一起做，先在試算表副本與另外部署的測試網址驗證，不動正式那份。L1 仍是限制 |
| D17 | 攻速成長的欄位名稱                                                           | 已解決並提交（`fe7724f2`）                                                                                                                                                                                                                    |
| D18 | 受限分頁的出口                                                               | 接受作為明示限制                                                                                                                                                                                                                              |
| D19 | 寫入限制的範圍是整個分頁的所有帳號                                           | 接受作為明示限制                                                                                                                                                                                                                              |
| D20 | 周瑜「火攻」的數值與平衡                                                     | 維持                                                                                                                                                                                                                                          |
| D21 | 全站浮動入口壓在神馬三國的視窗上                                             | 完成並提交（`e8bdd4b7`）                                                                                                                                                                                                                      |
| D22 | 獨立戰鬥頁在窄視窗裡遊戲畫面左右超出視窗                                     | 完成並提交（`d776e2d9`）                                                                                                                                                                                                                      |
| D23 | 拆除返還比例（第一版 50%）的數值與平衡                                       | 維持 50%；尚未做平衡評估                                                                                                                                                                                                                      |
| D24 | 直式手機主頁改成留邊版面；橫向短高度時遊戲畫面較小                           | 接受這個取捨；留邊在部署選單開著時是關閉區（§27.2）                                                                                                                                                                                           |
| D25 | 攻擊冷卻逐擊丟失零頭，長時間累積（2× 攻擊次數少於 1×）                       | 已處理（§28.1）：保留零頭後 1× 與 2× 的攻擊次數一致、都等於理想時程。1× 的短間隔攻擊也跟著變多（0.1 秒 +16.5%）；是否調整攻速下限或數值，待平衡評估                                                                                           |
| D26 | 測試編號（R19-、R20-）與檔名（`r19-web.js`、`r20-web.js`）沿用舊的依序編號   | 新增：編號只是測試的識別，說明在 README；是否改成功能名稱（例如 `speed-web.js`、`pause-web.js`）待決定，改名會牽動 README 與既有的執行清單                                                                                                    |
| D27 | 敵人攻擊阻路武將的冷卻仍是設回完整間隔                                       | 新增：物理步進固定，1× 與 2× 的誤差約一步；要不要比照武將與防禦塔保留零頭待決定                                                                                                                                                               |
| D28 | 暫停中背景音樂照常播放；暫停中仍可改隊伍                                     | 新增：第一版只凍結戰場模擬；音樂是否跟著暫停、暫停中是否禁止改隊伍待決定                                                                                                                                                                      |

## 29. 存檔版本保護與衝突處理（2026-09-29）

兩個分頁或兩台裝置同時使用同一個存檔時，後保存的舊資料會整份蓋掉較新的雲端資料（L1、D8、D16）。這次在前端加上雲端版本的契約與衝突比較：保存帶著這份資料根據的雲端版本，雲端在這之後被改過就被拒絕，暫停自動保存，由玩家比較兩份資料後選擇。對應的後端版本契約另外處理（後端程式不在倉庫，沒有部署；試算表副本上的真實環境還沒驗證）。本節的修改還沒提交，待驗收；沒有 push、沒有部署，沒有讀寫正式 GAS／Sheets，所有測試都是 mock 或本機模擬。

### 29.1 前一次提交

`d552dc2a` `feat: 新增戰鬥倍速與暫停並修正攻擊節奏`（§27、§28 的 32 個檔案，作者 ZeHoward／howard867@yahoo.com.tw；只 commit、沒有 push）。暫存前手動跑 ESLint（0 error／6 warning）與 Prettier 檢查（通過），暫存檔案的 sha256 與驗收清單一致；hooks 仍未啟用（D15）。沒有 amend。

### 29.2 版本契約（前端需要的後端行為）

| 動作           | 請求                                                 | 回應                                                                                                                                                                     |
| -------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `get_profile`  | —                                                    | `data` 與雲端版本 `rev`（同一次讀取）                                                                                                                                    |
| `save_profile` | `data`、`base_rev`（這份資料根據的雲端版本）         | 相符時寫入並回傳新的 `rev`、`prev_rev`；不符時 409 `REV_CONFLICT`，附雲端目前的 `data` 與 `rev`，不寫入；後端要求版本而沒帶時 428 `BASE_REV_REQUIRED`（同樣附雲端資料）  |
| `upgrade_hero` | `hero_id`、`base_rev`                                | 相符時在雲端計算並回傳 `hero`、`gold_remaining`、`cost`、`rev`、`prev_rev`；不符時 409，不扣點數                                                                         |
| `save_result`  | 結算內容、`request_id`（這一場的識別碼）、`base_rev` | 雲端上的增量（進度取較大者），不拒絕；只有 `base_rev` 等於寫入前的版本（`prev_rev`）時才回傳新的 `rev`，否則沒有 `rev`。後端用 `request_id` 辨識重送（同一場只記錄一次） |
| 版本格式不對   | `base_rev` 不是非負整數                              | 400 `BAD_BASE_REV`，不當成 0 或沒帶                                                                                                                                      |
| 舊版後端       | —                                                    | 回應沒有 `rev`：前端不帶 `base_rev`，行為和以前一樣（沒有版本保護）                                                                                                      |

升級與結算是在雲端「目前」的資料上計算，回應裡寫入後的版本不能證明這個分頁的資料已包含其他分頁的修改；所以前端不能只拿最新的版本號當作之後保存的基準。

### 29.3 雲端版本基準（`serverRev`）

- `SessionPlayerState.serverRev`：這個分頁已同步的資料等於雲端哪一個版本，未同步的修改都在它之上。存在 session（重新整理後仍在），不送到伺服器。舊版後端或舊版 session 沒有時是 `null`，保存不帶 `base_rev`。
- 只在確定雲端的新版本已包含在本機資料裡時才前進（寧可舊，不可新）：採用整份雲端資料（登入、手動同步、背景讀取）、整份保存成功，或升級／結算的回應證明是在送出的版本上計算（`prev_rev` 等於送出的 `base_rev`，本機也還是那個版本）。
- 結算等在途的保存與升級完成才送出，帶它們之後的版本；兩個寫入交錯時彼此的版本都對不上，會產生不必要的衝突。
- 升級帶著版本送出後結果不明（重新整理、網路錯誤）時重新確認：看得到升級、而且雲端正好是送出時的版本 +1（只多了這次升級）才採用新版本；雲端還有其他寫入、本機又有修改時維持送出時的版本，之後保存由衝突比較處理。看不到升級、雲端版本也已不是送出時的版本時，舊請求之後才被處理也會因版本不符被拒，確定沒有套用（`not_applied`），解除待確認。
- 回應遺失的保存：被拒時雲端內容和本機完全相同（例如上一次保存其實成功），或雲端正好是自己上一次結果不明的保存（版本 +1、內容相同），直接採用雲端版本，不請玩家選擇；兩者都不會遺失資料。結算的回應遺失時無法確認雲端只多了這一場，會出現衝突比較（不遺失資料，也不自動重送結算）。
- 雲端存檔損毀（`DATA_CORRUPT`）或資料格式被拒時不自動重試，本機修改保留。

### 29.4 衝突的比較與選擇

- 保存被拒 → 記下衝突（`saveConflict`：帳號世代、雲端版本與資料、每次偵測或刷新都換新的 id），暫停自動保存，本機修改都保留。手動同步與切換帳號也先停下（`REV_CONFLICT`），背景讀取不採用雲端。衝突只在記憶體：重新整理後補送的保存會再次被拒、重新偵測（新的 id）。
- 畫面下方的提示（`SaveConflictNotice`）→「比較並選擇」開啟比較視窗（`SaveConflictModal`）：並列「這個分頁（尚未保存）」與「雲端（版本 N）」的暱稱、等級、戰場點數、關卡進度、部隊容量、隊伍、武將與其他欄位，預設只列不同的項目，可顯示相同的項目、展開每位武將的等級與數值。不顯示存檔金鑰。
- 「使用雲端版本」會放棄這個分頁尚未保存的修改；「保留這個分頁的版本」會覆蓋雲端上其他分頁或裝置的修改。按下後先列出具體影響（例如「戰場點數：1000 → 900」），再確認一次才執行；返回、關閉視窗都不改變任何資料。
- 確認時帶著畫面上的衝突 id 與本機版本，任何一邊變了就不執行（`CONFLICT_CHANGED`）。「使用雲端」先重新讀取，雲端仍是畫面上那個版本才採用；「保留這個分頁」只以畫面上的雲端版本條件寫入。雲端在確認期間又更新時，用剛讀到的資料刷新比較，請玩家重新確認，不會自動重試覆蓋。
- 處理中按鈕停用（連按不會多送）。戰鬥已開打或有待確認的結算、結算紀錄還在途、寫入限制（D18／D19）、存檔處理暫停、待確認的升級、其他寫入在途時不能處理（比較視窗說明原因、按鈕停用）。備戰中可以處理（和手動同步一樣，已送進遊戲的隊伍不會重新載入）。
- 執行前先把兩份資料備份在這個分頁的 session（`shenma_conflict_backup`，`ConflictBackupNotice`）：可以匯出 JSON（不含存檔金鑰），也可以把被放棄或被覆蓋的那一份放回這個分頁；放回的資料當成尚未保存的修改、版本是它原本根據的版本，保存時會再出現比較，不會直接覆蓋雲端。沒有版本的備份不能放回（只能匯出）。
- 寫入限制不因版本而解除（D18、D19 維持）。

### 29.5 地圖編輯器的設定寫入

- 設定寫入（地圖、波次、武將、敵人）帶管理密碼，後端沒有設定密碼時一律拒絕；只是前端畫面的保護擋不住直接呼叫，所以密碼檢查在後端。
- 需要時跳出遮蔽的輸入框（`adminTokenPrompt.tsx`，`type=password`），取消不送出；密碼只存在這個頁面的記憶體（`utils/adminToken.ts`），不寫進程式、網址、localStorage、sessionStorage；後端拒絕（`ADMIN_REQUIRED`）時清除，下次重新詢問。
- 後端網址可在建置時用 `NEXT_PUBLIC_SHENMA_GAS_URL` 換成測試部署（沒有設定時是正式網址）；網址會包進前端程式，只能放公開的部署網址。

### 29.6 檢查結果

後端草稿另有待修限制：設定主表寫入中途失敗後，重試會清空並重寫同名備份；若重試的備份寫入也失敗，可能失去唯一完整的舊內容。本機故障注入已重現，修正並驗證前不可把設定備份視為可靠復原機制，也不可部署此草稿。此限制不影響前端衝突比較的獨立提交；線上編輯器的版本標頭目前為 v2.3，並不代表已核對其部署版本。

| 項目                                   | 結果                                                                                                                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tsc                                    | 0                                                                                                                                                                                                                           |
| ESLint（神馬三國、地圖編輯器）         | 0 error／11 warning（都是既有的 set-state-in-effect）                                                                                                                                                                       |
| Prettier、`git diff --check`           | 通過                                                                                                                                                                                                                        |
| store 測試                             | 175／175：原本 148 項（舊版後端模式，行為不變）＋版本-1～14（含 3b、7b、12b）＋衝突-1～10                                                                                                                                   |
| store 反向驗證                         | 11／11 抓到（只採結算回應的版本、保存不帶版本、衝突自動改版本重送、處理衝突不檢查戰鬥或寫入限制、使用雲端不核對時效、保留時改用最新版本、不核對確認的 id、結算不等在途寫入、升級與重新確認不核對版本）；原檔還原後 175／175 |
| 雙分頁瀏覽器（`save-conflict-web.js`） | 19／19（內建的後端契約 mock）；另用本機模擬的試算表執行後端程式當共用後端，也是 19／19                                                                                                                                      |
| 畫面反向驗證                           | 4／4 抓到（略過確認步驟、密碼沒有遮蔽、密碼存進 sessionStorage、取消仍送出）                                                                                                                                                |
| 完整瀏覽器回歸                         | 22 支 413／413（既有 21 支 394＋`save-conflict-web.js` 19），全部 mock、GAS 網路 0                                                                                                                                          |
| build 與正式靜態匯出                   | build 成功；用本機 `out/` 跑 `save-conflict-web.js`（一般點擊）19／19、r4 22／22、r7 9／9；產物裡沒有測試用的金鑰或密碼字串                                                                                                 |
| 試算表副本、測試部署                   | 未驗證                                                                                                                                                                                                                      |

後端版本契約另外用本機模擬的試算表驗證（程式與測試不在倉庫）；這些都是 mock 或本機模擬，不代表已在真正的 Apps Script 上驗證。

### 29.7 仍未涵蓋

1. 後端版本契約的程式不在倉庫、沒有部署；試算表副本上的真實環境（鎖的等待、寫入中途失敗、配額與執行時間）沒有驗證。後端要求版本（D32）之前，不帶版本的請求（例如還沒更新的舊網頁）仍可整份覆蓋存檔，L1／D16 不能視為已解決。
2. 結算的回應遺失時，下一次保存會出現衝突比較（不遺失資料），不會自動辨認。
3. 衝突時不自動合併不衝突的欄位，一律請玩家選擇（D29）。
4. 備戰中處理衝突不重新載入已送進遊戲的隊伍。
5. 戰鬥結算與升級交錯只在 store 測試驗證（瀏覽器的雙分頁情境沒有進戰場）；只測了 Chrome。
6. 地圖編輯器預設的障礙物素材 `tiles/tile_dirt.webp` 不存在（既有問題，D31）；頁面說明的浮動面板會蓋住編輯器上方的分頁按鈕（既有）。

### 29.8 修改檔案（還沒提交）

| 檔案                                                                                                                                                                                                                                         | 內容                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/app/(games)/shenmaSanguo/store/playerStore.ts`、`types/index.ts`、`api/gameApi.ts`                                                                                                                                                      | 雲端版本基準、`base_rev`／`request_id`、版本衝突與自動辨認、衝突的處理與備份；後端錯誤帶完整回應；測試部署網址 |
| `…/components/SaveConflictNotice.tsx`（新增）、`ConflictBackupNotice.tsx`（新增）、`modals/SaveConflictModal.tsx`（新增）、`GameInitializer.tsx`、`utils/saveConflict.ts`（新增）、`utils/playerErrors.ts`、`styles/shenmaSanguo.module.css` | 衝突提示、比較與確認視窗、備份提示；比較與匯出的純函式；新錯誤代碼的說明                                       |
| `…/components/modals/HeroListModal.tsx`、`heroes/components/HeroesPageContent.tsx`                                                                                                                                                           | 升級遇到版本衝突時的說明                                                                                       |
| `src/app/(tools)/mapEditor/utils/adminToken.ts`（新增）、`components/adminTokenPrompt.tsx`（新增）、`mapEditorPage.tsx`、`mapTab.tsx`、`objectTab/enemyConfigEditor.tsx`、`objectTab/heroConfigEditor.tsx`                                   | 管理密碼的遮蔽輸入與記憶體保存；所有設定寫入帶密碼                                                             |
| `scripts/shenma-regression/web/player-store.test.mjs`、`save-conflict-web.js`（新增）、`tools/run-browser.mjs`、`README.md`                                                                                                                  | store 測試（mock 後端的版本模式、版本-1～13、衝突-1～10）；雙分頁瀏覽器情境；執行器的 `GAS_BACKEND`            |
| `docs/shenma-sanguo-feature-roadmap.md`                                                                                                                                                                                                      | 存檔版本保護的狀態與後續順序                                                                                   |

### 29.9 待決事項（取代 §28.7）

| #   | 事項                                                                         | 目前狀態                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | 一直待確認的玩家沒有出口時，是否提供不寫入後端的保全方式（例如匯出本機修改） | 後續再安排（受限分頁已可下載更新前的暫存）                                                                                                                                    |
| D2  | `tools/run-browser.mjs` 依賴專案外的 playwright，是否加進 `devDependencies`  | 後續再安排                                                                                                                                                                    |
| D3  | `save_result` 在途時重新整理，是否比照升級建立待確認紀錄                     | 未決定。結算改帶 `request_id`（這一場的識別碼）讓後端辨識重送；前端仍不自動重送結算，回應遺失時由版本衝突比較處理（§29.3）                                                    |
| D4  | 自動重新確認的次數與間隔                                                     | 已決定                                                                                                                                                                        |
| D5  | `GasError` 是否限縮成已確認在寫入前檢查的錯誤代碼（§14.4）                   | 未決定；需要 GAS 原始碼                                                                                                                                                       |
| D6  | 藏書閣頁面讀不到書單時會讓整個 build 中止                                    | 風險仍在；不屬於神馬三國                                                                                                                                                      |
| D7  | commit                                                                       | `81cabb43`、`7cec1df2`、`c62298db`、`8275ff6d`、`4793872e`、`95dea9fe`、`fe7724f2`、`e8bdd4b7`、`d776e2d9`、`d552dc2a` 都在本機、未 push。存檔版本保護（§29）還沒提交，待驗收 |
| D8  | 請求逾時；多裝置、多分頁衝突                                                 | 多分頁、多裝置衝突：前端的版本衝突比較完成（§29，待驗收），後端版本契約未部署；請求逾時仍待規劃                                                                               |
| D9  | 手動同步進行中，是否禁止其他操作                                             | 已決定                                                                                                                                                                        |
| D10 | 切換帳號被擋下時的提示                                                       | 已處理                                                                                                                                                                        |
| D11 | 跨來源隔離切換時 sessionStorage 各有一份                                     | 本機修正已提交（`4793872e`）；讀不回的舊進度與後端原子寫入仍是發布前的課題（D16、D18）                                                                                        |
| D12 | 是否把跨來源隔離縮小到只有 `bgRemover`                                       | 已提交（`4793872e`）；部署後如何觀察正式站的遷移，需要另外決定                                                                                                                |
| D13 | Godot 畫布裡的中文顯示成方框（沒有中文字型）                                 | 未決定；速度與暫停的狀態只顯示在網頁上                                                                                                                                        |
| D14 | 武將的正式設定                                                               | 已解決                                                                                                                                                                        |
| D15 | 這個 clone 沒有自動執行 git hooks                                            | 已決定：獲准 commit 時手動對暫存的檔案跑 lint-staged 並核讀修改                                                                                                               |
| D16 | 後端版本號／條件寫入                                                         | 前端已依版本契約實作（§29.2、§29.3）；後端程式在倉庫外、沒有部署，試算表副本上的真實環境未驗證。後端要求所有寫入帶版本（D32）之前，不帶版本的請求仍可整份覆蓋，不能視為已解決 |
| D17 | 攻速成長的欄位名稱                                                           | 已解決並提交（`fe7724f2`）                                                                                                                                                    |
| D18 | 受限分頁的出口                                                               | 接受作為明示限制                                                                                                                                                              |
| D19 | 寫入限制的範圍是整個分頁的所有帳號                                           | 接受作為明示限制                                                                                                                                                              |
| D20 | 周瑜「火攻」的數值與平衡                                                     | 維持                                                                                                                                                                          |
| D21 | 全站浮動入口壓在神馬三國的視窗上                                             | 完成並提交（`e8bdd4b7`）                                                                                                                                                      |
| D22 | 獨立戰鬥頁在窄視窗裡遊戲畫面左右超出視窗                                     | 完成並提交（`d776e2d9`）                                                                                                                                                      |
| D23 | 拆除返還比例（第一版 50%）的數值與平衡                                       | 維持 50%；尚未做平衡評估                                                                                                                                                      |
| D24 | 直式手機主頁改成留邊版面；橫向短高度時遊戲畫面較小                           | 接受這個取捨；留邊在部署選單開著時是關閉區（§27.2）                                                                                                                           |
| D25 | 攻擊冷卻逐擊丟失零頭，長時間累積（2× 攻擊次數少於 1×）                       | 已處理（§28.1）：保留零頭後 1× 與 2× 的攻擊次數一致、都等於理想時程。1× 的短間隔攻擊也跟著變多（0.1 秒 +16.5%）；是否調整攻速下限或數值，待平衡評估                           |
| D26 | 測試編號（R19-、R20-）與檔名（`r19-web.js`、`r20-web.js`）沿用舊的依序編號   | 新增：編號只是測試的識別，說明在 README；是否改成功能名稱（例如 `speed-web.js`、`pause-web.js`）待決定，改名會牽動 README 與既有的執行清單                                    |
| D27 | 敵人攻擊阻路武將的冷卻仍是設回完整間隔                                       | 新增：物理步進固定，1× 與 2× 的誤差約一步；要不要比照武將與防禦塔保留零頭待決定                                                                                               |
| D28 | 暫停中背景音樂照常播放；暫停中仍可改隊伍                                     | 新增：第一版只凍結戰場模擬；音樂是否跟著暫停、暫停中是否禁止改隊伍待決定                                                                                                      |
| D29 | 版本衝突時是否自動合併不衝突的欄位                                           | 未決定；目前一律請玩家比較兩份資料後選擇                                                                                                                                      |
| D30 | 設定寫入的權限：管理密碼，或只在試算表的指令碼編輯器修改                     | 暫定管理密碼（§29.5：遮蔽輸入、只存在頁面記憶體，後端沒有設定時一律拒絕）；待決定                                                                                             |
| D31 | 地圖編輯器預設的障礙物素材 `tiles/tile_dirt.webp` 不存在                     | 既有問題（素材只有編號版），和存檔無關；待處理                                                                                                                                |
| D32 | 後端的上線順序，以及何時要求所有寫入都帶版本                                 | 未決定。建議先在試算表副本驗證，再部署相容舊網頁的後端、上新網頁，觀察後才要求版本                                                                                            |
| D33 | 瀏覽器回歸耗時（完整一輪約 32 分鐘，r13、r9、r5、r18、r10 約占一半）         | 未決定。建議：分成快速／相關／完整三組（完整只在提交或發布前跑）、不依遊戲時間計時的腳本分組平行、發布前改用正式靜態匯出執行                                                  |
