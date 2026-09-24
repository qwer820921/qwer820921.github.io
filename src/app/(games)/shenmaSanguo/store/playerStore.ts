import { create } from "zustand";
import {
  PlayerState,
  SessionPlayerState,
  SyncStatus,
  TeamSlot,
  HeroConfig,
  BattleResultPayload,
  BattleResult,
} from "../types";
import {
  gameApi,
  setPlayerKey,
  SHENMA_SANGUO_GAS_URL as GAS_URL,
} from "../api/gameApi";
import { stageToNum, getNextStage } from "../utils/stageUtils";

// ── 常數 ──────────────────────────────────────────────────────
const PLAYER_SESSION_KEY = "shenma_player_state";
const DEBOUNCE_MS = 30_000; // 使用者修改後合併送出的等待時間
const RETRY_MS = 30_000; // 保存失敗後的重試間隔
const RESTORE_SYNC_DELAY_MS = 0; // 重新整理後恢復的未同步修改：立即補送

// ── 非同步防護（module 層級，跨 render 持久）────────────────────
// 本機版本：player.rev 每次本機修改 +1；player.syncedRev 是伺服器已確認的版本。
//   rev ≠ syncedRev 代表有未同步的修改。保存成功只確認「自己送出的版本」，
//   所以在途期間的新修改不會被舊回應標成已同步。
// 帳號世代：提交不同帳號（或從 session 恢復）時 +1，舊帳號的在途回應一律忽略。
// 讀取序號：每次 initFromGAS +1，只有最新一次讀取可以提交結果。
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _accountGen = 0;
let _busy = 0; // 目前帳號世代的在途伺服器寫入數（save_profile、戰鬥結算、升級）
let _loadSeq = 0;
type InFlight<T> = { gen: number; promise: Promise<T> };
let _loadInFlight: { key: string; promise: Promise<LoadResult> } | null = null;
let _saveInFlight: InFlight<boolean> | null = null;
let _battleInFlight: InFlight<void> | null = null;
let _upgradeInFlight: InFlight<unknown> | null = null;

export type LoadResult =
  | { ok: true; created: boolean; keptLocal?: boolean }
  | { ok: false; error: string; superseded?: boolean };

// ── 版本與資料 helpers ─────────────────────────────────────────
const revOf = (p: SessionPlayerState) => p.rev ?? 0;
const syncedRevOf = (p: SessionPlayerState) => p.syncedRev ?? 0;
const hasUnsyncedChanges = (p: SessionPlayerState) =>
  revOf(p) !== syncedRevOf(p);

function withStatus(p: SessionPlayerState): SessionPlayerState {
  const syncStatus =
    _busy > 0
      ? SyncStatus.Syncing
      : hasUnsyncedChanges(p)
        ? SyncStatus.Pending
        : SyncStatus.Idle;
  return { ...p, syncStatus };
}

/** 送到伺服器的資料：去掉只存在本機的欄位 */
function toServerData(p: SessionPlayerState): PlayerState {
  const data = { ...p } as Partial<SessionPlayerState>;
  delete data.key;
  delete data.syncStatus;
  delete data.rev;
  delete data.syncedRev;
  return data as PlayerState;
}

/** 確認 GAS 回傳的 data 有必要欄位 */
function validateData(data: unknown): data is PlayerState {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    typeof d.gold === "number" &&
    typeof d.nickname === "string" &&
    Array.isArray(d.heroes) &&
    (d.team === undefined || Array.isArray(d.team))
  );
}

function normalizeProfile(data: PlayerState): PlayerState {
  const clean = toServerData(data as SessionPlayerState);
  return { ...clean, team: clean.team || [], heroes: clean.heroes || [] };
}

/** 把例外轉成可辨識的錯誤代碼（UI 再依代碼顯示玩家看得懂的文字） */
function errorCode(e: unknown): string {
  if (e instanceof TypeError) return "NETWORK_ERROR";
  if (e instanceof SyntaxError) return "BAD_RESPONSE";
  if (e instanceof Error && e.message) return e.message;
  return "GAS_ERROR";
}

