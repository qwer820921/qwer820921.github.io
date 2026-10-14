async (page) => {
  // 關卡搜尋與狀態篩選、敵軍預覽的敵軍組成（瀏覽器，真 Godot 產物、mock 後端）：主頁的關卡選擇視窗與獨立的關卡頁共用同一份規則
  // - 測試關（只在這支腳本加進 mock 名單，__shenma_sb_fixture）：第 3 章「組成」（第 1 波步兵 3＋飛騎 2；第 2 波同名不同 id 的步兵 4＋步兵 1；
  //   第 2 波另有一筆重複資料 B 步兵 9，遊戲只用第一筆）、「缺波次」、「空路線」；另加一個名稱也是「步兵」的敵人。玩家進度 chapter1_7：
  //   可出征 7、未解鎖 5（1_8～1_10、2_1、3_1）、資料未完成 2（3_2、3_3），共 14 關
  // - M 主頁（關卡選擇視窗）：M-1 控制列與原本的章節分組順序；M-2 中文／id（大小寫、頭尾空白）／英文搜尋；M-3 章節＋狀態＋搜尋是「而且」；
  //   M-4 狀態的卡片照原本的出征規則；M-5 空結果與清除（焦點回到搜尋框）；M-6 篩選後打開敵軍預覽、Esc 回到那一關的「敵軍預覽」；
  //   M-7 鍵盤操作篩選、Esc 關閉視窗回到「切換關卡」；只操作篩選時沒有切換或結束目前的戰場、沒有寫入；
  //   M-8 進度更新（後端進度改成 chapter2_1 並強制同步）後重新計算；M-9 390×600／390×844 控制列在畫面內、沒有橫向捲動
  // - P 獨立關卡頁：P-1 同一組控制列；P-2 敵軍組成（依 enemy_id 合計、第一次出現的順序、同名附 id、飛行標示、全關總數與逐波內容照舊、
  //   收起與鍵盤展開、Esc 焦點）；P-3 資料不完整的組成（僅已確認組、非全關總數、缺波次與找不到設定的敵人）；
  //   P-4 設定更新：預覽開著時卡片被篩選藏起仍保留同一關（換成新讀到的資料），關閉後焦點回到搜尋框（P 段的進度沿用 M-8 的 chapter2_1）；
  //   P-5 設定真的拿掉那一關：預覽關閉、焦點回到搜尋框、不再自己打開；P-6 390×600／390×844；全程沒有寫入
  // 全部 mock、虛構金鑰 test_stagebrowse_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_stagebrowse_a";

  // ── 測試關與敵人（get_all_maps／get_enemies_config 的回應後面接上）──
  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[0, ROW], [13, ROW]] }, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const grp = (enemy_id, count) => ({ enemy_id, count, interval: 1.0, path: "path_a" });
  const EXTRA_MAPS = [
    {
      map_id: "chapter3_1", chapter: 3, name: "Mock SB 組成", unlock_stage: "chapter3_1", path_json: pj,
      waves: [
        { wave: 1, enemies: [grp("mock_grunt", 3), grp("mock_flyer", 2)] },
        { wave: 2, enemies: [grp("mock_sb_twin", 4), grp("mock_grunt", 1)] },
        { wave: 2, enemies: [grp("mock_b_grunt", 9)] },
      ],
    },
    { map_id: "chapter3_2", chapter: 3, name: "Mock SB 缺波次", unlock_stage: "chapter3_2", path_json: pj, waves: [] },
    { map_id: "chapter3_3", chapter: 3, name: "Mock SB 空路線", unlock_stage: "chapter3_3", path_json: { paths: [], spawn: [], base: [] }, waves: [{ wave: 1, enemies: [grp("mock_grunt", 1)] }] },
  ];
  const EXTRA_ENEMIES = [{ enemy_id: "mock_sb_twin", name: "步兵", hp: 50, speed: 60, image: "enemy_grunt1.webp" }];
  await ctx.addInitScript(({ maps, enemies }) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_sb_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps" || body.action === "get_enemies_config") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (j && j.status === 200 && Array.isArray(j.maps)) j.maps = [...j.maps, ...maps];
          else if (j && j.status === 200 && Array.isArray(j.enemies)) j.enemies = [...j.enemies, ...enemies];
          else return res;
          return new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }
      return inner(input, init);
    };
  }, { maps: EXTRA_MAPS, enemies: EXTRA_ENEMIES });

  const ALL = ["chapter1_1", "chapter1_2", "chapter1_3", "chapter1_4", "chapter1_5", "chapter1_6", "chapter1_7", "chapter1_8", "chapter1_9", "chapter1_10", "chapter2_1", "chapter3_1", "chapter3_2", "chapter3_3"];
  const PLAYABLE = ALL.slice(0, 7);
  const profile = (max_stage) => ({
    nickname: "篩選關卡", level: 1, exp: 0, gold: 900, capacity: 30, max_stage, heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }],
  });
  const WRITES = ["save_profile", "save_result", "upgrade_hero", "create_profile"];

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const gasActions = async () => H.countActions(await H.gasLog(page));
  const writes = (a) => WRITES.reduce((s, k) => s + (a[k] || 0), 0);
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `stage-browse-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };
  // 控制列與卡片（scope：主頁的關卡選擇視窗或整頁）
  const bar = () => page.evaluate(() => {
    const b = document.querySelector('[data-testid="stage-filter-bar"]');
    if (!b) return null;
    const root = document.querySelector('[data-testid="stage-select-dialog"]') || document;
    const a = document.activeElement;
    return {
      count: b.querySelector('[data-testid="stage-filter-count"]')?.innerText.trim() ?? null,
      empty: b.querySelector('[data-testid="stage-filter-empty"]')?.innerText.trim() ?? null,
      clearDisabled: b.querySelector('[data-testid="stage-filter-clear"]')?.disabled ?? null,
      query: b.querySelector('[data-testid="stage-filter-search"]')?.value ?? null,
      chapter: b.querySelector('[data-testid="stage-filter-chapter"]')?.value ?? null,
      chapterOptions: [...b.querySelectorAll('[data-testid="stage-filter-chapter"] option')].map((o) => o.textContent.trim()),
      pressed: [...b.querySelectorAll('[data-testid^="stage-filter-status-"]')].filter((x) => x.getAttribute("aria-pressed") === "true").map((x) => x.dataset.testid.replace("stage-filter-status-", "")),
      cards: [...root.querySelectorAll('[data-testid="stage-card"]')].map((c) => c.dataset.mapId),
      access: Object.fromEntries([...root.querySelectorAll('[data-testid="stage-card"]')].map((c) => [c.dataset.mapId, c.dataset.access])),
      buttons: Object.fromEntries([...root.querySelectorAll('[data-testid="stage-card"]')].map((c) => {
        const s = c.querySelector('[data-testid="stage-select"]');
        return [c.dataset.mapId, { text: s?.innerText.trim(), disabled: s?.disabled }];
      })),
      chapters: [...root.querySelectorAll('[class*="chapterName"]')].map((x) => x.innerText.trim()),
      focus: a?.dataset?.testid ?? a?.getAttribute?.("title") ?? a?.tagName ?? null,
      focusMap: a?.closest?.('[data-testid="stage-card"]')?.dataset.mapId ?? null,
    };
  });
  const search = async (text) => {
    await page.locator('[data-testid="stage-filter-search"]').fill(text);
    await H.sleep(150);
  };
  const chapter = async (v) => {
    await page.locator('[data-testid="stage-filter-chapter"]').selectOption(v);
    await H.sleep(150);
  };
  const status = async (v) => {
    await page.locator(`[data-testid="stage-filter-status-${v}"]`).click();
    await H.sleep(150);
  };
  const clear = async () => {
    await page.locator('[data-testid="stage-filter-clear"]').click();
    await H.sleep(150);
  };
  const openPreview = async (mapId) => {
    await page.locator(`[data-testid="stage-card"][data-map-id="${mapId}"] [data-testid="enemy-preview-open"]`).click();
    await page.waitForSelector('[data-testid="enemy-preview"]', { timeout: 10000 });
    await H.sleep(200);
  };
  const preview = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"]');
    if (!p) return null;
    const c = p.querySelector('[data-testid="preview-composition"]');
    const t = c?.querySelector('[data-testid="preview-composition-toggle"]');
    return {
      title: p.querySelector('[class*="modalTitle"]')?.innerText.trim() ?? null,
      summary: p.querySelector('[data-testid="preview-summary"]')?.innerText.replace(/\s+/g, " ").trim() ?? null,
      waves: p.querySelectorAll('[data-testid^="preview-wave-toggle-"]').length,
      wave1Groups: p.querySelectorAll('[data-testid="preview-wave-1"] [data-testid="preview-group"]').length,
      comp: c ? {
        complete: c.dataset.complete,
        expanded: t?.getAttribute("aria-expanded") ?? null,
        header: t?.innerText.replace(/\s+/g, " ").trim() ?? null,
        summary: c.querySelector('[data-testid="preview-composition-summary"]')?.innerText.trim() ?? null,
        gaps: [...c.querySelectorAll('[data-testid="preview-composition-gap"]')].map((x) => x.innerText.trim()),
        unknown: c.querySelector('[data-testid="preview-composition-unknown"]')?.innerText.trim() ?? null,
        rows: [...c.querySelectorAll('[data-testid="preview-composition-row"]')].map((r) => ({ id: r.dataset.enemyId, count: Number(r.dataset.count), movement: r.dataset.movement, text: r.innerText.replace(/\s+/g, " ").trim() })),
      } : null,
      focusInside: p.contains(document.activeElement),
      focus: document.activeElement?.dataset?.testid ?? null,
    };
  });
  const press = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(120);
  };
  // 寬度：控制列、卡片、預覽都在畫面內，文件沒有橫向捲動
  const layout = () => page.evaluate(() => {
    const b = document.querySelector('[data-testid="stage-filter-bar"]');
    const r = b ? b.getBoundingClientRect() : null;
    const label = b?.querySelector('[class*="heroFilterLabel"]');
    const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]');
    const rows = [...document.querySelectorAll('[data-testid="preview-composition-row"]')].map((x) => x.getBoundingClientRect());
    return {
      vw: innerWidth,
      vh: innerHeight,
      docScroll: document.documentElement.scrollWidth,
      bar: r ? { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) } : null,
      controls: b ? [...b.querySelectorAll("input, select, button")].map((x) => { const q = x.getBoundingClientRect(); return { right: Math.round(q.right), w: Math.round(q.width) }; }) : [],
      labelPx: label ? parseFloat(getComputedStyle(label).fontSize) : null,
      countPx: b ? parseFloat(getComputedStyle(b.querySelector('[data-testid="stage-filter-count"]')).fontSize) : null,
      preview: p ? { right: Math.round(p.getBoundingClientRect().right) } : null,
      rowsRight: rows.length ? Math.round(Math.max(...rows.map((q) => q.right))) : null,
    };
  });
  const fits = (l) => !!l.bar && l.bar.left >= 0 && l.bar.right <= l.vw && l.docScroll <= l.vw && l.controls.every((c) => c.right <= l.vw && c.w > 0) && l.labelPx >= 12 && l.countPx >= 12;

  // ── 設定 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_sb_fixture", "1");
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
    const m1 = await bar();
    out.M1 = m1;
    run.check("M-1 主頁關卡選擇：控制列在視窗上方；預設全部（符合 14 關／共 14 關、清除停用）、章節選單只有設定裡的第 1～3 章；卡片照原本的章節分組與順序",
      !!m1 && m1.count === "符合 14 關／共 14 關" && m1.clearDisabled === true && same(m1.pressed, ["all"]) &&
        same(m1.chapterOptions, ["全部章節", "第 1 章", "第 2 章", "第 3 章"]) && same(m1.cards, ALL) && same(m1.chapters, ["第 1 章", "第 2 章", "第 3 章"]),
      m1);

    await search("多路線");
    const zh = (await bar()).cards;
    await search("  CHAPTER1_1 ");
    const id = await bar();
    await search("mock sb");
    const en = (await bar()).cards;
    out.M2 = { zh, id: id.cards, idCount: id.count, en };
    run.check("M-2 搜尋：中文名稱（多路線→1_8）；id 不分大小寫、去掉頭尾空白（CHAPTER1_1→1_1、1_10）；英文名稱不分大小寫（mock sb→第 3 章三關）；符合數跟著變",
      same(zh, ["chapter1_8"]) && same(id.cards, ["chapter1_1", "chapter1_10"]) && id.count === "符合 2 關／共 14 關" && same(en, ["chapter3_1", "chapter3_2", "chapter3_3"]),
      out.M2);

    await search("");
    await chapter("1");
    await status("locked");
    const and1 = await bar();
    await search("缺資料");
    const and2 = await bar();
    out.M3 = { and1: and1.cards, and2: and2.cards, count: and2.count, chapters: and2.chapters };
    run.check("M-3 「而且」：第 1 章＋未解鎖→1_8、1_9、1_10；再搜尋「缺資料」→只剩 1_9（符合 1 關），只顯示有符合關卡的章節",
      same(and1.cards, ["chapter1_8", "chapter1_9", "chapter1_10"]) && same(and2.cards, ["chapter1_9"]) && and2.count === "符合 1 關／共 14 關" && same(and2.chapters, ["第 1 章"]),
      out.M3);

    await clear();
    await status("incomplete");
    const inc = await bar();
    await status("playable");
    const pl = await bar();
    out.M4 = { inc: { cards: inc.cards, access: inc.access, buttons: inc.buttons }, pl: { cards: pl.cards, buttons: pl.buttons } };
    run.check("M-4 狀態：資料未完成→3_2、3_3（卡片仍是「尚未開放」、按鈕停用）；可出征→1_1～1_7（按鈕「選擇關卡」可按）；篩選不改變出征規則",
      same(inc.cards, ["chapter3_2", "chapter3_3"]) && inc.cards.every((c) => inc.access[c] === "incomplete" && inc.buttons[c].disabled === true && inc.buttons[c].text === "尚未開放") &&
        same(pl.cards, PLAYABLE) && pl.cards.every((c) => pl.access[c] === "playable" && pl.buttons[c].disabled === false && pl.buttons[c].text === "選擇關卡"),
      out.M4);

    await search("不存在的關卡");
    const empty = await bar();
    await clear();
    const cleared = await bar();
    out.M5 = { empty: { cards: empty.cards.length, count: empty.count, msg: empty.empty }, cleared: { count: cleared.count, focus: cleared.focus, clearDisabled: cleared.clearDisabled, pressed: cleared.pressed, cards: cleared.cards.length } };
    run.check("M-5 空結果：0 張卡片、符合 0 關、說明可以清除；按「清除條件」回到全部 14 關、焦點在搜尋框、清除鈕停用",
      empty.cards.length === 0 && empty.count === "符合 0 關／共 14 關" && /沒有符合條件的關卡/.test(empty.empty || "") &&
        cleared.count === "符合 14 關／共 14 關" && cleared.focus === "stage-filter-search" && cleared.clearDisabled === true && same(cleared.pressed, ["all"]) && cleared.cards.length === 14,
      out.M5);

    await search("組成");
    await openPreview("chapter3_1");
    const pv = await preview();
    await press("Escape");
    const afterEsc = await bar();
    out.M6 = { rows: pv && pv.comp && pv.comp.rows.map((r) => [r.id, r.count]), focus: afterEsc.focus, focusMap: afterEsc.focusMap, stillOpen: !!(await preview()) };
    run.check("M-6 篩選後打開「組成」的敵軍預覽：有敵軍組成；Esc 只關預覽，焦點回到那一關的「敵軍預覽」按鈕，關卡選擇還開著",
      !!pv && !!pv.comp && pv.comp.rows.length === 3 && !out.M6.stillOpen && afterEsc.focus === "enemy-preview-open" && afterEsc.focusMap === "chapter3_1",
      out.M6);

    // M-7 鍵盤：從關閉鈕開始 Tab 走過控制列，空白鍵選狀態，Esc 關閉視窗
    await clear();
    await page.locator('button[aria-label="關閉關卡選擇"]').focus();
    const walk = [];
    for (let i = 0; i < 4; i++) {
      await press("Tab");
      walk.push((await bar()).focus);
    }
    await press("Space");
    const kb = await bar();
    await press("Escape");
    await H.sleep(300);
    const closed = !(await page.locator('[data-testid="stage-select-dialog"]').count());
    const focusAfter = await page.evaluate(() => document.activeElement?.getAttribute("title") ?? null);
    const s1 = await H.snapshot(page);
    const a1 = await gasActions();
    out.M7 = { walk, pressed: kb.pressed, cards: kb.cards.length, closed, focusAfter, before: { stage: s0.stage, battle: s0.battle_id }, after: { stage: s1.stage, battle: s1.battle_id }, writes: writes(a1) - writes(a0) };
    run.check("M-7 鍵盤：Tab 依序到搜尋框、章節、狀態「全部」「可出征」（清除停用時跳過），空白鍵選可出征（7 關）；Esc 關閉視窗、焦點回到「切換關卡」；只操作篩選時目前的戰場（關卡、場次）不變、沒有寫入",
      same(walk, ["stage-filter-search", "stage-filter-chapter", "stage-filter-status-all", "stage-filter-status-playable"]) && same(kb.pressed, ["playable"]) && kb.cards.length === 7 &&
        closed && focusAfter === "切換關卡" && s1.stage === s0.stage && s1.battle_id === s0.battle_id && out.M7.writes === 0,
      out.M7);

    // M-8 進度更新：後端進度改成 chapter2_1，玩家資訊「強制從雲端同步」後重新打開
    const dbNow = await db();
    dbNow.profiles[KEY].max_stage = "chapter2_1";
    await setMock("__shenma_mock_gas_db", dbNow);
    await page.locator('button[class*="hudAvatar"]').click();
    await page.getByRole("button", { name: /強制從雲端同步/ }).click();
    await page.waitForFunction(() => {
      try { const p = JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"); return p && p.syncStatus === "idle" && p.max_stage === "chapter2_1"; } catch { return false; }
    }, null, { timeout: 60000, polling: 100 });
    await page.getByRole("button", { name: "關閉玩家資訊", exact: true }).click();
    await H.sleep(300);
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 10000 });
    await status("playable");
    const p8 = await bar();
    await status("locked");
    const l8 = await bar();
    out.M8 = { playable: p8.cards, locked: l8.cards };
    run.check("M-8 進度更新成 chapter2_1 後：可出征＝1_1～1_10、2_1（11 關），未解鎖只剩 3_1（照目前的進度重新計算）",
      same(p8.cards, ALL.slice(0, 11)) && same(l8.cards, ["chapter3_1"]), out.M8);

    // M-9 手機寬度
    const shots = {};
    const fit = {};
    for (const vp of [{ width: 390, height: 600 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await H.sleep(400);
      fit[vp.height] = await layout();
      shots[vp.height] = await H.shot(page, `stage-browse-main-390x${vp.height}`);
    }
    await press("Escape");
    out.M9 = { fit, shots };
    run.check("M-9 主頁 390×600／390×844：控制列與所有控制項在畫面內、沒有橫向捲動、標籤與符合數字級至少 12px",
      fits(fit[600]) && fits(fit[844]), out.M9);
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  // ── P 獨立關卡頁 ──
  await section("page", async () => {
    // 進度沿用 M-8 的 chapter2_1：可出征 11、未解鎖 1（3_1）、資料未完成 2
    const a0 = await gasActions();
    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 60000 });
    await waitSync("idle").catch(() => null);
    const p1 = await bar();
    await chapter("3");
    const ch3 = (await bar()).cards;
    await status("incomplete");
    const inc = (await bar()).cards;
    await clear();
    const cl = await bar();
    out.P1 = { count: p1.count, cards: p1.cards, options: p1.chapterOptions, ch3, inc, cleared: { count: cl.count, focus: cl.focus } };
    run.check("P-1 獨立關卡頁：同一組控制列（14 關、原本的順序、第 1～3 章）；第 3 章→三關、再加資料未完成→3_2、3_3；清除回到全部、焦點在搜尋框",
      p1.count === "符合 14 關／共 14 關" && same(p1.cards, ALL) && same(p1.chapterOptions, ["全部章節", "第 1 章", "第 2 章", "第 3 章"]) &&
        same(ch3, ["chapter3_1", "chapter3_2", "chapter3_3"]) && same(inc, ["chapter3_2", "chapter3_3"]) && cl.count === "符合 14 關／共 14 關" && cl.focus === "stage-filter-search",
      out.P1);

    await openPreview("chapter3_1");
    const pv = await preview();
    await page.locator('[data-testid="preview-composition-toggle"]').click();
    await H.sleep(150);
    const folded = await preview();
    await page.locator('[data-testid="preview-composition-toggle"]').focus();
    await press("Enter");
    const unfolded = await preview();
    await press("Escape");
    const after = await bar();
    out.P2 = { pv, folded: folded && folded.comp, unfolded: unfolded && { expanded: unfolded.comp.expanded, rows: unfolded.comp.rows.length, focus: unfolded.focus }, focus: after.focus, focusMap: after.focusMap };
    const rows = pv && pv.comp ? pv.comp.rows : [];
    run.check("P-2 「組成」的敵軍組成：步兵（mock_grunt）4、飛騎 2（✈ 飛行）、同名的步兵（mock_sb_twin）4 依第一次出現的順序並附 id；重複的第 2 波 B 步兵不算；" +
      "全關共 10 隻、3 種；原本的摘要（共 2 波，全關 10 隻敵人）與逐波內容照舊；收起後沒有列、鍵盤 Enter 展開；Esc 回到「敵軍預覽」",
      !!pv && pv.comp.complete === "true" && same(rows.map((r) => [r.id, r.count, r.movement]), [["mock_grunt", 4, "ground"], ["mock_flyer", 2, "flying"], ["mock_sb_twin", 4, "ground"]]) &&
        /（mock_grunt）/.test(rows[0].text) && /✈ 飛行/.test(rows[1].text) && /（mock_sb_twin）/.test(rows[2].text) &&
        /全關共 10 隻、3 種敵人/.test(pv.comp.summary || "") && pv.comp.header === "▾ 敵軍組成 共 10 隻" &&
        /共 2 波，全關 10 隻敵人/.test(pv.summary || "") && pv.waves === 2 && pv.wave1Groups === 2 &&
        !!folded && folded.comp.expanded === "false" && folded.comp.rows.length === 0 &&
        !!unfolded && unfolded.comp.expanded === "true" && unfolded.comp.rows.length === 3 && unfolded.focus === "preview-composition-toggle" &&
        after.focus === "enemy-preview-open" && after.focusMap === "chapter3_1",
      out.P2);

    await openPreview("chapter1_9");
    const q = await preview();
    await press("Escape");
    out.P3 = q && q.comp;
    run.check("P-3 資料不完整（Mock Q 缺資料）：只列已確認的組（步兵 1、B 步兵 1），寫明「僅已確認組…非全關總數」、第 2 波沒有資料、找不到 mock_unknown_enemy；原本的摘要仍是數量無法確定",
      !!q && q.comp.complete === "false" && same(q.comp.rows.map((r) => [r.id, r.count]), [["mock_grunt", 1], ["mock_b_grunt", 1]]) &&
        /僅已確認組：共 2 隻/.test(q.comp.summary || "") && /非全關總數/.test(q.comp.summary || "") && q.comp.header === "▾ 敵軍組成 已確認 2 隻" &&
        q.comp.gaps.some((g) => /第 2 波沒有資料/.test(g)) && /mock_unknown_enemy/.test(q.comp.unknown || "") && /全關數量無法確定/.test(q.summary || ""),
      out.P3);

    // P-4 設定更新：過期的設定快取裡「組成」沒有波次（資料未完成）；新的讀取暫停後放行
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("shenma_static_config"));
      raw.maps = raw.maps.map((m) => (m.map_id === "chapter3_1" ? { ...m, waves: [] } : m));
      localStorage.setItem("shenma_static_config", JSON.stringify(raw));
      localStorage.setItem("shenma_static_ts", "0");
      localStorage.setItem("__shenma_mock_hold", JSON.stringify(["get_all_maps"]));
    });
    await page.reload();
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 60000 });
    await page.evaluate(() => localStorage.removeItem("__shenma_mock_hold"));
    await page.waitForFunction(() => window.__shenmaMock.pending("get_all_maps").length === 1, null, { timeout: 30000, polling: 100 });
    await status("incomplete");
    const stale = await bar();
    await openPreview("chapter3_1");
    const pvStale = await preview();
    await page.evaluate(() => window.__shenmaMock.release("get_all_maps"));
    await page.waitForFunction(() => !document.querySelector('[data-testid="stage-card"][data-map-id="chapter3_1"]'), null, { timeout: 30000, polling: 100 });
    await H.sleep(300);
    const pvFresh = await preview();
    const behind = await bar();
    await press("Escape");
    const after4 = await bar();
    out.P4 = { stale: stale.cards, staleRows: pvStale && pvStale.comp.rows.length, staleWaves: pvStale && pvStale.waves, fresh: pvFresh && { title: pvFresh.title, waves: pvFresh.waves, rows: pvFresh.comp.rows.length, complete: pvFresh.comp.complete, focusInside: pvFresh.focusInside }, behind: behind.cards, focus: after4.focus, closed: !(await preview()) };
    run.check("P-4 預覽開著時設定更新、這一關變成資料完整（卡片被「資料未完成」篩選藏起）：預覽仍開著、是同一關、換成新讀到的資料（2 波、組成 3 種）；Esc 關閉後焦點回到搜尋框（原本的卡片已不在）",
      same(stale.cards, ["chapter3_1", "chapter3_2", "chapter3_3"]) && pvStale && pvStale.waves === 0 && pvStale.comp.rows.length === 0 &&
        !!pvFresh && /Mock SB 組成/.test(pvFresh.title || "") && pvFresh.waves === 2 && pvFresh.comp.rows.length === 3 && pvFresh.comp.complete === "true" && pvFresh.focusInside &&
        same(behind.cards, ["chapter3_2", "chapter3_3"]) && out.P4.closed && after4.focus === "stage-filter-search",
      out.P4);

    // P-5 設定真的拿掉那一關：過期的快取多一關「幽靈」
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem("shenma_static_config"));
      const base = raw.maps.find((m) => m.map_id === "chapter3_1");
      raw.maps.push({ ...base, map_id: "chapter3_9", name: "Mock SB 幽靈", unlock_stage: "chapter3_9" });
      localStorage.setItem("shenma_static_config", JSON.stringify(raw));
      localStorage.setItem("shenma_static_ts", "0");
      localStorage.setItem("__shenma_mock_hold", JSON.stringify(["get_all_maps"]));
    });
    await page.reload();
    await page.waitForSelector('[data-testid="stage-card"][data-map-id="chapter3_9"]', { timeout: 60000 });
    await page.evaluate(() => localStorage.removeItem("__shenma_mock_hold"));
    await page.waitForFunction(() => window.__shenmaMock.pending("get_all_maps").length === 1, null, { timeout: 30000, polling: 100 });
    await search("幽靈");
    await openPreview("chapter3_9");
    const ghost = await preview();
    await page.evaluate(() => window.__shenmaMock.release("get_all_maps"));
    await page.waitForFunction(() => !document.querySelector('[data-testid="enemy-preview"]'), null, { timeout: 30000, polling: 100 });
    await H.sleep(800);
    const gone = await bar();
    const reopened = !!(await preview());
    out.P5 = { ghost: ghost && ghost.title, cards: gone.cards, count: gone.count, empty: gone.empty, focus: gone.focus, reopened };
    run.check("P-5 預覽開著時設定拿掉那一關（幽靈）：預覽關閉、焦點回到搜尋框、沒有自己再打開；搜尋「幽靈」變成 0 關並說明",
      !!ghost && /幽靈/.test(ghost.title || "") && gone.cards.length === 0 && gone.count === "符合 0 關／共 14 關" && /沒有符合條件的關卡/.test(gone.empty || "") && gone.focus === "stage-filter-search" && !reopened,
      out.P5);
    await clear();

    // P-6 手機寬度：控制列與敵軍組成都在畫面內
    const fit = {};
    const shots = {};
    for (const vp of [{ width: 390, height: 600 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await page.evaluate(() => document.querySelector('[class*="stagesScrollArea"]')?.scrollTo(0, 0));
      await H.sleep(400);
      fit[vp.height] = { page: await layout() };
      shots[vp.height] = await H.shot(page, `stage-browse-page-390x${vp.height}`);
      await openPreview("chapter3_1");
      await page.locator('[data-testid="preview-composition"]').scrollIntoViewIfNeeded();
      fit[vp.height].preview = await layout();
      shots[vp.height + "-preview"] = await H.shot(page, `stage-browse-preview-390x${vp.height}`);
      await press("Escape");
    }
    const a1 = await gasActions();
    out.P6 = { fit, shots, writes: writes(a1) - writes(a0), actions: a1 };
    run.check("P-6 獨立關卡頁 390×600／390×844：控制列在畫面內、沒有橫向捲動；敵軍組成的每一列在預覽視窗裡；獨立關卡頁全程沒有寫入",
      fits(fit[600].page) && fits(fit[844].page) &&
        [600, 844].every((h) => { const p = fit[h].preview; return p.preview && p.preview.right <= p.vw && p.rowsRight !== null && p.rowsRight <= p.preview.right && p.docScroll <= p.vw; }) &&
        out.P6.writes === 0,
      out.P6);
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  return run.finish({ out });
}
