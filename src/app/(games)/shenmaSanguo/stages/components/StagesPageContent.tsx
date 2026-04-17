"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { Container, Row, Col, Spinner, Alert } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { isStageUnlocked } from "../../utils/stageUtils";
import styles from "../../styles/shenmaSanguo.module.css";

export default function StagesPageContent() {
  const router = useRouter();
  const { player } = usePlayerStore();
  const { config: staticConfig, isLoading: configLoading } =
    useStaticConfigStore();

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

  return (
    <Container className={styles.pageContainer} style={{ maxWidth: 640 }}>
      <div className={styles.header}>
        <h2 className={styles.pageTitle}>關卡選擇</h2>
        <p className={styles.subtitle}>
          目前進度：
          <span style={{ color: "var(--sg-gold)" }}>{player.max_stage}</span>
        </p>
      </div>

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
                const unlocked = isStageUnlocked(map.map_id, player.max_stage);
                const isCurrent = map.map_id === player.max_stage;

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
                      onClick={() =>
                        unlocked &&
                        router.push(`/shenmaSanguo/battle?map=${map.map_id}`)
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
                          {!unlocked && (
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
                          {isCurrent && unlocked && (
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
                        <button
                          className={
                            unlocked ? styles.btnGold : styles.btnOutline
                          }
                          style={{
                            width: "100%",
                            fontSize: "0.82rem",
                            padding: "0.45rem",
                          }}
                          disabled={!unlocked}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (unlocked)
                              router.push(
                                `/shenmaSanguo/battle?map=${map.map_id}`
                              );
                          }}
                        >
                          {unlocked ? "出 征" : "尚未解鎖"}
                        </button>
                      </div>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </div>
        ))}

      <button
        className={styles.btnOutline}
        style={{ marginTop: "0.5rem" }}
        onClick={() => router.push("/shenmaSanguo")}
      >
        ← 返回
      </button>
    </Container>
  );
}
