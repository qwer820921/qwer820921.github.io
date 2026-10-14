async (page) => {
  // 龐統「連環計」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「連環計：傳遞傷害」沒有寫範圍、比例與次數。
  // 遊戲的第一版設計：每次普通攻擊實際打到敵人後，從它被打中的位置找 1.5 格內最近、這次還沒打過的敵人受 50%，再從那個敵人的位置找下一個受 25%（最多 2 次）；只在戰場
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_ch_fixture）：龐統（pang_tong，法師、攻擊力 101、防禦 90、生命 813、射程 4 格、攻擊間隔 0.9 秒，和正式設定相同）、
  //   關卡「Mock CH 連環計」：直線路線（第 5 列），一波三個生命 99999、不會移動的木樁（都停在出兵點 (0,5)，彼此距離 0）
  // - 出征資料一律是正式的參數（chain 1.5 格、0.5、2 次）；只用快照觀察（不直接扣血）
  // - A：技能說明（主頁的武將視窗、獨立的武將頁）：技能名稱「連環計」、短版說明（只寫效果、目前的數值與主要例外，和整句比對）；390×844 在畫面寬度內、字級至少 12px
  // - B：主頁用部署選單把龐統放在建築格 (3,4)（真的部署 UI）：遊戲 iframe 收到的 skill 正好是 {id: chain, chain_radius: 1.5, chain_ratio: 0.5, chain_max_jumps: 2}；
  //      點選場上的龐統，選取面板寫出「最多傳遞 2 次（50%、再 25%）」與「1.5 格」；迎戰後三個木樁都在場時每次攻擊都傳 2 次（第一擊時可能只有一隻，那一擊不傳遞）：
  //      追加命中＝2 × 傳遞次數，木樁依生成序號被打掉 101 × 攻擊次數、50.5 與 25.25 × 傳遞次數；暫停時連線效果停住、1 秒沒有攻擊；切到 2× 照樣一致
  // - C：獨立戰鬥頁：同樣用部署選單放置，2× 時統計與生命一致
  // - D：存檔、session 都沒有技能或連環計欄位，隊伍只有 hero_id／slot，武將與資源不變、沒有戰鬥紀錄
  // 全部 mock、虛構金鑰 test_wx_*（不含被比對的字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_wx_p";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_9", name: "Mock CH 連環計" };
  const PT_CELL = [3, 4];
  const SKILL = { id: "chain", chain_radius: 1.5, chain_ratio: 0.5, chain_max_jumps: 2 };
  const ATK = 101;
  const POST_HP = 99999;
  const STEPS = [ATK, ATK * 0.5, ATK * 0.25];

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[0, ROW], [13, ROW]] }, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [
      {
        hero_id: "pang_tong", name: "龐統", rarity: "purple", cost: 5, job: "mage",
        base_atk: 101, base_def: 90, base_hp: 813, attack_range: 4, attack_speed: 0.9, upgrade_cost_base: 75,
        atk_growth: 10.1, def_growth: 9, hp_growth: 81.3, range_growth: 0.03, speed_growth: 0.01, image: "hero_pang_tong.webp",
      },
    ],
    enemies: [{ enemy_id: "mock_ch_post", name: "木樁", hp: POST_HP, speed: 0, image: "enemy_grunt1.webp" }],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [{ wave: 1, enemies: [{ enemy_id: "mock_ch_post", count: 3, interval: 0.3, path: "path_a" }] }],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_ch_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps" || body.action === "get_enemies_config" || body.action === "get_heroes_config") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (j && j.status === 200) {
            if (body.action === "get_all_maps" && Array.isArray(j.maps)) j.maps = [...j.maps, ...extra.maps];
            if (body.action === "get_enemies_config" && Array.isArray(j.enemies)) j.enemies = [...j.enemies, ...extra.enemies];
            if (body.action === "get_heroes_config" && Array.isArray(j.heroes)) j.heroes = [...j.heroes.filter((h) => h.hero_id !== "pang_tong"), ...extra.heroes];
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
    const id = "ch-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
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
      const pt = last ? last.team_list.find((t) => t.hero_id === "pang_tong") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: pt ? pt.skill ?? null : undefined, atk: pt ? pt.atk : undefined };
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
  const ch = (s) => ((s || {}).hero_chain || {}).pang_tong || null;
  // 一次觀察：龐統的連環計統計、三個木樁依生成序號排列的生命
  const fieldOf = (s) => {
    const d = ch(s);
    const ids = Object.keys(s.enemy_hp || {}).sort((a, b) => (s.enemy_seq || {})[a] - (s.enemy_seq || {})[b]);
    return { d, hps: ids.map((k) => s.enemy_hp[k]), enemies: ids.length, frozen: s.world_frozen, ts: s.time_scale, state: s.game_state };
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
  // 一段觀察的統計（木樁每 0.3 秒出一隻：第一擊時可能只有一隻，那一擊不傳遞，符合規則）：
  // 有傳遞的攻擊每次都傳 2 次（追加命中＝2 × 傳遞次數，傳遞次數不超過攻擊次數）；木樁依生成序號被打掉 101 × 攻擊次數、50.5 與 25.25 × 傳遞次數；
  // 實扣總量＝75.75 × 傳遞次數；紀錄每筆主攻擊 101、兩跳 50.5／25.25、序號 1 與 2。from 是較早的一次觀察時，另外要求這段期間的每一次攻擊都有傳遞（三隻都在場之後）
  const statIssues = (f, from = null) => {
    const d = f.d || { log: [] };
    const n = d.attacks;
    const lost = f.hps.map((hp) => POST_HP - hp);
    const bad = d.log.filter((x) => !(near(x.base, ATK) && near(x.first, ATK) && x.jumps.length === 2 &&
      x.jumps[0].seq === 1 && near(x.jumps[0].amount, STEPS[1]) && near(x.jumps[0].dealt, STEPS[1]) &&
      x.jumps[1].seq === 2 && near(x.jumps[1].amount, STEPS[2]) && near(x.jumps[1].dealt, STEPS[2]))).slice(0, 3);
    const dA = from && from.d ? n - from.d.attacks : null;
    const dC = from && from.d ? d.count - from.d.count : null;
    const windowOk = from === null || (dA >= 3 && dC === dA);
    const ok = !!f.d && f.enemies === 3 && n >= 1 && d.count >= 1 && d.count <= n && d.hits === 2 * d.count && bad.length === 0 &&
      near(lost[0], STEPS[0] * n, 1e-6) && near(lost[1], STEPS[1] * d.count, 1e-6) && near(lost[2], STEPS[2] * d.count, 1e-6) &&
      near(d.dealt, (STEPS[1] + STEPS[2]) * d.count, 1e-6) && d.log.length === Math.min(d.count, 40) && windowOk;
    return { attacks: n, count: d.count, hits: d.hits, dealt: d.dealt, lost, window: { attacks: dA, chained: dC }, bad, logN: d.log.length, ok };
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
      try { out[name + "_shot"] = await H.shot(page, `chain-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
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
    /技能：連環計/.test(t) && t.includes("普通攻擊打到敵人後，傷害傳給 1.5 格內最近、還沒被打過的敵人，最多 2 次，依序是攻擊傷害的 50%、25%（目前 50.5、25.25）；每次從上一個被傳到的敵人往外找。");

  // ── 準備 ──
  let profile0 = null;
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, m }) => {
      localStorage.setItem("__shenma_ch_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "連環", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: m, heroes: [],
          team: [{ hero_id: "pang_tong", slot: 1 }] } },
        battle_logs: [],
      }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, m: MAP.id });
    profile0 = (await db()).profiles[KEY];
    await page.setViewportSize({ width: 540, height: 900 });
  });

  // ── A. 技能說明（一般寬度與窄畫面）──
  await section("A", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="pang_tong"]');
    const card = await page.locator('[role="dialog"] button[data-hero-id="pang_tong"]').innerText();
    await page.locator('[role="dialog"] button[data-hero-id="pang_tong"]').click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "chain-a-skill-detail") };
    run.check("A-1 主頁武將視窗：龐統的卡片是「技能：連環計」；詳情是短版說明：傳給 1.5 格內最近、還沒被打過的敵人，最多 2 次、依序 50%、25%（目前攻擊力 101 時 50.5、25.25）、每次從上一個被傳到的敵人往外找",
      /技能：連環計/.test(card) && RULES(detail), out.A_modal);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('button[data-hero-id="pang_tong"]').click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：龐統有「連環計」標籤（只有一個），點開後顯示同樣的規則",
      tags.filter((t) => t === "技能：連環計").length === 1 && detail2 === detail, out.A_page);

    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(600);
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
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const narrowPage = await measure();
    const narrowPageShot = await H.shot(page, "chain-a-narrow-heroes-page");
    await page.keyboard.press("Escape");
    await H.sleep(400);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="pang_tong"]');
    await page.locator('[role="dialog"] button[data-hero-id="pang_tong"]').click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "chain-a-narrow-modal");
    out.A_narrow = { narrowPage, narrowModal, narrowPageShot, narrowModalShot };
    const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12 && m.docScroll <= m.vw;
    run.check("A-3 窄畫面（390×844）：武將頁與主頁武將視窗的連環計說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(narrowModal), out.A_narrow);
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
    const c1 = await deploy(IFRAME, PT_CELL[0], PT_CELL[1], "龐統");
    const recv = await received(IFRAME);
    const placed = await snapshot(IFRAME);
    const p0 = ch(placed);
    out.B_payload = { c1, recv, ch: p0 };
    run.check("B-1 規則 payload：用滑鼠點建築格 (3,4) 放龐統（部署選單）；遊戲 iframe 收到的出征資料裡，龐統的 skill 正好是 {id: chain, chain_radius: 1.5, chain_ratio: 0.5, chain_max_jumps: 2}、攻擊力 101；Godot 讀到同樣的參數、還沒有攻擊與傳遞",
      !!c1 && c1.cell_x === PT_CELL[0] && c1.cell_y === PT_CELL[1] && recv.stage === MAP.id && same(recv.skill, SKILL) && recv.atk === ATK &&
        !!p0 && p0.radius === 1.5 && p0.ratio === 0.5 && p0.max_jumps === 2 && p0.count === 0 && p0.hits === 0 && p0.attacks === 0 && p0.log.length === 0,
      out.B_payload);

    // 選取面板：點場上的龐統 → 面板寫出連環計的規則（Godot 實際讀到的數值）；在 390×844 也在畫面內
    const hp = await cellPoint(IFRAME, PT_CELL[0], PT_CELL[1]);
    await page.mouse.click(hp.x, hp.y);
    await page.waitForSelector('[data-testid="unit-panel-chain"]', { timeout: 15000 });
    const note = await page.locator('[data-testid="unit-panel-chain"]').innerText();
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(600);
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-chain"]');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), vw: window.innerWidth, font: parseFloat(getComputedStyle(el).fontSize), docScroll: document.documentElement.scrollWidth };
    });
    const panelShot = await H.shot(page, "chain-b-unit-panel-390");
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(400);
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await H.sleep(300);
    out.B_panel = { note, box, panelShot };
    run.check("B-2 選取面板：點場上的龐統，面板寫出「連環計：普通攻擊打到敵人後最多傳遞 2 次（50%、再 25%），每次從前一個被打中的敵人找 1.5 格內最近的下一個敵人」；390×844 在畫面寬度內（截圖另存）",
      /連環計：普通攻擊打到敵人後最多傳遞 2 次（50%、再 25%）/.test(note) && /每次從前一個被打中的敵人找 1\.5 格內最近的下一個敵人/.test(note) &&
        !!box && box.left >= 0 && box.right <= box.vw && box.docScroll <= box.vw,
      out.B_panel);

    await H.clickButton(page, "迎戰");
    // 1×：等到三個木樁都出現、開始傳遞 → 之後再 3 次以上攻擊（每次都要傳遞）、畫面上有連線效果時暫停：效果停住、1 秒內攻擊與傳遞不變
    const w0 = await watch(IFRAME, (f) => !!f.d && f.enemies === 3 && f.d.count >= 1, 120000);
    const a0 = w0.d ? w0.d.attacks : 0;
    const w1 = await watch(IFRAME, (f) => !!f.d && f.d.attacks >= a0 + 3 && f.d.fx >= 1, 60000);
    const paused = await setPaused(IFRAME, true);
    const atPause = fieldOf(await snapshot(IFRAME));
    const fieldShot = await H.shot(page, "chain-b-field-paused");
    await H.sleep(1000);
    const afterPause = fieldOf(await snapshot(IFRAME));
    const resumed = await setPaused(IFRAME, false);
    const s1 = statIssues(atPause, w0);
    out.B_first = { w1: w1.d && { attacks: w1.d.attacks, count: w1.d.count, fx: w1.d.fx }, paused, atPause: { hps: atPause.hps, d: atPause.d && { attacks: atPause.d.attacks, count: atPause.d.count, fx: atPause.d.fx } },
      afterPause: { hps: afterPause.hps, d: afterPause.d && { attacks: afterPause.d.attacks, count: afterPause.d.count, fx: afterPause.d.fx } }, s1, fieldShot, resumed };
    run.check("B-3 主頁（1×）：三個木樁都在場後的 3 次以上攻擊每次都傳 2 次；追加命中＝2 × 傳遞次數，木樁依序被打掉 101 × 攻擊次數、50.5 與 25.25 × 傳遞次數；暫停時連線效果停住，1 秒內攻擊、傳遞與生命都不變",
      s1.ok && paused && atPause.frozen === true && !!afterPause.d && afterPause.d.attacks === atPause.d.attacks && afterPause.d.count === atPause.d.count &&
        same(afterPause.hps, atPause.hps) && afterPause.d.fx === atPause.d.fx && resumed,
      out.B_first);

    // 切到 2× 再觀察 4 次以上攻擊
    const a2 = atPause.d ? atPause.d.attacks : 0;
    const x2 = await clickSpeed(IFRAME, 2);
    const w3 = await watch(IFRAME, (f) => !!f.d && f.d.attacks >= a2 + 4, 90000);
    const s3 = statIssues(w3, atPause);
    out.B_stats = { x2, s3, ts: w3.ts, log: (w3.d && w3.d.log || []).slice(-3), shot: await H.shot(page, "chain-b-field") };
    run.check("B-4 主頁切到 2× 後再 4 次以上攻擊：每次都傳 2 次，統計與三個木樁的生命照樣一致（快照只讀）",
      x2 && s3.ok && w3.d.attacks >= a2 + 4 && near(w3.ts, 2), out.B_stats);
  });

  // ── C. 獨立戰鬥頁（真的部署 UI，2×）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const c1 = await deploy(BIFRAME, PT_CELL[0], PT_CELL[1], "龐統");
    const recv = await received(BIFRAME);
    const placed = await snapshot(BIFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const x2 = await clickSpeed(BIFRAME, 2);
    const w0 = await watch(BIFRAME, (f) => !!f.d && f.enemies === 3 && f.d.count >= 1, 120000);
    const a0 = w0.d ? w0.d.attacks : 0;
    const w = await watch(BIFRAME, (f) => !!f.d && f.d.attacks >= a0 + 4, 90000);
    const s = statIssues(w, w0);
    out.C = { c1, recv, ch: ch(placed) && { radius: ch(placed).radius, ratio: ch(placed).ratio, max_jumps: ch(placed).max_jumps }, x2, stats: s, shot: await H.shot(page, "chain-c-battle-field") };
    run.check("C-1 獨立戰鬥頁：用部署選單放龐統 (3,4)；iframe 收到的 skill 和主頁相同；2× 時每次攻擊都傳 2 次，統計與三個木樁的生命一致",
      !!c1 && recv.stage === MAP.id && same(recv.skill, SKILL) && !!ch(placed) && ch(placed).ratio === 0.5 && x2 && s.ok, out.C);
  });

  // ── D. 存檔與 session 不帶技能欄位、屬性與資源不變 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const d = await db();
    const p = d.profiles[KEY];
    const sess = await sessionRaw();
    const bad = /skill|chain|max_jumps|double_shot|chance|atk_down|atk_mult|tenacity|low_hp|damage_mult|counter|lifesteal|stun|def_aura|def_mult|slow_aura|slow_mult|sweep|burn|long_range|range_multiplier|first_attack/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null, logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或連環計欄位；隊伍仍只有 hero_id／slot，武將資料與金幣／經驗／等級／進度不變、沒有戰鬥紀錄",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_ch_fixture")).catch(() => {});
  return run.finish({ out });
}
