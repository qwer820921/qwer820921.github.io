async (page) => {
  // 敵軍組成的排列（瀏覽器，真 Godot 產物、mock 後端）：主頁的關卡選擇視窗與獨立的關卡頁共用同一個預覽
  // - 測試關（只在這支腳本加進 mock 名單，__shenma_ss_fixture）：第 3 章「討伐」（正式 chapter1_3 的兩條路線與 3 波，敵人換成 mock：
  //   grunt_lv2→步兵、grunt_lv3→B 步兵、cavalry_lv2→C 快騎、cavalry_lv3→衝鋒、siege_lv3→A 慢兵、siege_lv2→重甲）、
  //   「邊界」（找不到設定、數量無法判讀、數量 0、沒有路點的路線）、「刷新」（設定更新時數量會變）
  // - M 主頁：M-1 預設首次出現（和原本的順序、說明相同）；改成已確認隻數→全關 70 隻依隻數排、同數量依首次出現、說明寫實際的排列；
  //   換路線（組成的選單與路線預覽）保留排列、用那條路線的列重新排；收起再展開保留；關閉預覽再開回到首次出現；
  //   M-2 鍵盤：從依路線查看的選單 Tab 到排列、方向鍵改排列；M-3 邊界：排列不改資料問題、略過與總數說明；M-4 只操作預覽時不換關、不寫入
  // - P 獨立關卡頁：P-1 同樣的排列；P-2 設定更新（預覽開著）：保留排列，用新的數量重新排；P-3 390×600 選單在預覽裡、沒有橫向捲動；全程沒有寫入
  // - 前往首次出兵（組成每一列的按鈕）：G-1「討伐」C 快騎（正式 cavalry_lv2）全關第 1 波、path_b 第 3 波、path_a 第 1 波，依隻數排列也一樣；
  //   只展開那一波、導覽的選擇與說明同步、焦點在那一波的標題，路線與排列不變；G-2「進京」（正式 chapter1_5 的路線與 7 波）C 快騎全關第 2 波、
  //   path_a 第 2 波、path_b 第 4 波；G-3 鍵盤；G-4 資料不完整時寫「已確認的首次」；P-4 獨立關卡頁同樣與 390×600；P-2 設定更新後按鈕用新的波次
  // 全部 mock、虛構金鑰 test_sort_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_sort_a";

  // ── 測試關（get_all_maps 的回應後面接上）──
  // 正式 chapter1_3（討伐黃巾）的路線
  const A13 = [[0, 1], [1, 1], [1, 1], [2, 1], [2, 1], [3, 1], [3, 1], [3, 2], [3, 2], [3, 3], [3, 3], [3, 4], [3, 4], [3, 5], [3, 5], [4, 5], [4, 5], [5, 5], [5, 5], [5, 6], [5, 6], [5, 7], [5, 7], [5, 8], [5, 8], [6, 8], [6, 8], [7, 8], [7, 8], [8, 8], [8, 8], [9, 8], [9, 8], [9, 7], [9, 7], [9, 6], [9, 6], [9, 5], [9, 5], [10, 5], [10, 5], [11, 5], [11, 5], [12, 5], [12, 5], [13, 5], [13, 5]];
  const B13 = [[0, 8], [0, 8], [1, 8], [1, 8], [2, 8], [2, 8], [3, 8], [3, 8], [3, 7], [3, 7], [3, 6], [3, 6], [3, 5], [4, 5], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [9, 2], [9, 3], [9, 4], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5]];
  const extra = { spawn: [0, 5], base: [13, 5], build_zones: [], obstacles: [], background_texture: "maps/bg_forest.webp" };
  const g = (enemy_id, count, interval, path) => ({ enemy_id, count, interval, path });
  const stage = (map_id, name, paths, waves) => ({ map_id, chapter: 3, name, unlock_stage: map_id, path_json: { ...extra, cols: 14, rows: 11, paths }, waves });
  const [G2, G3, C2, C3, S3, S2] = ["mock_grunt", "mock_b_grunt", "mock_c_fast", "mock_rusher", "mock_a_slow", "mock_t_tank"];
  // 「進京」另外用到的：grunt_lv1→傷兵、cavalry_lv1→前鋒、siege_lv1→A 慢兵、siege_lv3→飛騎（九種正式敵人各對一種 mock）
  const [GL1, CL1, SL1, SL3] = ["mock_t_weak", "mock_t_front", "mock_a_slow", "mock_flyer"];
  // 正式 chapter1_5（董卓進京）的路線
  const A15 = [[0, 5], [1, 5], [2, 5], [3, 5], [3, 6], [3, 7], [3, 8], [4, 8], [5, 8], [5, 7], [5, 6], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [6, 1], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7], [7, 8], [8, 8], [9, 8], [9, 7], [9, 6], [9, 5], [9, 4], [9, 3], [9, 2], [9, 1], [9, 0]];
  const B15 = [[13, 8], [13, 7], [13, 6], [13, 5], [13, 4], [13, 3], [13, 2], [13, 1], [12, 1], [11, 1], [11, 2], [11, 3], [11, 4], [11, 5], [11, 6], [11, 7], [11, 8], [10, 8], [9, 8], [9, 7], [9, 6], [9, 5], [9, 4], [9, 3], [9, 2], [9, 1], [9, 0]];
  const FRESH_REFRESH = stage("chapter3_4", "Mock SS 刷新", { path_a: [[0, 5], [13, 5]] }, [
    { wave: 1, enemies: [g(G2, 2, 1, "path_a"), g(G3, 3, 1, "path_a")] },
  ]);
  // 過期的設定快取裡的「刷新」：步兵 9 隻、多一組 C 快騎 4 隻
  const STALE_REFRESH = { ...FRESH_REFRESH, waves: [{ wave: 1, enemies: [g(G2, 9, 1, "path_a"), g(C2, 4, 1, "path_a")] }, { wave: 2, enemies: [g(G3, 3, 1, "path_a")] }] };
  const EXTRA_MAPS = [
    stage("chapter3_1", "Mock SS 討伐", { path_a: A13, path_b: B13 }, [
      { wave: 1, enemies: [g(G2, 5, 1.5, "path_a"), g(G3, 5, 1.5, "path_a"), g(C2, 5, 1.5, "path_a")] },
      { wave: 2, enemies: [g(G2, 5, 1.5, "path_a"), g(S3, 5, 1.5, "path_b"), g(S2, 5, 1.5, "path_b")] },
      { wave: 3, enemies: [g(G2, 5, 1.5, "path_a"), g(C2, 5, 1.5, "path_b"), g(C3, 10, 1.5, "path_a"), g(S3, 5, 1.5, "path_b"), g(G2, 10, 1.5, "path_a"), g(G2, 5, 1.5, "path_b")] },
    ]),
    stage("chapter3_2", "Mock SS 進京", { path_a: A15, path_b: B15 }, [
      { wave: 1, enemies: [g(GL1, 10, 1.5, "path_a"), g(CL1, 10, 1.1, "path_a"), g(SL1, 10, 1.1, "path_a")] },
      { wave: 2, enemies: [g(G2, 10, 1.1, "path_a"), g(C2, 10, 1.1, "path_a"), g(SL1, 10, 1.1, "path_b")] },
      { wave: 3, enemies: [g(GL1, 10, 1.1, "path_a"), g(C2, 10, 1.1, "path_a"), g(S2, 10, 1.5, "path_a"), g(S2, 10, 1.5, "path_b")] },
      { wave: 4, enemies: [g(G2, 10, 1.1, "path_a"), g(C2, 10, 1.1, "path_a"), g(S2, 10, 1.1, "path_b"), g(C2, 10, 1.1, "path_b")] },
      { wave: 5, enemies: [g(G2, 10, 1.1, "path_a"), g(C2, 10, 1.1, "path_a"), g(S2, 10, 1.1, "path_a"), g(G2, 10, 1.1, "path_b"), g(C2, 10, 1.1, "path_b"), g(S2, 10, 1.1, "path_b")] },
      { wave: 6, enemies: [g(G2, 10, 1.1, "path_a"), g(C2, 10, 1.1, "path_a"), g(S2, 10, 1.1, "path_a"), g(C3, 10, 1.1, "path_b"), g(G2, 10, 1.1, "path_b"), g(C2, 10, 1.1, "path_b"), g(S2, 10, 1.1, "path_b")] },
      { wave: 7, enemies: [g(G2, 10, 1.1, "path_a"), g(C2, 10, 1.1, "path_a"), g(S2, 10, 1.1, "path_a"), g(C3, 10, 1.6, "path_a"), g(G3, 10, 1.6, "path_a"), g(G2, 10, 1.1, "path_b"), g(C2, 10, 1.1, "path_b"), g(S2, 10, 1.1, "path_b"), g(SL3, 10, 1.6, "path_b")] },
    ]),
    stage("chapter3_3", "Mock SS 邊界", { path_a: [[0, 5], [13, 5]], path_b: [[0, 8], [13, 8]] }, [
      { wave: 1, enemies: [g(G2, 2, 1, "path_a"), g(G3, 6, 1, "path_b"), g("mock_ss_ghost", 9, 1, "path_a")] },
      { wave: 2, enemies: [g(G2, 3, 1, "path_a"), g(C2, "many", 1, "path_b"), g(S2, 0, 1, "path_a"), g(C3, 2, 1, "path_z")] },
    ]),
    FRESH_REFRESH,
  ];
  await ctx.addInitScript(({ maps }) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_ss_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (!(j && j.status === 200 && Array.isArray(j.maps))) return res;
          j.maps = [...j.maps, ...maps];
          return new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }
      return inner(input, init);
    };
  }, { maps: EXTRA_MAPS });

  const WRITES = ["save_profile", "save_result", "upgrade_hero", "create_profile"];
  const profile = { nickname: "組成排列", level: 1, exp: 0, gold: 900, capacity: 30, max_stage: "chapter1_7", heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }] };

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const gasActions = async () => H.countActions(await H.gasLog(page));
  const writes = (a) => WRITES.reduce((s, k) => s + (a[k] || 0), 0);
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `stage-sort-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };
  const press = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(150);
  };
  const openPreview = async (mapId) => {
    await page.locator(`[data-testid="stage-card"][data-map-id="${mapId}"] [data-testid="enemy-preview-open"]`).click();
    await page.waitForSelector('[data-testid="enemy-preview"]', { timeout: 10000 });
    await H.sleep(200);
  };
  const closePreview = async () => {
    await press("Escape");
    await page.waitForFunction(() => !document.querySelector('[data-testid="enemy-preview"]'), null, { timeout: 10000 });
  };
  const pick = async (testid, value) => {
    await page.locator(`[data-testid="${testid}"]`).selectOption(value);
    await H.sleep(150);
  };
  // 組成的狀態
  const comp = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"]');
    const c = p && p.querySelector('[data-testid="preview-composition"]');
    if (!c) return null;
    const text = (x) => x?.innerText.replace(/\s+/g, " ").trim() ?? null;
    const sel = c.querySelector('[data-testid="preview-composition-sort"]');
    return {
      sort: c.dataset.sort, route: c.dataset.route, complete: c.dataset.complete,
      header: text(c.querySelector('[data-testid="preview-composition-toggle"]')),
      expanded: c.querySelector('[data-testid="preview-composition-toggle"]')?.getAttribute("aria-expanded"),
      select: sel ? { value: sel.value, options: [...sel.options].map((o) => o.textContent.trim()) } : null,
      summary: text(c.querySelector('[data-testid="preview-composition-summary"]')),
      gaps: [...c.querySelectorAll('[data-testid="preview-composition-gap"]')].map(text),
      unknown: text(c.querySelector('[data-testid="preview-composition-unknown"]')),
      skipped: text(c.querySelector('[data-testid="preview-composition-route-skipped"]')),
      rows: [...c.querySelectorAll('[data-testid="preview-composition-row"]')].map((x) => [x.dataset.enemyId, Number(x.dataset.count), x.dataset.waves]),
      routeLines: [...p.querySelectorAll('[data-testid="preview-route-line"]')].map((l) => l.dataset.routeId),
      waveHeaders: [...p.querySelectorAll('[data-testid^="preview-wave-toggle-"]')].map(text),
      focus: document.activeElement?.dataset?.testid ?? null,
    };
  });

  // 前往首次出兵：組成列的按鈕、展開的波次、導覽的選擇與說明、焦點、路線與排列
  const gotoBtn = (enemyId) => page.locator(`[data-testid="preview-composition-row"][data-enemy-id="${enemyId}"] [data-testid="preview-composition-goto"]`);
  const nav = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"]');
    const c = p.querySelector('[data-testid="preview-composition"]');
    return {
      open: [...p.querySelectorAll('[data-testid^="preview-wave-toggle-"]')].filter((t) => t.getAttribute("aria-expanded") === "true").map((t) => Number(t.dataset.testid.replace("preview-wave-toggle-", ""))),
      select: p.querySelector('[data-testid="preview-wave-select"]')?.value ?? null,
      status: p.querySelector('[data-testid="preview-wave-nav-status"]')?.innerText.trim() ?? null,
      focus: document.activeElement?.dataset?.testid ?? null,
      route: c?.dataset.route ?? null,
      sort: c?.dataset.sort ?? null,
      buttons: [...p.querySelectorAll('[data-testid="preview-composition-row"]')].map((r) => { const b = r.querySelector('[data-testid="preview-composition-goto"]'); return [r.dataset.enemyId, b ? Number(b.dataset.wave) : null, b ? b.innerText.trim() : null, b ? b.getAttribute("aria-label") : null]; }),
    };
  });
  const goto = async (enemyId) => {
    await gotoBtn(enemyId).click();
    await H.sleep(350);
    return nav();
  };
  const waveOf = (n, id) => (n.buttons.find((b) => b[0] === id) || [])[1] ?? null;
  const landed = (n, wave, route, sort, label) =>
    JSON.stringify(n.open) === JSON.stringify([wave]) && n.select === String(wave) && n.focus === `preview-wave-toggle-${wave}` &&
    n.status === `已前往第 ${wave} 波（${label}）` && n.route === route && n.sort === sort;
  // G-1／P-4 共用：「討伐」的 C 快騎（正式 cavalry_lv2：全關 1、path_a 1、path_b 3）
  const gotoFlow = async () => {
    await openPreview("chapter3_1");
    const n0 = await nav();
    const all = await goto(C2);
    await pick("preview-composition-route", "route:path_b");
    await pick("preview-composition-sort", "count");
    const nb = await nav();
    const b = await goto(C2);
    await pick("preview-composition-route", "route:path_a");
    const a = await goto(C2);
    await closePreview();
    return { n0, all, nb, b, a };
  };
  const gotoFlowOk = ({ n0, all, nb, b, a }) =>
    waveOf(n0, C2) === 1 && /^前往首次出兵（第 1 波）$/.test((n0.buttons.find((x) => x[0] === C2) || [])[2] || "") &&
    /C 快騎/.test((n0.buttons.find((x) => x[0] === C2) || [])[3] || "") && /第 1 波/.test((n0.buttons.find((x) => x[0] === C2) || [])[3] || "") &&
    landed(all, 1, "", "first", "C 快騎的首次出兵") &&
    waveOf(nb, C2) === 3 && /在路線 path_b/.test((nb.buttons.find((x) => x[0] === C2) || [])[3] || "") &&
    landed(b, 3, "path_b", "count", "C 快騎的首次出兵") &&
    landed(a, 1, "path_a", "count", "C 快騎的首次出兵");

  // 「討伐」的預期（正式 chapter1_3：全關 70、path_a 45、path_b 25）
  const FIRST_ALL = [[G2, 30, ""], [G3, 5, ""], [C2, 10, ""], [S3, 10, ""], [S2, 5, ""], [C3, 10, ""]];
  const COUNT_ALL = [[G2, 30, ""], [C2, 10, ""], [S3, 10, ""], [C3, 10, ""], [G3, 5, ""], [S2, 5, ""]];
  const COUNT_A = [[G2, 25, "1,2,3"], [C3, 10, "3"], [G3, 5, "1"], [C2, 5, "1"]];
  const COUNT_B = [[S3, 10, "2,3"], [S2, 5, "2"], [C2, 5, "3"], [G2, 5, "3"]];
  // M-1／P-1 共用
  const sortFlow = async () => {
    await openPreview("chapter3_1");
    const s0 = await comp();
    await pick("preview-composition-sort", "count");
    const s1 = await comp();
    await pick("preview-composition-route", "route:path_a");
    const sa = await comp();
    await page.locator('[data-testid="preview-route-toggle"]').click();
    await H.sleep(150);
    await pick("preview-route-select", "route:path_b");
    const sb = await comp();
    await page.locator('[data-testid="preview-composition-toggle"]').click();
    await H.sleep(150);
    const sc = await comp();
    await page.locator('[data-testid="preview-composition-toggle"]').click();
    await H.sleep(150);
    const se = await comp();
    await pick("preview-composition-route", "");
    const sAll = await comp();
    await closePreview();
    await openPreview("chapter3_1");
    const sr = await comp();
    await closePreview();
    return { s0, s1, sa, sb, sc, se, sAll, sr };
  };
  const sortFlowOk = ({ s0, s1, sa, sb, sc, se, sAll, sr }) =>
    s0.sort === "first" && same(s0.select.options, ["首次出現", "已確認隻數（多→少）"]) && s0.select.value === "first" &&
    same(s0.rows, FIRST_ALL) && s0.summary === "全關共 70 隻、6 種敵人（依第一次出現的順序）。" && s0.header === "▾ 敵軍組成 共 70 隻" &&
    s1.sort === "count" && same(s1.rows, COUNT_ALL) && s1.summary === "全關共 70 隻、6 種敵人（依已確認隻數由多到少，同數量依第一次出現）。" &&
    s1.header === s0.header && same(s1.waveHeaders, s0.waveHeaders) &&
    sa.sort === "count" && sa.route === "path_a" && same(sa.rows, COUNT_A) && sa.header === "▾ 敵軍組成 path_a：共 45 隻" &&
    /路線 path_a 共 45 隻、4 種敵人（全關 70 隻中的這條路線；依已確認隻數由多到少，同數量依第一次出現），出兵在第 1、2、3 波。/.test(sa.summary || "") &&
    sb.sort === "count" && sb.route === "path_b" && same(sb.rows, COUNT_B) && same(sb.routeLines, ["path_b"]) && sb.header === "▾ 敵軍組成 path_b：共 25 隻" &&
    sc.expanded === "false" && sc.rows.length === 0 && se.expanded === "true" && se.sort === "count" && same(se.rows, COUNT_B) &&
    sAll.sort === "count" && same(sAll.rows, COUNT_ALL) &&
    sr.sort === "first" && sr.select.value === "first" && same(sr.rows, FIRST_ALL) && sr.summary === s0.summary;

  // ── 設定 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_ss_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, p: profile });
  });

  // ── M 主頁 ──
  let mFlow = null;
  await section("main", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const s0 = await H.snapshot(page);
    const a0 = await gasActions();
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 10000 });

    // M-1
    mFlow = await sortFlow();
    out.M1 = mFlow;
    run.check("M-1 預設首次出現（和原本的順序與說明相同）；改成已確認隻數→全關 70 隻依隻數排（步兵 30、C 快騎、A 慢兵、衝鋒各 10、B 步兵、重甲各 5，同數量依首次出現），說明寫實際的排列、總數與波次標題不變；" +
      "換到 path_a（組成選單）與 path_b（路線預覽）保留排列、用那條路線的列重新排；收起再展開保留；回到全部仍是隻數排列；關閉預覽再開回到首次出現",
      sortFlowOk(mFlow), out.M1);

    // M-2 鍵盤：依路線查看的選單 Tab 到排列，方向鍵改成已確認隻數
    await openPreview("chapter3_1");
    await page.locator('[data-testid="preview-composition-route"]').focus();
    await press("Tab");
    const k1 = await comp();
    await press("ArrowDown");
    const k2 = await comp();
    await closePreview();
    out.M2 = { focus: k1.focus, sort: k2.sort, rows: k2.rows };
    run.check("M-2 鍵盤：從依路線查看的選單按 Tab 就到排列，按方向鍵改成已確認隻數、列跟著重排",
      k1.focus === "preview-composition-sort" && k2.sort === "count" && same(k2.rows, COUNT_ALL), out.M2);

    // M-3 邊界：資料問題、略過與總數說明不受排列影響
    await openPreview("chapter3_3");
    const e0 = await comp();
    await pick("preview-composition-sort", "count");
    const e1 = await comp();
    await pick("preview-composition-route", "route:path_a");
    const ea = await comp();
    await closePreview();
    out.M3 = { e0, e1, ea };
    run.check("M-3 邊界：全關只寫已確認（B 步兵 6、步兵 5）；改成已確認隻數→B 步兵 6 排在步兵 5 前面，說明加註排列，資料問題、找不到設定的敵人與標題都和首次出現時相同；" +
      "path_a 只有步兵 5（找不到設定的組照樣寫略過 1 組）",
      e0.complete === "false" && same(e0.rows.map((r) => [r[0], r[1]]), [[G2, 5], [G3, 6]]) &&
        same(e1.rows.map((r) => [r[0], r[1]]), [[G3, 6], [G2, 5]]) && e1.header === e0.header &&
        e1.summary === e0.summary + "依已確認隻數由多到少排列。" && same(e1.gaps, e0.gaps) && e1.unknown === e0.unknown && /mock_ss_ghost/.test(e1.unknown || "") &&
        ea.sort === "count" && same(ea.rows.map((r) => [r[0], r[1]]), [[G2, 5]]) && /這條路線另有 \d+ 組遊戲會略過/.test(ea.skipped || ""),
      out.M3);

    // G-1 前往首次出兵（正式 chapter1_3 的 C 快騎）
    const gf = await gotoFlow();
    out.G1 = gf;
    run.check("G-1 前往首次出兵（正式 cavalry_lv2＝C 快騎）：全關列的按鈕寫第 1 波、說明含敵人與波次，按下只展開第 1 波、導覽選擇與說明同步、焦點在第 1 波的標題；" +
      "換到 path_b 並依隻數排列→按鈕改成第 3 波（用這條路線自己的首次，不借全關的），按下到第 3 波、路線與排列不變；path_a→第 1 波",
      gotoFlowOk(gf), out.G1);

    // G-2 進京（正式 chapter1_5）：C 快騎全關第 2 波、path_a 第 2 波、path_b 第 4 波
    await openPreview("chapter3_2");
    const j0 = await nav();
    const jAll = await goto(C2);
    await pick("preview-composition-route", "route:path_a");
    const jA = await goto(C2);
    await pick("preview-composition-route", "route:path_b");
    const jb0 = await nav();
    const jB = await goto(C2);
    await closePreview();
    out.G2 = { all: waveOf(j0, C2), a: waveOf(jA, C2), b: waveOf(jb0, C2), jAll, jA, jB };
    run.check("G-2 正式 chapter1_5 形狀：C 快騎（cavalry_lv2）全關第 2 波、path_a 第 2 波、path_b 第 4 波，各自按下都到那一波、導覽與焦點同步",
      waveOf(j0, C2) === 2 && waveOf(jb0, C2) === 4 && landed(jAll, 2, "", "first", "C 快騎的首次出兵") &&
        landed(jA, 2, "path_a", "first", "C 快騎的首次出兵") && landed(jB, 4, "path_b", "first", "C 快騎的首次出兵"),
      out.G2);

    // G-3 鍵盤：Tab 到按鈕、Enter
    await openPreview("chapter3_1");
    await pick("preview-composition-route", "route:path_b");
    await gotoBtn(G2).focus();
    await press("Enter");
    await H.sleep(300);
    const kb3 = await nav();
    await closePreview();
    out.G3 = kb3;
    run.check("G-3 鍵盤：path_b 的步兵（正式 grunt_lv2，這條路線首次在第 3 波）按鈕用 Enter 也能前往第 3 波、焦點在那一波的標題",
      landed(kb3, 3, "path_b", "first", "步兵的首次出兵"), out.G3);

    // G-4 資料不完整：寫「已確認的首次」
    await openPreview("chapter3_3");
    const inc = await nav();
    const incGo = await goto(G3);
    await closePreview();
    out.G4 = { buttons: inc.buttons, incGo };
    run.check("G-4 資料不完整（找不到設定、數量無法判讀）：按鈕寫「前往已確認的首次出兵（第 N 波）」，B 步兵在第 1 波，按下到第 1 波、說明寫已確認的首次",
      inc.buttons.length === 2 && inc.buttons.every((b) => /^前往已確認的首次出兵（第 \d+ 波）$/.test(b[2] || "")) && waveOf(inc, G3) === 1 &&
        landed(incGo, 1, "", "first", "B 步兵已確認的首次出兵"),
      out.G4);

    // M-4 關閉關卡選擇：戰場不變、沒有寫入
    await press("Escape");
    await H.sleep(300);
    const s1 = await H.snapshot(page);
    const a1 = await gasActions();
    out.M4 = { before: { stage: s0.stage, battle: s0.battle_id }, after: { stage: s1.stage, battle: s1.battle_id }, writes: writes(a1) - writes(a0) };
    run.check("M-4 主頁只操作預覽的排列：目前的戰場（關卡、場次）不變、沒有寫入",
      s1.stage === s0.stage && s1.battle_id === s0.battle_id && out.M4.writes === 0, out.M4);
  });

  // ── P 獨立關卡頁 ──
  await section("page", async () => {
    const a0 = await gasActions();
    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 60000 });
    await waitSync("idle").catch(() => null);

    // P-1
    const f = await sortFlow();
    out.P1 = { s1: f.s1.rows, sa: f.sa.rows, sb: f.sb.rows, sr: f.sr.sort };
    run.check("P-1 獨立關卡頁：同樣的排列、換路線保留、收起再展開保留、關閉重開回到首次出現，結果和主頁相同",
      sortFlowOk(f) && !!mFlow && same(f.s1.rows, mFlow.s1.rows) && same(f.sb.rows, mFlow.sb.rows), out.P1);

    // P-2 設定更新（預覽開著）：保留排列，用新的數量重新排
    await page.evaluate((stale) => {
      const raw = JSON.parse(localStorage.getItem("shenma_static_config"));
      raw.maps = raw.maps.map((m) => (m.map_id === "chapter3_4" ? stale : m));
      localStorage.setItem("shenma_static_config", JSON.stringify(raw));
      localStorage.setItem("shenma_static_ts", "0");
      localStorage.setItem("__shenma_mock_hold", JSON.stringify(["get_all_maps"]));
    }, STALE_REFRESH);
    await page.reload();
    await page.waitForSelector('[data-testid="stage-card"][data-map-id="chapter3_4"]', { timeout: 60000 });
    await page.evaluate(() => localStorage.removeItem("__shenma_mock_hold"));
    await page.waitForFunction(() => window.__shenmaMock.pending("get_all_maps").length === 1, null, { timeout: 30000, polling: 100 });
    await openPreview("chapter3_4");
    await pick("preview-composition-sort", "count");
    const before = await comp();
    const navBefore = await nav();
    await page.evaluate(() => window.__shenmaMock.release("get_all_maps"));
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="preview-composition-row"]').length === 2, null, { timeout: 30000, polling: 100 });
    await H.sleep(300);
    const after = await comp();
    const navAfter = await nav();
    const goAfter = await goto(G3);
    await closePreview();
    out.P2 = { before, after, gotoBefore: waveOf(navBefore, G3), gotoAfter: waveOf(navAfter, G3), goAfter };
    run.check("P-2b 設定更新（預覽開著）：B 步兵的前往按鈕從第 2 波（過期的設定）改成第 1 波（新的設定，第 2 波已不存在）；按下到第 1 波，沒有跳到已經不存在的第 2 波",
      waveOf(navBefore, G3) === 2 && waveOf(navAfter, G3) === 1 && landed(goAfter, 1, "", "count", "B 步兵的首次出兵"), out.P2);
    run.check("P-2 設定更新（預覽開著）：更新前依隻數是步兵 9、C 快騎 4、B 步兵 3；更新後保留已確認隻數的排列、用新的數量重新排成 B 步兵 3、步兵 2（不留舊的數字與順序）",
      before.sort === "count" && same(before.rows.map((r) => [r[0], r[1]]), [[G2, 9], [C2, 4], [G3, 3]]) &&
        after.sort === "count" && same(after.rows.map((r) => [r[0], r[1]]), [[G3, 3], [G2, 2]]) && after.header === "▾ 敵軍組成 共 5 隻",
      out.P2);

    // P-4 獨立關卡頁：前往首次出兵和主頁相同
    const pg = await gotoFlow();
    out.P4 = pg;
    run.check("P-4 獨立關卡頁：C 快騎全關第 1 波、path_b 第 3 波、path_a 第 1 波，前往、導覽、焦點、路線與排列都和主頁相同", gotoFlowOk(pg), out.P4);

    // P-3 390×600
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(300);
    await openPreview("chapter3_1");
    await pick("preview-composition-sort", "count");
    await page.locator('[data-testid="preview-composition-sort"]').scrollIntoViewIfNeeded();
    await H.sleep(200);
    const fit = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]').getBoundingClientRect();
      const s = document.querySelector('[data-testid="preview-composition-sort"]').getBoundingClientRect();
      const r = document.querySelector('[data-testid="preview-composition-route"]').getBoundingClientRect();
      return { vw: innerWidth, docScroll: document.documentElement.scrollWidth, panel: [Math.round(p.left), Math.round(p.right)], sort: [Math.round(s.left), Math.round(s.right), Math.round(s.width)], route: [Math.round(r.left), Math.round(r.right)] };
    });
    const shot = await H.shot(page, "stage-sort-390x600");
    const s390 = await comp();
    await gotoBtn(C2).scrollIntoViewIfNeeded();
    const goFit = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]').getBoundingClientRect();
      return [...document.querySelectorAll('[data-testid="preview-composition-goto"]')].map((b) => { const r = b.getBoundingClientRect(); return r.left >= p.left && r.right <= p.right && r.width > 0; });
    });
    const go390 = await goto(C2);
    await closePreview();
    await page.setViewportSize({ width: 1280, height: 800 });
    const a1 = await gasActions();
    out.P3 = { fit, shot, rows: s390.rows, goFit, go390, writes: writes(a1) - writes(a0) };
    run.check("P-3b 390×600：每一列的前往按鈕都在預覽裡；按 C 快騎的按鈕到第 1 波（依隻數排列中）", goFit.length === 6 && goFit.every(Boolean) && landed(go390, 1, "", "count", "C 快騎的首次出兵"), { goFit, go390 });
    run.check("P-3 390×600：排列與依路線查看的選單都在預覽裡、沒有橫向捲動，排列後的列正確；獨立關卡頁全程沒有寫入",
      fit.sort[2] > 0 && fit.sort[0] >= fit.panel[0] && fit.sort[1] <= fit.panel[1] && fit.route[1] <= fit.panel[1] && fit.docScroll <= fit.vw &&
        same(s390.rows, COUNT_ALL) && out.P3.writes === 0,
      out.P3);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_ss_fixture")).catch(() => {});
  return run.finish({ out });
}
