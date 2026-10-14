async (page) => {
  // 諸葛亮「呼風喚雨」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「呼風喚雨：大範圍傷害」沒有寫範圍、比例、人數與觸發方式。
  // 遊戲的第一版設計：每次普通攻擊實際打到敵人後，以它被打中的位置為中心、2 格內（含邊界）最多 4 名其他敵人各受這次普通攻擊傷害的 50%（主要目標除外，不遞減、不往外傳）；只在戰場
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_st_fixture）：諸葛亮（zhu_ge_liang，法師、攻擊力 118、防禦 97、生命 1290、射程 5 格、攻擊間隔 0.9 秒，和正式設定相同）、
  //   關卡「Mock ST 呼風喚雨」：直線路線（第 5 列，從地圖中間的 (6,5) 出兵，風雨圈整個在畫面裡），一波六個生命 99999、不會移動的木樁（都停在出兵點，彼此距離 0）
  // - 出征資料一律是正式的參數（storm 2 格、0.5、4 名）；只用快照觀察（不直接扣血）
  // - A：技能說明（主頁的武將視窗、獨立的武將頁，鍵盤也能打開）：技能名稱「呼風喚雨」、短版說明（只寫效果、目前的數值與主要例外，和整句比對）；390×844 與 390×600 在畫面寬度內、字級至少 12px
  // - B：主頁用部署選單把諸葛亮放在建築格 (3,4)（真的部署 UI）：遊戲 iframe 收到的 skill 正好是 {id: storm, storm_radius: 2, storm_ratio: 0.5, storm_max_targets: 4}；
  //      點選場上的諸葛亮，選取面板寫出範圍規則；迎戰後六個木樁都在場時每次攻擊都打到 4 名（第一擊時可能還沒出齊，那幾擊打到的人數較少）：
  //      主目標（生成序號最小）被打掉 118 × 攻擊次數，序號 1～4 各 59 × 範圍傷害次數，序號 5 不受傷（超過 4 名）；暫停時風雨圈停住、1 秒沒有攻擊；切到 2× 照樣一致
  // - C：獨立戰鬥頁：同樣用部署選單放置，2× 時統計與生命一致
  // - D：存檔、session 都沒有技能或呼風喚雨欄位，隊伍只有 hero_id／slot，武將與資源不變、沒有戰鬥紀錄
  // 全部 mock、虛構金鑰 test_wx_*（不含被比對的字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_wx_z";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_9", name: "Mock ST 呼風喚雨" };
  const ZG_CELL = [3, 4];
  const SKILL = { id: "storm", storm_radius: 2, storm_ratio: 0.5, storm_max_targets: 4 };
  const ATK = 118;
  const SPLASH = ATK * 0.5;
  const POST_HP = 99999;
  const POSTS = 6;

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[6, ROW], [13, ROW]] }, spawn: [6, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [
      {
        hero_id: "zhu_ge_liang", name: "諸葛亮", rarity: "orange", cost: 8, job: "mage",
        base_atk: 118, base_def: 97, base_hp: 1290, attack_range: 5, attack_speed: 0.9, upgrade_cost_base: 100,
        atk_growth: 11.8, def_growth: 9.7, hp_growth: 129, range_growth: 0.05, speed_growth: 0.02, image: "hero_zhu_ge_liang.webp",
      },
    ],
    enemies: [{ enemy_id: "mock_st_post", name: "木樁", hp: POST_HP, speed: 0, image: "enemy_grunt1.webp" }],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [{ wave: 1, enemies: [{ enemy_id: "mock_st_post", count: POSTS, interval: 0.3, path: "path_a" }] }],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_st_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps" || body.action === "get_enemies_config" || body.action === "get_heroes_config") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (j && j.status === 200) {
            if (body.action === "get_all_maps" && Array.isArray(j.maps)) j.maps = [...j.maps, ...extra.maps];
            if (body.action === "get_enemies_config" && Array.isArray(j.enemies)) j.enemies = [...j.enemies, ...extra.enemies];
            if (body.action === "get_heroes_config" && Array.isArray(j.heroes)) j.heroes = [...j.heroes.filter((h) => h.hero_id !== "zhu_ge_liang"), ...extra.heroes];
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
    const id = "st-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
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
      const zg = last ? last.team_list.find((t) => t.hero_id === "zhu_ge_liang") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: zg ? zg.skill ?? null : undefined, atk: zg ? zg.atk : undefined };
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
  const st = (s) => ((s || {}).hero_storm || {}).zhu_ge_liang || null;
  // 一次觀察：諸葛亮的呼風喚雨統計、六個木樁依生成序號排列的生命
  const fieldOf = (s) => {
    const d = st(s);
    const ids = Object.keys(s.enemy_hp || {}).sort((a, b) => (s.enemy_seq || {})[a] - (s.enemy_seq || {})[b]);
    return { d, hps: ids.map((k) => s.enemy_hp[k]), seqs: ids.map((k) => (s.enemy_seq || {})[k]), enemies: ids.length, frozen: s.world_frozen, ts: s.time_scale, state: s.game_state };
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
  // 一段觀察的統計：from 是六個木樁都出齊之後的一次觀察（之後每一次攻擊都打到 4 名）。
  // 這段期間：攻擊 n 次、範圍傷害 n 次、命中 4n；主目標被打掉 118n，序號 1～4 各 59n，序號 5 不變；
  // 這段期間的每一筆紀錄都是 base 118、first 118、序號 1～4、每一名 59、距離 0
  const windowIssues = (f, from) => {
    const d = f.d || { log: [] };
    const d0 = from.d || { attacks: 0, count: 0, hits: 0, dealt: 0 };
    const n = d.attacks - d0.attacks;
    const dc = d.count - d0.count;
    const dh = d.hits - d0.hits;
    const lost = f.hps.map((hp, i) => from.hps[i] - hp);
    const recent = d.log.slice(-Math.min(dc, d.log.length));
    const bad = recent.filter((x) => !(near(x.base, ATK) && near(x.first, ATK) && x.hits.length === 4 &&
      same(x.hits.map((h) => h.seq), [1, 2, 3, 4]) && x.hits.every((h) => near(h.amount, SPLASH) && near(h.dealt, SPLASH) && near(h.dist, 0, 1e-3)))).slice(0, 3);
    const ok = !!f.d && f.enemies === POSTS && n >= 3 && dc === n && dh === 4 * n && bad.length === 0 &&
      same(f.seqs, [0, 1, 2, 3, 4, 5]) && near(lost[0], ATK * n, 1e-6) && [1, 2, 3, 4].every((i) => near(lost[i], SPLASH * n, 1e-6)) && near(lost[5], 0) &&
      near(d.dealt - d0.dealt, 4 * SPLASH * n, 1e-6);
    return { attacks: n, count: dc, hits: dh, lost, bad, recent: recent.length, ok };
  };
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
      try { out[name + "_shot"] = await H.shot(page, `storm-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
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
    /技能：呼風喚雨/.test(t) && t.includes("普通攻擊打到敵人後，以它為中心 2 格內最多 4 名其他敵人各受攻擊傷害的 50%（目前 59）。主要目標不重複受傷，也不會再往外傳。");
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

  // ── 準備 ──
  let profile0 = null;
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, m }) => {
      localStorage.setItem("__shenma_st_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "風雨", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: m, heroes: [],
          team: [{ hero_id: "zhu_ge_liang", slot: 1 }] } },
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
    await page.waitForSelector('[role="dialog"] button[data-hero-id="zhu_ge_liang"]');
    const card = await page.locator('[role="dialog"] button[data-hero-id="zhu_ge_liang"]').innerText();
    await page.locator('[role="dialog"] button[data-hero-id="zhu_ge_liang"]').click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "storm-a-skill-detail") };
    run.check("A-1 主頁武將視窗：諸葛亮的卡片是「技能：呼風喚雨」；詳情是短版說明：以被打中的敵人為中心 2 格內最多 4 名其他敵人各受 50%（目前攻擊力 118 時 59）、主要目標不重複、不往外傳",
      /技能：呼風喚雨/.test(card) && RULES(detail), out.A_modal);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    // 鍵盤：聚焦諸葛亮的卡片、按 Enter 打開詳情
    await page.locator('button[data-hero-id="zhu_ge_liang"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="hero-skill-detail"]', { timeout: 15000 });
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：諸葛亮有「呼風喚雨」標籤（只有一個）；用鍵盤聚焦卡片按 Enter 打開詳情，顯示同樣的規則",
      tags.filter((t) => t === "技能：呼風喚雨").length === 1 && detail2 === detail, out.A_page);

    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const narrowPage = await measure();
    const narrowPageShot = await H.shot(page, "storm-a-narrow-heroes-page");
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const shortPage = await measure();
    const shortPageShot = await H.shot(page, "storm-a-short-heroes-page");
    await page.keyboard.press("Escape");
    await H.sleep(400);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="zhu_ge_liang"]');
    await page.locator('[role="dialog"] button[data-hero-id="zhu_ge_liang"]').click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "storm-a-narrow-modal");
    out.A_narrow = { narrowPage, shortPage, narrowModal, narrowPageShot, shortPageShot, narrowModalShot };
    run.check("A-3 窄畫面（390×844）與矮畫面（390×600）：武將頁與主頁武將視窗的呼風喚雨說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
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
    const c1 = await deploy(IFRAME, ZG_CELL[0], ZG_CELL[1], "諸葛亮");
    const recv = await received(IFRAME);
    const placed = await snapshot(IFRAME);
    const p0 = st(placed);
    out.B_payload = { c1, recv, st: p0 };
    run.check("B-1 規則 payload：用滑鼠點建築格 (3,4) 放諸葛亮（部署選單）；遊戲 iframe 收到的出征資料裡，諸葛亮的 skill 正好是 {id: storm, storm_radius: 2, storm_ratio: 0.5, storm_max_targets: 4}、攻擊力 118；Godot 讀到同樣的參數、還沒有攻擊與範圍傷害",
      !!c1 && c1.cell_x === ZG_CELL[0] && c1.cell_y === ZG_CELL[1] && recv.stage === MAP.id && same(recv.skill, SKILL) && recv.atk === ATK &&
        !!p0 && p0.radius === 2 && p0.ratio === 0.5 && p0.max_targets === 4 && p0.count === 0 && p0.hits === 0 && p0.attacks === 0 && p0.log.length === 0,
      out.B_payload);

    // 選取面板：點場上的諸葛亮 → 面板寫出呼風喚雨的規則（Godot 實際讀到的數值）；在 390×844 與 390×600 也在畫面內
    const hp = await cellPoint(IFRAME, ZG_CELL[0], ZG_CELL[1]);
    await page.mouse.click(hp.x, hp.y);
    await page.waitForSelector('[data-testid="unit-panel-storm"]', { timeout: 15000 });
    const note = await page.locator('[data-testid="unit-panel-storm"]').innerText();
    const boxAt = async (w, h) => {
      await page.setViewportSize({ width: w, height: h });
      await H.sleep(600);
      // 面板放不下時由面板自己捲動（utils/stageAnchor）：捲到說明後，說明整段要在面板看得到的範圍與畫面裡
      return page.evaluate(() => {
        const el = document.querySelector('[data-testid="unit-panel-storm"]');
        const panel = document.querySelector('[data-testid="unit-panel"]');
        if (!el || !panel) return null;
        el.scrollIntoView({ block: "nearest" });
        const b = el.getBoundingClientRect();
        const p = panel.getBoundingClientRect();
        return {
          left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), vw: window.innerWidth, vh: window.innerHeight,
          panelTop: Math.round(p.top), panelBottom: Math.round(p.bottom), panelScroll: panel.scrollHeight > panel.clientHeight,
          font: parseFloat(getComputedStyle(el).fontSize), docScroll: document.documentElement.scrollWidth,
        };
      });
    };
    const box = await boxAt(390, 844);
    const panelShot = await H.shot(page, "storm-b-unit-panel-390");
    const boxShort = await boxAt(390, 600);
    const panelShortShot = await H.shot(page, "storm-b-unit-panel-390x600");
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(400);
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await H.sleep(300);
    out.B_panel = { note, box, boxShort, panelShot, panelShortShot };
    const inside = (b) => !!b && b.left >= 0 && b.right <= b.vw && b.docScroll <= b.vw && b.font >= 12 &&
      b.top >= b.panelTop && b.bottom <= b.panelBottom + 1 && b.bottom <= b.vh;
    run.check("B-2 選取面板：點場上的諸葛亮，面板寫出「呼風喚雨：普通攻擊打到敵人後，以它為中心 2 格內最多 4 名其他敵人各受 50%（主要目標除外，不遞減）」；390×844 與 390×600 都在畫面寬度內，捲到說明後整段落在面板與畫面裡（矮畫面由面板自己捲動；截圖另存）",
      /呼風喚雨：普通攻擊打到敵人後，以它為中心 2 格內最多 4 名其他敵人各受 50%（主要目標除外，不遞減）/.test(note) && inside(box) && inside(boxShort),
      out.B_panel);

    await H.clickButton(page, "迎戰");
    // 1×：等到六個木樁都出現、開始有範圍傷害 → 之後再 3 次以上攻擊（每次都打到 4 名）、畫面上有風雨圈時暫停：效果停住、1 秒內攻擊與範圍傷害不變
    const w0 = await watch(IFRAME, (f) => !!f.d && f.enemies === POSTS && f.d.count >= 1, 120000);
    const a0 = w0.d ? w0.d.attacks : 0;
    const w1 = await watch(IFRAME, (f) => !!f.d && f.d.attacks >= a0 + 3 && f.d.fx >= 1, 60000);
    const paused = await setPaused(IFRAME, true);
    const atPause = fieldOf(await snapshot(IFRAME));
    const fieldShot = await H.shot(page, "storm-b-field-paused");
    // 放大出兵點附近（風雨圈的中心是被打中的木樁）
    const sp = await cellPoint(IFRAME, 6, ROW);
    const zoomShot = `${H.EVIDENCE}/storm-b-field-paused-zoom.png`;
    await page.screenshot({ path: zoomShot, clip: { x: Math.max(0, sp.x - 130), y: Math.max(0, sp.y - 130), width: 260, height: 260 } });
    await H.sleep(1000);
    const afterPause = fieldOf(await snapshot(IFRAME));
    const resumed = await setPaused(IFRAME, false);
    const s1 = windowIssues(atPause, w0);
    out.B_first = { w1: w1.d && { attacks: w1.d.attacks, count: w1.d.count, fx: w1.d.fx }, paused, atPause: { hps: atPause.hps, d: atPause.d && { attacks: atPause.d.attacks, count: atPause.d.count, hits: atPause.d.hits, fx: atPause.d.fx } },
      afterPause: { hps: afterPause.hps, d: afterPause.d && { attacks: afterPause.d.attacks, count: afterPause.d.count, fx: afterPause.d.fx } }, s1, fieldShot, zoomShot, resumed };
    run.check("B-3 主頁（1×）：六個木樁都在場後的 3 次以上攻擊每次都打到 4 名；主目標被打掉 118 × 攻擊次數，序號 1～4 各 59 × 次數，序號 5 不受傷（超過 4 名）；紀錄的每一名是 59、距離 0；暫停時風雨圈停住，1 秒內攻擊、範圍傷害與生命都不變",
      s1.ok && paused && atPause.frozen === true && !!afterPause.d && afterPause.d.attacks === atPause.d.attacks && afterPause.d.count === atPause.d.count &&
        same(afterPause.hps, atPause.hps) && afterPause.d.fx === atPause.d.fx && atPause.d.fx >= 1 && resumed,
      out.B_first);

    // 切到 2× 再觀察 4 次以上攻擊
    const a2 = atPause.d ? atPause.d.attacks : 0;
    const x2 = await clickSpeed(IFRAME, 2);
    const w3 = await watch(IFRAME, (f) => !!f.d && f.d.attacks >= a2 + 4, 90000);
    const s3 = windowIssues(w3, atPause);
    out.B_stats = { x2, s3, ts: w3.ts, log: (w3.d && w3.d.log || []).slice(-2), shot: await H.shot(page, "storm-b-field") };
    run.check("B-4 主頁切到 2× 後再 4 次以上攻擊：每次都打到 4 名，統計與六個木樁的生命照樣一致（快照只讀）",
      x2 && s3.ok && w3.d.attacks >= a2 + 4 && near(w3.ts, 2), out.B_stats);
  });

  // ── C. 獨立戰鬥頁（真的部署 UI，2×）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const c1 = await deploy(BIFRAME, ZG_CELL[0], ZG_CELL[1], "諸葛亮");
    const recv = await received(BIFRAME);
    const placed = await snapshot(BIFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const x2 = await clickSpeed(BIFRAME, 2);
    const w0 = await watch(BIFRAME, (f) => !!f.d && f.enemies === POSTS && f.d.count >= 1, 120000);
    const a0 = w0.d ? w0.d.attacks : 0;
    const w = await watch(BIFRAME, (f) => !!f.d && f.d.attacks >= a0 + 4, 90000);
    const s = windowIssues(w, w0);
    out.C = { c1, recv, st: st(placed) && { radius: st(placed).radius, ratio: st(placed).ratio, max_targets: st(placed).max_targets }, x2, stats: s, shot: await H.shot(page, "storm-c-battle-field") };
    run.check("C-1 獨立戰鬥頁：用部署選單放諸葛亮 (3,4)；iframe 收到的 skill 和主頁相同；2× 時每次攻擊都打到 4 名，統計與六個木樁的生命一致",
      !!c1 && recv.stage === MAP.id && same(recv.skill, SKILL) && !!st(placed) && st(placed).ratio === 0.5 && x2 && s.ok, out.C);
  });

  // ── D. 存檔與 session 不帶技能欄位、屬性與資源不變 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const d = await db();
    const p = d.profiles[KEY];
    const sess = await sessionRaw();
    const bad = /skill|storm|max_targets|chain|max_jumps|double_shot|chance|atk_down|atk_mult|tenacity|low_hp|damage_mult|counter|lifesteal|stun|def_aura|def_mult|slow_aura|slow_mult|sweep|burn|long_range|range_multiplier|first_attack/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null, logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或呼風喚雨欄位；隊伍仍只有 hero_id／slot，武將資料與金幣／經驗／等級／進度不變、沒有戰鬥紀錄",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_st_fixture")).catch(() => {});
  return run.finish({ out });
}
