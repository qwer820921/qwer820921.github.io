/**
 * 關卡管理器
 * 負責載入和管理遊戲關卡
 */

import { Level, LevelData, WaveConfig } from "../types";
import levelsData from "../data/levels.json";

export class LevelManager {
  private levels: Level[];
  private currentLevelId: number = 1;

  constructor() {
    this.levels = (levelsData as LevelData).levels;
  }

  /**
   * 獲取所有關卡
   */
  getAllLevels(): Level[] {
    return this.levels;
  }

  /**
   * 根據 ID 獲取關卡
   */
  getLevelById(id: number): Level | undefined {
    return this.levels.find((level) => level.id === id);
  }

  /**
   * 獲取當前關卡
   */
  getCurrentLevel(): Level | undefined {
    return this.getLevelById(this.currentLevelId);
  }

  /**
   * 設置當前關卡
   */
  setCurrentLevel(id: number): boolean {
    const level = this.getLevelById(id);
    if (level) {
      this.currentLevelId = id;
      return true;
    }
    return false;
  }

  /**
   * 獲取下一關
   */
  getNextLevel(): Level | undefined {
    return this.getLevelById(this.currentLevelId + 1);
  }

  /**
   * 前往下一關
   */
  goToNextLevel(): boolean {
    const nextLevel = this.getNextLevel();
    if (nextLevel) {
      this.currentLevelId = nextLevel.id;
      return true;
    }
    return false;
  }

  /**
   * 獲取關卡總數
   */
  getTotalLevels(): number {
    return this.levels.length;
  }

  /**
   * 獲取關卡的波次配置
   */
  getLevelWaves(levelId: number): WaveConfig[] {
    const level = this.getLevelById(levelId);
    return level?.waves || [];
  }

  /**
   * 獲取關卡初始金幣
   */
  getLevelInitialGold(levelId: number): number {
    const level = this.getLevelById(levelId);
    return level?.initialGold || 500;
  }

  /**
   * 獲取關卡初始生命值
   */
  getLevelInitialLives(levelId: number): number {
    const level = this.getLevelById(levelId);
    return level?.initialLives || 20;
  }

  /**
   * 檢查是否為最後一關
   */
  isLastLevel(): boolean {
    return this.currentLevelId >= this.levels.length;
  }

  /**
   * 重置到第一關
   */
  reset(): void {
    this.currentLevelId = 1;
  }
}

// 單例模式
export const levelManager = new LevelManager();
