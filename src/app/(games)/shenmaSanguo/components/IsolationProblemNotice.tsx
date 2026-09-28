"use client";

import type { SiteIsolationProblem } from "@/utils/siteIsolation/boot";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 網站遷移的存檔處理還沒完成（見 utils/siteIsolation/boot.ts 的 problem）：
 * 暫停讀取與保存，說明原因並提供重試；查不到舊註冊時也可以改用雲端存檔繼續
 */
export default function IsolationProblemNotice({
  problem,
}: {
  problem: SiteIsolationProblem;
}) {
  const api =
    typeof window === "undefined" ? undefined : window.__siteIsolation;
  const text =
    problem === "lookup-failed"
      ? "無法確認網站更新的狀態（瀏覽器查詢 Service Worker 失敗）。為了不讀到舊的暫存、也不蓋掉雲端較新的存檔，先暫停讀取與保存。可以重試；或改用雲端存檔繼續（這個分頁的暫存會保留在瀏覽器中，之後每次保存都會先讀取雲端最新資料再合併）。"
      : "瀏覽器的儲存空間不足，無法安全處理網站更新前的存檔。為了不蓋掉任何一份資料，先暫停讀取與保存；資料仍保留在瀏覽器中。請清出空間後重試。";
  return (
    <div
      className={`${styles.notice} ${styles.noticeDanger}`}
      data-testid="isolation-problem"
      data-problem={problem}
    >
      <span className={styles.noticeText}>
        <strong>存檔處理暫停</strong>：{text}
      </span>
      <span className={styles.noticeActions}>
        <button className={styles.noticeBtn} onClick={() => api?.retry()}>
          重試
        </button>
        {problem === "lookup-failed" && (
          <button
            className={styles.noticeBtn}
            onClick={() => api?.continueWithCloud()}
          >
            改用雲端存檔繼續
          </button>
        )}
      </span>
    </div>
  );
}
