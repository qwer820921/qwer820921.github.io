import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
import AnimatorPage from "./components/animatorPage";

// 正確抓取 animator 對應的 SEO 資訊
const seo = seoMap[ROUTES.ANIMATOR];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.ANIMATOR}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/maple/img09.webp",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/maple/img09.webp"],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="微動畫展示"
        description={
          <p>
            探索以 CSS 與 JavaScript
            打造的創意微動畫作品，展示流暢的視覺效果與互動設計，每一個動畫都是前端技術的具體實踐。
          </p>
        }
      />
      <AnimatorPage />
    </>
  );
}
