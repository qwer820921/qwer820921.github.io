async (page) => {
  // 產物版本證據（瀏覽器實際取得的 Godot 檔案雜湊、SW／快取狀態）與網路防線統計
  // 回傳的 served.files[*].sha256 需另外與本機 public/ 的 SHA-256 核對（MCP 執行環境不能讀本機檔案）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  if ((await page.locator('iframe[title="Shenma Sanguo"]').count()) === 0) return { error: "請在 /shenmaSanguo 頁面執行" };
  const run = H.begin();

  // 先等遊戲的外殼頁把引擎啟動（#status 移除）：前一支腳本剛重新載入頁面時，引擎可能還在載入，
  // 這時讀 iframe 的 resource timing 會缺少還沒完成的檔案
  await page.waitForFunction(() => {
    const d = document.querySelector('iframe[title="Shenma Sanguo"]')?.contentDocument;
    return !!d && !!d.getElementById("canvas") && !d.getElementById("status");
  }, null, { timeout: 120000, polling: 200 });

  const served = await page.evaluate(async (GAME_DIR) => {
    const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const files = ["index.pck", "index.wasm", "index.js", "index.html", "index.service.worker.js"];
    const out = {};
    let swText = "";
    for (const f of files) {
      const r = await fetch(GAME_DIR + f, { cache: "no-store" });
      const b = await r.arrayBuffer();
      if (f === "index.service.worker.js") swText = new TextDecoder().decode(b);
      out[f] = { status: r.status, size: b.byteLength, sha256: hex(await crypto.subtle.digest("SHA-256", b)) };
    }
    const frame = document.querySelector('iframe[title="Shenma Sanguo"]');
    const fw = frame.contentWindow;
    const iframeSrc = frame.getAttribute("src");
    const iframePath = fw.location.pathname;
    const cfgText = [...fw.document.scripts].map((s) => s.textContent).find((t) => t.includes("const GODOT_CONFIG =")) || "";
    const fileSizes = (cfgText.match(/"fileSizes":(\{[^}]*\})/) || [])[1] || null;
    const entries = fw.performance.getEntriesByType("resource")
      .filter((e) => /index\.(pck|wasm|js)$/.test(e.name))
      .map((e) => ({ name: e.name.replace(location.origin, ""), transferSize: e.transferSize, encodedBodySize: e.encodedBodySize, decodedBodySize: e.decodedBodySize }));
    const regs = (await navigator.serviceWorker.getRegistrations()).map((r) => ({ scope: r.scope, script: (r.active || r.waiting || r.installing || {}).scriptURL }));
    const cacheVersion = (swText.match(/^const CACHE_VERSION = '([^']*)';$/m) || [])[1] || null;
    const cachePrefix = (swText.match(/^const CACHE_PREFIX = '([^']*)';$/m) || [])[1] || null;
    // 匯出後處理加上的引擎快取（同一個引擎跨版本共用）；沒有這一行就是 null
    const engineCache = (swText.match(/^const ENGINE_CACHE = CACHE_PREFIX \+ '([^']*)';$/m) || [])[1] || null;
    return { files: out, cacheVersion, cachePrefix, engineCache, iframeSrc, iframePath, iframeFileSizes: fileSizes, iframeResourceEntries: entries, swRegistrations: regs, cacheKeys: await caches.keys() };
  }, H.GAME_DIR);

  const f = served.files;
  // 網站入口的遊戲目錄（gameRelease.json）：iframe 實際開的是它，遊戲檔案也都從它載入（沒有混到其他目錄）
  run.check("iframe 開的是網站入口指標的遊戲目錄（" + H.GAME_DIR + "index.html）",
    served.iframeSrc === H.GAME_DIR + "index.html" && served.iframePath === H.GAME_DIR + "index.html",
    { src: served.iframeSrc, path: served.iframePath, gameDir: H.GAME_DIR });
  run.check("iframe 載入的 pck／wasm／js 都在這個遊戲目錄",
    served.iframeResourceEntries.length >= 3 && served.iframeResourceEntries.every((e) => e.name.startsWith(H.GAME_DIR)),
    served.iframeResourceEntries);
  run.check("5 個 Godot 檔案都能取得（HTTP 200）", Object.values(f).every((x) => x.status === 200), f);
  let sizes = {};
  try {
    sizes = JSON.parse(served.iframeFileSizes || "{}");
  } catch {
    sizes = {};
  }
  run.check("iframe 內 index.html 記錄的 pck／wasm 大小與實際檔案一致",
    sizes["index.pck"] === f["index.pck"].size && sizes["index.wasm"] === f["index.wasm"].size,
    { iframe: sizes, served: { pck: f["index.pck"].size, wasm: f["index.wasm"].size } });
  const loaded = (name) => served.iframeResourceEntries.find((e) => e.name.endsWith("/" + name));
  // 比對解壓後的大小：Round 13 起神馬頁面沒有根目錄的 coi SW，iframe 第一次載入時資源直接走網路，
  // 伺服器可能壓縮傳輸（encodedBodySize 是壓縮後大小）；經由 SW 或快取取得時兩者相同
  run.check("iframe 實際載入的 pck／wasm／js 大小與目前檔案一致",
    ["index.pck", "index.wasm", "index.js"].every((n) => loaded(n) && loaded(n).decodedBodySize === f[n].size),
    served.iframeResourceEntries);
  // 快取前綴照目前的 Service Worker（版本目錄是 shenmaSanguo-pkg-，舊正式版是 Godot 原本的 shenmaSanguo-sw-cache-）
  const godotCaches = served.cacheKeys.filter((k) => served.cachePrefix && k.startsWith(served.cachePrefix));
  const keepCaches = [served.cacheVersion, served.engineCache].filter(Boolean).map((v) => served.cachePrefix + v);
  run.check("Godot SW 快取只有目前 CACHE_VERSION 與目前這個引擎（沒有舊產物快取）",
    served.cacheVersion !== null && served.cachePrefix !== null && godotCaches.length > 0 && godotCaches.every((k) => keepCaches.includes(k)),
    { cachePrefix: served.cachePrefix, cacheVersion: served.cacheVersion, engineCache: served.engineCache, cacheKeys: served.cacheKeys });

  // 整個 browser context 期間（不只本腳本）的防線統計
  const gasLog = await H.gasLog(page);
  const network = {
    gasRequestsSeenOnNetwork: S.state.gasNet.length,
    gasRequestsAllowed: S.state.gasNet.filter((g) => g.allowed).map((g) => g.action),
    gasRequestsAborted: S.state.gasNet.filter((g) => !g.allowed).map((g) => g.action),
    analyticsAdsBlocked: S.state.blocked,
    analyticsAdsSamples: S.state.blockedSamples,
  };
  const totalScriptErrors = S.state.console.filter((c) => /SCRIPT ERROR/.test(c.text)).length;
  if (S.MODE === "mock") run.check("整段期間 GAS 都沒有打到網路層", network.gasRequestsSeenOnNetwork === 0, network);
  run.check("整段期間沒有 SCRIPT ERROR", totalScriptErrors === 0, totalScriptErrors);
  run.check("整段期間沒有 pageerror", S.state.pageErrors.length === 0, S.state.pageErrors.slice(0, 5));
  return run.finish({
    served,
    network,
    mockGasCalls: { total: gasLog.length, byAction: H.countActions(gasLog), modes: [...new Set(gasLog.map((e) => e.mode))] },
    consoleErrors: S.state.console.slice(-20),
  });
}
