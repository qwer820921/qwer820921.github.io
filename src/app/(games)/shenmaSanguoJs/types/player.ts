/**
 * player.ts
 * 神馬三國 JS 版 玩家帳號、資產、出征隊伍與存檔型別定義
 */

export interface PlayerHeroState {
  hero_id: string;
  level: number;
  star: number;
  atk: number;
  def: number;
  hp: number;
}

export interface TeamSlot {
  slot: number; // 0 ~ 4
  hero_id: string;
}

/**
 * 存檔狀態（畫面說明用）。共用帳號另外有：readonly（存檔格式不對，只能看）、conflict（雲端有較新的版本，剛才的修改沒有保存）、
 * unknown（保存的結果不明，要先手動同步確認）
 */
export type SyncStatusType =
  | "idle"
  | "syncing"
  | "pending"
  | "offline"
  | "error"
  | "readonly"
  | "conflict"
  | "unknown";

export interface PlayerState {
  key: string;
  nickname: string;
  level: number;
  exp: number;
  gold: number; // 世界點數 / 金幣 (用於武將升級)
  capacity: number; // 隊伍出陣 Cost 上限
  max_stage: string; // 最高通關關卡 (例如 "chapter1_1")
  cleared_stages: Record<string, number>; // 通關星級 { "chapter1_1": 3 }
  heroes: PlayerHeroState[]; // 擁有的所有武將
  team: TeamSlot[]; // 5 個出征槽位
  serverRev?: number; // 雲端版本號
  updatedAt?: number;
}

export interface BattleRewardResult {
  stars: number;
  expEarned: number;
  goldEarned: number;
  leveledUp: boolean;
  newLevel: number;
  stageUnlocked?: string;
  /** 共用帳號：這場的結算沒有寫入雲端進度（兩版的結算規則對齊前暫停），沒有發獎勵也沒有解鎖 */
  notSaved?: boolean;
}
