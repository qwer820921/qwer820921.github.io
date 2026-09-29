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
/** 解決存檔衝突前的備份（只存在這個分頁的 session，見 ConflictBackup） */
export const CONFLICT_BACKUP_KEY = "shenma_conflict_backup";
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
// 雲端版本（player.serverRev，見 types）：這個分頁的資料根據雲端哪一個版本，保存、升級、結算時當作 base_rev 送出。
//   只在確定雲端的新版本已包含在本機資料裡時才前進：採用整份雲端資料、整份保存成功，
//   或升級／結算的回應證明是在送出時的版本上計算（prev_rev 等於送出的 base_rev）。
//   升級與結算是在雲端「目前」的資料上計算，回應的 rev 不能證明本機資料包含其他分頁的修改，所以不能只看最新的 rev。
// 版本衝突：保存被拒時暫停自動保存、保留本機修改，由玩家比較兩份資料後選擇（resolveSaveConflict）。
// 結果不明的保存（網路錯誤、回應遺失）：記下送出的資料與版本；之後遇到版本衝突時，
//   雲端剛好是這份資料就代表它其實成功了，不必請玩家選擇
let _uncertainSave: {
  gen: number;
  key: string;
  base: number;
  data: PlayerState;
  localRev: number;
} | null = null;
let _resolving = false; // 正在處理版本衝突（一次只處理一個選擇）

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

