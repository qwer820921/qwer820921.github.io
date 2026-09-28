import "./globals.css";
import "bootstrap/dist/css/bootstrap.min.css"; // Bootstrap 样式
import type { Metadata, Viewport } from "next";
import Script from "next/script";
import ClientRoot from "./ClientRoot";
import ChatWidget from "@/components/common/chatWidget";
import { siteIsolationBoot } from "@/utils/siteIsolation/boot";

// 跨來源隔離只給 AI 去背（bgRemover），並處理舊的全站隔離遷移（見 utils/siteIsolation/boot.ts）。
// 必須在任何程式之前、頁面解析時就執行，所以用行內 script（next/script 的 beforeInteractive 要等 Next 的程式載入後才執行）
const SITE_ISOLATION_SCRIPT = `(${siteIsolationBoot.toString()})(window);`;

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

// 將 metadata 移動到一個單獨的 server 組件中
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
        <script
          id="site-isolation"
          dangerouslySetInnerHTML={{ __html: SITE_ISOLATION_SCRIPT }}
        />
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
        <ClientRoot>{children}</ClientRoot>
        {/* 全站浮動聊天組件 */}
        <ChatWidget />
      </body>
    </html>
  );
}
