async (page) => {
  // R17（瀏覽器）：神馬三國視窗與全站浮動入口、敵軍預覽的鍵盤操作、防禦塔目標優先
  // F. 神馬三國的視窗開啟時，全站的說明（ⓘ）與聊天入口暫時隱藏（點擊命中驗證），關閉後恢復；其他網站頁面照舊；
  //    寫入限制的底部提示仍然可見
  // K. 敵軍預覽的鍵盤：Enter 開啟後焦點在視窗裡、Tab／Shift+Tab 只在視窗內循環、Enter 可展開波次、
  //    Esc 只關閉預覽並把焦點還給「敵軍預覽」按鈕；不切關、不改 battle_id、沒有寫入（主頁與關卡頁、桌面與 375 寬）
  // T. 防禦塔目標優先：主頁用部署選單放置弓兵塔、實際點選塔與三個選項，用快照的 enemy_hp／enemy_kind 對照實際打中的敵人；
  //    面板只顯示 Godot 回傳的實際模式；關閉重開、升級後保留；過期或錯誤的命令不套用；重來後新塔回到預設；
  //    獨立戰鬥頁同樣有效；手機寬度；不新增存檔欄位或寫入
  // C. 戰場上的部署選單、塔與武將的選取面板（Codex 在 Round 18 指出 D21 漏了這些）：主頁與獨立戰鬥頁、桌面與 375 寬，
  //    開啟時浮動入口隱藏、點不到；面板每個欄位與按鈕完整在畫面內、中心點得到自己（elementFromPoint），關閉後入口恢復；
  //    目標按鈕列是 Bootstrap row／col
  // V. 舊版遊戲（協定 2，Round 16 的產物）：主頁顯示版本需要更新、不送關卡資料
  // 全部 mock、虛構金鑰 test_r17_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const A = "test_r17_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const WRITES = ["save_profile", "upgrade_hero", "save_result", "create_profile"];
  const CELL = [1, 4];
  const PROTO2 = ".handoff/evidence/round-17/proto2-godot";

  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const logLen = async () => (await H.gasLog(page)).length;
  const writesSince = async (n) => (await H.gasLog(page)).slice(n).filter((e) => WRITES.includes(e.action)).length;
  const closeModals = async () => {
    for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
      await page.locator('button[class*="modalClose"]').last().click();
      await H.sleep(300);
    }
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r17-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await page.keyboard.press("Escape"); await closeModals(); } catch { /* 沒有視窗可關 */ }
    }
  };
  const snapshot = async (sel) => {
    const id = "r17-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  // 全站浮動入口的狀態：是否可見、在它的中心點擊會點到什麼（視窗開著時應該點到視窗，不是入口）
  const floating = () =>
    page.evaluate(() =>
      [...document.querySelectorAll("[data-floating-entry]")].map((el) => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const top = document.elementFromPoint(r.left + Math.min(20, r.width / 2), r.top + Math.min(20, r.height / 2));
        return { name: el.getAttribute("data-floating-entry"), visibility: cs.visibility, hitSelf: !!top && el.contains(top) };
      })
    );
  // 主頁有說明（ⓘ）與聊天兩個入口；獨立關卡頁只有聊天
  const allHidden = (f) => f.length >= 1 && f.every((x) => x.visibility === "hidden" && !x.hitSelf);
  const allShown = (f) => f.length >= 1 && f.every((x) => x.visibility === "visible" && x.hitSelf);
  const activeInfo = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      const dlg = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]');
      return { testid: a && a.getAttribute("data-testid"), tag: a && a.tagName, inside: !!dlg && dlg.contains(a), text: a && (a.innerText || "").slice(0, 20) };
    });
  const card = (name) => page.locator('div[class*="stageCard"]', { has: page.locator("div", { hasText: new RegExp("^" + name + "$") }) }).first();
  const isPreviewOpen = async () => (await page.locator('[data-testid="enemy-preview"]').count()) > 0;

  // ── 前置：玩家進度 chapter1_10（Mock P、Q、T 都解鎖） ──
  const profile = { nickname: "R17 玩家", level: 1, exp: 0, gold: 5000, capacity: 11, max_stage: "chapter1_10", heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }] };
  await section("setup", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", { profiles: { [A]: profile }, battle_logs: [] });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), A);
  });

  // ── F. 浮動入口 ──
  await section("F", async () => {
    await page.goto(H.BASE + "/");
    await page.waitForSelector("[data-floating-entry]", { timeout: 60000 });
    await H.sleep(800);
    const home = await page.evaluate(() => [...document.querySelectorAll("[data-floating-entry]")].map((el) => ({ name: el.getAttribute("data-floating-entry"), visibility: getComputedStyle(el).visibility })));
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.sleep(500);
    const before = await floating();
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
    const inModal = await floating();
    await card("Mock P 多路線").locator('[data-testid="enemy-preview-open"]').click();
    await page.waitForSelector('[data-testid="enemy-preview"]');
    const inPreview = await floating();
    out.F_shot = await H.shot(page, "r17-f-preview-no-floating");
    await page.locator('[data-testid="enemy-preview-close"]').click();
    await closeModals();
    await H.sleep(300);
    const after = await floating();
    await H.clickButton(page, "武將");
    await page.waitForSelector('div[class*="heroName"]');
    const inHeroModal = await floating();
    await closeModals();
    out.F = { home, before, inModal, inPreview, after, inHeroModal };
    run.check("F-1 其他網站頁面（首頁）的說明與聊天入口照常顯示",
      home.length >= 1 && home.every((x) => x.visibility === "visible"), home);
    run.check("F-2 神馬三國：沒有視窗時兩個入口可見、點得到；開啟關卡視窗、敵軍預覽、武將視窗時都隱藏，點擊同一個位置點不到入口；關閉後恢復",
      before.length === 2 && allShown(before) && allHidden(inModal) && allHidden(inPreview) && allHidden(inHeroModal) && allShown(after), out.F);
  });

  // ── K. 敵軍預覽的鍵盤操作（主頁） ──
  await section("K1", async () => {
    const snap0 = await snapshot(IFRAME);
    const b0 = await H.bridgeLen(page);
    const n0 = await logLen();
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
    const trigger = card("Mock P 多路線").locator('[data-testid="enemy-preview-open"]');
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="enemy-preview"]');
    const opened = await activeInfo();
    const tabs = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      tabs.push(await activeInfo());
    }
    const shiftTabs = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Shift+Tab");
      shiftTabs.push(await activeInfo());
    }
    // 焦點移到第 2 波的標題列按 Enter：展開
    await page.locator('[data-testid="preview-wave-toggle-2"]').focus();
    await page.keyboard.press("Enter");
    const expanded = await page.locator('[data-testid="preview-wave-toggle-2"]').getAttribute("aria-expanded");
    const ariaModal = await page.locator('[data-testid="enemy-preview"] [role="dialog"]').getAttribute("aria-modal");
    await page.keyboard.press("Escape");
    await H.sleep(300);
    const afterEsc = await page.evaluate(() => {
      const a = document.activeElement;
      return { testid: a && a.getAttribute("data-testid"), cardText: a && a.closest('div[class*="stageCard"]') ? a.closest('div[class*="stageCard"]').innerText.split("\n")[0] : null };
    });
    const listStill = (await page.locator("text=關卡選擇").count()) > 0;
    const snap1 = await snapshot(IFRAME);
    const loads = (await H.bridgeSince(page, b0)).filter((m) => m.type === "update_stats" && m.wave === 0 && m.game_state === 1).length;
    const writes = await writesSince(n0);
    out.K1 = { opened, tabs, shiftTabs, expanded, ariaModal, afterEsc, listStill, battle: [snap0.battle_id, snap1.battle_id], loads, writes };
    run.check("K-1 主頁：在「敵軍預覽」按鈕按 Enter 開啟，焦點移到視窗裡；Tab 8 次、Shift+Tab 4 次焦點都在視窗內（碰不到背後的關卡卡片與按鈕）；aria-modal；Enter 可以展開波次",
      opened.inside && tabs.every((t) => t.inside) && shiftTabs.every((t) => t.inside) && ariaModal === "true" && expanded === "true", { opened, tabs: tabs.map((t) => t.testid || t.text), shiftTabs: shiftTabs.map((t) => t.testid || t.text), expanded, ariaModal });
    run.check("K-2 Esc 只關閉預覽：關卡列表還在，焦點回到 Mock P 的「敵軍預覽」按鈕；沒有切換關卡（battle_id 相同、Godot 沒有重新載入）、沒有寫入",
      !(await isPreviewOpen()) && listStill && afterEsc.testid === "enemy-preview-open" && /Mock P 多路線/.test(afterEsc.cardText || "") && snap0.battle_id === snap1.battle_id && loads === 0 && writes === 0, out.K1);
    await closeModals();
  });

  // ── K. 關卡頁、375 寬、長內容、寫入限制 ──
  await section("K3", async () => {
    const vp = page.viewportSize();
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="enemy-preview-open"]', { timeout: 60000 });
    const url0 = page.url();
    const trigger = card("Mock Q 缺資料").locator('[data-testid="enemy-preview-open"]');
    await trigger.focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="enemy-preview"]');
    for (const n of [2, 3]) await page.locator(`[data-testid="preview-wave-toggle-${n}"]`).click();
    const tabs = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      tabs.push(await activeInfo());
    }
    const fl = await floating();
    out.K3_shot = await H.shot(page, "r17-k3-stages-mobile-keyboard");
    await page.keyboard.press("Escape");
    await H.sleep(300);
    const afterEsc = await page.evaluate(() => {
      const a = document.activeElement;
      return { testid: a && a.getAttribute("data-testid"), cardText: a && a.closest('div[class*="stageCard"]') ? a.closest('div[class*="stageCard"]').innerText.split("\n")[0] : null };
    });
    const flAfter = await floating();
    out.K3 = { tabs: tabs.map((t) => [t.inside, t.testid || t.text]), fl, afterEsc, flAfter, url: page.url() };
    run.check("K-3 獨立關卡頁（375 寬、長內容展開）：Tab 10 次都在視窗內；浮動入口隱藏；Esc 關閉後焦點回到 Mock Q 的按鈕、浮動入口恢復、仍在關卡頁",
      tabs.every((t) => t.inside) && allHidden(fl) && afterEsc.testid === "enemy-preview-open" && /Mock Q 缺資料/.test(afterEsc.cardText || "") && flAfter.every((x) => x.visibility === "visible") && page.url() === url0, out.K3);
    if (vp) await page.setViewportSize(vp);
  });

  await section("K4", async () => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await page.evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem("shenma_player_state"));
      s.migrationHold = { since: Date.now() };
      sessionStorage.setItem("shenma_player_state", JSON.stringify(s));
    });
    await page.reload();
    await H.waitHud(page);
    await page.waitForSelector("text=存檔暫停保存", { timeout: 30000 });
    const n0 = await logLen();
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
    await card("Mock P 多路線").locator('[data-testid="enemy-preview-open"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="enemy-preview"]');
    // 預覽的內容比畫面高時底部的「關閉」要往下捲才看得到（每組有對武將攻擊力）：先捲進畫面，再確認沒有被底部的提示蓋住
    await page.locator('[data-testid="enemy-preview-close-bottom"]').scrollIntoViewIfNeeded();
    await H.sleep(200);
    const state = await page.evaluate(() => {
      const hit = (sel) => {
        const el = document.querySelector(sel);
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return el === top || el.contains(top);
      };
      const notice = [...document.querySelectorAll("div")].find((d) => /存檔暫停保存/.test(d.innerText || "") && getComputedStyle(d).position === "fixed");
      return {
        head: hit('[data-testid="enemy-preview-close"]'),
        foot: hit('[data-testid="enemy-preview-close-bottom"]'),
        noticeVisible: !!notice && getComputedStyle(notice).visibility === "visible",
        focusInside: document.querySelector('[data-testid="enemy-preview"] [role="dialog"]').contains(document.activeElement),
      };
    });
    const fl = await floating();
    out.K4 = { state, fl, shot: await H.shot(page, "r17-k4-hold-mobile") };
    await page.keyboard.press("Escape");
    const writes = await writesSince(n0);
    out.K4.writes = writes;
    run.check("K-4 寫入限制中（375 寬）：預覽可用鍵盤開啟、焦點在視窗裡；底部「存檔暫停保存」提示仍然可見、浮動入口隱藏；兩個關閉按鈕點得到；沒有寫入",
      state.head && state.foot && state.noticeVisible && state.focusInside && allHidden(fl) && writes === 0, out.K4);
    await closeModals();
    // 清掉限制標記：之後的段落要正常開戰
    await page.evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem("shenma_player_state"));
      delete s.migrationHold;
      sessionStorage.setItem("shenma_player_state", JSON.stringify(s));
      sessionStorage.removeItem("__site_iso_tab");
    });
    await page.setViewportSize({ width: 540, height: 900 });
  });

  // ── T. 防禦塔目標優先（主頁） ──
  // 每次快照比較每個敵人的血量，依 enemy_kind 加總每一種敵人受到的傷害
  const damageByKind = async (sel, seconds) => {
    const dmg = {};
    let last = null;
    let g0 = null;
    const deadline = Date.now() + 90000;
    let s = null;
    while (Date.now() < deadline) {
      s = await snapshot(sel);
      if (g0 === null) g0 = s.game_time;
      if (last) {
        for (const [id, hp] of Object.entries(s.enemy_hp || {})) {
          if (id in last && hp < last[id] - 0.001) {
            const k = (s.enemy_kind || {})[id] || "?";
            dmg[k] = Math.round(((dmg[k] || 0) + last[id] - hp) * 100) / 100;
          }
        }
      }
      last = s.enemy_hp || {};
      if (s.game_time - g0 >= seconds) break;
      await H.sleep(80);
    }
    return { dmg, snap: s };
  };
  const only = (dmg, kind) => Object.keys(dmg).length === 1 && dmg[kind] > 0;
  const panelText = async () => (await page.locator('div[class*="upgradePanel"]').first().innerText()).replace(/\s+/g, " ");
  const pressed = async () => {
    const r = {};
    for (const m of ["first", "strongest", "weakest"]) r[m] = await page.locator(`[data-testid="tower-target-${m}"]`).getAttribute("aria-pressed");
    return r;
  };
  const choose = async (mode) => {
    const b0 = await H.bridgeLen(page);
    await page.locator(`[data-testid="tower-target-${mode}"]`).click();
    const reply = await H.waitBridge(page, b0, { type: "tower_target_changed" }, 15000);
    await page.waitForFunction((m) => document.querySelector(`[data-testid="tower-target-${m}"]`)?.getAttribute("aria-pressed") === "true", mode, { timeout: 10000 });
    return reply;
  };
  // 點選塔：用唯讀快照裡塔的位置（Godot 未縮放的畫面座標）乘上縮放比例 min(寬/540, 高/720)，兩個戰鬥頁、手機寬度都適用。
  // 獨立戰鬥頁的 iframe 比視窗寬（左緣在畫面外），塔要放在看得到的格子
  const openTowerPanel = async (sel) => {
    const s = await snapshot(sel);
    const t = Object.values(s.tower_targets || {})[0];
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    }, sel);
    const k = Math.min(r.width / 540, r.height / 720);
    const x = r.left + t.screen.x * k, y = r.top + t.screen.y * k;
    const vp = page.viewportSize();
    if (x < 0 || y < 0 || (vp && (x > vp.width || y > vp.height))) throw new Error(`塔在畫面外（${Math.round(x)}, ${Math.round(y)}）`);
    await page.mouse.click(x, y);
    await page.waitForSelector('[data-testid="tower-target"]', { timeout: 15000 });
  };
  const closePanel = async () => {
    await page.locator('div[class*="upgradePanel"] button[class*="closeBtn"]').first().click();
    await page.waitForSelector('div[class*="upgradePanel"]', { state: "detached", timeout: 10000 }).catch(() => {});
  };
  // 面板在畫面內、關閉、升級與三個目標按鈕都點得到（點擊命中）
  const panelLayout = () =>
    page.evaluate(() => {
      const panel = document.querySelector('div[class*="upgradePanel"]');
      const r = panel.getBoundingClientRect();
      const hit = (el) => {
        const b = el.getBoundingClientRect();
        const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { hit: el === top || el.contains(top), h: Math.round(b.height) };
      };
      const modes = {};
      for (const m of ["first", "strongest", "weakest"]) modes[m] = hit(panel.querySelector(`[data-testid="tower-target-${m}"]`));
      return {
        inView: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
        rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) },
        close: hit(panel.querySelector('button[class*="closeBtn"]')),
        upgrade: hit([...panel.querySelectorAll("button")].find((b) => /^升級/.test(b.innerText))),
        modes,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      };
    });
  const layoutOk = (l) => l.inView && l.close.hit && l.upgrade.hit && Object.values(l.modes).every((m) => m.hit && m.h >= 34);

  await section("T", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const n0 = await logLen();
    await H.selectStage(page, "Mock T 塔目標");
    await H.dismissSplash(page);
    await H.placeTower(page, CELL[0], CELL[1], "弓兵塔");
    await H.sleep(500);
    await H.clickButton(page, "迎戰");
    await H.waitGameTime(page, 2.0);
    await openTowerPanel(IFRAME);
    const p0 = await pressed();
    const layout0 = await panelLayout();
    const text0 = await panelText();
    const s0 = await snapshot(IFRAME);
    const d0 = await damageByKind(IFRAME, 3);
    const r1 = await choose("strongest");
    const p1 = await pressed();
    const hint1 = await page.locator('[data-testid="tower-target-hint"]').innerText();
    const d1 = await damageByKind(IFRAME, 3);
    const r2 = await choose("weakest");
    const d2 = await damageByKind(IFRAME, 3);
    out.T_shot = await H.shot(page, "r17-t-panel-main");
    const uid = Object.keys(d2.snap.tower_targets || {})[0];
    out.T = { p0, text0, timeScale0: s0.time_scale, d0: d0.dmg, r1, p1, hint1, d1: d1.dmg, r2, d2: d2.dmg, towers: d2.snap.tower_targets, timeScale: d2.snap.time_scale };
    run.check("T-1 主頁實際放置弓兵塔並點選：面板有三個選項，預設「優先前方」（Godot 回傳的實際模式）；只打前鋒（三個敵人都在射程內）",
      p0.first === "true" && p0.strongest === "false" && layoutOk(layout0) && /攻擊目標/.test(text0) && /優先前方/.test(text0) && only(d0.dmg, "mock_t_front"), { p0, layout0, d0: d0.dmg });
    run.check("T-2 點「血量最多」：Godot 回傳 tower_target_changed（同一場的 battle_id、這座塔的識別碼）後按鈕才切換、說明改變；之後只打重甲（5000）",
      r1.target_mode === "strongest" && r1.battle_id === s0.battle_id && !!r1.tower_uid && p1.strongest === "true" && p1.first === "false" && /血量最多/.test(hint1) && only(d1.dmg, "mock_t_tank"), { r1, p1, hint1, d1: d1.dmg });
    run.check("T-3 點「血量最少」：之後只打傷兵（300）；快照裡這座塔的模式是 weakest；選擇時沒有改變時間倍率（1）",
      r2.target_mode === "weakest" && only(d2.dmg, "mock_t_weak") && uid === r1.tower_uid && d2.snap.tower_targets[uid].mode === "weakest" && s0.time_scale === 1 && d2.snap.time_scale === 1, out.T);

    // 關閉再開啟、升級：仍是「血量最少」
    await closePanel();
    await openTowerPanel(IFRAME);
    const reopen = await pressed();
    const b0 = await H.bridgeLen(page);
    await page.locator('div[class*="upgradePanel"] button', { hasText: /^升級/ }).click();
    await H.waitBridge(page, b0, { type: "show_upgrade_panel" }, 15000);
    await H.sleep(300);
    const upgraded = await pressed();
    const lvText = await panelText();
    out.T4 = { reopen, upgraded, lvText };
    run.check("T-4 關閉再開啟面板、升級後（Lv.2）仍是「血量最少」",
      reopen.weakest === "true" && upgraded.weakest === "true" && /Lv\.2/.test(lvText), out.T4);

    // 過期或錯誤的命令（從遊戲 iframe 自己送出，模擬晚到的面板命令）：不套用、不回覆；
    // 另一座塔的回覆送到頁面也不會改面板
    const b1 = await H.bridgeLen(page);
    const snapA = await snapshot(IFRAME);
    await page.evaluate(([sel, bid, uid]) => {
      const w = document.querySelector(sel).contentWindow;
      w.postMessage({ __godot_bridge: true, type: "set_tower_target", battle_id: "old-battle", tower_uid: uid, mode: "first" }, "*");
      w.postMessage({ __godot_bridge: true, type: "set_tower_target", battle_id: bid, tower_uid: "tower-999", mode: "first" }, "*");
      w.postMessage({ __godot_bridge: true, type: "set_tower_target", battle_id: bid, tower_uid: uid, mode: "closest" }, "*");
      w.eval(`window.parent.postMessage(${JSON.stringify({ __godot_bridge: true, type: "tower_target_changed", battle_id: bid, tower_uid: "tower-999", target_mode: "first" })}, "*")`);
    }, [IFRAME, snapA.battle_id, uid]);
    await H.sleep(1200);
    const replies = (await H.bridgeSince(page, b1)).filter((m) => m.type === "tower_target_changed").length;
    const snapB = await snapshot(IFRAME);
    const stale = await pressed();
    out.T5 = { replies, mode: snapB.tower_targets[uid], stale };
    run.check("T-5 錯誤的命令（別場的 battle_id、不存在的塔、不認得的模式）不套用、Godot 不回覆；別座塔的回覆不改目前的面板",
      replies === 1 && snapB.tower_targets[uid].mode === "weakest" && stale.weakest === "true", out.T5);
    await closePanel();

    // 同一關重來：新放置的塔回到「優先前方」
    await H.selectStage(page, "Mock T 塔目標");
    await H.dismissSplash(page);
    await H.placeTower(page, CELL[0], CELL[1], "弓兵塔");
    await H.sleep(500);
    await openTowerPanel(IFRAME);
    const fresh = await pressed();
    const snapC = await snapshot(IFRAME);
    out.T6 = { fresh, towers: snapC.tower_targets, battle: [snapA.battle_id, snapC.battle_id] };
    run.check("T-6 同一關重來（新的 battle_id）：新放置的塔預設「優先前方」，上一場的塔已移除",
      fresh.first === "true" && Object.keys(snapC.tower_targets).length === 1 && Object.values(snapC.tower_targets)[0].mode === "first" && snapA.battle_id !== snapC.battle_id, out.T6);
    await closePanel();

    // 存檔與請求：這段期間沒有任何寫入，session 沒有目標優先的欄位
    const writes = await writesSince(n0);
    const sess = await page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
    out.T7 = { writes, sessionHasTarget: /target_mode|tower_uid|strongest|weakest/.test(sess) };
    run.check("T-7 目標優先不寫進存檔：這段期間沒有寫入請求，session 沒有相關欄位", writes === 0 && !out.T7.sessionHasTarget, out.T7);
  });

  // ── T. 手機寬度 ──
  await section("T-mobile", async () => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.selectStage(page, "Mock T 塔目標");
    await H.dismissSplash(page);
    await H.placeTower(page, CELL[0], CELL[1], "弓兵塔");
    await H.sleep(500);
    await openTowerPanel(IFRAME);
    const layout = await panelLayout();
    const reply = await choose("weakest");
    out.Tm = { layout, reply, shot: await H.shot(page, "r17-t-panel-mobile") };
    run.check("T-8 手機寬度（375×740）：面板在畫面內；關閉、升級與三個目標按鈕都點得到（按鈕高度 34 以上）；點選後同樣由 Godot 確認",
      layoutOk(layout) && layout.scrollW <= layout.innerW && reply.target_mode === "weakest", out.Tm);
    await closePanel();
    await page.setViewportSize({ width: 540, height: 900 });
  });

  // ── T. 獨立戰鬥頁 ──
  await section("T-battle", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_10");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
    await H.sleep(1000);
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, BIFRAME);
    await page.mouse.click(r.x, r.y);
    await H.sleep(500);
    await page.evaluate(([sel, c, row]) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "place_tower", tower_type: "archer", cell_x: c, cell_y: row }, "*");
    }, [BIFRAME, 2, 4]);
    await H.sleep(500);
    await page.locator("button", { hasText: /^迎戰$/ }).click();
    await H.sleep(2500);
    await openTowerPanel(BIFRAME);
    const p0 = await pressed();
    const layout = await panelLayout();
    const reply = await choose("strongest");
    const d = await damageByKind(BIFRAME, 3);
    out.Tb = { p0, layout, reply, dmg: d.dmg, shot: await H.shot(page, "r17-t-panel-battle") };
    run.check("T-9 獨立戰鬥頁（遊戲畫面比視窗寬）：實際點選塔開啟同一個面板（預設「優先前方」），面板完整在畫面內、按鈕都點得到；選「血量最多」由 Godot 確認後只打重甲",
      p0.first === "true" && layoutOk(layout) && reply.target_mode === "strongest" && only(d.dmg, "mock_t_tank"), out.Tb);
    await closePanel();
  });

  // ── C. 戰場上的部署選單與選取面板：浮動入口隱藏、欄位與按鈕沒有被擋住（R17-C1、R17-C2） ──
  // 格子在畫面上的位置：和 H.clickCell 同一套換算（14×11 格、縮放比例 min(寬/540, 高/720)），可以指定哪個 iframe
  const clickCellIn = async (sel, c, row, cols = 14, rows = 11) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    }, sel);
    const s = Math.min(r.width / 540, r.height / 720);
    const vx = r.width / s, vy = r.height / s;
    const tile = Math.max(16, Math.floor(Math.min(vx / cols, vy / rows)));
    const ox = (vx - cols * tile) / 2, oy = (vy - rows * tile) / 2;
    const x = r.left + (ox + (c + 0.5) * tile) * s, y = r.top + (oy + (row + 0.5) * tile) * s;
    const vp = page.viewportSize();
    if (x < 0 || y < 0 || (vp && (x > vp.width || y > vp.height))) throw new Error(`格子 (${c},${row}) 在畫面外（${Math.round(x)}, ${Math.round(y)}）`);
    await page.mouse.click(x, y);
  };
  // 部署選單（menu）或選取面板（panel）的每個欄位與按鈕：是否完整在畫面內、中心點到的是不是自己、是不是點到浮動入口；
  // overlap：和面板重疊的浮動入口，在重疊區域取 3×3 個點，每一點都要點到面板（入口沒隱藏就會點到入口）；
  // grid：目標按鈕列的 Bootstrap class 與排列
  const overlayState = (kind) =>
    page.evaluate((kind) => {
      const root = document.querySelector(kind === "menu" ? 'div[class*="placementMenu"]' : 'div[class*="upgradePanel"]');
      if (!root) return { missing: true, items: [] };
      const sels = kind === "menu"
        ? ['[class*="closeBtn"]', '[class*="tabBtn"]', '[class*="menuCard"]']
        : ['[class*="closeBtn"]', '[class*="upgStatItem"]', 'button[data-testid^="tower-target-"]', 'button[class*="upgradeBtn"]'];
      const items = [];
      for (const sel of sels) {
        for (const el of root.querySelectorAll(sel)) {
          const b = el.getBoundingClientRect();
          const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          items.push({
            name: (el.getAttribute("data-testid") || el.innerText || sel).replace(/\s+/g, " ").slice(0, 16),
            inView: b.left >= 0 && b.top >= 0 && b.right <= window.innerWidth && b.bottom <= window.innerHeight,
            hit: !!top && (el === top || el.contains(top)),
            hitFloating: !!top && !!top.closest("[data-floating-entry]"),
          });
        }
      }
      const r = root.getBoundingClientRect();
      const overlap = [];
      for (const e of document.querySelectorAll("[data-floating-entry]")) {
        const x = e.getBoundingClientRect();
        const L = Math.max(x.left, r.left, 0) + 1, R = Math.min(x.right, r.right, window.innerWidth) - 1;
        const T = Math.max(x.top, r.top, 0) + 1, B = Math.min(x.bottom, r.bottom, window.innerHeight) - 1;
        if (x.width <= 0 || R <= L || B <= T) continue;
        let points = 0, onPanel = 0, onEntry = 0;
        for (const fx of [0, 0.5, 1]) {
          for (const fy of [0, 0.5, 1]) {
            const top = document.elementFromPoint(L + (R - L) * fx, T + (B - T) * fy);
            points += 1;
            if (top && root.contains(top)) onPanel += 1;
            if (top && top.closest("[data-floating-entry]")) onEntry += 1;
          }
        }
        overlap.push({ name: e.getAttribute("data-floating-entry"), area: Math.round((R - L) * (B - T)), points, onPanel, onEntry });
      }
      let grid = null;
      const btns = [...root.querySelectorAll('button[data-testid^="tower-target-"]')];
      if (btns.length) {
        const row = btns[0].parentElement.parentElement;
        const rects = btns.map((b) => b.getBoundingClientRect());
        // 三個選項時一列三個（col-4）；能對空的塔多了「優先飛行」，四個選項時兩列各兩個（col-6）
        const perRow = btns.length > 3 ? 2 : 3;
        const col = perRow === 2 ? "col-6" : "col-4";
        const lines = [...new Set(rects.map((x) => Math.round(x.top)))];
        grid = {
          count: btns.length,
          rowClass: row.classList.contains("row") && row.classList.contains("g-1"),
          cols: btns.every((b) => b.parentElement.classList.contains(col) && b.parentElement.parentElement === row),
          lines: lines.length,
          sameLine: lines.length === Math.ceil(btns.length / perRow) && rects.every((x, i) => Math.abs(x.top - rects[i - (i % perRow)].top) < 1),
          sameWidth: rects.every((x) => Math.abs(x.width - rects[0].width) < 1.5),
          inline: getComputedStyle(row).display,
        };
      }
      return { rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }, items, overlap, grid };
    }, kind);
  // 選取面板：每一項完整在畫面內、中心點得到自己、沒有點到浮動入口。
  // 部署選單：每一項中心點得到自己、沒有點到浮動入口；選單超出畫面的部分（既有的定位，D22 處理）另外記在 outOfView
  const itemOk = (i, needInView) => i.hit && !i.hitFloating && (!needInView || i.inView);
  const itemsOk = (st, needInView = true) =>
    !st.missing && st.items.length > 0 && st.items.every((i) => itemOk(i, needInView)) && st.overlap.every((o) => o.onPanel === o.points && o.onEntry === 0);
  const brief = (st, needInView = true) => ({
    rect: st.rect, overlap: st.overlap, grid: st.grid, n: st.items.length,
    bad: st.items.filter((i) => !itemOk(i, needInView)),
    outOfView: st.items.filter((i) => !i.inView).map((i) => i.name),
  });
  // 一個情境：建築格開部署選單（檢查後按 × 關閉）→ 再開一次放弓兵塔 → 點塔開面板 → 關閉 → 路徑格放關羽 → 點武將開面板 → 關閉
  const overlayCase = async (label, sel, build, road) => {
    const r = {};
    await clickCellIn(sel, ...build);
    await page.waitForSelector("text=建築位部署", { timeout: 15000 });
    await H.sleep(400);
    r.menu = await overlayState("menu");
    r.menuFl = await floating();
    r.menuShot = await H.shot(page, `r17-c-${label}-menu`);
    await page.locator('div[class*="placementMenu"] button[class*="closeBtn"]').click();
    await page.waitForSelector('div[class*="placementOverlay"]', { state: "detached", timeout: 10000 });
    await H.sleep(200);
    r.menuAfter = await floating();

    await clickCellIn(sel, ...build);
    await page.waitForSelector("text=建築位部署", { timeout: 15000 });
    await page.locator('div[class*="placementMenu"]').getByRole("button", { name: /弓兵塔/ }).click();
    await page.waitForSelector('div[class*="placementOverlay"]', { state: "detached", timeout: 10000 });
    await H.sleep(500);
    await clickCellIn(sel, ...build);
    await page.waitForSelector('[data-testid="tower-target"]', { timeout: 15000 });
    await H.sleep(300);
    r.tower = await overlayState("panel");
    if (label === "main-mobile") {
      // Round 17 的版面裡，手機主頁這座塔的面板和說明入口自然重疊（Codex 發現的情境）。Round 18 的 D22 讓遊戲畫面置中留邊，
      // 面板不再碰到入口；改成把說明入口暫時移到「攻擊力」欄位上（模擬重疊），確認入口隱藏時重疊區域仍點得到面板
      await page.evaluate(() => {
        const info = document.querySelector('[data-floating-entry="page-info"]');
        const stat = document.querySelector('div[class*="upgradePanel"] [class*="upgStatItem"]');
        if (!info || !stat) return;
        const b = stat.getBoundingClientRect();
        info.dataset.r17Style = info.getAttribute("style") || "";
        info.style.top = `${Math.round(b.top)}px`;
        info.style.left = `${Math.round(b.left)}px`;
      });
      r.towerMoved = await overlayState("panel");
      await page.evaluate(() => {
        const info = document.querySelector('[data-floating-entry="page-info"]');
        if (info && info.dataset.r17Style !== undefined) {
          info.setAttribute("style", info.dataset.r17Style);
          delete info.dataset.r17Style;
        }
      });
    }
    r.towerFl = await floating();
    r.towerShot = await H.shot(page, `r17-c-${label}-tower`);
    await closePanel();
    await H.sleep(200);
    r.towerAfter = await floating();

    await clickCellIn(sel, ...road);
    await page.waitForSelector("text=路徑部署", { timeout: 15000 });
    await page.locator('div[class*="placementMenu"]').getByRole("button", { name: /關羽/ }).click();
    await page.waitForSelector('div[class*="placementOverlay"]', { state: "detached", timeout: 10000 });
    await H.sleep(500);
    await clickCellIn(sel, ...road);
    await page.waitForSelector('div[class*="upgradePanel"]', { timeout: 15000 });
    await H.sleep(300);
    r.heroTitle = (await panelText()).slice(0, 12);
    r.hero = await overlayState("panel");
    r.heroFl = await floating();
    r.heroShot = await H.shot(page, `r17-c-${label}-hero`);
    await closePanel();
    await H.sleep(200);
    r.heroAfter = await floating();
    return r;
  };
  const caseOk = (r) =>
    allHidden(r.menuFl) && itemsOk(r.menu, false) && allShown(r.menuAfter) &&
    allHidden(r.towerFl) && itemsOk(r.tower) && allShown(r.towerAfter) &&
    /關羽/.test(r.heroTitle) && allHidden(r.heroFl) && itemsOk(r.hero) && allShown(r.heroAfter);
  const caseBrief = (r) => ({
    menu: brief(r.menu, false), menuFl: r.menuFl, menuAfter: r.menuAfter,
    tower: brief(r.tower), towerFl: r.towerFl, towerAfter: r.towerAfter,
    heroTitle: r.heroTitle, hero: brief(r.hero), heroFl: r.heroFl, heroAfter: r.heroAfter,
    shots: [r.menuShot, r.towerShot, r.heroShot],
  });
  const CASES = [
    // 主頁：塔放在 Codex 發現被說明按鈕蓋住的 (1,4)，武將放在旁邊的路徑格
    { label: "main-desktop", page: "main", vp: { width: 1280, height: 800 }, build: CELL, road: [2, 5] },
    { label: "main-mobile", page: "main", vp: { width: 375, height: 740 }, build: CELL, road: [2, 5] },
    // 獨立戰鬥頁：遊戲畫面比視窗寬（D22），用中間看得到的格子
    { label: "battle-desktop", page: "battle", vp: { width: 1280, height: 800 }, build: [6, 4], road: [7, 5] },
    { label: "battle-mobile", page: "battle", vp: { width: 375, height: 740 }, build: [6, 4], road: [7, 5] },
  ];
  out.C = {};
  for (const [i, c] of CASES.entries()) {
    await section(`C-${c.label}`, async () => {
      await page.setViewportSize(c.vp);
      let sel = IFRAME;
      if (c.page === "main") {
        await page.goto(H.BASE + "/shenmaSanguo");
        await H.waitHud(page);
        await H.selectStage(page, "Mock T 塔目標");
        await H.dismissSplash(page);
      } else {
        sel = BIFRAME;
        await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_10");
        await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
        await H.sleep(1000);
        const m = await page.evaluate((sel) => {
          const b = document.querySelector(sel).getBoundingClientRect();
          return { x: Math.min(window.innerWidth, b.right) / 2 + Math.max(0, b.left) / 2, y: b.top + b.height / 2 };
        }, sel);
        await page.mouse.click(m.x, m.y);
        await H.sleep(500);
      }
      // 關開場畫面的那一下如果剛好開了部署選單，先關掉
      if ((await page.locator('div[class*="placementOverlay"]').count()) > 0) {
        await page.locator('div[class*="placementMenu"] button[class*="closeBtn"]').click();
        await H.sleep(300);
      }
      const r = await overlayCase(c.label, sel, c.build, c.road);
      out.C[c.label] = caseBrief(r);
      if (c.label === "main-mobile") out.C.mainMobileTowerOverlap = { natural: r.tower.overlap, moved: r.towerMoved ? r.towerMoved.overlap : null };
      if (i === 0) out.C.grid = r.tower.grid;
      run.check(`C-${i + 1} ${c.page === "main" ? "主頁" : "獨立戰鬥頁"}${c.vp.width}×${c.vp.height}：部署選單、塔面板、武將面板開啟時浮動入口都隱藏、點不到；塔與武將面板每個欄位與按鈕（關閉、升級、目標）完整在畫面內、點得到自己；部署選單的關閉、分頁與每張卡片點得到自己；每次關閉後入口恢復`,
        caseOk(r), out.C[c.label]);
    });
  }
  const ov = ((out.C.mainMobileTowerOverlap && out.C.mainMobileTowerOverlap.moved) || []).find((o) => o.name === "page-info");
  run.check("C-5 說明入口和塔面板重疊時（Codex 發現的情境；D22 之後手機主頁不再自然重疊，把入口移到「攻擊力」上模擬）：重疊區域的 9 個點都點到面板、沒有點到入口",
    !!ov && ov.points === 9 && ov.onPanel === 9 && ov.onEntry === 0, { overlap: out.C.mainMobileTowerOverlap });
  const g = out.C.grid;
  run.check("C-6 目標按鈕列用 Bootstrap Grid：外層 row（g-1）；三個選項時每個按鈕在 col-4、同一列，四個選項（能對空的塔多了優先飛行）時在 col-6、兩列各兩個；同寬",
    !!g && g.count >= 3 && g.rowClass && g.cols && g.sameLine && g.sameWidth, g);
  await page.setViewportSize({ width: 540, height: 900 });

  // ── V. 舊版遊戲（協定 2）：顯示更新提示，不送關卡資料 ──
  await section("V", async () => {
    const GAME_FILE = /\/games\/shenmaSanguo\/(index\.(?:html|pck|service\.worker\.js))(?:\?[^#]*)?$/;
    const hits = [];
    const route = async (rt) => {
      const name = (rt.request().url().match(GAME_FILE) || [])[1];
      if (!name) return rt.fallback();
      hits.push(name);
      const res = await rt.fetch();
      const headers = { ...res.headers() };
      for (const h of ["content-length", "etag", "last-modified", "content-encoding"]) delete headers[h];
      return rt.fulfill({ status: 200, headers, path: `${PROTO2}/${name}` });
    };
    await H.resetOrigin(page, { keepMockDb: true });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), A);
    await page.context().route(GAME_FILE, route);
    try {
      const b0 = await H.bridgeLen(page);
      await page.goto(H.BASE + "/shenmaSanguo");
      const ready = await H.waitBridge(page, b0, { type: "game_ready" }, 180000);
      await H.sleep(3000);
      const prompt = await page.locator('[data-testid="engine-incompatible"]').innerText().catch(() => "");
      const snap = await snapshot(IFRAME);
      out.V = { hits: [...new Set(hits)], protocol: ready.protocol ?? null, prompt, stage: snap.stage, state: snap.game_state, shot: await H.shot(page, "r17-v-proto2-prompt") };
      run.check("V-1 舊版遊戲（Round 16 的產物，協定 2）：顯示「遊戲版本需要更新」，沒有送出關卡資料（面板的新選項不會對舊遊戲默默失效）",
        out.V.hits.includes("index.pck") && out.V.protocol === 2 && /遊戲版本需要更新/.test(prompt) && snap.stage === "" && snap.game_state === 0, out.V);
    } finally {
      await page.context().unroute(GAME_FILE, route);
      await H.resetOrigin(page, { keepMockDb: true });
    }
  });

  return run.finish({ out });
}
