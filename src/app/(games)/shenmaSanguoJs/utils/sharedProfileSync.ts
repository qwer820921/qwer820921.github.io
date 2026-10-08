/**
 * sharedProfileSync.ts
 * 共用存檔的請求與狀態規則（純函式；實際請求用 Godot 版的 api/gameApi.ts）。
 * - 寫入結果分成四種：成功、版本衝突（409 REV_CONFLICT，附雲端目前的資料與 rev）、確定沒寫入的拒絕（NOT_WRITTEN_ERRORS）、
 *   結果不明（網路、平台錯誤、SERVER_ERROR 等可能寫入後才失敗的錯誤）。結果不明的寫入不自動重送，要先唯讀讀回確認
 * - 帳號世代：登入、切換、建立、登出、卸載時換新世代；舊世代的回應一律丟棄，不套到新帳號
 * - 戰鬥結算的傳輸（後端 settle_contract 2）：每一場固定一個 request_id、第一次送出時的 base_rev 與完整內容，重送只能原樣再送；
 *   回應的 base_mismatch 代表可能已經結算、要唯讀讀回；duplicate 不重發本機獎勵；回應沒有新契約、RESULT_UNKNOWN、REQUEST_ID_REUSED
 *   都不改用整份 save_profile
 */
import { GasError } from "../../shenmaSanguo/api/gameApi";

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** 後端的版本號：非負整數才算，其他是 null */
export function revOf(v: unknown): number | null {
  return typeof v === "number" &&
    Number.isFinite(v) &&
    v >= 0 &&
    Math.floor(v) === v
    ? v
    : null;
}

/**
 * 後端在寫入提交點（存檔那一格的寫入、新增一列）之前就回應的錯誤：一定沒有寫入（依後端 v2.9 原始碼逐一確認）。
 * 不在這裡的錯誤一律當成結果不明：例如 SERVER_ERROR 是執行時例外的總稱，可能在寫入之後才發生；
 * 沒有錯誤碼或不認得的錯誤碼也一樣（不能假設沒有寫入）
 */
export const NOT_WRITTEN_ERRORS: ReadonlySet<string> = new Set([
  "MISSING_KEY",
  "BAD_REQUEST",
  "UNKNOWN_ACTION",
  "BUSY",
  "PROFILE_NOT_FOUND",
  "BAD_BASE_REV",
  "DATA_CORRUPT",
  "MISSING_DATA",
  "INVALID_DATA",
  "BASE_REV_REQUIRED",
  "DATA_TOO_LARGE",
  "KEY_ALREADY_EXISTS",
  "BAD_SHEET_HEADERS",
  "MISSING_HERO_ID",
  "HERO_CONFIG_NOT_FOUND",
  "GOLD_NOT_ENOUGH",
  "REQUEST_ID_REQUIRED",
  "INVALID_REQUEST_ID",
  "INVALID_RESULT",
  "INVALID_REWARD",
]);

export type WriteFailure =
  /** 雲端在這份資料之後被改過：沒有寫入，回應附雲端目前的資料與 rev（可能沒附） */
  | { kind: "conflict"; serverData: unknown; serverRev: number | null }
  /** 後端明確拒絕，而且一定沒有寫入（NOT_WRITTEN_ERRORS） */
  | { kind: "rejected"; code: string; response: Record<string, unknown> }
  /** 網路、平台錯誤、無法解析的回應，或可能已經寫入的後端錯誤（SERVER_ERROR 等）：不知道有沒有寫入 */
  | { kind: "unknown"; reason: string };

/** 寫入（save_profile／upgrade_hero／create_profile）丟出的錯誤分類 */
export function classifyWriteError(e: unknown): WriteFailure {
  if (e instanceof GasError) {
    if (e.message === "REV_CONFLICT") {
      return {
        kind: "conflict",
        serverData: e.response.data,
        serverRev: revOf(e.response.rev),
      };
    }
    if (NOT_WRITTEN_ERRORS.has(e.message)) {
      return { kind: "rejected", code: e.message, response: e.response };
    }
    return { kind: "unknown", reason: e.message };
  }
  return {
    kind: "unknown",
    reason: e instanceof Error ? e.message : String(e),
  };
}

/** 帳號世代：next() 換新世代並回傳；isCurrent(t) 判斷某個請求開始時的世代還是不是目前的 */
export function createEpoch() {
  let n = 0;
  return {
    current: () => n,
    next: () => ++n,
    isCurrent: (t: number) => t === n,
  };
}

