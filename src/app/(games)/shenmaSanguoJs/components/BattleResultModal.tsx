"use client";

import React from "react";
import { Modal, Button, Row, Col, Badge } from "react-bootstrap";
import { BattleResultData } from "../engine/BattleManager";
import styles from "../styles/shenmaSanguoJs.module.css";

interface BattleResultModalProps {
  show: boolean;
  result: BattleResultData | null;
  onRetry: () => void;
  onNextStage: () => void;
  onOpenStageSelector: () => void;
}

export const BattleResultModal: React.FC<BattleResultModalProps> = ({
  show,
  result,
  onRetry,
  onNextStage,
  onOpenStageSelector,
}) => {
  if (!result) return null;

  const isWin = result.result === "WIN";
  const stars = result.stars_earned || 0;
  const points = result.loots.find((l) => l.item === "battle_points")?.count || 0;

  return (
    <Modal show={show} backdrop="static" keyboard={false} centered>
      <Modal.Header className={isWin ? styles.modalHeaderWin : styles.modalHeaderLose}>
        <Modal.Title className="text-light fw-bold mx-auto">
          {isWin ? "🏆 大 獲 全 勝 🏆" : "💀 城 池 失 守 💀"}
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className={styles.modalBody}>
        {/* 星級評價 */}
        {isWin ? (
          <div className="text-center my-3">
            <div className="display-4 mb-2">
              {"⭐".repeat(stars)}
              {"☆".repeat(Math.max(0, 3 - stars))}
            </div>
            <div className="text-warning fw-bold fs-5">
              {stars === 3 ? "完美三星防守！" : stars === 2 ? "精彩過關！" : "險勝！"}
            </div>
          </div>
        ) : (
          <div className="text-center my-3">
            <div className="fs-1 mb-2">🛡️💥</div>
            <div className="text-danger fw-bold fs-5">主基地耐久耗盡，防線被敵軍擊破！</div>
            <div className="text-muted small mt-2">
              軍師建言：嘗試在拐角設置【步兵塔】緩速敵軍，並在後方佈置【砲兵塔】進行範圍轟炸！
            </div>
          </div>
        )}

        {/* 戰績數據盒 */}
        <div className={styles.statsCard}>
          <Row className="g-2 text-center">
            <Col xs={4}>
              <div className="text-secondary small">擊殺敵兵</div>
              <div className="fw-bold text-light fs-5">{result.kills} 隻</div>
            </Col>
            <Col xs={4}>
              <div className="text-secondary small">作戰時間</div>
              <div className="fw-bold text-light fs-5">{result.time_seconds} 秒</div>
            </Col>
            <Col xs={4}>
              <div className="text-secondary small">戰功積分</div>
              <div className="fw-bold text-warning fs-5">+{points}</div>
            </Col>
          </Row>
        </div>

        {/* 獎勵展示 */}
        {isWin && (
          <div className="mt-3 p-3 rounded bg-dark border border-warning text-center">
            <Badge bg="warning" className="text-dark me-2">獲取獎勵</Badge>
            <span className="text-light fw-bold">戰功物資 × {points}</span>
          </div>
        )}
      </Modal.Body>

      <Modal.Footer className="justify-content-center gap-2">
        <Button variant="outline-light" onClick={onRetry}>
          🔄 重新挑戰
        </Button>
        <Button variant="outline-warning" onClick={onOpenStageSelector}>
          🗺️ 關卡選擇
        </Button>
        {isWin && (
          <Button variant="success" className="fw-bold px-4" onClick={onNextStage}>
            下一關 ➔
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};
