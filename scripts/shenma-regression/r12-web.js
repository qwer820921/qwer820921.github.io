async (page) => {
  // R12（瀏覽器）：首擊加倍，馬超「衝鋒」（正式設定表的被動描述「衝鋒：首擊傷害翻倍」；原本綁在趙雲，趙雲改成閃避）
  // - 技能說明：主頁的武將視窗、獨立的武將頁，列表顯示技能名稱、詳情顯示完整規則；馬超是「衝鋒」、趙雲是「閃避」、關羽是「減速光環」
  // - 主頁（用部署選單實際點選）與獨立戰鬥頁（送部署選單的同一個 place_hero 訊息）放置馬超並開戰，用唯讀快照的敵人血量（enemy_hp）算出每一擊的實際傷害：
  //   第一擊是攻擊力的 2 倍（150 → 300），之後恢復 150；觸發時武將上方出現金色「x2!」（截圖）；這一場只觸發一次
  // - 同一關重來（新的一場）可以再觸發；結算送到後端的 save_result／save_profile 與 session 都不帶技能或戰場暫態欄位
  // 全部 mock、虛構金鑰 test_r12_*；馬超的設定只在這支腳本加進 mock 名單（__shenma_r12_extra，數值和 mock 的趙雲相同、職業騎兵）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H, config } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const A = "test_r12_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const SLOW_HP = 99999; // harness 的 mock_a_slow（Mock A 慢速出兵）
  const ATK = 150; // 馬超的 base_atk（等級 1，和 mock 的趙雲相同）
  const MA = { ...config.heroes.find((h) => h.hero_id === "zhao_yun"), hero_id: "ma_chao", name: "馬超", image: "hero_ma_chao.webp" };

  // 馬超的設定只在這支腳本加進 mock 名單：旗標打開時，mock 後端回應的武將設定多一位馬超
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_r12_extra") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_heroes_config") {
          const res = await inner(input, init);
          const json = await res.json();
          const heroes = (json.heroes || []).filter((h) => h.hero_id !== extra.hero_id);
          return new Response(JSON.stringify({ ...json, heroes: [...heroes, extra] }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }
      return inner(input, init);
    };
  }, MA);

  const log = () => H.gasLog(page);
  const since = async (t, action) => (await log()).filter((e) => e.t >= t && (!action || e.action === action));
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const sessionRaw = () => page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const profile = (nickname) => ({
    nickname, level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_7", heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "ma_chao", slot: 2 }],
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
  // 在建築格 (1,4) 放置馬超：先點掉載入關卡時的「進入戰場」開場畫面；部署選單預設是防禦塔分頁，先切到武將
  const placeMa = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
    await clickCell(sel, 1, 4);
    await page.waitForSelector("text=建築位部署", { timeout: 15000 });
    await page.locator('button[class*="tabBtn"]', { hasText: "武將" }).click();
    await page.locator('button[class*="menuCard"]', { hasText: "馬超" }).click();
    await H.sleep(500);
  };
  // 開戰後每次快照比對敵人血量：每一次下降就是一擊的實際傷害（場上只有馬超在攻擊）。
  // 第一次看到的敵人以最大血量為基準，才不會漏掉出現當下的那一擊。第一次看到首擊加倍的記錄時立刻截圖
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
    await page.evaluate((k) => {
      localStorage.setItem("shenma_player_key", k);
      localStorage.setItem("__shenma_r12_extra", "1");
    }, A);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('[class*="heroName"]');
    const cardText = (name) => page.locator('[data-hero-id][class*="heroCard"]', { has: page.locator('[class*="heroName"]', { hasText: name }) }).first().innerText();
    const maCard = await cardText("馬超");
    const zhaoCard = await cardText("趙雲");
    const guanCard = await cardText("關羽");
    await page.locator('[class*="heroName"]', { hasText: "馬超" }).first().click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { maCard, zhaoCard, guanCard, detail };
    // 首擊加倍只給馬超：趙雲的卡片是「閃避」、關羽是「減速光環」，都不是衝鋒
    run.check("A-1 主頁武將視窗：馬超的卡片顯示「技能：衝鋒」，趙雲是「技能：閃避」、關羽是「技能：減速光環」（都不是衝鋒）",
      /技能：衝鋒/.test(maCard) && /技能：閃避/.test(zhaoCard) && /技能：減速光環/.test(guanCard) && !/衝鋒/.test(zhaoCard) && !/衝鋒/.test(guanCard), out.A_modal);
    run.check("A-2 馬超的詳情是短版說明",
      /技能：衝鋒/.test(detail) &&
        detail.includes("每場戰鬥第一次命中的普通攻擊造成 2 倍傷害，之後恢復普通攻擊；換波次或移動位置不會再觸發。"),
      out.A_modal);
    out.A_shot = await H.shot(page, "r12-a-skill-detail");
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('[data-testid="hero-skill-tag"]', { hasText: "衝鋒" }).first().click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    // mock 名單的四位武將加上馬超都有技能：關羽（減速光環）、趙雲（閃避）、黃忠（百步穿楊）、周瑜（火攻）、馬超（衝鋒）各一個技能標籤
    run.check("A-3 武將頁：五個技能標籤是減速光環、閃避、百步穿楊、火攻、衝鋒（各一個）；點開馬超的衝鋒顯示同樣的完整規則",
      tags.length === 5 && JSON.stringify([...tags].sort()) === JSON.stringify(["技能：減速光環", "技能：閃避", "技能：百步穿楊", "技能：火攻", "技能：衝鋒"].sort()) && detail2 === detail,
      out.A_page);
  });

  // ── B. 主頁：實際開戰，第一擊 2 倍、之後恢復；這一場只觸發一次 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.selectStage(page, "Mock A 慢速出兵");
    const before = await snapshot(IFRAME);
    await placeMa(IFRAME);
    await H.sleep(2000); // 備戰中、沒有敵人：不會用掉
    const idle = await snapshot(IFRAME);
    await H.clickButton(page, "迎戰");
    const r = await trackHits(IFRAME, 4, "r12-b-charge-main");
    out.B = { before: before.first_strike_used, idle: idle.first_strike_used, ...r };
    run.check("B-1 主頁：放置馬超後在備戰中等待，首擊加倍沒有被用掉", Object.keys(idle.first_strike_used || {}).length === 0, out.B);
    run.check("B-2 主頁實戰：第一擊造成 300（攻擊力 150 的 2 倍），之後每一擊恢復 150",
      r.hits.length >= 3 && r.hits[0] === ATK * 2 && r.hits.slice(1).every((h) => h === ATK), out.B);
    run.check("B-3 觸發時記下一次首擊加倍（馬超、300），之後的攻擊沒有再觸發；觸發當下有截圖",
      !!r.shot && JSON.stringify(r.firstStrikeAtEnd) === JSON.stringify({ ma_chao: ATK * 2 }), out.B);
  });

  // ── C. 同一關重來（新的一場）可以再觸發 ──
  await section("C", async () => {
    await H.selectStage(page, "Mock A 慢速出兵");
    const fresh = await snapshot(IFRAME);
    await placeMa(IFRAME);
    await H.clickButton(page, "迎戰");
    const r = await trackHits(IFRAME, 3, "r12-c-charge-restart");
    out.C = { freshUsed: fresh.first_strike_used, freshBattleId: fresh.battle_id, prevBattleId: out.B && out.B.battleId, ...r };
    run.check("C-1 同一關重來是新的一場（battle_id 不同）：首擊加倍的紀錄清空，第一擊又是 300，之後 150",
      Object.keys(fresh.first_strike_used || {}).length === 0 && fresh.battle_id !== out.C.prevBattleId &&
        r.hits.length >= 2 && r.hits[0] === ATK * 2 && r.hits.slice(1).every((h) => h === ATK),
      out.C);
  });

  // ── D. 結算與保存：不帶技能或戰場暫態欄位 ──
  await section("D", async () => {
    await H.selectStage(page, "Mock W 勝利兩波");
    await placeMa(IFRAME);
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
    run.check("D-1 勝利關卡也觸發了首擊加倍（馬超、300）", JSON.stringify(used) === JSON.stringify({ ma_chao: ATK * 2 }), out.D);
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
      await page.evaluate((sel) => document.querySelector(sel).contentWindow.eval("window.parent.postMessage({ __godot_bridge: true, type: 'game_ready', protocol: 7 }, '*')"), BIFRAME);
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
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "place_hero", hero_id: "ma_chao", cell_x: 1, cell_y: 4 }, "*");
    }, BIFRAME);
    await H.sleep(500);
    await page.locator("button", { hasText: /^迎戰$/ }).click();
    const r = await trackHits(BIFRAME, 4, "r12-e-charge-battle-route");
    out.E = r;
    run.check("E-1 獨立戰鬥頁實戰：第一擊 300，之後每一擊 150；這一場只觸發一次",
      r.hits.length >= 3 && r.hits[0] === ATK * 2 && r.hits.slice(1).every((h) => h === ATK) &&
        JSON.stringify(r.firstStrikeAtEnd) === JSON.stringify({ ma_chao: ATK * 2 }) && !!r.shot,
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
      // 進入戰場的頂欄（引擎還在載入時提早顯示的不算）
      const mainOk = await readyWithin(() => (() => { const b = document.querySelector('[title="切換關卡"]'); const bar = b && b.closest("[data-hud-phase]"); return !!b && (!bar || bar.dataset.hudPhase !== "preload"); })(), 60000);
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
