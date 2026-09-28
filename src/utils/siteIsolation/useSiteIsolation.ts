import { useEffect, useSyncExternalStore } from "react";
import type { SiteIsolationProblem, SiteIsolationRecoveryEntry } from "./boot";

// 開機腳本（boot.ts）在每一頁最早執行並建立 window.__siteIsolation；這裡是給 React 元件用的包裝

const subscribe = (fn: () => void) =>
  window.__siteIsolation ? window.__siteIsolation.subscribe(fn) : () => {};

/**
 * 目前的路徑能不能使用 sessionStorage 的資料（跨來源隔離的遷移已完成，而且這一頁不需要換頁）。
 * 同時要求開機腳本依路徑檢查一次：從 bgRemover 用 SPA 進來時，會在初始化之前先換成非隔離的頁面。
 * 沒有開機腳本（不應發生）時視為可以使用，維持原本的行為
 */
export function useSiteIsolationUsable(pathname: string): boolean {
  const usable = useSyncExternalStore(
    subscribe,
    () =>
      window.__siteIsolation ? window.__siteIsolation.usable(pathname) : true,
    () => false
  );
  useEffect(() => {
    window.__siteIsolation?.check(pathname);
  }, [pathname]);
  return usable;
}

/** 這個分頁的識別與復原區的內容（以字串作為快照，內容沒變就是同一個值） */
export function useSiteIsolationRecovery(): {
  tabId: string | null;
  entries: SiteIsolationRecoveryEntry[];
} {
  const raw = useSyncExternalStore(
    subscribe,
    () =>
      window.__siteIsolation
        ? JSON.stringify({
            tabId: window.__siteIsolation.tabId,
            entries: window.__siteIsolation.recovery.list(),
          })
        : "",
    () => ""
  );
  if (!raw) return { tabId: null, entries: [] };
  const parsed = JSON.parse(raw) as {
    tabId: string;
    entries: SiteIsolationRecoveryEntry[];
  };
  return { tabId: parsed.tabId, entries: parsed.entries };
}

/** 頁面不能使用 session 資料的原因（沒有時是 null）；神馬三國據此暫停讀取與保存並顯示提示 */
export function useSiteIsolationProblem(): SiteIsolationProblem | null {
  return useSyncExternalStore(
    subscribe,
    () => window.__siteIsolation?.problem ?? null,
    () => null
  );
}
