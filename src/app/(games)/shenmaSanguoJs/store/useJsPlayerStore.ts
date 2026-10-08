/**
 * useJsPlayerStore.ts
 * 神馬三國 JS 純渲染版的玩家帳號、資產、隊伍與存檔 Zustand Store
 *
 * 兩種模式：
 * - 共用帳號（shared）：和 Godot 版共用同一個 shenma_player_key 與同一份雲端存檔。讀寫一律用 Godot 版的 api/gameApi.ts，
 *   保存格式就是後端／Godot 的存檔（canonical，原樣保留），畫面用 utils/sharedProfile 的顯示投影（不寫回）。
 *   - 金鑰只有在明確登入、建立成功時寫入，登出時清掉；載入、保存、匯入都不改它，也不讀舊的 shenma_js_player_key 或舊的 JS 本機快取
 *   - 後端找不到存檔時不自動建立：要使用者再按一次「建立新存檔」才 create_profile；其他錯誤一律不建檔
 *   - 暱稱與隊伍：只改 canonical 的這兩個欄位、帶 base_rev 整份保存；升級：upgrade_hero（伺服器計費）後唯讀讀回完整存檔
 *   - 版本衝突（409）改用雲端回應的資料，不重送；結果不明（網路）不重送，標記待確認，手動同步（唯讀讀回）前不開下一個寫入
 *   - 換帳號、登出時換新世代，舊帳號遲到的回應不套用；寫入另有自己的 owner（每次寫入一個編號），舊寫入的回應不會解除新寫入的「正在保存」
 *   - 戰鬥結算（照 Godot／後端 v2.9 的規則，獎勵由後端計算）：
 *     - 第一次進入戰鬥時固定這一場（帳號、世代、當時的版本、request_id、battle_id、關卡）；設定不是後端的、關卡不完整、
 *       進度不明、自由演練、未解鎖、隊伍不支援、唯讀、正在保存、有待確認的寫入時不固定，這場不寫入並說明原因
 *     - 戰鬥結束只用引擎回呼的凍結結果（utils/sharedBattleSettlement）建立請求；第一次送出前先把固定的內容暫存到 sessionStorage
 *       （每個帳號一筆，鍵用帳號指紋），讀回同一原文才送；不能暫存就不送
 *     - 只用 save_result 的新契約；後端接受（含 duplicate、base_mismatch）後要唯讀讀回合法的存檔、仍持有 owner 才算已保存並刪除暫存；
 *       結果不明、讀回失敗都留著暫存，畫面說明待確認；只有使用者按「重新確認」才用同一個 request_id、版本與內容原樣再送，不自動重送
 *     - 換帳號、登出只放下畫面，不刪其他帳號的暫存；回到同一帳號時重新顯示待確認；普通同步不會清掉待確認
 *     - 要人工確認（後端無法確認、識別碼內容不同、回應格式不對、暫存無法辨識或確認前被改過）另外留一個綁帳號與 request_id 的標記，
 *       重新整理、同步、換帳號再回來都還在，不能再按「重新確認」；暫存讀不到（瀏覽器的儲存空間不能用）時無法核實，一律阻擋共用寫入
 *   - 匯入覆蓋停用（可以匯出 canonical 備份）
 * - 訪客（guest）：只存在這個瀏覽器自己的 guest 存檔，不連雲端、不碰共用金鑰；規則照 JS 版原本的本機規則
 */

import { create } from "zustand";
import {
  PlayerState,
  PlayerHeroState,
  TeamSlot,
  SyncStatusType,
  BattleRewardResult,
} from "../types/player";
import type { BattleResultData } from "../engine/BattleManager";
import { BUILTIN_HEROES_CONFIG } from "../engine/builtinData";
import { StageDataManager } from "../engine/StageDataManager";
import {
  getNextStage,
  stageToNum,
  getStageDataProblem,
  isStageUnlocked,
} from "../utils/stagePlayability";
import { gameApi, GasError } from "../../shenmaSanguo/api/gameApi";
import {
  CanonicalProfile,
  HeroIdMap,
  SharedHeroConfig,
  buildHeroIdMap,
  patchNickname,
  patchTeam,
  projectSharedProfile,
  upgradeCostOf,
  upgradeGrowthOf,
} from "../utils/sharedProfile";
import {
  classifySettleError,
  classifyWriteError,
  createEpoch,
  interpretSettleResponse,
  revOf,
  SettleRequest,
} from "../utils/sharedProfileSync";
import {
  accountFingerprint,
  ArmedSettle,
  armSettle,
  BlockReason,
  isStageId,
  makePendingEnvelope,
  parsePendingEnvelope,
  prepareSettle,
} from "../utils/sharedBattleSettlement";

/** 共用帳號的金鑰（和 Godot 版相同） */
export const COMPAT_PLAYER_KEY = "shenma_player_key";
/** 舊版 JS 專用的金鑰：不再用來決定帳號，只在登出時清掉 */
export const LOCAL_PLAYER_KEY = "shenma_js_player_key";
/** 舊版 JS 的本機快取前綴：共用帳號不讀也不寫，登出時清掉 session 的部分 */
export const SESSION_SAVE_PREFIX = "shenma_js_session_state_";
export const LOCAL_SAVE_PREFIX = "shenma_js_local_state_";
/** 訪客模式自己的存檔與「目前是訪客」的標記（只在這個瀏覽器、不連雲端） */
export const GUEST_STATE_KEY = "shenma_js_guest_state";
export const GUEST_ACTIVE_KEY = "shenma_js_guest_active";
/** 共用帳號待確認的戰鬥結算（sessionStorage）：每個帳號一筆，鍵用帳號指紋（不存金鑰原文），只存批准的待確認格式 */
export const SETTLE_PENDING_PREFIX = "shenma_js_settle_pending_";
/** 共用帳號要人工確認的標記（sessionStorage）：鍵用帳號指紋，內容只有 request_id 與原因代碼 */
export const SETTLE_REVIEW_PREFIX = "shenma_js_settle_review_";

export type AccountMode = "none" | "shared" | "guest";

/** 共用帳號一場結算在畫面上的狀態 */
export type SharedSettlePhase =
  /** 正在送出或讀回確認 */
  | "saving"
  /** 後端已保存，而且讀回確認了 */
  | "confirmed"
  /** 結果不明或讀回沒有確認：留著暫存，按「重新確認」原樣再送 */
  | "pending"
  /** 這場沒有送出（不符合寫入條件，或後端明確拒絕、沒有寫入） */
  | "not-sent"
  /** 要人工確認（後端無法確認、同一個識別碼內容不同、回應格式不對、暫存無法辨識）；不會自動或用新的識別碼重送 */
  | "review";

export interface SharedSettleView {
  battleId: string;
  phase: SharedSettlePhase;
  /** 給玩家看的短說明 */
  text: string;
  /** 後端這次回應的獎勵（只在這次真的加上時有；之前已保存過的重送沒有） */
  reward?: {
    points: number;
    exp: number;
    leveledUp: boolean;
    newLevel: number;
  } | null;
}

/** 出征時頁面提供的這一場（帳號、世代、版本與 request_id 由 store 固定） */
export interface SharedSortie {
  battleId: string;
  stageId: string;
  /** 這場用的是後端的關卡、武將與敵人設定（不是內建的代用資料） */
  configReady: boolean;
  /** 後端關卡設定裡資料完整的關卡 */
  completeStageIds: ReadonlySet<string>;
  /** 進場時這一關還沒解鎖（只能從自由演練進來）：不寫入 */
  practice: boolean;
}

// 建立訪客的初始資料（只用於訪客模式；共用帳號不使用、不寫入雲端）
export function createDefaultPlayerProfile(
  key: string,
  nickname = "主公"
): PlayerState {
  const heroes: PlayerHeroState[] = BUILTIN_HEROES_CONFIG.map((cfg) => {
    return {
      hero_id: cfg.hero_id,
      level: 1,
      star: 1,
      atk: 100 + (cfg.atk_growth ?? 15),
      def: 50 + (cfg.def_growth ?? 8),
      hp: 1000 + (cfg.hp_growth ?? 100),
    };
  });

  const defaultTeam: TeamSlot[] = [
    { slot: 0, hero_id: "hero_ma_chao" },
    { slot: 1, hero_id: "hero_zhao_yun" },
    { slot: 2, hero_id: "hero_guan_yu" },
    { slot: 3, hero_id: "hero_zhang_fei" },
    { slot: 4, hero_id: "hero_huang_zhong" },
  ];

  return {
    key,
    nickname,
    level: 1,
    exp: 0,
    gold: 1500, // 訪客初始 1500 金幣，方便體驗武將升級（只在本機）
    capacity: 65,
    max_stage: "chapter1_1",
    cleared_stages: {},
    heroes,
    team: defaultTeam,
    serverRev: 1,
    updatedAt: Date.now(),
  };
}

