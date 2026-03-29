/**
 * 塔防遊戲類型定義
 */

// ========== 基礎類型 ==========

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

// ========== 遊戲狀態 ==========

export enum GameStatus {
  IDLE = "idle",
  PLAYING = "playing",
  PAUSED = "paused",
  WAVE_COMPLETE = "wave_complete",
  WIN = "win",
  LOSE = "lose",
}

export enum GameSpeed {
  NORMAL = 1,
  FAST = 2,
  ULTRA = 4,
}

// ========== 格子系統 ==========

export enum CellType {
  PATH = "path",
  BUILDABLE = "buildable",
  BLOCKED = "blocked",
  SPAWN = "spawn",
  EXIT = "exit",
}

export interface GridCell {
  row: number;
  col: number;
  type: CellType;
  towerId?: string;
}

// ========== 敵人系統 ==========

export enum EnemyType {
  SLIME = "slime",
  GOBLIN = "goblin",
  ORC = "orc",
  DRAGON = "dragon",
}

export interface EnemyConfig {
  type: EnemyType;
  name: string;
  maxHealth: number;
  speed: number; // 像素/秒
  reward: number; // 擊殺獎勵
  damage: number; // 對玩家生命值的傷害
  size: number;
  color: string;
}

export interface Enemy {
  id: string;
  type: EnemyType;
  position: Point;
  health: number;
  maxHealth: number;
  speed: number;
  pathIndex: number;
  pathProgress: number;
  reward: number;
  damage: number;
  size: number;
  color: string;
  isDead: boolean;
  slowAmount: number; // 減速效果 (0-1)
}

// ========== 塔系統 ==========

export enum TowerType {
  BASIC = "basic",
  ARCHER = "archer",
  CANNON = "cannon",
  MAGIC = "magic",
}

export enum AttackType {
  SINGLE = "single",
  AOE = "aoe",
  SLOW = "slow",
}

export interface TowerConfig {
  type: TowerType;
  name: string;
  description: string;
  cost: number;
  damage: number;
  range: number;
  attackSpeed: number; // 攻擊間隔(ms)
  attackType: AttackType;
  projectileSpeed: number;
  aoeRadius?: number;
  slowAmount?: number;
  color: string;
  icon: string;
}

export interface Tower {
  id: string;
  type: TowerType;
  position: Point;
  gridPosition: { row: number; col: number };
  damage: number;
  range: number;
  attackSpeed: number;
  attackType: AttackType;
  projectileSpeed: number;
  aoeRadius?: number;
  slowAmount?: number;
  color: string;
  lastAttackTime: number;
  target?: Enemy;
  level: number;
}

// ========== 投射物系統 ==========

export interface Projectile {
  id: string;
  position: Point;
  target: Enemy;
  damage: number;
  speed: number;
  attackType: AttackType;
  aoeRadius?: number;
  slowAmount?: number;
  color: string;
  hasHit: boolean;
}

// ========== 波次系統 ==========

export interface WaveConfig {
  waveNumber: number;
  enemies: Array<{
    type: EnemyType;
    count: number;
    interval: number; // 生成間隔(ms)
    delay?: number; // 延遲生成(ms)
  }>;
  delay: number; // 波次間隔(ms)
}

// ========== 遊戲狀態 ==========

export interface GameState {
  status: GameStatus;
  speed: GameSpeed;
  gold: number;
  lives: number;
  currentWave: number;
  totalWaves: number;
  score: number;
  enemies: Enemy[];
  towers: Tower[];
  projectiles: Projectile[];
  selectedTowerType: TowerType | null;
  hoveredCell: { row: number; col: number } | null;
}

// ========== 關卡系統 ==========

export enum LevelDifficulty {
  EASY = "easy",
  MEDIUM = "medium",
  HARD = "hard",
  EXTREME = "extreme",
}

export interface LevelRewards {
  gold: number;
  stars: number;
}

export interface Level {
  id: number;
  name: string;
  description: string;
  difficulty: LevelDifficulty;
  initialGold: number;
  initialLives: number;
  waves: WaveConfig[];
  rewards: LevelRewards;
  mapPath?: Point[]; // 可選：自定義地圖路徑，如果未提供則使用默認路徑
}

export interface LevelData {
  levels: Level[];
}
