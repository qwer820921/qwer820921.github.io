async (page) => {
  // ══════════════════════════════════════════════════════════════
  //  神馬三國回歸測試 harness（Playwright MCP：browser_run_code_unsafe filename）
  //  必須在「新的 browser context、任何 App 頁面導覽之前」執行一次。
  //  - 網路防線：GAS 只放行 PASSTHROUGH 的讀取，其餘一律 abort；GA／AdSense 一律 abort
  //  - 頁面內 mock：覆寫 fetch，GAS 呼叫在頁面內回應（不經網路與 Service Worker）
  //  - 記錄 Godot → Web 的 postMessage（window.__bridgeLog）與主控台錯誤
  //  - 共用輔助函式掛在 page.context().__shenma.H，供各情境腳本使用
  //  - 判定：各腳本以 H.begin() 取得 run，run.check() 累積斷言，run.finish() 產生 allPass；
  //    SCRIPT ERROR、非預期的 console error／pageerror、GAS 打到網路層都會讓 allPass=false
  // ══════════════════════════════════════════════════════════════
  const context = page.context();
  if (context.__shenma) {
    return { error: "此 browser context 已安裝 harness；要重新開始請先 browser_close" };
  }
  const MODE = "mock"; // 改成 "readonly-config" 時只放行 3 支正式靜態設定讀取
  const PASSTHROUGH =
    MODE === "readonly-config"
      ? ["get_heroes_config", "get_enemies_config", "get_all_maps"]
      : [];
  const BASE = "http://localhost:3000";
  const EVIDENCE = ".handoff/evidence/round-03";

  // ── mock 靜態設定：14×11 地圖，第 5 列直線道路，上下兩列建築格 ──
  const ROW = 5;
  const build_zones = [];
  for (let c = 1; c <= 12; c++) {
    build_zones.push([c, ROW - 1]);
    build_zones.push([c, ROW + 1]);
  }
  const pathJson = {
    cols: 14,
    rows: 11,
    paths: { path_a: [[0, ROW], [13, ROW]] },
    spawn: [0, ROW],
    base: [13, ROW],
    build_zones,
    obstacles: [],
    background_texture: "maps/bg_forest.webp",
  };
  const hero = (hero_id, name, image, job) => ({
    hero_id, name, rarity: "orange", cost: 8, job,
    base_atk: 150, base_def: 120, base_hp: 1500,
    attack_range: 1.5, attack_speed: 1.2, upgrade_cost_base: 100,
    atk_growth: 10, def_growth: 8, hp_growth: 100,
    range_growth: 0, atk_spd_growth: 0, image,
  });
  const enemy = (enemy_id, name, hp, speed, image) => ({ enemy_id, name, hp, speed, image });
  const group = (enemy_id, count, interval) => ({ enemy_id, count, interval, path: "path_a" });
  const map = (map_id, name, waves) => ({
    map_id, chapter: 1, name, unlock_stage: map_id, path_json: pathJson,
    waves: waves.map((enemies, i) => ({ wave: i + 1, enemies })),
  });
  const config = {
    heroes: [
      hero("guan_yu", "關羽", "hero_guan_yu.webp", "infantry"),
      hero("zhao_yun", "趙雲", "hero_zhao_yun.webp", "cavalry"),
    ],
    enemies: [
      // A 關：血厚、極慢、出兵間隔長 → 用來卡在「出兵間隔」中切關
      enemy("mock_a_slow", "A 慢兵", 99999, 12, "enemy_siege1.webp"),
      enemy("mock_b_grunt", "B 步兵", 20, 60, "enemy_grunt2.webp"),
      // C 關：極快、打不死 → 很快漏到基地清波，用來命中自動下一波的 1.5 秒窗口
      enemy("mock_c_fast", "C 快騎", 99999, 400, "enemy_cavalry2.webp"),
      enemy("mock_grunt", "步兵", 20, 60, "enemy_grunt1.webp"),
      enemy("mock_rusher", "衝鋒", 99999, 220, "enemy_cavalry1.webp"),
    ],
    maps: [
      map("chapter1_1", "Mock A 慢速出兵", [
        [group("mock_a_slow", 5, 4.0)],
        [group("mock_a_slow", 5, 4.0)],
      ]),
      map("chapter1_2", "Mock B 對照關", [[group("mock_b_grunt", 2, 1.0)]]),
      map("chapter1_3", "Mock C 快速自動", [
        [group("mock_c_fast", 1, 0.5)],
        [group("mock_c_fast", 1, 0.5)],
        [group("mock_c_fast", 1, 0.5)],
      ]),
      map("chapter1_4", "Mock W 勝利兩波", [
        [group("mock_grunt", 3, 1.0)],
        [group("mock_grunt", 3, 1.0)],
      ]),
      map("chapter1_5", "Mock L 失敗關", [[group("mock_rusher", 22, 0.25)]]),
      // R3：整波都無法生成（缺設定、數量 0）→ 必須拒絕開戰，不可直接判勝
      map("chapter1_6", "Mock E 無效波", [[group("mock_missing_config", 1, 1.0), group("mock_b_grunt", 0, 1.0)]]),
      // R3：缺設定的組排在有效組前面 → 3 隻 B 步兵處理完之前不可結算
      map("chapter1_7", "Mock M 混合組", [[group("mock_missing_config", 1, 1.0), group("mock_b_grunt", 3, 1.0)]]),
    ],
  };

  const state = { gasNet: [], blocked: 0, blockedSamples: [], console: [], pageErrors: [] };

  // ── 1. 網路防線（導覽前安裝；context 層級涵蓋 iframe 與 Service Worker 轉發）──
  await context.route("https://script.google.com/**", async (route) => {
    let action = "(unknown)";
    try { action = JSON.parse(route.request().postData() || "{}").action; } catch {}
    const allowed = PASSTHROUGH.includes(action);
    // 記錄是否由 Service Worker 發出（Chromium 才有 serviceWorker()），用來確認 SW 轉發的請求也經過防線
    let fromServiceWorker = false;
    try { fromServiceWorker = !!(route.request().serviceWorker && route.request().serviceWorker()); } catch {}
    state.gasNet.push({ t: Date.now(), action, allowed, fromServiceWorker });
    return allowed ? route.continue() : route.abort("blockedbyclient");
  });
  const BLOCK = /(^|\.)(googletagmanager\.com|google-analytics\.com|googlesyndication\.com|doubleclick\.net|adtrafficquality\.google|googleadservices\.com)$/;
  await context.route(
    (url) => BLOCK.test(url.hostname),
    (route) => {
      state.blocked += 1;
      // run_code 執行環境沒有 URL／setTimeout 等非 ECMAScript 全域物件，改用正規表示式取主機名稱
      const host = (route.request().url().match(/^[a-z]+:\/\/([^/?#]+)/i) || [])[1];
      if (state.blockedSamples.length < 10) state.blockedSamples.push(host);
      return route.abort("blockedbyclient");
    }
  );

  // ── 2. 頁面內 mock 與 Godot 訊息紀錄（只在最上層頁面）──
  await context.addInitScript(({ config, passthrough }) => {
    if (window.top !== window || window.__SHENMA_MOCK_GAS__) return;
    window.__SHENMA_MOCK_GAS__ = true;

    window.__bridgeLog = [];
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (d && typeof d === "object" && d.__godot_bridge === true) {
        window.__bridgeLog.push({ ...d, __t: performance.now() });
      }
    });

    const GAS_PREFIX = "https://script.google.com/";
    const DB_KEY = "__shenma_mock_gas_db";
    const LOG_KEY = "__shenma_mock_gas_log";
    const FAIL_KEY = "__shenma_mock_fail"; // {action: 剩餘失敗次數}，用於注入失敗
    const readJson = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
    const log = (e) => {
      const l = readJson(LOG_KEY, []);
      l.push(e);
      localStorage.setItem(LOG_KEY, JSON.stringify(l));
    };
    const defaultProfile = (nickname) => ({
      nickname: nickname || "旅行者", level: 1, exp: 0, gold: 1000, capacity: 11,
      max_stage: "chapter1_7", heroes: [],
      team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
    });
    const origFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (!url.startsWith(GAS_PREFIX)) return origFetch(input, init);
      let body = {};
      try { body = JSON.parse((init && init.body) || "{}"); } catch {}
      const { action, key, payload } = body;
      if (passthrough.includes(action)) {
        log({ t: Date.now(), action, mode: "real-readonly" });
        return origFetch(input, init);
      }
      const db = readJson(DB_KEY, { profiles: {}, battle_logs: [] });
      const fail = readJson(FAIL_KEY, {});
      let res;
      if (fail[action] > 0) {
        fail[action] -= 1;
        localStorage.setItem(FAIL_KEY, JSON.stringify(fail));
        res = { status: 500, error: "MOCK_INJECTED_FAILURE" };
      } else {
        switch (action) {
          case "get_heroes_config": res = { status: 200, heroes: config.heroes }; break;
          case "get_enemies_config": res = { status: 200, enemies: config.enemies }; break;
          case "get_all_maps": res = { status: 200, maps: config.maps }; break;
          case "get_profile":
            res = db.profiles[key] ? { status: 200, data: db.profiles[key] } : { status: 404, error: "PROFILE_NOT_FOUND" };
            break;
          case "create_profile":
            db.profiles[key] = defaultProfile(payload && payload.nickname);
            res = { status: 200 };
            break;
          case "save_profile": db.profiles[key] = payload.data; res = { status: 200 }; break;
          case "save_result": db.battle_logs.push({ key, ...payload, t: Date.now() }); res = { status: 200 }; break;
          default: res = { status: 400, error: "MOCK_UNSUPPORTED_" + action };
        }
      }
      localStorage.setItem(DB_KEY, JSON.stringify(db)); // 同步寫入：beforeunload keepalive 也會記錄
      log({ t: Date.now(), action, key, mode: "mock", status: res.status });
      await new Promise((r) => setTimeout(r, 150));
      return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
    };
  }, { config, passthrough: PASSTHROUGH });

  // ── 3. 主控台與頁面錯誤（含 Godot iframe 的 SCRIPT ERROR）──
  page.on("console", (m) => {
    const text = m.text();
    if (m.type() === "error" || /SCRIPT ERROR|USER ERROR|USER WARNING/.test(text)) {
      let url = "";
      try { url = (m.location() && m.location().url) || ""; } catch {}
      state.console.push({ t: Date.now(), type: m.type(), text: text.slice(0, 300), url: url.slice(0, 200) });
    }
  });
  // 已知、與遊戲無關的 console error：逐項說明原因，結果中會列出次數，不會默默吞掉
  const hostOf = (u) => (String(u).match(/^[a-z]+:\/\/([^/?#:]+)/i) || [])[1] || "";
  const KNOWN_CONSOLE_NOISE = [
    {
      why: "GA／AdSense 被 harness 的網路防線擋下（BLOCKED_BY_CLIENT，以及 coi-serviceworker 轉發同一請求時的 ERR_FAILED）",
      test: (c) => /^Failed to load resource: net::ERR_(BLOCKED_BY_CLIENT|FAILED)/.test(c.text) && BLOCK.test(hostOf(c.url)),
    },
    {
      why: "next dev（Turbopack）頁面引用了不存在的 chunk src_components_common_*（Round 1 修改前就有，只在 dev 出現，正式 build 不受影響）",
      test: (c) => /^Failed to load resource: the server responded with a status of 404/.test(c.text) &&
        /^http:\/\/localhost:3000\/_next\/static\/chunks\/src_components_common_[0-9a-z_-]+\._\.js$/i.test(c.url),
    },
  ];
  page.on("pageerror", (e) => state.pageErrors.push({ t: Date.now(), text: String(e).slice(0, 300) }));

  // ── 4. 共用輔助函式 ──
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const H = {
    BASE,
    EVIDENCE,
    sleep: (ms) => page.waitForTimeout(ms),
    async shot(p, name) {
      await p.screenshot({ path: `${EVIDENCE}/${name}.png` });
      return `${EVIDENCE}/${name}.png`;
    },
    // 回到不含 App 程式的靜態頁清空資料；keepMockDb=true 時保留 mock 後端資料
    async resetOrigin(p, { keepMockDb = false } = {}) {
      await p.goto(BASE + "/games/shenmaSanguo/index.offline.html");
      return p.evaluate(async (keep) => {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
        const db = localStorage.getItem("__shenma_mock_gas_db");
        localStorage.clear();
        sessionStorage.clear();
        if (keep && db) localStorage.setItem("__shenma_mock_gas_db", db);
        return { unregistered: regs.map((r) => r.scope), cachesDeleted: keys };
      }, keepMockDb);
    },
    async gasLog(p) {
      return p.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_log") || "[]"));
    },
    countActions(entries) {
      const c = {};
      for (const e of entries) c[e.action] = (c[e.action] || 0) + 1;
      return c;
    },
    async waitHud(p, timeout = 120000) {
      await p.waitForFunction(() => document.querySelector('[title="切換關卡"]') !== null, null, { timeout });
    },
    async hud(p) {
      return p.evaluate(() => {
        const t = document.body.innerText;
        const btns = [...document.querySelectorAll("button")];
        const start = btns.find((b) => /^(迎戰|戰鬥中)$/.test(b.innerText.trim()));
        const auto = btns.find((b) => b.innerText.trim() === "自動");
        const m = t.match(/🗺️\s*\n\s*([^\n]+)\n\s*(\d+\/\d+)?/);
        return {
          map: m ? m[1] : null,
          wave: m ? m[2] || null : null,
          startLabel: start ? start.innerText.trim() : null,
          startDisabled: start ? start.disabled : null,
          autoActive: auto ? /hudActionBtnActive/.test(auto.className) : null,
          result: (t.match(/(勝 利|落 敗)[\s\S]{0,40}/) || [null])[0],
          configError: /遊戲設定載入失敗/.test(t),
          loader: t.includes("調兵遣將中"),
        };
      });
    },
    async bridgeLen(p) {
      return p.evaluate(() => (window.__bridgeLog || []).length);
    },
    async bridgeSince(p, idx) {
      return p.evaluate((i) => (window.__bridgeLog || []).slice(i), idx);
    },
    // 等待 idx 之後出現符合 match（全部欄位相等）的 Godot 訊息
    async waitBridge(p, idx, match, timeout = 120000) {
      const h = await p.waitForFunction(
        ({ i, match }) => (window.__bridgeLog || []).slice(i).find((m) => Object.entries(match).every(([k, v]) => m[k] === v)),
        { i: idx, match },
        { timeout, polling: 100 }
      );
      return h.jsonValue();
    },
    // 向 Godot 要一份唯讀狀態快照
    async snapshot(p, timeout = 60000) {
      const id = "snap-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      await p.evaluate(({ sel, id }) => {
        document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
      }, { sel: IFRAME, id });
      const h = await p.waitForFunction(
        (id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id),
        id,
        { timeout, polling: 100 }
      );
      const s = await h.jsonValue();
      delete s.__t;
      delete s.__godot_bridge;
      delete s.type;
      return s;
    },
    // 等待 Godot 遊戲時間前進 seconds 秒（計時器以遊戲時間計算）
    async waitGameTime(p, seconds, timeout = 600000) {
      const t0 = (await H.snapshot(p)).game_time;
      const deadline = Date.now() + timeout;
      for (;;) {
        const s = await H.snapshot(p);
        if (s.game_time - t0 >= seconds) return s;
        if (Date.now() > deadline) throw new Error(`waitGameTime timeout (${seconds}s)`);
        await H.sleep(500);
      }
    },
    async selectStage(p, name) {
      const idx = await H.bridgeLen(p);
      await p.locator('[title="切換關卡"]').click();
      await p.waitForSelector("text=關卡選擇", { timeout: 10000 });
      await p.locator("div", { hasText: new RegExp("^" + name + "$") }).last().click();
      // 新關卡初始化時 BattleManager 會同步一次 wave=0 的狀態
      await H.waitBridge(p, idx, { type: "update_stats", wave: 0, game_state: 1 });
      return idx;
    },
    async iframeRect(p) {
      return p.evaluate((sel) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        return { left: r.left, top: r.top, width: r.width, height: r.height };
      }, IFRAME);
    },
    async dismissSplash(p) {
      const r = await H.iframeRect(p);
      await p.mouse.click(r.left + r.width / 2, r.top + r.height / 2);
      await H.sleep(500);
    },
    async clickCell(p, c, row, cols = 14, rows = 11) {
      const r = await H.iframeRect(p);
      const s = Math.min(r.width / 540, r.height / 720);
      const vx = r.width / s, vy = r.height / s;
      const tile = Math.max(16, Math.floor(Math.min(vx / cols, vy / rows)));
      const ox = (vx - cols * tile) / 2, oy = (vy - rows * tile) / 2;
      await p.mouse.click(r.left + (ox + (c + 0.5) * tile) * s, r.top + (oy + (row + 0.5) * tile) * s);
    },
    async placeTower(p, c, row, name = "弓兵塔") {
      await H.clickCell(p, c, row);
      await p.waitForSelector("text=建築位部署", { timeout: 15000 });
      await p.getByRole("button", { name: new RegExp(name) }).click();
      await H.sleep(300);
    },
    async clickButton(p, name) {
      await p.getByRole("button", { name, exact: true }).click();
    },
    consoleSince(t0) {
      return state.console.filter((c) => c.t >= t0);
    },
    scriptErrorsSince(t0) {
      return state.console.filter((c) => c.t >= t0 && /SCRIPT ERROR/.test(c.text));
    },
    // 開始一次判定：check() 累積斷言；finish() 加上共通防線後回傳 allPass 與失敗原因
    // expectedConsole：本腳本「預期會出現」的 console error（正規表示式陣列），其他一律算失敗
    begin({ expectedConsole = [] } = {}) {
      const t0 = Date.now();
      const gas0 = state.gasNet.length;
      const assertions = [];
      const check = (name, pass, detail) => {
        assertions.push(detail === undefined ? { name, pass: !!pass } : { name, pass: !!pass, detail });
        return !!pass;
      };
      const finish = (extra = {}) => {
        const consoleErrors = state.console.filter((c) => c.t >= t0 && (c.type === "error" || /SCRIPT ERROR|USER ERROR/.test(c.text)));
        const scriptErrors = consoleErrors.filter((c) => /SCRIPT ERROR/.test(c.text));
        const expected = consoleErrors.filter((c) => !/SCRIPT ERROR/.test(c.text) && expectedConsole.some((re) => re.test(c.text)));
        const noise = {};
        const unexpected = consoleErrors.filter((c) => {
          if (scriptErrors.includes(c) || expected.includes(c)) return false;
          const k = KNOWN_CONSOLE_NOISE.find((n) => n.test(c));
          if (k) noise[k.why] = (noise[k.why] || 0) + 1;
          return !k;
        });
        const pageErrors = state.pageErrors.filter((e) => e.t >= t0);
        const gasNetwork = state.gasNet.slice(gas0);
        check("沒有 SCRIPT ERROR", scriptErrors.length === 0, scriptErrors.slice(0, 5));
        check("沒有非預期的 console error", unexpected.length === 0, unexpected.slice(0, 5));
        check("沒有 pageerror", pageErrors.length === 0, pageErrors.slice(0, 5));
        // mock 模式下 GAS 應全部在頁面內回應；出現在網路層代表 mock 被繞過（已攔截），放行則是外洩
        const leaked = gasNetwork.filter((g) => g.allowed && !PASSTHROUGH.includes(g.action));
        check("GAS 沒有外洩（放行的請求只限唯讀白名單）", leaked.length === 0, leaked);
        if (MODE === "mock") check("mock 模式下 GAS 沒有打到網路層", gasNetwork.length === 0, gasNetwork);
        const failures = assertions.filter((a) => !a.pass).map((a) => a.name);
        return {
          allPass: failures.length === 0,
          failures,
          assertions,
          ...extra,
          expectedConsoleErrors: expected.length,
          knownConsoleNoise: noise,
          gasNetwork,
          elapsedSec: Math.round((Date.now() - t0) / 1000),
        };
      };
      return { t0, check, finish };
    },
  };
  context.__shenma = { state, H, MODE, PASSTHROUGH, config };

  // ── 5. 清掉此來源的 Service Worker、快取與儲存（排除舊產物快取）──
  await page.setViewportSize({ width: 540, height: 900 });
  const cleaned = await H.resetOrigin(page);
  return { mode: MODE, passthrough: PASSTHROUGH, cleaned, maps: config.maps.map((m) => `${m.map_id} ${m.name}`) };
}
