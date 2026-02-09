/**
 * 遊戲常數配置
 */

// Canvas 設定
export const CANVAS = {
  WIDTH: 1200,
  HEIGHT: 800,
  BACKGROUND_COLOR: "#1a1a2e",
  GRID_LINE_COLOR: "rgba(255, 255, 255, 0.1)",
} as const;

// 格子設定
export const GRID = {
  ROWS: 13, // 800 / 60 ≈ 13.33, 使用 13 行
  COLS: 20, // 1200 / 60 = 20 列
  CELL_SIZE: 60,
} as const;

// 遊戲設定
export const GAME = {
  FPS: 60,
  STARTING_GOLD: 500,
  STARTING_LIVES: 20,
  WAVE_DELAY: 5000, // 波次間隔 5 秒
} as const;

// 顏色配置
export const COLORS = {
  PATH: "#4a5568",
  BUILDABLE: "#2d3748",
  BLOCKED: "#1a202c",
  SPAWN: "#48bb78",
  EXIT: "#f56565",
  TOWER_RANGE: "rgba(102, 126, 234, 0.2)",
  TOWER_RANGE_BORDER: "rgba(102, 126, 234, 0.5)",
  HOVER_VALID: "rgba(72, 187, 120, 0.3)",
  HOVER_INVALID: "rgba(245, 101, 101, 0.3)",
} as const;
