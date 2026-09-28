async (page) => {
  // R18（瀏覽器）：D22 戰場適應視窗、備戰拆除防禦塔
  // D. 主頁與獨立戰鬥頁 × 1280×800、375×740、320×640、740×360（橫向短高度）：遊戲畫面完整在視窗內、固定 540:720、
  //    在戰場區域裡放到最大、頁面沒有捲動；獨立戰鬥頁的頂欄按鈕看得到、點得到。實際點地圖左右兩端的格子 (1,4)、(12,4)：
  //    Godot 回報同一格、部署選單在可見範圍內（放不下時捲動，每一項都點得到）、放下的塔就在那一格、點同一點打開的是這座塔的面板
  // R. 開著選取面板與部署選單時縮放／轉向（主頁與獨立戰鬥頁）：面板跟著重新定位、仍在可見範圍內；battle_id、城池血量、
  //    塔的目標模式不變，遊戲沒有重新載入；部署選單的子彈時間在關閉後恢復；轉向後點地圖右端仍對應同一格
  // S. 主頁（375 寬）用真實按鈕拆塔：確認／取消、畫面金幣只在 Godot 回報後改變、原格重建是新的塔、升級後與文士的返還（100、77）、
  //    確認期間升級要重新確認、重複命令只退一次、確認期間開戰不能拆、戰鬥中顯示「備戰時可拆除」；沒有寫入、不新增存檔欄位
  // B. 獨立戰鬥頁（375 寬）：確認期間轉向、確認拆除、頂欄金幣、原格重建；戰鬥中不能拆
  // V. 舊版遊戲（協定 3，Round 17 的產物）：顯示版本需要更新、不送關卡資料
  // 全部 mock、虛構金鑰 test_r18_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const A = "test_r18_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const WRITES = ["save_profile", "upgrade_hero", "save_result", "create_profile"];
  const PROTO3 = ".handoff/evidence/round-18/proto3-godot";

  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const logLen = async () => (await H.gasLog(page)).length;
  const writesSince = async (n) => (await H.gasLog(page)).slice(n).filter((e) => WRITES.includes(e.action)).length;
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r18-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await page.keyboard.press("Escape"); } catch { /* 沒有視窗可關 */ }
    }
  };
  const snapshot = async (sel) => {
    const id = "r18-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const post = (sel, msg) => page.evaluate(([sel, msg]) => document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, ...msg }, "*"), [sel, msg]);
  const rectOf = (sel) => page.evaluate((sel) => {
    const b = document.querySelector(sel).getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  }, sel);
  // 格子在畫面上的位置：和 H.clickCell 同一套換算（14×11 格、縮放比例 min(寬/540, 高/720)），可以指定哪個 iframe
  const cellPoint = async (sel, c, row, cols = 14, rows = 11) => {
    const r = await rectOf(sel);
    const s = Math.min(r.width / 540, r.height / 720);
    const vx = r.width / s, vy = r.height / s;
    const tile = Math.max(16, Math.floor(Math.min(vx / cols, vy / rows)));
    const ox = (vx - cols * tile) / 2, oy = (vy - rows * tile) / 2;
    return { x: r.left + (ox + (c + 0.5) * tile) * s, y: r.top + (oy + (row + 0.5) * tile) * s };
  };
  const clickAt = async (sel, c, row) => {
    const p = await cellPoint(sel, c, row);
    const vp = page.viewportSize();
    if (p.x < 0 || p.y < 0 || (vp && (p.x > vp.width || p.y > vp.height))) throw new Error(`格子 (${c},${row}) 在畫面外（${Math.round(p.x)}, ${Math.round(p.y)}）`);
    await page.mouse.click(p.x, p.y);
    return p;
  };
  // 點空格：等 Godot 的 click_cell 與部署選單
  const openMenu = async (sel, c, row) => {
    const b0 = await H.bridgeLen(page);
    await clickAt(sel, c, row);
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
  const build = async (sel, c, row, name = "弓兵塔") => {
    await openMenu(sel, c, row);
    await page.locator('[data-testid="placement-menu"]').getByRole("button", { name: new RegExp(name) }).click();
    await menuGone();
    await H.sleep(400);
  };
  // 點有塔的格子：等 Godot 的面板資料與網頁面板
  const openPanel = async (sel, c, row) => {
    const b0 = await H.bridgeLen(page);
    await clickAt(sel, c, row);
    const pm = await H.waitBridge(page, b0, { type: "show_upgrade_panel" }, 15000);
    await page.waitForSelector('[data-testid="unit-panel"]', { timeout: 10000 });
    await H.sleep(300);
    return pm;
  };
  const closePanel = async () => {
    if ((await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').count()) === 0) return;
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').first().click();
    await page.waitForSelector('[data-testid="unit-panel"]', { state: "detached", timeout: 10000 }).catch(() => {});
    await H.sleep(200);
  };
  const towerAt = (snap, c, row) => Object.entries(snap.tower_targets || {}).find(([, t]) => t.cell && t.cell[0] === c && t.cell[1] === row);
  // 版面：遊戲畫面、戰場區域、頁面捲動、獨立戰鬥頁頂欄的按鈕
  const layout = (sel) =>
    page.evaluate((sel) => {
      const rr = (b) => ({ l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width * 10) / 10, h: Math.round(b.height * 10) / 10 });
      const f = document.querySelector(sel).getBoundingClientRect();
      const st = document.querySelector("[data-game-stage]").getBoundingClientRect();
      const btns = [...document.querySelectorAll('div[class*="battleTopBar"] button')].filter((b) => /迎戰|戰鬥中|自動/.test(b.innerText)).map((b) => {
        const x = b.getBoundingClientRect();
        const top = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
        return { text: b.innerText.trim().replace(/\s+/g, " "), inView: x.left >= 0 && x.top >= 0 && x.right <= innerWidth && x.bottom <= innerHeight, hit: !!top && (b === top || b.contains(top)) };
      });
      return {
        vw: innerWidth, vh: innerHeight,
        sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight,
        iframe: rr(f), stage: rr(st), btns,
        inView: f.left >= -0.5 && f.top >= -0.5 && f.right <= innerWidth + 0.5 && f.bottom <= innerHeight + 0.5,
        ratio: Math.abs(f.width * 4 - f.height * 3),
        fill: Math.min(Math.abs(f.width - Math.min(st.width, innerWidth)), Math.abs(f.height - Math.min(st.height, innerHeight - Math.max(0, st.top)))),
      };
    }, sel);
  const layoutOk = (l, kind) =>
    l.inView && l.ratio <= 4 && l.fill <= 1.5 && l.sw <= l.vw && l.sh <= l.vh &&
    (kind === "main" || (l.btns.length >= 2 && l.btns.every((b) => b.inView && b.hit)));
  // 面板或選單：本身在「戰場區域與視窗」的交集內；每一項捲到看得到後，完整在可見範圍、中心點得到自己
  const reach = (kind) =>
    page.evaluate((kind) => {
      const root = document.querySelector(kind === "menu" ? '[data-testid="placement-menu"]' : '[data-testid="unit-panel"]');
      if (!root) return { missing: true, items: [] };
      const st = document.querySelector("[data-game-stage]").getBoundingClientRect();
      const vis = { l: Math.max(0, st.left), t: Math.max(0, st.top), r: Math.min(innerWidth, st.right), b: Math.min(innerHeight, st.bottom) };
      const r = root.getBoundingClientRect();
      const inside = r.left >= vis.l - 0.5 && r.top >= vis.t - 0.5 && r.right <= vis.r + 0.5 && r.bottom <= vis.b + 0.5;
      const sels = kind === "menu"
        ? ['[class*="closeBtn"]', '[class*="tabBtn"]', '[class*="menuCard"]']
        : ['[class*="closeBtn"]', '[class*="upgStatItem"]', 'button[data-testid^="tower-target-"]', 'button[class*="upgradeBtn"]', '[data-testid="tower-sell"]', '[data-testid="tower-sell-ok"]', '[data-testid="tower-sell-cancel"]'];
      const scroller = root.querySelector(kind === "menu" ? '[class*="placementContent"]' : '[class*="upgradeBody"]');
      const scrolls = !!scroller && scroller.scrollHeight > scroller.clientHeight + 1;
      const items = [];
      for (const s of sels) {
        for (const el of root.querySelectorAll(s)) {
          el.scrollIntoView({ block: "nearest", inline: "nearest" });
          const b = el.getBoundingClientRect();
          const top = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          items.push({
            name: (el.getAttribute("data-testid") || el.innerText || s).replace(/\s+/g, " ").slice(0, 14),
            inView: b.left >= vis.l - 0.5 && b.top >= vis.t - 0.5 && b.right <= vis.r + 0.5 && b.bottom <= vis.b + 0.5,
            hit: !!top && (el === top || el.contains(top)),
          });
        }
      }
      if (scroller) scroller.scrollTop = 0;
      return { rect: { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }, vis, inside, scrolls, items };
    }, kind);
  const reachOk = (x) => !x.missing && x.inside && x.items.length > 0 && x.items.every((i) => i.hit && i.inView);
  const reachBrief = (x) => ({ rect: x.rect, inside: x.inside, scrolls: x.scrolls, n: x.items.length, bad: x.items.filter((i) => !(i.hit && i.inView)) });
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
  // 畫面上顯示的戰鬥金幣（主頁 HUD、獨立戰鬥頁頂欄）與 Godot 最後一次 update_stats 的金幣
  const shownGold = (kind) =>
    page.evaluate((kind) => {
      const el = kind === "main" ? document.querySelector('[class*="hudRight"] [class*="hudStat"]') : document.querySelector('[class*="statsRow"] [class*="statValue"]');
      return el ? Number((el.innerText || "").replace(/[^0-9]/g, "")) : NaN;
    }, kind);
  const waitShownGold = (kind, v) =>
    page.waitForFunction(([kind, v]) => {
      const el = kind === "main" ? document.querySelector('[class*="hudRight"] [class*="hudStat"]') : document.querySelector('[class*="statsRow"] [class*="statValue"]');
      return !!el && Number((el.innerText || "").replace(/[^0-9]/g, "")) === v;
    }, [kind, v], { timeout: 10000, polling: 100 }).then(() => true).catch(() => false);
  const upgradeBtn = () => page.locator('[data-testid="unit-panel"] button', { hasText: /^升級/ });
  const upgradeUI = async () => {
    const b0 = await H.bridgeLen(page);
    await upgradeBtn().click();
    const pm = await H.waitBridge(page, b0, { type: "show_upgrade_panel" }, 15000);
    await page.waitForSelector('[data-testid="unit-panel"]');
    await H.sleep(300);
    return pm;
  };
  // 用面板的按鈕拆除：拆除 → 確認拆除，等 Godot 的回覆與面板關閉
  const sellUI = async () => {
    await page.locator('[data-testid="tower-sell"]').click();
    await page.waitForSelector('[data-testid="tower-sell-confirm"]', { timeout: 5000 });
    const text = (await page.locator('[data-testid="tower-sell-confirm"]').innerText()).replace(/\s+/g, " ");
    const b0 = await H.bridgeLen(page);
    await page.locator('[data-testid="tower-sell-ok"]').click();
    const reply = await H.waitBridge(page, b0, { type: "tower_sell_result" }, 15000);
    await page.waitForSelector('[data-testid="unit-panel"]', { state: "detached", timeout: 10000 }).catch(() => {});
    await H.sleep(300);
    return { text, reply };
  };
  const sellText = () => page.locator('[data-testid="tower-sell"]').innerText().then((t) => t.replace(/\s+/g, " "));

  // ── 前置：玩家進度 chapter1_10（Mock T 塔目標解鎖） ──
  const profile = { nickname: "R18 玩家", level: 1, exp: 0, gold: 5000, capacity: 11, max_stage: "chapter1_10", heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }] };
  await section("setup", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", { profiles: { [A]: profile }, battle_logs: [] });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), A);
  });

  // ── D. 版面與地圖兩端 ──
  const VIEWPORTS = [
    { name: "desktop", vp: { width: 1280, height: 800 } },
    { name: "375", vp: { width: 375, height: 740 } },
    { name: "320", vp: { width: 320, height: 640 } },
    { name: "landscape", vp: { width: 740, height: 360 } },
  ];
  out.D = {};
  let di = 0;
  for (const kind of ["main", "battle"]) {
    for (const v of VIEWPORTS) {
      const label = `${kind}-${v.name}`;
      di += 1;
      const idx = di;
      await section(`D-${label}`, async () => {
        const sel = await openPage(kind, v.vp);
        const lay = await layout(sel);
        const ends = {};
        for (const [end, c] of [["left", [1, 4]], ["right", [12, 4]]]) {
          const msg = await openMenu(sel, c[0], c[1]);
          const menu = await reach("menu");
          if (end === "right") out.D[label + "_menuShot"] = await H.shot(page, `r18-d-${label}-menu`);
          await page.locator('[data-testid="placement-menu"]').getByRole("button", { name: /弓兵塔/ }).click();
          await menuGone();
          await H.sleep(400);
          const snap = await snapshot(sel);
          const tw = towerAt(snap, c[0], c[1]);
          const pm = await openPanel(sel, c[0], c[1]);
          const panel = await reach("panel");
          if (end === "right") out.D[label + "_panelShot"] = await H.shot(page, `r18-d-${label}-panel`);
          await closePanel();
          ends[end] = { cell: [msg.cell_x, msg.cell_y], menu: reachBrief(menu), menuOk: reachOk(menu), tower: tw ? tw[0] : null, panelUid: pm.tower_uid, panel: reachBrief(panel), panelOk: reachOk(panel) };
        }
        out.D[label] = { layout: lay, ends };
        const endsOk = ["left", "right"].every((e) => {
          const x = ends[e];
          const c = e === "left" ? [1, 4] : [12, 4];
          return x.cell[0] === c[0] && x.cell[1] === c[1] && x.menuOk && !!x.tower && x.panelUid === x.tower && x.panelOk;
        });
        run.check(`D-${idx} ${kind === "main" ? "主頁" : "獨立戰鬥頁"} ${v.vp.width}×${v.vp.height}：遊戲畫面完整在視窗內、固定 540:720、在戰場區域裡放到最大、頁面沒有捲動${kind === "battle" ? "、頂欄的自動與迎戰看得到點得到" : ""}；點 (1,4)、(12,4) Godot 回報同一格，部署選單與塔的面板在可見範圍內、每一項點得到，放下的塔在那一格、點同一點打開的是這座塔`,
          layoutOk(lay, kind) && endsOk, out.D[label]);
      });
    }
  }

  // ── R. 開著面板與部署選單時縮放／轉向 ──
  const ROTATE = [{ width: 740, height: 375 }, { width: 375, height: 740 }, { width: 320, height: 640 }, { width: 1280, height: 800 }, { width: 375, height: 740 }];
  for (const kind of ["main", "battle"]) {
    await section(`R-${kind}`, async () => {
      const sel = await openPage(kind, { width: 375, height: 740 });
      await build(sel, 6, 4);
      const pm = await openPanel(sel, 6, 4);
      const b1 = await H.bridgeLen(page);
      await page.locator('[data-testid="tower-target-weakest"]').click();
      await H.waitBridge(page, b1, { type: "tower_target_changed" }, 15000);
      // 開戰：縮放時敵人正在前進
      if (kind === "main") await H.clickButton(page, "迎戰");
      else await page.locator("button", { hasText: /^迎戰$/ }).click();
      await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 2), null, { timeout: 15000 });
      await page.evaluate((sel) => { document.querySelector(sel).dataset.r18Mark = "kept"; }, sel);
      const ready0 = await page.evaluate(() => (window.__bridgeLog || []).filter((m) => m.type === "game_ready").length);
      const s0 = await snapshot(sel);
      const steps = [];
      for (const vp of ROTATE) {
        await page.setViewportSize(vp);
        await H.sleep(600);
        const x = await reach("panel");
        const s = await snapshot(sel);
        const t = s.tower_targets[pm.tower_uid];
        const fr = await rectOf(sel);
        const k = Math.min(fr.width / 540, fr.height / 720);
        const tx = fr.left + t.screen.x * k;
        steps.push({ vp: `${vp.width}x${vp.height}`, panel: reachBrief(x), ok: reachOk(x), towerX: Math.round(tx), covers: x.rect.l - 1 <= tx && tx <= x.rect.r + 1 });
      }
      out[`R_${kind}_shot`] = await H.shot(page, `r18-r-${kind}-panel`);
      const s1 = await snapshot(sel);
      const ready1 = await page.evaluate(() => (window.__bridgeLog || []).filter((m) => m.type === "game_ready").length);
      const mark = await page.evaluate((sel) => document.querySelector(sel).dataset.r18Mark || null, sel);
      const pressed = await page.locator('[data-testid="tower-target-weakest"]').getAttribute("aria-pressed");
      await closePanel();
      // 部署選單開著時轉向：子彈時間 0.1；轉向後選單仍在可見範圍內；關閉後恢復 1
      await openMenu(sel, 8, 4);
      const tsMenu = (await snapshot(sel)).time_scale;
      await page.setViewportSize({ width: 740, height: 375 });
      await H.sleep(600);
      const menuRot = await reach("menu");
      out[`R_${kind}_menuShot`] = await H.shot(page, `r18-r-${kind}-menu-landscape`);
      await closeMenuIfOpen();
      await H.sleep(300);
      const tsAfter = (await snapshot(sel)).time_scale;
      // 轉向後點地圖右端：仍是同一格
      const msg = await openMenu(sel, 12, 4);
      await page.locator('[data-testid="placement-menu"]').getByRole("button", { name: /弓兵塔/ }).click();
      await menuGone();
      await H.sleep(400);
      const s2 = await snapshot(sel);
      out[`R_${kind}`] = {
        steps, battle: [s0.battle_id, s1.battle_id], hp: [s0.hp, s1.hp], wave: [s0.wave, s1.wave], state: [s0.game_state, s1.game_state],
        mode: s1.tower_targets[pm.tower_uid] && s1.tower_targets[pm.tower_uid].mode, ready: [ready0, ready1], mark, pressed,
        tsMenu, menuRot: reachBrief(menuRot), tsAfter, rightCell: [msg.cell_x, msg.cell_y], rightTower: !!towerAt(s2, 12, 4),
      };
      const x = out[`R_${kind}`];
      run.check(`R-${kind === "main" ? 1 : 2} ${kind === "main" ? "主頁" : "獨立戰鬥頁"}：戰鬥中開著塔的面板，375×740 → 740×375 → 320×640 → 1280×800 → 375×740，每一次面板都重新定位在可見範圍內（每一項點得到、塔在面板的水平範圍內）；battle_id、城池血量、波次、戰鬥狀態、塔的「血量最少」都不變，沒有新的 game_ready、iframe 沒有重建`,
        steps.every((st) => st.ok && st.covers) && s0.battle_id === s1.battle_id && s0.hp === s1.hp && s0.wave === s1.wave && s1.game_state === 2 && x.mode === "weakest" && pressed === "true" && ready1 === ready0 && mark === "kept", x);
      run.check(`R-${kind === "main" ? 3 : 4} ${kind === "main" ? "主頁" : "獨立戰鬥頁"}：部署選單開著（子彈時間 0.1）時轉向，選單在可見範圍內、每一項點得到；關閉後時間倍率回到 1；轉向後點 (12,4) Godot 回報同一格、塔放在那一格`,
        tsMenu < 0.2 && reachOk(menuRot) && tsAfter === 1 && x.rightCell[0] === 12 && x.rightCell[1] === 4 && x.rightTower, x);
    });
  }

  // ── S. 主頁拆塔（375 寬，真實按鈕） ──
  await section("S", async () => {
    const sel = await openPage("main", { width: 375, height: 740 });
    const n0 = await logLen();
    const g0 = await shownGold("main");
    // S-1：建造弓兵 → 面板顯示返還 25
    await build(sel, 1, 4);
    const g1 = await shownGold("main");
    const p1 = await openPanel(sel, 1, 4);
    const t1 = await sellText();
    const dis1 = await page.locator('[data-testid="tower-sell"]').isDisabled();
    out.S1 = { g0, g1, refund: p1.sell_refund, invested: p1.invested_gold, text: t1, disabled: dis1, shot: await H.shot(page, "r18-s1-panel") };
    run.check("S-1 主頁建造弓兵（金幣 5000→4950）：面板有「拆除（返還 💰25）」、可以按（Godot 帶來投入 50、返還 25）",
      g0 === 5000 && g1 === 4950 && p1.sell_refund === 25 && p1.invested_gold === 50 && /拆除（返還 💰25）/.test(t1) && !dis1, out.S1);

    // S-2：確認後取消：不送命令、金幣與塔不變
    const b2 = await H.bridgeLen(page);
    await page.locator('[data-testid="tower-sell"]').click();
    await page.waitForSelector('[data-testid="tower-sell-confirm"]');
    const confirmText = (await page.locator('[data-testid="tower-sell-confirm"]').innerText()).replace(/\s+/g, " ");
    const confirmReach = await reach("panel");
    out.S2_shot = await H.shot(page, "r18-s2-confirm");
    await page.locator('[data-testid="tower-sell-cancel"]').click();
    await H.sleep(800);
    const s2 = await snapshot(sel);
    const sent2 = (await H.bridgeSince(page, b2)).filter((m) => m.type === "tower_sell_result").length;
    out.S2 = { confirmText, confirmReach: reachBrief(confirmReach), back: await page.locator('[data-testid="tower-sell"]').count(), gold: await shownGold("main"), towers: Object.keys(s2.tower_targets).length, replies: sent2 };
    run.check("S-2 按「拆除」先顯示確認（返還 💰25、已投入 💰50，按鈕點得到）；按「取消」回到面板，沒有送出命令，金幣仍是 4950、塔還在",
      /返還 💰25/.test(confirmText) && /已投入 💰50/.test(confirmText) && reachOk(confirmReach) && out.S2.back === 1 && out.S2.gold === 4950 && out.S2.towers === 1 && sent2 === 0, out.S2);

    // S-3：確認拆除：Godot 回覆後面板關閉、畫面金幣 4975、塔移除、擊殺與血量不變
    const oldUid = p1.tower_uid;
    const r3 = await sellUI();
    const goldOk3 = await waitShownGold("main", 4975);
    const s3 = await snapshot(sel);
    out.S3 = { reply: r3.reply, goldOk3, towers: s3.tower_targets, kills: s3.kills, hp: s3.hp, panel: await page.locator('[data-testid="unit-panel"]').count() };
    run.check("S-3 確認拆除：Godot 回覆成功（返還 25），面板關閉，畫面金幣 4975（Godot 的 update_stats），塔移除；擊殺 0、城池 20",
      r3.reply.ok === true && r3.reply.refund === 25 && goldOk3 && Object.keys(s3.tower_targets).length === 0 && s3.kills === 0 && s3.hp === 20 && out.S3.panel === 0, out.S3);

    // S-4：原格重建：新的塔（新識別碼、Lv1、first、投入 50）
    await build(sel, 1, 4);
    const s4 = await snapshot(sel);
    const t4 = towerAt(s4, 1, 4);
    out.S4 = { tower: t4, oldUid, gold: await shownGold("main") };
    run.check("S-4 同一格重新建造：新的識別碼、Lv1、優先前方、投入 50、返還 25；金幣 4925",
      !!t4 && t4[0] !== oldUid && t4[1].level === 1 && t4[1].mode === "first" && t4[1].invested === 50 && t4[1].refund === 25 && out.S4.gold === 4925, out.S4);

    // S-5：升到 Lv3（50＋100）→ 返還 100；拆除後金幣 +100
    await openPanel(sel, 1, 4);
    await upgradeUI();
    const p5 = await upgradeUI();
    const t5 = await sellText();
    const g5 = await shownGold("main");
    const r5 = await sellUI();
    const goldOk5 = await waitShownGold("main", g5 + 100);
    out.S5 = { level: p5.level, invested: p5.invested_gold, refund: p5.sell_refund, text: t5, g5, reply: r5.reply, goldOk5 };
    run.check("S-5 弓兵升到 Lv3（共支付 200）：面板「返還 💰100」；拆除後畫面金幣 +100（4775→4875）",
      p5.level === 3 && p5.invested_gold === 200 && p5.sell_refund === 100 && /返還 💰100/.test(t5) && g5 === 4775 && r5.reply.ok === true && r5.reply.refund === 100 && goldOk5, out.S5);

    // S-6：文士 80＋75＝155 → 返還 77
    await build(sel, 2, 4, "文士塔");
    await openPanel(sel, 2, 4);
    const p6 = await upgradeUI();
    const t6 = await sellText();
    const g6 = await shownGold("main");
    const r6 = await sellUI();
    const goldOk6 = await waitShownGold("main", g6 + 77);
    out.S6 = { invested: p6.invested_gold, refund: p6.sell_refund, text: t6, g6, reply: r6.reply, goldOk6 };
    run.check("S-6 文士塔建造 80＋升級 75：面板「返還 💰77」（向下取整）；拆除後畫面金幣 +77",
      p6.invested_gold === 155 && p6.sell_refund === 77 && /返還 💰77/.test(t6) && r6.reply.ok === true && r6.reply.refund === 77 && goldOk6, out.S6);

    // S-7：確認期間升級（遊戲送來的升級命令）：確認畫面關閉、改顯示返還 50；拿舊金額 25 的命令不拆；確認新金額才拆
    await build(sel, 3, 4);
    const p7 = await openPanel(sel, 3, 4);
    await page.locator('[data-testid="tower-sell"]').click();
    await page.waitForSelector('[data-testid="tower-sell-confirm"]');
    const b7 = await H.bridgeLen(page);
    await post(sel, { type: "request_upgrade" });
    await H.waitBridge(page, b7, { type: "show_upgrade_panel" }, 15000);
    await H.sleep(600);
    // 應該回到面板（確認畫面關閉）；如果確認畫面還在，記下它的文字並取消，後面的步驟照常進行
    const confirm7 = await page.locator('[data-testid="tower-sell-confirm"]').count();
    const t7 = confirm7 === 0 ? await sellText() : (await page.locator('[data-testid="tower-sell-confirm"]').innerText()).replace(/\s+/g, " ");
    if (confirm7 > 0) await page.locator('[data-testid="tower-sell-cancel"]').click();
    const g7 = await shownGold("main");
    const b7b = await H.bridgeLen(page);
    await post(sel, { type: "sell_tower", battle_id: p7.battle_id, tower_uid: p7.tower_uid, expected_refund: 25 });
    const r7a = await H.waitBridge(page, b7b, { type: "tower_sell_result" }, 15000);
    await H.sleep(500);
    const s7 = await snapshot(sel);
    const kept7 = !!s7.tower_targets[p7.tower_uid] && (await shownGold("main")) === g7;
    const r7b = await sellUI();
    const goldOk7 = await waitShownGold("main", g7 + 50);
    out.S7 = { text: t7, confirm7, r7a, kept7, r7b: r7b.reply, goldOk7 };
    run.check("S-7 確認期間升級：確認畫面關閉、面板改成「返還 💰50」（要重新確認）；拿舊金額 25 的命令 refund_changed、塔與金幣不變；重新確認後返還 50",
      /返還 💰50/.test(t7) && confirm7 === 0 && r7a.ok === false && r7a.reason === "refund_changed" && r7a.refund === 50 && kept7 && r7b.reply.ok === true && r7b.reply.refund === 50 && goldOk7, out.S7);

    // S-8：重複命令：按「確認拆除」的同時再送一次相同的命令，只退一次
    await build(sel, 4, 4);
    const p8 = await openPanel(sel, 4, 4);
    await page.locator('[data-testid="tower-sell"]').click();
    await page.waitForSelector('[data-testid="tower-sell-confirm"]');
    const g8 = await shownGold("main");
    const b8 = await H.bridgeLen(page);
    await page.locator('[data-testid="tower-sell-ok"]').click();
    await post(sel, { type: "sell_tower", battle_id: p8.battle_id, tower_uid: p8.tower_uid, expected_refund: 25 });
    await page.waitForFunction((i) => (window.__bridgeLog || []).slice(i).filter((m) => m.type === "tower_sell_result").length >= 2, b8, { timeout: 15000 });
    await H.sleep(800);
    const replies8 = (await H.bridgeSince(page, b8)).filter((m) => m.type === "tower_sell_result").map((m) => ({ ok: m.ok, reason: m.reason || null, refund: m.refund }));
    const s8 = await snapshot(sel);
    out.S8 = { replies: replies8, gold: [g8, await shownGold("main")], kills: s8.kills };
    run.check("S-8 按「確認拆除」同時再送一次相同的命令：第一個成功、第二個 not_selected；金幣只加一次 25；擊殺仍是 0",
      replies8.length === 2 && replies8[0].ok === true && replies8[1].ok === false && replies8[1].reason === "not_selected" && out.S8.gold[1] === g8 + 25 && s8.kills === 0, out.S8);

    // S-9：確認期間開戰：確認畫面改成「戰鬥已開始」、確認拆除不能按；強送命令 not_prep；關閉重開後按鈕是「備戰時可拆除」
    await build(sel, 5, 4);
    const p9 = await openPanel(sel, 5, 4);
    await page.locator('[data-testid="tower-sell"]').click();
    await page.waitForSelector('[data-testid="tower-sell-confirm"]');
    await H.clickButton(page, "迎戰");
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 2), null, { timeout: 15000 });
    await H.sleep(300);
    const text9 = (await page.locator('[data-testid="tower-sell-confirm"]').innerText()).replace(/\s+/g, " ");
    const okDisabled = await page.locator('[data-testid="tower-sell-ok"]').isDisabled();
    out.S9_shot = await H.shot(page, "r18-s9-battle-confirm");
    const g9 = await shownGold("main");
    const b9 = await H.bridgeLen(page);
    await post(sel, { type: "sell_tower", battle_id: p9.battle_id, tower_uid: p9.tower_uid, expected_refund: 25 });
    const r9 = await H.waitBridge(page, b9, { type: "tower_sell_result" }, 15000);
    // 這座塔的確認畫面收到拒絕：換成原因說明，拆除按鈕是「備戰時可拆除」
    await page.waitForSelector('[data-testid="tower-sell-message"]', { timeout: 5000 });
    const msg9 = await page.locator('[data-testid="tower-sell-message"]').innerText();
    const confirmLeft = await page.locator('[data-testid="tower-sell-confirm"]').count();
    await closePanel();
    await openPanel(sel, 5, 4);
    const t9 = await sellText();
    const dis9 = await page.locator('[data-testid="tower-sell"]').isDisabled();
    const msgAfterReopen = await page.locator('[data-testid="tower-sell-message"]').count();
    out.S9_shot2 = await H.shot(page, "r18-s9-battle-panel");
    const s9 = await snapshot(sel);
    out.S9 = { text9, okDisabled, r9, msg9, confirmLeft, g9, gold: await shownGold("main"), t9, dis9, msgAfterReopen, tower: !!s9.tower_targets[p9.tower_uid] };
    run.check("S-9 確認期間開戰：確認畫面顯示「戰鬥已開始，備戰時才能拆除」、確認拆除不能按；強送的命令 not_prep（回覆 can_sell=false），面板改顯示原因、塔還在、金幣不變；關閉重開後沒有舊訊息、按鈕是「備戰時可拆除」且不能按",
      /戰鬥已開始/.test(text9) && okDisabled && r9.ok === false && r9.reason === "not_prep" && r9.can_sell === false && /戰鬥已開始/.test(msg9) && confirmLeft === 0 && out.S9.gold === g9 && /備戰時可拆除/.test(t9) && dis9 && msgAfterReopen === 0 && out.S9.tower, out.S9);
    await closePanel();

    // S-10：存檔：這段期間沒有寫入，session 沒有拆除相關的欄位
    const writes = await writesSince(n0);
    const sess = await page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
    out.S10 = { writes, sessionHasSell: /invested|sell_refund|tower_sell|refund/.test(sess) };
    run.check("S-10 拆除不寫進存檔：這段期間沒有寫入請求，session 沒有相關欄位", writes === 0 && !out.S10.sessionHasSell, out.S10);
  });

  // ── B. 獨立戰鬥頁拆塔（375 寬，確認期間轉向） ──
  await section("B", async () => {
    const sel = await openPage("battle", { width: 375, height: 740 });
    await build(sel, 6, 4);
    const g0 = await shownGold("battle");
    const p = await openPanel(sel, 6, 4);
    await page.locator('[data-testid="tower-sell"]').click();
    await page.waitForSelector('[data-testid="tower-sell-confirm"]');
    await page.setViewportSize({ width: 740, height: 375 });
    await H.sleep(600);
    const rot = await reach("panel");
    out.B_shot = await H.shot(page, "r18-b-confirm-landscape");
    await page.setViewportSize({ width: 375, height: 740 });
    await H.sleep(600);
    const back = await reach("panel");
    const b0 = await H.bridgeLen(page);
    await page.locator('[data-testid="tower-sell-ok"]').click();
    const reply = await H.waitBridge(page, b0, { type: "tower_sell_result" }, 15000);
    const goldOk = await waitShownGold("battle", g0 + 25);
    const s1 = await snapshot(sel);
    await build(sel, 6, 4);
    const s2 = await snapshot(sel);
    const t2 = towerAt(s2, 6, 4);
    out.B1 = { g0, rot: reachBrief(rot), back: reachBrief(back), reply, goldOk, towersAfterSell: Object.keys(s1.tower_targets).length, rebuilt: t2, oldUid: p.tower_uid };
    run.check("B-1 獨立戰鬥頁：建造後頂欄金幣 4950；確認畫面開著時轉向（740×375 再回 375×740），面板仍在可見範圍內、按鈕點得到；確認拆除後頂欄金幣 4975、塔移除；同一格重建是新的塔",
      g0 === 4950 && reachOk(rot) && reachOk(back) && reply.ok === true && reply.refund === 25 && goldOk && out.B1.towersAfterSell === 0 && !!t2 && t2[0] !== p.tower_uid && t2[1].level === 1, out.B1);
    await page.locator("button", { hasText: /^迎戰$/ }).click();
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 2), null, { timeout: 15000 });
    await openPanel(sel, 6, 4);
    const t = await sellText();
    const dis = await page.locator('[data-testid="tower-sell"]').isDisabled();
    out.B2 = { text: t, disabled: dis, shot: await H.shot(page, "r18-b-battle-panel") };
    run.check("B-2 獨立戰鬥頁戰鬥中：面板的拆除按鈕是「備戰時可拆除」且不能按", /備戰時可拆除/.test(t) && dis, out.B2);
    await closePanel();
    await page.setViewportSize({ width: 540, height: 900 });
  });

  // ── V. 舊版遊戲（協定 3）：顯示更新提示，不送關卡資料 ──
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
      return rt.fulfill({ status: 200, headers, path: `${PROTO3}/${name}` });
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
      out.V = { hits: [...new Set(hits)], protocol: ready.protocol ?? null, prompt, stage: snap.stage, state: snap.game_state, shot: await H.shot(page, "r18-v-proto3-prompt") };
      run.check("V-1 舊版遊戲（Round 17 的產物，協定 3）：顯示「遊戲版本需要更新」，沒有送出關卡資料（拆除命令不會對舊遊戲默默失效）",
        out.V.hits.includes("index.pck") && out.V.protocol === 3 && /遊戲版本需要更新/.test(prompt) && snap.stage === "" && snap.game_state === 0, out.V);
    } finally {
      await page.context().unroute(GAME_FILE, route);
      await H.resetOrigin(page, { keepMockDb: true });
    }
  });

  return run.finish({ out });
}
