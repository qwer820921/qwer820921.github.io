"use client";
import React from "react";
import Link from "next/link";
import styles from "../styles/monsterTide.module.css";

const MonsterTidePage: React.FC = () => {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0d0d1a",
        color: "#e0e0e0",
        fontFamily: "monospace",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "1.5rem",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "2rem", color: "#f0e040", margin: 0 }}>
        ⚔ 怪物洪流
      </h1>
      <p
        style={{
          fontSize: "0.95rem",
          color: "#8090a8",
          margin: 0,
          textAlign: "center",
        }}
      >
        守護基地，擊退滾滾而來的怪物浪潮
      </p>
      <Link href="/monsterTide/stageSelect" className={styles.startBtn}>
        開始遊戲
      </Link>
      <Link href="/monsterTide/forge" className={styles.forgeLink}>
        🔨 鐵匠鋪
      </Link>
    </div>
  );
};

export default MonsterTidePage;
