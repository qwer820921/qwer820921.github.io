/**
 * 武將的放置身份比較（只用來判斷「是不是同一位武將」，例如同一位還在場上時不能再派）。
 * 依既有的 hero_ 前綴慣例：完整 ID（hero_ma_chao）與去掉前綴的寫法（ma_chao）視為同一位。
 * 只比較：不改輸入、不存回存檔或 canonical、不查設定或技能表，也不把去掉前綴的寫法升成可信的正式 ID；
 * 不轉大小寫、不猜名字、不做模糊比對。
 * 沒有身份（回傳 null）的情況：不是字串、空字串或只有空白、只有前綴（"hero_"）；沒有身份的值和任何值比較都不相同。
 */
export function heroIdentityKey(heroId: unknown): string | null {
  if (typeof heroId !== "string" || heroId.trim() === "") return null;
  const key = heroId.startsWith("hero_")
    ? heroId.slice("hero_".length)
    : heroId;
  return key === "" ? null : key;
}

/** 兩個武將 ID 是不是同一位（兩邊都要有身份） */
export function isSameHero(a: unknown, b: unknown): boolean {
  const ka = heroIdentityKey(a);
  return ka !== null && ka === heroIdentityKey(b);
}
