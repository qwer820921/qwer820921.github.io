import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import InvoicePage from "./components/InvoicePage";
import PageInfoButton from "@/components/PageInfoButton";

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
        url: "https://qwer820921.github.io/images/maple/img07.webp",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/maple/img07.webp"],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="統一發票對獎"
        description={
          <p>
            台灣統一發票每兩個月開獎一次，從特別獎 1,000 萬元到六獎 200
            元不等。輸入八位數發票號碼，系統自動比對當期最新中獎號碼，支援同時輸入多張發票，一次完成對獎。
          </p>
        }
      />
      <InvoicePage />
    </>
  );
}
