interface TwseStock {
  "@": string; // 股票代號（含市場），例如 "2330.tw"
  tv?: string; // 不明（有時為 "-" 或 "3"）
  ps?: string; // 不明（通常為 "-"）
  pid?: string; // 股票識別碼，如 "20.tse.tw|669625"
  pz?: string; // 不明（通常為 "-"）
  bp?: string; // 不明，通常為 "0"
  "m%": string; // 不明，可能是市值或內部碼
  "^": string; // 日期，例如 "20250509"
  key?: string; // 複合鍵值，如 "tse_2330.tw_20250509"
  a?: string; // 賣價五檔，例如 "938.0000_939.0000_..."
  b?: string; // 買價五檔，例如 "937.0000_936.0000_..."
  c: string; // 股票代號（純數字），例如 "2330"
  "#": string; // 股票識別碼，例如 "20.tse.tw|670121"
  d: string; // 日期，例如 "20250509"
  "%": string; // 顯示時間，例如 "10:06:15"
  ch: string; // 股票代號（含 .tw），例如 "2330.tw"
  tlong: string; // 時間戳（毫秒），例如 "1746756375000"
  f?: string; // 賣量五檔，例如 "39_176_497_..."
  g?: string; // 買量五檔，例如 "27_61_364_..."
  ip?: string; // 不明，通常為 "0"
  mt?: string; // 不明，整數字串
  h?: string; // 最高價，例如 "942.0000"
  i?: string; // 不明，例如 "24"
  it?: string; // 不明，例如 "12"
  l?: string; // 最低價，例如 "934.0000"
  n: string; // 股票名稱，例如 "台積電"
  o?: string; // 開盤價，例如 "938.0000"
  p?: string; // 不明，通常為 "0"
  ex: string; // 市場類型，例如 "tse"
  s: string; // 總成交筆數或交易狀態，通常為 "-" 或數字
  t: string; // 最新成交時間，例如 "10:06:15"
  u?: string; // 漲停價，例如 "1005.0000"
  v?: string; // 累積成交量，例如 "11632"
  w?: string; // 跌停價，例如 "827.0000"
  nf: string; // 股票全名，例如 "台灣積體電路製造股份有限公司"
  y?: string; // 昨日收盤價，例如 "918.0000"
  z?: string; // 最新成交價，例如 "938.0000"
  ts?: string; // 交易狀態碼（例如 "0"）

  // 額外解析欄位（非原始 API 回傳，但程式可用來拆解 a/b/f/g）
  askPrices?: string[]; // 例如 ["938.00", "939.00"]
  askVolumes?: string[]; // 例如 ["39", "176"]
  askCombined?: string[]; // 例如 ["938.00 (39)", "939.00 (176)"]

  bidPrices?: string[];
  bidVolumes?: string[];
  bidCombined?: string[];

  changePercent?: number; // 漲跌幅百分比，例如 2.18（表示 +2.18%）
  changePoints?: number; // 漲跌點數，例如 20（表示漲了 20 點）或 -20（表示跌了 20 點）
  currentPrice?: number; // 整理後的現價，優先從 z 取得，若 z 無效（例如 "-"）則依序從 bidPrices[0]、askPrices[0]、o 取得，例如 988.0 或 181.65（若均無效則為 undefined）

  // 額外欄位（應用程式內部用途）
  id?: number;
}

interface TwseResponse {
  msgArray: TwseStock[]; // 股票資料陣列
  referer: string; // 來源資訊（通常為空字串）
  userDelay: number; // 延遲時間（毫秒），例如 5000
  rtcode: string; // 回應代碼，"0000" 表示成功
  queryTime: {
    sysDate: string; // 系統日期，例如 "20250509"
    stockInfoItem: number; // 不明，可能為總股票項目數
    stockInfo: number; // 不明，可能為實際股票筆數
    sessionStr: string; // Session 名稱
    sysTime: string; // 系統時間，例如 "10:06:25"
    showChart: boolean; // 是否顯示圖表
    sessionFromTime: number; // 不明，預設為 -1
    sessionLatestTime: number; // 不明，預設為 -1
  };
  rtmessage: string; // 回傳訊息，例如 "OK"
  exKey: string; // 不明，通常為空字串或省略
  cachedAlive: number; // 快取存活時間（秒），例如 0
}

interface StockListItem {
  id: number;
  code: string;
}

export { TwseStock, TwseResponse, StockListItem };
