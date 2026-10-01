async (page) => {
  // 後端讀取的自動重試（瀏覽器，真 Godot 產物、mock 後端）：
  // - 只有唯讀的讀取（存檔、遊戲設定）在暫時失敗時自動重試（1 秒、2 秒後，最多 2 次）；建檔與保存只送一次
  // - 玩家正在等的讀取：回應超過 8 秒顯示「回應較慢」、重試時顯示「正在自動重試（第 n 次）」；背景讀取不顯示
  // - 平台的錯誤頁（HTML 404）不是「找不到存檔」：重試用完顯示讀取失敗、不建檔
  // - RR-1～RR-11（見各段的 check 名稱）；主頁與獨立戰鬥頁都看，桌面 1280×800 與 390×844 各截圖
  // 平台錯誤頁用這支腳本自己的 fetch 包裝（localStorage.__shenma_rr_html = {action: 剩餘次數}）回 HTML 404，
  // 其他請求照常交給 harness 的頁面內 mock；全部虛構金鑰 test_rr_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const MAIN = H.BASE + "/shenmaSanguo";
  const profile = (nickname) => ({
    nickname, level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter1_7",
    heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
  });

  // 平台錯誤頁：在 harness 的 mock 外面再包一層（只在這支腳本設定旗標時作用）
  if (!ctx.__rrHtmlInstalled) {
    ctx.__rrHtmlInstalled = true;
    await ctx.addInitScript(() => {
      if (window.top !== window || window.__RR_HTML__) return;
      window.__RR_HTML__ = true;
      const inner = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : (input && input.url) || String(input);
        if (url.startsWith("https://script.google.com/")) {
          let body = {};
          try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
          let left = {};
          try { left = JSON.parse(localStorage.getItem("__shenma_rr_html") || "{}"); } catch { left = {}; }
          if (left[body.action] > 0) {
            left[body.action] -= 1;
            localStorage.setItem("__shenma_rr_html", JSON.stringify(left));
            const log = JSON.parse(localStorage.getItem("__shenma_rr_html_log") || "[]");
            log.push({ t: Date.now(), action: body.action });
            localStorage.setItem("__shenma_rr_html_log", JSON.stringify(log));
            await new Promise((r) => setTimeout(r, 100));
            return new Response("<!DOCTYPE html><html><body>404. That’s an error.</body></html>", { status: 404, headers: { "Content-Type": "text/html" } });
          }
        }
        return inner(input, init);
      };
    });
  }

  // ── 輔助 ──
  const setLocal = (obj) => page.evaluate((o) => {
    for (const [k, v] of Object.entries(o)) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    }
  }, obj);
  const since = async (t0) => (await H.gasLog(page)).filter((e) => e.t >= t0);
  const htmlSince = (t0) => page.evaluate((t0) => JSON.parse(localStorage.getItem("__shenma_rr_html_log") || "[]").filter((e) => e.t >= t0), t0);
  const outcomes = (log, action) => log.filter((e) => e.action === action).map((e) => (e.status === "network-error" ? "net" : String(e.status)));
  const notice = () => page.evaluate(() => {
    const n = document.querySelector('[data-testid="read-wait-notice"]');
    return n ? { text: n.innerText.trim(), retry: Number(n.getAttribute("data-read-retry")), live: n.parentElement?.getAttribute("role") === "status" } : null;
  });
  // 等待提示出現並記下內容（提示可能很短：每 50 毫秒看一次）
  const waitNotice = async (pred, timeout = 20000) => {
    const end = Date.now() + timeout;
    for (;;) {
      const n = await notice();
      if (n && pred(n)) return n;
      if (Date.now() > end) return null;
      await H.sleep(50);
    }
  };
  const panelText = () => page.locator('[data-testid="player-load-error"]').innerText().catch(() => null);
  const configBanner = () => page.locator('[data-testid="config-error-notice"]').innerText().catch(() => null);
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  // 先開一次主頁（沒有金鑰），讓第一次載入的初始化與可能的重新載入先完成，之後的計數才準確
  const prime = async () => {
    await H.resetOrigin(page);
    await page.goto(MAIN);
    await page.getByPlaceholder("例：eric_sanguo_2026").waitFor({ timeout: 90000 });
    await H.sleep(500);
  };
  const seed = (key, p = profile("重試玩家")) => setLocal({ __shenma_mock_gas_db: { profiles: { [key]: p }, battle_logs: [] }, shenma_player_key: key });

  // ── RR-1 登入時讀取存檔連線失敗一次：自動重試、顯示重試中，載入既有存檔 ──
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await prime();
    await seed("test_rr_1", profile("既有玩家"));
    await setLocal({ __shenma_mock_netfail: { get_profile: 1 } });
    const t0 = Date.now();
    await page.reload();
    const n = await waitNotice((x) => x.retry === 1);
    const shot = n ? await H.shot(page, "read-retry-notice-390") : null;
    await H.waitHud(page);
    const log = await since(t0);
    const sess = await page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
    await H.sleep(300);
    run.check("RR-1 登入時 get_profile 連線失敗一次：畫面說明「正在自動重試（第 1 次）」（status 區域），重試後載入既有存檔；沒有錯誤面板、沒有建檔",
      !!n && /連線不穩定，正在自動重試（第 1 次，最多 2 次）/.test(n.text) && n.live &&
        JSON.stringify(outcomes(log, "get_profile")) === '["net","200"]' && !log.some((e) => e.action === "create_profile") &&
        sess?.nickname === "既有玩家" && (await panelText()) === null && (await notice()) === null && !(await overflow()),
      { notice: n, gets: outcomes(log, "get_profile"), nickname: sess?.nickname, shot });
  } catch (e) {
    run.check("RR-1 執行時發生例外", false, String(e).slice(0, 300));
  }

  // ── RR-2 三次都連線失敗：約 3 秒後錯誤面板（NETWORK_ERROR），不建檔；按「重試」成功 ──
  try {
    await prime();
    await seed("test_rr_2");
    await setLocal({ __shenma_mock_netfail: { get_profile: 3 } });
    const t0 = Date.now();
    await page.reload();
    const panel = page.locator('[data-testid="player-load-error"]');
    await panel.waitFor({ timeout: 60000 });
    const elapsed = Date.now() - t0;
    const text = await panel.innerText();
    const log = await since(t0);
    const shot = await H.shot(page, "read-retry-exhausted-390");
    run.check("RR-2 三次都連線失敗：重試用完（約 3 秒後）才顯示錯誤面板「無法連線到伺服器」與 NETWORK_ERROR、重試與更換金鑰；get_profile 剛好 3 次、沒有建檔",
      /無法連線到伺服器/.test(text) && /NETWORK_ERROR/.test(text) && /重試/.test(text) && /更換金鑰/.test(text) &&
        JSON.stringify(outcomes(log, "get_profile")) === '["net","net","net"]' && !log.some((e) => e.action === "create_profile") && elapsed >= 2900,
      { elapsed, gets: outcomes(log, "get_profile"), text: text.replace(/\s+/g, " ").slice(0, 160), shot });
    const t1 = Date.now();
    await panel.getByRole("button", { name: "重試" }).click();
    await H.waitHud(page);
    const log1 = await since(t1);
    run.check("RR-2b 按「重試」：讀取一次就成功、進入戰場，仍沒有建檔",
      JSON.stringify(outcomes(log1, "get_profile")) === '["200"]' && !log1.some((e) => e.action === "create_profile"),
      { gets: outcomes(log1, "get_profile") });
  } catch (e) {
    run.check("RR-2 執行時發生例外", false, String(e).slice(0, 300));
  }

  // ── RR-3／RR-4 平台的錯誤頁（HTML 404）：一次 → 重試後載入；三次 → BAD_RESPONSE，不當成找不到存檔 ──
  try {
    await prime();
    await seed("test_rr_3", profile("錯誤頁玩家"));
    await setLocal({ __shenma_rr_html: { get_profile: 1 } });
    const t0 = Date.now();
    await page.reload();
    const n = await waitNotice((x) => x.retry === 1);
    await H.waitHud(page);
    const log = await since(t0);
    const html = await htmlSince(t0);
    run.check("RR-3 get_profile 收到一次平台的 HTML 404 錯誤頁：當成暫時的失敗、顯示重試中，重試後載入既有存檔、不建檔",
      !!n && html.length === 1 && JSON.stringify(outcomes(log, "get_profile")) === '["200"]' && !log.some((e) => e.action === "create_profile"),
      { notice: n, html: html.length, gets: outcomes(log, "get_profile") });

    await prime();
    await setLocal({ shenma_player_key: "test_rr_4", __shenma_rr_html: { get_profile: 3 } });
    const t1 = Date.now();
    await page.reload();
    const panel = page.locator('[data-testid="player-load-error"]');
    await panel.waitFor({ timeout: 60000 });
    const text = await panel.innerText();
    const log1 = await since(t1);
    const html1 = await htmlSince(t1);
    const shot = await H.shot(page, "read-retry-html404-390");
    run.check("RR-4 三次都是 HTML 404 錯誤頁（這組金鑰其實沒有存檔）：顯示「伺服器回應異常」與 BAD_RESPONSE，不建檔、不顯示部署網址或 HTML 內容",
      /伺服器回應異常/.test(text) && /BAD_RESPONSE/.test(text) && !/script\.google|404\. That|<html/i.test(text) &&
        html1.length === 3 && !log1.some((e) => e.action === "create_profile" || e.action === "get_profile"),
      { text: text.replace(/\s+/g, " ").slice(0, 160), html: html1.length, log: log1.map((e) => e.action), shot });
  } catch (e) {
    run.check("RR-3／4 執行時發生例外", false, String(e).slice(0, 300));
  }

  // ── RR-5／RR-6 遊戲設定的讀取（主頁）──
  try {
    await prime();
    await seed("test_rr_5");
    await setLocal({ __shenma_mock_netfail: { get_all_maps: 1 } });
    const t0 = Date.now();
    await page.reload();
    const n = await waitNotice((x) => x.retry === 1);
    await H.waitHud(page);
    const log = await since(t0);
    run.check("RR-5 遊戲設定的 get_all_maps 連線失敗一次：顯示重試中，重試後進入戰場、沒有設定錯誤；其他兩支各只讀一次",
      !!n && JSON.stringify(outcomes(log, "get_all_maps")) === '["net","200"]' && outcomes(log, "get_heroes_config").length === 1 &&
        outcomes(log, "get_enemies_config").length === 1 && (await configBanner()) === null,
      { notice: n, maps: outcomes(log, "get_all_maps") });

    await page.setViewportSize({ width: 1280, height: 800 });
    await prime();
    await seed("test_rr_6");
    await setLocal({ __shenma_mock_netfail: { get_heroes_config: 3 } });
    const t1 = Date.now();
    await page.reload();
    await page.locator('[data-testid="config-error-notice"]').waitFor({ timeout: 60000 });
    const text = await configBanner();
    const log1 = await since(t1);
    const shot = await H.shot(page, "read-retry-config-failed-desktop");
    run.check("RR-6 武將設定三次都連線失敗：上方顯示「遊戲設定載入失敗」與「無法連線到伺服器」（代碼 NETWORK_ERROR），不顯示原始錯誤訊息；get_heroes_config 剛好 3 次",
      /遊戲設定載入失敗/.test(text) && /無法連線到伺服器/.test(text) && /NETWORK_ERROR/.test(text) && !/Failed to fetch|TypeError/.test(text) &&
        JSON.stringify(outcomes(log1, "get_heroes_config")) === '["net","net","net"]',
      { text, heroes: outcomes(log1, "get_heroes_config"), shot });
    const t2 = Date.now();
    await page.locator('[data-testid="config-error-notice"]').getByRole("button", { name: "重試" }).click();
    await H.waitHud(page);
    await page.waitForFunction(() => !document.querySelector('[data-testid="config-error-notice"]'), null, { timeout: 30000 });
    const log2 = await since(t2);
    run.check("RR-6b 按上方的「重試」：設定讀取成功、提示消失",
      outcomes(log2, "get_heroes_config").every((x) => x === "200") && outcomes(log2, "get_heroes_config").length >= 1, { heroes: outcomes(log2, "get_heroes_config") });
  } catch (e) {
    run.check("RR-5／6 執行時發生例外", false, String(e).slice(0, 300));
  }

  // ── RR-7 回應較慢：等超過 8 秒顯示「回應較慢」，回應後消失 ──
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prime();
    await seed("test_rr_7", profile("慢回應玩家"));
    await setLocal({ __shenma_mock_hold: ["get_profile"] });
    await page.reload();
    await page.waitForFunction(() => window.__shenmaMock && window.__shenmaMock.pending("get_profile").length === 1, null, { timeout: 60000 });
    await H.sleep(6000);
    const early = await notice();
    const n = await waitNotice((x) => /回應較慢/.test(x.text), 6000);
    const shot = n ? await H.shot(page, "read-retry-slow-desktop") : null;
    await setLocal({ __shenma_mock_hold: null });
    await page.evaluate(() => { window.__shenmaMock.unhold("get_profile"); window.__shenmaMock.release("get_profile"); });
    await H.waitHud(page);
    await H.sleep(300);
    run.check("RR-7 讀取 8 秒內沒有提示；超過 8 秒顯示「伺服器回應較慢，仍在讀取中」，回應後提示消失並載入",
      early === null && !!n && n.retry === 0 && (await notice()) === null,
      { early, notice: n, shot });
  } catch (e) {
    run.check("RR-7 執行時發生例外", false, String(e).slice(0, 300));
  }

  // ── RR-8 讀取 30 秒沒有回應：逾時後自動重試（舊回應不採用），重試成功後載入 ──
  try {
    await prime();
    await seed("test_rr_8", profile("逾時玩家"));
    await setLocal({ __shenma_mock_hold: ["get_profile"] });
    const t0 = Date.now();
    await page.reload();
    await page.waitForFunction(() => window.__shenmaMock && window.__shenmaMock.pending("get_profile").length === 1, null, { timeout: 60000 });
    const firstAt = Date.now();
    await page.waitForFunction(() => window.__shenmaMock.pending("get_profile").length === 2, null, { timeout: 45000, polling: 200 });
    const gap = Date.now() - firstAt;
    const n = await notice();
    // 舊的（已逾時）先回應：不採用，畫面仍在等第二次
    await page.evaluate(() => window.__shenmaMock.release("get_profile"));
    await H.sleep(800);
    const stillWaiting = (await H.hud(page)).loader;
    await setLocal({ __shenma_mock_hold: null });
    await page.evaluate(() => { window.__shenmaMock.unhold("get_profile"); window.__shenmaMock.release("get_profile"); });
    await H.waitHud(page);
    const log = await since(t0);
    run.check("RR-8 get_profile 30 秒沒有回應：約 31 秒後送出第二次、提示「正在自動重試（第 1 次）」；逾時的舊回應不採用，第二次回應後載入",
      gap >= 30000 && gap < 40000 && n?.retry === 1 && stillWaiting && outcomes(log, "get_profile").length === 2 && !log.some((e) => e.action === "create_profile"),
      { gap, notice: n, stillWaiting, gets: outcomes(log, "get_profile") });
  } catch (e) {
    run.check("RR-8 執行時發生例外", false, String(e).slice(0, 300));
  }

  // ── RR-9 寫入只送一次：保存與建檔連線失敗都不會被自動重送 ──
  try {
    await page.setViewportSize({ width: 540, height: 900 });
    await prime();
    await seed("test_rr_9");
    await page.goto(MAIN + "/team");
    await page.waitForFunction(() => {
      const s = JSON.parse(sessionStorage.getItem("shenma_player_state") || "null");
      return s && s.key === "test_rr_9" && s.rev === s.syncedRev;
    }, null, { timeout: 90000 });
    await H.sleep(800);
    await page.locator('div[class*="poolCard"]', { hasText: "黃忠" }).first().click();
    await H.sleep(200);
    await page.getByRole("button", { name: "儲存隊伍" }).click();
    await page.waitForSelector("text=隊伍已儲存", { timeout: 10000 });
    await setLocal({ __shenma_mock_netfail: { save_profile: 1 } });
    const t0 = Date.now();
    await page.goto(MAIN + "/settings"); // 換頁後立刻補送未同步的修改
    await H.sleep(8000);
    const log = await since(t0);
    const sess = await page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
    run.check("RR-9 整份保存連線失敗：8 秒內 save_profile 只有那一次（不被讀取的重試機制重送），本機的隊伍修改保留、仍未同步",
      JSON.stringify(outcomes(log, "save_profile")) === '["net"]' && sess && sess.rev !== sess.syncedRev &&
        (sess.team || []).some((t) => t.hero_id === "huang_zhong"),
      { saves: outcomes(log, "save_profile"), team: (sess?.team || []).map((t) => t.hero_id) });

    await prime();
    await setLocal({ __shenma_mock_netfail: { create_profile: 1 } });
    const t1 = Date.now();
    await page.getByPlaceholder("例：eric_sanguo_2026").fill("test_rr_9_new");
    await page.getByRole("button", { name: "進入遊戲" }).click();
    await page.waitForSelector(".alert-danger", { timeout: 30000 });
    const errText = await page.locator(".alert-danger").first().innerText();
    await H.sleep(6000);
    const log1 = await since(t1);
    run.check("RR-9b 建檔連線失敗：登入畫面顯示失敗；create_profile 只送一次、get_profile（找不到存檔）也只一次，6 秒內都沒有重送",
      /無法連線到伺服器/.test(errText) && JSON.stringify(outcomes(log1, "create_profile")) === '["net"]' &&
        JSON.stringify(outcomes(log1, "get_profile")) === '["404"]',
      { errText, creates: outcomes(log1, "create_profile"), gets: outcomes(log1, "get_profile") });
  } catch (e) {
    run.check("RR-9 執行時發生例外", false, String(e).slice(0, 300));
  }

  // ── RR-10 背景讀取（重新整理後從 session 恢復）：失敗時靜默重試，不顯示提示 ──
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prime();
    await seed("test_rr_10", profile("背景玩家"));
    await page.reload();
    await H.waitHud(page);
    await H.sleep(1000);
    await setLocal({ __shenma_mock_netfail: { get_profile: 1 } });
    const t0 = Date.now();
    await page.reload();
    let seen = null;
    const end = Date.now() + 4000;
    while (Date.now() < end) {
      seen = seen || (await notice());
      await H.sleep(50);
    }
    await H.waitHud(page);
    const log = await since(t0);
    run.check("RR-10 有 session 時的背景讀取連線失敗一次：自動重試（get_profile 失敗、成功各一次），畫面不顯示等待提示",
      seen === null && JSON.stringify(outcomes(log, "get_profile")) === '["net","200"]',
      { seen, gets: outcomes(log, "get_profile") });
  } catch (e) {
    run.check("RR-10 執行時發生例外", false, String(e).slice(0, 300));
  }

  // ── RR-11 獨立戰鬥頁：遊戲設定讀取失敗一次 → 顯示重試中，重試後進入戰場 ──
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await prime();
    await seed("test_rr_11");
    await setLocal({ __shenma_mock_netfail: { get_enemies_config: 1 } });
    const t0 = Date.now();
    const idx = await H.bridgeLen(page);
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_1");
    const n = await waitNotice((x) => x.retry === 1, 30000);
    const shot = n ? await H.shot(page, "read-retry-battle-page-390") : null;
    await H.waitBridge(page, 0, { type: "update_stats", game_state: 1 }, 120000).catch(() => null);
    const started = await page.locator("button", { hasText: /^迎戰$/ }).first().isVisible().catch(() => false);
    const log = await since(t0);
    run.check("RR-11 獨立戰鬥頁：get_enemies_config 連線失敗一次 → 顯示重試中，重試後載入戰場（有「迎戰」）、沒有設定錯誤",
      !!n && started && JSON.stringify(outcomes(log, "get_enemies_config")) === '["net","200"]' && (await configBanner()) === null && !(await overflow()),
      { notice: n, started, enemies: outcomes(log, "get_enemies_config"), idx, shot });
  } catch (e) {
    run.check("RR-11 執行時發生例外", false, String(e).slice(0, 300));
  }

  await setLocal({ __shenma_mock_netfail: null, __shenma_rr_html: null, __shenma_mock_hold: null }).catch(() => {});
  return run.finish(out);
}
