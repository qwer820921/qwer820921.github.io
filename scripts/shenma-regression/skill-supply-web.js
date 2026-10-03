async (page) => {
  // 魯肅「補給」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「補給：增加資源獲取」沒有寫資源種類、倍率與生效條件。
  // 遊戲的第一版設計：魯肅部署在戰場上、還活著時，全隊每次有效擊殺的戰鬥金幣 × 1.2（5 → 6，向下取整）；只增加這一場的戰鬥金幣，不影響玩家的獎勵
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_sp_fixture）：魯肅（lu_su，法師、攻擊力 73、防禦 62、生命 615、射程 5 格、攻擊間隔 0.9 秒，和正式設定相同）、
  //   合成的弓手（mock_sp_archer，沒有綁定技能；弓兵、攻擊力 122、射程 5 格、攻擊間隔 1.8 秒，數值和甘寧的正式設定相同。原本用甘寧，甘寧有了奇襲之後改用合成武將）、關卡「Mock SP 補給」：直線路線（第 5 列，從 (6,5) 出兵）。
  //   第 1、2 波各三個生命 50、不會移動的草人（一擊就倒），第 3 波一個生命 99999 的木樁（測試不開始第 3 波，戰鬥不會結束，不產生結算與存檔）
  // - 出征資料一律是正式的參數（supply 1.2）；只用快照與 Godot 送給網頁的 update_stats 觀察（不直接扣血、不改金幣）
  // - A：技能說明（主頁的武將視窗、獨立的武將頁，鍵盤也能打開）：技能名稱「補給」、部署在場上時全隊擊殺 +20%（5 → 6）、任何方式的擊殺都算、
  //      只在隊伍裡不生效、陣亡或移出隊伍立刻恢復、只增加戰鬥金幣（花費、返還與玩家的獎勵不變）、不疊加；390×844 與 390×600 在畫面寬度內、字級至少 12px
  // - B：主頁只部署弓手：第 1 波三次擊殺每次 +5（沒有來源）、戰鬥金幣 +15，畫面上的金幣和 update_stats 相同；清波後部署魯肅：
  //      快照有效來源是 lu_su、每次 6；選取面板寫明選取時生效中、每次 6（390×600 也在面板與畫面裡）；第 2 波三次擊殺每次 +6、金幣 +18
  // - C：獨立戰鬥頁：只部署魯肅，2× 時三次擊殺每次 +6、金幣 +18，畫面上的金幣和 update_stats 相同
  // - D：存檔、session 都沒有技能或補給欄位，隊伍只有 hero_id／slot，武將與資源不變、沒有戰鬥紀錄
  // 全部 mock、虛構金鑰 test_wx_*（不含被比對的字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_wx_k";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_8", name: "Mock SP 補給" };
  const GN_CELL = [6, 4];
  const LS_CELL = [7, 6];
  const SKILL = { id: "supply", supply_gold_multiplier: 1.2 };
  const SOFTS = 3;

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[6, ROW], [13, ROW]] }, spawn: [6, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [
      {
        hero_id: "lu_su", name: "魯肅", rarity: "blue", cost: 4, job: "mage",
        base_atk: 73, base_def: 62, base_hp: 615, attack_range: 5, attack_speed: 0.9, upgrade_cost_base: 50,
        atk_growth: 7.3, def_growth: 6.2, hp_growth: 61.5, range_growth: 0.03, speed_growth: 0.01, image: "hero_lu_su.webp", attack_image: "hero_lu_su_atk.webp",
      },
      {
        hero_id: "mock_sp_archer", name: "弓手", rarity: "orange", cost: 7, job: "archer",
        base_atk: 122, base_def: 107, base_hp: 1235, attack_range: 5, attack_speed: 1.8, upgrade_cost_base: 100,
        atk_growth: 12.2, def_growth: 10.7, hp_growth: 123.5, range_growth: 0.05, speed_growth: 0.02, image: "hero_gan_ning.webp", attack_image: "hero_gan_ning_atk.webp",
      },
    ],
    enemies: [
      { enemy_id: "mock_sp_soft", name: "草人", hp: 50, speed: 0, image: "enemy_grunt1.webp" },
      { enemy_id: "mock_sp_post", name: "木樁", hp: 99999, speed: 0, image: "enemy_grunt1.webp" },
    ],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [
        { wave: 1, enemies: [{ enemy_id: "mock_sp_soft", count: SOFTS, interval: 0.3, path: "path_a" }] },
        { wave: 2, enemies: [{ enemy_id: "mock_sp_soft", count: SOFTS, interval: 0.3, path: "path_a" }] },
        { wave: 3, enemies: [{ enemy_id: "mock_sp_post", count: 1, interval: 0.3, path: "path_a" }] },
      ],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    const ids = extra.heroes.map((h) => h.hero_id);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_sp_fixture") === "1") {
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
    const id = "sp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
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
      const of = (id) => (last ? last.team_list.find((t) => t.hero_id === id) : null);
      const ls = of("lu_su");
      const gn = of("mock_sp_archer");
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: ls ? ls.skill ?? null : undefined, atk: ls ? ls.atk : undefined, ganSkill: gn ? ("skill" in gn ? gn.skill : "none") : undefined };
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
  // Godot 送給網頁的最後一筆 update_stats 的戰鬥金幣、畫面上顯示的戰鬥金幣（主頁的 HUD、獨立戰鬥頁的狀態列）
  const lastStatsGold = () =>
    page.evaluate(() => {
      const st = (window.__bridgeLog || []).filter((m) => m.type === "update_stats");
      return st.length ? st[st.length - 1].gold : null;
    });
  const shownGold = (battlePage) =>
    page.evaluate((bp) => {
      const el = bp
        ? document.querySelector('[class*="statsRow"] [class*="statValue"]')
        : document.querySelector('[class*="hudRight"] [class*="hudStat"]');
      return el ? Number(el.innerText.replace(/[^0-9-]/g, "")) : null;
    }, battlePage);
  const sup = (s) => (s || {}).supply || null;
  const watch = async (sel, until, ms) => {
    const end = Date.now() + ms;
    let last = null;
    for (;;) {
      const s = await snapshot(sel);
      last = { sup: sup(s), hero: ((s || {}).hero_supply || {}).lu_su || null, state: s.game_state, ts: s.time_scale, s };
      if (until(last) || Date.now() > end) return last;
      await H.sleep(150);
    }
  };
  // 金幣紀錄的 [實得, 基礎, 來源]，以及擊殺數是否逐筆 +1、生成序號不重複
  const entries = (log, from) => (log || []).slice(from).map((x) => [x.gold, x.base, x.source]);
  const countsOk = (log) => {
    const ks = (log || []).map((x) => x.kills);
    const seqs = (log || []).map((x) => x.seq);
    return ks.every((k, i) => k === i + 1) && new Set(seqs).size === seqs.length;
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
      try { out[name + "_shot"] = await H.shot(page, `supply-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };
  const RULES = (t) =>
    /技能：補給/.test(t) && /部署在戰場上、還活著時，全隊每次擊殺敵人得到的戰鬥金幣增加 20%：每次從 5 變成 6（向下取整）/.test(t) &&
    /其他武將、防禦塔、灼燒等任何方式打倒的敵人都算，擊殺數照常只算一次/.test(t) && /敵人漏到城池不算擊殺，也沒有金幣/.test(t) &&
    /只放在隊伍裡、還沒部署時不生效/.test(t) && /陣亡或被移出隊伍時立刻恢復成每次 5，重新部署後再生效/.test(t) &&
    /建造與升級的花費、拆除的返還、結算的戰場點數，以及玩家的金幣、經驗與存檔都不變/.test(t) && /同時有幾個補給在場時取最高的倍率，不會疊加/.test(t) &&
    /只在戰場生效，不影響存檔/.test(t) && !/生效中/.test(t);
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
      localStorage.setItem("__shenma_sp_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "補給", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: m, heroes: [],
          team: [{ hero_id: "lu_su", slot: 1 }, { hero_id: "mock_sp_archer", slot: 2 }] } },
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
    await page.waitForSelector('[role="dialog"] button[data-hero-id="lu_su"]');
    const card = await page.locator('[role="dialog"] button[data-hero-id="lu_su"]').innerText();
    const ganCard = await page.locator('[role="dialog"] button[data-hero-id="mock_sp_archer"]').innerText().catch(() => "");
    await page.locator('[role="dialog"] button[data-hero-id="lu_su"]').click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, ganCard, detail, shot: await H.shot(page, "supply-a-skill-detail") };
    run.check("A-1 主頁武將視窗：魯肅的卡片是「技能：補給」（弓手沒有技能標籤）；詳情寫明部署在戰場上、還活著時全隊擊殺戰鬥金幣 +20%（5 → 6，向下取整）、任何方式打倒的都算且擊殺只算一次、漏到城池沒有金幣、只在隊伍裡不生效、陣亡或移出隊伍立刻恢復、只增加這一場的戰鬥金幣（花費、返還、戰場點數與玩家的金幣經驗存檔不變）、多個補給不疊加；出征前不寫「生效中」",
      /技能：補給/.test(card) && !/技能：/.test(ganCard) && RULES(detail), out.A_modal);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('button[data-hero-id="lu_su"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="hero-skill-detail"]', { timeout: 15000 });
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：魯肅有「補給」標籤（只有一個）；用鍵盤聚焦卡片按 Enter 打開詳情，顯示同樣的規則",
      tags.filter((t) => t === "技能：補給").length === 1 && detail2 === detail, out.A_page);

    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const narrowPage = await measure();
    const narrowPageShot = await H.shot(page, "supply-a-narrow-heroes-page");
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const shortPage = await measure();
    const shortPageShot = await H.shot(page, "supply-a-short-heroes-page");
    await page.keyboard.press("Escape");
    await H.sleep(400);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="lu_su"]');
    await page.locator('[role="dialog"] button[data-hero-id="lu_su"]').click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "supply-a-narrow-modal");
    out.A_narrow = { narrowPage, shortPage, narrowModal, narrowPageShot, shortPageShot, narrowModalShot };
    run.check("A-3 窄畫面（390×844）與矮畫面（390×600）：武將頁與主頁武將視窗的補給說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(shortPage) && fits(narrowModal), out.A_narrow);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：只部署弓手 → 每次 5；清波後部署魯肅 → 每次 6 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    const c1 = await deploy(IFRAME, GN_CELL[0], GN_CELL[1], "弓手");
    const recv = await received(IFRAME);
    const s0 = await snapshot(IFRAME);
    out.B_payload = { c1, recv, supply: sup(s0), heroSupply: s0.hero_supply };
    run.check("B-1 規則 payload：用滑鼠點建築格 (6,4) 放弓手（部署選單）；遊戲 iframe 收到的出征資料裡，魯肅的 skill 正好是 {id: supply, supply_gold_multiplier: 1.2}、弓手沒有 skill；魯肅還沒部署：快照沒有有效來源、每次擊殺 5、沒有 hero_supply",
      !!c1 && c1.cell_x === GN_CELL[0] && c1.cell_y === GN_CELL[1] && recv.stage === MAP.id && same(recv.skill, SKILL) && recv.atk === 73 && recv.ganSkill === "none" &&
        !!sup(s0) && sup(s0).hero_id === "" && sup(s0).kill_gold === 5 && sup(s0).base_gold === 5 && sup(s0).sources.length === 0 && same(s0.hero_supply, {}),
      out.B_payload);

    const g0 = await lastStatsGold();
    await H.clickButton(page, "迎戰");
    const w1 = await watch(IFRAME, (f) => !!f.sup && f.sup.log.length >= SOFTS && f.state === 1, 120000);
    await H.sleep(300);
    const g1 = await lastStatsGold();
    const hud1 = await shownGold(false);
    out.B_wave1 = { log: w1.sup && w1.sup.log, state: w1.state, g0, g1, hud1 };
    run.check("B-2 第 1 波（只有弓手，魯肅只在隊伍裡）：三次擊殺每次 +5、沒有來源，擊殺數逐筆 +1、生成序號不重複；清波後戰鬥金幣比開戰前 +15，畫面上的金幣和 update_stats 相同",
      !!w1.sup && same(entries(w1.sup.log, 0), [[5, 5, ""], [5, 5, ""], [5, 5, ""]]) && countsOk(w1.sup.log) && w1.state === 1 &&
        typeof g0 === "number" && g1 - g0 === 15 && hud1 === g1,
      out.B_wave1);

    await deploy(IFRAME, LS_CELL[0], LS_CELL[1], "魯肅");
    const s1 = await snapshot(IFRAME);
    const hs = (s1.hero_supply || {}).lu_su || null;
    // 選取面板：點場上的魯肅（390×600 也在面板與畫面裡）
    const lp = await cellPoint(IFRAME, LS_CELL[0], LS_CELL[1]);
    await page.mouse.click(lp.x, lp.y);
    await page.waitForSelector('[data-testid="unit-panel-supply"]', { timeout: 15000 });
    const panel = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-supply"]');
      return { note: el.innerText, active: el.dataset.active, killGold: Number(el.dataset.killGold) };
    });
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-supply"]');
      const p = document.querySelector('[data-testid="unit-panel"]');
      if (!el || !p) return null;
      el.scrollIntoView({ block: "nearest" });
      const b = el.getBoundingClientRect();
      const pb = p.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), vw: window.innerWidth, vh: window.innerHeight,
        panelTop: Math.round(pb.top), panelBottom: Math.round(pb.bottom), font: parseFloat(getComputedStyle(el).fontSize), docScroll: document.documentElement.scrollWidth };
    });
    const panelShot = await H.shot(page, "supply-b-unit-panel-390x600");
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(400);
    await closePanel();
    out.B_deployed = { supply: sup(s1), hero: hs, panel, box, panelShot };
    const inside = (b) => !!b && b.left >= 0 && b.right <= b.vw && b.docScroll <= b.vw && b.font >= 12 && b.top >= b.panelTop && b.bottom <= b.panelBottom + 1 && b.bottom <= b.vh;
    run.check("B-3 清波後部署魯肅 (7,6)：快照的有效來源是 lu_su（1.2）、每次擊殺 6，hero_supply {1.2, 生效中, 6}；選取面板「補給：選取時生效中，這一場每次擊殺戰鬥金幣 6（基礎 5）；在場上、還活著時全隊擊殺 +20%（5 → 6），不影響玩家的獎勵」；390×600 時說明整段在面板與畫面裡（截圖另存）",
      !!sup(s1) && sup(s1).hero_id === "lu_su" && near(sup(s1).mult, 1.2) && sup(s1).kill_gold === 6 && sup(s1).sources.length === 1 &&
        !!hs && near(hs.mult, 1.2) && hs.active === true && hs.kill_gold === 6 &&
        /補給：選取時生效中，這一場每次擊殺戰鬥金幣 6（基礎 5）；在場上、還活著時全隊擊殺 \+20%（5 → 6），不影響玩家的獎勵/.test(panel.note) &&
        panel.active === "1" && panel.killGold === 6 && inside(box),
      out.B_deployed);

    const g2 = await lastStatsGold();
    await H.clickButton(page, "迎戰");
    const w2 = await watch(IFRAME, (f) => !!f.sup && f.sup.log.length >= 2 * SOFTS && f.state === 1, 120000);
    await H.sleep(300);
    const g3 = await lastStatsGold();
    const hud3 = await shownGold(false);
    const shot2 = await H.shot(page, "supply-b-wave2");
    out.B_wave2 = { log: w2.sup && w2.sup.log, state: w2.state, g2, g3, hud3, shot2 };
    run.check("B-4 第 2 波（弓手與魯肅都在場上）：三次擊殺每次 +6、來源 lu_su，擊殺數接著 4、5、6、生成序號不重複；清波後戰鬥金幣 +18，畫面上的金幣和 update_stats 相同",
      !!w2.sup && w2.sup.log.length === 2 * SOFTS && w2.state === 1 && same(entries(w2.sup.log, SOFTS), [[6, 5, "lu_su"], [6, 5, "lu_su"], [6, 5, "lu_su"]]) && countsOk(w2.sup.log) &&
        typeof g2 === "number" && g3 - g2 === 18 && hud3 === g3,
      out.B_wave2);
  });

  // ── C. 獨立戰鬥頁（真的部署 UI，2×）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const c1 = await deploy(BIFRAME, LS_CELL[0], LS_CELL[1], "魯肅");
    const recv = await received(BIFRAME);
    const placed = await snapshot(BIFRAME);
    const g0 = await lastStatsGold();
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const x2 = await clickSpeed(BIFRAME, 2);
    const w = await watch(BIFRAME, (f) => !!f.sup && f.sup.log.length >= SOFTS && f.state === 1, 120000);
    await H.sleep(300);
    const g1 = await lastStatsGold();
    const shown = await shownGold(true);
    out.C = { c1, recv, placed: sup(placed), x2, log: w.sup && w.sup.log, g0, g1, shown, shot: await H.shot(page, "supply-c-battle-field") };
    run.check("C-1 獨立戰鬥頁：用部署選單放魯肅 (7,6)；iframe 收到的 skill 和主頁相同、部署後有效來源是 lu_su；2× 時三次擊殺每次 +6、戰鬥金幣 +18，畫面上的金幣和 update_stats 相同",
      !!c1 && recv.stage === MAP.id && same(recv.skill, SKILL) && !!sup(placed) && sup(placed).hero_id === "lu_su" && x2 &&
        !!w.sup && same(entries(w.sup.log, 0), [[6, 5, "lu_su"], [6, 5, "lu_su"], [6, 5, "lu_su"]]) && countsOk(w.sup.log) &&
        typeof g0 === "number" && g1 - g0 === 18 && shown === g1,
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
    const bad = /skill|supply|multiplier|berserk|stacks|storm|chain|double_shot|tenacity|counter|lifesteal|stun|def_aura|slow_aura|sweep|burn|long_range|first_attack/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null, logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或補給欄位；隊伍仍只有 hero_id／slot，武將資料與金幣／經驗／等級／進度不變、沒有戰鬥紀錄（戰鬥金幣不會變成玩家的金幣）",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_sp_fixture")).catch(() => {});
  return run.finish({ out });
}
