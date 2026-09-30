async (page) => {
  // 敵人設定的對武將攻擊力（atk）與免疫減速（trait immune_slow）（瀏覽器，真 Godot 產物、mock 後端）
  // - 測試關（只在這支腳本加進 mock 名單，__shenma_tr_fixture）「Mock TR 攻擊與免疫」：直線路線、三波
  //   第 1 波 鐵騎（atk 32、免疫減速）；第 2 波 輕騎（atk 32、沒有 trait）；第 3 波 舊兵（沒有 atk）＋怪兵（atk 是字串 "32"、trait armored）
  // - P：敵軍預覽（主頁的關卡視窗）每一組顯示「對武將攻擊力」（沒有有效攻擊力的寫明以預設值 20 計）、免疫減速的標記與說明、
  //   遊戲不使用的特性；說明寫明不是對城池的傷害
  // - M：主頁實際部署關羽（mock 防禦 120）在道路上：每一波用 Godot 的唯讀快照逐次核對——
  //   快照的攻擊力／免疫和預覽相同；鐵騎一路倍率 1（關羽的阻擋減速不套用）但照樣被擋住並攻擊，扣血＝攻擊次數 × 32 ×（1 − 120 ÷ 220）；
  //   輕騎被關羽打中後倍率 0.3；第 3 波兩隻都以 20 計。戰場內的「下一波」在備戰與戰鬥中都顯示同樣的攻擊力與免疫標記
  // - B：獨立戰鬥頁同樣部署並核對第 1 波與「下一波」
  // - N：390 寬的預覽與下一波在畫面內、字級可讀
  // 全部 mock、虛構金鑰 test_traits_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_traits_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_8", name: "Mock TR 攻擊與免疫" };
  const DEF = 120;
  const per = (atk) => atk * (1 - DEF / (DEF + 100));

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[0, ROW], [13, ROW]] }, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const grp = (enemy_id, count, interval) => ({ enemy_id, count, interval, path: "path_a" });
  const EXTRA = {
    enemies: [
      { enemy_id: "mock_tr_imm", name: "鐵騎", hp: 900, speed: 60, atk: 32, trait: "immune_slow", image: "enemy_cavalry1.webp" },
      { enemy_id: "mock_tr_norm", name: "輕騎", hp: 900, speed: 60, atk: 32, image: "enemy_cavalry2.webp" },
      { enemy_id: "mock_tr_noatk", name: "舊兵", hp: 900, speed: 60, image: "enemy_grunt1.webp" },
      { enemy_id: "mock_tr_odd", name: "怪兵", hp: 900, speed: 60, atk: "32", trait: "armored", image: "enemy_grunt2.webp" },
    ],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [
        { wave: 1, enemies: [grp("mock_tr_imm", 1, 1.0)] },
        { wave: 2, enemies: [grp("mock_tr_norm", 1, 1.0)] },
        { wave: 3, enemies: [grp("mock_tr_noatk", 1, 1.0), grp("mock_tr_odd", 1, 1.0)] },
      ],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_tr_fixture") === "1") {
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
  const near = (a, b) => Math.abs(a - b) < 0.01;
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const snapshot = async (sel) => {
    const id = "tr-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
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
  const placeMsg = (sel, hid, c, r) =>
    page.evaluate(([sel, hid, c, r]) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "place_hero", hero_id: hid, cell_x: c, cell_y: r }, "*");
    }, [sel, hid, c, r]);
  // 預覽或下一波裡的每一組
  const groupsIn = (root) =>
    page.evaluate((root) => [...document.querySelectorAll(`${root} [data-testid="preview-group"]`)].map((g) => ({
      text: g.innerText.replace(/\s+/g, " ").trim(),
      atk: g.dataset.atk,
      fallback: g.dataset.atkFallback,
      immune: g.dataset.immuneSlow,
      badge: !!g.querySelector('[data-testid="preview-immune-slow"]'),
      atkLine: g.querySelector('[data-testid="preview-atk"]')?.innerText.trim() ?? null,
      immuneLine: g.querySelector('[data-testid="preview-immune-text"]')?.innerText.trim() ?? null,
      unused: g.querySelector('[data-testid="preview-trait-unused"]')?.innerText.trim() ?? null,
    })), root);
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `enemy-traits-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        await page.keyboard.press("Escape");
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };
  // 開戰後約每 0.15 秒取一次快照，直到這一波清完（回到備戰或結算）：每個敵人（依 instance）的種類、Godot 套用的攻擊力、免疫、
  // 最低的減速倍率、攻擊次數；每一次快照裡「這一波目前在場的敵人的攻擊次數 × 各自每擊的傷害」和關羽從開戰起扣的血比較
  const trackWave = async (sel, wave, { maxWallMs = 60000 } = {}) => {
    const enemies = {};
    const bad = [];
    let hp0 = null;
    let checks = 0;
    let gone = {};
    const t0 = Date.now();
    while (Date.now() - t0 < maxWallMs) {
      const s = await snapshot(sel);
      const hp = (s.hero_hp || {}).guan_yu;
      if (hp0 === null && typeof hp === "number") hp0 = hp;
      const ids = Object.keys(s.enemy_kind || {});
      for (const id of ids) {
        const e = enemies[id] || (enemies[id] = { kind: s.enemy_kind[id], atk: s.enemy_atk[id], immune: s.enemy_immune[id], minMult: 1, attacks: 0 });
        e.minMult = Math.min(e.minMult, s.enemy_speed_mult[id]);
        e.attacks = Math.max(e.attacks, s.enemy_blocker_attacks[id] || 0);
      }
      // 已經離場的敵人最後的攻擊次數可能沒看到：只有這一波的敵人都還在場時比較扣血
      for (const id of Object.keys(enemies)) if (!ids.includes(id)) gone[id] = true;
      if (typeof hp === "number" && hp0 !== null && Object.keys(gone).length === 0 && ids.length > 0) {
        const want = ids.reduce((sum, id) => sum + (s.enemy_blocker_attacks[id] || 0) * per(s.enemy_atk[id]), 0);
        checks += 1;
        if (!near(hp0 - hp, want)) bad.push({ lost: Math.round((hp0 - hp) * 10000) / 10000, want: Math.round(want * 10000) / 10000 });
      }
      if (s.wave === wave && (s.game_state === 1 || s.game_state === 3) && ids.length === 0 && Object.keys(enemies).length > 0) {
        return { enemies: Object.values(enemies), bad, checks, wallMs: Date.now() - t0 };
      }
      await H.sleep(150);
    }
    return { enemies: Object.values(enemies), bad, checks, wallMs: Date.now() - t0, timeout: true };
  };
  const openNw = async () => {
    await page.locator('[data-testid="next-wave-open"]').click();
    await page.waitForSelector('[data-testid="next-wave"]', { timeout: 10000 });
    await H.sleep(200);
  };
  const nwNext = () => page.evaluate(() => document.querySelector('[data-testid="next-wave"]')?.dataset.next ?? null);
  const closeNw = async () => {
    await page.locator('[data-testid="next-wave-close-bottom"]').click();
    await page.waitForSelector('[data-testid="next-wave"]', { state: "detached", timeout: 10000 });
  };

  // ── 準備 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, id }) => {
      localStorage.setItem("__shenma_tr_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "攻擊與免疫", level: 5, exp: 0, gold: 1000, capacity: 30, max_stage: id, heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }] } },
        battle_logs: [],
      }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, id: MAP.id });
    await page.setViewportSize({ width: 540, height: 900 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000, polling: 200 });
  });

  // ── P. 敵軍預覽 ──
  let preview = [];
  await section("P", async () => {
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector(`[data-testid="stage-card"][data-map-id="${MAP.id}"]`, { timeout: 10000 });
    await page.locator(`[data-testid="stage-card"][data-map-id="${MAP.id}"] [data-testid="enemy-preview-open"]`).click();
    await page.waitForSelector('[data-testid="enemy-preview"]', { timeout: 10000 });
    for (const n of [2, 3]) await page.locator(`[data-testid="preview-wave-toggle-${n}"]`).click();
    await H.sleep(300);
    preview = await groupsIn('[data-testid="enemy-preview"]');
    const hint = await page.locator('[data-testid="enemy-preview"] div[class*="previewHint"]').first().innerText();
    out.P = { groups: preview, hint, shot: await H.shot(page, "enemy-traits-p-preview") };
    const [imm, norm, noatk, odd] = preview;
    run.check("P-1 敵軍預覽：鐵騎「對武將攻擊力 32」、有「免疫減速」標記與說明（武將的阻擋減速、步兵塔與文士塔的減速都無效，仍會被擋住）；輕騎攻擊力 32、沒有免疫標記",
      preview.length === 4 && imm.atk === "32" && imm.fallback === "false" && imm.immune === "true" && imm.badge && imm.atkLine === "對武將攻擊力 32" &&
        /武將的阻擋減速、步兵塔與文士塔的減速都對它無效（仍會被武將擋住）/.test(imm.immuneLine || "") &&
        norm.atk === "32" && norm.immune === "false" && !norm.badge && norm.immuneLine === null && norm.atkLine === "對武將攻擊力 32",
      out.P.groups);
    run.check("P-2 沒有有效攻擊力的（舊兵沒有 atk、怪兵的 atk 是字串 \"32\"）寫明以預設值 20 計；怪兵的 armored 標成遊戲目前沒有使用（不冒充能力）",
      noatk.atk === "20" && noatk.fallback === "true" && noatk.atkLine === "對武將攻擊力 20（預設值：設定沒有有效的數字）" && noatk.unused === null && !noatk.badge &&
        odd.atk === "20" && odd.fallback === "true" && odd.unused === "特性「armored」：遊戲目前沒有使用" && !odd.badge,
      { noatk, odd });
    run.check("P-3 說明寫明對武將攻擊力是被擋住時攻擊武將的數值、不是對城池的傷害（抵達城池一律扣 1）；沒有任何一組把攻擊力寫成城池傷害",
      /不是城池傷害（抵達城池一律扣\s*1）/.test(hint) && preview.every((g) => !/城/.test(g.atkLine || "")), { hint });
    await page.locator('[data-testid="enemy-preview-close"]').click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
  });

  // ── M. 主頁實際部署與受擊 ──
  await section("M", async () => {
    await dismissSplash(IFRAME);
    await clickCell(IFRAME, 5, ROW);
    await page.waitForSelector("text=路徑部署", { timeout: 15000 });
    await page.locator('button[class*="menuCard"]', { hasText: "關羽" }).click();
    await H.sleep(600);
    // 備戰中的下一波是第 1 波（鐵騎）：免疫標記與攻擊力
    await openNw();
    const nw1 = { next: await nwNext(), groups: await groupsIn('[data-testid="next-wave"]') };
    out.M_nw1_shot = await H.shot(page, "enemy-traits-m-next-wave-1");
    await closeNw();
    run.check("M-1 備戰中的「下一波」是第 1 波：鐵騎對武將攻擊力 32、有免疫減速標記（和預覽相同）",
      nw1.next === "1" && nw1.groups.length === 1 && nw1.groups[0].atk === "32" && nw1.groups[0].badge && nw1.groups[0].immune === "true", nw1);

    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    await H.sleep(1500);
    // 戰鬥中的下一波是第 2 波（輕騎）：攻擊力 32、沒有免疫標記
    await openNw();
    const nw2 = { next: await nwNext(), groups: await groupsIn('[data-testid="next-wave"]') };
    await closeNw();
    const w1 = await trackWave(IFRAME, 1);
    out.M1 = { nw2, w1 };
    const e1 = w1.enemies[0] || {};
    run.check("M-2 戰鬥中的「下一波」是第 2 波：輕騎攻擊力 32、沒有免疫標記",
      nw2.next === "2" && nw2.groups.length === 1 && nw2.groups[0].atk === "32" && !nw2.groups[0].badge, nw2);
    run.check("M-3 第 1 波實際受擊：Godot 套用的攻擊力 32、免疫（和預覽相同）；一路倍率 1（關羽的阻擋減速不套用），照樣被擋住並攻擊關羽（至少 2 次）；每一次快照的扣血＝攻擊次數 × 14.545（32 × 100 ÷ 220）",
      !w1.timeout && w1.enemies.length === 1 && e1.kind === "mock_tr_imm" && e1.atk === 32 && e1.immune === true && e1.minMult === 1 && e1.attacks >= 2 && w1.checks >= 5 && w1.bad.length === 0,
      w1);

    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    await H.sleep(1500);
    await openNw();
    const nw3 = { next: await nwNext(), groups: await groupsIn('[data-testid="next-wave"]') };
    await closeNw();
    const w2 = await trackWave(IFRAME, 2);
    const e2 = w2.enemies[0] || {};
    out.M2 = { nw3, w2 };
    run.check("M-4 第 2 波實際受擊：輕騎（沒有 trait）攻擊力 32、不免疫，被關羽打中後倍率 0.3，照樣被擋住攻擊；扣血＝攻擊次數 × 14.545",
      !w2.timeout && w2.enemies.length === 1 && e2.kind === "mock_tr_norm" && e2.atk === 32 && e2.immune === false && near(e2.minMult, 0.3) && e2.attacks >= 1 && w2.bad.length === 0,
      w2);
    run.check("M-5 第 2 波戰鬥中的「下一波」是第 3 波：舊兵與怪兵都寫明以預設值 20 計、怪兵的 armored 遊戲沒有使用",
      nw3.next === "3" && nw3.groups.length === 2 && nw3.groups.every((g) => g.atk === "20" && g.fallback === "true" && !g.badge) && nw3.groups[1].unused === "特性「armored」：遊戲目前沒有使用", nw3);

    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const w3 = await trackWave(IFRAME, 3);
    out.M3 = { w3 };
    const kinds = w3.enemies.map((e) => e.kind).sort();
    run.check("M-6 第 3 波實際受擊：舊兵（沒有 atk）與怪兵（atk 是字串）Godot 都以 20 計（和預覽相同）、都不免疫；扣血＝兩隻的攻擊次數 × 9.091",
      !w3.timeout && same(kinds, ["mock_tr_noatk", "mock_tr_odd"]) && w3.enemies.every((e) => e.atk === 20 && e.immune === false) && w3.enemies.some((e) => e.attacks >= 1) && w3.bad.length === 0,
      w3);
    await page.waitForSelector('[data-testid="result-card"]', { timeout: 60000 });
    out.M_result_shot = await H.shot(page, "enemy-traits-m-result");
    const result = await page.locator('[data-testid="result-card"]').innerText();
    run.check("M-7 三波打完勝利（結算照常、城池沒有因為攻擊力扣血）", /勝 利/.test(result) && /★★★/.test(result), { result: result.replace(/\s+/g, " ") });
    await page.locator('[data-testid="result-card"] button').click();
    await waitSync("idle");
  });

  // ── B. 獨立戰鬥頁 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
    await H.sleep(1000);
    await dismissSplash(BIFRAME);
    await placeMsg(BIFRAME, "guan_yu", 5, ROW);
    await H.sleep(600);
    await openNw();
    const nw1 = { next: await nwNext(), groups: await groupsIn('[data-testid="next-wave"]') };
    await closeNw();
    await page.locator("button", { hasText: /^迎戰$/ }).click();
    const w1 = await trackWave(BIFRAME, 1);
    const e1 = w1.enemies[0] || {};
    out.B = { nw1, w1, shot: await H.shot(page, "enemy-traits-b-battle-page") };
    run.check("B-1 獨立戰鬥頁：備戰中的「下一波」鐵騎攻擊力 32、免疫標記；第 1 波實際受擊：攻擊力 32、免疫、倍率一直 1、被擋住並攻擊，扣血＝攻擊次數 × 14.545",
      nw1.next === "1" && nw1.groups[0].atk === "32" && nw1.groups[0].badge &&
        !w1.timeout && e1.kind === "mock_tr_imm" && e1.atk === 32 && e1.immune === true && e1.minMult === 1 && e1.attacks >= 2 && w1.bad.length === 0,
      out.B);
  });

  // ── N. 390 寬 ──
  await section("N", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector(`[data-testid="stage-card"][data-map-id="${MAP.id}"]`, { timeout: 10000 });
    await page.locator(`[data-testid="stage-card"][data-map-id="${MAP.id}"] [data-testid="enemy-preview-open"]`).click();
    await page.waitForSelector('[data-testid="preview-immune-slow"]', { timeout: 10000 });
    const m = await page.evaluate(() => {
      const r = (el) => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { left: Math.round(b.left), right: Math.round(b.right), font: parseFloat(getComputedStyle(el).fontSize) };
      };
      return {
        vw: window.innerWidth, docScroll: document.documentElement.scrollWidth,
        badge: r(document.querySelector('[data-testid="preview-immune-slow"]')),
        atk: r(document.querySelector('[data-testid="preview-atk"]')),
        immuneText: r(document.querySelector('[data-testid="preview-immune-text"]')),
      };
    });
    out.N = { m, shot: await H.shot(page, "enemy-traits-n-390-preview") };
    const fits = (x) => !!x && x.left >= 0 && x.right <= m.vw;
    run.check("N-1 390 寬的敵軍預覽：免疫減速標記、對武將攻擊力、免疫說明都在畫面內、沒有橫向捲動；攻擊力與說明的字級至少 11px",
      fits(m.badge) && fits(m.atk) && fits(m.immuneText) && m.docScroll <= m.vw + 1 && m.atk.font >= 11 && m.immuneText.font >= 11, out.N);
    await page.locator('[data-testid="enemy-preview-close"]').click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click();
    await page.setViewportSize({ width: 540, height: 900 });
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_tr_fixture")).catch(() => {});
  return run.finish({ out });
}
