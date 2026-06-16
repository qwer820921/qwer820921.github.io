import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
import CryptoPage from "./components/cryptoPage";

// 抓取 Crypto 頁面的 SEO 設定
const seo = seoMap[ROUTES.CRYPTO];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.CRYPTO}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/maple/img08.webp",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/maple/img08.webp"],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="加密貨幣資訊"
        description={
          <p>
            查看即時加密貨幣市場數據與價格走勢，包含市值排名與 24
            小時漲跌幅。加密貨幣市場波動極大，本工具僅供資訊參考，投資請謹慎評估風險。
          </p>
        }
      />
      <CryptoPage />
    </>
  );
}
