"use client";

import { useState } from "react";
import { usePlayerStore } from "../store/playerStore";
import { useStaticConfigStore } from "../store/staticConfigStore";
import { IsolationRecoveryItem } from "../utils/isolationRecovery";
import styles from "../styles/shenmaSanguo.module.css";

/**
 * 遷移狀態不明的寫入限制（見 types 的 MigrationHold）：這個分頁不再送出存檔、升級與戰鬥結算
 * - 一直顯示、不能關閉；限制本身由 store 在每次寫入前檢查，不靠這個提示，重新整理後仍然有效
 * - 平常只顯示一段簡短說明（固定在底部，不蓋住視窗的按鈕）；「說明」展開原因與更新前暫存的摘要
 * - 沒有「改用暫存並覆蓋雲端」：網站更新前留下的暫存只顯示摘要，可以下載保留（不含存檔金鑰），
 *   復原區的資料由開機腳本保留 7 天
 */
export default function MigrationHoldNotice({
  item,
}: {
  item: IsolationRecoveryItem | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const unsynced = usePlayerStore(
    (s) => !!s.player && (s.player.rev ?? 0) !== (s.player.syncedRev ?? 0)
  );
  const heroesConfig = useStaticConfigStore((s) => s.config?.heroesConfig);
  const teamText = item
    ? item.team
        .map((id) => heroesConfig?.find((h) => h.hero_id === id)?.name ?? id)
        .join("、") || "無"
    : "";

  // 下載更新前的暫存（唯讀備份）：拿掉存檔金鑰，避免檔案外流時洩漏
  const download = () => {
    if (!item) return;
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(item.value) as Record<string, unknown>;
    } catch {
      data = { raw: item.value };
    }
    delete data.key;
    const blob = new Blob(
      [JSON.stringify({ exported_at: Date.now(), save: data }, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "shenma-sanguo-before-update.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div
      className={`${styles.notice} ${styles.noticeWarning}`}
      data-testid="migration-hold"
      data-expanded={expanded ? "1" : "0"}
    >
      <span className={styles.noticeText}>
        <strong>這個分頁的存檔暫停保存</strong>
        ：不會送出任何修改，修改隊伍與暱稱、升級、開始戰鬥都已暫停；重新整理也不會解除。
        {expanded && (
          <>
            <br />
            原因：網站更新時，這個分頁讀不回更新前的暫存，無法確認更新前送出的操作（例如升級）是否稍晚才在雲端完成。為了不蓋掉雲端上可能較新的進度，這個分頁只讀取、不寫入；仍可以查看資料、從雲端讀取最新進度。目前沒有可以安全解除的方式。
            {unsynced && (
              <>
                <br />
                這個分頁還有尚未保存的修改，會留在這個分頁，不會送出。
              </>
            )}
            {item &&
              (item.dirty ? (
                <>
                  <br />
                  更新前的暫存（暱稱 {item.nickname}，隊伍 {teamText}，點數{" "}
                  {item.gold}
                  {item.pendingUpgrade ? "，含結果待確認的升級" : ""}
                  ）保留在這個瀏覽器 7 天，不會送出，可以下載保留。
                </>
              ) : (
                <>
                  <br />
                  更新前的暫存沒有未同步的修改（保留在這個瀏覽器 7
                  天，可以下載）。
                </>
              ))}
          </>
        )}
      </span>
      <span className={styles.noticeActions}>
        <button
          className={styles.noticeBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "收合" : "說明"}
        </button>
        {item && (
          <button className={styles.noticeBtn} onClick={download}>
            下載暫存
          </button>
        )}
      </span>
    </div>
  );
}
