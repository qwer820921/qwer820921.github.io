import { TubeState } from "../types";

/**
 * 試管容量，固定為 4
 */
export const TUBE_CAPACITY = 4;

/**
 * 檢查是否可以傾倒
 */
export const canPour = (from: TubeState, to: TubeState): boolean => {
  // 1. 同一瓶不能倒
  if (from.id === to.id) return false;

  // 2. 出發瓶必須有液體
  if (from.colors.length === 0) return false;

  // 3. 目標瓶必須有空間
  if (to.colors.length >= to.capacity) return false;

  const fromTopColor = from.colors[from.colors.length - 1];

  // 4. 如果目標瓶是空的，隨便倒
  if (to.colors.length === 0) return true;

  // 5. 如果目標瓶不空，頂部顏色必須相同
  const toTopColor = to.colors[to.colors.length - 1];
  return fromTopColor === toTopColor;
};

/**
 * 執行傾倒邏輯
 * 會將出發瓶頂部所有連續且相同的顏色一次性移至目標瓶（只要更有空間）
 */
export const executePour = (
  from: TubeState,
  to: TubeState
): {
  newFrom: TubeState;
  newTo: TubeState;
  movedCount: number;
} => {
  const newFrom = { ...from, colors: [...from.colors] };
  const newTo = { ...to, colors: [...to.colors] };

  if (!canPour(from, to)) return { newFrom, newTo, movedCount: 0 };

  const topColor = newFrom.colors[newFrom.colors.length - 1];
  let movedCount = 0;

  // 計算頂部有多少個連續的同色區塊
  let topColorCount = 0;
  for (let i = newFrom.colors.length - 1; i >= 0; i--) {
    if (newFrom.colors[i] === topColor) {
      topColorCount++;
    } else {
      break;
    }
  }

  // 目標瓶剩餘空間
  const availableSpace = to.capacity - to.colors.length;
  // 決定移動幾個（取兩者最小值）
  const toMove = Math.min(topColorCount, availableSpace);

  for (let i = 0; i < toMove; i++) {
    newFrom.colors.pop();
    newTo.colors.push(topColor);
    movedCount++;
  }

  return { newFrom, newTo, movedCount };
};

/**
 * 檢查勝利條件
 * 所有試管必須是空的，或者是裝滿單一顏色
 */
export const checkWin = (tubes: TubeState[]): boolean => {
  return tubes.every((tube) => {
    if (tube.colors.length === 0) return true;
    if (tube.colors.length !== tube.capacity) return false;

    // 檢查瓶內所有顏色是否一致
    const firstColor = tube.colors[0];
    return tube.colors.every((c) => c === firstColor);
  });
};
