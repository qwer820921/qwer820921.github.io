import { Tile, Position, Direction } from "../types";

/** 產生隨機 ID (使用更可靠的方式確保唯一的 Identity) */
export const uuid = () =>
  `tile-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

/** 建立一個全空的 4x4 網格 */
export const createEmptyGrid = (): (Tile | null)[][] => {
  return Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => null));
};

/** 獲取所有空格的位置 */
export const getEmptyCells = (grid: (Tile | null)[][]): Position[] => {
  const emptyCells: Position[] = [];
  grid.forEach((row, rIdx) => {
    row.forEach((cell, cIdx) => {
      if (!cell) emptyCells.push({ x: rIdx, y: cIdx });
    });
  });
  return emptyCells;
};

/** 在隨機空格生成一個新方塊 (2 或 4) */
export const spawnTile = (grid: (Tile | null)[][]): Tile | null => {
  const emptyCells = getEmptyCells(grid);
  if (emptyCells.length === 0) return null;

  const { x, y } = emptyCells[Math.floor(Math.random() * emptyCells.length)];
  return {
    id: uuid(),
    value: Math.random() < 0.9 ? 2 : 4,
    position: { x, y },
    isNew: true,
  };
};

/** 核心移動邏輯：處理單行向左滑動 */
const slideLineLeft = (
  line: (Tile | null)[]
): { newLine: (Tile | null)[]; score: number } => {
  let score = 0;
  // 1. 先濾掉空的 (null)
  const tiles = line.filter((t): t is Tile => t !== null);
  const newLine: (Tile | null)[] = [];

  for (let i = 0; i < tiles.length; i++) {
    const current = tiles[i];
    const next = tiles[i + 1];

    if (next && current.value === next.value) {
      // 合併！
      const newValue = current.value * 2;
      score += newValue;
      // 關鍵修復：繼承 current 的 ID，確保 Identity 穩定，防止 React/CSS 重新掛載導致的 (0,0) 閃爍
      newLine.push({
        ...current,
        value: newValue,
        isMerged: true,
        isNew: false,
      });
      i++; // 跳過下一個，因為已經合併了
    } else {
      newLine.push({ ...current, isMerged: false, isNew: false });
    }
  }

  // 補齊空的格子
  while (newLine.length < 4) {
    newLine.push(null);
  }

  return { newLine, score };
};

/** 根據方向執行移動 */
export const moveGrid = (
  grid: (Tile | null)[][],
  direction: Direction
): { newGrid: (Tile | null)[][]; score: number; moved: boolean } => {
  const workingGrid = [...grid.map((row) => [...row])];

  // 統一處理邏輯
  const newGrid = createEmptyGrid();
  let score = 0;
  let moved = false;

  const isVertical = direction === "UP" || direction === "DOWN";
  const isReverse = direction === "RIGHT" || direction === "DOWN";

  for (let i = 0; i < 4; i++) {
    // 取得該行/列的所有非空方塊
    const line: (Tile | null)[] = [];
    for (let j = 0; j < 4; j++) {
      const x = isVertical ? j : i;
      const y = isVertical ? i : j;
      line.push(workingGrid[x][y]);
    }

    // 如果是向右或向下，反轉陣列以套用「左滑」邏輯
    if (isReverse) line.reverse();

    const { newLine, score: lineScore } = slideLineLeft(line);
    score += lineScore;

    // 如果方向是反的，再翻轉回來
    if (isReverse) newLine.reverse();

    // 填回新網格並更新座標
    for (let j = 0; j < 4; j++) {
      const x = isVertical ? j : i;
      const y = isVertical ? i : j;
      const tile = newLine[j];
      const prevTile = workingGrid[x][y];

      if (tile) {
        if (
          !prevTile ||
          prevTile.id !== tile.id ||
          prevTile.value !== tile.value ||
          prevTile.position.x !== x ||
          prevTile.position.y !== y
        ) {
          moved = true;
        }
        // 關鍵修正：回傳新的物件副本，避免直接修改現有狀態的屬性
        newGrid[x][y] = {
          ...tile,
          position: { x, y },
        };
      } else {
        if (prevTile) moved = true;
        newGrid[x][y] = null;
      }
    }
  }

  return { newGrid, score, moved };
};

/** 檢查是否還有任何可能的移動 */
export const canMove = (grid: (Tile | null)[][]): boolean => {
  // 1. 有空格就能動
  if (getEmptyCells(grid).length > 0) return true;

  // 2. 檢查相鄰是否有相同數字
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const current = grid[r][c];
      if (!current) continue;

      // 檢查右方
      if (c < 3 && grid[r][c + 1]?.value === current.value) return true;
      // 檢查下方
      if (r < 3 && grid[r + 1][c]?.value === current.value) return true;
    }
  }

  return false;
};
