import { create } from "zustand";
import {
  PlayerState,
  SessionPlayerState,
  SyncStatus,
  TeamSlot,
  HeroConfig,
  BattleResultPayload,
  BattleResult,
  BattleTicket,
  PendingUpgrade,
  MigrationHold,
} from "../types";
import { gameApi, setPlayerKey, GasError } from "../api/gameApi";
import { stageToNum, getNextStage } from "../utils/stageUtils";

// ── 常數 ──────────────────────────────────────────────────────
export const PLAYER_SESSION_KEY = "shenma_player_state";
const DEBOUNCE_MS = 30_000; // 使用者修改後合併送出的等待時間
const RETRY_MS = 30_000; // 保存失敗後的重試間隔
const RESTORE_SYNC_DELAY_MS = 0; // 重新整理後恢復的未同步修改：立即補送
// 升級結果待確認時，自動重新確認的間隔（之後只在玩家操作時確認）。
// 合計約 7.5 分鐘，涵蓋 GAS 單次執行的時間上限（6 分鐘），但這只是自動確認的次數，
// 不代表之後舊請求一定不會再被處理，所以用完也不會自行判定成功或失敗
const AUTO_RECHECK_DELAYS_MS = [30_000, 60_000, 120_000, 240_000];

// ── 非同步防護（module 層級，跨 render 持久）────────────────────
// 本機版本：player.rev 每次本機修改 +1；player.syncedRev 是伺服器已確認的版本。
//   rev ≠ syncedRev 代表有未同步的修改。保存成功只確認「自己送出的版本」，
//   所以在途期間的新修改不會被舊回應標成已同步。
// 帳號世代：提交不同帳號（或從 session 恢復）時 +1，舊帳號的在途回應一律忽略。
// 讀取序號：每次 initFromGAS +1，只有最新一次讀取可以提交結果。
// 資料世代：採用一份伺服器資料、或送出會改變伺服器資料的升級時 +1。
//   所有會採用伺服器玩家資料的讀取（背景讀取、登入／切換／手動同步、重新確認升級）都在送出前
//   記下世代（snapshotToken），回應時世代變了就不套用：較早送出的讀取可能是舊資料，
//   而採用新資料時 rev 不一定會變（例如重新確認升級時沒有本機修改），只比 rev 分不出來。
// 待確認的升級：player.pendingUpgrade（寫在 session）。結果不明時暫停整份保存，
//   只有重新讀取伺服器、看到升級已完成後，才把本機修改套到伺服器的最新資料上再保存。
//   看不到升級時一律維持待確認（沒有強制解除的方式）：看不到不代表舊請求不會再被處理。
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _accountGen = 0;
let _busy = 0; // 目前帳號世代的在途伺服器寫入數（save_profile、戰鬥結算、升級）
let _loadSeq = 0;
let _dataGen = 0;
let _autoRecheckStep = 0; // 已排過幾次自動重新確認
type InFlight<T> = { gen: number; promise: Promise<T> };
let _loadInFlight: { key: string; promise: Promise<LoadResult> } | null = null;
let _saveInFlight: InFlight<boolean> | null = null;
let _battleInFlight: InFlight<void> | null = null; // 戰鬥結算整段（save_result＋之後的保存）
let _resultInFlight: InFlight<void> | null = null; // 只有 save_result 本身
let _upgradeInFlight: InFlight<unknown> | null = null;
let _checkInFlight: InFlight<UpgradeCheckResult> | null = null;
// 戰鬥歸屬：目前有效的一場（送出關卡資料時建立）。開始新的一場、明確離開、結算、換帳號都會讓它失效，
// 之後那張票不能再結算，也不能上鎖或解除。locked：已開打或有待確認的結算，這段期間不能切換到其他帳號。
// 已結算的戰鬥記下識別碼，同一場只能結算一次
let _activeBattle: { ticket: BattleTicket; locked: boolean } | null = null;
const _settledBattles = new Set<string>();
// 遷移狀態不明的分頁（見 types 的 MigrationHold）：這個頁面不送出任何寫入，只能讀取。
// 由 holdMigrationWrites() 設定（分頁標記由開機腳本保存在 session），或從 session 載入到帶有 migrationHold 的存檔時設定；
// 一旦設定就不會解除
let _writeHold = false;
let _onHold: (() => void) | null = null; // store 建立時設定：更新畫面用的 writeHold
// 網站遷移的存檔處理還沒完成（見 utils/siteIsolation/boot.ts 的 problem）：不讀取 session、不讀取伺服器存檔、不保存，
// 避免覆蓋還沒處理的暫存。由 setSessionBlocked() 設定
let _sessionBlocked = false;

