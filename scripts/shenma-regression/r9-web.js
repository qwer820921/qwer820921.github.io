async (page) => {
  // R9（瀏覽器）：場次隔離（Codex C6～C8）
  // - 舊場次的結算一律用「Godot 實際產生」的訊息：先用 harness 的 __bridgeWithhold 攔住、不交給頁面，
  //   之後原封不動重送（帶的是產生它那一場的 battle_id）；舊 stats 也取自 Godot 實際送出的 update_stats
  // - A：新場次（另一個帳號）開打後，舊場次的結算才送達
  // - B：同一關重來後，上一場的結算才送達；錯誤／缺少 battle_id 的結算；這一場的結算只結算一次
  // - C：舊關卡的 stats 晚到（新場次還在備戰）
  // - D、E：切換帳號的讀取／保存在途時才開打（C6）
  // - F：獨立 battle 路由：錯誤／缺少 battle_id 的 stats 與結算、其他場次的結算；連按只結算一次
  // - G：回到主頁開打後，切換仍被擋下；後端的戰鬥紀錄不含 battle_id
  // 每段都從乾淨的頁面開始（重設儲存後重新載入），修正前某段失敗不會連帶影響下一段。
  // 斷言 UI、session、mock 後端資料與請求 key，不只看彈窗。全部使用虛構金鑰 test_r9_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const A = "test_r9_a";
  const B = "test_r9_b";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const KEY_INPUT = 'input[placeholder="例：eric_sanguo_2026"]';

  // ── 共用小工具 ──
  const log = () => H.gasLog(page);
  const since = async (t, action, key) =>
    (await log()).filter((e) => e.t >= t && (!action || e.action === action) && (!key || e.key === key));
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const session = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
  const lsKey = () => page.evaluate(() => localStorage.getItem("shenma_player_key"));
  const setMock = (k, v) => page.evaluate(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v))), [k, v]);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const profile = (nickname, team = ["guan_yu", "zhao_yun"]) => ({
    nickname, level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_7", heroes: [],
    team: team.map((hero_id, i) => ({ hero_id, slot: i + 1 })),
  });
  const teamOf = (p) => (p && p.team ? p.team.map((t) => t.hero_id) : null);
  const golds = async () => {
    const d = await db();
    return { A: d.profiles[A]?.gold, B: d.profiles[B]?.gold };
  };
  const bodyHas = (re) => page.evaluate((src) => new RegExp(src).test(document.body.innerText), re.source);
  const hasResultModal = () => bodyHas(/勝 利|落 敗/);
  const waitResultModal = (timeout = 300000) =>
    page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout, polling: 500 });
  // idx 之後 Godot 送出的最後一筆結算
  const resultSince = (idx) =>
    page.evaluate((i) => (window.__bridgeLog || []).slice(i).filter((m) => m.type === undefined && typeof m.result === "string").pop() || null, idx);
  const statsSince = (idx) => page.evaluate((i) => (window.__bridgeLog || []).slice(i).filter((m) => m.type === "update_stats"), idx);
  const strip = (m) => {
    const c = { ...m };
    delete c.__t;
    return c;
  };
  // 攔住 Godot 的結算（不交給頁面），之後可原封不動重送
  const withholdOn = () => page.evaluate(() => { window.__bridgeWithhold = []; });
  const withholdOff = () => page.evaluate(() => { window.__bridgeWithhold = null; });
  const waitWithheld = async (timeout = 300000) => {
    await page.waitForFunction(() => Array.isArray(window.__bridgeWithhold) && window.__bridgeWithhold.length > 0, null, { timeout, polling: 200 });
    return page.evaluate(() => window.__bridgeWithhold[0]);
  };
  // 從 Godot iframe 內送出訊息（和 Godot 送出的路徑相同：iframe → window.parent.postMessage）
  const inject = (msg, sel = IFRAME) =>
    page.evaluate(({ sel, msg }) => {
      const w = document.querySelector(sel).contentWindow;
      w.eval("window.parent.postMessage(" + JSON.stringify(msg) + ", '*')");
    }, { sel, msg });
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
  // 用玩家資訊切換帳號，等結果並回傳顯示的訊息
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
  // 送出切換（不等結果）後關閉視窗
  const startSwitch = async (key) => {
    await openPlayerInfo();
    await H.clickButton(page, "切換");
    await page.locator('div[class*="modalPanel"] ' + KEY_INPUT).fill(key);
    await H.clickButton(page, "確認切換");
  };
  const releaseAll = (action) =>
    page.evaluate((a) => {
      window.__shenmaMock.unhold(a);
      let n = 0;
      while (window.__shenmaMock.release(a, "ok")) n += 1;
      return n;
    }, action);
  // 用隊伍 Modal 改隊伍，產生一次本機修改（Pending，30 秒後才保存）
  const changeTeam = async () => {
    const team = teamOf(await session()) || [];
    const clicks = team.length > 1 ? ["趙雲"] : team[0] === "guan_yu" ? ["關羽", "趙雲"] : ["趙雲", "關羽"];
    await H.clickButton(page, "隊伍");
    await page.waitForSelector("text=儲存隊伍");
    for (const name of clicks) await page.locator('div[class*="modalPanel"]').getByText(name).first().click();
    await H.clickButton(page, "儲存隊伍");
    await H.clickButton(page, "關閉");
  };
  const confirmResult = async (label = "確認") => {
    await page.getByRole("button", { name: label, exact: true }).click();
    await H.sleep(3000);
  };
  // 乾淨的起點：重設儲存、建立 A／B 兩個存檔，以 key 載入主頁並選好關卡
  const fresh = async (key, stage) => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", { profiles: { [A]: profile("A 玩家"), [B]: profile("B 玩家") }, battle_logs: [] });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), key);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    if (stage) await H.selectStage(page, stage);
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r9-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await withholdOff(); } catch { /* 頁面可能已離開 */ }
      try { await closeModals(); } catch { /* 沒有 Modal 可關 */ }
    }
  };

  // ── A. 新場次（B）開打後，A 那一場的結算才送達 ──
  await section("A", async () => {
    await fresh(A, "Mock W 勝利兩波");
    await withholdOn();
    let idx = await H.bridgeLen(page);
    await H.clickButton(page, "自動");
    const started = await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    const oldResult = strip(await waitWithheld()); // A 那一場由 Godot 產生的結算，先不交給頁面
    await withholdOff();
    const shownEarly = await hasResultModal();
    await H.selectStage(page, "Mock B 對照關"); // 明確離開 A 那一場
    const sw = await switchTo(B);
    await H.sleep(1500);
    await H.selectStage(page, "Mock A 慢速出兵");
    idx = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    const newStarted = await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    const before = await golds();
    const t = Date.now();
    await inject(oldResult);
    await H.sleep(1500);
    const shown = await hasResultModal();
    if (shown) await confirmResult(); // 修正前：舊結算會顯示，確認後記錄實際影響
    const after = await golds();
    const requests = await since(t, "save_result");
    out.A = {
      oldBattleId: oldResult.battle_id, startedBattleId: started.battle_id, newBattleId: newStarted.battle_id,
      switchText: sw, shownEarly, shown, before, after, resultKeys: requests.map((e) => e.key), sessionKey: (await session())?.key,
    };
    run.check("A-0 前置：A 那一場的結算由 Godot 產生，帶 A 那一場的 battle_id（和開打時的 stats 相同）；攔住期間沒有顯示結算；離開後切到 B",
      typeof oldResult.battle_id === "string" && oldResult.battle_id.length > 0 && oldResult.battle_id === started.battle_id &&
        !shownEarly && /讀取成功/.test(sw) && out.A.sessionKey === B,
      out.A);
    run.check("A-1 B 的新場次開打後（battle_id 不同），A 那一場的結算才送達：不顯示結算、沒有 save_result，A 與 B 的點數都不變",
      typeof newStarted.battle_id === "string" && newStarted.battle_id !== oldResult.battle_id &&
        !shown && requests.length === 0 && after.A === before.A && after.B === before.B,
      out.A);
    out.A_shot = await H.shot(page, "r9-a-old-result-ignored");
  });

  // ── B. 同一關重來後，上一場的結算才送達；錯誤／缺少 battle_id；這一場只結算一次 ──
  await section("B", async () => {
    await fresh(A, "Mock W 勝利兩波");
    await withholdOn();
    let idx = await H.bridgeLen(page);
    await H.clickButton(page, "自動");
    const sX = await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    const oldX = strip(await waitWithheld());
    await withholdOff();
    await H.selectStage(page, "Mock W 勝利兩波"); // 同一關重來
    idx = await H.bridgeLen(page);
    const gBefore = await golds();
    const t0 = Date.now();
    await H.clickButton(page, "自動");
    const sY = await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    await inject(oldX);
    await H.sleep(1500);
    const shownOld = await hasResultModal();
    const noId = { ...oldX };
    delete noId.battle_id;
    const bogus = { ...oldX, battle_id: "r9-bogus-id" };
    let shownBad = false;
    if (!shownOld) {
      await inject(noId);
      await inject(bogus);
      await H.sleep(1500);
      shownBad = await hasResultModal();
    }
    out.B_old = { oldBattleId: oldX.battle_id, sX: sX.battle_id, sY: sY.battle_id, sameStage: oldX.stage_id, shownOld, shownBad };
    run.check("B-1 同一關重來並開打後，上一場的結算（stage_id 相同、battle_id 是上一場）才送達：不顯示結算",
      typeof oldX.battle_id === "string" && oldX.battle_id === sX.battle_id && sY.battle_id !== oldX.battle_id && !shownOld, out.B_old);
    run.check("B-2 缺少 battle_id、battle_id 錯誤的結算：不顯示結算", !shownOld && !shownBad, out.B_old);
    if (shownOld || shownBad) {
      // 修正前：舊結算被採用，記錄確認後的影響，這一段不再等這一場自己的結算
      await confirmResult();
      out.B_misread = { resultKeys: (await since(t0, "save_result")).map((e) => e.key), golds: await golds(), gBefore };
      run.check("B-3 這一場自己的結算照常採用、連按只結算一次", false, out.B_misread);
      return;
    }
    const idxOwn = await H.bridgeLen(page);
    await waitResultModal();
    const res = await resultSince(idxOwn);
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "確認");
      b.click();
      b.click();
    });
    await H.sleep(3000);
    await inject(strip(res)); // 同一場的結算在確認後又送達一次
    await H.sleep(1500);
    const shownAgain = await hasResultModal();
    if (shownAgain) await confirmResult();
    await waitSync("idle");
    const results = await since(t0, "save_result");
    const g = await golds();
    const reward = res && res.result === "WIN" ? res.loots[0].count : 10;
    out.B = { ownBattleId: res?.battle_id, shownAgain, resultKeys: results.map((e) => e.key), golds: g, gBefore, reward };
    run.check("B-3 這一場自己的結算（battle_id 相同）照常採用；連按確認、確認後重複送達都只結算一次：save_result 1 次、key 是 A，A 只加一次",
      res?.battle_id === sY.battle_id && !shownAgain && results.length === 1 && results[0].key === A && g.A === gBefore.A + reward && g.B === gBefore.B,
      out.B);
    out.B_shot = await H.shot(page, "r9-b-own-result-settled-once");
  });

  // ── C. 舊關卡的 stats 晚到（新場次還在備戰）──
  await section("C", async () => {
    await fresh(A, "Mock A 慢速出兵");
    let idx = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    const sOld = await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    await H.sleep(1500);
    const oldStats = { ...strip((await statsSince(idx)).filter((m) => m.game_state === 2).pop() || sOld), gold: 4321 };
    await H.selectStage(page, "Mock B 對照關"); // 明確離開，新的一場在備戰
    const hudBefore = await H.hud(page);
    await inject(oldStats);
    await H.sleep(1500);
    const hudAfter = await H.hud(page);
    const shows4321 = await bodyHas(/4321/);
    out.C = { oldBattleId: oldStats.battle_id, hudBefore, hudAfter, shows4321 };
    run.check("C-1 舊關卡開打中的 stats（Godot 實際送出、battle_id 是上一場）晚到：HUD 不採用，仍是備戰（迎戰、0/1）",
      typeof oldStats.battle_id === "string" && hudAfter.startLabel === "迎戰" && hudAfter.wave === hudBefore.wave && !shows4321, out.C);
    const sw = await switchTo(B);
    out.C.switchText = sw;
    out.C.sessionKey = (await session())?.key;
    run.check("C-2 新場次仍在備戰：沒有被舊 stats 鎖住，可以切換到 B", /讀取成功/.test(sw) && out.C.sessionKey === B, out.C);
  });

  // ── D. 切換到 B 的讀取在途時，A 開打（C6）──
  await section("D", async () => {
    await fresh(A, "Mock W 勝利兩波");
    await page.evaluate(() => window.__shenmaMock.hold("get_profile"));
    const t0 = Date.now();
    await startSwitch(B);
    await page.waitForFunction((k) => window.__shenmaMock.pending("get_profile").some((q) => q.key === k), B, { timeout: 30000, polling: 100 });
    await closeModals();
    let idx = await H.bridgeLen(page);
    await H.clickButton(page, "自動");
    const started = await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    const idxRelease = await H.bridgeLen(page);
    const released = await releaseAll("get_profile");
    await H.sleep(3000);
    const sess = await session();
    const key = await lsKey();
    const reloaded = (await statsSince(idxRelease)).some((m) => m.wave === 0 && m.game_state === 1);
    const hud = await H.hud(page);
    out.D_switch = { released, sessionKey: sess?.key, lsKey: key, reloaded, hud, battleId: started.battle_id };
    run.check("D-1 切換到 B 的讀取在途時 A 開打：讀取回來後沒有切換（session 與金鑰都是 A），Godot 沒有重新載入",
      released >= 1 && sess?.key === A && key === A && !reloaded, out.D_switch);
    if (sess?.key !== A || reloaded) {
      out.D_shot = await H.shot(page, "r9-d-switched-during-battle");
      run.check("D-2 A 那一場的結算只算給 A", false, "修正前：已切到 B、關卡被重新載入，這一場沒有結算");
      return;
    }
    await waitResultModal();
    const res = await resultSince(idx);
    await confirmResult();
    await waitSync("idle");
    const results = await since(t0, "save_result");
    const g = await golds();
    const reward = res && res.result === "WIN" ? res.loots[0].count : 10;
    out.D = { resultKeys: results.map((e) => e.key), golds: g, reward, sessionKey: (await session())?.key };
    run.check("D-2 A 那一場的結算只算給 A：save_result 1 次、key 是 A，A 增加、B 不變，仍是 A",
      results.length === 1 && results[0].key === A && g.A === 1000 + reward && g.B === 1000 && out.D.sessionKey === A, out.D);
    out.D_shot = await H.shot(page, "r9-d-settled-to-a");
  });

  // ── E. 切換前先保存 A 的修改，保存在途時 A 開打（C6）──
  await section("E", async () => {
    await fresh(A, "Mock W 勝利兩波");
    await changeTeam();
    const pending = await session();
    await page.evaluate(() => window.__shenmaMock.hold("save_profile"));
    const t0 = Date.now();
    await startSwitch(B);
    await page.waitForFunction((k) => window.__shenmaMock.pending("save_profile").some((q) => q.key === k), A, { timeout: 30000, polling: 100 });
    await closeModals();
    let idx = await H.bridgeLen(page);
    await H.clickButton(page, "自動");
    await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    const idxRelease = await H.bridgeLen(page);
    const released = await releaseAll("save_profile");
    await H.sleep(3000);
    const sess = await session();
    const readsB = await since(t0, "get_profile", B);
    const reloaded = (await statsSince(idxRelease)).some((m) => m.wave === 0 && m.game_state === 1);
    const d = await db();
    out.E_switch = {
      released, sessionKey: sess?.key, lsKey: await lsKey(), readsB: readsB.length, reloaded,
      pendingTeam: teamOf(pending), backendTeamA: teamOf(d.profiles[A]), pendingStatus: pending?.syncStatus,
    };
    run.check("E-1 切換前的保存在途時 A 開打：保存完成後沒有讀取 B、沒有切換，Godot 沒有重新載入；A 的隊伍修改已寫入後端",
      pending?.syncStatus === "pending" && released >= 1 && sess?.key === A && out.E_switch.lsKey === A && readsB.length === 0 && !reloaded &&
        JSON.stringify(out.E_switch.backendTeamA) === JSON.stringify(out.E_switch.pendingTeam),
      out.E_switch);
    if (sess?.key !== A || reloaded) {
      run.check("E-2 A 那一場的結算只算給 A", false, "修正前：已切到 B、關卡被重新載入，這一場沒有結算");
      return;
    }
    await waitResultModal();
    const res = await resultSince(idx);
    await confirmResult();
    await waitSync("idle");
    const results = await since(t0, "save_result");
    const g = await golds();
    const reward = res && res.result === "WIN" ? res.loots[0].count : 10;
    out.E = { resultKeys: results.map((e) => e.key), golds: g, reward };
    run.check("E-2 A 那一場的結算只算給 A：save_result 1 次、key 是 A，A 增加、B 不變",
      results.length === 1 && results[0].key === A && g.A === 1000 + reward && g.B === 1000, out.E);
  });

  // ── F. 獨立 battle 路由 ──
  await section("F", async () => {
    await fresh(A);
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_4");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
    const first = await H.waitBridge(page, 0, { type: "update_stats", wave: 0, game_state: 1 });
    // 錯誤／缺少 battle_id 的 stats（gold 4321、HP 3 方便辨認）
    const fakeStats = { __godot_bridge: true, type: "update_stats", game_state: 2, wave: 1, total_waves: 2, gold: 4321, hp: 3, max_hp: 20, auto_mode: true };
    await inject({ ...fakeStats, battle_id: "r9-bogus-id" }, BIFRAME);
    await inject(fakeStats, BIFRAME);
    await H.sleep(1500);
    const statsMisread = await bodyHas(/4321|戰鬥中/);
    run.check("F-1 獨立戰鬥頁：錯誤、缺少 battle_id 的 stats 不採用（畫面沒有出現 4321、仍是迎戰）", !statsMisread && typeof first.battle_id === "string", { statsMisread, battleId: first.battle_id });
    let idx = await H.bridgeLen(page);
    const t0 = Date.now();
    const gBefore = await golds();
    await page.locator("button", { hasText: /^自動/ }).click();
    const started = await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    // 其他場次（A 段那一場，Godot 實際產生的 battle_id）、錯誤、缺少 battle_id 的結算。
    // 獨立戰鬥頁每次載入只有一場，舊頁面的 iframe 已經不存在，所以這裡用它的 battle_id 組出結算
    const base ={ __godot_bridge: true, result: "WIN", stage_id: "chapter1_4", stars_earned: 3, kills: 6, time_seconds: 20, loots: [{ item: "battle_points", count: 999 }] };
    const olds = [
      { ...base, battle_id: out.A && out.A.oldBattleId ? out.A.oldBattleId : "r9-other-battle" },
      { ...base, battle_id: "r9-bogus-id" },
      base,
    ];
    for (const m of olds) await inject(m, BIFRAME);
    await H.sleep(1500);
    const shownBad = await bodyHas(/確認，返回主選單/);
    out.F_bad = { battleId: started.battle_id, shownBad, injected: olds.map((m) => m.battle_id ?? null) };
    run.check("F-2 獨立戰鬥頁開打後：其他場次、錯誤、缺少 battle_id 的結算都不顯示", !shownBad && started.battle_id === first.battle_id, out.F_bad);
    if (shownBad) {
      await page.evaluate(() => [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "確認，返回主選單").click());
      await page.waitForURL(/\/shenmaSanguo$/, { timeout: 60000 });
      out.F_misread = { resultKeys: (await since(t0, "save_result")).map((e) => e.key), golds: await golds(), gBefore };
      run.check("F-3 這一場的結算連按只結算一次", false, out.F_misread);
      return;
    }
    const idxOwn = await H.bridgeLen(page);
    await page.waitForFunction(() => /確認，返回主選單/.test(document.body.innerText), null, { timeout: 300000, polling: 500 });
    const res = await resultSince(idxOwn);
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
    out.F = { ownBattleId: res?.battle_id, resultKeys: results.map((e) => e.key), golds: g, gBefore, reward };
    run.check("F-3 這一場的結算（battle_id 相同）採用；連按確認只送 1 次 save_result、key 是 A，A 只加一次",
      res?.battle_id === started.battle_id && results.length === 1 && results[0].key === A && g.A === gBefore.A + reward && g.B === gBefore.B, out.F);
  });

  // ── G. 回到主頁開打後，切換仍被擋下；後端的戰鬥紀錄不含 battle_id ──
  await section("G", async () => {
    await H.selectStage(page, "Mock A 慢速出兵");
    const idx = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
    const sw = await switchTo(B);
    out.G = { switchText: sw, sessionKey: (await session())?.key };
    run.check("G-1 從獨立戰鬥頁回到主頁、開打後：切換到 B 被擋下（舊頁面離開時沒有解除新場次的鎖）",
      /請先結算或離開目前戰鬥/.test(sw) && out.G.sessionKey === A, out.G);
    await H.selectStage(page, "Mock B 對照關");
    const logs = (await db()).battle_logs || [];
    out.G.battleLogs = logs.length;
    run.check("G-2 後端收到的 save_result 都不含 battle_id（場次識別碼只在頁面比對）",
      logs.length >= 1 && logs.every((l) => !("battle_id" in l)), { count: logs.length, keys: logs.map((l) => Object.keys(l)) });
  });

  return run.finish({ out });
}
