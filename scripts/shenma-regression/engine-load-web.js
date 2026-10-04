async (page) => {
  // 主頁載入畫面的遊戲引擎進度（瀏覽器，真 Godot 產物、mock 後端）：
  // - 載入動畫下面寫出「存檔與設定」與「遊戲引擎」各自的階段，引擎下載中寫出已下載／總共的大小（讀遊戲 iframe 外殼頁自己的進度）
  // - 引擎沒有下載完，存檔與設定讀完也不會停在看似完成的畫面：整體進度依引擎的位元組前進，game_ready 後才進戰場
  // - 30 秒沒有收到資料：說明可能網路很慢或中斷，提供重新載入；引擎無法啟動（外殼頁的錯誤）、瀏覽器缺少 WebGL2：改顯示原因與重新載入
  // - EL-1～EL-5（見各段的 check 名稱）；限速用 CDP 的網路模擬（只作用在頁面：EL-1 讓頁面略過 Service Worker、直接下載，
  //   Service Worker 下載時的進度由載入量測 tools/load-measure.mjs 的伺服器端限速驗證），卡住與失敗用 context.route
  //   攔遊戲的 index.pck（遊戲的 Service Worker 發出的請求也攔得到：卡住、404 都經過 Service Worker 的核對與拒絕），
  //   WebGL2 用初始化腳本關掉
  // 全部虛構金鑰 test_el_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin({ expectedConsole: [/Failed to load resource: the server responded with a status of (404|503)/, /Failed loading file 'index\.pck'/, /Error while registering service worker/, /Service worker already exists/] });
  const out = {};
  const MAIN = H.BASE + "/shenmaSanguo";
  // 網站入口的遊戲目錄（gameRelease.json）：攔截與讀取都用它，不用碰巧也符合舊目錄的路由字串
  const PCK = "**" + H.GAME_DIR + "index.pck";
  const profile = (nickname) => ({
    nickname, level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter1_7",
    heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
  });

  // 沒有 WebGL2 的瀏覽器：localStorage.__shenma_no_webgl2 = "1" 時，主頁與遊戲 iframe 的 getContext("webgl2") 都回 null
  if (!ctx.__elNoWebgl2Installed) {
    ctx.__elNoWebgl2Installed = true;
    await ctx.addInitScript(() => {
      let off = false;
      try { off = localStorage.getItem("__shenma_no_webgl2") === "1"; } catch { off = false; }
      if (!off) return;
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
        if (type === "webgl2") return null;
        return orig.call(this, type, ...rest);
      };
    });
  }

  const setLocal = (obj) => page.evaluate((o) => {
    for (const [k, v] of Object.entries(o)) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v));
    }
  }, obj);
  // 先開一次主頁（沒有金鑰）完成初始化。遊戲引擎啟動後會註冊自己的 Service Worker（index.service.worker.js），
  // 之後的載入改從它的快取取得 wasm／pck，限速與攔截都碰不到（正式靜態匯出時會發生）：等引擎啟動後再移除它與快取，
  // 讓每一段量到的都是第一次開啟（沒有快取）的載入
  const prime = async () => {
    await H.resetOrigin(page);
    await page.goto(MAIN);
    await page.getByPlaceholder("例：eric_sanguo_2026").waitFor({ timeout: 90000 });
    await page.waitForFunction(() => {
      const d = document.querySelector('iframe[title="Shenma Sanguo"]')?.contentDocument;
      return !!d && !!d.getElementById("canvas") && !d.getElementById("status");
    }, null, { timeout: 120000 });
    await H.sleep(1500);
    (out.swCleared ||= []).push(await page.evaluate(async () => {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      return { regs: regs.map((r) => r.scope), caches: keys.length };
    }));
  };
  const seed = (key, p = profile("載入玩家")) => setLocal({ __shenma_mock_gas_db: { profiles: { [key]: p }, battle_logs: [] }, shenma_player_key: key });
  // 載入畫面目前的內容：引擎那一行、提醒、停住的說明、進度條寬度（%）、無法啟動的畫面
  const loaderState = () => page.evaluate(() => {
    const stage = document.querySelector('[data-testid="loading-stage"]');
    const fill = document.querySelector('[class*="tkProgressFill"]');
    const failed = document.querySelector('[data-testid="engine-load-failed"]');
    const stalled = document.querySelector('[data-testid="loading-stalled"]');
    return {
      loader: !!stage,
      stage: stage ? stage.innerText.replace(/\s+/g, " ").trim() : "",
      engine: document.querySelector('[data-testid="loading-engine"]')?.textContent || "",
      width: fill ? parseFloat(fill.style.width) : null,
      stalled: stalled ? stalled.innerText.replace(/\s+/g, " ").trim() : "",
      failed: failed ? failed.innerText.replace(/\s+/g, " ").trim() : "",
      hud: !!document.querySelector('[title="切換關卡"]'),
    };
  });
  const DL = /^遊戲引擎：下載中 ([0-9.]+) \/ ([0-9.]+) MB$/;

  // ── EL-1 限速（每秒約 2 MB）：引擎那一行寫出下載的大小並增加，提醒第一次要下載；整體進度一路增加，引擎就緒後才進戰場 ──
  let cdp = null;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await prime();
    await seed("test_el_1");
    cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    // CDP 的限速只作用在頁面：頁面略過 Service Worker、直接下載（頁面仍由同一版的 Service Worker 控制）
    await cdp.send("Network.setBypassServiceWorker", { bypass: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 40, downloadThroughput: 2 * 1024 * 1024, uploadThroughput: 1024 * 1024 });
    await page.reload();
    const seen = [];
    let shot = null;
    const end = Date.now() + 180000;
    for (;;) {
      const s = await loaderState();
      seen.push({ t: Date.now(), ...s });
      if (!shot && DL.test(s.engine) && Number(DL.exec(s.engine)[1]) > 5) shot = await H.shot(page, "engine-load-download-390");
      if (s.hud && !s.loader) break;
      if (Date.now() > end) break;
      await H.sleep(250);
    }
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: false });
    await cdp.send("Network.setBypassServiceWorker", { bypass: false });
    const dl = seen.filter((s) => DL.test(s.engine)).map((s) => DL.exec(s.engine).slice(1).map(Number));
    const loadedVals = [...new Set(dl.map((d) => d[0]))];
    const totals = [...new Set(dl.map((d) => d[1]))];
    const widths = seen.filter((s) => s.loader && s.width !== null).map((s) => s.width);
    const nonDecreasing = widths.every((w, i) => i === 0 || w >= widths[i - 1]);
    const hintWhileDl = seen.some((s) => DL.test(s.engine) && /第一次開啟要下載遊戲引擎/.test(s.stage));
    const dataDoneEarly = seen.some((s) => DL.test(s.engine) && /存檔與設定：完成/.test(s.stage));
    const maxWidthWhileDl = Math.max(...seen.filter((s) => DL.test(s.engine) && s.width !== null).map((s) => s.width));
    const last = seen[seen.length - 1];
    // 外殼頁 GODOT_CONFIG.fileSizes 的引擎與資料包大小（MB，取到小數一位）：顯示的總共大小要和它相同（不寫死數字，換引擎時照實際檔案）
    const shellMb = await page.evaluate(async (gameDir) => {
      const html = await (await fetch(gameDir + "index.html", { cache: "no-store" })).text();
      const m = html.match(/"fileSizes":(\{[^}]*\})/);
      if (!m) return null;
      const sizes = JSON.parse(m[1]);
      return Object.values(sizes).reduce((t, v) => t + v, 0) / 1048576;
    }, H.GAME_DIR);
    out.el1 = { samples: seen.length, loadedVals: loadedVals.slice(0, 12), totals, shellMb, widths: widths.filter((w, i) => i % 8 === 0), maxWidthWhileDl, last };
    run.check("EL-1 限速每秒約 2 MB（停用快取）：引擎那一行寫出「遊戲引擎：下載中 a / b MB」，總共大小固定而且等於外殼頁記錄的引擎＋資料包大小、已下載的大小至少出現 3 個且一路增加；下載中有「第一次開啟要下載遊戲引擎」的提醒；存檔與設定先讀完時進度條停在引擎的比例之下（下載中不超過 93%）；整體進度一路不減，引擎就緒後載入畫面消失、進入戰場；全程沒有停住或無法啟動的提示",
      loadedVals.length >= 3 && loadedVals.every((v, i) => i === 0 || v >= loadedVals[i - 1]) && totals.length === 1 && shellMb !== null && Math.abs(totals[0] - shellMb) <= 0.1 &&
        hintWhileDl && dataDoneEarly && maxWidthWhileDl <= 93 && nonDecreasing && last.hud && !last.loader &&
        !seen.some((s) => s.stalled || s.failed),
      { ...out.el1, shot });
  } catch (e) {
    run.check("EL-1 執行時發生例外", false, String(e && e.stack ? e.stack : e).slice(0, 400));
  } finally {
    if (cdp) await cdp.detach().catch(() => {});
  }

  // ── EL-2 遊戲資料（index.pck）一直沒有回應：30 秒後說明停住了、提供重新載入，載入動畫照常；放行後重新載入進入戰場 ──
  const held = [];
  // holding：攔下 index.pck 不回應；放行後新的請求照常取得（不用 unroute：它會讓已攔下的請求自動繼續）
  let holding = true;
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await prime();
    await seed("test_el_2");
    await ctx.route(PCK, (route) => (holding ? held.push(route) : route.continue()));
    const t0 = Date.now();
    await page.reload();
    await page.locator('[data-testid="loading-stalled"]').waitFor({ timeout: 90000 });
    const elapsed = (Date.now() - t0) / 1000;
    const s = await loaderState();
    const shot = await H.shot(page, "engine-load-stalled-390");
    const reloadBtn = await page.locator('[data-testid="loading-stalled"]').getByRole("button", { name: "重新載入" }).count();
    const dl = DL.exec(s.engine);
    run.check("EL-2 index.pck 一直沒有回應：約 30 秒後（不早於 30 秒）出現「已經 30 秒沒有進展，網路可能很慢或中斷了」與「重新載入」，載入動畫仍在；引擎那一行停在已下載少於總共的大小；沒有無法啟動的畫面",
      held.length >= 1 && elapsed >= 30 && /已經 3[0-9] 秒沒有進展，網路可能很慢或中斷了/.test(s.stalled) && reloadBtn === 1 && s.loader &&
        !!dl && Number(dl[1]) < Number(dl[2]) && !s.failed && !s.hud,
      { elapsed, held: held.length, ...s, shot });
    // 按重新載入後才放行（卡住的請求隨頁面重新載入取消；先放行的話遊戲會直接載入完成，或因下載失敗改顯示無法啟動）
    await page.locator('[data-testid="loading-stalled"]').getByRole("button", { name: "重新載入" }).click();
    holding = false;
    for (const r of held.splice(0)) await r.abort().catch(() => {});
    await H.waitHud(page);
    await H.sleep(500);
    const after = await loaderState();
    run.check("EL-2b 放行後按「重新載入」：載入完成進入戰場，停住的說明消失",
      after.hud && !after.loader && !after.stalled && !after.failed, after);
  } catch (e) {
    run.check("EL-2 執行時發生例外", false, String(e && e.stack ? e.stack : e).replace(/\u001b\[[0-9]+m/g, "").slice(0, 900));
  } finally {
    await ctx.unroute(PCK).catch(() => {});
    for (const r of held.splice(0)) await r.abort().catch(() => {});
  }

  // ── EL-3 遊戲資料回 404（外殼頁顯示錯誤）：改顯示「遊戲引擎無法啟動」與原始訊息、重新載入，不再顯示載入動畫 ──
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await prime();
    await seed("test_el_3");
    await ctx.route(PCK, (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "not found" }));
    await page.reload();
    const box = page.locator('[data-testid="engine-load-failed"]');
    await box.waitFor({ timeout: 60000 });
    const s = await loaderState();
    const role = await box.getAttribute("role");
    const shot = await H.shot(page, "engine-load-failed-390");
    run.check("EL-3 index.pck 回 404：顯示「遊戲引擎無法啟動，請重新載入」（role=alert）與外殼頁的原始訊息（含 index.pck）、「重新載入」按鈕；載入動畫不再顯示、沒有進入戰場",
      /遊戲引擎無法啟動，請重新載入/.test(s.failed) && /index\.pck/.test(s.failed) && /重新載入/.test(s.failed) && role === "alert" && !s.loader && !s.hud,
      { ...s, role, shot });
    await ctx.unroute(PCK);
    await box.getByRole("button", { name: "重新載入" }).click();
    await H.waitHud(page);
    const after = await loaderState();
    run.check("EL-3b 恢復後按「重新載入」：載入完成進入戰場，錯誤畫面消失", after.hud && !after.failed && !after.loader, after);
  } catch (e) {
    run.check("EL-3 執行時發生例外", false, String(e && e.stack ? e.stack : e).slice(0, 400));
  } finally {
    await ctx.unroute(PCK).catch(() => {});
  }

  // ── EL-4 瀏覽器沒有 WebGL2：外殼頁不會啟動引擎也不顯示訊息；主頁約 5 秒後說明缺少 WebGL2，不會一直轉圈 ──
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await prime();
    await seed("test_el_4");
    await setLocal({ __shenma_no_webgl2: "1" });
    const t0 = Date.now();
    await page.reload();
    const box = page.locator('[data-testid="engine-load-failed"]');
    await box.waitFor({ timeout: 60000 });
    const elapsed = (Date.now() - t0) / 1000;
    const s = await loaderState();
    const shot = await H.shot(page, "engine-load-unsupported-390");
    run.check("EL-4 沒有 WebGL2：幾秒後顯示「這個瀏覽器無法執行遊戲（缺少 WebGL2）」與建議改用的瀏覽器、「重新載入」；載入動畫不再顯示、沒有進入戰場",
      /這個瀏覽器無法執行遊戲（缺少 WebGL2）/.test(s.failed) && /Chrome、Safari/.test(s.failed) && !s.loader && !s.hud && elapsed < 45,
      { elapsed, ...s, shot });
  } catch (e) {
    run.check("EL-4 執行時發生例外", false, String(e && e.stack ? e.stack : e).slice(0, 400));
  } finally {
    await setLocal({ __shenma_no_webgl2: null }).catch(() => {});
  }

  // ── EL-5 一般載入（桌面，不限速）：照常進入戰場，沒有停住或無法啟動的提示；沒有金鑰時仍是金鑰輸入畫面 ──
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await prime();
    const keyEntry = await loaderState();
    await seed("test_el_5");
    await page.reload();
    const seen = [];
    const end = Date.now() + 120000;
    for (;;) {
      const s = await loaderState();
      seen.push(s);
      if (s.hud && !s.loader) break;
      if (Date.now() > end) break;
      await H.sleep(300);
    }
    const last = seen[seen.length - 1];
    run.check("EL-5 桌面一般載入：進入戰場，過程沒有停住或無法啟動的提示；沒有金鑰時是金鑰輸入畫面（沒有載入動畫與錯誤畫面）",
      last.hud && !last.loader && !seen.some((s) => s.stalled || s.failed) && !keyEntry.loader && !keyEntry.failed,
      { samples: seen.length, engineTexts: [...new Set(seen.map((s) => s.engine))].slice(0, 8), keyEntry });
  } catch (e) {
    run.check("EL-5 執行時發生例外", false, String(e && e.stack ? e.stack : e).slice(0, 400));
  }

  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
  return run.finish(out);
}
