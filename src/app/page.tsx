import { getSortedPostsData } from "@/app/(general)/blog/services/blogService";
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import HomePageContent from "./HomePageContent";
import PageInfoButton from "@/components/PageInfoButton";

const seo = seoMap[ROUTES.HOME];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.HOME}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/maple/img11.webp",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
    type: "website",
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/maple/img11.webp"],
  },
};

export default function HomePage() {
  const allPosts = getSortedPostsData();
  const latestPosts = allPosts.slice(0, 3);

  return (
    <>
      <PageInfoButton
        title="關於子yee 萬事屋"
        description={
          <>
            <p style={{ marginBottom: "0.5rem" }}>
              結合技術部落格與實用工具的個人網站，涵蓋 AI
              應用開發、前端架構設計、資安實踐等深度文章，以及台股資訊、AI
              去背、發票對獎等生活工具，另有數獨、2048、塔防、神馬三國等多款瀏覽器小遊戲。
            </p>
            <p>
              所有工具均在瀏覽器本地端運行，無需安裝、無需帳號，歡迎透過上方導覽列探索各項功能。
            </p>
          </>
        }
      />
      <HomePageContent latestPosts={latestPosts} />
    </>
  );
}
