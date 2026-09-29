async (page) => {
  // 地圖編輯器武將表的稀有度／職業選單（瀏覽器）：選單只提供遊戲認得的值（和遊戲畫面共用 utils/heroCategories）
  // - 混合資料：標準值、法師、舊的稀有度（SR）與中文職業、healer 與空白稀有度、數字稀有度
  // - 遊戲不認得的值：選單多一個「原值」選項並標成黃色、上方說明列數；載入與重新繪製都不改寫
  // - 沒動選單就儲存：送出的每一列和讀到的完全相同（值與型別）；在選單選了新的值才改，其他列照原值
  // - 新增列的預設值是遊戲認得的值
  // 設定讀寫由這支腳本在頁面內回應（__shenma_editor_fixture），不經 harness 的 mock；測試用密碼
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const TOKEN = "test-editor-token-5b2";
  const baseRow = { cost: 8, base_atk: 150, base_def: 120, base_hp: 1500, attack_range: 1.5, attack_speed: 1.2, passive: "", notes: "", upgrade_cost_base: 100, atk_growth: 10, def_growth: 8, hp_growth: 100, range_growth: 0, image: "", attack_image: "" };
  const FIXTURE = [
    { ...baseRow, hero_id: "guan_yu", name: "關羽", rarity: "orange", job: "infantry" },
    { ...baseRow, hero_id: "zhou_yu", name: "周瑜", rarity: "purple", job: "mage" },
    { ...baseRow, hero_id: "old_sr", name: "舊甲", rarity: "SR", job: "步兵" },
    { ...baseRow, hero_id: "healer", name: "華佗", rarity: "", job: "healer" },
    { ...baseRow, hero_id: "num_rar", name: "數字", rarity: 3, job: "archer" },
  ];
  await ctx.addInitScript(({ fixture, token }) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_editor_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        const reply = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
        const log = JSON.parse(localStorage.getItem("__shenma_editor_log") || "[]");
        log.push({ action: body.action, heroes: body.payload && body.payload.heroes });
        localStorage.setItem("__shenma_editor_log", JSON.stringify(log));
        if (body.action === "get_heroes_config") return reply({ status: 200, heroes: fixture });
        if (body.action === "save_heroes_config") {
          if (!body.payload || body.payload.admin_token !== token) return reply({ status: 403, error: "ADMIN_REQUIRED" });
          return reply({ status: 200, success: true, message: "SAVED" });
        }
      }
      return inner(input, init);
    };
  }, { fixture: FIXTURE, token: TOKEN });

  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const waitUntil = async (fn, timeout = 30000, what = "條件") => {
    const end = Date.now() + timeout;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error("等不到：" + what);
      await H.sleep(150);
    }
  };
  const editorLog = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_editor_log") || "[]"));
  const saves = async () => (await editorLog()).filter((e) => e.action === "save_heroes_config");
  const visibleBtn = (text) => page.locator("button:visible", { hasText: text }).first();
  const selects = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('select[data-testid="hero-rarity-select"],select[data-testid="hero-job-select"]')].map((s) => ({
        kind: s.getAttribute("data-testid"),
        value: s.value,
        shown: s.options[s.selectedIndex] ? s.options[s.selectedIndex].text : null,
        unknown: s.getAttribute("data-unknown") === "true",
        options: [...s.options].map((o) => o.value),
        title: s.getAttribute("title"),
      }))
    );
  const save = async () => {
    const n = (await saves()).length;
    await visibleBtn("💾 儲存至 Sheet").click();
    const prompt = await page.locator('[data-testid="admin-token-input"]').isVisible().catch(() => false);
    if (prompt || (await page.waitForSelector('[data-testid="admin-token-input"]', { timeout: 3000 }).then(() => true).catch(() => false))) {
      await page.locator('[data-testid="admin-token-input"]').fill(TOKEN);
      await page.locator('[data-testid="admin-token-submit"]').click();
    }
    await waitUntil(async () => (await saves()).length > n, 15000, "儲存請求");
    await page.waitForSelector("text=/已儲存/", { timeout: 10000 });
    return (await saves()).slice(-1)[0].heroes;
  };
  const rowOf = (list, id) => list.find((r) => r.hero_id === id);
  const pick = (list) => list.map((r) => ({ id: r.hero_id, rarity: r.rarity, job: r.job }));

  try {
    await H.resetOrigin(page);
    await page.evaluate(() => localStorage.setItem("__shenma_editor_fixture", "1"));
    await page.goto(H.BASE + "/mapEditor");
    await waitUntil(async () => {
      await page.getByRole("button", { name: "⚔️ 物件" }).click();
      await H.sleep(500);
      return page.getByRole("button", { name: "🦸 武將設定" }).isVisible();
    }, 30000, "物件分頁");
    await page.getByRole("button", { name: "🦸 武將設定" }).click();
    await H.sleep(300);
    await visibleBtn("📥 從 Sheet 載入").click();
    await page.waitForFunction(() => /✓ 已載入 \d+ 筆/.test(document.body.innerText), null, { timeout: 30000 });
    await H.sleep(300);
    const s0 = await selects();
    const hint0 = await page.locator('[data-testid="hero-unknown-hint"]').innerText().catch(() => null);
    out.load_shot = await H.shot(page, "hero-category-editor-load");
    const rar = s0.filter((x) => x.kind === "hero-rarity-select");
    const job = s0.filter((x) => x.kind === "hero-job-select");
    out.loaded = { rar, job, hint0 };
    run.check("E-1 選單只有遊戲認得的值：稀有度 orange／purple／blue／green，職業 infantry／archer／artillery／cavalry／mage，顯示「名稱（值）」；沒有 N、SR 或中文職業",
      same(rar[0].options, ["orange", "purple", "blue", "green"]) && same(job[0].options, ["infantry", "archer", "artillery", "cavalry", "mage"]) &&
        rar[0].shown === "橘（orange）" && job[0].shown === "步兵（infantry）" && job[1].shown === "法師（mage）" && rar[1].shown === "紫（purple）",
      out.loaded);
    run.check("E-2 遊戲不認得的值保留原值並標示：舊甲的稀有度 SR 與職業「步兵」、華佗的 healer 與空白稀有度、數字稀有度 3 → 選單顯示原值（多一個原值選項）、黃色標示與說明，上方說明 3 列",
      rar[2].value === "SR" && rar[2].unknown && /SR（遊戲不認得/.test(rar[2].shown) && rar[2].options[0] === "SR" &&
        job[2].value === "步兵" && job[2].unknown && job[3].value === "healer" && job[3].unknown &&
        rar[3].value === "" && rar[3].unknown && /空白/.test(rar[3].shown) && rar[4].value === "3" && rar[4].unknown &&
        !rar[0].unknown && !job[0].unknown && !job[1].unknown && /有 3 列/.test(hint0 || "") && /保留原值/.test(rar[2].title || ""),
      out.loaded);

    // 沒動選單、只改一個名稱就儲存：其他欄位與不認得的值原樣送回（值與型別都相同）
    await page.locator('tbody tr').nth(0).locator("input").nth(1).fill("關羽改");
    await H.sleep(200);
    const s1 = await selects();
    const p1 = await save();
    const expect1 = FIXTURE.map((r) => (r.hero_id === "guan_yu" ? { ...r, name: "關羽改" } : r));
    out.untouched = { payload: pick(p1), unknownAfterRerender: s1.filter((x) => x.unknown).length };
    run.check("E-3 只改名稱就儲存（選單沒動）：重新繪製後不認得的值仍在；送出的每一列和讀到的完全相同（SR、步兵、healer、空白、數字 3 都照原值與型別），只有名稱改變",
      same(p1, expect1) && rowOf(p1, "num_rar").rarity === 3 && rowOf(p1, "healer").rarity === "" && s1.filter((x) => x.unknown).length === 5,
      { payload: pick(p1), diff: p1.map((r, i) => (same(r, expect1[i]) ? null : { got: r, want: expect1[i] })).filter(Boolean) });

    // 在選單實際選擇：舊甲 → blue、infantry；華佗的職業 → mage
    const row = (i) => page.locator("tbody tr").nth(i);
    await row(2).locator('select[data-testid="hero-rarity-select"]').selectOption("blue");
    await row(2).locator('select[data-testid="hero-job-select"]').selectOption("infantry");
    await row(3).locator('select[data-testid="hero-job-select"]').selectOption("mage");
    await H.sleep(200);
    const s2 = await selects();
    const hint2 = await page.locator('[data-testid="hero-unknown-hint"]').innerText().catch(() => null);
    const p2 = await save();
    out.chosen = { payload: pick(p2), hint2 };
    run.check("E-4 在選單選了新的值才改：舊甲 → blue／infantry、華佗職業 → mage（送出的是遊戲的值）；華佗的空白稀有度與數字稀有度 3 照原值；說明變成 2 列、選過的選單不再標示",
      rowOf(p2, "old_sr").rarity === "blue" && rowOf(p2, "old_sr").job === "infantry" && rowOf(p2, "healer").job === "mage" &&
        rowOf(p2, "healer").rarity === "" && rowOf(p2, "num_rar").rarity === 3 && rowOf(p2, "guan_yu").rarity === "orange" && rowOf(p2, "zhou_yu").job === "mage" &&
        /有 2 列/.test(hint2 || "") && !s2.filter((x) => x.kind === "hero-rarity-select")[2].unknown,
      out.chosen);

    await visibleBtn("＋ 新增列").click();
    await H.sleep(200);
    const s3 = await selects();
    const last = { rar: s3.filter((x) => x.kind === "hero-rarity-select").slice(-1)[0], job: s3.filter((x) => x.kind === "hero-job-select").slice(-1)[0] };
    run.check("E-5 新增列的預設值是遊戲認得的值（green、infantry），沒有標示",
      last.rar.value === "green" && last.job.value === "infantry" && !last.rar.unknown && !last.job.unknown, last);
    const log = await editorLog();
    run.check("E-6 請求只有載入 1 次與兩次儲存（載入、重新繪製、選擇都沒有另外寫入）",
      same(log.map((e) => e.action), ["get_heroes_config", "save_heroes_config", "save_heroes_config"]), log.map((e) => e.action));
    out.after_shot = await H.shot(page, "hero-category-editor-after");
  } catch (e) {
    run.check("地圖編輯器武將表：執行時發生例外", false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
    try { out.exception_shot = await H.shot(page, "hero-category-exception"); } catch { /* 截圖失敗不影響判定 */ }
  }
  await page.evaluate(() => {
    localStorage.removeItem("__shenma_editor_fixture");
    localStorage.removeItem("__shenma_editor_log");
  }).catch(() => {});
  return run.finish({ out });
}
