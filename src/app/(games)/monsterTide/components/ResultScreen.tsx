"use client";

import type { ResultScreenData } from "../types";
import styles from "../styles/monsterTide.module.css";

interface ResultScreenProps {
  data: ResultScreenData;
  onContinue: () => void;
}

export default function ResultScreen({ data, onContinue }: ResultScreenProps) {
  const isClear = data.outcome === "stage_clear";
  const totalSouls = data.soulsEarned + (isClear ? data.stageBonusSouls : 0);

  return (
    <div className={styles.resultOverlay}>
      <div className={styles.resultPanel}>
        <h2 className={styles.resultTitle}>
          {isClear ? "防線守住了！" : "防線失守..."}
        </h2>

        {data.totalWaves > 0 && (
          <p className={styles.resultRow}>
            通關波次：{data.wavesCleared}&nbsp;/&nbsp;{data.totalWaves}
          </p>
        )}

        <p className={styles.resultRow}>
          深淵晶核獲得：&nbsp;
          <span className={styles.soulsValue}>{data.soulsEarned}</span>
        </p>

        {isClear && data.stageBonusSouls > 0 && (
          <p className={styles.resultRow}>
            過關獎勵：&nbsp;
            <span className={styles.soulsValue}>+{data.stageBonusSouls}</span>
          </p>
        )}

        {isClear && (
          <p className={styles.resultRow}>
            合計：&nbsp;
            <span className={styles.soulsValue}>{totalSouls}</span>
          </p>
        )}

        <button className={styles.resultBtn} onClick={onContinue}>
          返回
        </button>
      </div>
    </div>
  );
}
