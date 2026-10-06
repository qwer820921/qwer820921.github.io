/**
 * 戰鬥渲染快照與抽象渲染介面定義
 * 解耦核心戰鬥狀態機與具體繪圖技術（Canvas 2D / PixiJS）
 */

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface TileRenderData {
  col: number;
  row: number;
  type: number; // TileType
  textureKey?: string;
}

export interface UnitRenderData {
  id: string;
  type: "hero" | "tower" | "enemy";
  x: number;
  y: number;
  radius: number;
  currentHp: number;
  maxHp: number;
  textureKey?: string;
  isAttacking: boolean;
  isSelected?: boolean;
  color: string;
  label?: string;

  // 英雄 / 塔專用
  rangeTiles?: number;
  rangePx?: number;
  level?: number;
  isOnRoad?: boolean;
  auras?: {
    slow?: boolean;
    defense?: boolean;
    attackSpeed?: boolean;
    attackDown?: boolean;
  };
  tenacityActive?: boolean;
  defBonusActive?: boolean;
  atkSpeedBonusActive?: boolean;

  // 敵人專用
  isFlying?: boolean;
  isFighting?: boolean;
  isBurning?: boolean;
  isStunned?: boolean;
  isSlowed?: boolean;
  isAtkDown?: boolean;
  stunAngle?: number;
}

export interface FloatingTextData {
  id: number;
  text: string;
  x: number;
  y: number;
  color: string;
  alpha: number;
  scale?: number;
}

export interface VisualFxData {
  id: number;
  type: "sweep" | "custom";
  x: number;
  y: number;
  radius: number;
  duration: number;
  elapsed: number;
}

export interface BattleSnapshot {
  timestamp: number;
  state: number; // GameState
  cols: number;
  rows: number;
  tileSize: number;
  offsetX: number;
  offsetY: number;
  bgTextureKey?: string;
  tiles: TileRenderData[];
  heroes: UnitRenderData[];
  towers: UnitRenderData[];
  enemies: UnitRenderData[];
  floatingTexts: FloatingTextData[];
  visualFxs: VisualFxData[];
  highlightCell?: { col: number; row: number; valid: boolean } | null;
  dragGhost?: {
    type: "hero" | "tower";
    name: string;
    x: number;
    y: number;
    color: string;
    rangePx: number;
  } | null;
}

export interface IBattleRenderer {
  /** 初始化畫布與渲染上下文 */
  init(canvas: HTMLCanvasElement): void;
  /** 調整尺寸並計算 Retina 比例 */
  resize(width: number, height: number): void;
  /** 繪製單幀快照 */
  render(snapshot: BattleSnapshot): void;
  /** 清理資源 */
  destroy(): void;
}
