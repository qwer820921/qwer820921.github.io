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
    // 備戰中同帳號改隊伍：存檔只送 team（沒有 skill），同一場同步、不重新載入（馬超、趙雲是原本的實例），之後部署用新隊伍的資料
    // 改隊伍前在測試側記下馬超、趙雲這兩個實例（之後比對是不是同一個物件）
    await p.evaluate(() => {
      const e = window.__testBridge.engine;
      window.__keep22 = {
        ma: e.heroes.find((h) => h.heroId === "hero_ma_chao"),
        zy: e.heroes.find((h) => h.heroId === "hero_zhao_yun"),
      };
    });
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
    const bidStable = await stableBattle(p);
    const s2 = await fieldOf(p);
    const kept2 = await p.evaluate(() => {
      const e = window.__testBridge.engine;
      const k = window.__keep22 || {};
      const ma = e.heroes.find((h) => h.heroId === "hero_ma_chao");
      const zy = e.heroes.find((h) => h.heroId === "hero_zhao_yun");
      return {
        count: e.heroes.length,
        sameMa: !!ma && ma === k.ma,
        sameZy: !!zy && zy === k.zy,
        ma: ma ? [ma.currentHp, ma.maxHp, ma.isDead] : null,
      };
    });
    check(
      "備戰中同帳號改隊伍不重新載入：同一個 battleId，馬超與趙雲是原本的實例、技能欄位不變",
      bidStable === s1.battleId &&
        s2.battleId === s1.battleId &&
        kept2.count === 2 &&
        kept2.sameMa &&
        kept2.sameZy &&
        sameJson(kept2.ma, [0, 0, false]) &&
        sameJson(heroVec(s2), [
          ["hero_ma_chao", wantFields("hero_ma_chao")],
          ["hero_zhao_yun", wantFields("hero_zhao_yun")],
        ]),
      { bidStable, before: s1.battleId, s2, kept2 }
    );
    const d3 = await deployHero(p, ROAD_CELLS[6], "黃忠");
    const s3 = await fieldOf(p);
    const kept3 = await p.evaluate(() => {
      const e = window.__testBridge.engine;
      const k = window.__keep22 || {};
      k.hz = e.heroes.find((h) => h.heroId === "hero_huang_zhong");
      return {
        count: e.heroes.length,
        sameMa: !!k.ma && e.heroes.includes(k.ma),
        sameZy: !!k.zy && e.heroes.includes(k.zy),
        hz: !!k.hz,
      };
    });
    check(
      "改隊伍後部署黃忠：部署資料帶長射程 1.5，黃忠的實例只有射程倍率 1.5，馬超與趙雲的技能欄位不變",
      d3.ok &&
        sameJson(
          lastState(s3),
          wantPayload("hero_huang_zhong", 1, 0, 125, 50, 1000)
        ) &&
        kept3.count === 3 &&
        kept3.sameMa &&
        kept3.sameZy &&
        kept3.hz &&
        sameJson(heroVec(s3), [
          ["hero_ma_chao", wantFields("hero_ma_chao")],
          ["hero_zhao_yun", wantFields("hero_zhao_yun")],
          ["hero_huang_zhong", wantFields("hero_huang_zhong")],
        ]),
      { d3, s3, kept3 }
    );
    // 只記錄：備戰中同帳號改隊伍後（同一場、馬超仍在場上）部署選單上馬超的卡片（「已在場上」由第 24 段的情境具名檢查）
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
      note("備戰中同帳號改隊伍後（同一場），部署選單上馬超的卡片", {
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
    const d4 = await deployHero(p, ROAD_CELLS[13], "周瑜");
    const s4 = await fieldOf(p);
    const kept4 = await p.evaluate(() => {
      const e = window.__testBridge.engine;
      const k = window.__keep22 || {};
      return {
        count: e.heroes.length,
        same: [k.ma, k.zy, k.hz].map((x) => !!x && e.heroes.includes(x)),
      };
    });
    check(
      "戰鬥中部署周瑜：部署資料與實例都是火攻 0.2／3 跳／1 秒；先前的實例（馬超、趙雲、黃忠）不變、技能欄位不變",
      d4.ok &&
        sameJson(
          lastState(s4),
          wantPayload("hero_zhou_yu", 1, 0, 135, 55, 1000)
        ) &&
        kept4.count === 4 &&
        kept4.same.every(Boolean) &&
        sameJson(heroVec(s4), [
          ["hero_ma_chao", wantFields("hero_ma_chao")],
          ["hero_zhao_yun", wantFields("hero_zhao_yun")],
          ["hero_huang_zhong", wantFields("hero_huang_zhong")],
          ["hero_zhou_yu", wantFields("hero_zhou_yu")],
        ]),
      { d4, s4, kept4 }
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
  // 備戰中每次重新載入（換帳號、後端設定較晚到、選關、重新挑戰）場上的武將都換新，部署選單的名單要一起清掉；
  // 同一個帳號改隊伍、升級不重新載入（同一場同步到場上），已部署的武將仍是原本的實例、選單上仍是「已在場上」。
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
    "備戰中同帳號改隊伍：保留馬超時不重新載入，同一場、生命 0 的馬超仍是原本的實例，仍「已在場上」不能重複派",
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
      check(
        "部署資料照存檔（0 照樣是 0）與正式技能，實例只有馬超的技能欄位",
        sameJson(lastState(s1), wantPayload("hero_ma_chao", 3, 0, 0, 0, 0)) &&
          sameJson(heroVec(s1), [["hero_ma_chao", wantFields("hero_ma_chao")]]),
        s1
      );
      check("標記馬超的實例", await markFirstHero(p));
      const heroNums = () =>
        p.evaluate(() =>
          window.__testBridge.engine.heroes.map((h) => [
            h.heroId,
            h.__mark || null,
            h.isDead,
            h.heroLevel,
            h.atk,
            h.defStat,
            h.currentHp,
            h.maxHp,
          ])
        );
      const n1 = await heroNums();
      await openTeam(p);
      check("選得到黃忠", await pickTeamHero(p, "黃忠"));
      await p.locator('[data-testid="team-edit-save"]').click();
      await until(async () => (await modal(p).count()) === 0, 10000);
      const saves = E.gas.log.filter((e) => e.action === "save_profile");
      const sent = saves[0] && saves[0].payload;
      check(
        "改隊伍保存一次，body 沒有 skill、除了 team 其他原樣，隊伍仍有馬超（馬超／趙雲／黃忠）",
        saves.length === 1 &&
          skillPaths(sent).length === 0 &&
          sameJson({ ...sent.data, team: null }, { ...data, team: null }) &&
          sameJson(sent.data.team.map((t) => t.hero_id).sort(), [
            "huang_zhong",
            "ma_chao",
            "zhao_yun",
          ]),
        saves.map((e) => e.payload)
      );
      const bidStable = await stableBattle(p);
      const s2 = await fieldOf(p);
      const n2 = await heroNums();
      check(
        "同帳號改隊伍後不重新載入：同一個 battleId、場上仍只有原本的馬超實例（生命 0、等級 3、攻防 0，沒有復活）",
        bidStable === s1.battleId &&
          s2.battleId === s1.battleId &&
          sameJson(n2, [["hero_ma_chao", "before", false, 3, 0, 0, 0, 0]]) &&
          sameJson(n2, n1),
        { before: s1.battleId, after: s2.battleId, n1, n2 }
      );
      check(
        "馬超的技能欄位不變（正式技能），沒有新的部署（不自動重派）",
        sameJson(heroVec(s2), [["hero_ma_chao", wantFields("hero_ma_chao")]]) &&
          s2.log.length === s1.log.length,
        { s1: s1.log.length, s2 }
      );
      const c2 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "改隊伍後選單上的馬超仍是「已在場上」、不能點（不能重複派）",
        c2.ok && c2.disabled && /已在場上/.test(c2.text),
        c2
      );
      const c3 = await menuCard(p, ROAD_CELLS[8], "黃忠");
      check(
        "新加的黃忠在選單上、可以點",
        c3.ok && !c3.disabled && !/已在場上/.test(c3.text),
        c3
      );
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
    // 敵人是被馬超擋住、打不倒的木樁：之後為了打開部署選單按「繼續」，戰鬥也不會因敵人被打完而結束
    const HOLD = {
      enemy_id: "dummy_hold",
      name: "測試木樁",
      hp: 1000000,
      speed: 60,
      atk: 1,
      movement_type: "ground",
      image: "enemy_grunt1.webp",
      attack_image: "enemy_grunt1_atk.webp",
    };
    const E = await mk({
      maps: SKILL_MAPS.map((m) => ({
        ...m,
        waves: [
          {
            wave: 1,
            enemies: [
              { enemy_id: "dummy_hold", count: 1, interval: 1, path: "path_a" },
            ],
          },
        ],
      })),
      enemies: [...ENEMIES, HOLD],
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
    // 暫停中不能打開新的部署選單：先按「繼續」再看選單
    await p.locator("button", { hasText: "▶ 繼續" }).first().click();
    await until(
      async () =>
        (await p.locator("button", { hasText: "⏸ 暫停" }).count()) > 0,
      5000
    );
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
  // 只有還沒開打（第 0 波）時換帳號才重新載入（第 24 段已驗）；同一個帳號改隊伍不論波次都不重開，同一場同步到場上（第 35 段）
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

  // ═══ 28. 暫停時的操作守門與部署選單慢速 ═══
  // 派武將、建塔、升級只在備戰或戰鬥中、沒有暫停時執行：暫停中不能打開新的部署選單，選單與升級面板停用並說明，
  // 頁面用的同一個入口（window.__testBridge 的 placeHero／placeTower／upgradeTower）也拒絕。部署選單開著時是 0.1 倍慢速（不乘 1 或 2 倍），
  // 關閉要帶打開時的這一場與選單編號。階段與結束用既有的操作或受控回呼（不是自然通關）；慢速量測有固定時間窗與容差
  /** 引擎目前的這一場：階段、暫停、速度、選單編號、實際倍率、戰場金幣、武將數、塔（識別碼、等級、投入） */
  const ctl = (p) =>
    p.evaluate(() => {
      const e = window.__testBridge.engine;
      const b = e.battleManager;
      return {
        battleId: b.battleId,
        state: b.gameState,
        paused: b.manualPaused,
        speed: b.speedPref,
        menuId: b.deployMenuId,
        scale: b.effectiveTimeScale(),
        gold: b.battleGold,
        heroes: e.heroes.length,
        towers: e.towers.map((t) => [t.towerUid, t.towerLevel, t.investedGold]),
      };
    });
  const menuShown = async (p) => (await p.locator(PLACEMENT_MENU).count()) > 0;
  /** 點畫布上的一格（玩法提示擋住時先收起），回傳是否點到畫布 */
  async function clickCell(p, cell) {
    const pt = await cellPoint(p, cell);
    if (pt.onCanvas) await p.mouse.click(pt.x, pt.y);
    return pt.onCanvas;
  }
  async function pauseHud(p) {
    await p.locator("button", { hasText: "⏸ 暫停" }).first().click();
    return until(
      async () =>
        (await p.locator("button", { hasText: "▶ 繼續" }).count()) > 0,
      5000
    );
  }
  async function resumeHud(p) {
    await p.locator("button", { hasText: "▶ 繼續" }).first().click();
    return until(
      async () =>
        (await p.locator("button", { hasText: "⏸ 暫停" }).count()) > 0,
      5000
    );
  }
  const closeMenuX = (p) =>
    p
      .locator(PLACEMENT_MENU)
      .locator("button", { hasText: "×" })
      .first()
      .click()
      .catch(() => {});
  /** 選單上某張卡片：是否停用 */
  const cardDisabled = (p, name) =>
    p
      .locator(PLACEMENT_MENU)
      .locator("button", { hasText: name })
      .first()
      .isDisabled()
      .catch(() => null);
  const blockedHint = async (p) => {
    const x = p.locator('[data-testid="placement-blocked-hint"]');
    return (await x.count()) ? (await x.innerText()).trim() : null;
  };
  const upgradeInfo = (p) =>
    p.evaluate(() => {
      const b = document.querySelector('[data-testid="tower-upgrade"]');
      const h = document.querySelector('[data-testid="tower-upgrade-hint"]');
      return b
        ? { disabled: b.disabled, hint: h ? h.innerText.trim() : null }
        : null;
    });
  const UPGRADE_HINT = "暫停中或不在備戰、戰鬥時不能升級。";
  const PAUSE_HINT = "暫停中不能派武將或建塔，可以先關閉選單。";

  await scenario(
    "暫停守門：訪客備戰中暫停時不能開部署選單，派人、建塔、升級的入口也拒；繼續後新的點擊才成功",
    async (mk) => {
      const E = await mk({ maps: TOWER_MAPS, enemies: TOWER_ENEMIES });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      check("可以觀測部署資料", await watchPlacements(p));
      const b1 = await buildTower(p, TOWER_CELLS[0], "弓兵塔");
      await towerPanel(p, TOWER_CELLS[0]);
      const u0 = await upgradeInfo(p);
      await closePanel(p);
      check(
        "前置：備戰中建弓兵塔 A（4950），升級按鈕可以按、沒有說明",
        b1.ok && !!u0 && u0.disabled === false && u0.hint === null,
        { b1, u0 }
      );
      check("按暫停", await pauseHud(p));
      const s0 = await ctl(p);
      const clicked = await clickCell(p, ROAD_CELLS[0]);
      await sleep(800);
      const s1 = await ctl(p);
      check(
        "暫停中點空的道路格：不打開部署選單、選單編號 0、倍率不變",
        clicked && !(await menuShown(p)) && s1.menuId === 0 && sameJson(s1, s0),
        { clicked, s0, s1 }
      );
      const heroState = DEFAULT_SORTIE.find((x) => x[0] === "hero_ma_chao");
      const r = await p.evaluate(
        ({ hs }) => {
          const b = window.__testBridge;
          return {
            hero: b.placeHero(2, 3, {
              hero_id: hs[0],
              level: hs[2],
              star: hs[3],
              atk: hs[4],
              def: hs[5],
              hp: hs[6],
            }),
            tower: b.placeTower(4, 1, "archer"),
            upgrade: b.upgradeTower(2, 1),
          };
        },
        { hs: heroState }
      );
      const s2 = await ctl(p);
      check(
        "暫停中：頁面用的派武將、建塔、升級入口都被拒，金幣、武將、塔都不變",
        r.hero === false &&
          r.tower === false &&
          r.upgrade === false &&
          sameJson(s2, s0),
        { r, s0, s2 }
      );
      await towerPanel(p, TOWER_CELLS[0]);
      const u1 = await upgradeInfo(p);
      check(
        "暫停中仍可以點塔看資訊；升級按鈕停用並說明",
        !!u1 && u1.disabled === true && u1.hint === UPGRADE_HINT,
        u1
      );
      await closePanel(p);
      check("按繼續", await resumeHud(p));
      const s3 = await ctl(p);
      check(
        "繼續本身不補送暫停時的操作（金幣、武將、塔都和暫停時一樣）",
        s3.paused === false &&
          s3.gold === s0.gold &&
          s3.heroes === s0.heroes &&
          sameJson(s3.towers, s0.towers),
        { s0, s3 }
      );
      const d = await deployHero(p, ROAD_CELLS[0], "馬超");
      const b2 = await buildTower(p, TOWER_CELLS[1], "弓兵塔");
      await towerPanel(p, TOWER_CELLS[0]);
      await p.locator('[data-testid="tower-upgrade"]').click();
      await sleep(300);
      await closePanel(p);
      const s4 = await ctl(p);
      check(
        "繼續後新的點擊：派馬超、建弓兵塔 B（4950 → 4900）、升級 A（4900 → 4850、Lv.2）都成功，選單關閉後倍率回到 1",
        d.ok &&
          b2.ok &&
          s4.heroes === 1 &&
          s4.gold === 4850 &&
          s4.towers.length === 2 &&
          s4.towers[0][1] === 2 &&
          s4.menuId === 0 &&
          s4.scale === 1,
        { d, b2, s4 }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "暫停守門：部署選單開著時暫停，卡片停用並說明，入口也拒；取消只關選單、仍在暫停",
    async (mk) => {
      const E = await mk({ maps: TOWER_MAPS, enemies: TOWER_ENEMIES });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const clicked = await clickCell(p, ROAD_CELLS[0]);
      const opened = await until(() => menuShown(p), 5000);
      const s0 = await ctl(p);
      const d0 = await cardDisabled(p, "馬超");
      check(
        "備戰中點空的道路格：打開部署選單（編號大於 0、倍率 0.1），馬超可以點、沒有說明",
        clicked &&
          !!opened &&
          s0.menuId > 0 &&
          s0.scale === 0.1 &&
          d0 === false &&
          (await blockedHint(p)) === null,
        { clicked, opened, s0, d0 }
      );
      // HUD 的暫停按鈕在部署選單的遮罩底下按不到：用頁面同一個橋接入口受控暫停
      await p.evaluate(() => window.__testBridge.setPaused(true));
      check(
        "選單開著時受控暫停",
        await until(
          async () =>
            (await p.locator("button", { hasText: "▶ 繼續" }).count()) > 0,
          5000
        )
      );
      const d1 = await cardDisabled(p, "馬超");
      const h1 = await blockedHint(p);
      const s1 = await ctl(p);
      check(
        "暫停後選單仍開著：馬超卡片停用並說明「暫停中不能派武將或建塔，可以先關閉選單。」，選單編號不變",
        (await menuShown(p)) &&
          d1 === true &&
          h1 === PAUSE_HINT &&
          s1.paused === true &&
          s1.menuId === s0.menuId,
        { d1, h1, s1 }
      );
      const ms = DEFAULT_SORTIE.find((x) => x[0] === "hero_ma_chao");
      const r = await p.evaluate(
        (hs) =>
          window.__testBridge.placeHero(2, 3, {
            hero_id: hs[0],
            level: hs[2],
            star: hs[3],
            atk: hs[4],
            def: hs[5],
            hp: hs[6],
          }),
        ms
      );
      const s2 = await ctl(p);
      check(
        "暫停中從頁面的入口派馬超：被拒，場上沒有武將，選單仍開著",
        r === false && s2.heroes === 0 && (await menuShown(p)),
        { r, s2 }
      );
      await closeMenuX(p);
      await until(async () => !(await menuShown(p)), 5000);
      const s3 = await ctl(p);
      check(
        "按 × 取消：選單關閉、選單編號 0，但仍在暫停（取消不解除暫停）",
        !(await menuShown(p)) &&
          s3.menuId === 0 &&
          s3.paused === true &&
          (await p.locator("button", { hasText: "▶ 繼續" }).count()) > 0,
        s3
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "部署慢速：戰鬥中 1 倍、2 倍、選單開著（2 倍時仍 0.1）、暫停的戰鬥時間與木樁移動",
    async (mk) => {
      const E = await mk({ maps: TOWER_MAPS, enemies: TOWER_ENEMIES });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      check("按進入戰場開戰", await startBattle(p));
      check(
        "木樁出現",
        await until(
          () =>
            p.evaluate(
              () =>
                window.__testBridge.engine.waveManager.activeEnemies.length > 0
            ),
          10000
        )
      );
      /** 量一個時間窗：戰鬥時間與木樁位置的變化，以頁面的 performance.now() 算實際經過的秒數 */
      const read = () =>
        p.evaluate(() => {
          const e = window.__testBridge.engine;
          const en = e.waveManager.activeEnemies.find((x) => !x.isDead);
          return {
            bt: e.battleManager.battleTime,
            now: performance.now(),
            x: en ? en.x : null,
            y: en ? en.y : null,
          };
        });
      const sample = async (ms) => {
        const a = await read();
        await sleep(ms);
        const b = await read();
        const wall = (b.now - a.now) / 1000;
        const dx =
          a.x === null || b.x === null
            ? null
            : Math.hypot(b.x - a.x, b.y - a.y);
        return {
          wall,
          dt: b.bt - a.bt,
          rate: (b.bt - a.bt) / wall,
          move: dx === null ? null : dx / wall,
        };
      };
      const w1 = await sample(1500);
      await p.locator("button", { hasText: "2x" }).first().click();
      await sleep(200);
      const w2 = await sample(1500);
      const clicked = await clickCell(p, ROAD_CELLS[10]);
      const opened = await until(() => menuShown(p), 5000);
      const c3 = await ctl(p);
      const w3 = await sample(1500);
      await closeMenuX(p);
      await until(async () => !(await menuShown(p)), 5000);
      const c4 = await ctl(p);
      const w4 = await sample(1500);
      check("按暫停", await pauseHud(p));
      const w5 = await sample(1000);
      check("按繼續", await resumeHud(p));
      const ratio = (a, b) => (b ? a / b : null);
      const m = {
        r1: w1.rate,
        r2: ratio(w2.rate, w1.rate),
        rMenu: ratio(w3.rate, w1.rate),
        r2back: ratio(w4.rate, w1.rate),
        move1: w1.move,
        moveMenu: ratio(w3.move, w1.move),
      };
      check(
        "1 倍時戰鬥時間約等於實際時間（0.75～1.1）",
        m.r1 >= 0.75 && m.r1 <= 1.1,
        { m, w1 }
      );
      check(
        "選 2 倍後約是 1 倍的 2 倍（1.7～2.3）",
        m.r2 >= 1.7 && m.r2 <= 2.3,
        { m, w2 }
      );
      check(
        "2 倍時打開部署選單：速度仍是 2、實際倍率 0.1，戰鬥時間與木樁移動約是 1 倍的 0.1（0.06～0.14）",
        clicked &&
          !!opened &&
          c3.speed === 2 &&
          c3.scale === 0.1 &&
          m.rMenu >= 0.06 &&
          m.rMenu <= 0.14 &&
          m.moveMenu !== null &&
          m.moveMenu >= 0.05 &&
          m.moveMenu <= 0.15,
        { m, c3, w3 }
      );
      check(
        "按 × 關閉選單：恢復 2 倍（1.7～2.3），選單編號 0",
        c4.menuId === 0 && c4.scale === 2 && m.r2back >= 1.7 && m.r2back <= 2.3,
        { m, c4, w4 }
      );
      check("暫停時戰鬥時間完全不增加", w5.dt === 0, w5);
      return E;
    }
  );

  await scenario(
    "部署選單編號：關閉帶打開時的那一組；舊的一組關不掉新選單，過期的選單也不能派",
    async (mk) => {
      const E = await mk({ maps: TOWER_MAPS, enemies: TOWER_ENEMIES });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      await clickCell(p, ROAD_CELLS[0]);
      await until(() => menuShown(p), 5000);
      const a = await ctl(p);
      await closeMenuX(p);
      await until(async () => !(await menuShown(p)), 5000);
      const a2 = await ctl(p);
      await clickCell(p, ROAD_CELLS[0]);
      await until(() => menuShown(p), 5000);
      const b = await ctl(p);
      check(
        "先開 A 再按 × 關閉（倍率回到 1），再開 B：B 的編號比 A 大、倍率 0.1",
        a.menuId > 0 &&
          a2.menuId === 0 &&
          a2.scale === 1 &&
          b.menuId > a.menuId &&
          b.scale === 0.1,
        { a, a2, b }
      );
      const oldClose = await p.evaluate(
        (ctx) => window.__testBridge.closeDeployMenu(ctx),
        { battleId: a.battleId, menuId: a.menuId }
      );
      const b2 = await ctl(p);
      check(
        "用 A 的那一組關閉：無效，B 的選單仍開著、倍率仍 0.1",
        oldClose === false &&
          (await menuShown(p)) &&
          b2.menuId === b.menuId &&
          b2.scale === 0.1,
        { oldClose, b2 }
      );
      // 受控：B 的編號在頁面不知道的情況下被關掉，畫面上 B 還在（模擬過期的選單）
      const sneak = await p.evaluate(
        (ctx) => window.__testBridge.closeDeployMenu(ctx),
        { battleId: b.battleId, menuId: b.menuId }
      );
      await p
        .locator(PLACEMENT_MENU)
        .locator("button", { hasText: "馬超" })
        .first()
        .click();
      await sleep(500);
      const b3 = await ctl(p);
      check(
        "B 已經不是開著的選單：在畫面上的 B 點馬超不會派出，選單留著",
        sneak === true && b3.heroes === 0 && (await menuShown(p)),
        { sneak, b3 }
      );
      await closeMenuX(p);
      await until(async () => !(await menuShown(p)), 5000);
      const again = await p.evaluate(
        (ctx) => window.__testBridge.closeDeployMenu(ctx),
        { battleId: b.battleId, menuId: b.menuId }
      );
      check(
        "按 × 關掉畫面上的 B；同一組再送一次也無效，倍率 1",
        !(await menuShown(p)) && again === false && (await ctl(p)).scale === 1,
        { again, s: await ctl(p) }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "部署選單編號：後端設定到達重新載入後，上一場的選單關不掉新場的選單",
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
      const roads = await roadCellsOf(p);
      if (roads.length) await clickCell(p, roads[0]);
      const opened = await until(() => menuShown(p), 5000);
      const old = await ctl(p);
      check(
        "內建關卡上打開部署選單（倍率 0.1）",
        roads.length > 0 && !!opened && old.menuId > 0 && old.scale === 0.1,
        { roads: roads.length, old }
      );
      check("放行後端關卡設定", hold.release("ok") === 1);
      const bid1 = await nextBattle(p, bid0);
      const n0 = await ctl(p);
      check(
        "重新載入成新的一場：舊選單從畫面上關掉、選單編號 0、倍率 1",
        !!bid1 &&
          bid1 !== bid0 &&
          !(await menuShown(p)) &&
          n0.menuId === 0 &&
          n0.scale === 1,
        { bid0, bid1, n0 }
      );
      await clickCell(p, ROAD_CELLS[0]);
      await until(() => menuShown(p), 5000);
      const n1 = await ctl(p);
      const r = await p.evaluate(
        (ctx) => window.__testBridge.closeDeployMenu(ctx),
        { battleId: old.battleId, menuId: old.menuId }
      );
      const n2 = await ctl(p);
      check(
        "新場打開選單後，用上一場的那一組關閉：無效，新選單仍開著、倍率 0.1",
        r === false &&
          (await menuShown(p)) &&
          n2.menuId === n1.menuId &&
          n2.scale === 0.1,
        { r, n1, n2 }
      );
      await closeMenuX(p);
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "暫停守門：結算後不開部署選單，入口也拒，升級按鈕停用並說明",
    async (mk) => {
      const E = await mk({ maps: TOWER_MAPS, enemies: TOWER_ENEMIES });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const b1 = await buildTower(p, TOWER_CELLS[0], "弓兵塔");
      check("前置：建弓兵塔 A", b1.ok, b1);
      check("開戰", await startBattle(p));
      await endWith(p, { win: false });
      await until(async () => (await bm(p, "state")) === 3, 5000);
      const s0 = await ctl(p);
      // 結算視窗蓋住戰場：用引擎的點擊入口（和點畫布相同）受控點空格與塔
      const r = await p.evaluate(() => {
        const e = window.__testBridge.engine;
        const w = e.gameMap.gridToWorld(2, 3);
        e.handleCellClick(w.x, w.y);
        const hs = {
          hero_id: "hero_ma_chao",
          level: 3,
          atk: 120,
          def: 60,
          hp: 1200,
        };
        return {
          hero: window.__testBridge.placeHero(2, 3, hs),
          tower: window.__testBridge.placeTower(4, 1, "archer"),
          upgrade: window.__testBridge.upgradeTower(2, 1),
        };
      });
      await sleep(500);
      const s1 = await ctl(p);
      check(
        "結算中：點空格不打開部署選單（編號 0），派武將、建塔、升級的入口都被拒，金幣、武將、塔都不變",
        s0.state === 3 &&
          !(await menuShown(p)) &&
          s1.menuId === 0 &&
          r.hero === false &&
          r.tower === false &&
          r.upgrade === false &&
          sameJson(s1, s0),
        { r, s0, s1 }
      );
      await p.evaluate(() => {
        const e = window.__testBridge.engine;
        const w = e.gameMap.gridToWorld(2, 1);
        e.handleCellClick(w.x, w.y);
      });
      await until(
        async () =>
          (await p.locator('[data-testid="upgrade-panel"]').count()) > 0,
        5000
      );
      const u = await upgradeInfo(p);
      check(
        "結算中點塔：升級按鈕停用並說明",
        !!u && u.disabled === true && u.hint === UPGRADE_HINT,
        u
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "暫停守門與部署慢速：共用帳號 390×600 用鍵盤派出、暫停中不能開選單，沒有寫入",
    async (mk) => {
      const data = NEW({
        capacity: 20,
        team: [
          { hero_id: "ma_chao", slot: 1 },
          { hero_id: "zhao_yun", slot: 2 },
        ],
      });
      const E = await mk({
        seed: [{ key: "k_pausegate", data, rev: 5 }],
        maps: TOWER_MAPS,
        enemies: TOWER_ENEMIES,
        viewport: { width: 390, height: 600 },
      });
      const p = await E.page({ storage: { shenma_player_key: "k_pausegate" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      const clicked = await clickCell(p, ROAD_CELLS[0]);
      const opened = await until(() => menuShown(p), 5000);
      // 選單有約 0.15 秒的放大動畫：等它結束再操作
      await sleep(400);
      const s0 = await ctl(p);
      const card = p
        .locator(PLACEMENT_MENU)
        .locator("button", { hasText: "馬超" })
        .first();
      await card.focus();
      await p.keyboard.press("Enter");
      const closed = await until(async () => !(await menuShown(p)), 5000);
      const s1 = await ctl(p);
      check(
        "390×600：打開選單（倍率 0.1），鍵盤在馬超卡片按 Enter：派出、選單關閉、倍率回到 1",
        clicked &&
          !!opened &&
          s0.scale === 0.1 &&
          !!closed &&
          s1.heroes === 1 &&
          s1.menuId === 0 &&
          s1.scale === 1,
        { clicked, opened, s0, s1 }
      );
      check("按暫停", await pauseHud(p));
      const clicked2 = await clickCell(p, ROAD_CELLS[2]);
      await sleep(800);
      const s2 = await ctl(p);
      check(
        "390×600 暫停中點空格：不打開選單，選單編號 0",
        clicked2 &&
          !(await menuShown(p)) &&
          s2.menuId === 0 &&
          s2.paused === true,
        { clicked2, s2 }
      );
      await shot(p, "pause-gate-390x600");
      check("按繼續", await resumeHud(p));
      await clickCell(p, ROAD_CELLS[2]);
      await until(() => menuShown(p), 5000);
      await sleep(400);
      const x = p
        .locator(PLACEMENT_MENU)
        .locator("button", { hasText: "×" })
        .first();
      await x.focus();
      await p.keyboard.press("Enter");
      const closed2 = await until(async () => !(await menuShown(p)), 5000);
      const s3 = await ctl(p);
      check(
        "繼續後新的點擊才打開選單；鍵盤在 × 按 Enter 取消：選單關閉、倍率回到 1",
        !!closed2 && s3.menuId === 0 && s3.scale === 1 && s3.heroes === 1,
        { closed2, s3 }
      );
      const back = readBack(E, "k_pausegate");
      check(
        "沒有任何寫入；雲端存檔的世界金幣 500、版本 5 不變",
        E.gas.writes().length === 0 &&
          !!back &&
          back.rev === 5 &&
          back.data.gold === 500,
        { writes: E.gas.writes(), back }
      );
      return E;
    }
  );

  // ═══ 29. 武將身份比較（別名兩個方向）、生命 0 時的光環、改目標的暫停守門 ═══
  // 同一位武將的完整 ID（hero_ma_chao）與去掉前綴的寫法（ma_chao）在引擎入口與部署選單都視為同一位；只比較，不改 ID、不升成正式技能。
  // 生命 0（存檔數值、沒有陣亡）的武將在戰鬥中不發也不收光環；改目標在暫停或結算時引擎入口拒絕、面板按鈕停用並說明。
  // 陣亡用受控的 takeDamage；光環狀態只讀實體欄位（不是自然戰鬥，也不是 13 技能的實際效果驗收）
  const TARGET_HINT = "暫停中或不在備戰、戰鬥時不能改目標。";
  const maCards = (p) =>
    p.locator(PLACEMENT_MENU).locator("button", { hasText: "馬超" });
  async function openMenuAt(p, cell) {
    const ok = await clickCell(p, cell);
    const opened = await until(() => menuShown(p), 5000);
    // 選單有約 0.15 秒的放大動畫
    await sleep(400);
    return ok && !!opened;
  }
  const cardStates = (p) =>
    maCards(p).evaluateAll((bs) =>
      bs.map((b) => ({
        disabled: b.disabled,
        text: b.innerText.replace(/\s+/g, " ").trim(),
      }))
    );
  const guestRaw = (p) =>
    p.evaluate(() => localStorage.getItem("shenma_js_guest_state"));
  /** 訪客隊伍：同一位馬超的兩種寫法（完整 ID Lv.2 在前、去掉前綴 Lv.5 在後） */
  const ALIAS_GUEST = () =>
    guestStorage(
      [
        {
          hero_id: "hero_ma_chao",
          level: 2,
          star: 1,
          atk: 115,
          def: 58,
          hp: 1120,
        },
        { hero_id: "ma_chao", level: 5, star: 1, atk: 130, def: 60, hp: 1300 },
      ],
      [
        { slot: 0, hero_id: "hero_ma_chao" },
        { slot: 1, hero_id: "ma_chao" },
      ]
    );
  const firstStrikeMult = (p) =>
    p.evaluate(() =>
      window.__testBridge.engine.heroes.map((h) => [
        h.heroId,
        h.firstStrikeMultiplier,
      ])
    );

  for (const [label, firstIdx, firstId, otherId] of [
    ["先派完整 ID", 0, "hero_ma_chao", "ma_chao"],
    ["先派去掉前綴的寫法", 1, "ma_chao", "hero_ma_chao"],
  ]) {
    await scenario(
      `武將身份比較：訪客隊伍有兩種寫法的馬超，${label}後兩張卡都是「已在場上」，入口也拒另一種寫法`,
      async (mk) => {
        const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
        const p = await E.page({ storage: ALIAS_GUEST() });
        check("以訪客進入", await enterGuest(p));
        await waitRemoteStage(p, E);
        const raw0 = await guestRaw(p);
        const opened = await openMenuAt(p, ROAD_CELLS[0]);
        const c0 = await cardStates(p);
        check(
          "選單上有兩張馬超卡（Lv.2、Lv.5），都可以點",
          opened &&
            c0.length === 2 &&
            c0.every((c) => c.disabled === false) &&
            /Lv\.2/.test(c0[0].text) &&
            /Lv\.5/.test(c0[1].text),
          c0
        );
        await maCards(p).nth(firstIdx).click();
        await until(async () => !(await menuShown(p)), 5000);
        const s1 = await heroField(p);
        check(
          `${label}（${firstId}）：場上一位，ID 照原樣`,
          s1.heroes.length === 1 && s1.heroes[0].id === firstId,
          s1.heroes
        );
        await openMenuAt(p, ROAD_CELLS[2]);
        const c1 = await cardStates(p);
        await closeMenuX(p);
        await until(async () => !(await menuShown(p)), 5000);
        check(
          "兩張馬超卡都顯示「已在場上」且不能點",
          c1.length === 2 &&
            c1.every((c) => c.disabled === true && /已在場上/.test(c.text)),
          c1
        );
        const r = await p.evaluate(
          (id) =>
            window.__testBridge.placeHero(4, 3, {
              hero_id: id,
              level: 1,
              atk: 100,
              def: 50,
              hp: 1000,
            }),
          otherId
        );
        const s2 = await heroField(p);
        check(
          `頁面的派出入口送另一種寫法（${otherId}）到 (4,3)：被拒，場上仍只有一位、(4,3) 沒有占用`,
          r === false &&
            s2.heroes.length === 1 &&
            (await occupantAt(p, ROAD_CELLS[2])) === null,
          { r, s2 }
        );
        const fm = await firstStrikeMult(p);
        check(
          "正式技能只認完整 ID：完整 ID 的馬超首擊倍率 2，去掉前綴的是 1（沒有升成正式技能）",
          sameJson(fm, [[firstId, firstId === "hero_ma_chao" ? 2 : 1]]),
          fm
        );
        check("標記這位馬超", await markHero(p, firstId, "ma1"));
        const k = await killHero(p, "ma1");
        await sleep(300);
        await openMenuAt(p, ROAD_CELLS[2]);
        const c2 = await cardStates(p);
        check(
          "受控陣亡後兩張卡都可以點",
          !!k && k.isDead === true && c2.every((c) => c.disabled === false),
          { k, c2 }
        );
        await maCards(p)
          .nth(1 - firstIdx)
          .click();
        await until(async () => !(await menuShown(p)), 5000);
        const s3 = await heroField(p);
        await openMenuAt(p, ROAD_CELLS[4]);
        const c3 = await cardStates(p);
        await closeMenuX(p);
        check(
          `陣亡後改派另一種寫法（${otherId}）成功，兩張卡又都是「已在場上」；場上仍只有一位`,
          s3.heroes.length === 1 &&
            s3.heroes[0].id === otherId &&
            c3.every((c) => c.disabled === true),
          { s3, c3 }
        );
        check(
          "本機存檔原樣（不合併、不改寫兩種寫法），沒有任何存檔請求",
          (await guestRaw(p)) === raw0 && E.gas.players().length === 0,
          { same: (await guestRaw(p)) === raw0 }
        );
        return E;
      }
    );
  }

  await scenario(
    "生命 0 的光環：共用帳號存檔裡生命 0 的劉備在戰鬥中不發防禦光環、生命 0 的周瑜不收攻速光環；曹操照常給趙雲攻速",
    async (mk) => {
      const H = (id, hp) => ({
        hero_id: id,
        level: 1,
        star: 0,
        atk: 100,
        def: 50,
        hp,
      });
      const data = NEW({
        capacity: 30,
        heroes: [
          H("liu_bei", 0),
          H("zhao_yun", 1200),
          H("cao_cao", 1200),
          H("zhou_yu", 0),
        ],
        team: [
          { hero_id: "liu_bei", slot: 1 },
          { hero_id: "zhao_yun", slot: 2 },
          { hero_id: "cao_cao", slot: 3 },
          { hero_id: "zhou_yu", slot: 4 },
        ],
      });
      const E = await mk({
        seed: [{ key: "k_zeroaura", data, rev: 6 }],
        maps: TWO_WAVE_MAPS,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: { shenma_player_key: "k_zeroaura" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      const d = [];
      for (const [cell, name] of [
        [ROAD_CELLS[1], "劉備"],
        [ROAD_CELLS[2], "趙雲"],
        [ROAD_CELLS[3], "曹操"],
        [ROAD_CELLS[4], "周瑜"],
      ])
        d.push(await deployHero(p, cell, name));
      const hp = await p.evaluate(() =>
        window.__testBridge.engine.heroes.map((h) => [h.heroId, h.currentHp])
      );
      check(
        "派出劉備 (3,3)、趙雲 (4,3)、曹操 (5,3)、周瑜 (6,3)；劉備與周瑜的生命是 0（存檔數值）",
        d.every((x) => x.ok) &&
          sameJson(hp, [
            ["hero_liu_bei", 0],
            ["hero_zhao_yun", 1200],
            ["hero_cao_cao", 1200],
            ["hero_zhou_yu", 0],
          ]),
        { d, hp }
      );
      check("按進入戰場開第 1 波", await startBattle(p));
      await sleep(1500);
      const a = await p.evaluate(() => {
        const hs = window.__testBridge.engine.heroes;
        const by = (id) => hs.find((h) => h.heroId === id);
        const liu = by("hero_liu_bei");
        const zy = by("hero_zhao_yun");
        const cao = by("hero_cao_cao");
        const zhou = by("hero_zhou_yu");
        return {
          state: window.__testBridge.engine.battleManager.gameState,
          zyHasLiuDef: zy.defSources.has(liu.defAuraSource),
          zyDefMult: zy.defBonusMult,
          liuBuffed: liu.defBuffed.size,
          zyHasCaoSpeed: zy.atkSpeedSources.has(cao.atkSpeedAuraSource),
          zySpeedMult: zy.atkSpeedBonusMult,
          zhouHasCaoSpeed: zhou.atkSpeedSources.has(cao.atkSpeedAuraSource),
          zhouSpeedMult: zhou.atkSpeedBonusMult,
          liuDead: liu.isDead,
          zhouDead: zhou.isDead,
        };
      });
      check(
        "戰鬥中：趙雲沒有劉備的防禦加成（劉備生命 0）、曹操給趙雲攻速 1.15、生命 0 的周瑜沒有攻速加成；兩位生命 0 的都沒有陣亡",
        a.state === 2 &&
          a.zyHasLiuDef === false &&
          a.zyDefMult === 1 &&
          a.liuBuffed === 0 &&
          a.zyHasCaoSpeed === true &&
          a.zySpeedMult === 1.15 &&
          a.zhouHasCaoSpeed === false &&
          a.zhouSpeedMult === 1 &&
          a.liuDead === false &&
          a.zhouDead === false,
        a
      );
      const back = readBack(E, "k_zeroaura");
      check(
        "沒有任何寫入；雲端存檔版本 6 不變",
        E.gas.writes().length === 0 && !!back && back.rev === 6,
        { writes: E.gas.writes(), back }
      );
      return E;
    }
  );

  await scenario(
    "改目標守門：訪客暫停或結算時目標按鈕停用並說明，入口也拒；繼續後新的點擊才改",
    async (mk) => {
      const E = await mk({ maps: TOWER_MAPS, enemies: TOWER_ENEMIES });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const b1 = await buildTower(p, TOWER_CELLS[0], "弓兵塔");
      const targetInfo = () =>
        p.evaluate(() => {
          const el = document.querySelector('[data-testid="upgrade-panel"]');
          if (!el) return null;
          const btns = [...el.querySelectorAll("button")].filter((b) =>
            ["第一", "殘血", "威脅", "對空"].includes(b.innerText.trim())
          );
          const h = el.querySelector('[data-testid="tower-target-hint"]');
          return {
            disabled: btns.map((b) => b.disabled),
            hint: h ? h.innerText.trim() : null,
          };
        });
      const modeOf = () =>
        p.evaluate(() => window.__testBridge.engine.towers[0].targetMode);
      await towerPanel(p, TOWER_CELLS[0]);
      const t0 = await targetInfo();
      await closePanel(p);
      check(
        "前置：備戰中建弓兵塔，目標按鈕都可以按、沒有說明，目前是「第一」",
        b1.ok &&
          !!t0 &&
          t0.disabled.length >= 3 &&
          t0.disabled.every((x) => x === false) &&
          t0.hint === null &&
          (await modeOf()) === "first",
        { b1, t0 }
      );
      check("按暫停", await pauseHud(p));
      await towerPanel(p, TOWER_CELLS[0]);
      const t1 = await targetInfo();
      await p.evaluate(() =>
        window.__testBridge.setTowerTargetMode(2, 1, "weakest")
      );
      const m1 = await modeOf();
      await closePanel(p);
      check(
        "暫停中：目標按鈕都停用並說明；頁面的入口改成殘血也被拒（仍是第一）",
        !!t1 &&
          t1.disabled.every((x) => x === true) &&
          t1.hint === TARGET_HINT &&
          m1 === "first",
        { t1, m1 }
      );
      check("按繼續", await resumeHud(p));
      const m2 = await modeOf();
      await towerPanel(p, TOWER_CELLS[0]);
      await p
        .locator('[data-testid="upgrade-panel"] button', { hasText: "殘血" })
        .first()
        .click();
      await sleep(300);
      const m3 = await modeOf();
      await closePanel(p);
      check(
        "繼續本身不補送；新的點擊才改成殘血",
        m2 === "first" && m3 === "weakest",
        { m2, m3 }
      );
      check("開戰", await startBattle(p));
      await endWith(p, { win: false });
      await until(async () => (await bm(p, "state")) === 3, 5000);
      await p.evaluate(() => {
        const e = window.__testBridge.engine;
        const w = e.gameMap.gridToWorld(2, 1);
        e.handleCellClick(w.x, w.y);
      });
      await until(
        async () =>
          (await p.locator('[data-testid="upgrade-panel"]').count()) > 0,
        5000
      );
      const t4 = await targetInfo();
      await p.evaluate(() =>
        window.__testBridge.setTowerTargetMode(2, 1, "strongest")
      );
      check(
        "結算中：目標按鈕停用並說明，入口改成威脅也被拒（仍是殘血）",
        !!t4 &&
          t4.disabled.every((x) => x === true) &&
          t4.hint === TARGET_HINT &&
          (await modeOf()) === "weakest",
        { t4, mode: await modeOf() }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "改目標守門：390×600 用鍵盤改目標；暫停中說明看得到",
    async (mk) => {
      const E = await mk({
        maps: TOWER_MAPS,
        enemies: TOWER_ENEMIES,
        viewport: { width: 390, height: 600 },
      });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const b1 = await buildTower(p, TOWER_CELLS[0], "弓兵塔");
      await towerPanel(p, TOWER_CELLS[0]);
      await sleep(400);
      const btn = p
        .locator('[data-testid="upgrade-panel"] button', { hasText: "威脅" })
        .first();
      await btn.focus();
      await p.keyboard.press("Enter");
      await sleep(300);
      const m1 = await p.evaluate(
        () => window.__testBridge.engine.towers[0].targetMode
      );
      await closePanel(p);
      check(
        "390×600：在「威脅」按 Enter 改成威脅",
        b1.ok && m1 === "strongest",
        { b1, m1 }
      );
      check("按暫停", await pauseHud(p));
      await towerPanel(p, TOWER_CELLS[0]);
      await sleep(400);
      const v = await p.evaluate(() => {
        const h = document.querySelector('[data-testid="tower-target-hint"]');
        if (!h) return null;
        h.scrollIntoView({ block: "nearest" });
        const r = h.getBoundingClientRect();
        return {
          text: h.innerText.trim(),
          inView:
            r.top >= 0 &&
            r.bottom <= innerHeight &&
            r.left >= 0 &&
            r.right <= innerWidth,
          noHScroll: document.documentElement.scrollWidth <= innerWidth + 1,
        };
      });
      check(
        "390×600 暫停中：目標說明在視窗內、沒有橫向捲動",
        !!v && v.text === TARGET_HINT && v.inView && v.noHScroll,
        v
      );
      await shot(p, "target-pause-390x600");
      return E;
    }
  );

  // ═══ 30. 開波拒絕與出兵、自動下一波的遊戲時間 ═══
  // 這一波沒有可生成的組時拒絕開戰：波次不前進、頁面收到的同步沒有戰鬥中、共用帳號不固定這一場，可以再按；有效組照常出兵。
  // 出兵間隔 0 時第一隻在開戰當下、之後每一幀一隻；自動下一波等 1.5 秒戰鬥時間（暫停不算、換倍率照新倍率），等待中取消自動就不開。
  // 清波用引擎既有的 onWaveAllEnemiesDead 受控觸發、敵人是測試木樁（不是自然通關）；時間量測有容差
  const WAVE_MAPS = (waves) => SKILL_MAPS.map((m) => ({ ...m, waves }));
  const DUMMY_WAVES = (n) =>
    Array.from({ length: n }, (_, i) => DUMMY_WAVE(i + 1));
  /** 包住頁面自己的同步與拒絕回呼，記下頁面收到的 game_state 與拒絕（照樣交給頁面原本的處理）；出兵另記畫面幀與戰鬥時間 */
  const watchWaves = (p) =>
    p.evaluate(() => {
      const b = window.__testBridge;
      if (!b) return false;
      if (b.__wavesWatched) return true;
      window.__seenStates = [];
      window.__rejects = [];
      window.__spawns = [];
      window.__raf = 0;
      const tick = () => {
        window.__raf++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      const orig = b.onStatsChanged;
      b.onStatsChanged = (s) => {
        window.__seenStates.push([s.battle_id, s.game_state, s.wave]);
        if (orig) orig(s);
      };
      b.onWaveRejected = (w, r) => window.__rejects.push([w, r]);
      const e = b.engine;
      e.waveManager.onEnemySpawned = (en) =>
        window.__spawns.push({
          seq: en.spawnSeq,
          id: en.enemyId,
          raf: window.__raf,
          wave: e.battleManager.currentWave,
          bt: e.battleManager.battleTime,
          t: performance.now(),
        });
      b.__wavesWatched = true;
      return true;
    });
  const waveObs = (p) =>
    p.evaluate(() => {
      const e = window.__testBridge.engine;
      const b = e.battleManager;
      return {
        battleId: b.battleId,
        state: b.gameState,
        wave: b.currentWave,
        auto: b.autoMode,
        pending: b.autoWavePending,
        bt: b.battleTime,
        t: performance.now(),
        enemies: e.waveManager.activeEnemies.length,
        states: window.__seenStates.slice(),
        rejects: window.__rejects.slice(),
        spawns: window.__spawns.slice(),
        report: e.waveManager.getLastPlanReport(),
      };
    });
  const nickEdit = async (p) => {
    await openInfo(p);
    const v = await p.evaluate(() => {
      const b = document.querySelector('[data-testid="player-info-nick-edit"]');
      return b ? { disabled: b.disabled, title: b.title || "" } : null;
    });
    await closeModal(p);
    return v;
  };
  const pressEnter = async (p, locator) => {
    await locator.first().focus();
    await p.keyboard.press("Enter");
  };

  await scenario(
    "開波拒絕：共用帳號第 1 波全部無效：按進入戰場被拒，波次 0、仍是備戰、頁面沒收到戰鬥中、這一場沒有固定；再按迎戰仍拒絕第 1 波",
    async (mk) => {
      const data = NEW({
        capacity: 20,
        team: [{ hero_id: "ma_chao", slot: 1 }],
      });
      const E = await mk({
        seed: [{ key: "k_reject", data, rev: 2 }],
        maps: WAVE_MAPS([
          {
            wave: 1,
            enemies: [
              { enemy_id: "nope", count: 1, interval: 1, path: "path_a" },
              { enemy_id: "dummy_test", count: 0, interval: 1, path: "path_a" },
            ],
          },
        ]),
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: { shenma_player_key: "k_reject" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      check("可以觀測頁面收到的同步與出兵", await watchWaves(p));
      const bid = await bm(p, "battleId");
      await p.locator('[data-testid="enter-battle"]').click();
      await sleep(800);
      const r1 = await waveObs(p);
      check(
        "按進入戰場：第 1 波被拒（兩組都略過：找不到敵人、數量 0），仍是備戰、波次 0、沒有敵人",
        sameJson(r1.rejects, [[1, "enemy_not_found"]]) &&
          r1.state === 1 &&
          r1.wave === 0 &&
          r1.enemies === 0 &&
          sameJson(
            r1.report.skipped.map((s) => s.reason),
            ["enemy_not_found", "count_invalid"]
          ),
        r1
      );
      check(
        "頁面收到的同步沒有任何一筆戰鬥中",
        r1.states.length > 0 && r1.states.every((s) => s[1] !== 2),
        r1.states
      );
      const n1 = await nickEdit(p);
      check(
        "這一場沒有固定出征：主公資訊的「改暱稱」仍可按、沒有「出征中」說明",
        !!n1 && n1.disabled === false && !/出征中/.test(n1.title),
        n1
      );
      await p.locator('[data-testid="hud-start-battle"]').click();
      await sleep(800);
      const r2 = await waveObs(p);
      check(
        "再按迎戰：仍是第 1 波、再被拒一次，波次不前進、battleId 不變、頁面仍沒收到戰鬥中",
        sameJson(r2.rejects, [
          [1, "enemy_not_found"],
          [1, "enemy_not_found"],
        ]) &&
          r2.wave === 0 &&
          r2.state === 1 &&
          r2.battleId === bid &&
          r2.states.every((s) => s[1] !== 2),
        r2
      );
      check("沒有任何寫入請求", E.gas.writes().length === 0, E.gas.writes());
      return E;
    }
  );

  await scenario(
    "出兵時點：訪客第 1 波有一組無效、一組間隔 0 的 4 隻：照常開戰，第一隻在開戰當下、之後每一幀一隻",
    async (mk) => {
      const E = await mk({
        maps: WAVE_MAPS([
          {
            wave: 1,
            enemies: [
              { enemy_id: "nope", count: 2, interval: 1, path: "path_a" },
              { enemy_id: "dummy_test", count: 4, interval: 0, path: "path_a" },
            ],
          },
        ]),
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      check("可以觀測頁面收到的同步與出兵", await watchWaves(p));
      check("按進入戰場開第 1 波", await startBattle(p));
      await until(async () => (await waveObs(p)).spawns.length >= 4, 5000);
      await sleep(500);
      const o = await waveObs(p);
      const f = o.spawns.map((s) => s.raf);
      check(
        "略過找不到的那一組（照實記原因），另一組照常出兵：共 4 隻、生成序號 0～3",
        sameJson(
          o.report.skipped.map((s) => [s.index, s.enemy_id, s.reason]),
          [[1, "nope", "enemy_not_found"]]
        ) &&
          sameJson(
            o.spawns.map((s) => s.seq),
            [0, 1, 2, 3]
          ),
        o
      );
      check(
        "間隔 0：第二隻在開戰後的第一個畫面幀，之後每一幀一隻（不在同一幀補發，也不是隔 1 秒或 0.05 秒）",
        f.length === 4 &&
          f[1] - f[0] <= 1 &&
          f[2] - f[1] === 1 &&
          f[3] - f[2] === 1,
        o.spawns
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "自動下一波：共用帳號 390×600 用鍵盤按自動；受控清波後等待中暫停 2.5 秒不開下一波，繼續後照剩下的戰鬥時間開第 2 波，同一場",
    async (mk) => {
      const data = NEW({
        capacity: 20,
        team: [{ hero_id: "ma_chao", slot: 1 }],
      });
      const E = await mk({
        seed: [{ key: "k_autowave", data, rev: 2 }],
        maps: WAVE_MAPS(DUMMY_WAVES(3)),
        enemies: [...ENEMIES, DUMMY],
        viewport: { width: 390, height: 600 },
      });
      const p = await E.page({ storage: { shenma_player_key: "k_autowave" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      check("可以觀測頁面收到的同步與出兵", await watchWaves(p));
      await pressEnter(p, p.locator("button", { hasText: /^自動$/ }));
      const started = await until(async () => {
        const o = await waveObs(p);
        return o.state === 2 && o.wave === 1 && o.auto && o.spawns.length >= 1;
      }, 5000);
      const s0 = await waveObs(p);
      check("390×600：在「自動」按 Enter 開第 1 波（自動出波）", !!started, s0);
      await forceWaveClear(p);
      const c = await waveObs(p);
      await pressEnter(p, p.locator("button", { hasText: "⏸ 暫停" }));
      const paused = await until(
        async () =>
          (await p.locator("button", { hasText: "▶ 繼續" }).count()) > 0,
        3000
      );
      const pz = await waveObs(p);
      await sleep(2500);
      const pz2 = await waveObs(p);
      check(
        "受控清波後等待中按 Enter 暫停：2.5 秒內仍是第 1 波、仍在等待，戰鬥時間不動",
        !!paused &&
          c.pending === true &&
          pz2.wave === 1 &&
          pz2.pending === true &&
          pz2.bt === pz.bt,
        { c, pz, pz2 }
      );
      await pressEnter(p, p.locator("button", { hasText: "▶ 繼續" }));
      const ok2 = await until(async () => (await waveObs(p)).wave === 2, 5000);
      const o = await waveObs(p);
      const w2 = o.spawns.find((s) => s.wave === 2);
      const btWait = w2 ? w2.bt - c.bt : null;
      check(
        "繼續後開第 2 波：從清波起算的戰鬥時間約 1.5 秒（1.45～1.65），同一個 battleId",
        !!ok2 &&
          !!w2 &&
          btWait >= 1.45 &&
          btWait <= 1.65 &&
          o.battleId === s0.battleId &&
          o.states.every((s) => s[0] === s0.battleId),
        { btWait, w2, c, battleId: o.battleId }
      );
      const n = await nickEdit(p);
      check(
        "這一場固定出征（主公資訊的「改暱稱」停用並說明出征中），沒有任何寫入請求",
        !!n &&
          n.disabled === true &&
          /出征中/.test(n.title) &&
          E.gas.writes().length === 0,
        { n, writes: E.gas.writes() }
      );
      await shot(p, "auto-wave-pause-390x600");
      return E;
    }
  );

  await scenario(
    "自動下一波：訪客等待中換 2 倍，照新倍率扣剩下的戰鬥時間；下一次等待中按自動取消，回到備戰、不再開下一波",
    async (mk) => {
      const E = await mk({
        maps: WAVE_MAPS(DUMMY_WAVES(3)),
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      check("可以觀測頁面收到的同步與出兵", await watchWaves(p));
      await p.locator("button", { hasText: /^自動$/ }).click();
      check(
        "按自動開第 1 波",
        await until(async () => {
          const o = await waveObs(p);
          return o.state === 2 && o.wave === 1 && o.auto;
        }, 5000)
      );
      await forceWaveClear(p);
      const c = await waveObs(p);
      await sleep(300);
      await p.locator("button", { hasText: /^2x$/ }).click();
      const ok2 = await until(async () => (await waveObs(p)).wave === 2, 5000);
      const o = await waveObs(p);
      const w2 = o.spawns.find((s) => s.wave === 2);
      const btWait = w2 ? w2.bt - c.bt : null;
      const realWait = w2 ? (w2.t - c.t) / 1000 : null;
      check(
        "等待中換 2 倍：開第 2 波時從清波起算的戰鬥時間約 1.5 秒（1.45～1.75），真實時間比 1.5 秒短（0.6～1.35 秒）",
        !!ok2 &&
          !!w2 &&
          btWait >= 1.45 &&
          btWait <= 1.75 &&
          realWait >= 0.6 &&
          realWait <= 1.35,
        { btWait, realWait, c, w2 }
      );
      await forceWaveClear(p);
      const c2 = await waveObs(p);
      await p.locator("button", { hasText: /^自動$/ }).click();
      await sleep(2500);
      const o2 = await waveObs(p);
      check(
        "第 2 波受控清波後的等待中按自動（關閉）：回到備戰、不再等待，2.5 秒後仍是第 2 波、沒有新的出兵",
        c2.pending === true &&
          o2.state === 1 &&
          o2.pending === false &&
          o2.auto === false &&
          o2.wave === 2 &&
          o2.spawns.length === c2.spawns.length,
        { c2, o2 }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  // ═══ 31. 部署遮罩開著時的 HUD 操作列與選單高度 ═══
  // HUD 操作列在部署遮罩之上（選單開著也能直接用滑鼠按暫停等），選單高度上限是 min(80vh, 遮罩高度 − 168px)，讓置中的選單不被 HUD 蓋到。
  // 測最終的正常建置、正常滑鼠與鍵盤（不注入樣式、不 force 點擊、不直接改暫停）。量測用未四捨五入的 DOMRect 與 elementFromPoint：
  // 標題與暫停說明逐字（Range）取點，卡片只量內容區剪裁後的可見部分。捲動只驗滑鼠滾輪與鍵盤，沒有測觸控滑動；結算用受控回呼（不是自然通關）。
  // 390 寬時 HUD「隊伍」按鈕中心本來就在視窗外，另列為既有限制，不算進「最上層」
  const MASK_SIZES = [
    ["1280×800", { width: 1280, height: 800 }],
    ["390×600", { width: 390, height: 600 }],
    ["390×844", { width: 390, height: 844 }],
  ];
  const MASK_TEAM = DEFAULT_SORTIE.slice(0, 5).map(([id], i) => ({
    hero_id: id.replace(/^hero_/, ""),
    slot: i + 1,
  }));
  /** 頁面內量測（DOMRect 不四捨五入）：HUD 按鈕、選單標題逐字、×、分頁、暫停說明逐字、內容可見區與卡片可見部分、遮罩取樣點 */
  const maskLayout = (p) =>
    p.evaluate(() => {
      const rr = (b) => ({ x: b.left, y: b.top, w: b.width, h: b.height });
      const inter = (a, b) => {
        if (!a || !b) return null;
        const x = Math.max(a.x, b.x);
        const y = Math.max(a.y, b.y);
        const w = Math.min(a.x + a.w, b.x + b.w) - x;
        const h = Math.min(a.y + a.h, b.y + b.h) - y;
        return w > 0 && h > 0 ? { x, y, w, h } : null;
      };
      const inRect = (x, y, r) =>
        !!r && x >= r.x && y >= r.y && x <= r.x + r.w && y <= r.y + r.h;
      const view = { x: 0, y: 0, w: innerWidth, h: innerHeight };
      const inView = (x, y) =>
        x >= 0 && y >= 0 && x < innerWidth && y < innerHeight;
      const bar = document.querySelector('[class*="hudActionBar"]');
      const menu = document.querySelector('[data-testid="placement-menu"]');
      const overlay = menu ? menu.parentElement : null;
      const who = (el) =>
        !el
          ? "none"
          : bar && bar.contains(el)
            ? "hud"
            : menu && menu.contains(el)
              ? "menu"
              : overlay && el === overlay
                ? "mask"
                : el.closest(".modal")
                  ? "modal"
                  : "other";
      const hitIn = (x, y, target) => {
        if (!inView(x, y)) return { ok: false, who: "out" };
        const el = document.elementFromPoint(x, y);
        return {
          ok: !!el && (el === target || target.contains(el)),
          who: who(el),
        };
      };
      const hud = bar
        ? [...bar.querySelectorAll("button")].map((b) => {
            const r = rr(b.getBoundingClientRect());
            const cx = r.x + r.w / 2;
            const cy = r.y + r.h / 2;
            const h = hitIn(cx, cy, b);
            return {
              text: (b.innerText || "").replace(/\s+/g, " ").trim(),
              rect: r,
              inView: inView(cx, cy),
              onTop: h.ok,
              who: h.who,
            };
          })
        : [];
      const out = {
        viewport: [innerWidth, innerHeight],
        noHScroll: document.documentElement.scrollWidth <= innerWidth + 1,
        hud,
        menu: !!menu,
      };
      if (!menu) return out;
      const charPoints = (el) => {
        const pts = [];
        if (!el) return pts;
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode())) {
          for (let i = 0; i < n.length; i++) {
            if (!n.data[i].trim()) continue;
            const rg = document.createRange();
            rg.setStart(n, i);
            rg.setEnd(n, i + 1);
            for (const b of rg.getClientRects())
              if (b.width > 0 && b.height > 0)
                pts.push([b.left + b.width / 2, b.top + b.height / 2]);
          }
        }
        return pts;
      };
      const pointsCheck = (el, pts) => {
        const res = pts.map(([x, y]) => hitIn(x, y, el));
        return {
          n: res.length,
          bad: res.filter((r) => !r.ok).map((r) => r.who),
        };
      };
      const five = (r) => [
        [r.x + r.w / 2, r.y + r.h / 2],
        [r.x + 3, r.y + 3],
        [r.x + r.w - 3, r.y + 3],
        [r.x + 3, r.y + r.h - 3],
        [r.x + r.w - 3, r.y + r.h - 3],
      ];
      const header = menu.querySelector('[class*="placementHeader"]');
      const title = header && header.querySelector("span");
      const close = header && header.querySelector("button");
      const hint = menu.querySelector('[data-testid="placement-blocked-hint"]');
      const tabs = [...menu.querySelectorAll('[class*="tabSwitcher"] button')];
      const content = menu.querySelector('[class*="placementContent"]');
      const mRect = rr(menu.getBoundingClientRect());
      const cRect = content ? rr(content.getBoundingClientRect()) : null;
      const visible = inter(inter(cRect, mRect), view);
      const cards = content
        ? [...content.querySelectorAll("button")].map((b) => {
            const r = rr(b.getBoundingClientRect());
            const vr = inter(r, visible);
            const name = (
              (b.querySelector('[class*="cardName"]') || b).innerText || ""
            )
              .replace(/\s+/g, " ")
              .trim();
            if (!vr)
              return {
                name,
                disabled: b.disabled,
                visibleArea: 0,
                full: false,
                onTop: false,
              };
            const h = hitIn(vr.x + vr.w / 2, vr.y + vr.h / 2, b);
            return {
              name,
              disabled: b.disabled,
              visibleArea: vr.w * vr.h,
              full: vr.w * vr.h >= r.w * r.h - 1,
              onTop: h.ok,
              who: h.who,
              center: [vr.x + vr.w / 2, vr.y + vr.h / 2],
            };
          })
        : [];
      const parts = [
        ["header", header ? rr(header.getBoundingClientRect()) : null],
        ["hint", hint ? rr(hint.getBoundingClientRect()) : null],
        ...tabs.map((t, i) => ["tab" + i, rr(t.getBoundingClientRect())]),
        ["visibleContent", visible],
      ];
      const overlaps = [];
      for (const b of hud.filter((x) => x.inView))
        for (const [part, r] of parts) {
          const a = inter(b.rect, r);
          if (a) overlaps.push({ hud: b.text, part, area: a.w * a.h });
        }
      // 遮罩取樣：遮罩矩形內 5×5 個點（去掉選單與 HUD 範圍），記下每點最上層是誰；畫布不能是任何一點的最上層
      const oRect = rr(overlay.getBoundingClientRect());
      const barRect = bar ? rr(bar.getBoundingClientRect()) : null;
      const tagOf = (el) => {
        if (!el) return "none";
        const fe = el.closest("[data-floating-entry]");
        const al = el.getAttribute("aria-label");
        return `${el.tagName.toLowerCase()}${al ? `[${al}]` : ""}${fe ? `{${fe.getAttribute("data-floating-entry")}}` : ""}`;
      };
      const samples = [];
      for (const fy of [0.02, 0.25, 0.5, 0.75, 0.98])
        for (const fx of [0.02, 0.25, 0.5, 0.75, 0.98]) {
          const x = oRect.x + oRect.w * fx;
          const y = oRect.y + oRect.h * fy;
          if (!inView(x, y) || inRect(x, y, mRect) || inRect(x, y, barRect))
            continue;
          const el = document.elementFromPoint(x, y);
          samples.push({
            x,
            y,
            who: who(el),
            canvas: !!el && el.tagName === "CANVAS",
            tag: tagOf(el),
          });
        }
      const pick = samples.find((s) => s.who === "mask") || null;
      return {
        ...out,
        menuRect: mRect,
        overlayRect: oRect,
        title: {
          text: title ? title.innerText : null,
          ...pointsCheck(title, charPoints(title)),
        },
        close: close
          ? pointsCheck(close, five(rr(close.getBoundingClientRect())))
          : { n: 0, bad: ["none"] },
        hint: hint
          ? { text: hint.innerText, ...pointsCheck(hint, charPoints(hint)) }
          : null,
        tabs: tabs.map((t) => {
          const r = rr(t.getBoundingClientRect());
          return {
            text: t.innerText,
            onTop: hitIn(r.x + r.w / 2, r.y + r.h / 2, t).ok,
          };
        }),
        content: content
          ? {
              rect: cRect,
              visible,
              scrollTop: content.scrollTop,
              scrollHeight: content.scrollHeight,
              clientHeight: content.clientHeight,
            }
          : null,
        cards,
        overlaps,
        maskProbe: {
          n: samples.length,
          mask: samples.filter((s) => s.who === "mask").length,
          canvas: samples.filter((s) => s.canvas).length,
          others: [
            ...new Set(
              samples.filter((s) => s.who !== "mask").map((s) => s.tag)
            ),
          ],
          pick: pick ? [pick.x, pick.y] : null,
        },
      };
    });
  const hudInViewOnTop = (L) =>
    L.hud.filter((b) => b.inView).length > 0 &&
    L.hud.filter((b) => b.inView).every((b) => b.onTop);
  const hudOutside = (L) => L.hud.filter((b) => !b.inView).map((b) => b.text);
  const menuPartsClear = (L) =>
    L.menu &&
    L.title.n > 0 &&
    L.title.bad.length === 0 &&
    L.close.n > 0 &&
    L.close.bad.length === 0 &&
    L.tabs.every((t) => t.onTop) &&
    (!L.hint || (L.hint.n > 0 && L.hint.bad.length === 0)) &&
    L.overlaps.length === 0;
  const visibleCardsClear = (L) => {
    const v = L.cards.filter((c) => c.visibleArea > 0);
    return v.length > 0 && v.every((c) => c.onTop);
  };
  const hudRects = (L) => L.hud.map((b) => [b.text, b.rect]);
  const lastCardOk = (L) => {
    const last = L.cards[L.cards.length - 1];
    return !!last && last.full && last.onTop;
  };
  /** 正常滑鼠滾輪在內容區往下捲，直到最後一張卡片整張可見且點得到（最多 30 次） */
  async function wheelToLastCard(p) {
    let L = await maskLayout(p);
    let steps = 0;
    while (steps < 30 && !lastCardOk(L) && L.content && L.content.visible) {
      const v = L.content.visible;
      await p.mouse.move(v.x + v.w / 2, v.y + v.h / 2);
      await p.mouse.wheel(0, 120);
      await sleep(150);
      steps++;
      L = await maskLayout(p);
    }
    return { L, steps };
  }
  /** 正常 Tab 往後移，直到焦點落在選單內容區的最後一張卡片（最多 80 次） */
  async function tabToLastCard(p) {
    for (let i = 1; i <= 80; i++) {
      await p.keyboard.press("Tab");
      const isLast = await p.evaluate(() => {
        const m = document.querySelector('[data-testid="placement-menu"]');
        const cs = m
          ? [...m.querySelectorAll('[class*="placementContent"] button')]
          : [];
        return cs.length > 0 && document.activeElement === cs[cs.length - 1];
      });
      if (isLast) {
        await sleep(250);
        return { steps: i, L: await maskLayout(p) };
      }
    }
    return { steps: -1, L: await maskLayout(p) };
  }
  async function maskEnter(mk, mode, viewport, key) {
    if (mode === "guest") {
      const E = await mk({
        maps: TOWER_MAPS,
        enemies: TOWER_ENEMIES,
        viewport,
      });
      const p = await E.page({ storage: guestStorage(GUEST_13, []) });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      return { E, p };
    }
    const data = NEW({ capacity: 50, team: MASK_TEAM });
    const E = await mk({
      seed: [{ key, data, rev: 2 }],
      maps: TOWER_MAPS,
      enemies: TOWER_ENEMIES,
      viewport,
    });
    const p = await E.page({ storage: { shenma_player_key: key } });
    check("讀到存檔", (await loadShared(p)) === "player");
    await closeModal(p);
    await waitRemoteStage(p, E);
    return { E, p };
  }
  /**
   * 打開部署選單（正常滑鼠）：依序試候選格，回傳量測、用到的格子與試過沒用的格子。
   * 還有選單開著就先按 × 關掉（記下來）；格子中心不在畫布可見區、或要放武將但這格不能放時跳過
   */
  async function openMaskMenu(p, cells, needPlace) {
    const tried = [];
    for (const cell of cells) {
      if (await menuShown(p)) {
        await closeMenuX(p);
        await until(async () => !(await menuShown(p)), 3000);
        tried.push({ cell, closedLeftoverMenu: true });
      }
      const pt = await cellPoint(p, cell);
      if (!pt.onCanvas || (needPlace && !pt.canPlace)) {
        tried.push({ cell, onCanvas: pt.onCanvas, canPlace: pt.canPlace });
        continue;
      }
      await p.mouse.click(pt.x, pt.y);
      const opened = await until(() => menuShown(p), 5000);
      if (opened) {
        await sleep(400);
        return { L: await maskLayout(p), cell, tried };
      }
      tried.push({ cell, opened: false });
    }
    return { L: null, cell: null, tried };
  }
  const clickCenter = (p, r) => p.mouse.click(r.x + r.w / 2, r.y + r.h / 2);
  const freezeProbe = (p) =>
    p.evaluate(() => {
      const e = window.__testBridge.engine;
      return {
        bt: e.battleManager.battleTime,
        enemies: e.waveManager.activeEnemies.map((x) => [x.x, x.y]),
      };
    });

  for (const [label, viewport] of MASK_SIZES)
    for (const mode of ["guest", "shared"])
      for (const phase of ["PREP", "BATTLE"]) {
        const tag = `${label} ${mode === "guest" ? "訪客" : "共用帳號"} ${phase === "PREP" ? "備戰" : "戰鬥中"}`;
        const sizeKey = label.replace("×", "x");
        await scenario(
          `遮罩與 HUD：${tag}：選單各部位不被 HUD 蓋、HUD 在遮罩之上、遮罩照舊擋畫布`,
          async (mk) => {
            const { E, p } = await maskEnter(
              mk,
              mode,
              viewport,
              `k_mask_${sizeKey}_${phase}`
            );
            let settleShown = null;
            if (phase === "BATTLE") {
              const b1 = await buildTower(p, TOWER_CELLS[1], "弓兵塔");
              check(
                "前置：備戰中建一座弓兵塔（之後核暫停中的升級、拆除、改目標入口）",
                b1.ok,
                b1
              );
              check(
                "按進入戰場開第 1 波（很慢、打不倒的測試木樁）",
                await startBattle(p)
              );
            }
            const base = await maskLayout(p);
            const off = [];
            for (const [kind, cells] of [
              ["建築位", [TOWER_CELLS[0], TOWER_CELLS[2]]],
              ["道路", ROAD_CELLS],
            ]) {
              const o = await openMaskMenu(p, cells, kind === "道路");
              if (o.tried.length) off.push({ kind, tried: o.tried });
              const L = o.L;
              const cell = o.cell;
              if (!L) {
                check(
                  `${tag} ${kind}：正常滑鼠點畫布上的格子打得開選單`,
                  false,
                  o
                );
                continue;
              }
              check(
                `${tag} ${kind}：選單標題（逐字）、×、分頁${L.hint ? "、說明（逐字）" : ""}都不被 HUD 蓋住，也沒有幾何交疊`,
                menuPartsClear(L),
                {
                  title: L.title,
                  close: L.close,
                  tabs: L.tabs,
                  hint: L.hint,
                  overlaps: L.overlaps,
                  menuRect: L.menuRect,
                }
              );
              check(
                `${tag} ${kind}：內容區剪裁後可見的每張卡片，可見部分的中心都點得到（不被 HUD 或遮罩蓋）`,
                visibleCardsClear(L),
                L.cards
              );
              check(
                `${tag} ${kind}：視窗內的 HUD 按鈕中心都是最上層${hudOutside(L).length ? `（視窗外：${hudOutside(L).join("、")}，既有限制另列）` : ""}`,
                hudInViewOnTop(L),
                L.hud.map((b) => [b.text, b.inView, b.onTop, b.who])
              );
              check(
                `${tag} ${kind}：HUD 位置與內容和選單打開前相同，沒有橫向捲動`,
                sameJson(hudRects(L), hudRects(base)) && L.noHScroll,
                {
                  before: hudRects(base),
                  now: hudRects(L),
                  noHScroll: L.noHScroll,
                }
              );
              if (mode === "guest" && phase === "PREP")
                await shot(
                  p,
                  `mask-${sizeKey}-${kind === "道路" ? "road13" : "build"}`
                );
              // 長列表最後一張：滾輪與鍵盤（訪客備戰的道路選單有 13 位武將）
              if (mode === "guest" && phase === "PREP") {
                const w = await wheelToLastCard(p);
                const lastW = w.L.cards[w.L.cards.length - 1];
                check(
                  `${tag} ${kind}：滑鼠滾輪在內容區往下捲，最後一張（${lastW ? lastW.name : "?"}）整張可見、可見中心點得到`,
                  lastCardOk(w.L) && !lastW.disabled,
                  { steps: w.steps, last: lastW, content: w.L.content }
                );
                if (kind === "道路" && label === "390×600") {
                  await shot(p, `mask-${sizeKey}-last-card`);
                  const h0 = (await ctl(p)).heroes;
                  // 最後一張沒有整張可見、點得到就不點（前面的具名檢查已失敗）
                  const can = lastCardOk(w.L) && !lastW.disabled;
                  if (can)
                    await p.mouse.click(lastW.center[0], lastW.center[1]);
                  const closed =
                    can &&
                    (await until(async () => !(await menuShown(p)), 5000));
                  const h1 = (await ctl(p)).heroes;
                  check(
                    `${tag} ${kind}：滑鼠點最後一張武將卡（${lastW ? lastW.name : "?"}）派出成功，選單關閉`,
                    can && !!closed && h1 === h0 + 1,
                    { can, h0, h1, closed }
                  );
                  continue;
                }
                await closeMenuX(p);
                await until(async () => !(await menuShown(p)), 3000);
                const L2 = (await openMaskMenu(p, [cell], kind === "道路")).L;
                const t = L2 ? await tabToLastCard(p) : { steps: -1, L: null };
                const lastT = t.L && t.L.cards[t.L.cards.length - 1];
                check(
                  `${tag} ${kind}：正常 Tab 到最後一張（${lastT ? lastT.name : "?"}）時它整張可見、可見中心點得到`,
                  t.steps > 0 && lastCardOk(t.L) && !lastT.disabled,
                  { steps: t.steps, last: lastT, content: t.L && t.L.content }
                );
              }
              // 遮罩其餘區：取樣點沒有一點是畫布在最上層；點其中一個遮罩點只關閉選單，畫布沒有收到點擊
              const L3 = await maskLayout(p);
              const s0 = await ctl(p);
              const probe = L3.maskProbe;
              if (probe.pick) await p.mouse.click(probe.pick[0], probe.pick[1]);
              const closed = await until(
                async () => !(await menuShown(p)),
                3000
              );
              await sleep(300);
              const s1 = await ctl(p);
              check(
                `${tag} ${kind}：遮罩其餘區仍蓋著畫布（取樣點沒有一點是畫布），點遮罩只關閉選單，沒有新的塔或武將`,
                probe.n > 0 &&
                  probe.canvas === 0 &&
                  !!probe.pick &&
                  !!closed &&
                  s1.menuId === 0 &&
                  sameJson(s1.towers, s0.towers) &&
                  s1.heroes === s0.heroes &&
                  s1.gold === s0.gold,
                { probe, s0, s1 }
              );
              if (!closed) {
                await closeMenuX(p);
                await until(async () => !(await menuShown(p)), 3000);
              }
            }
            note(
              `${tag}：試過沒用的格子（中心不在畫布可見區、不能放武將，或還有選單要先關）`,
              off
            );
            if (phase === "BATTLE") {
              // 選單開著時用滑鼠點 HUD 暫停／繼續
              const o1 = await openMaskMenu(p, ROAD_CELLS, true);
              const L = o1.L;
              const s0 = await ctl(p);
              const pause = L && L.hud.find((b) => /⏸ 暫停/.test(b.text));
              check(
                `${tag}：選單開著時 HUD「⏸ 暫停」是最上層（中心點 elementFromPoint 是按鈕本身）`,
                !!pause && pause.onTop && s0.menuId > 0,
                { pause, s0, cell: o1.cell, tried: o1.tried }
              );
              if (pause && pause.onTop) {
                await clickCenter(p, pause.rect);
                await until(async () => (await ctl(p)).paused, 3000);
                const s1 = await ctl(p);
                const f1 = await freezeProbe(p);
                await sleep(800);
                const f2 = await freezeProbe(p);
                check(
                  `${tag}：滑鼠點 HUD 暫停：同一場、同一個選單編號仍開著，戰鬥時間與敵人位置停住`,
                  s1.paused &&
                    s1.battleId === s0.battleId &&
                    s1.menuId === s0.menuId &&
                    (await menuShown(p)) &&
                    sameJson(f1, f2),
                  { s0, s1, f1, f2 }
                );
                const Lp = await maskLayout(p);
                check(
                  `${tag}：暫停中：選單標題、×、暫停說明（逐字）不被 HUD 蓋住，卡片都停用`,
                  menuPartsClear(Lp) &&
                    !!Lp.hint &&
                    Lp.cards.length > 0 &&
                    Lp.cards.every((c) => c.disabled),
                  {
                    title: Lp.title,
                    close: Lp.close,
                    hint: Lp.hint,
                    overlaps: Lp.overlaps,
                    cards: Lp.cards.map((c) => [c.name, c.disabled]),
                  }
                );
                if (label === "390×600")
                  await shot(p, `mask-${sizeKey}-${mode}-paused`);
                const w = await wheelToLastCard(p);
                const lastW = w.L.cards[w.L.cards.length - 1];
                const h0 = (await ctl(p)).heroes;
                if (lastW && lastW.center)
                  await p.mouse.click(lastW.center[0], lastW.center[1]);
                await sleep(400);
                check(
                  `${tag}：暫停中捲到最後一張武將卡：可見但停用，滑鼠點了不派出、選單仍開著`,
                  !!lastW &&
                    lastW.visibleArea > 0 &&
                    lastW.disabled &&
                    (await ctl(p)).heroes === h0 &&
                    (await menuShown(p)),
                  { last: lastW, h0 }
                );
                const tw0 = await p.evaluate(() => {
                  const t = window.__testBridge.engine.towers[0];
                  return t
                    ? [t.towerUid, t.towerLevel, t.investedGold, t.targetMode]
                    : null;
                });
                const r = await p.evaluate(() => {
                  const b = window.__testBridge;
                  const e = b.engine;
                  const t = e.towers[0];
                  const hs = {
                    hero_id: "hero_zhao_yun",
                    level: 1,
                    atk: 110,
                    def: 65,
                    hp: 1150,
                  };
                  const c = t ? [t.gridCell.col, t.gridCell.row] : [0, 0];
                  b.setTowerTargetMode(c[0], c[1], "weakest");
                  return {
                    hero: b.placeHero(3, 3, hs),
                    tower: b.placeTower(6, 1, "archer"),
                    upgrade: t ? b.upgradeTower(c[0], c[1]) : null,
                    sell: t
                      ? b.sellTower({
                          battleId: e.battleManager.battleId,
                          towerUid: t.towerUid,
                          col: c[0],
                          row: c[1],
                          expectedRefund: t.getSellRefund(),
                        })
                      : null,
                  };
                });
                const tw1 = await p.evaluate(() => {
                  const t = window.__testBridge.engine.towers[0];
                  return t
                    ? [t.towerUid, t.towerLevel, t.investedGold, t.targetMode]
                    : null;
                });
                const s2 = await ctl(p);
                check(
                  `${tag}：暫停中頁面的派武將、建塔、升級、拆除、改目標入口都照既有守門拒絕，塔與金幣、武將都不變`,
                  r.hero === false &&
                    r.tower === false &&
                    r.upgrade === false &&
                    !!r.sell &&
                    r.sell.ok === false &&
                    sameJson(tw0, tw1) &&
                    !!tw0 &&
                    s2.gold === s1.gold &&
                    s2.heroes === s1.heroes,
                  { r, tw0, tw1, s1, s2 }
                );
                const Lr = await maskLayout(p);
                const resume = Lr.hud.find((b) => /▶ 繼續/.test(b.text));
                check(
                  `${tag}：暫停中 HUD「▶ 繼續」是最上層`,
                  !!resume && resume.onTop,
                  resume
                );
                if (resume && resume.onTop) {
                  await clickCenter(p, resume.rect);
                  await until(async () => !(await ctl(p)).paused, 3000);
                  const s3 = await ctl(p);
                  check(
                    `${tag}：滑鼠點繼續：同一個選單仍開著、恢復部署慢速 0.1`,
                    !s3.paused &&
                      s3.menuId === s0.menuId &&
                      Math.abs(s3.scale - 0.1) < 1e-9 &&
                      (await menuShown(p)),
                    s3
                  );
                  const L4 = await maskLayout(p);
                  const card = L4.cards.find(
                    (c) => c.visibleArea > 0 && !c.disabled && c.onTop
                  );
                  const h1 = (await ctl(p)).heroes;
                  if (card) await p.mouse.click(card.center[0], card.center[1]);
                  const closed = await until(
                    async () => !(await menuShown(p)),
                    5000
                  );
                  check(
                    `${tag}：繼續後滑鼠點一張可見的武將卡：派出成功才關閉選單`,
                    !!card && !!closed && (await ctl(p)).heroes === h1 + 1,
                    { card, h1, closed }
                  );
                }
              }
              // 暫停時按 × 關選單，不會自動繼續
              const o5 = await openMaskMenu(p, ROAD_CELLS, true);
              const L5 = o5.L;
              const pause2 = L5 && L5.hud.find((b) => /⏸ 暫停/.test(b.text));
              if (pause2 && pause2.onTop) {
                await clickCenter(p, pause2.rect);
                await until(async () => (await ctl(p)).paused, 3000);
                const L6 = await maskLayout(p);
                const xr = await p.evaluate(() => {
                  const b = document.querySelector(
                    '[data-testid="placement-menu"] [class*="placementHeader"] button'
                  );
                  const r = b && b.getBoundingClientRect();
                  return r
                    ? { x: r.left, y: r.top, w: r.width, h: r.height }
                    : null;
                });
                if (xr && L6.menu && L6.close.bad.length === 0)
                  await clickCenter(p, xr);
                const closed = await until(
                  async () => !(await menuShown(p)),
                  3000
                );
                await sleep(300);
                const s6 = await ctl(p);
                check(
                  `${tag}：暫停時滑鼠按選單 ×：選單關閉、仍是暫停（不會自動繼續）`,
                  !!xr && !!closed && s6.paused === true && s6.menuId === 0,
                  { xr, s6 }
                );
                const L7 = await maskLayout(p);
                const resume2 = L7.hud.find((b) => /▶ 繼續/.test(b.text));
                if (resume2 && resume2.onTop)
                  await clickCenter(p, resume2.rect);
                await until(async () => !(await ctl(p)).paused, 3000);
              } else {
                check(
                  `${tag}：（暫停時按 ×）第二格的選單打開且 HUD 暫停是最上層`,
                  false,
                  { L5: !!L5, pause2, tried: o5.tried }
                );
              }
              if (label === "390×600") {
                // 鍵盤：選單開著時正常 Tab 到 HUD 暫停按 Enter，再按 Enter 繼續
                const o8 = await openMaskMenu(p, ROAD_CELLS, true);
                const L8 = o8.L;
                const s8 = await ctl(p);
                let steps = -1;
                for (let i = 1; i <= 60; i++) {
                  await p.keyboard.press("Tab");
                  const t = await p.evaluate(
                    () =>
                      (document.activeElement &&
                        document.activeElement.innerText) ||
                      ""
                  );
                  if (/⏸ 暫停/.test(t)) {
                    steps = i;
                    break;
                  }
                }
                if (steps > 0) await p.keyboard.press("Enter");
                await until(async () => (await ctl(p)).paused, 3000);
                const s9 = await ctl(p);
                if (steps > 0) await p.keyboard.press("Enter");
                await until(async () => !(await ctl(p)).paused, 3000);
                const s10 = await ctl(p);
                check(
                  `${tag}：鍵盤正常 Tab 到 HUD「⏸ 暫停」按 Enter 暫停、再按 Enter 繼續，選單一直開著（同一個編號）`,
                  !!L8 &&
                    steps > 0 &&
                    s9.paused &&
                    !s10.paused &&
                    s9.menuId === s8.menuId &&
                    s10.menuId === s8.menuId &&
                    (await menuShown(p)),
                  { L8: !!L8, tried: o8.tried, steps, s8, s9, s10 }
                );
                await closeMenuX(p);
                await until(async () => !(await menuShown(p)), 3000);
              }
              if (label === "390×844") {
                // 結算（受控）後舊選單不復活
                const o9 = await openMaskMenu(p, ROAD_CELLS, true);
                const L9 = o9.L;
                const before = { menuId: (await ctl(p)).menuId };
                await endWith(p, { win: false });
                await until(async () => (await ctl(p)).state === 3, 5000);
                await until(
                  async () =>
                    (await p
                      .locator('[data-testid="result-overlay"]')
                      .count()) > 0,
                  5000
                );
                await sleep(600);
                const s11 = await ctl(p);
                const Lr1 = await maskLayout(p);
                // 舊選單若還在頁面上：標題每個字與每張卡片可見部分的中心都不是選單在最上層（被結算畫面蓋住）
                const covered = (L) =>
                  !L.menu ||
                  (L.title.n > 0 &&
                    L.title.bad.length === L.title.n &&
                    L.cards.every((c) => !c.onTop));
                check(
                  `${tag}：選單開著時受控結算：引擎的選單編號歸 0，結算畫面蓋住，舊選單沒有一點在最上層`,
                  !!L9 &&
                    before.menuId > 0 &&
                    s11.state === 3 &&
                    s11.menuId === 0 &&
                    covered(Lr1),
                  {
                    L9: !!L9,
                    tried: o9.tried,
                    before,
                    s11,
                    staleMenuInPage: Lr1.menu,
                    title: Lr1.title,
                  }
                );
                if (mode === "guest") {
                  // 結算畫面按「選擇關卡」再關掉地圖：結算時已清掉部署選單，舊選單不再出現
                  await p
                    .locator('[data-testid="result-overlay"] button', {
                      hasText: "選擇關卡",
                    })
                    .first()
                    .click();
                  const map = await until(
                    async () => (await p.locator(".modal.show").count()) > 0,
                    5000
                  );
                  await sleep(400);
                  await p.keyboard.press("Escape");
                  await until(
                    async () => (await p.locator(".modal").count()) === 0,
                    5000
                  );
                  await sleep(400);
                  const Lr2 = await maskLayout(p);
                  const s12 = await ctl(p);
                  check(
                    `${tag}：結算後按「選擇關卡」再關掉地圖：部署選單不再出現（頁面上沒有選單、引擎編號 0、武將數與金幣不變）`,
                    !!map &&
                      !Lr2.menu &&
                      s12.state === 3 &&
                      s12.menuId === 0 &&
                      s12.heroes === s11.heroes &&
                      s12.gold === s11.gold,
                    { map, staleMenuInPage: Lr2.menu, s11, s12 }
                  );
                  // 意外殘留時另記失敗紀錄與截圖（正常不會有）
                  if (Lr2.menu) {
                    note(`${tag}：關掉地圖後仍有舊部署選單（失敗紀錄）`, {
                      title: Lr2.title,
                      cards: Lr2.cards.map((c) => [
                        c.name,
                        c.disabled,
                        c.onTop,
                      ]),
                    });
                    await shot(p, `mask-${sizeKey}-stale-menu`);
                  }
                } else {
                  // 共用帳號：先等結算畫面顯示已保存到共用進度（寫入另在最後核）
                  settleShown = await until(
                    () =>
                      p
                        .locator('[data-testid="result-settle-confirmed"]')
                        .isVisible(),
                    10000
                  );
                  // 換場：結算畫面按「重新挑戰」載入新的一場，舊選單不再出現
                  await p
                    .locator('[data-testid="result-overlay"] button', {
                      hasText: "重新挑戰",
                    })
                    .first()
                    .click();
                  await until(
                    async () => (await ctl(p)).battleId !== s11.battleId,
                    5000
                  );
                  await sleep(600);
                  const s13 = await ctl(p);
                  check(
                    `${tag}：結算後按「重新挑戰」換成新的一場：舊選單不在頁面上、選單編號 0、回到備戰`,
                    s13.battleId !== s11.battleId &&
                      s13.state === 1 &&
                      s13.menuId === 0 &&
                      !(await menuShown(p)),
                    s13
                  );
                }
              }
            }
            if (mode === "guest")
              check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
            else if (phase === "BATTLE" && label === "390×844") {
              // 共用帳號的受控結算照原 strict 契約送出一次 save_result（敗、0 星）；重新挑戰後沒有再寫入
              const sv = E.gas.log.filter((e) => e.action === "save_result");
              const rid = sv[0] && sv[0].payload && sv[0].payload.request_id;
              check(
                "共用帳號：受控結算剛好一次 save_result（敗、0 星、10 點、base_rev 2、契約 2，結算畫面顯示已保存），沒有其他寫入",
                !!settleShown &&
                  sv.length === 1 &&
                  typeof rid === "string" &&
                  sameJson(sv[0].payload, {
                    stage_id: "chapter1_1",
                    result: "LOSE",
                    stars_earned: 0,
                    kills: 12,
                    time_seconds: 95,
                    loots: [{ item: "battle_points", count: 10 }],
                    request_id: rid,
                    base_rev: 2,
                    settle_contract: 2,
                  }) &&
                  E.gas.writes().length === 1,
                E.gas.writes().map((e) => [e.action, e.payload])
              );
            } else
              check(
                "共用帳號：沒有任何寫入請求",
                E.gas.writes().length === 0,
                E.gas.writes()
              );
            return E;
          }
        );
      }

  /** HUD 按鈕中心落在某個視窗（元素）矩形裡的，都不能是 HUD 在最上層 */
  const hudUnder = (p, sel) =>
    p.evaluate((s) => {
      const bar = document.querySelector('[class*="hudActionBar"]');
      const dlg = document.querySelector(s);
      if (!bar || !dlg) return null;
      const d = dlg.getBoundingClientRect();
      return [...bar.querySelectorAll("button")].map((b) => {
        const r = b.getBoundingClientRect();
        const x = r.left + r.width / 2;
        const y = r.top + r.height / 2;
        const inView = x >= 0 && y >= 0 && x < innerWidth && y < innerHeight;
        const inDlg =
          x >= d.left && x <= d.right && y >= d.top && y <= d.bottom;
        const el = inView ? document.elementFromPoint(x, y) : null;
        return {
          text: (b.innerText || "").trim(),
          inView,
          inDlg,
          hud: !!el && bar.contains(el),
        };
      });
    }, sel);
  const noHudPierce = (rows) =>
    !!rows &&
    rows.filter((r) => r.inView && r.inDlg).length > 0 &&
    rows.filter((r) => r.inView && r.inDlg).every((r) => !r.hud);
  for (const [label, viewport] of MASK_SIZES) {
    const sizeKey = label.replace("×", "x");
    await scenario(
      `遮罩與 HUD：${label} 訪客：設定、武將、主公資訊、升級面板、聊天、結算視窗真正開著時，背景 HUD 不穿透、點不到`,
      async (mk) => {
        const { E, p } = await maskEnter(mk, "guest", viewport);
        const b1 = await buildTower(p, TOWER_CELLS[1], "弓兵塔");
        check("前置：建一座弓兵塔", b1.ok, b1);
        const tryPause = async () => {
          const rows = await p.evaluate(() => {
            const bar = document.querySelector('[class*="hudActionBar"]');
            const b =
              bar &&
              [...bar.querySelectorAll("button")].find((x) =>
                /⏸ 暫停/.test(x.innerText || "")
              );
            const r = b && b.getBoundingClientRect();
            if (!r) return null;
            const x = r.left + r.width / 2;
            const y = r.top + r.height / 2;
            const el = document.elementFromPoint(x, y);
            return {
              x,
              y,
              hit: el
                ? `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`
                : "none",
            };
          });
          if (rows) await p.mouse.click(rows.x, rows.y);
          await sleep(300);
          return { paused: (await ctl(p)).paused, at: rows };
        };
        for (const [name, open, sel, closeFn] of [
          [
            "設定",
            () => p.locator("button", { hasText: "⚙️" }).first().click(),
            ".modal.show",
            () => p.keyboard.press("Escape"),
          ],
          [
            "武將",
            () =>
              p
                .locator("button", { hasText: /^武將$/ })
                .first()
                .click(),
            ".modal.show",
            () => p.keyboard.press("Escape"),
          ],
          [
            "主公資訊",
            () => p.locator('button[aria-label="主公資訊"]').first().click(),
            ".modal.show",
            () => p.keyboard.press("Escape"),
          ],
        ]) {
          await open();
          const shown = await until(
            async () => (await p.locator(".modal.show").count()) > 0,
            5000
          );
          await sleep(400);
          // .modal.show 是蓋滿畫面的視窗層：視窗內所有 HUD 按鈕中心都不能是 HUD 在最上層
          const rows = await hudUnder(p, sel);
          check(
            `${label} ${name}視窗開著：背景 HUD 按鈕中心都被視窗蓋住（不是 HUD 在最上層）`,
            !!shown && noHudPierce(rows),
            rows
          );
          if (name === "設定") await shot(p, `mask-${sizeKey}-settings`);
          await closeFn();
          // 等淡出結束、視窗元素整個移除
          await until(
            async () => (await p.locator(".modal").count()) === 0,
            5000
          );
          await sleep(300);
        }
        // 升級面板（點已建的塔）
        const panel = await towerPanel(p, TOWER_CELLS[1]);
        await sleep(400);
        const rowsP = await hudUnder(p, '[data-testid="upgrade-panel"]');
        const overlapP = rowsP
          ? rowsP.filter((r) => r.inView && r.inDlg).length
          : 0;
        check(
          `${label} 升級面板開著：落在面板上的 HUD 按鈕中心都被面板蓋住${overlapP === 0 ? "（這個尺寸面板沒有蓋到 HUD 按鈕中心，另列）" : ""}`,
          !!panel &&
            !!rowsP &&
            rowsP.filter((r) => r.inView && r.inDlg).every((r) => !r.hud),
          rowsP
        );
        await closePanel(p);
        // 聊天視窗
        const chatBtn = p.locator('button[aria-label="切換聊天視窗"]');
        if (await chatBtn.count()) {
          await chatBtn.first().click();
          await sleep(800);
          const chatRows = await p.evaluate(() => {
            const bar = document.querySelector('[class*="hudActionBar"]');
            const closeBtn = document.querySelector(
              'button[aria-label="關閉聊天視窗"]'
            );
            const panelEl = closeBtn && closeBtn.closest(".card");
            if (!panelEl) return { panel: null };
            const d = panelEl.getBoundingClientRect();
            const rows = [...bar.querySelectorAll("button")].map((b) => {
              const r = b.getBoundingClientRect();
              const x = r.left + r.width / 2;
              const y = r.top + r.height / 2;
              const inView =
                x >= 0 && y >= 0 && x < innerWidth && y < innerHeight;
              const inDlg =
                x >= d.left && x <= d.right && y >= d.top && y <= d.bottom;
              const el = inView ? document.elementFromPoint(x, y) : null;
              return {
                text: (b.innerText || "").trim(),
                inView,
                inDlg,
                hud: !!el && bar.contains(el),
              };
            });
            return {
              panel: { x: d.left, y: d.top, w: d.width, h: d.height },
              rows,
            };
          });
          check(
            `${label} 聊天視窗開著：落在聊天視窗上的 HUD 按鈕中心都被聊天視窗蓋住${chatRows.rows && chatRows.rows.filter((r) => r.inView && r.inDlg).length === 0 ? "（這個尺寸沒有蓋到 HUD 按鈕中心，另列）" : ""}`,
            !!chatRows.panel &&
              chatRows.rows
                .filter((r) => r.inView && r.inDlg)
                .every((r) => !r.hud),
            chatRows
          );
          // 用聊天視窗自己的關閉鈕關（窄螢幕時聊天視窗可能蓋住切換鈕）
          await p
            .locator('button[aria-label="關閉聊天視窗"]')
            .first()
            .click()
            .catch(() => {});
          const chatClosed = await until(
            async () =>
              (await p.locator('button[aria-label="關閉聊天視窗"]').count()) ===
              0,
            5000
          );
          check(`${label} 聊天視窗用關閉鈕關得起來`, !!chatClosed);
          await sleep(300);
        } else {
          check(`${label} 聊天按鈕存在`, false);
        }
        // 設定視窗開著時在 HUD 暫停的位置點一下：不能暫停（背景 HUD 點不到）
        await p.locator("button", { hasText: "⚙️" }).first().click();
        await until(
          async () => (await p.locator(".modal.show").count()) > 0,
          5000
        );
        await sleep(400);
        const pausedBehind = await tryPause();
        check(
          `${label} 設定視窗開著時點 HUD 暫停的位置：沒有暫停（背景 HUD 點不到）`,
          !!pausedBehind.at && pausedBehind.paused === false,
          pausedBehind
        );
        await p.keyboard.press("Escape");
        await until(
          async () => (await p.locator(".modal").count()) === 0,
          5000
        );
        await sleep(300);
        // 若背景 HUD 被點穿而暫停了（上面的具名檢查已失敗），關掉設定後照常按 HUD 繼續，讓後面的結算檢查仍會執行
        if ((await ctl(p)).paused) {
          await p
            .locator("button", { hasText: "▶ 繼續" })
            .first()
            .click()
            .catch(() => {});
          await until(async () => !(await ctl(p)).paused, 3000);
        }
        // 結算畫面（受控）
        check("按進入戰場開第 1 波", await startBattle(p));
        await endWith(p, { win: false });
        const res = await until(
          async () => (await p.locator('[class*="resultOverlay"]').count()) > 0,
          5000
        );
        await sleep(500);
        const rowsR = await hudUnder(p, '[class*="resultOverlay"]');
        check(
          `${label} 結算畫面開著：落在結算畫面上的 HUD 按鈕中心都被蓋住`,
          !!res &&
            !!rowsR &&
            rowsR.filter((r) => r.inView && r.inDlg).length > 0 &&
            rowsR.filter((r) => r.inView && r.inDlg).every((r) => !r.hud),
          rowsR
        );
        await shot(p, `mask-${sizeKey}-result`);
        check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
        return E;
      }
    );
    await scenario(
      `遮罩與 HUD：${label} 沒有金鑰：金鑰視窗開著時背景 HUD 不穿透`,
      async (mk) => {
        const E = await mk({
          maps: TOWER_MAPS,
          enemies: TOWER_ENEMIES,
          viewport,
        });
        const p = await E.page({ storage: {} });
        const shown = await until(
          async () =>
            (await p.locator('[data-testid="key-setup"]').count()) > 0,
          20000
        );
        await sleep(400);
        const rows = await hudUnder(p, '[data-testid="key-setup"]');
        check(
          `${label} 金鑰視窗開著：落在金鑰視窗上的 HUD 按鈕中心都被蓋住${rows && rows.filter((r) => r.inView && r.inDlg).length === 0 ? "（HUD 沒有在金鑰視窗範圍內，另列）" : ""}`,
          !!shown &&
            (!rows ||
              rows.filter((r) => r.inView && r.inDlg).every((r) => !r.hud)),
          { shown, rows }
        );
        check("沒有任何寫入請求", E.gas.writes().length === 0, E.gas.writes());
        return E;
      }
    );
  }

  // ═══ 32. 結算時清掉部署選單 ═══
  // 這一場的結束回呼通過場次守門之後，頁面清掉還開著的部署選單：結算畫面、關掉地圖、重新挑戰、下一關之後都不會再出現舊選單，新的一場仍能照常開新選單。
  // 從正常的備戰、開戰與部署選單開始；結算用既有的受控 endWith（不是自然通關）。舊場次晚到的結果是直接呼叫頁面掛在 bridge 上的結束回呼（受控），核場次守門。
  // 限制：頁面內部的選單 ref 在真頁面上沒辦法單獨觀察，只從之後的選單流程（新選單照常開、晚到的結果不清新選單）間接核
  const menuGone = (p) =>
    p.evaluate(
      () =>
        !document.querySelector('[data-testid="placement-menu"]') &&
        !document.querySelector('[class*="placementOverlay"]')
    );
  const resultShown = async (p) =>
    (await p.locator('[data-testid="result-overlay"]').count()) > 0;
  /** 選單開著時這一場受控結算：結算畫面出現，部署選單與遮罩都不在頁面上、引擎選單編號 0 */
  async function endAndCheck(p, tag, win) {
    const s0 = await ctl(p);
    await endWith(p, { win });
    const shown = await until(() => resultShown(p), 5000);
    await sleep(400);
    const s1 = await ctl(p);
    const gone = await menuGone(p);
    check(
      `${tag}：選單開著時這一場結算（受控，${win ? "勝" : "敗"}）：結算畫面出現，部署選單與遮罩都不在頁面上、引擎選單編號 0`,
      s0.menuId > 0 &&
        !!shown &&
        gone &&
        s1.state === 3 &&
        s1.menuId === 0 &&
        s1.battleId === s0.battleId,
      { s0, s1, shown, gone }
    );
    return { s0, s1 };
  }
  /** 新的一場（備戰）用正常滑鼠打開部署選單 */
  async function newMenu(p, tag, prevBattleId) {
    const o = await openMaskMenu(p, ROAD_CELLS, true);
    const s = await ctl(p);
    check(
      `${tag}：新的一場可以照常打開新的部署選單（新場次、編號大於 0、選單在頁面上）`,
      !!o.L &&
        s.battleId !== prevBattleId &&
        s.state === 1 &&
        s.menuId > 0 &&
        (await menuShown(p)),
      { s, tried: o.tried, prevBattleId }
    );
    return s;
  }
  /** 上一場的結果晚到（受控：直接呼叫頁面掛在 bridge 上的結束回呼）：新場的選單、編號、金幣、武將、金鑰與寫入都不變 */
  async function lateOldResult(p, E, tag, old) {
    const before = await ctl(p);
    const w0 = E.gas.writes().length;
    const key0 = (await storageOf(p)).ls.shenma_player_key ?? null;
    await p.evaluate((r) => window.__testBridge.onBattleEnded(r), old);
    await sleep(600);
    const after = await ctl(p);
    const key1 = (await storageOf(p)).ls.shenma_player_key ?? null;
    check(
      `${tag}：上一場的結果晚到：場次守門擋下，新場的部署選單仍開著、編號與金幣武將不變，沒有結算畫面、沒有新的寫入、金鑰不變`,
      (await menuShown(p)) &&
        sameJson(after, before) &&
        !(await resultShown(p)) &&
        E.gas.writes().length === w0 &&
        key1 === key0,
      { before, after, w0, w1: E.gas.writes().length, key0, key1 }
    );
  }
  const loseOf = (battleId) => ({
    result: "LOSE",
    stage_id: "chapter1_1",
    battle_id: battleId,
    stars_earned: 0,
    kills: 12,
    time_seconds: 95,
    loots: [{ item: "battle_points", count: 10 }],
  });
  for (const [label, viewport] of MASK_SIZES)
    for (const mode of ["guest", "shared"]) {
      const tag = `${label} ${mode === "guest" ? "訪客" : "共用帳號"}`;
      const sizeKey = label.replace("×", "x");
      await scenario(
        `結算清選單：${tag}：選單開著時結算，之後不再出現舊選單，新的一場照常開新選單、上一場的結果晚到不清新選單`,
        async (mk) => {
          const { E, p } = await maskEnter(
            mk,
            mode,
            viewport,
            `k_end_${sizeKey}`
          );
          check("按進入戰場開第 1 波", await startBattle(p));
          const o = await openMaskMenu(p, ROAD_CELLS, true);
          check(`${tag}：戰鬥中用正常滑鼠打開部署選單`, !!o.L, o.tried);
          const { s1 } = await endAndCheck(p, tag, false);
          let settleShown = null;
          if (mode === "guest") {
            // 結算畫面按「選擇關卡」打開地圖再關掉（390×600 用鍵盤 Tab／Enter／Escape，其餘用滑鼠按地圖的 ×）
            const kb = label === "390×600";
            let steps = -1;
            if (kb) {
              for (let i = 1; i <= 40; i++) {
                await p.keyboard.press("Tab");
                const t = await p.evaluate(
                  () =>
                    (document.activeElement &&
                      document.activeElement.innerText) ||
                    ""
                );
                if (/選擇關卡/.test(t)) {
                  steps = i;
                  break;
                }
              }
              if (steps > 0) await p.keyboard.press("Enter");
            } else {
              await p
                .locator('[data-testid="result-overlay"] button', {
                  hasText: "選擇關卡",
                })
                .first()
                .click();
            }
            const map = await until(
              async () => (await p.locator(".modal.show").count()) > 0,
              5000
            );
            await sleep(400);
            if (kb) await p.keyboard.press("Escape");
            else
              await p
                .locator(".modal.show .btn-close")
                .first()
                .click()
                .catch(() => {});
            await until(
              async () => (await p.locator(".modal").count()) === 0,
              5000
            );
            await sleep(400);
            const s2 = await ctl(p);
            check(
              `${tag}：結算後${kb ? "用鍵盤" : "用滑鼠"}按「選擇關卡」再關掉地圖：沒有舊部署選單與遮罩、沒有結算畫面，仍是這一場的結算（編號 0、金幣與武將不變）`,
              !!map &&
                (!kb || steps > 0) &&
                (await menuGone(p)) &&
                !(await resultShown(p)) &&
                s2.state === 3 &&
                s2.menuId === 0 &&
                s2.battleId === s1.battleId &&
                s2.gold === s1.gold &&
                s2.heroes === s1.heroes,
              { map, steps, s1, s2 }
            );
            // 舊部署選單仍在（上面的具名檢查已失敗）就不再點後面的按鈕
            if (!(await menuGone(p))) {
              note(
                `${tag}：舊部署選單仍在頁面上，之後的選關、新選單與晚到結果步驟沒有執行`,
                s2
              );
              return E;
            }
            // 從 HUD 的地圖按鈕真正選一關（第一關），換成新的一場
            await p.locator('button[title="切換關卡"]').first().click();
            await until(
              async () => (await p.locator(".modal.show").count()) > 0,
              5000
            );
            await sleep(400);
            await p
              .locator(".modal.show .card", { hasText: "chapter1_1" })
              .first()
              .click();
          } else {
            // 共用帳號：先等結算畫面顯示已保存，再按「重新挑戰」換成新的一場
            settleShown = await until(
              () =>
                p
                  .locator('[data-testid="result-settle-confirmed"]')
                  .isVisible(),
              10000
            );
            await p
              .locator('[data-testid="result-overlay"] button', {
                hasText: "重新挑戰",
              })
              .first()
              .click();
          }
          await until(
            async () => (await ctl(p)).battleId !== s1.battleId,
            5000
          );
          await until(
            async () => (await p.locator(".modal").count()) === 0,
            5000
          );
          await sleep(600);
          check(
            `${tag}：換成新的一場之後沒有結算畫面、沒有舊部署選單`,
            !(await resultShown(p)) && (await menuGone(p)),
            await ctl(p)
          );
          await newMenu(p, tag, s1.battleId);
          if (label === "390×844" && mode === "guest")
            await shot(p, `end-${sizeKey}-new-menu`);
          await lateOldResult(p, E, tag, loseOf(s1.battleId));
          if (mode === "guest")
            check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
          else {
            const sv = E.gas.log.filter((e) => e.action === "save_result");
            const rid = sv[0] && sv[0].payload && sv[0].payload.request_id;
            check(
              "共用帳號：受控結算剛好一次 save_result（敗、0 星、10 點、base_rev 2、契約 2，結算畫面顯示已保存），重新挑戰與晚到的結果都沒有再寫入",
              !!settleShown &&
                sv.length === 1 &&
                typeof rid === "string" &&
                sameJson(sv[0].payload, {
                  stage_id: "chapter1_1",
                  result: "LOSE",
                  stars_earned: 0,
                  kills: 12,
                  time_seconds: 95,
                  loots: [{ item: "battle_points", count: 10 }],
                  request_id: rid,
                  base_rev: 2,
                  settle_contract: 2,
                }) &&
                E.gas.writes().length === 1,
              E.gas.writes().map((e) => [e.action, e.payload])
            );
          }
          return E;
        }
      );
    }
  await scenario(
    "結算清選單：1280×800 訪客 勝利：結算時清掉選單，按「下一關」到第二關後照常開新選單",
    async (mk) => {
      const tag = "1280×800 訪客 勝利";
      const { E, p } = await maskEnter(mk, "guest", {
        width: 1280,
        height: 800,
      });
      check("按進入戰場開第 1 波", await startBattle(p));
      const o = await openMaskMenu(p, ROAD_CELLS, true);
      check(`${tag}：戰鬥中用正常滑鼠打開部署選單`, !!o.L, o.tried);
      const { s1 } = await endAndCheck(p, tag, true);
      const next =
        (await p.locator('[data-testid="result-next-stage"]').count()) === 1;
      if (next) await p.locator('[data-testid="result-next-stage"]').click();
      const moved = await until(
        async () => (await stageOf(p)) === "chapter1_2",
        5000
      );
      await sleep(600);
      check(
        `${tag}：按「下一關」（已解鎖）到第二關：新的一場、沒有結算畫面、沒有舊部署選單`,
        next &&
          !!moved &&
          (await ctl(p)).battleId !== s1.battleId &&
          !(await resultShown(p)) &&
          (await menuGone(p)),
        { next, moved, stage: await stageOf(p) }
      );
      const s2 = await newMenu(p, tag, s1.battleId);
      // 關掉這個選單，從 HUD 的地圖按鈕真正選另一關（第一關），新的一場仍能開新選單
      await closeMenuX(p);
      await until(async () => !(await menuShown(p)), 3000);
      await p.locator('button[title="切換關卡"]').first().click();
      await until(
        async () => (await p.locator(".modal.show").count()) > 0,
        5000
      );
      await sleep(400);
      await p
        .locator(".modal.show .card", { hasText: "chapter1_1" })
        .first()
        .click();
      const back1 = await until(
        async () =>
          (await stageOf(p)) === "chapter1_1" &&
          (await ctl(p)).battleId !== s2.battleId,
        5000
      );
      await until(async () => (await p.locator(".modal").count()) === 0, 5000);
      await sleep(600);
      check(
        `${tag}：從地圖選另一關（第一關）：新的一場、沒有結算畫面、沒有舊部署選單`,
        !!back1 && !(await resultShown(p)) && (await menuGone(p)),
        { stage: await stageOf(p), s: await ctl(p) }
      );
      await newMenu(p, `${tag} 選另一關後`, s2.battleId);
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );
  await scenario(
    "結算清選單：390×844 共用帳號 結算結果不明：清掉選單、保留待確認的結算與「重新確認」，不自動重送",
    async (mk) => {
      const tag = "390×844 共用帳號 結果不明";
      const { E, p } = await maskEnter(
        mk,
        "shared",
        { width: 390, height: 844 },
        "k_end_unknown"
      );
      // 後端回 SERVER_ERROR（結果不明）
      E.gas.rule("save_result", "transform", {
        fn: () => ({ status: 500, error: "SERVER_ERROR" }),
      });
      E.allowGasErrors = 1;
      check("按進入戰場開第 1 波", await startBattle(p));
      const o = await openMaskMenu(p, ROAD_CELLS, true);
      check(`${tag}：戰鬥中用正常滑鼠打開部署選單`, !!o.L, o.tried);
      await endAndCheck(p, tag, false);
      const retry = await until(
        () => p.locator('[data-testid="result-settle-retry"]').isVisible(),
        10000
      );
      await sleep(1500);
      const pend = await pendingKeys(p);
      check(
        `${tag}：結算畫面保留待確認與「重新確認」，只送過一次 save_result（沒有自動重送），暫存的待確認結算還在，部署選單仍不在頁面上`,
        !!retry &&
          E.gas.count("save_result") === 1 &&
          pend.length === 1 &&
          (await menuGone(p)),
        { retry, n: E.gas.count("save_result"), pend }
      );
      return E;
    }
  );

  // ═══ 33. 結算時清掉升級面板與武將資訊 ═══
  // 這一場的結束回呼通過場次守門之後，頁面也清掉升級面板與武將資訊：結算畫面、關掉地圖、重新挑戰、下一關、選另一關之後都不會再出現舊面板，新的一場仍能照常打開。
  // 面板都用正常滑鼠點畫布上的塔或武將打開；結算用既有的受控 endWith（不是自然通關）；上一場晚到的結果直接呼叫頁面掛在 bridge 上的結束回呼（受控）
  const PANEL_SEL = {
    upgrade: '[data-testid="upgrade-panel"]',
    hero: '[data-testid="hero-info-panel"]',
  };
  const PANEL_NAME = { upgrade: "升級面板", hero: "武將資訊" };
  const panelsGone = (p) =>
    p.evaluate(
      (sels) => sels.every((s) => !document.querySelector(s)),
      Object.values(PANEL_SEL)
    );
  const panelText = (p, kind) =>
    p.evaluate((s) => {
      const el = document.querySelector(s);
      return el ? el.innerText : null;
    }, PANEL_SEL[kind]);
  /** 備戰中準備面板的對象：升級面板建一座弓兵塔；武將資訊從部署選單派一位武將（正常滑鼠） */
  async function preparePanel(p, kind, tag) {
    if (kind === "upgrade") {
      const b = await buildTower(p, TOWER_CELLS[1], "弓兵塔");
      check(`${tag}：備戰中建一座弓兵塔`, b.ok, b);
      return b.ok;
    }
    const h0 = (await ctl(p)).heroes;
    const o = await openMaskMenu(p, ROAD_CELLS, true);
    const card =
      o.L && o.L.cards.find((c) => c.visibleArea > 0 && !c.disabled && c.onTop);
    if (card) await p.mouse.click(card.center[0], card.center[1]);
    const ok =
      !!card &&
      (await until(async () => (await ctl(p)).heroes === h0 + 1, 5000));
    check(`${tag}：備戰中從部署選單派一位武將`, !!ok, {
      tried: o.tried,
      card,
    });
    return !!ok;
  }
  /** 正常滑鼠打開面板：升級面板點已建的塔；武將資訊點場上的第一位武將 */
  async function openPanel(p, kind) {
    if (kind === "upgrade") return !!(await towerPanel(p, TOWER_CELLS[1]));
    const hp = await p.evaluate(() => {
      const e = window.__testBridge.engine;
      const h = e.heroes[0];
      const r = e.canvas.getBoundingClientRect();
      return h ? { x: r.left + h.x, y: r.top + h.y } : null;
    });
    if (!hp) return false;
    await p.mouse.click(hp.x, hp.y);
    return !!(await until(
      async () => (await p.locator(PANEL_SEL.hero).count()) > 0,
      3000
    ));
  }
  for (const [label, viewport] of MASK_SIZES)
    for (const mode of ["guest", "shared"])
      for (const kind of ["upgrade", "hero"]) {
        const win = label === "1280×800" && mode === "guest";
        const name = PANEL_NAME[kind];
        const tag = `${label} ${mode === "guest" ? "訪客" : "共用帳號"} ${name}`;
        const sizeKey = label.replace("×", "x");
        await scenario(
          `結算清面板：${tag}：${name}開著時結算（${win ? "勝" : "敗"}），之後不再出現舊面板，新的一場照常打開、上一場的結果晚到不清新面板`,
          async (mk) => {
            const { E, p } = await maskEnter(
              mk,
              mode,
              viewport,
              `k_pan_${sizeKey}_${kind}`
            );
            if (!(await preparePanel(p, kind, tag))) return E;
            check("按進入戰場開第 1 波", await startBattle(p));
            const opened = await openPanel(p, kind);
            const s0 = await ctl(p);
            check(`${tag}：戰鬥中用正常滑鼠打開${name}`, opened, s0);
            if (!opened) return E;
            await endWith(p, { win });
            const shown = await until(() => resultShown(p), 5000);
            await sleep(400);
            const s1 = await ctl(p);
            const gone = await panelsGone(p);
            check(
              `${tag}：${name}開著時這一場結算（受控，${win ? "勝" : "敗"}）：結算畫面出現，升級面板與武將資訊都不在頁面上，同一場、金幣與塔、武將不變`,
              !!shown &&
                gone &&
                s1.state === 3 &&
                s1.battleId === s0.battleId &&
                s1.gold === s0.gold &&
                sameJson(s1.towers, s0.towers) &&
                s1.heroes === s0.heroes,
              { s0, s1, shown, gone }
            );
            let settleShown = null;
            if (mode === "guest") {
              // 結算畫面按「選擇關卡」打開地圖再關掉（390×600 用鍵盤 Tab／Enter／Escape，其餘用滑鼠按地圖的 ×）
              const kb = label === "390×600";
              let steps = -1;
              if (kb) {
                for (let i = 1; i <= 40; i++) {
                  await p.keyboard.press("Tab");
                  const t = await p.evaluate(
                    () =>
                      (document.activeElement &&
                        document.activeElement.innerText) ||
                      ""
                  );
                  if (/選擇關卡/.test(t)) {
                    steps = i;
                    break;
                  }
                }
                if (steps > 0) await p.keyboard.press("Enter");
              } else {
                await p
                  .locator('[data-testid="result-overlay"] button', {
                    hasText: "選擇關卡",
                  })
                  .first()
                  .click();
              }
              const map = await until(
                async () => (await p.locator(".modal.show").count()) > 0,
                5000
              );
              await sleep(400);
              if (kb) await p.keyboard.press("Escape");
              else
                await p
                  .locator(".modal.show .btn-close")
                  .first()
                  .click()
                  .catch(() => {});
              await until(
                async () => (await p.locator(".modal").count()) === 0,
                5000
              );
              await sleep(400);
              const s2 = await ctl(p);
              check(
                `${tag}：結算後${kb ? "用鍵盤" : "用滑鼠"}按「選擇關卡」再關掉地圖：沒有舊的升級面板與武將資訊、沒有結算畫面，仍是這一場的結算（金幣與塔、武將不變）`,
                !!map &&
                  (!kb || steps > 0) &&
                  (await panelsGone(p)) &&
                  !(await resultShown(p)) &&
                  s2.state === 3 &&
                  s2.battleId === s1.battleId &&
                  s2.gold === s1.gold &&
                  sameJson(s2.towers, s1.towers) &&
                  s2.heroes === s1.heroes,
                { map, steps, s1, s2 }
              );
              // 舊面板仍在（上面的具名檢查已失敗）就不再點後面的按鈕
              if (!(await panelsGone(p))) {
                note(
                  `${tag}：舊面板仍在頁面上，之後的換場、新面板與晚到結果步驟沒有執行`,
                  s2
                );
                return E;
              }
              if (win) {
                // 勝：從 HUD 的地圖按鈕選已解鎖的第二關
                await p.locator('button[title="切換關卡"]').first().click();
                await until(
                  async () => (await p.locator(".modal.show").count()) > 0,
                  5000
                );
                await sleep(400);
                await p
                  .locator(".modal.show .card", { hasText: "chapter1_2" })
                  .first()
                  .click();
              } else {
                // 敗：從 HUD 的地圖按鈕真正選一關（第一關）
                await p.locator('button[title="切換關卡"]').first().click();
                await until(
                  async () => (await p.locator(".modal.show").count()) > 0,
                  5000
                );
                await sleep(400);
                await p
                  .locator(".modal.show .card", { hasText: "chapter1_1" })
                  .first()
                  .click();
              }
            } else {
              // 共用帳號：先等結算畫面顯示已保存，再按「重新挑戰」換成新的一場
              settleShown = await until(
                () =>
                  p
                    .locator('[data-testid="result-settle-confirmed"]')
                    .isVisible(),
                10000
              );
              await p
                .locator('[data-testid="result-overlay"] button', {
                  hasText: "重新挑戰",
                })
                .first()
                .click();
            }
            await until(
              async () => (await ctl(p)).battleId !== s1.battleId,
              5000
            );
            await until(
              async () => (await p.locator(".modal").count()) === 0,
              5000
            );
            await sleep(600);
            const s3 = await ctl(p);
            check(
              `${tag}：換成新的一場${win ? "（第二關）" : ""}之後沒有結算畫面、沒有舊的升級面板與武將資訊`,
              s3.battleId !== s1.battleId &&
                (!win || (await stageOf(p)) === "chapter1_2") &&
                !(await resultShown(p)) &&
                (await panelsGone(p)),
              { s3, stage: await stageOf(p) }
            );
            const prep2 = await preparePanel(p, kind, `${tag} 新的一場`);
            const opened2 = prep2 && (await openPanel(p, kind));
            check(
              `${tag}：新的一場可以照常用正常滑鼠打開${name}`,
              !!opened2,
              await ctl(p)
            );
            if (opened2) {
              // 上一場的結果晚到（受控）：新場的面板、內容、場次、金幣與塔、武將、寫入與金鑰都不變
              const before = await ctl(p);
              const txt0 = await panelText(p, kind);
              const w0 = E.gas.writes().length;
              const key0 = (await storageOf(p)).ls.shenma_player_key ?? null;
              await p.evaluate(
                (r) => window.__testBridge.onBattleEnded(r),
                loseOf(s1.battleId)
              );
              await sleep(600);
              const after = await ctl(p);
              const txt1 = await panelText(p, kind);
              const key1 = (await storageOf(p)).ls.shenma_player_key ?? null;
              check(
                `${tag}：上一場的結果晚到：場次守門擋下，新場的${name}仍開著、內容與場次、金幣與塔、武將不變，沒有結算畫面、沒有新的寫入、金鑰不變`,
                txt1 !== null &&
                  txt1 === txt0 &&
                  sameJson(after, before) &&
                  !(await resultShown(p)) &&
                  E.gas.writes().length === w0 &&
                  key1 === key0,
                { before, after, same: txt1 === txt0, w0, key0, key1 }
              );
            }
            if (label === "390×844" && mode === "guest")
              await shot(p, `panel-${sizeKey}-${kind}-new`);
            if (mode === "guest")
              check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
            else {
              const sv = E.gas.log.filter((e) => e.action === "save_result");
              const rid = sv[0] && sv[0].payload && sv[0].payload.request_id;
              check(
                "共用帳號：受控結算剛好一次 save_result（敗、0 星、10 點、base_rev 2、契約 2，結算畫面顯示已保存），重新挑戰與晚到的結果都沒有再寫入",
                !!settleShown &&
                  sv.length === 1 &&
                  typeof rid === "string" &&
                  sameJson(sv[0].payload, {
                    stage_id: "chapter1_1",
                    result: "LOSE",
                    stars_earned: 0,
                    kills: 12,
                    time_seconds: 95,
                    loots: [{ item: "battle_points", count: 10 }],
                    request_id: rid,
                    base_rev: 2,
                    settle_contract: 2,
                  }) &&
                  E.gas.writes().length === 1,
                E.gas.writes().map((e) => [e.action, e.payload])
              );
            }
            return E;
          }
        );
      }
  await scenario(
    "結算清面板：390×844 共用帳號 升級面板 結算結果不明：清掉面板、保留待確認的結算與「重新確認」，不自動重送",
    async (mk) => {
      const tag = "390×844 共用帳號 升級面板 結果不明";
      const { E, p } = await maskEnter(
        mk,
        "shared",
        { width: 390, height: 844 },
        "k_pan_unknown"
      );
      // 後端回 SERVER_ERROR（結果不明）
      E.gas.rule("save_result", "transform", {
        fn: () => ({ status: 500, error: "SERVER_ERROR" }),
      });
      E.allowGasErrors = 1;
      if (!(await preparePanel(p, "upgrade", tag))) return E;
      check("按進入戰場開第 1 波", await startBattle(p));
      const opened = await openPanel(p, "upgrade");
      check(`${tag}：戰鬥中用正常滑鼠打開升級面板`, opened);
      if (!opened) return E;
      await endWith(p, { win: false });
      const retry = await until(
        () => p.locator('[data-testid="result-settle-retry"]').isVisible(),
        10000
      );
      await sleep(1500);
      const pend = await pendingKeys(p);
      check(
        `${tag}：結算畫面保留待確認與「重新確認」，只送過一次 save_result（沒有自動重送），暫存的待確認結算還在，升級面板與武將資訊都不在頁面上`,
        !!retry &&
          E.gas.count("save_result") === 1 &&
          pend.length === 1 &&
          (await panelsGone(p)),
        { retry, n: E.gas.count("save_result"), pend }
      );
      return E;
    }
  );

  // ═══ 34. 窄畫面 HUD 操作列 ═══
  // 寬度小於 576px 時操作列縮小內距、間距與字級（高度 30px、不換行）：八顆按鈕整顆在視窗內、文字不被裁切、彼此不交疊、中心與內部點得到；
  // 正常 Tab 走過所有可聚焦的 HUD 按鈕時，HUD 到 document 的每一層與 window 都沒有橫向捲動；部署選單、遮罩與其他視窗的層次照第 31 段。
  // 只在本機 Chromium 驗證（沒有觸控實機、其他瀏覽器或字型）；斷點兩側（575／576）的 computed 樣式另核
  const NARROW_SIZES = [
    ...[360, 375, 390, 420, 421, 480, 575, 576].map((w) => [
      `${w}×600`,
      { width: w, height: 600 },
    ]),
    ["390×844", { width: 390, height: 844 }],
    ["1280×800", { width: 1280, height: 800 }],
  ];
  const NARROW_LABELS = {
    PREP: ["迎戰", "自動", "1x", "2x", "⏸ 暫停", "⏳ 下一波", "武將", "隊伍"],
    BATTLE: [
      "戰鬥中",
      "自動",
      "1x",
      "2x",
      "⏸ 暫停",
      "⏳ 下一波",
      "武將",
      "隊伍",
    ],
  };
  /** 頁面內量測 HUD 操作列（DOMRect 不四捨五入）：按鈕矩形、逐字 Range、內部格點命中、兩兩交疊、computed 樣式、各層捲動 */
  const narrowHud = (p) =>
    p.evaluate(() => {
      const bar = document.querySelector('[class*="hudActionBar"]');
      const rr = (b) => ({ x: b.left, y: b.top, w: b.width, h: b.height });
      const vw = innerWidth;
      const vh = innerHeight;
      const btns = [...bar.querySelectorAll("button")];
      const rows = btns.map((b) => {
        const r = rr(b.getBoundingClientRect());
        const chars = [];
        const walker = document.createTreeWalker(b, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walker.nextNode()))
          for (let i = 0; i < n.length; i++) {
            if (!n.data[i].trim()) continue;
            const rg = document.createRange();
            rg.setStart(n, i);
            rg.setEnd(n, i + 1);
            for (const q of rg.getClientRects())
              if (q.width > 0 && q.height > 0) chars.push(rr(q));
          }
        const charsIn = chars.every(
          (c) =>
            c.x >= r.x - 0.5 &&
            c.x + c.w <= r.x + r.w + 0.5 &&
            c.y >= r.y - 0.5 &&
            c.y + c.h <= r.y + r.h + 0.5 &&
            c.x >= -0.5 &&
            c.x + c.w <= vw + 0.5
        );
        const grid = [];
        for (const fx of [0.25, 0.5, 0.75])
          for (const fy of [0.25, 0.5, 0.75]) {
            const x = r.x + r.w * fx;
            const y = r.y + r.h * fy;
            const el =
              x >= 0 && x < vw && y >= 0 && y < vh
                ? document.elementFromPoint(x, y)
                : null;
            grid.push(!!el && b.contains(el));
          }
        return {
          text: (b.innerText || "").replace(/\s+/g, " ").trim(),
          disabled: b.disabled,
          rect: r,
          fullyIn: r.x >= -0.01 && r.x + r.w <= vw + 0.01,
          chars: chars.length,
          charsIn,
          notClipped: b.scrollWidth <= b.clientWidth + 0.5,
          gridHit: grid.every(Boolean),
        };
      });
      const overlaps = [];
      for (let i = 0; i < rows.length; i++)
        for (let j = i + 1; j < rows.length; j++) {
          const a = rows[i].rect;
          const c = rows[j].rect;
          const w = Math.min(a.x + a.w, c.x + c.w) - Math.max(a.x, c.x);
          const h = Math.min(a.y + a.h, c.y + c.h) - Math.max(a.y, c.y);
          if (w > 0.01 && h > 0.01)
            overlaps.push([rows[i].text, rows[j].text, w * h]);
        }
      const scrolled = [];
      for (let el = bar; el; el = el.parentElement)
        if (el.scrollLeft !== 0)
          scrolled.push([String(el.className).slice(0, 30), el.scrollLeft]);
      const cs = (el) => getComputedStyle(el);
      const left = bar.querySelector('[class*="hudActionBarLeft"]');
      const auto = btns.find((b) => /自動/.test(b.innerText || ""));
      return {
        viewport: [vw, vh],
        bar: rr(bar.getBoundingClientRect()),
        rows,
        overlaps,
        scrolled,
        docScroll: [document.scrollingElement.scrollLeft, scrollX],
        style: {
          barPad: [cs(bar).paddingLeft, cs(bar).paddingRight],
          groupGap: cs(left).columnGap,
          groupPad: [cs(left).paddingLeft, cs(left).paddingRight],
          btnPad: auto ? [cs(auto).paddingLeft, cs(auto).paddingRight] : null,
          btnFont: auto ? cs(auto).fontSize : null,
          btnMinW: auto ? cs(auto).minWidth : null,
          btnH: auto ? cs(auto).height : null,
        },
      };
    });
  const narrowFits = (H) =>
    H.rows.length === 8 &&
    H.rows.every(
      (r) =>
        r.fullyIn &&
        r.rect.w >= 24 - 0.01 &&
        Math.abs(r.rect.h - 30) < 0.01 &&
        r.chars > 0 &&
        r.charsIn &&
        r.notClipped &&
        r.gridHit
    ) &&
    H.overlaps.length === 0;
  const narrowNoScroll = (H) =>
    H.scrolled.length === 0 && H.docScroll.every((v) => v === 0);
  const narrowRows = (H) =>
    H.rows.map((r) => [
      r.text,
      r.disabled,
      r.rect.x,
      r.rect.x + r.rect.w,
      r.rect.w,
      r.rect.h,
      r.fullyIn,
      r.charsIn,
      r.notClipped,
      r.gridHit,
    ]);
  /** 正常 Tab 往後走，記每一步的焦點與 HUD 到 document 每一層、window 的橫向捲動；離開 HUD 後停 */
  async function narrowTab(p) {
    const steps = [];
    let seen = false;
    for (let i = 1; i <= 50; i++) {
      await p.keyboard.press("Tab");
      await sleep(60);
      const s = await p.evaluate(() => {
        const bar = document.querySelector('[class*="hudActionBar"]');
        const a = document.activeElement;
        const scrolled = [];
        for (let el = bar; el; el = el.parentElement)
          if (el.scrollLeft !== 0)
            scrolled.push([String(el.className).slice(0, 30), el.scrollLeft]);
        const inBar = !!a && bar.contains(a);
        const r = inBar ? a.getBoundingClientRect() : null;
        return {
          inBar,
          text: inBar ? (a.innerText || "").replace(/\s+/g, " ").trim() : null,
          disabled: inBar ? a.disabled : null,
          fullyIn: r ? r.left >= -0.01 && r.right <= innerWidth + 0.01 : null,
          scrolled,
          doc: [document.scrollingElement.scrollLeft, scrollX],
        };
      });
      steps.push({ i, ...s });
      if (s.inBar) seen = true;
      else if (seen) break;
    }
    return steps;
  }
  const narrowState = async (p, E) => ({
    s: await ctl(p),
    writes: E.gas.writes().length,
    key: (await storageOf(p)).ls.shenma_player_key ?? null,
  });
  /** 倍率按鈕 1x／2x 的 computed 樣式與 DOMRect：按鈕有 0.15s transition，每 150ms 取一次、連續兩次相同才回（量測前置，不是重試斷言） */
  async function narrowSpeed(p) {
    const once = () =>
      p.evaluate(() => {
        const bar = document.querySelector('[class*="hudActionBar"]');
        return [...bar.querySelectorAll("button")]
          .filter((b) => /^[12]x$/.test((b.innerText || "").trim()))
          .map((b) => {
            const cs = getComputedStyle(b);
            const r = b.getBoundingClientRect();
            return {
              text: b.innerText.trim(),
              active: /hudActionBtnActive/.test(String(b.className)),
              padding: [
                cs.paddingLeft,
                cs.paddingRight,
                cs.paddingTop,
                cs.paddingBottom,
              ],
              font: [cs.fontSize, cs.fontWeight, cs.letterSpacing],
              borderLeft: [
                cs.borderLeftWidth,
                cs.borderLeftStyle,
                cs.borderLeftColor,
              ],
              height: cs.height,
              w: r.width,
              h: r.height,
            };
          });
      });
    let prev = await once();
    for (let i = 0; i < 20; i++) {
      await sleep(150);
      const cur = await once();
      if (sameJson(cur, prev)) return cur;
      prev = cur;
    }
    return prev;
  }
  // 寬畫面（≥ 576px）時倍率按鈕和頁面還用 inline 內距時量到的相同（同一個本機 Chromium 環境，速度 1、1x 亮起）
  const SPEED_WIDE = {
    "1x": {
      w: 31.703125,
      font: ["12.8px", "700", "0.64px"],
      border: ["0px", "none"],
    },
    "2x": {
      w: 32.703125,
      font: ["12.8px", "700", "0.64px"],
      border: ["1px", "solid", "rgba(255, 255, 255, 0.18)"],
    },
  };
  for (const [label, viewport] of NARROW_SIZES)
    for (const mode of ["guest", "shared"])
      for (const phase of ["PREP", "BATTLE"]) {
        if (mode === "shared" && label !== "360×600" && label !== "390×844")
          continue;
        const tag = `${label} ${mode === "guest" ? "訪客" : "共用帳號"} ${phase === "PREP" ? "備戰" : "戰鬥中"}`;
        const narrow = viewport.width <= 575;
        const sizeKey = label.replace("×", "x");
        await scenario(
          `窄畫面 HUD：${tag}：八顆按鈕整顆在視窗內、文字不裁切、不交疊；正常 Tab 不捲動；選單與遮罩層次不變`,
          async (mk) => {
            const { E, p } = await maskEnter(
              mk,
              mode,
              viewport,
              `k_hud_${sizeKey}_${phase}`
            );
            if (phase === "BATTLE")
              check("按進入戰場開第 1 波", await startBattle(p));
            await sleep(300);
            const H = await narrowHud(p);
            check(
              `${tag}：操作列 top 44、高 40（底 84），八顆按鈕的文字與停用照原樣`,
              Math.abs(H.bar.y - 44) < 0.01 &&
                Math.abs(H.bar.h - 40) < 0.01 &&
                sameJson(
                  H.rows.map((r) => r.text),
                  NARROW_LABELS[phase]
                ),
              {
                bar: H.bar,
                labels: H.rows.map((r) => [r.text, r.disabled]),
              }
            );
            check(
              `${tag}：八顆按鈕整顆在視窗內、寬至少 24、高 30，逐字都在按鈕內沒有裁切，內部 3×3 點都點得到按鈕本身，彼此沒有交疊`,
              narrowFits(H),
              { rows: narrowRows(H), overlaps: H.overlaps }
            );
            const want = narrow
              ? {
                  barPad: ["3px", "3px"],
                  groupGap: "3px",
                  groupPad: ["3px", "3px"],
                  btnPad: ["4px", "4px"],
                  btnFont: "12px",
                  btnMinW: "24px",
                  btnH: "30px",
                }
              : {
                  barPad: ["6px", "6px"],
                  groupGap: "5px",
                  groupPad: ["0px", "0px"],
                  btnPad: ["11px", "11px"],
                  btnFont: "12.8px",
                  btnMinW: "auto",
                  btnH: "30px",
                };
            check(
              `${tag}：computed 樣式是${narrow ? "窄畫面（< 576px）" : "原本（≥ 576px）"}的內距、間距、字級與最小寬`,
              sameJson(H.style, want),
              { style: H.style, want }
            );
            // 倍率按鈕：內距由 CSS Module 決定（窄畫面 4px、寬畫面 8px），寬畫面時和改頁面前量到的寬、字型、邊框相同
            await p.mouse.move(2, viewport.height - 2);
            const sp = await narrowSpeed(p);
            check(
              `${tag}：倍率按鈕 1x／2x：computed 左右內距 ${narrow ? "4px（窄畫面）" : "8px（原本）"}、字級 ${narrow ? "12px" : "12.8px"}、高 30、寬至少 24${narrow ? "" : "；寬、字型與左邊框和頁面還用 inline 內距時量到的相同"}`,
              sp.length === 2 &&
                sp.every(
                  (b) =>
                    sameJson(
                      b.padding,
                      narrow
                        ? ["4px", "4px", "0px", "0px"]
                        : ["8px", "8px", "0px", "0px"]
                    ) &&
                    b.font[0] === (narrow ? "12px" : "12.8px") &&
                    b.height === "30px" &&
                    Math.abs(b.h - 30) < 0.01 &&
                    b.w >= 24 - 0.01 &&
                    (narrow ||
                      (Math.abs(b.w - SPEED_WIDE[b.text].w) < 0.001 &&
                        sameJson(b.font, SPEED_WIDE[b.text].font) &&
                        sameJson(
                          b.borderLeft.slice(
                            0,
                            SPEED_WIDE[b.text].border.length
                          ),
                          SPEED_WIDE[b.text].border
                        )))
                ),
              { sp, wide: narrow ? null : SPEED_WIDE }
            );
            check(
              `${tag}：一開始 HUD 到 document 的每一層與 window 都沒有橫向捲動`,
              narrowNoScroll(H),
              { scrolled: H.scrolled, doc: H.docScroll }
            );
            // 滑鼠移到每顆可用按鈕上（hover）：矩形與文字不變
            const hov = [];
            for (const r of H.rows.filter((x) => !x.disabled)) {
              await p.mouse.move(
                r.rect.x + r.rect.w / 2,
                r.rect.y + r.rect.h / 2
              );
              await sleep(200);
              const H2 = await narrowHud(p);
              const r2 = H2.rows.find((x) => x.text === r.text);
              hov.push({
                text: r.text,
                same:
                  !!r2 &&
                  Math.abs(r2.rect.x - r.rect.x) < 0.5 &&
                  Math.abs(r2.rect.w - r.rect.w) < 0.5 &&
                  r2.fullyIn &&
                  r2.notClipped,
              });
            }
            await p.mouse.move(2, viewport.height - 2);
            check(
              `${tag}：滑鼠移到每顆可用按鈕上，矩形與文字不變、仍整顆在視窗內`,
              hov.length > 0 && hov.every((h) => h.same),
              hov
            );
            // 正常 Tab 走過 HUD：每一步都沒有任何一層橫向捲動，可用的按鈕都走到、停用的走不到
            const st0 = await narrowState(p, E);
            const steps = await narrowTab(p);
            const st1 = await narrowState(p, E);
            const hudSteps = steps.filter((s) => s.inBar);
            const enabled = H.rows
              .filter((r) => !r.disabled)
              .map((r) => r.text);
            check(
              `${tag}：正常 Tab 走過 HUD：每一步 HUD 到 document 的每一層與 window 都沒有橫向捲動，可用的按鈕都走到且整顆在視窗內、停用的走不到`,
              steps.every(
                (s) => s.scrolled.length === 0 && s.doc.every((v) => v === 0)
              ) &&
                sameJson(
                  hudSteps.map((s) => s.text),
                  enabled
                ) &&
                hudSteps.every((s) => s.fullyIn && !s.disabled),
              { steps, enabled }
            );
            check(
              `${tag}：只按 Tab 沒有改變這一場、金幣與塔、武將、選單、寫入與金鑰`,
              sameJson(st1, st0),
              { st0, st1 }
            );
            if (
              mode === "guest" &&
              (label === "360×600" ||
                label === "576×600" ||
                label === "1280×800")
            ) {
              // 倍率切換：滑鼠點 2x，再用鍵盤 Shift+Tab 回到 1x 按 Enter；引擎的速度設定、亮起的按鈕與尺寸跟著變，其他狀態不變
              const before = await narrowState(p, E);
              const two = H.rows.find((r) => r.text === "2x");
              if (two)
                await p.mouse.click(
                  two.rect.x + two.rect.w / 2,
                  two.rect.y + two.rect.h / 2
                );
              await until(async () => (await ctl(p)).speed === 2, 3000);
              const s2 = await ctl(p);
              const sp2 = await narrowSpeed(p);
              const H2 = await narrowHud(p);
              let k = -1;
              for (let i = 1; i <= 5; i++) {
                await p.keyboard.press("Shift+Tab");
                const t = await p.evaluate(
                  () =>
                    (document.activeElement &&
                      document.activeElement.innerText) ||
                    ""
                );
                if (t.trim() === "1x") {
                  k = i;
                  break;
                }
              }
              if (k > 0) await p.keyboard.press("Enter");
              await until(async () => (await ctl(p)).speed === 1, 3000);
              const sp3 = await narrowSpeed(p);
              const H3 = await narrowHud(p);
              const after = await narrowState(p, E);
              const lit = (sp) =>
                sp
                  .filter((b) => b.active)
                  .map((b) => b.text)
                  .join(",");
              check(
                `${tag}：滑鼠點 2x、再用鍵盤 Shift+Tab／Enter 切回 1x：引擎的速度設定與亮起的按鈕跟著變，倍率按鈕內距不變，八顆按鈕仍整顆在視窗內不交疊；金幣、塔、武將、場次、寫入與金鑰不變`,
                !!two &&
                  s2.speed === 2 &&
                  lit(sp2) === "2x" &&
                  k > 0 &&
                  lit(sp3) === "1x" &&
                  sp2.every((b) => b.padding[0] === (narrow ? "4px" : "8px")) &&
                  sp3.every((b) => b.padding[0] === (narrow ? "4px" : "8px")) &&
                  narrowFits(H2) &&
                  narrowFits(H3) &&
                  sameJson(after, before),
                {
                  s2,
                  lit2: lit(sp2),
                  k,
                  lit3: lit(sp3),
                  before,
                  after,
                  rows2: narrowRows(H2),
                }
              );
            }
            // 部署選單（13 位武將）：HUD 位置不變、在遮罩之上，選單各部位不被蓋、高度上限照舊，遮罩其餘區擋畫布
            const o = await openMaskMenu(p, ROAD_CELLS, true);
            const L = o.L;
            const Hm = await narrowHud(p);
            const cap = L
              ? Math.min(0.8 * viewport.height, L.overlayRect.h - 168)
              : null;
            check(
              `${tag}：打開道路部署選單：HUD 仍是 top 44、高 40，在遮罩之上；選單標題、×、分頁與可見卡片不被 HUD 蓋；高度不超過 min(80vh, 遮罩高 − 168)；遮罩取樣沒有一點是畫布`,
              !!L &&
                Math.abs(Hm.bar.y - 44) < 0.01 &&
                Math.abs(Hm.bar.h - 40) < 0.01 &&
                hudInViewOnTop(L) &&
                menuPartsClear(L) &&
                visibleCardsClear(L) &&
                L.menuRect.h <= cap + 0.5 &&
                L.maskProbe.canvas === 0 &&
                narrowFits(Hm),
              {
                tried: o.tried,
                menuRect: L && L.menuRect,
                cap,
                parts: L && {
                  title: L.title,
                  close: L.close,
                  overlaps: L.overlaps,
                },
                probe: L && L.maskProbe,
                hud: L && L.hud.map((b) => [b.text, b.inView, b.onTop]),
              }
            );
            if (
              L &&
              phase === "BATTLE" &&
              mode === "guest" &&
              (label === "360×600" || label === "575×600")
            ) {
              // 選單開著：滑鼠暫停（看「▶ 繼續」）→ 繼續 → 鍵盤到最後一張 → 滑鼠派出可見的一張
              const s0 = await ctl(p);
              const pause = Hm.rows.find((r) => /⏸ 暫停/.test(r.text));
              if (pause)
                await p.mouse.click(
                  pause.rect.x + pause.rect.w / 2,
                  pause.rect.y + pause.rect.h / 2
                );
              await until(async () => (await ctl(p)).paused, 3000);
              const Hp = await narrowHud(p);
              const resume = Hp.rows.find((r) => /▶ 繼續/.test(r.text));
              check(
                `${tag}：選單開著時滑鼠點暫停：「▶ 繼續」整顆在視窗內、不裁切，八顆仍不交疊，同一個選單`,
                !!pause &&
                  !!resume &&
                  Hp.rows.length === 8 &&
                  Hp.rows.every((r) => r.fullyIn && r.notClipped) &&
                  Hp.overlaps.length === 0 &&
                  (await ctl(p)).menuId === s0.menuId,
                { rows: narrowRows(Hp) }
              );
              if (resume)
                await p.mouse.click(
                  resume.rect.x + resume.rect.w / 2,
                  resume.rect.y + resume.rect.h / 2
                );
              await until(async () => !(await ctl(p)).paused, 3000);
              const s1 = await ctl(p);
              const t = await tabToLastCard(p);
              const last = t.L && t.L.cards[t.L.cards.length - 1];
              check(
                `${tag}：繼續後同一個選單、慢速 0.1；正常 Tab 到最後一張卡片時它整張可見、點得到`,
                !s1.paused &&
                  s1.menuId === s0.menuId &&
                  Math.abs(s1.scale - 0.1) < 1e-9 &&
                  t.steps > 0 &&
                  lastCardOk(t.L),
                { s1, steps: t.steps, last }
              );
              const L5 = await maskLayout(p);
              const card = L5.cards.find(
                (c) => c.visibleArea > 0 && !c.disabled && c.onTop
              );
              const h0 = (await ctl(p)).heroes;
              if (card) await p.mouse.click(card.center[0], card.center[1]);
              const closed = await until(
                async () => !(await menuShown(p)),
                5000
              );
              check(
                `${tag}：滑鼠點一張可見的武將卡：派出成功、選單關閉`,
                !!card && !!closed && (await ctl(p)).heroes === h0 + 1,
                { card, h0 }
              );
            } else if (L) {
              await closeMenuX(p);
              check(
                `${tag}：按選單 × 取消：選單關閉`,
                !!(await until(async () => !(await menuShown(p)), 3000))
              );
            }
            if (label === "360×600" && mode === "guest" && phase === "PREP") {
              // 設定視窗、聊天視窗開著時背景 HUD 不穿透
              await p.locator("button", { hasText: "⚙️" }).first().click();
              const shown = await until(
                async () => (await p.locator(".modal.show").count()) > 0,
                5000
              );
              await sleep(400);
              const rows = await hudUnder(p, ".modal.show");
              check(
                `${tag}：設定視窗開著：背景 HUD 按鈕中心都被視窗蓋住`,
                !!shown && noHudPierce(rows),
                rows
              );
              await p.keyboard.press("Escape");
              check(
                `${tag}：設定視窗用 Escape 關掉`,
                !!(await until(
                  async () => (await p.locator(".modal").count()) === 0,
                  5000
                ))
              );
              await shot(p, `narrow-${sizeKey}-prep`);
            }
            if (label === "360×600" && mode === "guest" && phase === "BATTLE") {
              // 結算畫面開著時背景 HUD 不穿透
              await endWith(p, { win: false });
              const res = await until(
                async () =>
                  (await p.locator('[class*="resultOverlay"]').count()) > 0,
                5000
              );
              await sleep(500);
              const rowsR = await hudUnder(p, '[class*="resultOverlay"]');
              check(
                `${tag}：結算畫面開著：落在結算畫面上的 HUD 按鈕中心都被蓋住`,
                !!res && noHudPierce(rowsR),
                rowsR
              );
            }
            if (mode === "guest")
              check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
            else
              check(
                "共用帳號：沒有任何寫入請求",
                E.gas.writes().length === 0,
                E.gas.writes()
              );
            return E;
          }
        );
      }
  await scenario(
    "窄畫面 HUD：360×600 沒有金鑰：金鑰視窗開著時背景 HUD 不穿透",
    async (mk) => {
      const E = await mk({
        maps: TOWER_MAPS,
        enemies: TOWER_ENEMIES,
        viewport: { width: 360, height: 600 },
      });
      const p = await E.page({ storage: {} });
      const shown = await until(
        async () => (await p.locator('[data-testid="key-setup"]').count()) > 0,
        20000
      );
      await sleep(400);
      const rows = await hudUnder(p, '[data-testid="key-setup"]');
      check(
        `360×600 金鑰視窗開著：落在金鑰視窗上的 HUD 按鈕中心都被蓋住${rows && rows.filter((r) => r.inView && r.inDlg).length === 0 ? "（HUD 沒有在金鑰視窗範圍內，另列）" : ""}`,
        !!shown &&
          (!rows ||
            rows.filter((r) => r.inView && r.inDlg).every((r) => !r.hud)),
        { shown, rows }
      );
      check("沒有任何寫入請求", E.gas.writes().length === 0, E.gas.writes());
      return E;
    }
  );

  // ═══ 35. 同一場的動態隊伍同步：同一個帳號改隊伍、升級或手動同步讀回時，場上武將原地更新或離場，不重開整場 ═══
  // 留在隊伍裡的武將是原本的實例（生命照舊比例換算，等級、攻擊、防禦照新資料）；不在隊伍裡的離場（格子、部署名單、資訊視窗、敵人的阻擋都清掉，
  // 之後同一場可以再派）。battleId、波次、塔、戰場金幣、城防、倍率、自動、暫停、部署選單編號與這一場的首擊紀錄都不變。
  // 來源不是這一場的帳號（換帳號、同一把金鑰重新登入、登入失敗之後）或資料不能用（較舊的讀取、不支援的隊伍、唯讀）時不同步，也不清空場上。
  // 清波、結束、另一台裝置改存檔、生命調值都是受控的，不是自然實戰
  const HOLD_MAPS35 = SKILL_MAPS.map((m) => ({ ...m, waves: [DUMMY_WAVE(1)] }));
  /** 這一場與場上武將的快照 */
  const field35 = (p) =>
    p.evaluate(() => {
      const e = window.__testBridge.engine;
      const b = e.battleManager;
      const fs = b.firstStrikeUsed;
      return {
        battleId: b.battleId,
        state: b.gameState,
        wave: b.currentWave,
        paused: b.manualPaused,
        speed: b.speedPref,
        auto: b.autoMode,
        menuId: b.deployMenuId,
        gold: b.battleGold,
        baseHp: b.baseHp,
        firstStrike: fs instanceof Map ? [...fs.entries()] : null,
        towers: e.towers.map((t) => [
          t.towerTypeKey,
          t.__mark || null,
          t.gridCell.col,
          t.gridCell.row,
        ]),
        heroes: e.heroes.map((h) => ({
          id: h.heroId,
          mark: h.__mark || null,
          dead: h.isDead,
          lv: h.heroLevel,
          atk: h.atk,
          def: h.defStat,
          hp: h.currentHp,
          max: h.maxHp,
          cell: [h.gridCell.col, h.gridCell.row],
          occ: e.gameMap.getOccupant(h.gridCell.col, h.gridCell.row) === h,
        })),
      };
    });
  const hero35 = (s, id) => s.heroes.find((h) => h.id === id) || null;
  /** 同步前後要相同的部分 */
  const keep35 = (s) => ({
    battleId: s.battleId,
    state: s.state,
    wave: s.wave,
    paused: s.paused,
    speed: s.speed,
    auto: s.auto,
    menuId: s.menuId,
    gold: s.gold,
    baseHp: s.baseHp,
    firstStrike: s.firstStrike,
    towers: s.towers,
  });
  const occupant35 = (p, [c, r]) =>
    p.evaluate(
      ({ c, r }) => {
        const o = window.__testBridge.engine.gameMap.getOccupant(c, r);
        return o ? (o.isHero ? `hero:${o.heroId}` : "tower") : null;
      },
      { c, r }
    );
  /** 活著的敵人：是否被這位武將擋住、是否在戰鬥、位置 */
  const enemies35 = (p, heroId) =>
    p.evaluate(
      (hid) =>
        window.__testBridge.engine.waveManager.activeEnemies
          .filter((en) => !en.isDead)
          .map((en) => ({
            blocked: !!en.blocker && en.blocker.heroId === hid,
            blocker: en.blocker ? en.blocker.heroId : null,
            fighting: en.isFighting,
            x: en.x,
          })),
      heroId
    );
  /** 武將視窗升級一位武將（名冊選這位 → 按升級），等名冊上的等級變成 lv */
  async function upgrade35(p, name, lv) {
    await openRoster(p);
    await pickRosterHero(p, name);
    await p.locator('[data-testid="hero-upgrade"]').click();
    const ok = await until(
      async () =>
        new RegExp(`Lv\\.${lv}(?!\\d)`).test((await rosterCard(p, name)) || ""),
      8000
    );
    await closeModal(p);
    return !!ok;
  }
  /** 隊伍視窗：移出席位上的武將、加入池子裡的武將，再保存（keyboard：用鍵盤打開視窗與按保存） */
  async function editTeam35(p, { remove = [], add = [], keyboard = false }) {
    if (keyboard) {
      await p.locator("button", { hasText: /^隊伍$/ }).focus();
      await p.keyboard.press("Enter");
      await until(() => modal(p).isVisible(), 10000);
    } else await openTeam(p);
    for (const name of remove) {
      const slot = modal(p).locator('[class*="teamSlotFilled"]', {
        hasText: name,
      });
      if ((await slot.count()) === 0)
        return { ok: false, step: `remove:${name}` };
      await slot.first().locator('button[title="移出隊伍"]').click();
    }
    for (const name of add)
      if (!(await pickTeamHero(p, name)))
        return { ok: false, step: `add:${name}` };
    const save = p.locator('[data-testid="team-edit-save"]');
    if (keyboard) {
      await save.focus();
      await p.keyboard.press("Enter");
    } else await save.click();
    const closed = await until(
      async () => (await modal(p).count()) === 0,
      10000
    );
    return { ok: !!closed, step: closed ? "saved" : "still-open" };
  }
  /** 主公資訊的「手動同步」：按下後等 until 成立（或逾時），關掉視窗 */
  async function sync35(p, done) {
    await openInfo(p);
    await p.locator('[data-testid="player-info-sync-btn"]').click();
    const ok = await until(done, 10000);
    await closeModal(p);
    return ok;
  }
  const MA35 = {
    hero_id: "hero_ma_chao",
    level: 2,
    star: 1,
    atk: 115,
    def: 58,
    hp: 1120,
  };
  const ZY35 = {
    hero_id: "hero_zhao_yun",
    level: 1,
    star: 1,
    atk: 110,
    def: 65,
    hp: 1150,
  };
  const ZHOU35 = {
    hero_id: "hero_zhou_yu",
    level: 1,
    star: 1,
    atk: 105,
    def: 55,
    hp: 1080,
  };

  await scenario(
    "動態隊伍同步：訪客第 0 波備戰已放武將與塔，升級與增減隊伍都同步到場上、不重開整場（1280，滑鼠）",
    async (mk) => {
      const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
      const p = await E.page({
        storage: guestStorage(
          [MA35, ZY35, ZHOU35],
          [
            { slot: 0, hero_id: "hero_ma_chao" },
            { slot: 1, hero_id: "hero_zhao_yun" },
          ]
        ),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      const d2 = await deployHero(p, ROAD_CELLS[4], "趙雲");
      const t1 = await buildTower(p, BUILD_CELL, "弓兵塔");
      check(
        "第 0 波備戰：部署馬超、趙雲並建弓兵塔，標記實例",
        d1.ok && d2.ok && t1.ok && (await markField(p)) === 3,
        { d1, d2, t1 }
      );
      // 受控：馬超的生命調成 560／1120（一半），驗證升級時照舊比例換算、不補滿
      await p.evaluate(() => {
        const h = window.__testBridge.engine.heroes.find(
          (x) => x.heroId === "hero_ma_chao"
        );
        h.currentHp = 560;
      });
      const info1 = await openHeroInfo(p, ROAD_CELLS[2]);
      const s0 = await field35(p);
      check(
        "資訊視窗顯示馬超 Lv.2、攻擊 115、生命 560/1120",
        !!info1 &&
          /Lv\.2(?!\d)/.test(info1) &&
          /115/.test(info1) &&
          /560\/1120/.test(info1) &&
          s0.wave === 0 &&
          s0.state === 1,
        { info1, s0 }
      );
      const up = await upgrade35(p, "馬超", 3);
      await sleep(600);
      const s1 = await field35(p);
      const m1 = hero35(s1, "hero_ma_chao");
      check(
        "升級馬超（Lv.2 → Lv.3）：同一個 battleId、原本的實例，等級 3、攻擊 130、防禦 66、最大生命 1240、生命照舊比例 620（不補滿）；塔、金幣、波次、暫停、倍率、選單編號不變",
        up &&
          sameJson(keep35(s1), keep35(s0)) &&
          !!m1 &&
          m1.mark === "hero:hero_ma_chao" &&
          m1.lv === 3 &&
          m1.atk === 130 &&
          m1.def === 66 &&
          m1.max === 1240 &&
          m1.hp === 620 &&
          m1.dead === false &&
          m1.occ === true,
        { up, s0, s1 }
      );
      const info2 = await heroInfoText(p);
      check(
        "資訊視窗仍開著同一位馬超，數值換成 Lv.3、攻擊 130、防禦 66、生命 620/1240",
        !!info2 &&
          /Lv\.3(?!\d)/.test(info2) &&
          /130/.test(info2) &&
          /66/.test(info2) &&
          /620\/1240/.test(info2),
        info2
      );
      // 關掉武將資訊（面板蓋在畫布上，之後要點道路格）
      await p
        .locator(HERO_INFO)
        .locator("button", { hasText: "×" })
        .first()
        .click()
        .catch(() => {});
      await until(async () => (await p.locator(HERO_INFO).count()) === 0, 5000);
      const ed = await editTeam35(p, { remove: ["趙雲"], add: ["周瑜"] });
      await sleep(600);
      const s2 = await field35(p);
      check(
        "隊伍移出趙雲、加入周瑜並保存：同一場，趙雲離場（格子空出來），馬超是原本的實例且數值不變；塔、金幣、波次不變",
        ed.ok &&
          sameJson(keep35(s2), keep35(s0)) &&
          sameJson(
            s2.heroes.map((h) => [h.id, h.mark]),
            [["hero_ma_chao", "hero:hero_ma_chao"]]
          ) &&
          sameJson(hero35(s2, "hero_ma_chao"), m1) &&
          (await occupant35(p, ROAD_CELLS[4])) === null,
        { ed, s2 }
      );
      const cz = await menuCard(p, ROAD_CELLS[4], "周瑜");
      const cy = await menuCard(p, ROAD_CELLS[4], "趙雲");
      const cm = await menuCard(p, ROAD_CELLS[4], "馬超");
      check(
        "部署選單：周瑜可以點，趙雲已不在隊伍裡（沒有卡片），馬超仍「已在場上」",
        cz.ok &&
          !cz.disabled &&
          !cy.ok &&
          cy.step === "card" &&
          cm.ok &&
          cm.disabled,
        { cz, cy, cm }
      );
      const d3 = await deployHero(p, ROAD_CELLS[4], "周瑜");
      check(
        "周瑜部署到趙雲空出來的格子",
        d3.ok && (await occupant35(p, ROAD_CELLS[4])) === "hero:hero_zhou_yu",
        d3
      );
      const ed2 = await editTeam35(p, { add: ["趙雲"] });
      await sleep(400);
      const d4 = await deployHero(p, ROAD_CELLS[6], "趙雲");
      const s3 = await field35(p);
      const z3 = hero35(s3, "hero_zhao_yun");
      check(
        "趙雲加回隊伍後同一場可以再派（新的實例），battleId、塔、金幣、波次不變",
        ed2.ok &&
          d4.ok &&
          sameJson(keep35(s3), keep35(s0)) &&
          !!z3 &&
          z3.mark === null &&
          z3.occ === true,
        { ed2, d4, s3 }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "動態隊伍同步：訪客清波後的備戰（第 1 波之後）暫停中升級與移出，暫停維持、同一場延續，之後照常進第 2 波",
    async (mk) => {
      const E = await mk({
        maps: TWO_WAVE_MAPS,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({
        storage: guestStorage(
          [MA35, ZY35],
          [
            { slot: 0, hero_id: "hero_ma_chao" },
            { slot: 1, hero_id: "hero_zhao_yun" },
          ]
        ),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[0], "馬超");
      const d2 = await deployHero(p, ROAD_CELLS[13], "趙雲");
      check(
        "部署馬超（第 3 列）與趙雲（第 6 列）並標記",
        d1.ok && d2.ok && (await markField(p)) === 2,
        { d1, d2 }
      );
      check("按進入戰場開第 1 波", await startBattle(p));
      check("馬超打到木樁、首擊紀錄寫下", await waitFirstStrike(p));
      await forceWaveClear(p);
      await sleep(1200);
      check("清波後回到備戰（受控）", (await bm(p, "state")) === 1);
      check("備戰中按暫停", await pauseHud(p));
      const s0 = await field35(p);
      const m0 = hero35(s0, "hero_ma_chao");
      const up = await upgrade35(p, "馬超", 3);
      await sleep(600);
      const s1 = await field35(p);
      const m1 = hero35(s1, "hero_ma_chao");
      check(
        "暫停中升級馬超：同步到原本的實例（Lv.3、攻擊 130、防禦 66、最大生命 1240、生命照舊比例），暫停維持，同一場、波次 1、首擊紀錄不變",
        up &&
          s0.wave === 1 &&
          s0.paused === true &&
          sameJson(keep35(s1), keep35(s0)) &&
          !!m1 &&
          m1.mark === "hero:hero_ma_chao" &&
          m1.lv === 3 &&
          m1.atk === 130 &&
          m1.def === 66 &&
          m1.max === 1240 &&
          Math.abs(m1.hp - (m0.hp / m0.max) * 1240) < 1e-6,
        { s0, s1 }
      );
      const ed = await editTeam35(p, { remove: ["趙雲"] });
      await sleep(600);
      const s2 = await field35(p);
      check(
        "暫停中移出趙雲：趙雲離場、格子空出來，暫停維持，馬超與這一場其他狀態不變",
        ed.ok &&
          sameJson(keep35(s2), keep35(s0)) &&
          sameJson(
            s2.heroes.map((h) => [h.id, h.mark]),
            [["hero_ma_chao", "hero:hero_ma_chao"]]
          ) &&
          (await occupant35(p, ROAD_CELLS[13])) === null,
        { ed, s2 }
      );
      check("按繼續", await resumeHud(p));
      await p.locator('[data-testid="hud-start-battle"]').click();
      const ok2 = await until(async () => (await bm(p, "state")) === 2, 5000);
      await sleep(800);
      const s3 = await field35(p);
      check(
        "照常進第 2 波：同一個 battleId、波次 2、馬超仍是原本的實例",
        !!ok2 &&
          s3.battleId === s0.battleId &&
          s3.wave === 2 &&
          s3.heroes.length === 1 &&
          s3.heroes[0].mark === "hero:hero_ma_chao",
        s3
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "動態隊伍同步：訪客戰鬥中暫停，移出正在擋敵人的馬超：敵人放開、資訊視窗關閉、可以再派（390×600，鍵盤）",
    async (mk) => {
      const E = await mk({
        viewport: { width: 390, height: 600 },
        maps: HOLD_MAPS35,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({
        storage: guestStorage(
          [MA35, ZY35],
          [
            { slot: 0, hero_id: "hero_ma_chao" },
            { slot: 1, hero_id: "hero_zhao_yun" },
          ]
        ),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("部署馬超並標記", d1.ok && (await markField(p)) === 1, d1);
      check("按進入戰場開戰", await startBattle(p));
      const blocked = await until(async () => {
        const en = await enemies35(p, "hero_ma_chao");
        return en.some((x) => x.blocked) ? en : null;
      }, 20000);
      check(
        "木樁被馬超擋住、首擊紀錄寫下",
        !!blocked && (await waitFirstStrike(p)),
        blocked
      );
      const info = await openHeroInfo(p, ROAD_CELLS[2]);
      check("打開馬超的資訊視窗", !!info && /馬超/.test(info), info);
      const pb = p.locator("button", { hasText: "⏸ 暫停" }).first();
      await pb.focus();
      await p.keyboard.press("Enter");
      check(
        "用鍵盤按暫停",
        await until(
          async () =>
            (await p.locator("button", { hasText: "▶ 繼續" }).count()) > 0,
          5000
        )
      );
      const s0 = await field35(p);
      const ed = await editTeam35(p, { remove: ["馬超"], keyboard: true });
      await sleep(600);
      const s1 = await field35(p);
      const en1 = await enemies35(p, "hero_ma_chao");
      check(
        "暫停中移出馬超（鍵盤打開隊伍視窗與保存）：馬超離場、格子空出來；同一個 battleId、仍是戰鬥中、暫停維持、首擊紀錄不變",
        ed.ok &&
          s1.heroes.length === 0 &&
          (await occupant35(p, ROAD_CELLS[2])) === null &&
          sameJson(keep35(s1), keep35(s0)) &&
          s1.state === 2 &&
          s1.paused === true,
        { ed, s0, s1 }
      );
      check(
        "擋住的木樁立即放開（沒有阻擋者、不在戰鬥），不等暫停結束",
        en1.length > 0 && en1.every((x) => x.blocker === null && !x.fighting),
        en1
      );
      check(
        "顯示的正是離場的馬超：資訊視窗關閉",
        (await p.locator(HERO_INFO).count()) === 0
      );
      const rb = p.locator("button", { hasText: "▶ 繼續" }).first();
      await rb.focus();
      await p.keyboard.press("Enter");
      await until(
        async () =>
          (await p.locator("button", { hasText: "⏸ 暫停" }).count()) > 0,
        5000
      );
      await sleep(1500);
      const en2 = await enemies35(p, "hero_ma_chao");
      check(
        "繼續後木樁往前走（x 變大），不再被已離場的馬超擋住",
        en2.length > 0 && en1.length > 0 && en2[0].x > en1[0].x,
        { en1, en2 }
      );
      const ed2 = await editTeam35(p, { add: ["馬超"] });
      await sleep(400);
      const d2 = await deployHero(p, ROAD_CELLS[8], "馬超");
      const s2 = await field35(p);
      check(
        "馬超加回隊伍後同一場再派（新的實例）：首擊紀錄仍是這一場已用過的那一筆",
        ed2.ok &&
          d2.ok &&
          s2.battleId === s0.battleId &&
          s2.heroes.length === 1 &&
          s2.heroes[0].mark === null &&
          sameJson(s2.firstStrike, s0.firstStrike) &&
          !!s0.firstStrike &&
          s0.firstStrike.length === 1,
        { ed2, d2, s2 }
      );
      check("訪客：沒有任何存檔請求", E.gas.players().length === 0);
      return E;
    }
  );

  await scenario(
    "動態隊伍同步：共用帳號出征後改隊伍與升級被拒（沒有寫入、場上不變）；手動同步讀回另一台裝置較新的存檔才同步，固定的結算照原本送一次",
    async (mk) => {
      const data = NEW({
        capacity: 20,
        heroes: [
          {
            hero_id: "ma_chao",
            level: 2,
            star: 0,
            atk: 140,
            def: 65,
            hp: 1400,
          },
        ],
        team: [
          { hero_id: "ma_chao", slot: 1 },
          { hero_id: "zhao_yun", slot: 2 },
        ],
      });
      const E = await mk({
        seed: [{ key: "k_sync35", data, rev: 7 }],
        maps: HOLD_MAPS35,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: { shenma_player_key: "k_sync35" } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("部署馬超並標記", d1.ok && (await markField(p)) === 1, d1);
      check("按進入戰場開戰（這一場固定）", await startBattle(p));
      check("戰鬥中按暫停", await pauseHud(p));
      const s0 = await field35(p);
      await openTeam(p);
      const blocked = await text(p, '[data-testid="team-edit-blocked"]');
      const saveOff = await isDisabled(p, '[data-testid="team-edit-save"]');
      await closeModal(p);
      await openRoster(p);
      await pickRosterHero(p, "馬超");
      const upOff = await isDisabled(p, '[data-testid="hero-upgrade"]');
      if (upOff === false)
        await p.locator('[data-testid="hero-upgrade"]').click();
      await sleep(800);
      await closeModal(p);
      const s1 = await field35(p);
      check(
        "出征中：隊伍視窗說明結算前不能修改、儲存鈕停用；升級沒有送出；沒有任何寫入、場上不變",
        /出征中/.test(blocked || "") &&
          saveOff === true &&
          E.gas.writes().length === 0 &&
          sameJson(s1, s0),
        { blocked, saveOff, upOff, writes: E.gas.writes(), s0, s1 }
      );
      // 另一台裝置把馬超升到 Lv.3（受控：直接改模擬後端的存檔，版本 9）
      E.fx.seed(
        "k_sync35",
        {
          ...data,
          heroes: [
            {
              hero_id: "ma_chao",
              level: 3,
              star: 0,
              atk: 150,
              def: 70,
              hp: 1500,
            },
          ],
        },
        9
      );
      const synced = await sync35(p, async () => {
        const s = await field35(p);
        const m = hero35(s, "hero_ma_chao");
        return m && m.lv === 3 ? s : null;
      });
      const s2 = await field35(p);
      const m0 = hero35(s0, "hero_ma_chao");
      const m2 = hero35(s2, "hero_ma_chao");
      check(
        "手動同步讀回較新的同帳號存檔（已確認、同一個世代）：原本的馬超實例同步成 Lv.3、攻擊 150、防禦 70、最大生命 1500、生命照舊比例；這一場其他狀態不變",
        !!synced &&
          sameJson(keep35(s2), keep35(s0)) &&
          !!m2 &&
          m2.mark === "hero:hero_ma_chao" &&
          m2.lv === 3 &&
          m2.atk === 150 &&
          m2.def === 70 &&
          m2.max === 1500 &&
          Math.abs(m2.hp - (m0.hp / m0.max) * 1500) < 1e-6,
        { s0, s2 }
      );
      await openTeam(p);
      const blocked2 = await text(p, '[data-testid="team-edit-blocked"]');
      await closeModal(p);
      check(
        "同步後仍是出征中（固定沒有解除）、沒有寫入",
        /出征中/.test(blocked2 || "") && E.gas.writes().length === 0,
        blocked2
      );
      check("受控結束（勝利）", (await endWith(p, {})) === "ok");
      const shown = await until(
        () =>
          p
            .locator(
              '[data-testid="result-settle-confirmed"], [data-testid="result-settle-pending"], [data-testid="result-not-saved"], [data-testid="result-settle-review"]'
            )
            .first()
            .isVisible(),
        10000
      );
      await sleep(3000);
      const sv = E.gas.log.filter((e) => e.action === "save_result");
      check(
        "save_result 只送一次：用出征時固定的 base_rev 7、契約 2（不換成讀回的版本 9、不自動重送）",
        !!shown &&
          sv.length === 1 &&
          sv[0].payload.base_rev === 7 &&
          sv[0].payload.settle_contract === 2 &&
          typeof sv[0].payload.request_id === "string",
        sv.map((e) => ({
          payload: e.payload,
          status: e.status,
          error: e.error,
        }))
      );
      note("版本衝突後的結算畫面", {
        confirmed: await p
          .locator('[data-testid="result-settle-confirmed"]')
          .count(),
        pendingView: await p
          .locator('[data-testid="result-settle-pending"]')
          .count(),
        notSaved: await p.locator('[data-testid="result-not-saved"]').count(),
        retry: await p.locator('[data-testid="result-settle-retry"]').count(),
        review: await p.locator('[data-testid="result-settle-review"]').count(),
        pending: await pendingKeys(p),
        response: sv.map((e) => [e.status, e.error]),
      });
      return E;
    }
  );

  await scenario(
    "動態隊伍同步：來源不是這一場的帳號或資料不能用時不同步、不清空場上（較舊的讀取、不支援的隊伍、唯讀、換帳號、同金鑰重新登入、登入失敗）",
    async (mk) => {
      const A = "k_sync35_a";
      const B = "k_sync35_b";
      const dataA = NEW({
        nickname: "甲",
        capacity: 20,
        heroes: [
          {
            hero_id: "ma_chao",
            level: 2,
            star: 0,
            atk: 140,
            def: 65,
            hp: 1400,
          },
        ],
        team: [
          { hero_id: "ma_chao", slot: 1 },
          { hero_id: "zhao_yun", slot: 2 },
        ],
      });
      const maLv = (level) => ({
        ...dataA,
        heroes: [
          {
            hero_id: "ma_chao",
            level,
            star: 0,
            atk: 140 + level,
            def: 65,
            hp: 1400,
          },
        ],
      });
      const dataB = NEW({
        nickname: "乙",
        capacity: 20,
        team: [{ hero_id: "huang_zhong", slot: 1 }],
      });
      const E = await mk({
        seed: [
          { key: A, data: dataA, rev: 3 },
          { key: B, data: dataB, rev: 4 },
        ],
        maps: HOLD_MAPS35,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: { shenma_player_key: A } });
      check("讀到甲的存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      const d2 = await deployHero(p, ROAD_CELLS[4], "趙雲");
      check(
        "部署馬超、趙雲並標記",
        d1.ok && d2.ok && (await markField(p)) === 2,
        { d1, d2 }
      );
      check("按進入戰場開戰", await startBattle(p));
      check("戰鬥中按暫停", await pauseHud(p));
      const s0 = await field35(p);
      const same0 = async () => sameJson(await field35(p), s0);
      // 1. 較舊的讀取：模擬後端放回比畫面舊的版本（rev 2、馬超 Lv.9）→ 不套用
      E.fx.seed(A, maLv(9), 2);
      await sync35(p, () => sleep(1200).then(() => true));
      check(
        "手動同步讀到比畫面舊的版本：不套用，場上不變",
        await same0(),
        await field35(p)
      );
      // 2. 不支援的隊伍（隊伍裡有這裡沒有的甘寧）：出征隊伍是空的，但不清空場上
      E.fx.seed(A, { ...maLv(9), team: [{ hero_id: "gan_ning", slot: 1 }] }, 5);
      await sync35(p, () => sleep(1200).then(() => true));
      check(
        "讀回不支援的隊伍：不同步，場上的馬超與趙雲都還在、數值不變",
        await same0(),
        await field35(p)
      );
      // 3. 唯讀（讀回的版本不明）：不同步
      E.fx.seed(A, maLv(9), 6);
      E.gas.rule("get_profile", "transform", {
        key: A,
        fn: (res) => ({ ...res, rev: null }),
      });
      await sync35(p, () => sleep(1200).then(() => true));
      check(
        "讀回唯讀的存檔（版本不明）：不同步，場上不變",
        await same0(),
        await field35(p)
      );
      // 4. 對照：同一個帳號、同一個世代讀回已確認可用的存檔 → 同步（馬超 Lv.4）
      E.fx.seed(A, maLv(4), 7);
      const ok4 = await sync35(p, async () => {
        const m = hero35(await field35(p), "hero_ma_chao");
        return m && m.lv === 4;
      });
      const s4 = await field35(p);
      check(
        "對照：同一個帳號讀回可用的存檔才同步（馬超 Lv.4、攻擊 144，原本的實例）",
        !!ok4 &&
          hero35(s4, "hero_ma_chao")?.mark === "hero:hero_ma_chao" &&
          hero35(s4, "hero_ma_chao")?.atk === 144 &&
          sameJson(keep35(s4), keep35(s0)),
        s4
      );
      // 5. 換帳號 A → B：不把乙的隊伍（只有黃忠）套到這一場
      check("切換到乙", await switchKey(p, B, "乙"));
      await sleep(1000);
      check(
        "換成乙之後：場上仍是甲的馬超與趙雲（沒有離場、數值不變），同一個 battleId",
        sameJson(await field35(p), s4),
        await field35(p)
      );
      // 6. 換回甲（同一把金鑰、新的世代）：甲的存檔已是馬超 Lv.6，也不套到這一場
      E.fx.seed(A, maLv(6), 8);
      check("切換回甲", await switchKey(p, A, "甲"));
      await sleep(1000);
      check(
        "同一把金鑰重新登入（新的世代）：不把甲新讀到的資料（Lv.6）套到這一場",
        sameJson(await field35(p), s4),
        await field35(p)
      );
      const ed = await editTeam35(p, { remove: ["趙雲"] });
      await sleep(800);
      check(
        "新的世代改隊伍（移出趙雲）：存檔照常保存一次，但這一場不同步（趙雲還在）",
        ed.ok &&
          E.gas.count("save_profile") === 1 &&
          sameJson(await field35(p), s4),
        { ed, field: await field35(p) }
      );
      // 7. 登入失敗（讀取一律斷線）：畫面仍是甲；之後手動同步讀到的甲也不套到這一場
      const failHits = await failSwitch35(p, E, B);
      await openInfo(p);
      const nickAfter = await text(p, '[data-testid="player-info-nickname"]');
      await closeModal(p);
      E.fx.seed(A, maLv(8), 10);
      await sync35(p, () => sleep(1200).then(() => true));
      check(
        "登入乙失敗後畫面仍是甲；之後手動同步讀到的甲（Lv.8）也不套到這一場",
        failHits > 0 && nickAfter === "甲" && sameJson(await field35(p), s4),
        { hits: failHits, nickAfter, field: await field35(p) }
      );
      return E;
    }
  );

  await scenario(
    "動態隊伍同步：結算後才保存的隊伍不改這一場，結算畫面不變",
    async (mk) => {
      const E = await mk({ maps: HOLD_MAPS35, enemies: [...ENEMIES, DUMMY] });
      const p = await E.page({
        storage: guestStorage(
          [MA35, ZY35],
          [
            { slot: 0, hero_id: "hero_ma_chao" },
            { slot: 1, hero_id: "hero_zhao_yun" },
          ]
        ),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      const d2 = await deployHero(p, ROAD_CELLS[4], "趙雲");
      check(
        "部署馬超、趙雲並標記",
        d1.ok && d2.ok && (await markField(p)) === 2,
        { d1, d2 }
      );
      check("按進入戰場開戰", await startBattle(p));
      await openTeam(p);
      const slot = modal(p).locator('[class*="teamSlotFilled"]', {
        hasText: "趙雲",
      });
      await slot.first().locator('button[title="移出隊伍"]').click();
      check(
        "受控結束（落敗；隊伍視窗還開著）",
        (await endWith(p, { win: false })) === "ok"
      );
      await sleep(800);
      const s0 = await field35(p);
      const result0 = await text(p, '[data-testid="result-card"]');
      await p.locator('[data-testid="team-edit-save"]').click();
      await until(
        async () =>
          (await p.locator('[data-testid="team-edit-save"]').count()) === 0,
        10000
      );
      await sleep(800);
      const s1 = await field35(p);
      const saved = await p.evaluate(() =>
        JSON.parse(localStorage.getItem("shenma_js_guest_state")).team.map(
          (t) => t.hero_id
        )
      );
      check(
        "結算後保存隊伍（本機存檔只剩馬超）：這一場不同步，趙雲仍在、仍是結算狀態",
        sameJson(saved, ["hero_ma_chao"]) &&
          s0.state === 3 &&
          sameJson(s1, s0) &&
          !!hero35(s1, "hero_zhao_yun"),
        { saved, s0, s1 }
      );
      const result1 = await text(p, '[data-testid="result-card"]');
      check("結算畫面的內容不變", !!result0 && result1 === result0, {
        result0,
        result1,
      });
      return E;
    }
  );

  await scenario(
    "動態隊伍同步：初始流程不卡（沒有帳號 → 訪客、沒有帳號 → 共用帳號登入），之後同一個帳號改隊伍才同步",
    async (mk) => {
      const data = NEW({
        nickname: "初",
        capacity: 20,
        team: [{ hero_id: "huang_zhong", slot: 1 }],
      });
      const E = await mk({
        seed: [{ key: "k_sync35_init", data, rev: 2 }],
        maps: SKILL_MAPS,
        enemies: ENEMIES,
      });
      const p = await E.page({ storage: {} });
      check("沒有金鑰：出現金鑰視窗", (await waitLoaded(p)) === "key-setup");
      await p.locator('[data-testid="key-setup-input"]').fill("k_sync35_init");
      await p.locator('[data-testid="key-setup-login"]').click();
      check(
        "登入共用帳號",
        await until(
          async () =>
            (await p.locator('[data-testid="key-setup"]').count()) === 0,
          15000
        )
      );
      await waitRemoteStage(p, E);
      const c1 = await menuCard(p, ROAD_CELLS[8], "黃忠");
      const c2 = await menuCard(p, ROAD_CELLS[8], "馬超");
      check(
        "沒有帳號 → 共用帳號：這一場用這個帳號的隊伍（黃忠可以派，預設隊伍的馬超不在）",
        c1.ok && !c1.disabled && !c2.ok,
        { c1, c2 }
      );
      const d1 = await deployHero(p, ROAD_CELLS[2], "黃忠");
      const bid = await bm(p, "battleId");
      const ed = await editTeam35(p, { add: ["趙雲"] });
      await sleep(800);
      const s1 = await field35(p);
      const c3 = await menuCard(p, ROAD_CELLS[8], "趙雲");
      check(
        "之後同一個帳號改隊伍（加入趙雲）：存檔一次、同一場同步（不重開），黃忠仍在，趙雲可以派",
        d1.ok &&
          ed.ok &&
          E.gas.count("save_profile") === 1 &&
          s1.battleId === bid &&
          s1.heroes.length === 1 &&
          s1.heroes[0].id === "hero_huang_zhong" &&
          c3.ok &&
          !c3.disabled,
        { d1, ed, s1, c3 }
      );
      // 另一個分頁：沒有帳號 → 訪客
      const p2 = await E.page({ storage: {} });
      check(
        "另一個分頁沒有金鑰：出現金鑰視窗",
        (await waitLoaded(p2)) === "key-setup"
      );
      await p2.locator('[data-testid="key-setup-guest"]').click();
      check("訪客一鍵試玩", await enterGuest(p2));
      await waitRemoteStage(p2, E);
      const g1 = await deployHero(p2, ROAD_CELLS[2], "馬超");
      check("沒有帳號 → 訪客：這一場用訪客的預設隊伍，可以派馬超", g1.ok, g1);
      return E;
    }
  );

  // 載入的來源守門：載入前也核出征隊伍的來源（模式、金鑰、帳號世代、載入中、共用帳號可投影）。
  // 載入次數用測試側包住既有的 bridge.loadStage 旁錄（不是產品的計數器）；設定回應用這個頁面自己的 GAS 規則延後（受控）
  const watchLoads35 = (p) =>
    p.evaluate(() => {
      const b = window.__testBridge;
      if (!b || typeof b.loadStage !== "function") return false;
      if (!b.__loadLog) {
        b.__loadLog = [];
        const orig = b.loadStage.bind(b);
        b.loadStage = (payload) => {
          b.__loadLog.push({
            battleId: payload.battleId,
            stage: payload.stageId,
            heroes: (payload.playerHeroes || []).map((h) => h.hero_id),
          });
          return orig(payload);
        };
      }
      return true;
    });
  const loads35 = (p) =>
    p.evaluate(
      () => (window.__testBridge && window.__testBridge.__loadLog) || null
    );
  /** 切換金鑰但這次讀取一律斷線（登入失敗）：回傳斷線的次數 */
  async function failSwitch35(p, E, key) {
    const rule = E.gas.rule("get_profile", "abort", { key, times: 20 });
    await openInfo(p);
    await p.locator("button", { hasText: "切換金鑰" }).click();
    await modal(p).locator('input[placeholder^="例"]').fill(key);
    await modal(p).locator("button", { hasText: "確認切換" }).click();
    // 等這次登入真的結束（store 的讀取會自動重試）：斷線次數連續 3 秒不再增加，才關掉視窗，並確認沒有留下視窗
    let last = -1;
    await until(
      () => {
        const h = rule.hits;
        const done = h > 0 && h === last;
        last = h;
        return done;
      },
      30000,
      3000
    );
    await closeModal(p);
    await until(async () => (await p.locator(".modal").count()) === 0, 10000);
    E.allowGasErrors += rule.hits;
    return rule.hits;
  }

  await scenario(
    "動態隊伍同步：設定回應延後到登入失敗之後，不用舊世代的隊伍重新載入或清場",
    async (mk) => {
      const A = "k_src35_a";
      const B = "k_src35_b";
      const E = await mk({
        seed: [
          {
            key: A,
            data: NEW({
              nickname: "甲",
              capacity: 20,
              team: [
                { hero_id: "ma_chao", slot: 1 },
                { hero_id: "zhao_yun", slot: 2 },
              ],
            }),
            rev: 3,
          },
          {
            key: B,
            data: NEW({
              nickname: "乙",
              team: [{ hero_id: "huang_zhong", slot: 1 }],
            }),
            rev: 4,
          },
        ],
        maps: SKILL_MAPS,
        enemies: ENEMIES,
      });
      const hold = E.gas.rule("get_all_maps", "hold");
      const p = await E.page({ storage: { shenma_player_key: A } });
      check("讀到甲的存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await sleep(1500);
      const roads = await roadCellsOf(p);
      const d1 = roads.length
        ? await deployHero(p, roads[0], "馬超")
        : { ok: false, step: "no-road" };
      check(
        "設定還沒到（內建關卡）：這一場用甲的隊伍，部署馬超並標記",
        d1.ok && (await markField(p)) === 1,
        { d1, roads: roads.length }
      );
      check("開始旁錄載入", await watchLoads35(p));
      const s0 = await field35(p);
      const hits = await failSwitch35(p, E, B);
      await openInfo(p);
      const nick = await text(p, '[data-testid="player-info-nickname"]');
      await closeModal(p);
      check("登入乙失敗：畫面仍是甲", hits > 0 && nick === "甲", {
        hits,
        nick,
      });
      check("放行延後的設定回應", hold.release() === 1);
      await until(() => E.gas.count("get_all_maps") > 0, 5000);
      await sleep(3000);
      const s1 = await field35(p);
      const l1 = await loads35(p);
      check(
        "設定在登入失敗後才到：不用甲的舊世代隊伍重新載入（沒有任何載入），同一個 battleId、場上的馬超與狀態不變",
        Array.isArray(l1) && l1.length === 0 && sameJson(s1, s0),
        { l1, s0, s1 }
      );
      const c1 = await menuCard(p, roads[1], "馬超");
      check(
        "部署選單：馬超仍是「已在場上」（名單沒有被清掉）",
        c1.ok && c1.disabled,
        c1
      );
      return E;
    }
  );

  await scenario(
    "動態隊伍同步：設定回應延後、其間合法登入新帳號：新帳號照常建立新的一場，設定到達後照常用後端設定重新載入（不卡）",
    async (mk) => {
      const A = "k_src35_c";
      const B = "k_src35_d";
      const E = await mk({
        seed: [
          {
            key: A,
            data: NEW({
              nickname: "丙",
              capacity: 20,
              team: [{ hero_id: "ma_chao", slot: 1 }],
            }),
            rev: 3,
          },
          {
            key: B,
            data: NEW({
              nickname: "丁",
              team: [{ hero_id: "huang_zhong", slot: 1 }],
            }),
            rev: 4,
          },
        ],
        maps: SKILL_MAPS,
        enemies: ENEMIES,
      });
      const hold = E.gas.rule("get_all_maps", "hold");
      const p = await E.page({ storage: { shenma_player_key: A } });
      check("讀到丙的存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await sleep(1500);
      check("開始旁錄載入", await watchLoads35(p));
      const b0 = await bm(p, "battleId");
      check("切換到丁（合法登入）", await switchKey(p, B, "丁"));
      await sleep(1500);
      const l1 = await loads35(p);
      const b1 = await bm(p, "battleId");
      check(
        "合法的新帳號在第 0 波建立新的一場：載入一次，用丁的隊伍（黃忠）",
        Array.isArray(l1) &&
          l1.length === 1 &&
          sameJson(l1[0].heroes, ["hero_huang_zhong"]) &&
          b1 !== b0 &&
          b1 === l1[0].battleId,
        { l1, b0, b1 }
      );
      check("放行延後的設定回應", hold.release() === 1);
      const remote = await until(async () => {
        const l = await loads35(p);
        return l && l.length === 2 ? l : null;
      }, 10000);
      await sleep(1000);
      const l2 = await loads35(p);
      check(
        "設定到達後照常重新載入一次（丁的隊伍、接線測試關），之後不再多載入",
        !!remote &&
          l2.length === 2 &&
          sameJson(l2[1].heroes, ["hero_huang_zhong"]) &&
          (await bm(p, "battleId")) === l2[1].battleId,
        { l2 }
      );
      const d1 = await deployHero(p, ROAD_CELLS[2], "黃忠");
      check("新的一場可以照常部署丁的黃忠", d1.ok, d1);
      return E;
    }
  );

  await scenario(
    "動態隊伍同步：載入次數（同帳號同資料的階段變化不另建新場、重新挑戰只載入一次、同一把金鑰重新登入成功是新的一場）",
    async (mk) => {
      const K = "k_src35_e";
      const E = await mk({
        seed: [
          {
            key: K,
            data: NEW({
              nickname: "戊",
              capacity: 20,
              team: [{ hero_id: "ma_chao", slot: 1 }],
            }),
            rev: 2,
          },
        ],
        maps: HOLD_MAPS35,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: { shenma_player_key: K } });
      check("讀到存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      check("開始旁錄載入", await watchLoads35(p));
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("部署馬超並標記", d1.ok && (await markField(p)) === 1, d1);
      check("按進入戰場開戰", await startBattle(p));
      check("馬超打到木樁、首擊紀錄寫下", await waitFirstStrike(p));
      check("戰鬥中按暫停", await pauseHud(p));
      check("按繼續", await resumeHud(p));
      await sleep(800);
      const s1 = await field35(p);
      const l1 = await loads35(p);
      check(
        "部署、開戰、暫停、繼續：沒有任何載入，同一場、馬超是原本的實例、首擊紀錄還在",
        Array.isArray(l1) &&
          l1.length === 0 &&
          s1.heroes.length === 1 &&
          s1.heroes[0].mark === "hero:hero_ma_chao" &&
          !!s1.firstStrike &&
          s1.firstStrike.length === 1,
        { l1, s1 }
      );
      check("受控的落敗結束", (await endWith(p, { win: false })) === "ok");
      const retry = p.locator('[data-testid="result-overlay"] button', {
        hasText: "重新挑戰",
      });
      check(
        "結算畫面有「重新挑戰」",
        await until(() => retry.isVisible(), 10000)
      );
      await retry.click();
      await until(async () => (await bm(p, "state")) === 1, 5000);
      await sleep(1500);
      const l2 = await loads35(p);
      const b2 = await bm(p, "battleId");
      check(
        "重新挑戰只載入一次（新的一場），之後不再因為進入第 0 波備戰多載入",
        l2.length === 1 && b2 === l2[0].battleId && b2 !== s1.battleId,
        { l2, b2 }
      );
      check("同一把金鑰重新登入成功", await switchKey(p, K, "戊"));
      await sleep(1500);
      const l3 = await loads35(p);
      const b3 = await bm(p, "battleId");
      check(
        "同一把金鑰重新登入成功（新的世代）：第 0 波備戰照帳號選取建立新的一場（多載入一次）",
        l3.length === 2 && b3 === l3[1].battleId && b3 !== b2,
        { l3, b3 }
      );
      return E;
    }
  );

  /** 畫布上看得到的空建築位 */
  const towerCellsOf35 = (p) =>
    p.evaluate(() => {
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
  /** 一般操作登出：主公資訊 →「登出當前帳號」→「確認登出」，等金鑰視窗出現（還沒選帳號） */
  async function logout35(p) {
    if (!(await openInfo(p))) return false;
    await modal(p).locator("button", { hasText: "登出當前帳號" }).click();
    await modal(p).locator("button", { hasText: "確認登出" }).click();
    return !!(await until(
      () => p.locator('[data-testid="key-setup-guest"]').isVisible(),
      10000
    ));
  }
  const keySetupShown35 = (p) =>
    p.locator('[data-testid="key-setup"]').isVisible();

  await scenario(
    "動態隊伍同步：訪客第 0 波登出後還沒選帳號，不重新載入、不清場；設定回應晚於登出也不載入；之後選訪客才建立新的一場（可以部署）",
    async (mk) => {
      const E = await mk({ maps: SKILL_MAPS, enemies: ENEMIES });
      const hold = E.gas.rule("get_all_maps", "hold");
      const p = await E.page({
        storage: guestStorage(
          [MA35, ZY35],
          [
            { slot: 0, hero_id: "hero_ma_chao" },
            { slot: 1, hero_id: "hero_zhao_yun" },
          ]
        ),
      });
      check("以訪客進入", await enterGuest(p));
      await sleep(1500);
      const roads = await roadCellsOf(p);
      const zones = await towerCellsOf35(p);
      const d1 = roads.length
        ? await deployHero(p, roads[0], "馬超")
        : { ok: false, step: "no-road" };
      const t1 = zones.length
        ? await buildTower(p, zones[0], "弓兵塔")
        : { ok: false, step: "no-zone" };
      check(
        "設定還沒到（內建關卡）：部署馬超、建弓兵塔並標記",
        d1.ok && t1.ok && (await markField(p)) === 2,
        { d1, t1, roads: roads.length, zones: zones.length }
      );
      check("開始旁錄載入", await watchLoads35(p));
      const s0 = await field35(p);
      const out = await logout35(p);
      await sleep(1500);
      const s1 = await field35(p);
      const l1 = await loads35(p);
      check(
        "登出（主公資訊 → 登出當前帳號 → 確認登出）：出現金鑰視窗，還沒選帳號",
        out
      );
      check(
        "訪客登出後還沒選帳號：沒有任何載入，同一個 battleId、場上的馬超與弓兵塔、波次、金幣、城防與狀態都不變",
        Array.isArray(l1) && l1.length === 0 && sameJson(s1, s0),
        { l1, s0, s1 }
      );
      check("放行延後的設定回應", hold.release() === 1);
      await until(() => E.gas.count("get_all_maps") > 0, 5000);
      await sleep(3000);
      const s2 = await field35(p);
      const l2 = await loads35(p);
      const shown2 = await keySetupShown35(p);
      check(
        "設定在登出之後才到、仍然還沒選帳號：沒有任何載入，場上不變，金鑰視窗還在",
        Array.isArray(l2) && l2.length === 0 && sameJson(s2, s0) && shown2,
        { l2, s2, shown2 }
      );
      await p.locator('[data-testid="key-setup-guest"]').click();
      check("在金鑰視窗選訪客一鍵試玩", await enterGuest(p));
      await sleep(1500);
      const l3 = await loads35(p);
      const s3 = await field35(p);
      check(
        "選訪客：建立新的一場（載入一次，用訪客的隊伍馬超、趙雲），場上清空、第 0 波備戰",
        Array.isArray(l3) &&
          l3.length === 1 &&
          sameJson(l3[0].heroes, ["hero_ma_chao", "hero_zhao_yun"]) &&
          s3.battleId === l3[0].battleId &&
          s3.battleId !== s0.battleId &&
          s3.heroes.length === 0 &&
          s3.towers.length === 0 &&
          s3.state === 1 &&
          s3.wave === 0,
        { l3, s3, skillMap: await isSkillMap(p) }
      );
      const roads3 = await roadCellsOf(p);
      const d2 = roads3.length
        ? await deployHero(p, roads3[0], "馬超")
        : { ok: false, step: "no-road" };
      check("新的一場可以照常部署馬超", d2.ok, d2);
      return E;
    }
  );

  await scenario(
    "動態隊伍同步：共用帳號第 0 波登出後還沒選帳號，不重新載入、不清場；之後在金鑰視窗登入另一個共用帳號才建立新的一場（可以部署）",
    async (mk) => {
      const A = "k_src35_f";
      const B = "k_src35_g";
      const E = await mk({
        seed: [
          {
            key: A,
            data: NEW({
              nickname: "己",
              capacity: 20,
              team: [{ hero_id: "ma_chao", slot: 1 }],
            }),
            rev: 2,
          },
          {
            key: B,
            data: NEW({
              nickname: "庚",
              team: [{ hero_id: "huang_zhong", slot: 1 }],
            }),
            rev: 3,
          },
        ],
        maps: SKILL_MAPS,
        enemies: ENEMIES,
      });
      const p = await E.page({ storage: { shenma_player_key: A } });
      check("讀到己的存檔", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      const t1 = await buildTower(p, BUILD_CELL, "弓兵塔");
      check(
        "部署馬超、建弓兵塔並標記",
        d1.ok && t1.ok && (await markField(p)) === 2,
        { d1, t1 }
      );
      check("開始旁錄載入", await watchLoads35(p));
      const s0 = await field35(p);
      const out = await logout35(p);
      await sleep(1500);
      const s1 = await field35(p);
      const l1 = await loads35(p);
      check(
        "登出（主公資訊 → 登出當前帳號 → 確認登出）：出現金鑰視窗，還沒選帳號",
        out
      );
      check(
        "共用帳號登出後還沒選帳號：沒有任何載入，同一個 battleId、場上的馬超與弓兵塔、波次、金幣、城防與狀態都不變",
        Array.isArray(l1) && l1.length === 0 && sameJson(s1, s0),
        { l1, s0, s1 }
      );
      await p.locator('[data-testid="key-setup-input"]').fill(B);
      await p.locator('[data-testid="key-setup-login"]').click();
      check(
        "在金鑰視窗登入庚",
        await until(
          async () =>
            (await p.locator('[data-testid="key-setup"]').count()) === 0,
          15000
        )
      );
      await sleep(1500);
      const l2 = await loads35(p);
      const s2 = await field35(p);
      check(
        "登入庚：建立新的一場（載入一次，用庚的隊伍黃忠），場上清空、第 0 波備戰",
        Array.isArray(l2) &&
          l2.length === 1 &&
          sameJson(l2[0].heroes, ["hero_huang_zhong"]) &&
          s2.battleId === l2[0].battleId &&
          s2.battleId !== s0.battleId &&
          s2.heroes.length === 0 &&
          s2.towers.length === 0 &&
          s2.state === 1 &&
          s2.wave === 0,
        { l2, s2 }
      );
      const d2 = await deployHero(p, ROAD_CELLS[2], "黃忠");
      check("新的一場可以照常部署庚的黃忠", d2.ok, d2);
      return E;
    }
  );

  // ═══ 36. 換帳號後沒有重新載入的舊場：不派新帳號的武將、訪客的本機結算只給出征來源本人 ═══
  // 戰鬥中或清完一波回到備戰時換帳號，照原本的政策不重開這一場（第 24、35 段）；這時部署選單的武將卡停用並說明（塔照常），
  // 真正的派出入口另用 store 當下的帳號再核一次；訪客的本機結算只給這一場的出征來源本人（模式、金鑰、帳號世代都相同）。
  // 結束用受控的 endBattle 回呼、清波用受控的 onWaveAllEnemiesDead，不是自然通關。「受控呼叫派出入口」是直接呼叫武將卡的 React onClick
  // （等同畫面晚一拍、卡片還能按的情況），不是一般操作
  const BLOCK36 = "這一場是換帳號前的出征，請重新選關再派武將。";
  const NOTSAVED36 =
    "這場沒有寫入本機進度：出征後帳號來源已變更，請重新選關再出征。";
  const guestRaw36 = (p) =>
    p.evaluate(() => localStorage.getItem("shenma_js_guest_state"));
  const guestGold36 = (p) =>
    p.evaluate(() => {
      const g = JSON.parse(
        localStorage.getItem("shenma_js_guest_state") || "null"
      );
      return g ? g.gold : null;
    });
  const heroCount36 = (p) =>
    p.evaluate(() => window.__testBridge.engine.heroes.length);
  /**
   * 打開部署選單讀某位武將卡（停用、說明）；keyboard：試著把焦點移到卡片按 Enter；
   * force：受控呼叫卡片的 React onClick（直接走頁面真正的派出入口），回報前後場上武將數與選單是否還開著
   */
  async function heroCard36(
    p,
    cell,
    name,
    { force = false, keyboard = false } = {}
  ) {
    const pt = await cellPoint(p, cell);
    if (!pt.onCanvas || !pt.canPlace) return { ok: false, step: "cell", pt };
    await p.mouse.click(pt.x, pt.y);
    const menu = p.locator(PLACEMENT_MENU);
    if (!(await until(() => menu.isVisible(), 5000)))
      return { ok: false, step: "menu" };
    const card = menu.locator("button", { hasText: name });
    if ((await card.count()) === 0) {
      const t = await menu.innerText();
      await closePlacementMenu(p);
      return { ok: false, step: "card", menu: t };
    }
    const hint = menu.locator('[data-testid="placement-hero-blocked"]');
    const out = {
      ok: true,
      disabled: await card.first().isDisabled(),
      reason: (await hint.count()) ? (await hint.innerText()).trim() : null,
    };
    if (keyboard) {
      const before = await heroCount36(p);
      await card
        .first()
        .focus()
        .catch(() => {});
      const focused = await card
        .first()
        .evaluate((b) => document.activeElement === b);
      await p.keyboard.press("Enter");
      await sleep(500);
      out.keyboard = {
        focused,
        before,
        after: await heroCount36(p),
        menuOpen: await menu.isVisible(),
      };
    }
    if (force) {
      const before = await heroCount36(p);
      const called = await card.first().evaluate((b) => {
        const k = Object.keys(b).find((x) => x.startsWith("__reactProps$"));
        if (!k || typeof b[k].onClick !== "function") return false;
        b[k].onClick();
        return true;
      });
      await sleep(500);
      out.forced = {
        called,
        before,
        after: await heroCount36(p),
        menuOpen: await menu.isVisible(),
      };
    }
    if (await menu.isVisible()) await closePlacementMenu(p);
    return out;
  }
  const blocked36 = (c) =>
    !!c && c.ok && c.disabled === true && c.reason === BLOCK36;
  const forcedRefused36 = (c) =>
    !!c &&
    !!c.forced &&
    c.forced.called === true &&
    c.forced.after === c.forced.before &&
    c.forced.menuOpen === true;
  const resultOf36 = async (p) => ({
    card: (await text(p, '[data-testid="result-card"]')) || "",
    notSaved: await text(p, '[data-testid="result-not-saved"]'),
  });

  await scenario(
    "換帳號舊場守門：共用帳號甲戰鬥中登出改用訪客，訪客的武將不能派進舊場、塔照常，受控勝利後訪客存檔不變",
    async (mk) => {
      const A = "k_g36_a";
      const E = await mk({
        seed: [
          {
            key: A,
            data: NEW({
              nickname: "甲",
              capacity: 20,
              team: [{ hero_id: "ma_chao", slot: 1 }],
            }),
            rev: 2,
          },
        ],
        maps: HOLD_MAPS35,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({
        storage: {
          shenma_player_key: A,
          shenma_js_guest_state: GUEST_SAVE(
            [ZY35],
            [{ slot: 0, hero_id: "hero_zhao_yun" }]
          ),
        },
      });
      check("讀到甲", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("部署甲的馬超並標記", d1.ok && (await markField(p)) === 1, d1);
      check("開始旁錄載入", await watchLoads35(p));
      check("按進入戰場開戰", await startBattle(p));
      const s0 = await field35(p);
      check("戰鬥中一般 UI 登出", await logout35(p));
      await p.locator('[data-testid="key-setup-guest"]').click();
      check("在金鑰視窗選訪客", await enterGuest(p));
      await sleep(1500);
      const s1 = await field35(p);
      const l1 = await loads35(p);
      check(
        "改用訪客後舊場不重開：沒有任何載入、同一個 battleId、仍在戰鬥、場上是甲的馬超（原本的實例）",
        Array.isArray(l1) &&
          l1.length === 0 &&
          s1.battleId === s0.battleId &&
          s1.state === 2 &&
          s1.heroes.length === 1 &&
          s1.heroes[0].mark === "hero:hero_ma_chao",
        { l1, s0, s1 }
      );
      const raw0 = await guestRaw36(p);
      const c1 = await heroCard36(p, ROAD_CELLS[6], "趙雲", { force: true });
      check(
        "部署選單上訪客的趙雲停用，說明「這一場是換帳號前的出征，請重新選關再派武將。」",
        blocked36(c1),
        c1
      );
      check(
        "受控呼叫趙雲卡的派出入口：不派（場上武將數不變、選單沒有關）",
        forcedRefused36(c1),
        c1
      );
      const t1 = await buildTower(p, BUILD_CELL, "弓兵塔");
      const s2 = await field35(p);
      check(
        "塔照常：在建築位建弓兵塔成功（塔不屬於帳號）",
        t1.ok && s2.towers.length === 1,
        { t1, towers: s2.towers }
      );
      check("受控勝利結束", (await endWith(p, { win: true })) === "ok");
      await sleep(1500);
      const raw1 = await guestRaw36(p);
      const r1 = await resultOf36(p);
      check(
        "訪客的本機存檔逐字不變（沒有金幣、經驗、解鎖、通關紀錄）",
        raw0 !== null && raw1 === raw0,
        { raw0, raw1 }
      );
      check(
        "結算畫面沒有獎勵與解鎖，說明「這場沒有寫入本機進度：出征後帳號來源已變更，請重新選關再出征。」",
        r1.notSaved === NOTSAVED36 &&
          !/主公金幣|主公經驗|解鎖新戰役|已通關/.test(r1.card),
        r1
      );
      check(
        "沒有任何 GAS 寫入",
        E.gas.writes().length === 0,
        E.gas.writes().map((w) => w.action)
      );
      return E;
    }
  );

  await scenario(
    "換帳號舊場守門：共用帳號甲清完第 1 波後切換到乙、再切回甲（新的世代），兩次都不能派武將（390×600、鍵盤），舊場保留、結束不寫入",
    async (mk) => {
      const A = "k_g36_c";
      const B = "k_g36_d";
      const E = await mk({
        seed: [
          {
            key: A,
            data: NEW({
              nickname: "甲",
              capacity: 20,
              team: [
                { hero_id: "ma_chao", slot: 1 },
                { hero_id: "zhao_yun", slot: 2 },
              ],
            }),
            rev: 2,
          },
          {
            key: B,
            data: NEW({
              nickname: "乙",
              capacity: 20,
              team: [{ hero_id: "huang_zhong", slot: 1 }],
            }),
            rev: 5,
          },
        ],
        maps: TWO_WAVE_MAPS,
        enemies: [...ENEMIES, DUMMY],
        viewport: { width: 390, height: 600 },
      });
      const p = await E.page({ storage: { shenma_player_key: A } });
      check("讀到甲", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("部署甲的馬超並標記", d1.ok && (await markField(p)) === 1, d1);
      check("開始旁錄載入", await watchLoads35(p));
      check("開第 1 波", await startBattle(p));
      await forceWaveClear(p);
      await sleep(1200);
      const s0 = await field35(p);
      check(
        "受控清波回到備戰（第 1 波之後）",
        s0.state === 1 && s0.wave === 1,
        s0
      );
      check("一般 UI 切換金鑰到乙", await switchKey(p, B, "乙"));
      await sleep(1500);
      const c1 = await heroCard36(p, ROAD_CELLS[6], "黃忠", {
        keyboard: true,
        force: true,
      });
      check("乙的黃忠卡停用並說明", blocked36(c1), c1);
      check(
        "鍵盤：停用的黃忠卡拿不到焦點、按 Enter 不派",
        !!c1.keyboard &&
          c1.keyboard.focused === false &&
          c1.keyboard.after === c1.keyboard.before,
        c1
      );
      check("受控呼叫黃忠卡的派出入口：不派", forcedRefused36(c1), c1);
      check(
        "一般 UI 切回甲（同一把金鑰、新的世代）",
        await switchKey(p, A, "甲")
      );
      await sleep(1500);
      const c2 = await heroCard36(p, ROAD_CELLS[6], "趙雲", { force: true });
      check(
        "切回甲之後：甲的趙雲卡也停用並說明（新的世代不算這一場的來源）",
        blocked36(c2),
        c2
      );
      check("受控呼叫趙雲卡的派出入口：不派", forcedRefused36(c2), c2);
      const s1 = await field35(p);
      const l1 = await loads35(p);
      check(
        "舊場保留：沒有任何載入、同一個 battleId、波次 1、塔金幣城防首擊不變、場上只有甲的馬超（原本的實例）",
        Array.isArray(l1) &&
          l1.length === 0 &&
          sameJson(keep35(s1), keep35(s0)) &&
          sameJson(s1.heroes, s0.heroes),
        { l1, s0, s1 }
      );
      await p.locator('[data-testid="hud-start-battle"]').click();
      check(
        "按迎戰進第 2 波",
        await until(async () => (await bm(p, "state")) === 2, 5000)
      );
      check("受控勝利結束", (await endWith(p, { win: true })) === "ok");
      await sleep(2000);
      const r1 = await resultOf36(p);
      check(
        "結算照原本的共用帳號規則：沒有送出（出征時沒有固定這一場），沒有本機進度的說明",
        E.gas.count("save_result") === 0 &&
          /出征時沒有固定這一場/.test(r1.card) &&
          !r1.card.includes(NOTSAVED36),
        { saveResult: E.gas.count("save_result"), r1 }
      );
      return E;
    }
  );

  await scenario(
    "換帳號舊場守門：訪客戰鬥中登出再選回同一個訪客（同一把金鑰、新的世代），舊場不給本機獎勵、武將卡停用",
    async (mk) => {
      const E = await mk({
        maps: HOLD_MAPS35,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({
        storage: guestStorage(
          [MA35, ZY35],
          [
            { slot: 0, hero_id: "hero_ma_chao" },
            { slot: 1, hero_id: "hero_zhao_yun" },
          ]
        ),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("部署馬超並標記", d1.ok && (await markField(p)) === 1, d1);
      check("開始旁錄載入", await watchLoads35(p));
      check("按進入戰場開戰", await startBattle(p));
      const s0 = await field35(p);
      check("戰鬥中一般 UI 登出", await logout35(p));
      await p.locator('[data-testid="key-setup-guest"]').click();
      check("在金鑰視窗選回訪客", await enterGuest(p));
      await sleep(1500);
      const s1 = await field35(p);
      check(
        "舊場不重開：沒有任何載入、同一個 battleId、仍在戰鬥",
        sameJson(await loads35(p), []) &&
          s1.battleId === s0.battleId &&
          s1.state === 2,
        { s0, s1 }
      );
      const raw0 = await guestRaw36(p);
      const c1 = await heroCard36(p, ROAD_CELLS[6], "趙雲", { force: true });
      check("同一個訪客的趙雲卡也停用並說明", blocked36(c1), c1);
      check("受控呼叫趙雲卡的派出入口：不派", forcedRefused36(c1), c1);
      check("受控勝利結束", (await endWith(p, { win: true })) === "ok");
      await sleep(1500);
      const raw1 = await guestRaw36(p);
      const r1 = await resultOf36(p);
      check(
        "訪客的本機存檔逐字不變，結算畫面說明沒有寫入本機進度、沒有獎勵",
        raw0 !== null &&
          raw1 === raw0 &&
          r1.notSaved === NOTSAVED36 &&
          !/主公金幣|解鎖新戰役/.test(r1.card),
        { raw0, raw1, r1 }
      );
      return E;
    }
  );

  await scenario(
    "換帳號舊場守門：訪客戰鬥中登出改登入共用帳號甲，舊場不給訪客獎勵、也不寫共用進度",
    async (mk) => {
      const A = "k_g36_e";
      const E = await mk({
        seed: [
          {
            key: A,
            data: NEW({
              nickname: "甲",
              capacity: 20,
              team: [{ hero_id: "huang_zhong", slot: 1 }],
            }),
            rev: 2,
          },
        ],
        maps: HOLD_MAPS35,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({
        storage: guestStorage(
          [MA35, ZY35],
          [
            { slot: 0, hero_id: "hero_ma_chao" },
            { slot: 1, hero_id: "hero_zhao_yun" },
          ]
        ),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("部署馬超並標記", d1.ok && (await markField(p)) === 1, d1);
      check("按進入戰場開戰", await startBattle(p));
      const raw0 = await guestRaw36(p);
      check("戰鬥中一般 UI 登出", await logout35(p));
      await p.locator('[data-testid="key-setup-input"]').fill(A);
      await p.locator('[data-testid="key-setup-login"]').click();
      check(
        "在金鑰視窗登入甲",
        await until(
          async () =>
            (await p.locator('[data-testid="key-setup"]').count()) === 0,
          15000
        )
      );
      await sleep(1500);
      const c1 = await heroCard36(p, ROAD_CELLS[6], "黃忠", { force: true });
      check("甲的黃忠卡停用並說明", blocked36(c1), c1);
      check("受控呼叫黃忠卡的派出入口：不派", forcedRefused36(c1), c1);
      check("受控勝利結束", (await endWith(p, { win: true })) === "ok");
      await sleep(2000);
      const raw1 = await guestRaw36(p);
      const r1 = await resultOf36(p);
      check(
        "訪客的本機存檔逐字不變；共用帳號照原本的規則沒有送出（出征時沒有固定這一場）",
        raw0 !== null &&
          raw1 === raw0 &&
          E.gas.count("save_result") === 0 &&
          /出征時沒有固定這一場/.test(r1.card),
        { raw0, raw1, saveResult: E.gas.count("save_result"), r1 }
      );
      return E;
    }
  );

  await scenario(
    "換帳號舊場守門：訪客同一個世代清波後續戰勝利，派武將與本機獎勵照原本的訪客規則",
    async (mk) => {
      const E = await mk({
        maps: TWO_WAVE_MAPS,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({
        storage: guestStorage(
          [MA35, ZY35],
          [
            { slot: 0, hero_id: "hero_ma_chao" },
            { slot: 1, hero_id: "hero_zhao_yun" },
          ]
        ),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("部署馬超", d1.ok, d1);
      check("開第 1 波", await startBattle(p));
      await forceWaveClear(p);
      await sleep(1200);
      const c1 = await heroCard36(p, ROAD_CELLS[6], "趙雲");
      check(
        "清波後同一個訪客：趙雲卡可以按、沒有換帳號的說明",
        c1.ok && c1.disabled === false && c1.reason === null,
        c1
      );
      const d2 = await deployHero(p, ROAD_CELLS[6], "趙雲");
      check("清波後照常部署趙雲", d2.ok, d2);
      await p.locator('[data-testid="hud-start-battle"]').click();
      check(
        "按迎戰進第 2 波",
        await until(async () => (await bm(p, "state")) === 2, 5000)
      );
      const gold0 = await guestGold36(p);
      check("受控勝利結束", (await endWith(p, { win: true })) === "ok");
      await sleep(1500);
      const gold1 = await guestGold36(p);
      const r1 = await resultOf36(p);
      check(
        "照原本的訪客規則給本機獎勵：存檔的金幣增加、結算畫面列出主公金幣，沒有換帳號的說明",
        typeof gold0 === "number" &&
          typeof gold1 === "number" &&
          gold1 > gold0 &&
          /主公金幣/.test(r1.card) &&
          r1.notSaved === null,
        { gold0, gold1, r1 }
      );
      return E;
    }
  );

  await scenario(
    "換帳號舊場守門：訪客第 0 波登出再選回同一個訪客，建立新的一場，可以部署並照常結算",
    async (mk) => {
      const E = await mk({
        maps: HOLD_MAPS35,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({
        storage: guestStorage(
          [MA35, ZY35],
          [
            { slot: 0, hero_id: "hero_ma_chao" },
            { slot: 1, hero_id: "hero_zhao_yun" },
          ]
        ),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("部署馬超", d1.ok, d1);
      check("開始旁錄載入", await watchLoads35(p));
      const b0 = await bm(p, "battleId");
      check("第 0 波一般 UI 登出", await logout35(p));
      await p.locator('[data-testid="key-setup-guest"]').click();
      check("在金鑰視窗選回訪客", await enterGuest(p));
      await sleep(1500);
      const l1 = await loads35(p);
      const b1 = await bm(p, "battleId");
      check(
        "第 0 波換成合法的新來源（同一個訪客、新的世代）：建立新的一場（載入一次）",
        Array.isArray(l1) &&
          l1.length === 1 &&
          b1 === l1[0].battleId &&
          b1 !== b0,
        { l1, b0, b1 }
      );
      const d2 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("新的一場可以照常部署馬超", d2.ok, d2);
      check("按進入戰場開戰", await startBattle(p));
      const gold0 = await guestGold36(p);
      check("受控勝利結束", (await endWith(p, { win: true })) === "ok");
      await sleep(1500);
      const gold1 = await guestGold36(p);
      const r1 = await resultOf36(p);
      check(
        "新的一場照常給本機獎勵（金幣增加、列出主公金幣），沒有換帳號的說明",
        typeof gold0 === "number" &&
          gold1 > gold0 &&
          /主公金幣/.test(r1.card) &&
          r1.notSaved === null,
        { gold0, gold1, r1 }
      );
      return E;
    }
  );

  await scenario(
    "換帳號舊場守門：共用帳號甲第 0 波登入乙失敗（甲的資料還在、世代已換），武將卡停用；手動同步後建立新的一場、可以部署",
    async (mk) => {
      const A = "k_g36_f";
      const B = "k_g36_g";
      const E = await mk({
        seed: [
          {
            key: A,
            data: NEW({
              nickname: "甲",
              capacity: 20,
              team: [
                { hero_id: "ma_chao", slot: 1 },
                { hero_id: "zhao_yun", slot: 2 },
              ],
            }),
            rev: 3,
          },
          {
            key: B,
            data: NEW({
              nickname: "乙",
              team: [{ hero_id: "huang_zhong", slot: 1 }],
            }),
            rev: 4,
          },
        ],
        maps: HOLD_MAPS35,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: { shenma_player_key: A } });
      check("讀到甲", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("部署甲的馬超並標記", d1.ok && (await markField(p)) === 1, d1);
      check("開始旁錄載入", await watchLoads35(p));
      const hits = await failSwitch35(p, E, B);
      await openInfo(p);
      const nick = await text(p, '[data-testid="player-info-nickname"]');
      await closeModal(p);
      check("登入乙失敗：畫面仍是甲", hits > 0 && nick === "甲", {
        hits,
        nick,
      });
      const c1 = await heroCard36(p, ROAD_CELLS[6], "趙雲", { force: true });
      check(
        "登入失敗後（甲的資料、新的世代）：趙雲卡停用並說明",
        blocked36(c1),
        c1
      );
      check("受控呼叫趙雲卡的派出入口：不派", forcedRefused36(c1), c1);
      check(
        "登入失敗後沒有載入新的一場",
        sameJson(await loads35(p), []),
        await loads35(p)
      );
      const synced = await sync35(p, async () => {
        const l = await loads35(p);
        return Array.isArray(l) && l.length === 1;
      });
      const l2 = await loads35(p);
      check(
        "手動同步讀回甲（新的世代）：第 0 波建立新的一場（載入一次，甲的隊伍）",
        !!synced &&
          Array.isArray(l2) &&
          l2.length === 1 &&
          sameJson(l2[0].heroes, ["hero_ma_chao", "hero_zhao_yun"]),
        { l2 }
      );
      const c2 = await heroCard36(p, ROAD_CELLS[6], "趙雲");
      check(
        "新的一場：趙雲卡可以按、沒有換帳號的說明",
        c2.ok && c2.disabled === false && c2.reason === null,
        c2
      );
      const d2 = await deployHero(p, ROAD_CELLS[6], "趙雲");
      check("新的一場可以照常部署趙雲", d2.ok, d2);
      return E;
    }
  );

  await scenario(
    "換帳號舊場守門：共用帳號甲第 0 波切換到隊伍不支援的乙後，「自動」和「迎戰」一樣停用、按不下去也不開波，沒有寫入",
    async (mk) => {
      const A = "k_g36_h";
      const B = "k_g36_i";
      const E = await mk({
        seed: [
          {
            key: A,
            data: NEW({
              nickname: "甲",
              capacity: 20,
              team: [{ hero_id: "ma_chao", slot: 1 }],
            }),
            rev: 2,
          },
          {
            key: B,
            data: NEW({
              nickname: "乙",
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
            }),
            rev: 3,
          },
        ],
        maps: HOLD_MAPS35,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: { shenma_player_key: A } });
      check("讀到甲", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, ROAD_CELLS[2], "馬超");
      check("部署甲的馬超並標記", d1.ok && (await markField(p)) === 1, d1);
      check("開始旁錄載入", await watchLoads35(p));
      check("一般 UI 切換金鑰到乙（隊伍不支援）", await switchKey(p, B, "乙"));
      await sleep(1500);
      const auto = p.locator("button", { hasText: /^自動$/ });
      const start = p.locator('[data-testid="hud-start-battle"]');
      const autoState = {
        count: await auto.count(),
        disabled: (await auto.count()) ? await auto.first().isDisabled() : null,
        title: (await auto.count())
          ? await auto.first().getAttribute("title")
          : null,
        startDisabled: await start.first().isDisabled(),
        startTitle: await start.first().getAttribute("title"),
      };
      check(
        "「自動」按鈕停用，說明和迎戰相同",
        autoState.count === 1 &&
          autoState.disabled === true &&
          autoState.startDisabled === true &&
          !!autoState.title &&
          autoState.title === autoState.startTitle,
        autoState
      );
      const b0 = await bm(p, "battleId");
      const called = await auto
        .first()
        .evaluate((b) => {
          const k = Object.keys(b).find((x) => x.startsWith("__reactProps$"));
          if (!k || typeof b[k].onClick !== "function") return false;
          b[k].onClick();
          return true;
        })
        .catch(() => false);
      await sleep(1500);
      const after = {
        called,
        state: await bm(p, "state"),
        battleId: await bm(p, "battleId"),
        loads: await loads35(p),
      };
      check(
        "受控呼叫「自動」的 onClick：不開波（仍是備戰、battleId 不變、載入 0）",
        after.called &&
          after.state === 1 &&
          after.battleId === b0 &&
          sameJson(after.loads, []),
        { b0, ...after }
      );
      check(
        "不論有沒有開波：沒有任何結算或存檔寫入",
        E.gas.writes().length === 0,
        E.gas.writes().map((w) => w.action)
      );
      return E;
    }
  );

  // ═══ 37. 備戰時移動武將與塔：點選單位 →「移動」→ 點畫布上的合法格（或用鍵盤選目的格）；同一個實例、免費、舊格放開新格占用 ═══
  // 和 Godot 版的拖曳移位相同，只在這一場的備戰（第 0 波或清波後）、沒有暫停、還沒結算時可以移動；武將放空的道路格或建築位，塔只放空的建築位。
  // 換帳號後沒有重新載入的舊場不能移動武將（塔照常）。清波用受控的 onWaveAllEnemiesDead、結束用受控的 endBattle 回呼（不是自然通關）。
  // 「受控呼叫」是直接呼叫按鈕的 React onClick（等同畫面晚一拍、舊面板的按鈕還能按），只用在過期、晚到的負向檢查，和一般操作分開
  const MOVE_MAPS37 = SKILL_MAPS.map((m) => ({
    ...m,
    path_json: JSON.stringify({
      ...JSON.parse(m.path_json),
      build_zones: TOWER_CELLS,
    }),
    waves: [DUMMY_WAVE(1), DUMMY_WAVE(2)],
  }));
  const HERO_MOVE_BLOCKED37 = "這一場是換帳號前的出征，不能移動武將。";
  const INVALIDATED37 = "移動已取消：不在備戰、暫停了，或場上已經改變。";
  const RESELECT37 = "請重新點選要移動的單位。";
  const MOVE_PANEL37 = '[data-testid="move-unit-panel"]';
  const UPGRADE_PANEL37 = '[data-testid="upgrade-panel"]';
  const MOVE_NOTICE37 = '[data-testid="move-notice"]';
  const GUEST_TEAM37 = [
    { slot: 0, hero_id: "hero_ma_chao" },
    { slot: 1, hero_id: "hero_zhao_yun" },
  ];
  /** 這一場、場上的武將與塔（標記、格子、數值、是否占用自己的格子）、進行中的移動、虛影與高亮 */
  const units37 = (p) =>
    p.evaluate(() => {
      const e = window.__testBridge.engine;
      const b = e.battleManager;
      const m = e.gameMap;
      const fs = b.firstStrikeUsed;
      return {
        battleId: b.battleId,
        state: b.gameState,
        wave: b.currentWave,
        paused: b.manualPaused,
        gold: b.battleGold,
        baseHp: b.baseHp,
        firstStrike:
          fs instanceof Map ? [...fs.entries()] : fs ? [...fs] : null,
        heroes: e.heroes.map((h) => ({
          id: h.heroId,
          mark: h.__mark || null,
          cell: [h.gridCell.col, h.gridCell.row],
          lv: h.heroLevel,
          atk: h.atk,
          def: h.defStat,
          hp: h.currentHp,
          max: h.maxHp,
          atkTimer: h.atkTimer,
          occ: m.getOccupant(h.gridCell.col, h.gridCell.row) === h,
        })),
        towers: e.towers.map((t) => ({
          uid: t.towerUid,
          mark: t.__mark || null,
          cell: [t.gridCell.col, t.gridCell.row],
          lv: t.towerLevel,
          invested: t.investedGold,
          refund: t.getSellRefund(),
          occ: m.getOccupant(t.gridCell.col, t.gridCell.row) === t,
        })),
        move: e.getMoveState(),
        ghost: !!e.dragGhost,
        highlight: e.highlightCell ? { ...e.highlightCell } : null,
      };
    });
  /** 某一格的占用者（標記）與能不能放武將、塔 */
  const cell37 = (p, [c, r]) =>
    p.evaluate(
      ({ c, r }) => {
        const m = window.__testBridge.engine.gameMap;
        const o = m.getOccupant(c, r);
        return {
          occupant: o ? o.__mark || "unmarked" : null,
          canHero: m.canPlaceHero(c, r),
          canTower: m.canPlaceTower(c, r),
        };
      },
      { c, r }
    );
  /** 場上的武將與塔標上「<tag>:<識別>」（分辨同 ID 的新實例） */
  const mark37 = (p, tag) =>
    p.evaluate((tg) => {
      const e = window.__testBridge.engine;
      e.heroes.forEach((h) => (h.__mark = `${tg}:${h.heroId}`));
      e.towers.forEach((t) => (t.__mark = `${tg}:${t.towerUid}`));
      return e.heroes.length + e.towers.length;
    }, tag);
  const panelSel37 = (kind) => (kind === "hero" ? HERO_INFO : UPGRADE_PANEL37);
  /** 面板上的「移動」按鈕：有沒有、是否停用、停用的說明 */
  async function moveBtn37(p, kind) {
    const b = p.locator(`[data-testid="${kind}-move"]`);
    const r = p.locator(`[data-testid="${kind}-move-blocked"]`);
    const n = await b.count();
    return {
      count: n,
      disabled: n ? await b.first().isDisabled() : null,
      reason: (await r.count()) ? (await r.innerText()).trim() : null,
    };
  }
  /** 點畫布上單位所在的格子，打開武將資訊或塔的升級面板，回報「移動」按鈕的狀態 */
  async function unitPanel37(p, kind, cell) {
    await settle37(p);
    const pt = await cellPoint(p, cell);
    if (!pt.onCanvas) return { ok: false, step: "cell", pt };
    await p.mouse.click(pt.x, pt.y);
    if (!(await until(() => p.locator(panelSel37(kind)).isVisible(), 5000)))
      return { ok: false, step: "panel" };
    return { ok: true, ...(await moveBtn37(p, kind)) };
  }
  async function closeUnitPanel37(p, kind) {
    const panel = p.locator(panelSel37(kind));
    if ((await panel.count()) === 0) return true;
    await panel
      .locator("button", { hasText: "×" })
      .first()
      .click()
      .catch(() => {});
    return !!(await until(async () => (await panel.count()) === 0, 5000));
  }
  const panelShown37 = async (p) => (await p.locator(MOVE_PANEL37).count()) > 0;
  /** 點單位 → 面板的「移動」（keyboard：焦點移到按鈕按 Enter）→ 等移位面板出現；回報標題、原面板是否關閉、目的格清單 */
  async function startMove37(p, kind, cell, { keyboard = false } = {}) {
    const btn = await unitPanel37(p, kind, cell);
    if (!btn.ok || btn.disabled !== false)
      return { ok: false, step: btn.ok ? "button" : btn.step, btn };
    const b = p.locator(`[data-testid="${kind}-move"]`).first();
    if (keyboard) {
      await b.focus();
      await p.keyboard.press("Enter");
    } else {
      await b.click();
    }
    if (!(await until(() => p.locator(MOVE_PANEL37).isVisible(), 5000)))
      return {
        ok: false,
        step: "move-panel",
        btn,
        notice: await text(p, MOVE_NOTICE37),
      };
    return {
      ok: true,
      btn,
      title: await text(p, '[data-testid="move-unit-title"]'),
      unitPanelClosed:
        (await p.locator(panelSel37(kind)).count()) === 0 &&
        (await p.locator(PLACEMENT_MENU).count()) === 0,
      options: await p
        .locator('[data-testid="move-target-select"] option')
        .evaluateAll((os) => os.map((o) => [o.value, o.textContent.trim()])),
    };
  }
  const option37 = (m, v) =>
    ((m && m.options) || []).find((o) => o[0] === v) || null;
  /** 移位中點畫布上的一格，等移位面板結束（移動或拒絕都會結束這次移動），回報說明 */
  async function dropAt37(p, cell) {
    await settle37(p);
    const pt = await cellPoint(p, cell);
    if (!pt.onCanvas) return { ok: false, step: "cell", pt };
    await p.mouse.click(pt.x, pt.y);
    const gone = await until(async () => !(await panelShown37(p)), 5000);
    return {
      ok: !!gone,
      notice: await text(p, MOVE_NOTICE37),
      menu: (await p.locator(PLACEMENT_MENU).count()) > 0,
      panels:
        (await p.locator(HERO_INFO).count()) +
        (await p.locator(UPGRADE_PANEL37).count()),
    };
  }
  /** 記下某個按鈕目前的 React onClick（之後受控呼叫，等同舊面板的按鈕晚一拍還能按） */
  const keepHandler37 = (p, sel, slot) =>
    p
      .locator(sel)
      .first()
      .evaluate((b, s) => {
        const k = Object.keys(b).find((x) => x.startsWith("__reactProps$"));
        if (!k || typeof b[k].onClick !== "function") return false;
        window.__kept37 = window.__kept37 || {};
        window.__kept37[s] = b[k].onClick;
        return true;
      }, slot)
      .catch(() => false);
  const callKept37 = (p, slot) =>
    p.evaluate((s) => {
      const f = window.__kept37 && window.__kept37[s];
      if (typeof f !== "function") return false;
      f();
      return true;
    }, slot);
  const writes37 = (E) => ({
    all: E.gas.writes().length,
    save: E.gas.count("save_profile"),
    upgrade: E.gas.count("upgrade_hero"),
    settle: E.gas.count("save_result"),
  });
  const NO_WRITES37 = { all: 0, save: 0, upgrade: 0, settle: 0 };

  await scenario(
    "移動武將與塔：訪客第 0 波（1280 桌面）點馬超 →「移動」→ 點道路格，同一個實例、免費，舊格可以再部署、新格不行；來回移動；塔移到另一個建築位；不合法的格子取消並說明；取消與 Esc",
    async (mk) => {
      const E = await mk({ maps: MOVE_MAPS37, enemies: [...ENEMIES, DUMMY] });
      const p = await E.page({
        storage: guestStorage([MA35, ZY35], GUEST_TEAM37),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, [4, 3], "馬超");
      const t1 = await buildTower(p, [2, 1], "弓兵塔");
      check(
        "部署馬超到 (4,3)、在建築位 (2,1) 建弓兵塔並標記",
        d1.ok && t1.ok && (await mark37(p, "m")) === 2,
        { d1, t1 }
      );
      const u0 = await units37(p);
      const st0 = await storageOf(p);
      const m1 = await startMove37(p, "hero", [4, 3]);
      check(
        "點馬超打開武將資訊：「移動」可以按、沒有說明；按下後武將資訊關閉，出現「移動武將：馬超」",
        m1.ok &&
          m1.btn.disabled === false &&
          m1.btn.reason === null &&
          m1.title === "移動武將：馬超" &&
          m1.unitPanelClosed,
        m1
      );
      check(
        "目的格清單：第一格是「第 2 列、第 5 欄（建築位）」，有「第 4 列、第 9 欄（道路）」；沒有原格 (4,3)、塔占的 (2,1) 與一般地形 (0,0)",
        sameJson(m1.options[1], ["4,1", "第 2 列、第 5 欄（建築位）"]) &&
          sameJson(option37(m1, "8,3"), ["8,3", "第 4 列、第 9 欄（道路）"]) &&
          !option37(m1, "4,3") &&
          !option37(m1, "2,1") &&
          !option37(m1, "0,0"),
        m1.options
      );
      const r1 = await dropAt37(p, [8, 3]);
      const u1 = await units37(p);
      const strip = (h) => h && { ...h, cell: null };
      check(
        "點畫布上的 (8,3)：移位結束、沒有說明、沒有打開部署選單或面板；同一個馬超（標記不變）在 (8,3) 並占用，等級、攻防、生命與攻擊冷卻不變",
        r1.ok &&
          r1.notice === null &&
          !r1.menu &&
          r1.panels === 0 &&
          u1.heroes.length === 1 &&
          u1.heroes[0].mark === "m:hero_ma_chao" &&
          sameJson(u1.heroes[0].cell, [8, 3]) &&
          u1.heroes[0].occ &&
          sameJson(strip(u1.heroes[0]), strip(u0.heroes[0])),
        { r1, before: u0.heroes, after: u1.heroes }
      );
      check(
        "免費：戰場金幣、城防、首擊紀錄、battleId、備戰第 0 波與塔都不變；沒有進行中的移動與虛影",
        u1.gold === u0.gold &&
          u1.baseHp === u0.baseHp &&
          sameJson(u1.firstStrike, u0.firstStrike) &&
          u1.battleId === u0.battleId &&
          u1.state === 1 &&
          u1.wave === 0 &&
          sameJson(u1.towers, u0.towers) &&
          u1.move === null &&
          u1.ghost === false,
        { u0, u1 }
      );
      const c1 = await menuCard(p, [4, 3], "趙雲");
      check(
        "舊格 (4,3) 已放開：點它打開部署選單，趙雲可以派",
        c1.ok && c1.disabled === false,
        c1
      );
      const c0 = await menuCard(p, [4, 3], "馬超");
      check(
        "移動後部署選單上的馬超仍是「已在場上」（停用，名單沒有重設）",
        c0.ok && c0.disabled === true,
        c0
      );
      const n1 = await cell37(p, [8, 3]);
      const i1 = await unitPanel37(p, "hero", [8, 3]);
      check(
        "新格 (8,3) 不能部署：占用者是馬超，點它打開的是馬超的武將資訊，不是部署選單",
        n1.occupant === "m:hero_ma_chao" &&
          n1.canHero === false &&
          i1.ok &&
          (await p.locator(PLACEMENT_MENU).count()) === 0 &&
          /馬超/.test((await text(p, HERO_INFO)) || ""),
        { n1, i1 }
      );
      await closeUnitPanel37(p, "hero");
      const m2 = await startMove37(p, "hero", [8, 3]);
      const r2 = m2.ok ? await dropAt37(p, [4, 3]) : null;
      const u2 = await units37(p);
      check(
        "再移回 (4,3)：同一個馬超回到原格並占用，(8,3) 放開",
        m2.ok &&
          !!r2 &&
          r2.ok &&
          r2.notice === null &&
          u2.heroes[0].mark === "m:hero_ma_chao" &&
          sameJson(u2.heroes[0].cell, [4, 3]) &&
          u2.heroes[0].occ &&
          (await cell37(p, [8, 3])).occupant === null,
        { m2, r2, heroes: u2.heroes }
      );
      const m3 = await startMove37(p, "tower", [2, 1]);
      check(
        "點弓兵塔打開升級面板：「移動」可以按；按下後升級面板關閉，出現「移動防禦塔：弓兵塔」，目的格只有空的建築位 (4,1)、(6,1)",
        m3.ok &&
          m3.btn.disabled === false &&
          m3.btn.reason === null &&
          m3.title === "移動防禦塔：弓兵塔" &&
          m3.unitPanelClosed &&
          sameJson(
            m3.options.slice(1).map((o) => o[0]),
            ["4,1", "6,1"]
          ),
        m3
      );
      const r3 = m3.ok ? await dropAt37(p, [6, 1]) : null;
      const u3 = await units37(p);
      check(
        "點 (6,1)：同一座塔（標記、識別碼、等級、投入、拆除返還不變）移到 (6,1) 並占用，(2,1) 放開可以再建塔；戰場金幣不變",
        !!r3 &&
          r3.ok &&
          r3.notice === null &&
          u3.towers.length === 1 &&
          sameJson(u3.towers[0].cell, [6, 1]) &&
          u3.towers[0].occ &&
          sameJson(strip(u3.towers[0]), strip(u0.towers[0])) &&
          (await cell37(p, [2, 1])).canTower === true &&
          u3.gold === u0.gold,
        { r3, before: u0.towers, after: u3.towers }
      );
      const m4 = await startMove37(p, "tower", [6, 1]);
      const r4 = m4.ok ? await dropAt37(p, [8, 3]) : null;
      check(
        "塔點道路格 (8,3)：不移動、結束這次移動，說明「那一格不能放，已取消移動。」",
        m4.ok &&
          !!r4 &&
          r4.ok &&
          r4.notice === "那一格不能放，已取消移動。" &&
          sameJson((await units37(p)).towers[0].cell, [6, 1]),
        { m4, r4 }
      );
      const m5 = await startMove37(p, "hero", [4, 3]);
      const r5 = m5.ok ? await dropAt37(p, [6, 1]) : null;
      check(
        "武將點塔占的建築位 (6,1)：不移動，說明「那一格已經有單位，已取消移動。」",
        m5.ok &&
          !!r5 &&
          r5.ok &&
          r5.notice === "那一格已經有單位，已取消移動。" &&
          sameJson((await units37(p)).heroes[0].cell, [4, 3]),
        { m5, r5 }
      );
      const m6 = await startMove37(p, "hero", [4, 3]);
      const r6 = m6.ok ? await dropAt37(p, [4, 3]) : null;
      check(
        "點原格 (4,3)：不移動，說明「那是原本的格子，已取消移動。」",
        m6.ok &&
          !!r6 &&
          r6.ok &&
          r6.notice === "那是原本的格子，已取消移動。" &&
          sameJson((await units37(p)).heroes[0].cell, [4, 3]),
        { m6, r6 }
      );
      const m7 = await startMove37(p, "hero", [4, 3]);
      await p.locator('[data-testid="move-cancel"]').click();
      const g7 = await until(async () => !(await panelShown37(p)), 5000);
      const u7 = await units37(p);
      check(
        "按「取消」：移位面板關閉、沒有說明、沒有移動、引擎沒有進行中的移動與虛影",
        m7.ok &&
          !!g7 &&
          (await text(p, MOVE_NOTICE37)) === null &&
          sameJson(u7.heroes[0].cell, [4, 3]) &&
          u7.move === null &&
          u7.ghost === false,
        { m7, u7 }
      );
      const m8 = await startMove37(p, "tower", [6, 1]);
      await p.keyboard.press("Escape");
      const g8 = await until(async () => !(await panelShown37(p)), 5000);
      const u8 = await units37(p);
      check(
        "按 Esc：移位面板關閉、沒有移動、引擎沒有進行中的移動",
        m8.ok &&
          !!g8 &&
          sameJson(u8.towers[0].cell, [6, 1]) &&
          u8.move === null &&
          u8.ghost === false,
        { m8, u8 }
      );
      const st1 = await storageOf(p);
      check(
        "整段移動前後：localStorage／sessionStorage 逐字不變，沒有任何存檔、升級、結算的寫入",
        sameJson(st1, st0) && sameJson(writes37(E), NO_WRITES37),
        { st0, st1, writes: writes37(E) }
      );
      return E;
    }
  );

  await scenario(
    "移動武將與塔：戰鬥中停用；清波後的備戰（390×600、鍵盤）可以移動；暫停中停用，移位中暫停或開戰就取消；結算後晚到的「移動」不開始",
    async (mk) => {
      const E = await mk({
        maps: MOVE_MAPS37,
        enemies: [...ENEMIES, DUMMY],
        viewport: { width: 390, height: 600 },
      });
      const p = await E.page({
        storage: guestStorage([MA35, ZY35], GUEST_TEAM37),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, [4, 3], "馬超");
      const t1 = await buildTower(p, [2, 1], "弓兵塔");
      check(
        "部署馬超到 (4,3)、在 (2,1) 建弓兵塔並標記",
        d1.ok && t1.ok && (await mark37(p, "m")) === 2,
        { d1, t1 }
      );
      check("開第 1 波", await startBattle(p));
      const b1 = await unitPanel37(p, "hero", [4, 3]);
      await closeUnitPanel37(p, "hero");
      const b2 = await unitPanel37(p, "tower", [2, 1]);
      await closeUnitPanel37(p, "tower");
      const BATTLE_TEXT = "只有備戰時可以移動（戰鬥中不能移動）。";
      check(
        "戰鬥中：武將資訊與升級面板的「移動」都停用，說明「只有備戰時可以移動（戰鬥中不能移動）。」",
        b1.ok &&
          b1.disabled === true &&
          b1.reason === BATTLE_TEXT &&
          b2.ok &&
          b2.disabled === true &&
          b2.reason === BATTLE_TEXT,
        { b1, b2 }
      );
      await forceWaveClear(p);
      await sleep(1200);
      const u0 = await units37(p);
      check(
        "受控清波回到備戰（第 1 波之後）",
        u0.state === 1 && u0.wave === 1,
        u0
      );
      const st0 = await storageOf(p);
      const m1 = await startMove37(p, "hero", [4, 3], { keyboard: true });
      check(
        "鍵盤：焦點移到「移動」按 Enter，出現「移動武將：馬超」",
        m1.ok && m1.title === "移動武將：馬超",
        m1
      );
      const sel = p.locator('[data-testid="move-target-select"]');
      await sel.focus();
      await p.keyboard.press("ArrowDown");
      await sleep(300);
      const picked = await sel.inputValue();
      const hl = (await units37(p)).highlight;
      await p.keyboard.press("Tab");
      const onConfirm = await p
        .locator('[data-testid="move-confirm"]')
        .evaluate((b) => document.activeElement === b);
      await p.keyboard.press("Enter");
      const g1 = await until(async () => !(await panelShown37(p)), 5000);
      const u1 = await units37(p);
      check(
        "鍵盤：在目的格清單按 ↓ 選到「第 2 列、第 5 欄（建築位）」（畫布上綠色預覽），Tab 到「確認移動」按 Enter：同一個馬超移到 (4,1)",
        picked === "4,1" &&
          sameJson(hl, { col: 4, row: 1, valid: true }) &&
          onConfirm &&
          !!g1 &&
          u1.heroes[0].mark === "m:hero_ma_chao" &&
          sameJson(u1.heroes[0].cell, [4, 1]) &&
          u1.heroes[0].occ &&
          (await cell37(p, [4, 3])).occupant === null,
        { picked, hl, onConfirm, heroes: u1.heroes }
      );
      const layout = await p.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      check("390 寬沒有橫向捲動", layout.scrollW <= layout.clientW, layout);
      const m2 = await startMove37(p, "tower", [2, 1], { keyboard: true });
      await p.keyboard.press("Escape");
      const g2 = await until(async () => !(await panelShown37(p)), 5000);
      check(
        "鍵盤 Esc：塔的移位關閉、沒有移動",
        m2.ok &&
          !!g2 &&
          sameJson((await units37(p)).towers[0].cell, [2, 1]) &&
          (await units37(p)).move === null,
        m2
      );
      const m3 = await startMove37(p, "tower", [2, 1]);
      const r3 = m3.ok ? await dropAt37(p, [6, 1]) : null;
      const u3 = await units37(p);
      check(
        "清波後的備戰：塔（同一座）移到 (6,1)，投入與等級不變",
        !!r3 &&
          r3.ok &&
          r3.notice === null &&
          sameJson(u3.towers[0].cell, [6, 1]) &&
          sameJson(
            { ...u3.towers[0], cell: null },
            { ...u0.towers[0], cell: null }
          ),
        { r3, before: u0.towers, after: u3.towers }
      );
      check("一般 UI 暫停", await pauseHud(p));
      const b3 = await unitPanel37(p, "hero", [4, 1]);
      await closeUnitPanel37(p, "hero");
      const b4 = await unitPanel37(p, "tower", [6, 1]);
      await closeUnitPanel37(p, "tower");
      check(
        "暫停中：武將與塔的「移動」都停用，說明「暫停中不能移動。」",
        b3.ok &&
          b3.disabled === true &&
          b3.reason === "暫停中不能移動。" &&
          b4.ok &&
          b4.disabled === true &&
          b4.reason === "暫停中不能移動。",
        { b3, b4 }
      );
      check("一般 UI 繼續", await resumeHud(p));
      const m5 = await startMove37(p, "hero", [4, 1]);
      check("一般 UI 暫停（移位中）", m5.ok && (await pauseHud(p)), m5);
      const g5 = await until(async () => !(await panelShown37(p)), 5000);
      const u5 = await units37(p);
      check(
        "移位中暫停：移位面板關閉，說明「移動已取消：不在備戰、暫停了，或場上已經改變。」，馬超沒有移動",
        !!g5 &&
          (await text(p, MOVE_NOTICE37)) === INVALIDATED37 &&
          sameJson(u5.heroes[0].cell, [4, 1]) &&
          u5.move === null,
        { u5, notice: await text(p, MOVE_NOTICE37) }
      );
      check("一般 UI 繼續", await resumeHud(p));
      const m6 = await startMove37(p, "tower", [6, 1]);
      await p.locator('[data-testid="hud-start-battle"]').click();
      const g6 = await until(async () => !(await panelShown37(p)), 5000);
      const u6 = await units37(p);
      check(
        "移位中按「迎戰」：進入第 2 波戰鬥，移位面板關閉並說明已取消，塔沒有移動",
        m6.ok &&
          !!g6 &&
          u6.state === 2 &&
          (await text(p, MOVE_NOTICE37)) === INVALIDATED37 &&
          sameJson(u6.towers[0].cell, [6, 1]) &&
          u6.move === null,
        { m6, u6 }
      );
      const st1 = await storageOf(p);
      check(
        "清波後到開戰的移動前後：瀏覽器儲存逐字不變，沒有任何寫入",
        sameJson(st1, st0) && sameJson(writes37(E), NO_WRITES37),
        { st0, st1, writes: writes37(E) }
      );
      const i7 = await unitPanel37(p, "hero", [4, 1]);
      const kept =
        i7.ok && (await keepHandler37(p, '[data-testid="hero-move"]', "late"));
      check("受控勝利結束", (await endWith(p, { win: true })) === "ok");
      await sleep(1500);
      const closed = (await p.locator(HERO_INFO).count()) === 0;
      const called = kept && (await callKept37(p, "late"));
      await sleep(400);
      const u7 = await units37(p);
      check(
        "結算後（武將資訊已關閉）受控呼叫晚到的「移動」onClick：不開始移動，說明「只有備戰時可以移動。」，馬超不動",
        closed &&
          called &&
          !(await panelShown37(p)) &&
          u7.move === null &&
          (await text(p, MOVE_NOTICE37)) === "只有備戰時可以移動。" &&
          sameJson(u7.heroes[0].cell, [4, 1]),
        { kept, closed, called, u7, notice: await text(p, MOVE_NOTICE37) }
      );
      return E;
    }
  );

  await scenario(
    "移動武將與塔：共用帳號甲清波後移位中切換到乙，舊場的武將移動取消、之後停用（受控呼叫也不開始），塔照常；切回甲（新的世代）仍不能移動武將；沒有任何寫入",
    async (mk) => {
      const A = "k_m37_a";
      const B = "k_m37_b";
      const E = await mk({
        seed: [
          {
            key: A,
            data: NEW({
              nickname: "甲",
              capacity: 20,
              team: [{ hero_id: "ma_chao", slot: 1 }],
            }),
            rev: 2,
          },
          {
            key: B,
            data: NEW({
              nickname: "乙",
              capacity: 20,
              team: [{ hero_id: "huang_zhong", slot: 1 }],
            }),
            rev: 5,
          },
        ],
        maps: MOVE_MAPS37,
        enemies: [...ENEMIES, DUMMY],
      });
      const p = await E.page({ storage: { shenma_player_key: A } });
      check("讀到甲", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, [4, 3], "馬超");
      const t1 = await buildTower(p, [2, 1], "弓兵塔");
      check(
        "部署甲的馬超、建弓兵塔並標記",
        d1.ok && t1.ok && (await mark37(p, "m")) === 2,
        { d1, t1 }
      );
      check("開第 1 波", await startBattle(p));
      await forceWaveClear(p);
      await sleep(1200);
      const u0 = await units37(p);
      check(
        "受控清波回到備戰（第 1 波之後）",
        u0.state === 1 && u0.wave === 1,
        u0
      );
      const m1 = await startMove37(p, "hero", [4, 3]);
      check("甲自己的這一場：清波後可以開始移動馬超", m1.ok, m1);
      check("移位中一般 UI 切換金鑰到乙", await switchKey(p, B, "乙"));
      await sleep(800);
      const u1 = await units37(p);
      check(
        "切換到乙：移位面板關閉，說明「這一場是換帳號前的出征，不能移動武將。」，馬超沒有移動、引擎沒有進行中的移動；同一場沒有重新載入",
        !(await panelShown37(p)) &&
          (await text(p, MOVE_NOTICE37)) === HERO_MOVE_BLOCKED37 &&
          sameJson(u1.heroes[0].cell, [4, 3]) &&
          u1.heroes[0].mark === "m:hero_ma_chao" &&
          u1.move === null &&
          u1.battleId === u0.battleId,
        { u1, notice: await text(p, MOVE_NOTICE37) }
      );
      const b1 = await unitPanel37(p, "hero", [4, 3]);
      check(
        "乙的畫面上點甲的馬超：「移動」停用並說明換帳號前的出征",
        b1.ok && b1.disabled === true && b1.reason === HERO_MOVE_BLOCKED37,
        b1
      );
      const kept = await keepHandler37(p, '[data-testid="hero-move"]', "acct");
      const called = kept && (await callKept37(p, "acct"));
      await sleep(400);
      const u2 = await units37(p);
      check(
        "受控呼叫停用的「移動」onClick：不開始移動（沒有移位面板、引擎沒有進行中的移動），說明換帳號前的出征",
        called &&
          !(await panelShown37(p)) &&
          u2.move === null &&
          (await text(p, MOVE_NOTICE37)) === HERO_MOVE_BLOCKED37 &&
          sameJson(u2.heroes[0].cell, [4, 3]),
        { kept, called, u2 }
      );
      await closeUnitPanel37(p, "hero");
      const m2 = await startMove37(p, "tower", [2, 1]);
      const r2 = m2.ok ? await dropAt37(p, [6, 1]) : null;
      const u3 = await units37(p);
      check(
        "塔照常（塔不屬於帳號）：「移動」可以按，同一座塔移到 (6,1)",
        m2.ok &&
          m2.btn.reason === null &&
          !!r2 &&
          r2.ok &&
          r2.notice === null &&
          u3.towers[0].mark === u0.towers[0].mark &&
          sameJson(u3.towers[0].cell, [6, 1]),
        { m2, r2, towers: u3.towers }
      );
      check(
        "一般 UI 切回甲（同一把金鑰、新的世代）",
        await switchKey(p, A, "甲")
      );
      await sleep(800);
      const b2 = await unitPanel37(p, "hero", [4, 3]);
      await closeUnitPanel37(p, "hero");
      check(
        "切回甲之後：馬超的「移動」仍停用並說明（新的世代不算這一場的來源）",
        b2.ok && b2.disabled === true && b2.reason === HERO_MOVE_BLOCKED37,
        b2
      );
      check(
        "沒有任何存檔、升級、結算的寫入",
        sameJson(writes37(E), NO_WRITES37),
        { writes: writes37(E), actions: E.gas.writes().map((w) => w.action) }
      );
      return E;
    }
  );

  await scenario(
    "移動武將與塔：移位中選關換成新的一場（移動取消）；新的一場派同 ID 的馬超，舊面板晚到的「確認移動」與「移動」都不動新的馬超或新的移動；之後照常移動",
    async (mk) => {
      const E = await mk({ maps: MOVE_MAPS37, enemies: [...ENEMIES, DUMMY] });
      const p = await E.page({
        storage: guestStorage([MA35, ZY35], GUEST_TEAM37, {
          max_stage: "chapter1_2",
          cleared_stages: { chapter1_1: 3 },
        }),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, [4, 3], "馬超");
      check(
        "部署馬超到 (4,3) 並標記為舊實例",
        d1.ok && (await mark37(p, "old")) === 1,
        d1
      );
      const stA0 = await storageOf(p);
      const o1 = await unitPanel37(p, "hero", [4, 3]);
      const keptMove =
        o1.ok &&
        (await keepHandler37(p, '[data-testid="hero-move"]', "oldMove"));
      await p.locator('[data-testid="hero-move"]').first().click();
      const shown1 = await until(
        () => p.locator(MOVE_PANEL37).isVisible(),
        5000
      );
      await p.locator('[data-testid="move-target-select"]').selectOption("8,3");
      const keptConfirm = await keepHandler37(
        p,
        '[data-testid="move-confirm"]',
        "oldConfirm"
      );
      const u0 = await units37(p);
      check(
        "舊的一場：開始移動馬超、選好 (8,3)，記下「移動」與「確認移動」的 onClick",
        !!shown1 &&
          keptMove &&
          keptConfirm &&
          !!u0.move &&
          sameJson(u0.highlight, { col: 8, row: 3, valid: true }),
        { o1, keptMove, keptConfirm, move: u0.move }
      );
      const bid0 = u0.battleId;
      const stA1 = await storageOf(p);
      await p.locator('button[title="切換關卡"]').click();
      await until(() => modal(p).isVisible(), 10000);
      const go = modal(p)
        .locator(".card", { hasText: "接線測試第2關" })
        .locator("button", { hasText: "開赴戰場" });
      check("選關視窗有第 2 關的「開赴戰場」", (await go.count()) === 1);
      await go.first().click();
      await until(async () => (await modal(p).count()) === 0, 10000);
      const bid1 = await nextBattle(p, bid0);
      const u1 = await units37(p);
      check(
        "選關換成新的一場：舊的移動取消（移位面板關閉、說明已取消），新的一場沒有進行中的移動、場上沒有武將",
        !!bid1 &&
          !(await panelShown37(p)) &&
          (await text(p, MOVE_NOTICE37)) === INVALIDATED37 &&
          u1.move === null &&
          u1.heroes.length === 0,
        { bid0, bid1, u1, notice: await text(p, MOVE_NOTICE37) }
      );
      const d2 = await deployHero(p, [4, 3], "馬超");
      check(
        "新的一場在同一格 (4,3) 派同 ID 的馬超，標記為新實例",
        d2.ok && (await mark37(p, "new")) === 1,
        d2
      );
      const stB0 = await storageOf(p);
      const c1 = await callKept37(p, "oldConfirm");
      await sleep(400);
      const u2 = await units37(p);
      check(
        "受控呼叫舊面板的「確認移動」：新的馬超不動、沒有開始任何移動",
        c1 &&
          u2.move === null &&
          !(await panelShown37(p)) &&
          u2.heroes[0].mark === "new:hero_ma_chao" &&
          sameJson(u2.heroes[0].cell, [4, 3]),
        { c1, u2 }
      );
      const m2 = await startMove37(p, "hero", [4, 3]);
      const id2 = m2.ok ? (await units37(p)).move : null;
      const c2 = await callKept37(p, "oldConfirm");
      await sleep(400);
      const u3 = await units37(p);
      check(
        "新的一場正在移動新的馬超時，再受控呼叫舊面板的「確認移動」（舊的移動編號）：新的移動仍在、移位面板還在，新的馬超不動",
        m2.ok &&
          !!id2 &&
          id2.battleId === bid1 &&
          c2 &&
          sameJson(u3.move, id2) &&
          (await panelShown37(p)) &&
          sameJson(u3.heroes[0].cell, [4, 3]),
        { id2, c2, u3 }
      );
      await p.locator('[data-testid="move-cancel"]').click();
      await until(async () => !(await panelShown37(p)), 5000);
      const c3 = await callKept37(p, "oldMove");
      await sleep(400);
      const u4 = await units37(p);
      check(
        "受控呼叫舊的一場武將資訊的「移動」（舊的馬超實例）：不開始移動，說明「請重新點選要移動的單位。」",
        c3 &&
          u4.move === null &&
          !(await panelShown37(p)) &&
          (await text(p, MOVE_NOTICE37)) === RESELECT37 &&
          sameJson(u4.heroes[0].cell, [4, 3]),
        { c3, u4, notice: await text(p, MOVE_NOTICE37) }
      );
      const m5 = await startMove37(p, "hero", [4, 3]);
      const r5 = m5.ok ? await dropAt37(p, [8, 3]) : null;
      const u5 = await units37(p);
      check(
        "之後照常：新的馬超移到 (8,3)（同一個新實例）",
        !!r5 &&
          r5.ok &&
          r5.notice === null &&
          u5.heroes[0].mark === "new:hero_ma_chao" &&
          sameJson(u5.heroes[0].cell, [8, 3]) &&
          u5.heroes[0].occ,
        { m5, r5, heroes: u5.heroes }
      );
      const stB1 = await storageOf(p);
      check(
        "兩段移動操作（舊的一場、新的一場）前後：瀏覽器儲存逐字不變，沒有任何寫入",
        sameJson(stA1, stA0) &&
          sameJson(stB1, stB0) &&
          sameJson(writes37(E), NO_WRITES37),
        { stA0, stA1, stB0, stB1, writes: writes37(E) }
      );
      return E;
    }
  );

  // 同一個實例重新打開面板（R100-1）：一般 UI 點選、移動、重開都是正常操作；「受控呼叫」是保留第一次面板按鈕的 React onClick 之後直接呼叫
  // （等同舊面板的按鈕晚一拍還能按），只用在負向，不算自然競態
  /** 保留面板上 × 按鈕的 React onClick（關閉） */
  const keepClose37 = (p, kind, slot) =>
    p
      .locator(panelSel37(kind))
      .locator("button", { hasText: "×" })
      .first()
      .evaluate((b, s) => {
        const k = Object.keys(b).find((x) => x.startsWith("__reactProps$"));
        if (!k || typeof b[k].onClick !== "function") return false;
        window.__kept37 = window.__kept37 || {};
        window.__kept37[s] = b[k].onClick;
        return true;
      }, slot)
      .catch(() => false);
  /** 引擎目前的虛影（移位中才有） */
  const ghost37 = (p) =>
    p.evaluate(() => {
      const g = window.__testBridge.engine.dragGhost;
      return g ? { type: g.type, name: g.name, x: g.x, y: g.y } : null;
    });
  /** 鍵盤選目的格：焦點到目的格清單按 ↓ 選第一格，Tab 到「確認移動」按 Enter，等移位面板結束 */
  async function kbConfirm37(p) {
    const sel = p.locator('[data-testid="move-target-select"]');
    await sel.focus();
    await p.keyboard.press("ArrowDown");
    await sleep(300);
    const picked = await sel.inputValue();
    await p.keyboard.press("Tab");
    const onConfirm = await p
      .locator('[data-testid="move-confirm"]')
      .evaluate((b) => document.activeElement === b);
    await p.keyboard.press("Enter");
    const gone = await until(async () => !(await panelShown37(p)), 5000);
    return { picked, onConfirm, ok: !!gone };
  }
  /** 等畫布的位置、大小與格子大小連續幾次讀到都一樣（面板開關讓捲軸出現或消失時，頁面會重新調整畫布；調整完才算座標） */
  async function settle37(p) {
    let last = null;
    let same = 0;
    await until(async () => {
      const g = await p.evaluate(() => {
        const e = window.__testBridge.engine;
        const r = e.canvas.getBoundingClientRect();
        return [r.left, r.top, r.width, r.height, e.gameMap.tileSize].join(",");
      });
      same = g === last ? same + 1 : 0;
      last = g;
      return same >= 3;
    }, 5000);
    return last;
  }
  const panel37s = async (p, kind, cell) => (
    await settle37(p), unitPanel37(p, kind, cell)
  );
  const drop37s = async (p, cell) => (await settle37(p), dropAt37(p, cell));
  const start37s = async (p, kind, cell, opts) => (
    await settle37(p), startMove37(p, kind, cell, opts)
  );
  /** 第一次面板的「移動」晚到（受控）前後要相同的：引擎的移動、虛影、移位面板標題、場上武將與塔 */
  const live37 = async (p) => {
    const u = await units37(p);
    return {
      move: u.move,
      ghost: await ghost37(p),
      panel: await text(p, '[data-testid="move-unit-title"]'),
      heroes: u.heroes,
      towers: u.towers,
    };
  };

  await scenario(
    "移動武將與塔：同一實例重開面板（1280 桌面）：第一次面板的「移動」晚到不影響新的移動；關閉後、開始成功後重播都不開始；舊面板的關閉不關新面板（武將與塔）",
    async (mk) => {
      const E = await mk({ maps: MOVE_MAPS37, enemies: [...ENEMIES, DUMMY] });
      const p = await E.page({
        storage: guestStorage([MA35, ZY35], GUEST_TEAM37),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, [4, 3], "馬超");
      const t1 = await buildTower(p, [2, 1], "弓兵塔");
      check(
        "部署馬超到 (4,3)、在 (2,1) 建弓兵塔並標記",
        d1.ok && t1.ok && (await mark37(p, "m")) === 2,
        { d1, t1 }
      );
      const st0 = await storageOf(p);
      for (const [kind, L, A, Bc, Cc] of [
        ["hero", "武將", [4, 3], [8, 3], [10, 3]],
        ["tower", "塔", [2, 1], [4, 1], [6, 1]],
      ]) {
        const o1 = await panel37s(p, kind, A);
        const kept =
          o1.ok &&
          (await keepHandler37(p, `[data-testid="${kind}-move"]`, `${kind}1`));
        await p.locator(`[data-testid="${kind}-move"]`).first().click();
        const shown1 = await until(
          () => p.locator(MOVE_PANEL37).isVisible(),
          5000
        );
        const r1 = shown1 ? await drop37s(p, Bc) : null;
        const u1 = await units37(p);
        const at1 = kind === "hero" ? u1.heroes[0].cell : u1.towers[0].cell;
        check(
          `${L}：第一次面板（保留它的「移動」onClick）照常移到 (${Bc})`,
          kept && !!r1 && r1.ok && r1.notice === null && sameJson(at1, Bc),
          { o1, kept, r1, at1 }
        );
        const m2 = await start37s(p, kind, Bc);
        const before = await live37(p);
        const called = await callKept37(p, `${kind}1`);
        await sleep(400);
        const after = await live37(p);
        check(
          `${L}：同一實例在 (${Bc}) 重開面板並開始新的移動後，受控呼叫第一次面板的「移動」→ 新的移動編號、來源格、虛影與移位面板都不變，場上不動`,
          m2.ok &&
            called &&
            !!before.move &&
            sameJson(before.move.from, { col: Bc[0], row: Bc[1] }) &&
            !!before.ghost &&
            sameJson(after, before),
          { m2, called, before, after }
        );
        const r2 = await drop37s(p, Cc);
        const u2 = await units37(p);
        const at2 = kind === "hero" ? u2.heroes[0].cell : u2.towers[0].cell;
        check(
          `${L}：新的移動之後照常完成，同一個實例到 (${Cc})`,
          r2.ok && r2.notice === null && sameJson(at2, Cc) && u2.move === null,
          { r2, at2 }
        );
        // 關閉後重播
        const o3 = await panel37s(p, kind, Cc);
        const k3 =
          o3.ok &&
          (await keepHandler37(p, `[data-testid="${kind}-move"]`, `${kind}3`));
        const closed3 = await closeUnitPanel37(p, kind);
        const called3 = k3 && (await callKept37(p, `${kind}3`));
        await sleep(400);
        const u3 = await units37(p);
        const at3 = kind === "hero" ? u3.heroes[0].cell : u3.towers[0].cell;
        check(
          `${L}：關閉面板後受控呼叫它的「移動」→ 不開始移動（沒有移位面板、引擎沒有移動），說明「請重新點選要移動的單位。」，單位不動`,
          closed3 &&
            called3 &&
            !(await panelShown37(p)) &&
            u3.move === null &&
            (await text(p, MOVE_NOTICE37)) === RESELECT37 &&
            sameJson(at3, Cc),
          { closed3, called3, u3, notice: await text(p, MOVE_NOTICE37) }
        );
        // 開始成功後重播
        const o4 = await panel37s(p, kind, Cc);
        const k4 =
          o4.ok &&
          (await keepHandler37(p, `[data-testid="${kind}-move"]`, `${kind}4`));
        await p.locator(`[data-testid="${kind}-move"]`).first().click();
        const shown4 = await until(
          () => p.locator(MOVE_PANEL37).isVisible(),
          5000
        );
        const before4 = await live37(p);
        const called4 = k4 && (await callKept37(p, `${kind}4`));
        await sleep(400);
        const after4 = await live37(p);
        check(
          `${L}：「移動」開始成功後受控重播同一個 onClick → 不再開始，移動編號、虛影與移位面板不變`,
          !!shown4 && called4 && !!before4.move && sameJson(after4, before4),
          { shown4, called4, before4, after4 }
        );
        await p.locator('[data-testid="move-cancel"]').click();
        await until(async () => !(await panelShown37(p)), 5000);
        // 舊面板的關閉晚到
        const o5 = await panel37s(p, kind, Cc);
        const k5 = o5.ok && (await keepClose37(p, kind, `${kind}5`));
        await closeUnitPanel37(p, kind);
        const o6 = await panel37s(p, kind, Cc);
        const called5 = k5 && (await callKept37(p, `${kind}5`));
        await sleep(400);
        const stillOpen = await p.locator(panelSel37(kind)).isVisible();
        const m6 = o6.ok && stillOpen;
        if (m6) await p.locator(`[data-testid="${kind}-move"]`).first().click();
        const shown6 = await until(
          () => p.locator(MOVE_PANEL37).isVisible(),
          5000
        );
        const u6 = await units37(p);
        check(
          `${L}：受控呼叫已關閉的舊面板的關閉 → 不關重開的新面板；新面板的「移動」照常開始（目前的面板正向）`,
          called5 &&
            stillOpen &&
            !!shown6 &&
            !!u6.move &&
            sameJson(u6.move.from, { col: Cc[0], row: Cc[1] }),
          { k5, called5, stillOpen, shown6, move: u6.move }
        );
        await p.locator('[data-testid="move-cancel"]').click();
        await until(async () => !(await panelShown37(p)), 5000);
        // 新面板還沒按「移動」時，舊面板的「移動」晚到
        const o7 = await panel37s(p, kind, Cc);
        const k7 =
          o7.ok &&
          (await keepHandler37(p, `[data-testid="${kind}-move"]`, `${kind}7`));
        await closeUnitPanel37(p, kind);
        const o8 = await panel37s(p, kind, Cc);
        const called7 = k7 && (await callKept37(p, `${kind}7`));
        await sleep(400);
        const u7 = await units37(p);
        const stale7 = {
          moveShown: await panelShown37(p),
          move: u7.move,
          panelOpen: await p.locator(panelSel37(kind)).isVisible(),
        };
        if (stale7.panelOpen)
          await p.locator(`[data-testid="${kind}-move"]`).first().click();
        const shown8 = await until(
          () => p.locator(MOVE_PANEL37).isVisible(),
          5000
        );
        const u8 = await units37(p);
        check(
          `${L}：關閉後重開的新面板還沒按「移動」時，受控呼叫舊面板的「移動」→ 不開始移動、新面板還開著；之後按新面板的「移動」照常開始`,
          o8.ok &&
            called7 &&
            !stale7.moveShown &&
            stale7.move === null &&
            stale7.panelOpen &&
            !!shown8 &&
            !!u8.move &&
            sameJson(u8.move.from, { col: Cc[0], row: Cc[1] }),
          { o8, called7, stale7, shown8, move: u8.move }
        );
        await p.locator('[data-testid="move-cancel"]').click();
        await until(async () => !(await panelShown37(p)), 5000);
      }
      const st1 = await storageOf(p);
      check(
        "整段前後：瀏覽器儲存逐字不變，沒有任何存檔、升級、結算的寫入",
        sameJson(st1, st0) && sameJson(writes37(E), NO_WRITES37),
        { st0, st1, writes: writes37(E) }
      );
      return E;
    }
  );

  await scenario(
    "移動武將與塔：同一實例重開面板（390×600 鍵盤）：鍵盤開始與確認，第一次面板的「移動」晚到不影響新的移動（武將與塔）",
    async (mk) => {
      const E = await mk({
        maps: MOVE_MAPS37,
        enemies: [...ENEMIES, DUMMY],
        viewport: { width: 390, height: 600 },
      });
      const p = await E.page({
        storage: guestStorage([MA35, ZY35], GUEST_TEAM37),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      const d1 = await deployHero(p, [4, 3], "馬超");
      const t1 = await buildTower(p, [2, 1], "弓兵塔");
      check(
        "部署馬超到 (4,3)、在 (2,1) 建弓兵塔並標記",
        d1.ok && t1.ok && (await mark37(p, "m")) === 2,
        { d1, t1 }
      );
      const st0 = await storageOf(p);
      // 武將：(4,3) → 第一格 (4,1) → 第一格 (6,1)；塔：(2,1) → 第一格 (4,1) → 第一格 (2,1)
      for (const [kind, L, A, Bc, Cc] of [
        ["hero", "武將", [4, 3], [4, 1], [6, 1]],
        ["tower", "塔", [2, 1], [4, 1], [2, 1]],
      ]) {
        const o1 = await panel37s(p, kind, A);
        const kept =
          o1.ok &&
          (await keepHandler37(p, `[data-testid="${kind}-move"]`, `kb${kind}`));
        const b = p.locator(`[data-testid="${kind}-move"]`).first();
        await b.focus();
        await p.keyboard.press("Enter");
        const shown1 = await until(
          () => p.locator(MOVE_PANEL37).isVisible(),
          5000
        );
        const k1 = shown1 ? await kbConfirm37(p) : null;
        const u1 = await units37(p);
        const at1 = kind === "hero" ? u1.heroes[0].cell : u1.towers[0].cell;
        check(
          `${L}（鍵盤）：第一次面板 Enter 開始、↓ 選第一格 (${Bc})、Tab＋Enter 確認，同一個實例移到 (${Bc})`,
          kept &&
            !!k1 &&
            k1.ok &&
            k1.picked === `${Bc[0]},${Bc[1]}` &&
            k1.onConfirm &&
            sameJson(at1, Bc),
          { kept, k1, at1 }
        );
        const m2 = await start37s(p, kind, Bc, { keyboard: true });
        const before = await live37(p);
        const called = await callKept37(p, `kb${kind}`);
        await sleep(400);
        const after = await live37(p);
        check(
          `${L}（鍵盤）：同一實例在 (${Bc}) 重開面板、Enter 開始新的移動後，受控呼叫第一次面板的「移動」→ 新的移動編號、來源格、虛影與移位面板都不變`,
          m2.ok &&
            called &&
            !!before.move &&
            sameJson(before.move.from, { col: Bc[0], row: Bc[1] }) &&
            sameJson(after, before),
          { m2, called, before, after }
        );
        const k2 = await kbConfirm37(p);
        const u2 = await units37(p);
        const at2 = kind === "hero" ? u2.heroes[0].cell : u2.towers[0].cell;
        check(
          `${L}（鍵盤）：新的移動用鍵盤選第一格 (${Cc}) 確認，照常完成`,
          k2.ok && k2.picked === `${Cc[0]},${Cc[1]}` && sameJson(at2, Cc),
          { k2, at2 }
        );
      }
      const st1 = await storageOf(p);
      check(
        "整段前後：瀏覽器儲存逐字不變，沒有任何寫入",
        sameJson(st1, st0) && sameJson(writes37(E), NO_WRITES37),
        { st0, st1, writes: writes37(E) }
      );
      return E;
    }
  );

  // ═══ 38. 「自動」的出征原因守門：新開和「迎戰」一樣受共用帳號的兩項出征原因限制（備戰與戰鬥中都是），關不受限；暫停中開關都不動 ═══
  // 一般 UI（滑鼠、鍵盤）按「自動」；按鈕停用時不硬點。清波用受控的 onWaveAllEnemiesDead（不是自然通關）；「受控呼叫」是保留按鈕的 React onClick 後直接呼叫
  // （等同畫面晚一拍、舊的按鈕還能按），只用在負向或驗證按下時用的是當下的實際狀態與帳號
  // 敵人是很慢、打不倒的測試木樁（第 26 段的 SLOW_DUMMY）：測試期間不會自己走到城池而自然清波
  const SLOW_WAVE38 = (wave) => ({
    wave,
    enemies: [
      { enemy_id: "dummy_slow", count: 1, interval: 1, path: "path_a" },
    ],
  });
  const AUTO_MAPS38 = SKILL_MAPS.map((m) => ({
    ...m,
    waves: [SLOW_WAVE38(1), SLOW_WAVE38(2), SLOW_WAVE38(3)],
  }));
  const R_UNSUP38 = "雲端的出征隊伍這裡還不支援：暫時不能出征";
  const AUTO38 = '[data-testid="hud-auto"]';
  /** 引擎目前的這一場：battleId、階段、波次、自動、已排下一波、暫停 */
  const ctl38 = (p) =>
    p.evaluate(() => {
      const b = window.__testBridge.engine.battleManager;
      return {
        battleId: b.battleId,
        state: b.gameState,
        wave: b.currentWave,
        auto: b.autoMode,
        pending: b.autoWavePending,
        paused: b.manualPaused,
      };
    });
  /** 「自動」按鈕：是否停用、title；「迎戰」的 title（對照） */
  const autoBtn38 = async (p) => {
    const a = p.locator(AUTO38).first();
    return {
      disabled: await a.isDisabled(),
      title: await a.getAttribute("title"),
      startTitle: await p
        .locator('[data-testid="hud-start-battle"]')
        .first()
        .getAttribute("title"),
    };
  };
  /** 一般 UI 按「自動」（keyboard：焦點移到按鈕按 Enter）；停用時不按，回報 false */
  async function pressAuto38(p, { keyboard = false } = {}) {
    const a = p.locator(AUTO38).first();
    if (await a.isDisabled()) return false;
    if (keyboard) {
      await a.focus();
      await p.keyboard.press("Enter");
    } else {
      await a.click();
    }
    await sleep(600);
    return true;
  }

  await scenario(
    "自動的出征原因守門：訪客（1280 桌面）備戰按「自動」立刻開波；戰鬥中關掉再開不立刻開下一波；清波後已排下一波按「自動」取消並回備戰；暫停中開關都不動",
    async (mk) => {
      const E = await mk({
        maps: AUTO_MAPS38,
        enemies: [...ENEMIES, SLOW_DUMMY],
      });
      const p = await E.page({
        storage: guestStorage([MA35, ZY35], GUEST_TEAM37),
      });
      check("以訪客進入", await enterGuest(p));
      await waitRemoteStage(p, E);
      check("開始旁錄載入", await watchLoads35(p));
      const st0 = await storageOf(p);
      const c0 = await ctl38(p);
      const b0 = await autoBtn38(p);
      check(
        "備戰第 0 波：「自動」可以按、沒有說明",
        c0.state === 1 &&
          c0.auto === false &&
          !b0.disabled &&
          b0.title === null,
        { c0, b0 }
      );
      const k1 = await pressAuto38(p);
      const c1 = await ctl38(p);
      check(
        "一般 UI 按「自動」：開，立刻開第 1 波（同一場、戰鬥中）",
        k1 &&
          c1.auto === true &&
          c1.state === 2 &&
          c1.wave === 1 &&
          c1.battleId === c0.battleId,
        { c0, c1 }
      );
      const k2 = await pressAuto38(p);
      const c2 = await ctl38(p);
      check(
        "戰鬥中按「自動」：關（仍在第 1 波戰鬥中）",
        k2 && c2.auto === false && c2.state === 2 && c2.wave === 1,
        c2
      );
      const k3 = await pressAuto38(p);
      const c3 = await ctl38(p);
      check(
        "戰鬥中再按「自動」：開，但不立刻開下一波（仍是第 1 波）",
        k3 && c3.auto === true && c3.state === 2 && c3.wave === 1,
        c3
      );
      await forceWaveClear(p);
      await sleep(200);
      const c4 = await ctl38(p);
      const k4 = await pressAuto38(p);
      const c5 = await ctl38(p);
      check(
        "受控清波後已排下一波（仍在戰鬥中）→ 按「自動」關：取消排程、回備戰（第 1 波之後）",
        c4.state === 2 &&
          c4.pending === true &&
          k4 &&
          c5.auto === false &&
          c5.pending === false &&
          c5.state === 1 &&
          c5.wave === 1,
        { c4, c5 }
      );
      check("一般 UI 暫停", await pauseHud(p));
      const b6 = await autoBtn38(p);
      const kept6 = await keepHandler37(p, AUTO38, "auto6");
      const called6 = kept6 && (await callKept37(p, "auto6"));
      await sleep(400);
      const c6 = await ctl38(p);
      check(
        "暫停中（實際沒開）：「自動」停用；受控呼叫 onClick 也不開",
        b6.disabled &&
          called6 &&
          c6.auto === false &&
          c6.state === 1 &&
          c6.paused === true,
        { b6, called6, c6 }
      );
      check("一般 UI 繼續", await resumeHud(p));
      const k7 = await pressAuto38(p);
      const c7 = await ctl38(p);
      check(
        "清波後的備戰按「自動」：開，立刻開第 2 波",
        k7 && c7.auto === true && c7.state === 2 && c7.wave === 2,
        c7
      );
      check("一般 UI 暫停（自動已開）", await pauseHud(p));
      const kept8 = await keepHandler37(p, AUTO38, "auto8");
      const called8 = kept8 && (await callKept37(p, "auto8"));
      await sleep(400);
      const c8 = await ctl38(p);
      check(
        "暫停中（實際已開）：受控呼叫 onClick 也不關",
        called8 && c8.auto === true && c8.paused === true && c8.wave === 2,
        { called8, c8 }
      );
      check("一般 UI 繼續", await resumeHud(p));
      const st1 = await storageOf(p);
      check(
        "整段：同一場（沒有任何載入），瀏覽器儲存逐字不變、沒有任何寫入",
        sameJson(await loads35(p), []) &&
          (await ctl38(p)).battleId === c0.battleId &&
          sameJson(st1, st0) &&
          E.gas.writes().length === 0,
        {
          loads: await loads35(p),
          st0,
          st1,
          writes: E.gas.writes().map((w) => w.action),
        }
      );
      return E;
    }
  );

  await scenario(
    "自動的出征原因守門：共用帳號甲（390×600 鍵盤）Enter 開「自動」後切換到隊伍不支援的乙，自動不中斷、已排的下一波照時程開；關照常；乙在戰鬥中不能新開（按鈕停用、說明同迎戰，受控呼叫也不開）",
    async (mk) => {
      const A = "k_a38_a";
      const Bk = "k_a38_b";
      const E = await mk({
        seed: [
          {
            key: A,
            data: NEW({
              nickname: "甲",
              capacity: 20,
              team: [{ hero_id: "ma_chao", slot: 1 }],
            }),
            rev: 2,
          },
          {
            key: Bk,
            data: NEW({
              nickname: "乙",
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
            }),
            rev: 3,
          },
        ],
        maps: AUTO_MAPS38,
        enemies: [...ENEMIES, SLOW_DUMMY],
        viewport: { width: 390, height: 600 },
      });
      const p = await E.page({ storage: { shenma_player_key: A } });
      check("讀到甲", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      check("開始旁錄載入", await watchLoads35(p));
      const c0 = await ctl38(p);
      const k1 = await pressAuto38(p, { keyboard: true });
      const c1 = await ctl38(p);
      check(
        "鍵盤：焦點移到「自動」按 Enter → 開，立刻開第 1 波",
        k1 && c1.auto === true && c1.state === 2 && c1.wave === 1,
        c1
      );
      check(
        "戰鬥中一般 UI 切換金鑰到乙（隊伍不支援）",
        await switchKey(p, Bk, "乙")
      );
      await sleep(1200);
      const c2 = await ctl38(p);
      check(
        "切換到乙：自動仍開、同一場、仍是第 1 波戰鬥中（沒有任何載入）",
        c2.auto === true &&
          c2.state === 2 &&
          c2.wave === 1 &&
          c2.battleId === c0.battleId &&
          sameJson(await loads35(p), []),
        { c2, loads: await loads35(p) }
      );
      await forceWaveClear(p);
      const nextOk = await until(
        async () => (await ctl38(p)).wave === 2,
        15000
      );
      const c3 = await ctl38(p);
      check(
        "受控清波後：已排的下一波照時程開（第 2 波、自動仍開、同一場）",
        !!nextOk &&
          c3.wave === 2 &&
          c3.state === 2 &&
          c3.auto === true &&
          c3.battleId === c0.battleId,
        c3
      );
      const k4 = await pressAuto38(p, { keyboard: true });
      const c4 = await ctl38(p);
      check(
        "鍵盤：乙（隊伍不支援）按 Enter 關「自動」→ 關照常（不看出征原因）",
        k4 && c4.auto === false && c4.state === 2,
        c4
      );
      await sleep(400);
      const b5 = await autoBtn38(p);
      const kept5 = await keepHandler37(p, AUTO38, "auto5");
      const called5 = kept5 && (await callKept37(p, "auto5"));
      await sleep(400);
      const c5 = await ctl38(p);
      check(
        "乙在戰鬥中、自動沒開：「自動」停用，title 和「迎戰」的說明同一句；受控呼叫 onClick 也不開",
        b5.disabled &&
          b5.title === R_UNSUP38 &&
          called5 &&
          c5.auto === false &&
          c5.state === 2,
        { b5, called5, c5 }
      );
      check(
        "整段：同一場（沒有任何載入），沒有任何存檔、升級、結算的寫入",
        sameJson(await loads35(p), []) &&
          (await ctl38(p)).battleId === c0.battleId &&
          E.gas.count("save_profile") === 0 &&
          E.gas.count("upgrade_hero") === 0 &&
          E.gas.count("save_result") === 0,
        { loads: await loads35(p), writes: E.gas.writes().map((w) => w.action) }
      );
      return E;
    }
  );

  await scenario(
    "自動的出征原因守門：按下時用當下的實際狀態與 store（受控保留舊畫面的 onClick）——舊畫面正常而 store 已不支援不開；舊畫面停用而 store 已恢復照開；舊畫面沒開而實際已開照關；舊畫面沒暫停而實際暫停不動",
    async (mk) => {
      const A = "k_a38_c";
      const Bk = "k_a38_d";
      const E = await mk({
        seed: [
          {
            key: A,
            data: NEW({
              nickname: "甲",
              capacity: 20,
              team: [{ hero_id: "ma_chao", slot: 1 }],
            }),
            rev: 2,
          },
          {
            key: Bk,
            data: NEW({
              nickname: "乙",
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
            }),
            rev: 3,
          },
        ],
        maps: AUTO_MAPS38,
        enemies: [...ENEMIES, SLOW_DUMMY],
      });
      const p = await E.page({ storage: { shenma_player_key: A } });
      check("讀到甲", (await loadShared(p)) === "player");
      await closeModal(p);
      await waitRemoteStage(p, E);
      check("開始旁錄載入", await watchLoads35(p));
      const c0 = await ctl38(p);
      const keptA = await keepHandler37(p, AUTO38, "autoA");
      check("一般 UI 切換金鑰到乙（隊伍不支援）", await switchKey(p, Bk, "乙"));
      await sleep(1200);
      const calledA = keptA && (await callKept37(p, "autoA"));
      await sleep(600);
      const c1 = await ctl38(p);
      check(
        "受控呼叫甲的畫面時保留的「自動」onClick（store 已是隊伍不支援的乙）→ 不開、不開波、同一場（沒有載入）",
        calledA &&
          c1.auto === false &&
          c1.state === 1 &&
          c1.battleId === c0.battleId &&
          sameJson(await loads35(p), []),
        { calledA, c1, loads: await loads35(p) }
      );
      const b1 = await autoBtn38(p);
      const keptB = await keepHandler37(p, AUTO38, "autoB");
      check(
        "乙的畫面：「自動」停用、說明同迎戰；保留這個（停用的）onClick",
        b1.disabled &&
          b1.title === R_UNSUP38 &&
          b1.startTitle === R_UNSUP38 &&
          keptB,
        b1
      );
      check(
        "一般 UI 切回甲（隊伍正常、新的世代）",
        await switchKey(p, A, "甲")
      );
      await sleep(1500);
      const c2 = await ctl38(p);
      const calledB = await callKept37(p, "autoB");
      await sleep(600);
      const c3 = await ctl38(p);
      check(
        "受控呼叫乙的畫面時保留的「自動」onClick（store 已恢復成甲）→ 照常開、立刻開第 1 波",
        calledB &&
          c2.auto === false &&
          c3.auto === true &&
          c3.state === 2 &&
          c3.wave === 1,
        { c2, c3 }
      );
      // 舊畫面沒開而實際已開：保留「沒開」時的 onClick 需要畫面是沒開——用一般 UI 關掉、保留、再用一般 UI 開，之後呼叫保留的舊 onClick
      await pressAuto38(p);
      const keptD = await keepHandler37(p, AUTO38, "autoD");
      await pressAuto38(p);
      const c4 = await ctl38(p);
      const calledD = keptD && (await callKept37(p, "autoD"));
      await sleep(600);
      const c5 = await ctl38(p);
      check(
        "受控呼叫「自動」沒開時保留的 onClick（實際已開）→ 關",
        calledD && c4.auto === true && c5.auto === false,
        { c4, c5 }
      );
      const keptE = await keepHandler37(p, AUTO38, "autoE");
      check("一般 UI 暫停", await pauseHud(p));
      const calledE = keptE && (await callKept37(p, "autoE"));
      await sleep(400);
      const c6 = await ctl38(p);
      check(
        "受控呼叫沒暫停時保留的「自動」onClick（實際已暫停）→ 不動",
        calledE && c6.auto === false && c6.paused === true,
        c6
      );
      check("一般 UI 繼續", await resumeHud(p));
      check(
        "整段：沒有任何存檔、升級、結算的寫入",
        E.gas.count("save_profile") === 0 &&
          E.gas.count("upgrade_hero") === 0 &&
          E.gas.count("save_result") === 0,
        { writes: E.gas.writes().map((w) => w.action) }
      );
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
