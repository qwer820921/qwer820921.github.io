async (page) => {
  // 戰場的玩法提示（瀏覽器，真 Godot 產物、mock 後端）：主頁與獨立戰鬥頁
  // - BT-1／BT-2 主頁桌面 1280×800 與 390×844：還沒選過時，展開也不會縮小遊戲畫面就預設展開；放在戰場旁邊（桌面固定在視窗左下角、390 接在戰場下方），
  //   和遊戲畫面不重疊、不擋住 HUD 的按鈕、沒有橫向溢出；出現時不搶焦點；內容提到部署武將、戰場金幣建造與升級防禦塔、迎戰與城防，
  //   並分開說明戰場金幣與存檔的戰場點數
  // - BT-3 鍵盤：HUD 的「玩法提示」開關（aria-expanded、aria-controls）用 Enter 收起與展開；提示裡的「收起」按下後焦點交給開關
  // - BT-4 記住收起（本機）：重新整理與換到獨立戰鬥頁都維持收起；在獨立戰鬥頁展開後回主頁也是展開
  // - BT-2b 矮的畫面（主頁 375×667、740×360，獨立戰鬥頁 375×740）還沒選過時預設收起（遊戲畫面維持原本的大小）；主頁 375×667 手動展開後接在下方、不重疊、讓出 HUD
  // - BT-5 獨立戰鬥頁桌面與 390：位置、不重疊、頂部的開關（圖示，名稱「玩法提示」）；從開關往後按 Tab 先到提示的「收起」（不會先進到遊戲畫面）
  // - BT-6 戰鬥中收起與展開：不暫停、不改倍率、同一場；整段沒有任何後端請求
  // - BT-7 結算時不顯示提示
  // 全部 mock、虛構金鑰 test_bt_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const KEY = "test_bt_a";
  const MAIN = H.BASE + "/shenmaSanguo";
  const IFRAME_MAIN = 'iframe[title="Shenma Sanguo"]';
  const IFRAME_BATTLE = 'iframe[title="Shenma Sanguo Battle"]';
  const profile = {
    nickname: "提示玩家", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter1_7",
    heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
  };
  profile.max_stage = "chapter1_4"; // 主頁一開始就是「Mock W 勝利兩波」（兩波就結算，沒有缺設定的敵人）

  // ── 輔助 ──
  const tips = (iframeSel) =>
    page.evaluate((iframeSel) => {
      const p = document.querySelector('[data-testid="battle-tips"]');
      const t = document.querySelector('[data-testid="battle-tips-toggle"]');
      const f = document.querySelector(iframeSel);
      const r = (el) => {
        if (!el) return null;
        const b = el.getBoundingClientRect();
        return { left: Math.round(b.left), top: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom) };
      };
      const pr = p && !p.hidden ? r(p) : null;
      const fr = r(f);
      const overlap = !!(pr && fr && pr.left < fr.right && pr.right > fr.left && pr.top < fr.bottom && pr.bottom > fr.top);
      // HUD／頂部的按鈕中心點最上層是不是按鈕本身（沒有被提示蓋住）
      const btns = [...document.querySelectorAll("button")].filter((b) => /^(迎戰|戰鬥中|自動|武將|隊伍|自動 (ON|OFF))$/.test(b.innerText.trim()) && b.checkVisibility());
      const covered = btns.filter((b) => {
        const x = b.getBoundingClientRect();
        const top = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
        return !(top && (top === b || b.contains(top)));
      }).map((b) => b.innerText.trim());
      // 主頁的 HUD（頂欄＋按鈕列）下緣：遊戲畫面不能被它蓋住（獨立戰鬥頁的頂部不是疊加層，這裡是 null）
      const bar = document.querySelector('[class*="hudActionBar"]');
      const hudBottom = bar ? Math.round(bar.getBoundingClientRect().bottom) : null;
      return {
        hudBottom,
        exists: !!p,
        shown: !!(p && !p.hidden && p.checkVisibility()),
        placement: p ? p.getAttribute("data-placement") : null,
        rect: pr,
        frame: fr,
        overlap,
        inViewport: !!(pr && pr.bottom <= window.innerHeight && pr.right <= window.innerWidth && pr.left >= 0),
        text: p ? p.innerText : "",
        label: p ? p.getAttribute("aria-label") : null,
        toggle: t ? { expanded: t.getAttribute("aria-expanded"), controls: t.getAttribute("aria-controls"), name: t.getAttribute("aria-label"), text: t.innerText.trim() } : null,
        controlsOk: !!(t && p && t.getAttribute("aria-controls") === p.id),
        covered,
        focusInTips: !!(p && p.contains(document.activeElement)),
        active: document.activeElement ? (document.activeElement.getAttribute("aria-label") || document.activeElement.innerText || document.activeElement.tagName).trim().slice(0, 30) : null,
        stored: localStorage.getItem("shenma_battle_tips"),
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    }, iframeSel);
  const contentOk = (t) =>
    /道路或建築位/.test(t) && /武將/.test(t) && /戰場金幣建造防禦塔/.test(t) && /升級/.test(t) && /迎戰/.test(t) && /城防/.test(t) && /戰場點數/.test(t) && !/三星|一定/.test(t);
  const focusAt = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      return { name: a ? (a.getAttribute("aria-label") || a.innerText || "").trim().slice(0, 30) : null, testid: a?.getAttribute?.("data-testid") ?? null, body: a === document.body };
    });
  const press = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(150);
  };
  const tabUntil = async (pred, max = 40, shift = false) => {
    for (let i = 1; i <= max; i++) {
      await press(shift ? "Shift+Tab" : "Tab");
      const f = await focusAt();
      if (pred(f)) return { f, n: i };
    }
    return { f: await focusAt(), n: -1 };
  };
  const tabTo = async (pred) => {
    const a = await tabUntil(pred, 40);
    return a.n > 0 ? a : tabUntil(pred, 60, true);
  };
  const waitPrep = async (idx) => H.waitBridge(page, idx, { type: "update_stats", game_state: 1 }, 120000);
  const gasCount = async () => (await H.gasLog(page)).length;

  try {
    // ── 準備：第一次進入（沒有偏好紀錄）──
    await page.setViewportSize({ width: 1280, height: 800 });
    await H.resetOrigin(page);
    await page.evaluate(({ key, profile }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [key]: profile }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", key);
    }, { key: KEY, profile });
    await page.goto(MAIN);
    await H.waitHud(page);
    await waitPrep(0);
    await H.sleep(800);
    const b1 = await tips(IFRAME_MAIN);
    await H.shot(page, "battle-tips-main-desktop");
    run.check("BT-1 主頁桌面：第一次進入展開、固定在視窗左下角（side，遊戲畫面左邊的空間），和遊戲畫面不重疊、在視窗內、不擋 HUD 的按鈕；開關 aria-expanded=true 並指向提示；出現時焦點不在提示裡",
      b1.shown && b1.placement === "side" && !b1.overlap && b1.inViewport && b1.covered.length === 0 && b1.toggle?.expanded === "true" && b1.controlsOk &&
        b1.toggle?.name === "玩法提示" && b1.label === "玩法提示" && !b1.focusInTips && !b1.overflow,
      b1);
    run.check("BT-1b 內容：部署武將（道路或建築位）、用這一場的戰場金幣建造與升級防禦塔、「迎戰」與城防；分開說明存檔的戰場點數；沒有「一定三星」之類的保證",
      contentOk(b1.text), { text: b1.text.replace(/\s+/g, " ").slice(0, 300) });

    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(800);
    const b2 = await tips(IFRAME_MAIN);
    await H.shot(page, "battle-tips-main-390");
    run.check("BT-2 主頁 390×844：預設展開、接在戰場下方（below），和遊戲畫面不重疊、在視窗內、不擋 HUD 的按鈕、沒有橫向溢出；遊戲畫面讓出 HUD 的高度（上緣不在 HUD 下面）、寬度維持 390",
      b2.shown && b2.placement === "below" && !b2.overlap && b2.inViewport && b2.covered.length === 0 && !b2.overflow && b2.hudBottom !== null && b2.frame.top >= b2.hudBottom &&
        b2.frame.right - b2.frame.left >= 389,
      b2);
    // 矮的畫面：還沒選過時預設收起，遊戲畫面維持原本的大小
    const short = [];
    for (const [w, h] of [[375, 667], [740, 360]]) {
      await page.setViewportSize({ width: w, height: h });
      await H.sleep(800);
      short.push({ size: `${w}x${h}`, ...(await tips(IFRAME_MAIN)) });
    }
    await page.setViewportSize({ width: 375, height: 667 });
    await H.sleep(600);
    await page.locator('[data-testid="battle-tips-toggle"]').click();
    await H.sleep(800);
    const b2s = await tips(IFRAME_MAIN);
    await H.shot(page, "battle-tips-main-375x667-opened");
    run.check("BT-2b 主頁 375×667 與 740×360 還沒選過：預設收起（開關 aria-expanded=false、沒有選擇紀錄）；375×667 手動展開後接在下方、不重疊、在視窗內、不擋 HUD、遊戲畫面讓出 HUD 的高度",
      short.every((b) => !b.shown && b.toggle?.expanded === "false" && b.stored === null) &&
        b2s.shown && b2s.placement === "below" && !b2s.overlap && b2s.inViewport && b2s.covered.length === 0 && !b2s.overflow && b2s.frame.top >= b2s.hudBottom && b2s.stored === "open",
      { short: short.map((b) => ({ size: b.size, shown: b.shown, expanded: b.toggle?.expanded, stored: b.stored, frame: b.frame })), b2s });

    // ── BT-3 鍵盤 ──
    await page.setViewportSize({ width: 1280, height: 800 });
    await H.sleep(500);
    const g0 = await gasCount();
    await page.locator('[class*="hudMapName"]').click();
    await H.sleep(150);
    const t3 = await tabTo((f) => f.name === "玩法提示" && f.testid === "battle-tips-toggle");
    await press("Enter");
    await H.sleep(250);
    const c3 = await tips(IFRAME_MAIN);
    const f3 = await focusAt();
    await press("Enter");
    await H.sleep(250);
    const o3 = await tips(IFRAME_MAIN);
    const t3b = await tabUntil((f) => f.testid === "battle-tips-collapse", 30);
    await press("Enter");
    await H.sleep(300);
    const c3b = await tips(IFRAME_MAIN);
    const f3b = await focusAt();
    run.check("BT-3 Tab 走到 HUD 的「玩法提示」：Enter 收起（aria-expanded=false、提示隱藏、焦點留在開關）、再 Enter 展開；從開關往後按 Tab 到提示的「收起」，按下後提示隱藏、焦點交給開關（不是 body）",
      t3.n > 0 && !c3.shown && c3.toggle?.expanded === "false" && f3.testid === "battle-tips-toggle" && o3.shown && o3.toggle?.expanded === "true" &&
        t3b.n > 0 && !c3b.shown && f3b.testid === "battle-tips-toggle" && !f3b.body && c3b.stored === "closed",
      { c3: c3.toggle, f3, o3: o3.toggle, f3b, stored: c3b.stored });

    // ── BT-4 記住收起 ──
    await page.reload();
    await H.waitHud(page);
    await waitPrep(0);
    await H.sleep(800);
    const b4 = await tips(IFRAME_MAIN);
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_1");
    await waitPrep(0);
    await H.sleep(800);
    const b4b = await tips(IFRAME_BATTLE);
    await page.locator('[data-testid="battle-tips-toggle"]').click();
    await H.sleep(300);
    const b4c = await tips(IFRAME_BATTLE);
    run.check("BT-4 收起後重新整理仍收起（開關 aria-expanded=false）、換到獨立戰鬥頁也收起；在獨立戰鬥頁展開會記住",
      b4.exists && !b4.shown && b4.toggle?.expanded === "false" && !b4b.shown && b4b.toggle?.expanded === "false" && b4c.shown && b4c.stored === "open",
      { b4: b4.toggle, b4b: b4b.toggle, b4c: { shown: b4c.shown, stored: b4c.stored } });

    // ── BT-5 獨立戰鬥頁 ──
    const b5 = await tips(IFRAME_BATTLE);
    await H.shot(page, "battle-tips-battle-desktop");
    // 從頂部的開關往後按 Tab：先到提示的「收起」
    await page.locator('[data-testid="battle-tips-toggle"]').focus();
    const t5 = await tabUntil((f) => f.testid === "battle-tips-collapse", 12);
    const t5frame = await page.evaluate((sel) => document.activeElement === document.querySelector(sel), IFRAME_BATTLE);
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(800);
    const b5b = await tips(IFRAME_BATTLE);
    await H.shot(page, "battle-tips-battle-390");
    // 獨立戰鬥頁 375×740 還沒選過：預設收起
    await page.evaluate(() => localStorage.removeItem("shenma_battle_tips"));
    await page.setViewportSize({ width: 375, height: 740 });
    await page.reload();
    await waitPrep(0);
    await H.sleep(1000);
    const b5c = await tips(IFRAME_BATTLE);
    await H.shot(page, "battle-tips-battle-375x740-default");
    run.check("BT-5 獨立戰鬥頁：桌面固定在視窗左下角、390 接在戰場下方，都不和遊戲畫面重疊、在視窗內、不擋頂部的按鈕、沒有橫向溢出；頂部的開關是圖示（名稱「玩法提示」）；375×740 還沒選過時預設收起",
      b5.shown && b5.placement === "side" && !b5.overlap && b5.inViewport && b5.covered.length === 0 &&
        b5b.shown && b5b.placement === "below" && !b5b.overlap && b5b.inViewport && b5b.covered.length === 0 && !b5b.overflow &&
        b5.toggle?.name === "玩法提示" && contentOk(b5.text) && t5.n > 0 && !t5frame &&
        !b5c.shown && b5c.toggle?.expanded === "false" && b5c.covered.length === 0 && !b5c.overflow,
      { b5, b5b, tabToCollapse: t5.n, b5c: { shown: b5c.shown, expanded: b5c.toggle?.expanded, covered: b5c.covered } });
    await page.locator('[data-testid="battle-tips-toggle"]').click(); // 之後的步驟從展開開始
    await H.sleep(300);

    // ── BT-6 戰鬥中收起與展開：不暫停、同一場 ──
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(MAIN);
    await H.waitHud(page);
    await waitPrep(0);
    await H.sleep(800);
    // 從展開開始（前面的步驟最後是收起或展開都可以）
    if ((await tips(IFRAME_MAIN)).toggle?.expanded !== "true") await page.locator('[data-testid="battle-tips-toggle"]').click();
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    await H.waitBridge(page, 0, { type: "update_stats", game_state: 2 }, 60000);
    const s0 = await H.snapshot(page);
    const g6 = await gasCount();
    await page.locator('[data-testid="battle-tips-toggle"]').click();
    await H.sleep(300);
    await page.locator('[data-testid="battle-tips-toggle"]').click();
    await H.sleep(1500);
    const s1 = await H.snapshot(page);
    const b6 = await tips(IFRAME_MAIN);
    const g6b = await gasCount();
    run.check("BT-6 戰鬥中收起再展開：仍在戰鬥、沒有暫停、倍率與場次不變、遊戲時間照常前進；切換提示沒有送出任何後端請求",
      b6.shown && s1.game_state === 2 && !s1.world_frozen && s1.time_scale === s0.time_scale && s1.battle_id === s0.battle_id && s1.game_time > s0.game_time &&
        g6b === g6,
      { s0: { gs: s0.game_state, ts: s0.time_scale, id: s0.battle_id, t: s0.game_time }, s1: { gs: s1.game_state, ts: s1.time_scale, frozen: s1.world_frozen, id: s1.battle_id, t: s1.game_time }, shown: b6.shown, gas: [g6, g6b] });
    out.gasDuringToggles = { before: g0, after: g6 };

    // ── BT-7 結算時不顯示（同一場「Mock W 勝利兩波」開自動，打完兩波）──
    await page.getByRole("button", { name: "自動", exact: true }).click();
    await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 180000 });
    await H.sleep(500);
    const b7 = await tips(IFRAME_MAIN);
    await H.shot(page, "battle-tips-result-desktop");
    run.check("BT-7 結算時不顯示玩法提示", !b7.shown, { shown: b7.shown, exists: b7.exists });
  } catch (e) {
    run.check("玩法提示：執行時發生例外", false, String(e).slice(0, 300));
    try { await H.shot(page, "battle-tips-exception"); } catch { /* 截圖失敗不影響判定 */ }
  }

  return run.finish(out);
}