/** 進入寫入限制（不會解除） */
function markHold() {
  if (_writeHold) return;
  _writeHold = true;
  _onHold?.();
}
/**
 * 目前是否在寫入限制中。開機腳本的分頁標記（lostCopy，存在 session，重新整理後仍在）也在每次寫入前直接檢查，
 * 不依賴元件先呼叫 holdMigrationWrites
 */
function writesHeld(): boolean {
  if (
    !_writeHold &&
    typeof window !== "undefined" &&
    window.__siteIsolation?.lostCopy === true
  ) {
    markHold();
  }
  return _writeHold;
}

/** 這張票是不是目前有效的那一場（同一個帳號世代、而且還沒被新場次、離開或結算取代） */
const isActiveBattle = (ticket: BattleTicket | null | undefined) =>
  !!ticket &&
  !!_activeBattle &&
  _activeBattle.ticket.id === ticket.id &&
  ticket.gen === _accountGen;
/** 目前有效的那一場已開打或有待確認的結算：不能切換到其他帳號 */
const battleLocked = () =>
  !!_activeBattle?.locked && _activeBattle.ticket.gen === _accountGen;

/**
 * 切換到其他帳號失敗的原因（錯誤代碼）。玩家資訊視窗關閉後才失敗時（例如切換送出後才開打），
 * 主畫面靠它顯示「未切換」。不記錄任何存檔金鑰
 */
export type SwitchNotice = { error: string };

/** 戰鬥結算的結果：不屬於目前帳號、不是目前的場次或已經結算過時不套用 */
export type BattleSettleResult = { ok: true } | { ok: false; error: string };

export type LoadResult =
  | { ok: true; created: boolean; keptLocal?: boolean }
  | { ok: false; error: string; superseded?: boolean };

/**
 * 重新確認待確認升級的結果
 * - applied：伺服器上看得到這次升級，已採用並保存本機的其他修改
 * - none：沒有待確認的升級
 * 看不到升級時回傳 { ok: false, error: "UPGRADE_UNCONFIRMED" }，繼續待確認
 */
export type UpgradeCheckResult =
  | { ok: true; outcome: "applied" | "none" }
  | { ok: false; error: string };

// ── 版本與資料 helpers ─────────────────────────────────────────
const revOf = (p: SessionPlayerState) => p.rev ?? 0;
const syncedRevOf = (p: SessionPlayerState) => p.syncedRev ?? 0;
const hasUnsyncedChanges = (p: SessionPlayerState) =>
  revOf(p) !== syncedRevOf(p);
const isUnconfirmed = (p: SessionPlayerState | null | undefined) =>
  p?.pendingUpgrade?.state === "unknown";
const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

