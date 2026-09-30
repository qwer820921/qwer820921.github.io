async (page) => {
  // 出征前的對空準備提醒（瀏覽器，mock）：兩個關卡選擇入口（主頁的關卡視窗、獨立的關卡頁）與共用的敵軍預覽
  // - 關卡卡片：飛行關顯示「本關有飛行敵人」與目前隊伍的對空能力；缺敵人設定的關卡說明資料不完整；確定的地面關不顯示
  // - 敵軍預覽：列出飛行的波次與隻數（和預覽的合法數量規則相同）、上陣能對空的武將或備案（弓兵塔、文士塔只能減速）、
  //   「不保證能獲勝」；Esc 關閉、焦點回到開啟的按鈕（和既有預覽一致）
  // - 只看上陣的隊伍：沒上陣的弓兵、法師不算；換隊伍（真實點選隊伍視窗／隊伍頁）後內容即時更新；
  //   弓兵（黃忠）、法師（周瑜）能對空，遊戲不認得的職業（忍者，ninja）只打地面
  // - 查看提醒不發任何 GAS 請求、不改 session；沒有對空的隊伍仍可以選擇飛行關、出征（不阻擋）
  // - 390 寬：卡片提醒與預覽都在畫面內、沒有橫向捲動
  // 全部 mock、虛構金鑰 test_airready_*；遊戲不認得職業的武將只在這支腳本加入（__shenma_airready_extra）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H, config } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_airready_a";
  const FLY = "Mock F 飛行混合";
  const UNCLEAR = ["Mock E 無效波", "Mock M 混合組", "Mock Q 缺資料"];
  const GROUND = config.maps.map((m) => m.name).filter((n) => n !== FLY && !UNCLEAR.includes(n));
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const WRITES = ["save_profile", "save_result", "upgrade_hero", "create_profile"];
  const base = config.heroes[0];
  const EXTRA = [{ ...base, hero_id: "ninja_x", name: "忍者", job: "ninja", cost: 3, image: "" }];

  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_airready_extra") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_heroes_config") {
          const res = await inner(input, init);
          const json = await res.json();
          return new Response(JSON.stringify({ ...json, heroes: [...json.heroes, ...extra] }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }
      return inner(input, init);
    };
  }, EXTRA);

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const profile = (team) => ({
    nickname: "對空準備", level: 20, exp: 0, gold: 5000, capacity: 40, max_stage: "chapter2_1", heroes: [],
    team: team.map((hero_id, i) => ({ hero_id, slot: i + 1 })),
  });
  const session = () => page.evaluate(() => sessionStorage.getItem("shenma_player_state"));
  const sessionTeam = () => page.evaluate(() => (JSON.parse(sessionStorage.getItem("shenma_player_state") || "null")?.team || []).slice().sort((a, b) => a.slot - b.slot).map((t) => t.hero_id));
  const logLen = async () => (await H.gasLog(page)).length;
  // 換隊伍之後的同步（save_profile 帶的隊伍就是剛儲存的隊伍）是隊伍儲存本身的寫入，不算提醒造成的
  const notTeamSync = (team) => (e) => !(e.action === "save_profile" && e.saved && same(e.saved.team, team));
  const logSince = async (n) => (await H.gasLog(page)).slice(n);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
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
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `air-readiness-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await page.keyboard.press("Escape"); await closeModals(); } catch { /* 沒有視窗可關 */ }
    }
  };
  const card = (name) => page.locator('div[class*="stageCard"]', { has: page.locator("div", { hasText: new RegExp("^" + name + "$") }) }).first();
  // 每張關卡卡片上的提醒（依關卡名稱）
  const cardNotes = () =>
    page.evaluate((names) => {
      const outp = {};
      for (const c of document.querySelectorAll('div[class*="stageCard"]')) {
        const name = names.find((n) => [...c.querySelectorAll("div")].some((d) => d.innerText.trim() === n));
        if (!name) continue;
        const n = c.querySelector('[data-testid="air-readiness"]');
        outp[name] = n ? { kind: n.getAttribute("data-kind"), team: n.getAttribute("data-team"), air: n.getAttribute("data-air-heroes"), text: n.innerText.replace(/\s+/g, " ").trim() } : null;
      }
      return outp;
    }, config.maps.map((m) => m.name));
  const openPreview = async (name) => {
    await card(name).locator('[data-testid="enemy-preview-open"]').click();
    await page.waitForSelector('[data-testid="enemy-preview"]', { timeout: 10000 });
  };
  const panel = () =>
    page.evaluate(() => {
      const p = document.querySelector('[data-testid="enemy-preview"] [data-testid="air-readiness"]');
      if (!p) return null;
      const t = (id) => p.querySelector(`[data-testid="${id}"]`)?.innerText.replace(/\s+/g, " ").trim() ?? null;
      return {
        kind: p.getAttribute("data-kind"), team: p.getAttribute("data-team"), air: p.getAttribute("data-air-heroes"), role: p.getAttribute("role"),
        waves: t("air-readiness-waves"), teamText: t("air-readiness-team"), incomplete: t("air-readiness-incomplete"), text: p.innerText.replace(/\s+/g, " ").trim(),
      };
    });
  const isOpen = async () => (await page.locator('[data-testid="enemy-preview"]').count()) > 0;
  const openStageList = async () => {
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
    await page.waitForSelector('[data-testid="enemy-preview-open"]', { timeout: 10000 });
  };
  // 隊伍（主頁的隊伍視窗、隊伍頁共用）：清空槽位後依序點選武將，儲存
  const setTeamByUi = async (ids) => {
    await page.waitForSelector('[data-testid="hero-filter-bar"]', { timeout: 15000 });
    for (let i = 0; i < 8; i++) {
      const slot = page.locator('[data-testid="team-slot"][data-hero-id]:not([data-hero-id=""])').first();
      if ((await slot.count()) === 0) break;
      const remove = slot.locator('[data-testid="team-slot-remove"]');
      if ((await remove.count()) > 0) await remove.click();
      else await slot.click();
      await H.sleep(150);
    }
    for (const id of ids) {
      await page.locator(`[data-testid="team-pool-card"][data-hero-id="${id}"]`).click();
      await H.sleep(150);
    }
    await page.getByRole("button", { name: "儲存隊伍" }).click();
    await page.waitForSelector("text=隊伍已儲存", { timeout: 10000 });
  };
  const checkCards = (label, notes, flyWant) => {
    const ground = GROUND.map((n) => [n, notes[n]]);
    const unclear = UNCLEAR.map((n) => [n, notes[n]]);
    run.check(`${label} 飛行關（${FLY}）的卡片：${flyWant.what}`,
      !!notes[FLY] && notes[FLY].kind === "flying" && /本關有飛行敵人/.test(notes[FLY].text) && flyWant.ok(notes[FLY]), notes[FLY]);
    return { ground, unclear };
  };

  // ── M. 主頁的關卡視窗 ──
  await section("M1", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
      localStorage.setItem("__shenma_airready_extra", "1");
    }, { k: KEY, p: profile(["guan_yu", "zhao_yun"]) });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const n0 = await logLen();
    const s0 = await session();
    await openStageList();
    const notes = await cardNotes();
    const { ground, unclear } = checkCards("M-1", notes, {
      what: "隊伍（關羽步兵、趙雲騎兵）沒有能對空的武將，建議調整隊伍或建弓兵塔（設定裡的黃忠、周瑜沒上陣，不算）",
      ok: (n) => n.team === "ready" && n.air === "" && /隊伍沒有能對空的武將/.test(n.text) && /弓兵塔/.test(n.text),
    });
    run.check("M-2 確定的地面關卡不顯示對空提醒；缺敵人設定的關卡（Mock E／M／Q）說明資料不完整、無法確認有沒有飛行敵人",
      ground.length >= 6 && ground.every(([, n]) => n === null) && unclear.every(([, n]) => n && n.kind === "unclear" && /敵軍資料不完整，無法確認有沒有飛行敵人/.test(n.text)),
      { ground, unclear });
    out.M1 = { notes, shot: await H.shot(page, "air-readiness-m1-cards") };

    await openPreview(FLY);
    const p = await panel();
    out.M3 = { p, shot: await H.shot(page, "air-readiness-m3-preview") };
    run.check("M-3 飛行關的敵軍預覽：列出第 1 波飛騎 ×2、第 2 波飛騎 ×3（共 5 隻）；上陣武將都打不到飛行敵人 → 建議調整隊伍、弓兵塔，說明文士塔只能減速、不保證能獲勝",
      !!p && p.kind === "flying" && p.role === "note" && p.waves === "本關有飛行敵人：第 1 波 飛騎 ×2；第 2 波 飛騎 ×3（共 5 隻）" &&
        /都打不到飛行敵人/.test(p.teamText) && /弓兵、法師能對空/.test(p.teamText) && /弓兵塔/.test(p.teamText) && /文士塔只能對飛行敵人減速/.test(p.teamText) &&
        /不保證能獲勝/.test(p.text) && p.incomplete === null,
      p);
    // 鍵盤：Esc 只關預覽，焦點回到開啟它的按鈕
    await page.keyboard.press("Escape");
    await H.sleep(300);
    const focus = await page.evaluate(() => ({ testid: document.activeElement?.getAttribute("data-testid"), stageListOpen: /關卡選擇/.test(document.body.innerText) }));
    const focusCard = await card(FLY).locator('[data-testid="enemy-preview-open"]').evaluate((el) => el === document.activeElement);
    run.check("M-4 Esc 關閉預覽（關卡視窗仍開著），焦點回到飛行關的「敵軍預覽」按鈕", !(await isOpen()) && focus.testid === "enemy-preview-open" && focusCard && focus.stageListOpen, { focus, focusCard });

    await openPreview("Mock M 混合組");
    const pm = await panel();
    await page.locator('[data-testid="enemy-preview-close"]').click();
    await H.sleep(200);
    await openPreview("Mock B 對照關");
    const pg = await panel();
    await page.locator('[data-testid="enemy-preview-close"]').click();
    await H.sleep(200);
    run.check("M-5 缺敵人設定的關卡預覽：標示資料不完整（找不到 mock_missing_config）、無法確認有沒有飛行敵人；地面關卡的預覽沒有對空提醒",
      !!pm && pm.kind === "unclear" && /mock_missing_config/.test(pm.incomplete || "") && /無法確認本關有沒有飛行敵人/.test(pm.incomplete || "") && pg === null,
      { pm, pg });
    const writes = await logSince(n0);
    run.check("M-6 查看卡片與預覽沒有任何 GAS 請求，session 沒有改變", writes.length === 0 && (await session()) === s0, writes);

    // 沒有對空的隊伍仍可以選擇飛行關（提醒不阻擋）
    const idx = await H.bridgeLen(page);
    await card(FLY).getByRole("button", { name: "選擇關卡" }).click();
    const started = await H.waitBridge(page, idx, { type: "update_stats", wave: 0, game_state: 1 }, 60000).then(() => true).catch(() => false);
    const stageName = await page.evaluate(() => /Mock F 飛行混合/.test(document.body.innerText));
    run.check("M-7 隊伍沒有對空時仍可以選擇飛行關：關卡視窗關閉、戰場載入這一關（不阻擋）", started && !(/關卡選擇/.test(await page.evaluate(() => document.body.innerText))) && stageName, { started, stageName });
  });

  // 換隊伍（主頁的隊伍視窗）後，關卡視窗的提醒即時更新
  await section("M8", async () => {
    await H.clickButton(page, "隊伍");
    await setTeamByUi(["guan_yu", "huang_zhong"]);
    await closeModals();
    const team1 = await sessionTeam();
    await openStageList();
    const n1 = (await cardNotes())[FLY];
    await openPreview(FLY);
    const p1 = await panel();
    await page.keyboard.press("Escape");
    await H.sleep(200);
    await closeModals();
    out.M8 = { team1, n1, p1 };
    run.check("M-8 隊伍換成關羽＋黃忠（弓兵）：卡片「隊伍能對空：黃忠」，預覽列出能對空的武將與弓兵塔補強",
      same(team1, ["guan_yu", "huang_zhong"]) && n1 && n1.air === "黃忠" && /隊伍能對空：黃忠/.test(n1.text) &&
        p1 && p1.air === "黃忠" && /目前上陣能對空的武將：黃忠/.test(p1.teamText) && /弓兵塔補強/.test(p1.teamText),
      out.M8);

    await H.clickButton(page, "隊伍");
    await setTeamByUi(["guan_yu", "zhou_yu"]);
    await closeModals();
    const team2 = await sessionTeam();
    await openStageList();
    const n2 = (await cardNotes())[FLY];
    await closeModals();
    out.M9 = { team2, n2 };
    run.check("M-9 隊伍換成關羽＋周瑜（法師）：卡片「隊伍能對空：周瑜」（黃忠已下陣，不算）", same(team2, ["guan_yu", "zhou_yu"]) && n2 && n2.air === "周瑜" && /隊伍能對空：周瑜/.test(n2.text), out.M9);
  });

  // 390 寬：卡片提醒與預覽都在畫面內
  await section("M10", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(400);
    await openStageList();
    await card(FLY).scrollIntoViewIfNeeded();
    const layoutCard = await page.evaluate(() => {
      const n = [...document.querySelectorAll('[data-testid="air-readiness"]')].find((e) => e.getAttribute("data-kind") === "flying");
      const r = n.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth, scroll: document.documentElement.scrollWidth };
    });
    const shotCard = await H.shot(page, "air-readiness-m10-card-390");
    await openPreview(FLY);
    const layoutPanel = await page.evaluate(() => {
      const n = document.querySelector('[data-testid="enemy-preview"] [data-testid="air-readiness"]');
      n.scrollIntoView({ block: "center" });
      const r = n.getBoundingClientRect();
      return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom), vw: window.innerWidth, vh: window.innerHeight, scroll: document.documentElement.scrollWidth };
    });
    const shotPanel = await H.shot(page, "air-readiness-m10-preview-390");
    await page.keyboard.press("Escape");
    await H.sleep(200);
    await closeModals();
    await page.setViewportSize({ width: 540, height: 900 });
    out.M10 = { layoutCard, layoutPanel, shotCard, shotPanel };
    run.check("M-10 390 寬：飛行關卡片的提醒與預覽裡的對空準備都在畫面內，沒有橫向捲動",
      layoutCard.left >= 0 && layoutCard.right <= layoutCard.vw && layoutCard.scroll <= layoutCard.vw &&
        layoutPanel.left >= 0 && layoutPanel.right <= layoutPanel.vw && layoutPanel.top >= 0 && layoutPanel.bottom <= layoutPanel.vh && layoutPanel.scroll <= layoutPanel.vw,
      out.M10);
  });

  // ── S. 獨立的關卡頁（隊伍在隊伍頁更換） ──
  await section("S1", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/team");
    await setTeamByUi(["ninja_x"]);
    const team = await sessionTeam();
    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="enemy-preview-open"]', { timeout: 60000 });
    const n0 = await logLen();
    const s0 = await session();
    const notes = await cardNotes();
    const { ground, unclear } = checkCards("S-1", notes, {
      what: "隊伍只有忍者（遊戲不認得的職業 ninja，照矩陣只打地面）：沒有能對空的武將",
      ok: (n) => n.team === "ready" && n.air === "" && /隊伍沒有能對空的武將/.test(n.text),
    });
    run.check("S-2 關卡頁：隊伍已換成忍者；地面關卡不顯示提醒，缺敵人設定的關卡說明資料不完整",
      same(team, ["ninja_x"]) && ground.every(([, n]) => n === null) && unclear.every(([, n]) => n && n.kind === "unclear"), { team, ground, unclear });
    await openPreview(FLY);
    const p = await panel();
    out.S1 = { notes, p, shot: await H.shot(page, "air-readiness-s1-preview") };
    await page.keyboard.press("Escape");
    await H.sleep(300);
    const back = await card(FLY).locator('[data-testid="enemy-preview-open"]').evaluate((el) => el === document.activeElement);
    run.check("S-3 關卡頁的敵軍預覽：同樣列出飛行波次與隻數、上陣武將都打不到飛行敵人；Esc 關閉後焦點回到按鈕",
      !!p && p.kind === "flying" && p.waves === "本關有飛行敵人：第 1 波 飛騎 ×2；第 2 波 飛騎 ×3（共 5 隻）" && /都打不到飛行敵人/.test(p.teamText) && !(await isOpen()) && back,
      { p, back });
    const writes = (await logSince(n0)).filter(notTeamSync(["ninja_x"]));
    const s1 = await session();
    const sameTeam = JSON.parse(s1 || "null")?.team?.map((t) => t.hero_id);
    run.check("S-4 查看沒有任何 GAS 請求（隊伍頁儲存後的同步除外）、session 的隊伍沒有改變", writes.length === 0 && same(sameTeam, ["ninja_x"]) && (s1 === s0 || same(JSON.parse(s0).team, JSON.parse(s1).team)), writes);
  });

  await section("S5", async () => {
    // 隊伍頁換成黃忠 → 回到關卡頁即時反映；然後直接出征飛行關（不阻擋）
    await page.goto(H.BASE + "/shenmaSanguo/team");
    await setTeamByUi(["huang_zhong"]);
    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="enemy-preview-open"]', { timeout: 60000 });
    const n = (await cardNotes())[FLY];
    run.check("S-5 隊伍頁換成黃忠後，關卡頁的飛行關卡片變成「隊伍能對空：黃忠」", !!n && n.air === "黃忠" && /隊伍能對空：黃忠/.test(n.text), n);
    const n0 = await logLen();
    await card(FLY).getByRole("button", { name: "出 征" }).click();
    await page.waitForURL(/\/shenmaSanguo\/battle\?map=chapter2_1$/, { timeout: 30000 });
    const writes = (await logSince(n0)).filter((e) => WRITES.includes(e.action)).filter(notTeamSync(["huang_zhong"]));
    out.S5 = { n, url: page.url(), writes };
    run.check("S-6 關卡頁的「出 征」照常前往飛行關的戰鬥頁（提醒不阻擋，沒有寫入）", /map=chapter2_1$/.test(page.url()) && writes.length === 0, out.S5);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_airready_extra")).catch(() => {});
  void IFRAME;
  return run.finish({ out });
}
