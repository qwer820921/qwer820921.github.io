"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { Spinner, Form, Alert } from "react-bootstrap";
import { Coin, Trophy, ShieldFill, GearFill } from "react-bootstrap-icons";
import { usePlayerStore } from "../store/playerStore";
import { useStaticConfigStore } from "../store/staticConfigStore";
import { useSoundSettingsStore } from "../store/soundSettingsStore";
import { BattleResultPayload, BattleResult, ExpeditionPayload } from "../types";
import { getPlayerKey } from "../api/gameApi";
import { isStageUnlocked } from "../utils/stageUtils";
import { describePlayerError } from "../utils/playerErrors";
import { BattleSession, isBattleResultMessage } from "../utils/battleSession";
import { heroSkillPayload } from "../utils/heroSkills";
import {
  panelAfterSellResult,
  sellStateAfterResult,
  TowerSellResult,
  TowerSellState,
} from "../utils/towerSell";
import {
  EngineStatus,
  activateLatestGameWorker,
  isCompatibleEngine,
} from "../utils/gameEngine";
import {
  DeployMenuRef,
  GameSpeed,
  canChangeSpeed,
  canTogglePause,
  deployMenuRef,
  isPaused,
} from "../utils/gameSpeed";
import EngineUpdatePrompt from "./EngineUpdatePrompt";
import styles from "../styles/shenmaSanguo.module.css";
import PlacementMenu from "../battle/components/PlacementMenu";
import UpgradePanel from "../battle/components/UpgradePanel";
import SpeedToggle from "../battle/components/SpeedToggle";
import PauseToggle, { PauseBadge } from "../battle/components/PauseToggle";
import StageSelectModal from "./modals/StageSelectModal";
import TeamEditModal from "./modals/TeamEditModal";
import HeroListModal from "./modals/HeroListModal";
import PlayerInfoModal from "./modals/PlayerInfoModal";
import SettingsModal from "./modals/SettingsModal";

interface BattleStats {
  battle_id?: string;
  gold: number;
  wave: number;
  total_waves: number;
  hp: number;
  max_hp: number;
  game_state: number;
  auto_mode: boolean;
  /** 戰鬥速度：Godot 已確認的選擇（1／2）、實際倍率、是否在部署選單的暫時慢速中 */
  speed?: number;
  time_scale?: number;
  deploy_slow?: boolean;
  /** 手動暫停：Godot 已確認的狀態 */
  paused?: boolean;
}

const GameState = { WAITING: 0, PREP: 1, BATTLE: 2, RESULT: 3 };

/**
 * 這一場已開打或有待確認的結算：鎖住帳號切換
 * （鎖屬於這一場，結算、切換關卡、離開頁面、換帳號時由 store 解除）
 */
const syncBattleLock = (session: BattleSession) =>
  usePlayerStore.getState().lockBattle(session.lockTicket());

/** 明確離開目前這一場：舊的一場作廢（只會解除這一場自己的鎖） */
const leaveBattle = (session: BattleSession) => {
  const owner = session.owner;
  session.end();
  usePlayerStore.getState().endBattle(owner);
};

// ── 首次登入／更換金鑰畫面 ───────────────────────────────────
// 讀取成功後 store 才會寫入金鑰；失敗時留在此畫面顯示原因，可以直接再試或改用其他金鑰
function KeySetupView({
  initialKey = "",
  onCancel,
}: {
  initialKey?: string;
  onCancel?: () => void;
}) {
  const { initFromGAS, isLoading } = usePlayerStore();
  const [inputKey, setInputKey] = useState(initialKey);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputKey.trim();
    if (!trimmed) return;
    setError(null);
    const result = await initFromGAS(trimmed);
    if (!result.ok && !result.superseded) {
      setError(`${describePlayerError(result.error)}（代碼：${result.error}）`);
    }
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
          {onCancel && (
            <button
              type="button"
              className={`${styles.btnOutline} w-100 mt-2`}
              onClick={onCancel}
              disabled={isLoading}
            >
              返回
            </button>
          )}
        </Form>
      </div>
    </div>
  );
}

