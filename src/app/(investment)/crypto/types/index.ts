/** K 線資料型別 */
export type KlineData = [
  number, // 開始時間 (timestamp)
  string, // 開盤價
  string, // 最高價
  string, // 最低價
  string, // 收盤價
  string, // 成交量
  number, // 結束時間
  string, // 成交金額
  number, // 成交筆數
  string, // 主動買入成交量
  string, // 主動買入成交金額
  string, // 忽略
];

/** 取得 K 線圖資料 */
export interface GetKlinesParams {
  symbol: string;
  interval: string;
  startTime?: number;
  endTime?: number;
  limit?: number;
}

/** 快速查詢按鈕的 preset 配置資料 */
export type QuickQueryOption = {
  symbol: string;
  value: string; // 顯示在按鈕上的文字
  interval: string;
  limit: number;
};

/** 參考 lightweight-charts 套件的型別檔案 */
export interface CandlestickData<TimeType = Time> {
  time: TimeType; // 時間戳記，型別由 TimeType 決定
  open: number; // 開盤價
  high: number; // 最高價
  low: number; // 最低價
  close: number; // 收盤價
  color?: string; // 可選：K 線顏色
  borderColor?: string; // 可選：K 線邊框顏色
  wickColor?: string; // 可選：K 線影線顏色
}
export type Time = number | string | Date;
