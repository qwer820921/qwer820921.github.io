import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import NovelsPage from "./components/NovelPage";

// 抓取萬事屋藏書閣頁面的 SEO 設定
const seo = seoMap[ROUTES.NOVELS];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.NOVELS}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/img14.jpg",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img14.jpg"],
  },
};

export default function Page() {
  return <NovelsPage />;
}