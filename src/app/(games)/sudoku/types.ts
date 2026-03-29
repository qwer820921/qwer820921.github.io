export type Difficulty = "easy" | "medium" | "hard" | "expert";

export interface SudokuCell {
  value: number | null; // 1-9 or null
  initialValue: number | null; // The number given at the start
  notes: number[]; // Pencil marks (1-9)
  isCorrect: boolean; // For visual feedback if enabled
  row: number;
  col: number;
}

export type SudokuGameState = "playing" | "won" | "lost";

export interface SudokuStore {
  grid: SudokuCell[][];
  solution: number[][]; // The complete solved board
  difficulty: Difficulty;
  mistakes: number;
  maxMistakes: number;
  notesMode: boolean;
  selectedCell: [number, number] | null; // [row, col]
  gameState: SudokuGameState;
  startTime: number | null;
  elapsedTime: number; // in seconds
  _hasHydrated: boolean;

  // Actions
  setHasHydrated: (val: boolean) => void;
  initGame: (difficulty: Difficulty) => void;
  selectCell: (row: number, col: number) => void;
  setCellValue: (value: number) => void;
  toggleNote: (value: number) => void;
  toggleNotesMode: () => void;
  eraseCell: () => void;
  useHint: () => void;
  undo: () => void;
  tickTimer: () => void;
}
