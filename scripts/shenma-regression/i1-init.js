async (page) => {
  // I1：首次登入與初始化情境，全程不重新整理頁面
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const results = {};
  // 每支靜態設定 API 恰好 1 次（沒有重複載入，也沒有請求風暴）
  const configOnce = (c) => c.get_heroes_config === 1 && c.get_enemies_config === 1 && c.get_all_maps === 1;
  const prepOk = (p) => p.wave === 0 && p.game_state === 1 && p.hp === 20;
  const hudOk = (h) => h.configError === false && h.loader === false && h.startLabel === "迎戰" && h.startDisabled === false;

  // 在頁面上留標記：若中途發生重新整理，標記會消失
  const mark = () => page.evaluate(() => { window.__noReloadMark = Date.now(); });
  const stillSamePage = () => page.evaluate(() => typeof window.__noReloadMark === "number");
  const enterKey = async (key) => {
    await page.getByPlaceholder("例：eric_sanguo_2026").fill(key);
    await page.getByRole("button", { name: "進入遊戲" }).click();
  };
  const waitGodotPrep = async (idx) => H.waitBridge(page, idx, { type: "update_stats", game_state: 1, wave: 0 });
  const delta = async (before) => {
    const all = await H.gasLog(page);
    return H.countActions(all.slice(before));
  };

  // ── (a) 全新 storage → 新金鑰 → 建檔 → 設定 → Godot 備戰 ──
  {
    await H.resetOrigin(page);
    await page.goto(H.BASE + "/shenmaSanguo");
    await page.getByPlaceholder("例：eric_sanguo_2026").waitFor({ timeout: 60000 });
    await mark();
    const idx = await H.bridgeLen(page);
    const before = (await H.gasLog(page)).length;
    const start = Date.now();
    await enterKey("mock_r2_new");
    await H.waitHud(page, 120000);
    const stats = await waitGodotPrep(idx);
    results.a_fresh_new_key = {
      elapsedMs: Date.now() - start,
      noReload: await stillSamePage(),
      gasCalls: await delta(before),
      godotPrep: { wave: stats.wave, game_state: stats.game_state, hp: stats.hp },
      hud: await H.hud(page),
      shot: await H.shot(page, "i1-a-fresh-new-key"),
    };
    const r = results.a_fresh_new_key;
    run.check("I1-a 全新玩家：不重新整理就進入 Godot 備戰", r.noReload && prepOk(r.godotPrep) && hudOk(r.hud), r);
    run.check("I1-a 全新玩家：建檔 1 次、get_profile 不超過 2 次、設定各 1 次",
      r.gasCalls.create_profile === 1 && r.gasCalls.get_profile >= 1 && r.gasCalls.get_profile <= 2 && configOnce(r.gasCalls), r.gasCalls);
  }

  // ── (b) 後端已有此金鑰，但本機沒有任何快取 ──
  {
    await H.resetOrigin(page, { keepMockDb: true });
    await page.goto(H.BASE + "/shenmaSanguo");
    await page.getByPlaceholder("例：eric_sanguo_2026").waitFor({ timeout: 60000 });
    await mark();
    const idx = await H.bridgeLen(page);
    const before = (await H.gasLog(page)).length;
    const start = Date.now();
    await enterKey("mock_r2_new");
    await H.waitHud(page, 120000);
    const stats = await waitGodotPrep(idx);
    results.b_existing_key_no_cache = {
      elapsedMs: Date.now() - start,
      noReload: await stillSamePage(),
      gasCalls: await delta(before),
      godotPrep: { wave: stats.wave, game_state: stats.game_state, hp: stats.hp },
      hud: await H.hud(page),
      shot: await H.shot(page, "i1-b-existing-key-no-cache"),
    };
    const r = results.b_existing_key_no_cache;
    run.check("I1-b 後端已有金鑰：不重新整理就進入 Godot 備戰", r.noReload && prepOk(r.godotPrep) && hudOk(r.hud), r);
    run.check("I1-b 後端已有金鑰：沒有建檔、get_profile 1 次、設定各 1 次",
      !r.gasCalls.create_profile && r.gasCalls.get_profile === 1 && configOnce(r.gasCalls), r.gasCalls);
  }

  // ── (c) 已有 session（同分頁再次進入），並移除靜態設定快取強制重新載入 ──
  {
    await page.evaluate(() => {
      localStorage.removeItem("shenma_static_config");
      localStorage.removeItem("shenma_static_ts");
    });
    const before = (await H.gasLog(page)).length;
    const hasSession = await page.evaluate(() => !!sessionStorage.getItem("shenma_player_state"));
    const start = Date.now();
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page, 120000);
    const stats = await waitGodotPrep(0);
    results.c_existing_session = {
      hadSessionBeforeLoad: hasSession,
      elapsedMs: Date.now() - start,
      gasCalls: await delta(before),
      godotPrep: { wave: stats.wave, game_state: stats.game_state, hp: stats.hp },
      hud: await H.hud(page),
      shot: await H.shot(page, "i1-c-existing-session"),
    };
    const r = results.c_existing_session;
    run.check("I1-c 已有 session：進入 Godot 備戰", r.hadSessionBeforeLoad && prepOk(r.godotPrep) && hudOk(r.hud), r);
    run.check("I1-c 已有 session：沒有建檔、get_profile 1 次（背景刷新）、設定各 1 次",
      !r.gasCalls.create_profile && r.gasCalls.get_profile === 1 && configOnce(r.gasCalls), r.gasCalls);
  }

  // ── (d) 靜態設定載入失敗 → 不自動重打 → 按「重試」後進入備戰 ──
  {
    await H.resetOrigin(page);
    await page.evaluate(() => localStorage.setItem("__shenma_mock_fail", JSON.stringify({ get_all_maps: 1000 })));
    await page.goto(H.BASE + "/shenmaSanguo");
    await page.getByPlaceholder("例：eric_sanguo_2026").waitFor({ timeout: 60000 });
    await mark();
    const idx = await H.bridgeLen(page);
    const before = (await H.gasLog(page)).length;
    await enterKey("mock_r2_retry");
    await page.waitForSelector("text=遊戲設定載入失敗", { timeout: 60000 });
    const afterFail = await delta(before);
    const shotFail = await H.shot(page, "i1-d-config-failed");
    await H.sleep(15000); // 觀察 15 秒內是否自動重打
    const after15s = await delta(before);
    await page.evaluate(() => localStorage.removeItem("__shenma_mock_fail"));
    const beforeRetry = (await H.gasLog(page)).length;
    const start = Date.now();
    await page.getByRole("button", { name: "重試" }).click();
    await H.waitHud(page, 120000);
    const stats = await waitGodotPrep(idx);
    results.d_config_fail_then_retry = {
      gasCallsUntilError: afterFail,
      gasCallsAfterWaiting15s: after15s,
      noAutoRetry: JSON.stringify(afterFail) === JSON.stringify(after15s),
      retryElapsedMs: Date.now() - start,
      gasCallsFromRetry: await delta(beforeRetry),
      noReload: await stillSamePage(),
      godotPrep: { wave: stats.wave, game_state: stats.game_state, hp: stats.hp },
      hud: await H.hud(page),
      shots: [shotFail, await H.shot(page, "i1-d-after-retry")],
    };
    const r = results.d_config_fail_then_retry;
    run.check("I1-d 設定失敗：15 秒內沒有自動重打", r.noAutoRetry, { untilError: r.gasCallsUntilError, after15s: r.gasCallsAfterWaiting15s });
    run.check("I1-d 按重試：設定各 1 次後進入 Godot 備戰、全程不重新整理",
      configOnce(r.gasCallsFromRetry) && !r.gasCallsFromRetry.create_profile && r.noReload && prepOk(r.godotPrep) && hudOk(r.hud), r);
  }

  const gasModes = [...new Set((await H.gasLog(page)).map((e) => e.mode))];
  run.check("所有 GAS 呼叫都由 mock 回應", gasModes.length === 1 && gasModes[0] === "mock", gasModes);
  return run.finish({ results });
}
