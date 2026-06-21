// ===== 輸入 =====
export type MoveDirection = -1 | 0 | 1;

// ===== 武器類型 =====
export type WeaponType =
  | "basic_shot"
  | "orbit_blade"
  | "multi_arrow"
  | "aoe_orb";

// ===== 子彈來源（含 Boss / 敵人彈幕） =====
export type BulletSource = WeaponType | "boss_projectile" | "enemy_projectile";

// ===== 被動類型 =====
export type PassiveType =
  | "damage_up"
  | "attack_speed_up"
  | "move_speed_up"
  | "base_hp_up"
  | "range_up";

// ===== 遊戲狀態機 =====
export type GamePhase =
  | "IDLE"
  | "PLAYING"
  | "WAVE_TRANSITION"
  | "SKILL_SELECT"
  | "PAUSED"
  | "BOSS_FIGHT"
  | "STAGE_CLEAR"
  | "GAME_OVER";

// ===== 移動模式（敵人用） =====
export type MovePattern = "straight" | "sinusoidal" | "stationary";

// ===== 敵人類型（不含 Boss） =====
export type EnemyType =
  | "skeleton"
  | "goblin"
  | "slime"
  | "armored_knight"
  | "man_eater_flower"
  | "bat";

// ===== Boss 相關 =====
export type BossType = "dungeon_lord" | "spider_queen";
export type BossPhase =
  | "PHASE_MOVE"
  | "PHASE_1"
  | "PHASE_ARMOR_BREAK"
  | "PHASE_2";

// ===== 永久強化類型 =====
export type PermanentUpgradeType = "base_atk" | "base_hp" | "start_weapon";

// ===== 被動疊加數值 =====
export interface PassiveStack {
  damageMultiplier: number;
  attackSpeedMultiplier: number;
  moveSpeedMultiplier: number;
  baseHpBonus: number;
  rangeMultiplier: number;
}

// ===== 武器（單局內裝備） =====
export interface ActiveWeapon {
  type: WeaponType;
  level: number; // 1–5
  attackTimer: number; // ms 距下次攻擊倒計時
  orbitAngle?: number; // 環繞刃專用：目前旋轉角度（rad）
}

// ===== 玩家 =====
export interface Player {
  x: number;
  y: number; // 固定值
  width: number; // 32
  height: number; // 48
  baseSpeed: number; // 200 px/s
  weapons: ActiveWeapon[];
  passiveStack: PassiveStack;
}

// ===== 基地 =====
export interface Base {
  x: number;
  y: number;
  width: number;
  height: number;
  maxHp: number;
  currentHp: number;
}

// ===== 子彈 =====
export interface Bullet {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number;
  vy: number;
  damage: number;
  piercing: boolean;
  sourceType: BulletSource;
  isAlive: boolean;
  hitEnemies: Set<number>;
}

// ===== 敵人（雜兵，不含 Boss） =====
export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  armor: number;
  speed: number;
  movePattern: MovePattern;
  sinPhase?: number;
  stationaryY?: number;
  stationaryTimer?: number;
  damageToBase: number;
  souls: number;
  exp: number;
  isAlive: boolean;
  splitLevel?: number;
  flashTimer?: number;
}

// ===== Boss（獨立介面，不繼承 Enemy） =====
export interface Boss {
  id: number;
  type: BossType;
  x: number;
  y: number;
  width: number;
  height: number;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  phase: BossPhase;
  phaseTimer: number;
  attackTimer: number;
  weakPointExposed: boolean;
  damageMultiplierWhenExposed: number;
  souls: number;
  exp: number;
  isAlive: boolean;
  flashTimer?: number;
}

// ===== 粒子特效 =====
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  radius: number;
  color: string;
  isAlive: boolean;
}

// ===== 技能選項（三選一用） =====
export interface SkillOption {
  id: string;
  skillType: "weapon" | "passive";
  weaponType?: WeaponType;
  passiveType?: PassiveType;
  currentLevel: number;
  nextLevel: number;
  name: string;
  description: string;
  icon: string;
}

// ===== 波次設定 =====
export interface WaveEnemyEntry {
  type: EnemyType;
  count: number;
  spawnInterval: number;
  spawnPattern: "sequential" | "random_x" | "sides";
}

export interface SpawnQueueItem {
  type: EnemyType;
  delay: number;
  spawnPattern: WaveEnemyEntry["spawnPattern"];
}

export interface WaveConfig {
  waveIndex: number;
  enemies: WaveEnemyEntry[];
  isBossWave: boolean;
  bossType?: BossType;
  preWaveMessage?: string;
}

export interface StageConfig {
  stageId: number;
  name: string;
  waves: WaveConfig[];
  backgroundTheme: "graveyard" | "dungeon" | "castle";
  unlockRequirement: number | null;
  statsMult?: number; // 敵人血量/速度倍率，預設 1.0
}

// ===== 永久存檔 =====
export interface SaveData {
  totalSouls: number;
  clearedStages: number[];
  permanentUpgrades: Record<PermanentUpgradeType, number>;
}

// ===== 結算資料（傳給 ResultScreen） =====
export interface ResultScreenData {
  outcome: "stage_clear" | "game_over";
  wavesCleared: number;
  totalWaves: number;
  soulsEarned: number;
  stageBonusSouls: number;
}

// ===== 遊戲事件（engine → React） =====
export type GameEvent =
  | { type: "PHASE_CHANGE"; phase: GamePhase }
  | { type: "RESULT"; data: ResultScreenData }
  | { type: "SKILL_SELECT_NEEDED"; options: SkillOption[] };
