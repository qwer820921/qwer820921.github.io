"use client";

import { describeHeroSkill, heroSkillOf } from "../utils/heroSkills";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 武將技能（定義在 utils/heroSkills）：沒有技能的武將不顯示
 * - tag：列表卡片上的技能名稱
 * - full：詳情裡的技能名稱與完整規則；rawRange 是目前等級屬性表上的射程，射程技能會據此寫出戰場上的實際射程、
 *   減速光環、防禦光環、攻速光環與威壓會寫出目前的範圍半徑；atk 是目前的攻擊力，火攻會據此寫出每次灼燒的傷害、連射會寫出追加一擊的傷害、連環計會寫出每次傳遞的傷害、呼風喚雨會寫出範圍內每一名受到的傷害
 */
export default function HeroSkillInfo({
  heroId,
  variant,
  rawRange,
  atk,
}: {
  heroId: string;
  variant: "tag" | "full";
  rawRange?: number;
  atk?: number;
}) {
  const skill = heroSkillOf(heroId);
  if (!skill) return null;
  if (variant === "tag") {
    // 卡片是按鈕，裡面只能放行內的內容（span）；顯示方式由樣式決定
    return (
      <span className={styles.heroSkillTag} data-testid="hero-skill-tag">
        技能：{skill.name}
      </span>
    );
  }
  return (
    <div className={styles.heroSkillBox} data-testid="hero-skill-detail">
      <div className={styles.heroSkillName}>技能：{skill.name}</div>
      <div className={styles.heroSkillText}>
        {describeHeroSkill(skill, rawRange, atk)}
      </div>
    </div>
  );
}
