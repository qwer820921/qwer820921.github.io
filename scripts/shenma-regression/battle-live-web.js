async (page) => {
  // 戰況觀測（瀏覽器，真 Godot 產物）：武將面板與「戰況」的即時技能狀態、敵軍查看
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_lv_fixture）：甘寧（奇襲）、貂蟬（魅惑）、許褚（怪力），數值和正式設定相同；
  //   關卡「Mock LV 戰況」：直線路線（第 5 列，從 (3,5) 走到 (13,5)），6 個慢慢走的步卒（生命 99999）；
  //   關卡「Mock LV 大軍」：38 個不會移動的木樁與 1 個會走到城池的快兵（共 39 隻）；
  //   關卡「Mock LV 怪力」：起點 1 個不會移動的木樁（這一場不會結束）＋1 個生命 300 的木人（許褚站在路上擋住它，第 1 擊推動、第 3 擊打倒）
  // - A：主頁。備戰中拆除確認不受觀測更新影響（確認框與焦點都留著）；三位武將部署後「戰況」列出目前的技能狀態；
  //      選取甘寧後不重新點選：開戰後奇襲 1→0；貂蟬的魅惑冷卻從約 6 秒照戰鬥時間降到 0（暫停時不變、觀測照常送）；
  //      敵軍分頁的數量＝遊戲計入波次的敵人數（含受控的），受控的敵人可以查看來源；
  //      舊的一份（seq 較小）、不合理的一份（NaN、負的剩下時間、重複的 uid）、上一場的一份都不採用；
  //      game_ready 沒有宣告戰況觀測（舊版遊戲）時隱藏「戰況」、面板退回選取時的快照與重新點選說明
  // - B：主頁 39 隻：每頁 20 隻（20＋19），總數＝遊戲的數量；選中的快兵抵達城池後詳情說明已離場、總數變 38；
  //      選取敵人不送任何命令給遊戲；鍵盤（Enter、Tab、Esc 焦點回到開關）；390×600 在畫面內、字級至少 12px、不擋暫停
  // - E：敵軍的搜尋（中文名稱或 ID）與狀態篩選（受控／減速／暈眩／灼燒，多選 AND）：符合 N／總 M、控制結束後自動退出（不改指到別的敵人）、
  //      沒有符合時清除、鍵盤、390×600、換場清空；F：本波出兵進度（照遊戲的計數；沒有欄位時不顯示；新的一場備戰中還沒開始出兵）
  // - G：已部署武將的搜尋（中文名稱或 ID）、受傷／低生命（≤30%）篩選與生命比例排序：符合 N／在場 M、觀測更新時照新的一份排列且不搶焦點、
  //      沒有符合時清除、鍵盤、390×600、換場清空；H：敵軍依出場順序／生命比例／有效攻擊力排序（過濾之後、分頁之前），
  //      選中的敵人排到別頁時詳情仍是同一隻（照 uid）、換場回到出場順序
  // - K：武將的技能狀態篩選（冷卻中＝怪力／魅惑而且還有剩下的秒數、本場已用過＝衝鋒／奇襲而且 used、無特殊技能＝skill: null）：
  //      和生命、搜尋一起（AND）、沒有新的觀測時不自己倒數、冷卻結束後照新的一份、清除、鍵盤、390×600、換場回到全部、沒有後端請求
  // - C：獨立戰鬥頁：同樣不重新點選就看到奇襲 1→0；敵軍數量＝遊戲的數量；武將低生命＋排序、敵軍依攻擊力排序、技能狀態篩選
  // - A4：主頁「Mock LV 怪力」2 倍速、選取許褚後不重新點選：怪力 3→0（面板與遊戲送的觀測都要看到冷卻出現再降到 0）
  //   前置：快照確認是這一關的備戰中、等進場畫面確實出現（遊戲區變暗）才點掉、確認關掉（變亮）才部署；部署選單沒出現時保存診斷並照樣失敗
  //   （亮度門檻只是這個測試關與視窗大小下的測試判斷，不是產品的就緒條件）
  // - 任何一段失敗時清掉殘局並回到主頁，下一段（B、E）自己重新建立前置，不讓一段的失敗連鎖到後面
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
  const KB = { id: "chapter3_6", name: "Mock LV 怪力" };
  const GN_CELL = [4, 4];
  const DC_CELL = [5, 6];
  const XC_CELL = [6, 4];
  // A4：許褚站在路上（第 5 列）擋住木人
  const KB_CELL = [6, 5];

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
      // 怪力專用：攻擊力很低（不會打倒擋路的許褚）、生命 300：許褚第 1 擊（103）推動它，第 3 擊打倒它，之後沒有目標，冷卻一路降到 0 並停在 0
      { enemy_id: "mock_lv_tap", name: "木人", hp: 300, speed: 8, atk: 1, image: "enemy_grunt1.webp" },
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
      // 怪力冷卻專用（A4）：一個不會移動的木樁留在起點（這一場不會結束，戰鬥時間持續走，冷卻一定降得到 0）；
      // 許褚站在路上擋住木人（只有站在路上才會擋住敵人；站在路邊時沿直線走的敵人只在正下方一瞬間進入 1 格射程）
      {
        map_id: KB.id, chapter: 3, name: KB.name, unlock_stage: MAP.id, path_json: pj,
        waves: [{ wave: 1, enemies: [{ enemy_id: "mock_lv_post", count: 1, interval: 0.5, path: "path_a" }, { enemy_id: "mock_lv_tap", count: 1, interval: 1.0, path: "path_a" }] }],
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
  // 一段失敗後清掉它的殘局（面板、倍速、結算畫面），重新回到主頁；下一段自己建立需要的前置，不沿用失敗的那一場
  let recovered = false;
  const recover = async () => {
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click({ timeout: 2000 }).catch(() => {});
    await page.locator('[data-testid="speed-1"]').first().click({ timeout: 2000 }).catch(() => {});
    await page.goto(H.BASE + "/shenmaSanguo").catch(() => {});
    await H.waitHud(page).catch(() => {});
    recovered = true;
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `battle-live-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      await recover().catch(() => {});
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
    // 進度到怪力專用的測試關（關卡編號不大於進度才解鎖），三個測試關都能選
    const profile = { nickname: "戰況玩家", level: 5, exp: 0, gold: 5000, capacity: 30, max_stage: KB.id, heroes: [],
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
    // 用戰場下方的「繼續」（選取面板不會蓋住它，見 panel-safe-web.js）
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

    // A-4（許褚的怪力 3→0）在檔尾的 A4 段，用專用的測試關（這一場的步卒走完會結束，不能保證冷卻期間仍在戰鬥）

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
    // 前置是 A-8 留下的：大軍那一關的備戰中、「戰況」開著；A 中途失敗（已回到主頁）時在這裡重新建立
    if (recovered) {
      await H.selectStage(page, ARMY.name);
      await H.sleep(800);
      await openLive();
      recovered = false;
    }
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

  // ── E. 敵軍的搜尋與狀態篩選；F. 本波出兵進度（主頁，接在 B 的大軍之後）──
  await section("E", async () => {
    // 前置是 B 的大軍那一場（開戰中）；B 失敗（已回到主頁）時在這裡重新開一場
    if (recovered) {
      await H.selectStage(page, ARMY.name);
      await H.sleep(800);
      await openLive();
      await page.locator('[data-testid="battle-live-tab-enemies"]').click();
      await dismissSplash(IFRAME).catch(() => {});
      await H.clickButton(page, "迎戰");
      await waitUntil(async () => (await liveEnemies()).total >= 38, 60000, "重新開的大軍出兵");
      recovered = false;
    }
    await openLive();
    await page.locator('[data-testid="battle-live-tab-enemies"]').click();
    await H.sleep(600);
    const spawnEl = () => page.evaluate(() => {
      const el = document.querySelector('[data-testid="battle-live-spawn"]');
      return el ? { planned: el.dataset.planned, spawned: el.dataset.spawned, pending: el.dataset.pending, alive: el.dataset.alive, text: el.innerText } : null;
    });
    const sp1 = await spawnEl();
    const o1 = await obsTail();
    out.F1 = { sp1, spawn: o1 && o1.spawn };
    run.check("F-1 實際出兵（大軍）：本波進度照遊戲送來的數字（計畫 39＝木樁 38＋快兵 1、已出 39、待出 0），寫明已全部出完、清場中、場上 38；快兵抵達城池算漏城 1",
      !!sp1 && sp1.planned === "39" && sp1.spawned === "39" && sp1.pending === "0" && /已全部出完（39 隻）：清場中，場上 38/.test(sp1.text) &&
        o1 && o1.spawn && o1.spawn.planned === 39 && o1.spawn.leaked === 1 && o1.spawn.alive === 38,
      out.F1);

    // 送一份 seq 很大的觀測（同一場、同一個出兵世代）：之後遊戲正常送來的 seq 較小、不採用，畫面停在這一份
    // 39 隻：每 3 隻輪一種（步卒、木樁、快兵）；第 0～9 隻受控、偶數隻灼燒、5 的倍數減速、7 的倍數暈眩；沒有 spawn 欄位（像舊版遊戲）
    const base = await obsTail();
    const kinds = ["mock_lv_walk", "mock_lv_post", "mock_lv_runner"];
    const craft = (seqAdd, endCharmOf = -1) => {
      const gen = base.generation;
      const enemies = Array.from({ length: 39 }, (_, i) => {
        const charmed = i < 10 && i !== endCharmOf;
        return {
          uid: `${gen}-${1000 + i}`, seq: 1000 + i, enemy_id: kinds[i % 3], hp: 500, max_hp: 500, flying: false,
          charmed, charm_left: charmed ? 1.5 : 0, charm_source: charmed ? "diao_chan" : "",
          atk: 10, atk_eff: 10, atk_down_left: 0, speed: 8, speed_eff: i % 5 === 0 ? 2.4 : 8, slow_left: i % 5 === 0 ? 0.4 : 0,
          immune_slow: false, stun_left: i % 7 === 0 ? 0.3 : 0, burn_left: i % 2 === 0 ? 1.5 : 0,
        };
      });
      const { spawn: _drop, __t: _t, ...rest } = base;
      return { ...rest, seq: base.seq + seqAdd, enemies, enemy_total: 39 };
    };
    await post(IFRAME, craft(100000));
    await H.sleep(800);
    const shown = await liveEnemies();
    const spHidden = (await spawnEl()) === null;
    const filters = () => page.evaluate(() => ({
      search: document.querySelector('[data-testid="battle-live-search"]')?.value ?? null,
      pressed: [...document.querySelectorAll('[data-testid^="battle-live-filter-"]')].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.testid.replace("battle-live-filter-", "")),
      matched: (() => { const m = document.querySelector('[data-testid="battle-live-matched"]'); return m ? { matched: Number(m.dataset.matched), total: Number(m.dataset.total), text: m.innerText } : null; })(),
      noMatch: !!document.querySelector('[data-testid="battle-live-no-match"]'),
      filtered: !!document.querySelector('[data-testid="live-enemy-filtered-out"]'),
      focus: document.activeElement?.dataset?.testid ?? null,
    }));
    run.check("F-2 沒有 spawn 欄位的一份（像舊版遊戲）：不顯示本波進度，其他照常（場上 39 隻）", spHidden && shown.total === 39, { spHidden, total: shown.total });

    // E-1：搜尋中文名稱
    await page.locator('[data-testid="battle-live-search"]').fill("步卒");
    await H.sleep(400);
    const e1 = { f: await filters(), l: await liveEnemies() };
    run.check("E-1 搜尋「步卒」：符合 13／39 隻（總數仍是 39），清單只列步卒、依出場順序",
      e1.f.matched && e1.f.matched.matched === 13 && e1.f.matched.total === 39 && /符合 13／39 隻/.test(e1.f.matched.text) && e1.l.total === 39 &&
        e1.l.rows.length === 13 && e1.l.rows.every((r) => r.id === "mock_lv_walk"),
      { f: e1.f, rows: e1.l.rows.length });

    // E-2：狀態多選 AND（受控＋灼燒；再加上搜尋步卒）
    await page.locator('[data-testid="battle-live-filter-charmed"]').click();
    await page.locator('[data-testid="battle-live-filter-burning"]').click();
    await H.sleep(300);
    const e2a = await filters();
    await page.locator('[data-testid="battle-live-search"]').fill("");
    await H.sleep(300);
    const e2b = await filters();
    run.check("E-2 狀態多選是 AND：步卒＋受控＋灼燒 2 隻；只看受控＋灼燒 5 隻；選中的狀態 aria-pressed、「全部」不按下；寫明同時選多個要全部符合",
      e2a.matched?.matched === 2 && e2b.matched?.matched === 5 && JSON.stringify(e2b.pressed.sort()) === JSON.stringify(["burning", "charmed"]) &&
        (await page.locator('[data-testid="battle-live-filters"]').innerText()).includes("同時選多個時要全部符合"),
      { e2a: e2a.matched, e2b: e2b.matched, pressed: e2b.pressed });

    // E-3：只看受控、選第 3 隻；下一份觀測裡第 3 隻控制結束 → 自動不符合，詳情仍是同一隻並說明不在篩選結果裡
    await page.locator('[data-testid="battle-live-filter-burning"]').click();
    await H.sleep(300);
    const e3a = await filters();
    const pickUid = `${base.generation}-1003`;
    await page.locator(`[data-testid="live-enemy"][data-uid="${pickUid}"]`).click();
    await H.sleep(300);
    await post(IFRAME, craft(100001, 3));
    await H.sleep(800);
    const e3b = { f: await filters(), l: await liveEnemies() };
    run.check("E-3 只看受控 10 隻；選第 3 隻後下一份觀測裡它的控制結束：符合變成 9（自動退出、不改指到別的敵人），詳情仍是第 3 隻並說明目前不在篩選結果裡（仍在場上）",
      e3a.matched?.matched === 10 && e3b.f.matched?.matched === 9 && !e3b.l.rows.some((r) => r.uid === pickUid) && e3b.l.detail?.uid === pickUid && e3b.f.filtered,
      { before: e3a.matched, after: e3b.f.matched, detail: e3b.l.detail && e3b.l.detail.uid, filtered: e3b.f.filtered });

    // E-4：沒有符合 → 清除；焦點到搜尋框
    await page.locator('[data-testid="battle-live-search"]').fill("不存在的敵人");
    await H.sleep(300);
    const e4a = await filters();
    await page.locator('[data-testid="battle-live-clear"]').click();
    await H.sleep(300);
    const e4b = { f: await filters(), l: await liveEnemies() };
    run.check("E-4 沒有符合時說明並提供「清除搜尋與篩選」；按下後搜尋與狀態都清掉、列出全部（第 1 頁 20 隻、共 39）、焦點在搜尋框",
      e4a.noMatch && e4a.matched?.matched === 0 && e4b.f.search === "" && e4b.f.pressed.length === 1 && e4b.f.pressed[0] === "all" && !e4b.f.matched &&
        e4b.l.rows.length === 20 && /共 39 隻/.test(e4b.l.pager?.text || "") && e4b.f.focus === "battle-live-search",
      { e4a: { noMatch: e4a.noMatch, matched: e4a.matched }, after: e4b.f, rows: e4b.l.rows.length });

    // E-5：鍵盤：從搜尋框 Tab 到狀態按鈕，空白鍵切換
    await page.locator('[data-testid="battle-live-search"]').focus();
    let reachedFilter = null;
    for (let i = 0; i < 8 && reachedFilter !== "battle-live-filter-charmed"; i++) {
      await page.keyboard.press("Tab");
      reachedFilter = await page.evaluate(() => document.activeElement?.dataset?.testid ?? null);
    }
    await page.keyboard.press(" ");
    await H.sleep(300);
    const e5a = await filters();
    await page.keyboard.press(" ");
    await H.sleep(300);
    const e5b = await filters();
    run.check("E-5 鍵盤：從搜尋框按 Tab 到「受控」，空白鍵按下（符合 9）、再按一次放開（回到全部）",
      reachedFilter === "battle-live-filter-charmed" && e5a.pressed.includes("charmed") && e5a.matched?.matched === 9 && !e5b.pressed.includes("charmed") && !e5b.matched,
      { reachedFilter, e5a: e5a.pressed, e5b: e5b.pressed });

    // E-6：390×600：搜尋框與狀態按鈕在畫面內、字級至少 12px、沒有橫向捲動
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(800);
    await page.locator('[data-testid="battle-live-filters"]').scrollIntoViewIfNeeded();
    const m6 = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="battle-live-filters"]');
      const b = el.getBoundingClientRect();
      const fonts = [...el.querySelectorAll("button, input, div")].map((x) => parseFloat(getComputedStyle(x).fontSize));
      return { left: Math.round(b.left), right: Math.round(b.right), vw: innerWidth, minFont: Math.min(...fonts), docScroll: document.documentElement.scrollWidth };
    });
    await H.shot(page, "battle-live-e-390x600");
    await page.setViewportSize({ width: 1280, height: 900 });
    await H.sleep(500);
    run.check("E-6 390×600：搜尋框與狀態按鈕在畫面寬度內、字級至少 12px、沒有橫向捲動（截圖另存）",
      m6.left >= 0 && m6.right <= m6.vw && m6.minFont >= 12 && m6.docScroll <= m6.vw, m6);

    // E-7／F-3：換場：搜尋、狀態、頁數、選中的敵人都清掉；新的一場備戰中，本波進度寫還沒開始出兵
    await page.locator('[data-testid="battle-live-search"]').fill("木樁");
    await page.locator('[data-testid="battle-live-filter-burning"]').click();
    await H.sleep(300);
    await closeLive();
    await H.selectStage(page, MAP.name);
    await H.sleep(1500);
    await dismissSplash(IFRAME).catch(() => {});
    await openLive();
    await page.locator('[data-testid="battle-live-tab-enemies"]').click();
    await H.sleep(800);
    const prep = { sp: await spawnEl(), l: await liveEnemies() };
    await H.clickButton(page, "迎戰");
    await waitUntil(async () => (await liveEnemies()).total >= 1 && (await filters()).search !== null, 30000, "新的一場出兵");
    const e7 = { f: await filters(), l: await liveEnemies(), sp: await spawnEl() };
    run.check("E-7 換關（新的一場）：開戰後敵人出現時搜尋是空的、狀態回到全部、沒有符合數與選中的敵人；F-3 新的一場備戰中寫「備戰中，還沒開始出兵」，開戰後寫第 1 波出兵中（已出 x／6）",
      !!prep.sp && /備戰中，還沒開始出兵/.test(prep.sp.text) && !prep.l.detail &&
        e7.f.search === "" && e7.f.pressed.join() === "all" && !e7.f.matched && !e7.l.detail && !!e7.sp && e7.sp.planned === "6" && /第 1 波/.test(e7.sp.text),
      { prep, e7 });
    await closeLive();
  });

  // ── G. 已部署武將的搜尋、受傷／低生命篩選與排序（D143）；H. 敵軍排序（D144）──
  // 送一份 seq 很大的觀測（目前這一場）：5 位武將（生命比例 100%、24%、77%、30%、100%）、39 隻敵人（生命比例與有效攻擊力各不同）
  const liveHeroRows = () => page.evaluate(() => ({
    uids: [...document.querySelectorAll('[data-testid="live-hero"]')].map((e) => e.dataset.uid),
    texts: [...document.querySelectorAll('[data-testid="live-hero"]')].map((e) => e.innerText.replace(/\s+/g, " ")),
    matched: (() => { const m = document.querySelector('[data-testid="battle-live-hero-matched"]'); return m ? { matched: Number(m.dataset.matched), total: Number(m.dataset.total), text: m.innerText } : null; })(),
    noMatch: !!document.querySelector('[data-testid="battle-live-hero-no-match"]'),
    search: document.querySelector('[data-testid="battle-live-hero-search"]')?.value ?? null,
    pressed: [...document.querySelectorAll('[data-testid^="battle-live-hero-health-"], [data-testid^="battle-live-hero-sort-"]')].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.testid.replace("battle-live-hero-", "")),
    note: document.querySelector('[data-testid="battle-live-hero-note"]')?.innerText ?? null,
    focus: document.activeElement?.dataset?.testid ?? null,
  }));
  const heroRowsFor = (heroes) => heroes.map(([n, id, hp, max]) => ({ uid: `hero-${n}`, hero_id: id, cell: [n, 2], hp, max_hp: max, skill: null }));
  const HEROES_G = [[1, "guan_yu", 1000, 1000], [2, "gan_ning", 300, 1235], [3, "diao_chan", 1000, 1294], [4, "xu_chu", 390, 1300], [5, "zhao_yun", 1100, 1100]];
  const craftG = (base, seqAdd, heroes, enemyOver = () => ({})) => {
    const gen = base.generation;
    const enemies = Array.from({ length: 39 }, (_, i) => ({
      uid: `${gen}-${2000 + i}`, seq: 2000 + i, enemy_id: ["mock_lv_walk", "mock_lv_post", "mock_lv_runner"][i % 3],
      hp: 1000 - ((i * 37) % 1000), max_hp: 1000, flying: false, charmed: false, charm_left: 0, charm_source: "",
      atk: 10 + (i % 4) * 5, atk_eff: 10 + (i % 4) * 5, atk_down_left: 0, speed: 8, speed_eff: 8, slow_left: 0,
      immune_slow: false, stun_left: 0, burn_left: i % 2 === 0 ? 1.5 : 0, ...enemyOver(i),
    }));
    const { spawn: _drop, __t: _t, ...rest } = base;
    return { ...rest, seq: base.seq + seqAdd, heroes: heroRowsFor(heroes), enemies, enemy_total: 39 };
  };
  const sortState = () => page.evaluate(() => ({
    pressed: [...document.querySelectorAll('[data-testid^="battle-live-sort-"]')].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.testid.replace("battle-live-sort-", "")),
    rows: [...document.querySelectorAll('[data-testid="live-enemy"]')].map((b) => ({ uid: b.dataset.uid, seq: Number(b.dataset.seq), ratio: Number(b.dataset.hpRatio), atk: Number(b.dataset.atkEff), text: b.innerText.replace(/\s+/g, " ") })),
    summary: document.querySelector('[data-testid="battle-live-enemy-total"]')?.innerText.replace(/\s+/g, " ") ?? "",
    pager: (() => { const p = document.querySelector('[data-testid="battle-live-pager"]'); return p ? { page: Number(p.dataset.page), pages: Number(p.dataset.pages) } : null; })(),
    detail: document.querySelector('[data-testid="live-enemy-detail"]')?.dataset.uid ?? null,
    matched: Number(document.querySelector('[data-testid="battle-live-matched"]')?.dataset.matched ?? -1),
  }));
  const nonDecreasing = (a) => a.every((v, i) => i === 0 || v >= a[i - 1]);
  const nonIncreasing = (a) => a.every((v, i) => i === 0 || v <= a[i - 1]);

  await section("G", async () => {
    await openLive();
    const base = await obsTail();
    await post(IFRAME, craftG(base, 200000, HEROES_G));
    await H.sleep(800);
    await page.locator('[data-testid="battle-live-tab-heroes"]').click();
    await H.sleep(300);
    const g1 = await liveHeroRows();
    run.check("G-1 武將分頁（目前這一場送來的 5 位）：預設依部署順序 1～5，每位寫出生命比例（甘寧 24%、許褚 30%）；沒有篩選時不顯示符合數",
      g1.uids.join() === "hero-1,hero-2,hero-3,hero-4,hero-5" && /甘寧.*（24%）/.test(g1.texts[1]) && /（30%）/.test(g1.texts[3]) && !g1.matched &&
        g1.pressed.sort().join() === "health-all,sort-deploy" && /依部署順序/.test(g1.note || ""),
      g1);

    await page.locator('[data-testid="battle-live-hero-search"]').fill("甘");
    await H.sleep(300);
    const g2a = await liveHeroRows();
    await page.locator('[data-testid="battle-live-hero-search"]').fill(" XU_CHU ");
    await H.sleep(300);
    const g2b = await liveHeroRows();
    await page.locator('[data-testid="battle-live-hero-search"]').fill("");
    run.check("G-2 搜尋中文名稱「甘」只剩甘寧（符合 1／在場 5 位）；搜尋 ID「 XU_CHU 」（不分大小寫、去空白）只剩許褚",
      g2a.uids.join() === "hero-2" && g2a.matched?.matched === 1 && g2a.matched?.total === 5 && /符合 1／在場 5 位/.test(g2a.matched.text) &&
        g2b.uids.join() === "hero-4",
      { g2a: { uids: g2a.uids, matched: g2a.matched }, g2b: g2b.uids });

    await page.locator('[data-testid="battle-live-hero-health-injured"]').click();
    await H.sleep(300);
    const g3a = await liveHeroRows();
    await page.locator('[data-testid="battle-live-hero-health-low"]').click();
    await H.sleep(300);
    const g3b = await liveHeroRows();
    run.check("G-3 受傷（生命少於最大生命）3 位：甘寧、貂蟬、許褚；低生命（≤30%）2 位：甘寧 24%、許褚剛好 30%；按鈕 aria-pressed 只有選中的那一個",
      g3a.uids.join() === "hero-2,hero-3,hero-4" && g3a.matched?.matched === 3 && g3b.uids.join() === "hero-2,hero-4" && g3b.matched?.matched === 2 &&
        g3b.pressed.sort().join() === "health-low,sort-deploy",
      { g3a: g3a.uids, g3b: g3b.uids, pressed: g3b.pressed });

    await page.locator('[data-testid="battle-live-hero-health-all"]').click();
    await page.locator('[data-testid="battle-live-hero-sort-hp"]').click();
    await H.sleep(300);
    const g4a = await liveHeroRows();
    await page.locator('[data-testid="battle-live-hero-health-injured"]').click();
    await H.sleep(300);
    const g4b = await liveHeroRows();
    run.check("G-4 依生命比例由低到高：甘寧 24%、許褚 30%、貂蟬 77%、關羽與趙雲都是 100%（依部署順序 1 在 5 前）；和「受傷」一起用時 3 位依比例排列；說明寫順序會跟著即時更新改變",
      g4a.uids.join() === "hero-2,hero-4,hero-3,hero-1,hero-5" && !g4a.matched && g4b.uids.join() === "hero-2,hero-4,hero-3" &&
        /生命即時更新，順序可能跟著改變/.test(g4a.note || ""),
      { g4a: g4a.uids, g4b: g4b.uids, note: g4a.note });

    // 下一份觀測：貂蟬掉到 10%、甘寧補到 100%（不再受傷）。焦點留在「生命比例」排序鈕，順序照新的一份
    await page.locator('[data-testid="battle-live-hero-sort-hp"]').focus();
    await post(IFRAME, craftG(base, 200001, [[1, "guan_yu", 1000, 1000], [2, "gan_ning", 1235, 1235], [3, "diao_chan", 130, 1294], [4, "xu_chu", 390, 1300], [5, "zhao_yun", 1100, 1100]]));
    await H.sleep(800);
    const g5 = await liveHeroRows();
    run.check("G-5 觀測更新：受傷＋生命比例的清單照新的一份變成貂蟬 10%、許褚 30%（甘寧補滿後不再列出）；焦點仍在排序鈕、條件不變（不搶焦點、不改選取）",
      g5.uids.join() === "hero-3,hero-4" && g5.matched?.matched === 2 && g5.focus === "battle-live-hero-sort-hp" &&
        g5.pressed.sort().join() === "health-injured,sort-hp",
      g5);

    await page.locator('[data-testid="battle-live-hero-search"]').fill("不存在的武將");
    await H.sleep(300);
    const g6a = await liveHeroRows();
    await page.locator('[data-testid="battle-live-hero-clear"]').click();
    await H.sleep(300);
    const g6b = await liveHeroRows();
    run.check("G-6 沒有符合時說明並提供「清除搜尋與篩選」；按下後搜尋與生命狀態清掉（排序保留生命比例）、列出 5 位、焦點在搜尋框",
      g6a.noMatch && g6a.matched?.matched === 0 && g6b.search === "" && g6b.pressed.sort().join() === "health-all,sort-hp" && g6b.uids.length === 5 &&
        !g6b.matched && g6b.focus === "battle-live-hero-search",
      { g6a: { noMatch: g6a.noMatch, matched: g6a.matched }, g6b });

    // 鍵盤：從搜尋框 Tab 到「低生命」，空白鍵切換
    await page.locator('[data-testid="battle-live-hero-search"]').focus();
    let reached = null;
    for (let i = 0; i < 6 && reached !== "battle-live-hero-health-low"; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => document.activeElement?.dataset?.testid ?? null);
    }
    await page.keyboard.press(" ");
    await H.sleep(300);
    const g7 = await liveHeroRows();
    run.check("G-7 鍵盤：從搜尋框按 Tab 到「低生命」、空白鍵選取（貂蟬 10%、許褚 30%）",
      reached === "battle-live-hero-health-low" && g7.uids.join() === "hero-3,hero-4" && g7.pressed.includes("health-low"),
      { reached, uids: g7.uids });

    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(800);
    await page.locator('[data-testid="battle-live-hero-filters"]').scrollIntoViewIfNeeded();
    const m8 = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="battle-live-hero-filters"]');
      const b = el.getBoundingClientRect();
      const fonts = [...el.querySelectorAll("button, input, div, span")].map((x) => parseFloat(getComputedStyle(x).fontSize));
      return { left: Math.round(b.left), right: Math.round(b.right), vw: innerWidth, minFont: Math.min(...fonts), docScroll: document.documentElement.scrollWidth };
    });
    await H.shot(page, "battle-live-g-390x600");
    await page.setViewportSize({ width: 1280, height: 900 });
    await H.sleep(500);
    run.check("G-8 390×600：武將的搜尋、生命狀態與排序在畫面寬度內、字級至少 12px、沒有橫向捲動（截圖另存）",
      m8.left >= 0 && m8.right <= m8.vw && m8.minFont >= 12 && m8.docScroll <= m8.vw, m8);

    // ── H. 敵軍排序 ──
    await page.locator('[data-testid="battle-live-tab-enemies"]').click();
    await H.sleep(300);
    const h0 = await sortState();
    await page.locator('[data-testid="battle-live-next"]').click();
    await H.sleep(200);
    await page.locator('[data-testid="battle-live-sort-hp"]').click();
    await H.sleep(300);
    const h1 = await sortState();
    run.check("H-1 敵軍預設依出場順序（seq 2000 起一路增加）；改成生命比例後回到第 1 頁、由低到高排列，每列寫出比例；說明寫依生命比例由低到高、即時更新順序可能改變",
      h0.pressed.join() === "spawn" && nonDecreasing(h0.rows.map((r) => r.seq)) && h0.rows[0].seq === 2000 && /依出場順序排列/.test(h0.summary) &&
        h1.pressed.join() === "hp" && h1.pager?.page === 1 && nonDecreasing(h1.rows.map((r) => r.ratio)) && /（\d+%）/.test(h1.rows[0].text) &&
        /依生命比例由低到高排列/.test(h1.summary) && /即時更新，順序可能跟著戰況改變/.test(h1.summary),
      { h0: { pressed: h0.pressed, first: h0.rows[0], summary: h0.summary }, h1: { pressed: h1.pressed, pager: h1.pager, ratios: h1.rows.map((r) => r.ratio).slice(0, 6), summary: h1.summary } });

    await page.locator('[data-testid="battle-live-sort-atk"]').click();
    await H.sleep(300);
    const h2 = await sortState();
    const atkPairs = h2.rows.map((r) => [r.atk, r.seq]);
    run.check("H-2 有效攻擊力由高到低（同數值依出場順序），每列寫出攻擊力",
      h2.pressed.join() === "atk" && nonIncreasing(h2.rows.map((r) => r.atk)) &&
        atkPairs.every((p, i) => i === 0 || p[0] < atkPairs[i - 1][0] || p[1] > atkPairs[i - 1][1]) && /攻 \d+/.test(h2.rows[0].text),
      { first: h2.rows.slice(0, 4) });

    // 依生命比例排序時選第 1 頁的第 1 隻；下一份觀測裡牠補滿生命（排到最後一頁）：詳情仍是同一隻，不改指到同位置的另一隻
    await page.locator('[data-testid="battle-live-sort-hp"]').click();
    await H.sleep(300);
    const h3a = await sortState();
    const pick = h3a.rows[0].uid;
    await page.locator(`[data-testid="live-enemy"][data-uid="${pick}"]`).click();
    await H.sleep(300);
    const pickSeq = Number(pick.split("-")[1]);
    await post(IFRAME, craftG(base, 200002, HEROES_G, (i) => (2000 + i === pickSeq ? { hp: 1000 } : {})));
    await H.sleep(800);
    const h3b = await sortState();
    run.check("H-3 選中的敵人在更新後排到別頁：詳情仍是同一隻（uid 相同），第 1 頁第 1 列換成另一隻，頁數合法",
      h3b.detail === pick && h3b.rows[0].uid !== pick && !h3b.rows.some((r) => r.uid === pick) && h3b.pager && h3b.pager.page >= 1 && h3b.pager.page <= h3b.pager.pages,
      { pick, detail: h3b.detail, first: h3b.rows[0].uid, pager: h3b.pager });

    await page.locator('[data-testid="battle-live-filter-burning"]').click();
    await H.sleep(300);
    const h4 = await sortState();
    run.check("H-4 先篩選再排序：灼燒 20 隻（符合數不因排序改變），清單依生命比例排列、都是偶數 seq（灼燒）",
      h4.matched === 20 && nonDecreasing(h4.rows.map((r) => r.ratio)) && h4.rows.every((r) => r.seq % 2 === 0),
      { matched: h4.matched, seqs: h4.rows.map((r) => r.seq).slice(0, 6) });

    // 換場：武將與敵軍的條件、排序都回到預設
    await closeLive();
    await H.selectStage(page, MAP.name);
    await H.sleep(1500);
    await dismissSplash(IFRAME).catch(() => {});
    await openLive();
    await page.locator('[data-testid="battle-live-tab-enemies"]').click();
    await H.clickButton(page, "迎戰");
    await waitUntil(async () => (await liveEnemies()).total >= 1, 30000, "新的一場出兵");
    const h5 = await sortState();
    // 新的一場送一份有 5 位武將的觀測，看武將的條件也回到預設
    await post(IFRAME, craftG(await obsTail(), 300000, HEROES_G));
    await H.sleep(800);
    await page.locator('[data-testid="battle-live-tab-heroes"]').click();
    await H.sleep(300);
    const g9 = await liveHeroRows();
    run.check("G-9／H-5 換關（新的一場）：敵軍排序回到出場順序；武將搜尋空白、生命狀態全部、排序部署順序，5 位依部署順序",
      g9.search === "" && g9.pressed.sort().join() === "health-all,sort-deploy" && g9.uids.join() === "hero-1,hero-2,hero-3,hero-4,hero-5" &&
        h5.pressed.join() === "spawn" && /依出場順序排列/.test(h5.summary),
      { g9: { search: g9.search, pressed: g9.pressed, uids: g9.uids }, h5: { pressed: h5.pressed, summary: h5.summary } });
    await closeLive();
  });

  // ── K. 武將的技能狀態篩選（D149）：冷卻中／本場已用過／無特殊技能，只認觀測明列的欄位 ──
  // 送一份 seq 很大的觀測（目前這一場，之後遊戲送來的較舊、不採用，畫面資料固定）：許褚怪力冷卻 2.4 秒、貂蟬魅惑 0 秒、甘寧奇襲已用過、
  // 馬超衝鋒還沒用、周倉沒有技能（skill: null）、關羽減速光環（常駐）
  const HEROES_K = [
    { uid: "hero-1", hero_id: "xu_chu", cell: [1, 2], hp: 1300, max_hp: 1300, skill: { id: "knockback", remaining: 2.4, cooldown: 3 } },
    { uid: "hero-2", hero_id: "diao_chan", cell: [2, 2], hp: 400, max_hp: 1294, skill: { id: "charm", remaining: 0, cooldown: 6 } },
    { uid: "hero-3", hero_id: "gan_ning", cell: [3, 2], hp: 300, max_hp: 1235, skill: { id: "assassinate", used: true } },
    { uid: "hero-4", hero_id: "ma_chao", cell: [4, 2], hp: 1100, max_hp: 1100, skill: { id: "first_strike", used: false } },
    { uid: "hero-5", hero_id: "zhou_cang", cell: [5, 2], hp: 200, max_hp: 1000, skill: null },
    { uid: "hero-6", hero_id: "guan_yu", cell: [6, 2], hp: 1000, max_hp: 1000, skill: { id: "slow_aura", active: true, affected: 0 } },
  ];
  const craftK = (base, seqAdd, heroes) => {
    const { spawn: _drop, __t: _t, ...rest } = base;
    return { ...rest, seq: base.seq + seqAdd, heroes, enemies: [], enemy_total: 0 };
  };
  const skillState = () => page.evaluate(() => ({
    uids: [...document.querySelectorAll('[data-testid="live-hero"]')].map((e) => e.dataset.uid),
    texts: [...document.querySelectorAll('[data-testid="live-hero"]')].map((e) => e.innerText.replace(/\s+/g, " ")),
    pressed: [...document.querySelectorAll('[data-testid^="battle-live-hero-skill-"]')].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.testid.replace("battle-live-hero-skill-", "")),
    buttons: [...document.querySelectorAll('[data-testid^="battle-live-hero-skill-"]')].filter((b) => b.tagName === "BUTTON").map((b) => b.innerText.trim()),
    matched: (() => { const m = document.querySelector('[data-testid="battle-live-hero-matched"]'); return m ? { matched: Number(m.dataset.matched), total: Number(m.dataset.total) } : null; })(),
    noMatch: !!document.querySelector('[data-testid="battle-live-hero-no-match"]'),
    note: document.querySelector('[data-testid="battle-live-hero-skill-note"]')?.innerText ?? null,
    search: document.querySelector('[data-testid="battle-live-hero-search"]')?.value ?? null,
    health: [...document.querySelectorAll('[data-testid^="battle-live-hero-health-"]')].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.dataset.testid.replace("battle-live-hero-health-", "")),
    focus: document.activeElement?.dataset?.testid ?? null,
  }));
  const clickSkill = async (id) => {
    await page.locator(`[data-testid="battle-live-hero-skill-${id}"]`).click();
    await H.sleep(300);
  };

  await section("K", async () => {
    await openLive();
    const base = await obsTail();
    await post(IFRAME, craftK(base, 400000, HEROES_K));
    await H.sleep(800);
    await page.locator('[data-testid="battle-live-tab-heroes"]').click();
    await H.sleep(300);
    const gas0 = (await H.gasLog(page)).length;
    const k0 = await skillState();
    await clickSkill("cooldown");
    const k1 = await skillState();
    run.check("K-1 技能狀態按鈕：全部（預設）、冷卻中、本場已用過、無特殊技能；冷卻中只有許褚（怪力還剩 2.4 秒），貂蟬的魅惑 0 秒不算；符合 1／在場 6 位，說明只算怪力、魅惑",
      k0.buttons.join() === "全部,冷卻中,本場已用過,無特殊技能" && k0.pressed.join() === "all" && k0.uids.length === 6 && !k0.matched &&
        k1.uids.join() === "hero-1" && /還剩 2\.4 秒/.test(k1.texts[0]) && k1.matched?.matched === 1 && k1.matched?.total === 6 &&
        k1.pressed.join() === "cooldown" && /怪力、魅惑/.test(k1.note || ""),
      { k0: { buttons: k0.buttons, pressed: k0.pressed, uids: k0.uids }, k1 });

    await clickSkill("used");
    const k2a = await skillState();
    await clickSkill("none");
    const k2b = await skillState();
    run.check("K-2 本場已用過只有甘寧（奇襲 used＝true；馬超衝鋒還沒用不算）；無特殊技能只有周倉（skill: null，沒有造出技能）；關羽的常駐光環都不在這兩種裡",
      k2a.uids.join() === "hero-3" && k2a.matched?.matched === 1 && k2b.uids.join() === "hero-5" && k2b.matched?.matched === 1 &&
        !k2a.uids.includes("hero-6") && !k2b.uids.includes("hero-6"),
      { used: k2a.uids, none: k2b.uids });

    await page.locator('[data-testid="battle-live-hero-health-low"]').click();
    await H.sleep(300);
    const k3a = await skillState();
    await clickSkill("used");
    await page.locator('[data-testid="battle-live-hero-search"]').fill("不存在的武將");
    await H.sleep(300);
    const k3b = await skillState();
    await page.locator('[data-testid="battle-live-hero-clear"]').click();
    await H.sleep(300);
    const k3c = await skillState();
    run.check("K-3 和生命、搜尋一起（AND）：無特殊技能＋低生命是周倉（20%）；本場已用過＋低生命＋搜不到是 0、說明並提供清除；清除後技能狀態回到全部、生命狀態全部、搜尋空白、焦點在搜尋框",
      k3a.uids.join() === "hero-5" && k3a.health.join() === "low" &&
        k3b.uids.length === 0 && k3b.noMatch && k3b.matched?.matched === 0 &&
        k3c.pressed.join() === "all" && k3c.health.join() === "all" && k3c.search === "" && k3c.uids.length === 6 && !k3c.matched && k3c.focus === "battle-live-hero-search",
      { k3a: k3a.uids, k3b: { uids: k3b.uids, noMatch: k3b.noMatch }, k3c });

    // 不用網頁的時鐘倒數：3 秒內沒有新的觀測，許褚仍是「還剩 2.4 秒」、仍在冷卻中
    await clickSkill("cooldown");
    await H.sleep(3000);
    const k4 = await skillState();
    // 新的一份觀測：許褚的冷卻結束（0 秒）。焦點留在「冷卻中」鈕，清單照新的一份（沒有符合）
    await page.locator('[data-testid="battle-live-hero-skill-cooldown"]').focus();
    await post(IFRAME, craftK(base, 400001, HEROES_K.map((h) => (h.uid === "hero-1" ? { ...h, skill: { ...h.skill, remaining: 0 } } : h))));
    await H.sleep(800);
    const k5 = await skillState();
    run.check("K-4 沒有新的觀測時不自己倒數（3 秒後許褚仍是還剩 2.4 秒、仍在冷卻中）；新的一份冷卻結束後冷卻中沒有符合，焦點仍在「冷卻中」鈕、條件不變",
      k4.uids.join() === "hero-1" && /還剩 2\.4 秒/.test(k4.texts[0]) &&
        k5.uids.length === 0 && k5.noMatch && k5.focus === "battle-live-hero-skill-cooldown" && k5.pressed.join() === "cooldown",
      { k4: k4.texts, k5: { uids: k5.uids, focus: k5.focus, pressed: k5.pressed } });

    // 鍵盤：從搜尋框按 Tab 到「本場已用過」、空白鍵選取
    await clickSkill("all");
    await page.locator('[data-testid="battle-live-hero-search"]').focus();
    let reached = null;
    for (let i = 0; i < 12 && reached !== "battle-live-hero-skill-used"; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => document.activeElement?.dataset?.testid ?? null);
    }
    await page.keyboard.press(" ");
    await H.sleep(300);
    const k6 = await skillState();
    const gas1 = (await H.gasLog(page)).length;
    run.check("K-5 鍵盤：從搜尋框按 Tab 到「本場已用過」、空白鍵選取（甘寧）；整段篩選沒有送出任何後端請求",
      reached === "battle-live-hero-skill-used" && k6.uids.join() === "hero-3" && k6.pressed.join() === "used" && gas1 === gas0,
      { reached, uids: k6.uids, gas0, gas1 });

    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(800);
    await page.locator('[data-testid="battle-live-hero-filters"]').scrollIntoViewIfNeeded();
    const m7 = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="battle-live-hero-filters"]');
      const b = el.getBoundingClientRect();
      const btns = [...el.querySelectorAll('[data-testid^="battle-live-hero-skill-"]')].map((x) => x.getBoundingClientRect());
      const fonts = [...el.querySelectorAll("button, input, div, span")].map((x) => parseFloat(getComputedStyle(x).fontSize));
      return { left: Math.round(b.left), right: Math.round(b.right), btnRight: Math.round(Math.max(...btns.map((r) => r.right))), vw: innerWidth, minFont: Math.min(...fonts), docScroll: document.documentElement.scrollWidth };
    });
    await H.shot(page, "battle-live-k-390x600");
    await page.setViewportSize({ width: 1280, height: 900 });
    await H.sleep(500);
    run.check("K-6 390×600：技能狀態按鈕在畫面寬度內、字級至少 12px、沒有橫向捲動（截圖另存）",
      m7.left >= 0 && m7.right <= m7.vw && m7.btnRight <= m7.vw && m7.minFont >= 12 && m7.docScroll <= m7.vw, m7);

    // 換場：技能狀態回到全部
    await closeLive();
    await H.selectStage(page, MAP.name);
    await H.sleep(1500);
    await dismissSplash(IFRAME).catch(() => {});
    await openLive();
    await post(IFRAME, craftK(await obsTail(), 500000, HEROES_K));
    await H.sleep(800);
    await page.locator('[data-testid="battle-live-tab-heroes"]').click();
    await H.sleep(300);
    const k8 = await skillState();
    run.check("K-7 換關（新的一場）：技能狀態回到全部、6 位都列出、沒有符合數",
      k8.pressed.join() === "all" && k8.uids.length === 6 && !k8.matched, { pressed: k8.pressed, uids: k8.uids });
    await closeLive();
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
    // 獨立戰鬥頁的武將搜尋、低生命篩選與敵軍排序（同一個面板元件）
    await post(BIFRAME, craftG(await obsTail(), 200000, HEROES_G));
    await H.sleep(800);
    await page.locator('[data-testid="battle-live-tab-heroes"]').click();
    await page.locator('[data-testid="battle-live-hero-health-low"]').click();
    await page.locator('[data-testid="battle-live-hero-sort-hp"]').click();
    await H.sleep(300);
    const gc = await liveHeroRows();
    await page.locator('[data-testid="battle-live-tab-enemies"]').click();
    await page.locator('[data-testid="battle-live-sort-atk"]').click();
    await H.sleep(300);
    const hc = await sortState();
    out.C2 = { heroes: gc.uids, matched: gc.matched, enemyPressed: hc.pressed, atk: hc.rows.map((r) => r.atk).slice(0, 5) };
    run.check("C-2 獨立戰鬥頁：武將低生命＋生命比例排序是甘寧 24%、許褚 30%（符合 2／在場 5 位）；敵軍依有效攻擊力由高到低",
      gc.uids.join() === "hero-2,hero-4" && gc.matched?.matched === 2 && gc.matched?.total === 5 &&
        hc.pressed.join() === "atk" && nonIncreasing(hc.rows.map((r) => r.atk)) && hc.rows.length > 0,
      out.C2);
    // 獨立戰鬥頁的技能狀態篩選（同一個面板元件）
    await post(BIFRAME, craftK(await obsTail(), 400000, HEROES_K));
    await H.sleep(800);
    await page.locator('[data-testid="battle-live-tab-heroes"]').click();
    await page.locator('[data-testid="battle-live-hero-clear"]').click().catch(() => {});
    await page.locator('[data-testid="battle-live-hero-health-all"]').click();
    await clickSkill("used");
    const kc = await skillState();
    out.C3 = { uids: kc.uids, matched: kc.matched, pressed: kc.pressed };
    run.check("C-3 獨立戰鬥頁：技能狀態「本場已用過」只有甘寧（符合 1／在場 6 位）",
      kc.uids.join() === "hero-3" && kc.matched?.matched === 1 && kc.matched?.total === 6 && kc.pressed.join() === "used", out.C3);
  });

  // ── A4. 主頁：許褚的怪力 3→0（專用的測試關：起點有一個不會移動的木樁，這一場不會在冷卻期間結束）──
  // 遊戲區（iframe 的範圍）的平均亮度 0～255：只用在這支測試、這個固定的測試關與視窗大小，判斷進場畫面（蓋滿遊戲區的深色半透明層，
  // 實測約 23）是否開著、關掉後的地圖（約 89）；不是產品的就緒判斷
  const luma = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left, y: b.top, width: b.width, height: b.height };
    }, sel);
    const png = await page.screenshot({ clip: r });
    return page.evaluate(async (b64) => {
      const blob = await (await fetch("data:image/png;base64," + b64)).blob();
      const bmp = await createImageBitmap(blob);
      const c = new OffscreenCanvas(64, 64);
      const g = c.getContext("2d");
      g.drawImage(bmp, 0, 0, 64, 64);
      const d = g.getImageData(0, 0, 64, 64).data;
      let t = 0;
      for (let i = 0; i < d.length; i += 4) t += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      return Math.round(t / (d.length / 4));
    }, png.toString("base64"));
  };
  const SPLASH_DARK = 45;
  const MAP_CLEAR = 60;
  const iframeRect = () =>
    page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    }, IFRAME);
  await section("A4", async () => {
    // 診斷紀錄一開始就掛上（中途失敗也留得下）
    const prep = { snap: null, dark: [], clicks: [], preClick: null };
    out.A4prep = prep;
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.selectStage(page, KB.name);
    // 前置（有明確判斷與上限，失敗時保留診斷）：快照確認是怪力專用關、備戰中；等進場畫面確實出現（遊戲區變暗）才點掉，
    // 確認已關掉（變亮）才點路上的格子。這是推論、不是已證實的唯一原因：原始碼裡 selectStage 只等「有一份 wave 0 的同步」，
    // 遊戲在那之後才顯示進場畫面，太早點會點空、下一次點格子就只是關掉進場畫面；支持的依據是原始碼順序、亮度實測（約 23→89）
    // 與改用這個前置後的成功執行，曾失敗的那一次本身沒有亮度與快照紀錄
    await waitUntil(async () => {
      const s = await snapshot(IFRAME);
      prep.snap = { stage: s.stage, game_state: s.game_state, battle_id: s.battle_id };
      return s.stage === KB.id && s.game_state === 1;
    }, 30000, "切到怪力專用關（備戰中）");
    await waitUntil(async () => {
      const l = await luma(IFRAME);
      prep.dark.push(l);
      return l < SPLASH_DARK;
    }, 20000, "進場畫面出現（遊戲區變暗）");
    for (let i = 0; i < 3; i++) {
      await dismissSplash(IFRAME);
      prep.clicks.push(await luma(IFRAME));
      if (prep.clicks[prep.clicks.length - 1] > MAP_CLEAR) break;
    }
    if (!(prep.clicks[prep.clicks.length - 1] > MAP_CLEAR))
      throw new Error("進場畫面點了 3 次仍沒有關掉：" + JSON.stringify(prep));
    // 實際點擊部署前的遊戲區範圍與點擊座標（失敗時另外記錄失敗當下的，兩者分開，不拿事後重算的點當原點）
    prep.preClick = { rect: await iframeRect(), click: await cellPoint(IFRAME, KB_CELL[0], KB_CELL[1]) };
    try {
      await deploy(IFRAME, KB_CELL, "許褚");
    } catch (e) {
      // 部署選單沒出現：保存失敗當下的快照、遊戲區範圍與重算的點擊座標、亮度、這一場的橋接訊息與截圖，照樣讓這一段失敗
      const s = await snapshot(IFRAME).catch(() => null);
      out.A4deployFail = {
        snap: s && { stage: s.stage, game_state: s.game_state, battle_id: s.battle_id, wave: s.wave },
        rect: await iframeRect(),
        click: await cellPoint(IFRAME, KB_CELL[0], KB_CELL[1]),
        luma: await luma(IFRAME).catch(() => null),
        bridge: await page.evaluate(() => (window.__bridgeLog || []).slice(-15).map((m) => ({ type: m.type, wave: m.wave, game_state: m.game_state, battle_id: m.battle_id }))),
        shot: await H.shot(page, "battle-live-A4-deploy-fail").catch(() => null),
      };
      throw e;
    }
    // 備戰中選取一次（和 A-2 的甘寧相同），之後不重新點選；開戰、切 2 倍速後木人才走到許褚面前
    await select(IFRAME, KB_CELL, "unit-panel-knockback");
    await H.clickButton(page, "迎戰");
    await page.locator('[data-testid="speed-2"]').first().click();
    const obs0 = (await obsTail())?.seq ?? 0;
    let high4 = null;
    let low4 = null;
    const seen4 = [];
    await waitUntil(async () => {
      const n = await note("unit-panel-knockback");
      if (n) seen4.push(n.remaining);
      if (n && n.remaining > 1.5) high4 = n;
      if (high4 && n && n.remaining <= 0.2) low4 = n;
      return !!low4;
    }, 60000, "怪力冷卻 3→0");
    await page.locator('[data-testid="speed-1"]').first().click();
    // 遊戲自己送的觀測裡許褚的冷卻（證據：冷卻出現、下降到 0 的過程，和面板對照）
    const obs4 = await page.evaluate((from) => (window.__obsLog || []).filter((o) => o.seq > from).map((o) => {
      const h = (o.heroes || []).find((x) => x.hero_id === "xu_chu");
      return { seq: o.seq, state: o.state ?? o.game_state ?? null, rem: h && h.skill ? h.skill.remaining : null };
    }), obs0);
    const obsHigh = obs4.findIndex((o) => o.rem > 1.5);
    const obsLow = obsHigh >= 0 ? obs4.slice(obsHigh).findIndex((o) => o.rem !== null && o.rem <= 0.2) : -1;
    out.A4 = { high4, low4, panel: seen4.slice(0, 80), obs: obs4.slice(0, 120), obsHigh, obsLow };
    run.check("A-4 2 倍速、選取許褚後不重新點選：怪力推動後面板出現冷卻（大於 1.5 秒），之後同一個面板降到 0（可以推動）；遊戲送的觀測同樣出現冷卻後降到 0",
      !!high4 && !!low4 && /怪力：目前冷卻中/.test(high4.text) && low4.live === "1" && obsHigh >= 0 && obsLow >= 0,
      { high4, low4, obsHigh, obsLow });
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_lv_fixture")).catch(() => {});
  return run.finish(out);
}
