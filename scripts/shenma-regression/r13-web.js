async (page) => {
  // R13（瀏覽器）：跨來源隔離只留給 AI 去背（bgRemover），舊的根目錄 coi Service Worker 使用者要安全遷移
  // - 真實的 Service Worker 與真實導覽（一般重新整理、強制重新整理＝CDP 略過 SW、SPA 連結點擊），不是 mock 標頭
  // - 舊使用者的狀態用「無程式的靜態頁」重現舊網站留下的東西：根目錄範圍的 coi 註冊、隔離／非隔離兩份 session。
  //   重現之後直接交給新程式，不再用 harness 清掉；每個情境的原始快照放在 out.<情境>.plant
  // - 非隔離的那一份先寫、再進入隔離狀態寫較新的那一份（切回隔離時非隔離那一份會套用過去，這是舊網站實際的先後順序）
  // - E4／E5（Round 11 重現的資料回退）改成有斷言的回歸：B、C 是一般載入，D、E、F 是強制重新整理後第一次載入
  // - F：強制重新整理當下，隔離那一份在瀏覽器裡讀不到（切回隔離會被非隔離那一份蓋掉），舊進度列為限制（out.limitations）；
  //   但之後不能繼續覆蓋後端：這個分頁進入寫入限制（Round 15，C13-F），更新前送出的升級稍晚才在伺服器完成後，
  //   實際操作隊伍、升級、開戰、重新整理都不送出任何寫入；限制提示一直顯示，復原資料保留
  // - E：無法確認新舊的舊暫存只顯示摘要、可以下載，不再提供「改用這份暫存」（會繞過限制覆蓋雲端）
  // - K：查詢舊註冊一直失敗（C13-1）；Q：備份寫不回 session（C13-2）。兩者都用故障注入，驗實際送出的請求
  // - bgRemover 用產生的圖片（沒有任何個人資料）實際去背；模型從外部 CDN 下載
  // 全部 mock、虛構金鑰 test_r13_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin({
    // I-1 刻意讓 coi-serviceworker.js 載入失敗：Chrome 在 Service Worker 註冊取不到腳本時記錄這一筆
    // （來源與次數列在結果的 expectedConsoleSources）
    expectedConsole: [/^An unknown error occurred when fetching the script\.$/],
  });
  const out = { limitations: [] };
  const K = "shenma_player_state";
  const PLANT = H.BASE + "/__r13/plant.html";
  const SHENMA = H.BASE + "/shenmaSanguo";

  // 舊網站狀態的重現頁：同一個來源、沒有任何 App 程式
  await ctx.route("**/__r13/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: "<!doctype html><meta charset=utf-8><title>r13 plant</title><p>r13</p>" })
  );
  // 故障注入（頁面程式執行前生效）：
  // - localStorage.__r13_unregister = "reject"（移除 SW 一律失敗）／"noop"（回報成功但實際沒有移除）
  // - localStorage.__r13_getregs = "reject"：查詢 Service Worker 註冊一律失敗（C13-1）
  // - localStorage.__r13_ssfail = "1"：sessionStorage 寫入神馬存檔時拋出 QuotaExceededError（C13-2）
  await ctx.addInitScript(() => {
    try {
      const mode = localStorage.getItem("__r13_unregister");
      if (mode && window.ServiceWorkerRegistration) {
        ServiceWorkerRegistration.prototype.unregister = function () {
          return mode === "reject" ? Promise.reject(new Error("r13 injected")) : Promise.resolve(true);
        };
      }
      if (localStorage.getItem("__r13_getregs") === "reject" && window.ServiceWorkerContainer) {
        window.__r13OrigGetRegs = ServiceWorkerContainer.prototype.getRegistrations;
        ServiceWorkerContainer.prototype.getRegistrations = function () {
          return Promise.reject(new Error("r13 injected lookup failure"));
        };
      }
      if (localStorage.getItem("__r13_ssfail") === "1") {
        const orig = Storage.prototype.setItem;
        window.__r13OrigSetItem = orig;
        Storage.prototype.setItem = function (k, v) {
          if (this === window.sessionStorage && k === "shenma_player_state") {
            throw new DOMException("r13 injected quota", "QuotaExceededError");
          }
          return orig.call(this, k, v);
        };
      }
    } catch {
      /* 忽略 */
    }
  });

  // 頁面層級的導覽次數：只算主框架的文件請求（replaceState、SPA 的 RSC 請求都不算）
  const navs = [];
  page.on("request", (r) => {
    try {
      if (r.isNavigationRequest() && r.frame() === page.mainFrame()) navs.push({ t: Date.now(), url: r.url().replace(H.BASE, "") });
    } catch {
      /* Service Worker 自己發出的請求沒有 frame */
    }
  });
  const navsSince = (t) => navs.filter((n) => n.t >= t).map((n) => n.url);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");

  // ── 輔助 ──
  const prof = (team, extra = {}) => ({
    nickname: "R13 玩家", level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_7", heroes: [],
    team: team.map((h, i) => ({ hero_id: h, slot: i + 1 })), ...extra,
  });
  const sess = (key, team, { rev = 0, synced = 0, pending = null } = {}) => ({
    ...prof(team), key, rev, syncedRev: synced, pendingUpgrade: pending,
    syncStatus: pending ? "unconfirmed" : rev !== synced ? "pending" : "idle",
  });
  const probe = () =>
    page.evaluate(async (K) => {
      // 故障注入（查詢註冊一律失敗）時，量測用保留下來的原生方法
      const gr = window.__r13OrigGetRegs || (navigator.serviceWorker && navigator.serviceWorker.getRegistrations);
      const regs = navigator.serviceWorker ? await gr.call(navigator.serviceWorker) : [];
      const path = (u) => { try { return new URL(u).pathname; } catch { return String(u); } };
      let s = null;
      try { s = JSON.parse(sessionStorage.getItem(K)); } catch { /* 忽略 */ }
      let rec = [];
      try { rec = JSON.parse(localStorage.getItem("__site_iso_recovery") || "[]"); } catch { /* 忽略 */ }
      const migKeys = Object.keys(localStorage).filter((k) => k.indexOf("__site_iso_mig:") === 0);
      return {
        path: location.pathname, search: location.search, isolated: window.crossOriginIsolated,
        controller: navigator.serviceWorker && navigator.serviceWorker.controller ? path(navigator.serviceWorker.controller.scriptURL) : null,
        regs: regs.map((r) => ({ scope: path(r.scope), script: path((r.active || r.waiting || r.installing || {}).scriptURL || "") })),
        coiScriptTag: !!document.querySelector('script[src*="coi-serviceworker"]'),
        session: s && { key: s.key, team: (s.team || []).map((t) => t.hero_id), rev: s.rev, syncedRev: s.syncedRev, pending: s.pendingUpgrade ? s.pendingUpgrade.id : null, hold: !!s.migrationHold },
        tab: (() => { try { return JSON.parse(sessionStorage.getItem("__site_iso_tab")); } catch { return null; } })(),
        problem: (() => { const n = document.querySelector('[data-testid="isolation-problem"]'); return n ? n.getAttribute("data-problem") : null; })(),
        phase: window.__siteIsolation ? window.__siteIsolation.phase : null,
        recovery: rec.map((e) => ({ reason: e.reason, key: e.key })),
        migRecords: migKeys.length,
        notice: (() => { const n = document.querySelector('[data-testid="migration-hold"]'); return n ? n.innerText.replace(/\s+/g, " ").slice(0, 400) : null; })(),
        holdButtons: [...document.querySelectorAll('[data-testid="migration-hold"] button')].map((b) => b.innerText.trim()),
      };
    }, K);
  const legacyReg = (p) => p.regs.some((r) => r.scope === "/" && r.script === "/coi-serviceworker.js");
  const sameTeam = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const gasSince = async (t) => (await H.gasLog(page)).filter((e) => e.t >= t);
  const savedTeams = (list) => list.filter((e) => e.action === "save_profile").map((e) => (e.saved ? e.saved.team : null));
  const serverTeam = async (key) =>
    page.evaluate((key) => {
      const d = JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}");
      const p = d.profiles && d.profiles[key];
      return p ? (p.team || []).map((t) => t.hero_id) : null;
    }, key);
  const serverProfile = (key) =>
    page.evaluate((key) => {
      const d = JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}");
      return (d.profiles && d.profiles[key]) || null;
    }, key);
  const lv = (p, id) => ((p && p.heroes) || []).find((h) => h.hero_id === id)?.level ?? 1;
  // 更新前的頁面送出的升級，稍晚才在伺服器完成（直接改 mock 後端，和 Codex 的補測相同）
  const lateUpgrade = (key) =>
    page.evaluate((key) => {
      const k = "__shenma_mock_gas_db";
      const db = JSON.parse(localStorage.getItem(k));
      db.profiles[key].gold = 900;
      db.profiles[key].heroes = [{ hero_id: "guan_yu", level: 2, star: 0, atk: 160, def: 128, hp: 1600 }];
      localStorage.setItem(k, JSON.stringify(db));
    }, key);
  const WRITE_ACTIONS = ["save_profile", "upgrade_hero", "save_result", "create_profile"];
  const writesOf = (list) => list.filter((e) => WRITE_ACTIONS.includes(e.action)).map((e) => e.action);
  const teamIds = (p) => ((p && p.team) || []).map((x) => x.hero_id);
  // 寫入限制中實際操作 UI：主頁沒有開戰（戰場上有說明、沒有「迎戰」）；隊伍視窗點選武將後「儲存隊伍」停用並說明；
  // 武將詳情的升級按鈕停用並說明。停用的按鈕另外用程式點一次，確認沒有任何效果（之後由呼叫端檢查寫入請求）
  const heldUi = async (teamClicks) => {
    const r = {};
    r.battleHold = (await page.locator('[data-testid="battle-hold"]').count()) > 0;
    r.startBtn = await page.getByRole("button", { name: "迎戰", exact: true }).count();
    await H.clickButton(page, "隊伍");
    await page.waitForSelector("text=儲存隊伍");
    for (const name of teamClicks) await page.locator('div[class*="modalPanel"]').getByText(name).first().click();
    r.teamHold = (await page.locator('[data-testid="team-hold"]').count()) > 0;
    r.teamSaveDisabled = await page.getByRole("button", { name: "儲存隊伍" }).isDisabled();
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => x.innerText.trim() === "儲存隊伍");
      if (b) b.click();
    });
    r.teamSavedText = (await page.locator("text=隊伍已儲存").count()) > 0;
    await H.clickButton(page, "關閉");
    await H.clickButton(page, "武將");
    await page.waitForSelector('[class*="heroName"]');
    await page.locator('[class*="heroName"]', { hasText: "關羽" }).first().click();
    const up = page.getByRole("button", { name: /^升級 \(-\d+ 點\)$/ });
    await up.waitFor({ timeout: 10000 });
    r.upgradeHold = (await page.locator('[data-testid="upgrade-hold"]').count()) > 0;
    r.upgradeDisabled = await up.isDisabled();
    await page.evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /^升級 \(-\d+ 點\)$/.test(x.innerText.trim()));
      if (b) b.click();
    });
    for (let j = 0; j < 3 && (await page.locator('button[class*="modalClose"]').count()) > 0; j++) {
      await page.locator('button[class*="modalClose"]').last().click();
      await H.sleep(300);
    }
    return r;
  };
  const uiHeld = (u) => !!u && u.battleHold && u.startBtn === 0 && u.teamHold && u.teamSaveDisabled && !u.teamSavedText && u.upgradeHold && u.upgradeDisabled;
  // 「存檔處理暫停」提示裡的按鈕：開發模式左下角的 Next 徽章會蓋住「重試」（正式版沒有），用程式點擊同一個按鈕
  const clickProblemButton = (name) =>
    page.evaluate((name) => {
      const b = [...document.querySelectorAll('[data-testid="isolation-problem"] button')].find((x) => x.innerText.trim() === name);
      if (!b) throw new Error("找不到按鈕 " + name);
      b.click();
    }, name);
  // 依序點選武將（加入或移出隊伍）後儲存；mock 武將每位花費 8、容量 11，隊伍只能放一位
  const toggleTeam = async (...names) => {
    await H.clickButton(page, "隊伍");
    await page.waitForSelector("text=儲存隊伍");
    for (const name of names) await page.locator('div[class*="modalPanel"]').getByText(name).first().click();
    await H.clickButton(page, "儲存隊伍");
    await H.clickButton(page, "關閉");
  };
  const setup = (key, profile) =>
    page.evaluate(([key, profile]) => {
      localStorage.setItem("shenma_player_key", key);
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [key]: profile }, battle_logs: [] }));
    }, [key, profile]);
  const clearFaults = async () => {
    await page
      .evaluate(() => ["__r13_unregister", "__r13_getregs", "__r13_ssfail"].forEach((k) => localStorage.removeItem(k)))
      .catch(() => {});
  };
  // 頁面穩定：遷移狀態結束（或舊版沒有遷移），網址與狀態連續兩次相同；expectHud 時等到神馬 HUD 出現
  const settle = async (expectHud, timeout = 120000) => {
    const deadline = Date.now() + timeout;
    let last = "";
    let st = null;
    for (;;) {
      await page.waitForLoadState("load").catch(() => {});
      st = await page
        .evaluate(() => ({
          url: location.pathname + location.search,
          phase: window.__siteIsolation ? window.__siteIsolation.phase : "none",
          hud: !!document.querySelector('[title="切換關卡"]'),
        }))
        .catch(() => null);
      if (st) {
        const done = ["ready", "failed", "unavailable", "uncertain", "none"].includes(st.phase) && (!expectHud || st.hud);
        const key = JSON.stringify(st);
        if (done && key === last) return st;
        last = key;
      }
      if (Date.now() > deadline) return { timeout: true, ...st };
      await H.sleep(1200);
    }
  };
  // 強制重新整理（Ctrl+Shift+R）：只有這一次導覽略過 SW；之後頁面自己發起的導覽照常經過 SW
  const forceNav = async (url) => {
    await cdp.send("Network.setBypassServiceWorker", { bypass: true });
    const req = page.waitForRequest((r) => r.isNavigationRequest() && r.frame() === page.mainFrame(), { timeout: 30000 });
    const nav = (url ? page.goto(url, { waitUntil: "commit" }) : page.reload({ waitUntil: "commit" })).catch((e) => e);
    await req.catch(() => {});
    await cdp.send("Network.setBypassServiceWorker", { bypass: false });
    await nav;
  };
  // SPA 導覽：點頁面上的 Next Link（連結可能在收合的選單裡，用程式點擊，同樣走 Link 的 onClick）
  const spaClick = async (href) => {
    await page.waitForFunction((h) => !!document.querySelector(`a[href="${h}"]`), href, { timeout: 30000 });
    await page.evaluate((h) => document.querySelector(`a[href="${h}"]`).click(), href);
  };
  // 舊網站留下的狀態：根目錄範圍的 coi 註冊＋兩份 session。回傳重現後（仍在舊狀態的靜態頁）的原始快照
  const plantLegacy = async ({ key, profile, nonIso, iso }) => {
    await clearFaults();
    await H.resetOrigin(page);
    await page.goto(PLANT);
    await setup(key, profile);
    await page.evaluate(async () => {
      // 舊版 layout 的做法：每一頁都用 coi-serviceworker.js 註冊（範圍是根目錄）
      const reg = await navigator.serviceWorker.register("/coi-serviceworker.js");
      const w = reg.installing || reg.waiting || reg.active;
      if (w && w.state !== "activated") await new Promise((r) => w.addEventListener("statechange", () => w.state === "activated" && r()));
    });
    if (nonIso) {
      await forceNav(PLANT);
      await page.waitForLoadState("load");
      if (await page.evaluate(() => window.crossOriginIsolated)) throw new Error("plant：略過 SW 的頁面仍是隔離狀態");
      await page.evaluate(([K, v]) => sessionStorage.setItem(K, JSON.stringify(v)), [K, nonIso]);
    }
    await page.goto(PLANT);
    if (!(await page.evaluate(() => window.crossOriginIsolated))) throw new Error("plant：經過 coi SW 的頁面不是隔離狀態");
    if (iso) await page.evaluate(([K, v]) => sessionStorage.setItem(K, JSON.stringify(v)), [K, iso]);
    const iso0 = await probe();
    // 非隔離那一份的原始內容：只讀，不寫（讀取不會改變切換時的行為）
    return { iso: iso0 };
  };
  const scenario = async (name, fn) => {
    const t0 = Date.now();
    try {
      await fn();
    } catch (e) {
      out[name] = { ...(out[name] || {}), error: String((e && e.stack) || e).slice(0, 600) };
      run.check(`${name} 執行完成（沒有例外）`, false, out[name].error);
    }
    out[name] = { ...(out[name] || {}), sec: Math.round((Date.now() - t0) / 1000) };
  };

  // ════ A：新使用者（沒有任何舊 SW）════
  const A = "test_r13_new";
  await scenario("A", async () => {
    await clearFaults();
    await H.resetOrigin(page);
    await setup(A, prof(["guan_yu", "zhao_yun"]));
    let t = Date.now();
    await page.goto(SHENMA);
    await settle(true);
    const p1 = await probe();
    out.A = { p1, navs1: navsSince(t) };
    run.check("A-1 新使用者：神馬主頁不是跨來源隔離、沒有 SW 控制頁面、沒有根目錄的 coi 註冊，頁面也不再載入 coi 腳本",
      p1.isolated === false && p1.controller === null && !p1.regs.some((r) => r.scope === "/") && !p1.coiScriptTag && p1.phase === "ready", p1);
    // 改隊伍（移除趙雲）→ 一般重新整理：未同步的修改保留並補送
    await H.clickButton(page, "隊伍");
    await page.waitForSelector("text=儲存隊伍");
    await page.locator('div[class*="modalPanel"]').getByText("趙雲").first().click();
    await H.clickButton(page, "儲存隊伍");
    await H.clickButton(page, "關閉");
    await H.sleep(800);
    t = Date.now();
    await page.reload();
    await settle(true);
    await H.sleep(2000);
    const p2 = await probe();
    const g2 = await gasSince(t);
    out.A.p2 = p2;
    out.A.saves2 = savedTeams(g2);
    run.check("A-2 一般重新整理：仍是非隔離，未同步的隊伍（只剩關羽）保留並補送",
      p2.isolated === false && p2.session && sameTeam(p2.session.team, ["guan_yu"]) && out.A.saves2.length >= 1 && out.A.saves2.every((x) => sameTeam(x, ["guan_yu"])), { p2, saves: out.A.saves2 });
    t = Date.now();
    await forceNav(null);
    await settle(true);
    await H.sleep(2000);
    const p3 = await probe();
    out.A.p3 = p3;
    out.A.navs3 = navsSince(t);
    out.A.saves3 = savedTeams(await gasSince(t));
    run.check("A-3 強制重新整理：仍是非隔離（不再切換），隊伍不變，沒有保存其他隊伍，沒有自動重新載入",
      p3.isolated === false && p3.session && sameTeam(p3.session.team, ["guan_yu"]) && out.A.saves3.every((x) => sameTeam(x, ["guan_yu"])) && out.A.navs3.length === 1,
      { p3, navs: out.A.navs3, saves: out.A.saves3 });
    // 首頁、獨立戰鬥頁（實際導覽）
    await page.goto(H.BASE + "/");
    await settle(false);
    const home = await probe();
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_1");
    const battleOk = await page
      .waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 })
      .then(() => true, () => false);
    const battle = await probe();
    out.A.home = home;
    out.A.battle = { ...battle, ok: battleOk };
    run.check("A-4 首頁與獨立戰鬥頁都不是跨來源隔離；戰鬥頁正常就緒，存檔仍是只剩關羽",
      home.isolated === false && battle.isolated === false && battleOk && battle.session && sameTeam(battle.session.team, ["guan_yu"]), { home, battle, battleOk });
  });

  // ════ H：bgRemover 往返（延續 A 的分頁與存檔）════
  await scenario("H", async () => {
    await page.goto(H.BASE + "/");
    await settle(false);
    let t = Date.now();
    await spaClick("/bgRemover");
    await page.waitForFunction(() => location.pathname === "/bgRemover" && window.crossOriginIsolated === true, null, { timeout: 60000 }).catch(() => {});
    await settle(false);
    const p1 = await probe();
    out.H = { p1, navs1: navsSince(t) };
    run.check("H-1 首頁用 SPA 連結進入 bgRemover：重新載入一次後成為跨來源隔離，由範圍只有 /bgRemover 的 coi SW 控制，沒有根目錄註冊",
      p1.isolated === true && p1.controller === "/coi-serviceworker.js" && p1.regs.some((r) => r.scope === "/bgRemover" && r.script === "/coi-serviceworker.js") && !p1.regs.some((r) => r.scope === "/") && out.H.navs1.length === 1,
      { p1, navs: out.H.navs1 });
    // 實際去背：產生一張白底、深色人形的圖片（沒有任何個人資料）
    const b64 = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 320;
      c.height = 320;
      const g = c.getContext("2d");
      g.fillStyle = "#ffffff";
      g.fillRect(0, 0, 320, 320);
      g.fillStyle = "#1d3557";
      g.beginPath();
      g.arc(160, 95, 45, 0, Math.PI * 2);
      g.fill();
      g.fillRect(105, 145, 110, 150);
      return c.toDataURL("image/png").split(",")[1];
    });
    const started = Date.now();
    await page.setInputFiles('input[type="file"]', { name: "r13-figure.png", mimeType: "image/png", buffer: Buffer.from(b64, "base64") });
    const done = await page
      .waitForFunction(() => !!document.querySelector('img[alt="Result"]') || /去背過程中發生錯誤/.test(document.body.innerText), null, { timeout: 480000, polling: 1000 })
      .then(() => true, () => false);
    const result = await page.evaluate(async () => {
      const img = document.querySelector('img[alt="Result"]');
      const error = /去背過程中發生錯誤/.test(document.body.innerText);
      if (!img) return { img: false, error };
      await img.decode().catch(() => {});
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d");
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      let transparent = 0, opaque = 0;
      for (let i = 3; i < d.length; i += 4) {
        if (d[i] < 16) transparent += 1;
        else if (d[i] > 240) opaque += 1;
      }
      const at = (x, y) => d[(y * c.width + x) * 4 + 3];
      return { img: true, error, w: c.width, h: c.height, transparent, opaque, cornerAlpha: at(2, 2), centerAlpha: at(160, 200) };
    });
    out.H.removal = { done, sec: Math.round((Date.now() - started) / 1000), ...result, shot: await H.shot(page, "r13-h-bgremover-result") };
    run.check("H-2 bgRemover 實際完成去背：輸出與原圖同尺寸，背景角落變透明、人形主體保留不透明",
      result.img && !result.error && result.w === 320 && result.h === 320 && result.cornerAlpha < 16 && result.centerAlpha > 200 && result.transparent > 0 && result.opaque > 0, out.H.removal);
    // SPA 回首頁 → 重新載入一次成為非隔離；分頁的存檔不受影響
    t = Date.now();
    await spaClick("/");
    await page.waitForFunction(() => window.crossOriginIsolated === false, null, { timeout: 60000 }).catch(() => {});
    await settle(false);
    const p3 = await probe();
    out.H.p3 = p3;
    out.H.navs3 = navsSince(t);
    run.check("H-3 從 bgRemover 用 SPA 回首頁：重新載入一次成為非隔離，存檔仍是只剩關羽",
      p3.isolated === false && p3.path === "/" && p3.search === "" && p3.session && sameTeam(p3.session.team, ["guan_yu"]) && out.H.navs3.length === 1, { p3, navs: out.H.navs3 });
    t = Date.now();
    await spaClick("/shenmaSanguo");
    await settle(true);
    await H.sleep(1500);
    const p4 = await probe();
    out.H.p4 = p4;
    out.H.navs4 = navsSince(t);
    out.H.saves4 = savedTeams(await gasSince(t));
    run.check("H-4 首頁 SPA 進入神馬主頁：非隔離、沒有額外重新載入，存檔只剩關羽，沒有保存其他隊伍",
      p4.isolated === false && p4.session && sameTeam(p4.session.team, ["guan_yu"]) && out.H.navs4.length === 0 && out.H.saves4.every((x) => sameTeam(x, ["guan_yu"])), { p4, navs: out.H.navs4, saves: out.H.saves4 });
    t = Date.now();
    await page.goto(H.BASE + "/bgRemover");
    await settle(false);
    const p5 = await probe();
    out.H.p5 = p5;
    out.H.navs5 = navsSince(t);
    run.check("H-5 直接導覽到 bgRemover：已經有範圍 SW，第一次載入就是跨來源隔離（沒有額外重新載入）",
      p5.isolated === true && out.H.navs5.length === 1, { p5, navs: out.H.navs5 });
    t = Date.now();
    await spaClick("/shenmaSanguo");
    await page.waitForFunction(() => location.pathname === "/shenmaSanguo" && window.crossOriginIsolated === false, null, { timeout: 60000 }).catch(() => {});
    await settle(true);
    await H.sleep(1500);
    const p6 = await probe();
    out.H.p6 = p6;
    out.H.navs6 = navsSince(t);
    out.H.saves6 = savedTeams(await gasSince(t));
    run.check("H-6 從 bgRemover 用 SPA 進入神馬主頁：先重新載入成為非隔離才初始化，存檔只剩關羽，沒有保存其他隊伍",
      p6.isolated === false && p6.session && sameTeam(p6.session.team, ["guan_yu"]) && out.H.navs6.length === 1 && out.H.saves6.every((x) => sameTeam(x, ["guan_yu"])), { p6, navs: out.H.navs6, saves: out.H.saves6 });
  });

  // ════ J：bobaSurvivors（Godot，無執行緒版本）在非隔離狀態下實際啟動 ════
  await scenario("J", async () => {
    await page.goto(H.BASE + "/bobaSurvivors");
    await settle(false);
    const p = await probe();
    const frame = await (async () => {
      for (let i = 0; i < 60; i++) {
        const f = page.frames().find((x) => /\/games\/bobaSurvivors\//.test(x.url()));
        if (f) return f;
        await H.sleep(500);
      }
      return null;
    })();
    let started = null;
    if (frame) {
      started = await frame
        .waitForFunction(() => !document.getElementById("status") || /Error|missing/i.test((document.getElementById("status-notice") || {}).innerText || ""), null, { timeout: 180000, polling: 1000 })
        .then(() => frame.evaluate(() => ({ overlay: !!document.getElementById("status"), notice: ((document.getElementById("status-notice") || {}).innerText || "").slice(0, 200), canvas: !!document.querySelector("canvas") })))
        .catch((e) => ({ error: String(e).slice(0, 200) }));
    }
    out.J = { p, frame: frame ? frame.url().replace(H.BASE, "") : null, started, shot: await H.shot(page, "r13-j-boba") };
    run.check("J-1 bobaSurvivors：頁面非隔離，Godot 載入完成（載入畫面移除、沒有缺少功能的錯誤）",
      p.isolated === false && !!started && started.overlay === false && started.canvas === true && !started.error, out.J);
  });

  // ════ B：E5（舊 root SW 使用者；隔離那一份有未同步隊伍＋待確認升級；一般載入）════
  const B = "test_r13_e5";
  await scenario("B", async () => {
    const server = prof(["guan_yu", "zhao_yun"]);
    const plant = await plantLegacy({
      key: B, profile: server,
      nonIso: sess(B, ["guan_yu", "zhao_yun"], { rev: 0, synced: 0 }),
      iso: sess(B, ["zhao_yun"], { rev: 1, synced: 0, pending: { id: "r13-op", hero_id: "guan_yu", base: server, sent_at: Date.now(), state: "in_flight" } }),
    });
    out.B = { plant };
    let t = Date.now();
    await page.goto(SHENMA);
    await settle(true);
    await H.sleep(2500);
    const p1 = await probe();
    const g1 = await gasSince(t);
    out.B.p1 = p1;
    out.B.navs1 = navsSince(t);
    out.B.gas1 = H.countActions(g1);
    const unconfirmed1 = await page.evaluate(() => !!document.querySelector('[data-testid="upgrade-unconfirmed"]'));
    run.check("B-1 一般載入：備份隔離那一份後換成非隔離（重新載入一次），根目錄 coi 註冊已移除",
      p1.isolated === false && !legacyReg(p1) && p1.phase === "ready" && out.B.navs1.length === 2 && p1.migRecords === 0, { p1, navs: out.B.navs1 });
    run.check("B-2 未同步的隊伍（只剩趙雲）與待確認升級 r13-op 完整保留，畫面顯示待確認",
      p1.session && sameTeam(p1.session.team, ["zhao_yun"]) && p1.session.pending === "r13-op" && p1.session.rev >= 1 && unconfirmed1, { session: p1.session, unconfirmed1 });
    run.check("B-3 待確認期間沒有送出保存、沒有重送升級（不會重複扣款）；只重新讀取確認",
      !g1.some((e) => e.action === "save_profile" || e.action === "upgrade_hero") && g1.some((e) => e.action === "get_profile"), out.B.gas1);
    t = Date.now();
    await forceNav(null);
    await settle(true);
    await H.sleep(2500);
    const p2 = await probe();
    const g2 = await gasSince(t);
    out.B.p2 = p2;
    out.B.navs2 = navsSince(t);
    out.B.gas2 = H.countActions(g2);
    run.check("B-4 之後強制重新整理：仍是非隔離，未同步隊伍與待確認升級都還在，沒有保存、沒有重送升級（Round 11 E5 在這一步遺失）",
      p2.isolated === false && p2.session && sameTeam(p2.session.team, ["zhao_yun"]) && p2.session.pending === "r13-op" &&
        !g2.some((e) => e.action === "save_profile" || e.action === "upgrade_hero") && out.B.navs2.length === 1,
      { p2, gas: out.B.gas2, navs: out.B.navs2 });
    await page.goto(H.BASE + "/");
    await settle(false);
    await page.goto(SHENMA);
    await settle(true);
    const p3 = await probe();
    out.B.p3 = p3;
    run.check("B-5 首頁往返（實際導覽）後仍保留", p3.isolated === false && p3.session && p3.session.pending === "r13-op" && sameTeam(p3.session.team, ["zhao_yun"]), p3);
  });

  // ════ C：E4（非隔離那一份有較舊的未同步修改，隔離那一份是已保存的新隊伍；一般載入）════
  const C = "test_r13_e4";
  await scenario("C", async () => {
    const plant = await plantLegacy({
      key: C, profile: prof(["zhao_yun"]),
      nonIso: sess(C, ["guan_yu"], { rev: 1, synced: 0 }),
      iso: sess(C, ["zhao_yun"], { rev: 2, synced: 2 }),
    });
    out.C = { plant };
    let t = Date.now();
    await page.goto(SHENMA);
    await settle(true);
    await H.sleep(2500);
    const p1 = await probe();
    out.C.p1 = p1;
    out.C.saves1 = savedTeams(await gasSince(t));
    out.C.server1 = await serverTeam(C);
    run.check("C-1 一般載入：採用隔離那一份（已保存的趙雲隊伍），舊的關羽隊伍沒有被送出，伺服器維持趙雲",
      p1.isolated === false && p1.session && sameTeam(p1.session.team, ["zhao_yun"]) && !out.C.saves1.some((x) => sameTeam(x, ["guan_yu"])) && sameTeam(out.C.server1, ["zhao_yun"]),
      { p1, saves: out.C.saves1, server: out.C.server1 });
    run.check("C-2 被取代的舊暫存只保留在復原區（replaced），不顯示提示、不自動採用",
      p1.recovery.some((e) => e.reason === "replaced") && !p1.notice, { recovery: p1.recovery, notice: p1.notice });
    t = Date.now();
    await forceNav(null);
    await settle(true);
    await H.sleep(2500);
    const p2 = await probe();
    out.C.p2 = p2;
    out.C.saves2 = savedTeams(await gasSince(t));
    out.C.server2 = await serverTeam(C);
    run.check("C-3 之後強制重新整理：仍是趙雲隊伍，沒有送出舊的關羽隊伍（Round 11 E4 在這一步把伺服器退回舊隊伍）",
      p2.isolated === false && p2.session && sameTeam(p2.session.team, ["zhao_yun"]) && !out.C.saves2.some((x) => sameTeam(x, ["guan_yu"])) && sameTeam(out.C.server2, ["zhao_yun"]),
      { p2, saves: out.C.saves2, server: out.C.server2 });
  });

  // ════ D：強制重新整理是新程式的第一次載入；非隔離那一份沒寫過 ════
  const D = "test_r13_force_clean";
  await scenario("D", async () => {
    const plant = await plantLegacy({ key: D, profile: prof(["guan_yu", "zhao_yun"]), iso: sess(D, ["zhao_yun"], { rev: 1, synced: 0 }) });
    out.D = { plant };
    const t = Date.now();
    await forceNav(SHENMA);
    await settle(true);
    await H.sleep(2500);
    const p1 = await probe();
    out.D.p1 = p1;
    out.D.navs1 = navsSince(t);
    out.D.saves1 = savedTeams(await gasSince(t));
    run.check("D-1 強制重新整理進入神馬主頁：先回到隔離狀態備份、再換成非隔離；未同步的趙雲隊伍保留並補送，沒有保存其他隊伍",
      p1.isolated === false && !legacyReg(p1) && p1.session && sameTeam(p1.session.team, ["zhao_yun"]) &&
        out.D.saves1.length >= 1 && out.D.saves1.every((x) => sameTeam(x, ["zhao_yun"])) && out.D.navs1.length === 3,
      { p1, navs: out.D.navs1, saves: out.D.saves1 });
  });

  // ════ E：強制重新整理是第一次載入；非隔離那一份有較舊的未同步修改（E4 的強制重新整理版）════
  const E = "test_r13_force_stale";
  await scenario("E", async () => {
    const plant = await plantLegacy({
      key: E, profile: prof(["zhao_yun"]),
      nonIso: sess(E, ["guan_yu"], { rev: 1, synced: 0 }),
      iso: sess(E, ["zhao_yun"], { rev: 2, synced: 2 }),
    });
    out.E = { plant };
    let t = Date.now();
    await forceNav(SHENMA);
    await settle(true);
    await H.sleep(2500);
    const p1 = await probe();
    out.E.p1 = p1;
    out.E.navs1 = navsSince(t);
    out.E.saves1 = savedTeams(await gasSince(t));
    out.E.server1 = await serverTeam(E);
    run.check("E-1 無法確認新舊的舊暫存（關羽）沒有自動送出；改用雲端存檔（趙雲），伺服器維持趙雲，根目錄 coi 註冊已移除",
      p1.isolated === false && !legacyReg(p1) && !out.E.saves1.some((x) => sameTeam(x, ["guan_yu"])) && sameTeam(out.E.server1, ["zhao_yun"]) &&
        p1.session && sameTeam(p1.session.team, ["zhao_yun"]),
      { p1, navs: out.E.navs1, saves: out.E.saves1, server: out.E.server1 });
    // 平常只顯示簡短說明；按「說明」展開原因與更新前暫存的摘要
    await page.locator('[data-testid="migration-hold"]').getByRole("button", { name: "說明" }).click();
    const expanded = await page.evaluate(() => (document.querySelector('[data-testid="migration-hold"]') || {}).innerText || "");
    out.E.expanded = expanded.replace(/s+/g, " ").slice(0, 500);
    out.E.shot = await H.shot(page, "r13-e-hold-notice");
    await page.locator('[data-testid="migration-hold"]').getByRole("button", { name: "收合" }).click();
    run.check("E-2 C13-F 限制可見：「存檔暫停保存」一直顯示；「說明」展開原因與更新前暫存的摘要（隊伍關羽、保留 7 天），可以下載；沒有「改用這份暫存」「捨棄」或關閉的按鈕；復原資料保留，分頁紀錄 lost、存檔記上限制標記",
      !!p1.notice && /存檔暫停保存/.test(p1.notice) && /關羽/.test(out.E.expanded) && /7 天/.test(out.E.expanded) && sameTeam(p1.holdButtons, ["說明", "下載暫存"]) &&
        p1.recovery.some((e) => e.reason === "unverified") && p1.session && p1.session.hold === true && p1.tab && p1.tab.lost === true,
      { notice: p1.notice, expanded: out.E.expanded, buttons: p1.holdButtons, recovery: p1.recovery, session: p1.session, tab: p1.tab });
    // 下載暫存（唯讀備份）：內容是更新前的暫存，不含存檔金鑰
    const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 15000 }), page.getByRole("button", { name: "下載暫存" }).click()]);
    let text = "";
    for await (const c of await dl.createReadStream()) text += c;
    const file = JSON.parse(text);
    out.E.download = { name: dl.suggestedFilename(), team: teamIds(file.save), hasKey: !!(file.save && "key" in file.save) };
    // 實際操作受限的 UI（隊伍改成只有關羽、升級關羽），等過保存時間後重新整理
    t = Date.now();
    out.E.ui = await heldUi(["趙雲", "關羽"]);
    await H.sleep(33000);
    await page.reload();
    await settle(true);
    await H.sleep(2500);
    const p2 = await probe();
    out.E.p2 = p2;
    out.E.writes2 = writesOf(await gasSince(t));
    out.E.server2 = await serverTeam(E);
    run.check("E-3 下載的暫存是更新前的關羽隊伍、不含存檔金鑰；隊伍儲存與升級停用並說明、主頁沒有開戰；等過保存時間並重新整理後，寫入請求 0，伺服器維持趙雲，限制提示與復原資料都還在",
      sameTeam(out.E.download.team, ["guan_yu"]) && !out.E.download.hasKey && uiHeld(out.E.ui) && out.E.writes2.length === 0 && sameTeam(out.E.server2, ["zhao_yun"]) &&
        /存檔暫停保存/.test(p2.notice || "") && p2.recovery.some((e) => e.reason === "unverified") && p2.session && p2.session.hold === true && sameTeam(p2.session.team, ["zhao_yun"]),
      { download: out.E.download, ui: out.E.ui, writes: out.E.writes2, server: out.E.server2, p2 });
  });

  // ════ F：強制重新整理是第一次載入；非隔離那一份是已同步的舊資料、隔離那一份有未同步修改＋待確認升級（E5 的強制重新整理版）════
  const F = "test_r13_force_e5";
  await scenario("F", async () => {
    const server = prof(["guan_yu", "zhao_yun"]);
    const plant = await plantLegacy({
      key: F, profile: server,
      nonIso: sess(F, ["guan_yu", "zhao_yun"], { rev: 0, synced: 0 }),
      iso: sess(F, ["zhao_yun"], { rev: 1, synced: 0, pending: { id: "r13-op-f", hero_id: "guan_yu", base: server, sent_at: Date.now(), state: "in_flight" } }),
    });
    out.F = { plant };
    let t = Date.now();
    await forceNav(SHENMA);
    await settle(true);
    await H.sleep(2500);
    const p1 = await probe();
    const g1 = await gasSince(t);
    out.F.p1 = p1;
    out.F.gas1 = H.countActions(g1);
    run.check("F-1 安全結果：沒有送出任何保存、沒有重送升級；改用雲端存檔；根目錄 coi 註冊已移除",
      p1.isolated === false && !legacyReg(p1) && !g1.some((e) => e.action === "save_profile" || e.action === "upgrade_hero"), { p1, gas: out.F.gas1 });
    run.check("F-2 C13-F 限制可見：「存檔暫停保存」一直顯示，沒有「知道了」或其他關閉按鈕（只有說明、下載暫存）；分頁紀錄 lost、存檔記上限制標記",
      !!p1.notice && /存檔暫停保存/.test(p1.notice) && sameTeam(p1.holdButtons, ["說明", "下載暫存"]) && p1.tab && p1.tab.lost === true && p1.session && p1.session.hold === true,
      { notice: p1.notice, buttons: p1.holdButtons, tab: p1.tab, session: p1.session });
    out.limitations.push({
      scenario: "F",
      what: "強制重新整理剛好是新程式的第一次載入，而且非隔離那一份曾被寫過：隔離那一份（未同步隊伍＋待確認升級）讀不到",
      isoSessionRecovered: !!(p1.session && p1.session.pending === "r13-op-f"),
      why: "隔離 → 非隔離時看不到隔離那一份；要讀它必須切回隔離，而切回隔離時非隔離那一份會先蓋過去（x1 機制實驗 T4）",
    });
    out.F.shot = await H.shot(page, "r13-f-hold-notice");
    // C13-F：更新前送出的升級稍晚才在伺服器完成 → 實際操作 UI（隊伍、升級、開戰）→ 等過保存時間 → 重新整理 → 再操作一次
    await lateUpgrade(F);
    t = Date.now();
    out.F.ui = await heldUi(["趙雲"]);
    await H.sleep(33000);
    await page.reload();
    await settle(true);
    await H.sleep(2500);
    const p3 = await probe();
    out.F.p3 = p3;
    out.F.ui2 = await heldUi(["趙雲"]);
    await H.sleep(33000);
    const s3 = await serverProfile(F);
    const w3 = writesOf(await gasSince(t));
    out.F.after = { gold: s3.gold, heroes: s3.heroes, team: teamIds(s3), writes: w3, gas: H.countActions(await gasSince(t)) };
    run.check("F-3 C13-F 稍晚完成的升級之後：隊伍儲存與升級停用並說明、主頁沒有開戰；等過保存時間、重新整理後再試一次，寫入請求 0（沒有保存、升級、結算、建檔），後端保有 900 與關羽 Lv2、隊伍不變",
      uiHeld(out.F.ui) && uiHeld(out.F.ui2) && w3.length === 0 && s3.gold === 900 && lv(s3, "guan_yu") === 2 && sameTeam(out.F.after.team, ["guan_yu", "zhao_yun"]),
      { ui: out.F.ui, ui2: out.F.ui2, after: out.F.after });
    run.check("F-4 重新整理不解除：限制提示仍顯示（沒有關閉按鈕）、分頁紀錄 lost、存檔有限制標記；復原資料（更新前的暫存）仍保留",
      /存檔暫停保存/.test(p3.notice || "") && sameTeam(p3.holdButtons, ["說明", "下載暫存"]) && p3.tab && p3.tab.lost === true && p3.session && p3.session.hold === true &&
        p3.recovery.some((e) => e.reason === "unverified"),
      p3);
    // 讀取照常：玩家資訊的「強制從雲端同步」讀到稍晚完成的升級（只在本機採用），限制不解除
    t = Date.now();
    await page.locator('button[class*="hudAvatar"]').click();
    await page.waitForSelector("text=強制從雲端同步", { timeout: 10000 });
    const holdInModal = (await page.locator("text=這個分頁的存檔暫停保存：不會送出任何修改").count()) > 0;
    await page.getByRole("button", { name: /強制從雲端同步/ }).click();
    await page.waitForSelector("text=資料同步成功！", { timeout: 60000 });
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(1500);
    const p5 = await probe();
    const local5 = await page.evaluate((K) => JSON.parse(sessionStorage.getItem(K) || "null"), K);
    const g5 = await gasSince(t);
    out.F.sync = { holdInModal, gold: local5 && local5.gold, lv: lv(local5, "guan_yu"), gas: H.countActions(g5), notice: p5.notice };
    run.check("F-5 限制中讀取照常：玩家資訊說明存檔暫停保存；「強制從雲端同步」讀到 900 與關羽 Lv2（本機採用），寫入請求 0，限制與提示仍在",
      holdInModal && !!local5 && local5.gold === 900 && lv(local5, "guan_yu") === 2 && writesOf(g5).length === 0 && g5.some((e) => e.action === "get_profile") &&
        !!local5.migrationHold && /存檔暫停保存/.test(p5.notice || ""),
      out.F.sync);
    // 獨立戰鬥頁同樣不開戰
    t = Date.now();
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_1");
    await page.waitForSelector('[data-testid="battle-hold"]', { timeout: 60000 }).catch(() => {});
    await H.sleep(1500);
    const battleHold = (await page.locator('[data-testid="battle-hold"]').count()) > 0;
    const g6 = await gasSince(t);
    out.F.battlePage = { battleHold, writes: writesOf(g6), notice: (await probe()).notice };
    out.F.shot6 = await H.shot(page, "r13-f-battle-page-hold");
    run.check("F-6 獨立戰鬥頁：顯示存檔暫停保存、不開始戰鬥，寫入請求 0",
      battleHold && writesOf(g6).length === 0 && /存檔暫停保存/.test(out.F.battlePage.notice || ""), out.F.battlePage);
  });

  // ════ G：舊 root SW 使用者先進 bgRemover（仍由舊 SW 隔離），再用 SPA 進入神馬 ════
  const G = "test_r13_bg_first";
  await scenario("G", async () => {
    const plant = await plantLegacy({ key: G, profile: prof(["guan_yu", "zhao_yun"]), iso: sess(G, ["zhao_yun"], { rev: 1, synced: 0 }) });
    out.G = { plant };
    await page.goto(H.BASE + "/bgRemover");
    await settle(false);
    const p1 = await probe();
    out.G.p1 = p1;
    run.check("G-1 舊使用者直接進 bgRemover：維持隔離，可以正常使用（舊的根目錄註冊這時先不動）", p1.isolated === true && p1.phase === "ready", p1);
    const t = Date.now();
    await spaClick("/shenmaSanguo");
    await page.waitForFunction(() => location.pathname === "/shenmaSanguo" && window.crossOriginIsolated === false, null, { timeout: 60000 }).catch(() => {});
    await settle(true);
    await H.sleep(2500);
    const p2 = await probe();
    out.G.p2 = p2;
    out.G.navs2 = navsSince(t);
    out.G.saves2 = savedTeams(await gasSince(t));
    run.check("G-2 SPA 進入神馬：先備份再換成非隔離，根目錄註冊移除；未同步的趙雲隊伍保留並補送，沒有保存其他隊伍",
      p2.isolated === false && !legacyReg(p2) && p2.session && sameTeam(p2.session.team, ["zhao_yun"]) && out.G.saves2.length >= 1 && out.G.saves2.every((x) => sameTeam(x, ["zhao_yun"])),
      { p2, navs: out.G.navs2, saves: out.G.saves2 });
  });

  // ════ K：查詢舊註冊一直失敗（C13-1）：不能當成沒有舊註冊 ════
  const K1 = "test_r13_lookup";
  const plantK = () =>
    plantLegacy({
      key: K1, profile: prof(["zhao_yun"]),
      nonIso: sess(K1, ["guan_yu"], { rev: 1, synced: 0 }),
      iso: sess(K1, ["zhao_yun"], { rev: 2, synced: 2 }),
    });
  await scenario("K", async () => {
    out.K = { plant: await plantK() };
    await page.evaluate(() => localStorage.setItem("__r13_getregs", "reject"));
    let t = Date.now();
    await forceNav(SHENMA);
    await page.waitForSelector('[data-testid="isolation-problem"]', { timeout: 60000 }).catch(() => {});
    await settle(false);
    await H.sleep(2000);
    const p1 = await probe();
    const g1 = (await gasSince(t)).map((e) => e.action);
    out.K.p1 = p1;
    out.K.gas1 = g1;
    out.K.shot1 = await H.shot(page, "r13-k-lookup-failed");
    run.check("K-1 C13-1 查詢舊註冊一直失敗：停在 uncertain、顯示「存檔處理暫停」；舊的未同步暫存（關羽）原封不動，沒有寫入確認標記，沒有讀取或保存存檔",
      p1.phase === "uncertain" && p1.problem === "lookup-failed" && p1.session && sameTeam(p1.session.team, ["guan_yu"]) && p1.session.rev === 1 &&
        !(p1.tab && p1.tab.trusted) && !g1.includes("save_profile") && !g1.includes("get_profile"),
      { p1, gas: g1 });
    // 改用雲端存檔繼續
    t = Date.now();
    await clickProblemButton("改用雲端存檔繼續");
    await settle(true);
    await H.sleep(2500);
    const p2 = await probe();
    const saves2 = savedTeams(await gasSince(t));
    out.K.p2 = p2;
    out.K.saves2 = saves2;
    run.check("K-2 改用雲端存檔繼續：載入雲端（趙雲），舊暫存移到復原區，沒有送出舊隊伍；分頁標成遷移狀態不明，顯示「存檔暫停保存」、存檔記上限制標記",
      p2.phase === "ready" && !p2.problem && p2.session && sameTeam(p2.session.team, ["zhao_yun"]) && !saves2.some((x) => sameTeam(x, ["guan_yu"])) &&
        /存檔暫停保存/.test(p2.notice || "") && p2.tab && p2.tab.lost === true && p2.session.hold === true,
      { p2, saves: saves2 });
    // 另一次：查詢恢復後按「重試」
    out.K.plant2 = await plantK();
    await page.evaluate(() => localStorage.setItem("__r13_getregs", "reject"));
    await forceNav(SHENMA);
    await page.waitForSelector('[data-testid="isolation-problem"]', { timeout: 60000 }).catch(() => {});
    await settle(false);
    // 查詢恢復（下一次呼叫才生效：注入只在頁面載入時覆寫，這裡改成直接放行原本的實作）
    await page.evaluate(() => {
      localStorage.removeItem("__r13_getregs");
      if (window.__r13OrigGetRegs) ServiceWorkerContainer.prototype.getRegistrations = window.__r13OrigGetRegs;
    });
    t = Date.now();
    const navK3 = navs.length;
    await clickProblemButton("重試");
    await settle(true);
    await H.sleep(2500);
    const p3 = await probe();
    const saves3 = savedTeams(await gasSince(t));
    out.K.p3 = p3;
    out.K.saves3 = saves3;
    run.check("K-3 查詢恢復後按「重試」：在原頁面重新查詢（沒有重新載入），照一般規則處理（移除舊註冊、舊暫存移到復原區），載入雲端，沒有送出舊隊伍",
      navs.length === navK3 && p3.phase === "ready" && !p3.problem && !legacyReg(p3) && p3.session && sameTeam(p3.session.team, ["zhao_yun"]) &&
        !saves3.some((x) => sameTeam(x, ["guan_yu"])) && p3.recovery.some((e) => e.reason === "unverified"),
      { p3, saves: saves3, navs: navs.length - navK3 });
    // 第三次：停在 uncertain 時自己重新整理（F5）。舊 SW 還在、查詢仍失敗：頁面會被帶回隔離狀態，
    // 非隔離那一份的舊暫存先套用過去；離開隔離也失敗時，隔離那一份不能照舊使用
    out.K.plant3 = await plantK();
    await page.evaluate(() => localStorage.setItem("__r13_getregs", "reject"));
    await forceNav(SHENMA);
    await page.waitForSelector('[data-testid="isolation-problem"]', { timeout: 60000 }).catch(() => {});
    await settle(false);
    t = Date.now();
    await page.reload();
    await settle(true);
    await H.sleep(3000);
    const p4 = await probe();
    const saves4 = savedTeams(await gasSince(t));
    out.K.p4 = p4;
    out.K.saves4 = saves4;
    out.K.server4 = await serverTeam(K1);
    run.check("K-4 停在 uncertain 時自己重新整理、離開隔離也失敗：舊暫存（關羽）不當成最新資料，沒有送出；改用雲端（趙雲），顯示「存檔暫停保存」、存檔記上限制標記",
      !saves4.some((x) => sameTeam(x, ["guan_yu"])) && sameTeam(out.K.server4, ["zhao_yun"]) && p4.session && sameTeam(p4.session.team, ["zhao_yun"]) &&
        p4.recovery.some((e) => e.reason === "unverified") && p4.session.hold === true && /存檔暫停保存/.test(p4.notice || ""),
      { p4, saves: saves4, server: out.K.server4 });
    await clearFaults();
  });

  // ════ Q：備份寫不回 session（C13-2）：不能刪除唯一的最新備份 ════
  const Q = "test_r13_quota";
  await scenario("Q", async () => {
    out.Q = { plant: await plantLegacy({ key: Q, profile: prof(["guan_yu", "zhao_yun"]), iso: sess(Q, ["zhao_yun"], { rev: 1, synced: 0 }) }) };
    await page.evaluate(() => localStorage.setItem("__r13_ssfail", "1"));
    let t = Date.now();
    await page.goto(SHENMA);
    await page.waitForSelector('[data-testid="isolation-problem"]', { timeout: 60000 }).catch(() => {});
    await settle(false);
    await H.sleep(2000);
    const p1 = await probe();
    const g1 = (await gasSince(t)).map((e) => e.action);
    out.Q.p1 = p1;
    out.Q.gas1 = g1;
    out.Q.shot1 = await H.shot(page, "r13-q-restore-failed");
    run.check("Q-1 C13-2 備份寫不回 session：顯示「存檔處理暫停」，備份保留、編號記在分頁紀錄，網址沒有標記；沒有讀取或保存存檔",
      p1.problem === "restore-failed" && p1.migRecords === 1 && p1.tab && typeof p1.tab.pendingClaim === "string" && p1.search === "" &&
        !(p1.tab && p1.tab.trusted) && !g1.includes("save_profile") && !g1.includes("get_profile"),
      { p1, gas: g1 });
    // 儲存空間恢復：拿掉注入的 setItem 覆寫
    await page.evaluate(() => {
      localStorage.removeItem("__r13_ssfail");
      if (window.__r13OrigSetItem) Storage.prototype.setItem = window.__r13OrigSetItem;
    });
    t = Date.now();
    const navQ2 = navs.length;
    await clickProblemButton("重試");
    await settle(true);
    await H.sleep(2500);
    const p2 = await probe();
    const saves2 = savedTeams(await gasSince(t));
    out.Q.p2 = p2;
    out.Q.saves2 = saves2;
    run.check("Q-2 儲存空間恢復後按「重試」（原頁面、沒有重新載入）：採用保留的備份（未同步的趙雲隊伍）並補送，備份刪除、分頁紀錄清除",
      navs.length === navQ2 && !p2.problem && p2.session && sameTeam(p2.session.team, ["zhao_yun"]) && p2.migRecords === 0 && p2.tab && p2.tab.pendingClaim === undefined &&
        saves2.length >= 1 && saves2.every((x) => sameTeam(x, ["zhao_yun"])),
      { p2, saves: saves2 });
    await clearFaults();
  });

  // ════ I：失敗時不能無限重新載入 ════
  await scenario("I", async () => {
    // I-1 coi-serviceworker.js 載入失敗（新使用者）：bgRemover 無法啟用隔離、神馬照常
    await clearFaults();
    await H.resetOrigin(page);
    const block = (r) => r.abort("failed");
    await ctx.route("**/coi-serviceworker.js", block);
    try {
      let t = Date.now();
      await page.goto(H.BASE + "/bgRemover");
      await settle(false);
      await H.sleep(6000);
      const p1 = await probe();
      const upload = await page.evaluate(() => /點擊或拖拽圖片至此/.test(document.body.innerText));
      out.I = { p1, navs1: navsSince(t), upload };
      run.check("I-1 coi 腳本載入失敗：bgRemover 停在非隔離（無法啟用），只載入一次、沒有重新載入迴圈，頁面仍可操作",
        p1.isolated === false && p1.phase === "unavailable" && out.I.navs1.length === 1 && upload, out.I);
      await setup("test_r13_i", prof(["guan_yu", "zhao_yun"]));
      t = Date.now();
      await page.goto(SHENMA);
      await settle(true);
      await H.sleep(3000);
      const p2 = await probe();
      out.I.p2 = p2;
      out.I.navs2 = navsSince(t);
      run.check("I-2 coi 腳本載入失敗時神馬主頁照常：非隔離、只載入一次", p2.isolated === false && p2.phase === "ready" && out.I.navs2.length === 1, { p2, navs: out.I.navs2 });
    } finally {
      await ctx.unroute("**/coi-serviceworker.js", block);
    }
    // I-3 移除舊 SW 失敗：照舊在隔離狀態使用，不重新載入
    const I3 = "test_r13_unreg_reject";
    await plantLegacy({ key: I3, profile: prof(["guan_yu", "zhao_yun"]), iso: sess(I3, ["zhao_yun"], { rev: 1, synced: 0 }) });
    await page.evaluate(() => localStorage.setItem("__r13_unregister", "reject"));
    let t = Date.now();
    await page.goto(SHENMA);
    await settle(true);
    await H.sleep(2500);
    const p3 = await probe();
    out.I.p3 = p3;
    out.I.navs3 = navsSince(t);
    out.I.saves3 = savedTeams(await gasSince(t));
    run.check("I-3 移除舊 SW 失敗：不重新載入，照舊在隔離狀態使用；未同步的趙雲隊伍保留並補送，備份紀錄已清除",
      p3.phase === "failed" && p3.isolated === true && out.I.navs3.length === 1 && p3.session && sameTeam(p3.session.team, ["zhao_yun"]) &&
        out.I.saves3.every((x) => sameTeam(x, ["zhao_yun"])) && p3.migRecords === 0,
      { p3, navs: out.I.navs3, saves: out.I.saves3 });
    // I-4 回報移除成功、實際沒有移除：帶著遷移編號重新載入後仍是隔離 → 停止，只重新載入一次；之後的重新整理也不再嘗試
    await clearFaults();
    const I4 = "test_r13_unreg_noop";
    await plantLegacy({ key: I4, profile: prof(["guan_yu", "zhao_yun"]), iso: sess(I4, ["zhao_yun"], { rev: 1, synced: 0 }) });
    await page.evaluate(() => localStorage.setItem("__r13_unregister", "noop"));
    t = Date.now();
    await page.goto(SHENMA);
    await settle(true);
    await H.sleep(2500);
    const p4 = await probe();
    out.I.p4 = p4;
    out.I.navs4 = navsSince(t);
    t = Date.now();
    await page.reload();
    await settle(true);
    await H.sleep(1500);
    const p5 = await probe();
    out.I.p5 = p5;
    out.I.navs5 = navsSince(t);
    run.check("I-4 移除「成功」但舊 SW 仍在：只重新載入一次就停止，照舊在隔離狀態使用，存檔保留，備份紀錄已清除；再重新整理也不再嘗試",
      p4.phase === "failed" && p4.isolated === true && out.I.navs4.length === 2 && p4.session && sameTeam(p4.session.team, ["zhao_yun"]) && p4.migRecords === 0 &&
        p5.phase === "failed" && out.I.navs5.length === 1 && p5.session && sameTeam(p5.session.team, ["zhao_yun"]),
      { p4, navs4: out.I.navs4, p5, navs5: out.I.navs5 });
    await clearFaults();
  });

  return run.finish({ out });
}
