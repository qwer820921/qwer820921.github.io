async (page) => {
  // R7（瀏覽器）：手動同步（玩家資訊的「強制從雲端同步」）的讀取被持有 → 關閉資訊視窗 →
  // 升級、回應遺失、自動重新確認 → 放回手動同步的舊回應（C5）。UI、session 與 mock 後端要一致。
  // 回應順序用 mock 的 hold／release 控制；全部使用虛構金鑰 test_r7_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};

  // ── 共用小工具 ──
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
  const boot = async (key, prof) => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", { profiles: { [key]: prof }, battle_logs: [] });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), key);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
  };
  const changeTeam = async () => {
    const team = teamOf(await session()) || [];
    const clicks = team.length > 1 ? ["趙雲"] : team[0] === "guan_yu" ? ["關羽", "趙雲"] : ["趙雲", "關羽"];
    await H.clickButton(page, "隊伍");
    await page.waitForSelector("text=儲存隊伍");
    for (const name of clicks) await page.locator('div[class*="modalPanel"]').getByText(name).first().click();
    await H.clickButton(page, "儲存隊伍");
    await H.clickButton(page, "關閉");
  };
  const openHeroDetail = async () => {
    await H.clickButton(page, "武將");
    await page.locator('div[class*="heroName"]', { hasText: "關羽" }).first().click();
  };
  const closeModals = async () => {
    for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
      await page.locator('button[class*="modalClose"]').last().click();
      await H.sleep(300);
    }
  };
  // UI 上看到的關羽等級（武將詳細資料）
  const heroLvInUi = async () => {
    await openHeroDetail();
    const text = (await page.locator('div[class*="modalPanel"]').last().innerText()).replace(/\s+/g, " ");
    await closeModals();
    const m = text.match(/Lv\.?\s*(\d+)/);
    return m ? Number(m[1]) : null;
  };
  const waitHeld = (action) =>
    page.waitForFunction((a) => window.__shenmaMock.pending(a).length > 0, action, { timeout: 30000, polling: 100 });
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r7-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await closeModals(); } catch { /* 沒有 Modal 可關 */ }
    }
  };

  // ── G. C5：手動同步的舊讀取在升級確認之後才回來 ──
  await section("G", async () => {
    const KEY = "test_r7_c5";
    await boot(KEY, profile("C5 玩家"));
    // 1. 開啟玩家資訊，按「強制從雲端同步」，讓它的 get_profile 停住（之後的 get_profile 照常回應）
    await page.locator('button[class*="hudAvatar"]').click();
    await page.waitForSelector("text=玩家資訊");
    await page.evaluate(() => window.__shenmaMock.hold("get_profile"));
    const tSync = Date.now();
    await page.getByRole("button", { name: /強制從雲端同步/ }).click();
    await waitHeld("get_profile");
    await page.evaluate(() => window.__shenmaMock.unhold("get_profile"));
    // 2. 記錄實際 UI：同步進行中能不能關閉玩家資訊、開始升級
    const closeEnabled = await page.locator('button[class*="modalClose"]').first().isEnabled();
    await closeModals();
    const infoClosed = (await page.locator("text=玩家資訊").count()) === 0;
    await page.evaluate(() => window.__shenmaMock.hold("upgrade_hero"));
    await openHeroDetail();
    const upgradeBtn = page.getByRole("button", { name: /^升級 \(-\d+ 點\)$/ });
    const upgradeEnabled = await upgradeBtn.isEnabled();
    run.check("G-0（記錄實際 UI）手動同步進行中：玩家資訊視窗可以關閉，武將升級按鈕也可以按",
      closeEnabled && infoClosed && upgradeEnabled, { closeEnabled, infoClosed, upgradeEnabled });
    // 3. 升級：後端完成，頁面收到網路錯誤 → 自動重新確認
    await upgradeBtn.click();
    await waitHeld("upgrade_hero");
    await page.evaluate(() => window.__shenmaMock.release("upgrade_hero", "applied-network"));
    await closeModals();
    await page.waitForFunction(() => {
      const p = JSON.parse(sessionStorage.getItem("shenma_player_state") || "null");
      return p && p.syncStatus === "idle" && !p.pendingUpgrade && (p.heroes || []).some((h) => h.hero_id === "guan_yu" && h.level === 2);
    }, null, { timeout: 60000, polling: 100 });
    const confirmed = await session();
    run.check("G-1 前置：自動重新確認看到升級（Lv2、900），沒有保存；手動同步的讀取仍停著",
      heroLv(confirmed) === 2 && confirmed.gold === 900 && (await since(tSync, "save_profile", KEY)).length === 0 &&
        (await page.evaluate(() => window.__shenmaMock.pending("get_profile").length)) === 1,
      { lv: heroLv(confirmed), gold: confirmed.gold });
    // 4. 放回手動同步的回應：內容是送出當下（升級前）的資料
    const tStale = Date.now();
    await page.evaluate(() => window.__shenmaMock.release("get_profile", "stale"));
    await waitLog((e) => e.action === "get_profile" && e.stale === true, tStale);
    await H.sleep(1500);
    const after = await session();
    const uiLv = await heroLvInUi();
    run.check("G-2 手動同步的舊讀取晚到：UI（武將 Lv）、session 都保有升級，狀態 idle，沒有保存",
      heroLv(after) === 2 && after.gold === 900 && uiLv === 2 && (await syncStatus()) === "idle" &&
        (await since(tSync, "save_profile", KEY)).length === 0,
      { session: { lv: heroLv(after), gold: after.gold }, uiLv, ui: await syncStatus() });
    // 5. 之後修改隊伍並保存
    const tEdit = Date.now();
    await changeTeam();
    const edited = await session();
    await waitLog((e) => e.action === "save_profile" && e.key === "test_r7_c5", tEdit, 60000);
    await waitSync("idle");
    const d = await db();
    const saves = await since(tEdit, "save_profile", KEY);
    const final = await session();
    run.check("G-3 之後修改隊伍並保存：後端保有升級與扣款，也有隊伍修改；UI、session、後端一致",
      heroLv(d.profiles[KEY]) === 2 && d.profiles[KEY].gold === 900 && same(teamOf(d.profiles[KEY]), teamOf(edited)) &&
        saves.every((e) => e.saved.heroes.includes("guan_yu:2") && e.saved.gold === 900) &&
        heroLv(final) === 2 && final.gold === 900 && same(teamOf(final), teamOf(d.profiles[KEY])),
      { backend: { lv: heroLv(d.profiles[KEY]), gold: d.profiles[KEY].gold, team: teamOf(d.profiles[KEY]) }, saves: saves.map((e) => e.saved) });
    out.G = { shot: await H.shot(page, "r7-g-stale-manual-sync-ignored") };
  });

  return run.finish({ out });
}
