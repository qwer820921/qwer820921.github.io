import { HeroSkillPayload } from "../types";

/**
 * 武將技能（第一版只有趙雲「奇襲」）
 * 這裡是技能規則的唯一來源：武將列表／詳情的說明，與隨出征資料送進 Godot 的參數都由這裡產生。
 * 技能是戰場效果：不寫進玩家存檔，也不需要後端（GAS）支援
 */
export interface HeroSkill {
  /** 效果種類：first_strike＝每場戰鬥首次有效普通攻擊的傷害加倍 */
  id: "first_strike";
  name: string;
  /** 每場戰鬥首次有效普通攻擊的傷害倍率 */
  firstAttackMultiplier: number;
}

const HERO_SKILLS: Record<string, HeroSkill> = {
  zhao_yun: { id: "first_strike", name: "奇襲", firstAttackMultiplier: 2 },
};

export const heroSkillOf = (heroId: string): HeroSkill | null =>
  HERO_SKILLS[heroId] ?? null;

/** 技能的完整規則（顯示在武將詳情） */
export function describeHeroSkill(skill: HeroSkill): string {
  return (
    `每場戰鬥中，第一次命中敵人的普通攻擊造成 ${skill.firstAttackMultiplier} 倍傷害（武將上方會出現金色的「x${skill.firstAttackMultiplier}!」），之後恢復普通攻擊。` +
    "沒有目標時不會用掉；同一場戰鬥裡換波次、移動位置、調整隊伍或移除後重新放置都不會再觸發，" +
    "切換關卡或重新開始才會重置。"
  );
}

/** 隨出征資料送進 Godot 的技能參數（team_list[].skill）；沒有技能的武將不帶這個欄位 */
export function heroSkillPayload(heroId: string): { skill?: HeroSkillPayload } {
  const skill = heroSkillOf(heroId);
  return skill
    ? {
        skill: {
          id: skill.id,
          first_attack_multiplier: skill.firstAttackMultiplier,
        },
      }
    : {};
}