// ── sessionStorage helpers ─────────────────────────────────────
function readSession(expectedKey: string): SessionPlayerState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PLAYER_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SessionPlayerState;
    // key 不符（例如其他分頁切換了帳號）：不載入，也就不會把 A 的資料當成 B 寫出
    if (!parsed || parsed.key !== expectedKey || !validateData(parsed)) {
      return null;
    }
    let { rev, syncedRev } = parsed;
    if (typeof rev !== "number" || typeof syncedRev !== "number") {
      // 舊版 session 沒有版本號：Pending／Syncing 都代表可能有未送出的修改
      rev = parsed.syncStatus === SyncStatus.Idle ? 0 : 1;
      syncedRev = 0;
    }
    // Syncing 代表上次保存結果不確定：版本沒被確認（rev ≠ syncedRev）就維持未同步，之後重送
    return {
      ...parsed,
      team: parsed.team || [],
      heroes: parsed.heroes || [],
      rev,
      syncedRev,
    };
  } catch {
    return null;
  }
}

function writeSession(state: SessionPlayerState) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(PLAYER_SESSION_KEY, JSON.stringify(state));
}

function clearDebounce() {
  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
    _debounceTimer = null;
  }
}

const isCurrent = <T>(f: InFlight<T> | null): f is InFlight<T> =>
  !!f && f.gen === _accountGen;

/** 讀取存檔；只有 PROFILE_NOT_FOUND 才建檔，其他錯誤一律回報失敗 */
async function fetchProfile(
  key: string
): Promise<
  | { ok: true; data: PlayerState; created: boolean }
  | { ok: false; error: string }
> {
  try {
    const res = await gameApi.getProfile(key);
    if (!validateData(res.data)) {
      return { ok: false, error: "PROFILE_FORMAT_INVALID" };
    }
    return { ok: true, data: normalizeProfile(res.data), created: false };
  } catch (e: unknown) {
    const code = errorCode(e);
    if (code !== "PROFILE_NOT_FOUND") return { ok: false, error: code };
  }
  // 新玩家：建立存檔後重新讀取（不依賴 create_profile 的回傳格式）
  try {
    await gameApi.createProfile(key, "旅行者");
  } catch (e: unknown) {
    return { ok: false, error: errorCode(e) };
  }
  try {
    const res = await gameApi.getProfile(key);
    if (!validateData(res.data)) {
      return { ok: false, error: "PROFILE_FORMAT_INVALID" };
    }
    return { ok: true, data: normalizeProfile(res.data), created: true };
  } catch (e: unknown) {
    return { ok: false, error: errorCode(e) };
  }
}

// ── Store 型別 ─────────────────────────────────────────────────
interface PlayerStore {
  player: SessionPlayerState | null;
  /** 正在讀取玩家存檔（登入、重試、切換帳號、強制同步） */
  isLoading: boolean;
  loadingKey: string | null;
  /** 沒有玩家資料時的讀取錯誤代碼（有玩家資料時，錯誤只回傳給呼叫端） */
  error: string | null;
  /** 最近一次背景保存失敗的錯誤代碼（成功後清除；失敗會自動重試） */
  syncError: string | null;

  /** 從 sessionStorage 載入指定 key 的存檔；key 不符或沒有資料時回傳 false */
  loadFromSession: (key: string) => boolean;
  /**
   * 讀取並切換到指定 key 的存檔（找不到時建立新存檔）。登入、重試、切換帳號共用。
   * - 目前帳號有未同步修改時，先保存成功才讀取；保存失敗就不切換
   * - 成功後才一起寫入 key、玩家資料與 session；失敗時保留原本的資料
   * - 同時有多次讀取時，只有最後一次的結果會生效
   */
  initFromGAS: (key: string) => Promise<LoadResult>;
  /** 手動同步：先保存本機未同步的修改，成功後再讀取伺服器最新資料 */
  refreshProfile: () => Promise<LoadResult>;
  /** 背景靜默刷新（沒有未同步修改時才執行，回應時再檢查一次） */
  backgroundRefresh: (key: string) => Promise<void>;

