async (page) => {
  // 隊伍編排的搜尋、職業篩選與排序（瀏覽器）：主頁隊伍視窗與獨立隊伍頁用武將列表同一套控制列與純函式
  // - 只篩選下方可選的武將：出陣槽位照常顯示，搜尋不到已上陣的武將時仍可從槽位移除
  // - 排序（含出陣費用）後點卡片入隊，依 hero_id 加入，不是依列表位置；容量超出時照舊不能儲存
  // - 輸入、切換職業、排序與選擇期間沒有任何 GAS 請求、session 不變（按「儲存隊伍」才走既有的保存）
  // - 法師（周瑜）與遊戲不認得的職業／稀有度：顯示「法師」「其他（原始值）」與原始稀有度，不空白、不當成步兵，
  //   職業篩選「其他」找得到它們；主頁武將視窗與武將頁也一樣
  // - 條件只在畫面記憶體（關閉視窗、離開頁面後恢復預設）；鍵盤可以選卡片與移除槽位；切換帳號後用新帳號的資料；
  //   寫入限制中儲存不會繞過；390×844 窄畫面沒有橫向溢出
  // 全部 mock、虛構金鑰 test_teamfilter_*；額外的武將設定只在這支腳本（__shenma_team_extra_heroes）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H, config } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const A = "test_teamfilter_a";
  const B = "test_teamfilter_b";
  const KEY_INPUT = 'input[placeholder="例：eric_sanguo_2026"]';
  const base = config.heroes[0];
  // 遊戲不認得的職業與稀有度（舊的中文職業「步兵」＋稀有度 SR；healer＋空白稀有度）
  const EXTRA = [
    { ...base, hero_id: "old_sr", name: "舊甲", job: "步兵", rarity: "SR", cost: 3, image: "" },
    { ...base, hero_id: "healer", name: "華佗", job: "healer", rarity: "", cost: 4, image: "" },
  ];
  const ALL = [...config.heroes, ...EXTRA];
  const TOTAL = ALL.length;
  const hero = (hero_id, level, atk) => ({ hero_id, level, star: 0, atk, def: 100, hp: 1000 });
  const PROFILES = {
    [A]: {
      nickname: "隊伍玩家甲", level: 10, exp: 0, gold: 5000, capacity: 20, max_stage: "chapter1_7",
      heroes: [hero("guan_yu", 3, 180), hero("huang_zhong", 2, 160)],
      team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
    },
    [B]: {
      nickname: "隊伍玩家乙", level: 1, exp: 0, gold: 800, capacity: 20, max_stage: "chapter1_7",
      heroes: [hero("zhou_yu", 4, 152)],
      team: [{ hero_id: "zhou_yu", slot: 1 }],
    },
  };

  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_team_extra_heroes") === "1") {
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

  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const sessionPlayer = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `team-filter-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有 Modal 可關 */ }
    }
  };
  const pool = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="team-pool-card"]')].map((c) => ({
        id: c.getAttribute("data-hero-id"),
        pressed: c.getAttribute("aria-pressed"),
        text: c.innerText.replace(/\s+/g, " ").trim(),
      }))
    );
  const poolIds = async () => (await pool()).map((c) => c.id);
  const slots = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('[data-testid="team-slot"]')].map((s) => s.getAttribute("data-hero-id")).filter((x) => x)
    );
  const bar = () =>
    page.evaluate(() => {
      const b = document.querySelector('[data-testid="hero-filter-bar"]');
      if (!b) return null;
      return {
        label: b.getAttribute("aria-label"),
        query: b.querySelector('[data-testid="hero-filter-search"]').value,
        sort: b.querySelector('[data-testid="hero-filter-sort"]').value,
        sorts: [...b.querySelectorAll('[data-testid="hero-filter-sort"] option')].map((o) => o.text),
        jobs: [...b.querySelectorAll('button[aria-pressed]')].map((x) => x.innerText.trim()),
        pressed: [...b.querySelectorAll('button[aria-pressed="true"]')].map((x) => x.innerText.trim()),
        count: b.querySelector('[data-testid="hero-filter-count"]').innerText.trim(),
        empty: !!b.querySelector('[data-testid="hero-filter-empty"]'),
      };
    });
  const search = (t) => page.getByTestId("hero-filter-search").fill(t);
  const job = (v) => page.getByTestId(`hero-filter-job-${v ?? "all"}`).click();
  const sortBy = (v) => page.getByTestId("hero-filter-sort").selectOption(v);
  const clear = () => page.getByTestId("hero-filter-clear").click();
  const card = (id) => page.locator(`[data-testid="team-pool-card"][data-hero-id="${id}"]`);
  const storage = () => page.evaluate(() => ({ session: sessionStorage.getItem("shenma_player_state"), url: location.href }));
  // 預期：依設定順序，出陣費用低→高（同值依設定順序）
  const byDeploy = ALL.map((h, i) => ({ id: h.hero_id, cost: h.cost, i })).sort((a, b) => a.cost - b.cost || a.i - b.i).map((x) => x.id);
  const jobText = (text) => (text.match(/(步兵|弓兵|砲兵|騎兵|法師|其他（[^）]*）)/) || [])[1] || null;
  const measure = () =>
    page.evaluate(() => {
      const vw = window.innerWidth;
      const b = document.querySelector('[data-testid="hero-filter-bar"]');
      const r = b.getBoundingClientRect();
      const panel = b.closest('[class*="modalPanel"]');
      const outside = [...document.querySelectorAll('[data-testid="team-pool-card"],[data-testid="team-slot"],[data-testid="hero-filter-bar"] input,[data-testid="hero-filter-bar"] select,[data-testid="hero-filter-bar"] button')]
        .map((el) => el.getBoundingClientRect())
        .filter((x) => x.width > 0 && (x.left < -0.5 || x.right > vw + 0.5)).length;
      return { vw, docScroll: document.documentElement.scrollWidth, bar: { left: Math.round(r.left), right: Math.round(r.right) }, outside, panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : null };
    });
  const narrowOk = (m) => m.docScroll <= m.vw && m.bar.left >= 0 && m.bar.right <= m.vw && m.outside === 0 && (m.panelOverflow === null || m.panelOverflow <= 0);

  // 共通的一組操作（主頁視窗與隊伍頁各跑一次）
  const exercise = async (label) => {
    const res = {};
    const st0 = await bar();
    const pool0 = await pool();
    const slots0 = await slots();
    res.st0 = st0;
    run.check(`${label}-1 開啟時是預設條件（符合 ${TOTAL} 位／共 ${TOTAL} 位），控制列名稱是「可選武將的搜尋與篩選」；排序有出陣費用；職業有法師與其他；可選武將依設定順序、出陣槽位是目前的隊伍`,
      st0 && st0.label === "可選武將的搜尋與篩選" && st0.count === `符合 ${TOTAL} 位／共 ${TOTAL} 位` && st0.sort === "default" &&
        same(st0.sorts, ["預設順序", "等級 高→低", "攻擊力 高→低", "出陣費用 低→高", "升級費用 低→高"]) &&
        same(st0.jobs, ["全部", "步兵", "弓兵", "砲兵", "騎兵", "法師", "其他"]) &&
        same(pool0.map((c) => c.id), ALL.map((h) => h.hero_id)) && same(slots0, ["guan_yu", "zhao_yun"]),
      { st0, pool0: pool0.map((c) => c.id), slots0 });
    const jobs = Object.fromEntries(pool0.map((c) => [c.id, jobText(c.text)]));
    const zhouColor = await card("zhou_yu").evaluate((el) => {
      const span = [...el.querySelectorAll("span")].find((s) => s.innerText.trim() === "法師");
      return span ? getComputedStyle(span).color : null;
    });
    run.check(`${label}-2 職業顯示：周瑜「法師」（粉紅色）、中文舊值「其他（步兵）」、healer「其他（healer）」；關羽仍是步兵、趙雲騎兵，沒有空白`,
      jobs.zhou_yu === "法師" && zhouColor === "rgb(236, 72, 153)" && jobs.old_sr === "其他（步兵）" && jobs.healer === "其他（healer）" &&
        jobs.guan_yu === "步兵" && jobs.zhao_yun === "騎兵" && Object.values(jobs).every((j) => j),
      { jobs, zhouColor });

    const log0 = (await H.gasLog(page)).length;
    const store0 = await storage();
    await search("華");
    const q = { pool: await poolIds(), slots: await slots(), st: await bar() };
    run.check(`${label}-3 搜尋「華」：可選武將只剩華佗（符合 1 位），出陣槽位的關羽、趙雲照常顯示`,
      same(q.pool, ["healer"]) && same(q.slots, ["guan_yu", "zhao_yun"]) && q.st.count === `符合 1 位／共 ${TOTAL} 位`, q);
    // 搜尋不到的已上陣武將，從槽位移除（主頁視窗用 × 鈕，隊伍頁點槽位）
    if (label === "M") await page.locator('[data-testid="team-slot"][data-hero-id="guan_yu"] [data-testid="team-slot-remove"]').click();
    else await page.locator('[data-testid="team-slot"][data-hero-id="guan_yu"]').click();
    await H.sleep(200);
    const afterRemove = { pool: await poolIds(), slots: await slots() };
    run.check(`${label}-4 搜尋不到關羽時從出陣槽位移除：槽位只剩趙雲，可選列表不變（仍只有華佗）`,
      same(afterRemove.slots, ["zhao_yun"]) && same(afterRemove.pool, ["healer"]), afterRemove);
    await clear();
    await job("mage");
    const mage = await poolIds();
    await job("other");
    const other = await poolIds();
    const otherSt = await bar();
    await job(null);
    run.check(`${label}-5 職業「法師」只有周瑜；「其他」是舊甲與華佗（不認得的職業），不會混進步兵`,
      same(mage, ["zhou_yu"]) && same(other, ["old_sr", "healer"]) && otherSt.count === `符合 2 位／共 ${TOTAL} 位`, { mage, other });
    await sortBy("deploy");
    const sorted = await poolIds();
    await card("huang_zhong").click();
    await H.sleep(200);
    const afterAdd = { slots: await slots(), pressed: await card("huang_zhong").getAttribute("aria-pressed"), atIndex: sorted.indexOf("huang_zhong") };
    run.check(`${label}-6 出陣費用 低→高（舊甲 3、華佗 4、黃忠 6、關羽 8、趙雲 8、周瑜 9；同值依設定順序）；排序後點黃忠 → 加入的是黃忠（依 hero_id），不是該位置原本的武將`,
      same(sorted, byDeploy) && same(afterAdd.slots, ["zhao_yun", "huang_zhong"]) && afterAdd.pressed === "true",
      { sorted, byDeploy, afterAdd });
    // 鍵盤：Enter 選、空白鍵取消
    await card("old_sr").focus();
    await page.keyboard.press("Enter");
    await H.sleep(150);
    const kEnter = await slots();
    await card("old_sr").focus();
    await page.keyboard.press(" ");
    await H.sleep(150);
    const kSpace = await slots();
    const focusable = await card("old_sr").evaluate((el) => ({ tab: el.tabIndex, role: el.getAttribute("role"), active: document.activeElement === el }));
    run.check(`${label}-7 鍵盤：可選武將的卡片可以聚焦（role=button、tabIndex 0），Enter 加入、空白鍵移除`,
      same(kEnter, ["zhao_yun", "huang_zhong", "old_sr"]) && same(kSpace, ["zhao_yun", "huang_zhong"]) && focusable.tab === 0 && focusable.role === "button",
      { kEnter, kSpace, focusable });
    // 容量：甲容量 20；趙雲 8＋黃忠 6＝14，加周瑜 9 → 23 超出
    await card("zhou_yu").click();
    await H.sleep(200);
    const over = await page.evaluate(() => ({
      warn: /超出容量上限/.test(document.body.innerText),
      disabled: [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "儲存隊伍")?.disabled,
    }));
    await card("zhou_yu").click();
    await H.sleep(200);
    const underOk = await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "儲存隊伍")?.disabled === false);
    run.check(`${label}-8 容量：加入周瑜後 23／20 超出 → 顯示超出並停用「儲存隊伍」；移除後恢復可以儲存（容量規則沒有改變）`,
      over.warn && over.disabled === true && underOk, { over, underOk });
    const newLog = (await H.gasLog(page)).slice(log0);
    const store1 = await storage();
    run.check(`${label}-9 搜尋、篩選、排序與選擇期間沒有任何 GAS 請求，session 的存檔與網址都沒有改變（還沒按儲存）`,
      newLog.length === 0 && same(store0, store1), { newLog, changed: store0.session !== store1.session });
    await page.getByRole("button", { name: "儲存隊伍" }).click();
    await page.waitForSelector("text=隊伍已儲存", { timeout: 10000 });
    const saved = (await sessionPlayer()).team.slice().sort((a, b) => a.slot - b.slot).map((t) => t.hero_id);
    run.check(`${label}-10 按「儲存隊伍」才走既有的保存：session 的隊伍變成 趙雲、黃忠（依選擇順序）`,
      same(saved, ["zhao_yun", "huang_zhong"]), { saved });
    res.saved = saved;
    return res;
  };

  // ── M. 主頁隊伍視窗 ──
  await section("M", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", { profiles: JSON.parse(JSON.stringify(PROFILES)), battle_logs: [] });
    await page.evaluate((k) => {
      localStorage.setItem("shenma_player_key", k);
      localStorage.setItem("__shenma_team_extra_heroes", "1");
    }, A);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "隊伍");
    await page.waitForSelector('[data-testid="hero-filter-bar"]');
    out.M = await exercise("M");
    // 關閉再開：條件回到預設
    await search("周");
    await sortBy("atk");
    await page.locator('button[class*="modalClose"]').last().click();
    await H.clickButton(page, "隊伍");
    await page.waitForSelector('[data-testid="hero-filter-bar"]');
    const reopen = await bar();
    run.check("M-11 關閉隊伍視窗再開：搜尋、職業、排序都回到預設",
      reopen.query === "" && reopen.sort === "default" && same(reopen.pressed, ["全部"]) && reopen.count === `符合 ${TOTAL} 位／共 ${TOTAL} 位`, reopen);
    // 窄畫面
    const vp = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(400);
    await search("華");
    const m390 = await measure();
    out.M_390_shot = await H.shot(page, "team-filter-modal-390");
    await clear();
    const m390b = await measure();
    await page.setViewportSize(vp || { width: 540, height: 900 });
    await H.sleep(300);
    run.check("M-12 390×844：隊伍視窗的控制列、可選武將與槽位都在畫面內，頁面與視窗沒有橫向溢出（截圖另存）",
      narrowOk(m390) && narrowOk(m390b), { m390, m390b });
    // × 鈕可以用鍵盤操作
    await page.locator('[data-testid="team-slot"][data-hero-id="huang_zhong"] [data-testid="team-slot-remove"]').focus();
    await page.keyboard.press("Enter");
    await H.sleep(200);
    const kRemove = await slots();
    run.check("M-13 槽位的 × 鈕可以用鍵盤（Enter）移除", same(kRemove, ["zhao_yun"]), { kRemove });
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
  });

  // ── B. 主頁武將視窗與武將頁：法師與不認得的職業／稀有度 ──
  await section("B", async () => {
    await H.clickButton(page, "武將");
    await page.waitForSelector('[data-testid="hero-filter-bar"]');
    const read = () =>
      page.evaluate(() =>
        Object.fromEntries(
          [...document.querySelectorAll('[data-hero-id]')]
            .filter((c) => c.querySelector('[data-testid="hero-job"]'))
            .map((c) => [c.getAttribute("data-hero-id"), {
              job: c.querySelector('[data-testid="hero-job"]').innerText.trim(),
              rarity: c.querySelector('[data-testid="hero-rarity"]')?.innerText.trim() ?? null,
              rarityTitle: c.querySelector('[data-testid="hero-rarity"]')?.getAttribute("title") ?? null,
            }])
        )
      );
    const modal = await read();
    await page.getByTestId("hero-filter-job-other").click();
    const modalOther = await page.evaluate(() => [...document.querySelectorAll('[class*="heroCard"][data-hero-id]')].map((c) => c.getAttribute("data-hero-id")));
    await page.getByTestId("hero-filter-job-mage").click();
    const modalMage = await page.evaluate(() => [...document.querySelectorAll('[class*="heroCard"][data-hero-id]')].map((c) => c.getAttribute("data-hero-id")));
    await page.locator('[class*="heroCard"][data-hero-id="zhou_yu"]').click();
    await page.waitForSelector('[data-testid="hero-detail"]');
    const detail = await page.locator('[data-testid="hero-detail"]').innerText();
    out.B_detail_shot = await H.shot(page, "team-filter-b-detail-mage");
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(200);
    await page.locator('button[class*="modalClose"]').last().click();
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[class*="heroCard"][data-hero-id]');
    const pageCards = await read();
    out.B_page_shot = await H.shot(page, "team-filter-b-heroes-page");
    out.B = { modal, modalOther, modalMage, pageCards };
    const ok = (m) =>
      m.zhou_yu?.job === "法師" && m.old_sr?.job === "其他（步兵）" && m.healer?.job === "其他（healer）" && m.guan_yu?.job === "步兵" &&
      m.old_sr?.rarity === "SR" && m.healer?.rarity === "？" && m.guan_yu?.rarity === "橘" && /遊戲不認得/.test(m.old_sr?.rarityTitle || "") && m.guan_yu?.rarityTitle === null;
    run.check("B-1 主頁武將視窗與武將頁：周瑜顯示法師、不認得的職業顯示「其他（原始值）」、舊稀有度顯示原始值 SR、空白稀有度顯示「？」（並有「遊戲不認得」說明），不空白、不當成步兵",
      ok(modal) && ok(pageCards), out.B);
    run.check("B-2 主頁武將視窗的職業篩選：「其他」找到舊甲與華佗、「法師」找到周瑜；詳情顯示法師",
      same(modalOther, ["old_sr", "healer"]) && same(modalMage, ["zhou_yu"]) && /法師/.test(detail), { modalOther, modalMage, detail: detail.slice(0, 120) });
  });

  // ── P. 獨立隊伍頁 ──
  await section("P", async () => {
    // 回到甲原本的隊伍（關羽、趙雲）再開始
    await setMock("__shenma_mock_gas_db", { profiles: JSON.parse(JSON.stringify(PROFILES)), battle_logs: [] });
    await page.evaluate(() => sessionStorage.removeItem("shenma_player_state"));
    await page.goto(H.BASE + "/shenmaSanguo/team");
    await page.waitForSelector('[data-testid="hero-filter-bar"]', { timeout: 60000 });
    await waitSync("idle");
    out.P = await exercise("P");
    // 槽位用鍵盤移除（隊伍頁的槽位本身是按鈕）
    await page.locator('[data-testid="team-slot"][data-hero-id="huang_zhong"]').focus();
    await page.keyboard.press("Enter");
    await H.sleep(200);
    const kSlot = await slots();
    run.check("P-11 隊伍頁的出陣槽位可以用鍵盤（Enter）移除", same(kSlot, ["zhao_yun"]), { kSlot });
    // 離開再回來：條件回到預設
    await search("周");
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await page.goto(H.BASE + "/shenmaSanguo/team");
    await page.waitForSelector('[data-testid="hero-filter-bar"]');
    const back = await bar();
    run.check("P-12 離開隊伍頁再回來：條件回到預設", back.query === "" && back.sort === "default" && same(back.pressed, ["全部"]), back);
    const vp = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(400);
    await sortBy("deploy");
    const p390 = await measure();
    out.P_390_shot = await H.shot(page, "team-filter-page-390");
    await page.setViewportSize(vp || { width: 540, height: 900 });
    await H.sleep(300);
    run.check("P-13 390×844：隊伍頁的控制列、可選武將與槽位都在畫面內、沒有橫向溢出（截圖另存）", narrowOk(p390), p390);
  });

  // ── S. 切換帳號、寫入限制 ──
  await section("S", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle", 90000);
    await page.locator('button[class*="hudAvatar"]').click();
    await page.waitForSelector("text=玩家資訊");
    await H.clickButton(page, "切換");
    await page.locator('div[class*="modalPanel"] ' + KEY_INPUT).fill(B);
    await H.clickButton(page, "確認切換");
    await page.waitForFunction(() => /存檔讀取成功/.test((document.querySelector('div[class*="modalPanel"] .alert-success') || {}).innerText || ""), null, { timeout: 60000 });
    await page.locator('button[class*="modalClose"]').first().click();
    await H.clickButton(page, "隊伍");
    await page.waitForSelector('[data-testid="hero-filter-bar"]');
    const bSlots = await slots();
    await sortBy("level");
    const bLevel = await poolIds();
    const zhou = (await pool()).find((c) => c.id === "zhou_yu");
    run.check("S-1 切換到乙後打開隊伍視窗：槽位是乙的隊伍（周瑜），依等級排序用乙的等級（周瑜 Lv4 第一），條件是預設開始",
      same(bSlots, ["zhou_yu"]) && bLevel[0] === "zhou_yu" && /Lv\.4/.test(zhou?.text || ""), { bSlots, bLevel, zhou });
    // 寫入限制：分頁標記出現後，選擇與儲存不會繞過
    await page.evaluate(() => {
      window.__siteIsolation = { ...(window.__siteIsolation || {}), lostCopy: true };
    });
    const log0 = (await H.gasLog(page)).length;
    const before = (await sessionPlayer()).team;
    await card("healer").click();
    await page.getByRole("button", { name: "儲存隊伍" }).click();
    await page.waitForSelector('[data-testid="team-hold"]', { timeout: 10000 });
    await H.sleep(1500);
    const after = (await sessionPlayer()).team;
    const disabled = await page.evaluate(() => [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "儲存隊伍")?.disabled);
    const writes = (await H.gasLog(page)).slice(log0).filter((e) => e.action !== "get_profile");
    out.S_hold_shot = await H.shot(page, "team-filter-hold");
    run.check("S-2 寫入限制中（分頁標記）：按「儲存隊伍」不會改隊伍（session 不變）、顯示暫停保存的說明、之後儲存鈕停用，沒有任何寫入",
      same(before, after) && disabled === true && writes.length === 0, { before, after, disabled, writes });
    // 畫面下方固定的提示（這裡是暫停保存）出現時：視窗捲到最下面，「儲存隊伍」不能被提示蓋住
    const coverAt = async (w, h) => {
      await page.setViewportSize({ width: w, height: h });
      await H.sleep(500);
      return page.evaluate(() => {
        const body = [...document.querySelectorAll('div[class*="modalBody"]')].pop();
        body.scrollTop = body.scrollHeight;
        const btn = [...document.querySelectorAll("button")].find((b) => b.innerText.trim() === "儲存隊伍");
        const notices = document.querySelector('div[class*="bottomNotices"]');
        const b = btn.getBoundingClientRect();
        const n = notices ? notices.getBoundingClientRect() : null;
        const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
        return { btnBottom: Math.round(b.bottom), noticeTop: n ? Math.round(n.top) : null, hitIsBtn: hit === btn || btn.contains(hit), vh: window.innerHeight };
      });
    };
    const vp0 = page.viewportSize();
    const cover540 = await coverAt(540, 900);
    const cover390 = await coverAt(390, 844);
    out.S_cover_shot = await H.shot(page, "team-filter-notice-space-390");
    await page.setViewportSize(vp0 || { width: 540, height: 900 });
    await H.sleep(300);
    run.check("S-3 畫面下方有固定的提示時，隊伍視窗捲到最下面，「儲存隊伍」在提示上方、點得到（540×900 與 390×844）",
      [cover540, cover390].every((c) => c.noticeTop !== null && c.btnBottom <= c.noticeTop && c.hitIsBtn), { cover540, cover390 });
    await page.locator('button[class*="modalClose"]').last().click();
  });

  // 寫入限制的標記與額外的武將設定不留給之後的腳本
  await H.resetOrigin(page).catch(() => {});
  return run.finish({ out });
}
