"use client";

import React from "react";
import { Row, Col, Badge, ProgressBar, Button } from "react-bootstrap";
import { PlayerState, SyncStatusType } from "../types/player";
import styles from "../styles/shenmaSanguoJs.module.css";

interface PlayerBarProps {
  player: PlayerState | null;
  syncStatus: SyncStatusType;
  onOpenPlayerInfo: () => void;
  onOpenTeamEdit: () => void;
  onOpenHeroRoster: () => void;
  onOpenSettings: () => void;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  player,
  syncStatus,
  onOpenPlayerInfo,
  onOpenTeamEdit,
  onOpenHeroRoster,
  onOpenSettings,
}) => {
  if (!player) return null;

  const expNeeded = player.level * 250;
  const expPercent = Math.min(100, Math.round((player.exp / expNeeded) * 100));

  const getSyncBadge = () => {
    switch (syncStatus) {
      case "syncing":
        return <span className={`${styles.syncIndicator} ${styles.syncSyncing}`}>🔵 雲端同步中...</span>;
      case "pending":
        return <span className={`${styles.syncIndicator} ${styles.syncPending}`}>🟡 待同步 (30s)</span>;
      case "offline":
        return <span className={`${styles.syncIndicator} ${styles.syncOffline}`}>⚪ 本機離線模式</span>;
      case "error":
        return <span className={`${styles.syncIndicator} ${styles.syncPending}`}>⚠️ 同步異常</span>;
      case "idle":
      default:
        return <span className={`${styles.syncIndicator} ${styles.syncIdle}`}>🟢 存檔已同步</span>;
    }
  };

  return (
    <div className={styles.playerBar}>
      <Row className="align-items-center g-2">
        {/* 左側：主公頭像、暱稱、等級與經驗值 */}
        <Col xs={12} md={5} lg={4}>
          <div className="d-flex align-items-center gap-2">
            <button
              type="button"
              className={styles.playerAvatarBtn}
              onClick={onOpenPlayerInfo}
              title="查看主公資訊與更換金鑰"
            >
              <span>👤</span>
              <strong className="text-light">{player.nickname}</strong>
            </button>

            <Badge bg="warning" text="dark" className="fw-bold">
              Lv.{player.level}
            </Badge>

            <div className="flex-grow-1" style={{ maxWidth: 140 }}>
              <div className="d-flex justify-content-between small text-secondary" style={{ fontSize: "0.68rem" }}>
                <span>EXP</span>
                <span>
                  {player.exp}/{expNeeded}
                </span>
              </div>
              <ProgressBar
                now={expPercent}
                variant="info"
                style={{ height: 6, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.5)" }}
              />
            </div>
          </div>
        </Col>

        {/* 中間：世界金幣 (用於武將升級) 與雲端同步狀態 */}
        <Col xs={12} md={3} lg={3}>
          <div className="d-flex align-items-center gap-2">
            <div className={styles.playerGoldBadge} title="主公世界金幣：可用於永久升級名將屬性">
              <span>🪙</span>
              <span>{player.gold.toLocaleString()}</span>
            </div>
            {getSyncBadge()}
          </div>
        </Col>

        {/* 右側：功能按鈕（隊伍編排、名將名錄、系統設定） */}
        <Col xs={12} md={4} lg={5}>
          <div className="d-flex justify-content-md-end justify-content-start align-items-center gap-2">
            <Button
              variant="outline-warning"
              size="sm"
              onClick={onOpenTeamEdit}
              className="d-flex align-items-center gap-1"
            >
              <span>⚔️</span>
              <span>出征隊伍 ({player.team?.length || 0}/5)</span>
            </Button>

            <Button
              variant="outline-info"
              size="sm"
              onClick={onOpenHeroRoster}
              className="d-flex align-items-center gap-1"
            >
              <span>📜</span>
              <span>名將名錄</span>
            </Button>

            <Button
              variant="outline-secondary"
              size="sm"
              onClick={onOpenSettings}
              className="d-flex align-items-center gap-1 text-light"
              title="系統設定與存檔備份"
            >
              <span>⚙️</span>
              <span>設定</span>
            </Button>
          </div>
        </Col>
      </Row>
    </div>
  );
};
