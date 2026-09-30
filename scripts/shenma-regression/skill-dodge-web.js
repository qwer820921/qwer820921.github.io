async (page) => {
  // 趙雲「閃避」（瀏覽器，真 Godot；harness 的 Mock A 慢兵關）：敵人攻擊趙雲時每一擊有 15% 的機率閃避，閃避的這一擊不扣血
  // - 技能說明：主頁的武將視窗、獨立的武將頁（15%、「MISS」、不扣血、每擊各自判定、敵人的攻擊間隔照常）；窄畫面（390×844）不溢出、字級可讀
  // - 規則 payload：兩個戰鬥入口的遊戲 iframe 實際收到的出征資料裡，趙雲的 skill 就是 heroSkills 的定義 {id: dodge, dodge_chance: 0.15}；
  //   mock 存檔裡的趙雲帶著舊的技能欄位（first_strike）、武將設定帶正式的被動描述（passive）時，送出的仍是閃避；Godot 快照（hero_dodge）讀到 0.15
  // - 實際受擊：趙雲擋在道路上被 Mock A 的慢兵攻擊，用 Godot 的唯讀快照逐次讀取判定紀錄（正式亂數的抽樣值 u 與結果）與敵人的攻擊次數：
  //   每一次攻擊判定一次；u < 0.15 的才閃避；兩次快照之間的扣血＝沒閃避的擊數 × 9.09（mock 趙雲防禦 120）；持續到閃避與沒閃避都至少看到一次。
  //   閃避出現「MISS」時截圖。固定抽樣值的邊界（0、0.149999、0.15、接近 1）與冷卻時程在 Godot 測試驗證；瀏覽器不加任何可以控制亂數的入口
  // - session 與 mock 後端的存檔都沒有閃避的欄位；全部 mock、虛構金鑰 test_dodge_*；被動描述只在這支腳本加進 mock 名單（__shenma_dodge_extra）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const A = "test_dodge_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const STAGE = "chapter1_1";
  const STAGE_NAME = "Mock A 慢速出兵";
  const SKILL = { id: "dodge", dodge_chance: 0.15 };
  const PASSIVE = "閃避率提升15%";
  // 敵人每擊打阻路武將實際扣的血：20 ×（1 − 防禦 ÷（防禦 + 100））；mock 趙雲防禦 120
  const HIT = 20 * (1 - 120 / 220);

  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const sessionRaw = () => page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const snapshot = async (sel) => {
    const id = "dodge-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  // 遊戲 iframe 實際收到的出征資料（下方 addInitScript 在 iframe 裡記錄）裡趙雲的 skill
  const receivedSkill = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__dodgeRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const zhao = last ? last.team_list.find((t) => t.hero_id === "zhao_yun") : null;
      const cfg = last && Array.isArray(last.heroes_config) ? last.heroes_config.find((c) => c.hero_id === "zhao_yun") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: zhao ? zhao.skill ?? null : null, passive: cfg ? cfg.passive ?? null : null };
    }, sel);
  const clickCell = async (sel, c, row, cols = 14, rows = 11) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { left: b.left, top: b.top, width: b.width, height: b.height };
    }, sel);
    const s = Math.min(r.width / 540, r.height / 720);
    const vx = r.width / s, vy = r.height / s;
    const tile = Math.max(16, Math.floor(Math.min(vx / cols, vy / rows)));
    const ox = (vx - cols * tile) / 2, oy = (vy - rows * tile) / 2;
    await page.mouse.click(r.left + (ox + (c + 0.5) * tile) * s, r.top + (oy + (row + 0.5) * tile) * s);
  };
  const dismissSplash = async (sel) => {
    const r = await page.evaluate((sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    }, sel);
    await page.mouse.click(r.x, r.y);
    await H.sleep(800);
  };
  const placeMsg = (sel, hid, c, r) =>
    page.evaluate(([sel, hid, c, r]) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "place_hero", hero_id: hid, cell_x: c, cell_y: r }, "*");
    }, [sel, hid, c, r]);
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `dodge-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有 Modal 可關 */ }
    }
  };
  // 開戰後約每 0.15 秒取一次快照：趙雲的判定紀錄（新的判定＝判定次數增加的部分，取紀錄的最後幾筆）、血量，
  // 以及每個敵人的攻擊次數（各敵人取看過的最大值相加＝對阻路武將的攻擊總數；場上只有趙雲擋路）。
  // 閃避與沒閃避都至少看到一次、且判定至少 minRolls 次就結束（最多 maxWallMs）；第一次看到「MISS」時截圖。
  // start 是開戰前（部署後）快照裡趙雲的判定次數與血量，從這裡起算，開戰後第一次快照之前的判定也不會漏掉
  const track = async (sel, { start, shotName, minRolls = 12, maxWallMs = 90000 }) => {
    const rolls = [];
    const steps = [];
    const atkMax = {};
    let prev = start ? { rolls: start.rolls, hp: start.hp } : null;
    let shot = null;
    const t0 = Date.now();
    while (Date.now() - t0 < maxWallMs) {
      const s = await snapshot(sel);
      const hd = (s.hero_dodge || {}).zhao_yun || null;
      for (const [id, n] of Object.entries(s.enemy_blocker_attacks || {})) atkMax[id] = Math.max(atkMax[id] || 0, n);
      const attacks = Object.values(atkMax).reduce((a, b) => a + b, 0);
      if (hd && prev) {
        const k = hd.rolls - prev.rolls;
        const fresh = k > 0 ? hd.log.slice(-k) : [];
        const hits = fresh.filter((x) => !x.dodged).length;
        steps.push({ k, logged: fresh.length, hits, lost: Math.round((prev.hp - hd.hp) * 10000) / 10000, g: s.game_time });
        rolls.push(...fresh);
      }
      if (hd) prev = { rolls: hd.rolls, hp: hd.hp };
      if (shot === null && (s.dodge_texts || 0) > 0 && shotName) shot = await H.shot(page, shotName);
      const dodged = rolls.filter((x) => x.dodged).length;
      if (hd && rolls.length >= minRolls && dodged >= 1 && dodged < rolls.length) {
        return { rolls, steps, attacks, final: hd, shot, wallMs: Date.now() - t0 };
      }
      await H.sleep(150);
    }
    return { rolls, steps, attacks: Object.values(atkMax).reduce((a, b) => a + b, 0), final: prev, shot, wallMs: Date.now() - t0, timeout: true };
  };
  // 每一筆判定：u 在 [0, 1)、u < 0.15 ⇔ 閃避；每一段：紀錄沒有被擠掉（最多 40 筆）、扣血＝沒閃避的擊數 × 9.09
  const judge = (r, startRolls) => {
    const badRoll = r.rolls.filter((x) => !(typeof x.u === "number" && x.u >= 0 && x.u < 1 && x.dodged === x.u < 0.15));
    const badStep = r.steps.filter((st) => st.logged !== st.k || Math.abs(st.lost - st.hits * HIT) > 0.01);
    const dodged = r.rolls.filter((x) => x.dodged).length;
    return {
      rolls: r.rolls.length, dodged, hit: r.rolls.length - dodged, attacks: r.attacks, badRoll, badStep,
      finalRolls: r.final ? r.final.rolls : null, rollsMatchAttacks: !!r.final && r.final.rolls - startRolls === r.rolls.length && r.attacks === r.final.rolls,
      sample: r.rolls.slice(0, 8).map((x) => `${Math.round(x.u * 10000) / 10000}${x.dodged ? "閃" : ""}`),
    };
  };

  // 被動描述只在這支腳本加進 mock 名單：旗標打開時，mock 後端回應的趙雲設定多一個 passive 欄位（和正式設定表的文字相同）
  await ctx.addInitScript((passive) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_dodge_extra") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_heroes_config") {
          const res = await inner(input, init);
          const json = await res.json();
          const heroes = (json.heroes || []).map((h) => (h.hero_id === "zhao_yun" ? { ...h, passive } : h));
          return new Response(JSON.stringify({ ...json, heroes }), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }
      return inner(input, init);
    };
  }, PASSIVE);
  // 在新文件初始化時就監聽（包含遊戲 iframe）；只記錄，不影響 Godot 的處理
  await page.addInitScript(() => {
    if (window.__dodgeRecv) return;
    window.__dodgeRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__dodgeRecv.push(e.data);
    });
  });

  // ── A. 技能說明（一般寬度與窄畫面）──
  let detail = "";
  await section("A", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", {
      profiles: {
        [A]: {
          nickname: "閃避玩家", level: 1, exp: 0, gold: 1000, capacity: 40, max_stage: "chapter1_10",
          // 舊資料：趙雲的狀態帶著以前的技能欄位（首擊加倍）
          heroes: [{ hero_id: "zhao_yun", level: 1, star: 0, atk: 150, def: 120, hp: 1500, skill: { id: "first_strike", first_attack_multiplier: 2 } }],
          team: [{ hero_id: "zhao_yun", slot: 1 }, { hero_id: "guan_yu", slot: 2 }],
        },
      },
      battle_logs: [],
    });
    await page.evaluate((k) => {
      localStorage.setItem("shenma_player_key", k);
      localStorage.setItem("__shenma_dodge_extra", "1");
    }, A);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('div[class*="heroName"]');
    const card = await page.locator('div[class*="heroCard"]', { has: page.locator('div[class*="heroName"]', { hasText: "趙雲" }) }).first().innerText();
    await page.locator('div[class*="heroName"]', { hasText: "趙雲" }).first().click();
    detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail };
    out.A_shot = await H.shot(page, "dodge-a-skill-detail");
    run.check("A-1 主頁武將視窗：趙雲的卡片顯示「技能：閃避」（不是衝鋒或奇襲）；詳情寫明每一擊 15% 閃避、不扣血、「MISS」、沒閃避照防禦計算、各自判定沒有冷卻不疊加、敵人的攻擊間隔照常、升級移動換波維持",
      /技能：閃避/.test(card) && !/衝鋒|奇襲/.test(card) && /每一擊有 15% 的機率閃避/.test(detail) && /這一擊不扣血/.test(detail) && /「MISS」/.test(detail) &&
        /照原本的防禦計算扣血/.test(detail) && /沒有冷卻、不會疊加/.test(detail) && /敵人的攻擊間隔照常/.test(detail) && /升級、移動位置、換波次都維持同樣的機率/.test(detail) &&
        !/2 倍/.test(detail),
      out.A_modal);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('[data-testid="hero-skill-tag"]', { hasText: "閃避" }).first().click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：趙雲有「閃避」標籤（mock 的四位各一個技能：橫掃、閃避、百步穿楊、火攻），點開後顯示同樣的規則",
      tags.length === 4 && JSON.stringify([...tags].sort()) === JSON.stringify(["技能：橫掃", "技能：閃避", "技能：百步穿楊", "技能：火攻"].sort()) && detail2 === detail, out.A_page);

    // 窄畫面：說明不溢出（沒有橫向捲動、在畫面寬度內）、字級至少 12px
    const vp = page.viewportSize();
    await page.setViewportSize({ width: 390, height: 844 });
    await H.sleep(600);
    const measure = () =>
      page.evaluate(() => {
        const el = document.querySelector('[data-testid="hero-skill-detail"]');
        if (!el) return null;
        const b = el.getBoundingClientRect();
        const text = el.querySelector('div[class*="heroSkillText"]') || el;
        return {
          left: Math.round(b.left), right: Math.round(b.right), width: Math.round(b.width), vw: window.innerWidth,
          scrollW: el.scrollWidth, clientW: el.clientWidth, font: parseFloat(getComputedStyle(text).fontSize),
          docScroll: document.documentElement.scrollWidth,
        };
      });
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    const narrowPage = await measure();
    out.A_narrow_page_shot = await H.shot(page, "dodge-a-narrow-heroes-page");
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('div[class*="heroName"]');
    await page.locator('div[class*="heroName"]', { hasText: "趙雲" }).first().click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    out.A_narrow_modal_shot = await H.shot(page, "dodge-a-narrow-modal");
    out.A_narrow = { narrowPage, narrowModal };
    const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12 && m.docScroll <= m.vw + 1;
    run.check("A-3 窄畫面（390×844）：武將頁與主頁武將視窗的閃避說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(narrowModal), out.A_narrow);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.setViewportSize(vp || { width: 1280, height: 720 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署選單把趙雲放在道路上擋住慢兵，實際受擊與閃避 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.selectStage(page, STAGE_NAME);
    await dismissSplash(IFRAME);
    await clickCell(IFRAME, 1, 5);
    await page.waitForSelector("text=路徑部署", { timeout: 15000 });
    await page.locator('button[class*="menuCard"]', { hasText: "趙雲" }).click();
    await H.sleep(500);
    const recv = await receivedSkill(IFRAME);
    const placed = await snapshot(IFRAME);
    const hd0 = (placed.hero_dodge || {}).zhao_yun || null;
    out.B_payload = { recv, godot: hd0 };
    run.check("B-1 規則 payload：遊戲 iframe 收到的出征資料裡，趙雲的 skill 正好是 {id: dodge, dodge_chance: 0.15}（存檔裡舊的首擊加倍欄位與設定的被動描述都沒有蓋掉它）；Godot 快照讀到 0.15、還沒有判定",
      recv.stage === STAGE && JSON.stringify(recv.skill) === JSON.stringify(SKILL) && recv.passive === PASSIVE && !!hd0 && hd0.chance === 0.15 && hd0.rolls === 0 &&
        (placed.first_strike_used ? Object.keys(placed.first_strike_used).length === 0 : true),
      out.B_payload);
    await H.clickButton(page, "迎戰");
    const r = await track(IFRAME, { start: hd0, shotName: "dodge-b-main-miss" });
    const j = judge(r, 0);
    out.B = { ...j, steps: r.steps.length, wallMs: r.wallMs, timeout: !!r.timeout, shot: r.shot };
    run.check("B-2 主頁實際受擊（正式亂數）：閃避與沒閃避都出現；每一筆判定的抽樣值在 [0, 1)、只有小於 0.15 的閃避；每次攻擊判定一次（判定次數＝敵人的攻擊次數）；兩次快照之間的扣血＝沒閃避的擊數 × 9.09（閃避的不扣血）",
      !r.timeout && j.rolls >= 12 && j.dodged >= 1 && j.hit >= 1 && j.badRoll.length === 0 && j.badStep.length === 0 && j.rollsMatchAttacks, out.B);
    run.check("B-3 可見效果：閃避時快照看得到「MISS」（dodge_texts ≥ 1），當下截圖另存", !!r.shot, { shot: r.shot });
  });

  // ── C. 獨立戰鬥頁 ──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=" + STAGE);
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
    await H.sleep(1000);
    await dismissSplash(BIFRAME);
    // 畫布縮放和主頁不同，改送部署選單點選武將時送出的同一個 place_hero 訊息（實際點擊的部署流程已在 B 段驗證）
    await placeMsg(BIFRAME, "zhao_yun", 1, 5);
    await H.sleep(500);
    const recv = await receivedSkill(BIFRAME);
    const placed = await snapshot(BIFRAME);
    const hd0 = (placed.hero_dodge || {}).zhao_yun || null;
    out.C_payload = { recv, godot: hd0 };
    run.check("C-1 獨立戰鬥頁的規則 payload：趙雲的 skill 同樣是 {id: dodge, dodge_chance: 0.15}；Godot 快照讀到 0.15",
      recv.stage === STAGE && JSON.stringify(recv.skill) === JSON.stringify(SKILL) && !!hd0 && hd0.chance === 0.15 && hd0.rolls === 0, out.C_payload);
    await page.locator("button", { hasText: /^迎戰$/ }).click();
    const r = await track(BIFRAME, { start: hd0, shotName: "dodge-c-battle-route-miss" });
    const j = judge(r, 0);
    out.C = { ...j, steps: r.steps.length, wallMs: r.wallMs, timeout: !!r.timeout, shot: r.shot };
    run.check("C-2 獨立戰鬥頁實際受擊（正式亂數）：閃避與沒閃避都出現；只有抽樣值小於 0.15 的閃避、判定次數＝攻擊次數、扣血＝沒閃避的擊數 × 9.09",
      !r.timeout && j.rolls >= 12 && j.dodged >= 1 && j.hit >= 1 && j.badRoll.length === 0 && j.badStep.length === 0 && j.rollsMatchAttacks, out.C);
  });

  // ── D. 存檔與 session 不帶閃避 ──
  await section("D", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    const sess = await sessionRaw();
    const d = await db();
    // 金鑰 test_dodge_a 本身含 dodge：只找技能的欄位與值（dodge_chance、"dodge"）
    const bad = /dodge_chance|"dodge"/;
    out.D = { sessionHasDodge: bad.test(sess), dbHasDodge: bad.test(JSON.stringify(d)), sessionLen: sess.length };
    run.check("D-1 session 與 mock 後端的存檔都沒有閃避的欄位與值（dodge_chance、\"dodge\"；技能只在戰場）", out.D.sessionLen > 0 && !out.D.sessionHasDodge && !out.D.dbHasDodge, out.D);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_dodge_extra")).catch(() => {});
  return run.finish({ out });
}
