"use client";
import {
  GAME_SPEEDS,
  GameSpeed,
  SpeedStats,
  canChangeSpeed,
  confirmedSpeed,
  isDeploySlow,
  isPaused,
} from "../../utils/gameSpeed";
import styles from "../../styles/shenmaSanguo.module.css";

interface SpeedToggleProps {
  /** 這一場的 update_stats（Godot 已確認的速度與實際倍率） */
  stats: SpeedStats | null;
  onSelect: (speed: GameSpeed) => void;
  /** hud：主頁的 HUD 按鈕列；top：獨立戰鬥頁的頂欄 */
  variant: "hud" | "top";
}

/**
 * 戰鬥速度 1×／2×：主頁 HUD 與獨立戰鬥頁頂欄共用。
 * 亮起的是 Godot 已確認的選擇（按下後等 update_stats 才改變，不先改顯示）；
 * 部署選單開著時實際是暫時慢速，按鈕下方提示，選擇會在關閉選單後套用。
 * 手動暫停中仍可選，當作繼續後的速度；暫停中不顯示慢速提示（戰場上顯示「已暫停」）
 */
export default function SpeedToggle({
  stats,
  onSelect,
  variant,
}: SpeedToggleProps) {
  const current = confirmedSpeed(stats);
  const enabled = canChangeSpeed(stats);
  const btn = variant === "hud" ? styles.hudBarBtn : styles.topBtn;
  const active =
    variant === "hud" ? styles.hudActionBtnActive : styles.topBtnActive;

  return (
    <span
      className={styles.speedToggle}
      role="group"
      aria-label="戰鬥速度"
      data-testid="speed-toggle"
    >
      {GAME_SPEEDS.map((v) => (
        <button
          key={v}
          type="button"
          className={`${btn} ${styles.speedBtn} ${current === v ? active : ""}`}
          aria-pressed={current === v}
          disabled={!enabled}
          data-testid={`speed-${v}`}
          title={`${v} 倍速`}
          onClick={() => {
            if (current !== v) onSelect(v);
          }}
        >
          {v}×
        </button>
      ))}
      {isDeploySlow(stats) && !isPaused(stats) && (
        <span className={styles.speedHint} data-testid="speed-deploy-hint">
          部署中暫時慢速
        </span>
      )}
    </span>
  );
}
