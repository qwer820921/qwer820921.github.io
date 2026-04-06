"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "../store/gameStore";
import { GameEngine } from "../core/GameEngine";
import { GameStatus, TowerType, Tower } from "../types";
import { TOWER_CONFIGS } from "../config/gameData";
import { GRID, CANVAS } from "../config/constants";
import { gridToWorld } from "../config/mapConfig";
import { generateId } from "../utils/math";
import { levelManager } from "../core/LevelManager";
import styles from "../styles/towerDefense.module.css";

export default function TowerDefenseGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [gameStarted, setGameStarted] = useState(false);
  const [selectedLevelId, setSelectedLevelId] = useState(1);

  const {
    status,
    gold,
    lives,
    currentWave,
    totalWaves,
    score,
    selectedTowerType,
    selectedTower,
    hoveredCell,
    grid,
    towers,
    currentLevelId,
    startGame,
    pauseGame,
    resumeGame,
    resetGame,
    loadLevel,
    nextLevel,
    selectTowerType,
    selectTower,
    setHoveredCell,
    addTower,
    spendGold,
  } = useGameStore();

  // 獲取當前關卡信息
  const currentLevel = levelManager.getLevelById(currentLevelId);
  const allLevels = levelManager.getAllLevels();

  // 初始化遊戲引擎
  useEffect(() => {
    if (!canvasRef.current || !gameStarted) return;

    const engine = new GameEngine(canvasRef.current);
    engineRef.current = engine;

    return () => {
      engine.stop();
    };
  }, [gameStarted]);

  // 開始遊戲
  const handleStartGame = () => {
    loadLevel(selectedLevelId);
    setGameStarted(true);
    startGame();
    setTimeout(() => {
      engineRef.current?.start();
    }, 100);
  };

  // 重新開始
  const handleRestart = () => {
    engineRef.current?.stop();
    resetGame();
    setGameStarted(false);
  };

  // Canvas 點擊事件
  const handleCanvasClick = () => {
    if (!hoveredCell) return;

    const cell = grid[hoveredCell.row][hoveredCell.col];

    // 檢查是否點擊了已有的塔
    if (cell.towerId) {
      const tower = towers.find((t) => t.id === cell.towerId);
      if (tower) {
        selectTower(tower);
        selectTowerType(null); // 取消塔類型選擇
        return;
      }
    }

    // 建造新塔
    if (!selectedTowerType) return;

    // 檢查是否可以建造
    if (cell.type !== "buildable" || cell.towerId) return;

    const towerConfig = TOWER_CONFIGS[selectedTowerType as TowerType];

    // 檢查金幣
    if (!spendGold(towerConfig.cost)) return;

    // 建造塔
    const position = gridToWorld(hoveredCell.row, hoveredCell.col);
    const tower: Tower = {
      id: generateId("tower"),
      type: selectedTowerType,
      position,
      gridPosition: { row: hoveredCell.row, col: hoveredCell.col },
      damage: towerConfig.damage,
      range: towerConfig.range,
      attackSpeed: towerConfig.attackSpeed,
      attackType: towerConfig.attackType,
      projectileSpeed: towerConfig.projectileSpeed,
      aoeRadius: towerConfig.aoeRadius,
      slowAmount: towerConfig.slowAmount,
      color: towerConfig.color,
      lastAttackTime: performance.now() - towerConfig.attackSpeed, // 允許立即攻擊
      level: 1,
    };

    addTower(tower);
    selectTowerType(null);
  };

  // Canvas 滑鼠移動事件
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    // 計算滑鼠在 Canvas 上的相對位置
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const col = Math.floor(x / GRID.CELL_SIZE);
    const row = Math.floor(y / GRID.CELL_SIZE);

    if (row >= 0 && row < GRID.ROWS && col >= 0 && col < GRID.COLS) {
      setHoveredCell({ row, col });
    } else {
      setHoveredCell(null);
    }
  };

  // Canvas 滑鼠離開事件
  const handleCanvasMouseLeave = () => {
    setHoveredCell(null);
  };

  return (
    <div className={styles["tower-defense-container"]}>
      {/* 頁首標題 - 僅在開始畫面顯示 */}
      {!gameStarted && (
        <header className={styles["tower-defense-header"]}>
          <h1 className={styles["game-title"]}>塔防守衛戰</h1>
          <p className={styles["game-subtitle"]}>TOWER DEFENSE</p>
        </header>
      )}

      {/* 開始畫面 */}
      {!gameStarted && (
        <div className={styles["start-screen"]}>
          <div className={styles["start-content"]}>
            <div className={styles["game-logo"]}>
              <span className={styles["logo-icon"]}>🏰</span>
            </div>
            <h2 className={styles["welcome-text"]}>準備好防禦了嗎？</h2>
            <p className={styles["game-description"]}>
              策略佈局，升級防禦塔，抵禦一波又一波的敵人進攻！
              <br />
              展現你的智慧，守護最後的堡壘。
            </p>

            {/* 關卡選擇 */}
            <div className={styles["level-selection"]}>
              <label htmlFor="level-select" className={styles["level-label"]}>
                選擇關卡：
              </label>
              <select
                id="level-select"
                className={styles["level-select"]}
                value={selectedLevelId}
                onChange={(e) => setSelectedLevelId(Number(e.target.value))}
              >
                {allLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    關卡 {level.id}: {level.name} ({level.difficulty})
                  </option>
                ))}
              </select>

              {/* 顯示選中關卡的詳細信息 */}
              {levelManager.getLevelById(selectedLevelId) && (
                <div className={styles["level-info"]}>
                  <p className={styles["level-description"]}>
                    {levelManager.getLevelById(selectedLevelId)?.description}
                  </p>
                  <div className={styles["level-stats"]}>
                    <span>
                      💰 初始金幣:{" "}
                      {levelManager.getLevelById(selectedLevelId)?.initialGold}
                    </span>
                    <span>
                      ❤️ 初始生命:{" "}
                      {levelManager.getLevelById(selectedLevelId)?.initialLives}
                    </span>
                    <span>
                      🌊 波數:{" "}
                      {levelManager.getLevelById(selectedLevelId)?.waves.length}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className={styles.features}>
              <div className={styles["feature-item"]}>
                <span className={styles["feature-icon"]}>🏹</span>
                <span className={styles["feature-text"]}>多種防禦塔</span>
              </div>
              <div className={styles["feature-item"]}>
                <span className={styles["feature-icon"]}>👾</span>
                <span className={styles["feature-text"]}>多樣化敵人</span>
              </div>
              <div className={styles["feature-item"]}>
                <span className={styles["feature-icon"]}>⚡</span>
                <span className={styles["feature-text"]}>酷炫技能</span>
              </div>
            </div>

            <button
              className={styles["start-button"]}
              onClick={handleStartGame}
            >
              <span className={styles["button-icon"]}>🎮</span>
              <span className={styles["button-text"]}>開始遊戲</span>
            </button>
          </div>
        </div>
      )}

      {/* 遊戲畫面容器 */}
      <div
        className={styles["game-screen"]}
        style={{
          opacity: gameStarted ? 1 : 0,
          pointerEvents: gameStarted ? "all" : "none",
          transition: "opacity 0.5s ease",
          position: gameStarted ? "relative" : "absolute",
          visibility: gameStarted ? "visible" : "hidden",
        }}
      >
        {/* Top HUD: 狀態 + 控制 */}
        <div className={`${styles["hud-panel"]} ${styles["hud-top"]}`}>
          <div className={styles["hud-stats-group"]}>
            <div
              className={`${styles["hud-stat-item"]} ${styles["level-name-item"]}`}
              title="當前關卡"
            >
              <span className={styles["hud-stat-icon"]}>🎯</span>
              <span className={styles["hud-stat-value"]}>
                {currentLevel?.name || "未知關卡"}
              </span>
            </div>
            <div className={styles["hud-stat-item"]} title="金幣">
              <span className={styles["hud-stat-icon"]}>💰</span>
              <span className={styles["hud-stat-value"]}>
                {Math.floor(gold)}
              </span>
            </div>
            <div className={styles["hud-stat-item"]} title="生命值">
              <span className={styles["hud-stat-icon"]}>❤️</span>
              <span className={styles["hud-stat-value"]}>{lives}</span>
            </div>
            <div className={styles["hud-stat-item"]} title="波次">
              <span className={styles["hud-stat-icon"]}>🌊</span>
              <span className={styles["hud-stat-value"]}>
                {currentWave}/{totalWaves}
              </span>
            </div>
            <div className={styles["hud-stat-item"]} title="分數">
              <span className={styles["hud-stat-icon"]}>🏆</span>
              <span className={styles["hud-stat-value"]}>{score}</span>
            </div>
          </div>

          <div className={styles["hud-controls-group"]}>
            {status === GameStatus.PLAYING && (
              <button
                className={`${styles["hud-icon-btn"]} ${styles.pause}`}
                onClick={pauseGame}
                title="暫停"
              >
                ⏸️
              </button>
            )}
            {status === GameStatus.PAUSED && (
              <button
                className={`${styles["hud-icon-btn"]} ${styles.resume}`}
                onClick={resumeGame}
                title="繼續"
              >
                ▶️
              </button>
            )}
            <button
              className={`${styles["hud-icon-btn"]} ${styles.restart}`}
              onClick={handleRestart}
              title="重新開始"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className={styles["game-canvas-wrapper"]}>
          <canvas
            ref={canvasRef}
            id="game-canvas"
            width={CANVAS.WIDTH}
            height={CANVAS.HEIGHT}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={handleCanvasMouseLeave}
          />
        </div>

        {/* Bottom HUD: 塔 dock */}
        <div className={`${styles["hud-panel"]} ${styles["hud-bottom"]}`}>
          <div className={styles["tower-dock"]}>
            {Object.values(TOWER_CONFIGS).map((config) => (
              <button
                key={config.type}
                className={`${styles["tower-dock-btn"]} ${
                  selectedTowerType === config.type ? styles.selected : ""
                }`}
                onClick={() => selectTowerType(config.type)}
                disabled={gold < config.cost}
                title={`${config.name} (傷害: ${config.damage}, 射程: ${config.range})`}
              >
                <span className={styles["dock-icon"]}>{config.icon}</span>
                <span className={styles["dock-cost"]}>{config.cost}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 遊戲結束畫面 */}
        {(status === GameStatus.WIN || status === GameStatus.LOSE) && (
          <div className={styles["game-over-overlay"]}>
            <div className={styles["game-over-content"]}>
              <h2 className={styles["game-over-title"]}>
                {status === GameStatus.WIN ? "🎉 勝利!" : "💀 失敗"}
              </h2>
              <p className={styles["game-over-level"]}>
                關卡: {currentLevel?.name}
              </p>
              <p className={styles["game-over-score"]}>最終分數: {score}</p>

              <div className={styles["game-over-actions"]}>
                <button
                  className={styles["restart-button"]}
                  onClick={handleRestart}
                >
                  再玩一次
                </button>

                {status === GameStatus.WIN && levelManager.getNextLevel() && (
                  <button
                    className={styles["next-level-button"]}
                    onClick={() => {
                      engineRef.current?.stop();
                      nextLevel();
                      setGameStarted(true);
                      startGame();
                      setTimeout(() => {
                        engineRef.current?.start();
                      }, 100);
                    }}
                  >
                    下一關 →
                  </button>
                )}

                {status === GameStatus.WIN && !levelManager.getNextLevel() && (
                  <p className={styles.congratulations}>
                    🎊 恭喜通關所有關卡！
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 塔資訊彈窗 */}
        {selectedTower && (
          <div
            className={styles["tower-info-overlay"]}
            onClick={() => selectTower(null)}
          >
            <div
              className={styles["tower-info-modal"]}
              onClick={(e) => e.stopPropagation()}
            >
              <div className={styles["modal-header"]}>
                <h3 className={styles["modal-title"]}>
                  <span className={styles["modal-icon"]}>
                    {TOWER_CONFIGS[selectedTower.type].icon}
                  </span>
                  {TOWER_CONFIGS[selectedTower.type].name}
                </h3>
                <button
                  className={styles["close-button"]}
                  onClick={() => selectTower(null)}
                >
                  ✕
                </button>
              </div>
              <div className={styles["modal-body"]}>
                <div className={styles["info-grid"]}>
                  <div className={styles["info-card"]}>
                    <div className={styles["info-icon"]}>📊</div>
                    <div className={styles["info-label"]}>等級</div>
                    <div className={styles["info-value"]}>
                      Lv.{selectedTower.level}
                    </div>
                  </div>
                  <div className={styles["info-card"]}>
                    <div className={styles["info-icon"]}>⚔️</div>
                    <div className={styles["info-label"]}>傷害</div>
                    <div className={styles["info-value"]}>
                      {selectedTower.damage}
                    </div>
                  </div>
                  <div className={styles["info-card"]}>
                    <div className={styles["info-icon"]}>📏</div>
                    <div className={styles["info-label"]}>射程</div>
                    <div className={styles["info-value"]}>
                      {selectedTower.range}
                    </div>
                  </div>
                  <div className={styles["info-card"]}>
                    <div className={styles["info-icon"]}>⚡</div>
                    <div className={styles["info-label"]}>攻速</div>
                    <div className={styles["info-value"]}>
                      {(1000 / selectedTower.attackSpeed).toFixed(1)}/s
                    </div>
                  </div>
                </div>
                <div className={styles["modal-actions"]}>
                  <button
                    className={styles["sell-button"]}
                    onClick={() => {
                      const sellPrice = Math.floor(
                        TOWER_CONFIGS[selectedTower.type].cost * 0.5
                      );
                      useGameStore.getState().addGold(sellPrice);
                      useGameStore.getState().removeTower(selectedTower.id);
                      selectTower(null);
                    }}
                  >
                    💰 拆除塔 (+
                    {Math.floor(
                      TOWER_CONFIGS[selectedTower.type].cost * 0.5
                    )}{" "}
                    金幣)
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
