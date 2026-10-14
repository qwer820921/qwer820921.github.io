async (page) => {
  // 甘寧「奇襲」（瀏覽器，真 Godot 產物）：設定表的被動描述「奇襲：首擊必殺」沒有寫每場、每波還是每個目標，也沒有寫免疫。
  // 遊戲的第一版設計：每場戰鬥甘寧第一次有效的普通攻擊必殺主要目標（先照普通攻擊扣血，沒有打倒時補扣剩下的生命），每場只有一次，不是兩倍傷害
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_as_fixture）：甘寧（gan_ning，弓兵、攻擊力 122、防禦 107、生命 1235、射程 5、攻擊間隔 1.8，和正式設定相同）、
  //   關卡「Mock AS 奇襲」：直線路線（第 5 列，從 (3,5) 走到 (13,5)），甘寧放在 (6,4)（出兵點在射程內）；
  //   第 1 波一個生命 99999、不會移動的木樁（普通攻擊打不倒，只有必殺能一擊打倒）；第 2 波一個生命 300、不會移動的草人（122 × 3 才倒，用來確認第 2 波不再必殺）
  // - 玩家存檔的請求（get_profile、save_result 等）交給 Node 端的共用後端：預設是腳本內建的契約 mock（完整結算＋版本契約，和結算測試相同的規則），
  //   tools/run-browser.mjs 設定 GAS_BACKEND（例如在模擬試算表上執行後端程式的轉接層）時改用那個後端；靜態設定仍由 harness 回應
  // - A：技能說明（主頁的武將視窗、獨立的武將頁，鍵盤也能打開）：技能名稱「奇襲」、短版說明（只寫效果、目前的數值與主要例外，和整句比對）；390×844 與 390×600 在畫面寬度內、字級至少 12px
  // - B：主頁：部署甘寧後 iframe 收到的 skill 正好是 {id: assassinate}；備戰中選取面板寫「這一場還沒用過」（390×600 在面板與畫面裡）；迎戰後第一擊必殺木樁
  //      （普通 122、補扣 99877，攻擊 1 次、擊殺 1），看得到 KILL；選取面板改寫「這一場已經用過」（390×600）；第 2 波的草人每擊 122、攻擊 3 次才倒（不再必殺）；
  //      勝利結算 3 星、擊殺 2、戰場點數 1020；按確認後 save_result 只送 1 次、雲端點數 +1020、經驗 +110；重新整理後讀回，沒有再送結算
  // - C：獨立戰鬥頁 2×：同樣第一擊必殺、第 2 波攻擊 3 次；確認後這一場的 save_result 也只送 1 次（和主頁那場的 request_id 不同）
  // - D：存檔、session 都沒有技能或奇襲的使用狀態，隊伍只有 hero_id／slot
  // 全部虛構金鑰 test_wa_*（不含被比對的字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = { backend: null };
  const KEY = "test_wa_k";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_4", name: "Mock AS 奇襲" };
  const GN_CELL = [6, 4];
  const SKILL = { id: "assassinate" };
  const ATK = 122;
  const POST_HP = 99999;
  const DUMMY_HP = 300;

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[3, ROW], [13, ROW]] }, spawn: [3, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [
      {
        hero_id: "gan_ning", name: "甘寧", rarity: "orange", cost: 7, job: "archer",
        base_atk: ATK, base_def: 107, base_hp: 1235, attack_range: 5, attack_speed: 1.8, upgrade_cost_base: 100,
        atk_growth: 12.2, def_growth: 10.7, hp_growth: 123.5, range_growth: 0.05, speed_growth: 0.02, image: "hero_gan_ning.webp", attack_image: "hero_gan_ning_atk.webp",
      },
    ],
    enemies: [
      { enemy_id: "mock_as_post", name: "木樁", hp: POST_HP, speed: 0, atk: 5, image: "enemy_grunt1.webp" },
      { enemy_id: "mock_as_dummy", name: "草人", hp: DUMMY_HP, speed: 0, atk: 5, image: "enemy_grunt1.webp" },
    ],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [
        { wave: 1, enemies: [{ enemy_id: "mock_as_post", count: 1, interval: 0.3, path: "path_a" }] },
        { wave: 2, enemies: [{ enemy_id: "mock_as_dummy", count: 1, interval: 0.3, path: "path_a" }] },
      ],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    const ids = extra.heroes.map((h) => h.hero_id);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_as_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps" || body.action === "get_enemies_config" || body.action === "get_heroes_config") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (j && j.status === 200) {
            if (body.action === "get_all_maps" && Array.isArray(j.maps)) j.maps = [...j.maps.filter((m) => m.map_id !== extra.maps[0].map_id), ...extra.maps];
            if (body.action === "get_enemies_config" && Array.isArray(j.enemies)) j.enemies = [...j.enemies, ...extra.enemies];
            if (body.action === "get_heroes_config" && Array.isArray(j.heroes)) j.heroes = [...j.heroes.filter((h) => !ids.includes(h.hero_id)), ...extra.heroes];
            return new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
          }
          return res;
        }
      }
      return inner(input, init);
    };
  }, EXTRA);
  // 遊戲 iframe 實際收到的訊息（在 iframe 裡記錄，只記錄、不影響 Godot 的處理）
  await page.addInitScript(() => {
    if (window.__waRecv) return;
    window.__waRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__waRecv.push(e.data);
    });
  });

  // ── 內建的契約 mock（完整結算，和結算測試相同的規則）──
  const contractBackend = () => {
    const profiles = new Map();
    const revs = new Map();
    const results = new Map();
    const log = [];
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
          if (payload.settle_contract !== 2) return { status: 400, error: "MOCK_EXPECTS_FULL_SETTLE" };
          const id = payload.request_id;
          const loots = Array.isArray(payload.loots) ? payload.loots : [];
          const win = payload.result === "WIN";
          const points = win ? loots.filter((l) => l && l.item === "battle_points").reduce((s, l) => s + l.count, 0) : 10;
          const exp = win ? 50 + payload.stars_earned * 20 : 10;
          const fp = [payload.result, payload.stage_id, payload.stars_earned, points, payload.kills, payload.time_seconds].join("|");
          const full = (e, extra) => {
            const o = { status: 200, success: true, log_id: e.log_id, prev_rev: e.prev_rev, settle_contract: 2, request_id: id, reward: e.reward, after: e.after, ...extra };
            if (hasBase && base === e.prev_rev) o.rev = e.rev;
            else if (hasBase) o.base_mismatch = true;
            return o;
          };
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
          const e = { log_id: "log-" + (ids.size + 1), prev_rev: prev, rev: bump(), fp, reward: { points, exp },
            after: { gold: p.gold, exp: p.exp, level: p.level, capacity: p.capacity, max_stage: p.max_stage } };
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
      async handle(body, tag) {
        const entry = { t: Date.now(), tag, action: body.action };
        log.push(entry);
        const res = apply(body);
        entry.status = res.status;
        return res;
      },
    };
  };
  const backend = ctx.__shenmaGasBackendFactory ? await ctx.__shenmaGasBackendFactory() : contractBackend();
  out.backend = backend.kind;
  const PROFILE = {
    nickname: "奇襲玩家", level: 5, exp: 0, gold: 1000, capacity: 30, max_stage: MAP.id, heroes: [],
    team: [{ hero_id: "gan_ning", slot: 1 }],
  };
  backend.seed(KEY, PROFILE, 3);
  const calls = [];
  await ctx.exposeBinding("__shenmaAsGas", async (_source, body) => {
    const call = { t: Date.now(), action: body.action, key: body.key, payload: JSON.parse(JSON.stringify(body.payload || {})) };
    calls.push(call);
    const res = await backend.handle(body, "A");
    call.res = res;
    return res;
  });
  await ctx.addInitScript(() => {
    if (window.top !== window) return;
    const SHARED = ["get_profile", "create_profile", "save_profile", "save_result", "upgrade_hero"];
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_as_backend") === "1" && typeof window.__shenmaAsGas === "function") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (SHARED.includes(body.action)) {
          const res = await window.__shenmaAsGas(body);
          await new Promise((r) => setTimeout(r, 50));
          return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }
      return inner(input, init);
    };
  });

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const near = (a, b, eps = 1e-6) => typeof a === "number" && Math.abs(a - b) <= eps;
  const since = (n, action) => calls.slice(n).filter((c) => c.action === action);
  const sessionOf = () => page.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
  const sessionRaw = () => page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
  const fields = (p) => p && { gold: p.gold, exp: p.exp, level: p.level, capacity: p.capacity };
  const isResult = (m) => m.type === undefined && typeof m.result === "string";
  const lootsOf = (r) => ((r && r.loots) || []).map((l) => ({ item: l.item, count: l.count }));
  const waitUntil = async (fn, timeout = 60000, what = "條件") => {
    const end = Date.now() + timeout;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error("等不到：" + what);
      await H.sleep(150);
    }
  };
  const waitIdle = async (timeout = 90000) => {
    let last = null;
    try {
      return await waitUntil(async () => {
        const s = await sessionOf();
        last = s;
        return s && s.syncStatus === "idle" && (s.pendingSettles || []).length === 0 && s.rev === s.syncedRev ? s : null;
      }, timeout, "結算確認、同步完成");
    } catch (e) {
      throw new Error(e.message + " " + JSON.stringify(last && { syncError: last.syncError, syncStatus: last.syncStatus, pendingSettles: last.pendingSettles, rev: last.rev, syncedRev: last.syncedRev, serverRev: last.serverRev, max_stage: last.max_stage, gold: last.gold }));
    }
  };
  const snapshot = async (sel) => {
    const id = "as-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const received = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__waRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const gn = last ? last.team_list.find((t) => t.hero_id === "gan_ning") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: gn ? gn.skill ?? null : undefined, atk: gn ? gn.atk : undefined };
    }, sel);
  const dismissSplash = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
  const cellPoint = async (sel, c, row, cols = 14, rows = 11) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    }, sel);
    const s = Math.min(r.width / 540, r.height / 720);
    const vx = r.width / s, vy = r.height / s;
    const tile = Math.max(16, Math.floor(Math.min(vx / cols, vy / rows)));
    const ox = (vx - cols * tile) / 2, oy = (vy - rows * tile) / 2;
    return { x: r.left + (ox + (c + 0.5) * tile) * s, y: r.top + (oy + (row + 0.5) * tile) * s };
  };
  const deploy = async (sel, c, row, heroName) => {
    const idx = await H.bridgeLen(page);
    const p = await cellPoint(sel, c, row);
    await page.mouse.click(p.x, p.y);
    await page.waitForSelector('[data-testid="placement-menu"]', { timeout: 15000 });
    const click = await page.evaluate((i) => (window.__bridgeLog || []).slice(i).filter((m) => m.type === "click_cell").pop() || null, idx);
    const tab = page.locator('[data-testid="placement-menu"] button[class*="tabBtn"]', { hasText: "武將" });
    if ((await tab.count()) > 0) await tab.click();
    await page.locator('button[class*="menuCard"]', { hasText: heroName }).click();
    await H.sleep(600);
    return click;
  };
  const as = (s) => (((s || {}).hero_assassinate) || {}).gan_ning || null;
  // 迎戰兩波到結算：第 1 波等到用掉（記錄必殺的紀錄、攻擊次數、KILL 標記數），回到備戰後再迎戰第 2 波，等到勝利；記錄每一擊後草人的生命
  const fightTwoWaves = async (sel, startBtn) => {
    const idx = await H.bridgeLen(page);
    let kills = 0;
    let w1 = null;
    let w1shot = null;
    const end1 = Date.now() + 60000;
    for (;;) {
      const s = await snapshot(sel);
      kills = Math.max(kills, s.kill_texts || 0);
      const a = as(s);
      if (a && a.used && !w1shot) w1shot = await H.shot(page, "assassinate-kill-" + (sel === IFRAME ? "home" : "battle"));
      if (a && a.used && s.active_enemies === 0 && s.game_state === 1) {
        w1 = { record: a.record, attacks: a.attacks, remaining: a.remaining, kills: s.kills, wave: s.wave, state: s.game_state, dbg: s.assassinate, shot: w1shot };
        break;
      }
      if (Date.now() > end1) throw new Error("第 1 波等不到必殺：" + JSON.stringify({ a, state: s.game_state, active: s.active_enemies }));
      await H.sleep(120);
    }
    const after1 = { kills };
    await startBtn();
    const hps = [];
    const end2 = Date.now() + 60000;
    let s2 = null;
    for (;;) {
      const s = await snapshot(sel);
      kills = Math.max(kills, s.kill_texts || 0);
      Object.values(s.enemy_hp || {}).forEach((v) => { if (!hps.includes(v)) hps.push(v); });
      if (s.game_state === 3) {
        s2 = s;
        break;
      }
      if (Date.now() > end2) throw new Error("第 2 波等不到結算");
      await H.sleep(120);
    }
    await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 30000, polling: 300 });
    await H.sleep(800);
    const res = (await H.bridgeSince(page, idx)).filter(isResult);
    const a2 = as(s2) || {};
    return { w1, killTexts: after1.kills, hps, attacks: a2.attacks, record2: a2.record, result: res[0] || null, results: res.length };
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `assassinate-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };
  // 技能說明是短版（只寫效果、目前的數值與主要例外）：整句寫在這裡，數值是這支腳本的 mock 武將（射程、攻擊力）算出的
  const RULES = (t) =>
    /技能：奇襲/.test(t) && t.includes("每場戰鬥第一次有效的普通攻擊必定打倒主要目標。每場只有一次，換波次、移動位置或升級都不會恢復。") && !/選取時這一場/.test(t);
  const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12 && m.docScroll <= m.vw;
  const measure = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="hero-skill-detail"]');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      const text = el.querySelector('[class*="heroSkillText"]') || el;
      return {
        left: Math.round(b.left), right: Math.round(b.right), vw: window.innerWidth,
        scrollW: el.scrollWidth, clientW: el.clientWidth, font: parseFloat(getComputedStyle(text).fontSize),
        docScroll: document.documentElement.scrollWidth,
      };
    });
  const closePanel = async () => {
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await H.sleep(300);
  };
  // 點場上的甘寧、讀選取面板的奇襲說明；390×600 時量說明是否在面板與畫面裡（截圖另存）
  const panelAt = async (sel, shotName) => {
    const gp = await cellPoint(sel, GN_CELL[0], GN_CELL[1]);
    await page.mouse.click(gp.x, gp.y);
    await page.waitForSelector('[data-testid="unit-panel-assassinate"]', { timeout: 15000 });
    const panel = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-assassinate"]');
      return { note: el.innerText, used: el.dataset.used, remaining: Number(el.dataset.remaining) };
    });
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-assassinate"]');
      const p = document.querySelector('[data-testid="unit-panel"]');
      if (!el || !p) return null;
      el.scrollIntoView({ block: "nearest" });
      const b = el.getBoundingClientRect();
      const pb = p.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), vw: window.innerWidth, vh: window.innerHeight,
        panelTop: Math.round(pb.top), panelBottom: Math.round(pb.bottom), font: parseFloat(getComputedStyle(el).fontSize), docScroll: document.documentElement.scrollWidth };
    });
    const shot = await H.shot(page, shotName);
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(400);
    await closePanel();
    return { panel, box, shot };
  };
  const inside = (b) => !!b && b.left >= 0 && b.right <= b.vw && b.docScroll <= b.vw && b.font >= 12 && b.top >= b.panelTop && b.bottom <= b.panelBottom + 1 && b.bottom <= b.vh;
  const UNUSED = /奇襲：(?:選取時|目前)這一場還沒用過，下一次有效的普通攻擊必殺主要目標；每場一次，換波次、移位、升級、重新部署都不恢復（(?:重新點選可以更新|即時更新)）/;
  const USED = /奇襲：(?:選取時|目前)這一場已經用過，切換關卡或重新開始才恢復；每場一次，換波次、移位、升級、重新部署都不恢復（(?:重新點選可以更新|即時更新)）/;
  // 第 1 波必殺的紀錄：普通攻擊 122、攻擊前 99999、補扣 99877、最後 0、打倒；攻擊 1 次
  const firstOk = (w1) =>
    !!w1 && !!w1.record && near(w1.record.normal, ATK) && near(w1.record.hp_before, POST_HP) && near(w1.record.hp_mid, POST_HP - ATK) &&
    near(w1.record.finish, POST_HP - ATK) && near(w1.record.hp_after, 0) && w1.record.killed === true && w1.attacks === 1 && w1.remaining === 0 && w1.kills === 1 && w1.wave === 1;
  // 第 2 波：草人生命 300 → 178 → 56 → 倒下（每擊 122，攻擊 3 次，總共 4 次），紀錄不變
  const secondOk = (f) =>
    f.hps.includes(DUMMY_HP - ATK) && f.hps.includes(DUMMY_HP - 2 * ATK) && f.attacks === 4 && same(f.record2, f.w1.record) &&
    f.results === 1 && f.result.result === "WIN" && f.result.stars_earned === 3 && f.result.kills === 2 && same(lootsOf(f.result), [{ item: "battle_points", count: 1020 }]);

  // ── 準備 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate((k) => {
      localStorage.setItem("__shenma_as_fixture", "1");
      localStorage.setItem("__shenma_as_backend", "1");
      localStorage.setItem("shenma_player_key", k);
    }, KEY);
    await page.setViewportSize({ width: 540, height: 900 });
  });

  // ── A. 技能說明 ──
  await section("A", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitIdle();
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="gan_ning"]');
    const card = await page.locator('[role="dialog"] button[data-hero-id="gan_ning"]').innerText();
    await page.locator('[role="dialog"] button[data-hero-id="gan_ning"]').click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "assassinate-a-skill-detail") };
    run.check("A-1 主頁武將視窗：甘寧的卡片是「技能：奇襲」；詳情是短版說明：每場第一次有效的普通攻擊必定打倒主要目標、每場只有一次、換波次移位升級都不恢復；出征前不寫用過了沒有",
      /技能：奇襲/.test(card) && RULES(detail), out.A_modal);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('button[data-hero-id="gan_ning"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="hero-skill-detail"]', { timeout: 15000 });
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：甘寧有「奇襲」標籤（只有一個）；用鍵盤聚焦卡片按 Enter 打開詳情，顯示同樣的規則",
      tags.filter((t) => t === "技能：奇襲").length === 1 && detail2 === detail, out.A_page);
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const narrowPage = await measure();
    const narrowPageShot = await H.shot(page, "assassinate-a-narrow-heroes-page");
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const shortPage = await measure();
    const shortPageShot = await H.shot(page, "assassinate-a-short-heroes-page");
    await page.keyboard.press("Escape");
    await H.sleep(400);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="gan_ning"]');
    await page.locator('[role="dialog"] button[data-hero-id="gan_ning"]').click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "assassinate-a-narrow-modal");
    out.A_narrow = { narrowPage, shortPage, narrowModal, narrowPageShot, shortPageShot, narrowModalShot };
    run.check("A-3 窄畫面（390×844）與矮畫面（390×600）：武將頁與主頁武將視窗的奇襲說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(shortPage) && fits(narrowModal), out.A_narrow);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署、選取面板、第一擊必殺、第 2 波不再必殺、結算與讀回 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitIdle();
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    const c1 = await deploy(IFRAME, GN_CELL[0], GN_CELL[1], "甘寧");
    const recv = await received(IFRAME);
    const s0 = await snapshot(IFRAME);
    out.B_payload = { c1, recv, as: as(s0), dbg: s0.assassinate };
    run.check("B-1 規則 payload：用部署選單把甘寧放在 (6,4)；遊戲 iframe 收到的出征資料裡，甘寧的 skill 正好是 {id: assassinate}、攻擊力 122；開戰前快照 hero_assassinate {啟用、剩 1、沒用過、沒有紀錄}",
      !!c1 && c1.cell_x === GN_CELL[0] && c1.cell_y === GN_CELL[1] && recv.stage === MAP.id && same(recv.skill, SKILL) && recv.atk === ATK &&
        !!as(s0) && as(s0).on === true && as(s0).remaining === 1 && as(s0).used === false && same(as(s0).record, {}) && same((s0.assassinate || {}).used, []),
      out.B_payload);

    const p0 = await panelAt(IFRAME, "assassinate-b-panel-unused-390x600");
    out.B_panel0 = p0;
    run.check("B-2 備戰中的選取面板「奇襲：選取時這一場還沒用過，下一次有效的普通攻擊必殺主要目標；每場一次，換波次、移位、升級、重新部署都不恢復（重新點選可以更新）」、data-used 0、剩 1；390×600 時在面板與畫面裡（截圖另存）",
      UNUSED.test(p0.panel.note) && p0.panel.used === "0" && p0.panel.remaining === 1 && inside(p0.box), out.B_panel0);

    await H.clickButton(page, "迎戰");
    const f = await fightTwoWaves(IFRAME, async () => {
      const p1 = await panelAt(IFRAME, "assassinate-b-panel-used-390x600");
      out.B_panel1 = p1;
      await H.clickButton(page, "迎戰");
    });
    out.B_fight = { w1: f.w1, killTexts: f.killTexts, hps: f.hps, attacks: f.attacks, result: f.result, results: f.results, shot: await H.shot(page, "assassinate-b-result") };
    run.check("B-3 主頁第 1 波：第一擊必殺木樁（普通 122、攻擊前 99999、補扣 99877、最後 0）、攻擊 1 次、擊殺 1、剩 0；看得到 KILL；清波後的選取面板「奇襲：選取時這一場已經用過，切換關卡或重新開始才恢復…」、data-used 1、剩 0，390×600 時在面板與畫面裡",
      firstOk(f.w1) && f.killTexts >= 1 && same(f.w1.dbg.used, ["gan_ning"]) && !!out.B_panel1 && USED.test(out.B_panel1.panel.note) && out.B_panel1.panel.used === "1" &&
        out.B_panel1.panel.remaining === 0 && inside(out.B_panel1.box),
      { ...out.B_fight, panel1: out.B_panel1 });
    run.check("B-4 主頁第 2 波不再必殺：草人每擊 122（300 → 178 → 56 → 倒下），甘寧總共攻擊 4 次、紀錄不變；勝利結算只有 1 筆：3 星、擊殺 2、戰場點數 1020",
      secondOk(f), out.B_fight);

    const before = fields(backend.profile(KEY));
    const n0 = calls.length;
    await page.getByRole("button", { name: "確認" }).click();
    const s = await waitIdle();
    await H.sleep(1500);
    const results = since(n0, "save_result");
    const cloud = fields(backend.profile(KEY));
    const first = results[0];
    out.B_settle = { before, cloud, local: fields(s), results: results.length, saves: since(n0, "save_profile").length,
      payload: first && { settle_contract: first.payload.settle_contract, request_id: first.payload.request_id, stars: first.payload.stars_earned, loots: first.payload.loots, kills: first.payload.kills },
      battleId: f.result && f.result.battle_id };
    run.check("B-5 按確認：save_result 只送 1 次（settle_contract 2、request_id＝這一場、3 星、battle_points 1020、擊殺 2），沒有整份保存；雲端點數 +1020、經驗 +110 只加一次，本機和雲端相同",
      results.length === 1 && first.payload.settle_contract === 2 && first.payload.request_id === f.result.battle_id && first.payload.stars_earned === 3 && first.payload.kills === 2 &&
        same(lootsOf(first.payload), [{ item: "battle_points", count: 1020 }]) && out.B_settle.saves === 0 && cloud.gold === before.gold + 1020 && cloud.exp === before.exp + 110 &&
        same(fields(s), cloud),
      out.B_settle);

    const n1 = calls.length;
    await page.reload();
    await H.waitHud(page);
    const s2 = await waitIdle();
    await H.sleep(1000);
    out.B_reload = { local: fields(s2), cloud: fields(backend.profile(KEY)), resultsAfter: since(n1, "save_result").length, gets: since(n1, "get_profile").length };
    run.check("B-6 重新整理後讀回：本機的點數與經驗和雲端相同（結算前 +1020），沒有再送 save_result",
      same(out.B_reload.local, out.B_reload.cloud) && out.B_reload.local.gold === before.gold + 1020 && out.B_reload.resultsAfter === 0 && out.B_reload.gets >= 1,
      out.B_reload);
  });

  // ── C. 獨立戰鬥頁（2×）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const c1 = await deploy(BIFRAME, GN_CELL[0], GN_CELL[1], "甘寧");
    const recv = await received(BIFRAME);
    const start = async () => {
      await page.getByRole("button", { name: "迎戰", exact: true }).click();
      await page.locator('[data-testid="speed-2"]').first().click();
    };
    await start();
    const f = await fightTwoWaves(BIFRAME, start);
    const before = fields(backend.profile(KEY));
    const n0 = calls.length;
    const ids0 = calls.filter((c) => c.action === "save_result").map((c) => c.payload.request_id);
    await page.getByRole("button", { name: "確認" }).click();
    await waitUntil(() => since(n0, "save_result").length >= 1, 30000, "獨立戰鬥頁的結算");
    await H.sleep(2000);
    const results = since(n0, "save_result");
    const cloud = fields(backend.profile(KEY));
    out.C = { c1, recv, w1: f.w1, hps: f.hps, attacks: f.attacks, result: f.result, results: results.length, ids0, id: results[0] && results[0].payload.request_id, before, cloud,
      shot: await H.shot(page, "assassinate-c-battle-page") };
    run.check("C-1 獨立戰鬥頁 2×：iframe 收到的 skill 和主頁相同；第一擊必殺木樁（普通 122、補扣 99877、攻擊 1 次）、第 2 波草人每擊 122、總共攻擊 4 次；勝利 3 星 1020；確認後這一場的 save_result 只送 1 次（request_id 和主頁那場不同），雲端點數再 +1020",
      !!c1 && same(recv.skill, SKILL) && firstOk(f.w1) && secondOk(f) && results.length === 1 && !ids0.includes(out.C.id) && cloud.gold === before.gold + 1020,
      out.C);
  });

  // ── D. 存檔與 session 不帶技能或奇襲的使用狀態 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitIdle();
    const p = backend.profile(KEY);
    const sess = await sessionRaw();
    const bad = /skill|assassinate|hp_mid|finish|kill_texts|first_attack|knockback|supply|berserk/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHas: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null };
    run.check("D-1 雲端存檔與 session 都沒有技能或奇襲的使用狀態；隊伍仍只有 hero_id／slot、武將資料不變",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHas && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, PROFILE.team) && same(p.heroes, PROFILE.heroes),
      out.D);
  });

  await page.evaluate(() => {
    localStorage.removeItem("__shenma_as_fixture");
    localStorage.removeItem("__shenma_as_backend");
  }).catch(() => {});
  out.calls = calls.map((c) => [c.action, c.res && c.res.status, c.res && c.res.error, c.payload && c.payload.base_rev, c.res && c.res.rev, c.res && c.res.base_mismatch]);
  return run.finish(out);
}
