async (page) => {
  // 戰場內的「下一波」與地面路線沒有路程（瀏覽器，真 Godot 產物）。這支腳本另外加三個測試關（只在它開啟時出現，不影響其他腳本）：
  // - Mock N 下一波（chapter2_5）：3 波。第 1 波 C 快騎 ×2（地面）；第 2 波疾鳥 ×2（飛行）＋路線無效的疾鳥（環狀路線）
  //   ＋路線無效的 C 快騎（單一路點）；第 3 波 C 快騎 ×1＋長名字的地面敵人 ×1＋數量無法判讀的一組
  // - Mock O 缺第二波（chapter2_6）：只有第 1、3 波（總波數 3）
  // - Mock G 地面無效（chapter2_7）：第 1 波只有地面路線沒有路程的組（單一路點、兩個相同路點）
  // 檢查：
  // - G：地面路線沒有路程：關卡預覽標出原因、戰場內的下一波同樣標出、實際按迎戰被拒絕（原因代碼是地面的，城池 20、沒有結算）
  // - M：主頁從初始備戰→第 1 波→清波後的備戰→第 2 波→第 3 波（最後一波）→結算，視窗開著跨波時標題與內容一起更新；
  //      實際出兵和視窗一致；對空提醒只看那一波；開關視窗不送任何命令、不發 API
  // - P：手動暫停中查看後仍暫停（遊戲時間不前進）；2× 與自動開啟時查看後不變；關閉後其他按鈕照常；
  //      換關後是新的一場（視窗關閉、重新打開是新場的第 1 波），舊場晚到的戰況不改變視窗
  // - O：缺波次不是「沒有下一波」：下一波是第 2 波、標成沒有資料；按迎戰被拒絕後仍一致
  // - B：獨立戰鬥頁：自動模式開著視窗跨三波到結算（視窗自動關閉），自動一直開著、沒有額外命令
  // - N：390 寬：兩個入口的按鈕列不溢出；鍵盤開啟、Tab 只在視窗內、Esc 關閉後焦點回到入口；長名字換行、關閉鈕看得到
  // 全部 mock、虛構金鑰 test_nextwave_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin({
    expectedConsole: [
      /拒絕開始第 \d+ 波/,
      /^WARNING: \[WaveManager\] (飛行|地面)敵人組 'mock_[\w]+' 的路線 path_\w+ 無效（(flight|ground)_\w+），跳過此組$/,
      /^WARNING: \[WaveManager\] 敵人組 'mock_c_fast' 數量為 0，跳過此組$/,
      /^WARNING: \[WaveManager\] 找不到波次 2 資料$/,
      /^\s*at: push_(warning|error) \(core[\\/]variant[\\/]variant_utility\.cpp:\d+\)$/,
      /^\s*GDScript backtrace/,
      // 自動模式開下一波時的呼叫來源是計時器的匿名函式
      /^\s*\[\d+\] (\w+|<anonymous lambda>) \(res:\/\/[\w/]+\.gd:\d+\)$/,
    ],
  });
  const out = {};
  const KEY = "test_nextwave_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const N = { id: "chapter2_5", name: "Mock N 下一波" };
  const O = { id: "chapter2_6", name: "Mock O 缺第二波" };
  const G = { id: "chapter2_7", name: "Mock G 地面無效" };
  const A = { id: "chapter1_1", name: "Mock A 慢速出兵" };
  const LONG = "非常非常長的敵人名稱ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789用來測試換行";

  // ── 測試關（get_all_maps／get_enemies_config 的回應後面接上；只在 __shenma_nw_fixture 開啟時）──
  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = (paths) => ({ cols: 14, rows: 11, paths, spawn: [0, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" });
  const grp = (enemy_id, count, interval, path) => ({ enemy_id, count, interval, path });
  const straight = [[0, ROW], [13, ROW]];
  const loop = [[0, ROW], [4, ROW], [4, ROW - 3], [0, ROW - 3], [0, ROW]];
  const EXTRA = {
    enemies: [
      { enemy_id: "mock_nw_bird", name: "疾鳥", hp: 99999, speed: 150, image: "enemy_cavalry1.webp", movement_type: "flying" },
      { enemy_id: "mock_nw_long", name: LONG, hp: 99999, speed: 400, image: "enemy_grunt1.webp", movement_type: "ground" },
    ],
    maps: [
      {
        map_id: N.id, chapter: 2, name: N.name, unlock_stage: N.id,
        path_json: pj({ path_a: straight, path_loop: loop, path_single: [[6, ROW - 3]] }),
        waves: [
          { wave: 1, enemies: [grp("mock_c_fast", 2, 1.0, "path_a")] },
          { wave: 2, enemies: [grp("mock_nw_bird", 2, 0.5, "path_a"), grp("mock_nw_bird", 1, 0.5, "path_loop"), grp("mock_c_fast", 1, 0.5, "path_single")] },
          { wave: 3, enemies: [grp("mock_c_fast", 1, 0.5, "path_a"), grp("mock_nw_long", 1, 0.5, "path_a"), grp("mock_c_fast", "三隻", 0.5, "path_a")] },
        ],
      },
      {
        map_id: O.id, chapter: 2, name: O.name, unlock_stage: O.id,
        path_json: pj({ path_a: straight }),
        waves: [
          { wave: 1, enemies: [grp("mock_c_fast", 1, 0.5, "path_a")] },
          { wave: 3, enemies: [grp("mock_c_fast", 1, 0.5, "path_a")] },
        ],
      },
      {
        map_id: G.id, chapter: 2, name: G.name, unlock_stage: G.id,
        path_json: pj({ path_a: straight, path_single: [[6, ROW - 3]], path_dup: [[3, ROW + 3], [3, ROW + 3]] }),
        waves: [{ wave: 1, enemies: [grp("mock_c_fast", 2, 0.5, "path_single"), grp("mock_grunt", 1, 0.5, "path_dup")] }],
      },
    ],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_nw_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps" || body.action === "get_enemies_config") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (j && j.status === 200) {
            if (body.action === "get_all_maps" && Array.isArray(j.maps)) j.maps = [...j.maps, ...extra.maps];
            if (body.action === "get_enemies_config" && Array.isArray(j.enemies)) j.enemies = [...j.enemies, ...extra.enemies];
            return new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          return res;
        }
      }
      return inner(input, init);
    };
  }, EXTRA);

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const profile = () => ({
    nickname: "下一波", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: G.id, heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }],
  });
  const snapshot = async (sel) => {
    const id = "nw-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const dismissSplash = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
  // 遊戲 iframe 收到的每一則網頁命令（Web → Godot）：在 iframe 裡聽 message，記在上層頁面（不改遊戲的任何行為）
  const hookGame = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      window.__toGodot = window.__toGodot || [];
      if (w.__nwHooked) return;
      w.__nwHooked = true;
      w.addEventListener("message", (e) => {
        const d = e.data;
        if (!d || typeof d !== "object") return;
        if (d.__godot_bridge === true || d.stage_id !== undefined) window.__toGodot.push({ type: d.type || (d.stage_id !== undefined ? "payload" : "?"), t: performance.now() });
      });
    }, sel);
  const cmdLen = () => page.evaluate(() => (window.__toGodot || []).length);
  // 這段期間網頁送給遊戲的命令（排除測試自己要的快照）
  const cmdsSince = (i) => page.evaluate((i) => (window.__toGodot || []).slice(i).map((c) => c.type).filter((t) => t !== "debug_snapshot"), i);
  const lastStats = () =>
    page.evaluate(() => {
      const s = [...(window.__bridgeLog || [])].reverse().find((m) => m.type === "update_stats");
      return s ? { battle_id: s.battle_id, wave: s.wave, total: s.total_waves, gs: s.game_state, auto: s.auto_mode, speed: s.speed, time_scale: s.time_scale, paused: s.paused, deploy_slow: s.deploy_slow } : null;
    });
  const control = (s) => s && { gs: s.gs, wave: s.wave, auto: s.auto, speed: s.speed, time_scale: s.time_scale, paused: s.paused, deploy_slow: s.deploy_slow };
  const waitStats = (pred, arg, timeout = 60000) =>
    page.waitForFunction(({ pred, arg }) => {
      const s = [...(window.__bridgeLog || [])].reverse().find((m) => m.type === "update_stats");
      return s && new Function("s", "arg", "return (" + pred + ")(s, arg)")(s, arg);
    }, { pred: pred.toString(), arg }, { timeout, polling: 100 });
  const gasCount = async () => (await H.gasLog(page)).length;
  const nwInfo = () =>
    page.evaluate(() => {
      const d = document.querySelector('[data-testid="next-wave"]');
      if (!d) return null;
      const q = (id) => d.querySelector(`[data-testid="${id}"]`);
      const txt = (el) => (el ? el.innerText.replace(/\s+/g, " ").trim() : null);
      const a = d.querySelector('[data-testid="air-readiness"]');
      return {
        status: d.dataset.status, next: d.dataset.next, current: d.dataset.current, total: d.dataset.total, phase: d.dataset.phase,
        title: txt(q("next-wave-title")), position: txt(q("next-wave-position")), summary: txt(q("next-wave-summary")), hint: txt(q("next-wave-hint")),
        groups: [...d.querySelectorAll('[data-testid="preview-group"]')].map((g) => ({
          movement: g.dataset.movement, outcome: g.dataset.outcome, flight: g.dataset.flightProblem, ground: g.dataset.groundProblem,
          text: g.innerText.replace(/\s+/g, " "), groundTag: !!g.querySelector('[data-testid="preview-ground"]'), flyTag: !!g.querySelector('[data-testid="preview-flying"]'),
        })),
        air: a ? { kind: a.dataset.kind, scope: a.dataset.scope, invalid: a.dataset.invalidFlying, text: a.innerText.replace(/\s+/g, " ") } : null,
        noAir: !!q("next-wave-no-air"),
        focus: document.activeElement ? document.activeElement.getAttribute("data-testid") : null,
      };
    });
  const waitNw = (pred, arg, timeout = 60000) =>
    page.waitForFunction(({ pred, arg }) => {
      const d = document.querySelector('[data-testid="next-wave"]');
      return new Function("d", "arg", "return (" + pred + ")(d, arg)")(d, arg);
    }, { pred: pred.toString(), arg }, { timeout, polling: 100 });
  const openNw = async () => {
    await page.locator('[data-testid="next-wave-open"]').click();
    await page.waitForSelector('[data-testid="next-wave"]', { timeout: 10000 });
    await H.sleep(200);
  };
  const closeNw = async () => {
    await page.locator('[data-testid="next-wave-close-bottom"]').click();
    await page.waitForSelector('[data-testid="next-wave"]', { state: "detached", timeout: 10000 });
  };
  const titleOk = (i) => i && i.title === `下一波：第 ${i.next} 波（共 ${i.total} 波）`;
  const startBattle = () => page.getByRole("button", { name: "迎戰", exact: true }).click();
  const cardOf = (name) => page.locator('div[class*="stageCard"]', { has: page.locator("div", { hasText: new RegExp("^" + name + "$") }) }).first();
  const rejectInfo = () =>
    page.evaluate(() => {
      const n = document.querySelector('[data-testid="wave-reject"]');
      return n ? { wave: n.getAttribute("data-wave"), lines: [...n.querySelectorAll('[data-testid="wave-reject-lines"] li')].map((l) => l.innerText) } : null;
    });
  // 從遊戲 iframe 裡送一則訊息給頁面（和 Godot 送的來源相同），用來模擬舊場次晚到的戰況
  const fromGame = (sel, msg) =>
    page.evaluate(({ sel, msg }) => document.querySelector(sel).contentWindow.eval(`window.parent.postMessage(${JSON.stringify(msg)}, '*')`), { sel, msg });
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `next-wave-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };

  // ── 準備 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_nw_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, p: profile() });
    await page.setViewportSize({ width: 540, height: 900 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
  });

  // ── G. 地面路線沒有路程 ──
  await section("G", async () => {
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
    await cardOf(G.name).locator('[data-testid="enemy-preview-open"]').click();
    await page.waitForSelector('[data-testid="enemy-preview"]', { timeout: 10000 });
    const pv = await page.evaluate(() => {
      const w = document.querySelector('[data-testid="enemy-preview"] [data-testid="preview-wave-1"]');
      return {
        header: w.querySelector('[data-testid="preview-wave-toggle-1"]').innerText.replace(/\s+/g, " "),
        body: w.innerText.replace(/\s+/g, " "),
        groups: [...w.querySelectorAll('[data-testid="preview-group"]')].map((g) => [g.dataset.movement, g.dataset.outcome, g.dataset.groundProblem]),
      };
    });
    out.G1 = { pv, shot: await H.shot(page, "next-wave-g1-preview-ground") };
    await page.locator('[data-testid="enemy-preview-close"]').click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    run.check("G-1 關卡預覽：地面路線沒有路程的兩組都「不會出兵」，原因分別是地面路線只有一個路點、路點都在同一格；這一波「遊戲會拒絕這一波」",
      same(pv.groups, [["ground", "skip", "ground_single_point"], ["ground", "skip", "ground_zero_length"]]) &&
        /遊戲會拒絕這一波/.test(pv.header) && /地面路線只有一個路點/.test(pv.body) && /地面路線的路點都在同一格/.test(pv.body),
      out.G1);

    await H.selectStage(page, G.name);
    await dismissSplash(IFRAME);
    await hookGame(IFRAME);
    await openNw();
    const nw = await nwInfo();
    out.G2 = { nw, shot: await H.shot(page, "next-wave-g2-dialog-ground") };
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-testid="next-wave"]', { state: "detached", timeout: 5000 });
    run.check("G-2 戰場內的下一波（初始備戰）：第 1 波會被拒絕，兩組標出地面路線的原因、不會出兵；沒有對空提醒",
      nw && nw.status === "wave" && nw.next === "1" && titleOk(nw) && /遊戲會拒絕開始這一波/.test(nw.summary) &&
        same(nw.groups.map((g) => [g.outcome, g.ground]), [["skip", "ground_single_point"], ["skip", "ground_zero_length"]]) &&
        nw.groups.every((g) => g.groundTag && /不會出兵/.test(g.text)) && nw.air === null,
      out.G2);

    const idx = await H.bridgeLen(page);
    await startBattle();
    const msg = await H.waitBridge(page, idx, { type: "wave_rejected" }, 30000);
    await page.waitForSelector('[data-testid="wave-reject"]', { timeout: 10000 });
    await H.sleep(1200);
    const info = await rejectInfo();
    const snap = await snapshot(IFRAME);
    out.G3 = { msg: { wave: msg.wave, skipped: msg.skipped }, info, state: { gs: snap.game_state, wave: snap.wave, hp: snap.hp, enemies: Object.keys(snap.enemy_kind || {}).length }, result: await page.locator('[data-testid="result-card"]').count(), shot: await H.shot(page, "next-wave-g3-reject-ground") };
    run.check("G-3 按迎戰：Godot 拒絕開戰，wave_rejected 的原因是 ground_single_point、ground_zero_length；提示逐組寫出地面路線的原因；仍在備戰、波次 0、城池 20、場上沒有敵人、沒有結算",
      msg.wave === 1 && same(msg.skipped.map((s) => s.reason), ["ground_single_point", "ground_zero_length"]) &&
        info && info.lines.length === 2 && /地面路線只有一個路點/.test(info.lines[0]) && /地面路線的路點都在同一格/.test(info.lines[1]) &&
        snap.game_state === 1 && snap.wave === 0 && snap.hp === 20 && out.G3.state.enemies === 0 && out.G3.result === 0,
      out.G3);
    await page.locator('[data-testid="wave-reject-close"]').click();
    await H.sleep(300);
  });

  // ── M. 主頁：開著視窗跨波 ──
  await section("M", async () => {
    await H.selectStage(page, N.name);
    await dismissSplash(IFRAME);
    await hookGame(IFRAME);
    const s0 = await lastStats();
    const c0 = await cmdLen();
    const g0 = await gasCount();
    await page.locator('[data-testid="next-wave-open"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="next-wave"]', { timeout: 10000 });
    await H.sleep(300);
    const i0 = await nwInfo();
    const shot0 = await H.shot(page, "next-wave-m1-initial");
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-testid="next-wave"]', { state: "detached", timeout: 5000 });
    const focusBack = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid"));
    await H.sleep(300);
    const s1 = await lastStats();
    out.M1 = { i0, focusBack, before: control(s0), after: control(s1), cmds: await cmdsSince(c0), gas: (await gasCount()) - g0, shot0 };
    run.check("M-1 初始備戰（鍵盤開啟）：標題「下一波：第 1 波（共 3 波）」、備戰中第 1 波還沒開始；C 快騎 ×2 標成地面；這一波沒有飛行敵人；焦點在關閉鈕，Esc 關閉後回到「下一波」；前後狀態相同、沒有送出任何命令、沒有 API",
      i0 && i0.status === "wave" && i0.next === "1" && i0.current === "0" && i0.phase === "prep" && titleOk(i0) && i0.total === "3" &&
        /第 1 波還沒開始/.test(i0.position) && i0.groups.length === 1 && /C 快騎 ×2/.test(i0.groups[0].text) && i0.groups[0].groundTag && !i0.groups[0].flyTag &&
        i0.noAir && i0.focus === "next-wave-close" && focusBack === "next-wave-open" && /不會暫停/.test(i0.hint) &&
        same(out.M1.before, out.M1.after) && out.M1.cmds.length === 0 && out.M1.gas === 0,
      out.M1);

    // 第 1 波戰鬥中打開，開著等清波（手動 → 回到備戰）
    await startBattle();
    await waitStats((s) => s.game_state === 2 && s.wave === 1);
    await openNw();
    const c1 = await cmdLen();
    await waitNw((d) => d && d.dataset.next === "2" && d.dataset.phase === "battle");
    const i1 = await nwInfo();
    const shot1 = await H.shot(page, "next-wave-m2-battle-w1");
    await waitNw((d) => d && d.dataset.next === "2" && d.dataset.phase === "prep" && d.dataset.current === "1", null, 60000);
    const i1p = await nwInfo();
    out.M2 = { i1, i1p, cmds: await cmdsSince(c1), shot1 };
    run.check("M-2 第 1 波戰鬥中：下一波是第 2 波；疾鳥 ×2（飛行）照常、環狀路線的疾鳥與單一路點的 C 快騎「不會出兵」並寫出原因；「第 2 波：2 隻敵人」；對空提醒只看這一波（疾鳥 ×2、1 組路線無效）",
      i1 && i1.status === "wave" && i1.next === "2" && titleOk(i1) && /第 1 波戰鬥中/.test(i1.position) && /第 2 波：2 隻敵人/.test(i1.summary) &&
        same(i1.groups.map((g) => [g.movement, g.outcome, g.flight, g.ground]), [["flying", "spawn", "", ""], ["flying", "skip", "flight_same_endpoints", ""], ["ground", "skip", "", "ground_single_point"]]) &&
        i1.air && i1.air.scope === "wave" && i1.air.kind === "flying" && i1.air.invalid === "1" && /這一波有飛行敵人/.test(i1.air.text) && /疾鳥 ×2/.test(i1.air.text) && !/第 3 波/.test(i1.air.text) && !/本關/.test(i1.air.text),
      out.M2);
    run.check("M-3 視窗開著時第 1 波清完（手動 → 備戰）：視窗跟著更新成「備戰中，第 1 波已結束」，下一波仍是第 2 波、標題一致；這段時間網頁沒有送出任何命令",
      i1p && i1p.next === "2" && i1p.phase === "prep" && titleOk(i1p) && /第 1 波已結束/.test(i1p.position) && out.M2.cmds.length === 0,
      out.M2);
    await closeNw();

    // 第 2 波：實際出兵和視窗一致；開著等清波
    await startBattle();
    await waitStats((s) => s.game_state === 2 && s.wave === 2);
    await H.sleep(1500);
    const snap2 = await snapshot(IFRAME);
    await openNw();
    const c2 = await cmdLen();
    await waitNw((d) => d && d.dataset.next === "3" && d.dataset.phase === "battle");
    const i2 = await nwInfo();
    const shot2 = await H.shot(page, "next-wave-m4-battle-w2");
    await waitNw((d) => d && d.dataset.next === "3" && d.dataset.phase === "prep", null, 60000);
    out.M4 = { spawned: Object.values(snap2.enemy_kind || {}).sort(), moves: Object.values(snap2.enemy_move || {}), i2, cmds: await cmdsSince(c2), shot2 };
    run.check("M-4 第 2 波實際只出 2 隻疾鳥（飛行），和視窗寫的相同；第 2 波戰鬥中的下一波是第 3 波：C 快騎 ×1、長名字 ×1（地面），數量無法判讀的一組「數量無法確定」，這一波的總數無法確定；這一波沒有飛行敵人",
      same(out.M4.spawned, ["mock_nw_bird", "mock_nw_bird"]) && out.M4.moves.every((m) => m === "flying") &&
        i2 && i2.next === "3" && titleOk(i2) && same(i2.groups.map((g) => g.outcome), ["spawn", "spawn", "unknown"]) &&
        /C 快騎 ×1/.test(i2.groups[0].text) && i2.groups[1].text.includes(LONG) && /數量無法確定/.test(i2.groups[2].text) &&
        /數量無法確定/.test(i2.summary) && i2.noAir && out.M4.cmds.length === 0,
      out.M4);
    await closeNw();

    // 第 3 波（最後一波）：已是最後一波；開著等結算，視窗自動關閉
    await startBattle();
    await waitStats((s) => s.game_state === 2 && s.wave === 3);
    await openNw();
    const c3 = await cmdLen();
    const i3 = await nwInfo();
    const shot3 = await H.shot(page, "next-wave-m5-last");
    await page.waitForSelector('[data-testid="result-card"]', { timeout: 60000 });
    await H.sleep(500);
    const afterResult = await page.locator('[data-testid="next-wave"]').count();
    out.M5 = { i3, afterResult, cmds: await cmdsSince(c3), shot3, shotResult: await H.shot(page, "next-wave-m5-result") };
    run.check("M-5 最後一波戰鬥中：「已是最後一波：第 3 波之後沒有下一波」；開著等到結算，視窗自動關閉、結算照常出現；這段時間沒有送出任何命令",
      i3 && i3.status === "last" && i3.title === "下一波" && /已是最後一波：第 3 波之後沒有下一波/.test(i3.summary) && /第 3 波戰鬥中/.test(i3.position) &&
        afterResult === 0 && out.M5.cmds.length === 0,
      out.M5);
    await page.locator('[data-testid="result-card"] button', { hasText: "確認" }).click();
    await H.sleep(1500);
  });

  // ── P. 暫停、倍率、自動不受影響；換關與舊場的戰況 ──
  await section("P", async () => {
    await H.selectStage(page, A.name);
    await dismissSplash(IFRAME);
    await hookGame(IFRAME);
    await startBattle();
    await waitStats((s) => s.game_state === 2 && s.wave === 1);
    await page.locator('[data-testid="pause-toggle"]').click();
    await waitStats((s) => s.paused === true);
    const t0 = (await snapshot(IFRAME)).game_time;
    const c0 = await cmdLen();
    const g0 = await gasCount();
    const s0 = await lastStats();
    await openNw();
    const ip = await nwInfo();
    await H.sleep(1500);
    await closeNw();
    await H.sleep(500);
    const t1 = (await snapshot(IFRAME)).game_time;
    const s1 = await lastStats();
    out.P1 = { ip, t0, t1, before: control(s0), after: control(s1), cmds: await cmdsSince(c0), gas: (await gasCount()) - g0, badge: await page.locator('[data-testid="pause-badge"]').count() };
    run.check("P-1 手動暫停中查看下一波（第 2 波 A 慢兵 ×5）：關閉後仍暫停、「已暫停」還在、遊戲時間沒有前進；沒有送出暫停／繼續或任何命令，也沒有 API",
      ip && ip.next === "2" && /A 慢兵 ×5/.test(ip.groups.map((g) => g.text).join()) &&
        s1.paused === true && Math.abs(t1 - t0) < 0.001 && same(out.P1.before, out.P1.after) && out.P1.cmds.length === 0 && out.P1.gas === 0 && out.P1.badge === 1,
      out.P1);
    await page.locator('[data-testid="pause-toggle"]').click();
    await waitStats((s) => s.paused === false);

    await page.locator('[data-testid="speed-2"]').click();
    await waitStats((s) => s.speed === 2);
    await page.getByRole("button", { name: "自動", exact: true }).click();
    await waitStats((s) => s.auto_mode === true);
    const c1 = await cmdLen();
    const s2 = await lastStats();
    await openNw();
    await H.sleep(1000);
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-testid="next-wave"]', { state: "detached", timeout: 5000 });
    await H.sleep(500);
    const s3 = await lastStats();
    const btns = await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")];
      const f = (t) => b.find((x) => x.innerText.trim() === t);
      return { start: f("戰鬥中")?.disabled ?? null, auto: f("自動")?.disabled ?? null, team: f("隊伍")?.disabled ?? null, pause: document.querySelector('[data-testid="pause-toggle"]')?.disabled ?? null };
    });
    out.P2 = { before: control(s2), after: control(s3), cmds: await cmdsSince(c1), btns };
    run.check("P-2 2× 與自動開啟時查看後關閉：倍率仍是 2×、實際倍率 2、自動仍開啟、仍在戰鬥；沒有送出任何命令；關閉後暫停、自動、隊伍按鈕照常可按",
      s3.speed === 2 && s3.time_scale === 2 && s3.auto === true && s3.gs === 2 && s2.speed === 2 && s2.auto === true &&
        out.P2.cmds.length === 0 && btns.auto === false && btns.team === false && btns.pause === false,
      out.P2);
    await page.getByRole("button", { name: "隊伍", exact: true }).click();
    await page.waitForSelector('button[class*="modalClose"]', { timeout: 10000 });
    const teamOpen = (await page.locator('span[class*="modalTitle"]', { hasText: /^隊伍編排$/ }).count()) === 1 && (await page.locator('[data-testid="team-slot"]').count()) > 0;
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    run.check("P-3 關閉下一波後「隊伍」照常打開隊伍視窗", teamOpen, { teamOpen });

    // 換關（新的一場）：視窗關閉；重新打開是新場的第 1 波；舊場晚到的戰況不改變視窗
    const oldId = (await lastStats()).battle_id;
    await page.locator('[data-testid="speed-1"]').click();
    await H.selectStage(page, N.name);
    await dismissSplash(IFRAME);
    const closedAfterSwitch = await page.locator('[data-testid="next-wave"]').count();
    await openNw();
    const fresh = await nwInfo();
    await fromGame(IFRAME, { __godot_bridge: true, type: "update_stats", battle_id: oldId, gold: 500, wave: 2, total_waves: 2, hp: 20, max_hp: 20, game_state: 2, auto_mode: true, speed: 2, time_scale: 2, deploy_slow: false, paused: false });
    await fromGame(IFRAME, { __godot_bridge: true, type: "update_stats", gold: 500, wave: 2, total_waves: 3, hp: 20, max_hp: 20, game_state: 2, auto_mode: false, speed: 1, time_scale: 1, deploy_slow: false, paused: false });
    await H.sleep(800);
    const afterStale = await nwInfo();
    const newId = (await lastStats()) && (await page.evaluate(() => [...window.__bridgeLog].reverse().find((m) => m.type === "update_stats" && m.wave === 0 && m.game_state === 1)?.battle_id));
    out.P4 = { oldId, newId, closedAfterSwitch, fresh, afterStale, shot: await H.shot(page, "next-wave-p4-stale") };
    await closeNw();
    run.check("P-4 換關（新的一場）後視窗是關著的；重新打開是新場的第 1 波（不是舊場的第 2 波）；舊場（battle_id 不同）與沒有 battle_id 的晚到戰況都不改變視窗",
      closedAfterSwitch === 0 && oldId && newId && oldId !== newId && fresh && fresh.next === "1" && fresh.current === "0" && fresh.phase === "prep" &&
        afterStale && afterStale.next === "1" && afterStale.current === "0" && afterStale.phase === "prep" && afterStale.title === fresh.title,
      out.P4);
  });

  // ── O. 缺波次 ──
  await section("O", async () => {
    await H.selectStage(page, O.name);
    await dismissSplash(IFRAME);
    await startBattle();
    await waitStats((s) => s.game_state === 1 && s.wave === 1, null, 60000);
    await openNw();
    const i = await nwInfo();
    await closeNw();
    const idx = await H.bridgeLen(page);
    await startBattle();
    const msg = await H.waitBridge(page, idx, { type: "wave_rejected" }, 30000);
    await page.waitForSelector('[data-testid="wave-reject"]', { timeout: 10000 });
    await openNw();
    const j = await nwInfo();
    const onTop = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="next-wave-close"]').getBoundingClientRect();
      const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return el && el.getAttribute("data-testid");
    });
    out.O = { i, j, msg: { wave: msg.wave, missing: msg.missing }, onTop, shot: await H.shot(page, "next-wave-o1-missing") };
    await closeNw();
    await page.locator('[data-testid="wave-reject-close"]').click().catch(() => {});
    run.check("O-1 缺第 2 波：第 1 波清完後的下一波是第 2 波（共 3 波），標成關卡資料沒有這一波、遊戲會拒絕開始（不是沒有下一波）；按迎戰實際被拒絕（missing）後再打開仍是第 2 波，視窗在拒絕提示上方、關閉鈕可按",
      i && i.status === "wave" && i.next === "2" && i.total === "3" && titleOk(i) && /關卡資料沒有第 2 波/.test(i.summary) && /不是沒有下一波/.test(i.summary) &&
        msg.wave === 2 && msg.missing === true && j && j.next === "2" && /關卡資料沒有第 2 波/.test(j.summary) && onTop === "next-wave-close",
      out.O);
  });

  // ── B. 獨立戰鬥頁：自動模式開著視窗跨波 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + N.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    await hookGame(BIFRAME);
    await openNw();
    const i0 = await nwInfo();
    await closeNw();
    await page.locator("button", { hasText: /^自動 (ON|OFF)$/ }).click();
    await waitStats((s) => s.auto_mode === true && s.game_state === 2 && s.wave === 1);
    await openNw();
    const c0 = await cmdLen();
    await waitNw((d) => d && d.dataset.next === "2");
    const i1 = await nwInfo();
    await waitNw((d) => d && d.dataset.next === "3", null, 60000);
    const i2 = await nwInfo();
    await waitNw((d) => d && d.dataset.status === "last", null, 60000);
    const i3 = await nwInfo();
    const autoAll = await page.evaluate(() => (window.__bridgeLog || []).filter((m) => m.type === "update_stats").slice(-6).every((m) => m.auto_mode === true));
    await page.waitForSelector('[data-testid="result-card"]', { timeout: 60000 });
    await H.sleep(500);
    out.B = { i0, i1, i2, i3, autoAll, cmds: await cmdsSince(c0), after: await page.locator('[data-testid="next-wave"]').count(), shot: await H.shot(page, "next-wave-b1-result") };
    run.check("B-1 獨立戰鬥頁：初始備戰是第 1 波；自動模式開著視窗，視窗依序變成第 2 波、第 3 波、已是最後一波（標題與內容一致），自動一直開著；結算時視窗自動關閉；開著的期間沒有送出任何命令",
      i0 && i0.next === "1" && titleOk(i0) && i1 && i1.next === "2" && titleOk(i1) && i2 && i2.next === "3" && titleOk(i2) && /C 快騎 ×1/.test(i2.groups[0]?.text || "") &&
        i3 && i3.status === "last" && autoAll && out.B.after === 0 && out.B.cmds.length === 0,
      out.B);
  });

  // ── N. 390 寬 ──
  await section("N", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.selectStage(page, N.name);
    await dismissSplash(IFRAME);
    const bar = await page.evaluate(() => {
      const vw = window.innerWidth;
      const btns = [...document.querySelectorAll('div[class*="hudActionBar"] button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { text: b.innerText.trim() || b.getAttribute("aria-label"), left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top) };
      });
      return { vw, scrollW: document.documentElement.scrollWidth, btns };
    });
    out.N1 = { bar, shot: await H.shot(page, "next-wave-n1-hud-390") };
    run.check("N-1 390 寬主頁：操作列（迎戰、自動、倍率、暫停、下一波、武將、隊伍）都在畫面內、沒有橫向捲動",
      bar.btns.some((b) => b.text === "下一波") && bar.btns.every((b) => b.left >= 0 && b.right <= bar.vw) && bar.scrollW <= bar.vw, out.N1);

    // 打完兩波，看第 3 波（長名字）
    await startBattle();
    await waitStats((s) => s.game_state === 1 && s.wave === 1, null, 60000);
    await startBattle();
    await waitStats((s) => s.game_state === 1 && s.wave === 2, null, 60000);
    await page.locator('[data-testid="next-wave-open"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="next-wave"]', { timeout: 10000 });
    await H.sleep(300);
    const focus0 = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid"));
    const inside = [];
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press("Tab");
      inside.push(await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('[data-testid="next-wave"]')));
    }
    await page.keyboard.press("Shift+Tab");
    inside.push(await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('[data-testid="next-wave"]')));
    const lay = await page.evaluate((LONG) => {
      const d = document.querySelector('[data-testid="next-wave"]');
      const panel = d.querySelector('[role="dialog"]').getBoundingClientRect();
      const close = d.querySelector('[data-testid="next-wave-close"]').getBoundingClientRect();
      const hit = document.elementFromPoint(close.left + close.width / 2, close.top + close.height / 2);
      const row = [...d.querySelectorAll('[data-testid="preview-group"]')].find((g) => g.innerText.includes(LONG));
      const rr = row ? row.getBoundingClientRect() : null;
      // 名字所在的欄（Bootstrap Row 的負邊距會讓外層多出幾 px，量欄本身）
      const nameEl = row ? [...row.querySelectorAll("strong")].find((x) => x.innerText.includes(LONG)) : null;
      const col = nameEl ? nameEl.parentElement : null;
      const nr = nameEl ? nameEl.getBoundingClientRect() : null;
      const body = d.querySelector('div[class*="modalBody"]');
      const floating = [...document.querySelectorAll("[data-floating-entry]")].map((e) => getComputedStyle(e).visibility);
      return {
        vw: window.innerWidth, vh: window.innerHeight, scrollW: document.documentElement.scrollWidth,
        panel: { left: Math.round(panel.left), right: Math.round(panel.right), top: Math.round(panel.top), bottom: Math.round(panel.bottom) },
        closeHit: hit && hit.getAttribute("data-testid"),
        row: rr && { left: Math.round(rr.left), right: Math.round(rr.right), height: Math.round(rr.height) },
        name: nr && { left: Math.round(nr.left), right: Math.round(nr.right), height: Math.round(nr.height), lineH: parseFloat(getComputedStyle(nameEl).lineHeight) || 20, colScroll: col.scrollWidth, colClient: col.clientWidth },
        bodyScroll: body ? { overflowY: getComputedStyle(body).overflowY, scrollH: body.scrollHeight, clientH: body.clientHeight } : null,
        floating,
      };
    }, LONG);
    const shot = await H.shot(page, "next-wave-n2-dialog-390");
    // 內容可捲：捲到最下面的「關閉」
    await page.locator('[data-testid="next-wave-close-bottom"]').scrollIntoViewIfNeeded();
    const bottomVisible = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="next-wave-close-bottom"]').getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return hit && hit.getAttribute("data-testid");
    });
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-testid="next-wave"]', { state: "detached", timeout: 5000 });
    const focusBack = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("data-testid"));
    out.N2 = { focus0, inside, lay, bottomVisible, focusBack, shot };
    run.check("N-2 390 寬的下一波（第 3 波）：鍵盤開啟時焦點在關閉鈕，Tab／Shift+Tab 都留在視窗內；視窗在畫面內、關閉鈕看得到也點得到；長名字換行不溢出；捲到底的「關閉」可按；全站浮動入口隱藏；Esc 關閉後焦點回到「下一波」",
      focus0 === "next-wave-close" && inside.every(Boolean) && lay.panel.left >= 0 && lay.panel.right <= lay.vw && lay.panel.top >= 0 && lay.scrollW <= lay.vw &&
        lay.closeHit === "next-wave-close" && lay.row && lay.row.left >= lay.panel.left && lay.row.right <= lay.panel.right &&
        lay.name && lay.name.left >= lay.row.left && lay.name.right <= lay.row.right && lay.name.height > lay.name.lineH * 1.5 && lay.name.colScroll <= lay.name.colClient + 1 &&
        lay.bodyScroll && lay.bodyScroll.overflowY === "auto" && bottomVisible === "next-wave-close-bottom" && lay.floating.every((v) => v === "hidden") && focusBack === "next-wave-open",
      out.N2);

    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + N.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const top = await page.evaluate(() => {
      const vw = window.innerWidth;
      const btns = [...document.querySelectorAll('div[class*="battleTopBar"] button')].map((b) => {
        const r = b.getBoundingClientRect();
        return { text: b.innerText.trim() || b.getAttribute("aria-label"), left: Math.round(r.left), right: Math.round(r.right) };
      });
      return { vw, scrollW: document.documentElement.scrollWidth, btns };
    });
    await openNw();
    const bi = await nwInfo();
    const bshot = await H.shot(page, "next-wave-n3-battle-390");
    await closeNw();
    out.N3 = { top, bi, bshot };
    run.check("N-3 390 寬獨立戰鬥頁：頂欄按鈕（含下一波）都在畫面內、沒有橫向捲動；視窗照常打開（第 1 波）",
      top.btns.some((b) => b.text === "下一波") && top.btns.every((b) => b.left >= 0 && b.right <= top.vw) && top.scrollW <= top.vw && bi && bi.next === "1",
      out.N3);
    await page.setViewportSize({ width: 540, height: 900 });
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_nw_fixture")).catch(() => {});
  return run.finish({ out });
}
