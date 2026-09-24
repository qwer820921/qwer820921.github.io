# 神馬三國：本機開發與驗證基準

> 建立日期：2026-09-24
> 基準 commit：`a1579e33`（branch `master`）
> 目的：記錄神馬三國（網頁 + Godot 戰鬥）目前可重現的建置、啟動、驗證方式與實測結果，作為後續開發與 Codex 驗證的起點。
> 本輪**沒有修改任何程式碼**，也沒有新增遊戲功能。
>
> **Round 2 更新（2026-09-24）**：已補齊 Godot 4.6.2 匯出環境、修正 I1～I3 並重新匯出，另建立可重跑的回歸腳本 `scripts/shenma-regression/`，結果見 **§10**。§0～§9 保留 Round 1 當時的紀錄，未改寫。
>
> **Round 3 更新（2026-09-24）**：修正「混合敵人組提前勝利」（R3-1），整波無效時改為拒絕開戰；回歸工具改為任何錯誤都回傳非零、不刪除目錄，並改成核對工作區交付產物（R3-2）。結果見 **§11**。§10 保留 Round 2 當時的紀錄，未改寫。

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
