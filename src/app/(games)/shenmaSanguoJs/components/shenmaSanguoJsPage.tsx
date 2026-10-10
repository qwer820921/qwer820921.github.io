"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import { LocalGameBridge, PlacementMenuData } from "../engine/LocalGameBridge";
import {
  StatsSyncData,
  BattleResultData,
  GameState,
} from "../engine/BattleManager";
import { TowerEntity } from "../engine/entities/TowerEntity";
import { HeroEntity, HeroStateData } from "../engine/entities/HeroEntity";
import {
  BUILTIN_STAGES,
  BUILTIN_HEROES_CONFIG,
  BUILTIN_ENEMIES_CONFIG,
  DEFAULT_PLAYER_HEROES,
  StageData,
} from "../engine/builtinData";
import { StageDataManager } from "../engine/StageDataManager";
import {
  getNextStage,
  getStageDataProblem,
  isStageUnlocked,
} from "../utils/stagePlayability";
import { describePendingStage } from "../utils/sharedSettleDisplay";
import { useJsPlayerStore } from "../store/useJsPlayerStore";
import { BattleRewardResult, TeamSlot } from "../types/player";
import { KeySetupModal } from "./KeySetupModal";
import { PlayerInfoModal } from "./PlayerInfoModal";
import { TeamEditModal } from "./TeamEditModal";
import { HeroRosterModal } from "./HeroRosterModal";
import { SettingsModal } from "./SettingsModal";
import { BattleCanvasView } from "./BattleCanvasView";
import { PlacementMenuModal } from "./PlacementMenuModal";
import { UpgradePanelModal } from "./UpgradePanelModal";
import { HeroInfoModal } from "./HeroInfoModal";
import { BattleResultModal } from "./BattleResultModal";
import { StageSelectorModal } from "./StageSelectorModal";
import { BattleTips } from "./BattleTips";
import { NextWaveModal } from "./NextWaveModal";
import styles from "../styles/shenmaSanguoJs.module.css";

/** 關卡、武將與敵人設定都已讀到後端（或它的快取），不是內建的代用資料 */
const isRemoteConfig = (mgr: StageDataManager) =>
  mgr.getStages() !== BUILTIN_STAGES &&
  mgr.getHeroesConfig() !== BUILTIN_HEROES_CONFIG &&
  mgr.getEnemiesConfig() !== BUILTIN_ENEMIES_CONFIG;

const DEFAULT_STATS: StatsSyncData = {
  battle_id: "",
  gold: 5000,
  wave: 0,
  total_waves: 5,
  hp: 20,
  max_hp: 20,
  game_state: GameState.PREP,
  auto_mode: false,
  auto_next_wave_pending: false,
  speed: 1,
  time_scale: 1,
  deploy_slow: false,
  paused: false,
};

