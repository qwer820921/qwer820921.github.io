import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import BgRemoverPage from "./components/bgRemoverPage";
import PageInfoButton from "@/components/PageInfoButton";

const seo = seoMap[ROUTES.BG_REMOVER];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.BG_REMOVER}`,
    images: [
      {
        url: "https://qwer820921.github.io/logo512.png",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/logo512.png"],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="AI 圖片去背"
        description={
          <p>
            使用 AI 模型自動辨識主體與背景，一鍵去除背景並生成透明底
            PNG。所有圖片處理皆在瀏覽器本地執行，不會上傳至任何伺服器。支援
            JPG、PNG、WebP 等常見格式。
          </p>
        }
      />
      <BgRemoverPage />
    </>
  );
}
