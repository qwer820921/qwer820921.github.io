// 地圖編輯器相關型別定義

export type CellType = "empty" | "road" | "build" | "obstacle";

export interface GridCell {
  type: CellType;
  waypointIndex?: number; // 若為 waypoint，記錄順序（0-based）
}

export interface TileTextures {
  road: string;
  build: string;
  empty: string;
  base: string;
  spawn: string;
  obstacle: string;
}

export interface MapJson {
  map_id: string;
  name: string;
  chapter: number;
  cols: number;
  rows: number;
  waypoints: number[][];
  spawn: number[];
  base: number[];
  build_zones: number[][];
  obstacles: number[][];
  tile_textures: TileTextures;
}
