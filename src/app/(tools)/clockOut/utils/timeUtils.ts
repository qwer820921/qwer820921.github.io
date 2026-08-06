import { ClockState } from "../types";

export const pad = (n: number): string => String(n).padStart(2, "0");

export const parseHM = (s: string): number => {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
};

export const fmtHM = (mins: number): string => {
  const norm = ((Math.floor(mins) % 1440) + 1440) % 1440;
  return pad(Math.floor(norm / 60)) + ":" + pad(norm % 60);
};

/** 下班（自動）= 上班 + 工時 + 午休，跨日自動 wrap 至 00:00~23:59 */
export const computeEndTime = (
  clockIn: string,
  workMin: number,
  lunchMin: number
): string => fmtHM(parseHM(clockIn) + workMin + lunchMin);

/** 今日日期字串 "YYYY-MM-DD" */
export const todayStr = (d: Date = new Date()): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 由現在時間、上班、下班計算狀態、進度、剩餘時間（支援跨午夜） */
export function computeClockState(
  nowMin: number,
  startStr: string,
  endStr: string
): ClockState {
  const start = parseHM(startStr);
  let end = parseHM(endStr);
  let cur = nowMin;

  const cross = end <= start; // 下班 <= 上班 視為跨午夜（大夜班）
  if (cross) end += 1440;
  if (cross && cur < start) cur += 1440;

  let status: ClockState["status"];
  let pct: number;
  let remainingMin: number;
  let cap: string;

  if (cur < start) {
    status = "before";
    pct = 0;
    remainingMin = start - cur;
    cap = "距離上班還有";
  } else if (cur >= end) {
    status = "done";
    pct = 100;
    remainingMin = 0;
    cap = "狀態";
  } else {
    status = "work";
    pct = ((cur - start) / (end - start)) * 100;
    remainingMin = end - cur;
    cap = "距離下班還有";
  }

  const totalSec = Math.max(1, end - start) * 60;
  const exp = Math.floor((pct / 100) * totalSec);

  return { status, pct, remainingMin, cap, exp };
}
