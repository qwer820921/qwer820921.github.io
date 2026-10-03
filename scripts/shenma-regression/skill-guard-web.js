async (page) => {
  // 典韋「護衛」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「護衛：替隊友分擔傷害」沒有寫比例、範圍、扣血順序與多名護衛的規則。
  // 遊戲的第一版設計：典韋在場上、還活著時，戰鬥中 2 格內（兩人中心的距離、含邊界）其他友軍武將受到敵人的直接攻擊，
  // 友軍先照自己的閃避、防禦與堅韌算出要扣的生命 D，典韋直接承擔 min(D × 20%, 典韋剩下的生命)、友軍扣其餘的部分
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_gd_fixture）：典韋（dian_wei，步兵、攻擊力 149、防禦 110、生命 1300、射程 1、攻擊間隔 1.1，和正式設定相同）、
  //   合成的盾衛（mock_gd_ally，沒有綁定技能；弓兵、防禦 107，數值和甘寧的正式設定相同。原本用甘寧，甘寧有了奇襲之後改用合成武將）、關卡「Mock GD 護衛」：直線路線（第 5 列，從 (3,5) 走到 (13,5)），
  //   盾衛站在路上 (8,5) 擋路、典韋在旁邊 (8,4)（1 格）；第 1 波一個生命 99999、每秒 30 像素、攻擊力 100 的走路兵（打不倒，戰鬥不會結束，不產生結算與存檔）
  // - 出征資料一律是正式的參數（guard_share 0.2、2）；只用快照與 Godot 送給網頁的訊息觀察（不直接扣血）
  // - A：技能說明（主頁的武將視窗、獨立的武將頁，鍵盤也能打開）：技能名稱「護衛」、2 格內其他友軍承擔 20%、先友軍的防禦與堅韌、典韋直接扣、
  //      生命不夠時只承擔剩下的、不保護自己與塔／城池、只由一名承擔、GUARD 標記；390×844 與 390×600 在畫面寬度內、字級至少 12px
  // - B：主頁：部署盾衛在路上、典韋在旁邊；走路兵擋在盾衛面前攻擊：每次紀錄 D＝100 × 100 ÷ 207（盾衛防禦 107）、典韋承擔 D × 0.2、盾衛扣其餘（守恆）；
  //      看得到 GUARD；選取面板寫出選取時可以提供、範圍內 1 名友軍（390×600 也在面板與畫面裡）；手動暫停 2 秒沒有新的承擔，繼續後恢復；2× 照常承擔
  // - C：獨立戰鬥頁：同樣部署，承擔 3 次，數值相同
  // - D：存檔、session 都沒有技能或護衛欄位，隊伍只有 hero_id／slot，武將與資源不變、沒有戰鬥紀錄
  // 全部 mock、虛構金鑰 test_wd_*（不含被比對的字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_wd_k";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_7", name: "Mock GD 護衛" };
  const GN_CELL = [8, 5];
  const DW_CELL = [8, 4];
  const SKILL = { id: "guard_share", guard_share_ratio: 0.2, guard_radius: 2 };
  // 走路兵（攻擊力 100）打盾衛（防禦 107）：100 × (1 − 107 ÷ 207)
  const D = 100 * (1 - 107 / 207);

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[3, ROW], [13, ROW]] }, spawn: [3, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [
      {
        hero_id: "dian_wei", name: "典韋", rarity: "orange", cost: 9, job: "infantry",
        base_atk: 149, base_def: 110, base_hp: 1300, attack_range: 1, attack_speed: 1.1, upgrade_cost_base: 100,
        atk_growth: 14.9, def_growth: 11, hp_growth: 130, range_growth: 0.05, speed_growth: 0.02, image: "hero_dian_wei.webp", attack_image: "hero_dian_wei_atk.webp",
      },
      {
        hero_id: "mock_gd_ally", name: "盾衛", rarity: "orange", cost: 7, job: "archer",
        base_atk: 122, base_def: 107, base_hp: 1235, attack_range: 5, attack_speed: 1.8, upgrade_cost_base: 100,
        atk_growth: 12.2, def_growth: 10.7, hp_growth: 123.5, range_growth: 0.05, speed_growth: 0.02, image: "hero_gan_ning.webp", attack_image: "hero_gan_ning_atk.webp",
      },
    ],
    enemies: [
      { enemy_id: "mock_gd_walker", name: "走兵", hp: 99999, speed: 30, atk: 100, image: "enemy_grunt1.webp" },
    ],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [
        { wave: 1, enemies: [{ enemy_id: "mock_gd_walker", count: 1, interval: 0.3, path: "path_a" }] },
      ],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    const ids = extra.heroes.map((h) => h.hero_id);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_gd_fixture") === "1") {
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
    if (window.__wdRecv) return;
    window.__wdRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__wdRecv.push(e.data);
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
    const id = "gd-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const received = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__wdRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const of = (id) => (last ? last.team_list.find((t) => t.hero_id === id) : null);
      const dw = of("dian_wei");
      const gn = of("mock_gd_ally");
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: dw ? dw.skill ?? null : undefined, gnSkill: gn ? gn.skill ?? null : undefined, def: gn ? gn.def : undefined };
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
  const gd = (s) => (((s || {}).hero_guard) || {}).dian_wei || null;
  // 承擔紀錄：每一筆的友軍是盾衛、D 是攻擊力 100 打防禦 107 的實扣、S＝D × 0.2、友軍與典韋的生命變化守恆
  const logOk = (log) =>
    (log || []).length > 0 &&
    log.every((x) => x.ally === "mock_gd_ally" && near(x.d, D, 1e-3) && near(x.s, x.d * 0.2, 1e-6) &&
      near(x.ally_before - x.ally_after, x.d - x.s, 1e-3) && near(x.guard_before - x.guard_after, x.s, 1e-6));
  // 等到承擔次數 ≥ n（每 150 毫秒看一次快照；順便記下看得到的 GUARD 標記數）
  const watch = async (sel, n, ms) => {
    const end = Date.now() + ms;
    let texts = 0;
    for (;;) {
      const s = await snapshot(sel);
      texts = Math.max(texts, s.guard_texts || 0);
      const g = gd(s);
      if ((g && g.count >= n) || Date.now() > end) return { s, g, texts };
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
      try { out[name + "_shot"] = await H.shot(page, `guard-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };
  const RULES = (t) =>
    /技能：護衛/.test(t) &&
    /部署在戰場上、還活著時，替 2 格內（含邊界，以受傷當下兩人中心的距離計算）的其他友軍武將承擔敵人直接攻擊的 20%/.test(t) &&
    /友軍先照自己的閃避、防禦（含防禦光環）與堅韌算出這一擊要扣的生命，這位武將再直接承擔其中的 20%：例如要扣 100 時友軍扣 80、這位武將扣 20/.test(t) &&
    /不再用它自己的防禦、閃避或堅韌減少；生命不夠時只承擔得了剩下的生命（只剩 5 時友軍扣 95、這位武將扣 5），不會免費多擋/.test(t) &&
    /友軍生命很少時照樣按完整的傷害分攤/.test(t) && /不保護自己、防禦塔與城池/.test(t) && /只由一名承擔/.test(t) &&
    /承擔的部分不會再轉給另一名/.test(t) && /備戰、結算與暫停時不分攤/.test(t) && /反擊時只算自己實際被扣的部分/.test(t) &&
    /「GUARD」/.test(t) && /只在戰場生效，不影響存檔/.test(t) && !/範圍內有 \d+ 名友軍/.test(t);
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
      localStorage.setItem("__shenma_gd_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "護衛", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: m, heroes: [],
          team: [{ hero_id: "dian_wei", slot: 1 }, { hero_id: "mock_gd_ally", slot: 2 }] } },
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
    await page.waitForSelector('[role="dialog"] button[data-hero-id="dian_wei"]');
    const card = await page.locator('[role="dialog"] button[data-hero-id="dian_wei"]').innerText();
    await page.locator('[role="dialog"] button[data-hero-id="dian_wei"]').click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "guard-a-skill-detail") };
    run.check("A-1 主頁武將視窗：典韋的卡片是「技能：護衛」；詳情寫明 2 格內（受傷當下兩人中心的距離）其他友軍承擔 20%、先友軍的閃避／防禦／堅韌再承擔（100 → 友軍 80、典韋 20）、典韋直接扣不再減傷、只剩 5 時只承擔 5、按完整傷害分攤、不保護自己與塔／城池、只由一名承擔且不再轉出、備戰／結算／暫停不分攤、被保護的反擊只算自己被扣的、GUARD 標記；出征前不寫範圍內的友軍數",
      /技能：護衛/.test(card) && RULES(detail), out.A_modal);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('button[data-hero-id="dian_wei"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="hero-skill-detail"]', { timeout: 15000 });
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：典韋有「護衛」標籤（只有一個）；用鍵盤聚焦卡片按 Enter 打開詳情，顯示同樣的規則",
      tags.filter((t) => t === "技能：護衛").length === 1 && detail2 === detail, out.A_page);

    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const narrowPage = await measure();
    const narrowPageShot = await H.shot(page, "guard-a-narrow-heroes-page");
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const shortPage = await measure();
    const shortPageShot = await H.shot(page, "guard-a-short-heroes-page");
    await page.keyboard.press("Escape");
    await H.sleep(400);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="dian_wei"]');
    await page.locator('[role="dialog"] button[data-hero-id="dian_wei"]').click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "guard-a-narrow-modal");
    out.A_narrow = { narrowPage, shortPage, narrowModal, narrowPageShot, shortPageShot, narrowModalShot };
    run.check("A-3 窄畫面（390×844）與矮畫面（390×600）：武將頁與主頁武將視窗的護衛說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(shortPage) && fits(narrowModal), out.A_narrow);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：盾衛擋路、典韋在旁邊承擔；選取面板；暫停與 2× ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    const c1 = await deploy(IFRAME, GN_CELL[0], GN_CELL[1], "盾衛");
    const c2 = await deploy(IFRAME, DW_CELL[0], DW_CELL[1], "典韋");
    const recv = await received(IFRAME);
    const s0 = await snapshot(IFRAME);
    out.B_payload = { c1, c2, recv, gd: gd(s0) };
    run.check("B-1 規則 payload：用部署選單把盾衛放在路上 (8,5)、典韋放在 (8,4)；遊戲 iframe 收到的出征資料裡，典韋的 skill 正好是 {id: guard_share, guard_share_ratio: 0.2, guard_radius: 2}、盾衛沒有技能、防禦 107；開戰前快照 hero_guard {0.2, 2, 可以提供、範圍內 [mock_gd_ally]、0 次}",
      !!c1 && c1.cell_x === GN_CELL[0] && c1.cell_y === GN_CELL[1] && !!c2 && c2.cell_x === DW_CELL[0] && c2.cell_y === DW_CELL[1] && recv.stage === MAP.id &&
        same(recv.skill, SKILL) && recv.gnSkill === null && recv.def === 107 && !!gd(s0) && near(gd(s0).ratio, 0.2) && near(gd(s0).radius, 2) &&
        gd(s0).active === true && same(gd(s0).allies, ["mock_gd_ally"]) && gd(s0).count === 0,
      out.B_payload);

    await H.clickButton(page, "迎戰");
    const w = await watch(IFRAME, 3, 120000);
    const g = w.g || {};
    out.B_share = { count: g.count, log: (g.log || []).slice(0, 4), texts: w.texts, D, shot: await H.shot(page, "guard-b-shared") };
    run.check(`B-2 主頁實際承擔 3 次：每次 D＝${D.toFixed(3)}（走路兵攻擊力 100 打盾衛防禦 107）、典韋承擔 D × 0.2、盾衛扣其餘（兩人的生命變化守恆）；看得到 GUARD 標記`,
      g.count >= 3 && logOk(g.log) && w.texts >= 1, out.B_share);

    // 選取面板：點場上的典韋（390×600 也在面板與畫面裡）
    const dp = await cellPoint(IFRAME, DW_CELL[0], DW_CELL[1]);
    await page.mouse.click(dp.x, dp.y);
    await page.waitForSelector('[data-testid="unit-panel-guard"]', { timeout: 15000 });
    const panel = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-guard"]');
      return { note: el.innerText, active: el.dataset.active, allies: Number(el.dataset.allies) };
    });
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-guard"]');
      const p = document.querySelector('[data-testid="unit-panel"]');
      if (!el || !p) return null;
      el.scrollIntoView({ block: "nearest" });
      const b = el.getBoundingClientRect();
      const pb = p.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), vw: window.innerWidth, vh: window.innerHeight,
        panelTop: Math.round(pb.top), panelBottom: Math.round(pb.bottom), font: parseFloat(getComputedStyle(el).fontSize), docScroll: document.documentElement.scrollWidth };
    });
    const panelShot = await H.shot(page, "guard-b-unit-panel-390x600");
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(400);
    await closePanel();
    out.B_panel = { panel, box, panelShot };
    const inside = (b) => !!b && b.left >= 0 && b.right <= b.vw && b.docScroll <= b.vw && b.font >= 12 && b.top >= b.panelTop && b.bottom <= b.panelBottom + 1 && b.bottom <= b.vh;
    run.check("B-3 選取面板「護衛：選取時可以提供，2 格內有 1 名友軍；戰鬥中範圍內其他友軍受到敵人直接攻擊時，防禦與堅韌算完後承擔 20%（直接扣自己的生命、不超過剩下的生命）（重新點選可以更新）」；390×600 時說明整段在面板與畫面裡（截圖另存）",
      /護衛：(?:選取時|目前)可以提供，2 格內有 1 名友軍；戰鬥中範圍內其他友軍受到敵人直接攻擊時，防禦與堅韌算完後承擔 20%（直接扣自己的生命、不超過剩下的生命）（(?:重新點選可以更新|即時更新)）/.test(panel.note) &&
        panel.active === "1" && panel.allies === 1 && inside(box),
      out.B_panel);

    // 手動暫停：2 秒沒有新的承擔（敵人也不攻擊）；繼續後恢復；之後 2× 照常承擔
    await page.locator('[data-testid="pause-toggle"]').click();
    await page.waitForSelector('[data-testid="pause-badge"]', { timeout: 15000 });
    const p0 = gd(await snapshot(IFRAME)).count;
    await H.sleep(2000);
    const p1 = gd(await snapshot(IFRAME)).count;
    await page.locator('[data-testid="pause-toggle"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="pause-badge"]'), null, { timeout: 15000 });
    const x2 = await clickSpeed(IFRAME, 2);
    const w2 = await watch(IFRAME, p1 + 2, 60000);
    out.B_pause = { p0, p1, x2, after: w2.g && w2.g.count, timeScale: w2.s.time_scale, log: ((w2.g && w2.g.log) || []).slice(-2) };
    run.check("B-4 手動暫停 2 秒：承擔次數不變；繼續並切到 2× 後再承擔 2 次以上，數值相同（D × 0.2、守恆）",
      p1 === p0 && x2 && w2.g && w2.g.count >= p1 + 2 && logOk(w2.g.log) && near(w2.s.time_scale, 2), out.B_pause);
  });

  // ── C. 獨立戰鬥頁（真的部署 UI）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const c1 = await deploy(BIFRAME, GN_CELL[0], GN_CELL[1], "盾衛");
    const c2 = await deploy(BIFRAME, DW_CELL[0], DW_CELL[1], "典韋");
    const recv = await received(BIFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const w = await watch(BIFRAME, 3, 120000);
    const g = w.g || {};
    out.C = { c1, c2, recv, count: g.count, log: (g.log || []).slice(0, 3), texts: w.texts, shot: await H.shot(page, "guard-c-battle-field") };
    run.check("C-1 獨立戰鬥頁：用部署選單放盾衛 (8,5)、典韋 (8,4)；iframe 收到的 skill 和主頁相同；承擔 3 次，紀錄同樣是 D × 0.2、守恆，看得到 GUARD",
      !!c1 && !!c2 && recv.stage === MAP.id && same(recv.skill, SKILL) && g.count >= 3 && logOk(g.log) && w.texts >= 1, out.C);
  });

  // ── D. 存檔與 session 不帶技能欄位、屬性與資源不變 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const d = await db();
    const p = d.profiles[KEY];
    const sess = await sessionRaw();
    const bad = /skill|guard|share|ratio|radius|knockback|cooldown|supply|multiplier|berserk|stacks|storm|chain|double_shot|tenacity|counter|lifesteal|stun|def_aura|slow_aura|sweep|burn|long_range|first_attack/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null, logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或護衛欄位；隊伍仍只有 hero_id／slot，武將資料與金幣／經驗／等級／進度不變、沒有戰鬥紀錄",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_gd_fixture")).catch(() => {});
  return run.finish({ out });
}
