export type Position = { x: number; y: number };

export type Tile = {
  id: string; // 唯一 ID，用於 React 列表渲染動畫
  value: number;
  position: Position; // 目前在網格中的位置 (0-3)
  prevPosition?: Position; // 上一個位置，用於滑動動畫
  mergedFrom?: Tile[]; // 如果是合併而成的，記錄來源方塊
  isNew?: boolean; // 是否為剛產出的新方塊
  isMerged?: boolean; // 是否剛發生合併
};

export type Grid = (Tile | null)[][];

export type GameState = "playing" | "won" | "over";

export type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";
