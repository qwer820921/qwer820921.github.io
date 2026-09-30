async (page) => {
  // R20（瀏覽器）：手動暫停／繼續（和戰鬥速度、部署慢速的交互）
  // P. 主頁（375×740）：
  //    P-1 新的一場有「暫停」、沒有「已暫停」；375 與 320 寬 HUD 都放得下
  //    P-2 暫停命令沒送到 Godot 時畫面不改（不先改顯示，只改畫面不算暫停）
  //    P-3 備戰中暫停：Godot 確認後顯示「已暫停」與「繼續」、迎戰與自動停用；點空格不開部署選單；直接送開戰、切自動、蓋塔的命令也被 Godot 拒絕
  //    P-4 戰鬥中暫停：Godot 的遊戲時間、敵人位置與血量、出兵數與波次都不變；繼續後下一隻在原本的時間出現（不重新計滿、不立刻補出）
  //    P-5 部署與速度：2× 開部署選單後暫停（選單鎖住、不能部署），暫停中選 1×、關閉選單仍暫停，繼續後 1×；保留選單直接繼續回到 0.1
  //    P-6 暫停中仍可點塔查看面板，升級與改目標停用，直接送的命令也被拒絕
  //    P-7 暫停中 320×640 與 740×375：按鈕與「繼續」看得到點得到、完整戰場
  //    P-8 暫停中切換關卡：新的一場未暫停、1 倍；上一場的繼續命令不能解除新場次的暫停
  //    P-9 自動下一波的等待中暫停：等待凍結，繼續後才開下一波
  //    P-10 暫停不寫進存檔
  // B. 獨立戰鬥頁：頂欄的暫停、備戰中暫停被拒絕的操作、2× 暫停與繼續、橫向
  // V. 舊版遊戲（加入暫停之前，協定 5 或 4）：顯示版本需要更新、沒有暫停按鈕
  // 反向驗證：context.__shenmaEngineDir（run-browser.mjs 的 ENGINE_DIR）有值時，遊戲改由該目錄提供（刻意改壞後匯出的遊戲），不跑 V
  // 全部 mock、虛構金鑰 test_r20_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const A = "test_r20_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const WRITES = ["save_profile", "upgrade_hero", "save_result", "create_profile"];
  // 加入暫停之前的遊戲（協定 5；歷史中沒有協定 5 的提交時用協定 4）：依 README 用 git show 取出到這個目錄（已在 .gitignore）
  const PROTO5 = "scripts/shenma-regression/.legacy/proto5-godot";
  const ENGINE_DIR = page.context().__shenmaEngineDir || "";
  const GAME_FILE = /\/games\/shenmaSanguo\/(index\.(?:html|pck|service\.worker\.js))(?:\?[^#]*)?$/;
  const serveFrom = (dir, hits) => async (rt) => {
    const name = (rt.request().url().match(GAME_FILE) || [])[1];
    if (!name) return rt.fallback();
    if (hits) hits.push(name);
    const res = await rt.fetch();
    const headers = { ...res.headers() };
    for (const h of ["content-length", "etag", "last-modified", "content-encoding"]) delete headers[h];
    return rt.fulfill({ status: 200, headers, path: `${dir}/${name}` });
  };

  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const logLen = async () => (await H.gasLog(page)).length;
  const writesSince = async (n) => (await H.gasLog(page)).slice(n).filter((e) => WRITES.includes(e.action)).length;
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r20-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await page.keyboard.press("Escape"); } catch { /* 沒有視窗可關 */ }
    }
  };
  const snapshot = async (sel) => {
    const id = "r20-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  // Godot 目前的狀態（唯讀快照）
  const engine = async (sel) => {
    const s = await snapshot(sel);
    return {
      bid: s.battle_id, state: s.game_state, paused: s.manual_paused, frozen: s.world_frozen, tree: s.tree_paused, pref: s.speed_pref, ts: s.time_scale,
      menu: s.deploy_menu_id, wave: s.wave, gt: s.game_time, active: s.active_enemies, spawning: s.spawning_groups, auto: s.auto_mode,
      pending: s.auto_next_wave_pending, hp: JSON.stringify(s.enemy_hp || {}), pos: JSON.stringify(s.enemy_pos || {}), towers: s.tower_targets || {},
    };
  };
  const post = (sel, msg) => page.evaluate(({ sel, msg }) => document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, ...msg }, "*"), { sel, msg });
  const rectOf = (sel) => page.evaluate((sel) => {
    const b = document.querySelector(sel).getBoundingClientRect();
    return { left: b.left, top: b.top, width: b.width, height: b.height };
  }, sel);
  // 格子在畫面上的位置（14×11 格、縮放比例 min(寬/540, 高/720)）
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
  const waitSlowEnd = (b0) => H.waitBridge(page, b0, { type: "update_stats", deploy_slow: false }, 15000);
  // 暫停按鈕、戰場上的「已暫停」與「繼續」：看得到、點得到、狀態
  const pauseUI = () =>
    page.evaluate(() => {
      const info = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { pressed: el.getAttribute("aria-pressed"), label: el.getAttribute("aria-label"), text: el.innerText.trim(), disabled: el.disabled, inView: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight, hit: !!top && (el === top || el.contains(top)) };
      };
      const badge = document.querySelector('[data-testid="pause-badge"]');
      return { toggle: info(document.querySelector('[data-testid="pause-toggle"]')), badge: badge ? badge.innerText.replace(/\s+/g, " ").trim() : null, resume: info(document.querySelector('[data-testid="pause-resume"]')) };
    });
  const usable = (b) => !!b && b.inView && b.hit && !b.disabled;
  const shownPaused = (ui) => !!ui.toggle && ui.toggle.pressed === "true" && ui.toggle.label === "繼續" && ui.badge === "已暫停 繼續" && usable(ui.resume) && usable(ui.toggle);
  const shownRunning = (ui) => !!ui.toggle && ui.toggle.pressed === "false" && ui.toggle.label === "暫停" && ui.badge === null && usable(ui.toggle);
  // 按下暫停或「繼續」，等 Godot 確認（update_stats 帶 paused）
  const setPaused = async (want, via = "toggle") => {
    const b0 = await H.bridgeLen(page);
    await page.locator(via === "badge" ? '[data-testid="pause-resume"]' : '[data-testid="pause-toggle"]').click();
    const st = await H.waitBridge(page, b0, { type: "update_stats", paused: want }, 15000);
    const reply = await H.waitBridge(page, b0, { type: "game_pause_result" }, 15000);
    await H.sleep(300);
    return { st, reply };
  };
  // 按下速度按鈕，等 Godot 確認；已經是這個速度時不按（按鈕不會送出命令）
  const clickSpeed = async (v) => {
    if ((await page.locator(`[data-testid="speed-${v}"]`).getAttribute("aria-pressed")) === "true") return lastStats();
    const b0 = await H.bridgeLen(page);
    await page.locator(`[data-testid="speed-${v}"]`).click();
    const st = await H.waitBridge(page, b0, { type: "update_stats", speed: v }, 15000);
    await H.waitBridge(page, b0, { type: "game_speed_result" }, 15000);
    await H.sleep(300);
    return st;
  };
  // 迎戰與自動按鈕是否停用
  const ctrl = (kind) =>
    page.evaluate((kind) => {
      const q = kind === "main" ? '[class*="hudActionBar"] button' : 'div[class*="battleTopBar"] button';
      const btns = [...document.querySelectorAll(q)];
      const find = (re) => btns.find((b) => re.test(b.innerText.trim()));
      const s = find(/^(迎戰|戰鬥中)$/);
      const a = find(kind === "main" ? /^自動$/ : /^自動 (ON|OFF)$/);
      return { start: s ? s.disabled : null, auto: a ? a.disabled : null };
    }, kind);
  const layout = (sel) =>
    page.evaluate((sel) => {
      const f = document.querySelector(sel).getBoundingClientRect();
      return { inView: f.left >= -0.5 && f.top >= -0.5 && f.right <= innerWidth + 0.5 && f.bottom <= innerHeight + 0.5, ratio: Math.abs(f.width * 4 - f.height * 3), sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, vw: innerWidth, vh: innerHeight };
    }, sel);
  const layoutOk = (l) => l.inView && l.ratio <= 4 && l.sw <= l.vw && l.sh <= l.vh;
  // 其他按鈕看得到、點得到（主頁：迎戰、自動、武將、隊伍與速度；獨立戰鬥頁：返回、自動、迎戰與速度）
  const otherButtons = (kind) =>
    page.evaluate((kind) => {
      const q = kind === "main" ? '[class*="hudTopBar"] button, [class*="hudActionBar"] button' : 'div[class*="battleTopBar"] button';
      const want = kind === "main" ? /^(迎戰|戰鬥中|自動|武將|隊伍|1×|2×)$/ : /^(‹|自動 (ON|OFF)|迎戰|戰鬥中|1×|2×)$/;
      return [...document.querySelectorAll(q)].filter((b) => want.test(b.innerText.trim())).map((b) => {
        const r = b.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { text: b.innerText.trim(), ok: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!top && (b === top || b.contains(top)) };
      });
    }, kind);
  const lastStats = () => page.evaluate(() => [...(window.__bridgeLog || [])].reverse().find((m) => m.type === "update_stats") || null);
  // 等到 Godot 的遊戲時間到 t（輪詢快照）
  const waitGt = async (sel, t, timeoutMs = 60000) => {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const s = await snapshot(sel);
      if (s.game_time >= t) return s;
      if (Date.now() > end) throw new Error(`等不到遊戲時間 ${t}`);
      await H.sleep(100);
    }
  };
  // 等到場上的敵人數至少 n（連續輪詢快照，回傳看到的那一次的遊戲時間）
  const waitActive = async (sel, n, timeoutMs = 60000) => {
    const end = Date.now() + timeoutMs;
    for (;;) {
      const s = await snapshot(sel);
      if (s.active_enemies >= n) return s.game_time;
      if (Date.now() > end) throw new Error(`等不到 ${n} 個敵人`);
    }
  };
  const openPage = async (kind, vp, stage, mapId) => {
    await page.setViewportSize(vp);
    if (kind === "main") {
      await page.goto(H.BASE + "/shenmaSanguo");
      await H.waitHud(page);
      await H.selectStage(page, stage);
      await H.dismissSplash(page);
      await closeMenuIfOpen();
      return IFRAME;
    }
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + mapId);
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
    await H.sleep(1000);
    const r = await rectOf(BIFRAME);
    await page.mouse.click(r.left + r.width / 2, r.top + r.height / 2);
    await H.sleep(500);
    await closeMenuIfOpen();
    return BIFRAME;
  };

  // ── 前置：玩家進度 chapter1_10（Mock A 慢速出兵：血厚、極慢、出兵間隔 4 秒；Mock C 快速自動：很快漏到基地清波） ──
  const profile = { nickname: "R20 玩家", level: 1, exp: 0, gold: 5000, capacity: 11, max_stage: "chapter1_10", heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }] };
  await section("setup", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", { profiles: { [A]: profile }, battle_logs: [] });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), A);
    if (ENGINE_DIR) await page.context().route(GAME_FILE, serveFrom(ENGINE_DIR));
    out.engineDir = ENGINE_DIR || null;
  });

  // ── P. 主頁 ──
  await section("P", async () => {
    const sel = await openPage("main", { width: 375, height: 740 }, "Mock A 慢速出兵");
    const n0 = await logLen();
    // P-1：新的一場未暫停；375 與 320 寬 HUD 放得下
    const e1 = await engine(sel);
    const ui1 = await pauseUI();
    const other1 = await otherButtons("main");
    out.P1 = { engine: { paused: e1.paused, frozen: e1.frozen, state: e1.state }, ui: ui1, other: other1, shot: await H.shot(page, "r20-p1-hud-375") };
    await page.setViewportSize({ width: 320, height: 640 });
    await H.sleep(700);
    const ui1b = await pauseUI();
    const other1b = await otherButtons("main");
    const lay1b = await layout(sel);
    out.P1b = { ui: ui1b, other: other1b, layout: lay1b, shot: await H.shot(page, "r20-p1b-hud-320") };
    await page.setViewportSize({ width: 375, height: 740 });
    await H.sleep(700);
    run.check("P-1 主頁新的一場：Godot 未暫停；HUD 有「暫停」（沒有「已暫停」），375×740 與 320×640 的暫停、1×、2×、迎戰、自動、武將、隊伍都看得到、點得到，完整戰場",
      e1.paused === false && e1.frozen === false && e1.state === 1 && shownRunning(ui1) && other1.length === 6 && other1.every((b) => b.ok) && shownRunning(ui1b) && other1b.length === 6 && other1b.every((b) => b.ok) && layoutOk(lay1b), { P1: out.P1, P1b: out.P1b });

    // P-2：暫停命令沒送到 Godot（測試攔下這一次的 set_paused）：畫面仍是「暫停」、沒有「已暫停」，Godot 沒有暫停、遊戲時間照走
    await page.evaluate((sel) => {
      // Window 的 postMessage 是視窗自己的屬性：保存原本的函式，測試後原樣指定回去（不能用 delete）
      const w = document.querySelector(sel).contentWindow;
      window.__r20OrigPost = w.postMessage;
      window.__r20Dropped = [];
      w.postMessage = (msg, ...rest) => {
        if (msg && msg.type === "set_paused" && window.__r20Dropped.length === 0) {
          window.__r20Dropped.push(msg);
          return;
        }
        return window.__r20OrigPost.call(w, msg, ...rest);
      };
    }, sel);
    const g2a = (await engine(sel)).gt;
    await page.locator('[data-testid="pause-toggle"]').click();
    await H.sleep(1500);
    const ui2 = await pauseUI();
    const e2 = await engine(sel);
    const dropped = await page.evaluate(() => window.__r20Dropped);
    await page.evaluate((sel) => { document.querySelector(sel).contentWindow.postMessage = window.__r20OrigPost; }, sel);
    out.P2 = { dropped, ui: ui2, engine: { paused: e2.paused, gt: [g2a, e2.gt] } };
    run.check("P-2 按暫停但命令沒送到 Godot：畫面仍是「暫停」、沒有「已暫停」（不先改顯示），Godot 沒有暫停、遊戲時間照走；送出的命令帶這一場的 battle_id 與 paused: true（目標狀態，不是切換）",
      dropped.length === 1 && dropped[0].battle_id === e1.bid && dropped[0].paused === true && shownRunning(ui2) && e2.paused === false && e2.gt > g2a, out.P2);

    // P-3：備戰中暫停：Godot 確認後才顯示「已暫停」與「繼續」，迎戰與自動停用；點空格不開部署選單；
    // 直接送開戰、切自動、蓋塔的命令（例如舊畫面留下的點擊）也被 Godot 拒絕；按戰場上的「繼續」恢復
    const c3 = await setPaused(true);
    const ui3 = await pauseUI();
    const k3 = await ctrl("main");
    const e3 = await engine(sel);
    out.P3_shot = await H.shot(page, "r20-p3-paused-prep");
    const b3 = await H.bridgeLen(page);
    const cp = await cellPoint(sel, 2, 4);
    await page.mouse.click(cp.x, cp.y);
    await post(sel, { type: "start_battle" });
    await post(sel, { type: "toggle_auto" });
    await post(sel, { type: "place_tower", tower_type: "archer", cell_x: 3, cell_y: 4 });
    await H.sleep(1500);
    const since3 = (await H.bridgeSince(page, b3)).map((m) => m.type || "result");
    const menu3 = await page.locator('[data-testid="placement-menu"]').count();
    const e3b = await engine(sel);
    const r3 = await setPaused(false, "badge");
    const ui3b = await pauseUI();
    out.P3 = { reply: c3.reply, ui: ui3, ctrl: k3, engine: { paused: e3.paused, frozen: e3.frozen, tree: e3.tree, ts: e3.ts }, since: [...new Set(since3)], menu: menu3,
      after: { state: e3b.state, wave: e3b.wave, auto: e3b.auto, towers: Object.keys(e3b.towers).length, paused: e3b.paused }, resume: r3.reply, uiAfter: ui3b };
    run.check("P-3 備戰中暫停：Godot 回覆成功後才顯示「已暫停」與「繼續」、暫停鈕亮起變「繼續」，迎戰與自動停用；Godot 暫停、模擬停止、SceneTree 沒暫停、倍率仍 1；點空格沒有部署選單；直接送開戰、切自動、蓋塔都被拒絕（仍備戰、波次 0、自動關、沒有塔）；按「繼續」恢復",
      c3.reply.ok === true && c3.reply.paused === true && c3.reply.battle_id === e1.bid && shownPaused(ui3) && k3.start === true && k3.auto === true && e3.paused === true && e3.frozen === true && e3.tree === false && e3.ts === 1
        && !since3.includes("click_cell") && menu3 === 0 && e3b.state === 1 && e3b.wave === 0 && e3b.auto === false && Object.keys(e3b.towers).length === 0 && e3b.paused === true && r3.reply.paused === false && shownRunning(ui3b), out.P3);

    // P-4：戰鬥中暫停：蓋弓兵塔、迎戰；第一隻出現後 2 秒（遊戲時間）暫停，牆鐘 2.5 秒內遊戲時間、敵人位置與血量、出兵數、波次都不變；
    // 繼續後第二隻在第一隻之後 4 秒（出兵間隔，遊戲時間）出現：不因暫停重新計滿、也不在繼續時立刻補出
    await H.placeTower(page, 2, 4);
    const b4 = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    await H.waitBridge(page, b4, { type: "update_stats", game_state: 2 }, 15000);
    const gFirst = await waitActive(sel, 1);
    await waitGt(sel, gFirst + 2.0);
    const c4 = await setPaused(true);
    const s4a = await engine(sel);
    await H.sleep(2500);
    const s4b = await engine(sel);
    out.P4_shot = await H.shot(page, "r20-p4-paused-battle");
    const gResume = s4b.gt;
    await setPaused(false);
    const gSecond = await waitActive(sel, 2, 30000);
    const same4 = s4a.gt === s4b.gt && s4a.hp === s4b.hp && s4a.pos === s4b.pos && s4a.active === s4b.active && s4a.spawning === s4b.spawning && s4a.wave === s4b.wave;
    out.P4 = { reply: c4.reply, before: { gt: s4a.gt, active: s4a.active, hp: s4a.hp, pos: s4a.pos }, after: { gt: s4b.gt, active: s4b.active, hp: s4b.hp, pos: s4b.pos }, gFirst, gResume, gSecond, interval: gSecond - gFirst, afterResume: gSecond - gResume };
    run.check("P-4 戰鬥中暫停：牆鐘 2.5 秒內遊戲時間、敵人位置與血量、出兵數、波次都不變（塔也沒有攻擊）；繼續後第二隻在第一隻之後約 4 秒（遊戲時間，容差 0.35）出現，繼續後至少 1 秒才出現（不立刻補出、不重新計滿）",
      c4.reply.ok === true && same4 && s4a.pos !== "{}" && s4a.active === 1 && Math.abs(gSecond - gFirst - 4.0) <= 0.35 && gSecond - gResume >= 1.0, out.P4);

    // P-5：部署與速度：2× 開部署選單（0.1）後暫停：選單鎖住（說明、所有選項停用），直接送的蓋塔命令被拒絕；暫停中選 1×：選擇 1、仍暫停；
    // 關閉選單：倍率 1 但仍暫停；按「繼續」後 1×。另一次 2× 開選單、暫停後直接按「繼續」（選單開著也按得到）：回到 0.1，關閉後 2
    await clickSpeed(2);
    const m5 = await openMenu(sel, 4, 4);
    await setPaused(true);
    const e5 = await engine(sel);
    const lock5 = await page.evaluate(() => {
      const m = document.querySelector('[data-testid="placement-menu"]');
      const cards = [...m.querySelectorAll('button[class*="menuCard"]')];
      return { notice: !!m.querySelector('[data-testid="placement-locked"]'), cards: cards.length, disabled: cards.filter((b) => b.disabled).length };
    });
    out.P5_shot = await H.shot(page, "r20-p5-paused-menu");
    await post(sel, { type: "place_tower", tower_type: "archer", cell_x: 4, cell_y: 4 });
    await H.sleep(800);
    const towers5 = Object.keys((await engine(sel)).towers).length;
    await clickSpeed(1);
    const e5b = await engine(sel);
    const b5 = await H.bridgeLen(page);
    await page.locator('[data-testid="placement-menu"] button[class*="closeBtn"]').click();
    await menuGone();
    await waitSlowEnd(b5);
    const e5c = await engine(sel);
    const ui5c = await pauseUI();
    await setPaused(false, "badge");
    const e5d = await engine(sel);
    await clickSpeed(2);
    await openMenu(sel, 5, 4);
    await setPaused(true);
    const ui5e = await pauseUI();
    await setPaused(false, "badge");
    const e5e = await engine(sel);
    const menuOpen5 = await page.locator('[data-testid="placement-menu"]').count();
    const b5f = await H.bridgeLen(page);
    await page.locator('[data-testid="placement-menu"] button[class*="closeBtn"]').click();
    await menuGone();
    await waitSlowEnd(b5f);
    const e5f = await engine(sel);
    out.P5 = { click: m5.menu_id, paused: { ts: e5.ts, paused: e5.paused, menu: e5.menu }, lock: lock5, towers: towers5, x1: { pref: e5b.pref, ts: e5b.ts, paused: e5b.paused }, closed: { ts: e5c.ts, paused: e5c.paused, menu: e5c.menu }, uiClosed: ui5c,
      resumed: { ts: e5d.ts, paused: e5d.paused }, keepMenu: { ui: ui5e, ts: e5e.ts, paused: e5e.paused, menuOpen: menuOpen5 }, final: e5f.ts };
    run.check("P-5 部署中暫停：2× 開選單是 0.1、暫停後仍記 0.1、選單顯示暫停說明且選項全部停用、直接送的蓋塔被拒絕；暫停中選 1×（選擇 1、仍暫停）；關閉選單倍率 1、仍暫停；「繼續」後 1；保留選單時「繼續」按得到、回到 0.1，關閉後 2",
      e5.ts === 0.1 && e5.paused === true && e5.menu === m5.menu_id && lock5.notice && lock5.cards > 0 && lock5.disabled === lock5.cards && towers5 === 1 && e5b.pref === 1 && e5b.ts === 0.1 && e5b.paused === true
        && e5c.ts === 1 && e5c.paused === true && e5c.menu === 0 && shownPaused(ui5c) && e5d.ts === 1 && e5d.paused === false && usable(ui5e.resume) && e5e.ts === 0.1 && e5e.paused === false && menuOpen5 === 1 && e5f.ts === 2, out.P5);

    // P-6：暫停中仍可點塔查看面板：面板顯示暫停說明，升級與改目標停用；直接送的升級與改目標命令被拒絕（等級、模式、金幣不變）
    await setPaused(true);
    const snap6 = await snapshot(sel);
    const [uid6, t6] = Object.entries(snap6.tower_targets).find(([, t]) => t.cell && t.cell[0] === 2 && t.cell[1] === 4) || [];
    const fr = await rectOf(sel);
    const k6 = Math.min(fr.width / 540, fr.height / 720);
    const b6 = await H.bridgeLen(page);
    await page.mouse.click(fr.left + t6.screen.x * k6, fr.top + t6.screen.y * k6);
    await H.waitBridge(page, b6, { type: "show_upgrade_panel" }, 15000);
    await page.waitForSelector('[data-testid="unit-panel"]', { timeout: 10000 });
    await H.sleep(300);
    const panel6 = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="unit-panel"]');
      const up = [...p.querySelectorAll("button")].find((b) => /^升級/.test(b.innerText.trim()));
      const tgt = [...p.querySelectorAll('[data-testid^="tower-target-"]')].filter((b) => b.tagName === "BUTTON");
      return { notice: !!p.querySelector('[data-testid="unit-panel-locked"]'), upgrade: up ? up.disabled : null, targets: tgt.length, targetsDisabled: tgt.filter((b) => b.disabled).length };
    });
    out.P6_shot = await H.shot(page, "r20-p6-paused-panel");
    const gold6 = (await lastStats()).gold;
    await post(sel, { type: "request_upgrade" });
    await post(sel, { type: "set_tower_target", battle_id: snap6.battle_id, tower_uid: uid6, mode: "strongest" });
    await H.sleep(1000);
    const snap6b = await snapshot(sel);
    const gold6b = (await lastStats()).gold;
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click();
    await H.sleep(300);
    await setPaused(false);
    out.P6 = { panel: panel6, tower: [t6, snap6b.tower_targets[uid6]], gold: [gold6, gold6b] };
    run.check("P-6 暫停中點塔：面板照常打開並顯示暫停說明，升級與全部目標按鈕（這座塔可以選的每一種，弓兵塔有優先飛行共四個）都停用；直接送的升級與改目標被 Godot 拒絕（等級 1、模式 first、金幣不變）",
      panel6.notice && panel6.upgrade === true && panel6.targets >= 3 && panel6.targets === (t6.modes || []).length && panel6.targetsDisabled === panel6.targets && snap6b.tower_targets[uid6].level === 1 && snap6b.tower_targets[uid6].mode === "first" && gold6 === gold6b, out.P6);

    // P-7：暫停中 320×640 與 740×375：暫停鈕與「繼續」看得到點得到，其他按鈕也是，完整戰場；轉回直向後按「繼續」
    await setPaused(true);
    const res7 = {};
    for (const [k, vp] of [["narrow", { width: 320, height: 640 }], ["landscape", { width: 740, height: 375 }]]) {
      await page.setViewportSize(vp);
      await H.sleep(700);
      res7[k] = { ui: await pauseUI(), other: await otherButtons("main"), layout: await layout(sel), shot: await H.shot(page, `r20-p7-paused-${k}`) };
    }
    await page.setViewportSize({ width: 375, height: 740 });
    await H.sleep(700);
    await setPaused(false, "badge");
    out.P7 = res7;
    run.check("P-7 暫停中 320×640 與 740×375：暫停鈕（繼續）與戰場上的「繼續」看得到點得到，1×、2×、迎戰、自動、武將、隊伍也是，完整戰場、沒有捲動",
      Object.values(res7).every((r) => shownPaused(r.ui) && r.other.length === 6 && r.other.every((b) => b.ok) && layoutOk(r.layout)), out.P7);

    // P-8：戰鬥中 2× 並暫停時切換關卡：新的一場未暫停、1 倍（Godot 與畫面）；新的一場暫停後，上一場的繼續命令不能解除（Godot 回覆 stale_battle）
    await clickSpeed(2);
    await setPaused(true);
    const old8 = (await engine(sel)).bid;
    await H.selectStage(page, "Mock A 慢速出兵");
    await H.sleep(500);
    const e8 = await engine(sel);
    const ui8 = await pauseUI();
    await setPaused(true);
    const b8 = await H.bridgeLen(page);
    await post(sel, { type: "set_paused", battle_id: old8, paused: false });
    const stale8 = await H.waitBridge(page, b8, { type: "game_pause_result", battle_id: old8 }, 15000);
    await H.sleep(500);
    const e8b = await engine(sel);
    const ui8b = await pauseUI();
    out.P8 = { old: old8, fresh: { bid: e8.bid, paused: e8.paused, frozen: e8.frozen, ts: e8.ts, pref: e8.pref }, ui: ui8, stale: stale8, after: { paused: e8b.paused, frozen: e8b.frozen }, uiAfter: ui8b };
    run.check("P-8 暫停中切換關卡：新的一場（新 battle_id）未暫停、模擬照常、倍率 1、畫面是「暫停」；新的一場暫停後送上一場的繼續命令：Godot 回覆 stale_battle，仍暫停、畫面仍是「已暫停」",
      e8.bid !== old8 && e8.paused === false && e8.frozen === false && e8.ts === 1 && e8.pref === 1 && shownRunning(ui8) && stale8.ok === false && stale8.reason === "stale_battle" && e8b.paused === true && e8b.frozen === true && shownPaused(ui8b), out.P8);
    // 收尾：仍暫停時才按「繼續」（錯誤的實作可能已被上一場的命令解除）
    if (ui8b.badge) await setPaused(false, "badge");

    // P-9：自動下一波的等待中暫停（Mock C：敵人很快漏到基地清波，1.5 秒後自動開下一波）：暫停期間（牆鐘 3 秒）仍在第 1 波、仍在等待、遊戲時間不變；
    // 按「繼續」後才開第 2 波，而且在 1.5 秒（遊戲時間）之內
    await H.selectStage(page, "Mock C 快速自動");
    await H.dismissSplash(page);
    await closeMenuIfOpen();
    const b9 = await H.bridgeLen(page);
    await H.clickButton(page, "自動");
    await H.waitBridge(page, b9, { type: "update_stats", auto_next_wave_pending: true }, 30000);
    await setPaused(true);
    const e9 = await engine(sel);
    await H.sleep(3000);
    const e9b = await engine(sel);
    const b9c = await H.bridgeLen(page);
    await setPaused(false, "badge");
    await H.waitBridge(page, b9c, { type: "update_stats", wave: 2 }, 15000);
    const e9c = await engine(sel);
    out.P9 = { paused: { wave: e9.wave, pending: e9.pending, gt: e9.gt }, later: { wave: e9b.wave, pending: e9b.pending, gt: e9b.gt }, wave2: { wave: e9c.wave, gt: e9c.gt }, waited: e9c.gt - e9b.gt };
    run.check("P-9 自動下一波的等待中暫停：牆鐘 3 秒後仍在第 1 波、仍在等待、遊戲時間不變；「繼續」後才開第 2 波，且在 1.5 秒遊戲時間之內（等待不重新計滿）",
      e9.wave === 1 && e9.pending === true && e9b.wave === 1 && e9b.pending === true && e9b.gt === e9.gt && e9c.wave === 2 && e9c.gt - e9b.gt <= 1.5 + 0.25 && e9c.gt - e9b.gt > 0.3, out.P9);

    // P-10：暫停不寫進存檔：這段期間沒有寫入，session 沒有暫停相關欄位
    const writes = await writesSince(n0);
    const sess = await page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
    out.P10 = { writes, sessionHasPause: /paused|manual_pause/.test(sess) };
    run.check("P-10 暫停不寫進存檔：這段期間沒有寫入請求，session 沒有暫停相關欄位", writes === 0 && !out.P10.sessionHasPause, out.P10);
  });

  // ── B. 獨立戰鬥頁 ──
  await section("B", async () => {
    const sel = await openPage("battle", { width: 375, height: 740 }, null, "chapter1_1");
    const e0 = await engine(sel);
    const ui0 = await pauseUI();
    const other0 = await otherButtons("battle");
    await page.setViewportSize({ width: 320, height: 640 });
    await H.sleep(700);
    const ui0b = await pauseUI();
    const other0b = await otherButtons("battle");
    const lay0b = await layout(sel);
    out.B1 = { engine: { paused: e0.paused, state: e0.state }, ui: ui0, other: other0, narrow: { ui: ui0b, other: other0b, layout: lay0b }, shot: await H.shot(page, "r20-b1-topbar-320") };
    await page.setViewportSize({ width: 375, height: 740 });
    await H.sleep(700);
    run.check("B-1 獨立戰鬥頁：新的一場未暫停，頂欄有「暫停」；375×740 與 320×640 的暫停、1×、2×、返回、自動、迎戰都看得到、點得到，完整戰場",
      e0.paused === false && e0.state === 1 && shownRunning(ui0) && other0.length === 5 && other0.every((b) => b.ok) && shownRunning(ui0b) && other0b.length === 5 && other0b.every((b) => b.ok) && layoutOk(lay0b), out.B1);

    // B-2：備戰中暫停：「已暫停」與「繼續」、迎戰與自動停用；點空格不開部署選單；直接送的開戰被拒絕；頂欄按鈕繼續
    const c2 = await setPaused(true);
    const ui2 = await pauseUI();
    const k2 = await ctrl("battle");
    const b2 = await H.bridgeLen(page);
    const cp = await cellPoint(sel, 2, 4);
    await page.mouse.click(cp.x, cp.y);
    await post(sel, { type: "start_battle" });
    await H.sleep(1500);
    const since2 = (await H.bridgeSince(page, b2)).map((m) => m.type || "result");
    const e2 = await engine(sel);
    out.B2_shot = await H.shot(page, "r20-b2-paused-prep");
    await setPaused(false);
    const ui2b = await pauseUI();
    out.B2 = { reply: c2.reply, ui: ui2, ctrl: k2, since: [...new Set(since2)], engine: { paused: e2.paused, state: e2.state, wave: e2.wave }, uiAfter: ui2b };
    run.check("B-2 獨立戰鬥頁備戰中暫停：Godot 確認後顯示「已暫停」與「繼續」，迎戰與自動停用；點空格沒有部署選單、直接送的開戰被拒絕（仍備戰、波次 0）；頂欄按下繼續後恢復",
      c2.reply.ok === true && shownPaused(ui2) && k2.start === true && k2.auto === true && !since2.includes("click_cell") && e2.paused === true && e2.state === 1 && e2.wave === 0 && shownRunning(ui2b), out.B2);

    // B-3：戰鬥中 2× 暫停：倍率仍 2、牆鐘 2 秒內遊戲時間與敵人位置不變；繼續後仍是 2、遊戲時間前進
    const b3 = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    await H.waitBridge(page, b3, { type: "update_stats", game_state: 2 }, 15000);
    await waitActive(sel, 1);
    await clickSpeed(2);
    await setPaused(true);
    const e3 = await engine(sel);
    await H.sleep(2000);
    const e3b = await engine(sel);
    await setPaused(false, "badge");
    await H.sleep(500);
    const e3c = await engine(sel);
    out.B3 = { paused: { ts: e3.ts, gt: e3.gt, pos: e3.pos }, later: { gt: e3b.gt, pos: e3b.pos }, resumed: { ts: e3c.ts, paused: e3c.paused, gt: e3c.gt } };
    run.check("B-3 獨立戰鬥頁 2× 時暫停：倍率仍 2（不是 0）、牆鐘 2 秒內遊戲時間與敵人位置不變；按「繼續」後仍 2 倍、遊戲時間前進",
      e3.ts === 2 && e3.paused === true && e3b.gt === e3.gt && e3b.pos === e3.pos && e3.pos !== "{}" && e3c.ts === 2 && e3c.paused === false && e3c.gt > e3b.gt, out.B3);

    // B-4：暫停中轉成 740×375：完整戰場、同一場、沒有重新載入；暫停鈕、「繼續」與其他頂欄按鈕都點得到；轉回直向後繼續
    await setPaused(true);
    const ready0 = await page.evaluate(() => (window.__bridgeLog || []).filter((m) => m.type === "game_ready").length);
    await page.setViewportSize({ width: 740, height: 375 });
    await H.sleep(700);
    const lay4 = await layout(sel);
    const ui4 = await pauseUI();
    const other4 = await otherButtons("battle");
    const e4 = await engine(sel);
    out.B4_shot = await H.shot(page, "r20-b4-paused-landscape");
    await page.setViewportSize({ width: 375, height: 740 });
    await H.sleep(700);
    await setPaused(false);
    const ready1 = await page.evaluate(() => (window.__bridgeLog || []).filter((m) => m.type === "game_ready").length);
    out.B4 = { layout: lay4, ui: ui4, other: other4, engine: { bid: e4.bid, paused: e4.paused }, ready: [ready0, ready1] };
    run.check("B-4 獨立戰鬥頁暫停中轉成 740×375：完整戰場、沒有捲動；同一場、仍暫停、沒有新的 game_ready；暫停鈕、「繼續」與 1×、2×、返回、自動、迎戰都點得到",
      layoutOk(lay4) && shownPaused(ui4) && other4.length === 5 && other4.every((b) => b.ok) && e4.bid === e0.bid && e4.paused === true && ready0 === ready1, out.B4);
    await page.setViewportSize({ width: 540, height: 900 });
  });

  // ── V. 舊版遊戲（加入暫停之前）：顯示更新提示，不送關卡資料、沒有暫停按鈕 ──
  if (!ENGINE_DIR) {
    await section("V", async () => {
      const hits = [];
      const route = serveFrom(PROTO5, hits);
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
        const toggle = await page.locator('[data-testid="pause-toggle"]').count();
        out.V = { hits: [...new Set(hits)], protocol: ready.protocol ?? null, prompt, stage: snap.stage, state: snap.game_state, toggle, shot: await H.shot(page, "r20-v-proto5-prompt") };
        run.check("V-1 舊版遊戲（加入暫停之前的產物，協定 5 或 4）：顯示「遊戲版本需要更新」，沒有送出關卡資料、沒有暫停按鈕（暫停命令不會對舊遊戲默默失效）",
          out.V.hits.includes("index.pck") && (out.V.protocol === 5 || out.V.protocol === 4) && /遊戲版本需要更新/.test(prompt) && snap.stage === "" && snap.game_state === 0 && toggle === 0, out.V);
      } finally {
        await page.context().unroute(GAME_FILE, route);
        await H.resetOrigin(page, { keepMockDb: true });
      }
    });
  }
  if (ENGINE_DIR) await page.context().unroute(GAME_FILE);

  return run.finish({ out });
}
