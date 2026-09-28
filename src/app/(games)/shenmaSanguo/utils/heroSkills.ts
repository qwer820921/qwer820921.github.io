import { HeroSkillPayload } from "../types";

/**
 * 武將技能（趙雲「奇襲」、黃忠「百步穿楊」、周瑜「火攻」）
 * 這裡是技能規則的唯一來源：武將列表／詳情的說明，與隨出征資料送進 Godot 的參數都由這裡產生。
 * 技能是戰場效果：不寫進玩家存檔，也不需要後端（GAS）支援。
 * 每種技能只帶自己的參數；Godot 不認得的技能 id 一律當作普通攻擊
 */
export type HeroSkill =
  | {
      /** 奇襲：每場戰鬥首次有效普通攻擊的傷害加倍 */
      id: "first_strike";
      name: string;
      /** 每場戰鬥首次有效普通攻擊的傷害倍率 */
      firstAttackMultiplier: number;
    }
  | {
      /** 百步穿楊：戰場上的有效射程加長 */
      id: "long_range";
      name: string;
      /** 有效射程倍率：（基礎射程＋（等級−1）×射程成長）× 倍率 */
      rangeMultiplier: number;
    }
  | {
      /** 火攻：每次有效普通攻擊命中後，對該敵人附加灼燒 */
      id: "burn";
      name: string;
      /** 每跳傷害＝命中當下的攻擊力 × burnRatio */
      burnRatio: number;
      /** 每次命中後的跳數（再次命中時剩餘跳數刷新成這個值） */
      burnTicks: number;
      /** 每跳間隔（秒，遊戲時間） */
      burnIntervalSec: number;
    };

const HERO_SKILLS: Record<string, HeroSkill> = {
  zhao_yun: { id: "first_strike", name: "奇襲", firstAttackMultiplier: 2 },
  // 第一版的設計值（Round 14 選定），尚未做過平衡；傷害與攻速不變、不加連射
  huang_zhong: { id: "long_range", name: "百步穿楊", rangeMultiplier: 1.5 },
  // 第一版的設計值（Round 15 選定），尚未做過平衡：每跳 20%、3 跳、間隔 1 秒；不疊層、不傳染
  zhou_yu: {
    id: "burn",
    name: "火攻",
    burnRatio: 0.2,
    burnTicks: 3,
    burnIntervalSec: 1,
  },
};

export const heroSkillOf = (heroId: string): HeroSkill | null =>
  HERO_SKILLS[heroId] ?? null;

// 顯示用：最多三位小數（例如 Lv2 的 7.545 格）
const round3 = (n: number) => Number(n.toFixed(3));

/** 戰場上的有效射程（格）：rawRange 是屬性表的射程（基礎射程＋（等級−1）×射程成長） */
export function effectiveRange(
  skill: HeroSkill | null,
  rawRange: number
): number {
  return skill?.id === "long_range"
    ? round3(rawRange * skill.rangeMultiplier)
    : round3(rawRange);
}

/** 火攻每跳的傷害：攻擊力 × 比例（沒有火攻時是 0） */
export function burnTickDamage(skill: HeroSkill | null, atk: number): number {
  return skill?.id === "burn" ? round3(atk * skill.burnRatio) : 0;
}

/**
 * 技能的完整規則（顯示在武將詳情）
 * - rawRange：這位武將目前等級屬性表上的射程；有提供時，射程技能會寫出戰場上的實際射程
 * - atk：這位武將目前的攻擊力；有提供時，火攻會寫出每次灼燒的傷害
 */
export function describeHeroSkill(
  skill: HeroSkill,
  rawRange?: number,
  atk?: number
): string {
  if (skill.id === "long_range") {
    const m = skill.rangeMultiplier;
    const current =
      rawRange === undefined
        ? ""
        : `目前等級：射程 ${round3(rawRange)} 格，戰場上是 ${effectiveRange(skill, rawRange)} 格。`;
    return (
      `戰場上的有效射程是屬性射程的 ${m} 倍，等級提升的射程成長也一起乘上 ${m} 倍；普通攻擊的傷害與攻擊間隔不變。` +
      current +
      "只在戰場生效，存檔與屬性表的「範圍」仍是原本的數值；在戰場選取武將時，射程圈顯示的是實際射程。" +
      "移動位置、調整隊伍或重新放置都不會重複加成。"
    );
  }
  if (skill.id === "burn") {
    const sec = skill.burnIntervalSec;
    const n = skill.burnTicks;
    const pct = round3(skill.burnRatio * 100);
    const current =
      atk === undefined
        ? ""
        : `目前攻擊力 ${round3(atk)}：每次灼燒 ${burnTickDamage(skill, atk)}。`;
    return (
      `每次普通攻擊命中後，敵人開始灼燒：每 ${sec} 秒受到一次傷害，共 ${n} 次，每次是命中當下攻擊力的 ${pct}%（第一次在命中 ${sec} 秒後），普通攻擊的傷害不變。` +
      current +
      `同一個敵人只有一份灼燒：再次命中時剩餘次數回到 ${n} 次、傷害換成這次命中的攻擊力，不會疊加，下一次灼燒的時間也不會重新計算。` +
      "敵人離開射程或武將被移除後仍會燒完；敵人被打倒或抵達基地就停止，灼燒不會再引發火攻。" +
      "灼燒中的敵人有橘色外圈，灼燒的傷害數字是橘色。只在戰場生效，不影響存檔。"
    );
  }
  return (
    `每場戰鬥中，第一次命中敵人的普通攻擊造成 ${skill.firstAttackMultiplier} 倍傷害（武將上方會出現金色的「x${skill.firstAttackMultiplier}!」），之後恢復普通攻擊。` +
    "沒有目標時不會用掉；同一場戰鬥裡換波次、移動位置、調整隊伍或移除後重新放置都不會再觸發，" +
    "切換關卡或重新開始才會重置。"
  );
}

/** 隨出征資料送進 Godot 的技能參數（team_list[].skill）；沒有技能的武將不帶這個欄位 */
export function heroSkillPayload(heroId: string): { skill?: HeroSkillPayload } {
  const skill = heroSkillOf(heroId);
  if (!skill) return {};
  if (skill.id === "long_range") {
    return { skill: { id: skill.id, range_multiplier: skill.rangeMultiplier } };
  }
  if (skill.id === "burn") {
    return {
      skill: {
        id: skill.id,
        burn_ratio: skill.burnRatio,
        burn_ticks: skill.burnTicks,
        burn_interval: skill.burnIntervalSec,
      },
    };
  }
  return {
    skill: {
      id: skill.id,
      first_attack_multiplier: skill.firstAttackMultiplier,
    },
  };
}
