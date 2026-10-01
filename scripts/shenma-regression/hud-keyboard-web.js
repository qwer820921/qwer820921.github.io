async (page) => {
  // 主頁隊伍編排與遊戲設定視窗的鍵盤操作（瀏覽器，真 Godot 產物、mock 後端）。
  // 桌面 1280×800 與 390×844 各跑一次 TK-1～TK-4：
  // - TK-1 從 HUD 用 Tab 走到「隊伍」→ Enter：隊伍編排是有名稱的對話框（role dialog、aria-modal、名稱「隊伍編排」），焦點在「關閉隊伍編排」
  // - TK-2 嚴格循環：每按一次 Tab／Shift+Tab 等焦點穩定（260 毫秒）後都在視窗的控制項上、頁面有焦點，兩個方向各連續兩圈以上、順序照控制項的順序；
  //        另外直接驗證邊界（最後一個按 Tab → 第一個、第一個按 Shift+Tab → 最後一個）
  // - TK-3 Esc 關閉，焦點回到 HUD 的「隊伍」；同一場、沒有後端寫入、沒有橫向溢出
  // - TK-4 HUD 的「設定」（齒輪）→ Enter：遊戲設定是對話框（名稱「遊戲設定」），焦點在「關閉遊戲設定」；嚴格循環；
  //        空白鍵關掉音效（音效模式的按鈕收起）後仍在視窗裡循環，再打開；Esc 關閉，焦點回到「設定」；音效設定照常保存在本機
  // 只跑桌面：
  // - TK-5 槽位的 ‹ ›：鍵盤移動後焦點跟著那位武將（同方向的鈕停用時換到另一個方向），不會掉到頁面本身
  // - TK-6 槽位的 ×：鍵盤移除後焦點交給同一個位置的下一位武將的 ×，沒有時交給那位武將在下方的卡片
  // - TK-7 下方卡片 Enter／空白鍵入隊（背景不捲動）；超出容量時「儲存隊伍」停用，Tab 不會停在停用的按鈕上
  // - TK-8 用 Enter 儲存隊伍：「儲存隊伍」停用後焦點交給下方的「關閉」（不是 body）；只送一次 update_team、存檔的隊伍是新的；Esc 關閉回到「隊伍」
  // - TK-9 退路：用 JavaScript 點開（開啟時焦點不在任何元素上）→ Esc 後焦點交給 HUD 的「隊伍」／「設定」
  // - TK-10 戰鬥中（迎戰後）：用鍵盤打開隊伍編排與設定、循環、Esc；戰場沒有被暫停、倍率不變、battle_id 不變
  // - TK-11 設定載入中（mock 暫停 get_heroes_config、玩家資訊按「強制從雲端同步」）：隊伍編排仍顯示標題、關閉鈕與「隊伍資料載入中…」，
  //         Tab／Shift+Tab 都停在關閉鈕，Esc 回到「隊伍」；放行後恢復
  // - TK-12 寫入限制中（分頁標記）：移除一位後按 Enter 儲存不改隊伍、「儲存隊伍」停用，焦點交給「關閉」、仍在視窗裡循環，Esc 回到「隊伍」、沒有寫入
  // - TK-13 隊伍編排開著時戰鬥結束：結算卡是最上層的對話框並取得焦點，Tab 只在結算卡裡、Esc 不關閉，確認後焦點回到隊伍編排
  // 全部 mock、虛構金鑰 test_tk_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const KEY = "test_tk_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const PREP_STAGE = { id: "chapter1_4", name: "Mock W 勝利兩波" };
  const BATTLE_STAGE = { id: "chapter1_1", name: "Mock A 慢速出兵" };
  const hero = (hero_id, level) => ({ hero_id, level, star: 0, atk: 150, def: 120, hp: 1500 });
  const profile = {
    nickname: "鍵盤隊伍", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter1_7",
    heroes: [hero("guan_yu", 2), hero("zhao_yun", 1)],
    team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
  };
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  // ── 輔助 ──
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const snapshot = async () => {
    const id = "tk-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
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
  const sessionTeam = () =>
    page.evaluate(() => {
      const p = JSON.parse(sessionStorage.getItem("shenma_player_state") || "null");
      const t = p && (p.player || p).team;
      return Array.isArray(t) ? [...t].sort((a, b) => a.slot - b.slot).map((s) => s.hero_id) : null;
    });
  // 送給遊戲 iframe 的訊息（Web → Godot）：記錄 update_team 的次數
  const watchSent = () =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      if (w.__tkWrapped) return;
      const orig = w.postMessage.bind(w);
      window.__tkSent = [];
      w.postMessage = (m, o) => {
        if (m && m.__godot_bridge) window.__tkSent.push(m.type);
        return orig(m, o);
      };
      w.__tkWrapped = true;
    }, IFRAME);
  const sentCount = (type) => page.evaluate((type) => (window.__tkSent || []).filter((t) => t === type).length, type);
  const focusAt = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      const nameOf = (d) => d.getAttribute("aria-label") || (d.getAttribute("aria-labelledby") && (document.getElementById(d.getAttribute("aria-labelledby")) || {}).textContent) || null;
      const box = dialogs.find((d) => a && d.contains(a)) || null;
      const slot = a && a.closest ? a.closest('[data-testid="team-slot"]') : null;
      return {
        tag: a ? a.tagName : null,
        name: a && a.getAttribute ? (a.getAttribute("aria-label") || a.getAttribute("title") || (a.labels && a.labels[0] ? a.labels[0].innerText.trim() : "") || (a.innerText || "").trim()).slice(0, 40) : "",
        testid: a && a.getAttribute ? a.getAttribute("data-testid") : null,
        heroId: a && a.getAttribute ? a.getAttribute("data-hero-id") : null,
        slotHero: slot ? slot.getAttribute("data-hero-id") : null,
        dialog: box ? nameOf(box) : null,
        isPanel: !!(box && a === box),
        hasFocus: document.hasFocus(),
        body: a === document.body || a === null,
        hudTeam: !!(a && a.tagName === "BUTTON" && a.innerText.trim() === "隊伍" && String(a.className).includes("hudBarBtn")),
        hudGear: !!(a && a.tagName === "BUTTON" && a.getAttribute("title") === "設定"),
        connected: !!(a && a.isConnected),
      };
    });
  const state = () =>
    page.evaluate(() => {
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      const nameOf = (d) => (d.getAttribute("aria-labelledby") && (document.getElementById(d.getAttribute("aria-labelledby")) || {}).textContent) || d.getAttribute("aria-label");
      const team = dialogs.find((d) => nameOf(d) === "隊伍編排");
      const set = dialogs.find((d) => nameOf(d) === "遊戲設定");
      const panelBody = team ? team.querySelector('[class*="modalBody"]') : null;
      return {
        team: !!team, teamModal: team ? team.getAttribute("aria-modal") : null,
        settings: !!set, settingsModal: set ? set.getAttribute("aria-modal") : null,
        // 舊版沒有對話框語意：用標題文字判斷視窗是否還開著
        teamTitle: [...document.querySelectorAll('[class*="modalTitle"]')].some((t) => t.textContent.trim() === "隊伍編排"),
        settingsTitle: [...document.querySelectorAll('[class*="modalTitle"]')].some((t) => t.textContent.trim() === "遊戲設定"),
        slots: [...document.querySelectorAll('[data-testid="team-slot"]')].map((s) => s.getAttribute("data-hero-id")).filter((x) => x),
        saveDisabled: (() => {
          const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "儲存隊伍");
          return b ? b.disabled : null;
        })(),
        saved: /隊伍已儲存/.test(document.body.innerText),
        scrollY: window.scrollY,
        bodyScroll: panelBody ? panelBody.scrollTop : null,
        overflow: document.documentElement.scrollWidth > window.innerWidth,
      };
    });
  const press = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(80);
  };
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
  const tabUntil = async (pred, max = 60, shift = false) => {
    for (let i = 1; i <= max; i++) {
      await press(shift ? "Shift+Tab" : "Tab");
      const f = await focusAt();
      if (pred(f)) return { f, n: i };
    }
    return { f: await focusAt(), n: -1 };
  };
  // 先往後找，找不到再往前
  const tabTo = async (pred) => {
    const a = await tabUntil(pred, 40);
    return a.n > 0 ? a : tabUntil(pred, 80, true);
  };
  // 名稱是 name 的對話框裡用 Tab 走得到的控制項（文件順序）的名稱
  const controls = (name) =>
    page.evaluate(({ name, FOCUSABLE }) => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.getAttribute("aria-labelledby") && (document.getElementById(x.getAttribute("aria-labelledby")) || {}).textContent === name);
      return d ? [...d.querySelectorAll(FOCUSABLE)].map((el) => (el.getAttribute("aria-label") || el.getAttribute("title") || (el.labels && el.labels[0] ? el.labels[0].innerText.trim() : "") || (el.innerText || "").trim()).slice(0, 40)) : [];
    }, { name, FOCUSABLE });
  const focusEdge = (name, which) =>
    page.evaluate(({ name, which, FOCUSABLE }) => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.getAttribute("aria-labelledby") && (document.getElementById(x.getAttribute("aria-labelledby")) || {}).textContent === name);
      const items = [...d.querySelectorAll(FOCUSABLE)];
      const el = which === "last" ? items[items.length - 1] : items[0];
      el.focus();
      return (el.getAttribute("aria-label") || el.getAttribute("title") || (el.labels && el.labels[0] ? el.labels[0].innerText.trim() : "") || (el.innerText || "").trim()).slice(0, 40);
    }, { name, which, FOCUSABLE });
  // 嚴格循環：控制項的名稱要能區分（同名的控制項用位置比對）
  const strictCycle = async (name) => {
    const ctl = await controls(name);
    const n = ctl.length;
    const inBox = (f) => f.dialog === name && f.hasFocus && !f.body && !f.isPanel;
    const fwd = await settleWalk(2 * n + 2);
    const back = await settleWalk(2 * n + 2, true);
    const bad = [...fwd, ...back].filter((f) => !inBox(f));
    const unique = new Set(ctl).size === n;
    const follows = (seq, step) =>
      !unique || seq.every((f, i) => ctl.includes(f.name) && (i === 0 || ctl.indexOf(f.name) === (ctl.indexOf(seq[i - 1].name) + step + n) % n));
    const orderFwd = follows(fwd, 1);
    const orderBack = follows(back, -1);
    const lastName = n ? await focusEdge(name, "last") : null;
    await H.sleep(100);
    const edgeFwd = await settle("Tab");
    const firstName = n ? await focusEdge(name, "first") : null;
    await H.sleep(100);
    const edgeBack = await settle("Shift+Tab");
    const ok = n >= 1 && bad.length === 0 && orderFwd && orderBack && inBox(edgeFwd) && edgeFwd.name === ctl[0] && inBox(edgeBack) && edgeBack.name === ctl[n - 1] &&
      lastName === ctl[n - 1] && firstName === ctl[0];
    const label = (f) => (inBox(f) ? f.name : `${f.tag}/${f.dialog || "-"}/${f.body ? "body" : ""}/${f.hasFocus ? "focus" : "no-focus"}`);
    return { ok, n, unique, ctl, bad: bad.slice(0, 4), orderFwd, orderBack, fwd: fwd.map(label), back: back.map(label), edge: { lastName, afterTab: label(edgeFwd), firstName, afterShiftTab: label(edgeBack) } };
  };
  // 起點：用滑鼠點 HUD 的地圖名稱（焦點離開遊戲 iframe），再用 Tab 走到 HUD 的按鈕
  const toHud = async (pred) => {
    await page.locator('[class*="hudMapName"]').click();
    await H.sleep(150);
    const a = await tabUntil(pred, 30);
    return a.n > 0 ? a : tabUntil(pred, 30, true);
  };
  const openTeam = async () => {
    const t = await toHud((f) => f.hudTeam);
    await press("Enter");
    await H.sleep(400);
    return { reached: t.n > 0, st: await state(), after: await focusAt() };
  };
  const openSettings = async () => {
    const t = await toHud((f) => f.hudGear);
    await press("Enter");
    await H.sleep(400);
    return { reached: t.n > 0, st: await state(), after: await focusAt() };
  };
  const closeAll = async () => {
    for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
      await page.locator('button[class*="modalClose"]').last().click();
      await H.sleep(300);
    }
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `hud-keyboard-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await closeAll(); } catch { /* 沒有視窗可關 */ }
    }
  };
  const seed = (p) =>
    page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, p });
  const boot = async (vp) => {
    await page.setViewportSize(vp);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, PREP_STAGE.name);
    await dismissSplash();
  };

  await section("setup", async () => {
    await H.resetOrigin(page);
    await seed(profile);
  });

  const flow = async (tag, vp) => {
    await boot(vp);
    const s0 = await snapshot();
    const g0 = await gasActions();

    // TK-1：Tab 到「隊伍」→ Enter
    const o1 = await openTeam();
    const dlg = {
      dialog: await page.getByRole("dialog", { name: "隊伍編排", exact: true }).count(),
      close: await page.getByRole("button", { name: "關閉隊伍編排", exact: true }).count(),
    };
    out[tag + "_TK1"] = { open: o1, dlg, shot: await H.shot(page, `hud-keyboard-${tag}-team`) };
    run.check(`TK-1 ${tag} 從 HUD 用 Tab 走到「隊伍」按 Enter：隊伍編排是對話框（名稱「隊伍編排」、aria-modal），焦點在「關閉隊伍編排」、頁面有焦點`,
      o1.reached && o1.st.team && o1.st.teamModal === "true" && dlg.dialog === 1 && dlg.close === 1 && o1.after.dialog === "隊伍編排" && o1.after.name === "關閉隊伍編排" && o1.after.hasFocus,
      out[tag + "_TK1"]);

    // TK-2：嚴格循環
    const c2 = await strictCycle("隊伍編排");
    out[tag + "_TK2"] = c2;
    run.check(`TK-2 ${tag} 隊伍編排：Tab／Shift+Tab 各 ${2 * c2.n + 2} 下（${c2.n} 個控制項，每下等 260 毫秒）都在視窗的控制項上、頁面有焦點、順序照控制項的順序；最後一個按 Tab 回到第一個、第一個按 Shift+Tab 到最後一個`,
      c2.ok && c2.n >= 10, c2);

    // TK-3：Esc 關閉，焦點回到「隊伍」
    const before3 = await state();
    await press("Escape");
    await H.sleep(400);
    const st3 = await state();
    const f3 = await focusAt();
    const s3 = await snapshot();
    const g3 = await gasActions();
    out[tag + "_TK3"] = { st3, f3, s0, s3, g0, g3 };
    run.check(`TK-3 ${tag} Esc 關閉隊伍編排，焦點回到 HUD 的「隊伍」；同一場（battle_id 不變、備戰、波次 0）、沒有後端寫入、沒有橫向溢出`,
      !st3.team && !st3.teamTitle && f3.hudTeam && f3.connected && s3.battle_id === s0.battle_id && s3.gs === 1 && s3.wave === 0 &&
        (g3.save_profile || 0) === (g0.save_profile || 0) && !before3.overflow,
      out[tag + "_TK3"]);

    // TK-4：設定
    const o4 = await openSettings();
    const dlg4 = {
      dialog: await page.getByRole("dialog", { name: "遊戲設定", exact: true }).count(),
      close: await page.getByRole("button", { name: "關閉遊戲設定", exact: true }).count(),
    };
    const shot4 = await H.shot(page, `hud-keyboard-${tag}-settings`);
    const c4 = await strictCycle("遊戲設定");
    // 空白鍵關掉音效：焦點移到開關（第一個控制項之後）
    const sw = await tabUntil((f) => f.dialog === "遊戲設定" && f.tag === "INPUT", 8);
    await press("Space");
    await H.sleep(300);
    const off = await page.evaluate(() => document.getElementById("sfx-enabled-modal")?.checked);
    const c4off = await strictCycle("遊戲設定");
    await tabUntil((f) => f.dialog === "遊戲設定" && f.tag === "INPUT", 8);
    await press("Space");
    await H.sleep(300);
    const on = await page.evaluate(() => document.getElementById("sfx-enabled-modal")?.checked);
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /sound|sfx/i.test(k)).map((k) => [k, localStorage.getItem(k)]));
    await press("Escape");
    await H.sleep(400);
    const st4 = await state();
    const f4 = await focusAt();
    out[tag + "_TK4"] = { open: o4, dlg4, shot4, c4, sw: sw.n, off, c4off, on, stored, st4, f4 };
    run.check(`TK-4 ${tag} 從 HUD 用 Tab 走到「設定」按 Enter：遊戲設定是對話框（名稱「遊戲設定」、aria-modal），焦點在「關閉遊戲設定」；嚴格循環；空白鍵關掉音效（音效模式收起）後仍嚴格循環、再打開；Esc 關閉、焦點回到「設定」`,
      o4.reached && o4.st.settings && o4.st.settingsModal === "true" && dlg4.dialog === 1 && dlg4.close === 1 && o4.after.name === "關閉遊戲設定" && o4.after.hasFocus &&
        c4.ok && c4.n === 4 && JSON.stringify(c4.ctl) === JSON.stringify(["關閉遊戲設定", "開啟音效", "節省模式", "忠實模式"]) && sw.n > 0 && off === false && c4off.ok && c4off.n === 2 && on === true && !st4.settings && !st4.settingsTitle && f4.hudGear && f4.connected,
      out[tag + "_TK4"]);
  };

  await section("desktop", () => flow("桌面", { width: 1280, height: 800 }));
  await section("narrow", () => flow("390", { width: 390, height: 844 }));

  // ── TK-5～TK-8：桌面，槽位與儲存 ──
  await section("TK5", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await H.sleep(300);
    await openTeam();
    // 趙雲（第 2 位）往前移
    const t = await tabUntil((f) => f.name === "趙雲 往前移", 20);
    await press("Enter");
    await H.sleep(250);
    const a = { st: await state(), f: await focusAt() };
    // 趙雲現在第 1 位，往前移停用：焦點換到趙雲的「往後移」；再按 Enter 回到第 2 位，焦點在趙雲的「往後移」停用 → 換到「往前移」
    await press("Enter");
    await H.sleep(250);
    const b = { st: await state(), f: await focusAt() };
    out.TK5 = { reached: t.n, a, b };
    run.check("TK-5 槽位的 ‹ ›：趙雲按「往前移」→ 隊伍變成趙雲、關羽，焦點在趙雲的「往後移」（同方向停用）；再按 Enter → 回到關羽、趙雲，焦點在趙雲的「往前移」；焦點都沒有掉到頁面本身",
      t.n > 0 && JSON.stringify(a.st.slots) === JSON.stringify(["zhao_yun", "guan_yu"]) && a.f.name === "趙雲 往後移" && a.f.slotHero === "zhao_yun" && a.f.dialog === "隊伍編排" &&
        JSON.stringify(b.st.slots) === JSON.stringify(["guan_yu", "zhao_yun"]) && b.f.name === "趙雲 往前移" && b.f.slotHero === "zhao_yun" && !a.f.body && !b.f.body,
      out.TK5);
  });

  await section("TK6", async () => {
    // 接著 TK-5（視窗開著，關羽、趙雲）：移除關羽 → 焦點交給同一個位置的趙雲的 ×；再移除趙雲 → 槽位空了，焦點交給趙雲在下方的卡片
    const t = await tabUntil((f) => f.name === "移除 關羽", 20, true);
    await press("Enter");
    await H.sleep(250);
    const a = { st: await state(), f: await focusAt() };
    await press("Enter");
    await H.sleep(250);
    const b = { st: await state(), f: await focusAt() };
    out.TK6 = { reached: t.n, a, b };
    run.check("TK-6 槽位的 ×：移除關羽後焦點交給同一個位置的「移除 趙雲」；再按 Enter 移除趙雲（槽位空了）後焦點交給趙雲在下方的卡片；儲存前存檔的隊伍不變",
      t.n > 0 && JSON.stringify(a.st.slots) === JSON.stringify(["zhao_yun"]) && a.f.name === "移除 趙雲" && a.f.dialog === "隊伍編排" &&
        b.st.slots.length === 0 && b.f.testid === "team-pool-card" && b.f.heroId === "zhao_yun" && b.f.dialog === "隊伍編排" && b.st.saveDisabled === true,
      out.TK6);
  });

  await section("TK7", async () => {
    // 卡片：趙雲 Enter、關羽空白鍵、周瑜 Enter、黃忠 Enter（8＋8＋9＋6＝31 > 30）
    const before = await state();
    await press("Enter"); // 焦點在趙雲的卡片（TK-6）
    await H.sleep(200);
    const tg = await tabUntil((f) => f.testid === "team-pool-card" && f.heroId === "guan_yu", 12, true);
    await press("Space");
    await H.sleep(200);
    const tz = await tabUntil((f) => f.testid === "team-pool-card" && f.heroId === "zhou_yu", 12);
    await press("Enter");
    await H.sleep(200);
    const mid = await state();
    const th = await tabUntil((f) => f.testid === "team-pool-card" && f.heroId === "huang_zhong", 12, true);
    await press("Enter");
    await H.sleep(200);
    const over = await state();
    const c = await strictCycle("隊伍編排");
    const ctl = c.ctl;
    // 黃忠再按一次移出（回到 25／30）
    await tabTo((f) => f.testid === "team-pool-card" && f.heroId === "huang_zhong");
    await press("Enter");
    await H.sleep(200);
    const back = await state();
    out.TK7 = { before, tg: tg.n, tz: tz.n, th: th.n, mid, over, c, back };
    run.check("TK-7 卡片 Enter／空白鍵入隊（趙雲、關羽、周瑜，背景與視窗不捲動）；加入黃忠超出容量（31／30）時「儲存隊伍」停用，嚴格循環不會停在停用的按鈕上；黃忠再按一次移出",
      tg.n > 0 && tz.n > 0 && th.n > 0 && JSON.stringify(mid.slots) === JSON.stringify(["zhao_yun", "guan_yu", "zhou_yu"]) && mid.saveDisabled === false &&
        mid.scrollY === before.scrollY && JSON.stringify(over.slots) === JSON.stringify(["zhao_yun", "guan_yu", "zhou_yu", "huang_zhong"]) && over.saveDisabled === true &&
        c.ok && !ctl.includes("儲存隊伍") && JSON.stringify(back.slots) === JSON.stringify(["zhao_yun", "guan_yu", "zhou_yu"]),
      out.TK7);
  });

  await section("TK8", async () => {
    await watchSent();
    const n0 = await sentCount("update_team");
    const team0 = await sessionTeam();
    const t = await tabTo((f) => f.name === "儲存隊伍");
    await press("Enter");
    await H.sleep(400);
    const st = await state();
    const f = await focusAt();
    const c = await strictCycle("隊伍編排");
    // 儲存之後沒有重送
    await H.sleep(500);
    const n1 = await sentCount("update_team");
    const team1 = await sessionTeam();
    await press("Escape");
    await H.sleep(400);
    const fe = await focusAt();
    const se = await state();
    out.TK8 = { reached: t.n, st, f, c, n0, n1, team0, team1, fe, se };
    run.check("TK-8 Enter 儲存隊伍：顯示已儲存、「儲存隊伍」停用，焦點交給下方的「關閉」（在視窗裡、不是 body）；之後仍嚴格循環；update_team 只送一次、存檔的隊伍是趙雲、關羽、周瑜；Esc 關閉、回到「隊伍」",
      t.n > 0 && st.saved && st.saveDisabled === true && f.name === "關閉" && f.dialog === "隊伍編排" && !f.body && c.ok &&
        n1 - n0 === 1 && JSON.stringify(team0) === JSON.stringify(["guan_yu", "zhao_yun"]) && JSON.stringify(team1) === JSON.stringify(["zhao_yun", "guan_yu", "zhou_yu"]) &&
        !se.team && fe.hudTeam,
      out.TK8);
  });

  await section("TK9", async () => {
    // 用 JavaScript 點開（開啟時焦點不在任何元素上）→ Esc → 焦點交給 HUD 的按鈕
    const openByScript = (pred) =>
      page.evaluate((pred) => {
        document.activeElement && document.activeElement.blur && document.activeElement.blur();
        const b = [...document.querySelectorAll("button")].find((x) => (pred === "team" ? x.innerText.trim() === "隊伍" && String(x.className).includes("hudBarBtn") : x.getAttribute("title") === "設定"));
        b.click();
        return document.activeElement === document.body;
      }, pred);
    const ta = await openByScript("team");
    await H.sleep(400);
    const fa = await focusAt();
    await press("Escape");
    await H.sleep(400);
    const fa2 = await focusAt();
    const sa = await state();
    const sb = await openByScript("settings");
    await H.sleep(400);
    const fb = await focusAt();
    await press("Escape");
    await H.sleep(400);
    const fb2 = await focusAt();
    const sb2 = await state();
    out.TK9 = { ta, fa, fa2, sa, sb, fb, fb2, sb2 };
    run.check("TK-9 退路：用 JavaScript 點開隊伍編排與設定（開啟時焦點不在任何元素上）：焦點進到關閉鈕；Esc 後交給 HUD 的「隊伍」／「設定」",
      fa.name === "關閉隊伍編排" && !sa.team && fa2.hudTeam && fb.name === "關閉遊戲設定" && !sb2.settings && fb2.hudGear,
      out.TK9);
  });

  await section("TK10", async () => {
    // 戰鬥中：換到慢速出兵的關卡（測試期間不會結束），迎戰後打開隊伍編排與設定
    await H.selectStage(page, BATTLE_STAGE.name);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.innerText.trim() === "戰鬥中"), null, { timeout: 15000 });
    await H.sleep(1500);
    const s0 = await snapshot();
    const o = await openTeam();
    const c = await strictCycle("隊伍編排");
    await press("Escape");
    await H.sleep(400);
    const f1 = await focusAt();
    const o2 = await openSettings();
    const c2 = await strictCycle("遊戲設定");
    await press("Escape");
    await H.sleep(400);
    const f2 = await focusAt();
    const s1 = await snapshot();
    out.TK10 = { s0, o, c: c.ok, f1, o2, c2: c2.ok, f2, s1 };
    run.check("TK-10 戰鬥中（迎戰後）：鍵盤打開隊伍編排與設定、嚴格循環、Esc 回到 HUD 的按鈕；戰場沒有被暫停（未凍結）、倍率與自動不變、battle_id 不變",
      s0.gs === 2 && o.after.name === "關閉隊伍編排" && c.ok && f1.hudTeam && o2.after.name === "關閉遊戲設定" && c2.ok && f2.hudGear &&
        s1.battle_id === s0.battle_id && !s1.frozen && s1.ts === s0.ts && s1.auto === s0.auto,
      out.TK10);
  });

  await section("TK11", async () => {
    // 新的一場（備戰），設定載入中的外殼
    await boot({ width: 1280, height: 800 });
    await page.evaluate(() => window.__shenmaMock.hold("get_heroes_config"));
    try {
      await page.locator('button[class*="hudAvatar"]').click();
      await page.getByRole("button", { name: /強制從雲端同步/ }).click();
      await page.waitForFunction(() => window.__shenmaMock.pending("get_heroes_config").length === 1, null, { timeout: 15000 });
      await page.getByRole("button", { name: "關閉玩家資訊", exact: true }).click();
      await H.sleep(300);
      const o = await openTeam();
      const shell = await page.evaluate(() => {
        const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.getAttribute("aria-labelledby") && (document.getElementById(x.getAttribute("aria-labelledby")) || {}).textContent === "隊伍編排");
        const st = d && d.querySelector('[role="status"]');
        return { status: st ? st.innerText.trim() : null, cards: d ? d.querySelectorAll('[data-testid="team-pool-card"]').length : -1, modal: d ? d.getAttribute("aria-modal") : null };
      });
      const shot = await H.shot(page, "hud-keyboard-team-loading");
      const walk = [...(await settleWalk(3)), ...(await settleWalk(3, true))];
      const off = walk.filter((f) => !(f.dialog === "隊伍編排" && f.hasFocus && !f.body && f.name === "關閉隊伍編排"));
      await press("Escape");
      await H.sleep(400);
      const fb = await focusAt();
      const stb = await state();
      await page.evaluate(() => window.__shenmaMock.release("get_heroes_config", "ok"));
      await page.evaluate(() => window.__shenmaMock.unhold("get_heroes_config"));
      await H.sleep(800);
      await openTeam();
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="team-pool-card"]').length > 0, null, { timeout: 15000 });
      const cardsBack = await page.locator('[data-testid="team-pool-card"]').count();
      await press("Escape");
      await H.sleep(400);
      const fc = await focusAt();
      out.TK11 = { open: o, shell, shot, walk: walk.map((f) => `${f.name || f.tag}/${f.hasFocus ? "focus" : "no-focus"}`), off: off.slice(0, 3), fb, stb, cardsBack, fc };
      run.check("TK-11 設定載入中（mock 暫停 get_heroes_config）：隊伍編排仍是對話框（名稱「隊伍編排」、aria-modal）、只有關閉鈕與「隊伍資料載入中…」，焦點在「關閉隊伍編排」；Tab／Shift+Tab 各 3 下都停在關閉鈕；Esc 回到「隊伍」；放行後卡片恢復",
        o.reached && shell.modal === "true" && shell.status === "隊伍資料載入中…" && shell.cards === 0 && o.after.name === "關閉隊伍編排" && off.length === 0 && !stb.team && fb.hudTeam &&
          cardsBack > 0 && fc.hudTeam,
        out.TK11);
    } finally {
      await page.evaluate(() => {
        window.__shenmaMock.unhold("get_heroes_config");
        while (window.__shenmaMock.release("get_heroes_config", "ok"));
      }).catch(() => {});
    }
  });

  await section("TK12", async () => {
    // 寫入限制中（分頁標記）：移除一位武將後按 Enter 儲存 → 不改隊伍、顯示暫停保存、「儲存隊伍」停用，焦點交給「關閉」（不是 body）；嚴格循環；Esc 回到「隊伍」
    await page.evaluate(() => {
      window.__siteIsolation = { ...(window.__siteIsolation || {}), lostCopy: true };
    });
    const log0 = (await H.gasLog(page)).length;
    const team0 = await sessionTeam();
    await openTeam();
    // 移除第一位（隊伍改了、沒有超出容量）再儲存
    const tc = await tabTo((f) => f.testid === "team-slot-remove");
    await press("Enter");
    await H.sleep(200);
    const ts = await tabTo((f) => f.name === "儲存隊伍");
    await press("Enter");
    await page.waitForSelector('[data-testid="team-hold"]', { timeout: 10000 });
    await H.sleep(400);
    const st = await state();
    const f = await focusAt();
    const c = await strictCycle("隊伍編排");
    await press("Escape");
    await H.sleep(400);
    const fe = await focusAt();
    const team1 = await sessionTeam();
    const writes = (await H.gasLog(page)).slice(log0).filter((e) => e.action !== "get_profile");
    out.TK12 = { tc: tc.n, ts: ts.n, st, f, c, fe, team0, team1, writes };
    run.check("TK-12 寫入限制中：按 Enter 儲存不改隊伍、顯示暫停保存的說明、「儲存隊伍」停用，焦點交給「關閉」（不是 body）；之後仍嚴格循環；Esc 回到「隊伍」；沒有任何寫入",
      tc.n > 0 && ts.n > 0 && st.saveDisabled === true && f.name === "關閉" && f.dialog === "隊伍編排" && !f.body && c.ok && fe.hudTeam &&
        JSON.stringify(team0) === JSON.stringify(team1) && writes.length === 0,
      out.TK12);
  });

  // TK-13：隊伍編排開著時戰鬥結束（失敗關）→ 結算卡疊在最上層、HUD 卸載
  await section("TK13", async () => {
    await H.resetOrigin(page);
    await seed(profile);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, "Mock L 失敗關");
    await dismissSplash();
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    await H.sleep(500);
    const o = await openTeam();
    await page.waitForSelector('[data-testid="result-card"]', { timeout: 120000 });
    await H.sleep(600);
    const card = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="result-card"]');
      const t = c && c.getAttribute("aria-labelledby") && document.getElementById(c.getAttribute("aria-labelledby"));
      return { role: c && c.getAttribute("role"), modal: c && c.getAttribute("aria-modal"), name: t ? t.textContent : null };
    });
    const atResult = { st: await state(), f: await focusAt() };
    const shot = await H.shot(page, "hud-keyboard-result-over-team");
    const walk = [...(await settleWalk(3)), ...(await settleWalk(3, true))];
    const off = walk.filter((f) => !(f.dialog === card.name && f.hasFocus && !f.body));
    // Esc：結算與隊伍編排都不關閉
    await press("Escape");
    await H.sleep(400);
    const afterEsc = { st: await state(), f: await focusAt(), card: await page.locator('[data-testid="result-card"]').count() };
    // Tab 到「確認」→ Enter：結算關閉，焦點回到隊伍編排（開著時焦點所在的關閉鈕）
    const tc = await tabUntil((f) => f.name === "確認" && f.dialog === card.name, 4);
    await press("Enter");
    await H.sleep(600);
    const afterConfirm = { st: await state(), f: await focusAt(), card: await page.locator('[data-testid="result-card"]').count() };
    await H.waitHud(page);
    await H.sleep(500);
    await press("Escape");
    await H.sleep(400);
    const fe = await focusAt();
    const se = await state();
    out.TK13 = { open: o.after.name, card, atResult, shot, walk: walk.map((f) => `${f.name || f.tag}/${f.dialog || "-"}${f.body ? "/body" : ""}`), off: off.slice(0, 3), afterEsc, tc: tc.n, afterConfirm, fe, se };
    run.check("TK-13 隊伍編排開著時戰鬥結束：結算卡是對話框（名稱「落 敗」、aria-modal）、疊在最上層並取得焦點（結算卡本身，不是背後的隊伍編排）；Tab／Shift+Tab 各 3 下都在結算卡裡；Esc 不關閉結算也不關閉隊伍編排；Tab 到「確認」按 Enter 後結算關閉、焦點回到隊伍編排的「關閉隊伍編排」；HUD 回來後 Esc 關閉隊伍編排、回到「隊伍」",
      o.after.name === "關閉隊伍編排" && card.role === "dialog" && card.modal === "true" && card.name === "落 敗" && atResult.st.team &&
        atResult.f.dialog === "落 敗" && atResult.f.isPanel && atResult.f.hasFocus && off.length === 0 &&
        afterEsc.card === 1 && afterEsc.st.team && afterEsc.f.dialog === "落 敗" && tc.n > 0 &&
        afterConfirm.card === 0 && afterConfirm.st.team && afterConfirm.f.name === "關閉隊伍編排" && afterConfirm.f.dialog === "隊伍編排" &&
        !se.team && fe.hudTeam,
      out.TK13);
  });

  // 寫入限制的標記不留給之後的腳本
  await H.resetOrigin(page).catch(() => {});
  return run.finish(out);
}