/** 戰鬥結算的輸入（只用虛構或已確定的值；這裡不算獎勵，獎勵由後端依契約計算） */
export interface SettleInput {
  stageId: string;
  result: "WIN" | "LOSE";
  /** 0～3 的整數 */
  starsEarned: number;
  kills: number;
  timeSeconds: number;
  /** 勝利時的點數（非負安全整數）；落敗時後端固定給 10，不看這個值 */
  battlePoints: number;
}

/** 一場結算的固定請求：request_id、base_rev 與內容第一次決定之後不再改，重送只能原樣再送 */
export interface SettleRequest {
  requestId: string;
  baseRev: number;
  payload: Record<string, unknown>;
}

export const SETTLE_CONTRACT_V2 = 2;

/** 建立一場結算的固定請求；base_rev 不是非負整數時不建立（沒有版本就不寫） */
export function buildSettleRequest(
  input: SettleInput,
  requestId: string,
  baseRev: number | null
): SettleRequest | null {
  if (!requestId || requestId.length > 100) return null;
  if (revOf(baseRev) === null) return null;
  if (
    !(
      Number.isInteger(input.starsEarned) &&
      input.starsEarned >= 0 &&
      input.starsEarned <= 3
    )
  )
    return null;
  if (!Number.isSafeInteger(input.battlePoints) || input.battlePoints < 0)
    return null;
  return {
    requestId,
    baseRev: baseRev as number,
    payload: {
      stage_id: input.stageId,
      result: input.result,
      stars_earned: input.starsEarned,
      kills: input.kills,
      time_seconds: input.timeSeconds,
      loots: [{ item: "battle_points", count: input.battlePoints }],
      request_id: requestId,
      base_rev: baseRev,
      settle_contract: SETTLE_CONTRACT_V2,
    },
  };
}

export type SettleOutcome =
  /** 後端已結算，回應帶新的 rev（等於送出的 base_rev 之後的版本）：可以用回應的 after 更新 */
  | { kind: "applied"; rev: number; reward: unknown; after: unknown }
  /** 後端已結算（或之前已結算），但雲端在送出之後被改過：不給新版本，要唯讀讀回完整存檔 */
  | { kind: "applied-reread"; duplicate: boolean }
  /** 同一場的重送：不重發本機獎勵；有新的 rev 時同 applied */
  | { kind: "duplicate"; rev: number | null; after: unknown }
  /** 回應沒有新契約（舊後端或不完整）：結果不能當成完整結算，不改用整份保存，要唯讀讀回 */
  | { kind: "contract-missing" };

/** 判讀 status 200 的結算回應 */
export function interpretSettleResponse(
  body: unknown,
  sent: SettleRequest
): SettleOutcome {
  if (
    !isObj(body) ||
    body.settle_contract !== SETTLE_CONTRACT_V2 ||
    body.request_id !== sent.requestId
  ) {
    return { kind: "contract-missing" };
  }
  const rev = revOf(body.rev);
  if (body.duplicate === true) {
    return rev !== null
      ? { kind: "duplicate", rev, after: body.after }
      : { kind: "applied-reread", duplicate: true };
  }
  if (body.base_mismatch === true || rev === null)
    return { kind: "applied-reread", duplicate: false };
  return { kind: "applied", rev, reward: body.reward, after: body.after };
}

export type SettleFailure =
  /** 後端明確拒絕而且沒有結算（例如內容不合法、找不到存檔）：不重送 */
  | { kind: "rejected"; code: string }
  /** 後端無法確認這場有沒有處理過（RESULT_UNKNOWN）或同一個 request_id 的內容不同（REQUEST_ID_REUSED）：要人工確認，不改 id 重送 */
  | { kind: "needs-review"; code: string }
  /** 網路、平台錯誤或可能已經寫入的後端錯誤（SERVER_ERROR 等）：不知道有沒有結算；保留同一個 request_id 與完整內容，只能原樣再送，不換新 id、不自動無界重試 */
  | { kind: "unknown"; reason: string };

export function classifySettleError(e: unknown): SettleFailure {
  if (e instanceof GasError) {
    if (e.message === "RESULT_UNKNOWN" || e.message === "REQUEST_ID_REUSED") {
      return { kind: "needs-review", code: e.message };
    }
    if (NOT_WRITTEN_ERRORS.has(e.message)) {
      return { kind: "rejected", code: e.message };
    }
    return { kind: "unknown", reason: e.message };
  }
  return {
    kind: "unknown",
    reason: e instanceof Error ? e.message : String(e),
  };
}
