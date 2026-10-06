"use client";

import React, { useState } from "react";
import { Modal, Button, Row, Col, Card, Badge, Nav } from "react-bootstrap";
import { StageData } from "../engine/builtinData";
import styles from "../styles/shenmaSanguoJs.module.css";

interface StageSelectorModalProps {
  show: boolean;
  stages: StageData[];
  currentStageId: string;
  onSelectStage: (stage: StageData) => void;
  onClose: () => void;
}

export const StageSelectorModal: React.FC<StageSelectorModalProps> = ({
  show,
  stages,
  currentStageId,
  onSelectStage,
  onClose,
}) => {
  const [selectedChapter, setSelectedChapter] = useState<number>(1);

  // 取得現有章節清單
  const chapters = Array.from(new Set(stages.map((s) => s.chapter))).sort((a, b) => a - b);
  const filteredStages = stages.filter((s) => s.chapter === selectedChapter);

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton className={styles.modalHeader}>
        <Modal.Title className="text-light fw-bold">
          🗺️ 戰略軍情地圖（共 {stages.length} 關卡）
        </Modal.Title>
      </Modal.Header>

      <Modal.Body className={styles.modalBody}>
        {/* 章節切換 Tabs */}
        {chapters.length > 1 && (
          <Nav variant="pills" className="mb-3 flex-nowrap overflow-auto gap-1 pb-1">
            {chapters.map((ch) => (
              <Nav.Item key={ch}>
                <Nav.Link
                  active={selectedChapter === ch}
                  onClick={() => setSelectedChapter(ch)}
                  className="px-3 py-1 small fw-bold"
                >
                  第 {ch} 章
                </Nav.Link>
              </Nav.Item>
            ))}
          </Nav>
        )}

        {/* 關卡清單 */}
        <div style={{ maxHeight: "480px", overflowY: "auto" }}>
          <Row className="g-3">
            {filteredStages.map((stage) => {
              const isCurrent = stage.map_id === currentStageId;
              const pathsCount = stage.path_json?.paths ? Object.keys(stage.path_json.paths).length : 1;
              return (
                <Col xs={12} md={6} key={stage.map_id}>
                  <Card
                    className={`h-100 ${styles.stageCard} ${isCurrent ? styles.stageCardActive : ""}`}
                    onClick={() => {
                      onSelectStage(stage);
                      onClose();
                    }}
                  >
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <h6 className="text-light fw-bold mb-0">{stage.name}</h6>
                        <Badge bg={isCurrent ? "success" : "secondary"}>
                          {isCurrent ? "當前作戰" : "可挑戰"}
                        </Badge>
                      </div>

                      <div className="small text-secondary mb-3">
                        <div>關卡代碼: <code>{stage.map_id}</code></div>
                        <div>防守波次: <span className="text-warning fw-bold">{stage.waves?.length || 0} 波</span></div>
                        <div>進軍路線: {pathsCount} 條路線</div>
                      </div>

                      <Button
                        variant={isCurrent ? "outline-success" : "outline-warning"}
                        size="sm"
                        className="w-100 fw-bold"
                      >
                        {isCurrent ? "正在進行中" : "開赴戰場"}
                      </Button>
                    </Card.Body>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </div>
      </Modal.Body>

      <Modal.Footer className={styles.modalFooter}>
        <Button variant="outline-secondary" size="sm" onClick={onClose}>
          返回戰場
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
