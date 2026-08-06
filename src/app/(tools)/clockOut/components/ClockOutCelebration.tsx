"use client";
import React, { useEffect, useRef } from "react";
import styles from "../styles/clockOut.module.css";

interface Props {
  show: boolean;
  cheer: string;
  onClose: () => void;
}

const COLORS = ["#ccff4d", "#a4e800", "#ffb02e", "#ffffff", "#7dc400"];

const ClockOutCelebration: React.FC<Props> = ({ show, cheer, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!show) return;
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduced) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const particles = Array.from({ length: 140 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height,
      s: 6 + Math.random() * 8,
      vy: 2 + Math.random() * 4,
      vx: -1.5 + Math.random() * 3,
      c: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
    }));

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s);
        ctx.restore();
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [show]);

  if (!show) return null;

  return (
    <div
      className={styles.celebrate}
      onClick={onClose}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClose();
      }}
    >
      <canvas ref={canvasRef} className={styles.confetti} />
      {}
      <img
        className={styles.capy}
        src="/images/clockOut/clockout_done.png"
        alt="下班啦水豚君"
      />
      <h2 className={styles.celebrateTitle}>下班啦！</h2>
      <p className={styles.celebrateCheer}>{cheer}</p>
      <small className={styles.celebrateHint}>點擊任意處關閉</small>
    </div>
  );
};

export default ClockOutCelebration;
