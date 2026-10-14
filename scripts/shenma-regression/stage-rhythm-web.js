async (page) => {
  // 敵軍預覽的依路線組成與設定出兵節奏（瀏覽器，真 Godot 產物、mock 後端）：主頁的關卡選擇視窗與獨立的關卡頁共用同一個預覽
  // - 測試關（只在這支腳本加進 mock 名單，__shenma_rc_fixture）：第 3 章「討伐」（正式 chapter1_3 的兩條路線與 3 波的形狀，敵人換成 mock）、
  //   「進京」（正式 chapter1_5 的兩條路線與 7 波、間隔 1.5／1.1／1.6）、「邊界」（一隻、沒有間隔、間隔 0 與負數、間隔是字串、數量無法判讀、
  //   找不到的敵人、沒有路點的路線、數字太大）、「刷新」（設定更新時路線會變）
  // - M 主頁：M-1 組成依路線查看（全部→path_a→path_b，數量、波次與全關總數；和路線預覽是同一個選擇，兩邊互相跟著；鍵盤 Tab 到選單；
  //   回到全部時原本的全關說明不變）；M-2 第 1 波的設定出兵節奏（3 組同時開始、各 6 秒、整波 6 秒；每組一行、不是每隻一行；說明遊戲時間與不是清波）；
  //   M-3 波次導覽前往第 7 波：9 組、整波 14.4 秒（取最晚、不相加）；M-4 邊界：完整／依處理幀／只有已知範圍／無法估算，不寫 0 秒、
  //   沒有 Infinity；組成依路線寫這條路線與全關的資料問題；M-5 只操作預覽時沒有切換或結束目前的戰場、沒有寫入
  // - P 獨立關卡頁：P-1 同樣的組成與節奏；P-2 設定更新後選的路線被刪掉→組成與路線預覽都回到全部、焦點留在選單；P-3 仍存在的路線保留；
  //   P-4 390×600／390×844（組成選單、節奏區塊在畫面內、關閉鈕沒有被擋、沒有橫向捲動）；全程沒有寫入
  // - 逐波依路線查看（和組成、路線預覽同一個選擇）：W-1 主頁「討伐」全部→path_a→（路線預覽改）path_b→全部：每一波只列那條路線的組、原本的組序，
  //   「本路線已確認 N 隻／M 組」與全波摘要，沒有組時寫沒有已確認出兵組；波次標題、導覽與節奏是全波（標明全波），回到全部和原本完全相同；
  //   鍵盤（導覽前往、Enter 收合展開）；W-2「邊界」的資料問題（本路線的問題組照列、其他路線的問題另列全波資料提醒、不重複、不補 0）；
  //   W-3「缺波」（缺少、拒絕、重複照整波）；P-5 獨立關卡頁同樣；P-2b 設定更新刪掉選的路線時逐波回到全部；P-4b 手機寬度的逐波路線摘要與提醒
  // 全部 mock、虛構金鑰 test_rhythm_*
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = {};
  const KEY = "test_rhythm_a";

  // ── 測試關 ──
  // 正式 chapter1_3（討伐黃巾）、chapter1_5（董卓進京）的路線
  const A13 = [[0, 1], [1, 1], [1, 1], [2, 1], [2, 1], [3, 1], [3, 1], [3, 2], [3, 2], [3, 3], [3, 3], [3, 4], [3, 4], [3, 5], [3, 5], [4, 5], [4, 5], [5, 5], [5, 5], [5, 6], [5, 6], [5, 7], [5, 7], [5, 8], [5, 8], [6, 8], [6, 8], [7, 8], [7, 8], [8, 8], [8, 8], [9, 8], [9, 8], [9, 7], [9, 7], [9, 6], [9, 6], [9, 5], [9, 5], [10, 5], [10, 5], [11, 5], [11, 5], [12, 5], [12, 5], [13, 5], [13, 5]];
  const B13 = [[0, 8], [0, 8], [1, 8], [1, 8], [2, 8], [2, 8], [3, 8], [3, 8], [3, 7], [3, 7], [3, 6], [3, 6], [3, 5], [4, 5], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [9, 2], [9, 3], [9, 4], [9, 5], [10, 5], [11, 5], [12, 5], [13, 5]];
  const A15 = [[0, 5], [1, 5], [2, 5], [3, 5], [3, 6], [3, 7], [3, 8], [4, 8], [5, 8], [5, 7], [5, 6], [5, 5], [5, 4], [5, 3], [5, 2], [5, 1], [6, 1], [7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6], [7, 7], [7, 8], [8, 8], [9, 8], [9, 7], [9, 6], [9, 5], [9, 4], [9, 3], [9, 2], [9, 1], [9, 0]];
  const B15 = [[13, 8], [13, 7], [13, 6], [13, 5], [13, 4], [13, 3], [13, 2], [13, 1], [12, 1], [11, 1], [11, 2], [11, 3], [11, 4], [11, 5], [11, 6], [11, 7], [11, 8], [10, 8], [9, 8], [9, 7], [9, 6], [9, 5], [9, 4], [9, 3], [9, 2], [9, 1], [9, 0]];
  const extra = { spawn: [0, 5], base: [13, 5], build_zones: [], obstacles: [], background_texture: "maps/bg_forest.webp" };
  const g = (enemy_id, count, interval, path) => ({ enemy_id, count, interval, path });
  const stage = (map_id, name, paths, waves) => ({ map_id, chapter: 3, name, unlock_stage: map_id, path_json: { ...extra, cols: 14, rows: 11, paths }, waves });
  // 正式敵人換成 mock：grunt_lv2→步兵、grunt_lv3→B 步兵、cavalry_lv2→C 快騎、cavalry_lv3→衝鋒、siege_lv3→A 慢兵、siege_lv2→重甲
  const [G2, G3, C2, C3, S3, S2] = ["mock_grunt", "mock_b_grunt", "mock_c_fast", "mock_rusher", "mock_a_slow", "mock_t_tank"];
  const W15 = (n, list) => ({ wave: n, enemies: list.map(([id, iv, path]) => g(id, 10, iv, path)) });
  const FRESH_REFRESH = stage("chapter3_4", "Mock RC 刷新", { path_a: [[0, 5], [13, 5]], path_c: [[0, 1], [13, 1]] }, [
    { wave: 1, enemies: [g(G2, 2, 1, "path_a"), g(G3, 3, 1, "path_c")] },
  ]);
  const STALE_REFRESH = {
    ...FRESH_REFRESH,
    path_json: { ...FRESH_REFRESH.path_json, paths: { path_a: [[0, 5], [13, 5]], path_b: [[0, 8], [13, 8]], path_c: [[0, 1], [13, 1]] } },
    waves: [{ wave: 1, enemies: [...FRESH_REFRESH.waves[0].enemies, g(C2, 4, 1, "path_b")] }],
  };
  const EXTRA_MAPS = [
    stage("chapter3_1", "Mock RC 討伐", { path_a: A13, path_b: B13 }, [
      { wave: 1, enemies: [g(G2, 5, 1.5, "path_a"), g(G3, 5, 1.5, "path_a"), g(C2, 5, 1.5, "path_a")] },
      { wave: 2, enemies: [g(G2, 5, 1.5, "path_a"), g(S3, 5, 1.5, "path_b"), g(S2, 5, 1.5, "path_b")] },
      { wave: 3, enemies: [g(G2, 5, 1.5, "path_a"), g(C2, 5, 1.5, "path_b"), g(C3, 10, 1.5, "path_a"), g(S3, 5, 1.5, "path_b"), g(G2, 10, 1.5, "path_a"), g(G2, 5, 1.5, "path_b")] },
    ]),
    stage("chapter3_2", "Mock RC 進京", { path_a: A15, path_b: B15 }, [
      W15(1, [[G2, 1.5, "path_a"], [C2, 1.1, "path_a"], [S2, 1.1, "path_a"]]),
      W15(2, [[G2, 1.1, "path_a"], [C2, 1.1, "path_a"], [S2, 1.1, "path_b"]]),
      W15(3, [[G2, 1.1, "path_a"], [C2, 1.1, "path_a"], [S2, 1.5, "path_a"], [S2, 1.5, "path_b"]]),
      W15(4, [[G2, 1.1, "path_a"], [C2, 1.1, "path_a"], [S2, 1.1, "path_b"], [C2, 1.1, "path_b"]]),
      W15(5, [[G2, 1.1, "path_a"], [C2, 1.1, "path_a"], [S2, 1.1, "path_a"], [G2, 1.1, "path_b"], [C2, 1.1, "path_b"], [S2, 1.1, "path_b"]]),
      W15(6, [[G2, 1.1, "path_a"], [C2, 1.1, "path_a"], [S2, 1.1, "path_a"], [C3, 1.1, "path_b"], [G2, 1.1, "path_b"], [C2, 1.1, "path_b"], [S2, 1.1, "path_b"]]),
      W15(7, [[G2, 1.1, "path_a"], [C2, 1.1, "path_a"], [S2, 1.1, "path_a"], [C3, 1.6, "path_a"], [G3, 1.6, "path_a"], [G2, 1.1, "path_b"], [C2, 1.1, "path_b"], [S2, 1.1, "path_b"], [S3, 1.6, "path_b"]]),
    ]),
    stage("chapter3_3", "Mock RC 邊界", { path_a: [[0, 5], [13, 5]], path_b: [[0, 8], [13, 8]] }, [
      { wave: 1, enemies: [g(G2, 1, 5, "path_a"), { enemy_id: G3, count: 5, path: "path_b" }] },
      { wave: 2, enemies: [g(G2, 5, 0, "path_a"), g(G3, 3, -2, "path_b"), g(C2, 3, 2, "path_a")] },
      { wave: 3, enemies: [g(G2, 4, "1.5", "path_a"), g("mock_flyer", 3, 2, "path_b")] },
      { wave: 4, enemies: [g(G2, "many", 1, "path_b"), g("mock_rc_ghost", 2, 1, "path_a"), g(G3, 2, 1, "path_z"), g(G2, 2, 1, "path_a")] },
      { wave: 5, enemies: [g(G2, 3, 1e308, "path_a")] },
      // 小的正值間隔（2 隻×0.001 秒）：最後一隻在 0.001 秒，不能寫成 0 秒
      { wave: 6, enemies: [g(G2, 2, 0.001, "path_a")] },
      // 依處理幀的組＋3 隻×1/3 秒（0.6666… 秒）：整波「至少」用不進位的 0.6666
      { wave: 7, enemies: [g(G2, 3, 0, "path_a"), g(G3, 3, 1 / 3, "path_a")] },
      // 真的差一點點的值（不是浮點誤差）：顯示標約、「至少」不進位，data 存計算真值
      { wave: 8, enemies: [g(G2, 2, 0, "path_a"), g(G3, 2, 0.6666999999999, "path_a")] },
      // 極大的安全整數：照原樣，一位都不抹掉
      { wave: 9, enemies: [g(G2, 2, 1234567890123, "path_a")] },
    ]),
    FRESH_REFRESH,
    // 逐波依路線（D176）：第 2 波缺少、第 3 波只有找不到設定的組（遊戲會拒絕）、第 4 波有重複資料（遊戲只用第一筆）
    stage("chapter3_5", "Mock RC 缺波", { path_a: [[0, 5], [13, 5]], path_b: [[0, 8], [13, 8]] }, [
      { wave: 1, enemies: [g(G2, 2, 1, "path_a"), g(G3, 3, 1, "path_b")] },
      { wave: 3, enemies: [g("mock_rc_ghost", 1, 1, "path_a")] },
      { wave: 4, enemies: [g(G2, 2, 1, "path_b")] },
      { wave: 4, enemies: [g(G2, 9, 1, "path_a")] },
    ]),
  ];
  await ctx.addInitScript(({ maps }) => {
    if (window.top !== window) return;
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_rc_fixture") === "1") {
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
  const profile = (max_stage) => ({
    nickname: "出兵節奏", level: 1, exp: 0, gold: 900, capacity: 30, max_stage, heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }],
  });

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
      try { out[name + "_shot"] = await H.shot(page, `stage-rhythm-${name}-exception`); } catch { /* 截圖失敗不影響判定 */ }
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
  const pickRoute = async (testid, value) => {
    await page.locator(`[data-testid="${testid}"]`).selectOption(value);
    await H.sleep(150);
  };
  const expandRoute = async () => {
    await page.locator('[data-testid="preview-route-toggle"]').click();
    await H.sleep(150);
  };
  // 組成、路線預覽與逐波節奏的狀態
  const state = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"]');
    if (!p) return null;
    const text = (x) => x?.innerText.replace(/\s+/g, " ").trim() ?? null;
    const c = p.querySelector('[data-testid="preview-composition"]');
    const csel = c?.querySelector('[data-testid="preview-composition-route"]');
    const r = p.querySelector('[data-testid="preview-route"]');
    const rsel = r?.querySelector('[data-testid="preview-route-select"]');
    return {
      title: p.querySelector('[class*="modalTitle"]')?.innerText.trim() ?? null,
      comp: c ? {
        route: c.dataset.route, complete: c.dataset.complete,
        header: text(c.querySelector('[data-testid="preview-composition-toggle"]')),
        select: csel ? { value: csel.value, options: [...csel.options].map((o) => o.textContent.trim()) } : null,
        summary: text(c.querySelector('[data-testid="preview-composition-summary"]')),
        gaps: [...c.querySelectorAll('[data-testid="preview-composition-gap"]')].map(text),
        unknown: text(c.querySelector('[data-testid="preview-composition-unknown"]')),
        skipped: text(c.querySelector('[data-testid="preview-composition-route-skipped"]')),
        rows: [...c.querySelectorAll('[data-testid="preview-composition-row"]')].map((x) => [x.dataset.enemyId, Number(x.dataset.count), x.dataset.waves]),
      } : null,
      route: r ? {
        expanded: r.querySelector('[data-testid="preview-route-toggle"]')?.getAttribute("aria-expanded") ?? null,
        select: rsel ? { value: rsel.value, options: [...rsel.options].map((o) => o.textContent.trim()) } : null,
        lines: [...r.querySelectorAll('[data-testid="preview-route-line"]')].map((l) => l.dataset.routeId),
      } : null,
      summary: text(p.querySelector('[data-testid="preview-summary"]')),
      open: [...p.querySelectorAll('[data-testid^="preview-wave-toggle-"]')].filter((t) => t.getAttribute("aria-expanded") === "true").map((t) => Number(t.dataset.testid.replace("preview-wave-toggle-", ""))),
      rhythm: [...p.querySelectorAll('[data-testid^="preview-wave-"]')].filter((w) => /^preview-wave-\d+$/.test(w.dataset.testid)).map((w) => {
        const b = w.querySelector('[data-testid="preview-rhythm"]');
        return b ? {
          wave: Number(w.dataset.testid.replace("preview-wave-", "")),
          status: b.dataset.status, last: b.dataset.lastSec,
          summary: text(b.querySelector('[data-testid="preview-rhythm-summary"]')),
          groups: [...b.querySelectorAll('[data-testid="preview-rhythm-group"]')].map((x) => ({ kind: x.dataset.kind, last: x.dataset.lastSec, text: text(x) })),
          text: text(b),
          enemyGroups: w.querySelectorAll('[data-testid="preview-group"]').length,
          rows: [...w.querySelectorAll('[data-testid="preview-group"]')].map(text),
        } : null;
      }).filter(Boolean),
      modalText: p.innerText,
      focus: document.activeElement?.dataset?.testid ?? null,
    };
  });
  const rhythmOf = (s, n) => s.rhythm.find((r) => r.wave === n) || null;
  // 逐波依路線：每一波（展開的）列出的組（原本的組序）、路線摘要、全波資料提醒、節奏標題與組數
  const waves = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"]');
    if (!p) return null;
    const text = (x) => x?.innerText.replace(/\s+/g, " ").trim() ?? null;
    const idx = (x) => Number((text(x).match(/^第 (\d+) 組/) || [])[1]);
    return {
      scope: text(p.querySelector('[data-testid="preview-wave-route-scope"]')),
      waves: [...p.querySelectorAll('[data-testid^="preview-wave-"]')].filter((w) => /^preview-wave-\d+$/.test(w.dataset.testid)).map((w) => {
        const other = w.querySelector('[data-testid="preview-wave-other-problems"]');
        const route = w.querySelector('[data-testid="preview-wave-route"]');
        const rh = w.querySelector('[data-testid="preview-rhythm"]');
        const body = w.querySelector('[class*="previewWaveBody"]');
        return {
          wave: Number(w.dataset.testid.replace("preview-wave-", "")),
          header: text(w.querySelector('[data-testid^="preview-wave-toggle-"]')),
          open: !!body,
          groups: [...w.querySelectorAll('[data-testid="preview-group"]')].filter((x) => !other || !other.contains(x)).map(idx),
          other: other ? [...other.querySelectorAll('[data-testid="preview-group"]')].map(idx) : [],
          otherText: text(other),
          route: route ? { text: text(route), id: route.dataset.route, n: Number(route.dataset.confirmed), m: Number(route.dataset.confirmedGroups) } : null,
          rhythm: rh ? { title: text(rh.querySelector('[class*="previewRhythmTitle"]')), scope: rh.dataset.scope ?? null, groups: rh.querySelectorAll('[data-testid="preview-rhythm-group"]').length, last: rh.dataset.lastSec } : null,
          bodyText: text(body),
        };
      }),
      focus: document.activeElement?.dataset?.testid ?? null,
    };
  });
  const waveOf = (s, n) => s.waves.find((w) => w.wave === n) || null;
  const expandAll = async () => {
    await page.locator('[data-testid="preview-wave-expand-all"]').click();
    await H.sleep(250);
  };
  // W-1／P-5 共用：「討伐」（正式 chapter1_3 的逐波資料）全部→path_a→（路線預覽改）path_b→全部
  const waveRouteFlow = async () => {
    await openPreview("chapter3_1");
    await expandAll();
    const all0 = await waves();
    await pickRoute("preview-composition-route", "route:path_a");
    const a = await waves();
    await expandRoute();
    await pickRoute("preview-route-select", "route:path_b");
    const b = await waves();
    await pickRoute("preview-composition-route", "");
    const all1 = await waves();
    return { all0, a, b, all1 };
  };
  const RHYTHM_WHOLE = "設定出兵節奏（全波：所有路線的組；遊戲時間預估）";
  const waveRouteFlowOk = ({ all0, a, b, all1 }) => {
    const w = (s, n) => waveOf(s, n) || {};
    return all0.scope === null && all0.waves.every((x) => x.open && x.route === null && x.other.length === 0 && x.rhythm && x.rhythm.title === "設定出兵節奏（遊戲時間預估）" && x.rhythm.scope === null) &&
      same(all0.waves.map((x) => x.groups), [[1, 2, 3], [1, 2, 3], [1, 2, 3, 4, 5, 6]]) &&
      same(all0.waves.map((x) => x.header), ["▾ 第 1 波 15 隻", "▾ 第 2 波 15 隻", "▾ 第 3 波 40 隻"]) &&
      /逐波內容只列路線 path_a 的組（和「敵軍組成」「路線預覽」是同一個選擇）；波次標題、波次導覽與設定出兵節奏仍是全波。/.test(a.scope || "") &&
      same(a.waves.map((x) => x.groups), [[1, 2, 3], [1], [1, 3, 5]]) &&
      same(a.waves.map((x) => x.header), all0.waves.map((x) => x.header)) &&
      w(a, 1).route?.text === "路線 path_a：本路線已確認 15 隻／3 組（第 1 波全波：15 隻）。" &&
      w(a, 2).route?.text === "路線 path_a：本路線已確認 5 隻／1 組（第 2 波全波：15 隻）。其他路線另有 2 組沒有列出（在「敵軍組成」或「路線預覽」選全部路線查看）。" &&
      w(a, 3).route?.n === 25 && w(a, 3).route?.m === 3 && /（第 3 波全波：40 隻）/.test(w(a, 3).route?.text || "") &&
      a.waves.every((x) => x.other.length === 0 && x.rhythm && x.rhythm.title === RHYTHM_WHOLE && x.rhythm.scope === "wave") &&
      same(a.waves.map((x) => x.rhythm.groups), [3, 3, 6]) && same(a.waves.map((x) => x.rhythm.last), all0.waves.map((x) => x.rhythm.last)) &&
      same(b.waves.map((x) => x.groups), [[], [2, 3], [2, 4, 6]]) &&
      w(b, 1).route?.text === "路線 path_b：本路線沒有已確認出兵組（第 1 波全波：15 隻）。其他路線另有 3 組沒有列出（在「敵軍組成」或「路線預覽」選全部路線查看）。" &&
      w(b, 1).route?.n === 0 && w(b, 1).route?.m === 0 && w(b, 2).route?.n === 10 && w(b, 2).route?.m === 2 && w(b, 3).route?.n === 15 && w(b, 3).route?.m === 3 &&
      same(b.waves.map((x) => x.rhythm.groups), [3, 3, 6]) &&
      all1.scope === null && same(all1.waves.map((x) => x.bodyText), all0.waves.map((x) => x.bodyText)) && same(all1.waves.map((x) => x.header), all0.waves.map((x) => x.header));
  };
  // 手機寬度：預覽、組成選單、節奏區塊在畫面內，關閉鈕沒有被擋
  const layout = () => page.evaluate(() => {
    const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]');
    const pr = p?.getBoundingClientRect();
    const box = (sel) => [...(p?.querySelectorAll(sel) ?? [])].map((x) => { const q = x.getBoundingClientRect(); return { left: Math.round(q.left), right: Math.round(q.right), w: Math.round(q.width), sw: x.scrollWidth, cw: x.clientWidth }; });
    const close = p?.querySelector('[data-testid="enemy-preview-close"]');
    const cr = close?.getBoundingClientRect();
    const hit = cr ? document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2) : null;
    return {
      vw: innerWidth,
      docScroll: document.documentElement.scrollWidth,
      panel: pr ? { left: Math.round(pr.left), right: Math.round(pr.right) } : null,
      select: box('[data-testid="preview-composition-route"]'),
      rhythm: box('[data-testid="preview-rhythm"]'),
      closeHit: !!(close && hit && (hit === close || close.contains(hit))),
      closeInView: !!(cr && cr.top >= 0 && cr.bottom <= innerHeight && cr.right <= innerWidth),
    };
  });

  // 「討伐」的預期（正式 chapter1_3 形狀）
  const ROWS_A = [[G2, 25, "1,2,3"], [G3, 5, "1"], [C2, 5, "1"], [C3, 10, "3"]];
  const ROWS_B = [[S3, 10, "2,3"], [S2, 5, "2"], [C2, 5, "3"], [G2, 5, "3"]];
  // M-1／P-1 共用：組成依路線查看與路線預覽同步
  const routeFlow = async () => {
    await openPreview("chapter3_1");
    const s0 = await state();
    await expandRoute();
    await pickRoute("preview-composition-route", "route:path_a");
    const sa = await state();
    await pickRoute("preview-route-select", "route:path_b");
    const sb = await state();
    await pickRoute("preview-composition-route", "");
    const sAll = await state();
    return { s0, sa, sb, sAll };
  };
  const routeFlowOk = ({ s0, sa, sb, sAll }) =>
    s0.comp.route === "" && s0.comp.header === "▾ 敵軍組成 共 70 隻" && s0.comp.complete === "true" &&
    same(s0.comp.select.options, ["全部路線（2 條）", "path_a", "path_b"]) && s0.comp.select.value === "" &&
    s0.comp.summary === "全關共 70 隻、6 種敵人（依第一次出現的順序）。" && s0.comp.rows.every((r) => r[2] === "") &&
    sa.comp.route === "path_a" && sa.comp.header === "▾ 敵軍組成 path_a：共 45 隻" && same(sa.comp.rows, ROWS_A) &&
    /路線 path_a 共 45 隻、4 種敵人（全關 70 隻中的這條路線；依第一次出現的順序），出兵在第 1、2、3 波。/.test(sa.comp.summary || "") &&
    sa.route.select.value === "route:path_a" && same(sa.route.lines, ["path_a"]) &&
    sb.comp.route === "path_b" && sb.comp.select.value === "route:path_b" && sb.comp.header === "▾ 敵軍組成 path_b：共 25 隻" && same(sb.comp.rows, ROWS_B) &&
    same(sb.route.lines, ["path_b"]) &&
    sAll.comp.route === "" && sAll.comp.summary === s0.comp.summary && sAll.comp.header === s0.comp.header && same(sAll.comp.rows, s0.comp.rows) &&
    sAll.route.select.value === "" && same(sAll.route.lines, ["path_a", "path_b"]) && sAll.summary === s0.summary;
  // M-2／P-1 共用：第 1 波的節奏
  const wave1Ok = (s) => {
    const r = rhythmOf(s, 1);
    return !!r && same(s.open, [1]) && r.status === "complete" && r.last === "6" && r.groups.length === 3 && r.enemyGroups === 3 &&
      r.groups.every((x) => x.kind === "timed" && x.last === "6" && /5 隻，每隻間隔 1\.5 秒：第一隻在波次開始時出兵，最後一隻名義在第 6 秒（\(5−1\)×1\.5）/.test(x.text)) &&
      r.summary === "3 組同時開始；整波最後一隻名義在第 6 秒出兵（各組取最晚的一組，不是相加）" &&
      /設定出兵節奏（遊戲時間預估）/.test(r.text) && /手動暫停時停住、倍速時加快/.test(r.text) && /不是清波、敵人抵達終點或戰鬥結束的時間，也不代表勝負/.test(r.text);
  };

  // ── 設定 ──
  await section("setup", async () => {
    await H.resetOrigin(page);
    await page.evaluate(({ k, p }) => {
      localStorage.setItem("__shenma_rc_fixture", "1");
      localStorage.setItem("__shenma_mock_gas_db", JSON.stringify({ profiles: { [k]: p }, battle_logs: [] }));
      localStorage.setItem("shenma_player_key", k);
    }, { k: KEY, p: profile("chapter1_7") });
  });

  // ── M 主頁 ──
  let wf = { a: { waves: [] }, b: { waves: [] } };
  await section("main", async () => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(H.BASE + "/shenmaSanguo");
    await H.waitHud(page);
    await waitSync("idle");
    const s0 = await H.snapshot(page);
    const a0 = await gasActions();
    await page.locator('[title="切換關卡"]').click();
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 10000 });

    // M-1 組成依路線查看（和路線預覽同一個選擇）
    const f = await routeFlow();
    out.M1 = { s0: f.s0.comp, sa: { comp: f.sa.comp, route: f.sa.route }, sb: { comp: f.sb.comp, route: f.sb.route }, sAll: { comp: f.sAll.comp, route: f.sAll.route } };
    run.check("M-1 正式 chapter1_3 形狀的組成：預設全部（共 70 隻、6 種，原本的說明）；依路線選 path_a→45 隻、依第一次出現的順序與出兵波次、寫明是全關 70 隻中的這條路線，" +
      "路線預覽同時只畫 path_a；在路線預覽改選 path_b→組成跟著變成 25 隻；選回全部→組成的標題、說明、各列與摘要都和原本相同，路線預覽也回到全部",
      routeFlowOk(f), out.M1);
    // 鍵盤：從組成的展開按鈕 Tab 到依路線查看的選單
    await page.locator('[data-testid="preview-composition-toggle"]').focus();
    await press("Tab");
    const kbFocus = (await state()).focus;
    out.M1.kbFocus = kbFocus;
    run.check("M-1 鍵盤：從敵軍組成的展開按鈕按 Tab 就到依路線查看的選單", kbFocus === "preview-composition-route", { kbFocus });

    // M-2 第 1 波（預設展開）的設定出兵節奏
    const s2 = await state();
    out.M2 = rhythmOf(s2, 1);
    run.check("M-2 第 1 波的設定出兵節奏：3 組各 5 隻×1.5 秒，最後一隻名義在第 6 秒（(5−1)×1.5），整波 6 秒（取最晚、不是相加）；每組一行（3 行，不是 15 隻）；寫明遊戲時間、暫停與倍速、不是清波或勝負",
      wave1Ok(s2), out.M2);
    await closePreview();

    // M-3 波次導覽前往第 7 波（正式 chapter1_5 的間隔）
    await openPreview("chapter3_2");
    await page.locator('[data-testid="preview-wave-select"]').selectOption("7");
    await page.locator('[data-testid="preview-wave-goto"]').click();
    await H.sleep(300);
    const s3 = await state();
    const r7 = rhythmOf(s3, 7);
    out.M3 = { open: s3.open, focus: s3.focus, r7 };
    run.check("M-3 前往第 7 波：只展開第 7 波、焦點在它的標題；9 組同時開始，間隔 1.1 的 10 隻在 9.9 秒、1.6 的在 14.4 秒，整波 14.4 秒（取最晚，不是 9 組相加）",
      same(s3.open, [7]) && s3.focus === "preview-wave-toggle-7" && !!r7 && r7.status === "complete" && r7.last === "14.4" &&
        same(r7.groups.map((x) => x.last), ["9.9", "9.9", "9.9", "14.4", "14.4", "9.9", "9.9", "9.9", "14.4"]) &&
        r7.summary === "9 組同時開始；整波最後一隻名義在第 14.4 秒出兵（各組取最晚的一組，不是相加）",
      out.M3);
    await closePreview();

    // M-4 邊界：全部展開
    await openPreview("chapter3_3");
    await page.locator('[data-testid="preview-wave-expand-all"]').click();
    await H.sleep(300);
    const s4 = await state();
    const w = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => rhythmOf(s4, n));
    await pickRoute("preview-composition-route", "route:path_b");
    const s4b = await state();
    await pickRoute("preview-composition-route", "route:path_a");
    const s4a = await state();
    out.M4 = { w, compAll: s4.comp, compB: s4b.comp, compA: s4a.comp };
    const frameOk = (x) => x.kind === "frame" && /依處理幀出兵，無法由設定估算精確秒數/.test(x.text) && !/(^|[^.\d])0 秒/.test(x.text.replace(/^第 \d+ 組 /, ""));
    run.check("M-4 邊界的節奏：第 1 波一隻是 0 秒、沒有間隔的 5 隻照預設 1 秒是 4 秒並標出預設，整波 4 秒；第 2 波間隔 0 與負數依處理幀出兵（不寫 0 秒），整波「至少 4 秒」；" +
      "第 3 波字串間隔不強轉、只寫已估算的 4 秒；第 4 波數量無法判讀＋找不到的敵人與沒有路點的路線（略過 2 組）只寫已估算的 1 秒；第 5 波數字太大無法估算；整個預覽沒有 Infinity／NaN",
      w.every(Boolean) &&
        w[0].status === "complete" && w[0].last === "4" && w[0].groups[0].kind === "single" && /只有 1 隻：波次開始時出兵（0 秒）/.test(w[0].groups[0].text) &&
        w[0].groups[1].kind === "timed" && /每隻間隔 1 秒（沒有提供，遊戲預設）/.test(w[0].groups[1].text) &&
        w[1].status === "frame" && w[1].last === "4" && frameOk(w[1].groups[0]) && frameOk(w[1].groups[1]) && /整波至少 4 秒，無法估算精確秒數/.test(w[1].summary) &&
        w[2].status === "partial" && w[2].last === "4" && w[2].groups[0].kind === "unknown" && /間隔無法判讀：出兵間隔不是數字，無法估算/.test(w[2].groups[0].text) &&
        /僅已估算的組：最晚在第 4 秒；另有 1 組無法估算，不是整波的出兵時間/.test(w[2].summary) &&
        w[3].status === "partial" && w[3].last === "1" && w[3].groups.length === 2 && /另有 2 組遊戲會略過、不出兵/.test(w[3].text) &&
        w[4].status === "partial" && w[4].last === "" && /整波的出兵時間無法確定/.test(w[4].summary) &&
        !/Infinity|NaN/.test(s4.modalText),
      out.M4);
    run.check("M-4 小的正值與「至少」：第 6 波 2 隻×0.001 秒最後一隻在第 0.001 秒、整波 0.001 秒（不是 0 秒，data 也是 0.001）；第 7 波 3 隻×1/3 秒寫約第 0.6667 秒，整波「至少 0.6666 秒」（下限不進位）；" +
      "逐波組列寫「設定間隔」：沒有提供寫遊戲以 1 秒計、0 與負數寫兩隻之間依處理幀不是同時出兵、0.001 照實寫",
      !!w[5] && w[5].status === "complete" && w[5].last === "0.001" && w[5].groups[0].last === "0.001" &&
        /最後一隻名義在第 0\.001 秒（\(2−1\)×0\.001）/.test(w[5].groups[0].text) && /整波最後一隻名義在第 0\.001 秒出兵/.test(w[5].summary) &&
        !/第 0 秒|×0）/.test(w[5].text) &&
        !!w[6] && w[6].status === "frame" && /其他組最晚在約第 0\.6667 秒，另有 1 組依處理幀出兵：整波至少 0\.6666 秒/.test(w[6].summary) &&
        /設定間隔 未提供（遊戲以 1 秒計）/.test(w[0].rows[1]) &&
        w[1].rows.length === 3 && /設定間隔 ≤ 0（遊戲當作 0；兩隻之間依處理幀，不是同時出兵）/.test(w[1].rows[0]) && /設定間隔 ≤ 0（遊戲當作 0；兩隻之間依處理幀，不是同時出兵）/.test(w[1].rows[1]) &&
        /設定間隔 2 秒/.test(w[1].rows[2]) && /設定間隔 0\.001 秒/.test(w[5].rows[0]) &&
        !s4.rhythm.some((r) => r.rows.some((x) => /每隻間隔 0 秒/.test(x))),
      { w6: w[5], w7: w[6] && w[6].summary, rows: [w[0].rows, w[1].rows, w[5] && w[5].rows] });
    run.check("M-4 真值與下限：第 8 波 2 隻×0.6666999999999 秒寫「約第 0.6667 秒」、整波「至少 0.6666 秒」（不進位），data 是計算真值 0.6666999999999；第 9 波 2 隻×1234567890123 秒寫第 1234567890123 秒、data 相同（整數一位都不抹掉）",
      !!w[7] && w[7].status === "frame" && w[7].last === "0.6666999999999" && w[7].groups[1].last === "0.6666999999999" &&
        /最後一隻名義在約第 0\.6667 秒/.test(w[7].groups[1].text) && /其他組最晚在約第 0\.6667 秒，另有 1 組依處理幀出兵：整波至少 0\.6666 秒/.test(w[7].summary) &&
        !!w[8] && w[8].status === "complete" && w[8].last === "1234567890123" && /整波最後一隻名義在第 1234567890123 秒出兵/.test(w[8].summary),
      { w8: w[7], w9: w[8] && { last: w[8].last, summary: w[8].summary } });
    run.check("M-4 邊界的組成：全關有無法確定的組→只寫已確認；path_b 寫這條路線第 4 波無法確定與全關的原因；path_a 列找不到設定的敵人、略過 1 組，只有全關的原因；沒有路點的 path_z 不在選單",
      s4.comp.complete === "false" && /^▾ 敵軍組成 已確認 \d+ 隻$/.test(s4.comp.header) && same(s4.comp.select.options, ["全部路線（2 條）", "path_a", "path_b"]) &&
        s4b.comp.route === "path_b" && s4b.comp.complete === "false" && /^▾ 敵軍組成 path_b：已確認 \d+ 隻$/.test(s4b.comp.header) &&
        s4b.comp.gaps[0] === "資料問題：這條路線在第 4 波有無法確定能不能出兵或數量的組" && s4b.comp.gaps.slice(1).every((x) => x.startsWith("資料問題：全關：")) &&
        /僅已確認組：.*尚有資料問題，非這條路線的全部/.test(s4b.comp.summary || "") &&
        s4a.comp.route === "path_a" && s4a.comp.gaps.length > 0 && s4a.comp.gaps.every((x) => x.startsWith("資料問題：全關：")) &&
        /mock_rc_ghost/.test(s4a.comp.unknown || "") && /這條路線另有 1 組遊戲會略過/.test(s4a.comp.skipped || ""),
      { all: s4.comp, b: s4b.comp, a: s4a.comp });
    await closePreview();

    // W-1 逐波依路線查看（正式 chapter1_3 的逐波資料）
    wf = await waveRouteFlow();
    out.W1 = { all0: wf.all0, a: wf.a, b: wf.b, all1: wf.all1.scope };
    run.check("W-1 逐波依路線（正式 chapter1_3）：預設全部和原本相同（沒有路線摘要、節奏標題不變）；選 path_a 時第 1、2、3 波只列第 1～3、第 1、第 1／3／5 組（原本的組序），" +
      "寫「本路線已確認 15 隻／3 組」「5 隻／1 組」「25 隻／3 組」與全波摘要、其他路線沒有列出的組數；路線預覽改選 path_b→第 1 波寫沒有已確認出兵組、第 2、3 波 10、15 隻；" +
      "波次標題不變、節奏標明全波且仍是全部的組（3、3、6 組）；選回全部時每一波的內容和原本完全相同",
      waveRouteFlowOk(wf), out.W1);
    // 鍵盤與導覽：選了路線時前往第 3 波→只展開第 3 波、焦點在它的標題、仍只列 path_a 的組；Enter 收合、再 Enter 展開
    await pickRoute("preview-composition-route", "route:path_a");
    await page.locator('[data-testid="preview-wave-select"]').selectOption("3");
    await page.locator('[data-testid="preview-wave-goto"]').click();
    await H.sleep(300);
    const k1 = await waves();
    await press("Enter");
    const k2 = await waves();
    await press("Enter");
    const k3 = await waves();
    out.W1kb = { k1: { focus: k1.focus, open: k1.waves.filter((x) => x.open).map((x) => x.wave), w3: waveOf(k1, 3)?.groups }, k2: k2.waves.filter((x) => x.open).map((x) => x.wave), k3: { focus: k3.focus, w3: waveOf(k3, 3)?.groups } };
    run.check("W-1 鍵盤：選了 path_a 時用波次導覽前往第 3 波→只展開第 3 波、焦點在它的標題、列第 1、3、5 組；Enter 收合、再 Enter 展開仍只列 path_a 的組",
      k1.focus === "preview-wave-toggle-3" && same(out.W1kb.k1.open, [3]) && same(waveOf(k1, 3)?.groups, [1, 3, 5]) &&
        same(k2.waves.filter((x) => x.open).map((x) => x.wave), []) && k3.focus === "preview-wave-toggle-3" && same(waveOf(k3, 3)?.groups, [1, 3, 5]),
      out.W1kb);
    await closePreview();

    // W-2 邊界的資料問題：本路線的問題組照列、其他路線的問題另列全波資料提醒（原內容、不重複）、不補 0
    await openPreview("chapter3_3");
    await expandAll();
    await pickRoute("preview-composition-route", "route:path_a");
    const ea = await waves();
    await pickRoute("preview-composition-route", "route:path_b");
    const eb = await waves();
    out.W2 = { a4: waveOf(ea, 4), a1: waveOf(ea, 1), b4: waveOf(eb, 4), b3: waveOf(eb, 3) };
    const eA4 = waveOf(ea, 4) || {}, eA1 = waveOf(ea, 1) || {}, eB4 = waveOf(eb, 4) || {}, eB3 = waveOf(eb, 3) || {};
    run.check("W-2 邊界（第 4 波：path_b 數量無法判讀、path_a 找不到設定、path_z 沒有路點、path_a 正常 2 隻）：path_a 列第 2、4 組、已確認 2 隻／1 組，全波資料提醒列第 1、3 組（原本的說明）；" +
      "path_b 列第 1 組、寫沒有已確認出兵組＋另有 1 組無法確定，提醒列第 2、3 組；整波摘要是數量無法確定；第 1 波 path_a 的提醒列 path_b 沒有提供間隔的第 2 組；第 3 波 path_b 其他路線沒有問題時只寫沒有列出的組數",
      same(eA4.groups, [2, 4]) && eA4.route?.n === 2 && eA4.route?.m === 1 && same(eA4.other, [1, 3]) &&
        /全波資料提醒（其他路線）/.test(eA4.otherText || "") && /路線 path_z/.test(eA4.otherText || "") && /數量無法判讀/.test(eA4.otherText || "") &&
        /（第 4 波全波：數量無法確定）/.test(eA4.route?.text || "") &&
        same(eB4.groups, [1]) && eB4.route?.text === "路線 path_b：本路線沒有已確認出兵組，另有 1 組無法確定能不能出兵或數量（第 4 波全波：數量無法確定）。其他路線另有 1 組沒有列出（在「敵軍組成」或「路線預覽」選全部路線查看）。" &&
        same(eB4.other, [2, 3]) && /找不到敵人設定「mock_rc_ghost」/.test(eB4.otherText || "") &&
        same(eA1.groups, [1]) && same(eA1.other, [2]) && /沒有提供出兵間隔/.test(eA1.otherText || "") &&
        same(eB3.groups, [2]) && same(eB3.other, []) && /其他路線另有 1 組沒有列出/.test(eB3.route?.text || "") &&
        [eA4, eB4].every((x) => new Set([...x.groups, ...x.other]).size === x.groups.length + x.other.length),
      out.W2);
    await closePreview();

    // W-3 缺波、拒絕、重複照整波
    await openPreview("chapter3_5");
    await expandAll();
    await pickRoute("preview-composition-route", "route:path_a");
    const ma = await waves();
    await pickRoute("preview-composition-route", "route:path_b");
    const mb = await waves();
    out.W3 = { a: ma.waves, b: mb.waves.map((x) => ({ wave: x.wave, groups: x.groups, other: x.other, route: x.route })) };
    const m2 = waveOf(ma, 2) || {}, m3 = waveOf(ma, 3) || {}, m4 = waveOf(ma, 4) || {}, n3 = waveOf(mb, 3) || {}, n4 = waveOf(mb, 4) || {};
    run.check("W-3 缺波、拒絕、重複：第 2 波（沒有資料）仍寫遊戲會拒絕開始、path_a 沒有已確認出兵組（全波：沒有資料）；第 3 波 path_a 列找不到設定的第 1 組、沒有已確認，path_b 把它列在全波資料提醒；" +
      "第 4 波重複資料的說明照列，path_b 只算第一筆的 2 隻、path_a 沒有組",
      /關卡資料沒有第 2 波：遊戲打到這一波會拒絕開始/.test(m2.bodyText || "") && /本路線沒有已確認出兵組（第 2 波全波：沒有資料）/.test(m2.route?.text || "") && same(m2.groups, []) &&
        /這一波沒有可以出兵的敵人組：遊戲會拒絕開始這一波/.test(m3.bodyText || "") && same(m3.groups, [1]) && m3.route?.m === 0 && /（第 3 波全波：遊戲會拒絕這一波）/.test(m3.route?.text || "") &&
        same(n3.groups, []) && same(n3.other, [1]) &&
        /第 4 波另有 1 筆重複的資料，遊戲只使用第一筆/.test(m4.bodyText || "") && same(m4.groups, []) && n4.route?.n === 2 && same(n4.groups, [1]),
      out.W3);
    await closePreview();

    // M-5 關閉關卡選擇：戰場不變、沒有寫入
    await press("Escape");
    await H.sleep(300);
    const s1 = await H.snapshot(page);
    const a1 = await gasActions();
    out.M5 = { before: { stage: s0.stage, battle: s0.battle_id }, after: { stage: s1.stage, battle: s1.battle_id }, writes: writes(a1) - writes(a0) };
    run.check("M-5 主頁只操作預覽（依路線組成、節奏、波次導覽）：目前的戰場（關卡、場次）不變、沒有寫入",
      s1.stage === s0.stage && s1.battle_id === s0.battle_id && out.M5.writes === 0,
      out.M5);
  });

  // ── P 獨立關卡頁 ──
  await section("page", async () => {
    const a0 = await gasActions();
    await page.goto(H.BASE + "/shenmaSanguo/stages");
    await page.waitForSelector('[data-testid="stage-filter-bar"]', { timeout: 60000 });
    await waitSync("idle").catch(() => null);

    // P-1 同一套組成與節奏
    const f = await routeFlow();
    await closePreview();
    await openPreview("chapter3_1");
    const sw = await state();
    await closePreview();
    out.P1 = { comp: f.sa.comp, wave1: rhythmOf(sw, 1) };
    run.check("P-1 獨立關卡頁：依路線查看與路線預覽同步（全部→path_a 45→path_b 25→全部）、第 1 波節奏 6 秒，和主頁相同",
      routeFlowOk(f) && wave1Ok(sw), out.P1);

    // P-5 獨立關卡頁：逐波依路線查看和主頁相同
    const pf = await waveRouteFlow();
    await closePreview();
    out.P5 = { a: pf.a.waves.map((x) => [x.groups, x.route && x.route.text]), b: pf.b.waves.map((x) => [x.groups, x.route && x.route.text]) };
    run.check("P-5 獨立關卡頁：逐波依路線（全部→path_a→path_b→全部）的組、摘要、全波節奏與回到全部的內容都和主頁相同",
      waveRouteFlowOk(pf) && same(out.P5, { a: wf.a.waves.map((x) => [x.groups, x.route && x.route.text]), b: wf.b.waves.map((x) => [x.groups, x.route && x.route.text]) }), out.P5);

    // 過期的設定快取（「刷新」多 path_b），重新讀取暫停後放行
    const staleReload = async () => {
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
    };
    const release = async () => {
      await page.evaluate(() => window.__shenmaMock.release("get_all_maps"));
      await page.waitForFunction(() => document.querySelectorAll('[data-testid="preview-composition-route"] option').length === 3, null, { timeout: 30000, polling: 100 });
      await H.sleep(400);
    };

    // P-2 選的路線在設定更新後被刪掉
    await staleReload();
    await openPreview("chapter3_4");
    await expandRoute();
    await pickRoute("preview-composition-route", "route:path_b");
    await page.locator('[data-testid="preview-composition-route"]').focus();
    const before = await state();
    const wBefore = await waves();
    await release();
    const after = await state();
    const wAfter = await waves();
    out.P2b = { before: wBefore, after: wAfter };
    run.check("P-2b 設定更新刪掉選的 path_b：更新前第 1 波只列 path_b 的第 3 組；更新後逐波也回到全部（第 1、2 組、沒有路線摘要與範圍說明）",
      same(waveOf(wBefore, 1)?.groups, [3]) && waveOf(wBefore, 1)?.route?.id === "path_b" &&
        wAfter.scope === null && same(waveOf(wAfter, 1)?.groups, [1, 2]) && waveOf(wAfter, 1)?.route === null,
      out.P2b);
    out.P2 = { before: { comp: before.comp, route: before.route }, after: { title: after.title, comp: after.comp, route: after.route, focus: after.focus } };
    run.check("P-2 設定更新（預覽開著）：組成選的 path_b 被刪掉→組成與路線預覽都回到全部（path_a、path_c），組成回到全關說明；焦點留在依路線查看的選單；仍是同一關",
      before.comp.route === "path_b" && same(before.comp.rows, [[C2, 4, "1"]]) && same(before.route.lines, ["path_b"]) &&
        /Mock RC 刷新/.test(after.title || "") && after.comp.route === "" && after.comp.select.value === "" &&
        same(after.comp.select.options, ["全部路線（2 條）", "path_a", "path_c"]) && /^全關共 5 隻、2 種敵人/.test(after.comp.summary || "") &&
        after.route.select.value === "" && same(after.route.lines, ["path_a", "path_c"]) && after.focus === "preview-composition-route",
      out.P2);
    await closePreview();

    // P-3 仍存在的路線保留
    await staleReload();
    await openPreview("chapter3_4");
    await expandRoute();
    await pickRoute("preview-composition-route", "route:path_c");
    await release();
    const keep = await state();
    await closePreview();
    out.P3 = { comp: keep.comp, route: keep.route };
    run.check("P-3 設定更新後仍存在的 path_c：組成與路線預覽都保留 path_c（3 隻、第 1 波）",
      keep.comp.route === "path_c" && keep.comp.select.value === "route:path_c" && same(keep.comp.rows, [[G3, 3, "1"]]) &&
        keep.route.select.value === "route:path_c" && same(keep.route.lines, ["path_c"]),
      out.P3);

    // P-4 手機寬度
    const fit = {};
    const shots = {};
    for (const vp of [{ width: 390, height: 600 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(vp);
      await H.sleep(300);
      await openPreview("chapter3_3");
      await pickRoute("preview-composition-route", "route:path_b");
      await page.locator('[data-testid="preview-composition"]').scrollIntoViewIfNeeded();
      await H.sleep(200);
      fit[vp.height] = { comp: await layout() };
      shots[vp.height + "-comp"] = await H.shot(page, `stage-rhythm-comp-390x${vp.height}`);
      await page.locator('[data-testid="preview-wave-select"]').selectOption("2");
      await page.locator('[data-testid="preview-wave-goto"]').click();
      await H.sleep(300);
      await page.locator('[data-testid="preview-wave-2"] [data-testid="preview-rhythm"]').scrollIntoViewIfNeeded();
      await H.sleep(200);
      fit[vp.height].rhythm = await layout();
      shots[vp.height + "-rhythm"] = await H.shot(page, `stage-rhythm-wave2-390x${vp.height}`);
      await page.locator('[data-testid="preview-wave-select"]').selectOption("4");
      await page.locator('[data-testid="preview-wave-goto"]').click();
      await H.sleep(300);
      await page.locator('[data-testid="preview-wave-4"] [data-testid="preview-wave-other-problems"]').scrollIntoViewIfNeeded();
      await H.sleep(200);
      fit[vp.height].wave = await page.evaluate(() => {
        const p = document.querySelector('[data-testid="enemy-preview"] [role="dialog"]').getBoundingClientRect();
        const box = (sel) => { const x = document.querySelector(sel); if (!x) return null; const q = x.getBoundingClientRect(); return { left: Math.round(q.left), right: Math.round(q.right), w: Math.round(q.width), sw: x.scrollWidth, cw: x.clientWidth }; };
        return { panel: { left: Math.round(p.left), right: Math.round(p.right) }, vw: innerWidth, docScroll: document.documentElement.scrollWidth,
          route: box('[data-testid="preview-wave-4"] [data-testid="preview-wave-route"]'), other: box('[data-testid="preview-wave-4"] [data-testid="preview-wave-other-problems"]') };
      });
      shots[vp.height + "-wave-route"] = await H.shot(page, `stage-rhythm-wave4-route-390x${vp.height}`);
      await closePreview();
    }
    const a1 = await gasActions();
    out.P4 = { fit, shots, writes: writes(a1) - writes(a0) };
    const inPanel = (l, k) => l[k].length > 0 && l[k].every((b) => b.left >= l.panel.left && b.right <= l.panel.right && b.w > 0 && b.sw <= b.cw + 1);
    const ok = (l) => !!l.panel && l.panel.left >= 0 && l.panel.right <= l.vw && l.docScroll <= l.vw && l.closeHit && l.closeInView;
    run.check("P-4 獨立關卡頁 390×600／390×844：依路線查看的選單與第 2 波的節奏區塊都在預覽裡（沒有內部橫向溢出）、關閉鈕沒有被擋、沒有橫向捲動；獨立關卡頁全程沒有寫入",
      [600, 844].every((h) => ok(fit[h].comp) && ok(fit[h].rhythm) && inPanel(fit[h].comp, "select") && inPanel(fit[h].rhythm, "rhythm")) &&
        out.P4.writes === 0,
      out.P4);
    const inside = (l, b) => !!b && b.w > 0 && b.left >= l.panel.left && b.right <= l.panel.right && b.sw <= b.cw + 1;
    run.check("P-4b 獨立關卡頁 390×600／390×844：選 path_b 前往第 4 波，路線摘要與全波資料提醒都在預覽裡（沒有內部橫向溢出）、沒有橫向捲動",
      [600, 844].every((h) => { const l = fit[h].wave; return l && inside(l, l.route) && inside(l, l.other) && l.docScroll <= l.vw; }),
      { 600: fit[600].wave, 844: fit[844].wave });
    await page.setViewportSize({ width: 1280, height: 800 });
  });

  return run.finish({ out });
}
