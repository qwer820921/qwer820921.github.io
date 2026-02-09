import { LotteryPeriod, CheckResult } from "../types";

/**
 * 解析電子發票 QR Code 內容
 * 
 * 格式範例：
 * - 舊版：AA123456781121015BBBB... (10碼號碼 + 7碼日期)
 * - 規格：發票號碼(10), 開獎日期(7), 隨機碼(4), 銷售額(8), 總額(8), 買方(8), 賣方(8), 加密(24)
 * 
 * @param decodedText 掃描得到的字串
 */
export function parseInvoiceQRCode(decodedText: string): { number: string; period: string } | null {
  if (!decodedText || decodedText.length < 17) return null;

  // 取前 10 碼為發票號碼 (例如 AA12345678)
  const fullNumber = decodedText.substring(0, 10);
  const number = decodedText.substring(2, 10); // 只取數字部分

  // 基本檢驗：前兩碼應為大寫字母，後八碼應為數字
  const numberRegex = /^[A-Z]{2}[0-9]{8}$/;
  if (!numberRegex.test(fullNumber)) return null;

  // 取日期部分 (1131112) -> 轉為期別格式 (113年11-12月)
  // 注意：二維條碼中的月份是開獎月份或交易月份。一般發票是兩個月一期。
  const year = decodedText.substring(10, 13);
  const month = parseInt(decodedText.substring(13, 15), 10);

  // 計算期別：發票是 1-2, 3-4, 5-6, 7-8, 9-10, 11-12 月一期
  let periodStr = "";
  if (month <= 2) periodStr = `${year}年01-02月`;
  else if (month <= 4) periodStr = `${year}年03-04月`;
  else if (month <= 6) periodStr = `${year}年05-06月`;
  else if (month <= 8) periodStr = `${year}年07-08月`;
  else if (month <= 10) periodStr = `${year}年09-10月`;
  else periodStr = `${year}年11-12月`;

  return {
    number,
    period: periodStr,
  };
}

/**
 * 全面檢查發票號碼是否中獎
 * 
 * @param number 8 點發票號碼
 * @param periodData 該期開獎號碼資料
 */
export function fullCheck(number: string, periodData: LotteryPeriod): CheckResult {
  // 1. 檢查特別獎 (8碼)
  if (number === periodData.specialPrize) {
    return {
      isWinner: true,
      prize: { name: "特別獎", amount: 10000000, matchType: "8" },
      matchedNumber: number
    };
  }

  // 2. 檢查特獎 (8碼)
  if (number === periodData.grandPrize) {
    return {
      isWinner: true,
      prize: { name: "特獎", amount: 2000000, matchType: "8" },
      matchedNumber: number
    };
  }

  // 3. 檢查頭獎 (與 3 組號碼比對不同長度)
  for (const winningNum of periodData.firstPrize) {
    // 8 碼全中
    if (number === winningNum) {
      return { isWinner: true, prize: { name: "頭獎", amount: 200000, matchType: "8" }, matchedNumber: number };
    }
    // 末 7 碼
    if (number.substring(1) === winningNum.substring(1)) {
      return { isWinner: true, prize: { name: "二獎", amount: 40000, matchType: "7" }, matchedNumber: winningNum.substring(1) };
    }
    // 末 6 碼
    if (number.substring(2) === winningNum.substring(2)) {
      return { isWinner: true, prize: { name: "三獎", amount: 10000, matchType: "6" }, matchedNumber: winningNum.substring(2) };
    }
    // 末 5 碼
    if (number.substring(3) === winningNum.substring(3)) {
      return { isWinner: true, prize: { name: "四獎", amount: 4000, matchType: "5" }, matchedNumber: winningNum.substring(3) };
    }
    // 末 4 碼
    if (number.substring(4) === winningNum.substring(4)) {
      return { isWinner: true, prize: { name: "五獎", amount: 1000, matchType: "4" }, matchedNumber: winningNum.substring(4) };
    }
    // 末 3 碼
    if (number.substring(5) === winningNum.substring(5)) {
      return { isWinner: true, prize: { name: "六獎", amount: 200, matchType: "3" }, matchedNumber: winningNum.substring(5) };
    }
  }

  // 4. 檢查增開六獎 (末 3 碼)
  if (periodData.additionalSixth && periodData.additionalSixth.length > 0) {
    for (const addNum of periodData.additionalSixth) {
      if (number.substring(5) === addNum) {
        return { isWinner: true, prize: { name: "增開六獎", amount: 200, matchType: "3" }, matchedNumber: addNum };
      }
    }
  }

  return { isWinner: false };
}

/**
 * 快速檢查末三碼是否可能中獎 (用於鍵盤輸入)
 * 
 * @param lastThree 輸入的 3 位數
 * @param periodData 該期開獎號碼資料
 */
export function quickCheckLastThree(lastThree: string, periodData: LotteryPeriod): { possible: boolean; matches: string[] } {
  const matches: string[] = [];

  // 比對特別獎
  if (periodData.specialPrize.endsWith(lastThree)) {
    matches.push(`特別獎 (末3碼相同)`);
  }

  // 比對特獎
  if (periodData.grandPrize.endsWith(lastThree)) {
    matches.push(`特獎 (末3碼相同)`);
  }

  // 比對頭獎
  for (const num of periodData.firstPrize) {
    if (num.endsWith(lastThree)) {
      matches.push(`頭獎/分獎 (末3碼相同: ${num.substring(0, 5)}...${lastThree})`);
    }
  }

  // 比對增開六獎
  if (periodData.additionalSixth && periodData.additionalSixth.length > 0) {
    for (const num of periodData.additionalSixth) {
      if (num === lastThree) {
        matches.push(`增開六獎: ${num}`);
      }
    }
  }

  return {
    possible: matches.length > 0,
    matches
  };
}

