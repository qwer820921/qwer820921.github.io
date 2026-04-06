import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import TowerDefenseGame from "./components/TowerDefenseGame";

// 抓取 towerDefense 頁面的 SEO 設定
const seo = seoMap[ROUTES.TOWER_DEFENSE];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.TOWER_DEFENSE}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/maple/img04.webp",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/maple/img04.webp"],
  },
};

export default function Page() {
  return <TowerDefenseGame />;
}
