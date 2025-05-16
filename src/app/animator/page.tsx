import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import AnimatorPage from "./components/animatorPage";

// 正確抓取 animator 對應的 SEO 資訊
const seo = seoMap[ROUTES.ANIMATOR];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.ANIMATOR}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/img09.jpg", // ✅ 請確認這張圖存在
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img09.jpg"],
  },
};

export default function Page() {
  return <AnimatorPage />;
}
