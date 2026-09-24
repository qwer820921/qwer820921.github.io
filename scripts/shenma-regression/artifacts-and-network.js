async (page) => {
  // 產物版本證據（瀏覽器實際取得的 Godot 檔案雜湊、SW／快取狀態）與網路防線統計
  // 回傳的 served.files[*].sha256 需另外與本機 public/ 的 SHA-256 核對（MCP 執行環境不能讀本機檔案）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  if ((await page.locator('iframe[title="Shenma Sanguo"]').count()) === 0) return { error: "請在 /shenmaSanguo 頁面執行" };
  const run = H.begin();

  const served = await page.evaluate(async () => {
    const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const files = ["index.pck", "index.wasm", "index.js", "index.html", "index.service.worker.js"];
    const out = {};
    let swText = "";
    for (const f of files) {
      const r = await fetch("/games/shenmaSanguo/" + f, { cache: "no-store" });
      const b = await r.arrayBuffer();
      if (f === "index.service.worker.js") swText = new TextDecoder().decode(b);
      out[f] = { status: r.status, size: b.byteLength, sha256: hex(await crypto.subtle.digest("SHA-256", b)) };
    }
    const frame = document.querySelector('iframe[title="Shenma Sanguo"]');
    const fw = frame.contentWindow;
    const cfgText = [...fw.document.scripts].map((s) => s.textContent).find((t) => t.includes("GODOT_CONFIG")) || "";
    const fileSizes = (cfgText.match(/"fileSizes":(\{[^}]*\})/) || [])[1] || null;
    const entries = fw.performance.getEntriesByType("resource")
      .filter((e) => /index\.(pck|wasm|js)$/.test(e.name))
      .map((e) => ({ name: e.name.replace(location.origin, ""), transferSize: e.transferSize, encodedBodySize: e.encodedBodySize }));
    const regs = (await navigator.serviceWorker.getRegistrations()).map((r) => ({ scope: r.scope, script: (r.active || r.waiting || r.installing || {}).scriptURL }));
    const cacheVersion = (swText.match(/^const CACHE_VERSION = '([^']*)';$/m) || [])[1] || null;
    return { files: out, cacheVersion, iframeFileSizes: fileSizes, iframeResourceEntries: entries, swRegistrations: regs, cacheKeys: await caches.keys() };
  });

  const f = served.files;
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
  run.check("iframe 實際載入的 pck／wasm／js 大小與目前檔案一致",
    ["index.pck", "index.wasm", "index.js"].every((n) => loaded(n) && loaded(n).encodedBodySize === f[n].size),
    served.iframeResourceEntries);
  const godotCaches = served.cacheKeys.filter((k) => k.startsWith("shenmaSanguo-sw-cache-"));
  run.check("Godot SW 快取只有目前 CACHE_VERSION（沒有舊產物快取）",
    served.cacheVersion !== null && godotCaches.every((k) => k === "shenmaSanguo-sw-cache-" + served.cacheVersion),
    { cacheVersion: served.cacheVersion, cacheKeys: served.cacheKeys });

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
