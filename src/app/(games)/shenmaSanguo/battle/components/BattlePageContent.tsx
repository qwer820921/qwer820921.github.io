"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Container, Row, Col, Spinner, Modal } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import {
  BattleResultPayload,
  BattleResult,
  ExpeditionPayload,
} from "../../types";
import styles from "../../styles/shenmaSanguo.module.css";

export default function BattlePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapId = searchParams.get("map") ?? "";

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { player, applyBattleResult } = usePlayerStore();
  const { config: staticConfig } = useStaticConfigStore();

  const [iframeLoading, setIframeLoading] = useState(true);
  const [payloadSent, setPayloadSent] = useState(false);
  const [battleResult, setBattleResult] = useState<BattleResultPayload | null>(
    null
  );

  const sendPayload = useCallback(() => {
    if (payloadSent || !player || !staticConfig || !mapId) return;
    const map = staticConfig.maps.find((m) => m.map_id === mapId);
    if (!map) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    const heroesConfig = staticConfig.heroesConfig;
    const payload: ExpeditionPayload = {
      stage_id: mapId,
      player: {
        key: player.key,
        nickname: player.nickname,
        level: player.level,
        gold: player.gold,
      },
      team_list: (player.team || []).map((slot) => {
        const heroState = (player.heroes || []).find(
          (h) => h.hero_id === slot.hero_id
        );
        const heroConfig = heroesConfig.find(
          (c) => c.hero_id === slot.hero_id
        )!;
        const state = heroState ?? {
          hero_id: slot.hero_id,
          level: 1,
          star: 0,
          atk: heroConfig?.base_atk ?? 0,
          def: heroConfig?.base_def ?? 0,
          hp: heroConfig?.base_hp ?? 0,
        };
        return { ...state, slot: slot.slot };
      }),
      heroes_config: heroesConfig,
      enemies_config: staticConfig.enemiesConfig,
      map,
    };
    iframe.contentWindow.postMessage(payload, "*");
    setPayloadSent(true);
  }, [mapId, payloadSent, player, staticConfig]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (!event.data || typeof event.data !== "object") return;
      if (event.data.__godot_bridge !== true) return;

      // 收到 Godot 的 Ready 訊號，立即隱藏載入遮罩並傳送資料
      if (event.data.type === "game_ready") {
        console.log(
          "[React] Godot is ready, hiding loading overlay and sending payload."
        );
        setIframeLoading(false);
        sendPayload(); // 核心修復：在此處觸發資料傳送
        return;
      }

      setBattleResult(event.data as BattleResultPayload);
    },
    [sendPayload]
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  const handleIframeLoad = () => {
    setIframeLoading(false);
  };

  const handleConfirmResult = () => {
    if (!battleResult) return;
    // 樂觀更新：立即觸發同步（背景執行）並跳轉
    applyBattleResult(battleResult);
    router.push("/shenmaSanguo");
  };

  if (
    !mapId ||
    (staticConfig && !staticConfig.maps.find((m) => m.map_id === mapId))
  ) {
    return (
      <Container className={styles.pageContainer}>
        <p style={{ color: "var(--sg-red)" }}>找不到地圖：{mapId}</p>
        <button
          className={styles.btnOutline}
          onClick={() => router.push("/shenmaSanguo/stages")}
        >
          返回關卡選擇
        </button>
      </Container>
    );
  }

  const mapName =
    staticConfig?.maps.find((m) => m.map_id === mapId)?.name ?? mapId;

  return (
    <Container fluid className={styles.pageContainer}>
      <div className={styles.header} style={{ marginBottom: "1rem" }}>
        <h2 className={styles.pageTitle}>{mapName}</h2>
        <p className={styles.subtitle}>
          {payloadSent
            ? "出征中，等待結算..."
            : iframeLoading
              ? "載入戰場..."
              : "準備傳送出征資料..."}
        </p>
      </div>

      <Row className="w-100" style={{ maxWidth: 1280 }}>
        <Col xs={12} lg={9} className="mb-3">
          <div className={styles.gameWrapper}>
            {iframeLoading && (
              <div className={styles.loadingOverlay}>
                <Spinner animation="border" variant="light" />
                <p className={styles.loadingText}>載入戰場中...</p>
              </div>
            )}
            <iframe
              ref={iframeRef}
              src="/games/shenmaSanguo/index.html"
              className={styles.gameIframe}
              onLoad={handleIframeLoad}
              allow="autoplay; fullscreen"
              title="Shenma Sanguo Battle"
            />
          </div>
        </Col>

        <Col xs={12} lg={3} className="mb-3">
          <div
            style={{
              background: "var(--sg-surface)",
              border: "1px solid var(--sg-border)",
              borderRadius: 10,
              padding: "1rem",
              minHeight: 200,
            }}
          >
            <div className={styles.sectionLabel}>出征隊伍</div>
            {(player?.team || []).map((slot) => {
              const heroConf = staticConfig?.heroesConfig.find(
                (c) => c.hero_id === slot.hero_id
              );
              const heroState = (player?.heroes || []).find(
                (h) => h.hero_id === slot.hero_id
              );
              return (
                <div
                  key={slot.slot}
                  style={{
                    marginBottom: "0.6rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <span
                    style={{
                      fontSize: "0.65rem",
                      color: "var(--sg-muted)",
                      minWidth: 20,
                    }}
                  >
                    #{slot.slot}
                  </span>
                  <span
                    style={{
                      fontWeight: 600,
                      color: "var(--sg-text)",
                      fontSize: "0.85rem",
                    }}
                  >
                    {heroConf?.name ?? slot.hero_id}
                  </span>
                  {heroState && (
                    <span
                      style={{ fontSize: "0.68rem", color: "var(--sg-gold)" }}
                    >
                      Lv.{heroState.level}
                    </span>
                  )}
                </div>
              );
            })}
            {payloadSent && !battleResult && (
              <div
                style={{
                  color: "var(--sg-muted)",
                  fontSize: "0.75rem",
                  marginTop: "1rem",
                }}
              >
                <Spinner animation="border" size="sm" className="me-1" />
                等待 Godot 結算...
              </div>
            )}
          </div>
        </Col>
      </Row>

      {/* 結算 Modal — 透過 portal 渲染在 .gameBody 外，CSS 變數無效，使用硬編碼值 */}
      {battleResult &&
        (() => {
          const isWin = battleResult.result === BattleResult.Win;
          const C = {
            surface: "#ffffff",
            border: "rgba(0,0,0,0.08)",
            text: "#1a1f36",
            muted: "#6b7280",
            gold: "#f59e0b",
            red: "#ef4444",
            green: "#10b981",
          };
          return (
            <Modal
              show
              centered
              contentClassName="border-0 p-0"
              style={{ "--bs-modal-bg": "transparent" } as React.CSSProperties}
            >
              <div
                style={{
                  background: C.surface,
                  border: `1px solid ${isWin ? "rgba(232,196,106,0.4)" : "rgba(224,82,82,0.3)"}`,
                  borderRadius: 12,
                  color: C.text,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "1rem 1.25rem",
                    borderBottom: `1px solid ${C.border}`,
                    fontSize: "1.2rem",
                    fontWeight: 700,
                    color: isWin ? C.gold : C.red,
                  }}
                >
                  {isWin ? "勝 利" : "落 敗"}
                </div>
                <div style={{ padding: "1.25rem" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3,1fr)",
                      textAlign: "center",
                      marginBottom: "1.25rem",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "0.65rem", color: C.muted }}>
                        星數
                      </div>
                      <div style={{ fontSize: "1.4rem", color: C.gold }}>
                        {"★".repeat(battleResult.stars_earned)}
                        <span style={{ opacity: 0.3 }}>
                          {"★".repeat(3 - battleResult.stars_earned)}
                        </span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.65rem", color: C.muted }}>
                        擊殺
                      </div>
                      <div
                        style={{
                          fontSize: "1.4rem",
                          fontWeight: 700,
                          color: C.text,
                        }}
                      >
                        {battleResult.kills}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.65rem", color: C.muted }}>
                        時間
                      </div>
                      <div
                        style={{
                          fontSize: "1.4rem",
                          fontWeight: 700,
                          color: C.text,
                        }}
                      >
                        {battleResult.time_seconds}s
                      </div>
                    </div>
                  </div>

                  {isWin && (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "0.6rem",
                        background: "rgba(232,196,106,0.08)",
                        borderRadius: 8,
                        border: "1px solid rgba(232,196,106,0.2)",
                        marginBottom: "1rem",
                        fontSize: "0.88rem",
                      }}
                    >
                      <span style={{ color: C.muted }}>獲得戰場點數 </span>
                      <span style={{ color: C.gold, fontWeight: 700 }}>
                        +
                        {battleResult.loots
                          .filter((l) => l.item === "battle_points")
                          .reduce((s, l) => s + l.count, 0)}
                      </span>
                    </div>
                  )}

                  <button
                    onClick={handleConfirmResult}
                    style={{
                      width: "100%",
                      padding: "0.65rem",
                      fontSize: "0.95rem",
                      border: isWin ? "none" : `1px solid rgba(0,0,0,0.15)`,
                      borderRadius: 8,
                      fontWeight: 700,
                      cursor: "pointer",
                      background: isWin
                        ? "linear-gradient(135deg,#6366f1,#818cf8)"
                        : "transparent",
                      color: isWin ? "#fff" : C.muted,
                    }}
                  >
                    確認，返回主選單
                  </button>
                </div>
              </div>
            </Modal>
          );
        })()}
    </Container>
  );
}
