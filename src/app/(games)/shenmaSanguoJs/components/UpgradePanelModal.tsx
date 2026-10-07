"use client";

import React from "react";
import { TowerEntity, TOWER_CONFIGS } from "../engine/entities/TowerEntity";
import styles from "../styles/shenmaSanguoJs.module.css";

interface UpgradePanelModalProps {
  show: boolean;
  tower: TowerEntity | null;
  currentGold: number;
  isPrepPhase: boolean;
  onUpgrade: (col: number, row: number) => void;
  onSell: (col: number, row: number) => void;
  onTargetModeChange: (col: number, row: number, mode: string) => void;
  onClose: () => void;
}

export const UpgradePanelModal: React.FC<UpgradePanelModalProps> = ({
  show,
  tower,
  currentGold,
  isPrepPhase,
  onUpgrade,
  onSell,
  onTargetModeChange,
  onClose,
}) => {
  if (!show || !tower) return null;

  const { gridCell, towerName, towerLevel, atk, atkSpd, rangeTiles, targetMode, towerTypeKey } = tower;
  const antiAir = TOWER_CONFIGS[towerTypeKey]?.antiAir ?? false;
  const upgradeCost = tower.getUpgradeCost();
  const canAfford = currentGold >= upgradeCost;
  const sellRefund = tower.getSellRefund(isPrepPhase);

  const targetModes = [
    { key: "first", label: "第一" },
    { key: "weakest", label: "殘血" },
    { key: "strongest", label: "威脅" },
    ...(antiAir ? [{ key: "air_first", label: "對空" }] : []),
  ];

  return (
    <div className={styles.placementOverlay} onClick={onClose}>
      <div
        className={styles.upgradePanel}
        data-testid="upgrade-panel"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 標題與關閉按鈕 */}
        <div className={styles.upgradeHeader}>
          <div className={styles.unitName}>
            {towerName}
            <small>Lv.{towerLevel}</small>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>
            ×
          </button>
        </div>

        {/* 數值面板 */}
        <div className={styles.statsGrid}>
          <div className={styles.upgStatItem}>
            <span className={styles.upgStatLabel}>攻擊力</span>
            <span className={styles.upgStatValue}>{Math.round(atk)}</span>
          </div>
          <div className={styles.upgStatItem}>
            <span className={styles.upgStatLabel}>攻擊間隔</span>
            <span className={styles.upgStatValue}>{atkSpd}s</span>
          </div>
          <div className={styles.upgStatItem}>
            <span className={styles.upgStatLabel}>射程半徑</span>
            <span className={styles.upgStatValue}>{rangeTiles} 格</span>
          </div>
          <div className={styles.upgStatItem}>
            <span className={styles.upgStatLabel}>累計軍資</span>
            <span className={styles.upgStatValue}>💰 {tower.investedGold}</span>
          </div>
        </div>

        {/* 索敵模式選擇 */}
        <div className={styles.targetModeBox}>
          <div className={styles.upgStatLabel}>目標優先</div>
          <div
            className={styles.targetModeRow}
            style={{
              gridTemplateColumns: `repeat(${targetModes.length}, 1fr)`,
            }}
          >
            {targetModes.map((m) => (
              <button
                key={m.key}
                type="button"
                className={`${styles.targetModeBtn} ${targetMode === m.key ? styles.targetModeBtnActive : ""}`}
                onClick={() => onTargetModeChange(gridCell.col, gridCell.row, m.key)}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* 升級與拆除動作 */}
        <div className={styles.upgradeActions}>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.upgradeBtn}`}
            disabled={!canAfford}
            onClick={() => {
              onUpgrade(gridCell.col, gridCell.row);
            }}
          >
            升級 💰{upgradeCost}
          </button>
          <button
            type="button"
            className={`${styles.actionBtn} ${styles.sellBtn}`}
            onClick={() => {
              onSell(gridCell.col, gridCell.row);
              onClose();
            }}
          >
            拆除 +{sellRefund}
          </button>
        </div>
      </div>
    </div>
  );
};
