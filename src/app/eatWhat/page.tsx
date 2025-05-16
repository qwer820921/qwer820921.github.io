import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import EatWhatPage from "./components/eatWhatPage";

// 抓取 eatWhat 頁面的 SEO 設定
const seo = seoMap[ROUTES.EATWHAT];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.EATWHAT}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/img03.jp", // 確保你有這張圖
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img03.jp"],
  },
};

export default function Page() {
  return <EatWhatPage />;
}
