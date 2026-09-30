async (page) => {
  // 主頁「關卡選擇」視窗的鍵盤操作（瀏覽器，真 Godot 產物、mock 後端）：不用滑鼠也能從拒絕開戰的提示換關。
  // 使用 harness 內建的「Mock E 無效波」（第 1 波全部無法生成 → 遊戲拒絕開戰）；只有按「迎戰」與選第一關用滑鼠，之後全部用鍵盤。
  // 桌面 1280×800 與 390×844 各跑一次：
  // - K-1 拒絕提示取得焦點 → Tab 到「切換關卡」→ Enter：關卡選擇是有名稱的對話框（role dialog、aria-modal、名稱「關卡選擇」），
  //       焦點進到視窗裡的控制項（不是 body）
  // - K-2 Tab 繞完一圈再多兩下、Shift+Tab 三下：焦點一直在關卡選擇裡，不會進遊戲 iframe 或背後的 HUD／提示
  // - K-3 Esc：只關閉關卡選擇，同一場（battle_id 不變、備戰、波次 0、城池 20）；拒絕提示回來並取得焦點（這個 Esc 沒有連帶關掉提示）；
  //       Tab 到「切換關卡」→ Enter 可以再打開
  // - K-4 巢狀的敵軍預覽：Tab 到某一關的「敵軍預覽」→ Enter：預覽在最上層、焦點在預覽裡，Tab 一圈都在預覽裡；
  //       Esc 只關預覽（關卡選擇還開著），焦點回到同一關的「敵軍預覽」按鈕；再按 Esc 才關閉關卡選擇，提示回來並取得焦點
  // - K-5 Tab 到一張可以出征的其他關卡的「選擇關卡」→ Enter：換到那一關（新的 battle_id、備戰、波次 0、城池 20），視窗與提示都關閉，
  //       焦點在 HUD 的「切換關卡」按鈕（新場上的合理位置，不是 body 或已卸載的節點）
  // - K-6 從 HUD 的「切換關卡」按 Enter 打開 → Esc 取消：焦點回到這顆按鈕，battle_id 不變
  // - K-7 全程沒有結算畫面，金幣／經驗／等級／進度與戰鬥紀錄不變
  // 全部 mock、虛構金鑰 test_stagekey_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin({
    expectedConsole: [
      /拒絕開始第 \d+ 波/,
      /^WARNING: \[WaveManager\] (找不到敵人設定 ID: 'mock_missing_config'|敵人組 'mock_b_grunt' 數量為 0)，跳過此組$/,
      /^\s*at: push_(warning|error) \(core\/variant\/variant_utility\.cpp:\d+\)$/,
      /^\s*GDScript backtrace/,
      /^\s*\[\d+\] \w+ \(res:\/\/[\w/]+\.gd:\d+\)$/,
    ],
  });
  const out = {};
  const KEY = "test_stagekey_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const E = { id: "chapter1_6", name: "Mock E 無效波" };
  const profile = () => ({
    nickname: "鍵盤", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter2_1", heroes: [],
    team: [{ hero_id: "zhao_yun", slot: 1 }],
  });

  // ── 輔助 ──
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const snapshot = async () => {
    const id = "sk-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel: IFRAME, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    const s = await h.jsonValue();
    return { stage: s.stage, battle_id: s.battle_id, gs: s.game_state, wave: s.wave, hp: s.hp, paused: s.world_frozen };
  };
  const dismissSplash = async () => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, IFRAME);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
  const resources = () =>
    page.evaluate((k) => {
      const d = JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}");
      const p = (d.profiles || {})[k] || {};
      return { gold: p.gold, exp: p.exp, level: p.level, max_stage: p.max_stage, logs: (d.battle_logs || []).length };
    }, KEY);
  // 目前的焦點在哪裡：關卡選擇（標題是「關卡選擇」的視窗）、敵軍預覽、拒絕提示、遊戲 iframe、body，以及按鈕的識別
  const focusAt = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      const panels = [...document.querySelectorAll('[class*="modalPanel"]')];
      const stage = panels.find((p) => (p.querySelector('[class*="modalTitle"]') || {}).textContent === "關卡選擇") || null;
      const preview = document.querySelector('[data-testid="enemy-preview"]');
      const card = a && a.closest ? a.closest('[data-testid="stage-card"]') : null;
      return {
        tag: a ? a.tagName : null,
        testid: a && a.getAttribute ? a.getAttribute("data-testid") : null,
        text: a && a.innerText ? a.innerText.trim().slice(0, 12) : "",
        inStage: !!(stage && a && stage.contains(a)),
        inPreview: !!(preview && a && preview.contains(a)),
        inReject: !!(a && a.closest && a.closest('[data-testid="wave-reject"]')),
        rejectSelf: !!(a && a.getAttribute && a.getAttribute("data-testid") === "wave-reject"),
        hudStage: !!(a && a.getAttribute && a.getAttribute("title") === "切換關卡"),
        iframe: !!(a && a.tagName === "IFRAME"),
        body: a === document.body || a === null,
        connected: !!(a && a.isConnected),
        mapId: card ? card.getAttribute("data-map-id") : null,
        access: card ? card.getAttribute("data-access") : null,
      };
    });
  const stageOpen = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[class*="modalPanel"]')].some((p) => (p.querySelector('[class*="modalTitle"]') || {}).textContent === "關卡選擇"));
  const previewOpen = async () => (await page.locator('[data-testid="enemy-preview"]').count()) > 0;
  // 對話框的角色與名稱（無障礙樹）：role dialog、aria-modal、名稱
  const dialogInfo = async () => ({
    stage: await page.getByRole("dialog", { name: "關卡選擇", exact: true }).count(),
    modal: await page.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.getAttribute("aria-label") === "關卡選擇" || (x.getAttribute("aria-labelledby") && (document.getElementById(x.getAttribute("aria-labelledby")) || {}).textContent === "關卡選擇"));
      return d ? d.getAttribute("aria-modal") : null;
    }),
    close: await page.getByRole("button", { name: "關閉關卡選擇", exact: true }).count(),
  });
  // 可以用 Tab 走到的控制項數量（scope 是 stage 或 preview）
  const tabbables = (scope) =>
    page.evaluate((scope) => {
      const root = scope === "preview"
        ? document.querySelector('[data-testid="enemy-preview"]')
        : [...document.querySelectorAll('[class*="modalPanel"]')].find((p) => (p.querySelector('[class*="modalTitle"]') || {}).textContent === "關卡選擇");
      if (!root) return 0;
      return root.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])').length;
    }, scope);
  const press = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(60);
  };
  // 按 Tab（shift 時 Shift+Tab）n 次，記錄每一次的焦點
  const tabWalk = async (n, shift = false) => {
    const seen = [];
    for (let i = 0; i < n; i++) {
      await press(shift ? "Shift+Tab" : "Tab");
      seen.push(await focusAt());
    }
    return seen;
  };
  // 一直按 Tab 到 pred 成立（最多 max 次）；回傳最後的焦點與按的次數
  const tabUntil = async (pred, max = 80) => {
    for (let i = 1; i <= max; i++) {
      await press("Tab");
      const f = await focusAt();
      if (pred(f)) return { f, n: i };
    }
    return { f: await focusAt(), n: -1 };
  };
  const rejectState = () =>
    page.evaluate(() => {
      const n = document.querySelector('[data-testid="wave-reject"]');
      return n ? { focused: document.activeElement === n || n.contains(document.activeElement) } : null;
    });
  const startRejected = async () => {
    const idx = await H.bridgeLen(page);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const msg = await H.waitBridge(page, idx, { type: "wave_rejected" }, 30000);
    await page.waitForSelector('[data-testid="wave-reject"]', { timeout: 10000 });
    await H.sleep(400);
    return msg.wave;
  };
  // 從拒絕提示用鍵盤打開關卡選擇：焦點在提示上 → Tab 到「切換關卡」→ Enter
  const openFromReject = async () => {
    const t = await tabUntil((f) => f.testid === "wave-reject-exit", 5);
    await press("Enter");
    await H.sleep(400);
    return { reachedExit: t.n > 0, after: await focusAt(), open: await stageOpen() };
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `stage-keyboard-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };

  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, p: profile() });
  });

  const flow = async (tag, vp) => {
    await page.setViewportSize(vp);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, E.name);
    await dismissSplash();
    const res0 = await resources();
    const s0 = await snapshot();
    const wave1 = await startRejected();
    const r0 = await rejectState();

    // K-1：拒絕提示 → Tab → Enter 打開關卡選擇
    const o1 = await openFromReject();
    const dlg = await dialogInfo();
    const shot1 = await H.shot(page, `stage-keyboard-${tag}-open`);
    run.check(`K-1 ${tag} 拒絕提示取得焦點，Tab 到「切換關卡」按 Enter：關卡選擇是對話框（名稱「關卡選擇」、aria-modal、關閉鈕名稱「關閉關卡選擇」），焦點進到視窗裡（不是 body）`,
      wave1 === 1 && r0 && r0.focused && o1.reachedExit && o1.open && o1.after.inStage && !o1.after.body && dlg.stage === 1 && dlg.modal === "true" && dlg.close === 1,
      { reject: r0, open: o1, dialog: dlg, shot1 });

    // K-2：Tab 一圈再多兩下、Shift+Tab 三下都留在關卡選擇裡
    const n2 = await tabbables("stage");
    const fwd = await tabWalk(n2 + 2);
    const back = await tabWalk(3, true);
    const outside = [...fwd, ...back].filter((f) => !f.inStage);
    run.check(`K-2 ${tag} Tab ${n2 + 2} 下（視窗內 ${n2} 個控制項）與 Shift+Tab 3 下：焦點一直在關卡選擇裡，沒有進遊戲 iframe、HUD 或拒絕提示`,
      n2 > 2 && outside.length === 0, { tabbables: n2, outside: outside.slice(0, 4), first: fwd.slice(0, 3) });

    // K-3：Esc 取消 → 同一場、提示回來並取得焦點；可以再打開
    await press("Escape");
    await H.sleep(400);
    const closed3 = !(await stageOpen());
    const r3 = await rejectState();
    const s3 = await snapshot();
    const o3 = await openFromReject();
    run.check(`K-3 ${tag} Esc 只關閉關卡選擇：同一場（battle_id 不變、備戰、波次 0、城池 20、沒有暫停），拒絕提示回來並取得焦點；Tab 到「切換關卡」按 Enter 可以再打開`,
      closed3 && r3 && r3.focused && s3.battle_id === s0.battle_id && s3.stage === E.id && s3.gs === 1 && s3.wave === 0 && s3.hp === 20 && !s3.paused && o3.open && o3.after.inStage,
      { closed3, reject: r3, s0, s3, reopen: o3 });

    // K-4：巢狀的敵軍預覽
    const t4 = await tabUntil((f) => f.testid === "enemy-preview-open" && f.inStage);
    const opener = t4.f.mapId;
    await press("Enter");
    await H.sleep(400);
    const p4 = { open: await previewOpen(), focus: await focusAt() };
    const n4 = await tabbables("preview");
    const walk4 = await tabWalk(n4 + 1);
    const out4 = walk4.filter((f) => !f.inPreview);
    await press("Escape");
    await H.sleep(300);
    const afterEsc1 = { preview: await previewOpen(), stage: await stageOpen(), focus: await focusAt() };
    await press("Escape");
    await H.sleep(400);
    const afterEsc2 = { stage: await stageOpen(), reject: await rejectState() };
    const s4 = await snapshot();
    run.check(`K-4 ${tag} 巢狀的敵軍預覽：Tab 到「敵軍預覽」按 Enter → 焦點在預覽裡，Tab 一圈都在預覽裡；Esc 只關預覽（關卡選擇還開著），焦點回到同一關的「敵軍預覽」；再按 Esc 才關閉關卡選擇，提示回來並取得焦點，同一場`,
      t4.n > 0 && p4.open && p4.focus.inPreview && n4 > 1 && out4.length === 0 &&
        !afterEsc1.preview && afterEsc1.stage && afterEsc1.focus.testid === "enemy-preview-open" && afterEsc1.focus.mapId === opener &&
        !afterEsc2.stage && afterEsc2.reject && afterEsc2.reject.focused && s4.battle_id === s0.battle_id && s4.gs === 1,
      { reached: t4.n, opener, preview: p4, tabbables: n4, outside: out4.slice(0, 3), afterEsc1, afterEsc2, s4 });

    // K-5：Tab 到可以出征的其他關卡 → Enter 換關
    const o5 = await openFromReject();
    const t5 = await tabUntil((f) => f.testid === "stage-select" && f.inStage && f.access === "playable" && f.mapId !== E.id);
    const target = t5.f.mapId;
    const idx5 = await H.bridgeLen(page);
    await press("Enter");
    const switched = await H.waitBridge(page, idx5, { type: "update_stats", wave: 0, game_state: 1 }, 20000).then(() => true, () => false);
    await H.sleep(800);
    const s5 = await snapshot();
    const f5 = await focusAt();
    const after5 = { stage: await stageOpen(), reject: await rejectState() };
    const shot5 = await H.shot(page, `stage-keyboard-${tag}-switched`);
    run.check(`K-5 ${tag} Tab 到可以出征的其他關卡的「選擇關卡」按 Enter：換到那一關（新的 battle_id、備戰、波次 0、城池 20），視窗與提示都關閉，焦點在 HUD 的「切換關卡」`,
      o5.open && t5.n > 0 && switched && s5.stage === target && s5.battle_id && s5.battle_id !== s0.battle_id && s5.gs === 1 && s5.wave === 0 && s5.hp === 20 &&
        !after5.stage && after5.reject === null && f5.hudStage && f5.connected,
      { reopen: o5.open, reached: t5.n, target, switched, s5, focus: f5, after5, shot5 });

    // K-6：從 HUD 的「切換關卡」按 Enter 打開 → Esc：焦點回到這顆按鈕，同一場
    let o6 = null;
    if (f5.hudStage) {
      await press("Enter");
      await H.sleep(400);
      o6 = { open: await stageOpen(), focus: await focusAt() };
      await press("Escape");
      await H.sleep(400);
      o6.closed = !(await stageOpen());
      o6.back = await focusAt();
    }
    const s6 = await snapshot();
    run.check(`K-6 ${tag} 在 HUD 的「切換關卡」按 Enter 打開關卡選擇（焦點在視窗裡），Esc 取消後焦點回到這顆按鈕、同一場`,
      !!o6 && o6.open && o6.focus.inStage && o6.closed && o6.back.hudStage && s6.battle_id === s5.battle_id,
      { o6, s6 });

    const res1 = await resources();
    const results = await page.locator('[data-testid="result-card"]').count();
    out[tag] = { res0, res1, s0, s5 };
    run.check(`K-7 ${tag} 拒絕、取消、預覽、換關都沒有結算：沒有結算畫面，金幣／經驗／等級／進度與戰鬥紀錄不變`,
      results === 0 && JSON.stringify(res1) === JSON.stringify(res0), { res0, res1, results });
  };
  await section("desktop", () => flow("desktop", { width: 1280, height: 800 }));
  await section("m390", () => flow("390", { width: 390, height: 844 }));

  return run.finish({ out });
}