type Result = { success: boolean; error?: string };

interface JsPlayerStoreState {
  /** 畫面用的玩家資料（共用帳號時是顯示投影，不能拿去保存） */
  player: PlayerState | null;
  isLoading: boolean;
  syncStatus: SyncStatusType;
  error: string | null;
  hasCheckedStorage: boolean;

  mode: AccountMode;
  /** 共用帳號：雲端存檔原樣（保存的唯一依據） */
  canonical: CanonicalProfile | null;
  /** 共用帳號：雲端存檔的版本（寫入時當 base_rev） */
  rev: number | null;
  /** 存檔格式不對，只能看 */
  readOnly: boolean;
  /** 雲端的隊伍這裡能完整表示（否則原樣保留，暫停修改與出征） */
  teamEditable: boolean;
  /** 給畫面的說明（衝突、結果不明、不支援的資料等） */
  notice: string | null;
  /** 正在寫入（暱稱、隊伍、升級、建立） */
  busy: boolean;
  /** 上一個寫入結果不明：手動同步（唯讀讀回）前不開下一個寫入 */
  writeBlocked: boolean;
  /** 後端找不到這把金鑰的存檔，等使用者明確建立 */
  pendingCreateKey: string | null;
  /** 後端的武將設定（共用帳號的武將與隊伍 cost 依它） */
  heroesConfig: SharedHeroConfig[];
  /** 存檔裡這裡對照不到或重複的武將（原樣保留、不可編輯） */
  lockedHeroIds: string[];
  /** 共用帳號：這場出征已固定、結算還沒完成（期間不開其他共用寫入） */
  settleArmed: boolean;
  /** 共用帳號：這場出征為什麼不寫入共用進度（第一次進入戰鬥時決定） */
  sortieNote: string | null;
  /** 共用帳號：最近一場結算的狀態（結算視窗與待確認提示用） */
  settleView: SharedSettleView | null;
  /**
   * 共用帳號：這個分頁暫存著一筆待確認的結算（重新整理後仍在）。status：
   * pending 可以按「重新確認」原樣再送；review 要人工確認，不能重送；unavailable 是暫存讀不到、無法核實。三種都阻擋其他共用寫入
   */
  pendingSettle: {
    battleId: string;
    stageId: string;
    status: "pending" | "review" | "unavailable";
  } | null;

  // 帳號與登入
  init: () => Promise<void>;
  loginWithKey: (
    key: string
  ) => Promise<{ success: boolean; error?: string; needsCreate?: boolean }>;
  createProfile: (key: string, nickname: string) => Promise<Result>;
  startGuestMode: () => Promise<void>;
  logout: () => void;
  updateNickname: (nickname: string) => Promise<Result>;

  // 隊伍與武將養成
  updateTeam: (team: TeamSlot[]) => Promise<Result>;
  /** 舊介面（同步）：訪客在本機升級；共用帳號要等伺服器，請用 requestHeroUpgrade */
  upgradeHero: (heroId: string) => {
    success: boolean;
    error?: string;
    cost?: number;
  };
  /** 共用帳號：伺服器升級（upgrade_hero）並讀回；訪客：本機升級 */
  requestHeroUpgrade: (
    heroId: string
  ) => Promise<{ success: boolean; error?: string; cost?: number }>;
  /** 升級預覽（只給畫面看）：共用帳號照後端武將設定與伺服器的費用公式；訪客照本機規則；不支援的武將回 null */
  upgradePreview: (
    heroId: string
  ) => { cost: number | null; atk: number; def: number; hp: number } | null;
  /** 共用帳號：這位武將在後端設定的 cost（隊伍容量用）；訪客或查不到時回 null */
  heroCostOf: (heroId: string) => number | null;

  // 戰鬥結算與進度推進
  /** 訪客的本機結算（共用帳號用 armSharedSettle／settleSharedBattle） */
  settleBattle: (
    stageId: string,
    baseHp: number,
    maxHp: number
  ) => BattleRewardResult;
  /** 共用帳號：第一次進入戰鬥時固定這一場；不符合寫入條件時回 false，sortieNote 說明原因 */
  armSharedSettle: (sortie: SharedSortie) => boolean;
  /** 換關、重新載入關卡時放下還沒結束的這一場 */
  disarmSharedSettle: () => void;
  /** 共用帳號：戰鬥結束（引擎回呼的凍結結果）→ 暫存 → 送出 → 讀回確認 */
  settleSharedBattle: (r: BattleResultData) => Promise<void>;
  /** 共用帳號：使用者明確按「重新確認」：先讀回雲端存檔，再用暫存的同一個請求原樣再送 */
  retrySharedSettle: () => Promise<Result>;

  // 雲端同步與備份
  /** 共用帳號：唯讀讀回雲端存檔（確認結果不明的寫入、取得最新版本）；不寫入 */
  forceSync: () => Promise<Result>;
  exportBackup: () => string;
  importBackup: (jsonStr: string) => Result;
}

const epoch = createEpoch();
let idMap: HeroIdMap = buildHeroIdMap([], []);
/** 寫入的編號（每次寫入一個，不重複） */
let writerSeq = 0;
/** 目前「正在保存」是哪一次寫入（0＝沒有）：舊寫入的回應（不論是否同一個世代）都不會解除新寫入的狀態 */
let busyOwner = 0;
/** 共用帳號：已固定、還沒結算的這一場（只在記憶體，不跨分頁） */
let armed: { a: ArmedSettle; sortie: SharedSortie } | null = null;
/** 已處理過結果回呼的 battle_id（同一場的重複回呼不會產生第二個請求） */
let handledBattleIds = new Set<string>();

/**
 * 換世代（登入、切換、建立、訪客、登出、初始化）：放下這個分頁記憶體裡的出征；暫存的待確認結算不刪。
 * resetOwner：一併放下寫入的 owner（登入要等讀到新帳號才放下，讀取失敗時舊帳號的寫入仍可自己結束）
 */
function nextEpoch(resetOwner = true): number {
  armed = null;
  handledBattleIds = new Set();
  if (resetOwner) busyOwner = 0;
  return epoch.next();
}

const pendingKeyOf = (key: string) =>
  SETTLE_PENDING_PREFIX + accountFingerprint(key);
/** sessionStorage：讀取時沒有是 null、儲存空間不能用是 undefined；寫入要讀回同一原文才算成功 */
const ss = {
  get(k: string): string | null | undefined {
    try {
      return typeof window === "undefined"
        ? undefined
        : sessionStorage.getItem(k);
    } catch {
      return undefined;
    }
  },
  put(k: string, v: string): boolean {
    try {
      if (typeof window === "undefined") return false;
      sessionStorage.setItem(k, v);
      if (sessionStorage.getItem(k) === v) return true;
      sessionStorage.removeItem(k);
      return false;
    } catch {
      return false;
    }
  },
  del(k: string) {
    try {
      if (typeof window !== "undefined") sessionStorage.removeItem(k);
    } catch {
      /* 刪不掉時下次讀到仍是待確認 */
    }
  },
};

type PendingRead =
  | { kind: "none" }
  | { kind: "unavailable" }
  | {
      kind: "ok";
      /** 暫存的原文（重新確認前後逐字比對） */
      raw: string;
      request: SettleRequest;
      stageId: string;
      battleId: string;
    }
  | { kind: "bad"; detail: string };

/** 這個帳號在這個分頁暫存的待確認結算（解析不符一律當成要人工確認） */
function readPending(key: string): PendingRead {
  const raw = ss.get(pendingKeyOf(key));
  if (raw === undefined) return { kind: "unavailable" };
  if (raw === null) return { kind: "none" };
  const p = parsePendingEnvelope(raw, key);
  return p.ok
    ? {
        kind: "ok",
        raw,
        request: p.request,
        stageId: p.stageId,
        battleId: p.battleId,
      }
    : { kind: "bad", detail: p.detail };
}

const reviewKeyOf = (key: string) =>
  SETTLE_REVIEW_PREFIX + accountFingerprint(key);
/** 人工確認的標記寫不進去時，這個頁面的記憶體仍然擋住（重新整理後由送出中的標記擋住） */
const reviewInMemory = new Set<string>();
/** 送出中的標記：送出前寫下，只有確定可以安全回到待確認時才解除；重新整理後還在就是要人工確認 */
const SENDING = "SENDING";
/** 這個頁面正在送出（含送出後的讀回）的 request_id */
const sendingIds = new Set<string>();

