async (page) => {
  // 地圖編輯器敵人表：試算表的 movement_type 欄不明或缺少時，飛行的設定不能假裝保存成功（瀏覽器，mock）
  // - 後端依表頭寫入：沒有這一欄時移動方式會被丟掉（遊戲當作地面）。前端只在「確定有這一欄」時送出飛行
  // - 情境：還沒載入、載入失敗（含載入過後重新載入失敗）、新後端（回報表頭 columns）有欄空表／缺欄空表／缺欄非空表、
  //   舊後端（沒有 columns）空表有欄／空表缺欄、刪光資料再新增、讀取之後表頭才被移除（新後端在寫入前拒絕）
  // - 擋下時不送出請求、不問管理密碼、沒有成功提示；地面資料的編輯不會被擋；成功時重新讀回仍是 flying
  // - 預設用腳本內建的模擬後端（和後端草稿的規則相同：新後端回 columns，缺欄時拒絕飛行值 409 MOVEMENT_COLUMN_MISSING；
  //   舊後端沒有 columns、照表頭丟掉沒有的欄位）。tools/run-browser.mjs 設定 GAS_BACKEND 為提供 enemyTable 等介面的模組時，
  //   改由那個模組處理（例如在模擬試算表上執行真正的後端程式）
  // 全部虛構資料，測試用密碼
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const TOKEN = "test-enemy-column-token-5d2";
  const HEAD = ["enemy_id", "name", "type", "level", "speed", "hp", "atk", "armor", "attack_range", "trait", "notes", "image", "attack_image"];
  const WITH = [...HEAD.slice(0, 2), "movement_type", ...HEAD.slice(2)];
  const row = (header, o) => header.map((h) => (o[h] === undefined ? "" : o[h]));
  const enemy = (id, name, movement) => ({ enemy_id: id, name, type: "", level: 1, speed: 60, hp: 20, atk: 10, armor: 0, attack_range: 1, trait: "", notes: "", image: "", attack_image: "", ...(movement === undefined ? {} : { movement_type: movement }) });

  // ── 後端（內建模擬或 GAS_BACKEND 的模組）──
  const factory = ctx.__shenmaGasBackendFactory;
  const candidate = factory ? factory() : null;
  const node = candidate && typeof candidate.enemyTable === "function" ? candidate : null;
  out.backend = node ? node.kind : "built-in";
  if (node) {
    node.setAdminToken(TOKEN);
    try {
      await ctx.exposeBinding("__shenmaEnemyBackend", (_src, body) => node.handle(body));
    } catch {
      /* 同一個 context 已經登記過 */
    }
  }
  await ctx.addInitScript(({ token }) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    const TABLE = "__shenma_enemycol_table";
    const LOG = "__shenma_enemycol_log";
    const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
    const strip = (v) => {
      const s = String(v === null || v === undefined ? "" : v);
      let a = 0;
      let b = s.length;
      while (a < b && s.charCodeAt(a) <= 32) a++;
      while (b > a && s.charCodeAt(b - 1) <= 32) b--;
      return s.slice(a, b);
    };
    // 內建的模擬後端：新後端回 columns 並在缺欄時拒絕飛行值；舊後端（legacy）沒有 columns、照表頭丟掉沒有的欄位
    const builtIn = (body) => {
      const t = read(TABLE, null);
      if (!t) return { status: 500, error: "MOCK_NO_TABLE" };
      if (body.action === "get_enemies_config") {
        const enemies = t.rows.map((r) => Object.fromEntries(t.header.map((h, i) => [h, r[i] === undefined ? "" : r[i]])));
        return t.legacy ? { status: 200, enemies } : { status: 200, enemies, columns: t.header.filter((h) => h !== "").map(String) };
      }
      const p = body.payload || {};
      if (p.admin_token !== token) return { status: 403, error: "ADMIN_REQUIRED" };
      const list = p.enemies;
      if (!Array.isArray(list) || list.length === 0) return { status: 400, error: "MISSING_ENEMIES" };
      if (!t.legacy && !t.header.includes("movement_type")) {
        const ids = list.filter((o) => strip(o.movement_type) === "flying").map((o) => String(o.enemy_id));
        if (ids.length) return { status: 409, error: "MOVEMENT_COLUMN_MISSING", column: "movement_type", count: ids.length, enemy_ids: ids.slice(0, 20) };
      }
      t.rows = list.map((o) => t.header.map((h) => (o[h] === undefined || o[h] === null ? "" : o[h])));
      localStorage.setItem(TABLE, JSON.stringify(t));
      return { status: 200, success: true, message: "ENEMIES_SAVED", count: list.length };
    };
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      const mode = localStorage.getItem("__shenma_enemycol_on");
      if (!mode || !url.startsWith("https://script.google.com/")) return inner(input, init);
      let body = {};
      try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
      if (body.action !== "get_enemies_config" && body.action !== "save_enemies_config") return inner(input, init);
      const reply = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
      const log = (e) => localStorage.setItem(LOG, JSON.stringify([...read(LOG, []), { t: Date.now(), ...e }]));
      if (body.action === "get_enemies_config" && localStorage.getItem("__shenma_enemycol_failload") === "1") {
        log({ action: body.action, status: 500, error: "MOCK_LOAD_FAILED" });
        return reply({ status: 500, error: "MOCK_LOAD_FAILED" });
      }
      const res = mode === "node" && window.__shenmaEnemyBackend ? await window.__shenmaEnemyBackend(body) : builtIn(body);
      log({ action: body.action, status: res.status, error: res.error || null, enemies: body.payload && body.payload.enemies, columns: res.columns });
      return reply(res);
    };
  }, { token: TOKEN });

  const server = {
    async set(t) {
      if (node) return node.setEnemyTable(t);
      await page.evaluate((t) => localStorage.setItem("__shenma_enemycol_table", JSON.stringify(t)), t);
      return "built-in";
    },
    // 管理者直接在試算表改表頭（不經過後端）
    async mutate(t) {
      if (node) return node.mutateEnemyTable(t);
      await page.evaluate((t) => {
        const cur = JSON.parse(localStorage.getItem("__shenma_enemycol_table"));
        localStorage.setItem("__shenma_enemycol_table", JSON.stringify({ ...cur, header: t.header, rows: t.rows }));
      }, t);
    },
    async table() {
      if (node) return node.enemyTable();
      return page.evaluate(() => {
        const t = JSON.parse(localStorage.getItem("__shenma_enemycol_table"));
        return { header: t.header, rows: t.rows };
      });
    },
    journal: () => (node ? node.journalRows() : null),
  };

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const reqLog = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_enemycol_log") || "[]"));
  const saves = async () => (await reqLog()).filter((e) => e.action === "save_enemies_config");
  const visibleBtn = (text) => page.locator("button:visible", { hasText: text }).first();
  const msg = () => page.locator('span[class*="statusMsg"]').innerText().catch(() => "");
  const tr = (i) => page.locator("tbody tr").nth(i);
  const selects = () => page.evaluate(() => [...document.querySelectorAll('select[data-testid="enemy-movement-select"]')].map((s) => s.value));
  const notices = () =>
    page.evaluate(() => {
      const m = document.querySelector('[data-testid="enemy-movement-missing"]');
      const u = document.querySelector('[data-testid="enemy-movement-column-unknown"]');
      return {
        missing: m ? m.innerText.replace(/\s+/g, " ") : null, missingSource: m ? m.getAttribute("data-source") : null,
        unknown: u ? u.innerText.replace(/\s+/g, " ") : null, unknownReason: u ? u.getAttribute("data-reason") : null,
        success: /已儲存/.test(document.querySelector('span[class*="statusMsg"]')?.innerText || ""),
      };
    });
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `enemy-column-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };
  // 開新的編輯器頁面（React 狀態與管理密碼都從頭開始）
  const openEditor = async () => {
    await page.goto(H.BASE + "/mapEditor");
    const end = Date.now() + 30000;
    for (;;) {
      await page.getByRole("button", { name: "⚔️ 物件" }).click();
      await H.sleep(400);
      if (await page.getByRole("button", { name: "⚔️ 敵人設定" }).isVisible()) break;
      if (Date.now() > end) throw new Error("等不到物件分頁");
    }
    await page.getByRole("button", { name: "⚔️ 敵人設定" }).click();
    await H.sleep(300);
  };
  const load = async () => {
    const n = (await reqLog()).filter((e) => e.action === "get_enemies_config").length;
    await visibleBtn("📥 從 Sheet 載入").click();
    // 等這一次的讀取請求有了回應（前一次的訊息可能也是「已載入」或「✗」）
    await page.waitForFunction(
      (n) =>
        JSON.parse(localStorage.getItem("__shenma_enemycol_log") || "[]").filter((e) => e.action === "get_enemies_config").length > n &&
        /^(✓ 已載入 \d+ 筆|✗)/.test(document.querySelector('span[class*="statusMsg"]')?.innerText || ""),
      n,
      { timeout: 30000, polling: 100 }
    );
    await H.sleep(200);
    return { msg: await msg() };
  };
  const addRow = async (id, name) => {
    await visibleBtn("＋ 新增列").click();
    await H.sleep(150);
    const r = tr((await page.locator("tbody tr").count()) - 1);
    await r.locator("input").nth(0).fill(id);
    await r.locator("input").nth(1).fill(name);
  };
  const setMove = async (i, v) => {
    await tr(i).locator('select[data-testid="enemy-movement-select"]').selectOption(v);
    await H.sleep(150);
  };
  // 按儲存：前端擋下時沒有請求、不問密碼；送出時等到回應後的訊息
  const trySave = async () => {
    const n = (await saves()).length;
    await visibleBtn("💾 儲存至 Sheet").click();
    const prompted = await page.waitForSelector('[data-testid="admin-token-input"]', { timeout: 1500 }).then(() => true).catch(() => false);
    if (prompted) {
      await page.locator('[data-testid="admin-token-input"]').fill(TOKEN);
      await page.locator('[data-testid="admin-token-submit"]').click();
    }
    const end = Date.now() + 15000;
    for (;;) {
      const s = await saves();
      const m = await msg();
      if (s.length > n && /^(✓ 已儲存|✗)/.test(m)) return { sent: true, prompted, res: { status: s[s.length - 1].status, error: s[s.length - 1].error }, payload: s[s.length - 1].enemies, msg: m };
      if (s.length === n && !prompted && /^✗/.test(m)) return { sent: false, prompted, msg: m };
      if (Date.now() > end) return { sent: s.length > n, prompted, msg: m, timeout: true };
      await H.sleep(150);
    }
  };
  const fresh = async (t) => {
    await page.evaluate(() => {
      localStorage.setItem("__shenma_enemycol_on", "1");
      localStorage.removeItem("__shenma_enemycol_log");
      localStorage.removeItem("__shenma_enemycol_failload");
    });
    if (node) await page.evaluate(() => localStorage.setItem("__shenma_enemycol_on", "node"));
    const b = await server.set(t);
    await openEditor();
    return b;
  };

  await page.goto(H.BASE + "/mapEditor");

  // ── E1. 還沒載入 ──
  await section("E1", async () => {
    await fresh({ header: WITH, rows: [row(WITH, enemy("g1", "步兵", "ground"))], legacy: false });
    await addRow("fly_new", "飛騎");
    await setMove(0, "flying");
    const n = await notices();
    const r = await trySave();
    out.E1 = { n, r, shot: await H.shot(page, "enemy-column-e1-not-loaded") };
    run.check("E-1 還沒從 Sheet 載入就設定飛行：顯示「尚無法確認」（不說成沒有這一欄）；儲存被擋下，沒有送出、沒有問密碼、沒有成功提示",
      n.unknownReason === "not_loaded" && /尚無法確認/.test(n.unknown || "") && n.missing === null &&
        !r.sent && !r.prompted && /還沒有從 Sheet 載入/.test(r.msg) && !/已儲存/.test(r.msg),
      out.E1);
  });

  // ── E2. 載入失敗（第一次就失敗；載入過之後重新載入失敗）──
  await section("E2", async () => {
    await fresh({ header: WITH, rows: [row(WITH, enemy("f1", "飛騎", "flying")), row(WITH, enemy("g1", "步兵", "ground"))], legacy: false });
    await page.evaluate(() => localStorage.setItem("__shenma_enemycol_failload", "1"));
    const l1 = await load();
    const n1 = await notices();
    await addRow("fly_new", "飛騎二");
    await setMove(0, "flying");
    const r1 = await trySave();
    run.check("E-2 第一次載入就失敗：說明載入失敗、尚無法確認；新增飛行的儲存被擋下（沒有送出）",
      /^✗/.test(l1.msg) && n1.unknownReason === "load_failed" && /載入失敗/.test(n1.unknown || "") && n1.missing === null && !r1.sent && /載入失敗/.test(r1.msg),
      { l1, n1, r1 });

    await openEditor();
    await page.evaluate(() => localStorage.removeItem("__shenma_enemycol_failload"));
    const l2 = await load();
    await page.evaluate(() => localStorage.setItem("__shenma_enemycol_failload", "1"));
    const l3 = await load();
    const n3 = await notices();
    const vals = await selects();
    const r3 = await trySave();
    await page.evaluate(() => localStorage.removeItem("__shenma_enemycol_failload"));
    out.E2 = { l2, l3, n3, vals, r3, shot: await H.shot(page, "enemy-column-e2-reload-failed") };
    run.check("E-2b 載入成功後重新載入失敗：表格保留上一次的內容（含飛騎），但欄位狀態變成無法確認；含飛行的儲存被擋下（不沿用舊的確認結果）",
      /已載入 2 筆/.test(l2.msg) && /^✗/.test(l3.msg) && same(vals, ["flying", "ground"]) && n3.unknownReason === "load_failed" && !r3.sent && /載入失敗/.test(r3.msg),
      out.E2);
  });

  // ── E3. 新後端：有欄、空表 → 可以新增第一個飛行敵人 ──
  await section("E3", async () => {
    const b = await fresh({ header: WITH, rows: [], legacy: false });
    const l = await load();
    const n = await notices();
    await addRow("fly_first", "空表飛騎");
    await setMove(0, "flying");
    const r = await trySave();
    const t = await server.table();
    const l2 = await load();
    const vals = await selects();
    out.E3 = { b, l, n, r, t, l2, vals, shot: await H.shot(page, "enemy-column-e3-empty-with-column") };
    run.check("E-3 新後端回報表頭：有 movement_type 欄的空表載入 0 筆、沒有任何警告；新增飛行敵人儲存成功，試算表寫入 flying，重新載入仍是飛行",
      /已載入 0 筆/.test(l.msg) && n.missing === null && n.unknown === null && r.sent && r.res.status === 200 && /已儲存 1 筆/.test(r.msg) &&
        t.rows.length === 1 && t.rows[0][WITH.indexOf("movement_type")] === "flying" && /已載入 1 筆/.test(l2.msg) && same(vals, ["flying"]),
      out.E3);
  });

  // ── E4. 新後端：缺欄、空表 ──
  await section("E4", async () => {
    await fresh({ header: HEAD, rows: [], legacy: false });
    const l = await load();
    const n = await notices();
    await addRow("fly_x", "飛騎");
    await setMove(0, "flying");
    const r = await trySave();
    await setMove(0, "ground");
    const r2 = await trySave();
    const t = await server.table();
    out.E4 = { l, n, r, r2, t, shot: await H.shot(page, "enemy-column-e4-empty-no-column") };
    run.check("E-4 新後端回報表頭：缺 movement_type 欄的空表明確說「沒有這一欄」（不是尚無法確認）；飛行的儲存被擋下（沒有送出）；改回地面後照常儲存",
      /已載入 0 筆/.test(l.msg) && n.missingSource === "columns" && /沒有 movement_type 欄/.test(n.missing || "") && n.unknown === null &&
        !r.sent && /沒有 movement_type 欄/.test(r.msg) && r2.sent && r2.res.status === 200 && t.rows.length === 1 && !t.header.includes("movement_type"),
      out.E4);
  });

  // ── E5. 新後端：缺欄、有資料 → 只改地面資料不被擋 ──
  await section("E5", async () => {
    await fresh({ header: HEAD, rows: [row(HEAD, enemy("g1", "步兵")), row(HEAD, enemy("g2", "騎兵"))], legacy: false });
    await load();
    const n = await notices();
    await tr(0).locator("input").nth(1).fill("步兵改");
    const r = await trySave();
    const t = await server.table();
    await setMove(1, "flying");
    const r2 = await trySave();
    const t2 = await server.table();
    out.E5 = { n, r, t, r2 };
    run.check("E-5 缺欄但有資料：只改名稱（地面）照常儲存、沒有被擋；把騎兵改成飛行時擋下、試算表不變",
      n.missingSource === "columns" && r.sent && r.res.status === 200 && t.rows[0][HEAD.indexOf("name")] === "步兵改" && !r2.sent && same(t, t2),
      out.E5);
  });

  // ── E6. 舊後端（沒有表頭資訊）：有欄、空表 → 無法確認；先存地面、重新載入後就能確認 ──
  await section("E6", async () => {
    await fresh({ header: WITH, rows: [], legacy: true });
    const l = await load();
    const n = await notices();
    await addRow("fly_legacy", "舊表飛騎");
    await setMove(0, "flying");
    const r = await trySave();
    await setMove(0, "ground");
    const r2 = await trySave();
    const l2 = await load();
    const n2 = await notices();
    await setMove(0, "flying");
    const r3 = await trySave();
    const l3 = await load();
    const vals = await selects();
    const t = await server.table();
    out.E6 = { l, n, r, r2, l2, n2, r3, l3, vals, t, shot: await H.shot(page, "enemy-column-e6-legacy-empty") };
    run.check("E-6 舊後端的空表：說「尚無法確認」並提供操作（先存地面再重新載入），不說成沒有這一欄；飛行的儲存被擋下（沒有送出）",
      /已載入 0 筆/.test(l.msg) && n.unknownReason === "no_rows" && /尚無法確認/.test(n.unknown || "") && /先把移動方式設為地面儲存/.test(n.unknown || "") && n.missing === null &&
        !r.sent && /尚無法確認/.test(r.msg),
      { l, n, r });
    run.check("E-6b 先存地面、重新載入後由資料列確認有這一欄（沒有警告）；再改成飛行就能儲存，重新載入仍是飛行",
      r2.sent && r2.res.status === 200 && /已載入 1 筆/.test(l2.msg) && n2.unknown === null && n2.missing === null &&
        r3.sent && r3.res.status === 200 && /已儲存/.test(r3.msg) && same(vals, ["flying"]) && t.rows[0][WITH.indexOf("movement_type")] === "flying",
      { r2, l2, n2, r3, l3, vals });
  });

  // ── E7. 舊後端：缺欄、空表 → 無法確認；存地面後重新載入 → 確定沒有這一欄 ──
  await section("E7", async () => {
    await fresh({ header: HEAD, rows: [], legacy: true });
    await load();
    const n = await notices();
    await addRow("g_legacy", "舊表步兵");
    await setMove(0, "flying");
    const r = await trySave();
    await setMove(0, "ground");
    const r2 = await trySave();
    await load();
    const n2 = await notices();
    await setMove(0, "flying");
    const r3 = await trySave();
    out.E7 = { n, r, r2, n2, r3 };
    run.check("E-7 舊後端的缺欄空表：先是尚無法確認（擋下飛行）；存地面、重新載入後確定沒有這一欄，飛行仍被擋下（沒有送出）",
      n.unknownReason === "no_rows" && !r.sent && r2.sent && r2.res.status === 200 && n2.missingSource === "rows" && /沒有 movement_type 欄/.test(n2.missing || "") && !r3.sent,
      out.E7);
  });

  // ── E8. 刪光資料再新增 ──
  await section("E8", async () => {
    await fresh({ header: WITH, rows: [row(WITH, enemy("a", "甲", "ground")), row(WITH, enemy("b", "乙", "")), row(WITH, enemy("c", "丙", "air"))], legacy: false });
    await load();
    for (let i = 0; i < 3; i++) {
      await tr(0).getByRole("button", { name: "刪除" }).click();
      await H.sleep(100);
    }
    const empty = await page.locator("tbody tr").count();
    await addRow("fly_only", "唯一飛騎");
    await setMove(0, "flying");
    const r = await trySave();
    const t = await server.table();
    await load();
    const vals = await selects();
    out.E8 = { empty, r, t, vals };
    run.check("E-8 載入（有欄）後把資料刪光再新增飛行：可以儲存（欄位狀態來自表頭，不因畫面上沒有列而變成無法確認），試算表只剩這一列飛行",
      empty === 0 && r.sent && r.res.status === 200 && t.rows.length === 1 && t.rows[0][0] === "fly_only" && t.rows[0][WITH.indexOf("movement_type")] === "flying" && same(vals, ["flying"]),
      out.E8);
  });

  // ── E9. 讀取之後表頭才被移除：新後端在寫入前拒絕 ──
  await section("E9", async () => {
    const rows0 = [row(WITH, enemy("g1", "步兵", "ground")), row(WITH, enemy("g2", "騎兵", "ground"))];
    await fresh({ header: WITH, rows: rows0, legacy: false });
    await load();
    const n0 = await notices();
    const dropped = { header: HEAD, rows: rows0.map((r) => r.filter((_, i) => i !== WITH.indexOf("movement_type"))) };
    await server.mutate(dropped);
    const j0 = server.journal();
    await setMove(1, "flying");
    const r = await trySave();
    const n = await notices();
    const t = await server.table();
    const j1 = server.journal();
    const l = await load();
    const n2 = await notices();
    out.E9 = { n0, r, n, t, j0, j1, l, n2, shot: await H.shot(page, "enemy-column-e9-removed-after-load") };
    run.check("E-9 載入時有欄、之後管理者刪掉 movement_type 欄：送出飛行 → 後端拒絕（MOVEMENT_COLUMN_MISSING），畫面顯示中文說明與「可能在載入後被移除」，沒有成功提示",
      n0.missing === null && n0.unknown === null && r.sent && r.res.status === 409 && r.res.error === "MOVEMENT_COLUMN_MISSING" &&
        /沒有 movement_type 欄/.test(r.msg) && /沒有寫入/.test(r.msg) && !/MOVEMENT_COLUMN_MISSING/.test(r.msg) && !n.success && n.missingSource === "save" && /載入後被移除/.test(n.missing || ""),
      out.E9);
    run.check("E-9b 拒絕時試算表完全沒有改變（仍是刪欄後的內容）" + (node ? "、_config_backups 沒有新紀錄" : "") + "；重新載入後明確顯示沒有這一欄",
      same(t, dropped) && (node ? j0 === j1 : true) && /已載入 2 筆/.test(l.msg) && n2.missingSource === "columns",
      { t, dropped, j0, j1, n2 });
  });

  await page.evaluate(() => {
    for (const k of ["__shenma_enemycol_on", "__shenma_enemycol_table", "__shenma_enemycol_log", "__shenma_enemycol_failload"]) localStorage.removeItem(k);
  }).catch(() => {});
  if (node) out.files = node.files();
  return run.finish({ out });
}
