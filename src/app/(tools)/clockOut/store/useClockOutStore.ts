import { create } from "zustand";
import { persist } from "zustand/middleware";
import { todayStr } from "../utils/timeUtils";

interface ClockOutStore {
  workMinutes: number; // 工時（分鐘）
  lunchMinutes: number; // 午休（分鐘）
  clockInTime: string; // 上班時間 "HH:mm"
  overrideEndTime: string | null; // 今日手動下班時間
  overrideDate: string | null; // override 對應日期
  configured: boolean; // 是否已完成首次設定
  showClockIn: boolean; // 是否在主畫面顯示上班時間
  showClockOut: boolean; // 是否在主畫面顯示下班時間

  setWorkMinutes: (n: number) => void;
  setLunchMinutes: (n: number) => void;
  setClockIn: (hm: string) => void;
  setEndOverride: (hm: string) => void;
  resetEnd: () => void;
  setShowClockIn: (v: boolean) => void;
  setShowClockOut: (v: boolean) => void;
  reset: () => void;
}

const DEFAULTS = {
  workMinutes: 480, // 8 小時
  lunchMinutes: 60, // 1 小時
  clockInTime: "09:00",
  overrideEndTime: null,
  overrideDate: null,
  configured: false,
  showClockIn: false,
  showClockOut: false,
};

export const useClockOutStore = create<ClockOutStore>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      setWorkMinutes: (n) =>
        set({
          workMinutes: Math.max(0, n),
          overrideEndTime: null, // 基礎改變 → 清除今日手動覆寫
          overrideDate: null,
          configured: true,
        }),

      setLunchMinutes: (n) =>
        set({
          lunchMinutes: Math.max(0, n),
          overrideEndTime: null,
          overrideDate: null,
          configured: true,
        }),

      setClockIn: (hm) =>
        set({
          clockInTime: hm,
          overrideEndTime: null, // 重新上班打卡 → 下班回到自動計算
          overrideDate: null,
          configured: true,
        }),

      setEndOverride: (hm) =>
        set({
          overrideEndTime: hm,
          overrideDate: todayStr(),
          configured: true,
        }),

      resetEnd: () => set({ overrideEndTime: null, overrideDate: null }),

      setShowClockIn: (v) => set({ showClockIn: v }),

      setShowClockOut: (v) => set({ showClockOut: v }),

      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: "clockOut:settings",
      version: 1,
    }
  )
);
