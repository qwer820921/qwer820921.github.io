async (page) => {
  // 武將列表與武將詳情的鍵盤操作（瀏覽器，真 Godot 產物、mock 後端）：主頁戰場 HUD 的「武將」視窗（備戰與戰鬥中）與獨立武將頁。
  // 主頁：桌面 1280×800 與 390×844 各跑一次 K-1～K-6：
  // - K-1 從 HUD 用 Tab 走到「武將」按鈕 → Enter：武將列表是有名稱的對話框（role dialog、aria-modal、名稱「武將列表」），焦點在「關閉武將列表」
  // - K-2 Tab 一圈再多兩下、Shift+Tab 三下：焦點一直在列表裡（不進遊戲 iframe 或背後的 HUD）；卡片是原生按鈕、Tab 走得到每一張
  // - K-3 卡片按 Enter：只開一個詳情（對話框「武將詳情：關羽」、aria-modal），焦點在「關閉武將詳情」；Tab／Shift+Tab 只在詳情裡；背景沒有捲動
  // - K-4 Esc 只關閉詳情（列表還開著），焦點回到開啟它的卡片
  // - K-5 另一張卡片按空白鍵：只開一次詳情、背景沒有捲動；Esc 回到那張卡片；再按 Esc 關閉列表，焦點回到 HUD 的「武將」按鈕
  // - K-6 同一場（battle_id 不變、備戰、波次 0、城池 20）、沒有升級或其他後端寫入、沒有橫向溢出
  // 只跑桌面：
  // - K-7 搜尋沒有符合的武將：Tab／Shift+Tab 仍在列表的搜尋、排序、清除、職業與關閉之間循環（焦點不會困死或掉出去），Esc 關閉列表
  // - K-8 卡片不在畫面上時的退路：用 JavaScript 點卡片（開啟時焦點不在任何元素上）→ Esc 後焦點交給同一位武將的卡片；
  //       詳情開著時把開啟它的卡片從頁面移除（模擬卸載）→ Esc 後焦點交給列表的搜尋框（不是 body）
  // - K-9 升級處理中（mock 暫停 upgrade_hero；每次升級前先等同步閒置，否則 store 改在本機計算、不送請求）：升級按鈕停用、焦點掉到頁面本身 → Tab 回到詳情裡、Shift+Tab 到詳情的最後一個控制項；
  //       放行後升到 2 級；再升級一次並在處理中按 Esc：詳情關閉、焦點回到卡片、請求沒有取消也沒有重複送出（放行後 3 級，升級請求共 2 次）；
  //       第三次在處理中焦點留在頁面本身直到放行：處理完焦點回到升級按鈕
  // - K-10 戰鬥中（迎戰後，敵人在場上）：同樣用鍵盤打開列表、卡片 Enter 開詳情、Esc 兩次關閉；焦點回到「武將」按鈕；
  //        這段期間戰場沒有被暫停、倍率不變、battle_id 與波次不變（視窗裡的按鍵沒有觸發背後的動作）
  // - K-11 滑鼠：點卡片開詳情、點「關閉」關閉；卡片的版面（寬度撐滿、文字靠左、字級沿用頁面）和原本一樣；卡片按鈕裡沒有 div 或其他互動元素
  // - K-13 主頁列表的兩個退路：詳情開著時開啟它的卡片與列表的搜尋框都不在頁面上 → Esc 後焦點交給列表的關閉鈕；
  //        設定載入中（mock 暫停 get_heroes_config、玩家資訊按「強制從雲端同步」）打開列表：只有標題、關閉鈕與「武將資料載入中…」，
  //        焦點與 Tab／Shift+Tab 都在關閉鈕上，Esc 回到「武將」按鈕；放行後卡片恢復
  // - K-12 獨立武將頁（react-bootstrap Modal，新的存檔：戰場點數 250）：每按一次 Tab／Shift+Tab 等焦點穩定（260 毫秒）後，
  //        焦點都要在詳情裡的控制項上、頁面有焦點（不是 body、不是視窗外框、沒有離開頁面），兩個方向各連續循環兩圈以上、順序照控制項的順序；
  //        另外直接驗證邊界（焦點放在最後一個按 Tab 回到第一個、放在第一個按 Shift+Tab 到最後一個）。
  //        桌面與 390×844 各驗證可升級（3 個控制項）與點數不足（升級停用，2 個）；升級處理中（mock 暫停 upgrade_hero）「關閉」與升級都停用、焦點掉到頁面本身：
  //        Tab／Shift+Tab 回到唯一可用的關閉鈕並在詳情裡循環、Esc 關閉並回到卡片（請求不取消、不重送）；處理完焦點仍在頁面本身時放回「關閉」。
  //        Enter／空白鍵開啟、Esc 關閉後焦點回到卡片；JavaScript 點卡片後 Esc 交給同一位武將的卡片；390×844 列表與詳情沒有橫向溢出；升級請求共 2 次
  // 全部 mock、虛構金鑰 test_hk_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const KEY = "test_hk_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const PREP_STAGE = { id: "chapter1_4", name: "Mock W 勝利兩波" };
  const BATTLE_STAGE = { id: "chapter1_1", name: "Mock A 慢速出兵" };
  const profile = {
    nickname: "鍵盤武將", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter1_7", heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
  };

  // ── 輔助 ──
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const snapshot = async () => {
    const id = "hk-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel: IFRAME, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    const s = await h.jsonValue();
    return { stage: s.stage, battle_id: s.battle_id, gs: s.game_state, wave: s.wave, hp: s.hp, frozen: s.world_frozen, ts: s.time_scale, auto: s.auto_mode, enemies: s.active_enemies };
  };
  const dismissSplash = async () => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, IFRAME);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
  const gasActions = async () => H.countActions(await H.gasLog(page));
  // 目前的焦點：武將列表、武將詳情、卡片（data-hero-id）、HUD 的「武將」按鈕、搜尋框、遊戲 iframe、body
  const focusAt = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      const named = (n) => dialogs.find((d) => d.getAttribute("aria-label") === n || (d.getAttribute("aria-labelledby") && (document.getElementById(d.getAttribute("aria-labelledby")) || {}).textContent === n)) || null;
      const list = named("武將列表");
      const detail = document.querySelector('[data-testid="hero-detail"]');
      const card = a && a.closest ? a.closest("[data-hero-id]") : null;
      return {
        tag: a ? a.tagName : null,
        heroId: a && a.getAttribute ? a.getAttribute("data-hero-id") : null,
        inCard: !!card,
        label: a && a.getAttribute ? a.getAttribute("aria-label") : null,
        testid: a && a.getAttribute ? a.getAttribute("data-testid") : null,
        text: a && a.innerText ? a.innerText.trim().slice(0, 12) : "",
        name: a && a.getAttribute ? (a.getAttribute("aria-label") || (a.innerText || "").trim()).slice(0, 40) : "",
        hasFocus: document.hasFocus(),
        inList: !!(list && a && list.contains(a)),
        inDetail: !!(detail && a && detail.contains(a)),
        inDialog: dialogs.some((d) => a && d.contains(a)),
        hudHero: !!(a && a.tagName === "BUTTON" && a.innerText.trim() === "武將" && String(a.className).includes("hudBarBtn")),
        iframe: !!(a && a.tagName === "IFRAME"),
        body: a === document.body || a === null,
        connected: !!(a && a.isConnected),
      };
    });
  const state = () =>
    page.evaluate(() => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      const list = dialogs.find((d) => d.getAttribute("aria-labelledby") && (document.getElementById(d.getAttribute("aria-labelledby")) || {}).textContent === "武將列表");
      const details = [...document.querySelectorAll('[data-testid="hero-detail"]')];
      const body = list ? list.querySelector('[class*="modalBody"]') : null;
      return {
        list: !!list, listModal: list ? list.getAttribute("aria-modal") : null,
        details: details.length, detailId: details[0] ? details[0].getAttribute("data-hero-id") : null,
        detailRole: details[0] ? details[0].getAttribute("role") : null, detailName: details[0] ? details[0].getAttribute("aria-label") : null,
        detailModal: details[0] ? details[0].getAttribute("aria-modal") : null,
        scrollY: window.scrollY, listScroll: body ? body.scrollTop : null,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
  const press = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(80);
  };
  const tabWalk = async (n, shift = false) => {
    const seen = [];
    for (let i = 0; i < n; i++) {
      await press(shift ? "Shift+Tab" : "Tab");
      seen.push(await focusAt());
    }
    return seen;
  };
  const tabUntil = async (pred, max = 60, shift = false) => {
    for (let i = 1; i <= max; i++) {
      await press(shift ? "Shift+Tab" : "Tab");
      const f = await focusAt();
      if (pred(f)) return { f, n: i };
    }
    return { f: await focusAt(), n: -1 };
  };
  // 頁面（不是視窗）裡的卡片：先往後找，找不到再往前（卡片的順序跟著排序與等級改變）
  const tabTo = async (pred) => {
    const a = await tabUntil(pred, 8);
    return a.n > 0 ? a : tabUntil(pred, 16, true);
  };
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  // 可以用 Tab 走到的控制項數量（selector 指定的範圍）
  const tabbables = (sel) =>
    page.evaluate(({ sel, FOCUSABLE }) => {
      const root = document.querySelector(sel);
      if (!root) return 0;
      return root.querySelectorAll(FOCUSABLE).length;
    }, { sel, FOCUSABLE });
  // 按一次鍵後等焦點穩定（260 毫秒；焦點暫時離開頁面再被拉回的情況在這段時間內會結束）再記錄
  const settle = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(260);
    return focusAt();
  };
  const settleWalk = async (n, shift = false) => {
    const seen = [];
    for (let i = 0; i < n; i++) seen.push(await settle(shift ? "Shift+Tab" : "Tab"));
    return seen;
  };
  // 焦點穩定在武將詳情裡的控制項上：頁面有焦點、不是 body、不是視窗外框
  const inBox = (f) => f.inDetail && f.hasFocus && !f.body && f.tag === "BUTTON";
  // 武將詳情裡用 Tab 走得到的控制項（文件順序）的名稱（aria-label，沒有時是文字）
  const detailControls = () =>
    page.evaluate((FOCUSABLE) => {
      const box = document.querySelector('[data-testid="hero-detail"]');
      return box ? [...box.querySelectorAll(FOCUSABLE)].map((el) => (el.getAttribute("aria-label") || el.innerText.trim()).slice(0, 40)) : [];
    }, FOCUSABLE);
  const focusEdge = (which) =>
    page.evaluate(({ which, FOCUSABLE }) => {
      const items = [...document.querySelector('[data-testid="hero-detail"]').querySelectorAll(FOCUSABLE)];
      const el = which === "last" ? items[items.length - 1] : items[0];
      el.focus();
      return (el.getAttribute("aria-label") || el.innerText.trim()).slice(0, 40);
    }, { which, FOCUSABLE });
  // 武將詳情的嚴格循環：Tab 與 Shift+Tab 各 2n+2 下（n＝可用的控制項數，兩個方向都至少兩圈），每一步都要穩定在詳情的控制項上，
  // 而且下一個是控制項順序的下一個（最後一個之後是第一個；Shift+Tab 相反）；再直接驗證邊界：焦點放在最後一個按 Tab → 第一個，
  // 放在第一個按 Shift+Tab → 最後一個
  const strictCycle = async () => {
    const ctl = await detailControls();
    const n = ctl.length;
    const fwd = await settleWalk(2 * n + 2);
    const back = await settleWalk(2 * n + 2, true);
    const bad = [...fwd, ...back].filter((f) => !inBox(f));
    const follows = (seq, step) =>
      seq.every((f, i) => ctl.includes(f.name) && (i === 0 || ctl.indexOf(f.name) === (ctl.indexOf(seq[i - 1].name) + step + n) % n));
    const orderFwd = follows(fwd, 1);
    const orderBack = follows(back, -1);
    const lastName = await focusEdge("last");
    await H.sleep(100);
    const edgeFwd = await settle("Tab");
    const firstName = await focusEdge("first");
    await H.sleep(100);
    const edgeBack = await settle("Shift+Tab");
    const ok = n >= 1 && bad.length === 0 && orderFwd && orderBack && lastName === ctl[n - 1] && firstName === ctl[0] &&
      inBox(edgeFwd) && edgeFwd.name === ctl[0] && inBox(edgeBack) && edgeBack.name === ctl[n - 1];
    return {
      ok, ctl, n, bad: bad.slice(0, 4), orderFwd, orderBack,
      fwd: fwd.map((f) => (inBox(f) ? f.name : `${f.tag}/${f.body ? "body" : ""}/${f.hasFocus ? "focus" : "no-focus"}`)),
      back: back.map((f) => (inBox(f) ? f.name : `${f.tag}/${f.body ? "body" : ""}/${f.hasFocus ? "focus" : "no-focus"}`)),
      edge: { lastName, afterTab: edgeFwd.name, afterTabIn: inBox(edgeFwd), firstName, afterShiftTab: edgeBack.name, afterShiftTabIn: inBox(edgeBack) },
    };
  };
  const LIST_SEL = '[role="dialog"][aria-labelledby]';
  // 起點：用滑鼠點 HUD 的地圖名稱（不是控制項，焦點離開遊戲 iframe），再用 Tab 走到「武將」按鈕
  const toHeroBtn = async () => {
    await page.locator('[class*="hudMapName"]').click();
    await H.sleep(150);
    return tabUntil((f) => f.hudHero, 30);
  };
  const openList = async () => {
    const t = await toHeroBtn();
    await press("Enter");
    await H.sleep(400);
    return { reached: t.n > 0, st: await state(), after: await focusAt() };
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `hero-keyboard-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };

  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, p: profile });
  });

  const flow = async (tag, vp) => {
    await page.setViewportSize(vp);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, PREP_STAGE.name);
    await dismissSplash();
    const s0 = await snapshot();
    const g0 = await gasActions();

    // K-1：Tab 到「武將」→ Enter
    const o1 = await openList();
    const dlg = {
      dialog: await page.getByRole("dialog", { name: "武將列表", exact: true }).count(),
      close: await page.getByRole("button", { name: "關閉武將列表", exact: true }).count(),
    };
    out[tag + "_K1"] = { open: o1, dlg, shot: await H.shot(page, `hero-keyboard-${tag}-list`) };
    run.check(`K-1 ${tag} 從 HUD 用 Tab 走到「武將」按 Enter：武將列表是對話框（名稱「武將列表」、aria-modal），焦點在「關閉武將列表」（不是 body、不是背後的按鈕）`,
      o1.reached && o1.st.list && o1.st.listModal === "true" && dlg.dialog === 1 && dlg.close === 1 && o1.after.inList && o1.after.label === "關閉武將列表" && !o1.after.body,
      out[tag + "_K1"]);

    // K-2：Tab 一圈再多兩下、Shift+Tab 三下
    const n2 = await tabbables(LIST_SEL);
    const fwd = await tabWalk(n2 + 2);
    const back = await tabWalk(3, true);
    const outside = [...fwd, ...back].filter((f) => !f.inList || !f.hasFocus);
    const cards = [...new Set(fwd.filter((f) => f.tag === "BUTTON" && f.heroId).map((f) => f.heroId))];
    run.check(`K-2 ${tag} Tab ${n2 + 2} 下（列表內 ${n2} 個控制項）與 Shift+Tab 3 下：焦點一直在列表裡，沒有進遊戲 iframe 或 HUD；四張卡片都是 Tab 走得到的原生按鈕`,
      n2 >= 8 && outside.length === 0 && cards.length === 4, { tabbables: n2, outside: outside.slice(0, 4), cards });

    // K-3：卡片（關羽）按 Enter
    const t3 = await tabUntil((f) => f.heroId === "guan_yu", 40);
    const before3 = await state();
    await press("Enter");
    await H.sleep(400);
    const st3 = await state();
    const f3 = await focusAt();
    const nd = await tabbables('[data-testid="hero-detail"]');
    const walk3 = [...(await tabWalk(nd + 1)), ...(await tabWalk(2, true))];
    const out3 = walk3.filter((f) => !f.inDetail || !f.hasFocus);
    out[tag + "_K3"] = { reached: t3.n, before3, st3, f3, nd, out3: out3.slice(0, 3), shot: await H.shot(page, `hero-keyboard-${tag}-detail`) };
    run.check(`K-3 ${tag} 關羽的卡片按 Enter：只開一個詳情（對話框「武將詳情：關羽」、aria-modal），焦點在「關閉武將詳情」；Tab ${nd + 1} 下與 Shift+Tab 2 下都在詳情裡；列表與頁面沒有捲動`,
      t3.n > 0 && st3.details === 1 && st3.detailId === "guan_yu" && st3.detailRole === "dialog" && st3.detailName === "武將詳情：關羽" && st3.detailModal === "true" &&
        f3.inDetail && f3.label === "關閉武將詳情" && nd >= 3 && out3.length === 0 && st3.scrollY === before3.scrollY && st3.listScroll === before3.listScroll,
      out[tag + "_K3"]);

    // K-4：Esc 只關詳情，焦點回到關羽的卡片
    await press("Escape");
    await H.sleep(300);
    const st4 = await state();
    const f4 = await focusAt();
    run.check(`K-4 ${tag} Esc 只關閉詳情（列表還開著），焦點回到關羽的卡片`,
      st4.details === 0 && st4.list && f4.heroId === "guan_yu" && f4.tag === "BUTTON" && f4.inList, { st4, f4 });

    // K-5：趙雲的卡片按空白鍵 → Esc 回卡片 → Esc 關列表回到「武將」按鈕
    const t5 = await tabUntil((f) => f.heroId === "zhao_yun", 40);
    const before5 = await state();
    await press("Space");
    await H.sleep(400);
    const st5 = await state();
    const f5 = await focusAt();
    await press("Escape");
    await H.sleep(300);
    const f5b = await focusAt();
    const st5b = await state();
    await press("Escape");
    await H.sleep(400);
    const st5c = await state();
    const f5c = await focusAt();
    out[tag + "_K5"] = { reached: t5.n, st5, f5, f5b, st5b, st5c, f5c };
    run.check(`K-5 ${tag} 趙雲的卡片按空白鍵：只開一次詳情（趙雲）、背景沒有捲動；Esc 回到趙雲的卡片；再按 Esc 關閉列表，焦點回到 HUD 的「武將」按鈕`,
      t5.n > 0 && st5.details === 1 && st5.detailId === "zhao_yun" && f5.inDetail && st5.scrollY === before5.scrollY && st5.listScroll === before5.listScroll &&
        f5b.heroId === "zhao_yun" && st5b.details === 0 && st5b.list && !st5c.list && st5c.details === 0 && f5c.hudHero && f5c.connected,
      out[tag + "_K5"]);

    // K-6：同一場、沒有後端寫入、沒有橫向溢出
    const s6 = await snapshot();
    const g6 = await gasActions();
    run.check(`K-6 ${tag} 同一場（battle_id 不變、備戰、波次 0、城池 20）、沒有升級或其他後端寫入、沒有橫向溢出`,
      s6.battle_id === s0.battle_id && s6.gs === 1 && s6.wave === 0 && s6.hp === 20 && (g6.upgrade_hero || 0) === (g0.upgrade_hero || 0) &&
        (g6.save_profile || 0) === (g0.save_profile || 0) && !st5.overflow && !st3.overflow,
      { s0, s6, g0, g6 });
  };

  await section("desktop", () => flow("桌面", { width: 1280, height: 800 }));
  await section("narrow", () => flow("390", { width: 390, height: 844 }));

  // ── K-7～K-11：桌面 ──
  await section("K7", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await H.sleep(300);
    await openList();
    await page.getByTestId("hero-filter-search").fill("不存在的武將zzz");
    await H.sleep(300);
    const empty = await page.locator('[data-testid="hero-filter-empty"]').count();
    const cardsLeft = await page.locator('[role="dialog"] button[data-hero-id]').count();
    const n7 = await tabbables(LIST_SEL);
    const walk = [...(await tabWalk(n7 + 2)), ...(await tabWalk(n7 + 2, true))];
    const outside = walk.filter((f) => !f.inList || f.body || !f.hasFocus);
    await press("Escape");
    await H.sleep(300);
    const st7 = await state();
    const f7 = await focusAt();
    out.K7 = { empty, cardsLeft, n7, outside: outside.slice(0, 3), st7, f7 };
    run.check("K-7 搜尋沒有符合的武將（沒有卡片、顯示無結果說明）：Tab／Shift+Tab 仍在列表的控制項之間循環、不會掉到 body 或背後；Esc 關閉列表、焦點回到「武將」按鈕",
      empty === 1 && cardsLeft === 0 && n7 >= 6 && outside.length === 0 && !st7.list && f7.hudHero, out.K7);
  });

  await section("K8", async () => {
    // a：開啟時焦點不在任何元素上（用 JavaScript 點卡片）→ Esc 後焦點交給同一位武將的卡片
    await openList();
    await page.evaluate(() => {
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      document.querySelector('[role="dialog"] button[data-hero-id="huang_zhong"]').click();
    });
    await H.sleep(400);
    const a0 = await state();
    await press("Escape");
    await H.sleep(300);
    const fa = await focusAt();
    // b：詳情開著時把開啟它的卡片從頁面移除（模擬卸載）→ Esc 後焦點交給搜尋框
    await tabUntil((f) => f.heroId === "zhou_yu", 40);
    await press("Enter");
    await H.sleep(400);
    const b0 = await state();
    const removed = await page.evaluate(() => {
      const c = document.querySelector('[role="dialog"] button[data-hero-id="zhou_yu"]');
      if (!c) return false;
      c.remove();
      return !document.querySelector('[role="dialog"] button[data-hero-id="zhou_yu"]');
    });
    await press("Escape");
    await H.sleep(300);
    const fb = await focusAt();
    const stb = await state();
    // 被移除的卡片只在這個視窗裡：關閉列表（卸載）後重新打開就恢復
    await press("Escape");
    await H.sleep(300);
    const fc = await focusAt();
    out.K8 = { a0, fa, b0, removed, fb, stb, fc };
    run.check("K-8 卡片不在畫面上時的退路：用 JavaScript 點黃忠的卡片（開啟時焦點不在任何元素上）→ Esc 後焦點交給黃忠的卡片；詳情開著時把周瑜的卡片從頁面移除 → Esc 後焦點交給列表的搜尋框（不是 body）；再按 Esc 關閉列表、回到「武將」按鈕",
      a0.details === 1 && a0.detailId === "huang_zhong" && fa.heroId === "huang_zhong" && fa.tag === "BUTTON" &&
        b0.detailId === "zhou_yu" && removed && fb.testid === "hero-filter-search" && fb.inList && !fb.body && stb.list && stb.details === 0 && fc.hudHero,
      out.K8);
  });

  await section("K9", async () => {
    const pendingUp = () => page.evaluate(() => window.__shenmaMock.pending("upgrade_hero").length);
    const level = () =>
      page.evaluate(() => {
        const d = document.querySelector('[data-testid="hero-detail"]');
        return d ? Number(d.getAttribute("data-hero-level")) : NaN;
      });
    const g0 = await gasActions();
    await openList();
    await tabUntil((f) => f.heroId === "guan_yu", 40);
    await press("Enter");
    await H.sleep(400);
    const lv0 = await level();
    await page.evaluate(() => window.__shenmaMock.hold("upgrade_hero"));
    try {
    // a：Enter 升級 → 處理中按鈕停用、焦點掉到頁面本身 → Tab／Shift+Tab 回到詳情裡
    const tUp = await tabUntil((f) => f.inDetail && /^升級 \(-/.test(f.text), 20);
    await press("Enter");
    await page.waitForFunction(() => window.__shenmaMock.pending("upgrade_hero").length === 1, null, { timeout: 15000 });
    await H.sleep(200);
    const fa0 = await focusAt();
    const disabled = await page.evaluate(() => [...document.querySelectorAll('[data-testid="hero-detail"] button')].some((b) => b.disabled && /升級中/.test(b.innerText)));
    await press("Tab");
    const fa1 = await focusAt();
    await press("Shift+Tab");
    await press("Shift+Tab");
    const fa2 = await focusAt();
    await page.evaluate(() => window.__shenmaMock.release("upgrade_hero", "ok"));
    await page.waitForFunction(() => /升級成功/.test((document.querySelector('[data-testid="hero-detail"]') || {}).innerText || ""), null, { timeout: 15000 });
    const lv1 = await level();
    await waitSync("idle");
    // b：再升級一次，處理中按 Esc：詳情關閉、焦點回到卡片、請求沒有取消也沒有重複
    await tabUntil((f) => f.inDetail && /^升級 \(-/.test(f.text), 20);
    await press("Enter");
    await page.waitForFunction(() => window.__shenmaMock.pending("upgrade_hero").length === 1, null, { timeout: 15000 });
    await H.sleep(200);
    const fb0 = await focusAt();
    await press("Escape");
    await H.sleep(300);
    const stb = await state();
    const fb1 = await focusAt();
    const pb = await pendingUp();
    await page.evaluate(() => window.__shenmaMock.release("upgrade_hero", "ok"));
    await H.sleep(800);
    await waitSync("idle");
    // c：第三次升級，處理中焦點留在頁面本身直到放行：處理完焦點回到升級按鈕
    await press("Enter");
    await H.sleep(400);
    const lv2 = await level();
    await tabUntil((f) => f.inDetail && /^升級 \(-/.test(f.text), 20);
    await press("Enter");
    await page.waitForFunction(() => window.__shenmaMock.pending("upgrade_hero").length === 1, null, { timeout: 15000 });
    await H.sleep(200);
    const fc0 = await focusAt();
    await page.evaluate(() => window.__shenmaMock.release("upgrade_hero", "ok"));
    await page.waitForFunction(() => /升級成功/.test((document.querySelector('[data-testid="hero-detail"]') || {}).innerText || ""), null, { timeout: 15000 });
    await H.sleep(300);
    const fc1 = await focusAt();
    const lv3 = await level();
    const g9 = await gasActions();
    await press("Escape");
    await H.sleep(300);
    await press("Escape");
    await H.sleep(300);
    out.K9 = { lv: [lv0, lv1, lv2, lv3], tUp: tUp.n, fa0, disabled, fa1, fa2, fb0, stb, fb1, pending_after_esc: pb, fc0, fc1, upgrades: [g0.upgrade_hero || 0, g9.upgrade_hero || 0] };
    run.check("K-9 升級處理中：按鈕停用、焦點掉到頁面本身 → Tab 回到詳情、Shift+Tab 到詳情裡；放行後 2 級；處理中按 Esc 只關閉詳情、焦點回到卡片，請求仍在處理（沒有取消、沒有重送），放行後 3 級；處理中焦點留在頁面本身時，處理完回到升級按鈕（4 級）；升級請求共 3 次",
      lv0 === 1 && tUp.n > 0 && fa0.body && disabled && fa1.inDetail && !fa1.body && fa2.inDetail && lv1 === 2 &&
        fb0.body && stb.details === 0 && stb.list && fb1.heroId === "guan_yu" && pb === 1 && lv2 === 3 &&
        fc0.body && fc1.inDetail && /^升級 \(-/.test(fc1.text) && lv3 === 4 && (g9.upgrade_hero || 0) - (g0.upgrade_hero || 0) === 3,
      out.K9);
    } finally {
      await page.evaluate(() => window.__shenmaMock.unhold("upgrade_hero")).catch(() => {});
    }
  });

  await section("K10", async () => {
    await H.selectStage(page, BATTLE_STAGE.name);
    await dismissSplash();
    await H.clickButton(page, "迎戰");
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 2), null, { timeout: 30000 });
    await H.sleep(5000);
    const s0 = await snapshot();
    const o = await openList();
    await tabUntil((f) => f.heroId === "guan_yu", 40);
    await press("Enter");
    await H.sleep(300);
    const st1 = await state();
    const f1a = await focusAt();
    await press("Escape");
    await H.sleep(300);
    const f1 = await focusAt();
    await press("Escape");
    await H.sleep(300);
    const f2 = await focusAt();
    const s1 = await snapshot();
    out.K10 = { s0, open: o.st, after: o.after, st1, f1a, f1, f2, s1, shot: await H.shot(page, "hero-keyboard-battle") };
    run.check("K-10 戰鬥中（敵人在場上）：鍵盤打開列表（焦點在列表裡）、關羽的卡片 Enter 只開一個詳情（焦點在詳情裡），Esc 先回到卡片、再按 Esc 關閉列表、焦點回到「武將」按鈕；這段期間戰場沒有被暫停、倍率與自動不變、同一場同一波（視窗裡的按鍵沒有觸發背後的動作）",
      s0.gs === 2 && s0.enemies >= 1 && o.st.list && o.after.inList && st1.details === 1 && f1a.inDetail && f1.heroId === "guan_yu" && f2.hudHero &&
        s1.battle_id === s0.battle_id && s1.gs === 2 && s1.wave === s0.wave && s1.frozen === false && s1.ts === s0.ts && s1.auto === s0.auto,
      out.K10);
  });

  // 卡片按鈕裡的內容要合法：按鈕裡只放行內的內容（span、img 等），沒有 div 這類區塊元素，也沒有按鈕、連結、輸入框或可用 Tab 走到的元素
  const cardContent = (scope) =>
    page.evaluate((scope) => {
      const cards = [...document.querySelectorAll(`${scope} button[data-hero-id]`)];
      const blocks = cards.flatMap((b) => [...b.querySelectorAll("div, p, ul, ol, li, section, article, header, footer, h1, h2, h3, h4, h5, h6, table, form")]);
      const inter = cards.flatMap((b) => [...b.querySelectorAll('button, a, input, select, textarea, label, iframe, [tabindex], [contenteditable="true"]')]);
      return {
        cards: cards.length,
        blocks: blocks.length,
        blockSample: blocks.slice(0, 3).map((el) => `${el.tagName}.${String(el.className).split(" ")[0]}`),
        interactive: inter.length,
        tags: [...new Set(cards.flatMap((b) => [...b.querySelectorAll("*")].map((el) => el.tagName)))].sort(),
      };
    }, scope);

  await section("K11", async () => {
    await page.locator('button[class*="hudBarBtn"]', { hasText: "武將" }).click();
    await page.waitForSelector('[role="dialog"] button[data-hero-id]');
    const layout = await page.evaluate(() => {
      const b = document.querySelector('[role="dialog"] button[data-hero-id="guan_yu"]');
      const col = b.parentElement.getBoundingClientRect();
      const r = b.getBoundingClientRect();
      const cs = getComputedStyle(b);
      const name = b.querySelector('[class*="heroName"]');
      return { w: Math.round(r.width), colW: Math.round(col.width - parseFloat(getComputedStyle(b.parentElement).paddingLeft) - parseFloat(getComputedStyle(b.parentElement).paddingRight)),
        align: cs.textAlign, font: cs.fontSize, family: cs.fontFamily, parentFont: getComputedStyle(b.parentElement).fontSize, parentFamily: getComputedStyle(b.parentElement).fontFamily,
        nameAlign: name ? getComputedStyle(name).textAlign : null, padding: cs.padding };
    });
    const content = await cardContent('[role="dialog"]');
    await page.locator('[role="dialog"] button[data-hero-id="zhao_yun"]').click();
    await H.sleep(300);
    const st = await state();
    const skill = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    await page.locator('[data-testid="hero-detail"] button', { hasText: /^關閉$/ }).click();
    await H.sleep(300);
    const st2 = await state();
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    out.K11 = { layout, content, st, skill, st2, shot: await H.shot(page, "hero-keyboard-mouse") };
    run.check("K-11 滑鼠：點趙雲的卡片開詳情（技能說明照常顯示）、點「關閉」關閉；卡片按鈕撐滿欄寬、文字靠左、字型與字級沿用外層（不是按鈕預設）、沒有按鈕的內距；四張卡片按鈕裡沒有 div 等區塊元素，也沒有互動元素",
      st.details === 1 && st.detailId === "zhao_yun" && /技能：閃避/.test(skill) && st2.details === 0 && st2.list &&
        Math.abs(layout.w - layout.colW) <= 1 && layout.align === "left" && layout.font === layout.parentFont && layout.family === layout.parentFamily && layout.padding === "0px" &&
        content.cards === 4 && content.blocks === 0 && content.interactive === 0,
      out.K11);
  });

  // ── K-13：主頁列表的兩個退路（桌面）──
  await section("K13", async () => {
    // a：詳情開著時，開啟它的卡片與列表的搜尋框都不在頁面上（模擬卸載）→ Esc 後焦點交給列表的關閉鈕（不是 body）
    await openList();
    await tabUntil((f) => f.heroId === "guan_yu", 40);
    await press("Enter");
    await H.sleep(400);
    const a0 = await state();
    const removed = await page.evaluate(() => {
      const list = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.getAttribute("aria-labelledby") && (document.getElementById(d.getAttribute("aria-labelledby")) || {}).textContent === "武將列表");
      const c = list && list.querySelector('button[data-hero-id="guan_yu"]');
      const s = list && list.querySelector('[data-testid="hero-filter-search"]');
      if (!c || !s) return false;
      c.remove();
      s.remove();
      return !list.querySelector('button[data-hero-id="guan_yu"]') && !list.querySelector('[data-testid="hero-filter-search"]');
    });
    await press("Escape");
    await H.sleep(300);
    const fa = await focusAt();
    const sta = await state();
    await press("Escape");
    await H.sleep(400);
    const fa2 = await focusAt();
    const sta2 = await state();
    out.K13a = { a0, removed, fa, sta, fa2, sta2 };
    run.check("K-13a 最後的退路：詳情開著時把關羽的卡片與列表的搜尋框都從頁面移除 → Esc 只關閉詳情，焦點交給「關閉武將列表」（在列表裡、頁面有焦點，不是 body）；再按 Esc 關閉列表、回到「武將」按鈕",
      a0.details === 1 && a0.detailId === "guan_yu" && removed && fa.label === "關閉武將列表" && fa.inList && fa.hasFocus && !fa.body && sta.list && sta.details === 0 &&
        !sta2.list && fa2.hudHero,
      out.K13a);

    // b：設定載入中的列表外殼
    await page.evaluate(() => window.__shenmaMock.hold("get_heroes_config"));
    try {
      await page.locator('button[class*="hudAvatar"]').click();
      await page.getByRole("button", { name: /強制從雲端同步/ }).click();
      await page.waitForFunction(() => window.__shenmaMock.pending("get_heroes_config").length === 1, null, { timeout: 15000 });
      await page.getByRole("button", { name: "關閉玩家資訊", exact: true }).click();
      await H.sleep(300);
      const o = await openList();
      const shell = await page.evaluate(() => {
        const list = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.getAttribute("aria-labelledby") && (document.getElementById(d.getAttribute("aria-labelledby")) || {}).textContent === "武將列表");
        const st = list && list.querySelector('[role="status"]');
        return { status: st ? st.innerText.trim() : null, cards: list ? list.querySelectorAll("[data-hero-id]").length : -1, modal: list ? list.getAttribute("aria-modal") : null };
      });
      const shot = await H.shot(page, "hero-keyboard-list-loading");
      const walk = [...(await settleWalk(3)), ...(await settleWalk(3, true))];
      const off = walk.filter((f) => !(f.inList && f.hasFocus && !f.body && f.label === "關閉武將列表"));
      await press("Escape");
      await H.sleep(400);
      const fb = await focusAt();
      const stb = await state();
      await page.evaluate(() => window.__shenmaMock.release("get_heroes_config", "ok"));
      await page.evaluate(() => window.__shenmaMock.unhold("get_heroes_config"));
      await H.sleep(800);
      await openList();
      await page.waitForFunction(() => document.querySelectorAll('[role="dialog"] button[data-hero-id]').length === 4, null, { timeout: 15000 });
      const cardsBack = await page.locator('[role="dialog"] button[data-hero-id]').count();
      await press("Escape");
      await H.sleep(400);
      const fc = await focusAt();
      out.K13b = { open: o, shell, shot, walk: walk.map((f) => `${f.label || f.tag}/${f.hasFocus ? "focus" : "no-focus"}`), off: off.slice(0, 3), fb, stb, cardsBack, fc };
      run.check("K-13b 設定載入中（mock 暫停 get_heroes_config、玩家資訊按「強制從雲端同步」）：用鍵盤打開的武將列表是對話框（名稱「武將列表」、aria-modal）、只有關閉鈕與「武將資料載入中…」、沒有卡片，焦點在「關閉武將列表」；Tab／Shift+Tab 各 3 下（每下等 260 毫秒）都停在關閉鈕、頁面有焦點；Esc 關閉、回到「武將」按鈕；放行後再打開，四張卡片恢復",
        o.reached && o.st.list && shell.modal === "true" && shell.status === "武將資料載入中…" && shell.cards === 0 && o.after.label === "關閉武將列表" && o.after.hasFocus &&
          off.length === 0 && !stb.list && fb.hudHero && cardsBack === 4 && fc.hudHero,
        out.K13b);
    } finally {
      await page.evaluate(() => {
        window.__shenmaMock.unhold("get_heroes_config");
        while (window.__shenmaMock.release("get_heroes_config", "ok"));
      }).catch(() => {});
    }
  });

  // ── K-12：獨立武將頁（react-bootstrap Modal）：新的存檔（戰場點數 250，四位武將都是 1 級、升級 100 點）──
  await section("K12", async () => {
    const KEY_C = "test_hk_c";
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY_C, p: { ...profile, nickname: "鍵盤武將頁", gold: 250 } });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector("button[data-hero-id]", { timeout: 60000 });
    await waitSync("idle");
    const g0 = await gasActions();
    const pendingUp = () => page.evaluate(() => window.__shenmaMock.pending("upgrade_hero").length);
    const cardLevel = (id) =>
      page.evaluate((id) => {
        const b = document.querySelector(`button[data-hero-id="${id}"]`);
        const m = b && /Lv\.(\d+)/.exec(b.innerText);
        return m ? Number(m[1]) : NaN;
      }, id);
    const upgradeBtn = () => page.locator('[data-testid="hero-detail"] button', { hasText: /^升級/ });
    const detailInfo = () =>
      page.evaluate(() => {
        const d = document.querySelector('[data-testid="hero-detail"]');
        if (!d) return null;
        const btns = [...d.querySelectorAll("button")];
        return { id: d.getAttribute("data-hero-id"), level: Number(d.getAttribute("data-hero-level")),
          disabled: btns.filter((b) => b.disabled).map((b) => b.getAttribute("aria-label") || b.innerText.trim()) };
      });
    const openBy = async (id, key = "Enter") => {
      const t = await tabTo((f) => f.heroId === id);
      await press(key);
      await H.sleep(500);
      return t.n;
    };
    const closeEsc = async () => {
      await press("Escape");
      await H.sleep(600);
      return { f: await focusAt(), open: await page.locator('[data-testid="hero-detail"]').count() };
    };
    const K = {};

    // a：桌面、可升級（關羽 1 級、100 點 ≤ 250）：卡片 Enter 開啟 → 嚴格循環 → Esc 回到卡片
    await page.locator("h2").first().click();
    const t1 = await tabUntil((f) => f.heroId === "guan_yu", 40);
    await press("Enter");
    await H.sleep(500);
    K.a = {
      t1: t1.n,
      dialog: await page.getByRole("dialog", { name: "關羽", exact: true }).count(),
      close: await page.getByRole("button", { name: "關閉武將詳情", exact: true }).count(),
      f: await focusAt(),
      info: await detailInfo(),
      content: await cardContent("main"),
    };
    K.a.cyc = await strictCycle();
    K.a.esc = await closeEsc();
    run.check("K-12a 獨立武將頁（桌面、可升級）：Tab 到關羽的卡片按 Enter 開詳情（對話框名稱「關羽」、關閉鈕「關閉武將詳情」、焦點在對話框裡）；Tab 與 Shift+Tab 各連續 8 下，每下等焦點穩定後都在詳情的 3 個控制項上（頁面有焦點、不是 body），順序循環；最後一個按 Tab 回到第一個、第一個按 Shift+Tab 到最後一個；Esc 關閉、焦點回到關羽的卡片；四張卡片按鈕裡沒有 div 等區塊元素與互動元素",
      t1.n > 0 && K.a.dialog === 1 && K.a.close === 1 && K.a.f.inDialog && K.a.f.hasFocus && K.a.info.level === 1 && K.a.info.disabled.length === 0 &&
        K.a.cyc.ok && K.a.cyc.n === 3 && K.a.esc.open === 0 && K.a.esc.f.heroId === "guan_yu" && K.a.esc.f.tag === "BUTTON" &&
        K.a.content.cards === 4 && K.a.content.blocks === 0 && K.a.content.interactive === 0,
      K.a);

    // b：空白鍵開趙雲、Esc 回到趙雲的卡片；JavaScript 點黃忠的卡片（開啟時焦點不在任何元素上）後 Esc，焦點交給黃忠的卡片
    const t2 = await openBy("zhao_yun", "Space");
    const info2 = await detailInfo();
    const esc2 = await closeEsc();
    await page.evaluate(() => {
      document.activeElement && document.activeElement.blur && document.activeElement.blur();
      document.querySelector('button[data-hero-id="huang_zhong"]').click();
    });
    await H.sleep(500);
    const info3 = await detailInfo();
    const esc3 = await closeEsc();
    K.b = { t2, info2, esc2, info3, esc3 };
    run.check("K-12b 獨立武將頁：趙雲的卡片按空白鍵只開一次詳情、Esc 回到趙雲的卡片；JavaScript 點黃忠的卡片後 Esc，焦點交給黃忠的卡片",
      t2 > 0 && info2 && info2.id === "zhao_yun" && esc2.open === 0 && esc2.f.heroId === "zhao_yun" && info3 && info3.id === "huang_zhong" && esc3.open === 0 && esc3.f.heroId === "huang_zhong",
      K.b);

    // c：390×844、可升級（關羽 1 級）：列表沒有橫向溢出；鍵盤開啟 → 嚴格循環 → 詳情沒有橫向溢出 → Esc 回到卡片
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(400);
    const overflowList = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const t3 = await openBy("guan_yu");
    const info4 = await detailInfo();
    const overflowDetail = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    const shot390 = await H.shot(page, "hero-keyboard-heroes-page-390");
    const cyc390 = await strictCycle();
    const esc4 = await closeEsc();
    K.c = { overflowList, t3, info4, overflowDetail, shot390, cyc390, esc4 };
    run.check("K-12c 獨立武將頁 390×844（可升級）：列表與詳情都沒有橫向溢出；關羽的卡片 Enter 開詳情，兩個方向各連續 8 下都在詳情的 3 個控制項上並循環、邊界直接驗證通過；Esc 回到關羽的卡片",
      !overflowList && t3 > 0 && info4 && info4.id === "guan_yu" && info4.disabled.length === 0 && !overflowDetail && cyc390.ok && cyc390.n === 3 &&
        esc4.open === 0 && esc4.f.heroId === "guan_yu",
      K.c);

    // d：桌面、升級處理中（mock 暫停 upgrade_hero；先等同步閒置，否則 store 改在本機計算、不送請求）
    await page.setViewportSize({ width: 1280, height: 800 });
    await H.sleep(400);
    await waitSync("idle");
    await page.evaluate(() => window.__shenmaMock.hold("upgrade_hero"));
    try {
      const t5 = await openBy("guan_yu");
      await upgradeBtn().focus();
      await press("Enter");
      await page.waitForFunction(() => window.__shenmaMock.pending("upgrade_hero").length === 1, null, { timeout: 15000 });
      await H.sleep(200);
      const d0 = await focusAt();
      const info5 = await detailInfo();
      const d1 = await settle("Tab");
      await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await H.sleep(100);
      const d2b = await focusAt();
      const d2 = await settle("Shift+Tab");
      const cycLoading = await strictCycle();
      await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await H.sleep(100);
      const esc5 = await closeEsc();
      const pendingAfterEsc = await pendingUp();
      await page.evaluate(() => window.__shenmaMock.release("upgrade_hero", "ok"));
      await page.waitForFunction(() => {
        const b = document.querySelector('button[data-hero-id="guan_yu"]');
        return b && /Lv\.2\b/.test(b.innerText);
      }, null, { timeout: 15000 });
      await waitSync("idle");
      const lv5 = await cardLevel("guan_yu");
      K.d = { t5, d0, info5, d1, d2b, d2, cycLoading, esc5, pendingAfterEsc, lv5 };
      run.check("K-12d 獨立武將頁（桌面、升級處理中）：「關閉」與升級都停用、焦點掉到頁面本身；Tab 回到詳情唯一可用的「關閉武將詳情」，焦點再掉到頁面本身時 Shift+Tab 也回到它；只有一個控制項時兩個方向連續循環都停在它上面（頁面有焦點）；焦點在頁面本身時 Esc 關閉詳情、焦點回到關羽的卡片，請求沒有取消也沒有重送，放行後關羽 2 級",
        t5 > 0 && d0.body && info5 && info5.disabled.length === 2 && inBox(d1) && d1.label === "關閉武將詳情" && d2b.body && inBox(d2) && d2.label === "關閉武將詳情" &&
          cycLoading.ok && cycLoading.n === 1 && esc5.open === 0 && esc5.f.heroId === "guan_yu" && esc5.f.tag === "BUTTON" && pendingAfterEsc === 1 && lv5 === 2,
        K.d);

      // e：桌面、點數不足（關羽 2 級升級 200 點 > 150）：升級停用、只剩兩個控制項
      const t6 = await openBy("guan_yu");
      const info6 = await detailInfo();
      const cycPoor = await strictCycle();
      const esc6 = await closeEsc();
      K.e = { t6, info6, cycPoor, esc6 };
      run.check("K-12e 獨立武將頁（桌面、點數不足）：關羽 2 級的升級按鈕停用；兩個方向各連續 6 下都在「關閉武將詳情」與「關閉」之間循環（頁面有焦點），「關閉」按 Tab 回到關閉鈕、關閉鈕按 Shift+Tab 到「關閉」；Esc 回到關羽的卡片",
        t6 > 0 && info6 && info6.level === 2 && info6.disabled.length === 1 && /^升級/.test(info6.disabled[0]) && cycPoor.ok && cycPoor.n === 2 &&
          JSON.stringify(cycPoor.ctl) === JSON.stringify(["關閉武將詳情", "關閉"]) && esc6.open === 0 && esc6.f.heroId === "guan_yu",
        K.e);

      // f：390×844、升級處理中焦點掉到頁面本身 → Tab 回到詳情；再讓焦點留在頁面本身直到處理完：焦點放回「關閉」（趙雲升到 2 級後 200 點 > 50，升級停用）；
      //    之後兩個方向循環照常；再開關羽（點數不足）照樣循環
      await page.setViewportSize({ width: 390, height: 844 });
      await H.sleep(400);
      await waitSync("idle");
      const t7 = await openBy("zhao_yun");
      await upgradeBtn().focus();
      await press("Enter");
      await page.waitForFunction(() => window.__shenmaMock.pending("upgrade_hero").length === 1, null, { timeout: 15000 });
      await H.sleep(200);
      const f0 = await focusAt();
      const f1 = await settle("Tab");
      await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await H.sleep(100);
      const f1b = await focusAt();
      await page.evaluate(() => window.__shenmaMock.release("upgrade_hero", "ok"));
      await page.waitForFunction(() => /升級成功/.test((document.querySelector('[data-testid="hero-detail"]') || {}).innerText || ""), null, { timeout: 15000 });
      await H.sleep(300);
      const f2 = await focusAt();
      const info7 = await detailInfo();
      const cycAfter = await strictCycle();
      const esc7 = await closeEsc();
      const t8 = await openBy("guan_yu");
      const cycPoor390 = await strictCycle();
      const overflow390 = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
      const esc8 = await closeEsc();
      await waitSync("idle");
      const g9 = await gasActions();
      K.f = { t7, f0, f1, f1b, f2, info7, cycAfter, esc7, t8, cycPoor390, overflow390, esc8, upgrades: [g0.upgrade_hero || 0, g9.upgrade_hero || 0], gold: await page.evaluate(() => (document.querySelector("p") || {}).innerText || "") };
      run.check("K-12f 獨立武將頁 390×844：升級處理中焦點掉到頁面本身時 Tab 回到「關閉武將詳情」；焦點留在頁面本身直到處理完 → 焦點放回「關閉」（趙雲 2 級、升級停用）；之後兩個方向循環照常、Esc 回到趙雲的卡片；關羽（點數不足）照樣循環、詳情沒有橫向溢出；這個存檔的升級請求共 2 次",
        t7 > 0 && f0.body && inBox(f1) && f1.label === "關閉武將詳情" && f1b.body && inBox(f2) && f2.name === "關閉" && info7 && info7.level === 2 &&
          cycAfter.ok && cycAfter.n === 2 && esc7.open === 0 && esc7.f.heroId === "zhao_yun" && t8 > 0 && cycPoor390.ok && cycPoor390.n === 2 && !overflow390 &&
          esc8.open === 0 && esc8.f.heroId === "guan_yu" && (g9.upgrade_hero || 0) - (g0.upgrade_hero || 0) === 2,
        K.f);
    } finally {
      await page.evaluate(() => window.__shenmaMock.unhold("upgrade_hero")).catch(() => {});
      await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
    }
    out.K12 = K;
  });

  return run.finish({ out });
}
