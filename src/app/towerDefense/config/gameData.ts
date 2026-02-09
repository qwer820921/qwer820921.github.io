/**
 * 遊戲資料配置
 */

import {
  EnemyType,
  EnemyConfig,
  TowerType,
  TowerConfig,
  AttackType,
  WaveConfig,
} from "../types";

// ========== 敵人配置 ==========

export const ENEMY_CONFIGS: Record<EnemyType, EnemyConfig> = {
  [EnemyType.SLIME]: {
    type: EnemyType.SLIME,
    name: "史萊姆",
    maxHealth: 100,
    speed: 50, // 像素/秒
    reward: 10,
    damage: 1,
    size: 20,
    color: "#48bb78",
  },
  [EnemyType.GOBLIN]: {
    type: EnemyType.GOBLIN,
    name: "哥布林",
    maxHealth: 200,
    speed: 70,
    reward: 20,
    damage: 2,
    size: 24,
    color: "#ed8936",
  },
  [EnemyType.ORC]: {
    type: EnemyType.ORC,
    name: "獸人",
    maxHealth: 400,
    speed: 40,
    reward: 40,
    damage: 3,
    size: 28,
    color: "#e53e3e",
  },
  [EnemyType.DRAGON]: {
    type: EnemyType.DRAGON,
    name: "飛龍",
    maxHealth: 1000,
    speed: 60,
    reward: 100,
    damage: 5,
    size: 32,
    color: "#9f7aea",
  },
};

// ========== 塔配置 ==========

export const TOWER_CONFIGS: Record<TowerType, TowerConfig> = {
  [TowerType.BASIC]: {
    type: TowerType.BASIC,
    name: "基礎塔",
    description: "基礎防禦塔，攻擊速度快",
    cost: 100,
    damage: 20,
    range: 180, // 增加到 3 格距離
    attackSpeed: 1000, // 1秒攻擊一次
    attackType: AttackType.SINGLE,
    projectileSpeed: 300,
    color: "#667eea",
    icon: "🗼",
  },
  [TowerType.ARCHER]: {
    type: TowerType.ARCHER,
    name: "弓箭塔",
    description: "射程遠，傷害中等",
    cost: 150,
    damage: 30,
    range: 240, // 增加到 4 格距離
    attackSpeed: 1500,
    attackType: AttackType.SINGLE,
    projectileSpeed: 400,
    color: "#48bb78",
    icon: "🏹",
  },
  [TowerType.CANNON]: {
    type: TowerType.CANNON,
    name: "火砲塔",
    description: "範圍攻擊，傷害高",
    cost: 250,
    damage: 50,
    range: 200, // 增加到 3.3 格距離
    attackSpeed: 2500,
    attackType: AttackType.AOE,
    projectileSpeed: 200,
    aoeRadius: 80, // 增加 AOE 範圍
    color: "#f56565",
    icon: "💣",
  },
  [TowerType.MAGIC]: {
    type: TowerType.MAGIC,
    name: "魔法塔",
    description: "減速敵人，輔助防禦",
    cost: 200,
    damage: 15,
    range: 200, // 增加到 3.3 格距離
    attackSpeed: 1200,
    attackType: AttackType.SLOW,
    projectileSpeed: 350,
    slowAmount: 0.5, // 減速 50%
    color: "#9f7aea",
    icon: "✨",
  },
};

// ========== 波次配置 ==========

export const WAVE_CONFIGS: WaveConfig[] = [
  // 第 1 波
  {
    waveNumber: 1,
    enemies: [{ type: EnemyType.SLIME, count: 10, interval: 1000 }],
    delay: 5000,
  },
  // 第 2 波
  {
    waveNumber: 2,
    enemies: [{ type: EnemyType.SLIME, count: 15, interval: 800 }],
    delay: 8000,
  },
  // 第 3 波
  {
    waveNumber: 3,
    enemies: [
      { type: EnemyType.SLIME, count: 10, interval: 1000 },
      { type: EnemyType.GOBLIN, count: 5, interval: 1500, delay: 5000 },
    ],
    delay: 10000,
  },
  // 第 4 波
  {
    waveNumber: 4,
    enemies: [{ type: EnemyType.GOBLIN, count: 12, interval: 1000 }],
    delay: 10000,
  },
  // 第 5 波 - Boss 波
  {
    waveNumber: 5,
    enemies: [
      { type: EnemyType.SLIME, count: 8, interval: 800 },
      { type: EnemyType.GOBLIN, count: 6, interval: 1200, delay: 3000 },
      { type: EnemyType.ORC, count: 3, interval: 2000, delay: 8000 },
    ],
    delay: 12000,
  },
  // 第 6 波
  {
    waveNumber: 6,
    enemies: [{ type: EnemyType.ORC, count: 8, interval: 1500 }],
    delay: 12000,
  },
  // 第 7 波
  {
    waveNumber: 7,
    enemies: [
      { type: EnemyType.GOBLIN, count: 15, interval: 800 },
      { type: EnemyType.ORC, count: 5, interval: 1800, delay: 5000 },
    ],
    delay: 15000,
  },
  // 第 8 波
  {
    waveNumber: 8,
    enemies: [
      { type: EnemyType.SLIME, count: 20, interval: 500 },
      { type: EnemyType.GOBLIN, count: 10, interval: 1000, delay: 3000 },
    ],
    delay: 15000,
  },
  // 第 9 波
  {
    waveNumber: 9,
    enemies: [
      { type: EnemyType.ORC, count: 10, interval: 1200 },
      { type: EnemyType.DRAGON, count: 2, interval: 5000, delay: 8000 },
    ],
    delay: 18000,
  },
  // 第 10 波 - 最終 Boss
  {
    waveNumber: 10,
    enemies: [
      { type: EnemyType.SLIME, count: 15, interval: 600 },
      { type: EnemyType.GOBLIN, count: 12, interval: 900, delay: 4000 },
      { type: EnemyType.ORC, count: 8, interval: 1500, delay: 10000 },
      { type: EnemyType.DRAGON, count: 5, interval: 3000, delay: 15000 },
    ],
    delay: 20000,
  },
];
