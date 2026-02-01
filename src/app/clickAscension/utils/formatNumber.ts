/**
 * 數值格式化工具
 * 支援三種格式：
 * 1. LETTER (字母單位): A = 10³, B = 10⁶, C = 10⁹ ... Z, AA, AB ...
 * 2. SCIENTIFIC (科學記號): 1.23e6, 4.56e9 ...
 * 3. CHINESE (中文單位): 萬、億、兆、京、垓 ...
 */

// 格式化模式類型
export type NumberFormatMode = "LETTER" | "SCIENTIFIC" | "CHINESE";

// 全域設定（預設使用字母單位）
let globalFormatMode: NumberFormatMode = "LETTER";

/**
 * 設定全域格式化模式
 * @param mode 格式化模式：'LETTER'、'SCIENTIFIC' 或 'CHINESE'
 */
export function setNumberFormatMode(mode: NumberFormatMode): void {
  globalFormatMode = mode;
  console.log(`[NumberFormat] 數值單位已切換為: ${mode}`);
}

/**
 * 取得當前格式化模式
 */
export function getNumberFormatMode(): NumberFormatMode {
  return globalFormatMode;
}

/**
 * 從 gameConfig 初始化格式化模式
 * 在系統初始化時呼叫此方法
 * @param settings gameConfig.settings 物件
 */
export function initNumberFormatFromConfig(
  settings: Record<string, unknown> | null | undefined
): void {
  if (!settings) {
    console.log("[NumberFormat] 無設定資料，使用預設模式: LETTER");
    return;
  }

  const formatSetting = String(settings.NUMBER_FORMAT || "LETTER")
    .toUpperCase()
    .trim();

  if (
    formatSetting === "LETTER" ||
    formatSetting === "SCIENTIFIC" ||
    formatSetting === "CHINESE"
  ) {
    setNumberFormatMode(formatSetting as NumberFormatMode);
  } else {
    console.warn(
      `[NumberFormat] 未知的格式設定: ${formatSetting}，使用預設模式: LETTER`
    );
    setNumberFormatMode("LETTER");
  }
}

// ============================================================================
// 字母單位系統 (LETTER)
// A = 10³, B = 10⁶, C = 10⁹ ... Z = 10⁷⁸, AA = 10⁸¹ ...
// ============================================================================

/**
 * 生成字母單位（A, B, C ... Z, AA, AB ... AZ, BA, BB ...）
 * @param index 單位索引（0 = A, 25 = Z, 26 = AA, 27 = AB ...）
 */
function getLetterUnit(index: number): string {
  if (index < 0) return "";

  let result = "";
  let n = index;

  // 類似 Excel 欄位命名邏輯
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result;
    n = Math.floor(n / 26) - 1;
  }

  return result;
}

/**
 * 使用字母單位格式化數值
 */
function formatWithLetterUnit(
  num: number,
  decimals: number,
  threshold: number
): string {
  // 小於閾值：直接顯示（加千分位）
  if (num < threshold) {
    return Math.floor(num).toLocaleString();
  }

  // 計算單位索引（每個單位是 10³）
  // index 0 = A (10³), index 1 = B (10⁶), ...
  const exponent = Math.floor(Math.log10(num));
  const unitIndex = Math.floor(exponent / 3) - 1;

  if (unitIndex < 0) {
    return Math.floor(num).toLocaleString();
  }

  // 計算該單位的數值
  const unitValue = Math.pow(10, (unitIndex + 1) * 3);
  const displayValue = num / unitValue;

  // 獲取單位字母
  const unit = getLetterUnit(unitIndex);

  // 格式化數值
  // 如果數值 >= 100，減少小數位以保持簡潔
  let finalDecimals = decimals;
  if (displayValue >= 100) {
    finalDecimals = Math.max(0, decimals - 1);
  }
  if (displayValue >= 1000) {
    finalDecimals = 0;
  }

  return displayValue.toFixed(finalDecimals) + unit;
}

// ============================================================================
// 科學記號系統 (SCIENTIFIC)
// 1.23e3, 4.56e6, 7.89e9 ...
// ============================================================================

/**
 * 使用科學記號格式化數值
 */
function formatWithScientific(
  num: number,
  decimals: number,
  threshold: number
): string {
  // 小於閾值：直接顯示（加千分位）
  if (num < threshold) {
    return Math.floor(num).toLocaleString();
  }

  // 使用科學記號
  const exponent = Math.floor(Math.log10(num));
  const mantissa = num / Math.pow(10, exponent);

  return `${mantissa.toFixed(decimals)}e${exponent}`;
}

// ============================================================================
// 中文單位系統 (CHINESE)
// 萬 = 10⁴, 億 = 10⁸, 兆 = 10¹², 京 = 10¹⁶, 垓 = 10²⁰ ...
// ============================================================================

