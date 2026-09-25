async (page) => {
  // R8（瀏覽器）：戰鬥與結算的帳號歸屬（D8）
  // A 開戰後切換 B、正常結算後切換、明確離開（切換關卡）後切換、舊結算晚到、重複結算與連按、
  // 獨立 battle 路由的結算入口。斷言 mock 後端實際收到的請求 key 與點數，不只看 UI。
  // 全部使用虛構金鑰 test_r8_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const A = "test_r8_a";
  const B = "test_r8_b";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';

  // ── 共用小工具 ──
  const KEY_INPUT = 'input[placeholder="例：eric_sanguo_2026"]';
  const log = () => H.gasLog(page);
  const since = async (t, action, key) =>
    (await log()).filter((e) => e.t >= t && (!action || e.action === action) && (!key || e.key === key));
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const session = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
  const setMock = (k, v) => page.evaluate(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v))), [k, v]);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const profile = (nickname) => ({
    nickname, level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_7", heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }],
  });
  const golds = async () => {
    const d = await db();
    return { A: d.profiles[A]?.gold, B: d.profiles[B]?.gold };
  };
  const hasResultModal = () => page.evaluate(() => /勝 利|落 敗/.test(document.body.innerText));
  const waitResultModal = () =>
    page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 600000, polling: 500 });
  // 等待 idx 之後出現符合條件的 Godot 訊息；逾時回傳 null（不拋例外，讓修正前也能記錄結果）
  const waitBridgeOrNull = async (idx, match, timeout) => {
    try {
      return await H.waitBridge(page, idx, match, timeout);
    } catch {
      return null;
    }
  };
  const lastResultMsg = () =>
    page.evaluate(() => [...(window.__bridgeLog || [])].reverse().find((m) => m.type === undefined && typeof m.result === "string") || null);
  const openPlayerInfo = async () => {
    await page.locator('button[class*="hudAvatar"]').click();
    await page.waitForSelector("text=玩家資訊");
  };
  const closeModals = async () => {
    for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
      await page.locator('button[class*="modalClose"]').last().click();
      await H.sleep(300);
    }
  };
  // 用玩家資訊切換帳號，回傳顯示的訊息
  const switchTo = async (key) => {
    await openPlayerInfo();
    await H.clickButton(page, "切換");
    await page.locator('div[class*="modalPanel"] ' + KEY_INPUT).fill(key);
    await H.clickButton(page, "確認切換");
    await page.waitForFunction(() => {
      const el = document.querySelector('div[class*="modalPanel"] .alert');
      return el && /切換失敗|讀取成功|建立成功/.test(el.innerText);
    }, null, { timeout: 60000, polling: 100 });
    const text = await page.locator('div[class*="modalPanel"] .alert').first().innerText();
    await closeModals();
    return text;
  };
  // 從 Godot iframe 內送出一筆結算訊息（模擬舊戰鬥或重複的結算晚到）
  const injectResult = (msg, sel = IFRAME) =>
    page.evaluate(({ sel, msg }) => {
      const w = document.querySelector(sel).contentWindow;
      w.eval("window.parent.postMessage(" + JSON.stringify(msg) + ", '*')");
    }, { sel, msg });
  const fakeResult = (count) => ({
    __godot_bridge: true, result: "WIN", stage_id: "chapter1_1", stars_earned: 3, kills: 5, time_seconds: 30,
    loots: [{ item: "battle_points", count }],
  });
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r8-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await closeModals(); } catch { /* 沒有 Modal 可關 */ }
    }
  };

  // ── A. A 開戰後（戰鬥中）嘗試切換 B，A 的結算之後才到 ──
  await section("A", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", { profiles: { [A]: profile("A 玩家"), [B]: profile("B 玩家") }, battle_logs: [] });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), A);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, "Mock W 勝利兩波");
    const idx = await H.bridgeLen(page);
    await H.clickButton(page, "自動");
    await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    const t0 = Date.now();
    const switchText = await switchTo(B);
    const afterSwitch = await session();
    out.A_switch = { text: switchText, sessionKey: afterSwitch?.key, lsKey: await page.evaluate(() => localStorage.getItem("shenma_player_key")) };
    run.check("A-1 戰鬥中切換到 B：被擋下並提示先結算或離開戰鬥，仍是 A",
      /請先結算或離開目前戰鬥/.test(switchText) && afterSwitch?.key === A && out.A_switch.lsKey === A,
      out.A_switch);
    await waitResultModal();
    const res = await lastResultMsg();
    const tConfirm = Date.now();
    await page.getByRole("button", { name: "確認", exact: true }).click();
    await H.sleep(3000);
    await waitSync("idle");
    const results = await since(t0, "save_result");
    const saves = await since(tConfirm, "save_profile");
    const g = await golds();
    const reward = res && res.result === "WIN" ? res.loots[0].count : 10;
    out.A_settle = { resultKeys: results.map((e) => e.key), saveKeys: saves.map((e) => e.key), golds: g, reward, sessionKey: (await session())?.key };
    run.check("A-2 結算只算給開戰的 A：save_result 與 save_profile 的 key 都是 A，A 點數增加、B 不變",
      results.length === 1 && results[0].key === A && saves.length >= 1 && saves.every((e) => e.key === A) &&
        g.A === 1000 + reward && g.B === 1000,
      out.A_settle);
    out.A_shot = await H.shot(page, "r8-a-after-settle");
  });

  // ── B. 正常結算後可以切換；新帳號拿到自己的關卡，戰鬥結果算給自己 ──
  await section("B", async () => {
    // 結算確認後，同一關會重新載入（wave 0 備戰），等它完成再切換
    await page.waitForFunction(() => (window.__bridgeLog || []).length > 0, null, { timeout: 5000 });
    await H.sleep(2000);
    const idx = await H.bridgeLen(page);
    const gBefore = await golds();
    const switchText = await switchTo(B);
    const reset = await waitBridgeOrNull(idx, { type: "update_stats", wave: 0, game_state: 1 }, 30000);
    out.B_switch = { text: switchText, sessionKey: (await session())?.key, godotReloaded: !!reset };
    run.check("B-1 正常結算後可以切換到 B，而且 Godot 重新載入了 B 的關卡（切換後收到 wave 0 的備戰狀態）",
      /讀取成功/.test(switchText) && out.B_switch.sessionKey === B && !!reset, out.B_switch);
    // 切換後關卡會換成 B 預設的關卡（B 的最高進度），這裡改選和 A 相同的勝利關卡再開打
    await H.selectStage(page, "Mock W 勝利兩波");
    const idx2 = await H.bridgeLen(page);
    const t0 = Date.now();
    await H.clickButton(page, "自動");
    await H.waitBridge(page, idx2, { type: "update_stats", game_state: 2 });
    await waitResultModal();
    const res = await lastResultMsg();
    await page.getByRole("button", { name: "確認", exact: true }).click();
    await H.sleep(3000);
    await waitSync("idle");
    const results = await since(t0, "save_result");
    const g = await golds();
    const reward = res && res.result === "WIN" ? res.loots[0].count : 10;
    out.B_settle = { resultKeys: results.map((e) => e.key), golds: g, reward, gBefore };
    run.check("B-2 B 的戰鬥只算給 B：save_result key 是 B，B 點數增加，A 維持原值",
      results.length === 1 && results[0].key === B && g.B === gBefore.B + reward && g.A === gBefore.A, out.B_settle);
  });

  // ── C. 明確離開（切換關卡）後可以切換；舊戰鬥的結算晚到不影響新帳號 ──
  await section("C", async () => {
    await H.sleep(2000);
    await H.selectStage(page, "Mock A 慢速出兵");
    const idx = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    // 記下 Godot 回報的這一場 battle_id（Round 9 起 stats 與結算都帶它），舊結算用這個 id 模擬
    const startedC = await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    await H.selectStage(page, "Mock B 對照關"); // 明確離開目前戰鬥
    const switchText = await switchTo(A);
    run.check("C-1 明確離開戰鬥（切換關卡）後可以切換到 A", /讀取成功/.test(switchText) && (await session())?.key === A, switchText);
    await H.sleep(2000);
    const gBefore = await golds();
    const tFake = Date.now();
    // 舊戰鬥的結算：帶那一場實際的 battle_id（不是缺少 id 的無效格式）
    await injectResult({ ...fakeResult(999), battle_id: startedC.battle_id });
    await H.sleep(1500);
    const shown = await hasResultModal();
    if (shown) {
      // 修正前：舊結算會顯示，確認後記錄實際影響
      await page.getByRole("button", { name: "確認", exact: true }).click();
      await H.sleep(3000);
    }
    const results = await since(tFake, "save_result");
    const g = await golds();
    out.C_late = { oldBattleId: startedC.battle_id, shown, resultKeys: results.map((e) => e.key), golds: g, gBefore };
    run.check("C-2 舊戰鬥的結算（帶那一場的 battle_id）晚到：不顯示結算、沒有 save_result，A 與 B 的點數都不變",
      typeof startedC.battle_id === "string" && startedC.battle_id.length > 0 &&
        !shown && results.length === 0 && g.A === gBefore.A && g.B === gBefore.B, out.C_late);
  });

  // ── D. 待結算時沒有切換入口；連按確認、重複的結算訊息都只結算一次 ──
  await section("D", async () => {
    await H.selectStage(page, "Mock C 快速自動");
    const idx = await H.bridgeLen(page);
    const t0 = Date.now();
    const gBefore = await golds();
    await H.clickButton(page, "自動");
    await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    await waitResultModal();
    const res = await lastResultMsg();
    const hudAvatars = await page.locator('button[class*="hudAvatar"]').count();
    run.check("D-0（記錄實際 UI）待結算時 HUD 不顯示，沒有玩家資訊（切換帳號）的入口", hudAvatars === 0, { hudAvatars });
    // 同一個 tick 內按兩次確認
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "確認");
      b.click();
      b.click();
    });
    await H.sleep(3000);
    const afterDouble = await since(t0, "save_result");
    run.check("D-1 連按確認兩次：只送 1 次 save_result", afterDouble.length === 1, afterDouble.map((e) => e.key));
    // 同一場的結算訊息在確認之後又送達一次
    await injectResult({ ...res });
    await H.sleep(1500);
    const shownAgain = await hasResultModal();
    if (shownAgain) {
      await page.getByRole("button", { name: "確認", exact: true }).click();
      await H.sleep(3000);
    }
    await waitSync("idle");
    const results = await since(t0, "save_result");
    const g = await golds();
    const reward = res && res.result === "WIN" ? res.loots[0].count : 10;
    out.D = { shownAgain, resultKeys: results.map((e) => e.key), golds: g, gBefore, reward };
    run.check("D-2 重複的結算訊息晚到：不再顯示結算；整段只結算一次，點數只加一次",
      !shownAgain && results.length === 1 && g.A === gBefore.A + reward, out.D);
  });

  // ── E. 獨立的 battle 路由：非結算訊息不會被當成結算；連按確認只結算一次 ──
  await section("E", async () => {
    const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_3");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
    // Godot 回覆的 debug_snapshot 不是結算
    const snapId = "r8-snap";
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel: BIFRAME, id: snapId });
    await page.waitForFunction((id) => (window.__bridgeLog || []).some((m) => m.type === "debug_snapshot" && m.request_id === id), snapId, { timeout: 30000 });
    await H.sleep(1000);
    const snapShown = await page.evaluate(() => /勝 利|落 敗|確認，返回主選單/.test(document.body.innerText));
    run.check("E-1 Godot 的其他訊息（debug_snapshot）不會被當成結算", !snapShown, { snapShown });
    if (snapShown) {
      // 修正前：誤判的結算畫面擋住操作，記錄後重新載入頁面
      out.E_misread = await H.shot(page, "r8-e-snapshot-misread");
      await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_3");
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
    }
    const idx = await H.bridgeLen(page);
    const t0 = Date.now();
    const gBefore = await golds();
    await page.locator("button", { hasText: /^自動/ }).click();
    await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    await page.waitForFunction(() => /確認，返回主選單/.test(document.body.innerText), null, { timeout: 600000, polling: 500 });
    const res = await lastResultMsg();
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "確認，返回主選單");
      b.click();
      b.click();
    });
    await page.waitForURL(/\/shenmaSanguo$/, { timeout: 60000 });
    await H.waitHud(page);
    await waitSync("idle");
    const results = await since(t0, "save_result");
    const g = await golds();
    const reward = res && res.result === "WIN" ? res.loots[0].count : 10;
    out.E = { resultKeys: results.map((e) => e.key), golds: g, gBefore, reward };
    run.check("E-2 獨立戰鬥頁連按確認：只送 1 次 save_result，點數只加一次，算給目前帳號 A",
      results.length === 1 && results[0].key === A && g.A === gBefore.A + reward && g.B === gBefore.B, out.E);
    out.E_shot = await H.shot(page, "r8-e-battle-route-settled");
  });

  return run.finish({ out });
}
