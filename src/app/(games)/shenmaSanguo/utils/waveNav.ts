import { PreviewWave } from "./stagePreview";

/**
 * 敵軍預覽的波次導覽（唯讀）：只決定展開哪幾波、導覽到哪一波，不改波次順序、組成摘要或全關總數，也不影響戰場的「下一波」。
 * 波次一律用編號（wave）識別，不用索引：設定更新後同一個編號還在就保留，不會跳到別波
 */

/** 有資料問題的波次：沒有資料、遊戲會拒絕、或有資料不完整的組（略過、無法判讀、用了遊戲的預設值）；同 utils/stagePreview 的判定 */
export const isProblemWave = (w: PreviewWave): boolean =>
  w.missing || w.rejected || w.incomplete;

/** 有資料問題的波次編號（照原本的順序） */
export function problemWaves(waves: PreviewWave[]): number[] {
  return waves.filter(isProblemWave).map((w) => w.wave);
}

/**
 * 下一個資料問題：current 之後第一個有問題的波次，到最後一波就從頭找（current 是 null 或已不存在時從第一波找）；
 * 沒有任何資料問題時是 null
 */
export function nextProblemWave(
  waves: PreviewWave[],
  current: number | null
): number | null {
  const list = problemWaves(waves);
  if (list.length === 0) return null;
  if (current === null) return list[0];
  return list.find((n) => n > current) ?? list[0];
}

/** 設定更新後只保留還存在的波次編號（順序不變）；全部都在時回傳原陣列（不觸發重新渲染） */
export function keepExistingWaves(
  selected: number[],
  waves: PreviewWave[]
): number[] {
  const exists = new Set(waves.map((w) => w.wave));
  return selected.every((n) => exists.has(n))
    ? selected
    : selected.filter((n) => exists.has(n));
}
