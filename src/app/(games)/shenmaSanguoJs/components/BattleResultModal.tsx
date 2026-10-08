"use client";

import React from "react";
import { BattleResultData } from "../engine/BattleManager";
import { BattleRewardResult } from "../types/player";
import styles from "../styles/shenmaSanguoJs.module.css";

interface BattleResultModalProps {
  show: boolean;
  result: BattleResultData | null;
  rewardResult?: BattleRewardResult | null;
  hasNextStage?: boolean;
  /** 還有下一關，但還沒解鎖（共用帳號這場沒有寫入進度）：不顯示「已通關全部」，改說明下一關未解鎖 */
  nextLocked?: boolean;
  onRetry: () => void;
  onNextStage: () => void;
  onOpenStageSelector: () => void;
}

export const BattleResultModal: React.FC<BattleResultModalProps> = ({
  show,
  result,
  rewardResult,
  hasNextStage = true,
  nextLocked = false,
  onRetry,
  onNextStage,
  onOpenStageSelector,
}) => {
  if (!show || !result) return null;

  const isWin = result.result === "WIN";
  const stars = rewardResult?.stars ?? (result.stars_earned || 0);

  return (
    <div className={styles.resultOverlay} data-testid="result-overlay">
      <div
        className={`${styles.resultCard} ${isWin ? styles.resultWin : styles.resultLose}`}
        data-testid="result-card"
      >
        <div className={styles.resultTitle}>{isWin ? "勝 利" : "落 敗"}</div>

        <div className={styles.resultStars}>
          {"★".repeat(stars)}
          {"☆".repeat(Math.max(0, 3 - stars))}
        </div>

        {/* 共用帳號：兩版的結算規則對齊前，勝負都不寫入雲端進度 */}
        {rewardResult?.notSaved && (
          <div className={styles.resultLoots} data-testid="result-not-saved">
            <div className={styles.resultLootItem}>
              <span className={styles.resultLootName}>
                這場的結果沒有寫入共用進度：不發獎勵、不解鎖關卡，雲端的進度不變（兩版的結算規則對齊前暫停）。
              </span>
            </div>
          </div>
        )}

        {/* 斬獲獎勵與戰利品 */}
        {isWin && rewardResult && !rewardResult.notSaved && (
          <div className={styles.resultLoots}>
            <div className={styles.resultLootItem}>
              <span className={styles.resultLootName}>🪙 主公金幣</span>
              <span className={styles.resultLootCount}>
                +{rewardResult.goldEarned}
              </span>
            </div>
            <div className={styles.resultLootItem}>
              <span className={styles.resultLootName}>🎓 主公經驗</span>
              <span className={styles.resultLootCount}>
                +{rewardResult.expEarned}
              </span>
            </div>
            {rewardResult.leveledUp && (
              <div
                className={styles.resultLootItem}
                style={{
                  borderTop: "1px dashed rgba(245, 158, 11, 0.3)",
                  paddingTop: 4,
                  marginTop: 4,
                }}
              >
                <span
                  className={styles.resultLootName}
                  style={{ color: "#f59e0b", fontWeight: 700 }}
                >
                  🎉 主公升級！
                </span>
                <span
                  className={styles.resultLootCount}
                  style={{ color: "#f59e0b" }}
                >
                  Lv.{rewardResult.newLevel}
                </span>
              </div>
            )}
            {rewardResult.stageUnlocked && (
              <div
                className={styles.resultLootItem}
                style={{
                  borderTop: "1px dashed rgba(16, 185, 129, 0.3)",
                  paddingTop: 4,
                  marginTop: 4,
                }}
              >
                <span
                  className={styles.resultLootName}
                  style={{ color: "#34d399", fontWeight: 700 }}
                >
                  🗺️ 解鎖新戰役
                </span>
                <span
                  className={styles.resultLootCount}
                  style={{ color: "#34d399" }}
                >
                  {rewardResult.stageUnlocked}
                </span>
              </div>
            )}
          </div>
        )}

        {!isWin && (
          <div
            style={{
              color: "rgba(255,255,255,0.75)",
              fontSize: "0.82rem",
              marginBottom: "1rem",
            }}
          >
            城池失守，可嘗試調整防禦塔佈局或提升武將等級後再戰！
          </div>
        )}

        {/* 按鈕組 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            marginTop: "1rem",
          }}
        >
          {isWin && hasNextStage && (
            <button
              type="button"
              className={styles.btnGold}
              onClick={onNextStage}
              style={{ width: "100%" }}
              data-testid="result-next-stage"
            >
              下一關
            </button>
          )}
          {isWin && !hasNextStage && nextLocked && (
            <div
              className="small text-center"
              style={{ color: "rgba(255,255,255,0.8)" }}
              data-testid="result-next-locked"
            >
              下一關還沒解鎖（這場沒有寫入共用進度）：可以從「選擇關卡」挑已解鎖的關卡，或用自由演練試玩。
            </div>
          )}
          {/* 共用帳號這場沒有寫入進度：不說「已通關全部」 */}
          {isWin && !hasNextStage && !nextLocked && !rewardResult?.notSaved && (
            <div
              style={{
                background: "rgba(245, 158, 11, 0.15)",
                border: "1px dashed #f59e0b",
                borderRadius: 8,
                padding: "6px 10px",
                textAlign: "center",
                color: "#ffca28",
                fontSize: "0.82rem",
                fontWeight: 700,
              }}
            >
              🏆 恭喜主公！已通關當前版本所有開放關卡！
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              className={styles.btnOutline}
              onClick={onRetry}
              style={{ flex: 1 }}
            >
              重新挑戰
            </button>
            <button
              type="button"
              className={styles.btnOutline}
              onClick={onOpenStageSelector}
              style={{ flex: 1 }}
            >
              選擇關卡
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