/** 寫標記（綁帳號與 request_id；不存金鑰或存檔內容）：讀回同一原文才算；寫不進去時不刪掉原本的標記 */
function writeMarker(key: string, requestId: string, code: string): boolean {
  const v = JSON.stringify({ v: 1, requestId, code });
  try {
    if (typeof window === "undefined") return false;
    sessionStorage.setItem(reviewKeyOf(key), v);
    return sessionStorage.getItem(reviewKeyOf(key)) === v;
  } catch {
    return false;
  }
}

/** 標記的內容是不是這個 request_id 送出中的標記 */
function isSendingMark(raw: string | null | undefined, requestId: string) {
  if (typeof raw !== "string") return false;
  try {
    const m = JSON.parse(raw) as { requestId?: unknown; code?: unknown };
    return m.requestId === requestId && m.code === SENDING;
  } catch {
    return false;
  }
}

/** 標記這個帳號的這一場要人工確認：寫不進去時這個頁面的記憶體擋住，送出中的標記也還在 */
function markReview(key: string, requestId: string, code: string) {
  if (!writeMarker(key, requestId, code))
    reviewInMemory.add(accountFingerprint(key));
}

/** 送出前：寫下送出中的標記；寫不進去就不送 */
function beginSending(key: string, requestId: string): boolean {
  sendingIds.add(requestId);
  if (writeMarker(key, requestId, SENDING)) return true;
  sendingIds.delete(requestId);
  return false;
}

/**
 * 送出結束：clear＝確定可以安全回到待確認（或已確認、已拒絕）時才解除送出中的標記。
 * 標記已改成人工確認就不動；讀不到時照樣刪（這段期間只有這次送出會寫這個帳號的標記）
 */
function endSending(key: string, requestId: string, clear: boolean) {
  sendingIds.delete(requestId);
  if (!clear) return;
  const raw = ss.get(reviewKeyOf(key));
  if (raw === undefined || isSendingMark(raw, requestId))
    ss.del(reviewKeyOf(key));
}

/**
 * 這個帳號待確認的狀態：暫存或標記讀不到 → unavailable；有人工確認標記、沒有在這個頁面送出中的送出中標記、
 * 或暫存無法辨識 → review；暫存合法 → pending；都沒有 → null
 */
function pendingStateOf(key: string): JsPlayerStoreState["pendingSettle"] {
  const mark = ss.get(reviewKeyOf(key));
  const r = readPending(key);
  if (mark === undefined || r.kind === "unavailable")
    return { battleId: "", stageId: "", status: "unavailable" };
  const ids =
    r.kind === "ok"
      ? { battleId: r.battleId, stageId: r.stageId }
      : { battleId: "", stageId: "" };
  const sendingHere =
    r.kind === "ok" &&
    sendingIds.has(r.request.requestId) &&
    isSendingMark(mark, r.request.requestId);
  if (
    (mark !== null && !sendingHere) ||
    r.kind === "bad" ||
    reviewInMemory.has(accountFingerprint(key))
  )
    return { ...ids, status: "review" };
  if (r.kind === "ok") return { ...ids, status: "pending" };
  return null;
}

/** 一場結算的識別碼（最多 100 字；同一場固定不變） */
function newRequestId(): string {
  let rand = Math.random().toString(36).slice(2, 12);
  try {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const b = new Uint32Array(2);
      crypto.getRandomValues(b);
      rand = `${b[0].toString(36)}${b[1].toString(36)}`;
    }
  } catch {
    /* 用上面的亂數 */
  }
  return `js-${Date.now().toString(36)}-${rand}`;
}

/** 這場不寫入的原因（給玩家的短說明） */
const BLOCK_TEXT: Record<BlockReason, string> = {
  "not-shared": "目前不是共用帳號",
  "account-changed": "出征後換了帳號",
  "stale-epoch": "出征後重新載入了帳號",
  "read-only": "雲端存檔目前只能查看",
  busy: "正在保存其他資料",
  "write-blocked": "上一個保存的結果待確認",
  "team-unsupported": "雲端的出征隊伍這裡還不支援",
  "config-not-ready": "後端的關卡或武將設定還沒讀到",
  "unknown-stage": "後端設定裡沒有這一關的完整資料",
  "bad-progress": "雲端進度的格式不明",
  practice: "這是自由演練",
  "locked-stage": "這一關還沒解鎖",
  "wrong-battle": "結果不是出征時固定的這一場",
  "bad-result": "這場的結果資料不完整",
};

const ls = {
  get(k: string): string | null {
    try {
      return typeof window === "undefined" ? null : localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k: string, v: string) {
    try {
      if (typeof window !== "undefined") localStorage.setItem(k, v);
    } catch {
      /* 儲存空間不能用時只影響訪客存檔 */
    }
  },
  del(k: string) {
    try {
      if (typeof window !== "undefined") localStorage.removeItem(k);
    } catch {
      /* 同上 */
    }
  },
};

function loadGuest(): PlayerState | null {
  const raw = ls.get(GUEST_STATE_KEY);
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as PlayerState;
    return p && typeof p.key === "string" && Array.isArray(p.heroes) ? p : null;
  } catch {
    return null;
  }
}
const saveGuest = (p: PlayerState) =>
  ls.set(GUEST_STATE_KEY, JSON.stringify(p));

const ERROR_TEXT: Record<string, string> = {
  GOLD_NOT_ENOUGH: "點數不足",
  PROFILE_NOT_FOUND: "雲端找不到這份存檔",
  DATA_CORRUPT: "雲端存檔損毀",
  INVALID_DATA: "存檔格式不符合後端規則",
  DATA_TOO_LARGE: "存檔太大",
  BAD_BASE_REV: "版本號格式不對",
  BASE_REV_REQUIRED: "後端要求版本號",
  HERO_CONFIG_NOT_FOUND: "後端找不到這位武將的設定",
  KEY_ALREADY_EXISTS: "這把金鑰已經有存檔",
  BUSY: "伺服器忙碌中",
};
const errorText = (code: string) => ERROR_TEXT[code] ?? code;

