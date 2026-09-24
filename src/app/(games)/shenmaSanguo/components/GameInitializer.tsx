"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getPlayerKey } from "../api/gameApi";
import { usePlayerStore } from "../store/playerStore";
import { useStaticConfigStore } from "../store/staticConfigStore";
import { SyncStatus } from "../types";
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

  const hasConfig = useStaticConfigStore(
    (s) => (s.config?.heroesConfig?.length ?? 0) > 0
  );
  const loadConfig = useStaticConfigStore((s) => s.loadConfig);
  const configError = useStaticConfigStore((s) => s.error);
  const clearConfigError = useStaticConfigStore((s) => s.clearError);

  const [retrying, setRetrying] = useState(false);

  // ── 玩家初始化與路由守門（切換頁面時檢查）──
  useEffect(() => {
    const isMainPage = pathname === MAIN_PATH;
    const isSettingsPage = pathname === SETTINGS_PATH;
    const key = getPlayerKey();

    if (!key) {
      if (!isMainPage && !isSettingsPage) router.replace(MAIN_PATH);
      return;
    }

    // 讀 store 當下值，不訂閱整個 player，避免每次升級都重新初始化
    if (!usePlayerStore.getState().player) {
      const hasSession = loadFromSession();
      if (hasSession) {
        void backgroundRefresh(key); // 有快取 → 背景靜默刷新
      } else {
        void initFromGAS(key); // 無快取 → 阻塞式載入
      }
    }
  }, [pathname, router, loadFromSession, initFromGAS, backgroundRefresh]);

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

  // ── 靜態設定載入失敗提示（固定在頁面頂部）──
  if (configError) {
    return (
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          background: "#fef2f2",
          borderBottom: "1px solid #fecaca",
          padding: "0.6rem 1rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
          fontSize: "0.8rem",
        }}
      >
        <span style={{ color: "#b91c1c" }}>
          ⚠ 遊戲設定載入失敗（{configError}）— 部分頁面功能暫時無法使用
        </span>
        <button
          onClick={handleRetry}
          disabled={retrying}
          style={{
            background: "#ef4444",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "3px 12px",
            cursor: "pointer",
            fontSize: "0.78rem",
            fontWeight: 600,
            whiteSpace: "nowrap",
            opacity: retrying ? 0.6 : 1,
          }}
        >
          {retrying ? "重試中..." : "重試"}
        </button>
      </div>
    );
  }

  // ── 全域同步狀態細條 ──
  const barClass =
    syncStatus === SyncStatus.Syncing
      ? styles.syncBarSyncing
      : syncStatus === SyncStatus.Pending
        ? styles.syncBarPending
        : styles.syncBarIdle;

  return <div className={`${styles.syncBar} ${barClass}`} />;
}
