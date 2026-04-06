import WaterColorSortPage from "./components/WaterColorSortPage";
import { Metadata } from "next";
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";

// 抓取 WATER_COLOR_SORT 頁面的 SEO 設定 (與 noWashGames 模式一致)
const seo = seoMap[ROUTES.WATER_COLOR_SORT];

export const metadata: Metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.WATER_COLOR_SORT}`,
    images: [{ url: "https://qwer820921.github.io/images/maple/img14.webp" }],
  },
};

export default function Page() {
  return <WaterColorSortPage />;
}
