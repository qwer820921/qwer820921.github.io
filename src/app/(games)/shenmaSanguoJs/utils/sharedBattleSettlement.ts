/**
 * sharedBattleSettlement.ts
 * 共用帳號的戰鬥結算：資料邊界（純函式；不呼叫 API、不改 store、不讀寫 sessionStorage、不另算獎勵）。
 * - 進場時固定這一場（armSettle）：帳號、世代、已確認的版本（base_rev）、關卡、battle_id、request_id；之後不再改
 * - 戰鬥結束（prepareSettle）：只用引擎回呼的凍結 BattleResultData 逐欄建立請求；帳號／世代／這一場不符、
 *   自由演練、未解鎖、資料或狀態不完整都回具體的阻擋原因，不產生請求
 * - 待確認的結算（makePendingEnvelope／parsePendingEnvelope）：有版本的資料格式，只綁帳號指紋、request_id、這一場與第一次的內容；
 *   解析不符一律要人工確認，不會用新的版本或新的 id 重建請求
 * 點數、經驗、等級、容量、進度都以後端的回應與讀回為準；這裡只確保送出去的是同一場、同一份內容
 */
import type { BattleResultData } from "../engine/BattleManager";
import {
  buildSettleRequest,
  revOf,
  SETTLE_CONTRACT_V2,
  SettleRequest,
} from "./sharedProfileSync";
import { isStageUnlocked } from "./stagePlayability";

/** 關卡代碼：chapter<章>_<關>（正整數、不補零），最多 50 字（後端上限） */
const STAGE_ID = /^chapter([1-9]\d*)_([1-9]\d*)$/;
const MAX_ID = 100;
/** 待確認結算的資料格式 */
export const PENDING_SCHEMA = "shenma-js-settle";
export const PENDING_VERSION = 1;
/** 待確認結算的序列化上限（一場的內容只有幾百字；超過就是異常資料） */
export const MAX_PENDING_CHARS = 4096;

export const isStageId = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 50 && STAGE_ID.test(v);
const isId = (v: unknown): v is string =>
  typeof v === "string" && v.length > 0 && v.length <= MAX_ID;
const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as Record<string, unknown>)) deepFreeze(v);
  }
  return o;
}

/** 進場時固定的這一場（呼叫者在按「進入戰場」時建立；之後只讀） */
export interface ArmedSettle {
  readonly accountKey: string;
  readonly epoch: number;
  readonly baseRev: number;
  readonly stageId: string;
  readonly battleId: string;
  readonly requestId: string;
}

export type ArmResult =
  | { ok: true; armed: ArmedSettle }
  | {
      ok: false;
      reason:
        | "bad-account"
        | "bad-epoch"
        | "missing-rev"
        | "bad-stage"
        | "bad-battle"
        | "bad-request-id";
    };

/** 固定這一場：每一欄都要合法；回傳凍結的副本 */
export function armSettle(input: {
  accountKey: unknown;
  epoch: unknown;
  baseRev: unknown;
  stageId: unknown;
  battleId: unknown;
  requestId: unknown;
}): ArmResult {
  if (typeof input.accountKey !== "string" || !input.accountKey)
    return { ok: false, reason: "bad-account" };
  if (!isCount(input.epoch)) return { ok: false, reason: "bad-epoch" };
  const rev = revOf(input.baseRev);
  if (rev === null || !Number.isSafeInteger(rev))
    return { ok: false, reason: "missing-rev" };
  if (!isStageId(input.stageId)) return { ok: false, reason: "bad-stage" };
  if (!isId(input.battleId)) return { ok: false, reason: "bad-battle" };
  if (!isId(input.requestId)) return { ok: false, reason: "bad-request-id" };
  return {
    ok: true,
    armed: Object.freeze({
      accountKey: input.accountKey,
      epoch: input.epoch,
      baseRev: rev,
      stageId: input.stageId,
      battleId: input.battleId,
      requestId: input.requestId,
    }),
  };
}