const ShenmaSanguoJsPage: React.FC = () => {
  const bridgeRef = useRef<LocalGameBridge | null>(null);
  const canvasElementRef = useRef<HTMLCanvasElement | null>(null);
  const containerSizeRef = useRef<{ w: number; h: number } | null>(null);

  // 玩家存檔與帳號狀態 (Zustand)
  const {
    player,
    syncStatus,
    hasCheckedStorage,
    init: initPlayer,
    loginWithKey,
    createProfile,
    startGuestMode,
    logout,
    updateNickname,
    updateTeam,
    requestHeroUpgrade,
    upgradePreview,
    heroCostOf,
    settleBattle,
    forceSync,
    exportBackup,
    importBackup,
    mode,
    readOnly,
    teamEditable,
    notice,
    busy,
    writeBlocked,
    pendingCreateKey,
    error: accountError,
    settleArmed,
    sortieNote,
    settleView,
    pendingSettle,
    retrySharedSettle,
  } = useJsPlayerStore();

  // 共用帳號不能寫入的原因（唯讀、結果待確認、正在保存）；訪客沒有限制
  const writeBlockReason =
    mode !== "shared"
      ? null
      : readOnly
        ? "雲端存檔目前只能查看，不能寫入"
        : pendingSettle
          ? pendingSettle.status === "unavailable"
            ? "瀏覽器的暫存讀不到，暫時不能寫入"
            : pendingSettle.status === "review"
              ? "有一場戰鬥結算要人工確認，確認前不能寫入"
              : "有一場戰鬥結算待確認：請先按「重新確認」"
          : writeBlocked
            ? "上一個保存的結果不明：請先在主公資訊按「手動同步」確認"
            : busy
              ? "正在保存，請稍候"
              : settleArmed
                ? "出征中：這場結算完成前不能修改共用存檔"
                : null;
  // 待確認結算是哪一關：只用暫存記下的關卡 ID（不是目前選中的關卡）；關卡名稱確認來自後端才顯示名稱
  const pendingStageLabel =
    mode === "shared" && pendingSettle
      ? describePendingStage(
          pendingSettle,
          StageDataManager.getInstance().getStages(),
          StageDataManager.getInstance().hasConfirmedStageNames()
        )
      : null;
  const teamBlockReason =
    writeBlockReason ??
    (mode === "shared" && !teamEditable
      ? "雲端的出征隊伍這裡還不支援：原樣保留，暫時不能在這裡修改"
      : null);
  // 共用帳號不能出征的原因：雲端隊伍不支援，或還沒有隊伍（不自動換成預設隊伍）
  const sortieBlockReason =
    mode !== "shared" || !player
      ? null
      : !teamEditable
        ? "雲端的出征隊伍這裡還不支援：暫時不能出征"
        : player.team.length === 0
          ? "還沒有出征隊伍：請先到「隊伍」編排並保存"
          : null;

  // 戰鬥狀態管理
  const [stats, setStats] = useState<StatsSyncData>(DEFAULT_STATS);
  const [allStages, setAllStages] = useState<StageData[]>(BUILTIN_STAGES);
  const [currentStage, setCurrentStage] = useState<StageData>(
    BUILTIN_STAGES[0]
  );
  const [placementMenu, setPlacementMenu] = useState<PlacementMenuData | null>(
    null
  );
  const [upgradeTower, setUpgradeTower] = useState<TowerEntity | null>(null);
  const [heroInfo, setHeroInfo] = useState<HeroEntity | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResultData | null>(
    null
  );
  const [battleReward, setBattleReward] = useState<BattleRewardResult | null>(
    null
  );
  const [placedHeroIds, setPlacedHeroIds] = useState<string[]>([]);

  // 視窗 Modal 顯示狀態
  const [isStageSelectorOpen, setIsStageSelectorOpen] = useState(false);
  const [isPlayerInfoOpen, setIsPlayerInfoOpen] = useState(false);
  const [isTeamEditOpen, setIsTeamEditOpen] = useState(false);
  const [isHeroRosterOpen, setIsHeroRosterOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isKeySwitchOpen, setIsKeySwitchOpen] = useState(false);
  const [isBattleTipsOpen, setIsBattleTipsOpen] = useState(false);
  const [isNextWaveOpen, setIsNextWaveOpen] = useState(false);

  // 音訊靜音狀態
  const [isBgmMuted, setIsBgmMuted] = useState(false);
  const [isSfxMuted, setIsSfxMuted] = useState(false);

  // 初始化玩家存檔
  useEffect(() => {
    void initPlayer();
  }, [initPlayer]);

  // 當前出征隊伍武將名單（嚴格取自 player.team 與 player.heroes；數值 0 照樣是 0）。
  // 共用帳號沒有隊伍或隊伍不支援時是空的（不自動換成預設隊伍）；訪客或尚未登入時照原本的預設展示
  const activeTeamHeroes: HeroStateData[] = useMemo(() => {
    if (
      !player ||
      !player.team ||
      player.team.length === 0 ||
      (mode === "shared" && !teamEditable)
    ) {
      return mode === "shared" ? [] : DEFAULT_PLAYER_HEROES;
    }
    return player.team.map((slot) => {
      const heroState = player.heroes.find((h) => h.hero_id === slot.hero_id);
      return {
        hero_id: slot.hero_id,
        level: heroState?.level ?? 1,
        star: heroState?.star ?? 1,
        atk: heroState?.atk ?? 100,
        def: heroState?.def ?? 50,
        hp: heroState?.hp ?? 1000,
      };
    });
  }, [player, mode, teamEditable]);

  const currentStageRef = useRef<StageData>(BUILTIN_STAGES[0]);
  const statsRef = useRef<StatsSyncData>(stats);
  const activeTeamHeroesRef = useRef<HeroStateData[]>(activeTeamHeroes);
  // 目前載入的這一場：每次 loadStage 產生一個 battleId，開戰與結算都用同一個（共用帳號在第一次進入戰鬥時固定）
  const battleCtxRef = useRef<{
    battleId: string;
    stageId: string;
    /** 這場用的是後端的關卡、武將與敵人設定 */
    configReady: boolean;
    /** 載入時這一關還沒解鎖（只能從自由演練進來） */
    practice: boolean;
    armTried: boolean;
  } | null>(null);
  const battleSeqRef = useRef(0);
  const [settleRetryMsg, setSettleRetryMsg] = useState<string | null>(null);

  /**
   * 載入一場（初始、遠端設定就緒、換關、調隊備戰、下一關、重新挑戰都經過這裡）：產生新的 battleId、
   * 記下這場是否用後端設定與是否為自由演練，放下上一場還沒結束的固定
   */
  const loadBattle = useCallback(
    (stage: StageData, playerHeroes: HeroStateData[], builtin = false) => {
      const bridge = bridgeRef.current;
      if (!bridge) return;
      const mgr = StageDataManager.getInstance();
      const battleId = `battle_${Date.now()}_${++battleSeqRef.current}`;
      const st = useJsPlayerStore.getState();
      const c = st.canonical;
      battleCtxRef.current = {
        battleId,
        stageId: stage.map_id,
        configReady:
          !builtin && isRemoteConfig(mgr) && mgr.getStages().includes(stage),
        practice:
          st.mode === "shared" &&
          !isStageUnlocked(
            stage.map_id,
            typeof c?.max_stage === "string" ? c.max_stage : undefined,
            c?.cleared_stages as Record<string, number> | undefined
          ),
        armTried: false,
      };
      st.disarmSharedSettle();
      bridge.loadStage({
        stageId: stage.map_id,
        battleId,
        totalWaves: stage.waves.length,
        pathJson: stage.path_json,
        waves: stage.waves,
        heroesConfig: builtin ? BUILTIN_HEROES_CONFIG : mgr.getHeroesConfig(),
        enemiesConfig: builtin
          ? BUILTIN_ENEMIES_CONFIG
          : mgr.getEnemiesConfig(),
        playerHeroes,
      });
    },
    []
  );

  useEffect(() => {
    currentStageRef.current = currentStage;
  }, [currentStage]);

  useEffect(() => {
    statsRef.current = stats;
  }, [stats]);

  useEffect(() => {
    activeTeamHeroesRef.current = activeTeamHeroes;
  }, [activeTeamHeroes]);

  // 載入關卡（由關卡選擇視窗、結算下一關或重新挑戰觸發）
  const loadStageData = useCallback(
    (stage: StageData) => {
      if (getStageDataProblem(stage)) {
        console.warn("[ShenmaSanguoJs] 嘗試載入未開放關卡:", stage.map_id);
        setIsStageSelectorOpen(true);
        return;
      }

      setCurrentStage(stage);
      currentStageRef.current = stage;
      setPlacementMenu(null);
      setUpgradeTower(null);
      setHeroInfo(null);
      setBattleResult(null);
      setBattleReward(null);
      setPlacedHeroIds([]);

      loadBattle(stage, activeTeamHeroesRef.current);
    },
    [loadBattle]
  );

  // 初始化 Bridge 實例（只在 mount 時建立一次，避免因 stats 或 currentStage 變更而重複重建）
  useEffect(() => {
    const bridge = new LocalGameBridge();
    bridgeRef.current = bridge;

    bridge.onStatsChanged = (s) => {
      setStats(s);
      // 共用帳號：這一場第一次進入戰鬥時固定（按進入戰場、自動、下一波都一樣），每場只試一次
      const ctx = battleCtxRef.current;
      if (
        ctx &&
        !ctx.armTried &&
        s.game_state === GameState.BATTLE &&
        s.battle_id === ctx.battleId
      ) {
        ctx.armTried = true;
        const mgr = StageDataManager.getInstance();
        const remote = ctx.configReady && isRemoteConfig(mgr);
        useJsPlayerStore.getState().armSharedSettle({
          battleId: ctx.battleId,
          stageId: ctx.stageId,
          configReady: remote,
          completeStageIds: new Set(
            remote
              ? mgr
                  .getStages()
                  .filter((x) => !getStageDataProblem(x))
                  .map((x) => x.map_id)
              : []
          ),
          practice: ctx.practice,
        });
      }
    };
    bridge.onPlacementMenuOpen = (m) => setPlacementMenu(m);
    bridge.onUpgradePanelOpen = (tw) => setUpgradeTower(tw);
    bridge.onHeroInfoOpen = (h) => setHeroInfo(h);

    bridge.onBattleEnded = (r) => {
      // 只處理目前載入的這一場（舊場次晚到的回呼不改畫面、不結算）
      const ctx = battleCtxRef.current;
      if (!ctx || !r || r.battle_id !== ctx.battleId) return;
      setBattleResult(r);
      setSettleRetryMsg(null);
      const store = useJsPlayerStore.getState();
      if (store.mode === "shared") {
        // 共用帳號：只用引擎回呼的凍結結果（星數、點數、擊殺、時間）結算，獎勵由後端計算
        setBattleReward(null);
        void store.settleSharedBattle(r);
      } else if (r.result === "WIN") {
        const reward = settleBattle(
          currentStageRef.current.map_id,
          statsRef.current.hp,
          statsRef.current.max_hp
        );
        setBattleReward(reward);
      } else {
        setBattleReward(null);
      }
    };

    // 若畫布已掛載，立即初始化與縮放
    if (canvasElementRef.current) {
      bridge.init(canvasElementRef.current);
      if (containerSizeRef.current) {
        bridge.resize(containerSizeRef.current.w, containerSizeRef.current.h);
      }
    }

    // 初始載入當前關卡（內建的代用設定：這場不寫入共用進度）
    loadBattle(currentStageRef.current, activeTeamHeroesRef.current, true);

    if (typeof window !== "undefined") {
      (window as unknown as { __testBridge?: LocalGameBridge }).__testBridge =
        bridge;
    }

    // 非同步讀取完整地圖庫清單以供關卡選擇
    const stageMgr = StageDataManager.getInstance();
    void stageMgr.loadAllStages().then((res) => {
      if (res.stages && res.stages.length > 0) {
        setAllStages(res.stages);
        const match = res.stages.find(
          (s) => s.map_id === currentStageRef.current.map_id
        );
        if (match) {
          setCurrentStage(match);
          // 遠端設定就緒：還沒開打時改用後端的資料重新載入這一關（新的 battleId）
          const cur = statsRef.current;
          if (
            bridgeRef.current === bridge &&
            cur.game_state === GameState.PREP &&
            cur.wave === 0 &&
            !cur.paused
          ) {
            currentStageRef.current = match;
            loadBattle(match, activeTeamHeroesRef.current);
          }
        }
      }
    });

    return () => {
      if (typeof window !== "undefined") {
        delete (window as unknown as { __testBridge?: LocalGameBridge })
          .__testBridge;
      }
      bridge.destroy();
      bridgeRef.current = null;
    };
  }, [settleBattle, loadBattle]);

  // 當隊伍陣容變更且處於備戰階段時，平滑更新戰場武將陣容
  useEffect(() => {
    if (bridgeRef.current && stats.game_state === GameState.PREP) {
      loadBattle(currentStageRef.current, activeTeamHeroes);
    }
  }, [activeTeamHeroes, stats.game_state, loadBattle]);

  // 畫布回調
  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasElementRef.current = canvas;
    if (bridgeRef.current) {
      bridgeRef.current.init(canvas);
      if (containerSizeRef.current) {
        bridgeRef.current.resize(
          containerSizeRef.current.w,
          containerSizeRef.current.h
        );
      }
    }
  }, []);

  const handleResize = useCallback((width: number, height: number) => {
    if (width > 0 && height > 0) {
      containerSizeRef.current = { w: width, h: height };
    }
    bridgeRef.current?.resize(width, height);
  }, []);

  // 控制操作（共用帳號的隊伍不支援或沒有隊伍時不能出征）
  const handleStartBattle = () => {
    if (sortieBlockReason) return;
    bridgeRef.current?.startBattle();
  };

  const handleToggleAuto = () => {
    bridgeRef.current?.toggleAuto();
  };

  const handleSetSpeed = (speed: number) => {
    bridgeRef.current?.setSpeed(speed);
  };

  const handleTogglePause = () => {
    bridgeRef.current?.togglePause();
  };

  const handleToggleBgm = () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    const nextMuted = !isBgmMuted;
    bridge.setBgmMuted(nextMuted);
    setIsBgmMuted(nextMuted);
  };

  const handleToggleSfx = () => {
    const bridge = bridgeRef.current;
    if (!bridge) return;
    const nextMuted = !isSfxMuted;
    bridge.setSfxMuted(nextMuted);
    setIsSfxMuted(nextMuted);
  };

  // 建造與放置操作
  const handlePlaceTower = (col: number, row: number, typeKey: string) => {
    bridgeRef.current?.placeTower(col, row, typeKey);
  };

  const handlePlaceHero = (
    col: number,
    row: number,
    heroState: HeroStateData
  ) => {
    const success = bridgeRef.current?.placeHero(col, row, heroState);
    if (success) {
      setPlacedHeroIds((prev) => [...prev, heroState.hero_id]);
    }
  };

  const handleUpgradeTower = (col: number, row: number) => {
    bridgeRef.current?.upgradeTower(col, row);
  };

  const handleSellTower = (col: number, row: number) => {
    bridgeRef.current?.sellTower(col, row);
  };

  const handleTargetModeChange = (col: number, row: number, mode: string) => {
    bridgeRef.current?.setTowerTargetMode(col, row, mode);
  };

  // 結算後操作
  const handleRetry = () => {
    setBattleResult(null);
    setBattleReward(null);
    loadStageData(currentStage);
  };

  // 下一關：資料完整才算存在；共用帳號另外要在雲端已確認的進度裡已解鎖（這場的結算讀回確認後才會更新）
  const nextStageCandidate = useMemo(() => {
    const nextMapId = getNextStage(currentStage.map_id);
    const nextStage = allStages.find((s) => s.map_id === nextMapId);
    return nextStage && !getStageDataProblem(nextStage) ? nextStage : null;
  }, [allStages, currentStage.map_id]);
  const nextStageUnlocked =
    !!nextStageCandidate &&
    (mode !== "shared" ||
      isStageUnlocked(
        nextStageCandidate.map_id,
        player?.max_stage,
        player?.cleared_stages
      ));
  const hasNextPlayableStage = !!nextStageCandidate && nextStageUnlocked;

  const handleNextStage = () => {
    setBattleResult(null);
    setBattleReward(null);
    if (nextStageCandidate && nextStageUnlocked) {
      loadStageData(nextStageCandidate);
    } else {
      setIsStageSelectorOpen(true);
    }
  };

  // 隊伍保存（共用帳號等伺服器回應）；成功後畫面的隊伍更新，備戰中會重新傳給 Bridge
  const handleSaveTeam = (newTeam: TeamSlot[]) => updateTeam(newTeam);

  // 共用帳號：使用者明確按「重新確認」才原樣再送待確認的結算（不自動重送）
  const handleRetrySettle = async () => {
    setSettleRetryMsg(null);
    const res = await retrySharedSettle();
    if (!res.success) setSettleRetryMsg(res.error ?? "這次沒有確認");
  };
  const resultSettleView =
    mode === "shared" &&
    battleResult &&
    settleView &&
    settleView.battleId === battleResult.battle_id
      ? settleView
      : null;

  return (
    <div className={styles.singlePage}>
      {/* 3:4 直式遊戲框戰場區域 */}
      <div className={styles.gamePortraitWrap} data-game-stage>
        <div className={styles.gameWrapper}>
          <BattleCanvasView
            onCanvasReady={handleCanvasReady}
            onResize={handleResize}
          />

          {/* 備戰階段中央金屬「進入戰場」圓形迎戰徽章 */}
          {stats.game_state === GameState.PREP && !stats.paused && (
            <button
              type="button"
              className={styles.centerEnterBattleBtn}
              onClick={handleStartBattle}
              title={sortieBlockReason ?? "開始戰鬥"}
              aria-label="進入戰場"
              disabled={sortieBlockReason !== null}
              data-testid="enter-battle"
            >
              <div className={styles.centerEnterBattleInner}>
                <span>進入</span>
                <span>戰場</span>
              </div>
            </button>
          )}

          {/* 暫停狀態懸浮標籤 */}
          {stats.paused && (
            <div className={styles.pauseBadge}>
              <span>⏸ 已暫停</span>
              <button
                type="button"
                className={styles.pauseBadgeBtn}
                onClick={handleTogglePause}
              >
                繼續
              </button>
            </div>
          )}

          {/* 戰場部署選單 */}
          {placementMenu && (
            <PlacementMenuModal
              show={placementMenu !== null}
              data={placementMenu}
              currentGold={stats.gold}
              playerHeroes={activeTeamHeroes}
              placedHeroIds={placedHeroIds}
              onPlaceTower={handlePlaceTower}
              onPlaceHero={handlePlaceHero}
              onClose={() => setPlacementMenu(null)}
            />
          )}

          {/* 防禦塔強化/拆除選單 */}
          {upgradeTower && (
            <UpgradePanelModal
              show={upgradeTower !== null}
              tower={upgradeTower}
              currentGold={stats.gold}
              isPrepPhase={stats.game_state === GameState.PREP}
              onUpgrade={handleUpgradeTower}
              onSell={handleSellTower}
              onTargetModeChange={handleTargetModeChange}
              onClose={() => setUpgradeTower(null)}
            />
          )}

          {/* 已部署武將詳情 */}
          {heroInfo && (
            <HeroInfoModal
              show={heroInfo !== null}
              hero={heroInfo}
              onClose={() => setHeroInfo(null)}
            />
          )}
        </div>
      </div>

      {/* 頂部 HUD 狀態列 */}
      <div className={styles.hudTopBar}>
        <button
          type="button"
          className={styles.hudAvatar}
          onClick={() => setIsPlayerInfoOpen(true)}
          title="主公資訊"
          aria-label="主公資訊"
        >
          👤
        </button>
        <div className={styles.hudCenter}>
          <button
            type="button"
            className={styles.hudStageBtn}
            onClick={() => setIsStageSelectorOpen(true)}
            title="切換關卡"
          >
            🗺️
          </button>
          <span className={styles.hudMapName}>
            {currentStage?.name || "未知戰役"}
          </span>
          <span className={styles.hudWave}>
            {stats.wave}/{stats.total_waves}
          </span>
        </div>
        <div className={styles.hudRight}>
          <span className={styles.hudStat}>
            <span style={{ color: "#f59e0b" }}>🪙</span>
            <span>{stats.gold.toLocaleString()}</span>
          </span>
          <span
            className={styles.hudStat}
            style={{
              color:
                stats.hp / stats.max_hp < 0.3
                  ? "#ef4444"
                  : "rgba(255,255,255,0.9)",
            }}
          >
            <span
              style={{
                color: stats.hp / stats.max_hp < 0.3 ? "#ef4444" : "#6366f1",
              }}
            >
              🛡️
            </span>
            <span>
              {stats.hp}/{stats.max_hp}
            </span>
          </span>
          <button
            type="button"
            className={styles.hudStageBtn}
            onClick={() => setIsBattleTipsOpen(!isBattleTipsOpen)}
            title={isBattleTipsOpen ? "收起玩法提示" : "玩法提示"}
          >
            ❓
          </button>
          <button
            type="button"
            className={styles.hudStageBtn}
            onClick={() => setIsSettingsOpen(true)}
            title="系統設定"
          >
            ⚙️
          </button>
        </div>
      </div>

      {/* 操作子按鈕列 */}
      <div className={styles.hudActionBar}>
        <div className={styles.hudActionBarLeft}>
          <button
            type="button"
            className={`${styles.hudBarBtn} ${stats.game_state === GameState.BATTLE ? styles.hudBarBtnBattle : ""}`}
            onClick={handleStartBattle}
            disabled={
              stats.game_state !== GameState.PREP ||
              stats.paused ||
              sortieBlockReason !== null
            }
            title={sortieBlockReason ?? undefined}
            data-testid="hud-start-battle"
          >
            {stats.game_state === GameState.BATTLE ? "戰鬥中" : "迎戰"}
          </button>
          <button
            type="button"
            className={`${styles.hudBarBtn} ${stats.auto_mode ? styles.hudActionBtnActive : ""}`}
            onClick={handleToggleAuto}
            disabled={stats.paused}
          >
            自動
          </button>
          <div
            style={{
              display: "inline-flex",
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid rgba(255, 255, 255, 0.18)",
            }}
          >
            <button
              type="button"
              className={`${styles.hudBarBtn} ${stats.speed === 1 ? styles.hudActionBtnActive : ""}`}
              style={{ borderRadius: 0, border: "none", padding: "0 8px" }}
              onClick={() => handleSetSpeed(1)}
              disabled={stats.paused}
            >
              1x
            </button>
            <button
              type="button"
              className={`${styles.hudBarBtn} ${stats.speed === 2 ? styles.hudActionBtnActive : ""}`}
              style={{
                borderRadius: 0,
                border: "none",
                borderLeft: "1px solid rgba(255, 255, 255, 0.18)",
                padding: "0 8px",
              }}
              onClick={() => handleSetSpeed(2)}
              disabled={stats.paused}
            >
              2x
            </button>
          </div>
          <button
            type="button"
            className={styles.hudBarBtn}
            onClick={handleTogglePause}
          >
            {stats.paused ? "▶ 繼續" : "⏸ 暫停"}
          </button>
          <button
            type="button"
            className={styles.hudBarBtn}
            onClick={() => setIsNextWaveOpen(true)}
          >
            ⏳ 下一波
          </button>
        </div>
        <div className={styles.hudActionBarRight}>
          <button
            type="button"
            className={styles.hudBarBtn}
            onClick={() => setIsHeroRosterOpen(true)}
          >
            武將
          </button>
          <button
            type="button"
            className={styles.hudBarBtn}
            onClick={() => setIsTeamEditOpen(true)}
          >
            隊伍
          </button>
        </div>
      </div>

      {/* 共用帳號的說明：不能出征的原因與存檔的狀態（唯讀、衝突、結果待確認、不支援的資料） */}
      {mode === "shared" &&
        (sortieBlockReason ||
          notice ||
          sortieNote ||
          pendingSettle ||
          (settleView?.phase === "confirmed" && !battleResult)) && (
          <div
            className="small text-warning px-2 py-1"
            data-testid="shared-account-notice"
          >
            {sortieBlockReason && (
              <div data-testid="sortie-blocked">{sortieBlockReason}</div>
            )}
            {sortieNote && (
              <div data-testid="sortie-settle-note">{sortieNote}</div>
            )}
            {notice && <div>{notice}</div>}
            {/* 待確認的這一場是哪一關（只是資訊，沒有操作） */}
            {pendingStageLabel && (
              <div data-testid="settle-stage">{pendingStageLabel.text}</div>
            )}
            {/* 重新確認後的結果（結算視窗關掉之後） */}
            {!pendingSettle &&
              !battleResult &&
              settleView &&
              settleView.phase === "confirmed" && (
                <div data-testid="settle-confirmed">{settleView.text}</div>
              )}
            {pendingSettle?.status === "pending" && !battleResult && (
              <div data-testid="settle-pending">
                {settleView && settleView.phase !== "saving" && (
                  <span data-testid="settle-pending-status">
                    {settleView.text}
                  </span>
                )}
                <button
                  type="button"
                  className="btn btn-sm btn-outline-warning ms-2"
                  onClick={() => void handleRetrySettle()}
                  disabled={busy}
                  data-testid="settle-retry"
                >
                  重新確認
                </button>
                {settleRetryMsg && (
                  <div data-testid="settle-retry-feedback">
                    {settleRetryMsg}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

      {/* 懸浮玩法提示 */}
      {isBattleTipsOpen && (
        <BattleTips onClose={() => setIsBattleTipsOpen(false)} />
      )}

      {/* 下一波軍情情報彈窗 */}
      <NextWaveModal
        show={isNextWaveOpen}
        waveIndex={stats.wave}
        totalWaves={stats.total_waves}
        waves={currentStage.waves}
        onClose={() => setIsNextWaveOpen(false)}
      />

      {/* 首次進入/尚未登入之金鑰設定視窗 (強制登入或訪客) */}
      <KeySetupModal
        show={hasCheckedStorage && !player}
        onLogin={loginWithKey}
        onCreate={createProfile}
        onGuestMode={startGuestMode}
        canCancel={false}
        initialKey={pendingCreateKey}
        initialError={accountError}
      />

      {/* 切換金鑰彈窗 (自設定或主公資訊開啟) */}
      {isKeySwitchOpen && (
        <KeySetupModal
          show={isKeySwitchOpen}
          onLogin={async (k) => {
            const res = await loginWithKey(k);
            if (res.success) setIsKeySwitchOpen(false);
            return res;
          }}
          onCreate={async (k, n) => {
            const res = await createProfile(k, n);
            if (res.success) setIsKeySwitchOpen(false);
            return res;
          }}
          onGuestMode={async () => {
            await startGuestMode();
            setIsKeySwitchOpen(false);
          }}
          onClose={() => setIsKeySwitchOpen(false)}
          canCancel={true}
        />
      )}

      {/* 主公資訊視窗 */}
      <PlayerInfoModal
        show={isPlayerInfoOpen}
        player={player}
        syncStatus={syncStatus}
        onClose={() => setIsPlayerInfoOpen(false)}
        onUpdateNickname={updateNickname}
        onSwitchKey={loginWithKey}
        onCreateProfile={createProfile}
        onGuestMode={startGuestMode}
        onForceSync={forceSync}
        mode={mode}
        notice={mode === "shared" ? notice : null}
        writeDisabledReason={writeBlockReason}
        onOpenStageSelector={() => {
          setIsPlayerInfoOpen(false);
          setIsStageSelectorOpen(true);
        }}
        onLogout={logout}
      />

      {/* 5 席出征隊伍編排視窗 */}
      <TeamEditModal
        show={isTeamEditOpen}
        player={player}
        onClose={() => setIsTeamEditOpen(false)}
        onSaveTeam={handleSaveTeam}
        heroCostOf={mode === "shared" ? heroCostOf : undefined}
        writeDisabledReason={teamBlockReason}
      />

      {/* 武將名錄與修為升級視窗 */}
      <HeroRosterModal
        show={isHeroRosterOpen}
        player={player}
        onClose={() => setIsHeroRosterOpen(false)}
        onUpgradeHero={requestHeroUpgrade}
        upgradePreview={upgradePreview}
        writeDisabledReason={writeBlockReason}
        serverPriced={mode === "shared"}
      />

      {/* 系統設定與存檔備份視窗 */}
      <SettingsModal
        show={isSettingsOpen}
        isBgmMuted={isBgmMuted}
        isSfxMuted={isSfxMuted}
        onToggleBgm={handleToggleBgm}
        onToggleSfx={handleToggleSfx}
        onExportBackup={exportBackup}
        onImportBackup={importBackup}
        importDisabledReason={
          mode === "shared"
            ? "共用帳號不能用匯入覆蓋雲端存檔（可以匯出備份）。"
            : null
        }
        onSwitchKey={() => {
          setIsSettingsOpen(false);
          logout();
        }}
        onLogout={() => {
          setIsSettingsOpen(false);
          logout();
        }}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* 戰役勝負結算視窗 */}
      <BattleResultModal
        show={battleResult !== null}
        result={battleResult}
        rewardResult={battleReward}
        sharedSettle={resultSettleView}
        onRetrySettle={() => void handleRetrySettle()}
        retryDisabled={busy}
        retryMessage={resultSettleView ? settleRetryMsg : null}
        hasNextStage={hasNextPlayableStage}
        nextLocked={!!nextStageCandidate && !nextStageUnlocked}
        onRetry={handleRetry}
        onNextStage={handleNextStage}
        onOpenStageSelector={() => {
          setBattleResult(null);
          setBattleReward(null);
          setIsStageSelectorOpen(true);
        }}
      />

      {/* 軍情關卡選擇地圖 */}
      <StageSelectorModal
        show={isStageSelectorOpen}
        stages={allStages}
        currentStageId={currentStage.map_id}
        maxStageId={player?.max_stage}
        clearedStages={player?.cleared_stages}
        onSelectStage={loadStageData}
        onClose={() => setIsStageSelectorOpen(false)}
      />
    </div>
  );
};

export default ShenmaSanguoJsPage;
