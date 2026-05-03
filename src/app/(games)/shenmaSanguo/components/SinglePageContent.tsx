"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Spinner, Form, Alert } from "react-bootstrap";
import { Coin, Trophy, ShieldFill, GearFill } from "react-bootstrap-icons";
import { usePlayerStore } from "../store/playerStore";
import { useStaticConfigStore } from "../store/staticConfigStore";
import { useSoundSettingsStore } from "../store/soundSettingsStore";
import { BattleResultPayload, BattleResult, ExpeditionPayload } from "../types";
import { getPlayerKey, setPlayerKey } from "../api/gameApi";
import { isStageUnlocked } from "../utils/stageUtils";
import styles from "../styles/shenmaSanguo.module.css";
import PlacementMenu from "../battle/components/PlacementMenu";
import UpgradePanel from "../battle/components/UpgradePanel";
import StageSelectModal from "./modals/StageSelectModal";
import TeamEditModal from "./modals/TeamEditModal";
import HeroListModal from "./modals/HeroListModal";
import PlayerInfoModal from "./modals/PlayerInfoModal";
import SettingsModal from "./modals/SettingsModal";

interface BattleStats {
  gold: number;
  wave: number;
  total_waves: number;
  hp: number;
  max_hp: number;
  game_state: number;
  auto_mode: boolean;
}

const GameState = { WAITING: 0, PREP: 1, BATTLE: 2, RESULT: 3 };

// ── 首次登入畫面 ─────────────────────────────────────────────
function KeySetupView() {
  const { initFromGAS, isLoading, error, clearError } = usePlayerStore();
  const [inputKey, setInputKey] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputKey.trim();
    if (!trimmed) return;
    clearError();
    setPlayerKey(trimmed);
    await initFromGAS(trimmed);
  };

  return (
    <div className={styles.keySetupOverlay}>
      <div className={styles.keySetupCard}>
        <h1 className={styles.gameTitle}>神馬三國</h1>
        <p className={styles.subtitle}>塔防策略・三國風雲</p>
        <p className={styles.keySetupHint}>
          輸入一組你能記住的金鑰（英數字皆可）。
          <br />
          找到存檔自動讀取；找不到則建立新存檔。
        </p>
        <Form onSubmit={handleSubmit}>
          <Form.Control
            type="text"
            placeholder="例：eric_sanguo_2026"
            value={inputKey}
            onChange={(e) => setInputKey(e.target.value)}
            disabled={isLoading}
            autoComplete="off"
            maxLength={50}
            autoFocus
            className={styles.keyInput}
          />
          {error && (
            <Alert variant="danger" className="py-2 small mt-2">
              {error}
            </Alert>
          )}
          <button
            type="submit"
            className={styles.btnGold}
            disabled={isLoading || !inputKey.trim()}
            style={{ width: "100%", marginTop: "0.75rem" }}
          >
            {isLoading ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                確認中...
              </>
            ) : (
              "進入遊戲"
            )}
          </button>
        </Form>
      </div>
    </div>
  );
}

// ── 三國載入動畫 ──────────────────────────────────────────────
const KINGDOMS = [
  { char: "魏", color: "#6b9fd4" },
  { char: "蜀", color: "#e57373" },
  { char: "吳", color: "#66bb6a" },
] as const;

