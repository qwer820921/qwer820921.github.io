"use client";

import React from "react";
import { BattleResultData } from "../engine/BattleManager";
import { BattleRewardResult } from "../types/player";
import type { SharedSettleView } from "../store/useJsPlayerStore";
import styles from "../styles/shenmaSanguoJs.module.css";

interface BattleResultModalProps {
  show: boolean;
  result: BattleResultData | null;
  rewardResult?: BattleRewardResult | null;
  /** 共用帳號這場的結算狀態（保存中、已保存、待確認、沒有送出、要人工確認）；訪客不傳 */
  sharedSettle?: SharedSettleView | null;
  /** 待確認時的「重新確認」（使用者明確按才原樣再送） */
  onRetrySettle?: () => void;
  retryDisabled?: boolean;
  /** 重新確認沒有送出或沒有確認時的說明 */
  retryMessage?: string | null;
  hasNextStage?: boolean;
  /** 還有下一關，但還沒解鎖：不顯示「已通關全部」，改說明下一關未解鎖 */
  nextLocked?: boolean;
  onRetry: () => void;
  onNextStage: () => void;
  onOpenStageSelector: () => void;
}

export const BattleResultModal: React.FC<BattleResultModalProps> = ({
  show,
  result,
  rewardResult,
  sharedSettle = null,
  onRetrySettle,
  retryDisabled = false,
  retryMessage = null,
  hasNextStage = true,
  nextLocked = false,
  onRetry,
  onNextStage,
  onOpenStageSelector,
}) => {
  if (!show || !result) return null;

  const isWin = result.result === "WIN";
  // 共用帳號沒有本機的獎勵結果：星數直接用引擎回呼的這場結果
  const stars = rewardResult?.stars ?? (result.stars_earned || 0);
  // 列出的獎勵：訪客用本機規則的結果；共用帳號只在後端保存並讀回確認後，列後端回應的這次獎勵
  const loot =
    rewardResult && !rewardResult.notSaved
      ? rewardResult
      : sharedSettle?.phase === "confirmed" && sharedSettle.reward
        ? {
            goldEarned: sharedSettle.reward.points,
            expEarned: sharedSettle.reward.exp,
            leveledUp: sharedSettle.reward.leveledUp,
            newLevel: sharedSettle.reward.newLevel,
            stageUnlocked: undefined,
          }
        : null;
  const settleTestId: Record<SharedSettleView["phase"], string> = {
    saving: "result-settle-saving",
    confirmed: "result-settle-confirmed",
    pending: "result-settle-pending",
    "not-sent": "result-not-saved",
    review: "result-settle-review",
  };

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

        {/* 共用帳號：這場結算的狀態（保存中、已保存、待確認、沒有送出、要人工確認） */}
        {sharedSettle && (
          <div
            className={styles.resultLoots}
            data-testid={settleTestId[sharedSettle.phase]}
          >
            <div className={styles.resultLootItem}>
              <span className={styles.resultLootName}>{sharedSettle.text}</span>
            </div>
            {sharedSettle.phase === "pending" && onRetrySettle && (
              <button
                type="button"
                className={`${styles.btnOutline} w-100 mt-2`}
                onClick={onRetrySettle}
                disabled={retryDisabled}
                data-testid="result-settle-retry"
              >
                重新確認
              </button>
            )}
            {retryMessage && (
              <div className={styles.resultLootItem}>
                <span
                  className={styles.resultLootName}
                  data-testid="result-settle-retry-feedback"
                >
                  {retryMessage}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 斬獲獎勵與戰利品（共用帳號的落敗也有後端的點數與經驗） */}
        {loot && (isWin || !!sharedSettle) && (
          <div className={styles.resultLoots}>
            <div className={styles.resultLootItem}>
              <span className={styles.resultLootName}>🪙 主公金幣</span>
              <span className={styles.resultLootCount}>+{loot.goldEarned}</span>
            </div>
            <div className={styles.resultLootItem}>
              <span className={styles.resultLootName}>🎓 主公經驗</span>
              <span className={styles.resultLootCount}>+{loot.expEarned}</span>
            </div>
            {loot.leveledUp && (
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
                  Lv.{loot.newLevel}
                </span>
              </div>
            )}
            {loot.stageUnlocked && (
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
                  {loot.stageUnlocked}
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
              下一關還沒解鎖：可以從「選擇關卡」挑已解鎖的關卡，或用自由演練試玩。
            </div>
          )}
          {/* 共用帳號只有保存並確認後才說「已通關全部」 */}
          {isWin &&
            !hasNextStage &&
            !nextLocked &&
            (sharedSettle
              ? sharedSettle.phase === "confirmed"
              : !rewardResult?.notSaved) && (
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
