import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
import SinglePageContent from "./components/SinglePageContent";

const seo = seoMap[ROUTES.SHENMA_SANGUO];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.SHENMA_SANGUO}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/img11.jpg",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img11.jpg"],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="神馬三國"
        description={
          <p>
            以三國為舞台的策略塔防遊戲！招募關羽、趙雲等武將守護陣地，部署防禦塔抵擋敵軍波次，在亂世中以智謀取勝。
          </p>
        }
      />
      <SinglePageContent />
    </>
  );
}