/** 結算當下的狀態（呼叫者提供；這裡只讀） */
export interface SettleContext {
  mode: "shared" | "guest" | "none";
  accountKey: string | null;
  epoch: number;
  readOnly: boolean;
  busy: boolean;
  writeBlocked: boolean;
  /** 雲端的隊伍這裡能完整表示 */
  teamSupported: boolean;
  /** 後端武將設定已讀到 */
  configReady: boolean;
  /** 這一場是自由演練（不論是否已解鎖都不寫入） */
  practice: boolean;
  /** 目前關卡設定裡存在、而且資料完整的關卡代碼 */
  completeStageIds: ReadonlySet<string>;
  /** 雲端存檔（canonical）的 max_stage 與 cleared_stages，原樣傳入 */
  maxStage: unknown;
  clearedStages: unknown;
}

export type BlockReason =
  | "not-shared"
  | "account-changed"
  | "stale-epoch"
  | "read-only"
  | "busy"
  | "write-blocked"
  | "team-unsupported"
  | "config-not-ready"
  | "unknown-stage"
  | "bad-progress"
  | "practice"
  | "locked-stage"
  | "wrong-battle"
  | "bad-result";

export type PrepareResult =
  | { ok: true; request: SettleRequest }
  | { ok: false; reason: BlockReason };

/** canonical 的 cleared_stages：只取有限數字的項目；不是物件時當成沒有 */
function clearedOf(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [k, n] of Object.entries(v))
    if (isStageId(k) && typeof n === "number" && Number.isFinite(n)) out[k] = n;
  return out;
}

/**
 * 從凍結的戰鬥結果逐欄取出結算輸入（不補值、不忽略多餘的項目）：
 * 勝利 1～3 星、落敗 0 星；kills／time_seconds 是非負安全整數；loots 剛好一筆 battle_points（落敗固定 10），沒有其他項目
 */
function readFrozenResult(r: unknown, armed: ArmedSettle) {
  if (!isObj(r)) return null;
  const res = r as Partial<BattleResultData> & Record<string, unknown>;
  if (res.stage_id !== armed.stageId || res.battle_id !== armed.battleId)
    return "wrong-battle" as const;
  if (res.result !== "WIN" && res.result !== "LOSE") return null;
  const stars = res.stars_earned;
  if (!(typeof stars === "number" && Number.isInteger(stars))) return null;
  if (res.result === "WIN" ? stars < 1 || stars > 3 : stars !== 0) return null;
  if (!isCount(res.kills) || !isCount(res.time_seconds)) return null;
  const loots = res.loots;
  if (!Array.isArray(loots) || loots.length !== 1) return null;
  const l = loots[0];
  if (
    !isObj(l) ||
    Object.keys(l).length !== 2 ||
    l.item !== "battle_points" ||
    !isCount(l.count)
  )
    return null;
  if (res.result === "LOSE" && l.count !== 10) return null;
  return {
    stageId: armed.stageId,
    result: res.result,
    starsEarned: stars,
    kills: res.kills,
    timeSeconds: res.time_seconds,
    battlePoints: l.count,
  };
}

