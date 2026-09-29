async (page) => {
  // 關羽「橫掃」（瀏覽器）：每次普通攻擊命中後，以主目標被打中的位置為中心、半徑 1 格內（含邊界），最多 2 名其他敵人各受這一擊的 50%
  // - 技能說明：主頁的武將視窗、獨立的武將頁（詳情寫出目前攻擊力下每名副目標的傷害）；窄畫面（390×844）說明不溢出、字級可讀
  // - 規則 payload：遊戲 iframe 實際收到的出征資料裡，關羽的 skill 就是 heroSkills 的定義；Godot 的唯讀快照（hero_sweep）讀到同樣的參數
  // - 主頁用部署選單實際放置關羽，Mock T 關的三個敵人同時出發（一開始在同一點、之後慢慢拉開），用快照追蹤每個敵人的血量：
  //   每次攻擊主目標 150（harness 的 mock 關羽攻擊力）、其他敵人各 75，同一次攻擊最多兩名；血量 300 的傷兵被橫掃打倒時擊殺只算一次；
  //   快照的 hero_sweep.fx 看得到範圍效果的當下截圖
  // - 獨立戰鬥頁（送部署選單的同一個 place_hero 訊息）同樣有效
  // - 存檔、session 都沒有技能欄位；全部 mock、虛構金鑰 test_hengsao_*（金鑰本身不含技能的字樣，避免 D 段誤判）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const A = "test_hengsao_a";
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const BIFRAME = 'iframe[title="Shenma Sanguo Battle"]';
  const CELL = [1, 4];
  const ATK = 150; // harness 的 mock 關羽：base_atk 150
  const SIDE = 75; // 150 × 50%
  const SKILL = { id: "sweep", sweep_radius: 1, sweep_max_targets: 2, sweep_ratio: 0.5 };
  // Mock T 關三種敵人的最大血量（harness）：第一次在快照看到的敵人從最大血量算起，開戰後的第一擊也算得到
  const MAX_HP = { mock_t_front: 1000, mock_t_tank: 5000, mock_t_weak: 300 };
  const near = (a, b, eps = 0.011) => typeof a === "number" && Math.abs(a - b) < eps;

  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem("__shenma_mock_gas_db") || "{}"));
  const sessionRaw = () => page.evaluate(() => sessionStorage.getItem("shenma_player_state") || "");
  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const snapshot = async (sel) => {
    const id = "sweep-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
    await page.evaluate(({ sel, id }) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "debug_snapshot", request_id: id }, "*");
    }, { sel, id });
    const h = await page.waitForFunction((id) => (window.__bridgeLog || []).find((m) => m.type === "debug_snapshot" && m.request_id === id), id, { timeout: 30000, polling: 50 });
    return h.jsonValue();
  };
  // 遊戲 iframe 實際收到的出征資料（下方 addInitScript 在 iframe 裡記錄）裡關羽的 skill
  const receivedSkill = (sel) =>
    page.evaluate((sel) => {
      const w = document.querySelector(sel).contentWindow;
      const got = (w.__sweepRecv || []).filter((d) => d && Array.isArray(d.team_list) && d.stage_id);
      const last = got[got.length - 1];
      const guan = last ? last.team_list.find((t) => t.hero_id === "guan_yu") : null;
      return { payloads: got.length, stage: last ? last.stage_id : null, skill: guan ? guan.skill ?? null : null, keys: guan ? Object.keys(guan).sort() : [] };
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
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `sweep-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try {
        for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
          await page.locator('button[class*="modalClose"]').last().click();
          await H.sleep(300);
        }
      } catch { /* 沒有 Modal 可關 */ }
    }
  };
  // 每次快照比較每個敵人的血量：同一次快照內的下降算成同一次攻擊（攻擊間隔 1.2 秒，快照約 0.15 秒一次）。
  // 第一次看到的敵人從最大血量算起；敵人從快照消失時記下消失前的血量（被打倒或抵達基地），打倒它的那一擊不算在 drops 裡
  const track = async (sel, { minSweeps, timeoutMs, shotName }) => {
    const windows = [];
    const gone = [];
    let last = null;
    let kind = {};
    let shot = null;
    let fxSeen = 0;
    let s = null;
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      s = await snapshot(sel);
      const hp = s.enemy_hp || {};
      kind = { ...kind, ...(s.enemy_kind || {}) };
      const sw = (s.hero_sweep || {}).guan_yu || null;
      if (sw && sw.fx > 0) {
        fxSeen++;
        if (shot === null) shot = await H.shot(page, shotName);
      }
      const prev = last || {};
      const drops = [];
      for (const [id, v] of Object.entries(hp)) {
        const before = id in prev ? prev[id] : MAX_HP[kind[id]];
        if (typeof before === "number" && before - v > 0.001) drops.push({ id, kind: kind[id], drop: Math.round((before - v) * 100) / 100 });
      }
      for (const id of Object.keys(prev)) {
        if (!(id in hp)) gone.push({ id, kind: kind[id], lastHp: prev[id], kills: s.kills });
      }
      if (drops.length) windows.push({ t: (Date.now() - t0) / 1000, drops, sweep: sw });
      last = hp;
      if (sw && sw.count >= minSweeps && gone.length >= 1) break;
      await H.sleep(150);
    }
    return { windows, gone, shot, fxSeen, final: s };
  };
  // 每一次攻擊：主目標一筆 150、其他敵人各一筆 75（最多兩筆）；其他數值或組合放在 bad
  const classify = (windows) => {
    const attacks = [], bad = [];
    for (const w of windows) {
      const main = w.drops.filter((d) => near(d.drop, ATK)).length;
      const side = w.drops.filter((d) => near(d.drop, SIDE)).length;
      const other = w.drops.filter((d) => !near(d.drop, ATK) && !near(d.drop, SIDE));
      if (other.length || main !== 1 || side > 2) bad.push(w);
      else attacks.push({ t: w.t, side });
    }
    return { attacks, bad };
  };
  const skillOk = (sk) => !!sk && JSON.stringify(Object.keys(sk).sort()) === JSON.stringify(Object.keys(SKILL).sort()) && Object.keys(SKILL).every((k) => sk[k] === SKILL[k]);
  const godotOk = (sw) => !!sw && sw.radius === 1 && sw.max_targets === 2 && sw.ratio === 0.5;

  // 在新文件初始化時就監聽；不以此時的 pathname 篩選，避免靜態版 iframe 漏裝監聽。
  // receivedSkill 只讀指定的遊戲 iframe；監聽只記錄，不影響 Godot 的處理。
  await page.addInitScript(() => {
    if (window.__sweepRecv) return;
    window.__sweepRecv = [];
    window.addEventListener("message", (e) => {
      if (e.data && typeof e.data === "object") window.__sweepRecv.push(e.data);
    });
  });

  // ── A. 技能說明（一般寬度與窄畫面）──
  await section("A", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", {
      profiles: {
        [A]: { nickname: "橫掃玩家", level: 1, exp: 0, gold: 1000, capacity: 11, max_stage: "chapter1_10", heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }] },
      },
      battle_logs: [],
    });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), A);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    await H.clickButton(page, "武將");
    await page.waitForSelector('div[class*="heroName"]');
    const card = await page.locator('div[class*="heroCard"]', { has: page.locator('div[class*="heroName"]', { hasText: "關羽" }) }).first().innerText();
    await page.locator('div[class*="heroName"]', { hasText: "關羽" }).first().click();
    const detail = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_modal = { card, detail };
    out.A_shot = await H.shot(page, "sweep-a-skill-detail");
    run.check("A-1 主頁武將視窗：關羽的卡片顯示「技能：橫掃」；詳情寫明半徑 1 格（含邊界）、最多 2 名、50%、由近到遠與等距規則、不連鎖，以及目前攻擊力 150 時每名 75",
      /技能：橫掃/.test(card) && /半徑 1 格內（含邊界）/.test(detail) && /最多 2 名其他敵人/.test(detail) && /50%/.test(detail) &&
        /距離相同時先出現在戰場上的敵人優先/.test(detail) && /不會再引發橫掃/.test(detail) && /目前攻擊力 150：每名其他敵人受到 75/.test(detail),
      out.A_modal);
    await page.locator('button[class*="modalClose"]').last().click();
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('[data-testid="hero-skill-tag"]', { timeout: 60000 });
    const tags = await page.locator('[data-testid="hero-skill-tag"]').allInnerTexts();
    await page.locator('[data-testid="hero-skill-tag"]', { hasText: "橫掃" }).first().click();
    const detail2 = await page.locator('[data-testid="hero-skill-detail"]').first().innerText();
    out.A_page = { tags, detail2 };
    run.check("A-2 武將頁：關羽有「橫掃」標籤（四位武將各一個技能），點開後顯示同樣的規則",
      tags.includes("技能：橫掃") && tags.length === 4 && detail2 === detail, out.A_page);

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
    out.A_narrow_page_shot = await H.shot(page, "sweep-a-narrow-heroes-page");
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.clickButton(page, "武將");
    await page.waitForSelector('div[class*="heroName"]');
    await page.locator('div[class*="heroName"]', { hasText: "關羽" }).first().click();
    await page.waitForSelector('[data-testid="hero-skill-detail"]');
    await page.locator('[data-testid="hero-skill-detail"]').first().scrollIntoViewIfNeeded();
    await H.sleep(300);
    const narrowModal = await measure();
    out.A_narrow_modal_shot = await H.shot(page, "sweep-a-narrow-modal");
    out.A_narrow = { narrowPage, narrowModal };
    const fits = (m) => !!m && m.left >= 0 && m.right <= m.vw && m.scrollW <= m.clientW + 1 && m.font >= 12;
    run.check("A-3 窄畫面（390×844）：武將頁與主頁武將視窗的橫掃說明都在畫面寬度內、沒有橫向溢出、字級至少 12px（截圖另存）",
      fits(narrowPage) && fits(narrowModal), out.A_narrow);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await H.sleep(300);
    await page.locator('button[class*="modalClose"]').last().click().catch(() => {});
    await page.setViewportSize(vp || { width: 1280, height: 720 });
    await H.sleep(300);
  });

  // ── B. 主頁：部署選單放置關羽、實際扣血與範圍效果 ──
  await section("B", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.selectStage(page, "Mock T 塔目標");
    await dismissSplash(IFRAME);
    await clickCell(IFRAME, CELL[0], CELL[1]);
    await page.waitForSelector("text=建築位部署", { timeout: 15000 });
    await page.locator('button[class*="tabBtn"]', { hasText: "武將" }).click();
    await page.locator('button[class*="menuCard"]', { hasText: "關羽" }).click();
    await H.sleep(500);
    const recv = await receivedSkill(IFRAME);
    const placed = await snapshot(IFRAME);
    const sw0 = (placed.hero_sweep || {}).guan_yu || null;
    out.B_payload = { recv, godot: sw0 };
    run.check("B-1 規則 payload：遊戲 iframe 收到的出征資料裡，關羽的 skill 正好是 {id: sweep, sweep_radius: 1, sweep_max_targets: 2, sweep_ratio: 0.5}；Godot 快照讀到同樣的參數、放置時還沒有橫掃",
      recv.stage === "chapter1_10" && skillOk(recv.skill) && godotOk(sw0) && sw0.count === 0 && sw0.hits === 0, out.B_payload);
    await H.clickButton(page, "迎戰");
    const r = await track(IFRAME, { minSweeps: 5, timeoutMs: 60000, shotName: "sweep-b-main-fx" });
    const c = classify(r.windows);
    const sideDrops = c.attacks.reduce((n, a) => n + a.side, 0);
    const fin = (r.final.hero_sweep || {}).guan_yu || {};
    const weak = r.gone.find((g) => g.kind === "mock_t_weak");
    // 被橫掃打倒的副目標（消失前剩下的血量不超過 75）：打倒它的那一擊不在 drops 裡，另外加回來
    const sideKills = r.gone.filter((g) => g.kind !== "mock_t_front" && g.lastHp <= SIDE + 0.01).length;
    out.B = { attacks: c.attacks, bad: c.bad, sideDrops, sideKills, gone: r.gone, fxSeen: r.fxSeen, shot: r.shot, final: { sweep: fin, kills: r.final.kills }, windows: r.windows.map((w) => ({ t: w.t, drops: w.drops.map((d) => [d.kind, d.drop]) })) };
    run.check("B-2 實際扣血：每次攻擊都是主目標 150 一筆＋其他敵人各 75（最多兩筆），沒有其他數值或重複；傷兵倒下前至少 3 次打到兩名副目標",
      c.attacks.length >= 5 && c.bad.length === 0 && c.attacks.filter((a) => a.side === 2).length >= 3, { attacks: c.attacks, bad: c.bad });
    run.check("B-3 Godot 的橫掃統計和觀察完全一致：橫掃次數＝觀察到的攻擊次數，打到的副目標數＝觀察到的 75 筆數＋被橫掃打倒的副目標數",
      fin.count === c.attacks.filter((a) => a.side > 0).length && fin.hits === sideDrops + sideKills, { final: fin, observed: { attacks: c.attacks.length, sweeps: c.attacks.filter((a) => a.side > 0).length, sideDrops, sideKills } });
    run.check("B-4 可見效果：快照看得到範圍效果（hero_sweep.fx ≥ 1），當下截圖另存",
      r.fxSeen >= 1 && !!r.shot, { fxSeen: r.fxSeen, shot: r.shot });
    run.check("B-5 血量 300 的傷兵被打倒（橫掃各 75、四次）：消失時擊殺數是 1、只消失一次，之後擊殺數不會因為同一個敵人再增加",
      !!weak && weak.kills === 1 && r.gone.filter((g) => g.id === weak.id).length === 1 && r.final.kills === r.gone.length, { weak, gone: r.gone, kills: r.final.kills });
  });

  // ── C. 獨立戰鬥頁 ──
  await section("C", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/battle?map=chapter1_10");
    await page.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => /^自動/.test(b.innerText.trim())), null, { timeout: 120000 });
    await H.sleep(1000);
    await dismissSplash(BIFRAME);
    // 畫布縮放和主頁不同，改送部署選單點選武將時送出的同一個 place_hero 訊息（實際點擊的部署流程已在 B 段驗證）
    await page.evaluate(([sel, c, r]) => {
      document.querySelector(sel).contentWindow.postMessage({ __godot_bridge: true, type: "place_hero", hero_id: "guan_yu", cell_x: c, cell_y: r }, "*");
    }, [BIFRAME, CELL[0], CELL[1]]);
    await H.sleep(500);
    const recv = await receivedSkill(BIFRAME);
    const placed = await snapshot(BIFRAME);
    const sw0 = (placed.hero_sweep || {}).guan_yu || null;
    await page.locator("button", { hasText: /^迎戰$/ }).click();
    const r = await track(BIFRAME, { minSweeps: 3, timeoutMs: 45000, shotName: "sweep-c-battle-fx" });
    const c = classify(r.windows);
    out.C = { recv, godot: sw0, attacks: c.attacks, bad: c.bad, fxSeen: r.fxSeen, shot: r.shot, final: (r.final.hero_sweep || {}).guan_yu };
    run.check("C-1 獨立戰鬥頁：iframe 收到的關羽 skill 和主頁相同，Godot 讀到同樣的參數",
      recv.stage === "chapter1_10" && skillOk(recv.skill) && godotOk(sw0), { recv, godot: sw0 });
    run.check("C-2 獨立戰鬥頁：實際扣血同樣是主目標 150＋其他敵人各 75（最多兩名），看得到範圍效果",
      c.attacks.length >= 2 && c.bad.length === 0 && c.attacks.some((a) => a.side === 2) && r.fxSeen >= 1, out.C);
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
  });

  // ── D. 存檔與 session 不帶技能欄位 ──
  await section("D", async () => {
    await waitSync("idle");
    const d = await db();
    const p = d.profiles[A];
    const sess = await sessionRaw();
    const bad = /skill|sweep|burn|long_range|range_multiplier|first_attack/;
    out.D = { profileKeys: Object.keys(p), team: p.team, sessionHasSkill: bad.test(sess) };
    run.check("D-1 存檔與 session 都沒有技能或橫掃欄位；隊伍仍只有 hero_id／slot",
      !bad.test(JSON.stringify(p)) && !out.D.sessionHasSkill && p.team.every((t) => JSON.stringify(Object.keys(t).sort()) === '["hero_id","slot"]'),
      out.D);
  });

  return run.finish({ out });
}
