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

/** 把分鐘數拆成 {h, m}；先四捨五入到整分鐘再拆，避免分鐘進位到 60 卻不進位小時 */
export const splitDuration = (mins: number): { h: number; m: number } => {
  const totalM = Math.round(mins);
  return { h: Math.floor(totalM / 60), m: totalM % 60 };
};

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
  const endBeforeWrap = end; // 跨日前的原始下班時間，用來判斷「凌晨仍屬於昨晚班次」
  if (cross) end += 1440;

  let status: ClockState["status"];
  let pct: number;
  let remainingMin: number;
  let cap: string;

  if (cross && cur > endBeforeWrap && cur < start) {
    // 大夜班休息區間：今早已下班、下一班還沒開始 → 持續顯示已下班，直到下一班開始
    status = "done";
    pct = 100;
    remainingMin = 0;
    cap = "狀態";
  } else {
    if (cross && cur <= endBeforeWrap) cur += 1440;

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
  }

  const totalSec = Math.max(1, end - start) * 60;
  const exp = Math.floor((pct / 100) * totalSec);

  return { status, pct, remainingMin, cap, exp };
}
