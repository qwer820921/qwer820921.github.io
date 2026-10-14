async (page) => {
  // R19（瀏覽器）：戰鬥速度 1×／2×、部署選單的暫時慢速、戰場留邊關閉部署選單
  // M. 主頁（375×740）：預設 1×；命令沒送到 Godot 時畫面不改；2× 由 Godot 確認後才亮起；2× 開部署選單是 0.1（不是 0.2）、取消回 2；
  //    選單中選 1×（提示「部署中暫時慢速」）、點選單外關閉後是 1；點戰場留邊關閉：不部署、不切關、金幣不變、恢復選擇；
  //    戰鬥中保留 2×、可切換；橫向轉向後 battle_id 與 2× 不變、留邊（左右）也能關閉；開著選單時切關：新的一場 1×、選單關閉
  // B. 獨立戰鬥頁（375×740）：頂欄的 1×／2× 與迎戰、自動、返回都看得到點得到；2× → 部署 0.1 → 取消回 2；選單中選 1× → 留邊關閉後 1；
  //    橫向轉向：場次不變、按鈕仍點得到
  // V. 舊版遊戲（協定 4，加入戰鬥速度之前的產物）：顯示版本需要更新、不送關卡資料（速度按鈕不會對舊遊戲默默失效）
  // 全部 mock、虛構金鑰 test_r19_*；速度不寫進存檔
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const A = "test_r19_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const WRITES = ["save_profile", "upgrade_hero", "save_result", "create_profile"];
  // 協定 4 的遊戲：依 README 用 git show 取出到這個目錄（已在 .gitignore）
  const PROTO4 = "scripts/shenma-regression/.legacy/proto4-godot";

  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const logLen = async () => (await H.gasLog(page)).length;
  const writesSince = async (n) => (await H.gasLog(page)).slice(n).filter((e) => WRITES.includes(e.action)).length;
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r19-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await page.keyboard.press("Escape"); } catch { /* 沒有視窗可關 */ }
    }
  };
  const snapshot = async (sel) => {
    const id = "r19-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  // Godot 目前的倍率狀態（唯讀快照）
  const engine = async (sel) => {
    const s = await snapshot(sel);
    return { bid: s.battle_id, state: s.game_state, pref: s.speed_pref, ts: s.time_scale, menu: s.deploy_menu_id, wave: s.wave, hp: s.hp, towers: Object.keys(s.tower_targets || {}).length, kills: s.kills };
  };
  const rectOf = (sel) => page.evaluate((sel) => {
    const b = document.querySelector(sel).getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  }, sel);
  // 格子在畫面上的位置（和 r18 同一套換算：14×11 格、縮放比例 min(寬/540, 高/720)）
  const cellPoint = async (sel, c, row, cols = 14, rows = 11) => {
    const r = await rectOf(sel);
    const s = Math.min(r.width / 540, r.height / 720);
    const vx = r.width / s, vy = r.height / s;
    const tile = Math.max(16, Math.floor(Math.min(vx / cols, vy / rows)));
    const ox = (vx - cols * tile) / 2, oy = (vy - rows * tile) / 2;
    return { x: r.left + (ox + (c + 0.5) * tile) * s, y: r.top + (oy + (row + 0.5) * tile) * s };
  };
  const openMenu = async (sel, c, row) => {
    const b0 = await H.bridgeLen(page);
    const p = await cellPoint(sel, c, row);
    await page.mouse.click(p.x, p.y);
    const msg = await H.waitBridge(page, b0, { type: "click_cell" }, 15000);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 10000 });
    await H.sleep(300);
    return msg;
  };
  const menuGone = () => page.waitForSelector('div[class*="placementOverlay"]', { state: "detached", timeout: 10000 });
  const closeMenuIfOpen = async () => {
    if ((await page.locator('div[class*="placementOverlay"]').count()) > 0) {
      await page.locator('[data-testid="placement-menu"] button[class*="closeBtn"]').click();
      await menuGone();
      await H.sleep(200);
    }
  };
  // 等 Godot 回報部署慢速已結束（關閉選單後的 update_stats）
  const waitSlowEnd = (b0) => H.waitBridge(page, b0, { type: "update_stats", deploy_slow: false }, 15000);
  // 速度按鈕：亮起的是哪一個、看得到點得到、提示
  const speedUI = () =>
    page.evaluate(() => {
      const g = document.querySelector('[data-testid="speed-toggle"]');
      if (!g) return null;
      const info = (el) => {
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { pressed: el.getAttribute("aria-pressed"), disabled: el.disabled, inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, hit: !!top && (el === top || el.contains(top)) };
      };
      const x1 = info(g.querySelector('[data-testid="speed-1"]'));
      const x2 = info(g.querySelector('[data-testid="speed-2"]'));
      const hint = g.querySelector('[data-testid="speed-deploy-hint"]');
      return { x1, x2, shown: x2.pressed === "true" ? 2 : x1.pressed === "true" ? 1 : null, hint: hint ? hint.innerText.trim() : null };
    });
  const uiOk = (ui) => !!ui && [ui.x1, ui.x2].every((b) => b.inView && b.hit && !b.disabled);
  // 按下速度按鈕，等 Godot 確認（update_stats 帶這個速度）
  const clickSpeed = async (v) => {
    const b0 = await H.bridgeLen(page);
    await page.locator(`[data-testid="speed-${v}"]`).click();
    const st = await H.waitBridge(page, b0, { type: "update_stats", speed: v }, 15000);
    const reply = await H.waitBridge(page, b0, { type: "game_speed_result" }, 15000);
    await H.sleep(300);
    return { st, reply };
  };
  // 戰場留邊上的一點：在 [data-game-stage] 內、遊戲畫面外，而且不在選單上（最上層是留邊的遮罩）；沒有時回傳 null
  const marginPoint = (sel) =>
    page.evaluate((sel) => {
      const st = document.querySelector("[data-game-stage]").getBoundingClientRect();
      const f = document.querySelector(sel).getBoundingClientRect();
      const vis = { l: Math.max(0, st.left), t: Math.max(0, st.top), r: Math.min(innerWidth, st.right), b: Math.min(innerHeight, st.bottom) };
      const cands = [];
      for (const fx of [0.1, 0.5, 0.9]) {
        if (vis.b - f.bottom > 12) cands.push({ x: vis.l + (vis.r - vis.l) * fx, y: (f.bottom + vis.b) / 2, side: "bottom" });
        if (f.top - vis.t > 12) cands.push({ x: vis.l + (vis.r - vis.l) * fx, y: (vis.t + f.top) / 2, side: "top" });
      }
      for (const fy of [0.2, 0.5, 0.8]) {
        if (f.left - vis.l > 12) cands.push({ x: (vis.l + f.left) / 2, y: vis.t + (vis.b - vis.t) * fy, side: "left" });
        if (vis.r - f.right > 12) cands.push({ x: (f.right + vis.r) / 2, y: vis.t + (vis.b - vis.t) * fy, side: "right" });
      }
      for (const c of cands) {
        const top = document.elementFromPoint(c.x, c.y);
        if (top && top.getAttribute("data-testid") === "stage-menu-backdrop") return { ...c, x: Math.round(c.x), y: Math.round(c.y) };
      }
      return null;
    }, sel);
  // 選單外（遊戲畫面上、選單以外）的一點：最上層是選單的遮罩
  const overlayPoint = () =>
    page.evaluate(() => {
      const ov = document.querySelector('div[class*="placementOverlay"]');
      if (!ov) return null;
      const r = ov.getBoundingClientRect();
      for (const [fx, fy] of [[0.9, 0.1], [0.1, 0.1], [0.9, 0.9], [0.1, 0.9], [0.5, 0.05]]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        const top = document.elementFromPoint(x, y);
        if (top === ov) return { x: Math.round(x), y: Math.round(y) };
      }
      return null;
    });
  const gameReadyCount = () => page.evaluate(() => (window.__bridgeLog || []).filter((m) => m.type === "game_ready").length);
  const layout = (sel) =>
    page.evaluate((sel) => {
      const f = document.querySelector(sel).getBoundingClientRect();
      return {
        inView: f.left >= -0.5 && f.top >= -0.5 && f.right <= innerWidth + 0.5 && f.bottom <= innerHeight + 0.5,
        ratio: Math.abs(f.width * 4 - f.height * 3),
        sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight,
      };
    }, sel);
  const layoutOk = (l) => l.inView && l.ratio <= 4 && l.sw <= l.vw && l.sh <= l.vh;
  // 其他按鈕看得到、點得到（主頁：迎戰、自動、武將、隊伍與金幣；獨立戰鬥頁：返回、自動、迎戰與金幣）
  const otherButtons = (kind) =>
    page.evaluate((kind) => {
      const q = kind === "main" ? '[class*="hudTopBar"] button, [class*="hudActionBar"] button' : 'div[class*="battleTopBar"] button';
      const want = kind === "main" ? /^(迎戰|戰鬥中|自動|武將|隊伍)$/ : /^(‹|自動 (ON|OFF)|迎戰|戰鬥中)$/;
      const res = [...document.querySelectorAll(q)].filter((b) => want.test(b.innerText.trim())).map((b) => {
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { text: b.innerText.trim(), ok: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!top && (b === top || b.contains(top)) };
      });
      const gold = document.querySelector(kind === "main" ? '[class*="hudRight"] [class*="hudStat"]' : '[class*="statsRow"] [class*="statValue"]');
      const g = gold ? gold.getBoundingClientRect() : null;
      return { buttons: res, gold: !!g && g.left >= 0 && g.right <= innerWidth && g.width > 0 };
    }, kind);
  const shownGold = (kind) =>
    page.evaluate((kind) => {
      const el = kind === "main" ? document.querySelector('[class*="hudRight"] [class*="hudStat"]') : document.querySelector('[class*="statsRow"] [class*="statValue"]');
      return el ? Number((el.innerText || "").replace(/[^0-9]/g, "")) : NaN;
    }, kind);
  const openPage = async (kind, vp) => {
    await page.setViewportSize(vp);
    if (kind === "main") {
      await page.goto(H.BASE + "/shenmaSanguo");
      await H.waitHud(page);
      await H.selectStage(page, "Mock T 塔目標");
      await H.dismissSplash(page);
      await closeMenuIfOpen();
      return IFRAME;
    }
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_10");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
    await H.sleep(1000);
    const r = await rectOf(BIFRAME);
    await page.mouse.click(r.left + r.width / 2, r.top + r.height / 2);
    await H.sleep(500);
    await closeMenuIfOpen();
    return BIFRAME;
  };

  // ── 前置：玩家進度 chapter1_10（Mock T 塔目標：三個很慢的敵人，戰鬥會持續很久） ──
  const profile = { nickname: "R19 玩家", level: 1, exp: 0, gold: 5000, capacity: 11, max_stage: "chapter1_10", heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }] };
  await section("setup", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", { profiles: { [A]: profile }, battle_logs: [] });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), A);
  });

  // ── M. 主頁 ──
  await section("M", async () => {
    const sel = await openPage("main", { width: 375, height: 740 });
    const n0 = await logLen();
    // M-1：新的一場是 1×；按鈕和其他 HUD 都看得到、點得到
    const e1 = await engine(sel);
    const ui1 = await speedUI();
    const other1 = await otherButtons("main");
    out.M1 = { engine: e1, ui: ui1, other: other1, shot: await H.shot(page, "r19-m1-hud-375") };
    run.check("M-1 主頁 375×740：新的一場 Godot 是 1 倍（選擇 1、倍率 1），HUD 的 1× 亮起；1×／2× 與迎戰、自動、武將、隊伍、金幣都看得到、點得到",
      e1.pref === 1 && e1.ts === 1 && e1.state === 1 && ui1 && ui1.shown === 1 && uiOk(ui1) && !ui1.hint && other1.buttons.length === 4 && other1.buttons.every((b) => b.ok) && other1.gold, out.M1);
    // M-1b：320×640 也放得下（不擠掉其他按鈕）；縮放不重新載入
    await page.setViewportSize({ width: 320, height: 640 });
    await H.sleep(700);
    const ui1b = await speedUI();
    const other1b = await otherButtons("main");
    const lay1b = await layout(sel);
    out.M1b = { ui: ui1b, other: other1b, layout: lay1b, shot: await H.shot(page, "r19-m1b-hud-320") };
    await page.setViewportSize({ width: 375, height: 740 });
    await H.sleep(700);
    run.check("M-1b 主頁 320×640：1×／2× 與迎戰、自動、武將、隊伍、金幣都看得到、點得到，完整戰場、沒有捲動",
      uiOk(ui1b) && ui1b.shown === 1 && other1b.buttons.length === 4 && other1b.buttons.every((b) => b.ok) && other1b.gold && layoutOk(lay1b), out.M1b);

    // M-2：命令沒送到 Godot（測試攔下這一次的 set_game_speed）：畫面不改，仍是 1×，Godot 仍是 1
    await page.evaluate((sel) => {
      // Window 的 postMessage 是視窗自己的屬性：保存原本的函式，測試後原樣指定回去（不能用 delete，會把它刪掉）
      const w = document.querySelector(sel).contentWindow;
      window.__r19OrigPost = w.postMessage;
      window.__r19Dropped = [];
      w.postMessage = (msg, ...rest) => {
        if (msg && msg.type === "set_game_speed" && window.__r19Dropped.length === 0) {
          window.__r19Dropped.push(msg);
          return;
        }
        return window.__r19OrigPost.call(w, msg, ...rest);
      };
    }, sel);
    await page.locator('[data-testid="speed-2"]').click();
    await H.sleep(1500);
    const ui2 = await speedUI();
    const e2 = await engine(sel);
    const dropped = await page.evaluate(() => window.__r19Dropped);
    await page.evaluate((sel) => { document.querySelector(sel).contentWindow.postMessage = window.__r19OrigPost; }, sel);
    out.M2 = { dropped, ui: ui2, engine: e2 };
    run.check("M-2 按 2× 但命令沒送到 Godot：畫面仍是 1×（不先改顯示），Godot 仍是 1；送出的命令帶這一場的 battle_id 與數字 2",
      dropped.length === 1 && dropped[0].battle_id === e1.bid && dropped[0].speed === 2 && ui2.shown === 1 && e2.pref === 1 && e2.ts === 1, out.M2);

    // M-3：真的按 2×：Godot 確認後才亮起；Godot 的選擇與倍率都是 2
    const c3 = await clickSpeed(2);
    const ui3 = await speedUI();
    const e3 = await engine(sel);
    out.M3 = { stats: { speed: c3.st.speed, ts: c3.st.time_scale }, reply: c3.reply, ui: ui3, engine: e3 };
    run.check("M-3 按 2×：Godot 回覆成功（speed 2、倍率 2）後 2× 亮起；Godot 快照的選擇與倍率都是 2、仍在備戰",
      c3.reply.ok === true && c3.reply.battle_id === e1.bid && c3.st.time_scale === 2 && ui3.shown === 2 && e3.pref === 2 && e3.ts === 2 && e3.state === 1 && e3.bid === e1.bid, out.M3);

    // M-4：2× 時點空格開部署選單：固定 0.1（不是 0.2），2× 仍亮著、顯示「部署中暫時慢速」；按 × 取消 → 回到 2
    const m4 = await openMenu(sel, 2, 4);
    const e4 = await engine(sel);
    const ui4 = await speedUI();
    out.M4_shot = await H.shot(page, "r19-m4-deploy-slow");
    const b4 = await H.bridgeLen(page);
    await page.locator('[data-testid="placement-menu"] button[class*="closeBtn"]').click();
    await menuGone();
    await waitSlowEnd(b4);
    const e4b = await engine(sel);
    const ui4b = await speedUI();
    out.M4 = { click: { bid: m4.battle_id, menu: m4.menu_id }, menu: e4, ui: ui4, after: e4b, uiAfter: ui4b };
    run.check("M-4 2× 時開部署選單：click_cell 帶這一場的 battle_id 與選單編號；倍率 0.1（不是 0.2）、選擇仍 2，畫面仍亮 2× 並提示「部署中暫時慢速」；按 × 取消後倍率回到 2、提示消失",
      m4.battle_id === e1.bid && m4.menu_id > 0 && e4.ts === 0.1 && e4.pref === 2 && e4.menu === m4.menu_id && ui4.shown === 2 && ui4.hint === "部署中暫時慢速" && e4b.ts === 2 && e4b.menu === 0 && ui4b.shown === 2 && !ui4b.hint, out.M4);

    // M-5：選單開著時按 1×（HUD 在選單上方）：選擇變 1、倍率仍 0.1；點選單外（遊戲畫面上）關閉 → 1
    await openMenu(sel, 3, 4);
    const ui5a = await speedUI();
    const c5 = await clickSpeed(1);
    const e5 = await engine(sel);
    const ui5 = await speedUI();
    const op = await overlayPoint();
    const b5 = await H.bridgeLen(page);
    await page.mouse.click(op.x, op.y);
    await menuGone();
    await waitSlowEnd(b5);
    const e5b = await engine(sel);
    out.M5 = { uiBefore: ui5a, reply: c5.reply, menu: e5, ui: ui5, overlay: op, after: e5b };
    run.check("M-5 選單開著時按 1×：回覆成功（speed 1、倍率 0.1），倍率仍是 0.1、1× 亮起並提示慢速；點選單外關閉後倍率是 1",
      uiOk(ui5a) && c5.reply.ok === true && c5.reply.speed === 1 && c5.reply.time_scale === 0.1 && e5.ts === 0.1 && e5.pref === 1 && ui5.shown === 1 && ui5.hint === "部署中暫時慢速" && !!op && e5b.ts === 1 && e5b.pref === 1 && e5b.menu === 0, out.M5);

    // M-6：2× 時點戰場留邊（遊戲畫面外）關閉部署選單：Godot 沒有收到點擊（沒有新的 click_cell）、沒有部署、沒有切關、金幣不變；倍率回到 2
    await clickSpeed(2);
    await openMenu(sel, 4, 4);
    const e6 = await engine(sel);
    const mp = await marginPoint(sel);
    const g6 = await shownGold("main");
    const b6 = await H.bridgeLen(page);
    await page.mouse.click(mp.x, mp.y);
    await menuGone();
    await waitSlowEnd(b6);
    await H.sleep(500);
    const e6b = await engine(sel);
    const since6 = (await H.bridgeSince(page, b6)).map((m) => m.type || "result");
    out.M6 = { margin: mp, menu: e6, after: e6b, gold: [g6, await shownGold("main")], since: [...new Set(since6)] };
    run.check("M-6 點戰場留邊（直向時上下留邊）關閉部署選單：Godot 沒有收到點擊、沒有部署（塔數不變）、沒有切關（battle_id 相同）、金幣不變；倍率由 0.1 回到 2",
      !!mp && e6.ts === 0.1 && e6b.ts === 2 && e6b.pref === 2 && e6b.menu === 0 && e6b.bid === e1.bid && e6b.towers === e6.towers && out.M6.gold[0] === out.M6.gold[1] && !since6.includes("click_cell") && !since6.includes("show_upgrade_panel") && !since6.includes("result"), out.M6);

    // M-7：橫向轉向（740×375）：場次、2× 不變，沒有重新載入；按鈕仍看得到點得到；左右留邊同樣能關閉部署選單；轉回直向
    const ready0 = await gameReadyCount();
    await page.setViewportSize({ width: 740, height: 375 });
    await H.sleep(700);
    const lay7 = await layout(sel);
    const ui7 = await speedUI();
    const e7 = await engine(sel);
    await openMenu(sel, 6, 4);
    const mp7 = await marginPoint(sel);
    out.M7_shot = await H.shot(page, "r19-m7-landscape-menu");
    const b7 = await H.bridgeLen(page);
    if (mp7) await page.mouse.click(mp7.x, mp7.y);
    await menuGone();
    await waitSlowEnd(b7);
    const e7b = await engine(sel);
    await page.setViewportSize({ width: 375, height: 740 });
    await H.sleep(700);
    const e7c = await engine(sel);
    out.M7 = { layout: lay7, ui: ui7, engine: e7, margin: mp7, afterMargin: e7b, back: e7c, ready: [ready0, await gameReadyCount()] };
    run.check("M-7 轉成橫向 740×375：完整戰場、頁面沒有捲動；battle_id 與 2× 不變、沒有新的 game_ready；1×／2× 看得到點得到；左右留邊點了關閉部署選單、倍率回到 2；轉回直向仍是同一場 2×",
      layoutOk(lay7) && uiOk(ui7) && ui7.shown === 2 && e7.bid === e1.bid && e7.ts === 2 && !!mp7 && (mp7.side === "left" || mp7.side === "right") && e7b.ts === 2 && e7b.menu === 0 && e7c.bid === e1.bid && e7c.ts === 2 && out.M7.ready[0] === out.M7.ready[1], out.M7);

    // M-8：開戰後保留 2×（戰鬥中仍可切換）；再按 1× → 1、按 2× → 2
    const b8 = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    const st8 = await H.waitBridge(page, b8, { type: "update_stats", game_state: 2 }, 15000);
    await H.sleep(300);
    const e8 = await engine(sel);
    const ui8 = await speedUI();
    const c8a = await clickSpeed(1);
    const e8a = await engine(sel);
    const c8b = await clickSpeed(2);
    const e8b = await engine(sel);
    out.M8 = { stats: { speed: st8.speed, ts: st8.time_scale }, engine: e8, ui: ui8, x1: e8a, x2: e8b };
    run.check("M-8 迎戰後仍是 2×（戰鬥中的 stats 與快照都是 2）；戰鬥中可以切換：1× → 倍率 1、2× → 倍率 2",
      st8.speed === 2 && st8.time_scale === 2 && e8.state === 2 && e8.ts === 2 && ui8.shown === 2 && uiOk(ui8) && c8a.reply.ok === true && e8a.ts === 1 && c8b.reply.ok === true && e8b.ts === 2, out.M8);

    // M-9：戰鬥中 2× 並開著部署選單時切換關卡（HUD 在選單上方）：部署選單關閉；新的一場是 1×（Godot 與畫面）；舊的一場的關閉命令不影響新場次
    await openMenu(sel, 5, 4);
    const e9 = await engine(sel);
    const b9 = await H.selectStage(page, "Mock T 塔目標");
    // 不點開場畫面（點遊戲畫面中央可能打開新的部署選單），直接看選單是否已關閉
    await H.sleep(500);
    const menuLeft = await page.locator('div[class*="placementOverlay"]').count();
    const e9b = await engine(sel);
    const ui9 = await speedUI();
    const since9 = await H.bridgeSince(page, b9);
    const newStats = since9.filter((m) => m.type === "update_stats" && m.battle_id === e9b.bid);
    out.M9 = { before: e9, after: e9b, ui: ui9, menuLeft, newStats: newStats.map((m) => ({ speed: m.speed, ts: m.time_scale, slow: m.deploy_slow })), shot: await H.shot(page, "r19-m9-new-stage") };
    run.check("M-9 戰鬥中 2× 並開著部署選單時切換關卡：選單關閉；新的一場（新 battle_id）Godot 是 1 倍、沒有開著的選單，畫面亮 1×；新場次的 stats 全部是 1 倍、沒有慢速",
      e9.ts === 0.1 && e9.pref === 2 && e9b.bid !== e9.bid && e9b.state === 1 && e9b.ts === 1 && e9b.pref === 1 && e9b.menu === 0 && menuLeft === 0 && ui9 && ui9.shown === 1 && newStats.length > 0 && newStats.every((m) => m.speed === 1 && m.time_scale === 1 && m.deploy_slow === false), out.M9);

    // M-10：速度不寫進存檔：這段期間沒有寫入，session 沒有速度欄位
    const writes = await writesSince(n0);
    const sess = await page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
    out.M10 = { writes, sessionHasSpeed: /time_scale|speed_pref|game_speed|deploy_slow/.test(sess) };
    run.check("M-10 戰鬥速度不寫進存檔：這段期間沒有寫入請求，session 沒有速度相關欄位", writes === 0 && !out.M10.sessionHasSpeed, out.M10);
  });

  // ── B. 獨立戰鬥頁 ──
  await section("B", async () => {
    const sel = await openPage("battle", { width: 375, height: 740 });
    const e0 = await engine(sel);
    const ui0 = await speedUI();
    const other0 = await otherButtons("battle");
    out.B1 = { engine: e0, ui: ui0, other: other0, shot: await H.shot(page, "r19-b1-topbar-375") };
    run.check("B-1 獨立戰鬥頁 375×740：新的一場 1 倍、頂欄 1× 亮起；1×／2× 與返回、自動、迎戰、金幣都看得到、點得到",
      e0.pref === 1 && e0.ts === 1 && ui0 && ui0.shown === 1 && uiOk(ui0) && other0.buttons.length === 3 && other0.buttons.every((b) => b.ok) && other0.gold, out.B1);
    // B-1b：320×640 的頂欄
    await page.setViewportSize({ width: 320, height: 640 });
    await H.sleep(700);
    const ui0b = await speedUI();
    const other0b = await otherButtons("battle");
    const lay0b = await layout(sel);
    out.B1b = { ui: ui0b, other: other0b, layout: lay0b, shot: await H.shot(page, "r19-b1b-topbar-320") };
    await page.setViewportSize({ width: 375, height: 740 });
    await H.sleep(700);
    run.check("B-1b 獨立戰鬥頁 320×640：頂欄的 1×／2× 與返回、自動、迎戰、金幣都看得到、點得到，完整戰場、沒有捲動",
      uiOk(ui0b) && ui0b.shown === 1 && other0b.buttons.length === 3 && other0b.buttons.every((b) => b.ok) && other0b.gold && layoutOk(lay0b), out.B1b);

    // B-2：2× → 部署 0.1 → 取消回 2
    const c2 = await clickSpeed(2);
    await openMenu(sel, 2, 4);
    const e2 = await engine(sel);
    const ui2 = await speedUI();
    out.B2_shot = await H.shot(page, "r19-b2-deploy-slow");
    const b2 = await H.bridgeLen(page);
    await page.locator('[data-testid="placement-menu"] button[class*="closeBtn"]').click();
    await menuGone();
    await waitSlowEnd(b2);
    const e2b = await engine(sel);
    out.B2 = { reply: c2.reply, menu: e2, ui: ui2, after: e2b };
    run.check("B-2 頂欄按 2×（Godot 確認）；開部署選單倍率 0.1（不是 0.2）、2× 亮著並提示慢速；取消後回到 2",
      c2.reply.ok === true && e2.ts === 0.1 && e2.pref === 2 && ui2.shown === 2 && ui2.hint === "部署中暫時慢速" && e2b.ts === 2 && e2b.menu === 0, out.B2);

    // B-3：選單開著時按頂欄 1× → 選擇 1、倍率 0.1；點戰場留邊關閉 → 1；沒有部署、沒有切關
    await openMenu(sel, 3, 4);
    const ui3a = await speedUI();
    const c3 = await clickSpeed(1);
    const e3 = await engine(sel);
    const mp = await marginPoint(sel);
    const b3 = await H.bridgeLen(page);
    await page.mouse.click(mp.x, mp.y);
    await menuGone();
    await waitSlowEnd(b3);
    const e3b = await engine(sel);
    const since3 = (await H.bridgeSince(page, b3)).map((m) => m.type || "result");
    out.B3 = { uiBefore: ui3a, reply: c3.reply, menu: e3, margin: mp, after: e3b, since: [...new Set(since3)] };
    run.check("B-3 選單開著時按頂欄 1×：倍率仍 0.1、選擇 1；點戰場留邊關閉：Godot 沒有收到點擊、沒有部署、同一場，倍率 1",
      uiOk(ui3a) && c3.reply.ok === true && e3.ts === 0.1 && e3.pref === 1 && !!mp && e3b.ts === 1 && e3b.menu === 0 && e3b.bid === e0.bid && e3b.towers === e3.towers && !since3.includes("click_cell"), out.B3);

    // B-4：2× 後轉向 740×375：同一場、2× 不變、沒有重新載入；頂欄按鈕仍點得到；轉回直向
    await clickSpeed(2);
    const ready0 = await gameReadyCount();
    await page.setViewportSize({ width: 740, height: 375 });
    await H.sleep(700);
    const lay4 = await layout(sel);
    const ui4 = await speedUI();
    const other4 = await otherButtons("battle");
    const e4 = await engine(sel);
    out.B4_shot = await H.shot(page, "r19-b4-landscape");
    await page.setViewportSize({ width: 375, height: 740 });
    await H.sleep(700);
    const e4b = await engine(sel);
    out.B4 = { layout: lay4, ui: ui4, other: other4, engine: e4, back: e4b, ready: [ready0, await gameReadyCount()] };
    run.check("B-4 獨立戰鬥頁 2× 後轉成 740×375：完整戰場、沒有捲動；同一場、倍率 2、沒有新的 game_ready；1×／2× 與返回、自動、迎戰都點得到；轉回直向仍是同一場 2×",
      layoutOk(lay4) && uiOk(ui4) && ui4.shown === 2 && other4.buttons.every((b) => b.ok) && other4.buttons.length === 3 && e4.bid === e0.bid && e4.ts === 2 && e4b.bid === e0.bid && e4b.ts === 2 && out.B4.ready[0] === out.B4.ready[1], out.B4);
    await page.setViewportSize({ width: 540, height: 900 });
  });

  // ── V. 舊版遊戲（協定 4）：顯示更新提示，不送關卡資料 ──
  await section("V", async () => {
    // 只攔網站入口的遊戲目錄（H.GAME_DIR，gameRelease.json）
    const GAME_FILE = new RegExp(H.GAME_DIR.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "(index\\.(?:html|pck|service\\.worker\\.js))(?:\\?[^#]*)?$");
    const hits = [];
    const route = async (rt) => {
      const name = (rt.request().url().match(GAME_FILE) || [])[1];
      if (!name) return rt.fallback();
      hits.push(name);
      const res = await rt.fetch();
      const headers = { ...res.headers() };
      for (const h of ["content-length", "etag", "last-modified", "content-encoding"]) delete headers[h];
      return rt.fulfill({ status: 200, headers, path: `${PROTO4}/${name}` });
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
      const toggle = await page.locator('[data-testid="speed-toggle"]').count();
      out.V = { hits: [...new Set(hits)], protocol: ready.protocol ?? null, prompt, stage: snap.stage, state: snap.game_state, toggle, shot: await H.shot(page, "r19-v-proto4-prompt") };
      run.check("V-1 舊版遊戲（加入戰鬥速度之前的產物，協定 4）：顯示「遊戲版本需要更新」，沒有送出關卡資料、沒有速度按鈕（速度命令不會對舊遊戲默默失效）",
        out.V.hits.includes("index.pck") && out.V.protocol === 4 && /遊戲版本需要更新/.test(prompt) && snap.stage === "" && snap.game_state === 0 && toggle === 0, out.V);
    } finally {
      await page.context().unroute(GAME_FILE, route);
      await H.resetOrigin(page, { keepMockDb: true });
    }
  });

  return run.finish({ out });
}
