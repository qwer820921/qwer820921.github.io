async (page) => {
  // R10（瀏覽器）：遊戲版本不相容的提示與重試、延遲切換失敗的提示（D10）
  // - 舊版遊戲用「真實舊產物」：24b1315b（正式站目前部署的版本）的 public/games/shenmaSanguo/
  //   index.html、index.pck、index.service.worker.js，先放在 .handoff/evidence/round-10/legacy-godot/，
  //   由 browser context 的 route 回應（包括遊戲 Service Worker 發出的請求）。不是自己寫的相容性 fixture
  // - A／B：主頁載入舊版 → 提示、不送關卡資料、不開戰 → 換回新版後重試：只重新載入遊戲，
  //   未同步的暱稱／隊伍與待確認升級都保留；已移除的 iframe 晚到的訊息不採用；之後正常開戰、只結算一次
  // - C：新版只是載入慢（index.pck 延遲 10 秒）：不誤判
  // - D：獨立戰鬥頁同樣的舊版提示、重試與保留
  // - E／F：切換送出後才開打被擋：視窗先關閉／保持開啟，主畫面都有提示；之後合法切換成功就清除
  // 全部使用虛構金鑰 test_r10_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const A = "test_r10_a";
  const B = "test_r10_b";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const KEY_INPUT = 'input[placeholder="例：eric_sanguo_2026"]';
  const PROMPT = '[data-testid="engine-incompatible"]';
  const NOTICE = '[data-testid="switch-failed-notice"]';
  const LEGACY = ".handoff/evidence/round-10/legacy-godot";
  // 目前的橋接協定版本（和 Godot WebBridge.gd、utils/gameEngine.ts 相同；加入飛行敵人與對空後是 7）
  const PROTOCOL = 7;

  // ── 遊戲檔案的路由：legacy＝回應真實舊產物；slow＝新版 index.pck 延遲 10 秒；off＝照常 ──
  const GAME_FILE = /\/games\/shenmaSanguo\/(index\.(?:html|pck|service\.worker\.js))(?:\?[^#]*)?$/;
  const game = { mode: "off", hits: [] };
  const gameRoute = async (route) => {
    const name = (route.request().url().match(GAME_FILE) || [])[1];
    if (game.mode === "legacy" && name) {
      game.hits.push({ mode: "legacy", name, sw: !!(route.request().serviceWorker && route.request().serviceWorker()) });
      const res = await route.fetch();
      const headers = { ...res.headers() };
      for (const h of ["content-length", "etag", "last-modified", "content-encoding"]) delete headers[h];
      return route.fulfill({ status: 200, headers, path: `${LEGACY}/${name}` });
    }
    if (game.mode === "slow" && name === "index.pck") {
      game.hits.push({ mode: "slow", name });
      await page.waitForTimeout(10000);
    }
    return route.fallback();
  };
  await page.context().route(GAME_FILE, gameRoute);

  // ── 共用小工具 ──
  const log = () => H.gasLog(page);
  const since = async (t, action, key) =>
    (await log()).filter((e) => e.t >= t && (!action || e.action === action) && (!key || e.key === key));
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const session = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
  const lsKey = () => page.evaluate(() => localStorage.getItem("shenma_player_key"));
  const pageId = () => page.evaluate(() => window.__shenmaPageId);
  const setMock = (k, v) => page.evaluate(([k, v]) => (v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v))), [k, v]);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const profile = (nickname, team = ["guan_yu"]) => ({
    nickname, level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_4", heroes: [],
    team: team.map((hero_id, i) => ({ hero_id, slot: i + 1 })),
  });
  const brief = (p) => p && {
    nickname: p.nickname, team: (p.team || []).map((t) => t.hero_id), gold: p.gold, rev: p.rev, syncedRev: p.syncedRev,
    status: p.syncStatus, pendingUpgrade: p.pendingUpgrade ? `${p.pendingUpgrade.id}/${p.pendingUpgrade.state}` : null,
  };
  const count = (sel) => page.locator(sel).count();
  const textOf = async (sel) => ((await count(sel)) > 0 ? page.locator(sel).first().innerText() : null);
  const bodyHas = (re) => page.evaluate((src) => new RegExp(src).test(document.body.innerText), re.source);
  const hasResultModal = () => bodyHas(/勝 利|落 敗/);
  const resultSince = (idx) =>
    page.evaluate((i) => (window.__bridgeLog || []).slice(i).filter((m) => m.type === undefined && typeof m.result === "string").pop() || null, idx);
  // 向 Godot 要唯讀快照（sel：主頁或獨立戰鬥頁的 iframe）
  const snapshot = async (sel) => {
    const id = "r10-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 100 });
    const s = await h.jsonValue();
    return { stage: s.stage, game_state: s.game_state, wave: s.wave, battle_id: s.battle_id };
  };
  // 直接對 Godot 送指令（等同按 Godot 畫面內的按鈕；網頁 HUD 被遮住時使用）
  const toGodot = (sel, msg) => page.evaluate(({ sel, msg }) => document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, ...msg }, "*"), { sel, msg });
  // 從「另一個、之後就移除的」iframe 送出訊息：模擬舊 iframe 在重新載入後才送達的訊息
  const postFromRemovedFrame = (msgs) =>
    page.evaluate(async (msgs) => {
      const f = document.createElement("iframe");
      f.style.display = "none";
      f.src = "/games/shenmaSanguo/index.offline.html";
      document.body.appendChild(f);
      await new Promise((r) => f.addEventListener("load", r, { once: true }));
      for (const m of msgs) f.contentWindow.eval("window.parent.postMessage(" + JSON.stringify(m) + ", '*')");
      f.remove();
      await new Promise((r) => setTimeout(r, 500));
    }, msgs);
  const swState = () =>
    page.evaluate(async () => ({
      regs: (await navigator.serviceWorker.getRegistrations()).map((r) => ({ scope: r.scope, active: r.active ? r.active.scriptURL : null, waiting: !!r.waiting })),
      caches: (await caches.keys()).filter((k) => k.startsWith("shenmaSanguo-sw-cache-")),
    }));
  const currentCacheVersion = async () => {
    const text = await (await page.request.get(H.BASE + "/games/shenmaSanguo/index.service.worker.js")).text();
    const version = (text.match(/^const CACHE_VERSION = '([^']*)';$/m) || [])[1] || null;
    // 匯出後處理加上的引擎快取（同一個引擎跨版本共用）；沒有這一行就是 null
    const engine = (text.match(/^const ENGINE_CACHE = CACHE_PREFIX \+ '([^']*)';$/m) || [])[1] || null;
    return { version, engine };
  };
  const openPlayerInfo = async () => {
    await page.locator('button[class*="hudAvatar"]').click();
    await page.waitForSelector("text=玩家資訊");
  };
  const closeModals = async () => {
    for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
      await page.locator('button[class*="modalClose"]').last().click();
      await H.sleep(300);
    }
  };
  const startSwitch = async (key) => {
    await openPlayerInfo();
    await H.clickButton(page, "切換");
    await page.locator('div[class*="modalPanel"] ' + KEY_INPUT).fill(key);
    await H.clickButton(page, "確認切換");
  };
  const modalResult = async () => {
    await page.waitForFunction(() => {
      const el = document.querySelector('div[class*="modalPanel"] .alert');
      return el && /切換失敗|讀取成功|建立成功/.test(el.innerText);
    }, null, { timeout: 60000, polling: 100 });
    return page.locator('div[class*="modalPanel"] .alert').first().innerText();
  };
  const switchTo = async (key) => {
    await startSwitch(key);
    const text = await modalResult();
    await closeModals();
    return text;
  };
  const releaseAll = (action) =>
    page.evaluate((a) => {
      window.__shenmaMock.unhold(a);
      let n = 0;
      while (window.__shenmaMock.release(a, "ok")) n += 1;
      return n;
    }, action);
  const confirmResult = async (label = "確認") => {
    await page.getByRole("button", { name: label, exact: true }).click();
    await H.sleep(3000);
  };
  // 乾淨的起點：重設儲存、建立 A／B 兩個存檔；seed 是預先放進 session 的本機資料，hold 是載入時就先暫停的請求
  out.storage = [];
  const prepare = async ({ key = A, seed = null, hold = [] } = {}) => {
    await H.resetOrigin(page);
    out.storage.push({ at: "reset", url: page.url(), session: await page.evaluate(() => sessionStorage.getItem("shenma_player_state")) });
    await setMock("__shenma_mock_gas_db", { profiles: { [A]: profile("A 玩家"), [B]: profile("B 玩家") }, battle_logs: [] });
    await page.evaluate(([k, s, h]) => {
      localStorage.setItem("shenma_player_key", k);
      if (s) sessionStorage.setItem("shenma_player_state", JSON.stringify(s));
      if (h.length) localStorage.setItem("__shenma_mock_hold", JSON.stringify(h));
    }, [key, seed, hold]);
  };
  const fresh = async (stage) => {
    await prepare();
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    out.storage.push({ at: "fresh-loaded", session: brief(await session()) });
    await waitSync("idle");
    if (stage) await H.selectStage(page, stage);
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r10-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await closeModals(); } catch { /* 沒有 Modal 可關 */ }
    } finally {
      game.mode = "off";
    }
  };

  // 未同步的暱稱與隊伍、結果待確認的升級（重新整理前送出、回應遺失）
  const seededUnconfirmed = {
    ...profile("未同步暱稱", ["zhao_yun"]), key: A, syncStatus: "unconfirmed", rev: 3, syncedRev: 2,
    pendingUpgrade: { id: "r10-op", hero_id: "guan_yu", base: profile("A 玩家"), sent_at: 1, state: "unknown" },
  };
  const seededPending = { ...profile("未同步暱稱", ["zhao_yun"]), key: A, syncStatus: "pending", rev: 2, syncedRev: 1, pendingUpgrade: null };

  try {
    // ── A. 主頁載入舊版遊戲 ──
    await section("A", async () => {
      await prepare({ seed: seededUnconfirmed, hold: ["get_profile", "save_profile"] });
      game.mode = "legacy";
      const t0 = Date.now();
      await page.goto(H.BASE + "/shenmaSanguo");
      const ready = await H.waitBridge(page, 0, { type: "game_ready" }, 180000);
      await H.sleep(3000);
      const promptText = await textOf(PROMPT);
      const snap = await snapshot(IFRAME);
      out.A = { legacyHits: game.hits.slice(), readyProtocol: ready.protocol ?? null, promptText, snap, hud: (await count('[title="切換關卡"]')) > 0 };
      run.check("A-0 前置：遊戲檔案由真實舊產物回應，舊版的 game_ready 沒有協定版本",
        ["index.html", "index.pck"].every((n) => game.hits.some((h) => h.name === n)) && out.A.readyProtocol === null, out.A);
      run.check("A-1 舊版遊戲：顯示「遊戲版本需要更新」與重新載入入口，沒有顯示 HUD",
        !!promptText && /遊戲版本需要更新/.test(promptText) && (await count('button:has-text("重新載入遊戲")')) > 0 && !out.A.hud, out.A);
      run.check("A-2 沒有送出關卡資料：舊版遊戲還在等待關卡（沒有關卡、狀態 0）", snap.stage === "" && snap.game_state === 0, snap);
      out.A_shot = await H.shot(page, "r10-a-old-engine-prompt");
      // 用 Godot 畫面內的「自動」指令試著開戰（網頁沒有 HUD 可按）
      const idx = await H.bridgeLen(page);
      await toGodot(IFRAME, { type: "toggle_auto" });
      await H.sleep(2000);
      const snap2 = await snapshot(IFRAME);
      let oldResult = null;
      if (snap2.game_state === 2) {
        // 修正前：舊版遊戲收到了關卡資料、開始戰鬥；等它結算，記錄頁面的反應
        await page.waitForFunction((i) => (window.__bridgeLog || []).slice(i).some((m) => m.type === undefined && typeof m.result === "string"), idx, { timeout: 180000, polling: 500 });
        oldResult = await resultSince(idx);
        await H.sleep(2000);
      }
      const results = await since(t0, "save_result");
      out.A_start = { snap2, oldResult: oldResult && { result: oldResult.result, battle_id: oldResult.battle_id ?? null }, resultModal: await hasResultModal(), promptNow: (await count(PROMPT)) > 0, saveResults: results.length };
      run.check("A-3 Godot 內的開戰指令也不會開戰（沒有關卡），沒有結算、沒有 save_result",
        snap2.game_state === 0 && !oldResult && results.length === 0, out.A_start);
      if (oldResult) out.A_start_shot = await H.shot(page, "r10-a-old-engine-battle-no-feedback");
    });

    // ── B. 換回新版後重試：只重新載入遊戲，保留本機資料 ──
    await section("B", async () => {
      const retry = page.locator('button:has-text("重新載入遊戲")');
      if ((await count('button:has-text("重新載入遊戲")')) === 0) {
        run.check("B-1 重試後載入新版遊戲", false, "沒有重新載入遊戲的入口");
        return;
      }
      const before = { session: brief(await session()), pageId: await pageId(), pendingGet: await page.evaluate(() => window.__shenmaMock.pending("get_profile").length) };
      const t0 = Date.now();
      game.mode = "off";
      const idx = await H.bridgeLen(page);
      await retry.first().click();
      const ready = await H.waitBridge(page, idx, { type: "game_ready" }, 180000);
      const prep = await H.waitBridge(page, idx, { type: "update_stats", wave: 0, game_state: 1 }, 60000);
      await H.sleep(1500);
      const after = { session: brief(await session()), pageId: await pageId(), pendingGet: await page.evaluate(() => window.__shenmaMock.pending("get_profile").length) };
      const saves = await since(t0, "save_profile");
      const sw = await swState();
      const version = await currentCacheVersion();
      out.B_retry = { readyProtocol: ready.protocol ?? null, prepBattleId: prep.battle_id, prompt: (await count(PROMPT)) > 0, before, after, saves: saves.length, sw, version };
      run.check(`B-1 重試後載入新版遊戲：game_ready 協定版本 ${PROTOCOL}，提示消失，送出關卡資料（備戰中，stats 帶 battle_id）`,
        ready.protocol === PROTOCOL && !out.B_retry.prompt && typeof prep.battle_id === "string" && prep.battle_id.length > 0, out.B_retry);
      run.check("B-2 只重新載入遊戲：頁面沒有重新整理，未同步的暱稱／隊伍、版本號與待確認升級都和重試前相同，也沒有送出任何保存",
        before.pageId === after.pageId && JSON.stringify(before.session) === JSON.stringify(after.session) &&
          after.session.nickname === "未同步暱稱" && after.session.pendingUpgrade === "r10-op/unknown" && saves.length === 0,
        out.B_retry);
      const keep = [version.version, version.engine].filter(Boolean).map((v) => "shenmaSanguo-sw-cache-" + v);
      run.check("B-3 遊戲的 Service Worker 換成新版本：快取只剩目前的版本與目前這個引擎（舊版本的快取已刪除）",
        !!version.version && sw.caches.includes("shenmaSanguo-sw-cache-" + version.version) && sw.caches.every((k) => keep.includes(k)),
        out.B_retry);
      out.B_shot = await H.shot(page, "r10-b-after-retry");
      // 放行載入時暫停的請求（待確認升級照既有規則重新確認：伺服器看不到升級，仍待確認）
      await releaseAll("get_profile");
      await releaseAll("save_profile");
      await setMock("__shenma_mock_hold", null);
      // 開戰；戰鬥中，已移除的 iframe 送來 game_ready（舊版）、這一場 battle_id 的 stats 與結算
      const idx2 = await H.bridgeLen(page);
      const t1 = Date.now();
      await H.clickButton(page, "自動");
      const started = await H.waitBridge(page, idx2, { type: "update_stats", game_state: 2 });
      const base = { __godot_bridge: true, battle_id: started.battle_id };
      await postFromRemovedFrame([
        { __godot_bridge: true, type: "game_ready" },
        { ...base, type: "update_stats", game_state: 1, wave: 0, total_waves: 2, gold: 4321, hp: 3, max_hp: 20, auto_mode: false },
        { ...base, result: "WIN", stage_id: "chapter1_4", stars_earned: 3, kills: 6, time_seconds: 20, loots: [{ item: "battle_points", count: 999 }] },
      ]);
      await H.sleep(1000);
      const foreign = { prompt: (await count(PROMPT)) > 0, shows4321: await bodyHas(/4321/), resultModal: await hasResultModal(), hud: await H.hud(page) };
      out.B_foreign = foreign;
      run.check("B-4 已移除的 iframe 送來的 game_ready、stats、結算（即使帶這一場的 battle_id）都不採用：沒有提示、HUD 不變、沒有結算畫面",
        !foreign.prompt && !foreign.shows4321 && !foreign.resultModal && foreign.hud.startLabel === "戰鬥中", foreign);
      const idxOwn = await H.bridgeLen(page);
      await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 300000, polling: 500 });
      const res = await resultSince(idxOwn);
      await confirmResult();
      const results = await since(t1, "save_result");
      const sess = await session();
      const reward = res && res.result === "WIN" ? res.loots[0].count : 10;
      out.B_settle = { ownBattleId: res?.battle_id, resultKeys: results.map((e) => e.key), reward, session: brief(sess) };
      run.check("B-5 重試後正常開戰結算：這一場的結算採用一次，save_result 1 次、key 是 A，本機點數只加一次",
        res?.battle_id === started.battle_id && results.length === 1 && results[0].key === A && sess.gold === 1000 + reward, out.B_settle);
    });

    // ── C. 新版只是載入慢：不誤判 ──
    await section("C", async () => {
      await prepare();
      game.mode = "slow";
      await page.goto(H.BASE + "/shenmaSanguo");
      const t0 = Date.now();
      let promptSeen = false;
      let readyBefore = false;
      while (Date.now() - t0 < 8000) {
        if ((await count(PROMPT)) > 0) promptSeen = true;
        if (await page.evaluate(() => (window.__bridgeLog || []).some((m) => m.type === "game_ready"))) readyBefore = true;
        await H.sleep(500);
      }
      const ready = await H.waitBridge(page, 0, { type: "game_ready" }, 180000);
      await H.waitBridge(page, 0, { type: "update_stats", wave: 0, game_state: 1 }, 60000);
      await H.sleep(1500);
      const hits = game.hits.filter((h) => h.mode === "slow").length;
      out.C = { slowHits: hits, promptSeen, readyBefore, readyProtocol: ready.protocol ?? null, promptAfter: (await count(PROMPT)) > 0, hud: (await count('[title="切換關卡"]')) > 0 };
      run.check("C-1 index.pck 延遲 10 秒的前 8 秒：還沒有 game_ready，也沒有出現版本提示（仍是載入中）",
        hits >= 1 && !readyBefore && !promptSeen, out.C);
      run.check("C-2 載入完成：協定版本相同，沒有提示，正常送出關卡資料並顯示 HUD", ready.protocol === PROTOCOL && !out.C.promptAfter && out.C.hud, out.C);
    });

    // ── D. 獨立戰鬥頁 ──
    await section("D", async () => {
      await prepare({ seed: seededPending, hold: ["save_profile"] });
      game.mode = "legacy";
      await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_4");
      const ready = await H.waitBridge(page, 0, { type: "game_ready" }, 180000);
      await H.sleep(3000);
      const promptText = await textOf(PROMPT);
      const snap = await snapshot(BIFRAME);
      out.D_old = { readyProtocol: ready.protocol ?? null, promptText, snap };
      run.check("D-1 獨立戰鬥頁載入舊版：顯示版本提示，沒有送出關卡資料", ready.protocol === undefined && !!promptText && /遊戲版本需要更新/.test(promptText) && snap.stage === "" && snap.game_state === 0, out.D_old);
      out.D_shot = await H.shot(page, "r10-d-battle-route-old-engine");
      if (!promptText) return;
      const before = { session: brief(await session()), pageId: await pageId(), pendingSave: await page.evaluate(() => window.__shenmaMock.pending("save_profile").length) };
      game.mode = "off";
      const idx = await H.bridgeLen(page);
      await page.locator('button:has-text("重新載入遊戲")').first().click();
      const ready2 = await H.waitBridge(page, idx, { type: "game_ready" }, 180000);
      const prep = await H.waitBridge(page, idx, { type: "update_stats", wave: 0, game_state: 1 }, 60000);
      await H.sleep(1500);
      const after = { session: brief(await session()), pageId: await pageId(), pendingSave: await page.evaluate(() => window.__shenmaMock.pending("save_profile").length) };
      out.D_retry = { readyProtocol: ready2.protocol ?? null, battleId: prep.battle_id, prompt: (await count(PROMPT)) > 0, before, after };
      run.check("D-2 重試後載入新版並送出關卡資料；頁面沒有重新整理，未同步的暱稱／隊伍與版本號不變，原本的保存請求仍在等待（沒有重送或遺失）",
        ready2.protocol === PROTOCOL && !out.D_retry.prompt && before.pageId === after.pageId &&
          JSON.stringify(before.session) === JSON.stringify(after.session) && before.pendingSave === 1 && after.pendingSave === 1,
        out.D_retry);
      await releaseAll("save_profile");
      await setMock("__shenma_mock_hold", null);
      await waitSync("idle").catch(() => {});
      const d = await db();
      out.D_saved = { backend: brief(d.profiles[A]), session: brief(await session()) };
      run.check("D-3 放行後保存完成：後端收到未同步的暱稱與隊伍", out.D_saved.backend.nickname === "未同步暱稱" && JSON.stringify(out.D_saved.backend.team) === '["zhao_yun"]', out.D_saved);
      const idx2 = await H.bridgeLen(page);
      const t1 = Date.now();
      const gBefore = (await db()).profiles[A].gold;
      await page.locator("button", { hasText: /^自動/ }).click();
      const started = await H.waitBridge(page, idx2, { type: "update_stats", game_state: 2 });
      const base = { __godot_bridge: true, battle_id: started.battle_id };
      await postFromRemovedFrame([
        { __godot_bridge: true, type: "game_ready" },
        { ...base, type: "update_stats", game_state: 1, wave: 0, total_waves: 2, gold: 4321, hp: 3, max_hp: 20, auto_mode: false },
        { ...base, result: "WIN", stage_id: "chapter1_4", stars_earned: 3, kills: 6, time_seconds: 20, loots: [{ item: "battle_points", count: 999 }] },
      ]);
      await H.sleep(1000);
      const foreign = { prompt: (await count(PROMPT)) > 0, shows4321: await bodyHas(/4321/), resultModal: await bodyHas(/確認，返回主選單/) };
      run.check("D-4 已移除的 iframe 送來的訊息不採用（沒有提示、沒有 4321、沒有結算畫面）", !foreign.prompt && !foreign.shows4321 && !foreign.resultModal, foreign);
      const idxOwn = await H.bridgeLen(page);
      await page.waitForFunction(() => /確認，返回主選單/.test(document.body.innerText), null, { timeout: 300000, polling: 500 });
      const res = await resultSince(idxOwn);
      await page.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "確認，返回主選單");
        b.click();
        b.click();
      });
      await page.waitForURL(/\/shenmaSanguo$/, { timeout: 60000 });
      await H.waitHud(page);
      await waitSync("idle");
      const results = await since(t1, "save_result");
      const reward = res && res.result === "WIN" ? res.loots[0].count : 10;
      const gAfter = (await db()).profiles[A].gold;
      out.D_settle = { ownBattleId: res?.battle_id, resultKeys: results.map((e) => e.key), gBefore, gAfter, reward };
      run.check("D-5 重試後正常開戰結算：連按確認只送 1 次 save_result、key 是 A，點數只加一次",
        res?.battle_id === started.battle_id && results.length === 1 && results[0].key === A && gAfter === gBefore + reward, out.D_settle);
    });

    // ── E. D10：切換送出後關閉視窗，之後開打讓切換被擋 ──
    await section("E", async () => {
      await fresh("Mock W 勝利兩波");
      await page.evaluate(() => window.__shenmaMock.hold("get_profile"));
      await startSwitch(B);
      await page.waitForFunction((k) => window.__shenmaMock.pending("get_profile").some((q) => q.key === k), B, { timeout: 30000, polling: 100 });
      await closeModals();
      const idx = await H.bridgeLen(page);
      await H.clickButton(page, "自動");
      await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
      await releaseAll("get_profile");
      await H.sleep(2000);
      const notice = await textOf(NOTICE);
      out.E = { notice, sessionKey: (await session())?.key, lsKey: await lsKey() };
      run.check("E-1 視窗已關閉：主畫面顯示「未切換存檔…請先結算或離開目前戰鬥」，不含存檔金鑰；仍是 A",
        !!notice && /未切換/.test(notice) && /請先結算或離開目前戰鬥/.test(notice) && !notice.includes("test_r10") &&
          out.E.sessionKey === A && out.E.lsKey === A,
        out.E);
      out.E_shot = await H.shot(page, "r10-e-switch-blocked-notice");
      await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 300000, polling: 500 });
      await confirmResult();
      await waitSync("idle");
      await H.sleep(2000);
      const sw = await switchTo(B);
      out.E_after = { switchText: sw, notice: await textOf(NOTICE), sessionKey: (await session())?.key };
      run.check("E-2 結算後合法切換到 B 成功：提示消失，不殘留過時的錯誤", /讀取成功/.test(sw) && out.E_after.notice === null && out.E_after.sessionKey === B, out.E_after);
    });

    // ── F. D10：視窗保持開啟 ──
    await section("F", async () => {
      await fresh("Mock W 勝利兩波");
      // F-1：戰鬥中開啟視窗切換：立即被擋
      let idx = await H.bridgeLen(page);
      await H.clickButton(page, "自動");
      await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
      await startSwitch(B);
      const modalText1 = await modalResult();
      const noticeInModal = await textOf(NOTICE);
      await closeModals();
      const notice1 = await textOf(NOTICE);
      out.F1 = { modalText1, noticeInModal, notice1, sessionKey: (await session())?.key };
      run.check("F-1 視窗開著、戰鬥中切換：視窗顯示切換失敗，關閉視窗後主畫面仍有提示；仍是 A",
        /切換失敗/.test(modalText1) && /請先結算或離開目前戰鬥/.test(modalText1) && !!notice1 && /未切換/.test(notice1) && out.F1.sessionKey === A, out.F1);
      // 離開戰鬥（切換關卡），新的一場在備戰
      await H.selectStage(page, "Mock W 勝利兩波");
      // F-2：視窗保持開啟、切換送出後才開打（網頁 HUD 被視窗蓋住，用 Godot 畫面內的「自動」指令開打）
      await page.evaluate(() => window.__shenmaMock.hold("get_profile"));
      await startSwitch(B);
      await page.waitForFunction((k) => window.__shenmaMock.pending("get_profile").some((q) => q.key === k), B, { timeout: 30000, polling: 100 });
      idx = await H.bridgeLen(page);
      await toGodot(IFRAME, { type: "toggle_auto" });
      await H.waitBridge(page, idx, { type: "update_stats", game_state: 2 });
      await releaseAll("get_profile");
      const modalText2 = await modalResult();
      await closeModals();
      const notice2 = await textOf(NOTICE);
      out.F2 = { modalText2, notice2, sessionKey: (await session())?.key, lsKey: await lsKey() };
      run.check("F-2 視窗保持開啟、切換送出後才開打：視窗顯示切換失敗（BATTLE_IN_PROGRESS），主畫面也有提示；仍是 A",
        /切換失敗/.test(modalText2) && /BATTLE_IN_PROGRESS/.test(modalText2) && !!notice2 && /未切換/.test(notice2) && !notice2.includes("test_r10") &&
          out.F2.sessionKey === A && out.F2.lsKey === A,
        out.F2);
      out.F_shot = await H.shot(page, "r10-f-switch-blocked-modal-open");
      // F-3：離開戰鬥後合法切換：成功，提示消失
      await H.selectStage(page, "Mock B 對照關");
      const sw = await switchTo(B);
      out.F3 = { switchText: sw, notice: await textOf(NOTICE), sessionKey: (await session())?.key };
      run.check("F-3 離開戰鬥後合法切換到 B 成功：提示消失", /讀取成功/.test(sw) && out.F3.notice === null && out.F3.sessionKey === B, out.F3);
    });
  } finally {
    await page.context().unroute(GAME_FILE, gameRoute);
  }

  return run.finish({ out });
}
