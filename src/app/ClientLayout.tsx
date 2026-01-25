"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AuthProvider } from "@/contexts/AuthContext";
import dynamic from "next/dynamic";

// 使用 dynamic import 來動態加載客戶端組件
const Navbar = dynamic(() => import("@/components/common/navbar"), {
  ssr: false,
});
const Footer = dynamic(() => import("@/components/common/footer"), {
  ssr: false,
});
const BreadcrumbJsonLd = dynamic(
  () => import("@/components/common/seo/breadcrumbJsonLd"),
  { ssr: false }
);
const BootstrapClient = dynamic(
  () => import("@/components/common/bootstrapClient"),
  { ssr: false }
);
const WebVitalsClient = dynamic(
  () => import("@/components/common/webVitalsClient"),
  { ssr: false }
);

// 不顯示 Footer 的頁面路徑
const HIDE_FOOTER_PAGES = ["/clickAscension"];

export default function ClientLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // 檢查當前路徑是否需要隱藏 Footer
  const shouldHideFooter = HIDE_FOOTER_PAGES.some((path) =>
    pathname?.startsWith(path)
  );

  return (
    <AuthProvider>
      {/* 結構化資料 */}
      <BreadcrumbJsonLd />

      {/* Navbar - 始終顯示 */}
      <Navbar />

      {/* 主內容區塊 */}
      <main className={shouldHideFooter ? "" : "container-fluid mt-5 p-0"}>
        {children}
      </main>

      {/* Footer - 特定頁面不顯示 */}
      {!shouldHideFooter && <Footer />}

      {/* Bootstrap JavaScript 客戶端初始化（如果有） */}
      <BootstrapClient />

      {/* WebVitals 指標收集 */}
      <WebVitalsClient />

      {/* noscript 保留提示 */}
      <noscript>You need to enable JavaScript to run this app.</noscript>
    </AuthProvider>
  );
}
