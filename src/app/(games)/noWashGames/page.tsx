import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
import NoWashGamesPage from "./components/NoWashGamesPage";

// 抓取 NO_WASH_GAMES 頁面的 SEO 設定
const seo = seoMap[ROUTES.NO_WASH_GAMES];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.NO_WASH_GAMES}`,
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
        title="免洗遊戲"
        description={
          <p>
            精選多款免洗小遊戲，隨時隨地輕鬆玩樂，不需要安裝或登入，打開瀏覽器即可開始，打發時間的最佳選擇！
          </p>
        }
      />
      <NoWashGamesPage />
    </>
  );
}
