import { BATTLE_GAME_STATE } from "./battleSession";

/**
 * 戰鬥速度：兩個戰鬥頁共用。
 * Godot 是唯一的來源：玩家選的速度（1 或 2 倍）與實際倍率都以 update_stats 為準，網頁不先改顯示的數字。
 * 部署選單開著時 Godot 固定 0.1 倍（不乘上玩家選的速度），關閉選單後恢復玩家選的速度；新的一場從 1 倍開始。
 * 只改遊戲時間的推進，不改傷害、費用、獎勵，也不寫進存檔。
 */
export const GAME_SPEEDS = [1, 2] as const;
export type GameSpeed = (typeof GAME_SPEEDS)[number];

/** update_stats 裡和速度、暫停有關的欄位（這一場的訊息才會進到這裡，見 BattleSession.onStats） */
export interface SpeedStats {
  game_state: number;
  speed?: unknown;
  time_scale?: unknown;
  deploy_slow?: unknown;
  /** 手動暫停：Godot 已確認的狀態 */
  paused?: unknown;
}

/** 畫面顯示的速度：只採 Godot 已確認的 1 或 2；缺少或不認得時是 null（不猜） */
export function confirmedSpeed(
  stats: SpeedStats | null | undefined
): GameSpeed | null {
  const v = stats?.speed;
  return v === 1 || v === 2 ? v : null;
}

/** 能不能切換速度：有這一場的狀態、備戰或戰鬥中（結算後、還沒開始都不行） */
export function canChangeSpeed(stats: SpeedStats | null | undefined): boolean {
  return (
    !!stats &&
    confirmedSpeed(stats) !== null &&
    (stats.game_state === BATTLE_GAME_STATE.PREP ||
      stats.game_state === BATTLE_GAME_STATE.BATTLE)
  );
}

/** 目前是部署選單的暫時慢速（Godot 回報的實際狀態） */
export function isDeploySlow(stats: SpeedStats | null | undefined): boolean {
  return stats?.deploy_slow === true;
}

/**
 * 手動暫停：Godot 是唯一的來源，畫面只採 update_stats 的 paused（布林），按下後等 Godot 確認才改變。
 * 暫停時 Godot 凍結這一場的模擬（移動、攻擊、灼燒、減速、出兵與自動下一波的計時），繼續後從同一個進度接著跑；
 * 暫停中不能開戰、切自動、部署、移位、升級、拆塔、改目標（網頁停用，Godot 也會拒絕），可以選速度（繼續後套用）、關閉部署選單。
 * 只存在這一場的戰場記憶體：新的一場與結算時解除，不寫存檔、不送後端
 */
export function isPaused(stats: SpeedStats | null | undefined): boolean {
  return stats?.paused === true;
}

/** 能不能暫停或繼續：有這一場的狀態、Godot 回報了暫停狀態（布林）、備戰或戰鬥中（結算後、還沒開始都不行） */
export function canTogglePause(stats: SpeedStats | null | undefined): boolean {
  return (
    !!stats &&
    typeof stats.paused === "boolean" &&
    (stats.game_state === BATTLE_GAME_STATE.PREP ||
      stats.game_state === BATTLE_GAME_STATE.BATTLE)
  );
}

/**
 * 部署選單（Godot 的 click_cell）屬於哪一場、哪個選單：關閉選單時帶回 resume_game，
 * Godot 只接受同一場、目前開著的那個選單的關閉命令（過期的命令不改速度）
 */
export interface DeployMenuRef {
  battle_id: string;
  menu_id: number;
}

/** click_cell 的選單識別：battle_id 必須是目前這一場，menu_id 必須是正整數；不符合時是 null（不開選單） */
export function deployMenuRef(
  data: { battle_id?: unknown; menu_id?: unknown },
  currentBattleId: string | null | undefined
): DeployMenuRef | null {
  if (
    typeof data.battle_id !== "string" ||
    !currentBattleId ||
    data.battle_id !== currentBattleId ||
    typeof data.menu_id !== "number" ||
    !Number.isInteger(data.menu_id) ||
    data.menu_id <= 0
  ) {
    return null;
  }
  return { battle_id: data.battle_id, menu_id: data.menu_id };
}
