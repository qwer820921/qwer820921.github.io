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

  // ═══ 共用帳號說明區的版面：窄畫面不被全站聊天按鈕遮住、整段讀得到、「重新確認」點得到也能用鍵盤 ═══
  /**
   * 說明區每一個字（用 Range 取字的矩形中心）都在視窗內，而且 elementFromPoint 是說明區自己的後代（不排除聊天按鈕）；
   * 「重新確認」左中右三點都點得到它自己、可以用鍵盤聚焦
   */
  const noticeOcclusion = (p) =>
    p.evaluate(() => {
      const n = document.querySelector('[data-testid="shared-account-notice"]');
      const chat = !!document.querySelector(
        'button[aria-label="切換聊天視窗"]'
      );
      if (!n) return { notice: false, chat };
      const blocked = [];
      const offscreen = [];
      let chars = 0;
      const walker = document.createTreeWalker(n, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (let i = 0; i < node.textContent.length; i++) {
          if (!node.textContent[i].trim()) continue;
          const r = document.createRange();
          r.setStart(node, i);
          r.setEnd(node, i + 1);
          const b = r.getBoundingClientRect();
          if (!(b.width > 0 && b.height > 0)) continue;
          chars++;
          const x = b.left + b.width / 2;
          const y = b.top + b.height / 2;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
            offscreen.push(node.textContent[i]);
            continue;
          }
          const el = document.elementFromPoint(x, y);
          if (!el || !n.contains(el)) {
            const btn = el && el.closest("button");
            blocked.push({
              ch: node.textContent[i],
              by: el
                ? (btn && btn.getAttribute("aria-label")) || el.tagName
                : null,
            });
          }
        }
      }
      const retry = document.querySelector('[data-testid="settle-retry"]');
      let retryOk = null;
      let retryKeyboard = null;
      if (retry) {
        const b = retry.getBoundingClientRect();
        retryOk = [0.1, 0.5, 0.9].every((fx) => {
          const x = b.left + b.width * fx;
          const y = b.top + b.height / 2;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight)
            return false;
          const el = document.elementFromPoint(x, y);
          return !!el && retry.contains(el);
        });
        retry.focus();
        retryKeyboard =
          retry.tabIndex >= 0 &&
          !retry.disabled &&
          document.activeElement === retry;
        retry.blur();
      }
      return {
        notice: true,
        chat,
        chars,
        blocked,
        offscreen,
        retry: !!retry,
        retryOk,
        retryKeyboard,
      };
    });
  /** 版面的檢查：有聊天按鈕、說明區有字、沒有字被遮住或在視窗外；有「重新確認」時三點都點得到也能用鍵盤 */
  const layoutOk = (o, wantRetry) =>
    o.notice &&
    o.chat &&
    o.chars > 0 &&
    o.blocked.length === 0 &&
    o.offscreen.length === 0 &&
    o.retry === wantRetry &&
    (!wantRetry || (o.retryOk && o.retryKeyboard));
  const LONG_MAPS = [
    { ...MAP("chapter1_1", 1), name: "黃巾起義・涿郡義勇軍初陣之戰（長名稱）" },
    { ...MAP("chapter1_2", 2), name: "桃園結義" },
    { ...MAP("chapter1_3", 3), name: "討伐黃巾" },
  ];
  for (const vp of [
    { width: 390, height: 600 },
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await scenario(
      `說明區的版面：待確認（長名稱）與重新確認後的回饋 ${vp.width}×${vp.height}`,
      async (mk) => {
        const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
        const E = await mk({
          seed: [{ key: "k_ly", data, rev: 6 }],
          maps: LONG_MAPS,
          enemies: ENEMIES,
          viewport: vp,
        });
        E.gas.rule("save_result", "lost");
        E.allowGasErrors = 1;
        const p = await E.page({ storage: { shenma_player_key: "k_ly" } });
        check("讀到存檔", (await loadShared(p)) === "player");
        await closeModal(p);
        check("結果不明、重新整理後讀到存檔", await pendingThenReload(p, E));
        check(
          "說明顯示長名稱的關卡",
          await until(
            async () =>
              (await stageLabel(p)) ===
              "待確認的結算：黃巾起義・涿郡義勇軍初陣之戰（長名稱）（chapter1_1）",
            15000
          ),
          await stageLabel(p)
        );
        const o = await noticeOcclusion(p);
        check(
          "待確認：說明區每個字都在視窗內、沒有被聊天按鈕或其他東西遮住；「重新確認」點得到、可以用鍵盤聚焦",
          layoutOk(o, true),
          o
        );
        await shot(p, `notice-layout-pending-${vp.width}x${vp.height}`);
        // 用鍵盤按「重新確認」：只原樣送那一場
        const first = E.gas.log.find((e) => e.action === "save_result");
        await p.focus('[data-testid="settle-retry"]');
        await p.keyboard.press("Enter");
        check(
          "鍵盤按「重新確認」後已保存",
          await until(
            () => p.locator('[data-testid="settle-confirmed"]').isVisible(),
            10000
          )
        );
        const all = E.gas.log.filter((e) => e.action === "save_result");
        check(
          "重新確認只原樣送原本那一場（第二次的內容等於第一次）",
          all.length === 2 && sameJson(all[1].payload, first.payload),
          all.length
        );
        const o2 = await noticeOcclusion(p);
        check(
          "已保存的回饋：說明區每個字都在視窗內、沒有被遮住",
          layoutOk(o2, false),
          o2
        );
        return E;
      }
    );
  }
  for (const state of ["ID", "review", "unavailable", "readonly", "conflict"]) {
    await scenario(`說明區的版面：${state} 390×600`, async (mk) => {
      const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
      const E = await mk({
        seed: [{ key: "k_ls", data, rev: 6 }],
        maps: FMAPS,
        enemies: ENEMIES,
        viewport: { width: 390, height: 600 },
      });
      E.allowGasErrors = 2;
      if (state === "readonly")
        E.gas.rule("get_profile", "transform", {
          times: 99,
          fn: (res) => ({ ...res, rev: undefined }),
        });
      const p = await E.page({ storage: { shenma_player_key: "k_ls" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      if (state === "conflict") {
        // 另一處先保存（版本 7），這裡再改暱稱 → 衝突、改用雲端的資料
        E.fx.handle({
          action: "save_profile",
          key: "k_ls",
          payload: { data: { ...data, nickname: "別處改" }, base_rev: 6 },
        });
        const fb = await saveNickname(p, "我改");
        check("衝突：說明有較新的存檔", /較新的存檔/.test(fb || ""), fb);
      }
      await closeModal(p);
      if (["ID", "review", "unavailable"].includes(state)) {
        if (state === "review")
          E.gas.rule("save_result", "reply", {
            fn: () => ({ status: 409, error: "RESULT_UNKNOWN" }),
          });
        else E.gas.rule("save_result", "lost");
        await waitRemoteStage(p, E);
        check("開戰", await startBattle(p));
        await endWith(p, {});
        await until(
          () =>
            p
              .locator(
                '[data-testid="result-settle-retry"], [data-testid="result-settle-review"]'
              )
              .first()
              .isVisible(),
          10000
        );
        if (state === "ID") {
          await clearStageCache(p);
          E.gas.rule("get_all_maps", "http500");
        }
        if (state === "unavailable")
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
      }
      const want = {
        ID: /chapter1_1（關卡名稱未確認）/,
        review: /要人工確認的結算/,
        unavailable: /暫存讀不到/,
        readonly: /版本不明|只能查看/,
        conflict: /較新的存檔/,
      }[state];
      check(
        "說明區出現這個狀態的說明",
        await until(
          async () =>
            want.test(
              (await text(p, '[data-testid="shared-account-notice"]')) || ""
            ),
          15000
        ),
        await text(p, '[data-testid="shared-account-notice"]')
      );
      await sleep(500);
      const o = await noticeOcclusion(p);
      check(
        `${state}：說明區每個字都在視窗內、沒有被聊天按鈕或其他東西遮住；${state === "ID" ? "「重新確認」點得到、可以用鍵盤聚焦" : "沒有「重新確認」"}`,
        layoutOk(o, state === "ID"),
        o
      );
      await shot(p, `notice-layout-${state}-390x600`);
      return E;
    });
  }
  await scenario("說明區的版面：讀取中 390×600", async (mk) => {
    const data = NEW({ team: [{ hero_id: "guan_yu", slot: 1 }] });
    const E = await mk({
      seed: [{ key: "k_ll", data, rev: 6 }],
      maps: FMAPS,
      enemies: ENEMIES,
      viewport: { width: 390, height: 600 },
    });
    E.gas.rule("save_result", "lost");
    E.allowGasErrors = 1;
    const p = await E.page({ storage: { shenma_player_key: "k_ll" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    check("結果不明、重新整理後讀到存檔", await pendingThenReload(p, E));
    // 重新整理而且讀取存檔暫停：讀取中的畫面
    const hold = E.gas.rule("get_profile", "hold");
    await p.reload();
    await until(() => hold.waiting.length > 0, 10000);
    await sleep(500);
    const o = await noticeOcclusion(p);
    check(
      "讀取中：有說明區時每個字都在視窗內、沒有被遮住（沒有說明區也記下來）",
      o.chat &&
        (!o.notice || (o.blocked.length === 0 && o.offscreen.length === 0)),
      o
    );
    hold.release("ok");
    check("讀取完成", (await loadShared(p)) === "player");
    await closeModal(p);
    const o2 = await noticeOcclusion(p);
    check(
      "讀取完成後：待確認的說明每個字都沒有被遮住、「重新確認」點得到",
      layoutOk(o2, true),
      o2
    );
    return E;
  });

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

  // ═══ 23. 武將技能接線：正常頁面從部署選單放置，技能取自正式技能表；不寫進存檔、暫存與結算 ═══
  // 期待值寫死（正式技能表 shenmaSanguo/utils/heroSkills 的參數名與數值），不由頁面或技能表產生。每次部署都比兩處：
  //   - 引擎建立武將之前收到的部署資料：測試側包住既有的 engine.placeHero 記下參數，再原樣呼叫（不直接呼叫 placeHero、不注入技能）
  //   - 引擎武將實例的 16 個技能欄位（沒有技能時是初始值）
  // 首擊與射程在引擎裡缺值會補預設倍率，只看實例抓不到參數名寫錯，所以部署資料也要逐欄比。
  // 關卡是只給接線用的合成關（道路格夠多），不是正式代表關；這裡不驗收技能在戰鬥中的實際效果
  const SKILL_PAYLOAD = {
    hero_ma_chao: { id: "first_strike", first_attack_multiplier: 2 },
    hero_zhao_yun: { id: "dodge", dodge_chance: 0.15 },
    hero_huang_zhong: { id: "long_range", range_multiplier: 1.5 },
    hero_zhou_yu: {
      id: "burn",
      burn_ratio: 0.2,
      burn_ticks: 3,
      burn_interval: 1,
    },
    hero_guan_yu: { id: "slow_aura", slow_mult: 0.9 },
    hero_liu_bei: { id: "def_aura", def_mult: 1.2 },
    hero_zhang_fei: { id: "stun", stun_sec: 0.5 },
    hero_wei_yan: { id: "lifesteal", lifesteal_ratio: 0.15 },
    hero_cao_cao: { id: "atk_speed_aura", atk_speed_mult: 1.15 },
    hero_xia_hou_dun: { id: "counter", counter_ratio: 0.2 },
    hero_liao_hua: { id: "tenacity", low_hp_ratio: 0.3, damage_mult: 0.8 },
    hero_yan_liang: { id: "atk_down_aura", atk_mult: 0.9 },
    hero_sun_shang_xiang: { id: "double_shot", double_shot_chance: 0.2 },
  };
  const NO_SKILL = {
    firstStrikeMultiplier: 1,
    rangeMultiplier: 1,
    burnRatio: 0,
    burnTicks: 0,
    burnInterval: 1,
    slowAuraMult: 1,
    dodgeChance: 0,
    defAuraMult: 1,
    stunDuration: 0,
    lifestealRatio: 0,
    atkSpeedAuraMult: 1,
    counterRatio: 0,
    tenacityHpRatio: 0,
    tenacityDamageMult: 1,
    atkDownAuraMult: 1,
    doubleShotChance: 0,
  };
  const SKILL_FIELDS = {
    hero_ma_chao: { firstStrikeMultiplier: 2 },
    hero_zhao_yun: { dodgeChance: 0.15 },
    hero_huang_zhong: { rangeMultiplier: 1.5 },
    hero_zhou_yu: { burnRatio: 0.2, burnTicks: 3, burnInterval: 1 },
    hero_guan_yu: { slowAuraMult: 0.9 },
    hero_liu_bei: { defAuraMult: 1.2 },
    hero_zhang_fei: { stunDuration: 0.5 },
    hero_wei_yan: { lifestealRatio: 0.15 },
    hero_cao_cao: { atkSpeedAuraMult: 1.15 },
    hero_xia_hou_dun: { counterRatio: 0.2 },
    hero_liao_hua: { tenacityHpRatio: 0.3, tenacityDamageMult: 0.8 },
    hero_yan_liang: { atkDownAuraMult: 0.9 },
    hero_sun_shang_xiang: { doubleShotChance: 0.2 },
  };
  // 訪客沒有隊伍時的 13 位預設武將（engine/builtinData.ts 的 DEFAULT_PLAYER_HEROES，照原文抄寫）與部署選單上的名稱
  const DEFAULT_SORTIE = [
    ["hero_ma_chao", "馬超", 3, 1, 120, 60, 1200],
    ["hero_zhao_yun", "趙雲", 3, 1, 110, 65, 1150],
    ["hero_guan_yu", "關羽", 4, 2, 150, 75, 1500],
    ["hero_zhang_fei", "張飛", 3, 1, 140, 70, 1450],
    ["hero_zhou_yu", "周瑜", 3, 1, 135, 55, 1000],
    ["hero_huang_zhong", "黃忠", 3, 1, 130, 50, 950],
    ["hero_liu_bei", "劉備", 3, 1, 105, 80, 1600],
    ["hero_wei_yan", "魏延", 2, 1, 115, 58, 1250],
    ["hero_cao_cao", "曹操", 3, 1, 125, 72, 1400],
    ["hero_xia_hou_dun", "夏侯惇", 2, 1, 120, 68, 1350],
    ["hero_liao_hua", "廖化", 2, 1, 100, 62, 1200],
    ["hero_yan_liang", "顏良", 2, 1, 130, 60, 1300],
    ["hero_sun_shang_xiang", "孫尚香", 2, 1, 125, 52, 1050],
  ];
  const wantPayload = (hero_id, level, star, atk, def, hp) => ({
    hero_id,
    level,
    star,
    atk,
    def,
    hp,
    skill: SKILL_PAYLOAD[hero_id],
  });
  const wantFields = (hero_id) => ({ ...NO_SKILL, ...SKILL_FIELDS[hero_id] });
  // 接線用的合成關：兩條道路（第 3 列、第 6 列）都通到城池，出生點與城池以外的道路格都能放武將
  const SKILL_MAP = (id, n) => ({
    map_id: id,
    chapter: 1,
    name: `接線測試第${n}關`,
    unlock_stage: id,
    path_json: JSON.stringify({
      cols: 14,
      rows: 10,
      paths: {
        path_a: [
          [0, 3],
          [13, 3],
        ],
        path_b: [
          [0, 6],
          [13, 6],
          [13, 3],
        ],
      },
      base: [13, 3],
      build_zones: [[2, 1]],
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
  const SKILL_MAPS = [
    SKILL_MAP("chapter1_1", 1),
    SKILL_MAP("chapter1_2", 2),
    SKILL_MAP("chapter1_3", 3),
  ];
  const ROAD_CELLS = [
    ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((c) => [c, 3]),
    ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((c) => [c, 6]),
  ];
  /** 所有名為 skill 的鍵的路徑（深度走訪） */
  const skillPaths = (v, path = "") =>
    Array.isArray(v)
      ? v.flatMap((x, i) => skillPaths(x, `${path}[${i}]`))
      : v && typeof v === "object"
        ? Object.entries(v).flatMap(([k, x]) => [
            ...(k === "skill" ? [`${path}.${k}`] : []),
            ...skillPaths(x, `${path}.${k}`),
          ])
        : [];
  /** 瀏覽器儲存裡出現 skill 的位置（值能解析成 JSON 就走訪，否則找字樣） */
  async function storageSkill(p) {
    const st = await storageOf(p);
    const found = [];
    for (const [area, kv] of [
      ["localStorage", st.ls],
      ["sessionStorage", st.ss],
    ])
      for (const [k, v] of Object.entries(kv)) {
        let parsed;
        try {
          parsed = JSON.parse(v);
        } catch {
          parsed = undefined;
        }
        const paths =
          parsed !== undefined
            ? skillPaths(parsed)
            : /"skill"\s*:/.test(v)
              ? ["(文字)"]
              : [];
        for (const x of paths) found.push(`${area}.${k}${x}`);
      }
    return found;
  }
  /** 在測試側包住既有的 engine.placeHero：記下引擎建立武將前收到的部署資料，再原樣呼叫 */
  async function watchPlacements(p) {
    return p.evaluate(() => {
      const e = window.__testBridge && window.__testBridge.engine;
      if (!e || typeof e.placeHero !== "function") return false;
      if (!e.__placeLog) {
        e.__placeLog = [];
        const orig = e.placeHero;
        e.placeHero = function (col, row, heroState) {
          e.__placeLog.push({
            col,
            row,
            state: JSON.parse(JSON.stringify(heroState)),
          });
          return orig.call(this, col, row, heroState);
        };
      }
      return true;
    });
  }
  /** 照玩家的操作部署：點畫布上的格子 → 部署選單 → 點武將卡 */
  async function deployHero(p, [col, row], name) {
    const at = () =>
      p.evaluate(
        ({ c, r }) => {
          const e = window.__testBridge.engine;
          const w = e.gameMap.gridToWorld(c, r);
          const rect = e.canvas.getBoundingClientRect();
          const x = rect.left + w.x;
          const y = rect.top + w.y;
          const el = document.elementFromPoint(x, y);
          return {
            x,
            y,
            onCanvas: el === e.canvas,
            canPlace: e.gameMap.canPlaceHero(c, r),
            hit: el ? `${el.tagName}.${el.className}` : null,
          };
        },
        { c: col, r: row }
      );
    let pt = await at();
    const tips = p.locator('button[aria-label="收起玩法提示"]');
    if (!pt.onCanvas && (await tips.count())) {
      await tips.first().click();
      await sleep(300);
      pt = await at();
    }
    if (!pt.onCanvas || !pt.canPlace) return { ok: false, step: "cell", pt };
    await p.mouse.click(pt.x, pt.y);
    const menu = p.locator('[data-testid="placement-menu"]');
    if (!(await until(() => menu.isVisible(), 5000)))
      return { ok: false, step: "menu", pt };
    const card = menu.locator("button", { hasText: name });
    if ((await card.count()) === 0)
      return { ok: false, step: "card", menu: await menu.innerText() };
    if (await card.first().isDisabled())
      return { ok: false, step: "card-disabled", menu: await menu.innerText() };
    await card.first().click();
    const closed = await until(async () => (await menu.count()) === 0, 5000);
    return { ok: !!closed, step: closed ? "placed" : "menu-open" };
  }
  /** 引擎目前的這一場：部署紀錄、battleId、場上武將與它們的 16 個技能欄位 */
  async function fieldOf(p) {
    return p.evaluate((fields) => {
      const e = window.__testBridge.engine;
      return {
        log: e.__placeLog || [],
        battleId: e.battleManager.battleId,
        heroes: e.heroes.map((h) => ({
          heroId: h.heroId,
          mark: h.__mark || null,
          f: Object.fromEntries(fields.map((k) => [k, h[k]])),
        })),
      };
    }, Object.keys(NO_SKILL));
  }
  /** 等 battleId 穩定（重新載入後一段時間不再變） */
  async function stableBattle(p) {
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
  const lastState = (s) =>
    s.log.length ? s.log[s.log.length - 1].state : null;
  /** 只記錄、不當作斷言的觀察（附在這個情境的結果裡） */
  const note = (name, detail) => {
    if (current) (current.notes = current.notes || []).push({ name, detail });
  };
  const heroVec = (s) => s.heroes.map((h) => [h.heroId, h.f]);
  // 訪客的本機存檔（只在這個瀏覽器）
  const GUEST_SAVE = (heroes, team) =>
    JSON.stringify({
      key: "guest_skill",
      nickname: "遊俠主公",
      level: 1,
      exp: 0,
      gold: 1500,
      capacity: 65,
      max_stage: "chapter1_1",
      cleared_stages: {},
      heroes,
      team,
      serverRev: 1,
      updatedAt: 1,
    });
  const DECOY_SCENARIO = "技能接線：設定與存檔夾帶的 skill 不採用";

  await scenario("技能接線：共用帳號從部署選單放置", async (mk) => {
    const data = NEW({
      capacity: 20,
      heroes: [
        { hero_id: "ma_chao", level: 3, star: 0, atk: 0, def: 0, hp: 0 },
      ],
      team: [
        { hero_id: "ma_chao", slot: 1 },
        { hero_id: "zhao_yun", slot: 2 },
      ],
    });
    const E = await mk({
      seed: [{ key: "k_skill", data, rev: 4 }],
      maps: SKILL_MAPS,
      enemies: ENEMIES,
    });
    const p = await E.page({ storage: { shenma_player_key: "k_skill" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    check("可以觀測部署資料", await watchPlacements(p));
    const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
    const d2 = await deployHero(p, ROAD_CELLS[4], "趙雲");
    check("從部署選單放置馬超與趙雲", d1.ok && d2.ok, { d1, d2 });
    const s1 = await fieldOf(p);
    check(
      "引擎建立武將前收到的部署資料逐欄等於寫死的值（馬超的 0 照樣是 0；趙雲用後端基礎值；技能是正式表的參數）",
      sameJson(
        s1.log.map((x) => x.state),
        [
          wantPayload("hero_ma_chao", 3, 0, 0, 0, 0),
          wantPayload("hero_zhao_yun", 1, 0, 120, 60, 1300),
        ]
      ),
      s1.log
    );
    check(
      "兩位武將實例的 16 個技能欄位：只有自己的技能，其他是初始值（不串用）",
      sameJson(heroVec(s1), [
        ["hero_ma_chao", wantFields("hero_ma_chao")],
        ["hero_zhao_yun", wantFields("hero_zhao_yun")],
      ]),
      s1.heroes
    );
    // 備戰中改隊伍：存檔只送 team（沒有 skill），戰場重新載入，之後部署用新隊伍的資料
    await openTeam(p);
    check(
      "選得到黃忠與周瑜",
      (await pickTeamHero(p, "黃忠")) && (await pickTeamHero(p, "周瑜"))
    );
    await p.locator('[data-testid="team-edit-save"]').click();
    await until(async () => (await modal(p).count()) === 0, 10000);
    const saves = E.gas.log.filter((e) => e.action === "save_profile");
    const sent = saves[0] && saves[0].payload;
    check(
      "改隊伍：一次 save_profile、body 沒有 skill、除了 team 其他原樣、隊伍是馬超／趙雲／黃忠／周瑜",
      saves.length === 1 &&
        skillPaths(sent).length === 0 &&
        sameJson({ ...sent.data, team: null }, { ...data, team: null }) &&
        sameJson(sent.data.team.map((t) => t.hero_id).sort(), [
          "huang_zhong",
          "ma_chao",
          "zhao_yun",
          "zhou_yu",
        ]),
      sent
    );
    const bid1 = await until(async () => {
      const b = await bm(p, "battleId");
      return b && b !== s1.battleId ? b : null;
    }, 10000);
    await stableBattle(p);
    const s2 = await fieldOf(p);
    check(
      "備戰中改隊伍後戰場重新載入：新的 battleId、場上沒有武將",
      !!bid1 && s2.battleId !== s1.battleId && s2.heroes.length === 0,
      { bid1, s2: { battleId: s2.battleId, heroes: s2.heroes.length } }
    );
    const d3 = await deployHero(p, ROAD_CELLS[6], "黃忠");
    const s3 = await fieldOf(p);
    check(
      "重新載入後部署黃忠：部署資料帶長射程 1.5，實例只有射程倍率 1.5",
      d3.ok &&
        sameJson(
          lastState(s3),
          wantPayload("hero_huang_zhong", 1, 0, 125, 50, 1000)
        ) &&
        sameJson(heroVec(s3), [
          ["hero_huang_zhong", wantFields("hero_huang_zhong")],
        ]),
      { d3, s3 }
    );
    // 只記錄：備戰中重新載入後部署選單上馬超的卡片（之前沒有清「已在場上」的名單；現在由第 24 段「備戰重新載入」的情境具名檢查）
    {
      const pt = await p.evaluate(
        ({ c, r }) => {
          const e = window.__testBridge.engine;
          const w = e.gameMap.gridToWorld(c, r);
          const rect = e.canvas.getBoundingClientRect();
          return { x: rect.left + w.x, y: rect.top + w.y };
        },
        { c: ROAD_CELLS[8][0], r: ROAD_CELLS[8][1] }
      );
      await p.mouse.click(pt.x, pt.y);
      const menu = p.locator('[data-testid="placement-menu"]');
      await until(() => menu.isVisible(), 5000);
      const card = menu.locator("button", { hasText: "馬超" });
      note("備戰中改隊伍重新載入後，部署選單上馬超的卡片", {
        disabled: (await card.count()) ? await card.first().isDisabled() : null,
        text: (await card.count()) ? await card.first().innerText() : null,
        engineHeroes: (await fieldOf(p)).heroes.length,
      });
      await menu
        .locator("button", { hasText: "×" })
        .first()
        .click()
        .catch(() => {});
      await until(async () => (await menu.count()) === 0, 5000);
    }
    // 開戰後再部署：已在場上的實例不變，新部署照樣帶技能
    check("按進入戰場開戰", await startBattle(p));
    await p.evaluate(() => {
      const h = window.__testBridge.engine.heroes[0];
      if (h) h.__mark = "before";
    });
    const d4 = await deployHero(p, ROAD_CELLS[13], "周瑜");
    const s4 = await fieldOf(p);
    check(
      "戰鬥中部署周瑜：部署資料與實例都是火攻 0.2／3 跳／1 秒；黃忠是原本的實例、技能欄位不變",
      d4.ok &&
        sameJson(
          lastState(s4),
          wantPayload("hero_zhou_yu", 1, 0, 135, 55, 1000)
        ) &&
        s4.heroes[0].mark === "before" &&
        sameJson(heroVec(s4), [
          ["hero_huang_zhong", wantFields("hero_huang_zhong")],
          ["hero_zhou_yu", wantFields("hero_zhou_yu")],
        ]),
      { d4, s4 }
    );
    check("受控的勝利結束", (await endWith(p, {})) === "ok");
    check(
      "結算畫面：已保存到共用進度",
      await until(
        () => p.locator('[data-testid="result-settle-confirmed"]').isVisible(),
        10000
      )
    );
    const sv = E.gas.log.filter((e) => e.action === "save_result");
    check(
      "save_result 一次、body 沒有 skill",
      sv.length === 1 && skillPaths(sv[0].payload).length === 0,
      sv.map((e) => e.payload)
    );
    const back = readBack(E, "k_skill");
    check(
      "雲端讀回的存檔沒有 skill",
      !!back && skillPaths(back.data).length === 0,
      back
    );
    check("暫存已刪除", (await pendingKeys(p)).length === 0);
    const st = await storageSkill(p);
    check("瀏覽器儲存（含設定快取）沒有 skill", st.length === 0, st);
    return E;
  });

  await scenario(DECOY_SCENARIO, async (mk) => {
    // 存檔裡趙雲夾帶 0.9 的閃避（和一個未知欄位）；後端武將設定夾帶 skill 與 passive 文字：都不能控制引擎，存檔原有的欄位原樣保留
    const decoy = {
      hero_id: "zhao_yun",
      level: 2,
      star: 1,
      atk: 111,
      def: 22,
      hp: 333,
      skill: { id: "dodge", dodge_chance: 0.9 },
      x_note: "keep",
    };
    const data = NEW({
      capacity: 20,
      heroes: [decoy],
      team: [
        { hero_id: "zhao_yun", slot: 1 },
        { hero_id: "ma_chao", slot: 2 },
      ],
    });
    const E = await mk({
      seed: [{ key: "k_decoy", data, rev: 2 }],
      maps: SKILL_MAPS,
      enemies: ENEMIES,
    });
    E.gas.rule("get_heroes_config", "transform", {
      times: 50,
      fn: (res) => ({
        ...res,
        heroes: res.heroes.map((h) =>
          h.hero_id === "ma_chao"
            ? {
                ...h,
                passive: "衝鋒：首擊傷害翻倍",
                skill: { id: "stun", stun_sec: 9 },
              }
            : h.hero_id === "zhao_yun"
              ? {
                  ...h,
                  skill: { id: "first_strike", first_attack_multiplier: 5 },
                }
              : h
        ),
      }),
    });
    const p = await E.page({ storage: { shenma_player_key: "k_decoy" } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    const cfgSkill = async () =>
      p.evaluate(() => {
        try {
          const c = JSON.parse(localStorage.getItem("shenma_static_config"));
          const m = (c.heroesConfig || []).find(
            (h) => h.hero_id === "hero_ma_chao"
          );
          return m ? m.skill || null : null;
        } catch {
          return null;
        }
      });
    check(
      "誘餌確實送到頁面：設定快取裡馬超帶著 stun 9 的 skill",
      sameJson(await cfgSkill(), { id: "stun", stun_sec: 9 }),
      await cfgSkill()
    );
    const deployBoth = async (label) => {
      check(`${label}：可以觀測部署資料`, await watchPlacements(p));
      const a = await deployHero(p, ROAD_CELLS[3], "趙雲");
      const b = await deployHero(p, ROAD_CELLS[5], "馬超");
      const s = await fieldOf(p);
      const tail = s.log.slice(-2).map((x) => x.state);
      check(
        `${label}：部署資料是正式表的技能（趙雲閃避 0.15、馬超首擊 2），不是存檔或設定夾帶的 skill；趙雲其他數值照存檔`,
        a.ok &&
          b.ok &&
          sameJson(tail, [
            wantPayload("hero_zhao_yun", 2, 1, 111, 22, 333),
            wantPayload("hero_ma_chao", 1, 0, 130, 60, 1300),
          ]),
        { a, b, tail }
      );
      check(
        `${label}：實例欄位也是正式表的值（沒有 0.9 閃避、5 倍首擊或 9 秒暈眩）`,
        sameJson(heroVec(s), [
          ["hero_zhao_yun", wantFields("hero_zhao_yun")],
          ["hero_ma_chao", wantFields("hero_ma_chao")],
        ]),
        s.heroes
      );
    };
    await deployBoth("第一次載入");
    await openInfo(p);
    const fb = await saveNickname(p, "誘餌主公");
    check("改暱稱已保存", /已保存/.test(fb || ""), fb);
    await closeModal(p);
    const sv = E.gas.log.filter((e) => e.action === "save_profile");
    check(
      "save_profile body：存檔原有的趙雲紀錄（含夾帶的 skill 與未知欄位）原樣保留，沒有其他 skill",
      sv.length === 1 &&
        sameJson(sv[0].payload.data.heroes, [decoy]) &&
        sameJson(skillPaths(sv[0].payload), [".data.heroes[0].skill"]),
      sv.map((e) => e.payload)
    );
    // 真正重新整理：設定改從快取讀，技能照樣只來自正式表
    const cfgBefore = E.gas.count("get_heroes_config");
    await p.reload();
    check("重新整理後讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    check(
      "重新整理後戰場換成接線測試關（城池在第 13 欄第 3 列，不是內建關卡的位置）",
      !!(await until(
        () =>
          p.evaluate(() => {
            const m = window.__testBridge && window.__testBridge.engine.gameMap;
            return !!m && m.basePos.col === 13 && m.basePos.row === 3;
          }),
        15000
      ))
    );
    await stableBattle(p);
    check(
      "重新整理後設定快取仍帶著誘餌",
      sameJson(await cfgSkill(), { id: "stun", stun_sec: 9 })
    );
    await deployBoth("重新整理後");
    note("重新整理前後 get_heroes_config 的請求數（快取命中時不增加）", {
      before: cfgBefore,
      after: E.gas.count("get_heroes_config"),
    });
    return E;
  });

  await scenario("技能接線：訪客的 13 位預設武將", async (mk) => {
    const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
    const p = await E.page({
      storage: {
        shenma_js_guest_active: "1",
        shenma_js_guest_state: GUEST_SAVE(
          DEFAULT_SORTIE.map(([id]) => ({
            hero_id: id,
            level: 1,
            star: 1,
            atk: 100,
            def: 50,
            hp: 1000,
          })),
          []
        ),
      },
    });
    check(
      "以訪客進入（沒有金鑰視窗）",
      await until(
        async () =>
          (await p.locator('button[aria-label="主公資訊"]').count()) > 0 &&
          (await p.locator('[data-testid="key-setup"]').count()) === 0,
        20000
      )
    );
    await waitRemoteStage(p, E);
    check("可以觀測部署資料", await watchPlacements(p));
    const results = [];
    for (const [i, row] of DEFAULT_SORTIE.entries())
      results.push(await deployHero(p, ROAD_CELLS[i], row[1]));
    check(
      "13 位都從部署選單放置",
      results.every((r) => r.ok),
      results.map((r, i) => ({ hero: DEFAULT_SORTIE[i][0], ...r }))
    );
    const s = await fieldOf(p);
    check(
      "13 筆部署資料逐欄等於寫死的值（訪客沒有隊伍時的預設武將＋各自的正式技能）",
      sameJson(
        s.log.map((x) => x.state),
        DEFAULT_SORTIE.map(([id, , lv, st, a, d, h]) =>
          wantPayload(id, lv, st, a, d, h)
        )
      ),
      s.log.map((x) => x.state)
    );
    for (const [id, name] of DEFAULT_SORTIE) {
      const h = s.heroes.find((x) => x.heroId === id);
      check(
        `${name}的實例只有自己的技能欄位`,
        !!h && sameJson(h.f, wantFields(id)),
        h
      );
    }
    // 不相關的存檔更新（訪客在本機升級一位武將）：預設武將清單不換，備戰中的戰場不重新載入
    const bidBefore = s.battleId;
    await openRoster(p);
    await p.locator('[data-testid="hero-upgrade"]').click();
    await sleep(1500);
    await closeModal(p);
    await sleep(1000);
    const after = await fieldOf(p);
    check(
      "訪客升級後：同一個 battleId、場上仍是 13 位（沒有額外重新載入）",
      after.battleId === bidBefore && after.heroes.length === 13,
      { bidBefore, battleId: after.battleId, heroes: after.heroes.length }
    );
    const st = await storageSkill(p);
    check("訪客的本機存檔與其他儲存沒有 skill", st.length === 0, st);
    check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
    return E;
  });

  await scenario("技能接線：訪客戰鬥中改隊伍", async (mk) => {
    const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
    const p = await E.page({
      storage: {
        shenma_js_guest_active: "1",
        shenma_js_guest_state: GUEST_SAVE(
          [
            {
              hero_id: "hero_ma_chao",
              level: 2,
              star: 1,
              atk: 115,
              def: 58,
              hp: 1120,
            },
            {
              hero_id: "hero_zhou_yu",
              level: 1,
              star: 1,
              atk: 105,
              def: 55,
              hp: 1080,
            },
            {
              hero_id: "hero_guan_yu",
              level: 1,
              star: 1,
              atk: 116,
              def: 58,
              hp: 1120,
            },
          ],
          [{ slot: 0, hero_id: "hero_ma_chao" }]
        ),
      },
    });
    check(
      "以訪客進入",
      await until(
        async () =>
          (await p.locator('button[aria-label="主公資訊"]').count()) > 0 &&
          (await p.locator('[data-testid="key-setup"]').count()) === 0,
        20000
      )
    );
    await waitRemoteStage(p, E);
    check("可以觀測部署資料", await watchPlacements(p));
    const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
    check("開戰前部署馬超", d1.ok, d1);
    check("按進入戰場開戰", await startBattle(p));
    await p.evaluate(() => {
      const h = window.__testBridge.engine.heroes[0];
      if (h) h.__mark = "before";
    });
    const bidBattle = await bm(p, "battleId");
    await openTeam(p);
    check("戰鬥中選得到周瑜", await pickTeamHero(p, "周瑜"));
    await p.locator('[data-testid="team-edit-save"]').click();
    await until(async () => (await modal(p).count()) === 0, 10000);
    await sleep(800);
    const d2 = await deployHero(p, ROAD_CELLS[4], "周瑜");
    const s = await fieldOf(p);
    check(
      "戰鬥中改隊伍：同一場（battleId 不變）、馬超是原本的實例且技能不變",
      s.battleId === bidBattle &&
        s.heroes[0] &&
        s.heroes[0].mark === "before" &&
        sameJson(s.heroes[0].f, wantFields("hero_ma_chao")),
      s
    );
    check(
      "改隊伍後部署周瑜：部署資料與實例都是火攻 0.2／3 跳／1 秒，數值照訪客存檔",
      d2.ok &&
        sameJson(
          lastState(s),
          wantPayload("hero_zhou_yu", 1, 1, 105, 55, 1080)
        ) &&
        sameJson(heroVec(s)[1], ["hero_zhou_yu", wantFields("hero_zhou_yu")]),
      { d2, s }
    );
    const st = await storageSkill(p);
    check("改隊伍後訪客的本機存檔沒有 skill", st.length === 0, st);
    return E;
  });

  await scenario("技能接線：換帳號後部署用新帳號的武將", async (mk) => {
    const E = await mk({
      seed: [
        {
          key: "k_sa",
          data: NEW({
            nickname: "甲",
            team: [{ hero_id: "ma_chao", slot: 1 }],
          }),
          rev: 1,
        },
        {
          key: "k_sb",
          data: NEW({
            nickname: "乙",
            team: [{ hero_id: "liu_bei", slot: 1 }],
          }),
          rev: 5,
        },
      ],
      maps: SKILL_MAPS,
      enemies: ENEMIES,
    });
    const p = await E.page({ storage: { shenma_player_key: "k_sa" } });
    check("讀到甲", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    check("可以觀測部署資料", await watchPlacements(p));
    const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
    const s1 = await fieldOf(p);
    check(
      "甲部署馬超：首擊 2 倍",
      d1.ok &&
        sameJson(
          lastState(s1),
          wantPayload("hero_ma_chao", 1, 0, 130, 60, 1300)
        ),
      { d1, s1 }
    );
    await openInfo(p);
    await p.locator("button", { hasText: "切換金鑰" }).click();
    await modal(p).locator('input[placeholder^="例"]').fill("k_sb");
    await modal(p).locator("button", { hasText: "確認切換" }).click();
    check(
      "切換到乙",
      await until(
        async () =>
          (await text(p, '[data-testid="player-info-nickname"]')) === "乙",
        10000
      )
    );
    await closeModal(p);
    await stableBattle(p);
    const s2 = await fieldOf(p);
    check(
      "換帳號後備戰中的戰場重新載入：新的 battleId、場上沒有甲的武將",
      s2.battleId !== s1.battleId && s2.heroes.length === 0,
      { before: s1.battleId, after: s2.battleId, heroes: s2.heroes }
    );
    const menuNames = async () => {
      const pt = await p.evaluate(
        ({ c, r }) => {
          const e = window.__testBridge.engine;
          const w = e.gameMap.gridToWorld(c, r);
          const rect = e.canvas.getBoundingClientRect();
          return { x: rect.left + w.x, y: rect.top + w.y };
        },
        { c: ROAD_CELLS[8][0], r: ROAD_CELLS[8][1] }
      );
      await p.mouse.click(pt.x, pt.y);
      const menu = p.locator('[data-testid="placement-menu"]');
      await until(() => menu.isVisible(), 5000);
      const t = (await menu.count()) ? await menu.innerText() : "";
      await p.keyboard.press("Escape");
      await menu
        .locator("button", { hasText: "×" })
        .first()
        .click()
        .catch(() => {});
      await until(async () => (await menu.count()) === 0, 5000);
      return t;
    };
    const names = await menuNames();
    check(
      "乙的部署選單只有劉備（沒有甲的馬超）",
      /劉備/.test(names) && !/馬超/.test(names),
      names
    );
    const d2 = await deployHero(p, ROAD_CELLS[4], "劉備");
    const s3 = await fieldOf(p);
    check(
      "乙部署劉備：部署資料與實例都是防禦光環 1.2",
      d2.ok &&
        sameJson(
          lastState(s3),
          wantPayload("hero_liu_bei", 1, 0, 105, 80, 1600)
        ) &&
        sameJson(heroVec(s3), [["hero_liu_bei", wantFields("hero_liu_bei")]]),
      { d2, s3 }
    );
    check("沒有任何寫入", E.gas.writes().length === 0, E.gas.writes());
    return E;
  });

  // ═══ 24. 備戰重新載入清「已在場上」的名單；部署費用（派武將免費、建塔照原價）；武將名冊的技能說明 ═══
  // 備戰中每次重新載入（改隊伍、換帳號、後端設定較晚到、選關、重新挑戰）場上的武將都換新，部署選單的名單要一起清掉；
  // 戰鬥中改隊伍、升級這類不相關的更新不重新載入，已部署的武將仍是原本的實例、選單上仍是「已在場上」。
  // 部署費用：派武將不花戰場金幣（和 Godot 版相同），建塔與升級照原價，世界金幣不變；不驗收戰鬥。
  // 名冊的 13 段技能名稱與完整說明寫死（照正式技能表 describeHeroSkill 不帶目前射程與攻擊力的原文手寫），不由頁面或技能表產生。
  /** 畫布上某一格的螢幕座標（玩法提示擋住時先收起） */
  async function cellPoint(p, [col, row]) {
    const at = () =>
      p.evaluate(
        ({ c, r }) => {
          const e = window.__testBridge.engine;
          const w = e.gameMap.gridToWorld(c, r);
          const rect = e.canvas.getBoundingClientRect();
          const x = rect.left + w.x;
          const y = rect.top + w.y;
          const el = document.elementFromPoint(x, y);
          return {
            x,
            y,
            onCanvas: el === e.canvas,
            canPlace: e.gameMap.canPlaceHero(c, r),
          };
        },
        { c: col, r: row }
      );
    let pt = await at();
    const tips = p.locator('button[aria-label="收起玩法提示"]');
    if (!pt.onCanvas && (await tips.count())) {
      await tips.first().click();
      await sleep(300);
      pt = await at();
    }
    return pt;
  }
  const PLACEMENT_MENU = '[data-testid="placement-menu"]';
  async function closePlacementMenu(p) {
    const menu = p.locator(PLACEMENT_MENU);
    await menu
      .locator("button", { hasText: "×" })
      .first()
      .click()
      .catch(() => {});
    return until(async () => (await menu.count()) === 0, 5000);
  }
  /** 點一個空的道路格打開部署選單，讀某位武將卡片的狀態後關掉（不部署） */
  async function menuCard(p, cell, name) {
    const pt = await cellPoint(p, cell);
    if (!pt.onCanvas || !pt.canPlace) return { ok: false, step: "cell", pt };
    await p.mouse.click(pt.x, pt.y);
    const menu = p.locator(PLACEMENT_MENU);
    if (!(await until(() => menu.isVisible(), 5000)))
      return { ok: false, step: "menu" };
    const card = menu.locator("button", { hasText: name });
    const r = (await card.count())
      ? {
          ok: true,
          disabled: await card.first().isDisabled(),
          text: (await card.first().innerText()).replace(/\s+/g, " ").trim(),
        }
      : { ok: false, step: "card", menu: await menu.innerText() };
    await closePlacementMenu(p);
    return r;
  }
  /** 目前地圖上可以放武將、點得到畫布本身的道路格（建築位的選單預設是防禦塔，不用） */
  const roadCellsOf = (p) =>
    p.evaluate(() => {
      const e = window.__testBridge.engine;
      const m = e.gameMap;
      const rect = e.canvas.getBoundingClientRect();
      const out = [];
      for (let r = 0; r < m.rows; r++)
        for (let c = 0; c < m.cols; c++) {
          if (m.getTileType(c, r) !== 1 || !m.canPlaceHero(c, r)) continue;
          const w = m.gridToWorld(c, r);
          if (
            document.elementFromPoint(rect.left + w.x, rect.top + w.y) ===
            e.canvas
          )
            out.push([c, r]);
        }
      return out;
    });
  const markFirstHero = (p) =>
    p.evaluate(() => {
      const h = window.__testBridge.engine.heroes[0];
      if (h) h.__mark = "before";
      return !!h;
    });
  /** 換到下一場（battleId 和 before 不同）並等它穩定 */
  async function nextBattle(p, before) {
    const changed = await until(async () => {
      const b = await bm(p, "battleId");
      return b && b !== before ? b : null;
    }, 15000);
    await stableBattle(p);
    return changed;
  }
  const isSkillMap = (p) =>
    p.evaluate(() => {
      const m = window.__testBridge && window.__testBridge.engine.gameMap;
      return !!m && m.basePos.col === 13 && m.basePos.row === 3;
    });
  const guestStorage = (heroes, team, extra = {}) => ({
    shenma_js_guest_active: "1",
    shenma_js_guest_state: JSON.stringify({
      ...JSON.parse(GUEST_SAVE(heroes, team)),
      ...extra,
    }),
  });
  const GUEST_13 = DEFAULT_SORTIE.map(([id]) => ({
    hero_id: id,
    level: 1,
    star: 1,
    atk: 100,
    def: 50,
    hp: 1000,
  }));
  async function enterGuest(p) {
    return until(
      async () =>
        (await p.locator('button[aria-label="主公資訊"]').count()) > 0 &&
        (await p.locator('[data-testid="key-setup"]').count()) === 0,
      20000
    );
  }
  async function switchKey(p, key, nick) {
    await openInfo(p);
    await p.locator("button", { hasText: "切換金鑰" }).click();
    await modal(p).locator('input[placeholder^="例"]').fill(key);
    await modal(p).locator("button", { hasText: "確認切換" }).click();
    const ok = await until(
      async () =>
        (await text(p, '[data-testid="player-info-nickname"]')) === nick,
      10000
    );
    await closeModal(p);
    return ok;
  }

  await scenario(
    "備戰重新載入：改隊伍保留馬超後，名單清掉、馬超可以再部署",
    async (mk) => {
      const data = NEW({
        capacity: 20,
        heroes: [
          { hero_id: "ma_chao", level: 3, star: 0, atk: 0, def: 0, hp: 0 },
        ],
        team: [
          { hero_id: "ma_chao", slot: 1 },
          { hero_id: "zhao_yun", slot: 2 },
        ],
      });
      const E = await mk({
        seed: [{ key: "k_w6a", data, rev: 4 }],
        maps: SKILL_MAPS,
        enemies: ENEMIES,
      });
      const p = await E.page({ storage: { shenma_player_key: "k_w6a" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      check("可以觀測部署資料", await watchPlacements(p));
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      const s1 = await fieldOf(p);
      const c1 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "部署馬超後，選單上的馬超是「已在場上」且不能點",
        d1.ok &&
          s1.heroes.length === 1 &&
          c1.ok &&
          c1.disabled &&
          /已在場上/.test(c1.text),
        { d1, c1 }
      );
      await openTeam(p);
      check("選得到黃忠", await pickTeamHero(p, "黃忠"));
      await p.locator('[data-testid="team-edit-save"]').click();
      await until(async () => (await modal(p).count()) === 0, 10000);
      const saves = E.gas.log.filter((e) => e.action === "save_profile");
      check(
        "改隊伍保存一次，隊伍仍有馬超（馬超／趙雲／黃忠）",
        saves.length === 1 &&
          sameJson(saves[0].payload.data.team.map((t) => t.hero_id).sort(), [
            "huang_zhong",
            "ma_chao",
            "zhao_yun",
          ]),
        saves.map((e) => e.payload)
      );
      const bid = await nextBattle(p, s1.battleId);
      const s2 = await fieldOf(p);
      check(
        "改隊伍後重新載入：新的 battleId，原本的馬超實例已不在場上",
        !!bid && s2.battleId !== s1.battleId && s2.heroes.length === 0,
        { before: s1.battleId, after: s2.battleId, heroes: s2.heroes }
      );
      const c2 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "重新載入後選單上的馬超不是「已在場上」、可以點（Lv.3）",
        c2.ok &&
          !c2.disabled &&
          !/已在場上/.test(c2.text) &&
          /Lv\.3/.test(c2.text),
        c2
      );
      const d2 = await deployHero(p, ROAD_CELLS[6], "馬超");
      const s3 = await fieldOf(p);
      check(
        "馬超可以再部署：部署資料照存檔（0 照樣是 0）與正式技能，場上只有這一位馬超",
        d2.ok &&
          sameJson(lastState(s3), wantPayload("hero_ma_chao", 3, 0, 0, 0, 0)) &&
          sameJson(heroVec(s3), [["hero_ma_chao", wantFields("hero_ma_chao")]]),
        { d2, s3 }
      );
      const c3 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check("再部署後馬超又是「已在場上」", c3.ok && c3.disabled, c3);
      return E;
    }
  );

  await scenario(
    "備戰重新載入：換帳號後兩邊都有的馬超可以再部署",
    async (mk) => {
      const E = await mk({
        seed: [
          {
            key: "k_w6b1",
            data: NEW({
              nickname: "甲",
              team: [{ hero_id: "ma_chao", slot: 1 }],
            }),
            rev: 1,
          },
          {
            key: "k_w6b2",
            data: NEW({
              nickname: "乙",
              heroes: [
                {
                  hero_id: "ma_chao",
                  level: 4,
                  star: 1,
                  atk: 170,
                  def: 75,
                  hp: 1600,
                },
              ],
              team: [
                { hero_id: "ma_chao", slot: 1 },
                { hero_id: "liu_bei", slot: 2 },
              ],
            }),
            rev: 3,
          },
        ],
        maps: SKILL_MAPS,
        enemies: ENEMIES,
      });
      const p = await E.page({ storage: { shenma_player_key: "k_w6b1" } });
      check("讀到甲", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      check("可以觀測部署資料", await watchPlacements(p));
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      const s1 = await fieldOf(p);
      const c1 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "甲部署馬超後，選單上的馬超是「已在場上」",
        d1.ok &&
          sameJson(
            lastState(s1),
            wantPayload("hero_ma_chao", 1, 0, 130, 60, 1300)
          ) &&
          c1.ok &&
          c1.disabled,
        { d1, c1 }
      );
      check("切換到乙", await switchKey(p, "k_w6b2", "乙"));
      const bid = await nextBattle(p, s1.battleId);
      const s2 = await fieldOf(p);
      check(
        "換帳號後重新載入：新的 battleId，甲的馬超實例已不在場上",
        !!bid && s2.heroes.length === 0,
        { before: s1.battleId, after: s2.battleId, heroes: s2.heroes }
      );
      const c2 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "乙的選單上馬超不是「已在場上」、是乙的等級（Lv.4）",
        c2.ok && !c2.disabled && /Lv\.4/.test(c2.text),
        c2
      );
      const d2 = await deployHero(p, ROAD_CELLS[4], "馬超");
      const s3 = await fieldOf(p);
      check(
        "乙部署馬超：部署資料是乙的數值與正式技能，場上只有乙的馬超",
        d2.ok &&
          sameJson(
            lastState(s3),
            wantPayload("hero_ma_chao", 4, 1, 170, 75, 1600)
          ) &&
          sameJson(heroVec(s3), [["hero_ma_chao", wantFields("hero_ma_chao")]]),
        { d2, s3 }
      );
      check("沒有任何寫入", E.gas.writes().length === 0, E.gas.writes());
      return E;
    }
  );

  await scenario(
    "備戰重新載入：後端設定較晚到，重新載入時清名單並關掉開著的部署選單",
    async (mk) => {
      const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
      const hold = E.gas.rule("get_all_maps", "hold");
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      check(
        "後端關卡設定還沒回應（暫停中）",
        await until(() => hold.waiting.length > 0, 15000)
      );
      const bid0 = await stableBattle(p);
      check(
        "目前是內建的關卡（還不是接線測試關）",
        !!bid0 && !(await isSkillMap(p))
      );
      check("可以觀測部署資料", await watchPlacements(p));
      const cells = await roadCellsOf(p);
      const d1 = await deployHero(p, cells[0], "馬超");
      const c1 = await menuCard(p, cells[2], "馬超");
      check(
        "內建關卡上部署馬超後，選單上的馬超是「已在場上」",
        cells.length > 3 && d1.ok && c1.ok && c1.disabled,
        { cells: cells.length, d1, c1 }
      );
      // 部署選單開著的時候設定到了：選單指向上一場的格子，要一起關掉
      const pt = await cellPoint(p, cells[2]);
      await p.mouse.click(pt.x, pt.y);
      const menu = p.locator(PLACEMENT_MENU);
      check("部署選單開著", await until(() => menu.isVisible(), 5000));
      check("放行後端關卡設定", hold.release("ok") === 1);
      const bid1 = await nextBattle(p, bid0);
      const s2 = await fieldOf(p);
      check(
        "設定到達後重新載入：新的 battleId、換成接線測試關、場上沒有武將",
        !!bid1 && (await isSkillMap(p)) && s2.heroes.length === 0,
        { bid0, bid1, heroes: s2.heroes }
      );
      check(
        "重新載入時開著的部署選單已關掉",
        (await menu.count()) === 0,
        await menu.count()
      );
      const c2 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "重新載入後選單上的馬超可以點",
        c2.ok && !c2.disabled && !/已在場上/.test(c2.text),
        c2
      );
      const d2 = await deployHero(p, ROAD_CELLS[2], "馬超");
      const s3 = await fieldOf(p);
      check(
        "馬超可以再部署：部署資料是訪客預設的馬超與正式技能",
        d2.ok &&
          sameJson(
            lastState(s3),
            wantPayload("hero_ma_chao", 3, 1, 120, 60, 1200)
          ) &&
          sameJson(heroVec(s3), [["hero_ma_chao", wantFields("hero_ma_chao")]]),
        { d2, s3 }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario("備戰重新載入：選關與重新挑戰後都可以再部署", async (mk) => {
    const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
    const p = await E.page({
      storage: guestStorage(GUEST_13, [], {
        max_stage: "chapter1_2",
        cleared_stages: { chapter1_1: 3 },
      }),
    });
    check("以訪客進入", await enterGuest(p));
    await waitRemoteStage(p, E);
    check("可以觀測部署資料", await watchPlacements(p));
    const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
    const c1 = await menuCard(p, ROAD_CELLS[8], "馬超");
    check("部署馬超後是「已在場上」", d1.ok && c1.ok && c1.disabled, {
      d1,
      c1,
    });
    const bid0 = await bm(p, "battleId");
    await p.locator('button[title="切換關卡"]').click();
    await until(() => modal(p).isVisible(), 10000);
    const go = modal(p)
      .locator(".card", { hasText: "接線測試第2關" })
      .locator("button", { hasText: "開赴戰場" });
    check("選關視窗有第 2 關的「開赴戰場」", (await go.count()) === 1);
    await go.first().click();
    await until(async () => (await modal(p).count()) === 0, 10000);
    const bid1 = await nextBattle(p, bid0);
    const s1 = await fieldOf(p);
    check(
      "選關後載入第 2 關：新的 battleId、場上沒有武將",
      !!bid1 &&
        (await bm(p, "stage")) === "chapter1_2" &&
        s1.heroes.length === 0,
      { bid0, bid1, stage: await bm(p, "stage"), heroes: s1.heroes }
    );
    const c2 = await menuCard(p, ROAD_CELLS[8], "馬超");
    check("選關後選單上的馬超可以點", c2.ok && !c2.disabled, c2);
    const d2 = await deployHero(p, ROAD_CELLS[2], "馬超");
    check(
      "選關後馬超可以再部署",
      d2.ok && (await fieldOf(p)).heroes.length === 1,
      d2
    );
    check("開戰", await startBattle(p));
    check("受控的落敗結束", (await endWith(p, { win: false })) === "ok");
    const retry = p.locator('[data-testid="result-overlay"] button', {
      hasText: "重新挑戰",
    });
    check(
      "結算畫面有「重新挑戰」",
      await until(() => retry.isVisible(), 10000)
    );
    const bid2 = await bm(p, "battleId");
    await retry.click();
    const bid3 = await nextBattle(p, bid2);
    const s3 = await fieldOf(p);
    check(
      "重新挑戰：新的 battleId、回到備戰、場上沒有武將",
      !!bid3 && (await bm(p, "state")) === 1 && s3.heroes.length === 0,
      { bid2, bid3, state: await bm(p, "state"), heroes: s3.heroes }
    );
    const c3 = await menuCard(p, ROAD_CELLS[8], "馬超");
    check("重新挑戰後選單上的馬超可以點", c3.ok && !c3.disabled, c3);
    const d3 = await deployHero(p, ROAD_CELLS[2], "馬超");
    const s4 = await fieldOf(p);
    check(
      "重新挑戰後馬超可以再部署：部署資料是訪客預設的馬超與正式技能",
      d3.ok &&
        sameJson(
          lastState(s4),
          wantPayload("hero_ma_chao", 3, 1, 120, 60, 1200)
        ) &&
        s4.heroes.length === 1,
      { d3, s4 }
    );
    return E;
  });

  await scenario(
    "不相關的更新不清名單：訪客備戰中升級（沒有隊伍）",
    async (mk) => {
      const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      check("可以觀測部署資料", await watchPlacements(p));
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("部署馬超並標記實例", d1.ok && (await markFirstHero(p)), d1);
      const bid0 = await bm(p, "battleId");
      await openRoster(p);
      await p.locator('[data-testid="hero-upgrade"]').click();
      check(
        "訪客升級馬超（Lv.1 → Lv.2）",
        await until(
          async () => /Lv\.2/.test((await rosterCard(p, "馬超")) || ""),
          5000
        ),
        await rosterCard(p, "馬超")
      );
      await closeModal(p);
      await sleep(1000);
      const s = await fieldOf(p);
      check(
        "升級後沒有重新載入：同一個 battleId、馬超是原本的實例",
        s.battleId === bid0 &&
          s.heroes.length === 1 &&
          s.heroes[0].mark === "before",
        { bid0, s }
      );
      const c = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "升級後選單上的馬超仍是「已在場上」且不能點",
        c.ok && c.disabled && /已在場上/.test(c.text),
        c
      );
      return E;
    }
  );

  await scenario("不相關的更新不清名單：戰鬥中升級與改隊伍", async (mk) => {
    const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
    const p = await E.page({
      storage: guestStorage(
        [
          {
            hero_id: "hero_ma_chao",
            level: 2,
            star: 1,
            atk: 115,
            def: 58,
            hp: 1120,
          },
          {
            hero_id: "hero_zhou_yu",
            level: 1,
            star: 1,
            atk: 105,
            def: 55,
            hp: 1080,
          },
        ],
        [{ slot: 0, hero_id: "hero_ma_chao" }]
      ),
    });
    check("以訪客進入", await enterGuest(p));
    await waitRemoteStage(p, E);
    check("可以觀測部署資料", await watchPlacements(p));
    const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
    check("開戰前部署馬超", d1.ok, d1);
    check("按進入戰場開戰", await startBattle(p));
    // 暫停：讓這一場停在戰鬥中（不因敵人被打完而結束）
    await p.locator("button", { hasText: "⏸ 暫停" }).first().click();
    check(
      "暫停後仍在戰鬥中",
      await until(
        async () =>
          (await bm(p, "state")) === 2 &&
          (await p.locator("button", { hasText: "▶ 繼續" }).count()) > 0,
        5000
      )
    );
    check("標記馬超的實例", await markFirstHero(p));
    const bid = await bm(p, "battleId");
    await openRoster(p);
    await p.locator('[data-testid="hero-upgrade"]').click();
    check(
      "戰鬥中訪客升級馬超（Lv.2 → Lv.3）",
      await until(
        async () => /Lv\.3/.test((await rosterCard(p, "馬超")) || ""),
        5000
      ),
      await rosterCard(p, "馬超")
    );
    await closeModal(p);
    await sleep(800);
    const s1 = await fieldOf(p);
    const c1 = await menuCard(p, ROAD_CELLS[8], "馬超");
    check(
      "升級後：同一個 battleId、馬超是原本的實例，選單上仍是「已在場上」",
      s1.battleId === bid &&
        s1.heroes.length === 1 &&
        s1.heroes[0].mark === "before" &&
        c1.ok &&
        c1.disabled,
      { bid, s1, c1 }
    );
    await openTeam(p);
    check("戰鬥中選得到周瑜", await pickTeamHero(p, "周瑜"));
    await p.locator('[data-testid="team-edit-save"]').click();
    await until(async () => (await modal(p).count()) === 0, 10000);
    await sleep(800);
    const s2 = await fieldOf(p);
    const c2 = await menuCard(p, ROAD_CELLS[8], "馬超");
    const c2z = await menuCard(p, ROAD_CELLS[8], "周瑜");
    check(
      "改隊伍後：同一個 battleId、馬超是原本的實例，馬超仍是「已在場上」、新加的周瑜可以點",
      s2.battleId === bid &&
        s2.heroes.length === 1 &&
        s2.heroes[0].mark === "before" &&
        c2.ok &&
        c2.disabled &&
        c2z.ok &&
        !c2z.disabled,
      { bid, s2, c2, c2z }
    );
    check("仍在戰鬥中", (await bm(p, "state")) === 2);
    return E;
  });

  // 部署費用：派武將不花戰場金幣（和 Godot 版 Main._place_hero 相同）；建塔與升級照原價、金幣不足仍不能建或升級。
  // 前置條件用引擎自己的 spendGold／earnGold 調整這一場的戰場金幣（不是自然實戰，也不改世界存檔）
  const fieldGold = (p, guest) =>
    p.evaluate((g) => {
      const b = window.__testBridge.engine.battleManager;
      const hud = document.querySelector('[class*="hudRight"]');
      const s = hud && hud.querySelector('[class*="hudStat"]');
      return {
        battle: b.battleGold,
        hud: s ? s.innerText.replace(/\s+/g, "") : null,
        world: g
          ? JSON.parse(localStorage.getItem("shenma_js_guest_state")).gold
          : null,
      };
    }, guest);
  const goldText = (n) => `🪙${n.toLocaleString("en-US")}`;
  const setFieldGold = (p, target) =>
    p.evaluate((t) => {
      const b = window.__testBridge.engine.battleManager;
      const d = t - b.battleGold;
      if (d < 0) b.spendGold(-d);
      else if (d > 0) b.earnGold(d);
      return b.battleGold;
    }, target);
  /** 點建築位打開部署選單，建某一種塔（卡片停用時回報 card-disabled，不點） */
  async function buildTower(p, cell, name) {
    const pt = await cellPoint(p, cell);
    if (!pt.onCanvas || !pt.canPlace) return { ok: false, step: "cell", pt };
    await p.mouse.click(pt.x, pt.y);
    const menu = p.locator(PLACEMENT_MENU);
    if (!(await until(() => menu.isVisible(), 5000)))
      return { ok: false, step: "menu" };
    const cards = menu.locator("button", { hasText: "💰" });
    const allDisabled = await cards.evaluateAll((bs) =>
      bs.map((b) => b.disabled)
    );
    const card = menu.locator("button", { hasText: name });
    if ((await card.count()) === 0) {
      const t = await menu.innerText();
      await closePlacementMenu(p);
      return { ok: false, step: "card", menu: t };
    }
    if (await card.first().isDisabled()) {
      await closePlacementMenu(p);
      return { ok: false, step: "card-disabled", allDisabled };
    }
    await card.first().click();
    const closed = await until(async () => (await menu.count()) === 0, 5000);
    return { ok: !!closed, step: closed ? "built" : "menu-open", allDisabled };
  }
  /** 點已建的塔打開升級面板 */
  async function towerPanel(p, cell) {
    const pt = await cellPoint(p, cell);
    if (!pt.onCanvas) return null;
    await p.mouse.click(pt.x, pt.y);
    const panel = p.locator('[data-testid="upgrade-panel"]');
    return (await until(() => panel.isVisible(), 5000)) ? panel : null;
  }
  const towersOf = (p) =>
    p.evaluate(() =>
      window.__testBridge.engine.towers.map((t) => ({
        type: t.towerTypeKey,
        level: t.towerLevel,
        cell: [t.gridCell.col, t.gridCell.row],
      }))
    );
  const BUILD_CELL = [2, 1];

  await scenario(
    "部署費用（免費）：派武將不花戰場金幣，5000／100／99／0 都能派不同武將；建塔與升級照原價；提示和 Godot 版相同",
    async (mk) => {
      const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      await p.locator('button[title="玩法提示"]').click();
      const tips = p.locator('section[aria-label="玩法提示"]');
      check("玩法提示打開", await until(() => tips.isVisible(), 5000));
      const items = (await tips.locator("li").allInnerTexts()).map((t) =>
        t.trim()
      );
      const tipNote = (await tips.locator("p").first().innerText()).trim();
      check(
        "部署那一句寫派武將不花金幣（和 Godot 版的提示同一句），整份提示沒有「100」",
        items[0] ===
          "點地圖上的道路或建築位，從選單派出隊伍裡的武將（不花金幣）。" &&
          !/100/.test(await tips.innerText()),
        items
      );
      check(
        "其他兩條與戰場金幣／世界金幣的說明原樣",
        items.length === 3 &&
          items[1] ===
            "在建築位用這一場的戰場金幣建造防禦塔，點選已建的塔可以升級；擊倒敵人會再得到金幣。" &&
          items[2] ===
            "準備好後按「迎戰」開始下一波。敵人走到終點會扣城防，城防歸零就落敗。" &&
          tipNote ===
            "戰場金幣每一場開始時重新發放、只在戰場內使用；升級武將用的是存檔裡的世界金幣，兩者不同。",
        { items, tipNote }
      );
      await p.locator('button[aria-label="收起玩法提示"]').click();
      // 武將升級的世界金幣與費用（部署前）
      await openRoster(p);
      const roster0 = await modal(p).innerText();
      await closeModal(p);
      check("可以觀測部署資料", await watchPlacements(p));
      const g0 = await fieldGold(p, true);
      check(
        "開始時：戰場金幣 5000（畫面同步），世界金幣是存檔的 1500",
        g0.battle === 5000 && g0.hud === goldText(5000) && g0.world === 1500,
        g0
      );
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      const g1 = await fieldGold(p, true);
      check(
        "戰場金幣 5000 時派馬超：成功，戰場金幣仍是 5000（畫面同步），世界金幣不變",
        d1.ok &&
          (await fieldOf(p)).heroes.length === 1 &&
          g1.battle === 5000 &&
          g1.hud === goldText(5000) &&
          g1.world === 1500,
        { d1, g1 }
      );
      // 引擎層：占用與無效的格子派不出去，也不扣
      const bad = await p.evaluate(
        ({ occ }) => {
          const e = window.__testBridge.engine;
          const st = {
            hero_id: "hero_zhou_yu",
            level: 1,
            star: 1,
            atk: 135,
            def: 55,
            hp: 1000,
          };
          const a = e.placeHero(occ[0], occ[1], st);
          const b = e.placeHero(0, 0, st);
          return {
            occupied: a,
            invalid: b,
            gold: e.battleManager.battleGold,
            heroes: e.heroes.length,
          };
        },
        { occ: ROAD_CELLS[2] }
      );
      check(
        "引擎層：已占用的格子與不能放的格子都派不出去，戰場金幣不變",
        bad.occupied === false &&
          bad.invalid === false &&
          bad.gold === 5000 &&
          bad.heroes === 1,
        bad
      );
      const steps = [];
      let placed = 1;
      for (const [gold, cell, name, id, lv, st, a, d, h] of [
        [100, ROAD_CELLS[4], "趙雲", "hero_zhao_yun", 3, 1, 110, 65, 1150],
        [99, ROAD_CELLS[6], "關羽", "hero_guan_yu", 4, 2, 150, 75, 1500],
        [0, ROAD_CELLS[8], "張飛", "hero_zhang_fei", 3, 1, 140, 70, 1450],
      ]) {
        const set = await setFieldGold(p, gold);
        const r = await deployHero(p, cell, name);
        const s = await fieldOf(p);
        const g = await fieldGold(p, true);
        placed += 1;
        steps.push({ gold, set, r, g, last: lastState(s) });
        check(
          `戰場金幣 ${gold} 時派${name}：成功，戰場金幣仍是 ${gold}（畫面同步），部署資料是訪客預設的${name}與正式技能`,
          set === gold &&
            r.ok &&
            s.heroes.length === placed &&
            s.heroes.some((x) => x.heroId === id) &&
            g.battle === gold &&
            g.hud === goldText(gold) &&
            g.world === 1500 &&
            sameJson(lastState(s), wantPayload(id, lv, st, a, d, h)),
          { set, r, g, last: lastState(s) }
        );
      }
      check(
        "四位都在場上（部署紀錄 6 筆：4 次成功、2 次引擎層的無效嘗試）",
        (await fieldOf(p)).heroes.length === 4 &&
          (await fieldOf(p)).log.length === 6,
        await fieldOf(p)
      );
      // 建塔仍照原價：0 金幣時塔都不能建；補到 50 剛好建弓兵塔，扣 50
      const t0 = await buildTower(p, BUILD_CELL, "弓兵塔");
      check(
        "戰場金幣 0：建築位的五種防禦塔都不能建（卡片停用）",
        !t0.ok &&
          t0.step === "card-disabled" &&
          Array.isArray(t0.allDisabled) &&
          t0.allDisabled.length === 5 &&
          t0.allDisabled.every(Boolean),
        t0
      );
      await setFieldGold(p, 50);
      const t1 = await buildTower(p, BUILD_CELL, "弓兵塔");
      const g2 = await fieldGold(p, true);
      check(
        "戰場金幣 50：建弓兵塔成功，扣 50 變 0",
        t1.ok &&
          g2.battle === 0 &&
          g2.hud === goldText(0) &&
          sameJson(await towersOf(p), [
            { type: "archer", level: 1, cell: BUILD_CELL },
          ]),
        { t1, g2, towers: await towersOf(p) }
      );
      // 升級仍照原價：49 不能升（按鈕停用），補到 50 升級成功、扣 50
      await setFieldGold(p, 49);
      let panel = await towerPanel(p, BUILD_CELL);
      const up0 = panel
        ? await panel.locator("button", { hasText: "升級" }).first()
        : null;
      const up0State = up0
        ? { disabled: await up0.isDisabled(), text: await up0.innerText() }
        : null;
      check(
        "戰場金幣 49：升級弓兵塔的按鈕停用（升級費 50）",
        !!up0State && up0State.disabled && /50/.test(up0State.text),
        up0State
      );
      if (panel)
        await panel
          .locator("button", { hasText: "×" })
          .first()
          .click()
          .catch(() => {});
      await setFieldGold(p, 50);
      panel = await towerPanel(p, BUILD_CELL);
      if (panel)
        await panel.locator("button", { hasText: "升級" }).first().click();
      await sleep(300);
      const g3 = await fieldGold(p, true);
      check(
        "戰場金幣 50：升級弓兵塔成功，扣 50 變 0、塔 Lv.2",
        !!panel &&
          g3.battle === 0 &&
          sameJson(await towersOf(p), [
            { type: "archer", level: 2, cell: BUILD_CELL },
          ]),
        { g3, towers: await towersOf(p) }
      );
      if (panel)
        await panel
          .locator("button", { hasText: "×" })
          .first()
          .click()
          .catch(() => {});
      // 武將升級的世界金幣與費用不變
      await openRoster(p);
      const roster1 = await modal(p).innerText();
      await closeModal(p);
      const costOf = (t) => (t.match(/升級需耗費:\s*🪙\s*(\d+)/) || [])[1];
      check(
        "部署之後：名冊的世界金幣仍是 1,500、馬超的升級費不變",
        /當前世界金幣:\s*🪙\s*1,500/.test(roster1) &&
          !!costOf(roster0) &&
          costOf(roster0) === costOf(roster1),
        { before: costOf(roster0), after: costOf(roster1) }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "部署費用（免費）：共用帳號派武將不扣戰場金幣、不寫存檔，世界金幣與隊伍 Cost 不變",
    async (mk) => {
      const data = NEW({
        capacity: 20,
        gold: 500,
        team: [
          { hero_id: "ma_chao", slot: 1 },
          { hero_id: "zhao_yun", slot: 2 },
        ],
      });
      const E = await mk({
        seed: [{ key: "k_free", data, rev: 3 }],
        maps: SKILL_MAPS,
        enemies: ENEMIES,
      });
      const p = await E.page({ storage: { shenma_player_key: "k_free" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      await openTeam(p);
      const cost0 = await text(p, '[data-testid="team-edit-cost"]');
      await closeModal(p);
      check("可以觀測部署資料", await watchPlacements(p));
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      const g1 = await fieldGold(p, false);
      check(
        "戰場金幣 5000 時派馬超：成功，戰場金幣仍是 5000（畫面同步）",
        d1.ok &&
          (await fieldOf(p)).heroes.length === 1 &&
          g1.battle === 5000 &&
          g1.hud === goldText(5000),
        { d1, g1 }
      );
      await setFieldGold(p, 0);
      const d2 = await deployHero(p, ROAD_CELLS[4], "趙雲");
      const s2 = await fieldOf(p);
      const g2 = await fieldGold(p, false);
      check(
        "戰場金幣 0 時派趙雲：成功，戰場金幣仍是 0，部署資料是存檔的趙雲（後端基礎值）與正式技能",
        d2.ok &&
          s2.heroes.length === 2 &&
          s2.heroes.some((x) => x.heroId === "hero_zhao_yun") &&
          g2.battle === 0 &&
          g2.hud === goldText(0) &&
          sameJson(
            lastState(s2),
            wantPayload("hero_zhao_yun", 1, 0, 120, 60, 1300)
          ),
        { d2, g2, last: lastState(s2) }
      );
      await openTeam(p);
      const cost1 = await text(p, '[data-testid="team-edit-cost"]');
      await closeModal(p);
      check(
        "隊伍 Cost 不變（9 / 20）",
        !!cost0 && cost0 === cost1 && /^9 \/ 20/.test(cost0),
        { cost0, cost1 }
      );
      const back = readBack(E, "k_free");
      check(
        "沒有任何寫入；雲端存檔的世界金幣 500 與隊伍原樣、版本仍是 3",
        E.gas.writes().length === 0 &&
          !!back &&
          back.rev === 3 &&
          back.data.gold === 500 &&
          sameJson(back.data.team, data.team),
        { writes: E.gas.writes(), back }
      );
      return E;
    }
  );

  // 名冊的 13 段技能名稱與完整說明（寫死）
  const ROSTER_SKILL = {
    hero_ma_chao: [
      "衝鋒",
      "每場戰鬥中，第一次命中敵人的普通攻擊造成 2 倍傷害（武將上方會出現金色的「x2!」），之後恢復普通攻擊。沒有目標時不會用掉；同一場戰鬥裡換波次、移動位置、調整隊伍或移除後重新放置都不會再觸發，切換關卡或重新開始才會重置。",
    ],
    hero_zhao_yun: [
      "閃避",
      "敵人攻擊這位武將時（目前是被武將擋在路上的敵人），每一擊有 15% 的機率閃避：這一擊不扣血，武將上方出現藍白色的「MISS」；沒有閃避時照原本的防禦計算扣血。每一擊各自判定，沒有冷卻、不會疊加；閃避不會讓敵人馬上再打一次，敵人的攻擊間隔照常。升級、移動位置、換波次都維持同樣的機率。只在戰場生效，不影響存檔。",
    ],
    hero_guan_yu: [
      "減速光環",
      "戰鬥中，以這位武將為中心、目前射程內（含邊界）的所有地面敵人移動速度降低 10%（變成原本的 90%）。範圍跟著射程：升級射程變長時範圍一起變大。不需要普通攻擊的目標，也不改變普通攻擊的傷害與攻擊間隔。飛行敵人與免疫減速的敵人不受影響（普通攻擊照常打得到地面上免疫減速的敵人）。敵人離開範圍，或武將移位、被移除、陣亡時減速就解除；和其他減速（武將在道路上的阻擋、步兵塔、另一個減速光環）同時作用時取最強的一個，不會疊加，文士塔的減速另外計算。戰鬥中武將周圍會顯示淺藍色的範圍圈，被減速的敵人有淺藍色的虛線外圈。只在戰場生效，不影響存檔。",
    ],
    hero_zhang_fei: [
      "暈眩",
      "每次普通攻擊命中、而且敵人被打後還活著時，這個敵人暈眩 0.5 秒（遊戲時間）：暈眩中停止移動，也不能攻擊擋住它的武將，但照常受到傷害、可以被打倒。再次命中時剩餘時間刷新成 0.5 秒，不會累加；已經有更長的暈眩時不會縮短。普通攻擊的傷害與攻擊間隔不變，沒有機率、不波及其他敵人；打倒敵人的那一擊與灼燒都不會引發暈眩。暈眩不是減速：免疫減速的敵人也會暈眩；暈眩期間減速與灼燒照常計時，結束後恢復當時的移動速度，敵人的攻擊冷卻照常倒數但不會累積，恢復後最多先打一下。這位武將移位、被移除或陣亡時，已經造成的暈眩照樣持續到時間結束；暈眩不會讓武將打得到原本打不到的敵人（步兵打不到飛行敵人）。暈眩中的敵人頭上有轉動的黃色星星。只在戰場生效，不影響存檔。",
    ],
    hero_zhou_yu: [
      "火攻",
      "每次普通攻擊命中後，敵人開始灼燒：每 1 秒受到一次傷害，共 3 次，每次是命中當下攻擊力的 20%（第一次在命中 1 秒後），普通攻擊的傷害不變。同一個敵人只有一份灼燒：再次命中時剩餘次數回到 3 次、傷害換成這次命中的攻擊力，不會疊加，下一次灼燒的時間也不會重新計算。敵人離開射程或武將被移除後仍會燒完；敵人被打倒或抵達基地就停止，灼燒不會再引發火攻。灼燒中的敵人有橘色外圈，灼燒的傷害數字是橘色。只在戰場生效，不影響存檔。",
    ],
    hero_huang_zhong: [
      "百步穿楊",
      "戰場上的有效射程是屬性射程的 1.5 倍，等級提升的射程成長也一起乘上 1.5 倍；普通攻擊的傷害與攻擊間隔不變。只在戰場生效，存檔與屬性表的「範圍」仍是原本的數值；在戰場選取武將時，射程圈顯示的是實際射程。移動位置、調整隊伍或重新放置都不會重複加成。",
    ],
    hero_liu_bei: [
      "防禦光環",
      "戰鬥中，以這位武將為中心、目前射程內（含邊界）的其他友軍武將防禦力提升 20%（乘在該武將目前等級的防禦上，變成 1.2 倍）。不含自己，防禦塔與城池不受影響；友軍的職業不限，也不需要普通攻擊的目標。範圍跟著射程：升級射程變長時範圍一起變大。受到攻擊時照原本的防禦公式、用提升後的防禦計算，不是直接少扣 20% 的傷害（例如防禦 100 的友軍被攻擊力 100 的敵人打一下，從扣 50 變成扣約 45.5）；趙雲的閃避照常先判定。同時在幾個防禦光環範圍內時取最強的一個，不會疊加。友軍離開範圍，或這位武將移位、被移除、陣亡、戰鬥結束時加成就解除。戰鬥中武將周圍會顯示淺綠色的範圍圈，受到加成的友軍有淺綠色的外框；在戰場上選取友軍時會分開列出原本的防禦與加成後的防禦。只在戰場生效：存檔與屬性表的防禦不會提高。",
    ],
    hero_wei_yan: [
      "吸血",
      "每次普通攻擊命中敵人後，這位武將恢復這一擊實際造成傷害的 15% 生命（例如打掉 100 恢復 15）。只算實際扣掉的生命：打倒敵人的那一擊也會恢復，但超過敵人剩餘生命的部分不算（敵人只剩 30 時恢復 4.5，不是 15）。恢復後不會超過最大生命，滿血時不恢復；已經陣亡的武將不會因此復活。只算這位武將自己普通攻擊的直接傷害：沒有命中（沒有目標、職業打不到飛行敵人）就不恢復，灼燒、其他武將與防禦塔造成的傷害也不算；普通攻擊的傷害、攻擊間隔與射程不變，也沒有另外計時的回血。恢復時武將上方出現綠色的「+恢復量」；戰場上的單位面板顯示的是選取當時的生命，重新點選武將可以看到恢復後的生命。只在戰場生效：恢復的是這場戰鬥中的生命，最大生命與屬性不變，不影響存檔。",
    ],
    hero_cao_cao: [
      "指揮",
      "戰鬥中，以這位武將為中心、目前射程內（含邊界）的其他友軍武將攻擊速度提升 15%：每秒攻擊次數變成 1.15 倍，攻擊間隔變成原本的 1 ÷ 1.15（例如 1 秒變成約 0.87 秒，不是直接少 15%）。不含自己，防禦塔與城池不受影響；友軍的職業不限，也不需要普通攻擊的目標。範圍跟著射程：升級射程變長時範圍一起變大。友軍的攻擊力與射程不變。加成只用在之後開始的攻擊冷卻：進入範圍時正在倒數的冷卻照原本的時間打完，不會立刻補打；離開範圍，或這位武將移位、被移除、陣亡、戰鬥結束時加成解除，正在倒數的冷卻同樣照原本的時間。同時在幾個攻速光環範圍內時取最強的一個，不會疊加。戰鬥中武將周圍會顯示淡紫色的範圍圈，受到加成的友軍有淡紫色的外框；在戰場上選取友軍時會分開列出原本與加成後的攻擊間隔（選取當時的數值）。只在戰場生效：存檔與屬性表的攻擊間隔不會改變。",
    ],
    hero_xia_hou_dun: [
      "反擊",
      "受到敵人的直接攻擊（目前是被武將擋在路上的敵人）、實際扣血後自己仍然活著時，對這次攻擊自己的敵人造成這一擊實際扣血 20% 的傷害。以防禦計算後實際扣掉的生命為準，不是敵人攻擊力的 20%：例如防禦 100 的武將被攻擊力 100 的敵人打一下扣 50、反彈 10；在劉備的防禦光環裡（防禦 120）扣約 45.45、反彈約 9.09。反彈不會替自己減少傷害。閃避（沒有扣血）、打倒自己的那一擊、沒有攻擊者的扣血都不反彈；只反彈給這次攻擊自己、仍然活著的敵人，不會波及其他敵人。反彈可以打倒攻擊者（擊殺與金幣照常只算一次），免疫減速的敵人照樣會受到反彈；反彈不會再引發吸血、暈眩、灼燒等其他技能，也不會來回反彈。反彈的傷害數字是洋紅色。普通攻擊的傷害、攻擊間隔與射程不變；戰場上的單位面板顯示的是選取當時的生命，重新點選武將可以看到最新的生命。只在戰場生效，不影響存檔。",
    ],
    hero_liao_hua: [
      "堅韌",
      "受傷前生命不高於最大生命的 30%（含剛好 30%）時，受到的傷害先照防禦計算，再降低 20%（變成 80%）。例如最大生命 1000、防禦 100 的廖化被攻擊力 100 的敵人打一下：生命 301 時扣 50 變成 251（這一擊不減傷），下一擊只扣 40；生命剛好 300 時就只扣 40。是防禦計算之後再少扣，不是提高防禦：在劉備的防禦光環裡扣約 45.45 的一擊變成約 36.36。用受傷前的生命判斷，生命回到超過 30% 時就不減傷；升級後照新的最大生命計算。閃避的一擊不扣血；減傷後仍然不夠的一擊照常倒下，不會留下 1 點生命，也不會復活。生效時武將的血條有古銅色外框與小盾牌；戰場上的單位面板顯示選取當時是否生效，重新點選武將可以更新。只在戰場生效：防禦、最大生命與存檔都不變。",
    ],
    hero_yan_liang: [
      "威壓",
      "戰鬥中，以這位武將為中心、目前射程內（含邊界）的所有敵人攻擊武將的直接攻擊力降低 10%（變成原本的 90%）。範圍跟著射程：升級射程變長時範圍一起變大；地面、飛行與免疫減速的敵人都算，也不需要普通攻擊的目標。被打的武將照常用防禦計算：例如攻擊力 100 的敵人打防禦 100 的武將，從扣 50 變成扣 45。同時在幾個威壓範圍內時取最強的一個，不會疊加；敵人離開範圍，或這位武將移位、被移除、陣亡時就恢復。只降低直接攻擊：敵人的移動速度與攻擊間隔不變，漏到城池時扣的城防也不會減少。戰鬥中武將周圍有暗紅色的範圍圈，受到威壓的敵人血條右上方有暗紅色的向下箭頭（白色描邊）。只在戰場生效，不影響存檔。",
    ],
    hero_sun_shang_xiang: [
      "連射",
      "每次普通攻擊命中敵人、而且敵人被這一擊打過後還活著時，有 20% 的機率在同一次攻擊對同一個敵人再打一擊，傷害是這次普通攻擊的攻擊力（100%）；武將上方會出現金色的「+1」。每次普通攻擊各自判定一次、最多追加一擊，追加的一擊不會再連射；不換目標，也不會打到其他敵人。第一擊就打倒敵人時不會連射（不會改打旁邊的敵人）；沒有目標、或打不到的敵人（飛行敵人要能對空的職業才打得到）不會判定。追加的一擊照常可以打倒敵人，擊殺與金幣只算一次；追加的一擊不會引發其他技能。攻擊間隔不變：連射不會讓下一次攻擊提早或延後。只在戰場生效，不影響存檔。",
    ],
  };
  const NO_SKILL_TEXT = "這裡尚未支援這位武將的技能說明";
  /** 名冊右側目前顯示的武將名稱、技能名稱與說明 */
  const rosterSkill = async (p) => ({
    hero: (await modal(p).locator("h4").first().innerText()).trim(),
    name: await text(p, '[data-testid="hero-skill-name"]'),
    desc: await text(p, '[data-testid="hero-skill-desc"]'),
  });
  async function pickRosterHero(p, name) {
    await modal(p)
      .locator('div[style*="380px"] strong', { hasText: name })
      .first()
      .click();
    return until(async () => {
      const v = await rosterSkill(p);
      return v.hero === name ? v : null;
    }, 5000);
  }
  const showsFormal = (v, id) =>
    !!v &&
    v.name === `⚡ 傳世技能・${ROSTER_SKILL[id][0]}` &&
    v.desc === ROSTER_SKILL[id][1];

  await scenario("武將名冊：13 位的正式技能名稱與完整說明", async (mk) => {
    const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
    const p = await E.page({ storage: guestStorage(GUEST_13, []) });
    check("以訪客進入", await enterGuest(p));
    check("打開名冊", await openRoster(p));
    for (const [id, name] of DEFAULT_SORTIE) {
      const v = await pickRosterHero(p, name);
      check(
        `${name}：技能名稱「${ROSTER_SKILL[id][0]}」與完整說明逐字等於正式技能表`,
        showsFormal(v, id),
        v
      );
    }
    const descOf = async (name) => ((await pickRosterHero(p, name)) || {}).desc;
    const ma = (await descOf("馬超")) || "";
    const xia = (await descOf("夏侯惇")) || "";
    const liao = (await descOf("廖化")) || "";
    check(
      "錨點：馬超首擊 2 倍、反擊打的是這次攻擊自己的敵人、廖化的門檻含剛好 30%",
      ma.includes("造成 2 倍傷害") &&
        xia.includes("對這次攻擊自己的敵人造成") &&
        liao.includes("不高於最大生命的 30%（含剛好 30%）"),
      { ma, xia, liao }
    );
    check(
      "不再出現舊的自編技能名稱（例如「西涼突襲」「勇冠三軍」）",
      !/西涼突襲|勇冠三軍|三國名將作戰特技/.test(await modal(p).innerText())
    );
    check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
    return E;
  });

  await scenario(
    "武將名冊：未知武將不猜說明、換選不殘留、升級後說明不變",
    async (mk) => {
      const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
      const p = await E.page({
        storage: guestStorage(
          [
            {
              hero_id: "hero_lv_bu",
              level: 1,
              star: 1,
              atk: 100,
              def: 50,
              hp: 1000,
            },
            {
              hero_id: "ma_chao",
              level: 1,
              star: 1,
              atk: 100,
              def: 50,
              hp: 1000,
            },
            {
              hero_id: "hero_zhao_yun",
              level: 1,
              star: 1,
              atk: 100,
              def: 50,
              hp: 1000,
            },
          ],
          []
        ),
      });
      check("以訪客進入", await enterGuest(p));
      check("打開名冊", await openRoster(p));
      const cards = modal(p).locator('div[style*="380px"] > div');
      check("名冊列出三張卡", (await cards.count()) === 3, await cards.count());
      const v0 = await rosterSkill(p);
      check(
        "未知武將 hero_lv_bu（預設選第一位）：沒有技能名稱，說明是「這裡尚未支援這位武將的技能說明」",
        v0.name === "⚡ 傳世技能" && v0.desc === NO_SKILL_TEXT,
        v0
      );
      const v1 = await pickRosterHero(p, "趙雲");
      check("選趙雲：正式的閃避", showsFormal(v1, "hero_zhao_yun"), v1);
      await cards.nth(0).click();
      const v2 = await until(async () => {
        const v = await rosterSkill(p);
        return v.hero === "" ? v : null;
      }, 5000);
      check(
        "再選回未知武將：沒有殘留趙雲的閃避",
        !!v2 && v2.name === "⚡ 傳世技能" && v2.desc === NO_SKILL_TEXT,
        v2
      );
      await cards.nth(1).click();
      await sleep(300);
      const v3 = await rosterSkill(p);
      check(
        "沒有 hero_ 前綴的 ma_chao：不當成馬超（沒有衝鋒的說明）",
        v3.name === "⚡ 傳世技能" && v3.desc === NO_SKILL_TEXT,
        v3
      );
      await pickRosterHero(p, "趙雲");
      await p.locator('[data-testid="hero-upgrade"]').click();
      check(
        "訪客升級趙雲（Lv.1 → Lv.2）",
        await until(
          async () => /Lv\.2/.test((await rosterCard(p, "趙雲")) || ""),
          5000
        )
      );
      const v4 = await rosterSkill(p);
      check(
        "升級後趙雲的技能說明不變",
        v4.hero === "趙雲" && showsFormal(v4, "hero_zhao_yun"),
        v4
      );
      check(
        "沒有舊的自編說明（勇冠三軍／三國名將作戰特技）",
        !/勇冠三軍|三國名將作戰特技/.test(await modal(p).innerText())
      );
      return E;
    }
  );

  await scenario(
    "武將名冊：設定與存檔的誘餌不控制說明、升級 body 沒有 skill、換帳號不殘留",
    async (mk) => {
      const decoy = {
        hero_id: "liao_hua",
        level: 2,
        star: 0,
        atk: 110,
        def: 70,
        hp: 1400,
        skill: { id: "first_strike", first_attack_multiplier: 9 },
        skill_name: "誘餌技能",
        description: "誘餌說明",
      };
      const A = NEW({ nickname: "甲", gold: 1000, heroes: [decoy] });
      const B = NEW({
        nickname: "乙",
        gold: 1000,
        heroes: [
          {
            hero_id: "liao_hua",
            level: 4,
            star: 1,
            atk: 130,
            def: 80,
            hp: 1600,
          },
        ],
      });
      const E = await mk({
        seed: [
          { key: "k_ra", data: A, rev: 3 },
          { key: "k_rb", data: B, rev: 7 },
        ],
      });
      E.gas.rule("get_heroes_config", "transform", {
        times: 50,
        fn: (res) => ({
          ...res,
          heroes: res.heroes.map((h) =>
            h.hero_id === "liao_hua"
              ? {
                  ...h,
                  passive: "堅韌：誘餌被動說明",
                  skill: { id: "counter", counter_ratio: 0.9 },
                  skill_name: "誘餌",
                  description: "誘餌",
                }
              : h.hero_id === "xia_hou_dun"
                ? { ...h, passive: "反擊：誘餌被動說明" }
                : h
          ),
        }),
      });
      const p = await E.page({ storage: { shenma_player_key: "k_ra" } });
      check("讀到甲", (await loadShared(p)) === "player");
      await closeModal(p);
      check("打開名冊", await openRoster(p));
      const v1 = await pickRosterHero(p, "廖化");
      check(
        "廖化：正式的堅韌（不是存檔或設定夾帶的誘餌）",
        showsFormal(v1, "hero_liao_hua"),
        v1
      );
      const v2 = await pickRosterHero(p, "夏侯惇");
      check(
        "夏侯惇：正式的反擊（設定的 passive 文字不控制說明）",
        showsFormal(v2, "hero_xia_hou_dun"),
        v2
      );
      check("名冊沒有任何誘餌文字", !/誘餌/.test(await modal(p).innerText()));
      await pickRosterHero(p, "廖化");
      await p.locator('[data-testid="hero-upgrade"]').click();
      check(
        "甲升級廖化（Lv.2 → Lv.3）",
        await until(
          async () => /Lv\.3/.test((await rosterCard(p, "廖化")) || ""),
          10000
        ),
        await rosterCard(p, "廖化")
      );
      const ups = E.gas.log.filter((e) => e.action === "upgrade_hero");
      check(
        "upgrade_hero 的 body 只有 hero_id 與 base_rev（沒有 skill 或說明）",
        ups.length === 1 &&
          sameJson(ups[0].payload, { hero_id: "liao_hua", base_rev: 3 }),
        ups.map((u) => u.payload)
      );
      const back = readBack(E, "k_ra");
      const h0 = back && back.data.heroes[0];
      check(
        "雲端讀回：廖化升到 Lv.3，存檔原有的 skill／skill_name／description 原樣保留，沒有其他 skill",
        !!h0 &&
          h0.level === 3 &&
          sameJson(h0.skill, decoy.skill) &&
          h0.skill_name === decoy.skill_name &&
          h0.description === decoy.description &&
          sameJson(skillPaths(back.data), [".heroes[0].skill"]),
        back
      );
      const v3 = await rosterSkill(p);
      check(
        "升級後廖化的技能說明不變",
        v3.hero === "廖化" && showsFormal(v3, "hero_liao_hua"),
        v3
      );
      await closeModal(p);
      check("切換到乙", await switchKey(p, "k_rb", "乙"));
      check("打開名冊", await openRoster(p));
      const v4 = await rosterSkill(p);
      check(
        "乙的名冊：仍選著廖化、是乙的等級（Lv.4），技能說明是正式的堅韌",
        v4.hero === "廖化" &&
          /Lv\.4/.test((await rosterCard(p, "廖化")) || "") &&
          showsFormal(v4, "hero_liao_hua"),
        { v4, card: await rosterCard(p, "廖化") }
      );
      check(
        "只有那一次 upgrade_hero 寫入",
        E.gas.writes().length === 1,
        E.gas.writes().map((e) => e.action)
      );
      return E;
    }
  );

  /**
   * 名冊的版面（不排除聊天按鈕）：說明每一個字的中心都在視窗內、elementFromPoint 是說明自己；
   * 捲到底時「提升修為」左中右三點點得到它自己；捲回頂時右上角的關閉點得到；整頁與視窗都沒有橫向捲動
   */
  const rosterLayout = (p) =>
    p.evaluate(async () => {
      const m = document.querySelector(".modal.show");
      const d = document.querySelector('[data-testid="hero-skill-desc"]');
      const up = document.querySelector('[data-testid="hero-upgrade"]');
      const close = m && m.querySelector(".modal-header .btn-close");
      const chat = !!document.querySelector(
        'button[aria-label="切換聊天視窗"]'
      );
      if (!m || !d || !up || !close) return { found: false, chat };
      const frame = () =>
        new Promise((r) =>
          requestAnimationFrame(() => requestAnimationFrame(r))
        );
      const hitBy = (el) => {
        const b = el && el.closest("button");
        return el ? (b && b.getAttribute("aria-label")) || el.tagName : null;
      };
      const points = (el) =>
        [0.1, 0.5, 0.9].map((fx) => {
          const b = el.getBoundingClientRect();
          const x = b.left + b.width * fx;
          const y = b.top + b.height / 2;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight)
            return { fx, ok: false, offscreen: true };
          const hit = document.elementFromPoint(x, y);
          return { fx, ok: !!hit && el.contains(hit), by: hitBy(hit) };
        });
      d.scrollIntoView({ block: "start" });
      await frame();
      const blocked = [];
      const offscreen = [];
      let chars = 0;
      const walker = document.createTreeWalker(d, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const node = walker.currentNode;
        for (let i = 0; i < node.textContent.length; i++) {
          if (!node.textContent[i].trim()) continue;
          const r = document.createRange();
          r.setStart(node, i);
          r.setEnd(node, i + 1);
          const b = r.getBoundingClientRect();
          if (!(b.width > 0 && b.height > 0)) continue;
          chars++;
          const x = b.left + b.width / 2;
          const y = b.top + b.height / 2;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) {
            offscreen.push(node.textContent[i]);
            continue;
          }
          const el = document.elementFromPoint(x, y);
          if (!el || !d.contains(el))
            blocked.push({ ch: node.textContent[i], by: hitBy(el) });
        }
      }
      m.scrollTop = m.scrollHeight;
      await frame();
      const atEnd = m.scrollTop + m.clientHeight >= m.scrollHeight - 1;
      const upPoints = points(up);
      const upRect = up.getBoundingClientRect();
      m.scrollTop = 0;
      await frame();
      const closePoints = points(close);
      return {
        found: true,
        chat,
        chars,
        blocked,
        offscreen,
        atEnd,
        upPoints,
        upInView: upRect.top >= -1 && upRect.bottom <= innerHeight + 1,
        closePoints,
        noHScroll:
          document.documentElement.scrollWidth <= innerWidth + 1 &&
          m.scrollWidth <= m.clientWidth + 1,
        scroll: { height: m.scrollHeight, client: m.clientHeight },
      };
    });
  for (const vp of [
    { width: 390, height: 600 },
    { width: 390, height: 844 },
    { width: 1280, height: 800 },
  ]) {
    await scenario(
      `武將名冊的版面：最長的說明 ${vp.width}×${vp.height}`,
      async (mk) => {
        const E = await mk({
          maps: SKILL_MAPS,
          enemies: ENEMIES,
          viewport: vp,
        });
        const p = await E.page({ storage: guestStorage(GUEST_13, []) });
        check("以訪客進入", await enterGuest(p));
        check("打開名冊", await openRoster(p));
        const v = await pickRosterHero(p, "夏侯惇");
        check("夏侯惇：正式的反擊", showsFormal(v, "hero_xia_hou_dun"), v);
        const o = await rosterLayout(p);
        check(
          "說明每個字都在視窗內、沒有被聊天按鈕或其他東西遮住；捲得到底，「提升修為」三點點得到；捲回頂時關閉點得到；沒有橫向捲動",
          o.found &&
            o.chat &&
            o.chars ===
              [...ROSTER_SKILL.hero_xia_hou_dun[1]].filter((c) => c.trim())
                .length &&
            o.blocked.length === 0 &&
            o.offscreen.length === 0 &&
            o.atEnd &&
            o.upInView &&
            o.upPoints.every((x) => x.ok) &&
            o.closePoints.every((x) => x.ok) &&
            o.noHScroll,
          o
        );
        await shot(p, `roster-layout-${vp.width}x${vp.height}`);
        // 鍵盤：從視窗本身開始按 Tab，走得到關閉與「提升修為」，聚焦時在視窗內、焦點不離開視窗
        await p.evaluate(() => document.querySelector(".modal.show").focus());
        const seen = [];
        for (let i = 0; i < 40; i++) {
          await p.keyboard.press("Tab");
          seen.push(
            await p.evaluate(() => {
              const a = document.activeElement;
              if (!a) return null;
              const r = a.getBoundingClientRect();
              return {
                tid: a.getAttribute("data-testid"),
                close:
                  !!a.closest(".modal-header") &&
                  a.classList.contains("btn-close"),
                inModal: !!a.closest(".modal.show"),
                inView:
                  r.width > 0 && r.top >= -1 && r.bottom <= innerHeight + 1,
              };
            })
          );
          if (
            seen.some((x) => x && x.close && x.inView) &&
            seen.some((x) => x && x.tid === "hero-upgrade" && x.inView)
          )
            break;
        }
        check(
          "鍵盤（Tab）走得到右上角的關閉與「提升修為」，聚焦時在視窗內，焦點一直在名冊視窗裡",
          seen.some((x) => x && x.close && x.inView) &&
            seen.some((x) => x && x.tid === "hero-upgrade" && x.inView) &&
            seen.every((x) => x && x.inModal),
          seen
        );
        await p.locator('[data-testid="hero-upgrade"]').focus();
        await p.keyboard.press("Enter");
        check(
          "在「提升修為」按 Enter：夏侯惇升一級（Lv.1 → Lv.2），說明不變",
          await until(
            async () =>
              /Lv\.2/.test((await rosterCard(p, "夏侯惇")) || "") &&
              showsFormal(await rosterSkill(p), "hero_xia_hou_dun"),
            5000
          ),
          await rosterCard(p, "夏侯惇")
        );
        await p.locator(".modal.show .modal-header .btn-close").focus();
        await p.keyboard.press("Enter");
        check(
          "在關閉按 Enter：名冊關上",
          await until(
            async () => (await p.locator(".modal").count()) === 0,
            5000
          )
        );
        return E;
      }
    );
  }

  // ═══ 25. 清波回到備戰：同一場的延續，不重開整場 ═══
  // 第 1 波清完回到備戰（手動出波）不是新的一場：battleId、關卡、波次（1）、場上的武將與塔、戰場金幣、城防與首擊紀錄都保留，
  // 不送結算或存檔；之後照常按「迎戰」進第 2 波。自動出波時清波直接排下一波。
  // 清波用引擎既有的 onWaveAllEnemiesDead 受控觸發（敵人是測試用的不倒木樁）：這裡驗的是生命週期，不是自然通關。
  // 只有還沒開打（第 0 波）的備戰改隊伍／換帳號才重新載入（第 24 段已驗）；清波後的備戰改隊伍也不重開（動態同步隊伍是之後的範圍）
  const DUMMY = {
    enemy_id: "dummy_test",
    name: "測試木樁",
    hp: 1000000,
    speed: 60,
    atk: 1,
    movement_type: "ground",
    image: "enemy_grunt1.webp",
    attack_image: "enemy_grunt1_atk.webp",
  };
  const DUMMY_WAVE = (wave) => ({
    wave,
    enemies: [
      { enemy_id: "dummy_test", count: 1, interval: 1, path: "path_a" },
    ],
  });
  const TWO_WAVE_MAPS = SKILL_MAPS.map((m) => ({
    ...m,
    waves: [DUMMY_WAVE(1), DUMMY_WAVE(2)],
  }));
  /** 這一場的生命週期快照：battleId、關卡、狀態、波次、金幣、城防、首擊紀錄、場上武將與塔的標記 */
  const lifecycle = (p) =>
    p.evaluate(() => {
      const e = window.__testBridge.engine;
      const b = e.battleManager;
      const fs = b.firstStrikeUsed;
      return {
        battleId: b.battleId,
        stage: b.stageId,
        state: b.gameState,
        wave: b.currentWave,
        total: b.totalWaves,
        gold: b.battleGold,
        baseHp: b.baseHp,
        firstStrike: fs instanceof Map ? [...fs.entries()] : null,
        heroes: e.heroes.map((h) => [h.heroId, h.__mark || null]),
        towers: e.towers.map((t) => [t.towerTypeKey, t.__mark || null]),
        hudWave: (
          document.querySelector('[class*="hudWave"]') || { innerText: "" }
        ).innerText.trim(),
      };
    });
  const markField = (p) =>
    p.evaluate(() => {
      const e = window.__testBridge.engine;
      e.heroes.forEach((h) => (h.__mark = `hero:${h.heroId}`));
      e.towers.forEach((t) => (t.__mark = `tower:${t.towerUid}`));
      return e.heroes.length + e.towers.length;
    });
  /** 受控的清波回呼（引擎既有的方法；不是自然清波） */
  const forceWaveClear = (p) =>
    p.evaluate(() =>
      window.__testBridge.engine.battleManager.onWaveAllEnemiesDead()
    );
  const waitFirstStrike = (p) =>
    until(
      () =>
        p.evaluate(() => {
          const fs = window.__testBridge.engine.battleManager.firstStrikeUsed;
          return fs instanceof Map && fs.has("hero_ma_chao");
        }),
      20000
    );

  await scenario(
    "清波回到備戰（手動出波）：共用帳號同一場延續，不重開、不寫入；之後照常進第 2 波",
    async (mk) => {
      const data = NEW({
        capacity: 20,
        team: [
          { hero_id: "ma_chao", slot: 1 },
          { hero_id: "zhao_yun", slot: 2 },
        ],
      });
      const E = await mk({
        seed: [{ key: "k_wave", data, rev: 2 }],
        maps: TWO_WAVE_MAPS,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: { shenma_player_key: "k_wave" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      check("可以觀測部署資料", await watchPlacements(p));
      const d1 = await deployHero(p, ROAD_CELLS[0], "馬超");
      const t1 = await buildTower(p, BUILD_CELL, "弓兵塔");
      check(
        "備戰中從選單部署馬超、建弓兵塔，並標記實例",
        d1.ok && t1.ok && (await markField(p)) === 2,
        { d1, t1 }
      );
      const s0 = await lifecycle(p);
      check(
        "按進入戰場開第 1 波（共 2 波）",
        (await startBattle(p)) && (await bm(p, "state")) === 2,
        s0
      );
      check(
        "馬超打到木樁、首擊紀錄寫下（這一場第一次命中）",
        await waitFirstStrike(p),
        await lifecycle(p)
      );
      const s1 = await lifecycle(p);
      const writes1 = E.gas.writes().length;
      await forceWaveClear(p);
      await sleep(1200);
      const s2 = await lifecycle(p);
      check(
        "清波後回到備戰：同一個 battleId、同一關、波次仍是 1（畫面 1/2），不是新的一場",
        s2.state === 1 &&
          s2.battleId === s1.battleId &&
          s2.battleId === s0.battleId &&
          s2.stage === s1.stage &&
          s2.wave === 1 &&
          s2.total === 2 &&
          s2.hudWave === "1/2",
        { s1, s2 }
      );
      check(
        "場上的武將與塔是原本的實例，戰場金幣與城防不變",
        sameJson(s2.heroes, s1.heroes) &&
          sameJson(s2.heroes, [["hero_ma_chao", "hero:hero_ma_chao"]]) &&
          sameJson(s2.towers, s1.towers) &&
          s2.towers.length === 1 &&
          s2.towers[0][1] !== null &&
          s2.gold === s1.gold &&
          s2.baseHp === s1.baseHp,
        { s1, s2 }
      );
      check(
        "首擊紀錄保留（馬超這一場已用過）",
        !!s1.firstStrike &&
          s1.firstStrike.length === 1 &&
          sameJson(s2.firstStrike, s1.firstStrike),
        { before: s1.firstStrike, after: s2.firstStrike }
      );
      const c2 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "部署選單上馬超仍是「已在場上」",
        c2.ok && c2.disabled && /已在場上/.test(c2.text),
        c2
      );
      check(
        "清波沒有送任何結算或存檔",
        E.gas.writes().length === writes1 && writes1 === 0,
        E.gas.writes()
      );
      // 共用帳號：這一場仍是出征中（結算前不能改共用存檔）；清波沒有解除，也沒有換成新的一場
      await openTeam(p);
      const blocked = await text(p, '[data-testid="team-edit-blocked"]');
      const saveDisabled = await isDisabled(
        p,
        '[data-testid="team-edit-save"]'
      );
      await closeModal(p);
      check(
        "清波後仍是出征中：隊伍視窗說明結算前不能修改共用存檔、儲存鈕停用",
        /出征中/.test(blocked || "") && saveDisabled === true,
        { blocked, saveDisabled }
      );
      // 照常按「迎戰」進第 2 波
      await p.locator('[data-testid="hud-start-battle"]').click();
      const ok4 = await until(async () => (await bm(p, "state")) === 2, 5000);
      await sleep(2500);
      const s4 = await lifecycle(p);
      check(
        "按迎戰進第 2 波：同一個 battleId、波次 2（畫面 2/2）、原本的實例都在",
        !!ok4 &&
          s4.state === 2 &&
          s4.battleId === s1.battleId &&
          s4.wave === 2 &&
          s4.hudWave === "2/2" &&
          sameJson(s4.heroes, s1.heroes) &&
          sameJson(s4.towers, s1.towers),
        { s4 }
      );
      check(
        "第 2 波時首擊紀錄不變（同一場只觸發一次；只核紀錄，不驗傷害）",
        sameJson(s4.firstStrike, s1.firstStrike),
        { before: s1.firstStrike, after: s4.firstStrike }
      );
      check(
        "到第 2 波為止沒有任何寫入（沒有結算、沒有存檔）",
        E.gas.writes().length === 0,
        E.gas.writes().map((e) => e.action)
      );
      return E;
    }
  );

  await scenario(
    "清波回到備戰（手動出波）：訪客清波後在備戰改隊伍，不重開整場",
    async (mk) => {
      const E = await mk({
        maps: TWO_WAVE_MAPS,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({
        storage: guestStorage(
          [
            {
              hero_id: "hero_ma_chao",
              level: 2,
              star: 1,
              atk: 115,
              def: 58,
              hp: 1120,
            },
            {
              hero_id: "hero_zhou_yu",
              level: 1,
              star: 1,
              atk: 105,
              def: 55,
              hp: 1080,
            },
          ],
          [{ slot: 0, hero_id: "hero_ma_chao" }]
        ),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[0], "馬超");
      check("部署馬超並標記實例", d1.ok && (await markField(p)) === 1, d1);
      check("按進入戰場開第 1 波", await startBattle(p));
      check("馬超打到木樁、首擊紀錄寫下", await waitFirstStrike(p));
      const s1 = await lifecycle(p);
      await forceWaveClear(p);
      await sleep(1200);
      const s2 = await lifecycle(p);
      check(
        "清波後回到備戰：同一個 battleId、波次 1",
        s2.state === 1 && s2.battleId === s1.battleId && s2.wave === 1,
        { s1, s2 }
      );
      await openTeam(p);
      check("備戰中選得到周瑜", await pickTeamHero(p, "周瑜"));
      await p.locator('[data-testid="team-edit-save"]').click();
      await until(async () => (await modal(p).count()) === 0, 10000);
      await sleep(1200);
      const s3 = await lifecycle(p);
      const saved = await p.evaluate(() =>
        JSON.parse(localStorage.getItem("shenma_js_guest_state")).team.map(
          (t) => t.hero_id
        )
      );
      check(
        "清波後改隊伍：本機存檔的隊伍更新（馬超、周瑜），但同一個 battleId、波次仍是 1、馬超是原本的實例、首擊紀錄不變",
        sameJson(saved.slice().sort(), ["hero_ma_chao", "hero_zhou_yu"]) &&
          s3.state === 1 &&
          s3.battleId === s1.battleId &&
          s3.wave === 1 &&
          sameJson(s3.heroes, [["hero_ma_chao", "hero:hero_ma_chao"]]) &&
          sameJson(s3.firstStrike, s1.firstStrike),
        { saved, s3 }
      );
      const cm = await menuCard(p, ROAD_CELLS[8], "馬超");
      const cz = await menuCard(p, ROAD_CELLS[8], "周瑜");
      check(
        "部署選單：馬超仍是「已在場上」，新加的周瑜可以點",
        cm.ok && cm.disabled && cz.ok && !cz.disabled,
        { cm, cz }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "清波回到備戰（自動出波）：清波後直接進第 2 波，同一場",
    async (mk) => {
      const E = await mk({
        maps: TWO_WAVE_MAPS,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const saveBefore = await p.evaluate(() =>
        localStorage.getItem("shenma_js_guest_state")
      );
      const d1 = await deployHero(p, ROAD_CELLS[0], "馬超");
      check("部署馬超並標記實例", d1.ok && (await markField(p)) === 1, d1);
      const s0 = await lifecycle(p);
      await p.locator("button", { hasText: /^自動$/ }).click();
      check(
        "按自動：直接開第 1 波（自動出波）",
        await until(
          async () =>
            (await bm(p, "state")) === 2 &&
            (await p.evaluate(
              () => window.__testBridge.engine.battleManager.autoMode
            )),
          5000
        )
      );
      check("馬超打到木樁、首擊紀錄寫下", await waitFirstStrike(p));
      const s1 = await lifecycle(p);
      await forceWaveClear(p);
      const ok2 = await until(
        async () =>
          (await bm(p, "state")) === 2 && (await lifecycle(p)).wave === 2,
        8000
      );
      const s2 = await lifecycle(p);
      check(
        "清波後自動進第 2 波：同一個 battleId、波次 2、原本的武將實例、首擊紀錄不變",
        !!ok2 &&
          s2.battleId === s0.battleId &&
          s2.battleId === s1.battleId &&
          s2.wave === 2 &&
          sameJson(s2.heroes, [["hero_ma_chao", "hero:hero_ma_chao"]]) &&
          sameJson(s2.firstStrike, s1.firstStrike),
        { s1, s2 }
      );
      check(
        "訪客的本機存檔沒有變（沒有結算），也沒有任何存檔請求",
        (await p.evaluate(() =>
          localStorage.getItem("shenma_js_guest_state")
        )) === saveBefore && E.gas.players().length === 0
      );
      return E;
    }
  );

  // ═══ 26. 防禦塔的投入與拆除：返還投入的一半；拆除只在備戰、沒有暫停、選取中的同一座塔、帶這一場與看到的返還金額 ═══
  // 建造與升級從正常的部署選單與升級面板操作；拒絕的情況從面板（停用與說明）與頁面用的同一個入口（window.__testBridge.sellTower）送出，
  // 前置條件用既有的操作或引擎方法（受控，不是自然實戰）。期待值照 Godot 版的建造費、升級費與 floor(投入 × 0.5) 手寫
  const TOWER_CELLS = [
    [2, 1],
    [4, 1],
    [6, 1],
  ];
  // 敵人是很慢、打不倒的測試木樁：開戰後一段時間內都還在戰鬥中（不會被塔打完而結算）
  const SLOW_DUMMY = { ...DUMMY, enemy_id: "dummy_slow", speed: 10 };
  const TOWER_ENEMIES = [...ENEMIES, SLOW_DUMMY];
  const TOWER_MAPS = SKILL_MAPS.map((m) => {
    const pj = JSON.parse(m.path_json);
    return {
      ...m,
      path_json: JSON.stringify({ ...pj, build_zones: TOWER_CELLS }),
      waves: [
        {
          wave: 1,
          enemies: [
            { enemy_id: "dummy_slow", count: 1, interval: 1, path: "path_a" },
          ],
        },
      ],
    };
  });
  /** 引擎目前的這一場：battleId、金幣、塔（識別碼、種類、等級、投入、格子）、三個建築位的占用、選取 */
  const towerState = (p) =>
    p.evaluate((cells) => {
      const e = window.__testBridge.engine;
      return {
        battleId: e.battleManager.battleId,
        state: e.battleManager.gameState,
        gold: e.battleManager.battleGold,
        towers: e.towers.map((t) => [
          t.towerUid,
          t.towerTypeKey,
          t.towerLevel,
          t.investedGold,
          t.gridCell.col,
          t.gridCell.row,
        ]),
        occupied: cells.map(([c, r]) => e.gameMap.isOccupied(c, r)),
        selected: e.selectedUnit ? { ...e.selectedUnit } : null,
      };
    }, TOWER_CELLS);
  /** 升級面板上顯示的投入、等級、拆除按鈕與說明 */
  const panelInfo = (p) =>
    p.evaluate(() => {
      const el = document.querySelector('[data-testid="upgrade-panel"]');
      if (!el) return null;
      const sell = el.querySelector('[data-testid="tower-sell"]');
      const t = el.innerText;
      const inv = t.match(/累計軍資\s*💰\s*(\d+)/);
      const lv = t.match(/Lv\.(\d+)/);
      const pick = (sel) => {
        const x = el.querySelector(sel);
        return x ? x.innerText.trim() : null;
      };
      return {
        invested: inv ? Number(inv[1]) : null,
        level: lv ? Number(lv[1]) : null,
        sellText: sell ? sell.innerText.trim() : null,
        sellDisabled: sell ? sell.disabled : null,
        hint: pick('[data-testid="tower-sell-hint"]'),
        note: pick('[data-testid="tower-sell-note"]'),
      };
    });
  const closePanel = async (p) => {
    const panel = p.locator('[data-testid="upgrade-panel"]');
    if (await panel.count())
      await panel
        .locator("button", { hasText: "×" })
        .first()
        .click()
        .catch(() => {});
    return until(async () => (await panel.count()) === 0, 5000);
  };
  /** 用頁面同一個入口送拆除請求（不經過面板的停用） */
  const bridgeSell = (p, req) =>
    p.evaluate((r) => window.__testBridge.sellTower(r), req);
  /** 面板打開時記下的請求：這一場、選取中的塔、格子、按鈕上顯示的返還金額 */
  const panelReceipt = (p) =>
    p.evaluate(() => {
      const e = window.__testBridge.engine;
      const s = e.selectedUnit;
      const btn = document.querySelector('[data-testid="tower-sell"]');
      const m = btn && btn.innerText.match(/\+(\d+)/);
      return s && m
        ? {
            battleId: e.battleManager.battleId,
            towerUid: s.id,
            col: s.col,
            row: s.row,
            expectedRefund: Number(m[1]),
          }
        : null;
    });

  await scenario(
    "防禦塔投入與拆除：共用帳號備戰中建造、升級、拆除（滑鼠與鍵盤），返還投入的一半，拆後可再建、沒有寫入",
    async (mk) => {
      const data = NEW({
        capacity: 20,
        gold: 500,
        team: [{ hero_id: "ma_chao", slot: 1 }],
      });
      const E = await mk({
        seed: [{ key: "k_tower", data, rev: 4 }],
        maps: TOWER_MAPS,
        enemies: TOWER_ENEMIES,
      });
      const p = await E.page({ storage: { shenma_player_key: "k_tower" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      const g0 = await fieldGold(p, false);
      const b1 = await buildTower(p, TOWER_CELLS[0], "弓兵塔");
      await towerPanel(p, TOWER_CELLS[0]);
      const i1 = await panelInfo(p);
      const s1 = await towerState(p);
      check(
        "建弓兵塔：扣 50（畫面同步），面板顯示投入 50、拆除 +25、可以拆",
        b1.ok &&
          g0.battle === 5000 &&
          s1.gold === 4950 &&
          (await fieldGold(p, false)).hud === goldText(4950) &&
          !!i1 &&
          i1.invested === 50 &&
          i1.level === 1 &&
          i1.sellText === "拆除 +25" &&
          i1.sellDisabled === false &&
          i1.hint === null &&
          sameJson(
            s1.towers.map((t) => t.slice(1)),
            [["archer", 1, 50, 2, 1]]
          ),
        { b1, i1, s1 }
      );
      await p
        .locator('[data-testid="upgrade-panel"] button', { hasText: "升級" })
        .first()
        .click();
      await sleep(300);
      const i2 = await panelInfo(p);
      const s2 = await towerState(p);
      check(
        "面板升級：扣 50、Lv.2、投入 100、拆除 +50",
        s2.gold === 4900 &&
          !!i2 &&
          i2.level === 2 &&
          i2.invested === 100 &&
          i2.sellText === "拆除 +50",
        { i2, s2 }
      );
      await p.locator('[data-testid="tower-sell"]').click();
      const closed = await until(
        async () =>
          (await p.locator('[data-testid="upgrade-panel"]').count()) === 0,
        5000
      );
      const s3 = await towerState(p);
      check(
        "滑鼠按拆除：面板關閉、返還 50（4900 → 4950）、塔移除、格子釋放、取消選取",
        !!closed &&
          s3.gold === 4950 &&
          s3.towers.length === 0 &&
          s3.occupied[0] === false &&
          s3.selected === null,
        { closed, s3 }
      );
      const b2 = await buildTower(p, TOWER_CELLS[0], "弓兵塔");
      const b3 = await buildTower(p, TOWER_CELLS[1], "文士塔");
      await towerPanel(p, TOWER_CELLS[1]);
      await p
        .locator('[data-testid="upgrade-panel"] button', { hasText: "升級" })
        .first()
        .click();
      await sleep(300);
      const i4 = await panelInfo(p);
      const s4 = await towerState(p);
      check(
        "拆後同一格可以再建；文士塔建 80＋升 75：投入 155、拆除 +77（無條件捨去）",
        b2.ok &&
          b3.ok &&
          s4.gold === 4950 - 50 - 80 - 75 &&
          !!i4 &&
          i4.invested === 155 &&
          i4.sellText === "拆除 +77",
        { b2, b3, i4, s4 }
      );
      await p.locator('[data-testid="tower-sell"]').focus();
      await p.keyboard.press("Enter");
      const closed2 = await until(
        async () =>
          (await p.locator('[data-testid="upgrade-panel"]').count()) === 0,
        5000
      );
      const s5 = await towerState(p);
      check(
        "鍵盤（在拆除按 Enter）：返還 77、文士塔移除，弓兵塔還在",
        !!closed2 &&
          s5.gold === s4.gold + 77 &&
          sameJson(
            s5.towers.map((t) => t.slice(1)),
            [["archer", 1, 50, 2, 1]]
          ) &&
          s5.occupied[1] === false,
        { closed2, s5 }
      );
      const back = readBack(E, "k_tower");
      check(
        "沒有任何寫入；雲端存檔的世界金幣 500、版本 4 不變",
        E.gas.writes().length === 0 &&
          !!back &&
          back.rev === 4 &&
          back.data.gold === 500,
        { writes: E.gas.writes(), back }
      );
      return E;
    }
  );

  // 拒絕的情況各自用新的頁面與相同前置（兩座弓兵塔 A、B），一個情況錯誤地拆掉塔，不會影響其他情況的判定
  /** 前置：建弓兵塔 A（2,1）、B（4,1），打開 A 的面板並記下請求 */
  async function towerGuardSetup(mk) {
    const E = await mk({ maps: TOWER_MAPS, enemies: TOWER_ENEMIES });
    const p = await E.page({ storage: guestStorage(GUEST_13, []) });
    check("以訪客進入", await enterGuest(p));
    await waitRemoteStage(p, E);
    const bA = await buildTower(p, TOWER_CELLS[0], "弓兵塔");
    const bB = await buildTower(p, TOWER_CELLS[1], "弓兵塔");
    await towerPanel(p, TOWER_CELLS[0]);
    const rA = await panelReceipt(p);
    check(
      "前置：建兩座弓兵塔 A、B，A 的面板記下請求（返還 25）",
      bA.ok && bB.ok && !!rA && rA.expectedRefund === 25,
      { bA, bB, rA }
    );
    return { E, p, rA: rA || {} };
  }

  await scenario(
    "防禦塔拆除守門：暫停中按鈕停用並說明，入口也拒絕",
    async (mk) => {
      const { E, p, rA } = await towerGuardSetup(mk);
      await closePanel(p);
      await p.locator("button", { hasText: "⏸ 暫停" }).first().click();
      await until(
        async () =>
          (await p.locator("button", { hasText: "▶ 繼續" }).count()) > 0,
        5000
      );
      await towerPanel(p, TOWER_CELLS[0]);
      const ip = await panelInfo(p);
      check(
        "暫停中：拆除按鈕停用，說明只有備戰中、沒有暫停時可以拆",
        !!ip &&
          ip.sellDisabled === true &&
          ip.hint === "只有備戰中、沒有暫停時可以拆除（返還投入的一半）。",
        ip
      );
      const before = await towerState(p);
      const rp = await bridgeSell(p, rA);
      check(
        "暫停中從入口送請求：拒絕 paused，狀態不變",
        rp &&
          rp.ok === false &&
          rp.reason === "paused" &&
          sameJson(await towerState(p), before),
        { rp, before, after: await towerState(p) }
      );
      return E;
    }
  );

  for (const [label, prep, makeReq, reason] of [
    [
      "選了 B 卻送 A",
      async (p) => {
        await closePanel(p);
        await towerPanel(p, TOWER_CELLS[1]);
        const sel = (await towerState(p)).selected;
        check(
          "前置：關掉 A 的面板再點 B，選取的是 B",
          !!sel && sel.type === "tower" && sel.col === 4 && sel.row === 1,
          sel
        );
      },
      (rA) => rA,
      "not_selected",
    ],
    [
      "A 的識別碼配 B 的格子",
      null,
      (rA) => ({ ...rA, col: 4 }),
      "not_selected",
    ],
    [
      "不存在的識別碼",
      null,
      (rA) => ({ ...rA, towerUid: "tower_999" }),
      "not_selected",
    ],
    [
      "別的場次",
      null,
      (rA) => ({ ...rA, battleId: "battle_old" }),
      "stale_battle",
    ],
    [
      "缺 expectedRefund",
      null,
      (rA) => ({
        battleId: rA.battleId,
        towerUid: rA.towerUid,
        col: 2,
        row: 1,
      }),
      "invalid_request",
    ],
    [
      "expectedRefund 是字串",
      null,
      (rA) => ({ ...rA, expectedRefund: "25" }),
      "invalid_request",
    ],
    ["空的請求", null, () => null, "invalid_request"],
    [
      "返還金額不對（24，實際 25）",
      null,
      (rA) => ({ ...rA, expectedRefund: 24 }),
      "refund_changed",
    ],
  ]) {
    await scenario(`防禦塔拆除守門（入口）：${label}`, async (mk) => {
      const { E, p, rA } = await towerGuardSetup(mk);
      if (prep) await prep(p);
      const before = await towerState(p);
      const r = await bridgeSell(p, makeReq(rA));
      const after = await towerState(p);
      check(
        `拒絕 ${reason}，金幣、塔、格子與選取都不變`,
        r && r.ok === false && r.reason === reason && sameJson(after, before),
        { r, before, after }
      );
      if (reason === "refund_changed")
        check("拒絕結果帶現在的返還 25", !!r && r.refund === 25, r);
      return E;
    });
  }

  await scenario(
    "防禦塔拆除守門：戰鬥中按鈕停用並說明，入口也拒絕",
    async (mk) => {
      const { E, p, rA } = await towerGuardSetup(mk);
      await closePanel(p);
      check("開戰", await startBattle(p));
      await towerPanel(p, TOWER_CELLS[0]);
      const ib = await panelInfo(p);
      const bb = await towerState(p);
      const rb = await bridgeSell(p, rA);
      const ab = await towerState(p);
      check(
        "戰鬥中：拆除按鈕停用並說明；入口拒絕 not_prep，塔與格子不變",
        !!ib &&
          ib.sellDisabled === true &&
          !!ib.hint &&
          rb &&
          rb.ok === false &&
          rb.reason === "not_prep" &&
          sameJson(ab.towers, bb.towers) &&
          sameJson(ab.occupied, bb.occupied),
        { ib, rb, bb, ab }
      );
      return E;
    }
  );

  await scenario("防禦塔拆除守門：結算中入口也拒絕", async (mk) => {
    const { E, p, rA } = await towerGuardSetup(mk);
    await closePanel(p);
    check("開戰", await startBattle(p));
    await endWith(p, { win: false });
    await until(async () => (await bm(p, "state")) === 3, 5000);
    const br = await towerState(p);
    const rr = await bridgeSell(p, rA);
    const ar = await towerState(p);
    check(
      "結算中：入口拒絕 not_prep，塔、格子與金幣不變",
      rr &&
        rr.ok === false &&
        rr.reason === "not_prep" &&
        sameJson(ar.towers, br.towers) &&
        sameJson(ar.occupied, br.occupied) &&
        ar.gold === br.gold,
      { rr, br, ar }
    );
    check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
    return E;
  });

  await scenario(
    "防禦塔拆除守門：升級前記下的請求被拒，面板顯示新金額後再按一次才拆；同一份請求不能拆兩次",
    async (mk) => {
      const E = await mk({ maps: TOWER_MAPS, enemies: TOWER_ENEMIES });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      await buildTower(p, TOWER_CELLS[0], "弓兵塔");
      await towerPanel(p, TOWER_CELLS[0]);
      const old = await panelReceipt(p);
      check(
        "面板記下的請求：這一場、這座塔、格子、返還 25",
        !!old &&
          old.expectedRefund === 25 &&
          old.col === 2 &&
          old.row === 1 &&
          old.battleId === (await bm(p, "battleId")),
        old
      );
      await p
        .locator('[data-testid="upgrade-panel"] button', { hasText: "升級" })
        .first()
        .click();
      await sleep(300);
      const s0 = await towerState(p);
      const r1 = await bridgeSell(p, old);
      check(
        "升級後送舊的請求（25）：拒絕 refund_changed（現在 50），塔、投入、金幣不變",
        r1 &&
          r1.ok === false &&
          r1.reason === "refund_changed" &&
          r1.refund === 50 &&
          sameJson(await towerState(p), s0),
        { r1, s0 }
      );
      const i1 = await panelInfo(p);
      check(
        "面板顯示新的返還（拆除 +50），按鈕仍可以按",
        !!i1 && i1.sellText === "拆除 +50" && i1.sellDisabled === false,
        i1
      );
      const fresh = await panelReceipt(p);
      await p.locator('[data-testid="tower-sell"]').click();
      await until(
        async () =>
          (await p.locator('[data-testid="upgrade-panel"]').count()) === 0,
        5000
      );
      const s1 = await towerState(p);
      check(
        "再按一次拆除：返還 50、塔移除",
        s1.gold === s0.gold + 50 && s1.towers.length === 0,
        { s0, s1 }
      );
      const r2 = await bridgeSell(p, fresh);
      check(
        "同一份請求再送一次：拒絕，金幣不變（只返還一次）",
        r2 && r2.ok === false && (await towerState(p)).gold === s1.gold,
        { r2 }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "防禦塔拆除守門：後端設定到達重新載入後，舊場次的面板按拆除被拒絕並說明",
    async (mk) => {
      const E = await mk({ maps: TOWER_MAPS, enemies: TOWER_ENEMIES });
      const hold = E.gas.rule("get_all_maps", "hold");
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      check(
        "後端關卡設定還沒回應（暫停中）",
        await until(() => hold.waiting.length > 0, 15000)
      );
      const bid0 = await stableBattle(p);
      const buildCells = await p.evaluate(() => {
        const e = window.__testBridge.engine;
        const m = e.gameMap;
        const rect = e.canvas.getBoundingClientRect();
        const out = [];
        for (let r = 0; r < m.rows; r++)
          for (let c = 0; c < m.cols; c++) {
            if (!m.canPlaceTower(c, r)) continue;
            const w = m.gridToWorld(c, r);
            if (
              document.elementFromPoint(rect.left + w.x, rect.top + w.y) ===
              e.canvas
            )
              out.push([c, r]);
          }
        return out;
      });
      const b0 = buildCells.length
        ? await buildTower(p, buildCells[0], "弓兵塔")
        : { ok: false, step: "no-build-cell" };
      await towerPanel(p, buildCells[0] || [0, 0]);
      const i0 = await panelInfo(p);
      check(
        "內建關卡上建弓兵塔並打開面板（拆除 +25）",
        b0.ok && !!i0 && i0.sellText === "拆除 +25",
        { b0, i0, cells: buildCells.length }
      );
      check("放行後端關卡設定", hold.release("ok") === 1);
      const bid1 = await nextBattle(p, bid0);
      const s1 = await towerState(p);
      const stillOpen =
        (await p.locator('[data-testid="upgrade-panel"]').count()) > 0;
      check(
        "重新載入成新的一場（場上沒有塔），舊的面板還開著",
        !!bid1 && s1.towers.length === 0 && stillOpen,
        { bid0, bid1, s1, stillOpen }
      );
      if (stillOpen) await p.locator('[data-testid="tower-sell"]').click();
      await sleep(300);
      const i1 = await panelInfo(p);
      const s2 = await towerState(p);
      check(
        "舊面板按拆除：不拆、不退錢（新的一場仍 5000），說明這座塔不在目前這一場",
        !!i1 &&
          i1.note === "這座塔不在目前這一場，請重新點選。" &&
          s2.gold === 5000 &&
          s2.battleId === bid1,
        { i1, s2 }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "防禦塔拆除守門：重新整理後同一格的新塔也叫 tower_1，舊場次的請求仍被拒",
    async (mk) => {
      const E = await mk({ maps: TOWER_MAPS, enemies: TOWER_ENEMIES });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      await buildTower(p, TOWER_CELLS[0], "弓兵塔");
      await towerPanel(p, TOWER_CELLS[0]);
      const old = await panelReceipt(p);
      await closePanel(p);
      await p.reload();
      check("重新整理後以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      await buildTower(p, TOWER_CELLS[0], "弓兵塔");
      await towerPanel(p, TOWER_CELLS[0]);
      const now = await panelReceipt(p);
      const before = await towerState(p);
      const r = await bridgeSell(p, old);
      check(
        "新的一場同一個識別碼、同一格、同樣的返還：舊請求拒絕 stale_battle，狀態不變",
        !!old &&
          !!now &&
          old.towerUid === now.towerUid &&
          old.battleId !== now.battleId &&
          old.col === now.col &&
          old.expectedRefund === now.expectedRefund &&
          r &&
          r.ok === false &&
          r.reason === "stale_battle" &&
          sameJson(await towerState(p), before),
        { old, now, r }
      );
      const ok = await bridgeSell(p, now);
      check(
        "這一場的請求才成功（返還 25）",
        ok && ok.ok === true && ok.refund === 25,
        ok
      );
      return E;
    }
  );

  await scenario(
    "防禦塔面板的版面：390×600 拆除按鈕看得到、點得到",
    async (mk) => {
      const E = await mk({
        maps: TOWER_MAPS,
        enemies: TOWER_ENEMIES,
        viewport: { width: 390, height: 600 },
      });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const b = await buildTower(p, TOWER_CELLS[0], "弓兵塔");
      const panel = await towerPanel(p, TOWER_CELLS[0]);
      // 面板有約 0.15 秒的放大動畫：等它結束再取點與截圖
      await sleep(400);
      const o = await p.evaluate(() => {
        const btn = document.querySelector('[data-testid="tower-sell"]');
        if (!btn) return null;
        btn.scrollIntoView({ block: "nearest" });
        const r = btn.getBoundingClientRect();
        const pts = [0.1, 0.5, 0.9].map((fx) => {
          const x = r.left + r.width * fx;
          const y = r.top + r.height / 2;
          const hit = document.elementFromPoint(x, y);
          return !!hit && btn.contains(hit);
        });
        return {
          inView:
            r.top >= 0 &&
            r.bottom <= innerHeight &&
            r.left >= 0 &&
            r.right <= innerWidth,
          pts,
          text: btn.innerText.trim(),
          chat: !!document.querySelector('button[aria-label="切換聊天視窗"]'),
          noHScroll: document.documentElement.scrollWidth <= innerWidth + 1,
        };
      });
      check(
        "390×600：拆除按鈕在視窗內、左中右三點點得到它自己（不排除聊天按鈕）、沒有橫向捲動",
        b.ok &&
          !!panel &&
          !!o &&
          o.inView &&
          o.pts.every(Boolean) &&
          o.chat &&
          o.noHScroll &&
          o.text === "拆除 +25",
        { b, o }
      );
      await shot(p, "tower-panel-390x600");
      await p.locator('[data-testid="tower-sell"]').click();
      const s = await towerState(p);
      check(
        "390×600：按拆除後返還 25（5000 − 50 ＋ 25 ＝ 4975）、塔移除",
        s.gold === 4975 && s.towers.length === 0,
        s
      );
      return E;
    }
  );

  // ═══ 27. 武將的部署唯一性、陣亡後重派與合法的 0 數值 ═══
  // 同一位武將還在場上時，頁面用的派出入口（window.__testBridge.placeHero）也拒絕，不只靠部署選單停用；
  // 陣亡用受控的 takeDamage（真正的死亡流程，不是自然戰鬥），之後部署選單恢復、同一場可以再派，首擊紀錄不變（只核紀錄，不驗傷害）；
  // 上一場晚到的陣亡與舊場次的通知不改新場的名單。期待值照 Godot 版 _place_hero／_on_hero_died 與 Hero.setup 手寫
  const HERO_INFO = '[data-testid="hero-info-panel"]';
  /** 引擎目前的這一場：battleId、戰場金幣、場上武將（識別碼、格子、標記、生命／攻擊／防禦）、選取、首擊紀錄 */
  const heroField = (p) =>
    p.evaluate(() => {
      const e = window.__testBridge.engine;
      const fs = e.battleManager.firstStrikeUsed;
      return {
        battleId: e.battleManager.battleId,
        gold: e.battleManager.battleGold,
        heroes: e.heroes.map((h) => ({
          id: h.heroId,
          cell: [h.gridCell.col, h.gridCell.row],
          mark: h.__mark || null,
          hp: h.currentHp,
          maxHp: h.maxHp,
          atk: h.atk,
          def: h.defStat,
        })),
        selected: e.selectedUnit ? { ...e.selectedUnit } : null,
        firstStrike: fs instanceof Map ? [...fs.entries()] : null,
      };
    });
  const heroMarks = (s) => s.heroes.map((h) => [h.id, h.mark]);
  /** 某一格的占用者（武將識別碼、塔識別碼或 null） */
  const occupantAt = (p, [col, row]) =>
    p.evaluate(
      ({ c, r }) => {
        const o = window.__testBridge.engine.gameMap.getOccupant(c, r);
        if (!o) return null;
        return o.isHero
          ? `hero:${o.heroId}`
          : o.towerUid
            ? `tower:${o.towerUid}`
            : "other";
      },
      { c: col, r: row }
    );
  /** 標記某位武將目前的實例並記下參照（之後判斷是不是同一個實例、受控陣亡用） */
  const markHero = (p, heroId, mark) =>
    p.evaluate(
      ({ id, m }) => {
        const h = window.__testBridge.engine.heroes.find(
          (x) => x.heroId === id
        );
        if (!h) return false;
        h.__mark = m;
        window.__heroRef = window.__heroRef || {};
        window.__heroRef[m] = h;
        return true;
      },
      { id: heroId, m: mark }
    );
  /** 受控的真正陣亡：對記下的武將實例一次給足以打倒的傷害（走 HeroEntity.takeDamage 的死亡流程） */
  const killHero = (p, mark) =>
    p.evaluate((m) => {
      const e = window.__testBridge.engine;
      const h = window.__heroRef && window.__heroRef[m];
      if (!h) return null;
      h.takeDamage(1e9, null, e.floatingTexts, e.soundManager);
      return { isDead: h.isDead, hp: h.currentHp };
    }, mark);
  /** 用頁面同一個入口派武將（不經過部署選單的停用） */
  const bridgePlace = (p, [col, row], state) =>
    p.evaluate(({ c, r, s }) => window.__testBridge.placeHero(c, r, s), {
      c: col,
      r: row,
      s: state,
    });
  /** 點畫布上武將所在的格子打開武將資訊，回傳面板文字 */
  async function openHeroInfo(p, cell) {
    const pt = await cellPoint(p, cell);
    if (!pt.onCanvas) return null;
    await p.mouse.click(pt.x, pt.y);
    const panel = p.locator(HERO_INFO);
    if (!(await until(() => panel.isVisible(), 5000))) return null;
    return (await panel.innerText()).replace(/\s+/g, " ").trim();
  }
  /** 在測試側包住既有的 battleManager.consumeFirstStrike：記下每次判定的武將與結果，再原樣回傳（不改判定） */
  const watchFirstStrike = (p) =>
    p.evaluate(() => {
      const b = window.__testBridge && window.__testBridge.engine.battleManager;
      if (!b || typeof b.consumeFirstStrike !== "function") return false;
      if (!b.__fsLog) {
        b.__fsLog = [];
        const orig = b.consumeFirstStrike;
        b.consumeFirstStrike = function (heroId, damage) {
          const ok = orig.call(this, heroId, damage);
          b.__fsLog.push({ id: heroId, ok });
          return ok;
        };
      }
      return true;
    });
  const firstStrikeLog = (p) =>
    p.evaluate(() => window.__testBridge.engine.battleManager.__fsLog || []);
  const heroInfoText = async (p) =>
    (await p.locator(HERO_INFO).count())
      ? (await p.locator(HERO_INFO).innerText()).replace(/\s+/g, " ").trim()
      : null;

  await scenario(
    "武將派出與陣亡：訪客備戰中派出後入口拒絕同一位，受控陣亡後選單恢復、同一場再派",
    async (mk) => {
      const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      check("可以觀測部署資料", await watchPlacements(p));
      const d1 = await deployHero(p, ROAD_CELLS[0], "馬超");
      const c1 = await menuCard(p, ROAD_CELLS[8], "馬超");
      const s1 = await heroField(p);
      check(
        "從部署選單派出馬超到 (2,3)：場上一位馬超、免費（5000），選單上的馬超是「已在場上」且不能點",
        d1.ok &&
          s1.heroes.length === 1 &&
          s1.heroes[0].id === "hero_ma_chao" &&
          sameJson(s1.heroes[0].cell, [2, 3]) &&
          s1.gold === 5000 &&
          c1.ok &&
          c1.disabled &&
          /已在場上/.test(c1.text),
        { d1, c1, s1 }
      );
      const st = lastState(await fieldOf(p));
      const r1 = await bridgePlace(p, ROAD_CELLS[2], st);
      const r2 = await bridgePlace(p, ROAD_CELLS[0], st);
      const s2 = await heroField(p);
      check(
        "馬超還在場上：頁面的派出入口送同一位到別格 (4,3) 與同一格都被拒，場上不變、(4,3) 沒有占用",
        !!st &&
          r1 === false &&
          r2 === false &&
          sameJson(s2, s1) &&
          (await occupantAt(p, ROAD_CELLS[2])) === null,
        { st, r1, r2, s1, s2 }
      );
      const d2 = await deployHero(p, ROAD_CELLS[2], "趙雲");
      check(
        "另一位武將（趙雲）照常派到 (4,3)，標記兩位的實例",
        d2.ok &&
          (await markHero(p, "hero_ma_chao", "ma1")) &&
          (await markHero(p, "hero_zhao_yun", "zy1")),
        d2
      );
      const info1 = await openHeroInfo(p, ROAD_CELLS[0]);
      check("點馬超打開武將資訊", !!info1 && /馬超/.test(info1), info1);
      const k1 = await killHero(p, "ma1");
      await sleep(300);
      const s3 = await heroField(p);
      const info2 = await heroInfoText(p);
      check(
        "馬超受控陣亡：從場上移除、(2,3) 釋放、取消選取、馬超的資訊視窗關閉；趙雲還在 (4,3)",
        !!k1 &&
          k1.isDead === true &&
          k1.hp === 0 &&
          sameJson(heroMarks(s3), [["hero_zhao_yun", "zy1"]]) &&
          (await occupantAt(p, ROAD_CELLS[0])) === null &&
          (await occupantAt(p, ROAD_CELLS[2])) === "hero:hero_zhao_yun" &&
          s3.selected === null &&
          info2 === null,
        { k1, s3, info2 }
      );
      const c2 = await menuCard(p, ROAD_CELLS[8], "馬超");
      const c2b = await menuCard(p, ROAD_CELLS[8], "趙雲");
      check(
        "部署選單：馬超不再是「已在場上」、可以點；趙雲仍是「已在場上」",
        c2.ok &&
          !c2.disabled &&
          !/已在場上/.test(c2.text) &&
          c2b.ok &&
          c2b.disabled &&
          /已在場上/.test(c2b.text),
        { c2, c2b }
      );
      const d3 = await deployHero(p, ROAD_CELLS[0], "馬超");
      const s4 = await heroField(p);
      const c3 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "同一場再派馬超到同一格 (2,3)：新的實例、同一個 battleId、免費（仍 5000）；選單又是「已在場上」",
        d3.ok &&
          s4.battleId === s1.battleId &&
          s4.gold === 5000 &&
          sameJson(heroMarks(s4), [
            ["hero_zhao_yun", "zy1"],
            ["hero_ma_chao", null],
          ]) &&
          (await occupantAt(p, ROAD_CELLS[0])) === "hero:hero_ma_chao" &&
          c3.ok &&
          c3.disabled,
        { d3, s4, c3 }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "武將派出與陣亡：共用帳號戰鬥中用過首擊的馬超受控陣亡，同一場再派，首擊紀錄不變；趙雲的資訊視窗不受影響；沒有寫入",
    async (mk) => {
      const data = NEW({
        capacity: 20,
        team: [
          { hero_id: "ma_chao", slot: 1 },
          { hero_id: "zhao_yun", slot: 2 },
        ],
      });
      const E = await mk({
        seed: [{ key: "k_herodie", data, rev: 3 }],
        maps: TWO_WAVE_MAPS,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: { shenma_player_key: "k_herodie" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[0], "馬超");
      const d2 = await deployHero(p, ROAD_CELLS[11], "趙雲");
      check(
        "備戰中派出馬超 (2,3)、趙雲 (2,6)，標記實例",
        d1.ok &&
          d2.ok &&
          (await markHero(p, "hero_ma_chao", "ma1")) &&
          (await markHero(p, "hero_zhao_yun", "zy1")),
        { d1, d2 }
      );
      check("可以觀測首擊判定", await watchFirstStrike(p));
      check("按進入戰場開第 1 波", await startBattle(p));
      check("馬超打到木樁、首擊紀錄寫下", await waitFirstStrike(p));
      const s1 = await heroField(p);
      const info = await openHeroInfo(p, ROAD_CELLS[11]);
      check("點趙雲打開武將資訊", !!info && /趙雲/.test(info), info);
      const k = await killHero(p, "ma1");
      await sleep(300);
      const s2 = await heroField(p);
      const infoText = await heroInfoText(p);
      check(
        "馬超受控陣亡：移除、(2,3) 釋放；趙雲的資訊視窗仍開著、仍選著趙雲；首擊紀錄不變",
        !!k &&
          k.isDead === true &&
          sameJson(heroMarks(s2), [["hero_zhao_yun", "zy1"]]) &&
          (await occupantAt(p, ROAD_CELLS[0])) === null &&
          !!infoText &&
          /趙雲/.test(infoText) &&
          sameJson(s2.selected, {
            type: "hero",
            id: "hero_zhao_yun",
            col: 2,
            row: 6,
          }) &&
          sameJson(s2.firstStrike, s1.firstStrike),
        { k, s1, s2, infoText }
      );
      await p
        .locator(HERO_INFO)
        .locator("button", { hasText: "×" })
        .first()
        .click()
        .catch(() => {});
      await until(async () => (await p.locator(HERO_INFO).count()) === 0, 5000);
      // 再派到木樁前方的道路，讓新的馬超一定會攻擊到它
      const ahead = await p.evaluate(() => {
        const e = window.__testBridge.engine;
        const en = e.waveManager.activeEnemies.find((x) => !x.isDead);
        if (!en) return null;
        const g = e.gameMap.worldToGrid(en.x, en.y);
        for (let c = Math.max(3, g.col + 1); c <= 12; c++)
          if (e.gameMap.canPlaceHero(c, 3)) return [c, 3];
        return null;
      });
      const n0 = (await firstStrikeLog(p)).length;
      const d3 = ahead
        ? await deployHero(p, ahead, "馬超")
        : { ok: false, step: "no-enemy-ahead" };
      const attacked = await until(
        async () =>
          (await firstStrikeLog(p))
            .slice(n0)
            .some((x) => x.id === "hero_ma_chao"),
        15000
      );
      const post = (await firstStrikeLog(p)).slice(n0);
      const s3 = await heroField(p);
      check(
        "同一場再派馬超到木樁前方：新的實例攻擊時不再觸發首擊（同一場只觸發一次），同一個 battleId、首擊紀錄逐字不變（只核紀錄，不驗傷害）",
        d3.ok &&
          !!attacked &&
          post.length > 0 &&
          post.every((x) => x.ok === false) &&
          s3.battleId === s1.battleId &&
          sameJson(heroMarks(s3), [
            ["hero_zhao_yun", "zy1"],
            ["hero_ma_chao", null],
          ]) &&
          !!s1.firstStrike &&
          s1.firstStrike.length === 1 &&
          sameJson(s3.firstStrike, s1.firstStrike),
        { ahead, d3, attacked, post: post.slice(0, 5), s1, s3 }
      );
      const back = readBack(E, "k_herodie");
      check(
        "沒有任何寫入；雲端存檔的世界金幣 500、版本 3 不變",
        E.gas.writes().length === 0 &&
          !!back &&
          back.rev === 3 &&
          back.data.gold === 500,
        { writes: E.gas.writes(), back }
      );
      return E;
    }
  );

  await scenario(
    "武將派出與陣亡：後端設定到達重新載入後，上一場武將晚到的陣亡與舊場次的通知都不改新場的部署名單",
    async (mk) => {
      const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
      const hold = E.gas.rule("get_all_maps", "hold");
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      check(
        "後端關卡設定還沒回應（暫停中）",
        await until(() => hold.waiting.length > 0, 15000)
      );
      const bid0 = await stableBattle(p);
      const roads = await roadCellsOf(p);
      const d0 = roads.length
        ? await deployHero(p, roads[0], "馬超")
        : { ok: false, step: "no-road-cell" };
      check(
        "內建關卡上派出馬超並記下這個實例",
        d0.ok && (await markHero(p, "hero_ma_chao", "old")),
        { d0, roads: roads.length }
      );
      check("放行後端關卡設定", hold.release("ok") === 1);
      const bid1 = await nextBattle(p, bid0);
      const s0 = await heroField(p);
      const c0 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "重新載入成新的一場：場上沒有武將，選單上的馬超可以點",
        !!bid1 &&
          bid1 !== bid0 &&
          s0.heroes.length === 0 &&
          c0.ok &&
          !c0.disabled,
        { bid0, bid1, s0, c0 }
      );
      const d1 = await deployHero(p, ROAD_CELLS[0], "馬超");
      check("新的一場派出馬超到 (2,3)", d1.ok, d1);
      const s1 = await heroField(p);
      const k = await killHero(p, "old");
      await sleep(300);
      const s2 = await heroField(p);
      const c1 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "上一場的馬超晚到陣亡：新場的馬超、(2,3) 與選單上的「已在場上」都不變",
        !!k &&
          k.isDead === true &&
          sameJson(s2, s1) &&
          (await occupantAt(p, ROAD_CELLS[0])) === "hero:hero_ma_chao" &&
          c1.ok &&
          c1.disabled &&
          /已在場上/.test(c1.text),
        { k, s1, s2, c1 }
      );
      const injected = await p.evaluate((oldBid) => {
        const b = window.__testBridge;
        if (typeof b.onHeroRosterChanged !== "function") return "no-handler";
        b.onHeroRosterChanged({
          battleId: oldBid,
          aliveHeroIds: Object.freeze([]),
          died: window.__heroRef.old,
        });
        return "sent";
      }, bid0);
      await sleep(300);
      const c2 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "受控送出上一場的陣亡通知（舊 battleId、存活名單是空的）：頁面不採用，選單上的馬超仍是「已在場上」",
        injected === "sent" && c2.ok && c2.disabled && /已在場上/.test(c2.text),
        { injected, c2 }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "武將派出與陣亡：390×600 受控陣亡後，部署選單的馬超看得到、可以用鍵盤再派",
    async (mk) => {
      const E = await mk({
        maps: SKILL_MAPS,
        enemies: ENEMIES,
        viewport: { width: 390, height: 600 },
      });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[0], "馬超");
      check(
        "派出馬超並標記實例",
        d1.ok && (await markHero(p, "hero_ma_chao", "ma1")),
        d1
      );
      const k = await killHero(p, "ma1");
      await sleep(300);
      const pt = await cellPoint(p, ROAD_CELLS[0]);
      if (pt.onCanvas) await p.mouse.click(pt.x, pt.y);
      const menu = p.locator(PLACEMENT_MENU);
      const opened = await until(() => menu.isVisible(), 5000);
      // 選單有約 0.15 秒的放大動畫：等它結束再取點與截圖
      await sleep(400);
      const card = menu.locator("button", { hasText: "馬超" }).first();
      const o = await card
        .evaluate((btn) => {
          btn.scrollIntoView({ block: "nearest" });
          const r = btn.getBoundingClientRect();
          const hit = document.elementFromPoint(
            r.left + r.width / 2,
            r.top + r.height / 2
          );
          return {
            inView:
              r.top >= 0 &&
              r.bottom <= innerHeight &&
              r.left >= 0 &&
              r.right <= innerWidth,
            hit: !!hit && btn.contains(hit),
            disabled: btn.disabled,
            text: btn.innerText.replace(/\s+/g, " ").trim(),
            noHScroll: document.documentElement.scrollWidth <= innerWidth + 1,
          };
        })
        .catch((err) => ({ error: String(err) }));
      check(
        "390×600：馬超陣亡後，(2,3) 的部署選單上馬超可以點、在視窗內、點得到，沒有橫向捲動",
        !!k &&
          k.isDead === true &&
          pt.onCanvas &&
          !!opened &&
          o.inView === true &&
          o.hit === true &&
          o.disabled === false &&
          !/已在場上/.test(o.text || "") &&
          o.noHScroll === true,
        { k, pt, opened, o }
      );
      await shot(p, "hero-redeploy-390x600");
      await card.focus();
      await p.keyboard.press("Enter");
      const closed = await until(async () => (await menu.count()) === 0, 5000);
      const s = await heroField(p);
      check(
        "鍵盤（在馬超卡片按 Enter）：選單關閉，馬超再派到 (2,3)（新的實例）",
        !!closed &&
          sameJson(heroMarks(s), [["hero_ma_chao", null]]) &&
          (await occupantAt(p, ROAD_CELLS[0])) === "hero:hero_ma_chao",
        { closed, s }
      );
      return E;
    }
  );

  await scenario(
    "武將派出與陣亡：共用帳號存檔裡 0 生命／0 攻擊／0 防禦的馬超，戰場實例也是 0（不換成預設值）",
    async (mk) => {
      const data = NEW({
        capacity: 20,
        heroes: [
          { hero_id: "ma_chao", level: 3, star: 0, atk: 0, def: 0, hp: 0 },
        ],
        team: [{ hero_id: "ma_chao", slot: 1 }],
      });
      const E = await mk({
        seed: [{ key: "k_zero", data, rev: 2 }],
        maps: SKILL_MAPS,
        enemies: ENEMIES,
      });
      const p = await E.page({ storage: { shenma_player_key: "k_zero" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      check("可以觀測部署資料", await watchPlacements(p));
      const d = await deployHero(p, ROAD_CELLS[0], "馬超");
      const st = lastState(await fieldOf(p));
      const s = await heroField(p);
      const h = s.heroes[0];
      check(
        "部署資料照存檔（0 照樣是 0），戰場實例：生命 0／最大 0、攻擊 0、防禦 0",
        d.ok &&
          !!st &&
          st.hp === 0 &&
          st.atk === 0 &&
          st.def === 0 &&
          s.heroes.length === 1 &&
          !!h &&
          sameJson([h.hp, h.maxHp, h.atk, h.def], [0, 0, 0, 0]),
        { d, st, s }
      );
      check("沒有任何寫入", E.gas.writes().length === 0, E.gas.writes());
      return E;
    }
  );

  await scenario(
    "武將派出與陣亡：訪客隊伍裡 0 攻擊／0 防禦的馬超與一般數值的周瑜，戰場實例照存檔",
    async (mk) => {
      const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
      const p = await E.page({
        storage: guestStorage(
          [
            {
              hero_id: "hero_ma_chao",
              level: 1,
              star: 1,
              atk: 0,
              def: 0,
              hp: 500,
            },
            {
              hero_id: "hero_zhou_yu",
              level: 1,
              star: 1,
              atk: 135,
              def: 55,
              hp: 1000,
            },
          ],
          [
            { slot: 0, hero_id: "hero_ma_chao" },
            { slot: 1, hero_id: "hero_zhou_yu" },
          ]
        ),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[0], "馬超");
      const d2 = await deployHero(p, ROAD_CELLS[2], "周瑜");
      const s = await heroField(p);
      const v = (id) => {
        const h = s.heroes.find((x) => x.id === id);
        return h ? [h.hp, h.maxHp, h.atk, h.def] : null;
      };
      check(
        "馬超：生命 500／最大 500、攻擊 0、防禦 0；周瑜：生命 1000／最大 1000、攻擊 135、防禦 55",
        d1.ok &&
          d2.ok &&
          sameJson(v("hero_ma_chao"), [500, 500, 0, 0]) &&
          sameJson(v("hero_zhou_yu"), [1000, 1000, 135, 55]),
        { d1, d2, s }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

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

  // ═══ 技能接線：所有情境送出的寫入 body 都沒有派生的 skill（誘餌情境存檔原有的那一筆原樣保留） ═══
  {
    current = { name: "技能接線：全部情境的寫入" };
    const found = [];
    for (const sc of scenarios)
      for (const e of sc.gas || [])
        if (WRITE_ACTIONS.has(e.action))
          for (const path of skillPaths(e.payload))
            found.push({ scenario: sc.name, action: e.action, path });
    const allowed = found.filter(
      (f) =>
        f.scenario === DECOY_SCENARIO &&
        f.action === "save_profile" &&
        f.path === ".data.heroes[0].skill"
    );
    check(
      "create／save／upgrade／result 的 body 沒有派生的 skill（只有誘餌情境存檔原有的 heroes[0].skill）",
      found.length === allowed.length && allowed.length === 1,
      found
    );
    current = null;
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
      ...(s.notes ? { notes: s.notes } : {}),
    })),
  };
};
