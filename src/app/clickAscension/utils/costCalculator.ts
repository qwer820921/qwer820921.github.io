/**
 * Cost Calculator - 統一處理升級成本計算
 * Phase 1.3 of State Management Refactor
 */

import { UpgradeEffectType } from "../types";

/**
 * 計算升級成本
 * @param baseCost 基礎成本
 * @param costMult 成本倍率
 * @param currentLevel 當前等級 (0-based)
 * @param effectType 效果類型 (可選，用於特殊處理)
 * @returns 升級所需成本
 */
export const calculateUpgradeCost = (
  baseCost: number,
  costMult: number,
  currentLevel: number,
  effectType?: UpgradeEffectType | string
): number => {
  // 特殊情況：消耗品 (ADD_INVENTORY) 使用固定成本
  if (effectType === UpgradeEffectType.ADD_INVENTORY) {
    return baseCost;
  }

  // 如果倍率為 1，使用線性公式: Base + Level
  if (costMult === 1 || costMult === 1.0) {
    return Math.floor(baseCost + currentLevel);
  }

  // 否則使用指數公式: Base * (Mult ^ Level)
  return Math.floor(baseCost * Math.pow(costMult, currentLevel));
};

/**
 * 計算購買多個等級的總成本
 * @param baseCost 基礎成本
 * @param costMult 成本倍率
 * @param fromLevel 起始等級 (0-based)
 * @param count 購買數量
 * @param effectType 效果類型 (可選)
 * @returns 總成本
 */
export const calculateBulkPurchaseCost = (
  baseCost: number,
  costMult: number,
  fromLevel: number,
  count: number,
  effectType?: UpgradeEffectType | string
): number => {
  let total = 0;
  for (let i = 0; i < count; i++) {
    total += calculateUpgradeCost(baseCost, costMult, fromLevel + i, effectType);
  }
  return total;
};

/**
 * 計算可以購買的最大數量
 * @param baseCost 基礎成本
 * @param costMult 成本倍率
 * @param currentLevel 當前等級
 * @param availableFunds 可用資金
 * @param maxLevel 最大等級限制 (可選)
 * @param effectType 效果類型 (可選)
 * @returns 可購買數量
 */
export const calculateMaxPurchasable = (
  baseCost: number,
  costMult: number,
  currentLevel: number,
  availableFunds: number,
  maxLevel?: number,
  effectType?: UpgradeEffectType | string
): number => {
  let count = 0;
  let totalCost = 0;
  let level = currentLevel;

  while (true) {
    // 檢查是否達到最大等級
    if (maxLevel !== undefined && level >= maxLevel) {
      break;
    }

    const nextCost = calculateUpgradeCost(baseCost, costMult, level, effectType);
    
    if (totalCost + nextCost > availableFunds) {
      break;
    }

    totalCost += nextCost;
    count++;
    level++;
  }

  return count;
};

/**
 * 計算效果值
 * @param baseVal 基礎效果值
 * @param levelMult 等級倍率 (每級增加量)
 * @param level 當前等級 (1-based for display)
 * @returns 效果值
 */
export const calculateEffectValue = (
  baseVal: number,
  levelMult: number,
  level: number
): number => {
  // 效果值 = 基礎值 + (等級 - 1) * 等級倍率
  return baseVal + (level - 1) * levelMult;
};

/**
 * 計算下一級的效果值增量
 * @param levelMult 等級倍率
 * @returns 增量
 */
export const calculateEffectIncrement = (levelMult: number): number => {
  return levelMult;
};

/**
 * 計算升級經驗需求
 * @param level 當前等級
 * @param baseXp 基礎經驗
 * @param growthRate 成長率
 * @returns 升級所需經驗
 */
export const calculateRequiredXp = (
  level: number,
  baseXp: number = 50,
  growthRate: number = 1.2
): number => {
  return Math.floor(baseXp * Math.pow(growthRate, level - 1));
};

/**
 * 計算怪物血量
 * @param stage 關卡數
 * @param baseHp 基礎血量
 * @param growthRate 成長率
 * @param isBoss 是否為 Boss
 * @param bossMult Boss 血量倍率
 * @returns 怪物血量
 */
export const calculateMonsterHp = (
  stage: number,
  baseHp: number = 20,
  growthRate: number = 1.18,
  isBoss: boolean = false,
  bossMult: number = 10
): number => {
  const baseMonsterHp = Math.floor(baseHp * Math.pow(growthRate, stage - 1));
  return isBoss ? baseMonsterHp * bossMult : baseMonsterHp;
};

/**
 * 計算飛昇點數
 * @param maxStageReached 最高達到關卡
 * @param formula 公式類型
 * @param baseAmount 基礎數量
 * @param multiplier 倍率
 * @param minStage 最低要求關卡
 * @returns 飛昇點數
 */
export const calculateAscensionPoints = (
  maxStageReached: number,
  formula: "SOFT_EXP" | "LINEAR" | "SQRT" | "LOG" = "SOFT_EXP",
  baseAmount: number = 10,
  multiplier: number = 1.5,
  minStage: number = 1
): number => {
  const stageVal = Math.max(1, maxStageReached);
  
  if (stageVal < minStage) return 0;

  switch (formula) {
    case "LINEAR":
      return Math.floor(baseAmount + stageVal * multiplier);
    case "SQRT":
      return Math.floor(baseAmount * Math.sqrt(stageVal));
    case "LOG":
      return Math.floor(baseAmount * Math.log10(stageVal + 1) * multiplier);
    case "SOFT_EXP":
    default:
      return Math.floor(baseAmount * Math.pow(multiplier, Math.sqrt(stageVal)));
  }
};
