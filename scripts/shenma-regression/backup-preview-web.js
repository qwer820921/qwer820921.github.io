async (page) => {
  // 離線備份檔預覽（設定頁 →「預覽備份檔」，唯讀）：
  // - 選檔一律用一般點擊開啟檔案選擇器（filechooser），檔案內容由測試產生（虛構資料，不含存檔金鑰），
  //   先透過頁面下載存到證據目錄的 backup-preview-files/ 再選取（MCP 環境沒有 Buffer 等 Node 全域物件）
  // - 目前格式（版本 1）與舊匯出（沒有格式標記）的預覽與比較、切換檔案、取消選檔、關閉再開
  // - 畸形 JSON、較新的版本、過大的檔案、副檔名是 .json 但內容不是 JSON、惡意 HTML 只當文字顯示
  // - 窄螢幕（390）沒有橫向捲動；全程沒有任何寫入請求，session／localStorage 不變
  // 真實匯出檔的預覽在 save-conflict-web.js（衝突時下載的檔案直接拿來預覽）
  const S = page.context().__shenma;
  if (!S) return { error: "請先執行 harness.js" };
  const { H } = S;
  const run = H.begin();
  const out = {};
  const SETTINGS = H.BASE + "/shenmaSanguo/settings";
  const KEY = "test_backup_preview";
  const WRITES = ["create_profile", "save_profile", "save_result", "upgrade_hero", "update_map_config", "create_map_config", "save_waves_config", "save_enemies_config", "save_heroes_config"];

  // ── 測試用的備份檔（虛構資料）──
  const tab = {
    nickname: "預覽玩家", level: 2, exp: 30, gold: 1000, capacity: 40, max_stage: "chapter1_5",
    heroes: [{ hero_id: "guan_yu", level: 2, star: 0, atk: 160, def: 128, hp: 1600 }],
    team: [{ hero_id: "guan_yu", slot: 1 }, { hero_id: "zhao_yun", slot: 2 }, { hero_id: "huang_zhong", slot: 3 }],
  };
  const cloud = { ...tab, gold: 700, heroes: [], team: [{ hero_id: "guan_yu", slot: 1 }] };
  const EXPORTED = "2026-09-29T08:00:00.000Z";
  const v1 = { format: "shenma-save-backup", version: 1, note: "測試用", exported_at: EXPORTED, reason: "conflict", this_tab: tab, this_tab_base_rev: 5, cloud, cloud_rev: 6 };
  const legacy = { note: "測試用（舊匯出）", exported_at: "2026-09-28T01:02:03.000Z", reason: "kept_this_tab", this_tab: { ...tab, gold: 300 }, this_tab_base_rev: 2, cloud, cloud_rev: 3 };
  const XSS_NICK = '<img src=x onerror="window.__backupXss=1">';
  const XSS_HERO = "<script>window.__backupXss=2</script>";
  const evil = { ...v1, this_tab: { ...tab, nickname: XSS_NICK, heroes: [{ hero_id: XSS_HERO, level: 3, star: 0, atk: 1, def: 1, hp: 1 }] } };
  const FILE_DIR = `${H.EVIDENCE}/backup-preview-files`;
  // 內容是文字或位元組陣列；在頁面產生 Blob 下載，存成證據目錄下的檔案，回傳 { name, path }
  const saveFile = async (name, content) => {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.evaluate(({ name, content }) => {
        const body = typeof content === "string" ? content : new Uint8Array(content);
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([body]));
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }, { name, content }),
    ]);
    const path = `${FILE_DIR}/${name}`;
    await download.saveAs(path);
    return { name, path };
  };
  const text = (obj) => (typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
  const SOURCES = {
    v1: ["shenma-save-conflict-20260929-080000.json", text(v1)],
    legacy: ["shenma-save-backup-old.json", text(legacy)],
    evil: ["evil.json", text(evil)],
    broken: ["broken.json", '{"format":"shenma-save-backup","version":1,'],
    newer: ["newer.json", text({ ...v1, version: 99 })],
    big: ["big.json", text({ ...v1, note: "x".repeat(600 * 1024) })],
    png: ["picture-renamed.json", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]],
  };
  const files = {};

  // ── 輔助 ──
  const modal = () => page.locator('[data-testid="backup-preview-modal"]');
  const pick = async (file) => {
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-testid="backup-preview-pick"]').click()]);
    await chooser.setFiles(file ? [file.path] : []);
    await H.sleep(400);
  };
  const shown = () => page.evaluate(() => {
    const q = (id) => document.querySelector(`[data-testid="${id}"]`);
    const rows = [...document.querySelectorAll('[data-testid="backup-preview-table"] tbody tr')].map((tr) => ({
      row: tr.getAttribute("data-row"), differs: tr.getAttribute("data-differs") === "1", cells: [...tr.querySelectorAll("td")].map((td) => td.innerText),
    }));
    return {
      file: q("backup-preview-file")?.innerText ?? null,
      error: q("backup-preview-error")?.getAttribute("data-error") ?? null,
      errorText: q("backup-preview-error")?.innerText ?? null,
      result: !!q("backup-preview-result"),
      time: q("backup-preview-time")?.innerText ?? null,
      head: [...document.querySelectorAll('[data-testid="backup-preview-table"] thead th')].map((th) => th.innerText),
      text: q("backup-preview-modal")?.innerText ?? "",
      rows,
    };
  });
  const storage = () => page.evaluate(() => {
    const pick = (s) => Object.fromEntries(Object.keys(s).filter((k) => k !== "__shenma_mock_gas_log").sort().map((k) => [k, s.getItem(k)]));
    return JSON.stringify({ local: pick(localStorage), session: pick(sessionStorage) });
  });
  const writesOf = (log) => log.filter((e) => WRITES.includes(e.action));

  try {
    // ── 0. 有存檔的分頁（建檔在量測之前）；測試用的檔案先存好 ──
    await H.resetOrigin(page);
    await page.goto(SETTINGS);
    for (const [k, [name, content]] of Object.entries(SOURCES)) files[k] = await saveFile(name, content);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(SETTINGS);
    // 水合完成前的輸入不會進到畫面的狀態：重複填入，直到送出按鈕可以按
    const keyInput = page.locator('input[placeholder="例：eric_sanguo_2026"]');
    const submit = page.locator('form button[type="submit"]');
    for (let i = 0; i < 60 && !(await submit.isEnabled()); i++) {
      await keyInput.fill(KEY);
      await H.sleep(500);
    }
    await submit.click();
    await page.waitForSelector("text=新存檔建立成功", { timeout: 60000 });
    // 建檔成功後設定頁會回到主頁；再回到設定頁（這時分頁已有存檔）
    await page.waitForURL(/\/shenmaSanguo\/?$/, { timeout: 30000 });
    await page.goto(SETTINGS);
    await page.locator('[data-testid="backup-preview-open"]').waitFor({ timeout: 60000 });
    await H.sleep(2000);
    const store0 = await storage();
    const log0 = await H.gasLog(page);

    // ── 1. 開啟預覽（一般點擊）──
    await page.locator('[data-testid="backup-preview-open"]').click();
    await modal().waitFor({ timeout: 10000 });
    const intro = await modal().innerText();
    run.check("預覽-1 設定頁的「預覽備份檔」用一般點擊開啟；說明只在畫面上顯示、不會匯入或覆蓋，匯出檔不含存檔金鑰、無法確認帳號",
      /不會匯入、保存或覆蓋任何存檔/.test(intro) && /不含存檔金鑰/.test(intro), intro.slice(0, 200));

    // ── 2. 目前格式（版本 1）──
    await pick(files.v1);
    const s2 = await shown();
    const expectedTime = await page.evaluate((iso) => new Date(iso).toLocaleString(), EXPORTED);
    await page.locator("#backup-preview-show-heroes").check();
    const s2h = await shown();
    await H.shot(page, "backup-preview-v1-wide");
    const row = (s, id) => s.rows.find((r) => r.row === id);
    run.check("預覽-2 選擇目前格式的備份檔：顯示檔名、匯出時間、原因、格式版本 1 與匯出時的版本（分頁根據 5、雲端 6）；比較表標出點數 1000／700、隊伍不同；展開武將明細有關羽",
      s2.result && !s2.error && s2.file === files.v1.name && s2.time === expectedTime && /存檔衝突時從比較視窗匯出/.test(s2.text) && /版本 1/.test(s2.text) &&
        row(s2, "gold")?.differs && row(s2, "gold")?.cells[1] === "1000" && row(s2, "gold")?.cells[2] === "700" && row(s2, "team")?.differs &&
        /根據版本 5；雲端是版本 6/.test(s2.text) && /版本 6/.test(s2.head[2]) && s2h.rows.some((r) => r.row === "hero:guan_yu" && r.differs),
      s2);

    // ── 3. 切換成舊匯出；取消選檔保留目前的預覽 ──
    await pick(files.legacy);
    const s3 = await shown();
    await pick(null);
    const s3c = await shown();
    run.check("預覽-3 改選沒有格式標記的舊匯出：內容換成新檔案（點數 300、舊版匯出、保留了這個分頁的原因）；之後取消選檔，畫面維持這個檔案",
      s3.file === files.legacy.name && /舊版匯出/.test(s3.text) && /保留了這個分頁/.test(s3.text) && row(s3, "gold")?.cells[1] === "300" &&
        s3c.file === files.legacy.name && s3c.result,
      { s3: { file: s3.file, gold: row(s3, "gold") }, s3c: { file: s3c.file, result: s3c.result } });

    // ── 4. 惡意 HTML 只當文字 ──
    await pick(files.evil);
    await page.locator("#backup-preview-show-heroes").check();
    await page.locator("#backup-preview-show-same").check();
    const s4 = await shown();
    const dom4 = await page.evaluate(() => ({
      xss: window.__backupXss ?? null,
      imgs: document.querySelectorAll('[data-testid="backup-preview-modal"] img').length,
      scripts: document.querySelectorAll('[data-testid="backup-preview-modal"] script').length,
    }));
    run.check("預覽-4 暱稱與武將 id 是 HTML／script：原樣當成文字顯示，沒有產生 img 或 script 元素，也沒有執行",
      s4.result && s4.text.includes(XSS_NICK) && s4.text.includes(XSS_HERO) && dom4.xss === null && dom4.imgs === 0 && dom4.scripts === 0,
      { dom4, nick: row(s4, "nickname") });

    // ── 5. 讀不出來的檔案 ──
    const bad = {};
    for (const k of ["broken", "newer", "big", "png"]) {
      await pick(files[k]);
      const s = await shown();
      bad[k] = { error: s.error, result: s.result, file: s.file, text: (s.errorText || "").slice(0, 80) };
    }
    await H.shot(page, "backup-preview-error");
    run.check("預覽-5 壞掉的 JSON、較新的版本（99）、超過大小上限、副檔名是 .json 但內容是圖片：都顯示原因且清掉上一份預覽（檔名、MIME 不能代替內容檢查）",
      bad.broken.error === "INVALID_JSON" && bad.newer.error === "UNSUPPORTED_VERSION" && bad.big.error === "FILE_TOO_LARGE" && bad.png.error === "INVALID_JSON" &&
        Object.values(bad).every((b) => !b.result && b.text.length > 0),
      bad);

    // ── 6. 窄螢幕 ──
    await page.setViewportSize({ width: 390, height: 800 });
    await pick(files.v1);
    const narrow = await page.evaluate(() => {
      const panel = document.querySelector('[data-testid="backup-preview-modal"] [class*="modalPanel"]').getBoundingClientRect();
      const wrap = document.querySelector('[data-testid="backup-preview-table"]').parentElement;
      return { scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth, panelLeft: panel.left, panelRight: panel.right, tableScroll: wrap.scrollWidth - wrap.clientWidth };
    });
    await H.shot(page, "backup-preview-v1-narrow");
    const s6 = await shown();
    run.check("預覽-6 窄螢幕（390）：頁面與比較表都不需要橫向捲動，視窗在畫面內，比較表照常顯示",
      narrow.scrollW <= narrow.innerW + 1 && narrow.panelLeft >= 0 && narrow.panelRight <= narrow.innerW + 1 && narrow.tableScroll <= 1 && s6.result && row(s6, "gold")?.differs,
      narrow);

    // ── 7. 關閉再開：沒有留下上一份檔案 ──
    await page.locator('[data-testid="backup-preview-close"]').click();
    const closed = (await modal().count()) === 0;
    await page.locator('[data-testid="backup-preview-open"]').click();
    await modal().waitFor({ timeout: 10000 });
    const s7 = await shown();
    await page.locator('[data-testid="backup-preview-modal"] button[aria-label="關閉備份檔預覽"]').click();
    run.check("預覽-7 按「關閉」後視窗消失；重新開啟時沒有上一份檔案，右上角 × 也能關閉",
      closed && s7.file === null && !s7.result && (await modal().count()) === 0, { closed, s7: { file: s7.file, result: s7.result } });

    // ── 8. 全程零寫入 ──
    await H.sleep(1500);
    const store1 = await storage();
    const log1 = await H.gasLog(page);
    const newWrites = writesOf(log1.slice(log0.length));
    run.check("預覽-8 選檔、比較、取消、失敗、關閉全程：沒有任何寫入請求，localStorage 與 sessionStorage 完全不變",
      newWrites.length === 0 && store1 === store0, { newWrites, changed: store1 === store0 ? null : { before: store0.slice(0, 300), after: store1.slice(0, 300) } });
  } catch (e) {
    run.check("情境執行完成（沒有拋出例外）", false, String((e && e.stack) || e).slice(0, 600));
  }
  await page.setViewportSize({ width: 1280, height: 800 }).catch(() => {});
  return run.finish(out);
}
