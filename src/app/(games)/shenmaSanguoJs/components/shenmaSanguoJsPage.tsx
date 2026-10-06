"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { Container, Row, Col, Card, Button } from "react-bootstrap";
import Link from "next/link";
import { ROUTES } from "@/constants/routes";
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
import { BattleHud } from "./BattleHud";
import { BattleCanvasView } from "./BattleCanvasView";
import { PlacementMenuModal } from "./PlacementMenuModal";
import { UpgradePanelModal } from "./UpgradePanelModal";
import { HeroInfoModal } from "./HeroInfoModal";
import { BattleResultModal } from "./BattleResultModal";
import { StageSelectorModal } from "./StageSelectorModal";
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

  // 狀態管理
  const [stats, setStats] = useState<StatsSyncData>(DEFAULT_STATS);
  const [allStages, setAllStages] = useState<StageData[]>(BUILTIN_STAGES);
  const [currentStage, setCurrentStage] = useState<StageData>(BUILTIN_STAGES[0]);
  const [placementMenu, setPlacementMenu] = useState<PlacementMenuData | null>(null);
  const [upgradeTower, setUpgradeTower] = useState<TowerEntity | null>(null);
  const [heroInfo, setHeroInfo] = useState<HeroEntity | null>(null);
  const [battleResult, setBattleResult] = useState<BattleResultData | null>(null);
  const [isStageSelectorOpen, setIsStageSelectorOpen] = useState(false);

  // 音訊靜音狀態
  const [isBgmMuted, setIsBgmMuted] = useState(false);
  const [isSfxMuted, setIsSfxMuted] = useState(false);

  // 載入關卡
  const loadStageData = useCallback((stage: StageData) => {
    setCurrentStage(stage);
    setPlacementMenu(null);
    setUpgradeTower(null);
    setHeroInfo(null);
    setBattleResult(null);

    const stageMgr = StageDataManager.getInstance();
    bridgeRef.current?.loadStage({
      stageId: stage.map_id,
      battleId: `battle_${Date.now()}`,
      totalWaves: stage.waves.length,
      pathJson: stage.path_json,
      waves: stage.waves,
      heroesConfig: stageMgr.getHeroesConfig(),
      enemiesConfig: stageMgr.getEnemiesConfig(),
      playerHeroes: DEFAULT_PLAYER_HEROES,
    });
  }, []);

  // 初始化 Bridge 實例與非同步載入 GAS/快取地圖
  useEffect(() => {
    const bridge = new LocalGameBridge();
    bridgeRef.current = bridge;

    bridge.onStatsChanged = (s) => setStats(s);
    bridge.onPlacementMenuOpen = (m) => setPlacementMenu(m);
    bridge.onUpgradePanelOpen = (tw) => setUpgradeTower(tw);
    bridge.onHeroInfoOpen = (h) => setHeroInfo(h);
    bridge.onBattleEnded = (r) => setBattleResult(r);

    // 關鍵修復：若畫布子元件在父元件前已掛載，立即初始化與縮放
    if (canvasElementRef.current) {
      bridge.init(canvasElementRef.current);
      if (containerSizeRef.current) {
        bridge.resize(containerSizeRef.current.w, containerSizeRef.current.h);
      }
    }

    // 先以內建第一關秒開畫布
    bridge.loadStage({
      stageId: BUILTIN_STAGES[0].map_id,
      battleId: `battle_${Date.now()}`,
      totalWaves: BUILTIN_STAGES[0].waves.length,
      pathJson: BUILTIN_STAGES[0].path_json,
      waves: BUILTIN_STAGES[0].waves,
      heroesConfig: BUILTIN_HEROES_CONFIG,
      enemiesConfig: BUILTIN_ENEMIES_CONFIG,
      playerHeroes: DEFAULT_PLAYER_HEROES,
    });

    // 非同步自 localStorage 或 GAS 讀取全量地圖
    const stageMgr = StageDataManager.getInstance();
    stageMgr.loadAllStages().then((res) => {
      if (res.stages.length > 0) {
        setAllStages(res.stages);
        const stage1 = res.stages.find((s) => s.map_id === "chapter1_1");
        if (stage1 && stage1.path_json) {
          setCurrentStage(stage1);
          bridge.loadStage({
            stageId: stage1.map_id,
            battleId: `battle_${Date.now()}`,
            totalWaves: stage1.waves.length,
            pathJson: stage1.path_json,
            waves: stage1.waves,
            heroesConfig: res.heroesConfig,
            enemiesConfig: res.enemiesConfig,
            playerHeroes: DEFAULT_PLAYER_HEROES,
          });
        }
      }
    });

    return () => {
      bridge.destroy();
      bridgeRef.current = null;
    };
  }, []);

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

  // 建造與升級操作
  const handlePlaceTower = (col: number, row: number, typeKey: string) => {
    bridgeRef.current?.placeTower(col, row, typeKey);
  };

  const handlePlaceHero = (col: number, row: number, heroState: HeroStateData) => {
    bridgeRef.current?.placeHero(col, row, heroState);
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
    loadStageData(currentStage);
  };

  const handleNextStage = () => {
    setBattleResult(null);
    const currentIndex = allStages.findIndex((s) => s.map_id === currentStage.map_id);
    const nextIndex = (currentIndex + 1) % allStages.length;
    loadStageData(allStages[nextIndex]);
  };

  return (
    <Container className={styles.container}>
      {/* 頂部 HUD 狀態儀表板 */}
      <BattleHud
        stats={stats}
        stageName={currentStage.name}
        onStartBattle={handleStartBattle}
        onToggleAuto={handleToggleAuto}
        onSetSpeed={handleSetSpeed}
        onTogglePause={handleTogglePause}
        onToggleBgm={handleToggleBgm}
        onToggleSfx={handleToggleSfx}
        isBgmMuted={isBgmMuted}
        isSfxMuted={isSfxMuted}
        onOpenStageSelector={() => setIsStageSelectorOpen(true)}
      />

      {/* 核心戰場渲染畫布 */}
      <Row className="mb-4">
        <Col xs={12}>
          <BattleCanvasView
            gameState={stats.game_state}
            onCanvasReady={handleCanvasReady}
            onResize={handleResize}
            onStartBattle={handleStartBattle}
          />
        </Col>
      </Row>

      {/* 底部說明與功能跳轉 */}
      <Row className="g-3">
        <Col xs={12} md={4}>
          <Card className="h-100 bg-dark text-light border-secondary p-2">
            <Card.Body>
              <h6 className="fw-bold text-warning mb-2">⚡ 純 JS 原生 Canvas 渲染</h6>
              <p className="text-secondary small mb-0">
                徹底告別 39MB WebAssembly 下載，高解析度 Retina DPI 自適應，零延遲秒開即玩。
              </p>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="h-100 bg-dark text-light border-secondary p-2">
            <Card.Body>
              <h6 className="fw-bold text-info mb-2">⚔️ 13 大名將與 5 大防禦塔</h6>
              <p className="text-secondary small mb-0">
                100% 精準對齊原版數值公式：馬超首擊爆發、趙雲閃避反擊、關羽緩速光環與砲兵 AoE 轟炸！
              </p>
            </Card.Body>
          </Card>
        </Col>
        <Col xs={12} md={4}>
          <Card className="h-100 bg-dark text-light border-secondary p-2">
            <Card.Body>
              <h6 className="fw-bold text-success mb-2">🎵 Web Audio 8 組原版音效</h6>
              <p className="text-secondary small mb-2">
                內建 Godot 原版射擊、打擊與擊倒音效，並搭載五聲音階古風循環戰鬥音樂。
              </p>
              <div className="d-flex gap-2">
                <Link href={ROUTES.SHENMA_SANGUO} passHref legacyBehavior>
                  <Button variant="outline-warning" size="sm">對比 Godot 版</Button>
                </Link>
                <Link href={ROUTES.MAP_EDITOR} passHref legacyBehavior>
                  <Button variant="outline-secondary" size="sm">地圖編輯器</Button>
                </Link>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* 模態選單集合 */}
      <PlacementMenuModal
        show={placementMenu !== null}
        data={placementMenu}
        currentGold={stats.gold}
        playerHeroes={DEFAULT_PLAYER_HEROES}
        onPlaceTower={handlePlaceTower}
        onPlaceHero={handlePlaceHero}
        onClose={() => setPlacementMenu(null)}
      />

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

      <HeroInfoModal
        show={heroInfo !== null}
        hero={heroInfo}
        onClose={() => setHeroInfo(null)}
      />

      <BattleResultModal
        show={battleResult !== null}
        result={battleResult}
        onRetry={handleRetry}
        onNextStage={handleNextStage}
        onOpenStageSelector={() => {
          setBattleResult(null);
          setIsStageSelectorOpen(true);
        }}
      />

      <StageSelectorModal
        show={isStageSelectorOpen}
        stages={allStages}
        currentStageId={currentStage.map_id}
        onSelectStage={loadStageData}
        onClose={() => setIsStageSelectorOpen(false)}
      />
    </Container>
  );
};

export default ShenmaSanguoJsPage;
