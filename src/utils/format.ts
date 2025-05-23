// 格式化價格為小數點後兩位
export function formatPrices(input: string | undefined): string {
  if (!input) return "-";
  const num = parseFloat(input);
  return isNaN(num) ? "-" : num.toFixed(2);
}

// 格式化時間，將秒數轉換為分:秒格式（如 3:05）
export function formatTime(time: number): string {
  const min = Math.floor(time / 60);
  const sec = Math.floor(time % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}
