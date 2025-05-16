// app/layout.tsx
import "./globals.css";
import "bootstrap/dist/css/bootstrap.min.css"; // Bootstrap 样式
import type { Metadata } from "next";
import Script from "next/script";
import Navbar from "@/components/common/navbar";
import Footer from "@/components/common/footer";
import AppSEO from "@/components/common/seo/appSEO";
import BreadcrumbJsonLd from "@/components/common/seo/breadcrumbJsonLd";
import BootstrapClient from "@/components/common/bootstrapClient";
import WebVitalsClient from "@/components/common/webVitalsClient";

export const metadata: Metadata = {
  title: "子yee 萬事屋",
  description:
    "子yee 萬事屋提供專業技術解決方案與服務，專注於優化商業流程、提升效率，滿足您的業務需求。",
  themeColor: "#000000",
  verification: {
    google: "adHIcDQiasHY4YzPlrpmSSPKl7Oj1WxrPJ_4GV4PQcM",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-Hant">
      <head>
        {/* favicon 與 PWA 資源 */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/logo192.png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="preload" href="/logo192.png" as="image" />

        {/* Google Analytics */}
        <Script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-CCKVESHCQ1"
        />
        <Script id="google-analytics">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-CCKVESHCQ1');
          `}
        </Script>

        {/* Google AdSense */}
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2709303513603814"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        {/* SEO 組件、結構化資料 */}
        <AppSEO />
        <BreadcrumbJsonLd />

        {/* Navbar */}
        <Navbar />

        {/* 主內容區塊 */}
        <main className="container-fluid mt-5">{children}</main>

        {/* Footer */}
        <Footer />

        {/* Bootstrap JavaScript 客戶端初始化（如果有） */}
        <BootstrapClient />

        <WebVitalsClient />

        {/* 原本的 URL 修正 script（如仍需要） */}
        {/* <Script id="rewrite-url">
          {`
            (function (l) {
              if (l.search[1] === '/') {
                var decoded = l.search.slice(1).split('&').map(function (s) {
                  return s.replace(/~and~/g, '&')
                }).join('?');
                window.history.replaceState(null, null,
                  l.pathname.slice(0, -1) + decoded + l.hash
                );
              }
            }(window.location));
          `}
        </Script> */}

        {/* 原本的 SEO 提示內容（非必要，可移除） */}
        <div style={{ display: "none" }}>
          <title>子yee 萬事屋｜台股資訊、小工具與生活應用平台</title>
          <p>
            子yee
            萬事屋提供專業技術解決方案與服務，專注於優化商業流程、提升效率，滿足您的業務需求。立即探索我們的技術諮詢、流程優化與產品解決方案！
          </p>
          <h2>我們的服務</h2>
          <ul>
            <li>技術諮詢與支持</li>
            <li>商業流程優化</li>
            <li>產品解決方案</li>
          </ul>
        </div>
        {/* noscript 保留提示 */}
        <noscript>You need to enable JavaScript to run this app.</noscript>
      </body>
    </html>
  );
}
