// 格式化價格為小數點後兩位
export function formatPrices(input: string | undefined): string {
  if (!input) return "-";
  const num = parseFloat(input);
  return isNaN(num) ? "-" : num.toFixed(2);
}
