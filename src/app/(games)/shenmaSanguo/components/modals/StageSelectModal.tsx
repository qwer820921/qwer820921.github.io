"use client";

import React, { useState } from "react";
import { Row, Col } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { isStageUnlocked } from "../../utils/stageUtils";
import { stageAirReadiness } from "../../utils/stageAirReadiness";
import EnemyPreviewModal from "./EnemyPreviewModal";
import StageAirReadinessNote from "../StageAirReadinessNote";
import styles from "../../styles/shenmaSanguo.module.css";

interface Props {
  onSelect: (mapId: string) => void;
  onClose: () => void;
}

export default function StageSelectModal({ onSelect, onClose }: Props) {
  const { player } = usePlayerStore();
  const { config: staticConfig } = useStaticConfigStore();
  // 正在查看敵軍預覽的關卡（唯讀，不切換關卡）
  const [previewId, setPreviewId] = useState<string | null>(null);

  if (!player || !staticConfig) return null;
  const previewMap =
    staticConfig.maps.find((m) => m.map_id === previewId) ?? null;

  const mapsByChapter: Record<
    number,
    NonNullable<typeof staticConfig>["maps"]
  > = {};
  (staticConfig.maps ?? []).forEach((m) => {
    if (!mapsByChapter[m.chapter]) mapsByChapter[m.chapter] = [];
    mapsByChapter[m.chapter].push(m);
  });

  return (
    <>
      <div className={styles.modalBackdrop} onClick={onClose}>
        <div className={styles.modalPanel} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <span className={styles.modalTitle}>關卡選擇</span>
            <span style={{ fontSize: "0.72rem", color: "var(--sg-muted)" }}>
              進度：
              <span style={{ color: "var(--sg-gold)" }}>
                {staticConfig.maps.find((m) => m.map_id === player.max_stage)
                  ?.name || player.max_stage}
              </span>
            </span>
            <button className={styles.modalClose} onClick={onClose}>
              ×
            </button>
          </div>
          <div className={styles.modalBody}>
            {Object.entries(mapsByChapter)
              .sort(([a], [b]) => Number(a) - Number(b))
              .map(([chapter, maps]) => (
                <div key={chapter} style={{ marginBottom: "1.5rem" }}>
                  <div className={styles.chapterHeader}>
                    <div className={styles.chapterLine} />
                    <div className={styles.chapterName}>第 {chapter} 章</div>
                    <div className={styles.chapterLine} />
                  </div>
                  <Row className="g-3">
                    {maps.map((map) => {
                      const unlocked = isStageUnlocked(
                        map.map_id,
                        player.max_stage
                      );
                      const isCurrent = map.map_id === player.max_stage;
                      // 出征前的對空準備：只看目前上陣的隊伍（隊伍或設定改變時重新計算）
                      const air = stageAirReadiness(
                        map,
                        staticConfig.enemiesConfig,
                        player.team,
                        staticConfig.heroesConfig
                      );
                      return (
                        <Col xs={12} sm={6} key={map.map_id}>
                          <div
                            className={`${styles.stageCard} ${
                              !unlocked
                                ? styles.stageCardLocked
                                : isCurrent
                                  ? `${styles.stageCardUnlocked} ${styles.stageCardCurrent}`
                                  : styles.stageCardUnlocked
                            }`}
                            onClick={() => unlocked && onSelect(map.map_id)}
                          >
                            <div style={{ padding: "0.9rem 1rem" }}>
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "flex-start",
                                  marginBottom: "0.55rem",
                                }}
                              >
                                <div>
                                  <div
                                    style={{
                                      fontWeight: 700,
                                      color: "var(--sg-text)",
                                      fontSize: "0.9rem",
                                    }}
                                  >
                                    {map.name}
                                  </div>
                                </div>
                                {!unlocked ? (
                                  <span
                                    style={{
                                      fontSize: "0.62rem",
                                      color: "var(--sg-muted)",
                                      background: "var(--sg-surface2)",
                                      borderRadius: 4,
                                      padding: "2px 7px",
                                      border: "1px solid var(--sg-border)",
                                    }}
                                  >
                                    鎖定
                                  </span>
                                ) : isCurrent ? (
                                  <span
                                    style={{
                                      fontSize: "0.62rem",
                                      color: "var(--sg-gold)",
                                      background: "rgba(232,196,106,0.12)",
                                      borderRadius: 4,
                                      padding: "2px 7px",
                                      border: "1px solid rgba(232,196,106,0.3)",
                                    }}
                                  >
                                    最新
                                  </span>
                                ) : null}
                              </div>
                              <StageAirReadinessNote
                                readiness={air}
                                variant="card"
                              />
                              <button
                                className={
                                  unlocked ? styles.btnGold : styles.btnOutline
                                }
                                style={{
                                  width: "100%",
                                  fontSize: "0.8rem",
                                  padding: "0.4rem",
                                }}
                                disabled={!unlocked}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (unlocked) onSelect(map.map_id);
                                }}
                              >
                                {unlocked ? "選擇關卡" : "尚未解鎖"}
                              </button>
                              {/* 只查看，不切換關卡：不能冒泡到卡片（卡片點下去就是選擇關卡） */}
                              <button
                                className={`${styles.btnOutline} w-100 mt-2`}
                                style={{
                                  fontSize: "0.76rem",
                                  padding: "0.3rem",
                                }}
                                data-testid="enemy-preview-open"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPreviewId(map.map_id);
                                }}
                              >
                                敵軍預覽
                              </button>
                            </div>
                          </div>
                        </Col>
                      );
                    })}
                  </Row>
                </div>
              ))}
          </div>
        </div>
      </div>
      {previewMap && (
        <EnemyPreviewModal
          map={previewMap}
          enemies={staticConfig.enemiesConfig ?? []}
          team={player.team}
          heroesConfig={staticConfig.heroesConfig}
          locked={!isStageUnlocked(previewMap.map_id, player.max_stage)}
          onClose={() => setPreviewId(null)}
        />
      )}
    </>
  );
}
