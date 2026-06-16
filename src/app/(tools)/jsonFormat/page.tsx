import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import PageInfoButton from "@/components/PageInfoButton";
import JsonFormatPage from "./components/jsonFormatPage";

const seo = seoMap[ROUTES.JSON_FORMAT];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.JSON_FORMAT}`,
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
  return (
    <>
      <PageInfoButton
        title="JSON 格式化工具"
        description={
          <p>
            免費線上 JSON
            格式化、美化與壓縮工具，支援語法錯誤提示與一鍵複製功能，讓開發者處理
            JSON 資料更有效率。純前端執行，資料不會離開你的瀏覽器。
          </p>
        }
      />
      <JsonFormatPage />
    </>
  );
}
