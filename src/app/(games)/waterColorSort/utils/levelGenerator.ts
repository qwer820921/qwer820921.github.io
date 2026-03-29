import { Color, TubeState } from "../types";
import { TUBE_CAPACITY } from "./gameLogic";

const COLOR_PALETTE: Color[] = [
  "#FF0000", // Red
  "#00FF00", // Green
  "#0000FF", // Blue
  "#FFFF00", // Yellow
  "#FF00FF", // Magenta
  "#00FFFF", // Cyan
  "#FFA500", // Orange
  "#800080", // Purple
  "#A52A2A", // Brown
  "#808080", // Gray
  "#FFFFFF", // White
  "#000000", // Black
  "#FFC0CB", // Pink
  "#40E0D0", // Turquoise
];

export interface LevelConfig {
  numColors: number;
  numEmptyTubes: number;
  mixCount: number;
}

/**
 * 根據關卡等級計算難度參數
 */
export const getLevelConfig = (level: number): LevelConfig => {
  const numColors = Math.min(3 + Math.floor(level / 5), 12);
  const numEmptyTubes = level > 50 ? 1 : 2;
  const mixCount = 10 + level * 5;
  return { numColors, numEmptyTubes, mixCount };
};

/**
 * 生成隨機關卡
 */
export const generateLevel = (level: number): TubeState[] => {
  const { numColors, numEmptyTubes, mixCount } = getLevelConfig(level);
  const colors = COLOR_PALETTE.slice(0, numColors);

  // 1. 初始化目標狀態
  const tubes: TubeState[] = [];
  for (let i = 0; i < numColors; i++) {
    tubes.push({
      id: `tube-${i}`,
      colors: Array(TUBE_CAPACITY).fill(colors[i]),
      capacity: TUBE_CAPACITY,
    });
  }

  // 2. 加入空管子
  for (let i = 0; i < numEmptyTubes; i++) {
    tubes.push({
      id: `tube-empty-${i}`,
      colors: [],
      capacity: TUBE_CAPACITY,
    });
  }

  // 3. 反向隨機傾倒來打亂棋盤
  // (簡單的隨機交換打亂，確保至少有一種解法存在)
  for (let m = 0; m < mixCount; m++) {
    const fromIndex = Math.floor(Math.random() * tubes.length);
    const toIndex = Math.floor(Math.random() * tubes.length);

    if (fromIndex === toIndex) continue;

    const from = tubes[fromIndex];
    const to = tubes[toIndex];

    // 只有當 source 瓶有水 且 target 瓶有位子時 才能移動
    if (from.colors.length > 0 && to.colors.length < to.capacity) {
      // 隨機彈出 1 個顏色並移至另一個瓶子
      const colorToMove = from.colors.pop()!;
      to.colors.push(colorToMove);
    }
  }

  return tubes;
};
