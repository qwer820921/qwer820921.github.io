export const BOARD_SIZE = 9;
export const BOX_SIZE = 3;

/**
 * 檢查在特定位置填入數字是否合法
 */
export const isValid = (
  board: number[][],
  row: number,
  col: number,
  num: number
): boolean => {
  // 檢查行
  for (let x = 0; x < BOARD_SIZE; x++) {
    if (board[row][x] === num) return false;
  }

  // 檢查列
  for (let x = 0; x < BOARD_SIZE; x++) {
    if (board[x][col] === num) return false;
  }

  // 檢查 3x3 九宮格
  const startRow = row - (row % BOX_SIZE);
  const startCol = col - (col % BOX_SIZE);
  for (let i = 0; i < BOX_SIZE; i++) {
    for (let j = 0; j < BOX_SIZE; j++) {
      if (board[i + startRow][j + startCol] === num) return false;
    }
  }

  return true;
};

/**
 * 使用回溯法求解數獨
 */
export const solveSudoku = (board: number[][]): boolean => {
  for (let row = 0; row < BOARD_SIZE; row++) {
    for (let col = 0; col < BOARD_SIZE; col++) {
      if (board[row][col] === 0) {
        for (let num = 1; num <= 9; num++) {
          if (isValid(board, row, col, num)) {
            board[row][col] = num;
            if (solveSudoku(board)) return true;
            board[row][col] = 0; // 回溯
          }
        }
        return false;
      }
    }
  }
  return true;
};

/**
 * 生成一個完整的隨機合法盤面
 */
export const generateFullBoard = (): number[][] => {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));

  // 隨機填入第一行以增加隨機性
  const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = nums.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [nums[i], nums[j]] = [nums[j], nums[i]];
  }
  for (let i = 0; i < 9; i++) {
    board[0][i] = nums[i];
  }

  solveSudoku(board);
  return board;
};

/**
 * 根據難度從完整盤面中移除數字
 */
export const generatePuzzle = (
  fullBoard: number[][],
  difficulty: "easy" | "medium" | "hard" | "expert"
): number[][] => {
  const puzzle = fullBoard.map((row) => [...row]);
  let attempts = 0;

  // 不同難度移除的個數
  const removalCounts = {
    easy: 35,
    medium: 45,
    hard: 55,
    expert: 64,
  };

  const targetRemovals = removalCounts[difficulty];
  let removedCount = 0;

  while (removedCount < targetRemovals && attempts < 200) {
    const row = Math.floor(Math.random() * 9);
    const col = Math.floor(Math.random() * 9);

    if (puzzle[row][col] !== 0) {
      puzzle[row][col] = 0;
      removedCount++;
    }
    attempts++;
  }

  return puzzle;
};
