"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Container, Row, Col, Spinner, Alert } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { isStageUnlocked } from "../../utils/stageUtils";
import { stageAirReadiness } from "../../utils/stageAirReadiness";
import {
  stageDataProblem,
  stageDataProblemText,
} from "../../utils/stagePlayability";
import EnemyPreviewModal from "../../components/modals/EnemyPreviewModal";
import StageAirReadinessNote from "../../components/StageAirReadinessNote";
import StageDataNote from "../../components/StageDataNote";
import styles from "../../styles/shenmaSanguo.module.css";

/**
 * 獨立的關卡頁：只有可以出征的關卡能出征（規則見 utils/stagePlayability）。
 * 關卡資料未完成的關卡標示「尚未開放」與原因、按鈕停用，點了只在上方說明；遊戲設定讀取失敗時說明並可以重試
 */
export default function StagesPageContent() {
  const router = useRouter();
  const { player } = usePlayerStore();
  const {
    config: staticConfig,
    isLoading: configLoading,
    error: configError,
    loadConfig,
    clearError,
  } = useStaticConfigStore();
  // 正在查看敵軍預覽的關卡（唯讀，不出征）
  const [previewId, setPreviewId] = useState<string | null>(null);
  // 剛才點了不能出征的關卡：說明原因
  const [refused, setRefused] = useState<string | null>(null);

  // 遊戲設定讀取失敗（沒有可用的設定）：不是一直轉圈，說明原因並可以重試
  if (!staticConfig && configError && !configLoading) {
    return (
      <Container className={styles.pageContainer} style={{ maxWidth: 480 }}>
        <div className={styles.header}>
          <h2 className={styles.pageTitle}>關卡選擇</h2>
        </div>
        <Alert
          variant="danger"
          className="small"
          data-testid="stages-config-failed"
        >
          遊戲設定讀取失敗（{configError}），無法取得關卡資料。
        </Alert>
        <button
          className={styles.btnGold}
          data-testid="stages-config-retry"
          onClick={() => {
            clearError();
            void loadConfig();
          }}
        >
          重新讀取設定
        </button>{" "}
        <button
          className={styles.btnOutline}
          onClick={() => router.push("/shenmaSanguo")}
        >
          ← 返回
        </button>
      </Container>
    );
  }

  if (!player || configLoading || !staticConfig) {
    return (
      <Container className={styles.pageContainer}>
        <Spinner animation="border" variant="primary" />
        <p
          style={{
            color: "var(--sg-muted)",
            marginTop: "1rem",
            fontSize: "0.82rem",
          }}
        >
          載入關卡資料...
        </p>
      </Container>
    );
  }

  if (!player.team || player.team.length === 0) {
    return (
      <Container className={styles.pageContainer} style={{ maxWidth: 480 }}>
        <div className={styles.header}>
          <h2 className={styles.pageTitle}>關卡選擇</h2>
        </div>
        <Alert variant="warning" className="small">
          尚未編排隊伍！請先前往
          <button
            style={{
              background: "none",
              border: "none",
              color: "var(--sg-gold)",
              cursor: "pointer",
              padding: "0 4px",
              fontSize: "inherit",
            }}
            onClick={() => router.push("/shenmaSanguo/team")}
          >
            隊伍編排
          </button>
          頁選擇武將。
        </Alert>
        <button
          className={styles.btnOutline}
          onClick={() => router.push("/shenmaSanguo")}
        >
          ← 返回
        </button>
      </Container>
    );
  }

  const mapsByChapter: Record<
    number,
    NonNullable<typeof staticConfig>["maps"]
  > = {};
  (staticConfig.maps ?? []).forEach((m) => {
    if (!mapsByChapter[m.chapter]) mapsByChapter[m.chapter] = [];
    mapsByChapter[m.chapter].push(m);
  });
  const previewMap =
    staticConfig.maps.find((m) => m.map_id === previewId) ?? null;

  return (
    <div className={styles.stagesLayout}>
      {/* 頂部固定列 */}
      <div className={styles.stagesTopBar}>
        <button
          className={styles.stagesBackBtn}
          onClick={() => router.push("/shenmaSanguo")}
        >
          ‹
        </button>
        <div>
          <div className={styles.stagesTopTitle}>關卡選擇</div>
          <div className={styles.stagesTopSub}>
            進度：
            <span style={{ color: "var(--sg-gold)" }}>{player.max_stage}</span>
          </div>
        </div>
      </div>

      {/* 可滾動關卡區 */}
      <div className={styles.stagesScrollArea}>
        <div style={{ padding: "0 1rem 2rem" }}>
          {refused && (
            <div
              className={styles.stageRefused}
              role="status"
              data-testid="stage-refused"
            >
              {refused}
            </div>
          )}
          {Object.entries(mapsByChapter)
            .sort(([a], [b]) => Number(a) - Number(b))
            .map(([chapter, maps]) => (
              <div key={chapter} className="w-100 mb-4">
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
                    // 關卡資料未完成（沒有路線或沒有波次）：尚未開放，不能出征
                    const problem = stageDataProblem(map);
                    const playable = unlocked && !problem;
                    // 出征前的對空準備：只看目前上陣的隊伍（隊伍或設定改變時重新計算）
                    const air = stageAirReadiness(
                      map,
                      staticConfig.enemiesConfig,
                      player.team,
                      staticConfig.heroesConfig
                    );
                    const go = () => {
                      if (playable)
                        router.push(`/shenmaSanguo/battle?map=${map.map_id}`);
                      else if (problem)
                        setRefused(
                          `「${map.name}」尚未開放（${stageDataProblemText(problem)}），不能出征；可以選擇其他關卡。`
                        );
                    };

                    return (
                      <Col xs={12} sm={6} key={map.map_id}>
                        <div
                          className={`${styles.stageCard} ${
                            problem
                              ? styles.stageCardUnavailable
                              : !unlocked
                                ? styles.stageCardLocked
                                : isCurrent
                                  ? `${styles.stageCardUnlocked} ${styles.stageCardCurrent}`
                                  : styles.stageCardUnlocked
                          }`}
                          onClick={go}
                          data-testid="stage-card"
                          data-map-id={map.map_id}
                          data-access={
                            problem
                              ? "incomplete"
                              : unlocked
                                ? "playable"
                                : "locked"
                          }
                        >
                          <div style={{ padding: "1rem 1.1rem" }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: "0.65rem",
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    color: "var(--sg-text)",
                                    fontSize: "0.95rem",
                                  }}
                                >
                                  {map.name}
                                </div>
                                <div
                                  style={{
                                    fontSize: "0.68rem",
                                    color: "var(--sg-muted)",
                                    marginTop: "2px",
                                  }}
                                >
                                  {map.map_id}
                                </div>
                              </div>
                              {problem && (
                                <span className={styles.stageDataBadge}>
                                  尚未開放
                                </span>
                              )}
                              {!problem && !unlocked && (
                                <span
                                  style={{
                                    fontSize: "0.65rem",
                                    color: "var(--sg-muted)",
                                    background: "var(--sg-surface2)",
                                    borderRadius: 4,
                                    padding: "2px 8px",
                                    border: "1px solid var(--sg-border)",
                                  }}
                                >
                                  鎖定
                                </span>
                              )}
                              {isCurrent && unlocked && !problem && (
                                <span
                                  style={{
                                    fontSize: "0.65rem",
                                    color: "var(--sg-gold)",
                                    background: "rgba(232,196,106,0.12)",
                                    borderRadius: 4,
                                    padding: "2px 8px",
                                    border: "1px solid rgba(232,196,106,0.3)",
                                  }}
                                >
                                  最新
                                </span>
                              )}
                            </div>
                            {problem ? (
                              <StageDataNote problem={problem} />
                            ) : (
                              <StageAirReadinessNote
                                readiness={air}
                                variant="card"
                              />
                            )}
                            <button
                              className={
                                playable ? styles.btnGold : styles.btnOutline
                              }
                              style={{
                                width: "100%",
                                fontSize: "0.82rem",
                                padding: "0.45rem",
                              }}
                              disabled={!playable}
                              data-testid="stage-select"
                              onClick={(e) => {
                                e.stopPropagation();
                                go();
                              }}
                            >
                              {problem
                                ? "尚未開放"
                                : unlocked
                                  ? "出 征"
                                  : "尚未解鎖"}
                            </button>
                            {/* 只查看，不出征：不能冒泡到卡片（卡片點下去就是出征） */}
                            <button
                              className={`${styles.btnOutline} w-100 mt-2`}
                              style={{
                                fontSize: "0.78rem",
                                padding: "0.35rem",
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
    </div>
  );
}
