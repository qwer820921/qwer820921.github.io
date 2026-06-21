"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { loadSave, purchaseUpgrade } from "../lib/meta/saveData";
import {
  PERMANENT_UPGRADES,
  getUpgradeCost,
} from "../lib/meta/permanentUpgrades";
import type { SaveData } from "../types";
import styles from "../styles/monsterTide.module.css";

export default function ForgePage() {
  const [save, setSave] = useState<SaveData | null>(null);

  const refresh = useCallback(() => setSave(loadSave()), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!save) return null;

  const handlePurchase = (
    type: (typeof PERMANENT_UPGRADES)[number]["type"],
    maxLevel: number
  ) => {
    const currentLevel = save.permanentUpgrades[type];
    const cost = getUpgradeCost(type, currentLevel);
    if (cost === null || save.totalSouls < cost) return;
    purchaseUpgrade(type, cost, maxLevel);
    refresh();
  };

  return (
    <div className={styles.forgePage}>
      <div className={styles.forgeHeader}>
        <Link href="/monsterTide/stageSelect" className={styles.backLink}>
          ← 關卡選擇
        </Link>
        <h1 className={styles.forgeTitle}>⚒ 鐵匠鋪</h1>
        <div className={styles.soulsDisplay}>💎 {save.totalSouls} 深淵晶核</div>
      </div>

      <p className={styles.forgeSubtitle}>
        使用深淵晶核購買永久強化，效果套用至所有後續戰鬥。
      </p>

      <div className={styles.upgradeList}>
        {PERMANENT_UPGRADES.map((def) => {
          const currentLevel = save.permanentUpgrades[def.type];
          const cost = getUpgradeCost(def.type, currentLevel);
          const canBuy = cost !== null && save.totalSouls >= cost;
          const isMax = currentLevel >= def.maxLevel;

          return (
            <div key={def.type} className={styles.upgradeCard}>
              <div className={styles.upgradeInfo}>
                <div className={styles.upgradeName}>
                  {def.name}
                  <span className={styles.upgradeLevel}>
                    Lv {currentLevel} / {def.maxLevel}
                  </span>
                </div>
                <div className={styles.upgradeDesc}>{def.description}</div>
                <div className={styles.upgradeEffect}>
                  {def.getEffect(currentLevel)}
                </div>
              </div>
              <div className={styles.upgradeBuyArea}>
                {isMax ? (
                  <div className={styles.upgradeMaxed}>✓ 已滿等</div>
                ) : (
                  <>
                    <div className={styles.upgradeCost}>💎 {cost}</div>
                    <button
                      className={`${styles.buyBtn} ${canBuy ? styles.buyBtnActive : styles.buyBtnDisabled}`}
                      disabled={!canBuy}
                      onClick={() => handlePurchase(def.type, def.maxLevel)}
                    >
                      購買
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
