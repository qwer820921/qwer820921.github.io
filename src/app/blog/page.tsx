import { getSortedPostsData } from "@/app/blog/services/blogService";
import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import BlogPage from "./components/blogPage";

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
        url: "https://qwer820921.github.io/images/img16.jpg",
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
    images: ["https://qwer820921.github.io/images/img16.jpg"],
  },
};

export default function BlogIndex() {
  const allPostsData = getSortedPostsData();

  return <BlogPage posts={allPostsData} />;
}
