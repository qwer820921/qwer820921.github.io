import { flightProblemText, groundProblemText } from "./stagePreview";

/**
 * 拒絕開戰的提示：Godot 在「這一波沒有任何可以出兵的敵人組」時留在備戰（不扣城血、不結算、波次不前進），
 * 並送 wave_rejected {battle_id, wave, missing, skipped: [{index, enemy_id, path, reason}]}。
 * 兩個戰鬥入口只顯示目前這一場（battle_id 相同）的訊息；原因代碼和 Godot WaveManager 相同，
 * 認不得的代碼顯示成「設定無效」，不猜測原因
 */

export interface WaveRejectNotice {
  battleId: string;
  wave: number;
  /** 逐組的原因（顯示用） */
  lines: string[];
}

/** 一則提示最多列出的組數，其餘合併成「另有 N 組」 */
const MAX_LINES = 6;

const REASON_TEXT: Record<string, string> = {
  enemy_not_found: "找不到敵人設定",
  path_empty: "路線沒有路點",
  flight_single_point: flightProblemText("flight_single_point"),
  flight_same_endpoints: flightProblemText("flight_same_endpoints"),
  ground_single_point: groundProblemText("ground_single_point"),
  ground_zero_length: groundProblemText("ground_zero_length"),
  count_invalid: "數量不是正數",
};

const text = (v: unknown): string =>
  typeof v === "string" || typeof v === "number" ? String(v) : "";

/**
 * 把 Godot 的 wave_rejected 轉成提示；不是這一場（battle_id 不同或缺少）或格式不對時回傳 null。
 * enemies：已載入的敵人設定，用 enemy_id 找名稱（找不到時顯示 enemy_id）
 */
export function waveRejectNotice(
  data: unknown,
  currentBattleId: string | null | undefined,
  enemies?: readonly { enemy_id?: unknown; name?: unknown }[] | null
): WaveRejectNotice | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (d.type !== "wave_rejected") return null;
  if (
    typeof d.battle_id !== "string" ||
    d.battle_id === "" ||
    d.battle_id !== currentBattleId
  ) {
    return null;
  }
  const wave = d.wave;
  if (typeof wave !== "number" || !Number.isInteger(wave) || wave < 1) {
    return null;
  }
  const skipped = Array.isArray(d.skipped) ? d.skipped : [];
  const lines: string[] = [];
  if (d.missing === true) lines.push(`關卡資料沒有第 ${wave} 波`);
  for (const raw of skipped.slice(0, MAX_LINES)) {
    const s = (raw && typeof raw === "object" ? raw : {}) as Record<
      string,
      unknown
    >;
    const id = text(s.enemy_id);
    const cfg = id
      ? (enemies ?? []).find((e) => e && String(e.enemy_id) === id)
      : undefined;
    const name = text(cfg?.name) || id || "未知敵人";
    const code = text(s.reason);
    const reason = Object.prototype.hasOwnProperty.call(REASON_TEXT, code)
      ? REASON_TEXT[code]
      : "設定無效";
    const index = text(s.index);
    lines.push(
      `${index ? `第 ${index} 組 ` : ""}${name}（路線 ${text(s.path) || "未提供"}）：${reason}`
    );
  }
  if (skipped.length > MAX_LINES) {
    lines.push(`另有 ${skipped.length - MAX_LINES} 組無法出兵`);
  }
  if (lines.length === 0) lines.push("這一波沒有可以出兵的敵人組");
  return { battleId: d.battle_id, wave, lines };
}
