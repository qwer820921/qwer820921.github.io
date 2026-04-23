"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner, Modal, Container } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import {
  BattleResultPayload,
  BattleResult,
  ExpeditionPayload,
} from "../../types";
import styles from "../../styles/shenmaSanguo.module.css";
import PlacementMenu from "./PlacementMenu";
import UpgradePanel from "./UpgradePanel";

interface BattleStats {
  gold: number;
  wave: number;
  total_waves: number;
  hp: number;
  max_hp: number;
  game_state: number;
  auto_mode: boolean;
}

const GameState = {
  WAITING: 0,
  PREP: 1,
  BATTLE: 2,
  RESULT: 3,
};

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
  const [battleStats, setBattleStats] = useState<BattleStats | null>(null);
  const [godotReady, setGodotReady] = useState(false);
  const [placementMenu, setPlacementMenu] = useState<{
    type: "road" | "build";
    pos: { x: number; y: number };
    cell: { x: number; y: number };
  } | null>(null);
  const [upgradePanel, setUpgradePanel] = useState<any | null>(null);
  const [placedHeroIds, setPlacedHeroIds] = useState<string[]>([]);

  const sendPayload = useCallback(() => {
    if (payloadSent || !player || !staticConfig || !mapId) return;
    const map = staticConfig.maps.find((m) => m.map_id === mapId);
    if (!map) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    const heroesConfig = staticConfig.heroesConfig;
    const team_list = (player.team || []).map((slot) => {
      const heroState = (player.heroes || []).find(
        (h) => h.hero_id === slot.hero_id
      );
      const heroConfig = heroesConfig.find((c) => c.hero_id === slot.hero_id)!;
      const state = heroState ?? {
        hero_id: slot.hero_id,
        level: 1,
        star: 0,
        atk: heroConfig?.base_atk ?? 0,
        def: heroConfig?.base_def ?? 0,
        hp: heroConfig?.base_hp ?? 0,
      };
      return { ...state, slot: slot.slot };
    });

    const payload: ExpeditionPayload = {
      stage_id: mapId,
      player: {
        key: player.key,
        nickname: player.nickname,
        level: player.level,
        gold: player.gold,
      },
      team_list,
      heroes_config: heroesConfig,
      enemies_config: staticConfig.enemiesConfig,
      map,
    };

    iframe.contentWindow.postMessage(payload, "*");
    setPayloadSent(true);
  }, [mapId, payloadSent, player, staticConfig]);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.__godot_bridge !== true) return;

    // 收到 Godot 的 Ready 訊號，標記 Godot 已準備好
    if (event.data.type === "game_ready") {
      console.log(
        "[React] Godot is ready, waiting for player data to send payload."
      );
      setIframeLoading(false);
      setGodotReady(true);
      return;
    }

    if (event.data.type === "update_stats") {
      setBattleStats(event.data as BattleStats);
      return;
    }

    if (event.data.type === "click_cell") {
      setPlacementMenu({
        type: event.data.tile_type,
        pos: event.data.screen_pos,
        cell: { x: event.data.cell_x, y: event.data.cell_y },
      });
      return;
    }

    if (event.data.type === "hide_placement_menu") {
      setPlacementMenu(null);
      return;
    }

    if (event.data.type === "show_upgrade_panel") {
      setUpgradePanel(event.data);
      return;
    }

    if (event.data.type === "hide_upgrade_panel") {
      setUpgradePanel(null);
      return;
    }

    setBattleResult(event.data as BattleResultPayload);
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // 當 Godot 準備好，且 React 端的資料（player, staticConfig）也載入完成時，發送 payload
  useEffect(() => {
    if (godotReady && player && staticConfig && mapId && !payloadSent) {
      sendPayload();
    }
  }, [godotReady, player, staticConfig, mapId, payloadSent, sendPayload]);

  const handleIframeLoad = () => {
    setIframeLoading(false);
  };

  const handleConfirmResult = () => {
    if (!battleResult) return;
    // 樂觀更新：立即觸發同步（背景執行）並跳轉
    applyBattleResult(battleResult);
    router.push("/shenmaSanguo");
  };

  const handleStartBattle = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { __godot_bridge: true, type: "start_battle" },
        "*"
      );
    }
  };

  const handleToggleAuto = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { __godot_bridge: true, type: "toggle_auto" },
        "*"
      );
    }
  };

  const handleSelectUnit = (id: string, category: "hero" | "tower") => {
    if (!placementMenu || !iframeRef.current?.contentWindow) return;

    if (category === "hero") {
      // 放置武將 (不論是在 road 還是 build)
      iframeRef.current.contentWindow.postMessage(
        {
          __godot_bridge: true,
          type: "place_hero",
          hero_id: id,
          cell_x: placementMenu.cell.x,
          cell_y: placementMenu.cell.y,
        },
        "*"
      );
      setPlacedHeroIds((prev) => [...prev, id]);
    } else {
      // 放置防禦塔
      iframeRef.current.contentWindow.postMessage(
        {
          __godot_bridge: true,
          type: "place_tower",
          tower_type: id,
          cell_x: placementMenu.cell.x,
          cell_y: placementMenu.cell.y,
        },
        "*"
      );
    }

    handleCloseMenu();
  };

  const enrichedTeamList = (player?.team || []).map((slot) => {
    const heroState = (player?.heroes || []).find(
      (h) => h.hero_id === slot.hero_id
    );
    const heroConfig = (staticConfig?.heroesConfig || []).find(
      (c) => c.hero_id === slot.hero_id
    );
    return {
      ...(heroState || { hero_id: slot.hero_id, level: 1 }),
      name: heroConfig?.name,
      image: heroConfig?.image,
    };
  });

  const handleUpgradeUnit = () => {
    if (!upgradePanel || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { __godot_bridge: true, type: "request_upgrade" },
      "*"
    );
  };

  const handleCloseUpgradePanel = () => {
    setUpgradePanel(null);
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { __godot_bridge: true, type: "deselect_unit" },
        "*"
      );
    }
  };

  const handleCloseMenu = () => {
    setPlacementMenu(null);
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { __godot_bridge: true, type: "resume_game" },
        "*"
      );
    }
  };

  if (
    !mapId ||
    (staticConfig && !staticConfig.maps.find((m) => m.map_id === mapId))
  ) {
    return (
      <div className={styles.pageContainer}>
        <p style={{ color: "var(--sg-red)" }}>找不到地圖：{mapId}</p>
        <button
          className={styles.btnOutline}
          onClick={() => router.push("/shenmaSanguo/stages")}
        >
          返回關卡選擇
        </button>
      </div>
    );
  }

  const mapName =
    staticConfig?.maps.find((m) => m.map_id === mapId)?.name ?? mapId;

  const statusText = payloadSent
    ? battleResult
      ? battleResult.result === BattleResult.Win
        ? "勝利"
        : "落敗"
      : ""
    : iframeLoading
      ? "載入中..."
      : "準備中...";

  return (
    <Container fluid className={styles.battleContainer}>
      <div className={styles.battleLayout}>
        {/* 頂部狀態列 */}
        <div className={styles.battleTopBar}>
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <button
              onClick={() => router.push("/shenmaSanguo/stages")}
              style={{
                background: "none",
                border: "none",
                color: "var(--sg-muted)",
                cursor: "pointer",
                fontSize: "1.1rem",
                padding: "0 4px",
                lineHeight: 1,
                flexShrink: 0,
              }}
              title="返回關卡選擇"
            >
              ‹
            </button>
            <span className={styles.battleTopBarTitle}>{mapName}</span>
            {battleStats && (
              <div className={styles.statsRow}>
                <div className={styles.statItem}>
                  <span className={styles.statIcon}>💰</span>
                  <span className={styles.statValue}>{battleStats.gold}</span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statIcon}>🌊</span>
                  <span className={styles.statValue}>
                    {battleStats.wave}/{battleStats.total_waves}
                  </span>
                </div>
                <div className={styles.statItem}>
                  <span className={styles.statIcon}>🏰</span>
                  <span
                    className={styles.statValue}
                    style={{
                      color:
                        battleStats.hp / battleStats.max_hp < 0.3
                          ? "var(--sg-red)"
                          : "inherit",
                    }}
                  >
                    {battleStats.hp}/{battleStats.max_hp}
                  </span>
                  <div
                    className={styles.hpBarMini}
                    style={
                      {
                        "--hp-percent": `${(battleStats.hp / battleStats.max_hp) * 100}%`,
                      } as React.CSSProperties
                    }
                  />
                </div>
              </div>
            )}
          </div>

          {/* 控制按鈕組 */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <span className={styles.battleTopBarStatus}>
              {payloadSent && !battleResult && !battleStats && (
                <Spinner
                  animation="border"
                  size="sm"
                  className="me-1"
                  style={{ width: "0.7rem", height: "0.7rem" }}
                />
              )}
              {statusText}
            </span>

            {battleStats && battleStats.game_state !== GameState.RESULT && (
              <div
                style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
              >
                <button
                  className={`${styles.topBtn} ${battleStats.auto_mode ? styles.topBtnActive : ""}`}
                  onClick={handleToggleAuto}
                  title="自動進入下一波"
                >
                  自動 {battleStats.auto_mode ? "ON" : "OFF"}
                </button>
                <button
                  className={styles.topBtnPrimary}
                  onClick={handleStartBattle}
                  disabled={battleStats.game_state !== GameState.PREP}
                >
                  {battleStats.game_state === GameState.BATTLE
                    ? "戰鬥中"
                    : "迎戰"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 遊戲 iframe（直式 9:16）*/}
        <div className={styles.gamePortraitWrap}>
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
            {placementMenu && (
              <PlacementMenu
                type={placementMenu.type}
                pos={placementMenu.pos}
                onSelect={handleSelectUnit}
                onClose={handleCloseMenu}
                playerGold={battleStats?.gold || 0}
                teamList={enrichedTeamList}
                heroesConfig={staticConfig?.heroesConfig || []}
                placedHeroIds={placedHeroIds}
              />
            )}

            {upgradePanel && (
              <UpgradePanel
                data={upgradePanel}
                onUpgrade={handleUpgradeUnit}
                onClose={handleCloseUpgradePanel}
              />
            )}
          </div>
        </div>

        {/* 結算 Modal */}
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
                style={
                  { "--bs-modal-bg": "transparent" } as React.CSSProperties
                }
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
                        gridTemplateColumns: "repeat(4,1fr)",
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
                          EXP
                        </div>
                        <div
                          style={{
                            fontSize: "1.4rem",
                            fontWeight: 700,
                            color: C.green,
                          }}
                        >
                          +{isWin ? 50 + battleResult.stars_earned * 20 : 10}
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
      </div>
    </Container>
  );
}
