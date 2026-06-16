import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
import ClickAscensionPage from "./components/ClickAscensionGame";

// 抓取 CLICK_ASCENSION 頁面的 SEO 設定
const seo = seoMap[ROUTES.CLICK_ASCENSION];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.CLICK_ASCENSION}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/maple/img07.webp",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/maple/img07.webp"],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="Click Ascension — 點擊飛昇"
        description={
          <p>
            Tap into the Void.
            從微小存在到掌控虛空的無限進化旅程，不斷點擊積累力量，解鎖升級與技能，挑戰更高層次的飛昇境界。
          </p>
        }
      />
      <ClickAscensionPage />
    </>
  );
}
