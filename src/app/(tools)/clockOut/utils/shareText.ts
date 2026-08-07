import { ClockState } from "../types";
import { fmtHM, splitDuration } from "./timeUtils";

const BAR_WIDTH = 20;

export const renderAsciiBar = (
  pct: number,
  width: number = BAR_WIDTH
): string => {
  const clamped = Math.max(0, Math.min(100, pct));
  const filled = Math.round((clamped / 100) * width);
  return "▓".repeat(filled) + "░".repeat(width - filled);
};

const fmtRemaining = (remainingMin: number): string => {
  const { h, m } = splitDuration(remainingMin);
  return h > 0 ? `${h} 小時 ${m} 分鐘` : `${m} 分鐘`;
};

export const buildShareText = (
  state: ClockState,
  nowMin: number,
  clockInTime: string,
  effectiveEnd: string,
  cheer: string
): string => {
  const nowStr = fmtHM(nowMin);
  const bar = renderAsciiBar(state.pct);
  const pctStr = state.pct.toFixed(2);

  let situation: string;

  if (state.status === "before") {
    situation = `距離 ${clockInTime} 上班，還有 ${fmtRemaining(state.remainingMin)}。`;
  } else if (state.status === "done") {
    situation = `${effectiveEnd} 已下班，自由了！🕊️`;
  } else {
    situation = `距離您 ${effectiveEnd} 下班，還有 ${fmtRemaining(state.remainingMin)}。`;
  }

  return [
    `現在時間是 ${nowStr}。`,
    "",
    situation,
    "",
    "下班倒數進度",
    `EXP [${bar}] ${pctStr}%`,
    cheer,
  ].join("\n");
};
