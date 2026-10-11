/**
 * heroSkillBinding.ts
 * 武將技能接線：JS 版出征武將的技能參數一律取自正式技能表（shenmaSanguo/utils/heroSkills 的 heroSkillPayload，
 * 和 Godot 版出征資料用的是同一份），引擎的 HeroEntity 只讀 state.skill。
 * - 只認內建 13 位武將的完整 ID（BUILTIN_HEROES_CONFIG 的 hero_xxx）；對到後才換成技能表用的 ID（xxx）
 * - 其他（未知武將、沒有 hero_ 前綴、大小寫不同、constructor／__proto__ 這類名稱、不是字串）一律沒有技能
 * - 不讀後端武將設定（含 passive 文字）、存檔或任何外部資料裡的 skill；技能只放在戰場的部署資料，不寫進存檔
 * - 武將名冊的技能名稱與說明也照同一份對照取自正式技能表（heroSkillOf＋describeHeroSkill），不是內建武將時沒有說明
 */
import {
  describeHeroSkill,
  heroSkillOf,
  heroSkillPayload,
} from "../../shenmaSanguo/utils/heroSkills";
import type { HeroSkillPayload } from "../../shenmaSanguo/types";
import { BUILTIN_HEROES_CONFIG } from "../engine/builtinData";

const PREFIX = "hero_";

/** JS 版武將 ID → 正式技能表的武將 ID（只有內建的 13 位） */
const SKILL_HERO_ID: ReadonlyMap<string, string> = new Map(
  BUILTIN_HEROES_CONFIG.filter((c) => c.hero_id.startsWith(PREFIX)).map(
    (c) => [c.hero_id, c.hero_id.slice(PREFIX.length)] as const
  )
);

/** 這位武將在戰場上的技能參數（每次回傳新的物件）；不是內建武將時回傳 {} */
export function canvasHeroSkill(canvasHeroId: unknown): {
  skill?: HeroSkillPayload;
} {
  if (typeof canvasHeroId !== "string") return {};
  const id = SKILL_HERO_ID.get(canvasHeroId);
  return id === undefined ? {} : heroSkillPayload(id);
}

/**
 * 武將名冊顯示的技能名稱與完整說明（正式技能表的 describeHeroSkill 原文）；不是內建武將時回傳 null（不猜）。
 * 不傳目前等級的射程與攻擊力：說明只寫規則本身，不寫戰場上的實際數值
 */
export function canvasHeroSkillInfo(
  canvasHeroId: unknown
): { name: string; description: string } | null {
  if (typeof canvasHeroId !== "string") return null;
  const id = SKILL_HERO_ID.get(canvasHeroId);
  const skill = id === undefined ? null : heroSkillOf(id);
  return skill
    ? { name: skill.name, description: describeHeroSkill(skill) }
    : null;
}
