async (page) => {
  // 手機的矮畫面：選取面板不擋住暫停與繼續（瀏覽器，真 Godot 產物、mock 後端）
  // 主頁與獨立戰鬥頁 × 390×600、320×568、740×360（橫向）：
  // - PS-1 戰鬥中點選已部署的關羽打開面板：面板整個在視窗內、不蓋住暫停鈕（暫停鈕中心點最上層是它自己），關閉鈕點得到；
  //   用真的滑鼠點暫停鈕 → 遊戲確認暫停（update_stats）；面板仍在；再點同一個按鈕（繼續）→ 遊戲確認繼續
  // - PS-2 鍵盤：焦點在面板的關閉鈕（名稱「關閉單位面板」）時按 Esc 關閉面板，焦點回到遊戲畫面（iframe）
  // - PS-3 備戰中點選防禦塔、按「拆除」：確認的「確定／取消」在視窗內而且點得到，不蓋住暫停鈕；按取消後塔還在
  // 字級：面板的文字至少 12px。全部 mock、虛構金鑰 test_psafe_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const MAIN_IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BATTLE_IFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const SIZES = [[390, 600], [320, 568], [740, 360]];
  const profile = {
    nickname: "面板安全區", level: 1, exp: 0, gold: 5000, capacity: 11, max_stage: "chapter1_7", heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }],
  };
  const rectOf = (sel) => page.evaluate((sel) => {
    const r = document.querySelector(sel).getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, sel);
  const cellPoint = async (sel, c, row, cols = 14, rows = 11) => {
    const r = await rectOf(sel);
    const s = Math.min(r.width / 540, r.height / 720);
    const vx = r.width / s, vy = r.height / s;
    const tile = Math.max(16, Math.floor(Math.min(vx / cols, vy / rows)));
    const ox = (vx - cols * tile) / 2, oy = (vy - rows * tile) / 2;
    return { x: r.left + (ox + (c + 0.5) * tile) * s, y: r.top + (oy + (row + 0.5) * tile) * s };
  };
  const clickCell = async (sel, c, row) => {
    const p = await cellPoint(sel, c, row);
    await page.mouse.click(p.x, p.y);
  };
  // 一個元素的中心點最上層是不是它自己；元素在視窗內的比例
  const probe = (selector) => page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight ? document.elementFromPoint(cx, cy) : null;
    return {
      onTop: !!top && (top === el || el.contains(top)),
      coveredBy: top && !(top === el || el.contains(top)) ? (top.closest("[data-testid]")?.getAttribute("data-testid") || top.className || top.tagName).toString().slice(0, 60) : null,
      inViewport: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
      rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) },
    };
  }, selector);
  const minFont = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="unit-panel"]');
    if (!p) return null;
    let min = 99;
    for (const el of p.querySelectorAll("*")) {
      if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
      min = Math.min(min, parseFloat(getComputedStyle(el).fontSize));
    }
    return min;
  });
  const lastStats = () => page.evaluate(() => (window.__bridgeLog || []).filter((m) => m.type === "update_stats").pop() || null);
  const waitPaused = async (want) => {
    const end = Date.now() + 8000;
    while (Date.now() < end) {
      const s = await lastStats();
      if (s && !!s.paused === want) return true;
      await H.sleep(150);
    }
    return false;
  };
  const deploy = async (frame, c, row, name) => {
    await clickCell(frame, c, row);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    if (name === "弓兵塔") {
      await page.getByRole("button", { name: /弓兵塔/ }).first().click();
    } else {
      const tab = page.locator('[data-testid="placement-menu"] button[class*="tabBtn"]', { hasText: "武將" });
      if ((await tab.count()) > 0) await tab.click();
      await page.locator('button[class*="menuCard"]', { hasText: name }).click();
    }
    await H.sleep(700);
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 6).join(" | ") : e).slice(0, 800));
      try { out[name + "_shot"] = await H.shot(page, `panel-safe-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };

  for (const entry of ["main", "battle"]) {
    for (const [w, h] of SIZES) {
      const tag = `${entry}-${w}x${h}`;
      await section(tag, async () => {
        const frame = entry === "main" ? MAIN_IFRAME : BATTLE_IFRAME;
        await H.resetOrigin(page);
        await page.evaluate(({ k, p }) => {
          localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
          localStorage.setItem("shenma_player_key", k);
        }, { k: "test_psafe_a", p: profile });
        await page.setViewportSize({ width: w, height: h });
        if (entry === "main") {
          await page.goto(H.BASE + "/shenmaSanguo");
          await H.waitHud(page);
          await H.selectStage(page, "Mock A 慢速出兵");
        } else {
          await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_1");
          await H.waitBridge(page, 0, { type: "update_stats", game_state: 1 }, 120000);
        }
        await H.sleep(800);
        const fr = await rectOf(frame);
        await page.mouse.click(fr.left + fr.width / 2, fr.top + fr.height / 2); // 進場畫面
        await H.sleep(600);

        // ── PS-3（備戰）：防禦塔的拆除確認 ──
        await deploy(frame, 3, 4, "弓兵塔");
        await clickCell(frame, 3, 4);
        await page.waitForSelector('[data-testid="unit-panel"]', { timeout: 15000 });
        await page.locator('[data-testid="tower-sell"]').click();
        await page.waitForSelector('[data-testid="tower-sell-confirm"]', { timeout: 10000 });
        await H.sleep(300);
        const ok3 = await probe('[data-testid="tower-sell-ok"]');
        const cancel3 = await probe('[data-testid="tower-sell-cancel"]');
        const pause3 = await probe('[data-testid="pause-toggle"]');
        await page.locator('[data-testid="tower-sell-cancel"]').click();
        await H.sleep(400);
        const towerKept = (await page.locator('[data-testid="unit-panel"]').count()) === 1;
        await H.shot(page, `panel-safe-${tag}-sell`);
        await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click();
        await H.sleep(400);
        run.check(`PS-3 ${tag} 備戰中防禦塔的拆除確認：確定與取消都在視窗內、點得到；暫停鈕沒有被蓋住；按取消後面板（塔）還在`,
          ok3?.onTop && ok3.inViewport && cancel3?.onTop && cancel3.inViewport && pause3 && pause3.coveredBy === null && towerKept,
          { ok3, cancel3, pause3, towerKept });

        // ── PS-1（戰鬥中）：武將面板與暫停 ──
        await deploy(frame, 3, 5, "關羽");
        const idx = await H.bridgeLen(page);
        await page.getByRole("button", { name: /迎戰/ }).first().click();
        await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 }, 30000);
        await H.sleep(500);
        await clickCell(frame, 3, 5);
        await page.waitForSelector('[data-testid="unit-panel"]', { timeout: 15000 });
        await H.sleep(500);
        const panel = await probe('[data-testid="unit-panel"]');
        const close = await probe('[data-testid="unit-panel"] button[class*="closeBtn"]');
        const pause = await probe('[data-testid="pause-toggle"]');
        const font = await minFont();
        await H.shot(page, `panel-safe-${tag}-panel`);
        let paused = false, resumed = false, panelAfterPause = 0, p2 = null, badge = null, resumed2 = false;
        if (pause && pause.onTop) {
          const pr = pause.rect;
          await page.mouse.click((pr.l + pr.r) / 2, (pr.t + pr.b) / 2);
          paused = await waitPaused(true);
          panelAfterPause = await page.locator('[data-testid="unit-panel"]').count();
          await H.sleep(300);
          // 暫停中：HUD 的「繼續」與戰場下方的「已暫停・繼續」都沒有被面板蓋住；用下方的「繼續」繼續
          p2 = await probe('[data-testid="pause-toggle"]');
          badge = await probe('[data-testid="pause-resume"]');
          if (badge && badge.onTop) {
            await page.mouse.click((badge.rect.l + badge.rect.r) / 2, (badge.rect.t + badge.rect.b) / 2);
            resumed = await waitPaused(false);
          }
          // 再暫停一次，這次用 HUD 的「繼續」
          if (resumed) {
            const q = await probe('[data-testid="pause-toggle"]');
            await page.mouse.click((q.rect.l + q.rect.r) / 2, (q.rect.t + q.rect.b) / 2);
            if (await waitPaused(true)) {
              await H.sleep(300);
              const q2 = await probe('[data-testid="pause-toggle"]');
              if (q2 && q2.onTop) {
                await page.mouse.click((q2.rect.l + q2.rect.r) / 2, (q2.rect.t + q2.rect.b) / 2);
                resumed2 = await waitPaused(false);
              }
            }
          }
        }
        run.check(`PS-1 ${tag} 戰鬥中武將面板：在視窗內、關閉鈕點得到、不蓋住暫停鈕；真的點暫停 → 遊戲確認暫停（面板仍在），HUD 的「繼續」與戰場下方的「已暫停・繼續」都沒有被蓋住 → 點下方的「繼續」→ 遊戲確認繼續；再暫停後點 HUD 的「繼續」也確認繼續；面板文字至少 12px`,
          panel?.inViewport && close?.onTop && pause?.onTop && paused && panelAfterPause === 1 && p2?.onTop && badge?.onTop && badge.inViewport && resumed && resumed2 && font >= 12,
          { panel, close, pause, paused, panelAfterPause, p2, badge, resumed, resumed2, font });

        // ── PS-2 鍵盤：Esc 關閉、焦點回到遊戲畫面 ──
        const closeName = await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').getAttribute("aria-label");
        await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').focus();
        await page.keyboard.press("Escape");
        await H.sleep(400);
        const k = await page.evaluate((sel) => ({
          panels: document.querySelectorAll('[data-testid="unit-panel"]').length,
          onFrame: document.activeElement === document.querySelector(sel),
          name: null,
          active: document.activeElement ? document.activeElement.tagName : null,
        }), frame);
        k.name = closeName;
        run.check(`PS-2 ${tag} 面板的關閉鈕名稱是「關閉單位面板」；焦點在它上面時按 Esc：面板關閉，焦點回到遊戲畫面`, closeName === "關閉單位面板" && k.panels === 0 && k.onFrame, k);
        out[tag] = { panel: panel?.rect, pause: pause?.rect, font };
      });
    }
  }
  await page.setViewportSize({ width: 540, height: 900 }).catch(() => {});
  return run.finish(out);
}
