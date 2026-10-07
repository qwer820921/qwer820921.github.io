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

export type SyncStatusType = "idle" | "syncing" | "pending" | "offline" | "error";

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
}
