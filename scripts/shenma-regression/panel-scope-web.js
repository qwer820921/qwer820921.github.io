async (page) => {
  // 單位面板只屬於目前這一場（瀏覽器，真 Godot 產物，主頁）：
  // - P-1：備戰中點選已部署的關羽打開面板，再從 HUD 切換關卡（同一個遊戲 iframe 開新的一場）：舊一場的面板要關閉，不能留著顯示上一場的武將
  // - P-2：換關之後，遊戲 iframe 晚到一則上一場的面板（battle_id 是上一場的）：不顯示
  // - P-3：舊版遊戲的武將面板沒有 battle_id：照舊顯示（相容），關閉後沒有殘留
  // - P-4：這一場的面板（battle_id 相同）照常顯示，關閉後送 deselect_unit
  // 全部虛構資料（harness 的 mock 設定與存檔）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const panelCount = () => page.locator('[data-testid="unit-panel"]').count();
  const panelName = () => page.locator('[data-testid="unit-panel"] [class*="unitName"]').first().innerText().catch(() => "");
  const lastStats = () => page.evaluate(() => (window.__bridgeLog || []).filter((m) => m.type === "update_stats").pop() || null);
  const post = (msg) =>
    page.evaluate(({ sel, msg }) => {
      document.querySelector(sel).contentWindow.eval("window.parent.postMessage(" + JSON.stringify(msg) + ", '*')");
    }, { sel: IFRAME, msg });
  const deployHero = async (c, row, name) => {
    await H.clickCell(page, c, row);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    const tab = page.locator('[data-testid="placement-menu"] button[class*="tabBtn"]', { hasText: "武將" });
    if ((await tab.count()) > 0) await tab.click();
    await page.locator('button[class*="menuCard"]', { hasText: name }).click();
    await H.sleep(700);
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `panel-scope-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };

  await section("P", async () => {
    await H.resetOrigin(page);
    const profile = { nickname: "面板玩家", level: 1, exp: 0, gold: 5000, capacity: 11, max_stage: "chapter1_7", heroes: [],
      team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }] };
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: "test_ps_a", p: profile });
    await page.setViewportSize({ width: 540, height: 900 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.selectStage(page, "Mock B 對照關");
    await H.dismissSplash(page);
    const first = await lastStats();
    await deployHero(3, 5, "關羽");
    await H.clickCell(page, 3, 5);
    await page.waitForSelector('[data-testid="unit-panel"]', { timeout: 15000 });
    const open1 = { count: await panelCount(), name: await panelName() };
    // 備戰中從 HUD 切換關卡（同一個遊戲 iframe 開新的一場）
    await H.selectStage(page, "Mock A 慢速出兵");
    await H.sleep(1200);
    const second = await lastStats();
    const after1 = { count: await panelCount(), name: await panelName(), shot: await H.shot(page, "panel-scope-after-switch") };
    out.P1 = { firstBattle: first && first.battle_id, secondBattle: second && second.battle_id, open1, after1 };
    run.check("P-1 備戰中點選關羽打開面板後切換關卡：新的一場開始（battle_id 不同），上一場的面板關閉、不再顯示關羽",
      open1.count === 1 && /關羽/.test(open1.name) && !!first && !!second && first.battle_id !== second.battle_id && after1.count === 0,
      out.P1);

    // 上一場的面板晚到
    await post({ __godot_bridge: true, type: "show_upgrade_panel", unit_type: "hero", hero_id: "guan_yu", hero_uid: "hero-1", battle_id: first.battle_id,
      name: "關羽", level: 1, atk: 150, atk_spd: 0.83, range: 1.5, hp: 1500, screen_pos: { x: 120, y: 300 } });
    await H.sleep(800);
    out.P2 = { count: await panelCount(), name: await panelName() };
    run.check("P-2 換關之後遊戲晚到一則上一場的武將面板（battle_id 是上一場的）：不顯示", out.P2.count === 0, out.P2);

    // 舊版遊戲的面板（沒有 battle_id）：照舊顯示
    await post({ __godot_bridge: true, type: "show_upgrade_panel", unit_type: "hero", hero_id: "guan_yu", name: "關羽", level: 1, atk: 150, atk_spd: 0.83,
      range: 1.5, hp: 1500, screen_pos: { x: 120, y: 300 } });
    await page.waitForSelector('[data-testid="unit-panel"]', { timeout: 10000 }).catch(() => null);
    const legacy = { count: await panelCount(), name: await panelName() };
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await H.sleep(500);
    out.P3 = { legacy, afterClose: await panelCount() };
    run.check("P-3 舊版遊戲沒有 battle_id 的武將面板照舊顯示（相容），關閉後沒有殘留", legacy.count === 1 && /關羽/.test(legacy.name) && out.P3.afterClose === 0, out.P3);

    // 這一場的面板：照常顯示（新關卡先點掉進場畫面）
    await H.dismissSplash(page);
    await deployHero(4, 5, "趙雲");
    await H.clickCell(page, 4, 5);
    await page.waitForSelector('[data-testid="unit-panel"]', { timeout: 15000 });
    const own = { count: await panelCount(), name: await panelName() };
    const idx = await H.bridgeLen(page);
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click();
    await H.sleep(600);
    const hides = (await H.bridgeSince(page, idx)).filter((m) => m.type === "hide_upgrade_panel").length;
    out.P4 = { own, afterClose: await panelCount(), hides };
    run.check("P-4 這一場的武將面板照常顯示（趙雲），關閉後面板消失", own.count === 1 && /趙雲/.test(own.name) && out.P4.afterClose === 0, out.P4);
  });

  return run.finish(out);
}
