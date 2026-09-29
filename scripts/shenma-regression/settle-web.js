async (page) => {
  // 戰鬥結算的完整獎勵（瀏覽器，真 Godot 結算）：後端一次保存點數、經驗、等級、容量與進度，前端不再靠整份保存補上
  // - 玩家存檔的請求交給 Node 端的共用後端（exposeBinding）：預設是腳本內建的契約 mock（完整結算＋版本契約），
  //   tools/run-browser.mjs 設定 GAS_BACKEND（例如在模擬試算表上執行後端程式的轉接層）時改用那個後端；靜態設定仍由 harness 回應
  // - 情境：勝利、落敗（Godot 實際送出的 battle_points 與星數）→ 回應遺失（伺服器已保存）→ 待確認提示與「重新確認」→
  //   重新整理時結算在途 → 結算在途時改隊伍 → 窄畫面的提示
  // - 每一場都比對：save_result 帶 settle_contract 與這一場的 request_id、內容是 Godot 的結算（不含 battle_id）、
  //   雲端點數／經驗／等級／容量／進度＝結算前＋這一場（只一次）、沒有整份保存（改隊伍那一場除外）
  // 全部虛構金鑰 test_settle_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = { backend: null };
  const KEY = "test_settle_a";
  const W = "Mock W 勝利兩波";
  const L = "Mock L 失敗關";

  // ── 內建的契約 mock（完整結算，和後端草稿的規則相同；所有分頁共用）──
  const contractBackend = () => {
    const profiles = new Map();
    const revs = new Map();
    const results = new Map();
    const log = [];
    const holds = new Map();
    const clone = (v) => JSON.parse(JSON.stringify(v));
    const stageNum = (id) => {
      const m = /chapter(\d+)_(\d+)/.exec(id || "");
      return m ? Number(m[1]) * 100 + Number(m[2]) : 0;
    };
    const nextStage = (id) => {
      const m = /chapter(\d+)_(\d+)/.exec(id || "");
      if (!m) return id;
      let c = Number(m[1]);
      let s = Number(m[2]) + 1;
      if (s > 10) {
        c += 1;
        s = 1;
      }
      return "chapter" + c + "_" + s;
    };
    const apply = (body) => {
      const { action, key, payload = {} } = body;
      const p = profiles.get(key);
      const rev = () => revs.get(key) ?? 0;
      const bump = () => {
        revs.set(key, rev() + 1);
        return rev();
      };
      const base = payload.base_rev;
      const hasBase = base !== undefined && base !== null;
      if (!p) return { status: 404, error: "PROFILE_NOT_FOUND" };
      switch (action) {
        case "get_profile":
          return { status: 200, data: clone(p), rev: rev() };
        case "save_profile": {
          if (hasBase && base !== rev()) return { status: 409, error: "REV_CONFLICT", rev: rev(), data: clone(p) };
          const prev = rev();
          profiles.set(key, clone(payload.data));
          return { status: 200, success: true, rev: bump(), prev_rev: prev };
        }
        case "save_result": {
          const ids = results.get(key) || new Map();
          results.set(key, ids);
          const body2 = (e) => {
            const o = { status: 200, success: true, log_id: e.log_id, prev_rev: e.prev_rev };
            if (hasBase && base === e.prev_rev) o.rev = e.rev;
            else if (hasBase) o.base_mismatch = true;
            return o;
          };
          if (payload.settle_contract !== 2) return { status: 400, error: "MOCK_EXPECTS_FULL_SETTLE" };
          const id = payload.request_id;
          const loots = Array.isArray(payload.loots) ? payload.loots : [];
          const bp = loots.filter((l) => l && l.item === "battle_points");
          const gd = loots.filter((l) => l && l.item === "gold");
          const sum = (a) => a.reduce((s, l) => s + l.count, 0);
          const win = payload.result === "WIN";
          const points = win ? (bp.length ? sum(bp) : sum(gd)) : 10;
          const exp = win ? 50 + payload.stars_earned * 20 : 10;
          const fp = [payload.result, payload.stage_id, payload.stars_earned, points, payload.kills, payload.time_seconds].join("|");
          const full = (e, extra) => ({ ...body2(e), settle_contract: 2, request_id: id, reward: e.reward, after: e.after, ...extra });
          if (ids.has(id)) {
            const e = ids.get(id);
            return e.fp === fp ? full(e, { duplicate: true }) : { status: 409, error: "REQUEST_ID_REUSED" };
          }
          let level = p.level;
          let xp = p.exp + exp;
          while (xp >= level * 100) {
            xp -= level * 100;
            level += 1;
          }
          p.gold += points;
          p.exp = xp;
          p.level = level;
          p.capacity = 10 + level;
          if (win && stageNum(nextStage(payload.stage_id)) > stageNum(p.max_stage)) p.max_stage = nextStage(payload.stage_id);
          const prev = rev();
          const e = {
            log_id: "log-" + (ids.size + 1), prev_rev: prev, rev: bump(), fp,
            reward: { points, exp }, after: { gold: p.gold, exp: p.exp, level: p.level, capacity: p.capacity, max_stage: p.max_stage },
          };
          ids.set(id, e);
          return full(e, { logged: true });
        }
        default:
          return { status: 400, error: "UNSUPPORTED_" + action };
      }
    };
    return {
      kind: "contract-mock",
      log,
      seed(key, profile, rev) {
        profiles.set(key, clone(profile));
        revs.set(key, rev);
      },
      setAdminToken() {},
      profile: (key) => clone(profiles.get(key)),
      rev: (key) => revs.get(key) ?? 0,
      hold(tag, action) {
        holds.set(tag + ":" + action, { waiters: [] });
      },
      release(tag, action) {
        const h = holds.get(tag + ":" + action);
        holds.delete(tag + ":" + action);
        (h ? h.waiters : []).forEach((w) => w());
        return h ? h.waiters.length : 0;
      },
      pending: (tag, action) => holds.get(tag + ":" + action)?.waiters.length ?? 0,
      async handle(body, tag) {
        const entry = { t: Date.now(), tag, action: body.action, base_rev: body.payload?.base_rev };
        log.push(entry);
        const h = holds.get(tag + ":" + body.action);
        if (h) await new Promise((r) => h.waiters.push(r));
        const res = apply(body);
        entry.status = res.status;
        entry.error = res.error;
        entry.rev = res.rev;
        return res;
      },
    };
  };
  const backend = ctx.__shenmaGasBackendFactory ? await ctx.__shenmaGasBackendFactory() : contractBackend();
  out.backend = backend.kind;
  const PROFILE = {
    nickname: "結算玩家", level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_7", heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
  };
  backend.seed(KEY, PROFILE, 5);

  // 這支腳本自己的請求紀錄（完整內容）；loseNext：伺服器照常處理，但頁面收到網路錯誤（回應遺失）
  const calls = [];
  const loseNext = {};
  const tags = new Map([[page, "A"]]);
  await ctx.exposeBinding("__shenmaSettleGas", async (source, body) => {
    const tag = tags.get(source.page) || "?";
    const call = { t: Date.now(), tag, action: body.action, key: body.key, payload: JSON.parse(JSON.stringify(body.payload || {})) };
    calls.push(call);
    const res = await backend.handle(body, tag);
    call.res = res;
    if (loseNext[body.action] > 0) {
      loseNext[body.action] -= 1;
      call.lost = true;
      return { __lost: true };
    }
    return res;
  });
  await ctx.addInitScript(() => {
    if (window.top !== window) return;
    const SHARED = ["get_profile", "create_profile", "save_profile", "save_result", "upgrade_hero"];
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_settle_backend") === "1" && typeof window.__shenmaSettleGas === "function") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (SHARED.includes(body.action)) {
          const res = await window.__shenmaSettleGas(body);
          await new Promise((r) => setTimeout(r, 50));
          if (res && res.__lost) throw new TypeError("Failed to fetch");
          return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }
      return inner(input, init);
    };
  });

  // ── 輔助 ──
  const waitUntil = async (fn, timeout = 60000, what = "條件") => {
    const end = Date.now() + timeout;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error("等不到：" + what);
      await H.sleep(150);
    }
  };
  const sessionOf = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
  const fields = (p) => p && { gold: p.gold, exp: p.exp, level: p.level, capacity: p.capacity, max_stage: p.max_stage };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const since = (n, action) => calls.slice(n).filter((c) => c.action === action);
  const isResult = (m) => m.type === undefined && typeof m.result === "string";
  const waitIdle = (timeout = 90000) =>
    waitUntil(async () => {
      const s = await sessionOf();
      return s && s.syncStatus === "idle" && (s.pendingSettles || []).length === 0 && s.rev === s.syncedRev ? s : null;
    }, timeout, "結算確認、同步完成");
  /** 預期的結算後數值（和前後端規則相同；獨立計算，不呼叫頁面的程式） */
  const expectAfter = (before, godot) => {
    const win = godot.result === "WIN";
    const bp = (godot.loots || []).filter((l) => l.item === "battle_points");
    const points = win ? bp.reduce((s, l) => s + l.count, 0) : 10;
    const exp = win ? 50 + godot.stars_earned * 20 : 10;
    let level = before.level;
    let xp = before.exp + exp;
    while (xp >= level * 100) {
      xp -= level * 100;
      level += 1;
    }
    return { gold: before.gold + points, exp: xp, level, capacity: 10 + level, max_stage: before.max_stage };
  };
  // 打一場（自動），回傳 Godot 送出的結算；confirm=false 時不按確認
  const fight = async (stage) => {
    await H.selectStage(page, stage);
    await H.dismissSplash(page);
    const idx = await H.bridgeLen(page);
    await H.clickButton(page, stage === W ? "自動" : "迎戰");
    await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 600000, polling: 500 });
    await H.sleep(1500);
    const res = (await H.bridgeSince(page, idx)).filter(isResult);
    return res[0];
  };
  const confirm = () => page.getByRole("button", { name: "確認" }).click();
  const clickNotice = (sel) =>
    process.env.LOCAL_ASSETS === "1" ? page.locator(sel).click() : page.locator(sel).dispatchEvent("click");
  // 檢查一場結算：請求內容、雲端與本機的數值、沒有整份保存
  const checkSettle = (label, godot, before, n0, opts = {}) => {
    const results = since(n0, "save_result");
    const saves = since(n0, "save_profile");
    const first = results[0];
    const cloud = fields(backend.profile(KEY));
    const want = expectAfter(before, godot);
    const payloadOk =
      !!first &&
      first.payload.settle_contract === 2 &&
      first.payload.request_id === godot.battle_id &&
      !("battle_id" in first.payload) &&
      !("__godot_bridge" in first.payload) &&
      same(first.payload.loots, godot.loots) &&
      first.payload.stars_earned === godot.stars_earned &&
      first.payload.result === godot.result;
    return {
      label, results: results.length, saves: saves.length, requestIds: [...new Set(results.map((c) => c.payload.request_id))],
      payloadOk, cloud, want, cloudOk: same(cloud, want), godot: { result: godot.result, stars: godot.stars_earned, loots: godot.loots, battle_id: godot.battle_id },
      ...opts,
    };
  };

  try {
    // ── 準備：新的分頁狀態、共用後端、登入 ──
    await H.resetOrigin(page);
    await page.evaluate((k) => {
      localStorage.setItem("__shenma_settle_backend", "1");
      localStorage.setItem("shenma_player_key", k);
    }, KEY);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitIdle();
    out.loaded = fields(await sessionOf());

    // ── 1. 勝利 ──
    {
      const before = fields(backend.profile(KEY));
      const godot = await fight(W);
      const n0 = calls.length;
      await confirm();
      const s = await waitIdle();
      await H.sleep(1500);
      const r = checkSettle("win", godot, before, n0, { local: fields(s), serverRev: s.serverRev, cloudRev: backend.rev(KEY) });
      out.win = r;
      run.check("結算-B1 勝利（Godot 的 battle_points 與星數）：save_result 只送 1 次，帶 settle_contract 2、request_id＝這一場的 battle_id，內容就是 Godot 的結算（不含 battle_id 與橋接標記）；雲端一次保存點數、經驗、等級、容量（進度已超過不變），和本機顯示相同；沒有整份保存；本機版本基準＝雲端版本",
        godot && godot.result === "WIN" && r.results === 1 && r.payloadOk && r.cloudOk && same(r.local, r.cloud) && r.saves === 0 && r.serverRev === r.cloudRev,
        r);
    }

    // ── 2. 落敗 ──
    {
      const before = fields(backend.profile(KEY));
      const godot = await fight(L);
      const n0 = calls.length;
      await confirm();
      const s = await waitIdle();
      await H.sleep(1500);
      const r = checkSettle("lose", godot, before, n0, { local: fields(s) });
      out.lose = r;
      run.check("結算-B2 落敗（Godot 送 battle_points 10、0 星）：雲端點數 +10、經驗 +10，和本機相同；save_result 1 次、沒有整份保存",
        godot && godot.result === "LOSE" && r.results === 1 && r.payloadOk && r.cloudOk && same(r.local, r.cloud) && r.saves === 0 &&
          r.cloud.gold === before.gold + 10,
        r);
    }

    // ── 3. 回應遺失（伺服器已保存）→ 待確認提示 → 重新確認 ──
    {
      const before = fields(backend.profile(KEY));
      const godot = await fight(W);
      const n0 = calls.length;
      loseNext.save_result = 1;
      await confirm();
      await waitUntil(async () => {
        const s = await sessionOf();
        return s && (s.pendingSettles || [])[0]?.state === "unknown";
      }, 60000, "結算變成待確認");
      await page.waitForSelector('[data-testid="settle-unconfirmed"]', { timeout: 30000 });
      await page.waitForSelector('[data-sync-status="unconfirmed"]', { timeout: 30000 });
      const mid = {
        notice: await page.locator('[data-testid="settle-unconfirmed"]').innerText(),
        cloud: fields(backend.profile(KEY)),
        saves: since(n0, "save_profile").length,
        results: since(n0, "save_result").length,
        local: fields(await sessionOf()),
      };
      out.lost_shot = await H.shot(page, "settle-unconfirmed");
      await page.setViewportSize({ width: 390, height: 844 });
      await H.sleep(500);
      out.lost_shot_390 = await H.shot(page, "settle-unconfirmed-390");
      const overflow390 = await page.evaluate(() => {
        const n = document.querySelector('[data-testid="settle-unconfirmed"]');
        const r = n.getBoundingClientRect();
        return { left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth, scroll: document.documentElement.scrollWidth };
      });
      await page.setViewportSize({ width: 1280, height: 800 });
      await H.sleep(300);
      await clickNotice('[data-testid="settle-unconfirmed"] button');
      const s = await waitIdle();
      await H.sleep(1000);
      const noticeAfter = await page.locator('[data-testid="settle-unconfirmed"]').count();
      const r = checkSettle("lost", godot, before, n0, { local: fields(s), mid, noticeAfter, overflow390 });
      out.lost = r;
      run.check("結算-B3 回應遺失（伺服器已保存）：同步狀態「待確認」、畫面下方出現結算待確認提示（說明不保存以免寫兩次、關閉分頁會遺失）；這段期間沒有整份保存；390 寬提示不超出畫面",
        mid.saves === 0 && mid.results === 1 && same(mid.cloud, expectAfter(before, godot)) && /戰鬥結算待確認/.test(mid.notice) && /寫兩次/.test(mid.notice) &&
          overflow390.left >= 0 && overflow390.right <= overflow390.vw && overflow390.scroll <= overflow390.vw,
        { mid, overflow390 });
      run.check("結算-B4 按「重新確認」：用同一個 request_id 重新送出 → 伺服器回傳第一次的結果 → 提示消失、已同步；雲端獎勵只加一次、仍沒有整份保存",
        r.results === 2 && r.requestIds.length === 1 && r.cloudOk && same(r.local, r.cloud) && r.saves === 0 && noticeAfter === 0,
        r);
    }

    // ── 4. 重新整理時結算在途 ──
    {
      const before = fields(backend.profile(KEY));
      const godot = await fight(W);
      const n0 = calls.length;
      backend.hold("A", "save_result");
      await confirm();
      await waitUntil(() => backend.pending("A", "save_result") === 1, 30000, "結算請求停在後端");
      await page.reload();
      await H.waitHud(page);
      const restored = await waitUntil(async () => {
        const s = await sessionOf();
        return s && (s.pendingSettles || []).length === 1 ? s.pendingSettles[0] : null;
      }, 30000, "重新整理後讀回待確認的結算");
      await waitUntil(() => backend.pending("A", "save_result") >= 1, 30000, "新頁面的重新確認");
      backend.release("A", "save_result");
      const s = await waitIdle();
      await H.sleep(1000);
      const r = checkSettle("reload", godot, before, n0, { local: fields(s), restored: { id: restored.id, state: restored.state, base: restored.base_rev } });
      out.reload = r;
      const bases = since(n0, "save_result").map((c) => c.payload.base_rev);
      run.check("結算-B5 重新整理時結算在途：新頁面從 session 讀回這一場（讀回後立刻重新確認，所以讀到時已是 sent），用同一個 request_id 與第一次的版本重新確認；舊請求與重新確認都到後端，雲端獎勵只加一次、沒有整份保存",
        restored.id === godot.battle_id && /^(unknown|sent)$/.test(restored.state) && restored.base_rev === bases[0] &&
          r.results >= 2 && r.requestIds.length === 1 && bases.every((b) => b === bases[0]) &&
          r.cloudOk && same(r.local, r.cloud) && r.saves === 0,
        { ...r, bases });
    }

    // ── 5. 結算在途時改隊伍 ──
    {
      const before = fields(backend.profile(KEY));
      const godot = await fight(W);
      const n0 = calls.length;
      backend.hold("A", "save_result");
      await confirm();
      await waitUntil(() => backend.pending("A", "save_result") === 1, 30000, "結算請求停在後端");
      await H.clickButton(page, "隊伍");
      await page.waitForSelector('[data-testid="team-slot"]', { timeout: 30000 });
      await page.locator('[data-testid="team-slot"][data-hero-id="zhao_yun"] [data-testid="team-slot-remove"]').click();
      await page.getByRole("button", { name: "儲存隊伍" }).click();
      await page.waitForSelector("text=隊伍已儲存", { timeout: 10000 });
      await page.locator('button[class*="modalClose"]').last().click();
      await H.sleep(2500);
      const midSaves = since(n0, "save_profile").length;
      backend.release("A", "save_result");
      const s = await waitIdle();
      await H.sleep(1000);
      const saves = since(n0, "save_profile");
      const order = calls.slice(n0).map((c) => c.action);
      const cloud = backend.profile(KEY);
      const r = checkSettle("team", godot, before, n0, {
        local: fields(s), midSaves, order, cloudTeam: (cloud.team || []).map((t) => t.hero_id), localTeam: (s.team || []).map((t) => t.hero_id),
        saveBase: saves[0] && saves[0].payload.base_rev,
      });
      out.team = r;
      run.check("結算-B6 結算在途時改隊伍：確認之前不送整份保存；確認後才保存隊伍（在 save_result 之後，帶結算後的版本）；雲端隊伍是新的、獎勵只加一次，本機隊伍沒有被回應蓋掉",
        midSaves === 0 && saves.length === 1 && order.indexOf("save_profile") > order.indexOf("save_result") &&
          r.cloudOk && same(r.cloudTeam, ["guan_yu"]) && same(r.localTeam, ["guan_yu"]),
        r);
    }
  } catch (e) {
    run.check("結算情境：執行時發生例外", false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e));
    try { out.exception_shot = await H.shot(page, "settle-exception"); } catch { /* 截圖失敗不影響判定 */ }
  }
  await page.evaluate(() => localStorage.removeItem("__shenma_settle_backend")).catch(() => {});
  out.requests = calls.map((c) => ({ t: c.t, action: c.action, base: c.payload.base_rev, id: c.payload.request_id, settle: c.payload.settle_contract, status: c.res && c.res.status, dup: c.res && c.res.duplicate, lost: !!c.lost }));
  return run.finish(out);
}