export const useJsPlayerStore = create<JsPlayerStoreState>((set, get) => {
  /** 後端武將設定（共用帳號第一次需要時讀取；讀不到時對照表是空的，武將與隊伍不可編輯） */
  async function ensureHeroesConfig(token: number): Promise<boolean> {
    if (get().heroesConfig.length > 0) return true;
    try {
      const res = await gameApi.getHeroesConfig({
        active: () => epoch.isCurrent(token),
      });
      const heroes = Array.isArray(res.heroes)
        ? (res.heroes as unknown[]).filter(
            (h): h is SharedHeroConfig =>
              !!h &&
              typeof h === "object" &&
              typeof (h as { hero_id?: unknown }).hero_id === "string"
          )
        : [];
      if (!epoch.isCurrent(token) || heroes.length === 0) return false;
      idMap = buildHeroIdMap(
        heroes.map((h) => h.hero_id),
        BUILTIN_HEROES_CONFIG.map((c) => c.hero_id)
      );
      set({ heroesConfig: heroes });
      return true;
    } catch {
      return false;
    }
  }

  /** 套用雲端的存檔（原樣）與版本到畫面 */
  function applyProfile(
    key: string,
    data: unknown,
    rev: number | null,
    configOk: boolean
  ) {
    const proj = projectSharedProfile(
      key,
      data,
      rev,
      get().heroesConfig,
      idMap
    );
    const readOnly = proj.readOnly || !configOk || rev === null;
    const notices: string[] = [];
    if (proj.readOnly)
      notices.push("雲端存檔的格式這裡無法安全處理：可以查看，但不會寫入。");
    if (!configOk)
      notices.push("武將設定讀不到：暫時只能查看，請稍後手動同步。");
    if (rev === null)
      notices.push("雲端存檔的版本不明：暫時不能保存，請稍後手動同步。");
    if (proj.teamNote) notices.push(proj.teamNote);
    if (proj.lockedHeroIds.length > 0) {
      notices.push(
        `存檔另有 ${proj.lockedHeroIds.length} 位武將這裡不能顯示（這裡還不支援，或同一位有重複的紀錄）：原樣保留，不能在這裡升級或出征。`
      );
    }
    // 讀回不會清掉待確認的結算：暫存還在就照樣待確認（普通同步、手動同步都一樣）
    const pendingSettle = pendingStateOf(key);
    if (pendingSettle?.status === "unavailable")
      notices.push(
        "這個分頁的暫存讀不到，無法確認有沒有待確認的戰鬥結算：暫時不會寫入共用存檔。"
      );
    else if (pendingSettle?.status === "review")
      notices.push(
        "有一場戰鬥結算要人工確認：不會自動或用新的識別碼重送，確認前不會寫入其他資料。"
      );
    else if (pendingSettle)
      notices.push(
        "有一場戰鬥結算待確認（可能已經保存）：請按「重新確認」原樣再送，確認前不會寫入其他資料。"
      );
    set({
      pendingSettle,
      mode: "shared",
      player: proj.display,
      canonical:
        data && typeof data === "object" && !Array.isArray(data)
          ? (data as CanonicalProfile)
          : null,
      rev,
      readOnly,
      teamEditable: proj.teamEditable && !readOnly,
      lockedHeroIds: proj.lockedHeroIds,
      notice: notices.length ? notices.join(" ") : null,
      syncStatus: readOnly ? "readonly" : "idle",
      writeBlocked: false,
      pendingCreateKey: null,
      isLoading: false,
      hasCheckedStorage: true,
      error: null,
    });
  }

  type LoadResult =
    /** 讀到並套用到畫面；rev 不是合法版本時是 null（畫面已改成唯讀） */
    | { kind: "ok"; rev: number | null }
    /** 讀到的版本比畫面上的舊（同一個帳號較早的讀取）：不套用，畫面已是較新的版本 */
    | { kind: "older" }
    | { kind: "missing" }
    | { kind: "error"; message: string }
    /** 讀取期間換了世代（切換帳號、登出、重新載入）：不套用 */
    | { kind: "stale" };

  /** 讀回確認了雲端的資料與合法版本（寫入之後的確認用） */
  const confirmed = (r: LoadResult) =>
    (r.kind === "ok" && r.rev !== null) || r.kind === "older";

  /** 唯讀讀取共用存檔並套用（不寫入任何東西） */
  async function loadShared(
    key: string,
    token: number,
    foreground: boolean
  ): Promise<LoadResult> {
    const [cfgOk, prof] = await Promise.all([
      ensureHeroesConfig(token),
      gameApi
        .getProfile(key, { active: () => epoch.isCurrent(token), foreground })
        .then((body) => ({ ok: true as const, body }))
        .catch((e: unknown) => ({ ok: false as const, e })),
    ]);
    if (!epoch.isCurrent(token)) return { kind: "stale" };
    if (!prof.ok) {
      if (prof.e instanceof GasError && prof.e.message === "PROFILE_NOT_FOUND")
        return { kind: "missing" };
      const code = prof.e instanceof Error ? prof.e.message : "UNKNOWN";
      return {
        kind: "error",
        message: `讀取雲端存檔失敗（${errorText(code)}），沒有建立或修改任何資料。`,
      };
    }
    const incoming = revOf(prof.body.rev);
    const cur = get();
    // 同一個帳號較舊的讀取（版本比畫面上的舊，例如保存的回應先回來）不蓋掉較新的資料
    if (
      cur.mode === "shared" &&
      cur.player?.key === key &&
      cur.rev !== null &&
      incoming !== null &&
      incoming < cur.rev
    ) {
      return { kind: "older" };
    }
    applyProfile(key, prof.body.data, incoming, cfgOk);
    return { kind: "ok", rev: incoming };
  }

  /** 一次寫入：帳號、開始時的世代與這次寫入的 owner 編號 */
  type W = { key: string; token: number; op: number };

  /** 開始一個寫入（記下開始的世代與這次的 owner） */
  function beginWrite(key: string): W {
    const w = { key, token: epoch.current(), op: ++writerSeq };
    busyOwner = w.op;
    set({ busy: true, syncStatus: "syncing", notice: null });
    return w;
  }

  /** 每次 await 之後：世代沒變、而且仍是這次寫入持有「正在保存」 */
  const alive = (w: W) => epoch.isCurrent(w.token) && busyOwner === w.op;

  /** 寫入結束：只有這次寫入仍持有時才解除「正在保存」，並一起更新同步狀態與說明 */
  function endWrite(w: W, patch: Partial<JsPlayerStoreState> = {}) {
    if (busyOwner !== w.op) return;
    busyOwner = 0;
    set({ busy: false, ...patch });
  }

  /** 寫入的結果沒有確認：標記待確認，手動同步（唯讀讀回）前不開下一個寫入；不重送 */
  function unknownWrite(w: W, label: string, why: string): Result {
    endWrite(w, {
      syncStatus: "unknown",
      writeBlocked: true,
      notice: `${label}的結果待確認（${why}）：請按「手動同步」確認雲端的資料，確認前不會再寫入。`,
    });
    return {
      success: false,
      error: `${label}的結果待確認，請先手動同步確認`,
    };
  }

  /**
   * 寫入的回應回來時已換了世代（切換帳號、重新載入）或已不是這次寫入持有：結果不套用。
   * 仍持有時：畫面還是同一個帳號時結果不明，要手動同步確認；已換成其他帳號時只結束「正在保存」。
   * 已不持有（新的寫入或新帳號）時什麼都不改
   */
  function staleWrite(w: W): Result {
    if (busyOwner === w.op) {
      busyOwner = 0;
      const s = get();
      if (s.mode === "shared" && s.player?.key === w.key) {
        set({
          busy: false,
          syncStatus: "unknown",
          writeBlocked: true,
          notice:
            "剛才的保存在重新讀取時中斷，結果不明：請按「手動同步」確認，確認前不會再寫入。",
        });
      } else {
        set({ busy: false });
      }
    }
    return { success: false, error: "帳號已切換，這次的結果不套用" };
  }

  /**
   * 寫入或固定出征前：重新讀這個帳號的暫存與標記（登入後儲存空間可能變成讀不到或被改過），不只用登入時的快取；
   * 和畫面上的不同時只更新待確認狀態（不重新套用存檔，不會解除其他待確認）
   */
  function recheckPending(key: string): JsPlayerStoreState["pendingSettle"] {
    const now = pendingStateOf(key);
    if (JSON.stringify(now) !== JSON.stringify(get().pendingSettle))
      set({ pendingSettle: now });
    return now;
  }

  function guardWrite(): string | null {
    const s = get();
    if (s.mode !== "shared" || !s.player || !s.canonical)
      return "尚未登入共用帳號";
    if (s.busy) return "正在保存，請稍候";
    if (armed) return "出征中：這場結算完成前不能修改共用存檔";
    const pend = recheckPending(s.player.key);
    if (pend)
      return pend.status === "unavailable"
        ? "瀏覽器的暫存讀不到，暫時不能寫入"
        : pend.status === "review"
          ? "有一場戰鬥結算要人工確認，確認前不能寫入"
          : "有一場戰鬥結算待確認：請先按「重新確認」";
    if (s.writeBlocked)
      return "上一個保存的結果不明：請先按「手動同步」確認雲端的資料";
    if (s.readOnly) return "雲端存檔目前只能查看，不能寫入";
    if (revOf(s.rev) === null) return "雲端存檔的版本不明，暫時不能保存";
    return null;
  }

  /**
   * 寫入失敗的處理（每次 await 之後都重新核世代與 owner；換了世代或不再持有就交給 staleWrite，不碰新帳號或新寫入的狀態）：
   * - 衝突：回應附了雲端的資料與合法版本就改用；沒附就唯讀讀回，讀到才改用，讀不到標記待確認
   * - 確定沒寫入的拒絕：說明原因
   * - 其他（網路、平台錯誤、SERVER_ERROR 等）：結果不明，標記待確認
   */
  async function handleWriteFailure(
    e: unknown,
    w: W,
    label: string
  ): Promise<Result> {
    const f = classifyWriteError(e);
    if (!alive(w)) return staleWrite(w);
    const key = w.key;
    if (f.kind === "conflict") {
      const notice = `雲端已有較新的存檔（可能在另一個分頁或 Godot 版改過）：已改用雲端的資料，剛才的${label}沒有保存。`;
      const fail: Result = {
        success: false,
        error: `雲端已有較新的存檔，剛才的${label}沒有保存`,
      };
      if (
        f.serverRev !== null &&
        f.serverData &&
        typeof f.serverData === "object" &&
        !Array.isArray(f.serverData)
      ) {
        applyProfile(
          key,
          f.serverData,
          f.serverRev,
          get().heroesConfig.length > 0
        );
        endWrite(w, { syncStatus: "conflict", notice });
        return fail;
      }
      const r = await loadShared(key, w.token, false);
      if (r.kind === "stale" || !alive(w)) return staleWrite(w);
      if (confirmed(r)) {
        endWrite(w, { syncStatus: "conflict", notice });
        return fail;
      }
      endWrite(w, {
        syncStatus: "unknown",
        writeBlocked: true,
        notice: `雲端已有較新的存檔，剛才的${label}沒有保存；但讀回雲端的資料失敗：請按「手動同步」確認，確認前不會再寫入。`,
      });
      return fail;
    }
    if (f.kind === "rejected") {
      const detail =
        f.code === "GOLD_NOT_ENOUGH" && typeof f.response.required === "number"
          ? `點數不足：需要 ${f.response.required}，目前 ${String(f.response.current)}`
          : errorText(f.code);
      endWrite(w, {
        syncStatus: "error",
        notice: `${label}沒有保存：${detail}`,
      });
      return { success: false, error: detail };
    }
    return unknownWrite(
      w,
      label,
      `網路、伺服器錯誤或沒有回應：${errorText(f.reason)}`
    );
  }

  /** 帶 base_rev 整份保存 canonical 的副本（只改過明列的欄位） */
  async function writeProfile(
    data: CanonicalProfile,
    label: string
  ): Promise<Result> {
    const s = get();
    const key = s.player!.key;
    const rev = s.rev as number;
    const w = beginWrite(key);
    let res: Record<string, unknown>;
    try {
      res = await gameApi.saveProfile(key, data, rev);
    } catch (e) {
      return handleWriteFailure(e, w, label);
    }
    if (!alive(w)) return staleWrite(w);
    const newRev = revOf(res.rev);
    if (newRev !== null) {
      applyProfile(key, data, newRev, get().heroesConfig.length > 0);
      endWrite(w);
      return { success: true };
    }
    // 保存的回應沒有合法的新版本：唯讀讀回確認；確認前不算保存成功、不開下一個寫入、不重送
    const r = await loadShared(key, w.token, false);
    if (r.kind === "stale" || !alive(w)) return staleWrite(w);
    if (confirmed(r)) {
      endWrite(w);
      return { success: true };
    }
    return unknownWrite(w, label, "保存的回應沒有版本，讀回也沒有確認");
  }

  // ── 訪客（只在本機） ──
  function guestUpdate(updated: PlayerState) {
    const p = { ...updated, updatedAt: Date.now() };
    saveGuest(p);
    set({ player: p, syncStatus: "offline" });
  }

  function guestUpgrade(heroId: string): {
    success: boolean;
    error?: string;
    cost?: number;
  } {
    const { player } = get();
    if (!player) return { success: false, error: "尚未登入" };
    const heroIndex = player.heroes.findIndex((h) => h.hero_id === heroId);
    if (heroIndex === -1) return { success: false, error: "查無此武將" };
    const hero = player.heroes[heroIndex];
    const cost = 100 * hero.level;
    if (player.gold < cost) {
      return {
        success: false,
        error: `金幣不足！升級需 ${cost} 金幣，當前僅有 ${player.gold}`,
      };
    }
    const cfg = BUILTIN_HEROES_CONFIG.find((c) => c.hero_id === heroId);
    const newHeroes = [...player.heroes];
    newHeroes[heroIndex] = {
      ...hero,
      level: hero.level + 1,
      atk: hero.atk + (cfg?.atk_growth ?? 15),
      def: hero.def + (cfg?.def_growth ?? 8),
      hp: hero.hp + (cfg?.hp_growth ?? 100),
    };
    guestUpdate({ ...player, gold: player.gold - cost, heroes: newHeroes });
    return { success: true, cost };
  }

  function guestSettle(
    stageId: string,
    baseHp: number,
    maxHp: number
  ): BattleRewardResult {
    const player = get().player as PlayerState;
    const hpRatio = baseHp / maxHp;
    let stars = 1;
    if (hpRatio >= 1.0) stars = 3;
    else if (hpRatio >= 0.5) stars = 2;
    const stageNum = stageToNum(stageId);
    const chapter = Math.floor(stageNum / 100) || 1;
    const stageIdx = stageNum % 100 || 1;
    const chapterMult = Math.max(1, (chapter - 1) * 10 + stageIdx);
    const expEarned = 100 * chapterMult;
    const goldEarned = 200 * chapterMult;
    let currentExp = player.exp + expEarned;
    let currentLevel = player.level;
    let currentCapacity = player.capacity;
    let leveledUp = false;
    const expNeeded = currentLevel * 250;
    if (currentExp >= expNeeded) {
      currentLevel += 1;
      currentExp -= expNeeded;
      currentCapacity += 5;
      leveledUp = true;
    }
    const currentStars = player.cleared_stages[stageId] ?? 0;
    const newClearedStages = {
      ...player.cleared_stages,
      [stageId]: Math.max(currentStars, stars),
    };
    let nextStageId = player.max_stage;
    let stageUnlocked: string | undefined = undefined;
    if (stageId === player.max_stage) {
      const nextCandidateId = getNextStage(stageId);
      const nextStageObj =
        StageDataManager.getInstance().getStageById(nextCandidateId);
      if (nextStageObj && !getStageDataProblem(nextStageObj)) {
        nextStageId = nextCandidateId;
        stageUnlocked = nextStageObj.name;
      }
    }
    guestUpdate({
      ...player,
      exp: currentExp,
      level: currentLevel,
      gold: player.gold + goldEarned,
      capacity: currentCapacity,
      max_stage: nextStageId,
      cleared_stages: newClearedStages,
    });
    return {
      stars,
      expEarned,
      goldEarned,
      leveledUp,
      newLevel: currentLevel,
      stageUnlocked,
    };
  }

  // ── 共用帳號的戰鬥結算 ──

  /** 出征時就能判斷的不寫入原因（null＝可以固定這一場） */
  function sortieBlockReason(s: JsPlayerStoreState, sortie: SharedSortie) {
    const c = s.canonical;
    if (s.readOnly || !c) return BLOCK_TEXT["read-only"];
    if (revOf(s.rev) === null) return "雲端存檔的版本不明";
    if (s.busy) return BLOCK_TEXT.busy;
    const pend = recheckPending(s.player!.key);
    if (pend)
      return pend.status === "unavailable"
        ? "瀏覽器不能暫存這場結算"
        : "還有一場結算待確認";
    if (s.writeBlocked) return BLOCK_TEXT["write-blocked"];
    if (!s.teamEditable) return BLOCK_TEXT["team-unsupported"];
    if (!sortie.configReady || s.heroesConfig.length === 0)
      return BLOCK_TEXT["config-not-ready"];
    if (!sortie.completeStageIds.has(sortie.stageId))
      return BLOCK_TEXT["unknown-stage"];
    if (!isStageId(c.max_stage)) return BLOCK_TEXT["bad-progress"];
    if (sortie.practice) return BLOCK_TEXT.practice;
    if (
      !isStageUnlocked(
        sortie.stageId,
        c.max_stage,
        c.cleared_stages as Record<string, number> | undefined
      )
    )
      return BLOCK_TEXT["locked-stage"];
    return null;
  }

  /** 暫存改變後重新整理畫面的說明與待確認狀態（只對畫面上的同一個帳號） */
  function refreshPending(key: string) {
    const s = get();
    if (s.mode === "shared" && s.player?.key === key && s.canonical)
      applyProfile(key, s.canonical, s.rev, s.heroesConfig.length > 0);
  }

  const view = (
    battleId: string,
    phase: SharedSettlePhase,
    text: string,
    reward: SharedSettleView["reward"] = null
  ): SharedSettleView => ({ battleId, phase, text, reward });

  /** 這次的獎勵：只取後端回應裡的點數與經驗（不在本機另算） */
  function rewardOf(
    res: Record<string, unknown>,
    levelBefore: number
  ): SharedSettleView["reward"] {
    const r = res.reward as Record<string, unknown> | undefined;
    const points = r && typeof r.points === "number" ? r.points : null;
    const exp = r && typeof r.exp === "number" ? r.exp : null;
    if (points === null || exp === null) return null;
    const lv = Number(get().canonical?.level);
    const newLevel = Number.isFinite(lv) ? lv : levelBefore;
    return { points, exp, leveledUp: newLevel > levelBefore, newLevel };
  }

  /**
   * 送出暫存的這一場（第一次與「重新確認」共用；呼叫前已用 beginSending 寫下送出中的標記）：
   * 只用 save_result 新契約、同一個 request_id／base_rev／內容；每次 await 後核世代與 owner；
   * 後端接受後一定唯讀讀回合法的存檔，仍持有 owner 才算已保存並刪除暫存。
   * 換了帳號或不再持有時，回應仍先分類：要人工確認的記到原帳號的標記，其他才回到待確認；不改新帳號的畫面與 owner
   */
  async function sendSettle(
    key: string,
    request: SettleRequest,
    battleId: string
  ): Promise<Result> {
    const levelBefore = Number(get().canonical?.level) || 1;
    const rid = request.requestId;
    const w = beginWrite(key);
    set({ settleView: view(battleId, "saving", "正在保存這場結算…") });
    const keep = (phase: SharedSettlePhase, text: string): Result => {
      // 留著暫存：之後只能按「重新確認」原樣再送（結果不明、讀回沒有確認）或人工確認
      endSending(key, rid, phase === "pending");
      refreshPending(key);
      const now = pendingStateOf(key);
      if (phase === "pending" && now?.status !== "pending") {
        // 送出中的標記解除不了或暫存讀不到：不能當成可以重新確認
        phase = "review";
        text =
          now?.status === "unavailable"
            ? "結果不明，而且這個分頁的暫存讀不到：不會自動重送，暫時不會寫入共用存檔。"
            : "結果不明，而且送出狀態無法更新：要人工確認，不會自動重送。";
      }
      endWrite(w, {
        settleView: view(battleId, phase, text),
        syncStatus: "unknown",
      });
      return { success: false, error: text };
    };
    const review = (code: string, text: string): Result => {
      markReview(key, rid, code);
      return keep("review", text);
    };
    const stale = (reviewCode: string | null): Result => {
      // 已換帳號或不再持有：要人工確認的記到這個帳號的標記，其他回到待確認（回到這個帳號時再確認）；
      // 不改新帳號或新寫入的畫面、存檔與 owner
      if (reviewCode) markReview(key, rid, reviewCode);
      endSending(key, rid, !reviewCode);
      const s = get();
      if (s.mode === "shared" && s.player?.key === key)
        set({ pendingSettle: pendingStateOf(key) });
      if (busyOwner === w.op) {
        busyOwner = 0;
        set({ busy: false });
      }
      return { success: false, error: "帳號已切換，這次的結果不套用" };
    };
    let res: Record<string, unknown>;
    try {
      res = await gameApi.saveResult(
        key,
        request.payload,
        request.requestId,
        request.baseRev,
        true
      );
    } catch (e) {
      const f = classifySettleError(e);
      if (!alive(w)) return stale(f.kind === "needs-review" ? f.code : null);
      if (f.kind === "needs-review")
        return review(
          f.code,
          f.code === "RESULT_UNKNOWN"
            ? "後端無法確認這場是否已處理：要人工確認，不會自動重送。"
            : "這場的識別碼在後端對應到不同的內容：要人工確認，不會自動重送。"
        );
      if (f.kind === "rejected" && f.code !== "BUSY") {
        // 後端明確拒絕而且一定沒有寫入：這場不會再送，刪除暫存
        ss.del(pendingKeyOf(key));
        endSending(key, rid, true);
        refreshPending(key);
        endWrite(w, {
          settleView: view(
            battleId,
            "not-sent",
            `後端拒絕這場結算（${errorText(f.code)}），沒有寫入共用進度。`
          ),
          syncStatus: "error",
        });
        return { success: false, error: errorText(f.code) };
      }
      return keep(
        "pending",
        `結果不明（${f.kind === "rejected" ? errorText(f.code) : "網路或伺服器錯誤"}）：可能已經保存，請按「重新確認」原樣再送一次。`
      );
    }
    const out = interpretSettleResponse(res, request);
    if (!alive(w))
      return stale(out.kind === "contract-missing" ? "CONTRACT_MISSING" : null);
    if (out.kind === "contract-missing")
      return review(
        "CONTRACT_MISSING",
        "後端的回應不是這個版本的結算格式：要人工確認，不會自動重送。"
      );
    // 後端已處理（第一次、之前已處理、或送出後雲端被改過）：唯讀讀回才算確認；回應裡的 after 不直接覆蓋
    const r = await loadShared(key, w.token, false);
    if (r.kind === "stale" || !alive(w)) return stale(null);
    const minRev =
      out.kind === "applied" || (out.kind === "duplicate" && out.rev !== null)
        ? out.rev
        : null;
    // 讀回要是合法的存檔（有版本、格式可以安全處理、設定讀得到），不只是有版本
    const now = get();
    if (
      r.kind !== "ok" ||
      r.rev === null ||
      (minRev !== null && r.rev < minRev) ||
      now.readOnly ||
      !now.canonical
    )
      return keep(
        "pending",
        "後端已回應，但讀回雲端存檔沒有確認：這場結算待確認，請按「重新確認」原樣再送一次。"
      );
    ss.del(pendingKeyOf(key));
    endSending(key, rid, true);
    refreshPending(key);
    const again =
      out.kind === "duplicate" ||
      (out.kind === "applied-reread" && out.duplicate);
    endWrite(w, {
      settleView: view(
        battleId,
        "confirmed",
        again ? "這場之前已經保存過，這次沒有另外增加。" : "已保存到共用進度。",
        again ? null : rewardOf(res, levelBefore)
      ),
    });
    return { success: true };
  }

  const clearedState = {
    player: null,
    mode: "none" as AccountMode,
    canonical: null,
    rev: null,
    readOnly: false,
    teamEditable: true,
    notice: null,
    busy: false,
    writeBlocked: false,
    lockedHeroIds: [],
    settleArmed: false,
    sortieNote: null,
    settleView: null,
    pendingSettle: null,
  };

  return {
    ...clearedState,
    isLoading: false,
    syncStatus: "idle",
    error: null,
    hasCheckedStorage: false,
    pendingCreateKey: null,
    heroesConfig: [],

    // 初始化：訪客標記 → 訪客；否則有共用金鑰就唯讀讀取雲端存檔；都沒有就等使用者登入
    init: async () => {
      if (typeof window === "undefined") return;
      const token = nextEpoch();
      if (ls.get(GUEST_ACTIVE_KEY) === "1") {
        const guest = loadGuest();
        if (guest) {
          set({
            ...clearedState,
            mode: "guest",
            player: guest,
            syncStatus: "offline",
            hasCheckedStorage: true,
            isLoading: false,
          });
          return;
        }
      }
      const key = ls.get(COMPAT_PLAYER_KEY);
      if (!key) {
        set({ ...clearedState, isLoading: false, hasCheckedStorage: true });
        return;
      }
      set({ ...clearedState, isLoading: true, error: null });
      const r = await loadShared(key, token, true);
      if (r.kind === "missing") {
        set({
          ...clearedState,
          isLoading: false,
          hasCheckedStorage: true,
          pendingCreateKey: key,
          error: "雲端找不到這把金鑰的存檔。",
        });
      } else if (r.kind === "error") {
        set({
          ...clearedState,
          isLoading: false,
          hasCheckedStorage: true,
          error: r.message,
        });
      }
    },

    // 明確登入：讀到雲端存檔才記住金鑰；找不到時不建立，等使用者按「建立新存檔」
    loginWithKey: async (rawKey: string) => {
      const key = rawKey.trim();
      if (!key) return { success: false, error: "金鑰不能為空" };
      const token = nextEpoch(false);
      set({
        isLoading: true,
        error: null,
        syncStatus: "syncing",
        settleArmed: false,
        sortieNote: null,
        settleView: null,
      });
      const r = await loadShared(key, token, true);
      if (r.kind === "ok" || r.kind === "older") {
        ls.set(COMPAT_PLAYER_KEY, key);
        ls.del(GUEST_ACTIVE_KEY);
        // 已換成這個帳號：前一個帳號還沒回來的寫入不再讓這裡顯示「正在保存」
        busyOwner = 0;
        set({ busy: false, isLoading: false });
        return { success: true };
      }
      if (r.kind === "stale")
        return { success: false, error: "已改用其他帳號" };
      set({
        isLoading: false,
        syncStatus: get().mode === "shared" ? get().syncStatus : "idle",
      });
      if (r.kind === "missing") {
        const message =
          "雲端找不到這把金鑰的存檔：要用它建立新存檔，請再按「建立新存檔」。";
        // 金鑰視窗依 pendingCreateKey／error 重新開啟時，帶入這把金鑰與說明（不會因為重新開啟而失去「建立新存檔」）
        set({ pendingCreateKey: key, error: message });
        return { success: false, needsCreate: true, error: message };
      }
      return { success: false, error: r.message };
    },

    // 明確建立新存檔：成功後唯讀讀回；結果不明時只唯讀查一次，不自動再建立
    createProfile: async (rawKey: string, nickname: string) => {
      const key = rawKey.trim();
      if (!key) return { success: false, error: "金鑰不能為空" };
      const nick = nickname.trim() || "主公";
      const token = nextEpoch();
      const w: W = { key, token, op: ++writerSeq };
      busyOwner = w.op;
      set({
        busy: true,
        isLoading: true,
        error: null,
        settleArmed: false,
        sortieNote: null,
        settleView: null,
      });
      let created = false;
      let outcome: Result | null = null;
      try {
        await gameApi.createProfile(key, nick);
        created = true;
      } catch (e) {
        const f = classifyWriteError(e);
        if (f.kind === "rejected" && f.code !== "KEY_ALREADY_EXISTS") {
          outcome = { success: false, error: `建立失敗：${errorText(f.code)}` };
        } else if (f.kind === "rejected") {
          outcome = null; // 已經有存檔：改為讀取它
        } else if (f.kind === "unknown") {
          outcome = null; // 結果不明：下面唯讀查一次
        }
      }
      if (!epoch.isCurrent(token)) {
        endWrite(w);
        return { success: false, error: "已改用其他帳號" };
      }
      if (outcome) {
        endWrite(w);
        set({ isLoading: false });
        return outcome;
      }
      const r = await loadShared(key, token, true);
      endWrite(w);
      if (epoch.isCurrent(token)) set({ isLoading: false });
      if (r.kind === "ok" || r.kind === "older") {
        ls.set(COMPAT_PLAYER_KEY, key);
        ls.del(GUEST_ACTIVE_KEY);
        return {
          success: true,
          error: created ? undefined : "這把金鑰已經有存檔，已改為讀取它",
        };
      }
      if (r.kind === "missing") {
        return {
          success: false,
          error:
            "建立的結果不明：雲端還沒有這份存檔，請稍後再試（不會自動重送）",
        };
      }
      if (r.kind === "stale")
        return { success: false, error: "已改用其他帳號" };
      return { success: false, error: r.message };
    },

    // 訪客：只用這個瀏覽器的 guest 存檔，不連雲端、不改共用金鑰
    startGuestMode: async () => {
      nextEpoch();
      const guest =
        loadGuest() ??
        createDefaultPlayerProfile(
          `guest_${Date.now().toString(36)}`,
          "遊俠主公"
        );
      saveGuest(guest);
      ls.set(GUEST_ACTIVE_KEY, "1");
      set({
        ...clearedState,
        mode: "guest",
        player: guest,
        syncStatus: "offline",
        isLoading: false,
        hasCheckedStorage: true,
        pendingCreateKey: null,
        error: null,
      });
    },

    // 登出：清掉共用金鑰、舊 JS 金鑰、訪客標記與舊 JS 的 session 快取；換新世代
    logout: () => {
      nextEpoch();
      ls.del(COMPAT_PLAYER_KEY);
      ls.del(LOCAL_PLAYER_KEY);
      ls.del(GUEST_ACTIVE_KEY);
      if (typeof window !== "undefined") {
        try {
          const sessionKeysToRemove: string[] = [];
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k && k.startsWith(SESSION_SAVE_PREFIX))
              sessionKeysToRemove.push(k);
          }
          sessionKeysToRemove.forEach((k) => sessionStorage.removeItem(k));
        } catch (err) {
          console.warn("[JsPlayerStore] 登出清除快取失敗", err);
        }
      }
      set({
        ...clearedState,
        syncStatus: "idle",
        error: null,
        pendingCreateKey: null,
        hasCheckedStorage: true,
      });
    },

    updateNickname: async (nickname: string) => {
      const s = get();
      if (s.mode === "guest" && s.player) {
        guestUpdate({
          ...s.player,
          nickname: nickname.trim() || s.player.nickname,
        });
        return { success: true };
      }
      const blocked = guardWrite();
      if (blocked) {
        set({ notice: blocked });
        return { success: false, error: blocked };
      }
      const p = patchNickname(get().canonical as CanonicalProfile, nickname);
      if (!p.ok) return { success: false, error: p.error };
      return writeProfile(p.data, "暱稱");
    },

    updateTeam: async (team: TeamSlot[]) => {
      const s = get();
      if (s.mode === "guest" && s.player) {
        guestUpdate({ ...s.player, team });
        return { success: true };
      }
      const blocked = guardWrite();
      if (blocked) {
        set({ notice: blocked });
        return { success: false, error: blocked };
      }
      if (!s.teamEditable)
        return {
          success: false,
          error: "雲端的隊伍這裡還不支援，暫時不能修改",
        };
      const p = patchTeam(
        s.canonical as CanonicalProfile,
        team,
        s.heroesConfig,
        idMap
      );
      if (!p.ok) return { success: false, error: p.error };
      return writeProfile(p.data, "隊伍");
    },

    upgradeHero: (heroId: string) => {
      if (get().mode === "guest") return guestUpgrade(heroId);
      return {
        success: false,
        error: "共用帳號的升級要等伺服器回應，請用武將視窗的升級按鈕",
      };
    },

    requestHeroUpgrade: async (heroId: string) => {
      const s = get();
      if (s.mode === "guest") return guestUpgrade(heroId);
      const blocked = guardWrite();
      if (blocked) {
        set({ notice: blocked });
        return { success: false, error: blocked };
      }
      const g = idMap.toCanonical.get(heroId);
      if (!g || s.lockedHeroIds.includes(g))
        return { success: false, error: "這位武將這裡還不支援升級" };
      const key = s.player!.key;
      const w = beginWrite(key);
      let cost: number | undefined;
      try {
        const res = await gameApi.upgradeHero(key, g, s.rev);
        cost = typeof res.cost === "number" ? res.cost : undefined;
      } catch (e) {
        return handleWriteFailure(e, w, "武將升級");
      }
      if (!alive(w)) return staleWrite(w);
      // 伺服器回了成功：唯讀讀回完整存檔（不在本機自己加屬性或扣點數）；讀回確認前不算完成、不開下一個寫入
      const r = await loadShared(key, w.token, false);
      if (r.kind === "stale" || !alive(w)) return staleWrite(w);
      if (!confirmed(r)) {
        return unknownWrite(
          w,
          "武將升級",
          "伺服器回了成功，但讀回雲端存檔失敗"
        );
      }
      endWrite(w);
      return { success: true, cost };
    },

    upgradePreview: (heroId: string) => {
      const s = get();
      const hero = s.player?.heroes.find((h) => h.hero_id === heroId);
      if (!hero) return null;
      if (s.mode === "guest") {
        const cfg = BUILTIN_HEROES_CONFIG.find((c) => c.hero_id === heroId);
        return {
          cost: 100 * hero.level,
          atk: cfg?.atk_growth ?? 15,
          def: cfg?.def_growth ?? 8,
          hp: cfg?.hp_growth ?? 100,
        };
      }
      const g = idMap.toCanonical.get(heroId);
      if (!g || !s.canonical || s.lockedHeroIds.includes(g)) return null;
      const growth = upgradeGrowthOf(g, s.heroesConfig);
      if (!growth) return null;
      return { cost: upgradeCostOf(s.canonical, g, s.heroesConfig), ...growth };
    },

    heroCostOf: (heroId: string) => {
      const s = get();
      if (s.mode !== "shared") return null;
      const g = idMap.toCanonical.get(heroId);
      const cfg = g ? s.heroesConfig.find((h) => h.hero_id === g) : undefined;
      const n = cfg ? Number(cfg.cost) : NaN;
      return Number.isFinite(n) ? n : null;
    },

    // 訪客照本機規則；共用帳號不用這個（見 armSharedSettle／settleSharedBattle），呼叫時只回「沒有寫入」
    settleBattle: (
      stageId: string,
      baseHp: number,
      maxHp: number
    ): BattleRewardResult => {
      const s = get();
      if (!s.player)
        return {
          stars: 1,
          expEarned: 0,
          goldEarned: 0,
          leveledUp: false,
          newLevel: 1,
        };
      if (s.mode === "guest") return guestSettle(stageId, baseHp, maxHp);
      // 星數只是這場戰鬥的顯示（JS 版原本的算法）；沒有寫入、沒有獎勵、沒有解鎖
      const hpRatio = baseHp / maxHp;
      const stars = hpRatio >= 1.0 ? 3 : hpRatio >= 0.5 ? 2 : 1;
      return {
        stars,
        expEarned: 0,
        goldEarned: 0,
        leveledUp: false,
        newLevel: s.player.level,
        notSaved: true,
      };
    },

    armSharedSettle: (sortie: SharedSortie) => {
      armed = null;
      const s = get();
      if (s.mode !== "shared" || !s.player) {
        set({ settleArmed: false, sortieNote: null });
        return false;
      }
      const why = sortieBlockReason(s, sortie);
      const a = why
        ? null
        : armSettle({
            accountKey: s.player.key,
            epoch: epoch.current(),
            baseRev: s.rev,
            stageId: sortie.stageId,
            battleId: sortie.battleId,
            requestId: newRequestId(),
          });
      if (!a || !a.ok) {
        set({
          settleArmed: false,
          sortieNote: `這場不會寫入共用進度：${why ?? "出征資料不完整"}。`,
        });
        return false;
      }
      armed = {
        a: a.armed,
        sortie: {
          ...sortie,
          completeStageIds: new Set(sortie.completeStageIds),
        },
      };
      set({ settleArmed: true, sortieNote: null, settleView: null });
      return true;
    },

    disarmSharedSettle: () => {
      armed = null;
      set({ settleArmed: false, sortieNote: null });
    },

    settleSharedBattle: async (r: BattleResultData) => {
      const s = get();
      if (s.mode !== "shared" || !s.player) return;
      const battleId = r && typeof r.battle_id === "string" ? r.battle_id : "";
      // 同一場的重複回呼：只處理第一次（不會產生第二個請求或第二個 request_id）
      if (battleId && handledBattleIds.has(battleId)) return;
      // 不是目前固定的這一場（舊場次晚到的回呼）：不動目前的固定、畫面與 owner
      if (armed && armed.sortie.battleId !== battleId) return;
      if (battleId) handledBattleIds.add(battleId);
      const cur = armed;
      armed = null;
      set({ settleArmed: false });
      const notSent = (why: string) => {
        set({
          settleView: view(
            battleId,
            "not-sent",
            `這場沒有寫入共用進度：${why}。`
          ),
        });
      };
      if (!cur) {
        const note = s.sortieNote
          ? s.sortieNote
              .replace(/^這場不會寫入共用進度：/, "")
              .replace(/。$/, "")
          : "出征時沒有固定這一場";
        return notSent(note);
      }
      const c = s.canonical;
      const p = prepareSettle(
        cur.a,
        {
          mode: s.mode,
          accountKey: s.player.key,
          epoch: epoch.current(),
          readOnly: s.readOnly,
          busy: s.busy,
          writeBlocked: s.writeBlocked || !!s.pendingSettle,
          teamSupported: s.teamEditable,
          configReady: cur.sortie.configReady && s.heroesConfig.length > 0,
          practice: cur.sortie.practice,
          completeStageIds: cur.sortie.completeStageIds,
          maxStage: c?.max_stage,
          clearedStages: c?.cleared_stages,
        },
        r
      );
      if (!p.ok) return notSent(BLOCK_TEXT[p.reason]);
      const envelope = makePendingEnvelope(cur.a, p.request);
      if (!envelope) return notSent("這場的結果資料不完整");
      // 第一次送出前：重新讀暫存與標記；先暫存固定的內容並寫下送出中的標記，都讀回同一原文才送；
      // 不能暫存、已有待確認或要人工確認就不送
      const key = cur.a.accountKey;
      const pk = pendingKeyOf(key);
      const pend = recheckPending(key);
      if (pend)
        return notSent(
          pend.status === "unavailable"
            ? "瀏覽器不能暫存這場結算"
            : "還有一場結算待確認"
        );
      if (!ss.put(pk, envelope)) return notSent("瀏覽器不能暫存這場結算");
      if (!beginSending(key, p.request.requestId)) {
        // 還沒送出：放下這份暫存（刪不掉時之後只能原樣重新確認同一場）
        if (ss.get(pk) === envelope) ss.del(pk);
        refreshPending(key);
        return notSent("瀏覽器不能暫存這場結算");
      }
      set({ pendingSettle: pendingStateOf(key) });
      await sendSettle(key, p.request, battleId);
    },

    retrySharedSettle: async () => {
      const s = get();
      if (s.mode !== "shared" || !s.player)
        return { success: false, error: "未登入共用帳號" };
      if (s.busy) return { success: false, error: "正在保存，請稍候" };
      if (armed) return { success: false, error: "出征中，請在結算後再確認" };
      const key = s.player.key;
      const state = pendingStateOf(key);
      if (!state) return { success: false, error: "沒有待確認的結算" };
      if (state.status !== "pending")
        return {
          success: false,
          error:
            state.status === "unavailable"
              ? "瀏覽器的暫存讀不到，這次沒有送出"
              : "這場結算要人工確認，不能重送",
        };
      const first = readPending(key);
      if (first.kind !== "ok")
        return { success: false, error: "暫存的結算無法辨識，要人工確認" };
      const rid = first.request.requestId;
      if (sendingIds.has(rid))
        return { success: false, error: "這場正在送出，請稍候" };
      // 讀回前就寫下送出中的標記（寫不進去就不送）：之後暫存被改過要標記人工確認時，寫不進去也還是擋住
      if (!beginSending(key, rid)) {
        set({ notice: "瀏覽器不能暫存送出的狀態，這次沒有送出。" });
        return {
          success: false,
          error: "瀏覽器不能暫存送出的狀態，這次沒有送出",
        };
      }
      const notSent = (error: string): Result => {
        // 這次沒有送出：解除送出中的標記，回到待確認
        endSending(key, rid, true);
        if (get().player?.key === key)
          set({ pendingSettle: pendingStateOf(key) });
        return { success: false, error };
      };
      // 先讀回這個帳號合法的雲端存檔與設定，再原樣送同一個請求（不換 request_id、版本或內容）
      const token = epoch.current();
      set({ syncStatus: "syncing", error: null });
      const rr = await loadShared(key, token, true);
      if (!epoch.isCurrent(token)) return notSent("已改用其他帳號");
      const now = get();
      if (rr.kind !== "ok" || rr.rev === null || now.readOnly)
        return notSent("讀不到合法的雲端存檔，這次沒有送出");
      if (now.heroesConfig.length === 0)
        return notSent("武將設定讀不到，這次沒有送出");
      if (now.busy || armed) return notSent("正在保存，請稍候");
      // 讀回期間暫存被改過（內容、版本、這一場）、讀不到或已標記人工確認：不送，改成人工確認
      const again = readPending(key);
      const stateAgain = pendingStateOf(key);
      if (
        again.kind !== "ok" ||
        again.raw !== first.raw ||
        stateAgain?.status !== "pending"
      ) {
        if (stateAgain?.status !== "unavailable")
          markReview(key, rid, "CHANGED");
        endSending(key, rid, false);
        refreshPending(key);
        set({
          settleView: view(
            first.battleId,
            "review",
            "暫存的結算在確認前被改過或讀不到：要人工確認，這次沒有送出。"
          ),
        });
        return { success: false, error: "暫存的結算已改變，這次沒有送出" };
      }
      return sendSettle(key, again.request, again.battleId);
    },

    forceSync: async () => {
      const s = get();
      if (s.mode === "guest") return { success: true };
      if (s.mode !== "shared" || !s.player)
        return { success: false, error: "未登入" };
      const key = s.player.key;
      const token = epoch.current();
      set({ syncStatus: "syncing", error: null });
      const r = await loadShared(key, token, true);
      if (r.kind === "ok") return { success: true };
      if (r.kind === "stale")
        return { success: false, error: "已改用其他帳號" };
      if (r.kind === "older") {
        // 讀到的版本比畫面舊（較早送出的讀取晚回來）：畫面不變；有待確認的寫入時仍要再同步
        if (!get().writeBlocked) {
          set({ syncStatus: s.readOnly ? "readonly" : "idle" });
          return { success: true };
        }
        set({ syncStatus: "unknown" });
        return {
          success: false,
          error: "讀到的雲端版本比畫面上的舊，請再按一次手動同步",
        };
      }
      const message = r.kind === "missing" ? "雲端找不到這份存檔" : r.message;
      set({
        syncStatus: s.writeBlocked ? "unknown" : "error",
        notice: message,
      });
      return { success: false, error: message };
    },

    // 匯出：共用帳號匯出雲端存檔原樣（canonical 與版本）；訪客匯出本機存檔
    exportBackup: () => {
      const s = get();
      if (s.mode === "shared" && s.player) {
        return JSON.stringify(
          { key: s.player.key, rev: s.rev, data: s.canonical },
          null,
          2
        );
      }
      return s.player ? JSON.stringify(s.player, null, 2) : "";
    },

    // 匯入覆蓋：共用帳號停用；訪客只寫本機
    importBackup: (jsonStr: string) => {
      if (get().mode === "shared") {
        return {
          success: false,
          error: "共用帳號不能用匯入覆蓋雲端存檔（可以匯出備份）",
        };
      }
      try {
        const parsed = JSON.parse(jsonStr) as PlayerState;
        if (!parsed.key || !parsed.nickname || !Array.isArray(parsed.heroes)) {
          return { success: false, error: "存檔格式不符合規格" };
        }
        guestUpdate(parsed);
        ls.set(GUEST_ACTIVE_KEY, "1");
        set({ mode: "guest" });
        return { success: true };
      } catch {
        return { success: false, error: "無法解析 JSON 存檔內容" };
      }
    },
  };
});
