async (page) => {
  // 拒絕開戰後的出口（瀏覽器，真 Godot 產物）：從拒絕提示的出口離開後真的能換關。
  // 使用 harness 內建的「Mock E 無效波」（第 1 波全部無法生成 → 遊戲拒絕開戰）。檢查：
  // - X：主頁（桌面 1280×800 與 390×844）拒絕 → 出口「切換關卡」→ 關卡選擇在最上層：在原本提示範圍內找一張可以出征的關卡，
  //      用 elementFromPoint 確認那一點最上層是關卡的「選擇關卡」按鈕，再用真實滑鼠點那一點（不用 force、不用 dispatchEvent）
  //      取消選關回到戰場：提示回來並取得焦點、Esc 關閉、場次不變；再按迎戰又被拒絕，出口可以再打開關卡選擇
  //      實際換到新關卡才有新的 battle_id；沒有結算、玩家資源與戰鬥紀錄不變
  // - Y：獨立戰鬥頁（390×844）拒絕 → 出口「返回關卡選擇」→ 用真實滑鼠點有效關卡 → 進入新的一場（新的 battle_id），沒有結算、資源不變
  // - X-0 前置：先離開上一支腳本留下的頁面，再兩次清理（隔離與非隔離）、注入固定的存檔並核對五個資源欄位；清理前後的頁面、Service Worker
  //   與資料另存在 out.setup。前置沒有完成就不跑 X／Y（具名失敗）；資源比較先確定欄位都在、型別正確、是注入時的值，再比「不變」
  // 全部 mock、虛構金鑰 test_rejexit_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin({
    expectedConsole: [
      /拒絕開始第 \d+ 波/,
      /^WARNING: \[WaveManager\] (找不到敵人設定 ID: 'mock_missing_config'|敵人組 'mock_b_grunt' 數量為 0)，跳過此組$/,
      /^\s*at: push_(warning|error) \(core[\\/]variant[\\/]variant_utility\.cpp:\d+\)$/,
      /^\s*GDScript backtrace/,
      /^\s*\[\d+\] \w+ \(res:\/\/[\w/]+\.gd:\d+\)$/,
    ],
  });
  const out = {};
  const KEY = "test_rejexit_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const E = { id: "chapter1_6", name: "Mock E 無效波" };
  const profile = () => ({
    nickname: "換關", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter2_1", heroes: [],
    team: [{ hero_id: "zhao_yun", slot: 1 }],
  });

  // ── 輔助 ──
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const snapshot = async (sel) => {
    const id = "rx-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    const s = await h.jsonValue();
    return { stage: s.stage, battle_id: s.battle_id, gs: s.game_state, wave: s.wave, hp: s.hp, enemies: Object.keys(s.enemy_kind || {}).length };
  };
  const dismissSplash = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
  // 玩家資源與戰鬥紀錄（mock 資料庫）
  const resources = () =>
    page.evaluate((k) => {
      const d = JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}");
      const p = (d.profiles || {})[k] || {};
      return { gold: p.gold, exp: p.exp, level: p.level, max_stage: p.max_stage, logs: (d.battle_logs || []).length };
    }, KEY);
  // 資源比較要先確定五個欄位都在而且型別對（JSON.stringify 會省略 undefined，兩邊都缺也會相等），再比內容；注入的存檔是固定的字面值
  const RES_FIELDS = ["gold", "exp", "level", "max_stage", "logs"];
  const BASE_RES = { gold: 1000, exp: 0, level: 1, max_stage: "chapter2_1", logs: 0 };
  const resValid = (r) =>
    !!r && Number.isFinite(r.gold) && Number.isFinite(r.exp) && Number.isFinite(r.level) && typeof r.max_stage === "string" && r.max_stage !== "" && Number.isFinite(r.logs);
  const resIsBase = (r) => resValid(r) && RES_FIELDS.every((k) => r[k] === BASE_RES[k]);
  // 診斷：上一支腳本留下的頁面、Service Worker 與資料（清理前、清理失敗後、清理後各記一次；頁面卡住時最多等 10 秒）
  const originState = async (label) => {
    const url = page.url();
    const probe = page.evaluate(async (k) => {
      let regs = null;
      try {
        regs = (await navigator.serviceWorker.getRegistrations()).map((r) => ({ scope: r.scope, active: r.active ? r.active.state : null, installing: r.installing ? r.installing.state : null, waiting: r.waiting ? r.waiting.state : null }));
      } catch { regs = null; }
      let db = null;
      try { db = JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "null"); } catch { db = "unreadable"; }
      return {
        readyState: document.readyState, isolated: window.crossOriginIsolated,
        controller: navigator.serviceWorker && navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null, regs,
        mockDb: db && typeof db === "object" ? { profile: !!(db.profiles && db.profiles[k]), profiles: Object.keys(db.profiles || {}).length, logs: (db.battle_logs || []).length } : db,
        playerKey: localStorage.getItem("shenma_player_key"),
        flags: Object.keys(localStorage).filter((x) => x.startsWith("__shenma_")),
        localItems: localStorage.length, sessionItems: sessionStorage.length,
      };
    }, KEY).catch((e) => ({ error: String(e).slice(0, 200) }));
    const st = await Promise.race([probe, H.sleep(10000).then(() => ({ error: "10 秒內讀不到頁面狀態" }))]);
    return { label, at: new Date().toISOString(), url, ...st };
  };
  const rejectState = () =>
    page.evaluate(() => {
      const n = document.querySelector('[data-testid="wave-reject"]');
      if (!n) return null;
      const r = n.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, focused: document.activeElement === n };
    });
  const modalOpen = async () => (await page.locator('[class*="modalPanel"]').count()) > 0;
  const resultCards = () => page.locator('[data-testid="result-card"]').count();
  // 按迎戰 → 等 Godot 拒絕與提示出現
  const startRejected = async () => {
    const idx = await H.bridgeLen(page);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    const msg = await H.waitBridge(page, idx, { type: "wave_rejected" }, 30000);
    await page.waitForSelector('[data-testid="wave-reject"]', { timeout: 10000 });
    await H.sleep(400);
    return { wave: msg.wave, reasons: (msg.skipped || []).map((s) => s.reason) };
  };
  // 在 rect（原本提示的範圍）內找一張可以出征的關卡（排除目前這一關），取它的「選擇關卡」按鈕和 rect 的交集中心點，
  // 回傳該點最上層的元素是不是這顆按鈕。交集是空的就把候選的按鈕捲到視窗中央再找
  const pickUnder = (rect, exclude, scope) =>
    page.evaluate(({ rect, exclude, scope }) => {
      const cards = () =>
        [...document.querySelectorAll(`${scope} [data-testid="stage-card"][data-access="playable"]`)].filter((c) => c.getAttribute("data-map-id") !== exclude);
      const inter = (btn) => {
        const r = btn.getBoundingClientRect();
        const l = Math.max(r.left, rect.left), t = Math.max(r.top, rect.top);
        const rr = Math.min(r.right, rect.right), b = Math.min(r.bottom, rect.bottom);
        return rr - l > 4 && b - t > 4 ? { x: (l + rr) / 2, y: (t + b) / 2, area: (rr - l) * (b - t) } : null;
      };
      const best = () => {
        let pick = null;
        for (const c of cards()) {
          const btn = c.querySelector('[data-testid="stage-select"]');
          const i = btn && inter(btn);
          if (i && (!pick || i.area > pick.area)) pick = { card: c, btn, ...i };
        }
        return pick;
      };
      let pick = best();
      if (!pick) {
        for (const c of cards()) {
          c.querySelector('[data-testid="stage-select"]').scrollIntoView({ block: "center" });
          pick = best();
          if (pick) break;
        }
      }
      if (!pick) return null;
      const top = document.elementFromPoint(pick.x, pick.y);
      return {
        id: pick.card.getAttribute("data-map-id"),
        name: pick.card.innerText.split("\n")[0].trim(),
        x: Math.round(pick.x), y: Math.round(pick.y),
        onButton: !!top && pick.btn.contains(top),
        inReject: !!(top && top.closest('[data-testid="wave-reject"]')),
        top: top ? top.outerHTML.slice(0, 160) : null,
      };
    }, { rect, exclude, scope });
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `reject-exit-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };

  // ── 準備 ──
  // 上一支腳本可能停在還在載入遊戲的頁面（例如戰鬥頁的 iframe 仍在經過 Service Worker 下載），清理時導航到遊戲目錄的靜態頁會被拖住：
  // 先離開那一頁，到同來源、不在遊戲 Service Worker 範圍內的純文字檔（robots.txt；不用 about:blank：它沒有來源，
  // 其他腳本留在 context 上的初始化程式在那裡讀 localStorage 會被拒而變成 pageerror），再照原本的兩次清理（隔離與非隔離各一次）。
  // 清理或注入沒有完成就不跑後面的情境（不用沒有注入的存檔繼續），留下具名的失敗
  let setupOk = false;
  await section("setup", async () => {
    out.setup = { before: await originState("beforeReset") };
    await page.goto(H.BASE + "/robots.txt");
    out.setup.left = page.url();
    let reset;
    try {
      reset = await H.resetOrigin(page);
    } catch (e) {
      out.setup.error = String(e && e.message ? e.message : e).slice(0, 400);
      out.setup.afterFail = await originState("afterFail");
      throw e;
    }
    const cleared = await page.evaluate(async () => ({
      regs: (await navigator.serviceWorker.getRegistrations()).length, localItems: localStorage.length, sessionItems: sessionStorage.length, isolated: window.crossOriginIsolated,
    }));
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, p: profile() });
    const injected = await resources();
    const key = await page.evaluate(() => localStorage.getItem("shenma_player_key"));
    out.setup = { ...out.setup, reset, cleared, injected, key, after: await originState("afterSetup") };
    setupOk = reset.isolated.length === 2 && reset.isolated[1] === false && cleared.regs === 0 && cleared.localItems === 0 && cleared.sessionItems === 0 && !cleared.isolated &&
      key === KEY && resIsBase(injected);
    run.check("X-0 前置：兩次清理完成（第二次在沒有 Service Worker 的非隔離頁面）、沒有留下 Service Worker 與資料；注入的存檔是 test_rejexit_a，金幣 1000、經驗 0、等級 1、進度 chapter2_1、戰鬥紀錄 0（五個欄位都在、型別正確）",
      setupOk, out.setup);
  });
  if (!setupOk) {
    run.check("X／Y 沒有執行：前置沒有完成，不用沒有注入的存檔繼續拒絕開戰與資源檢查（原因見 X-0 或 setup 的例外）", false, out.setup || null);
    return run.finish({ out });
  }

  // ── X. 主頁：拒絕 → 切換關卡 → 取消／再開／真的換關 ──
  const mainFlow = async (tag, vp) => {
    await page.setViewportSize(vp);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, E.name);
    await dismissSplash(IFRAME);
    const res0 = await resources();
    const s0 = await snapshot(IFRAME);
    const rej1 = await startRejected();
    const notice1 = await rejectState();

    // 出口打開關卡選擇：原本提示範圍內的有效關卡要在最上層
    await page.locator('[data-testid="wave-reject-exit"]').click();
    await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
    await H.sleep(300);
    const pick1 = await pickUnder(notice1, E.id, '[class*="modalPanel"]');
    const shotModal = await H.shot(page, `reject-exit-${tag}-modal`);
    run.check(`X-1 ${tag} 主頁拒絕開戰（第 1 波）→ 出口「切換關卡」：關卡選擇打開，原本提示範圍內有可以出征的關卡，該點最上層是它的「選擇關卡」按鈕，不是拒絕提示`,
      rej1.wave === 1 && notice1 && pick1 && pick1.onButton && !pick1.inReject,
      { rej1, notice1, pick1, shotModal });

    // 取消選關：回到戰場，提示回來並取得焦點；場次沒變；Esc 關閉提示
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(500);
    const back = await rejectState();
    const s1 = await snapshot(IFRAME);
    const modalAfterCancel = await modalOpen();
    await page.keyboard.press("Escape");
    await H.sleep(300);
    const escClosed = (await rejectState()) === null;
    run.check(`X-2 ${tag} 取消選關：視窗關閉，回到同一場（battle_id 不變、備戰、波次 0、城池 20），拒絕提示回來並取得焦點，Esc 關閉提示`,
      !modalAfterCancel && back && back.focused && s1.battle_id === s0.battle_id && s1.stage === E.id && s1.gs === 1 && s1.wave === 0 && s1.hp === 20 && escClosed,
      { back, s0, s1, modalAfterCancel, escClosed });

    // 再按迎戰又被拒絕，出口可以再打開關卡選擇；真實滑鼠點原本提示範圍內的關卡 → 換到那一關
    const rej2 = await startRejected();
    const notice2 = await rejectState();
    await page.locator('[data-testid="wave-reject-exit"]').click();
    await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
    await H.sleep(300);
    const pick2 = await pickUnder(notice2, E.id, '[class*="modalPanel"]');
    let switched = false;
    if (pick2) {
      const idx = await H.bridgeLen(page);
      await page.mouse.click(pick2.x, pick2.y);
      switched = await H.waitBridge(page, idx, { type: "update_stats", wave: 0, game_state: 1 }, 20000).then(() => true, () => false);
    }
    await H.sleep(800);
    const s2 = await snapshot(IFRAME);
    const hud = await H.hud(page);
    const res1 = await resources();
    const after = { modal: await modalOpen(), notice: await rejectState(), resultCards: await resultCards() };
    const shotSwitched = await H.shot(page, `reject-exit-${tag}-switched`);
    out["X_" + tag] = { res0, res1, s0, s2, hud, after, pick2 };
    run.check(`X-3 ${tag} 再按迎戰又被拒絕，出口再打開關卡選擇；真實滑鼠點原本提示範圍內的「選擇關卡」→ 換到那一關（Godot 是那一關、新的 battle_id、備戰、波次 0、城池 20，HUD 顯示那一關），視窗與提示都關閉`,
      rej2.wave === 1 && pick2 && pick2.onButton && !pick2.inReject && switched &&
        s2.stage === pick2.id && s2.battle_id && s2.battle_id !== s0.battle_id && s2.gs === 1 && s2.wave === 0 && s2.hp === 20 &&
        hud.map === pick2.name && !after.modal && after.notice === null,
      { rej2, pick2, switched, s2, hud, after, shotSwitched });
    run.check(`X-4 ${tag} 拒絕、取消、換關都沒有結算：沒有結算畫面，金幣／經驗／等級／進度與戰鬥紀錄不變（前後五個欄位都在、型別正確，都是注入時的值，戰鬥紀錄 0）`,
      after.resultCards === 0 && JSON.stringify(res1) === JSON.stringify(res0) && resIsBase(res0) && resIsBase(res1), { res0, res1, resultCards: after.resultCards });
  };
  await section("desktop", () => mainFlow("desktop", { width: 1280, height: 800 }));
  await section("m390", () => mainFlow("390", { width: 390, height: 844 }));

  // ── Y. 獨立戰鬥頁：拒絕 → 返回關卡選擇 → 真實滑鼠點有效關卡 ──
  await section("battle", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    const res0 = await resources();
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + E.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const s0 = await snapshot(BIFRAME);
    const rej = await startRejected();
    await page.locator('[data-testid="wave-reject-exit"]').click();
    await page.waitForURL(/\/shenmaSanguo\/stages$/, { timeout: 30000 });
    await page.waitForSelector('[data-testid="stage-card"][data-access="playable"]', { timeout: 60000 });
    await H.sleep(500);
    // 目標：畫面中央一帶（390×844 原本提示所在的位置）的有效關卡
    const vp = page.viewportSize();
    const pick = await pickUnder({ left: 25, right: vp.width - 25, top: vp.height * 0.35, bottom: vp.height * 0.65 }, E.id, "body");
    let arrived = false;
    let s1 = null;
    if (pick) {
      const idx = await H.bridgeLen(page);
      await page.mouse.click(pick.x, pick.y);
      await page.waitForURL(new RegExp("/shenmaSanguo/battle\\?map=" + pick.id + "$"), { timeout: 30000 });
      arrived = await H.waitBridge(page, idx, { type: "update_stats", wave: 0, game_state: 1 }, 120000).then(() => true, () => false);
      await dismissSplash(BIFRAME);
      s1 = await snapshot(BIFRAME);
    }
    const res1 = await resources();
    const shot = await H.shot(page, "reject-exit-battle-390");
    out.Y = { s0, rej, pick, arrived, s1, res0, res1 };
    run.check("Y-1 獨立戰鬥頁拒絕開戰 → 出口「返回關卡選擇」回到關卡頁；真實滑鼠點畫面中央的有效關卡 → 進入那一關的新的一場（新的 battle_id、備戰、波次 0、城池 20）",
      rej.wave === 1 && s0.stage === E.id && pick && pick.onButton && arrived && s1 && s1.stage === pick.id && s1.battle_id && s1.battle_id !== s0.battle_id && s1.gs === 1 && s1.wave === 0 && s1.hp === 20,
      { ...out.Y, shot });
    run.check("Y-2 獨立戰鬥頁：沒有結算畫面，金幣／經驗／等級／進度與戰鬥紀錄不變（前後五個欄位都在、型別正確，都是注入時的值，戰鬥紀錄 0）",
      (await resultCards()) === 0 && JSON.stringify(res1) === JSON.stringify(res0) && resIsBase(res0) && resIsBase(res1), { res0, res1 });
  });

  return run.finish({ out });
}
