async (page) => {
  // 飛行路線無效與防禦塔「優先飛行」（瀏覽器，真 Godot 產物）。這支腳本另外加三個測試關（只在它開啟時出現，不影響其他腳本）：
  // - Mock R 飛行路線無效（chapter2_2）：第 1 波只有飛行組，路線是起終點同格的環狀路線與只有一個路點的路線 → 遊戲拒絕開戰
  // - Mock S 飛行混合無效（chapter2_3）：同一波有無效的飛行組（環狀路線）、步兵 2、合法的飛騎 1 → 只出 3 隻、不會一開戰就扣城血
  // - Mock U 優先飛行（chapter2_4）：不會移動的地面（剩餘 10 格）與飛行（剩餘 13 格），弓兵塔 (1,4)、文士塔 (2,4) 都打得到兩個
  // 檢查：
  // - V：兩個關卡選擇入口的卡片提醒與敵軍預覽（無效的組「不會出兵」、原因、數量不算、拒絕的波次）和戰場上實際出兵一致
  // - A：主頁實際選塔切到「優先飛行」、觀察弓兵塔打誰、文士塔減速誰；步兵塔沒有這個選項；偽造的面板按了也不會變成選取（Godot 拒絕）；
  //      晚到的其他塔回覆不套用；沒有 target_modes 的舊遊戲只顯示三種
  // - R：主頁拒絕開戰的提示（原因、仍在備戰、城池 20、沒有結算），Esc 關閉、出口「切換關卡」打開的關卡選擇沒有被提示蓋住：
  //      原本提示範圍內的有效關卡用 hit-test 確認在最上層，再用真實滑鼠點下去換關（新的 battle_id）
  // - M：主頁混合關實際只出 3 隻、城池不變
  // - B：獨立戰鬥頁的優先飛行（鍵盤選取）與拒絕開戰提示（出口回到關卡選擇）
  // - N：390 寬的單位面板（四個選項）與拒絕提示、鍵盤焦點
  // 全部 mock、虛構金鑰 test_airfirst_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin({
    expectedConsole: [
      /拒絕開始第 \d+ 波/,
      /^WARNING: \[WaveManager\] 飛行敵人組 'mock_flyer' 的路線 path_(loop|single) 無效（flight_(same_endpoints|single_point)），跳過此組$/,
      /^\s*at: push_(warning|error) \(core\/variant\/variant_utility\.cpp:\d+\)$/,
      /^\s*GDScript backtrace/,
      /^\s*\[\d+\] \w+ \(res:\/\/[\w/]+\.gd:\d+\)$/,
    ],
  });
  const out = {};
  const KEY = "test_airfirst_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const R = { id: "chapter2_2", name: "Mock R 飛行路線無效" };
  const MIX = { id: "chapter2_3", name: "Mock S 飛行混合無效" };
  const U = { id: "chapter2_4", name: "Mock U 優先飛行" };

  // ── 測試關（get_all_maps／get_enemies_config 的回應後面接上；只在 __shenma_af_fixture 開啟時）──
  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = (paths) => ({ cols: 14, rows: 11, paths, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" });
  const grp = (enemy_id, count, interval, path) => ({ enemy_id, count, interval, path });
  const straight = [[0, ROW], [13, ROW]];
  const loop = [[0, ROW], [4, ROW], [4, ROW - 3], [0, ROW - 3], [0, ROW]];
  const EXTRA = {
    enemies: [
      { enemy_id: "mock_post_g", name: "木樁兵", hp: 99999, speed: 0, image: "enemy_grunt1.webp", movement_type: "ground" },
      { enemy_id: "mock_post_f", name: "木樁鳥", hp: 99999, speed: 0, image: "enemy_cavalry1.webp", movement_type: "flying" },
    ],
    maps: [
      {
        map_id: R.id, chapter: 2, name: R.name, unlock_stage: R.id,
        path_json: pj({ path_a: straight, path_loop: loop, path_single: [[6, ROW - 3]] }),
        waves: [{ wave: 1, enemies: [grp("mock_flyer", 2, 0.5, "path_loop"), grp("mock_flyer", 1, 0.5, "path_single")] }],
      },
      {
        map_id: MIX.id, chapter: 2, name: MIX.name, unlock_stage: MIX.id,
        path_json: pj({ path_a: straight, path_loop: loop }),
        waves: [{ wave: 1, enemies: [grp("mock_flyer", 2, 0.5, "path_loop"), grp("mock_grunt", 2, 1.0, "path_a"), grp("mock_flyer", 1, 1.0, "path_a")] }],
      },
      {
        map_id: U.id, chapter: 2, name: U.name, unlock_stage: U.id,
        path_json: pj({ path_g: [[3, ROW], [13, ROW]], path_f: [[0, ROW - 2], [13, ROW - 2]] }),
        waves: [{ wave: 1, enemies: [grp("mock_post_g", 1, 0.5, "path_g"), grp("mock_post_f", 1, 0.5, "path_f")] }],
      },
    ],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_af_fixture") === "1") {
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

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const profile = () => ({
    nickname: "優先飛行", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: U.id, heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }],
  });
  const snapshot = async (sel) => {
    const id = "af-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  // 等遊戲時間前進 sec 秒，回傳前後兩份快照
  const overGameTime = async (sel, sec) => {
    const a = await snapshot(sel);
    let b = a;
    const end = Date.now() + 60000;
    while (b.game_time - a.game_time < sec && Date.now() < end) {
      await H.sleep(250);
      b = await snapshot(sel);
    }
    return { a, b };
  };
  // 這段時間裡每一種敵人受到的傷害，以及結束時的疊加減速
  const effects = ({ a, b }) => {
    const r = {};
    for (const [id, kind] of Object.entries(b.enemy_kind || {})) {
      r[kind] = { dmg: Math.round(((a.enemy_hp || {})[id] ?? b.enemy_hp[id]) - b.enemy_hp[id]), slow: Math.round(((b.enemy_slow || {})[id] || 0) * 1000) / 1000 };
    }
    return r;
  };
  const towerAt = (snap, c, row) => Object.entries(snap.tower_targets || {}).find(([, t]) => same(t.cell, [c, row]));
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
  const placeTower = async (sel, c, row, name) => {
    await clickCell(sel, c, row);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    await page.locator('[data-testid="placement-menu"] button[class*="menuCard"]', { hasText: name }).click();
    await H.sleep(500);
  };
  // 點選場上的塔，回傳單位面板的目標優先選項
  const openPanel = async (sel, c, row) => {
    await clickCell(sel, c, row);
    await page.waitForSelector('[data-testid="tower-target"]', { timeout: 15000 });
    return panelInfo();
  };
  const panelInfo = () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-testid="unit-panel"]');
      if (!root) return null;
      const btns = [...root.querySelectorAll('button[data-testid^="tower-target-"]')];
      const hint = root.querySelector('[data-testid="tower-target-hint"]');
      return {
        name: root.querySelector('[class*="unitName"]').innerText.replace(/\s+/g, " "),
        modes: btns.map((b) => b.getAttribute("data-testid").replace("tower-target-", "")),
        labels: btns.map((b) => b.innerText.trim()),
        pressed: btns.filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.getAttribute("data-testid").replace("tower-target-", "")),
        hint: hint ? hint.innerText : null,
      };
    });
  const closePanel = async () => {
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click();
    await H.sleep(300);
  };
  const waitPressed = (mode, timeout = 10000) =>
    page.waitForFunction((m) => document.querySelector(`[data-testid="tower-target-${m}"]`)?.getAttribute("aria-pressed") === "true", mode, { timeout });
  // 從遊戲 iframe 裡送一則訊息給頁面（和 Godot 送的來源相同），用來模擬舊遊戲、偽造的面板與晚到的回覆
  const fromGame = (sel, msg) =>
    page.evaluate(({ sel, msg }) => document.querySelector(sel).contentWindow.eval(`window.parent.postMessage(${JSON.stringify(msg)}, '*')`), { sel, msg });
  const startBattle = async () => {
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
  };
  const waitEnemies = (sel, n) =>
    (async () => {
      const end = Date.now() + 30000;
      for (;;) {
        const s = await snapshot(sel);
        if (Object.keys(s.enemy_kind || {}).length >= n) return s;
        if (Date.now() > end) throw new Error(`等不到 ${n} 個敵人`);
        await H.sleep(200);
      }
    })();
  const cardOf = (name) => page.locator('div[class*="stageCard"]', { has: page.locator("div", { hasText: new RegExp("^" + name + "$") }) }).first();
  const previewRead = async (name) => {
    await cardOf(name).locator('[data-testid="enemy-preview-open"]').click();
    await page.waitForSelector('[data-testid="enemy-preview"]', { timeout: 10000 });
    const info = await page.evaluate(() => {
      const root = document.querySelector('[data-testid="enemy-preview"]');
      const w = root.querySelector('[data-testid="preview-wave-1"]');
      return {
        header: w.querySelector('[data-testid="preview-wave-toggle-1"]').innerText.replace(/\s+/g, " "),
        body: w.innerText.replace(/\s+/g, " "),
        groups: [...w.querySelectorAll('[data-testid="preview-group"]')].map((g) => [g.getAttribute("data-movement"), g.getAttribute("data-outcome"), g.getAttribute("data-flight-problem")]),
        air: (() => {
          const a = root.querySelector('[data-testid="air-readiness"]');
          return a ? { invalid: a.getAttribute("data-invalid-flying"), kind: a.getAttribute("data-kind"), text: a.innerText.replace(/\s+/g, " ") } : null;
        })(),
      };
    });
    return info;
  };
  const cardAir = (name) =>
    cardOf(name).locator('[data-testid="air-readiness"]').first().evaluate((a) => ({ invalid: a.getAttribute("data-invalid-flying"), kind: a.getAttribute("data-kind"), text: a.innerText.replace(/\s+/g, " ") })).catch(() => null);
  const rejectInfo = () =>
    page.evaluate(() => {
      const n = document.querySelector('[data-testid="wave-reject"]');
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return {
        wave: n.getAttribute("data-wave"), text: n.innerText.replace(/\s+/g, " "),
        lines: [...n.querySelectorAll('[data-testid="wave-reject-lines"] li')].map((l) => l.innerText),
        focused: document.activeElement === n, rect: { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) },
        vw: window.innerWidth, vh: window.innerHeight, scrollW: document.documentElement.scrollWidth,
      };
    });
  // 關卡選擇視窗裡、和 rect（原本提示的範圍）重疊最多的有效關卡（排除 exclude）：它的「選擇關卡」按鈕和 rect 的交集中心點，
  // 以及該點最上層的元素是不是這顆按鈕
  const stageUnder = (rect, exclude) =>
    page.evaluate(({ rect, exclude }) => {
      let pick = null;
      for (const c of document.querySelectorAll('[class*="modalPanel"] [data-testid="stage-card"][data-access="playable"]')) {
        if (c.getAttribute("data-map-id") === exclude) continue;
        const btn = c.querySelector('[data-testid="stage-select"]');
        const r = btn.getBoundingClientRect();
        const l = Math.max(r.left, rect.left), t = Math.max(r.top, rect.top);
        const rr = Math.min(r.right, rect.right), b = Math.min(r.bottom, rect.bottom);
        const area = rr - l > 4 && b - t > 4 ? (rr - l) * (b - t) : 0;
        if (area > 0 && (!pick || area > pick.area)) pick = { id: c.getAttribute("data-map-id"), btn, x: (l + rr) / 2, y: (t + b) / 2, area };
      }
      if (!pick) return null;
      const top = document.elementFromPoint(pick.x, pick.y);
      return { id: pick.id, x: Math.round(pick.x), y: Math.round(pick.y), onButton: !!top && pick.btn.contains(top), inReject: !!(top && top.closest('[data-testid="wave-reject"]')) };
    }, { rect, exclude });
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `air-first-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };

  // ── 準備 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_af_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, p: profile() });
    await page.setViewportSize({ width: 540, height: 900 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
  });

  // ── V. 關卡卡片的提醒與敵軍預覽 ──
  await section("V", async () => {
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
    const cardR = await cardAir(R.name);
    const cardS = await cardAir(MIX.name);
    const pr = await previewRead(R.name);
    const prShot = await H.shot(page, "air-first-v1-preview-reject");
    await page.locator('[data-testid="enemy-preview-close"]').click();
    await H.sleep(300);
    const ps = await previewRead(MIX.name);
    const psShot = await H.shot(page, "air-first-v2-preview-mixed");
    await page.locator('[data-testid="enemy-preview-close"]').click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    out.V_main = { cardR, cardS, pr, ps, prShot, psShot };
    run.check("V-1 主頁關卡視窗：全無效的飛行關卡片提醒「2 組飛行敵人的路線無效，遊戲不會出兵」；敵軍預覽的兩組都是「不會出兵」、原因分別是起終點同格與只有一個路點，這一波「遊戲會拒絕這一波」",
      cardR && cardR.invalid === "2" && /2 組飛行敵人的路線無效/.test(cardR.text) &&
        same(pr.groups, [["flying", "skip", "flight_same_endpoints"], ["flying", "skip", "flight_single_point"]]) &&
        /遊戲會拒絕這一波/.test(pr.header) && /起點和終點是同一格/.test(pr.body) && /只有一個路點/.test(pr.body) && /不會出兵/.test(pr.body) &&
        pr.air && pr.air.invalid === "2" && /路線無效、遊戲不會出兵的飛行敵人/.test(pr.air.text),
      out.V_main);
    run.check("V-2 主頁關卡視窗：混合關的預覽第 1 波「3 隻」（無效的飛行組不算），組的結果是 不會出兵／出兵／出兵；對空提醒只算合法的飛騎 ×1，另外列出 1 組路線無效",
      /3 隻/.test(ps.header) && same(ps.groups, [["flying", "skip", "flight_same_endpoints"], ["ground", "spawn", ""], ["flying", "spawn", ""]]) &&
        ps.air && ps.air.kind === "flying" && ps.air.invalid === "1" && /飛騎 ×1/.test(ps.air.text) && cardS && cardS.invalid === "1",
      out.V_main);

    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="enemy-preview-open"]', { timeout: 60000 });
    const cardR2 = await cardAir(R.name);
    const ps2 = await previewRead(MIX.name);
    await page.locator('[data-testid="enemy-preview-close"]').click();
    out.V_stages = { cardR2, ps2, shot: await H.shot(page, "air-first-v3-stages") };
    run.check("V-3 獨立關卡頁：全無效關的卡片提醒相同；混合關的預覽同樣是 3 隻、無效的組不會出兵",
      cardR2 && cardR2.invalid === "2" && /3 隻/.test(ps2.header) && same(ps2.groups, ps.groups), out.V_stages);
  });

  // ── A. 主頁：優先飛行 ──
  await section("A", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, U.name);
    await dismissSplash(IFRAME);
    await placeTower(IFRAME, 1, 4, "弓兵塔");
    await placeTower(IFRAME, 2, 4, "文士塔");
    await placeTower(IFRAME, 5, 6, "步兵塔");
    await startBattle();
    await waitEnemies(IFRAME, 2);
    const first = effects(await overGameTime(IFRAME, 2.6));
    out.A_first = first;
    run.check("A-1 預設「優先前方」：地面（剩餘 10 格）比飛行（13 格）前面，弓兵塔只打地面、文士塔只減速地面",
      first.mock_post_g.dmg > 0 && first.mock_post_f.dmg === 0 && first.mock_post_g.slow > 0 && first.mock_post_f.slow === 0, first);

    const archer = await openPanel(IFRAME, 1, 4);
    const archerShot = await H.shot(page, "air-first-a2-archer-panel");
    await page.locator('[data-testid="tower-target-air_first"]').click();
    await waitPressed("air_first");
    const archerAfter = await panelInfo();
    const snapA = await snapshot(IFRAME);
    out.A_archer = { archer, archerAfter, mode: towerAt(snapA, 1, 4)?.[1], archerShot };
    run.check("A-2 弓兵塔的面板：四個選項（優先前方、血量最多、血量最少、優先飛行），預設按下優先前方；按「優先飛行」後 Godot 回覆，面板按下優先飛行、說明是先打射程內的飛行，Godot 的模式是 air_first",
      same(archer.modes, ["first", "strongest", "weakest", "air_first"]) && archer.labels[3] === "優先飛行" && same(archer.pressed, ["first"]) &&
        same(archerAfter.pressed, ["air_first"]) && /先打飛行/.test(archerAfter.hint) && out.A_archer.mode?.mode === "air_first" && same(out.A_archer.mode?.modes, archer.modes),
      out.A_archer);
    await closePanel();
    const archerAir = effects(await overGameTime(IFRAME, 2.6));
    out.A_archer_air = archerAir;
    run.check("A-3 弓兵塔選優先飛行後只打飛行（地面的血量不再下降）", archerAir.mock_post_f.dmg > 0 && archerAir.mock_post_g.dmg === 0, archerAir);

    // 文士塔用鍵盤選取
    const scholar = await openPanel(IFRAME, 2, 4);
    await page.locator('[data-testid="tower-target-air_first"]').focus();
    await page.keyboard.press("Enter");
    await waitPressed("air_first");
    const scholarAfter = await panelInfo();
    out.A_scholar = { scholar, scholarAfter, shot: await H.shot(page, "air-first-a4-scholar-panel") };
    run.check("A-4 文士塔的面板：四個選項；說明寫「減速」而不是「打」；鍵盤 Enter 選「優先飛行」後按下狀態跟著 Godot 的回覆，說明是先減速飛行",
      same(scholar.modes, ["first", "strongest", "weakest", "air_first"]) && /減速/.test(scholar.hint) && !/打/.test(scholar.hint) &&
        same(scholarAfter.pressed, ["air_first"]) && /先減速飛行/.test(scholarAfter.hint) && !/打/.test(scholarAfter.hint),
      out.A_scholar);
    await closePanel();
    // 地面上次被減速後 3.5 秒內還有殘留：等 4.2 秒遊戲時間再看
    const scholarAir = effects(await overGameTime(IFRAME, 4.2));
    out.A_scholar_air = scholarAir;
    run.check("A-5 文士塔選優先飛行後只減速飛行（地面的減速到期後不再被減速），兩座塔都沒有打地面", scholarAir.mock_post_f.slow > 0 && scholarAir.mock_post_g.slow === 0 && scholarAir.mock_post_g.dmg === 0, scholarAir);

    // 步兵塔：只有三個選項；偽造的面板（列出 air_first）按了，Godot 拒絕、不回覆，按下狀態不變
    const inf = await openPanel(IFRAME, 5, 6);
    const snapI = await snapshot(IFRAME);
    const [infUid] = towerAt(snapI, 5, 6) || [];
    const idx = await H.bridgeLen(page);
    await fromGame(IFRAME, { __godot_bridge: true, type: "show_upgrade_panel", unit_type: "tower", tower_type: "infantry", name: "步兵塔", level: 1, atk: 20, atk_spd: 0.67, range: 1.5, upgrade_cost: 60, max_level: false, can_afford: true, tower_uid: infUid, battle_id: snapI.battle_id, target_mode: "first", target_modes: ["first", "strongest", "weakest", "air_first"], invested_gold: 70, sell_refund: 35, can_sell: false, anti_air: false, screen_pos: { x: 200, y: 300 } });
    await page.waitForSelector('[data-testid="tower-target-air_first"]', { timeout: 5000 });
    await page.locator('[data-testid="tower-target-air_first"]').click();
    await H.sleep(1500);
    const forged = await panelInfo();
    const replies = (await H.bridgeSince(page, idx)).filter((m) => m.type === "tower_target_changed");
    const snapI2 = await snapshot(IFRAME);
    out.A_infantry = { inf, forged, replies: replies.length, godotMode: towerAt(snapI2, 5, 6)?.[1]?.mode };
    run.check("A-6 步兵塔（只打地面）的面板只有三個選項；偽造成有「優先飛行」的面板按下後 Godot 拒絕、沒有回覆，面板仍按下優先前方、Godot 的模式仍是 first（前端不會自己假裝已選取）",
      same(inf.modes, ["first", "strongest", "weakest"]) && !inf.labels.includes("優先飛行") && same(forged.pressed, ["first"]) && replies.length === 0 && out.A_infantry.godotMode === "first",
      out.A_infantry);
    // 晚到的回覆：別座塔（弓兵塔）的 tower_target_changed 不套用到目前的面板
    const snapArcher = towerAt(snapI2, 1, 4);
    await fromGame(IFRAME, { __godot_bridge: true, type: "tower_target_changed", battle_id: snapI2.battle_id, tower_uid: snapArcher[0], target_mode: "air_first" });
    await H.sleep(500);
    const afterStale = await panelInfo();
    // 舊遊戲（沒有 target_modes）的面板：弓兵塔也只顯示三種
    await fromGame(IFRAME, { __godot_bridge: true, type: "show_upgrade_panel", unit_type: "tower", tower_type: "archer", name: "弓兵塔", level: 1, atk: 30, atk_spd: 1.25, range: 2.5, upgrade_cost: 50, max_level: false, can_afford: true, tower_uid: snapArcher[0], battle_id: snapI2.battle_id, target_mode: "first", invested_gold: 50, sell_refund: 25, can_sell: false, anti_air: true, screen_pos: { x: 200, y: 300 } });
    await H.sleep(500);
    const oldGame = await panelInfo();
    out.A_misc = { afterStale, oldGame };
    run.check("A-7 其他塔晚到的回覆不改變目前面板的按下狀態；沒有 target_modes 的面板（舊遊戲）即使是弓兵塔也只顯示三個選項",
      same(afterStale.pressed, ["first"]) && /步兵塔/.test(afterStale.name) && same(oldGame.modes, ["first", "strongest", "weakest"]), out.A_misc);
    await closePanel();
  });

  // ── R. 主頁：拒絕開戰 ──
  await section("R", async () => {
    await H.selectStage(page, R.name);
    await dismissSplash(IFRAME);
    const idx = await H.bridgeLen(page);
    await startBattle();
    const msg = await H.waitBridge(page, idx, { type: "wave_rejected" }, 30000);
    await page.waitForSelector('[data-testid="wave-reject"]', { timeout: 10000 });
    await H.sleep(1500);
    const info = await rejectInfo();
    const snap = await snapshot(IFRAME);
    const startEnabled = await page.getByRole("button", { name: "迎戰", exact: true }).isEnabled();
    const resultCard = await page.locator('[data-testid="result-card"]').count();
    out.R1 = { msg: { wave: msg.wave, missing: msg.missing, skipped: msg.skipped, hasKey: JSON.stringify(msg).includes('"key"') }, info, state: { gs: snap.game_state, wave: snap.wave, hp: snap.hp, enemies: Object.keys(snap.enemy_kind || {}).length }, startEnabled, resultCard, shot: await H.shot(page, "air-first-r1-reject-main") };
    run.check("R-1 主頁全無效的飛行關：Godot 拒絕開戰（wave_rejected 第 1 波，逐組原因，不含玩家 key）；提示「第 1 波無法開始」列出兩組原因、說明仍在備戰；Godot 仍在備戰、波次 0、城池 20、場上沒有敵人、沒有結算；迎戰按鈕可以再按；提示出現時取得焦點",
      msg.wave === 1 && msg.missing === false && same(msg.skipped.map((s) => s.reason), ["flight_same_endpoints", "flight_single_point"]) && !out.R1.msg.hasKey &&
        info && info.wave === "1" && info.lines.length === 2 && /飛騎（路線 path_loop）：飛行路線的起點和終點是同一格/.test(info.lines[0]) && /飛行路線只有一個路點/.test(info.lines[1]) &&
        /還在備戰/.test(info.text) && info.focused &&
        snap.game_state === 1 && snap.wave === 0 && snap.hp === 20 && out.R1.state.enemies === 0 && startEnabled && resultCard === 0,
      out.R1);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    const closedByEsc = (await rejectInfo()) === null;
    await startBattle();
    await page.waitForSelector('[data-testid="wave-reject"]', { timeout: 10000 });
    await H.sleep(300);
    const rect = (await rejectInfo()).rect;
    const from = await snapshot(IFRAME);
    await page.locator('[data-testid="wave-reject-exit"]').click();
    await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
    await H.sleep(300);
    // 出口打開的關卡選擇要真的點得到：原本提示範圍內的有效關卡，該點最上層是它的「選擇關卡」按鈕，真實滑鼠點下去換關
    const pick = await stageUnder(rect, R.id);
    let switched = false;
    if (pick) {
      const i2 = await H.bridgeLen(page);
      await page.mouse.click(pick.x, pick.y);
      switched = await H.waitBridge(page, i2, { type: "update_stats", wave: 0, game_state: 1 }, 20000).then(() => true, () => false);
    }
    await H.sleep(500);
    const to = await snapshot(IFRAME);
    const modalLeft = await page.locator('[class*="modalPanel"]').count();
    out.R2 = { closedByEsc, rect, pick, switched, from: { stage: from.stage, battle_id: from.battle_id }, to: { stage: to.stage, battle_id: to.battle_id, gs: to.game_state, wave: to.wave, hp: to.hp }, modalLeft, notice: await rejectInfo(), shot: await H.shot(page, "air-first-r2-switched") };
    run.check("R-2 Esc 關閉提示；再按迎戰又被拒絕、提示再出現；提示的出口「切換關卡」打開關卡選擇：原本提示範圍內的有效關卡在最上層（hit-test 命中「選擇關卡」按鈕），真實滑鼠點下去換到那一關（新的 battle_id、備戰、波次 0、城池 20），視窗與提示都關閉",
      closedByEsc && pick && pick.onButton && !pick.inReject && switched && to.stage === pick.id && to.battle_id !== from.battle_id &&
        to.game_state === 1 && to.wave === 0 && to.hp === 20 && modalLeft === 0 && out.R2.notice === null,
      out.R2);
    if (modalLeft > 0) {
      await page.locator('button[class*="modalClose"]').last().click();
      await H.sleep(300);
    }
  });

  // ── M. 主頁：混合關實際只出合法的組 ──
  await section("M", async () => {
    await H.selectStage(page, MIX.name);
    await dismissSplash(IFRAME);
    const idx = await H.bridgeLen(page);
    await startBattle();
    await waitEnemies(IFRAME, 3);
    const { b } = await overGameTime(IFRAME, 1.5);
    const kinds = Object.values(b.enemy_kind || {}).sort();
    const moves = Object.entries(b.enemy_kind || {}).map(([id, k]) => [k, (b.enemy_move || {})[id]]).sort();
    const rejects = (await H.bridgeSince(page, idx)).filter((m) => m.type === "wave_rejected").length;
    out.M = { kinds, moves, hp: b.hp, gs: b.game_state, rejects, notice: await rejectInfo() };
    run.check("M-1 主頁混合關：實際出兵 3 隻（步兵 2、合法路線的飛騎 1，和預覽相同），無效的飛行組沒有出兵；開戰 1.5 秒後城池仍是 20；沒有拒絕提示",
      same(kinds, ["mock_flyer", "mock_grunt", "mock_grunt"]) && same(moves, [["mock_flyer", "flying"], ["mock_grunt", "ground"], ["mock_grunt", "ground"]]) &&
        b.hp === 20 && b.game_state === 2 && rejects === 0 && out.M.notice === null,
      out.M);
  });

  // ── B. 獨立戰鬥頁 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + U.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    await placeTower(BIFRAME, 1, 4, "弓兵塔");
    await startBattle();
    await waitEnemies(BIFRAME, 2);
    const first = effects(await overGameTime(BIFRAME, 2.6));
    const panel = await openPanel(BIFRAME, 1, 4);
    await page.locator('[data-testid="tower-target-air_first"]').focus();
    await page.keyboard.press(" ");
    await waitPressed("air_first");
    const after = await panelInfo();
    const shot = await H.shot(page, "air-first-b1-battle-panel");
    await closePanel();
    const air = effects(await overGameTime(BIFRAME, 2.6));
    out.B1 = { first, panel, after, air, shot };
    run.check("B-1 獨立戰鬥頁：弓兵塔預設只打地面；面板四個選項，鍵盤空白鍵選「優先飛行」後按下狀態跟著 Godot 回覆；之後只打飛行",
      first.mock_post_g.dmg > 0 && first.mock_post_f.dmg === 0 && same(panel.modes, ["first", "strongest", "weakest", "air_first"]) &&
        same(after.pressed, ["air_first"]) && air.mock_post_f.dmg > 0 && air.mock_post_g.dmg === 0,
      out.B1);

    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + R.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    await startBattle();
    await page.waitForSelector('[data-testid="wave-reject"]', { timeout: 30000 });
    await H.sleep(1000);
    const info = await rejectInfo();
    const snap = await snapshot(BIFRAME);
    out.B2 = { info, state: { gs: snap.game_state, wave: snap.wave, hp: snap.hp }, shot: await H.shot(page, "air-first-b2-reject-battle") };
    await page.locator('[data-testid="wave-reject-exit"]').click();
    await page.waitForURL(/\/shenmaSanguo\/stages$/, { timeout: 30000 });
    run.check("B-2 獨立戰鬥頁的拒絕提示：兩組原因、仍在備戰（波次 0、城池 20）；出口「返回關卡選擇」回到關卡頁",
      info && info.lines.length === 2 && /返回關卡選擇/.test(info.text) && snap.game_state === 1 && snap.wave === 0 && snap.hp === 20, out.B2);
  });

  // ── N. 390 寬 ──
  await section("N", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, U.name);
    await dismissSplash(IFRAME);
    await placeTower(IFRAME, 1, 4, "弓兵塔");
    await openPanel(IFRAME, 1, 4);
    const layout = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="unit-panel"]').getBoundingClientRect();
      const btns = [...document.querySelectorAll('button[data-testid^="tower-target-"]')].map((b) => {
        const r = b.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height), text: b.innerText.trim(), fits: b.scrollWidth <= b.clientWidth + 1 };
      });
      return { panel: { left: Math.round(p.left), right: Math.round(p.right) }, btns, vw: window.innerWidth, scrollW: document.documentElement.scrollWidth };
    });
    out.N1 = { layout, shot: await H.shot(page, "air-first-n1-panel-390") };
    run.check("N-1 390 寬的弓兵塔面板：四個選項（2×2）都在面板與畫面內、文字沒有被截斷；頁面沒有橫向捲動",
      layout.btns.length === 4 && layout.btns.every((b) => b.left >= layout.panel.left && b.right <= layout.panel.right && b.fits && b.h > 0) &&
        layout.panel.left >= 0 && layout.panel.right <= layout.vw && layout.scrollW <= layout.vw,
      out.N1);
    await closePanel();
    await H.selectStage(page, R.name);
    await dismissSplash(IFRAME);
    await startBattle();
    await page.waitForSelector('[data-testid="wave-reject"]', { timeout: 30000 });
    await H.sleep(500);
    const info = await rejectInfo();
    await page.keyboard.press("Tab");
    const tabTo = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid"));
    out.N2 = { info, tabTo, shot: await H.shot(page, "air-first-n2-reject-390") };
    run.check("N-2 390 寬的拒絕提示：整個提示在畫面內、沒有橫向捲動；出現時焦點在提示上，Tab 到「切換關卡」",
      info && info.rect.left >= 0 && info.rect.right <= info.vw && info.rect.top >= 0 && info.rect.bottom <= info.vh && info.scrollW <= info.vw && info.focused && tabTo === "wave-reject-exit",
      out.N2);
    await page.setViewportSize({ width: 540, height: 900 });
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_af_fixture")).catch(() => {});
  return run.finish({ out });
}
