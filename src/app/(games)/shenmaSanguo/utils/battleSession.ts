import { BattleResult, BattleResultPayload, BattleTicket } from "../types";

/** Godot BattleManager 的 game_state */
export const BATTLE_GAME_STATE = {
  WAITING: 0,
  PREP: 1,
  BATTLE: 2,
  RESULT: 3,
} as const;

/**
 * Godot 傳來的訊息是不是戰鬥結算
 * 結算訊息沒有 type 欄位，一定帶 result／stage_id／loots；
 * 其他訊息（update_stats、debug_snapshot…）都有 type，不能被當成結算
 */
export function isBattleResultMessage(
  data: unknown
): data is BattleResultPayload {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    d.__godot_bridge === true &&
    d.type === undefined &&
    (d.result === BattleResult.Win || d.result === BattleResult.Lose) &&
    typeof d.stage_id === "string" &&
    Array.isArray(d.loots)
  );
}

/**
 * 目前這一關（Godot 的一次關卡載入）的戰鬥：決定結算屬於誰、能不能採用
 * - 每次送出關卡資料就換一張新的戰鬥票，票的 id 以 battle_id 送進 Godot；
 *   Godot 的 update_stats 與結算都帶回產生它的那一場的 battle_id
 * - 只接受 battle_id 和目前這一場相同的訊息：舊關卡（包括同一關重來前的上一場）晚到的 stats 與結算、
 *   缺少或錯誤 battle_id 的訊息一律不採用，也不影響開打判斷與帳號切換的鎖
 * - 只採用這一場開打後（看過 BATTLE 狀態或波次 > 0）的第一筆結算，同一場只能確認一次（連按不會重複結算）
 */
export class BattleSession {
  private ticket: BattleTicket | null = null;
  private started = false;
  private result: BattleResultPayload | null = null;
  private settled = false;

  /** 送出關卡資料：開始新的一場（傳 null 代表目前沒有進行中的關卡） */
  begin(ticket: BattleTicket | null) {
    this.ticket = ticket;
    this.started = false;
    this.result = null;
    this.settled = false;
  }

  /** 離開目前的關卡（切換關卡、換帳號重新載入、離開頁面） */
  end() {
    this.begin(null);
  }

  /** 目前這一場的戰鬥票 */
  get owner(): BattleTicket | null {
    return this.ticket;
  }

  /** Godot 的訊息是不是目前這一場產生的（battle_id 必須相同；缺少、空白或非字串一律不是） */
  private isMine(data: { battle_id?: unknown }): boolean {
    return (
      !!this.ticket &&
      typeof data.battle_id === "string" &&
      data.battle_id === this.ticket.id
    );
  }

  /**
   * Godot 的 update_stats：屬於目前這一場才回傳 true（頁面才採用），其他場次的一律忽略
   * 開打後才接受結算
   */
  onStats(stats: {
    battle_id?: unknown;
    wave: number;
    game_state: number;
  }): boolean {
    if (!this.isMine(stats)) return false;
    if (
      !this.settled &&
      (stats.game_state === BATTLE_GAME_STATE.BATTLE ||
        stats.game_state === BATTLE_GAME_STATE.RESULT ||
        stats.wave > 0)
    ) {
      this.started = true;
    }
    return true;
  }

  /** 收到結算：採用時回傳 true（畫面才顯示結算） */
  onResult(result: BattleResultPayload): boolean {
    if (!this.isMine(result) || !this.started || this.result || this.settled) {
      return false;
    }
    this.result = result;
    return true;
  }

  /** 已開打或有待確認的結算：回傳這場的戰鬥票（用來鎖住帳號切換），否則 null */
  lockTicket(): BattleTicket | null {
    if (!this.ticket || this.settled) return null;
    return this.started || this.result ? this.ticket : null;
  }

  /** 確認結算：同一場只會回傳一次 */
  take(): { ticket: BattleTicket; result: BattleResultPayload } | null {
    if (!this.ticket || !this.result || this.settled) return null;
    this.settled = true;
    return { ticket: this.ticket, result: this.result };
  }
}
