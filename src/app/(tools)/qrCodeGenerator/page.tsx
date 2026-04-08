import { ROUTES } from "@/constants/routes";
import { seoMap } from "@/constants/seoMap";
import { QrCodeGeneratorPage } from "./components/qrCodeGeneratorPage";

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
  return <QrCodeGeneratorPage />;
}