/** 寫入限制是否生效；不更新畫面狀態（畫面繪製期間也可以呼叫，例如判斷按鈕能不能按） */
function holdActive(): boolean {
  return (
    _writeHold ||
    (typeof window !== "undefined" && window.__siteIsolation?.lostCopy === true)
  );
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

/**
 * 版本衝突：雲端存檔在這個分頁的資料版本之後被其他分頁或裝置改過（或本機不知道自己的版本），保存被拒絕。
 * 暫停自動保存，本機修改都保留，等玩家比較後選擇。只屬於偵測到它的帳號世代；
 * id 每次偵測或重新比較都會換新，確認時要帶畫面上那一份的 id，避免用舊的比較結果做決定
 */
export type SaveConflict = {
  id: string;
  /** 帳號世代（切換帳號後這份衝突就失效） */
  gen: number;
  /** 雲端版本：玩家看到的那一份；「保留這個分頁」只會覆蓋這個版本 */
  serverRev: number;
  /** 雲端資料；損毀或格式不對時是 null */
  server: PlayerState | null;
  /** conflict：雲端版本不同；base_unknown：本機不知道自己根據哪個版本，後端要求帶版本 */
  reason: "conflict" | "base_unknown";
  detectedAt: number;
};

export type ConflictChoice = "server" | "local";

/**
 * 解決衝突前的備份（這個分頁的 session，重新整理後仍在）：選擇前這個分頁的資料與當時的雲端資料都留著，
 * 可以匯出，也可以把被放棄／被覆蓋的那一份放回這個分頁（之後保存會再出現衝突比較，由玩家決定）
 */
export type ConflictBackup = {
  key: string;
  savedAt: number;
  choice: ConflictChoice;
  /** 選擇前這個分頁的資料與它根據的雲端版本 */
  local: PlayerState;
  localBaseRev: number | null;
  /** 選擇前的雲端資料與版本 */
  cloud: PlayerState | null;
  cloudRev: number;
};

/** 玩家確認時畫面上的狀態：衝突的 id 與這個分頁的本機版本（兩者都沒變才執行） */
export type ConflictExpectation = { conflictId: string; localRev: number };

export type ResolveResult = { ok: true } | { ok: false; error: string };

export type LoadResult =
  | { ok: true; created: boolean; keptLocal?: boolean }
  | { ok: false; error: string; superseded?: boolean };

/**
 * 重新確認待確認升級的結果
 * - applied：伺服器上看得到這次升級，已採用並保存本機的其他修改
 * - not_applied：升級帶著版本送出，雲端版本已不是那個版本、也看不到升級：確定沒有套用（新版後端才有）
 * - none：沒有待確認的升級
 * 看不到升級時回傳 { ok: false, error: "UPGRADE_UNCONFIRMED" }，繼續待確認
 */
export type UpgradeCheckResult =
  | { ok: true; outcome: "applied" | "not_applied" | "none" }
  | { ok: false; error: string };

// ── 版本與資料 helpers ─────────────────────────────────────────
const revOf = (p: SessionPlayerState) => p.rev ?? 0;
const syncedRevOf = (p: SessionPlayerState) => p.syncedRev ?? 0;
const hasUnsyncedChanges = (p: SessionPlayerState) =>
  revOf(p) !== syncedRevOf(p);
const isUnconfirmed = (p: SessionPlayerState | null | undefined) =>
  p?.pendingUpgrade?.state === "unknown";
/** 雲端版本基準；舊版後端（不回報版本）或舊版 session 沒有時是 null */
const serverRevOf = (p: SessionPlayerState | null | undefined) =>
  typeof p?.serverRev === "number" ? p.serverRev : null;
/** 後端回應裡的版本欄位（rev、prev_rev）：非負整數才算，其他（沒有、格式不對）是 null */
const revField = (res: unknown, field: "rev" | "prev_rev"): number | null => {
  const v = (res as Record<string, unknown> | null | undefined)?.[field];
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
};
const sameJson = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
/** 不受物件欄位順序影響的 JSON：比較本機與雲端兩份存檔的內容是否完全相同 */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(o[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
const sameData = (a: unknown, b: unknown) => stableJson(a) === stableJson(b);

/** 整份保存的結果：saved 成功；same／uncertain 被拒但雲端就是本機（或自己上一次）的內容，已自動採用 */
type SaveOutcome = {
  kind: "saved" | "same" | "uncertain" | "conflict" | "failed";
  error: string | null;
};
const savedOk = (o: SaveOutcome) =>
  o.kind !== "conflict" && o.kind !== "failed";
/** 後端明確拒絕、重送也不會成功的保存錯誤：不自動重試（下一次修改時才再送） */
const PERMANENT_SAVE_ERRORS = new Set([
  "DATA_CORRUPT",
  "INVALID_DATA",
  "DATA_TOO_LARGE",
  "BAD_BASE_REV",
]);

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
  delete data.serverRev;
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
    base_rev: typeof op.base_rev === "number" ? op.base_rev : null,
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
      // 沒有版本（舊版 session 或舊版後端）：不假設任何版本，保存不帶 base_rev
      serverRev: serverRevOf(parsed),
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

/** 讀取這個帳號的衝突備份；沒有、帳號不符或格式不對時回傳 null */
function readBackup(key: string): ConflictBackup | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CONFLICT_BACKUP_KEY);
    if (!raw) return null;
    const b = JSON.parse(raw) as ConflictBackup;
    if (!b || b.key !== key || !validateData(b.local)) return null;
    if (b.choice !== "server" && b.choice !== "local") return null;
    return {
      ...b,
      local: normalizeProfile(b.local),
      cloud: validateData(b.cloud) ? normalizeProfile(b.cloud) : null,
      localBaseRev: typeof b.localBaseRev === "number" ? b.localBaseRev : null,
      cloudRev: typeof b.cloudRev === "number" ? b.cloudRev : 0,
    };
  } catch {
    return null;
  }
}

/** 寫入衝突備份；session 寫不進去時回傳 false（呼叫端仍保留記憶體裡的備份） */
function writeBackup(b: ConflictBackup | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (b) sessionStorage.setItem(CONFLICT_BACKUP_KEY, JSON.stringify(b));
    else sessionStorage.removeItem(CONFLICT_BACKUP_KEY);
    return true;
  } catch {
    return false;
  }
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
 * 寫入限制中不建檔（建檔也是寫入），回報 MIGRATION_HOLD。
 * rev：雲端版本（和資料是同一次讀取的結果）；舊版後端沒有時是 null
 */
async function fetchProfile(
  key: string
): Promise<
  | { ok: true; data: PlayerState; created: boolean; rev: number | null }
  | { ok: false; error: string }
