async (page) => {
  // 曹操「指揮」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「指揮：提升友軍攻速」沒有寫數值與範圍。
  // 遊戲的第一版設計：以曹操為中心、目前有效射程內（含邊界）的其他友軍武將每秒攻擊次數 × 1.15（攻擊間隔 ÷ 1.15，不是減少 15%）；
  // 不含自己與防禦塔；取最強不疊加；只影響之後新開始的攻擊冷卻；只在戰鬥中
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_cmd_fixture）：曹操（射程 1.5 格）、合成的弓手（mock_spd_ally：沒有技能、射程 3 格、攻擊間隔 1 秒）、
  //   合成的遠弓（mock_spd_far：沒有技能、射程 6 格、攻擊間隔 1 秒），關卡「Mock CMD 指揮」：直線路線（第 5 列），一個不會移動、血量很多的地面兵（在起點 (0,5)）
  // - A：技能說明（主頁的武將視窗、獨立的武將頁）：技能名稱「指揮」、短版說明（只寫效果、目前的數值與主要例外，和整句比對）；390×844 說明在畫面寬度內、字級至少 12px
  // - B：主頁用部署選單（真的部署 UI）把弓手放在 (1,4)、遠弓放在 (5,6)、曹操放在 (2,4)：遊戲 iframe 收到的曹操 skill 正好是
  //      {id: atk_speed_aura, atk_speed_mult: 1.15}、兩位友軍沒有 skill；備戰時光環不作用、沒有加成。
  //      開戰後只用快照觀察：弓手（距離 1 格）1.15、每次冷卻 1 ÷ 1.15、預定時間差都是前一次的間隔，同一段遊戲時間的次數＝時間 × 1.15（差不到 1 下）；
  //      遠弓（範圍外）1、每次冷卻 1 秒；曹操自己 1、光環作用中、只加成弓手；
  //      暫停後在戰場點弓手：面板的攻擊間隔是「1 → 0.87秒」、有「指揮」的說明（選取時、不改存檔）與選取時數值的說明；點遠弓是「1秒」、沒有說明；390×844 面板在畫面內；
  //      舊版遊戲沒有送有效攻速的面板照原本顯示（沒有箭頭與說明）
  // - C：獨立戰鬥頁：同樣用部署選單放置，弓手 1.15、每次冷卻 1 ÷ 1.15，遠弓 1
  // - D：存檔、session 都沒有技能或攻速欄位，隊伍只有 hero_id／slot，資源不變、沒有戰鬥紀錄
  // 全部 mock、虛構金鑰 test_cmd_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_cmd_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_8", name: "Mock CMD 指揮" };
  const CELLS = { ally: [1, 4], far: [5, 6], cao: [2, 4] };
  const SKILL = { id: "atk_speed_aura", atk_speed_mult: 1.15 };
  const BUFFED = 1 / 1.15;
  // 生命值與防禦是選取時的快照；有戰況觀測（新版遊戲）時生命值改為即時，說明寫明防禦與攻擊間隔仍是選取時的數值
  const SNAP_TEXTS = ["生命值與防禦是選取時的數值，重新點選武將可更新", "生命值與技能狀態是目前的戰況（遊戲每 0.25 秒更新）；防禦與攻擊間隔是選取時的數值，重新點選武將可更新"];

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[0, ROW], [13, ROW]] }, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const heroCfg = (hero_id, name, image, extra) => ({
    hero_id, name, rarity: "orange", cost: 8, job: "archer",
    base_atk: 150, base_def: 100, base_hp: 1500, attack_range: 3, attack_speed: 1, upgrade_cost_base: 100,
    atk_growth: 10, def_growth: 8, hp_growth: 100, range_growth: 0, atk_spd_growth: 0, image, ...extra,
  });
  const EXTRA = {
    heroes: [
      heroCfg("cao_cao", "曹操", "hero_cao_cao.webp", { job: "infantry", attack_range: 1.5, attack_speed: 1.2 }),
      heroCfg("mock_spd_ally", "弓手", "hero_liao_hua.webp", {}),
      heroCfg("mock_spd_far", "遠弓", "hero_huang_zhong.webp", { attack_range: 6 }),
    ],
    enemies: [{ enemy_id: "mock_cmd_post", name: "木樁", hp: 99999999, speed: 0, atk: 1, image: "enemy_grunt1.webp" }],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [{ wave: 1, enemies: [{ enemy_id: "mock_cmd_post", count: 1, interval: 1.0, path: "path_a" }] }],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_cmd_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps" || body.action === "get_enemies_config" || body.action === "get_heroes_config") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (j && j.status === 200) {
            if (body.action === "get_all_maps" && Array.isArray(j.maps)) j.maps = [...j.maps, ...extra.maps];
            if (body.action === "get_enemies_config" && Array.isArray(j.enemies)) j.enemies = [...j.enemies, ...extra.enemies];
            if (body.action === "get_heroes_config" && Array.isArray(j.heroes)) j.heroes = [...j.heroes, ...extra.heroes];
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
    if (window.__cmdRecv) return;
    window.__cmdRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__cmdRecv.push(e.data);
    });
  });

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const near = (a, b, eps = 1e-6) => typeof a === "number" && Math.abs(a - b) <= eps;
  const r4 = (x) => Math.round(x * 1e4) / 1e4;
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const sessionRaw = () => page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const snapshot = async (sel) => {
    const id = "cmd-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const received = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__cmdRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const find = (id) => (last ? last.team_list.find((t) => t.hero_id === id) : null);
      const skillOf = (id) => { const h = find(id); return h ? ("skill" in h ? h.skill : "none") : undefined; };
      return { payloads: got.length, stage: last ? last.stage_id : null, cao: skillOf("cao_cao"), ally: skillOf("mock_spd_ally"), far: skillOf("mock_spd_far") };
    }, sel);
  const fromGame = (sel, msg) =>
    page.evaluate(({ sel, msg }) => document.querySelector(sel).contentWindow.eval(`window.parent.postMessage(${JSON.stringify(msg)}, '*')`), { sel, msg });
  const dismissSplash = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
  const clickCell = async (sel, c, row, cols = 14, rows = 11) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    }, sel);
    const s = Math.min(r.width / 540, r.height / 720);
    const vx = r.width / s, vy = r.height / s;
    const tile = Math.max(16, Math.floor(Math.min(vx / cols, vy / rows)));
    const ox = (vx - cols * tile) / 2, oy = (vy - rows * tile) / 2;
    await page.mouse.click(r.left + (ox + (c + 0.5) * tile) * s, r.top + (oy + (row + 0.5) * tile) * s);
  };
  // 用滑鼠點建築格、在部署選單的「武將」分頁選武將（真的部署 UI）；回傳 Web 收到的 click_cell
  const deploy = async (sel, cell, heroName) => {
    const idx = await H.bridgeLen(page);
    await clickCell(sel, cell[0], cell[1]);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    const click = await page.evaluate((i) => (window.__bridgeLog || []).slice(i).filter((m) => m.type === "click_cell").pop() || null, idx);
    const tab = page.locator('[data-testid="placement-menu"] button[class*="tabBtn"]', { hasText: "武將" });
    if ((await tab.count()) > 0) await tab.click();
    await page.locator('button[class*="menuCard"]', { hasText: heroName }).click();
    await H.sleep(600);
    return click;
  };
  const spd = (s, id) => ((s || {}).hero_atk_speed || {})[id] || null;
  // 一位武將在兩次快照之間的攻擊：加成、目前的間隔、紀錄裡每次冷卻用的間隔（第一下之後）、預定時間差不符合的位置、
  // 這段時間（這位武將自己的遊戲時間）的攻擊次數與長度
  const summary = (a, b, id) => {
    const x = spd(b, id), y = spd(a, id);
    if (!x || !y) return null;
    const log = x.log || [];
    const gapsBad = [];
    for (let i = 1; i < log.length; i++) {
      const gap = log[i].t - log[i].late - (log[i - 1].t - log[i - 1].late);
      if (Math.abs(gap - log[i - 1].interval) > 1e-6) gapsBad.push({ i, gap, want: log[i - 1].interval });
    }
    return {
      bonus: r4(x.bonus), interval: x.interval, effective: r4(x.effective), sources: Object.keys(x.sources || {}).length,
      intervals: [...new Set(log.slice(1).map((e) => r4(e.interval)))], gapsBad: gapsBad.slice(0, 3),
      attacks: x.attacks - y.attacks, span: Math.round((x.age - y.age) * 1000) / 1000,
      aura: x.aura_active, auraMult: x.aura_mult, radius: x.radius, buffed: x.buffed,
    };
  };
  // 只讀觀察：等到弓手至少攻擊 2 次，之後遊戲時間前進 sec 秒
  const observe = async (sel, sec = 6) => {
    const end = Date.now() + 90000;
    let a = null;
    for (;;) {
      a = await snapshot(sel);
      const al = spd(a, "mock_spd_ally");
      if ((al && al.attacks >= 2) || Date.now() > end) break;
      await H.sleep(250);
    }
    let b = a;
    const until = Date.now() + 60000;
    while (b.game_time - a.game_time < sec && Date.now() < until) {
      await H.sleep(400);
      b = await snapshot(sel);
    }
    return { ally: summary(a, b, "mock_spd_ally"), far: summary(a, b, "mock_spd_far"), cao: summary(a, b, "cao_cao") };
  };
  const allyOk = (o) => !!o && o.bonus === 1.15 && o.sources === 1 && near(o.effective, r4(BUFFED)) && o.interval === 1 && same(o.intervals, [r4(BUFFED)]) &&
    o.gapsBad.length === 0 && o.span >= 5 && Math.abs(o.attacks - o.span / BUFFED) <= 1;
  const farOk = (o) => !!o && o.bonus === 1 && o.sources === 0 && same(o.intervals, [1]) && o.gapsBad.length === 0 && Math.abs(o.attacks - o.span) <= 1;
  const caoOk = (o) => !!o && o.bonus === 1 && o.aura === true && o.auraMult === 1.15 && o.radius === 1.5 && same(o.buffed, ["mock_spd_ally"]);
  // 讀目前的單位面板（不點選）：攻擊間隔欄、指揮的說明、選取時數值的說明
  const readPanel = () =>
    page.evaluate(() => {
      const v = document.querySelector('[data-testid="upgrade-panel-interval"]');
      const note = document.querySelector('[data-testid="unit-panel-atk-speed-note"]');
      const snap = document.querySelector('[data-testid="unit-panel-snapshot-note"]');
      const panel = document.querySelector('[data-testid="unit-panel"]');
      const r = panel ? panel.getBoundingClientRect() : null;
      const nr = note ? note.getBoundingClientRect() : null;
      return {
        open: !!panel,
        name: panel ? (panel.querySelector('[class*="unitName"]') || {}).innerText : null,
        text: v ? v.innerText.trim() : null, spd: v ? Number(v.getAttribute("data-atk-spd")) : null, eff: v ? Number(v.getAttribute("data-atk-spd-effective")) : null,
        note: note ? note.innerText.trim() : null,
        noteVisible: !!nr && nr.width > 0 && nr.height > 0 && parseFloat(getComputedStyle(note).fontSize) >= 11,
        snap: snap ? snap.innerText.trim() : null,
        inView: r ? r.left >= 0 && r.right <= window.innerWidth + 0.5 && r.top >= 0 && r.bottom <= window.innerHeight + 0.5 : false,
        noOverflow: panel ? panel.scrollWidth <= panel.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth : false,
      };
    });
  const panelAt = async (sel, cell) => {
    await clickCell(sel, cell[0], cell[1]);
    await page.waitForSelector('[data-testid="upgrade-panel-interval"]', { timeout: 15000 });
    await H.sleep(300);
    return readPanel();
  };
  const closePanel = async () => {
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await H.sleep(300);
  };
  // 按畫面上的「暫停」／「繼續」，等 Godot 確認（快照的 world_frozen）
  const setPaused = async (sel, want) => {
    await page.getByRole("button", { name: want ? "暫停" : "繼續", exact: true }).first().click();
    const end = Date.now() + 15000;
    for (;;) {
      const s = await snapshot(sel);
      if (s.world_frozen === want || Date.now() > end) return s.world_frozen === want;
      await H.sleep(150);
    }
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `atkspeed-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
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
    /技能：指揮/.test(t) && t.includes("射程內（目前 1.5 格）的其他友軍武將攻擊速度 +15%（攻擊間隔變成 1 ÷ 1.15，不含自己）；多個攻速光環取最強、不疊加。");

  // ── 準備 ──
  let profile0 = null;
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k }) => {
      localStorage.setItem("__shenma_cmd_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "指揮", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter3_8", heroes: [],
          team: [{ hero_id: "cao_cao", slot: 1 }, { hero_id: "mock_spd_ally", slot: 2 }, { hero_id: "mock_spd_far", slot: 3 }] } },
        battle_logs: [],
      }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY });
    profile0 = (await db()).profiles[KEY];
    await page.setViewportSize({ width: 540, height: 900 });
  });

  // ── A. 技能說明（一般寬度與窄畫面）──
  await section("A", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('[class*="heroName"]');
    const card = await page.locator('[data-hero-id][class*="heroCard"]', { has: page.locator('[class*="heroName"]', { hasText: "曹操" }) }).first().innerText();
    const allyCard = await page.locator('[data-hero-id][class*="heroCard"]', { has: page.locator('[class*="heroName"]', { hasText: "弓手" }) }).first().innerText();
    await page.locator('[class*="heroName"]', { hasText: "曹操" }).first().click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, allyCard, detail, shot: await H.shot(page, "atkspeed-a-skill-detail") };
    run.check("A-1 主頁武將視窗：曹操的卡片是「技能：指揮」（弓手沒有技能）；詳情是短版說明：射程內（目前 1.5 格）其他友軍攻速 +15%（間隔 1 ÷ 1.15）、不含自己、取最強不疊加",
      /技能：指揮/.test(card) && !/技能：/.test(allyCard) && RULES(detail), out.A_modal);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('[data-testid="hero-skill-tag"]', { hasText: "指揮" }).first().click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：曹操有「指揮」標籤（只有一個），點開後顯示同樣的規則",
      tags.filter((t) => t === "技能：指揮").length === 1 && detail2 === detail, out.A_page);

    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(600);
    const measure = () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="hero-skill-detail"]');
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const text = el.querySelector('div[class*="heroSkillText"]') || el;
        return {
          left: Math.round(b.left), right: Math.round(b.right), vw: window.innerWidth,
          scrollW: el.scrollWidth, clientW: el.clientWidth, font: parseFloat(getComputedStyle(text).fontSize),
          docScroll: document.documentElement.scrollWidth,
        };
      });
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const narrowPage = await measure();
    const narrowPageShot = await H.shot(page, "atkspeed-a-narrow-heroes-page");
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[class*="heroName"]');
    await page.locator('[class*="heroName"]', { hasText: "曹操" }).first().click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "atkspeed-a-narrow-modal");
    out.A_narrow = { narrowPage, narrowModal, narrowPageShot, narrowModalShot };
    const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12 && m.docScroll <= m.vw;
    run.check("A-3 窄畫面（390×844）：武將頁與主頁武將視窗的指揮說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(narrowModal), out.A_narrow);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署選單放置三位武將，只用快照觀察攻擊間隔；暫停後點選面板 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    const clicks = [await deploy(IFRAME, CELLS.ally, "弓手"), await deploy(IFRAME, CELLS.far, "遠弓"), await deploy(IFRAME, CELLS.cao, "曹操")];
    const recv = await received(IFRAME);
    const placed = await snapshot(IFRAME);
    const ps = { cao: spd(placed, "cao_cao"), ally: spd(placed, "mock_spd_ally"), far: spd(placed, "mock_spd_far") };
    out.B_payload = { clicks, recv, prep: { cao: ps.cao && { aura: ps.cao.aura_active, mult: ps.cao.aura_mult, radius: ps.cao.radius }, ally: ps.ally && ps.ally.bonus, far: ps.far && ps.far.bonus } };
    run.check("B-1 規則 payload：用滑鼠點三個建築格、在部署選單選武將；遊戲 iframe 收到的出征資料裡，曹操的 skill 正好是 {id: atk_speed_aura, atk_speed_mult: 1.15}、弓手與遠弓沒有 skill；Godot 讀到倍率 1.15、半徑 1.5，備戰時光環不作用、沒有加成",
      clicks.every((c, i) => !!c && c.cell_x === [CELLS.ally, CELLS.far, CELLS.cao][i][0] && c.cell_y === [CELLS.ally, CELLS.far, CELLS.cao][i][1]) &&
        recv.stage === MAP.id && same(recv.cao, SKILL) && recv.ally === "none" && recv.far === "none" &&
        !!ps.cao && ps.cao.aura_mult === 1.15 && ps.cao.radius === 1.5 && ps.cao.aura_active === false && !!ps.ally && ps.ally.bonus === 1 && !!ps.far && ps.far.bonus === 1,
      out.B_payload);
    await H.clickButton(page, "迎戰");
    const ob = await observe(IFRAME);
    const shot = await H.shot(page, "atkspeed-b-main-field");
    out.B_attack = { ...ob, shot };
    run.check("B-2 主頁實際戰鬥（快照只讀）：弓手（距離曹操 1 格）加成 1.15、每次冷卻 1 ÷ 1.15、預定時間差都是前一次的間隔，6 秒以上的遊戲時間裡次數＝時間 × 1.15（差不到 1 下）；遠弓（範圍外）1、每次冷卻 1 秒；曹操自己 1、光環作用中、只加成弓手",
      allyOk(ob.ally) && farOk(ob.far) && caoOk(ob.cao), out.B_attack);

    const paused = await setPaused(IFRAME, true);
    const pAlly = await panelAt(IFRAME, CELLS.ally);
    const panelShot = await H.shot(page, "atkspeed-b-panel");
    await closePanel();
    const pFar = await panelAt(IFRAME, CELLS.far);
    await closePanel();
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(800);
    const p390 = await panelAt(IFRAME, CELLS.ally);
    const panelShot390 = await H.shot(page, "atkspeed-b-panel-390");
    await closePanel();
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(500);
    await setPaused(IFRAME, false);
    out.B_panel = { paused, pAlly, pFar, p390, panelShot, panelShot390 };
    run.check("B-3 暫停後在戰場點弓手：攻擊間隔是「1 → 0.87秒」（原本與加成後分開列出），有「指揮」的說明（選取時、只在範圍內、不改存檔）與選取時數值的說明；點遠弓是「1秒」、沒有指揮的說明；390×844 面板與說明在畫面內、沒有橫向溢出",
      paused && /弓手/.test(pAlly.name || "") && pAlly.text === "1 → 0.87秒" && pAlly.spd === 1 && near(pAlly.eff, 1.15, 1e-9) && /指揮/.test(pAlly.note || "") &&
        /0\.87秒/.test(pAlly.note || "") && /原本 1秒/.test(pAlly.note || "") && /不改存檔/.test(pAlly.note || "") && pAlly.noteVisible && SNAP_TEXTS.includes(pAlly.snap) &&
        /遠弓/.test(pFar.name || "") && pFar.text === "1秒" && pFar.note === null && p390.text === "1 → 0.87秒" && p390.inView && p390.noOverflow && p390.noteVisible,
      out.B_panel);

    // 舊版遊戲：武將面板沒有送有效攻速（atk_spd_effective），照原本的面板顯示
    await fromGame(IFRAME, { __godot_bridge: true, type: "show_upgrade_panel", unit_type: "hero", hero_id: "mock_spd_ally", name: "弓手", level: 1, atk: 150, atk_spd: 1, range: 3, hp: 1500, def: 100, def_effective: 100, anti_air: true, screen_pos: { x: 200, y: 300 } });
    await page.waitForSelector('[data-testid="unit-panel"]', { timeout: 15000 });
    await H.sleep(300);
    const pOld = await readPanel();
    await closePanel();
    out.B_old = pOld;
    run.check("B-4 舊版遊戲沒有送有效攻速的武將面板：攻擊間隔照原本顯示「1秒」，沒有箭頭與指揮的說明",
      pOld.open && /弓手/.test(pOld.name || "") && pOld.text === "1秒" && pOld.note === null, out.B_old);
  });

  // ── C. 獨立戰鬥頁（真的部署 UI）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const clicks = [await deploy(BIFRAME, CELLS.ally, "弓手"), await deploy(BIFRAME, CELLS.far, "遠弓"), await deploy(BIFRAME, CELLS.cao, "曹操")];
    const recv = await received(BIFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const ob = await observe(BIFRAME);
    out.C = { clicks, recv, ...ob, shot: await H.shot(page, "atkspeed-c-battle-field") };
    run.check("C-1 獨立戰鬥頁：用滑鼠點建築格、在部署選單選武將（真的部署 UI）；iframe 收到的曹操 skill 和主頁相同、友軍沒有 skill；弓手 1.15、每次冷卻 1 ÷ 1.15、次數＝時間 × 1.15；遠弓 1、每次 1 秒；曹操自己 1、只加成弓手",
      clicks.every((c) => !!c) && recv.stage === MAP.id && same(recv.cao, SKILL) && recv.ally === "none" && recv.far === "none" && allyOk(ob.ally) && farOk(ob.far) && caoOk(ob.cao),
      out.C);
  });

  // ── D. 存檔與 session 不帶技能欄位、資源不變 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const d = await db();
    const p = d.profiles[KEY];
    const sess = await sessionRaw();
    const bad = /skill|atk_speed|speed_mult|atk_spd_effective|aura|effective|def_mult|slow_mult|sweep|burn|long_range|range_multiplier|first_attack|lifesteal|stun/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null, logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或攻速欄位；隊伍仍只有 hero_id／slot，武將資料與金幣／經驗／等級／進度不變、沒有戰鬥紀錄",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_cmd_fixture")).catch(() => {});
  return run.finish({ out });
}
