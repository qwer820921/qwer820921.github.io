async (page) => {
  // 背景音樂不在啟動必載的資料包裡（瀏覽器，真 Godot 產物、mock 後端，主頁）
  // - BG-1 遊戲就緒（game_ready）之前沒有任何背景音樂的請求（不在引擎啟動的關鍵路徑上）；
  //   遊戲收到關卡資料、套用音效設定（音效開著）之後才下載
  // - BG-2 只下載一次（1 609 183 bytes）；按掉進場畫面（玩家點擊、AudioContext 解鎖）後播放
  // - BG-3 換關後再按掉進場畫面：用已下載的播放，不再下載
  // - BG-4 音效關閉：不下載、不播放
  // - BG-5 下載失敗（404）：遊戲照常（可以迎戰），沒有自動重試；再要播放（按掉進場畫面）才再試，最多 2 次，之後換關也不再下載
  // 計次用遊戲自己的紀錄（[SFXManager] BGM download start／downloaded／failed／playing，這支腳本自己監聽主控台）與遊戲頁面送出的請求；
  // 全部 mock、虛構金鑰 test_bgm_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin({ expectedConsole: [/Failed to load resource: the server responded with a status of 404/] });
  const out = {};
  const KEY = "test_bgm_a";
  const MAIN = H.BASE + "/shenmaSanguo";
  const profile = {
    nickname: "音樂玩家", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter1_4",
    heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }],
  };
  // 遊戲頁面送出的背景音樂請求（Service Worker 自己送出的另外標記，不算遊戲的下載次數）
  const requests = [];
  const onRequest = (r) => {
    if (/\/bgm_battle\.ogg/.test(r.url())) requests.push({ t: Date.now(), sw: !!r.serviceWorker() });
  };
  const sfx = [];
  const onConsole = (m) => {
    const text = m.text();
    if (/^\[SFXManager\] (BGM|bgm)/.test(text)) sfx.push({ t: Date.now(), text: text.slice(0, 120) });
  };
  ctx.on("request", onRequest);
  page.on("console", onConsole);
  const since = (t0, re) => sfx.filter((c) => c.t >= t0 && re.test(c.text));
  const starts = (t0) => since(t0, /BGM download start/).length;
  const downloaded = (t0) => since(t0, /BGM downloaded: \d+ bytes/).map((c) => c.text);
  const failed = (t0) => since(t0, /BGM download failed/).length;
  const playing = (t0) => since(t0, /BGM playing/).length;
  const gameRequests = (t0) => requests.filter((r) => r.t >= t0 && !r.sw);
  const until = async (pred, ms = 15000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (await pred()) return true;
      await H.sleep(200);
    }
    return !!(await pred());
  };
  // 開主頁到備戰；回傳 game_ready 的時間（Date.now() 的刻度）
  const open = async (sound) => {
    await H.resetOrigin(page);
    await page.evaluate(({ key, profile, sound }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [key]: profile }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", key);
      localStorage.setItem("shenma_sound_settings", JSON.stringify({ sfxEnabled: sound, sfxPolyphony: "single" }));
    }, { key: KEY, profile, sound });
    await page.goto(MAIN);
    await H.waitHud(page);
    await H.waitBridge(page, 0, { type: "update_stats", game_state: 1 }, 120000);
    await H.sleep(800);
    return page.evaluate(() => {
      const m = (window.__bridgeLog || []).find((x) => x.type === "game_ready");
      return m ? performance.timeOrigin + m.__t : null;
    });
  };

  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    // ── BG-1／BG-2 音效開著 ──
    const t1 = Date.now();
    const ready1 = await open(true);
    await until(async () => downloaded(t1).length > 0);
    const before = requests.filter((r) => r.t >= t1 && ready1 !== null && r.t < ready1);
    const r1 = { ready: ready1 ? Math.round(ready1 - t1) : null, firstRequest: gameRequests(t1)[0] ? gameRequests(t1)[0].t - t1 : null, before: before.length };
    run.check("BG-1 game_ready 之前沒有背景音樂的請求（不在引擎啟動的關鍵路徑上）；收到關卡資料、套用音效設定後才開始下載",
      ready1 !== null && before.length === 0 && gameRequests(t1).length >= 1 && gameRequests(t1)[0].t >= ready1, r1);

    const t2 = Date.now();
    await H.dismissSplash(page);
    await until(async () => playing(t2) > 0, 8000);
    const r2 = { starts: starts(t1), downloaded: downloaded(t1), requests: gameRequests(t1).length, playingAfterSplash: playing(t2) };
    run.check("BG-2 只下載一次（遊戲送出 1 個請求、1 609 183 bytes）；按掉進場畫面（玩家點擊）後播放",
      r2.starts === 1 && r2.downloaded.length === 1 && /1609183 bytes/.test(r2.downloaded[0]) && r2.requests === 1 && r2.playingAfterSplash >= 1, r2);

    // ── BG-3 換關：用已下載的 ──
    const t3 = Date.now();
    await H.selectStage(page, "Mock B 對照關");
    await H.sleep(800);
    await H.dismissSplash(page);
    await until(async () => playing(t3) > 0, 8000);
    const r3 = { starts: starts(t3), playing: playing(t3), requests: gameRequests(t3).length };
    run.check("BG-3 換關後再按掉進場畫面：用已下載的背景音樂播放，不再下載（沒有新的請求）", r3.starts === 0 && r3.playing >= 1 && r3.requests === 0, r3);

    // ── BG-4 音效關閉 ──
    const t4 = Date.now();
    await open(false);
    await H.dismissSplash(page);
    await H.sleep(3000);
    const r4 = { starts: starts(t4), requests: requests.filter((r) => r.t >= t4).length, playing: playing(t4) };
    run.check("BG-4 音效關閉：按掉進場畫面也不下載、不播放", r4.starts === 0 && r4.requests === 0 && r4.playing === 0, r4);

    // ── BG-5 下載失敗（404）──
    await ctx.route("**/bgm_battle.ogg", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }));
    const t5 = Date.now();
    await open(true);
    await until(async () => failed(t5) > 0);
    await H.dismissSplash(page);
    await H.sleep(2500);
    const first = { starts: starts(t5), failed: failed(t5) };
    const idx5 = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    const fought = await H.waitBridge(page, idx5, { type: "update_stats", wave: 1 }, 30000).then(() => true).catch(() => false);
    const t5b = Date.now();
    await H.selectStage(page, "Mock B 對照關");
    await H.sleep(800);
    await H.dismissSplash(page);
    await H.sleep(3000);
    const t5c = Date.now();
    await H.selectStage(page, "Mock A 慢速出兵");
    await H.sleep(800);
    await H.dismissSplash(page);
    await H.sleep(3000);
    const r5 = { first, fought, second: { starts: starts(t5b), failed: failed(t5b) }, third: { starts: starts(t5c), requests: gameRequests(t5c).length }, playing: playing(t5) };
    await H.shot(page, "bgm-load-404");
    run.check("BG-5 下載失敗（404）：遊戲照常（可以迎戰），沒有自動重試；收到關卡資料時第 1 次、按掉進場畫面（再要播放）時第 2 次，之後換關兩次都不再下載；沒有播放",
      first.starts === 2 && first.failed === 2 && fought && r5.second.starts === 0 && r5.third.starts === 0 && r5.third.requests === 0 && r5.playing === 0, r5);
    await ctx.unroute("**/bgm_battle.ogg");
  } finally {
    ctx.off("request", onRequest);
    page.off("console", onConsole);
  }
  out.requests = requests.length;
  return run.finish(out);
}
