import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
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
        url: "https://qwer820921.github.io/images/maple/img14.webp",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/maple/img14.webp"],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="萬事屋藏書閣"
        description={
          <p>
            提供海量小說免費線上閱讀，支援繁體中文，涵蓋玄幻、武俠、都市、言情等多種題材，隨時隨地沉浸在精彩故事中。
          </p>
        }
      />
      <NovelsPage />
    </>
  );
}
