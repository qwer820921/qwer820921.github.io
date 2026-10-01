"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Spinner, Modal, Container, Row, Col } from "react-bootstrap";
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
import {
  isPlayable,
  stageAccess,
  stageAccessMessage,
} from "../../utils/stagePlayability";
import { toBattleRecord } from "../../utils/battleReward";
import {
  DeployMenuRef,
  GameSpeed,
  canChangeSpeed,
  canTogglePause,
  deployMenuRef,
  isPaused,
} from "../../utils/gameSpeed";
import {
  panelAfterSellResult,
  sellStateAfterResult,
  TowerSellResult,
  TowerSellState,
} from "../../utils/towerSell";
import EngineUpdatePrompt from "../../components/EngineUpdatePrompt";
import InvalidResultNotice from "../../components/InvalidResultNotice";
import styles from "../../styles/shenmaSanguo.module.css";
import PlacementMenu from "./PlacementMenu";
import UpgradePanel from "./UpgradePanel";
import WaveRejectNotice from "../../components/WaveRejectNotice";
import StageBlockedNotice from "../../components/StageBlockedNotice";
import {
  WaveRejectNotice as WaveRejectData,
  waveRejectNotice,
} from "../../utils/waveReject";
import SpeedToggle from "./SpeedToggle";
import PauseToggle, { PauseBadge } from "./PauseToggle";
import NextWaveEntry from "../../components/NextWaveEntry";
import { BattleTipsPanel, BattleTipsToggle } from "../../components/BattleTips";
import { NextWaveBattle } from "../../utils/nextWave";

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
  // 戰場區域（玩法提示依它判斷擺放位置）與頂部的玩法提示開關（提示收起時焦點交給它）
  const stageRef = useRef<HTMLDivElement>(null);
  const tipsBtnRef = useRef<HTMLButtonElement>(null);
  const { player, applyBattleResult, writeHold } = usePlayerStore();
  const {
    config: staticConfig,
    error: configError,
    loadConfig,
    clearError: clearConfigError,
  } = useStaticConfigStore();
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
    /** 這個選單屬於哪一場、哪個選單：關閉時帶回，Godot 才恢復速度 */
    ref: DeployMenuRef;
  } | null>(null);
  const [upgradePanel, setUpgradePanel] = useState<any | null>(null);
  // 備戰拆除的狀態（確認中、送出中、不成功的原因；見 utils/towerSell）
  const [towerSell, setTowerSell] = useState<TowerSellState | null>(null);
  const [placedHeroIds, setPlacedHeroIds] = useState<string[]>([]);
  // 拒絕開戰的提示（這一波沒有可以出兵的敵人；見 utils/waveReject）：開戰、換一場、結算時清除
  const [waveReject, setWaveReject] = useState<WaveRejectData | null>(null);
  // 這一場送進遊戲的關卡與敵人設定：戰場內的「下一波」用（見 utils/nextWave）
  const [nextWaveBattle, setNextWaveBattle] = useState<NextWaveBattle | null>(
    null
  );
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
    // 直接進入戰鬥頁也用同一份判斷（utils/stagePlayability）：資料未完成、未解鎖、設定裡沒有的關卡
    // 不送關卡資料、不開新的一場，畫面顯示原因與返回關卡選擇
    const target = stageAccess({
      mapId,
      config: staticConfig,
      maxStage: player.max_stage,
    });
    if (!isPlayable(target)) return;
    const map = target.map;
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

    // 新的一場：綁定目前帳號，battle_id 送進 Godot。
    // 寫入限制中沒有戰鬥票（結果無法保存）：不送關卡資料、不開戰，畫面顯示說明
    const ticket = usePlayerStore.getState().beginBattle();
    if (!ticket) return;
    sessionRef.current.begin(ticket);
    // 新的一場：上一場的拒絕開戰提示不適用
    setWaveReject(null);
    setNextWaveBattle({
      battleId: ticket.id,
      map,
      enemies: staticConfig.enemiesConfig,
    });

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
      // 已經開戰（或結算）：拒絕開戰的提示不再適用
      if ((event.data as BattleStats).game_state !== GameState.PREP) {
        setWaveReject(null);
      }
      return;
    }

    if (event.data.type === "wave_rejected") {
      // 拒絕開戰：只顯示這一場的原因（仍在備戰，Godot 沒有扣城血也不結算）
      const notice = waveRejectNotice(
        event.data,
        sessionRef.current.owner?.id ?? null,
        useStaticConfigStore.getState().config?.enemiesConfig
      );
      if (notice) setWaveReject(notice);
      return;
    }

    if (event.data.type === "click_cell") {
      // 只開這一場的部署選單。不是這一場的選單不顯示，並立刻送回關閉命令：
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
        return;
      }
      setPlacementMenu({
        type: event.data.tile_type,
        pos: event.data.screen_pos,
        cell: { x: event.data.cell_x, y: event.data.cell_y },
        ref,
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
      setTowerSell(null);
      return;
    }

    if (event.data.type === "tower_sell_result") {
      // 備戰拆除的結果：只採用和目前面板同一場、同一座塔的回覆。成功時關閉面板（金幣等 Godot 的 update_stats）；
      // 不成功時面板換成 Godot 帶回的現在返還金額，並顯示原因
      const d = event.data as TowerSellResult;
      setUpgradePanel((prev: any) => panelAfterSellResult(prev, d));
      setTowerSell((prev) => sellStateAfterResult(prev, d));
      return;
    }

    if (event.data.type === "tower_target_changed") {
      // 防禦塔的目標優先：只在場次與塔的識別碼都和目前面板相同時，換成 Godot 回傳的實際模式（過期的回覆不採用）
      setUpgradePanel((prev: any) =>
        prev &&
        prev.unit_type === "tower" &&
        prev.battle_id === event.data.battle_id &&
        prev.tower_uid === event.data.tower_uid
          ? { ...prev, target_mode: event.data.target_mode }
          : prev
      );
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
      // 結算時 Godot 已結束部署慢速：部署選單一起關閉
      setPlacementMenu(null);
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
    setWaveReject(null);
    setNextWaveBattle(null);
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

  // 手動暫停中：開戰、切自動、部署、升級、改目標、拆塔的按鈕都停用，這裡再擋一次（Godot 也會拒絕）
  const paused = isPaused(battleStats);

  const handleStartBattle = () => {
    if (paused) return;
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { __godot_bridge: true, type: "start_battle" },
        "*"
      );
    }
  };

  const handleToggleAuto = () => {
    if (paused) return;
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { __godot_bridge: true, type: "toggle_auto" },
        "*"
      );
    }
  };

  const handleSelectUnit = (id: string, category: "hero" | "tower") => {
    if (paused || !placementMenu || !iframeRef.current?.contentWindow) return;

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
    if (paused || !upgradePanel || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { __godot_bridge: true, type: "request_upgrade" },
      "*"
    );
  };

  const handleCloseUpgradePanel = () => {
    setUpgradePanel(null);
    setTowerSell(null);
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { __godot_bridge: true, type: "deselect_unit" },
        "*"
      );
    }
  };

  // 防禦塔的目標優先：帶回面板上的 battle_id 與塔的識別碼，Godot 確認是同一場、同一座塔才套用
  const handleSetTargetMode = (mode: string) => {
    if (paused || !upgradePanel?.tower_uid || !iframeRef.current?.contentWindow)
      return;
    iframeRef.current.contentWindow.postMessage(
      {
        __godot_bridge: true,
        type: "set_tower_target",
        battle_id: upgradePanel.battle_id,
        tower_uid: upgradePanel.tower_uid,
        mode,
      },
      "*"
    );
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
    if (paused || !upgradePanel?.tower_uid || !iframeRef.current?.contentWindow)
      return;
    setTowerSell({
      battle_id: upgradePanel.battle_id,
      tower_uid: upgradePanel.tower_uid,
      phase: "pending",
    });
    iframeRef.current.contentWindow.postMessage(
      {
        __godot_bridge: true,
        type: "sell_tower",
        battle_id: upgradePanel.battle_id,
        tower_uid: upgradePanel.tower_uid,
        expected_refund: expectedRefund,
      },
      "*"
    );
  };

  // 關閉部署選單（取消、點選單外或戰場留邊、部署完成）：帶回這個選單的 battle_id 與編號，
  // Godot 只在它是這一場、目前開著的選單時恢復玩家選的速度
  const handleCloseMenu = () => {
    const ref = placementMenu?.ref;
    setPlacementMenu(null);
    if (ref && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        {
          __godot_bridge: true,
          type: "resume_game",
          battle_id: ref.battle_id,
          menu_id: ref.menu_id,
        },
        "*"
      );
    }
  };

  // 戰鬥速度 1×／2×：帶這一場的 battle_id，畫面等 Godot 的 update_stats 才改變
  const handleSetSpeed = (speed: GameSpeed) => {
    const battleId = sessionRef.current.owner?.id;
    if (!battleId || !canChangeSpeed(battleStats)) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        __godot_bridge: true,
        type: "set_game_speed",
        battle_id: battleId,
        speed,
      },
      "*"
    );
  };

  // 手動暫停／繼續：送出目標狀態與這一場的 battle_id（不是切換），畫面等 Godot 的 update_stats 才改變
  const handleSetPaused = (next: boolean) => {
    const battleId = sessionRef.current.owner?.id;
    if (!battleId || !canTogglePause(battleStats)) return;
    iframeRef.current?.contentWindow?.postMessage(
      {
        __godot_bridge: true,
        type: "set_paused",
        battle_id: battleId,
        paused: next,
      },
      "*"
    );
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

  // 這一關能不能出征（還沒送出關卡資料時才擋；已經在打的一場不受之後的設定更新影響）
  const access = stageAccess({
    mapId,
    config: staticConfig,
    configError,
    maxStage: player?.max_stage ?? null,
  });
  const blocked =
    !payloadSent &&
    (access.status === "config_failed" ||
      (!!player &&
        (access.status === "incomplete" || access.status === "locked")));
  const blockedMessage = blocked
    ? stageAccessMessage(access, {
        progressName:
          staticConfig?.maps.find((m) => m.map_id === player?.max_stage)
            ?.name ?? player?.max_stage,
      })
    : null;

  // Godot 的結算不合規則（和 store 結算時同一個驗證）：結算視窗只說明沒有領取，不顯示星數與獎勵
  const resultInvalid = !!battleResult && !toBattleRecord(battleResult);

  const statusText = payloadSent
    ? battleResult
      ? resultInvalid
        ? "結算異常"
        : battleResult.result === BattleResult.Win
          ? "勝利"
          : "落敗"
      : ""
    : writeHold
      ? "存檔暫停保存"
      : blocked
        ? access.status === "config_failed"
          ? "設定讀取失敗"
          : access.status === "locked"
            ? "尚未解鎖"
            : "尚未開放"
        : iframeLoading
          ? "載入中..."
          : "準備中...";

  return (
    <Container fluid className={styles.battleContainer}>
      <div className={styles.battleLayout}>
        {/* 頂部狀態列 */}
        <div className={styles.battleTopBar}>
          <Row className="g-2 align-items-center">
            <Col xs="auto" className="d-flex align-items-center gap-2">
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
              {/* 玩法提示的開關：放在標題旁（右側的按鈕列在窄螢幕已經放滿） */}
              {battleStats && battleStats.game_state !== GameState.RESULT && (
                <BattleTipsToggle
                  buttonRef={tipsBtnRef}
                  className={styles.topBtn}
                />
              )}
            </Col>
            {battleStats && (
              <Col xs="auto">
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
              </Col>
            )}

            {/* 控制按鈕組 */}
            <Col xs="auto" className="ms-auto d-flex align-items-center gap-2">
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
                <div className="d-flex align-items-center gap-2">
                  <SpeedToggle
                    stats={battleStats}
                    onSelect={handleSetSpeed}
                    variant="top"
                  />
                  <PauseToggle
                    stats={battleStats}
                    onSet={handleSetPaused}
                    variant="top"
                  />
                  {/* 下一波的敵軍：唯讀視窗，不暫停、不開始下一波、不改自動與倍率 */}
                  <NextWaveEntry
                    stats={battleStats}
                    battle={nextWaveBattle}
                    team={player?.team}
                    heroesConfig={staticConfig?.heroesConfig}
                    ended={!!battleResult}
                    buttonClassName={styles.topBtn}
                  />
                  <button
                    className={`${styles.topBtn} ${battleStats.auto_mode ? styles.topBtnActive : ""}`}
                    onClick={handleToggleAuto}
                    disabled={paused}
                    title="自動進入下一波"
                  >
                    自動 {battleStats.auto_mode ? "ON" : "OFF"}
                  </button>
                  <button
                    className={styles.topBtnPrimary}
                    onClick={handleStartBattle}
                    disabled={
                      battleStats.game_state !== GameState.PREP || paused
                    }
                  >
                    {battleStats.game_state === GameState.BATTLE
                      ? "戰鬥中"
                      : "迎戰"}
                  </button>
                </div>
              )}
            </Col>
          </Row>
        </div>

        {/* 玩法提示：戰場出現後才有，結算時不顯示；放在戰場旁邊，不疊在遊戲畫面上。
            DOM 排在戰場前面（畫面上排在後面）：從頂部的開關往後按 Tab 就到提示，不會先進到遊戲畫面裡 */}
        {payloadSent && battleStats && !battleResult && (
          <BattleTipsPanel stageRef={stageRef} toggleRef={tipsBtnRef} />
        )}

        {/* 遊戲 iframe：固定 540:720，放進戰場區域的實際寬高（D22）；data-game-stage 是面板定位的可見範圍 */}
        <div ref={stageRef} className={styles.gamePortraitWrap} data-game-stage>
          {/* 部署選單開著時，戰場的留邊（D24）和選單外一樣是關閉區：只蓋住遊戲畫面以外的留邊，點了照一般的取消關閉 */}
          {placementMenu && (
            <div
              className={styles.stageMenuBackdrop}
              data-testid="stage-menu-backdrop"
              onClick={handleCloseMenu}
            />
          )}
          <div className={styles.gameWrapper}>
            {iframeLoading && !blocked && (
              <div className={styles.loadingOverlay}>
                <Spinner animation="border" variant="light" />
                <p className={styles.loadingText}>載入戰場中...</p>
              </div>
            )}
            {/* 不能出征（關卡資料未完成、未解鎖、遊戲設定讀取失敗）：沒有送出關卡資料、沒有開新的一場 */}
            {blocked && blockedMessage && !writeHold && (
              <StageBlockedNotice
                status={access.status}
                title={blockedMessage.title}
                lines={blockedMessage.lines}
                focusKey={engineStatus}
                actions={[
                  ...(access.status === "config_failed"
                    ? [
                        {
                          label: "重新讀取設定",
                          testId: "stage-blocked-retry",
                          primary: true,
                          onClick: () => {
                            clearConfigError();
                            void loadConfig();
                          },
                        },
                      ]
                    : []),
                  {
                    label: "返回關卡選擇",
                    testId: "stage-blocked-back",
                    primary: access.status !== "config_failed",
                    onClick: () => router.push("/shenmaSanguo/stages"),
                  },
                ]}
              />
            )}
            {/* 寫入限制中不開戰：不送關卡資料，說明原因（見 types 的 MigrationHold） */}
            {writeHold && !payloadSent && !iframeLoading && (
              <div className={styles.loadingOverlay} data-testid="battle-hold">
                <p className={styles.loadingText}>
                  這個分頁的存檔暫停保存，暫時不能開始戰鬥（見畫面下方的說明）。
                </p>
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

            {/* 拒絕開戰：列出原因，出口是回到關卡選擇 */}
            {waveReject && !battleResult && (
              <WaveRejectNotice
                notice={waveReject}
                exitLabel="返回關卡選擇"
                onExit={() => router.push("/shenmaSanguo/stages")}
                onClose={() => setWaveReject(null)}
              />
            )}

            {/* 手動暫停中：戰場下方的「已暫停」與「繼續」；結算後不顯示 */}
            {!battleResult && (
              <PauseBadge stats={battleStats} onSet={handleSetPaused} />
            )}
          </div>
        </div>

        {/* 結算資料異常：不顯示獎勵，說明沒有領取；「返回主選單」照樣作廢這一場（store 回 INVALID_RESULT，不送出） */}
        {battleResult && resultInvalid && (
          <Modal show centered contentClassName="border-0 p-0 bg-transparent">
            <div className={styles.invalidResultCard} data-testid="result-card">
              <div className={styles.invalidResultHeader}>結算異常</div>
              <div className={styles.invalidResultBody}>
                <InvalidResultNotice variant="light" />
                <button
                  className={`${styles.invalidResultBtn} w-100`}
                  onClick={handleConfirmResult}
                >
                  返回主選單
                </button>
              </div>
            </div>
          </Modal>
        )}

        {/* 結算 Modal */}
        {battleResult &&
          !resultInvalid &&
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
                  data-testid="result-card"
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

                    {writeHold && (
                      <div
                        className={styles.resultNotSaved}
                        data-testid="result-hold"
                        style={{ marginBottom: "1rem" }}
                      >
                        這個分頁的存檔暫停保存，這場的結果與獎勵沒有記錄（見畫面下方的說明）。
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
