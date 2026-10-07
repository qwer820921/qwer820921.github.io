"use client";

import React, { useState } from "react";
import { Modal, Button, Row, Col, Card, Badge, Nav, Form, Alert } from "react-bootstrap";
import { StageData } from "../engine/builtinData";
import {
  getStageAccessStatus,
  getStageDataProblem,
  StageAccessStatus,
} from "../utils/stagePlayability";
import styles from "../styles/shenmaSanguoJs.module.css";

interface StageSelectorModalProps {
  show: boolean;
  stages: StageData[];
  currentStageId: string;
  maxStageId?: string;
  clearedStages?: Record<string, number>;
  onSelectStage: (stage: StageData) => void;
  onClose: () => void;
}

export const StageSelectorModal: React.FC<StageSelectorModalProps> = ({
  show,
  stages,
  currentStageId,
  maxStageId = "chapter1_1",
  clearedStages = {},
  onSelectStage,
  onClose,
}) => {
  // 自動將目前關卡所在章節設為預設標籤頁
  const currentChapter = stages.find((s) => s.map_id === currentStageId)?.chapter || 1;
  const [selectedChapter, setSelectedChapter] = useState<number>(currentChapter);

  // 自由挑戰模式（預設關閉，玩家需遵循戰略解鎖順序出征）
  const [allowFreePlay, setAllowFreePlay] = useState<boolean>(false);

  // 點擊未開放/未解鎖關卡之警示通知
  const [alertNotice, setAlertNotice] = useState<string | null>(null);

  // 取得現有章節清單
  const chapters = Array.from(new Set(stages.map((s) => s.chapter))).sort((a, b) => a - b);
  const filteredStages = stages.filter((s) => s.chapter === selectedChapter);

  // 全量已開放關卡數
  const openStagesCount = stages.filter((s) => !getStageDataProblem(s)).length;

  const handleStageCardClick = (stage: StageData, status: StageAccessStatus) => {
    if (status === "incomplete") {
      const problem = getStageDataProblem(stage);
      setAlertNotice(
        `「${stage.name}」尚未開放（${problem ? problem.reasons.join("、") : "關卡資料未完成"}），暫不能出征；請挑選已開放關卡。`
      );
      return;
    }

    if (status === "locked") {
      setAlertNotice(
        `「${stage.name}」尚未解鎖，請先通關上一關。亦可勾選右上角「自由演練」進行戰術試玩。`
      );
      return;
    }

    setAlertNotice(null);
    onSelectStage(stage);
    onClose();
  };

  return (
    <Modal show={show} onHide={onClose} centered size="lg" contentClassName={styles.darkModalContent}>
      <Modal.Header closeButton closeVariant="white" className={styles.modalHeader}>
        <div className="d-flex justify-content-between align-items-center w-100 me-2 flex-wrap gap-2">
          <Modal.Title className="text-warning fw-bold d-flex align-items-center gap-2 mb-0 fs-5">
            <span>🗺️</span>
            <span>
              戰略軍情地圖
              <small className="text-secondary ms-2 fs-6">
                (已開放 {openStagesCount} 關 / 全收錄 {stages.length} 關)
              </small>
            </span>
          </Modal.Title>
          <div className="d-flex align-items-center gap-2">
            <Form.Check
              type="switch"
              id="free-play-switch"
              label="全關卡自由演練"
              checked={allowFreePlay}
              onChange={(e) => {
                setAllowFreePlay(e.target.checked);
                if (e.target.checked) {
                  setAlertNotice("已啟用「自由演練模式」：可直接跳關試玩所有已開放地圖。");
                } else {
                  setAlertNotice(null);
                }
              }}
              className="text-light small fw-bold"
              style={{ cursor: "pointer" }}
            />
          </div>
        </div>
      </Modal.Header>

      <Modal.Body className={styles.modalBody}>
        {/* 操作警示說明 */}
        {alertNotice && (
          <Alert
            variant="warning"
            dismissible
            onClose={() => setAlertNotice(null)}
            className="py-2 px-3 small mb-3 border-warning text-dark fw-bold shadow-sm"
            style={{ backgroundColor: "rgba(245, 158, 11, 0.95)" }}
          >
            ⚠️ {alertNotice}
          </Alert>
        )}

        {/* 章節切換 Tabs */}
        {chapters.length > 1 && (
          <Nav variant="pills" className="mb-3 flex-nowrap overflow-auto gap-1 pb-1">
            {chapters.map((ch) => {
              const chapterStages = stages.filter((s) => s.chapter === ch);
              const chapterOpenCount = chapterStages.filter((s) => !getStageDataProblem(s)).length;
              const isSelected = selectedChapter === ch;

              return (
                <Nav.Item key={ch}>
                  <Nav.Link
                    active={isSelected}
                    onClick={() => {
                      setSelectedChapter(ch);
                      setAlertNotice(null);
                    }}
                    className="px-3 py-1 small fw-bold d-flex align-items-center gap-1"
                    style={{
                      backgroundColor: isSelected ? "#ffca28" : "rgba(255,255,255,0.08)",
                      color: isSelected ? "#000" : chapterOpenCount > 0 ? "#fff" : "rgba(255,255,255,0.4)",
                      cursor: "pointer",
                      border: isSelected ? "1px solid #ffca28" : "1px solid rgba(255,255,255,0.05)",
                    }}
                  >
                    <span>第 {ch} 章</span>
                    {chapterOpenCount > 0 ? (
                      <span
                        className="badge rounded-pill bg-success text-white"
                        style={{ fontSize: "0.65rem", padding: "2px 5px" }}
                      >
                        {chapterOpenCount}關
                      </span>
                    ) : (
                      <span
                        className="badge rounded-pill bg-secondary text-light"
                        style={{ fontSize: "0.65rem", padding: "2px 5px", opacity: 0.7 }}
                      >
                        未開放
                      </span>
                    )}
                  </Nav.Link>
                </Nav.Item>
              );
            })}
          </Nav>
        )}

        {/* 關卡清單 */}
        <div style={{ maxHeight: "480px", overflowY: "auto" }}>
          <Row className="g-3">
            {filteredStages.map((stage) => {
              const status = getStageAccessStatus({
                stage,
                currentStageId,
                maxStageId,
                clearedStages,
                allowFreePlay,
              });

              const isCurrent = status === "current";
              const isIncomplete = status === "incomplete";
              const isLocked = status === "locked";
              const isFreePlay = status === "freeplay";
              const isCleared = status === "cleared";
              const isPlayable = status === "playable";

              const problem = isIncomplete ? getStageDataProblem(stage) : null;
              const pathsCount = stage.path_json?.paths
                ? Object.keys(stage.path_json.paths).length
                : Array.isArray(stage.path_json?.waypoints) && stage.path_json.waypoints.length > 0
                ? 1
                : 0;
              const wavesCount = stage.waves?.length || 0;
              const stars = clearedStages[stage.map_id] || 0;

              // 卡片外觀樣式
              let cardClass = `${styles.stageCard}`;
              if (isCurrent) cardClass += ` ${styles.stageCardActive}`;
              else if (isIncomplete) cardClass += ` ${styles.stageCardUnavailable}`;
              else if (isLocked) cardClass += ` ${styles.stageCardLocked}`;

              return (
                <Col xs={12} md={6} key={stage.map_id}>
                  <Card
                    className={`h-100 ${cardClass}`}
                    onClick={() => handleStageCardClick(stage, status)}
                    style={{
                      cursor: isIncomplete || isLocked ? "not-allowed" : "pointer",
                      transition: "all 0.2s ease",
                      border: isCurrent
                        ? "2px solid #10b981"
                        : isIncomplete
                        ? "1px solid rgba(239, 68, 68, 0.3)"
                        : isLocked
                        ? "1px solid rgba(255, 255, 255, 0.08)"
                        : "1px solid rgba(255, 255, 255, 0.18)",
                      background: isCurrent
                        ? "rgba(16, 185, 129, 0.12)"
                        : isIncomplete
                        ? "rgba(30, 20, 25, 0.6)"
                        : isLocked
                        ? "rgba(15, 23, 42, 0.5)"
                        : "rgba(15, 23, 42, 0.85)",
                    }}
                  >
                    <Card.Body>
                      <div className="d-flex justify-content-between align-items-start mb-2">
                        <div>
                          <h6
                            className="fw-bold mb-0"
                            style={{
                              color: isIncomplete
                                ? "rgba(255, 255, 255, 0.5)"
                                : isLocked
                                ? "rgba(255, 255, 255, 0.7)"
                                : "#fff",
                            }}
                          >
                            {stage.name}
                          </h6>
                          {stars > 0 && !isIncomplete && (
                            <div className="text-warning small mt-1">
                              {"⭐".repeat(stars)}
                              <span className="text-secondary ms-1">({stars}星通關)</span>
                            </div>
                          )}
                        </div>

                        {/* 狀態徽章 */}
                        {isIncomplete ? (
                          <Badge bg="danger" className="text-white">
                            🔒 尚未開放
                          </Badge>
                        ) : isCurrent ? (
                          <Badge bg="success">
                            ⚔️ 當前作戰
                          </Badge>
                        ) : isCleared ? (
                          <Badge bg="warning" className="text-dark">
                            ⭐ 已通關
                          </Badge>
                        ) : isPlayable ? (
                          <Badge bg="primary">
                            🔥 可挑戰
                          </Badge>
                        ) : isFreePlay ? (
                          <Badge bg="info">
                            🛡️ 自由演練
                          </Badge>
                        ) : (
                          <Badge bg="secondary">
                            🔒 尚未解鎖
                          </Badge>
                        )}
                      </div>

                      {/* 關卡資訊與未開放/未解鎖原因 */}
                      <div className="small text-secondary mb-3">
                        <div>
                          關卡代碼: <code>{stage.map_id}</code>
                        </div>
                        <div>
                          防守波次:{" "}
                          <span className={wavesCount > 0 ? "text-warning fw-bold" : "text-muted"}>
                            {wavesCount} 波
                          </span>
                        </div>
                        <div>進軍路線: {pathsCount} 條路線</div>

                        {isIncomplete && problem && (
                          <div className="text-danger small mt-2 fw-bold">
                            ⚠️ 關卡資料未完成：{problem.reasons.join("、")}
                          </div>
                        )}

                        {isLocked && (
                          <div className="text-secondary small mt-2">
                            🔒 需先通關前置關卡方可解鎖出征
                          </div>
                        )}
                      </div>

                      {/* 動作按鈕 */}
                      {isIncomplete ? (
                        <Button
                          variant="outline-danger"
                          size="sm"
                          className="w-100 fw-bold"
                          disabled
                        >
                          尚未開放
                        </Button>
                      ) : isCurrent ? (
                        <Button
                          variant="success"
                          size="sm"
                          className="w-100 fw-bold"
                          disabled
                        >
                          正在進行中
                        </Button>
                      ) : isCleared ? (
                        <Button
                          variant="outline-warning"
                          size="sm"
                          className="w-100 fw-bold"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStageCardClick(stage, status);
                          }}
                        >
                          重玩關卡 (點擊切換)
                        </Button>
                      ) : isPlayable ? (
                        <Button
                          variant="warning"
                          size="sm"
                          className="w-100 fw-bold text-dark"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStageCardClick(stage, status);
                          }}
                        >
                          開赴戰場 (點擊切換)
                        </Button>
                      ) : isFreePlay ? (
                        <Button
                          variant="outline-info"
                          size="sm"
                          className="w-100 fw-bold"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStageCardClick(stage, status);
                          }}
                        >
                          演練試玩 (自由模式)
                        </Button>
                      ) : (
                        <Button
                          variant="outline-secondary"
                          size="sm"
                          className="w-100 fw-bold"
                          disabled
                        >
                          尚未解鎖
                        </Button>
                      )}
                    </Card.Body>
                  </Card>
                </Col>
              );
            })}
          </Row>
        </div>
      </Modal.Body>

      <Modal.Footer className={styles.modalFooter}>
        <Button variant="outline-secondary" onClick={onClose}>
          關閉軍情地圖
        </Button>
      </Modal.Footer>
    </Modal>
  );
};