// 中文單位表（每4位一個單位）
const CHINESE_UNITS = [
  { unit: "", value: 1 }, // 個位
  { unit: "萬", value: 1e4 }, // 10⁴
  { unit: "億", value: 1e8 }, // 10⁸
  { unit: "兆", value: 1e12 }, // 10¹²
  { unit: "京", value: 1e16 }, // 10¹⁶
  { unit: "垓", value: 1e20 }, // 10²⁰
  { unit: "秭", value: 1e24 }, // 10²⁴
  { unit: "穰", value: 1e28 }, // 10²⁸
  { unit: "溝", value: 1e32 }, // 10³²
  { unit: "澗", value: 1e36 }, // 10³⁶
  { unit: "正", value: 1e40 }, // 10⁴⁰
  { unit: "載", value: 1e44 }, // 10⁴⁴
  { unit: "極", value: 1e48 }, // 10⁴⁸
];

/**
 * 使用中文單位格式化數值
 */
function formatWithChinese(
  num: number,
  decimals: number,
  threshold: number
): string {
  // 小於閾值：直接顯示（加千分位）
  if (num < threshold) {
    return Math.floor(num).toLocaleString();
  }

  // 找到適合的單位（從大到小）
  for (let i = CHINESE_UNITS.length - 1; i >= 0; i--) {
    const { unit, value } = CHINESE_UNITS[i];
    if (num >= value && value >= threshold) {
      const displayValue = num / value;

      // 如果數值 >= 100，減少小數位以保持簡潔
      let finalDecimals = decimals;
      if (displayValue >= 100) {
        finalDecimals = Math.max(0, decimals - 1);
      }
      if (displayValue >= 1000) {
        finalDecimals = 0;
      }

      return displayValue.toFixed(finalDecimals) + unit;
    }
  }

  return Math.floor(num).toLocaleString();
}

// ============================================================================
// 主要格式化函數
// ============================================================================

/**
 * 格式化大數值
 * @param num 要格式化的數值
 * @param decimals 小數位數（預設 2）
 * @param threshold 開始使用單位的閾值（預設 1000）
 * @param mode 格式化模式（可選，預設使用全域設定）
 * @returns 格式化後的字串
 *
 * 範例（LETTER 模式）：
 *   formatBigNumber(1234) => "1.23A"
 *   formatBigNumber(1234567) => "1.23B"
 *
 * 範例（SCIENTIFIC 模式）：
 *   formatBigNumber(1234) => "1.23e3"
 *   formatBigNumber(1234567) => "1.23e6"
 *
 * 範例（CHINESE 模式）：
 *   formatBigNumber(12345) => "1.23萬"
 *   formatBigNumber(123456789) => "1.23億"
 */
export function formatBigNumber(
  num: number,
  decimals: number = 2,
  threshold: number = 1000,
  mode?: NumberFormatMode
): string {
  // 處理負數
  if (num < 0) {
    return "-" + formatBigNumber(-num, decimals, threshold, mode);
  }

  // 使用指定模式或全域模式
  const formatMode = mode || globalFormatMode;

  switch (formatMode) {
    case "SCIENTIFIC":
      return formatWithScientific(num, decimals, threshold);
    case "CHINESE":
      return formatWithChinese(num, decimals, threshold);
    case "LETTER":
    default:
      return formatWithLetterUnit(num, decimals, threshold);
  }
}

/**
 * 格式化數值（向後兼容的別名）
 * 可以在專案中逐步替換 formatNumber 為 formatBigNumber
 */
export function formatNumber(num: number): string {
  return formatBigNumber(num, 2, 1000);
}

/**
 * 格式化數值（保留更多小數位，適合顯示精確數值）
 */
export function formatBigNumberPrecise(num: number): string {
  return formatBigNumber(num, 3, 1000);
}

/**
 * 格式化數值（簡潔版，1位小數）
 */
export function formatBigNumberCompact(num: number): string {
  return formatBigNumber(num, 1, 1000);
}

// 測試用例（開發時可以取消註解來驗證）
// console.log("=== Test LETTER mode ===");
// setNumberFormatMode("LETTER");
// console.log(formatBigNumber(1234)); // "1.23A"
// console.log(formatBigNumber(1234567)); // "1.23B"
// console.log(formatBigNumber(1e9)); // "1.00C"

// console.log("=== Test SCIENTIFIC mode ===");
// setNumberFormatMode("SCIENTIFIC");
// console.log(formatBigNumber(1234)); // "1.23e3"
// console.log(formatBigNumber(1234567)); // "1.23e6"
// console.log(formatBigNumber(1e9)); // "1.00e9"

// console.log("=== Test CHINESE mode ===");
// setNumberFormatMode("CHINESE");
// console.log(formatBigNumber(12345)); // "1.23萬"
// console.log(formatBigNumber(123456789)); // "1.23億"
// console.log(formatBigNumber(1234567890123)); // "1.23兆"
