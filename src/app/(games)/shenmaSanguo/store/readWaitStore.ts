import { create } from "zustand";

/**
 * 一筆玩家正在等的唯讀請求（見 api/gameApi 的自動重試；背景讀取不記錄）
 * - retry：第幾次重試（0 是第一次請求）
 * - slow：這次請求已經等超過 SLOW_READ_NOTICE_MS 還沒回應
 */
export type ReadWait = { retry: number; slow: boolean };

interface ReadWaitStore {
  waits: Record<number, ReadWait>;
}

export const useReadWaitStore = create<ReadWaitStore>(() => ({ waits: {} }));

/** 目前等待中的讀取裡最多的重試次數（沒有在重試時是 0） */
export const selectReadRetry = (s: ReadWaitStore) =>
  Object.values(s.waits).reduce((n, w) => Math.max(n, w.retry), 0);

/** 是否有等待中的讀取回應較慢 */
export const selectReadSlow = (s: ReadWaitStore) =>
  Object.values(s.waits).some((w) => w.slow);
