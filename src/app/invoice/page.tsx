import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import InvoicePage from "./components/InvoicePage";

// 抓取發票對獎頁面的 SEO 設定
const seo = seoMap[ROUTES.INVOICE];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.INVOICE}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/img07.jpg",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/img07.jpg"],
  },
};

export default function Page() {
  return <InvoicePage />;
}
