import { create } from "zustand";
import { persist } from "zustand/middleware";
import { GameStore } from "../types";
import { generateLevel } from "../utils/levelGenerator";
import {
  canPour,
  executePour,
  checkWin,
  TUBE_CAPACITY,
} from "../utils/gameLogic";

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      tubes: [],
      level: 1,
      gameState: "playing",
      history: [],
      extraTubesEnabled: false,
      _hasHydrated: false,

      setHasHydrated: (val: boolean) => {
        set({ _hasHydrated: val });
      },

      initLevel: (level: number) => {
        const tubes = generateLevel(level);
        set({
          tubes,
          level,
          gameState: "playing",
          history: [],
          extraTubesEnabled: false,
        });
      },

      pour: (fromId: string, toId: string) => {
        const { tubes, history, gameState } = get();
        if (gameState !== "playing") return false;

        const fromIndex = tubes.findIndex((t) => t.id === fromId);
        const toIndex = tubes.findIndex((t) => t.id === toId);

        if (fromIndex === -1 || toIndex === -1) return false;

        const from = tubes[fromIndex];
        const to = tubes[toIndex];

        if (!canPour(from, to)) return false;

        // 儲存目前狀態至歷史紀錄
        const currentTubes = JSON.parse(JSON.stringify(tubes));
        const newHistory = [...history, currentTubes].slice(-10); // 只保留最近 10 次 Undo

        const { newFrom, newTo, movedCount } = executePour(from, to);

        if (movedCount > 0) {
          const newTubes = [...tubes];
          newTubes[fromIndex] = newFrom;
          newTubes[toIndex] = newTo;

          const isWon = checkWin(newTubes);

          set({
            tubes: newTubes,
            history: newHistory,
            gameState: isWon ? "won" : "playing",
          });
          return true;
        }
        return false;
      },

      addExtraTube: () => {
        const { tubes, extraTubesEnabled } = get();
        if (extraTubesEnabled) return; // 每關限加一根

        const newTubes = [
          ...tubes,
          {
            id: `extra-tube-${Date.now()}`,
            colors: [],
            capacity: TUBE_CAPACITY,
          },
        ];

        set({
          tubes: newTubes,
          extraTubesEnabled: true,
        });
      },

      undo: () => {
        const { history } = get();
        if (history.length === 0) return;

        const lastState = history[history.length - 1];
        const newHistory = history.slice(0, -1);

        set({
          tubes: lastState,
          history: newHistory,
        });
      },

      resetLevel: () => {
        const { level } = get();
        get().initLevel(level);
      },

      nextLevel: () => {
        const { level } = get();
        get().initLevel(level + 1);
      },
    }),
    {
      name: "waterColorSort-storage",
      partialize: (state) => ({
        tubes: state.tubes,
        level: state.level,
        gameState: state.gameState,
        extraTubesEnabled: state.extraTubesEnabled,
      }),
      onRehydrateStorage: (state) => {
        return () => state?.setHasHydrated(true);
      },
    }
  )
);
