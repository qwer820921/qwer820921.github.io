/**
 * 網站的跨來源隔離（COOP／COEP）只給需要的頁面，並把舊的全站隔離安全遷移掉
 *
 * 背景（基準文件 §19、§21）：
 * - 舊版在全站 layout 載入 coi-serviceworker，註冊在根目錄範圍，整個網站都是跨來源隔離。
 *   實際需要的只有 AI 去背（bgRemover，SharedArrayBuffer）；兩個 Godot 遊戲都是無執行緒版本。
 * - Chrome 的 sessionStorage 在隔離與非隔離的頁面各有一份（實測）：
 *   隔離 → 非隔離時看不到隔離那一份；非隔離 → 隔離時，非隔離那一份寫過（或移除過）的項目會套用過去。
 *   在兩種狀態之間切換，神馬三國會讀到舊存檔、送出過時的保存，或弄丟未同步的修改與待確認的升級。
 *
 * 規則：
 * - 只有 ROUTES（bgRemover）使用隔離：用同一支 coi-serviceworker.js 註冊在 /bgRemover 範圍。
 * - 其他頁面一律非隔離。發現自己在隔離狀態（舊的根目錄 SW，或從 bgRemover 用 SPA 過來）時：
 *   先在隔離狀態把 SESSION_KEYS 備份到 localStorage（以遷移編號區分），移除舊的根目錄 coi 註冊，
 *   再帶著遷移編號重新載入；非隔離的頁面只採用網址上那個編號的備份（其他分頁的備份不會被採用）。
 *   目前頁面是隔離狀態，代表最後一次切換是「進入隔離」，非隔離那一份的內容已經套用進來，
 *   所以隔離那一份一定比較新：備份取代非隔離那一份，被取代的舊值留在復原區（replaced）。
 * - 非隔離頁在還有舊的根目錄 SW、而且這個分頁的非隔離那一份沒有被新程式確認過時（強制重新整理
 *   剛好是新程式的第一次載入）：隔離那一份可能比較新，但從這裡讀不到。
 *   - 非隔離那一份沒有資料：先回到隔離狀態（舊 SW 仍會加上標頭；沒有資料可套用，不會蓋掉隔離那一份）備份，再照上面遷移。
 *   - 非隔離那一份有資料：回到隔離會先把它蓋過去，所以不回去；移除舊 SW，把這份資料移到復原區（unverified），
 *     不讓神馬三國自動讀取或保存，由遊戲提示玩家決定。
 * - 這個分頁的非隔離那一份由新程式確認後，分頁紀錄（TAB）標成已確認。之後的載入直接信任，不再判斷。
 * - 查不到有沒有舊註冊（查詢失敗或逾時，重試後仍然如此），而且這個分頁還沒確認、也沒有採用備份時：
 *   不能當作沒有舊註冊。停在 uncertain：不信任 session、不寫確認標記，頁面不讀取也不保存，
 *   由遊戲提示玩家重試（在原頁面重新查詢，不重新載入），或改用雲端存檔繼續
 *   （這時 session 的資料移到復原區，並標成遷移狀態不明）。
 *   分頁紀錄同時標上 uncertain：如果之後仍被舊 SW 帶回隔離狀態（例如玩家自己重新整理），
 *   非隔離那一份會先套用過去，隔離那一份不再可信；離開隔離時備份標成可疑，只放進復原區、不自動採用。
 * - 採用備份時，寫回 session 或保存被取代的舊值失敗：不刪除備份，把編號記在分頁紀錄（pendingClaim），
 *   下一次載入再採用；在那之前頁面不讀取也不保存（problem = restore-failed）。
 * - 讀不回隔離那一份（資料移到復原區）的分頁標成「遷移狀態不明」（lost）：隔離那一份可能有稍晚才在
 *   伺服器完成的操作（例如升級），遊戲之後要用不會蓋掉伺服器進度的方式保存。這個標記在分頁存在期間都保留。
 * - 不會無限重新載入：每一種重新載入都帶標記，帶著標記回來仍未達成就停止
 *   （離開隔離失敗：照舊在隔離狀態使用，本分頁不再嘗試；進入隔離失敗：bgRemover 以非隔離執行）。
 * - 只移除經辨識的舊註冊（根目錄範圍、腳本是 coi-serviceworker.js），不動其他 Service Worker、快取或儲存。
 * - 網址上的標記只有隨機編號，不含存檔內容或金鑰；處理後從網址移除（遷移編號在記進分頁紀錄後才移除）。
 *
 * 這個函式以行內 <script> 在每一頁最早執行（layout.tsx 用 toString 放進 HTML），
 * 所以不能引用任何外部變數或 import；SPA 換頁時由 SiteIsolationGuard 呼叫 check()。
 */