> {
  try {
    const res = await gameApi.getProfile(key);
    if (!validateData(res.data)) {
      return { ok: false, error: "PROFILE_FORMAT_INVALID" };
    }
    return {
      ok: true,
      data: normalizeProfile(res.data),
      created: false,
      rev: revField(res, "rev"),
    };
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
    return {
      ok: true,
      data: normalizeProfile(res.data),
      created: true,
      rev: revField(res, "rev"),
    };
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
  /**
   * 版本衝突（見 SaveConflict）：有衝突時暫停自動保存，本機修改都保留，等玩家用 resolveSaveConflict 選擇。
   * 手動同步、切換帳號也會先停下（REV_CONFLICT），不會用任何一份資料默默蓋掉另一份
   */
  saveConflict: SaveConflict | null;
  /** 正在處理玩家對版本衝突的選擇 */
  resolvingConflict: boolean;
  /** 最近一次解決衝突前的備份（這個帳號的；見 ConflictBackup） */
  conflictBackup: ConflictBackup | null;

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

  /**
   * 處理版本衝突（玩家確認後才呼叫；expect 是確認時畫面上的衝突 id 與本機版本，任一個變了就不執行，回傳 CONFLICT_CHANGED）
   * - server：採用雲端版本，放棄這個分頁尚未保存的修改。先重新讀取雲端，版本仍是畫面上那一份才採用；
   *   雲端又更新時刷新比較（新的衝突 id），請玩家重新確認
   * - local：保留這個分頁的版本，只覆蓋畫面上那一份雲端版本（條件寫入）；雲端又更新時同樣刷新比較，不會自動重試覆蓋
   * 兩者都先備份選擇前的兩份資料（conflictBackup）。帳號世代、戰鬥中、待確認的升級、寫入限制、存檔處理暫停、
   * 其他寫入在途時都不執行（回傳原因代碼），資料不變
   */
  resolveSaveConflict: (
    choice: ConflictChoice,
    expect: ConflictExpectation
  ) => Promise<ResolveResult>;
  /** 目前不能處理版本衝突的原因（戰鬥中、寫入限制等）；可以處理時回傳 null */
  conflictBlockReason: () => string | null;
  /**
   * 把備份裡被放棄或被覆蓋的那一份放回這個分頁，當作尚未保存的修改（版本是它當時根據的雲端版本）。
   * 之後保存時會再出現衝突比較，由玩家決定；不會直接覆蓋雲端
   */
  restoreConflictBackup: () => ResolveResult;
  /** 刪除衝突備份（玩家確認不需要之後） */
  dismissConflictBackup: () => void;

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
    _uncertainSave = null;
    clearDebounce();
    // 版本衝突與備份屬於舊帳號：不帶到新帳號（新帳號的備份在載入後讀取）
    set({
      syncError: null,
      checkingUpgrade: false,
      switchNotice: null,
      saveConflict: null,
      conflictBackup: null,
    });
  };
  /** 目前的版本衝突（只認目前帳號世代的） */
  const currentConflict = () => {
    const c = get().saveConflict;
    return c && c.gen === _accountGen ? c : null;
  };
  /** 記下（或刷新）版本衝突：每次都換新的 id，玩家要看過新的比較才能確認 */
  const raiseConflict = (
    gen: number,
    rev: number,
    server: PlayerState | null,
    reason: SaveConflict["reason"]
  ) => {
    set({
      saveConflict: {
        id: newOpId(),
        gen,
        serverRev: rev,
        server,
        reason,
        detectedAt: Date.now(),
      },
    });
  };
  /**
   * 保存或升級被拒（REV_CONFLICT／BASE_REV_REQUIRED，回應附雲端目前的 rev 與 data）：
   * - same：雲端內容和本機完全相同（例如自己上一次保存其實成功、只是回應遺失），沒有任何資料會遺失，直接採用雲端版本
   * - uncertain：雲端正好是自己上一次結果不明的保存（版本 +1、內容相同），採用它的版本，之後的修改再保存
   * - conflict：其他情況一律記下衝突、暫停保存，等玩家選擇（本機修改都保留）
   * - invalid：回應沒有可用的版本、或已經不是同一個帳號，什麼都不做
   */
  const onRevRejected = (
    gen: number,
    key: string,
    response: Record<string, unknown>,
    reason: SaveConflict["reason"]
  ): "same" | "uncertain" | "conflict" | "invalid" => {
    const cur = get().player;
    if (gen !== _accountGen || !cur || cur.key !== key) return "invalid";
    const rev = revField(response, "rev");
    if (rev === null) return "invalid";
    const server = validateData(response.data)
      ? normalizeProfile(response.data)
      : null;
    if (server && sameData(server, toServerData(cur))) {
      _uncertainSave = null;
      commit({ ...cur, serverRev: rev, syncedRev: revOf(cur) });
      set({ syncError: null });
      return "same";
    }
    const u = _uncertainSave;
    if (
      u &&
      u.gen === gen &&
      u.key === key &&
      server &&
      rev === u.base + 1 &&
      sameData(server, u.data)
    ) {
      _uncertainSave = null;
      commit({
        ...cur,
        serverRev: rev,
        syncedRev: Math.max(syncedRevOf(cur), u.localRev),
      });
      return "uncertain";
    }
    raiseConflict(gen, rev, server, reason);
    return "conflict";
  };
  /** 目前不能處理版本衝突的原因；可以處理時回傳 null */
  const blockReason = (ignoreResolving = false): string | null => {
    const p = get().player;
    if (!p) return "NOT_LOADED";
    if (_sessionBlocked) return "SESSION_BLOCKED";
    if (holdActive()) return "MIGRATION_HOLD";
    // 已開打或有待確認的結算（和切換帳號的鎖相同）、結算紀錄還在途：戰鬥結果要套用在目前的資料上，
    // 結算或離開後再處理。備戰中可以處理（和手動同步一樣，已送進遊戲的隊伍不會重新載入）
    if (
      battleLocked() ||
      isCurrent(_battleInFlight) ||
      isCurrent(_resultInFlight)
    ) {
      return "BATTLE_IN_PROGRESS";
    }
    if (p.pendingUpgrade) return "UPGRADE_PENDING";
    if (_resolving && !ignoreResolving) return "RESOLVE_IN_PROGRESS";
    if (
      isCurrent(_saveInFlight) ||
      isCurrent(_upgradeInFlight) ||
      isCurrent(_checkInFlight) ||
      _loadInFlight
    ) {
      return "WRITE_IN_PROGRESS";
    }
    return null;
  };
  /** 保存衝突備份（session 寫不進去時仍留在記憶體，這個頁面可以匯出） */
  const keepBackup = (b: ConflictBackup) => {
    writeBackup(b);
    set({ conflictBackup: b });
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
      let serverRev: number | null;
      const token = snapshotToken();
      try {
        const res = await gameApi.getProfile(key);
        if (!validateData(res.data))
          return retryLater("PROFILE_FORMAT_INVALID");
        server = normalizeProfile(res.data);
        serverRev = revField(res, "rev");
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
      const opBase = typeof op.base_rev === "number" ? op.base_rev : null;
      if (!upgradeVisible(server, op)) {
        // 升級帶著版本送出、雲端版本已經不是那個版本：舊請求之後才被處理也會因版本不符被拒，確定沒有套用。
        // 本機資料（送出前的資料＋之後的修改）仍根據送出時的版本；之後保存時若雲端已被改過，會出現衝突比較
        if (opBase !== null && serverRev !== null && serverRev !== opBase) {
          _autoRecheckStep = 0;
          if (hasUnsyncedChanges(cur)) {
            commit({ ...cur, pendingUpgrade: null });
            get()._scheduleSync(0);
          } else {
            // 本機沒有修改：直接採用剛讀到的雲端資料（沒有任何本機內容會遺失）
            const same = revOf(cur);
            adoptServerData({
              ...server,
              key,
              syncStatus: SyncStatus.Idle,
              pendingUpgrade: null,
              rev: same,
              syncedRev: same,
              serverRev,
            });
          }
          return { ok: true, outcome: "not_applied" };
        }
        return retryLater("UPGRADE_UNCONFIRMED");
      }
      const merged = mergeLocalIntoServer(server, op.base, toServerData(cur));
      if (!merged) return { ok: false, error: "UPGRADE_MERGE_CONFLICT" };
      // 伺服器目前的資料成為已確認的版本；本機修改（若有）另外算一個未同步的版本
      const hasLocalEdits = !sameJson(merged, server);
      // 雲端版本基準：本機沒有修改時整份採用雲端（版本就是雲端的）；有修改時，只有雲端在送出之後只多了這次升級
      // （版本正好 +1）才能前進。雲端還有其他寫入時維持送出時的版本，之後保存會出現衝突比較，不會默默蓋掉
      const nextServerRev =
        serverRev === null
          ? null
          : !hasLocalEdits || (opBase !== null && serverRev === opBase + 1)
            ? serverRev
            : opBase;
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
        serverRev: nextServerRev,
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
   * 送出整份保存（目前的本機資料）。base 是這份資料根據的雲端版本（null：不帶 base_rev，舊版後端或版本不明）。
   * 成功時雲端這個版本的內容就是送出的資料，版本基準改成回應的 rev；被拒時交給 onRevRejected；
   * 其他失敗記下錯誤並排重試（版本衝突中、或重送也不會成功的錯誤不重試）
   */
  const startSave = (base: number | null): Promise<SaveOutcome> => {
    const player = get().player as SessionPlayerState;
    clearDebounce();
    const gen = _accountGen;
    const key = player.key;
    const sentRev = revOf(player);
    const data = toServerData(player);
    const self: { promise?: Promise<boolean> } = {};
    const run = async (): Promise<SaveOutcome> => {
      beginBusy(gen);
      let res: Record<string, unknown> | null = null;
      let failure: string | null = null;
      let rejected: Record<string, unknown> | null = null;
      let uncertain = false;
      try {
        res = await gameApi.saveProfile(key, data, base);
      } catch (e: unknown) {
        failure = errorCode(e);
        if (e instanceof GasError) {
          if (failure === "REV_CONFLICT" || failure === "BASE_REV_REQUIRED") {
            rejected = e.response;
          }
        } else {
          uncertain = true;
        }
      }
      if (_saveInFlight?.promise === self.promise) _saveInFlight = null;
      endBusy(gen);
      const done: SaveOutcome = res
        ? { kind: "saved", error: null }
        : { kind: "failed", error: failure };
      if (gen !== _accountGen) return done; // 帳號已切換：只影響舊帳號的伺服器資料
      const cur = get().player;
      if (!cur || cur.key !== key) return done;

      let outcome = done;
      if (res) {
        // 只確認自己送出的版本；在途期間的新修改仍是未同步。
        // 整份保存成功：雲端這個版本的內容就是送出的資料（舊版後端沒有版本時是 null）
        _uncertainSave = null;
        commit({
          ...cur,
          syncedRev: Math.max(syncedRevOf(cur), sentRev),
          serverRev: revField(res, "rev"),
        });
        set({ syncError: null });
      } else if (rejected) {
        const r = onRevRejected(
          gen,
          key,
          rejected,
          failure === "BASE_REV_REQUIRED" ? "base_unknown" : "conflict"
        );
        if (r === "conflict") {
          // 版本衝突：不重試（再送一次也會被拒），暫停保存等玩家選擇；本機修改都保留
          set({ syncError: failure });
          return { kind: "conflict", error: failure };
        }
        if (r === "invalid") {
          set({ syncError: "BAD_RESPONSE" });
          outcome = { kind: "failed", error: "BAD_RESPONSE" };
        } else {
          outcome = { kind: r, error: null };
        }
      } else {
        // 網路錯誤或無法解析的回應：可能已經寫入，也可能沒有。記下送出的內容，之後遇到版本衝突時用來辨認
        if (uncertain && base !== null) {
          _uncertainSave = { gen, key, base, data, localRev: sentRev };
        }
        set({ syncError: failure });
      }
      const after = get().player;
      if (after && hasUnsyncedChanges(after) && !currentConflict()) {
        if (outcome.kind === "failed") {
          if (!PERMANENT_SAVE_ERRORS.has(outcome.error ?? "")) {
            get()._scheduleSync(RETRY_MS);
          }
        } else if (!_debounceTimer) {
          get()._scheduleSync(0);
        }
      }
      return outcome;
    };
    const outcomePromise = run();
    const promise = outcomePromise.then(savedOk);
    self.promise = promise;
    _saveInFlight = { gen, promise };
    return outcomePromise;
  };
  /** 採用雲端版本（玩家確認後）：先重新讀取，雲端仍是玩家看到的那個版本才採用 */
  const adoptCloud = async (
    conflict: SaveConflict,
    before: SessionPlayerState
  ): Promise<ResolveResult> => {
    const gen = conflict.gen;
    const key = before.key;
    const token = snapshotToken();
    let fresh: PlayerState;
    let rev: number | null;
    try {
      const res = await gameApi.getProfile(key);
      if (!validateData(res.data)) {
        return { ok: false, error: "PROFILE_FORMAT_INVALID" };
      }
      fresh = normalizeProfile(res.data);
      rev = revField(res, "rev");
    } catch (e: unknown) {
      return { ok: false, error: errorCode(e) };
    }
    const cur = get().player;
    if (gen !== _accountGen || !cur || cur.key !== key) {
      return { ok: false, error: "ACCOUNT_CHANGED" };
    }
    if (currentConflict()?.id !== conflict.id) {
      return { ok: false, error: "CONFLICT_CHANGED" };
    }
    if (rev === null) return { ok: false, error: "BAD_RESPONSE" };
    const block = blockReason(true);
    if (block) return { ok: false, error: block };
    // 雲端在確認期間又更新、或本機在讀取期間有新的修改：放棄與採用的內容都和玩家看到的不同，
    // 用剛讀到的雲端刷新比較，請玩家重新確認（不採用玩家沒看過的版本）
    if (
      rev !== conflict.serverRev ||
      revOf(cur) !== revOf(before) ||
      !isFreshSnapshot(token)
    ) {
      raiseConflict(gen, rev, fresh, conflict.reason);
      return { ok: false, error: "CONFLICT_CHANGED" };
    }
    keepBackup({
      key,
      savedAt: Date.now(),
      choice: "server",
      local: toServerData(cur),
      localBaseRev: serverRevOf(cur),
      cloud: fresh,
      cloudRev: rev,
    });
    const same = revOf(cur);
    clearDebounce();
    _uncertainSave = null;
    adoptServerData({
      ...fresh,
      key,
      syncStatus: SyncStatus.Idle,
      pendingUpgrade: null,
      rev: same,
      syncedRev: same,
      serverRev: rev,
    });
    set({ saveConflict: null, syncError: null });
    return { ok: true };
  };
  /** 保留這個分頁的版本（玩家確認後）：只覆蓋玩家看到的那個雲端版本（條件寫入） */
  const keepLocal = async (
    conflict: SaveConflict,
    before: SessionPlayerState
  ): Promise<ResolveResult> => {
    // 雲端資料損毀時後端不接受任何覆寫，不送出
    if (!conflict.server) return { ok: false, error: "DATA_CORRUPT" };
    // 送出前先備份兩份資料：之後回應遺失、重新整理也還留著被覆蓋的雲端資料
    keepBackup({
      key: before.key,
      savedAt: Date.now(),
      choice: "local",
      local: toServerData(before),
      localBaseRev: serverRevOf(before),
      cloud: conflict.server,
      cloudRev: conflict.serverRev,
    });
    const o = await startSave(conflict.serverRev);
    if (conflict.gen !== _accountGen) {
      return { ok: false, error: "ACCOUNT_CHANGED" };
    }
    if (o.kind === "conflict") return { ok: false, error: "CONFLICT_CHANGED" };
    if (o.kind === "failed")
      return { ok: false, error: o.error ?? "GAS_ERROR" };
    set({ saveConflict: null, syncError: null });
    const after = get().player;
    if (after && hasUnsyncedChanges(after)) get()._scheduleSync(0);
    return { ok: true };
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
      // 版本衝突還沒處理：本機修改不能保存，也不能用雲端資料蓋掉（切換帳號、手動同步都不進行）
      if (currentConflict()) return "REV_CONFLICT";
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
    saveConflict: null,
    resolvingConflict: false,
    conflictBackup: null,

    // ── 初始化 ─────────────────────────────────────────────────

    loadFromSession: (key: string) => {
      if (_sessionBlocked) return false;
      const session = readSession(key);
      if (!session) return false;
      // 存檔帶著寫入限制的標記：整個分頁維持限制（分頁標記遺失時的另一份紀錄）
      if (session.migrationHold) markHold();
      resetAccountState();
      commit(session);
      set({ conflictBackup: readBackup(key) });
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
          serverRev: r.rev,
          pendingUpgrade: null,
        });
        set({
          isLoading: false,
          loadingKey: null,
          error: null,
          syncError: null,
          ...(sameAccount ? {} : { conflictBackup: readBackup(key) }),
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
        currentConflict() ||
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
          currentConflict() ||
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
          serverRev: revField(res, "rev"),
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
        const baseRev = serverRevOf(player);
        const op: PendingUpgrade = {
          id: newOpId(),
          hero_id: heroId,
          base: toServerData(player),
          base_rev: baseRev,
          sent_at: Date.now(),
          state: "in_flight",
        };
        // 送出前先把這次升級記進 session：回應遺失（重新整理、網路錯誤）時才知道結果不明，
        // 不會把送出前的 heroes／gold 當成最新版保存
        commit({ ...player, pendingUpgrade: op });
        _dataGen += 1; // 升級會改變伺服器資料：之前送出的背景讀取都已過時
        const token = snapshotToken();
        const promise = gameApi.upgradeHero(key, heroId, baseRev);
        _upgradeInFlight = { gen, promise };
        beginBusy(gen);
        try {
          const res = await promise;
          const cur = get().player;
          if (gen !== _accountGen || !cur || cur.key !== key) {
            return { success: false, error: "ACCOUNT_CHANGED" };
          }
          // 雲端是在送出時的版本上升級（prev_rev 等於送出的 base_rev）：本機資料＋這次升級＝雲端的新版本，可以前進。
          // 否則（舊版後端、沒有版本）維持原本的版本基準，不拿回應的 rev 當成本機資料的版本
          const newRev = revField(res, "rev");
          const chained =
            baseRev !== null &&
            revField(res, "prev_rev") === baseRev &&
            serverRevOf(cur) === baseRev &&
            newRev !== null;
          // 套用到「目前」的資料，保留升級期間的其他修改；金幣只扣這次升級的費用
          // （新版後端回報 cost；舊版後端用伺服器算出的差額）
          const cost = typeof res.cost === "number" ? res.cost : null;
          const idx = cur.heroes.findIndex((h) => h.hero_id === heroId);
          const heroes =
            idx !== -1
              ? cur.heroes.map((h, i) => (i === idx ? res.hero : h))
              : [...cur.heroes, res.hero];
          commit({
            ...cur,
            heroes,
            gold:
              cost !== null
                ? cur.gold - cost
                : cur.gold + (res.gold_remaining - op.base.gold),
            pendingUpgrade: null,
            rev: revOf(cur) + 1,
            serverRev: chained ? newRev : serverRevOf(cur),
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
          if (
            e instanceof GasError &&
            (code === "REV_CONFLICT" || code === "BASE_REV_REQUIRED")
          ) {
            // 雲端版本和送出時不同（或後端要求版本）：伺服器沒有扣點數。
            // 本機沒有其他修改時直接採用雲端目前的資料（附在回應裡、在鎖內讀到的），請玩家確認後再升級；
            // 有修改時記下衝突，等玩家比較後選擇
            const rev = revField(e.response, "rev");
            const fresh = validateData(e.response.data)
              ? normalizeProfile(e.response.data)
              : null;
            if (
              !hasUnsyncedChanges(cur) &&
              fresh &&
              rev !== null &&
              isFreshSnapshot(token)
            ) {
              const same = revOf(cur);
              adoptServerData({
                ...fresh,
                key,
                syncStatus: SyncStatus.Idle,
                pendingUpgrade: null,
                rev: same,
                syncedRev: same,
                serverRev: rev,
              });
              return { success: false, error: "REV_CONFLICT_RELOADED" };
            }
            commit({ ...cur, pendingUpgrade: null });
            const outcome = onRevRejected(
              gen,
              key,
              e.response,
              code === "BASE_REV_REQUIRED" ? "base_unknown" : "conflict"
            );
            return {
              success: false,
              error:
                outcome === "same" || outcome === "uncertain"
                  ? "REV_CONFLICT_RELOADED"
                  : "REV_CONFLICT",
            };
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
      // 場次識別碼另外當作 request_id（新版後端用它辨識重送），不放在結算內容裡
      const record: Partial<BattleResultPayload> = { ...result };
      delete record.battle_id;
      const resultPromise = (async () => {
        // 已經送出的保存與升級先完成：結算要帶它們之後的雲端版本，兩個寫入交錯時彼此的版本都對不上
        const writes = [_saveInFlight, _upgradeInFlight]
          .filter(isCurrent)
          .map((f) => f.promise.catch(() => undefined));
        if (writes.length > 0) await Promise.all(writes);
        if (gen !== _accountGen) return;
        const baseRev = serverRevOf(get().player);
        try {
          const res = await gameApi.saveResult(key, record, ticket.id, baseRev);
          // 雲端是在送出時的版本上結算（prev_rev 等於 base_rev，後端也才會回 rev）：本機已先套用這一場的結果，
          // 所以本機資料包含雲端的新版本，可以前進。版本對不上時維持原本的版本，之後保存由版本衝突處理
          const cur = get().player;
          const rev = revField(res, "rev");
          if (
            gen === _accountGen &&
            cur &&
            cur.key === key &&
            baseRev !== null &&
            rev !== null &&
            revField(res, "prev_rev") === baseRev &&
            serverRevOf(cur) === baseRev
          ) {
            commit({ ...cur, serverRev: rev });
          }
        } catch (err: unknown) {
          console.warn("[Background Sync] 戰鬥結算紀錄送出失敗:", err);
        }
      })();
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
      // 版本衝突還沒處理：暫停保存（本機修改都保留），等玩家比較後選擇
      if (currentConflict()) return Promise.resolve(false);
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

      return startSave(serverRevOf(player)).then(savedOk);
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

    resolveSaveConflict: async (
      choice: ConflictChoice,
      expect: ConflictExpectation
    ) => {
      const conflict = currentConflict();
      const cur = get().player;
      if (!conflict || !cur) return { ok: false, error: "NO_CONFLICT" };
      // 玩家確認時看到的衝突或本機資料已經變了：不用舊的比較結果做決定
      if (conflict.id !== expect.conflictId || revOf(cur) !== expect.localRev) {
        return { ok: false, error: "CONFLICT_CHANGED" };
      }
      const block = blockReason();
      if (block) return { ok: false, error: block };
      _resolving = true;
      set({ resolvingConflict: true });
      try {
        return choice === "server"
          ? await adoptCloud(conflict, cur)
          : await keepLocal(conflict, cur);
      } finally {
        _resolving = false;
        set({ resolvingConflict: false });
      }
    },

    conflictBlockReason: () => blockReason(),

    restoreConflictBackup: () => {
      const b = get().conflictBackup;
      const cur = get().player;
      if (!b || !cur || b.key !== cur.key) {
        return { ok: false, error: "NO_BACKUP" };
      }
      if (currentConflict()) return { ok: false, error: "REV_CONFLICT" };
      const block = blockReason();
      if (block) return { ok: false, error: block };
      // 放回被放棄（採用雲端時）或被覆蓋（保留這個分頁時）的那一份，版本是它當時根據的雲端版本
      const data = b.choice === "server" ? b.local : b.cloud;
      const base = b.choice === "server" ? b.localBaseRev : b.cloudRev;
      if (!data) return { ok: false, error: "NO_BACKUP" };
      // 沒有版本時無法條件寫入：放回後的保存會直接覆蓋雲端，所以不放回
      if (base === null) return { ok: false, error: "NO_VERSION" };
      clearDebounce();
      _dataGen += 1;
      commit({
        ...data,
        key: cur.key,
        syncStatus: cur.syncStatus,
        rev: revOf(cur) + 1,
        syncedRev: syncedRevOf(cur),
        serverRev: base,
        pendingUpgrade: null,
        migrationHold: cur.migrationHold ?? null,
      });
      get()._scheduleSync(0);
      return { ok: true };
    },

    dismissConflictBackup: () => {
      writeBackup(null);
      set({ conflictBackup: null });
    },

    clearError: () => set({ error: null }),

    clearSwitchNotice: () => set({ switchNotice: null }),
  };
});

// 頁面關閉或重新整理時不另外送出保存：卸載時的 keepalive 請求無法追蹤，晚到伺服器時會用舊快照
// 蓋掉之後保存的新資料。未確認的修改都在 session，重新整理後由 loadFromSession 依版本補送。
