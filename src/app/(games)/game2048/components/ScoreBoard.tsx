"use client";
import React, { useEffect, useState, useRef } from "react";
import { useGameStore } from "../store/useGameStore";
import styles from "../styles/game2048.module.css";

const ScoreBoard: React.FC = () => {
  const { score, bestScore, resetGame } = useGameStore();
  const [diff, setDiff] = useState<number>(0);
  const [showDiff, setShowDiff] = useState<boolean>(false);
  const [showModal, setShowModal] = useState<boolean>(false); // 控制自訂對話框
  const prevScore = useRef(score);

  useEffect(() => {
    const delta = score - prevScore.current;
    if (delta > 0) {
      setDiff(delta);
      setShowDiff(true);
      const timer = setTimeout(() => setShowDiff(false), 800);
      prevScore.current = score;
      return () => clearTimeout(timer);
    }
    prevScore.current = score;
  }, [score]);

  return (
    <>
      <div className={styles.header}>
        {/* 分數區塊靠左 */}
        <div className={styles.scores}>
          <div className={styles["score-box"]}>
            <div className={styles["score-label"]}>目前分數</div>
            <div className={styles["score-value"]}>{score}</div>
            {showDiff && (
              <div className={styles["score-diff"]} key={Date.now()}>
                +{diff}
              </div>
            )}
          </div>
          <div className={styles["score-box"]}>
            <div className={styles["score-label"]}>最高紀錄</div>
            <div className={styles["score-value"]}>{bestScore}</div>
          </div>
        </div>

        {/* 新遊戲按鈕靠右 */}
        <button
          className={styles["btn-retry"]}
          onClick={() => setShowModal(true)}
        >
          新遊戲
        </button>
      </div>

      {/* 自訂 Confirm Modal */}
      {showModal && (
        <div
          className={styles["modal-overlay"]}
          onClick={() => setShowModal(false)}
        >
          <div
            className={styles["modal-card"]}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={styles["modal-title"]}>確定開始新遊戲？</h3>
            <p className={styles["modal-message"]}>
              目前的遊戲進度將會遺失，並清空目前的棋盤。 您確定要繼續嗎？
            </p>
            <div className={styles["modal-footer"]}>
              <button
                className={[styles["btn-modal"], styles["btn-cancel"]].join(
                  " "
                )}
                onClick={() => setShowModal(false)}
              >
                取消
              </button>
              <button
                className={[styles["btn-modal"], styles["btn-confirm"]].join(
                  " "
                )}
                onClick={() => {
                  resetGame();
                  setShowModal(false);
                }}
              >
                確定開始
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ScoreBoard;
