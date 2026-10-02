async (page) => {
  // 孫權「守護」（瀏覽器，真 Godot 產物）：設定表的被動描述「守護：提升基地防禦」沒有寫數值；遊戲的城池也沒有防禦屬性（城防 20、每隻漏城扣 1）。
  // 遊戲的第一版設計：孫權在場上、還活著時，敵人漏到城池的傷害 × 0.8（和位置無關）；城防仍是整數，這一場累計的漏城傷害無條件進位後才是扣掉的城防
  // （同一位孫權 5 次扣 1、1、1、1、0，共 4），不回復城防；星數與戰場點數照實際的城防計算
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_bg_fixture）：孫權（sun_quan，步兵、攻擊力 115、防禦 93、生命 1131、射程 1、攻擊間隔 1，和正式設定相同）、
  //   關卡「Mock BG 守護」：直線路線（第 5 列，從 (1,5) 走到 (13,5)），孫權放在離路線 3 格的 (2,8)（打不到敵人）；
  //   只有 1 波：5 個生命 99999、每秒 120 像素的跑兵（全部漏城，打不倒；城防剩 16 時勝利）
  // - 玩家存檔的請求（get_profile、save_result 等）交給 Node 端的共用後端：預設是腳本內建的契約 mock（完整結算＋版本契約，和結算測試相同的規則），
  //   tools/run-browser.mjs 設定 GAS_BACKEND（例如在模擬試算表上執行後端程式的轉接層）時改用那個後端；靜態設定仍由 harness 回應
  // - A：技能說明（主頁的武將視窗、獨立的武將頁，鍵盤也能打開）：技能名稱「守護」、漏城傷害 −20%（1 → 0.8）、和位置無關、累計後進位、5 隻扣 1、1、1、1、0、
  //      10 隻扣 8、不回復、只影響漏城、不疊加、結算照實際城防、SHIELD；390×844 與 390×600 在畫面寬度內、字級至少 12px
  // - B：主頁：部署孫權後戰場上方的城防旁出現「守護 −20%」（390×600 也在畫面裡）；選取面板寫出選取時生效中、每隻 ×0.8；迎戰後第 1 隻漏城時手動暫停 1.5 秒，
  //      沒有新的漏城；繼續後 5 隻依序扣 [1,1,1,1,0]、城防 16（畫面與 update_stats 相同），看得到 SHIELD；勝利結算 2 星、戰場點數 620；
  //      按確認後 save_result 只送 1 次、雲端一次保存點數與經驗；重新整理後讀回相同的點數，沒有再送結算
  // - C：獨立戰鬥頁：部署孫權後城防旁同樣顯示「守護 −20%」；2× 時同樣扣 [1,1,1,1,0]、城防 16；確認後這一場的 save_result 也只送 1 次（和主頁那場的 request_id 不同）
  // - D：存檔、session 都沒有技能、守護、累計的漏城傷害或倍率欄位，隊伍只有 hero_id／slot
  // 全部虛構金鑰 test_wq_*（不含被比對的字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = { backend: null };
  const KEY = "test_wq_k";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_6", name: "Mock BG 守護" };
  const SQ_CELL = [2, 8];
  const SKILL = { id: "base_guard", base_damage_mult: 0.8 };
  const RUNNERS = 5;

  const ROW = 5;
  const zones = [[SQ_CELL[0], SQ_CELL[1]]];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[1, ROW], [13, ROW]] }, spawn: [1, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [
      {
        hero_id: "sun_quan", name: "孫權", rarity: "orange", cost: 9, job: "infantry",
        base_atk: 115, base_def: 93, base_hp: 1131, attack_range: 1, attack_speed: 1, upgrade_cost_base: 100,
        atk_growth: 11.5, def_growth: 9.3, hp_growth: 113.1, range_growth: 0.05, speed_growth: 0.02, image: "hero_sun_quan.webp", attack_image: "hero_sun_quan_atk.webp",
      },
    ],
    enemies: [
      { enemy_id: "mock_bg_runner", name: "跑兵", hp: 99999, speed: 120, atk: 5, image: "enemy_grunt1.webp" },
    ],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [
        { wave: 1, enemies: [{ enemy_id: "mock_bg_runner", count: RUNNERS, interval: 0.8, path: "path_a" }] },
      ],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    const ids = extra.heroes.map((h) => h.hero_id);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_bg_fixture") === "1") {
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
    if (window.__wqRecv) return;
    window.__wqRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__wqRecv.push(e.data);
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
    nickname: "守護玩家", level: 1, exp: 0, gold: 1000, capacity: 30, max_stage: MAP.id, heroes: [],
    team: [{ hero_id: "sun_quan", slot: 1 }],
  };
  backend.seed(KEY, PROFILE, 3);
  const calls = [];
  await ctx.exposeBinding("__shenmaBgGas", async (_source, body) => {
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
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_bg_backend") === "1" && typeof window.__shenmaBgGas === "function") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (SHARED.includes(body.action)) {
          const res = await window.__shenmaBgGas(body);
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
  // 結算的 loots（欄位順序不同也能比對）
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
  // 等到結算確認、同步完成；等不到時錯誤訊息帶上最後看到的同步狀態
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
    const id = "bg-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const received = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__wqRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const sq = last ? last.team_list.find((t) => t.hero_id === "sun_quan") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: sq ? sq.skill ?? null : undefined };
    }, sel);
  const lastStats = () => page.evaluate(() => (window.__bridgeLog || []).filter((m) => m.type === "update_stats").pop() || null);
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
  const bg = (s) => (s || {}).base_guard || null;
  // 迎戰到結算：記錄看得到的 SHIELD 標記數；pauseAfterFirst 時第 1 隻漏城後手動暫停 1.5 秒（記錄暫停前後的漏城次數）
  const fightToEnd = async (sel, pauseAfterFirst) => {
    const idx = await H.bridgeLen(page);
    let shields = 0;
    let pause = null;
    const end = Date.now() + 120000;
    for (;;) {
      const s = await snapshot(sel);
      shields = Math.max(shields, s.shield_texts || 0);
      const n = (bg(s) || { log: [] }).log.length;
      if (pauseAfterFirst && !pause && n >= 1) {
        await page.locator('[data-testid="pause-toggle"]').click();
        await page.waitForSelector('[data-testid="pause-badge"]', { timeout: 15000 });
        const a = (bg(await snapshot(sel)) || { log: [] }).log.length;
        await H.sleep(1500);
        const b = (bg(await snapshot(sel)) || { log: [] }).log.length;
        await page.locator('[data-testid="pause-toggle"]').click();
        await page.waitForFunction(() => !document.querySelector('[data-testid="pause-badge"]'), null, { timeout: 15000 });
        pause = { a, b };
      }
      if (s.game_state === 3 || Date.now() > end) break;
      await H.sleep(120);
    }
    await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 30000, polling: 300 });
    await H.sleep(800);
    const res = (await H.bridgeSince(page, idx)).filter(isResult);
    const s = await snapshot(sel);
    return { result: res[0] || null, results: res.length, shields, pause, guard: bg(s), base_hp: s.hp ?? null };
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `base-guard-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };
  const RULES = (t) =>
    /技能：守護/.test(t) &&
    /部署在戰場上、還活著時，敵人漏到城池時城防受到的傷害減少 20%（每隻從 1 點變成 0\.8 點），和部署的位置無關/.test(t) &&
    /城防仍是 20 點整數，不增加上限、不回復：這一場累計的漏城傷害無條件進位後才是實際扣掉的城防，例如連續漏 5 隻依序扣 1、1、1、1、0，共扣 4；漏 10 隻共扣 8/.test(t) &&
    /沒有守護時每隻照 1 點累計，不會補扣先前少扣的部分；切換關卡或重新開始才歸零/.test(t) &&
    /防禦塔與武將受到的傷害不變/.test(t) && /同時有幾名守護時取最強的一個，不疊加/.test(t) &&
    /結算的星數與戰場點數照實際剩下的城防計算，不另外加獎勵、金幣或經驗/.test(t) && /「SHIELD」/.test(t) &&
    /只在戰場生效，不影響存檔/.test(t) && !/選取時生效中/.test(t);
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
  const hudBadge = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="hud-base-guard"]');
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { text: el.innerText.trim(), title: el.getAttribute("title"), left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom),
        vw: window.innerWidth, vh: window.innerHeight, docScroll: document.documentElement.scrollWidth, font: parseFloat(getComputedStyle(el).fontSize) };
    });
  const closePanel = async () => {
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await H.sleep(300);
  };

  // ── 準備 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate((k) => {
      localStorage.setItem("__shenma_bg_fixture", "1");
      localStorage.setItem("__shenma_bg_backend", "1");
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
    await page.waitForSelector('[role="dialog"] button[data-hero-id="sun_quan"]');
    const card = await page.locator('[role="dialog"] button[data-hero-id="sun_quan"]').innerText();
    await page.locator('[role="dialog"] button[data-hero-id="sun_quan"]').click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "base-guard-a-skill-detail") };
    run.check("A-1 主頁武將視窗：孫權的卡片是「技能：守護」；詳情寫明漏城傷害 −20%（1 → 0.8）、和位置無關、城防整數不增加上限不回復、累計後無條件進位（5 隻扣 1、1、1、1、0 共 4；10 隻 8）、來源失效後照 1 累計不補扣、新的一場歸零、只影響漏城、多個取最強不疊加、結算照實際城防不另加獎勵、SHIELD；出征前不寫生效中",
      /技能：守護/.test(card) && RULES(detail), out.A_modal);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('button[data-hero-id="sun_quan"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="hero-skill-detail"]', { timeout: 15000 });
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：孫權有「守護」標籤（只有一個）；用鍵盤聚焦卡片按 Enter 打開詳情，顯示同樣的規則",
      tags.filter((t) => t === "技能：守護").length === 1 && detail2 === detail, out.A_page);
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const narrowPage = await measure();
    const narrowPageShot = await H.shot(page, "base-guard-a-narrow-heroes-page");
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const shortPage = await measure();
    const shortPageShot = await H.shot(page, "base-guard-a-short-heroes-page");
    await page.keyboard.press("Escape");
    await H.sleep(400);
    out.A_narrow = { narrowPage, shortPage, narrowPageShot, shortPageShot };
    run.check("A-3 窄畫面（390×844）與矮畫面（390×600）：武將頁的守護說明在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(shortPage), out.A_narrow);
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署、HUD、選取面板、暫停、漏城與結算 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitIdle();
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    const noBadge = await hudBadge();
    const c1 = await deploy(IFRAME, SQ_CELL[0], SQ_CELL[1], "孫權");
    const recv = await received(IFRAME);
    await page.waitForSelector('[data-testid="hud-base-guard"]', { timeout: 15000 });
    const badge = await hudBadge();
    const stats0 = await lastStats();
    out.B_deploy = { noBadge, c1, recv, badge, statsMult: stats0 && stats0.base_guard_mult };
    run.check("B-1 部署前戰場上方沒有守護標示；用部署選單把孫權放在 (2,8) 後，遊戲 iframe 收到的 skill 正好是 {id: base_guard, base_damage_mult: 0.8}；update_stats 的 base_guard_mult 0.8，城防旁出現「守護 −20%」（說明寫累計後進位）",
      noBadge === null && !!c1 && c1.cell_x === SQ_CELL[0] && c1.cell_y === SQ_CELL[1] && recv.stage === MAP.id && same(recv.skill, SKILL) &&
        !!badge && badge.text === "守護 −20%" && /漏到城池的傷害減少 20%/.test(badge.title || "") && near(stats0 && stats0.base_guard_mult, 0.8),
      out.B_deploy);

    const sp = await cellPoint(IFRAME, SQ_CELL[0], SQ_CELL[1]);
    await page.mouse.click(sp.x, sp.y);
    await page.waitForSelector('[data-testid="unit-panel-base-guard"]', { timeout: 15000 });
    const panel = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-base-guard"]');
      return { note: el.innerText, active: el.dataset.active, mult: Number(el.dataset.effectiveMult) };
    });
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-base-guard"]');
      const p = document.querySelector('[data-testid="unit-panel"]');
      if (!el || !p) return null;
      el.scrollIntoView({ block: "nearest" });
      const b = el.getBoundingClientRect();
      const pb = p.getBoundingClientRect();
      return { left: Math.round(b.left), right: Math.round(b.right), top: Math.round(b.top), bottom: Math.round(b.bottom), vw: window.innerWidth, vh: window.innerHeight,
        panelTop: Math.round(pb.top), panelBottom: Math.round(pb.bottom), font: parseFloat(getComputedStyle(el).fontSize), docScroll: document.documentElement.scrollWidth };
    });
    const narrowBadge = await hudBadge();
    const panelShot = await H.shot(page, "base-guard-b-panel-hud-390x600");
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(400);
    await closePanel();
    out.B_panel = { panel, box, narrowBadge, panelShot };
    const inside = (b) => !!b && b.left >= 0 && b.right <= b.vw && b.docScroll <= b.vw && b.font >= 12 && b.top >= b.panelTop && b.bottom <= b.panelBottom + 1 && b.bottom <= b.vh;
    const badgeIn = (b) => !!b && b.left >= 0 && b.right <= b.vw && b.top >= 0 && b.bottom <= b.vh && b.docScroll <= b.vw && b.font >= 10;
    run.check("B-2 選取面板「守護：選取時生效中，這一場漏城傷害每隻 ×0.8；在場上、還活著時漏城傷害減少 20%，累計後無條件進位才扣城防，不回復城防（重新點選可以更新）」；390×600 時說明在面板與畫面裡、城防旁的「守護 −20%」也在畫面裡（截圖另存）",
      /守護：選取時生效中，這一場漏城傷害每隻 ×0\.8；在場上、還活著時漏城傷害減少 20%，累計後無條件進位才扣城防，不回復城防（重新點選可以更新）/.test(panel.note) &&
        panel.active === "1" && near(panel.mult, 0.8) && inside(box) && badgeIn(narrowBadge),
      out.B_panel);

    await H.clickButton(page, "迎戰");
    const f = await fightToEnd(IFRAME, true);
    const losses = ((f.guard && f.guard.log) || []).map((x) => x.loss);
    const hudHp = await page.evaluate(() => (document.body.innerText.match(/(\d+)\/20/) || [])[1] || null);
    const stats1 = await lastStats();
    out.B_fight = { losses, result: f.result, results: f.results, shields: f.shields, pause: f.pause, hp: f.base_hp, hudHp, statsHp: stats1 && stats1.hp, guard: f.guard && { total: f.guard.total, lost: f.guard.lost },
      shot: await H.shot(page, "base-guard-b-result") };
    run.check("B-3 主頁：第 1 隻漏城後手動暫停 1.5 秒沒有新的漏城；5 隻依序扣 [1,1,1,1,0]（T 4、A 4）、城防 16（快照、update_stats 都是 16），看得到 SHIELD；勝利結算只有 1 筆：2 星、擊殺 0、戰場點數 620",
      same(losses, [1, 1, 1, 1, 0]) && !!f.pause && f.pause.a === f.pause.b && f.pause.a >= 1 && f.pause.a < RUNNERS && f.shields >= 1 &&
        f.results === 1 && f.result.result === "WIN" && f.result.stars_earned === 2 && f.result.kills === 0 &&
        same(lootsOf(f.result), [{ item: "battle_points", count: 620 }]) && stats1 && stats1.hp === 16 && near(f.guard.total, 4, 1e-9) && f.guard.lost === 4,
      out.B_fight);

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
    run.check("B-4 按確認：save_result 只送 1 次（settle_contract 2、request_id＝這一場、2 星、battle_points 620、擊殺 0），沒有整份保存；雲端點數 +620、經驗 +90 只加一次，本機和雲端相同",
      results.length === 1 && first.payload.settle_contract === 2 && first.payload.request_id === f.result.battle_id && first.payload.stars_earned === 2 &&
        same(lootsOf(first.payload), [{ item: "battle_points", count: 620 }]) && out.B_settle.saves === 0 && cloud.gold === before.gold + 620 && cloud.exp === before.exp + 90 &&
        same(fields(s), cloud),
      out.B_settle);

    const n1 = calls.length;
    await page.reload();
    await H.waitHud(page);
    const s2 = await waitIdle();
    await H.sleep(1000);
    out.B_reload = { local: fields(s2), cloud: fields(backend.profile(KEY)), resultsAfter: since(n1, "save_result").length, gets: since(n1, "get_profile").length };
    run.check("B-5 重新整理後讀回：本機的點數與經驗和雲端相同（結算前 +620），沒有再送 save_result",
      same(out.B_reload.local, out.B_reload.cloud) && out.B_reload.local.gold === before.gold + 620 && out.B_reload.resultsAfter === 0 && out.B_reload.gets >= 1,
      out.B_reload);
  });

  // ── C. 獨立戰鬥頁（2×）──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + MAP.id);
    await page.waitForFunction(() => (window.__bridgeLog || []).some((m) => m.type === "update_stats" && m.game_state === 1), null, { timeout: 120000 });
    await dismissSplash(BIFRAME);
    const c1 = await deploy(BIFRAME, SQ_CELL[0], SQ_CELL[1], "孫權");
    const recv = await received(BIFRAME);
    await page.waitForSelector('[data-testid="hud-base-guard"]', { timeout: 15000 });
    const badge = await hudBadge();
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    await page.locator('[data-testid="speed-2"]').first().click();
    const f = await fightToEnd(BIFRAME, false);
    const losses = ((f.guard && f.guard.log) || []).map((x) => x.loss);
    const before = fields(backend.profile(KEY));
    const n0 = calls.length;
    const ids0 = calls.filter((c) => c.action === "save_result").map((c) => c.payload.request_id);
    await page.getByRole("button", { name: "確認" }).click();
    await waitUntil(() => since(n0, "save_result").length >= 1, 30000, "獨立戰鬥頁的結算");
    await H.sleep(2000);
    const results = since(n0, "save_result");
    const cloud = fields(backend.profile(KEY));
    out.C = { c1, recv, badge, losses, result: f.result, results: results.length, ids0, id: results[0] && results[0].payload.request_id, before, cloud,
      shot: await H.shot(page, "base-guard-c-battle-page") };
    run.check("C-1 獨立戰鬥頁：部署孫權後城防旁顯示「守護 −20%」；2× 時同樣扣 [1,1,1,1,0]、勝利 2 星 620；確認後這一場的 save_result 只送 1 次（request_id 和主頁那場不同），雲端點數再 +620",
      !!c1 && same(recv.skill, SKILL) && !!badge && badge.text === "守護 −20%" && same(losses, [1, 1, 1, 1, 0]) && f.results === 1 && f.result.stars_earned === 2 &&
        same(lootsOf(f.result), [{ item: "battle_points", count: 620 }]) && results.length === 1 && !ids0.includes(out.C.id) && cloud.gold === before.gold + 620,
      out.C);
  });

  // ── D. 存檔與 session 不帶技能、守護或累計的漏城傷害 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitIdle();
    const p = backend.profile(KEY);
    const sess = await sessionRaw();
    const bad = /skill|guard|base_damage|mult|leak|shield|knockback|supply|berserk|tenacity|counter/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHas: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null };
    run.check("D-1 雲端存檔與 session 都沒有技能、守護、倍率或累計的漏城傷害欄位；隊伍仍只有 hero_id／slot、武將資料不變",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHas && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, PROFILE.team) && same(p.heroes, PROFILE.heroes),
      out.D);
  });

  await page.evaluate(() => {
    localStorage.removeItem("__shenma_bg_fixture");
    localStorage.removeItem("__shenma_bg_backend");
  }).catch(() => {});
  // 這支腳本經手的玩家存檔請求（動作、狀態碼、錯誤、送出的版本基準與後端回的版本）
  out.calls = calls.map((c) => [c.action, c.res && c.res.status, c.res && c.res.error, c.payload && c.payload.base_rev, c.res && c.res.rev, c.res && c.res.base_mismatch]);
  const sp = calls.find((c) => c.action === "save_profile");
  out.firstSave = sp ? { at: calls.indexOf(sp), data: sp.payload.data } : null;
  const sr = calls.find((c) => c.action === "save_result");
  out.firstResult = sr ? { payload: sr.payload, res: sr.res } : null;
  return run.finish(out);
}
