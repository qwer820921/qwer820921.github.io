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

  const { player, loadFromSession, initFromGAS } = usePlayerStore();
  const {
    config,
    loadConfig,
    error: configError,
    clearError: clearConfigError,
  } = useStaticConfigStore();

  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const isMainPage = pathname === MAIN_PATH;
    const isSettingsPage = pathname === SETTINGS_PATH;
    const key = getPlayerKey();

    if (!key) {
      if (!isMainPage && !isSettingsPage) router.replace(MAIN_PATH);
      return;
    }

    if (!player) {
      const hasSession = loadFromSession();
      if (!hasSession) initFromGAS(key);
    }

    if (!config || config.heroesConfig.length === 0) {
      loadConfig();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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
  const syncStatus = player?.syncStatus ?? SyncStatus.Idle;
  const barClass =
    syncStatus === SyncStatus.Syncing
      ? styles.syncBarSyncing
      : syncStatus === SyncStatus.Pending
        ? styles.syncBarPending
        : styles.syncBarIdle;

  return <div className={`${styles.syncBar} ${barClass}`} />;
}
