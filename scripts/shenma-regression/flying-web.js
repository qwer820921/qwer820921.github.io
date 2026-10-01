async (page) => {
  // 飛行敵人與對空（瀏覽器，真 Godot 產物）：harness 的示範關「Mock F 飛行混合」（chapter2_1，折線路線，第 1 波步兵 2＋飛騎 2、第 2 波飛騎 3）
  // - P：敵軍預覽的飛行標記與對空說明（主頁關卡視窗、獨立關卡頁）
  // - H：武將詳情的對空說明（主頁武將視窗、獨立武將頁）；部署選單的塔與武將卡片、單位面板（Godot 送來的 anti_air）
  // - A：主頁只放只打地面的單位（關羽在飛行必經的道路格、步兵塔）→ 飛騎一次都沒有扣血、全部飛過抵達基地（城池 15），步兵被打倒；結算保存
  // - B：主頁放能對空的單位（黃忠、弓兵塔）→ 飛騎扣血、被打倒；結算保存
  // - C：獨立戰鬥頁同 B；兩個入口送進 Godot 的 enemies_config 都帶 movement_type（Godot 的快照看得到飛行）
  // - N：390 寬的預覽與部署選單、鍵盤開關預覽
  // - E：地圖編輯器敵人表的移動方式選單（讀取／保存／重新載入保留、遊戲不認得的值保留並標示、試算表缺欄時擋下飛行的儲存）
  // 全部 mock、虛構金鑰 test_flying_*；編輯器的設定讀寫由這支腳本在頁面內回應（__shenma_enemy_fixture），測試用密碼
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_flying_a";
  const STAGE = "Mock F 飛行混合";
  const MAP_ID = "chapter2_1";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const FLYER_HP = 30;
  const TOKEN = "test-enemy-editor-token-7c1";

  // ── 地圖編輯器的設定讀寫（只在這支腳本開啟時回應）──
  const base = { type: "", level: 1, speed: 60, hp: 20, atk: 10, armor: 0, attack_range: 1, trait: "", notes: "", image: "", attack_image: "" };
  const FIXTURE = [
    { ...base, enemy_id: "e_ground", name: "步兵", movement_type: "ground" },
    { ...base, enemy_id: "e_fly", name: "飛騎", movement_type: "flying", trait: "ground" },
    { ...base, enemy_id: "e_blank", name: "舊兵", movement_type: "" },
    { ...base, enemy_id: "e_air", name: "怪鳥", movement_type: "air" },
    { ...base, enemy_id: "e_pad", name: "空白", movement_type: " flying " },
  ];
  await ctx.addInitScript(({ fixture, token }) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_enemy_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        const reply = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
        if (body.action === "get_enemies_config" || body.action === "save_enemies_config") {
          const log = JSON.parse(localStorage.getItem("__shenma_enemy_log") || "[]");
          log.push({ action: body.action, enemies: body.payload && body.payload.enemies });
          localStorage.setItem("__shenma_enemy_log", JSON.stringify(log));
          // 試算表沒有 movement_type 欄：讀到的每一列都沒有這個欄位，儲存時這個欄位被丟掉（和後端依表頭寫入相同）
          const noCol = localStorage.getItem("__shenma_enemy_nocol") === "1";
          const stored = JSON.parse(localStorage.getItem("__shenma_enemy_store") || "null") || fixture;
          const shape = (rows) => rows.map((r) => {
            if (!noCol) return r;
            const { movement_type: _drop, ...rest } = r;
            return rest;
          });
          if (body.action === "get_enemies_config") return reply({ status: 200, enemies: shape(stored) });
          if (!body.payload || body.payload.admin_token !== token) return reply({ status: 403, error: "ADMIN_REQUIRED" });
          localStorage.setItem("__shenma_enemy_store", JSON.stringify(shape(body.payload.enemies)));
          return reply({ status: 200, success: true, message: "ENEMIES_SAVED" });
        }
      }
      return inner(input, init);
    };
  }, { fixture: FIXTURE, token: TOKEN });

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const waitUntil = async (fn, timeout = 30000, what = "條件") => {
    const end = Date.now() + timeout;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error("等不到：" + what);
      await H.sleep(150);
    }
  };
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const session = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const profile = () => ({
    nickname: "飛行玩家", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: MAP_ID, heroes: [],
    team: [{ hero_id: "huang_zhong", slot: 1 }, { hero_id: "guan_yu", slot: 2 }],
  });
  const snapshot = async (sel) => {
    const id = "fly-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
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
  // 在格子上部署武將（部署選單的武將分頁）或防禦塔
  const placeHero = async (sel, c, row, name) => {
    await clickCell(sel, c, row);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    const tab = page.locator('[data-testid="placement-menu"] button[class*="tabBtn"]', { hasText: "武將" });
    if ((await tab.count()) > 0) await tab.click();
    await page.locator('[data-testid="placement-menu"] button[class*="menuCard"]', { hasText: name }).click();
    await H.sleep(500);
  };
  const placeTower = async (sel, c, row, name) => {
    await clickCell(sel, c, row);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    await page.locator('[data-testid="placement-menu"] button[class*="menuCard"]', { hasText: name }).click();
    await H.sleep(500);
  };
  // 點選場上的單位，讀單位面板的對空標示，再關閉面板
  const unitAir = async (sel, c, row) => {
    await clickCell(sel, c, row);
    await page.waitForSelector('[data-testid="unit-panel"]', { timeout: 15000 });
    const el = page.locator('[data-testid="unit-panel-air"]');
    const r = { name: (await page.locator('[data-testid="unit-panel"] [class*="unitName"]').innerText()).replace(/\s+/g, " "), text: await el.innerText(), air: await el.getAttribute("data-anti-air") };
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click();
    await H.sleep(300);
    return r;
  };
  // 開戰（自動）後每次快照記錄敵人的血量、種類與移動方式，直到出現結算視窗
  const watchBattle = async (sel, autoBtn, shotName, timeoutMs = 240000) => {
    await page.getByRole("button", { name: autoBtn, exact: true }).click();
    const seen = {};
    let snaps = 0;
    let flyShot = null;
    let flyFirst = 0;
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < timeoutMs) {
      const s = await snapshot(sel);
      snaps += 1;
      last = s;
      for (const [id, hp] of Object.entries(s.enemy_hp || {})) {
        const k = seen[id] || (seen[id] = { kind: s.enemy_kind[id], move: (s.enemy_move || {})[id], min: hp, first: hp });
        k.min = Math.min(k.min, hp);
      }
      // 飛騎出現約 2 秒後截一張戰場（看飛行的翅膀與陰影）
      const flying = Object.values(s.enemy_move || {}).filter((m) => m === "flying").length;
      if (flying > 0 && !flyFirst) flyFirst = Date.now();
      if (!flyShot && flyFirst && Date.now() - flyFirst > 2000 && flying > 0) flyShot = await H.shot(page, shotName);
      if ((await page.locator('[data-testid="result-card"]').count()) > 0) break;
      await H.sleep(120);
    }
    // 結算後再取一次（最後一隻的扣血或擊殺可能在上一張快照之後）
    last = await snapshot(sel);
    const list = Object.values(seen);
    const flyers = list.filter((e) => e.kind === "mock_flyer");
    const grunts = list.filter((e) => e.kind === "mock_grunt");
    return {
      snaps, flyers: flyers.length, grunts: grunts.length,
      flyerMoves: [...new Set(flyers.map((e) => e.move))], gruntMoves: [...new Set(grunts.map((e) => e.move))],
      flyerDamaged: flyers.filter((e) => e.min < FLYER_HP - 0.001).length,
      flyerHpSeen: [...new Set(flyers.map((e) => e.min))],
      gruntDamaged: grunts.filter((e) => e.min < 20 - 0.001).length,
      lastHp: last && last.hp, lastKills: last && last.kills, flyShot,
      result: await page.locator('[data-testid="result-card"]').innerText().catch(() => null),
    };
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `flying-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };
  const settledLogs = async () => ((await db()).battle_logs || []).filter((l) => l.key === KEY && l.stage_id === MAP_ID);
  const cardOf = (name) => page.locator('div[class*="stageCard"]', { has: page.locator("div", { hasText: new RegExp("^" + name + "$") }) }).first();
  const previewInfo = async () =>
    page.evaluate(() => {
      const root = document.querySelector('[data-testid="enemy-preview"]');
      const groups = [...root.querySelectorAll('[data-testid="preview-group"]')].map((g) => ({
        movement: g.getAttribute("data-movement"), flying: !!g.querySelector('[data-testid="preview-flying"]'), text: g.innerText.replace(/\s+/g, " "),
      }));
      const note = root.querySelector('[data-testid="preview-flying-note"]');
      return { groups, note: note ? note.innerText : null };
    });
  // 預覽：打開第 2 波後讀全部的組
  const readPreview = async () => {
    await page.locator('[data-testid="preview-wave-toggle-2"]').click();
    await H.sleep(200);
    return previewInfo();
  };
  const previewOk = (p) =>
    p.groups.length === 3 &&
    same(p.groups.map((g) => g.movement), ["ground", "flying", "flying"]) &&
    same(p.groups.map((g) => g.flying), [false, true, true]) &&
    /飛騎/.test(p.groups[1].text) && /✈ 飛行/.test(p.groups[1].text) &&
    !!p.note && /弓兵、法師武將與弓兵塔/.test(p.note) && /文士塔可以對飛行敵人減速/.test(p.note) && /不會被武將擋住/.test(p.note);

  // ── 準備 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, p: profile() });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
  });

  // ── P. 敵軍預覽 ──
  await section("P", async () => {
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
    await cardOf(STAGE).locator('[data-testid="enemy-preview-open"]').click();
    await page.waitForSelector('[data-testid="enemy-preview"]', { timeout: 10000 });
    const p1 = await readPreview();
    out.P1 = { ...p1, shot: await H.shot(page, "flying-p1-preview-main") };
    run.check("P-1 主頁關卡視窗的敵軍預覽：步兵組沒有標記，兩組飛騎標「✈ 飛行」；上方說明這一關有飛行敵人、不會被武將擋住，能對空的是弓兵、法師武將與弓兵塔，文士塔可以減速",
      previewOk(p1), out.P1);
    await page.locator('[data-testid="enemy-preview-close"]').click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);

    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="enemy-preview-open"]', { timeout: 60000 });
    await cardOf(STAGE).locator('[data-testid="enemy-preview-open"]').click();
    await page.waitForSelector('[data-testid="enemy-preview"]', { timeout: 10000 });
    const p2 = await readPreview();
    out.P2 = { ...p2, shot: await H.shot(page, "flying-p2-preview-stages") };
    run.check("P-2 獨立關卡頁的敵軍預覽：同樣的飛行標記與對空說明", previewOk(p2), out.P2);
    await page.locator('[data-testid="enemy-preview-close"]').click();
  });

  // ── H. 武將詳情的對空說明 ──
  await section("H", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('[class*="heroName"]');
    const detailAir = async (name) => {
      await page.locator('[class*="heroName"]', { hasText: name }).first().click();
      const el = page.locator('[data-testid="hero-detail"] [data-testid="hero-anti-air"]').first();
      await el.waitFor({ timeout: 10000 });
      const r = { text: await el.innerText(), air: await el.getAttribute("data-anti-air") };
      await page.locator('button[class*="modalClose"]').last().click();
      await H.sleep(300);
      return r;
    };
    const main = { huang: await detailAir("黃忠"), zhou: await detailAir("周瑜"), guan: await detailAir("關羽"), zhao: await detailAir("趙雲") };
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[class*="heroName"]', { timeout: 60000 });
    const pageAir = async (name) => {
      await page.locator('[class*="heroName"]', { hasText: name }).first().click();
      const el = page.locator('[data-testid="hero-detail"] [data-testid="hero-anti-air"]').first();
      await el.waitFor({ timeout: 10000 });
      const r = { text: await el.innerText(), air: await el.getAttribute("data-anti-air") };
      await page.keyboard.press("Escape");
      await H.sleep(400);
      return r;
    };
    const heroesPage = { huang: await pageAir("黃忠"), guan: await pageAir("關羽") };
    out.H = { main, heroesPage };
    const yes = (r) => r.air === "true" && /可以攻擊飛行敵人/.test(r.text);
    const no = (r) => r.air === "false" && /只打地面/.test(r.text);
    run.check("H-1 主頁武將視窗的詳情：黃忠（弓兵）、周瑜（法師）「對空：可以攻擊飛行敵人」；關羽（步兵）、趙雲（騎兵）「只打地面，打不到飛行敵人」",
      yes(main.huang) && yes(main.zhou) && no(main.guan) && no(main.zhao), main);
    run.check("H-2 獨立武將頁的詳情：黃忠可以對空、關羽只打地面", yes(heroesPage.huang) && no(heroesPage.guan), heroesPage);
  });

  // ── A. 主頁：只打地面的單位 ──
  await section("A", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, STAGE);
    await dismissSplash(IFRAME);
    // 部署選單：塔與武將的對空標示
    await clickCell(IFRAME, 2, 6);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    const towers = await page.evaluate(() =>
      Object.fromEntries([...document.querySelectorAll('[data-testid="placement-tower-air"]')].map((e) => [e.getAttribute("data-tower"), [e.getAttribute("data-anti-air"), e.innerText]]))
    );
    const towerShot = await H.shot(page, "flying-a-menu-towers");
    await page.locator('[data-testid="placement-menu"] button[class*="tabBtn"]', { hasText: "武將" }).click();
    const heroes = await page.evaluate(() =>
      Object.fromEntries([...document.querySelectorAll('[data-testid="placement-menu"] button[class*="menuCard"]')].map((b) => {
        const air = b.querySelector('[data-testid="placement-hero-air"]');
        return [b.querySelector('[class*="cardName"]').innerText, air ? [air.getAttribute("data-anti-air"), air.innerText] : null];
      }))
    );
    out.A_menu = { towers, heroes, towerShot, shot: await H.shot(page, "flying-a-menu") };
    run.check("A-1 部署選單：弓兵塔「可對空」、文士塔「可減速飛行」、步兵／砲兵／騎兵塔「只打地面」；武將分頁的黃忠「可對空」、關羽「只打地面」",
      same(towers, { archer: ["attack", "可對空"], infantry: ["none", "只打地面"], artillery: ["none", "只打地面"], cavalry: ["none", "只打地面"], scholar: ["slow", "可減速飛行"] }) &&
        same(heroes, { 黃忠: ["true", "可對空"], 關羽: ["false", "只打地面"] }),
      out.A_menu);
    await page.locator('[data-testid="placement-menu"] button[class*="closeBtn"]').click();
    await H.sleep(300);

    // 關羽放在飛行必經的道路格 (2,5)、步兵塔在旁邊 (2,6)
    await placeHero(IFRAME, 2, 5, "關羽");
    await placeTower(IFRAME, 2, 6, "步兵塔");
    const guanPanel = await unitAir(IFRAME, 2, 5);
    const infPanel = await unitAir(IFRAME, 2, 6);
    out.A_panels = { guanPanel, infPanel };
    run.check("A-2 單位面板（Godot 送來的對空）：關羽「只打地面」、步兵塔「只打地面」",
      guanPanel.air === "false" && guanPanel.text === "只打地面" && /關羽/.test(guanPanel.name) && infPanel.air === "false" && infPanel.text === "只打地面" && /步兵塔/.test(infPanel.name), out.A_panels);

    const logs0 = (await settledLogs()).length;
    const gold0 = (await session()).gold;
    const w = await watchBattle(IFRAME, "自動", "flying-a-inflight");
    out.A = { ...w, shot: await H.shot(page, "flying-a-result") };
    run.check("A-3 只打地面的單位：送進 Godot 的飛騎是飛行、步兵是地面；5 隻飛騎一次都沒有扣血（關羽在它們的直線上也擋不住），全部飛過抵達基地 → 城池 15；2 隻步兵被擋住打倒（擊殺 2；步兵一擊就倒，快照不一定看得到扣血）；勝利",
      w.flyers === 5 && same(w.flyerMoves, ["flying"]) && same(w.gruntMoves, ["ground"]) && w.flyerDamaged === 0 && same(w.flyerHpSeen, [FLYER_HP]) &&
        w.grunts === 2 && w.lastHp === 15 && w.lastKills === 2 && /勝 利/.test(w.result || ""),
      out.A);
    await page.getByRole("button", { name: "確認", exact: true }).click();
    await waitUntil(async () => (await settledLogs()).length > logs0, 30000, "save_result");
    await waitSync("idle");
    const s1 = await session();
    const d1 = await db();
    out.A_settle = { logs: (await settledLogs()).length - logs0, gold: [gold0, s1.gold], cloudGold: d1.profiles[KEY].gold };
    run.check("A-4 結算保存：save_result 1 筆（這一關）、點數增加，同步後雲端和本機相同",
      out.A_settle.logs === 1 && s1.gold > gold0 && d1.profiles[KEY].gold === s1.gold, out.A_settle);
  });

  // ── B. 主頁：能對空的單位 ──
  await section("B", async () => {
    await H.selectStage(page, STAGE);
    await dismissSplash(IFRAME);
    await placeHero(IFRAME, 6, 4, "黃忠");
    await placeTower(IFRAME, 7, 6, "弓兵塔");
    const huangPanel = await unitAir(IFRAME, 6, 4);
    const archerPanel = await unitAir(IFRAME, 7, 6);
    const logs0 = (await settledLogs()).length;
    const w = await watchBattle(IFRAME, "自動", "flying-b-inflight");
    out.B = { huangPanel, archerPanel, ...w, shot: await H.shot(page, "flying-b-result") };
    run.check("B-1 能對空的單位：面板上黃忠與弓兵塔「可對空」；飛騎被打（有扣血或被打倒），擊殺超過 2（不只步兵）、城池沒有被 5 隻飛騎全部扣掉；勝利",
      huangPanel.air === "true" && huangPanel.text === "可對空" && archerPanel.air === "true" && archerPanel.text === "可對空" &&
        w.flyers >= 1 && same(w.flyerMoves, ["flying"]) && w.lastKills > 2 && w.lastHp > 15 && /勝 利/.test(w.result || ""),
      out.B);
    await page.getByRole("button", { name: "確認", exact: true }).click();
    await waitUntil(async () => (await settledLogs()).length > logs0, 30000, "save_result");
    await waitSync("idle");
    run.check("B-2 結算保存：save_result 1 筆", (await settledLogs()).length - logs0 === 1);
  });

  // ── C. 獨立戰鬥頁 ──
  await section("C", async () => {
    const logs0 = (await settledLogs()).length;
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP_ID);
    await page.waitForFunction((sel) => {
      const f = document.querySelector(sel);
      return f && !/載入戰場中/.test(document.body.innerText);
    }, BIFRAME, { timeout: 120000 });
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    await clickCell(BIFRAME, 7, 6);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    const towers = await page.evaluate(() =>
      Object.fromEntries([...document.querySelectorAll('[data-testid="placement-tower-air"]')].map((e) => [e.getAttribute("data-tower"), e.getAttribute("data-anti-air")]))
    );
    await page.locator('[data-testid="placement-menu"] button[class*="menuCard"]', { hasText: "弓兵塔" }).click();
    await H.sleep(500);
    await placeHero(BIFRAME, 6, 4, "黃忠");
    const huangPanel = await unitAir(BIFRAME, 6, 4);
    const w = await watchBattle(BIFRAME, "自動 OFF", "flying-c-inflight");
    out.C = { towers, huangPanel, ...w, shot: await H.shot(page, "flying-c-battle-page") };
    run.check("C-1 獨立戰鬥頁：部署選單的對空標示相同；送進 Godot 的飛騎是飛行；黃忠「可對空」，飛騎被打倒（擊殺超過 2）；勝利",
      same(towers, { archer: "attack", infantry: "none", artillery: "none", cavalry: "none", scholar: "slow" }) &&
        huangPanel.air === "true" && w.flyers >= 1 && same(w.flyerMoves, ["flying"]) && w.lastKills > 2 && /勝 利/.test(w.result || ""),
      out.C);
    await page.getByRole("button", { name: "確認，返回主選單" }).click();
    await page.waitForURL(/\/shenmaSanguo$/, { timeout: 30000 });
    await waitUntil(async () => (await settledLogs()).length > logs0, 30000, "save_result");
    run.check("C-2 結算保存並回到主頁：save_result 1 筆", (await settledLogs()).length - logs0 === 1);
  });

  // ── N. 390 寬、鍵盤 ──
  await section("N", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
    const btn = cardOf(STAGE).locator('[data-testid="enemy-preview-open"]');
    await btn.scrollIntoViewIfNeeded();
    await btn.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="enemy-preview"]', { timeout: 10000 });
    const focusInside = await page.evaluate(() => document.querySelector('[data-testid="enemy-preview"]').contains(document.activeElement));
    await page.locator('[data-testid="preview-wave-toggle-2"]').focus();
    await page.keyboard.press("Enter");
    await H.sleep(300);
    const layout = await page.evaluate(() => {
      const note = document.querySelector('[data-testid="preview-flying-note"]').getBoundingClientRect();
      const tags = [...document.querySelectorAll('[data-testid="preview-flying"]')].map((t) => t.getBoundingClientRect());
      return {
        scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
        note: { left: Math.round(note.left), right: Math.round(note.right) },
        tagsInside: tags.every((r) => r.left >= 0 && r.right <= window.innerWidth), tags: tags.length,
      };
    });
    const shot = await H.shot(page, "flying-n-preview-390");
    await page.keyboard.press("Escape");
    await H.sleep(300);
    const closed = (await page.locator('[data-testid="enemy-preview"]').count()) === 0;
    const refocus = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid"));
    out.N_preview = { focusInside, layout, closed, refocus, shot };
    run.check("N-1 390 寬的敵軍預覽：鍵盤 Enter 開啟、焦點在視窗內、Enter 展開第 2 波；飛行說明與兩個飛行標記都在畫面內、頁面沒有橫向捲動；Esc 關閉後焦點回到「敵軍預覽」按鈕",
      focusInside && layout.scrollW <= layout.innerW && layout.note.left >= 0 && layout.note.right <= layout.innerW && layout.tagsInside && layout.tags === 2 && closed && refocus === "enemy-preview-open",
      out.N_preview);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    await H.selectStage(page, STAGE);
    await dismissSplash(IFRAME);
    await clickCell(IFRAME, 7, 6);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    const menu = await page.evaluate(() => {
      const m = document.querySelector('[data-testid="placement-menu"]').getBoundingClientRect();
      const labels = [...document.querySelectorAll('[data-testid="placement-tower-air"]')].map((e) => {
        const r = e.getBoundingClientRect();
        return { text: e.innerText, visible: r.width > 0 && r.height > 0 };
      });
      return { menu: { left: Math.round(m.left), right: Math.round(m.right), top: Math.round(m.top), bottom: Math.round(m.bottom) }, vw: window.innerWidth, vh: window.innerHeight, labels, scrollW: document.documentElement.scrollWidth };
    });
    out.N_menu = { ...menu, shot: await H.shot(page, "flying-n-menu-390") };
    run.check("N-2 390 寬的部署選單：選單在畫面內、五座塔的對空標示都看得到、沒有橫向捲動",
      menu.menu.left >= 0 && menu.menu.right <= menu.vw && menu.labels.length === 5 && menu.labels.every((l) => l.visible && l.text) && menu.scrollW <= menu.vw,
      out.N_menu);
    await page.locator('[data-testid="placement-menu"] button[class*="closeBtn"]').click();
    await page.setViewportSize({ width: 540, height: 900 });
  });

  // ── E. 地圖編輯器的移動方式 ──
  const enemyLog = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_enemy_log") || "[]"));
  const enemySaves = async () => (await enemyLog()).filter((e) => e.action === "save_enemies_config");
  const visibleBtn = (text) => page.locator("button:visible", { hasText: text }).first();
  const movementSelects = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('select[data-testid="enemy-movement-select"]')].map((s) => ({
        value: s.value, shown: s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : null,
        unknown: s.getAttribute("data-unknown") === "true", options: [...s.options].map((o) => o.value),
      }))
    );
  const loadEnemies = async () => {
    await visibleBtn("📥 從 Sheet 載入").click();
    await page.waitForFunction(() => /✓ 已載入 \d+ 筆/.test(document.body.innerText), null, { timeout: 30000 });
    await H.sleep(300);
  };
  const saveEnemies = async () => {
    const n = (await enemySaves()).length;
    await visibleBtn("💾 儲存至 Sheet").click();
    if (await page.waitForSelector('[data-testid="admin-token-input"]', { timeout: 3000 }).then(() => true).catch(() => false)) {
      await page.locator('[data-testid="admin-token-input"]').fill(TOKEN);
      await page.locator('[data-testid="admin-token-submit"]').click();
    }
    await waitUntil(async () => (await enemySaves()).length > n, 15000, "儲存請求");
    await page.waitForSelector("text=/已儲存/", { timeout: 10000 });
    return (await enemySaves()).slice(-1)[0].enemies;
  };
  await section("E", async () => {
    await page.evaluate(() => {
      localStorage.setItem("__shenma_enemy_fixture", "1");
      localStorage.removeItem("__shenma_enemy_store");
      localStorage.removeItem("__shenma_enemy_log");
      localStorage.removeItem("__shenma_enemy_nocol");
    });
    await page.goto(H.BASE + "/mapEditor");
    await waitUntil(async () => {
      await page.getByRole("button", { name: "⚔️ 物件" }).click();
      await H.sleep(500);
      return page.getByRole("button", { name: "⚔️ 敵人設定" }).isVisible();
    }, 30000, "物件分頁");
    await page.getByRole("button", { name: "⚔️ 敵人設定" }).click();
    await H.sleep(300);
    await loadEnemies();
    const s0 = await movementSelects();
    const help = await page.locator('[data-testid="enemy-movement-help"]').innerText();
    const hint0 = await page.locator('[data-testid="enemy-movement-unknown-hint"]').innerText().catch(() => null);
    out.E1 = { s0, help, hint0, shot: await H.shot(page, "flying-e-editor-load") };
    run.check("E-1 讀取：選單只有地面（ground）與飛行（flying）；空白顯示「未設定：遊戲當作地面」（不算錯誤）；air、「 flying 」保留原值並標成黃色（說明遊戲當作地面／飛行），上方說明 2 列；規則說明寫出誰能對空",
      s0.length === 5 && same(s0[0].options, ["ground", "flying"]) && s0[0].shown === "地面（ground）" && s0[1].shown === "飛行（flying）" &&
        s0[2].value === "" && /未設定：遊戲當作地面/.test(s0[2].shown) && !s0[2].unknown &&
        s0[3].value === "air" && s0[3].unknown && /當作地面/.test(s0[3].shown) && s0[4].value === " flying " && s0[4].unknown && /當作飛行/.test(s0[4].shown) &&
        /有 2 列/.test(hint0 || "") && /弓兵、法師武將與弓兵塔/.test(help),
      out.E1);

    // 只改名稱就儲存：移動方式的原值（空白、air、前後有空白）與其他欄位都原樣送回
    await page.locator("tbody tr").nth(0).locator("input").nth(1).fill("步兵改");
    const p1 = await saveEnemies();
    const want1 = FIXTURE.map((r) => (r.enemy_id === "e_ground" ? { ...r, name: "步兵改" } : r));
    run.check("E-2 只改名稱就儲存（選單沒動）：送出的每一列和讀到的相同（movement_type 的空白、air、「 flying 」都照原值），只有名稱改變",
      same(p1, want1), { got: p1, want: want1 });

    // 在選單選擇：空白 → 飛行、air → 地面；「 flying 」不動
    const row = (i) => page.locator("tbody tr").nth(i);
    await row(2).locator('select[data-testid="enemy-movement-select"]').selectOption("flying");
    await row(3).locator('select[data-testid="enemy-movement-select"]').selectOption("ground");
    await H.sleep(200);
    const p2 = await saveEnemies();
    const mv = (list) => list.map((r) => [r.enemy_id, r.movement_type]);
    const hint2 = await page.locator('[data-testid="enemy-movement-unknown-hint"]').innerText().catch(() => null);
    run.check("E-3 選了新的值才改：舊兵（空白）→ flying、怪鳥（air）→ ground，其他照原值（「 flying 」仍保留）；說明變成 1 列",
      same(mv(p2), [["e_ground", "ground"], ["e_fly", "flying"], ["e_blank", "flying"], ["e_air", "ground"], ["e_pad", " flying "]]) && /有 1 列/.test(hint2 || ""),
      { payload: mv(p2), hint2 });

    // 重新載入：讀回剛才保存的值
    await loadEnemies();
    const s3 = await movementSelects();
    run.check("E-4 重新載入後讀回保存的值：舊兵飛行、怪鳥地面，「 flying 」仍是原值並標示",
      same(s3.map((x) => x.value), ["ground", "flying", "flying", "ground", " flying "]) && s3[4].unknown && !s3[2].unknown,
      s3.map((x) => [x.value, x.shown]));

    // 新增列：預設地面
    await visibleBtn("＋ 新增列").click();
    await H.sleep(200);
    const s4 = await movementSelects();
    run.check("E-5 新增列的移動方式預設是地面（ground），沒有標示", s4.length === 6 && s4[5].value === "ground" && !s4[5].unknown, s4[5]);

    // 試算表沒有 movement_type 欄：警告；選了飛行就擋下儲存（不送出請求），只改其他欄位照常儲存
    await page.evaluate(() => localStorage.setItem("__shenma_enemy_nocol", "1"));
    await loadEnemies();
    const missing = await page.locator('[data-testid="enemy-movement-missing"]').innerText().catch(() => null);
    const n0 = (await enemySaves()).length;
    await row(0).locator('select[data-testid="enemy-movement-select"]').selectOption("flying");
    await visibleBtn("💾 儲存至 Sheet").click();
    await page.waitForSelector("text=/沒有 movement_type 欄，飛行的設定不會被保存/", { timeout: 10000 });
    const blocked = (await enemySaves()).length === n0;
    await row(0).locator('select[data-testid="enemy-movement-select"]').selectOption("ground");
    const p5 = await saveEnemies();
    out.E6 = { missing, blocked, saved: p5.map((r) => Object.keys(r).includes("movement_type")), shot: await H.shot(page, "flying-e-editor-nocol") };
    run.check("E-6 試算表沒有 movement_type 欄：出現警告；選了飛行時儲存被擋下（沒有送出請求、說明原因）；改回地面後照常儲存",
      /沒有 movement_type 欄/.test(missing || "") && blocked && p5.length === 5, out.E6);
  });
  await page.evaluate(() => {
    for (const k of ["__shenma_enemy_fixture", "__shenma_enemy_store", "__shenma_enemy_log", "__shenma_enemy_nocol"]) localStorage.removeItem(k);
  }).catch(() => {});

  return run.finish({ out });
}
