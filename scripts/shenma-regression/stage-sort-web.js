async (page) => {
  // 敵軍組成的排列（瀏覽器，真 Godot 產物、mock 後端）：主頁的關卡選擇視窗與獨立的關卡頁共用同一個預覽
  // - 測試關（只在這支腳本加進 mock 名單，__shenma_ss_fixture）：第 3 章「討伐」（正式 chapter1_3 的兩條路線與 3 波，敵人換成 mock：
  //   grunt_lv2→步兵、grunt_lv3→B 步兵、cavalry_lv2→C 快騎、cavalry_lv3→衝鋒、siege_lv3→A 慢兵、siege_lv2→重甲）、
  //   「邊界」（找不到設定、數量無法判讀、數量 0、沒有路點的路線）、「刷新」（設定更新時數量會變）
  // - M 主頁：M-1 預設首次出現（和原本的順序、說明相同）；改成已確認隻數→全關 70 隻依隻數排、同數量依首次出現、說明寫實際的排列；
  //   換路線（組成的選單與路線預覽）保留排列、用那條路線的列重新排；收起再展開保留；關閉預覽再開回到首次出現；
  //   M-2 鍵盤：從依路線查看的選單 Tab 到排列、方向鍵改排列；M-3 邊界：排列不改資料問題、略過與總數說明；M-4 只操作預覽時不換關、不寫入
  // - P 獨立關卡頁：P-1 同樣的排列；P-2 設定更新（預覽開著）：保留排列，用新的數量重新排；P-3 390×600 選單在預覽裡、沒有橫向捲動；全程沒有寫入
  // - 前往首次出兵（組成每一列的按鈕）：G-1「討伐」C 快騎（正式 cavalry_lv2）全關第 1 波、path_b 第 3 波、path_a 第 1 波，依隻數排列也一樣；
  //   只展開那一波、導覽的選擇與說明同步、焦點在那一波的標題，路線與排列不變；G-2「進京」（正式 chapter1_5 的路線與 7 波）C 快騎全關第 2 波、
  //   path_a 第 2 波、path_b 第 4 波；G-3 鍵盤；G-4 資料不完整時寫「已確認的首次」；P-4 獨立關卡頁同樣與 390×600；P-2 設定更新後按鈕用新的波次
  // - 逐波隻數（組成每一列可展開的明細，預設收合）：W-1「進京」C 快騎全關第 2、3 波各 10、第 4～7 波各 20，path_a 第 2～7 波各 10，path_b 第 4～7 波各 10；
  //   「討伐」步兵全關第 3 波 20（同一波多組相加）、path_a 15；展開不改合計、首次、排列、路線、波次的展開與導覽；換路線後不在的列關掉；關閉重開全部收合；
  //   鎖定的關卡仍只是查看；W-2 鍵盤 Tab／Enter／空白鍵／Esc；W-3 資料不完整寫明只是已確認的部分；W-4 全程沒有送關卡資料或 update_team 給遊戲；
  //   W-5 獨立關卡頁同樣；W-6 設定更新（預覽開著）用新的逐波、刪掉的列關掉；W-7 390×600／390×844 明細在預覽裡、沒有橫向捲動
  // - 組成搜尋（名稱或 ID，去掉前後空白、不分大小寫，只篩選目前範圍已排列的列）：S-1「進京」預設和原本相同；名稱、大寫 ID、換路線保留查詢且不借全關、
  //   兩種排列、沒有符合、收起保留、關閉重開空白，小計寫明只是顯示的列；S-2 清除保留路線／排列／導覽、焦點回搜尋框、藏起過的列逐波已收合；
  //   S-3 鍵盤 Tab／打字／Enter 清除／Esc；S-4 資料不完整；S-5 沒有送東西給遊戲；S-6 獨立關卡頁同樣；S-7 設定更新保留查詢、用新的列重算；
  //   S-8 390×600／390×844。mock 敵人只是正式形狀的別名（不代表正式敵人的屬性），正式名稱的搜尋在 web/stage-rhythm.test.mjs；
  //   S-9 設定更新成只剩一種敵人時搜尋與排列藏起來、看不到的查詢與排列不影響列；S-10 變回多種時搜尋出現且空白（「單種」「多種」兩個測試關）
  // - 依已確認出現波數排列（排列選單第三項）：V-1「進京」全關與兩條路線的波數順序、只改順序、搜尋與清除、前往與逐波、關閉重開回到首次出現，
  //   「討伐」和依隻數的順序不同；V-2 鍵盤；V-3 資料不完整的說明；V-4 沒有送東西給遊戲；V-5 獨立關卡頁同樣；V-6 390×600／390×844；V-7 設定更新保留排列
  // - 前往末次已確認出兵（組成每一列的第二個前往按鈕，末次比首次晚才有）：L-1「進京」全關與兩條路線各自的末次（C 快騎全關 2→7、path_b 4→7）、
  //   排列／搜尋／收起再展開後跟著列、關閉重開回到預設，「討伐」全關、依波數排列與兩條路線；L-2 首末同一波不重複；L-3 鍵盤；
  //   L-4 資料不完整寫「已確認的末次」；L-5 沒有送東西給遊戲（之後 M-4 再核不換關、不寫入）；L-6 獨立關卡頁同樣；L-7 390×600／390×844。
  //   W-2 的鍵盤順序因此變成前往首次 → 前往末次 → 逐波
  // - 逐波明細前往那一波（明細每一筆已確認的波次旁邊的按鈕，明細原本的「第 N 波 ×M」不變）：N-1「進京」「討伐」六個範圍每一列的按鈕和正式設定
  //   算出的逐波波次相同（路線用自己的波次），按中間的波與路線自己的波、依隻數排列與搜尋後跟著列、收合時沒有按鈕、關閉重開收合；
  //   N-2 資料不完整寫「已確認的」；N-3 鍵盤；N-4 沒有送東西給遊戲（之後 M-4 再核不換關、不寫入）；N-5 獨立關卡頁同樣；N-6 390×600／390×844。
  //   按鈕在逐波按鈕之後，W-2 的鍵盤順序（收合時）不變
  // 全部 mock、虛構金鑰 test_sort_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_sort_a";

  // ── 測試關（get_all_maps 的回應後面接上）──
  // 正式 chapter1_3（討伐黃巾）的路線
  const A13 = [[0, 1], [1, 1], [1, 1], [2, 1], [2, 1], [3, 1], [3, 1], [3, 2], [3, 2], [3, 3], [3, 3], [3, 4], [3, 4], [3, 5], [3, 5], [4, 5], [4, 5], [5, 5], [5, 5], [5, 6], [5, 6], [5, 7], [5, 7], [5, 8], [5, 8], [6, 8], [6, 8], [7, 8], [7, 8], [8, 8], [8, 8], [9, 8], [9, 8], [9, 7], [9, 7], [9, 6], [9, 6], [9, 5], [9, 5], [10, 5], [10, 5], [11, 5], [11, 5], [12, 5], [12, 5], [13, 5], [13, 5]];
  const B13 = [[0, 8], [0, 8], [1, 8], [1, 8], [2, 8], [2, 8], [3, 8], [3, 8], [3, 7], [3, 7], [3, 6], [3, 6], [3, 5], [4, 5], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [9, 2], [9, 3], [9, 4], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5]];
  const extra = { spawn: [0, 5], base: [13, 5], build_zones: [], obstacles: [], background_texture: "maps/bg_forest.webp" };
  const g = (enemy_id, count, interval, path) => ({ enemy_id, count, interval, path });
  const stage = (map_id, name, paths, waves) => ({ map_id, chapter: 3, name, unlock_stage: map_id, path_json: { ...extra, cols: 14, rows: 11, paths }, waves });
  const [G2, G3, C2, C3, S3, S2] = ["mock_grunt", "mock_b_grunt", "mock_c_fast", "mock_rusher", "mock_a_slow", "mock_t_tank"];
  // 「進京」另外用到的：grunt_lv1→傷兵、cavalry_lv1→前鋒、siege_lv1→A 慢兵、siege_lv3→飛騎（九種正式敵人各對一種 mock）
  const [GL1, CL1, SL1, SL3] = ["mock_t_weak", "mock_t_front", "mock_a_slow", "mock_flyer"];
  // 正式 chapter1_5（董卓進京）的路線
  const A15 = [[0, 5], [1, 5], [2, 5], [3, 5], [3, 6], [3, 7], [3, 8], [4, 8], [5, 8], [5, 7], [5, 6], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [6, 1], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7], [7, 8], [8, 8], [9, 8], [9, 7], [9, 6], [9, 5], [9, 4], [9, 3], [9, 2], [9, 1], [9, 0]];
  const B15 = [[13, 8], [13, 7], [13, 6], [13, 5], [13, 4], [13, 3], [13, 2], [13, 1], [12, 1], [11, 1], [11, 2], [11, 3], [11, 4], [11, 5], [11, 6], [11, 7], [11, 8], [10, 8], [9, 8], [9, 7], [9, 6], [9, 5], [9, 4], [9, 3], [9, 2], [9, 1], [9, 0]];
  const FRESH_REFRESH = stage("chapter3_4", "Mock SS 刷新", { path_a: [[0, 5], [13, 5]] }, [
    { wave: 1, enemies: [g(G2, 2, 1, "path_a"), g(G3, 3, 1, "path_a")] },
  ]);
  // 過期的設定快取裡的「刷新」：步兵 9 隻、多一組 C 快騎 4 隻
  const STALE_REFRESH = { ...FRESH_REFRESH, waves: [{ wave: 1, enemies: [g(G2, 9, 1, "path_a"), g(C2, 4, 1, "path_a")] }, { wave: 2, enemies: [g(G3, 3, 1, "path_a")] }] };
  // 設定更新時敵人種類變成一種（「單種」：過期的設定是步兵＋C 快騎）與變回多種（「多種」：過期的設定只有步兵）
  const FRESH_ONE = stage("chapter3_5", "Mock SS 單種", { path_a: [[0, 5], [13, 5]] }, [{ wave: 1, enemies: [g(G2, 4, 1, "path_a")] }]);
  const STALE_ONE = { ...FRESH_ONE, waves: [{ wave: 1, enemies: [g(G2, 4, 1, "path_a"), g(C2, 3, 1, "path_a")] }] };
  const FRESH_TWO = stage("chapter3_6", "Mock SS 多種", { path_a: [[0, 5], [13, 5]] }, [{ wave: 1, enemies: [g(G2, 4, 1, "path_a"), g(C2, 3, 1, "path_a")] }]);
  const STALE_TWO = { ...FRESH_TWO, waves: [{ wave: 1, enemies: [g(G2, 4, 1, "path_a")] }] };
  const EXTRA_MAPS = [
    stage("chapter3_1", "Mock SS 討伐", { path_a: A13, path_b: B13 }, [
      { wave: 1, enemies: [g(G2, 5, 1.5, "path_a"), g(G3, 5, 1.5, "path_a"), g(C2, 5, 1.5, "path_a")] },
      { wave: 2, enemies: [g(G2, 5, 1.5, "path_a"), g(S3, 5, 1.5, "path_b"), g(S2, 5, 1.5, "path_b")] },
      { wave: 3, enemies: [g(G2, 5, 1.5, "path_a"), g(C2, 5, 1.5, "path_b"), g(C3, 10, 1.5, "path_a"), g(S3, 5, 1.5, "path_b"), g(G2, 10, 1.5, "path_a"), g(G2, 5, 1.5, "path_b")] },
    ]),
    stage("chapter3_2", "Mock SS 進京", { path_a: A15, path_b: B15 }, [
      { wave: 1, enemies: [g(GL1, 10, 1.5, "path_a"), g(CL1, 10, 1.1, "path_a"), g(SL1, 10, 1.1, "path_a")] },
      { wave: 2, enemies: [g(G2, 10, 1.1, "path_a"), g(C2, 10, 1.1, "path_a"), g(SL1, 10, 1.1, "path_b")] },
      { wave: 3, enemies: [g(GL1, 10, 1.1, "path_a"), g(C2, 10, 1.1, "path_a"), g(S2, 10, 1.5, "path_a"), g(S2, 10, 1.5, "path_b")] },
      { wave: 4, enemies: [g(G2, 10, 1.1, "path_a"), g(C2, 10, 1.1, "path_a"), g(S2, 10, 1.1, "path_b"), g(C2, 10, 1.1, "path_b")] },
      { wave: 5, enemies: [g(G2, 10, 1.1, "path_a"), g(C2, 10, 1.1, "path_a"), g(S2, 10, 1.1, "path_a"), g(G2, 10, 1.1, "path_b"), g(C2, 10, 1.1, "path_b"), g(S2, 10, 1.1, "path_b")] },
      { wave: 6, enemies: [g(G2, 10, 1.1, "path_a"), g(C2, 10, 1.1, "path_a"), g(S2, 10, 1.1, "path_a"), g(C3, 10, 1.1, "path_b"), g(G2, 10, 1.1, "path_b"), g(C2, 10, 1.1, "path_b"), g(S2, 10, 1.1, "path_b")] },
      { wave: 7, enemies: [g(G2, 10, 1.1, "path_a"), g(C2, 10, 1.1, "path_a"), g(S2, 10, 1.1, "path_a"), g(C3, 10, 1.6, "path_a"), g(G3, 10, 1.6, "path_a"), g(G2, 10, 1.1, "path_b"), g(C2, 10, 1.1, "path_b"), g(S2, 10, 1.1, "path_b"), g(SL3, 10, 1.6, "path_b")] },
    ]),
    stage("chapter3_3", "Mock SS 邊界", { path_a: [[0, 5], [13, 5]], path_b: [[0, 8], [13, 8]] }, [
      { wave: 1, enemies: [g(G2, 2, 1, "path_a"), g(G3, 6, 1, "path_b"), g("mock_ss_ghost", 9, 1, "path_a")] },
      { wave: 2, enemies: [g(G2, 3, 1, "path_a"), g(C2, "many", 1, "path_b"), g(S2, 0, 1, "path_a"), g(C3, 2, 1, "path_z")] },
    ]),
    FRESH_REFRESH,
    FRESH_ONE,
    FRESH_TWO,
  ];
  await ctx.addInitScript(({ maps }) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_ss_fixture") === "1") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (body.action === "get_all_maps") {
          const res = await inner(input, init);
          const j = await res.clone().json().catch(() => null);
          if (!(j && j.status === 200 && Array.isArray(j.maps))) return res;
          j.maps = [...j.maps, ...maps];
          return new Response(JSON.stringify(j), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }
      return inner(input, init);
    };
  }, { maps: EXTRA_MAPS });

  const WRITES = ["save_profile", "save_result", "upgrade_hero", "create_profile"];
  const profile = { nickname: "組成排列", level: 1, exp: 0, gold: 900, capacity: 30, max_stage: "chapter1_7", heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }] };

  // ── 輔助 ──
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const gasActions = async () => H.countActions(await H.gasLog(page));
  const writes = (a) => WRITES.reduce((s, k) => s + (a[k] || 0), 0);
  const waitSync = (st, timeout = 90000) =>
    page.waitForFunction((st) => document.querySelector(`[data-sync-status="${st}"]`) !== null, st, { timeout, polling: 200 });
  const section = async (name, fn) => {
    try {
      await fn();
    } catch (e) {
      run.check(`${name}：執行時發生例外`, false, String(e && e.stack ? e.stack.split("\n").slice(0, 3).join(" | ") : e).slice(0, 400));
      try { out[name + "_shot"] = await H.shot(page, `stage-sort-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
    }
  };
  const press = async (key) => {
    await page.keyboard.press(key);
    await H.sleep(150);
  };
  const openPreview = async (mapId) => {
    await page.locator(`[data-testid="stage-card"][data-map-id="${mapId}"] [data-testid="enemy-preview-open"]`).click();
    await page.waitForSelector('[data-testid="enemy-preview"]', { timeout: 10000 });
    await H.sleep(200);
  };
  const closePreview = async () => {
    await press("Escape");
    await page.waitForFunction(() => !document.querySelector('[data-testid="enemy-preview"]'), null, { timeout: 10000 });
  };
  const pick = async (testid, value) => {
    await page.locator(`[data-testid="${testid}"]`).selectOption(value);
    await H.sleep(150);
  };
  // 組成的狀態
  const comp = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"]');
    const c = p && p.querySelector('[data-testid="preview-composition"]');
    if (!c) return null;
    const text = (x) => x?.innerText.replace(/\s+/g, " ").trim() ?? null;
    const sel = c.querySelector('[data-testid="preview-composition-sort"]');
    return {
      sort: c.dataset.sort, route: c.dataset.route, complete: c.dataset.complete,
      header: text(c.querySelector('[data-testid="preview-composition-toggle"]')),
      expanded: c.querySelector('[data-testid="preview-composition-toggle"]')?.getAttribute("aria-expanded"),
      select: sel ? { value: sel.value, options: [...sel.options].map((o) => o.textContent.trim()) } : null,
      summary: text(c.querySelector('[data-testid="preview-composition-summary"]')),
      gaps: [...c.querySelectorAll('[data-testid="preview-composition-gap"]')].map(text),
      unknown: text(c.querySelector('[data-testid="preview-composition-unknown"]')),
      skipped: text(c.querySelector('[data-testid="preview-composition-route-skipped"]')),
      rows: [...c.querySelectorAll('[data-testid="preview-composition-row"]')].map((x) => [x.dataset.enemyId, Number(x.dataset.count), x.dataset.waves]),
      routeLines: [...p.querySelectorAll('[data-testid="preview-route-line"]')].map((l) => l.dataset.routeId),
      waveHeaders: [...p.querySelectorAll('[data-testid^="preview-wave-toggle-"]')].map(text),
      focus: document.activeElement?.dataset?.testid ?? null,
    };
  });

  // 前往首次出兵：組成列的按鈕、展開的波次、導覽的選擇與說明、焦點、路線與排列
  const gotoBtn = (enemyId) => page.locator(`[data-testid="preview-composition-row"][data-enemy-id="${enemyId}"] [data-testid="preview-composition-goto"]`);
  const nav = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"]');
    const c = p.querySelector('[data-testid="preview-composition"]');
    return {
      open: [...p.querySelectorAll('[data-testid^="preview-wave-toggle-"]')].filter((t) => t.getAttribute("aria-expanded") === "true").map((t) => Number(t.dataset.testid.replace("preview-wave-toggle-", ""))),
      select: p.querySelector('[data-testid="preview-wave-select"]')?.value ?? null,
      status: p.querySelector('[data-testid="preview-wave-nav-status"]')?.innerText.trim() ?? null,
      focus: document.activeElement?.dataset?.testid ?? null,
      route: c?.dataset.route ?? null,
      sort: c?.dataset.sort ?? null,
      buttons: [...p.querySelectorAll('[data-testid="preview-composition-row"]')].map((r) => { const b = r.querySelector('[data-testid="preview-composition-goto"]'); return [r.dataset.enemyId, b ? Number(b.dataset.wave) : null, b ? b.innerText.trim() : null, b ? b.getAttribute("aria-label") : null]; }),
    };
  });
  const goto = async (enemyId) => {
    await gotoBtn(enemyId).click();
    await H.sleep(350);
    return nav();
  };
  const waveOf = (n, id) => (n.buttons.find((b) => b[0] === id) || [])[1] ?? null;
  const landed = (n, wave, route, sort, label) =>
    !!n && JSON.stringify(n.open) === JSON.stringify([wave]) && n.select === String(wave) && n.focus === `preview-wave-toggle-${wave}` &&
    n.status === `已前往第 ${wave} 波（${label}）` && n.route === route && n.sort === sort;
  // G-1／P-4 共用：「討伐」的 C 快騎（正式 cavalry_lv2：全關 1、path_a 1、path_b 3）
  const gotoFlow = async () => {
    await openPreview("chapter3_1");
    const n0 = await nav();
    const all = await goto(C2);
    await pick("preview-composition-route", "route:path_b");
    await pick("preview-composition-sort", "count");
    const nb = await nav();
    const b = await goto(C2);
    await pick("preview-composition-route", "route:path_a");
    const a = await goto(C2);
    await closePreview();
    return { n0, all, nb, b, a };
  };
  const gotoFlowOk = ({ n0, all, nb, b, a }) =>
    waveOf(n0, C2) === 1 && /^前往首次出兵（第 1 波）$/.test((n0.buttons.find((x) => x[0] === C2) || [])[2] || "") &&
    /C 快騎/.test((n0.buttons.find((x) => x[0] === C2) || [])[3] || "") && /第 1 波/.test((n0.buttons.find((x) => x[0] === C2) || [])[3] || "") &&
    landed(all, 1, "", "first", "C 快騎的首次出兵") &&
    waveOf(nb, C2) === 3 && /在路線 path_b/.test((nb.buttons.find((x) => x[0] === C2) || [])[3] || "") &&
    landed(b, 3, "path_b", "count", "C 快騎的首次出兵") &&
    landed(a, 1, "path_a", "count", "C 快騎的首次出兵");

  // 前往末次已確認出兵：組成列的第二個前往按鈕（末次比首次晚才有；首末同一波或沒有已確認的筆數時不加）
  const lastBtn = (enemyId) => page.locator(`[data-testid="preview-composition-row"][data-enemy-id="${enemyId}"] [data-testid="preview-composition-goto-last"]`);
  const lasts = () => page.evaluate(() => {
    const c = document.querySelector('[data-testid="enemy-preview"] [data-testid="preview-composition"]');
    return {
      route: c.dataset.route, sort: c.dataset.sort,
      rows: [...c.querySelectorAll('[data-testid="preview-composition-row"]')].map((r) => {
        const f = r.querySelector('[data-testid="preview-composition-goto"]');
        const l = [...r.querySelectorAll('[data-testid="preview-composition-goto-last"]')];
        const b = l[0];
        return {
          id: r.dataset.enemyId, first: f ? Number(f.dataset.wave) : null, last: b ? Number(b.dataset.wave) : null, n: l.length,
          text: b ? b.innerText.replace(/\s+/g, " ").trim() : null, label: b ? b.getAttribute("aria-label") : null,
        };
      }),
    };
  });
  // 每一列：[別名, 首次, 末次（沒有按鈕是 null）]
  const fl = (s) => s.rows.map((r) => [r.id, r.first, r.last]);
  const flSorted = (s) => fl(s).map((r) => r.join("|")).sort();
  const tableSorted = (t) => t.map((r) => r.join("|")).sort();
  const lastRow = (s, id) => s.rows.find((r) => r.id === id) || null;
  // 按鈕不在（不該不見時）不去點它，讓斷言以具名的失敗呈現，不是點擊逾時
  const gotoLast = async (enemyId) => {
    if ((await lastBtn(enemyId).count()) !== 1) return null;
    await lastBtn(enemyId).click();
    await H.sleep(350);
    return nav();
  };
  // 「進京」（正式 chapter1_5：grunt_lv1→傷兵、cavalry_lv1→前鋒、siege_lv1→A 慢兵、grunt_lv2→步兵、cavalry_lv2→C 快騎、siege_lv2→重甲、
  // cavalry_lv3→衝鋒、grunt_lv3→B 步兵、siege_lv3→飛騎）：首次與末次是正式設定算出的（cavalry_lv2 path_b 首次 4、末次 7）
  const LAST_ALL_15 = [[GL1, 1, 3], [CL1, 1, null], [SL1, 1, 2], [G2, 2, 7], [C2, 2, 7], [S2, 3, 7], [C3, 6, 7], [G3, 7, null], [SL3, 7, null]];
  const LAST_A_15 = [[GL1, 1, 3], [CL1, 1, null], [SL1, 1, null], [G2, 2, 7], [C2, 2, 7], [S2, 3, 7], [C3, 7, null], [G3, 7, null]];
  const LAST_B_15 = [[SL1, 2, null], [S2, 3, 7], [C2, 4, 7], [G2, 5, 7], [C3, 6, null], [SL3, 7, null]];
  // 「討伐」（正式 chapter1_3：grunt_lv2→步兵、grunt_lv3→B 步兵、cavalry_lv2→C 快騎、cavalry_lv3→衝鋒、siege_lv3→A 慢兵、siege_lv2→重甲）
  const LAST_ALL_13 = [[G2, 1, 3], [G3, 1, null], [C2, 1, 3], [S3, 2, 3], [S2, 2, null], [C3, 3, null]];
  const LAST_A_13 = [[G2, 1, 3], [G3, 1, null], [C2, 1, null], [C3, 3, null]];
  const LAST_B_13 = [[S3, 2, 3], [S2, 2, null], [C2, 3, null], [G2, 3, null]];
  // 按鈕：每一列最多一個；文字寫末次的波次（資料不完整時寫「已確認的末次」），aria-label 寫前往、路線（選了路線時）與末次的波次
  const lastLabelsOk = (s, route, complete = true) =>
    s.rows.every((r) =>
      r.last === null
        ? r.n === 0
        : r.n === 1 && r.text === `${complete ? "前往末次出兵" : "前往已確認的末次出兵"}（第 ${r.last} 波）` &&
          (r.label || "").startsWith("前往") && (r.label || "").endsWith(`${complete ? "末次出兵" : "已確認的末次出兵"}的第 ${r.last} 波`) &&
          (route ? (r.label || "").includes(`在路線 ${route} `) : !(r.label || "").includes("在路線")));
  // L-1／L-6 共用
  const lastFlow = async () => {
    await openPreview("chapter3_2");
    const l0 = await lasts();
    const gAll = await gotoLast(C2);
    await pick("preview-composition-route", "route:path_a");
    const la = await lasts();
    await pick("preview-composition-route", "route:path_b");
    const lb = await lasts();
    const gB = await gotoLast(C2);
    await pick("preview-composition-sort", "count");
    const lbc = await lasts();
    await search("步兵");
    const lbs = await lasts();
    const gS = await gotoLast(G2);
    await page.locator('[data-testid="preview-composition-toggle"]').click();
    await H.sleep(150);
    await page.locator('[data-testid="preview-composition-toggle"]').click();
    await H.sleep(150);
    const lce = await lasts();
    await closePreview();
    await openPreview("chapter3_2");
    const lr = await lasts();
    await closePreview();
    await openPreview("chapter3_1");
    const t0 = await lasts();
    await pick("preview-composition-sort", "waves");
    const tw = await lasts();
    await pick("preview-composition-route", "route:path_a");
    const ta = await lasts();
    await pick("preview-composition-route", "route:path_b");
    const tb = await lasts();
    const gT = await gotoLast(S3);
    await closePreview();
    return { l0, gAll, la, lb, gB, lbc, lbs, gS, lce, lr, t0, tw, ta, tb, gT };
  };
  const lastFlowOk = ({ l0, gAll, la, lb, gB, lbc, lbs, gS, lce, lr, t0, tw, ta, tb, gT }) =>
    same(fl(l0), LAST_ALL_15) && lastLabelsOk(l0, null) && /C 快騎/.test(lastRow(l0, C2)?.label || "") &&
    landed(gAll, 7, "", "first", "C 快騎的末次出兵") &&
    la.route === "path_a" && same(fl(la), LAST_A_15) && lastLabelsOk(la, "path_a") &&
    lb.route === "path_b" && same(fl(lb), LAST_B_15) && lastLabelsOk(lb, "path_b") &&
    landed(gB, 7, "path_b", "first", "C 快騎的末次出兵") &&
    lbc.sort === "count" && same(flSorted(lbc), tableSorted(LAST_B_15)) && lbc.rows[0].id === S2 &&
    same(fl(lbs), [[G2, 5, 7]]) && landed(gS, 7, "path_b", "count", "步兵的末次出兵") &&
    lce.route === "path_b" && lce.sort === "count" && same(fl(lce), [[G2, 5, 7]]) &&
    lr.route === "" && lr.sort === "first" && same(fl(lr), LAST_ALL_15) &&
    same(fl(t0), LAST_ALL_13) && lastLabelsOk(t0, null) &&
    tw.sort === "waves" && same(flSorted(tw), tableSorted(LAST_ALL_13)) &&
    same(flSorted(ta), tableSorted(LAST_A_13)) && same(flSorted(tb), tableSorted(LAST_B_13)) && lastLabelsOk(tb, "path_b") &&
    landed(gT, 3, "path_b", "waves", "A 慢兵的末次出兵");

  // 逐波隻數：組成列的明細按鈕、展開的內容，以及展開不該動到的東西（合計、首次、排列、路線、波次的展開與導覽）
  const IFRAME = 'iframe[title="Shenma Sanguo"]';
  const detailBtn = (enemyId) => page.locator(`[data-testid="preview-composition-row"][data-enemy-id="${enemyId}"] [data-testid="preview-composition-detail-toggle"]`);
  const details = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"]');
    const c = p.querySelector('[data-testid="preview-composition"]');
    const text = (x) => x?.innerText.replace(/\s+/g, " ").trim() ?? null;
    return {
      route: c.dataset.route, sort: c.dataset.sort,
      header: text(c.querySelector('[data-testid="preview-composition-toggle"]')),
      summary: text(c.querySelector('[data-testid="preview-composition-summary"]')),
      badge: text(p.querySelector('[class*="modalHeader"] [class*="previewBadge"]')),
      lockedNote: p.innerText.includes("這一關尚未解鎖：只能查看敵軍，不能出征。"),
      rows: [...c.querySelectorAll('[data-testid="preview-composition-row"]')].map((r) => {
        const t = r.querySelector('[data-testid="preview-composition-detail-toggle"]');
        const d = r.querySelector('[data-testid="preview-composition-detail"]');
        return {
          id: r.dataset.enemyId, count: Number(r.dataset.count),
          goto: Number(r.querySelector('[data-testid="preview-composition-goto"]')?.dataset.wave ?? NaN),
          expanded: t ? t.getAttribute("aria-expanded") : null, label: t ? t.getAttribute("aria-label") : null, text: t ? t.innerText.trim() : null,
          controls: t && d ? t.getAttribute("aria-controls") === d.id : null,
          detail: d ? { head: text(d.firstElementChild), waves: [...d.querySelectorAll('[data-testid="preview-composition-detail-wave"]')].map((x) => [Number(x.dataset.wave), Number(x.dataset.count), x.innerText.trim()]) } : null,
        };
      }),
      open: [...p.querySelectorAll('[data-testid^="preview-wave-toggle-"]')].filter((t) => t.getAttribute("aria-expanded") === "true").map((t) => Number(t.dataset.testid.replace("preview-wave-toggle-", ""))),
      navSelect: p.querySelector('[data-testid="preview-wave-select"]')?.value ?? null,
      navStatus: p.querySelector('[data-testid="preview-wave-nav-status"]')?.innerText.trim() ?? null,
      focus: document.activeElement?.dataset?.testid ?? null,
      focusRow: document.activeElement?.closest('[data-testid="preview-composition-row"]')?.dataset.enemyId ?? null,
    };
  });
  const rowOf = (d, id) => d.rows.find((r) => r.id === id) || null;
  // 展開的逐波：[[波次, 隻數], ...]；文字要是「第 N 波 ×M」
  const wavesOf = (d, id) => {
    const r = rowOf(d, id);
    if (!r || !r.detail) return null;
    return r.detail.waves.every((x) => x[2] === `第 ${x[0]} 波 ×${x[1]}`) ? r.detail.waves.map((x) => [x[0], x[1]]) : "文字不符";
  };
  // 合計、首次與列的順序（展開明細不該改變）
  const facts = (d) => d.rows.map((r) => [r.id, r.count, r.goto]);
  const expandedIds = (d) => d.rows.filter((r) => r.expanded === "true").map((r) => r.id);
  const toggleDetail = async (enemyId) => {
    await detailBtn(enemyId).click();
    await H.sleep(200);
    return details();
  };
  // 「進京」（正式 chapter1_5）的 C 快騎與「討伐」（正式 chapter1_3）的步兵
  const C2_15 = { all: [[2, 10], [3, 10], [4, 20], [5, 20], [6, 20], [7, 20]], path_a: [[2, 10], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10]], path_b: [[4, 10], [5, 10], [6, 10], [7, 10]] };
  const G2_13 = { all: [[1, 5], [2, 5], [3, 20]], path_a: [[1, 5], [2, 5], [3, 15]] };
  // W-1／W-5 共用
  const detailFlow = async () => {
    await openPreview("chapter3_2");
    const d0 = await details();
    const d1 = await toggleDetail(C2);
    await pick("preview-composition-sort", "count");
    const d2 = await details();
    await pick("preview-composition-route", "route:path_a");
    const da = await details();
    await pick("preview-composition-route", "route:path_b");
    const db = await details();
    const dc = await toggleDetail(C2);
    // 前鋒（正式 cavalry_lv1）只在 path_a：全關展開→換到 path_b（這一列不在）→回到全部，明細已關掉
    await pick("preview-composition-route", "");
    const dp0 = await toggleDetail(CL1);
    await pick("preview-composition-route", "route:path_b");
    const dp1 = await details();
    await pick("preview-composition-route", "");
    const dp2 = await details();
    await closePreview();
    await openPreview("chapter3_2");
    const dr = await details();
    await closePreview();
    await openPreview("chapter3_1");
    const t1 = await toggleDetail(G2);
    await pick("preview-composition-route", "route:path_a");
    const t2 = await details();
    await closePreview();
    return { d0, d1, d2, da, db, dc, dp0, dp1, dp2, dr, t1, t2 };
  };
  const detailFlowOk = ({ d0, d1, d2, da, db, dc, dp0, dp1, dp2, dr, t1, t2 }) =>
    d0.rows.length === 9 && expandedIds(d0).length === 0 && d0.rows.every((r) => r.expanded === "false" && !r.detail) &&
    rowOf(d0, C2).count === 100 && rowOf(d0, C2).goto === 2 && rowOf(d0, C2).text === "▸ 逐波隻數（6 波）" &&
    d0.badge === "鎖定" && d0.lockedNote &&
    same(expandedIds(d1), [C2]) && same(wavesOf(d1, C2), C2_15.all) && rowOf(d1, C2).detail.head === "全關逐波已確認隻數：" && rowOf(d1, C2).controls === true &&
    rowOf(d1, C2).text === "▾ 逐波隻數（6 波）" && /C 快騎/.test(rowOf(d1, C2).label || "") && /6 波/.test(rowOf(d1, C2).label || "") &&
    same(facts(d1), facts(d0)) && d1.header === d0.header && d1.summary === d0.summary && same(d1.open, d0.open) &&
    d1.navSelect === d0.navSelect && d1.navStatus === d0.navStatus && d1.route === "" && d1.sort === "first" &&
    d2.sort === "count" && d2.rows[0].id === C2 && same(expandedIds(d2), [C2]) && same(wavesOf(d2, C2), C2_15.all) && same(d2.open, d0.open) &&
    da.route === "path_a" && rowOf(da, C2).count === 60 && same(wavesOf(da, C2), C2_15.path_a) && rowOf(da, C2).detail.head === "路線 path_a 逐波已確認隻數：" &&
    /在路線 path_a/.test(rowOf(da, C2).label || "") &&
    db.route === "path_b" && rowOf(db, C2).count === 40 && rowOf(db, C2).goto === 4 && same(wavesOf(db, C2), C2_15.path_b) && same(db.open, d0.open) &&
    rowOf(dc, C2).expanded === "false" && !rowOf(dc, C2).detail &&
    same(expandedIds(dp0), [CL1]) && same(wavesOf(dp0, CL1), [[1, 10]]) && !rowOf(dp1, CL1) && dp1.rows.length === 6 &&
    !!rowOf(dp2, CL1) && rowOf(dp2, CL1).expanded === "false" && expandedIds(dp2).length === 0 &&
    dr.sort === "first" && expandedIds(dr).length === 0 && dr.rows.every((r) => !r.detail) &&
    same(wavesOf(t1, G2), G2_13.all) && rowOf(t1, G2).count === 30 && same(wavesOf(t2, G2), G2_13.path_a) && rowOf(t2, G2).count === 25;

  // 逐波明細前往那一波：明細每一筆旁邊的前往按鈕（只有已確認的筆數；文字與說明寫波次，資料不完整時寫「已確認的」）
  const dgBtn = (enemyId, wave) => page.locator(`[data-testid="preview-composition-row"][data-enemy-id="${enemyId}"] [data-testid="preview-composition-detail-goto"][data-wave="${wave}"]`);
  const dgState = () => page.evaluate(() => {
    const c = document.querySelector('[data-testid="enemy-preview"] [data-testid="preview-composition"]');
    return {
      route: c.dataset.route, sort: c.dataset.sort,
      rows: [...c.querySelectorAll('[data-testid="preview-composition-row"]')].map((r) => {
        const d = r.querySelector('[data-testid="preview-composition-detail"]');
        const ws = d ? [...d.querySelectorAll('[data-testid="preview-composition-detail-wave"]')] : [];
        return {
          id: r.dataset.enemyId, open: !!d,
          waves: ws.map((x) => Number(x.dataset.wave)), texts: ws.map((x) => x.innerText.trim()),
          buttons: [...r.querySelectorAll('[data-testid="preview-composition-detail-goto"]')].map((b) => ({
            wave: Number(b.dataset.wave), text: b.innerText.replace(/\s+/g, " ").trim(), label: b.getAttribute("aria-label"), inDetail: !!d && d.contains(b),
          })),
        };
      }),
    };
  });
  // 展開目前範圍每一列的逐波明細（已展開的不再按）
  const openAllDetails = async () => {
    const list = await page.evaluate(() => [...document.querySelectorAll('[data-testid="enemy-preview"] [data-testid="preview-composition-row"]')].map((r) => r.dataset.enemyId));
    for (const id of list) {
      if ((await detailBtn(id).getAttribute("aria-expanded")) !== "true") {
        await detailBtn(id).click();
        await H.sleep(120);
      }
    }
    return dgState();
  };
  // 按鈕不在（不該不見時）不去點它，讓斷言以具名的失敗呈現，不是點擊逾時
  const gotoDetail = async (enemyId, wave) => {
    if ((await dgBtn(enemyId, wave).count()) !== 1) return null;
    await dgBtn(enemyId, wave).click();
    await H.sleep(350);
    return nav();
  };
  // 每一列：[別名, [明細前往按鈕的波次...]]
  const dwOf = (s) => s.rows.map((r) => [r.id, r.buttons.map((b) => b.wave)]);
  // 每一列都展開、按鈕和明細已確認的每一筆一對一（同一波不重複、不多不少），都在明細裡；明細原本的文字不變；
  // 文字寫波次（資料不完整時寫「已確認的」），aria-label 寫前往、敵人、路線（選了路線時）與出兵的波次
  const dgLabelsOk = (s, route, complete = true) =>
    s.rows.every((r) =>
      r.open && r.buttons.length > 0 && same(r.buttons.map((b) => b.wave), r.waves) && r.texts.every((t) => /^第 \d+ 波 ×\d+$/.test(t)) &&
      r.buttons.every((b) => b.inDetail && b.text === `${complete ? "前往" : "前往已確認的"}第 ${b.wave} 波` &&
        (b.label || "").startsWith("前往") && (b.label || "").endsWith(`${complete ? "出兵" : "已確認出兵"}的第 ${b.wave} 波`) &&
        (complete ? !(b.label || "").includes("已確認") : true) &&
        (route ? (b.label || "").includes(`在路線 ${route} `) : !(b.label || "").includes("在路線"))));
  const dgRow = (s, id) => s.rows.find((r) => r.id === id) || null;
  // 正式設定算出的逐波已確認波次（別名同上；chapter1_5 C 快騎全關第 2～7 波、path_b 第 4～7 波）：
  // 期望先和正式 raw 的獨立計算、工作樹的計算與審查的依據逐列核對過才寫死
  const DW_ALL_13 = [[G2, [1, 2, 3]], [G3, [1]], [C2, [1, 3]], [S3, [2, 3]], [S2, [2]], [C3, [3]]];
  const DW_A_13 = [[G2, [1, 2, 3]], [G3, [1]], [C2, [1]], [C3, [3]]];
  const DW_B_13 = [[S3, [2, 3]], [S2, [2]], [C2, [3]], [G2, [3]]];
  const DW_ALL_15 = [[GL1, [1, 3]], [CL1, [1]], [SL1, [1, 2]], [G2, [2, 4, 5, 6, 7]], [C2, [2, 3, 4, 5, 6, 7]], [S2, [3, 4, 5, 6, 7]], [C3, [6, 7]], [G3, [7]], [SL3, [7]]];
  const DW_A_15 = [[GL1, [1, 3]], [CL1, [1]], [SL1, [1]], [G2, [2, 4, 5, 6, 7]], [C2, [2, 3, 4, 5, 6, 7]], [S2, [3, 5, 6, 7]], [C3, [7]], [G3, [7]]];
  const DW_B_15 = [[SL1, [2]], [S2, [3, 4, 5, 6, 7]], [C2, [4, 5, 6, 7]], [G2, [5, 6, 7]], [C3, [6]], [SL3, [7]]];
  // N-1／N-5 共用
  const dgFlow = async () => {
    await openPreview("chapter3_2");
    const z0 = await dgState();
    const all15 = await openAllDetails();
    const gMid = await gotoDetail(C2, 4);
    await pick("preview-composition-route", "route:path_a");
    const a15 = await openAllDetails();
    await pick("preview-composition-route", "route:path_b");
    const b15 = await openAllDetails();
    const gB = await gotoDetail(C2, 5);
    await pick("preview-composition-sort", "count");
    await search("步兵");
    const bs = await dgState();
    const gS = await gotoDetail(G2, 6);
    await detailBtn(G2).click();
    await H.sleep(150);
    const bc = await dgState();
    await detailBtn(G2).click();
    await H.sleep(150);
    const bo = await dgState();
    await closePreview();
    await openPreview("chapter3_2");
    const zr = await dgState();
    await closePreview();
    await openPreview("chapter3_1");
    const all13 = await openAllDetails();
    await pick("preview-composition-route", "route:path_a");
    const a13 = await openAllDetails();
    await pick("preview-composition-route", "route:path_b");
    const b13 = await openAllDetails();
    const gT = await gotoDetail(S3, 3);
    await closePreview();
    return { z0, all15, gMid, a15, b15, gB, bs, gS, bc, bo, zr, all13, a13, b13, gT };
  };
  const dgFlowOk = ({ z0, all15, gMid, a15, b15, gB, bs, gS, bc, bo, zr, all13, a13, b13, gT }) =>
    z0.rows.length === 9 && z0.rows.every((r) => !r.open && r.buttons.length === 0) &&
    same(dwOf(all15), DW_ALL_15) && dgLabelsOk(all15, null) && (dgRow(all15, C2)?.buttons || []).every((b) => /C 快騎/.test(b.label || "")) &&
    landed(gMid, 4, "", "first", "C 快騎的出兵") &&
    a15.route === "path_a" && same(dwOf(a15), DW_A_15) && dgLabelsOk(a15, "path_a") &&
    b15.route === "path_b" && same(dwOf(b15), DW_B_15) && dgLabelsOk(b15, "path_b") &&
    landed(gB, 5, "path_b", "first", "C 快騎的出兵") &&
    bs.sort === "count" && same(dwOf(bs), [[G2, [5, 6, 7]]]) && dgLabelsOk(bs, "path_b") && landed(gS, 6, "path_b", "count", "步兵的出兵") &&
    same(dwOf(bc), [[G2, []]]) && !bc.rows[0].open && same(dwOf(bo), [[G2, [5, 6, 7]]]) && dgLabelsOk(bo, "path_b") &&
    zr.route === "" && zr.sort === "first" && zr.rows.length === 9 && zr.rows.every((r) => !r.open && r.buttons.length === 0) &&
    same(dwOf(all13), DW_ALL_13) && dgLabelsOk(all13, null) &&
    a13.route === "path_a" && same(dwOf(a13), DW_A_13) && dgLabelsOk(a13, "path_a") &&
    b13.route === "path_b" && same(dwOf(b13), DW_B_13) && dgLabelsOk(b13, "path_b") &&
    landed(gT, 3, "path_b", "first", "A 慢兵的出兵");
  // 送給遊戲 iframe 的訊息（Web → Godot）
  const watchSent = () => page.evaluate((sel) => {
    const f = document.querySelector(sel);
    if (!f) return false;
    const w = f.contentWindow;
    window.__ssSent = [];
    if (!w.__ssWrapped) {
      const orig = w.postMessage.bind(w);
      w.postMessage = (m, o) => {
        if (m && m.__godot_bridge) window.__ssSent.push(m.type);
        return orig(m, o);
      };
      w.__ssWrapped = true;
    }
    return true;
  }, IFRAME);
  const sentTypes = () => page.evaluate(() => window.__ssSent || null);

  // 組成搜尋：搜尋框、清除鈕、符合的小計，以及搜尋不該動到的東西（組成的標題與說明、資料問題、列的內容、路線、排列、導覽）
  const sstate = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"]');
    const c = p.querySelector('[data-testid="preview-composition"]');
    const text = (x) => x?.innerText.replace(/\s+/g, " ").trim() ?? null;
    const input = c.querySelector('[data-testid="preview-composition-search"]');
    const clear = c.querySelector('[data-testid="preview-composition-search-clear"]');
    const rows = [...c.querySelectorAll('[data-testid="preview-composition-row"]')];
    return {
      route: c.dataset.route, sort: c.dataset.sort,
      header: text(c.querySelector('[data-testid="preview-composition-toggle"]')),
      summary: text(c.querySelector('[data-testid="preview-composition-summary"]')),
      gaps: [...c.querySelectorAll('[data-testid="preview-composition-gap"]')].map(text),
      unknown: text(c.querySelector('[data-testid="preview-composition-unknown"]')),
      search: input ? input.value : null, clearDisabled: clear ? clear.disabled : null,
      searchSummary: text(c.querySelector('[data-testid="preview-composition-search-summary"]')),
      rows: rows.map((r) => [r.dataset.enemyId, Number(r.dataset.count), Number(r.querySelector('[data-testid="preview-composition-goto"]')?.dataset.wave ?? NaN)]),
      expanded: rows.filter((r) => r.querySelector('[data-testid="preview-composition-detail-toggle"]')?.getAttribute("aria-expanded") === "true").map((r) => r.dataset.enemyId),
      badge: text(p.querySelector('[class*="modalHeader"] [class*="previewBadge"]')),
      open: [...p.querySelectorAll('[data-testid^="preview-wave-toggle-"]')].filter((t) => t.getAttribute("aria-expanded") === "true").map((t) => Number(t.dataset.testid.replace("preview-wave-toggle-", ""))),
      navSelect: p.querySelector('[data-testid="preview-wave-select"]')?.value ?? null,
      navStatus: p.querySelector('[data-testid="preview-wave-nav-status"]')?.innerText.trim() ?? null,
      focus: document.activeElement?.dataset?.testid ?? null,
    };
  });
  const search = async (v) => {
    await page.locator('[data-testid="preview-composition-search"]').fill(v);
    await H.sleep(150);
    return sstate();
  };
  const ids = (s) => s.rows.map((r) => r[0]);
  const sub = (s) => s.rows.reduce((t, r) => t + r[1], 0);
  // 「進京」（正式 chapter1_5 的形狀；別名：grunt_lv1→傷兵、cavalry_lv1→前鋒、siege_lv1→A 慢兵、grunt_lv2→步兵、cavalry_lv2→C 快騎、
  // siege_lv2→重甲、cavalry_lv3→衝鋒、grunt_lv3→B 步兵、siege_lv3→飛騎）：全關 9 種 360 隻
  const FIRST_15 = [GL1, CL1, SL1, G2, C2, S2, C3, G3, SL3];
  const searchNote = (q, n, y, scope) => `符合搜尋「${q}」${n} 種，已確認 ${y} 隻（只是下面列出的列的小計，不是${scope}的總數）。`;
  // S-1／S-6 共用
  const searchFlow = async () => {
    await openPreview("chapter3_2");
    const s0 = await sstate();
    const s1 = await search("步兵");
    const s2 = await search(" MOCK_C_FAST ");
    await pick("preview-composition-route", "route:path_a");
    const s3 = await sstate();
    await pick("preview-composition-route", "route:path_b");
    const s4 = await sstate();
    const s5 = await search("步兵");
    await pick("preview-composition-route", "");
    const s6 = await search("兵");
    await pick("preview-composition-sort", "count");
    const s7 = await sstate();
    const s8 = await search("no_such");
    await page.locator('[data-testid="preview-composition-toggle"]').click();
    await H.sleep(150);
    await page.locator('[data-testid="preview-composition-toggle"]').click();
    await H.sleep(150);
    const s9 = await sstate();
    await closePreview();
    await openPreview("chapter3_2");
    const s10 = await sstate();
    await closePreview();
    return { s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10 };
  };
  const searchFlowOk = ({ s0, s1, s2, s3, s4, s5, s6, s7, s8, s9, s10 }) =>
    s0.search === "" && s0.clearDisabled === true && s0.searchSummary === null && same(ids(s0), FIRST_15) && sub(s0) === 360 && s0.badge === "鎖定" &&
    same(ids(s1), [G2, G3]) && sub(s1) === 90 && s1.searchSummary === searchNote("步兵", 2, 90, "全關") && s1.clearDisabled === false &&
    s1.header === s0.header && s1.summary === s0.summary && same(s1.rows, s0.rows.filter((r) => [G2, G3].includes(r[0]))) && same(s1.open, s0.open) && s1.navSelect === s0.navSelect &&
    same(s2.rows, [[C2, 100, 2]]) && s2.searchSummary === searchNote("MOCK_C_FAST", 1, 100, "全關") && s2.search === " MOCK_C_FAST " &&
    s3.route === "path_a" && same(s3.rows, [[C2, 60, 2]]) && s3.search === " MOCK_C_FAST " && s3.searchSummary === searchNote("MOCK_C_FAST", 1, 60, "路線 path_a ") &&
    s4.route === "path_b" && same(s4.rows, [[C2, 40, 4]]) && s4.searchSummary === searchNote("MOCK_C_FAST", 1, 40, "路線 path_b ") && /路線 path_b 共 150 隻/.test(s4.summary || "") &&
    same(s5.rows, [[G2, 30, 5]]) && s5.searchSummary === searchNote("步兵", 1, 30, "路線 path_b ") &&
    s6.route === "" && s6.sort === "first" && same(ids(s6), [GL1, SL1, G2, G3]) && sub(s6) === 130 &&
    s7.sort === "count" && same(ids(s7), [G2, GL1, SL1, G3]) && sub(s7) === 130 && s7.searchSummary === searchNote("兵", 4, 130, "全關") && s7.search === "兵" &&
    s8.rows.length === 0 && s8.searchSummary === "全關沒有符合搜尋「no_such」的已確認敵人。" && s8.header === s0.header && s8.summary === s7.summary &&
    s9.search === "no_such" && s9.sort === "count" && s9.rows.length === 0 &&
    s10.search === "" && s10.sort === "first" && s10.searchSummary === null && same(s10.rows, s0.rows);
  // 依已確認出兵的波數排列：「進京」（正式 chapter1_5 的形狀）各範圍依波數由多到少、同波數依首次出現（正式的 enemy_id 寫在後面）
  const WAVES_ALL_15 = [C2, G2, S2, GL1, SL1, C3, CL1, G3, SL3]; // cavalry_lv2 6、grunt_lv2 5、siege_lv2 5、grunt_lv1 2、siege_lv1 2、cavalry_lv3 2、cavalry_lv1 1、grunt_lv3 1、siege_lv3 1
  const WAVES_A_15 = [C2, G2, S2, GL1, CL1, SL1, C3, G3]; // 6、5、4、2、1、1、1、1
  const WAVES_B_15 = [S2, C2, G2, SL1, C3, SL3]; // 5、4、3、1、1、1
  // 每一列逐波按鈕上的波數（「逐波隻數（N 波）」）
  const waveCounts = (d) => d.rows.map((r) => `${r.id}:${((r.text || "").match(/（(\d+) 波）/) || [])[1] ?? "?"}`).join(" ");
  // V-1／V-5 共用
  const wavesFlow = async () => {
    await openPreview("chapter3_2");
    const v0 = await sstate();
    await pick("preview-composition-sort", "waves");
    const v1 = await sstate();
    const d1 = await details();
    await pick("preview-composition-route", "route:path_a");
    const v2 = await sstate();
    await pick("preview-composition-route", "route:path_b");
    const v3 = await sstate();
    const v4 = await search("步兵");
    await pick("preview-composition-route", "");
    const v5 = await search("兵");
    await page.locator('[data-testid="preview-composition-search-clear"]').click();
    await H.sleep(200);
    const v6 = await sstate();
    const g6 = await goto(C2);
    const d6 = await toggleDetail(C2);
    await closePreview();
    await openPreview("chapter3_2");
    const v7 = await sstate();
    await closePreview();
    // 「討伐」（正式 chapter1_3）：依波數和依隻數的順序不同
    await openPreview("chapter3_1");
    await pick("preview-composition-sort", "waves");
    const t1 = await sstate();
    await pick("preview-composition-sort", "count");
    const t2 = await sstate();
    await closePreview();
    return { v0, v1, waves1: waveCounts(d1), v2, v3, v4, v5, v6, g6, d6: wavesOf(d6, C2), v7, t1, t2 };
  };
  // 每一列的隻數與首次（和列的順序無關，排序後比較）
  const factOf = (s) => s.rows.map((r) => r.join("|")).sort();
  const wavesFlowOk = ({ v0, v1, waves1, v2, v3, v4, v5, v6, g6, d6, v7, t1, t2 }) =>
    v0.sort === "first" && same(ids(v0), FIRST_15) &&
    v1.sort === "waves" && same(ids(v1), WAVES_ALL_15) && same(factOf(v1), factOf(v0)) && v1.header === v0.header &&
    v1.summary === "全關共 360 隻、9 種敵人（依已確認出兵的波數由多到少（這個範圍裡已確認出兵的波），同波數依第一次出現）。" &&
    waves1 === [C2, G2, S2, GL1, SL1, C3, CL1, G3, SL3].map((x, i) => `${x}:${[6, 5, 5, 2, 2, 2, 1, 1, 1][i]}`).join(" ") &&
    v2.route === "path_a" && v2.sort === "waves" && same(ids(v2), WAVES_A_15) &&
    v3.route === "path_b" && same(ids(v3), WAVES_B_15) && same((v3.rows.find((r) => r[0] === C2) || []).slice(1), [40, 4]) &&
    same(v4.rows, [[G2, 30, 5]]) && v4.sort === "waves" &&
    same(ids(v5), [G2, GL1, SL1, G3]) && v5.searchSummary === searchNote("兵", 4, 130, "全關") &&
    v6.search === "" && v6.sort === "waves" && same(ids(v6), WAVES_ALL_15) &&
    landed(g6, 2, "", "waves", "C 快騎的首次出兵") && same(d6, C2_15.all) &&
    v7.sort === "first" && same(ids(v7), FIRST_15) &&
    same(ids(t1), [G2, C2, S3, G3, S2, C3]) && same(ids(t2), COUNT_ALL.map((r) => r[0])) && !same(ids(t1), ids(t2));
  // 設定更新：注入過期的設定、攔住讀取再重新載入，之後由呼叫端放行
  const staleReload = async (stales, waitMapId) => {
    await page.evaluate((stales) => {
      const raw = JSON.parse(localStorage.getItem("shenma_static_config"));
      raw.maps = raw.maps.map((m) => stales.find((s) => s.map_id === m.map_id) || m);
      localStorage.setItem("shenma_static_config", JSON.stringify(raw));
      localStorage.setItem("shenma_static_ts", "0");
      localStorage.setItem("__shenma_mock_hold", JSON.stringify(["get_all_maps"]));
    }, stales);
    await page.reload();
    await page.waitForSelector(`[data-testid="stage-card"][data-map-id="${waitMapId}"]`, { timeout: 60000 });
    await page.evaluate(() => localStorage.removeItem("__shenma_mock_hold"));
    await page.waitForFunction(() => window.__shenmaMock.pending("get_all_maps").length === 1, null, { timeout: 30000, polling: 100 });
  };

  // 「討伐」的預期（正式 chapter1_3：全關 70、path_a 45、path_b 25）
  const FIRST_ALL = [[G2, 30, ""], [G3, 5, ""], [C2, 10, ""], [S3, 10, ""], [S2, 5, ""], [C3, 10, ""]];
  const COUNT_ALL = [[G2, 30, ""], [C2, 10, ""], [S3, 10, ""], [C3, 10, ""], [G3, 5, ""], [S2, 5, ""]];
  const COUNT_A = [[G2, 25, "1,2,3"], [C3, 10, "3"], [G3, 5, "1"], [C2, 5, "1"]];
  const COUNT_B = [[S3, 10, "2,3"], [S2, 5, "2"], [C2, 5, "3"], [G2, 5, "3"]];
  // M-1／P-1 共用
  const sortFlow = async () => {
    await openPreview("chapter3_1");
    const s0 = await comp();
    await pick("preview-composition-sort", "count");
    const s1 = await comp();
    await pick("preview-composition-route", "route:path_a");
    const sa = await comp();
    await page.locator('[data-testid="preview-route-toggle"]').click();
    await H.sleep(150);
    await pick("preview-route-select", "route:path_b");
    const sb = await comp();
    await page.locator('[data-testid="preview-composition-toggle"]').click();
    await H.sleep(150);
    const sc = await comp();
    await page.locator('[data-testid="preview-composition-toggle"]').click();
    await H.sleep(150);
    const se = await comp();
    await pick("preview-composition-route", "");
    const sAll = await comp();
    await closePreview();
    await openPreview("chapter3_1");
    const sr = await comp();
    await closePreview();
    return { s0, s1, sa, sb, sc, se, sAll, sr };
  };
  const sortFlowOk = ({ s0, s1, sa, sb, sc, se, sAll, sr }) =>
    s0.sort === "first" && same(s0.select.options, ["首次出現", "已確認隻數（多→少）", "已確認出現波數（多→少）"]) && s0.select.value === "first" &&
    same(s0.rows, FIRST_ALL) && s0.summary === "全關共 70 隻、6 種敵人（依第一次出現的順序）。" && s0.header === "▾ 敵軍組成 共 70 隻" &&
    s1.sort === "count" && same(s1.rows, COUNT_ALL) && s1.summary === "全關共 70 隻、6 種敵人（依已確認隻數由多到少，同數量依第一次出現）。" &&
    s1.header === s0.header && same(s1.waveHeaders, s0.waveHeaders) &&
    sa.sort === "count" && sa.route === "path_a" && same(sa.rows, COUNT_A) && sa.header === "▾ 敵軍組成 path_a：共 45 隻" &&
    /路線 path_a 共 45 隻、4 種敵人（全關 70 隻中的這條路線；依已確認隻數由多到少，同數量依第一次出現），出兵在第 1、2、3 波。/.test(sa.summary || "") &&
    sb.sort === "count" && sb.route === "path_b" && same(sb.rows, COUNT_B) && same(sb.routeLines, ["path_b"]) && sb.header === "▾ 敵軍組成 path_b：共 25 隻" &&
    sc.expanded === "false" && sc.rows.length === 0 && se.expanded === "true" && se.sort === "count" && same(se.rows, COUNT_B) &&
    sAll.sort === "count" && same(sAll.rows, COUNT_ALL) &&
    sr.sort === "first" && sr.select.value === "first" && same(sr.rows, FIRST_ALL) && sr.summary === s0.summary;

  // ── 設定 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_ss_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, p: profile });
  });

  // ── M 主頁 ──
  let mFlow = null;
  await section("main", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const s0 = await H.snapshot(page);
    const a0 = await gasActions();
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 10000 });

    // M-1
    mFlow = await sortFlow();
    out.M1 = mFlow;
    run.check("M-1 預設首次出現（和原本的順序與說明相同）；改成已確認隻數→全關 70 隻依隻數排（步兵 30、C 快騎、A 慢兵、衝鋒各 10、B 步兵、重甲各 5，同數量依首次出現），說明寫實際的排列、總數與波次標題不變；" +
      "換到 path_a（組成選單）與 path_b（路線預覽）保留排列、用那條路線的列重新排；收起再展開保留；回到全部仍是隻數排列；關閉預覽再開回到首次出現",
      sortFlowOk(mFlow), out.M1);

    // M-2 鍵盤：依路線查看的選單 Tab 到排列，方向鍵改成已確認隻數
    await openPreview("chapter3_1");
    await page.locator('[data-testid="preview-composition-route"]').focus();
    await press("Tab");
    const k1 = await comp();
    await press("ArrowDown");
    const k2 = await comp();
    await closePreview();
    out.M2 = { focus: k1.focus, sort: k2.sort, rows: k2.rows };
    run.check("M-2 鍵盤：從依路線查看的選單按 Tab 就到排列，按方向鍵改成已確認隻數、列跟著重排",
      k1.focus === "preview-composition-sort" && k2.sort === "count" && same(k2.rows, COUNT_ALL), out.M2);

    // M-3 邊界：資料問題、略過與總數說明不受排列影響
    await openPreview("chapter3_3");
    const e0 = await comp();
    await pick("preview-composition-sort", "count");
    const e1 = await comp();
    await pick("preview-composition-route", "route:path_a");
    const ea = await comp();
    await closePreview();
    out.M3 = { e0, e1, ea };
    run.check("M-3 邊界：全關只寫已確認（B 步兵 6、步兵 5）；改成已確認隻數→B 步兵 6 排在步兵 5 前面，說明加註排列，資料問題、找不到設定的敵人與標題都和首次出現時相同；" +
      "path_a 只有步兵 5（找不到設定的組照樣寫略過 1 組）",
      e0.complete === "false" && same(e0.rows.map((r) => [r[0], r[1]]), [[G2, 5], [G3, 6]]) &&
        same(e1.rows.map((r) => [r[0], r[1]]), [[G3, 6], [G2, 5]]) && e1.header === e0.header &&
        e1.summary === e0.summary + "依已確認隻數由多到少排列。" && same(e1.gaps, e0.gaps) && e1.unknown === e0.unknown && /mock_ss_ghost/.test(e1.unknown || "") &&
        ea.sort === "count" && same(ea.rows.map((r) => [r[0], r[1]]), [[G2, 5]]) && /這條路線另有 \d+ 組遊戲會略過/.test(ea.skipped || ""),
      out.M3);

    // G-1 前往首次出兵（正式 chapter1_3 的 C 快騎）
    const gf = await gotoFlow();
    out.G1 = gf;
    run.check("G-1 前往首次出兵（正式 cavalry_lv2＝C 快騎）：全關列的按鈕寫第 1 波、說明含敵人與波次，按下只展開第 1 波、導覽選擇與說明同步、焦點在第 1 波的標題；" +
      "換到 path_b 並依隻數排列→按鈕改成第 3 波（用這條路線自己的首次，不借全關的），按下到第 3 波、路線與排列不變；path_a→第 1 波",
      gotoFlowOk(gf), out.G1);

    // G-2 進京（正式 chapter1_5）：C 快騎全關第 2 波、path_a 第 2 波、path_b 第 4 波
    await openPreview("chapter3_2");
    const j0 = await nav();
    const jAll = await goto(C2);
    await pick("preview-composition-route", "route:path_a");
    const jA = await goto(C2);
    await pick("preview-composition-route", "route:path_b");
    const jb0 = await nav();
    const jB = await goto(C2);
    await closePreview();
    out.G2 = { all: waveOf(j0, C2), a: waveOf(jA, C2), b: waveOf(jb0, C2), jAll, jA, jB };
    run.check("G-2 正式 chapter1_5 形狀：C 快騎（cavalry_lv2）全關第 2 波、path_a 第 2 波、path_b 第 4 波，各自按下都到那一波、導覽與焦點同步",
      waveOf(j0, C2) === 2 && waveOf(jb0, C2) === 4 && landed(jAll, 2, "", "first", "C 快騎的首次出兵") &&
        landed(jA, 2, "path_a", "first", "C 快騎的首次出兵") && landed(jB, 4, "path_b", "first", "C 快騎的首次出兵"),
      out.G2);

    // G-3 鍵盤：聚焦按鈕後按 Enter
    await openPreview("chapter3_1");
    await pick("preview-composition-route", "route:path_b");
    await gotoBtn(G2).focus();
    await press("Enter");
    await H.sleep(300);
    const kb3 = await nav();
    await closePreview();
    out.G3 = kb3;
    run.check("G-3 鍵盤：path_b 的步兵（正式 grunt_lv2，這條路線首次在第 3 波）按鈕用 Enter 也能前往第 3 波、焦點在那一波的標題",
      landed(kb3, 3, "path_b", "first", "步兵的首次出兵"), out.G3);

    // G-4 資料不完整：寫「已確認的首次」
    await openPreview("chapter3_3");
    const inc = await nav();
    const incGo = await goto(G3);
    await closePreview();
    out.G4 = { buttons: inc.buttons, incGo };
    run.check("G-4 資料不完整（找不到設定、數量無法判讀）：按鈕寫「前往已確認的首次出兵（第 N 波）」，B 步兵在第 1 波，按下到第 1 波、說明寫已確認的首次",
      inc.buttons.length === 2 && inc.buttons.every((b) => /^前往已確認的首次出兵（第 \d+ 波）$/.test(b[2] || "")) && waveOf(inc, G3) === 1 &&
        landed(incGo, 1, "", "first", "B 步兵已確認的首次出兵"),
      out.G4);

    // W-1 逐波隻數（主頁）：記錄送給遊戲的訊息
    const watching = await watchSent();
    const wf = await detailFlow();
    out.W1 = wf;
    run.check("W-1 逐波隻數（正式 chapter1_5 的 C 快騎）：預設每一列都收合；展開後全關第 2、3 波各 10、第 4～7 波各 20，合計 100、首次第 2 波、列的順序、說明、波次的展開與導覽都不變；" +
      "依隻數排列仍展開；path_a 第 2～7 波各 10、path_b 第 4～7 波各 10（用那條路線自己的逐波）；只在 path_a 的前鋒換到 path_b 後關掉；關閉重開全部收合；" +
      "「討伐」步兵全關第 3 波 20（同一波多組相加）、path_a 15；鎖定的關卡仍只是查看",
      watching && detailFlowOk(wf), out.W1);

    // W-2 鍵盤：從前往按鈕 Tab 到明細按鈕，Enter 展開、空白鍵收合、Enter 再展開，Esc 只關閉預覽、焦點回到開啟它的按鈕
    await openPreview("chapter3_2");
    await gotoBtn(C2).focus();
    await press("Tab");
    const wkLast = await page.evaluate(() => [document.activeElement?.dataset?.testid ?? null, document.activeElement?.closest('[data-testid="preview-composition-row"]')?.dataset.enemyId ?? null]);
    await press("Tab");
    const wk0 = await details();
    await press("Enter");
    const wk1 = await details();
    await press(" ");
    const wk2 = await details();
    await press("Enter");
    const wk3 = await details();
    await press("Escape");
    await H.sleep(300);
    const wkEsc = await page.evaluate(() => ({
      open: !!document.querySelector('[data-testid="enemy-preview"]'),
      stageModal: !!document.querySelector('[data-testid="stage-filter-bar"]'),
      focus: document.activeElement?.dataset?.testid ?? null,
      focusMap: document.activeElement?.closest('[data-testid="stage-card"]')?.dataset.mapId ?? null,
    }));
    out.W2 = { wkLast, wk0: [wk0.focus, wk0.focusRow], wk1: [wk1.focus, expandedIds(wk1)], wk2: [wk2.focus, expandedIds(wk2)], wk3: wavesOf(wk3, C2), wkEsc };
    run.check("W-2 鍵盤：C 快騎的前往首次按鈕按 Tab 到同一列的前往末次按鈕、再按 Tab 到逐波按鈕；Enter 展開、空白鍵收合、Enter 再展開（焦點都留在按鈕上）；Esc 只關閉預覽，焦點回到「進京」的敵軍預覽按鈕",
      same(wkLast, ["preview-composition-goto-last", C2]) &&
      wk0.focus === "preview-composition-detail-toggle" && wk0.focusRow === C2 &&
        wk1.focus === "preview-composition-detail-toggle" && same(expandedIds(wk1), [C2]) &&
        wk2.focus === "preview-composition-detail-toggle" && expandedIds(wk2).length === 0 &&
        same(wavesOf(wk3, C2), C2_15.all) &&
        !wkEsc.open && wkEsc.stageModal && wkEsc.focus === "enemy-preview-open" && wkEsc.focusMap === "chapter3_2",
      out.W2);

    // W-3 資料不完整：寫明只是已確認的部分，沒有已確認出兵的波次不列
    await openPreview("chapter3_3");
    const we0 = await toggleDetail(G2);
    const we1 = await toggleDetail(G3);
    await closePreview();
    out.W3 = { g2: wavesOf(we0, G2), g3: wavesOf(we1, G3), head: rowOf(we1, G3)?.detail?.head ?? null, rows: facts(we1) };
    run.check("W-3 資料不完整（找不到設定、數量無法判讀、數量 0、沒有路點的路線）：步兵第 1 波 2、第 2 波 3，B 步兵只有第 1 波 6；說明寫只列已確認的出兵、有資料問題的波次可能還有，不補 0",
      same(out.W3.g2, [[1, 2], [2, 3]]) && same(out.W3.g3, [[1, 6]]) &&
        out.W3.head === "全關逐波已確認隻數（只列已確認的出兵；有資料問題的波次可能還有這個敵人）：",
      out.W3);

    // W-4 送給遊戲的訊息
    const sent = await sentTypes();
    out.W4 = { watching, sent };
    run.check("W-4 主頁操作逐波隻數（W-1～W-3）的期間沒有送任何訊息給遊戲（沒有關卡資料、update_team 或命令）",
      watching && Array.isArray(sent) && sent.length === 0, out.W4);

    // S-1 組成搜尋（主頁）：重新記錄送給遊戲的訊息
    const sWatching = await watchSent();
    const sf = await searchFlow();
    out.S1 = sf;
    run.check("S-1 組成搜尋（「進京」，正式 chapter1_5 的形狀）：預設空白、清除停用、9 種 360 隻和原本相同、鎖定仍只是查看；「步兵」→步兵 80、B 步兵 10，小計 2 種 90 隻（寫明只是顯示的列的小計），組成的標題與說明、列的內容與導覽不變；" +
      "「 MOCK_C_FAST 」（大寫加前後空白）只有 C 快騎 100；換到 path_a 保留查詢→60、path_b→40（總數說明仍是這條路線的 150）；path_b 的「步兵」只有步兵 30（不借全關的 B 步兵）；" +
      "「兵」首次出現是傷兵、A 慢兵、步兵、B 步兵，改依隻數排列是步兵、傷兵、A 慢兵、B 步兵（130 隻）；沒有符合寫全關沒有符合的已確認敵人、標題不變；收起再展開保留查詢與排列；關閉重開回到空白",
      sWatching && searchFlowOk(sf), out.S1);

    // S-2 清除：保留路線、排列與波次導覽，焦點回到搜尋框；被搜尋藏起的列的逐波明細已關掉
    await openPreview("chapter3_2");
    await pick("preview-composition-route", "route:path_a");
    await pick("preview-composition-sort", "count");
    await goto(C2);
    await toggleDetail(C2);
    const c0 = await sstate();
    const c1 = await search("步兵");
    await page.locator('[data-testid="preview-composition-search-clear"]').click();
    await H.sleep(200);
    const c2 = await sstate();
    await closePreview();
    out.S2 = { c0, c1, c2 };
    run.check("S-2 清除：path_a、依隻數排列、已前往 C 快騎的第 2 波並展開它的逐波；搜尋「步兵」藏起 C 快騎；按清除→搜尋框空白、焦點回到搜尋框、清除鈕停用，路線、排列、展開的波次、導覽的選擇與說明都不變，C 快騎回來但逐波已收合",
      same(c0.expanded, [C2]) && same(c0.open, [2]) && c0.navSelect === "2" &&
        !ids(c1).includes(C2) && c1.expanded.length === 0 &&
        c2.search === "" && c2.focus === "preview-composition-search" && c2.clearDisabled === true && c2.route === "path_a" && c2.sort === "count" &&
        same(c2.open, c0.open) && c2.navSelect === c0.navSelect && c2.navStatus === c0.navStatus && same(c2.rows, c0.rows) && c2.expanded.length === 0 && c2.searchSummary === null,
      out.S2);

    // S-3 鍵盤：排列選單 Tab 到搜尋框，打字篩選，Tab 到清除、Enter 清除，Esc 只關閉預覽、焦點回到開啟它的按鈕
    await openPreview("chapter3_2");
    await page.locator('[data-testid="preview-composition-sort"]').focus();
    await press("Tab");
    const sk0 = await sstate();
    await page.keyboard.type("步兵");
    await H.sleep(200);
    const sk1 = await sstate();
    await press("Tab");
    const sk2 = await sstate();
    await press("Enter");
    const sk3 = await sstate();
    await page.keyboard.type("騎");
    await H.sleep(200);
    const sk4 = await sstate();
    await press("Escape");
    await H.sleep(300);
    const skEsc = await page.evaluate(() => ({
      open: !!document.querySelector('[data-testid="enemy-preview"]'),
      stageModal: !!document.querySelector('[data-testid="stage-filter-bar"]'),
      focus: document.activeElement?.dataset?.testid ?? null,
      focusMap: document.activeElement?.closest('[data-testid="stage-card"]')?.dataset.mapId ?? null,
    }));
    out.S3 = { sk0: sk0.focus, sk1: [sk1.search, ids(sk1)], sk2: sk2.focus, sk3: [sk3.search, sk3.focus, sk3.rows.length], sk4: [sk4.search, ids(sk4)], skEsc };
    run.check("S-3 鍵盤：排列選單按 Tab 到搜尋框；打「步兵」只剩步兵與 B 步兵；Tab 到清除、Enter 清除後回到 9 種且焦點在搜尋框；再打「騎」是 C 快騎與飛騎；Esc 只關閉預覽，焦點回到「進京」的敵軍預覽按鈕",
      sk0.focus === "preview-composition-search" && sk1.search === "步兵" && same(ids(sk1), [G2, G3]) &&
        sk2.focus === "preview-composition-search-clear" && sk3.search === "" && sk3.focus === "preview-composition-search" && sk3.rows.length === 9 &&
        sk4.search === "騎" && same(ids(sk4), [C2, SL3]) &&
        !skEsc.open && skEsc.stageModal && skEsc.focus === "enemy-preview-open" && skEsc.focusMap === "chapter3_2",
      out.S3);

    // S-4 資料不完整：沒有符合時說只比對已確認的，資料問題與找不到設定的說明照舊
    await openPreview("chapter3_3");
    const e0s = await sstate();
    const e1s = await search("ghost");
    const e2s = await search("MOCK_B");
    await closePreview();
    out.S4 = { e0s, e1s, e2s };
    run.check("S-4 資料不完整（「邊界」）：搜尋找不到設定的 ghost 沒有列，寫全關沒有符合的已確認敵人並註明只比對已確認的出兵；資料問題、找不到設定的說明、標題與總數說明都不變；「MOCK_B」只有 B 步兵 6",
      e1s.rows.length === 0 && e1s.searchSummary === "全關沒有符合搜尋「ghost」的已確認敵人（只比對已確認的出兵；有資料問題的部分可能還有）。" &&
        same(e1s.gaps, e0s.gaps) && e1s.unknown === e0s.unknown && /mock_ss_ghost/.test(e1s.unknown || "") && e1s.header === e0s.header && e1s.summary === e0s.summary &&
        same(e2s.rows.map((r) => [r[0], r[1]]), [[G3, 6]]),
      out.S4);

    // S-5 送給遊戲的訊息
    const sSent = await sentTypes();
    out.S5 = { sWatching, sSent };
    run.check("S-5 主頁操作組成搜尋（S-1～S-4）的期間沒有送任何訊息給遊戲（沒有關卡資料、update_team 或命令）",
      sWatching && Array.isArray(sSent) && sSent.length === 0, out.S5);

    // V-1 依已確認出兵的波數排列（主頁）：重新記錄送給遊戲的訊息
    const vWatching = await watchSent();
    const vf = await wavesFlow();
    out.V1 = vf;
    run.check("V-1 依已確認出現波數排列（「進京」，正式 chapter1_5 的形狀）：C 快騎 6 波、步兵與重甲各 5 波、傷兵／A 慢兵／衝鋒各 2 波、其餘 1 波（同波數依首次出現），每一列的隻數與首次、標題不變，說明寫依波數；" +
      "path_a 與 path_b 用各自的波數（path_b 的 C 快騎 4 波、40 隻）；path_b 搜「步兵」只有步兵；全關搜「兵」照波數是步兵、傷兵、A 慢兵、B 步兵，清除後排列仍是波數；前往 C 快騎到第 2 波、逐波明細不變；關閉重開回到首次出現；" +
      "「討伐」依波數（衝鋒排最後）和依隻數的順序不同",
      vWatching && wavesFlowOk(vf), out.V1);

    // V-2 鍵盤：排列選單用方向鍵從首次出現→已確認隻數→已確認出現波數，Esc 只關閉預覽
    await openPreview("chapter3_2");
    await page.locator('[data-testid="preview-composition-sort"]').focus();
    await press("ArrowDown");
    const vk1 = await sstate();
    await press("ArrowDown");
    const vk2 = await sstate();
    await press("Escape");
    await H.sleep(300);
    const vkEsc = await page.evaluate(() => ({
      open: !!document.querySelector('[data-testid="enemy-preview"]'),
      focus: document.activeElement?.dataset?.testid ?? null,
      focusMap: document.activeElement?.closest('[data-testid="stage-card"]')?.dataset.mapId ?? null,
    }));
    out.V2 = { vk1: [vk1.sort, vk1.focus], vk2: [vk2.sort, vk2.focus, ids(vk2)], vkEsc };
    run.check("V-2 鍵盤：排列選單按方向鍵依序是已確認隻數、已確認出現波數（列跟著重排，焦點留在選單）；Esc 只關閉預覽，焦點回到「進京」的敵軍預覽按鈕",
      vk1.sort === "count" && vk1.focus === "preview-composition-sort" && vk2.sort === "waves" && vk2.focus === "preview-composition-sort" && same(ids(vk2), WAVES_ALL_15) &&
        !vkEsc.open && vkEsc.focus === "enemy-preview-open" && vkEsc.focusMap === "chapter3_2",
      out.V2);

    // V-3 資料不完整：依波數排列時另外註明只算已確認的波，資料問題照舊
    await openPreview("chapter3_3");
    const ve0 = await sstate();
    await pick("preview-composition-sort", "waves");
    const ve1 = await sstate();
    await closePreview();
    out.V3 = { ve0, ve1 };
    run.check("V-3 資料不完整（「邊界」）：依已確認出現波數排列後是步兵（2 波）、B 步兵（1 波），說明在原本之後加「依已確認出兵的波數由多到少排列（只算已確認的波）。」，資料問題、找不到設定與標題都不變",
      same(ids(ve1), [G2, G3]) && ve1.summary === ve0.summary + "依已確認出兵的波數由多到少排列（只算已確認的波）。" &&
        same(ve1.gaps, ve0.gaps) && ve1.unknown === ve0.unknown && ve1.header === ve0.header,
      out.V3);

    // V-4 送給遊戲的訊息
    const vSent = await sentTypes();
    out.V4 = { vWatching, vSent };
    run.check("V-4 主頁操作依波數排列（V-1～V-3）的期間沒有送任何訊息給遊戲（沒有關卡資料、update_team 或命令）",
      vWatching && Array.isArray(vSent) && vSent.length === 0, out.V4);

    // L-1 前往末次已確認出兵（主頁）：重新記錄送給遊戲的訊息
    const lWatching = await watchSent();
    const lf = await lastFlow();
    out.L1 = lf;
    run.check("L-1 前往末次出兵（「進京」，正式 chapter1_5 的形狀）：末次比首次晚的列才有按鈕（每列一個），全關與兩條路線用各自的末次，C 快騎全關第 2→7 波、path_b 第 4→7 波（不是路線的首次 4）；" +
      "按下只展開那一波、導覽與說明同步、焦點在那一波的標題，路線與排列不變；依隻數排列、搜尋「步兵」、收起再展開後按鈕跟著列；關閉重開回到全關與首次出現；" +
      "「討伐」（正式 chapter1_3）全關、依波數排列、path_a、path_b 各自的末次，path_b 的 A 慢兵前往第 3 波",
      lWatching && lastFlowOk(lf), out.L1);

    // L-2 首末同一波不重複：「進京」的前鋒、B 步兵、飛騎與「討伐」path_b 的步兵只有一個前往首次的按鈕
    await openPreview("chapter3_1");
    await pick("preview-composition-route", "route:path_b");
    const ls2 = await lasts();
    const ln2 = await nav();
    await closePreview();
    out.L2 = { rows: ls2.rows, first: ln2.buttons };
    run.check("L-2 首末同一波（或只出現一波）的列沒有前往末次的按鈕，只留原本的前往首次（「討伐」path_b：重甲第 2 波、C 快騎與步兵第 3 波）；A 慢兵第 2→3 波有",
      same(fl(ls2), LAST_B_13) && [S2, C2, G2].every((id) => lastRow(ls2, id)?.n === 0) && lastRow(ls2, S3)?.n === 1 &&
        [S3, S2, C2, G2].every((id) => waveOf(ln2, id) === LAST_B_13.find((r) => r[0] === id)[1]),
      out.L2);

    // L-3 鍵盤：前往首次按 Tab 到同一列的前往末次，Enter 前往
    await openPreview("chapter3_2");
    await gotoBtn(C2).focus();
    await press("Tab");
    const lk0 = await page.evaluate(() => [document.activeElement?.dataset?.testid ?? null, document.activeElement?.closest('[data-testid="preview-composition-row"]')?.dataset.enemyId ?? null]);
    await press("Enter");
    await H.sleep(300);
    const lk1 = await nav();
    await closePreview();
    out.L3 = { lk0, lk1 };
    run.check("L-3 鍵盤：C 快騎的前往首次按 Tab 到同一列的前往末次，Enter 前往第 7 波、焦點在那一波的標題",
      same(lk0, ["preview-composition-goto-last", C2]) && landed(lk1, 7, "", "first", "C 快騎的末次出兵"), out.L3);

    // L-4 資料不完整（「邊界」）：寫「已確認的末次」；找不到設定、數量無法判讀、數量 0 的組沒有列
    await openPreview("chapter3_3");
    const le = await lasts();
    const leGo = await gotoLast(G2);
    await closePreview();
    out.L4 = { rows: le.rows, leGo };
    run.check("L-4 資料不完整（「邊界」）：步兵已確認的是第 1、2 波，按鈕寫「前往已確認的末次出兵（第 2 波）」，按下到第 2 波、說明寫已確認的末次；B 步兵只有第 1 波沒有按鈕；找不到設定的 mock_ss_ghost 沒有列",
      same(fl(le), [[G2, 1, 2], [G3, 1, null]]) && lastLabelsOk(le, null, false) && !le.rows.some((r) => r.id === "mock_ss_ghost") &&
        landed(leGo, 2, "", "first", "步兵已確認的末次出兵"),
      out.L4);

    // L-5 送給遊戲的訊息
    const lSent = await sentTypes();
    out.L5 = { lWatching, lSent };
    run.check("L-5 主頁操作前往末次出兵（L-1～L-4）的期間沒有送任何訊息給遊戲（沒有關卡資料、update_team 或命令）",
      lWatching && Array.isArray(lSent) && lSent.length === 0, out.L5);

    // N-1 逐波明細前往那一波（主頁）：重新記錄送給遊戲的訊息
    const nWatching = await watchSent();
    const nf = await dgFlow();
    out.N1 = nf;
    run.check("N-1 逐波明細前往那一波（「進京」與「討伐」，正式 chapter1_5／chapter1_3 的形狀）：預設收合時沒有按鈕；六個範圍每一列展開後，已確認的每一波各一個按鈕（和明細一對一、明細文字不變），" +
      "C 快騎全關第 2～7 波、path_b 第 4～7 波（用路線自己的波次，不借全關）；按中間的第 4 波、path_b 的第 5 波只展開那一波、導覽與說明同步、焦點在那一波的標題，路線與排列不變；" +
      "依隻數排列並搜尋「步兵」後按鈕跟著列（第 5～7 波，按第 6 波）；收合明細時按鈕消失、再展開回來；關閉重開全部收合；「討伐」path_b 的 A 慢兵前往第 3 波",
      nWatching && dgFlowOk(nf), out.N1);

    // N-2 資料不完整（「邊界」）：寫「已確認的」；找不到設定、數量無法判讀、數量 0、沒有路點的路線都沒有按鈕
    await openPreview("chapter3_3");
    const ne = await openAllDetails();
    const neGo = await gotoDetail(G2, 2);
    await closePreview();
    out.N2 = { rows: ne.rows, neGo };
    run.check("N-2 資料不完整（「邊界」）：步兵已確認的第 1、2 波、B 步兵的第 1 波各一個按鈕，寫「前往已確認的第 N 波」、說明寫已確認出兵；按步兵的第 2 波到第 2 波、說明寫已確認的出兵；" +
      "找不到設定的 mock_ss_ghost 沒有列，數量無法判讀、數量 0、沒有路點的路線都沒有按鈕",
      same(dwOf(ne), [[G2, [1, 2]], [G3, [1]]]) && dgLabelsOk(ne, null, false) && !ne.rows.some((r) => r.id === "mock_ss_ghost") &&
        landed(neGo, 2, "", "first", "步兵已確認的出兵"),
      out.N2);

    // N-3 鍵盤：逐波按鈕 Enter 展開後 Tab 到明細的第一個前往、再 Tab 到下一個，Enter 前往
    await openPreview("chapter3_2");
    await detailBtn(C2).focus();
    await press("Enter");
    await press("Tab");
    const nk0 = await page.evaluate(() => [document.activeElement?.dataset?.testid ?? null, document.activeElement?.closest('[data-testid="preview-composition-row"]')?.dataset.enemyId ?? null, document.activeElement?.dataset?.wave ?? null]);
    await press("Tab");
    const nk1 = await page.evaluate(() => [document.activeElement?.dataset?.testid ?? null, document.activeElement?.closest('[data-testid="preview-composition-row"]')?.dataset.enemyId ?? null, document.activeElement?.dataset?.wave ?? null]);
    await press("Enter");
    await H.sleep(300);
    const nk2 = await nav();
    await closePreview();
    out.N3 = { nk0, nk1, nk2 };
    run.check("N-3 鍵盤：C 快騎的逐波按鈕按 Enter 展開，Tab 到明細第 2 波的前往、再 Tab 到第 3 波的前往，Enter 前往第 3 波、焦點在那一波的標題",
      same(nk0, ["preview-composition-detail-goto", C2, "2"]) && same(nk1, ["preview-composition-detail-goto", C2, "3"]) &&
        landed(nk2, 3, "", "first", "C 快騎的出兵"),
      out.N3);

    // N-4 送給遊戲的訊息
    const nSent = await sentTypes();
    out.N4 = { nWatching, nSent };
    run.check("N-4 主頁操作逐波明細的前往（N-1～N-3）的期間沒有送任何訊息給遊戲（沒有關卡資料、update_team 或命令）；之後 M-4 再核不換關、不寫入",
      nWatching && Array.isArray(nSent) && nSent.length === 0, out.N4);

    // M-4 關閉關卡選擇：戰場不變、沒有寫入
    await press("Escape");
    await H.sleep(300);
    const s1 = await H.snapshot(page);
    const a1 = await gasActions();
    out.M4 = { before: { stage: s0.stage, battle: s0.battle_id }, after: { stage: s1.stage, battle: s1.battle_id }, writes: writes(a1) - writes(a0) };
    run.check("M-4 主頁只操作預覽的排列：目前的戰場（關卡、場次）不變、沒有寫入",
      s1.stage === s0.stage && s1.battle_id === s0.battle_id && out.M4.writes === 0, out.M4);
  });

  // ── P 獨立關卡頁 ──
  await section("page", async () => {
    const a0 = await gasActions();
    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 60000 });
    await waitSync("idle").catch(() => null);

    // P-1
    const f = await sortFlow();
    out.P1 = { s1: f.s1.rows, sa: f.sa.rows, sb: f.sb.rows, sr: f.sr.sort };
    run.check("P-1 獨立關卡頁：同樣的排列、換路線保留、收起再展開保留、關閉重開回到首次出現，結果和主頁相同",
      sortFlowOk(f) && !!mFlow && same(f.s1.rows, mFlow.s1.rows) && same(f.sb.rows, mFlow.sb.rows), out.P1);

    // P-2 設定更新（預覽開著）：保留排列，用新的數量重新排
    await page.evaluate((stale) => {
      const raw = JSON.parse(localStorage.getItem("shenma_static_config"));
      raw.maps = raw.maps.map((m) => (m.map_id === "chapter3_4" ? stale : m));
      localStorage.setItem("shenma_static_config", JSON.stringify(raw));
      localStorage.setItem("shenma_static_ts", "0");
      localStorage.setItem("__shenma_mock_hold", JSON.stringify(["get_all_maps"]));
    }, STALE_REFRESH);
    await page.reload();
    await page.waitForSelector('[data-testid="stage-card"][data-map-id="chapter3_4"]', { timeout: 60000 });
    await page.evaluate(() => localStorage.removeItem("__shenma_mock_hold"));
    await page.waitForFunction(() => window.__shenmaMock.pending("get_all_maps").length === 1, null, { timeout: 30000, polling: 100 });
    await openPreview("chapter3_4");
    await pick("preview-composition-sort", "count");
    const before = await comp();
    const navBefore = await nav();
    await page.evaluate(() => window.__shenmaMock.release("get_all_maps"));
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="preview-composition-row"]').length === 2, null, { timeout: 30000, polling: 100 });
    await H.sleep(300);
    const after = await comp();
    const navAfter = await nav();
    const goAfter = await goto(G3);
    await closePreview();
    out.P2 = { before, after, gotoBefore: waveOf(navBefore, G3), gotoAfter: waveOf(navAfter, G3), goAfter };
    run.check("P-2b 設定更新（預覽開著）：B 步兵的前往按鈕從第 2 波（過期的設定）改成第 1 波（新的設定，第 2 波已不存在）；按下到第 1 波，沒有跳到已經不存在的第 2 波",
      waveOf(navBefore, G3) === 2 && waveOf(navAfter, G3) === 1 && landed(goAfter, 1, "", "count", "B 步兵的首次出兵"), out.P2);
    run.check("P-2 設定更新（預覽開著）：更新前依隻數是步兵 9、C 快騎 4、B 步兵 3；更新後保留已確認隻數的排列、用新的數量重新排成 B 步兵 3、步兵 2（不留舊的數字與順序）",
      before.sort === "count" && same(before.rows.map((r) => [r[0], r[1]]), [[G2, 9], [C2, 4], [G3, 3]]) &&
        after.sort === "count" && same(after.rows.map((r) => [r[0], r[1]]), [[G3, 3], [G2, 2]]) && after.header === "▾ 敵軍組成 共 5 隻",
      out.P2);

    // P-4 獨立關卡頁：前往首次出兵和主頁相同
    const pg = await gotoFlow();
    out.P4 = pg;
    run.check("P-4 獨立關卡頁：C 快騎全關第 1 波、path_b 第 3 波、path_a 第 1 波，前往、導覽、焦點、路線與排列都和主頁相同", gotoFlowOk(pg), out.P4);

    // P-3 390×600
    await page.setViewportSize({ width: 390, height: 600 });
    await H.sleep(300);
    await openPreview("chapter3_1");
    await pick("preview-composition-sort", "count");
    await page.locator('[data-testid="preview-composition-sort"]').scrollIntoViewIfNeeded();
    await H.sleep(200);
    const fit = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]').getBoundingClientRect();
      const s = document.querySelector('[data-testid="preview-composition-sort"]').getBoundingClientRect();
      const r = document.querySelector('[data-testid="preview-composition-route"]').getBoundingClientRect();
      return { vw: innerWidth, docScroll: document.documentElement.scrollWidth, panel: [Math.round(p.left), Math.round(p.right)], sort: [Math.round(s.left), Math.round(s.right), Math.round(s.width)], route: [Math.round(r.left), Math.round(r.right)] };
    });
    const shot = await H.shot(page, "stage-sort-390x600");
    const s390 = await comp();
    await gotoBtn(C2).scrollIntoViewIfNeeded();
    const goFit = await page.evaluate(() => {
      const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]').getBoundingClientRect();
      return [...document.querySelectorAll('[data-testid="preview-composition-goto"]')].map((b) => { const r = b.getBoundingClientRect(); return r.left >= p.left && r.right <= p.right && r.width > 0; });
    });
    const go390 = await goto(C2);
    await closePreview();
    await page.setViewportSize({ width: 1280, height: 800 });
    const a1 = await gasActions();
    out.P3 = { fit, shot, rows: s390.rows, goFit, go390, writes: writes(a1) - writes(a0) };
    run.check("P-3b 390×600：每一列的前往按鈕都在預覽裡；按 C 快騎的按鈕到第 1 波（依隻數排列中）", goFit.length === 6 && goFit.every(Boolean) && landed(go390, 1, "", "count", "C 快騎的首次出兵"), { goFit, go390 });
    run.check("P-3 390×600：排列與依路線查看的選單都在預覽裡、沒有橫向捲動，排列後的列正確；獨立關卡頁全程沒有寫入",
      fit.sort[2] > 0 && fit.sort[0] >= fit.panel[0] && fit.sort[1] <= fit.panel[1] && fit.route[1] <= fit.panel[1] && fit.docScroll <= fit.vw &&
        same(s390.rows, COUNT_ALL) && out.P3.writes === 0,
      out.P3);

    // W-5 獨立關卡頁：逐波隻數和主頁相同
    const wp = await detailFlow();
    out.W5 = wp;
    run.check("W-5 獨立關卡頁：逐波隻數的預設收合、全關與兩條路線的逐波、排列、換路線關掉不在的列、關閉重開收合、同一波多組相加，都和主頁相同", detailFlowOk(wp), out.W5);

    // W-6 設定更新（預覽開著）：過期的「刷新」第 1 波步兵 9、C 快騎 4，第 2 波 B 步兵 3 → 新的設定第 1 波步兵 2、B 步兵 3
    await page.evaluate((stale) => {
      const raw = JSON.parse(localStorage.getItem("shenma_static_config"));
      raw.maps = raw.maps.map((m) => (m.map_id === "chapter3_4" ? stale : m));
      localStorage.setItem("shenma_static_config", JSON.stringify(raw));
      localStorage.setItem("shenma_static_ts", "0");
      localStorage.setItem("__shenma_mock_hold", JSON.stringify(["get_all_maps"]));
    }, STALE_REFRESH);
    await page.reload();
    await page.waitForSelector('[data-testid="stage-card"][data-map-id="chapter3_4"]', { timeout: 60000 });
    await page.evaluate(() => localStorage.removeItem("__shenma_mock_hold"));
    await page.waitForFunction(() => window.__shenmaMock.pending("get_all_maps").length === 1, null, { timeout: 30000, polling: 100 });
    await openPreview("chapter3_4");
    await toggleDetail(G3);
    const u0 = await toggleDetail(C2);
    await page.evaluate(() => window.__shenmaMock.release("get_all_maps"));
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="preview-composition-row"]').length === 2, null, { timeout: 30000, polling: 100 });
    await H.sleep(300);
    const u1 = await details();
    const u2 = await toggleDetail(G2);
    await closePreview();
    out.W6 = { before: { open: expandedIds(u0), g3: wavesOf(u0, G3), c2: wavesOf(u0, C2) }, after: { open: expandedIds(u1), g3: wavesOf(u1, G3), c2: !!rowOf(u1, C2), rows: facts(u1) }, g2: wavesOf(u2, G2) };
    run.check("W-6 設定更新（預覽開著）：更新前 B 步兵第 2 波 3、C 快騎第 1 波 4 都展開；更新後 B 步兵用新的第 1 波 3（仍展開）、C 快騎的列沒了就關掉；之後展開步兵是新的第 1 波 2（不留舊的 9）",
      same(out.W6.before.open, [C2, G3]) && same(out.W6.before.g3, [[2, 3]]) && same(out.W6.before.c2, [[1, 4]]) &&
        same(out.W6.after.open, [G3]) && same(out.W6.after.g3, [[1, 3]]) && !out.W6.after.c2 && same(out.W6.g2, [[1, 2]]),
      out.W6);

    // W-7 390×600／390×844：明細與按鈕在預覽裡、沒有橫向捲動
    const fits = {};
    for (const h of [600, 844]) {
      await page.setViewportSize({ width: 390, height: h });
      await H.sleep(300);
      await openPreview("chapter3_2");
      await detailBtn(C2).scrollIntoViewIfNeeded();
      const v = await toggleDetail(C2);
      await page.locator('[data-testid="preview-composition-detail"]').scrollIntoViewIfNeeded();
      await H.sleep(200);
      const box = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]').getBoundingClientRect();
        const inside = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= p.left && r.right <= p.right; };
        const d = document.querySelector('[data-testid="preview-composition-detail"]');
        const dr = d.getBoundingClientRect();
        return {
          vw: innerWidth, docScroll: document.documentElement.scrollWidth,
          toggles: [...document.querySelectorAll('[data-testid="preview-composition-detail-toggle"]')].map(inside),
          detail: inside(d), visible: dr.top >= 0 && dr.top < innerHeight,
          waves: [...d.querySelectorAll('[data-testid="preview-composition-detail-wave"]')].map(inside),
        };
      });
      const wshot = await H.shot(page, `stage-sort-detail-390x${h}`);
      await closePreview();
      fits[h] = { ...box, shot: wshot, waves: wavesOf(v, C2), boxWaves: box.waves };
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    const a2 = await gasActions();
    out.W7 = { fits, writes: writes(a2) - writes(a0) };
    run.check("W-7 390×600／390×844：每一列的逐波按鈕、展開的明細與各波都在預覽裡、明細捲得到、沒有橫向捲動，內容是 C 快騎全關的逐波；獨立關卡頁全程沒有寫入",
      [600, 844].every((h) => fits[h].toggles.length === 9 && fits[h].toggles.every(Boolean) && fits[h].detail && fits[h].visible &&
        fits[h].boxWaves.length === 6 && fits[h].boxWaves.every(Boolean) && fits[h].docScroll <= fits[h].vw && same(fits[h].waves, C2_15.all)) &&
        out.W7.writes === 0,
      out.W7);

    // S-6 獨立關卡頁：組成搜尋和主頁相同
    const sp = await searchFlow();
    out.S6 = sp;
    run.check("S-6 獨立關卡頁：組成搜尋的預設、名稱與 ID、換路線保留查詢且不借全關、兩種排列、沒有符合、收起保留、關閉重開回到空白，都和主頁相同", searchFlowOk(sp), out.S6);

    // S-7 設定更新（預覽開著）：保留查詢，用新的列重算符合的列、小計、首次與逐波
    await page.evaluate((stale) => {
      const raw = JSON.parse(localStorage.getItem("shenma_static_config"));
      raw.maps = raw.maps.map((m) => (m.map_id === "chapter3_4" ? stale : m));
      localStorage.setItem("shenma_static_config", JSON.stringify(raw));
      localStorage.setItem("shenma_static_ts", "0");
      localStorage.setItem("__shenma_mock_hold", JSON.stringify(["get_all_maps"]));
    }, STALE_REFRESH);
    await page.reload();
    await page.waitForSelector('[data-testid="stage-card"][data-map-id="chapter3_4"]', { timeout: 60000 });
    await page.evaluate(() => localStorage.removeItem("__shenma_mock_hold"));
    await page.waitForFunction(() => window.__shenmaMock.pending("get_all_maps").length === 1, null, { timeout: 30000, polling: 100 });
    await openPreview("chapter3_4");
    const r0 = await search("步兵");
    const r0d = await toggleDetail(G3);
    await page.evaluate(() => window.__shenmaMock.release("get_all_maps"));
    await page.waitForFunction(() => document.querySelector('[data-testid="preview-composition-summary"]')?.innerText.includes("共 5 隻"), null, { timeout: 30000, polling: 100 });
    await H.sleep(300);
    const r1 = await sstate();
    const r1d = await details();
    await closePreview();
    out.S7 = { before: { rows: r0.rows, note: r0.searchSummary, g3: wavesOf(r0d, G3) }, after: { search: r1.search, rows: r1.rows, note: r1.searchSummary, g3: wavesOf(r1d, G3) } };
    run.check("S-7 設定更新（預覽開著）：查詢「步兵」保留；過期的設定是步兵 9（第 1 波）、B 步兵 3（第 2 波）小計 12，新的設定是步兵 2、B 步兵 3（都在第 1 波）小計 5，B 步兵展開的逐波從第 2 波 3 改成第 1 波 3",
      same(r0.rows, [[G2, 9, 1], [G3, 3, 2]]) && r0.searchSummary === searchNote("步兵", 2, 12, "全關") && same(wavesOf(r0d, G3), [[2, 3]]) &&
        r1.search === "步兵" && same(r1.rows, [[G2, 2, 1], [G3, 3, 1]]) && r1.searchSummary === searchNote("步兵", 2, 5, "全關") && same(wavesOf(r1d, G3), [[1, 3]]),
      out.S7);

    // S-8 390×600／390×844：搜尋框、清除與小計在預覽裡、沒有橫向捲動；獨立關卡頁全程沒有寫入
    const sfits = {};
    for (const h of [600, 844]) {
      await page.setViewportSize({ width: 390, height: h });
      await H.sleep(300);
      await openPreview("chapter3_2");
      await page.locator('[data-testid="preview-composition-search"]').scrollIntoViewIfNeeded();
      const v = await search("兵");
      await page.locator('[data-testid="preview-composition-search-summary"]').scrollIntoViewIfNeeded();
      await H.sleep(200);
      const box = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]').getBoundingClientRect();
        const inside = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.left >= p.left && r.right <= p.right; };
        return {
          vw: innerWidth, docScroll: document.documentElement.scrollWidth,
          input: inside('[data-testid="preview-composition-search"]'), clear: inside('[data-testid="preview-composition-search-clear"]'),
          note: inside('[data-testid="preview-composition-search-summary"]'),
        };
      });
      const sshot = await H.shot(page, `stage-sort-search-390x${h}`);
      await closePreview();
      sfits[h] = { ...box, shot: sshot, rows: ids(v) };
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    const a3 = await gasActions();
    out.S8 = { sfits, writes: writes(a3) - writes(a0) };
    run.check("S-8 390×600／390×844：搜尋框、清除鈕與符合的小計都在預覽裡、沒有橫向捲動，「兵」是傷兵、A 慢兵、步兵、B 步兵；獨立關卡頁全程沒有寫入",
      [600, 844].every((h) => sfits[h].input && sfits[h].clear && sfits[h].note && sfits[h].docScroll <= sfits[h].vw && same(sfits[h].rows, [GL1, SL1, G2, G3])) &&
        out.S8.writes === 0,
      out.S8);

    // V-5 獨立關卡頁：依波數排列和主頁相同
    const vp5 = await wavesFlow();
    out.V5 = vp5;
    run.check("V-5 獨立關卡頁：依已確認出現波數排列的全關與兩條路線、搜尋與清除、前往與逐波、關閉重開回到首次出現、和依隻數的不同，都和主頁相同", wavesFlowOk(vp5), out.V5);

    // V-6 390×600／390×844：依波數排列的選單在預覽裡、沒有橫向捲動，列的順序正確
    const vfits = {};
    for (const h of [600, 844]) {
      await page.setViewportSize({ width: 390, height: h });
      await H.sleep(300);
      await openPreview("chapter3_2");
      await pick("preview-composition-sort", "waves");
      await page.locator('[data-testid="preview-composition-sort"]').scrollIntoViewIfNeeded();
      await H.sleep(200);
      const box = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]').getBoundingClientRect();
        const s = document.querySelector('[data-testid="preview-composition-sort"]').getBoundingClientRect();
        return { vw: innerWidth, docScroll: document.documentElement.scrollWidth, inside: s.width > 0 && s.left >= p.left && s.right <= p.right };
      });
      const vs = await sstate();
      const vshot = await H.shot(page, `stage-sort-waves-390x${h}`);
      await closePreview();
      vfits[h] = { ...box, rows: ids(vs), sort: vs.sort, shot: vshot };
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    out.V6 = vfits;
    run.check("V-6 390×600／390×844：排列選單在預覽裡、沒有橫向捲動，選依已確認出現波數後的順序和桌面相同",
      [600, 844].every((h) => vfits[h].inside && vfits[h].docScroll <= vfits[h].vw && vfits[h].sort === "waves" && same(vfits[h].rows, WAVES_ALL_15)), out.V6);

    // L-6 獨立關卡頁：前往末次出兵和主頁相同
    const lp = await lastFlow();
    out.L6 = lp;
    run.check("L-6 獨立關卡頁：前往末次出兵的全關與兩條路線、按鈕文字與說明、前往與焦點、排列與搜尋、收起再展開、關閉重開，都和主頁相同", lastFlowOk(lp), out.L6);

    // L-7 390×600／390×844：前往末次的按鈕都在預覽裡、沒有橫向捲動，按下到對的那一波
    const lfits = {};
    for (const h of [600, 844]) {
      await page.setViewportSize({ width: 390, height: h });
      await H.sleep(300);
      await openPreview("chapter3_2");
      if ((await lastBtn(C2).count()) === 1) await lastBtn(C2).scrollIntoViewIfNeeded();
      await H.sleep(200);
      const box = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]').getBoundingClientRect();
        const bs = [...document.querySelectorAll('[data-testid="preview-composition-goto-last"]')].map((b) => b.getBoundingClientRect());
        return { vw: innerWidth, docScroll: document.documentElement.scrollWidth, n: bs.length, inside: bs.every((r) => r.width > 0 && r.left >= p.left && r.right <= p.right) };
      });
      const lshot = await H.shot(page, `stage-sort-last-390x${h}`);
      const lgo = await gotoLast(C2);
      await closePreview();
      lfits[h] = { ...box, shot: lshot, landed: landed(lgo, 7, "", "first", "C 快騎的末次出兵") };
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    out.L7 = lfits;
    run.check("L-7 390×600／390×844：「進京」的 6 個前往末次按鈕（傷兵、A 慢兵、步兵、C 快騎、重甲、衝鋒）都在預覽裡、沒有橫向捲動；按 C 快騎的到第 7 波",
      [600, 844].every((h) => lfits[h].n === 6 && lfits[h].inside && lfits[h].docScroll <= lfits[h].vw && lfits[h].landed), out.L7);

    // N-5 獨立關卡頁：逐波明細的前往和主頁相同
    const np = await dgFlow();
    out.N5 = np;
    run.check("N-5 獨立關卡頁：逐波明細前往的六個範圍、按鈕文字與說明、中間波與路線自己的波、排列與搜尋、收合再展開、關閉重開，都和主頁相同", dgFlowOk(np), out.N5);

    // N-6 390×600／390×844：明細的前往按鈕都在預覽裡、沒有橫向捲動，按下到對的那一波
    const nfits = {};
    for (const h of [600, 844]) {
      await page.setViewportSize({ width: 390, height: h });
      await H.sleep(300);
      await openPreview("chapter3_2");
      await detailBtn(C2).scrollIntoViewIfNeeded();
      await toggleDetail(C2);
      await page.locator('[data-testid="preview-composition-detail"]').scrollIntoViewIfNeeded();
      await H.sleep(200);
      const box = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]').getBoundingClientRect();
        const bs = [...document.querySelectorAll('[data-testid="preview-composition-detail-goto"]')].map((b) => b.getBoundingClientRect());
        return { vw: innerWidth, docScroll: document.documentElement.scrollWidth, n: bs.length, inside: bs.every((r) => r.width > 0 && r.left >= p.left && r.right <= p.right) };
      });
      const nshot = await H.shot(page, `stage-sort-detail-goto-390x${h}`);
      const ngo = await gotoDetail(C2, 5);
      await closePreview();
      nfits[h] = { ...box, shot: nshot, landed: landed(ngo, 5, "", "first", "C 快騎的出兵") };
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    const aN = await gasActions();
    out.N6 = { nfits, writes: writes(aN) - writes(a0) };
    run.check("N-6 390×600／390×844：「進京」C 快騎明細的 6 個前往按鈕（第 2～7 波）都在預覽裡、沒有橫向捲動；按第 5 波到第 5 波；獨立關卡頁到這裡沒有寫入",
      [600, 844].every((h) => nfits[h].n === 6 && nfits[h].inside && nfits[h].docScroll <= nfits[h].vw && nfits[h].landed) && out.N6.writes === 0, out.N6);

    // V-7 設定更新（預覽開著）：保留依波數排列，用新的列重排
    await staleReload([STALE_REFRESH], "chapter3_4");
    await openPreview("chapter3_4");
    await pick("preview-composition-sort", "waves");
    const vr0 = await sstate();
    const vr0d = await details();
    await page.evaluate(() => window.__shenmaMock.release("get_all_maps"));
    await page.waitForFunction(() => document.querySelector('[data-testid="preview-composition-summary"]')?.innerText.includes("共 5 隻"), null, { timeout: 30000, polling: 100 });
    await H.sleep(300);
    const vr1 = await sstate();
    const vr1d = await details();
    await closePreview();
    out.V7 = { before: [vr0.sort, ids(vr0), waveCounts(vr0d)], after: [vr1.sort, ids(vr1), waveCounts(vr1d)] };
    run.check("V-7 設定更新（預覽開著）：依已確認出現波數的排列保留；過期的設定是步兵、C 快騎（第 1 波）、B 步兵（第 2 波）各 1 波，新的設定是步兵、B 步兵各 1 波（都在第 1 波）",
      vr0.sort === "waves" && same(ids(vr0), [G2, C2, G3]) && waveCounts(vr0d) === `${G2}:1 ${C2}:1 ${G3}:1` &&
        vr1.sort === "waves" && same(ids(vr1), [G2, G3]) && waveCounts(vr1d) === `${G2}:1 ${G3}:1`,
      out.V7);

    // S-9 設定更新後只剩一種敵人（預覽開著、有查詢與依隻數排列）：搜尋與排列藏起來，看不到的查詢與排列不影響顯示，列照常顯示
    await staleReload([STALE_ONE], "chapter3_5");
    await openPreview("chapter3_5");
    await pick("preview-composition-sort", "count");
    const o0 = await search("快騎");
    await page.evaluate(() => window.__shenmaMock.release("get_all_maps"));
    await page.waitForFunction(() => !document.querySelector('[data-testid="preview-composition-search"]'), null, { timeout: 30000, polling: 100 });
    await H.sleep(300);
    const o1 = await sstate();
    // 步兵的列不在（被看不到的查詢藏掉）時不去點它的逐波按鈕，讓 S-9 以具名的失敗呈現
    const o1d = o1.rows.some((r) => r[0] === G2) ? await toggleDetail(G2) : null;
    const o1sel = await page.evaluate(() => !!document.querySelector('[data-testid="preview-composition-sort"]'));
    await closePreview();
    out.S9 = { before: { rows: o0.rows, note: o0.searchSummary, sort: o0.sort }, after: { ...o1, sortSelect: o1sel, g2: o1d ? wavesOf(o1d, G2) : null } };
    run.check("S-9 設定更新成只剩一種敵人（預覽開著，查詢「快騎」、依隻數排列）：更新前只列 C 快騎；更新後搜尋與排列都藏起來，步兵 4 隻照常顯示（看不到的查詢「快騎」沒有把它藏掉），" +
      "說明照首次出現、沒有搜尋小計，首次第 1 波、逐波第 1 波 4 隻",
      same(o0.rows, [[C2, 3, 1]]) && o0.sort === "count" &&
        o1.search === null && !o1sel && o1.searchSummary === null && same(o1.rows, [[G2, 4, 1]]) && o1.sort === "first" &&
        o1.header === "▾ 敵軍組成 共 4 隻" && o1.summary === "全關共 4 隻、1 種敵人（依第一次出現的順序）。" && same(out.S9.after.g2, [[1, 4]]),
      out.S9);

    // S-10 設定更新後變回多種（預覽開著）：搜尋與排列出現、內容空白（只有一種時沒辦法輸入），列與小計照新的設定
    await staleReload([STALE_TWO], "chapter3_6");
    await openPreview("chapter3_6");
    const m0 = await sstate();
    const m0sel = await page.evaluate(() => !!document.querySelector('[data-testid="preview-composition-sort"]'));
    await page.evaluate(() => window.__shenmaMock.release("get_all_maps"));
    await page.waitForSelector('[data-testid="preview-composition-search"]', { timeout: 30000 });
    await H.sleep(300);
    const m1 = await sstate();
    const m2 = await search("快騎");
    await closePreview();
    const a4 = await gasActions();
    out.S10 = { before: { search: m0.search, sortSelect: m0sel, rows: m0.rows }, after: m1, typed: m2, writes: writes(a4) - writes(a0) };
    run.check("S-10 設定更新後變回多種敵人（預覽開著）：更新前只有步兵、沒有搜尋與排列；更新後搜尋框出現且空白、排列是首次出現、步兵 4 與 C 快騎 3 都列出、沒有搜尋小計；之後搜「快騎」只剩 C 快騎、小計 3 隻；獨立關卡頁全程沒有寫入",
      m0.search === null && !m0sel && same(m0.rows, [[G2, 4, 1]]) &&
        m1.search === "" && m1.sort === "first" && same(m1.rows, [[G2, 4, 1], [C2, 3, 1]]) && m1.searchSummary === null &&
        same(m2.rows, [[C2, 3, 1]]) && m2.searchSummary === searchNote("快騎", 1, 3, "全關") && out.S10.writes === 0,
      out.S10);
  });

  await page.evaluate(() => localStorage.removeItem("__shenma_ss_fixture")).catch(() => {});
  return run.finish({ out });
}
