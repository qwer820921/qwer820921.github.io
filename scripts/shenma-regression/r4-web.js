async (page) => {
  // R4（瀏覽器）：I7 登入失敗可見且可恢復、切換帳號保護、I4 重新整理後恢復同步、手動同步、戰鬥／升級 smoke
  // 回應順序一律用 mock 的 hold／release 或失敗注入控制；斷言 mock 後端實際收到的資料，不只看 UI
  // 全部使用虛構金鑰 test_r4_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};

  // ── 共用小工具 ──
  const KEY_INPUT = 'input[placeholder="例：eric_sanguo_2026"]';
  const log = () => H.gasLog(page);
  const since = async (t, action, key) =>
    (await log()).filter((e) => e.t >= t && (!action || e.action === action) && (!key || e.key === key));
  const waitLog = (pred, sinceT, timeout = 60000) =>
    page.waitForFunction(
      ({ src, sinceT }) => {
        const f = new Function("e", "return (" + src + ")(e)");
        return JSON.parse(localStorage.getItem("__shenma_mock_gas_log") || "[]").some((e) => e.t >= sinceT && f(e));
      },
      { src: pred.toString(), sinceT },
      { timeout, polling: 100 }
    );
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const session = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
  const lsKey = () => page.evaluate(() => localStorage.getItem("shenma_player_key"));
  const setMock = (k, v) => page.evaluate(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v))), [k, v]);
  const syncStatus = () => page.evaluate(() => (document.querySelector("[data-sync-status]") || {}).getAttribute?.("data-sync-status") ?? null);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const teamOf = (p) => (p && p.team ? p.team.map((t) => t.hero_id) : null);
  const profile = (nickname, team = ["guan_yu", "zhao_yun"]) => ({
    nickname, level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_7", heroes: [],
    team: team.map((hero_id, i) => ({ hero_id, slot: i + 1 })),
  });
  // 用隊伍 Modal 改隊伍（產生一次本機修改）：兩人時移除趙雲；一人時換成另一位
  // （mock 武將各 8 點、等級 1 容量 11，兩人上陣會超過容量而無法儲存）
  const changeTeam = async () => {
    const team = teamOf(await session()) || [];
    const clicks = team.length > 1 ? ["趙雲"] : team[0] === "guan_yu" ? ["關羽", "趙雲"] : ["趙雲", "關羽"];
    await H.clickButton(page, "隊伍");
    await page.waitForSelector("text=儲存隊伍");
    for (const name of clicks) await page.locator('div[class*="modalPanel"]').getByText(name).first().click();
    await H.clickButton(page, "儲存隊伍");
    await H.clickButton(page, "關閉");
  };
  const openPlayerInfo = async () => {
    await page.locator('button[class*="hudAvatar"]').click();
    await page.waitForSelector("text=玩家資訊");
  };
  const closeModal = async () => {
    await page.locator('button[class*="modalClose"]').first().click();
  };
  const alertText = () => page.locator('div[class*="modalPanel"] .alert').first().innerText();
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r4-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      // 關掉可能還開著的 Modal，避免影響下一段
      try {
        for (const b of await page.locator('button[class*="modalClose"]').all()) await b.click({ timeout: 2000 });
      } catch { /* 沒有 Modal 可關 */ }
    }
  };

  // ── A. I7：有金鑰、無 session，get_profile 失敗 → 錯誤可見，可重試 ──
  await section("A", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", { profiles: { test_r4_i7: profile("既有玩家") }, battle_logs: [] });
    await page.evaluate(() => localStorage.setItem("shenma_player_key", "test_r4_i7"));
    // 失敗持續到錯誤面板出現為止：coi-serviceworker 首次註冊時會自動重新載入一次頁面
    await setMock("__shenma_mock_netfail", { get_profile: 1000 });
    const t0 = Date.now();
    await page.goto(H.BASE + "/shenmaSanguo");
    const panel = page.locator('[data-testid="player-load-error"]');
    await panel.waitFor({ timeout: 60000 });
    await setMock("__shenma_mock_netfail", null);
    const netText = await panel.innerText();
    const shotNet = await H.shot(page, "r4-a1-network-error-panel");
    const ui1 = await H.hud(page);
    run.check("A-1 網路錯誤：顯示讀取失敗原因、重試、更換金鑰，不停在載入動畫",
      /無法連線到伺服器/.test(netText) && /NETWORK_ERROR/.test(netText) && /重試/.test(netText) && /更換金鑰/.test(netText) && !ui1.loader,
      { text: netText.replace(/\s+/g, " ").slice(0, 200), loader: ui1.loader });

    // 後端 500：按重試 → 同樣顯示錯誤（代碼不同）
    await setMock("__shenma_mock_fail", { get_profile: 1000 });
    await panel.getByRole("button", { name: "重試" }).click();
    await page.waitForFunction(() => /MOCK_INJECTED_FAILURE/.test((document.querySelector('[data-testid="player-load-error"]') || {}).innerText || ""), null, { timeout: 60000 });
    const shot500 = await H.shot(page, "r4-a2-server-error-panel");
    run.check("A-2 後端錯誤：重試後顯示對應錯誤，仍可操作", true, "已顯示 MOCK_INJECTED_FAILURE");

    // 恢復正常 → 重試成功進入備戰
    await setMock("__shenma_mock_fail", null);
    const idx = await H.bridgeLen(page);
    await panel.getByRole("button", { name: "重試" }).click();
    await H.waitHud(page);
    await H.waitBridge(page, idx, { type: "update_stats", game_state: 1, wave: 0 });
    const calls = H.countActions(await since(t0));
    const sess = await session();
    run.check("A-3 重試成功：載入既有存檔並進入 Godot 備戰", sess?.key === "test_r4_i7" && sess?.nickname === "既有玩家", { key: sess?.key, nickname: sess?.nickname });
    run.check("A-4 整段沒有 create_profile（非 PROFILE_NOT_FOUND 不建檔）", !calls.create_profile, calls);
    out.A = { calls, shots: [shotNet, shot500, await H.shot(page, "r4-a3-retry-success")] };
  });

  // ── B. 錯誤面板 → 更換金鑰；首次建檔失敗 → 不報成功、可重試 ──
  await section("B", async () => {
    await H.resetOrigin(page);
    await page.evaluate(() => localStorage.setItem("shenma_player_key", "test_r4_broken"));
    await setMock("__shenma_mock_netfail", { get_profile: 1000 });
    await page.goto(H.BASE + "/shenmaSanguo");
    const panel = page.locator('[data-testid="player-load-error"]');
    await panel.waitFor({ timeout: 60000 });
    await setMock("__shenma_mock_netfail", null);
    await panel.getByRole("button", { name: "更換金鑰" }).click();
    const input = page.locator(KEY_INPUT);
    await input.waitFor({ timeout: 10000 });
    const prefilled = await input.inputValue();
    // 建檔失敗一次
    await setMock("__shenma_mock_fail", { create_profile: 1 });
    await input.fill("test_r4_new");
    const t0 = Date.now();
    await page.getByRole("button", { name: "進入遊戲" }).click();
    await page.waitForSelector(".alert-danger", { timeout: 60000 });
    const errText = await page.locator(".alert-danger").first().innerText();
    const shotFail = await H.shot(page, "r4-b1-create-failed");
    const keyAfterFail = await lsKey();
    run.check("B-1 建檔失敗：留在金鑰畫面顯示原因，不寫入新金鑰、不報成功",
      /MOCK_INJECTED_FAILURE/.test(errText) && keyAfterFail === "test_r4_broken" && (await page.locator(KEY_INPUT).count()) === 1 && !(await page.locator('[title="切換關卡"]').count()),
      { prefilled, errText, keyAfterFail });
    // 再按一次 → 成功
    const idx = await H.bridgeLen(page);
    await page.getByRole("button", { name: "進入遊戲" }).click();
    await H.waitHud(page);
    await H.waitBridge(page, idx, { type: "update_stats", game_state: 1, wave: 0 });
    const calls = H.countActions(await since(t0));
    const sess = await session();
    run.check("B-2 再試一次：建檔並進入備戰，金鑰與 session 一起切到新金鑰",
      (await lsKey()) === "test_r4_new" && sess?.key === "test_r4_new" && calls.create_profile === 2,
      { calls, sessionKey: sess?.key });
    out.B = { prefilled, calls, shots: [shotFail, await H.shot(page, "r4-b2-new-key-ready")] };
  });

  // ── C. 切換帳號：A 有未同步修改且保存失敗 → 擋下；恢復後先保存再切換 ──
  await section("C", async () => {
    // 接續 B：目前是 test_r4_new
    await changeTeam();
    const pending = await session();
    await setMock("__shenma_mock_fail", { save_profile: 1000 });
    const t0 = Date.now();
    await openPlayerInfo();
    await H.clickButton(page, "切換");
    await page.locator('div[class*="modalPanel"] ' + KEY_INPUT).fill("test_r4_other");
    await H.clickButton(page, "確認切換");
    await page.waitForFunction(() => /切換失敗/.test((document.querySelector('div[class*="modalPanel"] .alert-danger') || {}).innerText || ""), null, { timeout: 60000 });
    const failText = await alertText();
    const shotBlocked = await H.shot(page, "r4-c1-switch-blocked");
    const sessBlocked = await session();
    run.check("C-1 未同步修改保存失敗：切換被擋，顯示原因",
      /UNSYNCED_SAVE_FAILED/.test(failText) && (await lsKey()) === "test_r4_new" && sessBlocked?.key === "test_r4_new" && JSON.stringify(teamOf(sessBlocked)) === JSON.stringify(teamOf(pending)),
      { failText, lsKey: await lsKey(), sessionTeam: teamOf(sessBlocked) });
    run.check("C-2 切換被擋時沒有讀取新金鑰", (await since(t0, "get_profile", "test_r4_other")).length === 0);
    // 恢復保存 → 再切換一次
    await setMock("__shenma_mock_fail", null);
    await H.clickButton(page, "確認切換");
    await page.waitForFunction(() => /新存檔建立成功/.test((document.querySelector('div[class*="modalPanel"] .alert-success') || {}).innerText || ""), null, { timeout: 60000 });
    const d = await db();
    const sess = await session();
    run.check("C-3 保存成功後才切換：舊帳號修改已寫入後端，金鑰與 session 切到新帳號",
      JSON.stringify(teamOf(d.profiles.test_r4_new)) === JSON.stringify(teamOf(pending)) && (await lsKey()) === "test_r4_other" && sess?.key === "test_r4_other",
      { backendOld: teamOf(d.profiles.test_r4_new), session: sess?.key });
    out.C = { shots: [shotBlocked, await H.shot(page, "r4-c2-switch-success")] };
    await closeModal();
  });

  // ── D. I4：Pending → 重新整理 → 不操作也會補送 ──
  await section("D", async () => {
    // 接續 C：目前是 test_r4_other（剛建立，隊伍為關羽＋趙雲）
    await changeTeam();
    const pending = await session();
    // 暫停 save_profile：beforeunload 的 keepalive 請求會卡住並隨頁面消失，確保後端資料只可能來自重新整理後的補送
    await page.evaluate(() => window.__shenmaMock.hold("save_profile"));
    const tReload = Date.now();
    await page.reload();
    await waitLog((e) => e.action === "save_profile" && e.status === 200, tReload);
    await waitSync("idle");
    const saves = await since(tReload, "save_profile", "test_r4_other");
    const d = await db();
    const sess = await session();
    run.check("D-1 Pending 重新整理後不操作也會 save_profile，後端收到最新隊伍",
      pending?.syncStatus === "pending" && saves.length >= 1 && JSON.stringify(saves[saves.length - 1].saved.team) === JSON.stringify(teamOf(pending)) && JSON.stringify(teamOf(d.profiles.test_r4_other)) === JSON.stringify(teamOf(pending)),
      { before: pending?.syncStatus, saves: saves.map((s) => s.saved.team), backend: teamOf(d.profiles.test_r4_other) });
    run.check("D-2 補送後 UI 與 session 都是 idle", (await syncStatus()) === "idle" && sess?.syncStatus === "idle", { ui: await syncStatus(), session: sess?.syncStatus });
    out.D = { shot: await H.shot(page, "r4-d-pending-restored") };
  });

  // ── E. I4：戰鬥結算的 profile 保存在途（Syncing）→ 重新整理 → 只重送 profile ──
  await section("E", async () => {
    await H.waitHud(page);
    await H.selectStage(page, "Mock C 快速自動");
    await H.clickButton(page, "自動");
    await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 600000, polling: 500 });
    const before = await session();
    await page.evaluate(() => window.__shenmaMock.hold("save_profile"));
    const tConfirm = Date.now();
    await page.getByRole("button", { name: "確認" }).click();
    await waitLog((e) => e.action === "save_result" && e.status === 200, tConfirm);
    await page.waitForFunction(() => window.__shenmaMock.pending("save_profile").length > 0, null, { timeout: 60000 });
    await waitSync("syncing");
    const syncing = await session();
    const tReload = Date.now();
    await page.reload();
    await waitLog((e) => e.action === "save_profile" && e.status === 200, tReload);
    await waitSync("idle");
    const d = await db();
    const results = await since(tConfirm, "save_result");
    run.check("E-1 Syncing 重新整理後補送 profile：後端點數包含本次獎勵",
      syncing?.syncStatus === "syncing" && d.profiles.test_r4_other.gold === syncing.gold && syncing.gold > before.gold,
      { before: before.gold, syncing: syncing?.gold, backend: d.profiles.test_r4_other.gold, sessionStatus: syncing?.syncStatus });
    run.check("E-2 不重播 save_result（只在確認時送 1 次）", results.length === 1, results.length);
    out.E = { shot: await H.shot(page, "r4-e-syncing-restored") };
  });

  // ── F. Idle 重新整理不產生無故的 save_profile ──
  await section("F", async () => {
    const tReload = Date.now();
    await page.reload();
    await H.waitHud(page);
    // 背景刷新的 get_profile 回來後，再觀察 3 秒
    await waitLog((e) => e.action === "get_profile" && e.key === "test_r4_other", tReload);
    await H.sleep(3000);
    const saves = await since(tReload, "save_profile");
    run.check("F-1 Idle 重新整理：沒有 save_profile", saves.length === 0 && (await syncStatus()) === "idle", saves.length);
  });

  // ── G. 手動同步：保存失敗 → 回報失敗並保留資料；恢復後成功 ──
  await section("G", async () => {
    await changeTeam();
    const pending = await session();
    const backendBefore = teamOf((await db()).profiles.test_r4_other);
    await setMock("__shenma_mock_fail", { save_profile: 1000 });
    await openPlayerInfo();
    await page.getByRole("button", { name: /強制從雲端同步/ }).click();
    await page.waitForFunction(() => /同步失敗/.test((document.querySelector('div[class*="modalPanel"] .alert-danger') || {}).innerText || ""), null, { timeout: 60000 });
    const failText = await alertText();
    const sess = await session();
    run.check("G-1 手動同步保存失敗：回報失敗，本機修改與 session 保留、後端不變",
      /UNSYNCED_SAVE_FAILED/.test(failText) && JSON.stringify(teamOf(sess)) === JSON.stringify(teamOf(pending)) && sess?.syncStatus === "pending" && JSON.stringify(teamOf((await db()).profiles.test_r4_other)) === JSON.stringify(backendBefore),
      { failText, sessionTeam: teamOf(sess), status: sess?.syncStatus });
    const shotFail = await H.shot(page, "r4-g1-manual-sync-failed");
    await setMock("__shenma_mock_fail", null);
    await page.getByRole("button", { name: /強制從雲端同步/ }).click();
    await page.waitForFunction(() => /資料同步成功/.test((document.querySelector('div[class*="modalPanel"] .alert-success') || {}).innerText || ""), null, { timeout: 60000 });
    const d = await db();
    run.check("G-2 恢復後手動同步成功：後端收到修改、狀態 idle",
      JSON.stringify(teamOf(d.profiles.test_r4_other)) === JSON.stringify(teamOf(pending)) && (await syncStatus()) === "idle",
      { backend: teamOf(d.profiles.test_r4_other) });
    out.G = { shots: [shotFail, await H.shot(page, "r4-g2-manual-sync-ok")] };
    await closeModal();
  });

  // ── H. 武將升級 smoke（伺服器計算）──
  await section("H", async () => {
    const goldBefore = (await session()).gold;
    await H.clickButton(page, "武將");
    await page.locator('div[class*="heroName"]', { hasText: "關羽" }).first().click();
    await page.getByRole("button", { name: /^升級 \(-\d+ 點\)$/ }).click();
    await page.waitForSelector("text=升級成功！", { timeout: 60000 });
    const d = await db();
    const hero = d.profiles.test_r4_other.heroes.find((h) => h.hero_id === "guan_yu");
    run.check("H-1 升級成功：後端武將升級、扣點數，本機金額一致",
      hero && hero.level === 2 && d.profiles.test_r4_other.gold === goldBefore - 100 && (await session()).gold === goldBefore - 100,
      { hero, backendGold: d.profiles.test_r4_other.gold, goldBefore });
    out.H = { shot: await H.shot(page, "r4-h-upgrade") };
  });

  return run.finish({ out });
}
