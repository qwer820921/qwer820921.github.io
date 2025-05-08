interface TwseStock {
  "@"?: string; // 股票代號（含市場，例如 "2330.tw"）
  c: string; // 股票代號（純數字，例如 "2330"）
  n: string; // 股票名稱（簡稱，例如 "台積電"）
  nf: string; // 股票全名（例如 "台灣積體電路製造股份有限公司"）
  z?: string; // 最新成交價（例如 "918.0000"）
  o?: string; // 開盤價（例如 "933.0000"）
  h?: string; // 最高價（例如 "939.0000"）
  l?: string; // 最低價（例如 "918.0000"）
  y?: string; // 昨日收盤價（例如 "928.0000"）
  v?: string; // 累積成交量（單位：張，例如 "27829"）
  s?: string; // 總成交筆數（例如 "7416"）
  a?: string; // 賣價（五檔，例如 "919.0000_920.0000_921.0000_923.0000_924.0000_"）
  b?: string; // 買價（五檔，例如 "918.0000_917.0000_916.0000_915.0000_914.0000_"）
  f?: string; // 賣量（五檔，例如 "16_4_1_5_2_"）
  g?: string; // 買量（五檔，例如 "112_118_234_204_370_"）
  tlong?: string; // 時間戳（毫秒，例如 "1746685800000"）
  ot?: string; // 開盤時間（例如 "14:30:00"）
  t?: string; // 最新成交時間（例如 "13:30:00"）
  d?: string; // 日期（例如 "20250508"）
  ex?: string; // 市場類型（例如 "tse"）
  u?: string; // 漲停價（例如 "1020.0000"）
  w?: string; // 跌停價（例如 "836.0000"）
  ts?: string; // 交易狀態（例如 "0"）
  // 五檔價格和數量的解析結果（可選）
  askPrices?: string[]; // 解析後的賣價陣列
  bidPrices?: string[]; // 解析後的買價陣列
  askVolumes?: string[]; // 解析後的賣量陣列
  bidVolumes?: string[]; // 解析後的買量陣列

  id?: number; // 股票 ID
}

interface TwseResponse {
  msgArray: TwseStock[];
  referer: string;
  userDelay: number;
  rtcode: string;
  queryTime: {
    sysDate: string;
    stockInfoItem: number;
    stockInfo: number;
    sessionStr: string;
    sysTime: string;
    showChart: boolean;
    sessionFromTime: number;
    sessionLatestTime: number;
  };
  rtmessage: string;
  exKey: string;
  cachedAlive: number;
}

interface StockListItem {
  id: number;
  code: string;
}

export { TwseStock, TwseResponse, StockListItem };