/** 這一場能不能寫入共用進度；可以時回傳凍結的請求（同一場只會有這一份內容） */
export function prepareSettle(
  armed: ArmedSettle,
  ctx: SettleContext,
  result: unknown
): PrepareResult {
  if (ctx.mode !== "shared") return { ok: false, reason: "not-shared" };
  if (ctx.accountKey !== armed.accountKey)
    return { ok: false, reason: "account-changed" };
  if (ctx.epoch !== armed.epoch) return { ok: false, reason: "stale-epoch" };
  if (ctx.readOnly) return { ok: false, reason: "read-only" };
  if (ctx.busy) return { ok: false, reason: "busy" };
  if (ctx.writeBlocked) return { ok: false, reason: "write-blocked" };
  if (!ctx.teamSupported) return { ok: false, reason: "team-unsupported" };
  if (!ctx.configReady) return { ok: false, reason: "config-not-ready" };
  if (!isStageId(armed.stageId) || !ctx.completeStageIds.has(armed.stageId))
    return { ok: false, reason: "unknown-stage" };
  if (!isStageId(ctx.maxStage)) return { ok: false, reason: "bad-progress" };
  if (ctx.practice) return { ok: false, reason: "practice" };
  if (
    !isStageUnlocked(armed.stageId, ctx.maxStage, clearedOf(ctx.clearedStages))
  )
    return { ok: false, reason: "locked-stage" };
  const input = readFrozenResult(result, armed);
  if (input === "wrong-battle") return { ok: false, reason: "wrong-battle" };
  if (!input) return { ok: false, reason: "bad-result" };
  const request = buildSettleRequest(input, armed.requestId, armed.baseRev);
  if (!request) return { ok: false, reason: "bad-result" };
  return {
    ok: true,
    request: deepFreeze(JSON.parse(JSON.stringify(request)) as SettleRequest),
  };
}

/** 帳號指紋（只用來綁定待確認的結算，不是安全雜湊；不保存金鑰原文） */
export function accountFingerprint(key: string): string {
  let h1 = 0xdeadbeef ^ key.length;
  let h2 = 0x41c6ce57 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    const c = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 =
    Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
    Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 =
    Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
    Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `a${(h2 >>> 0).toString(16).padStart(8, "0")}${(h1 >>> 0).toString(16).padStart(8, "0")}`;
}

interface PendingEnvelope {
  schema: string;
  version: number;
  account: string;
  requestId: string;
  stageId: string;
  battleId: string;
  baseRev: number;
  payload: Record<string, unknown>;
  /** 完整性檢查碼（偵測儲存後被改過或損壞；不是安全機制） */
  check: string;
}

/** 綁定欄位與內容的檢查碼 */
const envelopeCheck = (e: Omit<PendingEnvelope, "check">) =>
  accountFingerprint(
    JSON.stringify([
      e.schema,
      e.version,
      e.account,
      e.requestId,
      e.stageId,
      e.battleId,
      e.baseRev,
      e.payload,
    ])
  );

const PAYLOAD_KEYS = [
  "base_rev",
  "kills",
  "loots",
  "request_id",
  "result",
  "settle_contract",
  "stage_id",
  "stars_earned",
  "time_seconds",
];

/**
 * 待確認結算的 payload 是否和 prepareSettle 產生的一樣嚴格（建構與解析共用）：剛好這些欄位、綁定 request_id／base_rev／關卡、
 * 契約 2、勝利 1～3 星／落敗 0 星、kills／time_seconds 是非負安全整數、loots 剛好一筆 battle_points、落敗固定 10 點。
 * 回傳不符的項目，合法時回 null（不放寬也不收緊 buildSettleRequest 本身的傳輸範圍）
 */
function pendingPayloadProblem(
  payload: unknown,
  bind: { requestId: string; baseRev: number; stageId: string }
): string | null {
  if (!isObj(payload)) return "payload";
  if (
    JSON.stringify(Object.keys(payload).sort()) !== JSON.stringify(PAYLOAD_KEYS)
  )
    return "payload-keys";
  if (
    payload.request_id !== bind.requestId ||
    payload.base_rev !== bind.baseRev ||
    payload.stage_id !== bind.stageId
  )
    return "binding";
  if (payload.settle_contract !== SETTLE_CONTRACT_V2) return "contract";
  const stars = payload.stars_earned;
  if (payload.result !== "WIN" && payload.result !== "LOSE") return "result";
  if (!(typeof stars === "number" && Number.isInteger(stars))) return "result";
  if (payload.result === "WIN" ? stars < 1 || stars > 3 : stars !== 0)
    return "result";
  if (!isCount(payload.kills) || !isCount(payload.time_seconds))
    return "counts";
  const loots = payload.loots;
  if (
    !Array.isArray(loots) ||
    loots.length !== 1 ||
    !isObj(loots[0]) ||
    Object.keys(loots[0]).length !== 2 ||
    loots[0].item !== "battle_points" ||
    !isCount(loots[0].count)
  )
    return "loots";
  if (payload.result === "LOSE" && loots[0].count !== 10) return "result";
  return null;
}

