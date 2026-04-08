import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import BobaSurvivorsPage from "./components/bobaSurvivorsPage";

// 抓取頁面的 SEO 設定
const seo = seoMap[ROUTES.BOBA_SURVIVORS];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.BOBA_SURVIVORS}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/img11.jpg", // TODO: 換成實際的遊戲截圖
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img11.jpg"], // TODO: 換成實際的遊戲截圖
  },
};

export default function Page() {
  return <BobaSurvivorsPage />;
}
