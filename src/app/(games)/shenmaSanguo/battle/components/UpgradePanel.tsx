"use client";

import React from "react";
import styles from "../../styles/shenmaSanguo.module.css";

interface UpgradePanelProps {
  data: {
    unit_type: "hero" | "tower";
    hero_id?: string;
    tower_type?: string;
    name: string;
    level: number;
    atk: number;
    atk_spd: number;
    range: number;
    hp?: number;
    upgrade_cost?: number;
    max_level?: boolean;
    can_afford?: boolean;
    screen_pos: { x: number; y: number };
  };
  onUpgrade: () => void;
  onClose: () => void;
}

export default function UpgradePanel({
  data,
  onUpgrade,
  onClose,
}: UpgradePanelProps) {
  const { screen_pos: pos } = data;

  const style: React.CSSProperties = {
    position: "absolute",
    left: Math.min(window.innerWidth - 220, Math.max(10, pos.x - 100)),
    top: Math.min(window.innerHeight - 220, Math.max(10, pos.y - 180)),
    zIndex: 1000,
  };

  return (
    <div
      className={styles.upgradePanel}
      style={style}
      onClick={(e) => e.stopPropagation()}
    >
      <div className={styles.upgradeHeader}>
        <span className={styles.unitName}>
          {data.name} <small>Lv.{data.level}</small>
        </span>
        <button className={styles.closeBtn} onClick={onClose}>
          ×
        </button>
      </div>

      <div className={styles.statsGrid}>
        <div className={styles.upgStatItem}>
          <span className={styles.upgStatLabel}>攻擊力</span>
          <span className={styles.upgStatValue}>{data.atk.toFixed(0)}</span>
        </div>
        <div className={styles.upgStatItem}>
          <span className={styles.upgStatLabel}>攻速</span>
          <span className={styles.upgStatValue}>
            {data.atk_spd.toFixed(1)}/s
          </span>
        </div>
        <div className={styles.upgStatItem}>
          <span className={styles.upgStatLabel}>射程</span>
          <span className={styles.upgStatValue}>{data.range.toFixed(1)}格</span>
        </div>
        {data.unit_type === "hero" && (
          <div className={styles.upgStatItem}>
            <span className={styles.upgStatLabel}>生命值</span>
            <span className={styles.upgStatValue}>{data.hp?.toFixed(0)}</span>
          </div>
        )}
      </div>

      <div className={styles.upgradeActions}>
        {data.unit_type === "tower" && !data.max_level && (
          <button
            className={`${styles.actionBtn} ${styles.upgradeBtn} ${!data.can_afford ? styles.btnDisabled : ""}`}
            disabled={!data.can_afford}
            onClick={onUpgrade}
          >
            升級 (💰{data.upgrade_cost})
          </button>
        )}
        {data.max_level && (
          <div className={styles.maxLevelTag}>已達最高等級</div>
        )}
      </div>
    </div>
  );
}
