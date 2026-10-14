import { HeroConfig, HeroState } from "../types";
import { heroAirText, heroCanHitAir } from "./antiAir";
import { jobInfo } from "./heroCategories";
import { resolveHeroState } from "./heroFilter";
import { describeHeroSkill, effectiveRange, heroSkillOf } from "./heroSkills";
import { attackIntervalSec } from "./heroStats";

/**
 * 兩位武將的並列比較（主頁武將視窗、獨立武將頁共用）
 * - 只看目前的資料：正式 heroes_config（名稱、職業、出陣容量 cost、射程與成長、攻擊間隔與攻速成長）與目前存檔的武將
 *   （等級、攻擊、防禦、生命；沒有升級紀錄的武將照既有規則是 Lv1、基礎屬性）。每次畫面更新都重新計算，
 *   升級或切換存檔後立刻是新的數值；不另存快照、不寫存檔、不送任何請求
 * - 數值是存檔的基礎值（目前等級），不含戰場上的技能、光環與加成。射程技能（百步穿楊）另外列「戰場有效射程」，
 *   照 effectiveRange 乘一次；基礎射程那一列不乘
 * - 設定或存檔的數值無效（缺欄位、不是有限的數字、等級不是正整數）時這一位「不能比較」，不猜 0 或其他預設值
 * - 不計算總戰力、排名或每秒傷害；差額（compareDiffs）只是右欄減左欄的數字差，不判斷好壞
 */

/** 最多比較幾位 */
export const COMPARE_MAX = 2;

/**
 * 點選一位武將（比較模式）：已選的再點一次是取消；還沒滿時加入；已經選滿時不加入（refused＝true，
 * 畫面說明要先取消一位），不自動替換。回傳新的選取（不改原陣列）
 */
export function toggleCompare(
  selected: readonly string[],
  heroId: string
): { selected: string[]; refused: boolean } {
  if (selected.includes(heroId))
    return { selected: selected.filter((id) => id !== heroId), refused: false };
  if (selected.length >= COMPARE_MAX)
    return { selected: [...selected], refused: true };
  return { selected: [...selected, heroId], refused: false };
}

/** 設定重新載入後，拿掉已經不在設定裡的武將與重複的選取（順序不變） */
export function pruneCompare(
  selected: readonly string[],
  configs: readonly HeroConfig[]
): string[] {
  const ids = new Set(configs.map((c) => c.hero_id));
  return selected.filter((id, i) => ids.has(id) && selected.indexOf(id) === i);
}

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

export interface HeroCompareColumn {
  heroId: string;
  name: string;
  /** false：設定或存檔的數值無效，這一位不能比較（problems 寫明哪些欄位） */
  ok: boolean;
  problems: string[];
  job: string;
  level: number | null;
  atk: number | null;
  def: number | null;
  hp: number | null;
  /** 出陣容量（heroes_config 的 cost） */
  cost: number | null;
  /** 目前等級的基礎射程（格）：attack_range＋（等級−1）×range_growth，不含技能 */
  range: number | null;
  /** 戰場有效射程（格）：只有射程技能會改變時才有值（乘一次技能倍率） */
  battleRange: number | null;
  /** 攻擊間隔（秒，數字越小越快） */
  interval: number | null;
  skillName: string | null;
  skillText: string | null;
  canHitAir: boolean;
  airText: string;
}

const round3 = (n: number) => Number(n.toFixed(3));

