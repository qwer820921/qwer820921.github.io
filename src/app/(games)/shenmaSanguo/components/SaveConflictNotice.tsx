"use client";

import { usePlayerStore } from "../store/playerStore";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 存檔版本衝突的提示（固定在畫面下方）：雲端在其他分頁或裝置更新過，這個分頁的修改還沒保存。
 * 已暫停自動保存；按「比較並選擇」開啟比較視窗（SaveConflictModal），在那裡確認後才會改變資料
 */
export default function SaveConflictNotice({
  onCompare,
}: {
  onCompare: () => void;
}) {
  const reason = usePlayerStore((s) => s.saveConflict?.reason ?? null);
  if (!reason) return null;
  return (
    <div
      className={`${styles.notice} ${styles.noticeWarning}`}
      data-testid="save-conflict"
    >
      <span className={styles.noticeText}>
        <strong>
          {reason === "base_unknown"
            ? "需要確認存檔版本"
            : "雲端存檔在其他分頁或裝置更新過"}
        </strong>
        ：這個分頁有尚未保存的修改，為了不互相覆蓋，已暫停自動保存。請比較兩份資料後選擇要保留哪一份；選擇之前修改都還在這個分頁裡（關閉分頁會遺失）。
      </span>
      <span className={styles.noticeActions}>
        <button
          className={`${styles.noticeBtn} ${styles.noticeBtnWarning}`}
          onClick={onCompare}
          data-testid="save-conflict-compare"
        >
          比較並選擇
        </button>
      </span>
    </div>
  );
}
