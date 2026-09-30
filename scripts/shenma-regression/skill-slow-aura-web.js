async (page) => {
  // 關羽「減速光環」（瀏覽器，真 Godot 產物、mock 後端）：設定表的被動描述「周圍敵人減速10%」。
  // 遊戲的補充規則：以關羽為中心、目前有效射程內（含邊界）的地面敵人移動速度 × 0.9；飛行與免疫減速的敵人不受影響；和其他減速取最強
  // - 測試關（只在這支腳本加進 mock 名單，__shenma_aura_fixture）「Mock V 減速光環」：直線路線，同時出發的免疫減速的地面兵（第一組：兩個地面兵進度相同時關羽打先出現的它）、
  //   慢速地面兵、飛行兵
  // - A：技能說明（主頁的武將視窗、獨立的武將頁）：技能名稱「減速光環」、降低 10%、目前的範圍半徑（mock 關羽射程 1.5 格）、地面限制、
  //      飛行與免疫不受影響、取最強不疊加；沒有橫掃的字樣；390×844 說明在畫面寬度內、字級至少 12px
  // - B：主頁用部署選單把關羽放在道路旁的建築格 (6,4)（不擋路、沒有道路減速）：遊戲 iframe 收到的關羽 skill 正好是 {id: slow_aura, slow_mult: 0.9}，
  //      Godot 的快照讀到倍率 0.9、半徑 1.5；範圍內的地面兵有關羽的光環來源（0.9）、實際移動速度 24 × 0.9 ＝ 21.6（兩次快照的位置與遊戲時間換算），
  //      免疫減速的地面兵沒有來源、速度 24 但照樣受到關羽的普通攻擊（每擊 150，沒有橫掃）；飛行兵沒有來源、速度 24；光環範圍圈的截圖
  // - C：獨立戰鬥頁（送部署選單的同一個 place_hero 訊息）同樣有效
  // - D：存檔、session 都沒有技能欄位
  // 全部 mock、虛構金鑰 test_aura_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_aura_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_9", name: "Mock V 減速光環" };
  const CELL = [6, 4];
  const SPEED = 24;
  const ATK = 150; // harness 的 mock 關羽：base_atk 150
  const RADIUS = 1.5; // harness 的 mock 關羽：attack_range 1.5、沒有射程成長
  const SKILL = { id: "slow_aura", slow_mult: 0.9 };

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[0, ROW], [13, ROW]] }, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const grp = (enemy_id, count, interval) => ({ enemy_id, count, interval, path: "path_a" });
  const EXTRA = {
    enemies: [
      { enemy_id: "mock_aura_walk", name: "步卒", hp: 99999, speed: SPEED, image: "enemy_grunt1.webp" },
      { enemy_id: "mock_aura_imm", name: "鐵甲", hp: 99999, speed: SPEED, trait: "immune_slow", image: "enemy_siege1.webp" },
      { enemy_id: "mock_aura_fly", name: "飛鳶", hp: 99999, speed: SPEED, movement_type: "flying", image: "enemy_cavalry1.webp" },
    ],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [{ wave: 1, enemies: [grp("mock_aura_imm", 1, 1.0), grp("mock_aura_walk", 1, 1.0), grp("mock_aura_fly", 1, 1.0)] }],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_aura_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps" || body.action === "get_enemies_config") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (j && j.status === 200) {
            if (body.action === "get_all_maps" && Array.isArray(j.maps)) j.maps = [...j.maps, ...extra.maps];
            if (body.action === "get_enemies_config" && Array.isArray(j.enemies)) j.enemies = [...j.enemies, ...extra.enemies];
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
    if (window.__auraRecv) return;
    window.__auraRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__auraRecv.push(e.data);
    });
  });

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const sessionRaw = () => page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const snapshot = async (sel) => {
    const id = "aura-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const receivedSkill = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__auraRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const guan = last ? last.team_list.find((t) => t.hero_id === "guan_yu") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: guan ? guan.skill ?? null : null };
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
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `aura-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };
  // 三種敵人都在場上、地面兵走進光環範圍（離關羽不到 半徑 − 0.15 格）後，隔一段遊戲時間取兩次快照：
  // 每種敵人的光環來源、實際速度（快照的 enemy_speed）、兩次快照之間的位移 ÷ 遊戲時間、血量變化
  const observe = async (sel) => {
    const end = Date.now() + 90000;
    let a = null;
    let kinds = {};
    for (;;) {
      a = await snapshot(sel);
      kinds = a.enemy_kind || {};
      const walk = Object.keys(kinds).find((id) => kinds[id] === "mock_aura_walk");
      const d = walk ? ((a.hero_enemy_dist || {}).guan_yu || {})[walk] : undefined;
      if (Object.keys(kinds).length === 3 && typeof d === "number" && d < RADIUS - 0.15) break;
      if (Date.now() > end) throw new Error("等不到地面兵走進光環範圍");
      await H.sleep(150);
    }
    await H.sleep(1500);
    const b = await snapshot(sel);
    const dt = b.game_time - a.game_time;
    const hs = (b.hero_slow || {}).guan_yu || {};
    const per = {};
    for (const [id, kind] of Object.entries(kinds)) {
      const pa = (a.enemy_pos || {})[id];
      const pb = (b.enemy_pos || {})[id];
      const src = ((b.enemy_slow_src || {})[id]) || {};
      per[kind] = {
        dist: Math.round((((b.hero_enemy_dist || {}).guan_yu || {})[id] ?? -1) * 1000) / 1000,
        aura: src[hs.aura_source] ? src[hs.aura_source].mult : null,
        sources: Object.keys(src).length,
        speed: (b.enemy_speed || {})[id],
        moved: pa && pb ? Math.round((Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) / dt) * 100) / 100 : null,
        dmg: Math.round(((a.enemy_hp || {})[id] ?? 0) - ((b.enemy_hp || {})[id] ?? 0)),
        immune: (b.enemy_immune || {})[id],
        flying: (b.enemy_move || {})[id] === "flying",
      };
    }
    return { per, dt: Math.round(dt * 1000) / 1000, hero: hs, sweep: (b.hero_sweep || {}).guan_yu ?? null };
  };
  const effectOk = (o) =>
    !!o.per.mock_aura_walk && !!o.per.mock_aura_imm && !!o.per.mock_aura_fly &&
    o.per.mock_aura_walk.aura === 0.9 && o.per.mock_aura_walk.sources === 1 && Math.abs(o.per.mock_aura_walk.speed - SPEED * 0.9) < 0.001 &&
    Math.abs(o.per.mock_aura_walk.moved - SPEED * 0.9) < 0.4 &&
    o.per.mock_aura_imm.immune === true && o.per.mock_aura_imm.aura === null && o.per.mock_aura_imm.sources === 0 && Math.abs(o.per.mock_aura_imm.speed - SPEED) < 0.001 &&
    o.per.mock_aura_fly.flying && o.per.mock_aura_fly.aura === null && o.per.mock_aura_fly.sources === 0 && Math.abs(o.per.mock_aura_fly.speed - SPEED) < 0.001 &&
    o.hero.aura_mult === 0.9 && o.hero.radius === RADIUS && o.hero.aura_active === true && o.sweep === null;

  // ── 準備 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k }) => {
      localStorage.setItem("__shenma_aura_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "減速光環", level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter3_9", heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }] } },
        battle_logs: [],
      }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY });
    await page.setViewportSize({ width: 540, height: 900 });
  });

  // ── A. 技能說明（一般寬度與窄畫面）──
  await section("A", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('div[class*="heroName"]');
    const card = await page.locator('div[class*="heroCard"]', { has: page.locator('div[class*="heroName"]', { hasText: "關羽" }) }).first().innerText();
    await page.locator('div[class*="heroName"]', { hasText: "關羽" }).first().click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "aura-a-skill-detail") };
    run.check("A-1 主頁武將視窗：關羽的卡片是「技能：減速光環」；詳情寫明移動速度降低 10%（變成原本的 90%）、目前等級的範圍半徑 1.5 格（含邊界）、所有地面敵人、飛行與免疫減速的敵人不受影響、取最強不疊加；沒有橫掃",
      /技能：減速光環/.test(card) && /移動速度降低 10%（變成原本的 90%）/.test(detail) && /目前等級的範圍半徑是 1\.5 格/.test(detail) && /含邊界/.test(detail) &&
        /所有地面敵人/.test(detail) && /飛行敵人與免疫減速的敵人不受影響/.test(detail) && /取最強的一個，不會疊加/.test(detail) && !/橫掃/.test(card + detail),
      out.A_modal);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('[data-testid="hero-skill-tag"]', { hasText: "減速光環" }).first().click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：關羽有「減速光環」標籤（mock 的四位各一個技能，沒有橫掃），點開後顯示同樣的規則",
      tags.includes("技能：減速光環") && tags.length === 4 && !tags.some((t) => /橫掃/.test(t)) && detail2 === detail, out.A_page);

    // 窄畫面：說明不溢出（沒有橫向捲動、在畫面寬度內）、字級至少 12px
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
    const narrowPageShot = await H.shot(page, "aura-a-narrow-heroes-page");
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('div[class*="heroName"]');
    await page.locator('div[class*="heroName"]', { hasText: "關羽" }).first().click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "aura-a-narrow-modal");
    out.A_narrow = { narrowPage, narrowModal, narrowPageShot, narrowModalShot };
    const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12 && m.docScroll <= m.vw;
    run.check("A-3 窄畫面（390×844）：武將頁與主頁武將視窗的減速光環說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(narrowModal), out.A_narrow);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署選單放置關羽、實際觀察減速與普通攻擊 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    await clickCell(IFRAME, CELL[0], CELL[1]);
    await page.waitForSelector("text=建築位部署", { timeout: 15000 });
    await page.locator('button[class*="tabBtn"]', { hasText: "武將" }).click();
    await page.locator('button[class*="menuCard"]', { hasText: "關羽" }).click();
    await H.sleep(500);
    const recv = await receivedSkill(IFRAME);
    const placed = await snapshot(IFRAME);
    const hs0 = (placed.hero_slow || {}).guan_yu || null;
    out.B_payload = { recv, godot: hs0 };
    run.check("B-1 規則 payload：遊戲 iframe 收到的出征資料裡，關羽的 skill 正好是 {id: slow_aura, slow_mult: 0.9}（沒有橫掃欄位）；Godot 快照讀到倍率 0.9、半徑 1.5，備戰時光環還沒作用",
      recv.stage === MAP.id && same(recv.skill, SKILL) && !!hs0 && hs0.aura_mult === 0.9 && hs0.radius === RADIUS && hs0.aura_active === false,
      out.B_payload);
    await H.clickButton(page, "迎戰");
    const o = await observe(IFRAME);
    out.B = { ...o, shot: await H.shot(page, "aura-b-main-field") };
    run.check("B-2 主頁實際效果：範圍內的地面兵只有關羽的光環（0.9）、實際速度 21.6（快照與兩次快照的位移都是）；免疫減速的地面兵沒有來源、速度 24；飛行兵沒有來源、速度 24；Godot 的光環作用中、半徑 1.5、沒有橫掃（截圖有範圍圈）",
      effectOk(o), out.B);
    run.check("B-3 普通攻擊照舊：免疫減速的地面兵沒有光環但照樣受到關羽的普通攻擊（每擊 150）；旁邊的普通地面兵沒有橫掃的 75（傷害只會是 150 的倍數），飛行兵（步兵打不到）沒有受傷",
      o.per.mock_aura_imm.dmg > 0 && [o.per.mock_aura_walk.dmg, o.per.mock_aura_imm.dmg].every((d) => d % ATK === 0) && o.per.mock_aura_fly.dmg === 0,
      { dmg: { walk: o.per.mock_aura_walk.dmg, imm: o.per.mock_aura_imm.dmg, fly: o.per.mock_aura_fly.dmg } });
  });

  // ── C. 獨立戰鬥頁 ──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    // 畫布縮放和主頁不同，改送部署選單點選武將時送出的同一個 place_hero 訊息（實際點擊的部署流程已在 B 段驗證）
    await page.evaluate(([sel, c, r]) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "place_hero", hero_id: "guan_yu", cell_x: c, cell_y: r }, "*");
    }, [BIFRAME, CELL[0], CELL[1]]);
    await H.sleep(500);
    const recv = await receivedSkill(BIFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const o = await observe(BIFRAME);
    out.C = { recv, ...o, shot: await H.shot(page, "aura-c-battle-field") };
    run.check("C-1 獨立戰鬥頁：iframe 收到的關羽 skill 和主頁相同；範圍內的地面兵 0.9、速度 21.6，免疫減速與飛行的不受影響，免疫減速的照樣受到普通攻擊（每擊 150）",
      recv.stage === MAP.id && same(recv.skill, SKILL) && effectOk(o) && o.per.mock_aura_imm.dmg > 0 && [o.per.mock_aura_walk.dmg, o.per.mock_aura_imm.dmg].every((d) => d % ATK === 0),
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
    const bad = /skill|slow_aura|slow_mult|sweep|burn|long_range|range_multiplier|first_attack/;
    out.D = { profileKeys: Object.keys(p), team: p.team, sessionHasSkill: bad.test(sess) };
    run.check("D-1 存檔與 session 都沒有技能或減速光環欄位；隊伍仍只有 hero_id／slot",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]'),
      out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_aura_fixture")).catch(() => {});
  return run.finish({ out });
}
