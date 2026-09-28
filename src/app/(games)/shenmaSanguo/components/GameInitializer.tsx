"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  useSiteIsolationProblem,
  useSiteIsolationRecovery,
  useSiteIsolationUsable,
} from "@/utils/siteIsolation/useSiteIsolation";
import { getPlayerKey } from "../api/gameApi";
import { PLAYER_SESSION_KEY, usePlayerStore } from "../store/playerStore";
import { useStaticConfigStore } from "../store/staticConfigStore";
import { SyncStatus } from "../types";
import { findIsolationRecovery } from "../utils/isolationRecovery";
import UpgradeUnconfirmedNotice from "./UpgradeUnconfirmedNotice";
import SwitchFailedNotice from "./SwitchFailedNotice";
import MigrationHoldNotice from "./MigrationHoldNotice";
import IsolationProblemNotice from "./IsolationProblemNotice";
import styles from "../styles/shenmaSanguo.module.css";

const MAIN_PATH = "/shenmaSanguo";
const SETTINGS_PATH = "/shenmaSanguo/settings";

export default function GameInitializer() {
  const router = useRouter();
  const pathname = usePathname();

  const loadFromSession = usePlayerStore((s) => s.loadFromSession);
  const initFromGAS = usePlayerStore((s) => s.initFromGAS);
  const backgroundRefresh = usePlayerStore((s) => s.backgroundRefresh);
  // 只訂閱 key：玩家載入成功後才出現，之後升級／改隊伍都不會改變它
  const playerKey = usePlayerStore((s) => s.player?.key ?? null);
  const syncStatus = usePlayerStore(
    (s) => s.player?.syncStatus ?? SyncStatus.Idle
  );
  // 切換存檔失敗（視窗關閉後才失敗時，主畫面靠這個提示）
  const switchFailed = usePlayerStore((s) => s.switchNotice !== null);
  // 遷移狀態不明的寫入限制（見 types 的 MigrationHold）：一直顯示，不能關閉
  const writeHold = usePlayerStore((s) => s.writeHold);

  const hasConfig = useStaticConfigStore(
    (s) => (s.config?.heroesConfig?.length ?? 0) > 0
  );
  const loadConfig = useStaticConfigStore((s) => s.loadConfig);
  const configError = useStaticConfigStore((s) => s.error);
  const clearConfigError = useStaticConfigStore((s) => s.clearError);

  const [retrying, setRetrying] = useState(false);

  // 跨來源隔離的遷移完成、而且這一頁不需要先換頁（例如從 bgRemover 用 SPA 進來）之後，才讀取 session 與初始化
  const isolationReady = useSiteIsolationUsable(pathname);
  // 遷移的存檔處理還沒完成（查不到舊註冊、備份寫不回 session、暫存存不進復原區）：暫停讀取與保存
  const isolationProblem = useSiteIsolationProblem();
  // 網站移除全站隔離時，這個分頁留下、無法確認新舊的暫存（不會自動採用）
  const { tabId, entries } = useSiteIsolationRecovery();
  const recovery = findIsolationRecovery(
    entries,
    tabId,
    PLAYER_SESSION_KEY,
    playerKey
  );

  // store 層級也暫停（登入、切換帳號、手動同步等其他入口都不讀取、不保存）
  useEffect(() => {
    usePlayerStore.getState().setSessionBlocked(isolationProblem !== null);
  }, [isolationProblem]);

  // ── 玩家初始化與路由守門（切換頁面時檢查）──
  useEffect(() => {
    if (!isolationReady || isolationProblem !== null) return;
    // 讀不回網站更新前的暫存（遷移狀態不明）：這個分頁之後不送出任何寫入，只能讀取（store 在每次寫入前也會檢查）
    if (window.__siteIsolation?.lostCopy) {
      usePlayerStore.getState().holdMigrationWrites();
    }
    const isMainPage = pathname === MAIN_PATH;
    const isSettingsPage = pathname === SETTINGS_PATH;
    const key = getPlayerKey();

    if (!key) {
      if (!isMainPage && !isSettingsPage) router.replace(MAIN_PATH);
      return;
    }

    // 讀 store 當下值，不訂閱整個 player，避免每次升級都重新初始化
    if (!usePlayerStore.getState().player) {
      // session 必須屬於目前的 key；有未同步修改時 loadFromSession 會自動補送。
      // 不可信的 session（開機腳本無法處理的暫存）一律有 problem，前面已經停下
      const hasSession = loadFromSession(key);
      if (hasSession) {
        void backgroundRefresh(key); // 有快取 → 背景靜默刷新（有未同步修改時會自動略過）
      } else {
        void initFromGAS(key); // 無快取 → 阻塞式載入；失敗時主畫面顯示錯誤與重試
      }
    }
  }, [
    isolationReady,
    isolationProblem,
    pathname,
    router,
    loadFromSession,
    initFromGAS,
    backgroundRefresh,
  ]);

  // ── 靜態設定：玩家載入成功後初始化 ──
  // 依賴 playerKey 而非 localStorage，首次輸入金鑰（pathname 不變）也會觸發；
  // 失敗時停在錯誤提示等使用者按「重試」，不自動重打
  useEffect(() => {
    if (!playerKey || hasConfig || configError) return;
    void loadConfig();
  }, [playerKey, hasConfig, configError, loadConfig]);

  const handleRetry = async () => {
    clearConfigError();
    setRetrying(true);
    await loadConfig();
    setRetrying(false);
  };

  // ── 全域同步狀態細條 ──
  const barClass =
    syncStatus === SyncStatus.Unconfirmed
      ? styles.syncBarUnconfirmed
      : syncStatus === SyncStatus.Syncing
        ? styles.syncBarSyncing
        : syncStatus === SyncStatus.Pending
          ? styles.syncBarPending
          : styles.syncBarIdle;
  const unconfirmed = syncStatus === SyncStatus.Unconfirmed;

  return (
    <>
      <div
        className={`${styles.syncBar} ${barClass}`}
        data-sync-status={syncStatus}
      />
      {/* 遊戲設定載入失敗：固定在頁面頂部 */}
      {configError && (
        <div className={styles.topNotices}>
          <div className={`${styles.notice} ${styles.noticeDanger}`}>
            <span className={styles.noticeText}>
              ⚠ 遊戲設定載入失敗（{configError}）— 部分頁面功能暫時無法使用
            </span>
            <button
              className={styles.noticeBtn}
              onClick={handleRetry}
              disabled={retrying}
            >
              {retrying ? "重試中..." : "重試"}
            </button>
          </div>
        </div>
      )}
      {/* 固定在頁面底部，不擋住上方的 HUD 按鈕：存檔處理暫停、切換存檔失敗、存檔暫停保存（含網站更新前的暫存）、武將升級結果待確認 */}
      {(isolationProblem || unconfirmed || switchFailed || writeHold) && (
        <div className={styles.bottomNotices}>
          {isolationProblem && (
            <IsolationProblemNotice problem={isolationProblem} />
          )}
          <SwitchFailedNotice />
          {writeHold && <MigrationHoldNotice item={recovery} />}
          {unconfirmed && <UpgradeUnconfirmedNotice />}
        </div>
      )}
    </>
  );
}
