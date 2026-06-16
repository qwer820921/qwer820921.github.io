import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
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
  return (
    <>
      <PageInfoButton
        title="塔防守衛戰"
        description={
          <p>
            建造防禦塔、升級武器、抵禦敵人一波波入侵！多種塔類型策略搭配，豐富關卡設計，考驗你的戰術部署與即時反應能力。
          </p>
        }
      />
      <TowerDefenseGame />
    </>
  );
}
