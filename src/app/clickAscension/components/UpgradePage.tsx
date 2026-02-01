"use client";

import React from "react";
import { PlayerState, UpgradeEffectType } from "../types";
import { formatBigNumber } from "../utils/formatNumber";
import "../styles/clickAscension.css";

// 預設升級項目
const UPGRADE_ITEMS = [
  {
    id: "click_power",
    name: "點擊力量",
    description: "增加每次點擊的傷害",
    baseCost: 10,
    costMultiplier: 1.15,
    maxLevel: 100,
    effectType: UpgradeEffectType.ADD_DAMAGE,
    icon: "⚔️",
  },
  {
    id: "crit_chance",
    name: "爆擊機率",
    description: "提升爆擊發動的機率",
    baseCost: 50,
    costMultiplier: 1.2,
    maxLevel: 50,
    effectType: UpgradeEffectType.ADD_CRIT,
    icon: "💥",
  },
  {
    id: "gold_bonus",
    name: "金幣加成",
    description: "增加擊殺怪物獲得的金幣",
    baseCost: 100,
    costMultiplier: 1.25,
    maxLevel: 30,
    effectType: UpgradeEffectType.ADD_GOLD,
    icon: "💰",
  },
  {
    id: "auto_attack",
    name: "自動攻擊",
    description: "每秒自動造成傷害",
    baseCost: 500,
    costMultiplier: 1.3,
    maxLevel: 50,
    effectType: UpgradeEffectType.ADD_AUTO,
    icon: "⚡",
  },
];

interface UpgradePageProps {
  player: PlayerState;
  upgradeLevels: Record<string, number>;
  onPurchaseUpgrade: (upgradeId: string, cost: number) => void;
}

export default function UpgradePage({
  player,
  upgradeLevels,
  onPurchaseUpgrade,
}: UpgradePageProps) {
  const getUpgradeCost = (
    baseCost: number,
    multiplier: number,
    level: number
  ) => {
    return Math.floor(baseCost * Math.pow(multiplier, level));
  };

  return (
    <div className="space-y-3">
      {UPGRADE_ITEMS.map((item) => {
        const currentLevel = upgradeLevels[item.id] || 0;
        const cost = getUpgradeCost(
          item.baseCost,
          item.costMultiplier,
          currentLevel
        );
        const canAfford = player.wallet.gold >= cost;
        const isMaxed = currentLevel >= item.maxLevel;

        return (
          <div key={item.id} className="ca-upgrade-item">
            <div className="ca-upgrade-icon">{item.icon}</div>
            <div className="ca-upgrade-info">
              <div className="ca-upgrade-name">{item.name}</div>
              <div className="ca-upgrade-desc">{item.description}</div>
              <div className="ca-upgrade-level">
                Lv.{currentLevel} / {item.maxLevel}
              </div>
            </div>
            <button
              className={`ca-btn text-xs px-3 py-2 ${isMaxed ? "bg-slate-600" : canAfford ? "ca-btn-gold" : "bg-slate-700 opacity-50"}`}
              onClick={() =>
                !isMaxed && canAfford && onPurchaseUpgrade(item.id, cost)
              }
              disabled={isMaxed || !canAfford}
            >
              {isMaxed ? (
                <span className="text-slate-400">MAX</span>
              ) : (
                <span className="ca-upgrade-cost">
                  💰 {formatBigNumber(cost, 2, 1000)}
                </span>
              )}
            </button>
          </div>
        );
      })}
    </div>
  );
}
