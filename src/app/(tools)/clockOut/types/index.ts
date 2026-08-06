// 下班倒數 相關型別定義

export interface ClockOutSettings {
  workMinutes: number; // 工時（分鐘），設定一次
  lunchMinutes: number; // 午休（分鐘），設定一次
  clockInTime: string; // 上班時間 "HH:mm"（記住上次）
  overrideEndTime: string | null; // 今日手動調整的下班時間 "HH:mm"
  overrideDate: string | null; // override 對應日期 "YYYY-MM-DD"（隔天失效）
}

export type ClockStatus = "before" | "work" | "done";

export interface ClockState {
  status: ClockStatus; // 尚未開工 / 上班中 / 已下班
  pct: number; // 進度百分比 0~100
  remainingMin: number; // 距離下班（或上班）剩餘分鐘
  cap: string; // 大數字上方的標題文字
  exp: number; // 經驗值（依進度換算）
}
