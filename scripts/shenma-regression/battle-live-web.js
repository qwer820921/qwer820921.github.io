async (page) => {
  // 戰況觀測（瀏覽器，真 Godot 產物）：武將面板與「戰況」的即時技能狀態、敵軍查看
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_lv_fixture）：甘寧（奇襲）、貂蟬（魅惑）、許褚（怪力），數值和正式設定相同；
  //   關卡「Mock LV 戰況」：直線路線（第 5 列，從 (3,5) 走到 (13,5)），6 個慢慢走的步卒（生命 99999）；
  //   關卡「Mock LV 大軍」：38 個不會移動的木樁與 1 個會走到城池的快兵（共 39 隻）
  // - A：主頁。備戰中拆除確認不受觀測更新影響（確認框與焦點都留著）；三位武將部署後「戰況」列出目前的技能狀態；
  //      選取甘寧後不重新點選：開戰後奇襲 1→0；貂蟬的魅惑冷卻從約 6 秒照戰鬥時間降到 0（暫停時不變、觀測照常送）；許褚的怪力 3→0；
  //      敵軍分頁的數量＝遊戲計入波次的敵人數（含受控的），受控的敵人可以查看來源；
  //      舊的一份（seq 較小）、不合理的一份（NaN、負的剩下時間、重複的 uid）、上一場的一份都不採用；
  //      game_ready 沒有宣告戰況觀測（舊版遊戲）時隱藏「戰況」、面板退回選取時的快照與重新點選說明
  // - B：主頁 39 隻：每頁 20 隻（20＋19），總數＝遊戲的數量；選中的快兵抵達城池後詳情說明已離場、總數變 38；
  //      選取敵人不送任何命令給遊戲；鍵盤（Enter、Tab、Esc 焦點回到開關）；390×600 在畫面內、字級至少 12px、不擋暫停
  // - C：獨立戰鬥頁：同樣不重新點選就看到奇襲 1→0；敵軍數量＝遊戲的數量
  // 全部虛構金鑰 test_lv_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_lv_k";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_4", name: "Mock LV 戰況" };
  const ARMY = { id: "chapter3_5", name: "Mock LV 大軍" };
  const GN_CELL = [4, 4];
  const DC_CELL = [5, 6];
  const XC_CELL = [6, 4];

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[3, ROW], [13, ROW]] }, spawn: [3, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [
      {
        hero_id: "gan_ning", name: "甘寧", rarity: "orange", cost: 7, job: "archer",
        base_atk: 122, base_def: 107, base_hp: 1235, attack_range: 5, attack_speed: 1.8, upgrade_cost_base: 100,
        atk_growth: 12.2, def_growth: 10.7, hp_growth: 123.5, range_growth: 0.05, speed_growth: 0.02, image: "hero_gan_ning.webp", attack_image: "hero_gan_ning_atk.webp",
      },
      {
        hero_id: "diao_chan", name: "貂蟬", rarity: "orange", cost: 8, job: "mage",
        base_atk: 131, base_def: 97, base_hp: 1294, attack_range: 4, attack_speed: 0.8, upgrade_cost_base: 100,
        atk_growth: 13.1, def_growth: 9.7, hp_growth: 129.4, range_growth: 0.05, speed_growth: 0.02, image: "hero_diao_chan.webp", attack_image: "hero_diao_chan_atk.webp",
      },
      {
        hero_id: "xu_chu", name: "許褚", rarity: "purple", cost: 5, job: "infantry",
        base_atk: 103, base_def: 70, base_hp: 998, attack_range: 1, attack_speed: 0.9, upgrade_cost_base: 75,
        atk_growth: 10.3, def_growth: 7, hp_growth: 99.8, range_growth: 0.03, speed_growth: 0.01, image: "hero_xu_chu.webp", attack_image: "hero_xu_chu_atk.webp",
      },
    ],
    enemies: [
      { enemy_id: "mock_lv_walk", name: "步卒", hp: 99999, speed: 8, atk: 30, image: "enemy_grunt1.webp" },
      { enemy_id: "mock_lv_post", name: "木樁", hp: 99999, speed: 0, atk: 5, armor: 30, image: "enemy_grunt2.webp" },
      { enemy_id: "mock_lv_runner", name: "快兵", hp: 99999, speed: 30, atk: 10, trait: "immune_slow", image: "enemy_cavalry1.webp" },
    ],
    maps: [
      {
        map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
        waves: [{ wave: 1, enemies: [{ enemy_id: "mock_lv_walk", count: 6, interval: 1.2, path: "path_a" }] }],
      },
      {
        map_id: ARMY.id, chapter: 3, name: ARMY.name, unlock_stage: MAP.id, path_json: pj,
        waves: [{ wave: 1, enemies: [{ enemy_id: "mock_lv_post", count: 38, interval: 0.05, path: "path_a" }, { enemy_id: "mock_lv_runner", count: 1, interval: 0.5, path: "path_a" }] }],
      },
    ],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    const ids = extra.heroes.map((h) => h.hero_id);
    const mapIds = extra.maps.map((m) => m.map_id);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_lv_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps" || body.action === "get_enemies_config" || body.action === "get_heroes_config") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (j && j.status === 200) {
            if (body.action === "get_all_maps" && Array.isArray(j.maps)) j.maps = [...j.maps.filter((m) => !mapIds.includes(m.map_id)), ...extra.maps];
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
  // 遊戲 iframe 收到的訊息（選取敵人不送命令的檢查用）
  await page.addInitScript(() => {
    if (window.__lvRecv) return;
    window.__lvRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__lvRecv.push(e.data);
    });
  });

  // ── 輔助 ──
  const waitUntil = async (fn, timeout = 60000, what = "條件") => {
    const end = Date.now() + timeout;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error("等不到：" + what);
      await H.sleep(150);
    }
  };
  const snapshot = async (sel) => {
    const id = "lv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const obsTail = () => page.evaluate(() => {
    const l = window.__obsLog || [];
    return l.length ? l[l.length - 1] : null;
  });
  const obsAt = (back) => page.evaluate((b) => {
    const l = window.__obsLog || [];
    return l.length > b ? l[l.length - 1 - b] : null;
  }, back);
  const post = (sel, msg) =>
    page.evaluate(({ sel, msg }) => {
      // 從遊戲 iframe 送出（頁面只採用目前 iframe 的訊息）；用結構化複製保留 NaN
      const w = document.querySelector(sel).contentWindow;
      w.__lvPost = msg;
      w.eval("window.parent.postMessage(window.__lvPost, '*')");
    }, { sel, msg });
  const liveSeq = () => page.evaluate(() => {
    const el = document.querySelector('[data-testid="battle-live"]');
    return el ? Number(el.dataset.seq || 0) : null;
  });
  const dismissSplash = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
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
  const clickCell = async (sel, cell) => {
    const p = await cellPoint(sel, cell[0], cell[1]);
    await page.mouse.click(p.x, p.y);
  };
  const deploy = async (sel, cell, heroName) => {
    await clickCell(sel, cell);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    const tab = page.locator('[data-testid="placement-menu"] button[class*="tabBtn"]', { hasText: "武將" });
    if ((await tab.count()) > 0) await tab.click();
    await page.locator('button[class*="menuCard"]', { hasText: heroName }).click();
    await H.sleep(700);
  };
  const select = async (sel, cell, testId) => {
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await H.sleep(200);
    await clickCell(sel, cell);
    await page.waitForSelector(`[data-testid="${testId}"]`, { timeout: 15000 });
  };
  const note = (testId) => page.evaluate((t) => {
    const el = document.querySelector(`[data-testid="${t}"]`);
    return el ? { text: el.innerText, remaining: Number(el.dataset.remaining), used: el.dataset.used ?? null, live: el.dataset.live ?? null } : null;
  }, testId);
  const panelName = () => page.locator('[data-testid="unit-panel"] [class*="unitName"]').first().innerText().catch(() => "");
  const openLive = async () => {
    if ((await page.locator('[data-testid="battle-live"]:not([hidden])').count()) === 0) {
      await page.locator('[data-testid="battle-live-toggle"]').click();
    }
    await page.waitForSelector('[data-testid="battle-live"]:not([hidden])', { timeout: 10000 });
  };
  const closeLive = async () => {
    if ((await page.locator('[data-testid="battle-live"]:not([hidden])').count()) > 0) {
      await page.locator('[data-testid="battle-live-collapse"]').click();
    }
  };
  const liveHeroes = () => page.locator('[data-testid="live-hero"]').evaluateAll((els) => els.map((e) => ({
    uid: e.dataset.uid, hero: e.dataset.heroId, skill: e.dataset.skill, used: e.dataset.used, remaining: e.dataset.remaining, text: e.innerText.replace(/\s+/g, " "),
  })));
  const liveEnemies = () => page.evaluate(() => ({
    total: Number(document.querySelector('[data-testid="battle-live-enemy-total"]')?.dataset.total ?? -1),
    charmed: Number(document.querySelector('[data-testid="battle-live-enemy-total"]')?.dataset.charmed ?? -1),
    rows: [...document.querySelectorAll('[data-testid="live-enemy"]')].map((b) => ({ uid: b.dataset.uid, id: b.dataset.enemyId, charmed: b.dataset.charmed, text: b.innerText.replace(/\s+/g, " ") })),
    pager: (() => { const p = document.querySelector('[data-testid="battle-live-pager"]'); return p ? { page: Number(p.dataset.page), pages: Number(p.dataset.pages), text: p.innerText.replace(/\s+/g, " ") } : null; })(),
    detail: (() => { const d = document.querySelector('[data-testid="live-enemy-detail"]'); return d ? { uid: d.dataset.uid ?? null, gone: d.dataset.gone, text: d.innerText.replace(/\s+/g, " ") } : null; })(),
  }));
  const snapCharmed = (s) => Object.values((s && s.enemy_charm) || {}).filter((c) => c && c.charmed).length;
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `battle-live-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };
  // 每 250 毫秒讀一次面板上的剩下時間與目前採用的觀測 seq，共 ms 毫秒
  const sample = async (testId, ms) => {
    const rows = [];
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const n = await note(testId);
      const o = await obsTail();
      rows.push({ rem: n ? n.remaining : null, live: n ? n.live : null, obsSeq: o ? o.seq : null });
      await H.sleep(250);
    }
    return rows;
  };

  await section("setup", async () => {
    await H.resetOrigin(page);
    const profile = { nickname: "戰況玩家", level: 5, exp: 0, gold: 5000, capacity: 30, max_stage: ARMY.id, heroes: [],
      team: [{ hero_id: "gan_ning", slot: 1 }, { hero_id: "diao_chan", slot: 2 }, { hero_id: "xu_chu", slot: 3 }] };
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
      localStorage.setItem("__shenma_lv_fixture", "1");
    }, { k: KEY, p: profile });
    await page.setViewportSize({ width: 1280, height: 900 });
  });

  // ── A. 主頁：即時技能狀態 ──
  let oldBattleObs = null;
  await section("A", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);

    // A-0：備戰中拆除確認不受觀測更新影響
    await H.placeTower(page, 8, 6);
    await clickCell(IFRAME, [8, 6]);
    await page.waitForSelector('[data-testid="tower-sell"]', { timeout: 15000 });
    await page.locator('[data-testid="tower-sell"]').click();
    await page.waitForSelector('[data-testid="tower-sell-ok"]', { timeout: 10000 });
    await page.locator('[data-testid="tower-sell-ok"]').focus();
    const seq0 = (await obsTail())?.seq ?? 0;
    await H.sleep(1500);
    const seq1 = (await obsTail())?.seq ?? 0;
    const keep0 = await page.evaluate(() => ({ confirm: !!document.querySelector('[data-testid="tower-sell-confirm"]'), focus: document.activeElement?.dataset?.testid ?? null }));
    await page.locator('[data-testid="tower-sell-cancel"]').click();
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    out.A0 = { seq0, seq1, keep0 };
    run.check("A-0 備戰中打開拆除確認、焦點在「確認拆除」：1.5 秒內遊戲照常送出戰況觀測（seq 增加），確認框與焦點都沒有被更新打斷",
      seq1 > seq0 + 3 && keep0.confirm && keep0.focus === "tower-sell-ok", out.A0);

    await deploy(IFRAME, GN_CELL, "甘寧");
    await deploy(IFRAME, DC_CELL, "貂蟬");
    await deploy(IFRAME, XC_CELL, "許褚");
    await openLive();
    await page.locator('[data-testid="battle-live-tab-heroes"]').click();
    await waitUntil(async () => (await liveHeroes()).length === 3, 10000, "戰況列出三位武將");
    const heroes1 = await liveHeroes();
    const status1 = await page.locator('[data-testid="battle-live-status"]').innerText();
    out.A1 = { heroes1, status1, shot: await H.shot(page, "battle-live-a-heroes-prep") };
    const hOf = (list, id) => list.find((h) => h.hero === id) || {};
    run.check("A-1 「戰況」的武將技能列出部署的三位：甘寧「奇襲：這一場還沒用過（剩 1 次）」、貂蟬「魅惑：可以控制」、許褚「怪力：可以推動」，狀態是備戰中（uid 各不相同）",
      /奇襲：這一場還沒用過（剩 1 次）/.test(hOf(heroes1, "gan_ning").text) && /魅惑：可以控制/.test(hOf(heroes1, "diao_chan").text) &&
        /怪力：可以推動/.test(hOf(heroes1, "xu_chu").text) && /備戰中/.test(status1) && new Set(heroes1.map((h) => h.uid)).size === 3,
      out.A1);
    await closeLive();

    // A-2：選取甘寧，不重新點選：開戰後奇襲 1→0
    await select(IFRAME, GN_CELL, "unit-panel-assassinate");
    const before2 = await note("unit-panel-assassinate");
    const hp2 = await page.evaluate(() => document.querySelector('[data-testid="unit-panel-hp"]')?.dataset.live ?? null);
    const snapNote2 = await page.locator('[data-testid="unit-panel-snapshot-note"]').innerText().catch(() => "");
    const seqA = (await obsTail())?.seq ?? 0;
    await H.clickButton(page, "迎戰");
    await waitUntil(async () => (await note("unit-panel-assassinate"))?.used === "1", 20000, "奇襲用掉");
    const after2 = await note("unit-panel-assassinate");
    const name2 = await panelName();
    const seqB = (await obsTail())?.seq ?? 0;
    out.A2 = { before2, after2, hp2, snapNote2, name2, seqA, seqB };
    run.check("A-2 選取甘寧後不重新點選：開戰前面板寫「奇襲：目前這一場還沒用過…（即時更新）」，開戰後同一個面板自己變成「目前這一場已經用過…」（剩 0）；生命值標示即時、說明寫明防禦與攻擊間隔是選取時的數值",
      before2?.used === "0" && before2?.live === "1" && /奇襲：目前這一場還沒用過/.test(before2.text) && /（即時更新）/.test(before2.text) &&
        after2?.used === "1" && after2?.remaining === 0 && /奇襲：目前這一場已經用過/.test(after2.text) && /甘寧/.test(name2) && hp2 === "1" &&
        /生命值與技能狀態是目前的戰況/.test(snapNote2) && /防禦與攻擊間隔是選取時的數值/.test(snapNote2) && seqB > seqA,
      out.A2);

    // A-3：貂蟬的魅惑冷卻約 6 秒照戰鬥時間降到 0；中途暫停 1.5 秒時面板上的剩下時間不變（觀測照常送）
    await select(IFRAME, DC_CELL, "unit-panel-charm");
    await waitUntil(async () => (await note("unit-panel-charm"))?.remaining > 4.5, 25000, "魅惑冷卻");
    const run1 = await sample("unit-panel-charm", 1000);
    await page.locator('[data-testid="pause-toggle"]').first().click();
    await page.waitForSelector('[data-testid="pause-badge"]', { timeout: 15000 });
    await H.sleep(400);
    const paused3 = await sample("unit-panel-charm", 1500);
    // 面板可能蓋住 HUD 的暫停鈕：用戰場下方的「繼續」
    await page.locator('[data-testid="pause-resume"]').click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="pause-badge"]'), null, { timeout: 15000 });
    let low3 = null;
    await waitUntil(async () => {
      const n = await note("unit-panel-charm");
      if (n && n.remaining <= 0.3) low3 = n;
      return !!low3;
    }, 15000, "魅惑冷卻降到 0");
    const dec3 = run1.every((r, i) => i === 0 || r.rem <= run1[i - 1].rem + 1e-9) && run1[0].rem > run1[run1.length - 1].rem;
    const frozen3 = paused3.every((r) => r.rem === paused3[0].rem) && paused3[paused3.length - 1].obsSeq > paused3[0].obsSeq + 3;
    out.A3 = { run1, paused3, low3 };
    run.check("A-3 選取貂蟬後不重新點選：魅惑冷卻中面板的剩下時間逐次遞減；手動暫停 1.5 秒時遊戲照常送觀測（seq 增加）但剩下時間完全不變（不是用牆鐘倒數）；繼續後降到 0（「目前可以控制」或 0.3 秒以下）",
      dec3 && frozen3 && !!low3 && low3.live === "1", out.A3);

    // A-4：許褚的怪力 3→0（不重新點選）；2 倍速
    await page.locator('[data-testid="speed-2"]').first().click();
    await select(IFRAME, XC_CELL, "unit-panel-knockback");
    let high4 = null;
    let low4 = null;
    await waitUntil(async () => {
      const n = await note("unit-panel-knockback");
      if (n && n.remaining > 1.5) high4 = n;
      if (high4 && n && n.remaining <= 0.2) low4 = n;
      return !!low4;
    }, 40000, "怪力冷卻 3→0");
    await page.locator('[data-testid="speed-1"]').first().click();
    out.A4 = { high4, low4 };
    run.check("A-4 2 倍速、選取許褚後不重新點選：怪力推動後面板出現冷卻（大於 1.5 秒），之後同一個面板降到 0（可以推動）",
      !!high4 && !!low4 && /怪力：目前冷卻中/.test(high4.text) && low4.live === "1", out.A4);
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});

    // A-5：敵軍分頁：數量＝遊戲計入波次的數量（含受控的）；受控的可以查看來源
    await openLive();
    await page.locator('[data-testid="battle-live-tab-enemies"]').click();
    let pair5 = null;
    await waitUntil(async () => {
      const s = await snapshot(IFRAME);
      const l = await liveEnemies();
      if (l.total === s.active_enemies && l.rows.length === s.active_enemies && snapCharmed(s) === l.charmed) pair5 = { s: { active: s.active_enemies, charmed: snapCharmed(s) }, l };
      return pair5 && pair5.l.charmed > 0 ? pair5 : null;
    }, 30000, "敵軍數量和遊戲相同、有受控的敵人");
    const charmedRow = pair5.l.rows.find((r) => r.charmed === "1");
    await page.locator(`[data-testid="live-enemy"][data-uid="${charmedRow.uid}"]`).click();
    await H.sleep(400);
    const det5 = await liveEnemies();
    out.A5 = { pair5, det5: det5.detail, shot: await H.shot(page, "battle-live-a-enemies") };
    run.check("A-5 敵軍分頁：場上數量、列出的列數和遊戲計入波次的數量相同，受控數量和遊戲相同（受控的仍列出）；選受控的敵人：詳情寫受控（魅惑）、剩下秒數、來源貂蟬、對阻路武將攻擊力（不是漏到城池的傷害）",
      !!pair5 && !!charmedRow && /受控（魅惑）：還剩 [0-9.]+ 秒，來源：貂蟬/.test(det5.detail?.text || "") && /對阻路武將攻擊力：30/.test(det5.detail?.text || "") &&
        /不是漏到城池的傷害/.test(det5.detail?.text || ""),
      out.A5);

    // A-6：舊的、不合理的觀測不採用
    const cur = await obsTail();
    const older = await obsAt(6);
    await post(IFRAME, older);
    await H.sleep(500);
    const afterOld = await liveSeq();
    const bad = (mut) => {
      const o = JSON.parse(JSON.stringify(cur));
      o.seq = cur.seq + 1000;
      mut(o);
      return o;
    };
    await post(IFRAME, bad((o) => { if (o.heroes[0]) o.heroes[0].hp = NaN; }));
    await post(IFRAME, bad((o) => { const h = o.heroes.find((x) => x.skill && "remaining" in x.skill); if (h) h.skill.remaining = -1; }));
    await post(IFRAME, bad((o) => { if (o.heroes.length > 1) o.heroes[1].uid = o.heroes[0].uid; }));
    await post(IFRAME, bad((o) => { o.enemy_total = o.enemy_total + 1; }));
    await post(IFRAME, bad((o) => { delete o.battle_id; }));
    await H.sleep(600);
    const afterBad = await liveSeq();
    oldBattleObs = await obsTail();
    out.A6 = { cur: cur.seq, older: older && older.seq, afterOld, afterBad };
    run.check("A-6 遊戲 iframe 重送較舊的一份（seq 較小）不採用；seq 加 1000 但生命是 NaN、剩下時間是負數、重複的 uid、總數和列出的不同、缺 battle_id 的都整份不採用（顯示的 seq 仍是遊戲正常送來的）",
      !!older && older.seq < cur.seq && afterOld >= cur.seq && afterBad < cur.seq + 1000 && afterBad >= cur.seq, out.A6);
    await closeLive();

    // A-7：遊戲沒有宣告戰況觀測（舊版遊戲的 game_ready）：隱藏「戰況」，面板退回選取時的快照；再宣告後恢復
    await post(IFRAME, { __godot_bridge: true, type: "game_ready", protocol: 7 });
    await H.sleep(800);
    const toggle7 = await page.locator('[data-testid="battle-live-toggle"]').count();
    await select(IFRAME, GN_CELL, "unit-panel-assassinate");
    const legacy7 = await note("unit-panel-assassinate");
    const snapNote7 = await page.locator('[data-testid="unit-panel-snapshot-note"]').innerText().catch(() => "");
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await post(IFRAME, { __godot_bridge: true, type: "game_ready", protocol: 7, capabilities: ["battle_observation"] });
    await page.waitForSelector('[data-testid="battle-live-toggle"]', { timeout: 10000 });
    await openLive();
    const back7 = await waitUntil(async () => ((await liveSeq()) > 0 ? liveSeq() : null), 10000, "重新宣告後採用觀測");
    await closeLive();
    out.A7 = { toggle7, legacy7, snapNote7, back7 };
    run.check("A-7 game_ready 沒有宣告 battle_observation（舊版遊戲）：「戰況」開關消失；甘寧的面板寫「奇襲：選取時…（重新點選可以更新）」、說明生命值與防禦是選取時的數值；重新宣告後開關回來、再採用新的觀測",
      toggle7 === 0 && legacy7?.live === "0" && /奇襲：選取時這一場已經用過/.test(legacy7.text) && /（重新點選可以更新）/.test(legacy7.text) &&
        /生命值與防禦是選取時的數值/.test(snapNote7) && back7 > 0,
      out.A7);

    // A-8：換關（新的一場）：上一場的觀測不採用，「戰況」顯示新的一場（沒有武將、備戰中）
    await H.selectStage(page, ARMY.name);
    await H.sleep(800);
    await openLive();
    await page.locator('[data-testid="battle-live-tab-heroes"]').click();
    const fresh8 = await waitUntil(async () => {
      const s = await page.locator('[data-testid="battle-live-status"]').innerText();
      return /備戰中/.test(s) ? { s, seq: await liveSeq() } : null;
    }, 15000, "新的一場的戰況");
    const old = { ...oldBattleObs, seq: oldBattleObs.seq + 5000 };
    // 送出後每 50 毫秒看一次（遊戲 0.25 秒後就會送新的一份，短暫顯示也要抓到）
    await post(IFRAME, old);
    const seen8 = [];
    for (let i = 0; i < 14; i++) {
      seen8.push(await page.evaluate(() => ({
        seq: Number(document.querySelector('[data-testid="battle-live"]')?.dataset.seq || 0),
        heroes: document.querySelectorAll('[data-testid="live-hero"]').length,
        status: document.querySelector('[data-testid="battle-live-status"]')?.innerText || "",
      })));
      await H.sleep(50);
    }
    const after8 = seen8[seen8.length - 1];
    out.A8 = { fresh8, maxSeq: Math.max(...seen8.map((x) => x.seq)), maxHeroes: Math.max(...seen8.map((x) => x.heroes)), after8, oldBattle: oldBattleObs.battle_id };
    run.check("A-8 換關後，上一場的觀測（battle_id 是上一場、seq 很大）晚到：送出後 0.7 秒內每 50 毫秒都不採用，「戰況」一直是新的一場（備戰中、沒有武將、seq 沒有跳到上一場的）",
      out.A8.maxSeq < 5000 && out.A8.maxHeroes === 0 && seen8.every((x) => /備戰中/.test(x.status)), out.A8);
  });

  // ── B. 主頁：39 隻敵人、分頁、離場、鍵盤、390×600 ──
  await section("B", async () => {
    await page.locator('[data-testid="battle-live-tab-enemies"]').click();
    const recv0 = await page.evaluate((sel) => (document.querySelector(sel).contentWindow.__lvRecv || []).filter((m) => m.type !== "debug_snapshot").length, IFRAME);
    await dismissSplash(IFRAME).catch(() => {});
    await H.clickButton(page, "迎戰");
    let p1 = null;
    await waitUntil(async () => {
      const s = await snapshot(IFRAME);
      const l = await liveEnemies();
      if (s.active_enemies === 39 && l.total === 39) p1 = { active: s.active_enemies, l };
      return p1;
    }, 30000, "39 隻全部出場");
    // 快兵（會走到城池）：選它
    const runner = p1.l.rows.find((r) => r.id === "mock_lv_runner");
    let runnerPage = 1;
    if (!runner) {
      await page.locator('[data-testid="battle-live-next"]').click();
      runnerPage = 2;
    }
    const runnerRow = page.locator('[data-testid="live-enemy"][data-enemy-id="mock_lv_runner"]');
    await runnerRow.click();
    await H.sleep(300);
    const det1 = (await liveEnemies()).detail;
    // 第 1 頁 20 隻、第 2 頁 19 隻（換頁不改選取）
    if (runnerPage === 2) await page.locator('[data-testid="battle-live-prev"]').click();
    await H.sleep(200);
    const pg1 = await liveEnemies();
    await page.locator('[data-testid="battle-live-next"]').click();
    await H.sleep(200);
    const pg2 = await liveEnemies();
    await page.locator('[data-testid="battle-live-prev"]').click();
    await H.sleep(200);
    out.B1 = { active: p1.active, runnerPage, det1, page1: { rows: pg1.rows.length, pager: pg1.pager }, page2: { rows: pg2.rows.length, pager: pg2.pager } };
    run.check("B-1 39 隻全部出場：場上 39 隻＝遊戲計入波次的數量；每頁 20 隻（第 1 頁 20、第 2 頁 19，頁碼寫共 39 隻）；選快兵：詳情寫移速、免疫減速、設定護甲之外的資訊",
      p1.active === 39 && pg1.rows.length === 20 && pg2.rows.length === 19 && pg1.pager?.pages === 2 && /共 39 隻/.test(pg2.pager?.text || "") &&
        !!det1 && /快兵/.test(det1.text) && /免疫減速/.test(det1.text),
      out.B1);
    // 快兵抵達城池後：詳情說明已離場、總數 38，不指到別的敵人
    let gone = null;
    await waitUntil(async () => {
      const l = await liveEnemies();
      if (l.detail && l.detail.gone === "1") gone = l;
      return gone;
    }, 40000, "快兵抵達城池");
    const s3 = await snapshot(IFRAME);
    // 木樁的詳情：設定護甲標示目前版本沒有使用
    await page.locator('[data-testid="live-enemy"][data-enemy-id="mock_lv_post"]').first().click();
    await H.sleep(300);
    const det2 = (await liveEnemies()).detail;
    const recv1 = await page.evaluate((sel) => (document.querySelector(sel).contentWindow.__lvRecv || []).filter((m) => m.type !== "debug_snapshot").length, IFRAME);
    out.B2 = { det2, gone: { total: gone.total, detail: gone.detail }, active: s3.active_enemies, recv: [recv0, recv1] };
    run.check("B-2 木樁的詳情寫「設定護甲 30：目前版本沒有使用，不會減少受到的傷害」；選中的快兵抵達城池後，詳情說明已離場（不改指到別的敵人），總數 38＝遊戲的數量；選取敵人沒有送任何命令給遊戲（只有開戰一次）",
      /設定護甲 30：目前版本沒有使用，不會減少受到的傷害/.test(det2?.text || "") && gone.detail.gone === "1" && /已離場/.test(gone.detail.text) &&
        gone.total === 38 && s3.active_enemies === 38 && recv1 - recv0 === 1,
      out.B2);

    // B-3：鍵盤：收起後從開關按 Enter 打開、Tab 到分頁與列、Enter 選取、Esc 收起且焦點回到開關
    await closeLive();
    await page.locator('[data-testid="battle-live-toggle"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="battle-live"]:not([hidden])', { timeout: 5000 });
    let reached = null;
    for (let i = 0; i < 30 && !reached; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => (document.activeElement?.dataset?.testid === "live-enemy" ? document.activeElement.dataset.uid : null));
    }
    await page.keyboard.press("Enter");
    await H.sleep(300);
    const kb = await page.evaluate(() => ({ pressed: document.activeElement?.getAttribute("aria-pressed"), detail: document.querySelector('[data-testid="live-enemy-detail"]')?.dataset.uid ?? null }));
    await page.keyboard.press("Escape");
    await H.sleep(300);
    const kb2 = await page.evaluate(() => ({ hidden: document.querySelector('[data-testid="battle-live"]')?.hidden, focus: document.activeElement?.dataset?.testid ?? null,
      expanded: document.querySelector('[data-testid="battle-live-toggle"]')?.getAttribute("aria-expanded") }));
    out.B3 = { reached, kb, kb2 };
    run.check("B-3 鍵盤：從「戰況」開關按 Enter 打開，Tab 走到敵人列、按 Enter 選取（aria-pressed、詳情是這一隻）；按 Esc 收起，焦點回到開關（aria-expanded false）",
      !!reached && kb.pressed === "true" && kb.detail === reached && kb2.hidden === true && kb2.focus === "battle-live-toggle" && kb2.expanded === "false", out.B3);

    // B-4：390×600：接在戰場下方、在畫面內、字級至少 12px，不蓋住暫停鈕
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(800);
    await openLive();
    await H.sleep(600);
    const m = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="battle-live"]');
      const b = el.getBoundingClientRect();
      const pause = document.querySelector('[data-testid="pause-toggle"]')?.getBoundingClientRect();
      const fonts = [...el.querySelectorAll("button, div, li")].map((x) => parseFloat(getComputedStyle(x).fontSize));
      const overlap = pause && !(pause.bottom <= b.top || pause.top >= b.bottom || pause.right <= b.left || pause.left >= b.right);
      return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), vw: window.innerWidth, vh: window.innerHeight,
        placement: el.dataset.placement, minFont: Math.min(...fonts), docScroll: document.documentElement.scrollWidth, overlap: !!overlap,
        floatingHidden: [...document.querySelectorAll("[data-floating-entry]")].every((x) => getComputedStyle(x).visibility === "hidden") };
    });
    const shot4 = await H.shot(page, "battle-live-b-390x600");
    await closeLive();
    await page.setViewportSize({ width: 1280, height: 900 });
    await H.sleep(500);
    out.B4 = { m, shot4 };
    run.check("B-4 390×600：「戰況」接在戰場下方、在畫面寬度與高度內、沒有橫向捲動、字級至少 12px，沒有蓋住暫停鈕；開著時隱藏全站浮動入口（不蓋住清單）（截圖另存）",
      m.placement === "below" && m.left >= 0 && m.right <= m.vw && m.bottom <= m.vh + 1 && m.docScroll <= m.vw && m.minFont >= 12 && !m.overlap && m.floatingHidden, out.B4);
  });

  // ── C. 獨立戰鬥頁 ──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    await deploy(BIFRAME, GN_CELL, "甘寧");
    await select(BIFRAME, GN_CELL, "unit-panel-assassinate");
    const before = await note("unit-panel-assassinate");
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    await waitUntil(async () => (await note("unit-panel-assassinate"))?.used === "1", 20000, "獨立戰鬥頁奇襲用掉");
    const after = await note("unit-panel-assassinate");
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await openLive();
    await page.locator('[data-testid="battle-live-tab-enemies"]').click();
    let pair = null;
    await waitUntil(async () => {
      const s = await snapshot(BIFRAME);
      const l = await liveEnemies();
      if (l.total === s.active_enemies && l.rows.length === s.active_enemies) pair = { active: s.active_enemies, total: l.total };
      return pair;
    }, 20000, "獨立戰鬥頁的敵軍數量");
    out.C = { before, after, pair, shot: await H.shot(page, "battle-live-c-battle-page") };
    run.check("C-1 獨立戰鬥頁：選取甘寧後不重新點選，開戰後面板從「目前這一場還沒用過」變成「已經用過」；敵軍分頁的數量＝遊戲計入波次的數量",
      before?.used === "0" && before?.live === "1" && after?.used === "1" && /目前這一場已經用過/.test(after.text) && !!pair, out.C);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_lv_fixture")).catch(() => {});
  return run.finish(out);
}
