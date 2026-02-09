/**
 * 地圖配置 - 定義路徑和可建造區域
 */

import { Point, CellType, GridCell } from "../types";
import { GRID } from "./constants";
import { DEFAULT_PATH } from "./mapPaths";

// 當前路徑點 (可動態更新)
export let PATH_POINTS: Point[] = [...DEFAULT_PATH];

/**
 * 設置當前關卡的路徑
 */
export function setCurrentPath(newPath: Point[]) {
  PATH_POINTS = [...newPath];
}

/**
 * 初始化格子地圖
 */
export function initializeGrid(customPath?: Point[]): GridCell[][] {
  // 如果提供了自定義路徑，使用它
  const pathToUse = customPath || PATH_POINTS;

  const grid: GridCell[][] = [];

  // 先全部設為可建造
  for (let row = 0; row < GRID.ROWS; row++) {
    grid[row] = [];
    for (let col = 0; col < GRID.COLS; col++) {
      grid[row][col] = {
        row,
        col,
        type: CellType.BUILDABLE,
      };
    }
  }

  // 標記路徑格子
  const pathCells = getPathCells(pathToUse);
  pathCells.forEach(({ row, col }) => {
    if (grid[row] && grid[row][col]) {
      grid[row][col].type = CellType.PATH;
    }
  });

  // 標記起點和終點
  const spawnCell = worldToGrid(pathToUse[0]);
  const exitCell = worldToGrid(pathToUse[pathToUse.length - 1]);

  if (spawnCell && grid[spawnCell.row] && grid[spawnCell.row][spawnCell.col]) {
    grid[spawnCell.row][spawnCell.col].type = CellType.SPAWN;
  }

  if (exitCell && grid[exitCell.row] && grid[exitCell.row][exitCell.col]) {
    grid[exitCell.row][exitCell.col].type = CellType.EXIT;
  }

  return grid;
}

/**
 * 獲取所有路徑經過的格子
 */
function getPathCells(
  pathPoints: Point[]
): Array<{ row: number; col: number }> {
  const cells = new Set<string>();

  // 遍歷所有路徑段
  for (let i = 0; i < pathPoints.length - 1; i++) {
    const start = pathPoints[i];
    const end = pathPoints[i + 1];

    // 在兩點之間插值,找出所有經過的格子
    const steps = 100;
    for (let t = 0; t <= steps; t++) {
      const x = start.x + (end.x - start.x) * (t / steps);
      const y = start.y + (end.y - start.y) * (t / steps);

      const cell = worldToGrid({ x, y });
      if (cell) {
        cells.add(`${cell.row},${cell.col}`);
      }
    }
  }

  // 轉換回陣列
  return Array.from(cells).map((key) => {
    const [row, col] = key.split(",").map(Number);
    return { row, col };
  });
}

/**
 * 世界座標轉格子座標
 */
function worldToGrid(point: Point): { row: number; col: number } | null {
  const col = Math.floor(point.x / GRID.CELL_SIZE);
  const row = Math.floor(point.y / GRID.CELL_SIZE);

  if (row >= 0 && row < GRID.ROWS && col >= 0 && col < GRID.COLS) {
    return { row, col };
  }

  return null;
}

/**
 * 格子座標轉世界座標 (格子中心)
 */
export function gridToWorld(row: number, col: number): Point {
  return {
    x: col * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
    y: row * GRID.CELL_SIZE + GRID.CELL_SIZE / 2,
  };
}
