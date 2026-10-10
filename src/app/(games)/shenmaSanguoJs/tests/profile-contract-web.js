module.exports = async function profileContractWeb(page) {
  // 神馬三國 JS 版共用存檔的瀏覽器契約測試（和 Godot 版共用同一個 shenma_player_key 與同一份雲端存檔）。
  // CommonJS 模組：runner 以 require 載入後呼叫（傳入 Playwright 的 page）。
  // runner 要在 page.context().__canvasContract 提供：
  //   createProfileFixture（tests/profile-contract-fixture.mjs）、baseUrl（本機 out/ 的網址）、
  //   newContext({ viewport })（全新的 context：正式站資源由 out/ 回應、其他外部網路一律擋下）、evidenceDir（截圖的目錄，可省略）
  // 每個情境用全新的 context，GAS 請求一律由 fixture 在 Node 回應（不經網路），可以指定某個 action 的網路錯誤、HTTP 500、
  // 「寫入了但回應遺失」、暫停到測試放行，或改寫回應。檢查的是 fixture 收到的請求（action／key／payload）與讀回的存檔、
  // 畫面與瀏覽器儲存，以及 pageerror／console error。這是模擬的後端，不是正式 DB 的驗收。
  const C = page.context().__canvasContract;
  if (
    !C ||
    typeof C.createProfileFixture !== "function" ||
    typeof C.newContext !== "function"
  ) {
    return {
      allPass: false,
      assertions: [],
      failures: [
        "缺少 __canvasContract（要由 runner 提供 fixture 與 context）",
      ],
    };
  }
  const { createProfileFixture, baseUrl, newContext } = C;
  const PATH = "/shenmaSanguoJs";
  const GAS_PREFIX = "https://script.google.com/";
  const PLAYER_ACTIONS = new Set([
    "get_profile",
    "create_profile",
    "save_profile",
    "upgrade_hero",
    "save_result",
  ]);
  const WRITE_ACTIONS = new Set([
    "create_profile",
    "save_profile",
    "upgrade_hero",
    "save_result",
  ]);

  const assertions = [];
  const scenarios = [];
  let current = null;
  const check = (name, pass, detail) => {
    const full = current ? `${current.name}：${name}` : name;
    assertions.push({ name: full, pass: !!pass, ...(pass ? {} : { detail }) });
    return !!pass;
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const sortKeys = (v) =>
    Array.isArray(v)
      ? v.map(sortKeys)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, sortKeys(v[k])])
          )
        : v;
  const sameJson = (a, b) =>
    JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  /** fixture 裡這把金鑰目前的存檔（只取 rev 與 data） */
  const readBack = (E, key) => {
    const r = E.fx.read(key);
    return r ? { rev: r.rev, data: r.data } : null;
  };
  async function until(fn, timeout = 15000, step = 100) {
    const end = Date.now() + timeout;
    let last;
    while (Date.now() < end) {
      try {
        last = await fn();
        if (last) return last;
      } catch {
        last = undefined;
      }
      await sleep(step);
    }
    return last;
  }

  // 後端武將設定（虛構的數值，hero_id 照後端的格式）：JS 版內建的 13 位，加上一位只在後端的 gan_ning
  const H = (
    hero_id,
    name,
    cost,
    base_atk,
    base_def,
    base_hp,
    upgrade_cost_base
  ) => ({
    hero_id,
    name,
    cost,
    base_atk,
    base_def,
    base_hp,
    upgrade_cost_base,
    atk_growth: 10,
    def_growth: 5,
    hp_growth: 100,
  });
  const HEROES = [
    H("ma_chao", "馬超", 5, 130, 60, 1300, 100),
    H("zhao_yun", "趙雲", 4, 120, 60, 1300, 120),
    H("huang_zhong", "黃忠", 4, 125, 50, 1000, 100),
    H("zhou_yu", "周瑜", 5, 135, 55, 1000, 100),
    H("guan_yu", "關羽", 5, 140, 70, 1450, 120),
    H("liu_bei", "劉備", 4, 105, 80, 1600, 100),
    H("zhang_fei", "張飛", 5, 140, 70, 1450, 100),
    H("wei_yan", "魏延", 4, 120, 60, 1200, 100),
    H("cao_cao", "曹操", 5, 120, 70, 1400, 100),
    H("xia_hou_dun", "夏侯惇", 4, 115, 75, 1500, 100),
    H("liao_hua", "廖化", 3, 100, 65, 1300, 100),
    H("yan_liang", "顏良", 4, 125, 60, 1300, 100),
    H("sun_shang_xiang", "孫尚香", 4, 120, 50, 1050, 100),
    H("gan_ning", "甘寧", 7, 122, 107, 1235, 100),
  ];
  // v2.9 create_profile 建立的新存檔
  const NEW = (extra = {}) => ({
    nickname: "新主公",
    level: 1,
    exp: 0,
    gold: 500,
    capacity: 11,
    max_stage: "chapter1_1",
    heroes: [],
    team: [],
    ...extra,
  });

  // ── GAS：全部由 fixture 回應；規則可指定網路錯誤／HTTP 500／寫入了但回應遺失／暫停／改寫回應 ──
  async function installGas(ctx, fx) {
    const g = {
      log: [],
      rules: [],
      /** 這個 action（可限定 key）接下來 times 次照 kind 處理：abort／http500／lost（寫入了但回應遺失）／hold（等 release）／transform */
      rule(action, kind, opts = {}) {
        const r = {
          action,
          kind,
          key: opts.key,
          times: opts.times ?? 1,
          fn: opts.fn,
          hits: 0,
          waiting: [],
          release(outcome = "ok") {
            const ws = r.waiting.splice(0);
            ws.forEach((w) => w(outcome));
            return ws.length;
          },
        };
        g.rules.push(r);
        return r;
      },
      count: (action, key) =>
        g.log.filter(
          (e) => e.action === action && (key === undefined || e.key === key)
        ).length,
      writes: () => g.log.filter((e) => WRITE_ACTIONS.has(e.action)),
      players: () => g.log.filter((e) => PLAYER_ACTIONS.has(e.action)),
    };
    const cors = { "access-control-allow-origin": "*" };
    await ctx.route(`${GAS_PREFIX}**`, async (route) => {
      const req = route.request();
      let body = {};
      try {
        body = JSON.parse(req.postData() || "{}");
      } catch {
        body = {};
      }
      const e = {
        i: g.log.length,
        t: Date.now(),
        action: body.action ?? null,
        key: body.key ?? null,
        payload: body.payload === undefined ? null : clone(body.payload),
        url: req.url().split("?")[0],
        outcome: null,
        status: null,
        error: null,
      };
      g.log.push(e);
      const r = g.rules.find(
        (x) =>
          x.times > 0 &&
          x.action === body.action &&
          (x.key === undefined || x.key === body.key)
      );
      let kind = "ok";
      if (r) {
        r.times -= 1;
        r.hits += 1;
        kind = r.kind;
        if (kind === "hold")
          kind = await new Promise((res) => r.waiting.push(res));
      }
      e.outcome = kind;
      try {
        if (kind === "abort") return await route.abort("failed");
        if (kind === "http500")
          return await route.fulfill({
            status: 500,
            contentType: "text/html",
            headers: cors,
            body: "<html>error</html>",
          });
        // reply：不交給 fixture（後端沒有寫入），直接回 fn(body) 的內容；transform：fixture 先處理（可能已寫入），再改寫回應
        let res =
          kind === "reply" && r.fn ? r.fn(clone(body)) : fx.handle(body);
        if (kind === "transform" && r.fn) res = r.fn(clone(res));
        e.status = res.status;
        e.error = res.error ?? null;
        if (kind === "lost") return await route.abort("failed");
        return await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: cors,
          body: JSON.stringify(res),
        });
      } catch (err) {
        e.routeError = String((err && err.message) || err);
      }
    });
    return g;
  }

  /** 一個情境的環境：全新的 context、fixture 與 GAS 規則；開的分頁都記錄 pageerror／console error */
  async function env({
    seed = [],
    viewport = { width: 1280, height: 800 },
    requireBaseRev = false,
    maps = [],
    enemies = [],
  } = {}) {
    const fx = createProfileFixture({
      heroesConfig: HEROES,
      requireBaseRev,
      maps,
      enemies,
    });
    for (const s of seed) fx.seed(s.key, clone(s.data), s.rev, s.opts || {});
    const ctx = await newContext({ viewport });
    const gas = await installGas(ctx, fx);
    const E = {
      fx,
      ctx,
      gas,
      errors: [],
      pages: [],
      allowGasErrors: 0,
      gas2: null,
      page: null,
      close: null,
    };
    E.page = async ({ storage, session } = {}) => {
      const p = await ctx.newPage();
      p.on("pageerror", (err) =>
        E.errors.push({
          kind: "pageerror",
          text: String((err && err.message) || err),
        })
      );
      p.on("console", (m) => {
        if (m.type() === "error")
          E.errors.push({
            kind: "console",
            text: m.text(),
            url: (m.location() && m.location().url) || "",
          });
      });
      if (storage || session) {
        await p.goto(`${baseUrl}/robots.txt`);
        await p.evaluate(
          ({ s, ss }) => {
            if (s) {
              localStorage.clear();
              for (const [k, v] of Object.entries(s))
                localStorage.setItem(k, v);
            }
            if (ss)
              for (const [k, v] of Object.entries(ss))
                sessionStorage.setItem(k, v);
          },
          { s: storage, ss: session }
        );
      }
      await p.goto(`${baseUrl}${PATH}`);
      E.pages.push(p);
      return p;
    };
    E.close = async () => {
      await ctx.close().catch(() => {});
    };
    return E;
  }

  /** 情境結束：pageerror 一律失敗；console error 只放過「這個情境刻意讓 GAS 失敗」的那幾筆，其他照實失敗 */
  function checkErrors(E) {
    const pageErrors = E.errors.filter((x) => x.kind === "pageerror");
    const consoleErrors = E.errors.filter((x) => x.kind === "console");
    const gasInjected = consoleErrors.filter(
      (x) =>
        x.url.startsWith(GAS_PREFIX) && /Failed to load resource/.test(x.text)
    );
    // runner 依政策擋下的第三方（廣告、分析）：另外列出，不算這個功能的錯誤；本站與 GAS 的錯誤照實失敗
    const thirdParty = consoleErrors.filter(
      (x) =>
        /ERR_BLOCKED_BY_CLIENT/.test(x.text) &&
        /^https?:\/\//.test(x.url) &&
        !x.url.startsWith(baseUrl) &&
        !x.url.startsWith("https://qwer820921.github.io/") &&
        !x.url.startsWith(GAS_PREFIX)
    );
    const other = consoleErrors.filter(
      (x) => !gasInjected.includes(x) && !thirdParty.includes(x)
    );
    check("沒有 pageerror", pageErrors.length === 0, pageErrors);
    check(
      `console error 只有刻意讓 GAS 失敗的請求（最多 ${E.allowGasErrors} 筆）`,
      other.length === 0 && gasInjected.length <= E.allowGasErrors,
      { other, gasInjected }
    );
    return {
      pageErrors,
      consoleErrors,
      thirdPartyBlocked: thirdParty.map((x) => x.url),
    };
  }

  // ── 畫面操作 ──
  const modal = (p) => p.locator(".modal.show");
  async function openInfo(p) {
    await p.locator('button[aria-label="主公資訊"]').click();
    return until(
      () => p.locator('[data-testid="player-info-nickname"]').isVisible(),
      15000
    );
  }
  async function closeModal(p) {
    if ((await modal(p).count()) === 0) return;
    await p.keyboard.press("Escape");
    // 等淡出結束、視窗從 DOM 移除（只等 .show 消失時，截圖還看得到視窗）
    await until(async () => (await p.locator(".modal").count()) === 0, 5000);
  }
  const text = async (p, sel) =>
    (await p.locator(sel).count())
      ? (await p.locator(sel).first().innerText()).trim()
      : null;
  const isDisabled = async (p, sel) =>
    (await p.locator(sel).count()) ? p.locator(sel).first().isDisabled() : null;
  async function waitLoaded(p) {
    // 共用帳號載入完成：開主公資訊看得到暱稱；或出現金鑰視窗（沒有登入）
    return until(async () => {
      if (await p.locator('[data-testid="key-setup"]').isVisible())
        return "key-setup";
      if (await p.locator('[data-testid="player-info-nickname"]').isVisible())
        return "player";
      return null;
    }, 20000);
  }
  async function loadShared(p) {
    await until(
      async () =>
        (await p.locator('button[aria-label="主公資訊"]').count()) > 0,
      20000
    );
    await sleep(300);
    const ok = await openInfo(p);
    return ok ? "player" : await waitLoaded(p);
  }
  async function saveNickname(p, nick) {
    // 先關掉上一次的說明，才不會把舊的說明當成這次的結果
    const old = p.locator('[data-testid="player-info-feedback"] .btn-close');
    if (await old.count()) await old.first().click();
    await until(
      async () =>
        (await p.locator('[data-testid="player-info-feedback"]').count()) === 0,
      3000
    );
    await p.locator('[data-testid="player-info-nick-edit"]').click();
    const input = modal(p).locator("form input.form-control").first();
    await input.fill(nick);
    await p.locator('[data-testid="player-info-nick-save"]').click();
    const fb = await until(
      () => text(p, '[data-testid="player-info-feedback"]'),
      15000
    );
    // 沒有保存時編輯框還開著：收起來，畫面才看得到目前的暱稱
    if (await p.locator('[data-testid="player-info-nick-save"]').count()) {
      await modal(p).locator("form button", { hasText: "取消" }).click();
    }
    return fb;
  }
  async function storageOf(p) {
    return p.evaluate(() => {
      const ls = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        ls[k] = localStorage.getItem(k);
      }
      const ss = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        ss[k] = sessionStorage.getItem(k);
      }
      return { ls, ss };
    });
  }
  /** 武將名冊（武將視窗左側）某位武將卡的文字 */
  async function rosterCard(p, name) {
    return p.evaluate((nm) => {
      const box = document.querySelector('.modal.show div[style*="380px"]');
      if (!box) return null;
      const s = [...box.querySelectorAll("strong")].find(
        (x) => x.textContent.trim() === nm
      );
      const card = s && s.closest("div.p-2");
      return card ? card.innerText : null;
    }, name);
  }
  async function rosterCount(p) {
    return p.evaluate(() => {
      const box = document.querySelector('.modal.show div[style*="380px"]');
      return box ? box.querySelectorAll("strong").length : null;
    });
  }
  async function openRoster(p) {
    await p.locator("button", { hasText: /^武將$/ }).click();
    return until(() => modal(p).isVisible(), 10000);
  }
  async function openTeam(p) {
    await p.locator("button", { hasText: /^隊伍$/ }).click();
    return until(() => modal(p).isVisible(), 10000);
  }
  async function pickTeamHero(p, name) {
    const s = modal(p).locator('div.row[style*="220px"] strong', {
      hasText: name,
    });
    if ((await s.count()) === 0) return false;
    await s.first().click();
    return true;
  }
  /** 讓這場戰鬥直接以勝利或落敗結束（只用來觸發結算畫面，不驗收戰鬥）：用頁面掛的 window.__testBridge，沒有時從畫布找 React 元件裡的 LocalGameBridge */
  async function forceWin(p, win = true) {
    return p.evaluate((isWin) => {
      const tb = window.__testBridge;
      if (tb && tb.engine && tb.engine.battleManager) {
        tb.engine.battleManager.endBattle(isWin);
        return "ok";
      }
      const canvas = document.querySelector("canvas");
      if (!canvas) return "no-canvas";
      const fk = Object.keys(canvas).find((k) => k.startsWith("__reactFiber$"));
      let f = fk ? canvas[fk] : null;
      for (let d = 0; f && d < 80; d++, f = f.return) {
        let h = f.memoizedState;
        for (
          let i = 0;
          h && typeof h === "object" && i < 100;
          i++, h = h.next
        ) {
          const cur = h.memoizedState && h.memoizedState.current;
          if (
            cur &&
            typeof cur.startBattle === "function" &&
            cur.engine &&
            cur.engine.battleManager
          ) {
            cur.engine.battleManager.endBattle(isWin);
            return "ok";
          }
        }
      }
      return "no-bridge";
    }, win);
  }
  // 後端的關卡與敵人設定（虛構的最小完整資料：一條路線、一波兩隻）：讓 Canvas 用後端設定，出征才可能寫入共用進度
  const ENEMIES = [
    {
      enemy_id: "grunt_lv1",
      name: "黃巾小卒",
      hp: 120,
      speed: 65,
      atk: 15,
      movement_type: "ground",
      image: "enemy_grunt1.webp",
      attack_image: "enemy_grunt1_atk.webp",
    },
  ];
  const MAP = (id, n) => ({
    map_id: id,
    chapter: 1,
    name: `測試第${n}關`,
    unlock_stage: id,
    path_json: JSON.stringify({
      cols: 14,
      rows: 10,
      paths: {
        path_a: [
          [0, 3],
          [13, 3],
        ],
      },
      base: [13, 3],
      build_zones: [[2, 2]],
    }),
    waves: [
      {
        wave: 1,
        enemies: [
          { enemy_id: "grunt_lv1", count: 2, interval: 1.5, path: "path_a" },
        ],
      },
    ],
  });
  const MAPS = [
    MAP("chapter1_1", 1),
    MAP("chapter1_2", 2),
    MAP("chapter1_3", 3),
  ];
  const bm = (p, expr) =>
    p.evaluate((e) => {
      const b =
        window.__testBridge &&
        window.__testBridge.engine &&
        window.__testBridge.engine.battleManager;
      if (!b) return null;
      return e === "battleId"
        ? b.battleId
        : e === "state"
          ? b.gameState
          : e === "stage"
            ? b.stageId
            : null;
    }, expr);
  /** 等後端設定讀到並用它重新載入這一關（battleId 換新、之後一段時間不再變） */
  async function waitRemoteStage(p, E) {
    await until(() => E.gas.count("get_all_maps") > 0, 15000);
    let last = null;
    let stable = 0;
    await until(async () => {
      const id = await bm(p, "battleId");
      stable = id && id === last ? stable + 1 : 0;
      last = id;
      return stable >= 8;
    }, 15000);
    return last;
  }
  /** 按「進入戰場」開戰（第一次進入戰鬥時固定這一場） */
  async function startBattle(p) {
    await p.locator('[data-testid="enter-battle"]').click();
    return until(async () => (await bm(p, "state")) === 2, 5000);
  }
  /** 受控的結束回呼：只設定基地、擊殺、時間後呼叫引擎的 endBattle（不驗收戰鬥本身） */
  async function endWith(
    p,
    { win = true, baseHp = 20, kills = 12, time = 95.4 }
  ) {
    return p.evaluate(
      ({ w, h, k, tm }) => {
        const b = window.__testBridge.engine.battleManager;
        b.baseHp = h;
        b.kills = k;
        b.battleTime = tm;
        b.endBattle(w);
        return "ok";
      },
      { w: win, h: baseHp, k: kills, tm: time }
    );
  }
  const pendingKeys = async (p) =>
    Object.keys((await storageOf(p)).ss).filter((k) =>
      k.startsWith("shenma_js_settle_pending_")
    );

  const shot = async (p, name) => {
    if (!C.evidenceDir) return null;
    const file = `${C.evidenceDir}/${name}.png`;
    await p.screenshot({ path: file }).catch(() => {});
    return file;
  };

  async function scenario(name, fn) {
    const sc = {
      name,
      started: Date.now(),
      gas: null,
      errors: null,
      error: null,
    };
    scenarios.push(sc);
    current = sc;
    let E = null;
    try {
      E = await fn((opts) => env(opts).then((x) => (E = x)));
    } catch (err) {
      sc.error = String((err && err.stack) || err);
      check("情境沒有例外", false, sc.error);
    } finally {
      if (E && E.gas) {
        sc.gas = E.gas.log.map((e) => ({
          action: e.action,
          key: e.key,
          outcome: e.outcome,
          status: e.status,
          error: e.error,
          payload: e.payload,
          url: e.url,
        }));
        const r = checkErrors(E);
        sc.errors = r;
        await E.close();
      }
      sc.seconds = Math.round((Date.now() - sc.started) / 1000);
      current = null;
    }
  }

  // ═══ 1. 新存檔（heroes 空陣列、team 空陣列）：不崩潰、武將照設定顯示、不能出征、不寫入 ═══
  await scenario("新存檔 heroes／team 空陣列", async (mk) => {
    const E = await mk({ seed: [{ key: "k_new", data: NEW(), rev: 1 }] });
    const p = await E.page({ storage: { shenma_player_key: "k_new" } });
    check("讀到共用存檔並顯示", (await loadShared(p)) === "player");
    check(
      "暱稱是雲端的新主公",
      (await text(p, '[data-testid="player-info-nickname"]')) === "新主公"
    );
    check(
      "標示共用帳號",
      /共用帳號/.test((await text(p, '[data-testid="player-info-mode"]')) || "")
    );
    check(
      "同步狀態是已同步",
      (await p
        .locator('[data-testid="player-info-sync"]')
        .getAttribute("data-sync")) === "idle"
    );
    await closeModal(p);
    check(
      "沒有隊伍：說明要先編排隊伍",
      /還沒有出征隊伍/.test(
        (await text(p, '[data-testid="sortie-blocked"]')) || ""
      )
    );
    check(
      "沒有隊伍：迎戰按鈕停用",
      (await isDisabled(p, '[data-testid="hud-start-battle"]')) === true
    );
    await openRoster(p);
    check(
      "武將視窗列出設定裡兩邊都有的 13 位（不列只在後端的武將）",
      (await rosterCount(p)) === 13,
      await rosterCount(p)
    );
    const card = await rosterCard(p, "關羽");
    check(
      "沒升級過的武將用設定的基礎值顯示（Lv.1、攻 140）",
      !!card && /Lv\.1/.test(card) && /攻: 140/.test(card),
      card
    );
    check(
      "沒有出現空狀態",
      (await p.locator('[data-testid="hero-roster-empty"]').count()) === 0
    );
    await closeModal(p);
    const st = await storageOf(p);
    check("金鑰沒有被改", st.ls.shenma_player_key === "k_new", st.ls);
    check(
      "沒有寫舊的 JS 金鑰或 JS 快取",
      !("shenma_js_player_key" in st.ls) &&
        !Object.keys(st.ls).some((k) => k.startsWith("shenma_js_local_state_")),
      st.ls
    );
    check("沒有任何寫入請求", E.gas.writes().length === 0, E.gas.writes());
    check(
      "讀取只用這把金鑰",
      E.gas
        .players()
        .every((e) => e.action === "get_profile" && e.key === "k_new"),
      E.gas.players()
    );
    check(
      "雲端存檔沒有變",
      sameJson(readBack(E, "k_new"), { rev: 1, data: NEW() }),
      E.fx.read("k_new")
    );
    await shot(p, "new-profile-1280");
    return E;
  });

  // ═══ 2. 武將設定讀不到：武將視窗顯示空狀態、不能改隊伍與升級 ═══
  await scenario("武將設定讀不到", async (mk) => {
    const E = await mk({ seed: [{ key: "k_cfg", data: NEW(), rev: 1 }] });
    E.gas.rule("get_heroes_config", "abort", { times: 6 });
    E.allowGasErrors = 6;
    const p = await E.page({ storage: { shenma_player_key: "k_cfg" } });
    check("存檔照樣讀到", (await loadShared(p)) === "player");
    check(
      "說明武將設定讀不到",
      /武將設定讀不到/.test(
        (await text(p, '[data-testid="player-info-notice"]')) || ""
      )
    );
    check(
      "暱稱也不能改（整份唯讀）",
      (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) === true
    );
    await closeModal(p);
    await openRoster(p);
    check(
      "武將視窗顯示空狀態、沒有崩潰",
      await until(
        () => p.locator('[data-testid="hero-roster-empty"]').isVisible(),
        5000
      )
    );
    await closeModal(p);
    check("沒有任何寫入請求", E.gas.writes().length === 0, E.gas.writes());
    return E;
  });

  // ═══ 3. 0 值、未知欄位與不支援的武將原樣保留；改暱稱只改暱稱、帶 base_rev ═══
  const OLD = () => ({
    nickname: "舊主公",
    level: 2,
    exp: 30,
    gold: 0,
    capacity: 12,
    max_stage: "chapter1_3",
    heroes: [
      {
        hero_id: "guan_yu",
        level: 3,
        star: 1,
        atk: 0,
        def: 0,
        hp: 0,
        mystery: "x",
      },
      { hero_id: "lu_bu", level: 2, star: 0, atk: 1, def: 1, hp: 1 },
    ],
    team: [{ hero_id: "guan_yu", slot: 1 }],
    future_field: { a: [1, 2] },
    stage_stars: { chapter1_1: 3 },
  });
  await scenario("0 值與未知欄位只改暱稱", async (mk) => {
    const E = await mk({ seed: [{ key: "k_old", data: OLD(), rev: 7 }] });
    const p = await E.page({ storage: { shenma_player_key: "k_old" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    const body = (await modal(p).innerText()) || "";
    check(
      "世界金幣 0 照樣是 0、等級與容量照雲端",
      /🪙 0\b/.test(body) && /Lv\.2/.test(body) && /12 Cost/.test(body),
      body.slice(0, 600)
    );
    check(
      "說明有 1 位武將這裡不能顯示",
      /另有 1 位武將這裡不能顯示/.test(
        (await text(p, '[data-testid="player-info-notice"]')) || ""
      )
    );
    const fb = await saveNickname(p, "新暱稱");
    check("暱稱保存成功才說已保存", /已保存/.test(fb || ""), fb);
    const saves = E.gas.log.filter((e) => e.action === "save_profile");
    check("只送一次 save_profile", saves.length === 1, saves.length);
    const sent = saves[0] && saves[0].payload;
    check(
      "帶已確認的 base_rev 7",
      !!sent && sent.base_rev === 7,
      sent && sent.base_rev
    );
    check(
      "保存的資料只改了暱稱（未知欄位、0 值、不支援的武將、隊伍原樣）",
      !!sent && sameJson(sent.data, { ...OLD(), nickname: "新暱稱" }),
      sent && sent.data
    );
    check(
      "沒有存回 JS 版的顯示值（key、serverRev、updatedAt、cleared_stages、預設 1500／65、補齊的武將）",
      !!sent &&
        !["key", "serverRev", "updatedAt", "cleared_stages"].some(
          (k) => k in sent.data
        ) &&
        sent.data.gold === 0 &&
        sent.data.capacity === 12 &&
        sent.data.heroes.length === 2,
      sent && Object.keys(sent.data)
    );
    check(
      "雲端讀回：rev 8，資料和送出的相同",
      sameJson(readBack(E, "k_old"), {
        rev: 8,
        data: { ...OLD(), nickname: "新暱稱" },
      }),
      E.fx.read("k_old")
    );
    check(
      "畫面顯示新暱稱",
      (await text(p, '[data-testid="player-info-nickname"]')) === "新暱稱"
    );
    await closeModal(p);
    await openRoster(p);
    const card = await rosterCard(p, "關羽");
    check(
      "升級過的武將用存檔的數值（Lv.3、攻 0）",
      !!card && /Lv\.3/.test(card) && /攻: 0\b/.test(card),
      card
    );
    await closeModal(p);
    return E;
  });

  // ═══ 4. 後端要求版本號（REQUIRE_BASE_REV 開）：一樣帶版本保存 ═══
  await scenario("後端要求版本號時照樣保存", async (mk) => {
    const E = await mk({
      seed: [{ key: "k_req", data: NEW({ nickname: "要版本" }), rev: 4 }],
      requireBaseRev: true,
    });
    const p = await E.page({ storage: { shenma_player_key: "k_req" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    const fb = await saveNickname(p, "有帶版本");
    check("保存成功", /已保存/.test(fb || ""), fb);
    check(
      "雲端是 rev 5",
      E.fx.read("k_req").rev === 5 &&
        E.fx.read("k_req").data.nickname === "有帶版本",
      E.fx.read("k_req")
    );
    return E;
  });

  // ═══ 5. 隊伍：只改 team（後端格式、slot 從 1 起）、用後端 cost 與存檔 capacity 檢查 ═══
  await scenario("隊伍只改 team 並用後端 cost 檢查", async (mk) => {
    const base = NEW({ x_flag: true });
    const E = await mk({ seed: [{ key: "k_team", data: base, rev: 3 }] });
    const p = await E.page({ storage: { shenma_player_key: "k_team" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await openTeam(p);
    check(
      "選得到關羽與趙雲",
      (await pickTeamHero(p, "關羽")) && (await pickTeamHero(p, "趙雲"))
    );
    check(
      "隊伍 cost 用後端設定（5＋4＝9）",
      /^9\b/.test((await text(p, '[data-testid="team-edit-cost"]')) || ""),
      await text(p, '[data-testid="team-edit-cost"]')
    );
    await p.locator('[data-testid="team-edit-save"]').click();
    await until(async () => (await modal(p).count()) === 0, 10000);
    const saves = E.gas.log.filter((e) => e.action === "save_profile");
    check(
      "只送一次 save_profile、帶 base_rev 3",
      saves.length === 1 && saves[0].payload.base_rev === 3,
      saves.map((s) => s.payload && s.payload.base_rev)
    );
    const want = {
      ...base,
      team: [
        { hero_id: "guan_yu", slot: 1 },
        { hero_id: "zhao_yun", slot: 2 },
      ],
    };
    check(
      "只改了 team（後端的 hero_id、slot 從 1 起），其他原樣",
      saves[0] && sameJson(saves[0].payload.data, want),
      saves[0] && saves[0].payload.data
    );
    check(
      "雲端讀回 rev 4",
      sameJson(readBack(E, "k_team"), { rev: 4, data: want }),
      E.fx.read("k_team")
    );
    check(
      "有隊伍後可以出征",
      (await p.locator('[data-testid="sortie-blocked"]').count()) === 0 &&
        (await isDisabled(p, '[data-testid="hud-start-battle"]')) === false
    );
    await openTeam(p);
    await pickTeamHero(p, "馬超");
    const over = await text(p, '[data-testid="team-edit-cost"]');
    check(
      "超過容量（14 / 11）：保存鈕停用、不送出",
      /^14 \/ 11/.test(over || "") &&
        (await isDisabled(p, '[data-testid="team-edit-save"]')) === true &&
        E.gas.count("save_profile") === 1,
      { over, saves: E.gas.count("save_profile") }
    );
    await closeModal(p);
    return E;
  });

  // ═══ 6. 雲端的隊伍不支援：原樣保留、不能改隊伍與出征，暱稱照樣能改且隊伍原樣 ═══
  await scenario("不支援的隊伍暫停出征", async (mk) => {
    const data = NEW({
      team: [{ hero_id: "gan_ning", slot: 1 }],
      heroes: [
        {
          hero_id: "gan_ning",
          level: 4,
          star: 1,
          atk: 160,
          def: 120,
          hp: 1500,
        },
      ],
    });
    const E = await mk({ seed: [{ key: "k_gn", data, rev: 2 }] });
    const p = await E.page({ storage: { shenma_player_key: "k_gn" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    check(
      "說明隊伍不支援、不能出征",
      /不支援/.test((await text(p, '[data-testid="sortie-blocked"]')) || "")
    );
    check(
      "迎戰停用",
      (await isDisabled(p, '[data-testid="hud-start-battle"]')) === true
    );
    await openTeam(p);
    check(
      "隊伍視窗說明不能修改",
      await p.locator('[data-testid="team-edit-blocked"]').isVisible()
    );
    await closeModal(p);
    await openInfo(p);
    const fb = await saveNickname(p, "隊伍照舊");
    check("暱稱保存成功", /已保存/.test(fb || ""), fb);
    const sent = E.gas.log.find((e) => e.action === "save_profile");
    check(
      "保存的隊伍與武將原樣（不換成預設隊伍）",
      !!sent && sameJson(sent.payload.data, { ...data, nickname: "隊伍照舊" }),
      sent && sent.payload.data
    );
    return E;
  });

  // ═══ 7. 找不到存檔：不自動建立，要再按一次才 create_profile；建立後讀回 ═══
  await scenario("找不到存檔要明確建立", async (mk) => {
    const E = await mk({ seed: [] });
    const p = await E.page();
    check("沒有金鑰：出現金鑰視窗", (await waitLoaded(p)) === "key-setup");
    await p.locator('[data-testid="key-setup-input"]').fill("k_miss");
    await p.locator('[data-testid="key-setup-login"]').click();
    check(
      "說明雲端找不到",
      /找不到/.test(
        (await until(
          () => text(p, '[data-testid="key-setup-error"]'),
          10000
        )) || ""
      )
    );
    check(
      "出現「建立新存檔」",
      await p.locator('[data-testid="key-setup-create-confirm"]').isVisible()
    );
    check(
      "只有讀取、沒有建立或保存",
      E.gas.writes().length === 0 && E.gas.count("get_profile", "k_miss") >= 1,
      E.gas.players()
    );
    check(
      "金鑰還沒記住",
      (await storageOf(p)).ls.shenma_player_key === undefined
    );
    await p.locator('[data-testid="key-setup-create-confirm"]').click();
    check(
      "建立後讀到存檔",
      await until(
        async () =>
          (await p.locator('[data-testid="key-setup"]').count()) === 0,
        15000
      )
    );
    check(
      "只送一次 create_profile",
      E.gas.count("create_profile") === 1 && E.gas.count("save_profile") === 0
    );
    const created = E.fx.read("k_miss");
    check(
      "雲端是新建立的存檔（rev 1、heroes 空）",
      !!created &&
        created.rev === 1 &&
        Array.isArray(created.data.heroes) &&
        created.data.heroes.length === 0,
      created
    );
    check(
      "建立成功後才記住金鑰",
      (await storageOf(p)).ls.shenma_player_key === "k_miss"
    );
    check(
      "建立後有唯讀讀回",
      E.gas.log.findIndex((e) => e.action === "get_profile") <
        E.gas.log.findIndex((e) => e.action === "create_profile") &&
        E.gas.log
          .slice(E.gas.log.findIndex((e) => e.action === "create_profile"))
          .some((e) => e.action === "get_profile")
    );
    await openInfo(p);
    check(
      "新存檔可以開主公資訊",
      (await text(p, '[data-testid="player-info-nickname"]')) === "主公"
    );
    await closeModal(p);
    // 這個瀏覽器記住的金鑰在雲端找不到：帶入金鑰、說明，不建立
    const p2c = await newContext({ viewport: { width: 1280, height: 800 } });
    await installGas(p2c, E.fx).then((g2) => (E.gas2 = g2));
    const p2 = await p2c.newPage();
    p2.on("pageerror", (err) =>
      E.errors.push({ kind: "pageerror", text: String(err) })
    );
    await p2.goto(`${baseUrl}/robots.txt`);
    await p2.evaluate(() =>
      localStorage.setItem("shenma_player_key", "k_gone")
    );
    await p2.goto(`${baseUrl}${PATH}`);
    check(
      "記住的金鑰找不到：金鑰視窗帶入建立按鈕",
      await until(
        () =>
          p2.locator('[data-testid="key-setup-create-confirm"]').isVisible(),
        15000
      )
    );
    check(
      "記住的金鑰找不到：沒有寫入、金鑰沒被清掉",
      E.gas2.writes().length === 0 &&
        (await storageOf(p2)).ls.shenma_player_key === "k_gone",
      E.gas2.players()
    );
    await p2c.close();
    return E;
  });

  // ═══ 8. 讀取失敗（網路、HTTP 500、存檔損毀）：一律不建檔、不改金鑰 ═══
  for (const [label, kind, setup] of [
    ["網路錯誤", "abort", null],
    ["HTTP 500", "http500", null],
    ["存檔損毀", null, { corrupt: true }],
  ]) {
    await scenario(`讀取失敗（${label}）不建檔`, async (mk) => {
      const E = await mk({
        seed: [{ key: "k_err", data: NEW(), rev: 2, opts: setup || {} }],
      });
      if (kind) {
        E.gas.rule("get_profile", kind, { times: 3 });
        E.allowGasErrors = 3;
      }
      const p = await E.page({ storage: { shenma_player_key: "k_err" } });
      check(
        "出現金鑰視窗並說明讀取失敗",
        (await waitLoaded(p)) === "key-setup" &&
          /讀取雲端存檔失敗/.test(
            (await text(p, '[data-testid="key-setup-error"]')) || ""
          ),
        await text(p, '[data-testid="key-setup-error"]')
      );
      check(
        "不提供建立（不是找不到）",
        (await p
          .locator('[data-testid="key-setup-create-confirm"]')
          .count()) === 0
      );
      check("沒有任何寫入請求", E.gas.writes().length === 0, E.gas.writes());
      check(
        "金鑰沒有被改",
        (await storageOf(p)).ls.shenma_player_key === "k_err"
      );
      return E;
    });
  }

  // ═══ 9. 建立時已經有存檔／結果不明：不重送 ═══
  await scenario("建立遇到已存在與結果不明", async (mk) => {
    const E = await mk({ seed: [] });
    const p = await E.page();
    await waitLoaded(p);
    const tryCreate = async (key) => {
      await p.locator('[data-testid="key-setup-input"]').fill(key);
      await p.locator('[data-testid="key-setup-login"]').click();
      await until(
        () => p.locator('[data-testid="key-setup-create-confirm"]').isVisible(),
        10000
      );
    };
    // 已存在：別處先建立了
    await tryCreate("k_dup");
    E.fx.handle({
      action: "create_profile",
      key: "k_dup",
      payload: { nickname: "別處建立" },
    });
    await p.locator('[data-testid="key-setup-create-confirm"]').click();
    check(
      "已存在：改為讀取那份存檔",
      await until(
        async () =>
          (await p.locator('[data-testid="key-setup"]').count()) === 0,
        15000
      )
    );
    await openInfo(p);
    check(
      "已存在：顯示雲端的暱稱",
      (await text(p, '[data-testid="player-info-nickname"]')) === "別處建立"
    );
    check(
      "已存在：只送一次 create_profile、沒有 save_profile",
      E.gas.count("create_profile", "k_dup") === 1 &&
        E.gas.count("save_profile") === 0
    );
    // 結果不明且其實沒建立：說明、不重送
    await p.locator("button", { hasText: "切換金鑰" }).click();
    const sw = modal(p).locator('input[placeholder^="例"]');
    const createFor = (key) =>
      until(
        async () =>
          (
            (await text(p, '[data-testid="player-info-create-confirm"]')) || ""
          ).includes(key),
        10000
      );
    await sw.fill("k_never");
    await modal(p).locator("button", { hasText: "確認切換" }).click();
    await createFor("k_never");
    E.gas.rule("create_profile", "abort", { key: "k_never" });
    E.allowGasErrors += 1;
    await p.locator('[data-testid="player-info-create-confirm"]').click();
    const err = await until(
      () => modal(p).locator(".alert-danger").first().innerText(),
      15000
    );
    check(
      "結果不明（沒建立）：說明不會自動重送",
      /不會自動重送/.test(err || ""),
      err
    );
    await sleep(1500);
    check(
      "結果不明：create_profile 只送一次",
      E.gas.count("create_profile", "k_never") === 1 && !E.fx.read("k_never")
    );
    check(
      "結果不明：帳號還是原本的",
      (await storageOf(p)).ls.shenma_player_key === "k_dup"
    );
    // 結果不明但其實建立了：唯讀查一次就讀到
    await sw.fill("k_lost");
    await modal(p).locator("button", { hasText: "確認切換" }).click();
    await createFor("k_lost");
    E.gas.rule("create_profile", "lost", { key: "k_lost" });
    E.allowGasErrors += 1;
    await p.locator('[data-testid="player-info-create-confirm"]').click();
    check(
      "結果不明（已建立）：讀回後切換成功",
      await until(
        async () =>
          (await text(p, '[data-testid="player-info-nickname"]')) === "主公" &&
          (await storageOf(p)).ls.shenma_player_key === "k_lost",
        15000
      )
    );
    check(
      "結果不明（已建立）：create_profile 只送一次",
      E.gas.count("create_profile", "k_lost") === 1
    );
    await closeModal(p);
    return E;
  });

  // ═══ 10. 版本與資料格式：版本不明或欄位壞掉時唯讀，手動同步讀到正常版本後恢復 ═══
  await scenario("版本不明與格式不對時唯讀", async (mk) => {
    const bad = NEW();
    delete bad.level;
    const E = await mk({
      seed: [
        { key: "k_rev", data: NEW({ nickname: "版本" }), rev: 3 },
        { key: "k_bad", data: bad, rev: 1 },
      ],
    });
    E.gas.rule("get_profile", "transform", {
      key: "k_rev",
      fn: (r) => ({ ...r, rev: "abc" }),
    });
    const p = await E.page({ storage: { shenma_player_key: "k_rev" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    check(
      "版本不明：說明、不能改暱稱",
      /版本不明/.test(
        (await text(p, '[data-testid="player-info-notice"]')) || ""
      ) &&
        (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) === true
    );
    await closeModal(p);
    await openTeam(p);
    check(
      "版本不明：隊伍不能保存",
      await p.locator('[data-testid="team-edit-blocked"]').isVisible()
    );
    await closeModal(p);
    await openInfo(p);
    await p.locator('[data-testid="player-info-sync-btn"]').click();
    check(
      "手動同步讀到正常版本後可以改暱稱",
      await until(
        async () =>
          (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) ===
          false,
        10000
      )
    );
    await p.locator("button", { hasText: "切換金鑰" }).click();
    await modal(p).locator('input[placeholder^="例"]').fill("k_bad");
    await modal(p).locator("button", { hasText: "確認切換" }).click();
    await until(
      async () => (await storageOf(p)).ls.shenma_player_key === "k_bad",
      10000
    );
    check(
      "缺少 level：說明格式無法安全處理、不能改暱稱",
      await until(
        async () =>
          /無法安全處理/.test(
            (await text(p, '[data-testid="player-info-notice"]')) || ""
          ) &&
          (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) ===
            true,
        10000
      )
    );
    check("沒有任何寫入請求", E.gas.writes().length === 0, E.gas.writes());
    await closeModal(p);
    return E;
  });

  // ═══ 11. 兩個分頁：舊版本的保存 409，改用雲端資料、不重送 ═══
  await scenario("兩個分頁的版本衝突", async (mk) => {
    const E = await mk({
      seed: [{ key: "k_409", data: NEW({ nickname: "原名" }), rev: 2 }],
    });
    const a = await E.page({ storage: { shenma_player_key: "k_409" } });
    const b = await E.page();
    check(
      "兩個分頁都讀到 rev 2",
      (await loadShared(a)) === "player" && (await loadShared(b)) === "player"
    );
    check(
      "分頁 A 保存成功",
      /已保存/.test((await saveNickname(a, "A改")) || "")
    );
    const fb = await saveNickname(b, "B改");
    check("分頁 B 用舊版本保存：說明沒有保存", /較新的存檔/.test(fb || ""), fb);
    check(
      "分頁 B 改用雲端的資料（A改）",
      await until(
        async () =>
          (await text(b, '[data-testid="player-info-nickname"]')) === "A改",
        5000
      )
    );
    check(
      "分頁 B 標示已改用雲端版本",
      (await b
        .locator('[data-testid="player-info-sync"]')
        .getAttribute("data-sync")) === "conflict"
    );
    await sleep(1500);
    const saves = E.gas.log.filter((e) => e.action === "save_profile");
    check(
      "save_profile 共兩次（B 沒有用新版本自動重送）",
      saves.length === 2 && saves[1].payload.base_rev === 2,
      saves.map((s) => s.payload && s.payload.base_rev)
    );
    check(
      "雲端仍是 A 的保存（rev 3）",
      sameJson(readBack(E, "k_409"), {
        rev: 3,
        data: NEW({ nickname: "A改" }),
      }),
      E.fx.read("k_409")
    );
    check(
      "分頁 B 之後用新版本可以保存",
      /已保存/.test((await saveNickname(b, "B再改")) || "") &&
        E.fx.read("k_409").rev === 4
    );
    return E;
  });

  // ═══ 12. 升級：後端的 hero_id＋base_rev、伺服器計費後讀回；結果不明不重送；409 改用雲端資料 ═══
  await scenario("武將升級走伺服器", async (mk) => {
    const data = NEW({
      gold: 1000,
      heroes: [
        { hero_id: "guan_yu", level: 1, star: 0, atk: 140, def: 70, hp: 1450 },
      ],
    });
    const E = await mk({ seed: [{ key: "k_up", data, rev: 5 }] });
    const p = await E.page({ storage: { shenma_player_key: "k_up" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await openRoster(p);
    await modal(p)
      .locator('div[style*="380px"] strong', { hasText: "關羽" })
      .first()
      .click();
    check(
      "升級費用照後端設定（120×Lv.1）",
      /🪙 120（伺服器計算）/.test((await modal(p).innerText()) || "")
    );
    await p.locator('[data-testid="hero-upgrade"]').click();
    check(
      "升級後讀回：關羽 Lv.2、攻 150",
      await until(
        async () =>
          /Lv\.2/.test((await rosterCard(p, "關羽")) || "") &&
          /攻: 150/.test((await rosterCard(p, "關羽")) || ""),
        10000
      ),
      await rosterCard(p, "關羽")
    );
    const ups = E.gas.log.filter((e) => e.action === "upgrade_hero");
    check(
      "upgrade_hero 用後端的 hero_id 與 base_rev 5",
      ups.length === 1 &&
        sameJson(ups[0].payload, { hero_id: "guan_yu", base_rev: 5 }),
      ups.map((u) => u.payload)
    );
    const iUp = E.gas.log.indexOf(ups[0]);
    check(
      "升級後有唯讀讀回",
      E.gas.log.slice(iUp + 1).some((e) => e.action === "get_profile")
    );
    check(
      "點數由伺服器扣（1000−120＝880）",
      /🪙 880/.test((await modal(p).innerText()) || "") &&
        E.fx.read("k_up").data.gold === 880
    );
    // 結果不明：伺服器其實升級了，但回應遺失
    E.gas.rule("upgrade_hero", "lost");
    E.allowGasErrors += 1;
    await p.locator('[data-testid="hero-upgrade"]').click();
    check(
      "結果不明：說明要手動同步",
      await until(
        async () => /結果不明/.test((await modal(p).innerText()) || ""),
        10000
      )
    );
    check(
      "結果不明：升級按鈕停用（確認前不寫入）",
      await until(
        async () =>
          (await isDisabled(p, '[data-testid="hero-upgrade"]')) === true,
        5000
      )
    );
    await sleep(1500);
    check("結果不明：upgrade_hero 沒有重送", E.gas.count("upgrade_hero") === 2);
    await closeModal(p);
    await openInfo(p);
    check(
      "結果不明：暱稱也不能改",
      (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) === true
    );
    check(
      "結果不明：同步狀態是待確認",
      (await p
        .locator('[data-testid="player-info-sync"]')
        .getAttribute("data-sync")) === "unknown"
    );
    await p.locator('[data-testid="player-info-sync-btn"]').click();
    check(
      "手動同步後恢復可寫",
      await until(
        async () =>
          (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) ===
          false,
        10000
      )
    );
    await closeModal(p);
    await openRoster(p);
    await modal(p)
      .locator('div[style*="380px"] strong', { hasText: "關羽" })
      .first()
      .click();
    check(
      "手動同步讀到伺服器的結果（Lv.3、點數 640）",
      /Lv\.3/.test((await rosterCard(p, "關羽")) || "") &&
        /🪙 640/.test((await modal(p).innerText()) || "")
    );
    // 另一個入口先改了存檔：舊版本的升級 409，改用雲端資料、不重送
    const cur = E.fx.read("k_up");
    E.fx.handle({
      action: "save_profile",
      key: "k_up",
      payload: {
        data: { ...cur.data, gold: 2000, nickname: "Godot改" },
        base_rev: cur.rev,
      },
    });
    await p.locator('[data-testid="hero-upgrade"]').click();
    check(
      "409：改用雲端資料（點數 2000）並說明",
      await until(
        async () =>
          /較新的存檔/.test((await modal(p).innerText()) || "") &&
          /🪙 2,000/.test((await modal(p).innerText()) || ""),
        10000
      )
    );
    await sleep(1000);
    check("409：upgrade_hero 沒有重送", E.gas.count("upgrade_hero") === 3);
    check(
      "409：雲端沒有被升級",
      E.fx.read("k_up").data.heroes.find((h) => h.hero_id === "guan_yu")
        .level === 3
    );
    await closeModal(p);
    return E;
  });

  // ═══ 13. 換帳號：舊帳號遲到的寫入與讀取回應不套用、不卡住新帳號 ═══
  await scenario("換帳號時舊帳號的遲到回應", async (mk) => {
    const E = await mk({
      seed: [
        { key: "k_a", data: NEW({ nickname: "甲" }), rev: 1 },
        { key: "k_b", data: NEW({ nickname: "乙" }), rev: 9 },
      ],
    });
    const p = await E.page({ storage: { shenma_player_key: "k_a" } });
    check("讀到甲", (await loadShared(p)) === "player");
    // 甲的保存暫停在伺服器，期間切換到乙
    const hold = E.gas.rule("save_profile", "hold", { key: "k_a" });
    await p.locator('[data-testid="player-info-nick-edit"]').click();
    await modal(p).locator("form input.form-control").first().fill("甲改");
    await p.locator('[data-testid="player-info-nick-save"]').click();
    await until(() => hold.waiting.length > 0, 5000);
    await p.locator("button", { hasText: "切換金鑰" }).click();
    await modal(p).locator('input[placeholder^="例"]').fill("k_b");
    await modal(p).locator("button", { hasText: "確認切換" }).click();
    check(
      "切換到乙",
      await until(
        async () =>
          (await text(p, '[data-testid="player-info-nickname"]')) === "乙",
        10000
      )
    );
    check(
      "甲的保存還沒回來時，乙不受影響：可以改暱稱",
      (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) === false
    );
    hold.release("ok");
    await sleep(1500);
    check(
      "甲的保存回應遲到：畫面仍是乙",
      (await text(p, '[data-testid="player-info-nickname"]')) === "乙"
    );
    check("金鑰是乙", (await storageOf(p)).ls.shenma_player_key === "k_b");
    check(
      "乙沒有卡在「正在保存」：可以改暱稱",
      (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) === false
    );
    const fb = await saveNickname(p, "乙改");
    check("乙的保存成功", /已保存/.test(fb || ""), fb);
    const bSaves = E.gas.log.filter(
      (e) => e.action === "save_profile" && e.key === "k_b"
    );
    check(
      "乙只保存了自己的資料（rev 9、只改暱稱）",
      bSaves.length === 1 &&
        bSaves[0].payload.base_rev === 9 &&
        sameJson(bSaves[0].payload.data, NEW({ nickname: "乙改" })),
      bSaves.map((s) => s.payload)
    );
    check(
      "雲端：甲是甲改（伺服器有處理）、乙是乙改",
      E.fx.read("k_a").data.nickname === "甲改" &&
        E.fx.read("k_b").data.nickname === "乙改"
    );
    // 甲的讀取暫停，期間切換回甲以外的帳號：遲到的甲不套用
    await p.locator("button", { hasText: "切換金鑰" }).click();
    await modal(p).locator('input[placeholder^="例"]').fill("k_a");
    await modal(p).locator("button", { hasText: "確認切換" }).click();
    await until(
      async () =>
        (await text(p, '[data-testid="player-info-nickname"]')) === "甲改",
      10000
    );
    const holdRead = E.gas.rule("get_profile", "hold", { key: "k_a" });
    E.fx.handle({
      action: "save_profile",
      key: "k_a",
      payload: {
        data: NEW({ nickname: "甲遠端" }),
        base_rev: E.fx.read("k_a").rev,
      },
    });
    await p.locator('[data-testid="player-info-sync-btn"]').click();
    await until(() => holdRead.waiting.length > 0, 5000);
    await p.locator("button", { hasText: "切換金鑰" }).click();
    await modal(p).locator('input[placeholder^="例"]').fill("k_b");
    await modal(p).locator("button", { hasText: "確認切換" }).click();
    check(
      "切換到乙（甲的讀取還沒回來）",
      await until(
        async () =>
          (await text(p, '[data-testid="player-info-nickname"]')) === "乙改",
        10000
      )
    );
    holdRead.release("ok");
    await sleep(1500);
    check(
      "甲遲到的讀取：畫面仍是乙、金鑰是乙",
      (await text(p, '[data-testid="player-info-nickname"]')) === "乙改" &&
        (await storageOf(p)).ls.shenma_player_key === "k_b"
    );
    await closeModal(p);
    return E;
  });

  // ═══ 14. 保存中離開再回來：不自動重送，手動同步看到伺服器的結果 ═══
  await scenario("保存中重新整理不重送", async (mk) => {
    const E = await mk({
      seed: [{ key: "k_rl", data: NEW({ nickname: "整理前" }), rev: 1 }],
    });
    const p = await E.page({ storage: { shenma_player_key: "k_rl" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    const hold = E.gas.rule("save_profile", "hold", { key: "k_rl" });
    await p.locator('[data-testid="player-info-nick-edit"]').click();
    await modal(p).locator("form input.form-control").first().fill("整理後");
    await p.locator('[data-testid="player-info-nick-save"]').click();
    await until(() => hold.waiting.length > 0, 5000);
    await p.reload();
    hold.release("ok");
    check("重新進入後讀到存檔", (await loadShared(p)) === "player");
    await sleep(1000);
    check(
      "save_profile 只有一次（沒有自動重送）",
      E.gas.count("save_profile") === 1
    );
    check("金鑰沒變", (await storageOf(p)).ls.shenma_player_key === "k_rl");
    await p.locator('[data-testid="player-info-sync-btn"]').click();
    check(
      "手動同步看到伺服器的結果",
      await until(
        async () =>
          (await text(p, '[data-testid="player-info-nickname"]')) === "整理後",
        10000
      )
    );
    await closeModal(p);
    return E;
  });

  // ═══ 15. 訪客：只用自己的本機存檔，不連雲端、不碰共用金鑰與 Godot 快取 ═══
  await scenario("訪客和共用帳號隔離", async (mk) => {
    const E = await mk({
      seed: [{ key: "k_godot", data: NEW({ nickname: "Godot主公" }), rev: 3 }],
    });
    const godotSession = JSON.stringify({
      key: "k_godot",
      marker: "godot-cache",
    });
    const p = await E.page({
      storage: {},
      session: { shenma_player_state: godotSession },
    });
    await waitLoaded(p);
    await p.locator('[data-testid="key-setup-guest"]').click();
    check(
      "進入訪客",
      await until(
        async () =>
          (await p.locator('[data-testid="key-setup"]').count()) === 0,
        10000
      )
    );
    await openRoster(p);
    const before = E.gas.log.length;
    await p.locator('[data-testid="hero-upgrade"]').click();
    await sleep(800);
    check("訪客升級在本機（沒有 GAS 請求）", E.gas.log.length === before);
    await closeModal(p);
    check(
      "訪客：沒有任何存檔請求",
      E.gas.players().length === 0,
      E.gas.players()
    );
    const st = await storageOf(p);
    check("訪客：沒有寫共用金鑰", !("shenma_player_key" in st.ls), st.ls);
    check(
      "訪客：只寫自己的存檔與標記",
      "shenma_js_guest_state" in st.ls && st.ls.shenma_js_guest_active === "1"
    );
    check(
      "訪客：Godot 的 session 快取原樣",
      st.ss.shenma_player_state === godotSession
    );
    // 從訪客切換到共用帳號：記住金鑰、拿掉訪客標記；訪客存檔留在本機
    await openInfo(p);
    check(
      "標示訪客",
      /訪客/.test((await text(p, '[data-testid="player-info-mode"]')) || "")
    );
    await p.locator("button", { hasText: "切換金鑰" }).click();
    await modal(p).locator('input[placeholder^="例"]').fill("k_godot");
    await modal(p).locator("button", { hasText: "確認切換" }).click();
    check(
      "切換到共用帳號",
      await until(
        async () =>
          (await text(p, '[data-testid="player-info-nickname"]')) ===
          "Godot主公",
        10000
      )
    );
    const st2 = await storageOf(p);
    check(
      "切換後：記住共用金鑰、拿掉訪客標記",
      st2.ls.shenma_player_key === "k_godot" &&
        !("shenma_js_guest_active" in st2.ls),
      st2.ls
    );
    check(
      "切換後：沒有寫入（只讀）",
      E.gas.writes().length === 0,
      E.gas.writes()
    );
    await closeModal(p);
    return E;
  });

  // ═══ 16. 匯入停用、匯出雲端原樣 ═══
  await scenario("匯入停用與匯出原樣", async (mk) => {
    const data = { ...OLD(), nickname: "匯出" };
    const E = await mk({ seed: [{ key: "k_exp", data, rev: 11 }] });
    const p = await E.page({ storage: { shenma_player_key: "k_exp" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await p.locator('button[title="系統設定"]').click();
    await until(() => modal(p).isVisible(), 5000);
    check(
      "匯入按鈕停用並說明",
      (await isDisabled(p, '[data-testid="settings-import"]')) === true &&
        (await p
          .locator('[data-testid="settings-import-disabled"]')
          .isVisible())
    );
    const [dl] = await Promise.all([
      p.waitForEvent("download", { timeout: 10000 }),
      p.locator('[data-testid="settings-export"]').click(),
    ]);
    const file = await dl.path();
    const fs =
      typeof process !== "undefined" && process.getBuiltinModule
        ? process.getBuiltinModule("fs")
        : null;
    let exported = null;
    try {
      exported =
        file && fs
          ? JSON.parse(fs.readFileSync(file, "utf8"))
          : await (async () => {
              const s = await dl.createReadStream();
              const chunks = [];
              for await (const c of s) chunks.push(c);
              return JSON.parse(Buffer.concat(chunks).toString("utf8"));
            })();
    } catch (err) {
      exported = { parseError: String(err) };
    }
    check(
      "匯出是雲端存檔原樣（key、rev、data）",
      sameJson(exported, { key: "k_exp", rev: 11, data }),
      exported
    );
    await closeModal(p);
    check("沒有任何寫入請求", E.gas.writes().length === 0, E.gas.writes());
    return E;
  });

  // ═══ 17. 戰鬥結算：共用帳號不寫入、不發獎勵，結算畫面照實說明 ═══
  // 原本是「戰鬥結果不寫入共用進度」（結算暫停時的期望）；共用結算啟用後改成已解鎖的寫入控制組（原文與理由另存證據）
  await scenario("戰鬥結算寫入共用進度（已解鎖控制組）", async (mk) => {
    const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
    const E = await mk({
      seed: [{ key: "k_bat", data, rev: 6 }],
      maps: MAPS,
      enemies: ENEMIES,
    });
    const p = await E.page({ storage: { shenma_player_key: "k_bat" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    check("目前是第一關", (await bm(p, "stage")) === "chapter1_1");
    check("按進入戰場開戰", await startBattle(p));
    check(
      "受控的勝利結束（基地 20、擊殺 12、時間 95.4）",
      (await endWith(p, {})) === "ok"
    );
    check(
      "結算畫面：已保存到共用進度",
      await until(
        () => p.locator('[data-testid="result-settle-confirmed"]').isVisible(),
        10000
      )
    );
    const sv = E.gas.log.filter((e) => e.action === "save_result");
    const rid = sv[0] && sv[0].payload && sv[0].payload.request_id;
    check(
      "剛好一次 save_result，內容逐欄等於寫死的值（星數與點數來自這場的結果、base_rev 6、契約 2）",
      sv.length === 1 &&
        typeof rid === "string" &&
        sameJson(sv[0].payload, {
          stage_id: "chapter1_1",
          result: "WIN",
          stars_earned: 3,
          kills: 12,
          time_seconds: 95,
          loots: [{ item: "battle_points", count: 1120 }],
          request_id: rid,
          base_rev: 6,
          settle_contract: 2,
        }),
      sv.map((e) => e.payload)
    );
    check(
      "沒有 save_profile 或其他寫入",
      E.gas.writes().length === 1,
      E.gas.writes().map((e) => e.action)
    );
    check(
      "雲端讀回：rev 7，點數 +1120、經驗 110 升到 Lv.2、容量 12、進度第二關",
      sameJson(readBack(E, "k_bat"), {
        rev: 7,
        data: {
          ...data,
          gold: 1620,
          exp: 10,
          level: 2,
          capacity: 12,
          max_stage: "chapter1_2",
        },
      }),
      readBack(E, "k_bat")
    );
    const card = (await text(p, '[data-testid="result-card"]')) || "";
    check(
      "結算畫面列後端回應的獎勵（主公金幣 +1120、主公經驗 +110、Lv.2）與三顆星",
      /主公金幣\s*\+1120/.test(card) &&
        /主公經驗\s*\+110/.test(card) &&
        /Lv\.2/.test(card) &&
        /★★★/.test(card),
      card
    );
    check("暫存已刪除", (await pendingKeys(p)).length === 0);
    check(
      "讀回的進度讓第二關可以走（下一關）",
      await until(
        async () =>
          (await p.locator('[data-testid="result-next-stage"]').count()) === 1,
        5000
      )
    );
    await shot(p, "battle-settled-1280");
    return E;
  });

  // ═══ 共用結算：自由演練與唯讀都不寫入 ═══
  await scenario("戰鬥結算：自由演練不寫入", async (mk) => {
    const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
    const E = await mk({
      seed: [{ key: "k_free", data, rev: 6 }],
      maps: MAPS,
      enemies: ENEMIES,
    });
    const p = await E.page({ storage: { shenma_player_key: "k_free" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    await p.locator('button[title="切換關卡"]').click();
    await until(() => modal(p).isVisible(), 5000);
    await p.locator("#free-play-switch").check();
    await modal(p).locator(".card", { hasText: "測試第3關" }).first().click();
    check(
      "用自由演練進入未解鎖的第三關",
      await until(async () => (await bm(p, "stage")) === "chapter1_3", 5000)
    );
    await until(async () => (await modal(p).count()) === 0, 5000);
    await waitRemoteStage(p, E);
    check("開戰", await startBattle(p));
    check(
      "說明這場不寫入（自由演練）",
      /自由演練/.test(
        (await text(p, '[data-testid="sortie-settle-note"]')) || ""
      )
    );
    await endWith(p, {});
    check(
      "結算畫面：沒有寫入共用進度（自由演練）",
      await until(
        async () =>
          /自由演練/.test(
            (await text(p, '[data-testid="result-not-saved"]')) || ""
          ),
        5000
      )
    );
    await sleep(800);
    check("沒有任何寫入", E.gas.writes().length === 0, E.gas.writes());
    check("雲端存檔沒有變", sameJson(readBack(E, "k_free"), { rev: 6, data }));
    return E;
  });
  await scenario("戰鬥結算：唯讀不寫入", async (mk) => {
    const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
    const E = await mk({
      seed: [{ key: "k_ro", data, rev: 6 }],
      maps: MAPS,
      enemies: ENEMIES,
    });
    // 讀取的回應沒有版本：畫面唯讀
    E.gas.rule("get_profile", "transform", {
      times: 99,
      fn: (res) => ({ ...res, rev: undefined }),
    });
    const p = await E.page({ storage: { shenma_player_key: "k_ro" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    // 唯讀時原本就不能出征（隊伍不可編輯）；直接結束這一場也不寫入
    check(
      "唯讀：不能按進入戰場",
      (await isDisabled(p, '[data-testid="enter-battle"]')) === true
    );
    await endWith(p, {});
    check(
      "結算畫面：沒有寫入共用進度",
      await until(
        () => p.locator('[data-testid="result-not-saved"]').isVisible(),
        5000
      )
    );
    await sleep(800);
    check("沒有任何寫入", E.gas.writes().length === 0, E.gas.writes());
    check("雲端存檔沒有變", sameJson(readBack(E, "k_ro"), { rev: 6, data }));
    return E;
  });

  // ═══ 共用結算：結果不明 → 重新整理不自動送 → 鍵盤按「重新確認」原樣再送、獎勵只一次（三個尺寸） ═══
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 390, height: 600 },
    { width: 390, height: 844 },
  ]) {
    await scenario(
      `戰鬥結算：結果不明後重新確認 ${vp.width}×${vp.height}`,
      async (mk) => {
        const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
        const E = await mk({
          seed: [{ key: "k_pend", data, rev: 6 }],
          maps: MAPS,
          enemies: ENEMIES,
          viewport: vp,
        });
        // 第一次：後端已寫入，但回 SERVER_ERROR（結果不明）
        E.gas.rule("save_result", "transform", {
          fn: () => ({ status: 500, error: "SERVER_ERROR" }),
        });
        const p = await E.page({ storage: { shenma_player_key: "k_pend" } });
        check("讀到存檔", (await loadShared(p)) === "player");
        await closeModal(p);
        await waitRemoteStage(p, E);
        check("開戰", await startBattle(p));
        // 2 星（基地 15、擊殺 9、時間 80.2）：星數與點數要直接來自這場的結果
        await endWith(p, { baseHp: 15, kills: 9, time: 80.2 });
        check(
          "結算畫面：結果待確認，有「重新確認」",
          await until(
            () => p.locator('[data-testid="result-settle-retry"]').isVisible(),
            10000
          )
        );
        const first = E.gas.log.filter((e) => e.action === "save_result");
        const rid = first[0] && first[0].payload && first[0].payload.request_id;
        check(
          "第一次送出的內容逐欄等於寫死的值（2 星、690 點、base_rev 6）",
          first.length === 1 &&
            typeof rid === "string" &&
            sameJson(first[0].payload, {
              stage_id: "chapter1_1",
              result: "WIN",
              stars_earned: 2,
              kills: 9,
              time_seconds: 80,
              loots: [{ item: "battle_points", count: 690 }],
              request_id: rid,
              base_rev: 6,
              settle_contract: 2,
            }),
          first.map((e) => e.payload)
        );
        check(
          "後端其實已寫入（rev 7），暫存留著",
          readBack(E, "k_pend").rev === 7 &&
            (await pendingKeys(p)).length === 1,
          readBack(E, "k_pend")
        );
        await shot(p, `settle-pending-${vp.width}x${vp.height}`);
        // 重新整理：同一個分頁的暫存還在，不自動送
        await p.reload();
        check("重新整理後讀到存檔", (await loadShared(p)) === "player");
        await closeModal(p);
        check(
          "重新整理後說明待確認並有「重新確認」",
          await until(
            () => p.locator('[data-testid="settle-retry"]').isVisible(),
            10000
          )
        );
        await sleep(1500);
        check(
          "重新整理後沒有自動送出",
          E.gas.count("save_result") === 1,
          E.gas.count("save_result")
        );
        const nick = await (async () => {
          await openInfo(p);
          const dis = await isDisabled(
            p,
            '[data-testid="player-info-nick-edit"]'
          );
          await closeModal(p);
          return dis;
        })();
        check("待確認時不能改暱稱", nick === true, nick);
        // 用鍵盤按「重新確認」；送出中按鈕停用
        const hold = E.gas.rule("save_result", "hold");
        await p.focus('[data-testid="settle-retry"]');
        await p.keyboard.press("Enter");
        await until(() => hold.hits === 1, 10000);
        check(
          "送出中「重新確認」停用",
          (await isDisabled(p, '[data-testid="settle-retry"]')) === true
        );
        hold.release("ok");
        check(
          "重新確認後已保存",
          await until(
            () => p.locator('[data-testid="settle-confirmed"]').isVisible(),
            10000
          )
        );
        const all = E.gas.log.filter((e) => e.action === "save_result");
        check(
          "重新確認原樣再送：同一個 request_id、base_rev 6 與內容",
          all.length === 2 && sameJson(all[1].payload, first[0].payload),
          all.map((e) => e.payload)
        );
        check(
          "只加一次：rev 7、點數 1190、經驗 90、進度第二關，暫存已刪除",
          sameJson(readBack(E, "k_pend"), {
            rev: 7,
            data: {
              ...data,
              gold: 1190,
              exp: 90,
              level: 1,
              capacity: 11,
              max_stage: "chapter1_2",
            },
          }) && (await pendingKeys(p)).length === 0,
          readBack(E, "k_pend")
        );
        await shot(p, `settle-retried-${vp.width}x${vp.height}`);
        return E;
      }
    );
  }

  // ═══ 共用結算的修正追加：人工確認重新整理後仍不能重送；舊場次的回呼；讀回不合法；暫存讀不到 ═══
  await scenario("戰鬥結算：要人工確認時重新整理也不能重送", async (mk) => {
    const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
    const E = await mk({
      seed: [{ key: "k_rev", data, rev: 6 }],
      maps: MAPS,
      enemies: ENEMIES,
    });
    E.gas.rule("save_result", "reply", {
      fn: () => ({ status: 409, error: "RESULT_UNKNOWN" }),
    });
    const p = await E.page({ storage: { shenma_player_key: "k_rev" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    check("開戰", await startBattle(p));
    await endWith(p, {});
    check(
      "結算畫面：要人工確認、沒有「重新確認」",
      (await until(
        () => p.locator('[data-testid="result-settle-review"]').isVisible(),
        10000
      )) &&
        (await p.locator('[data-testid="result-settle-retry"]').count()) === 0
    );
    await p.reload();
    check("重新整理後讀到存檔", (await loadShared(p)) === "player");
    const nick = await isDisabled(p, '[data-testid="player-info-nick-edit"]');
    await closeModal(p);
    await sleep(1500);
    check(
      "重新整理後沒有「重新確認」、不能改暱稱、說明要人工確認",
      (await p.locator('[data-testid="settle-retry"]').count()) === 0 &&
        nick === true &&
        /人工確認/.test(
          (await text(p, '[data-testid="shared-account-notice"]')) || ""
        ),
      { nick }
    );
    check(
      "只有一次 save_result、暫存留著、雲端沒有變",
      E.gas.count("save_result") === 1 &&
        (await pendingKeys(p)).length === 1 &&
        sameJson(readBack(E, "k_rev"), { rev: 6, data }),
      E.gas.count("save_result")
    );
    return E;
  });
  await scenario("戰鬥結算：舊場次的結束回呼不動這一場", async (mk) => {
    const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
    const E = await mk({
      seed: [{ key: "k_old", data, rev: 6 }],
      maps: MAPS,
      enemies: ENEMIES,
    });
    const p = await E.page({ storage: { shenma_player_key: "k_old" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    check("開戰", await startBattle(p));
    // 受控回呼：用另一個 battle_id 結束一次（像舊場次晚到），再把這一場恢復成戰鬥中
    const cur = await p.evaluate(() => {
      const b = window.__testBridge.engine.battleManager;
      const id = b.battleId;
      b.battleId = "battle_old_late";
      b.endBattle(true);
      b.battleId = id;
      b.gameState = 2;
      return id;
    });
    await sleep(1000);
    check(
      "舊場次的回呼：沒有結算畫面、沒有 save_result",
      (await p.locator('[data-testid="result-overlay"]').count()) === 0 &&
        E.gas.count("save_result") === 0
    );
    await endWith(p, {});
    check(
      "這一場的結果：已保存、只送一次、battle_id 是這一場",
      (await until(
        () => p.locator('[data-testid="result-settle-confirmed"]').isVisible(),
        10000
      )) && E.gas.count("save_result") === 1,
      { cur, n: E.gas.count("save_result") }
    );
    return E;
  });
  await scenario("戰鬥結算：讀回的存檔不合法時不報已保存", async (mk) => {
    const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
    const E = await mk({
      seed: [{ key: "k_bad", data, rev: 6 }],
      maps: MAPS,
      enemies: ENEMIES,
    });
    const p = await E.page({ storage: { shenma_player_key: "k_bad" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    check("開戰", await startBattle(p));
    // 後端接受後的讀回：data 是 null
    E.gas.rule("get_profile", "transform", {
      fn: (res) => ({ ...res, data: null }),
    });
    await endWith(p, {});
    check(
      "結算畫面：待確認（有「重新確認」），不是已保存",
      (await until(
        () => p.locator('[data-testid="result-settle-retry"]').isVisible(),
        10000
      )) &&
        (await p.locator('[data-testid="result-settle-confirmed"]').count()) ===
          0
    );
    check(
      "後端已寫入（rev 7）、暫存留著",
      readBack(E, "k_bad").rev === 7 && (await pendingKeys(p)).length === 1
    );
    return E;
  });
  await scenario("戰鬥結算：暫存讀不到時不能寫入", async (mk) => {
    const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
    const E = await mk({
      seed: [{ key: "k_ss", data, rev: 6 }],
      maps: MAPS,
      enemies: ENEMIES,
    });
    E.gas.rule("save_result", "lost");
    E.allowGasErrors = 1;
    const p = await E.page({ storage: { shenma_player_key: "k_ss" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    check("開戰", await startBattle(p));
    await endWith(p, {});
    check(
      "結果不明：待確認",
      await until(
        () => p.locator('[data-testid="result-settle-retry"]').isVisible(),
        10000
      )
    );
    // 重新整理後 sessionStorage 讀取一律丟 SecurityError（模擬瀏覽器不讓讀）
    await p.addInitScript(() => {
      const orig = Storage.prototype.getItem;
      Storage.prototype.getItem = function (k) {
        if (this === window.sessionStorage)
          throw new DOMException("blocked", "SecurityError");
        return orig.call(this, k);
      };
    });
    await p.reload();
    check("重新整理後讀到存檔", (await loadShared(p)) === "player");
    const nick = await isDisabled(p, '[data-testid="player-info-nick-edit"]');
    await closeModal(p);
    await sleep(1000);
    check(
      "暫存讀不到：不能改暱稱、沒有「重新確認」、說明暫存讀不到",
      nick === true &&
        (await p.locator('[data-testid="settle-retry"]').count()) === 0 &&
        /暫存讀不到/.test(
          (await text(p, '[data-testid="shared-account-notice"]')) || ""
        ),
      { nick }
    );
    check(
      "沒有其他寫入（只有那一次 save_result）",
      E.gas.writes().length === 1,
      E.gas.writes().map((e) => e.action)
    );
    return E;
  });

  // ═══ 共用結算的第二次修正追加：送出中的標記寫不進去；人工確認的標記寫不進去；登入後標記才讀不到 ═══
  const REVIEW_PREFIX = "shenma_js_settle_review_";
  const reviewEntries = async (p) =>
    Object.entries((await storageOf(p)).ss).filter(([k]) =>
      k.startsWith(REVIEW_PREFIX)
    );
  /** 這個分頁寫入人工確認的標記時丟 QuotaExceededError（onlyTerminal：送出中的標記仍寫得進去）；重新整理後也一樣 */
  async function failMarkerWrites(p, onlyTerminal) {
    const fn = (only) => {
      const orig = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (
          this === window.sessionStorage &&
          String(k).startsWith("shenma_js_settle_review_") &&
          (!only || !String(v).includes('"SENDING"'))
        )
          throw new DOMException("quota", "QuotaExceededError");
        return orig.call(this, k, v);
      };
    };
    await p.addInitScript(fn, onlyTerminal);
    await p.evaluate(fn, onlyTerminal);
  }
  await scenario("戰鬥結算：送出中的標記寫不進去時不送出", async (mk) => {
    const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
    const E = await mk({
      seed: [{ key: "k_mq", data, rev: 6 }],
      maps: MAPS,
      enemies: ENEMIES,
    });
    E.gas.rule("save_result", "reply", {
      fn: () => ({ status: 409, error: "RESULT_UNKNOWN" }),
    });
    const p = await E.page({ storage: { shenma_player_key: "k_mq" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    await failMarkerWrites(p, false);
    check("開戰", await startBattle(p));
    await endWith(p, {});
    check(
      "結算畫面：這場沒有寫入（不能暫存）、沒有「重新確認」",
      (await until(
        () => p.locator('[data-testid="result-not-saved"]').isVisible(),
        10000
      )) &&
        /不能暫存/.test(
          (await text(p, '[data-testid="result-not-saved"]')) || ""
        ) &&
        (await p.locator('[data-testid="result-settle-retry"]').count()) === 0
    );
    check(
      "零 save_result、沒有留下暫存或標記",
      E.gas.count("save_result") === 0 &&
        (await pendingKeys(p)).length === 0 &&
        (await reviewEntries(p)).length === 0,
      E.gas.count("save_result")
    );
    await p.reload();
    check("重新整理後讀到存檔", (await loadShared(p)) === "player");
    const nick = await isDisabled(p, '[data-testid="player-info-nick-edit"]');
    await closeModal(p);
    await sleep(1000);
    check(
      "重新整理後沒有「重新確認」、可以改暱稱、仍是零 save_result",
      (await p.locator('[data-testid="settle-retry"]').count()) === 0 &&
        nick === false &&
        E.gas.count("save_result") === 0,
      { nick, n: E.gas.count("save_result") }
    );
    return E;
  });
  await scenario(
    "戰鬥結算：人工確認的標記寫不進去時重新整理也不能重送",
    async (mk) => {
      const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
      const E = await mk({
        seed: [{ key: "k_mr", data, rev: 6 }],
        maps: MAPS,
        enemies: ENEMIES,
      });
      E.gas.rule("save_result", "reply", {
        fn: () => ({ status: 409, error: "RESULT_UNKNOWN" }),
      });
      const p = await E.page({ storage: { shenma_player_key: "k_mr" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      await failMarkerWrites(p, true);
      check("開戰", await startBattle(p));
      await endWith(p, {});
      check(
        "結算畫面：要人工確認、沒有「重新確認」",
        (await until(
          () => p.locator('[data-testid="result-settle-review"]').isVisible(),
          10000
        )) &&
          (await p.locator('[data-testid="result-settle-retry"]').count()) === 0
      );
      const marks = await reviewEntries(p);
      check(
        "人工確認的標記沒有寫入，送出中的標記與暫存還在",
        marks.length === 1 &&
          /"SENDING"/.test(marks[0][1]) &&
          (await pendingKeys(p)).length === 1,
        marks
      );
      await p.reload();
      check("重新整理後讀到存檔", (await loadShared(p)) === "player");
      const nick = await isDisabled(p, '[data-testid="player-info-nick-edit"]');
      await closeModal(p);
      await sleep(1500);
      check(
        "重新整理後沒有「重新確認」、不能改暱稱、說明要人工確認",
        (await p.locator('[data-testid="settle-retry"]').count()) === 0 &&
          nick === true &&
          /人工確認/.test(
            (await text(p, '[data-testid="shared-account-notice"]')) || ""
          ),
        { nick }
      );
      check(
        "只有一次 save_result、雲端沒有變",
        E.gas.count("save_result") === 1 &&
          sameJson(readBack(E, "k_mr"), { rev: 6, data }),
        E.gas.count("save_result")
      );
      return E;
    }
  );
  await scenario("戰鬥結算：登入後標記才讀不到時不能寫入", async (mk) => {
    const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
    const E = await mk({
      seed: [{ key: "k_late", data, rev: 6 }],
      maps: MAPS,
      enemies: ENEMIES,
    });
    const p = await E.page({ storage: { shenma_player_key: "k_late" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    // 登入時讀得到；之後人工確認標記的讀取丟 SecurityError（暫存本身仍讀得到）
    const breakMarks = () =>
      p.evaluate(() => {
        if (!window.__origGetItem)
          window.__origGetItem = Storage.prototype.getItem;
        Storage.prototype.getItem = function (k) {
          if (
            this === window.sessionStorage &&
            String(k).startsWith("shenma_js_settle_review_")
          )
            throw new DOMException("blocked", "SecurityError");
          return window.__origGetItem.call(this, k);
        };
      });
    const restoreMarks = () =>
      p.evaluate(() => {
        Storage.prototype.getItem = window.__origGetItem;
      });
    await breakMarks();
    const fb = await saveNickname(p, "改名");
    check(
      "改暱稱：不送出、說明暫存讀不到",
      /暫存讀不到/.test(fb || "") && E.gas.count("save_profile") === 0,
      fb
    );
    await restoreMarks();
    // 畫面上的按鈕依目前的待確認狀態停用：按「手動同步」重新讀暫存後才恢復
    await p.locator('[data-testid="player-info-sync-btn"]').click();
    check(
      "恢復可讀後手動同步：可以改暱稱",
      await until(
        async () =>
          (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) ===
          false,
        10000
      )
    );
    const fb2 = await saveNickname(p, "恢復");
    check(
      "恢復可讀、沒有暫存：正常保存暱稱",
      E.gas.count("save_profile") === 1 &&
        readBack(E, "k_late").data.nickname === "恢復",
      fb2
    );
    await breakMarks();
    await closeModal(p);
    await waitRemoteStage(p, E);
    check("開戰", await startBattle(p));
    check(
      "出征說明：這場不會寫入共用進度（不能暫存）",
      await until(
        async () =>
          /不會寫入共用進度.*不能暫存/.test(
            (await text(p, '[data-testid="sortie-settle-note"]')) || ""
          ),
        5000
      )
    );
    await endWith(p, {});
    check(
      "結算畫面：這場沒有寫入、零 save_result",
      (await until(
        () => p.locator('[data-testid="result-not-saved"]').isVisible(),
        10000
      )) && E.gas.count("save_result") === 0,
      E.gas.count("save_result")
    );
    await restoreMarks();
    return E;
  });

  // ═══ 待確認結算顯示它自己的關卡（只用暫存記下的關卡 ID；後端設定就緒才顯示名稱；只是資訊） ═══
  // 關卡名稱用正式後端 get_all_maps 的名稱（chapter1_1 黃巾起義、chapter1_2 桃園結義、chapter1_3 討伐黃巾）
  const FMAPS = [
    { ...MAP("chapter1_1", 1), name: "黃巾起義" },
    { ...MAP("chapter1_2", 2), name: "桃園結義" },
    { ...MAP("chapter1_3", 3), name: "討伐黃巾" },
  ];
  const stageLabel = (p) => text(p, '[data-testid="settle-stage"]');
  /** 說明那一行裡沒有可以操作的東西 */
  const labelInert = async (p) =>
    (await p
      .locator(
        '[data-testid="settle-stage"] button, [data-testid="settle-stage"] a, [data-testid="settle-stage"] input'
      )
      .count()) === 0;
  /** 第一場結果不明（寫入了但回應遺失）→ 待確認，重新整理後讀到存檔、關掉主公資訊 */
  async function pendingThenReload(p, E) {
    await waitRemoteStage(p, E);
    const started = await startBattle(p);
    await endWith(p, {});
    const pending = await until(
      () => p.locator('[data-testid="result-settle-retry"]').isVisible(),
      10000
    );
    await p.reload();
    const loaded = (await loadShared(p)) === "player";
    await closeModal(p);
    return started && pending && loaded;
  }
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 390, height: 600 },
    { width: 390, height: 844 },
  ]) {
    await scenario(
      `待確認結算的關卡：切到別關仍顯示原本那一關 ${vp.width}×${vp.height}`,
      async (mk) => {
        const data = NEW({
          team: [{ hero_id: "guan_yu", slot: 1 }],
          max_stage: "chapter1_2",
        });
        const E = await mk({
          seed: [{ key: "k_lb", data, rev: 6 }],
          maps: FMAPS,
          enemies: ENEMIES,
          viewport: vp,
        });
        E.gas.rule("save_result", "lost");
        E.allowGasErrors = 1;
        const p = await E.page({ storage: { shenma_player_key: "k_lb" } });
        check("讀到存檔", (await loadShared(p)) === "player");
        await closeModal(p);
        check(
          "第一關的結果不明、重新整理後讀到存檔",
          await pendingThenReload(p, E)
        );
        check(
          "說明顯示待確認的是第一關：黃巾起義（chapter1_1）",
          await until(
            async () =>
              (await stageLabel(p)) === "待確認的結算：黃巾起義（chapter1_1）",
            15000
          ),
          await stageLabel(p)
        );
        // 切到第二關（目前選的關卡和待確認的那一關不同）
        await p.locator('button[title="切換關卡"]').click();
        await modal(p)
          .locator(".card", { hasText: "桃園結義" })
          .locator("button", { hasText: "點擊切換" })
          .click();
        await until(
          async () => (await p.locator(".modal").count()) === 0,
          5000
        );
        check(
          "目前的關卡是第二關（桃園結義）",
          await until(
            async () => (await text(p, '[class*="hudMapName"]')) === "桃園結義",
            5000
          ),
          await text(p, '[class*="hudMapName"]')
        );
        check(
          "說明仍是原本的第一關、只是文字（沒有按鈕或連結），「重新確認」還在原本的位置",
          (await stageLabel(p)) === "待確認的結算：黃巾起義（chapter1_1）" &&
            (await labelInert(p)) &&
            (await p.locator('[data-testid="settle-retry"]').count()) === 1,
          await stageLabel(p)
        );
        check(
          "只有那一次 save_result",
          E.gas.count("save_result") === 1,
          E.gas.count("save_result")
        );
        await shot(p, `settle-stage-${vp.width}x${vp.height}`);
        return E;
      }
    );
  }
  await scenario(
    "待確認結算的關卡：要人工確認時只顯示資訊、不能重送",
    async (mk) => {
      const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
      // 後端的關卡名稱（測試第1關）和正式、內建的都不同：顯示的是讀到的這份設定
      const E = await mk({
        seed: [{ key: "k_lr", data, rev: 6 }],
        maps: MAPS,
        enemies: ENEMIES,
      });
      E.gas.rule("save_result", "reply", {
        fn: () => ({ status: 409, error: "RESULT_UNKNOWN" }),
      });
      const p = await E.page({ storage: { shenma_player_key: "k_lr" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      check("開戰", await startBattle(p));
      await endWith(p, {});
      check(
        "結算畫面：要人工確認",
        await until(
          () => p.locator('[data-testid="result-settle-review"]').isVisible(),
          10000
        )
      );
      await p.reload();
      check("重新整理後讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      check(
        "說明：要人工確認的是測試第1關（chapter1_1）",
        await until(
          async () =>
            (await stageLabel(p)) ===
            "要人工確認的結算：測試第1關（chapter1_1）",
          15000
        ),
        await stageLabel(p)
      );
      check(
        "只是資訊：沒有「重新確認」、說明裡沒有按鈕或連結、只有一次 save_result",
        (await p.locator('[data-testid="settle-retry"]').count()) === 0 &&
          (await p.locator('[data-testid="result-settle-retry"]').count()) ===
            0 &&
          (await labelInert(p)) &&
          E.gas.count("save_result") === 1,
        E.gas.count("save_result")
      );
      return E;
    }
  );
  await scenario(
    "待確認結算的關卡：關卡設定讀不到時不猜名稱，讀到後才顯示",
    async (mk) => {
      const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
      const E = await mk({
        seed: [{ key: "k_lf", data, rev: 6 }],
        maps: FMAPS,
        enemies: ENEMIES,
      });
      E.gas.rule("save_result", "lost");
      E.allowGasErrors = 2;
      const p = await E.page({ storage: { shenma_player_key: "k_lf" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      check("開戰", await startBattle(p));
      await endWith(p, {});
      check(
        "結果不明：待確認",
        await until(
          () => p.locator('[data-testid="result-settle-retry"]').isVisible(),
          10000
        )
      );
      // 下一次讀關卡設定失敗，而且沒有本機快取：頁面用內建的代用資料
      await p.evaluate(() => {
        localStorage.removeItem("shenma_static_config");
        localStorage.removeItem("shenma_static_ts");
      });
      E.gas.rule("get_all_maps", "http500");
      const before = E.gas.count("get_all_maps");
      await p.reload();
      check("重新整理後讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await until(() => E.gas.count("get_all_maps") > before, 10000);
      await sleep(1500);
      const fallback = await stageLabel(p);
      check(
        "設定讀不到：只顯示 ID、名稱未確認，不拿內建名稱（涿郡初陣）或正式名稱猜",
        fallback === "待確認的結算：chapter1_1（關卡名稱未確認）" &&
          !/涿郡|黃巾/.test(fallback || ""),
        fallback
      );
      // 再重新整理：這次讀到後端的關卡設定
      await p.reload();
      check("再次重新整理後讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      check(
        "設定讀到後顯示名稱：黃巾起義（chapter1_1）",
        await until(
          async () =>
            (await stageLabel(p)) === "待確認的結算：黃巾起義（chapter1_1）",
          15000
        ),
        await stageLabel(p)
      );
      return E;
    }
  );
  await scenario("待確認結算的關卡：暫存讀不到時不說是哪一關", async (mk) => {
    const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
    const E = await mk({
      seed: [{ key: "k_lu", data, rev: 6 }],
      maps: FMAPS,
      enemies: ENEMIES,
    });
    E.gas.rule("save_result", "lost");
    E.allowGasErrors = 1;
    const p = await E.page({ storage: { shenma_player_key: "k_lu" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    check("開戰", await startBattle(p));
    await endWith(p, {});
    check(
      "結果不明：待確認",
      await until(
        () => p.locator('[data-testid="result-settle-retry"]').isVisible(),
        10000
      )
    );
    // 重新整理後 sessionStorage 讀取一律丟 SecurityError
    await p.addInitScript(() => {
      const orig = Storage.prototype.getItem;
      Storage.prototype.getItem = function (k) {
        if (this === window.sessionStorage)
          throw new DOMException("blocked", "SecurityError");
        return orig.call(this, k);
      };
    });
    await p.reload();
    check("重新整理後讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    check(
      "說明：暫存讀不到、無法確認是哪一關（不顯示關卡 ID 或名稱）",
      await until(
        async () =>
          (await stageLabel(p)) === "這個分頁的暫存讀不到，無法確認是哪一關。",
        10000
      ),
      await stageLabel(p)
    );
    return E;
  });
  await scenario(
    "待確認結算的關卡：換帳號不留下原帳號的關卡，訪客不顯示",
    async (mk) => {
      const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
      const E = await mk({
        seed: [
          { key: "k_la", data, rev: 6 },
          { key: "k_lz", data: NEW({ nickname: "乙" }), rev: 2 },
        ],
        maps: FMAPS,
        enemies: ENEMIES,
      });
      E.gas.rule("save_result", "lost");
      E.allowGasErrors = 1;
      const p = await E.page({ storage: { shenma_player_key: "k_la" } });
      check("讀到甲", (await loadShared(p)) === "player");
      await closeModal(p);
      check("甲的結果不明、重新整理後讀到存檔", await pendingThenReload(p, E));
      check(
        "甲：說明待確認的是黃巾起義（chapter1_1）",
        await until(
          async () =>
            (await stageLabel(p)) === "待確認的結算：黃巾起義（chapter1_1）",
          15000
        ),
        await stageLabel(p)
      );
      await openInfo(p);
      await p.locator("button", { hasText: "切換金鑰" }).click();
      await modal(p).locator('input[placeholder^="例"]').fill("k_lz");
      await modal(p).locator("button", { hasText: "確認切換" }).click();
      check(
        "切換到乙",
        await until(
          async () =>
            (await text(p, '[data-testid="player-info-nickname"]')) === "乙",
          10000
        )
      );
      await sleep(1000);
      check(
        "乙：說明區還在（乙還沒有隊伍），但沒有待確認結算的關卡說明",
        (await p.locator('[data-testid="shared-account-notice"]').count()) ===
          1 && (await p.locator('[data-testid="settle-stage"]').count()) === 0,
        await stageLabel(p)
      );
      // 登出後改用訪客
      await p.locator("button", { hasText: "登出" }).first().click();
      await p.locator("button", { hasText: "確認登出" }).click();
      await until(
        () => p.locator('[data-testid="key-setup-guest"]').isVisible(),
        10000
      );
      await p.locator('[data-testid="key-setup-guest"]').click();
      await sleep(1500);
      check(
        "訪客：沒有待確認結算的關卡說明",
        (await p.locator('[data-testid="settle-stage"]').count()) === 0,
        await stageLabel(p)
      );
      check(
        "只有甲的那一次 save_result",
        E.gas.count("save_result") === 1,
        E.gas.count("save_result")
      );
      return E;
    }
  );

  // ═══ 關卡名稱的來源：空的設定回應與舊快取都不算確認 ═══
  /** 清掉頁面的關卡設定快取 */
  const clearStageCache = (p) =>
    p.evaluate(() => {
      localStorage.removeItem("shenma_static_config");
      localStorage.removeItem("shenma_static_ts");
    });
  await scenario(
    "待確認結算的關卡：關卡設定回空清單時，重新整理後也不猜內建名稱",
    async (mk) => {
      const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
      const E = await mk({
        seed: [{ key: "k_le", data, rev: 6 }],
        maps: FMAPS,
        enemies: ENEMIES,
      });
      E.gas.rule("save_result", "lost");
      E.allowGasErrors = 1;
      const p = await E.page({ storage: { shenma_player_key: "k_le" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      check("開戰", await startBattle(p));
      await endWith(p, {});
      check(
        "結果不明：待確認",
        await until(
          () => p.locator('[data-testid="result-settle-retry"]').isVisible(),
          10000
        )
      );
      // 下一次的關卡設定：HTTP 200、內容是空清單（頁面退回內建資料，並把它存成快取）
      await clearStageCache(p);
      E.gas.rule("get_all_maps", "reply", {
        fn: () => ({ status: 200, maps: [] }),
      });
      const before = E.gas.count("get_all_maps");
      await p.reload();
      check("重新整理後讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await until(() => E.gas.count("get_all_maps") > before, 10000);
      await sleep(1500);
      const first = await stageLabel(p);
      check(
        "空清單：只顯示 ID、名稱未確認",
        first === "待確認的結算：chapter1_1（關卡名稱未確認）",
        first
      );
      // 真正重新整理：這次讀的是剛才存下的內建資料快取
      const cached = await p.evaluate(() => {
        const c = JSON.parse(
          localStorage.getItem("shenma_static_config") || "null"
        );
        return c
          ? { first: c.maps && c.maps[0] && c.maps[0].name, src: c.mapsSource }
          : null;
      });
      await p.reload();
      check("再次重新整理後讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await sleep(1500);
      const second = await stageLabel(p);
      check(
        "空清單的快取重新載入後：仍只顯示 ID、名稱未確認，不猜內建名稱（涿郡初陣）",
        second === "待確認的結算：chapter1_1（關卡名稱未確認）" &&
          !/涿郡/.test(second || ""),
        { second, cached }
      );
      return E;
    }
  );
  await scenario(
    "待確認結算的關卡：沒有來源資料的舊快取只顯示 ID，正常讀到設定後才有名稱",
    async (mk) => {
      const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
      const E = await mk({
        seed: [{ key: "k_lo", data, rev: 6 }],
        maps: FMAPS,
        enemies: ENEMIES,
      });
      E.gas.rule("save_result", "lost");
      E.allowGasErrors = 1;
      const p = await E.page({ storage: { shenma_player_key: "k_lo" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      check("結果不明、重新整理後讀到存檔", await pendingThenReload(p, E));
      check(
        "正常讀到設定：說明顯示黃巾起義（chapter1_1）",
        await until(
          async () =>
            (await stageLabel(p)) === "待確認的結算：黃巾起義（chapter1_1）",
          15000
        ),
        await stageLabel(p)
      );
      // 把快取改成舊格式（maps 一樣是正式名稱，但沒有來源資料），而且是新鮮的
      const hadSource = await p.evaluate(() => {
        const c = JSON.parse(localStorage.getItem("shenma_static_config"));
        const had = !!c.mapsSource;
        delete c.mapsSource;
        localStorage.setItem("shenma_static_config", JSON.stringify(c));
        localStorage.setItem("shenma_static_ts", String(Date.now()));
        return had;
      });
      const before = E.gas.count("get_all_maps");
      await p.reload();
      check("重新整理後讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await sleep(1500);
      const old = await stageLabel(p);
      check(
        "舊快取（原本有來源資料、拿掉後）：沿用快取不讀後端，說明只顯示 ID、名稱未確認",
        hadSource &&
          E.gas.count("get_all_maps") === before &&
          old === "待確認的結算：chapter1_1（關卡名稱未確認）",
        { hadSource, old, calls: E.gas.count("get_all_maps") - before }
      );
      // 清掉快取再重新整理：正常讀到正式設定後才有名稱
      await clearStageCache(p);
      await p.reload();
      check("再次重新整理後讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      check(
        "正常讀到設定後：說明顯示黃巾起義（chapter1_1）",
        await until(
          async () =>
            (await stageLabel(p)) === "待確認的結算：黃巾起義（chapter1_1）",
          15000
        ),
        await stageLabel(p)
      );
      return E;
    }
  );

  // ═══ 19. 伺服器錯誤 SERVER_ERROR：可能在寫入之後才發生，一律當結果不明（提交前／提交後兩種控制組） ═══
  const SERVER_ERROR = () => ({
    status: 500,
    error: "SERVER_ERROR",
    message: "simulated",
  });
  for (const [label, kind] of [
    ["提交後", "transform"],
    ["提交前", "reply"],
  ]) {
    await scenario(`保存回 SERVER_ERROR（${label}）`, async (mk) => {
      const E = await mk({
        seed: [{ key: "k_se", data: NEW({ nickname: "原名" }), rev: 1 }],
      });
      const p = await E.page({ storage: { shenma_player_key: "k_se" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      E.gas.rule("save_profile", kind, { fn: SERVER_ERROR });
      const fb = await saveNickname(p, "改名");
      check(
        "說明結果待確認（不是「沒有保存」）",
        /待確認/.test(fb || "") && !/沒有保存/.test(fb || ""),
        fb
      );
      check(
        "同步狀態是待確認",
        (await p
          .locator('[data-testid="player-info-sync"]')
          .getAttribute("data-sync")) === "unknown"
      );
      check(
        "手動同步前不能再寫入（改暱稱停用）",
        (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) === true
      );
      await sleep(1500);
      check(
        "沒有重送：save_profile 只有一次",
        E.gas.count("save_profile") === 1
      );
      const committed = kind === "transform";
      check(
        `雲端${committed ? "其實已經寫入（rev 2）" : "沒有寫入（rev 1）"}`,
        committed
          ? E.fx.read("k_se").rev === 2 &&
              E.fx.read("k_se").data.nickname === "改名"
          : E.fx.read("k_se").rev === 1
      );
      await p.locator('[data-testid="player-info-sync-btn"]').click();
      check(
        "手動同步讀到雲端的實際結果後恢復可寫",
        await until(
          async () =>
            (await text(p, '[data-testid="player-info-nickname"]')) ===
              (committed ? "改名" : "原名") &&
            (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) ===
              false,
          10000
        )
      );
      check(
        "確認後可以正常保存（帶新的版本）",
        /已保存/.test((await saveNickname(p, "再改")) || "") &&
          E.gas.log.filter((e) => e.action === "save_profile").at(-1).payload
            .base_rev === (committed ? 2 : 1)
      );
      await closeModal(p);
      return E;
    });
  }
  await scenario("升級回 SERVER_ERROR（提交後）", async (mk) => {
    const data = NEW({
      gold: 1000,
      heroes: [
        { hero_id: "guan_yu", level: 1, star: 0, atk: 140, def: 70, hp: 1450 },
      ],
    });
    const E = await mk({ seed: [{ key: "k_seu", data, rev: 3 }] });
    const p = await E.page({ storage: { shenma_player_key: "k_seu" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await openRoster(p);
    await modal(p)
      .locator('div[style*="380px"] strong', { hasText: "關羽" })
      .first()
      .click();
    E.gas.rule("upgrade_hero", "transform", { fn: SERVER_ERROR });
    await p.locator('[data-testid="hero-upgrade"]').click();
    check(
      "說明結果待確認",
      await until(
        async () => /待確認/.test((await modal(p).innerText()) || ""),
        10000
      )
    );
    check(
      "升級按鈕停用",
      await until(
        async () =>
          (await isDisabled(p, '[data-testid="hero-upgrade"]')) === true,
        5000
      )
    );
    await sleep(1500);
    check("沒有重送：upgrade_hero 只有一次", E.gas.count("upgrade_hero") === 1);
    check("雲端其實已經升級（Lv.2、rev 4）", E.fx.read("k_seu").rev === 4);
    await closeModal(p);
    await openInfo(p);
    await p.locator('[data-testid="player-info-sync-btn"]').click();
    check(
      "手動同步後恢復可寫",
      await until(
        async () =>
          (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) ===
          false,
        10000
      )
    );
    await closeModal(p);
    await openRoster(p);
    check(
      "畫面是伺服器的結果（關羽 Lv.2）",
      /Lv\.2/.test((await rosterCard(p, "關羽")) || "")
    );
    await closeModal(p);
    return E;
  });
  await scenario("建立回 SERVER_ERROR（提交後／提交前）", async (mk) => {
    const E = await mk({ seed: [] });
    const p = await E.page();
    await waitLoaded(p);
    const tryCreate = async (key) => {
      await p.locator('[data-testid="key-setup-input"]').fill(key);
      await p.locator('[data-testid="key-setup-login"]').click();
      await until(
        async () =>
          (
            (await text(p, '[data-testid="key-setup-create-confirm"]')) || ""
          ).includes(key),
        10000
      );
    };
    await tryCreate("k_sec_no");
    E.gas.rule("create_profile", "reply", {
      key: "k_sec_no",
      fn: SERVER_ERROR,
    });
    await p.locator('[data-testid="key-setup-create-confirm"]').click();
    const err = await until(async () => {
      const t = (await text(p, '[data-testid="key-setup-error"]')) || "";
      return /不會自動重送/.test(t) ? t : null;
    }, 15000);
    check("提交前：唯讀查一次找不到，說明結果不明、不自動重送", !!err, err);
    await sleep(1500);
    check(
      "提交前：create_profile 只有一次、沒有建立、金鑰沒記住",
      E.gas.count("create_profile", "k_sec_no") === 1 &&
        !E.fx.read("k_sec_no") &&
        (await storageOf(p)).ls.shenma_player_key === undefined
    );
    await tryCreate("k_sec_yes");
    E.gas.rule("create_profile", "transform", {
      key: "k_sec_yes",
      fn: SERVER_ERROR,
    });
    await p.locator('[data-testid="key-setup-create-confirm"]').click();
    check(
      "提交後：唯讀查一次就讀到存檔、登入",
      await until(
        async () =>
          (await p.locator('[data-testid="key-setup"]').count()) === 0,
        15000
      )
    );
    check(
      "提交後：create_profile 只有一次、金鑰是這把",
      E.gas.count("create_profile", "k_sec_yes") === 1 &&
        (await storageOf(p)).ls.shenma_player_key === "k_sec_yes"
    );
    return E;
  });

  // ═══ 20. 保存的回應沒有版本、409 沒附資料：讀回確認後才算數；讀回失敗就待確認 ═══
  for (const readOk of [true, false]) {
    await scenario(
      `保存成功但回應沒有版本（讀回${readOk ? "成功" : "失敗"}）`,
      async (mk) => {
        const E = await mk({
          seed: [{ key: "k_nr", data: NEW({ nickname: "原名" }), rev: 1 }],
        });
        const p = await E.page({ storage: { shenma_player_key: "k_nr" } });
        check("讀到存檔", (await loadShared(p)) === "player");
        E.gas.rule("save_profile", "transform", {
          fn: (r) => ({ status: r.status, success: true }),
        });
        if (!readOk) {
          E.gas.rule("get_profile", "abort", { times: 3 });
          E.allowGasErrors = 3;
        }
        const fb = await saveNickname(p, "新名");
        if (readOk) {
          check("讀回確認後才說已保存", /已保存/.test(fb || ""), fb);
          check(
            "畫面是讀回的資料、可以繼續寫",
            (await text(p, '[data-testid="player-info-nickname"]')) ===
              "新名" &&
              (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) ===
                false
          );
        } else {
          check(
            "讀回失敗：不說已保存，說明待確認",
            /待確認/.test(fb || "") && !/已保存/.test(fb || ""),
            fb
          );
          check(
            "讀回失敗：不能再寫入",
            (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) ===
              true
          );
          await sleep(1500);
          check(
            "讀回失敗：save_profile 沒有重送",
            E.gas.count("save_profile") === 1
          );
          await p.locator('[data-testid="player-info-sync-btn"]').click();
          check(
            "手動同步成功後恢復可寫、看到雲端的資料",
            await until(
              async () =>
                (await isDisabled(
                  p,
                  '[data-testid="player-info-nick-edit"]'
                )) === false &&
                (await text(p, '[data-testid="player-info-nickname"]')) ===
                  "新名",
              10000
            )
          );
        }
        await closeModal(p);
        return E;
      }
    );
  }
  for (const readOk of [true, false]) {
    await scenario(
      `版本衝突但回應沒附資料（讀回${readOk ? "成功" : "失敗"}）`,
      async (mk) => {
        const E = await mk({
          seed: [{ key: "k_cf", data: NEW({ nickname: "原名" }), rev: 1 }],
        });
        const p = await E.page({ storage: { shenma_player_key: "k_cf" } });
        check("讀到存檔", (await loadShared(p)) === "player");
        E.fx.handle({
          action: "save_profile",
          key: "k_cf",
          payload: { data: NEW({ nickname: "別處改" }), base_rev: 1 },
        });
        E.gas.rule("save_profile", "transform", {
          fn: (r) => ({ status: r.status, error: r.error }),
        });
        if (!readOk) {
          E.gas.rule("get_profile", "abort", { times: 3 });
          E.allowGasErrors = 3;
        }
        const fb = await saveNickname(p, "我改");
        check(
          "說明有較新的存檔、剛才沒有保存",
          /較新的存檔/.test(fb || ""),
          fb
        );
        await sleep(1500);
        check(
          "沒有重送：save_profile 只有一次",
          E.gas.count("save_profile") === 1
        );
        check(
          "雲端仍是別處的保存（rev 2）",
          E.fx.read("k_cf").rev === 2 &&
            E.fx.read("k_cf").data.nickname === "別處改"
        );
        if (readOk) {
          check(
            "讀回成功：改用雲端的資料、可以繼續寫",
            (await text(p, '[data-testid="player-info-nickname"]')) ===
              "別處改" &&
              (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) ===
                false
          );
          check(
            "之後用雲端的版本可以保存",
            /已保存/.test((await saveNickname(p, "再改")) || "") &&
              E.fx.read("k_cf").rev === 3
          );
        } else {
          check(
            "讀回失敗：不說已改用雲端資料、說明讀回失敗",
            /讀回雲端的資料失敗/.test(
              (await text(p, '[data-testid="player-info-notice"]')) || ""
            ),
            await text(p, '[data-testid="player-info-notice"]')
          );
          check(
            "讀回失敗：不能再寫入",
            (await isDisabled(p, '[data-testid="player-info-nick-edit"]')) ===
              true
          );
          await p.locator('[data-testid="player-info-sync-btn"]').click();
          check(
            "手動同步後恢復可寫、看到雲端的資料",
            await until(
              async () =>
                (await isDisabled(
                  p,
                  '[data-testid="player-info-nick-edit"]'
                )) === false &&
                (await text(p, '[data-testid="player-info-nickname"]')) ===
                  "別處改",
              10000
            )
          );
        }
        await closeModal(p);
        return E;
      }
    );
  }
  await scenario("甲的衝突讀回遲到、乙正在保存", async (mk) => {
    const E = await mk({
      seed: [
        { key: "k_ia", data: NEW({ nickname: "甲" }), rev: 1 },
        { key: "k_ib", data: NEW({ nickname: "乙" }), rev: 4 },
      ],
    });
    const p = await E.page({ storage: { shenma_player_key: "k_ia" } });
    check("讀到甲", (await loadShared(p)) === "player");
    E.fx.handle({
      action: "save_profile",
      key: "k_ia",
      payload: { data: NEW({ nickname: "甲別處" }), base_rev: 1 },
    });
    E.gas.rule("save_profile", "transform", {
      key: "k_ia",
      fn: (r) => ({ status: r.status, error: r.error }),
    });
    const holdA = E.gas.rule("get_profile", "hold", { key: "k_ia" });
    await p.locator('[data-testid="player-info-nick-edit"]').click();
    await modal(p).locator("form input.form-control").first().fill("甲改");
    await p.locator('[data-testid="player-info-nick-save"]').click();
    check(
      "甲遇到衝突、讀回暫停中",
      !!(await until(() => holdA.waiting.length > 0, 10000))
    );
    await p.locator("button", { hasText: "切換金鑰" }).click();
    await modal(p).locator('input[placeholder^="例"]').fill("k_ib");
    await modal(p).locator("button", { hasText: "確認切換" }).click();
    check(
      "切換到乙",
      await until(
        async () =>
          (await text(p, '[data-testid="player-info-nickname"]')) === "乙",
        10000
      )
    );
    const holdB = E.gas.rule("save_profile", "hold", { key: "k_ib" });
    await p.locator('[data-testid="player-info-nick-edit"]').click();
    await modal(p).locator("form input.form-control").first().fill("乙改");
    await p.locator('[data-testid="player-info-nick-save"]').click();
    check(
      "乙的保存送出、暫停中",
      !!(await until(() => holdB.waiting.length > 0, 10000))
    );
    holdA.release("ok");
    await sleep(1500);
    check(
      "甲遲到的讀回沒有結束乙的「正在保存」",
      (await p
        .locator('[data-testid="player-info-sync"]')
        .getAttribute("data-sync")) === "syncing"
    );
    check(
      "甲的衝突說明沒有出現在乙的畫面",
      !/剛才的暱稱沒有保存/.test(
        (await text(p, '[data-testid="player-info-notice"]')) || ""
      )
    );
    check(
      "乙在保存中，不能開下一個寫入",
      (await p.locator('[data-testid="player-info-nick-save"]').count()) ===
        1 &&
        (await isDisabled(p, '[data-testid="player-info-nick-save"]')) === true
    );
    holdB.release("ok");
    // 切換帳號時留下的「已成功切換」說明還在：等到保存結果的說明出現才判斷
    const fb = await until(async () => {
      const t = await text(p, '[data-testid="player-info-feedback"]');
      return t && /已保存|沒有保存|待確認/.test(t) ? t : null;
    }, 10000);
    check("乙的保存成功", /已保存/.test(fb || ""), fb);
    check(
      "乙只送了一次 save_profile、雲端是乙改",
      E.gas.count("save_profile", "k_ib") === 1 &&
        E.fx.read("k_ib").data.nickname === "乙改" &&
        E.fx.read("k_ib").rev === 5
    );
    check(
      "畫面與金鑰仍是乙",
      (await text(p, '[data-testid="player-info-nickname"]')) === "乙改" &&
        (await storageOf(p)).ls.shenma_player_key === "k_ib"
    );
    await closeModal(p);
    return E;
  });

  // ═══ 21. 同一位武將在存檔裡兩筆：不猜成基礎值、不給升級，資料原樣保留 ═══
  await scenario("重複的武將紀錄", async (mk) => {
    const data = NEW({
      gold: 2000,
      heroes: [
        { hero_id: "guan_yu", level: 3, star: 1, atk: 300, def: 30, hp: 3000 },
        { hero_id: "guan_yu", level: 7, star: 2, atk: 700, def: 70, hp: 7000 },
        { hero_id: "zhao_yun", level: 2, star: 0, atk: 130, def: 65, hp: 1400 },
      ],
    });
    const E = await mk({ seed: [{ key: "k_dupw", data, rev: 2 }] });
    const p = await E.page({ storage: { shenma_player_key: "k_dupw" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    check(
      "說明有重複的紀錄",
      /重複/.test((await text(p, '[data-testid="player-info-notice"]')) || ""),
      await text(p, '[data-testid="player-info-notice"]')
    );
    await closeModal(p);
    await openRoster(p);
    check(
      "武將視窗不列重複的關羽（12 位）",
      (await rosterCard(p, "關羽")) === null && (await rosterCount(p)) === 12,
      await rosterCount(p)
    );
    check(
      "一筆紀錄的趙雲照存檔顯示（Lv.2、攻 130）",
      /Lv\.2/.test((await rosterCard(p, "趙雲")) || "") &&
        /攻: 130/.test((await rosterCard(p, "趙雲")) || "")
    );
    await closeModal(p);
    await openInfo(p);
    const fb = await saveNickname(p, "改名");
    check("改暱稱成功", /已保存/.test(fb || ""), fb);
    const sent = E.gas.log.find((e) => e.action === "save_profile");
    check(
      "保存的武將兩筆關羽原樣保留",
      !!sent && sameJson(sent.payload.data, { ...data, nickname: "改名" }),
      sent && sent.payload.data
    );
    check("沒有任何 upgrade_hero", E.gas.count("upgrade_hero") === 0);
    await closeModal(p);
    return E;
  });

  // ═══ 22. 結算畫面：共用帳號勝負都說明沒寫入；下一關只開雲端已解鎖的；訪客照本機規則 ═══
  const stageOf = (p) =>
    p.evaluate(() =>
      window.__testBridge &&
      window.__testBridge.engine &&
      window.__testBridge.engine.battleManager
        ? window.__testBridge.engine.battleManager.stageId
        : null
    );
  for (const c of [
    {
      name: "共用帳號勝利、下一關還沒解鎖",
      max: "chapter1_1",
      win: true,
      nextShown: false,
    },
    {
      name: "共用帳號勝利、下一關已解鎖",
      max: "chapter1_3",
      win: true,
      nextShown: true,
    },
    { name: "共用帳號落敗", max: "chapter1_1", win: false, nextShown: false },
  ]) {
    await scenario(`結算畫面：${c.name}`, async (mk) => {
      const data = NEW({
        max_stage: c.max,
        team: [{ hero_id: "guan_yu", slot: 1 }],
      });
      const E = await mk({ seed: [{ key: "k_res", data, rev: 6 }] });
      const p = await E.page({ storage: { shenma_player_key: "k_res" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await sleep(500);
      check(
        "目前是第一關",
        (await stageOf(p)) === "chapter1_1",
        await stageOf(p)
      );
      check("觸發結算", (await forceWin(p, c.win)) === "ok");
      check(
        "說明這場沒有寫入共用進度",
        await until(
          () => p.locator('[data-testid="result-not-saved"]').isVisible(),
          5000
        )
      );
      const card = (await text(p, '[data-testid="result-card"]')) || "";
      check(
        "沒有列出獎勵、沒有說已通關全部",
        !/主公金幣|主公經驗|解鎖新戰役|已通關/.test(card),
        card
      );
      check(
        c.nextShown ? "下一關（已解鎖）可以走" : "沒有「下一關」",
        (await p.locator('[data-testid="result-next-stage"]').count()) ===
          (c.nextShown ? 1 : 0)
      );
      if (c.win && !c.nextShown)
        check(
          "說明下一關還沒解鎖",
          await p.locator('[data-testid="result-next-locked"]').isVisible()
        );
      if (c.nextShown) {
        await p.locator('[data-testid="result-next-stage"]').click();
        check(
          "走到已解鎖的第二關",
          await until(async () => (await stageOf(p)) === "chapter1_2", 5000),
          await stageOf(p)
        );
      }
      await sleep(800);
      check("沒有任何寫入", E.gas.writes().length === 0, E.gas.writes());
      check("雲端存檔沒有變", sameJson(readBack(E, "k_res"), { rev: 6, data }));
      return E;
    });
  }
  await scenario("結算畫面：訪客勝利（本機規則）", async (mk) => {
    const E = await mk({ seed: [] });
    const p = await E.page({ storage: {} });
    await waitLoaded(p);
    await p.locator('[data-testid="key-setup-guest"]').click();
    await until(
      async () => (await p.locator('[data-testid="key-setup"]').count()) === 0,
      10000
    );
    await sleep(500);
    check("觸發勝利", (await forceWin(p, true)) === "ok");
    check(
      "列出本機獎勵",
      await until(
        async () =>
          /主公金幣/.test((await text(p, '[data-testid="result-card"]')) || ""),
        5000
      )
    );
    check(
      "沒有「沒有寫入」的說明",
      (await p.locator('[data-testid="result-not-saved"]').count()) === 0
    );
    check(
      "有「下一關」（本機已解鎖）",
      (await p.locator('[data-testid="result-next-stage"]').count()) === 1
    );
    check("沒有任何存檔請求", E.gas.players().length === 0, E.gas.players());
    return E;
  });

  // ═══ 18. 入口版面：1280 桌面、390×600、390×844 ═══
  for (const vp of [
    { width: 1280, height: 800 },
    { width: 390, height: 600 },
    { width: 390, height: 844 },
  ]) {
    await scenario(`入口版面 ${vp.width}×${vp.height}`, async (mk) => {
      const E = await mk({
        seed: [{ key: "k_vp", data: NEW(), rev: 1 }],
        viewport: vp,
      });
      const p = await E.page();
      check("金鑰視窗出現", (await waitLoaded(p)) === "key-setup");
      check(
        "金鑰輸入框有焦點",
        await until(
          () =>
            p.evaluate(
              () =>
                document.activeElement &&
                document.activeElement.getAttribute("data-testid") ===
                  "key-setup-input"
            ),
          5000
        )
      );
      check(
        "沒有橫向捲動",
        await p.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1
        ),
        await p.evaluate(() => [
          document.documentElement.scrollWidth,
          window.innerWidth,
        ])
      );
      await p.keyboard.type("k_vp_missing");
      await p.keyboard.press("Enter");
      await until(
        () => p.locator('[data-testid="key-setup-create-confirm"]').isVisible(),
        10000
      );
      const btn = p.locator('[data-testid="key-setup-create-confirm"]');
      await btn.scrollIntoViewIfNeeded();
      const reachable = await btn.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          r.left + r.width / 2,
          r.top + r.height / 2
        );
        return (
          r.width > 0 &&
          r.bottom <= window.innerHeight + 1 &&
          r.top >= -1 &&
          !!hit &&
          (hit === el || el.contains(hit))
        );
      });
      check("「建立新存檔」看得到、沒有被蓋住", reachable);
      // 建立按鈕在金鑰輸入框之前：從輸入框按 Shift+Tab 就到它
      await p.locator('[data-testid="key-setup-input"]').focus();
      await p.keyboard.press("Shift+Tab");
      const focused = await p.evaluate(
        () =>
          document.activeElement &&
          document.activeElement.getAttribute("data-testid")
      );
      check(
        "鍵盤可以移到「建立新存檔」（輸入框按 Shift+Tab）",
        focused === "key-setup-create-confirm",
        focused
      );
      check("找不到時沒有寫入", E.gas.writes().length === 0);
      await shot(p, `key-setup-${vp.width}x${vp.height}`);
      // 共用帳號的新存檔：主公資訊與「沒有隊伍」說明
      await p.evaluate(() => localStorage.setItem("shenma_player_key", "k_vp"));
      await p.reload();
      check("新存檔讀到並可以開主公資訊", (await loadShared(p)) === "player");
      check(
        "主公資訊沒有橫向捲動",
        await p.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1
        )
      );
      await shot(p, `player-info-${vp.width}x${vp.height}`);
      await closeModal(p);
      check(
        "看得到「沒有隊伍」的說明",
        await p.locator('[data-testid="sortie-blocked"]').isVisible()
      );
      await shot(p, `shared-empty-${vp.width}x${vp.height}`);
      return E;
    });
  }

  const failures = assertions.filter((a) => !a.pass).map((a) => a.name);
  return {
    allPass: assertions.length > 0 && failures.length === 0,
    assertions,
    failures,
    scenarios: scenarios.map((s) => ({
      name: s.name,
      seconds: s.seconds,
      error: s.error,
      gas: s.gas,
      errors: s.errors,
    })),
  };
};
