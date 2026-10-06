"use client";

import React from "react";
import { Modal, Button, Row, Col, Badge, Form } from "react-bootstrap";
import { TowerEntity } from "../engine/entities/TowerEntity";
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
  if (!tower) return null;

  const { gridCell, towerName, towerLevel, atk, atkSpd, rangeTiles, targetMode } = tower;
  const upgradeCost = tower.getUpgradeCost();
  const canAfford = currentGold >= upgradeCost;
  const sellRefund = tower.getSellRefund(isPrepPhase);

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton className={styles.modalHeader}>
        <Modal.Title className="text-light fw-bold">
          🏰 防禦塔強化設施 ({gridCell.col}, {gridCell.row})
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className={styles.modalBody}>
        {/* 頂部名稱與當前等級 */}
        <div className="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h4 className="text-warning fw-bold mb-1">{towerName}</h4>
            <span className="text-secondary small">
              累計投資: <strong className="text-light">{tower.investedGold}</strong> 金幣
            </span>
          </div>
          <Badge bg="warning" className="text-dark fs-6 px-3 py-2">
            Lv. {towerLevel}
          </Badge>
        </div>

        {/* 數值面板與下一級預覽 */}
        <div className={styles.statsCard}>
          <Row className="g-2 text-center">
            <Col xs={4}>
              <div className="text-secondary small">攻擊力</div>
              <div className="fw-bold text-light fs-5">{Math.round(atk)}</div>
              <div className="text-success small">➔ {Math.round(atk * 1.3)}</div>
            </Col>
            <Col xs={4}>
              <div className="text-secondary small">攻擊週期</div>
              <div className="fw-bold text-light fs-5">{atkSpd}s</div>
              <div className="text-secondary small">維持</div>
            </Col>
            <Col xs={4}>
              <div className="text-secondary small">射程半徑</div>
              <div className="fw-bold text-light fs-5">{rangeTiles} 格</div>
              <div className="text-secondary small">維持</div>
            </Col>
          </Row>
        </div>

        {/* 索敵模式選擇 */}
        <div className="mt-3">
          <Form.Label className="text-light small fw-bold mb-2">🎯 索敵優先級目標：</Form.Label>
          <Form.Select
            size="sm"
            className={styles.selectDark}
            value={targetMode}
            onChange={(e) => onTargetModeChange(gridCell.col, gridCell.row, e.target.value)}
          >
            <option value="first">首要敵人 (進度最前)</option>
            <option value="weakest">殘血敵軍 (生命最低)</option>
            <option value="strongest">威脅巨首 (生命最高)</option>
            <option value="air_first">制空獵鳥 (空中單位優先)</option>
          </Form.Select>
        </div>

        {/* 升級與拆除按鈕 */}
        <Row className="g-2 mt-3">
          <Col xs={8}>
            <Button
              variant={canAfford ? "warning" : "secondary"}
              className="w-100 fw-bold py-2"
              disabled={!canAfford}
              onClick={() => onUpgrade(gridCell.col, gridCell.row)}
            >
              ⭐ 升級為 Lv.{towerLevel + 1} (💰 {upgradeCost})
            </Button>
          </Col>
          <Col xs={4}>
            <Button
              variant="outline-danger"
              className="w-100 fw-bold py-2"
              onClick={() => onSell(gridCell.col, gridCell.row)}
              title={isPrepPhase ? "佈防階段 100% 全額返還" : "交戰中折損 50% 返還"}
            >
              ♻️ 拆除 (+{sellRefund})
            </Button>
          </Col>
        </Row>
      </Modal.Body>

      <Modal.Footer className={styles.modalFooter}>
        <Button variant="outline-secondary" size="sm" onClick={onClose}>
          關閉
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