  /** 暱稱變更 → 30s debounce 同步 */
  updateNickname: (nickname: string) => void;
  /** 隊伍變更 → 30s debounce 同步 */
  updateTeam: (team: TeamSlot[]) => void;
  /**
   * 武將升級
   * - 沒有未同步修改：呼叫 GAS upgrade_hero（伺服器計算）
   * - 有未同步修改：本地計算，重置 debounce timer
   * - 上一次伺服器升級還在處理時拒絕，避免重複扣款
   */
  upgradeHero: (
    heroId: string,
    heroConfig: HeroConfig
  ) => Promise<{ success: boolean; error?: string }>;
  /** 戰鬥結算：本地先更新，接著送出 save_result（只送一次）並保存 profile */
  applyBattleResult: (result: BattleResultPayload) => void;

  clearError: () => void;

  // 內部方法（以 _ 前綴標示，不應在 UI 直接呼叫）
  _scheduleSync: (delayMs?: number) => void;
  /** 立即保存目前的本機版本；成功回傳 true */
  _syncNow: () => Promise<boolean>;
}

// ── Zustand Store ──────────────────────────────────────────────
export const usePlayerStore = create<PlayerStore>((set, get) => {
  /** 寫入 store 與 session（同步狀態一律由版本與在途寫入推導） */
  const commit = (p: SessionPlayerState) => {
    const next = withStatus(p);
    writeSession(next);
    set({ player: next });
    return next;
  };
  const refreshStatus = () => {
    const p = get().player;
    if (p) commit(p);
  };
  const beginBusy = (gen: number) => {
    if (gen !== _accountGen) return;
    _busy += 1;
    refreshStatus();
  };
  const endBusy = (gen: number) => {
    if (gen !== _accountGen) return;
    _busy = Math.max(0, _busy - 1);
    refreshStatus();
  };
  /** 本機修改：版本 +1 */
  const edit = (patch: Partial<PlayerState>) => {
    const p = get().player;
    if (!p) return null;
    return commit({ ...p, ...patch, rev: revOf(p) + 1 });
  };
  /** 換成另一個帳號（或從 session 恢復）：舊帳號的計時器與在途工作全部失效 */
  const resetAccountState = () => {
    _accountGen += 1;
    _busy = 0;
    clearDebounce();
    set({ syncError: null });
  };
  /** 等目前帳號的在途寫入都結束 */
  const waitForWrites = async () => {
    for (;;) {
      const list = [_saveInFlight, _battleInFlight, _upgradeInFlight]
        .filter(isCurrent)
        .map((f) => f.promise);
      if (list.length === 0) return;
      await Promise.allSettled(list);
    }
  };
  /** 保存目前帳號所有未同步的修改；成功（或本來就沒有）回傳 true */
  const flushCurrent = async () => {
    for (let i = 0; i < 5; i++) {
      await waitForWrites();
      const p = get().player;
      if (!p || !hasUnsyncedChanges(p)) return true;
      if (!(await get()._syncNow())) return false;
    }
    const p = get().player;
    return !p || !hasUnsyncedChanges(p);
  };

  return {
    player: null,
    isLoading: false,
    loadingKey: null,
    error: null,
    syncError: null,

    // ── 初始化 ─────────────────────────────────────────────────

    loadFromSession: (key: string) => {
      const session = readSession(key);
      if (!session) return false;
      resetAccountState();
      commit(session);
      // 重新整理前還沒確認保存的修改：不等使用者再操作，直接補送（只重送 profile）
      if (hasUnsyncedChanges(session)) {
        get()._scheduleSync(RESTORE_SYNC_DELAY_MS);
      }
      return true;
    },

    initFromGAS: (rawKey: string) => {
      const key = rawKey.trim();
      // 同一個 key 的讀取已在進行：共用結果，避免連按造成重複建檔與請求風暴
      if (_loadInFlight && _loadInFlight.key === key) {
        return _loadInFlight.promise;
      }
      const seq = ++_loadSeq;
      const superseded = (): LoadResult => ({
        ok: false,
        error: "SUPERSEDED",
        superseded: true,
      });
      const fail = (error: string): LoadResult => {
        if (seq !== _loadSeq) return superseded();
        // 已有玩家資料（例如切換帳號失敗）時不蓋掉目前畫面，錯誤只回傳給呼叫端
        set({
          isLoading: false,
          loadingKey: null,
          error: get().player ? null : error,
        });
        return { ok: false, error };
      };

      const run = async (): Promise<LoadResult> => {
        set({ isLoading: true, loadingKey: key, error: null });
        // 1. 目前帳號的未同步修改要先保存成功（切換帳號、手動同步都適用）
        if (!(await flushCurrent())) return fail("UNSYNCED_SAVE_FAILED");
        if (seq !== _loadSeq) return superseded();
        const before = get().player;
        const baseRev = before && before.key === key ? revOf(before) : null;

        // 2. 讀取存檔（找不到才建立）
        const r = await fetchProfile(key);
        if (seq !== _loadSeq) return superseded();
        if (!r.ok) return fail(r.error);

        // 3. 讀取期間目前帳號又有新修改：再保存一次
        if (!(await flushCurrent())) return fail("UNSYNCED_SAVE_FAILED");
        if (seq !== _loadSeq) return superseded();
        const now = get().player;
        const sameAccount = !!now && now.key === key;
        if (sameAccount && baseRev !== null && revOf(now) !== baseRev) {
          // 同一帳號、讀取期間本機有更新的版本（剛才已保存）：伺服器回應已過時，保留本機資料
          set({ isLoading: false, loadingKey: null, error: null });
          return { ok: true, created: r.created, keptLocal: true };
        }

        // 4. 提交：key、玩家資料與 session 一起切換
        if (!sameAccount) resetAccountState();
        const base = sameAccount && now ? revOf(now) : 0;
        setPlayerKey(key);
        commit({
          ...r.data,
          key,
          syncStatus: SyncStatus.Idle,
          rev: base,
          syncedRev: base,
        });
        set({
          isLoading: false,
          loadingKey: null,
          error: null,
          syncError: null,
        });
        return { ok: true, created: r.created };
      };

      const promise = run().catch((e: unknown) => fail(errorCode(e)));
      _loadInFlight = { key, promise };
      void promise.finally(() => {
        if (_loadInFlight?.promise === promise) _loadInFlight = null;
      });
      return promise;
    },

    refreshProfile: async () => {
      const { player, initFromGAS } = get();
      if (!player) return { ok: false, error: "NOT_LOADED" };
      return initFromGAS(player.key);
    },

    backgroundRefresh: async (key: string) => {
      const player = get().player;
      // 有本機未同步修改或在途寫入時跳過，避免覆蓋
      if (
        !player ||
        player.key !== key ||
        hasUnsyncedChanges(player) ||
        _busy > 0
      ) {
        return;
      }
      const gen = _accountGen;
      const rev0 = revOf(player);
      try {
        const res = await gameApi.getProfile(key);
        if (!validateData(res.data)) return;
        const cur = get().player;
        // 回應時再檢查一次：帳號、本機版本、未同步修改與在途寫入都沒變才套用
        if (
          gen !== _accountGen ||
          !cur ||
          cur.key !== key ||
          revOf(cur) !== rev0 ||
          hasUnsyncedChanges(cur) ||
          _busy > 0
        ) {
          return;
        }
        commit({
          ...normalizeProfile(res.data),
          key,
          syncStatus: SyncStatus.Idle,
          rev: rev0,
          syncedRev: rev0,
        });
      } catch {
        // 背景刷新失敗靜默忽略
      }
    },

    // ── 玩家操作 ───────────────────────────────────────────────

    updateNickname: (nickname: string) => {
      if (edit({ nickname })) get()._scheduleSync();
    },

    updateTeam: (team: TeamSlot[]) => {
      if (edit({ team })) get()._scheduleSync();
    },

    upgradeHero: async (heroId: string, heroConfig: HeroConfig) => {
      const player = get().player;
      if (!player) return { success: false, error: "NOT_LOADED" };
      if (isCurrent(_upgradeInFlight)) {
        return { success: false, error: "UPGRADE_IN_PROGRESS" };
      }

      // 武將預設全部可用；heroes 陣列只記錄升級過的，找不到代表仍為初始值
      const heroIndex = player.heroes.findIndex((h) => h.hero_id === heroId);
      const currentHero =
        heroIndex !== -1
          ? player.heroes[heroIndex]
          : {
              hero_id: heroId,
              level: 1,
              star: 0,
              atk: heroConfig.base_atk,
              def: heroConfig.base_def,
              hp: heroConfig.base_hp,
            };

      const cost = heroConfig.upgrade_cost_base * currentHero.level;
      if (player.gold < cost)
        return { success: false, error: "GOLD_NOT_ENOUGH" };

      if (!hasUnsyncedChanges(player) && _busy === 0) {
        // ── 沒有未同步修改：呼叫 GAS（伺服器計算，防竄改）──────
        const gen = _accountGen;
        const key = player.key;
        const goldAtSend = player.gold;
        const promise = gameApi.upgradeHero(key, heroId);
        _upgradeInFlight = { gen, promise };
        beginBusy(gen);
        try {
          const res = await promise;
          const cur = get().player;
          if (gen !== _accountGen || !cur || cur.key !== key) {
            return { success: false, error: "ACCOUNT_CHANGED" };
          }
          // 套用到「目前」的資料，保留升級期間的其他修改；金幣只扣伺服器算出的差額
          const idx = cur.heroes.findIndex((h) => h.hero_id === heroId);
          const heroes =
            idx !== -1
              ? cur.heroes.map((h, i) => (i === idx ? res.hero : h))
              : [...cur.heroes, res.hero];
          edit({ heroes, gold: cur.gold + (res.gold_remaining - goldAtSend) });
          get()._scheduleSync();
          return { success: true };
        } catch (e: unknown) {
          return { success: false, error: errorCode(e) };
        } finally {
          if (_upgradeInFlight?.promise === promise) _upgradeInFlight = null;
          endBusy(gen);
        }
      }

      // ── 有未同步修改：本地計算，重置 timer ───────────────────
      const upgradedHero = {
        ...currentHero,
        level: currentHero.level + 1,
        atk: currentHero.atk + heroConfig.atk_growth,
        def: currentHero.def + heroConfig.def_growth,
        hp: currentHero.hp + heroConfig.hp_growth,
      };
      const updatedHeroes =
        heroIndex !== -1
          ? player.heroes.map((h, i) => (i === heroIndex ? upgradedHero : h))
          : [...player.heroes, upgradedHero];
      edit({ heroes: updatedHeroes, gold: player.gold - cost });
      get()._scheduleSync();
      return { success: true };
    },

    applyBattleResult: (result: BattleResultPayload) => {
      const player = get().player;
      if (!player) return;

      clearDebounce(); // 取消 pending debounce，結算後統一處理

      // 1. 本地立即計算 (Optimistic Update)
      const isWin = result.result === BattleResult.Win;
      const pointsReward = isWin
        ? result.loots
            .filter((l) => l.item === "battle_points" || l.item === "gold")
            .reduce((sum, l) => sum + l.count, 0)
        : 10; // 失敗低保

      // EXP：勝利 50 + 星數×20；失敗低保 10
      const expGain = isWin ? 50 + result.stars_earned * 20 : 10;
      const expAfter = player.exp + expGain;
      const expNeeded = (level: number) => level * 100;
      let newLevel = player.level;
      let newExp = expAfter;
      while (newExp >= expNeeded(newLevel)) {
        newExp -= expNeeded(newLevel);
        newLevel += 1;
      }

      const nextStage = getNextStage(result.stage_id);
      const shouldUpdateStage =
        isWin && stageToNum(nextStage) > stageToNum(player.max_stage);

      // 保留未同步的 heroes / team 變更
      edit({
        gold: player.gold + pointsReward,
        exp: newExp,
        level: newLevel,
        capacity: 10 + newLevel,
        max_stage: shouldUpdateStage ? nextStage : player.max_stage,
      });

      // 2. 背景同步：save_result 只送一次（失敗也不重播，避免重複發獎勵），
      //    接著以一般的 profile 保存送出最新快照；保存失敗會自動重試
      const gen = _accountGen;
      const key = player.key;
      const promise = (async () => {
        beginBusy(gen);
        try {
          await gameApi.saveResult(key, result);
        } catch (err) {
          console.warn("[Background Sync] 戰鬥結算紀錄送出失敗:", err);
        } finally {
          endBusy(gen);
        }
        if (gen === _accountGen) await get()._syncNow();
      })();
      _battleInFlight = { gen, promise };
      void promise.finally(() => {
        if (_battleInFlight?.promise === promise) _battleInFlight = null;
      });
    },

    // ── 內部：同步 ─────────────────────────────────────────────

    _scheduleSync: (delayMs: number = DEBOUNCE_MS) => {
      clearDebounce();
      const gen = _accountGen;
      _debounceTimer = setTimeout(() => {
        _debounceTimer = null;
        if (gen === _accountGen) void get()._syncNow();
      }, delayMs);
    },

    _syncNow: () => {
      const player = get().player;
      if (!player || !hasUnsyncedChanges(player)) return Promise.resolve(true);
      // 已有保存在途：等它結束（結束時若還有新修改會自動再排程）
      if (isCurrent(_saveInFlight)) return _saveInFlight.promise;

      clearDebounce();
      const gen = _accountGen;
      const key = player.key;
      const sentRev = revOf(player);
      const data = toServerData(player);
      const self: { promise?: Promise<boolean> } = {};
      const run = async () => {
        beginBusy(gen);
        let ok = false;
        let failure: string | null = null;
        try {
          await gameApi.saveProfile(key, data);
          ok = true;
        } catch (e: unknown) {
          failure = errorCode(e);
        }
        if (_saveInFlight?.promise === self.promise) _saveInFlight = null;
        endBusy(gen);
        if (gen !== _accountGen) return ok; // 帳號已切換：只影響舊帳號的伺服器資料

        const cur = get().player;
        if (!cur || cur.key !== key) return ok;
        if (ok) {
          // 只確認自己送出的版本；在途期間的新修改仍是未同步
          commit({ ...cur, syncedRev: Math.max(syncedRevOf(cur), sentRev) });
          set({ syncError: null });
        } else {
          set({ syncError: failure });
        }
        const after = get().player;
        if (after && hasUnsyncedChanges(after)) {
          if (!ok) get()._scheduleSync(RETRY_MS);
          else if (!_debounceTimer) get()._scheduleSync(0);
        }
        return ok;
      };
      const promise = run();
      self.promise = promise;
      _saveInFlight = { gen, promise };
      return promise;
    },

    clearError: () => set({ error: null }),
  };
});

// ── beforeunload：頁面關閉前 best-effort 同步 ──────────────────
// 不保證送達，也不會改變本機狀態；重新整理後由 loadFromSession 依版本補送
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const { player } = usePlayerStore.getState();
    if (!player || !hasUnsyncedChanges(player)) return;

    // keepalive 讓 fetch 在頁面關閉後繼續執行
    fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify({
        action: "save_profile",
        key: player.key,
        payload: { data: toServerData(player) },
      }),
      keepalive: true,
    }).catch(() => {});
  });
}