export function siteIsolationBoot(w: Window) {
  if (w.__siteIsolation) return;
  const ROUTES = ["/bgRemover"];
  const COI_SCRIPT = "/coi-serviceworker.js";
  // 需要跨遷移保留的 sessionStorage 項目（目前只有神馬三國的玩家存檔）
  const SESSION_KEYS = ["shenma_player_state"];
  const P_MIG = "__iso_mig"; // 離開隔離：備份的遷移編號
  const P_HOP = "__iso_hop"; // 先回到隔離狀態備份
  const P_ENTER = "__iso_enter"; // 進入隔離（bgRemover）
  const REC = "__site_iso_mig:"; // localStorage：隔離那一份的備份（每次遷移一筆）
  const RECOVERY = "__site_iso_recovery"; // localStorage：被取代或無法確認的舊暫存
  const RETIRED = "__site_iso_retired"; // localStorage：這個瀏覽器移除過舊的根目錄註冊（時間）
  const TAB = "__site_iso_tab"; // 非隔離的 sessionStorage：這個分頁的紀錄（識別、是否已確認、遷移狀態）
  const FAILED = "__site_iso_leave_failed"; // 隔離的 sessionStorage：這個分頁離開隔離失敗過
  const REC_TTL = 7 * 24 * 3600 * 1000; // 沒被採用的備份（例如寫回失敗、等下一次載入）保留 7 天
  const RECOVERY_TTL = 7 * 24 * 3600 * 1000;
  const RECOVERY_MAX = 20;
  const REG_TIMEOUT = 3000;
  const REG_RETRY_DELAYS = [1000, 2000]; // 查詢舊註冊失敗或逾時後，再試的間隔
  const ENTER_TIMEOUT = 10000;

  type Entry = {
    v: 1;
    id: string;
    at: number;
    tab: string;
    reason: "replaced" | "unverified";
    key: string;
    value: string;
  };
  type Phase = SiteIsolationPhase;

  const now = () => Date.now();
  const rid = () =>
    now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  let ls: Storage | null = null;
  let ss: Storage | null = null;
  try {
    ls = w.localStorage;
  } catch {
    ls = null;
  }
  try {
    ss = w.sessionStorage;
  } catch {
    ss = null;
  }
  const get = (s: Storage | null, k: string): string | null => {
    try {
      return s ? s.getItem(k) : null;
    } catch {
      return null;
    }
  };
  const put = (s: Storage | null, k: string, v: string): boolean => {
    try {
      if (!s) return false;
      s.setItem(k, v);
      return true;
    } catch {
      return false;
    }
  };
  const del = (s: Storage | null, k: string) => {
    try {
      if (s) s.removeItem(k);
    } catch {
      // 忽略
    }
  };
  const parse = (raw: string | null): unknown => {
    try {
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };

  const loc = w.location;
  const origin = loc.origin;
  const iso = w.crossOriginIsolated === true;
  const routeOf = (p: string) =>
    ROUTES.find(
      (r) => p === r || p === r + ".html" || p.indexOf(r + "/") === 0
    ) || null;
  const logs: string[] = [];
  const listeners: Array<() => void> = [];
  let phase: Phase = "checking";
  let problem: SiteIsolationProblem | null = null;
  const untrusted: string[] = [];
  const notify = () =>
    listeners.slice().forEach((f) => {
      try {
        f();
      } catch {
        // 忽略
      }
    });
  const setPhase = (p: Phase) => {
    phase = p;
    logs.push(p);
    notify();
  };
  const go = (param: string, value: string) => {
    const u = new URL(loc.href);
    u.searchParams.set(param, value);
    loc.replace(u.pathname + u.search + u.hash);
  };

  // ── 網址標記：處理後從網址移除 ──
  const start = new URL(loc.href);
  const mig = start.searchParams.get(P_MIG);
  const hop = start.searchParams.has(P_HOP);
  const entered = start.searchParams.has(P_ENTER);
  // keepMig：遷移編號還沒記進分頁紀錄時留在網址上，重新整理後仍找得到那一筆備份
  const stripMarkers = (keepMig: boolean) => {
    const u = new URL(loc.href);
    const had = [P_MIG, P_HOP, P_ENTER].some((p) => u.searchParams.has(p));
    if (!had) return;
    if (!keepMig) u.searchParams.delete(P_MIG);
    u.searchParams.delete(P_HOP);
    u.searchParams.delete(P_ENTER);
    try {
      w.history.replaceState(
        w.history.state,
        "",
        u.pathname + u.search + u.hash
      );
    } catch {
      // 忽略：標記留在網址上只會讓下一次載入再判斷一次，不影響資料
    }
  };

  // ── 分頁紀錄（非隔離的 sessionStorage）──
  // trusted：這個分頁的資料已由新程式確認；lost：讀不回隔離那一份（遷移狀態不明）；
  // pendingClaim：還沒成功採用的備份編號
  type TabRecord = {
    v: 1;
    id: string;
    trusted: boolean;
    lost?: boolean;
    pendingClaim?: string;
    uncertain?: boolean;
  };
  const tabRaw = parse(get(ss, TAB)) as Partial<TabRecord> | null;
  const tab: TabRecord =
    tabRaw && tabRaw.v === 1 && typeof tabRaw.id === "string"
      ? {
          v: 1,
          id: tabRaw.id,
          trusted: tabRaw.trusted !== false,
          lost: tabRaw.lost === true,
          pendingClaim:
            typeof tabRaw.pendingClaim === "string"
              ? tabRaw.pendingClaim
              : undefined,
          uncertain: tabRaw.uncertain === true,
        }
      : { v: 1, id: rid(), trusted: false };
  const tabId = tab.id;
  const saveTab = (patch: Partial<TabRecord>): boolean => {
    Object.assign(tab, patch);
    if (tab.pendingClaim === undefined) delete tab.pendingClaim;
    if (!tab.uncertain) delete tab.uncertain;
    if (!tab.lost) delete tab.lost;
    return put(ss, TAB, JSON.stringify(tab));
  };
  const trustTab = () => {
    if (untrusted.length === 0) saveTab({ trusted: true });
  };

  // ── 復原區（localStorage）：7 天後、或超過 20 筆時清除最舊的 ──
  const readRecovery = (): Entry[] => {
    const l = parse(get(ls, RECOVERY));
    return Array.isArray(l)
      ? (l as Entry[]).filter(
          (e) =>
            !!e &&
            e.v === 1 &&
            typeof e.id === "string" &&
            typeof e.at === "number" &&
            now() - e.at <= RECOVERY_TTL &&
            typeof e.value === "string"
        )
      : [];
  };
  const writeRecovery = (l: Entry[]): boolean => {
    if (l.length === 0) {
      del(ls, RECOVERY);
      return true;
    }
    return put(ls, RECOVERY, JSON.stringify(l.slice(-RECOVERY_MAX)));
  };
  const addRecovery = (
    reason: Entry["reason"],
    key: string,
    value: string
  ): boolean => {
    const l = readRecovery();
    l.push({ v: 1, id: rid(), at: now(), tab: tabId, reason, key, value });
    return writeRecovery(l);
  };
  const purge = () => {
    if (!ls) return;
    try {
      for (let i = ls.length - 1; i >= 0; i--) {
        const k = ls.key(i);
        if (!k || k.indexOf(REC) !== 0) continue;
        const r = parse(get(ls, k)) as { at?: unknown } | null;
        if (!r || typeof r.at !== "number" || now() - r.at > REC_TTL)
          del(ls, k);
      }
    } catch {
      // 忽略
    }
    const l = readRecovery();
    const raw = parse(get(ls, RECOVERY));
    if (!Array.isArray(raw) || raw.length !== l.length) writeRecovery(l);
  };
  // 無法確認新舊：移到復原區、不讓頁面自動讀取；存不進去時留在原處，但標記成不可信（不寫確認標記）。
  // 這表示讀不回隔離那一份，分頁標成遷移狀態不明
  const quarantine = (k: string, value: string) => {
    if (addRecovery("unverified", k, value)) del(ss, k);
    else {
      untrusted.push(k);
      if (problem === null) problem = "storage-failed";
    }
    saveTab({ lost: true });
  };

  // ── Service Worker ──
  const sw: ServiceWorkerContainer | null =
    (w.navigator && w.navigator.serviceWorker) || null;
  const settleWithin = <T>(p: Promise<T>, ms: number, fallback: T) =>
    new Promise<T>((resolve) => {
      const t = setTimeout(() => resolve(fallback), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        () => {
          clearTimeout(t);
          resolve(fallback);
        }
      );
    });
  const isLegacy = (r: ServiceWorkerRegistration) =>
    r.scope === origin + "/" &&
    [r.active, r.waiting, r.installing].some(
      (x) => !!x && x.scriptURL === origin + COI_SCRIPT
    );
  // 舊的根目錄 coi 註冊；查詢失敗或逾時就再試（REG_RETRY_DELAYS），仍然如此時回傳 null（不確定）。
  // 瀏覽器不支援 Service Worker 時確定沒有
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  const legacyRegs = (): Promise<ServiceWorkerRegistration[] | null> => {
    if (!sw) return Promise.resolve([]);
    const once = () => {
      let p: Promise<ServiceWorkerRegistration[] | null>;
      try {
        p = sw.getRegistrations().then((l) => l.filter(isLegacy));
      } catch {
        p = Promise.resolve(null);
      }
      return settleWithin(p, REG_TIMEOUT, null);
    };
    const attempt = (i: number): Promise<ServiceWorkerRegistration[] | null> =>
      once().then((found) =>
        found !== null || i >= REG_RETRY_DELAYS.length
          ? found
          : wait(REG_RETRY_DELAYS[i]).then(() => attempt(i + 1))
      );
    return attempt(0);
  };
  const retire = (regs: ServiceWorkerRegistration[]) =>
    Promise.all(regs.map((r) => r.unregister())).then((oks) => {
      if (regs.length > 0) put(ls, RETIRED, String(now()));
      if (!oks.every(Boolean)) throw new Error("unregister");
    });

  // ── 離開隔離：備份 → 移除舊註冊 → 帶遷移編號重新載入 ──
  const leave = () => {
    // 這個分頁曾停在 uncertain（分頁紀錄隨非隔離那一份套用進來）：隔離那一份可能已被舊暫存蓋掉
    const suspect = tab.uncertain === true;
    // 無法離開：照舊在隔離狀態使用，這個分頁不再嘗試。隔離那一份可疑時也不能照舊使用：
    // 放進復原區（無法確認新舊），分頁標成遷移狀態不明
    const fail = () => {
      put(ss, FAILED, "1");
      if (suspect) {
        SESSION_KEYS.forEach((k) => {
          const v = get(ss, k);
          if (v !== null) quarantine(k, v);
        });
        if (untrusted.length === 0) saveTab({ uncertain: false });
      }
      setPhase("failed");
    };
    if (mig !== null || get(ss, FAILED) !== null) {
      // 帶著遷移編號回來仍是隔離（或這個分頁之前失敗過）：不再重試。
      // 隔離那一份仍在這裡，備份不再需要
      if (mig !== null) del(ls, REC + mig);
      fail();
      return;
    }
    setPhase("leaving");
    const id = rid();
    const entries: Record<string, string | null> = {};
    SESSION_KEYS.forEach((k) => {
      entries[k] = get(ss, k);
    });
    if (
      !put(
        ls,
        REC + id,
        JSON.stringify({ v: 1, id, at: now(), entries, suspect })
      )
    ) {
      // 備份失敗就不離開（離開後讀不到隔離那一份）
      fail();
      return;
    }
    legacyRegs()
      .then((regs) => retire(regs || []))
      .then(() => go(P_MIG, id))
      .catch(() => {
        del(ls, REC + id);
        fail();
      });
  };

  // ── 進入隔離（bgRemover）：註冊範圍 SW → 啟用後帶標記重新載入 ──
  const enter = (route: string) => {
    if (!sw || !w.isSecureContext || entered) {
      setPhase("unavailable");
      return;
    }
    setPhase("entering");
    const ready = sw.register(COI_SCRIPT, { scope: route }).then(
      (reg) =>
        new Promise<boolean>((resolve) => {
          const x = reg.installing || reg.waiting || reg.active;
          if (!x) return resolve(false);
          if (x.state === "activated") return resolve(true);
          x.addEventListener("statechange", () => {
            if (x.state === "activated") resolve(true);
            else if (x.state === "redundant") resolve(false);
          });
        })
    );
    settleWithin(ready, ENTER_TIMEOUT, false).then((ok) => {
      if (ok) go(P_ENTER, "1");
      else setPhase("unavailable");
    });
  };

  const settled = () =>
    phase === "ready" ||
    phase === "failed" ||
    phase === "unavailable" ||
    phase === "uncertain";
  function check(pathname: string) {
    if (!settled()) return; // 確認中或即將換頁：結束後會用當時的路徑再檢查一次
    const route = routeOf(pathname);
    if (iso && !route) {
      if (phase !== "failed") leave();
    } else if (!iso && route) {
      if (phase !== "unavailable") enter(route);
    }
  }

  // ── 非隔離頁：採用遷移備份、處理舊註冊與無法確認的舊暫存 ──
  // ok：已寫回 session 並刪除備份；missing：沒有這筆（或格式不對）；
  // failed：寫回 session 或保存被取代的舊值失敗，備份保留、這些項目不可信
  const claim = (id: string): "ok" | "missing" | "failed" => {
    const r = parse(get(ls, REC + id)) as {
      v?: number;
      entries?: Record<string, unknown>;
      suspect?: boolean;
    } | null;
    if (!r || r.v !== 1 || !r.entries || typeof r.entries !== "object") {
      del(ls, REC + id);
      return "missing";
    }
    const entries = r.entries;
    if (r.suspect === true) {
      // 可疑的備份：不採用，連同非隔離那一份都放進復原區（無法確認新舊），分頁標成遷移狀態不明
      SESSION_KEYS.forEach((k) => {
        const primary =
          typeof entries[k] === "string" ? (entries[k] as string) : null;
        const cur = get(ss, k);
        if (primary !== null && primary !== cur) {
          if (!addRecovery("unverified", k, primary)) untrusted.push(k);
        }
        if (cur !== null) quarantine(k, cur);
      });
      saveTab({ lost: true });
      if (untrusted.length > 0) {
        if (problem === null) problem = "storage-failed";
        return "failed";
      }
      del(ls, REC + id);
      return "ok";
    }
    let failed = false;
    SESSION_KEYS.forEach((k) => {
      const primary =
        typeof entries[k] === "string" ? (entries[k] as string) : null;
      const cur = get(ss, k);
      if (primary !== null) {
        if (cur === primary) return;
        // 被取代的舊值先存進復原區；存不進去就不覆蓋（不抹除原本的內容），等下一次載入
        const kept = cur === null || addRecovery("replaced", k, cur);
        if (!kept || !put(ss, k, primary) || get(ss, k) !== primary) {
          failed = true;
          untrusted.push(k);
        }
      } else if (cur !== null) {
        // 隔離那一份沒有、非隔離那一份卻有：來源不明，不自動採用
        quarantine(k, cur);
      }
    });
    if (failed) return "failed";
    del(ls, REC + id);
    return "ok";
  };
  // fromUrl：頁面載入時（採用網址上的遷移編號）；false：在原頁面重試（只採用分頁紀錄裡的編號）
  const bootNonIsolated = (fromUrl: boolean) => {
    const hadTab = tab.trusted;
    // 這一次要採用的備份：網址上的編號，或上一次寫回失敗、記在分頁紀錄裡的編號
    const claimId = fromUrl && mig !== null ? mig : tab.pendingClaim || null;
    const claimed = claimId !== null ? claim(claimId) : "missing";
    let keepMig = false;
    if (claimed === "failed") {
      if (problem === null) problem = "restore-failed";
      // 記進分頁紀錄後才移除網址上的編號；記不進去就留在網址上，重新整理後仍找得到
      keepMig = !saveTab({ pendingClaim: claimId as string });
    } else if (tab.pendingClaim !== undefined) {
      saveTab({ pendingClaim: undefined });
    }
    if (fromUrl) stripMarkers(keepMig);
    legacyRegs()
      .then((found) => {
        const present = SESSION_KEYS.filter((k) => get(ss, k) !== null);
        if (found === null && !hadTab && claimed !== "ok") {
          // 不確定有沒有舊註冊，這個分頁的資料也還沒確認：不能當作沒有，不信任也不寫出。
          // 分頁紀錄標上 uncertain（不是確認標記），之後被帶回隔離狀態時據此不信任隔離那一份
          if (problem === null) problem = "lookup-failed";
          saveTab({ uncertain: true });
          setPhase("uncertain");
          return;
        }
        const legacy = found || [];
        if (
          legacy.length > 0 &&
          claimed !== "ok" &&
          !hadTab &&
          !hop &&
          present.length === 0
        ) {
          // 隔離那一份可能比較新：回到隔離狀態（舊 SW 會加上標頭）在那裡備份
          setPhase("leaving");
          go(P_HOP, "1");
          return;
        }
        return retire(legacy)
          .catch(() => {
            // 移除失敗：下一次載入會回到隔離狀態，再從那裡遷移
          })
          .then(() => {
            if (
              claimed === "missing" &&
              !hadTab &&
              present.length > 0 &&
              (legacy.length > 0 || get(ls, RETIRED) !== null)
            ) {
              // 這個分頁在舊網站時期留下的非隔離暫存；隔離那一份可能比較新但讀不到
              present.forEach((k) => quarantine(k, get(ss, k) as string));
            }
            trustTab();
            if (tab.uncertain && untrusted.length === 0)
              saveTab({ uncertain: false });
            setPhase("ready");
            check(loc.pathname);
          });
      })
      .catch(() => {
        // 不應發生（每一步都已處理失敗）；不確定時不信任
        if (problem === null) problem = "lookup-failed";
        setPhase("uncertain");
      });
  };
  // 查不到舊註冊時，玩家選擇改用雲端存檔繼續：session 的資料移到復原區，分頁標成遷移狀態不明
  const continueWithCloud = () => {
    if (phase !== "uncertain" || problem !== "lookup-failed") return;
    SESSION_KEYS.forEach((k) => {
      const v = get(ss, k);
      if (v !== null) quarantine(k, v);
    });
    saveTab({ lost: true, uncertain: false });
    problem = null;
    trustTab();
    setPhase("ready");
    check(loc.pathname);
  };
  // 重試：在原頁面重新查詢舊註冊、重新採用分頁紀錄裡的備份。不重新載入：
  // 還有舊的根目錄 SW 時，重新載入會回到隔離狀態，讓非隔離那一份的舊暫存先蓋過去
  const retry = () => {
    if (iso || (phase !== "uncertain" && problem === null)) return;
    problem = null;
    untrusted.length = 0;
    setPhase("checking");
    bootNonIsolated(false);
  };

  const api: SiteIsolationApi = {
    version: 1,
    get phase() {
      return phase;
    },
    tabId,
    untrusted,
    log: logs,
    check,
    get problem() {
      return problem;
    },
    get lostCopy() {
      return tab.lost === true;
    },
    usable: (pathname: string) =>
      settled() &&
      phase !== "uncertain" &&
      !(iso && phase !== "failed" && !routeOf(pathname)),
    retry,
    continueWithCloud,
    subscribe: (fn: () => void) => {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
    recovery: {
      list: () => readRecovery(),
      remove: (ids: string[]) => {
        writeRecovery(readRecovery().filter((e) => ids.indexOf(e.id) < 0));
        notify();
      },
    },
  };
  w.__siteIsolation = api;

  purge();
  if (iso) {
    stripMarkers(false);
    const route = routeOf(loc.pathname);
    if (route) {
      // 和 coi-serviceworker 自己的頁面腳本相同：告訴 SW 這個瀏覽器要用哪一種 COEP
      try {
        if (sw && sw.controller) {
          const g = w as unknown as { chrome?: unknown; netscape?: unknown };
          sw.controller.postMessage({
            type: "coepCredentialless",
            value: !(g.chrome || g.netscape),
          });
        }
      } catch {
        // 忽略
      }
      setPhase("ready");
    } else {
      leave();
    }
  } else {
    bootNonIsolated(true);
  }
}

export type SiteIsolationPhase =
  | "checking" // 非隔離頁：確認有沒有舊的根目錄 coi 註冊
  | "ready" // 可以使用 sessionStorage 的資料
  | "leaving" // 正在離開隔離狀態（備份後重新載入），頁面即將換掉
  | "entering" // 正在進入隔離狀態（bgRemover），頁面即將換掉
  | "failed" // 無法離開隔離狀態：照舊在隔離狀態使用，本分頁不再嘗試
  | "unavailable" // 需要隔離的頁面無法啟用隔離，以非隔離執行
  | "uncertain"; // 查不到有沒有舊註冊，這個分頁的資料也還沒確認：不讀取、不保存，等玩家重試或改用雲端

/**
 * 頁面不能使用 session 資料的原因（沒有時是 null）
 * - lookup-failed：查不到有沒有舊註冊（phase 是 uncertain）
 * - restore-failed：備份寫不回 session（備份保留，下一次載入再採用）
 * - storage-failed：無法確認新舊的暫存存不進復原區（留在 session，但不可讀取）
 */
export type SiteIsolationProblem =
  | "lookup-failed"
  | "restore-failed"
  | "storage-failed";

export interface SiteIsolationRecoveryEntry {
  v: 1;
  id: string;
  at: number;
  /** 建立時的分頁識別（只給同一個分頁使用） */
  tab: string;
  /** replaced：被較新的備份取代（依規則不再使用）；unverified：無法確認新舊，等玩家決定 */
  reason: "replaced" | "unverified";
  /** 原本的 sessionStorage 項目名稱 */
  key: string;
  value: string;
}

export interface SiteIsolationApi {
  version: 1;
  readonly phase: SiteIsolationPhase;
  /** 這個分頁的識別（非隔離的 sessionStorage） */
  tabId: string;
  /** 無法移到復原區、又不能信任的項目：頁面不應讀取 */
  untrusted: string[];
  /** 頁面不能使用 session 資料的原因 */
  readonly problem: SiteIsolationProblem | null;
  /** 這個分頁讀不回隔離那一份（遷移狀態不明）：保存時不能蓋掉伺服器上較新的進度。分頁存在期間都保留 */
  readonly lostCopy: boolean;
  /** 狀態變化紀錄（不含任何存檔內容或金鑰），供測試與除錯 */
  log: string[];
  /** SPA 換頁後呼叫：依路徑決定要不要進入或離開隔離 */
  check: (pathname: string) => void;
  /** 目前能不能在這個路徑使用 sessionStorage 的資料（遷移完成、而且不需要換頁） */
  usable: (pathname: string) => boolean;
  /** 重試：在原頁面重新查詢舊註冊、重新採用分頁紀錄裡的備份（不重新載入） */
  retry: () => void;
  /** 查不到舊註冊時改用雲端存檔繼續：session 的資料移到復原區，分頁標成遷移狀態不明 */
  continueWithCloud: () => void;
  /** 狀態或復原區變化時通知 */
  subscribe: (fn: () => void) => () => void;
  recovery: {
    list: () => SiteIsolationRecoveryEntry[];
    /** 移除指定的項目並通知訂閱者 */
    remove: (ids: string[]) => void;
  };
}

declare global {
  interface Window {
    __siteIsolation?: SiteIsolationApi;
  }
}
