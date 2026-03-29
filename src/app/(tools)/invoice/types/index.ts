// 統一發票中獎號碼資料結構

export interface LotteryPeriod {
  period: string; // 期別，例如 "113年11-12月"
  drawDate: string; // 開獎日期
  specialPrize: string; // 特別獎 (8碼全中1000萬)
  grandPrize: string; // 特獎 (8碼全中200萬)
  firstPrize: string[]; // 頭獎 (3組，8碼全中20萬，後7碼4萬，後6碼1萬，後5碼4千，後4碼1千，後3碼200)
  additionalSixth: string[]; // 增開六獎 (後3碼200元)
}

// 檢查中獎結果
export interface CheckResult {
  isWinner: boolean;
  prize?: {
    name: string;
    amount: number;
    matchType: string;
  };
  matchedNumber?: string;
}
