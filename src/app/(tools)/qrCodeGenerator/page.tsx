import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import { QrCodeGeneratorPage } from "./components/qrCodeGeneratorPage";
import PageInfoButton from "@/components/PageInfoButton";

const seo = seoMap[ROUTES.QR_CODE_GENERATOR];

export const metadata = {
  title: seo.title,
  description: seo.description,
  keywords: seo.keywords,
  openGraph: {
    title: seo.title,
    description: seo.description,
    url: `https://qwer820921.github.io${ROUTES.QR_CODE_GENERATOR}`,
    images: [
      {
        url: "https://qwer820921.github.io/images/icon/tools_icon.webp",
        width: 1200,
        height: 630,
        alt: seo.title,
      },
    ],
  },
  twitter: {
    title: seo.title,
    description: seo.description,
    images: ["https://qwer820921.github.io/images/icon/tools_icon.webp"],
  },
};

export default function Page() {
  return (
    <>
      <PageInfoButton
        title="QR Code 產生器"
        description={
          <p>
            免費線上 QR Code
            產生工具，支援網址、文字、聯絡資訊等多種內容，可自訂顏色、背景 GIF
            融合與動態追蹤碼。完全在瀏覽器中運作，即時產生、一鍵下載 PNG。
          </p>
        }
      />
      <QrCodeGeneratorPage />
    </>
  );
}
