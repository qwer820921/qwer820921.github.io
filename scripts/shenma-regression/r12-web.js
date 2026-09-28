async (page) => {
  // R12（瀏覽器）：趙雲「奇襲」第一版
  // - 技能說明：主頁的武將視窗、獨立的武將頁，列表顯示技能名稱、詳情顯示完整規則；沒有技能的武將不顯示
  // - 主頁（用部署選單實際點選）與獨立戰鬥頁（送部署選單的同一個 place_hero 訊息）放置趙雲並開戰，用唯讀快照的敵人血量（enemy_hp）算出每一擊的實際傷害：
  //   第一擊是攻擊力的 2 倍（150 → 300），之後恢復 150；觸發時武將上方出現金色「x2!」（截圖）；這一場只觸發一次
  // - 同一關重來（新的一場）可以再觸發；結算送到後端的 save_result／save_profile 與 session 都不帶技能或戰場暫態欄位
  // 全部 mock、虛構金鑰 test_r12_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const A = "test_r12_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const SLOW_HP = 99999; // harness 的 mock_a_slow（Mock A 慢速出兵）
  const ATK = 150; // harness 的趙雲 base_atk（等級 1）

  const log = () => H.gasLog(page);
  const since = async (t, action) => (await log()).filter((e) => e.t >= t && (!action || e.action === action));
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const sessionRaw = () => page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const profile = (nickname) => ({
    nickname, level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_7", heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
  });
  const snapshot = async (sel) => {
    const id = "r12-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  // 在指定 iframe 的格子上點擊（和 H.clickCell 相同的換算，iframe 可以選主頁或獨立戰鬥頁）
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
  // 在建築格 (1,4) 放置趙雲：先點掉載入關卡時的「進入戰場」開場畫面；部署選單預設是防禦塔分頁，先切到武將
  const placeZhao = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
    await clickCell(sel, 1, 4);
    await page.waitForSelector("text=建築位部署", { timeout: 15000 });
    await page.locator('button[class*="tabBtn"]', { hasText: "武將" }).click();
    await page.locator('button[class*="menuCard"]', { hasText: "趙雲" }).click();
    await H.sleep(500);
  };
  // 開戰後每次快照比對敵人血量：每一次下降就是一擊的實際傷害（場上只有趙雲在攻擊）。
  // 第一次看到的敵人以最大血量為基準，才不會漏掉出現當下的那一擊。第一次看到奇襲記錄時立刻截圖
  const trackHits = async (sel, n, shotName, timeoutMs = 60000) => {
    const hits = [];
    const last = {};
    let shot = null;
    let first = null;
    const t0 = Date.now();
    while (hits.length < n && Date.now() - t0 < timeoutMs) {
      const s = await snapshot(sel);
      if (!shot && s.first_strike_used && Object.keys(s.first_strike_used).length > 0) {
        shot = await H.shot(page, shotName);
        first = s.first_strike_used;
      }
      for (const [id, hp] of Object.entries(s.enemy_hp || {})) {
        const before = id in last ? last[id] : SLOW_HP;
        if (hp < before - 0.001) hits.push(Math.round((before - hp) * 100) / 100);
        last[id] = hp;
      }
      await H.sleep(100);
    }
    const end = await snapshot(sel);
    return { hits, shot, firstStrikeAtTrigger: first, firstStrikeAtEnd: end.first_strike_used, battleId: end.battle_id };
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r12-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有 Modal 可關 */ }
    }
  };

  // ── A. 技能說明 ──
  await section("A", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", { profiles: { [A]: profile("R12 玩家") }, battle_logs: [] });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), A);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('div[class*="heroName"]');
    const cardText = (name) => page.locator('div[class*="heroCard"]', { has: page.locator('div[class*="heroName"]', { hasText: name }) }).first().innerText();
    const zhaoCard = await cardText("趙雲");
    const guanCard = await cardText("關羽");
    await page.locator('div[class*="heroName"]', { hasText: "趙雲" }).first().click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { zhaoCard, guanCard, detail };
    run.check("A-1 主頁武將視窗：趙雲的卡片顯示「技能：奇襲」，關羽沒有技能標籤",
      /技能：奇襲/.test(zhaoCard) && !/技能：/.test(guanCard), out.A_modal);
    run.check("A-2 趙雲的詳情顯示完整規則：第一次命中 2 倍、沒有目標不會用掉、同一場不再觸發、換關或重來才重置",
      /技能：奇襲/.test(detail) && /第一次命中敵人的普通攻擊造成 2 倍傷害/.test(detail) && /沒有目標時不會用掉/.test(detail) && /切換關卡或重新開始才會重置/.test(detail),
      out.A_modal);
    out.A_shot = await H.shot(page, "r12-a-skill-detail");
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('[data-testid="hero-skill-tag"]').first().click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    // Round 14 起 mock 名單多了黃忠（百步穿楊）、Round 15 起多了周瑜（火攻）：武將頁依序是趙雲、黃忠、周瑜三個技能標籤；第一個是趙雲
    run.check("A-3 武將頁：趙雲的技能標籤是奇襲（關羽沒有），點開後顯示同樣的完整規則", tags.length === 3 && tags[0] === "技能：奇襲" && tags[1] === "技能：百步穿楊" && tags[2] === "技能：火攻" && detail2 === detail, out.A_page);
  });

  // ── B. 主頁：實際開戰，第一擊 2 倍、之後恢復；這一場只觸發一次 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.selectStage(page, "Mock A 慢速出兵");
    const before = await snapshot(IFRAME);
    await placeZhao(IFRAME);
    await H.sleep(2000); // 備戰中、沒有敵人：不會用掉
    const idle = await snapshot(IFRAME);
    await H.clickButton(page, "迎戰");
    const r = await trackHits(IFRAME, 4, "r12-b-first-strike-main");
    out.B = { before: before.first_strike_used, idle: idle.first_strike_used, ...r };
    run.check("B-1 主頁：放置趙雲後在備戰中等待，奇襲沒有被用掉", Object.keys(idle.first_strike_used || {}).length === 0, out.B);
    run.check("B-2 主頁實戰：第一擊造成 300（攻擊力 150 的 2 倍），之後每一擊恢復 150",
      r.hits.length >= 3 && r.hits[0] === ATK * 2 && r.hits.slice(1).every((h) => h === ATK), out.B);
    run.check("B-3 觸發時記下一次奇襲（趙雲、300），之後的攻擊沒有再觸發；觸發當下有截圖",
      !!r.shot && JSON.stringify(r.firstStrikeAtEnd) === JSON.stringify({ zhao_yun: ATK * 2 }), out.B);
  });

  // ── C. 同一關重來（新的一場）可以再觸發 ──
  await section("C", async () => {
    await H.selectStage(page, "Mock A 慢速出兵");
    const fresh = await snapshot(IFRAME);
    await placeZhao(IFRAME);
    await H.clickButton(page, "迎戰");
    const r = await trackHits(IFRAME, 3, "r12-c-first-strike-restart");
    out.C = { freshUsed: fresh.first_strike_used, freshBattleId: fresh.battle_id, prevBattleId: out.B && out.B.battleId, ...r };
    run.check("C-1 同一關重來是新的一場（battle_id 不同）：奇襲紀錄清空，第一擊又是 300，之後 150",
      Object.keys(fresh.first_strike_used || {}).length === 0 && fresh.battle_id !== out.C.prevBattleId &&
        r.hits.length >= 2 && r.hits[0] === ATK * 2 && r.hits.slice(1).every((h) => h === ATK),
      out.C);
  });

  // ── D. 結算與保存：不帶技能或戰場暫態欄位 ──
  await section("D", async () => {
    await H.selectStage(page, "Mock W 勝利兩波");
    await placeZhao(IFRAME);
    const idx = await H.bridgeLen(page);
    const t0 = Date.now();
    await H.clickButton(page, "自動");
    await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 300000, polling: 500 });
    const used = (await snapshot(IFRAME)).first_strike_used;
    const res = await page.evaluate((i) => (window.__bridgeLog || []).slice(i).filter((m) => m.type === undefined && typeof m.result === "string").pop() || null, idx);
    await page.getByRole("button", { name: "確認", exact: true }).click();
    await H.sleep(3000);
    await waitSync("idle");
    const d = await db();
    const logs = d.battle_logs || [];
    const saves = await since(t0, "save_profile");
    const results = await since(t0, "save_result");
    const sess = await sessionRaw();
    const p = d.profiles[A];
    const bad = /skill|first_strike|first_attack/;
    out.D = {
      used, resultKeys: res && Object.keys(res), battleLogKeys: logs.map((l) => Object.keys(l)), saveResults: results.map((e) => e.key),
      saves: saves.length, profileTeam: p.team, profileKeys: Object.keys(p), sessionHasSkill: bad.test(sess),
    };
    run.check("D-1 勝利關卡也觸發了奇襲（趙雲、300）", JSON.stringify(used) === JSON.stringify({ zhao_yun: ATK * 2 }), out.D);
    run.check("D-2 結算只送 1 次 save_result；Godot 的結算與後端的戰鬥紀錄都沒有技能欄位",
      results.length === 1 && results[0].key === A && res && !Object.keys(res).some((k) => bad.test(k)) &&
        logs.length === 1 && !JSON.stringify(logs[0]).match(bad),
      out.D);
    run.check("D-3 保存到後端的存檔與 session 都沒有技能或戰場暫態欄位（隊伍仍只有 hero_id／slot）",
      saves.length >= 1 && !bad.test(JSON.stringify(p)) && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') && !out.D.sessionHasSkill,
      out.D);
  });

  // ── E. 獨立戰鬥頁 ──
  await section("E", async () => {
    const consoleLog = [];
    const onConsole = (m) => consoleLog.push({ t: Date.now(), type: m.type(), text: m.text().slice(0, 160) });
    page.on("console", onConsole);
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_1");
    try {
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
    } catch (e) {
      // 失敗時留下診斷：iframe 狀態、Godot 訊息、主控台輸出
      out.E_diag = {
        page: await page.evaluate((sel) => {
          const f = document.querySelector(sel);
          let inner = null;
          try { inner = { href: f.contentWindow.location.href, ready: f.contentDocument && f.contentDocument.readyState }; } catch (err) { inner = String(err); }
          return { url: location.href, loading: /載入戰場中/.test(document.body.innerText), bridge: (window.__bridgeLog || []).map((m) => m.type || "result"), inner };
        }, BIFRAME),
        console: consoleLog.filter((l) => !/preload|DevTools/.test(l.text)).slice(0, 60),
      };
      // 區分原因：從遊戲 iframe 內再送一次 game_ready，頁面若接著送出關卡資料，代表監聽與來源檢查都正常，是時序問題
      const before = await H.bridgeLen(page);
      await page.evaluate((sel) => document.querySelector(sel).contentWindow.eval("window.parent.postMessage({ __godot_bridge: true, type: 'game_ready', protocol: 2 }, '*')"), BIFRAME);
      await H.sleep(5000);
      out.E_diag.afterReplay = {
        bridgeSince: (await H.bridgeSince(page, before)).map((m) => m.type || "result"),
        loading: await page.evaluate(() => /載入戰場中/.test(document.body.innerText)),
      };
      throw e;
    } finally {
      page.off("console", onConsole);
    }
    await H.sleep(1000);
    // 獨立戰鬥頁的畫布縮放和主頁不同（地圖比畫面寬），主頁用的格子座標換算不適用：
    // 點掉開場畫面後，改送部署選單點選武將時送出的同一個 place_hero 訊息（實際點擊的部署流程已在 B～D 段驗證）
    const center = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, BIFRAME);
    await page.mouse.click(center.x, center.y);
    await H.sleep(800);
    await page.evaluate((sel) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "place_hero", hero_id: "zhao_yun", cell_x: 1, cell_y: 4 }, "*");
    }, BIFRAME);
    await H.sleep(500);
    await page.locator("button", { hasText: /^迎戰$/ }).click();
    const r = await trackHits(BIFRAME, 4, "r12-e-first-strike-battle-route");
    out.E = r;
    run.check("E-1 獨立戰鬥頁實戰：第一擊 300，之後每一擊 150；這一場只觸發一次",
      r.hits.length >= 3 && r.hits[0] === ATK * 2 && r.hits.slice(1).every((h) => h === ATK) &&
        JSON.stringify(r.firstStrikeAtEnd) === JSON.stringify({ zhao_yun: ATK * 2 }) && !!r.shot,
      out.E);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
  });

  // ── F. 遊戲比頁面先準備好：React 還沒掛上訊息監聽，Godot 就送出了 game_ready ──
  // 讓 Next.js 的頁面程式（/_next/static/chunks/*.js）延遲 4 秒才回應；遊戲檔案已在 Service Worker 快取裡、很快就啟動，
  // 所以 game_ready 一定比頁面的監聽早到。頁面不能因此一直停在載入中
  await section("F", async () => {
    const CHUNKS = /\/_next\/static\/chunks\/.*\.js(\?.*)?$/;
    const delayChunks = async (route) => {
      try {
        await page.waitForTimeout(4000);
        await route.fallback();
      } catch {
        /* 腳本結束時仍在延遲中的請求：頁面已關閉，忽略 */
      }
    };
    const readyWithin = async (pred, timeout) => {
      try {
        await page.waitForFunction(pred, null, { timeout, polling: 250 });
        return true;
      } catch {
        return false;
      }
    };
    await page.context().route(CHUNKS, delayChunks);
    try {
      await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_1");
      const battleOk = await readyWithin(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), 60000);
      out.F_battle = { ok: battleOk, bridge: (await H.bridgeSince(page, 0)).map((m) => m.type || "result"), loading: await page.evaluate(() => /載入戰場中/.test(document.body.innerText)) };
      if (!battleOk) out.F_battle.shot = await H.shot(page, "r12-f-battle-route-stuck");
      await page.goto(H.BASE + "/shenmaSanguo");
      const mainOk = await readyWithin(() => document.querySelector('[title="切換關卡"]') !== null, 60000);
      out.F_main = { ok: mainOk, bridge: (await H.bridgeSince(page, 0)).map((m) => m.type || "result") };
      if (!mainOk) out.F_main.shot = await H.shot(page, "r12-f-main-stuck");
    } finally {
      await page.context().unroute(CHUNKS, delayChunks);
    }
    run.check("F-1 獨立戰鬥頁：頁面程式比遊戲晚 4 秒載入（game_ready 早到），仍然送出關卡資料、不會停在載入中", out.F_battle.ok, out.F_battle);
    run.check("F-2 主頁：頁面程式比遊戲晚 4 秒載入，仍然送出關卡資料、顯示 HUD", out.F_main.ok, out.F_main);
  });

  return run.finish({ out });
}
