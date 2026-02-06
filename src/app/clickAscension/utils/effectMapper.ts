/**
 * Effect Mapper - 統一處理效果類型對數值的影響
 * Phase 1.1 of State Management Refactor
 */

import { PlayerAttributes, UpgradeEffectType } from "../types";

/**
 * 將效果應用到玩家屬性上
 * @param stats 當前玩家屬性
 * @param effectType 效果類型
 * @param value 效果數值 (原始值，百分比會在內部處理)
 * @returns 新的玩家屬性物件
 */
export const applyEffect = (
  stats: PlayerAttributes,
  effectType: UpgradeEffectType | string,
  value: number
): PlayerAttributes => {
  const newStats = { ...stats };

  switch (effectType) {
    // 傷害相關
    case UpgradeEffectType.ADD_BASE_DMG:
      newStats.baseDamage += value;
      break;

    case UpgradeEffectType.ADD_AUTO_DMG:
      newStats.autoAttackDamage += value;
      break;

    case UpgradeEffectType.ADD_BOSS_DMG:
      // 百分比值，DB 存的是 10 代表 10%，需要轉換為 0.1
      newStats.bossDamageMultiplier += value / 100;
      break;

    case UpgradeEffectType.ADD_CRIT_CHANCE:
      // 百分比值，DB 存的是 5 代表 5%，需要轉換為 0.05
      newStats.criticalChance += value / 100;
      break;

    case UpgradeEffectType.ADD_CRIT_DMG:
      // 百分比值，DB 存的是 50 代表 50%，需要轉換為 0.5
      newStats.criticalDamage += value / 100;
      break;

    case UpgradeEffectType.EQUIP_DMG_MULT:
      // 百分比值 (整數)，配合 page.tsx 邏輯，不除以 100
      newStats.equipDamageMultiplier += value;
      break;

    // 資源倍率相關
    case UpgradeEffectType.ADD_GOLD:
    case UpgradeEffectType.ADD_GOLD_MULT:
      // 百分比值
      newStats.goldMultiplier += value / 100;
      break;

    case UpgradeEffectType.ADD_XP_MULT:
      // 百分比值
      newStats.xpMultiplier += value / 100;
      break;

    case UpgradeEffectType.ADD_AP_MULT:
      // 百分比值
      newStats.apMultiplier += value / 100;
      break;

    // 飛昇 / 特殊
    case UpgradeEffectType.ADD_ATK_P:
      // 攻擊力百分比加成 (同詞條相加)
      newStats.atkPercentBonus += value;
      break;

    case UpgradeEffectType.AUTO_CLICK_V:
      // 自動點擊次數 (整數值)
      newStats.autoClickPerSec += value;
      break;

    case UpgradeEffectType.RARE_CHANCE_P:
      // 稀有怪機率 (百分比)
      newStats.rareMonsterChance += value / 100;
      break;

    case UpgradeEffectType.REDUCE_GOAL_V:
      // 減少關卡目標 (整數值)
      newStats.monsterKillReduction += value;
      break;

    case UpgradeEffectType.ADD_INVENTORY:
      // 消耗品，不影響 stats，由其他邏輯處理
      break;

    default:
      console.warn(`[EffectMapper] Unknown effect type: ${effectType}`);
      break;
  }

  return newStats;
};

/**
 * 批量應用多個效果
 * @param stats 當前玩家屬性
 * @param effects 效果陣列 [{ type, value }, ...]
 * @returns 新的玩家屬性物件
 */
export const applyEffects = (
  stats: PlayerAttributes,
  effects: Array<{ type: UpgradeEffectType | string; value: number }>
): PlayerAttributes => {
  return effects.reduce(
    (currentStats, effect) => applyEffect(currentStats, effect.type, effect.value),
    { ...stats }
  );
};

/**
 * 取得效果類型的顯示名稱
 */
export const getEffectTypeName = (effectType: UpgradeEffectType | string): string => {
  const names: Record<string, string> = {
    [UpgradeEffectType.ADD_BASE_DMG]: "基礎傷害",
    [UpgradeEffectType.ADD_AUTO_DMG]: "自動攻擊",
    [UpgradeEffectType.ADD_BOSS_DMG]: "Boss傷害",
    [UpgradeEffectType.ADD_CRIT_CHANCE]: "爆擊機率",
    [UpgradeEffectType.ADD_CRIT_DMG]: "爆擊傷害",
    [UpgradeEffectType.EQUIP_DMG_MULT]: "裝備增傷",
    [UpgradeEffectType.ADD_GOLD]: "金幣獲取",
    [UpgradeEffectType.ADD_GOLD_MULT]: "金幣倍率",
    [UpgradeEffectType.ADD_XP_MULT]: "經驗倍率",
    [UpgradeEffectType.ADD_AP_MULT]: "飛昇點數倍率",
    [UpgradeEffectType.ADD_INVENTORY]: "道具",
    [UpgradeEffectType.ADD_ATK_P]: "攻擊力%",
    [UpgradeEffectType.AUTO_CLICK_V]: "自動點擊",
    [UpgradeEffectType.RARE_CHANCE_P]: "稀有怪機率",
    [UpgradeEffectType.REDUCE_GOAL_V]: "關卡目標減少",
  };
  return names[effectType] || effectType;
};

/**
 * 檢查效果類型是否為百分比類型
 */
export const isPercentageEffect = (effectType: UpgradeEffectType | string): boolean => {
  const percentageTypes = [
    UpgradeEffectType.ADD_BOSS_DMG,
    UpgradeEffectType.ADD_CRIT_CHANCE,
    UpgradeEffectType.ADD_CRIT_DMG,
    UpgradeEffectType.EQUIP_DMG_MULT,
    UpgradeEffectType.ADD_GOLD,
    UpgradeEffectType.ADD_GOLD_MULT,
    UpgradeEffectType.ADD_XP_MULT,
    UpgradeEffectType.ADD_AP_MULT,
    UpgradeEffectType.ADD_ATK_P,
    UpgradeEffectType.RARE_CHANCE_P,
  ];
  return percentageTypes.includes(effectType as UpgradeEffectType);
};
