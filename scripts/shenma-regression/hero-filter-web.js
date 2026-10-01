async (page) => {
  // 武將列表的搜尋、職業篩選與排序（瀏覽器）：主頁武將視窗與獨立武將頁用同一套規則（utils/heroFilter.ts）與同一個控制列
  // - 搜尋名稱或 id（去頭尾空白、英文不分大小寫）、職業（全部／步兵／弓兵／砲兵／騎兵／法師／其他）、組合、符合數、清除條件、無結果提示
  // - 排序：預設順序、等級高→低、攻擊力高→低、升級費用低→高；每次都和測試自己依 mock 後端資料算出的順序比對（同值維持原順序）
  // - 輸入、切換職業與排序期間沒有任何 GAS 請求、session 與 localStorage 不變、網址不變、隊伍不變
  // - 條件只在畫面記憶體：關閉視窗再開、離開武將頁再回來都回到預設
  // - 升級後排序立即反映新數值，打開的詳情仍是同一位武將（不因排序跳到別人）
  // - 切換帳號後以新帳號的資料重算（等級不是舊帳號的）
  // - 有標籤、鍵盤可操作、清除後焦點回到搜尋框；390×844 窄畫面沒有橫向溢出
  // 全部 mock、虛構金鑰 test_herofilter_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H, config } = S;
  const run = H.begin();
  const out = {};
  const A = "test_herofilter_a";
  const B = "test_herofilter_b";
  const KEY_INPUT = 'input[placeholder="例：eric_sanguo_2026"]';
  const CARD = '[class*="heroCard"][data-hero-id]';
  const DEFAULT_IDS = config.heroes.map((h) => h.hero_id); // 關羽、趙雲、黃忠、周瑜
  const TOTAL = DEFAULT_IDS.length;
  const hero = (hero_id, level, atk) => ({ hero_id, level, star: 0, atk, def: 100, hp: 1000 });
  const PROFILES = {
    // A：關羽 Lv2、黃忠 Lv3 有升級紀錄；趙雲、周瑜沒有（Lv1、基礎攻擊 150／122）
    [A]: {
      nickname: "篩選玩家甲", level: 1, exp: 0, gold: 5000, capacity: 11, max_stage: "chapter1_7",
      heroes: [hero("guan_yu", 2, 160), hero("huang_zhong", 3, 170)],
      team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
    },
    // B：關羽 Lv5、周瑜 Lv4；趙雲、黃忠沒有紀錄
    [B]: {
      nickname: "篩選玩家乙", level: 1, exp: 0, gold: 800, capacity: 11, max_stage: "chapter1_7",
      heroes: [hero("guan_yu", 5, 190), hero("zhou_yu", 4, 152)],
      team: [{ hero_id: "zhou_yu", slot: 1 }],
    },
  };

  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  // 畫面目前使用的玩家資料（store 寫在 session 的那一份）：有未同步的本機升級時和後端不同
  const sessionPlayer = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
  // 等 session 的同步狀態回到 idle（例如重新載入後補送未同步修改的保存完成），再開始量測「零請求」
  const waitSessionIdle = (timeout = 60000) =>
    page.waitForFunction(() => {
      try { return JSON.parse(sessionStorage.getItem("shenma_player_state") || "null")?.syncStatus === "idle"; } catch { return false; }
    }, null, { timeout, polling: 100 });
  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `hero-filter-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有 Modal 可關 */ }
    }
  };

  // 測試自己的預期結果（不呼叫頁面的程式）：沒有升級紀錄＝Lv1、基礎攻擊；費用＝每級費用 × 等級；同值依設定順序
  const expected = (profile, { query = "", job = null, sort = "default" } = {}) => {
    const q = query.trim().toLowerCase();
    const rows = config.heroes.map((c, index) => {
      const h = (profile.heroes || []).find((x) => x.hero_id === c.hero_id) || { level: 1, atk: c.base_atk };
      return { id: c.hero_id, level: h.level, atk: h.atk, cost: c.upgrade_cost_base * h.level, index, c };
    });
    const hit = rows.filter((r) => (job === null || r.c.job === job) && (q === "" || r.c.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q)));
    const k = { level: (r) => -r.level, atk: (r) => -r.atk, cost: (r) => r.cost }[sort];
    if (k) hit.sort((a, b) => k(a) - k(b) || a.index - b.index);
    return hit.map((r) => r.id);
  };
  const cards = () =>
    page.evaluate((sel) => [...document.querySelectorAll(sel)].map((c) => ({
      id: c.getAttribute("data-hero-id"),
      lv: Number((c.innerText.match(/Lv\.(\d+)/) || [])[1]),
      inTeam: /在隊中/.test(c.innerText),
    })), CARD);
  const ids = async () => (await cards()).map((c) => c.id);
  const bar = () =>
    page.evaluate(() => {
      const b = document.querySelector('[data-testid="hero-filter-bar"]');
      if (!b) return null;
      const q = b.querySelector('[data-testid="hero-filter-search"]');
      const s = b.querySelector('[data-testid="hero-filter-sort"]');
      const empty = b.querySelector('[data-testid="hero-filter-empty"]');
      return {
        query: q.value,
        sort: s.value,
        pressed: [...b.querySelectorAll('button[aria-pressed="true"]')].map((x) => x.innerText.trim()),
        clearDisabled: b.querySelector('[data-testid="hero-filter-clear"]').disabled,
        count: (b.querySelector('[data-testid="hero-filter-count"]') || {}).innerText?.trim() ?? null,
        empty: empty ? empty.innerText.trim() : null,
        active: document.activeElement ? document.activeElement.getAttribute("data-testid") : null,
      };
    });
  const isDefault = (st) =>
    !!st && st.query === "" && st.sort === "default" && JSON.stringify(st.pressed) === '["全部"]' &&
    st.clearDisabled === true && st.count === `符合 ${TOTAL} 位／共 ${TOTAL} 位` && st.empty === null;
  const search = (text) => page.getByTestId("hero-filter-search").fill(text);
  const job = (value) => page.getByTestId(`hero-filter-job-${value ?? "all"}`).click();
  const sortBy = (value) => page.getByTestId("hero-filter-sort").selectOption(value);
  const clear = () => page.getByTestId("hero-filter-clear").click();
  const storageSnapshot = () =>
    page.evaluate(() => ({
      session: Object.keys(sessionStorage).sort().map((k) => [k, sessionStorage.getItem(k)]),
      localKeys: Object.keys(localStorage).sort(),
      url: location.href,
    }));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  // 兩次快照之間改變的 session 項目（JSON 的話列出改變的欄位與前後值）
  const sessionDiff = (a, b) => {
    const A1 = Object.fromEntries(a.session), B1 = Object.fromEntries(b.session);
    const diff = [];
    for (const k of new Set([...Object.keys(A1), ...Object.keys(B1)])) {
      if (A1[k] === B1[k]) continue;
      let fields = null;
      try {
        const x = JSON.parse(A1[k]), y = JSON.parse(B1[k]);
        fields = [...new Set([...Object.keys(x || {}), ...Object.keys(y || {})])]
          .filter((f) => JSON.stringify(x?.[f]) !== JSON.stringify(y?.[f]))
          .map((f) => ({ f, before: JSON.stringify(x?.[f])?.slice(0, 200), after: JSON.stringify(y?.[f])?.slice(0, 200) }));
      } catch { /* 不是 JSON */ }
      diff.push({ k, fields, before: fields ? undefined : String(A1[k]).slice(0, 200), after: fields ? undefined : String(B1[k]).slice(0, 200) });
    }
    return diff;
  };

  // 一組搜尋／職業／排序操作：每一步都和預期比對；回傳每一步的結果
  const exercise = async (label, profile) => {
    const steps = [];
    const step = async (name, crit, act) => {
      await act();
      await H.sleep(120);
      const got = await ids();
      const st = await bar();
      const want = expected(profile, crit);
      const count = `符合 ${want.length} 位／共 ${TOTAL} 位`;
      steps.push({ name, ok: same(got, want) && st.count === count && (want.length === 0) === (st.empty !== null), got, want, count: st.count, empty: st.empty });
    };
    await step("id 大寫 ZHAO", { query: "ZHAO" }, () => search("ZHAO"));
    await step("名稱加頭尾空白「  關 」", { query: "  關 " }, () => search("  關 "));
    await step("部分 id zh", { query: "zh" }, () => search("zh"));
    await step("zh＋騎兵", { query: "zh", job: "cavalry" }, () => job("cavalry"));
    await step("zh＋砲兵（空結果）", { query: "zh", job: "artillery" }, () => job("artillery"));
    await step("清除條件", {}, () => clear());
    await step("弓兵", { job: "archer" }, () => job("archer"));
    await step("全部職業", {}, () => job(null));
    for (const s of ["level", "atk", "cost", "default"]) await step(`排序 ${s}`, { sort: s }, () => sortBy(s));
    await step("步兵＋依等級", { job: "infantry", sort: "level" }, async () => { await job("infantry"); await sortBy("level"); });
    await step("清除條件（第二次）", {}, () => clear());
    out[label + "_steps"] = steps;
    return steps;
  };

  // ── A. 主頁武將視窗 ──
  await section("A", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", { profiles: JSON.parse(JSON.stringify(PROFILES)), battle_logs: [] });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), A);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('[data-testid="hero-filter-bar"]');
    const st0 = await bar();
    const cards0 = await cards();
    run.check("A-1 主頁武將視窗開啟時是預設條件（空白搜尋、全部職業、預設順序、清除停用、符合 4 位／共 4 位），四位武將依設定順序；在隊中的關羽、趙雲照常顯示",
      isDefault(st0) && same(cards0.map((c) => c.id), DEFAULT_IDS) && cards0.filter((c) => c.inTeam).map((c) => c.id).join() === "guan_yu,zhao_yun",
      { st0, cards0 });
    const a11y = await page.evaluate(() => {
      const b = document.querySelector('[data-testid="hero-filter-bar"]');
      const q = b.querySelector('[data-testid="hero-filter-search"]');
      const s = b.querySelector('[data-testid="hero-filter-sort"]');
      const g = b.querySelector('[role="group"]');
      const gl = g && document.getElementById(g.getAttribute("aria-labelledby"));
      return {
        searchLabel: q.labels.length ? q.labels[0].innerText.trim() : null,
        sortLabel: s.labels.length ? s.labels[0].innerText.trim() : null,
        groupLabel: gl ? gl.innerText.trim() : null,
        jobButtons: [...g.querySelectorAll("button")].map((x) => [x.innerText.trim(), x.type, x.getAttribute("aria-pressed")]),
        sortOptions: [...s.options].map((o) => o.text),
        role: b.getAttribute("role"),
        live: b.querySelector('[data-testid="hero-filter-count"]').getAttribute("aria-live"),
      };
    });
    out.A_a11y = a11y;
    run.check("A-2 控制列有標籤：搜尋框「搜尋武將」、排序「排序」、職業按鈕群組「職業」；職業按鈕（全部、五種職業含法師、其他）是 button 並標示按下狀態；排序四個選項；符合數會朗讀",
      a11y.searchLabel === "搜尋武將" && a11y.sortLabel === "排序" && a11y.groupLabel === "職業" &&
        same(a11y.jobButtons.map((x) => x[0]), ["全部", "步兵", "弓兵", "砲兵", "騎兵", "法師", "其他"]) && a11y.jobButtons.every((x) => x[1] === "button" && /^(true|false)$/.test(x[2])) &&
        same(a11y.sortOptions, ["預設順序", "等級 高→低", "攻擊力 高→低", "升級費用 低→高"]) && a11y.role === "search" && a11y.live === "polite",
      a11y);

    const before = await storageSnapshot();
    const log0 = (await H.gasLog(page)).length;
    const steps = await exercise("A", PROFILES[A]);
    const focusAfterClear = (await bar()).active;
    await H.sleep(1500);
    const after = await storageSnapshot();
    const newLog = (await H.gasLog(page)).slice(log0);
    run.check("A-3 搜尋、職業、組合、空結果、清除與四種排序：每一步的順序都和依後端資料算出的預期相同（同值維持原順序），符合數與無結果提示正確",
      steps.length === 14 && steps.every((s) => s.ok), steps.filter((s) => !s.ok));
    run.check("A-4 空結果：顯示「符合 0 位／共 4 位」與無結果提示（說明可按清除條件），沒有武將卡片",
      steps.some((s) => s.name.includes("空結果") && s.ok && s.count === `符合 0 位／共 ${TOTAL} 位` && /清除條件/.test(s.empty || "")),
      steps.find((s) => s.name.includes("空結果")));
    run.check("A-5 操作期間沒有任何 GAS 請求（包含讀取），session、localStorage 的鍵與網址都沒有改變（條件不寫存檔）",
      newLog.length === 0 && same(before, after), { newLog, before: before.localKeys, after: after.localKeys, sessionDiff: sessionDiff(before, after), url: after.url });
    run.check("A-6 清除條件後焦點回到搜尋框", focusAfterClear === "hero-filter-search", { focusAfterClear });

    // 鍵盤：搜尋框 → Tab 到排序 → 清除 → 職業按鈕；Enter 切換職業；焦點在清除鈕時按 Enter 清除
    await page.getByTestId("hero-filter-search").focus();
    await page.keyboard.type("u");
    const tabs = [];
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      tabs.push((await bar()).active);
    }
    // 目前焦點在「弓兵」：Enter 套用
    await page.keyboard.press("Enter");
    await H.sleep(150);
    const kbArcher = { st: await bar(), ids: await ids() };
    await page.getByTestId("hero-filter-clear").focus();
    await page.keyboard.press("Enter");
    await H.sleep(150);
    const kbClear = await bar();
    out.A_keyboard = { tabs, kbArcher, kbClear };
    run.check("A-7 鍵盤操作：Tab 依序到排序、清除、全部、步兵、弓兵；在弓兵按 Enter 套用（u＋弓兵 → 黃忠）；在清除鈕按 Enter 回到預設、焦點到搜尋框",
      same(tabs, ["hero-filter-sort", "hero-filter-clear", "hero-filter-job-all", "hero-filter-job-infantry", "hero-filter-job-archer"]) &&
        same(kbArcher.st.pressed, ["弓兵"]) && same(kbArcher.ids, ["huang_zhong"]) && isDefault(kbClear) && kbClear.active === "hero-filter-search",
      out.A_keyboard);

    // 關閉再開 → 預設
    await search("關");
    await job("infantry");
    await sortBy("atk");
    const beforeClose = await bar();
    await page.locator('button[class*="modalClose"]').first().click();
    await page.waitForSelector('[data-testid="hero-filter-bar"]', { state: "detached" });
    await H.clickButton(page, "武將");
    await page.waitForSelector('[data-testid="hero-filter-bar"]');
    const reopened = await bar();
    run.check("A-8 關閉武將視窗再打開：條件回到預設、四位依設定順序",
      beforeClose.query === "關" && beforeClose.sort === "atk" && isDefault(reopened) && same(await ids(), DEFAULT_IDS),
      { beforeClose, reopened });

    // 升級後排序即時反映、詳情不跳人：依等級排序，打開周瑜（Lv1、排最後）連升兩級
    await sortBy("level");
    const lv0 = await ids();
    await page.locator(`${CARD}[data-hero-id="zhou_yu"]`).click();
    await page.waitForSelector('[data-testid="hero-detail"][data-hero-id="zhou_yu"]');
    const orders = [lv0];
    const details = [];
    for (let n = 2; n <= 3; n++) {
      await page.locator('[data-testid="hero-detail"] button', { hasText: /^升級 \(-/ }).click();
      await page.waitForFunction((n) => {
        const d = document.querySelector('[data-testid="hero-detail"]');
        return d && d.getAttribute("data-hero-level") === String(n) && /升級成功/.test(d.innerText);
      }, n, { timeout: 30000 });
      await H.sleep(200);
      orders.push(await ids());
      details.push(await page.evaluate(() => {
        const d = document.querySelector('[data-testid="hero-detail"]');
        return { id: d.getAttribute("data-hero-id"), level: d.getAttribute("data-hero-level"), title: (d.querySelector('[class*="modalTitle"]') || {}).innerText };
      }));
    }
    const p = await sessionPlayer();
    const stUp = await bar();
    const upgradeLog = (await H.gasLog(page)).filter((e) => e.action === "upgrade_hero").map((e) => ({ status: e.status, key: e.key }));
    out.A_upgrade = { orders, details, gold: p.gold, heroes: p.heroes, backendHeroes: (await db()).profiles[A].heroes, upgradeLog };
    run.check("A-9 依等級排序時連升周瑜兩級：順序依序是 黃忠3／關羽2／趙雲1／周瑜1 → 黃忠3／關羽2／周瑜2／趙雲1 → 黃忠3／周瑜3／關羽2／趙雲1（同值維持原順序），和畫面目前的玩家資料算出的預期相同",
      same(orders[0], ["huang_zhong", "guan_yu", "zhao_yun", "zhou_yu"]) && same(orders[1], ["huang_zhong", "guan_yu", "zhou_yu", "zhao_yun"]) &&
        same(orders[2], ["huang_zhong", "zhou_yu", "guan_yu", "zhao_yun"]) && same(orders[2], expected(p, { sort: "level" })) && stUp.sort === "level",
      out.A_upgrade);
    run.check("A-10 升級過程中打開的詳情一直是周瑜（id 與標題），等級跟著變成 2、3",
      details.every((d) => d.id === "zhou_yu" && d.title === "周瑜") && same(details.map((d) => d.level), ["2", "3"]),
      details);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(200);
    await page.locator('button[class*="modalClose"]').first().click();
    out.A_shot = await H.shot(page, "hero-filter-a-main-closed");
  });

  // ── B. 獨立武將頁 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-filter-bar"]');
    await page.waitForSelector(CARD);
    const st0 = await bar();
    run.check("B-1 武將頁用同一個控制列，開啟時是預設條件，四位依設定順序",
      isDefault(st0) && same(await ids(), DEFAULT_IDS), st0);
    await waitSessionIdle();
    const profile = await sessionPlayer();
    const before = await storageSnapshot();
    const log0 = (await H.gasLog(page)).length;
    const steps = await exercise("B", profile);
    await H.sleep(1500);
    const after = await storageSnapshot();
    const newLog = (await H.gasLog(page)).slice(log0);
    run.check("B-2 武將頁的搜尋、職業、組合、空結果、清除與排序：和主頁同一套規則，每一步都和預期相同",
      steps.length === 14 && steps.every((s) => s.ok), steps.filter((s) => !s.ok));
    run.check("B-3 武將頁操作期間沒有任何 GAS 請求，session、localStorage 的鍵與網址不變",
      newLog.length === 0 && same(before, after), { newLog, sessionDiff: sessionDiff(before, after), url: after.url });

    // 依升級費用排序，升級趙雲（費用最低、排第一）：費用變成 200 後排到關羽之後
    await sortBy("cost");
    const c0 = await ids();
    await page.locator(`${CARD}[data-hero-id="zhao_yun"]`).click();
    await page.waitForSelector('[data-testid="hero-detail"][data-hero-id="zhao_yun"]');
    await page.locator('[data-testid="hero-detail"] button', { hasText: /^升級 \(-/ }).click();
    await page.waitForFunction(() => {
      const d = document.querySelector('[data-testid="hero-detail"]');
      return d && d.getAttribute("data-hero-level") === "2" && /升級成功/.test(d.innerText);
    }, null, { timeout: 30000 });
    await H.sleep(200);
    const c1 = await ids();
    const detail = await page.evaluate(() => {
      const d = document.querySelector('[data-testid="hero-detail"]');
      return { id: d.getAttribute("data-hero-id"), level: d.getAttribute("data-hero-level"), text: d.innerText.slice(0, 40) };
    });
    const p = await sessionPlayer();
    out.B_upgrade = { c0, c1, detail, heroes: p.heroes };
    run.check("B-4 依升級費用排序時升級趙雲：趙雲 100 排第一 → 升到 Lv2（200）後排在同為 200 的關羽之後；詳情仍是趙雲 Lv2",
      same(c0, ["zhao_yun", "guan_yu", "huang_zhong", "zhou_yu"]) && same(c1, ["guan_yu", "zhao_yun", "huang_zhong", "zhou_yu"]) &&
        same(c1, expected(p, { sort: "cost" })) && detail.id === "zhao_yun" && detail.level === "2" && /趙雲/.test(detail.text),
      out.B_upgrade);
    await page.keyboard.press("Escape");
    await page.waitForSelector('[data-testid="hero-detail"]', { state: "detached" });

    // 離開再回來 → 預設（用頁面上的「回主選單」離開，瀏覽器返回回到武將頁）
    await search("黃");
    await job("archer");
    await sortBy("atk");
    const beforeLeave = await bar();
    await H.clickButton(page, "← 回主選單");
    await page.waitForURL((u) => /\/shenmaSanguo\/?$/.test(new URL(u).pathname), { timeout: 30000 });
    await page.goBack();
    await page.waitForSelector('[data-testid="hero-filter-bar"]');
    await page.waitForSelector(CARD);
    const back = await bar();
    run.check("B-5 離開武將頁再回來：條件回到預設、網址沒有帶條件",
      beforeLeave.query === "黃" && same(beforeLeave.pressed, ["弓兵"]) && isDefault(back) && same(await ids(), DEFAULT_IDS) && !/[?&](q|job|sort)=/.test(page.url()),
      { beforeLeave, back, url: page.url() });
  });

  // ── C. 切換帳號後以新帳號的資料重算 ──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('[data-testid="hero-filter-bar"]');
    await sortBy("level");
    const aCards = await cards();
    const aPlayer = await sessionPlayer();
    await page.locator('button[class*="modalClose"]').first().click();
    await page.locator('button[class*="hudAvatar"]').click();
    await page.waitForSelector("text=玩家資訊");
    await H.clickButton(page, "切換");
    await page.locator('div[class*="modalPanel"] ' + KEY_INPUT).fill(B);
    await H.clickButton(page, "確認切換");
    await page.waitForFunction(() => /存檔讀取成功/.test((document.querySelector('div[class*="modalPanel"] .alert-success') || {}).innerText || ""), null, { timeout: 60000 });
    await page.locator('button[class*="modalClose"]').first().click();
    await H.clickButton(page, "武將");
    await page.waitForSelector('[data-testid="hero-filter-bar"]');
    const stB = await bar();
    await sortBy("level");
    const bCards = await cards();
    await sortBy("atk");
    const bAtk = await ids();
    await page.locator('button[class*="modalClose"]').first().click();
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector(CARD);
    await sortBy("level");
    const bPage = await cards();
    const pB = PROFILES[B];
    out.C = { aCards, stB, bCards, bAtk, bPage };
    run.check("C-1 切換帳號前（甲）依等級：黃忠 Lv3、周瑜 Lv3、關羽 Lv2、趙雲 Lv2，和甲目前的資料算出的預期相同",
      same(aCards.map((c) => c.id), expected(aPlayer, { sort: "level" })) && same(aCards.map((c) => c.id), ["huang_zhong", "zhou_yu", "guan_yu", "zhao_yun"]),
      { aCards, aPlayer: aPlayer.heroes });
    run.check("C-2 切換到乙後重新打開主頁武將視窗：條件是預設；依等級是 關羽 Lv5、周瑜 Lv4、趙雲 Lv1、黃忠 Lv1（乙的資料，不是甲的等級）；依攻擊力是 關羽 190、周瑜 152、趙雲 150、黃忠 150",
      isDefault(stB) && same(bCards.map((c) => c.id), expected(pB, { sort: "level" })) && same(bCards.map((c) => c.lv), [5, 4, 1, 1]) &&
        same(bAtk, expected(pB, { sort: "atk" })) && same(bAtk, ["guan_yu", "zhou_yu", "zhao_yun", "huang_zhong"]),
      out.C);
    run.check("C-3 武將頁也顯示乙的資料（依等級 關羽 Lv5、周瑜 Lv4、趙雲 Lv1、黃忠 Lv1）",
      same(bPage.map((c) => c.id), expected(pB, { sort: "level" })) && same(bPage.map((c) => c.lv), [5, 4, 1, 1]), bPage);
  });

  // ── D. 窄畫面（390×844）──
  await section("D", async () => {
    const vp = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    // 職業按鈕有 0.15 秒的顏色轉場：等轉場結束再量測與截圖，避免截到新舊按鈕各半的狀態
    const measure = async () => {
      await H.sleep(350);
      return page.evaluate(() => {
        const vw = window.innerWidth;
        const b = document.querySelector('[data-testid="hero-filter-bar"]');
        const r = b.getBoundingClientRect();
        const ctrls = [...b.querySelectorAll("input,select,button")].map((el) => {
          const x = el.getBoundingClientRect();
          return { t: el.getAttribute("data-testid"), left: Math.round(x.left), right: Math.round(x.right) };
        });
        const panel = b.closest('[class*="modalPanel"]');
        const label = b.querySelector("label");
        return {
          vw,
          docScroll: document.documentElement.scrollWidth,
          bar: { left: Math.round(r.left), right: Math.round(r.right) },
          outside: ctrls.filter((c) => c.left < 0 || c.right > vw),
          panelOverflow: panel ? panel.scrollWidth - panel.clientWidth : null,
          labelPx: label ? parseFloat(getComputedStyle(label).fontSize) : null,
          countPx: parseFloat(getComputedStyle(b.querySelector('[data-testid="hero-filter-count"]')).fontSize),
        };
      });
    };
    // 武將頁（目前在這一頁）
    await page.reload();
    await page.waitForSelector(CARD);
    await search("zh");
    const pageM = await measure();
    out.D_page_shot = await H.shot(page, "hero-filter-d-narrow-heroes-page");
    await job("artillery");
    const pageEmpty = await measure();
    out.D_page_empty_shot = await H.shot(page, "hero-filter-d-narrow-heroes-page-empty");
    // 主頁武將視窗
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[data-testid="hero-filter-bar"]');
    await search("zh");
    await job("cavalry");
    const modalM = await measure();
    out.D_modal_shot = await H.shot(page, "hero-filter-d-narrow-modal");
    await job("artillery");
    const modalEmpty = await measure();
    out.D_modal_empty_shot = await H.shot(page, "hero-filter-d-narrow-modal-empty");
    await page.locator('button[class*="modalClose"]').first().click();
    await page.setViewportSize(vp || { width: 540, height: 900 });
    await H.sleep(300);
    out.D = { pageM, pageEmpty, modalM, modalEmpty };
    const ok = (m) => m.docScroll <= m.vw && m.bar.left >= 0 && m.bar.right <= m.vw && m.outside.length === 0 && (m.panelOverflow === null || m.panelOverflow <= 0) && m.labelPx >= 12 && m.countPx >= 12;
    run.check("D-1 390×844：武將頁與主頁武將視窗的控制列（含無結果提示）都在畫面寬度內、頁面與視窗沒有橫向溢出、標籤與符合數字級至少 12px（截圖另存）",
      [pageM, pageEmpty, modalM, modalEmpty].every(ok), out.D);
  });

  return run.finish({ out });
}
