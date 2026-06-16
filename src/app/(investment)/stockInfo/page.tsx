import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
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
        url: "https://qwer820921.github.io/images/maple/img12.webp",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/maple/img12.webp"],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="台股資訊"
        description={
          <p>
            查詢台灣上市上市即時股價、K線圖與基本面資訊，支援自選股管理。本工具僅供資訊參考，不構成任何投資建議，投資請自行評估風險。
          </p>
        }
      />
      <StockInfoPage />
    </>
  );
}
