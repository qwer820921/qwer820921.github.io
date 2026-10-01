async (page) => {
  // R14（瀏覽器）：黃忠「百步穿楊」（有效射程 ×1.5）
  // - 技能說明：主頁的武將視窗、獨立的武將頁；詳情寫出目前等級在戰場上的實際射程
  // - 主頁用部署選單實際放置黃忠（建築格 (12,4)，敵人從左邊出生點走過來），開戰後用唯讀快照量每位武將的有效射程（hero_ranges）
  //   與武將到每個敵人的距離（hero_enemy_dist）：第一次扣血時敵人在原射程 5 格外、新射程內；更遠時沒有扣血；每一擊傷害就是攻擊力
  // - 戰鬥中升級兩次（Web 送 update_team）：射程從基礎值重新計算（7.545、7.59），沒有疊乘
  // - 獨立戰鬥頁（送部署選單的同一個 place_hero 訊息；畫布縮放不同）同樣有效
  // - 存檔、session、送到後端的資料都沒有技能或加成後的射程
  // 全部 mock、虛構金鑰 test_r14_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const A = "test_r14_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const SLOW_HP = 99999; // harness 的 mock_a_slow（Mock A 慢速出兵）
  const CELL = [12, 4]; // 靠近基地的建築格：敵人從出生點（第 0 欄）一路走近
  const near = (a, b, eps = 1e-6) => typeof a === "number" && Math.abs(a - b) < eps;

  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const sessionRaw = () => page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const snapshot = async (sel) => {
    const id = "r14-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
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
  // 主頁：用部署選單實際放置黃忠（部署選單預設是防禦塔分頁，先切到武將）
  const placeHuangByMenu = async () => {
    await dismissSplash(IFRAME);
    await clickCell(IFRAME, CELL[0], CELL[1]);
    await page.waitForSelector("text=建築位部署", { timeout: 15000 });
    await page.locator('button[class*="tabBtn"]', { hasText: "武將" }).click();
    await page.locator('button[class*="menuCard"]', { hasText: "黃忠" }).click();
    await H.sleep(500);
  };
  // 開戰後每次快照：敵人血量下降就是一擊，記下當下（與上一次快照）敵人到黃忠的距離
  const trackRange = async (sel, n, timeoutMs = 90000) => {
    const hits = [];
    const lastHp = {};
    const lastDist = {};
    const undamagedFar = []; // 還沒被打到、距離超過射程的敵人快照（應該都沒有扣血）
    let maxRange = null;
    const t0 = Date.now();
    while (hits.length < n && Date.now() - t0 < timeoutMs) {
      const s = await snapshot(sel);
      const range = s.hero_ranges && s.hero_ranges.huang_zhong;
      if (typeof range === "number") maxRange = range;
      const dists = (s.hero_enemy_dist && s.hero_enemy_dist.huang_zhong) || {};
      for (const [id, hp] of Object.entries(s.enemy_hp || {})) {
        const before = id in lastHp ? lastHp[id] : SLOW_HP;
        const d = dists[id];
        if (hp < before - 0.001) {
          hits.push({ dmg: Math.round((before - hp) * 100) / 100, dist: d, prevDist: lastDist[id] ?? null, firstOnEnemy: before === SLOW_HP });
        } else if (before === SLOW_HP && typeof d === "number" && typeof range === "number" && d > range + 0.05) {
          undamagedFar.push(Math.round(d * 1000) / 1000);
        }
        lastHp[id] = hp;
        if (typeof d === "number") lastDist[id] = d;
      }
      await H.sleep(120);
    }
    return { hits, range: maxRange, undamagedFarCount: undamagedFar.length, undamagedFarMax: undamagedFar.length ? Math.max(...undamagedFar) : null };
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r14-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有 Modal 可關 */ }
    }
  };
  const heroAtk = async () => {
    const p = JSON.parse((await sessionRaw()) || "null");
    const h = p && (p.heroes || []).find((x) => x.hero_id === "huang_zhong");
    return h ? h.atk : 150; // 沒有升級紀錄時是 base_atk
  };

  // ── A. 技能說明 ──
  await section("A", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", {
      profiles: {
        [A]: { nickname: "R14 玩家", level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_7", heroes: [], team: [{ hero_id: "huang_zhong", slot: 1 }] },
      },
      battle_logs: [],
    });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), A);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('[class*="heroName"]');
    const card = await page.locator('[data-hero-id][class*="heroCard"]', { has: page.locator('[class*="heroName"]', { hasText: "黃忠" }) }).first().innerText();
    await page.locator('[class*="heroName"]', { hasText: "黃忠" }).first().click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail };
    out.A_shot = await H.shot(page, "r14-a-skill-detail");
    run.check("A-1 主頁武將視窗：黃忠的卡片顯示「技能：百步穿楊」；詳情寫明射程 1.5 倍、傷害與攻擊間隔不變，以及目前等級在戰場上的實際射程（5 格 → 7.5 格）",
      /技能：百步穿楊/.test(card) && /1\.5 倍/.test(detail) && /傷害與攻擊間隔不變/.test(detail) && /射程 5 格，戰場上是 7\.5 格/.test(detail) && /不會重複加成/.test(detail),
      out.A_modal);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('[data-testid="hero-skill-tag"]', { hasText: "百步穿楊" }).first().click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：黃忠有「百步穿楊」標籤，點開後顯示同樣的規則與實際射程", tags.includes("技能：百步穿楊") && detail2 === detail, out.A_page);
  });

  // ── B. 主頁：實際部署、實際扣血的距離 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.selectStage(page, "Mock A 慢速出兵");
    await placeHuangByMenu();
    const placed = await snapshot(IFRAME);
    await H.clickButton(page, "迎戰");
    const r = await trackRange(IFRAME, 4);
    const atk = await heroAtk();
    const first = r.hits.find((h) => h.firstOnEnemy);
    out.B = { rangeAtPlace: placed.hero_ranges, ...r, atk, first };
    run.check("B-1 用部署選單放置黃忠：戰場上的有效射程是 7.5 格", near(placed.hero_ranges && placed.hero_ranges.huang_zhong, 7.5), out.B);
    run.check("B-2 第一次扣血時敵人在原射程 5 格外、新射程 7.5 格內（主頁實戰）",
      !!first && typeof first.dist === "number" && first.dist > 5.0 && first.dist <= 7.55, out.B);
    run.check("B-3 敵人在 7.5 格外時沒有扣血；每一擊傷害都是攻擊力（沒有因技能加成）",
      r.undamagedFarCount > 0 && r.hits.length >= 3 && r.hits.every((h) => h.dmg === atk), out.B);
    // 選取黃忠：戰場上的射程圈與既有的武將資訊面板都用實際射程（截圖、面板文字），之後關閉面板
    await clickCell(IFRAME, CELL[0], CELL[1]);
    await page.waitForSelector('div[class*="upgradePanel"]', { timeout: 15000 });
    await H.sleep(400);
    out.B.panel = (await page.locator('div[class*="upgradePanel"]').first().innerText()).replace(/\s+/g, " ");
    out.B.rangeShot = await H.shot(page, "r14-b-range-circle-main");
    await page.locator('div[class*="upgradePanel"] button[class*="closeBtn"]').first().click();
    await page.waitForSelector('div[class*="upgradePanel"]', { state: "detached", timeout: 10000 }).catch(() => {});
    run.check("B-4 選取黃忠時，既有的武將資訊面板顯示實際射程（7.5 格）", /射程\s*7\.5格/.test(out.B.panel), out.B.panel);
  });

  // ── C. 戰鬥中升級兩次（update_team）：從基礎值重新計算，不疊乘 ──
  await section("C", async () => {
    const levels = [];
    for (let i = 0; i < 2; i++) {
      await H.clickButton(page, "武將");
      await page.locator('[class*="heroName"]', { hasText: "黃忠" }).first().click();
      await page.getByRole("button", { name: /^升級 \(-\d+ 點\)$/ }).click();
      await page.waitForSelector("text=升級成功！", { timeout: 60000 });
      for (let j = 0; j < 3 && (await page.locator('button[class*="modalClose"]').count()) > 0; j++) {
        await page.locator('button[class*="modalClose"]').last().click();
        await H.sleep(300);
      }
      await H.sleep(800);
      levels.push((await snapshot(IFRAME)).hero_ranges);
    }
    // 第二次升級時第一次升級的保存還在 debounce 內（有未同步修改），依既有規則在本機計算、稍後保存；後端的等級在 E 段同步完成後檢查
    const local = (JSON.parse((await sessionRaw()) || "null")?.heroes || []).find((h) => h.hero_id === "huang_zhong");
    out.C = { levels, localHero: local };
    run.check("C-1 戰鬥中升到 Lv2、Lv3：射程依序是 7.545、7.59（(5 + 等級成長) × 1.5），沒有在上一次的結果上再乘",
      near(levels[0] && levels[0].huang_zhong, 7.545) && near(levels[1] && levels[1].huang_zhong, 7.59) && local && local.level === 3, out.C);
  });

  // ── D. 獨立戰鬥頁 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_1");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
    await H.sleep(1000);
    await dismissSplash(BIFRAME);
    // 畫布縮放和主頁不同，改送部署選單點選武將時送出的同一個 place_hero 訊息（實際點擊的部署流程已在 B 段驗證）
    await page.evaluate(([sel, c, r]) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "place_hero", hero_id: "huang_zhong", cell_x: c, cell_y: r }, "*");
    }, [BIFRAME, CELL[0], CELL[1]]);
    await H.sleep(500);
    const placed = await snapshot(BIFRAME);
    await page.locator("button", { hasText: /^迎戰$/ }).click();
    const r = await trackRange(BIFRAME, 3);
    const atk = await heroAtk();
    const first = r.hits.find((h) => h.firstOnEnemy);
    out.D = { rangeAtPlace: placed.hero_ranges, ...r, atk, first };
    run.check("D-1 獨立戰鬥頁：Lv3 黃忠的有效射程 7.59 格；第一次扣血時敵人在 5 格外、射程內；更遠時沒有扣血；每一擊都是攻擊力",
      near(placed.hero_ranges && placed.hero_ranges.huang_zhong, 7.59) && !!first && first.dist > 5.0 && first.dist <= 7.64 &&
        r.undamagedFarCount > 0 && r.hits.length >= 2 && r.hits.every((h) => h.dmg === atk),
      out.D);
    out.D.shot = await H.shot(page, "r14-d-battle-route");
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
  });

  // ── E. 存檔與 session 不帶技能或加成後的射程 ──
  await section("E", async () => {
    await waitSync("idle");
    const d = await db();
    const p = d.profiles[A];
    const sess = await sessionRaw();
    const bad = /skill|long_range|range_multiplier|attack_range/;
    const saves = (await H.gasLog(page)).filter((e) => e.action === "save_profile");
    out.E = { profileKeys: Object.keys(p), heroKeys: (p.heroes || []).map((h) => Object.keys(h)), team: p.team, saves: saves.length, sessionHasSkill: bad.test(sess) };
    const huang = (p.heroes || []).find((h) => h.hero_id === "huang_zhong");
    out.E.backendHuang = huang;
    run.check("E-1 同步完成後後端是 Lv3；存檔與 session 都沒有技能、倍率或射程欄位；隊伍仍只有 hero_id／slot",
      !!huang && huang.level === 3 && !bad.test(JSON.stringify(p)) && !out.E.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]'),
      out.E);
  });

  return run.finish({ out });
}
