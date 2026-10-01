async (page) => {
  // 顏良「威壓」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「威壓：降低敵軍攻擊」沒有寫比例與範圍。
  // 遊戲的第一版設計：戰鬥中，顏良目前射程內（含邊界）的所有敵人攻擊武將的直接攻擊力 × 0.9（地面、飛行、免疫減速都算），多個取最強；只在戰場
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_ad_fixture）：顏良（yan_liang，騎兵、攻擊力 102、防禦 86、生命 937、射程 2 格、攻擊間隔 1.3 秒，
  //   和正式設定相同）、擋路的盾兵（mock_ad_tank，防禦 100、生命很多、射程 0.3 格：打不到擋住的敵人），
  //   關卡「Mock AD 威壓」：直線路線（第 5 列），兩波各一個攻擊力 100、生命 700、每秒 60 像素的地面兵（第 1 波會被顏良的普通攻擊打倒）
  // - 攻擊力 100 打防禦 100 的盾兵：沒有威壓每擊 50；威壓後攻擊力 90、每擊 45
  // - A：技能說明（主頁的武將視窗、獨立的武將頁）：技能名稱「威壓」、射程內敵人的直接攻擊力降低 10%、目前的範圍半徑、取最強不疊加、
  //      離開範圍或移位就恢復、漏到城池扣的城防不減少、只在戰場；390×844 說明在畫面寬度內、字級至少 12px
  // - B：主頁用部署選單把盾兵放在道路 (4,5)、顏良放在建築格 (5,4)（真的部署 UI）：遊戲 iframe 收到的顏良 skill 正好是 {id: atk_down_aura, atk_mult: 0.9}；
  //      備戰時威壓不作用。迎戰後只用快照觀察（不直接扣血）：擋住的敵人在顏良的範圍內，每次攻擊用的攻擊力是 [100, 0.9, 90]，盾兵每擊扣 45；
  //      暫停時 390×844 截圖（範圍圈與敵人的向下箭頭）；第 1 波打完後用滑鼠把顏良拖到遠處 (10,6)（真的移位操作），
  //      第 2 波的敵人不在範圍內、沒有威壓，盾兵每擊扣 50
  // - C：獨立戰鬥頁：同樣用部署選單放置，迎戰後盾兵每擊扣 45、攻擊紀錄 [100, 0.9, 90]
  // - D：存檔、session 都沒有技能或威壓欄位，隊伍只有 hero_id／slot，武將與資源不變、沒有戰鬥紀錄
  // 全部 mock、虛構金鑰 test_ws_*（不含被比對的字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_ws_y";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_9", name: "Mock AD 威壓" };
  const TANK_CELL = [4, 5];
  const YL_CELL = [5, 4];
  const FAR_CELL = [10, 6];
  const SKILL = { id: "atk_down_aura", atk_mult: 0.9 };
  const HIT = 50; // 攻擊力 100 打防禦 100
  const HIT_AD = 45; // 威壓後攻擊力 90

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[0, ROW], [13, ROW]] }, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [
      {
        hero_id: "yan_liang", name: "顏良", rarity: "purple", cost: 6, job: "cavalry",
        base_atk: 102, base_def: 86, base_hp: 937, attack_range: 2, attack_speed: 1.3, upgrade_cost_base: 75,
        atk_growth: 10.2, def_growth: 8.6, hp_growth: 93.7, range_growth: 0.03, atk_spd_growth: 0, image: "hero_yan_liang.webp",
      },
      {
        hero_id: "mock_ad_tank", name: "盾兵", rarity: "blue", cost: 3, job: "infantry",
        base_atk: 10, base_def: 100, base_hp: 99999, attack_range: 0.3, attack_speed: 1, upgrade_cost_base: 50,
        atk_growth: 1, def_growth: 1, hp_growth: 1, range_growth: 0, atk_spd_growth: 0, image: "hero_guan_yu.webp",
      },
    ],
    enemies: [{ enemy_id: "mock_ad_brute", name: "蠻兵", hp: 700, speed: 60, atk: 100, image: "enemy_grunt1.webp" }],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [
        { wave: 1, enemies: [{ enemy_id: "mock_ad_brute", count: 1, interval: 1.0, path: "path_a" }] },
        { wave: 2, enemies: [{ enemy_id: "mock_ad_brute", count: 1, interval: 1.0, path: "path_a" }] },
      ],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_ad_fixture") === "1") {
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
    const id = "ad-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
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
      const yl = last ? last.team_list.find((t) => t.hero_id === "yan_liang") : null;
      const tk = last ? last.team_list.find((t) => t.hero_id === "mock_ad_tank") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, yl: yl ? yl.skill ?? null : undefined, tank: tk ? tk.skill ?? null : undefined };
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
  const clickCell = async (sel, c, row) => {
    const p = await cellPoint(sel, c, row);
    await page.mouse.click(p.x, p.y);
  };
  // 用滑鼠點空格、在部署選單選武將
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
  // 備戰時用滑鼠把武將從一格拖到另一格（真的移位操作：按住、移動超過門檻、在目標格放開）
  const drag = async (sel, from, to) => {
    const a = await cellPoint(sel, from[0], from[1]);
    const b = await cellPoint(sel, to[0], to[1]);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await H.sleep(100);
    await page.mouse.move(a.x + 12, a.y + 6, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 16 });
    await H.sleep(150);
    await page.mouse.up();
    await H.sleep(600);
  };
  const yl = (s) => ((s || {}).hero_atk_down || {}).yan_liang || null;
  // 場上第一個敵人的威壓狀態與盾兵的生命、敵人攻擊次數、顏良到它的距離（格）
  const fieldOf = (s) => {
    const ids = Object.keys(s.enemy_atk_down || {});
    const id = ids[0];
    const ad = id ? s.enemy_atk_down[id] : null;
    const dist = id ? ((s.hero_enemy_dist || {}).yan_liang || {})[id] : undefined;
    return { id, ad, attacks: id ? (s.enemy_blocker_attacks || {})[id] : undefined, tankHp: (s.hero_hp || {}).mock_ad_tank, dist, state: s.game_state, wave: s.wave };
  };
  // 只讀觀察：等到 until(f) 成立或逾時，回傳最後一次的觀察
  const watch = async (sel, until, ms = 60000) => {
    const end = Date.now() + ms;
    let last = null;
    for (;;) {
      const s = await snapshot(sel);
      last = { ...fieldOf(s), s };
      if (until(last) || Date.now() > end) return last;
      await H.sleep(200);
    }
  };
  // 一段觀察的攻擊：攻擊紀錄每筆都是 [base, mult, atk]，盾兵扣的血＝每擊 hit × 攻擊次數（從 hp0 起算）
  const attackIssues = (f, base, mult, hp0, hit) => {
    const log = (f.ad && f.ad.log) || [];
    const bad = log.filter((x) => !(x.base === base && near(x.mult, mult) && near(x.atk, base * mult))).slice(0, 3);
    const lost = hp0 - f.tankHp;
    return { n: log.length, bad, lost, expected: hit * f.attacks, ok: bad.length === 0 && log.length === f.attacks && near(lost, hit * f.attacks, 1e-6) };
  };
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
      try { out[name + "_shot"] = await H.shot(page, `atk-down-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };
  const RULES = (t) =>
    /技能：威壓/.test(t) && /目前射程內（含邊界）的所有敵人攻擊武將的直接攻擊力降低 10%（變成原本的 90%）/.test(t) && /目前等級的範圍半徑是 2 格/.test(t) &&
    /地面、飛行與免疫減速的敵人都算/.test(t) && /從扣 50 變成扣 45/.test(t) && /取最強的一個，不會疊加/.test(t) && /移位、被移除、陣亡時就恢復/.test(t) &&
    /漏到城池時扣的城防也不會減少/.test(t) && /只在戰場生效，不影響存檔/.test(t);

  // ── 準備 ──
  let profile0 = null;
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k }) => {
      localStorage.setItem("__shenma_ad_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "威壓", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter3_9", heroes: [],
          team: [{ hero_id: "yan_liang", slot: 1 }, { hero_id: "mock_ad_tank", slot: 2 }] } },
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
    const card = await page.locator('[role="dialog"] button[data-hero-id="yan_liang"]').innerText();
    await page.locator('[role="dialog"] button[data-hero-id="yan_liang"]').click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "atk-down-a-skill-detail") };
    run.check("A-1 主頁武將視窗：顏良的卡片是「技能：威壓」；詳情寫明目前射程內（含邊界）所有敵人攻擊武將的直接攻擊力降低 10%、範圍半徑 2 格、地面飛行與免疫減速都算、防禦照常（從扣 50 變成扣 45）、取最強不疊加、移位移除陣亡就恢復、漏到城池的城防不減少、只在戰場不影響存檔",
      /技能：威壓/.test(card) && RULES(detail), out.A_modal);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('button[data-hero-id="yan_liang"]').click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：顏良有「威壓」標籤（只有一個），點開後顯示同樣的規則",
      tags.filter((t) => t === "技能：威壓").length === 1 && detail2 === detail, out.A_page);

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
    const narrowPageShot = await H.shot(page, "atk-down-a-narrow-heroes-page");
    await page.keyboard.press("Escape");
    await H.sleep(400);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="yan_liang"]');
    await page.locator('[role="dialog"] button[data-hero-id="yan_liang"]').click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "atk-down-a-narrow-modal");
    out.A_narrow = { narrowPage, narrowModal, narrowPageShot, narrowModalShot };
    const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12 && m.docScroll <= m.vw;
    run.check("A-3 窄畫面（390×844）：武將頁與主頁武將視窗的威壓說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(narrowModal), out.A_narrow);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署選單放置、只用快照觀察；第 1 波打完後拖到遠處，第 2 波沒有威壓 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    const c1 = await deploy(IFRAME, TANK_CELL[0], TANK_CELL[1], "盾兵");
    const c2 = await deploy(IFRAME, YL_CELL[0], YL_CELL[1], "顏良");
    const recv = await received(IFRAME);
    const placed = await snapshot(IFRAME);
    const p0 = yl(placed);
    const hp0 = (placed.hero_hp || {}).mock_ad_tank;
    out.B_payload = { c1, c2, recv, yl: p0, tankHp: hp0 };
    run.check("B-1 規則 payload：用滑鼠點道路 (4,5) 放盾兵、建築格 (5,4) 放顏良（部署選單）；遊戲 iframe 收到的出征資料裡，顏良的 skill 正好是 {id: atk_down_aura, atk_mult: 0.9}、盾兵沒有技能；Godot 讀到 0.9、半徑 2、備戰時不作用、沒有影響的敵人",
      !!c1 && c1.cell_x === TANK_CELL[0] && c1.cell_y === TANK_CELL[1] && !!c2 && c2.cell_x === YL_CELL[0] && c2.cell_y === YL_CELL[1] &&
        recv.stage === MAP.id && same(recv.yl, SKILL) && recv.tank === null &&
        !!p0 && p0.aura_mult === 0.9 && p0.radius === 2 && p0.aura_active === false && p0.affected.length === 0 && hp0 === 99999,
      out.B_payload);
    await H.clickButton(page, "迎戰");

    // 第 1 波：被擋住的敵人在範圍內，攻擊 3 次以上
    const w1 = await watch(IFRAME, (f) => !!f.ad && f.attacks >= 3, 60000);
    const a1 = attackIssues(w1, 100, 0.9, hp0, HIT_AD);
    const ylw = yl(w1.s);
    out.B_wave1 = { attacks: w1.attacks, dist: w1.dist, mult: w1.ad && w1.ad.mult, effective: w1.ad && w1.ad.effective, base: w1.ad && w1.ad.base,
      sources: w1.ad && Object.keys(w1.ad.sources), yl: ylw && { active: ylw.aura_active, affected: ylw.affected, src: ylw.aura_source }, a1, enemyAtk: (w1.s.enemy_atk || {})[w1.id] };
    run.check("B-2 主頁第 1 波（快照只讀）：擋在盾兵前面的敵人離顏良不超過 2 格、有顏良的威壓（倍率 0.9、有效攻擊力 90，設定的攻擊力仍是 100）；每次攻擊的紀錄都是 [100, 0.9, 90]、筆數＝攻擊次數，盾兵每擊扣 45（不是 50）",
      w1.attacks >= 3 && w1.dist <= 2 && w1.ad.mult === 0.9 && near(w1.ad.effective, 90) && w1.ad.base === 100 && !!ylw && ylw.aura_active === true &&
        Object.keys(w1.ad.sources).includes(ylw.aura_source) && ylw.affected.includes(w1.id) && a1.ok && (w1.s.enemy_atk || {})[w1.id] === 100,
      out.B_wave1);

    // 暫停時 390×844 截圖（範圍圈與敵人的向下箭頭），繼續
    const paused = await setPaused(IFRAME, true);
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(800);
    const narrow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const shot390 = await H.shot(page, "atk-down-b-field-390");
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(600);
    await setPaused(IFRAME, false);

    // 第 1 波的敵人被顏良打倒 → 備戰：把顏良拖到遠處 (10,6)
    const prep = await watch(IFRAME, (f) => f.state === 1 && f.wave === 1, 60000);
    const hp1 = (prep.s.hero_hp || {}).mock_ad_tank;
    await drag(IFRAME, YL_CELL, FAR_CELL);
    const moved = await snapshot(IFRAME);
    await H.clickButton(page, "迎戰");
    const w2 = await watch(IFRAME, (f) => !!f.ad && f.wave === 2 && f.attacks >= 2, 60000);
    const a2 = attackIssues(w2, 100, 1, hp1, HIT);
    const yl2 = yl(w2.s);
    out.B_wave2 = { paused, narrow, shot390, prepState: prep.state, hp1, movedYl: yl(moved), attacks: w2.attacks, dist: w2.dist, mult: w2.ad && w2.ad.mult,
      sources: w2.ad && w2.ad.sources, yl: yl2 && { active: yl2.aura_active, affected: yl2.affected }, a2, shot: await H.shot(page, "atk-down-b-wave2") };
    run.check("B-3 第 1 波打完回到備戰後，用滑鼠把顏良拖到 (10,6)：第 2 波擋在盾兵前面的敵人離顏良超過 2 格、沒有威壓（倍率 1、沒有來源），攻擊紀錄都是 [100, 1, 100]，盾兵每擊扣 50；顏良的威壓作用中但沒有影響任何敵人；暫停時 390×844 沒有橫向溢出（截圖另存）",
      paused && narrow && prep.state === 1 && w2.attacks >= 2 && w2.dist > 2 && w2.ad.mult === 1 && Object.keys(w2.ad.sources).length === 0 && a2.ok &&
        !!yl2 && yl2.aura_active === true && yl2.affected.length === 0,
      out.B_wave2);
  });

  // ── C. 獨立戰鬥頁（真的部署 UI）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const c1 = await deploy(BIFRAME, TANK_CELL[0], TANK_CELL[1], "盾兵");
    const c2 = await deploy(BIFRAME, YL_CELL[0], YL_CELL[1], "顏良");
    const recv = await received(BIFRAME);
    const placed = await snapshot(BIFRAME);
    const hp0 = (placed.hero_hp || {}).mock_ad_tank;
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const w = await watch(BIFRAME, (f) => !!f.ad && f.attacks >= 2, 60000);
    const a = attackIssues(w, 100, 0.9, hp0, HIT_AD);
    out.C = { c1, c2, recv, yl: yl(placed), attacks: w.attacks, dist: w.dist, mult: w.ad && w.ad.mult, a, shot: await H.shot(page, "atk-down-c-battle-field") };
    run.check("C-1 獨立戰鬥頁：用部署選單放盾兵 (4,5) 與顏良 (5,4)；iframe 收到的顏良 skill 和主頁相同；迎戰後擋住的敵人有威壓（0.9），攻擊紀錄 [100, 0.9, 90]，盾兵每擊扣 45",
      !!c1 && !!c2 && recv.stage === MAP.id && same(recv.yl, SKILL) && !!yl(placed) && yl(placed).aura_active === false &&
        w.attacks >= 2 && w.dist <= 2 && w.ad.mult === 0.9 && a.ok,
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
    const bad = /skill|atk_down|atk_mult|tenacity|low_hp|damage_mult|counter|lifesteal|stun|def_aura|def_mult|slow_aura|slow_mult|sweep|burn|long_range|range_multiplier|first_attack/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null, logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或威壓欄位；隊伍仍只有 hero_id／slot，武將資料與金幣／經驗／等級／進度不變、沒有戰鬥紀錄",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_ad_fixture")).catch(() => {});
  return run.finish({ out });
}