/** 一位武將的比較欄：config 是正式設定，playerHeroes 是目前存檔的武將 */
export function compareColumn(
  config: HeroConfig,
  playerHeroes: readonly HeroState[]
): HeroCompareColumn {
  const hero = resolveHeroState(config, [...playerHeroes]);
  const problems: string[] = [];
  const need = (label: string, v: unknown, ok: (n: number) => boolean) => {
    if (!finite(v) || !ok(v)) problems.push(label);
  };
  need("出陣容量（cost）", config.cost, (n) => n >= 0);
  need("射程（attack_range）", config.attack_range, (n) => n >= 0);
  need("射程成長（range_growth）", config.range_growth, (n) => n >= 0);
  need("攻擊間隔（attack_speed）", config.attack_speed, (n) => n > 0);
  need("攻速成長（atk_spd_growth）", config.atk_spd_growth, (n) => n >= 0);
  need("等級", hero.level, (n) => Number.isInteger(n) && n >= 1);
  need("攻擊（ATK）", hero.atk, (n) => n >= 0);
  need("防禦（DEF）", hero.def, (n) => n >= 0);
  need("生命（HP）", hero.hp, (n) => n > 0);
  const ok = problems.length === 0;
  const skill = heroSkillOf(config.hero_id);
  const range = ok
    ? round3(config.attack_range + (hero.level - 1) * config.range_growth)
    : null;
  const battle =
    ok && range !== null && skill?.id === "long_range"
      ? effectiveRange(
          skill,
          config.attack_range + (hero.level - 1) * config.range_growth
        )
      : null;
  return {
    heroId: config.hero_id,
    name:
      typeof config.name === "string" && config.name
        ? config.name
        : config.hero_id,
    ok,
    problems,
    job: jobInfo(config.job).label,
    level: ok ? hero.level : null,
    atk: ok ? hero.atk : null,
    def: ok ? hero.def : null,
    hp: ok ? hero.hp : null,
    cost: ok ? config.cost : null,
    range,
    battleRange: battle,
    interval: ok ? attackIntervalSec(config, hero.level) : null,
    skillName: skill ? skill.name : null,
    skillText:
      skill && ok
        ? describeHeroSkill(
            skill,
            config.attack_range + (hero.level - 1) * config.range_growth,
            hero.atk
          )
        : null,
    canHitAir: heroCanHitAir(config.job),
    airText: heroAirText(config.job),
  };
}

/** 可以算差額的數值列（等級、職業、技能與對空不算） */
export const COMPARE_DIFF_KEYS = [
  "atk",
  "def",
  "hp",
  "cost",
  "range",
  "battleRange",
  "interval",
] as const;
export type CompareDiffKey = (typeof COMPARE_DIFF_KEYS)[number];

/** 戰場有效射程：有射程技能的是 battleRange；沒有射程技能的照既有規則就是基礎射程；不能比較的是 null */
export function battleRangeOf(c: HeroCompareColumn): number | null {
  if (!c.ok) return null;
  return c.battleRange ?? c.range;
}

/**
 * 比較的差額：以左欄為基準，右欄的值−左欄的值。兩邊先照畫面顯示四捨五入到 3 位小數再相減（差額和看到的數字一致），0 就是相同。
 * 任一欄不能比較或沒有有效的值時是 null（不能比較），不把 null 當 0；不算百分比、總戰力，也不判斷誰比較好
 */
export function compareDiffs(
  left: HeroCompareColumn,
  right: HeroCompareColumn
): Record<CompareDiffKey, number | null> {
  const value = (c: HeroCompareColumn, k: CompareDiffKey) =>
    !c.ok ? null : k === "battleRange" ? battleRangeOf(c) : c[k];
  const out = {} as Record<CompareDiffKey, number | null>;
  for (const k of COMPARE_DIFF_KEYS) {
    const a = value(left, k);
    const b = value(right, k);
    out[k] = finite(a) && finite(b) ? round3(round3(b) - round3(a)) || 0 : null;
  }
  return out;
}

/** 選取的兩位（照選取的順序）；不在設定裡的略過 */
export function compareColumns(
  selected: readonly string[],
  configs: readonly HeroConfig[],
  playerHeroes: readonly HeroState[]
): HeroCompareColumn[] {
  return selected
    .map((id) => configs.find((c) => c.hero_id === id))
    .filter((c): c is HeroConfig => !!c)
    .map((c) => compareColumn(c, playerHeroes));
}