function ThreeKingdomsLoader({ progress }: { progress: number }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx((p) => (p + 1) % 3), 900);
    return () => clearInterval(t);
  }, []);
  const kingdom = KINGDOMS[idx];
  return (
    <div className={styles.tkLoadingOverlay}>
      <div className={styles.tkLoaderInner}>
        <div className={styles.tkRingWrap}>
          <div className={styles.tkRing} />
          <span
            key={idx}
            className={styles.tkChar}
            style={{ color: kingdom.color }}
          >
            {kingdom.char}
          </span>
        </div>
        <p className={styles.tkLoadingLabel}>調兵遣將中</p>
        <div className={styles.tkProgressWrap}>
          <div
            className={styles.tkProgressFill}
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className={styles.tkDots}>
          {KINGDOMS.map((k, i) => (
            <span
              key={k.char}
              className={styles.tkDot}
              style={{ background: k.color, opacity: i === idx ? 1 : 0.25 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── 結算 Modal ────────────────────────────────────────────────
function BattleResultModal({
  result,
  onConfirm,
}: {
  result: BattleResultPayload;
  onConfirm: () => void;
}) {
  const isWin = result.result === BattleResult.Win;

  const getLootDisplay = (item: string) => {
    switch (item) {
      case "battle_points":
        return (
          <>
            <Trophy className="me-1" style={{ color: "#8b5cf6" }} />
            戰場點數
          </>
        );
      case "gold":
        return (
          <>
            <Coin className="me-1" style={{ color: "var(--sg-gold)" }} />
            金幣
          </>
        );
      default:
        return item;
    }
  };

  return (
    <div className={styles.resultOverlay}>
      <div
        className={`${styles.resultCard} ${isWin ? styles.resultWin : styles.resultLose}`}
      >
        <div className={styles.resultTitle}>{isWin ? "勝 利" : "落 敗"}</div>
        <div className={styles.resultStars}>
          {"★".repeat(result.stars_earned)}
          {"☆".repeat(3 - result.stars_earned)}
        </div>
        {result.loots?.length > 0 && (
          <div className={styles.resultLoots}>
            {result.loots.map((l, i) => (
              <div key={i} className={styles.resultLootItem}>
                <span className={styles.resultLootName}>
                  {getLootDisplay(l.item)}
                </span>
                <span className={styles.resultLootCount}>+{l.count}</span>
              </div>
            ))}
          </div>
        )}
        <button
          className={styles.btnGold}
          style={{ width: "100%", marginTop: "1rem" }}
          onClick={onConfirm}
        >
          確認
        </button>
      </div>
    </div>
  );
}

// ── 主元件 ────────────────────────────────────────────────────
export default function SinglePageContent() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { player, applyBattleResult } = usePlayerStore();
  const { config: staticConfig, fetchProgress } = useStaticConfigStore();
  const { sfxEnabled, sfxPolyphony } = useSoundSettingsStore();

  // ── Godot 狀態 ─────────────────────────────────────────────
  const [godotReady, setGodotReady] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const iframeLoadingRef = useRef(true);

  // ── 載入狀態 ───────────────────────────────────────────────
  const [loadElapsed, setLoadElapsed] = useState(0);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [swUpdateReady, setSwUpdateReady] = useState(false);
  const [payloadSent, setPayloadSent] = useState(false);
  const [currentMapId, setCurrentMapId] = useState<string>("");
  const [battleStats, setBattleStats] = useState<BattleStats | null>(null);
  const [placementMenu, setPlacementMenu] = useState<{
    type: "road" | "build";
    pos: { x: number; y: number };
    cell: { x: number; y: number };
  } | null>(null);
  const [upgradePanel, setUpgradePanel] = useState<any | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResultPayload | null>(
    null
  );
  const [placedHeroIds, setPlacedHeroIds] = useState<string[]>([]);

  // ── Modal 狀態 ─────────────────────────────────────────────
  const [showStageModal, setShowStageModal] = useState(false);
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [showHeroModal, setShowHeroModal] = useState(false);
  const [showPlayerModal, setShowPlayerModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // ── 初始化 ─────────────────────────────────────────────────
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // ── 全局解鎖 Godot Web AudioContext ───────────────────────
  useEffect(() => {
    const resumeAudio = () => {
      try {
        const iframeWin = iframeRef.current?.contentWindow as any;
        if (iframeWin && iframeWin._my_godot_audio_ctx) {
          const ctx = iframeWin._my_godot_audio_ctx;
          if (ctx.state === "suspended") {
            ctx
              .resume()
              .then(() =>
                console.log("[WebBridge] React resumed Godot AudioContext")
              );
          }
        }
      } catch {
        // 忽略跨域等錯誤
      }
    };

    window.addEventListener("pointerdown", resumeAudio, true);
    window.addEventListener("touchstart", resumeAudio, true);
    window.addEventListener("click", resumeAudio, true);

    return () => {
      window.removeEventListener("pointerdown", resumeAudio, true);
      window.removeEventListener("touchstart", resumeAudio, true);
      window.removeEventListener("click", resumeAudio, true);
    };
  }, []);

  // 同步 ref，讓 SW callback 讀到最新值
  useEffect(() => {
    iframeLoadingRef.current = iframeLoading;
  }, [iframeLoading]);

  // SW 更新偵測：載入中 → 直接強制更新；遊戲已啟動 → 顯示 banner
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handleWaiting = (reg: ServiceWorkerRegistration) => {
      if (!reg.waiting) return;
      if (iframeLoadingRef.current) {
        reg.waiting.postMessage("update"); // 強制新 SW 接管，頁面自動重載
      } else {
        setSwUpdateReady(true);
      }
    };
    navigator.serviceWorker.ready
      .then((reg) => {
        handleWaiting(reg);
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (
              nw.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              handleWaiting(reg);
            }
          });
        });
      })
      .catch(() => {});
  }, []);

  // 載入計時器
  useEffect(() => {
    if (!iframeLoading) {
      setLoadElapsed(0);
      setLoadTimedOut(false);
      return;
    }
    const interval = setInterval(
      () => setLoadElapsed((prev) => prev + 1),
      1000
    );
    return () => clearInterval(interval);
  }, [iframeLoading]);

  useEffect(() => {
    if (loadElapsed >= 120) setLoadTimedOut(true);
  }, [loadElapsed]);

  const hasKey = mounted ? getPlayerKey() !== null : false;

  // 設定初始地圖
  useEffect(() => {
    if (!currentMapId && player && staticConfig) {
      const maps = staticConfig.maps ?? [];
      const target =
        maps.find((m) => m.map_id === player.max_stage) ??
        maps.find((m) => isStageUnlocked(m.map_id, player.max_stage)) ??
        maps[0];
      if (target) setCurrentMapId(target.map_id);
    }
  }, [player, staticConfig, currentMapId]);

  // ── WebBridge 訊息處理 ──────────────────────────────────────
  const handleMessage = useCallback((event: MessageEvent) => {
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.__godot_bridge !== true) return;

    switch (event.data.type) {
      case "game_ready":
        setIframeLoading(false);
        setGodotReady(true);
        break;
      case "update_stats":
        setBattleStats(event.data as BattleStats);
        break;
      case "click_cell":
        setPlacementMenu({
          type: event.data.tile_type,
          pos: event.data.screen_pos,
          cell: { x: event.data.cell_x, y: event.data.cell_y },
        });
        break;
      case "hide_placement_menu":
        setPlacementMenu(null);
        break;
      case "show_upgrade_panel":
        setUpgradePanel(event.data);
        break;
      case "hide_upgrade_panel":
        setUpgradePanel(null);
        break;
      default:
        if (event.data.stage_id || event.data.result !== undefined) {
          setBattleResult(event.data as BattleResultPayload);
        }
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // ── 發送初始 Payload ────────────────────────────────────────
  const sendPayload = useCallback(() => {
    if (payloadSent || !player || !staticConfig || !currentMapId) return;
    const map = staticConfig.maps.find((m) => m.map_id === currentMapId);
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
      stage_id: currentMapId,
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
  }, [
    currentMapId,
    payloadSent,
    player,
    sfxEnabled,
    sfxPolyphony,
    staticConfig,
  ]);

  useEffect(() => {
    if (godotReady && player && staticConfig && currentMapId && !payloadSent) {
      sendPayload();
    }
  }, [
    godotReady,
    player,
    staticConfig,
    currentMapId,
    payloadSent,
    sendPayload,
  ]);

  // 音效設定變更時，即時通知 Godot
  useEffect(() => {
    if (!payloadSent || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      {
        __godot_bridge: true,
        type: "update_sound_settings",
        sfx_enabled: sfxEnabled,
        sfx_polyphony: sfxPolyphony,
      },
      "*"
    );
  }, [sfxEnabled, sfxPolyphony, payloadSent]);

  // ── Godot 通訊 helper ──────────────────────────────────────
  const sendToGodot = (msg: object) => {
    iframeRef.current?.contentWindow?.postMessage(
      { __godot_bridge: true, ...msg },
      "*"
    );
  };

  // 隊伍更新後同步給 Godot
  const sendTeamUpdate = useCallback(() => {
    const latestPlayer = usePlayerStore.getState().player;
    if (!latestPlayer || !staticConfig || !iframeRef.current?.contentWindow)
      return;
    const heroesConfig = staticConfig.heroesConfig;
    const team_list = (latestPlayer.team || []).map((slot) => {
      const heroState = (latestPlayer.heroes || []).find(
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
    iframeRef.current.contentWindow.postMessage(
      { __godot_bridge: true, type: "update_team", team_list },
      "*"
    );
  }, [staticConfig]);

  // ── 按鈕處理 ────────────────────────────────────────────────
  const handleStartBattle = () => sendToGodot({ type: "start_battle" });
  const handleToggleAuto = () => sendToGodot({ type: "toggle_auto" });

  const handleStageSelected = (mapId: string) => {
    if (!staticConfig || !player) return;
    const map = staticConfig.maps.find((m) => m.map_id === mapId);
    if (!map) return;

    setCurrentMapId(mapId);
    setPayloadSent(false);
    setBattleStats(null);
    setBattleResult(null);
    setPlacedHeroIds([]);
    setShowStageModal(false);

    // 若 Godot 已就緒，直接發送新關卡資料
    if (godotReady && player && staticConfig) {
      const heroesConfig = staticConfig.heroesConfig;
      const team_list = (player.team || []).map((slot) => {
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
        sound_settings: {
          sfx_enabled: sfxEnabled,
          sfx_polyphony: sfxPolyphony,
        },
      };
      iframeRef.current?.contentWindow?.postMessage(payload, "*");
      setPayloadSent(true);
    }
  };

  const handleSelectUnit = (id: string, category: "hero" | "tower") => {
    if (!placementMenu) return;
    if (category === "hero") {
      sendToGodot({
        type: "place_hero",
        hero_id: id,
        cell_x: placementMenu.cell.x,
        cell_y: placementMenu.cell.y,
      });
      setPlacedHeroIds((prev) => [...prev, id]);
    } else {
      sendToGodot({
        type: "place_tower",
        tower_type: id,
        cell_x: placementMenu.cell.x,
        cell_y: placementMenu.cell.y,
      });
    }
    handleCloseMenu();
  };

  const handleCloseMenu = () => {
    setPlacementMenu(null);
    sendToGodot({ type: "resume_game" });
  };

  const handleUpgradeUnit = () => {
    if (!upgradePanel) return;
    sendToGodot({ type: "request_upgrade" });
  };

  const handleCloseUpgradePanel = () => {
    setUpgradePanel(null);
    sendToGodot({ type: "deselect_unit" });
  };

  const handleConfirmResult = () => {
    if (!battleResult) return;
    applyBattleResult(battleResult);
    setBattleResult(null);
    setBattleStats(null);
    setPayloadSent(false);
    setPlacedHeroIds([]);
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

  const currentMap = staticConfig?.maps.find((m) => m.map_id === currentMapId);

  // ── 渲染 ────────────────────────────────────────────────────
  if (!mounted) return null;

  return (
    <div className={styles.singlePage}>
      {/* Godot iframe — 永遠不卸載 */}
      <div className={styles.gamePortraitWrap}>
        <div className={styles.gameWrapper}>
          {/* 進場動畫：payload 送出前全程顯示（含 Godot 載入階段） */}
          {!payloadSent && hasKey && !loadTimedOut && (
            <ThreeKingdomsLoader
              progress={
                Math.round((fetchProgress / 3) * 50) + (player ? 50 : 0)
              }
            />
          )}

          {/* 逾時錯誤畫面（120s 後） */}
          {iframeLoading && loadTimedOut && (
            <div className={styles.loadingOverlay}>
              <p className={styles.loadingText}>載入逾時，請重新整理頁面</p>
              <button
                className={styles.btnGold}
                style={{ marginTop: "0.5rem" }}
                onClick={() => window.location.reload()}
              >
                重新載入
              </button>
            </div>
          )}
          <iframe
            ref={iframeRef}
            src="/games/shenmaSanguo/index.html"
            className={styles.gameIframe}
            onLoad={() => setIframeLoading(false)}
            allow="autoplay; fullscreen"
            title="Shenma Sanguo"
          />

          {/* Godot 內 pop-up（疊加在 iframe 上） */}
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

      {/* HUD 疊加層 */}
      {payloadSent && !battleResult && (
        <>
          {/* 頂欄 */}
          <div className={styles.hudTopBar}>
            <button
              className={styles.hudAvatar}
              onClick={() => setShowPlayerModal(true)}
            >
              👤
            </button>
            <div className={styles.hudCenter}>
              <button
                className={styles.hudStageBtn}
                onClick={() => setShowStageModal(true)}
                title="切換關卡"
              >
                🗺️
              </button>
              <span className={styles.hudMapName}>
                {currentMap?.name || "未知地圖"}
              </span>
              {battleStats && (
                <span className={styles.hudWave}>
                  {" "}
                  {battleStats.wave}/{battleStats.total_waves}
                </span>
              )}
            </div>
            <div className={styles.hudRight}>
              {battleStats && (
                <>
                  <span className={styles.hudStat}>
                    <Coin className="me-1" style={{ color: "#f59e0b" }} />
                    {battleStats.gold}
                  </span>
                  <span className={styles.hudStat}>
                    <ShieldFill
                      className="me-1"
                      style={{
                        color:
                          battleStats.hp / battleStats.max_hp < 0.3
                            ? "var(--sg-red)"
                            : "#6366f1",
                      }}
                    />
                    <span
                      style={{
                        color:
                          battleStats.hp / battleStats.max_hp < 0.3
                            ? "var(--sg-red)"
                            : "inherit",
                      }}
                    >
                      {battleStats.hp}/{battleStats.max_hp}
                    </span>
                  </span>
                </>
              )}
            </div>
            <button
              className={styles.hudStageBtn}
              onClick={() => setShowSettingsModal(true)}
              title="設定"
            >
              <GearFill size={13} />
            </button>
          </div>

          {/* 操作按鈕列（top bar 下方，左右分組） */}
          <div className={styles.hudActionBar}>
            <div className={styles.hudActionBarLeft}>
              {battleStats && battleStats.game_state !== GameState.RESULT && (
                <>
                  <button
                    className={styles.hudBarBtn}
                    onClick={handleStartBattle}
                    disabled={battleStats.game_state !== GameState.PREP}
                    style={
                      battleStats.game_state === GameState.BATTLE
                        ? { background: "rgba(99, 102, 241, 0.6)" }
                        : undefined
                    }
                  >
                    {battleStats.game_state === GameState.BATTLE
                      ? "戰鬥中"
                      : "迎戰"}
                  </button>
                  <button
                    className={`${styles.hudBarBtn} ${battleStats.auto_mode ? styles.hudActionBtnActive : ""}`}
                    onClick={handleToggleAuto}
                  >
                    自動
                  </button>
                </>
              )}
            </div>
            <div className={styles.hudActionBarRight}>
              <button
                className={styles.hudBarBtn}
                onClick={() => setShowHeroModal(true)}
              >
                武將
              </button>
              <button
                className={styles.hudBarBtn}
                onClick={() => setShowTeamModal(true)}
              >
                隊伍
              </button>
            </div>
          </div>
        </>
      )}

      {/* 結算 Modal */}
      {battleResult && (
        <BattleResultModal
          result={battleResult}
          onConfirm={handleConfirmResult}
        />
      )}

      {/* 金鑰設定（無帳號時全屏擋住） */}
      {!hasKey && <KeySetupView />}

      {/* Modals */}
      {showStageModal && (
        <StageSelectModal
          onSelect={handleStageSelected}
          onClose={() => setShowStageModal(false)}
        />
      )}
      {showTeamModal && (
        <TeamEditModal
          onClose={() => setShowTeamModal(false)}
          onTeamSaved={sendTeamUpdate}
        />
      )}
      {showHeroModal && (
        <HeroListModal
          onClose={() => setShowHeroModal(false)}
          onHeroUpgraded={sendTeamUpdate}
        />
      )}
      {showPlayerModal && (
        <PlayerInfoModal
          onClose={() => setShowPlayerModal(false)}
          onOpenStage={() => {
            setShowPlayerModal(false);
            setShowStageModal(true);
          }}
        />
      )}
      {showSettingsModal && (
        <SettingsModal onClose={() => setShowSettingsModal(false)} />
      )}

      {/* 遊戲版本更新 banner（遊戲已啟動時顯示） */}
      {swUpdateReady && (
        <div className={styles.swUpdateBanner}>
          <span>遊戲新版本已就緒</span>
          <button
            className={styles.btnGold}
            style={{ fontSize: "0.72rem", padding: "3px 14px" }}
            onClick={async () => {
              const reg = await navigator.serviceWorker.ready;
              if (reg.waiting) {
                reg.waiting.postMessage("update");
              } else {
                window.location.reload();
              }
            }}
          >
            立即更新
          </button>
        </div>
      )}
    </div>
  );
}
