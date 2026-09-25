"use client";

import styles from "../styles/shenmaSanguo.module.css";

interface Props {
  /** 正在重新載入遊戲 */
  retrying: boolean;
  /** 已經重新載入過，仍然是不相符的版本 */
  retried: boolean;
  onRetry: () => void;
}

/**
 * 遊戲版本和網頁不相符（遊戲已回覆，但橋接協定版本不同，通常是瀏覽器還在用舊版遊戲的快取）
 * 這時不送出關卡資料、不會開戰。重新載入只換掉遊戲畫面，存檔與未同步的修改都保留在這個分頁；
 * 不會自動重試，由玩家決定何時再試
 */
export default function EngineUpdatePrompt({
  retrying,
  retried,
  onRetry,
}: Props) {
  return (
    <div
      className={`${styles.loadingOverlay} ${styles.engineNotice}`}
      data-testid="engine-incompatible"
      role="alert"
    >
      <p className={styles.engineNoticeTitle}>遊戲版本需要更新</p>
      <p className={styles.engineNoticeText}>
        {retried
          ? "重新載入後仍然是舊版的遊戲。可以稍後再試一次，或關閉所有神馬三國的分頁後重新開啟。"
          : "載入的遊戲是舊版本（可能是瀏覽器的快取），和網頁不相符，所以還不能開始戰鬥。"}
        <br />
        重新載入只會更新遊戲畫面，存檔與還沒同步的修改都會保留。
      </p>
      <button className={styles.btnGold} onClick={onRetry} disabled={retrying}>
        {retrying ? "重新載入中..." : "重新載入遊戲"}
      </button>
    </div>
  );
}
