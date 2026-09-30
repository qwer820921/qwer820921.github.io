/**
 * 敵人設定裡遊戲會使用的戰鬥欄位（和 Godot Enemy.gd 同一份規則；敵軍預覽與戰場內的下一波用它顯示）：
 * - atk：敵人被武將擋住時，每次攻擊那位武將的直接攻擊力（實際扣血再依武將的防禦減少，趙雲可以閃避）。
 *   只接受有限、不小於 0 的數字（包括 0：照樣算一次攻擊，只是沒有傷害）；沒有這個欄位、空白、字串（包括看起來像數字的）、
 *   布林、負數、NaN、無限大一律用預設的 20。不設上限。
 *   不是對城池的傷害：敵人抵達城池一律扣 1
 * - trait：字串、去掉前後空白後完全等於 immune_slow 時免疫減速（武將在道路上的阻擋減速、步兵塔的緩速光環、文士塔的疊加減速都不套用）。
 *   只看這個欄位，不看敵人的種類或 id；免疫減速仍會被武將擋住並攻擊武將。其他值遊戲不使用，不當成任何能力
 * 只讀設定、不改任何東西
 */

/** 敵人沒有有效 atk 時遊戲用的攻擊力（Godot Enemy.BLOCKER_ATK_DEFAULT） */
export const ENEMY_BLOCKER_ATK_DEFAULT = 20;

/** 免疫減速的 trait 值（Godot Enemy.TRAIT_IMMUNE_SLOW） */
export const TRAIT_IMMUNE_SLOW = "immune_slow";

export interface BlockerAtk {
  /** 遊戲實際用的攻擊力 */
  value: number;
  /** 設定沒有有效的 atk，改用預設值 */
  fallback: boolean;
}

/** 敵人設定的 atk → 遊戲實際用的對武將攻擊力 */
export function enemyBlockerAtk(
  cfg: { atk?: unknown } | null | undefined
): BlockerAtk {
  const raw = cfg ? cfg.atk : undefined;
  if (typeof raw === "number" && Number.isFinite(raw) && raw >= 0) {
    return { value: raw, fallback: false };
  }
  return { value: ENEMY_BLOCKER_ATK_DEFAULT, fallback: true };
}

export interface EnemyTraitInfo {
  /** 遊戲會讓這個敵人免疫減速 */
  immuneSlow: boolean;
  /** 有填但遊戲不使用的 trait（原樣去掉前後空白）；沒有填或是 immune_slow 時是 null */
  unused: string | null;
}

/** 敵人設定的 trait：免疫減速，或遊戲不使用的值 */
export function enemyTraitInfo(
  cfg: { trait?: unknown } | null | undefined
): EnemyTraitInfo {
  const raw = cfg ? cfg.trait : undefined;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (t === TRAIT_IMMUNE_SLOW) return { immuneSlow: true, unused: null };
    return { immuneSlow: false, unused: t === "" ? null : t };
  }
  if (raw === undefined || raw === null || raw === "") {
    return { immuneSlow: false, unused: null };
  }
  // 不是字串（數字、布林、物件）：遊戲不使用
  return { immuneSlow: false, unused: String(raw) };
}

/** 對武將攻擊力的說明（預覽與下一波的敵人列共用）：不寫成對城池的傷害 */
export function blockerAtkText(atk: BlockerAtk): string {
  return atk.fallback
    ? `對武將攻擊力 ${atk.value}（預設值：設定沒有有效的數字）`
    : `對武將攻擊力 ${atk.value}`;
}
