// 地圖編輯器相關型別定義

export interface WaveEnemy {
  enemy_id: string;
  count: number;
  interval: number;
  path: string;
}

export interface WaveRow {
  wave: number;
  enemies: WaveEnemy[];
}

export type CellType = "empty" | "road" | "build" | "obstacle";

export interface GridCell {
  type: CellType;
  pathId?: string; // 屬於哪條路徑
  waypointIndex?: number; // 該路徑的順序（0-based）
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
  unlock_stage?: string;
  cols: number;
  rows: number;
  paths: Record<string, number[][]>; // { "path_a": [[x,y]...], "path_b": ... }
  waypoints?: number[][]; // 向後相容（舊版會用到）
  spawn?: number[];
  base: number[];
  build_zones: number[][];
  obstacles: number[][];
  tile_textures: TileTextures;
}

// ── enemies_config sheet ──
export interface EnemyConfig {
  enemy_id: string;
  name: string;
  type: string;
  level: number;
  speed: number;
  hp: number;
  atk: number;
  armor: number;
  attack_range: number;
  trait: string;
  notes: string;
  image: string;
  attack_image: string;
}

// ── heroes_config sheet ──
export interface HeroConfig {
  hero_id: string;
  name: string;
  rarity: string;
  cost: number;
  job: string;
  base_atk: number;
  base_def: number;
  base_hp: number;
  attack_range: number;
  attack_speed: number;
  passive: string;
  notes: string;
  upgrade_cost_base: number;
  atk_growth: number;
  def_growth: number;
  hp_growth: number;
  image: string;
  attack_image: string;
  range_growth: number;
}
