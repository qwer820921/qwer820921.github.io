export type Color = string;

export interface TubeState {
  id: string;
  colors: Color[]; // 底部是 index 0，頂部是最後一個元素
  capacity: number;
}

export type GameState = "playing" | "won" | "shuffling";

export interface GameStore {
  tubes: TubeState[];
  level: number;
  gameState: GameState;
  history: TubeState[][]; // 用於 Undo
  extraTubesEnabled: boolean;
  _hasHydrated: boolean;

  // Actions
  setHasHydrated: (val: boolean) => void;
  initLevel: (level: number) => void;
  pour: (fromId: string, toId: string) => boolean;
  addExtraTube: () => void;
  undo: () => void;
  resetLevel: () => void;
  nextLevel: () => void;
}
