async (page) => {
  // 地圖編輯器（/mapEditor）的素材與頁面說明：
  // - 一律使用實際素材（不攔截、不回應假圖），在網路層記錄神馬三國素材的 404，捲動整頁讓延遲載入的圖片也載入
  // - 預設的障礙物素材存在，放一格障礙物後格子用的就是它
  // - 全站「頁面說明」在地圖編輯器預設收合，上方的分頁與工具列用一般點擊就能操作；展開後可以關閉，關閉後照常操作
  // - 寬版（1280）與窄版（390）；窄版的說明按鈕不壓到標題
  // - 開發模式左下角的 Next.js 指示器是開發工具，不列為產品問題
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const missing = [];
  const onResponse = (r) => {
    if (/\/images\/shenmaSanguo\//.test(r.url()) && r.status() >= 400) missing.push({ url: r.url(), status: r.status() });
  };
  page.on("response", onResponse);

  const infoPanelOpen = () => page.evaluate(() => {
    const box = document.querySelector('[data-floating-entry="page-info"]');
    const panel = box && box.children[1];
    return !!panel && getComputedStyle(panel).display !== "none";
  });
  // 按鈕中心點最上層的元素是不是按鈕本身（沒有被浮動面板蓋住）
  const topAt = (locator) => locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { self: !!top && (top === el || el.contains(top)), floating: !!top && !!top.closest("[data-floating-entry]") };
  });
  const scrollAll = async () => {
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await new Promise((r) => setTimeout(r, 60));
      }
      window.scrollTo(0, 0);
    });
    await H.sleep(800);
  };
  const brokenImages = () => page.evaluate(() => [...document.images].filter((i) => i.complete && i.naturalWidth === 0).map((i) => i.getAttribute("src")));

  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(H.BASE + "/mapEditor");
    const objectTab = page.getByRole("button", { name: "⚔️ 物件" });
    const mapTab = page.getByRole("button", { name: "🗺️ 地圖" });
    await objectTab.waitFor({ timeout: 60000 });

    // ── 1. 預設收合，分頁用一般點擊 ──
    const open0 = await infoPanelOpen();
    const hit0 = await topAt(objectTab);
    // 水合完成前的點擊會遺失：重試一般點擊，直到子分頁出現
    for (let i = 0; i < 20 && !(await page.getByRole("button", { name: "🦸 武將設定" }).isVisible()); i++) {
      await objectTab.click();
      await H.sleep(500);
    }
    const heroTabVisible = await page.getByRole("button", { name: "🦸 武將設定" }).isVisible();
    await mapTab.click();
    await page.getByRole("button", { name: "⬛ 障礙物" }).waitFor({ timeout: 10000 });
    await H.shot(page, "map-editor-default-1280");
    run.check("編輯器-1 頁面說明預設收合；「物件」「地圖」分頁的中心點沒有被浮動面板蓋住，用一般點擊就能切換",
      open0 === false && hit0.self && !hit0.floating && heroTabVisible, { open0, hit0, heroTabVisible });

    // ── 2. 實際素材：預設障礙物素材存在、整頁沒有破圖或 404 ──
    await scrollAll();
    const broken = await brokenImages();
    const obstacleThumb = await page.locator('img[alt="obstacle"]').evaluate((img) => ({ src: img.getAttribute("src"), ok: img.complete && img.naturalWidth > 0 }));
    run.check("編輯器-2 預設的障礙物素材是實際存在的 tiles/tile_dirt2.webp（縮圖載入成功）；捲過整頁後沒有破圖，神馬三國素材沒有 404",
      /tile_dirt2\.webp/.test(obstacleThumb.src) && obstacleThumb.ok && broken.length === 0 && missing.length === 0,
      { obstacleThumb, broken, missing });

    // ── 3. 放一格障礙物：格子使用預設素材，而且圖片載得到 ──
    await page.getByRole("button", { name: "⬛ 障礙物" }).click();
    const cell = page.locator('div[title="[2,2]"]');
    await cell.scrollIntoViewIfNeeded();
    await cell.click();
    await H.sleep(300);
    const bg = await cell.evaluate((el) => el.style.backgroundImage);
    const url = (bg.match(/url\("?([^")]+)"?\)/) || [])[1] || "";
    const loaded = url ? await page.evaluate((u) => new Promise((res) => { const i = new Image(); i.onload = () => res(i.naturalWidth > 0); i.onerror = () => res(false); i.src = u; }), url) : false;
    await H.shot(page, "map-editor-obstacle-placed");
    run.check("編輯器-3 用障礙物工具點一格：格子的背景是 tiles/tile_dirt2.webp，而且圖片載得到", /tile_dirt2\.webp/.test(url) && loaded, { bg, loaded });

    // ── 4. 展開說明 → 關閉 → 照常操作 ──
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.getByRole("button", { name: "展開說明" }).click();
    const open1 = await infoPanelOpen();
    const hit1 = await topAt(objectTab);
    await H.shot(page, "map-editor-info-open");
    await page.getByRole("button", { name: "關閉說明" }).click();
    const open2 = await infoPanelOpen();
    const hit2 = await topAt(objectTab);
    await objectTab.click();
    const switched = await page.getByRole("button", { name: "🦸 武將設定" }).isVisible();
    await mapTab.click();
    run.check("編輯器-4 按說明按鈕可以展開（展開時蓋住分頁屬於正常的浮動說明）；按 ✕ 關閉後分頁沒有被蓋住，一般點擊照常切換",
      open1 === true && hit1.floating && open2 === false && hit2.self && switched, { open1, hit1, open2, hit2, switched });

    // ── 5. 窄版：說明按鈕不壓到標題，分頁可以點 ──
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto(H.BASE + "/mapEditor");
    await objectTab.waitFor({ timeout: 60000 });
    await H.sleep(1000);
    const overlap = await page.evaluate(() => {
      const btn = document.querySelector('[data-floating-entry="page-info"] button').getBoundingClientRect();
      const title = [...document.querySelectorAll("div")].find((d) => d.textContent === "地圖編輯器" && d.children.length === 0).getBoundingClientRect();
      const inter = !(btn.right <= title.left || btn.left >= title.right || btn.bottom <= title.top || btn.top >= title.bottom);
      return { inter, btn: [btn.left, btn.top, btn.right, btn.bottom], title: [title.left, title.top, title.right, title.bottom], scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
    });
    const open3 = await infoPanelOpen();
    const hit3 = await topAt(objectTab);
    for (let i = 0; i < 20 && !(await page.getByRole("button", { name: "🦸 武將設定" }).isVisible()); i++) {
      await objectTab.click();
      await H.sleep(500);
    }
    const narrowSwitched = await page.getByRole("button", { name: "🦸 武將設定" }).isVisible();
    await H.shot(page, "map-editor-default-390");
    run.check("編輯器-5 窄版（390）：說明預設收合、說明按鈕沒有壓到標題；分頁沒有被蓋住，一般點擊可以切換",
      open3 === false && !overlap.inter && hit3.self && narrowSwitched, { overlap, open3, hit3, narrowSwitched });
  } catch (e) {
    run.check("情境執行完成（沒有拋出例外）", false, String((e && e.stack) || e).slice(0, 600));
  }
  page.off("response", onResponse);
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
  out.missing = missing;
  return run.finish(out);
}
