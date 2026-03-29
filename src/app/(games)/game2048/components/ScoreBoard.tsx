"use client";
import React, { useEffect, useState, useRef } from "react";
import { useGameStore } from "../store/useGameStore";

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
      <div className="header">
        {/* 分數區塊靠左 */}
        <div className="scores">
          <div className="score-box">
            <div className="score-label">目前分數</div>
            <div className="score-value">{score}</div>
            {showDiff && (
              <div className="score-diff" key={Date.now()}>
                +{diff}
              </div>
            )}
          </div>
          <div className="score-box">
            <div className="score-label">最高紀錄</div>
            <div className="score-value">{bestScore}</div>
          </div>
        </div>

        {/* 新遊戲按鈕靠右 */}
        <button className="btn-retry" onClick={() => setShowModal(true)}>
          新遊戲
        </button>
      </div>

      {/* 自訂 Confirm Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">確定開始新遊戲？</h3>
            <p className="modal-message">
              目前的遊戲進度將會遺失，並清空目前的棋盤。 您確定要繼續嗎？
            </p>
            <div className="modal-footer">
              <button
                className="btn-modal btn-cancel"
                onClick={() => setShowModal(false)}
              >
                取消
              </button>
              <button
                className="btn-modal btn-confirm"
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
