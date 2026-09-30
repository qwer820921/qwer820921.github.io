async (page) => {
  // 劉備「防禦光環」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「光環：提升友軍防禦」沒有數值與範圍。
  // 遊戲的第一版設計：以劉備為中心、目前有效射程內（含邊界）的其他友軍武將防禦 × 1.2（受傷照原本的防禦公式計算）；不含自己、防禦塔；取最強不疊加；只在戰鬥中
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_defaura_fixture）：武將劉備（射程 1.5 格）與張飛（沒有技能、防禦 120、血量 99999），
  //   關卡「Mock DA 防禦光環」：直線路線（第 5 列），一個攻擊力 100、血量很多的地面兵
  // - A：技能說明（主頁的武將視窗、獨立的武將頁）：技能名稱「防禦光環」、提升 20%、目前的範圍半徑 1.5 格、不含自己、照防禦公式計算、取最強不疊加、
  //      只在戰場；沒有治療的字樣；390×844 說明在畫面寬度內、字級至少 12px
  // - B：主頁用部署選單把張飛放在道路 (4,5)（擋住敵人）、劉備放在建築格 (5,4)（距離 √2 格，在範圍內）：遊戲 iframe 收到的劉備 skill 正好是
  //      {id: def_aura, def_mult: 1.2}、張飛沒有 skill；備戰時光環還沒作用。開戰後張飛有劉備的加成（有效防禦 144），每擊實際扣 100 × 100 ÷ 244 ≈ 40.98；
  //      劉備自己沒有加成；在戰場點張飛，面板的防禦是「120 → 144」並說明不改存檔（390 寬度在畫面內）；
  //      把劉備移出隊伍（送出和隊伍視窗相同的 update_team）後張飛回到 1 倍、每擊 45.45，面板只剩 120
  // - C：獨立戰鬥頁（送部署選單的同一個 place_hero 訊息）：同樣每擊 40.98
  // - D：存檔、session 都沒有技能或防禦光環欄位，隊伍只有 hero_id／slot，武將的防禦沒有寫入
  // 全部 mock、虛構金鑰 test_defaura_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_defaura_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_8", name: "Mock DA 防禦光環" };
  const ALLY_CELL = [4, 5];
  const LIU_CELL = [5, 4];
  const RADIUS = 1.5;
  const DEF = 120; // 張飛 1 級的防禦（mock 的 base_def）
  const ATK = 100; // 敵人對阻路武將的攻擊力
  const HIT_PLAIN = (ATK * 100) / (DEF + 100);
  const HIT_AURA = (ATK * 100) / (DEF * 1.2 + 100);
  const SKILL = { id: "def_aura", def_mult: 1.2 };

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
      heroCfg("liu_bei", "劉備", "hero_liu_bei.webp", {}),
      heroCfg("zhang_fei", "張飛", "hero_zhang_fei.webp", { base_hp: 99999 }),
    ],
    enemies: [{ enemy_id: "mock_def_brute", name: "蠻兵", hp: 999999, speed: 60, atk: ATK, image: "enemy_grunt1.webp" }],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [{ wave: 1, enemies: [{ enemy_id: "mock_def_brute", count: 1, interval: 1.0, path: "path_a" }] }],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_defaura_fixture") === "1") {
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
    if (window.__defRecv) return;
    window.__defRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__defRecv.push(e.data);
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
    const id = "defa-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const received = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__defRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const find = (id) => (last ? last.team_list.find((t) => t.hero_id === id) : null);
      const liu = find("liu_bei");
      const zhang = find("zhang_fei");
      return {
        payloads: got.length, stage: last ? last.stage_id : null,
        liu: liu ? liu.skill ?? null : undefined, zhang: zhang ? ("skill" in zhang ? zhang.skill : "none") : undefined,
      };
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
  // 張飛被擋住的敵人攻擊：等到至少打了一下，之後在 sec 秒遊戲時間內，每一擊平均扣多少血（血量變化 ÷ 攻擊次數）
  const hits = async (sel, sec = 3.2) => {
    const end = Date.now() + 90000;
    let a = null;
    for (;;) {
      a = await snapshot(sel);
      const n = Object.values(a.enemy_blocker_attacks || {}).reduce((x, y) => x + y, 0);
      if (n >= 1) break;
      if (Date.now() > end) throw new Error("等不到敵人攻擊張飛");
      await H.sleep(200);
    }
    let b = a;
    const until = Date.now() + 60000;
    while (b.game_time - a.game_time < sec && Date.now() < until) {
      await H.sleep(400);
      b = await snapshot(sel);
    }
    const n0 = Object.values(a.enemy_blocker_attacks || {}).reduce((x, y) => x + y, 0);
    const n1 = Object.values(b.enemy_blocker_attacks || {}).reduce((x, y) => x + y, 0);
    const lost = (a.hero_hp || {}).zhang_fei - (b.hero_hp || {}).zhang_fei;
    const hd = b.hero_def || {};
    return {
      attacks: n1 - n0, lost: Math.round(lost * 10000) / 10000, per: n1 > n0 ? Math.round((lost / (n1 - n0)) * 10000) / 10000 : null,
      zhang: hd.zhang_fei ? { def: hd.zhang_fei.def, effective: Math.round(hd.zhang_fei.effective * 1000) / 1000, bonus: hd.zhang_fei.bonus, sources: Object.keys(hd.zhang_fei.sources || {}).length } : null,
      liu: hd.liu_bei ? { bonus: hd.liu_bei.bonus, aura_mult: hd.liu_bei.aura_mult, radius: hd.liu_bei.radius, active: hd.liu_bei.aura_active, buffed: hd.liu_bei.buffed } : null,
    };
  };
  // 在戰場點張飛：面板的防禦欄與說明
  const panelDef = async (sel) => {
    await clickCell(sel, ALLY_CELL[0], ALLY_CELL[1]);
    await page.waitForSelector('[data-testid="unit-panel-def"]', { timeout: 15000 });
    await H.sleep(300);
    return page.evaluate(() => {
      const v = document.querySelector('[data-testid="unit-panel-def"]');
      const note = document.querySelector('[data-testid="unit-panel-def-note"]');
      const panel = document.querySelector('[data-testid="unit-panel"]');
      const r = panel ? panel.getBoundingClientRect() : null;
      return {
        name: panel ? (panel.querySelector('[class*="unitName"]') || {}).innerText : null,
        text: v ? v.innerText.trim() : null, def: v ? Number(v.getAttribute("data-def")) : null, eff: v ? Number(v.getAttribute("data-def-effective")) : null,
        note: note ? note.innerText.trim() : null,
        inView: r ? r.left >= 0 && r.right <= window.innerWidth + 0.5 && r.top >= 0 && r.bottom <= window.innerHeight + 0.5 : false,
      };
    });
  };
  const closePanel = async () => {
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await H.sleep(300);
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `defaura-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };

  // ── 準備 ──
  let profile0 = null;
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k }) => {
      localStorage.setItem("__shenma_defaura_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "防禦光環", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter3_8", heroes: [], team: [{ hero_id: "liu_bei", slot: 1 }, { hero_id: "zhang_fei", slot: 2 }] } },
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
    const card = await page.locator('div[class*="heroCard"]', { has: page.locator('div[class*="heroName"]', { hasText: "劉備" }) }).first().innerText();
    const zhangCard = await page.locator('div[class*="heroCard"]', { has: page.locator('div[class*="heroName"]', { hasText: "張飛" }) }).first().innerText();
    await page.locator('div[class*="heroName"]', { hasText: "劉備" }).first().click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, zhangCard, detail, shot: await H.shot(page, "defaura-a-skill-detail") };
    run.check("A-1 主頁武將視窗：劉備的卡片是「技能：防禦光環」（張飛沒有技能）；詳情寫明其他友軍武將防禦力提升 20%、目前等級的範圍半徑 1.5 格（含邊界）、不含自己與防禦塔、照防禦公式計算（不是直接少扣 20%）、取最強不疊加、只在戰場；沒有治療",
      /技能：防禦光環/.test(card) && !/技能：/.test(zhangCard) && /其他友軍武將防禦力提升 20%/.test(detail) && /目前等級的範圍半徑是 1\.5 格/.test(detail) && /含邊界/.test(detail) &&
        /不含自己，防禦塔與城池不受影響/.test(detail) && /不是直接少扣 20% 的傷害/.test(detail) && /取最強的一個，不會疊加/.test(detail) && /只在戰場生效/.test(detail) && !/治療|恢復/.test(card + detail),
      out.A_modal);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('[data-testid="hero-skill-tag"]', { hasText: "防禦光環" }).first().click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：劉備有「防禦光環」標籤（mock 的四位加上劉備共五個技能標籤，張飛沒有），點開後顯示同樣的規則",
      tags.includes("技能：防禦光環") && tags.length === 5 && detail2 === detail, out.A_page);

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
    const narrowPageShot = await H.shot(page, "defaura-a-narrow-heroes-page");
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('div[class*="heroName"]');
    await page.locator('div[class*="heroName"]', { hasText: "劉備" }).first().click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "defaura-a-narrow-modal");
    out.A_narrow = { narrowPage, narrowModal, narrowPageShot, narrowModalShot };
    const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12 && m.docScroll <= m.vw;
    run.check("A-3 窄畫面（390×844）：武將頁與主頁武將視窗的防禦光環說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(narrowModal), out.A_narrow);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署選單放置張飛與劉備，實際觀察受傷與面板 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    await deploy(ALLY_CELL[0], ALLY_CELL[1], "張飛");
    await deploy(LIU_CELL[0], LIU_CELL[1], "劉備");
    const recv = await received(IFRAME);
    const placed = await snapshot(IFRAME);
    const hd0 = placed.hero_def || {};
    out.B_payload = { recv, liu: hd0.liu_bei || null, zhang: hd0.zhang_fei || null };
    run.check("B-1 規則 payload：遊戲 iframe 收到的出征資料裡，劉備的 skill 正好是 {id: def_aura, def_mult: 1.2}、張飛沒有 skill；Godot 快照讀到倍率 1.2、半徑 1.5，備戰時光環還沒作用、張飛沒有加成",
      recv.stage === MAP.id && same(recv.liu, SKILL) && recv.zhang === "none" && !!hd0.liu_bei && hd0.liu_bei.aura_mult === 1.2 && hd0.liu_bei.radius === RADIUS &&
        hd0.liu_bei.aura_active === false && !!hd0.zhang_fei && hd0.zhang_fei.bonus === 1 && hd0.zhang_fei.def === DEF,
      out.B_payload);
    await H.clickButton(page, "迎戰");
    const h1 = await hits(IFRAME);
    const shot1 = await H.shot(page, "defaura-b-main-field");
    out.B_aura = { ...h1, want: HIT_AURA, shot1 };
    run.check(`B-2 主頁實際受傷：張飛有劉備的加成（1.2、有效防禦 144、1 個來源），被攻擊力 100 的敵人每擊扣 ${HIT_AURA.toFixed(4)}（照防禦公式，不是少扣 20% 的 ${(HIT_PLAIN * 0.8).toFixed(2)}）；劉備自己沒有加成、光環作用中、只加成張飛`,
      h1.attacks >= 2 && near(h1.per, HIT_AURA) && !!h1.zhang && h1.zhang.bonus === 1.2 && near(h1.zhang.effective, 144) && h1.zhang.def === DEF && h1.zhang.sources === 1 &&
        !!h1.liu && h1.liu.bonus === 1 && h1.liu.active === true && same(h1.liu.buffed, ["zhang_fei"]),
      out.B_aura);

    const p1 = await panelDef(IFRAME);
    const panelShot = await H.shot(page, "defaura-b-panel");
    await closePanel();
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(800);
    const p390 = await panelDef(IFRAME);
    const panelShot390 = await H.shot(page, "defaura-b-panel-390");
    await closePanel();
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(800);
    out.B_panel = { p1, p390, panelShot, panelShot390 };
    run.check("B-3 在戰場點張飛：面板的防禦是「120 → 144」（原本與加成後分開列出），說明寫明防禦光環、只在範圍內、不改存檔；390×844 面板在畫面內",
      p1.name && /張飛/.test(p1.name) && p1.text === "120 → 144" && p1.def === DEF && near(p1.eff, 144) && /防禦光環/.test(p1.note || "") && /不改存檔/.test(p1.note || "") &&
        p390.text === "120 → 144" && p390.inView,
      out.B_panel);

    // 把劉備移出隊伍（隊伍視窗保存後送出的同一個 update_team），張飛的加成撤除
    await post(IFRAME, { type: "update_team", team_list: [{ hero_id: "zhang_fei", level: 1, star: 0, atk: 150, def: DEF, hp: 99999, slot: 2 }] });
    await H.sleep(600);
    const h2 = await hits(IFRAME);
    const p2 = await panelDef(IFRAME);
    await closePanel();
    out.B_removed = { ...h2, want: HIT_PLAIN, panel: p2 };
    run.check(`B-4 把劉備移出隊伍：張飛回到 1 倍（沒有來源、有效防禦 120），每擊扣 ${HIT_PLAIN.toFixed(4)}；面板的防禦只剩 120、沒有加成說明`,
      h2.attacks >= 2 && near(h2.per, HIT_PLAIN) && !!h2.zhang && h2.zhang.bonus === 1 && h2.zhang.sources === 0 && near(h2.zhang.effective, DEF) && h2.liu === null &&
        p2.text === "120" && p2.note === null,
      out.B_removed);
  });

  // ── C. 獨立戰鬥頁 ──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    // 畫布縮放和主頁不同，改送部署選單點選武將時送出的同一個 place_hero 訊息（實際點擊的部署流程已在 B 段驗證）
    await post(BIFRAME, { type: "place_hero", hero_id: "zhang_fei", cell_x: ALLY_CELL[0], cell_y: ALLY_CELL[1] });
    await post(BIFRAME, { type: "place_hero", hero_id: "liu_bei", cell_x: LIU_CELL[0], cell_y: LIU_CELL[1] });
    await H.sleep(500);
    const recv = await received(BIFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const h = await hits(BIFRAME);
    out.C = { recv, ...h, shot: await H.shot(page, "defaura-c-battle-field") };
    run.check(`C-1 獨立戰鬥頁：iframe 收到的劉備 skill 和主頁相同、張飛沒有 skill；張飛 1.2、有效防禦 144，每擊扣 ${HIT_AURA.toFixed(4)}；劉備自己沒有加成`,
      recv.stage === MAP.id && same(recv.liu, SKILL) && recv.zhang === "none" && h.attacks >= 2 && near(h.per, HIT_AURA) && !!h.zhang && h.zhang.bonus === 1.2 && !!h.liu && h.liu.bonus === 1,
      out.C);
  });

  // ── D. 存檔與 session 不帶技能欄位、防禦沒有寫入 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const d = await db();
    const p = d.profiles[KEY];
    const sess = await sessionRaw();
    const bad = /skill|def_aura|def_mult|def_effective|effective|slow_aura|slow_mult|sweep|burn|long_range|range_multiplier|first_attack/;
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHasSkill: bad.test(sess), logs: (d.battle_logs || []).length };
    run.check("D-1 存檔與 session 都沒有技能或防禦光環欄位；隊伍仍只有 hero_id／slot（劉備仍在隊伍裡：B 段只在遊戲裡移出），武將的防禦沒有寫入存檔，金幣／經驗／等級／進度不變、沒有戰鬥紀錄",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, profile0.team) && same(p.heroes, profile0.heroes) && p.gold === profile0.gold && p.exp === profile0.exp && p.level === profile0.level &&
        p.max_stage === profile0.max_stage && out.D.logs === 0,
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_defaura_fixture")).catch(() => {});
  return run.finish({ out });
}
