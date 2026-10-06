"use client";

import React from "react";
import { Row, Col, Badge, Button, ProgressBar } from "react-bootstrap";
import { StatsSyncData, GameState } from "../engine/BattleManager";
import styles from "../styles/shenmaSanguoJs.module.css";

interface BattleHudProps {
  stats: StatsSyncData;
  stageName: string;
  onStartBattle: () => void;
  onToggleAuto: () => void;
  onSetSpeed: (speed: number) => void;
  onTogglePause: () => void;
  onToggleBgm: () => void;
  onToggleSfx: () => void;
  isBgmMuted: boolean;
  isSfxMuted: boolean;
  onOpenStageSelector: () => void;
}

export const BattleHud: React.FC<BattleHudProps> = ({
  stats,
  stageName,
  onStartBattle,
  onToggleAuto,
  onSetSpeed,
  onTogglePause,
  onToggleBgm,
  onToggleSfx,
  isBgmMuted,
  isSfxMuted,
  onOpenStageSelector,
}) => {
  const hpPercent = Math.max(0, Math.min(100, (stats.hp / stats.max_hp) * 100));
  const hpVariant = hpPercent > 50 ? "success" : hpPercent > 20 ? "warning" : "danger";
  const isPrep = stats.game_state === GameState.PREP;
  const isBattle = stats.game_state === GameState.BATTLE;

  return (
    <div className={styles.hudWrapper}>
      <Row className="align-items-center g-2">
        {/* 左側：關卡資訊與主基地血量 */}
        <Col xs={12} lg={4}>
          <div className="d-flex align-items-center gap-2 mb-1">
            <Button
              variant="outline-warning"
              size="sm"
              className={styles.stageSelectBtn}
              onClick={onOpenStageSelector}
            >
              🗺️ {stageName || "選擇關卡"}
            </Button>
            {isPrep && <Badge bg="info">佈防階段</Badge>}
            {isBattle && <Badge bg="danger" className="animate-pulse">交戰中</Badge>}
            {stats.auto_next_wave_pending && <Badge bg="warning">下波即將來襲</Badge>}
          </div>

          <div className="d-flex align-items-center gap-2">
            <span className={styles.hudIcon}>🏰</span>
            <div className="flex-grow-1">
              <div className="d-flex justify-content-between text-light small fw-bold mb-1">
                <span>大本營耐久</span>
                <span className={hpPercent <= 25 ? "text-danger" : "text-light"}>
                  {stats.hp} / {stats.max_hp}
                </span>
              </div>
              <ProgressBar
                now={hpPercent}
                variant={hpVariant}
                className={styles.hpProgressBar}
              />
            </div>
          </div>
        </Col>

        {/* 中間：金幣與波次進度 */}
        <Col xs={12} sm={6} lg={4}>
          <Row className="g-2 text-center">
            <Col xs={6}>
              <div className={styles.statBox}>
                <div className="text-secondary small">軍資金幣</div>
                <div className={styles.goldCounter}>
                  <span className={styles.coinIcon}>💰</span>
                  <span>{stats.gold.toLocaleString()}</span>
                </div>
              </div>
            </Col>
            <Col xs={6}>
              <div className={styles.statBox}>
                <div className="text-secondary small">敵軍波次</div>
                <div className={styles.waveCounter}>
                  <span className="text-warning fw-bold">{stats.wave}</span>
                  <span className="text-muted small"> / {stats.total_waves}</span>
                </div>
              </div>
            </Col>
          </Row>
        </Col>

        {/* 右側：作戰速度、自動出波、開始戰鬥與聲音控制 */}
        <Col xs={12} sm={6} lg={4}>
          <div className="d-flex justify-content-lg-end justify-content-start align-items-center flex-wrap gap-2">
            {/* 倍速切換 */}
            <div className="btn-group btn-group-sm" role="group">
              <Button
                variant={stats.speed === 1 ? "primary" : "secondary"}
                onClick={() => onSetSpeed(1)}
              >
                1x
              </Button>
              <Button
                variant={stats.speed === 2 ? "primary" : "secondary"}
                onClick={() => onSetSpeed(2)}
              >
                2x
              </Button>
            </div>

            {/* 暫停 / 繼續 */}
            <Button
              variant={stats.paused ? "warning" : "outline-secondary"}
              size="sm"
              onClick={onTogglePause}
            >
              {stats.paused ? "▶ 繼續" : "⏸ 暫停"}
            </Button>

            {/* 自動出波 */}
            <Button
              variant={stats.auto_mode ? "success" : "outline-secondary"}
              size="sm"
              onClick={onToggleAuto}
            >
              {stats.auto_mode ? "⚡ 自動出波" : "手動出波"}
            </Button>

            {/* 音樂 / 音效 */}
            <Button
              variant={isBgmMuted ? "outline-secondary" : "outline-light"}
              size="sm"
              onClick={onToggleBgm}
              title={isBgmMuted ? "取消音樂靜音" : "音樂靜音"}
            >
              {isBgmMuted ? "🔇" : "🎵"}
            </Button>
            <Button
              variant={isSfxMuted ? "outline-secondary" : "outline-light"}
              size="sm"
              onClick={onToggleSfx}
              title={isSfxMuted ? "取消音效靜音" : "音效靜音"}
            >
              {isSfxMuted ? "🔕" : "🔊"}
            </Button>

            {/* 出擊按鈕 (準備階段時高亮提示) */}
            {isPrep && (
              <Button
                variant="danger"
                size="sm"
                className={`fw-bold ${styles.pulseBtn}`}
                onClick={onStartBattle}
              >
                ⚔️ 開始戰鬥
              </Button>
            )}
          </div>
        </Col>
      </Row>
    </div>
  );
};
