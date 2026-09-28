async (page) => {
  // R15（瀏覽器）：周瑜「火攻」（每次有效普通攻擊附加 3 跳灼燒，每跳＝命中時攻擊力 × 20%，間隔 1 秒）
  // - 技能說明：主頁的武將視窗、獨立的武將頁；詳情寫出目前攻擊力下每次灼燒的傷害
  // - 主頁用部署選單實際放置周瑜（建築格 (1,4)，出生點 (0,5) 的敵人一出現就在射程內），開戰後用唯讀快照追蹤敵人血量：
  //   普通攻擊一擊＝攻擊力（122）、跳傷＝24.4（同一次快照兩者都有時是 146.4），沒有疊加成 48.8 的跳傷；
  //   敵人走出射程（4 格）後仍再跳 3 次，之後停止；快照的 enemy_burn 顯示灼燒狀態，截圖看得到橘色外圈
  // - 獨立戰鬥頁（送部署選單的同一個 place_hero 訊息；畫布縮放不同）同樣有效
  // - 存檔、session 都沒有技能或灼燒欄位；預設隊伍不變（這裡自己設定只有周瑜的隊伍）
  // 全部 mock、虛構金鑰 test_r15_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const A = "test_r15_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const CELL = [1, 4];
  const ATK = 122; // harness 的 mock 周瑜：base_atk 和正式設定相同
  const TICK = 24.4; // 122 × 20%
  const RANGE = 4;
  const near = (a, b, eps = 0.011) => typeof a === "number" && Math.abs(a - b) < eps;

  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const sessionRaw = () => page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const snapshot = async (sel) => {
    const id = "r15-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
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
  const dismissSplash = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r15-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有 Modal 可關 */ }
    }
  };
  // 追蹤第一個敵人：每次快照的血量下降分成普通攻擊（ATK）與跳傷（TICK）；走出射程後再追蹤 afterSec 秒
  const trackBurn = async (sel, afterSec = 4.5, timeoutMs = 90000) => {
    const rows = [];
    let target = null;
    let lastHp = null;
    let exitAt = null;
    let shot = null;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      const s = await snapshot(sel);
      const ids = Object.keys(s.enemy_hp || {});
      if (target === null && ids.length > 0) target = ids[0];
      if (target !== null) {
        if (!(target in (s.enemy_hp || {}))) break; // 敵人消失（不應發生：血厚、慢）
        const hp = s.enemy_hp[target];
        const dist = ((s.hero_enemy_dist || {}).zhou_yu || {})[target];
        const burn = (s.enemy_burn || {})[target] || null;
        const drop = lastHp === null ? 0 : Math.round((lastHp - hp) * 100) / 100;
        rows.push({ t: (Date.now() - t0) / 1000, hp, dist: typeof dist === "number" ? Math.round(dist * 1000) / 1000 : null, drop, burn });
        lastHp = hp;
        if (burn && shot === null) shot = await H.shot(page, "r15-burning-" + (sel === IFRAME ? "main" : "battle"));
        if (exitAt === null && typeof dist === "number" && dist > RANGE + 0.05) exitAt = Date.now();
        if (exitAt !== null && Date.now() - exitAt > afterSec * 1000) break;
      }
      await H.sleep(150);
    }
    return { rows, shot, exited: exitAt !== null };
  };
  // 每一筆血量下降拆成普通攻擊與跳傷；拆不開的放在 bad（例如疊加成 48.8）
  const classify = (rows) => {
    const hits = [], ticks = [], bad = [];
    for (const r of rows) {
      if (r.drop <= 0.001) continue;
      if (near(r.drop, ATK)) hits.push(r);
      else if (near(r.drop, TICK)) ticks.push(r);
      else if (near(r.drop, ATK + TICK)) { hits.push(r); ticks.push(r); }
      else bad.push(r);
    }
    return { hits, ticks, bad };
  };

  // ── A. 技能說明 ──
  await section("A", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", {
      profiles: {
        [A]: { nickname: "R15 玩家", level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_7", heroes: [], team: [{ hero_id: "zhou_yu", slot: 1 }] },
      },
      battle_logs: [],
    });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), A);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('div[class*="heroName"]');
    const card = await page.locator('div[class*="heroCard"]', { has: page.locator('div[class*="heroName"]', { hasText: "周瑜" }) }).first().innerText();
    await page.locator('div[class*="heroName"]', { hasText: "周瑜" }).first().click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail };
    out.A_shot = await H.shot(page, "r15-a-skill-detail");
    run.check("A-1 主頁武將視窗：周瑜的卡片顯示「技能：火攻」；詳情寫明每 1 秒一次、共 3 次、命中當下攻擊力的 20%、第一次在命中 1 秒後、不疊加，以及目前攻擊力 122 時每次 24.4",
      /技能：火攻/.test(card) && /每 1 秒/.test(detail) && /共 3 次/.test(detail) && /20%/.test(detail) && /命中 1 秒後/.test(detail) && /不會疊加/.test(detail) && /目前攻擊力 122：每次灼燒 24\.4/.test(detail),
      out.A_modal);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('[data-testid="hero-skill-tag"]', { hasText: "火攻" }).first().click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：周瑜有「火攻」標籤，點開後顯示同樣的規則", tags.includes("技能：火攻") && detail2 === detail, out.A_page);
  });

  // ── B. 主頁：實際部署、實際扣血 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.selectStage(page, "Mock A 慢速出兵");
    await dismissSplash(IFRAME);
    await clickCell(IFRAME, CELL[0], CELL[1]);
    await page.waitForSelector("text=建築位部署", { timeout: 15000 });
    await page.locator('button[class*="tabBtn"]', { hasText: "武將" }).click();
    await page.locator('button[class*="menuCard"]', { hasText: "周瑜" }).click();
    await H.sleep(500);
    const placed = await snapshot(IFRAME);
    await H.clickButton(page, "迎戰");
    const r = await trackBurn(IFRAME);
    const c = classify(r.rows);
    const burnRows = r.rows.filter((x) => x.burn);
    // 最後一次普通攻擊之後的跳傷（敵人正在走出射程）；明顯在射程外（多 0.3 格）時不應再有普通攻擊
    const lastHit = c.hits.length ? c.hits[c.hits.length - 1] : null;
    const ticksAfter = lastHit ? c.ticks.filter((x) => x.t > lastHit.t) : [];
    const hitsOutside = c.hits.filter((x) => typeof x.dist === "number" && x.dist > RANGE + 0.3);
    const end = r.rows[r.rows.length - 1] || {};
    out.B = { rangeAtPlace: placed.hero_ranges, exited: r.exited, hits: c.hits.length, ticks: c.ticks.length, bad: c.bad, lastHit, ticksAfter, hitsOutside: hitsOutside.length, endDist: end.dist, watchedAfterLastHit: lastHit ? end.t - lastHit.t : null, burnSample: burnRows.slice(0, 3).map((x) => x.burn), lastRows: r.rows.slice(-8), shot: r.shot };
    run.check("B-1 用部署選單放置周瑜：射程 4 格（技能不改變射程）", near(placed.hero_ranges && placed.hero_ranges.zhou_yu, 4, 1e-6), out.B.rangeAtPlace);
    run.check("B-2 灼燒可見：快照顯示敵人正在灼燒（每跳 24.4、剩餘跳數 1～3），截圖有橘色外圈",
      burnRows.length > 0 && burnRows.every((x) => near(x.burn.damage, TICK) && x.burn.ticks_left >= 1 && x.burn.ticks_left <= 3) && !!r.shot, out.B.burnSample);
    run.check("B-3 實際扣血：普通攻擊一擊 122、跳傷 24.4，沒有疊加（沒有 48.8 等其他數值）",
      c.hits.length >= 3 && c.ticks.length >= 3 && c.bad.length === 0, { hits: c.hits.length, ticks: c.ticks.length, bad: c.bad });
    run.check("B-4 敵人走出射程（4 格）後不再被普通攻擊；最後一擊之後灼燒再跳 3 次（每次 24.4）就停止（之後觀察超過 3.5 秒沒有第 4 跳）",
      r.exited && hitsOutside.length === 0 && ticksAfter.length === 3 && typeof end.dist === "number" && end.dist > RANGE && out.B.watchedAfterLastHit > 3.5,
      { lastHit, ticksAfter, endDist: end.dist, watched: out.B.watchedAfterLastHit });
  });

  // ── C. 獨立戰鬥頁 ──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_1");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
    await H.sleep(1000);
    await dismissSplash(BIFRAME);
    // 畫布縮放和主頁不同，改送部署選單點選武將時送出的同一個 place_hero 訊息（實際點擊的部署流程已在 B 段驗證）
    await page.evaluate(([sel, c, r]) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "place_hero", hero_id: "zhou_yu", cell_x: c, cell_y: r }, "*");
    }, [BIFRAME, CELL[0], CELL[1]]);
    await H.sleep(500);
    await page.locator("button", { hasText: /^迎戰$/ }).click();
    const r = await trackBurn(BIFRAME, 0, 15000);
    const c = classify(r.rows);
    out.C = { hits: c.hits.length, ticks: c.ticks.length, bad: c.bad, burn: r.rows.filter((x) => x.burn).slice(0, 2).map((x) => x.burn), shot: r.shot };
    run.check("C-1 獨立戰鬥頁：周瑜命中後同樣附加灼燒（跳傷 24.4），沒有疊加", c.hits.length >= 1 && c.ticks.length >= 1 && c.bad.length === 0 && out.C.burn.length > 0, out.C);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
  });

  // ── D. 存檔與 session 不帶技能或灼燒欄位 ──
  await section("D", async () => {
    await waitSync("idle");
    const d = await db();
    const p = d.profiles[A];
    const sess = await sessionRaw();
    const bad = /skill|burn|long_range|range_multiplier|first_attack/;
    out.D = { profileKeys: Object.keys(p), team: p.team, sessionHasSkill: bad.test(sess) };
    run.check("D-1 存檔與 session 都沒有技能或灼燒欄位；隊伍仍只有 hero_id／slot",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]'),
      out.D);
  });

  return run.finish({ out });
}
