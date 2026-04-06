"use client";
import React, { useEffect, useState } from "react";
import ScoreBoard from "./ScoreBoard";
import GridContainer from "./GridContainer";
import { useGameStore } from "../store/useGameStore";
import { useSwipe } from "../hooks/useSwipe";
import { Direction } from "../types";
import styles from "../styles/game2048.module.css";

export default function Game2048Page() {
  const { grid, gameState, initGame, move, _hasHydrated } = useGameStore();
  const [showRules, setShowRules] = useState(false);

  // 初始化遊戲 (僅當棋盤全空且資料已恢復時)
  useEffect(() => {
    if (!_hasHydrated) return;

    const isGridEmpty = grid.flat().every((tile) => tile === null);
    if (isGridEmpty) {
      initGame();
    }
  }, [_hasHydrated, grid, initGame]);

  // 鍵盤監聽
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 防止網頁上下捲動
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
      }

      // 如果遊戲結束或贏了尚未點擊繼續，則不處理鍵盤
      if (gameState === "over" || gameState === "won") return;

      let direction: Direction | null = null;
      switch (e.key) {
        case "ArrowUp":
        case "w":
        case "W":
          direction = "UP";
          break;
        case "ArrowDown":
        case "s":
        case "S":
          direction = "DOWN";
          break;
        case "ArrowLeft":
        case "a":
        case "A":
          direction = "LEFT";
          break;
        case "ArrowRight":
        case "d":
        case "D":
          direction = "RIGHT";
          break;
      }

      if (direction) {
        move(direction);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move, gameState]);

  // 手勢監聽 (手機端)
  useSwipe((direction) => {
    if (gameState === "playing") {
      move(direction);
    }
  });

  if (!_hasHydrated) return null; // 等待資料恢復

  return (
    <div
      className={styles["game2048-container"]}
      style={{ paddingTop: "70px" }}
    >
      {/* 遊戲抬頭與分數 */}
      <ScoreBoard />

      {/* 遊戲主網格 */}
      <div className={styles["game-wrapper"]}>
        <GridContainer />
      </div>

      {/* 遊戲規則說明 */}
      <div
        className={[styles["rules-card"], showRules ? styles.open : ""]
          .filter(Boolean)
          .join(" ")}
        onClick={() => setShowRules(!showRules)}
      >
        <h3 className={styles["rules-header"]}>
          <span>💡 遊戲規則說明</span>
          <span className={styles["rules-arrow"]}>▼</span>
        </h3>

        <div className={styles["rules-content"]}>
          <ul className={styles["rules-list"]}>
            <li>使用方向鍵或 WASD 鍵控制所有方塊移動。手機端請直接划動。</li>
            <li>相同數值的方塊相撞時會合併成其兩倍數值。</li>
            <li>每移動一次，棋盤會隨機出現一個新方塊。</li>
            <li>
              目標是拼出 <strong>2048</strong> 的方塊！
            </li>
            <li className={styles["rules-note"]}>
              註：一排若有 3
              個相同數字，將優先合併朝向移動方向的那一側（如：[2,2,2]
              向右滑會變成 [0,2,4]）。
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