function withStatus(p: SessionPlayerState): SessionPlayerState {
  const syncStatus = isUnconfirmed(p)
    ? SyncStatus.Unconfirmed
    : _busy > 0
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
  delete data.pendingUpgrade;
  delete data.migrationHold;
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

const newOpId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** 伺服器資料上看得到這次升級嗎？（武將等級比送出前高） */
function upgradeVisible(server: PlayerState, op: PendingUpgrade): boolean {
  const level = (p: PlayerState) =>
    p.heroes.find((h) => h.hero_id === op.hero_id)?.level ?? 1;
  return level(server) > level(op.base);
}

/**
 * 把本機在升級送出後做的修改，套到伺服器的最新資料上
 * - 升級只會改 heroes 與 gold：其他欄位本機有改就用本機的（暱稱、隊伍、戰鬥經驗等）
 * - gold 用差額合併：伺服器目前的點數＋本機自送出後的增減（例如戰鬥獎勵）
 * - 本機的 heroes 和送出前不同就無法安全合併，回傳 null
 *   （升級待確認期間不允許再升級，正常不會發生）
 */
function mergeLocalIntoServer(
  server: PlayerState,
  base: PlayerState,
  local: PlayerState
): PlayerState | null {
  if (!sameJson(local.heroes, base.heroes)) return null;
  const merged: Record<string, unknown> = { ...server };
  const l = local as unknown as Record<string, unknown>;
  const b = base as unknown as Record<string, unknown>;
  for (const k of Object.keys(l)) {
    if (k === "heroes" || k === "gold") continue;
    if (!sameJson(l[k], b[k])) merged[k] = l[k];
  }
  merged.gold = server.gold + (local.gold - base.gold);
  return merged as unknown as PlayerState;
}

// ── sessionStorage helpers ─────────────────────────────────────
function readPendingUpgrade(raw: unknown): PendingUpgrade | null {
  if (!raw || typeof raw !== "object") return null;
  const op = raw as Partial<PendingUpgrade>;
  if (typeof op.id !== "string" || typeof op.hero_id !== "string") return null;
  if (!validateData(op.base)) return null;
  // 送出請求的是上一個頁面，它的回應已經不可能送達：結果一律視為不確定
  return {
    id: op.id,
    hero_id: op.hero_id,
    base: normalizeProfile(op.base),
    sent_at: typeof op.sent_at === "number" ? op.sent_at : 0,
    state: "unknown",
  };
}

// 寫入限制的標記：有這個欄位（不論內容）就維持限制，不會因為格式不對而解除
function readMigrationHold(raw: unknown): MigrationHold | null {
  if (raw === undefined || raw === null) return null;
  const h = raw as Partial<MigrationHold>;
  return { since: typeof h.since === "number" ? h.since : 0 };
}

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
      pendingUpgrade: readPendingUpgrade(parsed.pendingUpgrade),
      migrationHold: readMigrationHold(parsed.migrationHold),
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

/** 讀取伺服器玩家資料前記下帳號世代與資料世代；回應時兩者都沒變，這份資料才可以採用 */
type SnapshotToken = { gen: number; dataGen: number };
const snapshotToken = (): SnapshotToken => ({
  gen: _accountGen,
  dataGen: _dataGen,
});
const isFreshSnapshot = (t: SnapshotToken) =>
  t.gen === _accountGen && t.dataGen === _dataGen;

/**
 * 讀取存檔；只有 PROFILE_NOT_FOUND 才建檔，其他錯誤一律回報失敗。
 * 寫入限制中不建檔（建檔也是寫入），回報 MIGRATION_HOLD
 */
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
  if (writesHeld()) return { ok: false, error: "MIGRATION_HOLD" };
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
  /** 遷移狀態不明的寫入限制（見 types 的 MigrationHold）：這個分頁只能讀取，設定後不會解除 */
  writeHold: boolean;
  /** 最近一次背景保存失敗的錯誤代碼（成功後清除；失敗會自動重試） */
  syncError: string | null;
  /** 正在重新確認待確認的升級 */
  checkingUpgrade: boolean;
  /**
   * 最近一次切換到其他帳號失敗的原因（只有最新一次請求會寫入）。
   * 開始新的切換、切換成功或玩家關閉提示時清除
   */
  switchNotice: SwitchNotice | null;

  /** 從 sessionStorage 載入指定 key 的存檔；key 不符或沒有資料時回傳 false */
  loadFromSession: (key: string) => boolean;
  /**
   * 讀取並切換到指定 key 的存檔（找不到時建立新存檔）。登入、重試、切換帳號共用。
   * - 目前帳號有未同步修改時，先保存成功才讀取；保存失敗（或升級結果待確認）就不切換
   * - 成功後才一起寫入 key、玩家資料與 session；失敗時保留原本的資料
   * - 同時有多次讀取時，只有最後一次的結果會生效
   */
  initFromGAS: (key: string) => Promise<LoadResult>;
  /** 手動同步：先保存本機未同步的修改，成功後再讀取伺服器最新資料 */
  refreshProfile: () => Promise<LoadResult>;
  /** 背景靜默刷新（沒有未同步修改、沒有待確認的升級時才執行，回應時再檢查一次） */
  backgroundRefresh: (key: string) => Promise<void>;

  /** 暱稱變更 → 30s debounce 同步；寫入限制中不修改，回傳 false */
  updateNickname: (nickname: string) => boolean;
  /** 隊伍變更 → 30s debounce 同步；寫入限制中不修改，回傳 false */
  updateTeam: (team: TeamSlot[]) => boolean;
  /**
   * 武將升級
   * - 沒有未同步修改：呼叫 GAS upgrade_hero（伺服器計算）；送出前先把這次升級記進 session
   * - 有未同步修改：本地計算，重置 debounce timer
   * - 上一次伺服器升級還在處理，或結果待確認時拒絕，避免重複扣款
   * - 寫入限制中拒絕（MIGRATION_HOLD），本機也不計算
   */
  upgradeHero: (
    heroId: string,
    heroConfig: HeroConfig
  ) => Promise<{ success: boolean; error?: string }>;
  /**
   * 開始一場戰鬥（送出關卡資料時呼叫）：取得綁定目前帳號的戰鬥票，成為目前有效的一場。
   * 之前的那一場（如果還在）就此失效，它的鎖也一起解除。票的 id 也是送進 Godot 的場次識別碼。
   * 寫入限制中不開戰（戰鬥結果無法保存），回傳 null
   */
  beginBattle: () => BattleTicket | null;
  /** 戰鬥票是否仍是目前有效的那一場（開始新的一場、離開、結算、切換帳號後就不是） */
  isBattleTicketCurrent: (ticket: BattleTicket) => boolean;
  /** 這一場已開打或有待確認的結算：上鎖（不能切換到其他帳號）。不是目前的場次時不做任何事 */
  lockBattle: (ticket: BattleTicket | null | undefined) => void;
  /** 明確離開這一場（切換關卡、離開頁面）：這一場失效並解除它的鎖。不是目前的場次時不做任何事 */
  endBattle: (ticket: BattleTicket | null | undefined) => void;
  /**
   * 戰鬥結算：本地先更新，接著送出 save_result（只送一次）並保存 profile
   * 戰鬥票必須是目前帳號、目前有效的那一場，而且還沒結算過；否則不套用任何獎勵、不送任何請求。
   * 寫入限制中（開戰後才遇到限制）也不套用、不送出（MIGRATION_HOLD），由畫面說明結果沒有記錄
   */
  applyBattleResult: (
    result: BattleResultPayload,
    ticket: BattleTicket | null | undefined
  ) => BattleSettleResult;
  /** 重新讀取伺服器，確認待確認的升級是否已完成；看得到才採用並保存本機修改 */
  recheckPendingUpgrade: () => Promise<UpgradeCheckResult>;
  /**
   * 這個分頁遷移狀態不明（讀不回網站更新前的暫存）：之後不送出任何寫入，只能讀取（見 types 的 MigrationHold）。
   * 目前與之後載入的存檔都記上標記（重新整理後仍有效）；沒有解除的方法。已有的本機修改與待確認的升級都保留
   */
  holdMigrationWrites: () => void;
  /** 網站遷移的存檔處理還沒完成時暫停：不讀取 session、不讀取伺服器存檔、不保存 */
  setSessionBlocked: (blocked: boolean) => void;

  clearError: () => void;
  /** 關閉切換失敗的提示 */
  clearSwitchNotice: () => void;

  // 內部方法（以 _ 前綴標示，不應在 UI 直接呼叫）
  _scheduleSync: (delayMs?: number) => void;
  /** 立即保存目前的本機版本；成功回傳 true */
  _syncNow: () => Promise<boolean>;
}

