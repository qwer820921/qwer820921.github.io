// app/layout.tsx
import "./globals.css";
import "bootstrap/dist/css/bootstrap.min.css"; // Bootstrap 样式
import type { Metadata } from "next";
import Script from "next/script";
import Navbar from "@/components/common/navbar";
import Footer from "@/components/common/footer";
import BreadcrumbJsonLd from "@/components/common/seo/breadcrumbJsonLd";
import BootstrapClient from "@/components/common/bootstrapClient";
import WebVitalsClient from "@/components/common/webVitalsClient";

export const metadata: Metadata = {
  metadataBase: new URL("https://qwer820921.github.io"),
  title: {
    default: "子yee 萬事屋",
    template: "%s | 子yee",
  },
  description:
    "子yee 萬事屋是一個提供台股即時查詢、自選股管理、生活小工具與技術解決方案的多功能平台，讓您在投資與生活中更高效。",
  keywords:
    "子yee 萬事屋, 台股查詢, 自選股, 技術小工具, 股票資訊平台, 技術顧問, 自動化工具",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
  verification: {
    google: "adHIcDQiasHY4YzPlrpmSSPKl7Oj1WxrPJ_4GV4PQcM",
  },
  openGraph: {
    siteName: "子yee 萬事屋",
    locale: "zh_TW",
    type: "website",
    images: [
      {
        url: "https://qwer820921.github.io/logo512.png",
        width: 512,
        height: 512,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    images: ["https://qwer820921.github.io/logo512.png"],
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
        {/* 結構化資料 */}
        <BreadcrumbJsonLd />

        {/* Navbar */}
        <Navbar />

        {/* 主內容區塊 */}
        <main className="App container-fluid mt-5">{children}</main>

        {/* Footer */}
        <Footer />

        {/* Bootstrap JavaScript 客戶端初始化（如果有） */}
        <BootstrapClient />

        {/* WebVitals 指標收集 */}
        <WebVitalsClient />

        {/* noscript 保留提示 */}
        <noscript>You need to enable JavaScript to run this app.</noscript>
      </body>
    </html>
  );
}
