import { getSortedPostsData } from "@/app/(general)/blog/services/blogService";
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import BlogPage from "./components/blogPage";
import PageInfoButton from "@/components/PageInfoButton";

const seo = seoMap[ROUTES.BLOG];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.BLOG}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/maple/img16.webp",
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
    images: ["https://qwer820921.github.io/images/maple/img16.webp"],
  },
};

export default function BlogIndex() {
  const allPostsData = getSortedPostsData();

  return (
    <>
      <PageInfoButton
        title="技術部落格"
        description={
          <p>
            記錄 AI
            應用開發、前端架構設計、資安實踐等技術心得，每篇文章附有實際踩坑經驗與個人觀點，目前共{" "}
            {allPostsData.length} 篇。可透過下方搜尋或標籤篩選感興趣的文章。
          </p>
        }
      />
      <BlogPage posts={allPostsData} />
    </>
  );
}