/** 待確認結算的序列化（只處理傳入的值；不寫入任何儲存空間）：這一場或內容不合法時回 null */
export function makePendingEnvelope(
  armed: ArmedSettle,
  request: SettleRequest
): string | null {
  if (
    request.requestId !== armed.requestId ||
    request.baseRev !== armed.baseRev
  )
    return null;
  if (
    pendingPayloadProblem(request.payload, {
      requestId: armed.requestId,
      baseRev: armed.baseRev,
      stageId: armed.stageId,
    }) !== null
  )
    return null;
  const body: Omit<PendingEnvelope, "check"> = {
    schema: PENDING_SCHEMA,
    version: PENDING_VERSION,
    account: accountFingerprint(armed.accountKey),
    requestId: armed.requestId,
    stageId: armed.stageId,
    battleId: armed.battleId,
    baseRev: armed.baseRev,
    payload: JSON.parse(JSON.stringify(request.payload)),
  };
  const env: PendingEnvelope = { ...body, check: envelopeCheck(body) };
  const text = JSON.stringify(env);
  return text.length <= MAX_PENDING_CHARS ? text : null;
}

export type ParsePendingResult =
  | { ok: true; request: SettleRequest; stageId: string; battleId: string }
  | { ok: false; reason: "needs-review"; detail: string };

/**
 * 解析待確認的結算：格式、版本、帳號、request_id、這一場與內容都要和第一次完全相同，內容也要通過和建構相同的嚴格核對；
 * 任何不符都要人工確認（不重建可以送的請求、不換新的版本或 id）
 */
export function parsePendingEnvelope(
  text: unknown,
  accountKey: string
): ParsePendingResult {
  const fail = (detail: string): ParsePendingResult => ({
    ok: false,
    reason: "needs-review",
    detail,
  });
  if (typeof text !== "string" || text.length > MAX_PENDING_CHARS)
    return fail("size");
  let env: unknown;
  try {
    env = JSON.parse(text);
  } catch {
    return fail("json");
  }
  if (!isObj(env)) return fail("shape");
  if (env.schema !== PENDING_SCHEMA || env.version !== PENDING_VERSION)
    return fail("version");
  if (env.account !== accountFingerprint(accountKey)) return fail("account");
  if (
    JSON.stringify(Object.keys(env).sort()) !==
    JSON.stringify([
      "account",
      "baseRev",
      "battleId",
      "check",
      "payload",
      "requestId",
      "schema",
      "stageId",
      "version",
    ])
  )
    return fail("envelope-keys");
  const { requestId, stageId, battleId, baseRev, payload } = env;
  if (!isId(requestId) || !isStageId(stageId) || !isId(battleId))
    return fail("ids");
  const rev = revOf(baseRev);
  if (rev === null || !Number.isSafeInteger(rev)) return fail("rev");
  const problem = pendingPayloadProblem(payload, {
    requestId,
    baseRev: rev,
    stageId,
  });
  if (problem !== null || !isObj(payload)) return fail(problem ?? "payload");
  const loots = payload.loots as Array<Record<string, unknown>>;
  const rebuilt = buildSettleRequest(
    {
      stageId,
      result: payload.result as "WIN" | "LOSE",
      starsEarned: payload.stars_earned as number,
      kills: payload.kills as number,
      timeSeconds: payload.time_seconds as number,
      battlePoints: loots[0].count as number,
    },
    requestId,
    rev
  );
  if (!rebuilt || JSON.stringify(rebuilt.payload) !== JSON.stringify(payload))
    return fail("payload-content");
  const { check, ...body } = env as unknown as PendingEnvelope;
  if (check !== envelopeCheck(body)) return fail("check");
  return { ok: true, request: deepFreeze(rebuilt), stageId, battleId };
}
