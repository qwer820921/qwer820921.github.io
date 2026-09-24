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
