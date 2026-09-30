/**
 * 飛行敵人與對空（和 Godot 的 Enemy.gd、Hero.gd、Tower.gd 同一套規則；Web 只用來顯示，戰場上由 Godot 判斷）
 * - 敵人設定的 movement_type：去掉前後空白後等於 "flying" 才是飛行；沒有這個欄位、空白、其他值（例如 Flying、air）遊戲都當作地面
 * - 飛行敵人從路線的起點直線飛到終點（忽略中間的轉折），不會被武將擋住，也不攻擊武將
 * - 能攻擊飛行敵人的：弓兵、法師武將與弓兵塔；文士塔可以對飛行敵人減速。
 *   步兵、騎兵、砲兵武將與遊戲不認得的職業，步兵（包括緩速光環）、騎兵、砲兵（包括範圍傷害）塔只打地面
 */

export type MovementType = "ground" | "flying";

export interface MovementInfo {
  /** 遊戲實際採用的移動方式 */
  value: MovementType;
  /** 設定裡的原始值（沒有設定、null 時是空字串） */
  raw: string;
  /** 原始值就是遊戲的值（ground、flying）或沒有設定；否則是遊戲不認得的寫法（遊戲照 value 處理） */
  known: boolean;
  /** 畫面上的名稱（地面／飛行） */
  label: string;
}

/** 地圖編輯器的選單：只提供遊戲的值 */
export const MOVEMENT_TYPES: readonly { value: MovementType; label: string }[] =
  [
    { value: "ground", label: "地面" },
    { value: "flying", label: "飛行" },
  ];

/** 和 Godot 的 strip_edges 相同：只去掉前後的控制字元與半形空白（字元碼 ≤ 32；全形空白等不去掉） */
function stripEdges(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && s.charCodeAt(a) <= 32) a += 1;
  while (b > a && s.charCodeAt(b - 1) <= 32) b -= 1;
  return s.slice(a, b);
}

/** 敵人設定的移動方式；原始值不是 ground／flying（空白除外）時 known 是 false，遊戲一律當作地面（前後的空白不影響） */
export function movementOf(v: unknown): MovementInfo {
  const raw = v === null || v === undefined ? "" : String(v);
  const value: MovementType =
    stripEdges(raw) === "flying" ? "flying" : "ground";
  return {
    value,
    raw,
    known: raw === "" || raw === "ground" || raw === "flying",
    label: value === "flying" ? "飛行" : "地面",
  };
}

export const isFlyingEnemy = (
  e: { movement_type?: unknown } | null | undefined
): boolean => movementOf(e?.movement_type).value === "flying";

/** 能攻擊飛行敵人的武將職業（heroes_config 的 job，完全相同才算） */
export const AIR_HERO_JOBS: readonly string[] = ["archer", "mage"];

export const heroCanHitAir = (job: unknown): boolean =>
  typeof job === "string" && AIR_HERO_JOBS.includes(job);

/** 防禦塔對飛行敵人的作用：attack 可以攻擊、slow 可以減速（文士塔）、none 沒有作用 */
export type TowerAirAbility = "attack" | "slow" | "none";

const TOWER_AIR: Record<string, TowerAirAbility> = {
  archer: "attack",
  scholar: "slow",
  infantry: "none",
  cavalry: "none",
  artillery: "none",
};

export const towerAirAbility = (towerType: unknown): TowerAirAbility =>
  (typeof towerType === "string" && TOWER_AIR[towerType]) || "none";

/** 武將的對空說明（武將詳情用） */
export const heroAirText = (job: unknown): string =>
  heroCanHitAir(job)
    ? "可以攻擊飛行敵人（也能打地面）"
    : "只打地面，打不到飛行敵人";

/** 防禦塔的對空說明（部署選單、單位面板用的簡短文字） */
export function towerAirText(towerType: unknown): string {
  switch (towerAirAbility(towerType)) {
    case "attack":
      return "可對空";
    case "slow":
      return "可減速飛行";
    default:
      return "只打地面";
  }
}

/** 敵軍預覽的說明：哪些單位能對付飛行敵人 */
export const FLYING_RULE_TEXT =
  "飛行敵人從起點直線飛向終點，不會被武將擋住，也不攻擊武將。能攻擊飛行敵人的只有弓兵、法師武將與弓兵塔；文士塔可以對飛行敵人減速；步兵、騎兵、砲兵武將與步兵、騎兵、砲兵塔（包括範圍傷害與緩速光環）只打地面。";
