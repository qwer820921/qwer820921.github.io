import { getSortedPostsData } from "@/app/(general)/blog/services/blogService";
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import HomePageContent from "./HomePageContent";

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
  // 在 Server Component 中獲取數據
  const allPosts = getSortedPostsData();
  const latestPosts = allPosts.slice(0, 3);

  return <HomePageContent latestPosts={latestPosts} />;
}
