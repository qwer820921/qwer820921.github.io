"use client";

import { usePlayerStore } from "../store/playerStore";
import { describePlayerError } from "../utils/playerErrors";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 切換存檔失敗的提示（固定在畫面下方）
 * 玩家資訊視窗關閉後才失敗時（例如切換送出後才開打），主畫面靠它告訴玩家「沒有切換」。
 * 只顯示目前的暱稱與原因，不顯示任何存檔金鑰；切換成功、開始新的切換或按「知道了」就消失
 */
export default function SwitchFailedNotice() {
  const notice = usePlayerStore((s) => s.switchNotice);
  const nickname = usePlayerStore((s) => s.player?.nickname ?? "");
  const clear = usePlayerStore((s) => s.clearSwitchNotice);
  if (!notice) return null;

  return (
    <div
      className={`${styles.notice} ${styles.noticeWarning}`}
      data-testid="switch-failed-notice"
      role="alert"
    >
      <span className={styles.noticeText}>
        <strong>未切換存檔</strong>
        ，目前仍是「{nickname}」：{describePlayerError(notice.error)}
      </span>
      <span className={styles.noticeActions}>
        <button
          className={`${styles.noticeBtn} ${styles.noticeBtnWarning}`}
          onClick={clear}
        >
          知道了
        </button>
      </span>
    </div>
  );
}
