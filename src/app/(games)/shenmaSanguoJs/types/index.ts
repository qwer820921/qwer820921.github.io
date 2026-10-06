// 神馬三國 (JS版) 相關型別定義匯出

export * from "./render";
export type { StatsSyncData, BattleResultData } from "../engine/BattleManager";
export { GameState } from "../engine/BattleManager";
export type { WaveConfigData, WaveGroupConfig } from "../engine/WaveManager";
export type { HeroStateData, HeroConfigData } from "../engine/entities/HeroEntity";
export type { TowerConfigInfo } from "../engine/entities/TowerEntity";
export type { EnemyConfigData } from "../engine/entities/EnemyEntity";
export type { StagePayload } from "../engine/BattleEngine";
export type { PlacementMenuData } from "../engine/LocalGameBridge";
