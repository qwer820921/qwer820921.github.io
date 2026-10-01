async (page) => {
  // 主頁「玩家資訊」視窗與從它打開關卡選擇的鍵盤操作（瀏覽器，真 Godot 產物、mock 後端）：全程只用鍵盤（起點是用滑鼠點 HUD 的地圖名稱，那裡不是控制項）。
  // 桌面 1280×800 與 390×844 各跑一次 P-1～P-9：
  // - P-1 從 HUD 用 Shift+Tab 走到「玩家資訊」按鈕（有可讀的名稱）→ Enter：玩家資訊是有名稱的對話框（role dialog、aria-modal、名稱「玩家資訊」），
  //       焦點進到視窗裡（關閉鈕「關閉玩家資訊」），不是 body
  // - P-2 Tab 繞完一圈再多兩下、Shift+Tab 三下：焦點一直在玩家資訊裡，不會進遊戲 iframe 或背後的 HUD
  // - P-3 Esc：只關閉玩家資訊，焦點回到 HUD 的「玩家資訊」按鈕；同一場（battle_id 不變、備戰、波次 0、城池 20）
  // - P-4 切換金鑰的表單：Tab 到「切換」（aria-expanded false）→ Enter 展開（aria-expanded true、焦點留在「切換」）→ Tab 到金鑰輸入框 → Shift+Tab 回「切換」
  //       → Enter 收起（焦點仍在「切換」）；開合期間沒有送出任何後端請求（沒有切換帳號、沒有同步）；Esc 關閉、焦點回到 HUD 按鈕
  // - P-5 玩家資訊 → Tab 到「關卡選擇」→ Enter：玩家資訊關閉、關卡選擇打開，焦點在關卡選擇裡（不是 body、不是已卸載的按鈕）；Tab 一圈都在關卡選擇裡
  // - P-6 巢狀的敵軍預覽：Tab 到「敵軍預覽」→ Enter → 焦點在預覽裡；Esc 只關預覽，焦點回到同一關的「敵軍預覽」，關卡選擇還開著
  // - P-7 Esc 取消關卡選擇：焦點回到 HUD 的「玩家資訊」按鈕（玩家資訊已經關閉）；同一場、資源不變
  // - P-8 再走一次玩家資訊 → 關卡選擇 → Tab 到可以出征的其他關卡的「選擇關卡」→ Enter：換到那一關（新的 battle_id、備戰），
  //       視窗都關閉，焦點在 HUD 上仍存在的控制項（不是 body）
  // - P-9 全程沒有結算畫面，金幣／經驗／等級／進度與戰鬥紀錄不變
  // 只跑桌面：
  // - P-10 用鍵盤輸入另一把金鑰並按 Enter 切換：成功後表單收起，焦點回到「切換」（不是 body），Esc 仍可關閉玩家資訊
  // - Q 「選擇其他關卡」入口（存檔進度是資料未完成的關卡「Mock PK 未完成」→ 不能出征的說明；這張關卡只在這支腳本加進 mock 名單，__shenma_pik_fixture）：說明取得焦點 → Tab 到「選擇其他關卡」→ Enter 打開關卡選擇（焦點在視窗裡）
  //   → Esc 取消：說明還在、焦點回到「選擇其他關卡」、沒有送出關卡資料；再打開 → Tab 到可以出征的關卡 → Enter：開始新的一場，焦點在 HUD 的「切換關卡」
  // 全部 mock、虛構金鑰 test_pik_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const KEY = "test_pik_a";
  const KEY_B = "test_pik_b";
  const KEY_Q = "test_pik_q";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const START = { id: "chapter1_4", name: "Mock W 勝利兩波" };
  // 資料未完成的關卡（有路線、沒有波次）：存檔進度停在這一關時主頁顯示不能出征的說明
  const BLOCKED = { id: "chapter2_9", name: "Mock PK 未完成" };
  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const EXTRA_MAPS = [{
    map_id: BLOCKED.id, chapter: 2, name: BLOCKED.name, unlock_stage: BLOCKED.id,
    path_json: { cols: 14, rows: 11, paths: { path_a: [[0, ROW], [13, ROW]] }, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" },
    waves: [],
  }];
  await page.context().addInitScript((maps) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_pik_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (j && j.status === 200 && Array.isArray(j.maps)) {
            j.maps = [...j.maps, ...maps];
            return new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          return res;
        }
      }
      return inner(input, init);
    };
  }, EXTRA_MAPS);
  const profile = (nickname, maxStage) => ({
    nickname, level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: maxStage, heroes: [],
    team: [{ hero_id: "zhao_yun", slot: 1 }],
  });

  // ── 輔助 ──
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const snapshot = async () => {
    const id = "pik-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel: IFRAME, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    const s = await h.jsonValue();
    return { stage: s.stage, battle_id: s.battle_id, gs: s.game_state, wave: s.wave, hp: s.hp };
  };
  const dismissSplash = async () => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, IFRAME);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
  const resources = (k) =>
    page.evaluate((k) => {
      const d = JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}");
      const p = (d.profiles || {})[k] || {};
      return { gold: p.gold, exp: p.exp, level: p.level, max_stage: p.max_stage, logs: (d.battle_logs || []).length };
    }, k);
  const gasCount = async () => (await H.gasLog(page)).length;
  // 目前的焦點：玩家資訊（標題「玩家資訊」的視窗）、關卡選擇、敵軍預覽、HUD 的兩顆按鈕、不能出征的說明、遊戲 iframe、body
  const focusAt = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      const panels = [...document.querySelectorAll('[class*="modalPanel"]')];
      const titled = (t) => panels.find((p) => (p.querySelector('[class*="modalTitle"]') || {}).textContent === t) || null;
      const player = titled("玩家資訊");
      const stage = titled("關卡選擇");
      const preview = document.querySelector('[data-testid="enemy-preview"]');
      const card = a && a.closest ? a.closest('[data-testid="stage-card"]') : null;
      return {
        tag: a ? a.tagName : null,
        testid: a && a.getAttribute ? a.getAttribute("data-testid") : null,
        text: a && a.innerText ? a.innerText.trim().slice(0, 12) : "",
        label: a && a.getAttribute ? a.getAttribute("aria-label") : null,
        expanded: a && a.getAttribute ? a.getAttribute("aria-expanded") : null,
        placeholder: a && a.getAttribute ? a.getAttribute("placeholder") : null,
        inPlayer: !!(player && a && player.contains(a)),
        inStage: !!(stage && a && stage.contains(a)),
        inPreview: !!(preview && a && preview.contains(a)),
        hudAvatar: !!(a && a.className && String(a.className).includes("hudAvatar")),
        hudStage: !!(a && a.getAttribute && a.getAttribute("title") === "切換關卡"),
        inBlocked: !!(a && a.closest && a.closest('[data-testid="stage-blocked"]')),
        iframe: !!(a && a.tagName === "IFRAME"),
        body: a === document.body || a === null,
        connected: !!(a && a.isConnected),
        mapId: card ? card.getAttribute("data-map-id") : null,
        access: card ? card.getAttribute("data-access") : null,
      };
    });
  const isOpen = (title) =>
    page.evaluate((t) => [...document.querySelectorAll('[class*="modalPanel"]')].some((p) => (p.querySelector('[class*="modalTitle"]') || {}).textContent === t), title);
  const previewOpen = async () => (await page.locator('[data-testid="enemy-preview"]').count()) > 0;
  // 玩家資訊的對話框角色與名稱（無障礙樹）
  const playerDialog = async () => ({
    dialog: await page.getByRole("dialog", { name: "玩家資訊", exact: true }).count(),
    modal: await page.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => (x.getAttribute("aria-labelledby") && (document.getElementById(x.getAttribute("aria-labelledby")) || {}).textContent === "玩家資訊") || x.getAttribute("aria-label") === "玩家資訊");
      return d ? d.getAttribute("aria-modal") : null;
    }),
    close: await page.getByRole("button", { name: "關閉玩家資訊", exact: true }).count(),
  });
  // 可以用 Tab 走到的控制項數量（標題是 title 的視窗）
  const tabbables = (title) =>
    page.evaluate((t) => {
      const root = [...document.querySelectorAll('[class*="modalPanel"]')].find((p) => (p.querySelector('[class*="modalTitle"]') || {}).textContent === t);
      if (!root) return 0;
      return root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])').length;
    }, title);
  const press = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(60);
  };
  const tabWalk = async (n, shift = false) => {
    const seen = [];
    for (let i = 0; i < n; i++) {
      await press(shift ? "Shift+Tab" : "Tab");
      seen.push(await focusAt());
    }
    return seen;
  };
  // 一直按 Tab（shift 時 Shift+Tab）到 pred 成立（最多 max 次）
  const tabUntil = async (pred, max = 60, shift = false) => {
    for (let i = 1; i <= max; i++) {
      await press(shift ? "Shift+Tab" : "Tab");
      const f = await focusAt();
      if (pred(f)) return { f, n: i };
    }
    return { f: await focusAt(), n: -1 };
  };
  // 起點：用滑鼠點 HUD 的地圖名稱（不是控制項，焦點離開遊戲 iframe），再用 Shift+Tab 走到「玩家資訊」按鈕
  const toAvatar = async () => {
    await page.locator('[class*="hudMapName"]').click();
    await H.sleep(150);
    return tabUntil((f) => f.hudAvatar, 6, true);
  };
  // 在 HUD 的「玩家資訊」按鈕上按 Enter 打開玩家資訊
  const openPlayer = async () => {
    const t = await toAvatar();
    await press("Enter");
    await H.sleep(400);
    return { reached: t.n > 0, open: await isOpen("玩家資訊"), after: await focusAt() };
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `player-info-keyboard-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
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
    await page.evaluate(({ k, kb, kq, p, pb, pq }) => {
      localStorage.setItem("__shenma_pik_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p, [kb]: pb, [kq]: pq }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, kb: KEY_B, kq: KEY_Q, p: profile("鍵盤", "chapter2_1"), pb: profile("另一位", "chapter1_2"), pq: profile("缺關", BLOCKED.id) });
  });

  const flow = async (tag, vp) => {
    await page.setViewportSize(vp);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, START.name);
    await dismissSplash();
    const res0 = await resources(KEY);
    const s0 = await snapshot();
    const avatarName = await page.getByRole("button", { name: "玩家資訊", exact: true }).count();

    // P-1：Shift+Tab 到「玩家資訊」→ Enter
    const o1 = await openPlayer();
    const dlg = await playerDialog();
    const shot1 = await H.shot(page, `player-info-keyboard-${tag}-open`);
    run.check(`P-1 ${tag} 從 HUD 用 Shift+Tab 走到「玩家資訊」按鈕（有可讀的名稱）按 Enter：玩家資訊是對話框（名稱「玩家資訊」、aria-modal、關閉鈕「關閉玩家資訊」），焦點進到視窗裡（不是 body）`,
      avatarName === 1 && o1.reached && o1.open && o1.after.inPlayer && !o1.after.body && dlg.dialog === 1 && dlg.modal === "true" && dlg.close === 1,
      { avatarName, open: o1, dialog: dlg, shot1 });

    // P-2：Tab 一圈再多兩下、Shift+Tab 三下
    const n2 = await tabbables("玩家資訊");
    const fwd = await tabWalk(n2 + 2);
    const back = await tabWalk(3, true);
    const outside = [...fwd, ...back].filter((f) => !f.inPlayer);
    run.check(`P-2 ${tag} Tab ${n2 + 2} 下（視窗內 ${n2} 個控制項）與 Shift+Tab 3 下：焦點一直在玩家資訊裡，沒有進遊戲 iframe 或 HUD`,
      n2 >= 3 && outside.length === 0, { tabbables: n2, outside: outside.slice(0, 4), first: fwd.slice(0, 3) });

    // P-3：Esc 關閉 → 焦點回到 HUD 的「玩家資訊」按鈕、同一場
    await press("Escape");
    await H.sleep(400);
    const closed3 = !(await isOpen("玩家資訊"));
    const f3 = await focusAt();
    const s3 = await snapshot();
    run.check(`P-3 ${tag} Esc 關閉玩家資訊：焦點回到 HUD 的「玩家資訊」按鈕；同一場（battle_id 不變、備戰、波次 0、城池 20）`,
      closed3 && f3.hudAvatar && f3.connected && s3.battle_id === s0.battle_id && s3.gs === 1 && s3.wave === 0 && s3.hp === 20,
      { closed3, focus: f3, s0, s3 });

    // P-4：切換金鑰的表單開合
    const o4 = await openPlayer();
    const g0 = await gasCount();
    const t4 = await tabUntil((f) => f.inPlayer && f.text === "切換", 10);
    const before4 = t4.f.expanded;
    await press("Enter");
    await H.sleep(300);
    const opened4 = { form: (await page.locator('div[class*="modalPanel"] input[placeholder^="例："]').count()) === 1, focus: await focusAt() };
    await press("Tab");
    const input4 = await focusAt();
    await press("Shift+Tab");
    const back4 = await focusAt();
    await press("Enter");
    await H.sleep(300);
    const closed4 = { form: (await page.locator('div[class*="modalPanel"] input[placeholder^="例："]').count()) === 0, focus: await focusAt() };
    const g1 = await gasCount();
    await press("Escape");
    await H.sleep(400);
    const esc4 = { open: await isOpen("玩家資訊"), focus: await focusAt() };
    out[tag + "_P4"] = { open: o4.open, reached: t4.n, before4, opened4, input4, back4, closed4, gas: [g0, g1], esc4 };
    run.check(`P-4 ${tag} 切換金鑰的表單：Tab 到「切換」（aria-expanded false）→ Enter 展開（true、焦點留在「切換」）→ Tab 到金鑰輸入框 → Shift+Tab 回「切換」→ Enter 收起（焦點仍在「切換」）；開合期間沒有任何後端請求；Esc 關閉、焦點回到 HUD 按鈕`,
      o4.open && t4.n > 0 && before4 === "false" && opened4.form && opened4.focus.text === "切換" && opened4.focus.expanded === "true" &&
        input4.tag === "INPUT" && input4.inPlayer && back4.text === "切換" && closed4.form && closed4.focus.text === "切換" && closed4.focus.expanded === "false" &&
        g1 === g0 && !esc4.open && esc4.focus.hudAvatar,
      out[tag + "_P4"]);

    // P-5：玩家資訊 → 關卡選擇
    const o5 = await openPlayer();
    const t5 = await tabUntil((f) => f.inPlayer && f.text === "關卡選擇", 12);
    await press("Enter");
    await H.sleep(500);
    const after5 = { player: await isOpen("玩家資訊"), stage: await isOpen("關卡選擇"), focus: await focusAt() };
    const n5 = await tabbables("關卡選擇");
    const walk5 = [...(await tabWalk(n5 + 2)), ...(await tabWalk(3, true))];
    const out5 = walk5.filter((f) => !f.inStage);
    const shot5 = await H.shot(page, `player-info-keyboard-${tag}-stage`);
    run.check(`P-5 ${tag} 玩家資訊 Tab 到「關卡選擇」按 Enter：玩家資訊關閉、關卡選擇打開，焦點在關卡選擇裡（不是 body）；Tab ${n5 + 2} 下與 Shift+Tab 3 下都在關卡選擇裡`,
      o5.open && t5.n > 0 && !after5.player && after5.stage && after5.focus.inStage && !after5.focus.body && n5 > 2 && out5.length === 0,
      { reached: t5.n, after5, tabbables: n5, outside: out5.slice(0, 3), shot5 });

    // P-6：巢狀的敵軍預覽
    const t6 = await tabUntil((f) => f.testid === "enemy-preview-open" && f.inStage);
    const opener = t6.f.mapId;
    await press("Enter");
    await H.sleep(400);
    const p6 = { open: await previewOpen(), focus: await focusAt() };
    await press("Escape");
    await H.sleep(300);
    const esc6 = { preview: await previewOpen(), stage: await isOpen("關卡選擇"), focus: await focusAt() };
    run.check(`P-6 ${tag} 巢狀的敵軍預覽：Enter 打開後焦點在預覽裡；Esc 只關預覽（關卡選擇還開著），焦點回到同一關的「敵軍預覽」`,
      t6.n > 0 && p6.open && p6.focus.inPreview && !esc6.preview && esc6.stage && esc6.focus.testid === "enemy-preview-open" && esc6.focus.mapId === opener,
      { reached: t6.n, opener, p6, esc6 });

    // P-7：Esc 取消關卡選擇 → 焦點回到 HUD 的「玩家資訊」按鈕（玩家資訊已經關閉）
    await press("Escape");
    await H.sleep(400);
    const f7 = await focusAt();
    const stage7 = await isOpen("關卡選擇");
    const player7 = await isOpen("玩家資訊");
    const s7 = await snapshot();
    const res7 = await resources(KEY);
    run.check(`P-7 ${tag} Esc 取消關卡選擇：視窗都關閉，焦點回到 HUD 的「玩家資訊」按鈕（不是 body）；同一場（battle_id 不變、備戰、波次 0），資源不變`,
      !stage7 && !player7 && f7.hudAvatar && f7.connected && !f7.body && s7.battle_id === s0.battle_id && s7.gs === 1 && s7.wave === 0 && JSON.stringify(res7) === JSON.stringify(res0),
      { focus: f7, stage7, player7, s7, res7 });

    // P-8：玩家資訊 → 關卡選擇 → 可以出征的其他關卡 → Enter 換關
    await openPlayer();
    await tabUntil((f) => f.inPlayer && f.text === "關卡選擇", 12);
    await press("Enter");
    await H.sleep(500);
    const t8 = await tabUntil((f) => f.testid === "stage-select" && f.inStage && f.access === "playable" && f.mapId !== START.id);
    const target = t8.f.mapId;
    const idx8 = await H.bridgeLen(page);
    await press("Enter");
    const switched = await H.waitBridge(page, idx8, { type: "update_stats", wave: 0, game_state: 1 }, 20000).then(() => true, () => false);
    await H.sleep(800);
    const s8 = await snapshot();
    const f8 = await focusAt();
    const open8 = { stage: await isOpen("關卡選擇"), player: await isOpen("玩家資訊") };
    run.check(`P-8 ${tag} 玩家資訊 → 關卡選擇 → Tab 到可以出征的其他關卡按 Enter：換到那一關（新的 battle_id、備戰、波次 0），視窗都關閉，焦點在 HUD 上仍存在的按鈕（不是 body）`,
      t8.n > 0 && switched && s8.stage === target && !!s8.battle_id && s8.battle_id !== s0.battle_id && s8.gs === 1 && s8.wave === 0 &&
        !open8.stage && !open8.player && (f8.hudAvatar || f8.hudStage) && f8.connected && !f8.body,
      { reached: t8.n, target, switched, s8, focus: f8, open8 });

    const res1 = await resources(KEY);
    const results = await page.locator('[data-testid="result-card"]').count();
    run.check(`P-9 ${tag} 開關玩家資訊、表單開合、取消與換關都沒有結算：沒有結算畫面，金幣／經驗／等級／進度與戰鬥紀錄不變`,
      results === 0 && JSON.stringify(res1) === JSON.stringify(res0), { res0, res1, results });
  };
  await section("desktop", () => flow("desktop", { width: 1280, height: 800 }));
  await section("m390", () => flow("390", { width: 390, height: 844 }));

  // P-10：用鍵盤切換金鑰（成功）：表單收起後焦點回到「切換」，Esc 仍可關閉
  await section("switch", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await dismissSplash();
    const o = await openPlayer();
    await tabUntil((f) => f.inPlayer && f.text === "切換", 10);
    await press("Enter");
    await H.sleep(300);
    await press("Tab");
    const input = await focusAt();
    await page.keyboard.type(KEY_B);
    await press("Enter");
    await page.waitForFunction(() => /存檔讀取成功/.test((document.querySelector('div[class*="modalPanel"] .alert-success') || {}).innerText || ""), null, { timeout: 60000 });
    await H.sleep(300);
    const after = { form: (await page.locator('div[class*="modalPanel"] input[placeholder^="例："]').count()) === 0, focus: await focusAt() };
    const key = await page.evaluate(() => localStorage.getItem("shenma_player_key"));
    await press("Escape");
    await H.sleep(400);
    const esc = { open: await isOpen("玩家資訊"), focus: await focusAt() };
    out.P10 = { open: o.open, input, after, key, esc };
    run.check("P-10 桌面 用鍵盤輸入另一把金鑰按 Enter：切換成功、表單收起，焦點回到「切換」（不是 body）；Esc 仍可關閉玩家資訊，焦點回到 HUD 按鈕",
      o.open && input.tag === "INPUT" && after.form && after.focus.inPlayer && after.focus.text === "切換" && !after.focus.body && key === KEY_B && !esc.open && esc.focus.hudAvatar,
      out.P10);
  });

  // Q：「選擇其他關卡」入口（不能出征的說明）
  await section("Q", async () => {
    await page.evaluate((k) => { localStorage.setItem("shenma_player_key", k); sessionStorage.removeItem("shenma_player_state"); }, KEY_Q);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await page.waitForSelector('[data-testid="stage-blocked"]', { timeout: 60000 });
    await H.sleep(2500);
    const g0 = (await H.gasLog(page)).length;
    const idx0 = await H.bridgeLen(page);
    const f0 = await focusAt();
    const t1 = await tabUntil((f) => f.testid === "stage-blocked-choose", 6);
    await press("Enter");
    await H.sleep(400);
    const o1 = { open: await isOpen("關卡選擇"), focus: await focusAt() };
    await press("Escape");
    await H.sleep(400);
    const c1 = { open: await isOpen("關卡選擇"), blocked: (await page.locator('[data-testid="stage-blocked"]').count()) === 1, focus: await focusAt() };
    const payloads = await page.evaluate((i) => (window.__bridgeLog || []).slice(i).filter((m) => m.type === "update_stats").length, idx0);
    await press("Enter");
    await H.sleep(400);
    const o2 = { open: await isOpen("關卡選擇"), focus: await focusAt() };
    const t2 = await tabUntil((f) => f.testid === "stage-select" && f.inStage && f.access === "playable");
    const target = t2.f.mapId;
    const idx2 = await H.bridgeLen(page);
    await press("Enter");
    const started = await H.waitBridge(page, idx2, { type: "update_stats", wave: 0, game_state: 1 }, 60000).then(() => true, () => false);
    await H.sleep(800);
    const s2 = await snapshot();
    const f2 = await focusAt();
    const g1 = (await H.gasLog(page)).length;
    out.Q = { f0, reached: t1.n, o1, c1, payloads, o2, reached2: t2.n, target, started, s2, f2, gas: [g0, g1], shot: await H.shot(page, "player-info-keyboard-q-switched") };
    run.check("Q-1 「選擇其他關卡」入口：說明取得焦點 → Tab 到「選擇其他關卡」→ Enter 打開關卡選擇（焦點在視窗裡）→ Esc 取消：說明還在、焦點回到「選擇其他關卡」、沒有開新的一場",
      f0.inBlocked && t1.n > 0 && o1.open && o1.focus.inStage && !c1.open && c1.blocked && c1.focus.testid === "stage-blocked-choose" && payloads === 0,
      { f0, reached: t1.n, o1, c1, payloads });
    run.check("Q-2 再按 Enter 打開 → Tab 到可以出征的關卡按 Enter：開始新的一場（備戰、波次 0），說明消失，焦點在 HUD 的「切換關卡」（不是 body）",
      o2.open && o2.focus.inStage && t2.n > 0 && started && s2.stage === target && s2.gs === 1 && s2.wave === 0 && f2.hudStage && f2.connected,
      { o2, reached: t2.n, target, started, s2, f2 });
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_pik_fixture")).catch(() => {});
  return run.finish({ out });
}
