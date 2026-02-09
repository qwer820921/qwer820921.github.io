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
import "../styles.css";

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
    <div className="tower-defense-container">
      {/* 頁首標題 - 僅在開始畫面顯示 */}
      {!gameStarted && (
        <header className="tower-defense-header">
          <h1 className="game-title">塔防守衛戰</h1>
          <p className="game-subtitle">TOWER DEFENSE</p>
        </header>
      )}

      {/* 開始畫面 */}
      {!gameStarted && (
        <div className="start-screen">
          <div className="start-content">
            <div className="game-logo">
              <span className="logo-icon">🏰</span>
            </div>
            <h2 className="welcome-text">準備好防禦了嗎？</h2>
            <p className="game-description">
              策略佈局，升級防禦塔，抵禦一波又一波的敵人進攻！
              <br />
              展現你的智慧，守護最後的堡壘。
            </p>

            {/* 關卡選擇 */}
            <div className="level-selection">
              <label htmlFor="level-select" className="level-label">
                選擇關卡：
              </label>
              <select
                id="level-select"
                className="level-select"
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
                <div className="level-info">
                  <p className="level-description">
                    {levelManager.getLevelById(selectedLevelId)?.description}
                  </p>
                  <div className="level-stats">
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

            <div className="features">
              <div className="feature-item">
                <span className="feature-icon">🏹</span>
                <span className="feature-text">多種防禦塔</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">👾</span>
                <span className="feature-text">多樣化敵人</span>
              </div>
              <div className="feature-item">
                <span className="feature-icon">⚡</span>
                <span className="feature-text">酷炫技能</span>
              </div>
            </div>

            <button className="start-button" onClick={handleStartGame}>
              <span className="button-icon">🎮</span>
              <span className="button-text">開始遊戲</span>
            </button>
          </div>
        </div>
      )}

      {/* 遊戲畫面容器 */}
      <div
        className="game-screen"
        style={{
          opacity: gameStarted ? 1 : 0,
          pointerEvents: gameStarted ? "all" : "none",
          transition: "opacity 0.5s ease",
          position: gameStarted ? "relative" : "absolute",
          visibility: gameStarted ? "visible" : "hidden",
        }}
      >
        {/* Top HUD: 狀態 + 控制 */}
        <div className="hud-panel hud-top">
          <div className="hud-stats-group">
            <div className="hud-stat-item level-name-item" title="當前關卡">
              <span className="hud-stat-icon">🎯</span>
              <span className="hud-stat-value">
                {currentLevel?.name || "未知關卡"}
              </span>
            </div>
            <div className="hud-stat-item" title="金幣">
              <span className="hud-stat-icon">💰</span>
              <span className="hud-stat-value">{Math.floor(gold)}</span>
            </div>
            <div className="hud-stat-item" title="生命值">
              <span className="hud-stat-icon">❤️</span>
              <span className="hud-stat-value">{lives}</span>
            </div>
            <div className="hud-stat-item" title="波次">
              <span className="hud-stat-icon">🌊</span>
              <span className="hud-stat-value">
                {currentWave}/{totalWaves}
              </span>
            </div>
            <div className="hud-stat-item" title="分數">
              <span className="hud-stat-icon">🏆</span>
              <span className="hud-stat-value">{score}</span>
            </div>
          </div>

          <div className="hud-controls-group">
            {status === GameStatus.PLAYING && (
              <button
                className="hud-icon-btn pause"
                onClick={pauseGame}
                title="暫停"
              >
                ⏸️
              </button>
            )}
            {status === GameStatus.PAUSED && (
              <button
                className="hud-icon-btn resume"
                onClick={resumeGame}
                title="繼續"
              >
                ▶️
              </button>
            )}
            <button
              className="hud-icon-btn restart"
              onClick={handleRestart}
              title="重新開始"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="game-canvas-wrapper">
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
        <div className="hud-panel hud-bottom">
          <div className="tower-dock">
            {Object.values(TOWER_CONFIGS).map((config) => (
              <button
                key={config.type}
                className={`tower-dock-btn ${selectedTowerType === config.type ? "selected" : ""}`}
                onClick={() => selectTowerType(config.type)}
                disabled={gold < config.cost}
                title={`${config.name} (傷害: ${config.damage}, 射程: ${config.range})`}
              >
                <span className="dock-icon">{config.icon}</span>
                <span className="dock-cost">{config.cost}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 遊戲結束畫面 */}
        {(status === GameStatus.WIN || status === GameStatus.LOSE) && (
          <div className="game-over-overlay">
            <div className="game-over-content">
              <h2 className="game-over-title">
                {status === GameStatus.WIN ? "🎉 勝利!" : "💀 失敗"}
              </h2>
              <p className="game-over-level">關卡: {currentLevel?.name}</p>
              <p className="game-over-score">最終分數: {score}</p>

              <div className="game-over-actions">
                <button className="restart-button" onClick={handleRestart}>
                  再玩一次
                </button>

                {status === GameStatus.WIN && levelManager.getNextLevel() && (
                  <button
                    className="next-level-button"
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
                  <p className="congratulations">🎊 恭喜通關所有關卡！</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 塔資訊彈窗 */}
        {selectedTower && (
          <div className="tower-info-overlay" onClick={() => selectTower(null)}>
            <div
              className="tower-info-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3 className="modal-title">
                  <span className="modal-icon">
                    {TOWER_CONFIGS[selectedTower.type].icon}
                  </span>
                  {TOWER_CONFIGS[selectedTower.type].name}
                </h3>
                <button
                  className="close-button"
                  onClick={() => selectTower(null)}
                >
                  ✕
                </button>
              </div>
              <div className="modal-body">
                <div className="info-grid">
                  <div className="info-card">
                    <div className="info-icon">📊</div>
                    <div className="info-label">等級</div>
                    <div className="info-value">Lv.{selectedTower.level}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-icon">⚔️</div>
                    <div className="info-label">傷害</div>
                    <div className="info-value">{selectedTower.damage}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-icon">📏</div>
                    <div className="info-label">射程</div>
                    <div className="info-value">{selectedTower.range}</div>
                  </div>
                  <div className="info-card">
                    <div className="info-icon">⚡</div>
                    <div className="info-label">攻速</div>
                    <div className="info-value">
                      {(1000 / selectedTower.attackSpeed).toFixed(1)}/s
                    </div>
                  </div>
                </div>
                <div className="modal-actions">
                  <button
                    className="sell-button"
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
                    {Math.floor(TOWER_CONFIGS[selectedTower.type].cost * 0.5)}{" "}
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
