async (page) => {
  // 關卡資料未完成的入口（瀏覽器，真 Godot 產物、mock 後端）：兩個入口共用同一份判斷（utils/stagePlayability）
  // - 測試關（只在這支腳本加進 mock 名單，__shenma_sd_fixture）：有效、空路線（GAS 空白的形狀）、無法解析的路線字串、沒有波次、
  //   錯誤型別（路線是數字、波次是字串）、GAS 空白又未解鎖、資料完整但未解鎖。玩家進度是「錯誤型別」那一關
  // - M 主頁：進度那一關不能出征時不送關卡資料、不開新的一場、不顯示載入動畫，改顯示「尚未開放」與原因、「改打」與「選擇其他關卡」；
  //   關卡視窗的卡片分清「尚未開放」與「尚未解鎖」；在有效的戰場點尚未開放的關卡：只說明、目前的戰場（場次、戰鬥）不變；再選有效關卡照常；
  //   快速連點尚未開放的卡片不送任何東西、快速連點有效的卡片以最後一次為準；打完同一關的重玩照常
  // - B 獨立戰鬥頁直接進入：空路線、壞路線、缺波次、錯誤型別都是「尚未開放」、未解鎖的是「尚未解鎖」、兩者都有時仍是尚未開放並註明未解鎖；
  //   都不送關卡資料；有效的關卡照常開戰。關卡頁的卡片與點選同樣分清
  // - S 切換帳號（主頁）：在「尚未開放」的說明畫面切到進度有效的帳號時改用新帳號的進度；從有效的備戰切回來時不送關卡資料、顯示說明
  // - F 遊戲設定讀取失敗（主頁、戰鬥頁、關卡頁）：說明原因與重試，不是一直轉圈，也不送關卡資料；重試成功後繼續
  // - 每一段都核對：不能出征時遊戲 iframe 沒有收到任何關卡資料、沒有這一場的戰況、沒有 save_result，mock 後端與 session 的金幣與進度不變
  // - N：390 寬的說明與卡片在畫面內、字級至少 12px
  // 全部 mock、虛構金鑰 test_stagedata_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_stagedata_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';

  // ── 測試關（get_all_maps 的回應後面接上）──
  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[0, ROW], [13, ROW]] }, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const GAS_BLANK = { paths: [], spawn: [], base: [] };
  const grp = (enemy_id, count, interval) => ({ enemy_id, count, interval, path: "path_a" });
  // 慢兵、血厚：開戰後一直在戰鬥中（M-7 在戰鬥中點尚未開放的關卡）
  const W1 = [{ wave: 1, enemies: [grp("mock_a_slow", 2, 4.0)] }];
  const M = {
    ok: { id: "chapter3_1", name: "Mock SD 有效" },
    route: { id: "chapter3_2", name: "Mock SD 空路線" },
    json: { id: "chapter3_3", name: "Mock SD 壞路線" },
    waves: { id: "chapter3_4", name: "Mock SD 缺波次" },
    type: { id: "chapter3_5", name: "Mock SD 錯誤型別" },
    blankLocked: { id: "chapter3_6", name: "Mock SD 全空未解鎖" },
    locked: { id: "chapter3_7", name: "Mock SD 未解鎖" },
  };
  const map = (m, path_json, waves) => ({ map_id: m.id, chapter: 3, name: m.name, unlock_stage: m.id, path_json, waves });
  const EXTRA = [
    map(M.ok, pj, W1),
    map(M.route, GAS_BLANK, W1),
    map(M.json, "{bad json", W1),
    map(M.waves, pj, []),
    map(M.type, 123, "wave1"),
    map(M.blankLocked, GAS_BLANK, []),
    map(M.locked, pj, W1),
  ];
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_sd_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (j && j.status === 200 && Array.isArray(j.maps)) {
            j.maps = [...j.maps, ...extra];
            return new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          return res;
        }
      }
      return inner(input, init);
    };
  }, EXTRA);
  // 每個文件（包括遊戲 iframe）收到的訊息：遊戲 iframe 收到的關卡資料（帶 stage_id）就是網頁送出的新的一場
  await page.addInitScript(() => {
    if (window.__sdRecv) return;
    window.__sdRecv = [];
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (d && typeof d === "object" && d.stage_id !== undefined && d.type === undefined) window.__sdRecv.push({ stage_id: d.stage_id, battle_id: d.battle_id });
    });
  });

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const profile = (max_stage) => ({
    nickname: "關卡資料", level: 5, exp: 0, gold: 777, capacity: 30, max_stage, heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }],
  });
  const setup = async (max_stage, extra = {}) => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p, extra }) => {
      localStorage.setItem("__shenma_sd_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
      for (const [a, b] of Object.entries(extra)) localStorage.setItem(a, JSON.stringify(b));
    }, { k: KEY, p: profile(max_stage), extra });
  };
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const recv = (sel) => page.evaluate((sel) => {
    const f = document.querySelector(sel);
    return f && f.contentWindow ? (f.contentWindow.__sdRecv || []).slice() : null;
  }, sel);
  const statsOf = () => page.evaluate(() => (window.__bridgeLog || []).filter((m) => m.type === "update_stats").map((m) => ({ battle_id: m.battle_id, gs: m.game_state, wave: m.wave })));
  const lastStats = async () => (await statsOf()).slice(-1)[0] || null;
  const gasActions = async () => H.countActions(await H.gasLog(page));
  const store = () => page.evaluate(() => {
    const s = JSON.parse(sessionStorage.getItem("shenma_player_state") || "null");
    const db = JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}");
    const p = Object.values(db.profiles || {})[0] || null;
    return { session: s ? { gold: s.gold, max_stage: s.max_stage } : null, db: p ? { gold: p.gold, max_stage: p.max_stage } : null, logs: (db.battle_logs || []).length };
  });
  const blocked = () => page.evaluate(() => {
    const n = document.querySelector('[data-testid="stage-blocked"]');
    if (!n) return null;
    return {
      status: n.dataset.status,
      title: n.querySelector('div[class*="stageBlockedTitle"]')?.innerText.trim() ?? null,
      lines: [...n.querySelectorAll('[data-testid="stage-blocked-lines"] li')].map((l) => l.innerText.trim()),
      buttons: [...n.querySelectorAll("button")].map((b) => ({ id: b.dataset.testid, text: b.innerText.trim(), disabled: b.disabled })),
      focus: document.activeElement === n,
    };
  });
  const cards = () => page.evaluate(() => [...document.querySelectorAll('[data-testid="stage-card"]')].map((c) => ({
    id: c.dataset.mapId,
    access: c.dataset.access,
    button: c.querySelector('[data-testid="stage-select"]')?.innerText.trim(),
    disabled: c.querySelector('[data-testid="stage-select"]')?.disabled,
    note: c.querySelector('[data-testid="stage-data-note"]')?.innerText.replace(/\s+/g, " ").trim() ?? null,
    gaps: c.querySelector('[data-testid="stage-data-note"]')?.dataset.gaps ?? null,
    badges: [...c.querySelectorAll("span")].map((s) => s.innerText.trim()).filter((t) => /尚未開放|鎖定|最新/.test(t)),
    air: !!c.querySelector('[data-testid="air-readiness"]'),
  })));
  const byId = (list) => Object.fromEntries(list.map((c) => [c.id, c]));
  const loaderShown = () => page.evaluate(() => document.body.innerText.includes("調兵遣將中"));
  const openStageModal = async () => {
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector('[data-testid="stage-card"]', { timeout: 10000 });
  };
  const closeModals = async () => {
    for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
      await page.locator('button[class*="modalClose"]').last().click();
      await H.sleep(300);
    }
  };
  const cardSel = (id) => `[data-testid="stage-card"][data-map-id="${id}"]`;
  const dismissSplash = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
  // 等遊戲 iframe 載入完成（game_ready 之後才會送關卡資料；不能出征時就是等這一段時間確認沒有送）
  const waitReady = (timeout = 120000) =>
    page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "game_ready"), null, { timeout, polling: 200 });
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `stage-data-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await closeModals(); } catch { /* 沒有視窗可關 */ }
    }
  };
  // 不能出征：iframe 沒有收到關卡資料、沒有任何戰況、沒有 save_result，mock 後端與 session 的金幣／進度和一開始相同
  const noBattle = async (sel, start) => {
    const r = await recv(sel);
    const st = await statsOf();
    const acts = await gasActions();
    const now = await store();
    return {
      ok: Array.isArray(r) && r.length === 0 && st.length === 0 && !acts.save_result && same(now.session, start.session) && same(now.db, start.db) && now.logs === start.logs,
      recv: r, stats: st.length, save_result: acts.save_result || 0, store: now,
    };
  };

  // ── M. 主頁 ──
  let start = null;
  await section("M1", async () => {
    await setup(M.type.id);
    await page.setViewportSize({ width: 540, height: 900 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await waitReady();
    await page.waitForSelector('[data-testid="stage-blocked"]', { timeout: 30000 });
    await H.sleep(2500);
    start = { session: { gold: 777, max_stage: M.type.id }, db: { gold: 777, max_stage: M.type.id }, logs: 0 };
    const b = await blocked();
    const nb = await noBattle(IFRAME, start);
    out.M1 = { blocked: b, noBattle: nb, loader: await loaderShown(), shot: await H.shot(page, "stage-data-m1-main-blocked") };
    run.check("M-1 主頁的進度那一關（錯誤型別：路線是數字、波次是字串）：顯示「尚未開放」與原因（路線資料的格式不對、波次資料的格式不對）、寫明不是還沒通關；焦點在說明上；不顯示載入動畫",
      !!b && b.status === "incomplete" && b.title === `「${M.type.name}」尚未開放` && b.lines[0] === "關卡資料未完成：路線資料的格式不對、波次資料的格式不對。" &&
        /不是還沒通關，進度沒有改變/.test(b.lines[1]) && b.focus && !out.M1.loader, out.M1);
    run.check("M-2 出口：「改打「Mock SD 有效」」（進度內最後一個可以出征的關卡）與「選擇其他關卡」",
      !!b && same(b.buttons.map((x) => x.text), [`改打「${M.ok.name}」`, "選擇其他關卡"]) && b.buttons.every((x) => !x.disabled), b && b.buttons);
    run.check("M-3 沒有送出關卡資料：遊戲 iframe 沒有收到關卡資料、沒有這一場的戰況（沒有開新的一場）、沒有 save_result；mock 後端與 session 的金幣與進度不變", nb.ok, nb);
  });

  await section("M2", async () => {
    // 關卡視窗：卡片分清尚未開放（資料未完成，原因寫在卡片上）與尚未解鎖
    await page.locator('[data-testid="stage-blocked-choose"]').click();
    await page.waitForSelector('[data-testid="stage-card"]', { timeout: 10000 });
    const cs = byId(await cards());
    out.M2 = { cards: [M.ok, M.route, M.json, M.waves, M.type, M.blankLocked, M.locked].map((m) => cs[m.id]), shot: await H.shot(page, "stage-data-m2-modal-cards") };
    const inc = (m, gaps, note) => cs[m.id] && cs[m.id].access === "incomplete" && cs[m.id].button === "尚未開放" && cs[m.id].disabled === true &&
      cs[m.id].gaps === gaps && cs[m.id].note === note && cs[m.id].badges.includes("尚未開放") && !cs[m.id].air;
    run.check("M-4 關卡視窗的卡片：空路線、壞路線、缺波次、錯誤型別、全空未解鎖都是「尚未開放」（按鈕停用、卡片寫出原因、不顯示對空提醒）；資料完整但未解鎖的是「尚未解鎖」（鎖定）；有效的是「選擇關卡」",
      inc(M.route, "route", "關卡資料未完成：沒有可用的路線。暫時不能出征（不是還沒通關）。") &&
        inc(M.json, "route", "關卡資料未完成：路線資料的格式無法解析。暫時不能出征（不是還沒通關）。") &&
        inc(M.waves, "waves", "關卡資料未完成：沒有波次資料。暫時不能出征（不是還沒通關）。") &&
        inc(M.type, "route,waves", "關卡資料未完成：路線資料的格式不對、波次資料的格式不對。暫時不能出征（不是還沒通關）。") &&
        inc(M.blankLocked, "route,waves", "關卡資料未完成：沒有可用的路線、沒有波次資料。暫時不能出征（不是還沒通關）。") &&
        cs[M.locked.id].access === "locked" && cs[M.locked.id].button === "尚未解鎖" && cs[M.locked.id].disabled && cs[M.locked.id].badges.includes("鎖定") && cs[M.locked.id].note === null &&
        cs[M.ok.id].access === "playable" && cs[M.ok.id].button === "選擇關卡" && !cs[M.ok.id].disabled,
      out.M2.cards);
    // 快速連點尚未開放的卡片：只在視窗上方說明，不送任何東西
    await page.evaluate((sel) => { const c = document.querySelector(sel); c.click(); c.click(); c.click(); }, cardSel(M.waves.id));
    await H.sleep(800);
    const refused = await page.locator('[data-testid="stage-refused"]').innerText().catch(() => null);
    const nb = await noBattle(IFRAME, start);
    out.M2b = { refused, noBattle: nb, modalOpen: (await page.locator('[data-testid="stage-card"]').count()) > 0 };
    run.check("M-5 快速連點尚未開放的卡片（3 次）：視窗留著、上方說明「尚未開放」與原因與目前的戰場沒有改變；不送關卡資料、沒有戰況",
      out.M2b.modalOpen && /「Mock SD 缺波次」尚未開放（關卡資料未完成：沒有波次資料），不能出征；目前的戰場沒有改變/.test(refused || "") && nb.ok, out.M2b);
    await closeModals();
  });

  let okBattle = null;
  await section("M3", async () => {
    // 改打進度內可以出征的關卡：照常送關卡資料、開新的一場
    await page.locator('[data-testid="stage-blocked-latest"]').click();
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1 && m.wave === 0), null, { timeout: 60000, polling: 100 });
    const r = await recv(IFRAME);
    const st = await lastStats();
    okBattle = st && st.battle_id;
    out.M3 = { recv: r, stats: st, blocked: await blocked() };
    run.check("M-6 按「改打「Mock SD 有效」」：送出一次關卡資料（chapter3_1）、這一場的戰況是備戰、說明消失",
      Array.isArray(r) && r.length === 1 && r[0].stage_id === M.ok.id && !!st && st.battle_id === r[0].battle_id && st.gs === 1 && out.M3.blocked === null, out.M3);
  });

  await section("M4", async () => {
    // 在有效的戰場（戰鬥中）點尚未開放的關卡：目前的場次與戰鬥都不變
    await dismissSplash(IFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    await page.waitForFunction((id) => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.battle_id === id && m.game_state === 2), okBattle, { timeout: 30000, polling: 100 });
    const before = await recv(IFRAME);
    await openStageModal();
    await page.evaluate((sel) => document.querySelector(sel).click(), cardSel(M.route.id));
    await H.sleep(300);
    await page.locator(`${cardSel(M.json.id)} [data-testid="stage-select"]`).click({ force: true }).catch(() => {});
    await H.sleep(1000);
    const refused = await page.locator('[data-testid="stage-refused"]').innerText().catch(() => null);
    const after = await recv(IFRAME);
    const st = await lastStats();
    out.M4 = { refused, payloads: after.length - before.length, stats: st, shot: await H.shot(page, "stage-data-m4-refused-in-battle") };
    run.check("M-7 戰鬥中點尚未開放的關卡（空路線的卡片、壞路線的停用按鈕）：視窗說明不能出征、目前的戰場沒有改變；沒有送出新的關卡資料，戰況仍是同一場、戰鬥中",
      /「Mock SD 空路線」尚未開放（關卡資料未完成：沒有可用的路線）/.test(refused || "") && out.M4.payloads === 0 && !!st && st.battle_id === okBattle && st.gs === 2, out.M4);
    // 再選有效的關卡：照常切換（新的一場）
    await page.locator(`${cardSel("chapter1_2")} [data-testid="stage-select"]`).click();
    await page.waitForFunction((id) => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.battle_id !== id && m.game_state === 1 && m.wave === 0 && m.battle_id), okBattle, { timeout: 30000, polling: 100 });
    const r2 = await recv(IFRAME);
    const st2 = await lastStats();
    out.M4b = { last: r2.slice(-1)[0], stats: st2 };
    run.check("M-8 拒絕後再選有效的關卡（Mock B 對照關）：照常送出關卡資料、新的一場（battle_id 不同）在備戰",
      r2.length === after.length + 1 && r2.slice(-1)[0].stage_id === "chapter1_2" && !!st2 && st2.battle_id === r2.slice(-1)[0].battle_id && st2.battle_id !== okBattle && st2.gs === 1, out.M4b);
  });

  await section("M5", async () => {
    // 快速連點有效的卡片：以最後一次為準（畫面採用的戰況屬於最後送出的那一場）
    const before = await recv(IFRAME);
    await openStageModal();
    await page.evaluate((sel) => { const c = document.querySelector(sel); c.click(); c.click(); }, cardSel("chapter1_3"));
    await H.sleep(2500);
    const r = await recv(IFRAME);
    const sent = r.slice(before.length);
    const last = sent.slice(-1)[0] || null;
    const st = await lastStats();
    const hud = await H.hud(page);
    out.M5 = { sent, stats: st, hud };
    run.check("M-9 快速連點有效的卡片（Mock C 快速自動）：送出的都是這一關；遊戲最後的戰況屬於最後送出的那一場、在備戰；主頁顯示這一關",
      sent.length >= 1 && sent.every((x) => x.stage_id === "chapter1_3") && !!last && !!st && st.battle_id === last.battle_id && st.gs === 1 && hud.map === "Mock C 快速自動", out.M5);
    // 同一關的重玩：打完（自動、快騎漏到城池）→ 確認結算 → 自動送出同一關的新的一場
    await dismissSplash(IFRAME);
    await page.getByRole("button", { name: "自動", exact: true }).click();
    await page.waitForSelector('[data-testid="result-card"]', { timeout: 60000 });
    const n = (await recv(IFRAME)).length;
    await page.locator('[data-testid="result-card"] button').click();
    await page.waitForFunction((n) => {
      const f = document.querySelector('iframe[title="Shenma Sanguo"]');
      return f && (f.contentWindow.__sdRecv || []).length > n;
    }, n, { timeout: 30000, polling: 100 });
    const r2 = await recv(IFRAME);
    out.M5b = { replay: r2.slice(n) };
    run.check("M-10 同一關打完確認結算後重玩：自動送出同一關（chapter1_3）的新的一場（battle_id 不同）",
      r2.length === n + 1 && r2[n].stage_id === "chapter1_3" && r2[n].battle_id !== (last && last.battle_id), out.M5b);
    await waitSync("idle");
  });

  // ── B. 獨立戰鬥頁直接進入、關卡頁 ──
  await section("B1", async () => {
    await setup(M.type.id);
    start = { session: { gold: 777, max_stage: M.type.id }, db: { gold: 777, max_stage: M.type.id }, logs: 0 };
    const rows = [];
    const cases = [
      [M.route, "incomplete", `「${M.route.name}」尚未開放`, "關卡資料未完成：沒有可用的路線。", false],
      [M.json, "incomplete", `「${M.json.name}」尚未開放`, "關卡資料未完成：路線資料的格式無法解析。", false],
      [M.waves, "incomplete", `「${M.waves.name}」尚未開放`, "關卡資料未完成：沒有波次資料。", false],
      [M.type, "incomplete", `「${M.type.name}」尚未開放`, "關卡資料未完成：路線資料的格式不對、波次資料的格式不對。", false],
      [M.blankLocked, "incomplete", `「${M.blankLocked.name}」尚未開放`, "關卡資料未完成：沒有可用的路線、沒有波次資料。", true],
      [M.locked, "locked", `「${M.locked.name}」尚未解鎖`, `打贏前一關才能出征這一關（目前進度：${M.type.name}）。`, false],
    ];
    for (const [m, status, title, line0, alsoLocked] of cases) {
      await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + m.id);
      await page.waitForSelector('[data-testid="stage-blocked"]', { timeout: 60000 });
      await waitReady();
      await H.sleep(1500);
      const b = await blocked();
      const top = await page.evaluate(() => document.querySelector('span[class*="battleTopBarStatus"]')?.innerText.trim() ?? null);
      const nb = await noBattle(BIFRAME, start);
      const ok = !!b && b.status === status && b.title === title && b.lines[0] === line0 && (alsoLocked ? b.lines.includes("這一關也還沒解鎖。") : !b.lines.includes("這一關也還沒解鎖。")) &&
        same(b.buttons.map((x) => x.id), ["stage-blocked-back"]) && top === (status === "locked" ? "尚未解鎖" : "尚未開放") && nb.ok;
      rows.push({ id: m.id, ok, blocked: b, top, noBattle: nb });
      if (m === M.type) out.B1_shot = await H.shot(page, "stage-data-b1-battle-direct-incomplete");
      if (m === M.locked) out.B1_locked_shot = await H.shot(page, "stage-data-b1-battle-direct-locked");
    }
    out.B1 = rows;
    run.check("B-1 獨立戰鬥頁直接進入：空路線、壞路線、缺波次、錯誤型別是「尚未開放」並寫出原因；全空又未解鎖的仍是尚未開放、另外註明也還沒解鎖；資料完整但未解鎖的是「尚未解鎖」（帶目前進度）；頂欄狀態同樣分開；出口是返回關卡選擇；都沒有送出關卡資料、沒有戰況、沒有 save_result、金幣與進度不變",
      rows.every((x) => x.ok), rows);
    // 返回關卡選擇的出口
    await page.locator('[data-testid="stage-blocked-back"]').click();
    await page.waitForURL(/\/shenmaSanguo\/stages$/, { timeout: 30000 });
    run.check("B-2 「返回關卡選擇」回到關卡頁", /\/shenmaSanguo\/stages$/.test(page.url()), page.url());
  });

  await section("B3", async () => {
    // 關卡頁（獨立的關卡選擇）：卡片同樣分清；點尚未開放的「出征」與卡片都不會換頁，只在上方說明
    await page.waitForSelector('[data-testid="stage-card"]', { timeout: 60000 });
    const cs = byId(await cards());
    await page.evaluate((sel) => document.querySelector(sel).click(), cardSel(M.waves.id));
    await H.sleep(800);
    const refused = await page.locator('[data-testid="stage-refused"]').innerText().catch(() => null);
    const url = page.url();
    out.B3 = { cards: [M.ok, M.waves, M.blankLocked, M.locked].map((m) => cs[m.id]), refused, url, shot: await H.shot(page, "stage-data-b3-stages-page") };
    run.check("B-3 關卡頁：缺波次與全空未解鎖的卡片是「尚未開放」（按鈕停用、寫出原因）、資料完整但未解鎖的是「尚未解鎖」、有效的是「出 征」；點尚未開放的卡片只在上方說明，不換頁",
      cs[M.waves.id].access === "incomplete" && cs[M.waves.id].button === "尚未開放" && cs[M.waves.id].disabled && cs[M.waves.id].gaps === "waves" &&
        cs[M.blankLocked.id].access === "incomplete" && cs[M.blankLocked.id].button === "尚未開放" &&
        cs[M.locked.id].access === "locked" && cs[M.locked.id].button === "尚未解鎖" &&
        cs[M.ok.id].access === "playable" && cs[M.ok.id].button === "出 征" && !cs[M.ok.id].disabled &&
        /「Mock SD 缺波次」尚未開放（關卡資料未完成：沒有波次資料），不能出征/.test(refused || "") && /\/shenmaSanguo\/stages$/.test(url),
      out.B3);
    // 有效的關卡照常出征：進入戰鬥頁、送出關卡資料
    await page.locator(`${cardSel(M.ok.id)} [data-testid="stage-select"]`).click();
    await page.waitForURL(/battle\?map=chapter3_1/, { timeout: 30000 });
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000, polling: 200 });
    const r = await recv(BIFRAME);
    const st = await lastStats();
    out.B3b = { recv: r, stats: st, blocked: await blocked() };
    run.check("B-4 有效的關卡從關卡頁出征：戰鬥頁送出一次關卡資料（chapter3_1）、這一場在備戰、沒有不能出征的說明",
      r.length === 1 && r[0].stage_id === M.ok.id && !!st && st.battle_id === r[0].battle_id && out.B3b.blocked === null, out.B3b);
  });

  // ── S. 切換帳號（主頁）──
  await section("S", async () => {
    // A 的進度是尚未開放的關卡（只顯示說明、沒有開任何一場），B 的進度是有效的關卡
    const B = "test_stagedata_b";
    await H.resetOrigin(page);
    await page.evaluate(({ a, b, pa, pb }) => {
      localStorage.setItem("__shenma_sd_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [a]: pa, [b]: pb }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", a);
    }, { a: KEY, b: B, pa: profile(M.type.id), pb: profile(M.ok.id) });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await waitReady();
    await page.waitForSelector('[data-testid="stage-blocked"]', { timeout: 30000 });
    const switchTo = async (key) => {
      await page.locator('button[class*="hudAvatar"]').click();
      await page.waitForSelector("text=玩家資訊");
      await H.clickButton(page, "切換");
      await page.locator('div[class*="modalPanel"] input[placeholder="例：eric_sanguo_2026"]').fill(key);
      await H.clickButton(page, "確認切換");
      await page.waitForFunction((k) => localStorage.getItem("shenma_player_key") === k, key, { timeout: 60000 });
      await H.sleep(500);
      await closeModals();
    };
    // A（尚未開放）→ B：改用 B 的進度，送出 B 的關卡
    await switchTo(B);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 60000, polling: 200 });
    const r1 = await recv(IFRAME);
    const b1 = await blocked();
    const st1 = await lastStats();
    out.S1 = { recv: r1, blocked: b1, stats: st1 };
    run.check("S-1 在「尚未開放」的說明畫面切換到進度有效的帳號：改用新帳號的進度，送出一次它的關卡（chapter3_1）、說明消失",
      r1.length === 1 && r1[0].stage_id === M.ok.id && b1 === null && !!st1 && st1.battle_id === r1[0].battle_id, out.S1);
    // B（備戰中的有效關卡）→ A：B 的這一場作廢，改用 A 的進度；A 的關卡尚未開放，不送關卡資料、顯示說明
    await switchTo(KEY);
    await page.waitForSelector('[data-testid="stage-blocked"]', { timeout: 30000 });
    await H.sleep(1500);
    const r2 = await recv(IFRAME);
    const b2 = await blocked();
    out.S2 = { recv: r2, blocked: b2, shot: await H.shot(page, "stage-data-s2-switch-back-blocked") };
    run.check("S-2 從備戰中的有效關卡切換回進度尚未開放的帳號：不再送出關卡資料（仍只有剛才那一次）、顯示這個帳號的「尚未開放」說明",
      r2.length === 1 && !!b2 && b2.status === "incomplete" && b2.title === `「${M.type.name}」尚未開放`, out.S2);
  });

  // ── F. 遊戲設定讀取失敗與重試 ──
  await section("F1", async () => {
    await setup(M.ok.id, { __shenma_mock_fail: { get_all_maps: 99 } });
    await page.goto(H.BASE + "/shenmaSanguo");
    await page.waitForSelector('[data-testid="stage-blocked"][data-status="config_failed"]', { timeout: 60000 });
    await waitReady();
    await H.sleep(1500);
    const b = await blocked();
    const r = await recv(IFRAME);
    out.F1 = { blocked: b, recv: r, loader: await loaderShown(), shot: await H.shot(page, "stage-data-f1-main-config-failed") };
    run.check("F-1 主頁的遊戲設定讀取失敗：顯示「遊戲設定讀取失敗」（帶錯誤代碼）與重試，不是一直轉圈；沒有送出關卡資料",
      !!b && b.title === "遊戲設定讀取失敗" && /MOCK_INJECTED_FAILURE|GAS/.test(b.lines[0]) && same(b.buttons.map((x) => x.id), ["stage-blocked-retry"]) && !out.F1.loader && Array.isArray(r) && r.length === 0,
      out.F1);
    await page.evaluate(() => localStorage.setItem("__shenma_mock_fail", "{}"));
    await page.locator('[data-testid="stage-blocked-retry"]').click();
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 60000, polling: 200 });
    const r2 = await recv(IFRAME);
    out.F1b = { recv: r2, blocked: await blocked() };
    run.check("F-2 主頁重試讀取成功：說明消失、送出進度那一關（chapter3_1）的關卡資料", r2.length === 1 && r2[0].stage_id === M.ok.id && out.F1b.blocked === null, out.F1b);
  });

  await section("F3", async () => {
    await setup(M.ok.id, { __shenma_mock_fail: { get_all_maps: 99 } });
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + M.ok.id);
    await page.waitForSelector('[data-testid="stage-blocked"][data-status="config_failed"]', { timeout: 60000 });
    await waitReady();
    await H.sleep(1500);
    const b = await blocked();
    const r = await recv(BIFRAME);
    out.F3 = { blocked: b, recv: r, shot: await H.shot(page, "stage-data-f3-battle-config-failed") };
    run.check("F-3 戰鬥頁的遊戲設定讀取失敗：顯示讀取失敗、重試與返回關卡選擇；沒有送出關卡資料",
      !!b && b.title === "遊戲設定讀取失敗" && same(b.buttons.map((x) => x.id), ["stage-blocked-retry", "stage-blocked-back"]) && Array.isArray(r) && r.length === 0, out.F3);
    await page.evaluate(() => localStorage.setItem("__shenma_mock_fail", "{}"));
    await page.locator('[data-testid="stage-blocked-retry"]').click();
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 60000, polling: 200 });
    const r2 = await recv(BIFRAME);
    run.check("F-4 戰鬥頁重試讀取成功：送出這一關的關卡資料、開戰前的備戰", r2.length === 1 && r2[0].stage_id === M.ok.id, r2);
  });

  await section("F5", async () => {
    await setup(M.ok.id, { __shenma_mock_fail: { get_all_maps: 99 } });
    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="stages-config-failed"]', { timeout: 60000 });
    const text = await page.locator('[data-testid="stages-config-failed"]').innerText();
    await page.evaluate(() => localStorage.setItem("__shenma_mock_fail", "{}"));
    await page.locator('[data-testid="stages-config-retry"]').click();
    await page.waitForSelector('[data-testid="stage-card"]', { timeout: 60000 });
    const n = await page.locator('[data-testid="stage-card"]').count();
    out.F5 = { text, cards: n };
    run.check("F-5 關卡頁的遊戲設定讀取失敗：說明讀取失敗與重試（不是一直轉圈）；重試成功後列出關卡", /遊戲設定讀取失敗/.test(text) && n >= 7, out.F5);
  });

  // 經過 Service Worker 的遊戲檔下載（index.wasm／index.pck）：收尾時等它們結束
  const swDownloads = new Map();
  const isGameDownload = (r) => {
    try { return !!(r.serviceWorker && r.serviceWorker()) && /\/index\.(wasm|pck)(\?|$)/.test(r.url()); } catch { return false; }
  };
  const onDownloadStart = (r) => { if (isGameDownload(r)) swDownloads.set(r, Date.now()); };
  const onDownloadEnd = (r) => { swDownloads.delete(r); };
  page.context().on("request", onDownloadStart);
  page.context().on("requestfinished", onDownloadEnd);
  page.context().on("requestfailed", onDownloadEnd);

  // ── N. 390 寬 ──
  await section("N", async () => {
    await setup(M.type.id);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await page.waitForSelector('[data-testid="stage-blocked"]', { timeout: 60000 });
    await H.sleep(800);
    const fit = (sel) => page.evaluate((sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), vw: window.innerWidth, font: parseFloat(getComputedStyle(el).fontSize), docScroll: document.documentElement.scrollWidth };
    }, sel);
    const ov = await fit('[data-testid="stage-blocked"]');
    out.N_overlay_shot = await H.shot(page, "stage-data-n-390-overlay");
    await page.locator('[data-testid="stage-blocked-choose"]').click();
    await page.waitForSelector(`${cardSel(M.waves.id)} [data-testid="stage-data-note"]`, { timeout: 10000 });
    await page.locator(`${cardSel(M.waves.id)}`).scrollIntoViewIfNeeded();
    await H.sleep(300);
    const note = await fit(`${cardSel(M.waves.id)} [data-testid="stage-data-note"]`);
    out.N_cards_shot = await H.shot(page, "stage-data-n-390-cards");
    await closeModals();
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + M.waves.id);
    await page.waitForSelector('[data-testid="stage-blocked"]', { timeout: 60000 });
    await H.sleep(800);
    const bov = await fit('[data-testid="stage-blocked"]');
    out.N_battle_shot = await H.shot(page, "stage-data-n-390-battle");
    out.N = { overlay: ov, note, battle: bov };
    const ok = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.font >= 12 && m.docScroll <= m.vw + 1;
    run.check("N-1 390 寬：主頁與戰鬥頁的「尚未開放」說明、關卡卡片上的原因都在畫面內、沒有橫向捲動、字級至少 12px（截圖另存）", ok(ov) && ok(note) && ok(bov), out.N);
    await page.setViewportSize({ width: 540, height: 900 });
  });

  await page.evaluate(() => {
    localStorage.removeItem("__shenma_sd_fixture");
    localStorage.removeItem("__shenma_mock_fail");
  }).catch(() => {});
  // 收尾：最後停在戰鬥頁（關卡被擋下，但遊戲 iframe 仍經過 Service Worker 下載引擎與資料包）。先離開到同來源、
  // 不在遊戲 Service Worker 範圍內的 robots.txt，等這些下載結束（最多 60 秒）才交給下一支腳本：緊接在這支之後的腳本
  // 清理時導航到遊戲目錄的靜態頁曾經逾時（根因沒有確認）。等待的時間與剩下的下載記在 out.teardown，不影響判定
  const t0 = Date.now();
  await page.goto(H.BASE + "/robots.txt").catch(() => {});
  const pendingAtLeave = swDownloads.size;
  while (swDownloads.size > 0 && Date.now() - t0 < 60000) await H.sleep(200);
  out.teardown = { left: page.url(), pendingAtLeave, waitedMs: Date.now() - t0, remaining: [...swDownloads.keys()].map((r) => r.url().replace(/^https?:\/\/[^/]+/, "")) };
  page.context().off("request", onDownloadStart);
  page.context().off("requestfinished", onDownloadEnd);
  page.context().off("requestfailed", onDownloadEnd);
  return run.finish({ out });
}
