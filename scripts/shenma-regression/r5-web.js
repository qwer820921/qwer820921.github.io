async (page) => {
  // R5／R6（瀏覽器）：升級回應遺失後重新整理的恢復（C1）、升級結果待確認的提示與重新確認、
  // 待確認時沒有強制解除保護的入口（C4）、升級在途時 debounce 不先保存、卸載不再盲寫（C2）、
  // 普通 Pending 重新整理補送、較早的背景讀取晚到不會還原已確認的升級（C3）
  // 回應順序一律用 mock 的 hold／release 控制；斷言 mock 後端實際收到的資料與請求順序，不只看 UI
  // 全部使用虛構金鑰 test_r5_*／test_r6_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};

  // ── 共用小工具 ──
  const NOTICE = '[data-testid="upgrade-unconfirmed"]';
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
  const pageId = () => page.evaluate(() => window.__shenmaPageId);
  const setMock = (k, v) => page.evaluate(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v))), [k, v]);
  const syncStatus = () => page.evaluate(() => (document.querySelector("[data-sync-status]") || {}).getAttribute?.("data-sync-status") ?? null);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const teamOf = (p) => (p && p.team ? p.team.map((t) => t.hero_id) : null);
  const heroLv = (p, id = "guan_yu") => ((p && p.heroes) || []).find((h) => h.hero_id === id)?.level ?? 1;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const profile = (nickname, team = ["guan_yu", "zhao_yun"]) => ({
    nickname, level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_7", heroes: [],
    team: team.map((hero_id, i) => ({ hero_id, slot: i + 1 })),
  });
  // 全新狀態進入遊戲（mock 後端只有這一個存檔）
  const boot = async (key, prof) => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", { profiles: { [key]: prof }, battle_logs: [] });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), key);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
  };
  // 用隊伍 Modal 改隊伍（產生一次本機修改）：兩人時移除趙雲；一人時換成另一位
  const changeTeam = async () => {
    const team = teamOf(await session()) || [];
    const clicks = team.length > 1 ? ["趙雲"] : team[0] === "guan_yu" ? ["關羽", "趙雲"] : ["趙雲", "關羽"];
    await H.clickButton(page, "隊伍");
    await page.waitForSelector("text=儲存隊伍");
    for (const name of clicks) await page.locator('div[class*="modalPanel"]').getByText(name).first().click();
    await H.clickButton(page, "儲存隊伍");
    await H.clickButton(page, "關閉");
  };
  // 在武將 Modal 對關羽按升級（不等結果）
  const startUpgrade = async () => {
    await H.clickButton(page, "武將");
    await page.locator('div[class*="heroName"]', { hasText: "關羽" }).first().click();
    await page.getByRole("button", { name: /^升級 \(-\d+ 點\)$/ }).click();
  };
  const closeModals = async () => {
    for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
      await page.locator('button[class*="modalClose"]').last().click();
      await H.sleep(300);
    }
  };
  const waitHeld = (action) =>
    page.waitForFunction((a) => window.__shenmaMock.pending(a).length > 0, action, { timeout: 30000, polling: 100 });
  const noticeText = async () => ((await page.locator(NOTICE).count()) ? (await page.locator(NOTICE).innerText()).replace(/\s+/g, " ") : null);
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r5-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await closeModals(); } catch { /* 沒有 Modal 可關 */ }
    }
  };

  // ── A. C1：升級已在伺服器完成、回應遺失，本機又改了隊伍 → 重新整理 ──
  await section("A", async () => {
    const KEY = "test_r5_c1";
    await boot(KEY, profile("C1 玩家"));
    const t0 = Date.now();
    await page.evaluate(() => window.__shenmaMock.hold("upgrade_hero"));
    await startUpgrade();
    await waitHeld("upgrade_hero");
    const inflight = await session();
    run.check("A-1 送出升級前，待確認紀錄已寫進 session（in_flight，含送出前的資料）",
      inflight?.pendingUpgrade?.hero_id === "guan_yu" && inflight.pendingUpgrade.state === "in_flight" && inflight.pendingUpgrade.base?.gold === 1000,
      inflight?.pendingUpgrade && { hero: inflight.pendingUpgrade.hero_id, state: inflight.pendingUpgrade.state, baseGold: inflight.pendingUpgrade.base?.gold });
    // 伺服器完成升級，但回應送不回頁面
    await page.evaluate(() => window.__shenmaMock.release("upgrade_hero", "lost"));
    await waitLog((e) => e.action === "upgrade_hero" && e.responseLost === true, t0);
    await closeModals();
    await changeTeam();
    const before = await session();
    const d0 = await db();
    run.check("A-2 前置：後端已升級（Lv2、900），本機仍是升級前的武將與點數＋隊伍修改",
      heroLv(d0.profiles[KEY]) === 2 && d0.profiles[KEY].gold === 900 && heroLv(before) === 1 && before.gold === 1000 && !same(teamOf(before), teamOf(d0.profiles[KEY])),
      { backend: { lv: heroLv(d0.profiles[KEY]), gold: d0.profiles[KEY].gold }, local: { lv: heroLv(before), gold: before.gold, team: teamOf(before) } });
    const oldPage = await pageId();
    const tReload = Date.now();
    await page.reload();
    await H.waitHud(page);
    await waitSync("idle");
    const logs = await since(tReload, null, KEY);
    const d = await db();
    const sess = await session();
    const firstGet = logs.findIndex((e) => e.action === "get_profile");
    const firstSave = logs.findIndex((e) => e.action === "save_profile");
    run.check("A-3 重新整理後：後端保有升級與扣款，隊伍修改也已寫入",
      heroLv(d.profiles[KEY]) === 2 && d.profiles[KEY].gold === 900 && same(teamOf(d.profiles[KEY]), teamOf(before)),
      { lv: heroLv(d.profiles[KEY]), gold: d.profiles[KEY].gold, team: teamOf(d.profiles[KEY]) });
    run.check("A-4 請求順序：先讀取伺服器再保存；沒有重播 upgrade_hero；舊頁面卸載時沒有送出保存",
      firstGet >= 0 && firstSave > firstGet && !logs.some((e) => e.action === "upgrade_hero") && !logs.some((e) => e.page === oldPage && e.action === "save_profile"),
      logs.map((e) => `${e.action}@${e.page === oldPage ? "old" : "new"}${e.saved ? ` ${e.saved.heroes.join(",")}/${e.saved.gold}` : ""}`));
    run.check("A-5 已確認成功：UI 與 session 都是 idle，待確認紀錄清除，本機武將 Lv2、點數 900，沒有待確認提示",
      (await syncStatus()) === "idle" && sess?.syncStatus === "idle" && !sess?.pendingUpgrade && heroLv(sess) === 2 && sess.gold === 900 && (await page.locator(NOTICE).count()) === 0,
      { ui: await syncStatus(), session: sess?.syncStatus, pendingUpgrade: sess?.pendingUpgrade ?? null });
    out.A = { requests: logs.map((e) => ({ action: e.action, page: e.page === oldPage ? "old" : "new", saved: e.saved })), shot: await H.shot(page, "r5-a-c1-recovered") };
  });

  // ── B. 升級請求沒到伺服器就重新整理 → 待確認；之後伺服器才完成 → 重新確認後採用 ──
  await section("B", async () => {
    const KEY = "test_r5_u1";
    await boot(KEY, profile("U1 玩家"));
    await page.evaluate(() => window.__shenmaMock.hold("upgrade_hero"));
    await startUpgrade();
    await waitHeld("upgrade_hero");
    await closeModals();
    await changeTeam();
    const before = await session();
    const tReload = Date.now();
    await page.reload(); // 暫停中的升級請求隨頁面消失：伺服器沒有收到
    const notice = page.locator(NOTICE);
    await notice.waitFor({ timeout: 120000 });
    await waitSync("unconfirmed");
    await waitLog((e) => e.action === "get_profile" && e.key === "test_r5_u1", tReload);
    await H.sleep(1500);
    const sess = await session();
    const d = await db();
    const text1 = await noticeText();
    run.check("B-1 結果不明：顯示待確認提示（只有重新確認），不保存，本機隊伍與待確認紀錄保留",
      /關羽的升級結果待確認/.test(text1 || "") && /重新確認/.test(text1) && (await notice.getByRole("button").count()) === 1 &&
        (await since(tReload, "save_profile", KEY)).length === 0 &&
        same(teamOf(sess), teamOf(before)) && sess?.pendingUpgrade?.state === "unknown" && sess?.syncStatus === "unconfirmed" &&
        !same(teamOf(d.profiles[KEY]), teamOf(before)),
      { text: text1, session: { team: teamOf(sess), pendingUpgrade: sess?.pendingUpgrade?.state, status: sess?.syncStatus }, backendTeam: teamOf(d.profiles[KEY]) });
    const shotNotice = await H.shot(page, "r5-b1-unconfirmed-notice");
    await notice.getByRole("button", { name: "重新確認" }).click();
    await page.waitForFunction((sel) => /還看不到這次升級/.test((document.querySelector(sel) || {}).innerText || ""), NOTICE, { timeout: 30000 });
    run.check("B-2 伺服器上仍看不到升級：重新確認後維持待確認並說明，仍不保存",
      (await syncStatus()) === "unconfirmed" && (await since(tReload, "save_profile", KEY)).length === 0, await noticeText());
    const shotStill = await H.shot(page, "r5-b2-still-unconfirmed");
    // 模擬舊請求之後才在伺服器完成：直接修改 mock 資料庫（關羽 Lv2、扣 100 點）
    await page.evaluate((k) => {
      const db = JSON.parse(localStorage.getItem("__shenma_mock_gas_db"));
      const p = db.profiles[k];
      p.gold -= 100;
      p.heroes = [...p.heroes.filter((h) => h.hero_id !== "guan_yu"), { hero_id: "guan_yu", level: 2, star: 0, atk: 160, def: 128, hp: 1600 }];
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify(db));
    }, KEY);
    await notice.getByRole("button", { name: "重新確認" }).click();
    await waitSync("idle");
    const d2 = await db();
    const sess2 = await session();
    run.check("B-3 伺服器完成後重新確認：採用升級（Lv2、900）並保存隊伍修改，提示消失、狀態 idle",
      heroLv(d2.profiles[KEY]) === 2 && d2.profiles[KEY].gold === 900 && same(teamOf(d2.profiles[KEY]), teamOf(before)) &&
        (await page.locator(NOTICE).count()) === 0 && !sess2?.pendingUpgrade && heroLv(sess2) === 2 && sess2.gold === 900,
      { lv: heroLv(d2.profiles[KEY]), gold: d2.profiles[KEY].gold, team: teamOf(d2.profiles[KEY]) });
    run.check("B-4 整段恢復沒有重播 upgrade_hero", (await since(tReload, "upgrade_hero")).length === 0);
    out.B = { shots: [shotNotice, shotStill, await H.shot(page, "r5-b3-confirmed")] };
  });

  // ── C. C4（Round 6 規則）：升級網路錯誤、後端還沒處理 → 沒有強制解除保護的入口；等升級晚到再確認 ──
  await section("C", async () => {
    const KEY = "test_r5_u2";
    await boot(KEY, profile("U2 玩家"));
    await page.evaluate(() => window.__shenmaMock.hold("upgrade_hero"));
    await startUpgrade();
    await waitHeld("upgrade_hero");
    await page.evaluate(() => window.__shenmaMock.release("upgrade_hero", "network")); // 網路錯誤：後端沒有處理
    const tAfter = Date.now();
    const notice = page.locator(NOTICE);
    await notice.waitFor({ timeout: 30000 });
    const modalText = (await page.locator('div[class*="modalPanel"]').last().innerText()).replace(/\s+/g, " ");
    await closeModals();
    // 待確認期間 HUD 仍要能操作：提示在畫面底部，不能蓋住上方的「武將」「隊伍」等按鈕
    const layout = await page.evaluate((sel) => {
      const n = document.querySelector(sel).getBoundingClientRect();
      const btn = [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "隊伍").getBoundingClientRect();
      return { noticeTop: Math.round(n.top), noticeBottom: Math.round(n.bottom), viewport: window.innerHeight, teamBtnBottom: Math.round(btn.bottom) };
    }, NOTICE);
    await changeTeam(); // 按得到「隊伍」才會成功
    run.check("C-0 待確認提示固定在畫面底部，沒有蓋住 HUD；待確認期間仍可修改隊伍",
      layout.noticeBottom === layout.viewport && layout.noticeTop > layout.teamBtnBottom, layout);
    const before = await session();
    await H.sleep(36000); // 超過 30 秒 debounce
    const text = await noticeText();
    const saves = await since(tAfter, "save_profile", KEY);
    const d = await db();
    run.check("C-1 升級回應網路錯誤：升級畫面說明結果待確認；下方提示只有「重新確認」，沒有強制解除的入口；超過 debounce 也沒有保存",
      /無法確定升級是否完成/.test(modalText) && (await notice.getByRole("button").count()) === 1 && !/以雲端資料為準/.test(text || "") &&
        saves.length === 0 && before?.pendingUpgrade?.state === "unknown" && !same(teamOf(d.profiles[KEY]), teamOf(before)),
      { modalText: modalText.slice(0, 160), notice: text, saves: saves.length, backendTeam: teamOf(d.profiles[KEY]), localTeam: teamOf(before) });
    const shotWait = await H.shot(page, "r6-c1-waiting-no-override");
    await page.reload();
    await notice.waitFor({ timeout: 120000 });
    await waitSync("unconfirmed");
    await H.sleep(1500);
    const sess = await session();
    run.check("C-2 重新整理後仍待確認：本機隊伍與紀錄保留，沒有保存",
      sess?.syncStatus === "unconfirmed" && same(teamOf(sess), teamOf(before)) && sess?.pendingUpgrade?.hero_id === "guan_yu" &&
        (await since(tAfter, "save_profile", KEY)).length === 0,
      { status: sess?.syncStatus, team: teamOf(sess) });
    // 原升級這時才被後端處理：直接修改 mock 資料庫（關羽 Lv2、扣 100 點）
    await page.evaluate((k) => {
      const db = JSON.parse(localStorage.getItem("__shenma_mock_gas_db"));
      const p = db.profiles[k];
      p.gold -= 100;
      p.heroes = [...p.heroes.filter((h) => h.hero_id !== "guan_yu"), { hero_id: "guan_yu", level: 2, star: 0, atk: 160, def: 128, hp: 1600 }];
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify(db));
    }, KEY);
    await notice.getByRole("button", { name: "重新確認" }).click();
    await waitSync("idle");
    const d2 = await db();
    const sess2 = await session();
    run.check("C-3 升級晚到後重新確認：後端與本機都保有升級（Lv2、900）與隊伍修改，提示消失",
      heroLv(d2.profiles[KEY]) === 2 && d2.profiles[KEY].gold === 900 && same(teamOf(d2.profiles[KEY]), teamOf(before)) &&
        heroLv(sess2) === 2 && sess2.gold === 900 && !sess2?.pendingUpgrade && (await page.locator(NOTICE).count()) === 0,
      { lv: heroLv(d2.profiles[KEY]), gold: d2.profiles[KEY].gold, team: teamOf(d2.profiles[KEY]) });
    run.check("C-4 整段沒有重播 upgrade_hero", (await since(tAfter, "upgrade_hero")).length === 0);
    out.C = { shots: [shotWait, await H.shot(page, "r6-c3-confirmed-after-late-upgrade")] };
  });

  // ── D. 同一頁：升級回應持有超過 30 秒 debounce，不能先送過時的 heroes／gold ──
  await section("D", async () => {
    const KEY = "test_r5_hold";
    await boot(KEY, profile("D 玩家"));
    await page.evaluate(() => window.__shenmaMock.hold("upgrade_hero"));
    await startUpgrade();
    await waitHeld("upgrade_hero");
    await closeModals();
    const t0 = Date.now();
    await changeTeam();
    const edited = await session();
    await H.sleep(36000); // 超過 30 秒 debounce
    const early = await since(t0, "save_profile", KEY);
    run.check("D-1 升級回應未到、debounce 已到期：沒有送出 save_profile", early.length === 0, early.map((e) => e.saved));
    await page.evaluate(() => window.__shenmaMock.release("upgrade_hero", "ok"));
    await waitSync("idle");
    const d = await db();
    const saves = await since(t0, "save_profile", KEY);
    run.check("D-2 升級回應後才保存：每次 save_profile 都含 Lv2 與扣款後的點數，後端有隊伍修改",
      saves.length >= 1 && saves.every((e) => e.saved.heroes.includes("guan_yu:2") && e.saved.gold === 900) &&
        heroLv(d.profiles[KEY]) === 2 && d.profiles[KEY].gold === 900 && same(teamOf(d.profiles[KEY]), teamOf(edited)),
      saves.map((e) => e.saved));
    out.D = { shot: await H.shot(page, "r5-d-after-upgrade") };
  });

  // ── E. 普通 Pending 重新整理：卸載不再盲寫，由恢復流程補送 ──
  await section("E", async () => {
    const KEY = "test_r5_pending";
    await boot(KEY, profile("E 玩家"));
    const tChange = Date.now();
    await changeTeam();
    const pending = await session();
    const oldPage = await pageId();
    await page.reload();
    await H.waitHud(page);
    await waitSync("idle");
    const saves = await since(tChange, "save_profile", KEY);
    const d = await db();
    run.check("E-1 卸載時沒有送出保存：舊頁面 0 次、沒有 keepalive 請求",
      pending?.syncStatus === "pending" && saves.filter((e) => e.page === oldPage).length === 0 && saves.every((e) => !e.keepalive),
      saves.map((e) => ({ page: e.page === oldPage ? "old" : "new", keepalive: e.keepalive })));
    run.check("E-2 重新整理後不操作也會補送：後端收到最新隊伍，UI 與 session 都是 idle",
      saves.length >= 1 && same(teamOf(d.profiles[KEY]), teamOf(pending)) && (await syncStatus()) === "idle" && (await session())?.syncStatus === "idle",
      { backend: teamOf(d.profiles[KEY]), pending: teamOf(pending) });
    out.E = { shot: await H.shot(page, "r5-e-pending-restored") };
  });

  // ── F. C3：重新整理時送出的背景讀取（升級前的資料）停住；升級確認完成後它才回來 ──
  await section("F", async () => {
    const KEY = "test_r6_c3";
    await boot(KEY, profile("C3 玩家"));
    await setMock("__shenma_mock_hold", ["get_profile"]); // 下一次載入頁面時先暫停 get_profile
    const tReload = Date.now();
    await page.reload(); // 有 session：先載入 session，再送出背景讀取（被暫停）
    await H.waitHud(page);
    await waitHeld("get_profile");
    await setMock("__shenma_mock_hold", null);
    await page.evaluate(() => window.__shenmaMock.unhold("get_profile"));
    await page.evaluate(() => window.__shenmaMock.hold("upgrade_hero"));
    await startUpgrade();
    await waitHeld("upgrade_hero");
    await page.evaluate(() => window.__shenmaMock.release("upgrade_hero", "applied-network")); // 後端完成，頁面收到網路錯誤
    await closeModals();
    // 自動重新確認讀到升級（沒有本機修改：直接採用，不保存）
    await page.waitForFunction(() => {
      const p = JSON.parse(sessionStorage.getItem("shenma_player_state") || "null");
      return p && p.syncStatus === "idle" && !p.pendingUpgrade && (p.heroes || []).some((h) => h.hero_id === "guan_yu" && h.level === 2);
    }, null, { timeout: 60000, polling: 100 });
    const confirmed = await session();
    run.check("F-1 前置：重新確認看到升級（Lv2、900），沒有本機修改所以沒有保存；舊的背景讀取仍停著",
      heroLv(confirmed) === 2 && confirmed.gold === 900 && (await since(tReload, "save_profile", KEY)).length === 0 &&
        (await page.evaluate(() => window.__shenmaMock.pending("get_profile").length)) === 1,
      { lv: heroLv(confirmed), gold: confirmed.gold });
    // 較早送出的背景讀取這時才回來，內容是送出當下（升級前）的資料
    const tStale = Date.now();
    await page.evaluate(() => window.__shenmaMock.release("get_profile", "stale"));
    await waitLog((e) => e.action === "get_profile" && e.stale === true, tStale);
    await H.sleep(1500);
    const afterStale = await session();
    run.check("F-2 舊的背景讀取晚到：本機與 session 都不會被還原成升級前，狀態仍是 idle",
      heroLv(afterStale) === 2 && afterStale.gold === 900 && (await syncStatus()) === "idle",
      { lv: heroLv(afterStale), gold: afterStale.gold, ui: await syncStatus() });
    const tEdit = Date.now();
    await changeTeam();
    const edited = await session();
    await waitLog((e) => e.action === "save_profile" && e.key === "test_r6_c3", tEdit, 60000);
    await waitSync("idle");
    const d = await db();
    const saves = await since(tEdit, "save_profile", KEY);
    run.check("F-3 之後修改隊伍並保存：後端保有升級與扣款，也有隊伍修改",
      heroLv(d.profiles[KEY]) === 2 && d.profiles[KEY].gold === 900 && same(teamOf(d.profiles[KEY]), teamOf(edited)) &&
        saves.every((e) => e.saved.heroes.includes("guan_yu:2") && e.saved.gold === 900),
      { backend: { lv: heroLv(d.profiles[KEY]), gold: d.profiles[KEY].gold, team: teamOf(d.profiles[KEY]) }, saves: saves.map((e) => e.saved) });
    out.F = { shot: await H.shot(page, "r6-f-stale-read-ignored") };
  });

  return run.finish({ out });
}
