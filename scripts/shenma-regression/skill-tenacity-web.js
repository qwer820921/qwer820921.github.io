async (page) => {
  // 廖化「堅韌」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「堅韌：低血量減傷」沒有寫門檻與減傷多少。
  // 遊戲的第一版設計：受傷前生命不高於最大生命的 30%（含剛好 30%）時，防禦計算後的傷害再降低 20%（乘 0.8），只在戰場
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_tn_fixture）：廖化（liao_hua，步兵、攻擊力 85、防禦 64、生命 519、射程 1 格、攻擊間隔 1 秒，
  //   和正式設定相同），關卡「Mock TN 堅韌」：直線路線（第 5 列），一個攻擊力 100、血量很多、每秒 60 像素的地面兵
  // - 攻擊力 100 打防禦 64 的廖化：每擊防禦計算後是 100 × 100 ÷ 164 ≈ 60.98；生命 519 → 214.12 前都不減傷（41%），
  //   扣到 153.15（29.5%）的那一擊不減傷，之後每擊 ≈ 48.78，第 10 擊倒下
  // - A：技能說明（主頁的武將視窗、獨立的武將頁）：技能名稱「堅韌」、受傷前生命不高於 30%、防禦計算後降低 20%、不是提高防禦、只在戰場；
  //      390×844 說明在畫面寬度內、字級至少 12px
  // - B：主頁用部署選單把廖化放在道路 (4,5)（擋住敵人、會被打）：遊戲 iframe 收到的廖化 skill 正好是 {id: tenacity, low_hp_ratio: 0.3, damage_mult: 0.8}。
  //      開戰後只用快照觀察（不直接扣血）：每一擊的受傷前生命、防禦計算後的傷害與實扣都照規則（受傷前不高於 30% 才乘 0.8），前後相接；
  //      跨過門檻的那一擊不減傷、下一擊才減傷；用「暫停」停住戰場、點廖化：門檻前面板是「未生效」、門檻後是「生效中」，生命值＝快照；
  //      390×844 面板在畫面內；最後廖化被打倒（不保底、不復活），敵人不再被擋住
  // - C：獨立戰鬥頁：同樣用滑鼠點道路格、在部署選單選廖化（真的部署 UI），迎戰後規則相同
  // - D：存檔、session 都沒有技能或堅韌欄位，隊伍只有 hero_id／slot，武將的生命等屬性與資源都不變、沒有戰鬥紀錄
  // 全部 mock、虛構金鑰 test_ws_*（不含被比對的字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_ws_l";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_8", name: "Mock TN 堅韌" };
  const LH_CELL = [4, 5];
  const SKILL = { id: "tenacity", low_hp_ratio: 0.3, damage_mult: 0.8 };
  const MAX_HP = 519; // 廖化 1 級的生命（mock 的 base_hp，和正式設定相同）
  const RAW = (100 * 100) / (64 + 100); // 攻擊力 100 打防禦 64

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[0, ROW], [13, ROW]] }, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [{
      hero_id: "liao_hua", name: "廖化", rarity: "blue", cost: 4, job: "infantry",
      base_atk: 85, base_def: 64, base_hp: MAX_HP, attack_range: 1, attack_speed: 1, upgrade_cost_base: 50,
      atk_growth: 8.5, def_growth: 6.4, hp_growth: 51.9, range_growth: 0, atk_spd_growth: 0, image: "hero_liao_hua.webp",
    }],
    enemies: [{ enemy_id: "mock_tn_brute", name: "蠻兵", hp: 999999, speed: 60, atk: 100, image: "enemy_grunt1.webp" }],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [{ wave: 1, enemies: [{ enemy_id: "mock_tn_brute", count: 1, interval: 1.0, path: "path_a" }] }],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_tn_fixture") === "1") {
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
    if (window.__wsRecv) return;
    window.__wsRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__wsRecv.push(e.data);
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
    const id = "ws-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const received = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__wsRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const lh = last ? last.team_list.find((t) => t.hero_id === "liao_hua") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, lh: lh ? lh.skill ?? null : undefined };
    }, sel);
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
  // 用滑鼠點道路格、在部署選單選武將（道路格只能放武將，沒有分頁）
  const deploy = async (sel, c, row, heroName) => {
    const idx = await H.bridgeLen(page);
    await clickCell(sel, c, row);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    const click = await page.evaluate((i) => (window.__bridgeLog || []).slice(i).filter((m) => m.type === "click_cell").pop() || null, idx);
    const tab = page.locator('[data-testid="placement-menu"] button[class*="tabBtn"]', { hasText: "武將" });
    if ((await tab.count()) > 0) await tab.click();
    await page.locator('button[class*="menuCard"]', { hasText: heroName }).click();
    await H.sleep(600);
    return click;
  };
  const lh = (s) => ((s || {}).hero_tenacity || {}).liao_hua || null;
  const attacksOf = (s) => Object.values(s.enemy_blocker_attacks || {}).reduce((x, y) => x + y, 0);
  // 每一擊的紀錄照規則：防禦計算後 ≈ 60.98；受傷前生命 ÷ 最大生命不高於 0.3 時實扣 × 0.8 並標示減傷，否則照原本的傷害；前後相接（下一擊的受傷前＝這一擊之後）
  const logIssues = (log) => {
    const bad = [];
    log.forEach((x, i) => {
      const low = x.before / x.max_hp <= 0.3;
      if (!(near(x.raw, RAW) && x.max_hp === MAX_HP && x.reduced === low && near(x.taken, low ? RAW * 0.8 : RAW))) bad.push({ i, x });
      if (i > 0 && !near(x.before, log[i - 1].before - log[i - 1].taken)) bad.push({ i, chain: [log[i - 1].before, log[i - 1].taken, x.before] });
    });
    return bad.slice(0, 4);
  };
  // 跨門檻：最後一筆沒有減傷的受傷前生命在門檻以上、扣完後在門檻以內，下一筆才減傷
  const crossOk = (log) => {
    const k = log.findIndex((x) => x.reduced);
    if (k < 1) return false;
    const p = log[k - 1];
    return !p.reduced && p.before / MAX_HP > 0.3 && (p.before - p.taken) / MAX_HP <= 0.3 && near(log[k].before, p.before - p.taken);
  };
  const readPanel = () =>
    page.evaluate(() => {
      const v = document.querySelector('[data-testid="unit-panel-hp"]');
      const note = document.querySelector('[data-testid="unit-panel-tenacity"]');
      const snap = document.querySelector('[data-testid="unit-panel-snapshot-note"]');
      const panel = document.querySelector('[data-testid="unit-panel"]');
      const r = panel ? panel.getBoundingClientRect() : null;
      const nr = note ? note.getBoundingClientRect() : null;
      return {
        name: panel ? (panel.querySelector('[class*="unitName"]') || {}).innerText : null,
        text: v ? v.innerText.trim() : null, hp: v ? Number(v.getAttribute("data-hp")) : null, snap: snap ? snap.innerText.trim() : null,
        note: note ? note.innerText.trim() : null, active: note ? note.getAttribute("data-active") : null,
        noteFont: note ? parseFloat(getComputedStyle(note).fontSize) : null,
        noteInView: nr ? nr.left >= 0 && nr.right <= window.innerWidth + 0.5 : false,
        inView: r ? r.left >= 0 && r.right <= window.innerWidth + 0.5 && r.top >= 0 && r.bottom <= window.innerHeight + 0.5 : false,
        noOverflow: panel ? panel.scrollWidth <= panel.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth : false,
      };
    });
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
  // 暫停中點廖化：面板的生命值與堅韌狀態和同一時間的快照比對
  const panelVsSnapshot = async (sel) => {
    await clickCell(sel, LH_CELL[0], LH_CELL[1]);
    await page.waitForSelector('[data-testid="unit-panel-hp"]', { timeout: 15000 });
    await H.sleep(300);
    const p = await readPanel();
    const s = await snapshot(sel);
    const w = lh(s);
    return { panel: p, hp: (s.hero_hp || {}).liao_hua, active: w ? w.active : null, count: w ? w.count : null, attacks: attacksOf(s), frozen: s.world_frozen };
  };
  // 只讀觀察：等到 until(紀錄) 成立或逾時，回傳最後一次看得到廖化的快照紀錄
  const watch = async (sel, until, ms = 60000) => {
    const end = Date.now() + ms;
    let last = null;
    for (;;) {
      const s = await snapshot(sel);
      const w = lh(s);
      if (w) last = { ...w, attacks: attacksOf(s), heroHp: (s.hero_hp || {}).liao_hua };
      if ((last && until(last, s)) || Date.now() > end) return { last, s };
      await H.sleep(200);
    }
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `tenacity-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };
  const RULES = (t) =>
    /技能：堅韌/.test(t) && /受傷前生命不高於最大生命的 30%（含剛好 30%）/.test(t) && /先照防禦計算，再降低 20%/.test(t) && /不是提高防禦/.test(t) &&
    /生命 301 時扣 50 變成 251（這一擊不減傷），下一擊只扣 40/.test(t) && /不會留下 1 點生命，也不會復活/.test(t) && /只在戰場生效/.test(t) && /存檔都不變/.test(t);

  // ── 準備 ──
  let profile0 = null;
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k }) => {
      localStorage.setItem("__shenma_tn_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "堅韌", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter3_8", heroes: [], team: [{ hero_id: "liao_hua", slot: 1 }] } },
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
    await page.waitForSelector('div[class*="heroName"]');
    const card = await page.locator('div[class*="heroCard"]', { has: page.locator('div[class*="heroName"]', { hasText: "廖化" }) }).first().innerText();
    await page.locator('div[class*="heroName"]', { hasText: "廖化" }).first().click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "tenacity-a-skill-detail") };
    run.check("A-1 主頁武將視窗：廖化的卡片是「技能：堅韌」；詳情寫明受傷前生命不高於 30%（含剛好）、防禦計算後降低 20%、不是提高防禦、301 扣 50 到 251 下一擊才扣 40、不保底不復活、只在戰場不影響存檔",
      /技能：堅韌/.test(card) && RULES(detail), out.A_modal);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('[data-testid="hero-skill-tag"]', { hasText: "堅韌" }).first().click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：廖化有「堅韌」標籤（只有一個），點開後顯示同樣的規則",
      tags.filter((t) => t === "技能：堅韌").length === 1 && detail2 === detail, out.A_page);

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
    const narrowPageShot = await H.shot(page, "tenacity-a-narrow-heroes-page");
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('div[class*="heroName"]');
    await page.locator('div[class*="heroName"]', { hasText: "廖化" }).first().click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "tenacity-a-narrow-modal");
    out.A_narrow = { narrowPage, narrowModal, narrowPageShot, narrowModalShot };
    const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12 && m.docScroll <= m.vw;
    run.check("A-3 窄畫面（390×844）：武將頁與主頁武將視窗的堅韌說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(narrowModal), out.A_narrow);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署選單放置廖化，只用快照觀察；門檻前後各暫停一次、點選面板核對狀態；最後被打倒 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    const click = await deploy(IFRAME, LH_CELL[0], LH_CELL[1], "廖化");
    const recv = await received(IFRAME);
    const placed = await snapshot(IFRAME);
    out.B_payload = { click, recv, tenacity: lh(placed), hp: (placed.hero_hp || {}).liao_hua };
    const p0 = lh(placed);
    run.check("B-1 規則 payload：用滑鼠點道路 (4,5)、在部署選單選廖化；遊戲 iframe 收到的出征資料裡，廖化的 skill 正好是 {id: tenacity, low_hp_ratio: 0.3, damage_mult: 0.8}；Godot 讀到 0.3／0.8、備戰時未生效、沒有受傷紀錄、生命是滿的 519",
      !!click && click.cell_x === LH_CELL[0] && click.cell_y === LH_CELL[1] && recv.stage === MAP.id && same(recv.lh, SKILL) &&
        !!p0 && p0.low_hp_ratio === 0.3 && p0.damage_mult === 0.8 && p0.active === false && p0.count === 0 && p0.log.length === 0 &&
        p0.max_hp === MAX_HP && (placed.hero_hp || {}).liao_hua === MAX_HP,
      out.B_payload);
    await H.clickButton(page, "迎戰");

    // 門檻前：被打 2 次以上後暫停、點選：面板是「未生效」
    await watch(IFRAME, (w) => w.log.length >= 2 && !w.active);
    const paused1 = await setPaused(IFRAME, true);
    const p1 = await panelVsSnapshot(IFRAME);
    await closePanel();
    await setPaused(IFRAME, false);
    // 門檻後：一看到生效就暫停、點選（390×844）：面板是「生效中」
    const w2 = await watch(IFRAME, (w) => w.active === true);
    const paused2 = await setPaused(IFRAME, true);
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(800);
    const p2 = await panelVsSnapshot(IFRAME);
    const panelShot390 = await H.shot(page, "tenacity-b-panel-390");
    await closePanel();
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(500);
    await setPaused(IFRAME, false);
    out.B_panel = { paused1, p1, paused2, p2, seen: w2.last && { active: w2.last.active, hp: w2.last.hp, count: w2.last.count }, panelShot390 };
    run.check("B-2 暫停後點廖化：門檻前（生命高於 30%）面板的堅韌是「未生效」、門檻後（受傷後不高於 30%）是「生效中」，兩次的生命值都＝同一時間的快照、看得到選取時數值的說明；390×844 面板與說明在畫面內、沒有橫向溢出、字級至少 12px",
      paused1 && paused2 && p1.frozen && p2.frozen && /廖化/.test(p1.panel.name || "") &&
        p1.panel.hp === p1.hp && p1.hp / MAX_HP > 0.3 && p1.active === false && p1.panel.active === "false" && /選取時未生效/.test(p1.panel.note || "") &&
        /選取時的數值/.test(p1.panel.snap || "") &&
        p2.panel.hp === p2.hp && p2.hp / MAX_HP <= 0.3 && p2.active === true && p2.panel.active === "true" &&
        /堅韌生效中：選取時生命不高於 30%，受到的傷害（防禦計算後）降低 20%/.test(p2.panel.note || "") &&
        p2.panel.inView && p2.panel.noOverflow && p2.panel.noteInView && p2.panel.noteFont >= 12 && /選取時的數值/.test(p2.panel.snap || ""),
      out.B_panel);

    // 被打倒之前的最後紀錄，與倒下後的戰場
    const w3 = await watch(IFRAME, (w) => w.count >= 3 && w.hp - RAW * 0.8 <= 0, 60000);
    const last = w3.last || { log: [] };
    const gone = await watch(IFRAME, (_w, s) => !("liao_hua" in (s.hero_hp || {})), 30000);
    const after = await snapshot(IFRAME);
    out.B_flow = {
      entries: last.log.length, count: last.count, attacks: last.attacks, hp: last.hp, heroHp: last.heroHp, saved: last.saved,
      issues: logIssues(last.log), cross: crossOk(last.log), log: last.log.map((x) => [Number(x.before.toFixed(3)), Number(x.taken.toFixed(3)), x.reduced]),
      gone: !("liao_hua" in (after.hero_hp || {})), noTenacity: !("liao_hua" in (after.hero_tenacity || {})), state: after.game_state,
      shot: await H.shot(page, "tenacity-b-main-field"),
    };
    void gone;
    const reduced = last.log.filter((x) => x.reduced).length;
    run.check(`B-3 主頁實際戰鬥（快照只讀）：每一擊防禦計算後約 ${RAW.toFixed(2)}，受傷前生命不高於 30% 才乘 0.8（約 ${(RAW * 0.8).toFixed(2)}）、前後相接；跨過門檻的那一擊不減傷、下一擊才減傷；減傷次數＝減傷的紀錄、紀錄筆數＝敵人的攻擊次數、生命＝快照；最後廖化被打倒（不在場上、沒有保底），戰鬥照常進行`,
      out.B_flow.issues.length === 0 && out.B_flow.cross && reduced >= 3 && last.count === reduced && last.log.length === last.attacks &&
        near(last.hp, last.heroHp) && near(last.saved, RAW * 0.2 * reduced) && out.B_flow.gone && out.B_flow.noTenacity,
      out.B_flow);
  });

  // ── C. 獨立戰鬥頁（真的部署 UI）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const click = await deploy(BIFRAME, LH_CELL[0], LH_CELL[1], "廖化");
    const recv = await received(BIFRAME);
    const placed = await snapshot(BIFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const w = await watch(BIFRAME, (x) => x.count >= 2, 60000);
    const last = w.last || { log: [] };
    out.C = {
      click, recv, placed: lh(placed), entries: last.log.length, count: last.count, attacks: last.attacks, hp: last.hp, heroHp: last.heroHp,
      issues: logIssues(last.log), cross: crossOk(last.log), shot: await H.shot(page, "tenacity-c-battle-field"),
    };
    run.check("C-1 獨立戰鬥頁：用滑鼠點道路 (4,5)、在部署選單選廖化（真的部署 UI）；iframe 收到的廖化 skill 和主頁相同；迎戰後每一擊照規則（不高於 30% 才乘 0.8、前後相接），跨過門檻的那一擊不減傷，至少減傷 2 次，紀錄筆數＝攻擊次數、生命＝快照",
      !!click && click.cell_x === LH_CELL[0] && click.cell_y === LH_CELL[1] && recv.stage === MAP.id && same(recv.lh, SKILL) && !!out.C.placed && out.C.placed.count === 0 &&
        out.C.issues.length === 0 && out.C.cross && last.count >= 2 && last.log.length === last.attacks && near(last.hp, last.heroHp),
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
    const bad = /skill|tenacity|low_hp|damage_mult|counter|lifesteal|stun|def_aura|def_mult|slow_aura|slow_mult|sweep|burn|long_range|range_multiplier|first_attack/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null, logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或堅韌欄位；隊伍仍只有 hero_id／slot，武將資料（沒有升級紀錄、沒有生命欄位）與金幣／經驗／等級／進度不變、沒有戰鬥紀錄",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_tn_fixture")).catch(() => {});
  return run.finish({ out });
}
