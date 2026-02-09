/**
 * 遊戲狀態管理 (Zustand Store)
 */

import { create } from "zustand";
import {
  GameState,
  GameStatus,
  GameSpeed,
  Enemy,
  Tower,
  Projectile,
  TowerType,
  GridCell,
} from "../types";
import { GAME } from "../config/constants";
import { initializeGrid, setCurrentPath } from "../config/mapConfig";
import { levelManager } from "../core/LevelManager";
import { getPathForLevel } from "../config/mapPaths";

interface GameStore extends GameState {
  grid: GridCell[][];
  selectedTower: Tower | null;
  currentLevelId: number;

  // 遊戲控制
  startGame: () => void;
  pauseGame: () => void;
  resumeGame: () => void;
  resetGame: () => void;
  setSpeed: (speed: GameSpeed) => void;

  // 關卡管理
  loadLevel: (levelId: number) => void;
  nextLevel: () => void;

  // 敵人管理
  addEnemy: (enemy: Enemy) => void;
  removeEnemy: (enemyId: string) => void;
  updateEnemy: (enemyId: string, updates: Partial<Enemy>) => void;

  // 塔管理
  addTower: (tower: Tower) => void;
  removeTower: (towerId: string) => void;
  selectTowerType: (towerType: TowerType | null) => void;
  selectTower: (tower: Tower | null) => void;
  setHoveredCell: (cell: { row: number; col: number } | null) => void;

  // 投射物管理
  addProjectile: (projectile: Projectile) => void;
  removeProjectile: (projectileId: string) => void;

  // 遊戲數值
  addGold: (amount: number) => void;
  spendGold: (amount: number) => boolean;
  loseLife: (amount: number) => void;
  nextWave: () => void;
  addScore: (amount: number) => void;
}

