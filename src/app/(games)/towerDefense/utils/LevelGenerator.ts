/**
 * 關卡生成器工具
 * 快速生成新關卡配置
 */

import { Level, LevelDifficulty, EnemyType } from "../types";

export interface QuickLevelConfig {
  name: string;
  description: string;
  difficulty: LevelDifficulty;
  waveCount?: number;
}

export class LevelGenerator {
  /**
   * 根據難度生成推薦的初始資源
   */
  static getRecommendedResources(difficulty: LevelDifficulty): {
    gold: number;
    lives: number;
  } {
    switch (difficulty) {
      case LevelDifficulty.EASY:
        return { gold: 600, lives: 20 };
      case LevelDifficulty.MEDIUM:
        return { gold: 800, lives: 15 };
      case LevelDifficulty.HARD:
        return { gold: 1000, lives: 12 };
      case LevelDifficulty.EXTREME:
        return { gold: 1500, lives: 10 };
      default:
        return { gold: 500, lives: 20 };
    }
  }

  /**
   * 根據難度生成推薦的獎勵
   */
  static getRecommendedRewards(difficulty: LevelDifficulty): {
    gold: number;
    stars: number;
  } {
    switch (difficulty) {
      case LevelDifficulty.EASY:
        return { gold: 200, stars: 3 };
      case LevelDifficulty.MEDIUM:
        return { gold: 400, stars: 3 };
      case LevelDifficulty.HARD:
        return { gold: 600, stars: 3 };
      case LevelDifficulty.EXTREME:
        return { gold: 1000, stars: 3 };
      default:
        return { gold: 200, stars: 3 };
    }
  }

  /**
   * 生成簡單的波次配置
   */
  static generateSimpleWaves(
    difficulty: LevelDifficulty,
    waveCount: number = 3
  ) {
    const waves = [];

    for (let i = 1; i <= waveCount; i++) {
      const wave = {
        waveNumber: i,
        enemies: this.generateEnemiesForWave(difficulty, i, waveCount),
        delay: this.getWaveDelay(difficulty, i),
      };
      waves.push(wave);
    }

    return waves;
  }

  /**
   * 為特定波次生成敵人配置
   */
  private static generateEnemiesForWave(
    difficulty: LevelDifficulty,
    waveNumber: number,
    totalWaves: number
  ) {
    const enemies = [];
    const progress = waveNumber / totalWaves; // 0.33, 0.66, 1.0

    // 根據難度和進度選擇敵人
    if (difficulty === LevelDifficulty.EASY) {
      if (progress < 0.5) {
        enemies.push({
          type: EnemyType.SLIME,
          count: 10 + waveNumber * 2,
          interval: 1000,
        });
      } else if (progress < 0.8) {
        enemies.push({ type: EnemyType.SLIME, count: 10, interval: 800 });
        enemies.push({
          type: EnemyType.GOBLIN,
          count: 5,
          interval: 1500,
          delay: 5000,
        });
      } else {
        enemies.push({ type: EnemyType.GOBLIN, count: 12, interval: 1000 });
        enemies.push({
          type: EnemyType.ORC,
          count: 3,
          interval: 2000,
          delay: 6000,
        });
      }
    } else if (difficulty === LevelDifficulty.MEDIUM) {
      if (progress < 0.4) {
        enemies.push({ type: EnemyType.GOBLIN, count: 12, interval: 1000 });
      } else if (progress < 0.7) {
        enemies.push({ type: EnemyType.GOBLIN, count: 15, interval: 800 });
        enemies.push({
          type: EnemyType.ORC,
          count: 5,
          interval: 1500,
          delay: 5000,
        });
      } else {
        enemies.push({ type: EnemyType.ORC, count: 10, interval: 1200 });
        enemies.push({
          type: EnemyType.DRAGON,
          count: 2,
          interval: 4000,
          delay: 8000,
        });
      }
    } else if (difficulty === LevelDifficulty.HARD) {
      if (progress < 0.5) {
        enemies.push({ type: EnemyType.ORC, count: 10, interval: 1200 });
        enemies.push({
          type: EnemyType.DRAGON,
          count: 2,
          interval: 5000,
          delay: 6000,
        });
      } else {
        enemies.push({ type: EnemyType.GOBLIN, count: 20, interval: 700 });
        enemies.push({
          type: EnemyType.ORC,
          count: 12,
          interval: 1200,
          delay: 5000,
        });
        enemies.push({
          type: EnemyType.DRAGON,
          count: 4,
          interval: 3000,
          delay: 12000,
        });
      }
    } else {
      // EXTREME
      enemies.push({
        type: EnemyType.SLIME,
        count: 20 + waveNumber * 5,
        interval: 500,
      });
      enemies.push({
        type: EnemyType.GOBLIN,
        count: 15 + waveNumber * 3,
        interval: 800,
        delay: 4000,
      });
      enemies.push({
        type: EnemyType.ORC,
        count: 10 + waveNumber * 2,
        interval: 1200,
        delay: 10000,
      });
      enemies.push({
        type: EnemyType.DRAGON,
        count: 5 + waveNumber,
        interval: 2500,
        delay: 15000,
      });
    }

    return enemies;
  }

  /**
   * 獲取波次間隔時間
   */
  private static getWaveDelay(
    difficulty: LevelDifficulty,
    waveNumber: number
  ): number {
    const baseDelay = {
      [LevelDifficulty.EASY]: 8000,
      [LevelDifficulty.MEDIUM]: 12000,
      [LevelDifficulty.HARD]: 15000,
      [LevelDifficulty.EXTREME]: 20000,
    };

    return baseDelay[difficulty] + waveNumber * 1000;
  }

  /**
   * 快速生成完整關卡配置
   */
  static generateLevel(id: number, config: QuickLevelConfig): Partial<Level> {
    const resources = this.getRecommendedResources(config.difficulty);
    const rewards = this.getRecommendedRewards(config.difficulty);
    const waves = this.generateSimpleWaves(
      config.difficulty,
      config.waveCount || 3
    );

    return {
      id,
      name: config.name,
      description: config.description,
      difficulty: config.difficulty,
      initialGold: resources.gold,
      initialLives: resources.lives,
      waves,
      rewards,
    };
  }

  /**
   * 生成關卡 JSON 字串
   */
  static generateLevelJSON(id: number, config: QuickLevelConfig): string {
    const level = this.generateLevel(id, config);
    return JSON.stringify(level, null, 2);
  }
}

// 使用範例
if (require.main === module) {
  // 範例：生成一個中等難度的關卡
  const newLevel = LevelGenerator.generateLevel(6, {
    name: "暗影森林",
    description: "黑暗中潛伏著危險的敵人",
    difficulty: LevelDifficulty.MEDIUM,
    waveCount: 4,
  });

  console.log("生成的關卡配置：");
  console.log(JSON.stringify(newLevel, null, 2));
  console.log("\n複製上面的 JSON 並添加到 levels.json 的 levels 陣列中");
}
