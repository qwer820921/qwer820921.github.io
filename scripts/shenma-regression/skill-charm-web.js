async (page) => {
  // 貂蟬「魅惑」（瀏覽器，真 Godot 產物）：設定表的被動描述「魅惑：控制敵人」沒有寫時間、冷卻、範圍與受控後的行為。
  // 遊戲的第一版設計：貂蟬自己的普通攻擊打中仍活著的地面主要目標時，讓它受控 2 秒戰鬥時間：停在原地、不前進也不攻擊武將，改打 1 格內最近的其他地面敵人；
  // 受控的敵人仍算在這一波裡，但武將與防禦塔都不選它；成功後冷卻 6 秒
  // - 測試資料（只在這支腳本加進 mock 名單，__shenma_cm_fixture）：貂蟬（diao_chan，法師、攻擊力 131、防禦 97、生命 1294、射程 4、攻擊間隔 0.8，和正式設定相同）、
  //   關卡「Mock CM 魅惑」：直線路線（第 5 列，從 (3,5) 走到 (13,5)），貂蟬放在 (6,4)（出兵點在射程內）；只有 1 波：同時出現、不會移動的
  //   猛兵（生命 600、攻擊力 300）與草人（生命 250）。貂蟬第一擊打猛兵 131 並控制它，受控的猛兵一擊打倒旁邊的草人；控制結束後貂蟬照常把猛兵打倒、勝利
  // - 玩家存檔的請求交給 Node 端的共用後端：預設是腳本內建的契約 mock，tools/run-browser.mjs 設定 GAS_BACKEND 時改用那個後端（例如模擬試算表上的後端程式）
  // - A：技能說明（主頁的武將視窗、獨立的武將頁，鍵盤也能打開）：技能名稱「魅惑」、受控 2 秒、停在原地改打 1 格內的其他敵人、冷卻 6 秒、仍算在這一波、
  //      武將與防禦塔不攻擊受控的敵人、CHARM；390×844 與 390×600 在畫面寬度內、字級至少 12px
  // - B：主頁：部署貂蟬後 iframe 收到的 skill 正好是 {id: charm, charm_duration: 2, charm_cooldown: 6, charm_attack_radius: 1}；備戰中選取面板寫「可以控制」（390×600）；
  //      迎戰後猛兵受控（來源 diao_chan）、看得到 CHARM；受控中手動暫停 1.5 秒：剩下的控制時間與猛兵的位置不變；受控的猛兵打倒草人（擊殺 1、戰鬥金幣 +5，不是兩次），
  //      這時只剩受控的猛兵：仍在戰鬥中、場上 1 個；受控期間猛兵的生命不變（貂蟬不打它）；選取面板寫「冷卻中，還剩 x 秒」（390×600）；
  //      控制結束後貂蟬把猛兵打倒：勝利結算只有 1 筆（3 星、擊殺 2、戰場點數 1020）；按確認後 save_result 只送 1 次、雲端點數 +1020、經驗 +110；重新整理後讀回
  // - C：獨立戰鬥頁 2×：同樣受控、受控的猛兵打倒草人、勝利 1 筆；確認後這一場的 save_result 也只送 1 次（和主頁那場的 request_id 不同）
  // - D：存檔、session 都沒有技能或魅惑的狀態，隊伍只有 hero_id／slot
  // 全部虛構金鑰 test_wm_*（不含被比對的字樣，避免存檔檢查誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = { backend: null };
  const KEY = "test_wm_k";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const MAP = { id: "chapter3_3", name: "Mock CM 魅惑" };
  const DC_CELL = [6, 4];
  const SKILL = { id: "charm", charm_duration: 2, charm_cooldown: 6, charm_attack_radius: 1 };
  const ATK = 131;
  const BRUTE_HP = 600;
  const SOFT_HP = 250;

  const ROW = 5;
  const zones = [];
  for (let c = 1; c <= 12; c++) zones.push([c, ROW - 1], [c, ROW + 1]);
  const pj = { cols: 14, rows: 11, paths: { path_a: [[3, ROW], [13, ROW]] }, spawn: [3, ROW], base: [13, ROW], build_zones: zones, obstacles: [], background_texture: "maps/bg_forest.webp" };
  const EXTRA = {
    heroes: [
      {
        hero_id: "diao_chan", name: "貂蟬", rarity: "orange", cost: 8, job: "mage",
        base_atk: ATK, base_def: 97, base_hp: 1294, attack_range: 4, attack_speed: 0.8, upgrade_cost_base: 100,
        atk_growth: 13.1, def_growth: 9.7, hp_growth: 129.4, range_growth: 0.05, speed_growth: 0.02, image: "hero_diao_chan.webp", attack_image: "hero_diao_chan_atk.webp",
      },
    ],
    enemies: [
      { enemy_id: "mock_cm_brute", name: "猛兵", hp: BRUTE_HP, speed: 0, atk: 300, image: "enemy_grunt1.webp" },
      { enemy_id: "mock_cm_soft", name: "草人", hp: SOFT_HP, speed: 0, atk: 5, image: "enemy_grunt1.webp" },
    ],
    maps: [{
      map_id: MAP.id, chapter: 3, name: MAP.name, unlock_stage: MAP.id, path_json: pj,
      waves: [
        { wave: 1, enemies: [{ enemy_id: "mock_cm_brute", count: 1, interval: 0.3, path: "path_a" }, { enemy_id: "mock_cm_soft", count: 1, interval: 0.3, path: "path_a" }] },
      ],
    }],
  };
  await ctx.addInitScript((extra) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    const ids = extra.heroes.map((h) => h.hero_id);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_cm_fixture") === "1") {
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
  await page.addInitScript(() => {
    if (window.__wmRecv) return;
    window.__wmRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__wmRecv.push(e.data);
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
    nickname: "魅惑玩家", level: 5, exp: 0, gold: 1000, capacity: 30, max_stage: MAP.id, heroes: [],
    team: [{ hero_id: "diao_chan", slot: 1 }],
  };
  backend.seed(KEY, PROFILE, 3);
  const calls = [];
  await ctx.exposeBinding("__shenmaCmGas", async (_source, body) => {
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
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_cm_backend") === "1" && typeof window.__shenmaCmGas === "function") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (SHARED.includes(body.action)) {
          const res = await window.__shenmaCmGas(body);
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
    const id = "cm-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  const received = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__wmRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const dc = last ? last.team_list.find((t) => t.hero_id === "diao_chan") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: dc ? dc.skill ?? null : undefined, atk: dc ? dc.atk : undefined };
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
  const hc = (s) => (((s || {}).hero_charm) || {}).diao_chan || null;
  // 快照裡的兩名敵人（依生成序號）：[猛兵, 草人]，各帶生命、位置與受控的狀態
  const foes = (s) => {
    const ids = Object.keys((s || {}).enemy_seq || {}).sort((a, b) => s.enemy_seq[a] - s.enemy_seq[b]);
    return ids.map((id) => ({ id, seq: s.enemy_seq[id], kind: s.enemy_kind[id], hp: s.enemy_hp[id], pos: s.enemy_pos[id], charm: (s.enemy_charm || {})[id] || null }));
  };
  // 點場上的貂蟬、讀選取面板的魅惑說明；390×600 時量說明是否在面板與畫面裡（截圖另存）
  const panelAt = async (sel, shotName) => {
    const gp = await cellPoint(sel, DC_CELL[0], DC_CELL[1]);
    await page.mouse.click(gp.x, gp.y);
    await page.waitForSelector('[data-testid="unit-panel-charm"]', { timeout: 15000 });
    const panel = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-charm"]');
      return { note: el.innerText, remaining: Number(el.dataset.remaining) };
    });
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    const box = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="unit-panel-charm"]');
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
    await page.locator('[data-testid="unit-panel"] button[class*="closeBtn"]').click().catch(() => {});
    await H.sleep(300);
    return { panel, box, shot };
  };
  const inside = (b) => !!b && b.left >= 0 && b.right <= b.vw && b.docScroll <= b.vw && b.font >= 12 && b.top >= b.panelTop && b.bottom <= b.panelBottom + 1 && b.bottom <= b.vh;
  const READY = /魅惑：選取時可以控制；打中仍活著的地面目標時讓它受控 2 秒（停下來改打 1 格內的其他敵人），成功後冷卻 6 秒（重新點選可以更新）/;
  const COOLING = /魅惑：選取時冷卻中，還剩 [0-9.]+ 秒；打中仍活著的地面目標時讓它受控 2 秒（停下來改打 1 格內的其他敵人），成功後冷卻 6 秒（重新點選可以更新）/;
  // 迎戰到結算：等猛兵受控；pause 時受控中手動暫停 1.5 秒；記錄草人倒下時的擊殺／金幣／狀態／場上敵人數；受控期間猛兵的生命；
  // panelWhileCharmed 時在草人倒下後、控制結束前打開選取面板；最後等到結算
  const fight = async (sel, opts) => {
    const idx = await H.bridgeLen(page);
    const k = { charms: 0, charmTexts: 0 };
    const end1 = Date.now() + 30000;
    let first = null;
    for (;;) {
      const s = await snapshot(sel);
      k.charmTexts = Math.max(k.charmTexts, s.charm_texts || 0);
      const f = foes(s);
      if (f[0] && f[0].charm && f[0].charm.charmed) {
        first = { s, f };
        break;
      }
      if (Date.now() > end1) throw new Error("等不到受控：" + JSON.stringify(f.map((x) => [x.kind, x.hp, x.charm && x.charm.charmed])));
      await H.sleep(100);
    }
    const out1 = { source: first.f[0].charm.source, bruteHp: first.f[0].hp, pos: first.f[0].pos, kind: first.f[0].kind, remaining: first.f[0].charm.remaining,
      shot: await H.shot(page, "charm-charmed-" + (sel === IFRAME ? "home" : "battle")) };
    if (opts.pause) {
      await page.locator('[data-testid="pause-toggle"]').click();
      await page.waitForSelector('[data-testid="pause-badge"]', { timeout: 15000 });
      const a = foes(await snapshot(sel))[0];
      await H.sleep(1500);
      const b = foes(await snapshot(sel))[0];
      await page.locator('[data-testid="pause-toggle"]').click();
      await page.waitForFunction(() => !document.querySelector('[data-testid="pause-badge"]'), null, { timeout: 15000 });
      out1.pause = { a: a && [a.charm.remaining, a.pos], b: b && [b.charm.remaining, b.pos] };
    }
    // 草人倒下（受控的猛兵打倒的）
    let afterKill = null;
    const end2 = Date.now() + 15000;
    for (;;) {
      const s = await snapshot(sel);
      k.charmTexts = Math.max(k.charmTexts, s.charm_texts || 0);
      const f = foes(s);
      if (f.length === 1) {
        afterKill = { s, f, stats: await lastStats() };
        break;
      }
      if (Date.now() > end2) throw new Error("草人沒有倒下");
      await H.sleep(100);
    }
    const brute = afterKill.f[0];
    out1.afterKill = { kills: afterKill.s.kills, state: afterKill.s.game_state, active: afterKill.s.active_enemies, charmed: brute.charm && brute.charm.charmed,
      bruteHp: brute.hp, hits: ((brute.charm && brute.charm.log) || []).filter((x) => x.ev === "hit").map((x) => [x.target, x.killed]), gold: afterKill.stats && afterKill.stats.gold };
    if (opts.panelWhileCharmed) out1.panel = await panelAt(sel, opts.panelWhileCharmed);
    // 受控期間猛兵的生命：最後一次看到受控時的生命
    let lastCharmedHp = null;
    const end3 = Date.now() + 15000;
    for (;;) {
      const s = await snapshot(sel);
      const b = foes(s)[0];
      if (!b || !b.charm || !b.charm.charmed) break;
      lastCharmedHp = b.hp;
      if (Date.now() > end3) throw new Error("控制沒有結束");
      await H.sleep(100);
    }
    out1.lastCharmedHp = lastCharmedHp;
    const end4 = Date.now() + 60000;
    let fin = null;
    for (;;) {
      const s = await snapshot(sel);
      if (s.game_state === 3) {
        fin = s;
        break;
      }
      if (Date.now() > end4) throw new Error("等不到結算");
      await H.sleep(150);
    }
    await page.waitForFunction(() => /勝 利|落 敗/.test(document.body.innerText), null, { timeout: 30000, polling: 300 });
    await H.sleep(800);
    const res = (await H.bridgeSince(page, idx)).filter(isResult);
    const h = hc(fin) || {};
    return { ...out1, charmTexts: k.charmTexts, count: h.count, result: res[0] || null, results: res.length };
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `charm-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有視窗可關 */ }
    }
  };
  const RULES = (t) =>
    /技能：魅惑/.test(t) &&
    /這位武將自己的普通攻擊打中目標、實際扣到生命，而且目標沒有被這一擊打倒時，讓這名地面敵人受控 2 秒（戰鬥中的遊戲時間：2 倍速時跟著加快，暫停與備戰時不計）/.test(t) &&
    /受控的敵人停在原地，不前進、不抵達城池，也不攻擊武將，改用自己的攻擊力攻擊 1 格內最近的其他地面敵人/.test(t) &&
    /成功控制後冷卻 6 秒/.test(t) && /打倒目標、飛行敵人、已經受控的敵人都不控制，也不用掉冷卻/.test(t) &&
    /受控的敵人仍算在這一波裡，不會讓波次提早結束；受控期間武將與防禦塔都不會攻擊它/.test(t) &&
    /這位武將陣亡或被移出隊伍時，它造成的控制立刻結束/.test(t) && /「CHARM」/.test(t) &&
    /只在戰場生效，不影響存檔/.test(t) && !/冷卻中，還剩/.test(t);
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
  // 一場的共同判定：猛兵受控（來源 diao_chan、受控時生命 600 − 131）；受控的猛兵打倒草人（擊殺 1、只剩它、仍在戰鬥中）；受控期間猛兵的生命不變；
  // 看得到 CHARM；成功控制 1 次；勝利結算只有 1 筆（3 星、擊殺 2、1020）
  const fightOk = (f) =>
    !!f && f.source === "diao_chan" && f.kind === "mock_cm_brute" && f.bruteHp === BRUTE_HP - ATK && f.afterKill.kills === 1 && f.afterKill.state === 2 &&
    f.afterKill.active === 1 && f.afterKill.charmed === true && same(f.afterKill.hits, [[1, true]]) && f.afterKill.bruteHp === BRUTE_HP - ATK &&
    f.lastCharmedHp === BRUTE_HP - ATK && f.charmTexts >= 1 && f.count === 1 && f.results === 1 && f.result.result === "WIN" && f.result.stars_earned === 3 &&
    f.result.kills === 2 && same(lootsOf(f.result), [{ item: "battle_points", count: 1020 }]);

  // ── 準備 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate((k) => {
      localStorage.setItem("__shenma_cm_fixture", "1");
      localStorage.setItem("__shenma_cm_backend", "1");
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
    await page.waitForSelector('[role="dialog"] button[data-hero-id="diao_chan"]');
    const card = await page.locator('[role="dialog"] button[data-hero-id="diao_chan"]').innerText();
    await page.locator('[role="dialog"] button[data-hero-id="diao_chan"]').click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail, shot: await H.shot(page, "charm-a-skill-detail") };
    run.check("A-1 主頁武將視窗：貂蟬的卡片是「技能：魅惑」；詳情寫明實際扣到生命、目標沒被打倒時受控 2 秒戰鬥中的遊戲時間（2 倍速加快、暫停與備戰不計）、停在原地不前進不抵達城池不攻擊武將、改打 1 格內最近的其他地面敵人、冷卻 6 秒、打倒／飛行／已受控不控制也不用掉冷卻、仍算在這一波、受控期間武將與防禦塔不攻擊它、來源陣亡或移出時結束、CHARM；出征前不寫冷卻中",
      /技能：魅惑/.test(card) && RULES(detail), out.A_modal);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('button[data-hero-id="diao_chan"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-testid="hero-skill-detail"]', { timeout: 15000 });
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：貂蟬有「魅惑」標籤（只有一個）；用鍵盤聚焦卡片按 Enter 打開詳情，顯示同樣的規則",
      tags.filter((t) => t === "技能：魅惑").length === 1 && detail2 === detail, out.A_page);
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const narrowPage = await measure();
    const narrowPageShot = await H.shot(page, "charm-a-narrow-heroes-page");
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(600);
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const shortPage = await measure();
    const shortPageShot = await H.shot(page, "charm-a-short-heroes-page");
    await page.keyboard.press("Escape");
    await H.sleep(400);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('[role="dialog"] button[data-hero-id="diao_chan"]');
    await page.locator('[role="dialog"] button[data-hero-id="diao_chan"]').click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    const narrowModalShot = await H.shot(page, "charm-a-narrow-modal");
    out.A_narrow = { narrowPage, shortPage, narrowModal, narrowPageShot, shortPageShot, narrowModalShot };
    run.check("A-3 窄畫面（390×844）與矮畫面（390×600）：武將頁與主頁武將視窗的魅惑說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(shortPage) && fits(narrowModal), out.A_narrow);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.keyboard.press("Escape");
    await H.sleep(300);
    await page.setViewportSize({ width: 540, height: 900 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署、選取面板、受控與暫停、受控擊殺、結算與讀回 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitIdle();
    await H.selectStage(page, MAP.name);
    await dismissSplash(IFRAME);
    const c1 = await deploy(IFRAME, DC_CELL[0], DC_CELL[1], "貂蟬");
    const recv = await received(IFRAME);
    const s0 = await snapshot(IFRAME);
    out.B_payload = { c1, recv, hc: hc(s0) };
    run.check("B-1 規則 payload：用部署選單把貂蟬放在 (6,4)；遊戲 iframe 收到的出征資料裡，貂蟬的 skill 正好是 {id: charm, charm_duration: 2, charm_cooldown: 6, charm_attack_radius: 1}、攻擊力 131；開戰前快照 hero_charm {2, 6, 1, 0 次、剩 0}",
      !!c1 && c1.cell_x === DC_CELL[0] && c1.cell_y === DC_CELL[1] && recv.stage === MAP.id && same(recv.skill, SKILL) && recv.atk === ATK &&
        !!hc(s0) && near(hc(s0).duration, 2) && near(hc(s0).cooldown, 6) && near(hc(s0).radius, 1) && hc(s0).count === 0 && near(hc(s0).remaining, 0),
      out.B_payload);

    const p0 = await panelAt(IFRAME, "charm-b-panel-ready-390x600");
    out.B_panel0 = p0;
    run.check("B-2 備戰中的選取面板「魅惑：選取時可以控制；打中仍活著的地面目標時讓它受控 2 秒（停下來改打 1 格內的其他敵人），成功後冷卻 6 秒（重新點選可以更新）」、剩 0；390×600 時在面板與畫面裡（截圖另存）",
      READY.test(p0.panel.note) && p0.panel.remaining === 0 && inside(p0.box), out.B_panel0);

    const gold0 = (await lastStats() || {}).gold;
    await H.clickButton(page, "迎戰");
    const f = await fight(IFRAME, { pause: true, panelWhileCharmed: "charm-b-panel-cooling-390x600" });
    out.B_fight = { ...f, gold0, shot: await H.shot(page, "charm-b-result") };
    const pz = f.pause || {};
    run.check("B-3 主頁：猛兵受控（來源 diao_chan、生命 469）；受控中手動暫停 1.5 秒：剩下的控制時間與猛兵的位置不變；受控的猛兵打倒草人（紀錄 [草人, 倒下]、擊殺 1、戰鬥金幣 +5），只剩受控的猛兵時仍在戰鬥中、場上 1 個；受控期間猛兵的生命一直是 469；看得到 CHARM；勝利結算只有 1 筆（3 星、擊殺 2、1020）",
      fightOk(f) && !!pz.a && !!pz.b && pz.a[0] === pz.b[0] && pz.a[0] > 0 && same(pz.a[1], pz.b[1]) && f.afterKill.gold === gold0 + 5,
      out.B_fight);
    run.check("B-4 草人倒下後、控制結束前的選取面板「魅惑：選取時冷卻中，還剩 x 秒；…（重新點選可以更新）」，剩下的秒數在 0～6 之間；390×600 時在面板與畫面裡（截圖另存）",
      !!f.panel && COOLING.test(f.panel.panel.note) && f.panel.panel.remaining > 0 && f.panel.panel.remaining <= 6 && inside(f.panel.box), f.panel);

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
    const c1 = await deploy(BIFRAME, DC_CELL[0], DC_CELL[1], "貂蟬");
    const recv = await received(BIFRAME);
    await page.getByRole("button", { name: "迎戰", exact: true }).click();
    await page.locator('[data-testid="speed-2"]').first().click();
    const f = await fight(BIFRAME, {});
    const before = fields(backend.profile(KEY));
    const n0 = calls.length;
    const ids0 = calls.filter((c) => c.action === "save_result").map((c) => c.payload.request_id);
    await page.getByRole("button", { name: "確認" }).click();
    await waitUntil(() => since(n0, "save_result").length >= 1, 30000, "獨立戰鬥頁的結算");
    await H.sleep(2000);
    const results = since(n0, "save_result");
    const cloud = fields(backend.profile(KEY));
    out.C = { c1, recv, fight: f, results: results.length, ids0, id: results[0] && results[0].payload.request_id, before, cloud, shot: await H.shot(page, "charm-c-battle-page") };
    run.check("C-1 獨立戰鬥頁 2×：iframe 收到的 skill 和主頁相同；猛兵受控、受控的猛兵打倒草人（擊殺 1、只剩受控者仍在戰鬥中）、受控期間生命不變；勝利 3 星 1020；確認後這一場的 save_result 只送 1 次（request_id 和主頁那場不同），雲端點數再 +1020",
      !!c1 && same(recv.skill, SKILL) && fightOk(f) && results.length === 1 && !ids0.includes(out.C.id) && cloud.gold === before.gold + 1020,
      out.C);
  });

  // ── D. 存檔與 session 不帶技能或魅惑的狀態 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitIdle();
    const p = backend.profile(KEY);
    const sess = await sessionRaw();
    const bad = /skill|charm|cooldown|radius|knockback|supply|berserk|assassinate/;
    const m = sess.match(bad);
    out.D = { profileKeys: Object.keys(p), team: p.team, heroes: p.heroes, sessionHas: bad.test(sess), sessionMatch: m ? sess.slice(Math.max(0, m.index - 80), m.index + 80) : null };
    run.check("D-1 雲端存檔與 session 都沒有技能或魅惑的狀態；隊伍仍只有 hero_id／slot、武將資料不變",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHas && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]') &&
        same(p.team, PROFILE.team) && same(p.heroes, PROFILE.heroes),
      out.D);
  });

  await page.evaluate(() => {
    localStorage.removeItem("__shenma_cm_fixture");
    localStorage.removeItem("__shenma_cm_backend");
  }).catch(() => {});
  out.calls = calls.map((c) => [c.action, c.res && c.res.status, c.res && c.res.error, c.payload && c.payload.base_rev, c.res && c.res.rev, c.res && c.res.base_mismatch]);
  return run.finish(out);
}
