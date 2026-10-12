"use client";

import React, { useState } from "react";
import { TowerEntity, TOWER_CONFIGS } from "../engine/entities/TowerEntity";
import { TowerSellRequest, TowerSellResult } from "../engine/BattleEngine";
import styles from "../styles/shenmaSanguoJs.module.css";

interface UpgradePanelModalProps {
  show: boolean;
  tower: TowerEntity | null;
  currentGold: number;
  isPrepPhase: boolean;
  /** 手動暫停中（暫停時不能拆除） */
  isPaused: boolean;
  /** 打開面板時這座塔所屬的那一場；拆除請求帶回這一場 */
  battleId: string | null;
  onUpgrade: (col: number, row: number) => void;
  /** 拆除：用這次畫面顯示的數值組成請求，引擎重新檢查後才拆 */
  onSell: (request: TowerSellRequest) => TowerSellResult;
  onTargetModeChange: (col: number, row: number, mode: string) => void;
  onClose: () => void;
}

/** 拆除沒有成功時給玩家看的簡短說明 */
function sellRejectText(result: TowerSellResult): string {
  if (result.ok) return "";
  switch (result.reason) {
    case "refund_changed":
      return `返還金額已更新為 +${result.refund ?? 0}，請再按一次拆除。`;
    case "not_prep":
      return "只有備戰中可以拆除。";
    case "paused":
      return "暫停中不能拆除。";
    case "stale_battle":
      return "這座塔不在目前這一場，請重新點選。";
    case "not_selected":
      return "請先點選這座塔再拆除。";
    case "already_sold":
      return "這座塔已經拆除。";
    default:
      return "無法拆除，請重新點選這座塔。";
  }
}

export const UpgradePanelModal: React.FC<UpgradePanelModalProps> = ({
  show,
  tower,
  currentGold,
  isPrepPhase,
  isPaused,
  battleId,
  onUpgrade,
  onSell,
  onTargetModeChange,
  onClose,
}) => {
  // 拆除沒有成功時的說明（只顯示在同一座塔）
  const [sellNote, setSellNote] = useState<{
    uid: string;
    text: string;
  } | null>(null);
  if (!show || !tower) return null;

  const {
    gridCell,
    towerName,
    towerLevel,
    atk,
    atkSpd,
    rangeTiles,
    targetMode,
    towerTypeKey,
  } = tower;
  const antiAir = TOWER_CONFIGS[towerTypeKey]?.antiAir ?? false;
  const upgradeCost = tower.getUpgradeCost();
  const canAfford = currentGold >= upgradeCost;
  // 拆除返還投入的一半；只有備戰中、沒有暫停時可以拆
  const sellRefund = tower.getSellRefund();
  const canSell = isPrepPhase && !isPaused && battleId !== null;
  const note =
    sellNote && sellNote.uid === tower.towerUid ? sellNote.text : null;
  const handleSell = () => {
    if (!battleId) return;
    const result = onSell({
      battleId,
      towerUid: tower.towerUid,
      col: gridCell.col,
      row: gridCell.row,
      expectedRefund: sellRefund,
    });
    if (result.ok) {
      setSellNote(null);
      onClose();
      return;
    }
    setSellNote({ uid: tower.towerUid, text: sellRejectText(result) });
  };

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
                onClick={() =>
                  onTargetModeChange(gridCell.col, gridCell.row, m.key)
                }
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
            disabled={!canSell}
            onClick={handleSell}
            data-testid="tower-sell"
          >
            拆除 +{sellRefund}
          </button>
        </div>
        {!canSell && (
          <div
            className="small text-secondary mt-2"
            data-testid="tower-sell-hint"
          >
            只有備戰中、沒有暫停時可以拆除（返還投入的一半）。
          </div>
        )}
        {note && (
          <div
            className="small text-warning mt-2"
            data-testid="tower-sell-note"
          >
            {note}
          </div>
        )}
      </div>
    </div>
  );
};
