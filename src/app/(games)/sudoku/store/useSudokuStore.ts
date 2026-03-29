import { create } from "zustand";
import { persist } from "zustand/middleware";
import { SudokuStore, Difficulty, SudokuCell } from "../types";
import { generateFullBoard, generatePuzzle } from "../utils/sudokuLogic";

export const useSudokuStore = create<SudokuStore>()(
  persist(
    (set, get) => ({
      grid: Array.from({ length: 9 }, (_, rIdx) =>
        Array.from({ length: 9 }, (_, cIdx) => ({
          value: null,
          initialValue: null,
          notes: [],
          isCorrect: true,
          row: rIdx,
          col: cIdx,
        }))
      ),
      solution: [] as number[][],
      difficulty: "easy",
      mistakes: 0,
      maxMistakes: 3,
      notesMode: false,
      selectedCell: null,
      gameState: "playing",
      startTime: null,
      elapsedTime: 0,
      _hasHydrated: false,

      setHasHydrated: (val: boolean) => {
        set({ _hasHydrated: val });
      },

      initGame: (difficulty: Difficulty) => {
        const fullBoard = generateFullBoard();
        const puzzle = generatePuzzle(fullBoard, difficulty);

        const grid: SudokuCell[][] = puzzle.map((row, rIdx) =>
          row.map((val, cIdx) => ({
            value: val === 0 ? null : val,
            initialValue: val === 0 ? null : val,
            notes: [],
            isCorrect: true,
            row: rIdx,
            col: cIdx,
          }))
        );

        set({
          grid,
          solution: fullBoard,
          difficulty,
          mistakes: 0,
          notesMode: false,
          selectedCell: null,
          gameState: "playing",
          startTime: Date.now(),
          elapsedTime: 0,
        });
      },

      selectCell: (row: number, col: number) => {
        if (get().gameState !== "playing") return;
        set({ selectedCell: [row, col] });
      },

      setCellValue: (value: number) => {
        const {
          selectedCell,
          grid,
          solution,
          mistakes,
          maxMistakes,
          notesMode,
          gameState,
        } = get();
        if (!selectedCell || gameState !== "playing") return;

        const [r, c] = selectedCell;
        const cell = grid[r][c];

        if (cell.initialValue !== null) return; // Cannot change initial values

        if (notesMode) {
          get().toggleNote(value);
          return;
        }

        const isCorrect = solution[r][c] === value;
        const newGrid = [...grid.map((row) => [...row])];
        newGrid[r][c] = { ...cell, value, isCorrect };

        let newMistakes = mistakes;
        if (!isCorrect) {
          newMistakes += 1;
        }

        // Check Win Condition
        const isWon = newGrid.every((row, rIdx) =>
          row.every((cell, cIdx) => cell.value === solution[rIdx][cIdx])
        );

        set({
          grid: newGrid,
          mistakes: newMistakes,
          gameState: isWon
            ? "won"
            : newMistakes >= maxMistakes
              ? "lost"
              : "playing",
        });
      },

      toggleNote: (value: number) => {
        const { selectedCell, grid } = get();
        if (!selectedCell) return;

        const [r, c] = selectedCell;
        const cell = grid[r][c];
        if (cell.value !== null) return; // Cannot add notes to filled cells

        const newNotes = cell.notes.includes(value)
          ? cell.notes.filter((v) => v !== value)
          : [...cell.notes, value].sort((a, b) => a - b);

        const newGrid = [...grid.map((row) => [...row])];
        newGrid[r][c] = { ...cell, notes: newNotes };

        set({ grid: newGrid });
      },

      toggleNotesMode: () => {
        set((state) => ({ notesMode: !state.notesMode }));
      },

      eraseCell: () => {
        const { selectedCell, grid, gameState } = get();
        if (!selectedCell || gameState !== "playing") return;

        const [r, c] = selectedCell;
        if (grid[r][c].initialValue !== null) return;

        const newGrid = [...grid.map((row) => [...row])];
        newGrid[r][c] = {
          ...grid[r][c],
          value: null,
          notes: [],
          isCorrect: true,
        };

        set({ grid: newGrid });
      },

      useHint: () => {
        const { selectedCell, grid, solution, gameState } = get();
        if (gameState !== "playing") return;

        let r, c;
        if (selectedCell) {
          [r, c] = selectedCell;
        } else {
          // 如果沒選格子，隨機找一個空格填入
          const emptyCells: [number, number][] = [];
          grid.forEach((row, ri) =>
            row.forEach((cell, ci) => {
              if (cell.value === null) emptyCells.push([ri, ci]);
            })
          );

          if (emptyCells.length === 0) return;
          const randomCell =
            emptyCells[Math.floor(Math.random() * emptyCells.length)];
          [r, c] = randomCell;
        }

        const correctValue = solution[r][c];
        const newGrid = [...grid.map((row) => [...row])];
        newGrid[r][c] = {
          ...grid[r][c],
          value: correctValue,
          initialValue: correctValue,
          notes: [],
          isCorrect: true,
        };

        set({ grid: newGrid, selectedCell: [r, c] });

        // 檢查提示後是否滿格獲勝
        const isWon = newGrid.every((row, rIdx) =>
          row.every((cell, cIdx) => cell.value === solution[rIdx][cIdx])
        );
        if (isWon) set({ gameState: "won" });
      },

      undo: () => {
        // Implementation for undo would require another history stack
        // For simplicity, we can add a history array to the state
      },

      tickTimer: () => {
        if (get().gameState === "playing") {
          set((state) => ({ elapsedTime: state.elapsedTime + 1 }));
        }
      },
    }),
    {
      name: "sudoku-storage",
      partialize: (state) => ({
        grid: state.grid,
        solution: state.solution,
        difficulty: state.difficulty,
        mistakes: state.mistakes,
        elapsedTime: state.elapsedTime,
        gameState: state.gameState,
      }),
      onRehydrateStorage: (state) => {
        return () => state?.setHasHydrated(true);
      },
    }
  )
);
