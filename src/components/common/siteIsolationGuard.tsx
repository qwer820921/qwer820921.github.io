"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * SPA 換頁時依路徑檢查跨來源隔離（見 utils/siteIsolation/boot.ts）
 * - 進入 bgRemover：註冊它的 coi Service Worker，重新載入成為隔離狀態
 * - 從 bgRemover 換到其他頁：先備份再重新載入成為非隔離狀態
 * 完整載入的頁面由 layout 的開機腳本處理
 */
export default function SiteIsolationGuard() {
  const pathname = usePathname();
  useEffect(() => {
    if (pathname) window.__siteIsolation?.check(pathname);
  }, [pathname]);
  return null;
}
