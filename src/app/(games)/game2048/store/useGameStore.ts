import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GameState, Direction, Grid } from "../types";
import {
  createEmptyGrid,
  spawnTile,
  moveGrid,
  canMove,
} from "../utils/gameLogic";

interface GameStore {
  grid: Grid;
  score: number;
  bestScore: number;
  gameState: GameState;
  continued: boolean;
  _hasHydrated: boolean; // 追蹤是否已從 LocalStorage 恢復資料

  setHasHydrated: (val: boolean) => void;
  initGame: () => void;
  move: (direction: Direction) => void;
  resetGame: () => void;
  continueGame: () => void;
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      grid: createEmptyGrid(),
      score: 0,
      bestScore: 0,
      gameState: "playing",
      continued: false,
      _hasHydrated: false,

      setHasHydrated: (val: boolean) => {
        set({ _hasHydrated: val });
      },

      initGame: () => {
        const grid = createEmptyGrid();
        const t1 = spawnTile(grid);
        if (t1) grid[t1.position.x][t1.position.y] = t1;

        const t2 = spawnTile(grid);
        if (t2) grid[t2.position.x][t2.position.y] = t2;

        set({ grid, score: 0, gameState: "playing", continued: false });
      },

      move: (direction: Direction) => {
        const { grid, score, bestScore, gameState, continued, _hasHydrated } =
          get();
        if (!_hasHydrated) return; // 沒恢復完之前不准動
        if (gameState === "over") return;
        if (gameState === "won" && !continued) return;

        const {
          newGrid,
          score: gainedScore,
          moved,
        } = moveGrid(grid, direction);

        if (moved) {
          const newTile = spawnTile(newGrid);
          if (newTile) {
            newGrid[newTile.position.x][newTile.position.y] = newTile;
          }

          const newScore = score + gainedScore;
          const newBestScore = Math.max(bestScore, newScore);

          let newGameState: GameState = continued ? "playing" : gameState;

          if (!continued) {
            const won = newGrid.some((row) =>
              row.some((tile) => tile?.value === 2048)
            );
            if (won) {
              newGameState = "won";
            }
          }

          if (!canMove(newGrid)) {
            newGameState = "over";
          }

          set({
            grid: newGrid,
            score: newScore,
            bestScore: newBestScore,
            gameState: newGameState,
          });
        }
      },

      resetGame: () => {
        get().initGame();
      },

      continueGame: () => {
        set({ continued: true, gameState: "playing" });
      },
    }),
    {
      name: "game2048-storage",
      partialize: (state) => ({
        grid: state.grid,
        score: state.score,
        bestScore: state.bestScore,
        gameState: state.gameState,
        continued: state.continued,
      }),
      onRehydrateStorage: (state) => {
        return () => state?.setHasHydrated(true);
      },
    }
  )
);
