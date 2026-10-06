async (page) => {
  // 呂布「戰神」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「戰神：攻擊力隨殺敵增加」沒有寫倍率、上限、擊殺歸屬與保留時間。
  // 遊戲的第一版設計：呂布自己的普通攻擊打倒一名敵人後，下一擊起攻擊力增加目前等級攻擊力的 5%（加法疊加），最多 10 層；這一場內保留、新的一場從 0 開始；只在戰場
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_bk_fixture）：呂布（lv_bu，騎兵、攻擊力 125、防禦 100、生命 1113、射程 2 格、攻擊間隔 1.3 秒，和正式設定相同）、
  //   關卡「Mock BK 戰神」：直線路線（第 5 列，從 (6,5) 出兵）。第 1 波三個生命 100、不會移動的木樁（一擊就倒），第 2 波一個生命 99999 的木樁
  // - 出征資料一律是正式的參數（berserk 0.05、10 層）；只用快照觀察（不直接扣血、不改層數）
  // - A：技能說明（主頁的武將視窗、獨立的武將頁，鍵盤也能打開）：技能名稱「戰神」、短版說明（只寫效果、目前的數值與主要例外，和整句比對）；390×844 與 390×600 在畫面寬度內、字級至少 12px
  // - B：主頁用部署選單把呂布放在建築格 (6,4)：iframe 收到的 skill 正好是 {id: berserk, berserk_ratio: 0.05, berserk_max_stacks: 10}；
  //      選取面板在開戰前是 0 層、125；第 1 波三次擊殺依序是 125、131.25、137.5（打倒的那一擊不提前加成）→ 3 層、提示 3 次（暫停時截圖「ATK+5%」）；
  //      清波後重新選取是 3 層、125 → 143.75；第 2 波（跨波保留）每一擊 143.75；暫停 1 秒沒有攻擊；切到 2× 照樣一致
  // - C：獨立戰鬥頁：同樣用部署選單放置，2× 時三次擊殺照樣 125、131.25、137.5 → 3 層
  // - D：存檔、session 都沒有技能或戰神欄位，隊伍只有 hero_id／slot，武將與資源不變
  // 全部 mock、虛構金鑰 test_wx_*（不含被比對的字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_wx_l";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_9", name: "Mock BK 戰神" };
  const LB_CELL = [6, 4];
  const SKILL = { id: "berserk", berserk_ratio: 0.05, berserk_max_stacks: 10 };
  const ATK = 125;
  const SOFT_HP = 100;
  const SOFTS = 3;
  const POST_HP = 99999;
  // 加層前的有效攻擊力：0、1、2、3 層
  const EFF = [125, 131.25, 137.5, 143.75];

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[6, ROW], [13, ROW]] }, spawn: [6, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [
      {
        hero_id: "lv_bu", name: "呂布", rarity: "orange", cost: 7, job: "cavalry",
        base_atk: 125, base_def: 100, base_hp: 1113, attack_range: 2, attack_speed: 1.3, upgrade_cost_base: 100,
        atk_growth: 12.5, def_growth: 10, hp_growth: 111.3, range_growth: 0.05, speed_growth: 0.02, image: "hero_lv_bu.webp", attack_image: "hero_lv_bu_atk.webp",
      },
    ],
    enemies: [
      { enemy_id: "mock_bk_soft", name: "草人", hp: SOFT_HP, speed: 0, image: "enemy_grunt1.webp" },
      { enemy_id: "mock_bk_post", name: "木樁", hp: POST_HP, speed: 0, image: "enemy_grunt1.webp" },
    ],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [
        { wave: 1, enemies: [{ enemy_id: "mock_bk_soft", count: SOFTS, interval: 0.3, path: "path_a" }] },
        { wave: 2, enemies: [{ enemy_id: "mock_bk_post", count: 1, interval: 0.3, path: "path_a" }] },
      ],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_bk_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps" || body.action === "get_enemies_config" || body.action === "get_heroes_config") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (j && j.status === 200) {
            if (body.action === "get_all_maps" && Array.isArray(j.maps)) j.maps = [...j.maps.filter((m) => m.map_id !== extra.maps[0].map_id), ...extra.maps];
            if (body.action === "get_enemies_config" && Array.isArray(j.enemies)) j.enemies = [...j.enemies, ...extra.enemies];
            if (body.action === "get_heroes_config" && Array.isArray(j.heroes)) j.heroes = [...j.heroes.filter((h) => h.hero_id !== "lv_bu"), ...extra.heroes];
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
    if (window.__wxRecv) return;
    window.__wxRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__wxRecv.push(e.data);
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
    const id = "bk-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const received = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__wxRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const lb = last ? last.team_list.find((t) => t.hero_id === "lv_bu") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: lb ? lb.skill ?? null : undefined, atk: lb ? lb.atk : undefined };
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
  // 用滑鼠點空格、在部署選單選武將
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
  const bk = (s) => ((s || {}).hero_berserk || {}).lv_bu || null;
  // 一次觀察：呂布的戰神狀態、場上敵人依生成序號排列的生命
  const fieldOf = (s) => {
    const d = bk(s);
    const ids = Object.keys(s.enemy_hp || {}).sort((a, b) => (s.enemy_seq || {})[a] - (s.enemy_seq || {})[b]);
    return { d, hps: ids.map((k) => s.enemy_hp[k]), enemies: ids.length, frozen: s.world_frozen, ts: s.time_scale, state: s.game_state, wave: s.current_wave };
  };
  const watch = async (sel, until, ms) => {
    const end = Date.now() + ms;
    let last = null;
    for (;;) {
      const s = await snapshot(sel);
      last = { ...fieldOf(s), s };
      if (until(last) || Date.now() > end) return last;
      await H.sleep(150);
    }
  };
  // 第 1 波的三次擊殺：紀錄依序是 [這一擊的傷害, 實扣, 加層前, 加層後] = [125, 100, 0, 1]、[131.25, 100, 1, 2]、[137.5, 100, 2, 3]
  const killsOk = (d) =>
    !!d && d.stacks === 3 && d.kills === 3 && d.shown === 3 && d.last_text === "ATK+15%" && Array.isArray(d.log) && d.log.length === 3 &&
    d.log.every((x, i) => near(x.damage, EFF[i]) && near(x.dealt, SOFT_HP) && x.before === i && x.after === i + 1) &&
    near(d.base_atk, ATK) && near(d.effective_atk, EFF[3]) && near(d.mult, 1.15);
  const setPaused = async (sel, want) => {
    await page.getByRole("button", { name: want ? "暫停" : "繼續", exact: true }).first().click();
    const end = Date.now() + 15000;
    for (;;) {
      const s = await snapshot(sel);
      if (s.world_frozen === want || Date.now() > end) return s.world_frozen === want;
      await H.sleep(100);
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
      try { out[name + "_shot"] = await H.shot(page, `berserk-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
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
    /技能：戰神/.test(t) && t.includes("自己的普通攻擊打倒敵人後，從下一擊起攻擊力 +5%，最多 10 層（+50%，目前最高 187.5）。層數只在這一場保留，新的一場從 0 開始。");
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
  // 選取面板：點場上的呂布，回傳戰神說明與攻擊力欄（面板放不下時捲到說明）
  const panelOf = async (sel) => {
    const hp = await cellPoint(sel, LB_CELL[0], LB_CELL[1]);
    await page.mouse.click(hp.x, hp.y);
    await page.waitForSelector('[data-testid="unit-panel-berserk"]', { timeout: 15000 });
    return page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-berserk"]');
      const atk = document.querySelector('[data-testid="unit-panel-atk"]');
      return { note: el.innerText, stacks: Number(el.dataset.stacks), base: Number(el.dataset.baseAtk), eff: Number(el.dataset.effectiveAtk), atk: atk ? atk.innerText : null };
    });
  };
  const closePanel = async () => {
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await H.sleep(300);
  };

  // ── 準備 ──
  let profile0 = null;
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, m }) => {
      localStorage.setItem("__shenma_bk_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "戰神", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: m, heroes: [],
          team: [{ hero_id: "lv_bu", slot: 1 }] } },
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
    await page.waitForSelector('[role="dialog"] button[data-hero-id="lv_bu"]');
    const card = await page.locator('[role="dialog"] button[data-hero-id="lv_bu"]').innerText();
    await page.locator('[role="dialog"] button[data-hero-id="lv_bu"]').click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "berserk-a-skill-detail") };
    run.check("A-1 主頁武將視窗：呂布的卡片是「技能：戰神」；詳情是短版說明：自己的普通攻擊打倒敵人後下一擊起 +5%、最多 10 層（+50%，目前攻擊力 125 時最高 187.5）、只在這一場保留、新的一場從 0 開始",
      /技能：戰神/.test(card) && RULES(detail), out.A_modal);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('button[data-hero-id="lv_bu"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="hero-skill-detail"]', { timeout: 15000 });
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：呂布有「戰神」標籤（只有一個）；用鍵盤聚焦卡片按 Enter 打開詳情，顯示同樣的規則",
      tags.filter((t) => t === "技能：戰神").length === 1 && detail2 === detail, out.A_page);

    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const narrowPage = await measure();
    const narrowPageShot = await H.shot(page, "berserk-a-narrow-heroes-page");
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const shortPage = await measure();
    const shortPageShot = await H.shot(page, "berserk-a-short-heroes-page");
    await page.keyboard.press("Escape");
    await H.sleep(400);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="lv_bu"]');
    await page.locator('[role="dialog"] button[data-hero-id="lv_bu"]').click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "berserk-a-narrow-modal");
    out.A_narrow = { narrowPage, shortPage, narrowModal, narrowPageShot, shortPageShot, narrowModalShot };
    run.check("A-3 窄畫面（390×844）與矮畫面（390×600）：武將頁與主頁武將視窗的戰神說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(shortPage) && fits(narrowModal), out.A_narrow);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署選單放置、選取面板、只用快照觀察 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    const c1 = await deploy(IFRAME, LB_CELL[0], LB_CELL[1], "呂布");
    const recv = await received(IFRAME);
    const p0 = bk(await snapshot(IFRAME));
    out.B_payload = { c1, recv, bk: p0 };
    run.check("B-1 規則 payload：用滑鼠點建築格 (6,4) 放呂布（部署選單）；遊戲 iframe 收到的出征資料裡，呂布的 skill 正好是 {id: berserk, berserk_ratio: 0.05, berserk_max_stacks: 10}、攻擊力 125；Godot 讀到同樣的參數、0 層、有效攻擊力 125、還沒有攻擊",
      !!c1 && c1.cell_x === LB_CELL[0] && c1.cell_y === LB_CELL[1] && recv.stage === MAP.id && same(recv.skill, SKILL) && recv.atk === ATK &&
        !!p0 && p0.ratio === 0.05 && p0.max_stacks === 10 && p0.stacks === 0 && near(p0.base_atk, ATK) && near(p0.effective_atk, ATK) && p0.attacks === 0 && p0.log.length === 0,
      out.B_payload);

    const panel0 = await panelOf(IFRAME);
    await closePanel();
    out.B_panel0 = panel0;
    run.check("B-2 開戰前的選取面板：戰神 0 層（+0%），基礎攻擊力 125、目前 125；攻擊力欄只寫 125（沒有把最大值 187.5 當成目前）",
      /戰神：(?:選取時|目前)本場 0 層（\+0%），基礎攻擊力 125、目前 125；自己打倒敵人後下一擊起每層 \+5%，最多 10 層，新的一場從 0 層開始/.test(panel0.note) &&
        panel0.stacks === 0 && panel0.base === ATK && panel0.eff === ATK && panel0.atk === "125" && !/187\.5/.test(panel0.note + panel0.atk), panel0);

    await H.clickButton(page, "迎戰");
    // 第一次擊殺後立刻暫停，截下呂布上方的「ATK+5%」
    const w1 = await watch(IFRAME, (f) => !!f.d && f.d.shown >= 1, 120000);
    const paused1 = await setPaused(IFRAME, true);
    const lp = await cellPoint(IFRAME, LB_CELL[0], LB_CELL[1]);
    const zoomShot = `${H.EVIDENCE}/berserk-b-prompt-zoom.png`;
    await page.screenshot({ path: zoomShot, clip: { x: Math.max(0, lp.x - 110), y: Math.max(0, lp.y - 130), width: 220, height: 220 } });
    const fieldShot = await H.shot(page, "berserk-b-prompt-paused");
    const atPause = bk(await snapshot(IFRAME));
    await H.sleep(1000);
    const afterPause = bk(await snapshot(IFRAME));
    const resumed1 = await setPaused(IFRAME, false);
    // 第 1 波打完（三次擊殺）→ 清波回到備戰
    const w2 = await watch(IFRAME, (f) => !!f.d && f.d.kills >= SOFTS && f.state === 1, 120000);
    out.B_wave1 = { first: w1.d && { stacks: w1.d.stacks, shown: w1.d.shown, text: w1.d.last_text }, paused1, atPause: atPause && { attacks: atPause.attacks, stacks: atPause.stacks }, afterPause: afterPause && { attacks: afterPause.attacks, stacks: afterPause.stacks }, resumed1, zoomShot, fieldShot, bk: w2.d, state: w2.state };
    run.check("B-3 第 1 波（1×）：三次擊殺的那一擊依序是 125、131.25、137.5（打倒的那一擊不提前加成），每次實扣 100、層數 0→1→2→3；提示 3 次（最後「ATK+15%」）；第一次擊殺後暫停 1 秒，攻擊次數與層數不變（截圖有「ATK+5%」）；清波後 3 層、有效攻擊力 143.75（加法 125 × 1.15）",
      !!w1.d && w1.d.stacks >= 1 && paused1 && !!atPause && !!afterPause && afterPause.attacks === atPause.attacks && afterPause.stacks === atPause.stacks && resumed1 &&
        killsOk(w2.d) && w2.state === 1,
      out.B_wave1);

    // 清波後重新選取：面板是 3 層、125 → 143.75（390×600 也在面板與畫面內）
    const panel1 = await panelOf(IFRAME);
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-berserk"]');
      const panel = document.querySelector('[data-testid="unit-panel"]');
      if (!el || !panel) return null;
      el.scrollIntoView({ block: "nearest" });
      const b = el.getBoundingClientRect();
      const p = panel.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), vw: window.innerWidth, vh: window.innerHeight,
        panelTop: Math.round(p.top), panelBottom: Math.round(p.bottom), font: parseFloat(getComputedStyle(el).fontSize), docScroll: document.documentElement.scrollWidth };
    });
    const panelShot = await H.shot(page, "berserk-b-unit-panel-390x600");
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(400);
    await closePanel();
    out.B_panel1 = { panel1, box, panelShot };
    const inside = (b) => !!b && b.left >= 0 && b.right <= b.vw && b.docScroll <= b.vw && b.font >= 12 && b.top >= b.panelTop && b.bottom <= b.panelBottom + 1 && b.bottom <= b.vh;
    run.check("B-4 清波後重新選取呂布：面板「戰神：選取時本場 3 層（+15%），基礎攻擊力 125、目前 143.75」，攻擊力欄「125 → 143.75」；390×600 時說明整段在面板與畫面裡（截圖另存）",
      /戰神：(?:選取時|目前)本場 3 層（\+15%），基礎攻擊力 125、目前 143\.75/.test(panel1.note) && panel1.stacks === 3 && panel1.base === ATK && near(panel1.eff, 143.75) &&
        panel1.atk === "125 → 143.75" && inside(box),
      out.B_panel1);

    // 第 2 波（跨波保留）：每一擊 143.75；暫停 1 秒沒有攻擊；切到 2× 照樣
    await H.clickButton(page, "迎戰");
    const v0 = await watch(IFRAME, (f) => !!f.d && f.enemies === 1 && f.d.attacks > w2.d.attacks, 120000);
    const v1 = await watch(IFRAME, (f) => !!f.d && f.d.attacks >= v0.d.attacks + 2, 60000);
    const paused2 = await setPaused(IFRAME, true);
    const at2 = fieldOf(await snapshot(IFRAME));
    await H.sleep(1000);
    const after2 = fieldOf(await snapshot(IFRAME));
    const resumed2 = await setPaused(IFRAME, false);
    const x2 = await clickSpeed(IFRAME, 2);
    const v2 = await watch(IFRAME, (f) => !!f.d && f.d.attacks >= at2.d.attacks + 3, 60000);
    const hits = (f) => f.d.attacks - w2.d.attacks;
    const lostOk = (f) => f.enemies === 1 && near(POST_HP - f.hps[0], EFF[3] * hits(f), 1e-6);
    out.B_wave2 = { v1: { attacks: v1.d.attacks, hps: v1.hps, stacks: v1.d.stacks }, paused2, at2: { attacks: at2.d.attacks, hps: at2.hps }, after2: { attacks: after2.d.attacks, hps: after2.hps }, resumed2, x2,
      v2: { attacks: v2.d.attacks, hps: v2.hps, stacks: v2.d.stacks, ts: v2.ts, kills: v2.d.kills }, shot: await H.shot(page, "berserk-b-wave2") };
    run.check("B-5 第 2 波（跨波保留 3 層）：木樁每一擊被打掉 143.75（生命＝99999 − 143.75 × 攻擊次數）；暫停 1 秒攻擊次數與生命不變；切到 2× 後再 3 次以上攻擊照樣一致，仍是 3 層、擊殺 3",
      lostOk(v1) && v1.d.stacks === 3 && paused2 && at2.frozen === true && after2.d.attacks === at2.d.attacks && same(after2.hps, at2.hps) && resumed2 &&
        x2 && near(v2.ts, 2) && lostOk(v2) && v2.d.stacks === 3 && v2.d.kills === 3,
      out.B_wave2);
  });

  // ── C. 獨立戰鬥頁（真的部署 UI，2×）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const c1 = await deploy(BIFRAME, LB_CELL[0], LB_CELL[1], "呂布");
    const recv = await received(BIFRAME);
    const placed = bk(await snapshot(BIFRAME));
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const x2 = await clickSpeed(BIFRAME, 2);
    const w = await watch(BIFRAME, (f) => !!f.d && f.d.kills >= SOFTS && f.state === 1, 120000);
    out.C = { c1, recv, placed: placed && { stacks: placed.stacks, ratio: placed.ratio }, x2, bk: w.d, shot: await H.shot(page, "berserk-c-battle-field") };
    run.check("C-1 獨立戰鬥頁：用部署選單放呂布 (6,4)；iframe 收到的 skill 和主頁相同、開戰前 0 層；2× 時三次擊殺照樣 125、131.25、137.5 → 3 層、有效攻擊力 143.75",
      !!c1 && recv.stage === MAP.id && same(recv.skill, SKILL) && !!placed && placed.stacks === 0 && placed.ratio === 0.05 && x2 && killsOk(w.d), out.C);
  });

  // ── D. 存檔與 session 不帶技能欄位、屬性與資源不變 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const d = await db();
    const p = d.profiles[KEY];
    const sess = await sessionRaw();
    const bad = /skill|berserk|stacks|storm|chain|double_shot|tenacity|counter|lifesteal|stun|def_aura|slow_aura|sweep|burn|long_range|first_attack/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null, logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或戰神欄位；隊伍仍只有 hero_id／slot，武將資料與金幣／經驗／等級／進度不變、沒有戰鬥紀錄",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_bk_fixture")).catch(() => {});
  return run.finish({ out });
}
