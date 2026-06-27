import type { StageConfig } from "../types";

export const STAGES: StageConfig[] = [
  // ===== 第 1 關：墓地前哨 =====
  {
    stageId: 1,
    name: "墓地前哨",
    backgroundTheme: "graveyard",
    unlockRequirement: null,
    statsMult: 1.0,
    waves: [
      {
        waveIndex: 1,
        isBossWave: false,
        preWaveMessage: "Wave 1",
        enemies: [
          {
            type: "skeleton",
            count: 12,
            spawnInterval: 900,
            spawnPattern: "random_x",
          },
        ],
      },
      {
        waveIndex: 2,
        isBossWave: false,
        preWaveMessage: "Wave 2",
        enemies: [
          {
            type: "skeleton",
            count: 8,
            spawnInterval: 700,
            spawnPattern: "random_x",
          },
          {
            type: "goblin",
            count: 6,
            spawnInterval: 600,
            spawnPattern: "random_x",
          },
        ],
      },
      {
        waveIndex: 3,
        isBossWave: false,
        preWaveMessage: "Wave 3 — 注意史萊姆會分裂！",
        enemies: [
          {
            type: "slime",
            count: 4,
            spawnInterval: 1200,
            spawnPattern: "random_x",
          },
          {
            type: "skeleton",
            count: 8,
            spawnInterval: 700,
            spawnPattern: "random_x",
          },
        ],
      },
      {
        waveIndex: 4,
        isBossWave: false,
        preWaveMessage: "Wave 4 — 鐵甲騎士！",
        enemies: [
          {
            type: "goblin",
            count: 10,
            spawnInterval: 550,
            spawnPattern: "random_x",
          },
          {
            type: "armored_knight",
            count: 2,
            spawnInterval: 2500,
            spawnPattern: "sides",
          },
        ],
      },
      {
        waveIndex: 5,
        isBossWave: false,
        preWaveMessage: "Wave 5 — 最終雜兵波！",
        enemies: [
          {
            type: "man_eater_flower",
            count: 2,
            spawnInterval: 2500,
            spawnPattern: "sides",
          },
          {
            type: "bat",
            count: 8,
            spawnInterval: 600,
            spawnPattern: "random_x",
          },
          {
            type: "goblin",
            count: 8,
            spawnInterval: 550,
            spawnPattern: "random_x",
          },
        ],
      },
      {
        waveIndex: 6,
        isBossWave: true,
        bossType: "dungeon_lord",
        enemies: [],
        preWaveMessage: "⚔️ 地城領主 — 降臨！",
      },
    ],
  },

  // ===== 第 2 關：地下迷宮 =====
  {
    stageId: 2,
    name: "地下迷宮",
    backgroundTheme: "dungeon",
    unlockRequirement: 1,
    statsMult: 1.3,
    waves: [
      {
        waveIndex: 1,
        isBossWave: false,
        preWaveMessage: "Wave 1",
        enemies: [
          {
            type: "goblin",
            count: 14,
            spawnInterval: 550,
            spawnPattern: "random_x",
          },
          {
            type: "skeleton",
            count: 8,
            spawnInterval: 700,
            spawnPattern: "sides",
          },
        ],
      },
      {
        waveIndex: 2,
        isBossWave: false,
        preWaveMessage: "Wave 2",
        enemies: [
          {
            type: "bat",
            count: 12,
            spawnInterval: 500,
            spawnPattern: "random_x",
          },
          {
            type: "armored_knight",
            count: 3,
            spawnInterval: 2000,
            spawnPattern: "sides",
          },
        ],
      },
      {
        waveIndex: 3,
        isBossWave: false,
        preWaveMessage: "Wave 3",
        enemies: [
          {
            type: "slime",
            count: 6,
            spawnInterval: 900,
            spawnPattern: "random_x",
          },
          {
            type: "goblin",
            count: 12,
            spawnInterval: 500,
            spawnPattern: "random_x",
          },
        ],
      },
      {
        waveIndex: 4,
        isBossWave: false,
        preWaveMessage: "Wave 4",
        enemies: [
          {
            type: "armored_knight",
            count: 4,
            spawnInterval: 1800,
            spawnPattern: "sides",
          },
          {
            type: "bat",
            count: 14,
            spawnInterval: 450,
            spawnPattern: "random_x",
          },
        ],
      },
      {
        waveIndex: 5,
        isBossWave: false,
        preWaveMessage: "Wave 5 — 最終雜兵波！",
        enemies: [
          {
            type: "man_eater_flower",
            count: 3,
            spawnInterval: 2000,
            spawnPattern: "sides",
          },
          {
            type: "skeleton",
            count: 12,
            spawnInterval: 600,
            spawnPattern: "random_x",
          },
          {
            type: "bat",
            count: 10,
            spawnInterval: 500,
            spawnPattern: "random_x",
          },
        ],
      },
      {
        waveIndex: 6,
        isBossWave: true,
        bossType: "spider_queen",
        enemies: [],
        preWaveMessage: "🕷️ 巨型蜘蛛王 — 降臨！",
      },
    ],
  },
];

export function getStage(stageId: number): StageConfig | undefined {
  return STAGES.find((s) => s.stageId === stageId);
}

export const STAGE_BONUS_SOULS: Record<number, number> = {
  1: 50,
  2: 80,
};
