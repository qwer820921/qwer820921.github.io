async (page) => {
  // 存檔衝突比較與備份檔預覽的鍵盤操作（瀏覽器，不需要 Godot；mock 後端）：
  // 存檔衝突：用這支腳本自己的小型版本契約後端（Node 端，exposeBinding）做出衝突——載入版本 5 → 雲端被「其他裝置」改成版本 6 →
  //   這個分頁改隊伍後保存被拒（409）→ 畫面下方的「比較並選擇」
  // - SK-1 用 Tab 走到「比較並選擇」→ Enter：有名稱的對話框（role dialog、aria-modal、名稱「比較雲端與這個分頁的存檔」），焦點在「關閉存檔比較」
  // - SK-2 嚴格循環：每按一次 Tab／Shift+Tab 等焦點穩定（260 毫秒）後都在視窗的控制項上，兩個方向各兩圈以上、順序照控制項的順序，邊界直接驗證
  // - SK-3 Esc 關閉，焦點回到「比較並選擇」；沒有任何寫入
  // - SK-4 選「使用雲端版本」→ 確認步驟：焦點在確認的說明（不在「確定」上）、仍在同一個視窗循環；「返回比較」後焦點回到「使用雲端版本」
  // - SK-5 選「保留這個分頁的版本」→「確定覆蓋雲端」：等待伺服器時說明「完成前不能關閉」、焦點留在視窗本身，Tab／Shift+Tab 不會跑到背後、
  //        Esc 不關閉、save_profile 只送一次；完成後視窗關閉，焦點交給底部的備份提示（「比較並選擇」已不在）
  // - SK-6 確認期間雲端又更新（CONFLICT_CHANGED）：沒有完成、焦點移到說明訊息；Esc 關閉回到「比較並選擇」
  // - SK-7 開啟時焦點不在任何元素上（用 JavaScript 點開）：Esc 後焦點交給底部提示的按鈕
  // - SK-8 390×844：開啟、嚴格循環、沒有橫向溢出
  // 備份檔預覽（設定頁）：
  // - BK-1 用 Tab 走到「預覽備份檔」→ Enter：對話框「預覽備份檔」，焦點在「關閉備份檔預覽」；嚴格循環
  // - BK-2 用鍵盤（Enter）開檔案選擇器、選正確的備份檔：焦點移到結果、嚴格循環（含比較表的選項）
  // - BK-3 選壞掉的檔案：焦點移到「無法預覽」的原因、仍在視窗循環
  // - BK-4 Esc 關閉，焦點回到「預覽備份檔」；整段沒有任何寫入、session 不變
  // - BK-5 390×844：開啟、嚴格循環、沒有橫向溢出
  // 全部虛構金鑰 test_sk_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_sk_conflict";
  const SHENMA = H.BASE + "/shenmaSanguo";
  const WRITES = ["create_profile", "save_profile", "save_result", "upgrade_hero"];
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  const CONFLICT = "比較雲端與這個分頁的存檔";
  const PREVIEW = "預覽備份檔";

  // ── 小型版本契約後端（Node 端；所有請求依序處理）──
  const backend = (() => {
    const profiles = new Map();
    const revs = new Map();
    const log = [];
    const holds = new Map();
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const apply = ({ action, key, payload = {} }) => {
      const p = profiles.get(key);
      const rev = revs.get(key) ?? 0;
      if (!p) return { status: 404, error: "PROFILE_NOT_FOUND" };
      if (action === "get_profile") return { status: 200, data: clone(p), rev };
      if (action === "save_profile") {
        const base = payload.base_rev;
        if (base !== undefined && base !== null && base !== rev) return { status: 409, error: "REV_CONFLICT", rev, data: clone(p) };
        profiles.set(key, clone(payload.data));
        revs.set(key, rev + 1);
        return { status: 200, success: true, rev: rev + 1, prev_rev: rev };
      }
      return { status: 400, error: "UNSUPPORTED_" + action };
    };
    return {
      log,
      seed(key, profile, rev) {
        profiles.set(key, clone(profile));
        revs.set(key, rev);
      },
      profile: (key) => clone(profiles.get(key)),
      rev: (key) => revs.get(key) ?? 0,
      hold(action) {
        holds.set(action, []);
      },
      release(action) {
        const w = holds.get(action) || [];
        holds.delete(action);
        w.forEach((f) => f());
        return w.length;
      },
      pending: (action) => (holds.get(action) || []).length,
      async handle(body) {
        const entry = { t: Date.now(), action: body.action, base_rev: body.payload?.base_rev };
        log.push(entry);
        if (holds.has(body.action)) await new Promise((r) => holds.get(body.action).push(r));
        const res = apply(body);
        entry.status = res.status;
        return res;
      },
    };
  })();
  if (!ctx.__skGasInstalled) {
    ctx.__skGasInstalled = true;
    await ctx.exposeBinding("__shenmaSkGas", async (source, body) => ctx.__skBackend.handle(body));
    await ctx.addInitScript(() => {
      if (window.top !== window || window.__SK_GAS__) return;
      window.__SK_GAS__ = true;
      const SHARED = ["get_profile", "create_profile", "save_profile", "save_result", "upgrade_hero"];
      const inner = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const url = typeof input === "string" ? input : (input && input.url) || String(input);
        if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_sk_backend") === "1" && typeof window.__shenmaSkGas === "function") {
          let body = {};
          try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
          if (SHARED.includes(body.action)) {
            const res = await window.__shenmaSkGas(body);
            await new Promise((r) => setTimeout(r, 50));
            return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
          }
        }
        return inner(input, init);
      };
    });
  }
  ctx.__skBackend = backend;
  const seedProfile = {
    nickname: "鍵盤衝突", level: 1, exp: 0, gold: 1000, capacity: 40, max_stage: "chapter1_7", heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
  };

  // ── 鍵盤輔助（和 hud-keyboard-web.js 相同的判定；控制項只算看得到的）──
  const focusAt = () =>
    page.evaluate(() => {
      const a = document.activeElement;
      const dialogs = [...document.querySelectorAll('[role="dialog"]')];
      const nameOf = (d) => d.getAttribute("aria-label") || (d.getAttribute("aria-labelledby") && (document.getElementById(d.getAttribute("aria-labelledby")) || {}).textContent) || null;
      const box = dialogs.find((d) => a && d.contains(a)) || null;
      return {
        tag: a ? a.tagName : null,
        name: a && a.getAttribute ? (a.getAttribute("aria-label") || a.getAttribute("title") || (a.labels && a.labels[0] ? a.labels[0].innerText.trim() : "") || (a.innerText || "").trim()).slice(0, 40) : "",
        testid: a && a.getAttribute ? a.getAttribute("data-testid") : null,
        dialog: box ? nameOf(box) : null,
        isPanel: !!(box && a === box),
        hasFocus: document.hasFocus(),
        body: a === document.body || a === null,
        inBottom: !!(a && a.closest && a.closest('[class*="bottomNotices"]')),
        connected: !!(a && a.isConnected),
      };
    });
  const dialogInfo = (name) =>
    page.evaluate((name) => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.getAttribute("aria-labelledby") && (document.getElementById(x.getAttribute("aria-labelledby")) || {}).textContent.trim() === name);
      return d ? { modal: d.getAttribute("aria-modal"), busy: d.getAttribute("aria-busy"), described: !!(d.getAttribute("aria-describedby") && document.getElementById(d.getAttribute("aria-describedby"))) } : null;
    }, name);
  const press = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(80);
  };
  const settle = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(260);
    return focusAt();
  };
  const settleWalk = async (n, shift = false) => {
    const seen = [];
    for (let i = 0; i < n; i++) seen.push(await settle(shift ? "Shift+Tab" : "Tab"));
    return seen;
  };
  const tabUntil = async (pred, max = 60, shift = false) => {
    for (let i = 1; i <= max; i++) {
      await press(shift ? "Shift+Tab" : "Tab");
      const f = await focusAt();
      if (pred(f)) return { f, n: i };
    }
    return { f: await focusAt(), n: -1 };
  };
  const tabTo = async (pred) => {
    const a = await tabUntil(pred, 40);
    return a.n > 0 ? a : tabUntil(pred, 80, true);
  };
  const controls = (name) =>
    page.evaluate(({ name, FOCUSABLE }) => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.getAttribute("aria-labelledby") && (document.getElementById(x.getAttribute("aria-labelledby")) || {}).textContent.trim() === name);
      const label = (el) => (el.getAttribute("aria-label") || el.getAttribute("title") || (el.labels && el.labels[0] ? el.labels[0].innerText.trim() : "") || (el.innerText || "").trim()).slice(0, 40);
      return d ? [...d.querySelectorAll(FOCUSABLE)].filter((el) => el.checkVisibility()).map(label) : [];
    }, { name, FOCUSABLE });
  const focusEdge = (name, which) =>
    page.evaluate(({ name, which, FOCUSABLE }) => {
      const d = [...document.querySelectorAll('[role="dialog"]')].find((x) => x.getAttribute("aria-labelledby") && (document.getElementById(x.getAttribute("aria-labelledby")) || {}).textContent.trim() === name);
      const items = [...d.querySelectorAll(FOCUSABLE)].filter((el) => el.checkVisibility());
      const el = which === "last" ? items[items.length - 1] : items[0];
      el.focus();
      return (el.getAttribute("aria-label") || el.getAttribute("title") || (el.labels && el.labels[0] ? el.labels[0].innerText.trim() : "") || (el.innerText || "").trim()).slice(0, 40);
    }, { name, which, FOCUSABLE });
  const strictCycle = async (name) => {
    const ctl = await controls(name);
    const n = ctl.length;
    const inBox = (f) => f.dialog === name && f.hasFocus && !f.body && !f.isPanel;
    const fwd = await settleWalk(2 * n + 2);
    const back = await settleWalk(2 * n + 2, true);
    const bad = [...fwd, ...back].filter((f) => !inBox(f));
    const unique = new Set(ctl).size === n;
    const follows = (seq, step) =>
      !unique || seq.every((f, i) => ctl.includes(f.name) && (i === 0 || ctl.indexOf(f.name) === (ctl.indexOf(seq[i - 1].name) + step + n) % n));
    const orderFwd = follows(fwd, 1);
    const orderBack = follows(back, -1);
    const lastName = n ? await focusEdge(name, "last") : null;
    await H.sleep(100);
    const edgeFwd = await settle("Tab");
    const firstName = n ? await focusEdge(name, "first") : null;
    await H.sleep(100);
    const edgeBack = await settle("Shift+Tab");
    const ok = n >= 1 && bad.length === 0 && orderFwd && orderBack && inBox(edgeFwd) && edgeFwd.name === ctl[0] && inBox(edgeBack) && edgeBack.name === ctl[n - 1] &&
      lastName === ctl[n - 1] && firstName === ctl[0];
    const label = (f) => (inBox(f) ? f.name : `${f.tag}/${f.dialog || "-"}/${f.body ? "body" : ""}/${f.isPanel ? "panel" : ""}/${f.hasFocus ? "focus" : "no-focus"}`);
    return { ok, n, unique, ctl, bad: bad.slice(0, 4), orderFwd, orderBack, fwd: fwd.map(label), back: back.map(label), edge: { lastName, afterTab: label(edgeFwd), firstName, afterShiftTab: label(edgeBack) } };
  };
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  const sessionOf = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
  const waitUntil = async (fn, timeout = 60000, what = "條件") => {
    const end = Date.now() + timeout;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error("等不到：" + what);
      await H.sleep(150);
    }
  };
  const writesSince = (t0) => backend.log.filter((e) => e.t >= t0 && WRITES.includes(e.action));
  // 從頁面上不在任何視窗裡的位置開始用 Tab 走
  const startFrom = async (selector) => {
    await page.locator(selector).first().click({ position: { x: 4, y: 4 } });
    await H.sleep(150);
  };
  // 在隊伍頁改隊伍，換到設定頁時立刻保存（版本不符 → 衝突）
  const makeConflict = async (heroName, cloudPatch) => {
    await page.goto(SHENMA + "/team");
    await waitUntil(async () => {
      const s = await sessionOf();
      return s && s.key === KEY && s.rev === s.syncedRev ? s : null;
    }, 90000, "隊伍頁載入");
    await H.sleep(800);
    const r = backend.rev(KEY);
    backend.seed(KEY, { ...backend.profile(KEY), ...cloudPatch }, r + 1); // 其他裝置先保存
    await page.locator('div[class*="poolCard"]', { hasText: heroName }).first().click();
    await H.sleep(200);
    await page.getByRole("button", { name: "儲存隊伍" }).click();
    await page.waitForSelector("text=隊伍已儲存", { timeout: 10000 });
    await page.goto(SHENMA + "/settings");
    await page.waitForSelector('[data-testid="save-conflict-compare"]', { timeout: 60000 });
    await H.sleep(500);
  };
  const openConflictByKeyboard = async () => {
    await startFrom('[class*="settingsCardTitle"]');
    const t = await tabTo((f) => f.testid === "save-conflict-compare");
    await press("Enter");
    await page.waitForSelector('[data-testid="save-conflict-modal"]', { timeout: 10000 });
    await H.sleep(300);
    return { reached: t.n > 0, focus: await focusAt(), info: await dialogInfo(CONFLICT) };
  };

  try {
    // ── 準備 ──
    await page.setViewportSize({ width: 1280, height: 800 });
    await H.resetOrigin(page);
    backend.seed(KEY, seedProfile, 5);
    await page.evaluate((k) => {
      localStorage.setItem("shenma_player_key", k);
      localStorage.setItem("__shenma_sk_backend", "1");
    }, KEY);
    await makeConflict("黃忠", { gold: 900 });
    const t0 = Date.now();

    // SK-1
    const o1 = await openConflictByKeyboard();
    await H.shot(page, "save-dialog-conflict-open-desktop");
    run.check("SK-1 Tab 走到「比較並選擇」、Enter：存檔比較是有名稱的對話框（aria-modal、有說明），焦點在「關閉存檔比較」",
      o1.reached && o1.info?.modal === "true" && o1.info?.described && o1.focus.dialog === CONFLICT && o1.focus.name === "關閉存檔比較",
      o1);
    // SK-2
    const c2 = await strictCycle(CONFLICT);
    run.check("SK-2 存檔比較：Tab／Shift+Tab 每一步都在視窗的控制項上、順序正確、邊界循環", c2.ok, c2);
    // SK-3
    await press("Escape");
    await H.sleep(300);
    const f3 = await focusAt();
    const closed3 = (await page.locator('[data-testid="save-conflict-modal"]').count()) === 0;
    run.check("SK-3 Esc 關閉，焦點回到「比較並選擇」；沒有任何寫入",
      closed3 && f3.testid === "save-conflict-compare" && writesSince(t0).length === 0, { closed3, f3, writes: writesSince(t0) });

    // SK-4 確認步驟與返回比較
    await openConflictByKeyboard();
    const t4 = await tabTo((f) => f.testid === "save-conflict-server");
    await press("Enter");
    await page.waitForSelector('[data-testid="save-conflict-confirm"]', { timeout: 10000 });
    await H.sleep(300);
    const f4 = await focusAt();
    const c4 = await strictCycle(CONFLICT);
    await H.shot(page, "save-dialog-conflict-confirm-desktop");
    const t4b = await tabTo((f) => f.testid === "save-conflict-confirm-no");
    await press("Enter");
    await H.sleep(300);
    const f4b = await focusAt();
    run.check("SK-4 Enter 選「使用雲端版本」：確認步驟的焦點在確認說明（不在「確定」上）、確認步驟仍在視窗循環；「返回比較」後焦點回到「使用雲端版本」；沒有寫入",
      t4.n > 0 && f4.testid === "save-conflict-confirm-title" && f4.dialog === CONFLICT && c4.ok && t4b.n > 0 &&
        f4b.testid === "save-conflict-server" && f4b.dialog === CONFLICT && writesSince(t0).length === 0,
      { f4, cycle: c4.ok ? "ok" : c4, f4b });

    // SK-5 保留這個分頁：處理中不能關閉、焦點留在視窗；完成後交給備份提示
    const t5 = await tabTo((f) => f.testid === "save-conflict-local");
    await press("Enter");
    await page.waitForSelector('[data-testid="save-conflict-confirm"]', { timeout: 10000 });
    await H.sleep(300);
    backend.hold("save_profile");
    const savesBefore = backend.log.filter((e) => e.action === "save_profile").length;
    await tabTo((f) => f.testid === "save-conflict-confirm-yes");
    await press("Enter");
    await waitUntil(async () => backend.pending("save_profile") === 1, 20000, "保存送出");
    await H.sleep(300);
    const busy = await page.locator('[data-testid="save-conflict-busy"]').isVisible().catch(() => false);
    const busyInfo = await dialogInfo(CONFLICT);
    const f5a = await focusAt();
    const f5tab = await settle("Tab");
    const f5shift = await settle("Shift+Tab");
    await press("Escape");
    await H.sleep(300);
    const stillOpen = (await page.locator('[data-testid="save-conflict-modal"]').count()) === 1;
    const closeDisabled = await page.getByRole("button", { name: "關閉存檔比較" }).isDisabled();
    await H.shot(page, "save-dialog-conflict-busy-desktop");
    const savesDuring = backend.log.filter((e) => e.action === "save_profile").length - savesBefore;
    backend.release("save_profile");
    await page.waitForSelector('[data-testid="save-conflict-modal"]', { state: "detached", timeout: 30000 });
    await H.sleep(400);
    const f5b = await focusAt();
    const backupShown = await page.locator('[data-testid="conflict-backup"]').isVisible().catch(() => false);
    run.check("SK-5 確定覆蓋雲端：等待伺服器時顯示「完成前不能關閉」、aria-busy；焦點留在視窗本身（Tab／Shift+Tab 不跑到背後）、Esc 不關閉、關閉鈕停用、save_profile 只送一次",
      t5.n > 0 && busy && busyInfo?.busy === "true" && f5a.isPanel && f5a.dialog === CONFLICT && f5tab.dialog === CONFLICT && f5shift.dialog === CONFLICT &&
        f5tab.hasFocus && stillOpen && closeDisabled && savesDuring === 1,
      { busy, busyInfo, f5a, f5tab, f5shift, stillOpen, closeDisabled, savesDuring });
    run.check("SK-5b 完成後視窗關閉：「比較並選擇」已不在，焦點交給底部的備份提示；雲端是這個分頁的隊伍（含黃忠）",
      backupShown && f5b.inBottom && f5b.testid === "conflict-backup-export" &&
        (backend.profile(KEY).team || []).some((t) => t.hero_id === "huang_zhong"),
      { f5b, backupShown, cloudTeam: (backend.profile(KEY).team || []).map((t) => t.hero_id) });

    // SK-6 確認期間雲端又更新：沒有完成，焦點移到說明
    await page.locator('[data-testid="conflict-backup-dismiss"]').dispatchEvent("click");
    await page.locator('[data-testid="conflict-backup-confirm"]').dispatchEvent("click");
    await H.sleep(300);
    await makeConflict("周瑜", { gold: 800 });
    await openConflictByKeyboard();
    await tabTo((f) => f.testid === "save-conflict-server");
    await press("Enter");
    await page.waitForSelector('[data-testid="save-conflict-confirm"]', { timeout: 10000 });
    backend.seed(KEY, { ...backend.profile(KEY), gold: 700 }, backend.rev(KEY) + 1); // 確認期間雲端又更新
    await tabTo((f) => f.testid === "save-conflict-confirm-yes");
    const t6 = Date.now();
    await press("Enter");
    await page.waitForSelector('[data-testid="save-conflict-message"]', { timeout: 20000 });
    await H.sleep(400);
    const f6 = await focusAt();
    const msg6 = await page.locator('[data-testid="save-conflict-message"]').innerText();
    await press("Escape");
    await H.sleep(300);
    const f6b = await focusAt();
    run.check("SK-6 確認期間雲端又更新：沒有完成、焦點移到說明訊息（仍在視窗裡）；Esc 關閉後回到「比較並選擇」；這段沒有寫入",
      f6.testid === "save-conflict-message" && f6.dialog === CONFLICT && /又有變化/.test(msg6) && f6b.testid === "save-conflict-compare" && writesSince(t6).length === 0,
      { f6, msg6: msg6.slice(0, 80), f6b, writes: writesSince(t6) });

    // SK-7 開啟時焦點不在任何元素上
    await page.evaluate(() => {
      document.activeElement?.blur?.();
      document.querySelector('[data-testid="save-conflict-compare"]').click();
    });
    await page.waitForSelector('[data-testid="save-conflict-modal"]', { timeout: 10000 });
    await H.sleep(300);
    const f7a = await focusAt();
    await press("Escape");
    await H.sleep(300);
    const f7 = await focusAt();
    run.check("SK-7 用 JavaScript 點開（開啟時焦點不在任何元素上）：焦點仍在「關閉存檔比較」；Esc 後焦點交給底部提示的按鈕（不是 body）",
      f7a.name === "關閉存檔比較" && !f7.body && f7.inBottom, { f7a, f7 });

    // SK-8 390
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(400);
    const o8 = await openConflictByKeyboard();
    const c8 = await strictCycle(CONFLICT);
    await H.shot(page, "save-dialog-conflict-390");
    const of8 = await overflow();
    await press("Escape");
    await H.sleep(300);
    const f8 = await focusAt();
    run.check("SK-8 390×844：Tab 走到「比較並選擇」開啟、焦點在關閉鈕、嚴格循環、沒有橫向溢出，Esc 回到「比較並選擇」",
      o8.reached && o8.focus.name === "關閉存檔比較" && c8.ok && !of8 && f8.testid === "save-conflict-compare", { o8, cycle: c8.ok ? "ok" : c8, of8, f8 });
  } catch (e) {
    run.check("存檔比較的鍵盤操作：執行時發生例外", false, String(e).slice(0, 300));
    try { await H.shot(page, "save-dialog-conflict-exception"); } catch { /* 截圖失敗不影響判定 */ }
  }

  // ── 備份檔預覽 ──
  try {
    await page.setViewportSize({ width: 1280, height: 800 });
    await H.resetOrigin(page);
    await page.evaluate(() => localStorage.setItem("shenma_player_key", "test_sk_backup"));
    await page.evaluate(() => localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { test_sk_backup: { nickname: "預覽", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: "chapter1_3", heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }] } }, battle_logs: [] })));
    await page.goto(SHENMA + "/settings");
    await page.waitForSelector('[data-testid="backup-preview-open"]', { timeout: 60000 });
    await waitUntil(async () => (await sessionOf())?.key === "test_sk_backup", 60000, "設定頁載入");
    await H.sleep(800);
    // 測試用的備份檔（虛構資料）：透過頁面下載存到證據目錄
    const tab = { nickname: "預覽玩家", level: 2, exp: 30, gold: 1000, capacity: 40, max_stage: "chapter1_5", heroes: [{ hero_id: "guan_yu", level: 2, star: 0, atk: 160, def: 128, hp: 1600 }], team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }] };
    const v1 = { format: "shenma-save-backup", version: 1, note: "測試用", exported_at: "2026-10-01T08:00:00.000Z", reason: "conflict", this_tab: tab, this_tab_base_rev: 5, cloud: { ...tab, gold: 700, team: [{ hero_id: "guan_yu", slot: 1 }] }, cloud_rev: 6 };
    const saveFile = async (name, content) => {
      const [download] = await Promise.all([
        page.waitForEvent("download"),
        page.evaluate(({ name, content }) => {
          const a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([content]));
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }, { name, content }),
      ]);
      const path = `${H.EVIDENCE}/save-dialog-files/${name}`;
      await download.saveAs(path);
      return path;
    };
    const good = await saveFile("backup-ok.json", JSON.stringify(v1, null, 2));
    const broken = await saveFile("backup-broken.json", '{"format":"shenma-save-backup","version":1,');
    const storage0 = await page.evaluate(() => JSON.stringify({ s: sessionStorage.getItem("shenma_player_state"), k: localStorage.getItem("shenma_player_key") }));
    const log0 = (await H.gasLog(page)).length;
    const openPreview = async () => {
      await startFrom('[class*="settingsCardTitle"]');
      const t = await tabTo((f) => f.testid === "backup-preview-open");
      await press("Enter");
      await page.waitForSelector('[data-testid="backup-preview-modal"]', { timeout: 10000 });
      await H.sleep(300);
      return { reached: t.n > 0, focus: await focusAt(), info: await dialogInfo(PREVIEW) };
    };
    // 檔案選擇器：先掛好監聽（攔截檔案選擇視窗要在按鍵之前生效；用 waitForEvent 和按鍵同時開始時，按鍵太快會來不及攔截）
    const choosers = [];
    const onChooser = (c) => choosers.push(c);
    page.on("filechooser", onChooser);
    await H.sleep(300);
    const pickByKeyboard = async (path) => {
      const t = await tabTo((f) => f.testid === "backup-preview-pick");
      if (t.n < 0) throw new Error("Tab 走不到「選擇備份檔」：" + JSON.stringify(t.f));
      const before = choosers.length;
      await page.keyboard.press("Enter");
      await waitUntil(async () => choosers.length > before, 10000, "檔案選擇視窗");
      await choosers[choosers.length - 1].setFiles([path]);
      await H.sleep(600);
    };

    const b1 = await openPreview();
    const cb1 = await strictCycle(PREVIEW);
    run.check("BK-1 Tab 走到「預覽備份檔」、Enter：對話框「預覽備份檔」（aria-modal、有說明），焦點在「關閉備份檔預覽」；嚴格循環（隱藏的檔案欄位不算）",
      b1.reached && b1.info?.modal === "true" && b1.info?.described && b1.focus.dialog === PREVIEW && b1.focus.name === "關閉備份檔預覽" && cb1.ok,
      { b1, cycle: cb1.ok ? "ok" : cb1 });

    await pickByKeyboard(good);
    const fb2 = await focusAt();
    const cb2 = await strictCycle(PREVIEW);
    await H.shot(page, "save-dialog-backup-result-desktop");
    run.check("BK-2 Enter 開檔案選擇器、選正確的備份檔：焦點移到預覽的結果（在視窗裡），之後含比較表選項嚴格循環",
      fb2.testid === "backup-preview-result" && fb2.dialog === PREVIEW && cb2.ok && cb2.n >= 4, { fb2, cycle: cb2.ok ? { n: cb2.n, ctl: cb2.ctl } : cb2 });

    await pickByKeyboard(broken);
    const fb3 = await focusAt();
    const cb3 = await strictCycle(PREVIEW);
    run.check("BK-3 選壞掉的檔案：焦點移到「無法預覽」的原因，仍在視窗裡嚴格循環",
      fb3.testid === "backup-preview-error" && fb3.dialog === PREVIEW && cb3.ok, { fb3, cycle: cb3.ok ? "ok" : cb3 });

    await press("Escape");
    await H.sleep(300);
    const fb4 = await focusAt();
    const storage1 = await page.evaluate(() => JSON.stringify({ s: sessionStorage.getItem("shenma_player_state"), k: localStorage.getItem("shenma_player_key") }));
    const writes = (await H.gasLog(page)).slice(log0).filter((e) => WRITES.includes(e.action));
    run.check("BK-4 Esc 關閉，焦點回到「預覽備份檔」；整段沒有任何寫入、session 與金鑰不變",
      (await page.locator('[data-testid="backup-preview-modal"]').count()) === 0 && fb4.testid === "backup-preview-open" && writes.length === 0 && storage0 === storage1,
      { fb4, writes: writes.length, same: storage0 === storage1 });

    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(400);
    const b5 = await openPreview();
    await pickByKeyboard(good);
    const cb5 = await strictCycle(PREVIEW);
    await H.shot(page, "save-dialog-backup-390");
    const of5 = await overflow();
    await press("Escape");
    await H.sleep(300);
    const fb5 = await focusAt();
    run.check("BK-5 390×844：開啟、選檔後嚴格循環、沒有橫向溢出，Esc 回到「預覽備份檔」",
      b5.reached && b5.focus.name === "關閉備份檔預覽" && cb5.ok && !of5 && fb5.testid === "backup-preview-open", { b5, cycle: cb5.ok ? "ok" : cb5, of5, fb5 });
    page.off("filechooser", onChooser);
  } catch (e) {
    run.check("備份檔預覽的鍵盤操作：執行時發生例外", false, String(e).slice(0, 300));
    try { await H.shot(page, "save-dialog-backup-exception"); } catch { /* 截圖失敗不影響判定 */ }
  }

  await page.evaluate(() => localStorage.removeItem("__shenma_sk_backend")).catch(() => {});
  return run.finish(out);
}
