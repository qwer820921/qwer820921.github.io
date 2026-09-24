async (page) => {
  // 刻意失敗的 fixture：證明 run.finish() 會把各種問題判為失敗。預期 allPass=false，
  // 且 failures 剛好包含下列 5 項。這支會汙染 context 的錯誤紀錄，請在其他情境跑完後、或另開 context 執行。
  //   1. 一個刻意不成立的斷言
  //   2. SCRIPT ERROR（在頁面主控台輸出 Godot 格式的錯誤行）
  //   3. 非預期的 console error
  //   4. pageerror（頁面內未捕捉的例外）
  //   5. GAS 打到網路層：在 iframe 內直接 fetch（iframe 沒有 mock），由網路防線攔截，不會送出
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  if ((await page.locator('iframe[title="Shenma Sanguo"]').count()) === 0) return { error: "請在 /shenmaSanguo 頁面執行" };
  const run = H.begin();

  run.check("fixture：刻意不成立的斷言", false, "預期失敗");
  await page.evaluate(() => {
    console.error("SCRIPT ERROR: fixture — 刻意輸出的腳本錯誤");
    console.error("fixture — 刻意輸出的非預期 console error");
    setTimeout(() => {
      throw new Error("fixture — 刻意拋出的未捕捉例外");
    }, 0);
  });
  // 探測網址用不存在的部署 ID：即使防線沒攔到，也只會拿到 Google 的 404，不會寫入任何資料
  const gasBefore = S.state.gasNet.length;
  const probe = await page.evaluate(async () => {
    const fw = document.querySelector('iframe[title="Shenma Sanguo"]').contentWindow;
    const controller = fw.navigator.serviceWorker.controller;
    let outcome;
    try {
      const res = await fw.fetch("https://script.google.com/macros/s/FIXTURE_NOT_A_REAL_DEPLOYMENT/exec", {
        method: "POST",
        body: JSON.stringify({ action: "fixture_leak_probe" }),
      });
      outcome = "收到回應 " + res.status + "（代表請求真的送出，防線沒有攔到）";
    } catch (e) {
      outcome = "fetch 失敗（防線 abort）：" + String(e).slice(0, 80);
    }
    return { iframeController: controller ? controller.scriptURL : null, outcome };
  });
  await H.sleep(1000);
  probe.seenByNetworkGuard = S.state.gasNet.slice(gasBefore);

  const r = run.finish();
  const expected = ["fixture：刻意不成立的斷言", "沒有 SCRIPT ERROR", "沒有非預期的 console error", "沒有 pageerror", "mock 模式下 GAS 沒有打到網路層"];
  const caught = expected.filter((n) => r.failures.includes(n));
  return {
    fixture: "deliberate-fail",
    expectedFailures: expected,
    caught,
    fixtureWorks: r.allPass === false && caught.length === expected.length,
    probe,
    result: r,
  };
}
