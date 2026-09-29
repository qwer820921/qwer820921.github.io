"use client";

import { useState } from "react";
import { usePlayerStore } from "../store/playerStore";
import { describePlayerError } from "../utils/playerErrors";
import { buildExport, downloadJson } from "../utils/saveConflict";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 解決存檔衝突之後的備份提示（固定在畫面下方，沒有衝突時才顯示）：
 * 選擇前的兩份資料留在這個分頁，可以匯出，也可以把被放棄／被覆蓋的那一份放回
 * （放回後當成尚未保存的修改，保存時會再出現比較，由玩家決定）。刪除前再確認一次
 */
export default function ConflictBackupNotice() {
  const backup = usePlayerStore((s) => s.conflictBackup);
  const restore = usePlayerStore((s) => s.restoreConflictBackup);
  const dismiss = usePlayerStore((s) => s.dismissConflictBackup);
  const [step, setStep] = useState<"idle" | "restore" | "dismiss">("idle");
  const [message, setMessage] = useState<string | null>(null);
  if (!backup) return null;

  const time = new Date(backup.savedAt).toLocaleString();
  const other =
    backup.choice === "server" ? "被放棄的這個分頁資料" : "被覆蓋的雲端資料";

  const exportIt = () =>
    downloadJson(
      "shenma-save-backup",
      buildExport({
        reason: backup.choice === "server" ? "used_cloud" : "kept_this_tab",
        local: backup.local,
        localBaseRev: backup.localBaseRev,
        cloud: backup.cloud,
        cloudRev: backup.cloudRev,
      })
    );

  const doRestore = () => {
    setStep("idle");
    const r = restore();
    setMessage(
      r.ok
        ? "已放回，接著會出現存檔比較，請選擇要保留哪一份。"
        : `沒有放回：${describePlayerError(r.error)}（代碼：${r.error}）`
    );
  };

  return (
    <div
      className={`${styles.notice} ${styles.noticeWarning}`}
      data-testid="conflict-backup"
    >
      <span className={styles.noticeText}>
        <strong>存檔衝突已處理</strong>（{time}，
        {backup.choice === "server" ? "使用了雲端版本" : "保留了這個分頁的版本"}
        ）：選擇前的兩份資料都備份在這個分頁，可以匯出或放回{other}。
        {step === "restore" && (
          <>
            <br />
            放回後會當成尚未保存的修改，接著出現存檔比較，由你決定是否覆蓋雲端。
          </>
        )}
        {step === "dismiss" && (
          <>
            <br />
            刪除後就不能再匯出或放回這份備份。
          </>
        )}
        {message && (
          <>
            <br />
            {message}
          </>
        )}
      </span>
      <span className={styles.noticeActions}>
        {step === "idle" && (
          <>
            <button
              className={styles.noticeBtn}
              onClick={exportIt}
              data-testid="conflict-backup-export"
            >
              匯出備份
            </button>
            <button
              className={`${styles.noticeBtn} ${styles.noticeBtnWarning}`}
              onClick={() => setStep("restore")}
              data-testid="conflict-backup-restore"
            >
              放回{backup.choice === "server" ? "這個分頁的資料" : "雲端資料"}
            </button>
            <button
              className={styles.noticeBtn}
              onClick={() => setStep("dismiss")}
              data-testid="conflict-backup-dismiss"
            >
              刪除備份
            </button>
          </>
        )}
        {step !== "idle" && (
          <>
            <button
              className={`${styles.noticeBtn} ${styles.noticeBtnWarning}`}
              onClick={step === "restore" ? doRestore : dismiss}
              data-testid="conflict-backup-confirm"
            >
              {step === "restore" ? "確定放回" : "確定刪除"}
            </button>
            <button
              className={styles.noticeBtn}
              onClick={() => setStep("idle")}
              data-testid="conflict-backup-cancel"
            >
              取消
            </button>
          </>
        )}
      </span>
    </div>
  );
}
