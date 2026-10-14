async (page) => {
  // 孫尚香「連射」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「連射：有機率二次攻擊」沒有寫機率、倍率與時序。
  // 遊戲的第一版設計：每次普通攻擊實際打到敵人、敵人被打過後還活著時，20% 的機率在同一次攻擊對同一個敵人再打一擊（這次攻擊力的 100%）；只在戰場
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_ds_fixture）：孫尚香（sun_shang_xiang，弓兵、攻擊力 92、防禦 81、生命 882、射程 5 格、
  //   攻擊間隔 2.2 秒，和正式設定相同）、關卡「Mock DS 連射」：直線路線（第 5 列），一波一個生命 99999、不會移動的木樁（停在出兵點 (0,5)）
  // - 出征資料一律是正式的參數（double_shot_chance 0.2），Godot 用真正的亂數：只用快照觀察（不設定替身、不直接扣血）
  // - A：技能說明（主頁的武將視窗、獨立的武將頁）：技能名稱「連射」、短版說明（只寫效果、目前的數值與主要例外，和整句比對）；390×844 說明在畫面寬度內、字級至少 12px
  // - B：主頁用部署選單把孫尚香放在建築格 (3,4)（真的部署 UI）：遊戲 iframe 收到的 skill 正好是 {id: double_shot, double_shot_chance: 0.2}；
  //      迎戰後觀察到至少一次追加與一次沒有追加的攻擊（時限內，逾時就失敗並保留證據）：抽亂數次數＝攻擊次數、紀錄的 u < 0.2 才追加、
  //      第一擊 92、追加 92；木樁被打掉的生命＝92 ×（攻擊次數＋追加次數）；追加後立刻暫停，390×844 截圖裡有金色的「+1」；
  //      暫停 1 秒沒有攻擊與抽亂數；切到 2× 後照樣每次攻擊抽一次
  // - C：獨立戰鬥頁：同樣用部署選單放置，2× 觀察到追加與沒有追加的攻擊，統計與生命一致
  // - D：存檔、session 都沒有技能或連射欄位，隊伍只有 hero_id／slot，武將與資源不變、沒有戰鬥紀錄
  // 全部 mock、虛構金鑰 test_wx_*（不含被比對的字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_wx_s";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_10", name: "Mock DS 連射" };
  const SS_CELL = [3, 4];
  const SKILL = { id: "double_shot", double_shot_chance: 0.2 };
  const ATK = 92;
  const POST_HP = 99999;

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[0, ROW], [13, ROW]] }, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [
      {
        hero_id: "sun_shang_xiang", name: "孫尚香", rarity: "purple", cost: 6, job: "archer",
        base_atk: 92, base_def: 81, base_hp: 882, attack_range: 5, attack_speed: 2.2, upgrade_cost_base: 75,
        atk_growth: 9.2, def_growth: 8.1, hp_growth: 88.2, range_growth: 0.03, speed_growth: 0.01, image: "hero_sun_shang_xiang.webp",
      },
    ],
    enemies: [{ enemy_id: "mock_ds_post", name: "木樁", hp: POST_HP, speed: 0, image: "enemy_grunt1.webp" }],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [{ wave: 1, enemies: [{ enemy_id: "mock_ds_post", count: 1, interval: 1.0, path: "path_a" }] }],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_ds_fixture") === "1") {
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
    const id = "ds-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
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
      const ss = last ? last.team_list.find((t) => t.hero_id === "sun_shang_xiang") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: ss ? ss.skill ?? null : undefined };
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
  const ds = (s) => ((s || {}).hero_double_shot || {}).sun_shang_xiang || null;
  // 一次觀察：孫尚香的連射統計、木樁的生命（場上唯一的敵人）
  const fieldOf = (s) => {
    const d = ds(s);
    const ids = Object.keys(s.enemy_hp || {});
    return { d, postHp: ids.length === 1 ? s.enemy_hp[ids[0]] : null, enemies: ids.length, texts: s.double_shot_texts, frozen: s.world_frozen, ts: s.time_scale, state: s.game_state };
  };
  // 只讀觀察：等到 until(f) 成立或逾時，回傳最後一次的觀察
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
  const singles = (d) => (d ? d.rolls - d.count : 0);
  // 一段觀察的統計：抽亂數＝攻擊次數；最近的紀錄每筆第一擊 92、u < 0.2 才追加且追加 92；木樁被打掉的生命＝92 ×（攻擊＋追加）；追加總量＝92 × 追加次數
  const statIssues = (f) => {
    const d = f.d || { log: [] };
    const bad = d.log.filter((x) => !(near(x.first, ATK) && x.hit === (x.u >= 0 && x.u < 0.2) && near(x.second, x.hit ? ATK : 0))).slice(0, 3);
    const lost = POST_HP - f.postHp;
    const ok = !!f.d && d.rolls === d.attacks && bad.length === 0 && near(lost, ATK * (d.attacks + d.count), 1e-6) && near(d.dealt, ATK * d.count, 1e-6) &&
      d.log.length === Math.min(d.rolls, 40) && d.log.filter((x) => x.hit).length <= d.count;
    return { rolls: d.rolls, attacks: d.attacks, count: d.count, dealt: d.dealt, lost, expected: ATK * (d.attacks + d.count), bad, logN: d.log.length, ok };
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
      try { out[name + "_shot"] = await H.shot(page, `double-shot-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
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
    /技能：連射/.test(t) && t.includes("普通攻擊命中、敵人還活著時，有 20% 機率對同一個敵人再打一擊（攻擊力的 100%，目前 92）。追加的一擊不會再連射，攻擊間隔不變。");

  // ── 準備 ──
  let profile0 = null;
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k }) => {
      localStorage.setItem("__shenma_ds_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "連射", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter3_10", heroes: [],
          team: [{ hero_id: "sun_shang_xiang", slot: 1 }] } },
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
    await page.waitForSelector('[role="dialog"] button[data-hero-id="sun_shang_xiang"]');
    const card = await page.locator('[role="dialog"] button[data-hero-id="sun_shang_xiang"]').innerText();
    await page.locator('[role="dialog"] button[data-hero-id="sun_shang_xiang"]').click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "double-shot-a-skill-detail") };
    run.check("A-1 主頁武將視窗：孫尚香的卡片是「技能：連射」；詳情是短版說明：命中且敵人還活著時 20% 機率對同一個敵人再打一擊（攻擊力的 100%，目前 92）、不再連射、攻擊間隔不變",
      /技能：連射/.test(card) && RULES(detail), out.A_modal);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('button[data-hero-id="sun_shang_xiang"]').click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：孫尚香有「連射」標籤（只有一個），點開後顯示同樣的規則",
      tags.filter((t) => t === "技能：連射").length === 1 && detail2 === detail, out.A_page);

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
    const narrowPageShot = await H.shot(page, "double-shot-a-narrow-heroes-page");
    await page.keyboard.press("Escape");
    await H.sleep(400);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="sun_shang_xiang"]');
    await page.locator('[role="dialog"] button[data-hero-id="sun_shang_xiang"]').click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "double-shot-a-narrow-modal");
    out.A_narrow = { narrowPage, narrowModal, narrowPageShot, narrowModalShot };
    const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12 && m.docScroll <= m.vw;
    run.check("A-3 窄畫面（390×844）：武將頁與主頁武將視窗的連射說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(narrowModal), out.A_narrow);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署選單放置、只用快照觀察 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    const c1 = await deploy(IFRAME, SS_CELL[0], SS_CELL[1], "孫尚香");
    const recv = await received(IFRAME);
    const placed = await snapshot(IFRAME);
    const p0 = ds(placed);
    out.B_payload = { c1, recv, ds: p0 };
    run.check("B-1 規則 payload：用滑鼠點建築格 (3,4) 放孫尚香（部署選單）；遊戲 iframe 收到的出征資料裡，孫尚香的 skill 正好是 {id: double_shot, double_shot_chance: 0.2}；Godot 讀到 0.2、還沒有攻擊與抽亂數",
      !!c1 && c1.cell_x === SS_CELL[0] && c1.cell_y === SS_CELL[1] && recv.stage === MAP.id && same(recv.skill, SKILL) &&
        !!p0 && p0.chance === 0.2 && p0.rolls === 0 && p0.count === 0 && p0.attacks === 0 && p0.log.length === 0,
      out.B_payload);
    await H.clickButton(page, "迎戰");

    // 1×：等第一次追加，立刻暫停（「+1」照遊戲時間淡出，暫停時停住）→ 390×844 截圖；暫停 1 秒沒有攻擊與抽亂數
    const w1 = await watch(IFRAME, (f) => !!f.d && f.d.count >= 1, 150000);
    const paused = await setPaused(IFRAME, true);
    const atPause = fieldOf(await snapshot(IFRAME));
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(1000);
    const narrow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    const shot390 = await H.shot(page, "double-shot-b-field-390");
    const afterPause = fieldOf(await snapshot(IFRAME));
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(600);
    const resumed = await setPaused(IFRAME, false);
    out.B_first = { firstDouble: w1.d && { rolls: w1.d.rolls, count: w1.d.count, attacks: w1.d.attacks }, paused, atPause: { ...atPause, d: atPause.d && { rolls: atPause.d.rolls, count: atPause.d.count, attacks: atPause.d.attacks } },
      afterPause: { ...afterPause, d: afterPause.d && { rolls: afterPause.d.rolls, count: afterPause.d.count, attacks: afterPause.d.attacks } }, narrow, shot390, resumed };
    run.check("B-2 主頁（1×、真正的亂數）：時限內出現追加；追加後立刻暫停，畫面上有金色的「+1」（快照的連射提示數 ≥ 1），暫停 1 秒以上攻擊與抽亂數都不變；390×844 沒有橫向溢出（截圖另存）",
      !!w1.d && w1.d.count >= 1 && paused && atPause.frozen === true && atPause.texts >= 1 && !!afterPause.d && !!atPause.d &&
        afterPause.d.rolls === atPause.d.rolls && afterPause.d.attacks === atPause.d.attacks && afterPause.frozen === true && narrow && resumed,
      out.B_first);

    // 繼續觀察到也有沒有追加的攻擊（至少 8 次攻擊），再切到 2× 觀察 4 次以上攻擊
    const w2 = await watch(IFRAME, (f) => !!f.d && f.d.count >= 1 && singles(f.d) >= 1 && f.d.attacks >= 8, 150000);
    const s2 = statIssues(w2);
    const x2 = await clickSpeed(IFRAME, 2);
    const a2 = w2.d ? w2.d.attacks : 0;
    const w3 = await watch(IFRAME, (f) => !!f.d && f.d.attacks >= a2 + 4, 90000);
    const s3 = statIssues(w3);
    out.B_stats = { s2, x2, s3, ts: w3.ts, log: (w3.d && w3.d.log || []).slice(-6), shot: await H.shot(page, "double-shot-b-field") };
    run.check("B-3 主頁統計（快照只讀）：觀察到追加與沒有追加的攻擊；抽亂數次數＝攻擊次數；紀錄每筆第一擊 92、u < 0.2 才追加且追加 92；木樁被打掉的生命＝92 ×（攻擊＋追加）、追加總量＝92 × 追加次數；切到 2× 後再 4 次以上攻擊照樣一致",
      w2.d.count >= 1 && singles(w2.d) >= 1 && s2.ok && x2 && s3.ok && w3.d.attacks >= a2 + 4 && near(w3.ts, 2),
      out.B_stats);
  });

  // ── C. 獨立戰鬥頁（真的部署 UI，2×）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const c1 = await deploy(BIFRAME, SS_CELL[0], SS_CELL[1], "孫尚香");
    const recv = await received(BIFRAME);
    const placed = await snapshot(BIFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const x2 = await clickSpeed(BIFRAME, 2);
    const w = await watch(BIFRAME, (f) => !!f.d && f.d.count >= 1 && singles(f.d) >= 1 && f.d.attacks >= 6, 150000);
    const s = statIssues(w);
    out.C = { c1, recv, ds: ds(placed) && { chance: ds(placed).chance, rolls: ds(placed).rolls }, x2, stats: s, shot: await H.shot(page, "double-shot-c-battle-field") };
    run.check("C-1 獨立戰鬥頁：用部署選單放孫尚香 (3,4)；iframe 收到的 skill 和主頁相同；2× 時觀察到追加與沒有追加的攻擊，抽亂數＝攻擊次數、紀錄與木樁被打掉的生命一致",
      !!c1 && recv.stage === MAP.id && same(recv.skill, SKILL) && !!ds(placed) && ds(placed).chance === 0.2 && x2 &&
        w.d.count >= 1 && singles(w.d) >= 1 && s.ok,
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
    const bad = /skill|double_shot|chance|atk_down|atk_mult|tenacity|low_hp|damage_mult|counter|lifesteal|stun|def_aura|def_mult|slow_aura|slow_mult|sweep|burn|long_range|range_multiplier|first_attack/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null, logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或連射欄位；隊伍仍只有 hero_id／slot，武將資料與金幣／經驗／等級／進度不變、沒有戰鬥紀錄",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_ds_fixture")).catch(() => {});
  return run.finish({ out });
}
