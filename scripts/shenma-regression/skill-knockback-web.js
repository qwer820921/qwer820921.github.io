async (page) => {
  // 許褚「怪力」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「怪力：擊退效果」沒有寫距離、觸發條件、冷卻與免疫。
  // 遊戲的第一版設計：許褚自己的普通攻擊實際扣到主目標的生命、目標還活著時，把這個地面敵人沿它走過的路線往回推 0.5 格；
  // 成功後冷卻 3 秒戰鬥中的遊戲時間；傷害照普通攻擊，不另外加傷害
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_kb_fixture）：許褚（xu_chu，步兵、攻擊力 103、防禦 70、生命 998、射程 1 格、攻擊間隔 0.9 秒，和正式設定相同）、
  //   關卡「Mock KB 怪力」：直線路線（第 5 列，從 (3,5) 走到 (13,5)），許褚站在路上 (8,5) 擋路；
  //   第 1 波一個生命 99999、每秒 30 像素、攻擊力 5 的走路兵（打不倒，戰鬥不會結束，不產生結算與存檔）
  // - 出征資料一律是正式的參數（knockback 0.5、3）；只用快照與 Godot 送給網頁的訊息觀察（不直接移動敵人、不改冷卻）
  // - A：技能說明（主頁的武將視窗、獨立的武將頁，鍵盤也能打開）：技能名稱「怪力」、短版說明（只寫效果、目前的數值與主要例外，和整句比對）；390×844 與 390×600 在畫面寬度內、字級至少 12px
  // - B：主頁：部署許褚在路上，走路兵走到許褚面前被擋住；Godot 的紀錄：每次推動要求與實際都是半格、路點索引不變（直線）、剩餘路程增加實際退距、
  //      敵人往起點方向退（x 變小、y 不變）；相鄰兩次推動的戰鬥時間相差 3 秒以上、不超過 3 秒＋一個攻擊間隔＋容許；推動後出現 PUSH；
  //      選取面板寫出選取時的冷卻（390×600 也在面板與畫面裡）
  // - C：獨立戰鬥頁：同樣部署，2× 時推動的戰鬥時間間隔仍是 3 秒以上（牆鐘時間約一半）
  // - D：存檔、session 都沒有技能或怪力欄位，隊伍只有 hero_id／slot，武將與資源不變、沒有戰鬥紀錄
  // 全部 mock、虛構金鑰 test_wy_*（不含被比對的字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_wy_k";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_9", name: "Mock KB 怪力" };
  const XC_CELL = [8, 5];
  const SKILL = { id: "knockback", knockback_distance: 0.5, knockback_cooldown: 3 };
  const ATK_INTERVAL = 0.9;

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[3, ROW], [13, ROW]] }, spawn: [3, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [
      {
        hero_id: "xu_chu", name: "許褚", rarity: "purple", cost: 5, job: "infantry",
        base_atk: 103, base_def: 70, base_hp: 998, attack_range: 1, attack_speed: 0.9, upgrade_cost_base: 75,
        atk_growth: 10.3, def_growth: 7, hp_growth: 99.8, range_growth: 0.03, speed_growth: 0.01, image: "hero_xu_chu.webp", attack_image: "hero_xu_chu_atk.webp",
      },
    ],
    enemies: [
      { enemy_id: "mock_kb_walker", name: "走兵", hp: 99999, speed: 30, atk: 5, image: "enemy_grunt1.webp" },
    ],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [
        { wave: 1, enemies: [{ enemy_id: "mock_kb_walker", count: 1, interval: 0.3, path: "path_a" }] },
      ],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    const ids = extra.heroes.map((h) => h.hero_id);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_kb_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps" || body.action === "get_enemies_config" || body.action === "get_heroes_config") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (j && j.status === 200) {
            if (body.action === "get_all_maps" && Array.isArray(j.maps)) j.maps = [...j.maps.filter((m) => m.map_id !== extra.maps[0].map_id), ...extra.maps];
            if (body.action === "get_enemies_config" && Array.isArray(j.enemies)) j.enemies = [...j.enemies, ...extra.enemies];
            if (body.action === "get_heroes_config" && Array.isArray(j.heroes)) j.heroes = [...j.heroes.filter((h) => !ids.includes(h.hero_id)), ...extra.heroes];
            return new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          return res;
        }
      }
      return inner(input, init);
    };
  }, EXTRA);
  // 遊戲 iframe 實際收到的訊息（在 iframe 裡記錄，只記錄、不影響 Godot 的處理）
  await page.addInitScript(() => {
    if (window.__wyRecv) return;
    window.__wyRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__wyRecv.push(e.data);
    });
  });

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const near = (a, b, eps = 1e-6) => typeof a === "number" && Math.abs(a - b) <= eps;
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const sessionRaw = () => page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const snapshot = async (sel) => {
    const id = "kb-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const received = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__wyRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const xc = last ? last.team_list.find((t) => t.hero_id === "xu_chu") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: xc ? xc.skill ?? null : undefined, atk: xc ? xc.atk : undefined };
    }, sel);
  const dismissSplash = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
  // 格子中心在頁面上的座標（和 Godot 的版面相同：540×720 的設計解析度等比縮放、地圖置中）
  const cellPoint = async (sel, c, row, cols = 14, rows = 11) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    }, sel);
    const s = Math.min(r.width / 540, r.height / 720);
    const vx = r.width / s, vy = r.height / s;
    const tile = Math.max(16, Math.floor(Math.min(vx / cols, vy / rows)));
    const ox = (vx - cols * tile) / 2, oy = (vy - rows * tile) / 2;
    return { x: r.left + (ox + (c + 0.5) * tile) * s, y: r.top + (oy + (row + 0.5) * tile) * s };
  };
  // 用滑鼠點格子、在部署選單選武將（路上的格子是道路選單）
  const deploy = async (sel, c, row, heroName) => {
    const idx = await H.bridgeLen(page);
    const p = await cellPoint(sel, c, row);
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    const click = await page.evaluate((i) => (window.__bridgeLog || []).slice(i).filter((m) => m.type === "click_cell").pop() || null, idx);
    const tab = page.locator('[data-testid="placement-menu"] button[class*="tabBtn"]', { hasText: "武將" });
    if ((await tab.count()) > 0) await tab.click();
    await page.locator('button[class*="menuCard"]', { hasText: heroName }).click();
    await H.sleep(600);
    return click;
  };
  const kb = (s) => (((s || {}).hero_knockback) || {}).xu_chu || null;
  // 推動紀錄：每一筆的要求／實際退距、索引、剩餘路程的增加與戰鬥時間；相鄰兩筆的戰鬥時間差
  const logOk = (log) =>
    (log || []).every((x) => near(x.requested, x.actual, 1e-6) && x.actual > 0 && x.index_before === x.index_after &&
      near(x.remaining_after - x.remaining_before, x.actual, 1e-3));
  const gaps = (log) => (log || []).slice(1).map((x, i) => Number((x.t - log[i].t).toFixed(4)));
  // 等到推動次數 ≥ n（每 150 毫秒看一次快照；順便記下推動之後看得到的 PUSH 標記數與敵人位置）
  const watch = async (sel, n, ms) => {
    const end = Date.now() + ms;
    const seen = { push: 0, pos: [], wall: [] };
    let last = null;
    let lastCount = 0;
    for (;;) {
      const s = await snapshot(sel);
      const k = kb(s);
      last = { kb: k, s };
      seen.push = Math.max(seen.push, s.push_texts || 0);
      const pos = Object.values(s.enemy_path || {})[0];
      if (pos) seen.pos.push(pos.pos);
      if (k && k.count > lastCount) {
        lastCount = k.count;
        seen.wall.push(Date.now());
      }
      if ((k && k.count >= n) || Date.now() > end) return { ...last, seen };
      await H.sleep(150);
    }
  };
  const clickSpeed = async (sel, v) => {
    await page.locator(`[data-testid="speed-${v}"]`).first().click();
    const end = Date.now() + 15000;
    for (;;) {
      const s = await snapshot(sel);
      if (near(s.time_scale, v) || Date.now() > end) return near(s.time_scale, v);
      await H.sleep(150);
    }
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `knockback-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };
  // 技能說明是短版（只寫效果、目前的數值與主要例外）：整句寫在這裡，數值是這支腳本的 mock 武將（射程、攻擊力）算出的
  const RULES = (t) =>
    /技能：怪力/.test(t) && t.includes("普通攻擊打中、目標還活著時，把這名地面敵人沿原路往回推 0.5 格；成功推動後冷卻 3 秒。飛行敵人不受影響。") && !/冷卻中，還剩/.test(t);
  const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12 && m.docScroll <= m.vw;
  const measure = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="hero-skill-detail"]');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const text = el.querySelector('[class*="heroSkillText"]') || el;
      return {
        left: Math.round(b.left), right: Math.round(b.right), vw: window.innerWidth,
        scrollW: el.scrollWidth, clientW: el.clientWidth, font: parseFloat(getComputedStyle(text).fontSize),
        docScroll: document.documentElement.scrollWidth,
      };
    });
  const closePanel = async () => {
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await H.sleep(300);
  };

  // ── 準備 ──
  let profile0 = null;
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, m }) => {
      localStorage.setItem("__shenma_kb_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "怪力", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: m, heroes: [],
          team: [{ hero_id: "xu_chu", slot: 1 }] } },
        battle_logs: [],
      }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, m: MAP.id });
    profile0 = (await db()).profiles[KEY];
    await page.setViewportSize({ width: 540, height: 900 });
  });

  // ── A. 技能說明（一般寬度、窄畫面、矮畫面與鍵盤）──
  await section("A", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="xu_chu"]');
    const card = await page.locator('[role="dialog"] button[data-hero-id="xu_chu"]').innerText();
    await page.locator('[role="dialog"] button[data-hero-id="xu_chu"]').click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "knockback-a-skill-detail") };
    run.check("A-1 主頁武將視窗：許褚的卡片是「技能：怪力」；詳情是短版說明：打中且目標還活著時把地面敵人沿原路往回推 0.5 格、成功推動後冷卻 3 秒、飛行敵人不受影響；出征前不寫冷卻中",
      /技能：怪力/.test(card) && RULES(detail), out.A_modal);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('button[data-hero-id="xu_chu"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="hero-skill-detail"]', { timeout: 15000 });
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：許褚有「怪力」標籤（只有一個）；用鍵盤聚焦卡片按 Enter 打開詳情，顯示同樣的規則",
      tags.filter((t) => t === "技能：怪力").length === 1 && detail2 === detail, out.A_page);

    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const narrowPage = await measure();
    const narrowPageShot = await H.shot(page, "knockback-a-narrow-heroes-page");
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const shortPage = await measure();
    const shortPageShot = await H.shot(page, "knockback-a-short-heroes-page");
    await page.keyboard.press("Escape");
    await H.sleep(400);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="xu_chu"]');
    await page.locator('[role="dialog"] button[data-hero-id="xu_chu"]').click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "knockback-a-narrow-modal");
    out.A_narrow = { narrowPage, shortPage, narrowModal, narrowPageShot, shortPageShot, narrowModalShot };
    run.check("A-3 窄畫面（390×844）與矮畫面（390×600）：武將頁與主頁武將視窗的怪力說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(shortPage) && fits(narrowModal), out.A_narrow);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：許褚在路上擋路，走路兵被擋住、被沿原路推回；冷卻 3 秒戰鬥時間；選取面板 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    const c1 = await deploy(IFRAME, XC_CELL[0], XC_CELL[1], "許褚");
    const recv = await received(IFRAME);
    const s0 = await snapshot(IFRAME);
    out.B_payload = { c1, recv, kb: kb(s0), summary: s0.knockback };
    run.check("B-1 規則 payload：用滑鼠點路上的 (8,5) 放許褚（部署選單）；遊戲 iframe 收到的出征資料裡，許褚的 skill 正好是 {id: knockback, knockback_distance: 0.5, knockback_cooldown: 3}、攻擊力 103；開戰前快照 hero_knockback {0.5, 3, 0 次、剩 0}",
      !!c1 && c1.cell_x === XC_CELL[0] && c1.cell_y === XC_CELL[1] && recv.stage === MAP.id && same(recv.skill, SKILL) && recv.atk === 103 &&
        !!kb(s0) && near(kb(s0).distance, 0.5) && near(kb(s0).cooldown, 3) && kb(s0).count === 0 && near(kb(s0).remaining, 0),
      out.B_payload);

    await H.clickButton(page, "迎戰");
    const w = await watch(IFRAME, 3, 120000);
    const k = w.kb || {};
    const log = k.log || [];
    const gp = gaps(log);
    const ys = w.seen.pos.map((p) => p[1]);
    out.B_push = { count: k.count, log, gaps: gp, push: w.seen.push, ys: [...new Set(ys)], tile: log[0] ? log[0].requested * 2 : null, shot: await H.shot(page, "knockback-b-pushed") };
    run.check("B-2 主頁實際推動 3 次：每次要求與實際都是半格、路點索引不變（直線）、剩餘路程增加實際退距；敵人一直在同一列（y 不變）；看得到 PUSH 標記；相鄰兩次推動的戰鬥時間相差 3 秒以上、不超過 3 秒＋攻擊間隔 0.9＋0.1",
      k.count >= 3 && log.length >= 3 && logOk(log) && log.every((x) => near(x.requested, log[0].requested)) && new Set(ys).size === 1 &&
        w.seen.push >= 1 && gp.length >= 2 && gp.every((g) => g >= 3 - 1e-6 && g <= 3 + ATK_INTERVAL + 0.1),
      out.B_push);

    // 選取面板：點場上的許褚（390×600 也在面板與畫面裡）
    const xp = await cellPoint(IFRAME, XC_CELL[0], XC_CELL[1]);
    await page.mouse.click(xp.x, xp.y);
    await page.waitForSelector('[data-testid="unit-panel-knockback"]', { timeout: 15000 });
    const panel = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-knockback"]');
      return { note: el.innerText, remaining: Number(el.dataset.remaining) };
    });
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-knockback"]');
      const p = document.querySelector('[data-testid="unit-panel"]');
      if (!el || !p) return null;
      el.scrollIntoView({ block: "nearest" });
      const b = el.getBoundingClientRect();
      const pb = p.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), vw: window.innerWidth, vh: window.innerHeight,
        panelTop: Math.round(pb.top), panelBottom: Math.round(pb.bottom), font: parseFloat(getComputedStyle(el).fontSize), docScroll: document.documentElement.scrollWidth };
    });
    const panelShot = await H.shot(page, "knockback-b-unit-panel-390x600");
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(400);
    await closePanel();
    out.B_panel = { panel, box, panelShot };
    const inside = (b) => !!b && b.left >= 0 && b.right <= b.vw && b.docScroll <= b.vw && b.font >= 12 && b.top >= b.panelTop && b.bottom <= b.panelBottom + 1 && b.bottom <= b.vh;
    const cooling = /怪力：(?:選取時|目前)冷卻中，還剩 [0-9.]+ 秒；打中仍活著的地面目標時沿原路往回推 0\.5 格，成功後冷卻 3 秒（(?:重新點選可以更新|即時更新)）/.test(panel.note);
    const ready = /怪力：(?:選取時|目前)可以推動；打中仍活著的地面目標時沿原路往回推 0\.5 格，成功後冷卻 3 秒（(?:重新點選可以更新|即時更新)）/.test(panel.note);
    run.check("B-3 選取面板「怪力：選取時冷卻中，還剩 x 秒（或可以推動）；打中仍活著的地面目標時沿原路往回推 0.5 格，成功後冷卻 3 秒（重新點選可以更新）」，剩下的秒數在 0～3 之間、和文字一致；390×600 時說明整段在面板與畫面裡（截圖另存）",
      (cooling || ready) && panel.remaining >= 0 && panel.remaining <= 3 && (panel.remaining > 0) === cooling && inside(box),
      out.B_panel);
  });

  // ── C. 獨立戰鬥頁（真的部署 UI，2×）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const c1 = await deploy(BIFRAME, XC_CELL[0], XC_CELL[1], "許褚");
    const recv = await received(BIFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const x2 = await clickSpeed(BIFRAME, 2);
    const w = await watch(BIFRAME, 3, 120000);
    const k = w.kb || {};
    const log = k.log || [];
    const gp = gaps(log);
    const wallGaps = w.seen.wall.slice(1).map((t, i) => t - w.seen.wall[i]);
    out.C = { c1, recv, x2, count: k.count, gaps: gp, wallGaps, timeScale: w.s.time_scale, shot: await H.shot(page, "knockback-c-battle-field") };
    run.check("C-1 獨立戰鬥頁：用部署選單放許褚 (8,5)；iframe 收到的 skill 和主頁相同；2× 時推動 3 次，紀錄同樣是半格、索引不變、剩餘路程增加實際退距；相鄰兩次的戰鬥時間仍相差 3 秒以上、不超過 3＋0.9＋0.1，牆鐘時間間隔少於 2.6 秒",
      !!c1 && recv.stage === MAP.id && same(recv.skill, SKILL) && x2 && k.count >= 3 && logOk(log) && near(w.s.time_scale, 2) &&
        gp.length >= 2 && gp.every((g) => g >= 3 - 1e-6 && g <= 3 + ATK_INTERVAL + 0.1) && wallGaps.length >= 1 && wallGaps.every((g) => g < 2600),
      out.C);
  });

  // ── D. 存檔與 session 不帶技能欄位、屬性與資源不變 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const d = await db();
    const p = d.profiles[KEY];
    const sess = await sessionRaw();
    const bad = /skill|knockback|cooldown|supply|multiplier|berserk|stacks|storm|chain|double_shot|tenacity|counter|lifesteal|stun|def_aura|slow_aura|sweep|burn|long_range|first_attack/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null, logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或怪力欄位；隊伍仍只有 hero_id／slot，武將資料與金幣／經驗／等級／進度不變、沒有戰鬥紀錄",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_kb_fixture")).catch(() => {});
  return run.finish({ out });
}