const initialState: GameState = {
  status: GameStatus.IDLE,
  speed: GameSpeed.NORMAL,
  gold: GAME.STARTING_GOLD,
  lives: GAME.STARTING_LIVES,
  currentWave: 0,
  totalWaves: 10,
  score: 0,
  enemies: [],
  towers: [],
  projectiles: [],
  selectedTowerType: null,
  hoveredCell: null,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,
  grid: initializeGrid(),
  selectedTower: null,
  currentLevelId: 1,

  // ========== 遊戲控制 ==========

  startGame: () => {
    const { currentLevelId } = get();
    const level = levelManager.getLevelById(currentLevelId);

    if (level) {
      set({
        status: GameStatus.PLAYING,
        currentWave: 1,
        gold: level.initialGold,
        lives: level.initialLives,
        totalWaves: level.waves.length,
      });
    } else {
      set({
        status: GameStatus.PLAYING,
        currentWave: 1,
      });
    }
  },

  pauseGame: () => {
    set({ status: GameStatus.PAUSED });
  },

  resumeGame: () => {
    set({ status: GameStatus.PLAYING });
  },

  resetGame: () => {
    const { currentLevelId } = get();
    const level = levelManager.getLevelById(currentLevelId);

    // 獲取當前關卡的地圖路徑
    const levelPath = getPathForLevel(currentLevelId, level?.mapPath);

    // 設置當前路徑
    setCurrentPath(levelPath);

    // 用當前關卡路徑重新初始化地圖
    const newGrid = initializeGrid(levelPath);

    set({
      ...initialState,
      grid: newGrid,
      selectedTower: null,
      currentLevelId,
      gold: level?.initialGold || GAME.STARTING_GOLD,
      lives: level?.initialLives || GAME.STARTING_LIVES,
      totalWaves: level?.waves.length || 10,
    });
  },

  setSpeed: (speed: GameSpeed) => {
    set({ speed });
  },

  // ========== 關卡管理 ==========

  loadLevel: (levelId: number) => {
    const level = levelManager.getLevelById(levelId);

    if (level) {
      levelManager.setCurrentLevel(levelId);

      // 獲取關卡的地圖路徑
      const levelPath = getPathForLevel(levelId, level.mapPath);

      // 設置當前路徑
      setCurrentPath(levelPath);

      // 用新路徑重新初始化地圖
      const newGrid = initializeGrid(levelPath);

      set({
        ...initialState,
        grid: newGrid,
        selectedTower: null,
        currentLevelId: levelId,
        gold: level.initialGold,
        lives: level.initialLives,
        totalWaves: level.waves.length,
      });
    }
  },

  nextLevel: () => {
    const hasNext = levelManager.goToNextLevel();

    if (hasNext) {
      const nextLevel = levelManager.getCurrentLevel();
      if (nextLevel) {
        // 獲取下一關的地圖路徑
        const levelPath = getPathForLevel(nextLevel.id, nextLevel.mapPath);

        // 設置當前路徑
        setCurrentPath(levelPath);

        // 用新路徑重新初始化地圖
        const newGrid = initializeGrid(levelPath);

        set({
          ...initialState,
          grid: newGrid,
          selectedTower: null,
          currentLevelId: nextLevel.id,
          gold: nextLevel.initialGold,
          lives: nextLevel.initialLives,
          totalWaves: nextLevel.waves.length,
        });
      }
    }
  },

  // ========== 敵人管理 ==========

  addEnemy: (enemy: Enemy) => {
    set((state) => ({
      enemies: [...state.enemies, enemy],
    }));
  },

  removeEnemy: (enemyId: string) => {
    set((state) => ({
      enemies: state.enemies.filter((e) => e.id !== enemyId),
    }));
  },

  updateEnemy: (enemyId: string, updates: Partial<Enemy>) => {
    set((state) => ({
      enemies: state.enemies.map((e) =>
        e.id === enemyId ? { ...e, ...updates } : e
      ),
    }));
  },

  // ========== 塔管理 ==========

  addTower: (tower: Tower) => {
    const { grid } = get();
    const { row, col } = tower.gridPosition;

    // 更新格子狀態
    if (grid[row] && grid[row][col]) {
      grid[row][col].towerId = tower.id;
    }

    set((state) => ({
      towers: [...state.towers, tower],
      grid: [...grid],
    }));
  },

  removeTower: (towerId: string) => {
    const { grid, towers } = get();
    const tower = towers.find((t) => t.id === towerId);

    if (tower) {
      const { row, col } = tower.gridPosition;
      if (grid[row] && grid[row][col]) {
        grid[row][col].towerId = undefined;
      }
    }

    set((state) => ({
      towers: state.towers.filter((t) => t.id !== towerId),
      grid: [...grid],
      selectedTower:
        state.selectedTower?.id === towerId ? null : state.selectedTower,
    }));
  },

  selectTowerType: (towerType: TowerType | null) => {
    set({ selectedTowerType: towerType });
  },

  selectTower: (tower: Tower | null) => {
    set({ selectedTower: tower });
  },

  setHoveredCell: (cell: { row: number; col: number } | null) => {
    set({ hoveredCell: cell });
  },

  // ========== 投射物管理 ==========

  addProjectile: (projectile: Projectile) => {
    set((state) => ({
      projectiles: [...state.projectiles, projectile],
    }));
  },

  removeProjectile: (projectileId: string) => {
    set((state) => ({
      projectiles: state.projectiles.filter((p) => p.id !== projectileId),
    }));
  },

  // ========== 遊戲數值 ==========

  addGold: (amount: number) => {
    set((state) => ({
      gold: state.gold + amount,
    }));
  },

  spendGold: (amount: number) => {
    const { gold } = get();
    if (gold >= amount) {
      set({ gold: gold - amount });
      return true;
    }
    return false;
  },

  loseLife: (amount: number) => {
    set((state) => {
      const newLives = Math.max(0, state.lives - amount);
      return {
        lives: newLives,
        status: newLives <= 0 ? GameStatus.LOSE : state.status,
      };
    });
  },

  nextWave: () => {
    set((state) => {
      const newWave = state.currentWave + 1;
      if (newWave > state.totalWaves) {
        return {
          status: GameStatus.WIN,
        };
      }
      return {
        currentWave: newWave,
        status: GameStatus.PLAYING,
      };
    });
  },

  addScore: (amount: number) => {
    set((state) => ({
      score: state.score + amount,
    }));
  },
}));
