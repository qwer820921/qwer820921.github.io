async (page) => {
  // 敵軍預覽的路線預覽與波次導覽（瀏覽器，真 Godot 產物、mock 後端）：主頁的關卡選擇視窗與獨立的關卡頁共用同一個預覽
  // - 測試關（只在這支腳本加進 mock 名單，__shenma_sr_fixture）：第 3 章「導覽」（正式 chapter1_1 的路線形狀 14×11、path_a 25 個路點；
  //   第 2 波缺少、第 3 波找不到敵人設定（遊戲會拒絕）、第 5 波數量無法判讀、第 6 波有重複資料）、「壞路線」（無法判讀與超出地圖的路點）、
  //   「缺尺寸」（沒有 cols／rows）、「無路線」、「刷新」（設定更新時路線與波次會變）。mock 原有的 1_8 多路線、2_1 飛行折線、1_4 沒有資料問題
  // - M 主頁：M-1 正式形狀（預設收起、鍵盤展開、14×11 格、起點 (0, 8)、終點 (13, 5)）；M-2 多路線（全部／單一路線、鍵盤 Tab 到選單、
  //   換關後回到預設）；M-3 飛行折線的說明；M-4 壞路線切斷、缺尺寸只有文字、無路線寫無法預覽；M-5 波次導覽（資料問題清單、下一個資料問題
  //   依序與繞回、只展開那一波並把焦點交給它、前往選的波次、全部展開／收合、鍵盤 Enter／Space、狀態文字不當成 0 隻、原本的順序與摘要不變）；
  //   M-6 沒有資料問題時停用並說明；M-7 只操作預覽時沒有切換或結束目前的戰場、沒有寫入
  // - P 獨立關卡頁：P-1 設定更新後選的路線被刪掉回到全部、導覽到的波次被刪掉時焦點交給波次選單；P-2 設定更新後仍存在的路線、波次與展開保留；
  //   P-3 390×600／390×844（預覽、路線圖、導覽控件在畫面內、關閉鈕沒有被擋、沒有橫向捲動）；全程沒有寫入
  // 全部 mock、虛構金鑰 test_stageroute_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_stageroute_a";

  // ── 測試關（get_all_maps 的回應後面接上）──
  // 正式 chapter1_1（黃巾起義）的路線形狀
  const OFFICIAL_A = [[0, 8], [1, 8], [2, 8], [3, 8], [4, 8], [5, 8], [5, 7], [5, 6], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [10, 2], [10, 3], [10, 4], [10, 5], [11, 5], [12, 5], [13, 5]];
  const extra = { spawn: [0, 8], base: [13, 5], build_zones: [], obstacles: [], background_texture: "maps/bg_forest.webp" };
  const g = (enemy_id, count, path = "path_a") => ({ enemy_id, count, interval: 1.0, path });
  const stage = (map_id, name, path_json, waves) => ({ map_id, chapter: 3, name, unlock_stage: map_id, path_json: { ...extra, ...path_json }, waves });
  const FRESH_REFRESH = stage("chapter3_5", "Mock SR 刷新", { cols: 14, rows: 11, paths: { path_a: [[0, 5], [13, 5]], path_c: [[0, 1], [13, 1]] } }, [
    { wave: 1, enemies: [g("mock_grunt", 1)] },
    { wave: 2, enemies: [g("mock_grunt", 2, "path_c")] },
  ]);
  // 過期的設定快取裡的「刷新」：多一條 path_b、多第 3（缺少）、4 波（找不到設定）
  const STALE_REFRESH = {
    ...FRESH_REFRESH,
    path_json: { ...FRESH_REFRESH.path_json, paths: { path_a: [[0, 5], [13, 5]], path_b: [[0, 8], [13, 8]], path_c: [[0, 1], [13, 1]] } },
    waves: [...FRESH_REFRESH.waves, { wave: 4, enemies: [g("mock_sr_ghost", 1)] }],
  };
  const EXTRA_MAPS = [
    stage("chapter3_1", "Mock SR 導覽", { cols: 14, rows: 11, paths: { path_a: OFFICIAL_A }, waypoints: OFFICIAL_A }, [
      { wave: 1, enemies: [g("mock_grunt", 2)] },
      { wave: 3, enemies: [g("mock_sr_ghost", 1)] },
      { wave: 4, enemies: [g("mock_b_grunt", 2)] },
      { wave: 5, enemies: [g("mock_grunt", "many")] },
      { wave: 6, enemies: [g("mock_grunt", 1)] },
      { wave: 6, enemies: [g("mock_b_grunt", 9)] },
    ]),
    stage("chapter3_2", "Mock SR 壞路線", { cols: 14, rows: 11, paths: { path_a: [[0, 2], [1, 2], ["x", 2], [3, 2], [4, 2], [20, 2], [6, 2], [7, 2]], path_b: [[0, 8], [13, 8]] } }, [
      { wave: 1, enemies: [g("mock_grunt", 1, "path_b")] },
    ]),
    stage("chapter3_3", "Mock SR 缺尺寸", { paths: { path_a: [[0, 5], [13, 5]] } }, [{ wave: 1, enemies: [g("mock_grunt", 1)] }]),
    stage("chapter3_4", "Mock SR 無路線", { cols: 14, rows: 11, paths: {} }, [{ wave: 1, enemies: [g("mock_grunt", 1)] }]),
    FRESH_REFRESH,
  ];
  await ctx.addInitScript(({ maps }) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_sr_fixture") === "1") {
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
  const profile = (max_stage) => ({
    nickname: "路線預覽", level: 1, exp: 0, gold: 900, capacity: 30, max_stage, heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }],
  });

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
      try { out[name + "_shot"] = await H.shot(page, `stage-route-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };
  const press = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(150);
  };
  const focusId = () => page.evaluate(() => document.activeElement?.dataset?.testid ?? null);
  const openPreview = async (mapId) => {
    await page.locator(`[data-testid="stage-card"][data-map-id="${mapId}"] [data-testid="enemy-preview-open"]`).click();
    await page.waitForSelector('[data-testid="enemy-preview"]', { timeout: 10000 });
    await H.sleep(200);
  };
  const closePreview = async () => {
    await press("Escape");
    await page.waitForFunction(() => !document.querySelector('[data-testid="enemy-preview"]'), null, { timeout: 10000 });
  };
  const expandRoute = async () => {
    await page.locator('[data-testid="preview-route-toggle"]').click();
    await H.sleep(150);
  };
  // 路線預覽的狀態
  const route = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"]');
    const b = p?.querySelector('[data-testid="preview-route"]');
    if (!b) return null;
    const t = b.querySelector('[data-testid="preview-route-toggle"]');
    const svg = b.querySelector('[data-testid="preview-route-svg"]');
    const sel = b.querySelector('[data-testid="preview-route-select"]');
    const text = (x) => x?.innerText.replace(/\s+/g, " ").trim() ?? null;
    return {
      title: p.querySelector('[class*="modalTitle"]')?.innerText.trim() ?? null,
      expanded: t?.getAttribute("aria-expanded") ?? null,
      header: text(t),
      svg: svg ? {
        cols: svg.dataset.cols, rows: svg.dataset.rows, viewBox: svg.getAttribute("viewBox"),
        title: svg.querySelector(":scope > title")?.textContent ?? null, role: svg.getAttribute("role"),
        gridLines: svg.querySelectorAll('[class*="routeMapGrid"] line').length,
        lines: [...svg.querySelectorAll('[data-testid="preview-route-line"]')].map((l) => ({
          id: l.dataset.routeId,
          polylines: [...l.querySelectorAll("polyline")].map((x) => x.getAttribute("points")),
          stroke: l.querySelector("polyline")?.getAttribute("stroke") ?? null,
          dash: l.querySelector("polyline")?.getAttribute("stroke-dasharray") ?? null,
          dots: l.querySelectorAll(":scope > circle").length,
          starts: [...l.querySelectorAll('[data-testid="preview-route-start"]')].map((m) => m.textContent.trim()),
          ends: [...l.querySelectorAll('[data-testid="preview-route-end"]')].map((m) => m.textContent.trim()),
          startAt: (() => { const c = l.querySelector('[data-testid="preview-route-start"] circle'); return c ? [Number(c.getAttribute("cx")), Number(c.getAttribute("cy"))] : null; })(),
          // 終點標記是置中在格子中心的方塊：中心＝左上角＋半邊（四捨五入到小數 2 位）
          endAt: (() => { const r = l.querySelector('[data-testid="preview-route-end"] rect'); const c = (k, s) => Math.round((Number(r.getAttribute(k)) + Number(r.getAttribute(s)) / 2) * 100) / 100; return r ? [c("x", "width"), c("y", "height")] : null; })(),
        })),
      } : null,
      select: sel ? { value: sel.value, options: [...sel.options].map((o) => o.textContent.trim()) } : null,
      legend: [...b.querySelectorAll('[data-testid="preview-route-item"]')].map((li) => ({ id: li.dataset.routeId, text: text(li) })),
      problems: [...b.querySelectorAll('[data-testid="preview-route-problem"]')].map((x) => x.innerText.trim()),
      size: text(b.querySelector('[data-testid="preview-route-size"]')),
      empty: text(b.querySelector('[data-testid="preview-route-empty"]')),
      flying: text(b.querySelector('[data-testid="preview-route-flying"]')),
      focus: document.activeElement?.dataset?.testid ?? null,
    };
  });
  // 波次導覽與逐波標題的狀態
  const nav = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"]');
    if (!p) return null;
    const n = p.querySelector('[data-testid="preview-wave-nav"]');
    const toggles = [...p.querySelectorAll('[data-testid^="preview-wave-toggle-"]')];
    const a = document.activeElement;
    const body = p.querySelector('[class*="modalBody"]')?.getBoundingClientRect();
    const ar = a?.getBoundingClientRect();
    return {
      exists: !!n,
      options: n ? [...n.querySelectorAll('[data-testid="preview-wave-select"] option')].map((o) => o.textContent.trim()) : [],
      value: n?.querySelector('[data-testid="preview-wave-select"]')?.value ?? null,
      gotoDisabled: n?.querySelector('[data-testid="preview-wave-goto"]')?.disabled ?? null,
      nextDisabled: n?.querySelector('[data-testid="preview-wave-next-problem"]')?.disabled ?? null,
      problems: n?.querySelector('[data-testid="preview-wave-problems"]')?.innerText.trim() ?? null,
      status: n?.querySelector('[data-testid="preview-wave-nav-status"]')?.innerText.trim() ?? null,
      waves: toggles.map((t) => Number(t.dataset.testid.replace("preview-wave-toggle-", ""))),
      open: toggles.filter((t) => t.getAttribute("aria-expanded") === "true").map((t) => Number(t.dataset.testid.replace("preview-wave-toggle-", ""))),
      headers: toggles.map((t) => t.innerText.replace(/\s+/g, " ").trim()),
      summary: p.querySelector('[data-testid="preview-summary"]')?.innerText.replace(/\s+/g, " ").trim() ?? null,
      comp: p.querySelector('[data-testid="preview-composition-toggle"]')?.innerText.replace(/\s+/g, " ").trim() ?? null,
      focus: a?.dataset?.testid ?? null,
      // 焦點所在的元素在預覽的捲動區裡看得到（捲到它的位置）
      focusVisible: !!(ar && body && ar.top >= body.top - 1 && ar.bottom <= body.bottom + 1),
    };
  });
  const goNext = async (useKey) => {
    if (useKey) {
      await page.locator('[data-testid="preview-wave-next-problem"]').focus();
      await press(useKey);
    } else {
      await page.locator('[data-testid="preview-wave-next-problem"]').click();
    }
    await H.sleep(250);
    return nav();
  };
  // 手機寬度：預覽、路線圖、導覽控件都在畫面內，關閉鈕沒有被擋
  const layout = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]');
    const pr = p?.getBoundingClientRect();
    const svg = p?.querySelector('[data-testid="preview-route-svg"]')?.getBoundingClientRect();
    const ctrls = [...(p?.querySelectorAll('[data-testid="preview-wave-nav"] select, [data-testid="preview-wave-nav"] button, [data-testid="preview-route-select"]') ?? [])].map((x) => { const q = x.getBoundingClientRect(); return { right: Math.round(q.right), left: Math.round(q.left), w: Math.round(q.width) }; });
    const close = p?.querySelector('[data-testid="enemy-preview-close"]');
    const cr = close?.getBoundingClientRect();
    const hit = cr ? document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2) : null;
    return {
      vw: innerWidth,
      docScroll: document.documentElement.scrollWidth,
      panel: pr ? { left: Math.round(pr.left), right: Math.round(pr.right) } : null,
      svg: svg ? { left: Math.round(svg.left), right: Math.round(svg.right), w: Math.round(svg.width), h: Math.round(svg.height) } : null,
      ctrls,
      closeHit: !!(close && hit && (hit === close || close.contains(hit))),
      closeInView: !!(cr && cr.top >= 0 && cr.bottom <= innerHeight && cr.right <= innerWidth),
    };
  });

  // ── 設定 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_sr_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, p: profile("chapter1_7") });
  });

  // ── M 主頁 ──
  await section("main", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const s0 = await H.snapshot(page);
    const a0 = await gasActions();
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 10000 });

    // M-1 正式形狀：預設收起；鍵盤 Enter 展開
    await openPreview("chapter3_1");
    const folded = await route();
    await page.locator('[data-testid="preview-route-toggle"]').focus();
    await press("Enter");
    const r1 = await route();
    const line = r1.svg && r1.svg.lines[0];
    const pts = line && line.polylines[0] ? line.polylines[0].split(" ") : [];
    out.M1 = { folded: { expanded: folded.expanded, header: folded.header, svg: !!folded.svg }, r1: { ...r1, svg: r1.svg && { ...r1.svg, lines: r1.svg.lines.map((l) => ({ ...l, polylines: l.polylines.map((x) => x.split(" ").length) })) } }, first: pts[0], last: pts[pts.length - 1] };
    run.check("M-1 正式 chapter1_1 形狀：路線預覽預設收起（1 條路線）；鍵盤 Enter 展開後是 14×11 格的圖（有名稱、格線 27 條）、path_a 一段 25 點的折線從 (0, 8) 到 (13, 5)、起點「起」與終點「終」各一；" +
      "圖例寫路線 ID、路點數、起終點；只有一條路線時沒有選單；焦點留在展開按鈕",
      folded.expanded === "false" && folded.header === "▸ 路線預覽 1 條路線" && !folded.svg &&
        r1.expanded === "true" && !!r1.svg && r1.svg.cols === "14" && r1.svg.rows === "11" && r1.svg.viewBox === "0 0 14 11" && r1.svg.role === "img" &&
        r1.svg.title === "路線圖：14×11 格" && r1.svg.gridLines === 27 && r1.svg.lines.length === 1 && line.id === "path_a" && line.polylines.length === 1 &&
        pts.length === 25 && pts[0] === "0.5,8.5" && pts[24] === "13.5,5.5" && same(line.starts, ["起"]) && same(line.ends, ["終"]) &&
        same(line.startAt, [0.5, 8.5]) && same(line.endAt, [13.5, 5.5]) &&
        r1.legend.length === 1 && r1.legend[0].text === "path_a：25 個路點，路線起點 (0, 8) → 路線終點 (13, 5)" && r1.select === null &&
        r1.problems.length === 0 && r1.focus === "preview-route-toggle",
      out.M1);

    // M-5 波次導覽（同一個預覽）
    const n0 = await nav();
    const next1 = await goNext(null);
    const next2 = await goNext("Space");
    const next3 = await goNext("Enter");
    const next4 = await goNext(null);
    await page.locator('[data-testid="preview-wave-select"]').selectOption("4");
    await H.sleep(100);
    const chosen = await nav();
    await page.locator('[data-testid="preview-wave-goto"]').focus();
    await press("Enter");
    await H.sleep(150);
    const went = await nav();
    await page.locator('[data-testid="preview-wave-expand-all"]').click();
    await H.sleep(150);
    const all = await nav();
    await page.locator('[data-testid="preview-wave-collapse-all"]').focus();
    await press("Space");
    const none = await nav();
    const pick = (n) => n && { open: n.open, focus: n.focus, status: n.status, focusVisible: n.focusVisible, value: n.value };
    out.M5 = { n0: { options: n0.options, problems: n0.problems, open: n0.open, headers: n0.headers, summary: n0.summary, nextDisabled: n0.nextDisabled, gotoDisabled: n0.gotoDisabled }, next1: pick(next1), next2: pick(next2), next3: pick(next3), next4: pick(next4), chosen: pick(chosen), went: pick(went), all: pick(all), none: pick(none) };
    run.check("M-5a 波次導覽的資料：選單列出第 1～6 波與和逐波標題相同的狀態（沒有資料、遊戲會拒絕這一波、數量無法確定，不寫成 0 隻），問題波標「資料問題」；" +
      "資料問題是第 2、3、5 波（重複資料的第 6 波不算）；預設只展開第 1 波、沒有選波次時「前往」停用；原本的摘要與逐波順序不變",
      same(n0.waves, [1, 2, 3, 4, 5, 6]) && n0.options.length === 7 && n0.options[0] === "選擇波次" &&
        n0.options[2] === "第 2 波：沒有資料（資料問題）" && n0.options[3] === "第 3 波：遊戲會拒絕這一波（資料問題）" && n0.options[5] === "第 5 波：數量無法確定（資料問題）" &&
        n0.options[1] === "第 1 波：2 隻" && n0.options[6] === "第 6 波：1 隻" && !n0.options.some((o) => /資料問題/.test(o) && /0 隻/.test(o)) &&
        n0.problems === "資料問題：第 2、3、5 波（共 3 波）；全部波次仍列在下方。" && same(n0.open, [1]) && n0.gotoDisabled === true && n0.nextDisabled === false &&
        /共 6 波，全關數量無法確定/.test(n0.summary || "") && same(n0.headers.map((h) => (h.match(/第 \d+ 波/) || [""])[0]), ["第 1 波", "第 2 波", "第 3 波", "第 4 波", "第 5 波", "第 6 波"]),
      out.M5.n0);
    run.check("M-5b 下一個資料問題：滑鼠、Space、Enter 依序到第 2、3、5 波，再按繞回第 2 波；每次只展開那一波、焦點在那一波的標題按鈕且捲到看得到的位置、狀態寫第幾個問題",
      same(next1.open, [2]) && next1.focus === "preview-wave-toggle-2" && next1.focusVisible && next1.status === "已前往第 2 波（資料問題 1／3）" &&
        same(next2.open, [3]) && next2.focus === "preview-wave-toggle-3" && next2.focusVisible && next2.status === "已前往第 3 波（資料問題 2／3）" &&
        same(next3.open, [5]) && next3.focus === "preview-wave-toggle-5" && next3.focusVisible && next3.status === "已前往第 5 波（資料問題 3／3）" &&
        same(next4.open, [2]) && next4.focus === "preview-wave-toggle-2" && next4.status === "已前往第 2 波（資料問題 1／3）",
      out.M5);
    run.check("M-5c 選單選第 4 波（只改選取、不移動焦點或展開），按「前往」（Enter）只展開第 4 波、焦點交給它；全部展開＝6 波、全部收合（Space）＝0 波",
      chosen.value === "4" && same(chosen.open, [2]) && same(went.open, [4]) && went.focus === "preview-wave-toggle-4" && went.focusVisible && went.status === "已前往第 4 波" &&
        same(all.open, [1, 2, 3, 4, 5, 6]) && all.status === "已展開全部波次" && same(none.open, []) && none.status === "已收合全部波次" && none.focus === "preview-wave-collapse-all",
      out.M5);
    await closePreview();
    const backFocus = await focusId();

    // M-2 多路線（mock 1_8）：全部／單一路線、鍵盤 Tab 到選單
    await openPreview("chapter1_8");
    await expandRoute();
    const r2all = await route();
    await press("Tab");
    const tabTo = await focusId();
    await page.locator('[data-testid="preview-route-select"]').selectOption("route:path_b");
    await H.sleep(150);
    const r2b = await route();
    out.M2shot = await H.shot(page, "stage-route-multi-1280");
    await closePreview();
    await openPreview("chapter3_1");
    const reset = await route();
    await closePreview();
    out.M2 = { backFocus, all: { select: r2all.select, lines: r2all.svg && r2all.svg.lines.map((l) => [l.id, l.stroke, l.dash]), legend: r2all.legend }, tabTo, b: { select: r2b.select, lines: r2b.svg && r2b.svg.lines.map((l) => l.id), legend: r2b.legend.map((l) => l.id) }, reset: { expanded: reset.expanded, select: reset.select } };
    run.check("M-2 多路線：選單「全部路線（2 條）／path_a／path_b」預設全部、兩條線顏色與線型都不同、圖例兩條；Tab 從展開按鈕到選單；選 path_b 只畫 path_b；" +
      "關閉後焦點回到「敵軍預覽」；換一關再開時路線預覽回到預設（收起）",
      backFocus === "enemy-preview-open" && !!r2all.select && same(r2all.select.options, ["全部路線（2 條）", "path_a", "path_b"]) && r2all.select.value === "" &&
        out.M2.all.lines.length === 2 && out.M2.all.lines[0][1] !== out.M2.all.lines[1][1] && out.M2.all.lines[0][2] !== out.M2.all.lines[1][2] &&
        same(r2all.legend.map((l) => l.id), ["path_a", "path_b"]) && tabTo === "preview-route-select" &&
        r2b.select.value === "route:path_b" && same(out.M2.b.lines, ["path_b"]) && same(out.M2.b.legend, ["path_b"]) &&
        reset.expanded === "false",
      out.M2);

    // M-3 飛行折線（mock 2_1）
    await openPreview("chapter2_1");
    await expandRoute();
    const r3 = await route();
    await closePreview();
    out.M3 = { flying: r3.flying, legend: r3.legend, polylines: r3.svg && r3.svg.lines[0].polylines };
    run.check("M-3 飛行混合（折線路線）：照路點畫折線（6 點）；圖例標 ✈ 有飛行敵人；說明飛行敵人從路線起點直線飛到終點、地面敵人沿折線走",
      !!r3.svg && r3.svg.lines[0].polylines.length === 1 && r3.svg.lines[0].polylines[0].split(" ").length === 6 &&
        /✈ 有飛行敵人/.test(r3.legend[0].text) && /path_a 有飛行敵人：飛行敵人從路線起點直線飛到終點，不沿折線；地面敵人沿折線走/.test(r3.flying || ""),
      out.M3);

    // M-4 壞路線、缺尺寸、無路線
    await openPreview("chapter3_2");
    await expandRoute();
    const r4 = await route();
    await closePreview();
    await openPreview("chapter3_3");
    await expandRoute();
    const r4size = await route();
    await closePreview();
    await openPreview("chapter3_4");
    await expandRoute();
    const r4none = await route();
    await closePreview();
    const segA = r4.svg && r4.svg.lines.find((l) => l.id === "path_a");
    out.M4 = { segA, problems: r4.problems, legend: r4.legend, size: { svg: !!r4size.svg, size: r4size.size, legend: r4size.legend }, none: { header: r4none.header, empty: r4none.empty, svg: !!r4none.svg } };
    run.check("M-4 壞路線：path_a 在無法判讀與超出地圖的路點斷開成三段（(0,2)-(1,2)、(3,2)-(4,2)、(6,2)-(7,2)，不跨過）並列出兩種資料問題；" +
      "缺尺寸：不畫格子、說明沒有地圖尺寸，仍列出路線文字；無路線：標題「無法預覽」並說明不代表沒有敵軍、不代表可以出征",
      !!segA && same(segA.polylines, ["0.5,2.5 1.5,2.5", "3.5,2.5 4.5,2.5", "6.5,2.5 7.5,2.5"]) &&
        r4.problems.some((p) => /1 個路點的座標無法判讀/.test(p)) && r4.problems.some((p) => /1 個路點超出地圖（14×11）/.test(p)) &&
        !r4size.svg && /沒有地圖尺寸（cols／rows），不畫格子/.test(r4size.size || "") && r4size.legend.length === 1 && /路線起點 \(0, 5\) → 路線終點 \(13, 5\)/.test(r4size.legend[0].text) &&
        r4none.header === "▾ 路線預覽 無法預覽" && /無法預覽路線。這不代表這一關沒有敵軍，也不代表可以出征/.test(r4none.empty || "") && !r4none.svg,
      out.M4);

    // M-6 沒有資料問題（mock 1_4）
    await openPreview("chapter1_4");
    const n6 = await nav();
    await closePreview();
    out.M6 = { nextDisabled: n6.nextDisabled, problems: n6.problems, options: n6.options };
    run.check("M-6 沒有資料問題：「下一個資料問題」停用，說明沒有資料問題的波次",
      n6.nextDisabled === true && /沒有資料問題的波次/.test(n6.problems || "") && n6.options.length === 3,
      out.M6);

    // M-7 關閉關卡選擇：戰場不變、沒有寫入
    await press("Escape");
    await H.sleep(300);
    const s1 = await H.snapshot(page);
    const a1 = await gasActions();
    out.M7 = { before: { stage: s0.stage, battle: s0.battle_id }, after: { stage: s1.stage, battle: s1.battle_id }, writes: writes(a1) - writes(a0) };
    run.check("M-7 主頁只操作預覽（路線與波次導覽）：目前的戰場（關卡、場次）不變、沒有寫入",
      s1.stage === s0.stage && s1.battle_id === s0.battle_id && out.M7.writes === 0,
      out.M7);
  });

  // ── P 獨立關卡頁 ──
  await section("page", async () => {
    const a0 = await gasActions();
    // 過期的設定快取（「刷新」多 path_b 與第 3、4 波），重新讀取暫停後放行
    const staleReload = async () => {
      await page.evaluate((stale) => {
        const raw = JSON.parse(localStorage.getItem("shenma_static_config"));
        raw.maps = raw.maps.map((m) => (m.map_id === "chapter3_5" ? stale : m));
        localStorage.setItem("shenma_static_config", JSON.stringify(raw));
        localStorage.setItem("shenma_static_ts", "0");
        localStorage.setItem("__shenma_mock_hold", JSON.stringify(["get_all_maps"]));
      }, STALE_REFRESH);
      await page.reload();
      await page.waitForSelector('[data-testid="stage-card"][data-map-id="chapter3_5"]', { timeout: 60000 });
      await page.evaluate(() => localStorage.removeItem("__shenma_mock_hold"));
      await page.waitForFunction(() => window.__shenmaMock.pending("get_all_maps").length === 1, null, { timeout: 30000, polling: 100 });
    };
    const release = async () => {
      await page.evaluate(() => window.__shenmaMock.release("get_all_maps"));
      await page.waitForFunction(() => !document.querySelector('[data-testid="preview-wave-toggle-4"]'), null, { timeout: 30000, polling: 100 });
      await H.sleep(400);
    };
    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 60000 });
    await waitSync("idle").catch(() => null);

    // P-1 選的路線與導覽到的波次在設定更新後被刪掉
    await staleReload();
    await openPreview("chapter3_5");
    await expandRoute();
    await page.locator('[data-testid="preview-route-select"]').selectOption("route:path_b");
    await H.sleep(100);
    const beforeR = await route();
    const beforeN = await goNext(null);
    await release();
    const afterR = await route();
    const afterN = await nav();
    out.P1 = { beforeR: { select: beforeR.select, lines: beforeR.svg.lines.map((l) => l.id) }, beforeN: { open: beforeN.open, focus: beforeN.focus, waves: beforeN.waves, problems: beforeN.problems }, afterR: { title: afterR.title, select: afterR.select, lines: afterR.svg && afterR.svg.lines.map((l) => l.id) }, afterN: { waves: afterN.waves, open: afterN.open, value: afterN.value, focus: afterN.focus, status: afterN.status, problems: afterN.problems, nextDisabled: afterN.nextDisabled } };
    run.check("P-1 設定更新（預覽開著）：選的 path_b 被刪掉→回到全部（path_a、path_c）；導覽到的第 3 波（缺少）被刪掉→展開清單與選取清掉、焦點交給波次選單、沒有資料問題時按鈕停用；仍是同一關",
      same(beforeR.select.options, ["全部路線（3 條）", "path_a", "path_b", "path_c"]) && same(out.P1.beforeR.lines, ["path_b"]) &&
        same(beforeN.waves, [1, 2, 3, 4]) && same(beforeN.open, [3]) && beforeN.focus === "preview-wave-toggle-3" &&
        /Mock SR 刷新/.test(afterR.title || "") && afterR.select.value === "" && same(afterR.select.options, ["全部路線（2 條）", "path_a", "path_c"]) && same(out.P1.afterR.lines, ["path_a", "path_c"]) &&
        same(afterN.waves, [1, 2]) && same(afterN.open, []) && afterN.value === "" && afterN.focus === "preview-wave-select" && afterN.status === "" && afterN.nextDisabled === true,
      out.P1);
    await closePreview();

    // P-2 仍存在的路線、波次與展開保留
    await staleReload();
    await openPreview("chapter3_5");
    await expandRoute();
    await page.locator('[data-testid="preview-route-select"]').selectOption("route:path_c");
    await page.locator('[data-testid="preview-wave-select"]').selectOption("2");
    await page.locator('[data-testid="preview-wave-goto"]').click();
    await H.sleep(200);
    const keepBefore = await nav();
    await release();
    const keepR = await route();
    const keepN = await nav();
    await closePreview();
    out.P2 = { before: { open: keepBefore.open, focus: keepBefore.focus }, route: keepR.select && keepR.select.value, lines: keepR.svg && keepR.svg.lines.map((l) => l.id), nav: { waves: keepN.waves, open: keepN.open, value: keepN.value, focus: keepN.focus } };
    run.check("P-2 設定更新後仍存在的選取保留：路線 path_c、波次選單第 2 波、展開的第 2 波與焦點都不變（依編號，不跳到別波）",
      same(keepBefore.open, [2]) && keepBefore.focus === "preview-wave-toggle-2" && keepR.select.value === "route:path_c" && same(out.P2.lines, ["path_c"]) &&
        same(keepN.waves, [1, 2]) && same(keepN.open, [2]) && keepN.value === "2" && keepN.focus === "preview-wave-toggle-2",
      out.P2);

    // P-3 手機寬度
    const fit = {};
    const shots = {};
    for (const vp of [{ width: 390, height: 600 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await H.sleep(300);
      await openPreview("chapter1_8");
      await expandRoute();
      await page.locator('[data-testid="preview-route"]').scrollIntoViewIfNeeded();
      await H.sleep(200);
      fit[vp.height] = { route: await layout() };
      shots[vp.height + "-route"] = await H.shot(page, `stage-route-route-390x${vp.height}`);
      await page.locator('[data-testid="preview-wave-nav"]').scrollIntoViewIfNeeded();
      await H.sleep(200);
      fit[vp.height].nav = await layout();
      shots[vp.height + "-nav"] = await H.shot(page, `stage-route-nav-390x${vp.height}`);
      await closePreview();
      // 有資料問題的導覽：跳到第一個問題後的畫面
      await openPreview("chapter3_1");
      await goNext(null);
      await page.locator('[data-testid="preview-wave-nav"]').scrollIntoViewIfNeeded();
      await H.sleep(200);
      fit[vp.height].problem = await layout();
      shots[vp.height + "-problem"] = await H.shot(page, `stage-route-problem-390x${vp.height}`);
      await closePreview();
    }
    const a1 = await gasActions();
    out.P3 = { fit, shots, writes: writes(a1) - writes(a0) };
    const ok = (l) => !!l.panel && l.panel.left >= 0 && l.panel.right <= l.vw && l.docScroll <= l.vw && l.closeHit && l.closeInView &&
      l.ctrls.length > 0 && l.ctrls.every((c) => c.left >= l.panel.left && c.right <= l.panel.right && c.w > 0);
    run.check("P-3 獨立關卡頁 390×600／390×844：預覽、路線圖（寬度在視窗內）、路線選單與導覽按鈕都在畫面內、關閉鈕沒有被擋、沒有橫向捲動；獨立關卡頁全程沒有寫入",
      [600, 844].every((h) => ok(fit[h].route) && ok(fit[h].nav) && ok(fit[h].problem) && !!fit[h].route.svg && fit[h].route.svg.left >= fit[h].route.panel.left && fit[h].route.svg.right <= fit[h].route.panel.right && fit[h].route.svg.h > 100) &&
        out.P3.writes === 0,
      out.P3);
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  return run.finish({ out });
}
