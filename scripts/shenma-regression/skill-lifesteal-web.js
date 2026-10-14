async (page) => {
  // 魏延「吸血」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「吸血：恢復生命」沒有寫比例與觸發方式。
  // 遊戲的第一版設計：每次普通攻擊命中後，恢復這一擊實際扣掉敵人生命的 15%（不含溢出的傷害，打倒敵人的那一擊也算），不超過最大生命、不復活，只在戰場
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_ls_fixture）：魏延（步兵、攻擊力 150、防禦 100、生命 5000、射程 1.5 格、攻擊間隔 1.2 秒），
  //   關卡「Mock LS 吸血」：直線路線（第 5 列），一個攻擊力 100、血量很多、每秒 60 像素的地面兵
  // - A：技能說明（主頁的武將視窗、獨立的武將頁）：技能名稱「吸血」、短版說明（只寫效果、目前的數值與主要例外，和整句比對）；
  //      390×844 說明在畫面寬度內、字級至少 12px
  // - B：主頁用部署選單把魏延放在道路 (4,5)（擋住敵人、會被打）：遊戲 iframe 收到的魏延 skill 正好是 {id: lifesteal, lifesteal_ratio: 0.15}。
  //      開戰後只用快照觀察（不注入治療）：每次命中的實際傷害 150、恢復＝min(22.5, 最大生命 − 恢復前的生命)，至少 3 次完整的 22.5；
  //      恢復前後的生命相符、不超過最大生命；場上看得到綠色的「+22.5」；
  //      用「暫停」停住戰場，在戰場點魏延：面板的生命值＝快照的生命；繼續、等到再恢復兩次以上再暫停、重新點選：面板換成新的生命（不是第一次的數值）；
  //      390×844 面板在畫面內、看得到選取時數值的說明
  // - C：獨立戰鬥頁：同樣用滑鼠點道路格、在部署選單選魏延（真的部署 UI），迎戰後一樣恢復 22.5、規則相同
  // - D：存檔、session 都沒有技能或吸血欄位，隊伍只有 hero_id／slot，武將的生命等屬性與資源都不變、沒有戰鬥紀錄
  // 全部 mock、虛構金鑰 test_ws_*（不含 lifesteal 字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_ws_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_8", name: "Mock LS 吸血" };
  const WY_CELL = [4, 5];
  const SKILL = { id: "lifesteal", lifesteal_ratio: 0.15 };
  const ATK = 150; // 魏延 1 級的攻擊力（mock 的 base_atk）
  const HEAL = ATK * 0.15;

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[0, ROW], [13, ROW]] }, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [{
      hero_id: "wei_yan", name: "魏延", rarity: "orange", cost: 8, job: "infantry",
      base_atk: ATK, base_def: 100, base_hp: 5000, attack_range: 1.5, attack_speed: 1.2, upgrade_cost_base: 100,
      atk_growth: 10, def_growth: 8, hp_growth: 100, range_growth: 0, atk_spd_growth: 0, image: "hero_wei_yan.webp",
    }],
    enemies: [{ enemy_id: "mock_ws_brute", name: "蠻兵", hp: 999999, speed: 60, atk: 100, image: "enemy_grunt1.webp" }],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [{ wave: 1, enemies: [{ enemy_id: "mock_ws_brute", count: 1, interval: 1.0, path: "path_a" }] }],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_ls_fixture") === "1") {
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
      const wei = last ? last.team_list.find((t) => t.hero_id === "wei_yan") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, wei: wei ? wei.skill ?? null : undefined };
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
  const wei = (s) => ((s || {}).hero_lifesteal || {}).wei_yan || null;
  // 只讀觀察：等到魏延至少 minFull 次完整的恢復（22.5）與 minAttacks 次被敵人攻擊；回傳紀錄的檢查與看到的恢復提示
  const observe = async (sel, minFull = 3, minAttacks = 2) => {
    const end = Date.now() + 120000;
    let s = null;
    const texts = new Set();
    for (;;) {
      s = await snapshot(sel);
      for (const t of s.heal_texts || []) texts.add(t);
      const w = wei(s);
      const full = w ? w.log.filter((x) => near(x.heal, HEAL)).length : 0;
      const attacks = Object.values(s.enemy_blocker_attacks || {}).reduce((x, y) => x + y, 0);
      if ((full >= minFull && attacks >= minAttacks && texts.size > 0) || Date.now() > end) break;
      await H.sleep(250);
    }
    const w = wei(s) || { log: [], count: 0, total: 0, max_hp: 0, hp: 0, ratio: 0 };
    const bad = w.log.filter((x) => !(near(x.dealt, ATK) && near(x.heal, Math.min(x.dealt * 0.15, w.max_hp - x.before)) && near(x.after, x.before + x.heal) && x.after <= w.max_hp + 1e-9));
    return {
      ratio: w.ratio, count: w.count, total: w.total, hp: w.hp, maxHp: w.max_hp, entries: w.log.length, bad: bad.slice(0, 4),
      full: w.log.filter((x) => near(x.heal, HEAL)).length, healTotal: Math.round(w.log.reduce((a, x) => a + x.heal, 0) * 1e6) / 1e6,
      attacks: Object.values(s.enemy_blocker_attacks || {}).reduce((x, y) => x + y, 0), texts: [...texts], heroHp: (s.hero_hp || {}).wei_yan,
    };
  };
  const readPanel = () =>
    page.evaluate(() => {
      const v = document.querySelector('[data-testid="unit-panel-hp"]');
      const snap = document.querySelector('[data-testid="unit-panel-snapshot-note"]');
      const panel = document.querySelector('[data-testid="unit-panel"]');
      const r = panel ? panel.getBoundingClientRect() : null;
      return {
        name: panel ? (panel.querySelector('[class*="unitName"]') || {}).innerText : null,
        text: v ? v.innerText.trim() : null, hp: v ? Number(v.getAttribute("data-hp")) : null, snap: snap ? snap.innerText.trim() : null,
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
    await page.waitForFunction(() => true, null, { timeout: 100 });
    const end = Date.now() + 15000;
    for (;;) {
      const s = await snapshot(sel);
      if (s.world_frozen === want || Date.now() > end) return s.world_frozen === want;
      await H.sleep(150);
    }
  };
  // 暫停中點魏延：面板的生命值和同一時間的快照比對
  const panelVsSnapshot = async (sel) => {
    await clickCell(sel, WY_CELL[0], WY_CELL[1]);
    await page.waitForSelector('[data-testid="unit-panel-hp"]', { timeout: 15000 });
    await H.sleep(300);
    const p = await readPanel();
    const s = await snapshot(sel);
    const w = wei(s);
    const attacks = Object.values(s.enemy_blocker_attacks || {}).reduce((x, y) => x + y, 0);
    return { panel: p, hp: (s.hero_hp || {}).wei_yan, count: w ? w.count : null, total: w ? w.total : null, attacks, frozen: s.world_frozen };
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `lifesteal-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
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
    /技能：吸血/.test(t) && t.includes("普通攻擊命中後，恢復這一擊實際扣掉敵人生命的 15%（超過敵人剩餘生命的部分不算），不超過最大生命；只算自己普通攻擊的直接傷害。");

  // ── 準備 ──
  let profile0 = null;
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k }) => {
      localStorage.setItem("__shenma_ls_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "吸血", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter3_8", heroes: [], team: [{ hero_id: "wei_yan", slot: 1 }] } },
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
    const card = await page.locator('[data-hero-id][class*="heroCard"]', { has: page.locator('[class*="heroName"]', { hasText: "魏延" }) }).first().innerText();
    await page.locator('[class*="heroName"]', { hasText: "魏延" }).first().click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "lifesteal-a-skill-detail") };
    run.check("A-1 主頁武將視窗：魏延的卡片是「技能：吸血」；詳情是短版說明：恢復這一擊實際扣掉敵人生命的 15%、溢出不算、不超過最大生命、只算自己普通攻擊的直接傷害",
      /技能：吸血/.test(card) && RULES(detail), out.A_modal);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('[data-testid="hero-skill-tag"]', { hasText: "吸血" }).first().click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：魏延有「吸血」標籤（只有一個），點開後顯示同樣的規則",
      tags.filter((t) => t === "技能：吸血").length === 1 && detail2 === detail, out.A_page);

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
    const narrowPageShot = await H.shot(page, "lifesteal-a-narrow-heroes-page");
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[class*="heroName"]');
    await page.locator('[class*="heroName"]', { hasText: "魏延" }).first().click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "lifesteal-a-narrow-modal");
    out.A_narrow = { narrowPage, narrowModal, narrowPageShot, narrowModalShot };
    const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12 && m.docScroll <= m.vw;
    run.check("A-3 窄畫面（390×844）：武將頁與主頁武將視窗的吸血說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(narrowModal), out.A_narrow);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署選單放置魏延，只用快照觀察吸血；暫停後重新點選面板核對生命值 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    const click = await deploy(IFRAME, WY_CELL[0], WY_CELL[1], "魏延");
    const recv = await received(IFRAME);
    const placed = await snapshot(IFRAME);
    out.B_payload = { click, recv, lifesteal: wei(placed), hp: (placed.hero_hp || {}).wei_yan };
    run.check("B-1 規則 payload：用滑鼠點道路 (4,5)、在部署選單選魏延；遊戲 iframe 收到的出征資料裡，魏延的 skill 正好是 {id: lifesteal, lifesteal_ratio: 0.15}；Godot 讀到 0.15、備戰時還沒有恢復過、生命是滿的 5000",
      !!click && click.cell_x === WY_CELL[0] && click.cell_y === WY_CELL[1] && recv.stage === MAP.id && same(recv.wei, SKILL) &&
        !!wei(placed) && wei(placed).ratio === 0.15 && wei(placed).count === 0 && (placed.hero_hp || {}).wei_yan === 5000,
      out.B_payload);
    await H.clickButton(page, "迎戰");
    const ob = await observe(IFRAME);
    const shot = await H.shot(page, "lifesteal-b-main-field");
    out.B_heal = { ...ob, shot };
    run.check(`B-2 主頁實際戰鬥（快照只讀）：魏延被敵人攻擊（至少 2 次）並用普通攻擊恢復：每次命中的實際傷害 ${ATK}、恢復＝min(${HEAL}, 最大生命 − 恢復前的生命)、恢復前後相符、不超過最大生命，至少 3 次完整的 ${HEAL}；場上看得到綠色的「+${HEAL}」`,
      ob.ratio === 0.15 && ob.bad.length === 0 && ob.full >= 3 && ob.attacks >= 2 && ob.maxHp === 5000 && ob.hp <= 5000 && ob.texts.includes(`+${HEAL}`),
      out.B_heal);

    // 面板：暫停 → 點魏延 → 繼續等到再恢復 2 次以上 → 暫停 → 重新點選
    const paused1 = await setPaused(IFRAME, true);
    const p1 = await panelVsSnapshot(IFRAME);
    await closePanel();
    await setPaused(IFRAME, false);
    const end = Date.now() + 60000;
    let s2 = null;
    for (;;) {
      s2 = await snapshot(IFRAME);
      const w = wei(s2);
      if ((w && w.count >= (p1.count || 0) + 2 && Math.abs((s2.hero_hp || {}).wei_yan - p1.hp) > 1) || Date.now() > end) break;
      await H.sleep(250);
    }
    const paused2 = await setPaused(IFRAME, true);
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(800);
    const p2 = await panelVsSnapshot(IFRAME);
    const panelShot390 = await H.shot(page, "lifesteal-b-panel-390");
    await closePanel();
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(500);
    await setPaused(IFRAME, false);
    // 兩次點選之間的帳目：第二次的生命＝第一次＋這段時間的恢復總量 − 敵人攻擊次數 × 50（防禦 100：100 × 100 ÷ 200）
    const expect2 = p1.hp + (p2.total - p1.total) - 50 * (p2.attacks - p1.attacks);
    out.B_panel = { paused1, p1, paused2, p2, expect2, panelShot390 };
    run.check("B-3 暫停後在戰場點魏延：面板的生命值＝同一時間的快照、看得到選取時數值的說明；繼續到再恢復 2 次以上後暫停、重新點選：面板換成新的生命（和快照相同、和第一次不同，＝第一次＋恢復總量 − 敵人攻擊 × 50），390×844 面板在畫面內、沒有橫向溢出",
      paused1 && paused2 && p1.frozen && p2.frozen && /魏延/.test(p1.panel.name || "") && p1.panel.hp === p1.hp && p1.panel.text === p1.hp.toFixed(0) &&
        /選取時的數值/.test(p1.panel.snap || "") && p2.panel.hp === p2.hp && p2.panel.text === p2.hp.toFixed(0) && p2.hp !== p1.hp &&
        p2.count >= p1.count + 2 && p2.total > p1.total && near(p2.panel.hp, expect2) && p2.panel.inView && p2.panel.noOverflow && /選取時的數值/.test(p2.panel.snap || ""),
      out.B_panel);
  });

  // ── C. 獨立戰鬥頁（真的部署 UI）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const click = await deploy(BIFRAME, WY_CELL[0], WY_CELL[1], "魏延");
    const recv = await received(BIFRAME);
    const placed = await snapshot(BIFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const ob = await observe(BIFRAME, 2, 1);
    out.C = { click, recv, placed: wei(placed), ...ob, shot: await H.shot(page, "lifesteal-c-battle-field") };
    run.check("C-1 獨立戰鬥頁：用滑鼠點道路 (4,5)、在部署選單選魏延（真的部署 UI）；iframe 收到的魏延 skill 和主頁相同；迎戰後每次命中 150、恢復＝min(22.5, 最大生命 − 恢復前)、至少 2 次完整的 22.5，不超過最大生命",
      !!click && click.cell_x === WY_CELL[0] && click.cell_y === WY_CELL[1] && recv.stage === MAP.id && same(recv.wei, SKILL) && !!out.C.placed && out.C.placed.count === 0 &&
        ob.ratio === 0.15 && ob.bad.length === 0 && ob.full >= 2 && ob.maxHp === 5000 && ob.hp <= 5000,
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
    const bad = /skill|lifesteal|steal|heal|stun|def_aura|def_mult|slow_aura|slow_mult|sweep|burn|long_range|range_multiplier|first_attack/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null, logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或吸血欄位；隊伍仍只有 hero_id／slot，武將資料（沒有升級紀錄、沒有生命欄位）與金幣／經驗／等級／進度不變、沒有戰鬥紀錄",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_ls_fixture")).catch(() => {});
  return run.finish({ out });
}
