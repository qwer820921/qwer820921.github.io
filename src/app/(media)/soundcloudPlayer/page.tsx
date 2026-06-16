import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
import SoundCloudPlayerPage from "./components/soundcloudPlayerPage";

// 抓取 SoundCloud Player 頁面的 SEO 設定
const seo = seoMap[ROUTES.SOUNDCLOUD_PLAYER];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.SOUNDCLOUD_PLAYER}`,
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
        title="SoundCloud 播放器"
        description={
          <p>
            搜尋並播放 SoundCloud
            上的音樂，支援播放清單管理與多首歌曲自動切換。探索獨立音樂人的創作，輕鬆建立你的線上音樂佇列。
          </p>
        }
      />
      <SoundCloudPlayerPage />
    </>
  );
}
