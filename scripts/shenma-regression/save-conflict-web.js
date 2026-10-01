async (page) => {
  // 存檔版本保護與衝突處理（瀏覽器，兩個分頁）：
  // - 兩個分頁（同一個瀏覽器 context：localStorage 共用、sessionStorage 各自一份）打同一個共用後端。
  //   後端在 Node 端（exposeBinding），所有分頁的請求依序處理、共用同一份資料；不是每個分頁各一份 mock。
  //   預設是腳本內建的契約 mock（新版後端的版本契約）；tools/run-browser.mjs 設定 GAS_BACKEND 時改用那個模組的後端
  // - 只有玩家存檔與設定寫入的請求交給共用後端；靜態設定的讀取仍由 harness 的頁面內 mock 回應
  // - 情境：舊分頁的保存被拒 → 衝突提示 → 比較 → 取消 → 確認期間雲端又更新 → 延遲回覆與連按 → 保留這個分頁 →
  //   匯出備份 → 另一個分頁使用雲端、放回備份 → 重新整理後重新偵測 → 寫入限制時不能處理 → 地圖編輯器的管理密碼 →
  //   在設定頁預覽剛才下載的匯出檔（唯讀）
  // - 不需要 Godot（只走 /shenmaSanguo 的隊伍、武將、設定頁與 /mapEditor）；全部虛構金鑰與測試用密碼
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const ctx = page.context();
  const run = H.begin();
  const out = { backend: null, steps: {} };
  const KEY = "test_conflict_a";
  const ADMIN = "test-admin-token-7c1";
  const SHENMA = H.BASE + "/shenmaSanguo";

  // ── 契約 mock（新版後端的版本契約，Node 端、所有分頁共用）──
  const contractBackend = () => {
    const profiles = new Map();
    const revs = new Map();
    const results = new Map();
    const log = [];
    const holds = new Map();
    let adminToken = null;
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
    const HEROES = { guan_yu: [150, 120, 1500], zhao_yun: [150, 120, 1500], huang_zhong: [150, 120, 1500], zhou_yu: [122, 120, 1500] };
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
      const reject = () => ({ status: hasBase ? 409 : 428, error: hasBase ? "REV_CONFLICT" : "BASE_REV_REQUIRED", rev: rev(), data: clone(p) });
      if (["update_map_config", "create_map_config", "save_waves_config", "save_enemies_config", "save_heroes_config"].includes(action)) {
        if (!adminToken || payload.admin_token !== adminToken) return { status: 403, error: "ADMIN_REQUIRED" };
        return { status: 200, success: true, message: "SAVED" };
      }
      if (!p && action !== "create_profile") return { status: 404, error: "PROFILE_NOT_FOUND" };
      switch (action) {
        case "get_profile":
          return { status: 200, data: clone(p), rev: rev() };
        case "save_profile": {
          if (hasBase && base !== rev()) return reject();
          const prev = rev();
          profiles.set(key, clone(payload.data));
          return { status: 200, success: true, rev: bump(), prev_rev: prev };
        }
        case "upgrade_hero": {
          if (hasBase && base !== rev()) return reject();
          const stats = HEROES[payload.hero_id] || [150, 120, 1500];
          const cur = p.heroes.find((h) => h.hero_id === payload.hero_id) || { hero_id: payload.hero_id, level: 1, star: 0, atk: stats[0], def: stats[1], hp: stats[2] };
          const cost = 100 * cur.level;
          if (p.gold < cost) return { status: 400, error: "GOLD_NOT_ENOUGH", rev: rev() };
          const hero = { ...cur, level: cur.level + 1, atk: cur.atk + 10, def: cur.def + 8, hp: cur.hp + 100 };
          p.gold -= cost;
          p.heroes = [...p.heroes.filter((h) => h.hero_id !== hero.hero_id), hero];
          const prev = rev();
          return { status: 200, success: true, hero, gold_remaining: p.gold, cost, rev: bump(), prev_rev: prev };
        }
        case "save_result": {
          const ids = results.get(key) || new Map();
          results.set(key, ids);
          const body2 = (e) => {
            const o = { status: 200, success: true, log_id: e.log_id, prev_rev: e.prev_rev };
            if (hasBase && base === e.prev_rev) o.rev = e.rev;
            else if (hasBase) o.base_mismatch = true;
            return o;
          };
          if (payload.request_id && ids.has(payload.request_id)) return { ...body2(ids.get(payload.request_id)), duplicate: true };
          const prev = rev();
          let changed = false;
          if (payload.result === "WIN") {
            const next = nextStage(payload.stage_id);
            if (stageNum(next) > stageNum(p.max_stage)) {
              p.max_stage = next;
              changed = true;
            }
          }
          const e = { log_id: "log-" + (log.length + 1), prev_rev: prev, rev: changed ? bump() : prev };
          if (payload.request_id) ids.set(payload.request_id, e);
          return body2(e);
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
      setAdminToken(t) {
        adminToken = t;
      },
      profile: (key) => clone(profiles.get(key)),
      rev: (key) => revs.get(key) ?? 0,
      hold(tag, action) {
        holds.set(tag + ":" + action, { waiters: [] });
      },
      release(tag, action) {
        const h = holds.get(tag + ":" + action);
        holds.delete(tag + ":" + action);
        (h ? h.waiters : []).forEach((w) => w());
        return h ? h.waiters.length : 0;
      },
      pending: (tag, action) => (holds.get(tag + ":" + action)?.waiters.length ?? 0),
      async handle(body, tag) {
        const entry = { t: Date.now(), tag, action: body.action, base_rev: body.payload?.base_rev, hasAdminToken: typeof body.payload?.admin_token === "string" };
        log.push(entry);
        const h = holds.get(tag + ":" + body.action);
        if (h) await new Promise((r) => h.waiters.push(r));
        const res = apply(body);
        entry.status = res.status;
        entry.error = res.error;
        entry.rev = res.rev;
        return res;
      },
    };
  };
  const backend = ctx.__shenmaGasBackendFactory ? await ctx.__shenmaGasBackendFactory() : contractBackend();
  out.backend = backend.kind;
  const seedProfile = {
    // 容量放寬（harness 的武將花費 6～9），隊伍頁才能加人
    nickname: "兩分頁玩家", level: 1, exp: 0, gold: 1000, capacity: 40, max_stage: "chapter1_7", heroes: [],
    team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }],
  };
  backend.seed(KEY, seedProfile, 5);
  backend.setAdminToken(ADMIN);

  // 分頁標記：A 是 harness 的第一頁，B 是新開的分頁
  const tags = new Map([[page, "A"]]);
  await ctx.exposeBinding("__shenmaSharedGas", async (source, body) => backend.handle(body, tags.get(source.page) || "?"));
  await ctx.addInitScript(() => {
    if (window.top !== window) return;
    const SHARED = ["get_profile", "create_profile", "save_profile", "save_result", "upgrade_hero",
      "update_map_config", "create_map_config", "save_waves_config", "save_enemies_config", "save_heroes_config"];
    const inner = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : (input && input.url) || String(input);
      if (url.startsWith("https://script.google.com/") && localStorage.getItem("__shenma_shared_backend") === "1" && typeof window.__shenmaSharedGas === "function") {
        let body = {};
        try { body = JSON.parse((init && init.body) || "{}"); } catch { body = {}; }
        if (SHARED.includes(body.action)) {
          const res = await window.__shenmaSharedGas(body);
          await new Promise((r) => setTimeout(r, 50));
          return new Response(JSON.stringify(res), { status: 200, headers: { "Content-Type": "application/json" } });
        }
      }
      return inner(input, init);
    };
  });

  // ── 輔助 ──
  const logOf = (tag, action) => backend.log.filter((e) => (!tag || e.tag === tag) && (!action || e.action === action));
  const waitUntil = async (fn, timeout = 60000, what = "條件") => {
    const end = Date.now() + timeout;
    for (;;) {
      const v = await fn();
      if (v) return v;
      if (Date.now() > end) throw new Error("等不到：" + what);
      await H.sleep(150);
    }
  };
  const sessionOf = (p) => p.evaluate(() => JSON.parse(sessionStorage.getItem("shenma_player_state") || "null"));
  const loadedAt = (p) => waitUntil(async () => {
    const s = await sessionOf(p);
    return s && s.key === "test_conflict_a" ? s : null;
  }, 90000, "玩家資料載入");
  // 底部提示的按鈕：開發模式左下角的 Next.js 指示器會蓋住第一個按鈕（正式版沒有），dev 時改用 DOM 點擊事件
  const clickNotice = (p, id) =>
    process.env.LOCAL_ASSETS === "1" ? p.locator(`[data-testid="${id}"]`).click() : p.locator(`[data-testid="${id}"]`).dispatchEvent("click");
  const noticeVisible = (p, id) => p.locator(`[data-testid="${id}"]`).isVisible().catch(() => false);
  const waitNotice = (p, id, timeout = 60000) => p.waitForSelector(`[data-testid="${id}"]`, { timeout });
  const teamOf = (s) => (s && s.team ? [...s.team].sort((a, b) => a.slot - b.slot).map((t) => t.hero_id).join(",") : null);
  // 隊伍頁的選取會在玩家資料更新時重設：先等這個分頁沒有未同步的修改、畫面穩定再點
  const settled = async (p) => {
    await waitUntil(async () => {
      const s = await sessionOf(p);
      return s && s.rev === s.syncedRev;
    }, 30000, "分頁同步穩定");
    await H.sleep(800);
  };
  const toggleTeamHero = async (p, name) => {
    await p.locator('div[class*="poolCard"]', { hasText: name }).first().click();
    await H.sleep(200);
  };
  const saveTeam = async (p) => {
    await p.getByRole("button", { name: "儲存隊伍" }).click();
    await p.waitForSelector("text=隊伍已儲存", { timeout: 10000 });
  };
  const upgradeOnHeroes = async (p, name) => {
    await p.locator('[data-hero-id][class*="heroCard"]', { hasText: name }).first().click();
    await p.getByRole("button", { name: /^升級 \(-\d+ 點\)$/ }).click();
    const msg = await waitUntil(async () => {
      const t = await p.locator(".alert").allInnerTexts();
      return t.find((x) => /升級成功|雲端存檔|升級失敗|點數不足/.test(x));
    }, 30000, "升級結果");
    await p.getByRole("button", { name: "關閉" }).first().click().catch(() => {});
    return msg;
  };
  const tableRows = (p) => p.evaluate(() =>
    [...document.querySelectorAll('[data-testid="save-conflict-table"] tbody tr')].map((tr) => ({
      row: tr.getAttribute("data-row"), differs: tr.getAttribute("data-differs") === "1",
      cells: [...tr.querySelectorAll("td")].map((td) => td.innerText.trim()),
    })));
  const openCompare = async (p) => {
    await clickNotice(p, "save-conflict-compare");
    await waitNotice(p, "save-conflict-modal", 10000);
  };
  const confirmChoice = async (p, choice) => {
    await p.locator(`[data-testid="save-conflict-${choice}"]`).click();
    await waitNotice(p, "save-conflict-confirm", 10000);
  };

  // B 分頁的主控台錯誤（harness 只監聽第一頁）
  const bErrors = [];
  const openB = async () => {
    const p = await ctx.newPage();
    tags.set(p, "B");
    await p.setViewportSize({ width: 540, height: 900 });
    p.on("console", (m) => {
      if (m.type() !== "error") return;
      let url = "";
      try { url = (m.location() && m.location().url) || ""; } catch { url = ""; }
      bErrors.push({ text: m.text().slice(0, 200), url: url.slice(0, 200) });
    });
    p.on("pageerror", (e) => bErrors.push({ text: "pageerror: " + String(e).slice(0, 200), url: "" }));
    return p;
  };
  const KNOWN_B = (e) =>
    (/^Failed to load resource: net::ERR_(BLOCKED_BY_CLIENT|FAILED)/.test(e.text) && /(googletagmanager|google-analytics|googlesyndication|doubleclick|adtrafficquality|googleadservices)/.test(e.url)) ||
    (/status of 404/.test(e.text) && /\/_next\/static\/chunks\/src_components_common_/.test(e.url)) ||
    (/status of 404/.test(e.text) && /\/images\/cover\/contact\.webp$/.test(e.url));

  let B = null;
  try {
    // ── 0. 準備：清空、設定金鑰與共用後端 ──
    await H.resetOrigin(page);
    await page.evaluate((k) => {
      localStorage.setItem("shenma_player_key", k);
      localStorage.setItem("__shenma_shared_backend", "1");
    }, KEY);

    // ── 1. 兩個分頁都讀到版本 5 ──
    await page.goto(SHENMA + "/team");
    const a0 = await loadedAt(page);
    B = await openB();
    await B.goto(SHENMA + "/heroes");
    const b0 = await loadedAt(B);
    run.check("C-1 兩個分頁讀到同一份雲端存檔（版本 5），各自的 session 記下版本 5", a0.serverRev === 5 && b0.serverRev === 5 && teamOf(a0) === "guan_yu,zhao_yun", { a: a0.serverRev, b: b0.serverRev });

    // ── 2. B：升級關羽（5 → 6），改隊伍後保存（6 → 7）──
    const up1 = await upgradeOnHeroes(B, "關羽");
    await B.goto(SHENMA + "/team");
    await loadedAt(B);
    await settled(B);
    await toggleTeamHero(B, "趙雲");
    await saveTeam(B);
    await B.goto(SHENMA + "/settings"); // 重新整理後立刻補送未同步的隊伍
    // 升級後本機也標成未同步（換頁時補送一次），所以雲端版本不是固定的數字：以 B 同步完成時的雲端版本為基準 R
    const b2 = await waitUntil(async () => {
      const s = await sessionOf(B);
      return s && s.rev === s.syncedRev && teamOf(s) === "guan_yu" && s.serverRev === backend.rev(KEY) ? s : null;
    }, 30000, "B 同步完成");
    const R = backend.rev(KEY);
    out.steps.R = R;
    const bUp = logOf("B", "upgrade_hero")[0];
    const bSaves = logOf("B", "save_profile");
    run.check("C-2 B 升級關羽（帶版本 5 → 6）、之後的保存都帶自己知道的版本並成功；B 的版本和雲端一致（R）、已同步；雲端隊伍只有關羽、關羽 Lv2、點數 900",
      /升級成功/.test(up1) && bUp?.base_rev === 5 && bUp?.status === 200 && bSaves.length >= 1 && bSaves.every((e) => e.status === 200) && bSaves[0].base_rev === 6 &&
        b2.serverRev === R && R >= 7 && teamOf(backend.profile(KEY)) === "guan_yu" && backend.profile(KEY).gold === 900 && backend.profile(KEY).heroes[0]?.level === 2,
      { up1, bUp, bSaves, R });

    // ── 3. A（還是版本 5）改隊伍：保存被拒 → 衝突提示；雲端不變 ──
    await settled(page);
    await toggleTeamHero(page, "黃忠");
    await saveTeam(page);
    await page.goto(SHENMA + "/settings");
    await waitNotice(page, "save-conflict");
    const aSave = logOf("A", "save_profile").slice(-1)[0];
    const a3 = await sessionOf(page);
    const cloud3 = backend.profile(KEY);
    await H.shot(page, "save-conflict-notice-narrow");
    run.check("C-3 A 用舊版本 5 保存被拒（409）→ 畫面下方出現衝突提示；雲端仍是 B 的內容（版本 R：隊伍只有關羽、關羽 Lv2、點數 900）；A 的隊伍修改保留在本機（尚未保存）",
      aSave?.base_rev === 5 && aSave?.status === 409 && backend.rev(KEY) === R && teamOf(cloud3) === "guan_yu" && cloud3.gold === 900 && cloud3.heroes[0]?.level === 2 &&
        teamOf(a3) === "guan_yu,zhao_yun,huang_zhong" && a3.rev !== a3.syncedRev && a3.serverRev === 5,
      { aSave, a3: { team: teamOf(a3), rev: a3.rev, synced: a3.syncedRev, serverRev: a3.serverRev } });

    // ── 4. 比較視窗 ──
    await openCompare(page);
    const rows = await tableRows(page);
    const modalText = await page.locator('[data-testid="save-conflict-modal"]').innerText();
    await H.shot(page, "save-conflict-compare-narrow");
    await page.locator("#conflict-show-heroes").check();
    const heroRows = (await tableRows(page)).filter((r) => r.row && r.row.startsWith("hero:"));
    await page.locator("#conflict-show-same").check();
    const allRows = await tableRows(page);
    await page.setViewportSize({ width: 1280, height: 800 });
    await H.shot(page, "save-conflict-compare-wide");
    await page.setViewportSize({ width: 540, height: 900 });
    const byId = (list, id) => list.find((r) => r.row === id);
    run.check("C-4 比較視窗：預設只列不同的項目（點數 1000／900、隊伍、武將都標示不同），相同的暱稱、等級隱藏；展開武將明細有關羽（本機未升級、雲端 Lv2）；顯示相同項目後暱稱列標示相同；畫面上沒有存檔金鑰",
      byId(rows, "gold")?.differs && byId(rows, "gold")?.cells[1] === "1000" && byId(rows, "gold")?.cells[2] === "900" &&
        byId(rows, "team")?.differs && byId(rows, "heroes")?.differs && !byId(rows, "nickname") && !byId(rows, "level") &&
        heroRows.some((r) => r.row === "hero:guan_yu" && r.differs && /未升級/.test(r.cells[1]) && /Lv\.2/.test(r.cells[2])) &&
        byId(allRows, "nickname")?.differs === false && !modalText.includes(KEY) && modalText.includes(`雲端（版本 ${R}）`),
      { rows, heroRows });

    // ── 5. 取消：確認步驟返回、關閉視窗都不改資料 ──
    const reqA5 = logOf("A").length;
    await page.locator("#conflict-show-same").uncheck();
    await confirmChoice(page, "server");
    const impact = await page.locator('[data-testid="save-conflict-impact"]').innerText();
    await H.shot(page, "save-conflict-confirm-cloud");
    await page.locator('[data-testid="save-conflict-confirm-no"]').click();
    const backToTable = await page.locator('[data-testid="save-conflict-table"]').isVisible();
    await page.locator('button[aria-label="關閉"]').click();
    await H.sleep(500);
    const a5 = await sessionOf(page);
    run.check("C-5 取消：選「使用雲端版本」後先列出影響（戰場點數 1000 → 900、隊伍變成只有關羽），按「返回比較」、再關閉視窗都不改變任何資料、沒有送出請求；衝突提示仍在",
      /戰場點數：1000 → 900/.test(impact) && /隊伍：關羽、趙雲、黃忠 → 關羽/.test(impact) && backToTable &&
        logOf("A").length === reqA5 && teamOf(a5) === "guan_yu,zhao_yun,huang_zhong" && backend.rev(KEY) === R && (await noticeVisible(page, "save-conflict")),
      { impact });

    // ── 6. 確認期間雲端又更新：B 再升級一次（R → R+1），A 的確認不覆蓋、刷新比較 ──
    backend.hold("B", "save_profile"); // B 升級後的自動保存先停住，之後再放行
    await B.goto(SHENMA + "/heroes");
    await loadedAt(B);
    await openCompare(page);
    await confirmChoice(page, "local");
    const up2 = await upgradeOnHeroes(B, "關羽");
    await waitUntil(() => backend.rev(KEY) === R + 1, 20000, "B 第二次升級");
    await page.locator('[data-testid="save-conflict-confirm-yes"]').click();
    await waitNotice(page, "save-conflict-message", 20000);
    const msg6 = await page.locator('[data-testid="save-conflict-message"]').innerText();
    const modal6 = await page.locator('[data-testid="save-conflict-modal"]').innerText();
    const aSave6 = logOf("A", "save_profile").slice(-1)[0];
    const cloud6 = backend.profile(KEY);
    await H.shot(page, "save-conflict-refreshed");
    run.check("C-6 A 在確認步驟時 B 又升級（雲端 R+1）：A 確認「保留這個分頁」只以畫面上的版本 R 條件寫入 → 被拒，不自動重試；比較已刷新成雲端版本 R+1，雲端仍是 B 的內容（關羽 Lv3、點數 700）",
      /升級成功/.test(up2) && aSave6?.base_rev === R && aSave6?.status === 409 && /又有變化/.test(msg6) && modal6.includes(`雲端（版本 ${R + 1}）`) &&
        backend.rev(KEY) === R + 1 && cloud6.gold === 700 && cloud6.heroes[0]?.level === 3 && logOf("A", "save_profile").filter((e) => e.base_rev === R + 1).length === 0,
      { msg6, aSave6 });

    // ── 7. 延遲回覆與連按：A 的保存停在後端，按鈕處理中不能再按；放行後完成 ──
    backend.hold("A", "save_profile");
    await confirmChoice(page, "local");
    await page.locator('[data-testid="save-conflict-confirm-yes"]').click();
    await waitUntil(() => backend.pending("A", "save_profile") === 1, 10000, "A 的保存送達");
    const busyBtn = page.locator('[data-testid="save-conflict-confirm-yes"]');
    const busy = { text: await busyBtn.innerText(), disabled: await busyBtn.isDisabled() };
    await busyBtn.dispatchEvent("click"); // 停用的按鈕不會觸發
    await H.sleep(500);
    const heldCount = logOf("A", "save_profile").filter((e) => e.base_rev === R + 1).length;
    backend.release("A", "save_profile");
    await waitNotice(page, "conflict-backup", 20000);
    const a7 = await sessionOf(page);
    const cloud7 = backend.profile(KEY);
    await H.shot(page, "save-conflict-backup-notice");
    run.check("C-7 延遲回覆：A 的條件寫入（帶 R+1）停在後端時按鈕顯示處理中並停用，再按不會多送；放行後雲端變成 A 的內容（版本 R+2：隊伍關羽、趙雲、黃忠，點數 1000），衝突提示換成備份提示",
      busy.disabled && /處理中/.test(busy.text) && heldCount === 1 && backend.rev(KEY) === R + 2 && teamOf(cloud7) === "guan_yu,zhao_yun,huang_zhong" && cloud7.gold === 1000 &&
        a7.serverRev === R + 2 && a7.rev === a7.syncedRev && !(await noticeVisible(page, "save-conflict")) && !(await noticeVisible(page, "save-conflict-modal")),
      { busy, heldCount, a7: { serverRev: a7.serverRev } });

    // ── 8. 匯出備份 ──
    const [download] = await Promise.all([page.waitForEvent("download"), clickNotice(page, "conflict-backup-export")]);
    const exportPath = `${H.EVIDENCE}/save-conflict-export.json`;
    await download.saveAs(exportPath);
    out.steps.exportPath = exportPath;
    // 在 Node 端讀回下載的檔案（tools/run-browser.mjs 的環境）
    const exportText = process.getBuiltinModule("fs").readFileSync(exportPath, "utf8");
    const exp = JSON.parse(exportText || "{}");
    run.check("C-8 匯出備份：檔案有選擇前這個分頁的資料（隊伍含黃忠）與被覆蓋的雲端資料（點數 700、版本 R+1），整個檔案沒有存檔金鑰",
      teamOf(exp.this_tab) === "guan_yu,zhao_yun,huang_zhong" && exp.cloud?.gold === 700 && exp.cloud_rev === R + 1 && !exportText.includes(KEY),
      { keys: Object.keys(exp) });

    // ── 9. B 的保存放行：B（版本 R+1）被拒 → B 選「使用雲端版本」──
    backend.release("B", "save_profile");
    await waitNotice(B, "save-conflict", 40000);
    await openCompare(B);
    await confirmChoice(B, "server");
    await B.locator('[data-testid="save-conflict-confirm-yes"]').click();
    await waitNotice(B, "conflict-backup", 20000);
    const b9 = await sessionOf(B);
    run.check("C-9 B 升級後的保存（帶 R+1）被拒 → B 也出現衝突；B 選「使用雲端版本」後換成 A 保存的內容（版本 R+2，已同步），雲端沒有被改",
      teamOf(b9) === "guan_yu,zhao_yun,huang_zhong" && b9.gold === 1000 && b9.serverRev === R + 2 && b9.rev === b9.syncedRev && backend.rev(KEY) === R + 2,
      { b9: { team: teamOf(b9), gold: b9.gold, serverRev: b9.serverRev } });

    // ── 10. B 放回被放棄的資料：再次出現比較，雲端不被直接覆蓋；再選一次雲端 ──
    await clickNotice(B, "conflict-backup-restore");
    await clickNotice(B, "conflict-backup-confirm");
    await waitNotice(B, "save-conflict", 20000);
    const b10 = await sessionOf(B);
    const bSave10 = logOf("B", "save_profile").slice(-1)[0];
    await openCompare(B);
    await confirmChoice(B, "server");
    await B.locator('[data-testid="save-conflict-confirm-yes"]').click();
    await waitNotice(B, "conflict-backup", 20000);
    run.check("C-10 B 放回被放棄的資料（關羽 Lv3、點數 700，版本 R+1）：當成尚未保存的修改，保存帶 R+1 被拒 → 再次出現比較，雲端沒有被覆蓋；再選雲端後回到版本 R+2",
      b10.gold === 700 && b10.serverRev === R + 1 && bSave10?.base_rev === R + 1 && bSave10?.status === 409 && backend.rev(KEY) === R + 2 && (await sessionOf(B)).serverRev === R + 2,
      { b10: { gold: b10.gold, serverRev: b10.serverRev }, bSave10 });

    // ── 11. 重新整理：A 改隊伍後 B 先保存，A 的衝突在重新整理後重新偵測，本機修改保留 ──
    await page.goto(SHENMA + "/team");
    await loadedAt(page);
    await settled(page);
    await B.goto(SHENMA + "/team");
    await loadedAt(B);
    await settled(B);
    await toggleTeamHero(B, "黃忠");
    await saveTeam(B);
    await B.goto(SHENMA + "/settings");
    await waitUntil(() => backend.rev(KEY) === R + 3, 30000, "B 的保存（R+3）");
    await settled(page);
    await toggleTeamHero(page, "周瑜");
    await saveTeam(page);
    await page.goto(SHENMA + "/settings");
    await waitNotice(page, "save-conflict");
    await page.reload();
    await loadedAt(page);
    await waitNotice(page, "save-conflict", 30000);
    const a11 = await sessionOf(page);
    const aSaves11 = logOf("A", "save_profile").filter((e) => e.base_rev === R + 2);
    run.check("C-11 重新整理：衝突只在記憶體，重新整理後補送（仍帶 R+2）再次被拒 → 衝突提示重新出現；A 的隊伍修改（加周瑜）仍在本機；雲端是 B 的版本 R+3",
      aSaves11.length === 2 && aSaves11.every((e) => e.status === 409) && /zhou_yu/.test(teamOf(a11)) && a11.rev !== a11.syncedRev && backend.rev(KEY) === R + 3 && !/zhou_yu/.test(teamOf(backend.profile(KEY))),
      { aSaves11, a11: teamOf(a11) });

    // ── 12. 寫入限制中不能處理衝突（兩個選項都停用，不送出任何請求）──
    await page.evaluate(() => {
      window.__siteIsolation = { ...(window.__siteIsolation || {}), lostCopy: true };
    });
    const reqA12 = logOf("A").length;
    await openCompare(page);
    const blockedText = await page.locator('[data-testid="save-conflict-blocked"]').innerText().catch(() => "");
    const disabled12 = [await page.locator('[data-testid="save-conflict-server"]').isDisabled(), await page.locator('[data-testid="save-conflict-local"]').isDisabled()];
    await H.shot(page, "save-conflict-migration-hold");
    await page.locator('button[aria-label="關閉"]').click();
    run.check("C-12 寫入限制（遷移狀態不明）時：比較視窗說明不能選擇，「使用雲端」「保留這個分頁」都停用，沒有送出任何請求；雲端不變",
      /暫停保存/.test(blockedText) && disabled12.every(Boolean) && logOf("A").length === reqA12 && backend.rev(KEY) === R + 3,
      { blockedText, disabled12 });

    // ── 13. 地圖編輯器的管理密碼：遮蔽輸入、取消不送出、錯誤清除、只存在頁面記憶體 ──
    const consoleA = [];
    const onConsole = (m) => consoleA.push(m.text());
    page.on("console", onConsole);
    // 實際素材、一般點擊（頁面說明在地圖編輯器預設收合）；水合完成前的點擊會遺失，重試到子分頁出現
    await page.goto(H.BASE + "/mapEditor");
    await waitUntil(async () => {
      await page.getByRole("button", { name: "⚔️ 物件" }).click();
      await H.sleep(500);
      return page.getByRole("button", { name: "🦸 武將設定" }).isVisible();
    }, 30000, "物件分頁");
    await page.getByRole("button", { name: "🦸 武將設定" }).click();
    await H.sleep(300);
    // 物件頁同時有敵人、武將兩組按鈕，只有目前的子分頁看得到
    const visibleBtn = (text) => page.locator("button:visible", { hasText: text }).first();
    await visibleBtn("📥 從 Sheet 載入").click();
    await page.waitForFunction(() => /✓ 已載入 \d+ 筆/.test(document.body.innerText), null, { timeout: 30000 });
    await waitUntil(async () => !(await visibleBtn("💾 儲存至 Sheet").isDisabled()), 10000, "儲存按鈕可按");
    const adminLog = () => logOf("A", "save_heroes_config");
    const save = () => visibleBtn("💾 儲存至 Sheet").click();
    await save();
    await waitNotice(page, "admin-token-input", 10000);
    const inputType = await page.locator('[data-testid="admin-token-input"]').getAttribute("type");
    await H.sleep(500); // 等輸入框淡入完成再截圖
    await H.shot(page, "admin-token-prompt");
    await page.locator('[data-testid="admin-token-cancel"]').click();
    await page.waitForSelector("text=沒有輸入管理密碼，沒有送出", { timeout: 10000 });
    const afterCancel = adminLog().length;
    await save();
    await page.locator('[data-testid="admin-token-input"]').fill("wrong-token");
    await page.locator('[data-testid="admin-token-submit"]').click();
    await page.waitForSelector("text=管理密碼不正確", { timeout: 10000 });
    await save();
    await waitNotice(page, "admin-token-input", 10000); // 錯誤後重新詢問
    await page.locator('[data-testid="admin-token-input"]').fill(ADMIN);
    await page.locator('[data-testid="admin-token-submit"]').click();
    await page.waitForSelector("text=/已儲存/", { timeout: 10000 });
    const stores = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }) + document.cookie + location.href);
    page.off("console", onConsole);
    const logs13 = adminLog();
    run.check("C-13 地圖編輯器：儲存設定時跳出遮蔽的密碼輸入框（type=password）；取消不送出；錯誤密碼被後端拒絕（403）後清除、下次重新詢問；正確密碼才寫入。密碼只在 POST 內容，不在網址、localStorage、sessionStorage、cookie 或主控台",
      inputType === "password" && afterCancel === 0 && logs13.length === 2 && logs13[0].status === 403 && logs13[1].status === 200 && logs13.every((e) => e.hasAdminToken) &&
        !stores.includes(ADMIN) && !stores.includes("wrong-token") && !consoleA.some((t) => t.includes(ADMIN)),
      { inputType, afterCancel, logs13 });

    // ── 14. 在設定頁預覽剛才下載的匯出檔（唯讀，不寫入）──
    const WRITE_ACTIONS = ["create_profile", "save_profile", "save_result", "upgrade_hero", "update_map_config", "create_map_config", "save_waves_config", "save_enemies_config", "save_heroes_config"];
    await page.goto(SHENMA + "/settings");
    await page.locator('[data-testid="backup-preview-open"]').waitFor({ timeout: 60000 });
    await H.sleep(2000);
    const writes14 = () => backend.log.filter((e) => WRITE_ACTIONS.includes(e.action)).length;
    const w14 = writes14();
    const sess14 = JSON.stringify(await sessionOf(page));
    await waitUntil(async () => {
      await page.locator('[data-testid="backup-preview-open"]').click();
      await H.sleep(300);
      return page.locator('[data-testid="backup-preview-modal"]').isVisible();
    }, 20000, "預覽視窗");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-testid="backup-preview-pick"]').click()]);
    await chooser.setFiles(exportPath);
    await page.locator('[data-testid="backup-preview-result"]').waitFor({ timeout: 10000 });
    await page.locator("#backup-preview-show-same").check();
    const preview = await page.locator('[data-testid="backup-preview-modal"]').innerText();
    const previewRows = await page.evaluate(() => [...document.querySelectorAll('[data-testid="backup-preview-table"] tbody tr')].map((tr) => ({ row: tr.getAttribute("data-row"), cells: [...tr.querySelectorAll("td")].map((td) => td.innerText) })));
    await H.shot(page, "save-conflict-export-preview");
    await page.locator('[data-testid="backup-preview-close"]').click();
    await H.sleep(1000);
    const team14 = previewRows.find((r) => r.row === "team");
    const gold14 = previewRows.find((r) => r.row === "gold");
    run.check("C-14 在設定頁用一般點擊選擇剛才下載的匯出檔：顯示匯出時間與兩份資料（這個分頁的隊伍有黃忠、雲端點數 700、版本 R+1），畫面沒有存檔金鑰；全程沒有寫入請求、這個分頁的 session 不變",
      /存檔衝突|保留了這個分頁/.test(preview) && /版本 1/.test(preview) && team14 && /黃忠/.test(team14.cells[1]) && gold14 && gold14.cells[2] === "700" &&
        preview.includes(`雲端是版本 ${R + 1}`) && !preview.includes(KEY) && writes14() === w14 && JSON.stringify(await sessionOf(page)) === sess14,
      { team14, gold14, writes: writes14() - w14 });

    const unexpectedB = bErrors.filter((e) => !KNOWN_B(e));
    run.check("B 分頁沒有非預期的 console error／pageerror", unexpectedB.length === 0, unexpectedB.slice(0, 5));
  } catch (e) {
    run.check("情境執行完成（沒有拋出例外）", false, String((e && e.stack) || e).slice(0, 600));
  } finally {
    if (B) await B.close().catch(() => {});
  }
  out.requests = backend.log.map((e) => ({ tag: e.tag, action: e.action, base_rev: e.base_rev, status: e.status, error: e.error }));
  return run.finish(out);
}
