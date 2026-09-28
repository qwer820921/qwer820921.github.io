async (page) => {
  // R16（瀏覽器）：D17 攻速成長的欄位名稱，以及關卡敵軍預覽
  // A. 攻速：從「舊格式的本機快取」啟動（武將設定只有正式的 speed_growth、沒有 atk_spd_growth），不打 API
  //    - 主頁武將視窗、武將頁顯示的攻擊間隔與升級預覽用正規化後的成長（周瑜 1 → 0.98 秒；明確的 0 不被別名蓋掉）
  //    - 主頁實際部署關羽（快取裡成長放大成 0.25，實際間隔才量得出差異：Lv1 1 秒、Lv2 0.75 秒），
  //      用唯讀快照的 enemy_hp 與 game_time 量實際的攻擊間隔；戰鬥中升級後再量一次，和說明、戰場的選取面板對照
  //    - 清掉快取後從 API 讀取（harness 的周瑜同樣只有 speed_growth）也一樣
  // P. 敵軍預覽：主頁的關卡視窗與獨立的關卡頁都有入口；內容（波次、每組名稱／數量／路線／血量／移動速度、總數）、
  //    資料不完整的標示、鎖定關卡；查看與關閉不切換關卡、不改變 battle_id、不送出任何寫入；
  //    預覽的出兵和 Godot 實際生成的敵人相同；手機寬度、寫入限制中的畫面（底部提示不遮住關閉按鈕）
  // 全部 mock、虛構金鑰 test_r16_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const A = "test_r16_a";
  const CELL = [1, 4];
  const ATK = 150; // harness 的 mock 關羽
  const WRITES = ["save_profile", "upgrade_hero", "save_result", "create_profile"];

  const setMock = (k, v) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [k, v]);
  const waitSync = (st, timeout = 60000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 100 });
  const closeModals = async () => {
    for (let i = 0; i < 4 && (await page.locator('button[class*="modalClose"]').count()) > 0; i++) {
      await page.locator('button[class*="modalClose"]').last().click();
      await H.sleep(300);
    }
  };
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e).slice(0, 300));
      try { out[name + "_shot"] = await H.shot(page, `r16-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
      try { await page.keyboard.press("Escape"); await closeModals(); } catch { /* 沒有視窗可關 */ }
    }
  };
  const logLen = async () => (await H.gasLog(page)).length;
  const logSince = async (n) => (await H.gasLog(page)).slice(n);

  // 主頁武將視窗：某位武將的「攻擊間隔 目前 → 升級後」
  const modalInterval = async (name) => {
    await H.clickButton(page, "武將");
    await page.waitForSelector('div[class*="heroName"]');
    await page.locator('div[class*="heroName"]', { hasText: new RegExp("^" + name + "$") }).first().click();
    const t = (await page.locator('[data-testid="attack-interval-preview"]').first().innerText()).replace(/\s+/g, " ");
    await closeModals();
    return t;
  };
  // 戰場的選取面板：點選部署的武將，讀面板上的攻擊間隔後關掉
  const panelInterval = async () => {
    await H.clickCell(page, CELL[0], CELL[1]);
    await page.waitForSelector('[data-testid="upgrade-panel-interval"]', { timeout: 15000 });
    const t = (await page.locator('[data-testid="upgrade-panel-interval"]').first().innerText()).trim();
    await page.locator('div[class*="upgradePanel"] button[class*="closeBtn"]').first().click();
    await page.waitForSelector('div[class*="upgradePanel"]', { state: "detached", timeout: 10000 }).catch(() => {});
    return t;
  };
  // 實際的攻擊間隔：每次快照比較每個敵人的血量，下降 150 的倍數就是關羽的攻擊（只有他一位），記下遊戲時間。
  // 快照之間的遊戲時間差（gapMax）就是量測的解析度
  const measure = async (windowSec) => {
    const hits = [];
    let last = null;
    let prevT = null;
    let gapMax = 0;
    let g0 = null;
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const s = await H.snapshot(page);
      const t = s.game_time;
      if (g0 === null) g0 = t;
      if (prevT !== null) gapMax = Math.max(gapMax, t - prevT);
      prevT = t;
      if (last) {
        let drop = 0;
        for (const [id, hp] of Object.entries(s.enemy_hp || {})) if (id in last) drop += last[id] - hp;
        const n = Math.round(drop / ATK);
        if (n > 0) hits.push({ t: Math.round(t * 1000) / 1000, n });
      }
      last = s.enemy_hp || {};
      if (t - g0 >= windowSec) break;
      await H.sleep(40);
    }
    const ts = hits.map((h) => h.t);
    const intervals = ts.slice(1).map((x, i) => Math.round((x - ts[i]) * 1000) / 1000);
    const avg = ts.length >= 2 ? (ts[ts.length - 1] - ts[0]) / (ts.length - 1) : null;
    return { hits, intervals, avg, gapMax: Math.round(gapMax * 1000) / 1000, multi: hits.filter((h) => h.n !== 1).length };
  };
  // 每一個間隔都在「預期 ± 快照解析度」內（實際的攻擊只會落在某一幀；快照之間相隔 gapMax 秒）
  const intervalOk = (m, expect) =>
    m.intervals.length >= 3 && m.multi === 0 && m.intervals.every((d) => d >= expect - m.gapMax - 0.02 && d <= expect + m.gapMax + 0.04) && Math.abs(m.avg - expect) < 0.06;

  // ── A. 攻速成長：舊快取啟動 ──
  await section("A", async () => {
    await H.resetOrigin(page);
    await setMock("__shenma_mock_gas_db", {
      profiles: {
        [A]: { nickname: "R16 玩家", level: 1, exp: 0, gold: 5000, capacity: 11, max_stage: "chapter1_8", heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }] },
      },
      battle_logs: [],
    });
    await page.evaluate((k) => localStorage.setItem("shenma_player_key", k), A);
    // 舊格式的本機快取：用 mock API 取得靜態設定後，武將的攻速成長改成只有 speed_growth；
    // 趙雲保留明確的 atk_spd_growth 0 並加上 speed_growth 0.3（明確的 0 要優先）；關羽的成長放大成 0.25、間隔 1 秒
    out.A_cache = await page.evaluate(async () => {
      const call = async (action) => (await fetch("https://script.google.com/macros/s/r16/exec", { method: "POST", body: JSON.stringify({ action }) })).json();
      const [h, e, m] = [await call("get_heroes_config"), await call("get_enemies_config"), await call("get_all_maps")];
      const heroes = h.heroes.map((x) => {
        if (x.hero_id === "zhao_yun") return { ...x, speed_growth: 0.3 };
        const { atk_spd_growth: _drop, ...rest } = x;
        if (x.hero_id === "guan_yu") return { ...rest, attack_speed: 1, speed_growth: 0.25 };
        return { ...rest, speed_growth: typeof x.speed_growth === "number" ? x.speed_growth : 0.01 };
      });
      localStorage.setItem("shenma_static_config", JSON.stringify({ heroesConfig: heroes, enemiesConfig: e.enemies, maps: m.maps }));
      // 時間戳放在未來：整段測試期間快取都是新鮮的，不會在背景換成 API 的設定
      localStorage.setItem("shenma_static_ts", String(Date.now() + 3600000));
      return heroes.map((x) => ({ id: x.hero_id, atk_spd_growth: x.atk_spd_growth, speed_growth: x.speed_growth, attack_speed: x.attack_speed }));
    });
    const n0 = await logLen();
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const calls = H.countActions(await logSince(n0));
    const guan = await modalInterval("關羽");
    const zhou = await modalInterval("周瑜");
    const zhao = await modalInterval("趙雲");
    out.A1 = { calls, guan, zhou, zhao };
    run.check("A-1 從舊快取啟動：沒有讀取靜態設定 API；主頁武將視窗的攻擊間隔用正規化後的成長：關羽 1 → 0.75 秒、周瑜 1 → 0.98 秒；趙雲明確的 0 不被別名蓋掉（1.2 → 1.2 秒）",
      !calls.get_heroes_config && !calls.get_all_maps && /攻擊間隔 1 秒 → 0\.75 秒/.test(guan) && /攻擊間隔 1 秒 → 0\.98 秒/.test(zhou) && /攻擊間隔 1\.2 秒 → 1\.2 秒/.test(zhao),
      out.A1);

    await page.goto(H.BASE + "/shenmaSanguo/heroes");
    await page.waitForSelector('div[class*="heroName"]', { timeout: 60000 });
    await page.locator('div[class*="heroName"]', { hasText: /^周瑜$/ }).first().click();
    await page.waitForSelector(".modal-content", { timeout: 10000 });
    const heroPage = (await page.locator(".modal-content").first().innerText()).replace(/\s+/g, " ");
    out.A2 = { heroPage };
    run.check("A-2 武將頁：周瑜目前的攻擊間隔 1 秒，升級預覽 1 → 0.98（和主頁視窗、戰場用同一個公式）",
      /攻擊間隔 1 秒/.test(heroPage) && /攻擊間隔\(秒\) 1 → 0\.98/.test(heroPage), out.A2);
    await page.keyboard.press("Escape");
    await H.sleep(300);
  });

  // ── A. 戰場：實際的攻擊間隔、戰鬥中升級 ──
  await section("A-battle", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await H.selectStage(page, "Mock A 慢速出兵");
    await H.dismissSplash(page);
    await H.clickCell(page, CELL[0], CELL[1]);
    await page.waitForSelector("text=建築位部署", { timeout: 15000 });
    await page.locator('button[class*="tabBtn"]', { hasText: "武將" }).click();
    await page.locator('button[class*="menuCard"]', { hasText: "關羽" }).click();
    await H.sleep(500);
    await H.clickButton(page, "迎戰");
    await H.waitGameTime(page, 1.5);
    const lv1 = await measure(6);
    const panel1 = await panelInterval();
    const preview1 = await modalInterval("關羽");
    // 戰鬥中升級：store 更新後送 update_team，Godot 從設定重新計算攻擊間隔
    await H.clickButton(page, "武將");
    await page.locator('div[class*="heroName"]', { hasText: /^關羽$/ }).first().click();
    await page.getByRole("button", { name: /^升級 \(-\d+ 點\)$/ }).click();
    await page.waitForSelector("text=升級成功！", { timeout: 60000 });
    await closeModals();
    await H.waitGameTime(page, 1.2);
    const lv2 = await measure(6);
    const panel2 = await panelInterval();
    const preview2 = await modalInterval("關羽");
    out.A3 = { lv1, panel1, preview1, lv2, panel2, preview2, shot: await H.shot(page, "r16-a-battle") };
    run.check("A-3 Lv1 實戰：關羽每一擊間隔約 1 秒（實際量測，解析度是快照的間隔）；戰場選取面板顯示 1秒，和說明一致",
      intervalOk(lv1, 1) && panel1 === "1秒" && /攻擊間隔 1 秒 → 0\.75 秒/.test(preview1), { lv1, panel1, preview1 });
    run.check("A-4 戰鬥中升到 Lv2：實際間隔變成約 0.75 秒，選取面板 0.75秒，說明變成 0.75 → 0.5 秒",
      intervalOk(lv2, 0.75) && panel2 === "0.75秒" && /攻擊間隔 0\.75 秒 → 0\.5 秒/.test(preview2), { lv2, panel2, preview2 });
  });

  // ── A. 從 API 讀取（清掉快取）──
  await section("A-api", async () => {
    await waitSync("idle");
    await page.evaluate(() => {
      localStorage.removeItem("shenma_static_config");
      localStorage.removeItem("shenma_static_ts");
    });
    const n0 = await logLen();
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const calls = H.countActions(await logSince(n0));
    const zhou = await modalInterval("周瑜");
    const guan = await modalInterval("關羽");
    out.A5 = { calls, zhou, guan };
    run.check("A-5 清掉快取後從 API 讀取（harness 的周瑜也只有 speed_growth 0.02）：周瑜 1 → 0.98 秒；關羽（Lv2、mock 明確的 0）1.2 → 1.2 秒",
      calls.get_heroes_config === 1 && /攻擊間隔 1 秒 → 0\.98 秒/.test(zhou) && /攻擊間隔 1\.2 秒 → 1\.2 秒/.test(guan), out.A5);
  });

  // ── P. 敵軍預覽：主頁的關卡視窗 ──
  const openStageList = async () => {
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector("text=關卡選擇", { timeout: 10000 });
  };
  const card = (name) => page.locator('div[class*="stageCard"]', { has: page.locator("div", { hasText: new RegExp("^" + name + "$") }) }).first();
  const openPreview = async (name) => {
    await card(name).locator('[data-testid="enemy-preview-open"]').click();
    await page.waitForSelector('[data-testid="enemy-preview"]', { timeout: 10000 });
  };
  const previewText = async () => (await page.locator('[data-testid="enemy-preview"]').innerText()).replace(/[ \t]+/g, " ");
  const waveText = async (n) => (await page.locator(`[data-testid="preview-wave-${n}"]`).innerText()).replace(/\s+/g, " ");
  const isOpen = async () => (await page.locator('[data-testid="enemy-preview"]').count()) > 0;

  await section("P1", async () => {
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const before = await H.snapshot(page);
    const hud0 = await H.hud(page);
    const b0 = await H.bridgeLen(page);
    const n0 = await logLen();
    await openStageList();
    await openPreview("Mock P 多路線");
    const text = await previewText();
    const w1 = await waveText(1);
    const groups1 = (await page.locator('[data-testid="preview-wave-1"] [data-testid="preview-group"]').allInnerTexts()).map((t) => t.replace(/\s+/g, " "));
    await page.locator('[data-testid="preview-wave-toggle-2"]').click();
    const w2 = await waveText(2);
    await page.locator('[data-testid="preview-wave-toggle-1"]').click();
    const collapsed = await page.locator('[data-testid="preview-wave-1"] [data-testid="preview-group"]').count();
    const expanded1 = await page.locator('[data-testid="preview-wave-toggle-1"]').getAttribute("aria-expanded");
    out.P1 = { text, w1, groups1, w2, collapsed, expanded1, shot: await H.shot(page, "r16-p1-preview-main") };
    run.check("P-1 主頁關卡視窗的敵軍預覽：共 2 波、全關 8 隻；路線 path_a、path_b；第 1 波 6 隻分 3 組（步兵 ×3 path_a、步兵 ×2 path_b、B 步兵 ×1 path_b），血量、移動速度、間隔取自設定；第 2 波 C 快騎 ×2（0.5 秒）；波次可收合",
      /共 2 波，全關 8 隻敵人/.test(text) && /路線：path_a、path_b/.test(text) && /第 1 波.*6 隻/.test(w1) &&
        groups1.length === 3 && /第 1 組 步兵 ×3 路線 path_a 血量 20｜移動速度 60｜每隻間隔 1 秒/.test(groups1[0]) &&
        /第 2 組 步兵 ×2 路線 path_b/.test(groups1[1]) && /第 3 組 B 步兵 ×1 路線 path_b/.test(groups1[2]) &&
        /第 2 波.*2 隻/.test(w2) && /C 快騎 ×2 路線 path_a 血量 99999｜移動速度 400｜每隻間隔 0\.5 秒/.test(w2) &&
        !/資料不完整/.test(text) && collapsed === 0 && expanded1 === "false",
      out.P1);
    // 關閉：回到關卡列表；沒有切換關卡、battle_id 不變、沒有任何寫入
    await page.locator('[data-testid="enemy-preview-close"]').click();
    await H.sleep(500);
    const listStill = (await page.locator("text=關卡選擇").count()) > 0;
    const after = await H.snapshot(page);
    const loads = (await H.bridgeSince(page, b0)).filter((m) => m.type === "update_stats" && m.wave === 0 && m.game_state === 1).length;
    const writes = (await logSince(n0)).filter((e) => WRITES.includes(e.action)).length;
    const hud1 = await H.hud(page);
    out.P1b = { listStill, battleBefore: before.battle_id, battleAfter: after.battle_id, loads, writes, map0: hud0.map, map1: hud1.map };
    run.check("P-2 關閉預覽回到關卡列表；沒有切換關卡（Godot 沒有重新載入、battle_id 與目前關卡不變）、沒有任何寫入",
      !(await isOpen()) && listStill && before.battle_id === after.battle_id && loads === 0 && writes === 0 && hud0.map === hud1.map, out.P1b);
  });

  await section("P3", async () => {
    // 鎖定、資料不完整的關卡（還在主頁的關卡視窗）
    const lockedBtn = await card("Mock Q 缺資料").locator("button", { hasText: "尚未解鎖" }).isDisabled();
    await openPreview("Mock Q 缺資料");
    const text = await previewText();
    const w1 = await waveText(1);
    await page.locator('[data-testid="preview-wave-toggle-2"]').click();
    await page.locator('[data-testid="preview-wave-toggle-3"]').click();
    const w2 = await waveText(2);
    const w3 = await waveText(3);
    out.P3 = { lockedBtn, text, w1, w2, w3, shot: await H.shot(page, "r16-p3-incomplete-locked") };
    await page.keyboard.press("Escape");
    await H.sleep(300);
    const closedByEsc = !(await isOpen());
    const stillLocked = await card("Mock Q 缺資料").locator("button", { hasText: "尚未解鎖" }).isDisabled();
    run.check("P-3 鎖定關卡可以查看：標示鎖定與尚未解鎖，出征按鈕仍停用；Esc 關閉後仍是鎖定",
      lockedBtn && /鎖定/.test(text) && /這一關尚未解鎖：只能查看敵軍，不能出征/.test(text) && closedByEsc && stillLocked, { lockedBtn, closedByEsc, stillLocked });
    run.check("P-4 資料不完整照遊戲規則標示：全關數量無法確定；第 1 波 1 隻（找不到的敵人、沒有路點的路線、數量 0 不會出兵；沒有數量以 1 隻計；空白列不是敵人）；缺少第 2 波（遊戲會拒絕）；第 3 波 1 隻",
      /共 3 波，全關數量無法確定/.test(text) && /第 1 波.*資料不完整.*1 隻/.test(w1) &&
        /未知敵人（mock_unknown_enemy）\s*不會出兵/.test(w1) && /找不到敵人設定「mock_unknown_enemy」，遊戲會略過這一組/.test(w1) &&
        /路線「path_x」沒有路點，遊戲會略過這一組/.test(w1) && /沒有提供數量，遊戲以 1 隻計/.test(w1) && /數量是 0，遊戲會略過這一組/.test(w1) &&
        /另有 1 列空白資料/.test(w1) && /第 2 波.*沒有資料/.test(w2) && /關卡資料沒有第 2 波：遊戲打到這一波會拒絕開始/.test(w2) && /第 3 波.*1 隻/.test(w3),
      { w1, w2, w3 });
    // 既有的 R3 關卡：整波無效（遊戲會拒絕）、混合組（3 隻，另一組找不到設定）
    await openPreview("Mock E 無效波");
    const e = await waveText(1);
    await page.locator('[data-testid="enemy-preview-close-bottom"]').click();
    await H.sleep(300);
    await openPreview("Mock M 混合組");
    const m = await waveText(1);
    await page.locator('[data-testid="enemy-preview-close"]').click();
    await H.sleep(300);
    out.P5 = { e, m };
    run.check("P-5 既有關卡：「Mock E 無效波」標示遊戲會拒絕這一波（不是 0 隻）；「Mock M 混合組」3 隻、資料不完整（找不到 mock_missing_config）——和 R3 的實際行為相同",
      /遊戲會拒絕這一波/.test(e) && /這一波沒有可以出兵的敵人組/.test(e) && !/0 隻/.test(e) && /3 隻/.test(m) && /資料不完整/.test(m) && /mock_missing_config/.test(m), out.P5);
    await closeModals();
  });

  await section("P6", async () => {
    // 預覽和 Godot 實際生成的敵人相同：Mock P 第 1 波（步兵 3＋2、B 步兵 1）
    await H.selectStage(page, "Mock P 多路線");
    await H.clickButton(page, "迎戰");
    const s = await H.waitGameTime(page, 3.6);
    out.P6 = { enemy_nodes: s.enemy_nodes };
    run.check("P-6 預覽的出兵和戰場相同：Mock P 第 1 波實際生成步兵 5 隻（兩條路線 3＋2）、B 步兵 1 隻，共 6 隻",
      JSON.stringify(s.enemy_nodes) === JSON.stringify({ mock_grunt: 5, mock_b_grunt: 1 }) || (s.enemy_nodes.mock_grunt === 5 && s.enemy_nodes.mock_b_grunt === 1 && Object.keys(s.enemy_nodes).length === 2),
      out.P6);
  });

  // ── P. 獨立的關卡頁、手機寬度 ──
  await section("P7", async () => {
    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="enemy-preview-open"]', { timeout: 60000 });
    const n0 = await logLen();
    await openPreview("Mock P 多路線");
    const text = await previewText();
    await page.locator('[data-testid="enemy-preview-close"]').click();
    await H.sleep(300);
    const url1 = page.url();
    await openPreview("Mock Q 缺資料");
    const locked = await previewText();
    await page.locator('[data-testid="enemy-preview-close-bottom"]').click();
    await H.sleep(300);
    const url2 = page.url();
    const writes = (await logSince(n0)).filter((e) => WRITES.includes(e.action)).length;
    out.P7 = { url1, url2, writes, same: /共 2 波，全關 8 隻敵人/.test(text) && /路線：path_a、path_b/.test(text) };
    run.check("P-7 獨立關卡頁：同樣的預覽內容（共 2 波、8 隻、兩條路線）；鎖定關卡可查看；查看與關閉都留在關卡頁（沒有出征）、沒有寫入",
      out.P7.same && /鎖定/.test(locked) && /\/shenmaSanguo\/stages$/.test(url1) && /\/shenmaSanguo\/stages$/.test(url2) && writes === 0 && !(await isOpen()), out.P7);

    // 手機寬度：長清單展開所有波次，不能左右捲動；關閉按鈕在畫面內而且點得到
    const vp = page.viewportSize();
    await page.setViewportSize({ width: 375, height: 740 });
    await H.sleep(500);
    await openPreview("Mock Q 缺資料");
    for (const n of [2, 3]) await page.locator(`[data-testid="preview-wave-toggle-${n}"]`).click();
    const layout = await page.evaluate(() => {
      const hit = (sel) => {
        const el = document.querySelector(sel);
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { inView: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth, clickable: el === top || el.contains(top) };
      };
      return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, head: hit('[data-testid="enemy-preview-close"]') };
    });
    out.P7m = { layout, shot: await H.shot(page, "r16-p7-mobile-stages") };
    await page.locator('[data-testid="enemy-preview"] [class*="modalBody"]').evaluate((el) => el.scrollTo(0, el.scrollHeight));
    await H.sleep(300);
    const bottom = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="enemy-preview-close-bottom"]');
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { inView: r.bottom <= window.innerHeight, clickable: el === top || el.contains(top) };
    });
    out.P7m.bottom = bottom;
    out.P7m.shotBottom = await H.shot(page, "r16-p7-mobile-stages-bottom");
    await page.locator('[data-testid="enemy-preview-close-bottom"]').click();
    run.check("P-8 手機寬度（375×740）：展開所有波次後沒有左右捲動；上方與下方的關閉按鈕都在畫面內、點得到",
      layout.scrollW <= layout.innerW && layout.head.inView && layout.head.clickable && bottom.inView && bottom.clickable, out.P7m);
    if (vp) await page.setViewportSize(vp);
  });

  // ── P. 寫入限制中的分頁：仍可查看，底部提示不遮住關閉按鈕 ──
  await section("P9", async () => {
    await page.setViewportSize({ width: 375, height: 740 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    // session 帶著遷移狀態不明的限制標記：整個分頁受限（store 測試 R13F-H2）
    await page.evaluate(() => {
      const s = JSON.parse(sessionStorage.getItem("shenma_player_state"));
      s.migrationHold = { since: Date.now() };
      sessionStorage.setItem("shenma_player_state", JSON.stringify(s));
    });
    await page.reload();
    await H.waitHud(page);
    await page.waitForSelector("text=存檔暫停保存", { timeout: 30000 });
    const n0 = await logLen();
    await openStageList();
    await openPreview("Mock P 多路線");
    const text = await previewText();
    const hits = await page.evaluate(() => {
      const hit = (sel) => {
        const el = document.querySelector(sel);
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { clickable: el === top || el.contains(top), bottom: Math.round(r.bottom) };
      };
      const b = document.querySelector('[data-testid="enemy-preview"] [class*="modalBody"]');
      b.scrollTo(0, b.scrollHeight);
      return { head: hit('[data-testid="enemy-preview-close"]'), foot: hit('[data-testid="enemy-preview-close-bottom"]'), innerH: window.innerHeight };
    });
    await H.sleep(300);
    out.P9 = { hits, shot: await H.shot(page, "r16-p9-hold-mobile") };
    await page.locator('[data-testid="enemy-preview-close-bottom"]').click();
    await H.sleep(300);
    const writes = (await logSince(n0)).filter((e) => WRITES.includes(e.action)).length;
    out.P9.writes = writes;
    run.check("P-9 寫入限制中的分頁（手機寬度）：仍可查看預覽（同樣內容）；底部「存檔暫停保存」提示沒有遮住上方與下方的關閉按鈕；沒有寫入",
      /共 2 波，全關 8 隻敵人/.test(text) && hits.head.clickable && hits.foot.clickable && !(await isOpen()) && writes === 0, out.P9);
    await closeModals();
  });

  return run.finish({ out });
}
