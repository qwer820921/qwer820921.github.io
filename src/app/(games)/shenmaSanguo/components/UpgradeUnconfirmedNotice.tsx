"use client";

import { useState } from "react";
import { usePlayerStore } from "../store/playerStore";
import { useStaticConfigStore } from "../store/staticConfigStore";
import { describePlayerError } from "../utils/playerErrors";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 武將升級結果待確認時的提示（固定在畫面下方，不擋住上方的 HUD 按鈕）
 * 只提供「重新確認」：重新讀取伺服器，看得到這次升級就採用，並保存本機的其他修改。
 * 看不到升級不代表確定沒套用（舊請求可能還沒被處理），所以沒有強制解除保護的入口。
 */
export default function UpgradeUnconfirmedNotice() {
  const heroId = usePlayerStore(
    (s) => s.player?.pendingUpgrade?.hero_id ?? null
  );
  const checking = usePlayerStore((s) => s.checkingUpgrade);
  const recheck = usePlayerStore((s) => s.recheckPendingUpgrade);
  const heroName = useStaticConfigStore(
    (s) => s.config?.heroesConfig?.find((h) => h.hero_id === heroId)?.name
  );
  const [message, setMessage] = useState<string | null>(null);

  const handleRecheck = async () => {
    setMessage(null);
    const r = await recheck();
    if (!r.ok) {
      setMessage(
        r.error === "UPGRADE_UNCONFIRMED"
          ? "伺服器上還看不到這次升級，請稍後再確認一次。"
          : `確認失敗：${describePlayerError(r.error)}（代碼：${r.error}）`
      );
    }
  };

  return (
    <div
      className={`${styles.notice} ${styles.noticeWarning}`}
      data-testid="upgrade-unconfirmed"
    >
      <span className={styles.noticeText}>
        <strong>{heroName ?? "武將"}的升級結果待確認</strong>
        ：連線中斷，無法確定伺服器是否已完成升級。為了不蓋掉可能已完成的升級，確認之前先不保存存檔；本機的修改都還在這個分頁裡，關閉分頁會遺失。
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
