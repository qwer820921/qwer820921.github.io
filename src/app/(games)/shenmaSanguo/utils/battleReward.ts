import { BattleResult, BattleResultPayload, PlayerState } from "../types";
import { getNextStage, stageToNum } from "./stageUtils";

/**
 * 戰鬥結算的獎勵規則（前端先顯示用；後端的完整結算用同一套規則，見基準文件）
 * - 點數：勝利時 loots 裡有 battle_points 就只加總 battle_points，沒有才加總 gold（舊名稱）；
 *   兩種都有時 gold 不計，不會重複。落敗固定 10
 * - 經驗：勝利 50 + 星數×20，落敗 10
 * - 升級：level 不是正整數時當 1、exp 不是非負有限數時當 0，exp ≥ level×100 時扣掉並升一級（可連升）；容量 = 10 + level
 * - 進度：勝利且下一關比目前的 max_stage 大才更新
 * - 驗證：勝負是 WIN／LOSE、關卡是 1～50 字的文字、星數是 0～3 的整數、
 *   battle_points／gold 的 count 是非負安全整數（這是可靠性檢查，不是防作弊）
 */

export const LOSE_POINTS = 10;
export const LOSE_EXP = 10;
/** 一次結算最多連升幾級（只防異常的經驗值讓迴圈跑太久；正常資料一次最多升一級） */
const MAX_LEVEL_UPS = 10000;

export interface BattleReward {
  points: number;
  exp: number;
}

/** 結算套用後的玩家數值（後端回應的 after 也是這個形狀） */
export interface SettleAfter {
  gold: number;
  exp: number;
  level: number;
  capacity: number;
  max_stage: string;
}

/** 送到後端的結算內容（不含場次識別碼與橋接標記） */
export type BattleRecord = Pick<
  BattleResultPayload,
  "result" | "stage_id" | "stars_earned" | "kills" | "time_seconds" | "loots"
>;

const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** 只進紀錄的數值（擊殺數、時間）：有限的非負數，其他當 0 */
const logNumber = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

/** 取出送到後端的結算內容；不合規則時回傳 null（不套用、不送出） */
export function toBattleRecord(r: BattleResultPayload): BattleRecord | null {
  if (r.result !== BattleResult.Win && r.result !== BattleResult.Lose) {
    return null;
  }
  if (
    typeof r.stage_id !== "string" ||
    r.stage_id.length === 0 ||
    r.stage_id.length > 50
  ) {
    return null;
  }
  if (!computeBattleReward(r)) return null;
  return {
    result: r.result,
    stage_id: r.stage_id,
    stars_earned: r.stars_earned,
    kills: logNumber(r.kills),
    time_seconds: logNumber(r.time_seconds),
    loots: Array.isArray(r.loots) ? r.loots : [],
  };
}

/** 這場的獎勵；星數或點數不合規則時回傳 null */
export function computeBattleReward(
  r: Pick<BattleResultPayload, "result" | "stars_earned" | "loots">
): BattleReward | null {
  const stars = r.stars_earned;
  if (!(Number.isInteger(stars) && stars >= 0 && stars <= 3)) return null;
  const loots: unknown = r.loots;
  if (loots !== undefined && loots !== null && !Array.isArray(loots)) {
    return null;
  }
  let bp = 0;
  let gold = 0;
  let hasBp = false;
  for (const l of Array.isArray(loots) ? loots : []) {
    if (!l || typeof l !== "object") continue;
    const { item, count } = l as { item?: unknown; count?: unknown };
    if (item !== "battle_points" && item !== "gold") continue;
    if (!isCount(count)) return null;
    if (item === "battle_points") {
      bp += count;
      hasBp = true;
    } else {
      gold += count;
    }
  }
  const win = r.result === BattleResult.Win;
  const points = win ? (hasBp ? bp : gold) : LOSE_POINTS;
  if (!Number.isSafeInteger(points)) return null;
  return { points, exp: win ? 50 + stars * 20 : LOSE_EXP };
}

/** 把獎勵套到玩家數值上（不改動傳入的資料），回傳套用後的點數、經驗、等級、容量與進度 */
export function applyBattleReward(
  player: Pick<PlayerState, "gold" | "exp" | "level" | "max_stage">,
  reward: BattleReward,
  record: Pick<BattleRecord, "result" | "stage_id">
): SettleAfter {
  let level = Number(player.level);
  if (!(Number.isInteger(level) && level >= 1)) level = 1;
  let exp = Number(player.exp);
  if (!(Number.isFinite(exp) && exp >= 0)) exp = 0;
  exp += reward.exp;
  for (let n = 0; n < MAX_LEVEL_UPS && exp >= level * 100; n++) {
    exp -= level * 100;
    level += 1;
  }
  let maxStage = player.max_stage;
  if (record.result === BattleResult.Win) {
    const next = getNextStage(record.stage_id);
    if (stageToNum(next) > stageToNum(String(player.max_stage || ""))) {
      maxStage = next;
    }
  }
  return {
    gold: (Number(player.gold) || 0) + reward.points,
    exp,
    level,
    capacity: 10 + level,
    max_stage: maxStage,
  };
}

/** 兩份結算後的數值完全相同 */
export const sameSettleAfter = (a: SettleAfter, b: unknown): boolean => {
  if (!b || typeof b !== "object") return false;
  const o = b as Record<string, unknown>;
  return (
    o.gold === a.gold &&
    o.exp === a.exp &&
    o.level === a.level &&
    o.capacity === a.capacity &&
    o.max_stage === a.max_stage
  );
};
