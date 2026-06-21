"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { loadSave } from "../lib/meta/saveData";
import { STAGES } from "../lib/stages";
import type { SaveData } from "../types";
import styles from "../styles/monsterTide.module.css";

export default function StageSelectPage() {
  const [save, setSave] = useState<SaveData | null>(null);

  useEffect(() => {
    setSave(loadSave());
  }, []);

  if (!save) return null;

  return (
    <div className={styles.stageSelectPage}>
      <div className={styles.stageSelectHeader}>
        <Link href="/monsterTide" className={styles.backLink}>
          ← 返回大廳
        </Link>
        <h1 className={styles.stageSelectTitle}>關卡選擇</h1>
        <div className={styles.soulsDisplay}>💎 {save.totalSouls} 深淵晶核</div>
      </div>

      <div className={styles.stageList}>
        {STAGES.map((stage) => {
          const isUnlocked =
            stage.unlockRequirement === null ||
            save.clearedStages.includes(stage.unlockRequirement);
          const isCleared = save.clearedStages.includes(stage.stageId);

          return (
            <div
              key={stage.stageId}
              className={`${styles.stageCard} ${!isUnlocked ? styles.stageLocked : ""}`}
            >
              <div className={styles.stageCardLeft}>
                <div className={styles.stageNum}>第 {stage.stageId} 關</div>
                <div className={styles.stageName}>{stage.name}</div>
                <div className={styles.stageMeta}>
                  {stage.waves.length} 波・
                  {stage.waves.filter((w) => w.isBossWave).length > 0
                    ? "含 Boss"
                    : "無 Boss"}
                </div>
                {isCleared && (
                  <div className={styles.stageClearedBadge}>✓ 已通關</div>
                )}
                {!isUnlocked && (
                  <div className={styles.stageLockMsg}>
                    需通關第 {stage.unlockRequirement} 關解鎖
                  </div>
                )}
              </div>
              <div className={styles.stageCardRight}>
                {isUnlocked ? (
                  <Link
                    href={`/monsterTide/battle/${stage.stageId}`}
                    className={styles.startBtn}
                  >
                    {isCleared ? "再挑戰" : "出發！"}
                  </Link>
                ) : (
                  <div className={styles.lockIcon}>🔒</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.stageSelectFooter}>
        <Link href="/monsterTide/forge" className={styles.forgeLink}>
          🔨 前往鐵匠鋪強化
        </Link>
      </div>
    </div>
  );
}
