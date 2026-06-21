import type { PermanentUpgradeType } from "../../types";

export interface UpgradeDef {
  type: PermanentUpgradeType;
  name: string;
  description: string;
  costs: number[];
  maxLevel: number;
  getEffect(level: number): string;
}

export const PERMANENT_UPGRADES: UpgradeDef[] = [
  {
    type: "base_atk",
    name: "基礎攻擊強化",
    description: "提升所有武器的基礎傷害",
    costs: [30, 60, 100, 150, 200],
    maxLevel: 5,
    getEffect: (lv) => (lv === 0 ? "尚未購買" : `全武器傷害 +${lv * 5}%`),
  },
  {
    type: "base_hp",
    name: "基地加固",
    description: "提升基地血量上限",
    costs: [25, 50, 80, 120, 180],
    maxLevel: 5,
    getEffect: (lv) => (lv === 0 ? "尚未購買" : `基地 HP +${lv * 20}`),
  },
  {
    type: "start_weapon",
    name: "初始武器解鎖",
    description: "進入關卡時可選擇一個初始武器",
    costs: [200],
    maxLevel: 1,
    getEffect: (lv) => (lv === 0 ? "尚未購買" : "已解鎖（開局選武器）"),
  },
];

export function getUpgradeCost(
  type: PermanentUpgradeType,
  currentLevel: number
): number | null {
  const def = PERMANENT_UPGRADES.find((u) => u.type === type);
  if (!def || currentLevel >= def.maxLevel) return null;
  return def.costs[currentLevel] ?? null;
}

/** 永久攻擊強化對 damageMultiplier 的加成（百分比 → 倍數差） */
export function getPermanentDmgBonus(level: number): number {
  return level * 0.05; // +5% per level → createPlayer(bonus) 時加到 damageMultiplier
}

/** 永久基地加固對 base HP 的加成 */
export function getPermanentHpBonus(level: number): number {
  return level * 20;
}
