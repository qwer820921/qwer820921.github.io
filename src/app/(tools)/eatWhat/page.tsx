import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
import EatWhatPage from "./components/eatWhatPage";

// 抓取 eatWhat 頁面的 SEO 設定
const seo = seoMap[ROUTES.EATWHAT];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.EATWHAT}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/maple/img03.webp",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/maple/img03.webp"],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="今天吃什麼？"
        description={
          <p>
            每天面對「今天吃什麼」的選擇困難嗎？點擊隨機取得美食建議，從家常小菜到異國料理，幫你快速做出用餐決定！
          </p>
        }
      />
      <EatWhatPage />
    </>
  );
}
