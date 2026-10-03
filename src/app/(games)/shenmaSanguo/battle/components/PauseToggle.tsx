"use client";
import { useEffect } from "react";
import { PauseFill, PlayFill } from "react-bootstrap-icons";
import { SpeedStats, canTogglePause, isPaused } from "../../utils/gameSpeed";
import { STAGE_RESERVE_EVENT } from "../../utils/stageAnchor";
import styles from "../../styles/shenmaSanguo.module.css";

interface PauseToggleProps {
  /** 這一場的 update_stats（Godot 已確認的暫停狀態） */
  stats: SpeedStats | null;
  /** 送出目標狀態（true 暫停、false 繼續）；畫面等 Godot 的 update_stats 才改變 */
  onSet: (paused: boolean) => void;
  /** hud：主頁的 HUD 按鈕列；top：獨立戰鬥頁的頂欄 */
  variant: "hud" | "top";
}

/**
 * 手動暫停／繼續：主頁 HUD 與獨立戰鬥頁頂欄共用。
 * 顯示的是 Godot 已確認的狀態：未暫停時是「暫停」，暫停中亮起、變成「繼續」（按下後等 update_stats 才改變，不先改顯示）。
 * 很窄的畫面只留圖示（文字仍是按鈕的名稱）；暫停中戰場上另有「已暫停」與「繼續」（PauseBadge）
 */
export default function PauseToggle({
  stats,
  onSet,
  variant,
}: PauseToggleProps) {
  const paused = isPaused(stats);
  const enabled = canTogglePause(stats);
  const btn = variant === "hud" ? styles.hudBarBtn : styles.topBtn;
  const active =
    variant === "hud" ? styles.hudActionBtnActive : styles.topBtnActive;
  const label = paused ? "繼續" : "暫停";

  return (
    <button
      type="button"
      className={`${btn} ${styles.pauseBtn} ${paused ? active : ""}`}
      aria-pressed={paused}
      aria-label={label}
      disabled={!enabled}
      data-testid="pause-toggle"
      title={paused ? "繼續戰鬥" : "暫停戰鬥"}
      onClick={() => onSet(!paused)}
    >
      {paused ? <PlayFill aria-hidden /> : <PauseFill aria-hidden />}
      <span className={styles.pauseLabel}>{label}</span>
    </button>
  );
}

interface PauseBadgeProps {
  stats: SpeedStats | null;
  onSet: (paused: boolean) => void;
}

/**
 * 戰場上的「已暫停」：只在 Godot 確認暫停後出現，放在遊戲畫面下方中央，旁邊有「繼續」。
 * 只有這一小塊擋住點擊：暫停中仍可點地圖上的單位查看資訊。
 * 它是戰場下方的保留區（data-stage-reserve="bottom"）：開著的選取面板不蓋住它，出現與消失時通知面板重新定位
 */
export function PauseBadge({ stats, onSet }: PauseBadgeProps) {
  const paused = isPaused(stats);
  useEffect(() => {
    window.dispatchEvent(new Event(STAGE_RESERVE_EVENT));
  }, [paused]);
  if (!paused) return null;
  return (
    <div
      className={styles.pauseBadge}
      role="status"
      data-testid="pause-badge"
      data-stage-reserve="bottom"
    >
      <span className={styles.pauseBadgeText}>已暫停</span>
      <button
        type="button"
        className={styles.pauseResumeBtn}
        disabled={!canTogglePause(stats)}
        data-testid="pause-resume"
        onClick={() => onSet(false)}
      >
        <PlayFill aria-hidden /> 繼續
      </button>
    </div>
  );
}
