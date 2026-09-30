import { JobClass, Rarity } from "../types";

/**
 * 武將的職業與稀有度：遊戲認得的值、畫面上的名稱與顏色（主頁武將視窗、武將頁、隊伍編排、地圖編輯器共用）
 * - 值就是 heroes_config 存的文字（infantry、orange…），地圖編輯器的選單也只提供這些值
 * - 遊戲不認得的值（例如舊的稀有度 N／SR、中文職業）不改寫：畫面顯示「其他」與原始值，篩選時歸在「其他」
 * - 法師（mage）和弓兵一樣能攻擊飛行敵人（對空規則見 utils/antiAir），其他沒有專屬的機制
 */

export interface JobInfo {
  value: string;
  /** 完整名稱（步兵） */
  label: string;
  /** 一個字的簡稱（步） */
  short: string;
  color: string;
  /** 遊戲認得的職業 */
  known: boolean;
}

export interface RarityInfo {
  value: string;
  /** 一個字的名稱（橘）；遊戲不認得時是原始值 */
  label: string;
  color: string;
  known: boolean;
}

export const HERO_JOBS: readonly JobInfo[] = [
  {
    value: JobClass.Infantry,
    label: "步兵",
    short: "步",
    color: "#ef4444",
    known: true,
  },
  {
    value: JobClass.Archer,
    label: "弓兵",
    short: "弓",
    color: "#10b981",
    known: true,
  },
  {
    value: JobClass.Artillery,
    label: "砲兵",
    short: "砲",
    color: "#3b82f6",
    known: true,
  },
  {
    value: JobClass.Cavalry,
    label: "騎兵",
    short: "騎",
    color: "#8b5cf6",
    known: true,
  },
  {
    value: JobClass.Mage,
    label: "法師",
    short: "法",
    color: "#ec4899",
    known: true,
  },
];

export const HERO_RARITIES: readonly RarityInfo[] = [
  { value: Rarity.Orange, label: "橘", color: "#e8922a", known: true },
  { value: Rarity.Purple, label: "紫", color: "#9b59b6", known: true },
  { value: Rarity.Blue, label: "藍", color: "#5299e0", known: true },
  { value: Rarity.Green, label: "綠", color: "#52c07a", known: true },
];

/** 遊戲不認得的職業／稀有度用的顏色 */
export const UNKNOWN_CATEGORY_COLOR = "#94a3b8";

/** 設定裡的原始值（空白、null 都是空字串） */
const rawOf = (v: unknown) =>
  v === null || v === undefined ? "" : String(v).trim();

export const isKnownJob = (job: unknown) =>
  HERO_JOBS.some((j) => j.value === job);

export const isKnownRarity = (rarity: unknown) =>
  HERO_RARITIES.some((r) => r.value === rarity);

/** 職業的名稱與顏色；不認得的值顯示「其他（原始值）」，不當成步兵 */
export function jobInfo(job: unknown): JobInfo {
  const found = HERO_JOBS.find((j) => j.value === job);
  if (found) return found;
  const raw = rawOf(job);
  return {
    value: raw,
    label: raw ? `其他（${raw}）` : "其他（未設定）",
    short: "他",
    color: UNKNOWN_CATEGORY_COLOR,
    known: false,
  };
}

/** 稀有度的名稱與顏色；不認得的值直接顯示原始值（空白時「？」） */
export function rarityInfo(rarity: unknown): RarityInfo {
  const found = HERO_RARITIES.find((r) => r.value === rarity);
  if (found) return found;
  const raw = rawOf(rarity);
  return {
    value: raw,
    label: raw || "？",
    color: UNKNOWN_CATEGORY_COLOR,
    known: false,
  };
}
