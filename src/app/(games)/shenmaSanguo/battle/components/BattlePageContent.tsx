"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner, Modal, Container } from "react-bootstrap";
import { usePlayerStore } from "../../store/playerStore";
import { useStaticConfigStore } from "../../store/staticConfigStore";
import { useSoundSettingsStore } from "../../store/soundSettingsStore";
import {
  BattleResultPayload,
  BattleResult,
  ExpeditionPayload,
} from "../../types";
import {
  BattleSession,
  isBattleResultMessage,
} from "../../utils/battleSession";
import {
  EngineStatus,
  activateLatestGameWorker,
  isCompatibleEngine,
} from "../../utils/gameEngine";
import { heroSkillPayload } from "../../utils/heroSkills";
import EngineUpdatePrompt from "../../components/EngineUpdatePrompt";
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

/**
 * 這一場已開打或有待確認的結算：鎖住帳號切換
 * （鎖屬於這一場，結算、離開頁面、換帳號時由 store 解除）
 */
const syncBattleLock = (session: BattleSession) =>
  usePlayerStore.getState().lockBattle(session.lockTicket());

export default function BattlePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const mapId = searchParams.get("map") ?? "";

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { player, applyBattleResult } = usePlayerStore();
  const { config: staticConfig } = useStaticConfigStore();
  const { sfxEnabled, sfxPolyphony } = useSoundSettingsStore();

  const [iframeLoading, setIframeLoading] = useState(true);
  const [payloadSent, setPayloadSent] = useState(false);
  const [battleResult, setBattleResult] = useState<BattleResultPayload | null>(
    null
  );
  const [battleStats, setBattleStats] = useState<BattleStats | null>(null);
  const [godotReady, setGodotReady] = useState(false);
  // 遊戲版本：game_ready 的協定版本和網頁相同才送出關卡資料（見 utils/gameEngine）
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("loading");
  // 重新載入遊戲時換一個新的 iframe（舊 iframe 之後送達的訊息一律不採用）
  const [iframeKey, setIframeKey] = useState(0);
  const [engineRetrying, setEngineRetrying] = useState(false);
  const [engineRetried, setEngineRetried] = useState(false);
  const [placementMenu, setPlacementMenu] = useState<{
    type: "road" | "build";
    pos: { x: number; y: number };
    cell: { x: number; y: number };
  } | null>(null);
  const [upgradePanel, setUpgradePanel] = useState<any | null>(null);
  const [placedHeroIds, setPlacedHeroIds] = useState<string[]>([]);
  // 這一關的戰鬥：記下屬於哪個帳號、能不能採用結算（見 utils/battleSession）
  const sessionRef = useRef(new BattleSession());

  // 離開頁面：這一關作廢，只解除這一場自己的鎖（不影響之後新頁面的那一場）
  useEffect(() => {
    const session = sessionRef.current;
    return () => {
      const owner = session.owner;
      session.end();
      usePlayerStore.getState().endBattle(owner);
    };
  }, []);

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
      return { ...state, slot: slot.slot, ...heroSkillPayload(slot.hero_id) };
    });

    // 新的一場：綁定目前帳號，battle_id 送進 Godot
    // （開頭已確認有玩家資料，beginBattle 一定會回傳戰鬥票）
    const ticket = usePlayerStore.getState().beginBattle();
    sessionRef.current.begin(ticket);

    const payload: ExpeditionPayload = {
      stage_id: mapId,
      battle_id: ticket?.id ?? "",
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
      sound_settings: {
        sfx_enabled: sfxEnabled,
        sfx_polyphony: sfxPolyphony,
      },
    };

    iframe.contentWindow.postMessage(payload, "*");
    setPayloadSent(true);
  }, [mapId, payloadSent, player, staticConfig, sfxEnabled, sfxPolyphony]);

  const handleMessage = useCallback((event: MessageEvent) => {
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.__godot_bridge !== true) return;
    // 只接受目前這個遊戲 iframe 送來的訊息（重新載入前的舊 iframe、其他視窗送來的都不採用）
    if (event.source !== iframeRef.current?.contentWindow) return;

    // 收到 Godot 的 Ready 訊號：協定版本相同才標記 Godot 已準備好
    if (event.data.type === "game_ready") {
      setIframeLoading(false);
      // 協定版本不同（舊版遊戲）：不送出關卡資料、不開戰，顯示更新提示
      if (!isCompatibleEngine(event.data)) {
        setEngineStatus("incompatible");
        return;
      }
      console.log(
        "[React] Godot is ready, waiting for player data to send payload."
      );
      setEngineStatus("ready");
      setGodotReady(true);
      return;
    }

    if (event.data.type === "update_stats") {
      // 只採用這一場的狀態（battle_id 不同或缺少的訊息不更新畫面，也不影響切換鎖）
      if (!sessionRef.current.onStats(event.data as BattleStats)) return;
      syncBattleLock(sessionRef.current);
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

    // 只有結算訊息才是結算（debug_snapshot 等其他訊息不是），
    // 而且只採用這一場（battle_id 相同）開打後的第一筆
    if (
      isBattleResultMessage(event.data) &&
      sessionRef.current.onResult(event.data)
    ) {
      syncBattleLock(sessionRef.current);
      setBattleResult(event.data);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    // 遊戲 iframe 在頁面程式載入前就開始載入，遊戲可能比頁面先準備好，game_ready 在監聽掛上之前送出就會漏掉：
    // 掛上監聽後請遊戲再送一次就緒訊息（遊戲還沒啟動時會忽略，之後啟動照常送出；重複收到不影響）
    iframeRef.current?.contentWindow?.postMessage(
      { __godot_bridge: true, type: "request_ready" },
      "*"
    );
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

  // 遊戲版本不相符：只換掉遊戲 iframe（先讓遊戲的 Service Worker 換成最新版本），不重新整理頁面，
  // 玩家存檔與未同步的修改都留在 store。只有玩家按下時才執行，不會自動重試
  const handleReloadEngine = async () => {
    if (engineRetrying) return;
    setEngineRetrying(true);
    const owner = sessionRef.current.owner;
    sessionRef.current.end();
    usePlayerStore.getState().endBattle(owner);
    setGodotReady(false);
    setPayloadSent(false);
    setBattleStats(null);
    setBattleResult(null);
    setPlacedHeroIds([]);
    setPlacementMenu(null);
    setUpgradePanel(null);
    await activateLatestGameWorker();
    setEngineStatus("loading");
    setIframeLoading(true);
    setEngineRetried(true);
    setIframeKey((k) => k + 1);
    setEngineRetrying(false);
  };

  const handleConfirmResult = () => {
    // 同一場只確認一次（連按不會重複結算）；結算只算給開戰時的帳號
    const taken = sessionRef.current.take();
    if (!taken) return;
    // 樂觀更新：立即觸發同步（背景執行）並跳轉
    // 結算後這一場由 store 解除鎖並作廢；沒有套用時也離開這一場，不留下鎖
    const settled = applyBattleResult(taken.result, taken.ticket);
    if (!settled.ok) {
      console.warn("[Battle] 結算沒有套用：", settled.error);
      usePlayerStore.getState().endBattle(taken.ticket);
    }
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
            {/* 遊戲版本和網頁不相符：提示更新，不開戰 */}
            {engineStatus === "incompatible" && (
              <EngineUpdatePrompt
                retrying={engineRetrying}
                retried={engineRetried}
                onRetry={handleReloadEngine}
              />
            )}
            <iframe
              key={iframeKey}
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
