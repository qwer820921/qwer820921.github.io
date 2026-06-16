import WaterColorSortPage from "./components/WaterColorSortPage";
import { Metadata } from "next";
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";

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
  return (
    <>
      <PageInfoButton
        title="水彩分類"
        description={
          <p>
            將試管中的繽紛液體完美歸類！隨關卡漸進的色彩分類難題，搭配流暢動畫與求救空管機制，極致舒壓的益智遊戲體驗，無限關卡等待你來挑戰。
          </p>
        }
      />
      <WaterColorSortPage />
    </>
  );
}
