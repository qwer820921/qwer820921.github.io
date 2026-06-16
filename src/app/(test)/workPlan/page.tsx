import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import WorkPlanPage from "./components/workPlanPage";

// 抓取頁面的 SEO 設定
const seo = seoMap[ROUTES.WORK_PLAN];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  robots: { index: false, follow: false },
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.WORK_PLAN}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/img11.jpg",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img11.jpg"],
  },
};

export default function Page() {
  return <WorkPlanPage />;
}
