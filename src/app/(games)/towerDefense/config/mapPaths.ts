/**
 * 地圖路徑配置集合
 * 為不同關卡提供不同的地圖路徑
 */

import { Point } from "../types";

// 默認路徑 (原始路徑)
export const DEFAULT_PATH: Point[] = [
  { x: 0, y: 390 }, // 起點 (左側, row 6)
  { x: 270, y: 390 }, // 向右 (col 4)
  { x: 270, y: 150 }, // 向上 (row 2)
  { x: 570, y: 150 }, // 向右 (col 9)
  { x: 570, y: 510 }, // 向下 (row 8)
  { x: 870, y: 510 }, // 向右 (col 14)
  { x: 870, y: 270 }, // 向上 (row 4)
  { x: 1200, y: 270 }, // 終點 (右側)
];

// 路徑 1: 簡單直線 (新手村)
export const PATH_STRAIGHT: Point[] = [
  { x: 0, y: 390 }, // 起點
  { x: 300, y: 390 },
  { x: 600, y: 390 },
  { x: 900, y: 390 },
  { x: 1200, y: 390 }, // 終點 (直線)
];

// 路徑 2: S形彎道 (森林邊境)
export const PATH_S_CURVE: Point[] = [
  { x: 0, y: 210 }, // 起點 (上方)
  { x: 270, y: 210 },
  { x: 270, y: 450 }, // 向下
  { x: 570, y: 450 },
  { x: 570, y: 210 }, // 向上
  { x: 870, y: 210 },
  { x: 870, y: 450 }, // 向下
  { x: 1200, y: 450 }, // 終點
];

// 路徑 3: 螺旋路徑 (獸人高地)
export const PATH_SPIRAL: Point[] = [
  { x: 0, y: 390 }, // 起點 (中間)
  { x: 210, y: 390 },
  { x: 210, y: 210 }, // 向上
  { x: 510, y: 210 },
  { x: 510, y: 570 }, // 向下
  { x: 810, y: 570 },
  { x: 810, y: 330 }, // 向上
  { x: 1200, y: 330 }, // 終點
];

// 路徑 4: Z字形 (龍之巢穴)
export const PATH_ZIGZAG: Point[] = [
  { x: 0, y: 150 }, // 起點 (上方)
  { x: 330, y: 150 },
  { x: 330, y: 450 }, // 向下
  { x: 630, y: 450 },
  { x: 630, y: 210 }, // 向上
  { x: 930, y: 210 },
  { x: 930, y: 510 }, // 向下
  { x: 1200, y: 510 }, // 終點
];

// 路徑 5: 迷宮路徑 (終極挑戰)
export const PATH_MAZE: Point[] = [
  { x: 0, y: 390 }, // 起點
  { x: 150, y: 390 },
  { x: 150, y: 150 }, // 向上
  { x: 330, y: 150 },
  { x: 330, y: 570 }, // 向下
  { x: 510, y: 570 },
  { x: 510, y: 210 }, // 向上
  { x: 690, y: 210 },
  { x: 690, y: 510 }, // 向下
  { x: 870, y: 510 },
  { x: 870, y: 270 }, // 向上
  { x: 1200, y: 270 }, // 終點
];

// 路徑映射表
export const LEVEL_PATHS: Record<number, Point[]> = {
  1: PATH_STRAIGHT, // 新手村 - 簡單直線
  2: PATH_S_CURVE, // 森林邊境 - S形彎道
  3: PATH_SPIRAL, // 獸人高地 - 螺旋
  4: PATH_ZIGZAG, // 龍之巢穴 - Z字形
  5: PATH_MAZE, // 終極挑戰 - 迷宮
};

/**
 * 根據關卡ID獲取對應的路徑
 */
export function getPathForLevel(
  levelId: number,
  customPath?: Point[]
): Point[] {
  // 如果提供了自定義路徑，使用自定義路徑
  if (customPath && customPath.length > 0) {
    return customPath;
  }

  // 否則從預設路徑中選擇
  return LEVEL_PATHS[levelId] || DEFAULT_PATH;
}
