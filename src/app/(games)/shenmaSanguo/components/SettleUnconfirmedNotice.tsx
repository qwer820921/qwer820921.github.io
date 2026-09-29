"use client";

import { useState } from "react";
import { usePlayerStore } from "../store/playerStore";
import { describePlayerError } from "../utils/playerErrors";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 戰鬥結算的結果待確認時的提示（固定在畫面下方，不擋住上方的 HUD 按鈕）
 * 「重新確認」用同一場的識別碼與同一份內容重新送出：伺服器已保存過就回傳第一次的結果，不會重複發獎。
 * 確認之前不送整份保存（避免獎勵被寫兩次），本機的獎勵與修改都還在這個分頁
 */
export default function SettleUnconfirmedNotice() {
  const count = usePlayerStore(
    (s) =>
      (s.player?.pendingSettles ?? []).filter((p) => p.state === "unknown")
        .length
  );
  const recheck = usePlayerStore((s) => s.recheckPendingSettles);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleRecheck = async () => {
    setMessage(null);
    setChecking(true);
    const r = await recheck();
    setChecking(false);
    if (!r.ok) {
      setMessage(
        r.error === "SETTLE_UNCONFIRMED"
          ? "還是無法連線確認，請稍後再試一次（會自動重試幾次）。"
          : `確認失敗：${describePlayerError(r.error)}（代碼：${r.error}）`
      );
    }
  };

  return (
    <div
      className={`${styles.notice} ${styles.noticeWarning}`}
      data-testid="settle-unconfirmed"
    >
      <span className={styles.noticeText}>
        <strong>戰鬥結算待確認{count > 1 ? `（${count} 場）` : ""}</strong>
        ：連線中斷，還不能確定雲端是否已保存這場的點數與經驗。確認之前先不保存存檔，以免獎勵被寫兩次；畫面上的獎勵與本機修改都還在這個分頁裡，關閉分頁會遺失。
        {message && (
          <>
            <br />
            {message}
          </>
        )}
      </span>
      <span className={styles.noticeActions}>
        <button
          className={`${styles.noticeBtn} ${styles.noticeBtnWarning}`}
          onClick={handleRecheck}
          disabled={checking}
        >
          {checking ? "確認中..." : "重新確認"}
        </button>
      </span>
    </div>
  );
}
