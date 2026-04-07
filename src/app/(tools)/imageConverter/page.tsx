import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import ImageConverterPage from "./components/imageConverterPage";

// 抓取圖檔轉檔頁面的 SEO 設定
const seo = seoMap[ROUTES.IMAGE_CONVERTER];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.IMAGE_CONVERTER}`,
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
  return <ImageConverterPage />;
}
