"use client";

import { READ_RETRY_DELAYS_MS } from "../api/gameApi";
import {
  selectReadRetry,
  selectReadSlow,
  useReadWaitStore,
} from "../store/readWaitStore";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 玩家正在等的讀取（登入、切換存檔、手動同步、載入遊戲設定）回應較慢或正在自動重試時的說明。
 * 只是說明，不能操作、不搶焦點；重試用完仍失敗時由原本的錯誤畫面提供重試與其他出口。
 * 外層的 status 區域一直存在，文字出現或改變時螢幕閱讀器才會讀出
 */
export default function ReadWaitNotice() {
  const retry = useReadWaitStore(selectReadRetry);
  const slow = useReadWaitStore(selectReadSlow);
  const text =
    retry > 0
      ? `連線不穩定，正在自動重試（第 ${retry} 次，最多 ${READ_RETRY_DELAYS_MS.length} 次）…`
      : slow
        ? "伺服器回應較慢，仍在讀取中，請稍候…"
        : null;
  return (
    <div role="status" aria-live="polite">
      {text && (
        <div
          className={`${styles.notice} ${styles.noticeInfo}`}
          data-testid="read-wait-notice"
          data-read-retry={retry}
        >
          <span className={styles.noticeText}>{text}</span>
        </div>
      )}
    </div>
  );
}
