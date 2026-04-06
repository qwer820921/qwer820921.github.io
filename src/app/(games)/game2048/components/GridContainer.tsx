"use client";
import React from "react";
import Tile from "./Tile";
import { useGameStore } from "../store/useGameStore";
import { Tile as TileType } from "../types";

import styles from "../styles/game2048.module.css";

const GridContainer: React.FC = () => {
  const { grid, gameState, resetGame } = useGameStore();

  // 將二維網格拉平，過濾掉 null
  const tiles = grid.flat().filter((t): t is TileType => t !== null);

  return (
    <div className={styles["grid-container"]}>
      {/* 渲染 16 個底盤背景格子 */}
      {Array.from({ length: 16 }).map((_, i) => (
        <div key={i} className={styles["grid-cell"]} />
      ))}

      {/* 渲染動態方塊 */}
      {tiles.map((tile) => (
        <Tile key={tile.id} tile={tile} />
      ))}

      {/* Game Over / Win Overlay (原本誤刪，現已還原並升級) */}
      {(gameState === "over" || gameState === "won") && (
        <div className={styles.overlay}>
          <h2 className={styles["overlay-title"]}>
            {gameState === "won" ? "你贏了！" : "遊戲結束"}
          </h2>
          <div className={styles["overlay-buttons"]}>
            <button className={styles["btn-retry"]} onClick={resetGame}>
              {gameState === "won" ? "新遊戲" : "再試一次"}
            </button>
            {gameState === "won" && (
              <button
                className={[styles["btn-retry"], styles.secondary].join(" ")}
                onClick={useGameStore.getState().continueGame}
              >
                繼續挑戰
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default GridContainer;
