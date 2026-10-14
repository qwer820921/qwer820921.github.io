async (page) => {
  // 發布入口（瀏覽器，真 Godot 產物、mock 後端）：網站兩個入口都開網站入口指標（gameRelease.json）的遊戲目錄 H.GAME_DIR，
  // 遊戲檔案與背景音樂都從那個目錄取得、沒有碰舊正式版目錄；兩個入口各開戰一場（自動）到結算；手機尺寸開主頁並開戰
  // - RE-1 主頁：iframe 網址＝H.GAME_DIR＋index.html，game_ready 協定 7，遊戲頁面由這個目錄的 Service Worker 控制
  // - RE-2 主頁開戰（自動）→ 換到第 2 波 → 勝利結算一次（save_result 1 次）
  // - RE-3 背景音樂：按掉進場畫面後從 H.GAME_DIR 下載 bgm_battle.ogg（HTTP 200）
  // - RE-4 獨立戰鬥頁：iframe 網址相同、game_ready 協定 7、開戰到結算一次
  // - RE-5 手機（390×844）：主頁的遊戲畫面寬度在視窗內、HUD 可用，開戰後換到第 2 波
  // - RE-6 全程遊戲相關的請求（頁面與 Service Worker）都在 H.GAME_DIR，沒有任何舊正式版目錄（/games/shenmaSanguo/）的請求
  // - RE-7 引擎啟動時的焦點：寫入限制中（HUD 在引擎啟動前就出現）攔住資料包、開著關卡選擇視窗時放行，焦點留在視窗裡；
  //        沒有在用焦點時照常交給遊戲畫面
  // 全部虛構金鑰 test_re_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const PROTOCOL = 7;
  const KEY = "test_re_a";
  const W = "Mock W 勝利兩波";
  const ENTRY = H.GAME_DIR + "index.html";

  // 遊戲相關的請求與回應（頁面與 Service Worker 發出的都算）
  const games = [];
  const onRequest = (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/games/")) games.push({ path: u.pathname, sw: !!(r.serviceWorker && r.serviceWorker()) });
  };
  const bgm = [];
  const onResponse = (r) => {
    const u = new URL(r.url());
    if (u.pathname.endsWith("/bgm_battle.ogg")) bgm.push({ path: u.pathname, status: r.status() });
  };
  ctx.on("request", onRequest);
  ctx.on("response", onResponse);

  const profile = (nickname) => ({
    nickname, level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_4", heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }],
  });
  const prepare = async () => {
    await H.resetOrigin(page);
    await page.evaluate(([k, db]) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify(db));
      localStorage.setItem("shenma_player_key", k);
    }, [KEY, { profiles: { [KEY]: profile("入口測試") }, battle_logs: [] }]);
  };
  const frameInfo = (sel) =>
    page.evaluate(async (sel) => {
      const f = document.querySelector(sel);
      const w = f && f.contentWindow;
      return {
        src: f ? f.getAttribute("src") : null,
        path: w ? w.location.pathname : null,
        ver: w ? new URL(w.location.href).searchParams.get("shenma_ver") : null,
        controller: w && w.navigator.serviceWorker.controller ? w.navigator.serviceWorker.controller.scriptURL : null,
        scopes: (await navigator.serviceWorker.getRegistrations()).map((r) => r.scope),
      };
    }, sel);
  const saveResults = async (t0) => (await H.gasLog(page)).filter((e) => e.t >= t0 && e.action === "save_result");
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `release-entry-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };

  try {
    // ── 主頁 ──
    await section("main", async () => {
      await prepare();
      await page.goto(H.BASE + "/shenmaSanguo");
      await H.waitHud(page);
      const ready = await H.waitBridge(page, 0, { type: "game_ready" }, 180000);
      const info = await frameInfo(IFRAME);
      out.main = { readyProtocol: ready.protocol ?? null, info };
      run.check("RE-1 主頁的遊戲 iframe 開網站入口指標的遊戲目錄（" + ENTRY + "），game_ready 協定 " + PROTOCOL + "，由這個目錄的 Service Worker 控制",
        info.src === ENTRY && info.path === ENTRY && ready.protocol === PROTOCOL &&
          info.controller === H.BASE + H.GAME_DIR + "index.service.worker.js" && info.scopes.includes(H.BASE + H.GAME_DIR),
        out.main);
      await H.dismissSplash(page);
      const t0 = Date.now();
      await H.selectStage(page, W);
      const idx = await H.bridgeLen(page);
      await H.clickButton(page, "自動");
      const started = await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
      const wave2 = await H.waitBridge(page, idx, { type: "update_stats", wave: 2 }, 300000);
      await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 300000, polling: 500 });
      const result = (await H.bridgeSince(page, idx)).filter((m) => m.type === undefined && typeof m.result === "string").pop() || null;
      await page.getByRole("button", { name: "確認", exact: true }).click();
      await H.sleep(3000);
      const saves = await saveResults(t0);
      out.mainBattle = { battleId: started.battle_id, wave2: wave2.wave, result: result && result.result, saves: saves.length };
      run.check("RE-2 主頁開戰（自動）：換到第 2 波，勝利結算一次（save_result 1 次）",
        wave2.wave === 2 && !!result && result.result === "WIN" && result.battle_id === started.battle_id && saves.length === 1, out.mainBattle);
      out.main_shot = await H.shot(page, "release-entry-main-after-settle");
      // 背景音樂：遊戲收到關卡、按掉進場畫面（玩家點擊）之後才下載；等它下載完成
      for (let i = 0; i < 60 && !bgm.some((b) => b.status === 200); i++) await H.sleep(500);
      out.bgm = bgm.slice();
      run.check("RE-3 背景音樂從網站入口的遊戲目錄下載（" + H.GAME_DIR + "bgm_battle.ogg，HTTP 200）",
        bgm.length > 0 && bgm.every((b) => b.path === H.GAME_DIR + "bgm_battle.ogg") && bgm.some((b) => b.status === 200), out.bgm);
    });

    // ── 獨立戰鬥頁 ──
    await section("battle", async () => {
      const t0 = Date.now();
      await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_4");
      const ready = await H.waitBridge(page, 0, { type: "game_ready" }, 180000);
      await H.waitBridge(page, 0, { type: "update_stats", wave: 0, game_state: 1 }, 60000);
      const info = await frameInfo(BIFRAME);
      const idx = await H.bridgeLen(page);
      await page.locator("button", { hasText: /^自動/ }).click();
      const started = await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
      await page.waitForFunction(() => /確認，返回主選單/.test(document.body.innerText), null, { timeout: 300000, polling: 500 });
      const result = (await H.bridgeSince(page, idx)).filter((m) => m.type === undefined && typeof m.result === "string").pop() || null;
      out.battle_shot = await H.shot(page, "release-entry-battle-result");
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "確認，返回主選單");
        b.click();
      });
      await page.waitForURL(/\/shenmaSanguo$/, { timeout: 60000 });
      await H.waitHud(page);
      await H.sleep(2000);
      const saves = await saveResults(t0);
      out.battle = { readyProtocol: ready.protocol ?? null, info, result: result && result.result, sameBattle: !!result && result.battle_id === started.battle_id, saves: saves.length };
      run.check("RE-4 獨立戰鬥頁：iframe 開同一個遊戲目錄、game_ready 協定 " + PROTOCOL + "、由這個目錄的 Service Worker 控制；開戰到結算一次（save_result 1 次）",
        info.src === ENTRY && info.path === ENTRY && ready.protocol === PROTOCOL &&
          info.controller === H.BASE + H.GAME_DIR + "index.service.worker.js" && out.battle.sameBattle && saves.length === 1,
        out.battle);
    });

    // ── 引擎啟動時的焦點：網頁開著視窗時不搶；沒有在用焦點時照常交給遊戲畫面 ──
    await section("focus", async () => {
      const PCK = "**" + H.GAME_DIR + "index.pck";
      const held = [];
      let holding = false;
      await ctx.route(PCK, (route) => (holding ? held.push(route) : route.continue()));
      try {
        await prepare();
        await page.goto(H.BASE + "/shenmaSanguo");
        await H.waitHud(page);
        await page.waitForFunction(() => document.querySelector('[data-sync-status="idle"]') !== null, null, { timeout: 90000 });
        // 主頁的 HUD 要等遊戲收到關卡資料才出現；寫入限制中（存檔暫停保存）HUD 照常出現，引擎還沒啟動也能開關卡選擇（和 r17 的 K-4 相同）。
        // 拿掉遊戲的 Service Worker 與快取（資料包要重新下載），攔住資料包後重新整理
        await page.evaluate(async () => {
          const s = JSON.parse(sessionStorage.getItem("shenma_player_state"));
          s.migrationHold = { since: Date.now() };
          sessionStorage.setItem("shenma_player_state", JSON.stringify(s));
          for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
          for (const k of await caches.keys()) await caches.delete(k);
        });
        holding = true;
        await page.reload();
        await H.waitHud(page);
        await page.waitForSelector("text=存檔暫停保存", { timeout: 30000 });
        for (let i = 0; i < 120 && held.length === 0; i++) await H.sleep(250);
        // 資料包被攔住（引擎還沒啟動）時打開關卡選擇視窗，焦點在視窗裡
        await page.locator('[title="切換關卡"]').click();
        await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
        await page.waitForFunction(() => document.activeElement && !!document.activeElement.closest('[role="dialog"]'), null, { timeout: 10000 });
        const before = await page.evaluate(() => document.activeElement.getAttribute("aria-label") || document.activeElement.innerText.slice(0, 20));
        const startedBefore = await page.evaluate((sel) => !document.querySelector(sel).contentDocument.getElementById("status"), IFRAME);
        const heldCount = held.length;
        holding = false;
        for (const r of held.splice(0)) await r.continue();
        await page.waitForFunction((sel) => {
          const d = document.querySelector(sel).contentDocument;
          return !!d && !!d.getElementById("canvas") && !d.getElementById("status");
        }, IFRAME, { timeout: 120000, polling: 200 });
        await H.sleep(800);
        const busy = await page.evaluate((sel) => {
          const f = document.querySelector(sel);
          const a = document.activeElement;
          return {
            active: a ? a.tagName : null,
            inDialog: !!a && !!a.closest('[role="dialog"]'),
            stats: f.contentWindow.__shenmaGuard ? f.contentWindow.__shenmaGuard.stats : null,
          };
        }, IFRAME);
        out.focusBusy = { before, startedBefore, heldCount, ...busy };
        run.check("RE-7 引擎啟動時網頁開著視窗（寫入限制中的關卡選擇；資料包攔到引擎啟動前才放行）：焦點留在視窗裡，沒有被遊戲畫面搶走（focusedAtStart＝false）",
          heldCount > 0 && !startedBefore && busy.inDialog && busy.active !== "IFRAME" && busy.stats && busy.stats.focusedAtStart === false, out.focusBusy);
        await page.keyboard.press("Escape");
        await H.sleep(300);
        // 清掉寫入限制
        await page.evaluate(() => {
          const s = JSON.parse(sessionStorage.getItem("shenma_player_state"));
          delete s.migrationHold;
          sessionStorage.setItem("shenma_player_state", JSON.stringify(s));
          sessionStorage.removeItem("__site_iso_tab");
        });
      } finally {
        holding = false;
        for (const r of held.splice(0)) await r.continue().catch(() => {});
        await ctx.unroute(PCK).catch(() => {});
      }
      // 沒有在用焦點：重新整理後引擎啟動時把焦點交給遊戲畫面（和原本的行為相同）
      await page.reload();
      await H.waitHud(page);
      await page.waitForFunction((sel) => {
        const d = document.querySelector(sel).contentDocument;
        return !!d && !!d.getElementById("canvas") && !d.getElementById("status");
      }, IFRAME, { timeout: 120000, polling: 200 });
      await H.sleep(800);
      const free = await page.evaluate((sel) => {
        const f = document.querySelector(sel);
        const d = f.contentDocument;
        return {
          active: document.activeElement ? document.activeElement.tagName : null,
          innerActive: d.activeElement ? d.activeElement.id : null,
          stats: f.contentWindow.__shenmaGuard ? f.contentWindow.__shenmaGuard.stats : null,
        };
      }, IFRAME);
      out.focusFree = free;
      run.check("RE-7 網頁沒有在用焦點時：引擎啟動後焦點交給遊戲畫面（iframe 裡的 canvas，focusedAtStart＝true）",
        free.active === "IFRAME" && free.innerActive === "canvas" && free.stats && free.stats.focusedAtStart === true, out.focusFree);
    });

    // ── 手機尺寸 ──
    await section("mobile", async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(H.BASE + "/shenmaSanguo");
      await H.waitHud(page);
      await H.waitBridge(page, 0, { type: "game_ready" }, 180000);
      const rect = await H.iframeRect(page);
      await H.selectStage(page, W);
      const idx = await H.bridgeLen(page);
      await H.clickButton(page, "自動");
      await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
      const wave2 = await H.waitBridge(page, idx, { type: "update_stats", wave: 2 }, 300000);
      const info = await frameInfo(IFRAME);
      out.mobile = { rect, wave2: wave2.wave, info, hud: await H.hud(page) };
      out.mobile_shot = await H.shot(page, "release-entry-mobile-wave2");
      run.check("RE-5 手機（390×844）：遊戲畫面寬度在視窗內、開的是同一個遊戲目錄；開戰（自動）後換到第 2 波，HUD 顯示戰鬥中",
        rect.left >= 0 && rect.left + rect.width <= 390 + 1 && rect.width > 200 && info.path === ENTRY && wave2.wave === 2 &&
          out.mobile.hud.startLabel === "戰鬥中",
        out.mobile);
    });
  } finally {
    ctx.off("request", onRequest);
    ctx.off("response", onResponse);
    await page.setViewportSize({ width: 540, height: 900 }).catch(() => {});
  }

  const legacy = games.filter((g) => g.path.startsWith("/games/shenmaSanguo/"));
  const other = games.filter((g) => !g.path.startsWith(H.GAME_DIR));
  out.requests = { total: games.length, sw: games.filter((g) => g.sw).length, legacy: legacy.slice(0, 5), other: other.slice(0, 5) };
  run.check("RE-6 全程遊戲相關的請求（頁面與 Service Worker）都在網站入口的遊戲目錄，沒有任何舊正式版目錄的請求",
    games.length > 0 && legacy.length === 0 && other.length === 0, out.requests);
  return run.finish({ out });
}
