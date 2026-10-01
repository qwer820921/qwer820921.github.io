async (page) => {
  // 張飛「暈眩」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「攻擊使敵人暈眩」沒有寫時間與疊加方式。
  // 遊戲的第一版設計：每次普通攻擊命中、目標還活著時暈眩 0.5 秒（不能移動、不能攻擊阻路的武將，照常受傷），再次命中刷新不累加，免疫減速的敵人也會暈眩
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_stun_fixture）：張飛（步兵、射程 1.5 格、攻擊間隔 1.5 秒、防禦 120、血量 99999）與劉備（射程 1.5 格），
  //   關卡「Mock ST 暈眩」：直線路線（第 5 列），一個攻擊力 100、血量很多、每秒 60 像素的地面兵
  // - A：技能說明（主頁的武將視窗、獨立的武將頁）：技能名稱「暈眩」、每次命中、0.5 秒、停止移動也不能攻擊、刷新不累加、免疫減速也會暈眩、只在戰場；
  //      390×844 說明在畫面寬度內、字級至少 12px
  // - B：主頁用部署選單把張飛放在道路 (4,5)（擋住敵人）、劉備放在建築格 (5,4)：遊戲 iframe 收到的張飛 skill 正好是 {id: stun, stun_sec: 0.5}、
  //      劉備是 {id: def_aura, def_mult: 1.2}。開戰後只用快照觀察（不注入暈眩）：張飛真的打中敵人並讓它暈眩，每段暈眩約 0.5 秒（差一步以內）、沒有重疊累加；
  //      敵人攻擊張飛的時間都不在暈眩區間裡，暈眩結束後照常攻擊；張飛同時受到劉備的防禦加成（144），每擊扣 40.98（張飛＋劉備的組合）；
  //      暈眩中的戰場截圖（黃色星星）；在戰場點張飛，面板的防禦是「120 → 144」並看得到選取時數值的說明（390 寬度在畫面內）
  // - C：獨立戰鬥頁（送部署選單的同一個 place_hero 訊息）：iframe 收到同樣的 skill；同樣暈眩、暈眩中不攻擊
  // - D：存檔、session 都沒有技能或暈眩欄位，隊伍只有 hero_id／slot
  // 全部 mock、虛構金鑰 test_st_*（不含 stun 字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_st_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_9", name: "Mock ST 暈眩" };
  const ZF_CELL = [4, 5];
  const LIU_CELL = [5, 4];
  const RADIUS = 1.5;
  const DEF = 120; // 張飛 1 級的防禦（mock 的 base_def）
  const ATK = 100; // 敵人對阻路武將的攻擊力
  const HIT_AURA = (ATK * 100) / (DEF * 1.2 + 100);
  const SKILL = { id: "stun", stun_sec: 0.5 };
  const LIU_SKILL = { id: "def_aura", def_mult: 1.2 };
  const STEP = 1 / 60 + 1e-6; // 暈眩長度容許差一個物理步進（1 倍速）

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[0, ROW], [13, ROW]] }, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const heroCfg = (hero_id, name, image, extra) => ({
    hero_id, name, rarity: "orange", cost: 8, job: "infantry",
    base_atk: 150, base_def: DEF, base_hp: 1500, attack_range: RADIUS, attack_speed: 1.2, upgrade_cost_base: 100,
    atk_growth: 10, def_growth: 8, hp_growth: 100, range_growth: 0, atk_spd_growth: 0, image, ...extra,
  });
  const EXTRA = {
    heroes: [
      heroCfg("zhang_fei", "張飛", "hero_zhang_fei.webp", { base_hp: 99999, attack_speed: 1.5 }),
      heroCfg("liu_bei", "劉備", "hero_liu_bei.webp", {}),
    ],
    enemies: [{ enemy_id: "mock_st_brute", name: "蠻兵", hp: 999999, speed: 60, atk: ATK, image: "enemy_grunt1.webp" }],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [{ wave: 1, enemies: [{ enemy_id: "mock_st_brute", count: 1, interval: 1.0, path: "path_a" }] }],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_stun_fixture") === "1") {
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
    if (window.__stunRecv) return;
    window.__stunRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__stunRecv.push(e.data);
    });
  });

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const near = (a, b, eps = 0.01) => typeof a === "number" && Math.abs(a - b) <= eps;
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const sessionRaw = () => page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const snapshot = async (sel) => {
    const id = "stun-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const received = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__stunRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const find = (id) => (last ? last.team_list.find((t) => t.hero_id === id) : null);
      const zhang = find("zhang_fei");
      const liu = find("liu_bei");
      return { payloads: got.length, stage: last ? last.stage_id : null, zhang: zhang ? zhang.skill ?? null : undefined, liu: liu ? liu.skill ?? null : undefined };
    }, sel);
  const post = (sel, msg) =>
    page.evaluate(([sel, msg]) => document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, ...msg }, "*"), [sel, msg]);
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
  const deploy = async (c, row, heroName) => {
    await clickCell(IFRAME, c, row);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    // 建築格的選單有「防禦塔／武將」分頁；道路格只能放武將，沒有分頁
    const tab = page.locator('[data-testid="placement-menu"] button[class*="tabBtn"]', { hasText: "武將" });
    if ((await tab.count()) > 0) await tab.click();
    await page.locator('button[class*="menuCard"]', { hasText: heroName }).click();
    await H.sleep(500);
  };
  // 只讀觀察：等到 sec 秒遊戲時間、至少 minStuns 段結束的暈眩與 minAttacks 次攻擊；回傳唯一敵人的暈眩紀錄、攻擊時間、張飛的暈眩次數與受傷
  const observe = async (sel, sec = 7, minStuns = 3, minAttacks = 3) => {
    const end = Date.now() + 120000;
    let a = null;
    for (;;) {
      a = await snapshot(sel);
      const n = Object.values(a.enemy_blocker_attacks || {}).reduce((x, y) => x + y, 0);
      if (n >= 1) break;
      if (Date.now() > end) throw new Error("等不到敵人攻擊張飛");
      await H.sleep(200);
    }
    let b = a;
    for (;;) {
      await H.sleep(400);
      b = await snapshot(sel);
      const st = Object.values(b.enemy_stun || {})[0] || { log: [], attacks: [] };
      const ended = st.log.filter((x) => x.to >= 0).length;
      if ((b.game_time - a.game_time >= sec && ended >= minStuns && st.attacks.length >= minAttacks) || Date.now() > end) break;
    }
    const ids = Object.keys(b.enemy_stun || {});
    const st = ids.length ? b.enemy_stun[ids[0]] : { log: [], attacks: [], count: 0 };
    const segs = st.log.map((x) => ({ from: Math.round(x.from * 10000) / 10000, to: Math.round(x.to * 10000) / 10000, len: x.to >= 0 ? Math.round((x.to - x.from) * 10000) / 10000 : null }));
    const inStun = st.attacks.filter((t) => st.log.some((x) => t > x.from + 1e-9 && (x.to < 0 || t <= x.to + 1e-9)));
    const afterStun = st.attacks.filter((t) => st.log.some((x) => x.to >= 0 && t > x.to));
    const n0 = Object.values(a.enemy_blocker_attacks || {}).reduce((x, y) => x + y, 0);
    const n1 = Object.values(b.enemy_blocker_attacks || {}).reduce((x, y) => x + y, 0);
    const lost = (a.hero_hp || {}).zhang_fei - (b.hero_hp || {}).zhang_fei;
    const hz = (b.hero_def || {}).zhang_fei;
    return {
      enemies: ids.length, count: st.count, segs: segs.slice(-8), ended: segs.filter((x) => x.len !== null).length,
      lensOk: segs.filter((x) => x.len !== null).every((x) => x.len >= 0.5 - 1e-6 && x.len <= 0.5 + STEP),
      attacks: st.attacks.length, inStun, afterStun: afterStun.length, heroStun: (b.hero_stun || {}).zhang_fei || null,
      per: n1 > n0 ? Math.round((lost / (n1 - n0)) * 10000) / 10000 : null, hits: n1 - n0,
      zhangDef: hz ? { def: hz.def, effective: Math.round(hz.effective * 1000) / 1000, bonus: hz.bonus } : null,
      enemyHp: Object.values(b.enemy_hp || {})[0],
    };
  };
  // 暈眩中的截圖（黃色星星）：等到唯一的敵人剩餘暈眩超過 0.25 秒時截圖
  const stunShot = async (sel, name) => {
    const end = Date.now() + 30000;
    while (Date.now() < end) {
      const s = await snapshot(sel);
      const st = Object.values(s.enemy_stun || {})[0];
      if (st && st.left > 0.25) return { left: st.left, shot: await H.shot(page, name) };
      await H.sleep(60);
    }
    return { left: null, shot: null };
  };
  const readPanel = () =>
    page.evaluate(() => {
      const v = document.querySelector('[data-testid="unit-panel-def"]');
      const snap = document.querySelector('[data-testid="unit-panel-snapshot-note"]');
      const panel = document.querySelector('[data-testid="unit-panel"]');
      const r = panel ? panel.getBoundingClientRect() : null;
      return {
        name: panel ? (panel.querySelector('[class*="unitName"]') || {}).innerText : null,
        text: v ? v.innerText.trim() : null, snap: snap ? snap.innerText.trim() : null,
        inView: r ? r.left >= 0 && r.right <= window.innerWidth + 0.5 && r.top >= 0 && r.bottom <= window.innerHeight + 0.5 : false,
        noOverflow: panel ? panel.scrollWidth <= panel.clientWidth + 1 && document.documentElement.scrollWidth <= window.innerWidth : false,
      };
    });
  const closePanel = async () => {
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await H.sleep(300);
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `stun-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };
  const STUN_RULES = (t) =>
    /技能：暈眩/.test(t) && /每次普通攻擊命中、而且敵人被打後還活著時，這個敵人暈眩 0\.5 秒/.test(t) && /停止移動，也不能攻擊擋住它的武將/.test(t) &&
    /刷新成 0\.5 秒，不會累加/.test(t) && /不會縮短/.test(t) && /免疫減速的敵人也會暈眩/.test(t) && /只在戰場生效，不影響存檔/.test(t);

  // ── 準備 ──
  let profile0 = null;
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k }) => {
      localStorage.setItem("__shenma_stun_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "暈眩", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter3_9", heroes: [], team: [{ hero_id: "zhang_fei", slot: 1 }, { hero_id: "liu_bei", slot: 2 }] } },
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
    const card = await page.locator('[data-hero-id][class*="heroCard"]', { has: page.locator('[class*="heroName"]', { hasText: "張飛" }) }).first().innerText();
    await page.locator('[class*="heroName"]', { hasText: "張飛" }).first().click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "stun-a-skill-detail") };
    run.check("A-1 主頁武將視窗：張飛的卡片是「技能：暈眩」；詳情寫明每次命中、目標還活著時暈眩 0.5 秒、停止移動也不能攻擊擋住它的武將、刷新成 0.5 秒不累加也不縮短、免疫減速也會暈眩、只在戰場不影響存檔",
      /技能：暈眩/.test(card) && STUN_RULES(detail), out.A_modal);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('[data-testid="hero-skill-tag"]', { hasText: "暈眩" }).first().click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：張飛有「暈眩」標籤（mock 的四位加上劉備、張飛共六個技能標籤），點開後顯示同樣的規則",
      tags.includes("技能：暈眩") && tags.includes("技能：防禦光環") && tags.length === 6 && detail2 === detail, out.A_page);

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
    const narrowPageShot = await H.shot(page, "stun-a-narrow-heroes-page");
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[class*="heroName"]');
    await page.locator('[class*="heroName"]', { hasText: "張飛" }).first().click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "stun-a-narrow-modal");
    out.A_narrow = { narrowPage, narrowModal, narrowPageShot, narrowModalShot };
    const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12 && m.docScroll <= m.vw;
    run.check("A-3 窄畫面（390×844）：武將頁與主頁武將視窗的暈眩說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(narrowModal), out.A_narrow);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署選單放置張飛與劉備，只用快照觀察暈眩與攻擊 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    await deploy(ZF_CELL[0], ZF_CELL[1], "張飛");
    await deploy(LIU_CELL[0], LIU_CELL[1], "劉備");
    const recv = await received(IFRAME);
    const placed = await snapshot(IFRAME);
    out.B_payload = { recv, heroStun: placed.hero_stun || null };
    run.check("B-1 規則 payload：遊戲 iframe 收到的出征資料裡，張飛的 skill 正好是 {id: stun, stun_sec: 0.5}、劉備是 {id: def_aura, def_mult: 1.2}；Godot 讀到張飛的暈眩 0.5 秒、備戰時還沒有暈眩過",
      recv.stage === MAP.id && same(recv.zhang, SKILL) && same(recv.liu, LIU_SKILL) && !!placed.hero_stun && !!placed.hero_stun.zhang_fei && placed.hero_stun.zhang_fei.sec === 0.5 && placed.hero_stun.zhang_fei.count === 0,
      out.B_payload);
    await H.clickButton(page, "迎戰");
    const ob = await observe(IFRAME);
    const shot = await stunShot(IFRAME, "stun-b-main-field-stunned");
    out.B_stun = { ...ob, want: HIT_AURA, shot };
    run.check(`B-2 主頁實際戰鬥（快照只讀）：張飛真的打中敵人並讓它暈眩（張飛與敵人的暈眩次數相同、至少 3 段結束），每段約 0.5 秒（差一步以內，沒有累加）；敵人攻擊張飛的時間都不在暈眩區間裡，暈眩結束後照常攻擊；張飛有劉備的加成（144），每擊扣 ${HIT_AURA.toFixed(4)}`,
      ob.enemies === 1 && ob.ended >= 3 && ob.lensOk && !!ob.heroStun && ob.heroStun.count === ob.count && ob.count >= 3 && ob.heroStun.sec === 0.5 &&
        ob.attacks >= 3 && ob.inStun.length === 0 && ob.afterStun >= 1 && ob.hits >= 2 && near(ob.per, HIT_AURA) &&
        !!ob.zhangDef && ob.zhangDef.bonus === 1.2 && near(ob.zhangDef.effective, 144),
      out.B_stun);

    await clickCell(IFRAME, ZF_CELL[0], ZF_CELL[1]);
    await page.waitForSelector('[data-testid="unit-panel-def"]', { timeout: 15000 });
    await H.sleep(300);
    const p1 = await readPanel();
    await closePanel();
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(800);
    await clickCell(IFRAME, ZF_CELL[0], ZF_CELL[1]);
    await page.waitForSelector('[data-testid="unit-panel-def"]', { timeout: 15000 });
    await H.sleep(300);
    const p390 = await readPanel();
    const panelShot390 = await H.shot(page, "stun-b-panel-390");
    await closePanel();
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(800);
    out.B_panel = { p1, p390, panelShot390 };
    run.check("B-3 在戰場點張飛：面板的防禦是「120 → 144」、看得到選取時數值的說明；390×844 面板在畫面內、沒有橫向溢出",
      /張飛/.test(p1.name || "") && p1.text === "120 → 144" && /選取時的數值/.test(p1.snap || "") && p390.text === "120 → 144" && /選取時的數值/.test(p390.snap || "") &&
        p390.inView && p390.noOverflow,
      out.B_panel);
  });

  // ── C. 獨立戰鬥頁 ──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    // 畫布縮放和主頁不同，改送部署選單點選武將時送出的同一個 place_hero 訊息（實際點擊的部署流程已在 B 段驗證）
    await post(BIFRAME, { type: "place_hero", hero_id: "zhang_fei", cell_x: ZF_CELL[0], cell_y: ZF_CELL[1] });
    await post(BIFRAME, { type: "place_hero", hero_id: "liu_bei", cell_x: LIU_CELL[0], cell_y: LIU_CELL[1] });
    await H.sleep(500);
    const recv = await received(BIFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const ob = await observe(BIFRAME, 5, 2, 2);
    out.C = { recv, ...ob, shot: await H.shot(page, "stun-c-battle-field") };
    run.check("C-1 獨立戰鬥頁：iframe 收到的張飛 skill 和主頁相同；張飛讓敵人暈眩（次數相同、至少 2 段結束、每段約 0.5 秒），敵人攻擊的時間都不在暈眩區間裡、暈眩結束後照常攻擊",
      recv.stage === MAP.id && same(recv.zhang, SKILL) && ob.enemies === 1 && ob.ended >= 2 && ob.lensOk && !!ob.heroStun && ob.heroStun.count === ob.count &&
        ob.attacks >= 2 && ob.inStun.length === 0 && ob.afterStun >= 1,
      out.C);
  });

  // ── D. 存檔與 session 不帶技能欄位 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const d = await db();
    const p = d.profiles[KEY];
    const sess = await sessionRaw();
    const bad = /skill|stun|def_aura|def_mult|def_effective|slow_aura|slow_mult|sweep|burn|long_range|range_multiplier|first_attack/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null, logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或暈眩欄位；隊伍仍只有 hero_id／slot，金幣／經驗／等級／進度不變、沒有戰鬥紀錄",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_stun_fixture")).catch(() => {});
  return run.finish({ out });
}
