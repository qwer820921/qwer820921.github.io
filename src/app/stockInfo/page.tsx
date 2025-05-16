import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import StockInfoPage from "./components/stockInfoPage";

// 抓取 stockInfo 頁面的 SEO 設定
const seo = seoMap[ROUTES.STOCK_INFO];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.STOCK_INFO}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/img12.jpg", // 建議你放一張代表股票資訊頁的 OG 圖
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img12.jpg"],
  },
};

export default function Page() {
  return <StockInfoPage />;
}
