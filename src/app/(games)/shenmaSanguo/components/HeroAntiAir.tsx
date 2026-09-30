"use client";

import { heroAirText, heroCanHitAir } from "../utils/antiAir";
import styles from "../styles/shenmaSanguo.module.css";

/** 武將詳情的對空說明（依職業；規則見 utils/antiAir） */
export default function HeroAntiAir({ job }: { job: unknown }) {
  const air = heroCanHitAir(job);
  return (
    <div
      className={`${styles.antiAirLine} ${air ? styles.antiAirYes : ""}`}
      data-testid="hero-anti-air"
      data-anti-air={air ? "true" : "false"}
    >
      對空：{heroAirText(job)}
    </div>
  );
}