// ── 已有金鑰但讀不到存檔：顯示原因，可重試或更換金鑰 ─────────
function PlayerLoadError({
  code,
  onRetry,
  onChangeKey,
}: {
  code: string;
  onRetry: () => void;
  onChangeKey: () => void;
}) {
  return (
    <div className={styles.keySetupOverlay} data-testid="player-load-error">
      <div className={styles.keySetupCard}>
        <h1 className={styles.gameTitle}>神馬三國</h1>
        <p className={styles.subtitle}>無法讀取存檔</p>
        <Alert variant="danger" className="py-2 small mt-2 mb-0">
          {describePlayerError(code)}
        </Alert>
        <p className={`${styles.keySetupHint} mt-2 mb-0`}>錯誤代碼：{code}</p>
        <button
          type="button"
          className={`${styles.btnGold} w-100 mt-3`}
          onClick={onRetry}
        >
          重試
        </button>
        <button
          type="button"
          className={`${styles.btnOutline} w-100 mt-2`}
          onClick={onChangeKey}
        >
          更換金鑰
        </button>
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
  notSaved,
}: {
  result: BattleResultPayload;
  onConfirm: () => void;
  /** 寫入限制中（開戰後才遇到限制）：結果照常顯示，並說明沒有記錄 */
  notSaved?: boolean;
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
        {notSaved && (
          <div className={styles.resultNotSaved} data-testid="result-hold">
            這個分頁的存檔暫停保存，這場的結果與獎勵沒有記錄（見畫面下方的說明）。
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
  const {
    player,
    applyBattleResult,
    initFromGAS,
    isLoading: playerLoading,
    error: playerError,
    writeHold,
  } = usePlayerStore();
  const { config: staticConfig, fetchProgress } = useStaticConfigStore();
  // 讀不到存檔時由錯誤面板切換到金鑰輸入畫面
  const [showKeyEntry, setShowKeyEntry] = useState(false);
  const { sfxEnabled, sfxPolyphony } = useSoundSettingsStore();

  // ── Godot 狀態 ─────────────────────────────────────────────
  const [godotReady, setGodotReady] = useState(false);
  // 遊戲版本：game_ready 的協定版本和網頁相同才送出關卡資料（見 utils/gameEngine）
  const [engineStatus, setEngineStatus] = useState<EngineStatus>("loading");
  // 重新載入遊戲時換一個新的 iframe（舊 iframe 之後送達的訊息一律不採用）
  const [iframeKey, setIframeKey] = useState(0);
  const [engineRetrying, setEngineRetrying] = useState(false);
  const [engineRetried, setEngineRetried] = useState(false);
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
    /** 這個選單屬於哪一場、哪個選單：關閉時帶回，Godot 才恢復速度 */
    ref: DeployMenuRef;
  } | null>(null);
  const [upgradePanel, setUpgradePanel] = useState<any | null>(null);
  // 備戰拆除的狀態（確認中、送出中、不成功的原因；見 utils/towerSell）
  const [towerSell, setTowerSell] = useState<TowerSellState | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResultPayload | null>(
    null
  );
  const [placedHeroIds, setPlacedHeroIds] = useState<string[]>([]);
  // 目前 Godot 關卡的戰鬥：記下屬於哪個帳號、能不能採用結算（見 utils/battleSession）
  const sessionRef = useRef(new BattleSession());

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
  // 已有金鑰、讀取結束但沒有玩家資料：顯示錯誤面板，而不是一直停在載入動畫
  const playerLoadFailed = hasKey && !player && !playerLoading && !!playerError;
  // 更換金鑰成功（載入了玩家資料）後關閉金鑰輸入畫面
  const keyEntryVisible = showKeyEntry && !player;

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

  // ── 帳號切換：目前的關卡屬於切換前的帳號時重新載入 ─────────
  // 戰鬥中與待結算時不能切換（store 會擋下），所以這裡只會發生在備戰中：
  // 舊關卡作廢（之後收到的舊訊息一律不採用），改用目前帳號的隊伍與進度重新載入
  useEffect(() => {
    const session = sessionRef.current;
    const unsubscribe = usePlayerStore.subscribe((state, prev) => {
      if (state.player?.key === prev.player?.key) return;
      const owner = session.owner;
      if (!owner || state.isBattleTicketCurrent(owner)) return;
      leaveBattle(session);
      setPayloadSent(false);
      setBattleStats(null);
      setBattleResult(null);
      setPlacedHeroIds([]);
      setCurrentMapId("");
    });
    return () => {
      unsubscribe();
      leaveBattle(session);
    };
  }, []);

  // ── WebBridge 訊息處理 ──────────────────────────────────────
  const handleMessage = useCallback((event: MessageEvent) => {
    if (!event.data || typeof event.data !== "object") return;
    if (event.data.__godot_bridge !== true) return;
    // 只接受目前這個遊戲 iframe 送來的訊息（重新載入前的舊 iframe、其他視窗送來的都不採用）
    if (event.source !== iframeRef.current?.contentWindow) return;

    switch (event.data.type) {
      case "game_ready":
        setIframeLoading(false);
        // 協定版本不同（舊版遊戲）：不送出關卡資料、不開戰，顯示更新提示
        if (!isCompatibleEngine(event.data)) {
          setEngineStatus("incompatible");
          break;
        }
        setEngineStatus("ready");
        setGodotReady(true);
        break;
      case "update_stats":
        // 只採用目前這一場的狀態（battle_id 不同或缺少的舊訊息不更新畫面，也不影響切換鎖）
        if (!sessionRef.current.onStats(event.data as BattleStats)) break;
        syncBattleLock(sessionRef.current);
        setBattleStats(event.data as BattleStats);
        break;
      case "click_cell": {
        // 只開目前這一場的部署選單。不是這一場的選單不顯示，並立刻送回關閉命令：
        // Godot 只在它仍是目前開著的選單時才恢復速度，過期的不會影響新場次
        const ref = deployMenuRef(
          event.data,
          sessionRef.current.owner?.id ?? null
        );
        if (!ref) {
          if (
            typeof event.data.battle_id === "string" &&
            typeof event.data.menu_id === "number"
          ) {
            iframeRef.current?.contentWindow?.postMessage(
              {
                __godot_bridge: true,
                type: "resume_game",
                battle_id: event.data.battle_id,
                menu_id: event.data.menu_id,
              },
              "*"
            );
          }
          break;
        }
        setPlacementMenu({
          type: event.data.tile_type,
          pos: event.data.screen_pos,
          cell: { x: event.data.cell_x, y: event.data.cell_y },
          ref,
        });
        break;
      }
      case "hide_placement_menu":
        setPlacementMenu(null);
        break;
      case "show_upgrade_panel":
        setUpgradePanel(event.data);
        break;
      case "hide_upgrade_panel":
        setUpgradePanel(null);
        setTowerSell(null);
        break;
      case "tower_sell_result": {
        // 備戰拆除的結果：只採用和目前面板同一場、同一座塔的回覆。成功時關閉面板（金幣等 Godot 的 update_stats）；
        // 不成功時面板換成 Godot 帶回的現在返還金額，並顯示原因
        const d = event.data as TowerSellResult;
        setUpgradePanel((prev: any) => panelAfterSellResult(prev, d));
        setTowerSell((prev) => sellStateAfterResult(prev, d));
        break;
      }
      case "tower_target_changed":
        // 防禦塔的目標優先：只在場次與塔的識別碼都和目前面板相同時，換成 Godot 回傳的實際模式（過期的回覆不採用）
        setUpgradePanel((prev: any) =>
          prev &&
          prev.unit_type === "tower" &&
          prev.battle_id === event.data.battle_id &&
          prev.tower_uid === event.data.tower_uid
            ? { ...prev, target_mode: event.data.target_mode }
            : prev
        );
        break;
      default:
        // 只採用目前這一場（battle_id 相同）、開打後的第一筆結算（舊關卡晚到、重複送達的都不採用）
        if (
          isBattleResultMessage(event.data) &&
          sessionRef.current.onResult(event.data)
        ) {
          syncBattleLock(sessionRef.current);
          setBattleResult(event.data);
          // 結算時 Godot 已結束部署慢速：部署選單一起關閉
          setPlacementMenu(null);
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
      return { ...state, slot: slot.slot, ...heroSkillPayload(slot.hero_id) };
    });

    // 新的一場：綁定目前帳號，battle_id 送進 Godot，舊關卡的訊息之後一律不採用。
    // 寫入限制中沒有戰鬥票（結果無法保存）：不送關卡資料、不開戰，畫面顯示說明
    const ticket = usePlayerStore.getState().beginBattle();
    if (!ticket) return;
    sessionRef.current.begin(ticket);

    const payload: ExpeditionPayload = {
      stage_id: currentMapId,
      battle_id: ticket.id,
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
      return { ...state, slot: slot.slot, ...heroSkillPayload(slot.hero_id) };
    });
    iframeRef.current.contentWindow.postMessage(
      { __godot_bridge: true, type: "update_team", team_list },
      "*"
    );
  }, [staticConfig]);

  // ── 遊戲版本不相符：重新載入遊戲 ──────────────────────────────
  // 只換掉遊戲 iframe（先讓遊戲的 Service Worker 換成最新版本），不重新整理頁面：
  // 玩家存檔、session、待確認的升級與未同步的修改都留在 store。只有玩家按下時才執行，不會自動重試
  const handleReloadEngine = async () => {
    if (engineRetrying) return;
    setEngineRetrying(true);
    leaveBattle(sessionRef.current);
    setGodotReady(false);
    setPayloadSent(false);
    setBattleStats(null);
    setBattleResult(null);
    setPlacedHeroIds([]);
    setPlacementMenu(null);
    setUpgradePanel(null);
    setTowerSell(null);
    await activateLatestGameWorker();
    setEngineStatus("loading");
    setIframeLoading(true);
    setEngineRetried(true);
    setIframeKey((k) => k + 1);
    setEngineRetrying(false);
  };

  // ── 按鈕處理 ────────────────────────────────────────────────
  // 手動暫停中：開戰、切自動、部署、升級、改目標、拆塔的按鈕都停用，這裡再擋一次（Godot 也會拒絕）
  const paused = isPaused(battleStats);
  const handleStartBattle = () => {
    if (!paused) sendToGodot({ type: "start_battle" });
  };
  const handleToggleAuto = () => {
    if (!paused) sendToGodot({ type: "toggle_auto" });
  };

  const handleStageSelected = (mapId: string) => {
    if (!staticConfig || !player) return;
    const map = staticConfig.maps.find((m) => m.map_id === mapId);
    if (!map) return;

    // 部署選單還開著（HUD 在選單上方，可以直接切關）：先照一般的取消關閉，舊選單不留到新的一場
    handleCloseMenu();

    setCurrentMapId(mapId);
    setPayloadSent(false);
    setBattleStats(null);
    setBattleResult(null);
    setPlacedHeroIds([]);
    setShowStageModal(false);
    // 明確離開目前的戰鬥：舊的一場作廢，解除它的帳號切換鎖
    leaveBattle(sessionRef.current);

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
        return { ...state, slot: slot.slot, ...heroSkillPayload(slot.hero_id) };
      });
      // 新的一場（同一關重來也是新的一場）：battle_id 送進 Godot
      const ticket = usePlayerStore.getState().beginBattle();
      if (!ticket) return;
      sessionRef.current.begin(ticket);
      const payload: ExpeditionPayload = {
        stage_id: mapId,
        battle_id: ticket.id,
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
    if (paused || !placementMenu) return;
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

  // 關閉部署選單（取消、點選單外或戰場留邊、部署完成）：帶回這個選單的 battle_id 與編號，
  // Godot 只在它是這一場、目前開著的選單時恢復玩家選的速度
  const handleCloseMenu = () => {
    const ref = placementMenu?.ref;
    setPlacementMenu(null);
    if (ref) {
      sendToGodot({
        type: "resume_game",
        battle_id: ref.battle_id,
        menu_id: ref.menu_id,
      });
    }
  };

  // 戰鬥速度 1×／2×：帶目前這一場的 battle_id，畫面等 Godot 的 update_stats 才改變
  const handleSetSpeed = (speed: GameSpeed) => {
    const battleId = sessionRef.current.owner?.id;
    if (!battleId || !canChangeSpeed(battleStats)) return;
    sendToGodot({ type: "set_game_speed", battle_id: battleId, speed });
  };

  // 手動暫停／繼續：送出目標狀態與目前這一場的 battle_id（不是切換），畫面等 Godot 的 update_stats 才改變
  const handleSetPaused = (next: boolean) => {
    const battleId = sessionRef.current.owner?.id;
    if (!battleId || !canTogglePause(battleStats)) return;
    sendToGodot({ type: "set_paused", battle_id: battleId, paused: next });
  };

  const handleUpgradeUnit = () => {
    if (paused || !upgradePanel) return;
    sendToGodot({ type: "request_upgrade" });
  };

  const handleCloseUpgradePanel = () => {
    setUpgradePanel(null);
    setTowerSell(null);
    sendToGodot({ type: "deselect_unit" });
  };

  // 備戰拆除：先確認；確認後帶回面板上的 battle_id、塔的識別碼與確認時看到的返還金額，由 Godot 驗證並結算
  const handleSellStart = () => {
    if (paused || !upgradePanel?.tower_uid) return;
    setTowerSell({
      battle_id: upgradePanel.battle_id,
      tower_uid: upgradePanel.tower_uid,
      phase: "confirm",
    });
  };

  const handleSellConfirm = (expectedRefund: number) => {
    if (paused || !upgradePanel?.tower_uid) return;
    setTowerSell({
      battle_id: upgradePanel.battle_id,
      tower_uid: upgradePanel.tower_uid,
      phase: "pending",
    });
    sendToGodot({
      type: "sell_tower",
      battle_id: upgradePanel.battle_id,
      tower_uid: upgradePanel.tower_uid,
      expected_refund: expectedRefund,
    });
  };

  // 防禦塔的目標優先：帶回面板上的 battle_id 與塔的識別碼，Godot 確認是同一場、同一座塔才套用
  const handleSetTargetMode = (mode: string) => {
    if (paused || !upgradePanel?.tower_uid) return;
    sendToGodot({
      type: "set_tower_target",
      battle_id: upgradePanel.battle_id,
      tower_uid: upgradePanel.tower_uid,
      mode,
    });
  };

  const handleConfirmResult = () => {
    // 同一場只確認一次（連按不會重複結算）；結算只算給開戰時的帳號
    const taken = sessionRef.current.take();
    if (!taken) return;
    // 結算後這一場由 store 解除鎖並作廢；沒有套用時也離開這一場，不留下鎖
    const settled = applyBattleResult(taken.result, taken.ticket);
    if (!settled.ok) {
      console.warn("[Battle] 結算沒有套用：", settled.error);
      usePlayerStore.getState().endBattle(taken.ticket);
    }
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
      {/* Godot iframe — 不卸載；只有遊戲版本不相符、玩家按下重新載入時才換成新的 iframe。
          遊戲畫面固定 540:720、放進戰場區域的實際寬高（D22）；data-game-stage 是面板定位的可見範圍 */}
      <div className={styles.gamePortraitWrap} data-game-stage>
        {/* 部署選單開著時，戰場的留邊（D24）和選單外一樣是關閉區：只蓋住遊戲畫面以外的留邊，點了照一般的取消關閉 */}
        {placementMenu && (
          <div
            className={styles.stageMenuBackdrop}
            data-testid="stage-menu-backdrop"
            onClick={handleCloseMenu}
          />
        )}
        <div className={styles.gameWrapper}>
          {/* 進場動畫：payload 送出前全程顯示（含 Godot 載入階段） */}
          {!payloadSent &&
            hasKey &&
            !writeHold &&
            !loadTimedOut &&
            !playerLoadFailed &&
            !keyEntryVisible &&
            engineStatus !== "incompatible" && (
              <ThreeKingdomsLoader
                progress={
                  Math.round((fetchProgress / 3) * 50) + (player ? 50 : 0)
                }
              />
            )}

          {/* 寫入限制中不開戰：不送關卡資料，說明原因（見 types 的 MigrationHold） */}
          {writeHold && !payloadSent && !keyEntryVisible && (
            <div className={styles.loadingOverlay} data-testid="battle-hold">
              <p className={styles.loadingText}>
                這個分頁的存檔暫停保存，暫時不能開始戰鬥（見畫面下方的說明）。
              </p>
            </div>
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
          {/* 遊戲版本和網頁不相符：提示更新，不開戰 */}
          {engineStatus === "incompatible" && !keyEntryVisible && (
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
              locked={paused}
            />
          )}
          {upgradePanel && (
            <UpgradePanel
              data={upgradePanel}
              onUpgrade={handleUpgradeUnit}
              onClose={handleCloseUpgradePanel}
              onSetTargetMode={handleSetTargetMode}
              canSell={battleStats?.game_state === GameState.PREP}
              sell={towerSell}
              onSellStart={handleSellStart}
              onSellCancel={() => setTowerSell(null)}
              onSellConfirm={handleSellConfirm}
              locked={paused}
            />
          )}

          {/* 手動暫停中：戰場下方的「已暫停」與「繼續」；結算後不顯示 */}
          {payloadSent && !battleResult && (
            <PauseBadge stats={battleStats} onSet={handleSetPaused} />
          )}
        </div>
      </div>

      {/* HUD 疊加層：寫入限制中沒有開戰，仍顯示 HUD 供查看武將、隊伍與玩家資訊（戰鬥按鈕要有戰況才出現） */}
      {(payloadSent || (writeHold && !!player)) && !battleResult && (
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
                    disabled={
                      battleStats.game_state !== GameState.PREP || paused
                    }
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
                    disabled={paused}
                  >
                    自動
                  </button>
                  <SpeedToggle
                    stats={battleStats}
                    onSelect={handleSetSpeed}
                    variant="hud"
                  />
                  <PauseToggle
                    stats={battleStats}
                    onSet={handleSetPaused}
                    variant="hud"
                  />
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
          notSaved={writeHold}
        />
      )}

      {/* 已有金鑰但讀不到存檔：錯誤原因、重試、更換金鑰 */}
      {playerLoadFailed && !keyEntryVisible && playerError && (
        <PlayerLoadError
          code={playerError}
          onRetry={() => {
            const key = getPlayerKey();
            if (key) void initFromGAS(key);
          }}
          onChangeKey={() => setShowKeyEntry(true)}
        />
      )}

      {/* 金鑰設定（無帳號，或從錯誤面板選擇更換金鑰時全屏擋住） */}
      {!hasKey && <KeySetupView />}
      {hasKey && keyEntryVisible && (
        <KeySetupView
          initialKey={getPlayerKey() ?? ""}
          onCancel={() => setShowKeyEntry(false)}
        />
      )}

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
