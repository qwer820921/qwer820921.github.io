import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import CryptoPage from "./components/cryptoPage";

// 抓取 Crypto 頁面的 SEO 設定
const seo = seoMap[ROUTES.CRYPTO];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.CRYPTO}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/img08.jpg",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img08.jpg"],
  },
};

export default function Page() {
  return <CryptoPage />;
}
