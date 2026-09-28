import { HeroSkillPayload } from "../types";

/**
 * 武將技能（趙雲「奇襲」、黃忠「百步穿楊」）
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
    };

const HERO_SKILLS: Record<string, HeroSkill> = {
  zhao_yun: { id: "first_strike", name: "奇襲", firstAttackMultiplier: 2 },
  // 第一版的設計值（Round 14 選定），尚未做過平衡；傷害與攻速不變、不加連射
  huang_zhong: { id: "long_range", name: "百步穿楊", rangeMultiplier: 1.5 },
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

/**
 * 技能的完整規則（顯示在武將詳情）
 * rawRange：這位武將目前等級屬性表上的射程；有提供時，射程技能會寫出戰場上的實際射程
 */
export function describeHeroSkill(skill: HeroSkill, rawRange?: number): string {
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
  return {
    skill: {
      id: skill.id,
      first_attack_multiplier: skill.firstAttackMultiplier,
    },
  };
}
