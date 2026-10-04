async (page) => {
  // 地圖編輯器：既有地圖的名稱／章節／解鎖條件保存、保存後讀回、地圖資料檢查、素材轉換下載（瀏覽器，mock）
  // - 後端照 update_map_config 的契約：只有頂層的 name／chapter／unlock_stage 會寫進 maps_config 的同名欄（path_json 裡的同名欄位不算）；
  //   沒有送的欄位保留原本的格子（含型別）。只把地圖資訊塞進 path_json 的寫法，重新讀取後名稱不會改變
  // - 地圖資料用正式設定快照（fixtures/map-config-snapshot.json：100 張，6 張完整、1 張缺波次、93 張路線與波次都缺）
  // - 情境：清單未讀取／讀取失敗不是 0 張、篩選與詳細、改三欄→成功→讀回→重新整理後仍相同、只改一欄時其他欄不送、
  //   有意清空、章節錯誤不問密碼不送出、錯誤的管理密碼、結果不明不重送（已套用／沒有送到）、保存成功但讀回失敗的唯讀重試、
  //   讀回期間又改了畫面、尚未保存的波次不被讀回蓋掉、重新讀取清單不換掉草稿、新地圖的草稿、
  //   載入等待中建立新地圖／改了畫面／匯入 JSON 時舊回應不套用（失敗也不顯示）、再按一次載入才取代、
  //   保存回應還沒回來時載入別的地圖或建立新地圖（結果另外列出、不改目前畫面與原值）、
  //   波次保存以讀回的內容為基準（整波空白、有效與空白的組混在一起、保存期間又改、讀回失敗、結果不明、
  //   保存期間切換地圖、管理密碼錯誤）、
  //   儲存波次前確認地圖存在（設定裡沒有→不問密碼不寫入、讀取失敗→只讀重新確認、確認期間換圖或改波次→不送出）、
  //   新增地圖後讀回（建立已保存的基準、讀回失敗、結果不明已套用／沒有送到、同 map_id 已存在、讀回期間修改或換圖）、
//   新版後端保存時再確認地圖（確認後、送出前地圖被刪除→MAP_NOT_FOUND 的中文說明、不留孤兒列；寫入後才不見→已寫入但不算成功、
//   不讀回不重送；重複的 map_id；寫入後確認地圖時發生錯誤→已寫入但不算成功、不說沒有保存），內建模擬後端用 mapCheck 模擬新版契約，GAS_BACKEND 的後端要設 GAS_MAP_CHECK=1 才跑這段、
  //   素材轉換（有效圖片、無效檔案、取消）不加入素材選單、下載的檔案是 WebP；390 寬與矮畫面、鍵盤
  // - 預設用腳本內建的模擬後端；tools/run-browser.mjs 設定 GAS_BACKEND 為提供 setMapTables 等介面的模組時，
  //   改由那個模組處理（例如在模擬試算表上執行真正的後端程式）
  // - 正式靜態匯出（LOCAL_ASSETS=1）時沒有「加入開發素材」，也不會有上傳請求；開發模式另外檢查加入開發素材（攔截請求，不寫檔）
  // 全部虛構資料，測試用密碼
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const TOKEN = "test-map-meta-token-7c1";
  const proc = globalThis.process;
  const fs = proc && proc.getBuiltinModule ? proc.getBuiltinModule("node:fs") : null;
  if (!fs) return { error: "需要 Node 的 fs（用 tools/run-browser.mjs 執行）讀取地圖設定快照" };
  const PROD = proc.env.LOCAL_ASSETS === "1";
  const snap = JSON.parse(fs.readFileSync("scripts/shenma-regression/fixtures/map-config-snapshot.json", "utf8"));

  // 快照 → 試算表（get_all_maps 的空白路線是空白格）
  const emptyPath = (pj) => !pj || (Array.isArray(pj.paths) && pj.paths.length === 0 && !pj.cols);
  const tables = {
    maps: {
      header: ["map_id", "chapter", "name", "unlock_stage", "path_json"],
      rows: snap.maps.map((m) => [m.map_id, m.chapter, m.name, m.unlock_stage, emptyPath(m.path_json) ? "" : JSON.stringify(m.path_json)]),
    },
    waves: {
      header: ["map_id", "wave", "enemy_id", "count", "interval", "path"],
      rows: snap.maps.flatMap((m) => m.waves.flatMap((w) => w.enemies.map((e) => [m.map_id, w.wave, e.enemy_id, e.count, e.interval, e.path]))),
    },
    enemies: { header: snap.columns, rows: snap.enemies.map((e) => snap.columns.map((h) => (e[h] === undefined ? "" : e[h]))) },
  };
  // 沒有地圖的波次列（設定裡沒有 chapter_orphan_probe 這張地圖，波次表卻有 2 波）：新增這個 map_id 後讀回時要說明
  const ORPHAN = "chapter_orphan_probe";
  tables.waves.rows.push([ORPHAN, 1, "grunt_lv1", 3, 1.5, "path_a"], [ORPHAN, 2, "grunt_lv2", 4, 1.5, "path_a"]);

  // ── 後端（內建模擬或 GAS_BACKEND 的模組）──
  const factory = ctx.__shenmaGasBackendFactory;
  const candidate = factory ? factory() : null;
  const node = candidate && typeof candidate.setMapTables === "function" ? candidate : null;
  out.backend = node ? node.kind + ":" + node.file() : "built-in";
  if (node) {
    node.setAdminToken(TOKEN);
    node.setMapTables(tables);
    try {
      await ctx.exposeBinding("__shenmaMapBackend", (_src, body) => node.handle(body));
    } catch {
      /* 同一個 context 已經登記過 */
    }
  }
  await ctx.addInitScript(({ token }) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    const TABLES = "__shenma_mapmeta_tables";
    const LOG = "__shenma_mapmeta_log";
    const CTRL = "__shenma_mapmeta_ctrl";
    const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
    const write = (k, v) => localStorage.setItem(k, JSON.stringify(v));
    window.__mapmetaHeld = [];
    window.__mapmetaHeldSave = [];
    const objs = (t) => t.rows.map((r) => Object.fromEntries(t.header.map((h, i) => [h, r[i] === undefined ? "" : r[i]])));
    const parsePath = (raw) => { try { return raw ? JSON.parse(raw) : { paths: [], spawn: [], base: [] }; } catch { return { paths: [], spawn: [], base: [] }; } };
    const group = (rows) => {
      const m = {};
      rows.forEach((r) => { const w = Number(r.wave); (m[w] = m[w] || []).push({ enemy_id: r.enemy_id, count: Number(r.count), interval: Number(r.interval), path: r.path || "path_a" }); });
      return Object.keys(m).map(Number).sort((a, b) => a - b).map((w) => ({ wave: w, enemies: m[w] }));
    };
    // 內建的模擬後端：update_map_config 只改頂層有送的 name／chapter／unlock_stage（型別照送來的），path_json 存成 JSON 字串
    const builtIn = (body) => {
      const t = read(TABLES, null);
      if (!t) return { status: 500, error: "MOCK_NO_TABLE" };
      const p = body.payload || {};
      const maps = objs(t.maps);
      const waves = objs(t.waves);
      const toMap = (m) => ({ ...m, path_json: parsePath(m.path_json), waves: group(waves.filter((w) => w.map_id === m.map_id)) });
      switch (body.action) {
        case "get_all_maps":
          return { status: 200, maps: maps.map((m) => ({ map_id: m.map_id, chapter: m.chapter, name: m.name, unlock_stage: m.unlock_stage, path_json: parsePath(m.path_json), waves: group(waves.filter((w) => w.map_id === m.map_id)) })) };
        case "get_map_config": {
          const m = maps.find((x) => x.map_id === p.map_id);
          return m ? { status: 200, map: toMap(m) } : { status: 404, error: "MAP_NOT_FOUND" };
        }
        case "get_enemies_config":
          return { status: 200, enemies: objs(t.enemies), columns: t.enemies.header };
        default:
          break;
      }
      if (p.admin_token !== token) return { status: 403, error: "ADMIN_REQUIRED" };
      if (body.action === "update_map_config") {
        if (!p.map_id) return { status: 400, error: "MISSING_MAP_ID" };
        if (!p.path_json || typeof p.path_json !== "object") return { status: 400, error: "MISSING_PATH_JSON" };
        const i = t.maps.rows.findIndex((r) => String(r[0]).trim() === String(p.map_id).trim());
        if (i < 0) return { status: 404, error: "MAP_NOT_FOUND" };
        const set = (c, v) => { const j = t.maps.header.indexOf(c); if (j >= 0) t.maps.rows[i][j] = v === undefined || v === null ? "" : v; };
        set("path_json", JSON.stringify(p.path_json));
        if (p.name !== undefined) set("name", p.name);
        if (p.chapter !== undefined) set("chapter", p.chapter);
        if (p.unlock_stage !== undefined) set("unlock_stage", p.unlock_stage);
        write(TABLES, t);
        return { status: 200, success: true, message: "MAP_UPDATED" };
      }
      if (body.action === "save_waves_config") {
        // 和目前正式後端相同：不檢查地圖是否存在（對不存在的 map_id 也照樣寫入）。
        // 控制旗標 mapCheck 時模擬新版後端：保存時再確認地圖（空白 400、沒有 404、重複 409，零寫入）；
        // mapGoneAfterWrite 是 map_id 時，寫入後把那張地圖從設定刪掉，回 409 MAP_CHANGED_DURING_SAVE（波次已寫入）；
        // mapThrowAfterWrite 是 map_id 時，寫入後確認地圖發生錯誤，回 500 POSTWRITE_CHECK_ERROR（波次已寫入、地圖不變）
        const c = read(CTRL, {});
        const id = String(p.map_id).trim();
        const hits = () => t.maps.rows.filter((r) => String(r[0]).trim() === id).length;
        if (c.mapCheck) {
          if (typeof p.map_id !== "string" || !id) return { status: 400, error: "MISSING_MAP_ID" };
          if (hits() === 0) return { status: 404, error: "MAP_NOT_FOUND", map_id: id, stage: "precheck" };
          if (hits() > 1) return { status: 409, error: "MAP_ID_DUPLICATE", map_id: id, stage: "precheck" };
        }
        t.waves.rows = t.waves.rows.filter((r) => String(r[0]).trim() !== id);
        (p.waves || []).forEach((w) => (w.enemies || []).forEach((e) => t.waves.rows.push([id, w.wave, e.enemy_id, Number(e.count), Number(e.interval), e.path || "path_a"])));
        if (c.mapCheck && c.mapGoneAfterWrite === id) {
          delete c.mapGoneAfterWrite;
          write(CTRL, c);
          t.maps.rows = t.maps.rows.filter((r) => String(r[0]).trim() !== id);
          write(TABLES, t);
          return { status: 409, error: "MAP_CHANGED_DURING_SAVE", reason: "MAP_NOT_FOUND", written: true, map_id: id, stage: "postwrite" };
        }
        if (c.mapCheck && c.mapThrowAfterWrite === id) {
          delete c.mapThrowAfterWrite;
          write(CTRL, c);
          write(TABLES, t);
          return { status: 500, error: "POSTWRITE_CHECK_ERROR", stage: "postwrite", written: true, op_id: "mock-op-postwrite", backup: "_bk_waves_config_mock_postwrite", journal_status: "check_failed", journal_ok: true };
        }
        write(TABLES, t);
        return { status: 200, success: true, message: "WAVES_SAVED" };
      }
      // create_map_config：同一個 map_id 已存在時 409 MAP_ID_EXISTS（不改任何列）；新增一列，章節沒有時是 1、解鎖條件沒有時是空白
      if (body.action === "create_map_config") {
        if (!p.map_id) return { status: 400, error: "MISSING_MAP_ID" };
        if (!p.name) return { status: 400, error: "MISSING_NAME" };
        if (!p.path_json || typeof p.path_json !== "object") return { status: 400, error: "MISSING_PATH_JSON" };
        if (t.maps.rows.some((r) => String(r[0]).trim() === String(p.map_id).trim())) return { status: 409, error: "MAP_ID_EXISTS" };
        const h = t.maps.header;
        const added = h.map(() => "");
        const set = (c, v) => { const j = h.indexOf(c); if (j >= 0) added[j] = v; };
        set("map_id", p.map_id);
        set("name", p.name);
        set("chapter", p.chapter || 1);
        set("unlock_stage", p.unlock_stage || "");
        set("path_json", JSON.stringify(p.path_json));
        t.maps.rows.push(added);
        write(TABLES, t);
        return { status: 200, success: true, message: "MAP_CREATED" };
      }
      return { status: 400, error: "MOCK_UNSUPPORTED_" + body.action };
    };
    const ACTIONS = ["get_all_maps", "get_map_config", "get_enemies_config", "update_map_config", "save_waves_config", "create_map_config"];
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      const mode = localStorage.getItem("__shenma_mapmeta_on");
      if (!mode || !url.startsWith("https://script.google.com/")) return inner(input, init);
      let body = {};
      try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
      if (!ACTIONS.includes(body.action)) return inner(input, init);
      const reply = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      const p = body.payload || {};
      const log = (e) => write(LOG, [...read(LOG, []), { t: Date.now(), action: body.action, ...e }]);
      const ctrl = read(CTRL, {});
      const once = (k) => { const c = read(CTRL, {}); const v = c[k]; delete c[k]; write(CTRL, c); return v; };
      await new Promise((r) => setTimeout(r, 80));
      if (body.action === "get_map_config" && ctrl.holdGet) await new Promise((r) => window.__mapmetaHeld.push(r));
      // 保存的請求暫停在送到後端之前（保存期間切換地圖、建立新地圖、又改了畫面）
      if ((body.action === "update_map_config" || body.action === "save_waves_config") && ctrl.holdSave) await new Promise((r) => window.__mapmetaHeldSave.push(r));
      if (body.action === "get_all_maps" && ctrl.failList) { once("failList"); log({ status: 500, injected: true }); return reply({ status: 500, error: "MOCK_LIST_FAILED" }); }
      // 讀取地圖失敗：failGet 是 1 時後端回 500，是 "network" 時連線失敗（逾時、斷線）
      if (body.action === "get_map_config" && ctrl.failGet) {
        const kind = once("failGet");
        if (kind === "network") { log({ network: "read-failed", injected: true, map_id: p.map_id }); throw new TypeError("Failed to fetch"); }
        log({ status: 500, injected: true, map_id: p.map_id });
        return reply({ status: 500, error: "MOCK_READ_FAILED" });
      }
      // 連線失敗：network 是請求沒有送到後端；applied-network 是後端已處理、回應遺失（地圖用 updateMode、波次用 wavesMode、新增地圖用 createMode）
      let updateMode = null;
      if (body.action === "update_map_config" && ctrl.updateMode) updateMode = once("updateMode");
      if (body.action === "save_waves_config" && ctrl.wavesMode) updateMode = once("wavesMode");
      if (body.action === "create_map_config" && ctrl.createMode) updateMode = once("createMode");
      if (updateMode === "network") { log({ network: "not-sent", map_id: p.map_id }); throw new TypeError("Failed to fetch"); }
      const res = mode === "node" && window.__shenmaMapBackend ? await window.__shenmaMapBackend(body) : builtIn(body);
      const keys = Object.keys(p).filter((k) => k !== "admin_token" && k !== "path_json");
      log({
        status: res.status, error: res.error || null, map_id: p.map_id, hasAdminToken: !!p.admin_token,
        top: Object.fromEntries(keys.map((k) => [k, p[k]])),
        ...(body.action === "update_map_config" ? { pathName: p.path_json && p.path_json.name, applied: res.status === 200 } : {}),
        ...(updateMode ? { network: "applied-then-lost" } : {}),
      });
      if (updateMode === "applied-network") throw new TypeError("Failed to fetch");
      return reply(res);
    };
  }, { token: TOKEN });

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const reqLog = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mapmeta_log") || "[]"));
  const count = async (action) => (await reqLog()).filter((e) => e.action === action).length;
  const lastOf = async (action) => (await reqLog()).filter((e) => e.action === action).pop();
  const setCtrl = (o) => page.evaluate((o) => localStorage.setItem("__shenma_mapmeta_ctrl", JSON.stringify({ ...JSON.parse(localStorage.getItem("__shenma_mapmeta_ctrl") || "{}"), ...o })), o);
  const serverTables = async () => {
    if (node) {
      const t = node.mapTables();
      return { maps: { header: t.maps[0], rows: t.maps.slice(1) }, waves: { header: t.waves[0], rows: t.waves.slice(1) } };
    }
    return page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mapmeta_tables")));
  };
  const row = async (id) => {
    const t = await serverTables();
    const r = t.maps.rows.find((x) => x[0] === id);
    return r ? Object.fromEntries(t.maps.header.map((h, i) => [h, r[i]])) : null;
  };
  const text = (testId) => page.locator(`[data-testid="${testId}"]`).first().innerText().catch(() => "");
  const status = () => text("sheet-status");
  const waitStatus = (re, timeout = 15000) =>
    page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid="sheet-status"]')?.innerText || ""), re.source, { timeout });
  const val = (id) => page.locator(`#map-meta-${id}`).inputValue();
  const fill = (id, v) => page.locator(`#map-meta-${id}`).fill(v);
  const btn = (name) => page.getByRole("button", { name, exact: true });
  const promptVisible = () => page.locator('[data-testid="admin-token-input"]').isVisible().catch(() => false);
  const enterToken = async (t) => {
    await page.locator('[data-testid="admin-token-input"]').waitFor({ timeout: 10000 });
    await page.locator('[data-testid="admin-token-input"]').fill(t);
    await page.locator('[data-testid="admin-token-submit"]').click();
  };
  const update = () => btn("更新至 Sheet").click();
  // MAP_EDITOR_ONLY=<段落名稱,...>：只跑這些段落（定位單一段落用；其他段落記在 out.skippedSections，不算通過）
  const ONLY = String(proc.env.MAP_EDITOR_ONLY || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (ONLY.length) out.onlySections = ONLY;
  const sectionNames = [];
  const section = async (name, fn) => {
    sectionNames.push(name);
    if (ONLY.length && !ONLY.includes(name)) {
      (out.skippedSections = out.skippedSections || []).push(name);
      return;
    }
    try {
      await fn();
    } catch (e) {
      // Playwright 的 call log 前三行只有「等待 locator」，真正的原因（找不到選項、元素不可用等）在後面幾行
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 10).join(" | ") : e).slice(0, 1200));
      try { out[name + "_shot"] = await H.shot(page, `map-editor-save-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };
  // 開新的編輯器頁面（React 狀態與管理密碼都從頭開始），等到按鈕可以操作（水合完成）
  const openEditor = async () => {
    await page.goto(H.BASE + "/mapEditor");
    const b = btn("載入清單");
    await b.waitFor({ timeout: 60000 });
    await page.waitForFunction(() => {
      const el = [...document.querySelectorAll("button")].find((x) => x.textContent === "載入清單");
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactFiber"));
    }, null, { timeout: 60000 });
  };
  const loadList = async () => {
    await btn("載入清單").click();
    await page.waitForFunction(() => /共 \d+ 張|讀取失敗/.test(document.querySelector('[data-testid="map-integrity"]')?.innerText || ""), null, { timeout: 15000 });
  };
  const loadMap = async (id) => {
    await page.locator('[data-testid="sheet-map-select"]').selectOption(id);
    await btn("載入").click();
    await waitStatus(new RegExp(`「${id}」載入成功`));
  };
  const selectInList = (id) => page.locator(`[data-testid="integrity-list"] button`, { hasText: id + " " }).first().click();
  // 暫停中的請求：讀取地圖（holdGet）與保存（holdSave）
  const waitHeld = (k) => page.waitForFunction((k) => (window[k] || []).length > 0, k, { timeout: 10000 });
  const releaseGets = () => page.evaluate(() => window.__mapmetaHeld.splice(0).forEach((r) => r()));
  const releaseSaves = () => page.evaluate(() => window.__mapmetaHeldSave.splice(0).forEach((r) => r()));
  const aside = () => text("sheet-status-aside");
  const waitAside = (re, timeout = 15000) =>
    page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid="sheet-status-aside"]')?.innerText || ""), re.source, { timeout });
  const dirtyText = async () => ((await page.locator('[data-testid="integrity-dirty"]').count()) ? text("integrity-dirty") : "");
  // keep：勾選「沿用目前波次」（預設不勾選）
  const newMap = async (id, name, keep = false) => {
    await btn("＋ 新增地圖").click();
    const inputs = page.locator('[class*="modal"] input');
    await inputs.nth(0).fill(id);
    await inputs.nth(1).fill(name);
    if (keep) await page.locator('[data-testid="new-keep-waves"]').check();
    await btn("確定").click();
  };
  // 波次：畫面上每一波的標題與每一組（敵人、數量），試算表裡這張地圖的列（波次、敵人、數量）
  const waveText = () => text("wave-status");
  const waitWave = (re, timeout = 15000) =>
    page.waitForFunction((src) => new RegExp(src).test(document.querySelector('[data-testid="wave-status"]')?.innerText || ""), re.source, { timeout });
  const screenWaves = () => page.locator('[data-testid="wave-item"]').evaluateAll((items) => items.map((w) => ({
    title: w.querySelector("span")?.textContent || "",
    rows: [...w.querySelectorAll("tbody tr")].map((tr) => { const f = tr.querySelectorAll("select, input"); return [f[0]?.value ?? null, Number(f[1]?.value)]; }),
  })));
  const serverWaves = async (id) => (await serverTables()).waves.rows.filter((r) => String(r[0]) === id).map((r) => [Number(r[1]), r[2], Number(r[3])]);
  const waveItem = (wi) => page.locator('[data-testid="wave-item"]').nth(wi);
  // 一組的敵人欄（第一格）：敵人設定讀完之前是文字輸入框，讀完才換成下拉；同一列的「路徑」也是下拉，不能用「這列第一個 select」
  const enemyCell = (wi, ei) => waveItem(wi).locator("tbody tr").nth(ei).locator("td").first();
  const addWave = async () => {
    const n = await page.locator('[data-testid="wave-item"]').count();
    await btn("＋ 新增波次").click();
    await enemyCell(n, 0).locator("select").waitFor({ timeout: 10000 });
  };
  const addEnemyTo = (wi) => waveItem(wi).getByRole("button", { name: "＋ 新增敵人" }).click();
  const setEnemy = (wi, ei, id) => enemyCell(wi, ei).locator("select").selectOption(id);
  const setCount = (wi, ei, n) => waveItem(wi).locator("tbody tr").nth(ei).locator('input[type="number"]').first().fill(String(n));
  const saveWaves = () => btn("儲存波次至 Sheet").click();

  // 每次開始用新的資料表與紀錄（同一個頁面來源）
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(H.BASE + H.GAME_DIR + "index.offline.html");
  await page.evaluate(({ tables, mode }) => {
    localStorage.setItem("__shenma_mapmeta_tables", JSON.stringify(tables));
    localStorage.setItem("__shenma_mapmeta_log", "[]");
    localStorage.setItem("__shenma_mapmeta_ctrl", "{}");
    localStorage.setItem("__shenma_mapmeta_on", mode);
  }, { tables, mode: node ? "node" : "builtin" });

  // ── 1. 還沒讀取、讀取失敗都不是 0 張；重試後顯示正式快照的統計 ──
  await section("list", async () => {
    await openEditor();
    const idle = await text("integrity-state");
    await setCtrl({ failList: 1 });
    await loadList();
    const failed = await text("integrity-state");
    const summaryWhileFailed = await page.locator('[data-testid="integrity-summary"]').count();
    await H.shot(page, "map-editor-save-list-failed");
    run.check("資料檢查-1 還沒讀取清單時說明要先讀取；讀取失敗時說明失敗、不是 0 張，沒有顯示統計",
      /還沒讀取地圖清單/.test(idle) && !/0 張/.test(idle) && /讀取失敗/.test(failed) && /不是 0 張/.test(failed) && summaryWhileFailed === 0,
      { idle, failed, summaryWhileFailed });
    await page.getByRole("button", { name: "重新讀取清單" }).click();
    await page.waitForSelector('[data-testid="integrity-summary"]', { timeout: 15000 });
    const summary = await text("integrity-summary");
    const filters = await page.getByRole("group", { name: "依資料狀態篩選地圖" }).locator("button").allInnerTexts();
    const items = await page.locator('[data-testid="integrity-list"] button').count();
    run.check("資料檢查-2 重試成功：共 100 張、資料完整 6、待補資料 94（有路線缺波次 1、路線與波次都缺 93）；篩選按鈕的數字相同，清單列出 100 張",
      summary === "共 100 張：資料完整 6、待補資料 94（有路線缺波次 1、路線與波次都缺 93）" && same(filters, ["全部 100", "資料完整 6", "待補資料 94"]) && items === 100,
      { summary, filters, items });
  });

  // ── 2. 篩選與詳細 ──
  await section("filter", async () => {
    const group = page.getByRole("group", { name: "依資料狀態篩選地圖" });
    await group.getByRole("button", { name: "資料完整 6" }).click();
    const complete = await page.locator('[data-testid="integrity-list"] button').evaluateAll((els) => els.map((e) => [e.textContent, e.getAttribute("data-kind")]));
    const pressed = await group.getByRole("button", { name: "資料完整 6" }).getAttribute("aria-pressed");
    await group.getByRole("button", { name: "待補資料 94" }).click();
    const incomplete = await page.locator('[data-testid="integrity-list"] button').evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
    run.check("資料檢查-3 篩選「資料完整」只列出 chapter1_1～1_6（按鈕 aria-pressed）；「待補資料」列出 94 張（1 張缺波次、93 張都缺）",
      complete.length === 6 && complete.every(([t, k]) => k === "complete" && /^chapter1_[1-6] /.test(t)) && pressed === "true" &&
        incomplete.length === 94 && incomplete.filter((k) => k === "waves").length === 1 && incomplete.filter((k) => k === "both").length === 93,
      { complete, pressed, kinds: { waves: incomplete.filter((k) => k === "waves").length, both: incomplete.filter((k) => k === "both").length } });
    const nameBefore = await val("name");
    await selectInList("chapter1_7");
    const d17 = await text("integrity-selected");
    await selectInList("chapter1_8");
    const d18 = await text("integrity-selected");
    await group.getByRole("button", { name: "全部 100" }).click();
    await selectInList("chapter1_6");
    const waves16 = await page.locator('[data-testid="integrity-selected"] [data-testid="integrity-waves"] > li').evaluateAll((els) => els.map((e) => e.getAttribute("data-rejected")));
    const d16 = await text("integrity-selected");
    const selectValue = await page.locator('[data-testid="sheet-map-select"]').inputValue();
    const nameAfter = await val("name");
    await H.shot(page, "map-editor-save-detail");
    run.check("資料檢查-4 選 chapter1_7：缺波次（沒有波次資料）；chapter1_8：缺路線與波次；chapter1_6：資料完整、9 波都有可出兵的組。選取只改「要載入的地圖」，不換掉編輯中的畫面",
      /缺波次/.test(d17) && /沒有波次資料/.test(d17) && /缺路線與波次/.test(d18) && /沒有可用的路線、沒有波次資料/.test(d18) &&
        /資料完整/.test(d16) && waves16.length === 9 && waves16.every((r) => r === "0") && selectValue === "chapter1_6" && nameAfter === nameBefore,
      { d17: d17.slice(0, 120), d18: d18.slice(0, 120), waves16, selectValue, nameBefore, nameAfter });
    const note = await page.locator('[data-testid="map-integrity"]').innerText();
    run.check("資料檢查-5 說明「資料完整」和玩家是否已解鎖無關、不保證每一波都能出兵或過關",
      /和玩家是否已解鎖無關/.test(note) && /不保證每一波都能出兵或過關/.test(note), note.slice(-120));
  });

  // ── 3. 改三欄 → 保存 → 讀回 → 重新整理後仍相同 ──
  await section("save", async () => {
    await loadMap("chapter1_2");
    const loaded = [await val("name"), await val("chapter"), await val("unlock_stage")];
    await fill("name", "桃園結義（改）");
    await fill("chapter", "2");
    await fill("unlock_stage", "chapter1_3");
    const before = await count("update_map_config");
    await update();
    await enterToken(TOKEN);
    await waitStatus(/已保存[^，]*重新讀回|讀回的內容和送出的不同|失敗/);
    const saveMsg = await status();
    const upd = await lastOf("update_map_config");
    const r = await row("chapter1_2");
    // 清單重新讀取完成（沒有完成時由下面的斷言列出）
    await page.waitForFunction(() => /桃園結義（改）/.test(document.querySelector('[data-testid="integrity-list"]')?.innerText || ""), null, { timeout: 10000 }).catch(() => {});
    const gets = (await reqLog()).filter((e) => e.action === "get_map_config" && e.t >= upd.t).length;
    const lists = (await reqLog()).filter((e) => e.action === "get_all_maps" && e.t >= upd.t).length;
    const option = await page.locator('[data-testid="sheet-map-select"] option[value="chapter1_2"]').innerText();
    const inputs = [await val("name"), await val("chapter"), await val("unlock_stage")];
    const dirty = await page.locator('[data-testid="integrity-dirty"]').count();
    await H.shot(page, "map-editor-save-saved");
    run.check("保存-1 載入 chapter1_2 顯示原值（桃園結義、1、chapter1_1）；改三欄後更新：名稱、章節（數字 2）、解鎖條件放在頂層送出，試算表的同名欄改成新值",
      same(loaded, ["桃園結義", "1", "chapter1_1"]) && (await count("update_map_config")) === before + 1 && /已保存並重新讀回，畫面和設定一致/.test(saveMsg) &&
        same(upd.top, { map_id: "chapter1_2", name: "桃園結義（改）", chapter: 2, unlock_stage: "chapter1_3" }) &&
        r.name === "桃園結義（改）" && r.chapter === 2 && r.unlock_stage === "chapter1_3",
      { loaded, saveMsg, upd, r: { name: r.name, chapter: r.chapter, unlock_stage: r.unlock_stage } });
    run.check("保存-2 成功後只讀地重新讀回這張地圖與清單：畫面和設定一致，清單與選單顯示新名稱，沒有尚未保存的提示",
      gets >= 1 && lists >= 1 && /桃園結義（改）/.test(option) && same(inputs, ["桃園結義（改）", "2", "chapter1_3"]) && dirty === 0,
      { gets, lists, option, inputs, dirty });
    // 重新整理（新的頁面狀態）後再載入
    await openEditor();
    await loadList();
    await loadMap("chapter1_2");
    const again = [await val("name"), await val("chapter"), await val("unlock_stage")];
    run.check("保存-3 重新整理後重新讀取清單並載入，名稱、章節、解鎖條件仍是保存的值",
      same(again, ["桃園結義（改）", "2", "chapter1_3"]), again);
  });

  // ── 4. 只改一欄：其他欄不送、型別不變；有意清空 ──
  await section("partial", async () => {
    await fill("name", "桃園結義（再改）");
    await update();
    await enterToken(TOKEN); // 重新整理後要重新輸入
    await waitStatus(/已保存並重新讀回/);
    const upd = await lastOf("update_map_config");
    const r = await row("chapter1_2");
    run.check("保存-4 只改名稱：只送 name（沒有 chapter、unlock_stage）；試算表的章節仍是數字 2、解鎖條件不變",
      same(Object.keys(upd.top).sort(), ["map_id", "name"]) && r.name === "桃園結義（再改）" && r.chapter === 2 && typeof r.chapter === "number" && r.unlock_stage === "chapter1_3",
      { top: upd.top, r: { name: r.name, chapter: r.chapter, t: typeof r.chapter, unlock_stage: r.unlock_stage } });
    await fill("unlock_stage", "");
    await update();
    await waitStatus(/已保存並重新讀回/);
    const upd2 = await lastOf("update_map_config");
    const r2 = await row("chapter1_2");
    run.check("保存-5 有意清空解鎖條件：送出空字串（不補值），試算表的格子變成空白，讀回後輸入框是空白",
      same(upd2.top, { map_id: "chapter1_2", unlock_stage: "" }) && r2.unlock_stage === "" && (await val("unlock_stage")) === "",
      { top: upd2.top, unlock: r2.unlock_stage });
  });

  // ── 5. 章節錯誤：留在畫面、不問密碼、不送出 ──
  await section("chapter", async () => {
    const before = await count("update_map_config");
    const results = [];
    for (const bad of ["2abc", "0", "", "1.5"]) {
      await fill("chapter", bad);
      await update();
      await page.waitForSelector('[data-testid="map-meta-chapter-error"]', { timeout: 5000 });
      results.push({
        bad,
        error: await text("map-meta-chapter-error"),
        invalid: await page.locator("#map-meta-chapter").getAttribute("aria-invalid"),
        prompt: await promptVisible(),
        status: await status(),
      });
    }
    await H.shot(page, "map-editor-save-chapter-error");
    const after = await count("update_map_config");
    await fill("chapter", "2");
    const cleared = await page.locator('[data-testid="map-meta-chapter-error"]').count();
    run.check("保存-6 章節填 2abc、0、空白、1.5：錯誤留在畫面（aria-invalid），不跳管理密碼、不送出；改回後錯誤消失",
      results.every((x) => /1 以上的整數/.test(x.error) && x.invalid === "true" && !x.prompt && /沒有送出/.test(x.status)) && after === before && cleared === 0,
      { results, before, after, cleared });
  });

  // ── 6. 錯誤的管理密碼 ──
  await section("token", async () => {
    await openEditor();
    await loadList();
    await loadMap("chapter1_3");
    const orig = await row("chapter1_3");
    await fill("name", "密碼錯誤時的名稱");
    const gets0 = await count("get_map_config");
    await update();
    await enterToken("wrong-map-token");
    await waitStatus(/管理密碼不正確/);
    const upd = await lastOf("update_map_config");
    const r = await row("chapter1_3");
    const gets1 = await count("get_map_config");
    run.check("保存-7 錯誤的管理密碼：後端拒絕（403），試算表沒有改變、沒有讀回，畫面保留修改",
      upd.status === 403 && r.name === orig.name && gets1 === gets0 && (await val("name")) === "密碼錯誤時的名稱",
      { upd, name: r.name, gets0, gets1 });
    await update();
    await enterToken(TOKEN);
    await waitStatus(/已保存並重新讀回/);
    run.check("保存-8 重新輸入正確的密碼後保存成功", (await row("chapter1_3")).name === "密碼錯誤時的名稱");
  });

  // ── 7. 結果不明：不自動重送，唯讀確認 ──
  await section("unknown", async () => {
    const before = await count("update_map_config");
    await setCtrl({ updateMode: "applied-network" });
    await fill("name", "已套用但回應遺失");
    await update();
    await waitStatus(/無法確定是否已保存/);
    const msg = await status();
    const retryShown = await page.locator('[data-testid="map-readback-retry"]').isVisible();
    await H.sleep(800);
    const sent = (await count("update_map_config")) - before;
    await page.locator('[data-testid="map-readback-retry"]').click();
    await waitStatus(/讀回確認/);
    const confirm = await status();
    const sent2 = (await count("update_map_config")) - before;
    run.check("保存-9 寫入已套用但回應遺失：顯示「無法確定是否已保存」與唯讀的重新讀回，不自動重送；讀回後確認和送出的相同、已保存",
      /不會自動重送/.test(msg) && retryShown && sent === 1 && sent2 === 1 && /相同，這次更新已保存/.test(confirm) && (await row("chapter1_3")).name === "已套用但回應遺失",
      { msg, retryShown, sent, sent2, confirm });
    await setCtrl({ updateMode: "network" });
    await fill("name", "沒有送到的名稱");
    const before2 = await count("update_map_config");
    await update();
    await waitStatus(/無法確定是否已保存/);
    await page.locator('[data-testid="map-readback-retry"]').click();
    await waitStatus(/讀回確認/);
    const notSaved = await status();
    const kept = await val("name");
    const dirty = await text("integrity-dirty");
    await H.shot(page, "map-editor-save-unknown-not-applied");
    run.check("保存-10 請求沒有送到：讀回確認設定和送出的不同、這次更新沒有生效；畫面保留修改並標示尚未保存，沒有重送",
      /不同，這次更新沒有生效/.test(notSaved) && kept === "沒有送到的名稱" && /地圖有尚未保存的修改/.test(dirty) &&
        (await count("update_map_config")) === before2 + 1 && (await row("chapter1_3")).name === "已套用但回應遺失",
      { notSaved, kept, dirty });
  });

  // ── 8. 保存成功但讀回失敗：唯讀重試 ──
  await section("readback", async () => {
    const before = await count("update_map_config");
    await setCtrl({ failGet: 1 });
    await fill("chapter", "3");
    await update();
    await waitStatus(/重新讀回失敗/);
    const msg = await status();
    const r = await row("chapter1_3");
    await page.locator('[data-testid="map-readback-retry"]').click();
    await waitStatus(/已保存並重新讀回/);
    run.check("保存-11 保存成功但讀回失敗：說明「已保存、讀回失敗」，試算表已是新值；按重新讀回（只讀）後成功，沒有重送寫入",
      /已保存（後端回報成功），但重新讀回失敗/.test(msg) && r.chapter === 3 && (await count("update_map_config")) === before + 1 && (await val("chapter")) === "3",
      { msg, chapter: r.chapter });
  });

  // ── 9. 讀回期間又改了畫面 ──
  await section("edit-during", async () => {
    await setCtrl({ holdGet: true });
    await fill("name", "保存時的名稱");
    await update();
    await page.waitForFunction(() => window.__mapmetaHeld.length > 0, null, { timeout: 10000 });
    await fill("name", "保存期間又改的名稱");
    await setCtrl({ holdGet: false });
    await page.evaluate(() => window.__mapmetaHeld.splice(0).forEach((r) => r()));
    await waitStatus(/保存期間你又改了畫面/);
    const kept = await val("name");
    const dirty = await text("integrity-dirty");
    run.check("保存-12 讀回期間又改了名稱：讀回不蓋掉修改（畫面保留、標示尚未保存）；試算表是保存時的名稱",
      kept === "保存期間又改的名稱" && /地圖有尚未保存的修改/.test(dirty) && (await row("chapter1_3")).name === "保存時的名稱",
      { kept, dirty });
  });

  // ── 10. 尚未保存的波次不被讀回蓋掉；草稿檢查；重新讀取清單不換掉草稿 ──
  await section("waves", async () => {
    await loadMap("chapter1_7");
    const draft0 = await text("integrity-draft-detail");
    await page.getByRole("button", { name: "＋ 新增波次" }).click();
    const sel = page.locator("table select").first();
    await sel.waitFor({ timeout: 10000 });
    await sel.selectOption("grunt_lv1");
    const draft1 = await text("integrity-draft-detail");
    const dirty1 = await text("integrity-dirty");
    const listItem = await page.locator('[data-testid="integrity-list"] button[data-kind]', { hasText: "chapter1_7 " }).getAttribute("data-kind");
    await fill("name", "汜水關（改）");
    await update();
    await enterToken(TOKEN).catch(() => {}); // 這個頁面已經輸入過時不會再問
    await waitStatus(/已保存並重新讀回/);
    const wavesAfter = await page.locator("table tbody tr").count();
    const dirty2 = await text("integrity-dirty");
    await H.shot(page, "map-editor-save-unsaved-waves");
    run.check("草稿-1 chapter1_7 載入後草稿是缺波次；畫面上加一波（普通兵LV1）後草稿檢查是資料完整、標示波次尚未保存，清單仍是設定裡的缺波次",
      /缺波次/.test(draft0) && /資料完整/.test(draft1) && /共 5 隻/.test(draft1) && /波次有尚未保存的修改/.test(dirty1) && /分別保存/.test(dirty1) && listItem === "waves",
      { draft0: draft0.slice(0, 80), draft1: draft1.slice(0, 120), dirty1, listItem });
    run.check("草稿-2 保存地圖資訊後的讀回不蓋掉尚未保存的波次（仍是 1 組、仍標示波次尚未保存）",
      wavesAfter === 1 && /波次有尚未保存的修改/.test(dirty2) && !/地圖有尚未保存的修改/.test(dirty2), { wavesAfter, dirty2 });
    // 重新讀取清單不換掉草稿
    await fill("name", "清單重讀時的草稿");
    await loadList();
    const kept = await val("name");
    const wavesKept = await page.locator("table tbody tr").count();
    run.check("草稿-3 有尚未保存的修改時重新讀取清單：名稱與波次的草稿都沒有被換掉", kept === "清單重讀時的草稿" && wavesKept === 1, { kept, wavesKept });
    // 保存波次後清單更新
    await page.getByRole("button", { name: "儲存波次至 Sheet" }).click();
    await page.waitForFunction(() => /波次儲存成功/.test(document.body.innerText), null, { timeout: 15000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="integrity-list"] button[data-kind="complete"]') && [...document.querySelectorAll('[data-testid="integrity-list"] button')].some((b) => b.textContent.startsWith("chapter1_7 ") && b.getAttribute("data-kind") === "complete"), null, { timeout: 15000 });
    const dirty3 = await page.locator('[data-testid="integrity-dirty"]').innerText().catch(() => "");
    run.check("草稿-4 儲存波次後清單重新讀取：chapter1_7 變成資料完整（模擬資料），波次不再標示尚未保存",
      !/波次有尚未保存的修改/.test(dirty3), { dirty3 });
  });

  // ── 11. 新地圖的草稿 ──
  await section("new-map", async () => {
    await page.getByRole("button", { name: "＋ 新增地圖" }).click();
    const inputs = page.locator('[class*="modal"] input');
    await inputs.nth(0).fill("chapter_test_new");
    await inputs.nth(1).fill("測試新地圖");
    await page.getByRole("button", { name: "確定" }).click();
    const draft = await text("integrity-draft");
    run.check("草稿-5 新地圖：草稿標示不是從設定載入、路線與波次的檢查照畫面（缺路線）",
      /不是從設定載入的地圖/.test(draft) && /缺路線/.test(draft), draft.slice(0, 200));
  });

  // ── 12. 載入等待中：新地圖、畫面上的修改、匯入都不被較慢的舊回應蓋掉 ──
  await section("stale-load", async () => {
    await openEditor();
    await loadList();
    await loadMap("chapter1_1");
    const select = page.locator('[data-testid="sheet-map-select"]');
    // (a) 等待中建立新地圖
    await setCtrl({ holdGet: true });
    await select.selectOption("chapter1_2");
    await btn("載入").click();
    await waitHeld("__mapmetaHeld");
    await newMap("chapter_review_new", "較新的草稿");
    const msgNew = await status();
    await setCtrl({ holdGet: false });
    await releaseGets();
    await H.sleep(600);
    const a = { id: await val("map_id"), name: await val("name"), status: await status(), aside: await aside(), draft: await text("integrity-draft"), loadEnabled: await btn("載入").isEnabled() };
    await H.shot(page, "map-editor-save-stale-load-new");
    run.check("載入-1 載入 chapter1_2 等待中建立新地圖：舊回應回來後仍是新地圖（chapter_review_new／較新的草稿），狀態說明先前的載入已取消、沒有「載入成功」；新地圖標示不是從設定載入；載入按鈕可以再按",
      a.id === "chapter_review_new" && a.name === "較新的草稿" && /已建立新地圖「chapter_review_new」/.test(msgNew) && /「chapter1_2」的載入已取消/.test(a.status) &&
        !/載入成功/.test(a.status + a.aside) && /不是從設定載入的地圖/.test(a.draft) && a.loadEnabled,
      { msgNew, ...a, draft: a.draft.slice(0, 60) });

    // (b) 等待中改了名稱、加了一波
    await loadMap("chapter1_1");
    await setCtrl({ holdGet: true });
    await select.selectOption("chapter1_2");
    await btn("載入").click();
    await waitHeld("__mapmetaHeld");
    await fill("name", "載入等待中新增的編輯");
    await addWave();
    const wavesBefore = await screenWaves();
    await setCtrl({ holdGet: false });
    await releaseGets();
    await waitStatus(/「chapter1_2」(已讀到|載入成功)/);
    const b = { id: await val("map_id"), name: await val("name"), waves: await screenWaves(), status: await status(), dirty: await dirtyText() };
    await H.shot(page, "map-editor-save-stale-load-edits");
    run.check("載入-2 載入等待中改了名稱、加了一波：回應回來後不套用（仍是 chapter1_1，名稱與 4 波都保留），說明已讀到但為了保留修改沒有套用、不是「載入成功」；標示地圖與波次尚未保存",
      b.id === "chapter1_1" && b.name === "載入等待中新增的編輯" && same(b.waves, wavesBefore) && b.waves.length === 4 && /沒有套用/.test(b.status) && !/載入成功/.test(b.status) &&
        /地圖有尚未保存的修改/.test(b.dirty) && /波次有尚未保存的修改/.test(b.dirty),
      { ...b, waves: b.waves.length });

    // (c) 使用者再按一次載入：照選擇換成 chapter1_2，說明尚未保存的內容被取代
    const r12 = await row("chapter1_2");
    await loadMap("chapter1_2");
    const c = { id: await val("map_id"), name: await val("name"), waves: (await screenWaves()).length, status: await status(), dirty: await dirtyText() };
    run.check("載入-3 再按一次載入：換成 chapter1_2（名稱是設定裡的值、3 波），說明原本畫面上尚未保存的內容已被取代；沒有尚未保存的提示",
      c.id === "chapter1_2" && c.name === r12.name && c.waves === 3 && /尚未保存的內容已被取代/.test(c.status) && c.dirty === "", c);

    // (d) 等待中匯入 JSON
    await setCtrl({ holdGet: true });
    await select.selectOption("chapter1_1");
    await btn("載入").click();
    await waitHeld("__mapmetaHeld");
    await page.getByPlaceholder("貼上 JSON 進行匯入...").fill(JSON.stringify({ map_id: "chapter_import_new", name: "匯入的草稿", chapter: 1, cols: 6, rows: 4, paths: { path_a: [[0, 0], [5, 0]] } }));
    await btn("匯入").click();
    const msgImport = await status();
    await setCtrl({ holdGet: false });
    await releaseGets();
    await H.sleep(600);
    const d = { id: await val("map_id"), name: await val("name"), status: await status(), aside: await aside() };
    run.check("載入-4 載入 chapter1_1 等待中匯入 JSON：舊回應回來後仍是匯入的 chapter_import_new，狀態說明先前的載入已取消、沒有「載入成功」",
      d.id === "chapter_import_new" && d.name === "匯入的草稿" && /匯入成功：「chapter_import_new」/.test(msgImport) && /「chapter1_1」的載入已取消/.test(d.status) && !/載入成功/.test(d.status + d.aside),
      { msgImport, ...d });

    // (e) 等待中建立新地圖，舊的載入之後失敗
    await setCtrl({ holdGet: true, failGet: 1 });
    await select.selectOption("chapter1_3");
    await btn("載入").click();
    await waitHeld("__mapmetaHeld");
    await newMap("chapter_review_new2", "失敗前建立的草稿");
    await setCtrl({ holdGet: false });
    await releaseGets();
    await page.waitForFunction(() => !JSON.parse(localStorage.getItem("__shenma_mapmeta_ctrl") || "{}").failGet, null, { timeout: 10000 });
    await H.sleep(400);
    const e = { id: await val("map_id"), name: await val("name"), status: await status(), aside: await aside() };
    run.check("載入-5 載入 chapter1_3 等待中建立新地圖、舊的載入之後失敗：不顯示舊的載入失敗，新地圖不變",
      e.id === "chapter_review_new2" && e.name === "失敗前建立的草稿" && /「chapter1_3」的載入已取消/.test(e.status) && !/載入失敗/.test(e.status + e.aside), e);
  });

  // ── 13. 保存回應還沒回來時載入別的地圖、建立新地圖 ──
  await section("save-pending", async () => {
    await openEditor();
    await loadList();
    await loadMap("chapter1_4");
    const r15 = await row("chapter1_5");
    await fill("name", "保存中切換前的名稱");
    await setCtrl({ holdSave: true });
    await update();
    await enterToken(TOKEN);
    await waitHeld("__mapmetaHeldSave");
    await loadMap("chapter1_5");
    await setCtrl({ holdSave: false });
    await releaseSaves();
    await waitAside(/「chapter1_4」已保存並重新讀回/);
    const a = { id: await val("map_id"), name: await val("name"), status: await status(), aside: await aside(), dirty: await dirtyText() };
    const r14 = await row("chapter1_4");
    await H.shot(page, "map-editor-save-pending-load");
    run.check("保存中-1 chapter1_4 保存中載入 chapter1_5：畫面是 chapter1_5（設定裡的名稱），chapter1_4 的保存回來後只讀讀回、不改畫面；狀態列仍是 chapter1_5 載入成功，chapter1_4 的結果另外列出；沒有尚未保存的提示；試算表 chapter1_4 是新名稱",
      a.id === "chapter1_5" && a.name === r15.name && /「chapter1_5」載入成功/.test(a.status) && /「chapter1_4」已保存並重新讀回/.test(a.aside) && /目前畫面已經不是這張地圖/.test(a.aside) &&
        a.dirty === "" && r14.name === "保存中切換前的名稱",
      { ...a, r14: r14.name });
    // 之後保存 chapter1_5：原值屬於 chapter1_5，只送名稱
    await fill("name", r15.name + "（改）");
    await update();
    await waitStatus(/「chapter1_5」已保存並重新讀回，畫面和設定一致/);
    const upd = await lastOf("update_map_config");
    run.check("保存中-2 之後保存 chapter1_5：只送 chapter1_5 的名稱（原值沒有被 chapter1_4 的讀回換掉），讀回一致",
      same(Object.keys(upd.top).sort(), ["map_id", "name"]) && upd.top.map_id === "chapter1_5" && (await row("chapter1_5")).name === r15.name + "（改）", { top: upd.top });

    // 保存中建立新地圖
    await fill("name", "保存中建新圖前的名稱");
    await setCtrl({ holdSave: true });
    await update();
    await waitHeld("__mapmetaHeldSave");
    await newMap("chapter_review_new3", "保存中建立的新地圖");
    await setCtrl({ holdSave: false });
    await releaseSaves();
    await waitAside(/「chapter1_5」已保存並重新讀回/);
    const b = { id: await val("map_id"), name: await val("name"), status: await status(), aside: await aside(), draft: await text("integrity-draft"), dirty: await dirtyText() };
    run.check("保存中-3 chapter1_5 保存中建立新地圖：保存回來後不改新地圖，新地圖仍標示不是從設定載入、沒有尚未保存的提示；狀態列是新地圖，chapter1_5 的結果另外列出；試算表 chapter1_5 是新名稱",
      b.id === "chapter_review_new3" && b.name === "保存中建立的新地圖" && /已建立新地圖「chapter_review_new3」/.test(b.status) && /目前畫面已經不是這張地圖/.test(b.aside) &&
        /不是從設定載入的地圖/.test(b.draft) && b.dirty === "" && (await row("chapter1_5")).name === "保存中建新圖前的名稱",
      { ...b, draft: b.draft.slice(0, 60) });

    // 保存中建立 map_id 相同的新地圖：讀回的是同一個 map_id，也不能把設定裡的原值套到新的草稿
    await loadMap("chapter1_4");
    await fill("name", "同 id 新圖前保存的名稱");
    await setCtrl({ holdSave: true });
    await update();
    await waitHeld("__mapmetaHeldSave");
    await newMap("chapter1_4", "同 id 的新草稿");
    await setCtrl({ holdSave: false });
    await releaseSaves();
    await waitAside(/「chapter1_4」已保存並重新讀回/);
    const c = { id: await val("map_id"), name: await val("name"), aside: await aside(), draft: await text("integrity-draft"), dirty: await dirtyText() };
    await update();
    await waitStatus(/「chapter1_4」已保存並重新讀回/);
    const upd4 = await lastOf("update_map_config");
    run.check("保存中-4 chapter1_4 保存中建立 map_id 相同的新地圖：讀回不改新草稿（名稱、仍標示不是從設定載入、沒有尚未保存的提示），結果說明目前畫面不是保存時的地圖；之後保存新草稿時三欄都送（沒有借用設定裡的原值）",
      c.id === "chapter1_4" && c.name === "同 id 的新草稿" && /目前畫面已經不是這張地圖/.test(c.aside) && /不是從設定載入的地圖/.test(c.draft) && c.dirty === "" &&
        same(Object.keys(upd4.top).sort(), ["chapter", "map_id", "name", "unlock_stage"]) && upd4.top.name === "同 id 的新草稿",
      { ...c, draft: c.draft.slice(0, 60), top: upd4.top });
  });

  // ── 14. 波次保存：以讀回的波次為已保存的基準 ──
  await section("waves-save", async () => {
    await openEditor();
    await loadList();
    // (1) 沒有選敵人的一波：送出 0 波，畫面也是 0 波
    await loadMap("chapter1_8");
    await addWave();
    const shown = await waveItem(0).locator("tbody tr select").first().evaluate((s) => s.options[s.selectedIndex].text);
    await saveWaves();
    await enterToken(TOKEN);
    await waitWave(/波次儲存成功/);
    const w1 = { msg: await waveText(), screen: await screenWaves(), server: await serverWaves("chapter1_8"), dirty: await dirtyText(), sent: (await lastOf("save_waves_config")).top.waves };
    await H.shot(page, "map-editor-save-waves-empty");
    run.check("波次-1 chapter1_8 新增一波但沒有選敵人：下拉照實顯示「（未選擇敵人）」；送出 0 波、試算表 0 列；讀回後畫面也是 0 波、沒有尚未保存的提示，說明波次 1（整波）沒有選敵人、沒有保存",
      shown === "（未選擇敵人）" && same(w1.sent, []) && w1.server.length === 0 && w1.screen.length === 0 && w1.dirty === "" && /波次 1（整波）沒有選敵人，沒有保存（已從畫面移除）/.test(w1.msg),
      { shown, ...w1 });

    // (2) 有效的組與空白的組混在一起：不補敵人、不重新編號
    await loadMap("chapter1_9");
    await addWave();
    await addEnemyTo(0);
    await addWave();
    await addWave();
    await setEnemy(2, 0, "cavalry_lv1");
    const before2 = await screenWaves();
    await saveWaves();
    await waitWave(/波次儲存成功/);
    const w2 = { msg: await waveText(), screen: await screenWaves(), server: await serverWaves("chapter1_9"), dirty: await dirtyText() };
    run.check("波次-2 第 1 波一組空白＋一組普通兵、第 2 波整波空白、第 3 波騎兵：試算表是第 1 波普通兵、第 3 波騎兵（不補敵人、不重新編號）；畫面換成讀回的 2 波，說明哪些組沒有保存，沒有尚未保存的提示",
      same(before2.map((w) => w.rows.length), [2, 1, 1]) && same(w2.server, [[1, "grunt_lv1", 5], [3, "cavalry_lv1", 5]]) &&
        same(w2.screen, [{ title: "波次 1", rows: [["grunt_lv1", 5]] }, { title: "波次 3", rows: [["cavalry_lv1", 5]] }]) && w2.dirty === "" &&
        /波次 1 的 1 組、波次 2（整波）沒有選敵人，沒有保存（已從畫面移除）/.test(w2.msg),
      { before: before2, ...w2 });

    // (3) 保存期間又改了數量：保留修改，和讀回的內容比較
    await loadMap("chapter1_10");
    await addWave();
    await setEnemy(0, 0, "grunt_lv2");
    await setCtrl({ holdSave: true });
    await saveWaves();
    await waitHeld("__mapmetaHeldSave");
    await setCount(0, 0, 7);
    await setCtrl({ holdSave: false });
    await releaseSaves();
    await waitWave(/保存期間你又改了波次/);
    const w3 = { screen: await screenWaves(), server: await serverWaves("chapter1_10"), dirty: await dirtyText() };
    run.check("波次-3 保存期間把數量改成 7：試算表是送出時的 5，畫面保留 7 並標示波次尚未保存",
      same(w3.server, [[1, "grunt_lv2", 5]]) && same(w3.screen, [{ title: "波次 1", rows: [["grunt_lv2", 7]] }]) && /波次有尚未保存的修改/.test(w3.dirty), w3);

    // (4) 保存成功但讀回失敗：說明已保存、空白的組沒有保存，唯讀重試不重送
    await loadMap("chapter2_1");
    await addWave();
    await setEnemy(0, 0, "siege_lv1");
    await addWave();
    const n4 = await count("save_waves_config");
    // 讀回失敗要在保存送出之後才注入（送出前確認地圖存在的那次讀取要成功）
    await setCtrl({ holdSave: true });
    await saveWaves();
    await waitHeld("__mapmetaHeldSave");
    await setCtrl({ holdSave: false, failGet: 1 });
    await releaseSaves();
    await waitWave(/重新讀回失敗/);
    const w4 = { msg: await waveText(), retry: await page.locator('[data-testid="waves-readback-retry"]').isVisible(), screen: (await screenWaves()).length, server: await serverWaves("chapter2_1"), dirty: await dirtyText() };
    await page.locator('[data-testid="waves-readback-retry"]').click();
    await waitWave(/波次儲存成功並重新讀回/);
    const w4b = { msg: await waveText(), screen: await screenWaves(), dirty: await dirtyText(), sent: (await count("save_waves_config")) - n4 };
    await H.shot(page, "map-editor-save-waves-readback");
    run.check("波次-4 保存成功但讀回失敗：說明已保存（後端回報成功）、讀回失敗、波次 2（整波）沒有保存，有唯讀重試；畫面保留 2 波並標示尚未保存（空白的那波不在設定裡）；試算表是第 1 波攻城",
      /已保存（後端回報成功），但重新讀回失敗/.test(w4.msg) && /波次 2（整波）沒有選敵人，沒有保存/.test(w4.msg) && w4.retry && w4.screen === 2 &&
        /波次有尚未保存的修改/.test(w4.dirty) && same(w4.server, [[1, "siege_lv1", 5]]),
      w4);
    run.check("波次-5 按重新讀回波次（只讀）：畫面換成讀回的 1 波、沒有尚未保存的提示；整個過程只送出一次保存",
      same(w4b.screen, [{ title: "波次 1", rows: [["siege_lv1", 5]] }]) && w4b.dirty === "" && w4b.sent === 1, w4b);

    // (5) 結果不明：後端已寫入但回應遺失 → 唯讀確認已保存
    await loadMap("chapter2_2");
    await addWave();
    await setEnemy(0, 0, "grunt_lv3");
    const n5 = await count("save_waves_config");
    await setCtrl({ wavesMode: "applied-network" });
    await saveWaves();
    await waitWave(/「chapter2_2」無法確定波次是否已保存/);
    const m5 = await waveText();
    await H.sleep(800);
    const sent5 = (await count("save_waves_config")) - n5;
    await page.locator('[data-testid="waves-readback-retry"]').click();
    await waitWave(/讀回確認/);
    const w5 = { msg: await waveText(), screen: await screenWaves(), server: await serverWaves("chapter2_2"), dirty: await dirtyText(), sent: (await count("save_waves_config")) - n5 };
    run.check("波次-6 已寫入但回應遺失：說明無法確定、不會自動重送；唯讀讀回確認和送出的相同、已保存，畫面與試算表一致、沒有尚未保存的提示",
      /不會自動重送/.test(m5) && sent5 === 1 && /相同，這次波次已保存/.test(w5.msg) && same(w5.server, [[1, "grunt_lv3", 5]]) &&
        same(w5.screen, [{ title: "波次 1", rows: [["grunt_lv3", 5]] }]) && w5.dirty === "" && w5.sent === 1,
      { m5, sent5, ...w5 });

    // (6) 結果不明：請求沒有送到 → 唯讀確認沒有生效，畫面保留修改
    await setCount(0, 0, 9);
    const n6 = await count("save_waves_config");
    await setCtrl({ wavesMode: "network" });
    await saveWaves();
    await waitWave(/無法確定/);
    await page.locator('[data-testid="waves-readback-retry"]').click();
    await waitWave(/讀回確認/);
    const w6 = { msg: await waveText(), screen: await screenWaves(), server: await serverWaves("chapter2_2"), dirty: await dirtyText(), sent: (await count("save_waves_config")) - n6 };
    run.check("波次-7 請求沒有送到：讀回確認和送出的不同、沒有生效；畫面保留 9 並標示尚未保存，試算表仍是 5，沒有重送",
      /不同，這次波次保存沒有生效/.test(w6.msg) && same(w6.screen, [{ title: "波次 1", rows: [["grunt_lv3", 9]] }]) && same(w6.server, [[1, "grunt_lv3", 5]]) &&
        /波次有尚未保存的修改/.test(w6.dirty) && w6.sent === 1,
      w6);

    // (7) 保存期間載入別的地圖：結果標示原本的地圖，不改目前畫面
    await loadMap("chapter2_3");
    await addWave();
    await setEnemy(0, 0, "cavalry_lv2");
    await setCtrl({ holdSave: true });
    await saveWaves();
    await waitHeld("__mapmetaHeldSave");
    await loadMap("chapter1_6");
    await setCtrl({ holdSave: false });
    await releaseSaves();
    await waitWave(/「chapter2_3」波次儲存成功並重新讀回/);
    const w7 = { msg: await waveText(), id: await val("map_id"), screen: (await screenWaves()).length, server: await serverWaves("chapter2_3"), dirty: await dirtyText() };
    run.check("波次-8 chapter2_3 的波次保存中載入 chapter1_6：結果標示 chapter2_3、說明目前畫面不是這張地圖；畫面仍是 chapter1_6 的 9 波、沒有尚未保存的提示；試算表 chapter2_3 是騎兵",
      /目前畫面已經不是這張地圖/.test(w7.msg) && w7.id === "chapter1_6" && w7.screen === 9 && w7.dirty === "" && same(w7.server, [[1, "cavalry_lv2", 5]]), w7);

    // (8) 管理密碼錯誤：沒有保存、不讀回
    await openEditor();
    await loadList();
    await loadMap("chapter2_4");
    await addWave();
    await setEnemy(0, 0, "grunt_lv1");
    const gets8 = await count("get_map_config");
    await saveWaves();
    await enterToken("wrong-wave-token");
    await waitWave(/管理密碼不正確/);
    await H.sleep(300);
    const w8 = { msg: await waveText(), server: await serverWaves("chapter2_4"), screen: (await screenWaves()).length, dirty: await dirtyText(), retry: await page.locator('[data-testid="waves-readback-retry"]').count(), gets: (await count("get_map_config")) - gets8 };
    run.check("波次-9 管理密碼錯誤：說明沒有保存，試算表 0 列、沒有讀回（只有送出前確認地圖存在的 1 次讀取）、沒有重試按鈕；畫面保留 1 波並標示尚未保存",
      /沒有保存/.test(w8.msg) && w8.server.length === 0 && w8.gets === 1 && w8.retry === 0 && w8.screen === 1 && /波次有尚未保存的修改/.test(w8.dirty), w8);
  });

  // ── 15. 新地圖、匯入的波次歸屬：預設不沿用、明確勾選才沿用；不借用原本地圖的保存基準、本身不送任何寫入 ──
  await section("new-import-waves", async () => {
    await openEditor();
    await loadList();
    const WRITES = ["update_map_config", "save_waves_config", "create_map_config"];
    const writes = async () => {
      const log = (await reqLog()).filter((e) => WRITES.includes(e.action));
      return Object.fromEntries(WRITES.map((a) => [a, log.filter((e) => e.action === a).length]));
    };
    const writes0 = await writes();
    const src = { c11: await serverWaves("chapter1_1"), c12: await serverWaves("chapter1_2"), c13: await serverWaves("chapter1_3") };
    const modal = () => page.locator('[data-testid="new-map-modal"]');
    const keepBox = () => page.locator('[data-testid="new-keep-waves"]');
    const importBox = page.getByPlaceholder("貼上 JSON 進行匯入...");
    const importKeep = () => page.locator('[data-testid="import-keep-waves"]');
    const geometry = (id, name) => JSON.stringify({ map_id: id, name, chapter: 1, cols: 6, rows: 4, paths: { path_a: [[0, 0], [5, 0]] } });
    const draftState = async () => ({ id: await val("map_id"), name: await val("name"), waves: await screenWaves(), status: await status(), dirty: await dirtyText(), draft: await text("integrity-draft") });

    // (1) 從有波次的地圖新建：預設不沿用
    await loadMap("chapter1_1");
    await btn("＋ 新增地圖").click();
    const m1 = { text: await modal().innerText(), checked: await keepBox().isChecked(), warn: await page.locator('[data-testid="new-replace-warn"]').count() };
    await page.locator('[class*="modal"] input').nth(0).fill("chapter_new_empty");
    await page.locator('[class*="modal"] input').nth(1).fill("空波次的新地圖");
    await btn("確定").click();
    const n1 = await draftState();
    await H.shot(page, "map-editor-save-new-empty");
    run.check("新圖波次-1 chapter1_1（3 波）建立新地圖：視窗的「沿用目前波次（3 波）」預設不勾選、沒有取代提醒；確定後新地圖沒有波次，狀態寫明還沒保存、沒有波次；沒有尚未保存的提示，草稿標示不是從設定載入",
      /沿用目前波次（3 波）/.test(m1.text) && m1.checked === false && m1.warn === 0 && n1.id === "chapter_new_empty" && n1.waves.length === 0 &&
        /已建立新地圖「chapter_new_empty」的草稿（還沒保存到設定）；沒有波次/.test(n1.status) && n1.dirty === "" && /不是從設定載入的地圖/.test(n1.draft),
      { modal: { ...m1, text: m1.text.slice(-160) }, ...n1, waves: n1.waves.length, draft: n1.draft.slice(0, 60) });

    // (2) 明確勾選沿用：照原樣複製（沒有選敵人的組也在），標示波次尚未保存
    await loadMap("chapter1_1");
    await addWave();
    const before2 = await screenWaves();
    await btn("＋ 新增地圖").click();
    const warn2 = await text("new-replace-warn");
    await modal().getByRole("button", { name: "取消", exact: true }).click();
    await newMap("chapter_new_keep", "沿用波次的新地圖", true);
    const n2 = await draftState();
    await H.shot(page, "map-editor-save-new-keep");
    run.check("新圖波次-2 chapter1_1 加了一波（沒有選敵人）後建立新地圖：視窗提醒尚未保存的波次會被取代；勾選沿用後新地圖是同樣的 4 波（空白的組照樣複製、不補不重新編號），狀態寫明沿用 4 波、還沒保存，標示波次尚未保存",
      /畫面上有尚未保存的波次，確定後會被取代/.test(warn2) && before2.length === 4 && same(n2.waves, before2) && /沿用原本畫面的 4 波波次（還沒保存）/.test(n2.status) &&
        /波次有尚未保存的修改/.test(n2.dirty) && /不是從設定載入的地圖/.test(n2.draft),
      { warn2, before: before2.length, ...n2, waves: n2.waves.length, draft: n2.draft.slice(0, 60) });

    // (3) 同 map_id 的新地圖：預設沒有波次；沿用時不借用設定裡的保存基準；保存後以讀回為準，空白的組不會假裝已保存
    await loadMap("chapter1_2");
    await newMap("chapter1_2", "同 id 的空白新圖");
    const n3a = await draftState();
    await loadMap("chapter1_2");
    const loaded3 = await screenWaves();
    await newMap("chapter1_2", "同 id 沿用波次", true);
    const n3b = await draftState();
    await addWave();
    await saveWaves();
    await enterToken(TOKEN);
    await waitWave(/波次儲存成功/);
    const n3c = { msg: await waveText(), waves: await screenWaves(), dirty: await dirtyText(), server: await serverWaves("chapter1_2"), sent: (await lastOf("save_waves_config")).top };
    run.check("新圖波次-3 載入 chapter1_2 後建立同 map_id 的新地圖：預設沒有波次、沒有尚未保存的提示，設定裡 chapter1_2 的 3 波不變（沒有寫入）",
      n3a.id === "chapter1_2" && n3a.name === "同 id 的空白新圖" && n3a.waves.length === 0 && n3a.dirty === "" && same(await serverWaves("chapter1_2"), src.c12),
      { ...n3a, waves: n3a.waves.length, draft: n3a.draft.slice(0, 60) });
    run.check("新圖波次-4 同 map_id 勾選沿用：3 波和設定裡相同，仍標示波次尚未保存（沒有借用 chapter1_2 的保存基準）；再加一波空白後保存：送出 3 波、讀回後畫面是 3 波、說明波次 4 沒有保存（已從畫面移除），沒有尚未保存的提示",
      same(n3b.waves, loaded3) && n3b.waves.length === 3 && /波次有尚未保存的修改/.test(n3b.dirty) &&
        n3c.sent.map_id === "chapter1_2" && n3c.sent.waves.length === 3 && same(n3c.waves, loaded3) && n3c.dirty === "" &&
        /波次 4（整波）沒有選敵人，沒有保存（已從畫面移除）/.test(n3c.msg) && same(n3c.server, src.c12),
      { dirtyB: n3b.dirty, msg: n3c.msg, waves: n3c.waves.length, dirty: n3c.dirty, sent: n3c.sent.waves.length });

    // (4) 匯入：預設清空波次；明確勾選才保留，並標示尚未保存（不沿用原本地圖的保存基準）
    await loadMap("chapter1_3");
    const opt4 = { text: await text("map-import-options"), checked: await importKeep().isChecked() };
    await importBox.fill(geometry("chapter_import_a", "匯入（清空波次）"));
    await btn("匯入").click();
    const n4 = await draftState();
    await loadMap("chapter1_3");
    const loaded5 = await screenWaves();
    await importKeep().check();
    await importBox.fill(geometry("chapter_import_b", "匯入（保留波次）"));
    await btn("匯入").click();
    const n5 = { ...(await draftState()), keepAfter: await importKeep().isChecked() };
    await H.shot(page, "map-editor-save-import-keep");
    run.check("新圖波次-5 載入 chapter1_3（3 波）後匯入：匯入區寫明只換地圖、不勾選會清空波次，「保留目前的波次（3 波）」預設不勾選；匯入後沒有波次，狀態寫明原本的 3 波已清空、還沒保存；沒有尚未保存的提示",
      /匯入時保留目前的波次（3 波）/.test(opt4.text) && /不勾選時波次清空/.test(opt4.text) && opt4.checked === false &&
        n4.id === "chapter_import_a" && n4.waves.length === 0 && /匯入成功：「chapter_import_a」（還沒保存到設定）；原本畫面上的 3 波波次已清空/.test(n4.status) && n4.dirty === "",
      { opt: opt4, ...n4, waves: n4.waves.length, draft: n4.draft.slice(0, 60) });
    run.check("新圖波次-6 勾選保留後匯入：波次和原本相同（3 波），狀態寫明保留 3 波、還沒保存；標示波次尚未保存（不沿用 chapter1_3 的保存基準）；勾選在匯入後回到不勾選",
      n5.id === "chapter_import_b" && same(n5.waves, loaded5) && n5.waves.length === 3 && /保留原本畫面的 3 波波次（還沒保存）/.test(n5.status) &&
        /波次有尚未保存的修改/.test(n5.dirty) && n5.keepAfter === false,
      { ...n5, waves: n5.waves.length, draft: n5.draft.slice(0, 60) });

    // (5) 壞的 JSON：畫面、波次、狀態都不變，沒有彈出視窗
    await fill("name", "壞 JSON 前的修改");
    const before6 = await draftState();
    const warn6 = await text("import-replace-warn");
    let dialogs = 0;
    const onDialog = (d) => { dialogs++; d.dismiss().catch(() => {}); };
    page.on("dialog", onDialog);
    const errs = [];
    for (const bad of ["{壞掉", "[1,2]", JSON.stringify("文字"), "null"]) {
      await importBox.fill(bad);
      await btn("匯入").click();
      await page.waitForSelector('[data-testid="import-error"]', { timeout: 5000 });
      errs.push(await text("import-error"));
    }
    page.off("dialog", onDialog);
    const after6 = await draftState();
    await H.shot(page, "map-editor-save-import-bad");
    run.check("新圖波次-7 匯入壞的 JSON（語法錯誤、陣列、字串、null）：每次都在匯入區說明格式錯誤、畫面與波次沒有改變（role=alert，沒有彈出視窗）；map_id、名稱、3 波與狀態列都和之前相同；匯入區提醒尚未保存的地圖草稿與波次會被取代",
      errs.length === 4 && errs.every((e) => /JSON 格式錯誤/.test(e) && /畫面與波次都沒有改變/.test(e)) && dialogs === 0 && same(after6, before6) &&
        /尚未保存的地圖草稿與波次，匯入後會被取代/.test(warn6),
      { errs, dialogs, before: { ...before6, waves: before6.waves.length, draft: "" }, after: { ...after6, waves: after6.waves.length, draft: "" }, warn6 });

    // (6) 波次保存中建立新地圖：讀回不改新地圖，結果標示原本的地圖
    await loadMap("chapter1_6");
    await setCount(0, 0, 7);
    await setCtrl({ holdSave: true });
    await saveWaves();
    await waitHeld("__mapmetaHeldSave");
    await newMap("chapter_new_pending", "波次保存中建立的新地圖");
    await setCtrl({ holdSave: false });
    await releaseSaves();
    await waitWave(/「chapter1_6」波次儲存成功並重新讀回/);
    const n7 = { ...(await draftState()), msg: await waveText(), server: (await serverWaves("chapter1_6"))[0] };
    run.check("新圖波次-8 chapter1_6 的波次保存中建立新地圖（不沿用）：保存回來後新地圖仍沒有波次、沒有尚未保存的提示；波次結果標示 chapter1_6、說明目前畫面不是這張地圖；設定裡 chapter1_6 第 1 波第一組是 7",
      n7.id === "chapter_new_pending" && n7.waves.length === 0 && n7.dirty === "" && /目前畫面已經不是這張地圖/.test(n7.msg) && same(n7.server, [1, n7.server[1], 7]),
      { id: n7.id, waves: n7.waves.length, dirty: n7.dirty, msg: n7.msg, server: n7.server });

    // (7) 波次保存結果不明時建立新地圖（沿用）：唯讀重試仍標示原本的地圖，確認後不改新地圖
    await loadMap("chapter1_6");
    await setCount(0, 0, 8);
    await setCtrl({ wavesMode: "applied-network" });
    await saveWaves();
    await waitWave(/「chapter1_6」無法確定波次是否已保存/);
    const kept8 = await screenWaves();
    await newMap("chapter_new_unknown", "結果不明時建立的新地圖", true);
    const retry8 = await text("waves-readback-retry");
    await page.locator('[data-testid="waves-readback-retry"]').click();
    await waitWave(/讀回確認/);
    const n8 = { ...(await draftState()), msg: await waveText() };
    run.check("新圖波次-9 chapter1_6 的波次保存結果不明時建立新地圖（沿用 9 波）：重新讀回按鈕仍標示 chapter1_6；讀回確認 chapter1_6 已保存並說明目前畫面不是這張地圖；新地圖的 9 波不變、仍標示尚未保存",
      /重新讀回「chapter1_6」的波次/.test(retry8) && /「chapter1_6」的波次和這次送出的相同，這次波次已保存/.test(n8.msg) && /目前畫面已經不是這張地圖/.test(n8.msg) &&
        n8.id === "chapter_new_unknown" && same(n8.waves, kept8) && kept8.length === 9 && /波次有尚未保存的修改/.test(n8.dirty),
      { retry8, msg: n8.msg, id: n8.id, waves: n8.waves.length, dirty: n8.dirty });

    // (8) 載入等待中開啟新地圖視窗：提醒載入會取消與會被取代的草稿；舊回應回來後不套用
    await setCtrl({ holdGet: true });
    await page.locator('[data-testid="sheet-map-select"]').selectOption("chapter1_2");
    await btn("載入").click();
    await waitHeld("__mapmetaHeld");
    await btn("＋ 新增地圖").click();
    const warn9 = await text("new-replace-warn");
    await page.locator('[class*="modal"] input').nth(0).fill("chapter_new_while_loading");
    await page.locator('[class*="modal"] input').nth(1).fill("載入中建立的新地圖");
    await btn("確定").click();
    await setCtrl({ holdGet: false });
    await releaseGets();
    await H.sleep(600);
    const n9 = await draftState();
    run.check("新圖波次-10 載入 chapter1_2 等待中開新地圖視窗：提醒尚未保存的地圖草稿與波次會被取代、「chapter1_2」的載入會取消；確定後舊回應不套用，新地圖沒有波次",
      /尚未保存的地圖草稿與波次，確定後會被取代/.test(warn9) && /「chapter1_2」的載入會取消/.test(warn9) &&
        n9.id === "chapter_new_while_loading" && n9.waves.length === 0 && !/載入成功/.test(n9.status) && n9.dirty === "",
      { warn9, id: n9.id, waves: n9.waves.length, status: n9.status, dirty: n9.dirty });

    // 新地圖、匯入本身不送寫入；來源地圖在設定裡的波次不變
    const w = await writes();
    const delta = Object.fromEntries(WRITES.map((a) => [a, w[a] - writes0[a]]));
    const srcAfter = { c11: await serverWaves("chapter1_1"), c12: await serverWaves("chapter1_2"), c13: await serverWaves("chapter1_3") };
    run.check("新圖波次-11 整段只有 3 次主動的波次保存（同 id 保存、保存中、結果不明），新地圖與匯入沒有送出任何寫入；chapter1_1／1_2／1_3 在設定裡的波次和開始時相同",
      same(delta, { update_map_config: 0, save_waves_config: 3, create_map_config: 0 }) && same(srcAfter, src),
      { delta, same11: same(srcAfter.c11, src.c11), same12: same(srcAfter.c12, src.c12), same13: same(srcAfter.c13, src.c13) });
  });

  // ── 16. 地圖存在才儲存波次；新增地圖後讀回 ──
  // 後端的 save_waves_config 不檢查地圖是否存在：編輯器送出前先只讀確認，新增地圖成功後讀回才建立已保存的基準
  await section("map-exists", async () => {
    await openEditor(); // 管理密碼從頭開始（確認「沒有詢問管理密碼」）
    await loadList();
    const WRITES = ["update_map_config", "save_waves_config", "create_map_config"];
    const writes = async () => {
      const log = (await reqLog()).filter((e) => WRITES.includes(e.action));
      return Object.fromEntries(WRITES.map((a) => [a, log.filter((e) => e.action === a).length]));
    };
    const delta = (a, b) => Object.fromEntries(WRITES.map((k) => [k, b[k] - a[k]]));
    const ZERO = { update_map_config: 0, save_waves_config: 0, create_map_config: 0 };
    const ONE_CREATE = { update_map_config: 0, save_waves_config: 0, create_map_config: 1 };
    const create = () => btn("新增至 Sheet").click();
    const draftNote = () => text("integrity-draft");
    const retryBtn = () => page.locator('[data-testid="map-readback-retry"]');

    // (1) 設定裡沒有的新地圖：只讀確認後說明要先新增；不問管理密碼、不寫入
    const ID = "chapter_d118_new";
    await newMap(ID, "還沒新增的地圖");
    await addWave();
    await setEnemy(0, 0, "grunt_lv1");
    const w1 = await writes();
    await saveWaves();
    await waitWave(new RegExp(`設定裡沒有「${ID}」這張地圖`));
    await H.sleep(300);
    const r1 = { msg: await waveText(), prompt: await promptVisible(), d: delta(w1, await writes()), server: await serverWaves(ID), screen: await screenWaves(), dirty: await dirtyText(), get: await lastOf("get_map_config") };
    await H.shot(page, "map-editor-save-exists-missing");
    run.check("地圖存在-1 設定裡沒有的新地圖儲存波次：只讀確認（get_map_config 回 MAP_NOT_FOUND）後說明要先按「新增至 Sheet」；沒有跳管理密碼、沒有送出任何寫入，波次表沒有這個 map_id 的列；畫面保留 1 波並標示尚未保存",
      /請先按「新增至 Sheet」/.test(r1.msg) && /沒有詢問管理密碼/.test(r1.msg) && !r1.prompt && same(r1.d, ZERO) && r1.server.length === 0 &&
        r1.get.map_id === ID && r1.get.error === "MAP_NOT_FOUND" && r1.screen.length === 1 && /波次有尚未保存的修改/.test(r1.dirty),
      { ...r1, screen: r1.screen.length });

    // (2) 新增至 Sheet：成功後讀回，地圖與地圖資訊有已保存的基準；波次仍待另外保存
    await create();
    await enterToken(TOKEN);
    await waitStatus(new RegExp(`「${ID}」已新增並重新讀回`));
    const c2 = await lastOf("create_map_config");
    const r2 = {
      msg: await status(), row: await row(ID), dirty: await dirtyText(), draft: await draftNote(), screen: await screenWaves(),
      gets: (await reqLog()).filter((e) => e.action === "get_map_config" && e.t >= c2.t && e.map_id === ID).length,
    };
    await H.shot(page, "map-editor-save-exists-created");
    run.check("地圖存在-2 新增成功後只讀讀回：試算表有這張地圖（名稱、章節 1），狀態說明已新增並重新讀回、地圖與地圖資訊和設定一致、波次要另外保存；草稿不再標示不是從設定載入、沒有地圖的尚未保存提示，畫面上的 1 波不變且仍標示波次尚未保存",
      c2.status === 200 && !!r2.row && r2.row.name === "還沒新增的地圖" && Number(r2.row.chapter) === 1 && r2.gets >= 1 && /和設定一致/.test(r2.msg) && /波次要另外按「儲存波次至 Sheet」保存/.test(r2.msg) &&
        !/不是從設定載入的地圖/.test(r2.draft) && !/地圖有尚未保存的修改/.test(r2.dirty) && /波次有尚未保存的修改/.test(r2.dirty) && same(r2.screen, r1.screen),
      { ...r2, draft: r2.draft.slice(0, 60), screen: r2.screen.length });
    // 基準可用：只改名稱時只送名稱；再儲存波次時確認存在後送出
    await fill("name", "新增後改的名稱");
    await update();
    await waitStatus(new RegExp(`「${ID}」已保存並重新讀回，畫面和設定一致`));
    const upd2 = await lastOf("update_map_config");
    await saveWaves();
    await waitWave(new RegExp(`「${ID}」波次儲存成功並重新讀回，畫面和設定一致`));
    const r3 = { top: upd2.top, server: await serverWaves(ID), dirty: await dirtyText(), prompt: await promptVisible() };
    run.check("地圖存在-3 新增後的基準可用：只改名稱時更新只送 name（原值是讀回的設定）；之後儲存波次確認存在後送出，試算表有 1 列、沒有尚未保存的提示",
      same(Object.keys(r3.top).sort(), ["map_id", "name"]) && same(r3.server, [[1, "grunt_lv1", 5]]) && r3.dirty === "" && !r3.prompt, r3);

    // (3) 匯入與既有地圖同 map_id：設定裡確實有，波次照常保存
    await page.getByPlaceholder("貼上 JSON 進行匯入...").fill(JSON.stringify({ map_id: "chapter1_4", name: "匯入的同 id", chapter: 1, cols: 6, rows: 4, paths: { path_a: [[0, 0], [5, 0]] } }));
    await btn("匯入").click();
    await addWave();
    await setEnemy(0, 0, "cavalry_lv1");
    await saveWaves();
    await waitWave(/「chapter1_4」波次儲存成功並重新讀回/);
    const s4 = await serverWaves("chapter1_4");
    run.check("地圖存在-4 匯入 map_id 是 chapter1_4（設定裡已有）的地圖：確認存在後照常保存波次，試算表 chapter1_4 是匯入畫面上的 1 波", same(s4, [[1, "cavalry_lv1", 5]]), s4);

    // (4) 確認存在的讀取失敗（連線失敗、後端錯誤）：不當成沒有、不送出，可以只讀重新確認
    const w4 = await writes();
    await setCount(0, 0, 6);
    await setCtrl({ failGet: "network" });
    await saveWaves();
    await waitWave(/無法確認設定裡有沒有「chapter1_4」（Failed to fetch）/);
    const m4a = await waveText();
    const recheck = page.locator('[data-testid="wave-map-recheck"]');
    const recheckShown = await recheck.isVisible();
    await setCtrl({ failGet: 1 });
    await recheck.click();
    await waitWave(/仍無法確認設定裡有沒有「chapter1_4」（MOCK_READ_FAILED）/);
    await recheck.click();
    await waitWave(/設定裡有「chapter1_4」/);
    const m4c = await waveText();
    const r4 = { d: delta(w4, await writes()), server: await serverWaves("chapter1_4"), screen: await screenWaves(), dirty: await dirtyText(), recheckAfter: await recheck.count() };
    await H.shot(page, "map-editor-save-exists-recheck");
    run.check("地圖存在-5 確認存在的讀取連線失敗：說明無法確認、不當成沒有這張地圖，波次沒有送出、沒有詢問管理密碼；有只讀的「重新確認」，後端錯誤時仍無法確認，成功後只說明可以再按儲存；整段沒有任何寫入，畫面保留數量 6 並標示尚未保存",
      /不當成沒有這張地圖/.test(m4a) && /波次沒有送出/.test(m4a) && recheckShown && /只確認，沒有送出波次/.test(m4c) && same(r4.d, ZERO) && same(r4.server, [[1, "cavalry_lv1", 5]]) &&
        same(r4.screen, [{ title: "波次 1", rows: [["cavalry_lv1", 6]] }]) && /波次有尚未保存的修改/.test(r4.dirty) && r4.recheckAfter === 0,
      { m4a, recheckShown, m4c, ...r4 });

    // (5) 確認等待中建立新地圖、或改了 map_id：舊的確認回來後不送出
    const w5 = await writes();
    await setCtrl({ holdGet: true });
    await saveWaves();
    await waitHeld("__mapmetaHeld");
    await newMap("chapter_d118_switch", "確認中建立的新地圖");
    await setCtrl({ holdGet: false });
    await releaseGets();
    await waitWave(/「chapter1_4」的波次沒有送出：確認期間畫面換成了別的地圖/);
    const r5a = { msg: await waveText(), id: await val("map_id"), screen: (await screenWaves()).length };
    await loadMap("chapter1_4");
    await setCount(0, 0, 8);
    const c15 = await serverWaves("chapter1_5");
    await setCtrl({ holdGet: true });
    await saveWaves();
    await waitHeld("__mapmetaHeld");
    await fill("map_id", "chapter1_5");
    await setCtrl({ holdGet: false });
    await releaseGets();
    await waitWave(/「chapter1_4」的波次沒有送出：確認期間畫面換成了別的地圖/);
    const r5b = { d: delta(w5, await writes()), c14: await serverWaves("chapter1_4"), c15: await serverWaves("chapter1_5") };
    run.check("地圖存在-6 確認等待中建立新地圖、或把 map_id 改成 chapter1_5：確認回來後說明換了地圖、波次沒有送出（不寫到原本或新的 map_id）；新地圖沒有波次，chapter1_4／1_5 的波次不變",
      /不會把原本的波次寫進設定/.test(r5a.msg) && r5a.id === "chapter_d118_switch" && r5a.screen === 0 && same(r5b.d, ZERO) && same(r5b.c14, [[1, "cavalry_lv1", 5]]) && same(r5b.c15, c15),
      { ...r5a, ...r5b });

    // (6) 確認等待中又改了波次（同一張地圖）：不送出、要重按；重按後送出畫面上的內容
    await loadMap("chapter1_4");
    await setCount(0, 0, 7);
    const w6 = await writes();
    await setCtrl({ holdGet: true });
    await saveWaves();
    await waitHeld("__mapmetaHeld");
    await setCount(0, 0, 9);
    await setCtrl({ holdGet: false });
    await releaseGets();
    await waitWave(/確認期間你又改了波次/);
    const r6a = { msg: await waveText(), d: delta(w6, await writes()), server: await serverWaves("chapter1_4"), screen: await screenWaves() };
    await saveWaves();
    await waitWave(/「chapter1_4」波次儲存成功並重新讀回，畫面和設定一致/);
    const r6b = { d: delta(w6, await writes()), server: await serverWaves("chapter1_4") };
    run.check("地圖存在-7 確認等待中把數量從 7 改成 9：確認回來後不送出（不改送沒確認過的內容），說明要再按一次、畫面保留 9；重按後只送出 1 次，試算表是 9",
      /為了不送出沒有確認過的內容/.test(r6a.msg) && same(r6a.d, ZERO) && same(r6a.server, [[1, "cavalry_lv1", 5]]) && same(r6a.screen, [{ title: "波次 1", rows: [["cavalry_lv1", 9]] }]) &&
        same(r6b.d, { update_map_config: 0, save_waves_config: 1, create_map_config: 0 }) && same(r6b.server, [[1, "cavalry_lv1", 9]]),
      { ...r6a, ...r6b });

    // (7) 新增成功但讀回失敗：說明已新增、讀回失敗，只讀重試
    const RB = "chapter_d118_rb";
    await newMap(RB, "讀回失敗的新地圖");
    const w7 = await writes();
    await setCtrl({ failGet: 1 });
    await create();
    await waitStatus(new RegExp(`「${RB}」已新增（後端回報成功），但重新讀回失敗`));
    const r7a = { msg: await status(), retry: await text("map-readback-retry"), row: await row(RB), draft: await draftNote() };
    await retryBtn().click();
    await waitStatus(new RegExp(`「${RB}」已新增並重新讀回，地圖與地圖資訊和設定一致`));
    const r7b = { d: delta(w7, await writes()), draft: await draftNote(), dirty: await dirtyText(), retryAfter: await retryBtn().count() };
    await H.shot(page, "map-editor-save-exists-create-readback");
    run.check("地圖存在-8 新增成功但讀回失敗：說明已新增（後端回報成功）、讀回失敗、沒有重送，有標示 map_id 的只讀「重新讀回」，草稿仍標示不是從設定載入（沒有建立基準）；重新讀回後一致、草稿成為設定裡的地圖；整段只新增一次",
      !!r7a.row && /沒有重送/.test(r7a.msg) && new RegExp(`重新讀回「${RB}」`).test(r7a.retry) && /不是從設定載入的地圖/.test(r7a.draft) &&
        same(r7b.d, ONE_CREATE) && !/不是從設定載入的地圖/.test(r7b.draft) && r7b.dirty === "" && r7b.retryAfter === 0,
      { ...r7a, draft: r7a.draft.slice(0, 40), ...r7b, draftAfter: r7b.draft.slice(0, 40) });

    // (8) 新增已處理但回應遺失：不說沒有新增、不自動重送；只讀核對後確立基準
    const UA = "chapter_d118_ua";
    await newMap(UA, "結果不明（已新增）");
    const w8 = await writes();
    await setCtrl({ createMode: "applied-network" });
    await create();
    await waitStatus(new RegExp(`無法確定「${UA}」是否已新增`));
    const m8 = await status();
    await H.sleep(800);
    const sent8 = delta(w8, await writes());
    const autoGets = (await reqLog()).filter((e) => e.action === "get_map_config" && e.map_id === UA).length;
    await retryBtn().click();
    await waitStatus(new RegExp(`讀回確認：設定裡「${UA}」的內容和這次送出的相同，這次新增已完成`));
    const r8 = { d: delta(w8, await writes()), draft: await draftNote(), dirty: await dirtyText(), row: await row(UA) };
    run.check("地圖存在-9 新增已處理但回應遺失：說明無法確定是否已新增（不說沒有新增）、不會自動重送，也沒有自動讀取；按重新讀回（只讀）確認內容相同、新增已完成，草稿成為設定裡的地圖；整段只新增一次",
      /不會自動重送/.test(m8) && !/沒有新增/.test(m8) && same(sent8, ONE_CREATE) && autoGets === 0 && same(r8.d, ONE_CREATE) && !!r8.row && !/不是從設定載入的地圖/.test(r8.draft) && r8.dirty === "",
      { m8, sent8, autoGets, ...r8, draft: r8.draft.slice(0, 40) });

    // (9) 新增請求沒有送到：只讀核對設定裡沒有，保留草稿、不重送
    const UN = "chapter_d118_un";
    await newMap(UN, "結果不明（沒有送到）");
    const w9 = await writes();
    await setCtrl({ createMode: "network" });
    await create();
    await waitStatus(new RegExp(`無法確定「${UN}」是否已新增`));
    await retryBtn().click();
    await waitStatus(new RegExp(`設定裡目前沒有「${UN}」`));
    const r9 = { msg: await status(), d: delta(w9, await writes()), row: await row(UN), draft: await draftNote(), name: await val("name"), retry: await retryBtn().count() };
    run.check("地圖存在-10 新增請求沒有送到：重新讀回確認設定裡沒有這張地圖，說明這次新增看來沒有生效、沒有重送；草稿保留（名稱、仍標示不是從設定載入），重新讀回按鈕仍在；試算表沒有這個 map_id",
      /沒有重送/.test(r9.msg) && same(r9.d, ONE_CREATE) && r9.row === null && /不是從設定載入的地圖/.test(r9.draft) && r9.name === "結果不明（沒有送到）" && r9.retry === 1,
      { ...r9, draft: r9.draft.slice(0, 40) });

    // (10) 新增的 map_id 已存在、內容不同：沒有新增也不覆寫
    const orig15 = await row("chapter1_5");
    await newMap("chapter1_5", "同 id 不同內容");
    const w10 = await writes();
    await create();
    await waitStatus(/設定裡已經有「chapter1_5」，這次沒有新增/);
    const r10 = { msg: await status(), d: delta(w10, await writes()), row: await row("chapter1_5"), draft: await draftNote(), name: await val("name"), retry: await retryBtn().count(), last: (await lastOf("create_map_config")).error };
    run.check("地圖存在-11 新增的 map_id 已存在（chapter1_5，內容不同）：後端回 MAP_ID_EXISTS，說明沒有新增、沒有覆寫，要編輯請用載入；試算表的 chapter1_5 不變、沒有送出更新；草稿保留、仍標示不是從設定載入",
      r10.last === "MAP_ID_EXISTS" && same(r10.row, orig15) && same(r10.d, ONE_CREATE) && /也沒有覆寫/.test(r10.msg) && /不是從設定載入的地圖/.test(r10.draft) && r10.name === "同 id 不同內容" && r10.retry === 0,
      { ...r10, draft: r10.draft.slice(0, 40) });

    // (11) 同 map_id 的新增結果不明：只讀核對發現內容不同，不建立基準、不覆寫
    await fill("name", "同 id 結果不明");
    const w11 = await writes();
    await setCtrl({ createMode: "applied-network" });
    await create();
    await waitStatus(/無法確定「chapter1_5」是否已新增/);
    await retryBtn().click();
    await waitStatus(/設定裡已有「chapter1_5」，但內容和這次送出的不同/);
    const r11 = { msg: await status(), d: delta(w11, await writes()), row: await row("chapter1_5"), draft: await draftNote(), dirty: await dirtyText(), name: await val("name") };
    await H.shot(page, "map-editor-save-exists-duplicate");
    run.check("地圖存在-12 同 map_id 的新增結果不明（後端其實回了 MAP_ID_EXISTS、回應遺失）：重新讀回發現設定裡的內容不同，說明這次新增沒有生效或已被蓋過、沒有覆寫；試算表的 chapter1_5 不變、沒有送出更新；草稿保留（名稱、仍標示不是從設定載入、沒有借用設定裡的內容當已保存）",
      /沒有覆寫設定裡的地圖/.test(r11.msg) && same(r11.row, orig15) && same(r11.d, ONE_CREATE) && /不是從設定載入的地圖/.test(r11.draft) && r11.dirty === "" && r11.name === "同 id 結果不明",
      { ...r11, draft: r11.draft.slice(0, 40) });

    // (12) 新增後讀回期間改了名稱：讀回不蓋掉修改，基準是設定裡的內容
    const ED = "chapter_d118_edit";
    await newMap(ED, "讀回中修改");
    await setCtrl({ holdGet: true });
    await create();
    await waitHeld("__mapmetaHeld");
    await fill("name", "讀回期間改的名稱");
    await setCtrl({ holdGet: false });
    await releaseGets();
    await waitStatus(new RegExp(`「${ED}」已新增並重新讀回；新增期間你又改了畫面`));
    const r12 = { name: await val("name"), dirty: await dirtyText(), draft: await draftNote(), row: (await row(ED))?.name };
    await update();
    await waitStatus(new RegExp(`「${ED}」已保存並重新讀回，畫面和設定一致`));
    const upd12 = await lastOf("update_map_config");
    const after12 = (await row(ED))?.name;
    run.check("地圖存在-13 新增後讀回期間改了名稱：讀回不蓋掉修改（名稱保留、標示地圖尚未保存），試算表是新增時的名稱；基準是設定裡的內容（不再標示不是從設定載入），之後更新只送名稱",
      r12.name === "讀回期間改的名稱" && /地圖有尚未保存的修改/.test(r12.dirty) && !/不是從設定載入的地圖/.test(r12.draft) && r12.row === "讀回中修改" &&
        same(Object.keys(upd12.top).sort(), ["map_id", "name"]) && after12 === "讀回期間改的名稱",
      { ...r12, draft: r12.draft.slice(0, 40), top: upd12.top, after12 });

    // (13) 新增後讀回期間建立另一張新地圖：讀回不改新地圖、不換掉波次
    const SW = "chapter_d118_sw";
    await newMap(SW, "讀回中換圖");
    await addWave();
    await setEnemy(0, 0, "grunt_lv2");
    await setCtrl({ holdGet: true });
    await create();
    await waitHeld("__mapmetaHeld");
    await newMap("chapter_d118_sw2", "讀回期間建立的新地圖", true);
    const before13 = await screenWaves();
    await setCtrl({ holdGet: false });
    await releaseGets();
    await waitAside(new RegExp(`「${SW}」已新增並重新讀回；目前畫面已經不是這張地圖`));
    const r13 = { id: await val("map_id"), name: await val("name"), draft: await draftNote(), dirty: await dirtyText(), waves: await screenWaves(), row: !!(await row(SW)) };
    run.check("地圖存在-14 新增後讀回期間建立另一張新地圖（沿用 1 波）：讀回不改新地圖（名稱、仍標示不是從設定載入），結果另外列出並說明目前畫面不是這張地圖；畫面上的波次沒有被讀回取代、仍標示尚未保存",
      r13.id === "chapter_d118_sw2" && r13.name === "讀回期間建立的新地圖" && /不是從設定載入的地圖/.test(r13.draft) && same(r13.waves, before13) && before13.length === 1 &&
        /波次有尚未保存的修改/.test(r13.dirty) && !/地圖有尚未保存的修改/.test(r13.dirty) && r13.row,
      { ...r13, draft: r13.draft.slice(0, 40), waves: r13.waves.length });

    // (14) 新增的 map_id 在波次表原本就有列（沒有地圖的波次）：讀回說明，不用舊波次取代畫面
    await newMap(ORPHAN, "孤兒波次的地圖");
    await create();
    await waitStatus(new RegExp(`「${ORPHAN}」已新增並重新讀回`));
    const r14 = { msg: await status(), waves: (await screenWaves()).length, server: await serverWaves(ORPHAN) };
    run.check("地圖存在-15 新增的 map_id 在波次表原本就有 2 波（沒有地圖的列）：讀回說明設定裡原本就有 2 波、儲存波次會整批取代；畫面上的 0 波沒有被舊波次取代",
      /原本就有 2 波波次/.test(r14.msg) && r14.waves === 0 && r14.server.length === 2, r14);
  });

  // ── 16b. 新版後端保存時再確認地圖（候選契約）──
  // 內建模擬用 mapCheck 模擬新版契約；GAS_BACKEND 的後端要另外設 GAS_MAP_CHECK=1（表示這個後端版本會檢查），
  // 而且模組要提供 removeMapRow／duplicateMapRow／removeMapDuringNextWavesWrite（模擬管理者在試算表上手動改 maps_config）、
  // throwMapReadDuringNextWavesWrite（寫入後確認地圖時讀取失敗）與 configJournal／sheetNames（核對紀錄與備份）
  const MAP_CHECK = node ? proc.env.GAS_MAP_CHECK === "1" && typeof node.removeMapRow === "function" && typeof node.throwMapReadDuringNextWavesWrite === "function" : true;
  out.mapBackendCheck = MAP_CHECK ? (node ? "gas-backend" : "built-in mapCheck") : "skipped（GAS_BACKEND 沒有設 GAS_MAP_CHECK=1，或模組沒有模擬方法）";
  if (MAP_CHECK) await section("map-backend-check", async () => {
    const editMaps = async (fn) => {
      const tb = await page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mapmeta_tables")));
      fn(tb.maps.rows);
      await page.evaluate((tb) => localStorage.setItem("__shenma_mapmeta_tables", JSON.stringify(tb)), tb);
    };
    const removeServerMap = (id) => (node ? node.removeMapRow(id) : editMaps((rows) => rows.splice(0, rows.length, ...rows.filter((r) => String(r[0]).trim() !== id))));
    const duplicateServerMap = (id) => (node ? node.duplicateMapRow(id) : editMaps((rows) => { const r = rows.find((x) => String(x[0]).trim() === id); rows.push([" " + id, ...r.slice(1)]); }));
    const goneAfterWrite = (id) => (node ? node.removeMapDuringNextWavesWrite(id) : setCtrl({ mapGoneAfterWrite: id }));
    if (!node) await setCtrl({ mapCheck: 1 });
    await openEditor();
    let tokenEntered = false;
    const createNew = async (id, name) => {
      await newMap(id, name);
      await btn("新增至 Sheet").click();
      if (!tokenEntered) await enterToken(TOKEN); // 新開的編輯器頁面第一次寫入時詢問管理密碼
      tokenEntered = true;
      await waitStatus(new RegExp(`「${id}」已新增並重新讀回`));
      await addWave();
      await setEnemy(0, 0, "grunt_lv1");
    };
    const after = async (t0) => (await reqLog()).filter((e) => e.t > t0);
    const othersOf = async (id) => JSON.stringify((await serverTables()).waves.rows.filter((r) => String(r[0]).trim() !== id));

    // (1) 只讀確認存在（200）之後、保存送到後端之前地圖被刪除：後端拒絕，中文說明、不留孤兒列、不讀回不重送
    const A = "chapter_mapcheck_gone";
    await createNew(A, "保存前被刪除的地圖");
    await setCtrl({ holdSave: 1 });
    await saveWaves();
    await waitHeld("__mapmetaHeldSave");
    const pre = await lastOf("get_map_config");
    await removeServerMap(A);
    const othersA = await othersOf(A);
    const t1 = Date.now();
    await setCtrl({ holdSave: 0 });
    await releaseSaves();
    await waitWave(new RegExp(`「${A}」的波次沒有保存`));
    await H.sleep(400);
    const l1 = await after(t1);
    const r1 = {
      msg: await waveText(), pre: [pre.map_id, pre.status], save: l1.filter((e) => e.action === "save_waves_config").map((e) => [e.status, e.error]),
      gets: l1.filter((e) => e.action === "get_map_config").length, server: await serverWaves(A), othersSame: (await othersOf(A)) === othersA,
      retry: await page.locator('[data-testid="waves-readback-retry"]').count(), screen: (await screenWaves()).length, dirty: await dirtyText(),
    };
    await H.shot(page, "map-editor-save-backend-check-gone");
    run.check("後端確認-1 確認設定裡有這張地圖之後、保存送到後端之前地圖被刪除：後端回 404 MAP_NOT_FOUND，說明設定裡沒有這張地圖、可能剛被刪除、這次沒有寫入（不顯示英文代碼）；波次表沒有留下這個 map_id 的列、其他地圖不變；沒有讀回、沒有重送；畫面保留 1 波並標示尚未保存",
      r1.pre[0] === A && r1.pre[1] === 200 && same(r1.save, [[404, "MAP_NOT_FOUND"]]) && /沒有這張地圖/.test(r1.msg) && /剛被刪除/.test(r1.msg) && /沒有寫入/.test(r1.msg) && !/MAP_NOT_FOUND/.test(r1.msg) &&
        r1.server.length === 0 && r1.othersSame && r1.gets === 0 && r1.retry === 0 && r1.screen === 1 && /波次有尚未保存的修改/.test(r1.dirty),
      r1);

    // (2) 寫入後才發現地圖不見：波次已寫入，但不說成功也不說沒有保存；不讀回、不重送
    const B = "chapter_mapcheck_late";
    await createNew(B, "寫入後被刪除的地圖");
    await goneAfterWrite(B);
    const t2 = Date.now();
    await saveWaves();
    await waitWave(new RegExp(`「${B}」的波次已寫入`));
    await H.sleep(400);
    const l2 = await after(t2);
    const r2 = {
      msg: await waveText(), save: l2.filter((e) => e.action === "save_waves_config").map((e) => [e.status, e.error]),
      // 保存之後的讀取（保存前的「確認存在」不算）
      gets: l2.filter((e) => e.action === "get_map_config" && e.map_id === B && e.t > (l2.find((x) => x.action === "save_waves_config") || { t: 0 }).t).length,
      server: await serverWaves(B), mapRow: await row(B),
      retry: await page.locator('[data-testid="waves-readback-retry"]').count(), dirty: await dirtyText(),
    };
    await H.shot(page, "map-editor-save-backend-check-late");
    run.check("後端確認-2 寫入後才發現地圖被刪除：後端回 409 MAP_CHANGED_DURING_SAVE；說明波次已寫入、不算保存成功、沒有自動還原、要管理者依 check_failed 處理，沒有說成功或沒有保存；試算表有這 1 列、地圖沒有被重建；只送出 1 次、沒有讀回；畫面仍標示尚未保存",
      same(r2.save, [[409, "MAP_CHANGED_DURING_SAVE"]]) && /已寫入/.test(r2.msg) && /不算保存成功/.test(r2.msg) && /沒有自動還原/.test(r2.msg) && /check_failed/.test(r2.msg) &&
        !/沒有保存/.test(r2.msg) && !/儲存成功/.test(r2.msg) && same(r2.server, [[1, "grunt_lv1", 5]]) && r2.mapRow === null && r2.gets === 0 && r2.retry === 0 && /波次有尚未保存的修改/.test(r2.dirty),
      r2);

    // (3) 設定裡有兩列同一個 map_id（一列有前後空白）：後端拒絕，說明重複、這次沒有寫入
    const C = "chapter_mapcheck_dup";
    await createNew(C, "重複 ID 的地圖");
    await duplicateServerMap(C);
    const t3 = Date.now();
    await saveWaves();
    await waitWave(new RegExp(`「${C}」的波次沒有保存`));
    const l3 = await after(t3);
    const r3 = { msg: await waveText(), save: l3.filter((e) => e.action === "save_waves_config").map((e) => [e.status, e.error]), server: await serverWaves(C) };
    run.check("後端確認-3 設定裡有兩列同一個 map_id：後端回 409 MAP_ID_DUPLICATE，說明有兩列以上、要刪除重複的列、這次沒有寫入；波次表沒有這個 map_id 的列",
      same(r3.save, [[409, "MAP_ID_DUPLICATE"]]) && /兩列以上/.test(r3.msg) && /沒有寫入/.test(r3.msg) && r3.server.length === 0, r3);

    // (4) 寫入並讀回核對之後，確認地圖時讀取發生錯誤：波次已寫入，不說沒有保存或沒有改變；不讀回、不重送；備份與紀錄保留
    const D = "chapter_mapcheck_throw";
    await createNew(D, "寫入後確認失敗的地圖");
    if (node) node.throwMapReadDuringNextWavesWrite();
    else await setCtrl({ mapThrowAfterWrite: D });
    const mapBefore = JSON.stringify(await row(D));
    const t4 = Date.now();
    await saveWaves();
    await waitWave(new RegExp(`「${D}」(的波次|無法確定)`));
    await H.sleep(400);
    const l4 = await after(t4);
    const saveAt = (l4.find((x) => x.action === "save_waves_config") || { t: 0 }).t;
    const j4 = node ? node.configJournal().filter((e) => e.table === "waves_config").pop() : null;
    const r4 = {
      msg: await waveText(), save: l4.filter((e) => e.action === "save_waves_config").map((e) => [e.status, e.error]),
      gets: l4.filter((e) => e.action === "get_map_config" && e.t > saveAt).length,
      server: await serverWaves(D), mapSame: JSON.stringify(await row(D)) === mapBefore,
      retry: await page.locator('[data-testid="waves-readback-retry"]').count(), dirty: await dirtyText(),
      journal: j4 ? { status: j4.status, backup: j4.backup_sheet, kept: node.sheetNames().includes(j4.backup_sheet) } : "built-in（沒有 _config_backups）",
    };
    const backupName = node ? r4.journal.backup : "_bk_waves_config_mock_postwrite";
    await H.shot(page, "map-editor-save-backend-check-postwrite-error");
    run.check("後端確認-4 寫入並讀回核對之後確認地圖時發生錯誤：後端回 500 POSTWRITE_CHECK_ERROR；說明波次已寫入、不算保存成功、沒有自動還原、不要直接重送、check_failed 與寫入前內容的備份，不說沒有保存或沒有改變；試算表有這 1 列、地圖不變；只送出 1 次、沒有讀回；畫面仍標示尚未保存；後端紀錄 check_failed、備份保留",
      same(r4.save, [[500, "POSTWRITE_CHECK_ERROR"]]) && /已寫入/.test(r4.msg) && /不算保存成功/.test(r4.msg) && /沒有自動還原/.test(r4.msg) && /不要直接重送/.test(r4.msg) &&
        /check_failed/.test(r4.msg) && r4.msg.includes(backupName) && !/沒有保存|沒有改變|沒有寫入/.test(r4.msg) &&
        same(r4.server, [[1, "grunt_lv1", 5]]) && r4.mapSame && r4.gets === 0 && r4.retry === 0 && /波次有尚未保存的修改/.test(r4.dirty) &&
        (!node || (r4.journal.status === "check_failed" && r4.journal.kept)),
      r4);
    if (!node) await setCtrl({ mapCheck: 0 });
  });

  // ── 17. 素材轉換：有效圖片、無效檔案、取消；不加入素材選單 ──
  await section("asset", async () => {
    const uploads = [];
    const onReq = (r) => { if (/\/mapEditor\/api\/upload/.test(r.url())) uploads.push(r.method()); };
    page.on("request", onReq);
    const options = () => page.evaluate(() => ({
      thumbs: document.querySelectorAll('button[class*="textureOption"]').length,
      blobOptions: [...document.querySelectorAll('button[class*="textureOption"] img')].filter((i) => (i.getAttribute("src") || "").startsWith("blob:")).length,
      blobCells: [...document.querySelectorAll('div[title^="["]')].filter((d) => /blob:/.test(d.style.backgroundImage)).length,
    }));
    const opt0 = await options();
    const input = page.locator('[data-testid="asset-convert-input"]');
    // 有效的 PNG（2×2）
    const Buf = globalThis.Buffer;
    const PNG = Buf.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP4z8DwHwyBNIQBBUIhAAD1Fw/x3zN7kAAAAABJRU5ErkJggg==", "base64");
    await input.setInputFiles({ name: "my_tile.png", mimeType: "image/png", buffer: PNG });
    await page.waitForSelector('[data-testid="asset-convert-result"]', { timeout: 10000 });
    const result = await text("asset-convert-result");
    const preview = await page.locator('[data-testid="asset-convert-result"] img').evaluate((i) => ({ ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth, src: i.getAttribute("src").slice(0, 5) }));
    const [download] = await Promise.all([page.waitForEvent("download"), page.locator('[data-testid="asset-convert-download"]').click()]);
    const savedTo = `${H.EVIDENCE}/converted-${download.suggestedFilename()}`;
    await download.saveAs(savedTo);
    const bytes = fs.readFileSync(savedTo);
    const isWebp = bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
    const opt1 = await options();
    await H.shot(page, "map-editor-save-asset");
    run.check("素材-1 選擇有效圖片：預覽載入成功，說明尚未加入遊戲（要加入遊戲素材並重新發布）；下載的檔名是 my_tile.webp、內容是 WebP（RIFF／WEBP）",
      /my_tile\.webp（2×2/.test(result) && /還沒加入遊戲/.test(result) && /重新發布/.test(result) && preview.ok && preview.src === "blob:" &&
        download.suggestedFilename() === "my_tile.webp" && isWebp,
      { result, preview, file: download.suggestedFilename(), isWebp, size: bytes.length });
    run.check("素材-2 轉換後的素材不加入素材選單、不用在任何格子（選項數不變、沒有 blob: 的選項或格子）",
      opt1.thumbs === opt0.thumbs && opt1.blobOptions === 0 && opt1.blobCells === 0, { opt0, opt1 });
    // 無效的檔案
    await input.setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buf.from("這不是圖片") });
    await page.waitForSelector('[data-testid="asset-convert-error"]', { timeout: 10000 });
    const err = await text("asset-convert-error");
    const resultGone = await page.locator('[data-testid="asset-convert-result"]').count();
    // 取消（沒有選檔）
    await input.setInputFiles([]);
    await H.sleep(300);
    const opt2 = await options();
    run.check("素材-3 無效檔案：顯示無法讀取、沒有產生素材；取消選檔沒有變化；素材選單不變",
      /無法讀取這個檔案/.test(err) && resultGone === 0 && opt2.thumbs === opt0.thumbs && opt2.blobOptions === 0 && opt2.blobCells === 0, { err, resultGone, opt2 });
    // 開發模式：加入開發素材（攔截請求，不寫檔）；正式靜態匯出：沒有這個按鈕、沒有上傳請求
    await input.setInputFiles({ name: "dev_tile.png", mimeType: "image/png", buffer: PNG });
    await page.waitForSelector('[data-testid="asset-convert-result"]', { timeout: 10000 });
    const devBtn = await page.locator('[data-testid="asset-dev-add"]').count();
    if (PROD) {
      run.check("素材-4 正式靜態匯出：沒有「加入開發素材」，整個流程沒有任何上傳請求", devBtn === 0 && uploads.length === 0, { devBtn, uploads });
    } else {
      const tile = await page.request.get(H.BASE + "/images/shenmaSanguo/tiles/tile_grass1.webp");
      const tileBody = await tile.body();
      await page.route("**/mapEditor/api/upload", (r) => r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ path: "tiles/__dev_added_test.webp" }) }));
      await page.route("**/images/shenmaSanguo/tiles/__dev_added_test.webp", (r) => r.fulfill({ status: 200, contentType: "image/webp", body: tileBody }));
      await page.locator('[data-testid="asset-dev-add"]').click();
      await page.waitForFunction(() => /已寫進本機 public/.test(document.querySelector('[data-testid="asset-convert-result"]')?.innerText || ""), null, { timeout: 10000 });
      const devMsg = await text("asset-convert-result");
      const added = await page.locator('button[title="tiles/__dev_added_test.webp"]').count();
      await page.unroute("**/mapEditor/api/upload");
      await page.unroute("**/images/shenmaSanguo/tiles/__dev_added_test.webp");
      run.check("素材-4 開發模式：有「加入開發素材」，送出後加入這個頁面的素材選單，說明遊戲還要加入 Godot 素材並重新匯出（請求以攔截回應，沒有寫檔）",
        devBtn === 1 && uploads.filter((m) => m === "POST").length === 1 && added > 0 && /Godot/.test(devMsg), { devBtn, uploads, added, devMsg: devMsg.slice(-80) });
    }
    page.off("request", onReq);
  });

  // ── 17b. 新地圖視窗的鍵盤操作：dialog 與欄位標籤、開啟時焦點在 map_id、Tab／Shift+Tab 只在視窗內循環（停用的跳過）、
  //        Esc／取消／點遮罩／確定後焦點回到「＋ 新增地圖」，關閉後不留下焦點陷阱與 document 上的監聽 ──
  await section("new-map-keyboard", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openEditor();
    await loadList();
    const WRITES = ["update_map_config", "save_waves_config", "create_map_config"];
    const writes = async () => (await reqLog()).filter((e) => WRITES.includes(e.action)).length;
    const writes0 = await writes();
    const dialog = () => page.getByRole("dialog", { name: "新增地圖", exact: true });
    const isOpen = async () => (await page.locator('[data-testid="new-map-modal"]').count()) > 0;
    // 目前的焦點：欄位用連到它的標籤（label for），勾選框是 checkbox，按鈕用文字；inDialog 是否在視窗裡
    const active = () => page.evaluate(() => {
      const a = document.activeElement;
      const dlg = document.querySelector('[data-testid="new-map-modal"]');
      if (!a || a === document.body) return { name: "(body)", inDialog: false };
      const lab = a.id ? document.querySelector(`label[for="${CSS.escape(a.id)}"]`) : null;
      const name = a.type === "checkbox" ? "checkbox" : a.tagName === "INPUT" ? (lab ? lab.textContent.trim() : "(沒有標籤)") : (a.textContent || "").trim();
      return { name, inDialog: !!dlg && dlg.contains(a) };
    });
    const press = async (key, n = 1) => {
      const seq = [];
      for (let i = 0; i < n; i++) { await page.keyboard.press(key); seq.push(await active()); }
      return seq;
    };
    const names = (seq) => seq.map((a) => a.name);
    const allIn = (seq) => seq.every((a) => a.inDialog);
    const openByKey = async () => {
      await btn("＋ 新增地圖").focus();
      await page.keyboard.press("Enter");
      await page.locator('[data-testid="new-map-modal"]').waitFor({ timeout: 5000 });
    };
    // document 上 focusin／keydown 監聽的數量（只算這之後加上的）：開關多次後不能累積
    await page.evaluate(() => {
      const live = { focusin: new Set(), keydown: new Set() };
      const add = document.addEventListener, rm = document.removeEventListener;
      document.addEventListener = function (type, fn, opts) { if (live[type]) live[type].add(fn); return add.call(this, type, fn, opts); };
      document.removeEventListener = function (type, fn, opts) { if (live[type]) live[type].delete(fn); return rm.call(this, type, fn, opts); };
      window.__dialogListeners = () => ({ focusin: live.focusin.size, keydown: live.keydown.size });
    });
    const listeners = () => page.evaluate(() => window.__dialogListeners());
    const editorState = async () => ({ id: await val("map_id"), name: await val("name"), waves: await screenWaves(), status: await status(), dirty: await dirtyText() });
    const LABELS = ["map_id", "名稱", "章節", "解鎖條件", "寬 (Cols)", "高 (Rows)"];

    // (1) 開啟：dialog 語意、焦點在 map_id、每個欄位都有連到它的標籤
    const before1 = await editorState();
    const l0 = await listeners();
    await openByKey();
    const a1 = await active();
    const dlg1 = await page.locator('[data-testid="new-map-modal"]').evaluate((el) => ({
      role: el.getAttribute("role"), modal: el.getAttribute("aria-modal"),
      title: document.getElementById(el.getAttribute("aria-labelledby") || "")?.textContent?.trim() || "",
    }));
    const dialogs1 = await dialog().count();
    const labeled = [];
    for (const l of LABELS) labeled.push(await dialog().getByRole("textbox", { name: l, exact: true }).count());
    await dialog().locator("label", { hasText: "解鎖條件" }).click();
    const aLabel = await active();
    const keep1 = await dialog().getByRole("checkbox", { name: /沿用目前波次（0 波）/ }).evaluate((el) => ({
      disabled: el.disabled,
      desc: (el.getAttribute("aria-describedby") || "").split(" ").map((id) => document.getElementById(id)?.textContent || "").join(""),
    }));
    const l1 = await listeners();
    run.check("新圖鍵盤-1 用 Enter 開啟新地圖視窗：role=dialog、aria-modal=true，名稱是標題「新增地圖」；焦點在 map_id 欄；6 個欄位都能用標籤找到（label 連到 input），點「解鎖條件」標籤焦點移到該欄；「沿用目前波次（0 波）」停用、說明文字連到勾選框；開著時 document 多 1 個 focusin 與 1 個 keydown 監聽",
      dlg1.role === "dialog" && dlg1.modal === "true" && dlg1.title === "新增地圖" && dialogs1 === 1 && a1.name === "map_id" && a1.inDialog &&
        labeled.every((n) => n === 1) && aLabel.name === "解鎖條件" && keep1.disabled === true && /不勾選時新地圖沒有波次/.test(keep1.desc) &&
        l1.focusin - l0.focusin === 1 && l1.keydown - l0.keydown === 1,
      { dlg1, dialogs1, a1, labeled, aLabel, keep1: { ...keep1, desc: keep1.desc.slice(0, 30) }, l0, l1 });

    // (2) 沒有波次、欄位空白：勾選框與「確定」停用，Tab 只在 6 個欄位與「取消」之間循環
    const back2 = await press("Shift+Tab", 3);
    const fwd2 = await press("Tab", 8);
    const rev2 = await press("Shift+Tab", 2);
    run.check("新圖鍵盤-2 沒有波次、欄位空白（勾選框與「確定」停用）：Shift+Tab 從解鎖條件退回 map_id；Tab 依序名稱→章節→解鎖條件→寬→高→取消→回到 map_id→名稱；從 map_id 按 Shift+Tab 到「取消」，焦點都沒有離開視窗",
      names(back2).join("|") === "章節|名稱|map_id" &&
        names(fwd2).join("|") === "名稱|章節|解鎖條件|寬 (Cols)|高 (Rows)|取消|map_id|名稱" &&
        names(rev2).join("|") === "map_id|取消" && allIn([...back2, ...fwd2, ...rev2]),
      { back2: names(back2), fwd2: names(fwd2), rev2: names(rev2) });

    // (3) 程式把焦點移到背後的「匯入」時拉回視窗；欄位裡按 Enter 不會確定、不會新增
    await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "匯入")?.focus());
    const a3 = await active();
    await page.keyboard.type("kb_enter_probe");
    await page.keyboard.press("Tab");
    await page.keyboard.type("鍵盤新地圖");
    await page.keyboard.press("Enter");
    const open3 = await isOpen();
    const a3b = await active();
    const okEnabled3 = await dialog().getByRole("button", { name: "確定", exact: true }).isEnabled();
    const after3 = await editorState();
    run.check("新圖鍵盤-3 開著時把焦點移到背後的「匯入」：拉回視窗的 map_id 欄；填好 map_id 與名稱後在名稱欄按 Enter：視窗仍開著、焦點仍在名稱欄，畫面上的地圖沒有換（Enter 不等於確定）",
      a3.name === "map_id" && a3.inDialog && open3 && a3b.name === "名稱" && okEnabled3 && same(after3, before1),
      { a3, open3, a3b, okEnabled3, id: after3.id });

    // (4) Esc 等同取消：關閉、焦點回到「＋ 新增地圖」，畫面不變、沒有寫入；監聽移除，Tab 照常走到頁面上的下一個控制項
    await page.keyboard.press("Escape");
    const open4 = await isOpen();
    const a4 = await active();
    const after4 = await editorState();
    const l4 = await listeners();
    const a4b = (await press("Tab"))[0];
    run.check("新圖鍵盤-4 填了欄位後按 Esc：視窗關閉、焦點回到「＋ 新增地圖」；地圖、波次、狀態列與尚未保存的提示都不變，沒有任何寫入；document 的 focusin／keydown 監聽回到開啟前，Tab 走到頁面上的下一個控制項（沒有被拉回）",
      !open4 && a4.name === "＋ 新增地圖" && same(after4, before1) && (await writes()) === writes0 &&
        l4.focusin === l0.focusin && l4.keydown === l0.keydown && a4b.name !== "＋ 新增地圖" && a4b.name !== "(body)" && !a4b.inDialog,
      { open4, a4, l4, a4b, id: after4.id });

    // (5) 再開：欄位重設；填好後「確定」加入循環；Shift+Tab 到「取消」按 Enter 關閉
    await openByKey();
    const a5 = await active();
    const empty5 = await dialog().getByRole("textbox", { name: "map_id", exact: true }).inputValue();
    await page.keyboard.type("kb_cancel_probe");
    await page.keyboard.press("Tab");
    await page.keyboard.type("取消用");
    const fwd5 = await press("Tab", 7);
    const rev5 = await press("Shift+Tab", 2);
    await page.keyboard.press("Enter");
    const open5 = await isOpen();
    const a5b = await active();
    const after5 = await editorState();
    run.check("新圖鍵盤-5 再開：焦點在 map_id、欄位已重設；填好 map_id 與名稱後「確定」可用並加入循環（…高→取消→確定→回到 map_id），Shift+Tab 從 map_id 到「確定」再到「取消」；在「取消」按 Enter：視窗關閉、焦點回到「＋ 新增地圖」，畫面不變、沒有寫入",
      a5.name === "map_id" && empty5 === "" &&
        names(fwd5).join("|") === "章節|解鎖條件|寬 (Cols)|高 (Rows)|取消|確定|map_id" && names(rev5).join("|") === "確定|取消" &&
        allIn([...fwd5, ...rev5]) && !open5 && a5b.name === "＋ 新增地圖" && same(after5, before1) && (await writes()) === writes0,
      { a5, empty5, fwd5: names(fwd5), rev5: names(rev5), open5, a5b, id: after5.id });

    // (6) 點遮罩關閉，焦點回到「＋ 新增地圖」
    await openByKey();
    await page.mouse.click(6, 400);
    await page.waitForFunction(() => !document.querySelector('[data-testid="new-map-modal"]'), null, { timeout: 5000 }).catch(() => {});
    const open6 = await isOpen();
    const a6 = await active();
    const after6 = await editorState();
    run.check("新圖鍵盤-6 點視窗外的遮罩：視窗關閉、焦點回到「＋ 新增地圖」，畫面不變、沒有寫入",
      !open6 && a6.name === "＋ 新增地圖" && same(after6, before1) && (await writes()) === writes0, { open6, a6, id: after6.id });

    // (7) 有尚未保存的波次：Esc 不動；勾選框加入循環，空白鍵勾選、在「確定」按空白鍵 → 沿用 4 波（照既有規則）
    await loadMap("chapter1_1");
    await addWave();
    const before7 = await editorState();
    await openByKey();
    await page.keyboard.press("Escape");
    const esc7 = { open: await isOpen(), a: await active(), state: await editorState() };
    await openByKey();
    await page.keyboard.type("kb_keep_waves");
    await page.keyboard.press("Tab");
    await page.keyboard.type("鍵盤沿用波次");
    const fwd7 = await press("Tab", 5);
    await page.keyboard.press(" ");
    const keep7 = await dialog().getByRole("checkbox").isChecked();
    const fwd7b = await press("Tab", 3);
    const rev7 = await press("Shift+Tab", 1);
    const desc7 = await page.evaluate(() => {
      const ok = document.activeElement;
      return (ok?.getAttribute("aria-describedby") || "").split(" ").map((id) => document.getElementById(id)?.textContent || "").join("");
    });
    await page.keyboard.press(" ");
    const open7 = await isOpen();
    const a7 = await active();
    const after7 = await editorState();
    run.check("新圖鍵盤-7 chapter1_1 加了一波（4 波未保存）：開啟後按 Esc，視窗關閉、焦點回到「＋ 新增地圖」，4 波與尚未保存的提示都不變",
      !esc7.open && esc7.a.name === "＋ 新增地圖" && same(esc7.state, before7) && before7.waves.length === 4 && /波次有尚未保存的修改/.test(before7.dirty),
      { esc7: { open: esc7.open, a: esc7.a, waves: esc7.state.waves.length }, dirty: before7.dirty });
    run.check("新圖鍵盤-8 有波次時勾選框加入循環（…高→沿用目前波次→取消→確定→回到 map_id）：空白鍵勾選；「確定」的說明連到「尚未保存的波次會被取代」；在「確定」按空白鍵：建立 kb_keep_waves、沿用同樣的 4 波並標示尚未保存，焦點回到「＋ 新增地圖」，沒有寫入",
      names(fwd7).join("|") === "章節|解鎖條件|寬 (Cols)|高 (Rows)|checkbox" && keep7 && names(fwd7b).join("|") === "取消|確定|map_id" &&
        names(rev7).join("|") === "確定" && allIn([...fwd7, ...fwd7b, ...rev7]) && /尚未保存的波次，確定後會被取代/.test(desc7) &&
        !open7 && a7.name === "＋ 新增地圖" && after7.id === "kb_keep_waves" && same(after7.waves, before7.waves) &&
        /沿用原本畫面的 4 波波次（還沒保存）/.test(after7.status) && /波次有尚未保存的修改/.test(after7.dirty) && (await writes()) === writes0,
      { fwd7: names(fwd7), keep7, fwd7b: names(fwd7b), rev7: names(rev7), desc7, open7, a7, id: after7.id, waves: after7.waves.length, status: after7.status });

    // (8) 不勾選、在「確定」按 Enter：波次清空（照既有規則）
    await openByKey();
    await page.keyboard.type("kb_no_waves");
    await page.keyboard.press("Tab");
    await page.keyboard.type("鍵盤不沿用");
    const rev8 = await press("Shift+Tab", 2);
    await page.keyboard.press("Enter");
    const a8 = await active();
    const after8 = await editorState();
    const l8 = await listeners();
    run.check("新圖鍵盤-9 不勾選、Shift+Tab 經 map_id 到「確定」按 Enter：建立 kb_no_waves、沒有波次（原本 4 波沒有沿用），焦點回到「＋ 新增地圖」；開關 6 次後 document 的 focusin／keydown 監聽回到開啟前；全程沒有任何寫入",
      names(rev8).join("|") === "map_id|確定" && a8.name === "＋ 新增地圖" && after8.id === "kb_no_waves" && after8.waves.length === 0 &&
        /已建立新地圖「kb_no_waves」的草稿（還沒保存到設定）；沒有波次/.test(after8.status) &&
        l8.focusin === l0.focusin && l8.keydown === l0.keydown && (await writes()) === writes0,
      { rev8: names(rev8), a8, id: after8.id, waves: after8.waves.length, status: after8.status, l8 });

    // (9) 390×600 與 320×600：從第一欄 Tab 到最後一個按鈕，每一項捲到可見、沒有被導覽列或浮動按鈕蓋住、焦點外框看得到
    await addWave();
    const focusInfo = () => page.evaluate(() => {
      const a = document.activeElement;
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        inView: r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.left >= 0 && r.right <= window.innerWidth + 1,
        onTop: !!hit && (hit === a || a.contains(hit) || hit.contains(a)),
        ring: (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none",
      };
    });
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 600 });
      await openByKey();
      await page.keyboard.type(`kb_narrow_${w}`);
      const seq = [{ ...(await active()), ...(await focusInfo()) }];
      await page.keyboard.press("Tab");
      await page.keyboard.type("窄畫面");
      seq.push({ ...(await active()), ...(await focusInfo()) });
      for (let i = 0; i < 7; i++) {
        await page.keyboard.press("Tab");
        seq.push({ ...(await active()), ...(await focusInfo()) });
        if (i === 4) await H.shot(page, `map-editor-save-new-modal-keyboard-${w}x600`);
      }
      const wrap = (await press("Tab"))[0];
      await page.keyboard.press("Escape");
      const closed = { open: await isOpen(), a: await active() };
      const bad = seq.filter((s) => !s.inDialog || !s.inView || !s.onTop || !s.ring);
      run.check(`新圖鍵盤-${w === 390 ? 10 : 11} ${w}×600：從 map_id 用 Tab 依序走到名稱、章節、解鎖條件、寬、高、沿用目前波次、取消、確定，每一項都在視窗裡、捲到畫面內、中心點沒有被導覽列或浮動按鈕蓋住、看得到焦點外框；再 Tab 回到 map_id，Esc 關閉後焦點回到「＋ 新增地圖」`,
        names(seq).join("|") === "map_id|名稱|章節|解鎖條件|寬 (Cols)|高 (Rows)|checkbox|取消|確定" && bad.length === 0 &&
          wrap.name === "map_id" && !closed.open && closed.a.name === "＋ 新增地圖",
        { seq: names(seq), bad, wrap, closed });
    }
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  // ── 18. 390 寬、矮畫面與鍵盤 ──
  await section("narrow", async () => {
    await page.setViewportSize({ width: 390, height: 600 });
    await openEditor();
    await loadList();
    const panel = page.locator('[data-testid="map-integrity"]');
    await panel.scrollIntoViewIfNeeded();
    const box = await panel.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, vw: window.innerWidth }; });
    const filter = page.getByRole("group", { name: "依資料狀態篩選地圖" }).getByRole("button", { name: /^待補資料 [0-9]+$/ });
    await filter.focus();
    await page.keyboard.press("Enter");
    const pressed = await filter.getAttribute("aria-pressed");
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => ({ text: document.activeElement?.textContent || "", inList: !!document.activeElement?.closest('[data-testid="integrity-list"]') }));
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    // 回到清單第一項並用空白鍵選取
    await page.locator('[data-testid="integrity-list"] button').first().focus();
    await page.keyboard.press(" ");
    await page.waitForSelector('[data-testid="integrity-selected"]', { timeout: 5000 });
    const sel = await text("integrity-selected");
    const visible = await page.locator('[data-testid="integrity-selected"]').evaluate((el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.right <= window.innerWidth + 1; });
    await page.locator('[data-testid="integrity-selected"]').scrollIntoViewIfNeeded();
    await H.shot(page, "map-editor-save-390x600");
    run.check("窄版-1 390×600：資料檢查面板在畫面寬度內；篩選按鈕用 Enter 切換（aria-pressed），Tab 進到清單項目，空白鍵選取後顯示詳細",
      box.left >= 0 && box.right <= box.vw + 1 && pressed === "true" && focused.inList && /待補資料|缺/.test(sel) && visible,
      { box, pressed, focused, sel: sel.slice(0, 80), visible });

    // 新地圖視窗與匯入區：沿用波次的選項、取代提醒在畫面內，可以用鍵盤勾選
    await loadMap("chapter1_1");
    await addWave();
    const opts = page.locator('[data-testid="map-import-options"]');
    await opts.scrollIntoViewIfNeeded();
    const optBox = await opts.evaluate((el) => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, vw: window.innerWidth }; });
    await H.shot(page, "map-editor-save-import-390x600");
    await btn("＋ 新增地圖").click();
    const keep = page.locator('[data-testid="new-keep-waves"]');
    await keep.focus();
    await page.keyboard.press(" ");
    const keepChecked = await keep.isChecked();
    const warn = page.locator('[data-testid="new-replace-warn"]');
    await warn.scrollIntoViewIfNeeded();
    const modalBox = await page.locator('[data-testid="new-map-modal"]').evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: window.innerWidth, vh: window.innerHeight, scroll: el.scrollHeight > el.clientHeight }; });
    const warnVisible = await warn.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1; });
    // 捲到每一個元素後，它的中心點最上層的元素要在它裡面（沒有被全站導覽列、說明或聊天按鈕蓋住）
    const onTop = async (loc) => {
      await loc.scrollIntoViewIfNeeded();
      return loc.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return !!hit && (hit === el || el.contains(hit) || hit.contains(el)) ? true : (hit ? (hit.outerHTML || "").slice(0, 80) : null);
      });
    };
    const modalLoc = page.locator('[data-testid="new-map-modal"]');
    const covered = {
      title: await onTop(modalLoc.locator('[class*="modalTitle"]')),
      firstInput: await onTop(modalLoc.locator("input").first()),
      keep: await onTop(keep),
      ok: await onTop(modalLoc.getByRole("button", { name: "確定", exact: true })),
      cancel: await onTop(modalLoc.getByRole("button", { name: "取消", exact: true })),
    };
    const floatingShown = await page.evaluate(() => [...document.querySelectorAll("[data-floating-entry]")].filter((e) => getComputedStyle(e).visibility !== "hidden").length);
    await H.shot(page, "map-editor-save-new-modal-390x600");
    await modalLoc.getByRole("button", { name: "取消", exact: true }).click();
    const floatingBack = await page.evaluate(() => [...document.querySelectorAll("[data-floating-entry]")].filter((e) => getComputedStyle(e).visibility !== "hidden").length);
    run.check("窄版-2 390×600：匯入區在畫面寬度內；新地圖視窗不超出畫面（內容多時在視窗內捲動），「沿用目前波次」可以用空白鍵勾選，取代提醒捲到後完整可見；視窗的標題、第一個欄位、勾選、確定與取消都沒有被全站導覽列或浮動按鈕蓋住（視窗開啟時說明與聊天按鈕暫時隱藏，關閉後恢復）",
      optBox.left >= 0 && optBox.right <= optBox.vw + 1 && keepChecked && modalBox.top >= 0 && modalBox.bottom <= modalBox.vh + 1 && modalBox.left >= 0 && modalBox.right <= modalBox.vw + 1 && warnVisible &&
        Object.values(covered).every((v) => v === true) && floatingShown === 0 && floatingBack > 0,
      { optBox, keepChecked, modalBox, warnVisible, covered, floatingShown, floatingBack });
  });

  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
  out.requests = (await reqLog().catch(() => [])).length;
  if (node) out.backendLog = node.log.length;
  // 選段名稱打錯時整支都會被跳過：直接判定失敗，不讓「什麼都沒跑」看起來像通過
  if (ONLY.length) {
    const unknown = ONLY.filter((n) => !sectionNames.includes(n));
    run.check("MAP_EDITOR_ONLY 的段落名稱都認得（只跑一部分，結果是局部的）", unknown.length === 0, { unknown, known: sectionNames });
  }
  return run.finish(out);
}
