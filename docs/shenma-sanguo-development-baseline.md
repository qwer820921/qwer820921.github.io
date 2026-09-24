# 神馬三國：本機開發與驗證基準

> 建立日期：2026-09-24
> 基準 commit：`a1579e33`（branch `master`）
> 目的：記錄神馬三國（網頁 + Godot 戰鬥）目前可重現的建置、啟動、驗證方式與實測結果，作為後續開發與 Codex 驗證的起點。
> 本輪**沒有修改任何程式碼**，也沒有新增遊戲功能。

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
