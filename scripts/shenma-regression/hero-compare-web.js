async (page) => {
  // 兩位武將比較（瀏覽器，mock 後端）：主頁戰場 HUD 的「武將」視窗與獨立武將頁共用的比較入口與比較表
  // - P-1 主頁：「比較武將」切換比較模式（aria-pressed）；比較模式中點卡片是選取或取消（不開升級詳情）；選滿兩位後再點第三位不加入也不替換、說明要先取消
  // - P-2 「比較這兩位」開啟有名稱的視窗（武將比較），焦點在關閉鈕；比較表照選取的順序列出兩位，數值是目前存檔（黃忠 Lv3）與 mock 設定：
  //        等級、攻擊、出陣容量、基礎射程（不含技能）、戰場有效射程（百步穿楊乘一次 1.5）、攻擊間隔、技能、對空
  // - P-2d 「顯示差額」（預設關閉、鍵盤可切換）：以左欄為基準，只在右欄數值下方寫右欄−左欄，不加第四欄；文字列沒有差額
  // - P-3 Esc 只關閉比較（武將列表還開著），焦點回到「比較這兩位」；整段沒有升級或保存的請求
  // - P-4 升級後再比較：關羽 Lv2 的攻擊與差額照目前存檔（不是舊的快照）
  // - P-5 鍵盤：Tab 到「比較武將」按 Enter、卡片用空白鍵選取
  // - P-6 390×844／390×600：比較視窗在畫面寬度內、沒有橫向捲動；項目欄有合理寬度、標題一行，關閉鈕與註解看得到；Esc 焦點歸還
  // - P-7 獨立武將頁：同樣的比較入口與比較表（趙雲與周瑜：周瑜只有 speed_growth，攻擊間隔照正規化後的公式）；Esc 關閉後焦點回到「比較這兩位」；沒有升級或保存的請求
  // - P-8 設定拿掉已選的武將（獨立武將頁，過期的設定快取多一位測試武將、新的讀取暫停後放行）：比較視窗關閉、選取只剩另一位；
  //        之後再選滿兩位也不自動重開比較
  // 全部虛構金鑰 test_cmp_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const KEY = "test_cmp_a";
  const profile = {
    nickname: "比較武將", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter1_7",
    heroes: [{ hero_id: "huang_zhong", level: 3, star: 0, atk: 170, def: 136, hp: 1700 }],
    team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
  };
  const LIST = '[role="dialog"]:has(button[data-hero-id])';
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const gasActions = async () => H.countActions(await H.gasLog(page));
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `hero-compare-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };
  const barState = () => page.evaluate(() => {
    const t = document.querySelector('[data-testid="hero-compare-toggle"]');
    const start = document.querySelector('[data-testid="hero-compare-start"]');
    return {
      toggle: t ? { pressed: t.getAttribute("aria-pressed"), text: t.innerText.trim() } : null,
      picked: document.querySelector('[data-testid="hero-compare-picked"]')?.innerText.trim() ?? null,
      start: start ? { disabled: start.disabled } : null,
      notice: document.querySelector('[data-testid="hero-compare-notice"]')?.innerText.trim() ?? "",
      cards: [...document.querySelectorAll("button[data-hero-id]")].map((b) => ({ id: b.dataset.heroId, pressed: b.getAttribute("aria-pressed"), popup: b.getAttribute("aria-haspopup") })),
      detail: !!document.querySelector('[data-testid="hero-detail"]'),
      focus: document.activeElement?.dataset?.testid ?? document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName ?? null,
    };
  });
  const card = (id) => page.locator(`button[data-hero-id="${id}"]`).first();
  const table = () => page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.querySelector('[data-testid="hero-compare"]'));
    if (!dlg) return null;
    const label = dlg.getAttribute("aria-label") || (document.getElementById(dlg.getAttribute("aria-labelledby") || "") || {}).textContent || null;
    const heads = [...dlg.querySelectorAll('[data-testid="hero-compare-table"] thead th')].map((th) => th.innerText.trim());
    const rows = {};
    for (const tr of dlg.querySelectorAll('[data-testid="hero-compare-table"] tbody tr'))
      rows[tr.dataset.row] = [...tr.querySelectorAll("td")].map((td) => td.innerText.replace(/\s+/g, " ").trim());
    const r = dlg.getBoundingClientRect();
    return {
      label: label && label.trim(),
      heads,
      rows,
      note: dlg.querySelector('[data-testid="hero-compare"] p')?.innerText ?? "",
      focusInside: dlg.contains(document.activeElement),
      focusLabel: document.activeElement?.getAttribute("aria-label") ?? null,
      rect: { left: Math.round(r.left), right: Math.round(r.right) },
      vw: innerWidth,
      docScroll: document.documentElement.scrollWidth,
    };
  });

  // 「顯示差額」開關與右欄下方的差額（data-diff）
  const diffState = () => page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.querySelector('[data-testid="hero-compare"]'));
    if (!dlg) return null;
    const sw = dlg.querySelector('[data-testid="hero-compare-diff-toggle"]');
    const diffs = {};
    for (const s of dlg.querySelectorAll("[data-diff]"))
      diffs[s.dataset.diff] = { hero: s.closest("td")?.dataset.heroId ?? null, text: s.innerText.trim() };
    return {
      sw: sw ? { checked: sw.checked, role: sw.getAttribute("role"), label: sw.labels?.[0]?.innerText.trim() ?? null } : null,
      diffs,
      focus: !!sw && document.activeElement === sw,
      cols: dlg.querySelectorAll('[data-testid="hero-compare-table"] thead th').length,
    };
  });
  const diffText = (s) => Object.fromEntries(Object.entries(s?.diffs || {}).map(([k, v]) => [k, v.text]));
  const diffHero = (s) => [...new Set(Object.values(s?.diffs || {}).map((v) => v.hero))];
  // 手機版面：項目欄與武將欄寬度、每列項目標題的行數（第一段文字）、表格與關閉鈕在畫面內、註解捲得到
  const layout = () => page.evaluate(() => {
    const dlg = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.querySelector('[data-testid="hero-compare"]'));
    if (!dlg) return null;
    const tbl = dlg.querySelector('[data-testid="hero-compare-table"]');
    const heads = [...tbl.querySelectorAll("thead th")];
    const lines = (el) => {
      const t = [...el.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
      if (!t) return 0;
      const r = document.createRange();
      r.selectNodeContents(t);
      return new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size;
    };
    const rowLines = {};
    for (const tr of tbl.querySelectorAll("tbody tr")) rowLines[tr.dataset.row] = lines(tr.querySelector("th"));
    const close = dlg.querySelector('[aria-label="關閉武將比較"]');
    const cr = close.getBoundingClientRect();
    const tr = tbl.getBoundingClientRect();
    const notes = dlg.querySelector('[data-testid="hero-compare-notes"]');
    notes.scrollIntoView({ block: "end" });
    const nr = notes.getBoundingClientRect();
    const res = {
      labelW: Math.round(heads[0].getBoundingClientRect().width),
      heroW: heads.slice(1).map((th) => Math.round(th.getBoundingClientRect().width)),
      rowLines,
      table: { left: Math.round(tr.left), right: Math.round(tr.right), height: Math.round(tr.height) },
      vw: innerWidth,
      vh: innerHeight,
      docScroll: document.documentElement.scrollWidth,
      close: { top: Math.round(cr.top), right: Math.round(cr.right), bottom: Math.round(cr.bottom) },
      notes: { text: notes.innerText, top: Math.round(nr.top), bottom: Math.round(nr.bottom) },
    };
    dlg.querySelector('[data-testid="hero-compare"]').scrollIntoView({ block: "start" });
    return res;
  });
  const layoutOk = (l) => !!l && l.labelW >= 70 && l.heroW.every((w) => w >= 110) &&
    Object.values(l.rowLines).every((n) => n === 1) &&
    l.table.left >= 0 && l.table.right <= l.vw && l.docScroll <= l.vw &&
    l.close.top >= 0 && l.close.right <= l.vw && l.notes.bottom <= l.vh &&
    /越小攻擊越快/.test(l.notes.text) && /右欄的值減左欄的值/.test(l.notes.text);

  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, p: profile });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
  });

  const g0 = await gasActions();
  await section("main", async () => {
    await page.locator('button[class*="hudBarBtn"]', { hasText: "武將" }).click();
    await page.waitForSelector(LIST);
    const b0 = await barState();
    await page.locator('[data-testid="hero-compare-toggle"]').click();
    const b1 = await barState();
    await card("guan_yu").click();
    await card("huang_zhong").click();
    const b2 = await barState();
    await card("zhao_yun").click();
    await H.sleep(200);
    const b3 = await barState();
    out.P1 = { b0: b0.toggle, b1, b2: { picked: b2.picked, start: b2.start }, b3: { picked: b3.picked, notice: b3.notice, cards: b3.cards } };
    run.check("P-1 主頁：「比較武將」切換比較模式（aria-pressed）；比較模式中點卡片是選取（aria-pressed、不開升級詳情）；選滿 2 位後再點趙雲不加入也不替換，說明要先取消一位",
      b0.toggle?.pressed === "false" && b0.cards.every((c) => c.popup === "dialog" && c.pressed === null) &&
        b1.toggle?.pressed === "true" && b1.start?.disabled === true && /已選 0／2/.test(b1.picked || "") && b1.cards.every((c) => c.pressed === "false" && c.popup === null) &&
        /已選 2／2：關羽、黃忠/.test(b2.picked || "") && b2.start?.disabled === false && !b2.detail &&
        /已選 2／2：關羽、黃忠/.test(b3.picked || "") && b3.cards.find((c) => c.id === "zhao_yun")?.pressed === "false" && /最多比較 2 位/.test(b3.notice) && !b3.detail,
      out.P1);

    await page.locator('[data-testid="hero-compare-start"]').click();
    await page.waitForSelector('[data-testid="hero-compare"]');
    const t = await table();
    out.P2 = t;
    run.check("P-2 比較視窗（名稱「武將比較」、焦點在關閉鈕）：照選取順序關羽、黃忠；Lv1／Lv3（存檔）、攻擊 150／170、出陣容量 8／6、基礎射程 1.5／5.06 格（不含技能）、" +
      "戰場有效射程 同基礎射程／7.59 格（百步穿楊只乘一次）、攻擊間隔 1.2／1.2 秒、技能 減速光環／百步穿楊、對空 只打地面／可以攻擊飛行；寫明是存檔的基礎值",
      !!t && t.label === "武將比較" && t.focusInside && t.focusLabel === "關閉武將比較" &&
        t.heads.join() === "項目,關羽,黃忠" &&
        t.rows.level?.join() === "Lv.1,Lv.3" && t.rows.atk?.join() === "150,170" && t.rows.cost?.join() === "8,6" &&
        t.rows.range?.join() === "1.5 格,5.06 格" && t.rows.battleRange?.join() === "同基礎射程,7.59 格（百步穿楊）" &&
        t.rows.interval?.join() === "1.2 秒,1.2 秒" && t.rows.skill?.join() === "減速光環,百步穿楊" &&
        /打不到飛行/.test(t.rows.air?.[0] || "") && /可以攻擊飛行/.test(t.rows.air?.[1] || "") &&
        /存檔的基礎值/.test(t.note) && !t.rows.problems,
      t);

    // 差額：預設不顯示；鍵盤 Tab 到「顯示差額」按空白鍵開啟
    const d0 = await diffState();
    await page.keyboard.press("Tab");
    const onSwitch = (await diffState())?.focus === true;
    await page.keyboard.press(" ");
    await H.sleep(200);
    const d1 = await diffState();
    out.P2d = { off: d0 && { sw: d0.sw, n: Object.keys(d0.diffs).length }, onSwitch, sw: d1?.sw, diffs: diffText(d1), heroes: diffHero(d1), cols: d1?.cols };
    run.check("P-2d 顯示差額（預設關閉；開關有名稱、以左欄關羽為基準，鍵盤 Tab＋空白鍵開啟、焦點留在開關）：只在右欄黃忠下方、不加第四欄；" +
      "ATK +20、DEF +16、HP +200、出陣容量 −2、基礎射程 +3.56 格、戰場射程 +6.09 格（關羽沒有射程技能沿用基礎射程）、攻擊間隔 相同；等級／技能／對空沒有差額",
      !!d0 && d0.sw?.checked === false && Object.keys(d0.diffs).length === 0 && d0.sw?.role === "switch" && /以左欄的關羽為基準/.test(d0.sw?.label || "") &&
        onSwitch && d1?.sw?.checked === true && d1.focus && d1.cols === 3 &&
        JSON.stringify(diffHero(d1)) === '["huang_zhong"]' &&
        JSON.stringify(diffText(d1)) === JSON.stringify({ atk: "差額 +20", def: "差額 +16", hp: "差額 +200", cost: "差額 −2", range: "差額 +3.56 格", battleRange: "差額 +6.09 格", interval: "差額 相同" }),
      out.P2d);

    await page.keyboard.press("Escape");
    await H.sleep(300);
    const b4 = await barState();
    const listOpen = (await page.locator(LIST).count()) === 1;
    const g1 = await gasActions();
    out.P3 = { b4: { focus: b4.focus, picked: b4.picked }, listOpen, g0, g1 };
    run.check("P-3 Esc 只關閉比較：武將列表還開著、選取保留，焦點回到「比較這兩位」；整段沒有升級或保存的請求",
      (await table()) === null && listOpen && b4.focus === "hero-compare-start" && /關羽、黃忠/.test(b4.picked || "") &&
        (g1.upgrade_hero || 0) === (g0.upgrade_hero || 0) && (g1.save_profile || 0) === (g0.save_profile || 0),
      out.P3);

    // 升級關羽後再比較：數值照目前存檔
    await page.locator('[data-testid="hero-compare-toggle"]').click();
    await card("guan_yu").click();
    await page.waitForSelector('[data-testid="hero-detail"]');
    await waitSync("idle");
    await page.locator('[data-testid="hero-detail"] button', { hasText: /升級/ }).last().click();
    await page.waitForFunction(() => /升級成功/.test(document.querySelector('[data-testid="hero-detail"]')?.innerText || ""), null, { timeout: 30000 });
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.locator('[data-testid="hero-compare-toggle"]').click();
    await card("guan_yu").click();
    await card("huang_zhong").click();
    await page.locator('[data-testid="hero-compare-start"]').click();
    await page.waitForSelector('[data-testid="hero-compare"]');
    const t4 = await table();
    await page.locator('[data-testid="hero-compare-diff-toggle"]').check();
    await H.sleep(200);
    const d4 = await diffState();
    out.P4 = t4 && { level: t4.rows.level, atk: t4.rows.atk, diffs: diffText(d4) };
    run.check("P-4 升級關羽後再比較：關羽 Lv2、攻擊 160（目前存檔，不是舊的快照），黃忠不變；差額跟著目前存檔（ATK +10、DEF +8、HP +100）",
      !!t4 && t4.rows.level?.join() === "Lv.2,Lv.3" && t4.rows.atk?.join() === "160,170" &&
        d4?.diffs.atk?.text === "差額 +10" && d4?.diffs.def?.text === "差額 +8" && d4?.diffs.hp?.text === "差額 +100", out.P4);
    await page.keyboard.press("Escape");
    await H.sleep(300);

    // 鍵盤：從「比較武將」往前 Shift+Tab 回到它、Enter 結束再開始比較模式；Tab 到關羽卡片、空白鍵選取
    await page.locator('[data-testid="hero-compare-toggle"]').focus();
    await page.keyboard.press("Enter");
    await H.sleep(200);
    const k0 = await barState();
    await page.keyboard.press("Enter");
    await H.sleep(200);
    let reached = null;
    for (let i = 0; i < 12 && reached !== "zhou_yu"; i++) {
      await page.keyboard.press("Tab");
      reached = await page.evaluate(() => document.activeElement?.getAttribute("data-hero-id") ?? null);
    }
    await page.keyboard.press(" ");
    await H.sleep(200);
    const k1 = await barState();
    out.P5 = { off: k0.toggle, reached, picked: k1.picked };
    run.check("P-5 鍵盤：「比較武將」按 Enter 切換（結束→重新開始比較模式）；Tab 走到周瑜的卡片、空白鍵選取（不開詳情）",
      k0.toggle?.pressed === "false" && reached === "zhou_yu" && /已選 1／2：周瑜/.test(k1.picked || "") && !k1.detail &&
        k1.cards.find((c) => c.id === "zhou_yu")?.pressed === "true",
      out.P5);
    await card("huang_zhong").click();

    // 390×844
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(500);
    await page.locator('[data-testid="hero-compare-start"]').scrollIntoViewIfNeeded();
    await page.locator('[data-testid="hero-compare-start"]').click();
    await page.waitForSelector('[data-testid="hero-compare"]');
    const m = await table();
    await page.locator('[data-testid="hero-compare-diff-toggle"]').check();
    await H.sleep(200);
    const d6 = await diffState();
    const l844 = await layout();
    const shot844 = await H.shot(page, "hero-compare-390x844");
    const bottom = () => page.evaluate(() => document.querySelector('[data-testid="hero-compare-notes"]').scrollIntoView({ block: "end" }));
    await bottom();
    const shot844b = await H.shot(page, "hero-compare-390x844-bottom");
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(500);
    const l600 = await layout();
    const shot600 = await H.shot(page, "hero-compare-390x600");
    await bottom();
    const shot600b = await H.shot(page, "hero-compare-390x600-bottom");
    out.P6 = m && { rect: m.rect, vw: m.vw, docScroll: m.docScroll, heads: m.heads, diffs: diffText(d6), l844, l600, shots: [shot844, shot844b, shot600, shot600b] };
    run.check("P-6 390×844／390×600（顯示差額）：比較視窗在畫面寬度內、頁面沒有橫向捲動；周瑜與黃忠照選取順序；項目欄至少 70px、每列項目標題一行不逐字換行，" +
      "兩位武將欄至少 110px；關閉鈕在畫面內、表格下方的註解捲得到；差額照左欄周瑜為基準（ATK +48、出陣容量 −3、攻擊間隔 +0.2 秒）",
      !!m && m.rect.left >= 0 && m.rect.right <= m.vw && m.docScroll <= m.vw && m.heads.join() === "項目,周瑜,黃忠" &&
        layoutOk(l844) && layoutOk(l600) &&
        d6?.diffs.atk?.text === "差額 +48" && d6?.diffs.cost?.text === "差額 −3" && d6?.diffs.interval?.text === "差額 +0.2 秒" &&
        d6?.diffs.battleRange?.text === "差額 +3.59 格",
      out.P6);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    const b6 = await barState();
    out.P6esc = { focus: b6.focus, dialog: (await table()) !== null };
    run.check("P-6b 390×600：Esc 只關閉比較，焦點回到「比較這兩位」", !out.P6esc.dialog && b6.focus === "hero-compare-start", out.P6esc);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  await section("page", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector("button[data-hero-id]", { timeout: 60000 });
    const p0 = await gasActions();
    await page.locator('[data-testid="hero-compare-toggle"]').click();
    await card("zhao_yun").click();
    await card("zhou_yu").click();
    const b = await barState();
    await page.locator('[data-testid="hero-compare-start"]').click();
    await page.waitForSelector('[data-testid="hero-compare"]');
    await H.sleep(300);
    const t = await table();
    await page.locator('[data-testid="hero-compare-diff-toggle"]').check();
    await H.sleep(200);
    const d7 = await diffState();
    const l7 = await layout();
    await page.keyboard.press("Escape");
    await H.sleep(500);
    const after = await barState();
    const p1 = await gasActions();
    out.P7 = { picked: b.picked, detail: b.detail, t, focus: after.focus, p0, p1, diffs: diffText(d7), heroes: diffHero(d7), label: d7?.sw?.label, labelW: l7?.labelW, rowLines: l7?.rowLines };
    run.check("P-7d 獨立武將頁的差額（以左欄趙雲為基準、只在周瑜下方）：ATK −28、DEF 相同、HP 相同、出陣容量 +1、基礎射程 +2.5 格、攻擊間隔 −0.2 秒；兩位都沒有射程技能就沒有戰場射程列；項目標題一行",
      /以左欄的趙雲為基準/.test(d7?.sw?.label || "") && JSON.stringify(diffHero(d7)) === '["zhou_yu"]' &&
        JSON.stringify(diffText(d7)) === JSON.stringify({ atk: "差額 −28", def: "差額 相同", hp: "差額 相同", cost: "差額 +1", range: "差額 +2.5 格", interval: "差額 −0.2 秒" }) &&
        !!l7 && Object.values(l7.rowLines).every((n) => n === 1) && l7.labelW >= 70,
      { diffs: out.P7.diffs, heroes: out.P7.heroes, label: out.P7.label, labelW: out.P7.labelW, rowLines: out.P7.rowLines });
    run.check("P-7 獨立武將頁：同樣的比較入口（選取不開詳情）與比較表：趙雲、周瑜；技能 閃避／火攻；攻擊間隔 1.2／1 秒（周瑜只有 speed_growth，照正規化後的公式）；" +
      "對空 只打地面／可以攻擊飛行；視窗名稱「武將比較」；Esc 關閉後焦點回到「比較這兩位」；沒有升級或保存的請求",
      /已選 2／2：趙雲、周瑜/.test(b.picked || "") && !b.detail && !!t && t.label === "武將比較" && t.heads.join() === "項目,趙雲,周瑜" &&
        t.rows.skill?.join() === "閃避,火攻" && t.rows.interval?.join() === "1.2 秒,1 秒" &&
        /打不到飛行/.test(t.rows.air?.[0] || "") && /可以攻擊飛行/.test(t.rows.air?.[1] || "") && !t.rows.battleRange &&
        after.focus === "hero-compare-start" &&
        (p1.upgrade_hero || 0) === (p0.upgrade_hero || 0) && (p1.save_profile || 0) === (p0.save_profile || 0),
      out.P7);
  });

  // 設定拿掉已選的武將：過期的設定快取多一位測試武將（頁面先用快取顯示），新的設定讀取先暫停
  await section("reload", async () => {
    const GHOST = "test_cmp_ghost";
    await page.evaluate((g) => {
      const raw = JSON.parse(localStorage.getItem("shenma_static_config"));
      const base = raw.heroesConfig.find((h) => h.hero_id === "zhao_yun");
      raw.heroesConfig.push({ ...base, hero_id: g, name: "測試武將甲" });
      localStorage.setItem("shenma_static_config", JSON.stringify(raw));
      localStorage.setItem("shenma_static_ts", "0");
      localStorage.setItem("__shenma_mock_hold", JSON.stringify(["get_heroes_config"]));
    }, GHOST);
    await page.reload();
    await page.waitForSelector(`button[data-hero-id="${GHOST}"]`, { timeout: 60000 });
    await page.evaluate(() => localStorage.removeItem("__shenma_mock_hold"));
    await page.waitForFunction(() => window.__shenmaMock.pending("get_heroes_config").length === 1, null, { timeout: 30000, polling: 100 });
    const r0 = await gasActions();
    await page.locator('[data-testid="hero-compare-toggle"]').click();
    await card(GHOST).click();
    await card("huang_zhong").click();
    await page.locator('[data-testid="hero-compare-start"]').click();
    await page.waitForSelector('[data-testid="hero-compare"]');
    const t0 = await table();
    await page.evaluate(() => window.__shenmaMock.release("get_heroes_config"));
    await page.waitForFunction((g) => !document.querySelector(`button[data-hero-id="${g}"]`), GHOST, { timeout: 30000, polling: 100 });
    await H.sleep(400);
    const gone = { dialog: (await table()) !== null, bar: await barState() };
    await card("zhou_yu").click();
    await H.sleep(600);
    const after = { dialog: (await table()) !== null, bar: await barState() };
    // 視窗自己打開了（缺陷）時先關掉再按「比較這兩位」，讓結果是斷言失敗而不是點擊逾時
    if (after.dialog) {
      await page.keyboard.press("Escape");
      await H.sleep(400);
    }
    await page.locator('[data-testid="hero-compare-start"]').click();
    await page.waitForSelector('[data-testid="hero-compare"]');
    await H.sleep(300);
    const t1 = await table();
    await page.locator('[data-testid="hero-compare-diff-toggle"]').check();
    await H.sleep(200);
    const d8 = await diffState();
    await page.keyboard.press("Escape");
    await H.sleep(400);
    const r1 = await gasActions();
    out.P8 = {
      before: t0 && t0.heads,
      gone: { dialog: gone.dialog, picked: gone.bar.picked, cards: gone.bar.cards.map((c) => c.id) },
      after: { dialog: after.dialog, picked: after.bar.picked, start: after.bar.start },
      reopened: t1 && t1.heads,
      diffs: diffText(d8),
      r0,
      r1,
    };
    run.check("P-8 獨立武將頁：選測試武將與黃忠並開比較後，新讀到的設定沒有測試武將 → 比較視窗關閉、選取只剩黃忠、他的卡片消失；" +
      "再選周瑜滿兩位也不會自動打開比較，按「比較這兩位」才開（周瑜、黃忠）；沒有升級或保存的請求",
      !!t0 && t0.heads.join() === "項目,測試武將甲,黃忠" &&
        !gone.dialog && /已選 1／2：黃忠/.test(gone.bar.picked || "") && !gone.bar.cards.some((c) => c.id === GHOST) &&
        !after.dialog && /已選 2／2：黃忠、周瑜/.test(after.bar.picked || "") && after.bar.start?.disabled === false &&
        !!t1 && t1.heads.join() === "項目,黃忠,周瑜" &&
        out.P8.diffs.atk === "差額 −48" && out.P8.diffs.cost === "差額 +3" &&
        (r1.upgrade_hero || 0) === (r0.upgrade_hero || 0) && (r1.save_profile || 0) === (r0.save_profile || 0),
      out.P8);
  });

  return run.finish({ out });
}
