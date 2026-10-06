"use client";

import React, { useEffect, useRef } from "react";
import { GameState } from "../engine/BattleManager";
import styles from "../styles/shenmaSanguoJs.module.css";

interface BattleCanvasViewProps {
  gameState: GameState;
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  onResize: (width: number, height: number) => void;
  onStartBattle: () => void;
}

export const BattleCanvasView: React.FC<BattleCanvasViewProps> = ({
  gameState,
  onCanvasReady,
  onResize,
  onStartBattle,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    // 通知父元件畫布已掛載
    onCanvasReady(canvas);

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.floor(rect.width);
      // 維持良好比例（最小高度 480，桌面高至 720）
      const h = Math.min(720, Math.max(480, Math.floor(w * 0.72)));
      onResize(w, h);
    };

    updateSize();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [onCanvasReady, onResize]);

  return (
    <div ref={containerRef} className={styles.canvasContainer}>
      <canvas ref={canvasRef} className={styles.battleCanvas} />

      {/* 佈防階段操作提示條 */}
      {gameState === GameState.PREP && (
        <div className={styles.prepActionBar}>
          <div className="d-flex align-items-center justify-content-between gap-3 w-100 flex-wrap">
            <div className="d-flex align-items-center gap-2">
              <span className="fs-5">💡</span>
              <span className="small text-light">
                點擊<strong>石台</strong>建築防禦塔，點擊<strong>道路</strong>部署肉盾武將！
              </span>
            </div>
            <button
              type="button"
              className={`btn btn-danger btn-sm px-3 fw-bold ${styles.pulseBtn}`}
              onClick={onStartBattle}
            >
              迎戰敵人 ➔
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
