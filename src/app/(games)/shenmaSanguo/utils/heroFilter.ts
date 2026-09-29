import { HeroConfig, HeroState, JobClass } from "../types";

/**
 * 武將列表的搜尋、職業篩選與排序（主頁武將視窗與獨立武將頁共用）
 * - 只影響畫面顯示：不改玩家存檔、隊伍或靜態設定，條件由呼叫端放在元件的 state
 * - 數值一律用目前玩家資料與設定計算（不是畫面上格式化過的文字）；攻擊力是存檔裡的基礎攻擊，不含戰場技能加成
 */

export type HeroSortKey = "default" | "level" | "atk" | "cost";

export interface HeroFilterCriteria {
  /** 名稱或 hero_id 的部分文字；比對前去掉頭尾空白、英文字母不分大小寫 */
  query: string;
  /** null＝全部職業 */
  job: JobClass | null;
  sort: HeroSortKey;
}

export const DEFAULT_HERO_FILTER: HeroFilterCriteria = {
  query: "",
  job: null,
  sort: "default",
};

export const HERO_SORT_OPTIONS: { value: HeroSortKey; label: string }[] = [
  { value: "default", label: "預設順序" },
  { value: "level", label: "等級 高→低" },
  { value: "atk", label: "攻擊力 高→低" },
  { value: "cost", label: "升級費用 低→高" },
];

export const HERO_JOB_OPTIONS: { value: JobClass | null; label: string }[] = [
  { value: null, label: "全部" },
  { value: JobClass.Infantry, label: "步兵" },
  { value: JobClass.Archer, label: "弓兵" },
  { value: JobClass.Artillery, label: "砲兵" },
  { value: JobClass.Cavalry, label: "騎兵" },
];

export const isDefaultHeroFilter = (c: HeroFilterCriteria) =>
  c.query.trim() === "" && c.job === null && c.sort === "default";

/** 玩家還沒有這位武將的升級紀錄時，視為 Lv1、基礎屬性 */
export function resolveHeroState(
  config: HeroConfig,
  playerHeroes: HeroState[]
): HeroState {
  return (
    playerHeroes.find((h) => h.hero_id === config.hero_id) ?? {
      hero_id: config.hero_id,
      level: 1,
      star: 0,
      atk: config.base_atk,
      def: config.base_def,
      hp: config.base_hp,
    }
  );
}

/** 目前等級升一級的費用（和升級按鈕、後端的計算相同） */
export const heroUpgradeCost = (config: HeroConfig, hero: HeroState) =>
  config.upgrade_cost_base * hero.level;

export interface HeroListEntry {
  config: HeroConfig;
  hero: HeroState;
  cost: number;
}

export interface HeroFilterResult {
  items: HeroListEntry[];
  /** 符合條件的武將數 */
  matched: number;
  /** 設定裡的武將總數 */
  total: number;
}

/** 排序用的數值：有限的數字（或內容是數字的文字）；其他一律排在最後 */
function sortValue(v: unknown): number | null {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string" && v.trim() !== ""
        ? Number(v)
        : NaN;
  return Number.isFinite(n) ? n : null;
}

export function filterAndSortHeroes(
  configs: HeroConfig[],
  playerHeroes: HeroState[],
  criteria: HeroFilterCriteria
): HeroFilterResult {
  const q = criteria.query.trim().toLowerCase();
  const rows = configs.map((config, index) => {
    const hero = resolveHeroState(config, playerHeroes);
    return { config, hero, cost: heroUpgradeCost(config, hero), index };
  });
  const matchedRows = rows.filter(
    ({ config }) =>
      (criteria.job === null || config.job === criteria.job) &&
      (q === "" ||
        String(config.name).toLowerCase().includes(q) ||
        String(config.hero_id).toLowerCase().includes(q))
  );
  const key = (r: (typeof rows)[number]): number | null => {
    if (criteria.sort === "level") return sortValue(r.hero.level);
    if (criteria.sort === "atk") return sortValue(r.hero.atk);
    if (criteria.sort === "cost") return sortValue(r.cost);
    return null;
  };
  // 高→低的排序把數值取負；同值（和沒有數值的）依原清單順序
  const dir = criteria.sort === "cost" ? 1 : -1;
  const sorted =
    criteria.sort === "default"
      ? matchedRows
      : [...matchedRows].sort((a, b) => {
          const ka = key(a);
          const kb = key(b);
          if (ka !== null && kb !== null && ka !== kb) return (ka - kb) * dir;
          if (ka === null && kb !== null) return 1;
          if (ka !== null && kb === null) return -1;
          return a.index - b.index;
        });
  return {
    items: sorted.map(({ config, hero, cost }) => ({ config, hero, cost })),
    matched: matchedRows.length,
    total: configs.length,
  };
}
