"use client";
import React from "react";
import styles from "../styles/clockOut.module.css";

interface Props {
  pct: number;
  exp: number;
}

const ExpBar: React.FC<Props> = ({ pct, exp }) => {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className={styles.expWrap}>
      <div className={styles.expMeta}>
        <span>EXP</span>
        <span>{pct.toFixed(2)}%</span>
      </div>
      <div className={styles.expbar}>
        <div className={styles.expFill} style={{ width: `${w.toFixed(2)}%` }} />
        <div className={styles.expText}>
          <span className={styles.expK}>EXP</span>
          <span>
            {exp.toLocaleString()} [{pct.toFixed(2)}%]
          </span>
        </div>
      </div>
    </div>
  );
};

export default ExpBar;