// ── Zustand Store ──────────────────────────────────────────────
export const usePlayerStore = create<PlayerStore>((set, get) => {
  _onHold = () => set({ writeHold: true });
  /**
   * 寫入 store 與 session（同步狀態一律由版本、在途寫入與待確認的升級推導）。
   * 寫入限制中，每一份存檔都帶著限制標記（重新整理後從 session 讀回仍有效）
   */
  const commit = (p: SessionPlayerState) => {
    const next = withStatus(
      writesHeld() && !p.migrationHold
        ? {
            ...p,
            migrationHold: {
              since: get().player?.migrationHold?.since ?? Date.now(),
            },
          }
        : p
    );
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
  /** 採用一份伺服器資料：之前送出、還沒回來的背景讀取全部失效 */
  const adoptServerData = (p: SessionPlayerState) => {
    _dataGen += 1;
    return commit(p);
  };
  /** 寫入限制中還有本機修改：不送出，記下原因（不自動重試；修改都保留在 session） */
  const heldSave = () => {
    set({ syncError: "MIGRATION_HOLD" });
    return false;
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
    _autoRecheckStep = 0;
    _activeBattle = null;
    clearDebounce();
    set({ syncError: null, checkingUpgrade: false, switchNotice: null });
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
  /**
   * 重新讀取伺服器，確認待確認的升級
   * - auto：自動確認；看不到結果時依 AUTO_RECHECK_DELAYS_MS 再排下一次
   * - manual：玩家或切換帳號等流程觸發；看不到結果就回報 UPGRADE_UNCONFIRMED
   * 看不到升級不代表確定沒套用（舊請求可能還沒被處理），所以一律維持待確認，不判定失敗、不解除保護
   */
  const checkUpgrade = (
    mode: "auto" | "manual"
  ): Promise<UpgradeCheckResult> => {
    const p = get().player;
    if (!p || !isUnconfirmed(p)) {
      return Promise.resolve({ ok: true, outcome: "none" });
    }
    // 同時只做一次讀取
    if (isCurrent(_checkInFlight)) return _checkInFlight.promise;
    const gen = _accountGen;
    const key = p.key;
    const op = p.pendingUpgrade as PendingUpgrade;
    const retryLater = (error: string): UpgradeCheckResult => {
      if (
        mode === "auto" &&
        gen === _accountGen &&
        _autoRecheckStep < AUTO_RECHECK_DELAYS_MS.length
      ) {
        get()._scheduleSync(AUTO_RECHECK_DELAYS_MS[_autoRecheckStep]);
        _autoRecheckStep += 1;
      }
      return { ok: false, error };
    };
    const run = async (): Promise<UpgradeCheckResult> => {
      let server: PlayerState;
      const token = snapshotToken();
      try {
        const res = await gameApi.getProfile(key);
        if (!validateData(res.data))
          return retryLater("PROFILE_FORMAT_INVALID");
        server = normalizeProfile(res.data);
      } catch (e: unknown) {
        return retryLater(errorCode(e));
      }
      const cur = get().player;
      if (
        gen !== _accountGen ||
        !cur ||
        cur.key !== key ||
        cur.pendingUpgrade?.id !== op.id
      ) {
        return { ok: false, error: "ACCOUNT_CHANGED" };
      }
      // 讀取期間已採用了其他伺服器資料：這份回應可能比較舊，不採用，之後再確認
      if (!isFreshSnapshot(token)) return retryLater("STALE_READ");
      if (!upgradeVisible(server, op)) {
        return retryLater("UPGRADE_UNCONFIRMED");
      }
      const merged = mergeLocalIntoServer(server, op.base, toServerData(cur));
      if (!merged) return { ok: false, error: "UPGRADE_MERGE_CONFLICT" };
      // 伺服器目前的資料成為已確認的版本；本機修改（若有）另外算一個未同步的版本
      const hasLocalEdits = !sameJson(merged, server);
      const base = revOf(cur);
      clearDebounce();
      _autoRecheckStep = 0;
      adoptServerData({
        ...merged,
        key,
        syncStatus: SyncStatus.Idle,
        pendingUpgrade: null,
        rev: hasLocalEdits ? base + 1 : base,
        syncedRev: base,
      });
      if (hasLocalEdits) await get()._syncNow();
      return { ok: true, outcome: "applied" };
    };
    set({ checkingUpgrade: true });
    const promise = run();
    _checkInFlight = { gen, promise };
    void promise.finally(() => {
      if (_checkInFlight?.promise === promise) _checkInFlight = null;
      if (gen === _accountGen) set({ checkingUpgrade: false });
    });
    return promise;
  };
  /**
   * 保存目前帳號所有未同步的修改；成功（或本來就沒有）回傳 null，否則回傳錯誤代碼。
   * 升級結果待確認時先重新確認，確認不了就不保存（UPGRADE_UNCONFIRMED）
   */
  const flushCurrent = async (): Promise<string | null> => {
    for (let i = 0; i < 5; i++) {
      await waitForWrites();
      const p = get().player;
      if (!p || !hasUnsyncedChanges(p)) return null;
      // 寫入限制中：本機修改無法保存，保留在這裡（切換帳號、手動同步都不進行）
      if (writesHeld()) return "MIGRATION_HOLD";
      if (isUnconfirmed(p)) {
        await checkUpgrade("manual");
        if (isUnconfirmed(get().player)) return "UPGRADE_UNCONFIRMED";
        continue;
      }
      if (!(await get()._syncNow())) return "UNSYNCED_SAVE_FAILED";
    }
    const p = get().player;
    return !p || !hasUnsyncedChanges(p) ? null : "UNSYNCED_SAVE_FAILED";
  };

  return {
    player: null,
    isLoading: false,
    loadingKey: null,
    error: null,
    writeHold: _writeHold,
    syncError: null,
    checkingUpgrade: false,
    switchNotice: null,

    // ── 初始化 ─────────────────────────────────────────────────

    loadFromSession: (key: string) => {
      if (_sessionBlocked) return false;
      const session = readSession(key);
      if (!session) return false;
      // 存檔帶著寫入限制的標記：整個分頁維持限制（分頁標記遺失時的另一份紀錄）
      if (session.migrationHold) markHold();
      resetAccountState();
      commit(session);
      // 重新整理前的升級結果不明：先重新確認，確認前不保存（避免蓋掉伺服器上已完成的升級）
      // 其他未確認的修改：不等使用者再操作，直接補送（只重送 profile）
      if (isUnconfirmed(session) || hasUnsyncedChanges(session)) {
        get()._scheduleSync(RESTORE_SYNC_DELAY_MS);
      }
      return true;
    },

    initFromGAS: (rawKey: string) => {
      const key = rawKey.trim();
      if (_sessionBlocked) {
        set({ error: get().player ? null : "SESSION_BLOCKED" });
        return Promise.resolve({ ok: false, error: "SESSION_BLOCKED" });
      }
      // 同一個 key 的讀取已在進行：共用結果，避免連按造成重複建檔與請求風暴
      if (_loadInFlight && _loadInFlight.key === key) {
        return _loadInFlight.promise;
      }
      const seq = ++_loadSeq;
      // 從目前的帳號切換到其他帳號（登入、同帳號同步不算）：開始時清掉上一次的切換提示
      const switching = !!get().player && get().player?.key !== key;
      if (switching) set({ switchNotice: null });
      const superseded = (): LoadResult => ({
        ok: false,
        error: "SUPERSEDED",
        superseded: true,
      });
      const fail = (error: string): LoadResult => {
        // 已經有較新的請求：不回報、也不改提示（舊請求不能蓋掉較新的結果）
        if (seq !== _loadSeq) return superseded();
        // 已有玩家資料（例如切換帳號失敗）時不蓋掉目前畫面，錯誤只回傳給呼叫端；
        // 切換失敗另外留下提示，玩家資訊視窗關閉後主畫面也看得到
        set({
          isLoading: false,
          loadingKey: null,
          error: get().player ? null : error,
          ...(switching && get().player ? { switchNotice: { error } } : {}),
        });
        return { ok: false, error };
      };

      // 戰鬥進行中或有待確認的結算：不能切換到其他帳號（同帳號同步不受影響）。
      // 等待保存或讀取的期間也可能開打，所以每次 await 之後都要再檢查，最後一次在提交之前
      const battleBlocks = () => {
        const current = get().player;
        return battleLocked() && !!current && current.key !== key;
      };

      const run = async (): Promise<LoadResult> => {
        if (battleBlocks()) return fail("BATTLE_IN_PROGRESS");
        set({ isLoading: true, loadingKey: key, error: null });
        // 1. 目前帳號的未同步修改要先保存成功（切換帳號、手動同步都適用）
        const flushError = await flushCurrent();
        if (flushError) return fail(flushError);
        if (seq !== _loadSeq) return superseded();
        // 保存期間開打：不讀取（也不會建立）另一個帳號的存檔
        if (battleBlocks()) return fail("BATTLE_IN_PROGRESS");
        const before = get().player;
        // 同一個帳號、升級結果待確認：不能直接用伺服器資料覆蓋（會清掉待確認紀錄），改成重新確認
        if (before && before.key === key && isUnconfirmed(before)) {
          const c = await checkUpgrade("manual");
          if (seq !== _loadSeq) return superseded();
          if (!c.ok) return fail(c.error);
          set({ isLoading: false, loadingKey: null, error: null });
          return { ok: true, created: false };
        }
        const baseRev = before && before.key === key ? revOf(before) : null;

        // 2. 讀取存檔（找不到才建立）；送出前記下世代，提交前驗證
        const token = snapshotToken();
        const r = await fetchProfile(key);
        if (seq !== _loadSeq) return superseded();
        if (!r.ok) return fail(r.error);

        // 3. 讀取期間目前帳號又有新修改：再保存一次
        const flushAgain = await flushCurrent();
        if (flushAgain) return fail(flushAgain);
        if (seq !== _loadSeq) return superseded();
        // 讀取或再保存期間開打：這是提交前最後一次檢查，之後不再 await
        if (battleBlocks()) return fail("BATTLE_IN_PROGRESS");
        const now = get().player;
        const sameAccount = !!now && now.key === key;
        if (
          sameAccount &&
          ((baseRev !== null && revOf(now) !== baseRev) ||
            now.pendingUpgrade ||
            !isFreshSnapshot(token))
        ) {
          // 同一帳號、讀取期間本機有更新的版本（剛才已保存）、新的升級，或已採用了其他伺服器資料
          // （例如重新確認升級、背景讀取）：這次讀到的可能比較舊，保留本機資料，不回頭套用
          set({ isLoading: false, loadingKey: null, error: null });
          return { ok: true, created: r.created, keptLocal: true };
        }

        // 4. 提交：key、玩家資料與 session 一起切換
        if (!sameAccount) resetAccountState();
        const base = sameAccount && now ? revOf(now) : 0;
        setPlayerKey(key);
        adoptServerData({
          ...r.data,
          key,
          syncStatus: SyncStatus.Idle,
          rev: base,
          syncedRev: base,
          pendingUpgrade: null,
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
      // 有本機未同步修改、在途寫入或待確認的升級時跳過，避免覆蓋
      if (
        !player ||
        player.key !== key ||
        hasUnsyncedChanges(player) ||
        player.pendingUpgrade ||
        _busy > 0
      ) {
        return;
      }
      const token = snapshotToken();
      const rev0 = revOf(player);
      try {
        const res = await gameApi.getProfile(key);
        if (!validateData(res.data)) return;
        const cur = get().player;
        // 回應時再檢查一次：帳號、資料世代、本機版本、未同步修改、在途寫入與待確認的升級都沒變才套用
        if (
          !isFreshSnapshot(token) ||
          !cur ||
          cur.key !== key ||
          revOf(cur) !== rev0 ||
          hasUnsyncedChanges(cur) ||
          cur.pendingUpgrade ||
          _busy > 0
        ) {
          return;
        }
        adoptServerData({
          ...normalizeProfile(res.data),
          key,
          syncStatus: SyncStatus.Idle,
          rev: rev0,
          syncedRev: rev0,
          pendingUpgrade: null,
        });
      } catch {
        // 背景刷新失敗靜默忽略
      }
    },

    // ── 玩家操作 ───────────────────────────────────────────────

    // 寫入限制中不修改：修改無法保存，不讓玩家以為仍能正常保存
    updateNickname: (nickname: string) => {
      if (writesHeld() || !edit({ nickname })) return false;
      get()._scheduleSync();
      return true;
    },

    updateTeam: (team: TeamSlot[]) => {
      if (writesHeld() || !edit({ team })) return false;
      get()._scheduleSync();
      return true;
    },

    upgradeHero: async (heroId: string, heroConfig: HeroConfig) => {
      const player = get().player;
      if (!player) return { success: false, error: "NOT_LOADED" };
      // 寫入限制中：不送出 upgrade_hero，也不在本機計算（之後無法保存）
      if (writesHeld()) return { success: false, error: "MIGRATION_HOLD" };
      if (isUnconfirmed(player)) {
        return { success: false, error: "UPGRADE_UNCONFIRMED" };
      }
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
        const op: PendingUpgrade = {
          id: newOpId(),
          hero_id: heroId,
          base: toServerData(player),
          sent_at: Date.now(),
          state: "in_flight",
        };
        // 送出前先把這次升級記進 session：回應遺失（重新整理、網路錯誤）時才知道結果不明，
        // 不會把送出前的 heroes／gold 當成最新版保存
        commit({ ...player, pendingUpgrade: op });
        _dataGen += 1; // 升級會改變伺服器資料：之前送出的背景讀取都已過時
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
          commit({
            ...cur,
            heroes,
            gold: cur.gold + (res.gold_remaining - op.base.gold),
            pendingUpgrade: null,
            rev: revOf(cur) + 1,
          });
          get()._scheduleSync();
          return { success: true };
        } catch (e: unknown) {
          const code = errorCode(e);
          const cur = get().player;
          if (
            gen !== _accountGen ||
            !cur ||
            cur.key !== key ||
            cur.pendingUpgrade?.id !== op.id
          ) {
            return { success: false, error: code };
          }
          if (e instanceof GasError) {
            // 伺服器明確回傳錯誤：這次升級沒有套用，期間的其他修改照常保存
            commit({ ...cur, pendingUpgrade: null });
            return { success: false, error: code };
          }
          // 網路錯誤或無法解析的回應：伺服器可能已完成，也可能沒有。不猜測，改成待確認並重新確認
          _autoRecheckStep = 0;
          commit({ ...cur, pendingUpgrade: { ...op, state: "unknown" } });
          get()._scheduleSync(0);
          return { success: false, error: "UPGRADE_UNCONFIRMED" };
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

    beginBattle: () => {
      if (!get().player || writesHeld()) return null;
      const ticket = { id: newOpId(), gen: _accountGen };
      _activeBattle = { ticket, locked: false };
      return ticket;
    },

    isBattleTicketCurrent: (ticket: BattleTicket) => isActiveBattle(ticket),

    lockBattle: (ticket) => {
      if (_activeBattle && isActiveBattle(ticket)) _activeBattle.locked = true;
    },

    endBattle: (ticket) => {
      if (isActiveBattle(ticket)) _activeBattle = null;
    },

    applyBattleResult: (
      result: BattleResultPayload,
      ticket: BattleTicket | null | undefined
    ) => {
      const player = get().player;
      if (!player) return { ok: false, error: "NOT_LOADED" };
      // 這場戰鬥必須屬於目前帳號：開戰後切換過帳號（即使又切回來）都不套用
      if (!ticket || ticket.gen !== _accountGen) {
        return { ok: false, error: "BATTLE_ACCOUNT_CHANGED" };
      }
      // 同一場只結算一次（連按確認、重複送達的結算）
      if (_settledBattles.has(ticket.id)) {
        return { ok: false, error: "BATTLE_ALREADY_SETTLED" };
      }
      // 已經被新的一場取代、或已經明確離開的那一場：不是目前的場次，不結算
      if (!isActiveBattle(ticket)) {
        return { ok: false, error: "BATTLE_NOT_CURRENT" };
      }
      // 開戰後才遇到寫入限制：不套用獎勵、不送出 save_result（結果無法保存），由畫面說明
      if (writesHeld()) return { ok: false, error: "MIGRATION_HOLD" };
      _settledBattles.add(ticket.id);
      _activeBattle = null; // 這一場結束：解除鎖，這張票之後不能再使用

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
      beginBusy(gen);
      // 場次識別碼只用來在頁面比對歸屬，不送到後端（不改變 save_result 的契約）
      const record: Partial<BattleResultPayload> = { ...result };
      delete record.battle_id;
      const resultPromise = gameApi.saveResult(key, record).then(
        () => undefined,
        (err: unknown) => {
          console.warn("[Background Sync] 戰鬥結算紀錄送出失敗:", err);
        }
      );
      _resultInFlight = { gen, promise: resultPromise };
      const promise = (async () => {
        await resultPromise;
        if (_resultInFlight?.promise === resultPromise) _resultInFlight = null;
        endBusy(gen);
        if (gen === _accountGen) await get()._syncNow();
      })();
      _battleInFlight = { gen, promise };
      void promise.finally(() => {
        if (_battleInFlight?.promise === promise) _battleInFlight = null;
      });
      return { ok: true };
    },

    recheckPendingUpgrade: () => checkUpgrade("manual"),

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
      if (!player) return Promise.resolve(true);
      if (_sessionBlocked) return Promise.resolve(false);
      // 升級結果待確認：整份保存會送出可能過時的 heroes／gold，先重新確認；
      // 確認後（checkUpgrade 內）才會保存本機修改
      if (isUnconfirmed(player)) {
        return checkUpgrade("auto").then((r) => {
          const after = get().player;
          return r.ok && (!after || !hasUnsyncedChanges(after));
        });
      }
      if (!hasUnsyncedChanges(player)) return Promise.resolve(true);
      // 寫入限制中：不送出 save_profile（自動保存、重新整理後補送、重試、切換前保存都經過這裡），修改保留
      if (writesHeld()) return Promise.resolve(heldSave());
      // 已有保存在途：等它結束（結束時若還有新修改會自動再排程）
      if (isCurrent(_saveInFlight)) return _saveInFlight.promise;
      // 升級或戰鬥結算紀錄還在途：等它結束再保存。現在送出的快照不含它的結果，
      // 會把伺服器剛算好的 heroes／gold 蓋掉
      const serverOps = [_upgradeInFlight, _resultInFlight].filter(isCurrent);
      if (serverOps.length > 0) {
        const gen = _accountGen;
        return Promise.allSettled(serverOps.map((f) => f.promise)).then(() =>
          gen === _accountGen ? get()._syncNow() : false
        );
      }

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

    holdMigrationWrites: () => {
      markHold();
      // 目前的存檔（若有）也記上標記；本機修改、待確認的升級都保留，只是之後不送出
      const p = get().player;
      if (p && !p.migrationHold) commit(p);
    },

    setSessionBlocked: (blocked: boolean) => {
      _sessionBlocked = blocked;
      if (!blocked && get().error === "SESSION_BLOCKED") set({ error: null });
    },

    clearError: () => set({ error: null }),

    clearSwitchNotice: () => set({ switchNotice: null }),
  };
});

// 頁面關閉或重新整理時不另外送出保存：卸載時的 keepalive 請求無法追蹤，晚到伺服器時會用舊快照
// 蓋掉之後保存的新資料。未確認的修改都在 session，重新整理後由 loadFromSession 依版本補送。
