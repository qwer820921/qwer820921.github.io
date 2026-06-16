import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
import YouTubePlayerPage from "./components/youtubePlayerPage";

// 抓取 YouTube Player 頁面的 SEO 設定
const seo = seoMap[ROUTES.YT_PLAYER];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.YT_PLAYER}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/maple/img16.webp",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/maple/img16.webp"],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="YouTube 音樂播放器"
        description={
          <p>
            線上播放與管理 YouTube
            音樂清單，支援播放佇列、自動切歌與歌詞顯示。直接輸入 YouTube
            連結或搜尋關鍵字加入播放清單，打造個人化音樂體驗。
          </p>
        }
      />
      <YouTubePlayerPage />
    </>
  );
}
