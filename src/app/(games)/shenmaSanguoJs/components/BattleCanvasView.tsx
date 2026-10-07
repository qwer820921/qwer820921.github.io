"use client";

import React, { useEffect, useRef } from "react";
import styles from "../styles/shenmaSanguoJs.module.css";

interface BattleCanvasViewProps {
  onCanvasReady: (canvas: HTMLCanvasElement) => void;
  onResize: (width: number, height: number) => void;
}

export const BattleCanvasView: React.FC<BattleCanvasViewProps> = ({
  onCanvasReady,
  onResize,
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
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (w > 0 && h > 0) {
        onResize(w, h);
      }
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
    </div>
  );
};
