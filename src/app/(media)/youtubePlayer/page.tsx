import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
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
        url: "https://qwer820921.github.io/images/img16.jpg",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img16.jpg"],
  },
};

export default function Page() {
  return <YouTubePlayerPage />;
}
