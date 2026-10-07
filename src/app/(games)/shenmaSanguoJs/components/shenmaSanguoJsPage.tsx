"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { LocalGameBridge, PlacementMenuData } from "../engine/LocalGameBridge";
import { StatsSyncData, BattleResultData, GameState } from "../engine/BattleManager";
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
import { getNextStage, getStageDataProblem } from "../utils/stagePlayability";
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
    startGuestMode,
    logout,
    updateNickname,
    updateTeam,
    upgradeHero,
    settleBattle,
    forceSync,
    exportBackup,
    importBackup,
  } = useJsPlayerStore();

  // 戰鬥狀態管理
  const [stats, setStats] = useState<StatsSyncData>(DEFAULT_STATS);
  const [allStages, setAllStages] = useState<StageData[]>(BUILTIN_STAGES);
  const [currentStage, setCurrentStage] = useState<StageData>(BUILTIN_STAGES[0]);
  const [placementMenu, setPlacementMenu] = useState<PlacementMenuData | null>(null);
  const [upgradeTower, setUpgradeTower] = useState<TowerEntity | null>(null);
  const [heroInfo, setHeroInfo] = useState<HeroEntity | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResultData | null>(null);
  const [battleReward, setBattleReward] = useState<BattleRewardResult | null>(null);
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

  // 當前出征隊伍武將名單（嚴格取自 player.team 與 player.heroes）
  const activeTeamHeroes: HeroStateData[] = useMemo(() => {
    if (!player || !player.team || player.team.length === 0) {
      return DEFAULT_PLAYER_HEROES;
    }
    return player.team.map((slot) => {
      const heroState = player.heroes.find((h) => h.hero_id === slot.hero_id);
      return {
        hero_id: slot.hero_id,
        level: heroState?.level || 1,
        star: heroState?.star || 1,
        atk: heroState?.atk || 100,
        def: heroState?.def || 50,
        hp: heroState?.hp || 1000,
      };
    });
  }, [player]);

  const currentStageRef = useRef<StageData>(BUILTIN_STAGES[0]);
  const statsRef = useRef<StatsSyncData>(stats);
  const activeTeamHeroesRef = useRef<HeroStateData[]>(activeTeamHeroes);

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
  const loadStageData = useCallback((stage: StageData) => {
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

    const stageMgr = StageDataManager.getInstance();
    bridgeRef.current?.loadStage({
      stageId: stage.map_id,
      battleId: `battle_${Date.now()}`,
      totalWaves: stage.waves.length,
      pathJson: stage.path_json,
      waves: stage.waves,
      heroesConfig: stageMgr.getHeroesConfig(),
      enemiesConfig: stageMgr.getEnemiesConfig(),
      playerHeroes: activeTeamHeroesRef.current,
    });
  }, []);

  // 初始化 Bridge 實例（只在 mount 時建立一次，避免因 stats 或 currentStage 變更而重複重建）
  useEffect(() => {
    const bridge = new LocalGameBridge();
    bridgeRef.current = bridge;

    bridge.onStatsChanged = (s) => setStats(s);
    bridge.onPlacementMenuOpen = (m) => setPlacementMenu(m);
    bridge.onUpgradePanelOpen = (tw) => setUpgradeTower(tw);
    bridge.onHeroInfoOpen = (h) => setHeroInfo(h);

    bridge.onBattleEnded = (r) => {
      setBattleResult(r);
      if (r.result === "WIN") {
        const reward = settleBattle(currentStageRef.current.map_id, statsRef.current.hp, statsRef.current.max_hp);
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

    // 初始載入當前關卡
    const initialStage = currentStageRef.current;
    bridge.loadStage({
      stageId: initialStage.map_id,
      battleId: `battle_${Date.now()}`,
      totalWaves: initialStage.waves.length,
      pathJson: initialStage.path_json,
      waves: initialStage.waves,
      heroesConfig: BUILTIN_HEROES_CONFIG,
      enemiesConfig: BUILTIN_ENEMIES_CONFIG,
      playerHeroes: activeTeamHeroesRef.current,
    });

    if (typeof window !== "undefined") {
      (window as unknown as { __testBridge?: LocalGameBridge }).__testBridge = bridge;
    }

    // 非同步讀取完整地圖庫清單以供關卡選擇
    const stageMgr = StageDataManager.getInstance();
    void stageMgr.loadAllStages().then((res) => {
      if (res.stages && res.stages.length > 0) {
        setAllStages(res.stages);
        const match = res.stages.find((s) => s.map_id === currentStageRef.current.map_id);
        if (match) {
          setCurrentStage(match);
        }
      }
    });

    return () => {
      if (typeof window !== "undefined") {
        delete (window as unknown as { __testBridge?: LocalGameBridge }).__testBridge;
      }
      bridge.destroy();
      bridgeRef.current = null;
    };
  }, [settleBattle]);

  // 當隊伍陣容變更且處於備戰階段時，平滑更新戰場武將陣容
  useEffect(() => {
    if (bridgeRef.current && stats.game_state === GameState.PREP) {
      const stageMgr = StageDataManager.getInstance();
      const st = currentStageRef.current;
      bridgeRef.current.loadStage({
        stageId: st.map_id,
        battleId: `battle_${Date.now()}`,
        totalWaves: st.waves.length,
        pathJson: st.path_json,
        waves: st.waves,
        heroesConfig: stageMgr.getHeroesConfig(),
        enemiesConfig: stageMgr.getEnemiesConfig(),
        playerHeroes: activeTeamHeroes,
      });
    }
  }, [activeTeamHeroes, stats.game_state]);

  // 畫布回調
  const handleCanvasReady = useCallback((canvas: HTMLCanvasElement) => {
    canvasElementRef.current = canvas;
    if (bridgeRef.current) {
      bridgeRef.current.init(canvas);
      if (containerSizeRef.current) {
        bridgeRef.current.resize(containerSizeRef.current.w, containerSizeRef.current.h);
      }
    }
  }, []);

  const handleResize = useCallback((width: number, height: number) => {
    if (width > 0 && height > 0) {
      containerSizeRef.current = { w: width, h: height };
    }
    bridgeRef.current?.resize(width, height);
  }, []);

  // 控制操作
  const handleStartBattle = () => {
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

  const handlePlaceHero = (col: number, row: number, heroState: HeroStateData) => {
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

  // 判定是否有下一可挑戰關卡
  const hasNextPlayableStage = useMemo(() => {
    const nextMapId = getNextStage(currentStage.map_id);
    const nextStage = allStages.find((s) => s.map_id === nextMapId);
    return Boolean(nextStage && !getStageDataProblem(nextStage));
  }, [allStages, currentStage.map_id]);

  const handleNextStage = () => {
    setBattleResult(null);
    setBattleReward(null);
    const nextMapId = getNextStage(currentStage.map_id);
    const nextStage = allStages.find((s) => s.map_id === nextMapId);
    if (nextStage && !getStageDataProblem(nextStage)) {
      loadStageData(nextStage);
    } else {
      setIsStageSelectorOpen(true);
    }
  };

  // 隊伍保存後重新傳遞至 Bridge
  const handleSaveTeam = (newTeam: TeamSlot[]) => {
    updateTeam(newTeam);
  };

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
              title="開始戰鬥"
              aria-label="進入戰場"
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
              color: stats.hp / stats.max_hp < 0.3 ? "#ef4444" : "rgba(255,255,255,0.9)",
            }}
          >
            <span style={{ color: stats.hp / stats.max_hp < 0.3 ? "#ef4444" : "#6366f1" }}>
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
            disabled={stats.game_state !== GameState.PREP || stats.paused}
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
          <div style={{ display: "inline-flex", borderRadius: 8, overflow: "hidden", border: "1px solid rgba(255, 255, 255, 0.18)" }}>
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
              style={{ borderRadius: 0, border: "none", borderLeft: "1px solid rgba(255, 255, 255, 0.18)", padding: "0 8px" }}
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
        onGuestMode={startGuestMode}
        canCancel={false}
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
        onGuestMode={startGuestMode}
        onForceSync={forceSync}
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
      />

      {/* 武將名錄與修為升級視窗 */}
      <HeroRosterModal
        show={isHeroRosterOpen}
        player={player}
        onClose={() => setIsHeroRosterOpen(false)}
        onUpgradeHero={upgradeHero}
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
        hasNextStage={hasNextPlayableStage}
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
