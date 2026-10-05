async (page) => {
  // 引擎載入期間先開放既有頂欄（瀏覽器，真 Godot 產物、mock 後端；遊戲的 index.wasm／index.pck 先攔住，引擎停在載入中）
  // - H-1 主頁 1280×800：存檔與設定讀完後頂欄出現（data-hud-phase＝preload）、切換關卡／武將／隊伍／玩家資訊／設定都點得到、
  //   載入動畫仍蓋著遊戲區、沒有迎戰等戰鬥按鈕；遊戲 iframe 沒有收到關卡資料或任何命令
  // - H-2 載入中選關（鍵盤開關卡選擇）：改成 B 關；未解鎖的關卡選不了；兩次快速選關（C→B）以最後一次為準
  // - H-3 載入中調隊伍（移除趙雲並儲存，走既有的保存）：沒有送出 update_team
  // - H-4 開著武將列表時放行引擎：game_ready 後焦點仍在視窗裡（沒有被遊戲畫面搶走），關閉後焦點回到「武將」
  // - H-5 放行後：只送出一次關卡資料，是最後選的 B 關、最新的隊伍（只剩關羽）、目前帳號；Godot 在 B 關備戰中，可以正常迎戰
  // - H-6 390×600／390×844：載入中頂欄在畫面內、點得到，隊伍視窗開得起來
  // - H-7 載入中切換到另一個假帳號：頂欄改成新帳號的關卡；放行後送出的是新帳號與它的進度；載入中離開頁面再回來也正常
  // - H-8 存檔或設定還沒讀完：頂欄不出現；讀完才出現
  // - H-9 設定讀取失敗、瀏覽器沒有 WebGL2：照舊不顯示頂欄，顯示原因與出口，沒有送出關卡資料
  // - H-10 寫入限制中：頂欄照舊（hold），放行後沒有送出關卡資料
  // - H-11 獨立戰鬥頁：載入中只有返回與標題，沒有戰鬥按鈕、沒有送出關卡資料；放行後送出並出現戰鬥按鈕（這一頁沒有改）
  // 全部 mock、虛構金鑰 test_hudpre_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  // 沒有 WebGL2 時 Godot 的外殼頁會試著註冊 Service Worker 而印出錯誤（和 engine-load 的 EL-4 相同）
  const run = H.begin({ expectedConsole: [/MOCK_INJECTED_FAILURE|status of 500/, /Error while registering service worker/, /Service worker already exists/] });
  const out = {};
  const A = "test_hudpre_a";
  const B = "test_hudpre_b";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const profileA = { nickname: "先開頂欄", level: 3, exp: 0, gold: 900, capacity: 30, max_stage: "chapter1_7", heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }] };
  const profileB = { nickname: "另一位", level: 1, exp: 0, gold: 500, capacity: 30, max_stage: "chapter1_2", heroes: [], team: [{ hero_id: "zhao_yun", slot: 1 }] };

  // 遊戲 iframe 收到的訊息（關卡資料、命令）：每個頁框都記，主頁只看遊戲 iframe 的
  await ctx.addInitScript(() => {
    if (window.top === window || window.__hpRecv) return;
    window.__hpRecv = [];
    window.addEventListener("message", (e) => {
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (e.source !== window.parent) return;
      window.__hpRecv.push({ t: Math.round(performance.now()), type: d.type ?? (d.stage_id ? "payload" : null), stage: d.stage_id ?? null, battle: d.battle_id ?? null, key: d.player ? d.player.key : null, team: Array.isArray(d.team_list) ? d.team_list.map((x) => x.hero_id) : null });
    });
  });
  // 沒有 WebGL2 的瀏覽器（H-9）：localStorage.__shenma_hp_no_webgl2 = "1" 時 getContext("webgl2") 回 null
  await ctx.addInitScript(() => {
    let off = false;
    try { off = localStorage.getItem("__shenma_hp_no_webgl2") === "1"; } catch { off = false; }
    if (!off) return;
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      if (type === "webgl2") return null;
      return orig.call(this, type, ...rest);
    };
  });

  // 攔住遊戲的 wasm 與資料包（引擎停在載入中）
  const ENGINE = new RegExp(H.GAME_DIR.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&") + "index\\.(wasm|pck)(\\?[^#]*)?$");
  let holding = false;
  const held = [];
  await ctx.route(ENGINE, (route) => (holding ? held.push(route) : route.continue()));
  const release = async () => {
    holding = false;
    for (const r of held.splice(0)) await r.continue().catch(() => {});
  };

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `hud-preload-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      await release();
      try { await page.keyboard.press("Escape"); } catch { /* 沒有視窗可關 */ }
    }
  };
  const press = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(200);
  };
  const until = async (fn, ms = 30000, what = "條件") => {
    const end = Date.now() + ms;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error("等不到：" + what);
      await H.sleep(150);
    }
  };
  const setup = async (key, extraLocal = {}) => {
    await H.resetOrigin(page);
    await page.evaluate(({ A, B, pa, pb, key, extraLocal }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [A]: pa, [B]: pb }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", key);
      for (const [k, v] of Object.entries(extraLocal)) localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    }, { A, B, pa: profileA, pb: profileB, key, extraLocal });
  };
  // 遊戲 iframe 收到的訊息
  const recv = async (sel = IFRAME) => page.evaluate((sel) => {
    const f = document.querySelector(sel);
    try { return (f && f.contentWindow.__hpRecv) || []; } catch { return null; }
  }, sel);
  // 頂欄與載入的狀態
  const hud = () => page.evaluate(() => {
    const hits = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || r.bottom <= 0 || r.top >= innerHeight || r.right <= 0 || r.left >= innerWidth) return false;
      const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!h && (h === el || el.contains(h));
    };
    const btn = (t) => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === t) || null;
    const bar = document.querySelector("[data-hud-phase]");
    return {
      phase: bar ? bar.dataset.hudPhase : null,
      map: document.querySelector('[class*="hudMapName"]')?.innerText.trim() ?? null,
      loader: !!document.querySelector('[class*="tkLoadingOverlay"]'),
      engineText: document.querySelector('[data-testid="loading-engine"]')?.innerText.trim() ?? null,
      clickable: {
        stage: hits(document.querySelector('[title="切換關卡"]')),
        heroes: hits(btn("武將")),
        team: hits(btn("隊伍")),
        player: hits(document.querySelector('[aria-label="玩家資訊"]')),
        settings: hits(document.querySelector('[title="設定"]')),
      },
      battleButtons: ["迎戰", "戰鬥中", "自動"].filter((t) => !!btn(t)),
      failed: document.querySelector('[data-testid="engine-load-failed"]')?.innerText.replace(/\s+/g, " ").trim() ?? null,
      blocked: document.querySelector('[data-testid^="stage-blocked"]') ? true : false,
      blockedText: document.body.innerText.includes("重新讀取設定"),
      ready: (window.__bridgeLog || []).some((m) => m.type === "game_ready"),
      focusInDialog: !!(document.activeElement && document.activeElement.closest('[role="dialog"]')),
      focusTag: document.activeElement ? document.activeElement.tagName : null,
      focusText: document.activeElement ? (document.activeElement.getAttribute("title") || document.activeElement.getAttribute("aria-label") || document.activeElement.innerText || "").trim().slice(0, 12) : null,
    };
  });
  const payloads = (m) => (m || []).filter((x) => x.type === "payload");
  // 戰鬥命令：關卡資料以外、而且不是請遊戲重送就緒訊息的握手（獨立戰鬥頁掛上監聽時送的 request_ready）
  const commands = (m) => (m || []).filter((x) => x.type && x.type !== "payload" && x.type !== "request_ready");
  // 點卡片上的「選擇關卡」
  const selectStageById = async (mapId) => {
    await page.locator(`[data-testid="stage-card"][data-map-id="${mapId}"]`).getByRole("button", { name: "選擇關卡", exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('[data-testid="stage-filter-bar"]'), null, { timeout: 10000 });
    await H.sleep(300);
  };
  const openStageModal = async () => {
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 10000 });
    await H.sleep(200);
  };
  const waitReady = async () => {
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "game_ready"), null, { timeout: 120000, polling: 200 });
  };

  // ── H-1～H-5 主頁 1280×800 ──
  await section("main", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await setup(A);
    holding = true;
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitPreloadHud(page, 60000);
    await until(async () => held.length > 0, 30000, "引擎的 wasm／資料包被攔住");
    await H.sleep(500);
    const s1 = await hud();
    const m1 = await recv();
    out.H1 = { s1, recv: m1, held: held.length, shot: await H.shot(page, "hud-preload-loading-1280") };
    run.check("H-1 存檔與設定讀完、引擎還在載入：頂欄出現（preload），切換關卡、武將、隊伍、玩家資訊、設定都點得到；載入動畫仍在、沒有戰鬥按鈕；遊戲還沒有 game_ready，iframe 沒有收到關卡資料或任何命令",
      s1.phase === "preload" && Object.values(s1.clickable).every(Boolean) && s1.loader && s1.battleButtons.length === 0 && !s1.ready &&
        Array.isArray(m1) && m1.length === 0 && held.length > 0,
      out.H1);

    // H-2 鍵盤開關卡選擇、選 B 關；未解鎖的選不了；兩次快速選關以最後一次為準
    await page.locator('[title="切換關卡"]').focus();
    await press("Enter");
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 10000 });
    const kb = await hud();
    await selectStageById("chapter1_2");
    const s2 = await hud();
    await openStageModal();
    // 未解鎖的關卡：「尚未解鎖」按鈕停用，強制點了也不會換關
    const lockedBtn = page.locator('[data-testid="stage-card"]', { hasText: "尚未解鎖" }).first().getByRole("button", { name: "尚未解鎖", exact: true });
    const lockedExists = (await lockedBtn.count()) > 0 && (await lockedBtn.isDisabled());
    if (lockedExists) await lockedBtn.click({ force: true }).catch(() => {});
    await H.sleep(300);
    const stillOpen = (await page.locator('[data-testid="stage-filter-bar"]').count()) > 0;
    await press("Escape");
    await page.waitForFunction(() => !document.querySelector('[data-testid="stage-filter-bar"]'), null, { timeout: 10000 });
    const s2b = await hud();
    await openStageModal();
    await selectStageById("chapter1_3");
    await openStageModal();
    await selectStageById("chapter1_2");
    const s2c = await hud();
    const m2 = await recv();
    out.H2 = { kb: { focusInDialog: kb.focusInDialog }, afterB: s2.map, lockedExists, stillOpen, afterLocked: s2b.map, afterQuick: s2c.map, recv: m2 };
    run.check("H-2 載入中用鍵盤打開關卡選擇（焦點在視窗裡）、選 B 關→頂欄是 B 關；點未解鎖的關卡不會換關；快速選 C 再選 B→以最後的 B 為準；遊戲還沒收到任何東西",
      kb.focusInDialog && s2.map === "Mock B 對照關" && lockedExists && stillOpen && s2b.map === "Mock B 對照關" && s2c.map === "Mock B 對照關" && s2c.phase === "preload" &&
        Array.isArray(m2) && m2.length === 0,
      out.H2);

    // H-3 載入中調隊伍：移除趙雲並儲存（既有的保存）
    await page.getByRole("button", { name: "隊伍", exact: true }).focus();
    await press("Enter");
    await page.waitForSelector('[data-testid="team-slot"]', { timeout: 10000 });
    await page.locator('[data-testid="team-slot"][data-hero-id="zhao_yun"] [data-testid="team-slot-remove"]').click();
    await H.sleep(200);
    await page.getByRole("button", { name: "儲存隊伍", exact: true }).click();
    await H.sleep(800);
    await press("Escape");
    // 隊伍存進本機的存檔（照既有規則 30 秒後才同步到後端；送出的關卡資料用的是這份，見 H-5）
    const team = await page.evaluate(() => {
      const st = JSON.parse(sessionStorage.getItem("shenma_player_state") || "null");
      return st ? st.team || (st.player && st.player.team) || null : null;
    });
    const sync3 = await page.evaluate(() => document.querySelector("[data-sync-status]")?.dataset.syncStatus ?? null);
    const m3 = await recv();
    out.H3 = { team: team ? team.map((x) => x.hero_id) : null, sync: sync3, recv: m3 };
    run.check("H-3 載入中在隊伍編排移除趙雲並儲存（走既有的保存）：本機存檔的隊伍只剩關羽；遊戲還沒有這一場，沒有送出 update_team 或其他命令",
      Array.isArray(m3) && m3.length === 0 && same(out.H3.team, ["guan_yu"]), out.H3);

    // H-4 開著武將列表時放行引擎：焦點不被搶走
    await page.getByRole("button", { name: "武將", exact: true }).focus();
    await press("Enter");
    await page.waitForFunction(() => document.activeElement && !!document.activeElement.closest('[role="dialog"]'), null, { timeout: 10000 });
    const beforeRelease = await hud();
    await release();
    await waitReady();
    await H.sleep(1500);
    const afterReady = await hud();
    await press("Escape");
    const afterClose = await hud();
    out.H4 = { beforeRelease: { focusInDialog: beforeRelease.focusInDialog }, afterReady: { focusInDialog: afterReady.focusInDialog, focusTag: afterReady.focusTag, ready: afterReady.ready }, afterClose: { focusText: afterClose.focusText } };
    run.check("H-4 開著武將列表時引擎啟動（game_ready）：焦點仍在視窗裡、沒有跑到遊戲畫面；關閉後焦點回到「武將」",
      beforeRelease.focusInDialog && afterReady.ready && afterReady.focusInDialog && afterReady.focusTag !== "IFRAME" && afterClose.focusText === "武將", out.H4);

    // H-5 送出的是最後選的關卡與最新的隊伍，只送一次；可以正常迎戰
    await H.waitHud(page);
    await until(async () => payloads(await recv()).length > 0, 30000, "送出關卡資料");
    await H.sleep(500);
    const m5 = await recv();
    const snap = await H.snapshot(page);
    await H.dismissSplash(page);
    const idx = await H.bridgeLen(page);
    await H.clickButton(page, "迎戰");
    const fought = await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 }, 30000).then(() => true).catch(() => false);
    const s5 = await hud();
    out.H5 = { payloads: payloads(m5), commandsBeforePayload: m5.slice(0, m5.findIndex((x) => x.type === "payload")).length, snap: { stage: snap.stage, game_state: snap.game_state }, fought, phase: s5.phase };
    const p5 = payloads(m5);
    run.check("H-5 game_ready 後只送出一次關卡資料：B 關（chapter1_2）、隊伍只剩關羽、帳號 A、有新的 battle_id；之前沒有任何命令；Godot 在 B 關備戰中，按迎戰可以開打",
      p5.length === 1 && p5[0].stage === "chapter1_2" && same(p5[0].team, ["guan_yu"]) && p5[0].key === A && !!p5[0].battle &&
        out.H5.commandsBeforePayload === 0 && snap.stage === "chapter1_2" && fought && s5.phase === "battle",
      out.H5);
  });

  // ── H-6 手機尺寸 ──
  await section("mobile", async () => {
    const fit = {};
    for (const vp of [{ width: 390, height: 600 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await setup(A);
      holding = true;
      await page.goto(H.BASE + "/shenmaSanguo");
      await H.waitPreloadHud(page, 60000);
      await until(async () => held.length > 0, 30000, "引擎被攔住");
      await H.sleep(400);
      const s = await hud();
      const loadingShot = await H.shot(page, `hud-preload-loading-390x${vp.height}`);
      await page.getByRole("button", { name: "隊伍", exact: true }).click();
      await page.waitForSelector('[data-testid="team-slot"]', { timeout: 10000 });
      const shot = await H.shot(page, `hud-preload-team-390x${vp.height}`);
      await press("Escape");
      const docScroll = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
      fit[vp.height] = { clickable: s.clickable, loader: s.loader, battle: s.battleButtons, noHScroll: docScroll, recv: (await recv()).length, loadingShot, shot };
      await release();
      await H.waitHud(page);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    out.H6 = fit;
    run.check("H-6 390×600／390×844：載入中頂欄的五個入口都在畫面內、點得到，載入動畫仍在、沒有戰鬥按鈕，隊伍視窗開得起來、沒有橫向捲動，遊戲沒有收到任何東西",
      [600, 844].every((h) => fit[h] && Object.values(fit[h].clickable).every(Boolean) && fit[h].loader && fit[h].battle.length === 0 && fit[h].noHScroll && fit[h].recv === 0), out.H6);
  });

  // ── H-7 載入中切換帳號、離開頁面再回來 ──
  await section("switch", async () => {
    await setup(A);
    holding = true;
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitPreloadHud(page, 60000);
    const before = await hud();
    await page.locator('[aria-label="玩家資訊"]').click();
    await H.clickButton(page, "切換");
    await page.locator('div[class*="modalPanel"] input[placeholder="例：eric_sanguo_2026"]').fill(B);
    await H.clickButton(page, "確認切換");
    await page.waitForFunction(() => {
      const el = document.querySelector('div[class*="modalPanel"] .alert');
      return el && /切換失敗|讀取成功|建立成功/.test(el.innerText);
    }, null, { timeout: 60000, polling: 100 });
    const switchText = await page.locator('div[class*="modalPanel"] .alert').first().innerText();
    await press("Escape");
    await until(async () => (await hud()).map === "Mock B 對照關", 15000, "頂欄換成 B 帳號的關卡");
    const afterSwitch = await hud();
    const m7a = await recv();
    await release();
    await H.waitHud(page);
    await until(async () => payloads(await recv()).length > 0, 30000, "送出關卡資料");
    const m7 = payloads(await recv());
    // 載入中離開頁面再回來
    holding = true;
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitPreloadHud(page, 60000);
    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 60000 });
    await release();
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    const back = await hud();
    out.H7 = { before: before.map, switchText, afterSwitch: afterSwitch.map, recvBefore: m7a.length, payloads: m7, back: back.phase };
    run.check("H-7 載入中從玩家資訊切換到 B 帳號（讀取成功）：頂欄改成 B 的進度（Mock B 對照關），切換時遊戲沒有收到任何東西；放行後送出的是 B 帳號、B 的關卡；載入中離開頁面再回來，正常進入戰場",
      /讀取成功/.test(switchText) && before.map !== null && afterSwitch.map === "Mock B 對照關" && m7a.length === 0 &&
        m7.length === 1 && m7[0].key === B && m7[0].stage === "chapter1_2" && same(m7[0].team, ["zhao_yun"]) && back.phase === "battle",
      out.H7);
  });

  // ── H-8 存檔或設定還沒讀完 ──
  await section("delay", async () => {
    const res = {};
    for (const action of ["get_all_maps", "get_profile"]) {
      await setup(A, { __shenma_mock_hold: [action] });
      holding = true;
      await page.goto(H.BASE + "/shenmaSanguo");
      await until(async () => (await page.evaluate((a) => window.__shenmaMock && window.__shenmaMock.pending(a).length, action)) > 0, 30000, "攔住 " + action);
      await H.sleep(1500);
      const pending = await hud();
      await page.evaluate(() => localStorage.removeItem("__shenma_mock_hold"));
      await page.evaluate((a) => window.__shenmaMock.release(a), action);
      await H.waitPreloadHud(page, 30000);
      const after = await hud();
      res[action] = { pendingPhase: pending.phase, pendingLoader: pending.loader, afterPhase: after.phase };
      await release();
      await H.waitHud(page);
    }
    out.H8 = res;
    run.check("H-8 設定（get_all_maps）或存檔（get_profile）還沒讀完：頂欄不出現、載入動畫照常；讀完後才出現（preload）",
      Object.values(res).every((r) => r.pendingPhase === null && r.pendingLoader && r.afterPhase === "preload"), out.H8);
  });

  // ── H-9 設定讀取失敗、沒有 WebGL2 ──
  await section("failure", async () => {
    await setup(A, { __shenma_mock_fail: { get_all_maps: 9 } });
    await page.goto(H.BASE + "/shenmaSanguo");
    await until(async () => (await hud()).blockedText, 60000, "設定讀取失敗的說明");
    await H.sleep(1000);
    const cf = await hud();
    const mcf = await recv();
    await page.evaluate(() => localStorage.removeItem("__shenma_mock_fail"));
    await setup(A, { __shenma_hp_no_webgl2: "1" });
    await page.goto(H.BASE + "/shenmaSanguo");
    await until(async () => !!(await hud()).failed, 60000, "沒有 WebGL2 的說明");
    const nw = await hud();
    const mnw = await recv();
    await page.evaluate(() => localStorage.removeItem("__shenma_hp_no_webgl2"));
    out.H9 = { configFailed: { phase: cf.phase, blockedText: cf.blockedText, recv: mcf && mcf.length }, noWebgl2: { phase: nw.phase, failed: nw.failed, loader: nw.loader, recv: mnw && mnw.length } };
    run.check("H-9 設定讀取失敗：頂欄照舊不出現、顯示重新讀取設定；沒有 WebGL2：頂欄照舊不出現、說明缺少 WebGL2 與重新載入；兩者都沒有送出關卡資料",
      cf.phase === null && cf.blockedText && (mcf || []).length === 0 && nw.phase === null && /缺少 WebGL2/.test(nw.failed || "") && !nw.loader && (mnw || []).length === 0,
      out.H9);
  });

  // ── H-10 寫入限制中 ──
  await section("hold", async () => {
    await setup(A);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await page.waitForFunction(() => document.querySelector('[data-sync-status="idle"]') !== null, null, { timeout: 90000 });
    await page.evaluate(async () => {
      const s = JSON.parse(sessionStorage.getItem("shenma_player_state"));
      s.migrationHold = { since: Date.now() };
      sessionStorage.setItem("shenma_player_state", JSON.stringify(s));
      for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
      for (const k of await caches.keys()) await caches.delete(k);
    });
    holding = true;
    await page.reload();
    await H.waitHud(page);
    const during = await hud();
    await release();
    await waitReady();
    await H.sleep(1500);
    const after = await hud();
    const m10 = await recv();
    await page.evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem("shenma_player_state"));
      delete s.migrationHold;
      sessionStorage.setItem("shenma_player_state", JSON.stringify(s));
      sessionStorage.removeItem("__site_iso_tab");
    });
    out.H10 = { during: during.phase, after: after.phase, payloads: payloads(m10).length, commands: commands(m10).length };
    run.check("H-10 寫入限制中：頂欄照舊是 hold（不是 preload）；引擎就緒後沒有送出關卡資料或命令（不能開戰）",
      during.phase === "hold" && after.phase === "hold" && out.H10.payloads === 0 && out.H10.commands === 0, out.H10);
  });

  // ── H-11 獨立戰鬥頁（沒有改）──
  await section("battle", async () => {
    await setup(A);
    holding = true;
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_1");
    await until(async () => held.length > 0, 60000, "引擎被攔住");
    await H.sleep(1000);
    const during = await page.evaluate(() => ({
      back: !!document.querySelector('[title="返回關卡選擇"]'),
      battle: [...document.querySelectorAll("button")].filter((b) => /^(迎戰|戰鬥中|自動)/.test(b.innerText.trim())).length,
    }));
    const mb = await recv(BIFRAME);
    await release();
    await until(async () => payloads(await recv(BIFRAME)).length > 0, 60000, "戰鬥頁送出關卡資料");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 30000 });
    const pb = payloads(await recv(BIFRAME));
    out.H11 = { during, recvBefore: mb, payloads: pb };
    run.check("H-11 獨立戰鬥頁：載入中只有返回與標題、沒有戰鬥按鈕，遊戲只收到既有的就緒握手（request_ready），沒有關卡資料或戰鬥命令；放行後送出一次 chapter1_1、出現戰鬥按鈕",
      during.back && during.battle === 0 && Array.isArray(mb) && payloads(mb).length === 0 && commands(mb).length === 0 && pb.length === 1 && pb[0].stage === "chapter1_1", out.H11);
  });

  await release();
  await ctx.unroute(ENGINE).catch(() => {});
  return run.finish({ out });
}
