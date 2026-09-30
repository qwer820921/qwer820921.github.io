async (page) => {
  // 結算資料異常的畫面（瀏覽器，真 Godot 產物）：Godot 送來不合規則的結算（星數、點數）時，兩個戰鬥入口都要讓玩家知道沒有領取獎勵
  // - 不合規則的結算用「Godot 實際產生」的結算改壞：先用 harness 的 __bridgeWithhold 攔住、不交給頁面，
  //   改成 5 星或負的點數後，從遊戲 iframe 內送出（和 Godot 送出的路徑相同：iframe → window.parent.postMessage）
  // - 主頁：結算視窗顯示「結算異常」與說明（不顯示星數、戰利品），「關閉」後回到備戰、開始新的一場；本機與雲端都沒有修改、
  //   沒有 save_result／save_profile；同一張票（改壞的或原本合法的）再送一次都不再出現結算視窗；重新整理後也沒有待確認的結算
  // - 獨立戰鬥頁：同樣的說明，「返回主選單」回到主頁、沒有寫入
  // - 合法的勝利、落敗照常顯示與保存，已結算的票再送一次不會再出現（兩個入口）
  // - 版面規範：異常視窗（卡片與裡面的元素）沒有 inline style，樣式在 CSS Modules 與 Bootstrap utilities；
  //   獨立戰鬥頁的 Modal 本身不帶 --bs-modal-bg（改用 bg-transparent），外框背景仍是透明、卡片是白底
  // 全部 mock、虛構金鑰 test_invalid_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const KEY = "test_invalid_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const QUICK = "Mock C 快速自動";
  const LOSE = "Mock L 失敗關";

  const session = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
  const fields = (p) => p && { gold: p.gold, exp: p.exp, level: p.level, capacity: p.capacity, max_stage: p.max_stage, pending: (p.pendingSettles || []).length };
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const cloud = async () => fields((await db()).profiles[KEY]);
  const writes = async (t0) => (await H.gasLog(page)).filter((e) => e.t >= t0 && e.key === KEY && (e.action === "save_result" || e.action === "save_profile")).map((e) => e.action);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const withholdOn = () => page.evaluate(() => { window.__bridgeWithhold = []; });
  const withholdOff = () => page.evaluate(() => { window.__bridgeWithhold = null; });
  const withheld = async (timeout = 180000) => {
    await page.waitForFunction(() => Array.isArray(window.__bridgeWithhold) && window.__bridgeWithhold.length > 0, null, { timeout, polling: 200 });
    return page.evaluate(() => window.__bridgeWithhold[0]);
  };
  // 從遊戲 iframe 內送出（和 Godot 相同的路徑）
  const sendFromGame = (sel, msg) =>
    page.evaluate(({ sel, msg }) => {
      document.querySelector(sel).contentWindow.eval("window.parent.postMessage(" + JSON.stringify(msg) + ", '*')");
    }, { sel, msg });
  const card = () => page.locator('[data-testid="result-card"]');
  const cardInfo = async () => {
    const n = await card().count();
    if (n === 0) return { shown: false };
    const text = await card().innerText();
    return {
      shown: true, text: text.replace(/\s+/g, " "), invalid: (await page.locator('[data-testid="result-invalid"]').count()) > 0,
      stars: /[★☆]/.test(text), points: /戰場點數|\+\d/.test(text), buttons: await card().locator("button").allInnerTexts(),
    };
  };
  const dismissSplash = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
  const lastStatsId = () => page.evaluate(() => {
    const s = (window.__bridgeLog || []).filter((m) => m.type === "update_stats");
    return s.length ? { battle_id: s[s.length - 1].battle_id, state: s[s.length - 1].game_state, wave: s[s.length - 1].wave } : null;
  });
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `settle-invalid-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      await withholdOff().catch(() => {});
    }
  };
  // 主頁：打一場（自動），攔住 Godot 的結算
  const fightMainWithheld = async (stage) => {
    await withholdOn();
    await H.selectStage(page, stage);
    await H.dismissSplash(page);
    await H.clickButton(page, "自動");
    const res = await withheld();
    await withholdOff();
    return res;
  };
  // 送出改壞的結算，檢查畫面、寫入與數值；按下出口後再檢查一次
  const invalidCase = async (label, sel, res, bad, exitName, afterExit) => {
    const before = await session();
    const cloud0 = await cloud();
    const t0 = Date.now();
    await sendFromGame(sel, bad);
    await page.waitForSelector('[data-testid="result-invalid"]', { timeout: 15000 });
    const shown = await cardInfo();
    // 版面規範：卡片裡沒有 inline style；獨立戰鬥頁的 Modal 外框透明、卡片白底
    const inline = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="result-card"]');
      const modal = c.closest(".modal");
      const content = c.closest(".modal-content");
      return {
        styled: [c, ...c.querySelectorAll("*")].filter((e) => e.hasAttribute("style")).map((e) => e.tagName + ":" + e.getAttribute("style")),
        modalStyle: modal ? modal.getAttribute("style") || "" : null,
        contentBg: content ? getComputedStyle(content).backgroundColor : null,
        cardBg: getComputedStyle(c).backgroundColor,
      };
    });
    const shot = await H.shot(page, `settle-invalid-${label}`);
    let narrow = null;
    if (label === "main-stars" || label === "battle-stars") {
      await page.setViewportSize({ width: 390, height: 844 });
      await H.sleep(400);
      narrow = await page.evaluate(() => {
        const r = document.querySelector('[data-testid="result-invalid"]').getBoundingClientRect();
        const b = [...document.querySelectorAll('[data-testid="result-card"] button')].map((x) => x.getBoundingClientRect());
        return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth, scroll: document.documentElement.scrollWidth, buttonsInside: b.every((x) => x.left >= 0 && x.right <= window.innerWidth && x.bottom <= window.innerHeight) };
      });
      narrow.shot = await H.shot(page, `settle-invalid-${label}-390`);
      await page.setViewportSize({ width: 540, height: 900 });
      await H.sleep(300);
    }
    await card().getByRole("button", { name: exitName, exact: true }).click();
    await afterExit();
    await H.sleep(2500);
    const after = await session();
    return {
      shown, inline, shot, narrow, before: fields(before), after: fields(after), cloud0, cloud1: await cloud(), writes: await writes(t0),
      cardAfter: (await card().count()) > 0, invalidAfter: (await page.locator('[data-testid="result-invalid"]').count()) > 0, battleId: res.battle_id,
    };
  };
  const invalidOk = (r, exitName) =>
    r.shown.shown && r.shown.invalid && /結算異常/.test(r.shown.text) && /未領取獎勵/.test(r.shown.text) && !r.shown.stars && !r.shown.points &&
    !/勝 利|落 敗/.test(r.shown.text) && same(r.shown.buttons, [exitName]) &&
    same(r.before, r.after) && same(r.cloud0, r.cloud1) && r.writes.length === 0 && !r.cardAfter && !r.invalidAfter;

  // ── 準備 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate((k) => {
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({
        profiles: { [k]: { nickname: "結算異常", level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_7", heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }] } },
        battle_logs: [],
      }));
      localStorage.setItem("shenma_player_key", k);
    }, KEY);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
  });

  // ── M1. 主頁：5 星 ──
  let mainRes = null;
  await section("M1", async () => {
    mainRes = await fightMainWithheld(QUICK);
    const bad = { ...mainRes, stars_earned: 5 };
    const r = await invalidCase("main-stars", IFRAME, mainRes, bad, "關閉", async () => {
      await page.waitForFunction((bid) => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1 && m.wave === 0 && m.battle_id && m.battle_id !== bid), mainRes.battle_id, { timeout: 30000, polling: 200 });
    });
    const next = await lastStatsId();
    out.M1 = { ...r, godot: { result: mainRes.result, stars: mainRes.stars_earned, loots: mainRes.loots }, next };
    run.check("M-1 主頁：Godot 的結算改成 5 星 → 結算視窗「結算異常」，說明未領取獎勵（不顯示星數與戰利品），出口只有「關閉」；390 寬也看得到說明與按鈕、沒有橫向捲動",
      invalidOk(r, "關閉") && !!r.narrow && r.narrow.left >= 0 && r.narrow.right <= r.narrow.vw && r.narrow.scroll <= r.narrow.vw && r.narrow.buttonsInside, out.M1);
    run.check("M-1b 主頁的異常卡片沒有 inline style（關閉按鈕用 Bootstrap 的 w-100 mt-3）", r.inline.styled.length === 0 && r.inline.modalStyle === null, r.inline);
    run.check("M-2 主頁：按下「關閉」後本機與雲端的點數、經驗、等級、容量、進度都沒有變、沒有待確認的結算，沒有 save_result／save_profile；回到備戰並開始新的一場（新的 battle_id），異常說明不殘留",
      same(r.before, r.after) && r.after.pending === 0 && r.writes.length === 0 && !!next && next.battle_id !== mainRes.battle_id && next.state === 1 && !r.invalidAfter, { before: r.before, after: r.after, writes: r.writes, next });

    // 同一張票再送：改壞的、原本合法的（Godot 實際產生的那一筆）都不再出現結算視窗
    const t0 = Date.now();
    await sendFromGame(IFRAME, bad);
    await sendFromGame(IFRAME, mainRes);
    await H.sleep(2000);
    const replay = { card: (await card().count()) > 0, writes: await writes(t0), session: fields(await session()) };
    // 重新整理：沒有待確認的結算、數值不變、沒有寫入
    await page.reload();
    await H.waitHud(page);
    await waitSync("idle");
    await H.sleep(1500);
    const reload = { session: fields(await session()), writes: await writes(t0) };
    out.M3 = { replay, reload };
    run.check("M-3 同一場的結算再送一次（改壞的與原本合法的都送）：不再出現結算視窗、沒有寫入；重新整理後沒有待確認的結算、數值不變、沒有寫入（不能重送同一票補發）",
      !replay.card && replay.writes.length === 0 && same(replay.session, r.after) && reload.writes.length === 0 && same(reload.session, r.after), out.M3);
  });

  // ── M4. 主頁：負的點數 ──
  await section("M4", async () => {
    const res = await fightMainWithheld(QUICK);
    const bad = { ...res, loots: [{ item: "battle_points", count: -50 }] };
    const r = await invalidCase("main-negative", IFRAME, res, bad, "關閉", async () => {
      await page.waitForFunction((bid) => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1 && m.battle_id && m.battle_id !== bid), res.battle_id, { timeout: 30000, polling: 200 });
    });
    out.M4 = r;
    run.check("M-4 主頁：戰場點數改成 -50（星數合法）→ 同樣是「結算異常」、未領取；關閉後數值不變、沒有寫入、開始新的一場", invalidOk(r, "關閉"), r);
  });

  // ── M5. 主頁：合法的勝利、落敗照常 ──
  await section("M5", async () => {
    const before = fields(await session());
    const t0 = Date.now();
    await H.selectStage(page, QUICK);
    await H.dismissSplash(page);
    const idx = await H.bridgeLen(page);
    await H.clickButton(page, "自動");
    await page.waitForFunction(() => /勝 利/.test(document.body.innerText), null, { timeout: 180000, polling: 300 });
    const res = (await H.bridgeSince(page, idx)).find((m) => m.type === undefined && typeof m.result === "string");
    const shown = await cardInfo();
    await card().getByRole("button", { name: "確認", exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="result-card"]') === null, null, { timeout: 15000 });
    await waitSync("idle");
    const afterWin = fields(await session());
    const winWrites = await writes(t0);
    // 已結算的票再送一次：不再出現
    const t1 = Date.now();
    await sendFromGame(IFRAME, res);
    await H.sleep(2000);
    const replay = { card: (await card().count()) > 0, writes: await writes(t1) };
    const pts = (res.loots || []).filter((l) => l.item === "battle_points").reduce((s, l) => s + l.count, 0);
    out.M5 = { shown, before, afterWin, winWrites, pts, replay };
    run.check("M-5 主頁合法的勝利：結算視窗照常（勝利、星數、戰場點數，按鈕「確認」、沒有異常說明）；確認後 save_result 送出、點數＝結算前＋這一場；同一張票再送一次不再出現",
      shown.shown && !shown.invalid && /勝 利/.test(shown.text) && shown.stars && same(shown.buttons, ["確認"]) &&
        winWrites.includes("save_result") && afterWin.gold === before.gold + pts && !replay.card && !replay.writes.includes("save_result"), out.M5);

    const t2 = Date.now();
    await H.selectStage(page, LOSE);
    await H.dismissSplash(page);
    await H.clickButton(page, "迎戰");
    await page.waitForFunction(() => /落 敗/.test(document.body.innerText), null, { timeout: 180000, polling: 300 });
    const lose = await cardInfo();
    await card().getByRole("button", { name: "確認", exact: true }).click();
    await waitSync("idle");
    const loseWrites = await writes(t2);
    out.M6 = { lose, loseWrites };
    run.check("M-6 主頁合法的落敗：結算視窗照常（落敗，沒有異常說明），確認後 save_result 送出",
      lose.shown && !lose.invalid && /落 敗/.test(lose.text) && loseWrites.includes("save_result"), out.M6);
  });

  // ── B. 獨立戰鬥頁 ──
  const openBattlePage = async (mapId) => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + mapId);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000, polling: 200 });
    await dismissSplash(BIFRAME);
  };
  // 換頁後 harness 的 __bridgeWithhold 會回到 null：進入戰鬥頁後才開啟攔截
  const fightBattleWithheld = async () => {
    await openBattlePage("chapter1_3");
    await withholdOn();
    await page.getByRole("button", { name: "自動 OFF", exact: true }).click();
    const res = await withheld();
    await withholdOff();
    return res;
  };
  await section("B1", async () => {
    const res = await fightBattleWithheld();
    const bad = { ...res, stars_earned: -1 };
    const r = await invalidCase("battle-stars", BIFRAME, res, bad, "返回主選單", async () => {
      await page.waitForURL(/\/shenmaSanguo$/, { timeout: 30000 });
      await H.waitHud(page);
    });
    out.B1 = r;
    run.check("B-1 獨立戰鬥頁：結算改成 -1 星 → 「結算異常」、未領取（不顯示星數與點數），出口只有「返回主選單」；390 寬按鈕在畫面內；按下後回到主頁，數值不變、沒有寫入",
      invalidOk(r, "返回主選單") && !!r.narrow && r.narrow.right <= r.narrow.vw && r.narrow.buttonsInside, r);
    run.check("B-1b 獨立戰鬥頁的異常視窗沒有 inline style 版面：卡片與按鈕沒有 style 屬性、Modal 不帶 --bs-modal-bg；外框背景透明、卡片白底",
      r.inline.styled.length === 0 && typeof r.inline.modalStyle === "string" && !/--bs-modal-bg/.test(r.inline.modalStyle) &&
        r.inline.contentBg === "rgba(0, 0, 0, 0)" && r.inline.cardBg === "rgb(255, 255, 255)",
      r.inline);
  });
  await section("B2", async () => {
    const res = await fightBattleWithheld();
    const bad = { ...res, loots: [{ item: "battle_points", count: -5 }, { item: "gold", count: 10 }] };
    const r = await invalidCase("battle-negative", BIFRAME, res, bad, "返回主選單", async () => {
      await page.waitForURL(/\/shenmaSanguo$/, { timeout: 30000 });
      await H.waitHud(page);
    });
    out.B2 = r;
    run.check("B-2 獨立戰鬥頁：戰場點數 -5 → 同樣是「結算異常」、未領取；回到主頁、數值不變、沒有寫入", invalidOk(r, "返回主選單"), r);
  });
  await section("B3", async () => {
    await waitSync("idle");
    const before = fields(await session());
    const t0 = Date.now();
    await openBattlePage("chapter1_3");
    const idx = await H.bridgeLen(page);
    await page.getByRole("button", { name: "自動 OFF", exact: true }).click();
    await page.waitForFunction(() => /勝 利/.test(document.body.innerText), null, { timeout: 180000, polling: 300 });
    const res = (await H.bridgeSince(page, idx)).find((m) => m.type === undefined && typeof m.result === "string");
    const shown = await cardInfo();
    await card().getByRole("button", { name: "確認，返回主選單" }).click();
    await page.waitForURL(/\/shenmaSanguo$/, { timeout: 30000 });
    await H.waitHud(page);
    await waitSync("idle");
    const after = fields(await session());
    const w = await writes(t0);
    const pts = (res.loots || []).filter((l) => l.item === "battle_points").reduce((s, l) => s + l.count, 0);
    out.B3 = { shown, before, after, writes: w, pts };
    run.check("B-3 獨立戰鬥頁合法的勝利：結算視窗照常（勝利、星數、戰場點數，沒有異常說明）；確認後回到主頁、save_result 送出、點數＝結算前＋這一場",
      shown.shown && !shown.invalid && /勝 利/.test(shown.text) && shown.stars && w.includes("save_result") && after.gold === before.gold + pts, out.B3);
  });

  await withholdOff().catch(() => {});
  return run.finish({ out });
}
